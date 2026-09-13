import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen

SRC = '/Users/kevinliu/repos/Turboslide/packages/fonts/assets/InterVariable.woff2'
OUT = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type3'
font = TTFont(SRC)
font.flavor = None
axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in font['fvar'].axes}
print('axes', axes)
inst = instancer.instantiateVariableFont(font, {'opsz': 32, 'wght': 500}, inplace=False)
inst.save(f'{OUT}/InterDisplay-Medium-static.ttf')
upm = inst['head'].unitsPerEm
os2 = inst['OS/2']
hhea = inst['hhea']
cmap = inst.getBestCmap()
gs = inst.getGlyphSet()
info = {'upm': upm, 'capHeight': os2.sCapHeight, 'xHeight': os2.sxHeight, 'ascender': hhea.ascent, 'descender': hhea.descent, 'glyphs': {}}
# apply cv11 (single storey a) and ss01 is irrelevant for our letters; use default glyphs
for ch in 'Turboslide':
    gname = cmap[ord(ch)]
    g = gs[gname]
    pen = SVGPathPen(gs)
    g.draw(pen)
    bp = BoundsPen(gs)
    g.draw(bp)
    info['glyphs'][ch] = {'name': gname, 'advance': g.width, 'bounds': bp.bounds, 'd': pen.getCommands()}
# Measure the T: stem width at mid cap height, crossbar thickness at stem x, arm length.
from fontTools.pens.recordingPen import DecomposingRecordingPen
T = gs[cmap[ord('T')]]
# rasterize T to a grid to measure via scanline: use a simple polygon fill via matplotlib-free approach: sample points with even-odd rule using fontTools' pointInsidePen
from fontTools.pens.pointInsidePen import PointInsidePen
def inside(x, y):
    p = PointInsidePen(gs, (x, y), evenOdd=False)
    T.draw(p)
    return p.getResult()
xmin, ymin, xmax, ymax = info['glyphs']['T']['bounds']
cap = os2.sCapHeight
# stem width at y = cap*0.4
y = cap * 0.4
xs = [x for x in range(int(xmin), int(xmax)+1, 2) if inside(x, y)]
stem = (min(xs), max(xs)) if xs else None
# crossbar thickness at x = mid stem
mid = (stem[0]+stem[1])/2
ys = [yy for yy in range(int(ymin), int(ymax)+1, 2) if inside(mid, yy)]
# crossbar: the topmost contiguous run
ys_sorted = sorted(ys, reverse=True)
run_top = ys_sorted[0]
run_bottom = run_top
for yy in ys_sorted[1:]:
    if yy == run_bottom - 2:
        run_bottom = yy
    else:
        break
# arm thickness measured away from the stem at x = xmin + 40
ys_arm = [yy for yy in range(int(ymin), int(ymax)+1, 1) if inside(xmin + 30, yy)]
info['T_measure'] = {
    'bounds': [xmin, ymin, xmax, ymax],
    'width': xmax - xmin,
    'cap': cap,
    'stem_x': stem, 'stem_w': stem[1]-stem[0]+2,
    'crossbar_run_at_stem': [run_bottom, run_top],
    'arm_thickness': (max(ys_arm)-min(ys_arm)+1) if ys_arm else None,
    'arm_y': [min(ys_arm), max(ys_arm)] if ys_arm else None,
}
json.dump(info, open(f'{OUT}/inter-display-medium.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in info.items() if k != 'glyphs'}, indent=1))
for ch, g in info['glyphs'].items():
    print(ch, g['name'], 'adv', g['advance'], 'bounds', g['bounds'], 'dlen', len(g['d']))

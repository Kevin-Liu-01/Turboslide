# Outline the word "Turboslide" from the repository's InterVariable at wght 500, opsz 32, with
# Inter's own GPOS pair kerning applied, as SVG path data. No features are needed: the word has
# no a and no digit, so cv11 and ss01 change nothing (research-4 report 01, section 1.3).
import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

SRC = '/Users/kevinliu/repos/Turboslide/packages/fonts/assets/InterVariable.woff2'
WORD = 'Turboslide'
WGHT = float(sys.argv[1]) if len(sys.argv) > 1 else 500.0
TRACK = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
OPSZ = float(sys.argv[2]) if len(sys.argv) > 2 else 32.0
f = TTFont(SRC)
f = instancer.instantiateVariableFont(f, {'wght': WGHT, 'opsz': OPSZ}, inplace=False)
upm = f['head'].unitsPerEm
cmap = f.getBestCmap()
glyphs = [cmap[ord(ch)] for ch in WORD]
hmtx = f['hmtx']
gs = f.getGlyphSet()

# pair kerning from GPOS PairPos lookups (format 1 and 2), the first matching adjustment wins
def kern_pairs(font):
    out = {}
    gpos = font['GPOS'].table
    kern_lookups = set()
    for feat in gpos.FeatureList.FeatureRecord:
        if feat.FeatureTag == 'kern':
            kern_lookups.update(feat.Feature.LookupListIndex)
    def visit(sub):
        if sub.LookupType == 9:  # extension
            return visit(sub.ExtSubTable)
        if sub.LookupType != 2:
            return
        cov = sub.Coverage.glyphs
        if sub.Format == 1:
            for g1, ps in zip(cov, sub.PairSet):
                for pv in ps.PairValueRecord:
                    v = pv.Value1.XAdvance if pv.Value1 and hasattr(pv.Value1, 'XAdvance') else 0
                    out.setdefault((g1, pv.SecondGlyph), v)
        elif sub.Format == 2:
            c1 = sub.ClassDef1.classDefs
            c2 = sub.ClassDef2.classDefs
            for g1 in cov:
                k1 = c1.get(g1, 0)
                for g2 in font.getGlyphOrder():
                    k2 = c2.get(g2, 0)
                    rec = sub.Class1Record[k1].Class2Record[k2]
                    v = rec.Value1.XAdvance if rec.Value1 and hasattr(rec.Value1, 'XAdvance') else 0
                    if v:
                        out.setdefault((g1, g2), v)
    for i in sorted(kern_lookups):
        for sub in gpos.LookupList.Lookup[i].SubTable:
            visit(sub)
    return out

kerns = kern_pairs(f)
x = 0
paths = []
advances = []
for i, g in enumerate(glyphs):
    pen = SVGPathPen(gs)
    tpen = TransformPen(pen, (1, 0, 0, -1, x, 0))  # y up to y down, baseline at 0
    gs[g].draw(tpen)
    d = pen.getCommands()
    paths.append(d)
    adv = hmtx[g][0]
    k = kerns.get((g, glyphs[i + 1]), 0) if i + 1 < len(glyphs) else 0
    advances.append({'glyph': g, 'advance': adv, 'kern': k})
    x += adv + k + TRACK
total = x
os2 = f['OS/2']
out = {
    'upm': upm, 'wght': WGHT, 'opsz': OPSZ,
    'capHeight': os2.sCapHeight, 'xHeight': os2.sxHeight,
    'ascender': f['hhea'].ascent, 'descender': f['hhea'].descent,
    'width': total, 'track': TRACK, 'glyphs': advances, 'd': ' '.join(paths),
}
json.dump(out, open('wordmark.json', 'w'))
print(json.dumps({k: v for k, v in out.items() if k != 'd'}, indent=1)[:1500])

# Scratch raster of the sheet's monogram at a 16 px cap against two hinted variants.
# Coverage by 16x supersampling and box downsampling; ink and paper from the sheet's tokens.
import math
from PIL import Image, ImageDraw, ImageFont
T = math.tan(math.radians(12))
SS = 16
def rects(mid, cut):
    # mid: (top, bottom) of the middle bar; cut: (top, bottom), both in upright units
    return [
        (22, 40, 134, 30),            # crossbar
        (72, 40, 34, 120),            # stem
        (0, 40, 24, 30),              # top bar
        (-4, mid[0], 64, mid[1] - mid[0]),  # middle bar
        (16, 130, 44, 30),            # bottom bar
    ], cut
def pieces(rs, cut):
    out = []
    for (x, y, w, h) in rs:
        spans = [(y, min(y + h, cut[0])), (max(y, cut[1]), y + h)]
        for (a, b) in spans:
            if b > a:
                out.append([(x - T * a, a), (x + w - T * a, a), (x + w - T * b, b), (x - T * b, b)])
    return out
VARIANTS = {
    'The sheet\'s placement': rects((82, 118), (96, 104)),
    'Hinted, cut 0.5 px high': rects((77.5, 115), (92.5, 100)),
    'Hinted, cut 0.5 px low': rects((85, 122.5), (100, 107.5)),
}
def render(variant, box=24, fg=(7, 7, 7), bg=(255, 255, 255)):
    rs, cut = VARIANTS[variant]
    k = 16 / 120
    minx = -4 - T * 118 if variant == 'The sheet\'s placement' else min(p[0] for poly in pieces(rs, cut) for p in poly)
    w = 176.58 * k
    ox = (box - w) / 2 - minx * k
    oy = 4 - 40 * k
    big = Image.new('L', (box * SS, box * SS), 0)
    d = ImageDraw.Draw(big)
    for poly in pieces(rs, cut):
        d.polygon([((px * k + ox) * SS, (py * k + oy) * SS) for (px, py) in poly], fill=255)
    cov = big.resize((box, box), Image.BOX)
    im = Image.new('RGB', (box, box), bg)
    im.paste(Image.new('RGB', (box, box), fg), (0, 0), cov)
    return im
font = None
try:
    font = ImageFont.truetype('./inter-400.ttf', 15)
except Exception:
    font = ImageFont.load_default()
names = list(VARIANTS)
W, H = 1200, 560
sheet = Image.new('RGB', (W, H), (255, 255, 255))
dr = ImageDraw.Draw(sheet)
dark = Image.new('RGB', (W // 2, H), (7, 7, 7))
sheet.paste(dark, (W // 2, 0))
for half, (fg, bg, txt) in enumerate([((7, 7, 7), (255, 255, 255), (58, 61, 68)), ((242, 242, 240), (7, 7, 7), (185, 188, 195))]):
    x0 = half * (W // 2) + 30
    for i, n in enumerate(names):
        y0 = 30 + i * 175
        im = render(n, fg=fg, bg=bg)
        sheet.paste(im, (x0, y0 + 40))
        sheet.paste(im.resize((24 * 8, 24 * 8), Image.NEAREST), (x0 + 60, y0 - 10))
        dr.text((x0 + 270, y0 + 40), n, fill=txt, font=font)
        dr.text((x0 + 270, y0 + 62), '16 px cap, 1x and 8x', fill=txt, font=font)
out = './sheet-judge-16cap.png'
sheet.save(out, optimize=True)
# calibration: the sheet variant against the editor picture's own home link pixels
ed = Image.open('/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/round1/sheet/pictures/editor-1440-light.png').convert('L').crop((10, 6, 42, 38))
sim = render('The sheet\'s placement').convert('L')
def rowprofile(img):
    w, h = img.size
    px = img.load()
    return [sum(255 - px[x, y] for x in range(w)) // 255 for y in range(h)]
print('editor picture rows (ink sum per row):', rowprofile(ed))
print('scratch sheet variant rows:          ', rowprofile(sim))
for n in names:
    g = render(n).convert('L'); px = g.load()
    grey = sum(1 for x in range(24) for y in range(24) if 40 < px[x, y] < 215)
    print(n, 'partial pixels (40..215):', grey)

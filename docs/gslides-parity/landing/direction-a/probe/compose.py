import json, sys, io, os
from PIL import Image, ImageDraw, ImageFont
FR = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/dira/frames'
SHOTS = '/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/shots'
FONT = '/Users/kevinliu/repos/Turboslide-landing/packages/fonts/export/GTInterDisplay-Regular.ttf'
def wrap(draw, text, font, width):
    words = text.split(' '); lines = []; cur = ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) > width and cur:
            lines.append(cur); cur = w
        else: cur = t
    if cur: lines.append(cur)
    return lines
def compose(name, fw, cols=None):
    m = json.load(open(f'{FR}/{name}.json'))
    clipf = f'{FR}/{name}.clip.json'
    clip = json.load(open(clipf)) if os.path.exists(clipf) else None
    imgs = []
    for f in m['frames']:
        im = Image.open(f['file']).convert('RGB')
        if clip: im = im.crop((clip['x'], clip['y'], clip['x'] + clip['width'], clip['y'] + clip['height']))
        r = fw / im.width
        im = im.resize((fw, round(im.height * r)), Image.LANCZOS)
        imgs.append((im, f['label']))
    n = len(imgs); cols = cols or n; rows = (n + cols - 1) // cols
    gap = 14; pad = 20
    fl = ImageFont.truetype(FONT, 15); ft = ImageFont.truetype(FONT, 17)
    fh = max(i.height for i, _ in imgs)
    W = pad * 2 + cols * fw + (cols - 1) * gap
    tmp = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    tlines = wrap(tmp, m['title'], ft, W - pad * 2)
    lab_lines = max(len(wrap(tmp, l, fl, fw)) for _, l in imgs)
    cellh = fh + 8 + lab_lines * 20
    H = pad + len(tlines) * 24 + 12 + rows * cellh + (rows - 1) * gap + pad
    out = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(out)
    y = pad
    for l in tlines: d.text((pad, y), l, font=ft, fill=(7, 7, 7)); y += 24
    y += 12
    for k, (im, lab) in enumerate(imgs):
        c, r = k % cols, k // cols
        x0 = pad + c * (fw + gap); y0 = y + r * (cellh + gap)
        out.paste(im, (x0, y0))
        d.rectangle([x0 - 1, y0 - 1, x0 + im.width, y0 + im.height], outline=(200, 200, 200))
        for j, l in enumerate(wrap(d, lab, fl, fw)):
            d.text((x0, y0 + im.height + 6 + j * 20), l, font=fl, fill=(58, 61, 68))
    path = f'{SHOTS}/{name}.png'
    out.save(path, optimize=True)
    sz = os.path.getsize(path)
    if sz > 400_000:
        q = out.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q.save(path, optimize=True); sz = os.path.getsize(path)
    print(name, out.size, sz)
for arg in sys.argv[1:]:
    name, fw, *rest = arg.split(':')
    compose(name, int(fw), int(rest[0]) if rest else None)

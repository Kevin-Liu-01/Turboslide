# Tiles PNGs into one contact sheet: python3 sheet.py out.png scale cols file1 file2 ...
import sys
from PIL import Image, ImageDraw
out, scale, cols = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
files = sys.argv[4:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    ims.append((f.split('/')[-1], im))
cw = max(im.width for _, im in ims) + 12
rows = (len(ims) + cols - 1) // cols
heights = [max(im.height for _, im in ims[r*cols:(r+1)*cols]) + 30 for r in range(rows)]
sheet = Image.new('RGB', (cw * cols, sum(heights)), (200, 200, 200))
d = ImageDraw.Draw(sheet)
y = 0
for r in range(rows):
    for c, (name, im) in enumerate(ims[r*cols:(r+1)*cols]):
        x = c * cw
        d.text((x + 4, y + 2), name[:60], fill=(0, 0, 0))
        sheet.paste(im, (x + 6, y + 18))
    y += heights[r]
sheet.save(out)
print(out, sheet.size)

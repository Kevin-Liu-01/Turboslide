// Lane B1's sheet of the static identity files of a tree, for the pictures before and after the
// mark push: the favicon's three ICO entries at 1x and enlarged on Chrome's light and dark tab
// strip colours, icon.svg at 16 px, the touch icon, the manifest icons, the card, the README
// lockup and the CLI banner as the terminal prints it. Rasters are read with sharp; nothing is
// drawn by hand. No browser.
//
//   node docs/gslides-parity/round1/build/b1/assets.mjs <tree root> <label> <banner text file>
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const sharp = require('sharp');

const [root, label, bannerFile] = process.argv.slice(2);
const OUT = new URL('./', import.meta.url).pathname;
const pub = (p) => join(root, 'apps/studio/public', p);

/** The ICO's 32 bit entries decoded to raw RGBA (bottom up BGRA rows). */
function icoEntries(bytes) {
  const buf = Buffer.from(bytes);
  const count = buf.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16;
    const w = buf[o] || 256;
    const h = buf[o + 1] || 256;
    const start = buf.readUInt32LE(o + 12);
    const data = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const s = start + 40 + ((h - 1 - y) * w + x) * 4;
        const d = (y * w + x) * 4;
        data[d] = buf[s + 2];
        data[d + 1] = buf[s + 1];
        data[d + 2] = buf[s];
        data[d + 3] = buf[s + 3];
      }
    out.push({ w, h, data });
  }
  return out;
}

const W = 1440;
const parts = [];
const text = (x, y, s, size = 14, fill = '#3a3d44') =>
  parts.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${size + 8}"><text x="0" y="${size}" font-family="Inter, Helvetica, Arial" font-size="${size}" fill="${fill}">${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`,
    ),
    left: x,
    top: y,
  });

let y = 16;
text(16, y, `${label}: the favicon entries at 1x, then 8x, 6x and 4x, on Chrome's light (#dee1e6) and dark (#202124) tab strips; icon.svg at 16 px, 1x and 8x`);
y += 30;
const ico = icoEntries(readFileSync(pub('favicon.ico')));
for (const [ground, top] of [['#dee1e6', y], ['#202124', y + 210]]) {
  parts.push({ input: { create: { width: W, height: 200, channels: 4, background: ground } }, left: 0, top });
  let x = 16;
  for (const e of ico) {
    const raw = await sharp(e.data, { raw: { width: e.w, height: e.h, channels: 4 } }).png().toBuffer();
    parts.push({ input: raw, left: x, top: top + 8 });
    x += e.w + 12;
  }
  for (const e of ico) {
    const k = e.w === 16 ? 8 : e.w === 32 ? 6 : 4;
    const big = await sharp(e.data, { raw: { width: e.w, height: e.h, channels: 4 } })
      .resize(e.w * k, e.h * k, { kernel: 'nearest' })
      .png()
      .toBuffer();
    parts.push({ input: big, left: x, top: top + 4 });
    x += e.w * k + 16;
  }
  const svg = readFileSync(pub('icon.svg'));
  const one = await sharp(svg, { density: 72 }).resize(16, 16).png().toBuffer();
  parts.push({ input: one, left: x, top: top + 8 });
  const eight = await sharp(one).resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
  parts.push({ input: eight, left: x + 28, top: top + 4 });
}
y += 430;
text(16, y, 'the touch icon (180), icon-192, icon-mask-192, icon-dark-192 and icon-mono-512 at 192, at 1x');
y += 30;
{
  let x = 16;
  for (const p of ['apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-mask-192.png', 'icons/icon-dark-192.png', 'icons/icon-mono-512.png']) {
    if (!existsSync(pub(p))) continue;
    let img = sharp(pub(p));
    if (p.includes('mono')) img = img.resize(192, 192).flatten({ background: '#bbbbbb' });
    const b = await img.png().toBuffer();
    const m = await sharp(b).metadata();
    parts.push({ input: b, left: x, top: y });
    x += m.width + 16;
  }
}
y += 210;
text(16, y, 'the card (og/turboslide.png) at half size, and the README lockup (docs/readme/brand, the dark file GitHub shows by default) at half size');
y += 30;
{
  const card = await sharp(pub('og/turboslide.png')).resize(600, 315).png().toBuffer();
  parts.push({ input: card, left: 16, top: y });
  const lock = ['docs/readme/brand/lockup-dark.png', 'docs/readme/brand/lockup-stacked-dark.png']
    .map((p) => join(root, p))
    .find((p) => existsSync(p));
  if (lock) {
    const m = await sharp(lock).metadata();
    const b = await sharp(lock).resize(Math.round(m.width / 2)).png().toBuffer();
    parts.push({ input: b, left: 640, top: y });
  }
}
y += 335;
text(16, y, 'turboslide --version, as the terminal prints it');
y += 26;
{
  const lines = readFileSync(bannerFile, 'utf8').trimEnd().split('\n');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ /g, ' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W - 32}" height="${lines.length * 20 + 24}"><rect width="100%" height="100%" fill="#101010"/>${lines
    .map((l, i) => `<text x="12" y="${i * 20 + 26}" font-family="Menlo, monospace" font-size="16" fill="#e0e0e0" xml:space="preserve">${esc(l)}</text>`)
    .join('')}</svg>`;
  parts.push({ input: Buffer.from(svg), left: 16, top: y });
  y += lines.length * 20 + 40;
}
const file = `${OUT}${label}-assets.png`;
await sharp({ create: { width: W, height: y, channels: 4, background: '#ffffff' } })
  .composite(parts)
  .png({ compressionLevel: 9, palette: true, colors: 256 })
  .toFile(file);
console.log(file);

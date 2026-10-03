// strip from a list of files: { files: [[path, label]...], tile, out, title, clip? }
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const sharp = require('sharp');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tile = spec.tile ?? 320;
const m0 = await sharp(spec.files[0][0]).metadata();
const clip = spec.clip ?? { x: 0, y: 0, w: m0.width, h: m0.height };
const th = Math.round((clip.h / clip.w) * tile);
const labelH = 34, titleH = spec.title ? 36 : 0, gap = 6, pad = 10;
const n = spec.files.length;
const W = pad * 2 + n * tile + (n - 1) * gap, H = pad * 2 + titleH + th + labelH;
const comps = [];
for (let i = 0; i < n; i++) {
  const [f, lbl] = spec.files[i];
  const img = await sharp(f).extract({ left: clip.x, top: clip.y, width: clip.w, height: clip.h }).resize(tile, th).toBuffer();
  const left = pad + i * (tile + gap);
  comps.push({ input: img, left, top: pad + titleH });
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${labelH}"><text x="0" y="22" font-family="Inter, Helvetica, Arial" font-size="15" fill="#111">${lbl}</text></svg>`), left, top: pad + titleH + th });
}
if (spec.title) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W - pad * 2}" height="${titleH}"><text x="0" y="22" font-family="Inter, Helvetica, Arial" font-size="17" fill="#111">${spec.title.replace(/&/g, '&amp;')}</text></svg>`), left: pad, top: pad });
let q = 80, buf;
for (;;) { buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(comps).jpeg({ quality: q, mozjpeg: true }).toBuffer(); if (buf.length < 390 * 1024 || q <= 40) break; q -= 6; }
fs.writeFileSync(spec.out, buf);
console.log(spec.out, Math.round(buf.length / 1024) + ' KB q' + q);

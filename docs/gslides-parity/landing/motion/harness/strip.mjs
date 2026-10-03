// Frame strip: picks the screencast frame shown at each time after a phase trigger and sets
// them side by side with their times under them. usage: node strip.mjs <spec.json>
// spec: { report, phase, times: [ms...], clip?: {x,y,w,h}, tile?: 320, out, title }
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const sharp = require('sharp');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rep = JSON.parse(fs.readFileSync(spec.report, 'utf8'));
const ph = rep.phases.find((p) => p.name === spec.phase);
const fr = rep.frames.filter((f) => f.phase === spec.phase).sort((a, b) => a.t - b.t);
if (!fr.length) throw new Error('no frames');
const tile = spec.tile ?? 320;
const meta0 = await sharp(fr[0].file).metadata();
const clip = spec.clip ?? { x: 0, y: 0, w: meta0.width, h: meta0.height };
const th = Math.round((clip.h / clip.w) * tile);
const labelH = 34, titleH = spec.title ? 36 : 0, gap = 6, pad = 10;
const W = pad * 2 + spec.times.length * tile + (spec.times.length - 1) * gap;
const H = pad * 2 + titleH + th + labelH;
const comps = [];
const used = [];
if (spec.t0 === 'firstChange') {
  let prev = null; spec.t0 = null;
  for (const f of fr) {
    if (spec.after && f.t < spec.after) continue;
    const b = await sharp(f.file).extract({ left: clip.x, top: clip.y, width: clip.w, height: clip.h }).resize(96, 60, { fit: 'fill' }).greyscale().raw().toBuffer();
    if (prev) { let d = 0; for (let i = 0; i < b.length; i++) d += Math.abs(b[i] - prev[i]); if (d / b.length > (spec.threshold ?? 0.3)) { spec.t0 = prev.t; break; } }
    prev = b; prev.t = f.t;
  }
  console.log('firstChange at', spec.t0 - ph.trigger, 'ms real after trigger');
}
for (let i = 0; i < spec.times.length; i++) {
  const base = spec.t0 ?? (ph.trigger + (spec.offset ?? 0));
  const target = base + spec.times[i] / (spec.rate ?? 1);
  let pick = fr[0];
  for (const f of fr) { if (f.t <= target) pick = f; else break; }
  const gotMs = Math.round((pick.t - base) * (spec.rate ?? 1));
  used.push({ want: spec.times[i], got: gotMs });
  const img = await sharp(pick.file).extract({ left: clip.x, top: clip.y, width: Math.min(clip.w, meta0.width - clip.x), height: Math.min(clip.h, meta0.height - clip.y) }).resize(tile, th).toBuffer();
  const left = pad + i * (tile + gap);
  comps.push({ input: img, left, top: pad + titleH });
  const lbl = spec.labels?.[i] ?? `${spec.times[i]} ms`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${labelH}"><text x="0" y="22" font-family="Inter, Helvetica, Arial" font-size="15" fill="#111">${lbl}</text><text x="${tile}" y="22" text-anchor="end" font-family="Inter, Helvetica, Arial" font-size="12" fill="#777">frame ${gotMs} ms</text></svg>`;
  comps.push({ input: Buffer.from(svg), left, top: pad + titleH + th });
}
if (spec.title) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W - pad * 2}" height="${titleH}"><text x="0" y="22" font-family="Inter, Helvetica, Arial" font-size="17" fill="#111">${spec.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
  comps.push({ input: Buffer.from(svg), left: pad, top: pad });
}
let q = spec.quality ?? 78;
let buf;
for (;;) {
  buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(comps).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (buf.length < 390 * 1024 || q <= 40) break;
  q -= 6;
}
fs.writeFileSync(spec.out, buf);
console.log(spec.out, Math.round(buf.length / 1024) + ' KB', 'q', q, JSON.stringify(used));

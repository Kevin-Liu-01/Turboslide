// Rasterizes the sampled thesvg.org marks with sharp (librsvg), the rasterizer packages/export
// already depends on, to measure what a server route that turns a logo SVG into a PNG would meet:
// failures, timing, size, and how many default variants are invisible on paper or on ink.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const dir = 'corpus';
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.svg'))
  .sort();
const H = 96; // target height in px, a footer logo at 3x is 54 px, a title slot at 2x is 168 px
const out = {
  total: 0,
  failed: [],
  invisibleOnPaper: [],
  invisibleOnInk: [],
  usesCurrentColor: [],
  ms: [],
  bytes: [],
  tiles: [],
};
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
async function lit(png, ground) {
  // fraction of pixels that differ from the ground by more than 40 luminance steps
  const { data, info } = await png.raw().toBuffer({ resolveWithObject: true });
  let diff = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i += 1) {
    const a = data[i * 4 + 3] / 255;
    const r = data[i * 4] * a + ground * (1 - a),
      g = data[i * 4 + 1] * a + ground * (1 - a),
      b = data[i * 4 + 2] * a + ground * (1 - a);
    if (Math.abs(luminance(r, g, b) - ground) > 40) diff += 1;
  }
  return diff / n;
}
for (const f of files) {
  const svg = readFileSync(`${dir}/${f}`);
  const [slug, variant] = f.replace(/\.svg$/, '').split('--');
  out.total += 1;
  if (svg.includes('currentColor')) out.usesCurrentColor.push(f);
  const t0 = Date.now();
  try {
    const img = sharp(svg, { density: 300 }).resize({
      width: 100,
      height: 72,
      fit: 'inside',
      withoutEnlargement: false,
    });
    const buf = await img.png().toBuffer();
    out.ms.push(Date.now() - t0);
    out.bytes.push(buf.length);
    const onPaper = await lit(sharp(buf), 255);
    const onInk = await lit(sharp(buf), 0);
    if (variant === 'default') {
      if (onPaper < 0.002) out.invisibleOnPaper.push(f);
      if (onInk < 0.002) out.invisibleOnInk.push(f);
    }
    out.tiles.push({
      f,
      slug,
      variant,
      onPaper: Number(onPaper.toFixed(3)),
      onInk: Number(onInk.toFixed(3)),
      bytes: buf.length,
      buf,
    });
  } catch (error) {
    out.failed.push({ f, error: String(error).slice(0, 160) });
  }
}
// a contact sheet: 12 default marks on paper (top) and on ink (bottom), the white-fill cases first
const picks = [];
const invisible = out.tiles
  .filter((t) => t.variant === 'default' && out.invisibleOnPaper.includes(t.f))
  .slice(0, 4);
const named = [
  'vercel',
  'openai',
  'figma',
  'slack',
  'stripe',
  'salesforce',
  'hubspot',
  'notion',
  'google',
  'microsoft',
  'zoom',
  'github',
];
for (const n of named) {
  const t = out.tiles.find((x) => x.slug === n && x.variant === 'default');
  if (t) picks.push(t);
}
for (const t of invisible) if (!picks.includes(t)) picks.push(t);
const cell = 120,
  pad = 12,
  cols = Math.min(picks.length, 8),
  rowsN = Math.ceil(picks.length / cols);
const W = cols * cell + pad * 2,
  HH = rowsN * cell + pad * 2;
async function sheet(ground) {
  const comps = [];
  for (let i = 0; i < picks.length; i += 1) {
    const t = picks[i];
    const meta = await sharp(t.buf).metadata();
    const x = pad + (i % cols) * cell + Math.round((cell - meta.width) / 2),
      y = pad + Math.floor(i / cols) * cell + Math.round((cell - meta.height) / 2);
    comps.push({ input: t.buf, left: Math.max(0, x), top: Math.max(0, y) });
  }
  return sharp({ create: { width: W, height: HH, channels: 4, background: ground } })
    .composite(comps)
    .png()
    .toBuffer();
}
const paper = await sheet({ r: 255, g: 255, b: 255, alpha: 1 });
const ink = await sheet({ r: 7, g: 7, b: 7, alpha: 1 });
const both = await sharp({
  create: {
    width: W,
    height: HH * 2 + 8,
    channels: 4,
    background: { r: 128, g: 128, b: 128, alpha: 1 },
  },
})
  .composite([
    { input: paper, left: 0, top: 0 },
    { input: ink, left: 0, top: HH + 8 },
  ])
  .png()
  .toBuffer();
writeFileSync(
  '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/features/audit-logos/12-thesvg-default-marks-on-paper-and-ink.png',
  both,
);
const ms = out.ms.sort((a, b) => a - b),
  bytes = out.bytes.sort((a, b) => a - b);
const report = {
  total: out.total,
  rasterized: out.tiles.length,
  failed: out.failed,
  msMedian: ms[Math.floor(ms.length / 2)],
  msP95: ms[Math.floor(ms.length * 0.95)],
  msMax: ms[ms.length - 1],
  pngBytesMedian: bytes[Math.floor(bytes.length / 2)],
  pngBytesMax: bytes[bytes.length - 1],
  defaults: out.tiles.filter((t) => t.variant === 'default').length,
  invisibleOnPaper: out.invisibleOnPaper,
  invisibleOnInk: out.invisibleOnInk,
  usesCurrentColor: out.usesCurrentColor,
  picks: picks.map((t) => ({ slug: t.slug, onPaper: t.onPaper, onInk: t.onInk })),
};
writeFileSync('raster-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));

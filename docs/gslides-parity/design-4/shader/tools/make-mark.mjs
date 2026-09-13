// The Turboslide mark, generated: a 16:9 slide frame whose top edge is the crossbar of a T and
// whose stem divides the slide; the right panel carries the deck's dither ramp (rampInk of
// @turboslide/effects/ramp) from ink at the stem to paper at the frame. Geometry is snapped to
// device pixels per raster size (the pixel hinting of research-4 report 02 section 5).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const { rampInk } = await import('/Users/kevinliu/repos/Turboslide/packages/effects/src/ramp.ts');

const OUT = process.argv[2] ?? '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader';
const INK = '#070707', PAPER = '#ffffff', PAPER_INK = '#f2f2f0';
mkdirSync(`${OUT}/previews`, { recursive: true });
mkdirSync(`${OUT}/icons`, { recursive: true });

export function geometry(S) {
  const stroke = Math.max(1, Math.round(S / 32));
  const bar = 2 * Math.max(1, Math.round(S / 32));
  const cell = S >= 384 ? 8 : S >= 128 ? 4 : S >= 32 ? 2 : 0;
  const padMin = Math.max(1, Math.round(S / 16));
  let interior = Math.floor((S - 2 * padMin - 2 * stroke - bar) / 2);
  if (cell) interior = Math.floor(interior / cell) * cell;
  const W = 2 * interior + 2 * stroke + bar;
  const pad = Math.floor((S - W) / 2);
  const target = (W * 9) / 16;
  let inner = Math.round(target) - bar - stroke;
  if (cell) {
    const lo = Math.floor(inner / cell) * cell, hi = lo + cell;
    const dl = Math.abs(bar + lo + stroke - target), dh = Math.abs(bar + hi + stroke - target);
    inner = dh <= dl ? hi : lo;
  }
  const H = bar + inner + stroke;
  const y0 = Math.floor((S - H) / 2);
  return { S, stroke, bar, cell, pad, W, H, interior, inner, x0: pad, y0, stemX: pad + stroke + interior };
}

/** The lit cells of the right panel: column j from the stem, row i; rampInk with a one column offset so the stem keeps its edge. */
export function panelCells(g) {
  if (!g.cell) return [];
  const n = g.interior / g.cell, m = g.inner / g.cell;
  const out = [];
  for (let i = 0; i < m; i += 1) for (let j = 0; j < n; j += 1) if (rampInk(j + 1, i, n + 1)) out.push([j, i]);
  return out;
}

/** The mark's shapes as SVG in a unit space where 1 unit = 1 px at size S (divide by `k` to rescale). */
export function markShapes(g, k = 1) {
  const r = (x, y, w, h) => `<rect x="${x / k}" y="${y / k}" width="${w / k}" height="${h / k}"/>`;
  const parts = [
    r(g.x0, g.y0, g.W, g.bar), // the crossbar, the frame's top edge
    r(g.x0, g.y0 + g.bar, g.stroke, g.H - g.bar), // left
    r(g.x0 + g.W - g.stroke, g.y0 + g.bar, g.stroke, g.H - g.bar), // right
    r(g.x0, g.y0 + g.H - g.stroke, g.W, g.stroke), // bottom
    r(g.stemX, g.y0 + g.bar, g.bar, g.inner), // the stem
  ];
  const cells = panelCells(g);
  if (cells.length) {
    const px = g.stemX + g.bar, py = g.y0 + g.bar, c = g.cell / k;
    const d = cells.map(([j, i]) => `M${(px + j * g.cell) / k} ${(py + i * g.cell) / k}h${c}v${c}h${-c}z`).join('');
    parts.push(`<path d="${d}"/>`);
  }
  return parts.join('\n    ');
}

export function markSvg(S, { plate = null, ink = 'currentColor', fit = 1, id = null, viewBoxUnits = null } = {}) {
  const inner = Math.round(S * fit);
  const g = geometry(inner);
  const off = Math.round((S - inner) / 2);
  const shifted = { ...g, x0: g.x0 + off, y0: g.y0 + off, stemX: g.stemX + off };
  const units = viewBoxUnits ?? S;
  const k = S / units;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${units} ${units}" width="${S}" height="${S}" shape-rendering="crispEdges" role="img" aria-label="Turboslide">`;
  const plateRect = plate ? `<rect width="${units}" height="${units}" fill="${plate}"/>\n  ` : '';
  return `${head}\n  ${plateRect}<g fill="${ink}"${id ? ` id="${id}"` : ''}>\n    ${markShapes(shifted, k)}\n  </g>\n</svg>\n`;
}

const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = [];
async function writePng(path, svg, opts = {}) {
  let img = sharp(Buffer.from(svg));
  if (opts.palette) img = img.png({ palette: true, colours: opts.colours ?? 4 });
  else img = img.png();
  const buf = await img.toBuffer();
  writeFileSync(path, buf);
  manifest.push({ path: path.replace(OUT + '/', ''), bytes: buf.length, sha256: sha(buf) });
  return buf;
}

// 1. The three SVG sources.
const g512 = geometry(512);
const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges" role="img" aria-label="Turboslide">
  <!-- The Turboslide mark, master drawing on a 64 unit grid (8 px per unit at 512 px): a 16:9 slide frame
       whose top edge is the crossbar of a T; the stem divides the slide into two panels; the right panel
       carries the deck's 8 by 8 Bayer ramp (rampInk of @turboslide/effects/ramp, one column offset) from
       ink at the stem to paper at the frame. One colour: currentColor. Frame ${g512.W / 8} by ${g512.H / 8} units,
       stroke ${g512.stroke / 8}, crossbar and stem ${g512.bar / 8}, cells 1 unit. Generated by design-4/shader/make.mjs. -->
  <g fill="currentColor">
    ${markShapes(g512, 8)}
  </g>
</svg>
`;
writeFileSync(`${OUT}/mark.svg`, master);
const g16 = geometry(16);
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="Turboslide">
  <!-- The 16 px drawing on the pixel grid: frame ${g16.W} by ${g16.H} at 1 px, crossbar and stem 2 px, both panels
       paper; no cells (a 2 px cell at 16 px leaves a 5 by 5 field, research-4 report 02 section 5.4). Rendered at
       2 px per unit this is the 32 px tab icon; the ICO's 32 and 48 px entries add 2 px cells to the right panel. -->
  <g fill="currentColor">
    ${markShapes(g16, 1)}
  </g>
</svg>
`;
writeFileSync(`${OUT}/mark-small.svg`, small);

// 2. PNG previews: 512, 180, 64, 32, 16 on paper and on ink, drawn at their own pixel grid.
const SIZES = [512, 180, 64, 32, 16];
for (const S of SIZES) {
  await writePng(`${OUT}/previews/mark-${S}-paper.png`, markSvg(S, { plate: PAPER, ink: INK }), { palette: true, colours: 2 });
  await writePng(`${OUT}/previews/mark-${S}-ink.png`, markSvg(S, { plate: INK, ink: PAPER_INK }), { palette: true, colours: 2 });
}

// 3. The favicon set (research-4 report 02 section 3), mocked.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <style>
    .plate { fill: ${PAPER} } .ink { fill: ${INK} }
    @media (prefers-color-scheme: dark) { .plate { fill: ${INK} } .ink { fill: ${PAPER_INK} } }
  </style>
  <rect class="plate" width="16" height="16"/>
  <g class="ink">
    ${markShapes(g16, 1)}
  </g>
</svg>
`;
writeFileSync(`${OUT}/icons/icon.svg`, iconSvg);
manifest.push({ path: 'icons/icon.svg', bytes: Buffer.byteLength(iconSvg), sha256: sha(iconSvg) });
for (const S of [16, 32, 48]) await writePng(`${OUT}/icons/favicon-${S}.png`, markSvg(S, { plate: PAPER, ink: INK }));
await writePng(`${OUT}/icons/apple-touch-icon.png`, markSvg(180, { plate: PAPER, ink: INK, fit: 0.8 }));
await writePng(`${OUT}/icons/icon-192.png`, markSvg(192, { plate: PAPER, ink: INK }), { palette: true, colours: 2 });
await writePng(`${OUT}/icons/icon-512.png`, markSvg(512, { plate: PAPER, ink: INK }), { palette: true, colours: 2 });
await writePng(`${OUT}/icons/icon-mask-192.png`, markSvg(192, { plate: PAPER, ink: INK, fit: 0.75 }), { palette: true, colours: 2 });
await writePng(`${OUT}/icons/icon-mask-512.png`, markSvg(512, { plate: PAPER, ink: INK, fit: 0.75 }), { palette: true, colours: 2 });
await writePng(`${OUT}/icons/icon-mono-512.png`, markSvg(512, { plate: null, ink: '#000000' }));
await writePng(`${OUT}/icons/icon-dark-192.png`, markSvg(192, { plate: INK, ink: PAPER_INK }), { palette: true, colours: 2 });
await writePng(`${OUT}/icons/icon-dark-512.png`, markSvg(512, { plate: INK, ink: PAPER_INK }), { palette: true, colours: 2 });
const webmanifest = {
  id: '/', name: 'Turboslide', short_name: 'Turboslide',
  description: 'An agent native slides editor with Google Slides’ behaviours, a canvas on every slide and a pixel identical PowerPoint export.',
  start_url: '/home', scope: '/', display: 'standalone', background_color: INK, theme_color: INK,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-mask-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/icon-mask-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/icon-mono-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
  ],
};
const wm = JSON.stringify(webmanifest, null, 2) + '\n';
writeFileSync(`${OUT}/icons/manifest.webmanifest`, wm);
manifest.push({ path: 'icons/manifest.webmanifest', bytes: Buffer.byteLength(wm), sha256: sha(wm) });

// 4. The hinting sheet: every size at 1:1 on paper and ink, and 16, 32, 48 enlarged 8x nearest.
{
  const tiles = [];
  let x = 24;
  const row = async (S, plate, ink, top) => {
    const buf = await sharp(Buffer.from(markSvg(S, { plate, ink }))).png().toBuffer();
    tiles.push({ input: buf, left: x, top });
  };
  const comps = [];
  const bg = PAPER;
  const sheetW = 1180, sheetH = 760;
  // 1:1 row, paper
  let left = 24;
  for (const S of SIZES) {
    for (const [plate, ink, top] of [[PAPER, INK, 24], [INK, PAPER_INK, 24 + 540]]) {
      const buf = await sharp(Buffer.from(markSvg(S, { plate, ink }))).png().toBuffer();
      comps.push({ input: buf, left, top: top + (512 - S) });
    }
    left += S + 24;
  }
  // enlarged 8x nearest of 16, 32, 48 on paper, right column
  let ex = 24 + 512 + 24 + 180 + 24 + 64 + 24 + 32 + 24 + 16 + 40;
  const enl = [];
  for (const S of [16, 32, 48]) {
    const buf = await sharp(Buffer.from(markSvg(S, { plate: PAPER, ink: INK }))).png().toBuffer();
    const big = await sharp(buf).resize(S * 6, S * 6, { kernel: 'nearest' }).png().toBuffer();
    enl.push(big);
  }
  const sheet = sharp({ create: { width: 1560, height: 1120, channels: 3, background: '#8a8f98' } });
  const comps2 = comps.map((c) => c);
  let ey = 24;
  for (let i = 0; i < enl.length; i += 1) {
    comps2.push({ input: enl[i], left: 1180, top: ey });
    ey += [16, 32, 48][i] * 6 + 24;
  }
  const label = Buffer.from(`<svg width="1560" height="40"><text x="24" y="28" font-family="Helvetica" font-size="16" fill="#fff">Turboslide mark at 512, 180, 64, 32 and 16 px on paper (top) and ink (bottom), each drawn on its own pixel grid; right: 16, 32 and 48 px at 6x nearest</text></svg>`);
  comps2.push({ input: label, left: 0, top: 1080 });
  await sheet.composite(comps2).png().toFile(`${OUT}/previews/marks-sheet.png`);
}

// 5. The confusion sheet: the mark at 32 px beside generic silhouettes at 32 px, all in one grey.
{
  const G = '#8a8f98';
  const sil = [
    ['Turboslide', markSvg(32, { plate: PAPER, ink: G })],
    ['triangle', `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${PAPER}"/><path d="M16 4 L29 28 L3 28Z" fill="${G}"/></svg>`],
    ['cube', `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${PAPER}"/><path d="M16 3 L28 9.5 L28 22.5 L16 29 L4 22.5 L4 9.5Z M16 3 L16 16 M4 9.5 L16 16 L28 9.5" fill="none" stroke="${G}" stroke-width="2"/></svg>`],
    ['Z', `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${PAPER}"/><path d="M5 5 H27 L5 27 H27" fill="none" stroke="${G}" stroke-width="4" stroke-linejoin="miter"/></svg>`],
    ['rect in rect', `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${PAPER}"/><rect x="4" y="3" width="24" height="26" rx="3" fill="${G}"/><rect x="9" y="12" width="14" height="9" fill="${PAPER}"/></svg>`],
    ['chevrons', `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${PAPER}"/><path d="M6 6 L14 16 L6 26 M16 6 L24 16 L16 26" fill="none" stroke="${G}" stroke-width="3"/></svg>`],
  ];
  const comps = [];
  let left = 24;
  for (const [name, svg] of sil) {
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const big = await sharp(buf).resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
    comps.push({ input: buf, left, top: 24 });
    comps.push({ input: big, left, top: 80 });
    comps.push({ input: Buffer.from(`<svg width="140" height="24"><text x="0" y="16" font-family="Helvetica" font-size="12" fill="#070707">${name}</text></svg>`), left, top: 216 });
    left += 152;
  }
  await sharp({ create: { width: left + 24, height: 260, channels: 3, background: PAPER } }).composite(comps).png().toFile(`${OUT}/previews/confusion-sheet.png`);
}

// 6. Two colour check on the 16 and 32 px rasters and the cell counts.
const check = {};
for (const S of [16, 32, 48, 64, 180, 192, 512]) {
  const g = geometry(S);
  const buf = await sharp(Buffer.from(markSvg(S, { plate: PAPER, ink: INK }))).raw().toBuffer({ resolveWithObject: true });
  const seen = new Set();
  for (let i = 0; i < buf.data.length; i += buf.info.channels) seen.add(`${buf.data[i]},${buf.data[i + 1]},${buf.data[i + 2]}`);
  check[S] = { colours: seen.size, geometry: g, cells: panelCells(g).length, cellGrid: g.cell ? `${g.interior / g.cell} by ${g.inner / g.cell}` : 'none' };
}
writeFileSync(`${OUT}/previews/mark-geometry.json`, JSON.stringify(check, null, 2) + '\n');
writeFileSync(`${OUT}/icons/brand-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(check).map(([k, v]) => [k, { colours: v.colours, W: v.geometry.W, H: v.geometry.H, stroke: v.geometry.stroke, bar: v.geometry.bar, cell: v.geometry.cell, grid: v.cellGrid, lit: v.cells }])), null, 1));

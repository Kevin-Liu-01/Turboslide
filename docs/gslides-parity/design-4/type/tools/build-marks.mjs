// Turboslide identity, proposal 3 (type): the T (Inter Display Medium's letter with its foot cut
// by the deck's Bayer screen), its bitmap hint on the 16 unit grid, the tile, the wordmarks, the
// favicon set, the CLI banner and the previews. Runs on node with sharp from the repository's
// node_modules and the effects package's Bayer screen through Node's type stripping.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const { bayerThreshold } =
  await import('/Users/kevinliu/repos/Turboslide/packages/effects/src/bayer.ts');

const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/type';
const PREV = join(OUT, 'previews');
const FAV = join(OUT, 'favicon');
const VAR = join(PREV, 'variants');
const SCRATCH =
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type3';
for (const d of [OUT, PREV, FAV, VAR]) mkdirSync(d, { recursive: true });

// ---- tokens (packages/chrome/src/tokens.css; the composites of packages/theme/src/tokens.ts) ----
const THEME = {
  paper: { plate: '#ffffff', ink: '#070707', frame: '#656565', titanium: '#8a8f98' },
  ink: { plate: '#070707', ink: '#f2f2f0', frame: '#888887', titanium: '#8a8f98' },
};

// ---- Inter Display Medium (opsz 32, wght 500), measured with fontTools on InterVariable 4.001 ----
const glyphs = JSON.parse(readFileSync(join(SCRATCH, 'inter-display-medium.json'), 'utf8'));
const geo = JSON.parse(readFileSync(join(SCRATCH, 't-geometry.json'), 'utf8'));
const positions = JSON.parse(readFileSync(join(SCRATCH, 'word-positions.json'), 'utf8')).a; // Chromium, tracking -0.025em, kerned
const UPM = glyphs.upm; // 2048
const CAP = glyphs.capHeight; // 1490
const STEM = geo.stem; // [523, 746] in font units
const ARM_BOTTOM = geo.arm[0]; // 1295
const T_PATH = glyphs.glyphs.T.d;
const T_BOUNDS = glyphs.glyphs.T.bounds; // [48.2, 0, 1218.7, 1490]

/** The ramp: the lowest 40 percent of the stem; tone falls from 1 to 0.25; 4 cells across the stem. */
const RAMP_SHARE = 0.4;
const END_TONE = 0.25;
const COLS = 4;

// ---- the outline mark: Inter's T, its foot cut by the screen ----
/**
 * The T at `scale` px per font unit with its baseline at (x, y), in `fill`. The outline is
 * clipped above the ramp; the ramp is a grid of COLS by rows square cells across the stem,
 * lit where the falling tone exceeds the deck's Bayer threshold (nested tiers by construction).
 */
function outlineT(scale, x, y, fill, id = 'r') {
  const cell = (STEM[1] - STEM[0]) / COLS; // font units
  const rows = Math.round((ARM_BOTTOM * RAMP_SHARE) / cell);
  const rampTop = rows * cell; // font units above the baseline
  const rects = [];
  for (let r = 0; r < rows; r += 1) {
    const tone = 1 - ((r + 1) / (rows + 1)) * (1 - END_TONE);
    for (let c = 0; c < COLS; c += 1) {
      if (tone * 255 > bayerThreshold(r, c)) {
        // row 0 is the top of the ramp, just under the solid stem
        rects.push(
          `<rect x="${(STEM[0] + c * cell).toFixed(2)}" y="${(rampTop - (r + 1) * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`,
        );
      }
    }
  }
  return (
    `<g fill="${fill}" transform="translate(${x} ${y}) scale(${scale} ${-scale})">` +
    `<clipPath id="${id}"><rect x="${T_BOUNDS[0] - 10}" y="${rampTop.toFixed(2)}" width="${T_BOUNDS[2] - T_BOUNDS[0] + 20}" height="${CAP - rampTop + 20}"/></clipPath>` +
    `<path clip-path="url(#${id})" d="${T_PATH}"/>` +
    `<g shape-rendering="crispEdges">${rects.join('')}</g></g>`
  );
}
/** The outline T centered in a `size` tile with its cap 12/16 of the tile (the hint's proportion). */
function outlineTInTile(size, fill, pad = 0) {
  const inner = size - 2 * pad;
  const scale = (inner * 0.75) / CAP;
  const width = (T_BOUNDS[2] - T_BOUNDS[0]) * scale;
  const x = pad + (inner - width) / 2 - T_BOUNDS[0] * scale;
  const y = pad + inner * (14 / 16);
  return outlineT(scale, x, y, fill);
}

// ---- the hint: the same T on the 16 unit grid (cap 12, width 10, stem 2, arm 2) ----
const GRID = 16;
const HINT = {
  barX: 3,
  barY: 2,
  barW: 10,
  barH: 2,
  stemX: 7,
  stemW: 2,
  stemY: 4,
  footY: 14,
  rampFromY: 10,
};
const hintPath = `M${HINT.barX} ${HINT.barY}h${HINT.barW}v${HINT.barH}h-${(HINT.barW - HINT.stemW) / 2}v${HINT.footY - HINT.stemY}h-${HINT.stemW}v-${HINT.footY - HINT.stemY}h-${(HINT.barW - HINT.stemW) / 2}z`;
/** Cells appear at 2 px; the hint holds 4 cells across its 2 unit stem, so cells exist from unit 4 (a 64 px tile). */
function hintRects(unit, pad, fill, { cells = true } = {}) {
  const cell = cells && unit >= 4 ? unit / 2 : 0;
  const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const parts = [
    rect(pad + HINT.barX * unit, pad + HINT.barY * unit, HINT.barW * unit, HINT.barH * unit),
  ];
  const solidEnd = cell > 0 ? HINT.rampFromY : HINT.footY;
  parts.push(
    rect(
      pad + HINT.stemX * unit,
      pad + HINT.stemY * unit,
      HINT.stemW * unit,
      (solidEnd - HINT.stemY) * unit,
    ),
  );
  if (cell > 0) {
    const rows = ((HINT.footY - HINT.rampFromY) * unit) / cell;
    const cols = (HINT.stemW * unit) / cell;
    for (let r = 0; r < rows; r += 1) {
      const tone = 1 - ((r + 1) / (rows + 1)) * (1 - END_TONE);
      for (let c = 0; c < cols; c += 1) {
        if (tone * 255 > bayerThreshold(r, c))
          parts.push(
            rect(
              pad + HINT.stemX * unit + c * cell,
              pad + HINT.rampFromY * unit + r * cell,
              cell,
              cell,
            ),
          );
      }
    }
  }
  return `<g fill="${fill}" shape-rendering="crispEdges">${parts.join('')}</g>`;
}

/** The tile: plate, the 1 px frame in the edge composite, the T (hint at 64 px and below, outline above). */
function tileSvg(
  size,
  theme,
  { frame = true, pad = 0, hint = size <= 64, unit = (size - 2 * pad) / GRID, cells = true } = {},
) {
  const t = THEME[theme];
  const frameRect = frame
    ? `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${t.frame}" stroke-width="1" shape-rendering="crispEdges"/>`
    : '';
  const letter = hint ? hintRects(unit, pad, t.ink, { cells }) : outlineTInTile(size, t.ink, pad);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${t.plate}"/>${frameRect}${letter}</svg>`
  );
}

// ---- SVG sources ----
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
writeFileSync(
  join(OUT, 'mark.svg'),
  `${HEAD}<!-- Turboslide mark: the T of Inter Display Medium (InterVariable 4.001 at opsz 32, wght 500;
     SIL OFL 1.1) with the lowest 40 percent of its stem cut by the deck's 8 by 8 Bayer screen
     (packages/effects/src/bayer.ts, thresholds (m + 0.5) / 64): four cells across the stem, the
     tone falling from 1 to 0.25 so the tiers nest. Fill is currentColor; the host sets the ink.
     Use from 128 px; mark-small.svg is the bitmap hint for 64 px and below. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="currentColor" role="img" aria-label="Turboslide">
${outlineTInTile(512, 'currentColor')}
</svg>
`,
);
writeFileSync(
  join(OUT, 'mark-small.svg'),
  `${HEAD}<!-- Turboslide mark, the hint: the same T on a 16 unit cell grid (cap 12, width 10, stem 2,
     arm 2, from Inter Display Medium's 0.786, 0.149 and 0.131 of cap), solid. For 16 and 32 px
     (the tab icon, the title row, the app bar); at 64 px the host adds the 2 px cells of
     hintRects (see build-marks.mjs). Fill is currentColor. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" role="img" aria-label="Turboslide">
<path shape-rendering="crispEdges" d="${hintPath}"/>
</svg>
`,
);
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
<style>.p{fill:#ffffff}.f{stroke:#656565}.i{fill:#070707}@media (prefers-color-scheme: dark){.p{fill:#070707}.f{stroke:#888887}.i{fill:#f2f2f0}}</style>
<rect class="p" width="16" height="16"/>
<rect class="f" x="0.5" y="0.5" width="15" height="15" fill="none" stroke-width="1" shape-rendering="crispEdges"/>
<path class="i" shape-rendering="crispEdges" d="${hintPath}"/>
</svg>
`;
writeFileSync(join(FAV, 'icon.svg'), iconSvg);
writeFileSync(join(OUT, 'icon.svg'), iconSvg);

// ---- the wordmarks ----
function wordPaths(fontSize, x, y, fill, { skipFirst = false } = {}) {
  const s = fontSize / UPM;
  const px = fontSize / 1000;
  const out = [];
  positions.chars.forEach((c, i) => {
    if (skipFirst && i === 0) return;
    const g = glyphs.glyphs[c.ch];
    out.push(
      `<path transform="translate(${(x + c.x * px).toFixed(3)} ${y.toFixed(3)}) scale(${s.toFixed(6)} ${(-s).toFixed(6)})" d="${g.d}"/>`,
    );
  });
  return `<g fill="${fill}">${out.join('')}</g>`;
}
const wordWidthAt = (fontSize) => {
  const last = positions.chars[positions.chars.length - 1];
  return (last.x * fontSize) / 1000 + (glyphs.glyphs[last.ch].bounds[2] * fontSize) / UPM;
};
/** The horizontal lockup: the tile, a gap of 0.4 tile, the word with its cap equal to the T's 12 units. */
function wordmarkSvg(theme, { tile = 64, transparent = false } = {}) {
  const t = THEME[theme];
  const unit = tile / GRID;
  const gap = Math.round(tile * 0.4);
  const fontSize = (12 * unit) / (CAP / UPM);
  const baseline = 14 * unit;
  const width = Math.ceil(tile + gap + wordWidthAt(fontSize)) + 1;
  const ground = transparent ? '' : `<rect width="${width}" height="${tile}" fill="${t.plate}"/>`;
  const frame = `<rect x="0.5" y="0.5" width="${tile - 1}" height="${tile - 1}" fill="none" stroke="${t.frame}" stroke-width="1" shape-rendering="crispEdges"/>`;
  const letter = tile <= 64 ? hintRects(unit, 0, t.ink) : outlineTInTile(tile, t.ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${tile}" width="${width}" height="${tile}" role="img" aria-label="Turboslide">
${ground}${frame}${letter}
${wordPaths(fontSize, tile + gap, baseline, t.ink)}
</svg>
`;
}
function wordmarkStackedSvg(theme, { tile = 64 } = {}) {
  const t = THEME[theme];
  const unit = tile / GRID;
  const gap = Math.round(tile * 0.375);
  const fontSize = (12 * unit) / (CAP / UPM);
  const width = Math.ceil(wordWidthAt(fontSize)) + 2;
  const tileX = Math.round((width - tile) / 2);
  const baseline = tile + gap + 12 * unit + 1;
  const height = Math.ceil(baseline + 2);
  const letter = tile <= 64 ? hintRects(unit, 0, t.ink) : outlineTInTile(tile, t.ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Turboslide">
<rect width="${width}" height="${height}" fill="${t.plate}"/>
<rect x="${tileX + 0.5}" y="0.5" width="${tile - 1}" height="${tile - 1}" fill="none" stroke="${t.frame}" stroke-width="1" shape-rendering="crispEdges"/>
<g transform="translate(${tileX} 0)">${letter}</g>
${wordPaths(fontSize, 1, baseline, t.ink)}
</svg>
`;
}
/** The display wordmark: the word itself, its T carrying the cut foot. For the OG image and the README hero. */
function wordmarkDisplaySvg(theme, { fontSize = 132, pad = 24 } = {}) {
  const t = THEME[theme];
  const scale = fontSize / UPM;
  const baseline = pad + CAP * scale;
  const width = Math.ceil(wordWidthAt(fontSize)) + pad * 2;
  const height = Math.ceil(baseline + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Turboslide">
<rect width="${width}" height="${height}" fill="${t.plate}"/>
${outlineT(scale, pad, baseline, t.ink, 'rw')}
${wordPaths(fontSize, pad, baseline, t.ink, { skipFirst: true })}
</svg>
`;
}
writeFileSync(join(OUT, 'wordmark.svg'), wordmarkSvg('paper'));
writeFileSync(join(OUT, 'wordmark-ink.svg'), wordmarkSvg('ink'));
writeFileSync(join(OUT, 'wordmark-stacked.svg'), wordmarkStackedSvg('paper'));
writeFileSync(join(OUT, 'wordmark-stacked-ink.svg'), wordmarkStackedSvg('ink'));
writeFileSync(join(OUT, 'wordmark-display.svg'), wordmarkDisplaySvg('paper'));
writeFileSync(join(OUT, 'wordmark-display-ink.svg'), wordmarkDisplaySvg('ink'));

// ---- previews: the tile at 512, 180, 64, 32, 16 on paper and on ink ----
const SIZES = [
  { size: 512, frame: true, pad: 0 },
  { size: 180, frame: false, pad: 10 }, // the touch icon: iOS masks the tile, so no frame; the outline T
  { size: 64, frame: true, pad: 0 },
  { size: 32, frame: true, pad: 0 },
  { size: 16, frame: true, pad: 0 },
];
for (const { size, frame, pad } of SIZES) {
  for (const theme of ['paper', 'ink']) {
    await sharp(Buffer.from(tileSvg(size, theme, { frame, pad })))
      .png({ palette: true })
      .toFile(join(PREV, `mark-${size}-${theme}.png`));
  }
}
// the bare mark at 512 on both grounds
for (const theme of ['paper', 'ink']) {
  const t = THEME[theme];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${t.plate}"/>${outlineTInTile(512, t.ink)}</svg>`;
  await sharp(Buffer.from(svg))
    .png({ palette: true })
    .toFile(join(PREV, `mark-bare-512-${theme}.png`));
}
// the wordmarks at 2x
for (const name of [
  'wordmark',
  'wordmark-ink',
  'wordmark-stacked',
  'wordmark-stacked-ink',
  'wordmark-display',
  'wordmark-display-ink',
]) {
  const svg = readFileSync(join(OUT, `${name}.svg`), 'utf8');
  const meta = await sharp(Buffer.from(svg)).metadata();
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(meta.width * 2)
    .png()
    .toFile(join(PREV, `${name}.png`));
}
// the app bar and title row sizes of the tile (20 and 24 px) at 1x and 2x, for the chrome sheet
for (const size of [20, 24]) {
  for (const theme of ['paper', 'ink']) {
    const svg = tileSvg(size, theme, { frame: true, pad: 0, hint: true, cells: false });
    await sharp(Buffer.from(svg))
      .png()
      .toFile(join(PREV, `tile-${size}-${theme}.png`));
    await sharp(
      Buffer.from(
        svg.replace(`width="${size}" height="${size}"`, `width="${size * 2}" height="${size * 2}"`),
      ),
    )
      .png()
      .toFile(join(PREV, `tile-${size}-${theme}@2x.png`));
  }
}

// ---- rejected variants, rendered so the rejection is on evidence ----
// A. The slide counter: the o of the display wordmark with a 16:9 counter (paper over the letter).
{
  const t = THEME.ink;
  const fontSize = 132;
  const s = fontSize / UPM;
  const base = wordmarkDisplaySvg('ink');
  const o = positions.chars.find((c) => c.ch === 'o');
  const ox = 24 + (o.x * fontSize) / 1000;
  const baseline = 24 + CAP * s;
  // Inter's counter spans x 281 to 865 and, by the o's symmetry, y 158 to 898 (font units); a 16:9 box of that width is 584 by 328.
  const cw = (865 - 281) * s;
  const ch = (cw * 9) / 16;
  const cx = ox + 281 * s;
  const cy = baseline - (158 + (898 - 158) / 2) * s - ch / 2;
  // paint the counter closed first (an ink rect over the counter), then the paper slide
  const closed = `<rect x="${(cx - 2).toFixed(2)}" y="${(baseline - 898 * s).toFixed(2)}" width="${(cw + 4).toFixed(2)}" height="${((898 - 158) * s).toFixed(2)}" fill="${t.ink}"/>`;
  const slide = `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" fill="${t.plate}"/>`;
  const svg = base.replace('</svg>', `${closed}${slide}</svg>`);
  writeFileSync(join(VAR, 'o-slide-counter.svg'), svg);
  const meta = await sharp(Buffer.from(svg)).metadata();
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(meta.width * 2)
    .png()
    .toFile(join(VAR, 'o-slide-counter.png'));
}
// B. The doubled line T (the GT mark's grammar): a 3 unit stem of two hairlines at 16, 32 and 64.
{
  for (const size of [16, 32, 64]) {
    for (const theme of ['paper', 'ink']) {
      const t = THEME[theme];
      const u = size / GRID;
      const g = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      const body = `<g fill="${t.ink}" shape-rendering="crispEdges">${g(3 * u, 2 * u, 10 * u, u)}${g(3 * u, 4 * u, 10 * u, u)}${g(6.5 * u, 5 * u, u, 9 * u)}${g(8.5 * u, 5 * u, u, 9 * u)}</g>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${t.plate}"/><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${t.frame}" stroke-width="1" shape-rendering="crispEdges"/>${body}</svg>`;
      await sharp(Buffer.from(svg))
        .png()
        .toFile(join(VAR, `doubled-T-${size}-${theme}.png`));
    }
  }
}
// C. The hint at 512 (the cell T scaled up), to compare with the outline.
await sharp(Buffer.from(tileSvg(512, 'paper', { hint: true })))
  .png({ palette: true })
  .toFile(join(VAR, 'hint-512-paper.png'));

// ---- the favicon set (research-4/02 section 3) ----
async function raw(svg) {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dirs = [];
  const bodies = [];
  let offset = 6 + 16 * images.length;
  for (const { width, height, data } of images) {
    const rowBytes = width * 4;
    const maskRow = Math.ceil(width / 32) * 4;
    const body = Buffer.alloc(40 + rowBytes * height + maskRow * height);
    body.writeUInt32LE(40, 0);
    body.writeInt32LE(width, 4);
    body.writeInt32LE(height * 2, 8);
    body.writeUInt16LE(1, 12);
    body.writeUInt16LE(32, 14);
    body.writeUInt32LE(0, 16);
    body.writeUInt32LE(rowBytes * height, 20);
    let p = 40;
    for (let y = height - 1; y >= 0; y -= 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        body[p++] = data[i + 2];
        body[p++] = data[i + 1];
        body[p++] = data[i];
        body[p++] = data[i + 3];
      }
    }
    const dir = Buffer.alloc(16);
    dir.writeUInt8(width === 256 ? 0 : width, 0);
    dir.writeUInt8(height === 256 ? 0 : height, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(body.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += body.length;
    dirs.push(dir);
    bodies.push(body);
  }
  return Buffer.concat([header, ...dirs, ...bodies]);
}
const icoImages = [];
for (const size of [16, 32, 48])
  icoImages.push(await raw(tileSvg(size, 'paper', { frame: true, hint: true })));
writeFileSync(join(FAV, 'favicon.ico'), ico(icoImages));
await sharp(Buffer.from(tileSvg(180, 'ink', { frame: false, pad: 10 })))
  .png({ palette: true })
  .toFile(join(FAV, 'apple-touch-icon.png'));
await sharp(Buffer.from(tileSvg(192, 'ink', { frame: true })))
  .png({ palette: true })
  .toFile(join(FAV, 'icon-192.png'));
await sharp(Buffer.from(tileSvg(512, 'ink', { frame: true })))
  .png({ palette: true })
  .toFile(join(FAV, 'icon-512.png'));
// maskable: the letter inside the 409 px safe circle (cap 288, width 226, diagonal 367), the plate bleeds
await sharp(Buffer.from(tileSvg(512, 'ink', { frame: false, pad: 64 })))
  .png({ palette: true })
  .toFile(join(FAV, 'icon-mask-512.png'));
await sharp(Buffer.from(tileSvg(192, 'ink', { frame: false, pad: 24 })))
  .png({ palette: true })
  .toFile(join(FAV, 'icon-mask-192.png'));
writeFileSync(
  join(FAV, 'manifest.webmanifest'),
  `${JSON.stringify(
    {
      id: '/',
      name: 'Turboslide',
      short_name: 'Turboslide',
      description:
        "An agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export.",
      start_url: '/home',
      scope: '/',
      display: 'standalone',
      background_color: '#070707',
      theme_color: '#070707',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-mask-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/icon-mask-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    null,
    2,
  )}\n`,
);

// ---- the CLI banner from the hint's bitmap: two grid rows per text row, half blocks ----
const bitmap = Array.from({ length: GRID }, (_, y) =>
  Array.from({ length: GRID }, (_, x) => {
    const inBar =
      x >= HINT.barX && x < HINT.barX + HINT.barW && y >= HINT.barY && y < HINT.barY + HINT.barH;
    const inStem =
      x >= HINT.stemX && x < HINT.stemX + HINT.stemW && y >= HINT.stemY && y < HINT.footY;
    return inBar || inStem ? 1 : 0;
  }),
);
const rows = [];
for (let y = 0; y < GRID; y += 2) {
  let row = '';
  for (let x = 0; x < GRID; x += 1) {
    const a = bitmap[y][x];
    const b = bitmap[y + 1][x];
    row += a && b ? '█' : a ? '▀' : b ? '▄' : ' ';
  }
  rows.push(row.replace(/\s+$/, ''));
}
writeFileSync(join(OUT, 'banner.txt'), `${rows.slice(1, 7).join('\n')}\n`);
const cell = (STEM[1] - STEM[0]) / COLS;
console.log(
  'outline: stem',
  STEM,
  'cell',
  cell.toFixed(2),
  'font units; rows',
  Math.round((ARM_BOTTOM * RAMP_SHARE) / cell),
  '; ramp top',
  (Math.round((ARM_BOTTOM * RAMP_SHARE) / cell) * cell).toFixed(1),
  'of',
  ARM_BOTTOM,
);
console.log(
  'at 512: scale',
  ((512 * 0.75) / CAP).toFixed(4),
  'cell px',
  ((cell * 512 * 0.75) / CAP).toFixed(2),
  '| at 180 (pad 10): cell px',
  ((cell * 160 * 0.75) / CAP).toFixed(2),
  '| at 132 px type: cell px',
  ((cell * 132) / UPM).toFixed(2),
);
console.log('done');

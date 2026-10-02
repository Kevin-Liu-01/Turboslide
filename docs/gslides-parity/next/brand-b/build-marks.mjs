// Brand direction B of the next program (docs/gslides-parity/next/brand-b.md): a Turboslide
// wordmark and monogram in the race-type register of the GT speed marks (Prototemplate
// scripts/build-speed-marks.mjs, slides 17 to 23): wide letters, a forward slant of 12 degrees,
// one horizontal cut through the letters at mid cap height, and three speed bars that lead into
// the first letter. The letters are Inter outlines, taken with fontkit from the InterVariable file
// the product ships (packages/fonts/assets, the same bytes as Prototemplate public/fonts), at one
// weight of the variable font, widened by cutting each glyph through its counters and inserting
// straight horizontal runs, so the stems keep Inter's own width. Every output is one color in
// currentColor with plain paths: no mask, no id, no font, so a page can inline the file any
// number of times. Prototype only: a build round would move this into packages/theme.
//
//   node docs/gslides-parity/next/brand-b/build-marks.mjs [--variants]
//
// Outputs under brand-b/marks/: wordmark.svg, monogram.svg, favicon-16.svg (the monogram
// redrawn on the 16 px grid), icon-tile.svg (the favicon source, a paper plate with the scheme
// block), app-icon.svg (the ink tile for the touch and manifest icons), banner.txt (the CLI
// glyph as half blocks), geometry.json (the numbers the note cites). --variants also writes
// variants.html, the sheet the direction was chosen from.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { at, BASELINE, box, CAP_UNITS, compose, cutFor, letters, lerp, pathData, round, SLANT_DEG } from './marks-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'marks');
mkdirSync(OUT, { recursive: true });

const svg = (viewBox, label, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" role="img" aria-label="${label}"${extra}>${inner}</svg>\n`;

/* ---------- the chosen direction ---------- */

const CHOSEN = { text: 'Turboslide', weight: 800, wide: 300, tracking: 10, bars: 'before' };

/** a tight viewBox around a box, padded by `pad` units */
const viewBoxOf = (b, pad = 4) =>
  `${round(b.minX - pad)} ${round(b.minY - pad)} ${round(b.maxX - b.minX + 2 * pad)} ${round(b.maxY - b.minY + 2 * pad)}`;

function writeOut(name, text) {
  writeFileSync(join(OUT, name), text);
  console.log(`${name.padEnd(22)} ${String(Buffer.byteLength(text)).padStart(7)} B`);
}

const word = compose(CHOSEN);
writeOut(
  'wordmark.svg',
  svg(
    viewBoxOf(word.box),
    'Turboslide',
    `<path d="${word.d}"/>`,
  ),
);

/* The monogram is the wordmark's T with the same cut and the same three bars, the bars moved under
   the T's left arm and clear of its stem so the form fits a square (1.3 to 1): the tab icon, the
   app icon, the title row, the CLI banner. The wordmark keeps the bars before the T, where they
   lead the word. */
const mono = compose({ ...CHOSEN, only: 'T', bars: 'inset' });
writeOut('monogram.svg', svg(viewBoxOf(mono.box), 'Turboslide', `<path d="${mono.d}"/>`));

/* ---------- the 16 px monogram, drawn on the pixel grid ----------
   At 16 px the slant and the 8 unit cut fall between pixels, so the tab icon is redrawn as whole
   pixels on a 12 px cap (rows 2 to 13): the crossbar 3 rows and 10 px, the stem 3 px stepped one
   pixel left at the cut and again at row 12 (the slant as steps of about 1 in 4, against tan 12
   degrees, 1 in 4.7), the cut one clear row at row 8, the middle bar as the two 1 px lines the
   cut leaves (rows 7 and 9), the bottom bar 2 rows, every bar 1 px clear of the stem and
   starting 2 px left of the arm's end, so the bars step 5, 4 and 3 px with the slant. # is ink. */
const FAV16 = [
  '................',
  '................',
  '....##########..',
  '....##########..',
  '....##########..',
  '........###.....',
  '........###.....',
  '..#####.###.....',
  '................',
  '..####.###......',
  '.......###......',
  '.......###......',
  '..###.###.......',
  '..###.###.......',
  '................',
  '................',
];
function pixelPath(rows, ox = 0, oy = 0) {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === '#') w++;
      d += `M${x + ox} ${y + oy}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}

/* ---------- the tile: the favicon source, as the tree's icon-tile.svg is built ----------
   The paper plate with the 1 px frame in the edge composite (brand.ts TILE_COLORS), the monogram
   in ink; under prefers-color-scheme: dark the plate turns ink and the mark paper. The 16 px
   file draws the pixel monogram; the larger files draw the vector monogram fit to the tile. */
const TILE = {
  light: { plate: '#ffffff', ink: '#070707', frame: '#656565' },
  dark: { plate: '#070707', ink: '#f2f2f0', frame: '#888887' },
};
const scheme = `<style>.p{fill:${TILE.light.plate}}.f{fill:none;stroke:${TILE.light.frame}}.m{fill:${TILE.light.ink}}@media (prefers-color-scheme: dark){.p{fill:${TILE.dark.plate}}.f{stroke:${TILE.dark.frame}}.m{fill:${TILE.dark.ink}}}</style>`;

writeOut(
  'favicon-16.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" role="img" aria-label="Turboslide">${scheme}<rect class="p" width="16" height="16"/><rect class="f" x=".5" y=".5" width="15" height="15"/><path class="m" d="${pixelPath(FAV16)}"/></svg>\n`,
);

/** the vector monogram placed in a square of `size` with `inset` on every side, centred */
function fitMonogram(size, inset) {
  const b = mono.box;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const s = (size - 2 * inset) / Math.max(w, h);
  const tx = (size - w * s) / 2 - b.minX * s;
  const ty = (size - h * s) / 2 - b.minY * s;
  return `<path transform="matrix(${round(s)} 0 0 ${round(s)} ${round(tx)} ${round(ty)})" d="${mono.d}"/>`;
}

writeOut(
  'icon-tile.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Turboslide">${scheme}<rect class="p" width="32" height="32"/><rect class="f" x=".5" y=".5" width="31" height="31"/><g class="m">${fitMonogram(32, 4)}</g></svg>\n`,
);
/* the touch and manifest icon: paper monogram on an opaque ink square, no corners (the platform
   rounds it); the mark inside the 40 percent safe circle of a maskable icon */
writeOut(
  'app-icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="Turboslide"><rect width="180" height="180" fill="#070707"/><g fill="#f2f2f0">${fitMonogram(180, 34)}</g></svg>\n`,
);

/* ---------- the CLI glyph: the 16 px monogram as half blocks ----------
   The same pixels as the tab icon, two pixel rows per text line (U+2580, U+2584, U+2588), so the
   terminal and the tab draw one bitmap, as the tree's banner does today with markBlocks(8). */
function inside(contours, x, y) {
  /* nonzero winding by flattening each segment to 16 lines */
  let wn = 0;
  for (const c of contours)
    for (const s of c) {
      let prev = s.p[0];
      for (let i = 1; i <= 16; i++) {
        const p = s.k === 'L' ? (i === 16 ? s.p[1] : lerp(s.p[0], s.p[1], i / 16)) : at(s, i / 16);
        const [x1, y1] = prev;
        const [x2, y2] = p;
        if (y1 <= y && y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) wn++;
        else if (y1 > y && y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) wn--;
        prev = p;
      }
    }
  return wn !== 0;
}
function raster(contours, b, cols, rows) {
  const cw = (b.maxX - b.minX) / cols;
  const ch = (b.maxY - b.minY) / rows;
  const bits = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++)
          if (inside(contours, b.minX + (c + (sx + 0.5) / 4) * cw, b.minY + (r + (sy + 0.5) / 4) * ch)) hit++;
      row.push(hit > 8 ? 1 : 0);
    }
    bits.push(row);
  }
  return bits;
}
{
  /* the 16 px monogram's 12 by 12 mark area, two pixel rows per text line: six lines */
  const bits = FAV16.slice(2, 14).map((row) => [...row.slice(1, 14)].map((ch) => (ch === '#' ? 1 : 0)));
  const lines = [];
  for (let y = 0; y < bits.length; y += 2) {
    let line = '';
    for (let x = 0; x < bits[y].length; x++) {
      const top = bits[y][x] === 1;
      const bottom = bits[y + 1][x] === 1;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  writeOut('banner.txt', lines.join('\n') + '\n');
}

writeOut(
  'geometry.json',
  JSON.stringify(
    {
      source: 'packages/fonts/assets/InterVariable.woff2 (Inter 4.1), wght and opsz as below',
      chosen: CHOSEN,
      opsz: 32,
      capUnits: CAP_UNITS,
      baseline: BASELINE,
      cut: word.cut.map(round),
      slantDegrees: SLANT_DEG,
      stemUnits: round(word.stem),
      tAnatomy: Object.fromEntries(Object.entries(word.anatomy).map(([k, v]) => [k, round(v)])),
      wordmarkBox: Object.fromEntries(Object.entries(word.box).map(([k, v]) => [k, round(v)])),
      wordmarkAspect: round((word.box.maxX - word.box.minX) / (word.box.maxY - word.box.minY)),
      monogramBox: Object.fromEntries(Object.entries(mono.box).map(([k, v]) => [k, round(v)])),
      monogramAspect: round((mono.box.maxX - mono.box.minX) / (mono.box.maxY - mono.box.minY)),
    },
    null,
    2,
  ) + '\n',
);

/* ---------- the variant sheet (--variants) ---------- */
if (process.argv.includes('--variants')) {
  const rows = [];
  const variants = [
    { label: 'Chosen wordmark: weight 800, widen 300, bars before the T (the monogram takes the bars under the arm, row 4)', o: CHOSEN },
    { label: 'Weight 900, widen 300, bars before the T', o: { ...CHOSEN, weight: 900 } },
    { label: 'Weight 800, widen 300, bars under the arm into the stem', o: { ...CHOSEN, bars: 'under' } },
    { label: 'Chosen monogram: weight 800, widen 300, bars under the arm, clear of the stem', o: { ...CHOSEN, bars: 'inset' } },
    { label: 'Weight 800, widen 150, bars before the T', o: { ...CHOSEN, wide: 150 } },
    { label: 'Weight 800, widen 450, bars before the T', o: { ...CHOSEN, wide: 450 } },
    { label: 'Weight 700, widen 300, bars before the T', o: { ...CHOSEN, weight: 700 } },
    { label: 'Weight 800, no cut', o: { ...CHOSEN, cut: false } },
    { label: 'Weight 800, no bars', o: { ...CHOSEN, bars: 'none' } },
    { label: 'Inter 500 upright with no widening, slant, cut or bars, the weight of the live text wordmark today', o: { ...CHOSEN, weight: 500, wide: 0, bars: 'none', cut: false, flat: true } },
  ];
  for (const v of variants) {
    let m;
    if (v.o.flat) {
      const L = letters(v.o);
      const contours = L.glyphs.flatMap((g) => g.contours);
      m = { d: pathData(contours), box: box(contours) };
    } else m = compose(v.o);
    const mt = v.o.flat ? null : compose({ ...v.o, only: 'T' });
    rows.push(
      `<section><p>${v.label}</p><div class="row"><svg height="96" viewBox="${viewBoxOf(m.box)}" fill="currentColor"><path d="${m.d}"/></svg>` +
        (mt ? `<svg height="96" viewBox="${viewBoxOf(mt.box)}" fill="currentColor"><path d="${mt.d}"/></svg><svg height="32" viewBox="${viewBoxOf(mt.box)}" fill="currentColor"><path d="${mt.d}"/></svg><svg height="16" viewBox="${viewBoxOf(mt.box)}" fill="currentColor"><path d="${mt.d}"/></svg>` : '') +
        `<svg height="24" viewBox="${viewBoxOf(m.box)}" fill="currentColor"><path d="${m.d}"/></svg></div></section>`,
    );
  }
  const page = `<!doctype html><meta charset="utf-8"><title>Brand B variants</title><style>
  @font-face{font-family:Inter;src:url('../../../../packages/fonts/assets/InterVariable.woff2') format('woff2');font-weight:100 900}
  body{margin:0;padding:40px 56px;background:#fff;color:#070707;font:15px/1.45 Inter,sans-serif}
  body.dark{background:#070707;color:#f2f2f0}
  section{border-top:1px solid rgba(7,7,7,.18);padding:18px 0 22px}
  body.dark section{border-color:rgba(242,242,240,.22)}
  p{margin:0 0 14px;color:#3a3d44} body.dark p{color:#b9bcc3}
  .row{display:flex;align-items:flex-end;gap:40px}
  svg{display:block}
  </style><body class="${'${THEME}'}">${rows.join('')}</body>`;
  writeFileSync(join(HERE, 'variants.html'), page.replace('${THEME}', ''));
  writeFileSync(join(HERE, 'variants-dark.html'), page.replace('${THEME}', 'dark'));
  console.log('variants.html, variants-dark.html');
}

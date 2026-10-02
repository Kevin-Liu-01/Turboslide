// The Round 1 brand sheet (docs/NEXT.md 4.1.2, lane B1 day 0): the Turboslide monogram of
// mark-lib.mjs drawn on the surfaces the round changes, before any B1 push. It writes
//
//   marks/monogram.svg        the monogram, one path in currentColor, the GT file's 4 unit clear space
//   marks/monogram-16.svg     the 16 px drawing from its rows, crisp edges, currentColor
//   marks/tile-16.svg         the tab icon: paper plate, 1 px frame, the rows, a prefers-color-scheme block
//   marks/tile-32.svg         the 32 px tile: the same plate and frame, the vector at a 16 px cap
//   marks/app-icon-180.svg    the touch and manifest icon: the paper monogram on an ink square
//   marks/banner.txt          the CLI glyph, the rows as half blocks
//   marks/geometry.json       every number sheet.md cites, the path's sha256 among them
//   pages/*.html              the sheet's pages, which link the product's Inter by path
//
// and with --render it renders the pages with Playwright to pictures/*.png and measures the
// lockup in the rendered pixels (pictures/measure.json). Inter's metrics (cap height, units per
// em, the default instance's T bearing) are read with fontkit from Prototemplate's node_modules
// by absolute path; fontkit draws nothing here. The T's bearing at weight 500 by optical size
// comes from marks/bearing.json, which measure-bearing.mjs reads from rendered pixels; the
// lockup's space after the mark follows it per word size. The render refuses to start at a one
// minute load average of 24 or more (the round's load rule) and records the load beside the
// pictures. --only=<names> re-renders some pages and leaves measure.json as it was.
//
//   node docs/gslides-parity/round1/sheet/measure-bearing.mjs
//   node docs/gslides-parity/round1/sheet/build-sheet.mjs [--render [--only=lockup,decks]]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  TILE_SIZES as TREE_TILES,
  markPlacement,
  markQuadsAt,
  quadPath,
  tileMarkPath,
} from '../../../../packages/theme/src/brand.ts';

import * as fontkit from '/Users/kevinliu/repos/Prototemplate/node_modules/fontkit/dist/module.mjs';

import {
  BASELINE,
  CAP,
  CAP_TOP,
  CUT,
  DEFAULTS,
  ROWS16,
  SKEW_DEG,
  box,
  halfBlocks,
  pathData,
  pixelPath,
  polygons,
  rects,
  round1,
  round2,
} from './mark-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const P = '/Users/kevinliu/repos/Prototemplate';
const MARKS = join(HERE, 'marks');
const PAGES = join(HERE, 'pages');
const PICTURES = join(HERE, 'pictures');
for (const d of [MARKS, PAGES, PICTURES]) mkdirSync(d, { recursive: true });

function writeOut(path, text) {
  writeFileSync(path, text);
  console.log(`${relative(HERE, path).padEnd(28)} ${String(Buffer.byteLength(text)).padStart(7)} B`);
}

/* ---------- the geometry ---------- */

const POLYS = polygons(DEFAULTS);
const D = pathData(POLYS);
const B = box(POLYS);
const ASPECT = B.w / B.h;
const SHA = createHash('sha256').update(D).digest('hex');
const ROWS_D = pixelPath(ROWS16);
const BLOCKS = halfBlocks(ROWS16);
const NAME = 'Turboslide';

/* ---------- Inter's metrics, read with fontkit (never used to draw) ---------- */

const INTER_FILE = join(ROOT, 'packages/fonts/assets/InterVariable.woff2');
const inter = fontkit.openSync(INTER_FILE);
const T_GLYPH = inter.layout('T').glyphs[0];
const CAP_EM = inter.capHeight / inter.unitsPerEm;
const UNIT_EM = CAP_EM / CAP;
const GAP_EM = (CAP / 2) * UNIT_EM;
const T_LSB_EM = T_GLYPH.bbox.minX / inter.unitsPerEm;
/* the margin after the mark's box, which ends at its rightmost ink: half the cap less the T's bearing */
const MARGIN_EM = GAP_EM - T_LSB_EM;
/* The T's bearing at weight 500 moves with Inter's opsz axis, which the browser sets to the font size
   in px between 14 and 32. measure-bearing.mjs reads it from rendered pixels into marks/bearing.json;
   without that file the default instance's bearing from fontkit stands in. */
let BEARING = null;
try {
  BEARING = JSON.parse(readFileSync(join(MARKS, 'bearing.json'), 'utf8'));
} catch {
  BEARING = null;
}
function tBearingEm(px) {
  if (!BEARING) return T_LSB_EM;
  const t = BEARING.tLeftBearingByOpsz;
  const keys = Object.keys(t).map(Number).sort((a, z) => a - z);
  const o = Math.min(keys[keys.length - 1], Math.max(keys[0], px));
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= o) lo = k;
    if (k >= o) {
      hi = k;
      break;
    }
  }
  const v = lo === hi ? t[lo] : t[lo] + ((t[hi] - t[lo]) * (o - lo)) / (hi - lo);
  return v / inter.unitsPerEm;
}
const marginAt = (px) => GAP_EM - tBearingEm(px);
const MARK_W_EM = CAP_EM * ASPECT;

/* ---------- the files ---------- */

const svgFile = (viewBox, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" role="img" aria-label="${NAME}"${extra}>${inner}</svg>\n`;

writeOut(
  join(MARKS, 'monogram.svg'),
  svgFile(`${round1(B.minX - 4)} ${CAP_TOP - 4} ${round1(B.w + 8)} ${CAP + 8}`, `<path d="${D}"/>`),
);
writeOut(
  join(MARKS, 'monogram-16.svg'),
  svgFile('0 0 16 16', `<path d="${ROWS_D}"/>`, ' width="16" height="16" shape-rendering="crispEdges"'),
);

/** The plate and the ink per appearance: the tree's TILE_COLORS (packages/theme/src/brand.ts 231 to 234) */
const TILE = {
  light: { plate: '#ffffff', ink: '#070707', frame: '#656565' },
  dark: { plate: '#070707', ink: '#f2f2f0', frame: '#888887' },
};
const SCHEME = `<style>.p{fill:${TILE.light.plate}}.f{fill:none;stroke:${TILE.light.frame}}.m{fill:${TILE.light.ink}}@media (prefers-color-scheme: dark){.p{fill:${TILE.dark.plate}}.f{stroke:${TILE.dark.frame}}.m{fill:${TILE.dark.ink}}}</style>`;

/**
 * The monogram placed by its cap in whole pixels: the cap is `cap` px, the cap line on pixel row
 * `top`, the box centred horizontally in `size`. Returns the transform as an SVG matrix.
 */
function placeByCap(size, cap, top = Math.round((size - cap) / 2)) {
  const s = cap / CAP;
  const tx = (size - B.w * s) / 2 - B.minX * s;
  const ty = top - CAP_TOP * s;
  const r5 = (n) => Number(n.toFixed(5)).toString();
  return { s, tx, ty, matrix: `matrix(${r5(s)} 0 0 ${r5(s)} ${r5(tx)} ${r5(ty)})` };
}
/** the cap of the monogram "at N px": the whole pixels whose box fits the N px square's width */
const capAt = (n) => Math.floor(n / ASPECT);

writeOut(
  join(MARKS, 'tile-16.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" role="img" aria-label="${NAME}">${SCHEME}<rect class="p" width="16" height="16"/><rect class="f" x=".5" y=".5" width="15" height="15"/><path class="m" d="${ROWS_D}"/></svg>\n`,
);
const T32 = placeByCap(32, 16);
writeOut(
  join(MARKS, 'tile-32.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="${NAME}">${SCHEME}<rect class="p" width="32" height="32"/><rect class="f" x=".5" y=".5" width="31" height="31"/><path class="m" transform="${T32.matrix}" d="${D}"/></svg>\n`,
);
const T180 = placeByCap(180, 76);
writeOut(
  join(MARKS, 'app-icon-180.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="${NAME}"><rect width="180" height="180" fill="#070707"/><path fill="#f2f2f0" transform="${T180.matrix}" d="${D}"/></svg>\n`,
);
writeOut(join(MARKS, 'banner.txt'), BLOCKS.map((l) => l.replace(/\s+$/, '')).join('\n') + '\n');

const RECTS = rects(DEFAULTS);
const geometry = {
  construction: 'docs/gslides-parity/round1/sheet/mark-lib.mjs, from Prototemplate scripts/build-speed-marks.mjs 94 to 142',
  units: { capTop: CAP_TOP, baseline: BASELINE, cap: CAP },
  skewDegrees: SKEW_DEG,
  cut: CUT,
  parameters: DEFAULTS,
  rectangles: Object.fromEntries(RECTS.map(({ name, r }) => [name, r.map((v) => Number(round2(v)))])),
  parallelograms: POLYS.length,
  box: { minX: Number(round2(B.minX)), minY: B.minY, maxX: Number(round2(B.maxX)), maxY: B.maxY, w: Number(round2(B.w)), h: B.h },
  aspect: Number(round2(ASPECT)),
  path: { bytes: Buffer.byteLength(D), sha256: SHA },
  rows16: ROWS16,
  capAtPx: Object.fromEntries([16, 24, 32, 180].map((n) => [n, capAt(n)])),
  tile32Cap: 16,
  appIcon180Cap: 76,
  inter: {
    file: 'packages/fonts/assets/InterVariable.woff2',
    version: inter.version,
    unitsPerEm: inter.unitsPerEm,
    capHeight: inter.capHeight,
    tLeftSideBearingDefaultInstance: T_GLYPH.bbox.minX,
    note: 'fontkit 2.0.4 reads the default instance (wght 400, opsz 14); the render measures weight 500',
  },
  lockup: {
    capEm: Number(CAP_EM.toFixed(6)),
    unitEm: Number(UNIT_EM.toFixed(7)),
    markWidthEm: Number(MARK_W_EM.toFixed(6)),
    gapEm: Number(GAP_EM.toFixed(6)),
    marginAfterMarkEmDefaultInstance: Number(MARGIN_EM.toFixed(6)),
    bearingSource: BEARING ? 'marks/bearing.json (rendered pixels, weight 500)' : 'fontkit default instance',
    marginAfterMarkEmAt: Object.fromEntries([14, 18, 22, 32, 66, 120].map((px) => [px, Number(marginAt(px).toFixed(6))])),
  },
};
writeOut(join(MARKS, 'geometry.json'), JSON.stringify(geometry, null, 2) + '\n');

/* ---------- the marks as markup ---------- */

/** the monogram drawn in an n px square from the vector, its cap in whole pixels (inline, currentColor) */
function markAt(n, cls = 'mk') {
  /* the second pass (sheet-judge.md fix 1): the product's placement, every horizontal edge on a whole row */
  return `<svg class="${cls}" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" aria-hidden="true"><path fill="currentColor" d="${markPlacement(n).d}"/></svg>`;
}
/** the same as a standalone SVG string with an explicit colour, for a canvas */
function markAtSvg(n, fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}"><path fill="${fill}" d="${markPlacement(n).d}"/></svg>`;
}
/** the first pass's placement: the vector scaled to the cap with no hinting, for the comparison */
function markPlainSvg(n, fill) {
  const t = placeByCap(n, capAt(n));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}"><path fill="${fill}" transform="${t.matrix}" d="${D}"/></svg>`;
}
const rowsInline = (cls = 'mk rows') =>
  `<svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${ROWS_D}"/></svg>`;
const rowsSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="${fill}" d="${ROWS_D}"/></svg>`;
const tile16Svg = (ap) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${TILE[ap].plate}"/><rect x=".5" y=".5" width="15" height="15" fill="none" stroke="${TILE[ap].frame}"/><path fill="${TILE[ap].ink}" d="${ROWS_D}"/></svg>`;
const tile32Svg = (ap) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="${TILE[ap].plate}"/><rect x=".5" y=".5" width="31" height="31" fill="none" stroke="${TILE[ap].frame}"/><path fill="${TILE[ap].ink}" d="${tileMarkPath(TREE_TILES[32])}"/></svg>`;
const touchSvg = () => readFileSync(join(MARKS, 'app-icon-180.svg'), 'utf8').trim().replace('<svg ', '<svg class="touch" ');

/** The lockup: the mark at the word's cap, on the word's baseline, half the cap before the word's T. */
const lockup = (px, cls = '') =>
  px === 22
    ? /* the product's lockup (packages/chrome/src/brand.css .ts-brand-lockup): the 24 px placement, its cap rows 4 to 20 as the box, a 7 px gap */
      `<span class="lk ${cls}" style="font-size:${px}px"><svg class="lk-mark" style="width:24px;height:16px;margin-right:7px" viewBox="0 4 24 16" aria-hidden="true"><path fill="currentColor" d="${markPlacement(24).d}"/></svg><span class="lk-word">${NAME}</span></span>`
    : `<span class="lk ${cls}" style="font-size:${px}px"><svg class="lk-mark" style="margin-right:${marginAt(px).toFixed(6)}em" viewBox="${round2(B.minX)} ${CAP_TOP} ${round2(B.w)} ${CAP}" aria-hidden="true"><path fill="currentColor" d="${D}"/></svg><span class="lk-word">${NAME}</span></span>`;

/* ---------- the chrome's Heroicons, read from packages/chrome/src/icons.tsx ---------- */

const ICONS_SRC = readFileSync(join(ROOT, 'packages/chrome/src/icons.tsx'), 'utf8');
function iconPaths(name) {
  const key = /^[a-z]+$/.test(name) ? name : `'${name}'`;
  let at = ICONS_SRC.indexOf(`\n  ${key}: [`);
  let end;
  if (at >= 0) {
    const lineEnd = ICONS_SRC.indexOf('\n', at + 1);
    end = ICONS_SRC.slice(at, lineEnd).trimEnd().endsWith('}],') ? lineEnd : ICONS_SRC.indexOf('\n  ],', at);
  } else {
    const alias = new RegExp(`\\n  ${key}: ([A-Z0-9_]+),`).exec(ICONS_SRC);
    if (!alias) throw new Error(`no icon ${name}`);
    at = ICONS_SRC.indexOf(`const ${alias[1]}: readonly IconPath[] = [`);
    end = ICONS_SRC.indexOf('\n];', at);
  }
  const out = [];
  for (const m of ICONS_SRC.slice(at, end).matchAll(/\{\s*d:\s*'([^']+)'([^}]*)\}/g))
    out.push({ d: m[1], evenodd: /evenodd:\s*true/.test(m[2]) });
  if (!out.length) throw new Error(`no paths for ${name}`);
  return out;
}
const ICON_NAMES = [
  'search', 'plus', 'chevron-down', 'arrow-uturn-left', 'arrow-uturn-right', 'printer', 'paint-brush',
  'cursor-arrow', 'text', 'photo', 'square-2-stack', 'chat', 'view-columns', 'play', 'lock-closed',
  'ellipsis-horizontal', 'ellipsis-vertical', 'bars-3', 'close',
];
const SPRITE =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
  ICON_NAMES.map(
    (n) =>
      `<symbol id="i-${n}" viewBox="0 0 20 20">${iconPaths(n)
        .map((p) => `<path d="${p.d}"${p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}/>`)
        .join('')}</symbol>`,
  ).join('') +
  '</svg>';
const ic = (n, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/** the GT mark of the theme sprite, for the GT template's cover only */
const SPRITE_TS = readFileSync(join(ROOT, 'packages/theme/src/sprite.ts'), 'utf8');
const GT_BODY = /'gt-mark': \{[^}]*body: '([^']+)'/.exec(SPRITE_TS)[1];
const GT_MARK = (cls) => `<svg class="${cls}" viewBox="-8 214 1213 771" fill="currentColor" aria-hidden="true">${GT_BODY}</svg>`;

/** the GT bar monogram, read from Prototemplate public/marks (the speed register's source) */
const GT_BAR = readFileSync(join(P, 'public/marks/bar-monogram.svg'), 'utf8');
const GT_BAR_D = /<path d="([^"]+)"/.exec(GT_BAR)[1];
const GT_BAR_BOX = box(
  [...GT_BAR_D.matchAll(/M([^Z]+)Z/g)].map((m) => m[1].split('L').map((pt) => pt.trim().split(/\s+/).map(Number))),
);

/** brand B's outlined weight 800 wordmark, read from its folder (question 2) */
const B_WORD = readFileSync(join(ROOT, 'docs/gslides-parity/next/brand-b/marks/wordmark.svg'), 'utf8');
const B_WORD_D = /<path d="([^"]+)"/.exec(B_WORD)[1];
const B_WORD_VB = /viewBox="([^"]+)"/.exec(B_WORD)[1].split(/\s+/).map(Number);
/* the file's box is padded by 4 units; the cap runs from y 40 to the baseline at 160 */
const B_WORD_X = [B_WORD_VB[0] + 4, B_WORD_VB[2] - 8];
const bWordmark = (capPx, cls = 'bw') =>
  `<svg class="${cls}" style="height:${capPx}px;width:${round2((capPx * B_WORD_X[1]) / CAP)}px" viewBox="${round2(B_WORD_X[0])} ${CAP_TOP} ${round2(B_WORD_X[1])} ${CAP}" aria-hidden="true"><path fill="currentColor" d="${B_WORD_D}"/></svg>`;

/** Google's standard G, the brand mark class (brand-b/render-mockups.mjs 86 to 88) */
const GOOGLE_G =
  '<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

/* ---------- the pages ---------- */

const FONT_CSS = relative(PAGES, join(ROOT, 'packages/fonts/src/inter.css'));

/* the chrome's tokens, copied from packages/chrome/src/tokens.css 25 to 57 (light) and 155 to 170
   (dark; the scrim is not remapped, tokens.css 150), with the selection of question 3 (#2f5ce0 in
   both appearances, white chip text) */
const BASE_CSS = `
:root, .ap-light {
  --pt-paper: #ffffff; --pt-ink: #070707; --pt-ink-2: #3a3d44; --pt-titanium: #6f747d;
  --pt-hair: rgba(7, 7, 7, 0.18); --pt-hair-soft: rgba(7, 7, 7, 0.09); --pt-plate: rgba(7, 7, 7, 0.06);
  --pt-cross: rgba(7, 7, 7, 0.38); --pt-edge: rgba(7, 7, 7, 0.62); --pt-scrim: rgba(7, 7, 7, 0.28);
  --stage: #f0f0f0;
}
:root[data-theme='dark'], .ap-dark {
  --pt-paper: #070707; --pt-ink: #f2f2f0; --pt-ink-2: #b9bcc3; --pt-titanium: #8a8f98;
  --pt-hair: rgba(242, 242, 240, 0.22); --pt-hair-soft: rgba(242, 242, 240, 0.1); --pt-plate: rgba(242, 242, 240, 0.08);
  --pt-cross: rgba(255, 255, 255, 0.34); --pt-edge: rgba(242, 242, 240, 0.55);
  --stage: #161616;
}
:root {
  --pt-select: #2f5ce0; --pt-select-text: #ffffff; --pt-radius: 6px; --panel: #101010;
  --sans: 'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --ts-rail: 1104px; --ts-nav-h: 58px; --ts-cross: 9px; --ts-gutter: 40px;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--pt-paper); color: var(--pt-ink); font: 400 16px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
.ap-light, .ap-dark { background: var(--pt-paper); color: var(--pt-ink); }
.ic { width: 16px; height: 16px; fill: currentColor; flex: none; display: block; }
.mk { display: block; flex: none; color: var(--pt-ink); }
.mk.rows { shape-rendering: crispEdges; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; }
h1, h2, h3, p { margin: 0; }
h1 { font: 500 32px/1.2 var(--sans); letter-spacing: -0.02em; }
h2 { font: 500 22px/1.3 var(--sans); letter-spacing: -0.01em; }
.cap { font-size: 15px; line-height: 1.5; color: var(--pt-titanium); }
.lead { font-size: 16px; line-height: 1.55; color: var(--pt-ink-2); max-width: 760px; }
/* the lockup (brand-a.md 34 to 43): the word's cap is the mark's cap, the baselines meet, half the cap between */
.lk { display: inline-block; line-height: 1; white-space: nowrap; color: var(--pt-ink); }
.lk-mark { display: inline-block; vertical-align: baseline; height: ${CAP_EM.toFixed(6)}em; width: ${MARK_W_EM.toFixed(6)}em; margin-right: ${marginAt(22).toFixed(6)}em; overflow: visible; }
.lk-word { font-weight: 500; font-feature-settings: 'cv11', 'ss01'; letter-spacing: -0.01em; }
/* ruled key and value rows (DECK-GRAMMAR 36) */
.rows { border-top: 1px solid var(--pt-hair); }
.rows > div { display: grid; grid-template-columns: var(--key, 180px) 1fr; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--pt-hair); font-size: 15px; line-height: 1.45; }
.rows > div > b { font-weight: 500; }
.rows > div > span { color: var(--pt-ink-2); }
`;

const page = (title, css, body, script = '') => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${FONT_CSS}">
<style>${BASE_CSS}${css}</style>
<script>{ const t = new URLSearchParams(location.search).get('theme'); if (t) document.documentElement.dataset.theme = t; }</script>
</head>
<body>${SPRITE}${body}
<script>
(async () => {
  await document.fonts.ready;
  ${script}
  document.body.dataset.ready = '1';
})();
</script>
</body>
</html>
`;

/* a canvas that shows an SVG rasterised at 1x, enlarged by `zoom` without smoothing */
let zoomId = 0;
const ZOOMS = [];
function zoom(svg, n, z) {
  const id = `z${zoomId++}`;
  ZOOMS.push({ id, svg, n });
  return `<canvas id="${id}" class="zoom" width="${n}" height="${n}" style="width:${n * z}px;height:${n * z}px"></canvas>`;
}
const zoomScript = () => `
  const Z = ${JSON.stringify(ZOOMS.splice(0))};
  for (const { id, svg, n } of Z) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    document.getElementById(id).getContext('2d').drawImage(img, 0, 0, n, n);
  }`;

/* ---- 1. the marks: the monogram at 16, 24, 32 and 180 px in both appearances ---- */
{
  const panel = (ap, title, text) => {
    const ink = TILE[ap].ink;
    const strip =
      ap === 'light'
        ? { bg: '#dee1e6', active: '#ffffff', text: '#1f1f1f', idle: '#5f6368', fav: '#9aa0a6' }
        : { bg: '#202124', active: '#35363a', text: '#e8eaed', idle: '#9aa0a6', fav: '#5f6368' };
    return `
<section class="ap-${ap} pn">
  <h2>${title}</h2>
  <p class="cap">${text}</p>
  <div class="row r1">
    <figure>${markAt(180)}<figcaption>180 px</figcaption></figure>
    <figure>${markAt(32)}<figcaption>32 px</figcaption></figure>
    <figure>${markAt(24)}<figcaption>24 px</figcaption></figure>
    <figure>${rowsInline()}<figcaption>16 px rows</figcaption></figure>
  </div>
  <div class="row r2">
    <figure>${zoom(markAtSvg(32, ink), 32, 3)}<figcaption>32 px, 3x</figcaption></figure>
    <figure>${zoom(markAtSvg(24, ink), 24, 4)}<figcaption>24 px hinted, 4x</figcaption></figure>
    <figure>${zoom(markPlainSvg(24, ink), 24, 4)}<figcaption>24 px plain, 4x</figcaption></figure>
    <figure>${zoom(rowsSvg(ink), 16, 6)}<figcaption>16 px rows, 6x</figcaption></figure>
    <figure>${zoom(markPlainSvg(16, ink), 16, 6)}<figcaption>16 px vector, 6x</figcaption></figure>
  </div>
  <div class="row r3">
    <figure><div class="pair">${tile16Svg(ap).replace('<svg ', '<svg class="t1" ')}${zoom(tile16Svg(ap), 16, 8)}</div><figcaption>Tab icon, 16 px</figcaption></figure>
    <figure><div class="pair">${tile32Svg(ap).replace('<svg ', '<svg class="t1" ')}${zoom(tile32Svg(ap), 32, 4)}</div><figcaption>Tile, 32 px</figcaption></figure>
    <figure>${touchSvg()}<figcaption>Touch icon, 180 px</figcaption></figure>
  </div>
  <div class="strip" style="background:${strip.bg}">
    <span class="tab on" style="background:${strip.active};color:${strip.text}">${tile16Svg(ap)}Untitled presentation - Turboslide</span>
    <span class="tab" style="color:${strip.idle}"><i style="background:${strip.fav}"></i>Inbox</span>
    <span class="tab" style="color:${strip.idle}"><i style="background:${strip.fav}"></i>Calendar</span>
  </div>
</section>`;
  };
  const css = `
body { display: grid; grid-template-columns: 720px 720px; width: 1440px; height: 900px; overflow: hidden; }
.pn { padding: 32px 40px; height: 900px; }
.pn .cap { margin: 6px 0 20px; max-width: 600px; }
.row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 22px; }
figure { margin: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
figcaption { font-size: 15px; line-height: 1.4; color: var(--pt-titanium); white-space: nowrap; }
.zoom { image-rendering: pixelated; display: block; outline: 1px solid var(--pt-hair-soft); }
.pair { display: flex; align-items: flex-end; gap: 12px; }
.pair .t1 { display: block; }
.touch { display: block; outline: 1px solid var(--pt-hair); }
.strip { display: flex; align-items: flex-end; height: 40px; padding: 0 8px; gap: 2px; margin-top: 6px; }
.tab { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; font: 400 12px/1 var(--sans); width: 190px; white-space: nowrap; overflow: hidden; }
.tab.on { width: 240px; }
.tab i { width: 16px; height: 16px; display: block; flex: none; }
.tab svg { flex: none; display: block; }
`;
  const body =
    panel('light', 'On paper', 'The monogram at 180, 32 and 24 px from the vector with every horizontal edge on a whole row, and at 16 px from its rows, at 1x. The second row shows the same pixels enlarged, with the plain scaled 24 px placement of the first pass beside the hinted one.') +
    panel('dark', 'On ink', 'The same files under the dark tokens. The tab icon and the tile carry a prefers-color-scheme block that swaps the plate and the ink.');
  writeOut(join(PAGES, 'marks.html'), page('Monogram sizes', css, body, zoomScript()));
}

/* ---- 2. the construction ---- */
{
  const S = 2; /* px per unit */
  const top = 36;
  const Y = (u) => round2(top + (u - CAP_TOP) * S);
  /* the upright figure: x from the middle bar's left end (-4) to the crossbar's right end */
  const upMin = Math.min(...RECTS.map(({ r }) => r[0]));
  const upMax = Math.max(...RECTS.map(({ r }) => r[0] + r[2]));
  const upX = (u) => round2(20 + (u - upMin) * S);
  const shearLeft = 20 + (upMax - upMin) * S + 64;
  const shX = shearLeft - B.minX * S;
  const labelX = Math.round(shearLeft + B.w * S + 36);
  const W = 920;
  const H = Math.round(top + CAP * S + 48);
  const guides = [
    [CAP_TOP, `Cap line, y ${CAP_TOP}`],
    [CUT[0], `Cut, y ${CUT[0]} to ${CUT[1]}`],
    [BASELINE, `Baseline, y ${BASELINE}`],
  ];
  const fig = `<svg class="dia" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="${Y(CUT[0])}" width="${labelX - 16}" height="${(CUT[1] - CUT[0]) * S}" fill="var(--pt-plate)"/>
    ${guides.map(([y, label]) => `<line x1="0" x2="${labelX - 16}" y1="${Y(y)}" y2="${Y(y)}" class="hair"/><text x="${labelX}" y="${Number(Y(y)) + 6}" class="lab">${label}</text>`).join('')}
    ${RECTS.map(({ r: [x, y, w, h] }) => `<rect x="${upX(x)}" y="${Y(y)}" width="${w * S}" height="${h * S}" class="up"/>`).join('')}
    <path d="${D}" transform="matrix(${S} 0 0 ${S} ${round2(shX)} ${round2(top - CAP_TOP * S)})" fill="var(--pt-ink)"/>
    <text x="20" y="${H - 6}" class="cap2">Five rectangles, upright</text>
    <text x="${round2(shearLeft)}" y="${H - 6}" class="cap2">Sheared 12 degrees, then cut</text>
  </svg>`;
  const css = `
body { width: 1440px; height: 900px; overflow: hidden; padding: 40px 56px; }
.top { display: flex; justify-content: space-between; gap: 48px; }
.top .lead { margin-top: 10px; max-width: 700px; }
.dia { display: block; margin-top: 18px; overflow: visible; }
.dia .hair { stroke: var(--pt-hair); stroke-width: 1; }
.dia .up { fill: var(--pt-plate); stroke: var(--pt-ink-2); stroke-width: 1; }
.dia .lab { font: 400 16px var(--sans); fill: var(--pt-ink-2); }
.dia .cap2 { font: 400 15px var(--sans); fill: var(--pt-titanium); }
.grid { display: grid; grid-template-columns: 920px 1fr; gap: 40px; }
.side { padding-top: 18px; }
.rows { --key: 104px; }
.rows > div { gap: 12px; padding: 8px 0; }
.sib { display: flex; align-items: flex-end; gap: 64px; margin-top: 40px; padding-top: 28px; border-top: 1px solid var(--pt-hair); }
.sib figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.sib figcaption { font-size: 15px; color: var(--pt-titanium); }
.sib svg { display: block; color: var(--pt-ink); }
.key { display: flex; gap: 20px; margin-top: 8px; font-size: 15px; color: var(--pt-ink-2); }
.key i { display: inline-block; width: 22px; height: 12px; margin-right: 8px; vertical-align: -1px; }
`;
  const cap = 80;
  const gtW = (cap * GT_BAR_BOX.w) / CAP;
  const body = `
<div class="top"><div><h1>The monogram from rectangles</h1>
<p class="lead">Five rectangles in the GT bar monogram's units are sheared 12 degrees and cut once at mid cap height. The result is ${POLYS.length} parallelograms in one path in currentColor, with no font, no mask and no id.</p></div></div>
<div class="grid"><div>
${fig}
<div class="sib">
<figure><svg style="height:${cap}px;width:${round2(gtW)}px" viewBox="${round2(GT_BAR_BOX.minX)} ${CAP_TOP} ${round2(GT_BAR_BOX.w)} ${CAP}"><path fill="currentColor" d="${GT_BAR_D}"/></svg><figcaption>The GT bar monogram</figcaption></figure>
<figure><svg style="height:${cap}px;width:${round2(cap * ASPECT)}px" viewBox="${round2(B.minX)} ${CAP_TOP} ${round2(B.w)} ${CAP}"><path fill="currentColor" d="${D}"/></svg><figcaption>The Turboslide monogram</figcaption></figure>
</div>
<p class="cap" style="margin-top:10px">Both are set at an 80 px cap. They share the skew, the cut, the crossbar's 30 units and the bars' 30, 36 and 30.</p>

</div><div class="side">
<div class="rows">
<div><b>Units</b><span>The GT monogram's: a cap of ${CAP} units from y ${CAP_TOP} to the baseline at y ${BASELINE}</span></div>
<div><b>Skew</b><span>${SKEW_DEG} degrees: x becomes x minus tan(${SKEW_DEG}°) times y</span></div>
<div><b>Cut</b><span>y ${CUT[0]} to ${CUT[1]}, 8 units, applied to the geometry</span></div>
<div><b>Crossbar</b><span>${RECTS[0].r[2]} by ${RECTS[0].r[3]} units: an arm of ${DEFAULTS.arm} on each side of a ${DEFAULTS.stem} unit stem</span></div>
<div><b>Top bar</b><span>Extends the arm ${DEFAULTS.ext} units past its left end, overlapping it by 2</span></div>
<div><b>Middle bar</b><span>${RECTS[3].r[2]} by ${DEFAULTS.midH} units on the cut, left as two lines of 14, ${DEFAULTS.gap} units clear of the stem</span></div>
<div><b>Bottom bar</b><span>${RECTS[4].r[2]} by ${DEFAULTS.bottomH} units, ${DEFAULTS.gap} units clear of the stem</span></div>
<div><b>The file</b><span>${Buffer.byteLength(D)} bytes of path data, box ${round1(B.w)} by ${CAP}, aspect ${round2(ASPECT)}, sha256 ${SHA.slice(0, 12)}</span></div>
</div>
</div></div>`;
  writeOut(join(PAGES, 'construction.html'), page('Monogram construction', css, body));
}

/* ---- 3. the lockup ---- */
{
  const css = `
body { width: 1440px; height: 900px; overflow: hidden; padding: 40px 56px; }
.lead { margin-top: 10px; }
.hero { position: relative; margin: 64px 0 0 0; height: 200px; }
.hero .lk { position: absolute; left: 0; top: 40px; }
.guide { position: absolute; left: -20px; right: 280px; height: 0; border-top: 1px solid var(--pt-hair); }
.glab { position: absolute; right: 120px; font-size: 15px; color: var(--pt-ink-2); transform: translateY(-50%); }
.gap { position: absolute; height: 0; border-top: 1px solid var(--pt-ink-2); }
.gap::before, .gap::after { content: ''; position: absolute; top: -6px; width: 1px; height: 11px; background: var(--pt-ink-2); }
.gap::before { left: 0; } .gap::after { right: 0; }
.gaplab { position: absolute; font-size: 15px; color: var(--pt-ink-2); white-space: nowrap; }
.cols { display: grid; grid-template-columns: 1fr 520px; gap: 64px; margin-top: 64px; }
.sizes > div { display: grid; grid-template-columns: 240px 1fr; align-items: center; min-height: 64px; border-bottom: 1px solid var(--pt-hair); }
.sizes { border-top: 1px solid var(--pt-hair); }
.sizes > div > span:first-child { font-size: 15px; line-height: 1.4; color: var(--pt-titanium); }
.rows { --key: 170px; }
`;
  const sizes = [
    [66, 'Word 66 px, cap 48 px'],
    [22, 'Word 22 px: the /decks bar and the Sign in plate'],
    [18, 'Word 18 px'],
    [14, 'Word 14 px'],
  ];
  const body = `
<h1>The lockup</h1>
<p class="lead">The word is live Inter 500. Its cap height equals the mark's cap, the two baselines meet, and the gap from the mark's crossbar to the word's T is half the cap. These are brand A's rules applied to the new monogram.</p>
<div class="hero" id="hero">${lockup(120, 'big')}</div>
<div class="cols"><div class="sizes">
${sizes.map(([px, label]) => `<div><span>${label}</span><div>${lockup(px)}</div></div>`).join('')}
<div><span>The title row's home link, 24 px</span><div>${markAt(24)}</div></div>
</div><div>
<div class="rows" id="facts">
<div><b>Cap</b><span>${CAP_EM.toFixed(4)} em: Inter's ${inter.capHeight} of ${inter.unitsPerEm} units, and the mark's ${CAP} units</span></div>
<div><b>Mark width</b><span>${MARK_W_EM.toFixed(4)} em at the aspect ${round2(ASPECT)}</span></div>
<div><b>Gap</b><span>${GAP_EM.toFixed(4)} em from ink to ink: the space after the mark's box is that less the T's left bearing, which Inter's optical size moves (${marginAt(22).toFixed(4)} em at 22 px, ${marginAt(32).toFixed(4)} em from 32 px)</span></div>
<div><b>Word</b><span>Inter 500, cv11 and ss01, tracking -0.01 em, the app bar's setting</span></div>
<div><b>Measured here</b><span id="measured">Read from this picture's pixels by the render</span></div>
</div></div></div>`;
  const script = `
  const hero = document.getElementById('hero');
  const lk = hero.querySelector('.lk');
  const mark = lk.querySelector('.lk-mark').getBoundingClientRect();
  const word = lk.querySelector('.lk-word');
  const h = hero.getBoundingClientRect();
  const cs = getComputedStyle(word);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' Inter';
  const m = ctx.measureText('T');
  const inkLeft = word.getBoundingClientRect().left - m.actualBoundingBoxLeft;
  const add = (cls, style, text = '') => { const el = document.createElement('div'); el.className = cls; Object.assign(el.style, style); el.textContent = text; hero.appendChild(el); return el; };
  add('guide', { top: (mark.top - h.top) + 'px' });
  add('guide', { top: (mark.bottom - h.top) + 'px' });
  add('glab', { top: (mark.top - h.top) + 'px' }, 'Cap line, shared');
  add('glab', { top: (mark.bottom - h.top) + 'px' }, 'Baseline, shared');
  const gy = mark.top - h.top - 14;
  add('gap', { left: (mark.right - h.left) + 'px', width: (inkLeft - mark.right) + 'px', top: gy + 'px' });
  add('gaplab', { left: (mark.right - h.left) + 'px', top: (gy - 30) + 'px' }, 'Half the cap');
  window.__lockup = { markLeft: mark.left, markRight: mark.right, markTop: mark.top, markBottom: mark.bottom, inkLeft, tAscent: m.actualBoundingBoxAscent, tLeft: m.actualBoundingBoxLeft, fontSize: cs.fontSize };`;
  writeOut(join(PAGES, 'lockup.html'), page('Turboslide lockup', css, body, script));
}

/* ---- 4. question 2: brand B's outlined weight 800 wordmark beside the live Inter 500 word ---- */
{
  const css = `
body { width: 1440px; height: 900px; overflow: hidden; }
.pn { height: 450px; padding: 36px 56px; }
.pn .lead { margin-top: 8px; }
.cmp { margin-top: 28px; border-top: 1px solid var(--pt-hair); }
.cmp > div { display: grid; grid-template-columns: 300px 1fr 360px; align-items: center; gap: 32px; height: 128px; border-bottom: 1px solid var(--pt-hair); }
.cmp b { font-weight: 500; font-size: 15px; display: block; }
.cmp small { display: block; font-size: 15px; color: var(--pt-titanium); line-height: 1.4; margin-top: 2px; }
.cmp .bw { display: block; color: var(--pt-ink); overflow: visible; }
.bar { display: flex; align-items: center; height: 58px; padding: 0 16px; border: 1px solid var(--pt-hair); }
`;
  const panel = (ap, head) => `
<section class="ap-${ap} pn">
${head}
<div class="cmp">
<div><span><b>Outlined wordmark</b><small>Brand B: Inter 800 widened, slanted and cut</small></span>${bWordmark(48)}<div class="bar">${bWordmark(16)}</div></div>
<div><span><b>Live word with the monogram</b><small>The default of question 2: Inter 500</small></span><div>${lockup(66)}</div><div class="bar">${lockup(22)}</div></div>
</div>
</section>`;
  const body =
    panel(
      'light',
      `<h1>The outlined wordmark beside the live word</h1><p class="lead">Question 2 asks whether a wordmark's outlines may exceed weight 500. Each row sets the name at a 48 px cap and again in a 58 px bar at a 16 px cap.</p>`,
    ) + panel('dark', `<h2>On ink</h2>`);
  writeOut(join(PAGES, 'question2.html'), page('Wordmark comparison', css, body));
}

/* ---- 5. the editor's title row at 1440 and 390 px ---- */
{
  const css = `
body { height: 100vh; overflow: hidden; display: grid; grid-template-rows: 44px 28px 40px 1fr; font: 400 13px/1 var(--sans); }
.title { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px 0 10px; border-bottom: 1px solid var(--pt-hair); min-width: 0; }
.tl, .tr { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tl { flex: 1 1 auto; }
.home { width: 32px; height: 32px; display: grid; place-items: center; flex: none; color: var(--pt-ink); }
.name { font: 500 14px/1 var(--sans); letter-spacing: -0.005em; padding: 0 8px; height: 32px; display: flex; align-items: center; min-width: 96px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.word { height: 32px; padding: 0 8px; display: inline-flex; align-items: center; color: var(--pt-ink); font-size: 13px; }
.glyph { width: 32px; height: 32px; display: grid; place-items: center; color: var(--pt-ink-2); flex: none; }
.show { display: inline-flex; height: 32px; border-radius: 8px; background: var(--pt-ink); color: var(--pt-paper); overflow: hidden; flex: none; }
.show .lab { display: inline-flex; align-items: center; gap: 8px; padding: 0 12px 0 14px; font-weight: 500; }
.show .split { display: grid; place-items: center; width: 28px; border-left: 1px solid rgba(127,127,127,.45); }
.show.key { width: 32px; justify-content: center; align-items: center; }
.share { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--pt-hair); font-weight: 500; flex: none; }
.menus { display: flex; align-items: center; gap: 2px; padding: 0 8px 0 52px; }
.menus span { padding: 0 8px; height: 24px; display: inline-flex; align-items: center; }
.tools { display: flex; align-items: center; gap: 4px; padding: 0 10px; border-bottom: 1px solid var(--pt-hair); color: var(--pt-ink-2); }
.tools .sep { width: 1px; height: 20px; background: var(--pt-hair); margin: 0 8px; }
.tools .t { width: 28px; height: 28px; display: grid; place-items: center; }
.tools .w { padding: 0 8px; height: 28px; display: inline-flex; align-items: center; color: var(--pt-ink); }
.body { display: grid; grid-template-columns: 208px 1fr; min-height: 0; }
.film { border-right: 1px solid var(--pt-hair); padding: 12px 12px 0 8px; display: flex; gap: 8px; align-items: flex-start; }
.film .n { width: 14px; text-align: right; color: var(--pt-ink-2); padding-top: 4px; }
.thumb { width: 168px; aspect-ratio: 16 / 9; background: #ffffff; outline: 2px solid var(--pt-ink); outline-offset: 2px; position: relative; }
.stagewrap { background: var(--stage); display: grid; grid-template-rows: 1fr 64px; min-height: 0; }
.stage { display: grid; place-items: center; padding: 28px; min-height: 0; }
.slide { width: min(100%, calc((100vh - 112px - 64px - 56px) * 16 / 9)); aspect-ratio: 16 / 9; background: #ffffff; color: #070707; position: relative; box-shadow: 0 0 0 1px rgba(7,7,7,.12); container-type: inline-size; }
.slide .t { position: absolute; left: 9%; top: 42%; font: 500 5.4cqw/1.1 var(--sans); letter-spacing: -0.03em; color: #8a8f98; }
.slide .s { position: absolute; left: 9%; top: 56%; font: 400 1.7cqw/1.3 var(--sans); color: #8a8f98; }
.thumb .t { position: absolute; left: 9%; top: 40%; font: 500 9px/1 var(--sans); color: #8a8f98; }
.notes { background: var(--pt-paper); border-top: 1px solid var(--pt-hair); padding: 14px 28px; color: var(--pt-titanium); font-size: 14px; }
/* the phone editor under 720 px (NEXT.md 4.1.3 item 18): one Menus key, the filmstrip under the sheet */
@media (max-width: 719px) {
  body { grid-template-rows: 44px 40px 1fr; }
  .menus { display: none; }
  .title { padding: 0 8px 0 4px; gap: 6px; }
  .tr { gap: 6px; }
  .tools { padding: 0 8px; }
  .body { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
  .stagewrap { grid-template-rows: auto; }
  .stage { padding: 16px; }
  .slide { width: 100%; }
  .film { order: 2; border-right: 0; border-top: 1px solid var(--pt-hair); padding: 14px 16px; }
  .thumb { width: 104px; }
  .add { width: 58px; aspect-ratio: 1; display: grid; place-items: center; border: 1px solid var(--pt-hair); color: var(--pt-ink-2); margin-left: 8px; }
  .notes { order: 3; padding: 14px 16px; }
}
@media (min-width: 720px) { .add, .wide-hide { display: none; } }
`;
  const titleWide = `
<header class="title">
  <div class="tl"><a class="home" aria-label="Turboslide">${markAt(24)}</a><span class="name">Untitled presentation</span></div>
  <div class="tr">
    <span class="word">Assist</span>
    <span class="glyph">${ic('chat')}</span>
    <span class="glyph">${ic('view-columns')}</span>
    <span class="show"><span class="lab">Slideshow ${ic('play')}</span><span class="split">${ic('chevron-down')}</span></span>
    <span class="share">${ic('lock-closed')}Share</span>
    <span class="word">Sign In</span>
  </div>
</header>
<nav class="menus">${['File', 'Edit', 'View', 'Insert', 'Format', 'Slide', 'Arrange', 'Tools', 'Help'].map((m) => `<span>${m}</span>`).join('')}</nav>
<div class="tools">
  <span class="t">${ic('search')}</span><span class="t">${ic('plus')}</span><span class="t">${ic('arrow-uturn-left')}</span><span class="t">${ic('arrow-uturn-right')}</span><span class="t">${ic('printer')}</span><span class="t">${ic('paint-brush')}</span><span class="w">Fit</span>
  <span class="sep"></span>
  <span class="t">${ic('cursor-arrow')}</span><span class="t">${ic('text')}</span><span class="t">${ic('photo')}</span><span class="t">${ic('square-2-stack')}</span><span class="t">${ic('chat')}</span>
  <span class="sep"></span>
  <span class="w">Background</span><span class="w">Layout</span><span class="w">Theme</span>
</div>`;
  const titlePhone = `
<header class="title">
  <div class="tl"><a class="home" aria-label="Turboslide">${markAt(24)}</a><span class="name">Untitled presentation</span></div>
  <div class="tr">
    <span class="show key" aria-label="Slideshow">${ic('play')}</span>
    <span class="share">${ic('lock-closed')}Share</span>
    <span class="glyph" aria-label="More">${ic('ellipsis-horizontal')}</span>
  </div>
</header>
<div class="tools">
  <span class="w" style="gap:8px">${ic('bars-3')}Menus</span><span class="sep"></span>
  <span class="t">${ic('arrow-uturn-left')}</span><span class="t">${ic('arrow-uturn-right')}</span><span class="t">${ic('plus')}</span><span class="t">${ic('text')}</span><span class="t">${ic('photo')}</span><span class="t">${ic('square-2-stack')}</span><span class="t">${ic('chat')}</span>
</div>`;
  const rest = `
<div class="body">
  <aside class="film"><span class="n">1</span><div class="thumb"><span class="t">Click to add title</span></div><span class="add">${ic('plus')}</span></aside>
  <div class="stagewrap"><div class="stage"><div class="slide"><span class="t">Click to add title</span><span class="s">Click to add subtitle</span></div></div><div class="notes wide-only">Click to add speaker notes</div></div>
</div>`;
  const script = `
  const phone = innerWidth < 720;
  document.getElementById('wide').hidden = phone;
  document.getElementById('phone').hidden = !phone;
  if (phone) {
    const body = document.querySelector('.body');
    const film = body.querySelector('.film');
    const stagewrap = body.querySelector('.stagewrap');
    const notes = stagewrap.querySelector('.notes');
    body.appendChild(film);
    body.appendChild(notes);
  }
  const name = document.querySelector('#' + (phone ? 'phone' : 'wide') + ' .name');
  window.__title = { nameWidth: name.getBoundingClientRect().width, rowRight: document.querySelector('#' + (phone ? 'phone' : 'wide') + ' .tr').getBoundingClientRect().right, viewport: innerWidth };`;
  const body = `<div id="wide" style="display:contents">${titleWide}</div><div id="phone" style="display:contents" hidden>${titlePhone}</div>${rest}`;
  writeOut(
    join(PAGES, 'editor.html'),
    page('Editor title row', css + '[hidden] { display: none !important; }', body, script),
  );
}

/* ---- 6. the /decks bar ---- */
{
  const css = `
body { position: relative; min-height: 100vh; overflow: hidden; font-size: 15px; }
.rails { position: absolute; top: 0; bottom: 0; left: 50%; width: min(var(--ts-rail), calc(100% - 32px)); transform: translateX(-50%); border-left: 1px solid var(--pt-hair); border-right: 1px solid var(--pt-hair); pointer-events: none; }
.col { width: min(var(--ts-rail), calc(100% - 32px)); margin: 0 auto; padding: 0 var(--ts-gutter); position: relative; }
.seam { position: relative; border-top: 1px solid var(--pt-hair); }
.cross { position: absolute; top: -4px; width: 9px; height: 9px; background: linear-gradient(var(--pt-cross), var(--pt-cross)) 4px 0 / 1px 9px no-repeat, linear-gradient(var(--pt-cross), var(--pt-cross)) 0 4px / 9px 1px no-repeat; }
.bar { height: var(--ts-nav-h); display: grid; grid-template-columns: 1fr minmax(0, 480px) 1fr; align-items: center; gap: 24px; }
.search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--pt-hair); border-radius: var(--pt-radius); color: var(--pt-titanium); font-size: 14px; }
.end { justify-self: end; }
.signin { height: 32px; padding: 0 8px; margin-right: -8px; display: inline-flex; align-items: center; font: 500 14px/1 var(--sans); }
h2 { font-size: 18px; }
.start { padding-block: 28px 32px; }
.start .head { display: flex; justify-content: space-between; align-items: baseline; }
.start .head a { font-size: 14px; color: var(--pt-ink-2); text-decoration: underline; text-underline-offset: 3px; }
.tiles { display: flex; gap: 24px; margin-top: 16px; }
.tile { width: 208px; }
.tile .pl { aspect-ratio: 16 / 9; border: 1px solid var(--pt-hair); display: grid; place-items: center; background: #ffffff; color: #3a3d44; }
.tile .pl.gt { background: #070707; color: #f2f2f0; border-color: var(--pt-hair); }
.tile .pl.gt svg { width: 46px; height: auto; }
.tile .pl .ic { width: 40px; height: 40px; }
.tile b { display: block; font-weight: 500; font-size: 14px; margin-top: 10px; }
.hatch { height: 24px; background-image: repeating-linear-gradient(-45deg, var(--pt-hair) 0 1px, transparent 1px 8px); }
.list { padding-block: 26px; }
.lrows { margin-top: 14px; border-top: 1px solid var(--pt-hair); }
.lrows > div { display: grid; grid-template-columns: 64px 1fr 180px 200px 32px; gap: 16px; align-items: center; height: 56px; border-bottom: 1px solid var(--pt-hair); font-size: 14px; }
.lrows > div.h { height: 36px; color: var(--pt-titanium); font-size: 13px; }
.lrows .th { width: 64px; height: 36px; border: 1px solid var(--pt-edge); background: #ffffff; position: relative; }
.lrows .th i { position: absolute; left: 7px; top: 13px; width: 28px; height: 3px; background: #3a3d44; }
.lrows .th i + i { top: 19px; width: 18px; height: 2px; background: #8a8f98; }
.lrows .nm { font-weight: 500; }
.glyph { width: 32px; height: 32px; display: grid; place-items: center; color: var(--pt-ink-2); }
.lrows .mu { color: var(--pt-ink-2); }
@media (max-width: 719px) {
  :root { --ts-gutter: 16px; }
  .bar { grid-template-columns: auto 1fr auto; gap: 12px; }
  .search { min-width: 0; }
  .search span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tiles { gap: 12px; }
  .tile { width: calc(50% - 6px); }
  .lrows > div { grid-template-columns: 64px 1fr 32px; }
  .lrows .hide { display: none; }
}
@media (max-width: 479px) {
  .search { justify-self: end; width: 36px; padding: 0; justify-content: center; color: var(--pt-ink-2); }
  .search span { display: none; }
}
`;
  const rows = [
    ['Q4 board update', 'You', 'Today at 6:38 PM'],
    ['Acme renewal pitch', 'You', 'Today at 2:10 PM'],
    ['Hiring plan for 2027', 'Shared with you', 'Yesterday at 4:52 PM'],
    ['October design review', 'You', 'Sep 26, 2026'],
  ];
  const seam = () => `<div class="seam"><span class="cross" style="left:calc((100% - min(var(--ts-rail), calc(100% - 32px))) / 2 - 4px)"></span><span class="cross" style="right:calc((100% - min(var(--ts-rail), calc(100% - 32px))) / 2 - 4px)"></span></div>`;
  const body = `
<div class="rails"></div>
<header class="col bar">${lockup(22)}<label class="search">${ic('search')}<span>Search presentations</span></label><span class="end"><span class="signin">Sign In</span></span></header>
${seam()}
<section class="col start"><div class="head"><h2>Start a new presentation</h2><a>Template gallery</a></div>
<div class="tiles"><div class="tile"><div class="pl">${ic('plus')}</div><b>Blank presentation</b></div><div class="tile"><div class="pl gt">${GT_MARK('gtm')}</div><b>GT brand deck</b></div></div></section>
${seam()}
<div class="col hatch"></div>
${seam()}
<section class="col list"><h2>Recent presentations</h2>
<div class="lrows"><div class="h"><span></span><span>Name</span><span class="hide">Owner</span><span class="hide">Last opened by me</span><span></span></div>
${rows.map(([n, o, d]) => `<div><span class="th"><i></i><i></i></span><span class="nm">${n}</span><span class="mu hide">${o}</span><span class="mu hide">${d}</span><span class="glyph">${ic('ellipsis-vertical')}</span></div>`).join('')}
</div></section>`;
  writeOut(join(PAGES, 'decks.html'), page('Presentations bar', css, body));
}

/* ---- 7. the Sign in plate with the lockup at its head ---- */
/* the mood picture of question 5 (the second pass, sheet-judge.md fix 7): NASA's Blue Marble, public
   domain by lane B4's licence read, the twins site.ts MOOD_PICTURES names */
const MOOD = {
  light: relative(PAGES, join(ROOT, 'apps/studio/public/brand/mood-earth-light.jpg')),
  dark: relative(PAGES, join(ROOT, 'apps/studio/public/brand/mood-earth-dark.jpg')),
};
{
  const css = `
body { height: 100vh; overflow: hidden; position: relative; }
.back { position: absolute; inset: 0; }
.back img { display: block; width: 100%; height: 100%; }
.scrim { position: absolute; inset: 0; background: var(--pt-scrim); }
.plate { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 720px; display: grid; grid-template-columns: 280px 1fr; background: var(--pt-paper); border: 1px solid var(--pt-edge); }
.pic { background: var(--pt-plate); border-right: 1px solid var(--pt-hair); display: flex; align-items: flex-end; padding: 16px; min-height: 440px; }
.pic { position: relative; padding: 0; overflow: hidden; }
.pic .mood { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 18% 50%; display: block; }
:root:not([data-theme='dark']) .pic .mood.d, :root[data-theme='dark'] .pic .mood.l { display: none; }
.pic .credit { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 8px 12px; background: var(--pt-paper); font-size: 13px; line-height: 1.45; color: var(--pt-titanium); }
.in { padding: 28px 32px 22px; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; }
.close { width: 32px; height: 32px; display: grid; place-items: center; color: var(--pt-ink-2); margin-right: -8px; }
.in h2 { font: 500 28px/1.2 var(--sans); letter-spacing: -0.02em; margin-top: 40px; }
.in .say { font-size: 15px; line-height: 1.55; color: var(--pt-ink-2); margin-top: 10px; }
.gbtn { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; margin-top: 24px; font: 500 14px/1 var(--sans); }
.gbtn .g { width: 18px; height: 18px; flex: none; }
.gbtn span { flex: 1; text-align: center; margin-right: 28px; }
:root:not([data-theme='dark']) .gbtn { background: #ffffff; border: 1px solid #747775; color: #1f1f1f; }
:root[data-theme='dark'] .gbtn { background: #131314; border: 1px solid #8e918f; color: #e3e3e3; }
:root[data-theme='dark'] .gbtn .g { background: #ffffff; border-radius: 50%; padding: 2px; width: 22px; height: 22px; margin-left: -2px; }
.keep { font-size: 14px; color: var(--pt-ink-2); margin-top: 14px; }
.foot { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--pt-hair); font-size: 13px; line-height: 1.5; color: var(--pt-titanium); }
@media (max-width: 719px) {
  .plate { width: calc(100% - 32px); grid-template-columns: 1fr; }
  .pic { min-height: 0; height: 120px; border-right: 0; border-bottom: 1px solid var(--pt-hair); }
  .in { padding: 20px 20px 16px; min-height: 380px; }
  .in h2 { margin-top: 28px; }
}
`;
  const body = `
<div class="back"><img id="back" alt=""></div>
<div class="scrim"></div>
<div class="plate" role="dialog" aria-label="Sign in">
  <div class="pic"><img class="mood l" src="${MOOD.light}" alt=""><img class="mood d" src="${MOOD.dark}" alt=""><p class="credit">Image: NASA, Reto Stöckli, 2007, public domain</p></div>
  <div class="in">
    <div class="head">${lockup(22)}<span class="close" aria-label="Close">${ic('close')}</span></div>
    <h2>Sign in</h2>
    <p class="say">Sign in to keep your presentations under your name and open them on any device.</p>
    <button class="gbtn">${GOOGLE_G}<span>Continue with Google</span></button>
    <p class="keep">You can keep working without an account.</p>
    <p class="foot">Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in.</p>
  </div>
</div>`;
  const script = `
  const theme = document.documentElement.dataset.theme || 'light';
  const w = innerWidth < 720 ? 390 : 1440;
  const img = document.getElementById('back');
  img.src = '../pictures/editor-' + w + '-' + theme + '.png';
  try { await img.decode(); } catch {}`;
  writeOut(join(PAGES, 'signin.html'), page('Sign in plate', css, body, script));
}

/* ---- 8. the CLI banner on the code panel ---- */
{
  /* A terminal draws the block elements (U+2580, U+2584, U+2588) as exact halves of its cell, so the
     glyph is drawn here as those cells, 9 by 18 px with square half cells, beside the facts as text
     on the same 18 px lines. banner.txt holds the characters. */
  const facts = ['Turboslide <version>', 'https://www.turboslide.com', '<n> actions, effects backend: <selected>', 'checkout <path>'];
  const CW = 9;
  const LH = 18;
  let cells = '';
  BLOCKS.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      const x = col * CW;
      const y = row * LH;
      if (ch === '\u2588') cells += `<rect x="${x}" y="${y}" width="${CW}" height="${LH}"/>`;
      else if (ch === '\u2580') cells += `<rect x="${x}" y="${y}" width="${CW}" height="${LH / 2}"/>`;
      else if (ch === '\u2584') cells += `<rect x="${x}" y="${y + LH / 2}" width="${CW}" height="${LH / 2}"/>`;
    }),
  );
  const glyph = `<svg class="glyph" width="${12 * CW}" height="${BLOCKS.length * LH}" viewBox="0 0 ${12 * CW} ${BLOCKS.length * LH}" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor">${cells}</g></svg>`;
  const css = `
body { width: 960px; height: 400px; overflow: hidden; padding: 36px 48px; }
.lead { margin-top: 8px; }
.term { margin-top: 22px; background: var(--panel); color: rgba(255, 255, 255, 0.87); padding: 22px 26px; display: flex; gap: ${2 * CW}px; align-items: flex-start; }
.term .glyph { display: block; flex: none; }
pre { margin: 0; font: 400 15px/${LH}px var(--mono); white-space: pre; }
`;
  const body = `<h1>The CLI banner</h1>
<p class="lead">turboslide --version prints the 16 px drawing's rows as half blocks, two pixel rows to a line, beside the four facts it prints today. The glyph is drawn as the cells a terminal fills for those characters.</p>
<div class="term">${glyph}<pre>${facts.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n')}</pre></div>`;
  writeOut(join(PAGES, 'banner.html'), page('CLI banner', css, body));
}

console.log(`monogram: ${POLYS.length} parallelograms, box ${round2(B.w)} by ${B.h}, aspect ${round2(ASPECT)}, sha256 ${SHA}`);
console.log(`lockup: cap ${CAP_EM.toFixed(6)} em, gap ${GAP_EM.toFixed(6)} em, T bearing ${T_LSB_EM.toFixed(6)} em (fontkit, default instance), margin at the 22 px word ${marginAt(22).toFixed(6)} em`);
console.log(BLOCKS.join('\n'));

/* ---------- the render ---------- */

if (process.argv.includes('--render')) {
  const load = loadavg()[0];
  if (load >= 24) {
    console.error(`load average ${load.toFixed(2)} is 24 or more; the round's load rule holds the render`);
    process.exit(3);
  }
  const { chromium } = await import(join(ROOT, 'node_modules/playwright-core/index.mjs'));
  const browser = await chromium.launch();
  const shots = [];
  const loads = { start: Number(load.toFixed(2)) };
  const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
  const skip = { ctx: { close: async () => {} }, p: { evaluate: async () => undefined, screenshot: async () => Buffer.alloc(0) } };
  async function shoot(name, file, { width, height, theme = 'light', out, before }) {
    if (only.length && !only.includes(name)) return skip;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage();
    await p.goto(pathToFileURL(join(PAGES, file)).href + `?theme=${theme}`);
    await p.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    await p.waitForTimeout(150);
    if (before) await before(p);
    const path = join(PICTURES, out);
    await p.screenshot({ path, type: 'png' });
    const bytes = statSync(path).size;
    shots.push({ name, out, width, height, theme, bytes });
    console.log(`${out.padEnd(30)} ${String(bytes).padStart(8)} B${bytes > 200 * 1024 ? '  OVER 200 KB' : ''}`);
    return { p, ctx };
  }
  const measure = {};
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ]) {
      const { p, ctx } = await shoot('editor', 'editor.html', { width: w, height: h, theme, out: `editor-${w}-${theme}.png` });
      measure[`editor-${w}-${theme}`] = await p.evaluate(() => window.__title);
      await ctx.close();
    }
  }
  for (const theme of ['light', 'dark']) {
    await (await shoot('construction', 'construction.html', { width: 1440, height: 900, theme, out: `construction-${theme}.png` })).ctx.close();
    /* the ink, read from the rendered pixels of the 120 px lockup with the guides hidden; the reading
       is then written into the page, which is captured with the guides shown */
    const lockupBefore = async (p) => {
      const L = await p.evaluate(() => window.__lockup);
      const marks = '.guide, .glab, .gap, .gaplab';
      await p.evaluate((sel) => document.querySelectorAll(sel).forEach((el) => (el.style.visibility = 'hidden')), marks);
      const clip = { x: Math.floor(L.markLeft) - 4, y: Math.floor(L.markTop) - 30, width: 900, height: Math.ceil(L.markBottom - L.markTop) + 60 };
      const png = decodePng(await p.screenshot({ clip, type: 'png' }));
      const ink = inkMeasure(png, L, clip, theme);
      /* the same reading for the lockups of the sizes list (66, 22, 18 and 14 px words) */
      const small = await p.evaluate(() =>
        [...document.querySelectorAll('.sizes .lk')].map((lk) => {
          const r = lk.querySelector('.lk-mark').getBoundingClientRect();
          return { px: parseFloat(lk.style.fontSize), markLeft: r.left, markRight: r.right, markTop: r.top, markBottom: r.bottom };
        }),
      );
      const sizes = [];
      for (const S of small) {
        const c = { x: Math.floor(S.markLeft) - 4, y: Math.floor(S.markTop) - 6, width: Math.ceil(S.px * 6), height: Math.ceil(S.markBottom - S.markTop) + 12 };
        const m = inkMeasure(decodePng(await p.screenshot({ clip: c, type: 'png' })), S, c, theme);
        sizes.push({ px: S.px, gapPx: m.gapPx, halfCapPx: m.halfCapPx, markCapPx: m.markCapPx, wordTCapPx: m.wordTCapPx, markBottomRow: m.markRows.bottom, wordBottomRow: m.tRows.bottom });
      }
      measure[`lockup-${theme}`] = { dom: L, ink, sizes };
      const text = `At the 120 px word: the gap ${ink.gapPx} px against half the cap ${ink.halfCapPx} px; the mark's cap ${ink.markCapPx} px and the T's ${ink.wordTCapPx} px, ink rows at the 50 percent threshold`;
      await p.evaluate(([sel, t]) => {
        document.querySelectorAll(sel).forEach((el) => (el.style.visibility = ''));
        document.getElementById('measured').textContent = t;
      }, [marks, text]);
    };
    await (await shoot('lockup', 'lockup.html', { width: 1440, height: 900, theme, out: `lockup-${theme}.png`, before: lockupBefore })).ctx.close();
    await (await shoot('decks', 'decks.html', { width: 1440, height: 900, theme, out: `decks-1440-${theme}.png` })).ctx.close();
    await (await shoot('signin', 'signin.html', { width: 1440, height: 900, theme, out: `signin-1440-${theme}.png` })).ctx.close();
  }
  for (const theme of ['light', 'dark']) {
    await (await shoot('decks', 'decks.html', { width: 390, height: 844, theme, out: `decks-390-${theme}.png` })).ctx.close();
    await (await shoot('signin', 'signin.html', { width: 390, height: 844, theme, out: `signin-390-${theme}.png` })).ctx.close();
  }
  await (await shoot('marks', 'marks.html', { width: 1440, height: 900, out: 'marks.png' })).ctx.close();
  await (await shoot('question2', 'question2.html', { width: 1440, height: 900, out: 'question2.png' })).ctx.close();
  await (await shoot('banner', 'banner.html', { width: 960, height: 400, out: 'cli-banner.png' })).ctx.close();
  await browser.close();
  loads.end = Number(loadavg()[0].toFixed(2));
  if (!only.length) writeOut(join(PICTURES, 'measure.json'), JSON.stringify({ at: new Date().toISOString(), loads, shots, measure }, null, 2) + '\n');
}

/* ---------- PNG decoding for the ink measurement ---------- */

function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p0 = a + b - c;
        const pa = Math.abs(p0 - a);
        const pb = Math.abs(p0 - b);
        const pc = Math.abs(p0 - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/** ink columns and rows of the mark and of the word's T, from luminance at a half threshold */
function inkMeasure(png, L, clip, theme) {
  const lum = (x, y) => {
    const i = (y * png.w + x) * png.bpp;
    return png.bpp >= 3 ? 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2] : png.data[i];
  };
  const isInk = (x, y) => (theme === 'dark' ? lum(x, y) > 128 : lum(x, y) < 128);
  const markRightX = Math.round(L.markRight - clip.x);
  /* the guides are hidden for this capture; the columns are read from the cap line to the baseline */
  const y0 = Math.max(0, Math.floor(L.markTop - clip.y));
  const y1 = Math.min(png.h - 1, Math.ceil(L.markBottom - clip.y));
  let markInkRight = -1;
  for (let x = 0; x < Math.min(png.w, markRightX + 3); x++) for (let y = y0; y <= y1; y++) if (isInk(x, y)) markInkRight = Math.max(markInkRight, x);
  let wordInkLeft = -1;
  for (let x = markRightX + 3; x < png.w && wordInkLeft < 0; x++) for (let y = y0; y <= y1; y++) if (isInk(x, y)) { wordInkLeft = x; break; }
  /* the T: the columns from its left ink over 40 px, its top and bottom ink rows over the full clip */
  const rowsOf = (xa, xb) => {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < png.h; y++)
      for (let x = xa; x <= xb; x++)
        if (isInk(x, y)) {
          if (top < 0) top = y;
          bottom = y;
          break;
        }
    return { top, bottom, height: bottom - top + 1 };
  };
  const markRows = rowsOf(0, markInkRight);
  const tRows = rowsOf(wordInkLeft, wordInkLeft + Math.max(4, Math.round((L.markBottom - L.markTop) * 0.4)));
  return {
    markInkRight,
    wordInkLeft,
    gapPx: wordInkLeft - markInkRight - 1,
    markCapPx: markRows.height,
    wordTCapPx: tRows.height,
    markRows,
    tRows,
    halfCapPx: Number(((L.markBottom - L.markTop) / 2).toFixed(2)),
  };
}

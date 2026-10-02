// Direction C mark set: the round four geometry of packages/theme/src/brand.ts, unchanged, written
// as one color files in currentColor the way Prototemplate/public/marks writes the GT speed set,
// plus the favicon tiles. Reads the tree only; writes under brand-c/marks/.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../../..');
const out = join(here, '../marks');
const brand = await import(join(root, 'packages/theme/src/brand.ts'));
const { markPath, markBits, cellRects, litCount, markBlocks, TILE_SIZES, tileMarkPath, TILE_COLORS } = brand;

const head = (what) =>
  `<!-- Turboslide mark, ${what}. Brand direction C (docs/gslides-parity/next/brand-c.md): the round four geometry of packages/theme/src/brand.ts, unchanged, one color in currentColor. Written by brand-c/tools/build-marks.mjs. -->\n`;
const svg = (box, w, h, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${w}" height="${h}" fill="currentColor" shape-rendering="crispEdges" role="img" aria-label="Turboslide"${extra}><title>Turboslide</title>${body}</svg>\n`;

const written = [];
function put(name, text) {
  writeFileSync(join(out, name), text);
  written.push(name);
}

// 1. The solid form, 16 unit box: the favicon, title row, app bar and terminal size (below 64 px).
put('turboslide-mark.svg', head('the solid form for 12 to 63 px') + svg('0 0 16 16', 16, 16, `<path fill-rule="evenodd" d="${markPath(2)}"/>`));

// 2. The cellular forms: 32 cells for 64 to 127 px (2 px cells at 64), 64 cells for 128 px and up.
for (const n of [32, 64]) {
  const bits = markBits(n);
  put(`turboslide-mark-cells-${n}.svg`, head(`${n} by ${n} cells, ${litCount(bits)} lit, for ${n === 32 ? '64 to 127' : '128 px and larger'} at whole pixel cells`) + svg(`0 0 ${n} ${n}`, n * 2, n * 2, cellRects(bits)));
}

// 3. The lockups. The word is the outline path of packages/theme/brand/wordmark-outlines.svg (Inter 500, -0.025em,
// pair kerning applied), so the files hold where Inter is not loaded, as the speed lockup does.
const outlines = readFileSync(join(root, 'packages/theme/brand/wordmark-outlines.svg'), 'utf8');
const paths = [...outlines.matchAll(/<path transform="([^"]+)"[^>]*? d="([^"]+)"/g)];
const word = paths.find((m) => m[1].includes('0.0322265625'));
if (!word) throw new Error('word outline not found');
const wordD = word[2];
// horizontal: the 48 px solid mark at the cap height of the 66 px word, a 16 px gap, baselines aligned (the tree's geometry)
put('turboslide-lockup.svg', head('the horizontal lockup: the 48 px solid mark and the word at 66 px as outlines') +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 353 66" width="353" height="66" fill="currentColor" role="img" aria-label="Turboslide"><title>Turboslide</title><path transform="translate(0 3) scale(3)" shape-rendering="crispEdges" fill-rule="evenodd" d="${markPath(2)}"/><path transform="translate(64 51) scale(0.0322265625)" d="${wordD}"/></svg>\n`);
// stacked: the 64 px mark at 32 cells centred over the 289 px word, a 32 px gap, 64 px clear space (the tree's stacked
// lockup, with the word as outlines instead of live text)
const stackedWordX = (416 - 288.7) / 2;
put('turboslide-lockup-stacked.svg', head('the stacked lockup: the 64 px mark at 32 cells over the word at 66 px as outlines') +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 416 290" width="416" height="290" fill="currentColor" role="img" aria-label="Turboslide"><title>Turboslide</title><g transform="translate(176 64) scale(2)" shape-rendering="crispEdges">${cellRects(markBits(32))}</g><path transform="translate(${stackedWordX.toFixed(2)} 211) scale(0.0322265625)" d="${wordD}"/></svg>\n`);

// 4. The terminal form: half blocks, two cell rows per line (the CLI banner and a README code block).
put('turboslide-mark-blocks.txt', [markBlocks(8).join('\n'), '', markBlocks(16).join('\n'), ''].join('\n'));

// 5. The tiles. 16 and 32: the mark in ink on an opaque paper plate with a 1 px frame in the edge composite, the
// prefers-color-scheme block swapping to the ink plate (the tree's icon.svg rule). 180: the touch icon, the ink tile with
// the 128 px mark at 32 cells (4 px cells), opaque, square, as build-brand.ts writes apple-touch-icon.png.
for (const size of [16, 32]) {
  const t = TILE_SIZES[size];
  const L = TILE_COLORS.light;
  const D = TILE_COLORS.dark;
  put(`favicon-${size}.svg`,
    `<!-- Turboslide tab icon at ${size} px (brand direction C, unchanged from round four): the solid mark (${t.mark.size} px at ${t.mark.x}, ${t.mark.y}) in ink on an opaque paper plate with a 1 px frame; the scheme block swaps to the ink plate. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><title>Turboslide</title><style>.plate{fill:${L.plate}}.frame{fill:none;stroke:${L.frame};stroke-width:1}.ink{fill:${L.ink}}@media (prefers-color-scheme: dark){.plate{fill:${D.plate}}.frame{stroke:${D.frame}}.ink{fill:${D.ink}}}</style><rect class="plate" x="0" y="0" width="${size}" height="${size}"/><rect class="frame" x="0.5" y="0.5" width="${size - 1}" height="${size - 1}"/><path class="ink" fill-rule="evenodd" d="${tileMarkPath(t)}"/></svg>\n`);
}
{
  const D = TILE_COLORS.dark;
  put('apple-touch-icon-180.svg',
    `<!-- Turboslide touch icon at 180 px (brand direction C, unchanged from round four): the ink plate with the 128 px mark at 32 cells (4 px cells) at (26, 26), opaque, no corners. -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180" shape-rendering="crispEdges" role="img" aria-label="Turboslide"><title>Turboslide</title><rect x="0" y="0" width="180" height="180" fill="${D.plate}"/><g transform="translate(26 26) scale(4)" fill="${D.ink}">${cellRects(markBits(32))}</g></svg>\n`);
}

// The check against the tree: the solid path and the 16 px tile path must equal the tree's files.
const treeSmall = readFileSync(join(root, 'packages/theme/brand/mark-small.svg'), 'utf8');
const treeTile = readFileSync(join(root, 'packages/theme/brand/icon-tile.svg'), 'utf8');
console.log('solid path in tree mark-small.svg:', treeSmall.includes(`d="${markPath(2)}"`));
console.log('16 px tile path in tree icon-tile.svg:', treeTile.includes(`d="${tileMarkPath(TILE_SIZES[16])}"`));
console.log('lit cells at 32 and 64:', litCount(markBits(32)), litCount(markBits(64)));
console.log('written:', written.join(', '));

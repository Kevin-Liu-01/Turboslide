// The wordmark and the two lockups: the word set in Inter 500 at opsz 32 with Inter's own kerning
// and -0.025em tracking (research-4 report 01, 6.2 item 5), outlined by fontTools from the
// repository's InterVariable.woff2 (scratchpad wordmark.py); the mark's frame height equals the
// cap height, the frame's bottom is the baseline, the gap is the stem width (item 8).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const { geometry, markShapes } = await import('./mark.mjs');
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader';
const wm = JSON.parse(readFileSync('wordmark.json', 'utf8'));
const S = 64; // the mark: frame 56 by 32, so the cap height is 32 and the font size 44
const g = geometry(S);
const F = (g.H * wm.upm) / wm.capHeight; // 43.99
const s = F / wm.upm;
const gap = g.bar; // the stem width
const textX = g.x0 + g.W + gap;
const baseline = g.y0 + g.H;
const textW = wm.width * s;
const W = Math.ceil(textX + textW + 2);
const word = `<path transform="translate(${textX.toFixed(3)} ${baseline}) scale(${s.toFixed(6)})" d="${wm.d}"/>`;
const horizontal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${S}" width="${W}" height="${S}" role="img" aria-label="Turboslide">
  <!-- The horizontal lockup: the mark at 64 px (frame 56 by 32, the frame's height is the cap height and its bottom
       edge the baseline), a gap of ${gap} px (the stem width), the word Turboslide in Inter 500, opsz 32, at ${F.toFixed(2)} px
       with Inter's kerning (T u ${wm.glyphs[0].kern} units) and -0.025em tracking, outlined from packages/fonts/assets/InterVariable.woff2.
       In the product the word is live text (research-4 report 01, 6.2 item 5); this file is for the README, npm and the
       social image, where no font can be assumed. One colour: currentColor. -->
  <g fill="currentColor">
    <g shape-rendering="crispEdges">
    ${markShapes(g, 1)}
    </g>
    ${word}
  </g>
</svg>
`;
writeFileSync(`${OUT}/wordmark.svg`, horizontal);
// live text variant for pages that load Inter
const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${S}" width="${W}" height="${S}" role="img" aria-label="Turboslide">
  <g fill="currentColor">
    <g shape-rendering="crispEdges">
    ${markShapes(g, 1)}
    </g>
    <text x="${textX.toFixed(2)}" y="${baseline}" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-weight="500" font-size="${F.toFixed(2)}" letter-spacing="-0.025em" style="font-feature-settings: 'cv11', 'ss01'">Turboslide</text>
  </g>
</svg>
`;
writeFileSync(`${OUT}/wordmark-text.svg`, text);
// stacked lockup: mark at 128 above the word at 44 px, centred, clear space = the mark's height
{
  const M = 128;
  const gm = geometry(M);
  const wordW = textW;
  const width = Math.ceil(Math.max(M, wordW) + 2 * M);
  const cap = Math.round(F * 0.7275);
  const height = M + M + 24 + Math.round(F) + M;
  const mx = Math.round((width - M) / 2);
  const tx = (width - wordW) / 2;
  const ty = M + M + 24 + cap;
  // the stacked mark is drawn with the 128 geometry (cells 2 px) and 128 px of clear space around
  const stacked = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Turboslide">
  <!-- The stacked lockup for the README hero and square plates: the mark at 128 px above the word at ${F.toFixed(2)} px,
       centred, with a clear space equal to the mark's height on every side (research-4 report 01, 6.2 item 8). -->
  <g fill="currentColor">
    <g shape-rendering="crispEdges" transform="translate(${mx} ${M})">
    ${markShapes(gm, 1)}
    </g>
    <path transform="translate(${tx.toFixed(3)} ${ty}) scale(${s.toFixed(6)})" d="${wm.d}"/>
  </g>
</svg>
`;
  writeFileSync(`${OUT}/lockup-stacked.svg`, stacked);
}
// previews on paper and on ink at 2x
for (const [name, plate, ink] of [
  ['paper', '#ffffff', '#070707'],
  ['ink', '#070707', '#f2f2f0'],
]) {
  const svg = horizontal
    .replace('fill="currentColor"', `fill="${ink}"`)
    .replace('<g fill=', `<rect width="${W}" height="${S}" fill="${plate}"/>\n  <g fill=`);
  await sharp(Buffer.from(svg), { density: 144 })
    .png()
    .toFile(`${OUT}/previews/wordmark-${name}.png`);
  const st = readFileSync(`${OUT}/lockup-stacked.svg`, 'utf8')
    .replace('fill="currentColor"', `fill="${ink}"`)
    .replace('<g fill=', `<rect width="100%" height="100%" fill="${plate}"/>\n  <g fill=`);
  await sharp(Buffer.from(st)).png().toFile(`${OUT}/previews/lockup-stacked-${name}.png`);
}
console.log('lockup', { W, S, F: F.toFixed(2), textX, baseline, textW: textW.toFixed(1) });

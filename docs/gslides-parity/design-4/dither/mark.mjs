// The Turboslide mark, generated (design-4 proposal 1, "the dither is the identity").
//
// One construction at every size: an 8 by 8 grid; the body is the square less a plate window at
// columns 1 to 4 and rows 4 to 6 (a slide with its title plate cut from the picture, the way the
// GT openers clear a plate); the body carries a density field that is 1 at the window's edge and
// falls to 0.25 at the far corner, thresholded by the deck's own 8 by 8 Bayer permutation
// (packages/effects/src/bayer.ts). N is the number of dither cells per side (a multiple of 8);
// at N = 8 the field collapses to the solid form, which is the 16 px mark. Each raster draws its
// cells on its own pixel grid (2 px cells at 32, 48 and 64; 4 px at 128 to 192; 8 px at 512), so
// a screen is never resampled (research-4 report 02 section 5.4).
//
// Run with Node 24 (type stripping): `node docs/gslides-parity/design-4/dither/mark.mjs` prints
// the 16 and 32 px marks as block characters. Import `markBits`, `markSvg`, `markPath` elsewhere.
import { bayer8 } from '../../../../packages/effects/src/bayer.ts';

/** The plate window on the 8 by 8 grid: [x0, x1, y0, y1), cells. */
export const WINDOW = [1, 5, 4, 7];
/** The far corner's density; 1 would be solid, 0.5 a checkerboard. */
export const FIELD_END = 0.25;

/** True when grid cell (gx, gy) is body, false inside the window. */
export function isBody(gx, gy) {
  const [x0, x1, y0, y1] = WINDOW;
  return !(gx >= x0 && gx < x1 && gy >= y0 && gy < y1);
}

/** Distance from (u, v) in unit coordinates to the window rectangle; 0 on its edge or inside. */
export function windowDistance(u, v) {
  const [x0, x1, y0, y1] = WINDOW.map((c) => c / 8);
  const dx = u < x0 ? x0 - u : u > x1 ? u - x1 : 0;
  const dy = v < y0 ? y0 - v : v > y1 ? v - y1 : 0;
  return Math.hypot(dx, dy);
}

const D_MAX = Math.max(windowDistance(1, 0), windowDistance(0, 0), windowDistance(1, 1));

/** The tone at (u, v): 1 at the window, FIELD_END at the far corner, linear in distance. */
export function field(u, v) {
  return 1 - (1 - FIELD_END) * (windowDistance(u, v) / D_MAX);
}

/**
 * The mark as N by N cells (1 is ink). N must be a multiple of 8. At N = 8 every body cell is
 * ink (solid). The threshold test is the pipeline's: tone > (m + 0.5) / 64 lights the cell.
 */
export function markBits(N) {
  if (N % 8 !== 0 || N < 8) throw new RangeError(`N must be a multiple of 8, got ${N}`);
  const k = N / 8;
  const bits = new Uint8Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (!isBody(Math.floor(x / k), Math.floor(y / k))) continue;
      if (N === 8) {
        bits[y * N + x] = 1;
        continue;
      }
      const tone = field((x + 0.5) / N, (y + 0.5) / N);
      bits[y * N + x] = tone > (bayer8(y, x) + 0.5) / 64 ? 1 : 0;
    }
  }
  return { width: N, height: N, bits };
}

/** The solid form as one even-odd path on a 16 unit box: the square less the window. */
export function markPath(unit = 2) {
  const [x0, x1, y0, y1] = WINDOW;
  const s = 8 * unit;
  return `M0 0h${s}v${s}H0z M${x0 * unit} ${y0 * unit}h${(x1 - x0) * unit}v${(y1 - y0) * unit}H${x0 * unit}z`;
}

/** Row runs of ink cells as <rect> elements, one unit per cell. */
export function cellRects(image) {
  const { width, height, bits } = image;
  const out = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (!bits[y * width + x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < width && bits[y * width + x + run]) run += 1;
      out.push(`<rect x="${x}" y="${y}" width="${run}" height="1"/>`);
      x += run;
    }
  }
  return out.join('');
}

/** An SVG of the mark at N cells, currentColor, crisp edges. */
export function markSvg(N, { title = 'Turboslide' } = {}) {
  const body = N === 8 ? `<path fill-rule="evenodd" d="${markPath(1)}"/>` : cellRects(markBits(N));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${N}" height="${N}" fill="currentColor" shape-rendering="crispEdges" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
}

/** The mark as terminal block characters: two cell rows per line (U+2580, U+2584, U+2588). */
export function markBlocks(N = 8) {
  const { width, height, bits } = markBits(N);
  const lines = [];
  for (let y = 0; y < height; y += 2) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const top = bits[y * width + x] === 1;
      const bottom = y + 1 < height && bits[(y + 1) * width + x] === 1;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(markBlocks(8).join('\n'));
  console.log('');
  console.log(markBlocks(16).join('\n'));
}

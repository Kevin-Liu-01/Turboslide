// The Turboslide identity as data (gslides-parity SPEC-4 0.8, 0.9, 0.10, 1.1, 1.8): the eleven
// `--ts-` tokens `packages/chrome/src/brand.css` declares, mirrored here and pinned by
// brand.test.ts the way tokens.ts and tokens.test.ts pin the sheet, and the one geometry of the
// mark, moved from `docs/gslides-parity/design-4/dither/mark.mjs` (proposal 1, "the dither is the
// identity"). TurboslideMark.tsx, scripts/build-brand.ts and the CLI banner draw from this module
// and nowhere else, so the tab icon, the title row, the README, the card and the terminal are one
// form. Framework free: the only import is the deck's Bayer permutation.
//
// The mark is a slide and the plate cut from it (SPEC-4 1.1): an 8 by 8 grid, the body the square
// less a plate window at columns 1 to 4 and rows 4 to 6, the body carrying a density field that
// is 1 at the window's edge and 0.25 at the far corner, thresholded by the deck's own 8 by 8
// Bayer permutation (packages/effects/src/bayer.ts) with the pipeline's own test. N is the number
// of cells per side (a multiple of 8); at N = 8 the field collapses to the solid form, which is
// the mark below 64 px. Every raster draws its cells on its own pixel grid and is never resampled
// (research-4 report 02 section 5.4).
import { bayer8 } from '@turboslide/effects/bayer';
import type { BitImage } from '@turboslide/effects/image';

// ---------------------------------------------------------------------------------------------
// The tokens (SPEC-4 0.9, 1.8)

/** The eleven identity tokens of brand.css, on :root, by their full custom property names. */
export const BRAND_TOKENS: Readonly<Record<string, string>> = {
  '--ts-cell': '2px',
  '--ts-mark': '24px',
  '--ts-h1': '56px',
  '--ts-h2': '32px',
  '--ts-h3': '20px',
  '--ts-lead': '20px',
  '--ts-body': '15px',
  '--ts-small': '13px',
  '--ts-figure': '40px',
  '--ts-rail': '1120px',
  '--ts-plate': 'var(--pt-paper)',
};

/** The one media block of brand.css (SPEC-4 0.9 and the table of 1.8): the values at and under this width. */
export const BRAND_NARROW_MAX_PX = 760;

/** The tokens the narrow block redeclares; every other token keeps its value. */
export const BRAND_TOKENS_NARROW: Readonly<Record<string, string>> = {
  '--ts-h1': '40px',
  '--ts-h2': '26px',
  '--ts-lead': '18px',
  '--ts-figure': '32px',
};

/** The mark's name, the alt text of every mark that stands alone (SPEC-4 1.12). */
export const MARK_LABEL = 'Turboslide';

// ---------------------------------------------------------------------------------------------
// The geometry (SPEC-4 1.1)

/** The plate window on the 8 by 8 grid: [x0, x1, y0, y1), in cells. */
export const WINDOW: readonly [number, number, number, number] = [1, 5, 4, 7];

/** The far corner's density; 1 would be solid, 0.5 a checkerboard, 0 would dissolve the silhouette. */
export const FIELD_END = 0.25;

/** The mark is solid below this size and cellular from it, in the icon set and the lockups alike (SPEC-4 0.5). */
export const CELL_THRESHOLD_PX = 64;

/** The size of the 16 unit solid path's box, in units. */
export const PATH_UNITS = 16;

/** True when grid cell (gx, gy) is body, false inside the window. */
export function isBody(gx: number, gy: number): boolean {
  const [x0, x1, y0, y1] = WINDOW;
  return !(gx >= x0 && gx < x1 && gy >= y0 && gy < y1);
}

/** Distance from (u, v) in unit coordinates (0 to 1) to the window rectangle; 0 on its edge or inside. */
export function windowDistance(u: number, v: number): number {
  const [x0, x1, y0, y1] = WINDOW.map((c) => c / 8) as [number, number, number, number];
  const dx = u < x0 ? x0 - u : u > x1 ? u - x1 : 0;
  const dy = v < y0 ? y0 - v : v > y1 ? v - y1 : 0;
  return Math.hypot(dx, dy);
}

/** The largest distance a body point has from the window: the top right corner. */
export const D_MAX: number = Math.max(
  windowDistance(1, 0),
  windowDistance(0, 0),
  windowDistance(1, 1),
);

/** The tone at (u, v): 1 at the window, FIELD_END at the far corner, linear in distance. */
export function field(u: number, v: number): number {
  return 1 - (1 - FIELD_END) * (windowDistance(u, v) / D_MAX);
}

/**
 * The mark as N by N cells (1 is ink). N must be a multiple of 8. At N = 8 every body cell is
 * ink (the solid form). The threshold test is the pipeline's: tone > (m + 0.5) / 64 lights the
 * cell, so the mark's cells are the cells the pipeline would light for that field.
 */
export function markBits(n: number): BitImage {
  if (!Number.isInteger(n) || n % 8 !== 0 || n < 8)
    throw new RangeError(`N must be a multiple of 8, got ${n}`);
  const k = n / 8;
  const bits = new Uint8Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!isBody(Math.floor(x / k), Math.floor(y / k))) continue;
      if (n === 8) {
        bits[y * n + x] = 1;
        continue;
      }
      const tone = field((x + 0.5) / n, (y + 0.5) / n);
      bits[y * n + x] = tone > (bayer8(y, x) + 0.5) / 64 ? 1 : 0;
    }
  }
  return { width: n, height: n, bits };
}

/** The number of ink cells in a bit image. */
export function litCount(image: BitImage): number {
  let lit = 0;
  for (const bit of image.bits) lit += bit;
  return lit;
}

/**
 * The solid form as one even odd path on a 16 unit box: the square less the window. At `unit`
 * 2 it is `M0 0h16v16H0z M2 8h8v6H2z`, what the favicon, the title row, the app bar, the print
 * bar and the terminal draw.
 */
export function markPath(unit: number = 2): string {
  const [x0, x1, y0, y1] = WINDOW;
  const s = 8 * unit;
  return `M0 0h${s}v${s}H0z M${x0 * unit} ${y0 * unit}h${(x1 - x0) * unit}v${(y1 - y0) * unit}H${x0 * unit}z`;
}

/** The area of the solid form on the 16 unit grid: 256 units less the 8 by 6 window, 208. */
export function solidUnits(): number {
  const [x0, x1, y0, y1] = WINDOW;
  const unit = PATH_UNITS / 8;
  return PATH_UNITS * PATH_UNITS - (x1 - x0) * unit * (y1 - y0) * unit;
}

/** One horizontal run of ink cells: the row, the first cell and the length. */
export type CellRun = { x: number; y: number; width: number };

/** Row runs of ink cells, so a 64 cell mark is a few hundred rectangles and not 4,000 (SPEC-4 1.1). */
export function cellRuns(image: BitImage): CellRun[] {
  const { width, height, bits } = image;
  const out: CellRun[] = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (!bits[y * width + x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < width && bits[y * width + x + run]) run += 1;
      out.push({ x, y, width: run });
      x += run;
    }
  }
  return out;
}

/** The row runs as `<rect>` elements, one unit per cell. */
export function cellRects(image: BitImage): string {
  return cellRuns(image)
    .map((run) => `<rect x="${run.x}" y="${run.y}" width="${run.width}" height="1"/>`)
    .join('');
}

/**
 * The cell grid for a mark drawn at `sizePx` (SPEC-4 0.5, 1.1): solid below 64 px (N = 8, the
 * path), 2 px cells at 64 px, 4 px cells from 128 to 256 px and 8 px cells for the 448 px mark
 * of the 512 tile and the 512 px mark (the table of 1.1), so the cells always land on device
 * pixels. Throws when the size is not a multiple of the cell.
 */
export function markGrid(sizePx: number): { n: number; cell: number } {
  if (sizePx < CELL_THRESHOLD_PX) return { n: 8, cell: sizePx / 8 };
  const cell = sizePx >= 384 ? 8 : sizePx >= 128 ? 4 : 2;
  const n = sizePx / cell;
  if (!Number.isInteger(n) || n % 8 !== 0)
    throw new RangeError(`no cell grid for a ${sizePx} px mark (cell ${cell})`);
  return { n, cell };
}

/**
 * An SVG of the mark at N cells drawn at `size` CSS px, `currentColor`, crisp edges. N = 8 draws
 * the solid path on the 16 unit box. Alone the SVG names itself; beside a word pass
 * `decorative` so the name is read once (SPEC-4 1.12).
 */
export function markSvg(
  n: number,
  size: number = n,
  options: { title?: string; decorative?: boolean } = {},
): string {
  const title = options.title ?? MARK_LABEL;
  const body =
    n === 8
      ? `<path fill-rule="evenodd" d="${markPath(PATH_UNITS / 8)}"/>`
      : cellRects(markBits(n));
  const box = n === 8 ? PATH_UNITS : n;
  const name = options.decorative
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${title}"><title>${title}</title`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" fill="currentColor" shape-rendering="crispEdges" ${name}>${body}</svg>`;
}

/** The mark as terminal block characters: two cell rows per line (U+2580, U+2584, U+2588). */
export function markBlocks(n: number = 8): string[] {
  const { width, height, bits } = markBits(n);
  const lines: string[] = [];
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

// ---------------------------------------------------------------------------------------------
// The tile (SPEC-4 0.4, 1.1, 1.4): the mark in ink on an opaque paper plate with a 1 px frame in
// the edge composite, proposal 3's tile applied to proposal 1's form, for every raster the
// prefers-color-scheme block cannot reach (the ICO entries, Safari's base rendering of icon.svg,
// Windows). Where the block is honoured the SVG swaps to paper ink on an ink plate.

/** The plate and the ink per appearance, the theme's exact values (tokens.ts TOKENS). */
export const TILE_COLORS = {
  light: { plate: '#ffffff', ink: '#070707', frame: '#656565' },
  dark: { plate: '#070707', ink: '#f2f2f0', frame: '#888887' },
} as const;

/** A tile's geometry in pixels: the frame is 1 px at the edge; the mark sits inset on the plate. */
export type TileGeometry = {
  size: number;
  frame: 1;
  /** the mark's box inside the tile, in px */
  mark: { x: number; y: number; size: number };
  /** the window inside the mark's box, in px from the mark's origin: [x0, x1, y0, y1) */
  window: readonly [number, number, number, number];
};

/**
 * The solid form's window on a pixel grid of `size` px: the 16 unit edges at 2, 10, 8 and 14
 * land on integers when `size` is a multiple of 8. The 12 px mark of the 16 px tile is the one
 * size that does not (0.75 px per unit puts an edge at 1.5 px), so it is hinted once: rails of
 * 2 px on the left and the bottom, a window 6 px wide and 4 px tall at (2, 6). The 24 px and
 * 40 px marks of the 32 and 48 px tiles keep the arithmetic (1.5 and 2.5 px per unit).
 */
export function solidWindow(size: number): readonly [number, number, number, number] {
  if (size === 12) return [2, 8, 6, 10];
  const [x0, x1, y0, y1] = WINDOW;
  const perCell = size / 8;
  const edges = [x0, x1, y0, y1].map((c) => c * perCell);
  if (!edges.every(Number.isInteger))
    throw new RangeError(`the solid form has no integer edges at ${size} px; add a hint`);
  return edges as unknown as readonly [number, number, number, number];
}

/** The tile sizes the icon set rasterizes and the mark each carries (SPEC-4 1.1, the 16, 32 and 48 px rows). */
export const TILE_SIZES: Readonly<Record<16 | 32 | 48, TileGeometry>> = {
  16: { size: 16, frame: 1, mark: { x: 2, y: 2, size: 12 }, window: solidWindow(12) },
  32: { size: 32, frame: 1, mark: { x: 4, y: 4, size: 24 }, window: solidWindow(24) },
  48: { size: 48, frame: 1, mark: { x: 4, y: 4, size: 40 }, window: solidWindow(40) },
};

/** The solid form on a `size` px grid as a bit image (1 is ink), through `solidWindow`. */
export function solidBits(size: number): BitImage {
  const [x0, x1, y0, y1] = solidWindow(size);
  const bits = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      bits[y * size + x] = x >= x0 && x < x1 && y >= y0 && y < y1 ? 0 : 1;
  return { width: size, height: size, bits };
}

/** The solid form of a tile's mark as a path in tile pixels, for icon-tile.svg. */
export function tileMarkPath(tile: TileGeometry): string {
  const { x, y, size } = tile.mark;
  const [x0, x1, y0, y1] = tile.window;
  return `M${x} ${y}h${size}v${size}H${x}z M${x + x0} ${y + y0}h${x1 - x0}v${y1 - y0}H${x + x0}z`;
}

// ---------------------------------------------------------------------------------------------
// Contrast (SPEC-4 0.50, 1.12): the WCAG 2.2 relative luminance formula on the token values, for
// brand.test.ts, the accessibility record of docs/brand.md and the selection colour of the
// orchestrator's ruling 1 (`--pt-select`, `--pt-guide` in tokens.css).

/** The relative luminance of an sRGB `#rrggbb` colour (WCAG 2.2, the definition of relative luminance). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) throw new TypeError(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(match[1] ?? '0', 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** The contrast ratio of two opaque colours, at least 1. */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The selection colour (the orchestrator's ruling 1 over SPEC-4 0.3; Kevin's directive d): one
 * UI blue per appearance for the canvas selection ring, the handles, the marquee, the hover
 * outline, the crop frame, the group box and the selection chip, and one distinct colour for the
 * snap guides. Each holds at least 3:1 (WCAG 2.2 SC 1.4.11) against both the paper and the ink of
 * its appearance, so a box reads on a white slide and on a dark photograph alike; the chip's text
 * (`--pt-paper` on the blue) holds 4.5:1 (SC 1.4.3). brand.test.ts computes the numbers.
 */
export const SELECTION_COLORS = {
  light: { select: '#1a73e8', guide: '#d6336c' },
  dark: { select: '#3d86f0', guide: '#f0397a' },
} as const;

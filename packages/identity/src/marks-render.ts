// The identity mark's drawing (gslides-parity SPEC-3 4.1; research 11 sections 3.3, 3.4, 6.1,
// 7.1): one raster per MarkSpec and size, drawn once as a bit image and emitted as inline SVG for
// the chrome and as a one bit PNG for the CLI and the exports (marks-png.ts). The same cell grid
// drives both, so a chip in the title row and the PNG `turboslide account me --avatar-png` writes
// show one mark; marks-render.test.ts asserts it over a thousand random specs.
//
// Geometry, in CSS pixels at 1x (11 6.1): the chip is a square of `size`; the plate is the chip
// less a 1 px border; the Bayer field has 2 px cells aligned to the plate's top left so the same
// cells light at every size; the initials variant lights d eighths of the field (d from two hash
// bits) and draws one or two letters as text; the glyph variant is a 5 by 5 grid of cells inside
// the plate with a 1 px inset, each cell empty or one of five glyphs, mirrored left to right, from
// the seed; the dither variant is a Bayer dithered ramp whose centre, angle and curve come from
// the seed; the picture variant is the uploaded picture in the SVG and a bare plate in the bits;
// the agent variant is a 50 percent field with a centred solid square and a dashed border. A
// presenter gains a right pointing triangle at the plate's bottom right; a live chip a 2 px stripe
// in its hue; a chip over a picture the two ring halo. Every bit of ink is 1 in the raster; the
// theme picks the two colours (ink on paper in light chrome, paper on ink in dark).
//
// Browser safe: `bayer8` is the deck's screen (no I/O); the PNG encoder, which imports
// node:zlib, lives behind marks-png.ts.
import { bayer8 } from '@turboslide/effects/bayer';

import { HALO_INNER, HALO_OUTER } from './hues.ts';
import type { MarkSpec } from './marks.ts';

/** One byte per pixel, 1 where the mark is ink; the shape of `@turboslide/effects/image` BitImage. */
export type MarkBits = { width: number; height: number; bits: Uint8Array };

export type MarkTheme = 'light' | 'dark';

/** The chip sizes the chrome draws (11 6.1); the builder's previews and the CLI's PNG add 32, 64 and 256. */
export const MARK_SIZES: readonly number[] = [24, 16, 14];
export const MARK_PREVIEW_SIZES: readonly number[] = [24, 32, 64, 256];
export const MARK_MIN_SIZE = 8;
export const MARK_MAX_SIZE = 1024;

/** The Bayer cell in CSS pixels; the deck's rule keeps it at 2 whatever the size. */
export const MARK_CELL = 2;

/** The colours of the two themes: ground first, then ink (RAMP_COLORS of the effects package). */
export const MARK_COLORS: Readonly<
  Record<MarkTheme, { paper: string; ink: string; edge: string }>
> = {
  light: { paper: '#ffffff', ink: '#070707', edge: '#8a8a88' },
  dark: { paper: '#070707', ink: '#f2f2f0', edge: '#5c5c5a' },
};

export type MarkGlyph = 'empty' | 'dot' | 'dash' | 'slash' | 'square' | 'stroke';
export const MARK_GLYPHS: readonly MarkGlyph[] = ['dot', 'dash', 'slash', 'square', 'stroke'];

function checkSize(size: number): void {
  if (!Number.isInteger(size) || size < MARK_MIN_SIZE || size > MARK_MAX_SIZE)
    throw new RangeError(`mark size must be an integer from ${MARK_MIN_SIZE} to ${MARK_MAX_SIZE}`);
}

/** xorshift32 over the glyph seed: the same bits on every device for one seed. */
export function seededBits(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** The 25 cells of the glyph grid from a seed: 15 chosen, the right two columns mirrored. */
export function glyphGrid(seed: number): MarkGlyph[][] {
  const next = seededBits(seed);
  const rows: MarkGlyph[][] = [];
  for (let r = 0; r < 5; r += 1) {
    const row: MarkGlyph[] = [];
    for (let c = 0; c < 3; c += 1) {
      const word = next();
      // one cell in three stays empty so the figure reads as a figure and not as a plate
      const lit = word % 3 !== 0;
      row.push(lit ? (MARK_GLYPHS[(word >>> 8) % MARK_GLYPHS.length] ?? 'square') : 'empty');
    }
    rows.push([row[0]!, row[1]!, row[2]!, row[1]!, row[0]!]);
  }
  return rows;
}

/** The centre, angle and curve of the dither ramp from a seed (11 6.1, 03 I2 family 2). */
export function rampParams(seed: number): { cx: number; cy: number; angle: number; curve: number } {
  const next = seededBits(seed ^ 0x5bd1e995);
  const unit = (): number => (next() % 10_000) / 10_000;
  return {
    cx: 0.25 + unit() * 0.5,
    cy: 0.25 + unit() * 0.5,
    angle: unit() * Math.PI,
    curve: 0.6 + unit(),
  };
}

/** Whether the point (u, v) of a unit cell, u and v in [0, 1), is ink for a glyph. */
export function glyphInk(glyph: MarkGlyph, u: number, v: number): boolean {
  switch (glyph) {
    case 'empty':
      return false;
    case 'dot':
      return Math.abs(u - 0.5) < 0.25 && Math.abs(v - 0.5) < 0.25;
    case 'dash':
      return Math.abs(v - 0.5) < 0.25;
    case 'slash':
      return Math.abs(u - (1 - v)) < 0.3;
    case 'square':
      return true;
    case 'stroke':
      // the GT mark's stroke, an L: the left column and the bottom row
      return u < 0.25 || v >= 0.75;
  }
}

function plateOf(size: number): { origin: number; extent: number } {
  return { origin: 1, extent: size - 2 };
}

/** True where the agent ring leaves a gap: two on, two off, the corners always on. */
function ringGap(variant: MarkSpec['variant'], i: number, size: number): boolean {
  return variant === 'agent' && i !== 0 && i !== size - 1 && Math.floor(i / 2) % 2 === 1;
}

/** The bit image of a mark: the border ring, the plate's cells, the badge. Theme free. */
export function renderMarkBits(spec: MarkSpec, size: number): MarkBits {
  checkSize(size);
  const bits = new Uint8Array(size * size);
  const set = (x: number, y: number, on: boolean): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    bits[y * size + x] = on ? 1 : 0;
  };
  const plate = plateOf(size);
  // the border ring: solid for people, dashed (2 on, 2 off, the corners on) for an agent (11 3.3)
  for (let i = 0; i < size; i += 1) {
    const on = !ringGap(spec.variant, i, size);
    set(i, 0, on);
    set(i, size - 1, on);
    set(0, i, on);
    set(size - 1, i, on);
  }
  // the plate
  const { origin, extent } = plate;
  switch (spec.variant) {
    case 'initials': {
      const threshold = spec.density * 8;
      for (let y = 0; y < extent; y += 1)
        for (let x = 0; x < extent; x += 1) {
          const r = Math.floor(y / MARK_CELL);
          const c = Math.floor(x / MARK_CELL);
          set(origin + x, origin + y, bayer8(r, c) < threshold);
        }
      break;
    }
    case 'glyph': {
      const grid = glyphGrid(spec.glyphSeed);
      const inner = extent - 2;
      const cell = Math.max(1, Math.floor(inner / 5));
      const offset = origin + 1 + Math.floor((inner - cell * 5) / 2);
      for (let gy = 0; gy < 5; gy += 1)
        for (let gx = 0; gx < 5; gx += 1) {
          const glyph = grid[gy]?.[gx] ?? 'empty';
          for (let y = 0; y < cell; y += 1)
            for (let x = 0; x < cell; x += 1) {
              // below 4 px a glyph reduces to a square (11 6.1)
              const on =
                glyph !== 'empty' &&
                (cell < 4 || glyphInk(glyph, (x + 0.5) / cell, (y + 0.5) / cell));
              set(offset + gx * cell + x, offset + gy * cell + y, on);
            }
        }
      break;
    }
    case 'dither': {
      const { cx, cy, angle, curve } = rampParams(spec.glyphSeed);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let y = 0; y < extent; y += 1)
        for (let x = 0; x < extent; x += 1) {
          const u = (x + 0.5) / extent;
          const v = (y + 0.5) / extent;
          const along = (u - cx) * cos + (v - cy) * sin + 0.5;
          const tone = Math.pow(Math.min(1, Math.max(0, along)), curve);
          const r = Math.floor(y / MARK_CELL);
          const c = Math.floor(x / MARK_CELL);
          set(origin + x, origin + y, bayer8(r, c) / 64 < tone);
        }
      break;
    }
    case 'agent': {
      for (let y = 0; y < extent; y += 1)
        for (let x = 0; x < extent; x += 1) {
          const r = Math.floor(y / MARK_CELL);
          const c = Math.floor(x / MARK_CELL);
          set(origin + x, origin + y, bayer8(r, c) >= 32);
        }
      // the centred solid square: 8 px at 24, 5 at 16, 4 at 14 (11 3.3)
      const square = size >= 24 ? Math.round(size / 3) : size >= 16 ? 5 : 4;
      const start = origin + Math.floor((extent - square) / 2);
      for (let y = 0; y < square; y += 1)
        for (let x = 0; x < square; x += 1) set(start + x, start + y, true);
      break;
    }
    case 'picture':
      // the picture is the SVG's <image>; the raster is a bare plate
      break;
  }
  if (spec.presenter) {
    // a right pointing triangle at the plate's bottom right, inset 1 px, over a 1 px paper gap
    const badge = Math.max(3, Math.round(size / 4));
    const right = origin + extent - 1;
    const bottom = origin + extent - 1;
    for (let y = 0; y < badge + 2; y += 1)
      for (let x = 0; x < badge + 2; x += 1) set(right - 1 - x, bottom - 1 - y, false);
    for (let c = 0; c < badge; c += 1) {
      const trim = Math.floor(c / 2);
      for (let r = trim; r < badge - trim; r += 1)
        set(right - 1 - (badge - 1 - c), bottom - 1 - r, true);
    }
  }
  return { width: size, height: size, bits };
}

export type InkRect = { x: number; y: number; w: number; h: number };

/**
 * The ink of the plate as rects: the horizontal runs of each row, with rows that repeat the row
 * above merged into one rect (a 2 px Bayer cell is two identical rows, the agent's square eight),
 * the ring left out. A 24 px chip is a few dozen rects; a 256 px preview a few thousand.
 */
export function inkRects(bits: MarkBits): InkRect[] {
  const { width, height } = bits;
  const rects: InkRect[] = [];
  const rowRuns = (y: number): { x: number; w: number }[] => {
    const runs: { x: number; w: number }[] = [];
    let start = -1;
    for (let x = 1; x <= width - 1; x += 1) {
      const on = x < width - 1 && bits.bits[y * width + x] === 1;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        runs.push({ x: start, w: x - start });
        start = -1;
      }
    }
    return runs;
  };
  const sameRow = (a: number, b: number): boolean => {
    for (let x = 1; x < width - 1; x += 1)
      if (bits.bits[a * width + x] !== bits.bits[b * width + x]) return false;
    return true;
  };
  let y = 1;
  while (y < height - 1) {
    let h = 1;
    while (y + h < height - 1 && sameRow(y, y + h)) h += 1;
    for (const run of rowRuns(y)) rects.push({ x: run.x, y, w: run.w, h });
    y += h;
  }
  return rects;
}

/** The path data of the plate's ink: one closed subpath per rect. */
export function inkPath(rects: readonly InkRect[]): string {
  return rects.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
}

export type MarkSvgOptions = {
  /** The two ring halo over a dithered picture (11 2.1): 1 px HALO_INNER inside 1 px HALO_OUTER. */
  halo?: boolean;
  /** The 2 px live stripe in the participant's hue; drawn only when the spec carries a hue. */
  live?: boolean;
  /** Extra classes on the root, for the chrome's hooks. */
  className?: string;
};

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The initials' font size: 11 at 24, 8 at 16, 7 at 14, scaled elsewhere (11 6.1). */
export function initialsFontSize(size: number): number {
  if (size === 24) return 11;
  if (size === 16) return 8;
  if (size === 14) return 7;
  return Math.max(6, Math.round((size * 11) / 24));
}

/**
 * The inline SVG of a mark. The raster layer is `renderMarkBits` as `<rect>` runs (so the SVG
 * and the PNG agree cell for cell); the initials and the picture are the two non raster layers;
 * the border, the stripe and the halo are strokes and fills the raster does not carry.
 */
export function renderMarkSvg(
  spec: MarkSpec,
  size: number,
  theme: MarkTheme,
  options: MarkSvgOptions = {},
): string {
  checkSize(size);
  const colors = MARK_COLORS[theme];
  const bits = renderMarkBits(spec, size);
  const { origin, extent } = plateOf(size);
  const halo = options.halo === true;
  const margin = halo ? 2 : 0;
  const total = size + margin * 2;
  const parts: string[] = [];
  const classes = ['ts-mark', `ts-mark-${spec.variant}`];
  if (spec.self) classes.push('ts-mark-self');
  if (spec.presenter) classes.push('ts-mark-presenter');
  if (options.className) classes.push(options.className);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="${classes.join(' ')}" width="${total}" height="${total}" viewBox="${-margin} ${-margin} ${total} ${total}" role="img" aria-label="${escapeAttr(spec.label)}" shape-rendering="crispEdges" data-variant="${spec.variant}" data-trust="${spec.trust}">`,
  );
  if (halo) {
    parts.push(
      `<rect class="ts-mark-halo-out" x="${-1.5}" y="${-1.5}" width="${size + 3}" height="${size + 3}" fill="none" stroke="${HALO_OUTER}" stroke-width="1"/>`,
      `<rect class="ts-mark-halo-in" x="${-0.5}" y="${-0.5}" width="${size + 1}" height="${size + 1}" fill="none" stroke="${HALO_INNER}" stroke-width="1"/>`,
    );
  }
  parts.push(
    `<rect class="ts-mark-plate" x="${origin}" y="${origin}" width="${extent}" height="${extent}" fill="${colors.paper}"/>`,
  );
  if (spec.variant === 'picture' && spec.pictureUrl) {
    parts.push(
      `<image class="ts-mark-picture" x="${origin}" y="${origin}" width="${extent}" height="${extent}" href="${escapeAttr(spec.pictureUrl)}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  // the raster layer: the plate's ink and the badge as one path; the border ring is drawn below
  const rects = inkRects(bits);
  if (rects.length > 0)
    parts.push(`<path class="ts-mark-cells" fill="${colors.ink}" d="${inkPath(rects)}"/>`);
  if (spec.variant === 'initials' && spec.initials.length > 0) {
    const fontSize = initialsFontSize(size);
    parts.push(
      `<text class="ts-mark-initials" x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-family="Inter, 'Inter Fallback', system-ui, sans-serif" font-weight="500" font-size="${fontSize}" style="font-feature-settings:'cv11','ss01'" fill="${colors.ink}">${escapeText(spec.initials)}</text>`,
    );
  }
  const border = spec.self ? colors.ink : colors.edge;
  const dash = spec.variant === 'agent' ? ' stroke-dasharray="2 2"' : '';
  parts.push(
    `<rect class="ts-mark-border" x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${border}" stroke-width="1"${dash}/>`,
  );
  if (options.live === true && spec.hue !== null && spec.variant !== 'agent') {
    parts.push(
      `<rect class="ts-mark-stripe" x="${origin}" y="${origin + extent - 2}" width="${extent}" height="2" fill="${spec.hue.hex}"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/**
 * The raster a rendered SVG encodes: every `ts-mark-cell` rect plus the border ring, as a bit
 * image, for the tests and for a consumer that has the markup and not the spec.
 */
export function bitsOfSvg(svg: string, size: number): MarkBits {
  const bits = new Uint8Array(size * size);
  const variant = /class="ts-mark-border"[^>]*stroke-dasharray/.test(svg) ? 'agent' : 'initials';
  for (let i = 0; i < size; i += 1) {
    if (ringGap(variant, i, size)) continue;
    bits[i] = 1;
    bits[(size - 1) * size + i] = 1;
    bits[i * size] = 1;
    bits[i * size + size - 1] = 1;
  }
  const path = /<path class="ts-mark-cells" fill="[^"]*" d="([^"]*)"/.exec(svg);
  if (path !== null) {
    const rect = /M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g;
    for (const match of (path[1] ?? '').matchAll(rect)) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      const w = Number(match[3]);
      const h = Number(match[4]);
      for (let dy = 0; dy < h; dy += 1)
        for (let dx = 0; dx < w; dx += 1) bits[(y + dy) * size + x + dx] = 1;
    }
  }
  return { width: size, height: size, bits };
}

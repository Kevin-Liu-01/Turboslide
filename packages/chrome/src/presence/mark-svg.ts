import { bayer8 } from '@turboslide/effects/bayer';
import type { MarkSpec } from '@turboslide/identity/marks';

/**
 * The identity mark's cell grid (gslides-parity SPEC-3 4.1; research 11 6.1, 7.1): the pure half
 * of the drawing. One `MarkSpec` gives one grid at 24, 16 or 14 px, the same cells lighting at
 * every size because the grid is aligned to the plate's top left; the chip component draws one
 * `rect` per lit cell. The renderers of `packages/identity` (`renderMarkSvg`, `renderMarkBits`)
 * are B3's stage 2 files and were not in the tree when the chrome's surfaces landed
 * (build-3/b6.md, stage 2 request 2); this module follows research 11's rules cell for cell so
 * the two agree, and `IdentityChip` switches to the package's renderer when it lands.
 *
 * Rules: the plate is the chip less its 1 px border; cells are 2 px; the initials variant is a
 * Bayer field at density d/8 (d from two hash bits, 1 to 4), so ink on the densest plate stays
 * 10.6:1; the glyph variant is a 5 by 5 grid of 4 px cells inside a 22 px plate at 24 px, each
 * cell empty or one of five glyphs, mirrored left to right, from the seed; the dither variant is a
 * Bayer dithered ramp whose centre, angle and curve come from the seed; the agent plate lights
 * exactly half its cells with a centred square.
 */
export type MarkSize = 24 | 16 | 14;

export type MarkCell = { x: number; y: number; w: number; h: number };

/** The glyphs of the glyph variant (research 11 6.1): a dot, a dash, a slash, a square, the GT mark's stroke. */
export type MarkGlyph = 'dot' | 'dash' | 'slash' | 'square' | 'stroke';
export const MARK_GLYPHS: readonly MarkGlyph[] = ['dot', 'dash', 'slash', 'square', 'stroke'];

/** The plate size (the chip less the 1 px border on each side). */
export function plateOf(size: MarkSize): number {
  return size - 2;
}

/** The initials' font size per chip size (11 6.1). */
export function initialsFontSize(size: MarkSize): number {
  return size === 24 ? 11 : size === 16 ? 8 : 7;
}

/** The Bayer field of the initials plate: a cell lights when its screen value is under d/8 of 64. */
export function bayerCells(size: MarkSize, density: 1 | 2 | 3 | 4): MarkCell[] {
  const plate = plateOf(size);
  const cell = 2;
  const n = Math.ceil(plate / cell);
  const limit = density * 8;
  const out: MarkCell[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (bayer8(r, c) < limit) {
        out.push({
          x: c * cell,
          y: r * cell,
          w: Math.min(cell, plate - c * cell),
          h: Math.min(cell, plate - r * cell),
        });
      }
    }
  }
  return out;
}

/** The 5 by 5 glyph grid, mirrored left to right, three bits per cell from the seed (0 is empty). */
export function glyphGrid(seed: number): (MarkGlyph | null)[][] {
  const rows: (MarkGlyph | null)[][] = [];
  let bits = seed >>> 0;
  const next = (): number => {
    const v = bits & 7;
    /* a 32 bit seed carries ten three bit picks; the rest come from a rotation of the seed */
    bits = ((bits >>> 3) | ((bits & 7) << 29)) >>> 0;
    return v;
  };
  for (let r = 0; r < 5; r += 1) {
    const left = [next(), next(), next()].map((v) =>
      v === 0 || v > 5 ? null : MARK_GLYPHS[v - 1]!,
    );
    rows.push([left[0]!, left[1]!, left[2]!, left[1]!, left[0]!]);
  }
  return rows;
}

/** The glyph variant's cells: 4 px cells inside a 22 px plate at 24 px, 2 px squares below. */
export function glyphCells(size: MarkSize, seed: number): MarkCell[] {
  const grid = glyphGrid(seed);
  const out: MarkCell[] = [];
  if (size === 24) {
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        const glyph = grid[r]?.[c] ?? null;
        if (glyph === null) continue;
        const x = 1 + c * 4;
        const y = 1 + r * 4;
        switch (glyph) {
          case 'dot':
            out.push({ x: x + 1, y: y + 1, w: 2, h: 2 });
            break;
          case 'dash':
            out.push({ x, y: y + 1.5, w: 4, h: 1 });
            break;
          case 'slash':
            out.push({ x: x + 2.5, y, w: 1, h: 1.5 });
            out.push({ x: x + 1.5, y: y + 1.25, w: 1, h: 1.5 });
            out.push({ x: x + 0.5, y: y + 2.5, w: 1, h: 1.5 });
            break;
          case 'square':
            out.push({ x: x + 0.5, y: y + 0.5, w: 3, h: 3 });
            break;
          case 'stroke':
            out.push({ x: x + 1.5, y, w: 1, h: 4 });
            break;
        }
      }
    }
    return out;
  }
  const plate = plateOf(size);
  const cell = 2;
  const inset = Math.floor((plate - 10) / 2);
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      if ((grid[r]?.[c] ?? null) === null) continue;
      out.push({ x: inset + c * cell, y: inset + r * cell, w: cell, h: cell });
    }
  }
  return out;
}

/** The dither variant: a ramp from the seed's centre, angle and curve, screened through Bayer 8. */
export function ditherCells(size: MarkSize, seed: number): MarkCell[] {
  const plate = plateOf(size);
  const cell = 2;
  const n = Math.ceil(plate / cell);
  const s = seed >>> 0;
  const angle = ((s & 0xff) / 256) * Math.PI * 2;
  const cx = 0.25 + (((s >>> 8) & 0xff) / 255) * 0.5;
  const cy = 0.25 + (((s >>> 16) & 0xff) / 255) * 0.5;
  const curve = 0.6 + (((s >>> 24) & 0xff) / 255) * 1.4;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const out: MarkCell[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const u = (c + 0.5) / n - cx;
      const v = (r + 0.5) / n - cy;
      const t = Math.min(1, Math.max(0, 0.5 + (u * dx + v * dy)));
      const value = Math.pow(t, curve) * 64;
      if (value > bayer8(r, c)) {
        out.push({
          x: c * cell,
          y: r * cell,
          w: Math.min(cell, plate - c * cell),
          h: Math.min(cell, plate - r * cell),
        });
      }
    }
  }
  return out;
}

/** The agent plate (research 11 3.3): a 50 percent Bayer field with a centred square. */
export function agentCells(size: MarkSize): MarkCell[] {
  const plate = plateOf(size);
  const cells = bayerCells(size, 4);
  const square = Math.max(4, Math.round(plate / 3));
  const at = Math.round((plate - square) / 2);
  const inside = (cell: MarkCell): boolean =>
    cell.x >= at && cell.x < at + square && cell.y >= at && cell.y < at + square;
  return [...cells.filter((cell) => !inside(cell)), { x: at, y: at, w: square, h: square }];
}

/** The lit cells of a mark at a size, in plate coordinates (the plate's top left is 0, 0). */
export function markCells(spec: MarkSpec, size: MarkSize): MarkCell[] {
  switch (spec.variant) {
    case 'agent':
      return agentCells(size);
    case 'glyph':
      return glyphCells(size, spec.glyphSeed);
    case 'dither':
      return ditherCells(size, spec.glyphSeed);
    case 'picture':
      return [];
    case 'initials':
      return bayerCells(size, spec.density);
  }
}

/** The fraction of the plate's cells a mark lights (the agent's is one half within a cell). */
export function litFraction(spec: MarkSpec, size: MarkSize): number {
  const plate = plateOf(size);
  const area = markCells(spec, size).reduce((sum, cell) => sum + cell.w * cell.h, 0);
  return area / (plate * plate);
}

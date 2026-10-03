import type { MarkSpec } from '@turboslide/identity/marks';
import {
  MARK_FIELD_ORIGIN,
  initialsFontSize as packageInitialsFontSize,
  inkRects,
  renderMarkBits,
} from '@turboslide/identity/marks-render';

/**
 * The identity mark's cells for the chip (gslides-parity SPEC-3 4.1; research 11 6.1, 7.1;
 * docs/archive/rounds/PEOPLE.md 3.4, 3.5): the field of the package's `renderMarkBits` in field coordinates,
 * one rect per run of lit pixels, so `IdentityChip`, the builder's previews, the flags and the
 * filmstrip draw exactly what `renderMarkSvg` and `turboslide account me --avatar-png` draw
 * (mark-agreement.test.ts compares the two bit grids). The chip is a square of `size` with a 1 px
 * ring and a 1 px paper gap inside it; the field is `size - 4` wide and the chip draws it inside
 * its 1 px padding. This module computes nothing of its own: the Bayer field, the glyph grid, the
 * dither ramp and the agent field are the package's.
 */
export type MarkSize = 24 | 16 | 14 | 12;

export type MarkCell = { x: number; y: number; w: number; h: number };

/** The field size: the chip less the 1 px ring and the 1 px paper gap on each side (20, 12, 10, 8). */
export function plateOf(size: MarkSize | number): number {
  return size - MARK_FIELD_ORIGIN * 2;
}

/** The initials' font size per chip size (11 6.1): 11 at 24, 8 at 16, 7 at 14, 6 at 12. */
export function initialsFontSize(size: MarkSize | number): number {
  return packageInitialsFontSize(size);
}

/**
 * The lit cells of a mark at a size, in field coordinates (the field's top left is 0, 0): the
 * package raster's runs, the ring left out, the presenter badge left to the chip's own triangle.
 */
export function markCells(spec: MarkSpec, size: MarkSize | number): MarkCell[] {
  const bits = renderMarkBits({ ...spec, presenter: false }, size);
  return inkRects(bits).map((rect) => ({
    x: rect.x - MARK_FIELD_ORIGIN,
    y: rect.y - MARK_FIELD_ORIGIN,
    w: rect.w,
    h: rect.h,
  }));
}

/** The fraction of the field a mark lights (the agent's is one half within a cell). */
export function litFraction(spec: MarkSpec, size: MarkSize | number): number {
  const plate = plateOf(size);
  const area = markCells(spec, size).reduce((sum, cell) => sum + cell.w * cell.h, 0);
  return area / (plate * plate);
}

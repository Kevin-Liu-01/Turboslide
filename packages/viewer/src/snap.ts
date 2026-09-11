// The snap tables of the direct manipulation table (SPEC 6.4). Every gesture on the stage ends in a
// value the grammar already has a property for, so a drag never produces a free number: the key
// column edge lands on the rows key set, the column seam on a named ratio or a 10 px step, the plate
// edge on the plate widths, a shot edge on the column width, 425 or the slot height. The sets come
// from the schema (the literal unions the validator accepts) and the sheet constants of
// @turboslide/theme, never from a second copy here. Pure functions; the gesture engine and the
// keyboard nudges call them, and snap.test.ts pins them.
import { ROWS_KEY_SNAP } from '@turboslide/schema/blocks';
import type { ColsRatio, PlateSide } from '@turboslide/schema/deck';
import { PLATE_WIDTHS } from '@turboslide/schema/deck';
import { jsonEqual } from '@turboslide/schema/pointer';
import { COLUMN_GAP, CONTENT, SHEET, columnWidths } from '@turboslide/theme/tokens';

export type RowsKey = (typeof ROWS_KEY_SNAP)[number];
export type PlateWidth = (typeof PLATE_WIDTHS)[number];
export type NamedRatio = '5/7' | '4/8' | '1/1';

/** The three named column ratios, in the order the seam meets them from left to right (SPEC 6.4). */
export const NAMED_RATIOS: readonly NamedRatio[] = ['4/8', '5/7', '1/1'];

/** A seam within this many sheet pixels of a named ratio's seam takes the name. */
export const RATIO_SNAP_PX = 12;
/** Past the named ratios the seam moves in 10 px steps (SPEC 6.4). */
export const RATIO_STEP_PX = 10;
/** The narrowest column a drag can leave; the 4/8 left column is 418 px, so 200 is well clear. */
export const MIN_COLUMN_PX = 200;

/** The shot width snap points other than the column width and the slot height (SPEC 6.4: 425). */
export const SHOT_WIDTH_SNAP = [425] as const;
/** A shot edge within this many sheet pixels of a snap point takes it. */
export const SHOT_SNAP_PX = 16;
/** The narrowest shot a drag can leave. */
export const MIN_SHOT_PX = 120;

/** A crop drag past this many sheet pixels flips the anchor between top and center. */
export const CROP_FLIP_PX = 24;

/** The nearest value of a set; a tie goes to the larger value so a drag to the right lands ahead. */
export function nearest<T extends number>(set: ReadonlyArray<T>, value: number): T {
  let best = set[0];
  if (best === undefined) throw new RangeError('nearest: the set is empty');
  let bestDistance = Math.abs(best - value);
  for (const candidate of set) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance || (distance === bestDistance && candidate > best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The member of a set `delta` steps from `current` (which need not be a member), clamped to the ends. */
export function stepInSet<T extends number>(
  set: ReadonlyArray<T>,
  current: number,
  delta: number,
): T {
  const sorted = [...set].sort((a, b) => a - b);
  const at = sorted.indexOf(nearest(sorted, current));
  const next = sorted[Math.max(0, Math.min(sorted.length - 1, at + delta))];
  if (next === undefined) throw new RangeError('stepInSet: the set is empty');
  return next;
}

/** The rows key column edge snaps to the key set (SPEC 6.4; the set is the schema's literal union). */
export function snapKey(px: number): RowsKey {
  return nearest(ROWS_KEY_SNAP, px);
}

/** The left column width of a ratio on the content box, from the sheet constants. */
export function ratioLeftWidth(ratio: ColsRatio, gap: number = COLUMN_GAP): number {
  return columnWidths(ratio, gap)[0];
}

/**
 * The column seam snaps to 5/7, 4/8 and 1/1, then moves in 10 px steps (SPEC 6.4). `leftPx` is
 * where the seam's left column would end; a fixed column is written as `{ left }` so the ratio
 * stays a value the schema accepts.
 */
export function snapRatio(leftPx: number, gap: number = COLUMN_GAP): ColsRatio {
  const total = CONTENT[0] - gap;
  const clamped = Math.max(MIN_COLUMN_PX, Math.min(total - MIN_COLUMN_PX, leftPx));
  for (const named of NAMED_RATIOS) {
    if (Math.abs(ratioLeftWidth(named, gap) - clamped) <= RATIO_SNAP_PX) return named;
  }
  const stepped = Math.round(clamped / RATIO_STEP_PX) * RATIO_STEP_PX;
  return { left: Math.max(MIN_COLUMN_PX, Math.min(total - MIN_COLUMN_PX, stepped)) };
}

/**
 * One keyboard step of the seam: 10 px, and from a named ratio one step past its snap zone so the
 * key leaves the name instead of snapping back to it.
 */
export function stepRatio(ratio: ColsRatio, delta: number, gap: number = COLUMN_GAP): ColsRatio {
  const left = ratioLeftWidth(ratio, gap);
  const step = Math.sign(delta) * RATIO_STEP_PX * Math.max(1, Math.abs(delta));
  const next = snapRatio(left + step, gap);
  if (!jsonEqual(next, ratio)) return next;
  return snapRatio(left + step + Math.sign(delta) * (RATIO_SNAP_PX + 1), gap);
}

/**
 * The plate edge snaps to the plate widths the schema accepts (740 opener, 560 mood, 720 closing).
 * SPEC 6.4 says 20 px steps up to the kind's cap; the schema's `maxWidth` is the literal union
 * 740 | 560 | 720 and applyWrite validates every write, so a 20 px step would be refused. The
 * snap follows the schema; the deviation is recorded in the M3 report.
 */
export function snapPlateWidth(px: number): PlateWidth {
  return nearest(PLATE_WIDTHS, px);
}

/**
 * The two sides a plate can take per kind, left half then right half of the sheet (SPEC 6.4 "the
 * sides its kind allows"). The renderer draws `lower-right` as the mood plate and every other side
 * as the opener plate, and `.s-closing .opener-plate` pins it to the top (block-css.ts:18-25), so
 * a closing plate's alternatives are upper left and lower right.
 */
export const PLATE_SIDES_BY_KIND: Readonly<
  Record<'opener' | 'mood' | 'closing', readonly [PlateSide, PlateSide]>
> = {
  opener: ['lower-left', 'lower-right'],
  mood: ['lower-left', 'lower-right'],
  closing: ['upper-left', 'lower-right'],
};

/** The plate side for a pointer at sheet x: the left half keeps the left side, the right half the right. */
export function plateSideFor(kind: 'opener' | 'mood' | 'closing', x: number): PlateSide {
  const [left, right] = PLATE_SIDES_BY_KIND[kind];
  return x >= SHEET.width / 2 ? right : left;
}

/**
 * A shot's width snaps to the column width, 425 and the slot height (SPEC 6.4), else to whole
 * pixels, between MIN_SHOT_PX and the column width.
 */
export function snapShotWidth(px: number, slotWidth: number, slotHeight: number): number {
  const clamped = Math.max(MIN_SHOT_PX, Math.min(slotWidth, px));
  const points = [slotWidth, ...SHOT_WIDTH_SNAP, slotHeight].filter((p) => p <= slotWidth);
  for (const point of points) if (Math.abs(point - clamped) <= SHOT_SNAP_PX) return point;
  return Math.round(clamped);
}

/** A scales marker is an integer 0 to 100 derived from the pointer's fraction of the bar (SPEC 6.4). */
export function snapScaleValue(fraction: number): number {
  return Math.max(0, Math.min(100, Math.round(fraction * 100)));
}

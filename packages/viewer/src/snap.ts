// The snap tables of the direct manipulation table (SPEC 6.4). Every gesture on the stage ends in a
// value the grammar already has a property for, so a drag never produces a free number: the key
// column edge lands on the rows key set, the column seam on a named ratio or a 10 px step, the plate
// edge on the plate widths, a shot edge on the column width, 425 or the slot height. The sets come
// from the schema (the literal unions the validator accepts) and the sheet constants of
// @turboslide/theme, never from a second copy here. Pure functions; the gesture engine and the
// keyboard nudges call them, and snap.test.ts pins them.
import { ROWS_KEY_SNAP } from '@turboslide/schema/blocks';
import type { ColsRatio, PlateSide } from '@turboslide/schema/deck';
import {
  FREEFORM_GRID,
  GUIDES,
  SNAP_DISTANCE,
  snapToGrid as schemaSnapToGrid,
} from '@turboslide/schema/freeform';
import { PLATE_WIDTHS } from '@turboslide/schema/deck';
import { jsonEqual } from '@turboslide/schema/pointer';
import { COLUMN_GAP, CONTENT, CONTENT_ORIGIN, SHEET, columnWidths } from '@turboslide/theme/tokens';

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

// ---------------------------------------------------------------------------------------------
// The freeform snap engine (Kevin's direction of 2026-09-11, recorded over SPEC 6.4's
// no-coordinates rule; docs/freeform.md): a positioned block drags anywhere on the 1600 by 900
// sheet and lands on the 8 px grid, the rails at 56 px, the content box edges and centers, the
// column seams of the named ratios, the plate edges (the schema's GUIDES, one implementation the
// CLI's block.align and the inspector's position control share), and the edges and centers of the
// other blocks, which only the stage knows. A line snap wins within FREE_SNAP_PX and is what the
// overlay draws as a guide; the grid takes the rest and draws nothing. Pure functions over sheet
// pixels; snap-freeform.test.ts pins them.

/** The freeform grid step in sheet pixels (schema/freeform.ts FREEFORM_GRID). */
export const FREE_GRID: number = FREEFORM_GRID;
/** A box edge or center within this many sheet pixels of a snap line takes the line (SNAP_DISTANCE). */
export const FREE_SNAP_PX: number = SNAP_DISTANCE;
/** The smallest side a resize can leave. */
export const FREE_MIN_SIZE = 16;

export type SnapAxis = 'x' | 'y';
/**
 * Where a snap line comes from: the grid, a GT line (rail, content box, seam, plate edge), another
 * object's edge or centre, the sheet's edge or centre, a deck guide (SPEC-2 2.10) or an equal
 * spacing match (SPEC-2 6.1 row 7).
 */
export type SnapKind =
  | 'grid'
  | 'rail'
  | 'content'
  | 'seam'
  | 'plate'
  | 'edge'
  | 'center'
  | 'sheet'
  | 'guide'
  | 'spacing';

/**
 * One snap line: a vertical (`axis: 'x'`) or horizontal (`axis: 'y'`) line at `at`, spanning
 * `from` to `to` along its own direction, so the overlay can draw the guide over the source and
 * the snapped box together.
 */
export type SnapLine = { axis: SnapAxis; at: number; kind: SnapKind; from: number; to: number };

/** The eight resize directions, compass named. */
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_DIRS: readonly ResizeDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The kind of a schema guide from its name (schema/freeform.ts verticalGuides, horizontalGuides). */
function kindOfGuide(name: string): SnapKind {
  if (name.includes('rail') || name.includes('rule')) return 'rail';
  if (name.includes('plate')) return 'plate';
  if (name.includes('column')) return 'seam';
  return 'content';
}

/**
 * The sheet's own snap lines, from the schema's GUIDES: the four rails at 56 px span the whole
 * sheet; the content box's edges and centers, the column seams of the three named ratios (both
 * sides of the gap) and the plate edges span the content box.
 */
export function sheetSnapLines(): SnapLine[] {
  const [cx, cy] = CONTENT_ORIGIN;
  const [cw, ch] = CONTENT;
  const lines: SnapLine[] = [];
  for (const guide of GUIDES.x) {
    const kind = kindOfGuide(guide.name);
    const full = kind === 'rail';
    lines.push({
      axis: 'x',
      at: guide.at,
      kind,
      from: full ? 0 : cy,
      to: full ? SHEET.height : cy + ch,
    });
  }
  for (const guide of GUIDES.y) {
    const kind = kindOfGuide(guide.name);
    const full = kind === 'rail';
    lines.push({
      axis: 'y',
      at: guide.at,
      kind,
      from: full ? 0 : cx,
      to: full ? SHEET.width : cx + cw,
    });
  }
  return lines;
}

/** The sheet's own edges and centre (SPEC-2 6.1 row 7: "the sheet's edges and centre"). */
export function sheetEdgeLines(): SnapLine[] {
  const { width, height } = SHEET;
  return [
    { axis: 'x', at: 0, kind: 'sheet', from: 0, to: height },
    { axis: 'x', at: width / 2, kind: 'sheet', from: 0, to: height },
    { axis: 'x', at: width, kind: 'sheet', from: 0, to: height },
    { axis: 'y', at: 0, kind: 'sheet', from: 0, to: width },
    { axis: 'y', at: height / 2, kind: 'sheet', from: 0, to: width },
    { axis: 'y', at: height, kind: 'sheet', from: 0, to: width },
  ];
}

/** The deck's guides as snap lines spanning the sheet (SPEC-2 2.10, 6.1 row 31). */
export function deckGuideLines(
  guides: { x: ReadonlyArray<number>; y: ReadonlyArray<number> } | undefined,
): SnapLine[] {
  if (!guides) return [];
  return [
    ...guides.x.map((at): SnapLine => ({
      axis: 'x',
      at,
      kind: 'guide',
      from: 0,
      to: SHEET.height,
    })),
    ...guides.y.map((at): SnapLine => ({ axis: 'y', at, kind: 'guide', from: 0, to: SHEET.width })),
  ];
}

/**
 * Shift constrains a move to one axis: the axis of the larger delta keeps its value and the other
 * is zero (SPEC-2 6.1 row 7).
 */
export function axisLock(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

type SpacingSnap = { delta: number; guides: SnapLine[] };

/**
 * The equal spacing snap on one axis (SPEC-2 6.1 row 7; Google's spacing guides, R05 C7): for
 * every pair of resting boxes that overlap the moving box on the other axis and sit apart by a
 * gap, the moving box snaps to the place where its gap to the nearer box equals that gap (beyond
 * the pair on either side, or midway between two boxes). The guides drawn are the ticks that
 * bound the two equal gaps, spanning the moving box on the other axis.
 */
function spacingAxis(
  moving: readonly [number, number, number, number],
  others: ReadonlyArray<readonly [number, number, number, number]>,
  axis: SnapAxis,
): SpacingSnap | null {
  const main = axis === 'x' ? 0 : 1;
  const cross = axis === 'x' ? 1 : 0;
  const size = axis === 'x' ? 2 : 3;
  const crossSize = axis === 'x' ? 3 : 2;
  const overlapsCross = (box: readonly [number, number, number, number]): boolean =>
    box[cross] < moving[cross] + moving[crossSize] && box[cross] + box[crossSize] > moving[cross];
  const rows = others.filter(overlapsCross).sort((a, b) => a[main] - b[main]);
  let best: (SpacingSnap & { distance: number }) | null = null;
  const tick = (at: number): SnapLine => ({
    axis,
    at,
    kind: 'spacing',
    from: moving[cross],
    to: moving[cross] + moving[crossSize],
  });
  const consider = (candidateStart: number, ticks: number[]) => {
    const delta = candidateStart - moving[main];
    if (Math.abs(delta) > FREE_SNAP_PX) return;
    if (best !== null && Math.abs(delta) >= best.distance) return;
    const unique = ticks.filter((at, index) => ticks.indexOf(at) === index);
    best = { delta, distance: Math.abs(delta), guides: unique.map(tick) };
  };
  const length = moving[size];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a === undefined || b === undefined) continue;
    const aEnd = a[main] + a[size];
    const bEnd = b[main] + b[size];
    const gap = b[main] - aEnd;
    if (gap <= 0) continue;
    // after b with the same gap
    consider(bEnd + gap, [aEnd, b[main], bEnd, bEnd + gap]);
    // before a with the same gap
    consider(a[main] - gap - length, [a[main] - gap, a[main], aEnd, b[main]]);
  }
  // midway between two boxes, at equal distance from both
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a === undefined || b === undefined) continue;
      const aEnd = a[main] + a[size];
      const room = b[main] - aEnd - length;
      if (room <= 0) continue;
      const gap = room / 2;
      consider(aEnd + gap, [aEnd, aEnd + gap, aEnd + gap + length, b[main]]);
    }
  }
  return best;
}

/** The six snap lines of a box: its left, center and right, its top, middle and bottom. */
export function boxSnapLines(box: readonly [number, number, number, number]): SnapLine[] {
  const [x, y, w, h] = box;
  return [
    { axis: 'x', at: x, kind: 'edge', from: y, to: y + h },
    { axis: 'x', at: x + w / 2, kind: 'center', from: y, to: y + h },
    { axis: 'x', at: x + w, kind: 'edge', from: y, to: y + h },
    { axis: 'y', at: y, kind: 'edge', from: x, to: x + w },
    { axis: 'y', at: y + h / 2, kind: 'center', from: x, to: x + w },
    { axis: 'y', at: y + h, kind: 'edge', from: x, to: x + w },
  ];
}

/** The nearest multiple of the grid (the schema's snapToGrid). */
export function snapToGrid(value: number, grid: number = FREE_GRID): number {
  return schemaSnapToGrid(value, grid);
}

type AxisSnap = { delta: number; line: SnapLine | null };

/**
 * The best line snap for a set of moving positions on one axis: the smallest correction within
 * FREE_SNAP_PX, ties to the earlier line. With no line in range the first position (the leading
 * edge) lands on the grid.
 */
function snapAxis(positions: number[], lines: SnapLine[], axis: SnapAxis, grid: boolean): AxisSnap {
  let best: AxisSnap | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    for (const at of positions) {
      const delta = line.at - at;
      if (Math.abs(delta) > FREE_SNAP_PX) continue;
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line };
    }
  }
  if (best) return best;
  const lead = positions[0];
  if (!grid || lead === undefined) return { delta: 0, line: null };
  return { delta: snapToGrid(lead) - lead, line: null };
}

/** A guide spanning the snap line's own extent and the snapped box's, so it reaches both. */
function guideFor(line: SnapLine, box: readonly [number, number, number, number]): SnapLine {
  const [x, y, w, h] = box;
  const lo = line.axis === 'x' ? y : x;
  const hi = line.axis === 'x' ? y + h : x + w;
  return { ...line, from: Math.min(line.from, lo), to: Math.max(line.to, hi) };
}

export type SnapResult = { box: [number, number, number, number]; guides: SnapLine[] };

/**
 * A box moved by (dx, dy) and snapped: its left, center and right against the vertical lines,
 * its top, middle and bottom against the horizontal ones, else its top left corner on the grid.
 * The result is rounded to whole sheet pixels, which is what `pos` stores.
 */
export function snapMove(
  box: readonly [number, number, number, number],
  dx: number,
  dy: number,
  lines: SnapLine[],
  options: {
    grid?: boolean;
    /** the resting boxes the equal spacing guides read (SPEC-2 6.1 row 7); none skips them */
    spacing?: ReadonlyArray<readonly [number, number, number, number]>;
  } = {},
): SnapResult {
  const grid = options.grid ?? true;
  const [x0, y0, w, h] = box;
  const x = x0 + dx;
  const y = y0 + dy;
  let sx: AxisSnap = snapAxis([x, x + w / 2, x + w], lines, 'x', grid);
  let sy: AxisSnap = snapAxis([y, y + h / 2, y + h], lines, 'y', grid);
  const guides: SnapLine[] = [];
  const moved: [number, number, number, number] = [x, y, w, h];
  if (options.spacing !== undefined && options.spacing.length > 1) {
    const spx = spacingAxis(moved, options.spacing, 'x');
    if (spx !== null && (sx.line === null || Math.abs(spx.delta) < Math.abs(sx.delta))) {
      sx = { delta: spx.delta, line: null };
      guides.push(...spx.guides);
    }
    const spy = spacingAxis(moved, options.spacing, 'y');
    if (spy !== null && (sy.line === null || Math.abs(spy.delta) < Math.abs(sy.delta))) {
      sy = { delta: spy.delta, line: null };
      guides.push(...spy.guides);
    }
  }
  const snapped: [number, number, number, number] = [
    Math.round(x + sx.delta),
    Math.round(y + sy.delta),
    Math.round(w),
    Math.round(h),
  ];
  if (sx.line) guides.push(guideFor(sx.line, snapped));
  if (sy.line) guides.push(guideFor(sy.line, snapped));
  return { box: snapped, guides };
}

function hasDir(dir: ResizeDir, edge: 'n' | 's' | 'e' | 'w'): boolean {
  return dir.includes(edge);
}

/**
 * A box resized from one of eight handles by (dx, dy): only the moving edges snap, the opposite
 * edges hold, no side drops under `min`. With `aspect` (Shift) the corner handles keep the box's
 * ratio from the dominant delta and an edge handle scales the other side from its own; the
 * dependent side skips the line snap so the ratio holds exactly.
 */
export function snapResize(
  box: readonly [number, number, number, number],
  dir: ResizeDir,
  dx: number,
  dy: number,
  lines: SnapLine[],
  options: { aspect?: boolean; min?: number; grid?: boolean } = {},
): SnapResult {
  const min = options.min ?? FREE_MIN_SIZE;
  const grid = options.grid ?? true;
  const aspect = options.aspect ?? false;
  const [x, y, w, h] = box;
  let left = x;
  let right = x + w;
  let top = y;
  let bottom = y + h;
  /* an edge snaps only when the pointer moved along its axis: a corner dragged sideways keeps
     its top and bottom where they are instead of taking a nearby line (a phantom resize) */
  const movesX = (hasDir(dir, 'e') || hasDir(dir, 'w')) && dx !== 0;
  const movesY = (hasDir(dir, 'n') || hasDir(dir, 's')) && dy !== 0;
  if (hasDir(dir, 'w')) left += dx;
  if (hasDir(dir, 'e')) right += dx;
  if (hasDir(dir, 'n')) top += dy;
  if (hasDir(dir, 's')) bottom += dy;
  const guides: SnapLine[] = [];
  const ratio = h > 0 ? w / h : 1;
  /* which axis leads under an aspect lock: the larger relative change on a corner, the moving
     axis on an edge */
  const leadX = !aspect
    ? movesX
    : movesX && movesY
      ? Math.abs(dx) / Math.max(1, w) >= Math.abs(dy) / Math.max(1, h)
      : movesX || ((hasDir(dir, 'e') || hasDir(dir, 'w')) && !movesY);
  const leadY = !aspect ? movesY : !leadX;
  if (leadX) {
    if (hasDir(dir, 'w')) {
      const s = snapAxis([left], lines, 'x', grid);
      left += s.delta;
      if (s.line) guides.push(s.line);
    } else if (hasDir(dir, 'e')) {
      const s = snapAxis([right], lines, 'x', grid);
      right += s.delta;
      if (s.line) guides.push(s.line);
    }
    if (right - left < min) {
      if (hasDir(dir, 'w')) left = right - min;
      else right = left + min;
    }
  }
  if (leadY) {
    if (hasDir(dir, 'n')) {
      const s = snapAxis([top], lines, 'y', grid);
      top += s.delta;
      if (s.line) guides.push(s.line);
    } else if (hasDir(dir, 's')) {
      const s = snapAxis([bottom], lines, 'y', grid);
      bottom += s.delta;
      if (s.line) guides.push(s.line);
    }
    if (bottom - top < min) {
      if (hasDir(dir, 'n')) top = bottom - min;
      else bottom = top + min;
    }
  }
  if (aspect) {
    if (leadX) {
      const nextH = Math.max(min, (right - left) / ratio);
      // an edge handle grows from the top; a corner grows away from its anchored side
      if (hasDir(dir, 'n')) top = bottom - nextH;
      else bottom = top + nextH;
    } else {
      const nextW = Math.max(min, (bottom - top) * ratio);
      if (hasDir(dir, 'w')) left = right - nextW;
      else right = left + nextW;
    }
  }
  const snapped: [number, number, number, number] = [
    Math.round(left),
    Math.round(top),
    Math.max(min, Math.round(right - left)),
    Math.max(min, Math.round(bottom - top)),
  ];
  return { box: snapped, guides: guides.map((line) => guideFor(line, snapped)) };
}

/** The cursor of a resize handle by its direction. */
export function resizeCursor(
  dir: ResizeDir,
): 'ns-resize' | 'ew-resize' | 'nesw-resize' | 'nwse-resize' {
  switch (dir) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

// The canvas geometry without zod: the sheet's constants (render.ts), the rotation and flip
// helpers (position.ts), the guide lines, the snap, the rotated bounding box and the align,
// distribute, rotate, flip, scale and z order arithmetic (freeform.ts; docs/freeform.md,
// gslides-parity SPEC-2 2.1 and 0.107), the resize model (canvas.ts; SPEC-5-amendments A4), and
// the snap engine, the rotation of a handle drag and the guide merge the viewer's snap.ts,
// rotate.ts and Guides.tsx kept (SPEC-2 6.1 rows 7, 9 and 11). Those modules re-export these
// names beside their own, as ids.ts does for slug.ts, so every importer keeps its path. This
// module imports types alone, so a page that must not load zod or the shape table can run the
// editor's own arithmetic from here (the landing's Canvas screen did until the story replaced it
// on 2026-11-03). Pure functions over sheet pixels.
import type { BlockType } from './blocks.ts';
import type { ColsRatio } from './deck.ts';
import type { BlockId } from './ids.ts';
import type { Flip, Position } from './position.ts';

export type Box = [number, number, number, number];

/** The sheet in px (SPEC 2.1). */
export const SHEET_WIDTH = 1600;
export const SHEET_HEIGHT = 900;

/** The content box: the slide inset 57 px with 72 by 80 padding (SPEC 2.1; DECK-GRAMMAR.md:15). */
export const CONTENT_BOX: Box = [137, 129, 1326, 642];

/** Rails and rules at 56 px from the sheet edges (SPEC 2.1). */
export const RAIL_PX = 56;

/** The z a block sorts by: its recorded z, or 0. */
export function zOf(position: Position | undefined): number {
  return position?.z ?? 0;
}

/** A rotation brought into [0, 360): 370 is 10, -90 is 270 (SPEC-2 2.1.1). */
export function normalizeRotation(degrees: number): number {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  // -0 and 360 both read as 0
  return positive === 360 || Object.is(positive, -0) ? 0 : positive;
}

/** The flip after toggling one axis: h on nothing is h, h on h is nothing, v on h is hv (block.flip). */
export function toggleFlip(current: Flip | undefined, axis: 'h' | 'v'): Flip | undefined {
  const h = (current === 'h' || current === 'hv') !== (axis === 'h');
  const v = (current === 'v' || current === 'hv') !== (axis === 'v');
  if (h && v) return 'hv';
  if (h) return 'h';
  if (v) return 'v';
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Guides and the freeform snap (freeform.ts)

/** Boxes snap to this grid when no guide is closer (docs/freeform.md). */
export const FREEFORM_GRID = 8;
/** A guide within this many px wins over the grid. */
export const SNAP_DISTANCE = 6;
/** The column gap of `.cols` (head:83; deck.ts COLS_GAPS). */
export const COLS_GAP = 72;
/** The plate widths of the three full-picture kinds (SPEC 2.1). */
export const PLATE_WIDTHS = { opener: 740, mood: 560, closing: 720 } as const;

const [CONTENT_X, CONTENT_Y, CONTENT_W, CONTENT_H] = CONTENT_BOX;

export type Guide = { at: number; name: string };

/** Pixel widths of the two columns of a cols layout on the content width (render/geometry.ts). */
export function columnWidths(ratio: ColsRatio, gap: number = COLS_GAP): [number, number] {
  const total = CONTENT_W - gap;
  if (typeof ratio === 'string') {
    const parts = ratio.split('/').map(Number);
    const a = parts[0] ?? 1;
    const b = parts[1] ?? 1;
    const unit = total / (a + b);
    return [unit * a, unit * b];
  }
  if ('left' in ratio) return [ratio.left, total - ratio.left];
  return [total - ratio.right, ratio.right];
}

/** The vertical guide lines (x values): rails, content edges and center, column seams, plate edges. */
export function verticalGuides(): Guide[] {
  const out: Guide[] = [
    { at: RAIL_PX, name: 'left rail' },
    { at: SHEET_WIDTH - RAIL_PX, name: 'right rail' },
    { at: CONTENT_X, name: 'content left' },
    { at: CONTENT_X + CONTENT_W, name: 'content right' },
    { at: CONTENT_X + CONTENT_W / 2, name: 'content center' },
  ];
  for (const ratio of ['5/7', '4/8', '1/1'] as const) {
    const [left] = columnWidths(ratio);
    out.push({ at: CONTENT_X + left, name: `${ratio} left column edge` });
    out.push({ at: CONTENT_X + left + COLS_GAP, name: `${ratio} right column edge` });
  }
  out.push({ at: CONTENT_X + PLATE_WIDTHS.opener, name: 'opener plate edge' });
  out.push({ at: CONTENT_X + PLATE_WIDTHS.closing, name: 'closing plate edge' });
  out.push({ at: CONTENT_X + CONTENT_W - PLATE_WIDTHS.mood, name: 'mood plate edge' });
  return out.sort((a, b) => a.at - b.at);
}

/** The horizontal guide lines (y values): rules, content edges and center. */
export function horizontalGuides(): Guide[] {
  return [
    { at: RAIL_PX, name: 'top rule' },
    { at: SHEET_HEIGHT - RAIL_PX, name: 'bottom rule' },
    { at: CONTENT_Y, name: 'content top' },
    { at: CONTENT_Y + CONTENT_H, name: 'content bottom' },
    { at: CONTENT_Y + CONTENT_H / 2, name: 'content middle' },
  ].sort((a, b) => a.at - b.at);
}

export const GUIDES = { x: verticalGuides(), y: horizontalGuides() } as const;

export function snapToGrid(value: number, grid: number = FREEFORM_GRID): number {
  return Math.round(value / grid) * grid;
}

/** The nearest guide within the snap distance, else the grid. */
export function snapCoordinate(
  value: number,
  guides: ReadonlyArray<Guide>,
  distance: number = SNAP_DISTANCE,
): { value: number; guide?: string } {
  let best: Guide | undefined;
  for (const guide of guides) {
    const d = Math.abs(guide.at - value);
    if (d <= distance && (best === undefined || d < Math.abs(best.at - value))) best = guide;
  }
  if (best !== undefined) return { value: best.at, guide: best.name };
  return { value: snapToGrid(value) };
}

/**
 * A box with its left, top, right and bottom edges snapped: each edge takes the nearest guide
 * within the snap distance or the grid, and the width and height keep at least one grid step.
 */
export function snapPosition(pos: Position): Position {
  const x = snapCoordinate(pos.x, GUIDES.x).value;
  const y = snapCoordinate(pos.y, GUIDES.y).value;
  const right = snapCoordinate(pos.x + pos.w, GUIDES.x).value;
  const bottom = snapCoordinate(pos.y + pos.h, GUIDES.y).value;
  return {
    ...pos,
    x,
    y,
    w: Math.max(FREEFORM_GRID, right - x),
    h: Math.max(FREEFORM_GRID, bottom - y),
  };
}

/** A box moved so its left and top edges snap, with its size kept; what align and distribute apply. */
export function snapOrigin(pos: Position): Position {
  return {
    ...pos,
    x: snapCoordinate(pos.x, GUIDES.x).value,
    y: snapCoordinate(pos.y, GUIDES.y).value,
  };
}

export function positionBox(pos: Position): Box {
  return [pos.x, pos.y, pos.w, pos.h];
}

/**
 * The axis aligned bounding box of a rotated position box (gslides-parity SPEC-2 0.107): the four
 * corners rotated about the centre and spanned. What the snap lines, `block.align`,
 * `block.distribute`, the marquee, `freeform/overlap`, `freeform/off-sheet` and the overlay's
 * union ring read for a rotated object; an unrotated box is its own bounding box. A flip mirrors
 * about the centre and leaves the bounding box where it is.
 */
export function boundingBox(pos: Position): Position {
  const angle = normalizeRotation(pos.rotate ?? 0);
  if (angle === 0) return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = pos.w * cos + pos.h * sin;
  const h = pos.w * sin + pos.h * cos;
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** True when the box lies inside the content box, where the renderer places it under `.in`. */
export function insideContent(pos: Position): boolean {
  return (
    pos.x >= CONTENT_X &&
    pos.y >= CONTENT_Y &&
    pos.x + pos.w <= CONTENT_X + CONTENT_W &&
    pos.y + pos.h <= CONTENT_Y + CONTENT_H
  );
}

/**
 * Where a rotated object's bounding box lies against the 1600 by 900 sheet (SPEC-2 0.96):
 * `inside`, `crossing` an edge (part of it shows), or wholly `outside` (nothing of it shows).
 * `freeform/off-sheet` reads it: severity 3 for `outside`, 2 for `crossing`.
 */
export function offSheetKind(pos: Position): 'inside' | 'crossing' | 'outside' {
  const b = boundingBox(pos);
  if (b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= SHEET_WIDTH || b.y >= SHEET_HEIGHT)
    return 'outside';
  if (b.x < 0 || b.y < 0 || b.x + b.w > SHEET_WIDTH || b.y + b.h > SHEET_HEIGHT) return 'crossing';
  return 'inside';
}

/** True when any part of the rotated bounding box leaves the 1600 by 900 sheet (freeform/off-sheet). */
export function offSheet(pos: Position): boolean {
  return offSheetKind(pos) !== 'inside';
}

/** The area two boxes share, read over their rotated bounding boxes; 0 when they only touch. */
export function overlapArea(a: Position, b: Position): number {
  const ba = boundingBox(a);
  const bb = boundingBox(b);
  const w = Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x);
  const h = Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function boxesOverlap(a: Position, b: Position): boolean {
  return overlapArea(a, b) > 0;
}

// ---------------------------------------------------------------------------------------------
// Align, distribute, order (freeform.ts)

export const ALIGN_EDGES = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];
export const ALIGN_TARGETS = ['selection', 'content', 'sheet'] as const;
export type AlignTarget = (typeof ALIGN_TARGETS)[number];
export const DISTRIBUTE_AXES = ['horizontal', 'vertical'] as const;
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number];
export const ORDER_MOVES = ['front', 'back', 'forward', 'backward'] as const;
export type OrderMove = (typeof ORDER_MOVES)[number];

function unionOf(positions: ReadonlyArray<Position>): Box {
  const x = Math.min(...positions.map((p) => p.x));
  const y = Math.min(...positions.map((p) => p.y));
  const right = Math.max(...positions.map((p) => p.x + p.w));
  const bottom = Math.max(...positions.map((p) => p.y + p.h));
  return [x, y, right - x, bottom - y];
}

/**
 * The reference `block.align` resolves when `to` is not set (gslides-parity SPEC-2 0.80): the
 * selection for several blocks, the sheet for one (Google's Align and Center on page act on the
 * slide with one object selected).
 */
export function resolveAlignTarget(
  positions: ReadonlyArray<Position>,
  target: AlignTarget | undefined,
): AlignTarget {
  return target ?? (positions.length > 1 ? 'selection' : 'sheet');
}

/**
 * The reference box an alignment works against (gslides-parity SPEC-2 0.80): the selection's
 * union for several blocks, the sheet for one block (Google's Center on page reading), or the box
 * named by `to`. The union reads the rotated bounding boxes (0.107).
 */
export function alignReference(
  positions: ReadonlyArray<Position>,
  target: AlignTarget | undefined,
): Box {
  const resolved = resolveAlignTarget(positions, target);
  if (resolved === 'sheet') return [0, 0, SHEET_WIDTH, SHEET_HEIGHT];
  if (resolved === 'content') return CONTENT_BOX;
  return unionOf(positions.map(boundingBox));
}

/** The union of the rotated bounding boxes of several positions, as a box. */
export function unionBox(positions: ReadonlyArray<Position>): Box {
  return unionOf(positions.map(boundingBox));
}

/**
 * The positions moved so the named edge sits on the reference's edge; sizes are unchanged. With
 * `snap` the selection's shared edge snaps to the guides and the grid once, so the aligned blocks
 * still share one edge after the snap. The sheet's and the content box's edges and centres are
 * lines themselves and stay exact (the grid would put the sheet's bottom at 904, off the sheet;
 * VERIFICATION-2 finding 7), and a snap that would carry the line off the sheet keeps the exact
 * line.
 */
export function alignPositions(
  positions: ReadonlyArray<Position>,
  edge: AlignEdge,
  target?: AlignTarget,
  snap = false,
): Position[] {
  const resolved = resolveAlignTarget(positions, target);
  const [rx, ry, rw, rh] = alignReference(positions, resolved);
  const horizontal = edge === 'left' || edge === 'center' || edge === 'right';
  let line =
    edge === 'left'
      ? rx
      : edge === 'center'
        ? rx + rw / 2
        : edge === 'right'
          ? rx + rw
          : edge === 'top'
            ? ry
            : edge === 'middle'
              ? ry + rh / 2
              : ry + rh;
  if (snap && resolved === 'selection') {
    const snapped = snapCoordinate(line, horizontal ? GUIDES.x : GUIDES.y).value;
    const extent = horizontal ? SHEET_WIDTH : SHEET_HEIGHT;
    if (snapped >= 0 && snapped <= extent) line = snapped;
  }
  // a rotated object aligns by its bounding box (SPEC-2 0.107): the box moves by the distance its
  // bounding box's edge is from the line
  return positions.map((p) => {
    const b = boundingBox(p);
    switch (edge) {
      case 'left':
        return { ...p, x: p.x + (line - b.x) };
      case 'center':
        return { ...p, x: p.x + (line - (b.x + b.w / 2)) };
      case 'right':
        return { ...p, x: p.x + (line - (b.x + b.w)) };
      case 'top':
        return { ...p, y: p.y + (line - b.y) };
      case 'middle':
        return { ...p, y: p.y + (line - (b.y + b.h / 2)) };
      case 'bottom':
        return { ...p, y: p.y + (line - (b.y + b.h)) };
    }
  });
}

/**
 * The positions spread along an axis: sorted by their leading edge, the first and last stay
 * where they are and the others take equal gaps between them, or every gap becomes `gap` from
 * the first when one is given. Returned in the input order.
 */
export function distributePositions(
  positions: ReadonlyArray<Position>,
  axis: DistributeAxis,
  gap?: number,
): Position[] {
  if (positions.length < 2) return positions.map((p) => ({ ...p }));
  const lead = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'w' : 'h';
  // the bounding boxes lead and size the spread (SPEC-2 0.107); the object moves by the same delta
  const order = positions
    .map((p, index) => ({ p, b: boundingBox(p), index }))
    .sort((a, b) => a.b[lead] - b.b[lead] || a.index - b.index);
  const first = order[0]?.b;
  const last = order[order.length - 1]?.b;
  if (first === undefined || last === undefined) return positions.map((p) => ({ ...p }));
  const total = order.reduce((sum, { b }) => sum + b[size], 0);
  const span = last[lead] + last[size] - first[lead];
  const step = gap ?? (order.length > 1 ? (span - total) / (order.length - 1) : 0);
  const out: Position[] = positions.map((p) => ({ ...p }));
  let cursor = first[lead];
  for (const { p, b, index } of order) {
    out[index] = { ...p, [lead]: p[lead] + (cursor - b[lead]) };
    cursor += b[size] + step;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rotate and flip (gslides-parity SPEC-2 2.1, 0.102): what block.rotate and block.flip write

/** A point rotated about a centre by degrees clockwise (the screen's y axis points down). */
function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  degrees: number,
): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * The positions after a rotation by `by` degrees: about each box's own centre (`each`), or about
 * the centre of the selection's union (`selection`), which moves each member's centre around the
 * union centre and adds the angle to its own rotation (a group rotation, SPEC-2 6.2). Rotations
 * are normalized to [0, 360); a result of 0 removes the field.
 */
export function rotatePositions(
  positions: ReadonlyArray<Position>,
  by: number,
  about: 'each' | 'selection' = 'each',
): Position[] {
  const [ux, uy, uw, uh] = unionBox(positions);
  const cx = ux + uw / 2;
  const cy = uy + uh / 2;
  return positions.map((p) => {
    const rotate = normalizeRotation((p.rotate ?? 0) + by);
    const next: Position = { ...p };
    if (rotate === 0) delete next.rotate;
    else next.rotate = rotate;
    if (about === 'selection' && positions.length > 1) {
      const centre = rotatePoint(p.x + p.w / 2, p.y + p.h / 2, cx, cy, by);
      next.x = halfPixel(centre.x - p.w / 2);
      next.y = halfPixel(centre.y - p.h / 2);
    }
    return next;
  });
}

/** A coordinate on the half pixel grid: what a rotation about the selection writes. */
function halfPixel(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * The positions after a flip on one axis (SPEC-2 0.102): each box's `flip` toggles; about the
 * selection every member's box also mirrors about the union centre and its rotation becomes 360
 * minus the angle, so a mirrored group keeps its shape. A resulting flip of nothing removes the
 * field.
 */
export function flipPositions(
  positions: ReadonlyArray<Position>,
  axis: 'h' | 'v',
  about: 'each' | 'selection' = 'each',
): Position[] {
  const [ux, uy, uw, uh] = unionBox(positions);
  const cx = ux + uw / 2;
  const cy = uy + uh / 2;
  return positions.map((p) => {
    const next: Position = { ...p };
    const flip: Flip | undefined = toggleFlip(p.flip, axis);
    if (flip === undefined) delete next.flip;
    else next.flip = flip;
    if (about === 'selection' && positions.length > 1) {
      if (axis === 'h') next.x = 2 * cx - p.x - p.w;
      else next.y = 2 * cy - p.y - p.h;
      const rotate = normalizeRotation(360 - (p.rotate ?? 0));
      if (rotate === 0) delete next.rotate;
      else next.rotate = rotate;
    }
    return next;
  });
}

/**
 * The positions of a group's members after the union box is resized to `to` (SPEC-2 0.102):
 * every member's box scales by the union's x and y factors about the union's origin; rotation
 * and flip are untouched.
 */
export function scalePositions(positions: ReadonlyArray<Position>, to: Box): Position[] {
  const [ux, uy, uw, uh] = unionBox(positions);
  const [tx, ty, tw, th] = to;
  const kx = uw > 0 ? tw / uw : 1;
  const ky = uh > 0 ? th / uh : 1;
  return positions.map((p) => ({
    ...p,
    x: tx + (p.x - ux) * kx,
    y: ty + (p.y - uy) * ky,
    w: Math.max(1, p.w * kx),
    h: Math.max(1, p.h * ky),
  }));
}

/** Blocks in paint order: by z ascending, document order breaking ties. */
export function sortByZ<T extends { pos?: Position }>(blocks: ReadonlyArray<T>): T[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => zOf(a.block.pos) - zOf(b.block.pos) || a.index - b.index)
    .map(({ block }) => block);
}

/**
 * The z of every block after one block moves through the stack: the stack is renumbered 0 to
 * n - 1 in paint order so the result is dense and a repeated `forward` keeps climbing. `{ z }` puts
 * the block at that rank, clamped to the stack.
 */
export function reorderZ(
  blocks: ReadonlyArray<{ id: BlockId; pos?: Position }>,
  blockId: BlockId,
  move: OrderMove | { z: number },
): Record<BlockId, number> {
  const stack = sortByZ(blocks).map((block) => block.id);
  const from = stack.indexOf(blockId);
  if (from < 0) throw new RangeError(`No block "${blockId}" in the stack`);
  stack.splice(from, 1);
  let to: number;
  if (typeof move === 'object') to = Math.max(0, Math.min(stack.length, Math.round(move.z)));
  else if (move === 'front') to = stack.length;
  else if (move === 'back') to = 0;
  else if (move === 'forward') to = Math.min(stack.length, from + 1);
  else to = Math.max(0, from - 1);
  stack.splice(to, 0, blockId);
  const out: Record<BlockId, number> = {};
  stack.forEach((id, z) => {
    out[id] = z;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The resize model (gslides-parity SPEC-5-amendments A4; build-4/hotfix-3.md section 2; canvas.ts)

/** The eight resize handles, compass named, in the order the overlay draws them. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export type ResizeModifiers = {
  /** Shift: a corner keeps the aspect ratio, an edge scales the other side from its own */
  shift?: boolean;
  /** Alt (Option on a Mac): the box resizes about its centre */
  alt?: boolean;
  /** the inspector's Lock aspect ratio toggle; the same rule as Shift */
  lock?: boolean;
};

/**
 * The kind of the object a handle resizes, for the aspect rule: a block type, `plate` for the
 * box block of a converted picture kind (its group tag is canvas.ts CANVAS_GROUP), `group` for
 * the union of a multi selection.
 */
export type ResizeKind = BlockType | 'plate' | 'group';

/**
 * The kinds whose corner handles keep the aspect ratio without Shift, as Google's do for an image
 * (R04 B7): the picture, the icon, the material, the mark and the plate. A shape, a text box, a
 * table, a chart, a diagram, a line and a group resize freely; Shift or the inspector's lock
 * keeps their ratio.
 */
export const ASPECT_LOCKED_KINDS: ReadonlySet<ResizeKind> = new Set<ResizeKind>([
  'picture',
  'icon',
  'material',
  'mark',
  'plate',
]);

export function locksAspect(kind: ResizeKind | undefined): boolean {
  return kind !== undefined && ASPECT_LOCKED_KINDS.has(kind);
}

/**
 * The snap of an unrotated object's moving edges: each function takes the sheet coordinate of
 * the edge that moves (the x of a left or right edge, the y of a top or bottom edge) and returns
 * the coordinate it lands on. The caller records the guide lines it drew; a rotated object gets
 * no snap because its edges are not sheet lines.
 */
export type ResizeSnap = {
  x?: (edge: number) => number;
  y?: (edge: number) => number;
};

export type ResizeOptions = {
  /** the smallest width and height, RESIZE_MIN_SIZE unless set */
  min?: number;
  snap?: ResizeSnap;
};

/** The smallest side a handle drag leaves, in sheet pixels (the viewer's FREE_MIN_SIZE). */
export const RESIZE_MIN_SIZE = 16;

export type ResizeBox = { x: number; y: number; w: number; h: number };

/** A vector turned by `degrees` clockwise (the CSS rotate direction on a sheet whose y grows down). */
export function rotateVector(dx: number, dy: number, degrees: number): { dx: number; dy: number } {
  const angle = normalizeRotation(degrees);
  if (angle === 0) return { dx, dy };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

/** A value at the canvas precision, 1/64 px (the measurer's LayoutUnit), so a rotated result carries no float noise. */
export function round64(value: number): number {
  return Math.round(value * 64) / 64;
}

/**
 * One resize of a box by one of its eight handles (SPEC-2 6.1 row 9; SPEC-5-amendments A4): the
 * pure function the gesture, the inspector and the keyboard nudge share, so every surface lands
 * the same `pos`.
 *
 * `delta` is the pointer's travel in sheet pixels (the client delta divided by the sheet scale
 * once, so the zoom does not matter); for a rotated object it is turned back into the object's
 * own axes, so the handle moves along the rotated edge. The dragged edge or corner moves by the
 * delta and the opposite edge or corner stays where it is on the sheet: for a rotated object the
 * anchored point is kept in sheet space and `x, y` are rebuilt from it and the new size, because
 * the renderer rotates the box about its own centre and a plain change of `w` or `h` would move
 * that centre and drag the anchored edge with it (hotfix-3 cause R3). Alt resizes about the
 * centre instead: both opposite edges move. A corner keeps the aspect ratio for the kinds of
 * ASPECT_LOCKED_KINDS, and every handle does under Shift or the inspector's lock; the axis with the larger
 * relative change leads and the other follows; an edge handle under the aspect rule scales the
 * other side from its own, growing from the left or the top. Neither side drops under `min`.
 * The unrotated case snaps its moving edges through `snap` (the caller's lines and grid) and
 * lands on whole pixels; a rotated result is rounded to 1/64 px.
 */
export function resizeBox(
  handle: ResizeHandle,
  delta: { dx: number; dy: number },
  modifiers: ResizeModifiers,
  rotation: number,
  kind: ResizeKind | undefined,
  box: ResizeBox,
  options: ResizeOptions = {},
): ResizeBox {
  const min = options.min ?? RESIZE_MIN_SIZE;
  const angle = normalizeRotation(rotation);
  const { dx, dy } = angle === 0 ? delta : rotateVector(delta.dx, delta.dy, -angle);
  const hasW = handle.includes('w');
  const hasE = handle.includes('e');
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');
  const { x, y, w, h } = box;
  /* the edges in the object's own frame, as the coordinates of the unrotated box */
  let left = x;
  let right = x + w;
  let top = y;
  let bottom = y + h;
  /* an edge snaps only when the pointer moved along its axis: a corner dragged sideways keeps
     its top and bottom where they are instead of taking a nearby line (a phantom resize) */
  const movesX = (hasE || hasW) && dx !== 0;
  const movesY = (hasN || hasS) && dy !== 0;
  if (hasW) left += dx;
  if (hasE) right += dx;
  if (hasN) top += dy;
  if (hasS) bottom += dy;
  /* the kinds that lock keep their ratio from a corner alone; a side handle of a picture changes
     one dimension, as Google's does; Shift and the inspector's lock rule every handle */
  const corner = (hasE || hasW) && (hasN || hasS);
  const aspect =
    modifiers.shift === true || modifiers.lock === true || (corner && locksAspect(kind));
  const ratio = h > 0 ? w / h : 1;
  /* which axis leads under the aspect rule: the larger relative change on a corner, the moving
     axis on an edge */
  const leadX = !aspect
    ? movesX
    : movesX && movesY
      ? Math.abs(dx) / Math.max(1, w) >= Math.abs(dy) / Math.max(1, h)
      : movesX || ((hasE || hasW) && !movesY);
  const leadY = !aspect ? movesY : !leadX;
  const snap = angle === 0 ? options.snap : undefined;
  if (leadX) {
    if (snap?.x !== undefined) {
      if (hasW) left = snap.x(left);
      else if (hasE) right = snap.x(right);
    }
    if (right - left < min) {
      if (hasW) left = right - min;
      else right = left + min;
    }
  }
  if (leadY) {
    if (snap?.y !== undefined) {
      if (hasN) top = snap.y(top);
      else if (hasS) bottom = snap.y(bottom);
    }
    if (bottom - top < min) {
      if (hasN) top = bottom - min;
      else bottom = top + min;
    }
  }
  if (aspect) {
    if (leadX) {
      const nextH = Math.max(min, (right - left) / ratio);
      if (hasN) top = bottom - nextH;
      else bottom = top + nextH;
    } else {
      const nextW = Math.max(min, (bottom - top) * ratio);
      if (hasW) left = right - nextW;
      else right = left + nextW;
    }
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (modifiers.alt === true) {
    /* about the centre: the opposite edges mirror the moved ones and the centre stays */
    const w2 = Math.max(min, Math.round(w + 2 * (right - left - w)));
    const h2 = Math.max(min, Math.round(h + 2 * (bottom - top - h)));
    return { x: round64(cx - w2 / 2), y: round64(cy - h2 / 2), w: w2, h: h2 };
  }
  const w2 = Math.max(min, Math.round(right - left));
  const h2 = Math.max(min, Math.round(bottom - top));
  /* the anchored point in the object's frame, relative to the centre: the edge opposite the one
     that moves, and the left or top edge of an axis no handle moves (the side the aspect rule
     grows away from); the same point in the new box gives the new centre */
  const ax = hasW ? w / 2 : -w / 2;
  const ay = hasN ? h / 2 : -h / 2;
  const ax2 = hasW ? w2 / 2 : -w2 / 2;
  const ay2 = hasN ? h2 / 2 : -h2 / 2;
  const before = rotateVector(ax, ay, angle);
  const after = rotateVector(ax2, ay2, angle);
  const cx2 = cx + before.dx - after.dx;
  const cy2 = cy + before.dy - after.dy;
  return { x: round64(cx2 - w2 / 2), y: round64(cy2 - h2 / 2), w: w2, h: h2 };
}

/**
 * The four corners of a box rotated about its centre in sheet pixels, top left first and
 * clockwise: what a test or a probe reads to check that a handle's opposite corner stayed put.
 */
export function rotatedBoxCorners(box: ResizeBox, rotation: number): { x: number; y: number }[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return [
    [-box.w / 2, -box.h / 2],
    [box.w / 2, -box.h / 2],
    [box.w / 2, box.h / 2],
    [-box.w / 2, box.h / 2],
  ].map(([lx, ly]) => {
    const turned = rotateVector(lx ?? 0, ly ?? 0, rotation);
    return { x: cx + turned.dx, y: cy + turned.dy };
  });
}

// ---------------------------------------------------------------------------------------------
// The freeform snap engine (Kevin's direction of 2026-09-11, recorded over SPEC 6.4's
// no-coordinates rule; docs/freeform.md; the viewer's snap.ts until this module): a positioned
// block drags anywhere on the 1600 by 900 sheet and lands on the 8 px grid, the rails at 56 px,
// the content box edges and centers, the column seams of the named ratios, the plate edges (the
// GUIDES above, one implementation the CLI's block.align and the inspector's position control
// share), and the edges and centers of the other blocks, which only the stage knows. A line snap
// wins within SNAP_DISTANCE and is what the overlay draws as a guide; the grid takes the rest and
// draws nothing. The viewer's snap-freeform.test.ts pins it.

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

/** The kind of a guide from its name (verticalGuides, horizontalGuides). */
function kindOfGuide(name: string): SnapKind {
  if (name.includes('rail') || name.includes('rule')) return 'rail';
  if (name.includes('plate')) return 'plate';
  if (name.includes('column')) return 'seam';
  return 'content';
}

/**
 * The sheet's own snap lines, from GUIDES: the four rails at 56 px span the whole sheet; the
 * content box's edges and centers, the column seams of the three named ratios (both sides of the
 * gap) and the plate edges span the content box.
 */
export function sheetSnapLines(): SnapLine[] {
  const [cx, cy, cw, ch] = CONTENT_BOX;
  const lines: SnapLine[] = [];
  for (const guide of GUIDES.x) {
    const kind = kindOfGuide(guide.name);
    const full = kind === 'rail';
    lines.push({
      axis: 'x',
      at: guide.at,
      kind,
      from: full ? 0 : cy,
      to: full ? SHEET_HEIGHT : cy + ch,
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
      to: full ? SHEET_WIDTH : cx + cw,
    });
  }
  return lines;
}

/** The sheet's own edges and centre (SPEC-2 6.1 row 7: "the sheet's edges and centre"). */
export function sheetEdgeLines(): SnapLine[] {
  const width = SHEET_WIDTH;
  const height = SHEET_HEIGHT;
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
      to: SHEET_HEIGHT,
    })),
    ...guides.y.map((at): SnapLine => ({ axis: 'y', at, kind: 'guide', from: 0, to: SHEET_WIDTH })),
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
    if (Math.abs(delta) > SNAP_DISTANCE) return;
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

type AxisSnap = { delta: number; line: SnapLine | null };

/** True for the sheet's own centre line on its axis (sheetEdgeLines: x 800, y 450). */
export function isSheetCentreLine(line: SnapLine): boolean {
  return line.kind === 'sheet' && line.at === (line.axis === 'x' ? SHEET_WIDTH : SHEET_HEIGHT) / 2;
}

/**
 * The best line snap for a set of moving positions on one axis: the smallest correction within
 * SNAP_DISTANCE, ties to the earlier line. The sheet's centre line outranks every other line in
 * range (docs/FOCUS.md rank 33; audit-images row 16: a picture aimed 3 px off the slide's centre
 * landed on the mood plate edge its right edge happened to touch), because centring on the slide
 * is what the seller aims for and a plate edge or a column seam that is a pixel nearer is not.
 * With no line in range the first position (the leading edge) lands on the grid.
 */
function snapAxis(positions: number[], lines: SnapLine[], axis: SnapAxis, grid: boolean): AxisSnap {
  let best: AxisSnap | null = null;
  let centre: AxisSnap | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    for (const at of positions) {
      const delta = line.at - at;
      if (Math.abs(delta) > SNAP_DISTANCE) continue;
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line };
      if (isSheetCentreLine(line) && (centre === null || Math.abs(delta) < Math.abs(centre.delta)))
        centre = { delta, line };
    }
  }
  if (centre) return centre;
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

/**
 * A box resized from one of eight handles by (dx, dy) in sheet pixels: `resizeBox` above with
 * the line and grid snap on the moving edges of an unrotated object. Only the moving edges snap,
 * the opposite edges hold, no side drops under `min`. With `aspect` (Shift) the corner handles
 * keep the box's ratio from the dominant delta and an edge handle scales the other side from its
 * own; `kind` locks a picture's, an icon's, a material's, a mark's or a plate's corners without
 * Shift; `alt` resizes about the centre; a `rotation` turns the delta into the object's axes and
 * keeps the anchored edge on the sheet, and such an object is never snapped (its edges are not
 * sheet lines). The dependent side of the aspect rule skips the line snap so the ratio holds
 * exactly.
 */
export function snapResize(
  box: readonly [number, number, number, number],
  dir: ResizeHandle,
  dx: number,
  dy: number,
  lines: SnapLine[],
  options: {
    aspect?: boolean;
    min?: number;
    grid?: boolean;
    alt?: boolean;
    rotation?: number;
    kind?: ResizeKind;
  } = {},
): SnapResult {
  const grid = options.grid ?? true;
  const [x, y, w, h] = box;
  const guides: SnapLine[] = [];
  const snapEdge = (axis: SnapAxis) => (edge: number) => {
    const s = snapAxis([edge], lines, axis, grid);
    if (s.line) guides.push(s.line);
    return edge + s.delta;
  };
  const out = resizeBox(
    dir,
    { dx, dy },
    { shift: options.aspect === true, alt: options.alt === true },
    options.rotation ?? 0,
    options.kind,
    { x, y, w, h },
    {
      ...(options.min !== undefined ? { min: options.min } : { min: RESIZE_MIN_SIZE }),
      snap: { x: snapEdge('x'), y: snapEdge('y') },
    },
  );
  const snapped: [number, number, number, number] = [out.x, out.y, out.w, out.h];
  return { box: snapped, guides: guides.map((line) => guideFor(line, snapped)) };
}

/** Guides on the same axis at the same position become one, spanning both extents (Guides.tsx). */
export function mergeGuides(guides: readonly SnapLine[]): SnapLine[] {
  const out: SnapLine[] = [];
  for (const guide of guides) {
    const same = out.find((g) => g.axis === guide.axis && Math.abs(g.at - guide.at) < 0.5);
    if (same) {
      same.from = Math.min(same.from, guide.from);
      same.to = Math.max(same.to, guide.to);
      continue;
    }
    out.push({ ...guide });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The rotation handle (gslides-parity SPEC-2 6.1 rows 11 and 12; the viewer's rotate.ts)

type Point = { x: number; y: number };

/** Shift snaps the rotation to multiples of this many degrees (R05 C5). */
export const ROTATE_SNAP_DEG = 15;

/**
 * The angle of a point about a centre in degrees clockwise from the top (the handle's rest
 * position), in [0, 360).
 */
export function angleAbout(centre: Point, point: Point): number {
  const degrees = (Math.atan2(point.x - centre.x, -(point.y - centre.y)) * 180) / Math.PI;
  return normalizeRotation(degrees);
}

/** An angle snapped to the nearest multiple of `step`, normalized. */
export function snapAngle(degrees: number, step: number = ROTATE_SNAP_DEG): number {
  return normalizeRotation(Math.round(degrees / step) * step);
}

/**
 * The rotation a handle drag stands for: the object's angle when the drag began plus the angle
 * the pointer swept about the box centre; Shift snaps the result to 15 degree steps. Rounded to
 * whole degrees without Shift, so the write is a readable number.
 */
export function rotationFromDrag(
  startAngle: number,
  centre: Point,
  from: Point,
  to: Point,
  options: { shift?: boolean } = {},
): number {
  const swept = angleAbout(centre, to) - angleAbout(centre, from);
  const raw = startAngle + swept;
  if (options.shift === true) return snapAngle(raw);
  return normalizeRotation(Math.round(raw));
}

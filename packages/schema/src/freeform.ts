// The freeform layout's arithmetic (Kevin, 2026-09-11; docs/freeform.md): the guide lines a box
// snaps to (the 8 px grid, the rails and rules, the content box, the column seams of the three
// cols ratios, the plate edges), the snap itself, the align and distribute moves of block.align
// and block.distribute, the z order of block.order, the sheet tests the freeform lints read, the
// rotate and flip moves of block.rotate and block.flip (gslides-parity SPEC-2 2.1, over the
// rotated bounding box of 0.107), and the conversion slide.setLayout runs between a grammar
// layout and freeform (the measured conversion of a canvas is canvas.ts). Pure functions over
// the document types, so the editor's drag, the CLI and the linter share one implementation. The
// slot geometry repeats @turboslide/render/geometry by value: the renderer depends on this
// package, not the other way round (SPEC 3.3 item 3), and render/__tests__ asserts the two agree.
import type { Block } from './blocks.ts';
import type { ColsRatio, ContentSlide, Layout, SlotName } from './deck.ts';
import { slotsForLayout } from './deck.ts';
import type { BlockId } from './ids.ts';
import type { Flip, Position } from './position.ts';
import {
  groupDepth,
  membersAtLevel,
  normalizeRotation,
  sharesGroupLevel,
  toggleFlip,
  zOf,
} from './position.ts';
import type { Box, Page } from './render.ts';
import { CONTENT_BOX, DEFAULT_PAGE, RAIL_PX, contentBox } from './render.ts';

/** Boxes snap to this grid when no guide is closer (docs/freeform.md). */
export const FREEFORM_GRID = 8;
/** A guide within this many px wins over the grid. */
export const SNAP_DISTANCE = 6;
/** The column gap of `.cols` (head:83; deck.ts COLS_GAPS). */
export const COLS_GAP = 72;
/** The plate widths of the three full-picture kinds (SPEC 2.1). */
export const PLATE_WIDTHS = { opener: 740, mood: 560, closing: 720 } as const;

/** The default page's content width, what `columnWidths` reads when no content width is given. */
const CONTENT_W = CONTENT_BOX[2];

/** A page size in sheet pixels; every sheet arithmetic below takes one and reads the GT sheet when it is absent (gslides-parity SPEC-5 6.1). */
export type PageSize = Pick<Page, 'width' | 'height'>;

export type Guide = { at: number; name: string };

/**
 * Pixel widths of the two columns of a cols layout on a content width (render/geometry.ts): the
 * default page's 1326 px unless a page's content width is given.
 */
export function columnWidths(
  ratio: ColsRatio,
  gap: number = COLS_GAP,
  contentWidth: number = CONTENT_W,
): [number, number] {
  const total = contentWidth - gap;
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

/** The vertical guide lines (x values) of a page: rails, content edges and center, column seams, plate edges. */
export function verticalGuides(page: PageSize = DEFAULT_PAGE): Guide[] {
  const [cx, , cw] = contentBox(page);
  const out: Guide[] = [
    { at: RAIL_PX, name: 'left rail' },
    { at: page.width - RAIL_PX, name: 'right rail' },
    { at: cx, name: 'content left' },
    { at: cx + cw, name: 'content right' },
    { at: cx + cw / 2, name: 'content center' },
  ];
  for (const ratio of ['5/7', '4/8', '1/1'] as const) {
    const [left] = columnWidths(ratio, COLS_GAP, cw);
    out.push({ at: cx + left, name: `${ratio} left column edge` });
    out.push({ at: cx + left + COLS_GAP, name: `${ratio} right column edge` });
  }
  out.push({ at: cx + PLATE_WIDTHS.opener, name: 'opener plate edge' });
  out.push({ at: cx + PLATE_WIDTHS.closing, name: 'closing plate edge' });
  out.push({ at: cx + cw - PLATE_WIDTHS.mood, name: 'mood plate edge' });
  return out.sort((a, b) => a.at - b.at);
}

/** The horizontal guide lines (y values) of a page: rules, content edges and center. */
export function horizontalGuides(page: PageSize = DEFAULT_PAGE): Guide[] {
  const [, cy, , ch] = contentBox(page);
  return [
    { at: RAIL_PX, name: 'top rule' },
    { at: page.height - RAIL_PX, name: 'bottom rule' },
    { at: cy, name: 'content top' },
    { at: cy + ch, name: 'content bottom' },
    { at: cy + ch / 2, name: 'content middle' },
  ].sort((a, b) => a.at - b.at);
}

/** The default page's guide lines; `guidesFor(page)` derives another page's. */
export const GUIDES = { x: verticalGuides(), y: horizontalGuides() } as const;

/** The snap guide lines of a page (gslides-parity SPEC-5 6.1): the default page answers `GUIDES`. */
export function guidesFor(page: PageSize = DEFAULT_PAGE): { x: Guide[]; y: Guide[] } {
  if (page.width === DEFAULT_PAGE.width && page.height === DEFAULT_PAGE.height)
    return { x: [...GUIDES.x], y: [...GUIDES.y] };
  return { x: verticalGuides(page), y: horizontalGuides(page) };
}

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

/** True when the box lies inside the page's content box, where the renderer places it under `.in`. */
export function insideContent(pos: Position, page: PageSize = DEFAULT_PAGE): boolean {
  const [cx, cy, cw, ch] = contentBox(page);
  return pos.x >= cx && pos.y >= cy && pos.x + pos.w <= cx + cw && pos.y + pos.h <= cy + ch;
}

/**
 * Where a rotated object's bounding box lies against the page (SPEC-2 0.96; the GT sheet when no
 * page is given): `inside`, `crossing` an edge (part of it shows), or wholly `outside` (nothing of
 * it shows). `freeform/off-sheet` reads it: severity 3 for `outside`, 2 for `crossing`.
 */
export function offSheetKind(
  pos: Position,
  page: PageSize = DEFAULT_PAGE,
): 'inside' | 'crossing' | 'outside' {
  const b = boundingBox(pos);
  if (b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= page.width || b.y >= page.height) return 'outside';
  if (b.x < 0 || b.y < 0 || b.x + b.w > page.width || b.y + b.h > page.height) return 'crossing';
  return 'inside';
}

/** True when any part of the rotated bounding box leaves the page (freeform/off-sheet). */
export function offSheet(pos: Position, page: PageSize = DEFAULT_PAGE): boolean {
  return offSheetKind(pos, page) !== 'inside';
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
// Align, distribute, order

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
  page: PageSize = DEFAULT_PAGE,
): Box {
  const resolved = resolveAlignTarget(positions, target);
  if (resolved === 'sheet') return [0, 0, page.width, page.height];
  if (resolved === 'content') return contentBox(page);
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
  page: PageSize = DEFAULT_PAGE,
): Position[] {
  const resolved = resolveAlignTarget(positions, target);
  const [rx, ry, rw, rh] = alignReference(positions, resolved, page);
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
    const guides = guidesFor(page);
    const snapped = snapCoordinate(line, horizontal ? guides.x : guides.y).value;
    const extent = horizontal ? page.width : page.height;
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
// Layout conversion (slide.setLayout)

/** Boxes of every slot of a layout in sheet pixels on a page; heights are the content height (render/geometry.ts). */
export function layoutSlotBoxes(
  layout: Layout,
  page: PageSize = DEFAULT_PAGE,
): Partial<Record<SlotName, Box>> {
  const [x, y, w, h] = contentBox(page);
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [left, right] = columnWidths(layout.ratio, gap, w);
      return { left: [x, y, left, h], right: [x + left + gap, y, right, h] };
    }
    case 'split': {
      const head = layout.head;
      if (head !== undefined && head !== 'single') {
        const [left, right] = columnWidths(head.cols, COLS_GAP, w);
        return {
          headLeft: [x, y, left, h],
          headRight: [x + left + COLS_GAP, y, right, h],
          body: [x, y, w, h],
        };
      }
      return { head: [x, y, w, h], body: [x, y, w, h] };
    }
    default:
      return { main: [x, y, w, h] };
  }
}

function stripPosition(block: Block): Block {
  if (block.pos === undefined) return block;
  const { pos: _pos, ...rest } = block;
  return rest;
}

/** The blocks of a content slide in reading order: slot order for a grammar layout, y then x for freeform. */
export function readingOrder(slide: ContentSlide): { slot: SlotName; block: Block }[] {
  const rows = slotsForLayout(slide.layout).flatMap((slot) =>
    (slide.slots[slot] ?? []).map((block) => ({ slot, block })),
  );
  if (slide.layout.type !== 'freeform') return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const pa = a.row.block.pos;
      const pb = b.row.block.pos;
      const ya = pa?.y ?? 0;
      const yb = pb?.y ?? 0;
      if (Math.abs(ya - yb) > FREEFORM_GRID) return ya - yb;
      return (pa?.x ?? 0) - (pb?.x ?? 0) || a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * The slide under another layout (slide.setLayout). To freeform: every block keeps its slot's
 * column and the blocks of one slot share its height in document order, on the grid, so the
 * slide reads as it did and the designer drags from there. From freeform to a grammar layout:
 * positions are dropped and the blocks fall into the target slots by geometry (the two columns
 * of cols by the block's center, the head of a split takes the headings, the rest is the body,
 * one slot takes everything). Between grammar layouts the slots map by index (left to head, right
 * to body) and a slot the target lacks folds into the last one.
 */
export function convertLayout(
  slide: ContentSlide,
  layout: Layout,
  page: PageSize = DEFAULT_PAGE,
): ContentSlide {
  const rows = readingOrder(slide);
  const next: ContentSlide = { ...slide, layout, slots: {} };
  if (layout.type === 'freeform') {
    const boxes = layoutSlotBoxes(slide.layout, page);
    const perSlot = new Map<SlotName, { slot: SlotName; block: Block }[]>();
    for (const row of rows) {
      const list = perSlot.get(row.slot) ?? [];
      list.push(row);
      perSlot.set(row.slot, list);
    }
    const main: Block[] = [];
    let z = 0;
    for (const [slot, list] of perSlot) {
      const box = boxes[slot] ?? contentBox(page);
      const [bx, by, bw, bh] = box;
      const rowHeight = bh / Math.max(1, list.length);
      list.forEach(({ block }, i) => {
        if (slide.layout.type === 'freeform' && block.pos !== undefined) {
          main.push(block);
          return;
        }
        const pos: Position = snapPosition({
          x: bx,
          y: by + i * rowHeight,
          w: bw,
          h: rowHeight,
        });
        main.push({ ...block, pos: { ...pos, z } });
        z += 1;
      });
    }
    next.slots = { main };
    return next;
  }
  const targets = slotsForLayout(layout);
  const slots: Partial<Record<SlotName, Block[]>> = {};
  const put = (slot: SlotName, block: Block): void => {
    (slots[slot] ??= []).push(stripPosition(block));
  };
  const sourceSlots = slotsForLayout(slide.layout);
  for (const { slot, block } of rows) {
    if (targets.includes(slot)) {
      put(slot, block);
      continue;
    }
    if (slide.layout.type === 'freeform') {
      put(slotByGeometry(block, targets, page), block);
      continue;
    }
    const index = Math.min(sourceSlots.indexOf(slot), targets.length - 1);
    put(targets[Math.max(0, index)] ?? targets[0] ?? 'main', block);
  }
  next.slots = slots;
  return next;
}

/** The grammar slot a positioned block falls into, by its box against the target layout's slots on the page. */
function slotByGeometry(
  block: Block,
  targets: ReadonlyArray<SlotName>,
  page: PageSize = DEFAULT_PAGE,
): SlotName {
  const pos = block.pos;
  const first = targets[0] ?? 'main';
  if (pos === undefined) return first;
  const [cx, cy, cw, ch] = contentBox(page);
  if (targets.includes('left') && targets.includes('right')) {
    return pos.x + pos.w / 2 < cx + cw / 2 ? 'left' : 'right';
  }
  if (targets.includes('body')) {
    const isHeading = block.type === 'heading';
    if (targets.includes('headLeft') && targets.includes('headRight')) {
      if (isHeading) return 'headLeft';
      if (block.type === 'paragraph' && pos.y < cy + ch / 3) return 'headRight';
      return 'body';
    }
    return isHeading ? 'head' : 'body';
  }
  return first;
}

// ---------------------------------------------------------------------------------------------
// Nested groups on the canvas (gslides-parity SPEC-5 0.48; MILESTONES-5 B3 day 6)

/** The level a click selects: the group path and how many of its segments the selection spans. */
export type SelectionLevel = { path: string; depth: number };

/**
 * The selection level after a click on a member of a group (SPEC-5 0.48; Google's rule): the
 * first click on a member selects the outermost group (level 1, every block whose path starts
 * with the same segment); a click on a member already inside the selected group goes one level
 * in, until the member's own path is exhausted and the block alone is selected (`null`). A click
 * on a member of another group starts again at level 1; a block without a group is selected
 * alone. `current` is the level the selection stands at, null when nothing grouped is selected.
 */
export function selectionLevelOnClick(
  clickedGroup: string | undefined,
  current: SelectionLevel | null,
): SelectionLevel | null {
  if (clickedGroup === undefined) return null;
  const depth = groupDepth(clickedGroup);
  if (current === null || !sharesGroupLevel(current.path, clickedGroup, current.depth))
    return { path: clickedGroup, depth: 1 };
  if (current.depth >= depth) return null;
  return { path: clickedGroup, depth: current.depth + 1 };
}

/**
 * The block ids a selection level covers on a slide: the members at that level of the path
 * (`membersAtLevel`), in slide order; every block for a level nothing reaches is none.
 */
export function selectionAtLevel(blocks: ReadonlyArray<Block>, level: SelectionLevel): BlockId[] {
  return membersAtLevel(blocks, level.path, level.depth).map((block) => block.id);
}

/**
 * The union box of the members at a level (the handles a nested group selection draws; SPEC-5
 * 0.48), or null when none is positioned. Rotation is ignored: the box is the members' boxes'
 * bounds, the way `groupBox` reads a flat group.
 */
export function groupBoxAtLevel(blocks: ReadonlyArray<Block>, level: SelectionLevel): Box | null {
  const members = membersAtLevel(blocks, level.path, level.depth);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const block of members) {
    const pos = block.pos;
    if (pos === undefined) continue;
    x0 = Math.min(x0, pos.x);
    y0 = Math.min(y0, pos.y);
    x1 = Math.max(x1, pos.x + pos.w);
    y1 = Math.max(y1, pos.y + pos.h);
  }
  if (!Number.isFinite(x0)) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}

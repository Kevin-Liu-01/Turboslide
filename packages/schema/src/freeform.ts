// The freeform layout's arithmetic (Kevin, 2026-09-11; docs/freeform.md): the guide lines a box
// snaps to (the 8 px grid, the rails and rules, the content box, the column seams of the three
// cols ratios, the plate edges), the snap itself, the align and distribute moves of block.align
// and block.distribute, the z order of block.order, the sheet tests the freeform lints read, and
// the conversion slide.setLayout runs between a grammar layout and freeform. Pure functions over
// the document types, so the editor's drag, the CLI and the linter share one implementation. The
// slot geometry repeats @turboslide/render/geometry by value: the renderer depends on this
// package, not the other way round (SPEC 3.3 item 3), and render/__tests__ asserts the two agree.
import type { Block } from './blocks.ts';
import type { ColsRatio, ContentSlide, Layout, SlotName } from './deck.ts';
import { slotsForLayout } from './deck.ts';
import type { BlockId } from './ids.ts';
import type { Position } from './position.ts';
import { zOf } from './position.ts';
import type { Box } from './render.ts';
import { CONTENT_BOX, RAIL_PX, SHEET_HEIGHT, SHEET_WIDTH } from './render.ts';

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

/** True when the box lies inside the content box, where the renderer places it under `.in`. */
export function insideContent(pos: Position): boolean {
  return (
    pos.x >= CONTENT_X &&
    pos.y >= CONTENT_Y &&
    pos.x + pos.w <= CONTENT_X + CONTENT_W &&
    pos.y + pos.h <= CONTENT_Y + CONTENT_H
  );
}

/** True when any part of the box leaves the 1600 by 900 sheet (freeform/off-sheet). */
export function offSheet(pos: Position): boolean {
  return pos.x < 0 || pos.y < 0 || pos.x + pos.w > SHEET_WIDTH || pos.y + pos.h > SHEET_HEIGHT;
}

/** The area two boxes share; 0 when they only touch. */
export function overlapArea(a: Position, b: Position): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
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

/** The reference box an alignment works against; one block aligns to the content box by default. */
export function alignReference(
  positions: ReadonlyArray<Position>,
  target: AlignTarget | undefined,
): Box {
  const resolved = target ?? (positions.length > 1 ? 'selection' : 'content');
  if (resolved === 'sheet') return [0, 0, SHEET_WIDTH, SHEET_HEIGHT];
  if (resolved === 'content') return CONTENT_BOX;
  return unionOf(positions);
}

/**
 * The positions moved so the named edge sits on the reference's edge; sizes are unchanged. With
 * `snap` the reference edge itself snaps to the guides and the grid once, so the aligned blocks
 * still share one edge after the snap.
 */
export function alignPositions(
  positions: ReadonlyArray<Position>,
  edge: AlignEdge,
  target?: AlignTarget,
  snap = false,
): Position[] {
  const [rx, ry, rw, rh] = alignReference(positions, target);
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
  if (snap) line = snapCoordinate(line, horizontal ? GUIDES.x : GUIDES.y).value;
  return positions.map((p) => {
    switch (edge) {
      case 'left':
        return { ...p, x: line };
      case 'center':
        return { ...p, x: line - p.w / 2 };
      case 'right':
        return { ...p, x: line - p.w };
      case 'top':
        return { ...p, y: line };
      case 'middle':
        return { ...p, y: line - p.h / 2 };
      case 'bottom':
        return { ...p, y: line - p.h };
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
  const order = positions
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p[lead] - b.p[lead] || a.index - b.index);
  const first = order[0]?.p;
  const last = order[order.length - 1]?.p;
  if (first === undefined || last === undefined) return positions.map((p) => ({ ...p }));
  const total = order.reduce((sum, { p }) => sum + p[size], 0);
  const span = last[lead] + last[size] - first[lead];
  const step = gap ?? (order.length > 1 ? (span - total) / (order.length - 1) : 0);
  const out: Position[] = positions.map((p) => ({ ...p }));
  let cursor = first[lead];
  for (const { p, index } of order) {
    out[index] = { ...p, [lead]: cursor };
    cursor += p[size] + step;
  }
  return out;
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

/** Boxes of every slot of a layout in sheet pixels; heights are the content height (render/geometry.ts). */
export function layoutSlotBoxes(layout: Layout): Partial<Record<SlotName, Box>> {
  const [x, y, w, h] = CONTENT_BOX;
  switch (layout.type) {
    case 'cols': {
      const gap = layout.gap ?? COLS_GAP;
      const [left, right] = columnWidths(layout.ratio, gap);
      return { left: [x, y, left, h], right: [x + left + gap, y, right, h] };
    }
    case 'split': {
      const head = layout.head;
      if (head !== undefined && head !== 'single') {
        const [left, right] = columnWidths(head.cols);
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
export function convertLayout(slide: ContentSlide, layout: Layout): ContentSlide {
  const rows = readingOrder(slide);
  const next: ContentSlide = { ...slide, layout, slots: {} };
  if (layout.type === 'freeform') {
    const boxes = layoutSlotBoxes(slide.layout);
    const perSlot = new Map<SlotName, { slot: SlotName; block: Block }[]>();
    for (const row of rows) {
      const list = perSlot.get(row.slot) ?? [];
      list.push(row);
      perSlot.set(row.slot, list);
    }
    const main: Block[] = [];
    let z = 0;
    for (const [slot, list] of perSlot) {
      const box = boxes[slot] ?? CONTENT_BOX;
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
      put(slotByGeometry(block, targets), block);
      continue;
    }
    const index = Math.min(sourceSlots.indexOf(slot), targets.length - 1);
    put(targets[Math.max(0, index)] ?? targets[0] ?? 'main', block);
  }
  next.slots = slots;
  return next;
}

/** The grammar slot a positioned block falls into, by its box against the target layout's slots. */
function slotByGeometry(block: Block, targets: ReadonlyArray<SlotName>): SlotName {
  const pos = block.pos;
  const first = targets[0] ?? 'main';
  if (pos === undefined) return first;
  if (targets.includes('left') && targets.includes('right')) {
    return pos.x + pos.w / 2 < CONTENT_X + CONTENT_W / 2 ? 'left' : 'right';
  }
  if (targets.includes('body')) {
    const isHeading = block.type === 'heading';
    if (targets.includes('headLeft') && targets.includes('headRight')) {
      if (isHeading) return 'headLeft';
      if (block.type === 'paragraph' && pos.y < CONTENT_Y + CONTENT_H / 3) return 'headRight';
      return 'body';
    }
    return isHeading ? 'head' : 'body';
  }
  return first;
}

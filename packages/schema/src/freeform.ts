// The freeform layout's arithmetic (Kevin, 2026-09-11; docs/freeform.md): the guide lines a box
// snaps to (the 8 px grid, the rails and rules, the content box, the column seams of the three
// cols ratios, the plate edges), the snap itself, the align and distribute moves of block.align
// and block.distribute, the z order of block.order, the sheet tests the freeform lints read, the
// rotate and flip moves of block.rotate and block.flip (gslides-parity SPEC-2 2.1, over the
// rotated bounding box of 0.107), and the conversion slide.setLayout runs between a grammar
// layout and freeform (the measured conversion of a canvas is canvas.ts). Everything but the
// conversion lives in ./geometry.ts, without zod, and is re-exported here, as ids.ts re-exports
// slug.ts; the conversion reads the deck's slots and stays. Pure functions over the document
// types, so the editor's drag, the CLI and the linter share one implementation. The slot geometry
// repeats @turboslide/render/geometry by value: the renderer depends on this package, not the
// other way round (SPEC 3.3 item 3), and render/__tests__ asserts the two agree.
import type { Block } from './blocks.ts';
import type { ContentSlide, Layout, SlotName } from './deck.ts';
import { slotsForLayout } from './deck.ts';
import type { Box } from './geometry.ts';
import { CONTENT_BOX, COLS_GAP, columnWidths, FREEFORM_GRID, snapPosition } from './geometry.ts';
import type { Position } from './position.ts';

export type { AlignEdge, AlignTarget, DistributeAxis, Guide, OrderMove } from './geometry.ts';
export {
  ALIGN_EDGES,
  ALIGN_TARGETS,
  COLS_GAP,
  DISTRIBUTE_AXES,
  FREEFORM_GRID,
  GUIDES,
  ORDER_MOVES,
  PLATE_WIDTHS,
  SNAP_DISTANCE,
  alignPositions,
  alignReference,
  boundingBox,
  boxesOverlap,
  columnWidths,
  distributePositions,
  flipPositions,
  horizontalGuides,
  insideContent,
  offSheet,
  offSheetKind,
  overlapArea,
  positionBox,
  reorderZ,
  resolveAlignTarget,
  rotatePositions,
  scalePositions,
  snapCoordinate,
  snapOrigin,
  snapPosition,
  snapToGrid,
  sortByZ,
  unionBox,
  verticalGuides,
} from './geometry.ts';

const [CONTENT_X, CONTENT_Y, CONTENT_W, CONTENT_H] = CONTENT_BOX;

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

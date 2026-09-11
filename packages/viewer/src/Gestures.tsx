// The gesture engine of the stage in edit mode (SPEC 6.4): the handles the overlay draws for a
// slide and its selected block, the pointer math from client pixels to sheet pixels, the mapping
// from a drag (start point, current point) to exactly one mutation, the keyboard nudges, and the
// mapping from a mutation to the action-table call the editor dispatches (SPEC 7.1: a click and an
// agent call are one action). Everything here is pure and runs in Node; gestures.test.ts pins the
// mapping (a drag of the key edge from 200 to 232 yields block.set /key 240). The Editor owns the
// pointer listeners and the live preview, the chrome's Overlay owns the pixels.
import type { ActionId } from '@turboslide/schema/actions';
import type { Block, BlockType } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type { Box } from '@turboslide/schema/render';
import { COLUMN_GAP, CONTENT, CONTENT_ORIGIN, SHEET } from '@turboslide/theme/tokens';

import { labelClearance, snapHalf, unitsPerPixel } from '@turboslide/render/dia/snap';
import type { DiaBox } from '@turboslide/render/dia/snap';

import type { Selection } from './Selection';
import { blockById, selectedBlockId } from './Selection';
import {
  CROP_FLIP_PX,
  plateSideFor,
  PLATE_SIDES_BY_KIND,
  ratioLeftWidth,
  snapKey,
  snapPlateWidth,
  snapRatio,
  snapScaleValue,
  snapShotWidth,
  stepInSet,
  stepRatio,
} from './snap';
import { ROWS_KEY_SNAP } from '@turboslide/schema/blocks';
import { PLATE_WIDTHS } from '@turboslide/schema/deck';

/** The sheet box type the overlay reads, so the chrome package needs no dependency on the schema. */
export type { Box } from '@turboslide/schema/render';

/** A point in sheet pixels (the 1600 by 900 stage). */
export type Point = { x: number; y: number };

export type HandleKind =
  | 'key-edge'
  | 'col-seam'
  | 'plate-width'
  | 'plate-side'
  | 'shot-width'
  | 'shot-crop'
  | 'pair-swap'
  | 'scale-marker'
  | 'block-move'
  | 'dia-label'
  | 'dia-marker';

/**
 * How the overlay draws a handle: `v` a vertical rule through the hit box, `square` an 11 px
 * square, `area` an invisible region with a cursor, `chip` the selection chip itself.
 */
export type HandleShape = 'v' | 'square' | 'area' | 'chip';

export type Handle = {
  id: string;
  kind: HandleKind;
  /** the hit box in sheet pixels */
  box: Box;
  /** the block the handle edits; absent for the slide-level handles (seam, plate) */
  blockId?: string;
  /** the item the handle edits: a scales row, a pair figure */
  index?: number;
  cursor: 'col-resize' | 'ew-resize' | 'ns-resize' | 'grab';
  /** the accessible name, `<block id>: <property>` (SPEC 6.5) */
  label: string;
  /** the locale-independent id for the window API, under `handle.` so it never collides with an inspector control */
  control: string;
  shape: HandleShape;
  /** the arrow keys that nudge it; `xy` moves on both axes (a diagram label or marker) */
  axis: 'x' | 'y' | 'xy';
  /** the drag direction that increases the value; -1 for an edge anchored on the right */
  sign: 1 | -1;
  /** the handle is live only while Alt is held (SPEC 6.4: Alt-drag a label or marker in a dia) */
  alt?: true;
};

/** The boxes the Editor measures from the rendered slide, in sheet pixels (SPEC 6.4: rect / k). */
export type MeasuredBoxes = {
  blocks: Record<string, Box>;
  slots: Partial<Record<BlockSlot, Box>>;
  /** keyed `<blockId>/<pointer>`, as data-run writes it */
  runs: Record<string, Box>;
  /** per block, the parts a handle needs (PART_SELECTORS), in document order */
  parts: Record<string, Box[]>;
};

export const EMPTY_BOXES: MeasuredBoxes = { blocks: {}, slots: {}, runs: {}, parts: {} };

/** The descendants of a block the Editor measures as parts, per type; the handles read them by index. */
export const PART_SELECTORS: Partial<Record<BlockType, string>> = {
  scales: '.scale .bar',
  pair: ':scope > figure',
  shot: 'img.shot',
  // the renderer tags a declared diagram's markers then its texts with data-dia (blocks/dia.ts)
  dia: '[data-dia]',
};

/** The hit thickness of an edge handle in sheet pixels; Overlay.css widens it to a minimum in CSS pixels. */
export const HANDLE_HIT = 8;
/** The side of a square handle, the deck's marker size (DECK-GRAMMAR.md:44). */
export const HANDLE_SQUARE = 11;

type PictureKind = 'opener' | 'mood' | 'closing';
type PictureSlide = Extract<Slide, { kind: PictureKind }>;

function isPictureSlide(slide: Slide): slide is PictureSlide {
  return slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing';
}

/** The block lists of a slide with their slot names; a content slide lists only the slots it fills. */
export function slotLists(slide: Slide): { slot: BlockSlot; blocks: Block[] }[] {
  if (slide.kind === 'content') {
    return Object.entries(slide.slots).map(([slot, blocks]) => ({
      slot: slot as BlockSlot,
      blocks,
    }));
  }
  if (isPictureSlide(slide)) return [{ slot: 'plate', blocks: slide.plate.blocks }];
  return [];
}

/** Where a top-level block sits: its slot, its list and its index. */
export function locateBlock(
  slide: Slide,
  blockId: string,
): { slot: BlockSlot; blocks: Block[]; index: number } | null {
  for (const { slot, blocks } of slotLists(slide)) {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index >= 0) return { slot, blocks, index };
  }
  return null;
}

/** Client pixels to sheet pixels through the stage's box: k is the box width over 1600 (SPEC 6.4). */
export function sheetPoint(
  stage: { left: number; top: number; width: number },
  clientX: number,
  clientY: number,
): Point {
  const k = stage.width > 0 ? stage.width / SHEET.width : 1;
  return { x: (clientX - stage.left) / k, y: (clientY - stage.top) / k };
}

function contains(box: Box, point: Point): boolean {
  return (
    point.x >= box[0] &&
    point.x <= box[0] + box[2] &&
    point.y >= box[1] &&
    point.y <= box[1] + box[3]
  );
}

// ---------------------------------------------------------------------------------------------
// Handles

function edge(x: number, y: number, h: number): Box {
  return [x - HANDLE_HIT / 2, y, HANDLE_HIT, h];
}

function square(cx: number, cy: number): Box {
  return [cx - HANDLE_SQUARE / 2, cy - HANDLE_SQUARE / 2, HANDLE_SQUARE, HANDLE_SQUARE];
}

/**
 * The handles of a slide (SPEC 6.4 table): the column seam of `cols` and the plate edge and grip of
 * a full-picture slide always; for the selected block its chip (drag to reorder), and per type the
 * rows key edge, the shot edge and crop area, the pair figures, the scales markers. Diagram
 * editing is M5 and gets no handle. Blocks without a measured box get none.
 */
export function handlesFor(slide: Slide, boxes: MeasuredBoxes, selection: Selection): Handle[] {
  const handles: Handle[] = [];
  if (slide.kind === 'content' && slide.layout.type === 'cols') {
    const left = boxes.slots.left;
    const right = boxes.slots.right;
    if (left && right) {
      const x0 = left[0] + left[2];
      const x1 = right[0];
      handles.push({
        id: 'col-seam',
        kind: 'col-seam',
        box: [x0, CONTENT_ORIGIN[1], Math.max(HANDLE_HIT, x1 - x0), CONTENT[1]],
        cursor: 'col-resize',
        label: 'Layout: Column seam',
        control: 'handle.layout.ratio',
        shape: 'v',
        axis: 'x',
        sign: 1,
      });
    }
  }
  if (isPictureSlide(slide)) {
    const plate = boxes.slots.plate;
    if (plate) {
      const anchoredRight = slide.plate.side === 'lower-right';
      handles.push({
        id: 'plate-width',
        kind: 'plate-width',
        box: edge(anchoredRight ? plate[0] : plate[0] + plate[2], plate[1], plate[3]),
        cursor: 'ew-resize',
        label: 'Plate: Max width',
        control: 'handle.plate.maxWidth',
        shape: 'v',
        axis: 'x',
        sign: anchoredRight ? -1 : 1,
      });
      const gripY = slide.plate.side === 'upper-left' ? plate[1] + plate[3] : plate[1];
      handles.push({
        id: 'plate-side',
        kind: 'plate-side',
        box: square(plate[0] + plate[2] / 2, gripY),
        cursor: 'grab',
        label: 'Plate: Side',
        control: 'handle.plate.side',
        shape: 'square',
        axis: 'x',
        sign: 1,
      });
    }
  }
  const blockId = selectedBlockId(selection);
  if (blockId === null) return handles;
  const block = blockById(slide, blockId);
  const box = boxes.blocks[blockId];
  if (!block || !box) return handles;
  const parts = boxes.parts[blockId] ?? [];
  handles.push({
    id: `block-move:${blockId}`,
    kind: 'block-move',
    box,
    blockId,
    cursor: 'grab',
    label: `${blockId}: Move`,
    control: `handle.${blockId}.move`,
    shape: 'chip',
    axis: 'y',
    sign: 1,
  });
  switch (block.type) {
    case 'rows':
      handles.push({
        id: `key-edge:${blockId}`,
        kind: 'key-edge',
        box: edge(box[0] + block.key, box[1], box[3]),
        blockId,
        cursor: 'col-resize',
        label: `${blockId}: Key column edge`,
        control: `handle.${blockId}.key`,
        shape: 'v',
        axis: 'x',
        sign: 1,
      });
      break;
    case 'shot': {
      handles.push({
        id: `shot-width:${blockId}`,
        kind: 'shot-width',
        box: edge(box[0] + box[2], box[1], box[3]),
        blockId,
        cursor: 'ew-resize',
        label: `${blockId}: Width`,
        control: `handle.${blockId}.width`,
        shape: 'v',
        axis: 'x',
        sign: 1,
      });
      const image = parts[0];
      if (block.aspect !== undefined && image) {
        handles.push({
          id: `shot-crop:${blockId}`,
          kind: 'shot-crop',
          box: image,
          blockId,
          cursor: 'ns-resize',
          label: `${blockId}: Crop anchor`,
          control: `handle.${blockId}.crop`,
          shape: 'area',
          axis: 'y',
          sign: 1,
        });
      }
      break;
    }
    case 'pair':
      if (block.figures.length > 1) {
        parts.forEach((figure, index) => {
          if (index >= block.figures.length) return;
          handles.push({
            id: `pair-swap:${blockId}:${index}`,
            kind: 'pair-swap',
            box: figure,
            blockId,
            index,
            cursor: 'grab',
            label: `${blockId}: Figure ${index + 1}`,
            control: `handle.${blockId}.figures.${index}`,
            shape: 'area',
            axis: 'x',
            sign: 1,
          });
        });
      }
      break;
    case 'scales':
      parts.forEach((bar, index) => {
        const item = block.items[index];
        if (!item) return;
        handles.push({
          id: `scale-marker:${blockId}:${index}`,
          kind: 'scale-marker',
          box: square(bar[0] + (item.value / 100) * bar[2], bar[1] + bar[3] / 2),
          blockId,
          index,
          cursor: 'ew-resize',
          label: `${blockId}: Marker ${index + 1}`,
          control: `handle.${blockId}.items.${index}.value`,
          shape: 'square',
          axis: 'x',
          sign: 1,
        });
      });
      break;
    case 'dia': {
      // Alt-drag a label or a marker of a declared diagram (SPEC 6.4, M5): the parts are the
      // markers then the texts in render order; each handle is live only while Alt is held.
      const data = block.data;
      if (!data) break;
      const markers = data.markers.length;
      parts.forEach((part, index) => {
        if (index < markers) {
          handles.push({
            id: `dia-marker:${blockId}:${index}`,
            kind: 'dia-marker',
            box: part,
            blockId,
            index,
            cursor: 'grab',
            label: `${blockId}: Marker ${index + 1}`,
            control: `handle.${blockId}.data.markers.${index}`,
            shape: 'square',
            axis: 'xy',
            sign: 1,
            alt: true,
          });
          return;
        }
        const textIndex = index - markers;
        if (textIndex >= data.texts.length) return;
        handles.push({
          id: `dia-label:${blockId}:${textIndex}`,
          kind: 'dia-label',
          box: part,
          blockId,
          index: textIndex,
          cursor: 'grab',
          label: `${blockId}: Label ${textIndex + 1}`,
          control: `handle.${blockId}.data.texts.${textIndex}`,
          shape: 'area',
          axis: 'xy',
          sign: 1,
          alt: true,
        });
      });
      break;
    }
    default:
      break;
  }
  return handles;
}

/**
 * Diagram units per sheet pixel of a rendered dia block: one with `fit: 'slot'`, the viewBox
 * width over the measured width otherwise (render/dia/snap.ts).
 */
export function diaUnitsPerPixel(
  block: Extract<Block, { type: 'dia' }>,
  box: Box | undefined,
): number {
  if (!block.data) return 1;
  return unitsPerPixel(block.fit, block.data, box?.[2] ?? block.data.w);
}

/**
 * The one mutation of a label or marker move in a declared diagram: the item at its new point on
 * the half-pixel grid, written whole so the gesture is one `block.set` of `/data/texts/i` or
 * `/data/markers/i` (SPEC 6.4: each gesture ends in exactly one mutation).
 */
export function diaMoveMutation(
  slide: Slide,
  block: Extract<Block, { type: 'dia' }>,
  handle: Handle,
  dxUnits: number,
  dyUnits: number,
): Mutation | null {
  const data = block.data;
  if (!data || handle.index === undefined) return null;
  if (handle.kind === 'dia-marker') {
    const marker = data.markers[handle.index];
    if (!marker) return null;
    const next = { ...marker, x: snapHalf(marker.x + dxUnits), y: snapHalf(marker.y + dyUnits) };
    if (next.x === marker.x && next.y === marker.y) return null;
    return {
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: `/data/markers/${handle.index}`,
      value: next,
    };
  }
  const text = data.texts[handle.index];
  if (!text) return null;
  const next = { ...text, x: snapHalf(text.x + dxUnits), y: snapHalf(text.y + dyUnits) };
  if (next.x === text.x && next.y === text.y) return null;
  return {
    op: 'block.set',
    slideId: slide.id,
    blockId: block.id,
    path: `/data/texts/${handle.index}`,
    value: next,
  };
}

/**
 * The live clearance of a dragged label (SPEC 6.4: 12 px clearance shown live): the label's box in
 * sheet pixels and whether it keeps the grammar's distance from every stroke and marker, read
 * from the slide the preview shows. Null for anything but a dia-label handle.
 */
export function labelClearanceBox(
  slide: Slide,
  handle: Handle,
  boxes: MeasuredBoxes,
): { box: Box; ok: boolean; nearest: number } | null {
  if (handle.kind !== 'dia-label' || handle.blockId === undefined || handle.index === undefined)
    return null;
  const block = blockById(slide, handle.blockId);
  if (!block || block.type !== 'dia' || !block.data) return null;
  const blockBox = boxes.blocks[handle.blockId];
  if (!blockBox) return null;
  const units = diaUnitsPerPixel(block, blockBox);
  const { box, ok, nearest } = labelClearance(block.data, handle.index);
  const toSheet = (b: DiaBox): Box => [
    blockBox[0] + b[0] / units,
    blockBox[1] + b[1] / units,
    b[2] / units,
    b[3] / units,
  ];
  return { box: toSheet(box), ok, nearest: nearest / units };
}

// ---------------------------------------------------------------------------------------------
// Drags

/** What a gesture reads: the slide as it was when the drag began and the boxes measured then. */
export type GestureContext = { slide: Slide; boxes: MeasuredBoxes };

function blockSet(slide: Slide, blockId: string, path: string, value?: unknown): Mutation {
  return value === undefined
    ? { op: 'block.set', slideId: slide.id, blockId, path }
    : { op: 'block.set', slideId: slide.id, blockId, path, value };
}

function slideSet(slide: Slide, path: string, value: unknown): Mutation {
  return { op: 'slide.set', slideId: slide.id, path, value };
}

/** The slot box a block sits in, for the shot snaps; the content box when nothing was measured. */
function slotBoxOf(slide: Slide, blockId: string, boxes: MeasuredBoxes): Box {
  const located = locateBlock(slide, blockId);
  const measured = located ? boxes.slots[located.slot] : undefined;
  return measured ?? [CONTENT_ORIGIN[0], CONTENT_ORIGIN[1], CONTENT[0], CONTENT[1]];
}

/** The gap between the blocks of a stack, for the drop line; the deck's .stack gap (head:86). */
const STACK_GAP = 22;

/**
 * The block.move a drag of a block's chip lands on (SPEC 6.4: up or down inside a slot, or across
 * the two slots of `cols`, never out of a plate), plus the drop line the overlay draws. The
 * insertion point is the first sibling whose vertical center is below the pointer; the mutation is
 * null when the block would land where it already is.
 */
export function blockMoveFor(
  slide: Slide,
  blockId: string,
  now: Point,
  boxes: MeasuredBoxes,
): { mutation: Mutation | null; indicator: Box | null } {
  const located = locateBlock(slide, blockId);
  if (!located) return { mutation: null, indicator: null };
  let slot: BlockSlot = located.slot;
  if (slide.kind === 'content' && slide.layout.type === 'cols') {
    const right = boxes.slots.right;
    const left = boxes.slots.left;
    if (left && right) slot = now.x >= right[0] - COLUMN_GAP / 2 ? 'right' : 'left';
  }
  const targetList =
    slide.kind === 'content'
      ? (slide.slots[slot as keyof typeof slide.slots] ?? [])
      : located.blocks;
  const siblings = targetList.filter((block) => block.id !== blockId);
  const slotBox = boxes.slots[slot] ?? slotBoxOf(slide, blockId, boxes);
  let after: string | undefined;
  let indicator: Box | null = null;
  let placed = false;
  for (let i = 0; i < siblings.length; i += 1) {
    const sibling = siblings[i];
    const box = sibling ? boxes.blocks[sibling.id] : undefined;
    if (!sibling || !box) continue;
    if (now.y < box[1] + box[3] / 2) {
      after = i > 0 ? siblings[i - 1]?.id : undefined;
      indicator = [slotBox[0], box[1] - STACK_GAP / 2, slotBox[2], 0];
      placed = true;
      break;
    }
  }
  if (!placed) {
    const last = siblings[siblings.length - 1];
    after = last?.id;
    const lastBox = last ? boxes.blocks[last.id] : undefined;
    indicator = lastBox
      ? [slotBox[0], lastBox[1] + lastBox[3] + STACK_GAP / 2, slotBox[2], 0]
      : [slotBox[0], slotBox[1], slotBox[2], 0];
  }
  const currentAfter = located.index > 0 ? located.blocks[located.index - 1]?.id : undefined;
  if (slot === located.slot && after === currentAfter) return { mutation: null, indicator };
  const mutation: Mutation = {
    op: 'block.move',
    slideId: slide.id,
    blockId,
    slot,
    ...(after !== undefined ? { after } : {}),
  };
  return { mutation, indicator };
}

/**
 * The one mutation a drag stands for at its current point, or null when the value has not moved
 * off its start (SPEC 6.4: each gesture ends in exactly one mutation). Called on every pointer
 * move for the live preview and once more on release for the commit; both read the slide as it
 * was when the drag began, so a preview never compounds.
 */
export function gestureMutation(
  handle: Handle,
  ctx: GestureContext,
  start: Point,
  now: Point,
): Mutation | null {
  const { slide, boxes } = ctx;
  const dx = (now.x - start.x) * handle.sign;
  const dy = now.y - start.y;
  switch (handle.kind) {
    case 'col-seam': {
      if (slide.kind !== 'content' || slide.layout.type !== 'cols') return null;
      const gap = slide.layout.gap ?? COLUMN_GAP;
      const next = snapRatio(ratioLeftWidth(slide.layout.ratio, gap) + dx, gap);
      return jsonEqual(next, slide.layout.ratio) ? null : slideSet(slide, '/layout/ratio', next);
    }
    case 'plate-width': {
      if (!isPictureSlide(slide)) return null;
      const next = snapPlateWidth(slide.plate.maxWidth + dx);
      return next === slide.plate.maxWidth ? null : slideSet(slide, '/plate/maxWidth', next);
    }
    case 'plate-side': {
      if (!isPictureSlide(slide)) return null;
      const next = plateSideFor(slide.kind, now.x);
      return next === slide.plate.side ? null : slideSet(slide, '/plate/side', next);
    }
    case 'block-move':
      return handle.blockId === undefined
        ? null
        : blockMoveFor(slide, handle.blockId, now, boxes).mutation;
    default:
      break;
  }
  const blockId = handle.blockId;
  const block = blockId === undefined ? undefined : blockById(slide, blockId);
  if (!block || blockId === undefined) return null;
  switch (handle.kind) {
    case 'key-edge': {
      if (block.type !== 'rows') return null;
      const next = snapKey(block.key + dx);
      return next === block.key ? null : blockSet(slide, blockId, '/key', next);
    }
    case 'shot-width': {
      if (block.type !== 'shot') return null;
      const box = boxes.blocks[blockId];
      const slotBox = slotBoxOf(slide, blockId, boxes);
      const from = block.width ?? box?.[2] ?? slotBox[2];
      const next = snapShotWidth(from + dx, slotBox[2], slotBox[3]);
      if (next === slotBox[2]) {
        // the column width is the block's natural width: the property goes, the block fills the slot
        return block.width === undefined ? null : blockSet(slide, blockId, '/width');
      }
      return next === block.width ? null : blockSet(slide, blockId, '/width', next);
    }
    case 'shot-crop': {
      if (block.type !== 'shot') return null;
      const current = block.crop ?? 'center';
      const next = dy <= -CROP_FLIP_PX ? 'top' : dy >= CROP_FLIP_PX ? 'center' : current;
      return next === current ? null : blockSet(slide, blockId, '/crop', next);
    }
    case 'pair-swap': {
      if (block.type !== 'pair' || handle.index === undefined) return null;
      const parts = boxes.parts[blockId] ?? [];
      const over = parts.findIndex((figure) => contains(figure, now));
      if (over < 0 || over === handle.index || over >= block.figures.length) return null;
      const figures = block.figures.map((figure) => ({ ...figure }));
      const a = figures[handle.index];
      const b = figures[over];
      if (!a || !b) return null;
      figures[handle.index] = b;
      figures[over] = a;
      return blockSet(slide, blockId, '/figures', figures);
    }
    case 'scale-marker': {
      if (block.type !== 'scales' || handle.index === undefined) return null;
      const bar = (boxes.parts[blockId] ?? [])[handle.index];
      const item = block.items[handle.index];
      if (!bar || !item || bar[2] <= 0) return null;
      const next = snapScaleValue((now.x - bar[0]) / bar[2]);
      return next === item.value
        ? null
        : blockSet(slide, blockId, `/items/${handle.index}/value`, next);
    }
    case 'dia-label':
    case 'dia-marker': {
      if (block.type !== 'dia') return null;
      const units = diaUnitsPerPixel(block, boxes.blocks[blockId]);
      return diaMoveMutation(slide, block, handle, (now.x - start.x) * units, dy * units);
    }
    default:
      return null;
  }
}

/**
 * One keyboard step on a focused handle (SPEC 6.4 keyboard nudges): the key edge and the plate
 * edge step through their sets, the seam through the named ratios and 10 px, a marker by one (ten
 * with Shift through `delta`), a shot edge by 10 px, a block by one position, a plate side and a
 * crop anchor flip, a pair figure swaps with its neighbour.
 */
export function nudgeMutation(
  handle: Handle,
  ctx: GestureContext,
  delta: number,
  axis: 'x' | 'y' = 'x',
): Mutation | null {
  const { slide, boxes } = ctx;
  switch (handle.kind) {
    case 'col-seam': {
      if (slide.kind !== 'content' || slide.layout.type !== 'cols') return null;
      const next = stepRatio(slide.layout.ratio, delta, slide.layout.gap ?? COLUMN_GAP);
      return jsonEqual(next, slide.layout.ratio) ? null : slideSet(slide, '/layout/ratio', next);
    }
    case 'plate-width': {
      if (!isPictureSlide(slide)) return null;
      const next = stepInSet(PLATE_WIDTHS, slide.plate.maxWidth, delta * handle.sign);
      return next === slide.plate.maxWidth ? null : slideSet(slide, '/plate/maxWidth', next);
    }
    case 'plate-side': {
      if (!isPictureSlide(slide)) return null;
      const [left, right] = PLATE_SIDES_BY_KIND[slide.kind];
      const next = slide.plate.side === left ? right : left;
      return next === slide.plate.side ? null : slideSet(slide, '/plate/side', next);
    }
    default:
      break;
  }
  const blockId = handle.blockId;
  const block = blockId === undefined ? undefined : blockById(slide, blockId);
  if (!block || blockId === undefined) return null;
  switch (handle.kind) {
    case 'key-edge': {
      if (block.type !== 'rows') return null;
      const next = stepInSet(ROWS_KEY_SNAP, block.key, delta);
      return next === block.key ? null : blockSet(slide, blockId, '/key', next);
    }
    case 'shot-width': {
      if (block.type !== 'shot') return null;
      const slotBox = slotBoxOf(slide, blockId, boxes);
      const from = block.width ?? boxes.blocks[blockId]?.[2] ?? slotBox[2];
      const next = snapShotWidth(from + delta * 10, slotBox[2], slotBox[3]);
      if (next === slotBox[2])
        return block.width === undefined ? null : blockSet(slide, blockId, '/width');
      return next === block.width ? null : blockSet(slide, blockId, '/width', next);
    }
    case 'shot-crop': {
      if (block.type !== 'shot') return null;
      const next = (block.crop ?? 'center') === 'center' ? 'top' : 'center';
      return blockSet(slide, blockId, '/crop', next);
    }
    case 'pair-swap': {
      if (block.type !== 'pair' || handle.index === undefined) return null;
      const other = handle.index + (delta > 0 ? 1 : -1);
      if (other < 0 || other >= block.figures.length) return null;
      const figures = block.figures.map((figure) => ({ ...figure }));
      const a = figures[handle.index];
      const b = figures[other];
      if (!a || !b) return null;
      figures[handle.index] = b;
      figures[other] = a;
      return blockSet(slide, blockId, '/figures', figures);
    }
    case 'scale-marker': {
      if (block.type !== 'scales' || handle.index === undefined) return null;
      const item = block.items[handle.index];
      if (!item) return null;
      const next = Math.max(0, Math.min(100, item.value + delta));
      return next === item.value
        ? null
        : blockSet(slide, blockId, `/items/${handle.index}/value`, next);
    }
    case 'dia-label':
    case 'dia-marker': {
      // one unit per step on the half-pixel grid (ten with Shift through `delta`); Up is negative y
      if (block.type !== 'dia') return null;
      const dx = axis === 'x' ? delta : 0;
      const dy = axis === 'y' ? -delta : 0;
      return diaMoveMutation(slide, block, handle, dx, dy);
    }
    case 'block-move': {
      const located = locateBlock(slide, blockId);
      if (!located) return null;
      const target = located.index + (delta > 0 ? 1 : -1);
      if (target < 0 || target >= located.blocks.length) return null;
      // moving down one lands after the block that follows; moving up lands after the one two back
      const after = delta > 0 ? located.blocks[target]?.id : located.blocks[target - 1]?.id;
      return {
        op: 'block.move',
        slideId: slide.id,
        blockId,
        slot: located.slot,
        ...(after !== undefined ? { after } : {}),
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The action call

export type ActionCall = { id: ActionId; input: Record<string, unknown> };

/**
 * The action-table call for a stage mutation (SPEC 7.1): block mutations are their own actions,
 * slide-level pointer writes and text.replace travel as `slide.update`. The editor adds nothing
 * else, so the call is byte for byte what `turboslide block set` or an MCP client would send.
 */
export function actionForMutation(mutation: Mutation, baseRevision: number): ActionCall {
  switch (mutation.op) {
    case 'block.set':
      return {
        id: 'block.set',
        input: {
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          path: mutation.path,
          ...(mutation.value !== undefined ? { value: mutation.value } : {}),
          baseRevision,
        },
      };
    case 'block.move':
      return {
        id: 'block.move',
        input: {
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          slot: mutation.slot,
          ...(mutation.after !== undefined ? { after: mutation.after } : {}),
          baseRevision,
        },
      };
    case 'block.remove':
      return {
        id: 'block.remove',
        input: { slideId: mutation.slideId, blockId: mutation.blockId, baseRevision },
      };
    case 'block.insert':
      return {
        id: 'block.insert',
        input: {
          slideId: mutation.slideId,
          slot: mutation.slot,
          ...(mutation.after !== undefined ? { after: mutation.after } : {}),
          block: mutation.block,
          baseRevision,
        },
      };
    case 'slide.set':
    case 'text.replace':
      return {
        id: 'slide.update',
        input: { slideId: mutation.slideId, baseRevision, mutations: [mutation] },
      };
    default:
      throw new RangeError(`The stage does not emit ${mutation.op}`);
  }
}

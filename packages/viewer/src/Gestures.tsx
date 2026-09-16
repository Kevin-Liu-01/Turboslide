// The gesture engine of the stage in edit mode (SPEC 6.4; gslides-parity SPEC-2 section 6): the
// handles the overlay draws for a slide and its selected objects, the pointer math from client
// pixels to sheet pixels, the mapping from a drag (start point, current point, the modifier keys)
// to the mutations it stands for, the keyboard nudges, the draw tools and the mapping from a
// mutation to the action-table call the editor dispatches (SPEC 7.1: a click and an agent call
// are one action). Every object of every slide kind gets the canvas handles (the frame and chip
// that move it, the eight squares that resize it, the ring that rotates it, the two end handles of
// a line); the grammar's own property handles (the key edge, the shot edge, the seam, the plate
// grip) stay beside them. Everything here is pure and runs in Node; gestures.test.ts and
// canvas.test.ts pin the mapping. The Editor owns the pointer listeners, the conversion of a
// slide that is not a canvas yet and the live preview; the chrome's Overlay owns the pixels.
import type { ActionId } from '@turboslide/schema/actions';
import type { Block, BlockType, ShapeBlock, ShapeKind } from '@turboslide/schema/blocks';
import { ROWS_KEY_SNAP } from '@turboslide/schema/blocks';
import { resizeKindOf, rotateVector } from '@turboslide/schema/canvas';
import { emptyChart } from '@turboslide/schema/blocks/chart';
import type { ChartKind } from '@turboslide/schema/blocks/chart';
import { emptyTable } from '@turboslide/schema/blocks/table';
import {
  canAttach,
  connectorEnds,
  connectorFieldsBetween,
  isConnector,
  nearestSite,
  targetSites,
} from '@turboslide/schema/connect';
import type { Slide } from '@turboslide/schema/deck';
import { PLATE_WIDTHS, slotsForLayout } from '@turboslide/schema/deck';
import { boundingBox, unionBox } from '@turboslide/schema/freeform';
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import { normalizeRotation } from '@turboslide/schema/position';
import type { Box } from '@turboslide/schema/render';
import { isLineKind, isPathKind } from '@turboslide/schema/shapes';
import type { LineKind } from '@turboslide/schema/shapes';
import { COLUMN_GAP, CONTENT, CONTENT_ORIGIN, SHEET, grid } from '@turboslide/theme/tokens';
import type { PageSize } from '@turboslide/theme/tokens';

import { labelClearance, snapHalf, unitsPerPixel } from '@turboslide/render/dia/snap';
import type { DiaBox } from '@turboslide/render/dia/snap';

import {
  freeformBlocks,
  isFreeformSlide,
  placedOf,
  posBox,
  posFor,
  scaleGroupMutations,
} from './Freeform';
import { rotateMutations, rotationFromDrag } from './rotate';
import type { Selection } from './Selection';
import { blockById, selectedBlockId } from './Selection';
import {
  axisLock,
  CROP_FLIP_PX,
  plateSideFor,
  PLATE_SIDES_BY_KIND,
  ratioLeftWidth,
  RESIZE_DIRS,
  resizeCursor,
  snapKey,
  snapMove,
  snapPlateWidth,
  snapRatio,
  snapResize,
  snapScaleValue,
  snapShotWidth,
  stepInSet,
  stepRatio,
} from './snap';
import type { ResizeDir, SnapLine } from './snap';

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
  | 'dia-marker'
  /** an object of the canvas: its chip and frame drag it anywhere (SPEC-2 6.1 row 7) */
  | 'free-move'
  /** one of the eight resize squares of an object (row 9) */
  | 'free-resize'
  /** the rotation ring above the selection (row 11) */
  | 'free-rotate'
  /** the start (index 0) or end (index 1) handle of a line kind (row 20, 6.2) */
  | 'line-end'
  /** one of the eight black squares of crop mode (row 19) */
  | 'crop-edge';

/**
 * How the overlay draws a handle: `v` a vertical rule through the hit box, `square` an 11 px
 * square, `area` an invisible region with a cursor, `chip` the selection chip itself, `ring` the
 * 12 px rotation ring joined to the selection by a 1 px line.
 */
export type HandleShape = 'v' | 'square' | 'area' | 'chip' | 'ring';

export type Handle = {
  id: string;
  kind: HandleKind;
  /** the hit box in sheet pixels */
  box: Box;
  /** the block the handle edits; absent for the slide-level handles (seam, plate) */
  blockId?: string;
  /** the item the handle edits: a scales row, a pair figure, a line end (0 start, 1 end) */
  index?: number;
  /** the edge or corner a free-resize or crop-edge handle moves */
  dir?: ResizeDir;
  cursor:
    | 'col-resize'
    | 'ew-resize'
    | 'ns-resize'
    | 'nesw-resize'
    | 'nwse-resize'
    | 'grab'
    | 'move'
    | 'crosshair';
  /** the accessible name, `<block id>: <property>` (SPEC 6.5) */
  label: string;
  /** the locale-independent id for the window API, under `handle.` so it never collides with an inspector control */
  control: string;
  shape: HandleShape;
  /** the arrow keys that nudge it; `xy` moves on both axes (a diagram label or marker, an object) */
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
  /** the ids whose element holds a prompt (an empty placeholder keeps the prompt's box, SPEC-2 0.97) */
  prompted?: string[];
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
/** The rotation ring's hit box in sheet pixels; the overlay draws it 24 CSS px above the ring. */
export const ROTATE_HANDLE_BOX = 24;
/** A line's end handle snaps to a connection site within this many sheet pixels (SPEC-2 6.2). */
export const SITE_SNAP_PX = 12;

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

/** Client pixels to sheet pixels through the stage's box: k is the box width over the page's width, 1600 on the default page (SPEC 6.4). */
export function sheetPoint(
  stage: { left: number; top: number; width: number },
  clientX: number,
  clientY: number,
  page: PageSize = SHEET,
): Point {
  const k = stage.width > 0 ? stage.width / page.width : 1;
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

/** True for a shape block of a line kind: it drags by its two ends instead of eight squares (SPEC-2 6.2). */
export function isLineBlock(block: Block | undefined): block is ShapeBlock {
  return block !== undefined && block.type === 'shape' && isLineKind(block.shape);
}

/** What `handlesFor` reads beyond the anchor: every selected id (a group or a multi selection) and crop mode. */
export type HandleOptions = {
  /** every selected object, the anchor first; `[anchor]` when absent */
  ids?: readonly string[];
  /** crop mode on the anchor: the eight crop handles over the frame replace the object's handles */
  crop?: { frame: Box };
  /** the deck's page in sheet pixels (gslides-parity SPEC-5 6.1); the default page when absent */
  page?: PageSize;
};

/** The eight resize squares around a box, for an object or a selection's union. */
function resizeHandles(
  blockId: string,
  box: Box,
  kind: 'free-resize' | 'crop-edge',
  prefix: string,
): Handle[] {
  return RESIZE_DIRS.map((dir) => {
    const cx = dir.includes('w')
      ? box[0]
      : dir.includes('e')
        ? box[0] + box[2]
        : box[0] + box[2] / 2;
    const cy = dir.includes('n')
      ? box[1]
      : dir.includes('s')
        ? box[1] + box[3]
        : box[1] + box[3] / 2;
    return {
      id: `${kind}:${blockId}:${dir}`,
      kind,
      box: square(cx, cy),
      blockId,
      dir,
      cursor: resizeCursor(dir),
      label: `${blockId}: ${prefix} ${dir}`,
      control: `handle.${blockId}.${kind === 'crop-edge' ? 'crop' : 'resize'}.${dir}`,
      shape: 'square',
      axis: 'xy',
      sign: 1,
    };
  });
}

/**
 * The canvas handles of the selection (SPEC-2 6.1 rows 1, 9, 11, 19, 20): the chip and frame that
 * move it, the eight squares that resize it (the union for several objects, a group's members
 * scaling together), the rotation ring above it, or a line's two end handles; in crop mode the
 * eight black crop handles over the frame.
 */
function canvasHandles(
  slide: Slide,
  boxes: MeasuredBoxes,
  anchor: string,
  ids: readonly string[],
  options: HandleOptions,
): Handle[] {
  const handles: Handle[] = [];
  if (options.crop) {
    handles.push(...resizeHandles(anchor, options.crop.frame, 'crop-edge', 'Crop'));
    return handles;
  }
  const rows = placedOf(slide, ids, boxes);
  const union: Box | null =
    rows.length > 0
      ? unionBox(rows.map((row) => row.pos))
      : ids.reduce<Box | null>((acc, id) => {
          const box = boxes.blocks[id];
          if (!box) return acc;
          if (!acc) return [...box];
          const x = Math.min(acc[0], box[0]);
          const y = Math.min(acc[1], box[1]);
          return [
            x,
            y,
            Math.max(acc[0] + acc[2], box[0] + box[2]) - x,
            Math.max(acc[1] + acc[3], box[1] + box[3]) - y,
          ];
        }, null);
  const own = boxes.blocks[anchor];
  const box = union ?? own;
  if (!box) return handles;
  handles.push({
    id: `free-move:${anchor}`,
    kind: 'free-move',
    box,
    blockId: anchor,
    cursor: 'move',
    label: `${anchor}: Move`,
    control: `handle.${anchor}.move`,
    shape: 'chip',
    axis: 'xy',
    sign: 1,
  });
  const block = blockById(slide, anchor);
  if (ids.length === 1 && isLineBlock(block) && block.pos !== undefined) {
    const ends = connectorEnds(block);
    (['start', 'end'] as const).forEach((which, index) => {
      const point = ends[which];
      handles.push({
        id: `line-end:${anchor}:${index}`,
        kind: 'line-end',
        box: square(point.x, point.y),
        blockId: anchor,
        index,
        cursor: 'crosshair',
        label: `${anchor}: ${which === 'start' ? 'Line start' : 'Line end'}`,
        control: `handle.${anchor}.${which}`,
        shape: 'square',
        axis: 'xy',
        sign: 1,
      });
    });
    return handles;
  }
  handles.push(...resizeHandles(anchor, box, 'free-resize', 'Resize'));
  handles.push({
    id: `free-rotate:${anchor}`,
    kind: 'free-rotate',
    /* the hit box sits on the object's top edge; the overlay draws the ring 24 CSS px above it */
    box: [
      box[0] + box[2] / 2 - ROTATE_HANDLE_BOX / 2,
      box[1] - ROTATE_HANDLE_BOX,
      ROTATE_HANDLE_BOX,
      ROTATE_HANDLE_BOX,
    ],
    blockId: anchor,
    cursor: 'grab',
    label: `${anchor}: Rotate`,
    control: `handle.${anchor}.rotate`,
    shape: 'ring',
    axis: 'x',
    sign: 1,
  });
  return handles;
}

/**
 * The handles of a slide (SPEC 6.4 table; SPEC-2 section 6): the column seam of `cols` and the
 * plate edge and grip of a picture kind always; for the selection the canvas handles of every
 * object (`canvasHandles`), and per type the rows key edge, the shot edge and crop area, the pair
 * figures, the scales markers and the Alt-drag diagram labels. Objects without a measured box get
 * none.
 */
export function handlesFor(
  slide: Slide,
  boxes: MeasuredBoxes,
  selection: Selection,
  options: HandleOptions = {},
): Handle[] {
  const handles: Handle[] = [];
  if (slide.kind === 'content' && slide.layout.type === 'cols') {
    const left = boxes.slots.left;
    const right = boxes.slots.right;
    if (left && right) {
      const x0 = left[0] + left[2];
      const x1 = right[0];
      const content = grid(options.page ?? SHEET).content;
      handles.push({
        id: 'col-seam',
        kind: 'col-seam',
        box: [x0, CONTENT_ORIGIN[1], Math.max(HANDLE_HIT, x1 - x0), content[1]],
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
  const ids = options.ids && options.ids.length > 0 ? options.ids : [blockId];
  if (options.crop) {
    /* crop mode's frame stands in for the measured box (SPEC-2 6.1 row 19): the eight crop
       handles are drawn from it whether or not the anchor has a block box, so the provisional
       crop of an unconverted photograph draws them too (VERIFICATION-3 finding 27) */
    handles.push(...canvasHandles(slide, boxes, blockId, ids, options));
    return handles;
  }
  const box = boxes.blocks[blockId];
  if (!box) return handles;
  handles.push(...canvasHandles(slide, boxes, blockId, ids, options));
  if (ids.length > 1) return handles;
  const block = blockById(slide, blockId);
  if (!block) return handles;
  const parts = boxes.parts[blockId] ?? [];
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
      if (!isFreeformSlide(slide)) {
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
      }
      const image = parts[0];
      if (block.aspect !== undefined && image && block.trim === undefined) {
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
 * The round one reorder handle of a block within its slot on a grammar slide: what Cmd Up and Cmd
 * Down move through `nudgeMutation` (`block.move`, one place; SPEC 4.3). No longer drawn: the
 * chip and the frame move the object anywhere and convert the slide (SPEC-2 1.6).
 */
export function blockMoveHandle(
  slide: Slide,
  boxes: MeasuredBoxes,
  blockId: string,
): Handle | null {
  const box = boxes.blocks[blockId];
  if (!box || !locateBlock(slide, blockId)) return null;
  return {
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
  };
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

/**
 * What a canvas gesture reads beyond the slide and the boxes: the objects that move together (the
 * anchor first), the snap lines of everything they can land on (the sheet's edges and centre, the
 * GT lines, the deck's guides, the edges and centres of the resting objects), whether the 8 px grid
 * catches what no line does (View > Snap to > Grid), and the resting objects' boxes for the equal
 * spacing guides.
 */
export type FreeContext = {
  ids: string[];
  lines: SnapLine[];
  /** the 8 px grid under Snap to > Grid; off, a drag with no line near rounds to whole pixels */
  grid?: boolean;
  /** the resting objects' bounding boxes, for the equal spacing guides */
  spacing?: Box[];
};

/** What a gesture reads: the slide as it was when the drag began, the boxes measured then and the deck's page (the default when absent). */
export type GestureContext = {
  slide: Slide;
  boxes: MeasuredBoxes;
  free?: FreeContext;
  page?: PageSize;
};

/**
 * The modifier keys a canvas gesture reads on every move (SPEC-2 0.79): Shift constrains a move
 * to an axis, keeps the aspect of a resize and snaps a rotation to 15 degrees; Option resizes
 * about the centre; Cmd suppresses every snap.
 */
export type GestureMods = { shift: boolean; alt?: boolean; meta?: boolean };

function blockSet(slide: Slide, blockId: string, path: string, value?: unknown): Mutation {
  return value === undefined
    ? { op: 'block.set', slideId: slide.id, blockId, path }
    : { op: 'block.set', slideId: slide.id, blockId, path, value };
}

function slideSet(slide: Slide, path: string, value: unknown): Mutation {
  return { op: 'slide.set', slideId: slide.id, path, value };
}

/** The slot box a block sits in, for the shot snaps; the page's content box when nothing was measured. */
function slotBoxOf(slide: Slide, blockId: string, boxes: MeasuredBoxes, page?: PageSize): Box {
  const located = locateBlock(slide, blockId);
  const measured = located ? boxes.slots[located.slot] : undefined;
  if (measured) return measured;
  const content = page ? grid(page).content : CONTENT;
  return [CONTENT_ORIGIN[0], CONTENT_ORIGIN[1], content[0], content[1]];
}

/** The gap between the blocks of a stack, for the drop line; the deck's .stack gap (head:86). */
const STACK_GAP = 22;

/**
 * The slot a dragged block would land in (SPEC 6.4: across the two slots of `cols`, never out of a
 * plate; this round adds the slots of `split`): for `cols` the half of the gap the pointer is on;
 * for `split` the measured slot that contains the pointer, the head's two columns split at the
 * head's center when the layout has them; every other layout keeps the block's own slot.
 */
export function dropSlotFor(
  slide: Slide,
  from: BlockSlot,
  now: Point,
  boxes: MeasuredBoxes,
): BlockSlot {
  if (slide.kind !== 'content') return from;
  const layout = slide.layout;
  if (layout.type === 'cols') {
    const right = boxes.slots.right;
    const left = boxes.slots.left;
    if (left && right) return now.x >= right[0] - COLUMN_GAP / 2 ? 'right' : 'left';
    return from;
  }
  if (layout.type === 'split') {
    const head = boxes.slots.head ?? boxes.slots.headLeft;
    const body = boxes.slots.body;
    const twoHeads = slotsForLayout(layout).includes('headLeft');
    if (head && now.y < head[1] + head[3] + (body ? (body[1] - head[1] - head[3]) / 2 : 0)) {
      if (!twoHeads) return 'head';
      const seam = boxes.slots.headRight?.[0] ?? head[0] + head[2] / 2;
      return now.x >= seam - COLUMN_GAP / 2 ? 'headRight' : 'headLeft';
    }
    if (body) return 'body';
  }
  return from;
}

/**
 * The block.move a drag of a block's chip lands on (SPEC 6.4: up or down inside a slot, or across
 * the slots of `cols` and `split`, never out of a plate), plus the drop line the overlay draws and
 * the target slot's box it outlines. The insertion point is the first sibling whose vertical
 * center is below the pointer; the mutation is null when the block would land where it already
 * is. dropIndexFor is the pure index computation behind it.
 */
export function blockMoveFor(
  slide: Slide,
  blockId: string,
  now: Point,
  boxes: MeasuredBoxes,
): { mutation: Mutation | null; indicator: Box | null; slot: BlockSlot; slotBox: Box | null } {
  const located = locateBlock(slide, blockId);
  if (!located) return { mutation: null, indicator: null, slot: 'main', slotBox: null };
  const slot = dropSlotFor(slide, located.slot, now, boxes);
  const targetList =
    slide.kind === 'content'
      ? (slide.slots[slot as keyof typeof slide.slots] ?? [])
      : located.blocks;
  const siblings = targetList.filter((block) => block.id !== blockId);
  const slotBox = boxes.slots[slot] ?? slotBoxOf(slide, blockId, boxes);
  const drop = dropIndexFor(
    now.y,
    siblings.map((block) => block.id),
    boxes.blocks,
  );
  const after = drop.index > 0 ? siblings[drop.index - 1]?.id : undefined;
  const indicator: Box =
    drop.lineY === null
      ? [slotBox[0], slotBox[1], slotBox[2], 0]
      : [slotBox[0], drop.lineY, slotBox[2], 0];
  const currentAfter = located.index > 0 ? located.blocks[located.index - 1]?.id : undefined;
  if (slot === located.slot && after === currentAfter) {
    return { mutation: null, indicator, slot, slotBox };
  }
  const mutation: Mutation = {
    op: 'block.move',
    slideId: slide.id,
    blockId,
    slot,
    ...(after !== undefined ? { after } : {}),
  };
  return { mutation, indicator, slot, slotBox };
}

/**
 * The insertion index of a dragged block among its target siblings (the dragged block itself
 * excluded) for a pointer at `y`: the first sibling whose vertical center is below the pointer,
 * else after the last. `lineY` is where the drop line goes: half the stack gap above that sibling,
 * or below the last; null for an empty slot (the line sits at the slot's top).
 */
export function dropIndexFor(
  y: number,
  siblings: readonly string[],
  blocks: Record<string, Box>,
): { index: number; lineY: number | null } {
  for (let i = 0; i < siblings.length; i += 1) {
    const id = siblings[i];
    const box = id === undefined ? undefined : blocks[id];
    if (!box) continue;
    if (y < box[1] + box[3] / 2) return { index: i, lineY: box[1] - STACK_GAP / 2 };
  }
  const last = siblings[siblings.length - 1];
  const lastBox = last === undefined ? undefined : blocks[last];
  return {
    index: siblings.length,
    lineY: lastBox ? lastBox[1] + lastBox[3] + STACK_GAP / 2 : null,
  };
}

/**
 * The one mutation a grammar drag stands for at its current point, or null when the value has not
 * moved off its start (SPEC 6.4: each gesture ends in exactly one mutation). Called on every
 * pointer move for the live preview and once more on release for the commit; both read the slide
 * as it was when the drag began, so a preview never compounds.
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
      const slotBox = slotBoxOf(slide, blockId, boxes, ctx.page);
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
 * What a canvas gesture stands for at its current point: the `pos` writes, the guides drawn, the
 * connection sites shown while a line's end is down, and the readout (the size or the angle).
 */
export type FreeGesture = {
  mutations: Mutation[];
  guides: SnapLine[];
  /** the connection sites of the shape under a dragged line end (6 px rings) */
  sites?: Point[];
  /** the size chip while a resize is down, in sheet pixels (SPEC-2 0.86) */
  size?: { w: number; h: number };
  /** the angle chip while a rotation is down */
  angle?: number;
};

function posMutation(slide: Slide, blockId: string, pos: Position): Mutation {
  return { op: 'block.set', slideId: slide.id, blockId, path: '/pos', value: pos };
}

/** The nearest connection site of an attachable object under a point, within SITE_SNAP_PX. */
export function siteUnder(
  slide: Slide,
  point: Point,
  exclude: ReadonlyArray<string> = [],
): { blockId: string; site: number; point: Point } | null {
  let best: { blockId: string; site: number; point: Point; distance: number } | null = null;
  for (const block of freeformBlocks(slide)) {
    if (exclude.includes(block.id) || !canAttach(block) || isConnector(block)) continue;
    const near = nearestSite(block, point);
    if (near === undefined || near.distance > SITE_SNAP_PX) continue;
    if (best === null || near.distance < best.distance)
      best = { blockId: block.id, site: near.site, point: near.point, distance: near.distance };
  }
  return best;
}

/** The connection sites of the attachable object whose box holds the point, for the rings the overlay draws. */
export function sitesUnder(
  slide: Slide,
  point: Point,
  exclude: ReadonlyArray<string> = [],
): Point[] {
  for (const block of freeformBlocks(slide)) {
    if (exclude.includes(block.id) || !canAttach(block) || isConnector(block) || !block.pos)
      continue;
    const b = boundingBox(block.pos);
    const margin = SITE_SNAP_PX;
    if (
      point.x >= b.x - margin &&
      point.x <= b.x + b.w + margin &&
      point.y >= b.y - margin &&
      point.y <= b.y + b.h + margin
    ) {
      return targetSites(block);
    }
  }
  return [];
}

/**
 * The mutations that put a line's end at a point (SPEC-2 6.2, 0.103): the end snaps to a
 * connection site of the shape under it and records `connect` for that end, or drops the
 * attachment when it lands away; `pos`, `orientation` and the swapped decorations travel in the
 * same write through the schema's connectorFieldsBetween.
 */
export function lineEndMutations(
  slide: Slide,
  block: ShapeBlock,
  which: 'start' | 'end',
  to: Point,
  options: { snap?: boolean } = {},
): { mutations: Mutation[]; sites: Point[] } {
  if (block.pos === undefined) return { mutations: [], sites: [] };
  const ends = connectorEnds(block);
  const snap = options.snap ?? true;
  const site = snap ? siteUnder(slide, to, [block.id]) : null;
  const point = site ? site.point : { x: Math.round(to.x * 2) / 2, y: Math.round(to.y * 2) / 2 };
  const connect: NonNullable<ShapeBlock['connect']> = { ...(block.connect ?? {}) };
  if (site) connect[which] = { block: site.blockId, site: site.site };
  else delete connect[which];
  const normalized = Object.keys(connect).length === 0 ? undefined : connect;
  const fields = connectorFieldsBetween(
    block,
    which === 'start' ? point : ends.start,
    which === 'end' ? point : ends.end,
    normalized,
  );
  const mutations: Mutation[] = [];
  for (const [path, value] of Object.entries(fields)) {
    const current = (block as unknown as Record<string, unknown>)[path];
    if (JSON.stringify(current) === JSON.stringify(value)) continue;
    mutations.push(blockSet(slide, block.id, `/${path}`, value));
  }
  return { mutations, sites: snap ? sitesUnder(slide, to, [block.id]) : [] };
}

/**
 * The canvas gestures (SPEC-2 6.1 rows 7, 9, 11, 20): a `free-move` drag moves every selected
 * object by the same snapped offset (Shift locks the axis, Cmd suppresses the snaps); a
 * `free-resize` drag moves one or two edges of the object with the same snaps (Shift keeps the
 * aspect, Option resizes about the centre; a rotated object resizes along its own axes; a
 * selection of several scales every member about the union); a `free-rotate` drag turns the
 * object about its centre (Shift snaps to 15 degrees; several rotate about the union centre); a
 * `line-end` drag moves one end of a line onto a connection site or away from one. Every object
 * that changes gets one `block.set /pos`; the Editor commits the list as one write. Null when
 * nothing changed, so a click on a chip writes nothing. Pure; canvas.test.ts pins it.
 */
export function freeGesture(
  handle: Handle,
  ctx: GestureContext,
  start: Point,
  now: Point,
  mods: GestureMods = { shift: false },
): FreeGesture | null {
  const { slide, boxes } = ctx;
  const blockId = handle.blockId;
  if (blockId === undefined) return null;
  const anchor = posFor(slide, blockId, boxes);
  if (!anchor) return null;
  const suppress = mods.meta === true;
  const lines = suppress ? [] : (ctx.free?.lines ?? []);
  const grid = suppress ? false : (ctx.free?.grid ?? true);
  const spacing = suppress ? undefined : ctx.free?.spacing;
  const ids = ctx.free?.ids.includes(blockId) ? ctx.free.ids : [blockId];
  let dx = now.x - start.x;
  let dy = now.y - start.y;
  /* a press with no travel is a click, never a write: a snap line within reach would otherwise
     move the object on a plain click of its chip or a handle */
  if (dx === 0 && dy === 0) return null;
  if (handle.kind === 'free-move') {
    if (mods.shift) ({ dx, dy } = axisLock(dx, dy));
    const rows = placedOf(slide, ids, boxes);
    if (rows.length === 0) return null;
    /* the selection snaps by the union of its rotated bounding boxes (SPEC-2 0.107) */
    const union = unionBox(rows.map((row) => row.pos));
    const snapped = snapMove(union, dx, dy, lines, {
      grid,
      ...(spacing !== undefined ? { spacing } : {}),
    });
    const sdx = snapped.box[0] - union[0];
    const sdy = snapped.box[1] - union[1];
    if (sdx === 0 && sdy === 0) return null;
    const mutations: Mutation[] = rows.map(({ id, pos }) =>
      posMutation(slide, id, { ...pos, x: pos.x + sdx, y: pos.y + sdy }),
    );
    return { mutations, guides: snapped.guides };
  }
  if (handle.kind === 'free-resize' && handle.dir !== undefined) {
    /* the one resize model (schema/canvas.ts resizeBox through snapResize): the opposite edge
       or corner held on the sheet, Shift or a locked kind keeping the ratio, Alt about the
       centre, a rotated object's handles along its own axes (SPEC-5-amendments A4) */
    if (ids.length > 1) {
      const rows = placedOf(slide, ids, boxes);
      const union = unionBox(rows.map((row) => row.pos));
      const snapped = snapResize(union, handle.dir, dx, dy, lines, {
        aspect: mods.shift,
        alt: mods.alt === true,
        grid,
        kind: 'group',
      });
      const to = snapped.box;
      const mutations = scaleGroupMutations(slide, ids, boxes, to);
      if (mutations.length === 0) return null;
      return { mutations, guides: snapped.guides, size: { w: to[2], h: to[3] } };
    }
    const angle = normalizeRotation(anchor.rotate ?? 0);
    const snapped = snapResize(posBox(anchor), handle.dir, dx, dy, lines, {
      aspect: mods.shift,
      alt: mods.alt === true,
      grid,
      rotation: angle,
      ...(resizeKindOf(blockById(slide, blockId)) !== undefined
        ? { kind: resizeKindOf(blockById(slide, blockId)) }
        : {}),
    });
    const [x, y, w, h] = snapped.box;
    if (x === anchor.x && y === anchor.y && w === anchor.w && h === anchor.h) return null;
    return {
      mutations: [posMutation(slide, blockId, { ...anchor, x, y, w, h })],
      guides: snapped.guides,
      size: { w, h },
    };
  }
  if (handle.kind === 'free-rotate') {
    const rows = placedOf(slide, ids, boxes);
    if (rows.length === 0) return null;
    const union = unionBox(rows.map((row) => row.pos));
    const centre = { x: union[0] + union[2] / 2, y: union[1] + union[3] / 2 };
    const startAngle = rows.length === 1 ? normalizeRotation(anchor.rotate ?? 0) : 0;
    const to = rotationFromDrag(startAngle, centre, start, now, { shift: mods.shift });
    const mutations =
      rows.length === 1
        ? rotateMutations(slide, rows, { to }, 'each')
        : rotateMutations(slide, rows, { by: to }, 'selection');
    if (mutations.length === 0) return null;
    const angle = rows.length === 1 ? to : normalizeRotation(to);
    return { mutations, guides: [], angle };
  }
  if (handle.kind === 'line-end' && handle.index !== undefined) {
    const block = blockById(slide, blockId);
    if (!isLineBlock(block) || block.pos === undefined) return null;
    const ends = connectorEnds(block);
    const which = handle.index === 0 ? 'start' : 'end';
    const from = ends[which];
    if (mods.shift) ({ dx, dy } = angleLock(dx, dy));
    const to = { x: from.x + dx, y: from.y + dy };
    const result = lineEndMutations(slide, block, which, to, { snap: !suppress });
    if (result.mutations.length === 0) return { mutations: [], guides: [], sites: result.sites };
    return { mutations: result.mutations, guides: [], sites: result.sites };
  }
  return null;
}

/** Shift constrains a line's end to 45 degree steps (SPEC-2 6.2). */
export function angleLock(dx: number, dy: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { dx, dy };
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  return { dx: Math.cos(snapped) * length, dy: Math.sin(snapped) * length };
}

/**
 * One keyboard step on a focused handle (SPEC 6.4 keyboard nudges): the key edge and the plate
 * edge step through their sets, the seam through the named ratios and 10 px, a marker by one (ten
 * with Shift through `delta`), a shot edge by 10 px, a block by one position, a plate side and a
 * crop anchor flip, a pair figure swaps with its neighbour, an object moves or grows by one pixel.
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
  if (blockId === undefined) return null;
  switch (handle.kind) {
    case 'key-edge': {
      if (block?.type !== 'rows') return null;
      const next = stepInSet(ROWS_KEY_SNAP, block.key, delta);
      return next === block.key ? null : blockSet(slide, blockId, '/key', next);
    }
    case 'shot-width': {
      if (block?.type !== 'shot') return null;
      const slotBox = slotBoxOf(slide, blockId, boxes, ctx.page);
      const from = block.width ?? boxes.blocks[blockId]?.[2] ?? slotBox[2];
      const next = snapShotWidth(from + delta * 10, slotBox[2], slotBox[3]);
      if (next === slotBox[2])
        return block.width === undefined ? null : blockSet(slide, blockId, '/width');
      return next === block.width ? null : blockSet(slide, blockId, '/width', next);
    }
    case 'shot-crop': {
      if (block?.type !== 'shot') return null;
      const next = (block.crop ?? 'center') === 'center' ? 'top' : 'center';
      return blockSet(slide, blockId, '/crop', next);
    }
    case 'pair-swap': {
      if (block?.type !== 'pair' || handle.index === undefined) return null;
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
      if (block?.type !== 'scales' || handle.index === undefined) return null;
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
      if (block?.type !== 'dia') return null;
      const dx = axis === 'x' ? delta : 0;
      const dy = axis === 'y' ? -delta : 0;
      return diaMoveMutation(slide, block, handle, dx, dy);
    }
    case 'free-move': {
      // one sheet pixel per step (ten with Shift through `delta`); Up is negative y
      const pos = posFor(slide, blockId, boxes);
      if (!pos) return null;
      const dx = axis === 'x' ? delta : 0;
      const dy = axis === 'y' ? -delta : 0;
      return posMutation(slide, blockId, { ...pos, x: pos.x + dx, y: pos.y + dy });
    }
    case 'free-resize': {
      // the handle's edge moves by one pixel per step along the object's own axis: Right and Up
      // grow, Left and Down shrink; the same model as the drag (schema/canvas.ts resizeBox)
      const pos = posFor(slide, blockId, boxes);
      if (!pos || handle.dir === undefined) return null;
      const kind = resizeKindOf(block);
      const angle = normalizeRotation(pos.rotate ?? 0);
      /* the step is one pixel of the object's own width or height: it is turned into sheet
         space here and back into the object's axes by the model, so a turned object grows by
         the whole step */
      const step = rotateVector(axis === 'x' ? delta : 0, axis === 'y' ? -delta : 0, angle);
      const grown = snapResize(posBox(pos), handle.dir, step.dx, step.dy, [], {
        grid: false,
        rotation: angle,
        ...(kind !== undefined ? { kind } : {}),
      });
      const [x, y, w, h] = grown.box;
      if (x === pos.x && y === pos.y && w === pos.w && h === pos.h) return null;
      return posMutation(slide, blockId, { ...pos, x, y, w, h });
    }
    case 'free-rotate': {
      // one degree per step (fifteen with Shift through `delta`); Right and Up turn clockwise
      const pos = posFor(slide, blockId, boxes);
      if (!pos) return null;
      const [mutation] = rotateMutations(slide, [{ id: blockId, pos }], { by: delta });
      return mutation ?? null;
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
    case 'slide.replace':
    case 'text.replace':
    /* round three (gslides-parity SPEC-3 3.1; build-3/b1.md request 4): the two multiplayer text
       ops the typing path emits travel as slide.update like text.replace does */
    case 'text.splice':
    case 'text.mark':
      return {
        id: 'slide.update',
        input: { slideId: mutation.slideId, baseRevision, mutations: [mutation] },
      };
    default:
      throw new RangeError(`The stage does not emit ${mutation.op}`);
  }
}

/**
 * One action call for a list of stage mutations (a group move, an align, a nudge of several
 * objects, a Delete of a multi-selection, a conversion followed by the gesture's writes): a
 * single mutation is its own action as above; several travel as one `slide.update`, so the write
 * is one revision and one undo step. Every mutation must name the same slide.
 */
export function actionForMutations(
  mutations: ReadonlyArray<Mutation>,
  baseRevision: number,
): ActionCall {
  const [first, ...rest] = mutations;
  if (first === undefined) throw new RangeError('actionForMutations: no mutations');
  if (rest.length === 0) return actionForMutation(first, baseRevision);
  const slideId = 'slideId' in first ? first.slideId : undefined;
  if (slideId === undefined)
    throw new RangeError('actionForMutations: the first mutation names no slide');
  for (const mutation of mutations) {
    if (!('slideId' in mutation) || mutation.slideId !== slideId) {
      throw new RangeError('actionForMutations: every mutation must name the same slide');
    }
  }
  return { id: 'slide.update', input: { slideId, baseRevision, mutations: [...mutations] } };
}

// ---------------------------------------------------------------------------------------------
// The draw tools (gslides-parity SPEC-2 6.1 row 33, 6.2; R05 A1, A5, A10: a click places the
// default box, a drag draws one, Shift constrains, Option draws from the centre, the point tools
// take a click per point, Scribble samples the pointer, and a new text box opens in the caret state)

/** The toolbar's tools; the stage draws with everything but Select (the chrome's DrawTool, one kind per row). */
export type EditorTool =
  | 'select'
  | { kind: 'text' }
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'line'; line: LineKind | 'rule' }
  | { kind: 'table'; columns: number; rows: number }
  | { kind: 'chart'; chart: ChartKind }
  | { kind: 'wordArt'; text: string };

/** The default box a tool places on a click, in sheet pixels (SPEC-2 6.2; palette-data.ts DEFAULT_SIZE). */
export const TOOL_DEFAULT_SIZE: Readonly<
  Record<'text' | 'shape' | 'line' | 'table' | 'chart' | 'wordArt', [number, number]>
> = {
  text: [480, 64],
  shape: [240, 160],
  line: [320, 8],
  table: [960, 320],
  chart: [960, 540],
  wordArt: [800, 120],
};

/** A drag shorter than this on both axes counts as a click and places the default box. */
export const DRAW_MIN_PX = 8;
/** Scribble samples the pointer every 8 px and keeps at most this many points (SPEC-2 2.4.4, 6.2). */
export const SCRIBBLE_SAMPLE_PX = 8;
export const SCRIBBLE_MAX_POINTS = 64;
/** The word art insert: 88 px display weight 500 with a 1.5 px ink outline (SPEC-2 6.2). */
export const WORD_ART_SIZE = 88;

/** True for a tool whose drag draws a line (a point tool included). */
export function isLineTool(tool: EditorTool): tool is { kind: 'line'; line: LineKind | 'rule' } {
  return tool !== 'select' && tool.kind === 'line';
}

/** True for Curve and Polyline: a click per point, ended by a double click, Enter or a click on the first point. */
export function isPointTool(tool: EditorTool): boolean {
  return isLineTool(tool) && (tool.line === 'curve' || tool.line === 'polyline');
}

/** True for Scribble: the pointer is sampled while it is down. */
export function isScribbleTool(tool: EditorTool): boolean {
  return isLineTool(tool) && tool.line === 'scribble';
}

/** The block type a tool inserts. */
export function toolBlockType(tool: Exclude<EditorTool, 'select'>): BlockType {
  switch (tool.kind) {
    case 'text':
    case 'wordArt':
      return 'text';
    case 'shape':
      return 'shape';
    case 'table':
      return 'table';
    case 'chart':
      return 'chart';
    case 'line':
      return tool.line === 'rule' ? 'rule' : 'shape';
  }
}

/** The block a tool inserts under `id`: an empty text box, a shape preset, a line kind, a rule, a table, a chart or a word art text. */
export function toolBlock(tool: Exclude<EditorTool, 'select'>, id: string): Block {
  switch (tool.kind) {
    case 'text':
      return { id, type: 'text', text: '', autofit: 'grow' };
    case 'wordArt':
      return {
        id,
        type: 'text',
        text: tool.text,
        typography: { size: WORD_ART_SIZE, weight: 500, align: 'center' },
        outline: { color: 'ink', width: 1.5 },
      } as Block;
    case 'shape':
      return { id, type: 'shape', shape: tool.shape };
    case 'table':
      return emptyTable(id, tool.columns, tool.rows);
    case 'chart':
      return emptyChart(id, tool.chart);
    case 'line':
      if (tool.line === 'rule') return { id, type: 'rule', orientation: 'horizontal' };
      return { id, type: 'shape', shape: tool.line };
  }
}

/** The box a draw drag stands for, or the default box at the press when the drag was a click. */
export function drawnBox(
  tool: Exclude<EditorTool, 'select'>,
  start: Point,
  now: Point,
  mods: { shift?: boolean; alt?: boolean } = {},
): { box: Box; dragged: boolean } {
  let dx = now.x - start.x;
  let dy = now.y - start.y;
  const dragged = Math.abs(dx) >= DRAW_MIN_PX || Math.abs(dy) >= DRAW_MIN_PX;
  if (!dragged) {
    const [w, h] = TOOL_DEFAULT_SIZE[tool.kind];
    return { box: [start.x, start.y, w, h], dragged: false };
  }
  if (mods.shift === true) {
    if (isLineTool(tool)) ({ dx, dy } = angleLock(dx, dy));
    else {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * side;
      dy = Math.sign(dy || 1) * side;
    }
  }
  if (mods.alt === true) {
    return {
      box: [start.x - Math.abs(dx), start.y - Math.abs(dy), Math.abs(dx) * 2, Math.abs(dy) * 2],
      dragged: true,
    };
  }
  return {
    box: [
      Math.min(start.x, start.x + dx),
      Math.min(start.y, start.y + dy),
      Math.abs(dx),
      Math.abs(dy),
    ],
    dragged: true,
  };
}

/** The 8 px grid position of a drawn box, with a 1 px floor on both sides. */
export function drawnPosition(box: Box, z: number, grid = true): Position {
  const step = grid ? 8 : 1;
  const round = (v: number) => Math.round(v / step) * step;
  return {
    x: round(box[0]),
    y: round(box[1]),
    w: Math.max(step, round(box[2])),
    h: Math.max(step, round(box[3])),
    z,
  };
}

/** The orientation of a drawn line from its start and end (a diagonal keeps the direction of the drag). */
export function drawnLineOrientation(
  start: Point,
  end: Point,
): 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up' {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) < DRAW_MIN_PX) return 'horizontal';
  if (Math.abs(dx) < DRAW_MIN_PX) return 'vertical';
  return dx * dy > 0 ? 'diagonal-down' : 'diagonal-up';
}

/**
 * The pointer samples of a scribble or the clicks of a point tool as a path block's box and
 * `points` (fractions of the box, SPEC-2 2.4.3): the box spans the points with a 1 px floor, the
 * points are rounded to three places, and a scribble is thinned to at most SCRIBBLE_MAX_POINTS.
 */
export function pathFromPoints(
  points: ReadonlyArray<Point>,
): { box: Box; points: [number, number][] } | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x);
  const h = Math.max(1, Math.max(...ys) - y);
  const fractions = points.map((p): [number, number] => [
    Math.round(((p.x - x) / w) * 1000) / 1000,
    Math.round(((p.y - y) / h) * 1000) / 1000,
  ]);
  return { box: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)], points: fractions };
}

/** Every nth sample so a scribble keeps at most `max` points, the first and last always kept. */
export function simplifyPoints(points: ReadonlyArray<Point>, max = SCRIBBLE_MAX_POINTS): Point[] {
  if (points.length <= max) return [...points];
  const out: Point[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    const at = Math.round(i * step);
    const point = points[Math.min(points.length - 1, at)];
    if (point) out.push(point);
  }
  return out;
}

/**
 * The one `block.insert` a draw tool ends in: on a canvas the block takes the drawn box as `pos`
 * on top of the stack (a line takes the drag's orientation, a path tool its points); on a grammar
 * slide the box is the layout's and the block lands in the slot after the selected block (the slot
 * the caller names). The Editor converts a slide that is not a canvas first (SPEC-2 1.6), so the
 * grammar branch serves an insert that asked for a slot. Null when the slide has no slot.
 */
export function toolInsertMutation(
  slide: Slide,
  tool: Exclude<EditorTool, 'select'>,
  id: string,
  box: Box,
  slot: BlockSlot | null,
  after?: string,
  options: {
    grid?: boolean;
    points?: [number, number][];
    orientation?: ShapeBlock['orientation'];
  } = {},
): Mutation | null {
  let block = toolBlock(tool, id);
  if (block.type === 'shape' && isLineKind(block.shape)) {
    if (isPathKind(block.shape) && options.points !== undefined)
      block = { ...block, points: options.points } as Block;
    else if (options.orientation !== undefined)
      block = { ...block, orientation: options.orientation } as Block;
  }
  if (isFreeformSlide(slide)) {
    const stack = slide.slots.main ?? [];
    const maxZ = Math.max(0, ...stack.map((b) => b.pos?.z ?? 0));
    const last = stack[stack.length - 1]?.id;
    return {
      op: 'block.insert',
      slideId: slide.id,
      slot: 'main',
      ...(last !== undefined ? { after: last } : {}),
      block: { ...block, pos: drawnPosition(box, maxZ + 1, options.grid ?? true) },
    };
  }
  if (slot === null) return null;
  return {
    op: 'block.insert',
    slideId: slide.id,
    slot,
    ...(after !== undefined ? { after } : {}),
    block,
  };
}

/** The default box of a block inserted without a click: centred on the page at the tool's default size (SPEC-2 6.2). */
export function centredBox(size: readonly [number, number], page: PageSize = SHEET): Box {
  return [
    Math.round((page.width - size[0]) / 2),
    Math.round((page.height - size[1]) / 2),
    size[0],
    size[1],
  ];
}

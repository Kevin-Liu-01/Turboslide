// The canvas on the stage (gslides-parity SPEC-2 section 1; Kevin's directive of 2026-09-12:
// "we must, must must be able to drag and move around ANYTHING, including backgrounds and shaders
// but all text in the same exact way the google slides is like a canvas"): a content slide whose
// layout is `{ type: 'freeform' }` carries its objects in the `main` slot, each with `pos`
// (schema/position.ts: x, y, w, h in sheet pixels on the 1600 by 900 sheet, z for the stacking
// order, rotate, flip and the group tag). The renderer places every object in a `.free[data-free]`
// wrapper at its box (render/slide.ts renderFreeform), so the stage measures that wrapper as the
// object's box. Every other slide kind is a canvas too: its top level blocks, a title's mark,
// heading and lead, a statement's big line, a picture kind's photograph, plate and plate blocks
// are objects the stage measures under the same ids the conversion gives them, and the first
// canvas gesture converts the slide losslessly through `toCanvas` (@turboslide/schema/canvas)
// over the boxes `canvas-measure.ts` reads from a hidden 1x sheet (SPEC-2 1.2, 1.3).
//
// This module is the stage's side of the feature over the schema's arithmetic
// (@turboslide/schema/freeform: the guides, alignPositions, distributePositions, reorderZ,
// sortByZ, scalePositions; @turboslide/schema/canvas: toCanvas, fromCanvas), so a drag, the
// inspector, the CLI's block.align, block.distribute and block.order and the linter agree on where
// a box lands. Everything here returns mutations the action table already has (`block.set /pos`,
// `block.set /pos/z`, `slide.replace`); the Editor commits a list as one write. Pure over boxes
// except the two DOM measures; freeform.test.ts and canvas.test.ts pin it.
import type { Block, BlockType } from '@turboslide/schema/blocks';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { fromCanvas, grammarRecordOf, toCanvas } from '@turboslide/schema/canvas';
import type { ContentSlide, GrammarRecord, Layout, Slide, SlotName } from '@turboslide/schema/deck';
import {
  alignPositions,
  boundingBox,
  columnWidths,
  COLS_GAP,
  convertLayout,
  distributePositions,
  positionBox,
  readingOrder,
  reorderZ,
  scalePositions,
  sortByZ,
  unionBox,
} from '@turboslide/schema/freeform';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import type { Box } from '@turboslide/schema/render';
import { CONTENT, CONTENT_ORIGIN, SHEET } from '@turboslide/theme/tokens';

import { CANVAS_SELECTORS, canvasBoxesFromMeasured, virtualObjectIds } from './canvas-measure';
import type { MeasuredBoxes } from './Gestures';
import { PART_SELECTORS } from './Gestures';
import { NAMED_RATIOS } from './snap';

/** A content slide on the freeform layout: a canvas (SPEC-2 1.1). */
export type FreeformSlide = ContentSlide & { layout: { type: 'freeform' } };

/** The one slot a freeform slide fills (deck.ts slotsForLayout). */
export const FREEFORM_SLOT: SlotName = 'main';
/**
 * The `ext` key the editor depth round kept the grammar record under; the record is the first
 * class field `SlideBase.grammar` since SPEC-2 0.99 and `grammarRecordOf` reads the legacy key
 * once. Kept for the route's layout switch until the integrator moves it to `grammarRecordOf`.
 */
export const GRAMMAR_EXT_KEY = 'grammar';

export type { GrammarRecord };

export function isFreeformSlide(slide: Slide | undefined): slide is FreeformSlide {
  return slide !== undefined && slide.kind === 'content' && slide.layout.type === 'freeform';
}

/** The `pos` of a block, or null for a block that has none (a block of a grammar slide). */
export function posOf(block: Block): Position | null {
  return block.pos ?? null;
}

/** A position as a box. */
export function posBox(pos: Position): Box {
  return positionBox(pos);
}

function boxPos(box: Box, z?: number): Position {
  const pos: Position = {
    x: Math.round(box[0]),
    y: Math.round(box[1]),
    w: Math.max(1, Math.round(box[2])),
    h: Math.max(1, Math.round(box[3])),
  };
  if (z !== undefined) pos.z = z;
  return pos;
}

/** The blocks of a freeform slide in document order; empty for any other slide. */
export function freeformBlocks(slide: Slide): Block[] {
  return isFreeformSlide(slide) ? (slide.slots[FREEFORM_SLOT] ?? []) : [];
}

/** The blocks of a freeform slide in paint order: z ascending, document order breaking ties. */
export function paintOrder(slide: Slide): Block[] {
  return sortByZ(freeformBlocks(slide));
}

/**
 * The box a canvas gesture starts from: the object's `pos`, else its measured box (an object of
 * a slide nothing converted yet, or a document in transit).
 */
export function posFor(slide: Slide, blockId: string, boxes: MeasuredBoxes): Position | null {
  const block = freeformBlocks(slide).find((candidate) => candidate.id === blockId);
  const own = block ? posOf(block) : null;
  if (own) return own;
  const measured = boxes.blocks[blockId];
  return measured ? boxPos(measured) : null;
}

/** The union of the boxes of the named blocks, or null when none is known. */
export function groupBox(ids: readonly string[], boxes: MeasuredBoxes): Box | null {
  let out: Box | null = null;
  for (const id of ids) {
    const box = boxes.blocks[id];
    if (!box) continue;
    if (out === null) {
      out = [...box];
      continue;
    }
    const x = Math.min(out[0], box[0]);
    const y = Math.min(out[1], box[1]);
    const r = Math.max(out[0] + out[2], box[0] + box[2]);
    const b = Math.max(out[1] + out[3], box[1] + box[3]);
    out = [x, y, r - x, b - y];
  }
  return out;
}

function posSet(slide: Slide, blockId: string, pos: Position): Mutation {
  return { op: 'block.set', slideId: slide.id, blockId, path: '/pos', value: pos };
}

// ---------------------------------------------------------------------------------------------
// Objects (SPEC-2 1.1: every top level block of every slide kind, and the kinds' elements)

/**
 * The ids of a slide's objects in the order Tab and a marquee walk them (SPEC-2 0.83): paint
 * order on a canvas; document order of the rendered slide on any other kind, where the kinds'
 * elements without a block (the title's mark, a picture kind's photograph, plate and mark) join
 * under the ids the conversion gives them, the photograph first as the bottom of the stack.
 */
export function objectIds(
  slide: Slide,
  boxes: MeasuredBoxes,
  rendered: readonly string[],
): string[] {
  if (isFreeformSlide(slide)) return paintOrder(slide).map((block) => block.id);
  const virtual = virtualObjectIds(slide);
  const out: string[] = [];
  if (virtual.has('picture') && boxes.blocks['picture']) out.push('picture');
  if (virtual.has('plate') && boxes.blocks['plate']) out.push('plate');
  if (slide.kind === 'title' && virtual.has('mark') && boxes.blocks['mark']) out.push('mark');
  for (const id of rendered) if (!out.includes(id)) out.push(id);
  if (
    slide.kind === 'closing' &&
    virtual.has('mark') &&
    boxes.blocks['mark'] &&
    !out.includes('mark')
  )
    out.splice(out.indexOf('plate') + 1, 0, 'mark');
  return out;
}

/** True when the id names an object on the slide: a block, or one of the kind's virtual objects the stage measured. */
export function isObjectId(slide: Slide, boxes: MeasuredBoxes, id: string): boolean {
  if (freeformBlocks(slide).some((block) => block.id === id)) return true;
  if (slide.kind === 'content') {
    return Object.values(slide.slots).some((list) => list?.some((block) => block.id === id));
  }
  if (slide.kind === 'title')
    return id === 'heading' || id === 'lead' || (id === 'mark' && id in boxes.blocks);
  if (slide.kind === 'statement') return id === 'big';
  if (slide.plate.blocks.some((block) => block.id === id)) return true;
  return virtualObjectIds(slide).has(id as 'picture' | 'plate' | 'mark') && id in boxes.blocks;
}

// ---------------------------------------------------------------------------------------------
// Groups (SPEC-2 2.1.3, 6.1 row 14)

/** The group tag an object carries, or null. */
export function groupTagOf(slide: Slide, blockId: string): string | null {
  const block = freeformBlocks(slide).find((candidate) => candidate.id === blockId);
  return block?.pos?.group ?? null;
}

/** The members of a group in document order. */
export function groupMembers(slide: Slide, tag: string): string[] {
  return freeformBlocks(slide)
    .filter((block) => block.pos?.group === tag)
    .map((block) => block.id);
}

/**
 * A selection widened to whole groups (SPEC-2 6.1 row 14: a click on a member selects the group):
 * every member of every group one of `ids` belongs to joins, in the order met, the anchor first.
 */
export function expandGroups(slide: Slide, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
    const tag = groupTagOf(slide, id);
    if (tag === null) continue;
    for (const member of groupMembers(slide, tag)) if (!out.includes(member)) out.push(member);
  }
  return out;
}

/** The one group tag every one of `ids` shares, or null (a mixed or an ungrouped selection). */
export function sharedGroup(slide: Slide, ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  const first = ids[0];
  const tag = first === undefined ? null : groupTagOf(slide, first);
  if (tag === null) return null;
  return ids.every((id) => groupTagOf(slide, id) === tag) ? tag : null;
}

/** A group tag no object of the slide carries: `group`, then `group-2` (store-actions.ts blockGroup names them the same way). */
export function freshGroupTag(slide: Slide, base = 'group'): string {
  const taken = new Set(
    freeformBlocks(slide).flatMap((block) => (block.pos?.group ? [block.pos.group] : [])),
  );
  let tag = base;
  let n = 2;
  while (taken.has(tag)) {
    tag = `${base}-${n}`;
    n += 1;
  }
  return tag;
}

/** The `block.set /pos/group` mutations of a group over the named objects (what block.group writes). */
export function groupMutations(slide: Slide, ids: readonly string[], tag: string): Mutation[] {
  return freeformBlocks(slide).flatMap((block): Mutation[] => {
    if (!ids.includes(block.id) || block.pos === undefined || block.pos.group === tag) return [];
    return [
      { op: 'block.set', slideId: slide.id, blockId: block.id, path: '/pos/group', value: tag },
    ];
  });
}

/** The mutations that drop the group tag of the named objects (what block.ungroup writes). */
export function ungroupMutations(slide: Slide, ids: readonly string[]): Mutation[] {
  return freeformBlocks(slide).flatMap((block): Mutation[] => {
    if (!ids.includes(block.id) || block.pos?.group === undefined) return [];
    return [{ op: 'block.set', slideId: slide.id, blockId: block.id, path: '/pos/group' }];
  });
}

// ---------------------------------------------------------------------------------------------
// Measuring

/** Boxes are compared after rounding to a hundredth of a pixel, so a re-measure with the same layout re-renders nothing. */
function roundBox(box: Box): Box {
  return box.map((v) => Math.round(v * 100) / 100) as unknown as Box;
}

/**
 * Every box the gestures and the overlay read, in sheet pixels (SPEC 6.4: rect / k), from a
 * rendered slide body whose parent is the 1600 wide stage: the blocks, the slots, the runs and the
 * parts PART_SELECTORS name. A block the renderer wrapped in `.free[data-free]` (a positioned
 * block) is measured by that wrapper, which is its `pos`. The kinds' elements that are objects
 * without a block (SPEC-2 1.1) are measured under the ids the conversion gives them (`picture`,
 * `plate`, `mark`; canvas-measure.ts CANVAS_SELECTORS) unless a block of that id exists, and the
 * ids whose element holds a prompt are listed in `prompted`. Null before the stage has a size.
 */
export function measureBoxes(body: HTMLElement): MeasuredBoxes | null {
  const stage = body.parentElement;
  if (!stage) return null;
  const k = stage.getBoundingClientRect().width / SHEET.width;
  if (!(k > 0)) return null;
  /* the origin is the body's own box, not the stage's: the sheet's slide change animates the body
     from translateY(6px) (Sheet.css pt-slide-up) and the layout effect measures on its first
     frame, so a box read against the stage sat 6 px low until the next edit, the ring and the chip
     with it while the handles stood at pos, and a press on the nw handle hit the chip and moved
     the object (build-4/hotfix-3.md cause R7); the body's translate moves every child with it, so
     a box against the body is the layout position at any frame */
  const rect = body.getBoundingClientRect();
  const toBox = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return roundBox([(r.left - rect.left) / k, (r.top - rect.top) / k, r.width / k, r.height / k]);
  };
  const next: MeasuredBoxes = { blocks: {}, slots: {}, runs: {}, parts: {}, prompted: [] };
  body.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    const id = el.dataset['block'];
    if (!id || id in next.blocks) return;
    const wrapper = el.parentElement?.closest<HTMLElement>('.free[data-free]');
    next.blocks[id] = toBox(wrapper && wrapper.dataset['free'] === id ? wrapper : el);
    if (el.querySelector(CANVAS_SELECTORS.prompt) !== null) next.prompted?.push(id);
    const selector = PART_SELECTORS[el.dataset['type'] as BlockType];
    if (selector) next.parts[id] = Array.from(el.querySelectorAll(selector), toBox);
  });
  /* a positioned block whose renderer draws nothing yet (the picture and chart blocks until B2
     lands them) still has its wrapper, which is its pos: the object stays selectable */
  body.querySelectorAll<HTMLElement>('.free[data-free]').forEach((el) => {
    const id = el.dataset['free'];
    if (id && !(id in next.blocks)) next.blocks[id] = toBox(el);
  });
  body.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
    const slot = el.dataset['slot'] as BlockSlot | undefined;
    if (slot && !(slot in next.slots)) next.slots[slot] = toBox(el);
  });
  body.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
    const run = el.dataset['run'];
    if (run && !(run in next.runs)) next.runs[run] = toBox(el);
  });
  /* the kinds' objects without a block, under the conversion's ids (SPEC-2 1.2) */
  const kind = body.querySelector('.slide')?.getAttribute('data-kind');
  if (kind === 'opener' || kind === 'mood' || kind === 'closing') {
    const picture = body.querySelector(CANVAS_SELECTORS.picture);
    const plate = body.querySelector(CANVAS_SELECTORS.plate);
    const mark = body.querySelector(CANVAS_SELECTORS.closingMark);
    if (picture && !('picture' in next.blocks)) next.blocks['picture'] = toBox(picture);
    if (plate && !('plate' in next.blocks)) next.blocks['plate'] = toBox(plate);
    if (mark && !('mark' in next.blocks)) next.blocks['mark'] = toBox(mark);
  } else if (kind === 'title') {
    const mark = body.querySelector(CANVAS_SELECTORS.titleMark);
    if (mark && !('mark' in next.blocks)) next.blocks['mark'] = toBox(mark);
  }
  return next;
}

/**
 * The boxes of the slide the stage Editor shows, measured from the page, for a caller outside the
 * Editor (the inspector's layout switch can read the rendered boxes this way). Null when no
 * editor stage is mounted. The query names the stage wrapper (Editor.tsx `ts-stagewrap ts-editor`),
 * not the route's `.ts-editor` root: in thumbnail density the sidebar's live clones are `.pt-slide`
 * elements under that root too, and the first of them in DOM order is another slide (measured
 * 2026-09-11 on the dev server, where the switch would have read a clone's boxes).
 */
export function readStageBoxes(root: ParentNode = document): MeasuredBoxes | null {
  const body = root.querySelector<HTMLElement>('.ts-stagewrap.ts-editor .pt-slide');
  return body ? measureBoxes(body) : null;
}

// ---------------------------------------------------------------------------------------------
// Conversion (SPEC-2 1.2)

function isCanvasBoxes(boxes: MeasuredBoxes | CanvasBoxes): boxes is CanvasBoxes {
  return !('slots' in boxes);
}

/**
 * A slide as a canvas (SPEC-2 1.2): every object of every kind gets its box as `pos` and its
 * paint index as `z`; the kind becomes `content` on the freeform layout, `template` keeps the
 * layout identity and `grammar` records what the slide was so the switch back is lossless while
 * nothing moved. The boxes are the conversion's own (`measureForCanvas`, the hidden 1x sheet) or
 * the stage's, mapped through `canvasBoxesFromMeasured` for the preview a gesture shows before the
 * hidden sheet has measured. Null for a slide that is a canvas already.
 */
export function toFreeform(
  slide: Slide,
  boxes: MeasuredBoxes | CanvasBoxes,
): { slide: FreeformSlide; unplaced: string[]; record: GrammarRecord } | null {
  const canvasBoxes = isCanvasBoxes(boxes) ? boxes : canvasBoxesFromMeasured(boxes, slide);
  const converted = toCanvas(slide, canvasBoxes);
  if (converted === null) return null;
  return {
    slide: converted.slide as FreeformSlide,
    unplaced: converted.unplaced,
    record: converted.record,
  };
}

/** The `slide.replace` of a conversion, the first mutation of a canvas write on a slide that is not a canvas (SPEC-2 1.6). */
export function conversionMutation(
  slide: Slide,
  boxes: MeasuredBoxes | CanvasBoxes,
): Mutation | null {
  const converted = toFreeform(slide, boxes);
  return converted ? { op: 'slide.replace', slideId: slide.id, slide: converted.slide } : null;
}

function samePlace(a: Position, b: Position, tolerance: number): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.w - b.w) <= tolerance &&
    Math.abs(a.h - b.h) <= tolerance
  );
}

export type GrammarFit =
  | { lossless: true; layout: Layout; slots: Partial<Record<SlotName, string[]>> }
  | { lossless: false; layout: Layout; reason: string };

/**
 * Whether a freeform slide's positions still fit a grammar layout, and which (what the switch
 * back restores; the lint's `layout/freeform` evidence): the recorded grammar when every block is
 * where the switch put it, within 1 px; else one column at the content's left edge reads as a
 * `stack`, two columns on a named ratio's seam as `cols`; anything else is not lossless and the
 * blocks refile into a `stack` by geometry with the reason. A record of a fixed kind (a converted
 * title, statement or picture kind) names no content layout: `fromCanvas` handles those.
 */
export function grammarFit(slide: Slide): GrammarFit | null {
  if (!isFreeformSlide(slide)) return null;
  const blocks = freeformBlocks(slide);
  const record = grammarRecordOf(slide);
  if (record && record.layout !== undefined && record.slots !== undefined) {
    const ids = new Set(blocks.map((block) => block.id));
    const recorded = Object.values(record.slots).flat();
    const sameSet = recorded.length === ids.size && recorded.every((id) => ids.has(id));
    const unmoved = blocks.every((block) => {
      const pos = posOf(block);
      const was = record.boxes[block.id];
      return pos !== null && was !== undefined && samePlace(pos, was, 1);
    });
    if (sameSet && unmoved) {
      const { plate: _plate, ...slots } = record.slots;
      return { lossless: true, layout: record.layout, slots };
    }
  }
  const reading = readingOrder(slide).map(({ block }) => block);
  const placed = reading.map((block) => ({ block, pos: posOf(block) }));
  if (placed.some(({ pos }) => pos === null)) {
    return { lossless: false, layout: { type: 'stack' }, reason: 'a block has no position' };
  }
  const oneColumn = placed.every(({ pos }) => Math.abs((pos?.x ?? 0) - CONTENT_ORIGIN[0]) <= 1);
  if (oneColumn) {
    return {
      lossless: true,
      layout: { type: 'stack' },
      slots: { main: reading.map((block) => block.id) },
    };
  }
  for (const ratio of NAMED_RATIOS) {
    const [leftWidth] = columnWidths(ratio, COLS_GAP);
    const rightX = CONTENT_ORIGIN[0] + leftWidth + COLS_GAP;
    const left: string[] = [];
    const right: string[] = [];
    let fits = true;
    for (const { block, pos } of placed) {
      if (!pos) continue;
      if (Math.abs(pos.x - CONTENT_ORIGIN[0]) <= 1) left.push(block.id);
      else if (Math.abs(pos.x - rightX) <= 1) right.push(block.id);
      else fits = false;
    }
    if (fits && left.length > 0 && right.length > 0) {
      return {
        lossless: true,
        layout: { type: 'cols', ratio, gap: COLS_GAP, align: 'start' },
        slots: { left, right },
      };
    }
  }
  return {
    lossless: false,
    layout: { type: 'stack' },
    reason: 'the positions match no grammar layout; the blocks refile in reading order',
  };
}

function stripPos(block: Block): Block {
  if (block.pos === undefined) return block;
  const { pos: _pos, ...rest } = block;
  return rest;
}

/**
 * A canvas slide back as the slide it was (SPEC-2 1.2, `fromCanvas`): the recorded kind with its
 * fields while nothing moved, else the content refiled by geometry with the reason. A freeform
 * slide without a record (drawn from scratch) reads its grammar from its positions (`grammarFit`):
 * one column is a stack, two columns on a named seam are cols, anything else refiles into a stack.
 * Null for a slide that is not a canvas.
 */
export function toGrammar(
  slide: Slide,
): { slide: Slide; lossless: boolean; reason?: string } | null {
  if (!isFreeformSlide(slide)) return null;
  const restored = fromCanvas(slide);
  if (restored !== null) {
    return restored.lossless
      ? { slide: restored.slide, lossless: true }
      : { slide: restored.slide, lossless: false, reason: restored.reason };
  }
  const fit = grammarFit(slide);
  if (!fit) return null;
  const { ext: oldExt, grammar: _grammar, ...rest } = slide;
  const ext = { ...oldExt };
  delete ext[GRAMMAR_EXT_KEY];
  const withExt = (next: ContentSlide): ContentSlide => {
    const { ext: _dropped, ...bare } = next;
    return Object.keys(ext).length > 0 ? { ...bare, ext } : bare;
  };
  if (!fit.lossless) {
    const converted = convertLayout(
      { ...rest, layout: slide.layout, slots: slide.slots },
      fit.layout,
    );
    return { slide: withExt(converted), lossless: false, reason: fit.reason };
  }
  const byId = new Map(freeformBlocks(slide).map((block) => [block.id, block]));
  const slots: Partial<Record<SlotName, Block[]>> = {};
  for (const [slot, ids] of Object.entries(fit.slots) as [SlotName, string[]][]) {
    slots[slot] = ids.flatMap((id) => {
      const block = byId.get(id);
      return block ? [stripPos(block)] : [];
    });
  }
  return { slide: withExt({ ...rest, layout: fit.layout, slots }), lossless: true };
}

/**
 * The one write of a layout switch from the stage: a `slide.replace` with the converted slide, to
 * the canvas from the boxes or back to the grammar. Null when the slide is already in the target
 * form. The CLI's slide.setLayout is the same write from the measured conversion (SPEC-2 1.6).
 */
export function layoutSwitchMutation(
  slide: Slide,
  boxes: MeasuredBoxes | CanvasBoxes,
  target: 'freeform' | 'grammar',
): Mutation | null {
  if (target === 'freeform') return conversionMutation(slide, boxes);
  const converted = toGrammar(slide);
  return converted ? { op: 'slide.replace', slideId: slide.id, slide: converted.slide } : null;
}

// ---------------------------------------------------------------------------------------------
// Arrange (the stage's side of block.align, block.distribute and block.order)

/** The positions of the named blocks that have one, in the given order. */
export function placedOf(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
): { id: string; pos: Position }[] {
  return ids.flatMap((id) => {
    const pos = posFor(slide, id, boxes);
    return pos ? [{ id, pos }] : [];
  });
}

/** One `block.set /pos` per block whose box changed. */
function positionMutations(
  slide: Slide,
  rows: readonly { id: string; pos: Position }[],
  next: readonly Position[],
): Mutation[] {
  return rows.flatMap((row, index) => {
    const pos = next[index];
    if (pos === undefined || jsonEqual(pos, row.pos)) return [];
    return [posSet(slide, row.id, pos)];
  });
}

/** The `pos` mutations that move the selected blocks by (dx, dy); none when nothing moves. */
export function freeNudgeMutations(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
  dx: number,
  dy: number,
): Mutation[] {
  if (dx === 0 && dy === 0) return [];
  return placedOf(slide, ids, boxes).map(({ id, pos }) =>
    posSet(slide, id, { ...pos, x: pos.x + dx, y: pos.y + dy }),
  );
}

/**
 * Align the selected blocks on one edge or center (schema alignPositions, as block.align writes
 * it): against their union for several blocks, the sheet for one (SPEC-2 0.80), or the box `to`
 * names; a rotated object aligns by its bounding box (0.107). The shared line is the extreme
 * object's own edge, never snapped to the guides or the grid: Google's Align > Top lands every
 * top on the topmost object's top, and a snap moved the reference object itself (docs/FOCUS.md
 * rank 14; audit-arrange rows 23 and 25, tops 150, 240, 500 landing on 152). Only the blocks that
 * move get a mutation.
 */
export function alignMutations(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
  edge: AlignEdge,
  to?: AlignTarget,
): Mutation[] {
  const rows = placedOf(slide, ids, boxes);
  if (rows.length === 0) return [];
  const next = alignPositions(
    rows.map((row) => row.pos),
    edge,
    to,
    false,
  );
  return positionMutations(slide, rows, next);
}

/**
 * Equal spacing along one axis (schema distributePositions, as block.distribute writes it): the
 * first and last blocks by their leading edge hold and the ones between take equal gaps. Fewer
 * than three blocks move nothing.
 */
export function distributeMutations(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
  axis: DistributeAxis,
): Mutation[] {
  const rows = placedOf(slide, ids, boxes);
  if (rows.length < 3) return [];
  const next = distributePositions(
    rows.map((row) => row.pos),
    axis,
  );
  return positionMutations(slide, rows, next);
}

/**
 * One step through the stack (schema reorderZ, as block.order writes it): the stack is renumbered
 * densely in paint order and every block whose z changed gets one `block.set /pos/z`, so the
 * write is what the CLI's `turboslide block order` writes. Empty at the end of the stack.
 */
export function zOrderMutations(slide: Slide, blockId: string, move: OrderMove): Mutation[] {
  const blocks = freeformBlocks(slide);
  if (!blocks.some((block) => block.id === blockId)) return [];
  const stack = reorderZ(
    blocks.map((block) => ({ id: block.id, pos: block.pos })),
    blockId,
    move,
  );
  return blocks.flatMap((block): Mutation[] => {
    const z = stack[block.id];
    if (z === undefined || z === block.pos?.z) return [];
    return [{ op: 'block.set', slideId: slide.id, blockId: block.id, path: '/pos/z', value: z }];
  });
}

/**
 * A group's resize (SPEC-2 0.102): every member's box scales by the union's x and y factors about
 * the union's origin into `to`, typography and each member's rotation untouched; one `block.set
 * /pos` per member whose box changed. The union reads the rotated bounding boxes (0.107).
 */
export function scaleGroupMutations(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
  to: Box,
): Mutation[] {
  const rows = placedOf(slide, ids, boxes);
  if (rows.length === 0) return [];
  const next = scalePositions(
    rows.map((row) => row.pos),
    to,
  ).map((pos) => ({
    ...pos,
    x: Math.round(pos.x * 2) / 2,
    y: Math.round(pos.y * 2) / 2,
    w: Math.max(1, Math.round(pos.w * 2) / 2),
    h: Math.max(1, Math.round(pos.h * 2) / 2),
  }));
  return positionMutations(slide, rows, next);
}

/** The union of the rotated bounding boxes of the named blocks' positions (the overlay's union ring, 0.107). */
export function selectionUnion(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
): Box | null {
  const rows = placedOf(slide, ids, boxes);
  if (rows.length === 0) return groupBox(ids, boxes);
  return unionBox(rows.map((row) => row.pos));
}

/** The axis aligned bounding box of an object's position as a box (0.107). */
export function boundingBoxOf(pos: Position): Box {
  const b = boundingBox(pos);
  return [b.x, b.y, b.w, b.h];
}

/** The content box, for callers that place a default object inside it. */
export const CONTENT_BOX_SHEET: Box = [
  CONTENT_ORIGIN[0],
  CONTENT_ORIGIN[1],
  CONTENT[0],
  CONTENT[1],
];

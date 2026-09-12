// The freeform layout on the stage (Kevin's direction of 2026-09-11, taken over SPEC 6.4's
// no-coordinates rule; docs/freeform.md): a content slide whose layout is `{ type: 'freeform' }`
// carries its blocks in the `main` slot, each with `pos` (schema/position.ts: x, y, w, h in sheet
// pixels on the 1600 by 900 sheet, z for the stacking order; higher draws later, document order
// breaks ties). The renderer places every block in a `.free[data-free]` wrapper at its box
// (render/slide.ts renderFreeform), so the stage measures that wrapper as the block's box.
//
// This module is the stage's side of the feature over the schema's arithmetic
// (@turboslide/schema/freeform: the guides, alignPositions, distributePositions, reorderZ,
// sortByZ, convertLayout), so a drag, the inspector, the CLI's block.align, block.distribute and
// block.order and the linter agree on where a box lands. Everything here returns mutations the
// action table already has (`block.set /pos`, `block.set /pos/z`, `slide.replace`); the Editor
// commits a list as one write. The conversion to freeform reads the rendered boxes so the slide
// looks the same after the switch (convertLayout, which the CLI's slide.setLayout runs without a
// browser, splits the slot boxes evenly instead); the switch back is lossless while every block
// still sits where the switch put it, else the blocks refile by geometry and the caller says so.
// Pure over boxes except the two DOM measures; freeform.test.ts pins it.
import type { Block, BlockType } from '@turboslide/schema/blocks';
import type { ContentSlide, Layout, Slide, SlotName } from '@turboslide/schema/deck';
import { slotsForLayout } from '@turboslide/schema/deck';
import {
  alignPositions,
  columnWidths,
  COLS_GAP,
  convertLayout,
  distributePositions,
  positionBox,
  readingOrder,
  reorderZ,
  sortByZ,
} from '@turboslide/schema/freeform';
import type { AlignEdge, DistributeAxis, OrderMove } from '@turboslide/schema/freeform';
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import type { Box } from '@turboslide/schema/render';
import { CONTENT, CONTENT_ORIGIN, SHEET } from '@turboslide/theme/tokens';

import type { MeasuredBoxes } from './Gestures';
import { PART_SELECTORS } from './Gestures';
import { NAMED_RATIOS } from './snap';

/** A content slide on the freeform layout. */
export type FreeformSlide = ContentSlide & { layout: { type: 'freeform' } };

/** The one slot a freeform slide fills (deck.ts slotsForLayout). */
export const FREEFORM_SLOT: SlotName = 'main';
/** The `ext` key that keeps the grammar layout a slide had before the stage switched it to freeform. */
export const GRAMMAR_EXT_KEY = 'grammar';

/** What `toFreeform` records under `ext.grammar` so `toGrammar` can be lossless. */
export type GrammarRecord = {
  layout: Layout;
  /** slot name to block ids, in slot order */
  slots: Partial<Record<SlotName, string[]>>;
  /** the box each block got at the switch, by id */
  boxes: Record<string, Position>;
};

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
 * The box a freeform gesture starts from: the block's `pos`, else its measured box (the validator
 * requires `pos` on every freeform block, so the fallback only covers a document in transit).
 */
export function posFor(slide: Slide, blockId: string, boxes: MeasuredBoxes): Position | null {
  const block = freeformBlocks(slide).find((candidate) => candidate.id === blockId);
  if (!block) return null;
  const own = posOf(block);
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
// Measuring

/** Boxes are compared after rounding to a hundredth of a pixel, so a re-measure with the same layout re-renders nothing. */
function roundBox(box: Box): Box {
  return box.map((v) => Math.round(v * 100) / 100) as unknown as Box;
}

/**
 * Every box the gestures and the overlay read, in sheet pixels (SPEC 6.4: rect / k), from a
 * rendered slide body whose parent is the 1600 wide stage: the blocks, the slots, the runs and the
 * parts PART_SELECTORS name. A block the renderer wrapped in `.free[data-free]` (a positioned
 * block) is measured by that wrapper, which is its `pos`. Null before the stage has a size.
 */
export function measureBoxes(body: HTMLElement): MeasuredBoxes | null {
  const stage = body.parentElement;
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  const k = rect.width / SHEET.width;
  if (!(k > 0)) return null;
  const toBox = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return roundBox([(r.left - rect.left) / k, (r.top - rect.top) / k, r.width / k, r.height / k]);
  };
  const next: MeasuredBoxes = { blocks: {}, slots: {}, runs: {}, parts: {} };
  body.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    const id = el.dataset['block'];
    if (!id || id in next.blocks) return;
    const wrapper = el.parentElement?.closest<HTMLElement>('.free[data-free]');
    next.blocks[id] = toBox(wrapper && wrapper.dataset['free'] === id ? wrapper : el);
    const selector = PART_SELECTORS[el.dataset['type'] as BlockType];
    if (selector) next.parts[id] = Array.from(el.querySelectorAll(selector), toBox);
  });
  body.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
    const slot = el.dataset['slot'] as BlockSlot | undefined;
    if (slot && !(slot in next.slots)) next.slots[slot] = toBox(el);
  });
  body.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
    const run = el.dataset['run'];
    if (run && !(run in next.runs)) next.runs[run] = toBox(el);
  });
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
// Conversion

function stripPos(block: Block): Block {
  if (block.pos === undefined) return block;
  const { pos: _pos, ...rest } = block;
  return rest;
}

/**
 * A grammar content slide as a freeform slide: every block of every slot, in slot order, gets
 * its rendered box as `pos` and its paint index as `z`; the slot lists collapse into `main`; the
 * source layout, slot membership and boxes are kept under `ext.grammar` so the switch back is
 * lossless while nothing moved. A block without a measured box is stacked from the content
 * origin and named in `unplaced`. Null for a slide that is not a grammar content slide.
 */
export function toFreeform(
  slide: Slide,
  boxes: MeasuredBoxes,
): { slide: FreeformSlide; unplaced: string[] } | null {
  if (slide.kind !== 'content' || isFreeformSlide(slide)) return null;
  const named = slotsForLayout(slide.layout);
  const order: SlotName[] = [
    ...named,
    ...(Object.keys(slide.slots) as SlotName[]).filter((slot) => !named.includes(slot)),
  ];
  const record: GrammarRecord = { layout: slide.layout, slots: {}, boxes: {} };
  const blocks: Block[] = [];
  const unplaced: string[] = [];
  let fallbackY = CONTENT_ORIGIN[1];
  for (const slot of order) {
    const list = slide.slots[slot];
    if (!list) continue;
    record.slots[slot] = list.map((block) => block.id);
    for (const block of list) {
      const measured = boxes.blocks[block.id];
      let pos: Position;
      if (measured) {
        pos = boxPos(measured, blocks.length);
      } else {
        unplaced.push(block.id);
        pos = { x: CONTENT_ORIGIN[0], y: fallbackY, w: CONTENT[0], h: 64, z: blocks.length };
        fallbackY += 80;
      }
      record.boxes[block.id] = pos;
      blocks.push({ ...stripPos(block), pos });
    }
  }
  const next: FreeformSlide = {
    ...slide,
    layout: { type: 'freeform' },
    slots: { [FREEFORM_SLOT]: blocks },
    ext: { ...slide.ext, [GRAMMAR_EXT_KEY]: record },
  };
  return { slide: next, unplaced };
}

function grammarRecord(slide: Slide): GrammarRecord | null {
  const value: unknown = slide.ext?.[GRAMMAR_EXT_KEY];
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const layout = v['layout'];
  const slots = v['slots'];
  const boxes = v['boxes'];
  if (typeof layout !== 'object' || layout === null) return null;
  if (typeof slots !== 'object' || slots === null) return null;
  if (typeof boxes !== 'object' || boxes === null) return null;
  return {
    layout: layout as Layout,
    slots,
    boxes: boxes as GrammarRecord['boxes'],
  };
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
 * blocks refile into a `stack` by geometry with the reason.
 */
export function grammarFit(slide: Slide): GrammarFit | null {
  if (!isFreeformSlide(slide)) return null;
  const blocks = freeformBlocks(slide);
  const record = grammarRecord(slide);
  if (record) {
    const ids = new Set(blocks.map((block) => block.id));
    const recorded = Object.values(record.slots).flat();
    const sameSet = recorded.length === ids.size && recorded.every((id) => ids.has(id));
    const unmoved = blocks.every((block) => {
      const pos = posOf(block);
      const was = record.boxes[block.id];
      return pos !== null && was !== undefined && samePlace(pos, was, 1);
    });
    if (sameSet && unmoved) return { lossless: true, layout: record.layout, slots: record.slots };
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

/**
 * A freeform slide back as a grammar slide: the fit's layout and slot lists, `pos` and the
 * grammar record dropped; when the positions fit no layout, the schema's convertLayout refiles
 * the blocks by geometry into a `stack` and `reason` says why the switch was not lossless.
 */
export function toGrammar(
  slide: Slide,
): { slide: ContentSlide; lossless: boolean; reason?: string } | null {
  if (!isFreeformSlide(slide)) return null;
  const fit = grammarFit(slide);
  if (!fit) return null;
  const { ext: oldExt, ...rest } = slide;
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
 * freeform from the rendered boxes or back to the grammar. Null when the slide is already in the
 * target form or cannot be converted (a picture, title or statement slide). The CLI's
 * slide.setLayout is the same write from convertLayout, without the measured boxes.
 */
export function layoutSwitchMutation(
  slide: Slide,
  boxes: MeasuredBoxes,
  target: 'freeform' | 'grammar',
): Mutation | null {
  if (target === 'freeform') {
    const converted = toFreeform(slide, boxes);
    return converted ? { op: 'slide.replace', slideId: slide.id, slide: converted.slide } : null;
  }
  const converted = toGrammar(slide);
  return converted ? { op: 'slide.replace', slideId: slide.id, slide: converted.slide } : null;
}

// ---------------------------------------------------------------------------------------------
// Arrange (the stage's side of block.align, block.distribute and block.order)

/** The positions of the named blocks that have one, in the given order. */
function placedOf(
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
 * it): against their group box, or the content box for a lone block, the shared line snapped once
 * to the guides and the grid. Only the blocks that move get a mutation.
 */
export function alignMutations(
  slide: Slide,
  ids: readonly string[],
  boxes: MeasuredBoxes,
  edge: AlignEdge,
): Mutation[] {
  const rows = placedOf(slide, ids, boxes);
  if (rows.length === 0) return [];
  const next = alignPositions(
    rows.map((row) => row.pos),
    edge,
    undefined,
    true,
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

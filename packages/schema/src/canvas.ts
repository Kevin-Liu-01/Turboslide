// The canvas conversion (gslides-parity SPEC-2 section 1; Kevin's directive of 2026-09-12: "we
// must, must must be able to drag and move around ANYTHING, including backgrounds and shaders but
// all text in the same exact way the google slides is like a canvas"). Every slide is a canvas:
// the first canvas manipulation or insert on a slide that is not on the freeform layout converts
// it losslessly to a content slide on the freeform layout whose `main` slot holds every object
// with `pos`, and the manipulation lands on the converted slide in the same write (SPEC-2 1.6).
//
// `toCanvas(slide, boxes)` is pure over the document and a measurement (1.2): the boxes come
// from one DOM function, `measureCanvasBoxes` of @turboslide/render/measure-dom, run on a 1x
// render with prompts drawn in the editor (a hidden sheet) and in a headless sheet page (the CLI,
// MCP and HTTP), so the pos the editor and the CLI write are identical (1.3, 0.72, 0.104). Kind by
// kind: a grammar content slide as the round one `toFreeform` (every block of every slot in slot
// order); a title's mark, heading and lead become a `mark`, an h1 `heading` and a lead
// `paragraph`; a statement's big becomes a `big` heading centred; a picture kind's photograph
// becomes the `picture` object at 0, 0, 1600, 900 at the bottom of the stack, its plate a paper
// `box` with the plate's padding, and the plate's blocks follow in one group tagged `plate`
// (0.70). Every converted placeholder gets `autofit: 'shrink'` (0.41); an empty placeholder keeps
// the prompt's box and never a height under one line box (0.97). The kind becomes `content`,
// `template` keeps the layout identity and `grammar` (the first class field of 0.99, never an
// `ext` key) keeps the kind's fields so `fromCanvas` restores the kind while nothing moved and
// Apply layout re-flows.
//
// `fromCanvas(slide)` is the round one `toGrammar` extended to the kinds: lossless while every
// object sits where the conversion put it (within 1 px, unrotated, unflipped) and the object set
// is the recorded set; else a content source refiles by geometry and a fixed kind names the layout
// Apply layout re-flows it into. The deck's guides arithmetic (2.10) lives here too because the
// guides are a canvas feature. Framework free; the viewer's Freeform module and the CLI's store
// actions call these and nothing else converts.
import type {
  Block,
  BlockType,
  BoxBlock,
  HeadingBlock,
  MarkBlock,
  ParagraphBlock,
  PictureBlock,
} from './blocks.ts';
import type {
  ContentSlide,
  DeckGuides,
  GrammarRecord,
  Layout,
  LayoutId,
  Slide,
  SlideKind,
  SlotName,
} from './deck.ts';
import { isCanvasSlide, slotsForLayout } from './deck.ts';
import { convertLayout } from './freeform.ts';
import type { BlockId } from './ids.ts';
import { derivedLayout } from './layouts.ts';
import type { Position } from './position.ts';
import { normalizeRotation } from './position.ts';
import type { Box } from './render.ts';
import { CONTENT_BOX, SHEET_HEIGHT, SHEET_WIDTH } from './render.ts';

/** The group tag the plate box and the plate's blocks share after a picture kind converts (1.2). */
export const CANVAS_GROUP = 'plate';

/** The plate's padding, the kinds' `padding: 22px 26px 20px` (block-css.ts `.opener-plate`). */
export const PLATE_PADDING = { top: 22, right: 26, bottom: 20, left: 26 } as const;

/** The box the picture object takes: the whole sheet (the kinds draw the photograph at inset -57). */
export const PICTURE_POS: Position = { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT, z: 0 };

/** The closing's mark size when the slide carries none (layouts.ts `make` for Closing). */
const CLOSING_MARK = { w: 138, h: 88 } as const;

/**
 * What the measurer reads from one rendered slide, in sheet pixels relative to the 1600 by 900
 * stage, rounded to integers (SPEC-2 1.3): `blocks[id]` for every `[data-block]` (a positioned
 * block through its `.free[data-free]` wrapper), `picture` for the kinds' `img.opener-img` or
 * `img.mood-img`, `plate` for `[data-slot="plate"]`, `mark` for the title's `svg[data-raster="mark"]`
 * under `.left-mid` or the closing's `svg.mark` inside the plate, and `prompted`, the ids whose box
 * came from a prompt (the element holds the `.prompt` child), so an empty placeholder converts at
 * the box the stage draws and never under one line box (0.97).
 */
export type CanvasBoxes = {
  blocks: Record<string, Box>;
  picture?: Box;
  plate?: Box;
  mark?: Box;
  prompted: BlockId[];
};

export type ToCanvasResult = {
  slide: ContentSlide;
  record: GrammarRecord;
  /** blocks without a measured box, stacked from the content origin (the round one rule) */
  unplaced: BlockId[];
};

/** The ids a kind's conversion creates (1.2); `canvas.test.ts` asserts they are free per kind. */
export const CONVERSION_IDS: Readonly<Record<SlideKind, ReadonlyArray<BlockId>>> = {
  content: [],
  title: ['mark', 'heading', 'lead'],
  statement: ['big'],
  opener: ['picture', 'plate'],
  mood: ['picture', 'plate'],
  closing: ['picture', 'plate', 'mark'],
};

/**
 * The measured value at the measurer's own precision, 1/64 px (Chromium's LayoutUnit;
 * @turboslide/render/measure-dom MEASURE_PRECISION), never rounded to the pixel: a GT block at a
 * fractional layout position (731.5, 420.4375) rounded to the pixel moved half a pixel and every
 * glyph edge with it, 64 of 342 conversion pairs over the fidelity budget of check step 24
 * (docs/gslides-parity/build-2/b2.md decision 1, request R2; applied by the integrator at merge 2
 * in B1's file). The fixture's canvas slides and the committed walk recordings were re-derived
 * through `slide to-canvas` after this change.
 */
function round(value: number): number {
  return Math.round(value * 64) / 64;
}

/** A measured box as a position at 1/64 px with its paint rank. */
function boxPos(box: Box, z: number): Position {
  return {
    x: round(box[0]),
    y: round(box[1]),
    w: Math.max(1, round(box[2])),
    h: Math.max(1, round(box[3])),
    z,
  };
}

/**
 * One line box of a text block at the grammar's size (the ladder's size times its line height):
 * the height a prompted placeholder keeps at least, so `positionObjectSchema` (h positive) accepts
 * the fresh Title slide's first drag and the box holds one line of typing (0.97).
 */
export function minLineBox(block: Block): number {
  switch (block.type) {
    case 'heading': {
      const size = block.typography?.size;
      if (size !== undefined) return Math.ceil(size * (block.typography?.leading ?? 1.1));
      if (block.level === 'h1') return 90;
      if (block.level === 'big') return 77;
      if (block.level === 'title') return 48;
      return 49;
    }
    case 'paragraph': {
      const size = block.typography?.size;
      if (size !== undefined) return Math.ceil(size * (block.typography?.leading ?? 1.5));
      if (block.role === 'lead') return 38;
      if (block.role === 'cap') return 22;
      return 33;
    }
    case 'text':
    case 'box':
    case 'shape': {
      const size = block.typography?.size ?? 22;
      return Math.ceil(size * (block.typography?.leading ?? 1.5));
    }
    default:
      return 8;
  }
}

/** True for the blocks `autofit` lives on (SPEC-2 2.1.5). */
function takesAutofit(block: Block): boolean {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'text' ||
    block.type === 'box' ||
    block.type === 'shape'
  );
}

function stripPos(block: Block): Block {
  if (block.pos === undefined) return block;
  const { pos: _pos, ...rest } = block;
  return rest;
}

/** A free id: the base, else `<base>-2`, `<base>-3` (the `withFreeId` rule of apply-layout.ts). */
function freeId(base: string, taken: Set<string>): string {
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  taken.add(id);
  return id;
}

/** The slide fields every kind keeps across the conversion (1.2). */
function keptFields(slide: Slide) {
  return {
    schemaVersion: slide.schemaVersion,
    id: slide.id,
    ...(slide.title !== undefined ? { title: slide.title } : {}),
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
    ...(slide.tags !== undefined ? { tags: slide.tags } : {}),
    ...(slide.skip !== undefined ? { skip: slide.skip } : {}),
    ...(slide.background !== undefined ? { background: slide.background } : {}),
    ...(slide.ext !== undefined ? { ext: slide.ext } : {}),
  };
}

type Placer = {
  blocks: Block[];
  unplaced: BlockId[];
  boxes: Record<string, Position>;
  autofit: BlockId[];
  /** Places a block at a measured box, or stacks it from the content origin when none is known. */
  place: (block: Block, box: Box | undefined, extra?: Partial<Position>) => Block;
};

function placer(measured: CanvasBoxes): Placer {
  const prompted = new Set(measured.prompted);
  const state: Placer = {
    blocks: [],
    unplaced: [],
    boxes: {},
    autofit: [],
    place(block, box, extra = {}) {
      let pos: Position;
      if (box !== undefined) {
        pos = boxPos(box, state.blocks.length);
        if (prompted.has(block.id)) pos.h = Math.max(pos.h, minLineBox(block));
      } else {
        state.unplaced.push(block.id);
        pos = {
          x: CONTENT_BOX[0],
          y: CONTENT_BOX[1] + state.unplaced.length * 80 - 80,
          w: CONTENT_BOX[2],
          h: 64,
          z: state.blocks.length,
        };
      }
      const placed: Block = { ...stripPos(block), pos: { ...pos, ...extra } };
      state.boxes[block.id] = placed.pos as Position;
      state.blocks.push(placed);
      return placed;
    },
  };
  return state;
}

/** A block with `autofit: 'shrink'` when it takes the field and has none, recording the write. */
function shrinkFit(block: Block, state: Placer): Block {
  if (!takesAutofit(block) || ('autofit' in block && block.autofit !== undefined)) return block;
  state.autofit.push(block.id);
  return { ...block, autofit: 'shrink' } as Block;
}

/**
 * A slide as a canvas (SPEC-2 1.2): a content slide on the freeform layout whose `main` slot holds
 * every object with `pos` from the measured boxes, `template` naming the layout the slide came
 * from and `grammar` recording what it was. Null for a slide that is a canvas already.
 */
export function toCanvas(slide: Slide, boxes: CanvasBoxes): ToCanvasResult | null {
  if (isCanvasSlide(slide)) return null;
  const template: LayoutId = slide.template ?? derivedLayout(slide);
  const state = placer(boxes);
  const record: GrammarRecord = { kind: slide.kind, boxes: state.boxes };
  const fields: NonNullable<GrammarRecord['fields']> = {};
  if (slide.template !== undefined) fields.template = slide.template;

  switch (slide.kind) {
    case 'content': {
      const named = slotsForLayout(slide.layout);
      const order: SlotName[] = [
        ...named,
        ...(Object.keys(slide.slots) as SlotName[]).filter((slot) => !named.includes(slot)),
      ];
      record.layout = slide.layout;
      record.slots = {};
      for (const slot of order) {
        const list = slide.slots[slot];
        if (list === undefined) continue;
        record.slots[slot] = list.map((block) => block.id);
        for (const block of list) state.place(block, boxes.blocks[block.id]);
      }
      break;
    }
    case 'title': {
      const taken = new Set<string>();
      const markId = freeId('mark', taken);
      const headingId = freeId('heading', taken);
      const leadId = freeId('lead', taken);
      fields.mark = { ...slide.mark };
      const mark: MarkBlock = { id: markId, type: 'mark', w: slide.mark.w, h: slide.mark.h };
      state.place(mark, boxes.mark ?? boxes.blocks[markId]);
      const heading: HeadingBlock = {
        id: headingId,
        type: 'heading',
        level: 'h1',
        text: slide.heading,
        autofit: 'shrink',
      };
      state.autofit.push(headingId);
      state.place(heading, boxes.blocks['heading'] ?? boxes.blocks[headingId]);
      const lead: ParagraphBlock = {
        id: leadId,
        type: 'paragraph',
        role: 'lead',
        tone: 'muted',
        measure: 56,
        text: slide.lead,
        autofit: 'shrink',
      };
      state.autofit.push(leadId);
      state.place(lead, boxes.blocks['lead'] ?? boxes.blocks[leadId]);
      record.slots = { main: [markId, headingId, leadId] };
      break;
    }
    case 'statement': {
      const big: HeadingBlock = {
        id: 'big',
        type: 'heading',
        level: 'big',
        text: slide.big,
        typography: { align: 'center' },
        autofit: 'shrink',
      };
      state.autofit.push('big');
      if (slide.measure !== undefined) fields.measure = slide.measure;
      state.place(big, boxes.blocks['big']);
      record.slots = { main: ['big'] };
      break;
    }
    case 'opener':
    case 'mood':
    case 'closing': {
      const taken = new Set(slide.plate.blocks.map((block) => block.id));
      const pictureId = freeId('picture', taken);
      const plateId = freeId('plate', taken);
      fields.picture = { ...slide.picture };
      fields.plate = { side: slide.plate.side, maxWidth: slide.plate.maxWidth };
      if (slide.kind === 'opener') fields.sectionId = slide.sectionId;
      const picture: PictureBlock = {
        id: pictureId,
        type: 'picture',
        asset: slide.picture.asset,
        ...(slide.picture.position !== undefined ? { position: slide.picture.position } : {}),
        side: slide.plate.side,
      };
      state.place(picture, [PICTURE_POS.x, PICTURE_POS.y, PICTURE_POS.w, PICTURE_POS.h]);
      const plate: BoxBlock = {
        id: plateId,
        type: 'box',
        fill: 'paper',
        strokeWidth: 0,
        padding: { ...PLATE_PADDING },
      };
      const plateBox = boxes.plate ?? plateFallback(slide.plate.side, slide.plate.maxWidth);
      state.place(plate, plateBox, { group: CANVAS_GROUP });
      if (slide.kind === 'closing') {
        const markId = freeId('mark', taken);
        const size = slide.mark ?? CLOSING_MARK;
        fields.mark = { ...size };
        const mark: MarkBlock = { id: markId, type: 'mark', w: size.w, h: size.h };
        state.place(mark, boxes.mark ?? boxes.blocks[markId] ?? markFallback(plateBox, size), {
          group: CANVAS_GROUP,
        });
      }
      for (const block of slide.plate.blocks) {
        const fitted =
          block.type === 'heading' || block.type === 'paragraph' ? shrinkFit(block, state) : block;
        state.place(fitted, boxes.blocks[block.id], { group: CANVAS_GROUP });
      }
      record.slots = { plate: slide.plate.blocks.map((block) => block.id) };
      break;
    }
  }
  if (state.autofit.length > 0) fields.autofit = [...state.autofit];
  if (Object.keys(fields).length > 0) record.fields = fields;
  const converted: ContentSlide = {
    ...keptFields(slide),
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: state.blocks },
    template,
    grammar: record,
  };
  return { slide: converted, record, unplaced: state.unplaced };
}

/** The plate's box when the measurer gave none: the plate's corner of the content box at its max width. */
function plateFallback(side: 'lower-left' | 'lower-right' | 'upper-left', maxWidth: number): Box {
  const [x, y, w, h] = CONTENT_BOX;
  const height = 240;
  if (side === 'lower-right') return [x + w - maxWidth, y + h - height, maxWidth, height];
  if (side === 'upper-left') return [x, y, maxWidth, height];
  return [x, y + h - height, maxWidth, height];
}

/** The closing's mark when the measurer gave none: inside the plate's padding. */
function markFallback(plate: Box, size: { w: number; h: number }): Box {
  return [plate[0] + PLATE_PADDING.left, plate[1] + PLATE_PADDING.top, size.w, size.h];
}

// ---------------------------------------------------------------------------------------------
// Back to the grammar

export type FromCanvasResult =
  | { lossless: true; slide: Slide }
  | {
      /** the objects moved or changed: the content refiled by geometry, a fixed kind named for Apply layout */
      lossless: false;
      slide: ContentSlide;
      layout: LayoutId;
      reason: string;
    };

/** The record a canvas slide carries: `grammar`, or the editor depth round's `ext.grammar` read once (0.99). */
export function grammarRecordOf(slide: Slide): GrammarRecord | null {
  if (slide.grammar !== undefined) return slide.grammar;
  const legacy: unknown = slide.ext?.['grammar'];
  if (typeof legacy !== 'object' || legacy === null) return null;
  const value = legacy as Record<string, unknown>;
  if (typeof value['layout'] !== 'object' || value['layout'] === null) return null;
  if (typeof value['slots'] !== 'object' || value['slots'] === null) return null;
  if (typeof value['boxes'] !== 'object' || value['boxes'] === null) return null;
  return {
    kind: 'content',
    layout: value['layout'] as Layout,
    slots: value['slots'] as GrammarRecord['slots'],
    boxes: value['boxes'] as GrammarRecord['boxes'],
  };
}

/** The Text a text carrying block holds, or the empty Text. */
function textOf(block: Block | undefined): string {
  if (block === undefined) return '';
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'text')
    return block.text;
  if (block.type === 'box' || block.type === 'shape') return block.text ?? '';
  return '';
}

function samePlace(a: Position, b: Position, tolerance = 1): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.w - b.w) <= tolerance &&
    Math.abs(a.h - b.h) <= tolerance &&
    normalizeRotation(a.rotate ?? 0) === normalizeRotation(b.rotate ?? 0) &&
    (a.flip ?? null) === (b.flip ?? null)
  );
}

/** True while every object sits where the conversion put it and the object set is the recorded set. */
export function canvasUnmoved(slide: ContentSlide, record: GrammarRecord): boolean {
  const blocks = slide.slots.main ?? [];
  const recorded = Object.keys(record.boxes);
  if (recorded.length !== blocks.length) return false;
  const ids = new Set(blocks.map((block) => block.id));
  if (!recorded.every((id) => ids.has(id))) return false;
  return blocks.every((block) => {
    const was = record.boxes[block.id];
    return block.pos !== undefined && was !== undefined && samePlace(block.pos, was);
  });
}

/** A block with `pos` dropped and the conversion's `autofit` removed where the record says it was added. */
function restoreBlock(block: Block, added: ReadonlySet<string>): Block {
  const bare = stripPos(block);
  if (added.has(block.id) && 'autofit' in bare) {
    const { autofit: _autofit, ...rest } = bare as Block & { autofit?: unknown };
    return rest as Block;
  }
  return bare;
}

/** The slide fields the restored kind keeps, the conversion's `template` and `grammar` dropped. */
function restoredFields(slide: ContentSlide, record: GrammarRecord) {
  const {
    kind: _kind,
    layout: _layout,
    slots: _slots,
    template: _template,
    grammar: _grammar,
    ...rest
  } = slide;
  const legacyExt = { ...rest.ext };
  delete legacyExt['grammar'];
  const ext = Object.keys(legacyExt).length > 0 ? { ext: legacyExt } : {};
  const { ext: _ext, ...bare } = rest;
  return {
    ...bare,
    ...ext,
    ...(record.fields?.template !== undefined ? { template: record.fields.template } : {}),
  };
}

/**
 * A canvas slide back as the slide it was (1.2, the round one `toGrammar` extended to the kinds).
 * Lossless while nothing moved: the recorded kind with its fields and its blocks stripped of
 * `pos`. Otherwise the content is refiled by geometry into the recorded layout (a content source)
 * or a stack, and `layout` names what Apply layout re-flows a fixed kind into. Null for a slide
 * that is not a canvas or carries no record.
 */
export function fromCanvas(slide: Slide): FromCanvasResult | null {
  if (!isCanvasSlide(slide)) return null;
  const record = grammarRecordOf(slide);
  if (record === null) return null;
  const blocks = slide.slots.main ?? [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const added = new Set(record.fields?.autofit ?? []);
  const kept = restoredFields(slide, record);
  if (!canvasUnmoved(slide, record)) {
    const layout: LayoutId =
      record.kind === 'content' ? (slide.template ?? derivedLayout(slide)) : record.kind;
    const { grammar: _grammar, ...rest } = slide;
    const refiled = convertLayout(rest, record.layout ?? { type: 'stack', gap: 22 });
    return {
      lossless: false,
      slide: refiled,
      layout,
      reason: 'the objects moved since the slide was arranged; the blocks refile by geometry',
    };
  }
  const block = (id: string): Block | undefined => byId.get(id);
  switch (record.kind) {
    case 'content': {
      const slots: ContentSlide['slots'] = {};
      for (const [slot, ids] of Object.entries(record.slots ?? {})) {
        if (slot === 'plate') continue;
        slots[slot as SlotName] = (ids ?? []).flatMap((id) => {
          const found = block(id);
          return found ? [restoreBlock(found, added)] : [];
        });
      }
      return {
        lossless: true,
        slide: {
          ...kept,
          kind: 'content',
          layout: record.layout ?? { type: 'stack', gap: 22 },
          slots,
        },
      };
    }
    case 'title': {
      const ids = record.slots?.main ?? ['mark', 'heading', 'lead'];
      const heading = block(ids[1] ?? 'heading');
      const lead = block(ids[2] ?? 'lead');
      const mark = block(ids[0] ?? 'mark');
      const markSize =
        record.fields?.mark ??
        (mark?.type === 'mark' ? { w: mark.w, h: mark.h } : { w: 132, h: 84 });
      return {
        lossless: true,
        slide: {
          ...kept,
          kind: 'title',
          mark: { ...markSize },
          heading: textOf(heading),
          lead: textOf(lead),
        },
      };
    }
    case 'statement': {
      const big = block('big');
      return {
        lossless: true,
        slide: {
          ...kept,
          kind: 'statement',
          big: textOf(big),
          ...(record.fields?.measure !== undefined ? { measure: record.fields.measure } : {}),
        },
      };
    }
    case 'opener':
    case 'mood':
    case 'closing': {
      const pictureBlock = blocks.find((candidate) => candidate.type === 'picture');
      const picture =
        pictureBlock?.type === 'picture'
          ? {
              asset: pictureBlock.asset,
              fit: 'cover' as const,
              ...(pictureBlock.position !== undefined ? { position: pictureBlock.position } : {}),
            }
          : (record.fields?.picture ?? { asset: '', fit: 'cover' as const });
      const plateFields = record.fields?.plate ?? {
        side: 'lower-left' as const,
        maxWidth: 740 as const,
      };
      const plateBlocks = (record.slots?.plate ?? []).flatMap((id) => {
        const found = block(id);
        return found ? [restoreBlock(found, added)] : [];
      });
      const plate = { side: plateFields.side, maxWidth: plateFields.maxWidth, blocks: plateBlocks };
      if (record.kind === 'opener') {
        return {
          lossless: true,
          slide: {
            ...kept,
            kind: 'opener',
            sectionId: record.fields?.sectionId ?? '',
            picture,
            plate,
          },
        };
      }
      if (record.kind === 'mood') {
        return { lossless: true, slide: { ...kept, kind: 'mood', picture, plate } };
      }
      return {
        lossless: true,
        slide: {
          ...kept,
          kind: 'closing',
          picture,
          plate,
          ...(record.fields?.mark !== undefined ? { mark: { ...record.fields.mark } } : {}),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Guides (SPEC-2 2.10, deck.guides)

export type GuideAxis = 'x' | 'y';

export type GuidesInput = {
  add?: { axis: GuideAxis; at: number }[];
  remove?: { axis: GuideAxis; at: number }[];
  move?: { axis: GuideAxis; from: number; to: number }[];
  set?: DeckGuides;
  clear?: true;
};

/** The sheet extent a guide on an axis lies inside. */
function extent(axis: GuideAxis): number {
  return axis === 'x' ? SHEET_WIDTH : SHEET_HEIGHT;
}

/** A guide list sorted, deduplicated and clamped inside the sheet, rounded to the pixel. */
export function normalizeGuideList(values: ReadonlyArray<number>, axis: GuideAxis): number[] {
  const max = extent(axis);
  const clamped = values.map((value) => Math.min(max, Math.max(0, Math.round(value))));
  return [...new Set(clamped)].sort((a, b) => a - b);
}

/**
 * The deck's guides after one `deck.guides` call (2.10): `set` replaces, `clear` removes, `add`,
 * `remove` and `move` edit the lists; the result is sorted, deduplicated and inside the sheet, and
 * an empty result is undefined so the field leaves the manifest.
 */
export function applyGuides(
  current: DeckGuides | undefined,
  input: GuidesInput,
): DeckGuides | undefined {
  if (input.clear === true) return undefined;
  const next: DeckGuides = input.set
    ? { x: [...input.set.x], y: [...input.set.y] }
    : { x: [...(current?.x ?? [])], y: [...(current?.y ?? [])] };
  for (const step of input.remove ?? []) {
    const list = next[step.axis];
    const at = Math.round(step.at);
    const index = list.findIndex((value) => Math.round(value) === at);
    if (index >= 0) list.splice(index, 1);
  }
  for (const step of input.move ?? []) {
    const list = next[step.axis];
    const from = Math.round(step.from);
    const index = list.findIndex((value) => Math.round(value) === from);
    if (index >= 0) list[index] = step.to;
    else list.push(step.to);
  }
  for (const step of input.add ?? []) next[step.axis].push(step.at);
  const out: DeckGuides = {
    x: normalizeGuideList(next.x, 'x'),
    y: normalizeGuideList(next.y, 'y'),
  };
  return out.x.length === 0 && out.y.length === 0 ? undefined : out;
}

/** The centre lines a new guide lands on (Google puts a new guide at the slide centre, R05 C7). */
export const GUIDE_CENTRE: Readonly<Record<GuideAxis, number>> = {
  x: SHEET_WIDTH / 2,
  y: SHEET_HEIGHT / 2,
};

// ---------------------------------------------------------------------------------------------
// The resize model (gslides-parity SPEC-5-amendments A4; build-4/hotfix-3.md section 2)

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
 * box block of a converted picture kind (its group tag is CANVAS_GROUP), `group` for the union of
 * a multi selection.
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

/** The resize kind of a block: `plate` for the plate box of a converted picture kind, else its type. */
export function resizeKindOf(
  block: Pick<Block, 'type' | 'pos'> | undefined,
): ResizeKind | undefined {
  if (block === undefined) return undefined;
  if (block.type === 'box' && block.pos?.group === CANVAS_GROUP) return 'plate';
  return block.type;
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
function round64(value: number): number {
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

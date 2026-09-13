// The editor's clipboard (gslides-parity SPEC 2.2): slides from the filmstrip, blocks from the
// canvas and text from a run travel as an in-page payload plus the system clipboard as
// `text/plain` with the prefix `turboslide:v1:`, so a paste works across tabs and a plain paste
// into another program reads as JSON. A cut is a copy plus the remove; a paste of slides is one
// `slide.insert` per slide with fresh ids after the selected slide (`slide.import` when the source
// is another deck, so the assets come along); a paste of blocks is one `slide.update` of
// `block.insert` mutations onto the current slide, at the source box on a freeform slide and 16 px
// right and down when the source is the same slide. Paint format (SPEC 3.1 row 6) is the second
// clipboard here: the look of a block (typography, colour, fill, stroke, stroke width) copied once
// and applied as one `block.set` per field the target takes. Everything is pure except the store,
// which wraps `navigator.clipboard`; clipboard.test.ts pins the envelope and the planning.
import type { Block, BlockType } from '@turboslide/schema/blocks';
import { BLOCK_SCHEMAS } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide, SlotName } from '@turboslide/schema/deck';
import { slideBlocks, slotsForLayout } from '@turboslide/schema/deck';
import type { BlockSlot, Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { plainLength, styleRange } from '@turboslide/schema/text';
import type { RunMarks, Text as Markup } from '@turboslide/schema/text';
import { CONTENT, CONTENT_ORIGIN } from '@turboslide/theme/tokens';

/** The prefix of the system clipboard text (SPEC 2.2). */
export const CLIPBOARD_PREFIX = 'turboslide:v1:';

/** How far a pasted block sits from its source when both are on the same slide (SPEC 2.2). */
export const PASTE_OFFSET_PX = 16;

export type ClipboardPayload =
  | { kind: 'slides'; deckId: string; slides: Slide[] }
  | { kind: 'blocks'; deckId: string; slideId: string; blocks: Block[] }
  | { kind: 'text'; text: string };

/** What the menu model's `canPaste` predicate reads (menus/model.ts MenuContext.clipboard). */
export type ClipboardKind = 'empty' | 'slides' | 'blocks' | 'text' | 'image';

/** The envelope: the prefix, then the payload as JSON. */
export function encodeClipboard(payload: ClipboardPayload): string {
  return `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`;
}

/**
 * The payload of a clipboard text, or a text payload for any other text; null for an empty
 * string. A prefixed text that does not parse is read as plain text, never thrown.
 */
export function decodeClipboard(text: string): ClipboardPayload | null {
  if (text === '') return null;
  if (!text.startsWith(CLIPBOARD_PREFIX)) return { kind: 'text', text };
  try {
    const parsed: unknown = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
    if (isPayload(parsed)) return parsed;
  } catch {
    // not ours after all
  }
  return { kind: 'text', text };
}

function isPayload(value: unknown): value is ClipboardPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['kind'] === 'text') return typeof v['text'] === 'string';
  if (v['kind'] === 'slides') return typeof v['deckId'] === 'string' && Array.isArray(v['slides']);
  if (v['kind'] === 'blocks')
    return (
      typeof v['deckId'] === 'string' &&
      typeof v['slideId'] === 'string' &&
      Array.isArray(v['blocks'])
    );
  return false;
}

export function clipboardKindOf(payload: ClipboardPayload | null): ClipboardKind {
  return payload === null ? 'empty' : payload.kind;
}

// ---------------------------------------------------------------------------------------------
// The store

/** The two system calls the store makes; `navigator.clipboard` in a page, a fake in a test. */
export type SystemClipboard = {
  writeText: (text: string) => Promise<void>;
  readText: () => Promise<string>;
};

export type ClipboardStore = {
  /** the in-page payload and the system text; a refused system write keeps the in-page copy */
  write: (payload: ClipboardPayload) => Promise<void>;
  /** the system text when it is ours or plain text, else the in-page payload */
  read: () => Promise<ClipboardPayload | null>;
  /** the last payload this page wrote, without asking the system (the menu predicates read it) */
  last: () => ClipboardPayload | null;
  kind: () => ClipboardKind;
  subscribe: (listener: () => void) => () => void;
};

function systemClipboard(): SystemClipboard | null {
  if (typeof navigator === 'undefined' || !('clipboard' in navigator)) return null;
  return navigator.clipboard;
}

/**
 * One clipboard store; the page shares the module instance between the filmstrip and the canvas.
 * The system clipboard is asked on every read so a copy from another tab arrives; when the read
 * is refused (no permission, no focus) the in-page payload answers.
 */
export function createClipboardStore(
  system: SystemClipboard | null = systemClipboard(),
): ClipboardStore {
  let last: ClipboardPayload | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    async write(payload) {
      last = payload;
      notify();
      try {
        await system?.writeText(encodeClipboard(payload));
      } catch {
        // the system clipboard refused; the in-page payload still pastes in this tab
      }
    },
    async read() {
      try {
        const text = (await system?.readText()) ?? '';
        /* the system clipboard wins whenever it can be read: our envelope from this or another
           tab, or plain text copied anywhere */
        const decoded = decodeClipboard(text);
        if (decoded !== null) return decoded;
      } catch {
        // no permission or no focus: the in-page payload answers
      }
      return last;
    },
    last: () => last,
    kind: () => clipboardKindOf(last),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const clipboardStore: ClipboardStore = createClipboardStore();

// ---------------------------------------------------------------------------------------------
// Ids

/** A slug that is not taken: the base, then `<base>-2`, `<base>-3`. */
export function freeId(base: string, taken: ReadonlySet<string>): string {
  const stem = base === '' ? 'item' : base;
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Every slide id of a document. */
export function takenSlideIds(document: DeckDocument): Set<string> {
  return new Set([
    ...Object.keys(document.slides),
    ...document.deck.sections.flatMap((section) => section.slideIds),
  ]);
}

/** Every block id of a slide, nested included. */
export function takenBlockIds(slide: Slide): Set<string> {
  return new Set(slideBlocks(slide).map(({ block }) => block.id));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------------------------
// Pasting slides

/** What a paste of slides reads of the deck: its sections in order (the filmstrip has these without the document). */
export type SlideOrderView = {
  sections: ReadonlyArray<{ id: string; slideIds: ReadonlyArray<string> }>;
};

/** The `slide.insert` inputs of a paste of slides after `after` (SPEC 2.2), with fresh ids. */
export function pastedSlideInserts(
  view: SlideOrderView,
  payload: Extract<ClipboardPayload, { kind: 'slides' }>,
  after: string | undefined,
): { sectionId: string; after?: string; slide: Slide }[] {
  const taken = new Set(view.sections.flatMap((section) => section.slideIds));
  const section =
    (after === undefined ? undefined : view.sections.find((row) => row.slideIds.includes(after))) ??
    view.sections[view.sections.length - 1];
  if (section === undefined) return [];
  const out: { sectionId: string; after?: string; slide: Slide }[] = [];
  let cursor = after;
  for (const source of payload.slides) {
    const id = freeId(taken.has(source.id) ? `${source.id}-2` : source.id, taken);
    taken.add(id);
    const slide: Slide = { ...clone(source), id };
    out.push({ sectionId: section.id, ...(cursor !== undefined ? { after: cursor } : {}), slide });
    cursor = id;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pasting blocks

/** The slot a pasted or drawn block lands in: the selected block's, else the first filled slot, else the layout's first; the plate on a picture slide. */
export function insertSlotFor(slide: Slide, selectedBlockId?: string): BlockSlot | null {
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') return 'plate';
  if (slide.kind !== 'content') return null;
  if (selectedBlockId !== undefined) {
    const placed = slideBlocks(slide).find(({ block }) => block.id === selectedBlockId);
    if (placed && placed.slot !== 'plate') return placed.slot;
  }
  const slots = slotsForLayout(slide.layout);
  const filled = slots.find((slot: SlotName) => (slide.slots[slot]?.length ?? 0) > 0);
  return filled ?? slots[0] ?? null;
}

/** The default box of a block that arrives on a freeform slide without one (a block cut from a grammar slide). */
export function defaultFreeBox(index: number): Position {
  const [x, y] = CONTENT_ORIGIN;
  return { x, y: y + index * 120, w: Math.min(640, CONTENT[0]), h: 104 };
}

/**
 * The `block.insert` mutations of a paste of blocks onto `slide` (SPEC 2.2): fresh ids, after the
 * selected block in its slot on a grammar slide (the freeform slot's end otherwise), `pos` kept
 * on a freeform slide and offset 16 px when the source is this slide, dropped on a grammar
 * slide. The ids of the copies come back so the caller selects them.
 */
export function pastedBlockInserts(
  slide: Slide,
  payload: Extract<ClipboardPayload, { kind: 'blocks' }>,
  options: { sameSlide: boolean; selectedBlockId?: string },
): { mutations: Mutation[]; ids: string[] } {
  const slot = insertSlotFor(slide, options.selectedBlockId);
  if (slot === null) return { mutations: [], ids: [] };
  const freeform = slide.kind === 'content' && slide.layout.type === 'freeform';
  const taken = takenBlockIds(slide);
  const placed = slideBlocks(slide);
  const maxZ = Math.max(0, ...placed.map(({ block }) => block.pos?.z ?? 0));
  const mutations: Mutation[] = [];
  const ids: string[] = [];
  /* after the selected block; on a freeform slide, at the end of the stack when none is selected,
     so the copies read after everything in document order too */
  const list = slide.kind === 'content' ? (slide.slots[slot as SlotName] ?? []) : [];
  let after: string | undefined =
    options.selectedBlockId ?? (freeform ? list[list.length - 1]?.id : undefined);
  let z = maxZ;
  payload.blocks.forEach((source, index) => {
    const id = freeId(taken.has(source.id) ? `${source.id}-2` : source.id, taken);
    taken.add(id);
    const block: Block = { ...clone(source), id };
    if (freeform) {
      z += 1;
      const pos = block.pos ?? defaultFreeBox(index);
      block.pos = options.sameSlide
        ? { ...pos, x: pos.x + PASTE_OFFSET_PX, y: pos.y + PASTE_OFFSET_PX, z }
        : { ...pos, z };
    } else if (block.pos !== undefined) {
      delete block.pos;
    }
    mutations.push({
      op: 'block.insert',
      slideId: slide.id,
      slot,
      ...(after !== undefined ? { after } : {}),
      block,
    });
    ids.push(id);
    after = id;
  });
  return { mutations, ids };
}

// ---------------------------------------------------------------------------------------------
// Images

/** The image files of a drop or a paste, in order; empty for a text-only transfer. */
export function imageFilesOf(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'));
}

/** Pictures up to 25 MB (SPEC 11.3). */
export const PICTURE_MAX_BYTES = 25 * 1024 * 1024;

/** A file as a data URL, what `asset.add` takes from the studio's drop or paste. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'));
    reader.readAsDataURL(file);
  });
}

/** The asset id of a dropped file: a slug of its name, free among the deck's assets. */
export function assetIdFor(fileName: string, taken: ReadonlySet<string>): string {
  const stem = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return freeId(stem === '' ? 'picture' : stem, taken);
}

/** The alt text of a dropped file: its name without the extension, words spaced (SPEC 7.2.14). */
export function altFor(fileName: string): string {
  const words = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words === '' ? 'Picture' : words;
}

// ---------------------------------------------------------------------------------------------
// Paint format (SPEC 3.1 row 6)

/**
 * The look Paint format carries (SPEC 3.1 row 6; gslides-parity SPEC-2 6.1 row 32, 0.37): the
 * block fields Google's paint roller copies where a block has them (fill, line, text formatting),
 * plus the marks of the caret's run while a range is selected.
 */
export const PAINT_FIELDS = [
  'typography',
  'color',
  'fill',
  'stroke',
  'strokeWidth',
  'dash',
  'valign',
  'marker',
  'preset',
] as const;
export type PaintField = (typeof PAINT_FIELDS)[number];
export type PaintFormat = Partial<Record<PaintField, unknown>> & { marks?: RunMarks };

/** The fields the block carries, as the format to paint, plus the run marks given; empty when it carries none. */
export function paintFormatOf(block: Block, marks?: RunMarks): PaintFormat {
  const source = block as unknown as Record<string, unknown>;
  const out: PaintFormat = {};
  for (const field of PAINT_FIELDS) {
    if (source[field] !== undefined) out[field] = clone(source[field]);
  }
  if (marks !== undefined && Object.keys(marks).length > 0) out.marks = { ...marks };
  return out;
}

/** True when a block type's schema has the field. */
export function blockTakesField(type: BlockType, field: string): boolean {
  const schema = BLOCK_SCHEMAS[type];
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  return shape !== undefined && field in shape;
}

/** The pointer of the one Text a block carries whole, for the marks a paint applies over all of it. */
function wholeTextPath(block: Block): string | null {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'text')
    return '/text';
  if ((block.type === 'box' || block.type === 'shape') && typeof block.text === 'string')
    return '/text';
  return null;
}

/**
 * One `block.set` per field of the format the target block takes (SPEC 3.1 row 6: "applies
 * them to the next clicked block in one block.set per field"); a field the target holds at the
 * same value writes nothing; the run marks, when carried, apply over the target's whole text as
 * one `text.replace` (SPEC-2 0.37). Empty when nothing applies.
 */
export function paintMutations(slide: Slide, target: Block, format: PaintFormat): Mutation[] {
  const current = target as unknown as Record<string, unknown>;
  const out: Mutation[] = [];
  for (const field of PAINT_FIELDS) {
    if (!(field in format) || !blockTakesField(target.type, field)) continue;
    const value = format[field];
    if (JSON.stringify(current[field]) === JSON.stringify(value)) continue;
    out.push({
      op: 'block.set',
      slideId: slide.id,
      blockId: target.id,
      path: `/${field}`,
      value: clone(value),
    });
  }
  const path = format.marks === undefined ? null : wholeTextPath(target);
  if (path !== null && format.marks !== undefined) {
    const text = (current[path.slice(1)] as Markup | undefined) ?? '';
    const length = plainLength(text);
    if (length > 0) {
      const marks = format.marks;
      const next = styleRange(text, [0, length], {
        i: marks.i === true,
        u: marks.u === true,
        s: marks.s === true,
        sup: marks.sup === true,
        sub: marks.sub === true,
        color: marks.color ?? null,
        highlight: marks.hl ?? null,
      });
      if (next !== text) {
        out.push({
          op: 'text.replace',
          slideId: slide.id,
          blockId: target.id,
          path,
          range: [0, length],
          text: next,
        });
      }
    }
  }
  return out;
}

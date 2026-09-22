// applyWrite (SPEC 4.4): a pure reducer that rejects a stale baseRevision with the current
// document, applies the mutation list atomically, bumps `revision`, returns the normalized result
// plus the inverse mutations and the log entry the store appends. Undo is a forward write carrying
// the inverse mutations (SPEC 6.7), so the server log stays linear.
import type { Block } from './blocks.ts';
import type { DeckDocument, Slide } from './deck.ts';
import { slideSchema, slotsForLayout } from './deck.ts';
import { diffDecks } from './diff.ts';
import type { BlockId, SlideId } from './ids.ts';
import type { Author, BlockSlot, Mutation, SlideFieldId, Write } from './mutations.ts';
import { slideFieldOf, slideFieldPath } from './mutations.ts';
import { cloneJson, getAt, hasAt, setAt } from './pointer.ts';
import {
  canonicalText,
  caseRange,
  flagDiffs,
  markRange,
  plainLength,
  plainOf,
  plainText,
  spliceText,
} from './text.ts';
import type { Issue } from './validate.ts';
import { validateDocument } from './validate.ts';

export type LogEntry = {
  revision: number;
  baseRevision: number;
  author: Author;
  note?: string;
  createdAt: string;
  mutations: Mutation[];
  /** applying these in order returns the document to baseRevision */
  inverse: Mutation[];
};

export type ApplyOptions = {
  /** the timestamp written to updatedAt and the log entry; defaults to the clock */
  now?: string;
  /** resolves the document of a named version for version.restore */
  resolveVersion?: (n: number) => DeckDocument | undefined;
};

export type ApplyResult =
  | { ok: true; document: DeckDocument; inverse: Mutation[]; entry: LogEntry; issues: Issue[] }
  | { ok: false; code: 'conflict'; message: string; current: DeckDocument; currentRevision: number }
  | { ok: false; code: 'invalid'; message: string; index?: number; issues: Issue[] };

type PictureSlide = Extract<Slide, { plate: unknown }>;

function isPictureSlide(slide: Slide): slide is PictureSlide {
  return slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing';
}

function requireSlide(document: DeckDocument, slideId: SlideId): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

function requireSection(document: DeckDocument, sectionId: string) {
  const section = document.deck.sections.find((row) => row.id === sectionId);
  if (section === undefined) throw new RangeError(`No section "${sectionId}"`);
  return section;
}

function insertAfter<T>(list: T[], item: T, after: T | undefined): void {
  if (after === undefined) {
    list.unshift(item);
    return;
  }
  const index = list.indexOf(after);
  if (index < 0) throw new RangeError(`"${String(after)}" is not in the target list`);
  list.splice(index + 1, 0, item);
}

/** The list a slot names on a slide, created when the layout allows it and it is still empty. */
function slotList(slide: Slide, slot: BlockSlot, create: boolean): Block[] {
  if (slot === 'plate') {
    if (!isPictureSlide(slide)) throw new RangeError(`Slide "${slide.id}" has no plate`);
    return slide.plate.blocks;
  }
  if (slide.kind !== 'content')
    throw new RangeError(`Slide "${slide.id}" (${slide.kind}) has no slots`);
  if (!slotsForLayout(slide.layout).includes(slot)) {
    throw new RangeError(
      `Slot "${slot}" is not in layout ${slide.layout.type} of slide "${slide.id}"`,
    );
  }
  const existing = slide.slots[slot];
  if (existing !== undefined) return existing;
  if (!create) throw new RangeError(`Slot "${slot}" of slide "${slide.id}" is empty`);
  const list: Block[] = [];
  slide.slots[slot] = list;
  return list;
}

type Located = { slot: BlockSlot; list: Block[]; index: number; block: Block };

/** Finds a top-level block by id in any slot or the plate; nested composite blocks are reached by path. */
function locateBlock(slide: Slide, blockId: BlockId): Located {
  const lists: { slot: BlockSlot; list: Block[] }[] =
    slide.kind === 'content'
      ? Object.entries(slide.slots).map(([slot, list]) => ({ slot: slot as BlockSlot, list }))
      : isPictureSlide(slide)
        ? [{ slot: 'plate', list: slide.plate.blocks }]
        : [];
  for (const { slot, list } of lists) {
    const index = list.findIndex((block) => block.id === blockId);
    const block = list[index];
    if (index >= 0 && block !== undefined) return { slot, list, index, block };
  }
  throw new RangeError(`No block "${blockId}" on slide "${slide.id}"`);
}

function blockIds(slide: Slide): Set<string> {
  const ids = new Set<string>();
  const lists =
    slide.kind === 'content'
      ? Object.values(slide.slots).flat()
      : isPictureSlide(slide)
        ? slide.plate.blocks
        : [];
  for (const block of lists) ids.add(block.id);
  return ids;
}

/** What a text op writes into: a block at the op's pointer, or the slide itself for a slide field. */
type TextTarget = {
  slide: Slide;
  /** the object `path` points into: the block, or the slide for a field */
  holder: Block | Slide;
  /** the slide field the op names, null for a block's Text */
  field: SlideFieldId | null;
  current: string;
};

/**
 * The Text a text op names, read as a string (docs/SYNC.md 3.4): a slide field when `blockId`
 * names one on this slide's kind (`slideFieldOf`), whose `path` must be the field's own pointer,
 * else the block's Text at `path`. TypeError when the pointer holds anything else or a field's
 * path is not its pointer.
 */
function resolveTextTarget(
  document: DeckDocument,
  mutation: { op: string; slideId: SlideId; blockId: BlockId; path: string },
): TextTarget {
  const slide = requireSlide(document, mutation.slideId);
  const field = slideFieldOf(slide, mutation.blockId);
  if (field !== null) {
    if (mutation.path !== slideFieldPath(field)) {
      throw new TypeError(
        `${mutation.op}: the slide field "${field}" of slide "${slide.id}" is addressed at ${slideFieldPath(field)}, got ${mutation.path}`,
      );
    }
    const current = getAt(slide, mutation.path);
    if (typeof current !== 'string') {
      throw new TypeError(
        `${mutation.op}: ${mutation.path} is not a string on slide "${slide.id}"`,
      );
    }
    return { slide, holder: slide, field, current };
  }
  const { block } = locateBlock(slide, mutation.blockId);
  const current = getAt(block, mutation.path);
  if (typeof current !== 'string') {
    throw new TypeError(
      `${mutation.op}: ${mutation.path} is not a string on block "${mutation.blockId}"`,
    );
  }
  return { slide, holder: block, field: null, current };
}

/**
 * The deck title a blank deck starts with: the store's `DEFAULT_BLANK_TITLE` and the chrome's
 * `TITLE_ROW.untitled`, spelled here because the store's templates module reaches `node:fs` and
 * the chrome sits downstream of this package (apps/studio's blob-admission.test.ts pins the
 * three agree).
 */
export const UNTITLED_DECK_TITLE = 'Untitled presentation';

/**
 * The Text the deck's title follows (docs/SYNC.md 3.4): the heading of the deck's first title
 * slide in section order, whether a grammar title slide (the `heading` field) or a title slide
 * converted to a canvas (canvas.ts keeps `grammar.kind` 'title' and the heading block's id as the
 * second id of its main slot, `heading` by default). Null for a deck without one.
 */
export function deckTitleSource(
  document: DeckDocument,
): { slideId: SlideId; blockId: string } | null {
  for (const section of document.deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = document.slides[slideId];
      if (slide === undefined) continue;
      if (slide.kind === 'title') return { slideId, blockId: 'heading' };
      if (slide.kind === 'content' && slide.grammar?.kind === 'title') {
        return { slideId, blockId: slide.grammar.slots?.main?.[1] ?? 'heading' };
      }
    }
  }
  return null;
}

/**
 * The title rule of docs/SYNC.md 3.4, run after a text op landed on the deck's title source: the
 * deck title takes the heading's new plain text while it was following the heading, that is
 * while it still reads the blank deck's title or the heading's plain text from before the op.
 * A `deck.set /title` that made them differ (a rename from the title row, the card menu or the
 * CLI) stops the following until a later set makes them equal again, so a rename is never
 * undone by the next keystroke on the cover. An emptied heading keeps the title (the manifest
 * needs one) and the title stays put when the heading already reads it. Answers the inverse that
 * restores the previous title, appended after the op's own inverse so undo is exact even when
 * the re-applied inverse would derive a different title (a deck named from its first character).
 * Before this every heading burst rode with a `deck.set /title` from the client, and two people
 * typing into one cover wrote each other's titles over (audit-ordering item 1).
 */
function followTitle(document: DeckDocument, before: string, after: string): Mutation[] {
  const title = document.deck.title;
  const heading = plainText(after).trim();
  if (heading === '' || heading === title) return [];
  const previous = plainText(before).trim();
  if (title !== UNTITLED_DECK_TITLE && title !== previous) return [];
  document.deck.title = heading;
  return [{ op: 'deck.set', path: '/title', value: title }];
}

/** True when a text op writes the Text the deck's title follows (`deckTitleSource`). */
function writesTitleSource(
  document: DeckDocument,
  target: TextTarget,
  blockId: string,
  path: string,
): boolean {
  const source = deckTitleSource(document);
  if (source === null || source.slideId !== target.slide.id || source.blockId !== blockId)
    return false;
  return target.field !== null ? target.field === 'heading' : path === '/text';
}

/**
 * The text.mark mutations that turn the flags of `from` into the flags of `to` over a plain range
 * (the two Texts agree in plain characters there): what an inverse appends after its splice so a
 * removed display run, link or mark comes back exactly (gslides-parity SPEC-3 3.1).
 */
function flagRestores(
  mutation: { slideId: SlideId; blockId: BlockId; path: string },
  from: string,
  to: string,
  range: readonly [number, number],
): Mutation[] {
  return flagDiffs(from, to, range).map((edit) => ({
    op: 'text.mark',
    slideId: mutation.slideId,
    blockId: mutation.blockId,
    path: mutation.path,
    range: edit.range,
    edit: {
      kind: 'marks',
      ...(edit.set !== undefined ? { set: edit.set } : {}),
      ...(edit.clear !== undefined ? { clear: [...edit.clear] } : {}),
    },
  }));
}

const FORBIDDEN_SLIDE_PATHS = new Set(['', '/id', '/schemaVersion']);
const FORBIDDEN_BLOCK_PATHS = new Set(['', '/id']);
/* `brand` is the brand kit record (docs/PRODUCT.md 4.1): written by the brand.set and brand.reset
   handlers alone, whose pointer writes land at the shallowest missing ancestor so one Undo takes
   one field back; the `deck.set` action's own pointer regex stays closed to it */
const DECK_SET_ROOTS = new Set(['title', 'theme', 'defaults', 'guides', 'brand']);

/**
 * Applies one mutation in place and returns its inverse. Throws RangeError for an unknown id or
 * slot and TypeError for malformed input; the caller has cloned the document.
 */
export function applyMutation(
  document: DeckDocument,
  mutation: Mutation,
  options: ApplyOptions = {},
): Mutation[] {
  switch (mutation.op) {
    case 'slide.insert': {
      const parsed = slideSchema.safeParse(mutation.slide);
      if (!parsed.success)
        throw new TypeError(`slide.insert: ${parsed.error.issues[0]?.message ?? 'invalid slide'}`);
      const slide = parsed.data;
      if (document.slides[slide.id] !== undefined)
        throw new RangeError(`Slide "${slide.id}" already exists`);
      const section = requireSection(document, mutation.sectionId);
      insertAfter(section.slideIds, slide.id, mutation.after);
      document.slides[slide.id] = slide;
      return [{ op: 'slide.remove', slideId: slide.id }];
    }
    case 'slide.remove': {
      const slide = requireSlide(document, mutation.slideId);
      const section = document.deck.sections.find((row) => row.slideIds.includes(mutation.slideId));
      let inverse: Mutation;
      if (section === undefined) {
        inverse = { op: 'slide.insert', sectionId: document.deck.sections[0]?.id ?? '', slide };
      } else {
        const index = section.slideIds.indexOf(mutation.slideId);
        const after = index > 0 ? section.slideIds[index - 1] : undefined;
        section.slideIds.splice(index, 1);
        inverse = {
          op: 'slide.insert',
          sectionId: section.id,
          ...(after !== undefined ? { after } : {}),
          slide,
        };
      }
      delete document.slides[mutation.slideId];
      return [inverse];
    }
    case 'slide.move': {
      requireSlide(document, mutation.slideId);
      const from = document.deck.sections.find((row) => row.slideIds.includes(mutation.slideId));
      if (from === undefined) throw new RangeError(`Slide "${mutation.slideId}" is in no section`);
      const fromIndex = from.slideIds.indexOf(mutation.slideId);
      const fromAfter = fromIndex > 0 ? from.slideIds[fromIndex - 1] : undefined;
      from.slideIds.splice(fromIndex, 1);
      const to = requireSection(document, mutation.sectionId);
      insertAfter(to.slideIds, mutation.slideId, mutation.after);
      return [
        {
          op: 'slide.move',
          slideId: mutation.slideId,
          sectionId: from.id,
          ...(fromAfter !== undefined ? { after: fromAfter } : {}),
        },
      ];
    }
    case 'slide.set': {
      const slide = requireSlide(document, mutation.slideId);
      if (FORBIDDEN_SLIDE_PATHS.has(mutation.path))
        throw new TypeError(`slide.set cannot write ${mutation.path || 'the slide root'}`);
      const existed = hasAt(slide, mutation.path);
      const old = existed ? cloneJson(getAt(slide, mutation.path)) : undefined;
      setAt(slide, mutation.path, cloneJson(mutation.value));
      return [
        {
          op: 'slide.set',
          slideId: mutation.slideId,
          path: mutation.path,
          ...(existed ? { value: old } : {}),
        },
      ];
    }
    case 'slide.replace': {
      const old = requireSlide(document, mutation.slideId);
      const parsed = slideSchema.safeParse(mutation.slide);
      if (!parsed.success)
        throw new TypeError(`slide.replace: ${parsed.error.issues[0]?.message ?? 'invalid slide'}`);
      if (parsed.data.id !== mutation.slideId) {
        throw new TypeError(
          `slide.replace: the slide id "${parsed.data.id}" must equal "${mutation.slideId}"`,
        );
      }
      document.slides[mutation.slideId] = parsed.data;
      return [{ op: 'slide.replace', slideId: mutation.slideId, slide: old }];
    }
    case 'block.insert': {
      const slide = requireSlide(document, mutation.slideId);
      if (blockIds(slide).has(mutation.block.id)) {
        throw new RangeError(`Block "${mutation.block.id}" already exists on slide "${slide.id}"`);
      }
      const list = slotList(slide, mutation.slot, true);
      const after =
        mutation.after === undefined
          ? undefined
          : list.find((block) => block.id === mutation.after);
      if (mutation.after !== undefined && after === undefined) {
        throw new RangeError(
          `No block "${mutation.after}" in slot "${mutation.slot}" of slide "${slide.id}"`,
        );
      }
      insertAfter(list, cloneJson(mutation.block), after);
      return [{ op: 'block.remove', slideId: mutation.slideId, blockId: mutation.block.id }];
    }
    case 'block.remove': {
      const slide = requireSlide(document, mutation.slideId);
      const located = locateBlock(slide, mutation.blockId);
      const after = located.index > 0 ? located.list[located.index - 1]?.id : undefined;
      located.list.splice(located.index, 1);
      return [
        {
          op: 'block.insert',
          slideId: mutation.slideId,
          slot: located.slot,
          ...(after !== undefined ? { after } : {}),
          block: located.block,
        },
      ];
    }
    case 'block.move': {
      const slide = requireSlide(document, mutation.slideId);
      const located = locateBlock(slide, mutation.blockId);
      const fromAfter = located.index > 0 ? located.list[located.index - 1]?.id : undefined;
      located.list.splice(located.index, 1);
      const list = slotList(slide, mutation.slot, true);
      const after =
        mutation.after === undefined
          ? undefined
          : list.find((block) => block.id === mutation.after);
      if (mutation.after !== undefined && after === undefined) {
        located.list.splice(located.index, 0, located.block);
        throw new RangeError(
          `No block "${mutation.after}" in slot "${mutation.slot}" of slide "${slide.id}"`,
        );
      }
      insertAfter(list, located.block, after);
      const inverse: Mutation[] = [
        {
          op: 'block.move',
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          slot: located.slot,
          ...(fromAfter !== undefined ? { after: fromAfter } : {}),
        },
      ];
      if (mutation.z !== undefined) {
        // the z target of a freeform block (docs/freeform.md); the inverse restores or removes it
        const pos = located.block.pos;
        if (pos === undefined) {
          throw new TypeError(
            `block.move: block "${mutation.blockId}" has no position box, so it has no z order`,
          );
        }
        const oldZ = pos.z;
        pos.z = mutation.z;
        inverse.push({
          op: 'block.set',
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          path: '/pos/z',
          ...(oldZ !== undefined ? { value: oldZ } : {}),
        });
      }
      return inverse;
    }
    case 'block.set': {
      const slide = requireSlide(document, mutation.slideId);
      const { block } = locateBlock(slide, mutation.blockId);
      if (FORBIDDEN_BLOCK_PATHS.has(mutation.path))
        throw new TypeError(`block.set cannot write ${mutation.path || 'the block root'}`);
      const existed = hasAt(block, mutation.path);
      const old = existed ? cloneJson(getAt(block, mutation.path)) : undefined;
      // A field under an object the block does not carry yet (`/typography/family` on a heading
      // with no typography, the font rows' agent write; docs/PRODUCT.md 4.2) creates the object
      // the way `deck.set` creates `/defaults`; the inverse then removes the object whole, so undo
      // returns the block exactly. The rule is one level: a deeper pointer still needs its parents.
      const segments = mutation.path.split('/').slice(1);
      const parentPath = segments.length === 2 ? `/${segments[0]}` : null;
      const createsParent =
        parentPath !== null && mutation.value !== undefined && !hasAt(block, parentPath);
      if (createsParent) setAt(block, parentPath, {});
      setAt(block, mutation.path, cloneJson(mutation.value));
      if (createsParent)
        return [
          {
            op: 'block.set',
            slideId: mutation.slideId,
            blockId: mutation.blockId,
            path: parentPath,
          },
        ];
      return [
        {
          op: 'block.set',
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          path: mutation.path,
          ...(existed ? { value: old } : {}),
        },
      ];
    }
    case 'text.replace': {
      const target = resolveTextTarget(document, mutation);
      const { holder, current } = target;
      const [start, end] = mutation.range;
      if (start > end || end > current.length) {
        throw new RangeError(
          `text.replace: range ${start}..${end} is outside a string of length ${current.length}`,
        );
      }
      // The stored form is canonical, so the inverse covers the whole new string: exact, whatever
      // escaping the canonical form added to the typed text.
      const next = canonicalText(current.slice(0, start) + mutation.text + current.slice(end));
      setAt(holder, mutation.path, next);
      const title = writesTitleSource(document, target, mutation.blockId, mutation.path)
        ? followTitle(document, current, next)
        : [];
      return [
        {
          op: 'text.replace',
          slideId: mutation.slideId,
          blockId: mutation.blockId,
          path: mutation.path,
          range: [0, next.length],
          text: current,
        },
        ...title,
      ];
    }
    case 'text.splice': {
      const target = resolveTextTarget(document, mutation);
      const { holder, current } = target;
      const plain = plainOf(current);
      const { at, remove, insert } = mutation;
      if (at < 0 || remove < 0 || at + remove > plain.length) {
        throw new RangeError(
          `text.splice: ${at} plus ${remove} is outside a text of ${plain.length} characters`,
        );
      }
      const removed = plain.slice(at, at + remove);
      const next = canonicalText(spliceText(current, at, remove, insert, mutation.flags));
      setAt(holder, mutation.path, next);
      // the deck title follows the cover's heading while it was following it (followTitle)
      const title = writesTitleSource(document, target, mutation.blockId, mutation.path)
        ? followTitle(document, current, next)
        : [];
      // The inverse is a splice (SPEC-3 3.1), so undo transforms against later ops; the flags the
      // removed span carried come back through the marks the re-inserted text lacks.
      const back: Mutation = {
        op: 'text.splice',
        slideId: mutation.slideId,
        blockId: mutation.blockId,
        path: mutation.path,
        at,
        remove: insert.length,
        insert: removed,
      };
      const restored = canonicalText(spliceText(next, at, insert.length, removed));
      return [back, ...flagRestores(mutation, restored, current, [at, at + remove]), ...title];
    }
    case 'text.mark': {
      const target = resolveTextTarget(document, mutation);
      const { holder, current } = target;
      const [start, end] = mutation.range;
      const length = plainLength(current);
      if (start > end || end > length) {
        throw new RangeError(
          `text.mark: range ${start}..${end} is outside a text of ${length} characters`,
        );
      }
      const edit = mutation.edit;
      const next = canonicalText(
        edit.kind === 'marks'
          ? markRange(current, mutation.range, edit)
          : caseRange(current, mutation.range, edit.mode),
      );
      setAt(holder, mutation.path, next);
      // a case change moves the heading's letters, so the title follows it as it follows a splice
      const title =
        edit.kind === 'case' && writesTitleSource(document, target, mutation.blockId, mutation.path)
          ? followTitle(document, current, next)
          : [];
      // the mark that restores the previous flags of the range, per segment where they differed
      if (edit.kind === 'marks') return flagRestores(mutation, next, current, mutation.range);
      // a case change: the previous characters come back through a splice (a case change can move
      // the length, so the range is re-read on the new text), then the flags the splice's host run
      // did not carry
      const before = plainOf(current).slice(start, end);
      const nextEnd = end + (plainLength(next) - length);
      const back: Mutation = {
        op: 'text.splice',
        slideId: mutation.slideId,
        blockId: mutation.blockId,
        path: mutation.path,
        at: start,
        remove: nextEnd - start,
        insert: before,
      };
      const restored = canonicalText(spliceText(next, start, nextEnd - start, before));
      return [back, ...flagRestores(mutation, restored, current, [start, end]), ...title];
    }
    case 'section.set': {
      const old = cloneJson(document.deck.sections);
      document.deck.sections = cloneJson(mutation.sections);
      return [{ op: 'section.set', sections: old }];
    }
    case 'asset.set': {
      const old = document.deck.assets[mutation.asset.id];
      document.deck.assets[mutation.asset.id] = cloneJson(mutation.asset);
      return old === undefined
        ? [{ op: 'asset.remove', assetId: mutation.asset.id }]
        : [{ op: 'asset.set', asset: old }];
    }
    case 'asset.remove': {
      const old = document.deck.assets[mutation.assetId];
      if (old === undefined) throw new RangeError(`No asset "${mutation.assetId}"`);
      delete document.deck.assets[mutation.assetId];
      return [{ op: 'asset.set', asset: old }];
    }
    case 'deck.set': {
      const root = mutation.path.split('/')[1] ?? '';
      if (root === 'trashedAt') {
        throw new TypeError(
          'deck.set does not write trashedAt; deck.trash and deck.restore move a deck to and from the trash at the store level (gslides-parity SPEC 7.2.5)',
        );
      }
      if (!DECK_SET_ROOTS.has(root)) {
        throw new TypeError(
          `deck.set writes title, theme, defaults (/defaults/appearance, /defaults/counter, /defaults/notes, /defaults/background), guides or brand; sections and assets have their own mutations`,
        );
      }
      const existed = hasAt(document.deck, mutation.path);
      const old = existed ? cloneJson(getAt(document.deck, mutation.path)) : undefined;
      // A pointer under /defaults on a deck without the object (every deck written before the
      // parity round) creates it, the way the Themes panel's first write does; the inverse then
      // removes the whole object so undo returns the manifest exactly (gslides-parity SPEC 7.2.3,
      // 7.2.4).
      const createsDefaults =
        root === 'defaults' &&
        mutation.path !== '/defaults' &&
        mutation.value !== undefined &&
        document.deck.defaults === undefined;
      if (createsDefaults) document.deck.defaults = {};
      setAt(document.deck, mutation.path, cloneJson(mutation.value));
      if (createsDefaults) return [{ op: 'deck.set', path: '/defaults' }];
      return [{ op: 'deck.set', path: mutation.path, ...(existed ? { value: old } : {}) }];
    }
    case 'version.restore': {
      const restored = options.resolveVersion?.(mutation.n);
      if (restored === undefined) throw new RangeError(`No version ${mutation.n} to restore`);
      // A restore is the diff from the current document to the version, applied as ordinary
      // mutations, so its inverse is exact and it reads in History like any other write.
      const steps = diffDecks(document, restored);
      const inverse: Mutation[] = [];
      for (const step of steps) inverse.unshift(...applyMutation(document, step, options));
      return inverse;
    }
  }
}

/** Applies mutations to a clone and returns the new document with the inverse list in undo order. */
export function applyMutations(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
  options: ApplyOptions = {},
): { document: DeckDocument; inverse: Mutation[] } {
  const next = cloneJson(document);
  const inverse: Mutation[] = [];
  for (const mutation of mutations) inverse.unshift(...applyMutation(next, mutation, options));
  return { document: next, inverse };
}

/**
 * The reducer. A stale baseRevision returns the current document (the transport maps it to 409);
 * a mutation that throws or a result that fails validation at severity 3 returns `invalid` and
 * leaves the input untouched.
 */
export function applyWrite(
  document: DeckDocument,
  write: Write,
  options: ApplyOptions = {},
): ApplyResult {
  if (write.baseRevision !== document.deck.revision) {
    return {
      ok: false,
      code: 'conflict',
      message: `baseRevision ${write.baseRevision} is stale; the document is at revision ${document.deck.revision}`,
      current: document,
      currentRevision: document.deck.revision,
    };
  }
  const next = cloneJson(document);
  const inverse: Mutation[] = [];
  for (const [index, mutation] of write.mutations.entries()) {
    try {
      inverse.unshift(...applyMutation(next, mutation, options));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: 'invalid',
        message: `mutation ${index} (${mutation.op}): ${message}`,
        index,
        issues: [],
      };
    }
  }
  const now = options.now ?? new Date().toISOString();
  next.deck.revision = document.deck.revision + 1;
  next.deck.updatedAt = now;
  const validation = validateDocument(next);
  if (!validation.ok || validation.deck === null) {
    const first = validation.issues.find((row) => row.severity === 3);
    return {
      ok: false,
      code: 'invalid',
      message:
        first === undefined
          ? 'the write leaves the deck invalid'
          : `${first.file}${first.pointer}: ${first.message}`,
      issues: validation.issues,
    };
  }
  const normalized: DeckDocument = { deck: validation.deck, slides: validation.slides };
  const entry: LogEntry = {
    revision: normalized.deck.revision,
    baseRevision: write.baseRevision,
    author: write.author,
    ...(write.note !== undefined ? { note: write.note } : {}),
    createdAt: now,
    mutations: cloneJson(write.mutations),
    inverse,
  };
  return { ok: true, document: normalized, inverse, entry, issues: validation.issues };
}

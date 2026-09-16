// The walk (gslides-parity SPEC-5 7.2; R10 4.5): every Text of the named slides in reading order
// (slide order, then block order, then the pointer order inside a block), then the slide's notes,
// then every block's alt text, with the skip rules: a token with a digit, an internal capital
// (camelCase, a dotted identifier), two to five capitals (an acronym), the proper nouns and the
// product tokens, the caller's personal dictionary and the session's Ignore all set. Apostrophes
// inside a word stay part of it; words split on Unicode non letters. Pure: the block pointer
// supplier is injected (the linter's `blockTexts` on the CLI and in the studio), so this package
// depends on the schema alone and the same walk runs in the Worker.
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder } from '@turboslide/schema/deck';
import { plainOf } from '@turboslide/schema/text';

import type { Misspelling, SpellEngine, SpellingTarget } from './port.ts';

/** A Text inside a slide as the supplier names it: the block (absent for a slide field), the pointer, the markup. */
export type SpellingTextRef = { blockId?: string; path: string; text: string };

/** The supplier of a slide's texts in reading order (the linter's `slideTexts` then `blockTexts` per block). */
export type TextRefSupplier = (slide: Slide) => ReadonlyArray<SpellingTextRef>;

export type WalkOptions = {
  /** the slides, in the deck's order when absent */
  slideIds?: ReadonlyArray<string>;
  /** read the notes after each slide's texts */
  notes?: boolean;
  /** read every block's alt text after the notes */
  alt?: boolean;
};

/** The default supplier: the fixed compositions' fields and the top level blocks' own text members. */
export function defaultTextRefs(slide: Slide): SpellingTextRef[] {
  const out: SpellingTextRef[] = [];
  if (slide.kind === 'title') {
    out.push({ path: '/heading', text: slide.heading }, { path: '/lead', text: slide.lead });
  }
  if (slide.kind === 'statement') out.push({ path: '/big', text: slide.big });
  for (const { block } of slideBlocks(slide)) {
    const record = block as unknown as Record<string, unknown>;
    if (typeof record['text'] === 'string')
      out.push({ blockId: block.id, path: '/text', text: record['text'] });
    if (Array.isArray(record['items'])) {
      (record['items'] as unknown[]).forEach((item, index) => {
        if (typeof item === 'string')
          out.push({ blockId: block.id, path: `/items/${index}`, text: item });
        else if (item !== null && typeof item === 'object') {
          const row = item as Record<string, unknown>;
          for (const key of ['text', 'key', 'value', 'quote', 'note', 'label', 'sub'])
            if (typeof row[key] === 'string')
              out.push({ blockId: block.id, path: `/items/${index}/${key}`, text: row[key] });
        }
      });
    }
    if (Array.isArray(record['rows'])) {
      (record['rows'] as unknown[]).forEach((row, r) => {
        const cells = (row as { cells?: unknown[] }).cells;
        if (!Array.isArray(cells)) return;
        cells.forEach((cell, c) => {
          const text = (cell as { text?: unknown }).text;
          if (typeof text === 'string')
            out.push({ blockId: block.id, path: `/rows/${r}/cells/${c}/text`, text });
        });
      });
    }
    if (typeof record['caption'] === 'string')
      out.push({ blockId: block.id, path: '/caption', text: record['caption'] });
  }
  return out;
}

/** The alt texts of a slide's blocks with their pointers. */
export function altTextRefs(slide: Slide): SpellingTextRef[] {
  const out: SpellingTextRef[] = [];
  for (const { block } of slideBlocks(slide)) {
    const alt = (block as { alt?: unknown }).alt;
    if (typeof alt === 'string' && alt !== '')
      out.push({ blockId: block.id, path: '/alt', text: alt });
  }
  return out;
}

/**
 * Every target of the named slides in reading order: the texts, then the notes, then the alt
 * texts (R10 4.5). The markup is kept beside its plain form so a finding's range is directly a
 * `text.splice` offset.
 */
export function spellingTargets(
  document: DeckDocument,
  refs: TextRefSupplier = defaultTextRefs,
  options: WalkOptions = {},
): SpellingTarget[] {
  const order = options.slideIds ?? slideOrder(document.deck);
  const out: SpellingTarget[] = [];
  for (const slideId of order) {
    const slide = document.slides[slideId];
    if (slide === undefined) continue;
    for (const ref of refs(slide)) {
      if (ref.text === '') continue;
      out.push({
        slideId,
        ...(ref.blockId === undefined ? {} : { blockId: ref.blockId }),
        path: ref.path,
        text: ref.text,
        plain: plainOf(ref.text),
        kind: ref.blockId === undefined ? 'field' : 'text',
      });
    }
    if (options.notes === true && slide.notes !== undefined && slide.notes !== '') {
      out.push({ slideId, path: '/notes', text: slide.notes, plain: slide.notes, kind: 'notes' });
    }
    if (options.alt === true) {
      for (const ref of altTextRefs(slide))
        out.push({
          slideId,
          ...(ref.blockId === undefined ? {} : { blockId: ref.blockId }),
          path: ref.path,
          text: ref.text,
          plain: ref.text,
          kind: 'alt',
        });
    }
  }
  return out;
}

export type Token = { start: number; end: number; word: string };

const LETTER_RUN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** The words of a plain string with their offsets: letter runs with apostrophes inside (R10 4.5). */
export function tokenize(plain: string): Token[] {
  const out: Token[] = [];
  for (const match of plain.matchAll(LETTER_RUN)) {
    if (match.index === undefined) continue;
    out.push({ start: match.index, end: match.index + match[0].length, word: match[0] });
  }
  return out;
}

export type SkipOptions = {
  /** proper nouns, product tokens, the personal dictionary and the Ignore all set, compared exactly and lower cased */
  ignore?: ReadonlyArray<string>;
};

/** The tokens the walk never checks (R10 4.5). */
export function skipWord(word: string, options: SkipOptions = {}): boolean {
  if (word.length < 2) return true;
  if (/\d/u.test(word)) return true;
  // an internal capital: camelCase, a dotted identifier's tail
  const inner = word.slice(1);
  if (/\p{Lu}/u.test(inner) && /\p{Ll}/u.test(word)) return true;
  // two to five capitals: an acronym
  if (/^\p{Lu}{2,5}$/u.test(word)) return true;
  const lower = word.toLowerCase();
  return (options.ignore ?? []).some((entry) => entry === word || entry.toLowerCase() === lower);
}

/** The words a personal dictionary and a deck's noun list hold, deduplicated and trimmed. */
export function ignoreSet(...lists: ReadonlyArray<ReadonlyArray<string> | undefined>): string[] {
  const out = new Set<string>();
  for (const list of lists)
    for (const word of list ?? []) if (word.trim() !== '') out.add(word.trim());
  return [...out];
}

/** The offset of a plain run inside a target that a URL occupies: none, the URL is not visible text. */
function checkable(target: SpellingTarget): string {
  return target.plain;
}

/**
 * The misspellings of the targets through an engine: each word not correct and not skipped, with
 * up to five suggestions, in reading order. The same word is looked up once per call.
 */
export function findMisspellings(
  targets: ReadonlyArray<SpellingTarget>,
  engine: SpellEngine,
  options: SkipOptions & { maxSuggestions?: number } = {},
): Misspelling[] {
  const out: Misspelling[] = [];
  const known = new Map<string, string[] | null>();
  const max = options.maxSuggestions ?? 5;
  for (const target of targets) {
    for (const token of tokenize(checkable(target))) {
      if (skipWord(token.word, options)) continue;
      let suggestions = known.get(token.word);
      if (suggestions === undefined) {
        suggestions = engine.correct(token.word) ? null : engine.suggest(token.word, max);
        known.set(token.word, suggestions);
      }
      if (suggestions === null) continue;
      out.push({
        slideId: target.slideId,
        ...(target.blockId === undefined ? {} : { blockId: target.blockId }),
        path: target.path,
        range: [token.start, token.end],
        word: token.word,
        suggestions: suggestions.slice(0, max),
      });
    }
  }
  return out;
}

/** Every occurrence of a word across the targets, for Change all (whole words, case sensitive). */
export function occurrencesOf(
  targets: ReadonlyArray<SpellingTarget>,
  word: string,
): { slideId: string; blockId?: string; path: string; range: [number, number] }[] {
  const out: { slideId: string; blockId?: string; path: string; range: [number, number] }[] = [];
  for (const target of targets) {
    for (const token of tokenize(target.plain)) {
      if (token.word !== word) continue;
      out.push({
        slideId: target.slideId,
        ...(target.blockId === undefined ? {} : { blockId: target.blockId }),
        path: target.path,
        range: [token.start, token.end],
      });
    }
  }
  return out;
}

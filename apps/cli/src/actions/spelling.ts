// The spelling lane's handlers (gslides-parity SPEC-5 7.2, 7.4; MILESTONES-5 B5 "Owns"; R10 4.9,
// 8): spelling.check and spelling.replace over the document, dictionary.add, dictionary.remove
// and dictionary.list over the caller's preferences record, dictionary.lookup over the
// definitions port with the Wiktionary page as the fallback. The module stays free of `node:`
// imports and of the spelling package: the editor page imports this graph through
// store-actions.ts, so the engine, the walk and the dictionaries reach the handlers as ports the
// dispatcher composition injects (`SpellingLaneDeps`), Node's port on the CLI, the MCP server
// and the hosted studio (`@turboslide/spelling/node` nodeSpelling), and the Worker's in the page
// (`@turboslide/spelling/client`), the way `measureCanvas` reaches the canvas writes. A
// dispatcher composed without a port answers the sentence naming it instead of a wrong answer.
// `spelling.ignore` and `accessibility.verbalize` are window only and live in the controller.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Mutation } from '@turboslide/schema/mutations';
import { getPreference, setPreference } from '@turboslide/schema/preferences';
import type { PreferencesStore } from '@turboslide/schema/preferences';
import { plainOf, spliceText } from '@turboslide/schema/text';

import { commit } from '../store-actions.ts';
import type { StoreActionDeps, WriteContext } from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

/** One misspelling as `spelling.check` answers it (SPEC-5 13). */
export type SpellingFinding = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
  word: string;
  suggestions: string[];
};

export type SpellingCheckRequest = {
  document: DeckDocument;
  language: string;
  slideIds?: ReadonlyArray<string>;
  notes?: boolean;
  alt?: boolean;
  /** the personal dictionary and the deck's nouns; never reported */
  ignore?: ReadonlyArray<string>;
};

export type SpellingCheckAnswer = {
  language: string;
  /** the dictionary tag that answered; null when the language has none */
  dictionary: string | null;
  misspellings: SpellingFinding[];
};

export type SpellingOccurrence = {
  slideId: string;
  blockId?: string;
  path: string;
  range: [number, number];
};

/**
 * The spelling port a composition injects (`@turboslide/spelling/port` DocumentSpellingPort has the
 * same shape; the two are one contract kept in step by hand because this module cannot import
 * that package into the editor's graph): the walk and the engine over a document.
 */
export type SpellingLanePort = {
  check: (request: SpellingCheckRequest) => Promise<SpellingCheckAnswer>;
  /** every whole word occurrence across the document's texts and notes, for Change all */
  occurrences: (document: DeckDocument, word: string) => SpellingOccurrence[];
  addWord?: (word: string) => Promise<void>;
};

/** The definitions port of the hosted studio (SPEC-5 7.4): null when the provider is the link alone. */
export type DefinePort = (
  word: string,
  language: string,
) => Promise<{
  definitions: { partOfSpeech: string; definitions: string[] }[];
  attribution: string;
} | null>;

/** The checkout's `.turboslide/dictionary.txt` (R10 4.8), when the composition offers it. */
export type DictionaryFilePort = {
  read: () => ReadonlyArray<string>;
  write: (words: ReadonlyArray<string>) => void;
};

export type SpellingLaneDeps = LaneDeps & {
  preferences?: PreferencesStore;
  spelling?: SpellingLanePort;
  define?: DefinePort;
  dictionaryFile?: DictionaryFilePort;
};

/** The Wiktionary attribution line the panel prints under the definitions (CC BY-SA). */
export const WIKTIONARY_ATTRIBUTION = 'Definitions from Wiktionary, CC BY-SA 4.0';

/** The Wiktionary page of a word in the language's edition (`en.wiktionary.org` for `en-US`). */
export function wiktionaryUrl(word: string, language: string): string {
  const primary = language.split('-')[0]?.toLowerCase() ?? 'en';
  const host = /^[a-z]{2,3}$/u.test(primary) ? primary : 'en';
  return `https://${host}.wiktionary.org/wiki/${encodeURIComponent(word.trim().replace(/\s+/gu, '_'))}`;
}

/** The refusal of a dispatcher composed without a port, naming the port and the transport. */
export function noSpellingPort(id: string): string {
  return `${id} needs the spelling engine on this transport (the dictionaries as packages on a checkout, the Worker in the editor); the dispatcher was composed without it`;
}

export function noPreferencesStore(id: string): string {
  return `${id} needs the caller's preferences record on this transport (the principal record under .turboslide/principals/ on a checkout, the principal store hosted); the dispatcher was composed without it`;
}

/** The deck's language, `en-US` when absent (SPEC-5 7.1). */
export function deckLanguage(document: DeckDocument): string {
  return document.deck.language ?? 'en-US';
}

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

/** The value at a JSON pointer inside a slide (a slide field, a block's text through the slot lists). */
function textAt(document: DeckDocument, occurrence: SpellingOccurrence): string | undefined {
  const slide = requireSlide(document, occurrence.slideId);
  if (occurrence.blockId === undefined) {
    if (occurrence.path === '/notes') return slide.notes;
    const value = (slide as unknown as Record<string, unknown>)[occurrence.path.slice(1)];
    return typeof value === 'string' ? value : undefined;
  }
  const lists: unknown[][] =
    slide.kind === 'content'
      ? Object.values(slide.slots)
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [slide.plate.blocks]
        : [];
  for (const list of lists) {
    const found = findBlock(list, occurrence.blockId);
    if (found === undefined) continue;
    let value: unknown = found;
    for (const key of occurrence.path.split('/').slice(1)) {
      if (value === null || typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[key];
    }
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function findBlock(list: unknown[], blockId: string): Record<string, unknown> | undefined {
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue;
    const block = entry as Record<string, unknown>;
    if (block['id'] === blockId) return block;
    const cells = block['cells'];
    if (Array.isArray(cells)) {
      for (const cell of cells) {
        const inner = (cell as { blocks?: unknown[] }).blocks;
        if (Array.isArray(inner)) {
          const found = findBlock(inner, blockId);
          if (found !== undefined) return found;
        }
      }
    }
  }
  return undefined;
}

/**
 * The mutation that writes a replacement at a plain range of a target: a `text.splice` on a
 * block's Text (the flags of the replaced run stay), a `slide.set` on the notes (plain) and on
 * the fixed compositions' fields (markup spliced).
 */
export function replacementMutation(
  document: DeckDocument,
  occurrence: SpellingOccurrence,
  replacement: string,
): Mutation | null {
  const current = textAt(document, occurrence);
  if (current === undefined) return null;
  const [start, end] = occurrence.range;
  if (occurrence.blockId !== undefined) {
    return {
      op: 'text.splice',
      slideId: occurrence.slideId,
      blockId: occurrence.blockId,
      path: occurrence.path,
      at: start,
      remove: end - start,
      insert: replacement,
    };
  }
  if (occurrence.path === '/notes') {
    if (end > current.length) return null;
    return {
      op: 'slide.set',
      slideId: occurrence.slideId,
      path: '/notes',
      value: current.slice(0, start) + replacement + current.slice(end),
    };
  }
  if (end > plainOf(current).length) return null;
  return {
    op: 'slide.set',
    slideId: occurrence.slideId,
    path: occurrence.path,
    value: spliceText(current, start, end - start, replacement),
  };
}

export type SpellingCheckInput = {
  slideIds?: 'all' | string[];
  notes?: boolean;
  alt?: boolean;
  language?: string;
};

export type SpellingReplaceInput = SpellingOccurrence & {
  blockId: string;
  text: string;
  all?: boolean;
  baseRevision: number;
};

export async function spellingCheck(
  deps: SpellingLaneDeps,
  input: SpellingCheckInput,
): Promise<{ language: string; misspellings: SpellingFinding[] }> {
  const port = deps.spelling;
  if (port === undefined) throw new Error(noSpellingPort('spelling.check'));
  const document = (await deps.store.read()).document;
  const language = input.language ?? deckLanguage(document);
  const personal = deps.preferences === undefined ? [] : await dictionaryOf(deps);
  const answer = await port.check({
    document,
    language,
    ...(input.slideIds !== undefined && input.slideIds !== 'all'
      ? { slideIds: input.slideIds }
      : {}),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.alt === undefined ? {} : { alt: input.alt }),
    ignore: [...personal, ...(deps.dictionaryFile?.read() ?? [])],
  });
  return {
    language: answer.language,
    misspellings: answer.misspellings.map((row) => ({
      ...row,
      suggestions: row.suggestions.slice(0, 5),
    })),
  };
}

export async function spellingReplace(
  deps: SpellingLaneDeps,
  ctx: WriteContext,
  input: SpellingReplaceInput,
): Promise<{ slide: Slide; revision: number; findings: never[]; replacements: number }> {
  const current = (await deps.store.read()).document;
  const target: SpellingOccurrence = {
    slideId: input.slideId,
    blockId: input.blockId,
    path: input.path,
    range: input.range,
  };
  const text = textAt(current, target);
  if (text === undefined)
    throw new RangeError(`No text at ${input.slideId}#${input.blockId}${input.path}`);
  const plain = plainOf(text);
  const [start, end] = input.range;
  if (start < 0 || end > plain.length || start >= end)
    throw new RangeError(
      `The range ${start},${end} is outside a text of ${plain.length} characters`,
    );
  const word = plain.slice(start, end);
  let occurrences: SpellingOccurrence[] = [target];
  if (input.all === true) {
    const port = deps.spelling;
    if (port === undefined) throw new Error(noSpellingPort('spelling.replace'));
    const found = port.occurrences(current, word);
    if (found.length > 0) occurrences = found;
  }
  // later ranges of one text first, so an earlier splice never moves a later offset
  const ordered = [...occurrences].sort((a, b) =>
    a.slideId === b.slideId && a.blockId === b.blockId && a.path === b.path
      ? b.range[0] - a.range[0]
      : slideOrder(current.deck).indexOf(a.slideId) - slideOrder(current.deck).indexOf(b.slideId),
  );
  const mutations: Mutation[] = [];
  for (const occurrence of ordered) {
    const mutation = replacementMutation(current, occurrence, input.text);
    if (mutation !== null) mutations.push(mutation);
  }
  if (mutations.length === 0) {
    if (input.baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return {
      slide: requireSlide(current, input.slideId),
      revision: current.deck.revision,
      findings: [],
      replacements: 0,
    };
  }
  const committed = await commit(deps as StoreActionDeps, ctx, input.baseRevision, mutations);
  return {
    slide: requireSlide(committed.document, input.slideId),
    revision: committed.revision,
    findings: [],
    replacements: mutations.length,
  };
}

async function dictionaryOf(deps: SpellingLaneDeps): Promise<string[]> {
  const store = deps.preferences;
  if (store === undefined) return [];
  const value = getPreference(await store.load(), '/spelling/dictionary');
  return Array.isArray(value)
    ? value.filter((word): word is string => typeof word === 'string')
    : [];
}

export async function dictionaryList(deps: SpellingLaneDeps): Promise<{ dictionary: string[] }> {
  if (deps.preferences === undefined) throw new Error(noPreferencesStore('dictionary.list'));
  const words = new Set([...(await dictionaryOf(deps)), ...(deps.dictionaryFile?.read() ?? [])]);
  return { dictionary: [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
}

export async function dictionaryAdd(
  deps: SpellingLaneDeps,
  input: { word: string },
): Promise<{ dictionary: string[] }> {
  const store = deps.preferences;
  if (store === undefined) throw new Error(noPreferencesStore('dictionary.add'));
  const word = input.word.trim();
  if (word === '' || /\s/u.test(word)) throw new TypeError('dictionary.add takes one word');
  const current = await store.load();
  const list = await dictionaryOf(deps);
  if (!list.includes(word))
    await store.save(setPreference(current, '/spelling/dictionary', [...list, word]));
  if (deps.dictionaryFile !== undefined) {
    const file = deps.dictionaryFile.read();
    if (!file.includes(word)) deps.dictionaryFile.write([...file, word]);
  }
  await deps.spelling?.addWord?.(word);
  return dictionaryList(deps);
}

export async function dictionaryRemove(
  deps: SpellingLaneDeps,
  input: { word: string },
): Promise<{ dictionary: string[] }> {
  const store = deps.preferences;
  if (store === undefined) throw new Error(noPreferencesStore('dictionary.remove'));
  const word = input.word.trim();
  const current = await store.load();
  const list = await dictionaryOf(deps);
  if (list.includes(word))
    await store.save(
      setPreference(
        current,
        '/spelling/dictionary',
        list.filter((entry) => entry !== word),
      ),
    );
  if (deps.dictionaryFile !== undefined) {
    const file = deps.dictionaryFile.read();
    if (file.includes(word)) deps.dictionaryFile.write(file.filter((entry) => entry !== word));
  }
  return dictionaryList(deps);
}

export type DictionaryLookupInput = { word?: string; language?: string };

export async function dictionaryLookup(
  deps: SpellingLaneDeps,
  input: DictionaryLookupInput,
): Promise<{
  word: string;
  url: string;
  definitions?: { partOfSpeech: string; definitions: string[] }[];
  attribution?: string;
}> {
  const word = input.word?.trim() ?? '';
  if (word === '')
    throw new TypeError(
      'dictionary.lookup needs a word on this transport (the editor takes the selection)',
    );
  const document = (await deps.store.read()).document;
  const language = input.language ?? deckLanguage(document);
  const url = wiktionaryUrl(word, language);
  if (deps.define === undefined) return { word, url };
  const answer = await deps.define(word, language);
  if (answer === null || answer.definitions.length === 0) return { word, url };
  return { word, url, definitions: answer.definitions, attribution: answer.attribution };
}

export function registerSpellingActions(dispatcher: Dispatcher, deps: SpellingLaneDeps): void {
  dispatcher.register('spelling.check', (input) =>
    spellingCheck(deps, input as SpellingCheckInput),
  );
  dispatcher.register('spelling.replace', (input, ctx) =>
    spellingReplace(deps, ctx as WriteContext, input as SpellingReplaceInput),
  );
  dispatcher.register('dictionary.add', (input) => dictionaryAdd(deps, input as { word: string }));
  dispatcher.register('dictionary.remove', (input) =>
    dictionaryRemove(deps, input as { word: string }),
  );
  dispatcher.register('dictionary.list', () => dictionaryList(deps));
  dispatcher.register('dictionary.lookup', (input) =>
    dictionaryLookup(deps, input as DictionaryLookupInput),
  );
}

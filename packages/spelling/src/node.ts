// The Node side of the spell check (gslides-parity SPEC-5 7.2; R10 4.4): the dictionaries read
// as packages beside this module (`dictionary-en` and kin, resolved through `createRequire` so
// pnpm's layout never matters), one engine per tag cached for the process, the personal
// dictionary file a checkout may carry (`.turboslide/dictionary.txt`, one word per line) and the
// port the CLI, the MCP server and the hosted studio hand the `spelling.check` handler and the
// `text/spelling` lint rule. The Worker path is `worker.ts`; the shapes are `port.ts`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { CorrectionTable } from './engine.ts';
import { createSpellEngine } from './engine.ts';
import type { DictionaryFiles } from './engine.ts';
import { DICTIONARY_PACKAGES, dictionaryTagFor } from './index.ts';
import type { DictionaryTag } from './index.ts';
import type { SpellCheckAnswer, SpellCheckRequest, SpellEngine, SpellingPort } from './port.ts';
import type { DeckDocument } from '@turboslide/schema/deck';

import {
  defaultTextRefs,
  findMisspellings,
  ignoreSet,
  occurrencesOf,
  spellingTargets,
} from './walk.ts';
import type { TextRefSupplier } from './walk.ts';

/** The personal dictionary file of a checkout, one word per line, `#` lines ignored (R10 4.8). */
export const DICTIONARY_FILE = 'dictionary.txt';

/** The aff and dic files of a shipped tag, read from the installed package. */
export function loadDictionaryNode(tag: DictionaryTag): DictionaryFiles {
  const pkg = DICTIONARY_PACKAGES[tag];
  // the packages export their entry alone, so the entry's folder is where the two files sit
  const entry = createRequire(import.meta.url).resolve(pkg);
  const dir = dirname(entry);
  return {
    aff: readFileSync(join(dir, 'index.aff'), 'utf8'),
    dic: readFileSync(join(dir, 'index.dic'), 'utf8'),
  };
}

/** The words of a `.turboslide/dictionary.txt`, or none when the file is absent. */
export function readDictionaryFile(stateDir: string): string[] {
  const path = join(stateDir, DICTIONARY_FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

export type NodeSpellingOptions = {
  /** the correction list whose fix ranks first (`@turboslide/schema/autocorrect-lists` CORRECTIONS) */
  corrections?: CorrectionTable;
  /** the checkout's state folder, for `dictionary.txt`; none hosted */
  stateDir?: string;
  /** words never reported on every call: the proper nouns and the product tokens */
  ignore?: ReadonlyArray<string>;
  /** the caller's personal dictionary, read per call so a `dictionary.add` shows at once */
  personal?: () => Promise<ReadonlyArray<string>> | ReadonlyArray<string>;
};

/**
 * The Node port: engines per tag, loaded on first use and kept for the process; a language
 * without a shipped dictionary answers `dictionary: null` and no misspellings (the card says the
 * browser's marks apply).
 */
export function nodeSpelling(options: NodeSpellingOptions = {}): SpellingPort {
  const engines = new Map<DictionaryTag, SpellEngine>();
  const added: string[] = [];
  const engineFor = (tag: DictionaryTag): SpellEngine => {
    const existing = engines.get(tag);
    if (existing !== undefined) return existing;
    const engine = createSpellEngine(loadDictionaryNode(tag), {
      ...(options.corrections === undefined ? {} : { corrections: options.corrections }),
      personal: added,
    });
    engines.set(tag, engine);
    return engine;
  };
  return {
    async check(request: SpellCheckRequest): Promise<SpellCheckAnswer> {
      const tag = dictionaryTagFor(request.language);
      if (tag === null) return { language: request.language, dictionary: null, misspellings: [] };
      const personal = await options.personal?.();
      const file = options.stateDir === undefined ? [] : readDictionaryFile(options.stateDir);
      const ignore = ignoreSet(options.ignore, personal, file, request.ignore);
      const misspellings = findMisspellings(request.targets, engineFor(tag), { ignore });
      return { language: request.language, dictionary: tag, misspellings };
    },
    async addWord(word: string): Promise<void> {
      if (word.trim() === '') return;
      added.push(word.trim());
      for (const engine of engines.values()) engine.add(word);
    },
    dispose() {
      engines.clear();
    },
  };
}

/** Writes a checkout's `dictionary.txt`, one word per line, sorted, the file created when absent. */
export function writeDictionaryFile(stateDir: string, words: ReadonlyArray<string>): string {
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, DICTIONARY_FILE);
  const sorted = [...new Set(words.map((word) => word.trim()).filter((word) => word !== ''))].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
  writeFileSync(path, sorted.length === 0 ? '' : `${sorted.join('\n')}\n`);
  return path;
}

/** The document level request of the lane handlers (`apps/cli/src/actions/spelling.ts` SpellingCheckRequest). */
export type DocumentSpellingRequest = {
  document: DeckDocument;
  language: string;
  slideIds?: ReadonlyArray<string>;
  notes?: boolean;
  alt?: boolean;
  ignore?: ReadonlyArray<string>;
};

/**
 * The port the lane handlers take (the same shape as `SpellingLanePort` in
 * `apps/cli/src/actions/spelling.ts`, which cannot import this package into the editor's graph):
 * the walk over a document with the injected text supplier, then the engine.
 */
export type DocumentSpellingPort = {
  check: (request: DocumentSpellingRequest) => Promise<SpellCheckAnswer>;
  occurrences: (
    document: DeckDocument,
    word: string,
  ) => { slideId: string; blockId?: string; path: string; range: [number, number] }[];
  addWord?: (word: string) => Promise<void>;
};

/** The Node port over a document: `refs` names the texts of a slide (the linter's supplier on the CLI). */
export function documentSpelling(
  options: NodeSpellingOptions & { refs?: TextRefSupplier } = {},
): DocumentSpellingPort {
  const port = nodeSpelling(options);
  const refs = options.refs ?? defaultTextRefs;
  return {
    check: (request) =>
      port.check({
        language: request.language,
        targets: spellingTargets(request.document, refs, {
          ...(request.slideIds === undefined ? {} : { slideIds: request.slideIds }),
          ...(request.notes === undefined ? {} : { notes: request.notes }),
          ...(request.alt === undefined ? {} : { alt: request.alt }),
        }),
        ...(request.ignore === undefined ? {} : { ignore: request.ignore }),
      }),
    occurrences: (document, word) =>
      occurrencesOf(spellingTargets(document, refs, { notes: true }), word),
    ...(port.addWord === undefined ? {} : { addWord: port.addWord }),
  };
}

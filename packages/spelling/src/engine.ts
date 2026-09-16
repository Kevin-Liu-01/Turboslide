// nspell wrapped once (gslides-parity SPEC-5 7.2, 0.35; R10 4.3): the Hunspell affix and word
// files as strings in, a `SpellEngine` out, the same code in the Worker and in Node. The
// suggestions put Turboslide's own correction list first (autocorrect-lists.ts: `teh` is `the`,
// which nspell alone ranks below `ten`), then nspell's, deduplicated and capped. A word the person
// added travels to the engine through `add`; the record itself is the caller's (the preferences).
import nspell from 'nspell';

import type { SpellEngine } from './port.ts';

export type DictionaryFiles = { aff: string; dic: string };

/** A correction table (`@turboslide/schema/autocorrect-lists` CORRECTIONS): the lower cased misspelling to its fix. */
export type CorrectionTable = Readonly<Record<string, string>>;

export type EngineOptions = {
  /** words added before the first check: the personal dictionary */
  personal?: ReadonlyArray<string>;
  /** the correction list whose fix ranks first among the suggestions */
  corrections?: CorrectionTable;
};

/** The engine over one dictionary; `personal` words are added before the first check. */
export function createSpellEngine(
  files: DictionaryFiles,
  options: EngineOptions = {},
): SpellEngine {
  const checker = nspell(files.aff, files.dic);
  for (const word of options.personal ?? []) if (word.trim() !== '') checker.add(word.trim());
  const corrections = options.corrections ?? {};
  return {
    correct: (word) => checker.correct(word),
    suggest: (word, max = 5) => rankSuggestions(word, checker.suggest(word), max, corrections),
    add: (word) => {
      if (word.trim() !== '') checker.add(word.trim());
    },
  };
}

/** The correction list's fix first, then nspell's list without it, at most `max` entries. */
export function rankSuggestions(
  word: string,
  suggested: ReadonlyArray<string>,
  max = 5,
  corrections: CorrectionTable = {},
): string[] {
  const out: string[] = [];
  const fix = corrections[word.toLowerCase()];
  if (fix !== undefined) out.push(matchCase(word, fix));
  for (const candidate of suggested) {
    if (out.includes(candidate) || candidate === word) continue;
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/** A replacement written in the misspelt word's case pattern (capitalised, all capitals, as is). */
export function matchCase(word: string, replacement: string): string {
  if (word === word.toUpperCase() && word.length > 1 && /\p{L}/u.test(word))
    return replacement.toUpperCase();
  const first = word.charAt(0);
  if (first !== first.toLowerCase())
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** The bytes of a fetched or read dictionary file as the string nspell parses (UTF-8). */
export function decodeDictionary(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

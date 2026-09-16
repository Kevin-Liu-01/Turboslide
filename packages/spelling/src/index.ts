// @turboslide/spelling (gslides-parity SPEC-5 7.2, 0.35; MILESTONES-5 B5 "Owns"): the spell check
// over nspell 2.1.5 in a Worker and in Node with lazily loaded dictionaries (en, en-GB, fr, es,
// pt, pt-PT, nl; German and Italian are GPL only and Kevin's, R10 12 item 1), the walk over every
// Text pointer in reading order, then the notes, then the alt texts, skipping URLs, code,
// identifiers, acronyms, the proper noun lists and the personal dictionary (R10 4.5). This module
// is the dictionary catalog: the seven tags in the File > Language order, the package each one is
// read from in Node, the licence option each ships under, the file names the browser fetches
// under apps/studio/public/dictionaries/<tag>/ and the gzip budget scripts/check-dictionaries.mjs
// holds them to. The engine (`engine.ts`), the walk (`walk.ts`), the Worker (`worker.ts`) and the
// Node loader (`node.ts`) land on day 4 beside it. Like every package under packages/ but viewer
// and chrome, this one stays framework free (SPEC 3.3), and this module imports nothing so
// scripts/check-dictionaries.mjs can read the tables through Node's type stripping.

/** The dictionary tags the round ships (SPEC-5 7.2), in the File > Language order. */
export const DICTIONARY_TAGS = ['en', 'en-GB', 'fr', 'es', 'pt', 'pt-PT', 'nl'] as const;
export type DictionaryTag = (typeof DICTIONARY_TAGS)[number];

export function isDictionaryTag(value: string): value is DictionaryTag {
  return (DICTIONARY_TAGS as readonly string[]).includes(value);
}

/** The dictionary package per tag (R10 4.4), pinned in the pnpm catalog by the integrator. */
export const DICTIONARY_PACKAGES: Readonly<Record<DictionaryTag, string>> = {
  en: 'dictionary-en',
  'en-GB': 'dictionary-en-gb',
  fr: 'dictionary-fr',
  es: 'dictionary-es',
  pt: 'dictionary-pt',
  'pt-PT': 'dictionary-pt-pt',
  nl: 'dictionary-nl',
};

/**
 * The licence option each dictionary ships under (R10 4.4 and summary item 2): the package's
 * SPDX expression names alternatives, and Turboslide takes the permissive or weak copyleft one,
 * so the dictionary files stay under their own notice beside the app and nothing GPL only is
 * served. The `LICENSE` file beside each pair is the package's notice, copied verbatim.
 */
export const DICTIONARY_LICENCES: Readonly<Record<DictionaryTag, string>> = {
  en: 'MIT AND BSD',
  'en-GB': 'MIT AND BSD',
  fr: 'MPL-2.0',
  es: 'MPL-1.1',
  pt: 'MPL-2.0',
  'pt-PT': 'MPL-1.1',
  nl: 'BSD-3-Clause',
};

/**
 * The tags whose only dictionaries are GPL (R10 4.4, 12 item 1; SPEC-5 17): never copied under
 * the public folder unless Kevin's decision writes the flag file there, which the check reads.
 */
export const GPL_ONLY_DICTIONARY_TAGS = ['de', 'it'] as const;
export const GPL_ACCEPTED_FLAG = '.gpl-accepted';

/** The folder under apps/studio/public the browser fetches the pairs from. */
export const DICTIONARIES_PUBLIC_DIR = 'dictionaries';

/**
 * The files of one dictionary under `<public>/dictionaries/<tag>/`: the affix and word files
 * stored gzip compressed (the wire bytes are the budget's bytes on every host, and the Worker
 * inflates them through `DecompressionStream`), the notice as text, and the manifest beside the
 * folders naming every tag with its sizes and digests.
 */
export const DICTIONARY_FILE_NAMES = {
  aff: 'index.aff.gz',
  dic: 'index.dic.gz',
  licence: 'LICENSE',
} as const;
export const DICTIONARIES_MANIFEST_NAME = 'manifest.json';

/**
 * The gzip budget per tag in bytes (the affix and word files together), set from the first
 * measurement on 2026-09-15 (b5.md section 1) with about ten percent of headroom, and the total
 * over the seven. R10 4.4 named 400,000 as the working figure before any measurement; en, en-GB,
 * fr, es and pt-PT are under it, nl (822,731) and pt (1,378,300) are not, and both stay lazy
 * loads for a deck in their language. A dictionary that grows past its row fails
 * scripts/check-dictionaries.mjs until the row is raised with the reason recorded.
 */
export const DICTIONARY_GZIP_BUDGETS: Readonly<Record<DictionaryTag, number>> = {
  en: 220_000,
  'en-GB': 220_000,
  fr: 380_000,
  es: 260_000,
  pt: 1_500_000,
  'pt-PT': 260_000,
  nl: 900_000,
};
export const DICTIONARIES_GZIP_BUDGET_TOTAL = 3_800_000;

/** The URLs of one dictionary's files under a base path (`/dictionaries` on the studio). */
export function dictionaryUrls(
  tag: DictionaryTag,
  base = `/${DICTIONARIES_PUBLIC_DIR}`,
): { aff: string; dic: string; licence: string } {
  return {
    aff: `${base}/${tag}/${DICTIONARY_FILE_NAMES.aff}`,
    dic: `${base}/${tag}/${DICTIONARY_FILE_NAMES.dic}`,
    licence: `${base}/${tag}/${DICTIONARY_FILE_NAMES.licence}`,
  };
}

/** One tag's row of the manifest scripts/check-dictionaries.mjs writes and checks. */
export type DictionaryManifestFile = { bytes: number; gzipBytes: number; sha256: string };
export type DictionaryManifestEntry = {
  package: string;
  version: string;
  /** the option taken (`DICTIONARY_LICENCES`) */
  licence: string;
  /** the package's own SPDX expression */
  spdx: string;
  aff: DictionaryManifestFile;
  dic: DictionaryManifestFile;
  /** the affix and word files' gzip bytes together */
  gzipBytes: number;
  budgetGzipBytes: number;
};
export type DictionaryManifest = {
  files: typeof DICTIONARY_FILE_NAMES;
  tags: Record<DictionaryTag, DictionaryManifestEntry>;
};

/**
 * The tag a deck's BCP 47 language maps to (R10 5.2): the region form when the round ships it
 * (`en-GB`, `pt-PT`), else the language alone (`en-US` and `en-AU` read `en`, `pt-BR` reads
 * `pt`), else null, which the card reports as "No dictionary for <language>; the browser's marks
 * apply" rather than checking German against English.
 */
export function dictionaryTagFor(language: string): DictionaryTag | null {
  const wanted = language.trim().toLowerCase();
  if (wanted === '') return null;
  const exact = DICTIONARY_TAGS.find((tag) => tag.toLowerCase() === wanted);
  if (exact !== undefined) return exact;
  const base = wanted.split('-')[0] ?? '';
  return DICTIONARY_TAGS.find((tag) => tag.toLowerCase() === base) ?? null;
}

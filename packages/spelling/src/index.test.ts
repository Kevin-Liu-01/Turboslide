import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DICTIONARIES_GZIP_BUDGET_TOTAL,
  DICTIONARIES_MANIFEST_NAME,
  DICTIONARIES_PUBLIC_DIR,
  DICTIONARY_FILE_NAMES,
  DICTIONARY_GZIP_BUDGETS,
  DICTIONARY_LICENCES,
  DICTIONARY_PACKAGES,
  DICTIONARY_TAGS,
  GPL_ONLY_DICTIONARY_TAGS,
  dictionaryTagFor,
  dictionaryUrls,
  isDictionaryTag,
} from './index.ts';
import type { DictionaryManifest } from './index.ts';

// The dictionary catalog (gslides-parity SPEC-5 7.2; R10 4.4, 5.2): the seven tags, one package
// and one licence option each, the budget rows, the language to tag map, and the manifest under
// apps/studio/public/dictionaries/ agreeing with the tables (scripts/check-dictionaries.mjs
// writes it from the installed packages and checks the files against it).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PUBLIC_DIR = join(ROOT, 'apps/studio/public', DICTIONARIES_PUBLIC_DIR);

describe('the dictionary tags', () => {
  it('ships seven dictionaries, one package and one permissive or weak copyleft licence each', () => {
    expect(DICTIONARY_TAGS).toEqual(['en', 'en-GB', 'fr', 'es', 'pt', 'pt-PT', 'nl']);
    for (const tag of DICTIONARY_TAGS) {
      expect(DICTIONARY_PACKAGES[tag]).toBe(`dictionary-${tag.toLowerCase()}`);
      expect(DICTIONARY_LICENCES[tag]).not.toMatch(/GPL/);
      expect(DICTIONARY_GZIP_BUDGETS[tag]).toBeGreaterThan(0);
    }
    expect(Object.values(DICTIONARY_GZIP_BUDGETS).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      DICTIONARIES_GZIP_BUDGET_TOTAL,
    );
    expect(GPL_ONLY_DICTIONARY_TAGS).toEqual(['de', 'it']);
    expect(isDictionaryTag('pt-PT')).toBe(true);
    expect(isDictionaryTag('de')).toBe(false);
  });

  it('maps a language tag to its dictionary, the region form first, null without one (R10 5.2)', () => {
    expect(dictionaryTagFor('en-US')).toBe('en');
    expect(dictionaryTagFor('en-AU')).toBe('en');
    expect(dictionaryTagFor('en-GB')).toBe('en-GB');
    expect(dictionaryTagFor('en-gb')).toBe('en-GB');
    expect(dictionaryTagFor('pt-BR')).toBe('pt');
    expect(dictionaryTagFor('pt-PT')).toBe('pt-PT');
    expect(dictionaryTagFor('fr')).toBe('fr');
    expect(dictionaryTagFor('fr-CA')).toBe('fr');
    expect(dictionaryTagFor('nl-BE')).toBe('nl');
    expect(dictionaryTagFor('de')).toBeNull();
    expect(dictionaryTagFor('it-IT')).toBeNull();
    expect(dictionaryTagFor('')).toBeNull();
  });

  it('names the files the browser fetches', () => {
    expect(dictionaryUrls('pt-PT')).toEqual({
      aff: '/dictionaries/pt-PT/index.aff.gz',
      dic: '/dictionaries/pt-PT/index.dic.gz',
      licence: '/dictionaries/pt-PT/LICENSE',
    });
    expect(dictionaryUrls('en', 'https://turboslide.vercel.app/dictionaries').dic).toBe(
      'https://turboslide.vercel.app/dictionaries/en/index.dic.gz',
    );
  });
});

describe('the public folder', () => {
  it('holds every tag with its three files and a manifest that agrees with the tables and the budgets', () => {
    const manifestPath = join(PUBLIC_DIR, DICTIONARIES_MANIFEST_NAME);
    expect(
      existsSync(manifestPath),
      `${manifestPath} (node scripts/check-dictionaries.mjs --write)`,
    ).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DictionaryManifest;
    expect(manifest.files).toEqual(DICTIONARY_FILE_NAMES);
    expect(Object.keys(manifest.tags).sort()).toEqual([...DICTIONARY_TAGS].sort());
    let total = 0;
    for (const tag of DICTIONARY_TAGS) {
      const entry = manifest.tags[tag];
      expect(entry.package).toBe(DICTIONARY_PACKAGES[tag]);
      expect(entry.licence).toBe(DICTIONARY_LICENCES[tag]);
      expect(entry.spdx).toContain(DICTIONARY_LICENCES[tag].split(' ')[0]);
      expect(entry.budgetGzipBytes).toBe(DICTIONARY_GZIP_BUDGETS[tag]);
      expect(entry.gzipBytes).toBe(entry.aff.gzipBytes + entry.dic.gzipBytes);
      expect(entry.gzipBytes).toBeLessThanOrEqual(DICTIONARY_GZIP_BUDGETS[tag]);
      total += entry.gzipBytes;
      const folder = join(PUBLIC_DIR, tag);
      expect(statSync(join(folder, DICTIONARY_FILE_NAMES.aff)).size).toBe(entry.aff.gzipBytes);
      expect(statSync(join(folder, DICTIONARY_FILE_NAMES.dic)).size).toBe(entry.dic.gzipBytes);
      expect(statSync(join(folder, DICTIONARY_FILE_NAMES.licence)).size).toBeGreaterThan(0);
    }
    expect(total).toBeLessThanOrEqual(DICTIONARIES_GZIP_BUDGET_TOTAL);
  });
});

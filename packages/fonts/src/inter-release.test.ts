// The proof that every Inter file the product serves is the rsms/inter v4.1 release by Rasmus
// Andersson (docs/POLISH-2.md 2.1, 2.4; Kevin, 2026-10-07: "are we using the correct rasmus
// inter?"): each InterVariable woff2 under assets/ (seven upright, seven italic) is read from its
// own bytes through woff2-names.ts. The name table reads the release's version string, the fvar
// table the release's two axes, the layout tables the release's features (the Latin subset keeps
// all 42; the whole upright adds cv14), and the bytes the sha256 fonts.json records. The italic's
// pins in inter.test.ts stay.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FONTS_JSON } from './export.ts';
import {
  INTER,
  INTER_ITALIC,
  INTER_NAME_VERSION,
  INTER_SUBSETS,
  interSubsetFile,
} from './inter.ts';
import { woff2Facts } from './woff2-names.ts';

const ASSETS = new URL('../assets/', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The 42 features of the Latin upright subset (GSUB and GPOS), docs/POLISH-2.md 2.1. */
const LATIN_FEATURES = [
  'aalt',
  'calt',
  'case',
  'ccmp',
  'cpsp',
  ...Array.from({ length: 13 }, (_, i) => `cv${String(i + 1).padStart(2, '0')}`),
  'dlig',
  'dnom',
  'frac',
  'kern',
  'locl',
  'mark',
  'mkmk',
  'numr',
  'ordn',
  'pnum',
  'salt',
  'sinf',
  ...Array.from({ length: 8 }, (_, i) => `ss0${i + 1}`),
  'subs',
  'sups',
  'tnum',
  'zero',
];

type WebRecord = { file: string; bytes: number; sha256: string };

describe('the Inter release (docs/POLISH-2.md 2.4)', () => {
  const files = readdirSync(ASSETS)
    .filter((file) => /^InterVariable.*\.woff2$/.test(file))
    .sort();
  const web = (JSON.parse(readFileSync(FONTS_JSON, 'utf8')) as { web: WebRecord[] }).web;
  /** the bytes and sha256 each file must have: the two whole files' records, then fonts.json web */
  const expected = new Map<string, { bytes: number; sha256: string }>([
    ['InterVariable.woff2', { bytes: INTER.bytes, sha256: INTER.sha256 }],
    ['InterVariable-Italic.woff2', { bytes: INTER_ITALIC.bytes, sha256: INTER_ITALIC.sha256 }],
    ...web.map((record) => [record.file, { bytes: record.bytes, sha256: record.sha256 }] as const),
  ]);

  it('holds fourteen files, seven upright and seven italic: the whole file and its six subsets', () => {
    expect(files).toHaveLength(14);
    expect(files.filter((file) => file.includes('-Italic'))).toHaveLength(7);
    const subsets = INTER_SUBSETS.flatMap((subset) => [
      interSubsetFile(subset, 'normal'),
      interSubsetFile(subset, 'italic'),
    ]);
    expect([...files].sort()).toEqual(
      [...subsets, 'InterVariable.woff2', 'InterVariable-Italic.woff2'].sort(),
    );
  });

  it('reads the release in every file: the version string, the two axes and the recorded bytes', () => {
    for (const file of files) {
      const bytes = readFileSync(new URL(file, ASSETS));
      const facts = woff2Facts(bytes);
      expect(facts.version, file).toBe(INTER_NAME_VERSION);
      expect(facts.version, file).toBe('Version 4.001;git-9221beed3');
      expect(facts.family, file).toBe('Inter Variable');
      expect(facts.subfamily, file).toBe(file.includes('-Italic') ? 'Italic' : 'Regular');
      expect(facts.axes, file).toEqual([
        { tag: 'opsz', min: 14, default: 14, max: 32 },
        { tag: 'wght', min: 100, default: 400, max: 900 },
      ]);
      const record = expected.get(file);
      expect(record, `${file} has a record`).toBeDefined();
      expect(bytes.byteLength, file).toBe(record?.bytes);
      expect(sha256(bytes), file).toBe(record?.sha256);
    }
  });

  it('is the release byte for byte: the whole upright is 352,240 B with the release sha256', () => {
    const bytes = readFileSync(new URL('InterVariable.woff2', ASSETS));
    expect(bytes.byteLength).toBe(352_240);
    expect(sha256(bytes)).toBe('693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3');
    expect(INTER.sha256).toBe(sha256(bytes));
  });

  it('keeps every feature: 42 in the Latin upright subset, and cv14 besides in the whole file', () => {
    const all = (file: string): string[] => {
      const facts = woff2Facts(readFileSync(new URL(file, ASSETS)));
      return [...new Set([...facts.features, ...facts.positioning])].sort();
    };
    expect(LATIN_FEATURES).toHaveLength(42);
    expect(all(interSubsetFile('latin', 'normal'))).toEqual([...LATIN_FEATURES].sort());
    expect(all('InterVariable.woff2')).toEqual([...LATIN_FEATURES, 'cv14'].sort());
    /* the italic draws the single storey a by default, so it has no cv11; the whole italic adds cv14 */
    const italic = LATIN_FEATURES.filter((tag) => tag !== 'cv11');
    expect(all(interSubsetFile('latin', 'italic'))).toEqual([...italic].sort());
    expect(all('InterVariable-Italic.woff2')).toEqual([...italic, 'cv14'].sort());
  });
});

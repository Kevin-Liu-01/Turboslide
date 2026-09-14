import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FACTS_PATH,
  FACTS_SHA256,
  FACT_KEYS,
  HOME_FACTS,
  formatCount,
  formatPercent,
} from './facts';

// The facts the /home page states (gslides-parity SPEC-4 0.25; MILESTONES-4 "The seams"): the
// counts come from packages/theme/brand/facts.json, written by scripts/build-brand.ts --facts
// (B1) and asserted against the tree by brand.test.ts. scripts/build-home-assets.ts copies the
// ten values the page needs into facts-data.ts with the file's sha256. This test asserts the copy
// is the file's: the file exists, its sha256 is the recorded one, and every count of the copy is
// the count the file carries, so `pnpm test` fails before `--check` does when the file moved on.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');

type Counted = { count?: number; total?: number };

describe('the facts copy', () => {
  const file = join(ROOT, FACTS_PATH);
  const present = existsSync(file);

  it(`was made from ${FACTS_PATH} as it stands`, () => {
    expect(present, `${FACTS_PATH} is absent (B1, build-brand.ts --facts)`).toBe(true);
    const bytes = readFileSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(
      digest,
      'facts.json changed since facts-data.ts was written; run node scripts/build-home-assets.ts',
    ).toBe(FACTS_SHA256);
    const facts = JSON.parse(bytes.toString('utf8')) as Record<string, Counted | number>;
    for (const key of FACT_KEYS) {
      const value = facts[key];
      const count = typeof value === 'number' ? value : (value?.count ?? value?.total);
      expect(HOME_FACTS[key], key).toBe(count);
    }
  });

  it('carries the counts the page needs', () => {
    for (const key of FACT_KEYS) {
      expect(Number.isInteger(HOME_FACTS[key]), key).toBe(true);
      expect(HOME_FACTS[key], key).toBeGreaterThan(0);
    }
    /* the layouts are Google's eleven and the GT layouts after them */
    expect(HOME_FACTS.layouts).toBeGreaterThan(11);
    expect(HOME_FACTS.mismatchPercent).toBeGreaterThan(0);
    expect(HOME_FACTS.licence).toBe('MIT');
  });

  it('prints a count with a thousands separator and never as words', () => {
    expect(formatCount(169)).toBe('169');
    expect(formatCount(2995)).toBe('2,995');
    expect(formatPercent(0.003)).toBe('0.003 %');
  });
});

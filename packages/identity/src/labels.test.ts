import { describe, expect, test } from 'vitest';

import ldnoobw from '../fixtures/ldnoobw-en.json' with { type: 'json' };
import {
  DENIED_NUMBERS,
  LABEL_NUMBERS,
  LABEL_SPACE,
  LABEL_WORDS,
  disambiguateLabels,
  isLabelWord,
  labelFor,
  labelPartsFor,
  matchesLabelGrammar,
} from './labels.ts';

const UUIDS = Array.from(
  { length: 2000 },
  (_v, i) => `anon_${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
);

describe('the label list', () => {
  test('holds 64 distinct capitalised words and 895 numbers', () => {
    expect(LABEL_WORDS.length).toBe(64);
    expect(new Set(LABEL_WORDS.map((w) => w.toLowerCase())).size).toBe(64);
    for (const word of LABEL_WORDS) expect(word).toMatch(/^[A-Z][a-z]{1,9}$/);
    expect(LABEL_NUMBERS.length).toBe(895);
    expect(LABEL_NUMBERS[0]).toBe(100);
    expect(LABEL_NUMBERS.at(-1)).toBe(999);
    for (const n of DENIED_NUMBERS) expect(LABEL_NUMBERS).not.toContain(n);
    expect(LABEL_SPACE).toBe(57_280);
  });

  test('no word is on the LDNOOBW English list as a whole word', () => {
    // The names rule is a word boundary match (research 11 5.3 item 6), so "Bismuth" is fine
    // although it contains an entry; the same rule applies here.
    const bad = new Set(ldnoobw.words.map((w) => w.toLowerCase()));
    expect(bad.size).toBeGreaterThan(300);
    for (const word of LABEL_WORDS) {
      const lower = word.toLowerCase();
      expect(bad.has(lower), word).toBe(false);
      for (const entry of bad) {
        const pattern = new RegExp(`(^|\\W)${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`);
        expect(pattern.test(lower), `${word} against ${entry}`).toBe(false);
      }
    }
  });

  test('no word is an animal or a given name the round rejected', () => {
    const rejected = ['Amber', 'Ruby', 'Opal', 'Pearl', 'Jade', 'Jasper', 'Ivory', 'Ash', 'Silver'];
    for (const word of rejected) expect(LABEL_WORDS).not.toContain(word);
  });
});

describe('labelFor', () => {
  test('is deterministic and has the grammar', () => {
    const a = labelFor('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b');
    expect(a).toBe(labelFor('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'));
    expect(a).toMatch(/^[A-Z][a-z]+ [1-9][0-9]{2}$/);
    const { word, number } = labelPartsFor('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b');
    expect(a).toBe(`${word} ${number}`);
    expect(LABEL_WORDS).toContain(word);
    expect(LABEL_NUMBERS).toContain(number);
  });

  test('spreads over the space: 2,000 ids use most words and collide rarely', () => {
    const labels = UUIDS.map(labelFor);
    const words = new Set(labels.map((l) => l.split(' ')[0]));
    expect(words.size).toBe(64);
    const distinct = new Set(labels).size;
    // Expected collisions for 2,000 draws from 57,280 are about 35; allow twice that.
    expect(2000 - distinct).toBeLessThan(70);
    for (const label of labels) expect(matchesLabelGrammar(label)).toBe(true);
  });

  test('never produces a denied number', () => {
    for (const label of UUIDS.map(labelFor)) {
      const n = Number(label.split(' ')[1]);
      expect(DENIED_NUMBERS).not.toContain(n);
      expect(n).toBeGreaterThanOrEqual(100);
    }
  });
});

describe('the grammar guards', () => {
  test('isLabelWord and matchesLabelGrammar', () => {
    expect(isLabelWord('Titanium')).toBe(true);
    expect(isLabelWord(' cobalt ')).toBe(true);
    expect(isLabelWord('Kevin')).toBe(false);
    expect(matchesLabelGrammar('Titanium 471')).toBe(true);
    expect(matchesLabelGrammar('titanium  471')).toBe(true);
    expect(matchesLabelGrammar('Titanium 47')).toBe(false);
    expect(matchesLabelGrammar('Titanium 4711')).toBe(false);
    expect(matchesLabelGrammar('Kevin 471')).toBe(false);
    expect(matchesLabelGrammar('Titanium')).toBe(false);
  });

  test('disambiguateLabels suffixes by first appearance and never the first', () => {
    const ids = ['a', 'b', 'c', 'a', 'd'];
    const same = (id: string): string => (id === 'c' ? 'Other 200' : 'Ink 100');
    const out = disambiguateLabels(ids, same);
    expect(out.get('a')).toBe('Ink 100');
    expect(out.get('b')).toBe('Ink 100 (2)');
    expect(out.get('c')).toBe('Other 200');
    expect(out.get('d')).toBe('Ink 100 (3)');
    expect(out.size).toBe(4);
  });
});

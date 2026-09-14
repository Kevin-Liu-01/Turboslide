import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIR_PATTERN,
  DOMAIN_PATTERN,
  PRODUCT_TOKENS,
  PROPER_NOUNS,
  metaphorCandidates,
  startsWithProductToken,
  wordsOutsideSentenceCase,
} from './copy.ts';

describe('copy lists', () => {
  it('names the six proper nouns of DECK-GRAMMAR.md:22, the product name of SPEC-4 1.2 and the product tokens', () => {
    expect(PROPER_NOUNS).toEqual([
      'General Translation',
      'Prototemplate',
      'Glyphfield',
      'Locadex',
      'Inter',
      'Heroicons',
      'Turboslide',
    ]);
    for (const token of ['gt-next', 'gt', 'npx', 'CLI', 'API'])
      expect(PRODUCT_TOKENS).toContain(token);
  });

  it('accepts sentence case with proper nouns and acronyms', () => {
    expect(wordsOutsideSentenceCase('The production site')).toEqual([]);
    expect(wordsOutsideSentenceCase('Prototemplate and Glyphfield')).toEqual([]);
    expect(wordsOutsideSentenceCase('How GT ships a locale with the CLI')).toEqual([]);
    expect(wordsOutsideSentenceCase('Open source and platform')).toEqual([]);
    expect(wordsOutsideSentenceCase('Nearest page routing in the Docs')).toEqual(['Docs']);
    expect(wordsOutsideSentenceCase('The Content Rule')).toEqual(['Content', 'Rule']);
    expect(wordsOutsideSentenceCase('The Blue Marble', ['Blue Marble'])).toEqual([]);
  });

  it('flags a heading that opens with a token or contains a domain', () => {
    expect(startsWithProductToken('gt-next in production')).toBe(true);
    expect(startsWithProductToken('The gt package')).toBe(false);
    expect(DOMAIN_PATTERN.test('prototemplate.com')).toBe(true);
    expect(DOMAIN_PATTERN.test('Prototemplate')).toBe(false);
  });

  it('finds metaphor candidates and contrast pairs', () => {
    expect(metaphorCandidates('Unlock your localization journey')).toEqual(['journey', 'unlock']);
    expect(metaphorCandidates('The list names what passes.')).toEqual([]);
    expect(CONTRAST_PAIR_PATTERN.test('Evidence, not opinions')).toBe(true);
    expect(CONTRAST_PAIR_PATTERN.test('It is not a canvas, and there are no coordinates')).toBe(
      true,
    );
    expect(CONTRAST_PAIR_PATTERN.test('The plate does not touch the picture.')).toBe(false);
  });
});

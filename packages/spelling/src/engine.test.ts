import { describe, expect, it } from 'vitest';

import { createSpellEngine, matchCase, rankSuggestions } from './engine.ts';
import { DICTIONARY_TAGS } from './index.ts';
import { loadDictionaryNode, nodeSpelling } from './node.ts';

const CORRECTIONS = { teh: 'the', recieve: 'receive' };

describe('the engine over nspell (R10 4.3, 4.11)', () => {
  it('reads every shipped tag in Node and parses the four quick ones', () => {
    for (const tag of DICTIONARY_TAGS) {
      const files = loadDictionaryNode(tag);
      expect(files.aff.length).toBeGreaterThan(100);
      expect(files.dic.length).toBeGreaterThan(1000);
    }
    // nspell parses en and en-GB in under 100 ms and es and fr in about 0.5 and 2 s on the day 3
    // machine; pt-PT, nl and pt take seconds to minutes (b5.md section 6), so the test parses the
    // quick four and the Worker loads the rest lazily
    for (const tag of ['en', 'en-GB', 'es', 'fr'] as const) {
      const engine = createSpellEngine(loadDictionaryNode(tag));
      expect(typeof engine.correct('a')).toBe('boolean');
    }
  });
  it('answers correct, suggests the correction list first and learns a word', () => {
    const engine = createSpellEngine(loadDictionaryNode('en'), { corrections: CORRECTIONS });
    expect(engine.correct('the')).toBe(true);
    expect(engine.correct("don't")).toBe(true);
    expect(engine.correct('teh')).toBe(false);
    expect(engine.suggest('teh')[0]).toBe('the');
    expect(engine.suggest('teh').length).toBeLessThanOrEqual(5);
    expect(engine.correct('Turboslide')).toBe(false);
    engine.add('Turboslide');
    expect(engine.correct('Turboslide')).toBe(true);
  });
  it('ranks and cases suggestions', () => {
    expect(
      rankSuggestions('teh', ['ten', 'eh', 'the', 'tea', 'tech', 'meh'], 5, CORRECTIONS),
    ).toEqual(['the', 'ten', 'eh', 'tea', 'tech']);
    expect(rankSuggestions('Teh', ['Ten'], 5, CORRECTIONS)).toEqual(['The', 'Ten']);
    expect(rankSuggestions('word', ['word', 'ward'], 5)).toEqual(['ward']);
    expect(matchCase('TEH', 'the')).toBe('THE');
    expect(matchCase('Teh', 'the')).toBe('The');
    expect(matchCase('teh', 'the')).toBe('the');
  });
});

describe('the Node port (SPEC-5 7.2)', () => {
  const targets = [
    {
      slideId: 's1',
      blockId: 'b1',
      path: '/text',
      text: 'Teh quick brown fox',
      plain: 'Teh quick brown fox',
      kind: 'text' as const,
    },
    {
      slideId: 's1',
      path: '/notes',
      text: 'A recieve note about GT and gtNext',
      plain: 'A recieve note about GT and gtNext',
      kind: 'notes' as const,
    },
  ];
  it('answers the misspellings of the targets with the language dictionary', async () => {
    const port = nodeSpelling({ corrections: CORRECTIONS });
    const answer = await port.check({ language: 'en-US', targets });
    expect(answer.dictionary).toBe('en');
    expect(answer.misspellings.map((row) => row.word)).toEqual(['Teh', 'recieve']);
    expect(answer.misspellings[0]?.suggestions[0]).toBe('The');
    expect(answer.misspellings[0]?.range).toEqual([0, 3]);
    expect(answer.misspellings[1]?.path).toBe('/notes');
  });
  it('honours the ignore list, the personal words and a word added for the session', async () => {
    const port = nodeSpelling({ personal: () => ['recieve'] });
    const first = await port.check({ language: 'en-US', targets, ignore: ['Teh'] });
    expect(first.misspellings).toEqual([]);
    const second = nodeSpelling();
    await second.addWord?.('Teh');
    const answer = await second.check({ language: 'en-US', targets });
    expect(answer.misspellings.map((row) => row.word)).toEqual(['recieve']);
  });
  it('answers no dictionary for a language the round does not ship', async () => {
    const answer = await nodeSpelling().check({ language: 'de-DE', targets });
    expect(answer).toEqual({ language: 'de-DE', dictionary: null, misspellings: [] });
  });
});

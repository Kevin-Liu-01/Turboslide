import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '../contracts.ts';
import { createContext } from '../context.ts';
import { checkSpelling, deckTextRefs, spellingMessage } from './spelling.ts';
import type { SpellingLintChecker } from './spelling.ts';

// The `text/spelling` rule (gslides-parity SPEC-5 7.2; R10 4.10): the text refs the spelling walk
// takes, the checker injected through the lint options, a finding per misspelling at severity 1
// with the first suggestion in its proposal, and nothing without a checker or a dictionary.

const document = {
  deck: {
    id: 'lint-spelling',
    title: 'Lint',
    theme: 'gt',
    sections: [{ id: 'main', name: 'Main', slideIds: ['cover', 'body'] }],
    assets: {},
    revision: 1,
  },
  slides: {
    cover: { id: 'cover', kind: 'title', heading: 'Teh cover', lead: 'A lead' },
    body: {
      id: 'body',
      kind: 'content',
      layout: { type: 'stack' },
      slots: {
        main: [
          { id: 'p1', type: 'paragraph', text: 'Plain text here' },
          { id: 'l1', type: 'plain', items: [{ text: 'First itm' }, { text: 'Second' }] },
        ],
      },
      notes: 'A note',
    },
  },
} as unknown as DeckDocument;

const checker: SpellingLintChecker = {
  async check(request) {
    const found = [
      {
        slideId: 'cover',
        path: '/heading',
        range: [0, 3] as [number, number],
        word: 'Teh',
        suggestions: ['The'],
      },
      {
        slideId: 'body',
        blockId: 'l1',
        path: '/items/0/text',
        range: [6, 9] as [number, number],
        word: 'itm',
        suggestions: [],
      },
    ];
    return {
      dictionary: request.language.startsWith('en') ? 'en' : null,
      misspellings: found.filter((row) => !(request.ignore ?? []).includes(row.word)),
    };
  },
};

describe('deckTextRefs', () => {
  it('lists the fields then the block texts in reading order with their pointers', () => {
    expect(deckTextRefs(document.slides['cover']!)).toEqual([
      { path: '/heading', text: 'Teh cover' },
      { path: '/lead', text: 'A lead' },
    ]);
    expect(deckTextRefs(document.slides['body']!)).toEqual([
      { blockId: 'p1', path: '/text', text: 'Plain text here' },
      { blockId: 'l1', path: '/items/0/text', text: 'First itm' },
      { blockId: 'l1', path: '/items/1/text', text: 'Second' },
    ]);
  });
});

describe('text/spelling', () => {
  it('reports a severity 1 finding per misspelling with the first suggestion', async () => {
    const ctx = createContext(document, { spelling: checker } as Parameters<
      typeof createContext
    >[1]);
    const findings = await checkSpelling(document, ctx);
    expect(
      findings.map((finding) => [
        finding.rule,
        finding.severity,
        finding.slideId,
        finding.blockId,
        finding.path,
      ]),
    ).toEqual([
      ['text/spelling', 1, 'cover', undefined, '/heading:0-3'],
      ['text/spelling', 1, 'body', 'l1', '/items/0/text:6-9'],
    ]);
    expect(findings[0]?.proposal).toBe('"Teh" is not in the dictionary; "The" is the nearest word');
    expect(findings[1]?.proposal).toBe('"itm" is not in the dictionary');
    expect(findings[0]?.kind).toBe('copy');
    expect(findings[0]?.evidence).toEqual({ text: 'Teh' });
    expect(spellingMessage({ word: 'x', suggestions: [] })).toContain('not in the dictionary');
  });
  it('honours the proper nouns, the slide filter and answers nothing without a checker or a dictionary', async () => {
    const nouns = createContext(document, { spelling: checker, properNouns: ['Teh'] } as Parameters<
      typeof createContext
    >[1]);
    expect((await checkSpelling(document, nouns)).map((f) => f.slideId)).toEqual(['body']);
    const scoped = createContext(document, { spelling: checker, slideIds: ['cover'] } as Parameters<
      typeof createContext
    >[1]);
    expect((await checkSpelling(document, scoped)).map((f) => f.slideId)).toEqual(['cover']);
    expect(await checkSpelling(document, createContext(document, {}))).toEqual([]);
    const german = {
      ...document,
      deck: { ...document.deck, language: 'de' },
    } as unknown as DeckDocument;
    expect(
      await checkSpelling(
        german,
        createContext(german, { spelling: checker } as Parameters<typeof createContext>[1]),
      ),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';

import type { SpellEngine } from './port.ts';
import {
  altTextRefs,
  defaultTextRefs,
  findMisspellings,
  ignoreSet,
  occurrencesOf,
  skipWord,
  spellingTargets,
  tokenize,
} from './walk.ts';

/** A small document: a title slide, a content slide with a paragraph, a list and a table, notes and alt text. */
const document = {
  deck: {
    id: 'walk',
    title: 'Walk',
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
          {
            id: 'p1',
            type: 'paragraph',
            text: 'Plain *bold* and [link text](https://example.com/recieve) here',
          },
          { id: 'l1', type: 'plain', items: [{ text: 'First itm' }, { text: 'Second' }] },
          {
            id: 't1',
            type: 'table',
            rows: [{ cells: [{ text: 'Cell wrd' }, { text: 'Fine' }] }],
          },
          { id: 'pic', type: 'shot', asset: 'a1', caption: 'A caption', alt: 'An alt txt' },
        ],
      },
      notes: 'Notes with a mispeling',
    },
  },
} as unknown as DeckDocument;

/** An engine that knows a short word list; everything else is wrong with one suggestion. */
const engine: SpellEngine = {
  correct: (word) => ['Teh', 'itm', 'wrd', 'txt', 'mispeling', 'recieve'].includes(word) === false,
  suggest: (word) => [`${word}!`],
  add: () => undefined,
};

describe('tokenize and the skip rules (R10 4.5)', () => {
  it('splits on non letters and keeps apostrophes inside a word', () => {
    expect(tokenize("Don't stop, it's 2026: café-crème").map((token) => token.word)).toEqual([
      "Don't",
      'stop',
      "it's",
      'café',
      'crème',
    ]);
    expect(tokenize('a  b')).toEqual([
      { start: 0, end: 1, word: 'a' },
      { start: 3, end: 4, word: 'b' },
    ]);
  });
  it('skips digits, identifiers, acronyms, one letter and the ignore list', () => {
    expect(skipWord('v2')).toBe(true);
    expect(skipWord('gtNext')).toBe(true);
    expect(skipWord('GT')).toBe(true);
    expect(skipWord('NASA')).toBe(true);
    expect(skipWord('a')).toBe(true);
    expect(skipWord('Turboslide', { ignore: ['Turboslide'] })).toBe(true);
    expect(skipWord('turboslide', { ignore: ['Turboslide'] })).toBe(true);
    expect(skipWord('hello')).toBe(false);
    expect(skipWord('Hello')).toBe(false);
    expect(skipWord('SIXLETTERS')).toBe(false);
  });
  it('unions the word lists without blanks', () => {
    expect(ignoreSet(['a', ' b '], undefined, ['a', ''])).toEqual(['a', 'b']);
  });
});

describe('the targets in reading order (R10 4.5)', () => {
  it('lists the fields, the block texts, then the notes, then the alt texts', () => {
    const targets = spellingTargets(document, defaultTextRefs, { notes: true, alt: true });
    expect(
      targets.map(
        (target) =>
          `${target.slideId}${target.blockId === undefined ? '' : `#${target.blockId}`}${target.path}`,
      ),
    ).toEqual([
      'cover/heading',
      'cover/lead',
      'body#p1/text',
      'body#l1/items/0/text',
      'body#l1/items/1/text',
      'body#t1/rows/0/cells/0/text',
      'body#t1/rows/0/cells/1/text',
      'body#pic/caption',
      'body/notes',
      'body#pic/alt',
    ]);
    expect(targets[2]?.plain).toBe('Plain bold and link text here');
    expect(targets.map((target) => target.kind)).toContain('notes');
    expect(altTextRefs(document.slides['body']!)).toEqual([
      { blockId: 'pic', path: '/alt', text: 'An alt txt' },
    ]);
  });
  it('restricts to the named slides and leaves the notes and alt out by default', () => {
    const targets = spellingTargets(document, defaultTextRefs, { slideIds: ['body'] });
    expect(targets.every((target) => target.slideId === 'body')).toBe(true);
    expect(targets.some((target) => target.kind === 'notes' || target.kind === 'alt')).toBe(false);
  });
  it('takes an injected supplier', () => {
    const targets = spellingTargets(document, () => [{ path: '/heading', text: 'x' }]);
    expect(targets.map((target) => target.path)).toEqual(['/heading', '/heading']);
  });
});

describe('findMisspellings', () => {
  it('maps every finding to a plain range with suggestions, skipping the URL and the marks', () => {
    const targets = spellingTargets(document, defaultTextRefs, { notes: true, alt: true });
    const found = findMisspellings(targets, engine);
    expect(found.map((row) => `${row.path}:${row.word}@${row.range.join('-')}`)).toEqual([
      '/heading:Teh@0-3',
      '/items/0/text:itm@6-9',
      '/rows/0/cells/0/text:wrd@5-8',
      '/notes:mispeling@13-22',
      '/alt:txt@7-10',
    ]);
    expect(found[0]?.suggestions).toEqual(['Teh!']);
    expect(found[0]?.slideId).toBe('cover');
    expect(found[0]?.blockId).toBeUndefined();
    expect(found[1]?.blockId).toBe('l1');
  });
  it('honours the ignore list and looks a word up once', () => {
    let calls = 0;
    const counting: SpellEngine = {
      ...engine,
      correct: (word) => {
        calls += 1;
        return engine.correct(word);
      },
    };
    const targets = spellingTargets(
      {
        ...document,
        slides: {
          ...document.slides,
          extra: { id: 'extra', kind: 'statement', big: 'Teh Teh Teh' },
        },
      } as unknown as DeckDocument,
      defaultTextRefs,
      { slideIds: ['extra'] },
    );
    expect(findMisspellings(targets, counting).length).toBe(3);
    expect(calls).toBe(1);
    expect(findMisspellings(targets, engine, { ignore: ['Teh'] })).toEqual([]);
  });
  it('finds every occurrence of a word for Change all', () => {
    const targets = spellingTargets(document, defaultTextRefs, { notes: true });
    expect(occurrencesOf(targets, 'Teh')).toEqual([
      { slideId: 'cover', path: '/heading', range: [0, 3] },
    ]);
    expect(occurrencesOf(targets, 'missing')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  applyCorrection,
  autocorrect,
  autocorrectText,
  isIdentifier,
  isTriggerKey,
  linkUrlOf,
  listPrefix,
  smartQuote,
  spellingFix,
  tokenBefore,
} from './autocorrect.ts';
import {
  CORRECTIONS,
  QUOTE_STYLES,
  SENTENCE_EXCEPTIONS,
  quoteStyleFor,
} from './autocorrect-lists.ts';
import { defaultPreferences } from './preferences.ts';
import type { Preferences } from './preferences.ts';
import { plainOf } from './text.ts';

const prefs = defaultPreferences();
const off = (patch: Partial<Preferences['autocorrect']>): Preferences => ({
  ...prefs,
  autocorrect: { ...prefs.autocorrect, ...patch },
});

describe('the lists (R10 1.6, 2.2)', () => {
  it('carry the abbreviation categories and about two hundred corrections', () => {
    expect(SENTENCE_EXCEPTIONS).toContain('e.g.');
    expect(SENTENCE_EXCEPTIONS).toContain('mr.');
    expect(SENTENCE_EXCEPTIONS).toContain('a.');
    expect(SENTENCE_EXCEPTIONS.length).toBeGreaterThan(60);
    expect(Object.keys(CORRECTIONS).length).toBeGreaterThanOrEqual(200);
    for (const [from, to] of Object.entries(CORRECTIONS)) {
      expect(from).toBe(from.toLowerCase());
      expect(to).not.toBe(from);
    }
  });
  it('map every language of 1.5 and read English for the rest', () => {
    expect(quoteStyleFor('en-US')).toBe(QUOTE_STYLES['en']);
    expect(quoteStyleFor('fr')).toBe(QUOTE_STYLES['fr']);
    expect(quoteStyleFor('de-DE').double).toEqual(['„', '“']);
    expect(quoteStyleFor('xx')).toBe(QUOTE_STYLES['en']);
  });
});

describe('the token helpers', () => {
  it('read the token before the caret and the trigger keys', () => {
    expect(tokenBefore('hello (c)', 9)).toEqual({ start: 6, token: '(c)' });
    expect(tokenBefore('  ', 2)).toEqual({ start: 2, token: '' });
    expect(isTriggerKey(' ')).toBe(true);
    expect(isTriggerKey('.')).toBe(true);
    expect(isTriggerKey('"')).toBe(true);
    expect(isTriggerKey('a')).toBe(false);
  });
  it('know an identifier and a link token', () => {
    expect(isIdentifier('gtNext')).toBe(true);
    expect(isIdentifier('v2')).toBe(true);
    expect(isIdentifier('deck.json')).toBe(true);
    expect(isIdentifier('teh')).toBe(false);
    expect(isIdentifier('Hello')).toBe(false);
    expect(linkUrlOf('https://example.com/a')).toBe('https://example.com/a');
    expect(linkUrlOf('www.example.com,')).toBe('https://www.example.com');
    expect(linkUrlOf('example.com')).toBeNull();
    expect(linkUrlOf('www.')).toBeNull();
  });
  it('recognise the list prefixes of G11', () => {
    expect(listPrefix('-')).toEqual({ marker: 'bullet' });
    expect(listPrefix('*')).toEqual({ marker: 'bullet' });
    expect(listPrefix('1.')).toEqual({ marker: 'number', preset: 'digit-alpha-roman' });
    expect(listPrefix('1)')).toEqual({ marker: 'number', preset: 'digit-alpha-roman' });
    expect(listPrefix('(1)')).toEqual({ marker: 'number', preset: 'digit-alpha-roman' });
    expect(listPrefix('a.')).toEqual({ marker: 'number', preset: 'alpha-roman-digit' });
    expect(listPrefix('I.')).toEqual({ marker: 'number', preset: 'roman-alpha-digit' });
    expect(listPrefix('12.')).toBeNull();
    expect(listPrefix('hello')).toBeNull();
  });
  it('keep the capitalisation pattern of a corrected word', () => {
    expect(spellingFix('teh')).toBe('the');
    expect(spellingFix('Teh')).toBe('The');
    expect(spellingFix('TEH')).toBe('THE');
    expect(spellingFix('hello')).toBeNull();
  });
});

describe('the rules (R10 1.3)', () => {
  const rows: [
    string,
    string,
    number,
    string,
    Preferences,
    string,
    ReturnType<typeof autocorrect>,
  ][] = [
    [
      'substitution (c)',
      'hello (c)',
      9,
      ' ',
      prefs,
      'en-US',
      { at: 6, remove: 3, insert: '©', rule: 'substitution' },
    ],
    [
      'substitution ->',
      'a ->',
      4,
      ' ',
      prefs,
      'en-US',
      { at: 2, remove: 2, insert: '→', rule: 'substitution' },
    ],
    ['substitution is exact and case sensitive', 'a (C)', 5, ' ', prefs, 'en-US', null],
    [
      'substitution master off',
      'hello (c)',
      9,
      ' ',
      { ...prefs, substitutions: { ...prefs.substitutions, on: false } },
      'en-US',
      null,
    ],
    [
      'spelling teh',
      'teh',
      3,
      ' ',
      off({ capitalize: false }),
      'en-US',
      { at: 0, remove: 3, insert: 'the', rule: 'spelling' },
    ],
    [
      'spelling before a period',
      'I recieve',
      9,
      '.',
      prefs,
      'en-US',
      { at: 2, remove: 7, insert: 'receive', rule: 'spelling' },
    ],
    ['spelling off', 'teh', 3, ' ', off({ spelling: false, capitalize: false }), 'en-US', null],
    ['spelling is English only', 'teh', 3, ' ', off({ capitalize: false }), 'fr', null],
    ['spelling skips a proper noun mid sentence', 'ask Teh', 7, ' ', prefs, 'en-US', null],
    [
      'capital first word',
      'hello',
      5,
      ' ',
      prefs,
      'en-US',
      { at: 0, remove: 1, insert: 'H', rule: 'capitalize' },
    ],
    [
      'capital after a period',
      'Done. next',
      10,
      ' ',
      prefs,
      'en-US',
      { at: 6, remove: 1, insert: 'N', rule: 'capitalize' },
    ],
    [
      'capital after a question mark',
      'Why? because',
      12,
      ' ',
      prefs,
      'en-US',
      { at: 5, remove: 1, insert: 'B', rule: 'capitalize' },
    ],
    ['no capital after an abbreviation', 'e.g. apples', 11, ' ', prefs, 'en-US', null],
    ['no capital after Mr.', 'Mr. smith', 9, ' ', prefs, 'en-US', null],
    ['no capital mid sentence', 'The quick brown', 15, ' ', prefs, 'en-US', null],
    ['no capital on an identifier', 'gtNext', 6, ' ', prefs, 'en-US', null],
    ['no capital on a dotted name', 'deck.json', 9, ' ', prefs, 'en-US', null],
    ['no capital on a number', '3.', 2, ' ', off({ lists: false }), 'en-US', null],
    ['capital off', 'hello', 5, ' ', off({ capitalize: false }), 'en-US', null],
    [
      'link https',
      'see https://example.com',
      23,
      ' ',
      prefs,
      'en-US',
      {
        at: 4,
        remove: 19,
        insert: 'https://example.com',
        link: 'https://example.com',
        rule: 'link',
      },
    ],
    [
      'link www',
      'see www.example.com',
      19,
      '\n',
      prefs,
      'en-US',
      {
        at: 4,
        remove: 15,
        insert: 'www.example.com',
        link: 'https://www.example.com',
        rule: 'link',
      },
    ],
    ['no link on a punctuation trigger', 'see https://example.com', 23, ',', prefs, 'en-US', null],
    ['no link on a bare domain', 'see example.com', 15, ' ', prefs, 'en-US', null],
    ['link off', 'see https://example.com', 23, ' ', off({ links: false }), 'en-US', null],
    [
      'double quote opens at a start',
      '',
      0,
      '"',
      prefs,
      'en-US',
      { at: 0, remove: 0, insert: '“', rule: 'quotes', consumesTrigger: true },
    ],
    [
      'double quote closes after a word',
      'hello',
      5,
      '"',
      prefs,
      'en-US',
      { at: 5, remove: 0, insert: '”', rule: 'quotes', consumesTrigger: true },
    ],
    [
      'apostrophe between letters',
      'don',
      3,
      "'",
      prefs,
      'en-US',
      { at: 3, remove: 0, insert: '’', rule: 'quotes', consumesTrigger: true },
    ],
    [
      'single quote opens after a space',
      'say ',
      4,
      "'",
      prefs,
      'en-US',
      { at: 4, remove: 0, insert: '‘', rule: 'quotes', consumesTrigger: true },
    ],
    [
      'French guillemet with the inner space',
      'dit ',
      4,
      '"',
      prefs,
      'fr',
      { at: 4, remove: 0, insert: '«\u202F', rule: 'quotes', consumesTrigger: true },
    ],
    [
      'German low nine',
      '',
      0,
      '"',
      prefs,
      'de',
      { at: 0, remove: 0, insert: '„', rule: 'quotes', consumesTrigger: true },
    ],
    ['quotes off', 'hello', 5, '"', off({ quotes: false }), 'en-US', null],
    ['nothing on an empty token', 'hello ', 6, ' ', prefs, 'en-US', null],
    ['nothing on a letter key', 'hello', 5, 'a', prefs, 'en-US', null],
  ];
  it.each(rows)('%s', (_name, paragraph, caret, key, preferences, language, expected) => {
    expect(autocorrect(paragraph, caret, key, preferences, language)).toEqual(expected);
  });

  it('starts a list from a typed prefix on a listable pointer alone', () => {
    expect(autocorrect('-', 1, ' ', prefs, 'en-US', { listable: true })).toEqual({
      at: 0,
      remove: 1,
      insert: '',
      rule: 'list',
      list: { marker: 'bullet' },
    });
    expect(autocorrect('1.', 2, ' ', prefs, 'en-US', { listable: true })).toEqual({
      at: 0,
      remove: 2,
      insert: '',
      rule: 'list',
      list: { marker: 'number', preset: 'digit-alpha-roman' },
    });
    expect(autocorrect('-', 1, ' ', prefs, 'en-US', { listable: true, isList: true })).toBeNull();
    expect(autocorrect('-', 1, ' ', prefs, 'en-US')).toBeNull();
    expect(autocorrect('-', 1, ' ', off({ lists: false }), 'en-US', { listable: true })).toBeNull();
    // the prefix is only a list at the start of the paragraph
    expect(autocorrect('a -', 3, ' ', prefs, 'en-US', { listable: true })).toBeNull();
  });

  it('leaves a token inside a link and a personal word alone', () => {
    expect(autocorrect('x (c)', 5, ' ', prefs, 'en-US', { inLink: true })).toBeNull();
    expect(autocorrect('hello', 5, '"', prefs, 'en-US', { inLink: true })).toBeNull();
    expect(autocorrect('teh', 3, ' ', prefs, 'en-US', { exceptions: ['teh'] })).toBeNull();
    expect(autocorrect('npx', 3, ' ', prefs, 'en-US', { exceptions: ['npx'] })).toBeNull();
    expect(autocorrect('GT', 2, ' ', prefs, 'en-US')).toBeNull();
  });

  it('applies a text correction and leaves a link or list correction to the caller', () => {
    expect(
      applyCorrection('hello (c)', { at: 6, remove: 3, insert: '©', rule: 'substitution' }),
    ).toBe('hello ©');
    expect(
      applyCorrection('teh quick', { at: 0, remove: 3, insert: 'the', rule: 'spelling' }),
    ).toBe('the quick');
    expect(
      applyCorrection('see www.a.com', {
        at: 4,
        remove: 9,
        insert: 'www.a.com',
        link: 'https://www.a.com',
        rule: 'link',
      }),
    ).toBe('see www.a.com');
    expect(
      applyCorrection('-', {
        at: 0,
        remove: 1,
        insert: '',
        rule: 'list',
        list: { marker: 'bullet' },
      }),
    ).toBe('-');
  });

  it('answers the quote for a caret without a trigger through smartQuote', () => {
    expect(smartQuote('(', 1, '"', 'en-US')).toBe('“');
    expect(smartQuote('a', 1, '"', 'es')).toBe('»');
    expect(smartQuote('', 0, 'x', 'en-US')).toBeNull();
  });
});

describe('the agent form autocorrectText (SPEC-5 7.1)', () => {
  it('applies the token rules across a markup text and lists the changes', () => {
    const result = autocorrectText('teh quick (c) brown -> *fox*', prefs, 'en-US');
    expect(plainOf(result.text)).toBe('The quick © brown → fox');
    expect(result.changes.map((change) => change.rule)).toEqual([
      'spelling',
      'capitalize',
      'substitution',
      'substitution',
    ]);
    expect(result.changes[0]).toEqual({ at: 0, from: 'teh', to: 'the', rule: 'spelling' });
    // the mark survives the splices
    expect(result.text.endsWith('*fox*')).toBe(true);
  });
  it('links a typed address and curls the quotes', () => {
    const result = autocorrectText('Read "this" at www.example.com now', prefs, 'en-US');
    expect(plainOf(result.text)).toBe('Read “this” at www.example.com now');
    expect(result.text).toContain('[www.example.com](https://www.example.com)');
    expect(result.changes.map((change) => change.rule).sort()).toEqual([
      'link',
      'quotes',
      'quotes',
    ]);
  });
  it('leaves a link text, the GT mark and an already correct text alone', () => {
    const linked = autocorrectText('[teh](https://example.com) fine', prefs, 'en-US');
    expect(linked.changes).toEqual([]);
    expect(autocorrectText('GT is here', prefs, 'en-US').changes).toEqual([]);
    expect(autocorrectText('Nothing to fix here', prefs, 'en-US').changes).toEqual([]);
  });
  it('walks every paragraph of a multiline text', () => {
    const result = autocorrectText('first line\nteh second\nthird (r)', prefs, 'en-US');
    expect(plainOf(result.text)).toBe('First line\nThe second\nThird ®');
    expect(result.changes.length).toBe(5);
    expect(result.changes.map((change) => change.at)).toEqual([0, 11, 11, 22, 28]);
  });
  it('honours the switches', () => {
    const silent: Preferences = {
      ...prefs,
      autocorrect: {
        capitalize: false,
        spelling: false,
        links: false,
        lists: false,
        quotes: false,
      },
      substitutions: { ...prefs.substitutions, on: false },
    };
    expect(autocorrectText('teh quick (c) "brown"', silent, 'en-US').changes).toEqual([]);
  });
});

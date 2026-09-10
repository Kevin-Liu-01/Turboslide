import { describe, expect, it } from 'vitest';
import type { Run } from './text.ts';
import { canonicalText, parseText, plainText, serializeRuns } from './text.ts';

describe('parseText', () => {
  it('reads plain text as one run', () => {
    expect(parseText('Every product in every language')).toEqual([
      { t: 'Every product in every language' },
    ]);
  });

  it('reads the display run', () => {
    expect(parseText('The *content* rule')).toEqual([
      { t: 'The ' },
      { t: 'content', b: true },
      { t: ' rule' },
    ]);
  });

  it('reads a link', () => {
    expect(parseText('See [the docs](https://generaltranslation.com/docs) today')).toEqual([
      { t: 'See ' },
      { t: 'the docs', link: 'https://generaltranslation.com/docs' },
      { t: ' today' },
    ]);
  });

  it('marks a standalone GT and leaves gt-next, GT/ and GTs alone', () => {
    expect(parseText('How GT ships a locale')).toEqual([
      { t: 'How ' },
      { t: 'GT', gt: true },
      { t: ' ships a locale' },
    ]);
    expect(parseText('gt-next and GT-mark')).toEqual([{ t: 'gt-next and GT-mark' }]);
    expect(parseText('https://GT.example/x')).toEqual([{ t: 'https://GT.example/x' }]);
    expect(parseText('GT')).toEqual([{ t: 'GT', gt: true }]);
    expect(parseText('(GT)')).toEqual([{ t: '(' }, { t: 'GT', gt: true }, { t: ')' }]);
  });

  it('honors the three escapes', () => {
    expect(parseText('5 \\* 3 and \\[x] and \\GT')).toEqual([{ t: '5 * 3 and [x] and GT' }]);
  });

  it('treats an unclosed star or bracket as a literal', () => {
    expect(parseText('a * b')).toEqual([{ t: 'a * b' }]);
    expect(parseText('a [b] c')).toEqual([{ t: 'a [b] c' }]);
    expect(parseText('**')).toEqual([{ t: '**' }]);
  });

  it('nests a link and a GT inside a display run', () => {
    expect(parseText('*GT and [docs](https://x.y)*')).toEqual([
      { t: 'GT', b: true, gt: true },
      { t: ' and ', b: true },
      { t: 'docs', b: true, link: 'https://x.y' },
    ]);
  });

  it('does not mark GT inside a link', () => {
    expect(parseText('[GT](https://generaltranslation.com)')).toEqual([
      { t: 'GT', link: 'https://generaltranslation.com' },
    ]);
  });

  it('keeps a non-breaking space as text', () => {
    expect(parseText('8 by 8')).toEqual([{ t: '8 by 8' }]);
  });
});

describe('serializeRuns', () => {
  it('escapes stars, brackets and a plain GT', () => {
    expect(serializeRuns([{ t: '5 * 3 [x] GT' }])).toBe('5 \\* 3 \\[x] \\GT');
  });

  it('groups adjacent display runs in one pair of stars', () => {
    const runs: Run[] = [
      { t: 'a ', b: true },
      { t: 'b', b: true, link: 'https://x.y' },
      { t: ' c' },
    ];
    expect(serializeRuns(runs)).toBe('*a [b](https://x.y)* c');
  });

  it('writes a gt run as the two letters', () => {
    expect(serializeRuns([{ t: 'How ' }, { t: 'GT', gt: true }, { t: ' ships' }])).toBe(
      'How GT ships',
    );
  });
});

describe('round trips', () => {
  const canonical = [
    'Every product in every language',
    'The *content* rule',
    'See [the docs](https://generaltranslation.com/docs) today',
    'How GT ships a locale',
    '5 \\* 3 and \\[x] and \\GT',
    '*GT and [docs](https://x.y)*',
    '[GT](https://generaltranslation.com)',
    'a \\* b',
    'The 8 by 8 screen',
    'gt-next, gt-react, gt-vue',
    'prototemplate.com and glyphfield.com',
  ];

  it.each(canonical)('serialize(parse(%j)) is the identity on canonical text', (text) => {
    expect(serializeRuns(parseText(text))).toBe(text);
  });

  it('canonicalizes the escaped forms of loose text', () => {
    expect(canonicalText('a * b')).toBe('a \\* b');
    expect(canonicalText('a [b] c')).toBe('a \\[b] c');
    expect(canonicalText('a *b* c')).toBe('a *b* c');
    expect(canonicalText(canonicalText('x ** y [z'))).toBe(canonicalText('x ** y [z'));
  });

  const runs: Run[][] = [
    [{ t: 'plain' }],
    [{ t: 'a ' }, { t: 'b', b: true }, { t: ' c' }],
    [{ t: 'GT', gt: true }, { t: ' first' }],
    [
      { t: 'x', link: 'https://x.y' },
      { t: 'GT', gt: true },
    ],
    [{ t: 'x', link: 'https://x.y' }, { t: 'GT' }],
    [{ t: '*[', b: true }, { t: ']*' }],
  ];

  it.each(runs)('parse(serialize(runs)) returns the runs', (...list) => {
    expect(parseText(serializeRuns(list))).toEqual(list);
  });
});

describe('plainText', () => {
  it('drops the markup', () => {
    expect(plainText('The *content* [rule](https://x.y) of GT')).toBe('The content rule of GT');
  });
});

import { describe, expect, it } from 'vitest';
import type { Run } from './text.ts';
import {
  blockLinkSchema,
  blockLinkSlide,
  canonicalText,
  multilineTextSchema,
  parseParagraphs,
  parseText,
  plainText,
  serializeRuns,
  slideLinkTarget,
  slideLinkUrl,
  slideLinksOf,
  splitParagraphs,
  textSchema,
} from './text.ts';

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

describe('multilineTextSchema (gslides-parity SPEC 7.4)', () => {
  it('accepts a paragraph break and refuses a carriage return; textSchema still refuses both', () => {
    expect(multilineTextSchema.safeParse('one\ntwo').success).toBe(true);
    expect(multilineTextSchema.safeParse('one\r\ntwo').success).toBe(false);
    expect(multilineTextSchema.safeParse('one\rtwo').success).toBe(false);
    expect(textSchema.safeParse('one\ntwo').success).toBe(false);
    expect(textSchema.safeParse('one\rtwo').success).toBe(false);
    expect(textSchema.safeParse('one two').success).toBe(true);
  });

  it('splits paragraphs, parses each and canonicalizes per paragraph', () => {
    expect(splitParagraphs('a\nb\n')).toEqual(['a', 'b', '']);
    expect(parseParagraphs('a *b*\nc')).toEqual([[{ t: 'a ' }, { t: 'b', b: true }], [{ t: 'c' }]]);
    expect(canonicalText('a * b\n[x] c')).toBe('a \\* b\n\\[x] c');
    // an unclosed star on one paragraph never reaches the next
    expect(canonicalText('*open\nclose*')).toBe('\\*open\nclose\\*');
    expect(plainText('one *two*\nthree')).toBe('one two\nthree');
  });
});

describe('slide links (gslides-parity SPEC 7.2.8)', () => {
  it('reads #s/<id> and the four keywords, and nothing else', () => {
    expect(slideLinkTarget('#s/content-rule')).toEqual({ slide: 'content-rule' });
    expect(slideLinkTarget('#next')).toEqual({ slide: 'next' });
    expect(slideLinkTarget('#previous')).toEqual({ slide: 'previous' });
    expect(slideLinkTarget('#first')).toEqual({ slide: 'first' });
    expect(slideLinkTarget('#last')).toEqual({ slide: 'last' });
    expect(slideLinkTarget('#s/Not A Slug')).toBeNull();
    expect(slideLinkTarget('#other')).toBeNull();
    expect(slideLinkTarget('https://x.y')).toBeNull();
    expect(slideLinkUrl({ slide: 'thesis' })).toBe('#s/thesis');
    expect(slideLinkUrl({ slide: 'next' })).toBe('#next');
  });

  it('parses a slide link as a run link and lists the targets of a Text', () => {
    expect(parseText('See [the table](#s/table) or [the end](#last)')).toEqual([
      { t: 'See ' },
      { t: 'the table', link: '#s/table' },
      { t: ' or ' },
      { t: 'the end', link: '#last' },
    ]);
    expect(
      slideLinksOf('See [the table](#s/table), [docs](https://x.y) or [the end](#last)'),
    ).toEqual([{ slide: 'table' }, { slide: 'last' }]);
  });

  it('reads a block link as a URL or a slide', () => {
    expect(blockLinkSchema.safeParse('https://generaltranslation.com').success).toBe(true);
    expect(blockLinkSchema.safeParse({ slide: 'thesis' }).success).toBe(true);
    expect(blockLinkSchema.safeParse({ slide: 'first' }).success).toBe(true);
    expect(blockLinkSchema.safeParse({ slide: 'Nope' }).success).toBe(false);
    expect(blockLinkSchema.safeParse('').success).toBe(false);
    expect(blockLinkSlide({ slide: 'thesis' })).toEqual({ slide: 'thesis' });
    expect(blockLinkSlide('#next')).toEqual({ slide: 'next' });
    expect(blockLinkSlide('https://x.y')).toBeNull();
    expect(blockLinkSlide(undefined)).toBeNull();
  });
});

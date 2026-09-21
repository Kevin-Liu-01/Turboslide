// The plain offset primitives of the multiplayer text path (gslides-parity SPEC-3 3.1): spliceText,
// markRange and flagDiffs, plus the link scheme rule of SPEC-3 8.4 layer 3.
import { describe, expect, it } from 'vitest';
import {
  blockLinkSchema,
  canonicalText,
  flagDiffs,
  isAllowedLink,
  markRange,
  plainLength,
  plainOf,
  refusedLinksOf,
  runFlagsSchema,
  spliceText,
} from './text.ts';

const MARKED = 'Every *post* states [what](https://x.y) was built.';

describe('spliceText (SPEC-3 3.1)', () => {
  it('inserts plain text with the flags of the run it continues', () => {
    expect(spliceText('The content rule', 4, 0, 'copy ')).toBe('The copy content rule');
    // typing at the end of a display run continues it
    expect(spliceText('Every *post* states', 10, 0, 's')).toBe('Every *posts* states');
    // typing at the start of a display run continues the plain run before it
    expect(spliceText('Every *post* states', 6, 0, 'a ')).toBe('Every a *post* states');
    // typing at the very start takes the flags of the run that starts there
    expect(spliceText('*Post* states', 0, 0, 'A ')).toBe('*A Post* states');
    // typing inside a link continues the link; at its end the letters leave it (below)
    expect(spliceText(MARKED, 21, 0, 'ever')).toBe(
      'Every *post* states [whaevert](https://x.y) was built.',
    );
    expect(spliceText(MARKED, 22, 0, 'ever')).toBe(
      'Every *post* states [what](https://x.y)ever was built.',
    );
    // typing at the end of a link continues the sentence, never the link (docs/PRODUCT.md
    // section 2 rank 9; the link detection's space and the words after it stay plain)
    expect(spliceText('Visit [acme.com](https://acme.com)', 14, 0, ' today')).toBe(
      'Visit [acme.com](https://acme.com) today',
    );
    expect(spliceText('See [acme.com](https://acme.com) now', 12, 0, 's')).toBe(
      'See [acme.com](https://acme.com)s now',
    );
    // a bold link keeps the bold and drops the address at its end
    expect(spliceText('[*acme*](https://acme.com)', 4, 0, 's')).toBe('*[acme](https://acme.com)s*');
    // a paragraph break typed at a link's end starts a plain paragraph
    expect(spliceText('[acme.com](https://acme.com)', 8, 0, '\nmore')).toBe(
      '[acme.com](https://acme.com)\nmore',
    );
  });

  it('deletes across runs and keeps the flags of what stays', () => {
    expect(spliceText(MARKED, 6, 5, '')).toBe('Every states [what](https://x.y) was built.');
    expect(spliceText(MARKED, 0, 6, '')).toBe('*post* states [what](https://x.y) was built.');
    // a deletion that crosses into a display run keeps the run's tail bold
    expect(spliceText(MARKED, 3, 5, '')).toBe('Eve*st* states [what](https://x.y) was built.');
  });

  it('replaces in one step with the flags of the first replaced character', () => {
    expect(spliceText('The content rule', 4, 7, 'copy')).toBe('The copy rule');
    // retyping a bold word keeps it bold, as typing over a selection does
    expect(spliceText(MARKED, 6, 4, 'note')).toBe(
      'Every *note* states [what](https://x.y) was built.',
    );
    // retyping from inside a plain run into the link stays plain
    expect(spliceText(MARKED, 16, 5, 'x')).toBe('Every *post* statex[t](https://x.y) was built.');
  });

  it('drops the link when the replacement covers the whole linked span', () => {
    // the heading case of VERIFICATION.md product pass 1 finding 5: the address typed, linked
    // on Enter, then a word typed over the whole selection; the editable's anchor left with its
    // last character and the document kept the address, so the two disagreed and the next link
    // apply spliced markup at plain offsets
    expect(spliceText('[sales@acme.com](mailto:sales@acme.com)', 0, 14, 'Renewal')).toBe('Renewal');
    expect(spliceText(MARKED, 18, 4, 'which')).toBe('Every *post* states which was built.');
    // a linked span of several runs (a bold word inside the link) counts whole; the letters keep
    // the first character's other marks
    expect(
      spliceText('See *[acme](https://acme.com)*[.com](https://acme.com) now', 4, 8, 'Globex'),
    ).toBe('See *Globex* now');
    expect(spliceText('*[acme](https://acme.com)*', 0, 4, 'Globex')).toBe('*Globex*');
    // a replacement that starts or ends inside the span keeps the link
    expect(spliceText(MARKED, 19, 3, 'o')).toBe('Every *post* states [wo](https://x.y) was built.');
    expect(spliceText(MARKED, 18, 3, 'x')).toBe('Every *post* states [xt](https://x.y) was built.');
    // a wider replacement that begins before the link takes the plain run's flags, as before
    expect(spliceText(MARKED, 11, 11, 'said')).toBe('Every *post* said was built.');
  });

  it('joins paragraphs when the break is removed and starts one on a newline', () => {
    expect(spliceText('First.\nSecond.', 6, 1, '')).toBe('First.Second.');
    expect(spliceText('First.\nSecond.', 5, 3, '')).toBe('Firstecond.');
    expect(spliceText('First. Second.', 6, 0, '\n')).toBe('First.\n Second.');
    expect(spliceText('*A*\n*B*', 1, 1, '')).toBe('*AB*');
    expect(spliceText('One', 3, 0, '\nTwo\nThree')).toBe('One\nTwo\nThree');
  });

  it('splits a GT run and re-escapes what is left', () => {
    expect(spliceText('See GT now', 5, 2, '')).toBe('See Gnow');
    expect(spliceText('See GT now', 5, 0, 'x')).toBe('See GxT now');
    // removing the word around GT leaves a plain GT, which is the gt run again
    expect(spliceText('See GT now', 0, 4, '')).toBe('GT now');
  });

  it('is canonical and counts plain offsets', () => {
    for (const [text, at, remove, insert] of [
      [MARKED, 6, 4, 'note'],
      [MARKED, 0, 0, '*'],
      ['a\nb', 1, 1, ''],
      ['5 \\* 3', 2, 0, '['],
    ] as const) {
      const next = spliceText(text, at, remove, insert);
      expect(canonicalText(next)).toBe(next);
      expect(plainLength(next)).toBe(plainLength(text) - remove + insert.length);
    }
    expect(plainOf('*A*\n[b](https://x.y) \\GT')).toBe('A\nb GT');
  });

  it('refuses a splice outside the text and leaves an empty splice alone', () => {
    expect(() => spliceText('abc', 2, 2, '')).toThrow(RangeError);
    expect(() => spliceText('abc', -1, 0, 'x')).toThrow(RangeError);
    expect(() => spliceText('abc', 1.5, 0, 'x')).toThrow(RangeError);
    expect(spliceText('See GT', 5, 0, '')).toBe('See GT');
  });
});

describe('markRange (SPEC-3 3.1)', () => {
  it('sets and clears run flags over a plain range', () => {
    expect(markRange('The content rule', [4, 11], { set: { i: true } })).toBe(
      'The [content]{i} rule',
    );
    expect(markRange('The content rule', [4, 11], { set: { b: true } })).toBe('The *content* rule');
    expect(markRange('The *content* rule', [4, 11], { clear: ['b'] })).toBe('The content rule');
    expect(markRange('The content rule', [4, 11], { set: { link: 'https://x.y' } })).toBe(
      'The [content](https://x.y) rule',
    );
    expect(markRange('The [content](https://x.y) rule', [0, 16], { clear: ['link'] })).toBe(
      'The content rule',
    );
    expect(markRange('a b c', [0, 5], { set: { color: 'red', hl: 'amber' } })).toBe(
      '[a b c]{c:red h:amber}',
    );
  });

  it('keeps sup and sub exclusive and never splits a GT run', () => {
    expect(markRange('[x]{sub} y', [0, 1], { set: { sup: true } })).toBe('[x]{sup} y');
    expect(markRange('See GT now', [4, 5], { set: { i: true } })).toBe('See [GT]{i} now');
  });

  it('is canonical and refuses a range outside the text', () => {
    const next = markRange(MARKED, [0, 10], { set: { u: true }, clear: ['b'] });
    expect(next).toBe('[Every post]{u} states [what](https://x.y) was built.');
    expect(canonicalText(next)).toBe(next);
    expect(() => markRange('abc', [2, 5], { set: { i: true } })).toThrow(RangeError);
  });
});

describe('flagDiffs', () => {
  it('is empty when the flags agree and names the segments where they differ', () => {
    expect(flagDiffs(MARKED, MARKED, [0, plainLength(MARKED)])).toEqual([]);
    const plain = 'Every post states what was built.';
    expect(flagDiffs(plain, MARKED, [0, plain.length])).toEqual([
      { range: [6, 10], set: { b: true } },
      { range: [18, 22], set: { link: 'https://x.y' } },
    ]);
    expect(flagDiffs(MARKED, plain, [0, plain.length])).toEqual([
      { range: [6, 10], clear: ['b'] },
      { range: [18, 22], clear: ['link'] },
    ]);
  });

  it('applies through markRange to make the two texts equal', () => {
    const from = 'Every post states what was built.';
    let text = from;
    for (const edit of flagDiffs(from, MARKED, [0, from.length]))
      text = markRange(text, edit.range, edit);
    expect(text).toBe(MARKED);
    const mixed = '[a]{i c:red}[b]{u}c';
    const target = '[a]{u}[b]{i c:blue}c';
    let again = mixed;
    for (const edit of flagDiffs(mixed, target, [0, 3])) again = markRange(again, edit.range, edit);
    expect(again).toBe(target);
  });

  it('skips paragraph breaks and merges contiguous equal edits', () => {
    expect(flagDiffs('a\nb', '*a*\n*b*', [0, 3])).toEqual([
      { range: [0, 1], set: { b: true } },
      { range: [2, 3], set: { b: true } },
    ]);
    expect(flagDiffs('ab', '*a**b*', [0, 2])).toEqual([{ range: [0, 2], set: { b: true } }]);
  });

  it('parses the flags a text.mark carries', () => {
    expect(runFlagsSchema.safeParse({ i: true, link: 'https://x.y', color: 'red' }).success).toBe(
      true,
    );
    expect(runFlagsSchema.safeParse({ i: false }).success).toBe(false);
    expect(runFlagsSchema.safeParse({ bold: true }).success).toBe(false);
  });
});

describe('link schemes (SPEC-3 8.4)', () => {
  it('accepts https, http, mailto, tel and the slide link forms', () => {
    for (const url of [
      'https://generaltranslation.com/docs',
      'http://localhost:4321/deck/x',
      'mailto:kevin@example.com',
      'tel:+15551234567',
      '#s/pricing',
      '#next',
      '#last',
    ]) {
      expect(isAllowedLink(url), url).toBe(true);
      expect(blockLinkSchema.safeParse(url).success, url).toBe(true);
    }
  });

  it('refuses every other scheme, a bare scheme and a relative path', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      '/docs',
      'docs',
      '#other',
      'https:',
      '&#106;avascript:alert(1)',
      ' javascript:alert(1)',
    ]) {
      expect(isAllowedLink(url), url).toBe(false);
      expect(blockLinkSchema.safeParse(url).success, url).toBe(false);
    }
    expect(blockLinkSchema.safeParse({ slide: 'pricing' }).success).toBe(true);
  });

  it('names the refused run links of a Text in order', () => {
    expect(refusedLinksOf('See [a](https://x.y), [b](javascript:1) and [c](data:x)')).toEqual([
      'javascript:1',
      'data:x',
    ]);
    expect(refusedLinksOf('[fine](#s/pricing) and [also](mailto:a@b.c)')).toEqual([]);
    expect(refusedLinksOf('One\n[two](ftp://x)')).toEqual(['ftp://x']);
  });
});

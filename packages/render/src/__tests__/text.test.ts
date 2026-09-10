import { describe, expect, it } from 'vitest';

import { escapeLiteral, parseText, plainText, renderText, serializeRuns } from '../text.ts';

describe('text markup', () => {
  it('parses the four rules', () => {
    expect(parseText('Plain')).toEqual([{ t: 'Plain' }]);
    expect(parseText('a *b* c')).toEqual([{ t: 'a ' }, { t: 'b', b: true }, { t: ' c' }]);
    expect(parseText('[x](https://x.com) y')).toEqual([
      { t: 'x', link: 'https://x.com' },
      { t: ' y' },
    ]);
    expect(parseText('With GT: one')).toEqual([
      { t: 'With ' },
      { t: 'GT', gt: true },
      { t: ': one' },
    ]);
  });

  it('keeps GT as letters where the exclusion list says so', () => {
    expect(parseText('gt-next and GT.md and /GT and GTx')).toEqual([
      { t: 'gt-next and GT.md and /GT and GTx' },
    ]);
    expect(parseText('\\GT stays')).toEqual([{ t: 'GT stays' }]);
    expect(parseText('a \\* b \\[ c')).toEqual([{ t: 'a * b [ c' }]);
  });

  it('round-trips through serializeRuns', () => {
    const samples = [
      'Engineers use GT and executives buy it.',
      'a *b* c [x](https://x.com) \\GT \\* \\[',
      'Legacy i18n: 12 weeks.',
    ];
    for (const sample of samples) {
      expect(serializeRuns(parseText(sample))).toBe(sample);
    }
  });

  it('escapes literals so they read back unchanged', () => {
    const literal = 'Use *stars*, [brackets] and GT itself';
    expect(plainText(escapeLiteral(literal))).toBe(literal);
    expect(parseText(escapeLiteral(literal)).some((r) => r.gt)).toBe(false);
  });

  it('renders runs to the deck markup', () => {
    expect(renderText('With GT: *one*', { gtWord: true })).toBe(
      'With <span class="gt-word"><svg aria-hidden="true"><use href="#gt-mark"/></svg><span class="sr">GT</span></span>: <b>one</b>',
    );
    expect(renderText('With GT', { gtWord: false })).toBe('With GT');
    expect(renderText('[x](https://x.com)', { gtWord: true, linkGlyph: true })).toBe(
      '<span class="lk"><a href="https://x.com" target="_blank" rel="noreferrer">x</a><svg class="ic ext" aria-hidden="true"><use href="#i-arrow-top-right-on-square"/></svg></span>',
    );
    expect(renderText('a < b & "c"', { gtWord: true })).toBe('a &lt; b &amp; &quot;c&quot;');
  });
});

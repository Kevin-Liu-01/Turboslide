import { describe, expect, it } from 'vitest';

import { BLOCK_CSS } from '../block-css.ts';
import { PAGE_BLOCK_CSS, withoutCssComments } from '../block-css-page.ts';

/** The rules of a stylesheet as text: each selector or at-rule prelude with its declarations, whitespace folded. */
function rulesOf(css: string): string[] {
  return css
    .replace(/\s+/g, ' ')
    .split('}')
    .map((rule) => rule.trim())
    .filter((rule) => rule !== '');
}

describe('the block CSS of a page', () => {
  it('drops every comment and the blank lines they leave', () => {
    expect(withoutCssComments('a { color: red; } /* one */\n\n/* two\n lines */\nb { margin: 0 }')).toBe(
      'a { color: red; } \nb { margin: 0 }',
    );
  });

  it('keeps every rule of BLOCK_CSS and carries no comment', () => {
    expect(PAGE_BLOCK_CSS).not.toContain('/*');
    expect(PAGE_BLOCK_CSS.length).toBeLessThan(BLOCK_CSS.length);
    const bare = (css: string) => rulesOf(css.replace(/\/\*[\s\S]*?\*\//g, ' '));
    expect(rulesOf(PAGE_BLOCK_CSS)).toEqual(bare(BLOCK_CSS));
  });

  it('finds no comment inside a string or between two tokens with no space beside it', () => {
    const comments = [...BLOCK_CSS.matchAll(/\/\*[\s\S]*?\*\//g)];
    expect(comments.length).toBeGreaterThan(0);
    for (const m of comments) {
      const before = BLOCK_CSS[(m.index ?? 0) - 1] ?? '\n';
      const after = BLOCK_CSS[(m.index ?? 0) + m[0].length] ?? '\n';
      expect(/\s/.test(before) || /\s/.test(after), m[0].slice(0, 60)).toBe(true);
    }
    for (const value of BLOCK_CSS.match(/(["'])(?:(?!\1).)*\1/g) ?? [])
      expect(value.includes('/*'), value).toBe(false);
  });
});

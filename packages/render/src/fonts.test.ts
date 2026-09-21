// The @font-face emission for the catalog faces a deck uses (docs/PRODUCT.md 4.2; SPEC-5-amendments
// A5 item 3): nothing for a deck set in Inter alone, one group per used family in FONT_IDS order
// with `font-display: swap`, the `--ts-font-<id>` rule on the sheet root, and the `src` from the
// caller's resolver (the fonts route by default, a data URI for a self contained document).
import type { Deck, Slide } from '@turboslide/schema/deck';
import { describe, expect, it } from 'vitest';
import {
  deckFontsCss,
  fontFaceCount,
  fontFaceRules,
  fontSrcUnder,
  fontVariablesRule,
  fontsCss,
  routeFontSrc,
  usedFontIds,
} from './fonts.ts';

const deck = (brand?: Deck['brand']): Pick<Deck, 'brand'> => (brand === undefined ? {} : { brand });
const slide = (families: (string | undefined)[]): Slide => ({
  schemaVersion: 1,
  id: 'content-rule',
  kind: 'content',
  layout: { type: 'stack' },
  slots: {
    main: families.map((family, i) => ({
      id: `p${i}`,
      type: 'paragraph' as const,
      text: 'A paragraph',
      ...(family === undefined ? {} : { typography: { family: family as never } }),
    })),
  },
});

describe('fontsCss', () => {
  it('emits nothing for the theme face alone and one group per used family in catalog order', () => {
    expect(fontsCss([])).toBe('');
    expect(fontsCss(['inter'])).toBe('');
    const css = fontsCss(['lora', 'roboto']);
    expect(fontFaceCount(css)).toBe(
      fontFaceCount(fontFaceRules('roboto')) + fontFaceCount(fontFaceRules('lora')),
    );
    expect(css.indexOf("'Roboto'")).toBeLessThan(css.indexOf("'Lora'"));
    expect(css).toContain('font-display: swap;');
    expect(css).toContain("--ts-font-roboto: 'Roboto', sans-serif;");
    expect(css).toContain("--ts-font-lora: 'Lora', serif;");
    expect(css.trim().endsWith('}')).toBe(true);
  });

  it('writes the src from the resolver: the fonts route by default, a base URL or a data URI', () => {
    expect(fontFaceRules('roboto')).toContain(
      "src: url('/fonts/1ac2012c3491/roboto/roboto.woff2') format('woff2');",
    );
    expect(fontFaceRules('roboto', routeFontSrc)).toBe(fontFaceRules('roboto'));
    expect(fontFaceRules('roboto', fontSrcUnder('https://x.test/pkg/fonts/'))).toContain(
      "url('https://x.test/pkg/fonts/assets/roboto/roboto.woff2')",
    );
    expect(fontFaceRules('roboto', () => 'data:font/woff2;base64,AAAA')).toContain(
      "url('data:font/woff2;base64,AAAA')",
    );
    // a variable file names its weight range, a static cut one weight
    expect(fontFaceRules('roboto')).toMatch(/font-weight: \d+ \d+;/);
    expect(fontFaceRules('bebas-neue')).toContain('font-weight: 400;');
    expect(fontVariablesRule([])).toBe('');
  });

  it('reads the used families from the blocks and the kit roles, never Inter', () => {
    expect(usedFontIds(deck(), [slide(['roboto', undefined, 'inter', 'lora'])])).toEqual([
      'roboto',
      'lora',
    ]);
    expect(usedFontIds(deck({ fonts: { display: 'oswald', text: 'inter' } }), [])).toEqual([
      'oswald',
    ]);
    const css = deckFontsCss(
      { ...deck({ fonts: { display: 'playfair-display' } }), id: 'x' } as Deck,
      [slide(['roboto'])],
    );
    expect(css).toContain("'Playfair Display'");
    expect(css).toContain("'Roboto'");
    expect(deckFontsCss({ ...deck(), id: 'x' } as Deck, [slide([undefined])])).toBe('');
  });
});

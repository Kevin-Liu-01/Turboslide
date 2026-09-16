// The @font-face emission (gslides-parity SPEC-5-amendments A5 items 3 and 7): one group per
// family a deck uses, none otherwise, the custom property rule beside them, Inter never.
import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { catalogFont, fontFamilyVariable } from '@turboslide/fonts/catalog';

import {
  deckFontsCss,
  fontFaceCount,
  fontFaceRules,
  fontSrcUnder,
  fontVariablesRule,
  fontsCss,
  usedFontIds,
} from '../fonts.ts';
import { contentSlide, deck as baseDeck } from './fixtures.ts';

const src = fontSrcUnder('/fonts');

const withFamily = (id: string, family?: string): Slide =>
  contentSlide(
    id,
    { type: 'stack' },
    {
      main: [
        {
          id: `${id}-h`,
          type: 'heading',
          level: 'h2',
          text: 'A heading',
          ...(family === undefined ? {} : { typography: { family: family as never } }),
        },
        { id: `${id}-p`, type: 'paragraph', text: 'A paragraph in the theme face.' },
      ],
    },
  );

describe('usedFontIds', () => {
  it('answers nothing for a deck set in the theme face alone', () => {
    expect(usedFontIds(baseDeck, [withFamily('a'), withFamily('b')])).toEqual([]);
  });

  it('collects every block family once, in FONT_IDS order, and never Inter', () => {
    const slides = [
      withFamily('a', 'roboto'),
      withFamily('b', 'eb-garamond'),
      withFamily('c', 'roboto'),
      withFamily('d', 'inter'),
    ];
    expect(usedFontIds(baseDeck, slides)).toEqual(['roboto', 'eb-garamond']);
  });

  it('collects the theme record roles', () => {
    const deck: Deck = {
      ...baseDeck,
      themeEdits: { fonts: { display: 'playfair-display', text: 'inter' } },
    };
    expect(usedFontIds(deck, [withFamily('a')])).toEqual(['playfair-display']);
  });

  it('reads the blocks a composite holds', () => {
    const slide = contentSlide(
      'g',
      { type: 'stack' },
      {
        main: [
          {
            id: 'grp',
            type: 'composite',
            tracks: '1fr 1fr',
            cells: [
              {
                blocks: [
                  { id: 'inner', type: 'text', text: 'Grouped', typography: { family: 'oswald' } },
                ],
              },
            ],
          },
        ],
      },
    );
    expect(usedFontIds(baseDeck, [slide])).toEqual(['oswald']);
  });
});

describe('fontsCss', () => {
  it('emits an empty stylesheet when no catalog face is used', () => {
    expect(fontsCss([], src)).toBe('');
    expect(fontsCss(['inter'], src)).toBe('');
    expect(deckFontsCss(baseDeck, [withFamily('a')], src)).toBe('');
  });

  it('emits one @font-face per file of a used family and the custom property rule', () => {
    const css = fontsCss(['roboto'], src);
    const roboto = catalogFont('roboto');
    expect(fontFaceCount(css)).toBe(roboto.files.length);
    expect(css).toContain("font-family: 'Roboto';");
    expect(css).toContain('font-style: normal;');
    expect(css).toContain('font-style: italic;');
    expect(css).toContain('font-weight: 100 900;');
    expect(css).toContain('font-display: swap;');
    expect(css).toContain("src: url('/fonts/assets/roboto/roboto.woff2') format('woff2');");
    expect(css).toContain("src: url('/fonts/assets/roboto/roboto-italic.woff2') format('woff2');");
    expect(css).toContain(
      `.ts-sheet {\n  ${fontFamilyVariable('roboto')}: 'Roboto', sans-serif;\n}`,
    );
    expect(css).not.toContain("'Inter'");
    expect(css).not.toContain('Open Sans');
  });

  it('emits a static family as one rule per cut with a single weight', () => {
    const css = fontFaceRules('poppins', src);
    expect(fontFaceCount(css)).toBe(10);
    expect(css).toContain('font-weight: 300;');
    expect(css).toContain('font-weight: 700;');
    expect(css).toContain("url('/fonts/assets/poppins/poppins-500-italic.woff2')");
    expect(css).not.toMatch(/font-weight: \d+ \d+;/);
  });

  it('orders the groups by FONT_IDS whatever the input order, once each', () => {
    const css = fontsCss(['fira-code', 'roboto', 'fira-code', 'lora'], src);
    const at = (name: string) => css.indexOf(`font-family: '${name}';`);
    expect(at('Roboto')).toBeGreaterThanOrEqual(0);
    expect(at('Roboto')).toBeLessThan(at('Lora'));
    expect(at('Lora')).toBeLessThan(at('Fira Code'));
    expect(fontFaceCount(css)).toBe(
      catalogFont('roboto').files.length +
        catalogFont('lora').files.length +
        catalogFont('fira-code').files.length,
    );
    expect(fontVariablesRule(['roboto', 'lora'])).toBe(
      ".ts-sheet {\n  --ts-font-roboto: 'Roboto', sans-serif;\n  --ts-font-lora: 'Lora', serif;\n}",
    );
    expect(fontVariablesRule([])).toBe('');
  });

  it('takes the caller’s src, a data URI included', () => {
    const css = fontsCss(['bebas-neue'], () => 'data:font/woff2;base64,AAAA');
    expect(fontFaceCount(css)).toBe(1);
    expect(css).toContain("src: url('data:font/woff2;base64,AAAA') format('woff2');");
    expect(fontSrcUnder('https://example.test/fonts/')('lora', catalogFont('lora').files[0]!)).toBe(
      'https://example.test/fonts/assets/lora/lora.woff2',
    );
  });

  it('follows a deck end to end', () => {
    const deck: Deck = { ...baseDeck, themeEdits: { fonts: { display: 'montserrat' } } };
    const css = deckFontsCss(deck, [withFamily('a', 'roboto-mono'), withFamily('b')], src);
    expect(fontFaceCount(css)).toBe(
      catalogFont('montserrat').files.length + catalogFont('roboto-mono').files.length,
    );
    expect(css).toContain("--ts-font-montserrat: 'Montserrat', sans-serif;");
    expect(css).toContain("--ts-font-roboto-mono: 'Roboto Mono', monospace;");
  });
});

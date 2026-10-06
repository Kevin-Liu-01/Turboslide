// The theme migration seen by the renderer (docs/DESIGN.md 7.9): each pre-round fixture of
// packages/schema/src/__fixtures__/theme-legacy is rendered as the tree read it before the round
// (the legacy id with its kit) and after validateDeck migrated it, slide by slide in both
// appearances. The markup is equal once the theme stamp and the style element are set aside, and
// the style resolves to the same twelve tokens per appearance, the same frame and the same
// wordmark, with `--display-features` the one difference on the Blank fixture (General
// Translation's alternates to Inter's defaults). The test writes to its output every heading of
// the repository's Blank-made fixtures that holds a glyph whose width changes, with the change in
// px from the advances DESIGN.md 4.2 measured.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideTitle } from '@turboslide/schema/deck';
import { validateDeck } from '@turboslide/schema/validate';
import { parseCss } from '@turboslide/theme/css';
import { TOKENS, TOKEN_NAMES } from '@turboslide/theme/tokens';
import type { ThemeName } from '@turboslide/theme/tokens';

import { renderSlide } from '../slide.ts';
import { THEME_SLIDE_ATTRIBUTE } from '../theme-css.ts';

const FIXTURES = new URL('../../../schema/src/__fixtures__/theme-legacy/', import.meta.url);

function read(name: string): { deck: Deck; slides: Slide[] } {
  const dir = new URL(`${name}/`, FIXTURES);
  const deck = JSON.parse(readFileSync(new URL('deck.json', dir), 'utf8')) as Deck;
  const slides = readdirSync(new URL('slides/', dir)).map(
    (file) => JSON.parse(readFileSync(new URL(`slides/${file}`, dir), 'utf8')) as Slide,
  );
  return { deck, slides };
}

/** What a rendered slide's markup and style say once the stamp and the style are set apart. */
function split(html: string): { markup: string; css: string } {
  const css = [...html.matchAll(/<style class="ts-kit-css">([\s\S]*?)<\/style>/g)]
    .map((m) => m[1] ?? '')
    .join('\n');
  const markup = html
    .replace(/<style class="ts-kit-css">[\s\S]*?<\/style>/g, '')
    .replace(new RegExp(` ${THEME_SLIDE_ATTRIBUTE}="[^"]*"`, 'g'), '');
  return { markup, css };
}

/**
 * The style resolved for one appearance: the tokens (sheet.css's values under the rules that set
 * them, in order), the frame parts and the wordmark the rules hide, and the display features.
 */
function resolve(css: string, appearance: ThemeName) {
  const tokens: Record<string, string> = { ...TOKENS[appearance] };
  let features = "'cv11', 'ss01'";
  const hidden = new Set<string>();
  for (const rule of parseCss(css)) {
    const s = rule.selector;
    const root = s.replace(/:has\([^)]*\)/, '');
    const isLight = /:not\(\[data-theme='dark'\]\)$/.test(root);
    const isDark = /\[data-theme='dark'\]$/.test(root) && !isLight;
    const isRoot = /^\.ts-sheet:not\(\[data-theme-base\]\)$/.test(root);
    if ((isLight && appearance === 'light') || (isDark && appearance === 'dark') || isRoot) {
      for (const name of TOKEN_NAMES) {
        const value = rule.declarations[`--${name}`];
        if (value !== undefined) tokens[name] = value;
      }
      const value = rule.declarations['--display-features'];
      if (value !== undefined) features = value;
    }
    if (rule.declarations['display'] === 'none') hidden.add(root.replace(/^\S+\s/, ''));
  }
  return { tokens, features, hidden: [...hidden].sort() };
}

/** The advance changes of DESIGN.md 4.2 (2,048 units to the em): every a narrower, every 6 and 9 wider. */
const ADVANCE = { a: 1150 - 1254, six: 1270 - 1191 };

describe('the theme migration in the renderer', () => {
  for (const name of ['blank', 'general-translation'] as const) {
    it(`draws the ${name} fixture the same after the migration but for the display features`, () => {
      const before = read(name);
      const migrated = validateDeck({ deck: structuredClone(before.deck), slides: before.slides });
      expect(migrated.ok, name).toBe(true);
      const after = migrated.deck!;
      expect(after.theme).toBe(name === 'blank' ? 'simple' : 'general-translation');
      for (const slide of before.slides)
        for (const appearance of ['light', 'dark'] as const) {
          const options = {
            theme: appearance,
            chrome: true,
            assetBase: 'decks/fixture/',
            blockAttrs: true,
            gtWord: true,
            deckSlides: before.slides,
          };
          // the deck read before the round: the legacy id with its stored kit; its appearance is
          // the sheet's own, so the comparison is per appearance
          const old = split(renderSlide(before.deck, slide, options).html);
          const now = split(renderSlide(after, migrated.slides[slide.id] ?? slide, options).html);
          expect(now.markup, `${name} ${slide.id} ${appearance} markup`).toBe(old.markup);
          const a = resolve(old.css, appearance);
          const b = resolve(now.css, appearance);
          expect(b.tokens, `${name} ${slide.id} ${appearance} tokens`).toEqual(a.tokens);
          expect(b.hidden, `${name} ${slide.id} ${appearance} hidden parts`).toEqual(a.hidden);
          if (name === 'blank') expect(b.features).toBe('normal');
          else expect(b.features).toBe(a.features);
        }
    });
  }

  it('writes the Blank-made headings whose glyph widths change to the output', () => {
    const lines: string[] = [];
    for (const name of ['blank'] as const) {
      const { deck, slides } = read(name);
      slides.forEach((slide, index) => {
        const heading = slideTitle(slide, index + 1);
        const a = (heading.match(/a/g) ?? []).length;
        const six = (heading.match(/[69]/g) ?? []).length;
        if (a + six === 0) return;
        // the title kind's h1 is 88 px
        const px = ((a * ADVANCE.a + six * ADVANCE.six) / 2048) * 88;
        lines.push(`${deck.id}/${slide.id} "${heading}": ${px.toFixed(1)} px at 88 px`);
      });
    }
    console.log(lines.length > 0 ? lines.join('\n') : 'no Blank-made heading holds a, 6 or 9');
    expect(Array.isArray(lines)).toBe(true);
  });
});

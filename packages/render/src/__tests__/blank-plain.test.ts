// The blank template's slide is plain (docs/NEXT.md 4.1.3 item 23; the row
// `brand.template.blank-plain`): since the design round (docs/DESIGN.md 7.3, DR-D3#2) its record
// names the Simple theme and no kit, and Simple draws no rails, rules or crosses and no counter,
// so the stage around a new presentation's slide draws nothing of the GT frame and no slide
// number in the editor, the show and the print document the PDF is printed from. The GT
// template, a General Translation deck without a kit, keeps the frame and the counter.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { frameOf, themeFactsOf } from '@turboslide/schema/brand';
import { deckCounter, deckSchema, slideSchema } from '@turboslide/schema/deck';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { describe, expect, it } from 'vitest';

import { slideCounter } from '../deck.ts';
import { renderPrintDocument } from '../print.ts';
import { renderSlide } from '../slide.ts';
import { counterShownOn } from '../stage.ts';
import { themeCss, themeScope } from '../theme-css.ts';
import { contentSlide } from './fixtures.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const THEMES: Theme[] = ['light', 'dark'];
const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };

/** The three rules the Simple theme's stylesheet writes to hide the rails, the rules and the crosses. */
const SCOPE = themeScope('simple');
const HIDDEN = [
  `${SCOPE} .frame::before, ${SCOPE} .frame::after { display: none; }`,
  `${SCOPE} .frame .rule { display: none; }`,
  `${SCOPE} .frame .cross { display: none; }`,
];

function loadTemplate(name: string): { deck: Deck; slides: Slide[] } {
  const dir = join(REPO, 'decks', 'templates', name);
  const deck = deckSchema.parse(JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'))) as Deck;
  const slides = readdirSync(join(dir, 'slides'))
    .filter((file) => file.endsWith('.json'))
    .map(
      (file) =>
        slideSchema.parse(JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8'))) as Slide,
    );
  return { deck, slides };
}

describe('the blank template draws a plain slide (B4a)', () => {
  const blank = loadTemplate('blank');
  const title = blank.slides.find((slide) => slide.id === 'title')!;
  const body = contentSlide('body', { type: 'freeform' }, {});
  const withBody: Deck = {
    ...blank.deck,
    sections: [{ id: 'deck', name: 'Deck', slideIds: ['title', 'body'] }],
  };

  it('names the Simple theme and no kit, so the rails, the rules, the crosses, the counter and the logo are off', () => {
    expect(blank.deck.theme).toBe('simple');
    expect(blank.deck.brand).toBeUndefined();
    expect(frameOf(blank.deck.theme, blank.deck.brand)).toEqual({
      rails: false,
      top: false,
      bottom: false,
      crosses: false,
    });
    expect(themeFactsOf(blank.deck.theme).counter.show).toBe(false);
    expect(themeFactsOf(blank.deck.theme).logo).toBe(false);
  });

  it("hides the frame in the theme's stylesheet", () => {
    const css = themeCss(blank.deck).split('\n');
    for (const rule of HIDDEN) expect(css).toContain(rule);
  });

  it('counts no slide: the counter is off on the title slide and on a body slide', () => {
    expect(deckCounter(withBody)).toBe('off');
    for (const slide of [title, body]) {
      expect(counterShownOn(withBody, slide)).toBe(false);
      expect(slideCounter(withBody, slide, 1, 2)).toBe('');
    }
  });

  it("carries the theme's stylesheet on every slide it renders, in either appearance", () => {
    for (const theme of THEMES) {
      for (const slide of [title, body]) {
        const html = renderSlide(withBody, slide, {
          theme,
          chrome: true,
          assetBase: 'decks/blank/',
          blockAttrs: true,
          gtWord: true,
        }).html;
        for (const rule of HIDDEN) expect(html).toContain(rule);
      }
    }
  });

  it('prints pages with the frame hidden and an empty counter', () => {
    for (const theme of THEMES) {
      const print = renderPrintDocument(withBody, [title, body], {
        bundle,
        theme,
        assetBase: 'decks/blank/',
      });
      for (const rule of HIDDEN) expect(print.html).toContain(rule);
      const counters = [...print.html.matchAll(/<div class="counter">([^<]*)<\/div>/g)].map(
        (m) => m[1],
      );
      expect(counters).toEqual(['', '']);
    }
  });

  it('keeps the frame and the counter for the GT template, a General Translation deck without a kit', () => {
    const gt = loadTemplate('gt-brand');
    expect(gt.deck.theme).toBe('general-translation');
    expect(gt.deck.brand).toBeUndefined();
    expect(themeCss(gt.deck)).toBe('');
    expect(deckCounter(gt.deck)).toBe('on');
  });
});

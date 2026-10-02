// The blank template draws no GT mark (docs/NEXT.md 3.2 H6; the row
// `brand.template.blank-no-gt-mark`): its record names no title mark and no footer logo, so the
// title slide, a body slide, the frame band and the print document (the PDF's source) carry no
// `#gt-mark` reference, while the GT template, a deck without a record, keeps the GT band.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { deckSchema, slideSchema } from '@turboslide/schema/deck';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { describe, expect, it } from 'vitest';

import { renderPrintDocument } from '../print.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { GT_BAND, frameBandHtml, frameBandOf, renderStage } from '../stage.ts';
import { contentSlide } from './fixtures.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const THEMES: Theme[] = ['light', 'dark'];
const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };
/** A reference to the GT glyph: the sprite's `<symbol id="gt-mark">` is not one, a `<use>` is. */
const GT_REFERENCE = /href="#gt-mark"/;

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

describe('the blank template draws no GT mark (H6)', () => {
  const blank = loadTemplate('blank');
  const title = blank.slides.find((slide) => slide.id === 'title');
  const body = contentSlide('body', { type: 'freeform' }, {});
  const withBody: Deck = {
    ...blank.deck,
    sections: [{ id: 'deck', name: 'Deck', slideIds: ['title', 'body'] }],
  };

  it('carries a record with no title mark and no footer logo', () => {
    expect(blank.deck.brand?.mark?.kind).toBe('none');
    expect(blank.deck.brand?.footer?.logo).toBe('none');
    expect(title).toBeDefined();
  });

  it('renders the title slide and a body slide without the GT glyph in either theme', () => {
    for (const theme of THEMES) {
      const options: RenderOptions = {
        theme,
        chrome: true,
        assetBase: 'decks/blank/',
        blockAttrs: true,
        gtWord: true,
      };
      expect(renderSlide(withBody, title!, options).html).not.toMatch(GT_REFERENCE);
      expect(renderSlide(withBody, body, options).html).not.toMatch(GT_REFERENCE);
    }
  });

  it('answers a band with no logo, so the stage draws no wordmark', () => {
    for (const theme of THEMES) {
      const band = frameBandOf(blank.deck, theme);
      expect(band.kit).toBe(true);
      expect(band.logo.kind).toBe('none');
      expect(frameBandHtml(band)).toBe('');
      const stage = renderStage('<section class="slide"></section>', { theme, band });
      expect(stage).not.toContain('class="wordmark');
      expect(stage).not.toMatch(GT_REFERENCE);
    }
  });

  it('prints no GT glyph on any page of the PDF source', () => {
    for (const theme of THEMES) {
      const print = renderPrintDocument(withBody, [title!, body], {
        bundle,
        theme,
        assetBase: 'decks/blank/',
      });
      expect(print.html).not.toMatch(GT_REFERENCE);
      expect(print.html).not.toContain('class="wordmark');
    }
  });

  it('keeps the GT band for the GT template, a deck without a record', () => {
    const gt = loadTemplate('gt-brand');
    expect(gt.deck.brand).toBeUndefined();
    expect(frameBandOf(gt.deck, 'light')).toBe(GT_BAND);
    expect(frameBandHtml(GT_BAND)).toMatch(GT_REFERENCE);
  });
});

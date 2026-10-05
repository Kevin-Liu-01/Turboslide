// The blank template draws no GT mark (docs/NEXT.md 3.2 H6; the row
// `brand.template.blank-no-gt-mark`): its record names no title mark and no footer logo, so the
// title slide, a body slide, the frame band and the print document (the PDF's source) carry no
// `#gt-mark` reference, while the GT template, a deck without a record, keeps the GT band. After
// the first write the title slide is a canvas whose `mark` block still sits in the document (the
// schema requires the title's mark box); the renderer writes no element for it, so nothing on the
// stage, in the print document or in the exporter's scene stands for it (Round 1 verification
// finding 4: a click on the top band selected a 1326 by 64 object named Mark).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Block } from '@turboslide/schema/blocks';
import { toCanvas } from '@turboslide/schema/canvas';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { deckSchema, slideSchema } from '@turboslide/schema/deck';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { describe, expect, it } from 'vitest';

import { renderPrintDocument } from '../print.ts';
import { renderSlide, undrawnObjectIds } from '../slide.ts';
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

/**
 * The Blank title slide after its first write as the editor makes it: the stage measured the
 * heading and the lead and no mark (the slot draws nothing), `toCanvas` placed the mark block at
 * the content origin (1326 by 64), and the write that converted it inserted a text box.
 */
function blankAfterFirstWrite(title: Slide): ContentSlide {
  const boxes: CanvasBoxes = {
    blocks: { heading: [137, 395.28125, 1326, 90], lead: [137, 511.03125, 901.453125, 38] },
    prompted: ['heading', 'lead'],
  };
  const converted = toCanvas(title, boxes);
  if (converted === null) throw new Error('the blank title converts');
  const text: Block = {
    id: 'text',
    type: 'text',
    text: 'Hello',
    pos: { x: 300, y: 640, w: 700, h: 120, z: 3 },
  };
  const main = converted.slide.slots.main ?? [];
  return { ...converted.slide, slots: { ...converted.slide.slots, main: [...main, text] } };
}

describe('the Blank title slide after its first write draws no mark object', () => {
  const blank = loadTemplate('blank');
  const title = blank.slides.find((slide) => slide.id === 'title')!;
  const canvas = blankAfterFirstWrite(title);

  it('keeps the mark block in the document at the content origin, as production stores it', () => {
    const mark = (canvas.slots.main ?? []).find((block) => block.id === 'mark');
    expect(mark?.type).toBe('mark');
    expect(mark?.pos).toMatchObject({ x: 137, y: 129, w: 1326, h: 64 });
  });

  it('writes no element and no wrapper for the mark on the stage, in either theme', () => {
    for (const theme of THEMES) {
      const html = renderSlide(blank.deck, canvas, {
        theme,
        chrome: true,
        assetBase: 'decks/blank/',
        blockAttrs: true,
        live: true,
        prompts: true,
        gtWord: true,
      }).html;
      expect(html).not.toContain('data-free="mark"');
      expect(html).not.toContain('data-block="mark"');
      expect(html).not.toContain('data-slot="mark"');
      expect(html).not.toContain('mark-block');
      expect(html).not.toMatch(GT_REFERENCE);
      for (const id of ['heading', 'lead', 'text']) expect(html).toContain(`data-free="${id}"`);
    }
  });

  it('names the mark as the one undrawn object, and none once the kit draws a mark', () => {
    expect([...undrawnObjectIds(blank.deck, canvas)]).toEqual(['mark']);
    const drawn: Deck = {
      ...blank.deck,
      brand: { ...blank.deck.brand, mark: { kind: 'default' } },
    };
    expect(undrawnObjectIds(drawn, canvas).size).toBe(0);
    expect(
      renderSlide(drawn, canvas, {
        theme: 'light',
        chrome: true,
        assetBase: '',
        blockAttrs: true,
        gtWord: true,
      }).html,
    ).toContain('data-free="mark"');
    /* the title kind before the first write has no mark block to leave out */
    expect(undrawnObjectIds(blank.deck, title).size).toBe(0);
  });

  it('prints no mark element on the page the PDF and the PowerPoint scene are read from', () => {
    for (const theme of THEMES) {
      const print = renderPrintDocument(blank.deck, [canvas], {
        bundle,
        theme,
        assetBase: 'decks/blank/',
      });
      expect(print.html).not.toContain('data-free="mark"');
      /* the stylesheet names .mark-block; no element carries the class */
      expect(print.html).not.toMatch(/class="[^"]*mark-block/);
      expect(print.html).not.toMatch(GT_REFERENCE);
    }
  });
});

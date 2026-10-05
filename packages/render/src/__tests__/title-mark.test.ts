// The canvas title's mark slot follows the brand kit (the features round's fix round, VERIFICATION.md
// pass 1 F1; build/b6.md R15): once a title slide is a canvas, `toCanvas` makes a `mark` block of
// its mark slot and `renderMark` draws there what `titleMarkSlot` drew before the conversion: the
// kit's picture, the GT glyph for `default`, and for `none` or a hidden position no element at
// all, so the empty slot is not an object (Round 1 verification finding 4). A `mark` block on any other slide
// (the brand deck's specimens) renders as before.
import type { BrandKit } from '@turboslide/schema/brand';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { toCanvas } from '@turboslide/schema/canvas';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { TITLE } from '@turboslide/schema/fixtures';
import { describe, expect, it } from 'vitest';

import { renderSlide, undrawnObjectIds } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { contentSlide, deck as testDeck } from './fixtures.ts';

const options: RenderOptions = {
  theme: 'light',
  chrome: true,
  assetBase: 'decks/test/',
  blockAttrs: true,
  gtWord: true,
};

/** The stage's boxes of the TITLE fixture, the shape schema's canvas.test.ts records. */
const boxes: CanvasBoxes = {
  blocks: { heading: [137, 421, 901, 90], lead: [137, 537, 901, 76] },
  mark: [137, 289, 132, 84],
  prompted: [],
};

function deckWith(brand?: BrandKit): Deck {
  return { ...testDeck, ...(brand !== undefined ? { brand } : {}) };
}

const canvasTitle = toCanvas(TITLE, boxes)!.slide;

describe('the canvas title mark block follows the brand kit', () => {
  it('converts the title with a mark block first in its main slot', () => {
    expect(canvasTitle.kind).toBe('content');
    const first = canvasTitle.kind === 'content' ? canvasTitle.slots.main?.[0] : undefined;
    expect(first?.type).toBe('mark');
  });

  it('draws the kit picture as img.mark-picture with the asset src, and the glyph without a kit', () => {
    const glyph = renderSlide(deckWith(), canvasTitle, options).html;
    expect(glyph).toContain('<use href="#gt-mark"/>');
    expect(glyph).not.toContain('mark-picture');
    const picture = renderSlide(
      deckWith({ mark: { kind: 'picture', assetId: 'logo-gm' } }),
      canvasTitle,
      options,
    ).html;
    expect(picture).toContain('class="mark mark-picture mark-block"');
    expect(picture).toContain('src="decks/test/assets/logo-gm.jpg"');
    expect(picture).toContain('data-slot="mark"');
    expect(picture).toContain('alt="The General Motors logo"');
    expect(picture).not.toContain('#gt-mark');
    /* a picture whose asset the deck lacks falls back to the glyph, as the slot does */
    const missing = renderSlide(
      deckWith({ mark: { kind: 'picture', assetId: 'no-such-asset' } }),
      canvasTitle,
      options,
    ).html;
    expect(missing).toContain('<use href="#gt-mark"/>');
  });

  it('writes no element at all for none or a hidden position: no block, no wrapper, no box to click', () => {
    for (const brand of [
      { mark: { kind: 'none' } },
      { positions: { mark: 'hidden' } },
      { mark: { kind: 'default' }, positions: { mark: 'hidden' } },
    ] as BrandKit[]) {
      const html = renderSlide(deckWith(brand), canvasTitle, options).html;
      expect(html, JSON.stringify(brand)).not.toContain('data-free="mark"');
      expect(html).not.toContain('data-block="mark"');
      expect(html).not.toContain('mark-block');
      expect(html).not.toContain('#gt-mark');
      expect(html).not.toContain('mark-picture');
      expect(html).toContain('data-free="heading"');
      expect([...undrawnObjectIds(deckWith(brand), canvasTitle)]).toEqual(['mark']);
    }
    expect(undrawnObjectIds(deckWith(), canvasTitle).size).toBe(0);
  });

  it('leaves a mark block of a content slide to the glyph whatever the kit says', () => {
    const specimen: Slide = contentSlide(
      'specimen',
      { type: 'freeform' },
      { main: [{ id: 'm', type: 'mark', w: 132, h: 84, pos: { x: 100, y: 100, w: 132, h: 84 } }] },
    );
    const html = renderSlide(
      deckWith({ mark: { kind: 'picture', assetId: 'logo-gm' } }),
      specimen,
      options,
    ).html;
    expect(html).toContain('<use href="#gt-mark"/>');
    expect(html).not.toContain('mark-picture');
  });
});

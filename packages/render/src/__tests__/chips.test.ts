// The two paper chips of a full-picture slide draw only under a seat the frame draws (the polish
// round's fix round 3, B4, the verifier's pass 3 finding 3: a shader ground on a deck with no footer
// logo or with Slide numbers off carried two blank paper rectangles at the corners): the left chip
// under the band's logo at the bottom left, the right chip under the counter or under a logo at the
// bottom right, on a picture kind and on a covering picture object alike; the block CSS carries one
// rule per seat, hides the chips inside a clone, and keeps the wordmark, the counter and the kit's
// footer text over every object (SPEC-2 0.98).
import { describe, expect, it } from 'vitest';

import { BLOCK_CSS } from '../block-css.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { counterShownOn } from '../stage.ts';
import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { contentSlide, deck } from './fixtures.ts';

const opener: Slide = {
  schemaVersion: 1,
  id: 'opener-brand',
  kind: 'opener',
  sectionId: 'brand',
  picture: { asset: 'opener-brand', fit: 'cover' },
  plate: {
    side: 'lower-left',
    maxWidth: 740,
    blocks: [{ id: 'big', type: 'heading', level: 'big', text: 'Brand' }],
  },
};

const title: Slide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'General Translation',
  lead: 'This deck covers the brand.',
};

/** A canvas slide whose picture object covers the sheet at the bottom of the stack (SPEC-2 2.6.4). */
const covering: Block = {
  id: 'background',
  type: 'picture',
  asset: 'opener-brand',
  pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
};
const ground = contentSlide(
  'ground',
  { type: 'freeform' },
  {
    main: [
      covering,
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'Over the ground',
        pos: { x: 200, y: 200, w: 800, h: 100, z: 1 },
      },
    ],
  },
);

const options: RenderOptions = {
  theme: 'light',
  chrome: true,
  assetBase: '',
  blockAttrs: false,
  gtWord: true,
};

const chipsOf = (html: string): string | null =>
  /<div class="(ts-chips[^"]*)" aria-hidden="true"><\/div>/.exec(html)?.[1] ?? null;

const withKit = (kit: NonNullable<Deck['brand']>, extra: Partial<Deck> = {}): Deck => ({
  ...deck,
  brand: kit,
  ...extra,
});

describe('the paper chips draw only under a seat the frame draws', () => {
  it('draws both chips for the GT band with Slide numbers on, on a picture kind and on a covering picture object', () => {
    expect(chipsOf(renderSlide(deck, opener, options).html)).toBe('ts-chips is-left is-right');
    const canvas = renderSlide(deck, ground, options).html;
    expect(chipsOf(canvas)).toBe('ts-chips is-left is-right');
    // inside the covering object's wrapper, after the image, and nowhere else
    expect(canvas).toMatch(
      /data-free="background"[^>]*><div class="picture"[^>]*><img class="picture-img"[^>]*><\/div><div class="ts-chips is-left is-right" aria-hidden="true"><\/div><\/div>/,
    );
    expect(canvas.match(/ts-chips/g)?.length).toBe(1);
  });

  it('drops the right chip when Slide numbers are off, on the deck or on the slide', () => {
    const off: Deck = { ...deck, defaults: { counter: 'off' } };
    expect(chipsOf(renderSlide(off, opener, options).html)).toBe('ts-chips is-left');
    expect(chipsOf(renderSlide(off, ground, options).html)).toBe('ts-chips is-left');
    expect(chipsOf(renderSlide(deck, { ...opener, counter: 'off' }, options).html)).toBe(
      'ts-chips is-left',
    );
    // the slide's own word wins over the deck's
    expect(chipsOf(renderSlide(off, { ...opener, counter: 'on' }, options).html)).toBe(
      'ts-chips is-left is-right',
    );
  });

  it('drops the left chip when the kit draws no footer logo, and draws none when it draws no seat at all', () => {
    const noLogo = withKit({ footer: { logo: 'none' } });
    expect(chipsOf(renderSlide(noLogo, opener, options).html)).toBe('ts-chips is-right');
    const noSeat = withKit({ footer: { logo: 'none' } }, { defaults: { counter: 'off' } });
    expect(renderSlide(noSeat, opener, options).html).not.toContain('ts-chips');
    expect(renderSlide(noSeat, ground, options).html).not.toContain('ts-chips');
    // a hidden footer position is no seat either
    const hidden = withKit(
      { positions: { footerLogo: 'hidden' } },
      { defaults: { counter: 'off' } },
    );
    expect(renderSlide(hidden, ground, options).html).not.toContain('ts-chips');
  });

  it('moves the logo seat with the kit: a logo at the bottom right takes the right chip, a top corner takes none', () => {
    const right = withKit(
      { positions: { footerLogo: 'bottom-right' } },
      { defaults: { counter: 'off' } },
    );
    expect(chipsOf(renderSlide(right, opener, options).html)).toBe('ts-chips is-right');
    const top = withKit(
      { positions: { footerLogo: 'top-right' } },
      { defaults: { counter: 'off' } },
    );
    expect(renderSlide(top, opener, options).html).not.toContain('ts-chips');
    // a picture logo counts as drawn at its corner even when the renderer cannot resolve it
    const picture = withKit(
      { footer: { logo: 'picture', assetId: 'logo-gm' } },
      { defaults: { counter: 'off' } },
    );
    expect(chipsOf(renderSlide(picture, opener, options).html)).toBe('ts-chips is-left');
  });

  it("reads the caller's counter text before the deck's Slide numbers", () => {
    expect(chipsOf(renderSlide(deck, opener, { ...options, counter: '' }).html)).toBe(
      'ts-chips is-left',
    );
    const off: Deck = { ...deck, defaults: { counter: 'off' } };
    expect(chipsOf(renderSlide(off, opener, { ...options, counter: '03 / 85' }).html)).toBe(
      'ts-chips is-left is-right',
    );
  });

  it('draws no chips without chrome, and never on a picture object that does not cover the sheet at the bottom', () => {
    expect(renderSlide(deck, opener, { ...options, chrome: false }).html).not.toContain('ts-chips');
    const small = contentSlide(
      'small',
      { type: 'freeform' },
      {
        main: [{ ...covering, pos: { x: 100, y: 100, w: 800, h: 450, z: 0 } }],
      },
    );
    expect(renderSlide(deck, small, options).html).not.toContain('ts-chips');
  });

  it('counterShownOn reads the on or off half of slideCounter', () => {
    expect(counterShownOn(deck, opener)).toBe(true);
    expect(counterShownOn({ ...deck, defaults: { counter: 'off' } }, opener)).toBe(false);
    expect(
      counterShownOn({ ...deck, defaults: { counter: 'off' } }, { ...opener, counter: 'on' }),
    ).toBe(true);
    expect(counterShownOn(deck, { ...opener, counter: 'off' })).toBe(false);
    const skip: Deck = { ...deck, defaults: { counter: 'skip-title' } };
    expect(counterShownOn(skip, title)).toBe(false);
    expect(counterShownOn(skip, opener)).toBe(true);
    // the kit's Slide numbers stand before the deck default
    expect(counterShownOn(withKit({ counter: { show: false } }), opener)).toBe(false);
  });

  it('the block CSS carries one rule per seat, hides the chips inside a clone, and keeps the seats over every object', () => {
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .ts-chips { position: absolute; inset: -57px; z-index: -1; pointer-events: none; background-repeat: no-repeat; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .ts-chips.is-left { background-image: linear-gradient(var(--paper), var(--paper)); background-position: 66px 858px; background-size: 40px 30px; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .ts-chips.is-right { background-image: linear-gradient(var(--paper), var(--paper)); background-position: 1474px 856px; background-size: 60px 28px; }',
    );
    expect(BLOCK_CSS).toContain(
      '.ts-sheet .ts-chips.is-left.is-right { background-image: linear-gradient(var(--paper), var(--paper)), linear-gradient(var(--paper), var(--paper)); background-position: 66px 858px, 1474px 856px; background-size: 40px 30px, 60px 28px; }',
    );
    expect(BLOCK_CSS).toContain('.ts-sheet.is-clone .ts-chips { display: none; }');
    /* the band's stacking rule (z-index 2, pointer-events none on .wordmark, .counter and .ts-kit-footer)
       lives in the theme's sheet.css since B4's fix round 3 R1; packages/theme/src/theme.test.ts pins it */
    // the wrapper form keeps its box and its place over the image (0.98)
    expect(BLOCK_CSS).toContain('.ts-sheet .free > .ts-chips { inset: 0; z-index: 1; }');
  });
});

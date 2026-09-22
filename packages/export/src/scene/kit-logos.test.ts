// The logo readers of the export (docs/FEATURES.md 4.8; audit-logos 18): the `logo` kind is a 3x
// kind under the auto policy, a picture or shot block whose asset carries `role: 'logo'` is read
// from the document (composites' cells included, a missing asset is not a logo), and the kit's
// picture logo is read from the brand record; the two kit names the builder overlays in the
// Perfect mode are pinned so the extractor and the builder agree.
import { describe, expect, test } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Deck, Slide } from '@turboslide/schema/deck';

import { rasterScaleFor } from './extract.ts';
import { KIT_LOGO_BLOCK_IDS, kitHasPictureLogo, logoBlockIds } from './kit-logos.ts';

const asset = (id: string, role: Asset['role']): Asset => ({
  id,
  role,
  alt: `${id} alt`,
  twins: { neutral: `assets/${id}.png` },
  size: [396, 252],
  scale: 3,
  source: { kind: 'file' },
  inline: 'native',
});

const deck = {
  assets: {
    figma: asset('figma', 'logo'),
    photo: asset('photo', 'capture'),
  },
} as unknown as Pick<Deck, 'assets'>;

describe('the 3x kinds (4.8)', () => {
  test('logo joins icon and mark under auto; the forced policies and the 1x types hold', () => {
    expect(rasterScaleFor('logo', 'auto')).toBe(3);
    expect(rasterScaleFor('mark', 'auto')).toBe(3);
    expect(rasterScaleFor('icon', 'auto')).toBe(3);
    expect(rasterScaleFor('block', 'auto', 'picture')).toBe(2);
    expect(rasterScaleFor('block', 'auto', 'dia')).toBe(1);
    expect(rasterScaleFor('logo', 2)).toBe(2);
  });
});

describe('logoBlockIds', () => {
  test('reads the picture and shot blocks whose asset is a logo, through composites, and no other', () => {
    const slide = {
      kind: 'content',
      id: 's1',
      layout: { type: 'freeform' },
      slots: {
        main: [
          { id: 'p1', type: 'picture', asset: 'figma', pos: { x: 0, y: 0, w: 160, h: 100 } },
          { id: 'p2', type: 'shot', asset: 'photo' },
          { id: 'p3', type: 'picture', asset: 'missing' },
          {
            id: 'c1',
            type: 'composite',
            cells: [{ blocks: [{ id: 'p4', type: 'shot', asset: 'figma' }] }],
          },
          { id: 't1', type: 'text', text: 'hello' },
        ],
      },
    } as unknown as Slide;
    expect([...logoBlockIds(slide, deck)].sort()).toEqual(['p1', 'p4']);
  });

  test('an opener reads its plate; a slide without pictures reads none', () => {
    const opener = {
      kind: 'opener',
      id: 'o1',
      picture: { asset: 'photo' },
      plate: { blocks: [{ id: 'q1', type: 'picture', asset: 'figma' }] },
    } as unknown as Slide;
    expect([...logoBlockIds(opener, deck)]).toEqual(['q1']);
    const bare = {
      kind: 'content',
      id: 'b',
      layout: { type: 'left-mid' },
      slots: {},
    } as unknown as Slide;
    expect(logoBlockIds(bare, deck).size).toBe(0);
  });
});

describe('kitHasPictureLogo', () => {
  test('a picture in the title slot or the footer, with an asset; the GT mark and a missing asset are none', () => {
    expect(kitHasPictureLogo({ brand: undefined })).toBe(false);
    expect(kitHasPictureLogo({ brand: { mark: { kind: 'default' } } } as Pick<Deck, 'brand'>)).toBe(
      false,
    );
    expect(kitHasPictureLogo({ brand: { mark: { kind: 'picture' } } } as Pick<Deck, 'brand'>)).toBe(
      false,
    );
    expect(
      kitHasPictureLogo({ brand: { mark: { kind: 'picture', assetId: 'figma' } } } as Pick<
        Deck,
        'brand'
      >),
    ).toBe(true);
    expect(
      kitHasPictureLogo({ brand: { footer: { logo: 'picture', assetId: 'figma' } } } as Pick<
        Deck,
        'brand'
      >),
    ).toBe(true);
    expect(kitHasPictureLogo({ brand: { footer: { logo: 'none' } } } as Pick<Deck, 'brand'>)).toBe(
      false,
    );
  });

  test('the two kit block ids are the names the builder overlays', () => {
    expect([...KIT_LOGO_BLOCK_IDS].sort()).toEqual(['footer-logo', 'title-logo']);
  });
});

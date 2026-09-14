// The dithered picture's DOM (gslides-parity SPEC-3 10.3, 16.6 render row): the root's three
// attributes, the two states, the variant's twins as the image, the overlay canvas in a live
// render only, and a picture without a dither rendering byte for byte as before.
import { describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { ditherKey, ditherScreen, ditherSourceOf, resolveDither } from '../dither-key.ts';
import type { PictureDitherLike } from '../dither-key.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { renderThumb } from '../thumb.ts';
import { deck as fixtureDeck, openerAsset } from './fixtures.ts';

const themes: Theme[] = ['light', 'dark'];
const photograph: PictureDitherLike = { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 };

/** A picture block with the dither field, typed structurally until the schema carries it (B1). */
function dithered(id: string, dither: PictureDitherLike | undefined, pos: Block['pos']): Block {
  const block = { id, type: 'picture', asset: 'opener-brand', pos, ...(dither ? { dither } : {}) };
  return block as unknown as Block;
}

function slideWith(blocks: Block[]): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'bg',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: blocks },
  };
}

const source = ditherSourceOf(openerAsset);
const coverKey = ditherKey({ source, dither: photograph, screen: ditherScreen(1600, 900, 2) });

/** The fixture deck with a variant recorded for the covering picture's key. */
function deckWithVariant(): Deck {
  const variants = {
    [coverKey]: {
      key: coverKey,
      twins: {
        light: 'assets/opener-brand.dither-abcdef123456-light.png',
        dark: 'assets/opener-brand.dither-abcdef123456-dark.png',
      },
      size: [1600, 900],
      scale: 1,
      producedAt: '2026-09-13T00:00:00Z',
    },
  };
  const asset = { ...openerAsset, variants } as Asset;
  return { ...fixtureDeck, assets: { ...fixtureDeck.assets, 'opener-brand': asset } };
}

function options(theme: Theme, extra: Partial<RenderOptions> = {}): RenderOptions {
  return { theme, chrome: false, assetBase: 'decks/t/', blockAttrs: true, gtWord: true, ...extra };
}

function pictureRoot(html: string): string {
  const match = /<div class="picture"[^>]*>/.exec(html);
  if (!match) throw new Error(`no picture root in ${html}`);
  return match[0];
}

describe('the dithered picture', () => {
  const cover = { x: 0, y: 0, w: 1600, h: 900, z: 0 };

  it('writes data-dither, data-dither-key and data-dither-state live when no variant exists', () => {
    for (const theme of themes) {
      const html = renderSlide(
        fixtureDeck,
        slideWith([dithered('bg', photograph, cover)]),
        options(theme),
      ).html;
      const root = pictureRoot(html);
      expect(root).toContain(`data-dither="${JSON.stringify(photograph).replace(/"/g, '&quot;')}"`);
      expect(root).toContain(`data-dither-key="${coverKey}"`);
      expect(root).toContain('data-dither-state="live"');
      // the continuous twin stays the image
      expect(html).toContain(
        theme === 'dark'
          ? 'src="decks/t/assets/opener-brand-dark.jpg"'
          : 'src="decks/t/assets/opener-brand-light.jpg"',
      );
      // no overlay outside a live render
      expect(html).not.toContain('picture-dither');
    }
  });

  it('draws the overlay canvas at the screen size in a live render only', () => {
    const live = renderSlide(
      fixtureDeck,
      slideWith([dithered('bg', photograph, cover)]),
      options('light', { live: true }),
    ).html;
    expect(live).toContain(
      '<canvas class="picture-dither" width="800" height="450" hidden aria-hidden="true"></canvas>',
    );
    // the canvas is the last child of the picture root, after the image
    expect(live).toMatch(
      /<img class="picture-img"[^>]*><canvas class="picture-dither"[^>]*><\/canvas><\/div>/,
    );
    const cell1 = renderSlide(
      fixtureDeck,
      slideWith([
        dithered('bg', { pattern: 'bayer8', cell: 1 }, { x: 100, y: 100, w: 400, h: 225, z: 0 }),
      ]),
      options('light', { live: true }),
    ).html;
    expect(cell1).toContain('<canvas class="picture-dither" width="400" height="225"');
    const thumb = renderThumb(fixtureDeck, slideWith([dithered('bg', photograph, cover)]), 'light');
    expect(thumb.html).not.toContain('picture-dither');
  });

  it('points the image at the variant twins in state variant', () => {
    const deck = deckWithVariant();
    for (const theme of themes) {
      const html = renderSlide(deck, slideWith([dithered('bg', photograph, cover)]), {
        ...options(theme),
        live: true,
      }).html;
      const root = pictureRoot(html);
      expect(root).toContain('data-dither-state="variant"');
      expect(root).toContain(`data-dither-key="${coverKey}"`);
      const other = theme === 'dark' ? 'light' : 'dark';
      expect(html).toContain(
        `src="decks/t/assets/opener-brand.dither-abcdef123456-${theme}.png" data-${other}="decks/t/assets/opener-brand.dither-abcdef123456-${other}.png"`,
      );
      expect(html).toContain('width="1600" height="900"');
      // no script is needed: no overlay even in a live render
      expect(html).not.toContain('picture-dither');
    }
  });

  it('falls back to live when the written parameters do not match the recorded variant', () => {
    const deck = deckWithVariant();
    const html = renderSlide(
      deck,
      slideWith([dithered('bg', { ...photograph, black: 140 }, cover)]),
      options('light'),
    ).html;
    expect(pictureRoot(html)).toContain('data-dither-state="live"');
    expect(html).toContain('src="decks/t/assets/opener-brand-light.jpg"');
  });

  it('shares one key between a bare field and its spelled out defaults', () => {
    const bare = renderSlide(
      fixtureDeck,
      slideWith([dithered('bg', { pattern: 'bayer8' }, cover)]),
      options('light'),
    ).html;
    const spelled = renderSlide(
      fixtureDeck,
      slideWith([dithered('bg', resolveDither({ pattern: 'bayer8' }), cover)]),
      options('light'),
    ).html;
    const keyOf = (html: string): string => /data-dither-key="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(keyOf(bare)).toBe(keyOf(spelled));
    expect(keyOf(bare)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves a picture without a dither exactly as before', () => {
    const html = renderSlide(
      fixtureDeck,
      slideWith([dithered('bg', undefined, cover)]),
      options('light', { live: true }),
    ).html;
    expect(html).not.toContain('data-dither');
    expect(html).not.toContain('picture-dither');
    expect(pictureRoot(html)).toBe('<div class="picture" data-block="bg" data-type="picture">');
  });

  it('gives a dithered shot the attributes on its figure root and the canvas in its frame', () => {
    const shot = {
      id: 'sh',
      type: 'shot',
      asset: 'opener-brand',
      caption: 'A dithered shot',
      dither: { pattern: 'blue64', strength: 0.6 },
    } as unknown as Block;
    const slide: ContentSlide = {
      schemaVersion: 1,
      id: 'sh',
      kind: 'content',
      layout: { type: 'center' },
      slots: { main: [shot] },
    };
    const html = renderSlide(fixtureDeck, slide, options('light', { live: true })).html;
    const key = ditherKey({
      source,
      dither: { pattern: 'blue64', strength: 0.6 },
      screen: ditherScreen(1326, 1326 * (900 / 1600), 2),
    });
    expect(html).toMatch(/<figure class="shot-fig tooled"[^>]* data-dither="[^"]*blue64[^"]*"/);
    expect(html).toContain(`data-dither-key="${key}"`);
    expect(html).toContain('data-dither-state="live"');
    expect(html).toMatch(
      /<div class="shot-crop"[^>]*><img class="shot"[^>]*><canvas class="picture-dither" width="663" height="373"/,
    );
    const plain = renderSlide(fixtureDeck, slide, options('light')).html;
    expect(plain).not.toContain('picture-dither');
    expect(plain).toContain('data-dither-state="live"');
  });
});

describe('the continuous source and the standalone build (stage 2)', () => {
  const cover = { x: 0, y: 0, w: 1600, h: 900, z: 0 };

  it('writes data-dither-source as the URL of the continuous source, a sourceFile when the asset keeps one', () => {
    const html = renderSlide(
      fixtureDeck,
      slideWith([dithered('bg', photograph, cover)]),
      options('light'),
    ).html;
    expect(pictureRoot(html)).toContain(`data-dither-source="decks/t/${source}"`);
    const withSource = {
      ...fixtureDeck,
      assets: {
        ...fixtureDeck.assets,
        'opener-brand': { ...openerAsset, sourceFile: 'assets/opener-brand.source.jpg' },
      },
    } as Deck;
    const root = pictureRoot(
      renderSlide(withSource, slideWith([dithered('bg', photograph, cover)]), options('light'))
        .html,
    );
    expect(root).toContain('data-dither-source="decks/t/assets/opener-brand.source.jpg"');
    expect(root).toContain('data-dither-state="live"');
  });

  it('the standalone build refuses a live dithered picture with materialize first and accepts a materialized one', async () => {
    const { renderStandalone, MATERIALIZE_FIRST } = await import('../standalone.ts');
    const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };
    const slide = slideWith([dithered('bg', photograph, cover)]);
    // the play list is the deck's sections: the test slide has to be listed to render
    const listed = (deck: Deck): Deck => ({
      ...deck,
      sections: [{ id: 's', name: 'S', slideIds: ['bg'] }],
    });
    const uris: Record<string, string> = {};
    for (const asset of Object.values(fixtureDeck.assets))
      for (const path of 'neutral' in asset.twins
        ? [asset.twins.neutral]
        : [asset.twins.light, asset.twins.dark])
        uris[path] = 'data:image/png;base64,AA==';
    const live = renderStandalone(listed(fixtureDeck), [slide], { bundle, assetUris: uris });
    expect(live.missing.some((line) => line.endsWith(MATERIALIZE_FIRST))).toBe(true);
    expect(live.missing.find((line) => line.includes('bg:'))).toBe(
      `bg: dithered picture ${coverKey.slice(0, 12)}: materialize first`,
    );
    const materialized = deckWithVariant();
    const variant = materialized.assets['opener-brand']?.variants?.[coverKey];
    if (!variant || 'neutral' in variant.twins) throw new Error('variant');
    uris[variant.twins.light] = 'data:image/png;base64,AA==';
    uris[variant.twins.dark] = 'data:image/png;base64,AA==';
    const built = renderStandalone(listed(materialized), [slide], { bundle, assetUris: uris });
    expect(built.missing.filter((line) => line.endsWith(MATERIALIZE_FIRST))).toEqual([]);
    expect(built.html).toContain('data-dither-state="variant"');
  });
});

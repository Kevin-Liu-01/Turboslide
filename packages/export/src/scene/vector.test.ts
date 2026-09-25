// The vector reading of the extractor (docs/VECTOR.md 4.6, 6.3): `svg` is a 3x kind under the
// auto policy, and `vectorFilesOf` answers the vector file for the theme of every picture and
// shot block whose asset answers `vectorOf` (an svg picture's `vector`, a ship one logo's
// untinted source), through composites, never a missing asset, a raster asset or a tinted logo,
// plus the kit's mark and footer under the two kit names; a themed vector picks the theme's file.
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Deck, Slide } from '@turboslide/schema/deck';

import { rasterScaleFor, THREE_X_KINDS, vectorFilesOf } from './extract.ts';

const base = (id: string, role: Asset['role']): Asset => ({
  id,
  role,
  alt: `${id} alt`,
  twins: { neutral: `assets/${id}.png` },
  size: [120, 60],
  scale: 3,
  source: { kind: 'file' },
  inline: 'native',
});

const logoSource = (tint?: { light?: string; dark?: string }): Asset['source'] => ({
  kind: 'logo',
  provider: 'thesvg',
  slug: 'figma',
  variant: 'default',
  title: 'Figma',
  license: 'CC0-1.0',
  fetchedAt: '2026-09-24T00:00:00.000Z',
  digest: 'a'.repeat(64),
  ...(tint === undefined ? {} : { tint }),
});

const deck = {
  assets: {
    // an svg upload of this round: `vector` on the record
    art: { ...base('art', 'capture'), kind: 'svg', vector: { neutral: 'assets/art.ab12.svg' } },
    // a themed vector (a mono logo tinted per appearance, inserted this round)
    mono: {
      ...base('mono', 'logo'),
      kind: 'svg',
      vector: { light: 'assets/mono-light.svg', dark: 'assets/mono-dark.svg' },
    },
    // a ship one logo: the untinted sanitized source is the vector
    figma: { ...base('figma', 'logo'), source: logoSource(), sourceFile: 'assets/figma.source.1234.svg' },
    // a tinted ship one logo: no tinted svg on disk, PNG twins alone
    tinted: {
      ...base('tinted', 'logo'),
      source: logoSource({ light: '#070707', dark: '#f2f2f0' }),
      sourceFile: 'assets/tinted.source.5678.svg',
    },
    photo: base('photo', 'capture'),
  },
  brand: {
    mark: { kind: 'picture', assetId: 'figma' },
    footer: { logo: 'picture', assetId: 'art' },
  },
} as unknown as Pick<Deck, 'assets' | 'brand'>;

const DIR = join('/', 'tmp', 'deck');

describe('the 3x kinds (VECTOR.md 4.6)', () => {
  test('svg joins icon, mark and logo under auto; a forced policy holds', () => {
    expect(THREE_X_KINDS.has('svg')).toBe(true);
    expect(rasterScaleFor('svg', 'auto')).toBe(3);
    expect(rasterScaleFor('svg', 2)).toBe(2);
    expect(rasterScaleFor('block', 'auto', 'picture')).toBe(2);
  });
});

describe('vectorFilesOf', () => {
  test('reads the picture and shot blocks whose asset is a vector, through composites, and the kit logos', () => {
    const slide = {
      kind: 'content',
      id: 's1',
      layout: { type: 'freeform' },
      slots: {
        main: [
          { id: 'p1', type: 'picture', asset: 'art', pos: { x: 0, y: 0, w: 160, h: 100 } },
          { id: 'p2', type: 'shot', asset: 'figma' },
          { id: 'p3', type: 'picture', asset: 'photo' },
          { id: 'p4', type: 'picture', asset: 'tinted' },
          { id: 'p5', type: 'picture', asset: 'missing' },
          {
            id: 'c1',
            type: 'composite',
            cells: [{ blocks: [{ id: 'p6', type: 'picture', asset: 'mono' }] }],
          },
          { id: 't1', type: 'text', text: 'hello' },
        ],
      },
    } as unknown as Slide;
    const light = vectorFilesOf(slide, deck, 'light', DIR);
    expect([...light.entries()].sort()).toEqual([
      ['footer-logo', join(DIR, 'assets', 'art.ab12.svg')],
      ['p1', join(DIR, 'assets', 'art.ab12.svg')],
      ['p2', join(DIR, 'assets', 'figma.source.1234.svg')],
      ['p6', join(DIR, 'assets', 'mono-light.svg')],
      ['title-logo', join(DIR, 'assets', 'figma.source.1234.svg')],
    ]);
    const dark = vectorFilesOf(slide, deck, 'dark', DIR);
    expect(dark.get('p6')).toBe(join(DIR, 'assets', 'mono-dark.svg'));
    expect(dark.get('p1')).toBe(join(DIR, 'assets', 'art.ab12.svg'));
  });

  test('an opener reads its plate; a deck without a kit answers the blocks alone', () => {
    const opener = {
      kind: 'opener',
      id: 'o1',
      picture: { asset: 'photo' },
      plate: { blocks: [{ id: 'q1', type: 'picture', asset: 'art' }] },
    } as unknown as Slide;
    const out = vectorFilesOf(opener, { assets: deck.assets, brand: undefined }, 'light', DIR);
    expect([...out.keys()]).toEqual(['q1']);
    const gtMark = vectorFilesOf(
      opener,
      { assets: deck.assets, brand: { mark: { kind: 'default' }, footer: { logo: 'none' } } } as unknown as Pick<Deck, 'assets' | 'brand'>,
      'light',
      DIR,
    );
    expect(gtMark.has('title-logo')).toBe(false);
    expect(gtMark.has('footer-logo')).toBe(false);
  });
});

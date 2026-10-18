// The svg picture on the sheet (docs/archive/rounds/VECTOR.md 4.4, 6.3): a vector asset renders its svg file as
// the image's `src` at `object-fit: contain`, with `data-light` and `data-dark` for a tinted logo
// and none for an upload; a ship one logo's untinted source draws the same way; a shot block of
// the asset takes the svg through the resolver too; a raster picture renders as before.
import { describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck, Slide } from '@turboslide/schema/deck';
import { deck as fixtureDeck } from '../__tests__/fixtures.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';

const upload: Asset = {
  id: 'diagram',
  role: 'capture',
  alt: 'A diagram',
  kind: 'svg',
  vector: { neutral: 'assets/diagram.1a2b3c4d.svg' },
  twins: { neutral: 'assets/diagram.5e6f7a8b.png' },
  size: [200, 50],
  scale: 3,
  source: { kind: 'file' },
  inline: 'pass-through',
};

const tintedLogo: Asset = {
  id: 'acme',
  role: 'logo',
  alt: 'Acme logo',
  kind: 'svg',
  vector: { light: 'assets/acme.11111111-light.svg', dark: 'assets/acme.22222222-dark.svg' },
  twins: { light: 'assets/acme.33333333-light.png', dark: 'assets/acme.44444444-dark.png' },
  size: [324, 480],
  scale: 3,
  source: {
    kind: 'logo',
    provider: 'thesvg',
    slug: 'acme',
    variant: 'mono',
    title: 'Acme',
    license: 'CC0-1.0',
    fetchedAt: '2026-09-24T00:00:00Z',
    digest: 'ab'.repeat(32),
    tint: { light: '#070707', dark: '#f2f2f0' },
  },
  sourceFile: 'assets/acme.source.55555555.svg',
  inline: 'pass-through',
};

const shipOneLogo: Asset = {
  id: 'figma',
  role: 'logo',
  alt: 'Figma logo',
  twins: { neutral: 'assets/figma.66666666.png' },
  size: [324, 480],
  scale: 3,
  source: {
    kind: 'logo',
    provider: 'thesvg',
    slug: 'figma',
    variant: 'default',
    title: 'Figma',
    license: 'CC0-1.0',
    fetchedAt: '2026-09-22T00:00:00Z',
    digest: 'cd'.repeat(32),
  },
  sourceFile: 'assets/figma.source.77777777.svg',
  inline: 'pass-through',
};

const deck: Deck = {
  ...fixtureDeck,
  assets: { ...fixtureDeck.assets, diagram: upload, acme: tintedLogo, figma: shipOneLogo },
};

function canvas(blocks: Block[]): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'free',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: blocks },
  };
}

function options(theme: 'light' | 'dark'): RenderOptions {
  return { theme, chrome: false, assetBase: 'decks/t/', blockAttrs: true, gtWord: true };
}

const picture = (id: string, asset: string): Block =>
  ({ id, type: 'picture', asset, pos: { x: 100, y: 100, w: 400, h: 100, z: 1 } }) as Block;

/** The `<img class="picture-img" …>` tag of the block. */
function pictureImg(html: string, blockId: string): string {
  const at = html.indexOf(`data-block="${blockId}"`);
  expect(at, `block ${blockId}`).toBeGreaterThan(-1);
  const rest = html.slice(at);
  const start = rest.indexOf('<img class="picture-img"');
  expect(start, `picture-img of ${blockId}`).toBeGreaterThan(-1);
  return rest.slice(start, rest.indexOf('>', start) + 1);
}

describe('the svg picture (docs/archive/rounds/VECTOR.md 4.4)', () => {
  it('draws an upload’s vector file at object-fit contain with no twin attributes', () => {
    const html = renderSlide(deck, canvas([picture('p', 'diagram')]), options('light')).html;
    const img = pictureImg(html, 'p');
    expect(img).toContain('src="decks/t/assets/diagram.1a2b3c4d.svg"');
    expect(img).toMatch(/style="[^"]*object-fit:contain/);
    expect(img).not.toContain('data-light');
    expect(img).not.toContain('data-dark');
    expect(img).toContain('width="200"');
    expect(img).toContain('height="50"');
    expect(html).not.toContain('diagram.5e6f7a8b.png');
    /* the dark theme draws the same file */
    const dark = pictureImg(
      renderSlide(deck, canvas([picture('p', 'diagram')]), options('dark')).html,
      'p',
    );
    expect(dark).toContain('src="decks/t/assets/diagram.1a2b3c4d.svg"');
  });

  it('draws a tinted logo’s two vector files with data-light and data-dark for the theme swap', () => {
    const light = pictureImg(
      renderSlide(deck, canvas([picture('l', 'acme')]), options('light')).html,
      'l',
    );
    expect(light).toContain('src="decks/t/assets/acme.11111111-light.svg"');
    expect(light).toContain('data-dark="decks/t/assets/acme.22222222-dark.svg"');
    expect(light).not.toContain('data-light=');
    expect(light).toMatch(/object-fit:contain/);
    const dark = pictureImg(
      renderSlide(deck, canvas([picture('l', 'acme')]), options('dark')).html,
      'l',
    );
    expect(dark).toContain('src="decks/t/assets/acme.22222222-dark.svg"');
    expect(dark).toContain('data-light="decks/t/assets/acme.11111111-light.svg"');
    expect(dark).not.toContain('.png');
  });

  it('draws a ship one logo’s untinted source as vector without a migration, and a shot of an svg asset too', () => {
    const html = renderSlide(
      deck,
      canvas([
        picture('f', 'figma'),
        {
          id: 's',
          type: 'shot',
          asset: 'diagram',
          pos: { x: 600, y: 100, w: 400, h: 100, z: 2 },
        } as Block,
      ]),
      options('light'),
    ).html;
    expect(pictureImg(html, 'f')).toContain('src="decks/t/assets/figma.source.77777777.svg"');
    expect(html).not.toContain('figma.66666666.png');
    const shotAt = html.indexOf('data-block="s"');
    const shot = html.slice(shotAt, html.indexOf('</figure>', shotAt) + 9);
    expect(shot).toContain('src="decks/t/assets/diagram.1a2b3c4d.svg"');
    expect(shot).not.toContain('.png');
  });

  it('renders a raster picture as before: the twin as src, no contain declaration', () => {
    const html = renderSlide(deck, canvas([picture('r', 'opener-brand')]), options('light')).html;
    const img = pictureImg(html, 'r');
    expect(img).toContain('src="decks/t/assets/opener-brand-light.jpg"');
    expect(img).toContain('data-dark="decks/t/assets/opener-brand-dark.jpg"');
    expect(img).not.toContain('object-fit:contain');
  });
});

// Hardening HR-PC#6: a picture whose asset has a 400 px copy carries it as data-thumb and
// data-thumb-w when the render asks (RenderOptions.thumbs), for the viewer's clones to offer
// through srcset; a toned, vector or dithered picture never does, and neither does a render that
// did not ask.
describe('the small copy of a picture (HR-PC#6)', () => {
  const photo: Asset = {
    id: 'field',
    role: 'mood',
    alt: 'A field',
    twins: { neutral: 'assets/field.1a2b3c4d.jpg' },
    size: [1600, 900],
    scale: 1,
    thumb: { file: 'assets/field.5e6f7a8b-w400.webp', size: [400, 225] },
    source: { kind: 'file' },
    inline: 'pass-through',
  };
  const toned: Asset = {
    ...photo,
    id: 'toned',
    twins: { light: 'assets/toned-light.png', dark: 'assets/toned-dark.png' },
  };
  const vector: Asset = { ...upload, id: 'vector', thumb: photo.thumb };
  const withCopies: Deck = { ...deck, assets: { ...deck.assets, field: photo, toned, vector } };
  const asked = (theme: 'light' | 'dark'): RenderOptions => ({ ...options(theme), thumbs: true });

  it('writes the copy and its width beside the twin when the render asks', () => {
    const img = pictureImg(
      renderSlide(withCopies, canvas([picture('p', 'field')]), asked('light')).html,
      'p',
    );
    expect(img).toContain('src="decks/t/assets/field.1a2b3c4d.jpg"');
    expect(img).toContain('data-thumb="decks/t/assets/field.5e6f7a8b-w400.webp"');
    expect(img).toContain('data-thumb-w="400"');
    expect(img).toContain('width="1600"');
    const unasked = pictureImg(
      renderSlide(withCopies, canvas([picture('p', 'field')]), options('light')).html,
      'p',
    );
    expect(unasked).not.toContain('data-thumb');
  });

  it('writes none for a toned, a vector or a dithered picture', () => {
    for (const assetId of ['toned', 'vector'])
      expect(
        pictureImg(
          renderSlide(withCopies, canvas([picture('p', assetId)]), asked('dark')).html,
          'p',
        ),
        assetId,
      ).not.toContain('data-thumb');
    const dithered = {
      ...picture('d', 'field'),
      dither: { pattern: 'bayer8' },
    } as Block;
    const html = renderSlide(withCopies, canvas([dithered]), asked('light')).html;
    expect(html).not.toContain('data-thumb');
  });

  it('writes the copy on an opener’s picture through the same resolver', () => {
    const opener: Slide = {
      schemaVersion: 1,
      id: 'open',
      kind: 'opener',
      sectionId: 'brand',
      picture: { asset: 'field', fit: 'cover' },
      plate: {
        side: 'lower-left',
        maxWidth: 740,
        blocks: [{ id: 'big', type: 'heading', level: 'big', text: 'Fields' }],
      },
    };
    const html = renderSlide(withCopies, opener, asked('light')).html;
    expect(html).toContain('data-thumb="decks/t/assets/field.5e6f7a8b-w400.webp"');
  });
});

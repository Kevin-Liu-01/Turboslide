// The svg picture on the sheet (docs/VECTOR.md 4.4, 6.3): a vector asset renders its svg file as
// the image's `src` at `object-fit: contain`, with `data-light` and `data-dark` for a tinted logo
// and none for an upload; a ship one logo's untinted source draws the same way; a shot block of
// the asset takes the svg through the resolver too; a raster picture renders as before.
import { describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck } from '@turboslide/schema/deck';
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

describe('the svg picture (docs/VECTOR.md 4.4)', () => {
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

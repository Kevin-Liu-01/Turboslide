// Every image the renderer writes carries width and height from the asset's size (gslides-parity
// SPEC-3 9.2 E12, 16.6 render row): the block catalog, the fixture deck's kinds, the GT deck and
// the export fixture deck in both themes, the print document, the thumbnail, and the escape block's
// rewrite.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import type { BlockContext } from '../blocks/context.ts';
import { withImageSizes } from '../blocks/img-size.ts';
import { renderBlock } from '../blocks/render-block.ts';
import { renderPrintDocument } from '../print.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { renderThumb } from '../thumb.ts';
import { catalog, deck as fixtureDeck, contentSlide, twinAsset } from './fixtures.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const themes: Theme[] = ['light', 'dark'];
const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };

function loadDeck(dir: string): { deck: Deck; slides: Slide[] } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides = readdirSync(join(dir, 'slides')).map(
    (file) => JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8')) as Slide,
  );
  return { deck, slides };
}

/** Every `<img` tag of a document. */
function imgTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/g) ?? [];
}

function expectSized(html: string, where: string): void {
  const tags = imgTags(html);
  for (const tag of tags) {
    expect(tag, `${where}: ${tag}`).toMatch(/\swidth="\d+"/);
    expect(tag, `${where}: ${tag}`).toMatch(/\sheight="\d+"/);
  }
}

function options(theme: Theme, extra: Partial<RenderOptions> = {}): RenderOptions {
  return { theme, chrome: true, assetBase: 'decks/t/', blockAttrs: true, gtWord: true, ...extra };
}

function context(theme: Theme): BlockContext {
  return {
    slideId: 'catalog',
    theme,
    blockAttrs: true,
    gtWord: true,
    image: (id) => {
      const asset = fixtureDeck.assets[id];
      if (!asset) return undefined;
      if ('neutral' in asset.twins)
        return { src: asset.twins.neutral, alt: asset.alt, size: asset.size };
      return {
        src: theme === 'dark' ? asset.twins.dark : asset.twins.light,
        light: asset.twins.light,
        dark: asset.twins.dark,
        alt: asset.alt,
        size: asset.size,
      };
    },
    assetUrl: (path) => path,
    asset: (id) => fixtureDeck.assets[id],
    assetSize: (path) => {
      for (const asset of Object.values(fixtureDeck.assets)) {
        const paths =
          'neutral' in asset.twins ? [asset.twins.neutral] : [asset.twins.light, asset.twins.dark];
        if (paths.includes(path)) return asset.size;
      }
      return undefined;
    },
    slotWidth: 731.5,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

describe('every emitted <img> carries width and height', () => {
  it('in the block catalog, both themes', () => {
    let seen = 0;
    for (const theme of themes)
      for (const block of catalog) {
        const html = renderBlock(block, context(theme));
        seen += imgTags(html).length;
        expectSized(html, `${block.type} ${block.id} ${theme}`);
      }
    expect(seen).toBeGreaterThan(10);
  });

  it('in the fixture deck slides, the thumbnail and the print document', () => {
    const figures = catalog.filter((block) =>
      ['shot', 'pair', 'tiles', 'details', 'board', 'logoPlates', 'material', 'picture'].includes(
        block.type,
      ),
    );
    const slides: Slide[] = [
      contentSlide('figs', { type: 'stack' }, { main: figures }),
      {
        schemaVersion: 1,
        id: 'op',
        kind: 'opener',
        sectionId: 'brand',
        picture: { asset: 'opener-brand', fit: 'cover' },
        plate: { side: 'lower-left', maxWidth: 740, blocks: [] },
      },
      {
        schemaVersion: 1,
        id: 'mood',
        kind: 'mood',
        picture: { asset: 'opener-brand', fit: 'cover', position: 'top' },
        plate: { side: 'lower-right', maxWidth: 560, blocks: [] },
      },
    ];
    for (const theme of themes)
      for (const slide of slides) {
        const html = renderSlide(fixtureDeck, slide, options(theme, { live: true })).html;
        expect(imgTags(html).length).toBeGreaterThan(0);
        expectSized(html, `${slide.id} ${theme}`);
        expectSized(renderThumb(fixtureDeck, slide, theme).html, `thumb ${slide.id} ${theme}`);
      }
    const deckWithSlides: Deck = {
      ...fixtureDeck,
      sections: [{ id: 's', name: 'S', slideIds: slides.map((slide) => slide.id) }],
    };
    const print = renderPrintDocument(deckWithSlides, slides, {
      bundle,
      theme: 'light',
      assetBase: 'decks/t/',
    });
    expect(imgTags(print.html).length).toBeGreaterThan(0);
    expectSized(print.html, 'print');
  });

  it('across the GT deck and the export fixture deck in both themes', () => {
    for (const dir of ['decks/gt-brand', 'decks/fixture/gslides']) {
      const { deck, slides } = loadDeck(join(REPO, dir));
      let seen = 0;
      for (const theme of themes)
        for (const slide of slides) {
          const rendered = renderSlide(deck, slide, options(theme, { live: true }));
          seen += imgTags(rendered.html).length;
          expectSized(rendered.html, `${dir} ${slide.id} ${theme}`);
        }
      expect(seen, dir).toBeGreaterThan(0);
    }
  });

  it('writes the opener image with the stored size', () => {
    const opener: Slide = {
      schemaVersion: 1,
      id: 'op',
      kind: 'opener',
      sectionId: 'brand',
      picture: { asset: 'opener-brand', fit: 'cover' },
      plate: { side: 'lower-left', maxWidth: 740, blocks: [] },
    };
    const html = renderSlide(fixtureDeck, opener, options('light')).html;
    expect(html).toContain(
      '<img class="opener-img" src="decks/t/assets/opener-brand-light.jpg" data-dark="decks/t/assets/opener-brand-dark.jpg" width="1600" height="900" alt="',
    );
  });

  it('adds the size to an escape block image that names a deck asset and leaves the rest alone', () => {
    const ctx = context('light');
    const light = twinAsset.twins as { light: string; dark: string };
    const html = [
      `<img src="${light.light}" data-dark="${light.dark}" alt="home">`,
      `<img src="${light.dark}">`,
      '<img src="https://example.com/x.png">',
      `<img src="${light.light}" width="400">`,
      `<img src="${light.light}" height="200" width="300">`,
      '<img src="assets/unknown.png">',
    ].join('');
    const out = withImageSizes(html, ctx);
    expect(out).toContain(
      `<img width="1440" height="900" src="${light.light}" data-dark="${light.dark}" alt="home">`,
    );
    expect(out).toContain(`<img width="1440" height="900" src="${light.dark}">`);
    expect(out).toContain('<img src="https://example.com/x.png">');
    expect(out).toContain(`<img src="${light.light}" width="400">`);
    expect(out).toContain(`<img src="${light.light}" height="200" width="300">`);
    expect(out).toContain('<img src="assets/unknown.png">');
    // through the block renderer, the rewritten image reaches the escape markup with its URL
    const block = {
      id: 'x',
      type: 'html',
      css: '',
      html: `<figure><img src="${light.light}" data-dark="${light.dark}" alt="home"></figure>`,
      note: 'a figure',
    } as Block;
    // the escape renderer rewrites the twin attributes and keeps the size ones
    const rendered = renderBlock(block, ctx);
    const tag = imgTags(rendered)[0] ?? '';
    expect(tag).toContain('width="1440"');
    expect(tag).toContain('height="900"');
    expect(tag).toContain('src="assets/site-home-light.jpg"');
    expect(tag).toContain('data-dark="assets/site-home-dark.jpg"');
    // without a deck the markup is untouched
    const bare = { ...ctx, assetSize: undefined };
    expect(withImageSizes(html, bare)).toBe(html);
  });
});

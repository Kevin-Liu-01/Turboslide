// HTML and CSS under the hood of a slide (docs/html-layers.md): the deck's and the slide's
// HtmlLayer render as scoped CSS inside the slide and as markup layers under or over its blocks,
// sanitized inline or in the sandboxed frame, and a deck without one renders as before. Also the
// scope fixes the layers rely on (sanitize/scope.ts): a grouping `@` rule cannot carry a rule out
// of the scope, and a scope class is matched whole.
import { beforeAll, describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck } from '@turboslide/schema/deck';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';
import { htmlLayerFrameFor } from '../sanitize/frame.ts';
import { loadPurifier, sanitizeHtmlLayer } from '../sanitize/html.ts';
import { scopeCss } from '../sanitize/scope.ts';
import { deck as baseDeck } from './fixtures.ts';

const options: RenderOptions = {
  theme: 'light',
  chrome: false,
  assetBase: 'decks/t/',
  blockAttrs: true,
  gtWord: true,
};

const slide: ContentSlide = {
  schemaVersion: 1,
  id: 'ly',
  kind: 'content',
  layout: { type: 'stack' },
  slots: { main: [{ id: 'h', type: 'heading', text: 'Orders' } as Block] },
};

const withHtml = (deckHtml?: Deck['html'], slideHtml?: ContentSlide['html']) => ({
  deck: { ...baseDeck, ...(deckHtml !== undefined ? { html: deckHtml } : {}) },
  slide: { ...slide, ...(slideHtml !== undefined ? { html: slideHtml } : {}) },
});

beforeAll(async () => {
  await loadPurifier();
});

describe('scopeCss (the scope the layers and the html block share)', () => {
  it('scopes the rules inside @media, @supports and nested groups', () => {
    const out = scopeCss(
      '@media (min-width: 1px) { body { display: none } @supports (display: grid) { .a { color: red } } }',
      '.s',
    );
    expect(out).toContain('.ts-sheet .s body {');
    expect(out).toContain('.ts-sheet .s .a {');
    expect(out).not.toMatch(/\{\s*body\s*\{/);
  });

  it('copies @keyframes steps unscoped', () => {
    const out = scopeCss('@keyframes k { from { opacity: 0 } to { opacity: 1 } }', '.s');
    expect(out).toContain('from {');
    expect(out).not.toContain('.ts-sheet .s from');
  });

  it('matches a scope class whole, so .ts-x-s1 does not take .ts-x-s10 as already scoped', () => {
    expect(scopeCss('.ts-x-s10 p { color: red }', '.ts-x-s1')).toBe(
      '.ts-sheet .ts-x-s1 .ts-x-s10 p { color: red }',
    );
    expect(scopeCss('.ts-x-s1 p { color: red }', '.ts-x-s1')).toBe(
      '.ts-sheet .ts-x-s1 p { color: red }',
    );
  });

  it('maps :scope to the scope root', () => {
    expect(scopeCss(':scope { color: red }', '[data-slide="a"]')).toBe(
      '.ts-sheet [data-slide="a"] { color: red }',
    );
  });

  it('drops a statement where rules stand and a stray close brace, keeping the next rule scoped', () => {
    expect(scopeCss('@layer a, b; .card { color: red }', '.s')).toBe(
      '.ts-sheet .s .card { color: red }',
    );
    expect(scopeCss('} body { color: red }', '.s')).toBe('.ts-sheet .s body { color: red }');
  });
});

describe('the HtmlLayer render', () => {
  it('renders a slide of a deck with no HtmlLayer as before', () => {
    const out = renderSlide(baseDeck, slide, options);
    expect(out.html).not.toContain('slide-html');
    expect(out.html).not.toContain('[data-slide="ly"]');
    expect(out.rasters.filter((raster) => raster.blockId.startsWith('html-'))).toEqual([]);
  });

  it('scopes the deck’s then the slide’s CSS to the slide, through the tokenizer', () => {
    const { deck, slide: s } = withHtml(
      { css: '.h1 { letter-spacing: -0.02em } @import url(https://evil.example/x.css);' },
      { css: ':scope { background: var(--plate) } .note { position: fixed }' },
    );
    const out = renderSlide(deck, s, options).html;
    const style =
      /<style>([^<]*)<\/style>/.exec(out.slice(out.indexOf('data-slide="ly"')))?.[1] ?? '';
    expect(style).toContain('.ts-sheet [data-slide="ly"] .h1 {');
    expect(style).toContain('.ts-sheet [data-slide="ly"] {');
    expect(style.indexOf('.h1')).toBeLessThan(style.indexOf('var(--plate)'));
    expect(style).not.toContain('evil.example');
    expect(style).not.toContain('fixed');
  });

  it('draws the markup sanitized, under the blocks by default and over them on request', () => {
    const { deck, slide: s } = withHtml(
      { markup: '<div class="band" onclick="alert(1)">Q4</div><script>alert(1)</script>' },
      { markup: '<p class="stamp">Draft</p>', layer: 'over' },
    );
    const out = renderSlide(deck, s, options);
    const under = out.html.indexOf('class="slide-html is-under"');
    const inner = out.html.indexOf('<div class="in"');
    const over = out.html.indexOf('class="slide-html is-over"');
    expect(under).toBeGreaterThan(-1);
    expect(under).toBeLessThan(inner);
    expect(over).toBeGreaterThan(inner);
    expect(out.html).toContain('<div class="band">Q4</div>');
    expect(out.html).not.toContain('<script');
    expect(out.html).not.toContain('onclick');
    expect(out.rasters.filter((raster) => raster.kind === 'html')).toEqual([
      expect.objectContaining({ blockId: 'html-deck', alpha: true }),
      expect.objectContaining({ blockId: 'html-slide', alpha: true }),
    ]);
  });

  it('hands each markup layer to the frame builder when the surface passes one', () => {
    const seen: string[] = [];
    const { deck, slide: s } = withHtml(
      { css: '.band { color: red }' },
      { markup: '<div class="band">Q4</div>' },
    );
    const out = renderSlide(deck, s, {
      ...options,
      htmlLayerFrame: (layer) => {
        seen.push(`${layer.slideId} ${layer.from} ${layer.css}`);
        return { srcdoc: '<body>frame</body>', title: 'Slide HTML' };
      },
    }).html;
    expect(seen).toEqual(['ly slide .band { color: red }']);
    expect(out).toMatch(
      /<div class="slide-html is-under ts-x-host" data-html-layer="slide"[^>]*><iframe class="ts-x-frame" sandbox="" srcdoc="&lt;body>frame&lt;\/body>"/,
    );
    expect(out).not.toContain('<div class="band">');
  });

  it('draws nothing when the surface turns the layers off', () => {
    const { deck, slide: s } = withHtml({ css: '.h1 { color: red }', markup: '<b>x</b>' });
    const out = renderSlide(deck, s, { ...options, htmlLayersOff: true }).html;
    expect(out).not.toContain('slide-html');
    expect(out).not.toContain('[data-slide="ly"]');
  });

  it('builds the frame document with the layer’s scope matching its markup and the frame CSP', () => {
    const build = htmlLayerFrameFor({ theme: 'light', assetUrl: (path) => `/a/${path}` });
    const source = build({
      slideId: 'ly',
      from: 'slide',
      markup: '<div class="band"><img src="assets/x-light.jpg"></div><script>1</script>',
      css: '.band { color: red } @media print { body { display: none } }',
    });
    if (source === undefined) throw new Error('no source');
    expect(source.srcdoc).toContain("default-src 'none'");
    expect(source.srcdoc).toContain(
      '<div class="ts-sheet" data-theme="light"><div class="ts-x-ly-layer-slide">',
    );
    expect(source.srcdoc).toContain('.ts-sheet .ts-x-ly-layer-slide .band {');
    expect(source.srcdoc).toContain('.ts-sheet .ts-x-ly-layer-slide body {');
    expect(source.srcdoc).toContain('src="/a/assets/x-light.jpg"');
    expect(source.srcdoc).not.toContain('<script');
  });
});

describe('sanitizeHtmlLayer (the write time pass)', () => {
  it('cleans the markup and drops the CSS the tokenizer refuses', async () => {
    const result = await sanitizeHtmlLayer({
      css: '@import url(https://evil.example/x.css); .a { color: red }',
      markup: '<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>',
      layer: 'over',
    });
    expect(result.changed).toBe(true);
    expect(result.layer.layer).toBe('over');
    expect(result.layer.markup).not.toContain('javascript:');
    expect(result.layer.markup).not.toContain('onerror');
    expect(result.layer.css).not.toContain('@import');
    expect(result.layer.css).toContain('.a');
    expect(result.droppedCss.length).toBeGreaterThan(0);
  });
});

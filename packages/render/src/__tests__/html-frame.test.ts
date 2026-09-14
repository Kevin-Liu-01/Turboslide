// The `html` block's sandboxed frame element (gslides-parity SPEC-3 8.4 item 2): emitted when the
// context supplies the frame document, the scoped escape markup otherwise, so nothing changes until
// the frame module lands; the frame carries `sandbox=""` and the block's markup never reaches the
// host document.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide } from '@turboslide/schema/deck';
import type { BlockContext } from '../blocks/context.ts';
import { FRAME_CLASS, FRAME_HOST_CLASS } from '../blocks/html-frame.ts';
import { renderBlock } from '../blocks/render-block.ts';
import { FRAME_DOM } from '../collab.ts';
import { renderSlide } from '../slide.ts';
import { deck } from './fixtures.ts';

const block = {
  id: 'ex',
  type: 'html',
  css: '.lay { display: flex; }',
  html: '<div class="lay"><h3 onclick="alert(1)">Fixed</h3><script>alert(1)</script></div>',
  note: 'Two tables.',
} as Block;

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'fr',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 1326,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

describe('the html block frame', () => {
  it('renders the scoped escape markup when the context has no frame source', () => {
    const html = renderBlock(block, context());
    expect(html).toContain('class="ts-x-fr-ex"');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<script');
  });

  it('renders iframe.ts-x-frame with sandbox="" and the supplied document', () => {
    const srcdoc =
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body><div class="lay"><h3>Fixed</h3></div></body></html>';
    const ctx = context({ htmlFrame: () => ({ srcdoc, title: 'Two tables', height: 300 }) });
    const html = renderBlock(block, ctx);
    expect(html).toMatch(
      /^<div class="ts-x-fr-ex ts-x-host" style="height:300px" data-block="ex" data-type="html" data-note="Two tables\." data-raster="html" data-rid="ex:1"><iframe class="ts-x-frame" sandbox="" srcdoc="[^"]*" title="Two tables" loading="eager" referrerpolicy="no-referrer"><\/iframe><\/div>$/,
    );
    // the document travels escaped inside the attribute; the host carries none of it
    expect(html).toContain('srcdoc="&lt;!doctype html>');
    expect(html).not.toMatch(/<\/div><script/);
    expect(html.indexOf('<h3>')).toBe(-1);
    expect(ctx.rasters).toEqual([
      {
        blockId: 'ex',
        kind: 'html',
        selector: '[data-slide="fr"] [data-rid="ex:1"]',
        alpha: false,
      },
    ]);
    expect(FRAME_HOST_CLASS).toBe(FRAME_DOM.host);
    expect(FRAME_CLASS).toBe(FRAME_DOM.frame);
  });

  it('hands the frame source the block with its images sized and fills a positioned box', () => {
    const seen: string[] = [];
    const positioned = {
      ...block,
      html: '<img src="assets/site-home-light.jpg" data-dark="assets/site-home-dark.jpg">',
      pos: { x: 100, y: 100, w: 800, h: 450, z: 1 },
    } as Block;
    const slide: ContentSlide = {
      schemaVersion: 1,
      id: 'fr',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: { main: [positioned] },
    };
    const html = renderSlide(deck, slide, {
      theme: 'light',
      chrome: false,
      assetBase: 'decks/t/',
      blockAttrs: true,
      gtWord: true,
      htmlFrame: (b) => {
        seen.push(b.html);
        return { srcdoc: `<body>${b.html}</body>` };
      },
    }).html;
    expect(seen).toEqual([
      '<img width="1440" height="900" src="assets/site-home-light.jpg" data-dark="assets/site-home-dark.jpg">',
    ]);
    // a positioned host takes its wrapper's box (block-css.ts), so no inline height
    expect(html).toMatch(
      /<div class="free" data-free="ex" style="[^"]*width:800px;height:450px[^"]*"><div class="ts-x-fr-ex ts-x-host" data-block="ex"/,
    );
    expect(html).toContain('title="Two tables."');
  });
});

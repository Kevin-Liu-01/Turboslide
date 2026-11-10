// A template's cover on the gallery (template-cover.ts). Anyone who may copy a deck can save it
// as a template, and the gallery draws every template's cover on a page everyone opens, so a
// cover draws no embedded HTML: an `html` block is its note in the sandboxed frame and no
// HtmlLayer is drawn. The control renders the same slide the way the gallery did before, to show
// that the markup and the layers of this fixture do reach a page without the policy.
import { describe, expect, it } from 'vitest';

import { renderSlide } from '@turboslide/render/slide';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { templateCoverHtml } from './template-cover';

const BLOCK_MARKUP = '<p>block markup</p><img src="x" onerror="window.hostile = 1">';

/** The fixture's content slide with an `html` block in its left column, and a layer on the slide and on the deck. */
function coverWithEmbeddedHtml(): { deck: Deck; slide: Slide } {
  const document = workedDocument();
  const base = document.slides['content-rule'];
  if (base === undefined || base.kind !== 'content') throw new Error('no content slide');
  const slide = {
    ...base,
    slots: {
      ...base.slots,
      left: [
        ...(base.slots.left ?? []),
        {
          id: 'esc',
          type: 'html',
          css: '.esc { position: fixed; inset: 0 }',
          html: BLOCK_MARKUP,
          note: 'A chart the grammar cannot draw',
        },
      ],
    },
    html: { css: '.ts-sheet h2 { color: rgb(1, 2, 3) }', markup: '<p>slide layer markup</p>' },
  } as Slide;
  const deck: Deck = {
    ...document.deck,
    html: { css: '.ts-sheet p { color: rgb(4, 5, 6) }', markup: '<p>deck layer markup</p>' },
  };
  return { deck, slide };
}

describe("a template's cover on the gallery", () => {
  it('draws the slide with an html block as its note in the sandboxed frame', () => {
    const { deck, slide } = coverWithEmbeddedHtml();
    const html = templateCoverHtml(deck, slide, 'dark');
    expect(html).toContain('The content rule');
    expect(html).toContain('class="ts-x-frame"');
    expect(html).toContain('sandbox=""');
    expect(html).toContain('A chart the grammar cannot draw');
    expect(html).not.toContain('block markup');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('window.hostile');
    expect(html).not.toContain('position: fixed');
  });

  it("draws no HtmlLayer, the deck's or the slide's", () => {
    const { deck, slide } = coverWithEmbeddedHtml();
    const html = templateCoverHtml(deck, slide, 'light');
    expect(html).not.toContain('layer markup');
    expect(html).not.toContain('rgb(1, 2, 3)');
    expect(html).not.toContain('rgb(4, 5, 6)');
  });

  it('differs from the plain render, which carries the block markup and the layers', () => {
    const { deck, slide } = coverWithEmbeddedHtml();
    const plain = renderSlide(deck, slide, {
      theme: 'dark',
      chrome: false,
      assetBase: '',
      blockAttrs: false,
      gtWord: false,
      prompts: true,
    }).html;
    expect(plain).toContain('block markup');
    expect(plain).toContain('layer markup');
    expect(plain).not.toContain('class="ts-x-frame"');
  });
});

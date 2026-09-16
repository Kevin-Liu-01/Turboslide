// renderPrintDocument (gslides-parity SPEC 6.8, 7.6; SPEC-5 6.2): the one slide document on the
// slide's own paper is byte identical to the pre layout document (the same `@page`, no paper
// class), a handout prints `ceil(slides / perPage)` pages with every slide in a cell, a hairline
// around each and the footer band, the 3 per page layout carries its ruled lines, the notes page
// carries the notes and names a clipped one, Hide background prints light on white with the
// background layers removed, and the paper's `@page` is the paper's size in points.
import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';

import { HIDE_BACKGROUND_CSS, PRINT_CSS, renderPrintDocument } from '../print.ts';
import { printPageCount } from '../print-layout.ts';
import { contentSlide, deck as fixture } from './fixtures.ts';

/* seven content slides with a heading each: two pages of a 6 per page handout */
const slides: Slide[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
  contentSlide(
    id,
    { type: 'stack' },
    { main: [{ id: 'h', type: 'heading', level: 'h2', text: `Slide ${id}` }] },
    { notes: `Notes for ${id}.` },
  ),
);
const deck: Deck = {
  ...fixture,
  sections: [{ id: 's', name: 'S', slideIds: slides.map((slide) => slide.id) }],
};
const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };
const assetBase = '';

describe('renderPrintDocument', () => {
  it('prints one slide per page on the slide paper as before the layouts', () => {
    const doc = renderPrintDocument(deck, slides, { bundle, assetBase });
    expect(doc.layout).toBe('slides');
    expect(doc.paper).toBe('slide');
    expect(doc.pages).toBe(doc.slides.length);
    expect(doc.cells).toHaveLength(doc.slides.length);
    expect(doc.html).toContain(PRINT_CSS);
    expect(doc.html).not.toContain('ts-page-paper');
    expect(doc.html).not.toContain(HIDE_BACKGROUND_CSS);
    expect(doc.html).toContain('@page { size: 960pt 540pt; margin: 0; }');
    expect(doc.truncatedNotes).toEqual([]);
    // the layout fields at their defaults produce the same bytes
    const again = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      layout: 'slides',
      paper: 'slide',
    });
    expect(again.html).toBe(doc.html);
  });

  it('lays a handout of 6 out on Letter portrait with every slide in a cell and the footer band', () => {
    const doc = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      layout: 'handout-6',
      paper: 'letter',
      orientation: 'portrait',
    });
    const count = doc.slides.length;
    expect(doc.pages).toBe(printPageCount(count, 'handout-6'));
    expect(doc.pages).toBe(Math.ceil(count / 6));
    expect(doc.cells).toHaveLength(count);
    expect(doc.cells[0]).toEqual({ page: 1, cell: 0, slideId: doc.slides[0]?.slideId });
    expect(doc.paperPt).toEqual({ width: 612, height: 792 });
    expect(doc.html).toContain('@page { size: 612pt 792pt; margin: 0; }');
    expect((doc.html.match(/class="ts-page ts-page-paper"/g) ?? []).length).toBe(doc.pages);
    expect((doc.html.match(/class="ts-cell-slide"/g) ?? []).length).toBe(count);
    expect((doc.html.match(/class="ts-footer"/g) ?? []).length).toBe(doc.pages);
    expect(doc.html).toContain(`<span class="ts-footer-count">1 of ${doc.pages}</span>`);
    expect(doc.html).toContain('outline: 0.833px solid #bfbfbf');
    // the sprite once, in the first cell's stage
    expect(doc.html.match(/<svg id="sprite"><\/svg>/g)?.length).toBe(1);
    // every page is the paper's box in CSS px: 612 pt over 0.6
    expect(doc.html).toContain('.ts-page { position: relative; width: 1020px; height: 1320px;');
  });

  it('draws the 3 per page ruled lines and fills a handout down the columns on request', () => {
    const doc = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      layout: 'handout-3',
      paper: 'a4',
    });
    expect(doc.orientation).toBe('portrait');
    expect(doc.html).toContain('class="ts-rule"');
    expect(doc.html).toContain('@page { size: 595.28pt 841.89pt; margin: 0; }');
    const down = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      layout: 'handout-4',
      paper: 'letter',
      order: 'down',
    });
    expect(down.order).toBe('down');
    // across fills the first row first: cell 1 is the second column; down fills the first column: cell 1 is the second row
    const across = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      layout: 'handout-4',
      paper: 'letter',
    });
    const secondCellTop = (html: string): string =>
      /data-cell="1"[^>]*style="left:([^;]+);top:([^;]+)/.exec(html)?.[2] ?? '';
    const firstCellTop = (html: string): string =>
      /data-cell="0"[^>]*style="left:([^;]+);top:([^;]+)/.exec(html)?.[2] ?? '';
    if (down.slides.length > 1) {
      expect(secondCellTop(across.html)).toBe(firstCellTop(across.html));
      expect(secondCellTop(down.html)).not.toBe(firstCellTop(down.html));
    }
  });

  it('prints the notes page with the notes under the slide and names a clipped one', () => {
    const long = { ...slides[0]!, notes: 'A line of notes. '.repeat(400) };
    const doc = renderPrintDocument(deck, [long, ...slides.slice(1)], {
      bundle,
      assetBase,
      layout: 'notes',
      paper: 'letter',
    });
    expect(doc.pages).toBe(doc.slides.length);
    expect(doc.html).toContain('class="ts-notes"');
    expect(doc.html).toContain('A line of notes.');
    expect(doc.truncatedNotes).toContain(long.id);
    expect(doc.html).toContain('data-truncated=""');
  });

  it('hides the background as the light appearance on white with the background layers removed', () => {
    const doc = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      theme: 'dark',
      hideBackground: true,
    });
    expect(doc.theme).toBe('light');
    expect(doc.hideBackground).toBe(true);
    expect(doc.html).toContain(HIDE_BACKGROUND_CSS);
    const paper = renderPrintDocument(deck, slides, {
      bundle,
      assetBase,
      theme: 'dark',
      layout: 'handout-2',
      paper: 'letter',
      hideBackground: true,
    });
    expect(paper.theme).toBe('light');
    expect(paper.html).toContain(HIDE_BACKGROUND_CSS);
  });
});

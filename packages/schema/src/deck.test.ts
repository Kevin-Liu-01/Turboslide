// slideTitle and its parts (SPEC 4.2; tail:90-94): the override, the derived title of every slide
// kind, the h1 or h2 of an html escape (the four escapes of the GT deck: slides 25, 67, 83 and
// 84), the two fallbacks and the 72-character trim.
import { describe, expect, it } from 'vitest';

import type { Block, HtmlBlock } from './blocks.ts';
import { derivedSlideTitle, htmlBlockTitle, slideTitle, TITLE_MAX_CHARS } from './deck.ts';
import type { ContentSlide } from './deck.ts';
import { CONTENT_RULE, MOOD_EARTH_SLIDE, OPENER_BRAND, THESIS, TITLE } from './fixtures.ts';

function escapeSlide(id: string, html: string): ContentSlide {
  const block: HtmlBlock = { id: 'x', type: 'html', css: '', html, note: `Escape: ${id}` };
  return {
    schemaVersion: 1,
    id,
    kind: 'content',
    layout: { type: 'stack' },
    slots: { main: [block] },
  };
}

function stack(id: string, blocks: Block[]): ContentSlide {
  return {
    schemaVersion: 1,
    id,
    kind: 'content',
    layout: { type: 'stack' },
    slots: { main: blocks },
  };
}

// The opening markup of the four escape blocks in decks/gt-brand, abridged after the heading.
const ESCAPES: Record<string, string> = {
  diagrams: `<div class="lay">
          <div class="head">
            <h2>Diagrams</h2>
            <p>Every diagram is an inline SVG drawn in one grammar.</p>
          </div>
          <div class="rules"><div class="rows" style="--key:120px"><div><b>Strokes</b><span>Lines are 1px.</span></div></div></div></div>`,
  'presenter-compare': `<div class="split">
        <div class="head"><h2>Compare and the presenter</h2>
          <p>Two review tools sit beside the knowledge base.</p></div>
        <div class="body"><div class="tools"><figure><div class="rig"><img src="assets/proto-compare-light.jpg" alt=""></div></figure></div></div></div>`,
  'fixed-points': `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="i-lock-closed" viewBox="0 0 20 20"><path d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5Z"></path></symbol></svg>
      <div class="lay">
        <div class="head">
          <h2>Fixed points</h2>
          <p>What does not change.</p>
        </div>
        <div class="two"><h3>Fixed</h3></div></div>`,
  goals: `<div class="lay">
        <div class="head"><h2>Success criteria</h2>
          <p>Visitors perceive quality before reading any copy.</p></div>
        <div class="plain"><span><svg class="ic ok" aria-hidden="true"><use href="#i-check-circle"></use></svg>The mark works at 16px.</span></div></div>`,
};

describe('htmlBlockTitle', () => {
  it('titles the four escapes of the GT deck from their h2', () => {
    expect(
      Object.fromEntries(Object.entries(ESCAPES).map(([id, html]) => [id, htmlBlockTitle(html)])),
    ).toEqual({
      diagrams: 'Diagrams',
      'presenter-compare': 'Compare and the presenter',
      'fixed-points': 'Fixed points',
      goals: 'Success criteria',
    });
  });

  it('takes the first h1 or h2 in document order, drops inner tags and decodes entities', () => {
    expect(
      htmlBlockTitle('<div><h1 class="t">One &amp; <b>two</b>&nbsp;three</h1><h2>Later</h2></div>'),
    ).toBe('One & two three');
    expect(htmlBlockTitle('<h2>A</h2><h1>B</h1>')).toBe('A');
    expect(htmlBlockTitle('<h2>Tab &#9;and &#x41;</h2>')).toBe('Tab and A');
    expect(htmlBlockTitle('<h2>Keeps &unknown; as written</h2>')).toBe(
      'Keeps &unknown; as written',
    );
  });

  it('is undefined without an h1 or h2 or when the heading is empty', () => {
    expect(
      htmlBlockTitle('<div class="two"><h3>Fixed</h3><p>Only smaller headings.</p></div>'),
    ).toBeUndefined();
    expect(htmlBlockTitle('<h2>  </h2>')).toBeUndefined();
    expect(htmlBlockTitle('')).toBeUndefined();
  });
});

describe('derivedSlideTitle', () => {
  it('reads the heading, the big text or the plate title of every kind as plain text', () => {
    expect(derivedSlideTitle(OPENER_BRAND)).toBe('Brand');
    expect(derivedSlideTitle(MOOD_EARTH_SLIDE)).toBe('The Blue Marble');
    expect(derivedSlideTitle(TITLE)).toBe('General Translation');
    expect(derivedSlideTitle(THESIS)).toBe('Every product in every language');
    expect(derivedSlideTitle(CONTENT_RULE)).toBe('The content rule');
  });

  it('removes the text markup and keeps GT as letters', () => {
    const slide = stack('markup', [
      {
        id: 'h',
        type: 'heading',
        level: 'h2',
        text: 'The *display* run and [a link](https://x.com) in GT',
      },
    ]);
    expect(derivedSlideTitle(slide)).toBe('The display run and a link in GT');
  });

  it('looks inside composite cells and html escapes, in slot order', () => {
    const composite: Block = {
      id: 'c',
      type: 'composite',
      tracks: '1fr 1fr',
      cells: [
        { blocks: [{ id: 'p', type: 'paragraph', text: 'No heading here.' }] },
        { blocks: [{ id: 'h', type: 'heading', level: 'h2', text: 'Inside the cell' }] },
      ],
    };
    expect(derivedSlideTitle(stack('composite', [composite]))).toBe('Inside the cell');
    expect(derivedSlideTitle(escapeSlide('fixed-points', ESCAPES['fixed-points'] ?? ''))).toBe(
      'Fixed points',
    );
    expect(
      derivedSlideTitle(escapeSlide('no-heading', '<div class="two"><h3>Fixed</h3></div>')),
    ).toBeUndefined();
    expect(derivedSlideTitle({ ...CONTENT_RULE, slots: {} } as ContentSlide)).toBeUndefined();
  });

  it('collapses whitespace and trims long titles at a word boundary with an ellipsis', () => {
    const words =
      'Twelve letter words repeated until the title runs past the seventy two character limit of the viewer';
    const slide = stack('long', [
      { id: 'h', type: 'heading', level: 'h2', text: `  ${words}\u00a0 ` },
    ]);
    const title = derivedSlideTitle(slide) ?? '';
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    expect(title.endsWith('...')).toBe(true);
    expect(title).toBe('Twelve letter words repeated until the title runs past the seventy...');
    expect(
      derivedSlideTitle(
        stack('short', [{ id: 'h', type: 'heading', level: 'h2', text: ' a  b ' }]),
      ),
    ).toBe('a b');
  });
});

describe('slideTitle', () => {
  it('prefers a non-empty override', () => {
    expect(slideTitle({ ...CONTENT_RULE, title: 'Rule' })).toBe('Rule');
    expect(slideTitle({ ...CONTENT_RULE, title: '' })).toBe('The content rule');
    expect(slideTitle({ ...CONTENT_RULE, title: 'Rule' }, 3)).toBe('Rule');
  });

  it('titles the four escapes without a stored title, with or without the slide number', () => {
    for (const [id, html] of Object.entries(ESCAPES)) {
      expect(slideTitle(escapeSlide(id, html))).toBe(htmlBlockTitle(html));
      expect(slideTitle(escapeSlide(id, html), 25)).toBe(htmlBlockTitle(html));
    }
  });

  it('falls back to the slide number when known and to the id otherwise', () => {
    const empty = { ...CONTENT_RULE, slots: {} } as ContentSlide;
    expect(slideTitle(empty, 9)).toBe('Slide 9');
    expect(slideTitle(empty)).toBe('content-rule');
    expect(slideTitle(escapeSlide('bare', '<div>no heading</div>'), 84)).toBe('Slide 84');
  });
});

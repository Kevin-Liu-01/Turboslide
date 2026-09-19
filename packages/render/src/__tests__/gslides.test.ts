// The Google Slides parity round's render cases (gslides-parity SPEC 5.4, 7.2, 7.4, 14.2), in
// both themes: the table block, a numbered plain list, a multiline paragraph, an empty Text with
// prompts (the prompt) and without (nothing), block and slide links, the counter modes, the
// standalone build's skipped slides and notes, the print document and the layout grid's thumbnail.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { PROMPTS } from '@turboslide/schema/layouts';
import type { Theme } from '@turboslide/schema/render';
import type { BlockContext } from '../blocks/context.ts';
import { renderBlock } from '../blocks/render-block.ts';
import { renderDeck, renderSlides, slideCounter } from '../deck.ts';
import { PRINT_CSS, PRINT_SCALE, renderPrintDocument } from '../print.ts';
import { renderSlide } from '../slide.ts';
import { renderStandalone } from '../standalone.ts';
import { renderThumb } from '../thumb.ts';
import { contentSlide, deck } from './fixtures.ts';

const themes: Theme[] = ['light', 'dark'];

function context(theme: Theme, extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'gs',
    theme,
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 731.5,
    slide: { kind: 'content' },
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

const bundle = { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' };

const table: Block = {
  id: 'table',
  type: 'table',
  columns: [{ align: 'left' }, { align: 'right' }, { align: 'right' }, { align: 'right' }],
  rows: [
    { cells: ['Plan', 'Seats', 'Locales', 'Price'], header: true },
    { cells: ['Starter', '5', '2', '$0'] },
    { cells: ['Team', '25', '10', '$99'] },
  ],
  border: { weight: 1 },
};

const numbered: Block = {
  id: 'list',
  type: 'plain',
  numbered: true,
  items: [{ text: 'Connect the repository' }, { text: 'Pick the locales' }, { text: '' }],
};

const multiline: Block = {
  id: 'p1',
  type: 'paragraph',
  text: 'The first paragraph.\nThe second paragraph follows a break.\n\nA fourth after an empty one.',
  measure: 56,
};

const emptyHeading: Block = { id: 'h', type: 'heading', level: 'h2', text: '' };

describe('the parity round render cases in both themes', () => {
  for (const theme of themes) {
    it(`renders the table block (${theme})`, () => {
      const ctx = context(theme);
      expect(renderBlock(table, ctx)).toMatchSnapshot();
      expect(ctx.warnings).toEqual([]);
    });

    it(`renders a numbered plain list with the numeral outside the text carrier (${theme})`, () => {
      const html = renderBlock(numbered, context(theme, { live: true }));
      expect(html).toMatchSnapshot();
      expect(html).toContain('class="plain numbered"');
      expect(html).toContain('<span class="num" data-num="list/items/0">1</span>');
      expect(html).toContain('<span class="num" data-num="list/items/2">3</span>');
      // the numeral is a sibling of the carrier, never inside it
      expect(html).toMatch(
        /<span class="item"><span class="num" data-num="list\/items\/0">1<\/span><span data-run="list\/items\/0\/text">Connect/,
      );
      // the empty third item shows the prompt on the editor stage
      expect(html).toContain(
        `data-run="list/items/2/text"><span class="prompt" data-prompt aria-hidden="true">${PROMPTS.text}</span>`,
      );
    });

    it(`renders a multiline paragraph as one .para span per paragraph (${theme})`, () => {
      const html = renderBlock(multiline, context(theme));
      expect(html).toMatchSnapshot();
      expect(html.match(/<span class="para">/g)?.length).toBe(4);
      expect(html).toContain('<span class="para"></span>');
      // a one paragraph text keeps the plain markup it always had
      const plain = renderBlock({ ...multiline, text: 'One paragraph.' }, context(theme));
      expect(plain).not.toContain('class="para"');
      expect(plain).toContain('>One paragraph.</p>');
    });

    it(`draws the prompt for an empty Text with prompts on and nothing without (${theme})`, () => {
      const live = renderBlock(emptyHeading, context(theme, { live: true }));
      expect(live).toMatchSnapshot();
      expect(live).toContain(
        `<span class="prompt" data-prompt aria-hidden="true">${PROMPTS.title}</span>`,
      );
      const still = renderBlock(emptyHeading, context(theme));
      expect(still).toMatchSnapshot();
      expect(still).not.toContain('prompt');
      expect(still).toContain('></h2>');
      // prompts without live: the layout grid's tiles
      expect(renderBlock(emptyHeading, context(theme, { prompts: true }))).toBe(live);
    });
  }

  it('words the prompt per SPEC 5.4', () => {
    const big = (kind: 'content' | 'opener', template?: 'big-number'): string =>
      renderBlock(
        { id: 'b', type: 'heading', level: 'big', text: '' },
        context('light', {
          live: true,
          slide: { kind, ...(template !== undefined ? { template } : {}) },
        }),
      );
    expect(big('content', 'big-number')).toContain(PROMPTS.number);
    expect(big('opener')).toContain(PROMPTS.title);
    const caption = renderBlock(
      { id: 'fig', type: 'shot', asset: '', caption: '' },
      context('light', { live: true }),
    );
    expect(caption).toContain(PROMPTS.caption);
    expect(caption).toContain(PROMPTS.picture);
    expect(caption).toContain('class="pic-prompt shot"');
    const paragraph = renderBlock(
      { id: 'p', type: 'paragraph', text: '' },
      context('light', { live: true }),
    );
    expect(paragraph).toContain(PROMPTS.text);
    const box = renderBlock({ id: 'bx', type: 'box', text: '' }, context('light', { live: true }));
    expect(box).toContain(PROMPTS.text);
  });

  it('draws nothing and warns nothing for an empty picture reference outside the editor', () => {
    const ctx = context('light');
    const html = renderBlock({ id: 'fig', type: 'shot', asset: '', caption: 'A caption' }, ctx);
    expect(ctx.warnings).toEqual([]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('pic-prompt');
    expect(html).toContain('<figcaption data-run="fig/caption">A caption</figcaption>');
  });

  it('prompts the title slide fields and the statement big', () => {
    const title: Slide = {
      schemaVersion: 1,
      id: 'title',
      kind: 'title',
      mark: { w: 132, h: 84 },
      heading: '',
      lead: '',
    };
    const options = {
      theme: 'light' as const,
      chrome: false,
      assetBase: '',
      blockAttrs: true,
      gtWord: true,
    };
    const live = renderSlide(deck, title, { ...options, live: true }).html;
    expect(live).toContain(
      `data-run="heading/text"><span class="prompt" data-prompt aria-hidden="true">${PROMPTS.title}</span>`,
    );
    expect(live).toContain(
      `data-run="lead/text"><span class="prompt" data-prompt aria-hidden="true">${PROMPTS.subtitle}</span>`,
    );
    const still = renderSlide(deck, title, options).html;
    expect(still).not.toContain('prompt');
    const statement: Slide = { schemaVersion: 1, id: 'big', kind: 'statement', big: '' };
    expect(renderSlide(deck, statement, { ...options, live: true }).html).toContain(PROMPTS.text);
  });
});

describe('block and slide links (SPEC 7.2.7)', () => {
  const linked: Block[] = [
    { id: 'box', type: 'box', text: 'A box', link: { slide: 'first' } },
    { id: 't1', type: 'text', text: 'A text box', link: { slide: 'table' } },
    {
      id: 'shape',
      type: 'shape',
      shape: 'rounded',
      fill: 'plate',
      link: 'https://generaltranslation.com',
    },
  ];

  it('wraps a linked block in an active anchor outside the editor', () => {
    const [box, text, shape] = linked.map((block) => renderBlock(block, context('light')));
    expect(box?.startsWith('<a class="link" href="#first"><div class="box"')).toBe(true);
    expect(text?.startsWith('<a class="link" href="#s/table"><p class="text"')).toBe(true);
    expect(
      shape?.startsWith(
        '<a class="link" href="https://generaltranslation.com" target="_blank" rel="noreferrer"><svg',
      ),
    ).toBe(true);
    expect(box?.endsWith('</a>')).toBe(true);
  });

  it('wraps a linked block in an inert span on the editor stage', () => {
    const html = renderBlock(linked[0] as Block, context('light', { live: true }));
    expect(html.startsWith('<span class="link" data-link="#first"><div class="box"')).toBe(true);
    expect(html).not.toContain('href=');
  });

  it('leaves an unlinked block untouched', () => {
    const html = renderBlock({ id: 'p', type: 'paragraph', text: 'Plain.' }, context('light'));
    expect(html.startsWith('<p')).toBe(true);
  });

  it('keeps the freeform box on a linked block', () => {
    const slide = contentSlide(
      'links',
      { type: 'freeform' },
      { main: [{ ...(linked[0] as Block), pos: { x: 137, y: 241, w: 560, h: 160, z: 1 } }] },
    );
    const html = renderSlide(deck, slide, {
      theme: 'light',
      chrome: false,
      assetBase: '',
      blockAttrs: true,
      gtWord: true,
    }).html;
    expect(html).toContain(
      '<div class="free" data-free="box" style="left:0px;top:112px;width:560px;height:160px;z-index:1"><a class="link" href="#first"><div class="box"',
    );
  });
});

describe('the counter modes and the play list (SPEC 7.2.1, 7.2.4)', () => {
  const title: Slide = {
    schemaVersion: 1,
    id: 'title',
    kind: 'title',
    mark: { w: 132, h: 84 },
    heading: 'Title',
    lead: 'Lead',
  };
  const a = contentSlide(
    'a',
    { type: 'stack' },
    { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'A' }] },
  );
  const skipped = contentSlide('b', { type: 'stack' }, { main: [] }, { skip: true });
  const c = contentSlide('c', { type: 'stack' }, { main: [] });
  const base: Deck = {
    ...deck,
    sections: [{ id: 's', name: 'S', slideIds: ['title', 'a', 'b', 'c'] }],
  };
  const options = {
    theme: 'light' as const,
    chrome: false,
    assetBase: '',
    blockAttrs: false,
    gtWord: true,
  };

  it('counts over the deck order by default and stamps data-counter on every slide', () => {
    const rendered = renderSlides(base, [title, a, skipped, c], options);
    expect(rendered.map((entry) => entry.n)).toEqual([1, 2, 3, 4]);
    expect(rendered[1]?.rendered.html).toContain('data-counter="02 / 04"');
  });

  it('counts over the play list when given and leaves a slide outside it uncounted', () => {
    const play = ['title', 'a', 'c'];
    const rendered = renderSlides(base, [title, a, skipped, c], options, undefined, play);
    expect(rendered.map((entry) => entry.n)).toEqual([1, 2, 3, 3]);
    expect(rendered[3]?.rendered.html).toContain('data-counter="03 / 03"');
    expect(rendered[2]?.rendered.html).toContain('data-counter=""');
  });

  it('hides the counter when the deck says off, and on title slides under skip-title', () => {
    const off: Deck = { ...base, defaults: { counter: 'off' } };
    expect(slideCounter(off, a, 2, 4)).toBe('');
    const skipTitle: Deck = { ...base, defaults: { counter: 'skip-title' } };
    expect(slideCounter(skipTitle, title, 1, 4)).toBe('');
    expect(slideCounter(skipTitle, a, 2, 4)).toBe('02 / 04');
    expect(slideCounter(base, a, 2, 4)).toBe('02 / 04');
    const rendered = renderSlides(off, [title, a], options);
    expect(rendered[0]?.rendered.html).toContain('data-counter=""');
  });

  it("reads the slide's own counter word first (Slide numbers > Apply to selected, SPEC 7.2.4; docs/RETURN.md slides.numbers.apply)", () => {
    const off: Deck = { ...base, defaults: { counter: 'off' } };
    const skipTitle: Deck = { ...base, defaults: { counter: 'skip-title' } };
    /* off on a numbered deck blanks the one slide; on under an off deck numbers it */
    expect(slideCounter(base, { ...a, counter: 'off' }, 2, 4)).toBe('');
    expect(slideCounter(off, { ...a, counter: 'on' }, 2, 4)).toBe('02 / 04');
    /* on beats skip-title for a title slide; off holds under skip-title for a content slide */
    expect(slideCounter(skipTitle, { ...title, counter: 'on' }, 1, 4)).toBe('01 / 04');
    expect(slideCounter(skipTitle, { ...a, counter: 'off' }, 2, 4)).toBe('');
    /* a slide outside the play list stays uncounted whatever its word */
    expect(slideCounter(base, { ...a, counter: 'on' }, 0, 4)).toBe('');
  });

  it('renders the deck document with the first slide counter and the runtime reading data-counter', () => {
    const rendered = renderDeck(base, [title, a, skipped, c], {
      ...options,
      bundle,
      slideIds: ['a', 'c'],
      numbering: ['title', 'a', 'c'],
    });
    expect(rendered.slides.map((s) => [s.n, s.slideId])).toEqual([
      [2, 'a'],
      [3, 'c'],
    ]);
    expect(rendered.html).toContain('<div class="counter">02 / 03</div>');
    expect(rendered.html).toContain("getAttribute('data-counter')");
    expect(rendered.html).toContain("h === 'next'");
  });

  it('leaves skipped slides out of the standalone build unless asked, numbers the rest and carries notes on request', () => {
    const withNotes: Slide = { ...a, notes: 'Say this.' };
    const build = { bundle, assetUris: {}, budgetMB: 16 };
    const result = renderStandalone(base, [title, withNotes, skipped, c], build);
    expect(result.omitted).toEqual(['b']);
    expect(result.slides.map((s) => s.slideId)).toEqual(['title', 'a', 'c']);
    expect(result.html).toContain('data-counter="03 / 03"');
    expect(result.html).not.toContain('data-slide="b"');
    expect(result.html).not.toContain('ts-notes');
    // the deck opens in its appearance
    expect(result.html).toContain(
      "setAttribute('data-theme', t === 'light' || t === 'dark' ? t : 'dark')",
    );
    const light: Deck = { ...base, defaults: { appearance: 'light' } };
    expect(renderStandalone(light, [title], build).html).toContain(": 'light')");
    const all = renderStandalone(base, [title, withNotes, skipped, c], {
      ...build,
      includeSkipped: true,
      includeNotes: true,
    });
    expect(all.omitted).toEqual([]);
    expect(all.html).toContain('data-slide="b"');
    expect(all.html).toContain('data-counter="04 / 04"');
    expect(all.html).toContain(
      '<script type="application/json" id="ts-notes">{"a":"Say this."}</script>',
    );
  });
});

describe('the print document (SPEC 6.8, 7.6)', () => {
  it('writes one page per unskipped slide at PowerPoint page size with the sheet scaled onto it', () => {
    const skipped = contentSlide('b', { type: 'stack' }, { main: [] }, { skip: true });
    const a = contentSlide(
      'a',
      { type: 'stack' },
      { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'A' }] },
    );
    const base: Deck = { ...deck, sections: [{ id: 's', name: 'S', slideIds: ['a', 'b'] }] };
    const doc = renderPrintDocument(base, [a, skipped], { bundle, assetBase: '' });
    expect(doc.pages).toBe(1);
    expect(doc.omitted).toEqual(['b']);
    expect(doc.theme).toBe('dark');
    expect(doc.html).toContain('@page { size: 960pt 540pt; margin: 0; }');
    // the page box is the sheet's own size; the printer scales it (PRINT_SCALE), never the CSS
    expect(doc.html).toContain('.ts-page { position: relative; width: 1600px; height: 900px;');
    expect(doc.html).not.toContain('transform: scale(');
    expect(doc.html).not.toContain('zoom:');
    expect(PRINT_SCALE).toBe(0.8);
    expect(doc.html).toContain('<div class="ts-page" data-page="1" data-slide="a">');
    expect(doc.html).toContain('<section class="slide is-on"');
    expect(doc.html).toContain('<div class="counter">01 / 01</div>');
    expect(doc.html.match(/<svg id="sprite"><\/svg>/g)?.length).toBe(1);
    expect(PRINT_CSS).toContain('break-after: page');
    const both = renderPrintDocument(base, [a, skipped], {
      bundle,
      assetBase: '',
      includeSkipped: true,
      theme: 'light',
    });
    expect(both.pages).toBe(2);
    expect(both.html).toContain('<html lang="en" data-theme="light">');
    expect(both.html.match(/<svg id="sprite"><\/svg>/g)?.length).toBe(1);
  });
});

describe('the layout grid thumbnail', () => {
  it('draws prompts only when asked', () => {
    const empty = contentSlide('t', { type: 'stack' }, { main: [emptyHeading] });
    expect(renderThumb(deck, empty, 'light').html).not.toContain('prompt');
    const tile = renderThumb(deck, empty, 'light', { prompts: true }).html;
    expect(tile).toContain(PROMPTS.title);
    expect(tile).not.toContain('data-live');
  });
});

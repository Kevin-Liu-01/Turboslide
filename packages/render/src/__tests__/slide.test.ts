// Slide kinds, layouts, the stage, renderDeck and renderThumb in both themes.
import { describe, expect, it } from 'vitest';

import { renderDeck } from '../deck.ts';
import { colsWidths, slotBoxes } from '../geometry.ts';
import { renderSlide, slideTitle } from '../slide.ts';
import { renderStage } from '../stage.ts';
import { renderStandalone } from '../standalone.ts';
import { renderThumb } from '../thumb.ts';
import type { Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { contentSlide, deck } from './fixtures.ts';

const opener: Slide = {
  schemaVersion: 1,
  id: 'opener-brand',
  kind: 'opener',
  sectionId: 'brand',
  picture: { asset: 'opener-brand', fit: 'cover' },
  plate: {
    side: 'lower-left',
    maxWidth: 740,
    blocks: [
      { id: 'big', type: 'heading', level: 'big', text: 'Brand' },
      {
        id: 'p',
        type: 'paragraph',
        measure: 56,
        marginTop: 14,
        text: 'This section covers the company.',
      },
      { id: 'credit', type: 'credit', text: 'Material: Event Horizon, a Prototemplate direction' },
    ],
  },
};

const mood: Slide = {
  schemaVersion: 1,
  id: 'mood-earth',
  kind: 'mood',
  picture: { asset: 'opener-brand', fit: 'cover' },
  plate: {
    side: 'lower-right',
    maxWidth: 560,
    blocks: [
      { id: 'title', type: 'heading', level: 'title', text: 'The Blue Marble' },
      { id: 'p', type: 'paragraph', marginTop: 12, text: "NASA's composite of the whole planet." },
      { id: 'credit', type: 'credit', text: 'Image: NASA, Reto Stöckli, 2007, public domain' },
    ],
  },
};

const closing: Slide = {
  schemaVersion: 1,
  id: 'closing',
  kind: 'closing',
  picture: { asset: 'opener-brand', fit: 'cover' },
  mark: { w: 138, h: 88 },
  plate: {
    side: 'upper-left',
    maxWidth: 720,
    blocks: [
      { id: 'big', type: 'heading', level: 'big', text: 'Every product in every language' },
      { id: 'p', type: 'paragraph', measure: 56, marginTop: 14, text: 'generaltranslation.com' },
      { id: 'credit', type: 'credit', text: 'Material: Singularity, a Prototemplate direction' },
    ],
  },
};

const title: Slide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'General Translation',
  lead: 'This deck covers the brand.',
};

const statement: Slide = {
  schemaVersion: 1,
  id: 'thesis',
  kind: 'statement',
  big: 'Every product in every language',
  measure: 22,
};

const contentRule = contentSlide(
  'content-rule',
  { type: 'cols', ratio: '1/1' },
  {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'The content rule' },
      { id: 'p1', type: 'paragraph', measure: 56, text: 'Every post states what was built.' },
    ],
    right: [
      {
        id: 'list',
        type: 'plain',
        items: [
          { icon: { name: 'check-circle', color: 'ok' }, text: 'How GT ships a locale' },
          {
            icon: { name: 'x-circle', color: 'no' },
            no: true,
            text: 'Opinions about the industry',
          },
        ],
      },
    ],
  },
);

const site = contentSlide(
  'site',
  { type: 'cols', ratio: '4/8' },
  {
    left: [{ id: 'h', type: 'heading', level: 'h2', text: 'The production site' }],
    right: [
      {
        id: 'shot',
        type: 'shot',
        asset: 'site-home',
        fit: 'width',
        captionSize: 16,
        caption: 'The home page.',
      },
    ],
  },
);

const split = contentSlide(
  'details',
  { type: 'split', gap: 44, head: { cols: '4/8', align: 'start' }, body: { align: 'start' } },
  {
    headLeft: [{ id: 'h', type: 'heading', level: 'h2', text: 'Details' }],
    headRight: [{ id: 'p1', type: 'paragraph', text: 'Each crop is cut from the same region.' }],
    body: [
      {
        id: 'dia1',
        type: 'dia',
        fit: 'slot',
        alt: 'A flow',
        svg: '<svg class="dia" viewBox="0 0 1326 278"><text x="0" y="20">A</text></svg>',
      },
      { id: 'code', type: 'panel', code: 'Requested  /docs' },
    ],
  },
);

const withResidual = contentSlide(
  'voice',
  { type: 'cols', ratio: '5/7' },
  {
    left: [
      {
        id: 'rows',
        type: 'rows',
        key: 150,
        tight: true,
        items: [{ key: 'Sentence', value: 'Short.' }],
        ext: { import: { style: 'margin-bottom:36px', classes: ['rules'] } },
      },
    ],
    right: [{ id: 'p1', type: 'paragraph', text: 'Right.' }],
  },
  { ext: { import: { css: '.rules > div { padding: 13px 0; font-size: 19px; }', scope: 's09' } } },
);

const kinds: Slide[] = [
  opener,
  mood,
  closing,
  title,
  statement,
  contentRule,
  site,
  split,
  withResidual,
];

describe('renderSlide', () => {
  const themes: Theme[] = ['light', 'dark'];
  for (const slide of kinds) {
    for (const theme of themes) {
      it(`renders ${slide.kind} slide ${slide.id} in ${theme}`, () => {
        const rendered = renderSlide(deck, slide, {
          theme,
          chrome: true,
          assetBase: 'decks/test/',
          blockAttrs: true,
          gtWord: true,
        });
        expect(rendered.warnings).toEqual([]);
        expect(rendered).toMatchSnapshot();
      });
    }
  }

  it('emits chips only with chrome', () => {
    const on = renderSlide(deck, opener, {
      theme: 'dark',
      chrome: true,
      assetBase: '',
      blockAttrs: false,
      gtWord: true,
    });
    const off = renderSlide(deck, opener, {
      theme: 'dark',
      chrome: false,
      assetBase: '',
      blockAttrs: false,
      gtWord: true,
    });
    expect(on.html).toContain('ts-chips');
    expect(off.html).not.toContain('ts-chips');
    expect(on.html).toContain('<section class="slide opener s-opener is-on"');
    expect(off.html).toContain('src="assets/opener-brand-dark.jpg"');
  });

  it('scopes residual slide css and keeps residual block classes', () => {
    const rendered = renderSlide(deck, withResidual, {
      theme: 'light',
      chrome: false,
      assetBase: '',
      blockAttrs: true,
      gtWord: true,
    });
    expect(rendered.html).toContain('<style>.ts-sheet .ts-x-voice .rules > div {');
    expect(rendered.html).toContain('class="rows tight rules"');
    expect(rendered.html).toContain('style="--key:150px;margin-bottom:36px"');
    expect(rendered.html).toContain('class="slide ts-x-voice is-on"');
  });

  it('derives titles the way the viewer does', () => {
    expect(slideTitle(opener, 1)).toBe('Brand');
    expect(slideTitle(title, 2)).toBe('General Translation');
    expect(slideTitle(contentRule, 3)).toBe('The content rule');
    expect(slideTitle({ ...contentRule, slots: {} }, 9)).toBe('Slide 9');
  });

  it('computes the slot geometry from the sheet constants', () => {
    expect(colsWidths('5/7')).toEqual([522.5, 731.5]);
    expect(colsWidths('4/8')).toEqual([418, 836]);
    expect(colsWidths('1/1')).toEqual([627, 627]);
    expect(colsWidths({ left: 390 })).toEqual([390, 864]);
    expect(slotBoxes({ type: 'cols', ratio: '4/8' })).toEqual({
      left: [137, 129, 418, 642],
      right: [627, 129, 836, 642],
    });
    expect(slotBoxes({ type: 'center' })).toEqual({ main: [137, 129, 1326, 642] });
  });
});

describe('stage, deck, thumb and standalone', () => {
  it('renders the stage with frame, wordmark and counter', () => {
    const html = renderStage('<section class="slide is-on"></section>', {
      theme: 'light',
      counter: '01 / 85',
      present: true,
    });
    expect(html).toMatchSnapshot();
  });

  it('renders a deck document that shows one slide from the hash', () => {
    const rendered = renderDeck(deck, [opener, contentRule, site], {
      theme: 'dark',
      chrome: true,
      assetBase: 'decks/test/',
      blockAttrs: true,
      gtWord: true,
      bundle: {
        sheetCss: '.ts-sheet{}',
        stageCss: '.stage{}',
        sprite: '<svg id="sprite"></svg>',
        fontsCss: '@font-face{}',
      },
    });
    expect(rendered.warnings).toEqual([]);
    expect(rendered.slides.map((s) => [s.n, s.slideId])).toEqual([
      [1, 'opener-brand'],
      [2, 'content-rule'],
      [3, 'site'],
    ]);
    expect(rendered.html).toContain('<html lang="en" data-theme="dark">');
    expect(rendered.html).toContain('data-ts-ready');
    expect(rendered.html).toContain('<svg id="sprite"></svg>');
    expect(rendered.html.match(/<section class="slide/g)?.length).toBe(3);
    expect(rendered.html).not.toContain(' is-on');
  });

  it('renders a thumbnail without chrome inside a mini clone', () => {
    const thumb = renderThumb(deck, opener, 'light', { k: 0.14 });
    expect(thumb.html.startsWith('<div class="mini" style="--k:0.14"><div class="frame">')).toBe(
      true,
    );
    expect(thumb.html).not.toContain('ts-chips');
    expect(thumb.html).not.toContain('data-block');
  });

  it('builds a standalone document with data URIs and a budget', () => {
    const result = renderStandalone(deck, [opener, contentRule, site], {
      bundle: { sheetCss: '', stageCss: '', sprite: '', fontsCss: '' },
      assetUris: {
        'assets/opener-brand-light.jpg': 'data:image/png;base64,AAAA',
        'assets/opener-brand-dark.jpg': 'data:image/png;base64,AAAA',
        'assets/site-home-light.jpg': 'data:image/jpeg;base64,AAAAAAAA',
      },
      budgetMB: 16,
    });
    expect(result.missing).toEqual(['site-home: assets/site-home-dark.jpg']);
    expect(result.inlining['two-color'].count).toBe(2);
    expect(result.inlining['resample-1280'].count).toBe(1);
    expect(result.overBudget).toBe(false);
    expect(result.html).toContain("localStorage.getItem('gt-theme')");
    expect(result.html).toContain('gt-deck-slide');
  });
});

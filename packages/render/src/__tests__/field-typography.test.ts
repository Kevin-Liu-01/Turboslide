// A fixed kind's field draws its own typography (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md 2): the cover's h1 and lead and the
// statement's big line carry the declarations a block carries, inline, in both appearances, in
// the slide, the thumbnail and the print document; the slide's kit style carries the face's
// @font-face rules and its `--ts-font-<id>` variable; and a slide without a record renders byte
// for byte as before.
import { describe, expect, it } from 'vitest';

import type { Slide, StatementSlide, TitleSlide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';

import { renderPrintDocument } from '../print.ts';
import { renderSlide } from '../slide.ts';
import { renderThumb } from '../thumb.ts';
import { deck } from './fixtures.ts';

const title: TitleSlide = {
  schemaVersion: 1,
  id: 'cover',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'Renewal terms',
  lead: 'For the quarter',
};
const statement: StatementSlide = {
  schemaVersion: 1,
  id: 'line',
  kind: 'statement',
  big: 'Every product in every language',
  measure: 22,
};
const options = (theme: Theme) => ({
  theme,
  chrome: true,
  assetBase: '',
  blockAttrs: true,
  gtWord: false,
});

function h1Style(html: string): string {
  return /<h1 style="([^"]*)"/.exec(html)?.[1] ?? '';
}
function leadStyle(html: string): string {
  return /<p class="lead muted max-p" style="([^"]*)"/.exec(html)?.[1] ?? '';
}
function bigStyle(html: string): string {
  return /<div class="big[^"]*"(?: style="([^"]*)")?/.exec(html)?.[1] ?? '';
}

describe('a field of its own', () => {
  it('draws the face inline on the cover and the statement, both appearances, with the rules inside the slide', () => {
    const faced: TitleSlide = {
      ...title,
      typography: { heading: { family: 'fraunces' }, lead: { family: 'manrope', size: 24 } },
    };
    for (const theme of ['light', 'dark'] as const) {
      const html = renderSlide(deck, faced, options(theme)).html;
      expect(h1Style(html)).toBe(
        'margin-top:44px;font-family:var(--ts-font-fraunces, inherit);font-feature-settings:normal',
      );
      expect(leadStyle(html)).toBe(
        'margin-top:26px;font-size:24px;font-family:var(--ts-font-manrope, inherit);font-feature-settings:normal',
      );
      expect(html).toContain("font-family: 'Fraunces'");
      expect(html).toContain("font-family: 'Manrope'");
      expect(html).toContain('--ts-font-fraunces:');
      expect(html).toContain('--ts-font-manrope:');
    }
    /* the statement's measure (22ch inline) keeps its place before the face */
    const big: StatementSlide = { ...statement, typography: { big: { family: 'fraunces' } } };
    const html = renderSlide(deck, big, options('light')).html;
    expect(bigStyle(html)).toBe(
      'max-width:22ch;font-family:var(--ts-font-fraunces, inherit);font-feature-settings:normal',
    );
    const unmeasured: StatementSlide = {
      ...statement,
      measure: undefined,
      typography: { big: { family: 'geist' } },
    };
    expect(bigStyle(renderSlide(deck, unmeasured, options('light')).html)).toBe(
      'font-family:var(--ts-font-geist, inherit);font-feature-settings:normal',
    );
  });

  it('keeps Inter’s features for the theme face and renders a bare slide as before', () => {
    const inter: TitleSlide = { ...title, typography: { heading: { family: 'inter' } } };
    expect(h1Style(renderSlide(deck, inter, options('light')).html)).toBe(
      'margin-top:44px;font-family:var(--ts-font-inter, inherit)',
    );
    const bare = renderSlide(deck, title, options('light')).html;
    expect(h1Style(bare)).toBe('margin-top:44px');
    expect(leadStyle(bare)).toBe('margin-top:26px');
    expect(bare).not.toContain('@font-face');
    expect(bigStyle(renderSlide(deck, statement, options('light')).html)).toBe('max-width:22ch');
  });

  it('reaches the thumbnail and the print document', () => {
    const faced: TitleSlide = { ...title, typography: { heading: { family: 'fraunces' } } };
    const slides: Slide[] = [faced];
    const play = {
      ...deck,
      sections: [{ id: 'brand', name: 'Brand', slideIds: ['cover'] }],
    };
    const thumb = renderThumb(play, faced, 'light');
    expect(thumb.html).toContain('font-family:var(--ts-font-fraunces, inherit)');
    const print = renderPrintDocument(play, slides, {
      bundle: { sheetCss: '', stageCss: '', sprite: '<svg id="sprite"></svg>', fontsCss: '' },
      theme: 'light',
      assetBase: '',
      deckSlides: slides,
      fontSrc: (id, file) => `data:font/woff2;base64,${id}-${file.file}`,
    });
    expect(print.pages).toBe(1);
    expect(print.html).toContain('font-family:var(--ts-font-fraunces, inherit)');
    expect(print.html).toContain("font-family: 'Fraunces'");
    expect(print.html).toContain("src: url('data:font/woff2;base64,fraunces-");
  });
});

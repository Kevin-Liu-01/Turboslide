import { describe, expect, it } from 'vitest';
import { declarationsOf, parseCss } from './css.ts';
import { SHEET_ROOT_CLASS, sheetCss, sheetRootAttributes, stageCss, themeCss } from './theme.ts';

describe('the theme CSS', () => {
  it('scopes every rule under the root class', () => {
    for (const rule of parseCss(themeCss())) {
      expect(rule.selector.startsWith(`.${SHEET_ROOT_CLASS}`), rule.selector).toBe(true);
    }
    const selectors = parseCss(themeCss()).map((rule) => rule.selector);
    expect(
      selectors.some((selector) => selector.includes(':root') || selector.includes('#stage')),
    ).toBe(false);
  });

  it('keeps the wordmark, the counter and the kit footer over every object on every slide', () => {
    /* gslides-parity SPEC-2 0.98; the polish round's fix round 3 (B4's R1): the slide is a stacking
       context and the viewer's Frame draws the band before the slide, so the band carries the frame's
       own level (z-index 2) and lets a click through to the object under it */
    const rules = parseCss(sheetCss());
    for (const selector of [
      '.ts-sheet .wordmark',
      '.ts-sheet .counter',
      '.ts-sheet .ts-kit-footer',
    ]) {
      const declarations = declarationsOf(rules, selector);
      expect(declarations['z-index'], selector).toBe('2');
      expect(declarations['pointer-events'], selector).toBe('none');
    }
  });

  it('keeps the element selectors of head.html so imported escape blocks render unchanged', () => {
    const selectors = parseCss(sheetCss()).map((rule) => rule.selector);
    for (const kept of [
      '.ts-sheet h1',
      '.ts-sheet h2',
      '.ts-sheet p',
      '.ts-sheet p + p',
      '.ts-sheet .rows > div > b',
      '.ts-sheet svg.dia text',
      '.ts-sheet canvas.dither',
    ]) {
      expect(selectors).toContain(kept);
    }
    expect(parseCss(stageCss()).map((rule) => rule.selector)).toContain('.ts-sheet .slide');
  });

  it('writes the root attributes', () => {
    expect(sheetRootAttributes('dark')).toBe('class="ts-sheet" data-theme="dark"');
    expect(sheetRootAttributes('light', ['sheet', 'is-picture'])).toBe(
      'class="ts-sheet sheet is-picture" data-theme="light"',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { parseCss } from './css.ts';
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

  it('writes the root attributes with the theme id beside the appearance (SPEC-5 9.3)', () => {
    expect(sheetRootAttributes('gt-ink-paper', 'dark')).toBe(
      'class="ts-sheet" data-theme="dark" data-sheet="gt-ink-paper"',
    );
    expect(
      sheetRootAttributes('ts-plate', 'light', { classes: ['sheet', 'is-picture'], base: true }),
    ).toBe(
      'class="ts-sheet sheet is-picture" data-theme="light" data-sheet="ts-plate" data-theme-base=""',
    );
  });

  it('reads the GT files first and the Plate rules after them on ts-plate (SPEC-5 9.3)', () => {
    expect(sheetCss('ts-plate').startsWith(sheetCss('gt-ink-paper'))).toBe(true);
    expect(stageCss('ts-plate').startsWith(stageCss('gt-ink-paper'))).toBe(true);
    expect(sheetCss('ts-plate').length).toBeGreaterThan(sheetCss('gt-ink-paper').length);
    expect(themeCss('gt-ink-paper')).toBe(themeCss());
    const plateRules = parseCss(sheetCss('ts-plate').slice(sheetCss('gt-ink-paper').length));
    expect(plateRules.length).toBeGreaterThan(0);
    for (const rule of plateRules) {
      for (const part of rule.selector.split(','))
        expect(part.trim().startsWith(".ts-sheet[data-sheet='ts-plate']"), part).toBe(true);
    }
  });
});

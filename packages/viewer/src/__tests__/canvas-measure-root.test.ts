// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { MEASURE_ROOT_CLASS, MEASURE_ROOT_RESET, mountHiddenSheet } from '../canvas-measure';

// The hidden 1x sheet the conversion measures on (SPEC-2 1.3). The CLI measures the present
// document, whose body carries the browser's text defaults; the studio's body sets 13 px type,
// and a container the theme leaves at the inherited size (the title's .left-mid around the inline
// mark) took its line box from it, so the editor's mark sat one pixel under the CLI's. The root
// declares the defaults the present document inherits and leaves the family and the colour to the
// renderer's .ts-sheet rule, which both documents load.
describe('the hidden measure root', () => {
  it('is a .ts-sheet root off screen with the theme on it and the stage inside', () => {
    const mounted = mountHiddenSheet('light');
    expect(mounted.root.classList.contains('ts-sheet')).toBe(true);
    expect(mounted.root.classList.contains(MEASURE_ROOT_CLASS)).toBe(true);
    expect(mounted.root.dataset['theme']).toBe('light');
    expect(mounted.root.getAttribute('aria-hidden')).toBe('true');
    expect(mounted.stage.classList.contains('ts-stage')).toBe(true);
    expect(mounted.body.parentElement).toBe(mounted.stage);
    expect(document.body.contains(mounted.root)).toBe(true);
    mounted.dispose();
    expect(document.body.contains(mounted.root)).toBe(false);
  });

  it('carries the present document’s inherited text defaults and not the studio body’s size', () => {
    const mounted = mountHiddenSheet('dark');
    const style = mounted.root.getAttribute('style') ?? '';
    expect(style).toContain('position:fixed');
    expect(style).toContain('width:1600px');
    expect(style).toContain(MEASURE_ROOT_RESET);
    expect(MEASURE_ROOT_RESET).toContain('font-size:medium');
    expect(MEASURE_ROOT_RESET).toContain('line-height:normal');
    expect(MEASURE_ROOT_RESET).toContain('letter-spacing:normal');
    mounted.dispose();
  });

  it('leaves the family and the colour to the renderer’s .ts-sheet rule', () => {
    expect(MEASURE_ROOT_RESET).not.toMatch(/(^|;)font-family:/);
    expect(MEASURE_ROOT_RESET).not.toMatch(/(^|;)color:/);
    expect(MEASURE_ROOT_RESET).not.toMatch(/(^|;)font:/);
  });
});

// contrast.ts, the one WCAG function of the browser paths (docs/DESIGN.md 5.4), pinned to
// colorjs.io's contrastWCAG21 over every pair the colour build drew, and its parser and
// compositing on the forms the tree writes.
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';

import { PAIR_READINGS } from './colors.generated.ts';
import { composite, contrastRatio, parseColor, relativeLuminance, toHex } from './contrast.ts';

describe('contrastRatio', () => {
  it('equals colorjs.io contrastWCAG21 on every generated pair within 0.005', () => {
    expect(PAIR_READINGS.length).toBeGreaterThan(40);
    for (const reading of PAIR_READINGS) {
      const [text, ground] = reading.drawn;
      expect(contrastRatio(text, ground), `${reading.appearance} ${reading.name}`).toBeCloseTo(
        Color.contrast(text, ground, 'WCAG21'),
        2,
      );
    }
  });

  it('reads the two pairs that failed before the design round', () => {
    /* research-type 3.1: the menu key on a hovered row, the scrollbar thumb at 0.32 */
    expect(contrastRatio('#6f747d', '#f0f0f0')).toBeCloseTo(4.12, 2);
    expect(contrastRatio('rgba(7, 7, 7, 0.32)', '#ffffff')).toBeCloseTo(2.17, 1);
    expect(contrastRatio('rgba(7, 7, 7, 0.44)', '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('is symmetric, 1 for a colour on itself and 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2f5ce0', '#2f5ce0')).toBe(1);
    expect(contrastRatio('#2f5ce0', '#ffffff')).toBe(contrastRatio('#ffffff', '#2f5ce0'));
  });
});

describe('parseColor and composite', () => {
  it('parses the hex and rgb forms and refuses anything else', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#07070780')).toEqual({ r: 7, g: 7, b: 7, a: 128 / 255 });
    expect(parseColor('rgba(242, 242, 240, 0.44)')).toEqual({ r: 242, g: 242, b: 240, a: 0.44 });
    expect(parseColor('rgb(0 0 0 / 56%)')).toEqual({ r: 0, g: 0, b: 0, a: 0.56 });
    expect(parseColor('var(--pt-ink)')).toBeNull();
    expect(() => contrastRatio('var(--pt-ink)', '#fff')).toThrow(RangeError);
  });

  it('composites a translucent colour over its ground the way the page draws it', () => {
    const plate = composite({ r: 7, g: 7, b: 7, a: 0.06 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(toHex(plate)).toBe('#f0f0f0');
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 10);
  });
});

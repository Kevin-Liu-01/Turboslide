import { describe, expect, test } from 'vitest';

import { TITANIUM, contrastRatio, lineColors, onPaper, parseCssColor } from './palette.ts';

describe('palette', () => {
  test('composites the translucent tokens on paper to the values tokens.ts records (COMPOSITE)', () => {
    expect(onPaper('light', 'hair')).toEqual([210, 210, 210]);
    expect(onPaper('light', 'hair-soft')).toEqual([233, 233, 233]);
    expect(onPaper('light', 'plate')).toEqual([246, 246, 246]);
    expect(onPaper('light', 'cross')).toEqual([161, 161, 161]);
    expect(onPaper('dark', 'hair')).toEqual([59, 59, 58]);
    expect(onPaper('dark', 'hair-soft')).toEqual([31, 31, 30]);
    expect(onPaper('dark', 'plate')).toEqual([19, 19, 19]);
    expect(onPaper('dark', 'cross')).toEqual([91, 91, 91]);
  });

  test('reads CSS colors and measures WCAG contrast', () => {
    expect(parseCssColor('rgb(138, 143, 152)')).toEqual({ rgb: [138, 143, 152], alpha: 1 });
    expect(parseCssColor('rgba(255, 255, 255, 0.87)')).toEqual({
      rgb: [255, 255, 255],
      alpha: 0.87,
    });
    expect(parseCssColor('#d2d2d2')).toEqual({ rgb: [210, 210, 210], alpha: 1 });
    expect(parseCssColor('#fff')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor('currentColor')).toBeUndefined();
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBe(21);
    expect(contrastRatio(TITANIUM, [255, 255, 255])).toBeCloseTo(3.25, 1);
    expect(contrastRatio(TITANIUM, [7, 7, 7])).toBeGreaterThan(6);
  });

  test('lists the line roles per theme with hair over hair as the doubled seam', () => {
    const light = lineColors('light');
    expect(light.find((c) => c.role === 'hair' && c.ground === 'paper')?.rgb).toEqual([
      210, 210, 210,
    ]);
    expect(light.find((c) => c.role === 'hair' && c.ground === 'plate')?.rgb).toEqual([
      203, 203, 203,
    ]);
    expect(light.find((c) => c.role === 'hair-twice')?.rgb).toEqual([173, 173, 173]);
    expect(lineColors('dark').find((c) => c.role === 'ink')?.rgb).toEqual([242, 242, 240]);
  });
});

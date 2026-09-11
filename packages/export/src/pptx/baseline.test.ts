import { describe, expect, it } from 'vitest';

import { baselineK, firstBaselineShiftPx, loadBaselineModel } from './baseline.ts';

describe('the first-baseline constant', () => {
  const model = loadBaselineModel();

  it('reads the measured anchors from calibration.json in size order', () => {
    expect(model.anchors.map((a) => a.size)).toEqual([15, 22, 26, 44, 72, 88]);
    expect(model.formula).toContain('pitch / 2');
  });

  it('reproduces the measured offsets at the anchors within half a pixel', () => {
    for (const anchor of model.anchors) {
      const dy = anchor.pitch / 2 - baselineK(anchor.size, model.anchors) * anchor.size;
      expect(Math.abs(dy - anchor.dy)).toBeLessThan(0.5);
    }
  });

  it('interpolates between anchors and holds the end values beyond them', () => {
    const k22 = baselineK(22, model.anchors);
    const k26 = baselineK(26, model.anchors);
    const k24 = baselineK(24, model.anchors);
    expect(k24).toBeCloseTo((k22 + k26) / 2, 6);
    expect(baselineK(10, model.anchors)).toBe(model.anchors[0]?.k);
    expect(baselineK(120, model.anchors)).toBe(model.anchors[model.anchors.length - 1]?.k);
  });

  it('moves body text up and tight display headings down, and does nothing for the none target', () => {
    expect(firstBaselineShiftPx(22, 33)).toBeCloseTo(3.5, 1);
    expect(firstBaselineShiftPx(15, 21.75)).toBeCloseTo(2, 1);
    expect(firstBaselineShiftPx(88, 89.76)).toBeCloseTo(-4, 1);
    expect(firstBaselineShiftPx(22, 33, 'none')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { fitSheet } from '../Sheet';

// The fit math from tail.html fit() (SPEC 5.5): 28px pad, 12px narrow, 0 present.
describe('fitSheet', () => {
  it('fits a 1440 by 848 stage by width with the 28px pad', () => {
    const fit = fitSheet({ aw: 1440, ah: 848, pad: 28 });
    expect(fit.width).toBe(1384);
    expect(fit.height).toBe(779);
    expect(fit.scale).toBeCloseTo(1384 / 1600, 6);
    expect(fit.left).toBe(27);
    expect(fit.top).toBe(Math.round((848 - 779) / 2) - 1);
  });

  it('fills a 1600 by 900 stage exactly in present mode', () => {
    const fit = fitSheet({ aw: 1600, ah: 900, pad: 0 });
    expect(fit).toEqual({ scale: 1, width: 1600, height: 900, left: -1, top: -1 });
  });

  it('never scales below 0.05', () => {
    const fit = fitSheet({ aw: 10, ah: 10, pad: 28 });
    expect(fit.scale).toBeCloseTo(0.05, 6);
  });
});

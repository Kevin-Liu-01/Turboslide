import { describe, expect, it } from 'vitest';

import { fitSheet, fitSheetAt } from '../Sheet';

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

// View > Zoom (gslides-parity SPEC 7.2.16): a factor of the sheet size, centred while it fits and
// pinned to the pad's corner while the stage must scroll; 'fit' is the plain fit.
describe('fitSheetAt', () => {
  it('is the plain fit at fit and the factor otherwise', () => {
    expect(fitSheetAt({ aw: 1440, ah: 848, pad: 28, zoom: 'fit' })).toEqual(
      fitSheet({ aw: 1440, ah: 848, pad: 28 }),
    );
    const half = fitSheetAt({ aw: 1440, ah: 848, pad: 28, zoom: 0.5 });
    expect(half.width).toBe(800);
    expect(half.height).toBe(450);
    expect(half.scale).toBe(0.5);
    expect(half.left).toBe(Math.round((1440 - 800) / 2) - 1);
    expect(half.top).toBe(Math.round((848 - 450) / 2) - 1);
  });

  it('pins a sheet larger than the stage to the pad so the stage scrolls to the rest', () => {
    const double = fitSheetAt({ aw: 1440, ah: 848, pad: 28, zoom: 2 });
    expect(double.width).toBe(3200);
    expect(double.left).toBe(27);
    expect(double.top).toBe(27);
  });
});

import { describe, expect, test } from 'vitest';

import { cellAgreement } from './diff.ts';
import type { BitImage } from './image.ts';
import { invertBits, litFraction } from './image.ts';
import { PLATE_BOXES, plateClear, twoToneMetrics } from './metrics.ts';

function blank(): BitImage {
  return { width: 800, height: 450, bits: new Uint8Array(800 * 450) };
}

describe('plate metrics', () => {
  test('counts cells under the plate, in the band, and the nearest lit cell', () => {
    const bits = blank();
    // A cell at sheet (200, 600) is under the opener plate [137, 500, 740, 271].
    bits.bits[300 * 800 + 100] = 1;
    // A cell at sheet (900, 600) is 23 px right of the plate's right edge (877) and in the band.
    bits.bits[300 * 800 + 450] = 1;
    // A cell at sheet (1400, 100) is far away.
    bits.bits[50 * 800 + 700] = 1;
    const clear = plateClear(bits, PLATE_BOXES.opener);
    expect(clear.litUnder).toBe(1);
    expect(clear.litInBand).toBe(1);
    expect(clear.nearestLitPx).toBe(0);
    const metrics = twoToneMetrics(bits, PLATE_BOXES.opener);
    expect(metrics.warnings.some((w) => w.includes('under the plate'))).toBe(true);
    expect(metrics.warnings.some((w) => w.includes('uniform screen'))).toBe(true);
  });

  test('reports the distance when the plate is clear', () => {
    const bits = blank();
    bits.bits[100 * 800 + 700] = 1; // sheet (1400, 200): dx = 1400 - 877 = 523, dy = 500 - 202 = 298
    const clear = plateClear(bits, PLATE_BOXES.opener);
    expect(clear.litUnder).toBe(0);
    expect(clear.litInBand).toBe(0);
    expect(clear.nearestLitPx).toBe(Math.round(Math.hypot(523, 298)));
  });

  test('lit fraction and agreement', () => {
    const a = blank();
    for (let i = 0; i < a.bits.length; i += 4) a.bits[i] = 1;
    expect(litFraction(a)).toBeCloseTo(0.25, 6);
    const b = invertBits(a);
    expect(cellAgreement(a, b).agreement).toBe(0);
    expect(cellAgreement(a, a).mismatched).toBe(0);
  });
});

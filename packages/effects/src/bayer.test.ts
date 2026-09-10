import { describe, expect, test } from 'vitest';

import { BAYER8, BAYER8_THRESHOLDS, bayer8, bayerThreshold, ditherGray } from './bayer.ts';
import { ditherRamp, rampCells, rampInk } from './ramp.ts';

// The table the deck's Pillow pipelines carry (make.py, glyphfield/pipeline.py).
const PILLOW_TABLE = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

describe('bayer8', () => {
  test('is the deck permutation of 0 to 63 and equals the Pillow table', () => {
    expect(BAYER8.map((row) => [...row])).toEqual(PILLOW_TABLE);
    const seen = new Set<number>();
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) seen.add(bayer8(r, c));
    expect(seen.size).toBe(64);
    expect(bayer8(8, 9)).toBe(bayer8(0, 1));
  });

  test('thresholds are int((m + 0.5) / 64 * 255)', () => {
    expect(bayerThreshold(0, 0)).toBe(1);
    expect(bayerThreshold(7, 0)).toBe(253);
    expect([...BAYER8_THRESHOLDS].slice(0, 3)).toEqual([1, 129, 33]);
  });

  test('a flat tone lights the expected share of cells', () => {
    const gray = { width: 64, height: 64, data: new Uint8Array(64 * 64).fill(128) };
    const bits = ditherGray(gray);
    let lit = 0;
    for (const b of bits.bits) lit += b;
    // 128 exceeds the thresholds of m = 0..31 (int((m + 0.5) / 64 * 255) <= 125) and not m = 32 (129).
    expect(lit / bits.bits.length).toBeCloseTo(32 / 64, 6);
  });
});

describe('ditherRamp', () => {
  test('runs from solid ink to paper', () => {
    const { w, h } = rampCells(1010, 220);
    expect([w, h]).toEqual([505, 110]);
    expect(rampCells(0, 0)).toEqual({ w: 505, h: 110 });
    const first = Array.from({ length: h }, (_, y) => rampInk(0, y, w)).filter(Boolean).length;
    const last = Array.from({ length: h }, (_, y) => rampInk(w - 1, y, w)).filter(Boolean).length;
    expect(first).toBe(h);
    // Only the m = 0 cells (one row in eight) stay ink at the right edge.
    expect(last).toBe(Math.ceil(h / 8));
    const img = ditherRamp(16, 8, 'dark');
    expect(img.data.length).toBe(16 * 8 * 4);
    expect([img.data[0], img.data[1], img.data[2], img.data[3]]).toEqual([0xf2, 0xf2, 0xf0, 255]);
  });
});

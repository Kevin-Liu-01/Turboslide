// The blue noise texture (gslides-parity SPEC-3 10.2, 10.10): pinned by sha256, every value 16
// times, tiled without a seam, thresholds in the Bayer table's form, and the same bytes on every
// host (decoded through atob and through Buffer).
import { createHash } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import {
  BLUE64_SHA256,
  BLUE64_SIZE,
  blue64,
  blue64Texture,
  blue64Threshold,
  blue64Thresholds,
} from './blue64.ts';

describe('blue64', () => {
  test('is 4,096 bytes with every value 0 to 255 exactly 16 times, pinned by sha256', () => {
    const texture = blue64Texture();
    expect(texture.length).toBe(BLUE64_SIZE * BLUE64_SIZE);
    const counts = new Uint32Array(256);
    for (const v of texture) counts[v] = (counts[v] ?? 0) + 1;
    expect([...counts].every((c) => c === 16)).toBe(true);
    expect(createHash('sha256').update(texture).digest('hex')).toBe(BLUE64_SHA256);
  });

  test('tiles: a cell outside the texture reads the wrapped cell, negative indexes included', () => {
    expect(blue64(64, 64)).toBe(blue64(0, 0));
    expect(blue64(-1, -1)).toBe(blue64(63, 63));
    expect(blue64(130, 7)).toBe(blue64(2, 7));
  });

  test('thresholds follow trunc((v + 0.5) / 256 * 255) and the table matches the function', () => {
    const table = blue64Thresholds();
    for (let r = 0; r < BLUE64_SIZE; r += 1)
      for (let c = 0; c < BLUE64_SIZE; c += 1) {
        const expected = Math.trunc(((blue64(r, c) + 0.5) / 256) * 255);
        expect(blue64Threshold(r, c)).toBe(expected);
        expect(table[r * BLUE64_SIZE + c]).toBe(expected);
      }
  });

  test('has no strong low frequency: every 8 by 8 window holds between 12 and 52 of 64 values over 127', () => {
    // a white noise field fails this often; a blue noise ranking spreads the lit cells evenly
    const texture = blue64Texture();
    let min = 64;
    let max = 0;
    for (let y0 = 0; y0 < BLUE64_SIZE; y0 += 8)
      for (let x0 = 0; x0 < BLUE64_SIZE; x0 += 8) {
        let lit = 0;
        for (let y = 0; y < 8; y += 1)
          for (let x = 0; x < 8; x += 1)
            if ((texture[(y0 + y) * BLUE64_SIZE + x0 + x] ?? 0) > 127) lit += 1;
        min = Math.min(min, lit);
        max = Math.max(max, lit);
      }
    expect(min).toBeGreaterThanOrEqual(12);
    expect(max).toBeLessThanOrEqual(52);
  });
});

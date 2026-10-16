// The halftone pattern (the Glyphfield port, wave 2.4): the clustered-dot table holds the same 64
// thresholds as bayer8 in another order, so a flat tone lights the same number of cells per tile;
// the lit cells gather into round dots on a 45 degree screen where bayer8 scatters them; the
// pipeline takes the pattern end to end and draws the same cells twice.
import { describe, expect, test } from 'vitest';

import { DITHER_PATTERNS } from '@turboslide/schema/blocks/dither-values';

import { BAYER8_THRESHOLDS } from './bayer.ts';
import { ditherPicture, thresholdAt } from './dither.ts';
import { HALFTONE8_THRESHOLDS, HALFTONE_TILE } from './halftone.ts';
import type { RgbaImage } from './image.ts';
import { litFraction } from './image.ts';

/** The lit cells of a flat tone over a w by h screen, row major. */
function screenOf(pattern: 'halftone' | 'bayer8', tone: number, w: number, h: number): Uint8Array {
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) bits[y * w + x] = tone > thresholdAt(pattern, x, y) ? 1 : 0;
  return bits;
}

/** The lit cells' 4-connected groups. */
function groups(bits: Uint8Array, w: number, h: number): number {
  const seen = new Uint8Array(bits.length);
  let count = 0;
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] !== 1 || seen[i] === 1) continue;
    count += 1;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const at = stack.pop() ?? 0;
      const x = at % w;
      const y = Math.floor(at / w);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (bits[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  return count;
}

describe('the halftone pattern', () => {
  test('is a dither pattern, and its table is bayer8’s 64 thresholds in another order', () => {
    expect(DITHER_PATTERNS).toContain('halftone');
    expect(HALFTONE8_THRESHOLDS).toHaveLength(64);
    expect([...HALFTONE8_THRESHOLDS].sort((a, b) => a - b)).toEqual(
      [...BAYER8_THRESHOLDS].sort((a, b) => a - b),
    );
    expect(HALFTONE8_THRESHOLDS).not.toEqual(BAYER8_THRESHOLDS);
    /* tiled every 8 cells, the way bayer8 is */
    for (let y = 0; y < HALFTONE_TILE; y += 1)
      for (let x = 0; x < HALFTONE_TILE; x += 1) {
        expect(thresholdAt('halftone', x, y)).toBe(HALFTONE8_THRESHOLDS[y * 8 + x]);
        expect(thresholdAt('halftone', x + 16, y + 24)).toBe(thresholdAt('halftone', x, y));
        expect(thresholdAt('halftone', x - 8, y - 8)).toBe(thresholdAt('halftone', x, y));
      }
  });

  test('a flat tone lights as many cells as bayer8 does, gathered into dots on a 45 degree screen', () => {
    const [w, h] = [64, 64];
    for (const tone of [24, 48, 80, 128, 176, 208, 232]) {
      const dots = screenOf('halftone', tone, w, h);
      const ordered = screenOf('bayer8', tone, w, h);
      expect(
        dots.reduce((n, b) => n + b, 0),
        `tone ${tone}`,
      ).toBe(ordered.reduce((n, b) => n + b, 0));
    }
    /* a quarter tone: two dots per tile (128 over the 64 tiles) where bayer8 lights single cells */
    const quarter = screenOf('halftone', 64, w, h);
    expect(groups(quarter, w, h)).toBe(128);
    expect(groups(screenOf('bayer8', 64, w, h), w, h)).toBeGreaterThan(500);
    /* the first cells of a dot are the four around its centre, (1..2, 1..2) and (5..6, 5..6) */
    const first = [...HALFTONE8_THRESHOLDS.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8)
      .map(([i]) => [i % 8, Math.floor(i / 8)].join(','))
      .sort();
    expect(first).toEqual(['1,1', '1,2', '2,1', '2,2', '5,5', '5,6', '6,5', '6,6']);
    /* the dark dots of a light tone sit in the gaps, around (2, 6) and (6, 2) */
    const last = [...HALFTONE8_THRESHOLDS.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([i]) => [i % 8, Math.floor(i / 8)].join(','))
      .sort();
    expect(last).toEqual(['1,5', '1,6', '2,5', '2,6', '5,1', '5,2', '6,1', '6,2']);
  });

  test('the pipeline takes it end to end: one screen twice, the lit fraction of bayer8, other cells', () => {
    const width = 160;
    const height = 90;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const v = Math.round((x / (width - 1)) * 255);
        data.set([v, v, v, 255], (y * width + x) * 4);
      }
    const source: RgbaImage = { width, height, data };
    const box = { width: 320, height: 180 };
    const a = ditherPicture(source, box, { pattern: 'halftone' }, 'light');
    const b = ditherPicture(source, box, { pattern: 'halftone' }, 'light');
    const ordered = ditherPicture(source, box, { pattern: 'bayer8' }, 'light');
    expect(a.cells.positive.bits).toEqual(b.cells.positive.bits);
    expect(a.cells.positive.bits).not.toEqual(ordered.cells.positive.bits);
    expect(
      Math.abs(litFraction(a.cells.positive) - litFraction(ordered.cells.positive)),
    ).toBeLessThan(0.01);
  });
});

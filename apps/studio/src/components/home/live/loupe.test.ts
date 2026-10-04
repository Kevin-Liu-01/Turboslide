import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MAX_DELTA, THRESHOLD, colorDelta, countDiffering } from './loupe-delta';

/**
 * The loupe's colour delta is a copy of pixelmatch's (docs/LANDING.md 2.12, 6.2): these tests pin
 * it to pixelmatch itself, resolved from the exporter's own dependency (packages/export), which
 * `packages/export/src/verify/diff.ts` counts with at the same threshold. With `includeAA`
 * pixelmatch counts every pixel over the threshold, which is the loupe's count.
 */
type Pixelmatch = (
  a: Uint8Array,
  b: Uint8Array,
  out: Uint8Array | null,
  w: number,
  h: number,
  options: { threshold: number; includeAA: boolean },
) => number;

async function pixelmatch(): Promise<Pixelmatch> {
  const require = createRequire(resolve(import.meta.dirname, '../../../../../../packages/export/package.json'));
  const path = require.resolve('pixelmatch');
  return ((await import(pathToFileURL(path).href)) as { default: Pixelmatch }).default;
}

/** A seeded generator, so a failure names the pixels it ran on. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the loupe measure', () => {
  it("uses the exporter's threshold", () => {
    expect(THRESHOLD).toBe(0.1);
    expect(MAX_DELTA).toBeCloseTo(352.15, 5);
  });

  it('counts the pixels pixelmatch counts with includeAA, over random and near pairs', async () => {
    const match = await pixelmatch();
    const next = random(20261003);
    for (const [w, h] of [
      [14, 14],
      [64, 9],
      [3, 200],
    ] as const) {
      const a = new Uint8Array(w * h * 4);
      const b = new Uint8Array(w * h * 4);
      for (let k = 0; k < a.length; k += 4) {
        for (let c = 0; c < 4; c += 1) a[k + c] = Math.floor(next() * 256);
        /* half the pixels near their pair (within the threshold's reach), half anywhere */
        const near = next() < 0.5;
        for (let c = 0; c < 4; c += 1)
          b[k + c] = near
            ? Math.max(0, Math.min(255, (a[k + c] as number) + Math.round((next() - 0.5) * 24)))
            : Math.floor(next() * 256);
        if (next() < 0.5) {
          a[k + 3] = 255;
          b[k + 3] = 255;
        }
      }
      expect(countDiffering(a, b)).toBe(match(a, b, null, w, h, { threshold: THRESHOLD, includeAA: true }));
    }
  });

  it('reads 0 for equal pixels and a difference for black on white', () => {
    const black = [0, 0, 0, 255];
    const white = [255, 255, 255, 255];
    expect(colorDelta(black, 0, black, 0)).toBe(0);
    expect(colorDelta(black, 0, white, 0)).toBeGreaterThan(MAX_DELTA);
  });
});

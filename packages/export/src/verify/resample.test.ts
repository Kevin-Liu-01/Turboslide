// resampleArea (gslides-parity SPEC-5 6.2; R08 4.11): the area averaged shrink the per cell gate
// reads a cell's reference through: a half black, half white image shrinks to two pixels of the
// same halves, an odd ratio reads the mixed pixel as the mean, a same size answers a copy.
import { describe, expect, it } from 'vitest';

import { resampleArea } from './resample.ts';

function image(width: number, height: number, fill: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = fill(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

describe('resampleArea', () => {
  it('averages the covered source box into every destination pixel', () => {
    const src = image(8, 2, (x) => (x < 4 ? 0 : 255));
    const out = resampleArea(src, 2, 1);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect([out.data[0], out.data[4]]).toEqual([0, 255]);
    // three source columns into two: the middle column splits between both destinations
    const odd = image(3, 1, (x) => (x === 1 ? 255 : 0));
    const two = resampleArea(odd, 2, 1);
    expect(two.data[0]).toBe(Math.round((0 * 1 + 255 * 0.5) / 1.5));
    expect(two.data[4]).toBe(Math.round((255 * 0.5 + 0 * 1) / 1.5));
  });

  it('answers a copy at the same size and keeps the alpha', () => {
    const src = image(4, 4, () => 128);
    const same = resampleArea(src, 4, 4);
    expect(same.data).toEqual(src.data);
    expect(same.data).not.toBe(src.data);
    expect(same.data[3]).toBe(255);
  });
});

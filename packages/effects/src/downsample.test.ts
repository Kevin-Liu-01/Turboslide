// The area average of resample.ts `downsample`: the render route's thumbnails and the GT cover of
// scripts/build-brand.ts --cover both size a slide's 1x capture down with it.
import { describe, expect, test } from 'vitest';

import type { RgbaImage } from './image.ts';
import { downsample } from './resample.ts';

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

describe('downsample', () => {
  test('keeps the aspect: 1600 by 900 to 320 by 180', () => {
    const out = downsample(solid(1600, 900, [7, 7, 7, 255]), 320);
    expect([out.width, out.height]).toEqual([320, 180]);
    expect([...out.data.subarray(0, 4)]).toEqual([7, 7, 7, 255]);
  });

  test('averages each source box, fractional edges weighted by their cover', () => {
    // three columns, black, white, black: at width 2 each destination pixel covers 1.5 columns,
    // one black and half of the white one, so (0 * 1 + 255 * 0.5) / 1.5 = 85
    const src: RgbaImage = {
      width: 3,
      height: 1,
      data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    };
    const out = downsample(src, 2);
    expect(out.height).toBe(1);
    expect([...out.data]).toEqual([85, 85, 85, 255, 85, 85, 85, 255]);
  });

  test('returns the image itself when the width is not smaller', () => {
    const src = solid(4, 2, [1, 2, 3, 4]);
    expect(downsample(src, 4)).toBe(src);
  });
});

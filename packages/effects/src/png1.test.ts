import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import type { BitImage } from './image.ts';
import { encodePng1, packScanlines } from './png1.ts';

function checker(width: number, height: number): BitImage {
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) bits[y * width + x] = (x + y) % 3 === 0 ? 1 : 0;
  return { width, height, bits };
}

describe('encodePng1', () => {
  test('packs bits most significant first with a filter byte per row', () => {
    const bits: BitImage = {
      width: 10,
      height: 1,
      bits: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 1, 0]),
    };
    expect([...packScanlines(bits)]).toEqual([0, 0b10000001, 0b10000000]);
  });

  test('round trips through a PNG decoder as grayscale', async () => {
    const bits = checker(37, 11);
    const png = encodePng1(bits);
    const { data, info } = await sharp(Buffer.from(png))
      .raw()
      .toBuffer({ resolveWithObject: true });
    // libvips expands a 1-bit gray PNG to 8-bit and may report one or three channels.
    expect([info.width, info.height]).toEqual([37, 11]);
    for (let i = 0; i < bits.bits.length; i += 1)
      expect(data[i * info.channels]).toBe(bits.bits[i] ? 255 : 0);
  });

  test('round trips with a two-entry palette', async () => {
    const bits = checker(20, 9);
    const png = encodePng1(bits, {
      palette: [
        [7, 7, 7],
        [242, 242, 240],
      ],
    });
    const { data, info } = await sharp(Buffer.from(png))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([data[0], data[1], data[2]]).toEqual([242, 242, 240]);
    expect([data[3], data[4], data[5]]).toEqual([7, 7, 7]);
  });

  test('a 1600 by 900 screen encodes small and fast', () => {
    const bits = checker(1600, 900);
    const t = performance.now();
    const png = encodePng1(bits);
    expect(performance.now() - t).toBeLessThan(500);
    expect(png.length).toBeLessThan(60_000);
  });
});

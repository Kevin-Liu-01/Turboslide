// The page raster policy without a browser (docs/pptx.md): a two-color page is a 1-bit PNG that
// decodes to the source byte for byte; a page whose colors fit or quantize within budget is a
// palette PNG; a continuous-tone page with many colors takes the JPEG only when the JPEG is within
// budget and smaller; the JPEG is never taken when the page carries no continuous-tone block or
// when it is switched off; every accepted raster is under the perfect budget on these pages.
import { describe, expect, test } from 'vitest';

import type { RgbaImage } from '@turboslide/effects/image';
import { decodeImage } from '@turboslide/effects/io';
import { PAGE_RASTER_BUDGETS } from '@turboslide/schema/export';

import {
  CONTINUOUS_TONE_MIN_COLORS,
  countColors,
  describeFormats,
  encodePageRaster,
  mimeOfFormat,
  rasterMismatch,
} from './page-raster.ts';

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number?],
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a ?? 255;
    }
  }
  return { width, height, data };
}

/** A two-tone dither: ink cells on paper in a Bayer-like pattern. */
const twoTone = image(96, 64, (x, y) =>
  ((x >> 1) + (y >> 1)) % 3 === 0 ? [7, 7, 7] : [255, 255, 255],
);

/** Paper with 256 near-gray ramp levels beside it: 257 colors, more than a palette holds, one level apart. */
const ramps = image(320, 180, (x, y) => {
  const level = (x + y * 3) % 300;
  return level < 44 ? [255, 255, 255] : [level - 44, level - 44, 200];
});

/** A smooth three-channel gradient: tens of thousands of colors, few of them per row. */
const gradient = image(320, 180, (x, y) => [
  x % 256,
  Math.round((y * 255) / 179),
  ((x + y) / 2) % 256,
]);

/** Fine two-dimensional detail in every channel: the entropy of a photograph, which a PNG holds badly. */
const photo = image(640, 360, (x, y) => [
  Math.round(128 + 127 * Math.sin(x / 9) * Math.cos(y / 7)),
  Math.round(128 + 127 * Math.sin((x + y) / 11)),
  Math.round(128 + 100 * Math.sin(x / 3.3) * Math.sin(y / 2.7)),
]);

describe('countColors', () => {
  test('counts exactly under the limit and stops at it', () => {
    expect(countColors(twoTone)).toMatchObject({ count: 2, opaque: true });
    expect(countColors(ramps).count).toBe(257);
    expect(countColors(gradient).count).toBe(CONTINUOUS_TONE_MIN_COLORS + 1);
    const translucent = image(4, 4, (x) => [x, 0, 0, x === 0 ? 128 : 255]);
    expect(countColors(translucent).opaque).toBe(false);
  });
});

describe('encodePageRaster', () => {
  test('a two-color page is a 1-bit PNG that decodes to the source', async () => {
    const raster = await encodePageRaster(twoTone, { continuousTone: false });
    expect(raster.format).toBe('png-1bit');
    expect(raster.mime).toBe('image/png');
    expect(raster.colors).toBe(2);
    expect(raster.fraction).toBe(0);
    const back = await decodeImage(raster.bytes);
    expect(Buffer.compare(Buffer.from(back.data), Buffer.from(twoTone.data))).toBe(0);
    // the PNG header says bit depth 1, color type 3 (palette)
    expect(raster.bytes[24]).toBe(1);
    expect(raster.bytes[25]).toBe(3);
  });

  test('a page over 256 colors quantizes to a palette PNG within budget', async () => {
    const raster = await encodePageRaster(ramps, { continuousTone: false });
    expect(raster.format).toBe('png-palette');
    expect(raster.fraction).toBeLessThanOrEqual(PAGE_RASTER_BUDGETS.palette);
    expect(raster.fraction).toBeLessThanOrEqual(PAGE_RASTER_BUDGETS.perfect);
    expect(raster.bytes[25]).toBe(3);
    expect(raster.candidates.map((c) => c.format)).toEqual(['png-palette']);
    expect(rasterMismatch(ramps, await decodeImage(raster.bytes)).fraction).toBe(raster.fraction);
  });

  test('a continuous-tone page tries the JPEG and takes it only within budget and smaller', async () => {
    const raster = await encodePageRaster(gradient, { continuousTone: true });
    const jpeg = raster.candidates.find((c) => c.format === 'jpeg');
    const palette = raster.candidates.find((c) => c.format === 'png-palette');
    expect(jpeg).toBeDefined();
    expect(palette).toBeDefined();
    const jpegWins =
      (jpeg?.fraction ?? 1) <= PAGE_RASTER_BUDGETS.jpeg &&
      (palette !== undefined && palette.accepted ? (jpeg?.bytes ?? 0) < palette.bytes : true);
    expect(raster.format, JSON.stringify(raster.candidates)).toBe(
      jpegWins ? 'jpeg' : palette?.accepted ? 'png-palette' : 'png-rgba',
    );
    expect(raster.candidates.filter((c) => c.accepted)).toHaveLength(1);
    if (raster.format === 'jpeg') {
      expect(raster.mime).toBe('image/jpeg');
      expect(raster.bytes[0]).toBe(0xff);
      expect(raster.bytes[1]).toBe(0xd8);
    }
  });

  test('a photographic page with fine detail takes the JPEG', async () => {
    const raster = await encodePageRaster(photo, { continuousTone: true });
    expect(raster.format, JSON.stringify(raster.candidates)).toBe('jpeg');
    expect(raster.fraction).toBeLessThanOrEqual(PAGE_RASTER_BUDGETS.jpeg);
    const png = raster.candidates.find((c) => c.format !== 'jpeg');
    expect(raster.bytes.byteLength).toBeLessThan(png?.bytes ?? 0);
  });

  test('the same page without a continuous-tone block never takes the JPEG', async () => {
    const raster = await encodePageRaster(gradient, { continuousTone: false });
    expect(raster.format).not.toBe('jpeg');
    expect(raster.candidates.some((c) => c.format === 'jpeg')).toBe(false);
    const off = await encodePageRaster(gradient, { continuousTone: true, noJpeg: true });
    expect(off.format).not.toBe('jpeg');
  });

  test('a palette over budget falls back to truecolor', async () => {
    const raster = await encodePageRaster(gradient, {
      continuousTone: false,
      paletteBudget: 0,
    });
    expect(['png-rgba', 'png-palette']).toContain(raster.format);
    if (raster.format === 'png-rgba') {
      expect(raster.fraction).toBe(0);
      expect(raster.candidates[0]?.reason).toContain('palette budget');
    }
  });

  test('mimeOfFormat and describeFormats', () => {
    expect(mimeOfFormat('jpeg')).toBe('image/jpeg');
    expect(mimeOfFormat('png-1bit')).toBe('image/png');
    expect(
      describeFormats([
        { format: 'png-rgba' },
        { format: 'png-palette' },
        { format: 'png-palette' },
        { format: 'jpeg' },
      ]),
    ).toBe('2 png-palette, 1 jpeg, 1 png-rgba');
  });
});

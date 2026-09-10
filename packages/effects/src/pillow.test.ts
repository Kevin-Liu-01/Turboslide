// Byte parity with Pillow 12.3 on every pinned stage (fixtures/pillow, made once by
// scratchpad make-pillow-fixtures.py and committed). The deck's twins were produced by Pillow, so
// these fixtures are what "the same arithmetic" means for gray, crop, resample, autocontrast, the
// tone LUT, the screen and the 2x upscale.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { ditherGray } from './bayer.ts';
import type { Box4, GrayImage } from './image.ts';
import { decodeImage } from './io.ts';
import { cropPadded, fitCover, resizeLanczos3, scaleNearestGray } from './resample.ts';
import { autocontrast, toGray, tone } from './tone.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pillow');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as {
  src: { width: number; height: number };
  resizeDown: { width: number; height: number; box: Box4 };
  resizeUp: { width: number; height: number };
  fit: { width: number; height: number };
  tone: { black: number; white: number; gamma: number };
  cropPadded: { box: Box4; width: number; height: number };
  nearest2x: { width: number; height: number };
};

const bin = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));

function expectSame(got: GrayImage, want: Uint8Array, label: string): void {
  expect(got.data.length, `${label} length`).toBe(want.length);
  let mismatched = 0;
  let maxDelta = 0;
  for (let i = 0; i < want.length; i += 1) {
    const d = Math.abs((got.data[i] ?? 0) - (want[i] ?? 0));
    if (d) mismatched += 1;
    if (d > maxDelta) maxDelta = d;
  }
  expect({ label, mismatched, maxDelta }).toEqual({ label, mismatched: 0, maxDelta: 0 });
}

describe('Pillow parity', async () => {
  const rgba = await decodeImage(join(DIR, 'src.png'));
  const gray = toGray(rgba);

  test('the source decodes at the fixture size', () => {
    expect([rgba.width, rgba.height]).toEqual([manifest.src.width, manifest.src.height]);
  });

  test('convert(L) is the 16-bit fixed-point 299/587/114 luma', () => {
    expectSame(gray, bin('gray.bin'), 'gray');
  });

  test('a channel pick copies the channel', () => {
    expectSame(toGray(rgba, 'r'), bin('red.bin'), 'red');
  });

  test('crop pads with black past the source', () => {
    const got = cropPadded(gray, manifest.cropPadded.box);
    expect([got.width, got.height]).toEqual([
      manifest.cropPadded.width,
      manifest.cropPadded.height,
    ]);
    expectSame(got, bin('crop-padded.bin'), 'crop');
  });

  test('Lanczos3 downscale through a fractional box', () => {
    const { width, height, box } = manifest.resizeDown;
    expectSame(resizeLanczos3(gray, width, height, box), bin('resize-down.bin'), 'resize down');
  });

  test('Lanczos3 upscale', () => {
    const { width, height } = manifest.resizeUp;
    expectSame(resizeLanczos3(gray, width, height), bin('resize-up.bin'), 'resize up');
  });

  const fit = fitCover(gray, manifest.fit.width, manifest.fit.height);
  test('ImageOps.fit cover', () => {
    expectSame(fit, bin('fit.bin'), 'fit');
  });

  const ac = autocontrast(fit, 0.5);
  test('autocontrast at 0.5 percent', () => {
    expectSame(ac, bin('autocontrast.bin'), 'autocontrast');
  });

  const toned = tone(ac, manifest.tone.black, manifest.tone.white, manifest.tone.gamma);
  test('the tone LUT with black, white and gamma', () => {
    expectSame(toned, bin('tone.bin'), 'tone');
  });

  const bits = ditherGray(toned);
  test('the 8 by 8 screen at (m + 0.5) / 64', () => {
    const want = bin('dither.bin');
    const got: GrayImage = {
      width: bits.width,
      height: bits.height,
      data: bits.bits.map((b) => (b ? 255 : 0)),
    };
    expectSame(got, want, 'dither');
  });

  test('2x nearest', () => {
    const got = scaleNearestGray(
      { width: bits.width, height: bits.height, data: bits.bits.map((b) => (b ? 255 : 0)) },
      2,
    );
    expect([got.width, got.height]).toEqual([manifest.nearest2x.width, manifest.nearest2x.height]);
    expectSame(got, bin('nearest2x.bin'), 'nearest');
  });
});

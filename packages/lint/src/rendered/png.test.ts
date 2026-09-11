import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import { describe, expect, test } from 'vitest';

import { decodePng, encodePng } from './png.ts';
import type { Bitmap } from './png.ts';

function sample(width: number, height: number, channels: number): Uint8Array {
  const out = new Uint8Array(width * height * channels);
  for (let i = 0; i < out.length; i += 1) out[i] = (i * 37 + (i >> 3) * 11) & 255;
  return out;
}

/** A PNG with the given color type and one filter per row, cycling through the five filters. */
function filteredPng(
  width: number,
  height: number,
  colorType: 0 | 2 | 6,
  raw: Uint8Array,
): Uint8Array {
  const bpp = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const stride = width * bpp;
  const lines = new Uint8Array((stride + 1) * height);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = y % 5;
    lines[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[y * stride + i] ?? 0;
      const a = i >= bpp ? (raw[y * stride + i - bpp] ?? 0) : 0;
      const b = y > 0 ? (raw[(y - 1) * stride + i] ?? 0) : 0;
      const c = y > 0 && i >= bpp ? (raw[(y - 1) * stride + i - bpp] ?? 0) : 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? (a + b) >> 1
                : paeth(a, b, c);
      lines[y * (stride + 1) + 1 + i] = (x - predicted) & 255;
    }
  }
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    const crcInput = new Uint8Array(4 + body.length);
    crcInput.set(new TextEncoder().encode(type), 0);
    crcInput.set(body, 4);
    view.setUint32(8 + body.length, crc32(crcInput) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const deflated = deflateSync(lines);
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflated.buffer, deflated.byteOffset, deflated.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('png', () => {
  test('encodes RGBA and decodes it back', () => {
    const bitmap: Bitmap = { width: 7, height: 5, data: sample(7, 5, 4) };
    const decoded = decodePng(encodePng(bitmap));
    expect(decoded.width).toBe(7);
    expect(decoded.height).toBe(5);
    expect(Array.from(decoded.data)).toEqual(Array.from(bitmap.data));
  });

  test('reads every filter on RGB, RGBA and gray scanlines', () => {
    const rgb = sample(9, 6, 3);
    const decodedRgb = decodePng(filteredPng(9, 6, 2, rgb));
    for (let i = 0; i < 9 * 6; i += 1) {
      expect(decodedRgb.data[i * 4]).toBe(rgb[i * 3]);
      expect(decodedRgb.data[i * 4 + 1]).toBe(rgb[i * 3 + 1]);
      expect(decodedRgb.data[i * 4 + 2]).toBe(rgb[i * 3 + 2]);
      expect(decodedRgb.data[i * 4 + 3]).toBe(255);
    }
    const rgba = sample(5, 7, 4);
    expect(Array.from(decodePng(filteredPng(5, 7, 6, rgba)).data)).toEqual(Array.from(rgba));
    const gray = sample(6, 6, 1);
    const decodedGray = decodePng(filteredPng(6, 6, 0, gray));
    for (let i = 0; i < 36; i += 1) {
      expect(decodedGray.data[i * 4]).toBe(gray[i]);
      expect(decodedGray.data[i * 4 + 2]).toBe(gray[i]);
    }
  });

  test('refuses what it does not read', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
    const rgb = filteredPng(2, 2, 2, sample(2, 2, 3));
    rgb[24] = 16;
    expect(() => decodePng(rgb)).toThrow(/bit depth 16/);
  });

  // the repository root from this file: packages/lint/src/rendered
  const render = resolve(import.meta.dirname, '../../../../.turboslide/render/02-title-light.png');
  test.skipIf(!existsSync(render))('decodes a sheet screenshot from the last render', () => {
    const bitmap = decodePng(new Uint8Array(readFileSync(render)));
    expect([bitmap.width, bitmap.height]).toEqual([1600, 900]);
    const i = (10 * 1600 + 800) * 4;
    expect(Array.from(bitmap.data.subarray(i, i + 3))).toEqual([255, 255, 255]);
  });
});

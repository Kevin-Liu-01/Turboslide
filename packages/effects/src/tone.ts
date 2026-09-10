// Tone stages of the two-tone pipeline (SPEC 5.4, 10): grayscale with the integer 299/587/114
// luma or one channel, inversion, autocontrast at a percent cutoff, and the black point, white
// point and gamma LUT. Every stage reproduces Pillow's arithmetic (the deck's pipelines in
// shots/OPENERS.md and scratchpad/rosetta/make.py ran on Pillow) so the twins the rounds approved
// can be regenerated cell for cell; the fixtures under fixtures/pillow pin each stage.
import type { GrayImage, RgbaImage } from './image.ts';

export type Channel = 'gray' | 'r' | 'g' | 'b';

/**
 * RGBA to gray. 'gray' is Pillow's L conversion, ITU-R 601-2 luma in 16-bit fixed point:
 * (r * 19595 + g * 38470 + b * 7471 + 32768) >> 16, the 299/587/114 weights scaled to 65536.
 * A channel pick copies that channel (the Blue Marble uses red, OPENERS.md "Brand, mood-earth").
 * Alpha is ignored, as Image.convert('RGB') drops it.
 */
export function toGray(rgba: RgbaImage, channel: Channel = 'gray'): GrayImage {
  const { width, height, data } = rgba;
  const out = new Uint8Array(width * height);
  const n = width * height;
  if (channel === 'gray') {
    for (let i = 0, p = 0; i < n; i += 1, p += 4) {
      const r = data[p] ?? 0;
      const g = data[p + 1] ?? 0;
      const b = data[p + 2] ?? 0;
      out[i] = (r * 19595 + g * 38470 + b * 7471 + 32768) >> 16;
    }
  } else {
    const offset = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
    for (let i = 0, p = offset; i < n; i += 1, p += 4) out[i] = data[p] ?? 0;
  }
  return { width, height, data: out };
}

export function invertGray(gray: GrayImage): GrayImage {
  const out = new Uint8Array(gray.data.length);
  for (let i = 0; i < out.length; i += 1) out[i] = 255 - (gray.data[i] ?? 0);
  return { width: gray.width, height: gray.height, data: out };
}

export function applyLut(gray: GrayImage, lut: Uint8Array): GrayImage {
  const out = new Uint8Array(gray.data.length);
  for (let i = 0; i < out.length; i += 1) out[i] = lut[gray.data[i] ?? 0] ?? 0;
  return { width: gray.width, height: gray.height, data: out };
}

export function histogram(gray: GrayImage): Uint32Array {
  const h = new Uint32Array(256);
  for (const v of gray.data) h[v] = (h[v] ?? 0) + 1;
  return h;
}

/**
 * The LUT of Pillow's ImageOps.autocontrast(image, cutoff): remove cutoff percent of the pixels
 * from each end of the histogram (int(n * cutoff // 100) pixels), take the remaining extremes as
 * lo and hi, and stretch with scale = 255 / (hi - lo), offset = -lo * scale, truncating toward
 * zero and clamping. When hi <= lo the LUT is the identity.
 */
export function autocontrastLut(gray: GrayImage, cutoff: number): Uint8Array {
  const h = Array.from(histogram(gray));
  const lut = new Uint8Array(256);
  if (cutoff > 0) {
    let n = 0;
    for (let i = 0; i < 256; i += 1) n += h[i] ?? 0;
    let cut = Math.floor((n * cutoff) / 100);
    for (let lo = 0; lo < 256; lo += 1) {
      const v = h[lo] ?? 0;
      if (cut > v) {
        cut -= v;
        h[lo] = 0;
      } else {
        h[lo] = v - cut;
        cut = 0;
      }
      if (cut <= 0) break;
    }
    cut = Math.floor((n * cutoff) / 100);
    for (let hi = 255; hi >= 0; hi -= 1) {
      const v = h[hi] ?? 0;
      if (cut > v) {
        cut -= v;
        h[hi] = 0;
      } else {
        h[hi] = v - cut;
        cut = 0;
      }
      if (cut <= 0) break;
    }
  }
  let lo = 0;
  while (lo < 256 && (h[lo] ?? 0) === 0) lo += 1;
  let hi = 255;
  while (hi >= 0 && (h[hi] ?? 0) === 0) hi -= 1;
  if (hi <= lo) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  const scale = 255 / (hi - lo);
  const offset = -lo * scale;
  for (let i = 0; i < 256; i += 1) {
    const v = Math.trunc(i * scale + offset);
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return lut;
}

export function autocontrast(gray: GrayImage, cutoff: number): GrayImage {
  return applyLut(gray, autocontrastLut(gray, cutoff));
}

/** Python's round(): half to even. The tone LUT was built with it. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/**
 * The tone LUT of the deck's pipelines (make.py tone(): u = clamp((v - black) / max(1, white -
 * black), 0, 1); lut[v] = round(u ** gamma * 255)). Values at or below the black point become
 * ink, values at or above the white point become paper, gamma below 1 lifts mid-tones
 * (OPENERS.md, "Photograph pipeline" step 4).
 */
export function toneLut(black = 0, white = 255, gamma = 1): Uint8Array {
  const lut = new Uint8Array(256);
  const span = Math.max(1, white - black);
  for (let v = 0; v < 256; v += 1) {
    const u = Math.min(1, Math.max(0, (v - black) / span));
    lut[v] = roundHalfEven(Math.pow(u, gamma) * 255);
  }
  return lut;
}

export function tone(gray: GrayImage, black = 0, white = 255, gamma = 1): GrayImage {
  return applyLut(gray, toneLut(black, white, gamma));
}

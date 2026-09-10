// The optional spatial filters of the photograph pipeline (OPENERS.md, "Photograph pipeline"
// steps 2 and 3): a Gaussian blur before the fit, a minimum filter that thickens engraved
// hatching, and an unsharp mask applied to a band of rows after the fit.
//
// Pinned definitions (SPEC 5.4: one specified algorithm everywhere). These are the Turboslide
// definitions, not Pillow's: Pillow approximates its GaussianBlur with three extended box blurs
// and shrinks the image under a MinFilter. The Rust crate of SPEC 10 must reproduce the
// definitions below, and twins made by the Pillow rounds with a blur, minFilter or unsharp step
// may differ from the regenerated twins in a small share of cells; the parity test of M5 lists
// them (MILESTONES M5 acceptance, "missingParameter" residual).
//   gaussianBlur(radius): sigma = radius, kernel radius ceil(3 sigma), weights exp(-x^2 / 2 sigma^2)
//     normalized to one, separable, edges replicate, each pass rounded to the nearest integer.
//   minFilter(size): the minimum over the size by size window, edges replicate, same size out.
//   unsharpBand(rows, amount, radius, threshold): Pillow's UnsharpMask rule, out = in + (in -
//     blur) * amount / 100 where |in - blur| > threshold, on rows [from, to) only.
import type { GrayImage } from './image.ts';

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.ceil(3 * sigma);
  const k = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < k.length; i += 1) k[i] = (k[i] ?? 0) / sum;
  return k;
}

function clampIndex(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

export function gaussianBlur(gray: GrayImage, radius: number): GrayImage {
  if (!(radius > 0)) return gray;
  const { width, height, data } = gray;
  const k = gaussianKernel(radius);
  const r = (k.length - 1) / 2;
  const tmp = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -r; i <= r; i += 1)
        acc += (k[i + r] ?? 0) * (data[row + clampIndex(x + i, width)] ?? 0);
      tmp[row + x] = Math.min(255, Math.max(0, Math.round(acc)));
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let acc = 0;
      for (let i = -r; i <= r; i += 1)
        acc += (k[i + r] ?? 0) * (tmp[clampIndex(y + i, height) * width + x] ?? 0);
      out[y * width + x] = Math.min(255, Math.max(0, Math.round(acc)));
    }
  }
  return { width, height, data: out };
}

export function minFilter(gray: GrayImage, size: number): GrayImage {
  if (!(size > 1)) return gray;
  const { width, height, data } = gray;
  const m = Math.floor(size / 2);
  const tmp = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let v = 255;
      for (let i = -m; i <= m; i += 1) {
        const p = data[row + clampIndex(x + i, width)] ?? 0;
        if (p < v) v = p;
      }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let v = 255;
      for (let i = -m; i <= m; i += 1) {
        const p = tmp[clampIndex(y + i, height) * width + x] ?? 0;
        if (p < v) v = p;
      }
      out[y * width + x] = v;
    }
  }
  return { width, height, data: out };
}

export type UnsharpBand = {
  /** The row range [from, to) of the fitted image the mask applies to. */
  rows: [number, number];
  /** Percent, Pillow's unit: 180 means 180 percent. */
  amount: number;
  radius?: number;
  threshold?: number;
};

export function unsharpBand(gray: GrayImage, band: UnsharpBand): GrayImage {
  const radius = band.radius ?? 8;
  const threshold = band.threshold ?? 3;
  const blurred = gaussianBlur(gray, radius);
  const out = new Uint8Array(gray.data);
  const from = Math.max(0, band.rows[0]);
  const to = Math.min(gray.height, band.rows[1]);
  for (let y = from; y < to; y += 1) {
    for (let x = 0; x < gray.width; x += 1) {
      const i = y * gray.width + x;
      const v = gray.data[i] ?? 0;
      const diff = v - (blurred.data[i] ?? 0);
      if (Math.abs(diff) > threshold) {
        const s = Math.round(v + (diff * band.amount) / 100);
        out[i] = s < 0 ? 0 : s > 255 ? 255 : s;
      }
    }
  }
  return { width: gray.width, height: gray.height, data: out };
}

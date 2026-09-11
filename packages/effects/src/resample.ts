// Resampling for the two-tone pipeline (SPEC 5.4, 10): the padded crop, the cover fit to 800 by
// 450 and the nearest-neighbour upscale.
//
// The pinned Lanczos3 is Pillow's resampler, reproduced step for step (libImaging/Resample.c):
// the kernel sinc(x) sinc(x / 3) on |x| < 3, support scaled by the downscale factor, taps
// centered at in0 + (xx + 0.5) * scale and rounded with (int)(v + 0.5), coefficients normalized
// to one and then quantized to 22-bit fixed point, a horizontal pass and a vertical pass each
// through 8-bit storage, and the sum rounded with a half-unit bias and floored. The three Lanczos
// implementations measured in the slides experiment disagreed on about 120 cells of 1.44 million
// (slides report section 3.4); pinning Pillow's arithmetic makes the twins the rounds approved
// reproducible, and gives the Rust crate one integer specification to match.
import type { Box4, BitImage, GrayImage } from './image.ts';

const SUPPORT = 3;
const PRECISION_BITS = 32 - 8 - 2;
const PRECISION = 2 ** PRECISION_BITS;
const HALF = 2 ** (PRECISION_BITS - 1);

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = x * Math.PI;
  return Math.sin(px) / px;
}

function lanczos(x: number): number {
  if (x >= -3 && x < 3) return sinc(x) * sinc(x / 3);
  return 0;
}

/**
 * The per-axis tap table: `ksize` coefficients per output pixel in `kk`, and per output pixel its
 * first input index and tap count in `bounds`.
 */
export type Coeffs = { ksize: number; bounds: Int32Array; kk: Int32Array };

/** Pillow's precompute_coeffs plus normalize_coeffs_8bpc, for one axis. */
export function precomputeCoeffs(
  inSize: number,
  in0: number,
  in1: number,
  outSize: number,
): Coeffs {
  const scale = (in1 - in0) / outSize;
  const filterscale = scale < 1 ? 1 : scale;
  const support = SUPPORT * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const k = new Float64Array(ksize);
  const ss = 1 / filterscale;
  for (let xx = 0; xx < outSize; xx += 1) {
    const center = in0 + (xx + 0.5) * scale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x += 1) {
      const w = lanczos((x + xmin - center + 0.5) * ss);
      k[x] = w;
      ww += w;
    }
    for (let x = 0; x < xmax; x += 1) if (ww !== 0) k[x] = (k[x] ?? 0) / ww;
    for (let x = xmax; x < ksize; x += 1) k[x] = 0;
    for (let x = 0; x < ksize; x += 1) {
      const v = k[x] ?? 0;
      kk[xx * ksize + x] =
        v < 0 ? Math.trunc(-0.5 + v * PRECISION) : Math.trunc(0.5 + v * PRECISION);
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, bounds, kk };
}

function clip8(ss: number): number {
  const v = Math.floor(ss / PRECISION);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function horizontalPass(
  src: GrayImage,
  offset: number,
  outH: number,
  outW: number,
  c: Coeffs,
): GrayImage {
  const out = new Uint8Array(outW * outH);
  const { ksize, bounds, kk } = c;
  for (let yy = 0; yy < outH; yy += 1) {
    const inRow = (yy + offset) * src.width;
    const outRow = yy * outW;
    for (let xx = 0; xx < outW; xx += 1) {
      const xmin = bounds[xx * 2] ?? 0;
      const xmax = bounds[xx * 2 + 1] ?? 0;
      const kBase = xx * ksize;
      let ss = HALF;
      for (let x = 0; x < xmax; x += 1)
        ss += (src.data[inRow + x + xmin] ?? 0) * (kk[kBase + x] ?? 0);
      out[outRow + xx] = clip8(ss);
    }
  }
  return { width: outW, height: outH, data: out };
}

function verticalPass(src: GrayImage, outH: number, c: Coeffs): GrayImage {
  const w = src.width;
  const out = new Uint8Array(w * outH);
  const { ksize, bounds, kk } = c;
  for (let yy = 0; yy < outH; yy += 1) {
    const ymin = bounds[yy * 2] ?? 0;
    const ymax = bounds[yy * 2 + 1] ?? 0;
    const kBase = yy * ksize;
    const outRow = yy * w;
    for (let xx = 0; xx < w; xx += 1) {
      let ss = HALF;
      for (let y = 0; y < ymax; y += 1)
        ss += (src.data[(y + ymin) * w + xx] ?? 0) * (kk[kBase + y] ?? 0);
      out[outRow + xx] = clip8(ss);
    }
  }
  return { width: w, height: outH, data: out };
}

/**
 * Pillow's Image.resize(size, LANCZOS, box) for an 8-bit image. The box is in source pixels and
 * may carry fractions, as ImageOps.fit passes it.
 */
export function resizeLanczos3(src: GrayImage, dstW: number, dstH: number, box?: Box4): GrayImage {
  const [x0, y0, x1, y1] = box ?? [0, 0, src.width, src.height];
  if (
    dstW === src.width &&
    dstH === src.height &&
    x0 === 0 &&
    y0 === 0 &&
    x1 === src.width &&
    y1 === src.height
  ) {
    return { width: src.width, height: src.height, data: new Uint8Array(src.data) };
  }
  const horiz = precomputeCoeffs(src.width, x0, x1, dstW);
  const vert = precomputeCoeffs(src.height, y0, y1, dstH);
  const needHorizontal = dstW !== src.width || x0 !== 0 || x1 !== dstW;
  const needVertical = dstH !== src.height || y0 !== 0 || y1 !== dstH;
  const yboxFirst = vert.bounds[0] ?? 0;
  const yboxLast = (vert.bounds[dstH * 2 - 2] ?? 0) + (vert.bounds[dstH * 2 - 1] ?? 0);
  let img = src;
  if (needHorizontal) {
    for (let i = 0; i < dstH; i += 1) vert.bounds[i * 2] = (vert.bounds[i * 2] ?? 0) - yboxFirst;
    img = horizontalPass(src, yboxFirst, yboxLast - yboxFirst, dstW, horiz);
  }
  if (needVertical) img = verticalPass(img, dstH, vert);
  return img;
}

/**
 * Pillow's Image.crop(box) for an 8-bit image: the box may reach past the source on any side and
 * the outside is filled with black, which the shader pipeline uses where a render's own ground is
 * black (OPENERS.md, "Shader pipeline"; the liquid metal opener's box starts at x -1325).
 */
export function cropPadded(src: GrayImage, box: Box4): GrayImage {
  const [l, t, r, b] = box.map(Math.round) as Box4;
  const width = Math.max(0, r - l);
  const height = Math.max(0, b - t);
  const out = new Uint8Array(width * height);
  const y0 = Math.max(0, t);
  const y1 = Math.min(src.height, b);
  const x0 = Math.max(0, l);
  const x1 = Math.min(src.width, r);
  for (let y = y0; y < y1; y += 1) {
    const srcRow = y * src.width;
    const outRow = (y - t) * width;
    out.set(src.data.subarray(srcRow + x0, srcRow + x1), outRow + (x0 - l));
  }
  return { width, height, data: out };
}

/**
 * The crop box ImageOps.fit computes for a cover fit with the given centering: the largest box
 * of the target aspect inside the source, centered. Fractions are kept, as Pillow keeps them.
 */
export function coverBox(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  centering: [number, number] = [0.5, 0.5],
): Box4 {
  const cx = Math.min(1, Math.max(0, centering[0]));
  const cy = Math.min(1, Math.max(0, centering[1]));
  const liveRatio = srcW / srcH;
  const outRatio = dstW / dstH;
  let cropW: number;
  let cropH: number;
  if (liveRatio === outRatio) {
    cropW = srcW;
    cropH = srcH;
  } else if (liveRatio >= outRatio) {
    cropW = outRatio * srcH;
    cropH = srcH;
  } else {
    cropW = srcW;
    cropH = srcW / outRatio;
  }
  const left = (srcW - cropW) * cx;
  const top = (srcH - cropH) * cy;
  return [left, top, left + cropW, top + cropH];
}

/** ImageOps.fit(image, (dstW, dstH), LANCZOS, centering): cover, trimming the long side. */
export function fitCover(
  src: GrayImage,
  dstW: number,
  dstH: number,
  centering: [number, number] = [0.5, 0.5],
): GrayImage {
  return resizeLanczos3(src, dstW, dstH, coverBox(src.width, src.height, dstW, dstH, centering));
}

/** Nearest-neighbour upscale by an integer factor: every cell becomes a k by k square. */
export function scaleNearest(bits: BitImage, k: number): BitImage {
  const f = Math.max(1, Math.round(k));
  const width = bits.width * f;
  const height = bits.height * f;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const srcRow = Math.floor(y / f) * bits.width;
    const outRow = y * width;
    for (let x = 0; x < width; x += 1) out[outRow + x] = bits.bits[srcRow + Math.floor(x / f)] ?? 0;
  }
  return { width, height, bits: out };
}

/** Nearest-neighbour upscale of a gray image by an integer factor (the fixture test and thumbs). */
export function scaleNearestGray(gray: GrayImage, k: number): GrayImage {
  const f = Math.max(1, Math.round(k));
  const width = gray.width * f;
  const height = gray.height * f;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const srcRow = Math.floor(y / f) * gray.width;
    const outRow = y * width;
    for (let x = 0; x < width; x += 1) out[outRow + x] = gray.data[srcRow + Math.floor(x / f)] ?? 0;
  }
  return { width, height, data: out };
}

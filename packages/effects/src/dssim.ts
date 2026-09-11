// DSSIM in TypeScript (SPEC 8.5, 10), the same definition as crates/turboslide-native/src/dssim.rs
// operation for operation, so the fallback scores what the native module scores: sRGB to linear
// to CIE L*a*b* (alpha ignored; channels L / 100, (a + 128) / 255, (b + 128) / 255), SSIM per
// channel with an 11-tap Gaussian window (sigma 1.5, edges replicate, C1 = 0.01^2, C2 = 0.03^2),
// channels combined as (L + 0.5 a + 0.5 b) / 2, up to five 2 by 2 box scales weighted 0.0448,
// 0.2856, 0.3001, 0.2363, 0.1333 while both sides stay at least 11 px, and dssim = 1 / ssim - 1.
// This is Turboslide's own multi-scale SSIM (Wang et al. 2003, 2004), not the AGPL `dssim` crate
// (docs/native.md, "DSSIM"). `dssim` in diff.ts dispatches to the selected backend.
import type { RgbaImage } from './image.ts';
import { assertSameSize } from './pixelmatch.ts';

export type DssimResult = {
  /** 0 for identical images, growing without bound as they diverge. */
  dssim: number;
  /** The weighted multi-scale SSIM behind it, 1 for identical images. */
  ssim: number;
  /** How many scales were scored (1 to 5), fewer on small regions. */
  scales: number;
};

export const WINDOW_SIGMA = 1.5;
export const WINDOW_RADIUS = 5;
export const C1 = 0.01 * 0.01;
export const C2 = 0.03 * 0.03;
export const SCALE_WEIGHTS: readonly number[] = [0.0448, 0.2856, 0.3001, 0.2363, 0.1333];
export const MIN_SIDE = 11;

const LINEAR: Float64Array = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

const DELTA3 = 216 / 24389;

function labF(t: number): number {
  return t > DELTA3 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

type Planes = { width: number; height: number; l: Float64Array; a: Float64Array; b: Float64Array };

export function toLab(image: RgbaImage): Planes {
  const { width, height, data } = image;
  const n = width * height;
  const l = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = LINEAR[data[p] ?? 0] ?? 0;
    const g = LINEAR[data[p + 1] ?? 0] ?? 0;
    const bl = LINEAR[data[p + 2] ?? 0] ?? 0;
    const x = r * 0.4124564 + g * 0.3575761 + bl * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + bl * 0.072175;
    const z = r * 0.0193339 + g * 0.119192 + bl * 0.9503041;
    const fx = labF(x / 0.95047);
    const fy = labF(y / 1.0);
    const fz = labF(z / 1.08883);
    l[i] = (116 * fy - 16) / 100;
    a[i] = (500 * (fx - fy) + 128) / 255;
    b[i] = (200 * (fy - fz) + 128) / 255;
  }
  return { width, height, l, a, b };
}

export function window(): Float64Array {
  const k = new Float64Array(2 * WINDOW_RADIUS + 1);
  let sum = 0;
  for (let i = 0; i < k.length; i += 1) {
    const d = i - WINDOW_RADIUS;
    const w = Math.exp(-(d * d) / (2 * WINDOW_SIGMA * WINDOW_SIGMA));
    k[i] = w;
    sum += w;
  }
  for (let i = 0; i < k.length; i += 1) k[i] = (k[i] ?? 0) / sum;
  return k;
}

function clampIndex(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

export function blur(
  src: Float64Array,
  width: number,
  height: number,
  k: Float64Array,
): Float64Array {
  const r = (k.length - 1) / 2;
  const tmp = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -r; i <= r; i += 1)
        acc += (k[i + r] ?? 0) * (src[row + clampIndex(x + i, width)] ?? 0);
      tmp[row + x] = acc;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let i = -r; i <= r; i += 1)
        acc += (k[i + r] ?? 0) * (tmp[clampIndex(y + i, height) * width + x] ?? 0);
      out[y * width + x] = acc;
    }
  }
  return out;
}

export function ssimPlane(
  x: Float64Array,
  y: Float64Array,
  width: number,
  height: number,
  k: Float64Array,
): number {
  const n = width * height;
  const muX = blur(x, width, height, k);
  const muY = blur(y, width, height, k);
  const xx = new Float64Array(n);
  const yy = new Float64Array(n);
  const xy = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = x[i] ?? 0;
    const b = y[i] ?? 0;
    xx[i] = a * a;
    yy[i] = b * b;
    xy[i] = a * b;
  }
  const eXX = blur(xx, width, height, k);
  const eYY = blur(yy, width, height, k);
  const eXY = blur(xy, width, height, k);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const mx = muX[i] ?? 0;
    const my = muY[i] ?? 0;
    const sx = (eXX[i] ?? 0) - mx * mx;
    const sy = (eYY[i] ?? 0) - my * my;
    const sxy = (eXY[i] ?? 0) - mx * my;
    const num = (2 * mx * my + C1) * (2 * sxy + C2);
    const den = (mx * mx + my * my + C1) * (sx + sy + C2);
    sum += num / den;
  }
  return sum / n;
}

export function downsample(src: Float64Array, width: number, height: number): Float64Array {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = 2 * y * width + 2 * x;
      out[y * w + x] =
        ((src[i] ?? 0) + (src[i + 1] ?? 0) + (src[i + width] ?? 0) + (src[i + width + 1] ?? 0)) / 4;
    }
  }
  return out;
}

export function dssimTypeScript(a: RgbaImage, b: RgbaImage): DssimResult {
  assertSameSize(a, b, 'dssim');
  const pa = toLab(a);
  const pb = toLab(b);
  const k = window();
  const planesA = [pa.l, pa.a, pa.b];
  const planesB = [pb.l, pb.a, pb.b];
  let w = a.width;
  let h = a.height;
  let weighted = 0;
  let weightSum = 0;
  let scales = 0;
  for (const weight of SCALE_WEIGHTS) {
    if (w < MIN_SIDE || h < MIN_SIDE) break;
    const sl = ssimPlane(
      planesA[0] ?? new Float64Array(0),
      planesB[0] ?? new Float64Array(0),
      w,
      h,
      k,
    );
    const sa = ssimPlane(
      planesA[1] ?? new Float64Array(0),
      planesB[1] ?? new Float64Array(0),
      w,
      h,
      k,
    );
    const sb = ssimPlane(
      planesA[2] ?? new Float64Array(0),
      planesB[2] ?? new Float64Array(0),
      w,
      h,
      k,
    );
    const s = (sl + 0.5 * sa + 0.5 * sb) / 2;
    weighted += weight * s;
    weightSum += weight;
    scales += 1;
    const nw = Math.floor(w / 2);
    const nh = Math.floor(h / 2);
    if (nw < MIN_SIDE || nh < MIN_SIDE) break;
    for (let i = 0; i < 3; i += 1) {
      planesA[i] = downsample(planesA[i] ?? new Float64Array(0), w, h);
      planesB[i] = downsample(planesB[i] ?? new Float64Array(0), w, h);
    }
    w = nw;
    h = nh;
  }
  if (scales === 0) {
    const same = a.data.every((v, i) => v === b.data[i]);
    return { dssim: same ? 0 : 1, ssim: same ? 1 : 0.5, scales: 0 };
  }
  const ssim = weighted / weightSum;
  const floored = Math.max(ssim, 1e-6);
  return { dssim: 1 / floored - 1, ssim, scales };
}

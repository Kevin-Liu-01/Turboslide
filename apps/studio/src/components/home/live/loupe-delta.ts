/**
 * The loupe's measure (docs/LANDING.md 2.12): pixelmatch's colour delta at the exporter's threshold
 * 0.1, copied from pixelmatch 7.2.0 (`colorDelta`, which `packages/export/src/verify/diff.ts` counts
 * with), so the page and the build (`scripts/home/export.ts`) count a differing pixel as the
 * exporter's verify does. `loupe.test.ts` pins it to pixelmatch itself. V3's file.
 */

/** pixelmatch's default threshold, the one the exporter's verify uses (diff.ts). */
export const THRESHOLD = 0.1;
/** 35215 is the largest YIQ distance (pixelmatch); a pixel differs above this share of it. */
export const MAX_DELTA = 35215 * THRESHOLD * THRESHOLD;

/**
 * pixelmatch's colour delta (pixelmatch 7.2.0 `colorDelta` with its default checkerboard, which the
 * exporter's verify counts with in `diff.ts`): the squared YIQ distance of two RGBA pixels, a
 * translucent pair blended over pixelmatch's checkerboard at the first pixel's byte offset `i`
 * (both rasters the loupe reads are opaque, so the blend never applies to them).
 */
export function colorDelta(a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number): number {
  const r1 = a[i] as number;
  const g1 = a[i + 1] as number;
  const b1 = a[i + 2] as number;
  const a1 = a[i + 3] as number;
  const r2 = b[j] as number;
  const g2 = b[j + 1] as number;
  const b2 = b[j + 2] as number;
  const a2 = b[j + 3] as number;
  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  if (a1 < 255 || a2 < 255) {
    const da = a1 - a2;
    const rb = 48 + 159 * (i % 2);
    const gb = 48 + 159 * (((i / 1.618033988749895) | 0) % 2);
    const bb = 48 + 159 * (((i / 2.618033988749895) | 0) % 2);
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
    db = (b1 * a1 - b2 * a2 - bb * da) / 255;
  }
  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
  const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
  return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q;
}

/** The pixels of two equal RGBA buffers whose colour delta exceeds the threshold. */
export function countDiffering(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let n = 0;
  for (let k = 0; k + 3 < a.length; k += 4) if (colorDelta(a, k, b, k) > MAX_DELTA) n += 1;
  return n;
}


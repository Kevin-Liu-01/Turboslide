// Diffs (SPEC 3.1 effects "diff"; SPEC 10 diff.rs): the exact per-pixel count, the
// pixelmatch-compatible perceptual diff and DSSIM over RGBA buffers, each computed by the
// selected backend (select.ts: the napi addon, the wasm module or the TypeScript modules
// pixelmatch.ts and dssim.ts), and cell agreement between two one-bit images, which is how a
// regenerated twin is checked against the file a round approved. The verify loop (SPEC 8.5 step
// 3) takes `diffPixelmatch` for its pixel budgets and `dssim` for the text gate; both accept a
// crop from `cropRgba` in image.ts for per-block gates.
import type { BitImage, GrayImage, RgbaImage } from './image.ts';
import type { DssimResult } from './dssim.ts';
import type { PixelmatchDiff, PixelmatchOptions } from './pixelmatch.ts';
import { getBackend } from './select.ts';

export type ExactDiff = { total: number; mismatched: number; fraction: number };

/** Mismatched pixels between two RGBA images of the same size; alpha counts. */
export function diffExact(a: RgbaImage, b: RgbaImage): ExactDiff {
  return getBackend().diffExact(a, b);
}

/**
 * pixelmatch over two RGBA images of the same size: the mismatched count after antialiasing
 * detection at `threshold` (0.1 unless set), and the diff image when `output` is asked for.
 */
export function diffPixelmatch(
  a: RgbaImage,
  b: RgbaImage,
  options: PixelmatchOptions = {},
): PixelmatchDiff {
  return getBackend().diffPixelmatch(a, b, options);
}

/**
 * DSSIM over two RGBA images of the same size (dssim.ts has the definition): 0 for identical
 * images. A per-block gate crops both images to the block's box first.
 */
export function dssim(a: RgbaImage, b: RgbaImage): DssimResult {
  return getBackend().dssim(a, b);
}

export type CellAgreement = { cells: number; mismatched: number; agreement: number };

/** Cells that differ between two bit images of the same size. */
export function cellAgreement(a: BitImage, b: BitImage): CellAgreement {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `cellAgreement: sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`,
    );
  }
  const cells = a.width * a.height;
  let mismatched = 0;
  for (let i = 0; i < cells; i += 1) if ((a.bits[i] ?? 0) !== (b.bits[i] ?? 0)) mismatched += 1;
  return { cells, mismatched, agreement: cells === 0 ? 1 : 1 - mismatched / cells };
}

/**
 * Read a rendered two-tone picture back into cells: the mean of each cell by cell block of a
 * gray image is compared with 127. JPEG twins keep every cell on its side of the threshold
 * (OPENERS.md: "both round ten pairs round-trip with no cell changed"), so this recovers the
 * one-bit image a file was written from.
 */
export function bitsFromGray(gray: GrayImage, cell = 2): BitImage {
  const width = Math.floor(gray.width / cell);
  const height = Math.floor(gray.height / cell);
  const bits = new Uint8Array(width * height);
  const area = cell * cell;
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      let sum = 0;
      for (let dy = 0; dy < cell; dy += 1) {
        const row = (cy * cell + dy) * gray.width + cx * cell;
        for (let dx = 0; dx < cell; dx += 1) sum += gray.data[row + dx] ?? 0;
      }
      bits[cy * width + cx] = sum / area > 127 ? 1 : 0;
    }
  }
  return { width, height, bits };
}

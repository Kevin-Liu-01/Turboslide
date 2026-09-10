// Exact diffs (SPEC 3.1 effects "diff"; SPEC 10 diff.rs): a per-pixel count over RGBA buffers,
// and cell agreement between two one-bit images, which is how a regenerated twin is checked
// against the file a round approved. The perceptual diff stays with pixelmatch in the headless
// and export packages until the native module lands (SPEC 10).
import type { BitImage, GrayImage, RgbaImage } from './image.ts';

export type ExactDiff = { total: number; mismatched: number; fraction: number };

/** Mismatched pixels between two RGBA images of the same size; alpha counts. */
export function diffExact(a: RgbaImage, b: RgbaImage): ExactDiff {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `diffExact: sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`,
    );
  }
  const total = a.width * a.height;
  let mismatched = 0;
  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    if (
      a.data[p] !== b.data[p] ||
      a.data[p + 1] !== b.data[p + 1] ||
      a.data[p + 2] !== b.data[p + 2] ||
      a.data[p + 3] !== b.data[p + 3]
    ) {
      mismatched += 1;
    }
  }
  return { total, mismatched, fraction: total === 0 ? 0 : mismatched / total };
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

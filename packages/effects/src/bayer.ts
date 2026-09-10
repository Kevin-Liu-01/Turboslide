// The 8 by 8 Bayer screen, the deck's one texture (SPEC 2.1, 5.4). The permutation of 0 to 63 is
// the deck's own (Prototemplate/deck/parts/tail.html lines 100 to 103): the 4 by 4 matrix, each
// entry times four, plus an offset by quadrant. It equals the BAYER table in the deck's Pillow
// pipelines (shots/OPENERS.md, "Shader pipeline" step 5; scratchpad/rosetta/make.py).
import type { BitImage, GrayImage } from './image.ts';

const B4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const Q: readonly number[] = [0, 2, 3, 1];

/** The screen value at row r, column c, in 0 to 63. */
export function bayer8(r: number, c: number): number {
  const rr = ((r % 8) + 8) % 8;
  const cc = ((c % 8) + 8) % 8;
  const b = B4[rr % 4]?.[cc % 4] ?? 0;
  const q = Q[Math.floor(rr / 4) * 2 + Math.floor(cc / 4)] ?? 0;
  return b * 4 + q;
}

/** The 8 by 8 table, row major, for callers that ship the screen into a page or a worker. */
export const BAYER8: readonly (readonly number[])[] = Array.from({ length: 8 }, (_row, r) =>
  Array.from({ length: 8 }, (_col, c) => bayer8(r, c)),
);

/**
 * The integer threshold for a cell: int((m + 0.5) / 64 * 255), as the Pillow pipeline builds its
 * threshold map. A tone value v lights the cell when v > threshold, which is the same test as
 * v / 255 > (m + 0.5) / 64 because 255 * (2m + 1) / 128 is never an integer.
 */
export function bayerThreshold(r: number, c: number): number {
  return Math.trunc(((bayer8(r, c) + 0.5) / 64) * 255);
}

/** The 64 thresholds, row major, precomputed once. */
export const BAYER8_THRESHOLDS: Uint8Array = (() => {
  const t = new Uint8Array(64);
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) t[r * 8 + c] = bayerThreshold(r, c);
  return t;
})();

/** Ordered dither of a tone image to one bit: a cell is lit when its value exceeds the screen. */
export function ditherGray(gray: GrayImage): BitImage {
  const { width, height, data } = gray;
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowT = (y % 8) * 8;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const t = BAYER8_THRESHOLDS[rowT + (x % 8)] ?? 0;
      bits[row + x] = (data[row + x] ?? 0) > t ? 1 : 0;
    }
  }
  return { width, height, bits };
}

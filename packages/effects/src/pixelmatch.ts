// The pixelmatch-compatible perceptual diff in TypeScript (SPEC 8.5 step 3, SPEC 10 diff.rs):
// the npm package itself, wrapped in the effects image types, so the fallback is the reference
// the Rust port is held to in parity.test.ts. `diffPixelmatch` in diff.ts dispatches to the
// selected backend; this module is the TypeScript side.
import pixelmatch from 'pixelmatch';

import type { RgbaImage } from './image.ts';

export type PixelmatchOptions = {
  /** Matching threshold, 0 to 1; smaller is more sensitive. The verify loop uses 0.1. */
  threshold?: number;
  /** Count antialiasing suspects as differences instead of skipping them. */
  includeAA?: boolean;
  /** Blend semi-transparent pixels against a checkerboard (true, pixelmatch's default) or white. */
  checkerboard?: boolean;
  /** Return the diff image: the first image in gray at alpha 0.1, red mismatches, yellow antialiasing. */
  output?: boolean;
};

export type PixelmatchDiff = {
  total: number;
  mismatched: number;
  fraction: number;
  output?: RgbaImage;
};

export function assertSameSize(a: RgbaImage, b: RgbaImage, label: string): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError(
      `${label}: sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height})`,
    );
  }
  const bytes = a.width * a.height * 4;
  if (a.data.length !== bytes || b.data.length !== bytes) {
    throw new RangeError(
      `${label}: buffers of ${a.data.length} and ${b.data.length} bytes for ${a.width}x${a.height}`,
    );
  }
}

/** pixelmatch views the bytes as Uint32, so a view with an odd byte offset is copied first. */
function aligned(data: Uint8Array): Uint8Array {
  return data.byteOffset % 4 === 0 ? data : new Uint8Array(data);
}

export function diffPixelmatchTypeScript(
  a: RgbaImage,
  b: RgbaImage,
  options: PixelmatchOptions = {},
): PixelmatchDiff {
  assertSameSize(a, b, 'diffPixelmatch');
  const total = a.width * a.height;
  const output = options.output ? new Uint8Array(total * 4) : undefined;
  const mismatched = pixelmatch(aligned(a.data), aligned(b.data), output, a.width, a.height, {
    threshold: options.threshold ?? 0.1,
    includeAA: options.includeAA ?? false,
    checkerboard: options.checkerboard ?? true,
  });
  const result: PixelmatchDiff = {
    total,
    mismatched,
    fraction: total === 0 ? 0 : mismatched / total,
  };
  if (output) result.output = { width: a.width, height: a.height, data: output };
  return result;
}

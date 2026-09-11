// Pixel access for the rendered rules (SPEC 7.7): the record's screenshot decoded once per record,
// with the sampling the rules share (ink coverage of a box, the dominant color of a box, a color
// at a point). A record's `image` is the PNG path relative to the render directory or absolute
// (SPEC 4.2, AGENTS.md contracts); the loader takes the render directory from the caller and
// falls back to the working directory and to the CLI's default `.turboslide/render`, so
// `turboslide lint all` from the repository root finds the last render without a flag.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import type { Box, RenderRecord } from '../contracts.ts';
import type { Rgb } from './palette.ts';
import { channelDistance } from './palette.ts';
import { decodePng } from './png.ts';
import type { Bitmap } from './png.ts';

export type { Bitmap } from './png.ts';

/**
 * What a caller can hand lintRecord besides the record: the decoded screenshot (null to say there
 * is none, so nothing is read from disk) and the directory relative record images resolve against.
 */
export type RenderedInputs = { bitmap?: Bitmap | null; renderDir?: string };

/** The CLI's default render directory under the repository root (apps/cli deck-files.ts derivedDir). */
export const DEFAULT_RENDER_DIR = '.turboslide/render';

/** The first existing path a record image can mean, or undefined. */
export function resolveRecordImage(image: string, renderDir?: string): string | undefined {
  if (!image) return undefined;
  if (isAbsolute(image)) return existsSync(image) ? image : undefined;
  const candidates = [
    ...(renderDir ? [resolve(renderDir, image)] : []),
    resolve(process.cwd(), image),
    resolve(process.cwd(), DEFAULT_RENDER_DIR, image),
  ];
  return candidates.find((path) => existsSync(path));
}

let last: { path: string; bitmap: Bitmap } | undefined;

/** The record's screenshot decoded, or null when the file is missing or not a PNG this codec reads. */
export function loadRecordBitmap(record: RenderRecord, renderDir?: string): Bitmap | null {
  const path = resolveRecordImage(record.image, renderDir);
  if (!path) return null;
  if (last && last.path === path) return last.bitmap;
  try {
    const bitmap = decodePng(new Uint8Array(readFileSync(path)));
    last = { path, bitmap };
    return bitmap;
  } catch {
    return null;
  }
}

/** A bitmap filled with one color, for tests and synthetic checks. */
export function solidBitmap(width: number, height: number, rgb: Rgb): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Paint a box in one color; coordinates outside the bitmap are clipped. */
export function fillBox(bitmap: Bitmap, box: Box, rgb: Rgb): void {
  const clipped = clipBox(bitmap, box);
  if (!clipped) return;
  const [x0, y0, w, h] = clipped;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * bitmap.width + x) * 4;
      bitmap.data[i] = rgb[0];
      bitmap.data[i + 1] = rgb[1];
      bitmap.data[i + 2] = rgb[2];
      bitmap.data[i + 3] = 255;
    }
  }
}

/** The color at a point; the alpha channel is ignored (sheet screenshots are opaque). */
export function colorAt(bitmap: Bitmap, x: number, y: number): Rgb {
  const i = (y * bitmap.width + x) * 4;
  return [bitmap.data[i] ?? 0, bitmap.data[i + 1] ?? 0, bitmap.data[i + 2] ?? 0];
}

/** The box clipped to the bitmap and rounded to whole pixels; null when nothing is left. */
export function clipBox(bitmap: Bitmap, box: Box): Box | null {
  const x0 = Math.max(0, Math.round(box[0]));
  const y0 = Math.max(0, Math.round(box[1]));
  const x1 = Math.min(bitmap.width, Math.round(box[0] + box[2]));
  const y1 = Math.min(bitmap.height, Math.round(box[1] + box[3]));
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}

/** True when a point lies inside one of the boxes. */
export function insideAny(boxes: readonly Box[], x: number, y: number): boolean {
  for (const [bx, by, bw, bh] of boxes) {
    if (x >= bx && x < bx + bw && y >= by && y < by + bh) return true;
  }
  return false;
}

/**
 * The share of a box's pixels that read as ink: farther than `tolerance` per channel from the
 * paper color. Hairlines count as ink; the plate ground and hair-soft rules do not (tokens.ts:
 * plate composites 9 and hair-soft 22 units from paper, hair 45).
 */
export function inkFraction(bitmap: Bitmap, box: Box, paper: Rgb, tolerance = 24): number {
  const clipped = clipBox(bitmap, box);
  if (!clipped) return 0;
  const [x0, y0, w, h] = clipped;
  let ink = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    let i = (y * bitmap.width + x0) * 4;
    for (let x = 0; x < w; x += 1, i += 4) {
      const d = Math.max(
        Math.abs((bitmap.data[i] ?? 0) - paper[0]),
        Math.abs((bitmap.data[i + 1] ?? 0) - paper[1]),
        Math.abs((bitmap.data[i + 2] ?? 0) - paper[2]),
      );
      if (d > tolerance) ink += 1;
    }
  }
  return ink / (w * h);
}

/**
 * The most frequent color inside a box, leaving out the pixels of the excluded boxes (images and
 * other rasters); undefined when no pixel is left. The ground of a text block is its dominant
 * color: paper, a plate, or the code panel.
 */
export function dominantColor(
  bitmap: Bitmap,
  box: Box,
  exclude: readonly Box[] = [],
): Rgb | undefined {
  const clipped = clipBox(bitmap, box);
  if (!clipped) return undefined;
  const [x0, y0, w, h] = clipped;
  const counts = new Map<number, number>();
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40_000)));
  for (let y = y0; y < y0 + h; y += step) {
    for (let x = x0; x < x0 + w; x += step) {
      if (exclude.length > 0 && insideAny(exclude, x, y)) continue;
      const i = (y * bitmap.width + x) * 4;
      const key =
        ((bitmap.data[i] ?? 0) << 16) |
        ((bitmap.data[i + 1] ?? 0) << 8) |
        (bitmap.data[i + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: number | undefined;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best === undefined) return undefined;
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

/** Whether two colors are the same within a per-channel tolerance. */
export function sameColor(a: Rgb, b: Rgb, tolerance: number): boolean {
  return channelDistance(a, b) <= tolerance;
}

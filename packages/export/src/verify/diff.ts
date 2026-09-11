// The pixel and per-block comparison of the verify loop (SPEC 8.5 step 3): pixelmatch at threshold
// 0.1 between the Turboslide render and the page LibreOffice produced from the exported file, and
// per block the offset of the ink bounding box, so the report says where a text box or a hairline
// landed, not only how many pixels differ.
//
// Ink is measured past a cut on the line from the region's background to the block's ink color
// (budgets.ts INK_CUT, one third of the way; the ink color is the farther of the recorded text
// color and the reference's farthest color inside the block's box), not at a fixed distance from
// the background. Measured on the deck's native export (M2 review, docs/M2-STATUS.md): the
// lightest hairlines of a diagram sit about 45 channel units from the paper and LibreOffice
// resamples the 2x raster so they land on two rows at half that, so a fixed tolerance of 40
// counted them in the reference and not in the page and reported dy 33 on a block that was within
// 1 px; the cut at a third of the ink (about 83 units on paper) leaves the fringe and the hairlines
// out of both boxes and keeps muted text in, and every block on the same pages measured within
// 1 px. When another block's box overlaps the 6 px search ring the search is clamped to the block's
// own box, so a neighbour's ink never enters the measurement.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import pixelmatch from 'pixelmatch';

import { decodeImage, encodePngRgba } from '@turboslide/effects/io';
import type { Box } from '@turboslide/schema/render';

import { parseCssColor } from '../units.ts';
import {
  EDGE_TOLERANCE,
  INK_CUT,
  MIN_INK_CONTRAST,
  blockKind,
  budgetFor,
  withinBudget,
} from './budgets.ts';
import type { BlockKind, Budgets } from './budgets.ts';
import { DEFAULT_BUDGETS } from './budgets.ts';

/** RGBA, row major (the effects package's RgbaImage). */
export type Png = { width: number; height: number; data: Uint8Array };

/** Decodes a PNG (or JPEG) file to RGBA through the effects package's sharp boundary. */
export async function readPng(path: string): Promise<Png> {
  return decodeImage(path);
}

export async function writePng(path: string, image: Png): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await encodePngRgba(image));
}

export type ImageDiff = { mismatch: number; total: number; fraction: number; diff: Png };

/** pixelmatch over two images of the same size; throws RangeError when the sizes differ. */
export function diffImages(ref: Png, got: Png, threshold = DEFAULT_BUDGETS.threshold): ImageDiff {
  if (ref.width !== got.width || ref.height !== got.height) {
    throw new RangeError(
      `verify: sizes differ, reference ${ref.width}x${ref.height} and export ${got.width}x${got.height}`,
    );
  }
  const diff = new Uint8Array(ref.width * ref.height * 4);
  const mismatch = pixelmatch(ref.data, got.data, diff, ref.width, ref.height, { threshold });
  const total = ref.width * ref.height;
  return {
    mismatch,
    total,
    fraction: total === 0 ? 0 : mismatch / total,
    diff: { width: ref.width, height: ref.height, data: diff },
  };
}

/** The pixels of `box` (clamped to the image) as their own image; null when nothing remains. */
export function cropPng(image: Png, box: Box): Png | null {
  const region = clampBox(box, image.width, image.height);
  if (!region) return null;
  const [x0, y0, w, h] = region;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const src = ((y0 + y) * image.width + x0) * 4;
    data.set(image.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

export type MaskedImageDiff = ImageDiff & {
  /** The mismatches and pixel count inside the regions, removed from the outer numbers. */
  inside: { mismatch: number; total: number };
};

/**
 * diffImages over the whole image, then the mismatched pixels inside `regions` (pixelmatch paints
 * them in its diff color, exactly [255, 0, 0]; antialiasing suspects are yellow and never counted)
 * are taken out of `mismatch`, `total` and `fraction`, so the fraction covers the pixels outside
 * the regions and `inside` reports the regions. The diff image still shows everything.
 */
export function diffImagesOutside(
  ref: Png,
  got: Png,
  regions: readonly Box[],
  threshold = DEFAULT_BUDGETS.threshold,
): MaskedImageDiff {
  const whole = diffImages(ref, got, threshold);
  if (regions.length === 0) return { ...whole, inside: { mismatch: 0, total: 0 } };
  const mask = new Uint8Array(ref.width * ref.height);
  let insideTotal = 0;
  for (const box of regions) {
    const r = clampBox(box, ref.width, ref.height);
    if (!r) continue;
    for (let y = r[1]; y < r[1] + r[3]; y += 1) {
      for (let x = r[0]; x < r[0] + r[2]; x += 1) {
        const i = y * ref.width + x;
        if (mask[i] === 0) {
          mask[i] = 1;
          insideTotal += 1;
        }
      }
    }
  }
  let insideMismatch = 0;
  const d = whole.diff.data;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 1 && d[i * 4] === 255 && d[i * 4 + 1] === 0 && d[i * 4 + 2] === 0)
      insideMismatch += 1;
  }
  const mismatch = whole.mismatch - insideMismatch;
  const total = whole.total - insideTotal;
  return {
    mismatch,
    total,
    fraction: total === 0 ? 0 : mismatch / total,
    diff: whole.diff,
    inside: { mismatch: insideMismatch, total: insideTotal },
  };
}

export type Rgb = [number, number, number];

/** A box clamped to the image, in integer pixels; null when nothing remains. */
export function clampBox(box: Box, width: number, height: number, margin = 0): Box | null {
  const x0 = Math.max(0, Math.floor(box[0] - margin));
  const y0 = Math.max(0, Math.floor(box[1] - margin));
  const x1 = Math.min(width, Math.ceil(box[0] + box[2] + margin));
  const y1 = Math.min(height, Math.ceil(box[1] + box[3] + margin));
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}

/** True when two boxes share at least one pixel. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

function isBox(value: Box | readonly Box[]): value is Box {
  return typeof value[0] === 'number';
}

function inside(x: number, y: number, box: Box): boolean {
  return x >= box[0] && x < box[0] + box[2] && y >= box[1] && y < box[1] + box[3];
}

/**
 * The most frequent color inside a region, skipping the pixels of `exclude` (one box or several):
 * the region's background. compareBlock passes the block's own box and its neighbours' boxes, so
 * the background is read from the margin ring around the block and a dense block (a full-width
 * heading, a picture) cannot make its own ink the mode.
 */
export function modeColor(image: Png, region: Box, exclude?: Box | readonly Box[] | null): Rgb {
  const excluded: readonly Box[] = exclude == null ? [] : isBox(exclude) ? [exclude] : exclude;
  const counts = new Map<number, number>();
  const [x0, y0, w, h] = region;
  let counted = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (excluded.some((box) => inside(x, y, box))) continue;
      const p = (y * image.width + x) * 4;
      const key =
        ((image.data[p] ?? 0) << 16) | ((image.data[p + 1] ?? 0) << 8) | (image.data[p + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      counted += 1;
    }
  }
  // a block that fills the whole image leaves no ring: fall back to the region itself
  if (counted === 0 && excluded.length > 0) return modeColor(image, region, null);
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

/** The largest channel difference between two colors. */
export function contrast(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** Decides whether a pixel counts as ink. */
export type InkTest = (r: number, g: number, b: number) => boolean;

/** A pixel counts as ink when any channel is more than `tolerance` from the background. */
export function toleranceInk(background: Rgb, tolerance: number): InkTest {
  return (r, g, b) =>
    Math.abs(r - background[0]) > tolerance ||
    Math.abs(g - background[1]) > tolerance ||
    Math.abs(b - background[2]) > tolerance;
}

/**
 * A pixel counts as ink when its projection on the line from the background to the ink color lies
 * at or past `fraction` of the way (INK_CUT): glyph pixels, muted text and strokes count, the
 * antialiased fringe and any lighter stroke (a hairline at 18 percent alpha next to text) do not,
 * in both images alike. Works for ink on paper and for paper on ink.
 */
export function inkPast(background: Rgb, ink: Rgb, fraction: number = INK_CUT): InkTest {
  const d0 = ink[0] - background[0];
  const d1 = ink[1] - background[1];
  const d2 = ink[2] - background[2];
  const length2 = d0 * d0 + d1 * d1 + d2 * d2;
  if (length2 === 0) return () => false;
  const cut = length2 * fraction;
  return (r, g, b) =>
    (r - background[0]) * d0 + (g - background[1]) * d1 + (b - background[2]) * d2 >= cut;
}

/**
 * The color inside `region` farthest from `background`: a block's darkest stroke on paper, its
 * brightest on ink. Returns the background itself when the region is blank.
 */
export function farthestColor(image: Png, region: Box, background: Rgb): Rgb {
  const [x0, y0, w, h] = region;
  let best: Rgb = background;
  let bestDistance = -1;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const p = (y * image.width + x) * 4;
      const r = image.data[p] ?? 0;
      const g = image.data[p + 1] ?? 0;
      const b = image.data[p + 2] ?? 0;
      const distance =
        (r - background[0]) ** 2 + (g - background[1]) ** 2 + (b - background[2]) ** 2;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [r, g, b];
      }
    }
  }
  return best;
}

/** A CSS color (rgb(), rgba(), #hex) composited over the background, or null when unparsable. */
export function cssColorOn(value: string, background: Rgb): Rgb | null {
  const parsed = parseCssColor(value);
  if (!/^[0-9A-F]{6}$/.test(parsed.hex)) return null;
  const rgb = [0, 2, 4].map((i) => parseInt(parsed.hex.slice(i, i + 2), 16)) as Rgb;
  if (parsed.alpha >= 1) return rgb;
  return rgb.map((c, i) =>
    Math.round((background[i] ?? 0) + (c - (background[i] ?? 0)) * parsed.alpha),
  ) as Rgb;
}

/**
 * The bounding box of the pixels inside `region` that count as ink against `background`: with a
 * number, any channel more than that far from the background (the pptx report's ink box); with an
 * InkTest, the test's verdict. Null when the region is blank.
 */
export function inkBox(
  image: Png,
  region: Box,
  background: Rgb,
  test: number | InkTest = 40,
): Box | null {
  const isInk = typeof test === 'number' ? toleranceInk(background, test) : test;
  const [x0, y0, w, h] = region;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const p = (y * image.width + x) * 4;
      if (!isInk(image.data[p] ?? 0, image.data[p + 1] ?? 0, image.data[p + 2] ?? 0)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

export type BlockDelta = {
  blockId: string;
  kind: BlockKind;
  /** got minus reference, in sheet pixels; 0 when both regions are blank. */
  dx: number;
  dy: number;
  dw: number;
  ok: boolean;
  refInk: Box | null;
  gotInk: Box | null;
  background: Rgb;
  /** The ink color the cut was measured toward; null when the reference region was blank. */
  ink: Rgb | null;
  /** How the boxes were found: ink past the cut, or the edge of an opaque picture (EDGE_TOLERANCE). */
  measure: 'cut' | 'edge';
  /** True when a neighbouring block overlapped the search ring and the search was clamped to the block's box. */
  clamped: boolean;
  /** The exported shape's box read back from the file (report.ts), when the caller had one. */
  shape: Box | null;
};

export type BlockToCompare = {
  blockId: string;
  type: string;
  box: Box;
  /** The recorded text color of the block (RenderRecord.blocks[].color), a candidate ink end for text. */
  color?: string;
  /** The other blocks' boxes on the slide; one overlapping the margin ring clamps the search to the block's own box. */
  neighbours?: readonly Box[];
  /** True when the block's rasters include an opaque picture (a shot or html raster): measured on its edge. */
  opaque?: boolean;
  /** The union box of the shapes named after the block in the exported file, in image pixels. */
  shape?: Box | null;
};

/** How far around a block box the ink search looks, so a shifted line is still found. */
export const BLOCK_MARGIN_PX = 6;

/**
 * The ink end of the cut for a block: the farther from the background of the recorded text color
 * (text kinds; the record carries the first text node's color, which may be a muted label in a
 * block that also holds ink) and the reference's farthest color inside the block's own box (a
 * raster's darkest stroke, or the text color the record did not carry), so the cut is measured
 * against the strongest ink the block has. Null when neither contrasts with the background by
 * MIN_INK_CONTRAST.
 */
export function blockInkColor(
  ref: Png,
  block: BlockToCompare,
  own: Box,
  background: Rgb,
  kind: BlockKind,
): Rgb | null {
  const candidates: Rgb[] = [farthestColor(ref, own, background)];
  if (kind === 'text' && block.color !== undefined) {
    const recorded = cssColorOn(block.color, background);
    if (recorded) candidates.push(recorded);
  }
  const best = candidates.reduce((a, b) =>
    contrast(b, background) > contrast(a, background) ? b : a,
  );
  return contrast(best, background) >= MIN_INK_CONTRAST ? best : null;
}

/**
 * Compares one block: the reference decides the background (the mode color of the margin ring
 * around the block's box, the neighbours' boxes left out), both images give an ink box past the
 * INK_CUT from that background toward the block's ink color (or, for an opaque picture, the box
 * of everything more than EDGE_TOLERANCE from the background) inside the box widened by
 * BLOCK_MARGIN_PX (the box itself when a neighbour overlaps the ring), and the deltas are checked
 * against the budget of the block's kind. A block whose reference region is blank passes with zero
 * deltas; a block present in one image only fails with dw set to the missing width.
 */
export function compareBlock(
  ref: Png,
  got: Png,
  block: BlockToCompare,
  budgets: Budgets = DEFAULT_BUDGETS,
): BlockDelta {
  const kind = blockKind(block.type);
  const shape = block.shape ?? null;
  const own = clampBox(block.box, ref.width, ref.height);
  const widened = clampBox(block.box, ref.width, ref.height, BLOCK_MARGIN_PX);
  const measure: BlockDelta['measure'] = block.opaque ? 'edge' : 'cut';
  const base = {
    blockId: block.blockId,
    kind,
    refInk: null,
    gotInk: null,
    background: [0, 0, 0] as Rgb,
    ink: null,
    measure,
    clamped: false,
    shape,
  };
  if (!own || !widened) return { ...base, dx: 0, dy: 0, dw: 0, ok: true };
  const neighbours = (block.neighbours ?? [])
    .map((box) => clampBox(box, ref.width, ref.height))
    .filter((box): box is Box => box !== null);
  const clamped = neighbours.some((box) => boxesIntersect(box, widened));
  const region = clamped ? own : widened;
  const background = modeColor(ref, widened, [own, ...neighbours]);
  const ink = measure === 'edge' ? null : blockInkColor(ref, block, own, background, kind);
  const test: InkTest = ink ? inkPast(background, ink) : toleranceInk(background, EDGE_TOLERANCE);
  const refInk = inkBox(ref, region, background, test);
  const gotInk = inkBox(got, region, background, test);
  const measured = { ...base, background, ink, clamped, refInk, gotInk };
  if (!refInk && !gotInk) return { ...measured, dx: 0, dy: 0, dw: 0, ok: true };
  if (!refInk || !gotInk) {
    return {
      ...measured,
      dx: 0,
      dy: 0,
      dw: gotInk ? gotInk[2] : -(refInk?.[2] ?? 0),
      ok: false,
    };
  }
  const delta = { dx: gotInk[0] - refInk[0], dy: gotInk[1] - refInk[1], dw: gotInk[2] - refInk[2] };
  return { ...measured, ...delta, ok: withinBudget(delta, budgetFor(kind, budgets)) };
}

/** The mismatched fraction inside one box, from a pixelmatch diff image (red pixels). */
export function fractionInBox(diff: Png, box: Box): number {
  const region = clampBox(box, diff.width, diff.height);
  if (!region) return 0;
  const [x0, y0, w, h] = region;
  let mismatched = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const p = (y * diff.width + x) * 4;
      // pixelmatch paints a mismatch red (255, 0, 0) and antialiasing yellow; both count here
      if ((diff.data[p] ?? 0) === 255 && (diff.data[p + 2] ?? 0) === 0) mismatched += 1;
    }
  }
  return mismatched / (w * h);
}

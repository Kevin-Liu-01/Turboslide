// Crop mode on a picture object or a shot (gslides-parity SPEC-2 6.1 row 19, 6.2, 0.88, R05 B11):
// the picture shows at its full extent dimmed outside the frame, eight black handles drag the
// frame's edges over the fixed picture, a drag inside pans the picture under the frame, and
// Enter, Esc or a click outside commit one write of `trim` (fractions of the picture trimmed from
// each side, SPEC-2 2.5.1) with the frame's new box. Pure over sheet pixels; crop.test.ts pins it.
import type { ShotTrim } from '@turboslide/schema/blocks';
import type { Box } from '@turboslide/schema/render';

import type { ResizeDir } from './snap';

export const NO_TRIM: ShotTrim = { left: 0, right: 0, top: 0, bottom: 0 };

/** The narrowest frame a crop handle can leave, in sheet pixels. */
export const CROP_MIN_PX = 16;

/** A trim with every side in [0, 1) and the two sides of an axis under 1, rounded to four places. */
export function normalizeTrim(trim: ShotTrim): ShotTrim {
  const clamp = (value: number) => Math.min(0.9999, Math.max(0, Math.round(value * 10000) / 10000));
  let left = clamp(trim.left);
  let right = clamp(trim.right);
  let top = clamp(trim.top);
  let bottom = clamp(trim.bottom);
  if (left + right >= 1) {
    const scale = 0.9999 / (left + right);
    left *= scale;
    right *= scale;
  }
  if (top + bottom >= 1) {
    const scale = 0.9999 / (top + bottom);
    top *= scale;
    bottom *= scale;
  }
  return { left, right, top, bottom };
}

/** True when the trim cuts nothing: the field can leave the block. */
export function isNoTrim(trim: ShotTrim): boolean {
  return trim.left === 0 && trim.right === 0 && trim.top === 0 && trim.bottom === 0;
}

/**
 * The full extent of the picture behind a frame: the frame shows the region of the picture from
 * `left` to `1 - right` across and `top` to `1 - bottom` down, so the picture's whole box is the
 * frame scaled up by the untrimmed fraction and moved back by the trimmed one.
 */
export function fullExtent(frame: Box, trim: ShotTrim): Box {
  const [x, y, w, h] = frame;
  const spanX = Math.max(1e-6, 1 - trim.left - trim.right);
  const spanY = Math.max(1e-6, 1 - trim.top - trim.bottom);
  const fullW = w / spanX;
  const fullH = h / spanY;
  return [x - trim.left * fullW, y - trim.top * fullH, fullW, fullH];
}

/** The trim that shows exactly `frame` of a picture whose full extent is `full`. */
export function trimFor(full: Box, frame: Box): ShotTrim {
  const [fx, fy, fw, fh] = full;
  const [x, y, w, h] = frame;
  return normalizeTrim({
    left: (x - fx) / fw,
    right: (fx + fw - (x + w)) / fw,
    top: (y - fy) / fh,
    bottom: (fy + fh - (y + h)) / fh,
  });
}

function has(dir: ResizeDir, edge: 'n' | 's' | 'e' | 'w'): boolean {
  return dir.includes(edge);
}

/**
 * A crop handle dragged by (dx, dy): the frame's moving edges follow the pointer inside the
 * picture's full extent (a crop never grows past the picture), the opposite edges hold, the frame
 * never drops under CROP_MIN_PX, and the trim is what shows of the fixed picture in the new frame.
 */
export function cropByHandle(
  frame: Box,
  trim: ShotTrim,
  dir: ResizeDir,
  dx: number,
  dy: number,
): { frame: Box; trim: ShotTrim } {
  const full = fullExtent(frame, trim);
  const [fx, fy, fw, fh] = full;
  let left = frame[0];
  let right = frame[0] + frame[2];
  let top = frame[1];
  let bottom = frame[1] + frame[3];
  if (has(dir, 'w')) left = Math.min(right - CROP_MIN_PX, Math.max(fx, left + dx));
  if (has(dir, 'e')) right = Math.max(left + CROP_MIN_PX, Math.min(fx + fw, right + dx));
  if (has(dir, 'n')) top = Math.min(bottom - CROP_MIN_PX, Math.max(fy, top + dy));
  if (has(dir, 's')) bottom = Math.max(top + CROP_MIN_PX, Math.min(fy + fh, bottom + dy));
  const next: Box = [
    Math.round(left),
    Math.round(top),
    Math.round(right - left),
    Math.round(bottom - top),
  ];
  return { frame: next, trim: trimFor(full, next) };
}

/**
 * A drag inside the frame pans the picture under it by (dx, dy): the frame stays, the picture's
 * full extent moves, and the trim follows; the picture never leaves a gap inside the frame (the
 * pan stops at the picture's edges).
 */
export function panCrop(frame: Box, trim: ShotTrim, dx: number, dy: number): ShotTrim {
  const [fx, fy, fw, fh] = fullExtent(frame, trim);
  const [x, y, w, h] = frame;
  const minX = x + w - fw;
  const maxX = x;
  const minY = y + h - fh;
  const maxY = y;
  const nx = Math.min(maxX, Math.max(minX, fx + dx));
  const ny = Math.min(maxY, Math.max(minY, fy + dy));
  return trimFor([nx, ny, fw, fh], frame);
}

/** The eight crop handles on the frame's edges and corners, as sheet boxes of `size`, in the overlay's order. */
export function cropHandleBoxes(
  frame: Box,
  size: number,
): ReadonlyArray<{ dir: ResizeDir; box: Box }> {
  const [x, y, w, h] = frame;
  const at = (cx: number, cy: number): Box => [cx - size / 2, cy - size / 2, size, size];
  return [
    { dir: 'nw', box: at(x, y) },
    { dir: 'n', box: at(x + w / 2, y) },
    { dir: 'ne', box: at(x + w, y) },
    { dir: 'e', box: at(x + w, y + h / 2) },
    { dir: 'se', box: at(x + w, y + h) },
    { dir: 's', box: at(x + w / 2, y + h) },
    { dir: 'sw', box: at(x, y + h) },
    { dir: 'w', box: at(x, y + h / 2) },
  ];
}

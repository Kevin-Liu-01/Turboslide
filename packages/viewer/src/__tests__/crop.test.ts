import { describe, expect, it } from 'vitest';

import {
  CROP_MIN_PX,
  cropByHandle,
  cropHandleBoxes,
  fullExtent,
  isNoTrim,
  NO_TRIM,
  normalizeTrim,
  panCrop,
  trimFor,
} from '../crop';

// Crop mode (gslides-parity SPEC-2 6.1 row 19): the frame over the fixed picture, the trim from
// handle drags and pans.

describe('the picture behind the frame', () => {
  it('is the frame itself with no trim, and scaled back by the trimmed fractions otherwise', () => {
    expect(fullExtent([100, 100, 400, 200], NO_TRIM)).toEqual([100, 100, 400, 200]);
    /* a quarter trimmed left and right: the frame shows the middle half, so the picture is twice as wide */
    expect(
      fullExtent([100, 100, 400, 200], { left: 0.25, right: 0.25, top: 0, bottom: 0 }),
    ).toEqual([-100, 100, 800, 200]);
    expect(trimFor([-100, 100, 800, 200], [100, 100, 400, 200])).toEqual({
      left: 0.25,
      right: 0.25,
      top: 0,
      bottom: 0,
    });
  });

  it('normalizes a trim into [0, 1) with the two sides of an axis under one', () => {
    expect(normalizeTrim({ left: -0.1, right: 0.12345, top: 0, bottom: 0 })).toEqual({
      left: 0,
      right: 0.1235,
      top: 0,
      bottom: 0,
    });
    const squeezed = normalizeTrim({ left: 0.6, right: 0.6, top: 0, bottom: 0 });
    expect(squeezed.left + squeezed.right).toBeLessThan(1);
    expect(isNoTrim(NO_TRIM)).toBe(true);
    expect(isNoTrim({ left: 0.1, right: 0, top: 0, bottom: 0 })).toBe(false);
  });
});

describe('the handles', () => {
  it('moves the dragged edge inside the picture, holds the others and writes the trim that shows the new frame', () => {
    const frame: [number, number, number, number] = [100, 100, 400, 200];
    const east = cropByHandle(frame, NO_TRIM, 'e', -100, 0);
    expect(east.frame).toEqual([100, 100, 300, 200]);
    expect(east.trim).toEqual({ left: 0, right: 0.25, top: 0, bottom: 0 });
    /* a crop never grows past the picture: dragging the east edge outwards holds at the picture's edge */
    expect(cropByHandle(frame, NO_TRIM, 'e', 80, 0).frame).toEqual(frame);
    const corner = cropByHandle(frame, NO_TRIM, 'nw', 100, 50);
    expect(corner.frame).toEqual([200, 150, 300, 150]);
    expect(corner.trim).toEqual({ left: 0.25, right: 0, top: 0.25, bottom: 0 });
    /* never under the minimum */
    const tiny = cropByHandle(frame, NO_TRIM, 'w', 1000, 0);
    expect(tiny.frame[2]).toBe(CROP_MIN_PX);
  });

  it('pans the picture under the frame and stops at the picture’s edges', () => {
    const frame: [number, number, number, number] = [100, 100, 400, 200];
    const trim = { left: 0.25, right: 0.25, top: 0, bottom: 0 };
    /* the picture is 800 wide at x -100; moving it right by 100 shows more of its left */
    expect(panCrop(frame, trim, 100, 0)).toEqual({ left: 0.125, right: 0.375, top: 0, bottom: 0 });
    expect(panCrop(frame, trim, 1000, 0)).toEqual({ left: 0, right: 0.5, top: 0, bottom: 0 });
    expect(panCrop(frame, NO_TRIM, 50, 50)).toEqual(NO_TRIM);
  });

  it('places the eight handles on the frame’s corners and edges', () => {
    const handles = cropHandleBoxes([100, 100, 400, 200], 11);
    expect(handles.map((h) => h.dir)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    const se = handles.find((h) => h.dir === 'se');
    expect(se && [se.box[0] + 5.5, se.box[1] + 5.5]).toEqual([500, 300]);
  });
});

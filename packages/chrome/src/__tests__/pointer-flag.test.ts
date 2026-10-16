import { describe, expect, it } from 'vitest';

import { COLLAB_GEOMETRY } from '@turboslide/render/collab';
import { SHEET_WIDTH } from '@turboslide/schema/render';

import { pointerFlagLeft } from '../presence/RemoteCursors';

// A remote pointer's name flag sits at the tip's right and moves to its left when it would run
// past the sheet's right edge, so the name stays whole on a phone's 330 px sheet.

const { flag, pointer } = COLLAB_GEOMETRY;

describe('pointerFlagLeft', () => {
  it('keeps the flag at the tip right while it fits on the sheet', () => {
    const k = 0.45;
    expect(pointerFlagLeft(0, k)).toBe(pointer.flagOffset.x);
    const last = SHEET_WIDTH * k - pointer.flagOffset.x - flag.width;
    expect(pointerFlagLeft(last, k)).toBe(pointer.flagOffset.x);
  });

  it('moves the flag to the tip left once it would pass the right edge', () => {
    const k = 0.45;
    const past = SHEET_WIDTH * k - pointer.flagOffset.x - flag.width + 1;
    expect(pointerFlagLeft(past, k)).toBe(-flag.width - 2);
  });

  it('on a phone sheet a pointer past the middle keeps its whole flag on the sheet', () => {
    const k = 330 / SHEET_WIDTH;
    for (const sheetX of [900, 1200, 1580]) {
      const tip = sheetX * k;
      const left = tip + pointerFlagLeft(tip, k);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + flag.width).toBeLessThanOrEqual(SHEET_WIDTH * k);
    }
  });
});

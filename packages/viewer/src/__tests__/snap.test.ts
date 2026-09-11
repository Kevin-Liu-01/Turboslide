import { describe, expect, it } from 'vitest';

import { ROWS_KEY_SNAP } from '@turboslide/schema/blocks';
import { COLUMNS } from '@turboslide/theme/tokens';

import {
  nearest,
  plateSideFor,
  snapKey,
  snapPlateWidth,
  snapRatio,
  snapScaleValue,
  snapShotWidth,
  stepInSet,
  stepRatio,
} from '../snap';

// The snap tables of SPEC 6.4: every drag lands on a value the grammar has a property for.
describe('snapKey', () => {
  it('snaps the key edge to the rows key set', () => {
    expect(snapKey(232)).toBe(240);
    expect(snapKey(200)).toBe(200);
    expect(snapKey(212)).toBe(220);
    expect(snapKey(10)).toBe(90);
    expect(snapKey(1000)).toBe(300);
  });

  it('resolves a tie upward and only ever returns a member of the set', () => {
    expect(snapKey(105)).toBe(120);
    for (let px = 0; px <= 400; px += 7) expect(ROWS_KEY_SNAP).toContain(snapKey(px));
  });
});

describe('snapRatio', () => {
  it('takes a named ratio within 12 px of its seam', () => {
    expect(snapRatio(COLUMNS['5/7'][0] + 3)).toBe('5/7');
    expect(snapRatio(COLUMNS['4/8'][0] - 11)).toBe('4/8');
    expect(snapRatio(COLUMNS['1/1'][0] + 12)).toBe('1/1');
  });

  it('moves in 10 px steps as a fixed left column otherwise', () => {
    expect(snapRatio(603)).toEqual({ left: 600 });
    expect(snapRatio(566)).toEqual({ left: 570 });
    expect(snapRatio(800)).toEqual({ left: 800 });
  });

  it('keeps both columns at least 200 px', () => {
    expect(snapRatio(50)).toEqual({ left: 200 });
    // 1326 - 72 - 200 is 1054; the 10 px step lands one step inside the floor
    expect(snapRatio(1300)).toEqual({ left: 1050 });
  });

  it('steps off a named ratio and back onto one from the keyboard', () => {
    expect(stepRatio('5/7', -1)).toEqual({ left: 500 });
    expect(stepRatio({ left: 500 }, -1)).toEqual({ left: 490 });
    expect(stepRatio({ left: 430 }, -1)).toBe('4/8');
    expect(stepRatio('1/1', 1)).toEqual({ left: 650 });
  });
});

describe('snapPlateWidth', () => {
  it('snaps to the plate widths the schema accepts', () => {
    expect(snapPlateWidth(700)).toBe(720);
    expect(snapPlateWidth(500)).toBe(560);
    expect(snapPlateWidth(900)).toBe(740);
    expect(snapPlateWidth(640)).toBe(720);
  });

  it('flips a plate by the half of the sheet the pointer is on', () => {
    expect(plateSideFor('opener', 200)).toBe('lower-left');
    expect(plateSideFor('opener', 1200)).toBe('lower-right');
    expect(plateSideFor('mood', 1200)).toBe('lower-right');
    expect(plateSideFor('closing', 200)).toBe('upper-left');
    expect(plateSideFor('closing', 1400)).toBe('lower-right');
  });
});

describe('snapShotWidth', () => {
  const slotW = COLUMNS['5/7'][1];
  it('snaps to the column width, 425 and the slot height', () => {
    expect(snapShotWidth(430, slotW, 642)).toBe(425);
    expect(snapShotWidth(650, slotW, 642)).toBe(642);
    expect(snapShotWidth(725, slotW, 642)).toBe(slotW);
  });

  it('rounds to whole pixels between the snaps and clamps to the slot', () => {
    expect(snapShotWidth(500.4, slotW, 642)).toBe(500);
    expect(snapShotWidth(50, slotW, 642)).toBe(120);
    expect(snapShotWidth(2000, slotW, 642)).toBe(slotW);
  });
});

describe('sets', () => {
  it('reads a scales marker as an integer 0 to 100', () => {
    expect(snapScaleValue(0.62)).toBe(62);
    expect(snapScaleValue(-0.2)).toBe(0);
    expect(snapScaleValue(1.4)).toBe(100);
  });

  it('steps through a set from any value and clamps at the ends', () => {
    expect(stepInSet(ROWS_KEY_SNAP, 200, 1)).toBe(220);
    expect(stepInSet(ROWS_KEY_SNAP, 200, -1)).toBe(190);
    expect(stepInSet(ROWS_KEY_SNAP, 300, 1)).toBe(300);
    expect(stepInSet(ROWS_KEY_SNAP, 95, 1)).toBe(120);
    expect(nearest([1, 2, 3], 2.5)).toBe(3);
  });
});

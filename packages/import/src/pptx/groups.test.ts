// The group arithmetic (gslides-parity SPEC-5 0.48, 5.1; R04 4, 5.9): a member's box through the
// child space, the group's rotation and flips composed into the member, the identity of the
// exporter's own groups (`chOff = off`, `chExt = ext`), and the path a nested group writes. The
// whole walk is exercised by fixture 02's third slide in fixtures.test.ts.
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE } from '@turboslide/schema/render';

import { childSpace, composeGroup, groupCentre, mapThroughSpace } from './groups.ts';
import { sheetMapping } from './units.ts';

const mapping = sheetMapping({ cx: 12_192_000, cy: 6_858_000 }, 'match', DEFAULT_PAGE);

describe('mapThroughSpace', () => {
  it('is the identity for a group whose child space equals its box', () => {
    const space = childSpace({
      off: [914_400, 914_400],
      ext: [1_828_800, 914_400],
      chOff: [914_400, 914_400],
      chExt: [1_828_800, 914_400],
      rot: 0,
      flipH: false,
      flipV: false,
    });
    const pos = { x: 200, y: 150, w: 100, h: 50 };
    expect(mapThroughSpace(pos, space!, mapping)).toEqual(pos);
  });

  it('scales and offsets a child drawn in a smaller child space', () => {
    // the group's box is twice its child space and sits 120 px right of it
    const space = childSpace({
      off: [1_828_800, 0],
      ext: [3_657_600, 1_828_800],
      chOff: [914_400, 0],
      chExt: [1_828_800, 914_400],
      rot: 0,
      flipH: false,
      flipV: false,
    });
    // a child at chOff (120 px, 0) of 60 by 30 px in child units
    const pos = { x: 120, y: 0, w: 60, h: 30 };
    expect(mapThroughSpace(pos, space!, mapping)).toEqual({ x: 240, y: 0, w: 120, h: 60 });
  });
});

describe('composeGroup', () => {
  it('rotates the member’s centre about the group’s centre and adds the angle', () => {
    const pos = { x: 100, y: 100, w: 100, h: 100 };
    const out = composeGroup(pos, { cx: 300, cy: 150, rotate: 90, flipH: false, flipV: false });
    // the centre (150, 150) turns 90 degrees clockwise about (300, 150) to (300, 0)
    expect(out.x).toBeCloseTo(250, 5);
    expect(out.y).toBeCloseTo(-50, 5);
    expect(out.rotate).toBe(90);
  });

  it('mirrors about the group’s centre and toggles the flip, negating the angle', () => {
    const pos = { x: 0, y: 0, w: 100, h: 50, rotate: 30 };
    const out = composeGroup(pos, { cx: 200, cy: 100, rotate: 0, flipH: true, flipV: false });
    expect(out.x).toBe(300);
    expect(out.y).toBe(0);
    expect(out.flip).toBe('h');
    expect(out.rotate).toBe(330);
    const back = composeGroup(out, { cx: 200, cy: 100, rotate: 0, flipH: true, flipV: false });
    expect(back.flip).toBeUndefined();
    expect(back.rotate).toBe(30);
    expect(back.x).toBe(0);
  });

  it('leaves a member alone when the group has no rotation and no flip', () => {
    const pos = { x: 10, y: 20, w: 30, h: 40 };
    expect(composeGroup(pos, { cx: 0, cy: 0, rotate: 0, flipH: false, flipV: false })).toEqual(pos);
  });
});

describe('groupCentre and childSpace', () => {
  it('reads the centre in sheet px and the identity child space when chOff and chExt are absent', () => {
    const space = childSpace({
      off: [762_000, 381_000],
      ext: [1_524_000, 762_000],
      rot: 1_800_000,
      flipH: true,
      flipV: false,
    });
    expect(space).toMatchObject({
      chOff: [762_000, 381_000],
      chExt: [1_524_000, 762_000],
      rotate: 30,
      flipH: true,
    });
    expect(groupCentre(space!, mapping)).toEqual({ cx: 200, cy: 100 });
    expect(childSpace(undefined)).toBeUndefined();
  });
});

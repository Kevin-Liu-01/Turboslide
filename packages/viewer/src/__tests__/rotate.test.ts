import { describe, expect, it } from 'vitest';

import type { ContentSlide } from '@turboslide/schema/deck';
import { boundingBox } from '@turboslide/schema/freeform';

import {
  angleAbout,
  flipMutations,
  objectTransform,
  rotatedCorners,
  rotateKeyDelta,
  rotateMutations,
  rotationFromDrag,
  snapAngle,
  unrotateDelta,
} from '../rotate';
import { boxSnapLines, snapMove } from '../snap';
import { marqueeHits } from '../Marquee';

// The rotation math of the canvas (gslides-parity SPEC-2 6.1 rows 11 and 12, 0.102, 0.107): the
// drag angle, the 15 degree Shift snap, the writes of a rotation and a flip, a group's member
// positions after a rotation, and the bounding box of a 37 degree box in the snap lines and the
// marquee.

const slide: ContentSlide = {
  schemaVersion: 1,
  id: 'r',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: {
    main: [
      { id: 'a', type: 'paragraph', text: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } },
      { id: 'b', type: 'paragraph', text: 'b', pos: { x: 600, y: 200, w: 300, h: 100, z: 1 } },
    ],
  },
};

describe('angles', () => {
  it('reads the pointer angle clockwise from the top and snaps to 15 degrees under Shift', () => {
    const centre = { x: 350, y: 250 };
    expect(angleAbout(centre, { x: 350, y: 0 })).toBe(0);
    expect(angleAbout(centre, { x: 700, y: 250 })).toBe(90);
    expect(angleAbout(centre, { x: 350, y: 500 })).toBe(180);
    expect(angleAbout(centre, { x: 0, y: 250 })).toBe(270);
    expect(snapAngle(37)).toBe(30);
    expect(snapAngle(38)).toBe(45);
    expect(snapAngle(359)).toBe(0);
  });

  it('adds the swept angle to the start angle, rounded to whole degrees, or snapped under Shift', () => {
    const centre = { x: 350, y: 250 };
    /* from the handle's rest position (above) a quarter turn clockwise */
    expect(rotationFromDrag(0, centre, { x: 350, y: 0 }, { x: 700, y: 250 })).toBe(90);
    expect(rotationFromDrag(350, centre, { x: 350, y: 0 }, { x: 700, y: 250 })).toBe(80);
    const raw = rotationFromDrag(0, centre, { x: 350, y: 0 }, { x: 600, y: 100 });
    expect(raw).toBe(59);
    expect(rotationFromDrag(0, centre, { x: 350, y: 0 }, { x: 600, y: 100 }, { shift: true })).toBe(
      60,
    );
  });

  it('steps 15 degrees by key and 1 with Shift, Left counter clockwise', () => {
    expect(rotateKeyDelta('left', false)).toBe(-15);
    expect(rotateKeyDelta('right', true)).toBe(1);
  });
});

describe('the writes', () => {
  it('writes one block.set /pos with the normalized angle and drops a zero', () => {
    const rows = [{ id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } }];
    expect(rotateMutations(slide, rows, { to: 37 })).toEqual([
      {
        op: 'block.set',
        slideId: 'r',
        blockId: 'a',
        path: '/pos',
        value: { x: 200, y: 200, w: 300, h: 100, z: 0, rotate: 37 },
      },
    ]);
    expect(rotateMutations(slide, rows, { by: 375 })[0]).toMatchObject({ value: { rotate: 15 } });
    expect(rotateMutations(slide, rows, { to: 360 })).toEqual([]);
    const turned = [{ id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0, rotate: 15 } }];
    expect(rotateMutations(slide, turned, { by: -15 })[0]).toMatchObject({
      value: { x: 200, y: 200, w: 300, h: 100, z: 0 },
    });
  });

  it('rotates a group about the union centre and moves the members with it (0.102)', () => {
    const rows = [
      { id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } },
      { id: 'b', pos: { x: 600, y: 200, w: 300, h: 100, z: 1 } },
    ];
    /* the union spans 200..900 by 200..300, centre 550, 250; a quarter turn puts a's centre (350,
       250) at (550, 50) and b's at (550, 450) */
    const out = rotateMutations(slide, rows, { by: 90 }, 'selection');
    expect(out.map((m) => (m.op === 'block.set' ? m.value : m))).toEqual([
      { x: 400, y: 0, w: 300, h: 100, z: 0, rotate: 90 },
      { x: 400, y: 400, w: 300, h: 100, z: 1, rotate: 90 },
    ]);
  });

  it('flips one object by toggling the axis and a group by mirroring about the union centre', () => {
    const rows = [{ id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } }];
    expect(flipMutations(slide, rows, 'h')[0]).toMatchObject({ value: { flip: 'h' } });
    const flipped = [
      { id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0, flip: 'h' as const } },
    ];
    expect(flipMutations(slide, flipped, 'v')[0]).toMatchObject({ value: { flip: 'hv' } });
    expect(flipMutations(slide, flipped, 'h')[0]).toMatchObject({
      value: { x: 200, y: 200, w: 300, h: 100, z: 0 },
    });
    const pair = [
      { id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } },
      { id: 'b', pos: { x: 600, y: 200, w: 300, h: 100, z: 1 } },
    ];
    const mirrored = flipMutations(slide, pair, 'h', 'selection');
    expect(mirrored.map((m) => (m.op === 'block.set' ? m.value : m))).toEqual([
      { x: 600, y: 200, w: 300, h: 100, z: 0, flip: 'h' },
      { x: 200, y: 200, w: 300, h: 100, z: 1, flip: 'h' },
    ]);
    /* a rotated member mirrors about the union of the bounding boxes (0.107) and its angle becomes 360 minus itself */
    const turned = [
      { id: 'a', pos: { x: 200, y: 200, w: 300, h: 100, z: 0, rotate: 30 } },
      { id: 'b', pos: { x: 600, y: 200, w: 300, h: 100, z: 1 } },
    ];
    const both = flipMutations(slide, turned, 'h', 'selection');
    expect(both[0]).toMatchObject({ value: { rotate: 330, flip: 'h' } });
    expect(both[1]).toMatchObject({ value: { flip: 'h' } });
  });
});

describe('geometry under rotation (0.107)', () => {
  const box = { x: 200, y: 200, w: 300, h: 100, rotate: 37 };

  it('draws the ring from pos and reads the bounding box for the snap lines and the marquee', () => {
    expect(objectTransform(box)).toBe('rotate(37deg)');
    expect(objectTransform({ ...box, flip: 'h' })).toBe('rotate(37deg) scale(-1, 1)');
    expect(objectTransform({ x: 0, y: 0, w: 1, h: 1 })).toBeUndefined();
    const corners = rotatedCorners(box);
    expect(corners).toHaveLength(4);
    const bounding = boundingBox(box);
    /* every rotated corner lies inside the bounding box */
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(bounding.x - 1e-6);
      expect(corner.x).toBeLessThanOrEqual(bounding.x + bounding.w + 1e-6);
      expect(corner.y).toBeGreaterThanOrEqual(bounding.y - 1e-6);
      expect(corner.y).toBeLessThanOrEqual(bounding.y + bounding.h + 1e-6);
    }
    expect(bounding.w).toBeCloseTo(
      300 * Math.cos((37 * Math.PI) / 180) + 100 * Math.sin((37 * Math.PI) / 180),
      6,
    );
    /* the snap lines of the bounding box, not the unrotated box */
    const lines = boxSnapLines([bounding.x, bounding.y, bounding.w, bounding.h]);
    expect(lines[0]?.at).toBeCloseTo(bounding.x, 6);
    const moving: [number, number, number, number] = [0, 0, 100, 50];
    const snapped = snapMove(moving, bounding.x + bounding.w - 100 + 3, 0, lines, { grid: false });
    expect(snapped.box[0]).toBe(Math.round(bounding.x + bounding.w - 100));
    /* the marquee crosses the bounding box where it would miss the unrotated box */
    const b = boundingBox(box);
    expect(marqueeHits([b.x - 10, b.y + 1, 15, 5], { a: [b.x, b.y, b.w, b.h] }, ['a'])).toEqual([
      'a',
    ]);
  });

  it('turns a resize delta back into the object’s own axes', () => {
    const { dx, dy } = unrotateDelta(0, 10, 90);
    expect(dx).toBeCloseTo(10, 6);
    expect(dy).toBeCloseTo(0, 6);
    expect(unrotateDelta(5, 7, 0)).toEqual({ dx: 5, dy: 7 });
  });
});

import { describe, expect, it } from 'vitest';

import { selectionRingBox } from '../selection-box';
import { TEXT_RING_OUTSET } from '../text-ring';

// The ring box of a selected object (docs/archive/rounds/OBJECTS.md 2.4, the rotated ring): a single object
// with `pos` takes its `pos` box, so a rotated object's ring is its own box turned by the overlay
// and never the measured bounding box turned a second time (audit a1-rectangle-rotate-17-up+400:
// a 1000 by 1000 ring around a 680 by 320 rectangle at 45 degrees); an object without `pos` keeps
// its measured box.

describe('selectionRingBox', () => {
  it('answers the pos box of a rotated single object, never its measured bounding box', () => {
    const rotated = {
      type: 'shape' as const,
      pos: { x: 460, y: 290, w: 680, h: 320, z: 1, rotate: 45 },
    };
    /* the measured box of the turned wrapper: the axis aligned bounding box, 707 by 707 */
    const measured: [number, number, number, number] = [446.4, 96.4, 707.1, 707.1];
    expect(selectionRingBox(rotated, measured)).toEqual([460, 290, 680, 320]);
  });

  it('answers the measured box of an unrotated object, which equals its pos box', () => {
    const upright = { type: 'shape' as const, pos: { x: 300, y: 200, w: 320, h: 240, z: 2 } };
    expect(selectionRingBox(upright, [300, 200, 320, 240])).toEqual([300, 200, 320, 240]);
    /* the pos box stands even while the measured box lags a frame behind the draft */
    expect(selectionRingBox(upright, [300, 200, 300, 220])).toEqual([300, 200, 320, 240]);
  });

  it('answers the measured box of a grammar field or a block without pos, with the text outset', () => {
    const d = TEXT_RING_OUTSET;
    /* a cover title: no block in the slide's list, the type read from the markup */
    expect(selectionRingBox(undefined, [137, 129, 522.5, 60], 'heading')).toEqual([
      137 - d,
      129 - d,
      522.5 + 2 * d,
      60 + 2 * d,
    ]);
    /* a block in a layout slot (no pos): its measured box, no outset for a table */
    expect(selectionRingBox({ type: 'table' }, [137, 200, 731.5, 300])).toEqual([
      137, 200, 731.5, 300,
    ]);
    expect(selectionRingBox({ type: 'text' }, null)).toBeNull();
    expect(selectionRingBox(undefined, null, 'heading')).toBeNull();
  });

  it('applies the text outset to a text object with pos', () => {
    const d = TEXT_RING_OUTSET;
    const text = {
      type: 'text' as const,
      pos: { x: 100, y: 100, w: 480, h: 64, z: 1, rotate: 30 },
    };
    expect(selectionRingBox(text, [80, 60, 520, 300])).toEqual([
      100 - d,
      100 - d,
      480 + 2 * d,
      64 + 2 * d,
    ]);
  });
});

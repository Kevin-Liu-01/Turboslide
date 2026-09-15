import { describe, expect, it } from 'vitest';

import { GESTURE_END_EVENTS, GESTURE_IDLE, gestureLife } from '../gesture-life';
import type { GestureLife, GestureReadout } from '../gesture-life';

// The life of a pointer gesture (build-4/hotfix-4.md cause W1). Kevin's report of 2026-09-14: a
// Mark block resized by its handle kept the readout "536 × 343" on the page after the pointer was
// released, and the readout followed the selection to the title. The Editor's release computed
// its mutations through a function that set the readout as a side effect, after the release had
// cleared it. The readout now lives in this reducer: shown only between the press and the end
// of the same gesture, and every end event of every handle kind returns to idle.

const size: GestureReadout = { kind: 'size', w: 595, h: 382 };
const angle: GestureReadout = { kind: 'angle', value: 35 };

function drag(readout: GestureReadout): GestureLife {
  const down = gestureLife(GESTURE_IDLE, { type: 'down' });
  return gestureLife(down, { type: 'move', readout });
}

describe('gestureLife', () => {
  it('starts a gesture on the press with no readout and shows the readout the move computed', () => {
    const down = gestureLife(GESTURE_IDLE, { type: 'down' });
    expect(down).toEqual({ down: true, readout: null });
    expect(gestureLife(down, { type: 'move', readout: size })).toEqual({
      down: true,
      readout: size,
    });
    expect(gestureLife(down, { type: 'move', readout: angle })).toEqual({
      down: true,
      readout: angle,
    });
    /* a move that computes no readout (a block reorder, a chip drag) shows none */
    expect(gestureLife(down, { type: 'move', readout: null })).toEqual({
      down: true,
      readout: null,
    });
  });

  it('clears the readout and the gesture on every end event: pointerup, pointercancel, lostpointercapture, blur and Escape', () => {
    expect([...GESTURE_END_EVENTS]).toEqual([
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
      'escape',
    ]);
    for (const end of GESTURE_END_EVENTS) {
      expect(gestureLife(drag(size), { type: end })).toEqual(GESTURE_IDLE);
      expect(gestureLife(drag(angle), { type: end })).toEqual(GESTURE_IDLE);
    }
  });

  it('never revives a readout after the end: a late move, a release computed after the clear, or a selection change land on idle', () => {
    const released = gestureLife(drag(size), { type: 'pointerup' });
    /* the release's own computation of the final box (the mechanism of W1): a move event after
       the end carries a readout and the state stays idle */
    expect(gestureLife(released, { type: 'move', readout: size })).toEqual(GESTURE_IDLE);
    expect(gestureLife(released, { type: 'move', readout: angle })).toEqual(GESTURE_IDLE);
    /* a selection change (a click on the title, Tab) inherits nothing */
    expect(gestureLife(drag(size), { type: 'select' })).toEqual(GESTURE_IDLE);
    expect(gestureLife(GESTURE_IDLE, { type: 'select' })).toEqual(GESTURE_IDLE);
    /* a stale move with no gesture down shows nothing */
    expect(gestureLife(GESTURE_IDLE, { type: 'move', readout: size })).toEqual(GESTURE_IDLE);
  });

  it('a new press after an end starts clean, and the readout of the last move is the one shown', () => {
    const second = gestureLife(gestureLife(drag(size), { type: 'escape' }), { type: 'down' });
    expect(second).toEqual({ down: true, readout: null });
    const moved = gestureLife(gestureLife(second, { type: 'move', readout: size }), {
      type: 'move',
      readout: { kind: 'size', w: 637, h: 398 },
    });
    expect(moved.readout).toEqual({ kind: 'size', w: 637, h: 398 });
  });
});

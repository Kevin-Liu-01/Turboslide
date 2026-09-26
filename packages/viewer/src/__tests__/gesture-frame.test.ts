import { describe, expect, it } from 'vitest';

import {
  createFrameCoalescer,
  EMPTY_GESTURE_RECORD,
  FRAME_OVER_MS,
  FRAME_UNDER_MS,
  frameRecord,
  gestureReport,
  rendersFrame,
  skippedFrame,
} from '../gesture-frame';
import type { FrameScheduler, GestureFrameRecord } from '../gesture-frame';

// The frames of a live gesture (docs/OBJECTS.md 2.4; the objects round, B1): the record the
// Editor publishes as describe().state.gesture, the budget that degrades a gesture whose sheet
// render misses two frames in a row, and the coalescer that renders a burst of pointermoves
// inside one animation frame once.

function frames(record: GestureFrameRecord, ...ms: number[]): GestureFrameRecord {
  let out = record;
  let t = 1000;
  for (const cost of ms) {
    out = frameRecord(out, { start: t, end: t + cost });
    t += 16.7;
  }
  return out;
}

describe('frameRecord', () => {
  it('accumulates the frame count, the worst frame, the mean and the skipped frames', () => {
    const record = frames(EMPTY_GESTURE_RECORD, 8, 12, 10);
    expect(record.frames).toBe(3);
    expect(record.maxMs).toBe(12);
    expect(record.meanMs).toBeCloseTo(10, 5);
    expect(record.totalMs).toBe(30);
    expect(record.skipped).toBe(0);
    expect(record.degraded).toBe(false);
    const withSkip = skippedFrame(skippedFrame(record));
    expect(withSkip.skipped).toBe(2);
    expect(withSkip.frames).toBe(3);
    /* a frame whose end precedes its start (a clock that went backwards) costs nothing */
    expect(frameRecord(EMPTY_GESTURE_RECORD, { start: 10, end: 5 }).maxMs).toBe(0);
  });

  it('degrades on two frames over the budget in a row, not on one, and not on two apart', () => {
    expect(FRAME_OVER_MS).toBe(32);
    expect(frames(EMPTY_GESTURE_RECORD, 40).degraded).toBe(false);
    expect(frames(EMPTY_GESTURE_RECORD, 40, 10, 40).degraded).toBe(false);
    expect(frames(EMPTY_GESTURE_RECORD, 40, 33).degraded).toBe(true);
    /* at the budget is not over it */
    expect(frames(EMPTY_GESTURE_RECORD, 32, 32).degraded).toBe(false);
  });

  it('clears the degradation on two frames under the recovery mark in a row', () => {
    expect(FRAME_UNDER_MS).toBe(16);
    const degraded = frames(EMPTY_GESTURE_RECORD, 40, 40);
    expect(degraded.degraded).toBe(true);
    expect(frames(degraded, 10).degraded).toBe(true);
    expect(frames(degraded, 10, 20, 10).degraded).toBe(true);
    const cleared = frames(degraded, 10, 12);
    expect(cleared.degraded).toBe(false);
    expect(cleared.under).toBe(0);
    /* the worst frame stays on the record after the recovery */
    expect(cleared.maxMs).toBe(40);
    /* and the budget can be missed again */
    expect(frames(cleared, 50, 50).degraded).toBe(true);
  });
});

describe('rendersFrame', () => {
  const held = frames(EMPTY_GESTURE_RECORD, 8, 8);
  const missed = frames(EMPTY_GESTURE_RECORD, 40, 40);

  it('renders every frame of every kind while the budget holds', () => {
    for (const kind of ['move', 'resize', 'rotate', 'other'] as const) {
      expect(rendersFrame(held, kind, true)).toBe(true);
      expect(rendersFrame(held, kind, false)).toBe(true);
    }
  });

  it('while degraded: a move never renders (the wrapper path), a resize or rotation every second frame, the rest every frame', () => {
    expect(rendersFrame(missed, 'move', true)).toBe(false);
    expect(rendersFrame(missed, 'move', false)).toBe(false);
    expect(rendersFrame(missed, 'resize', true)).toBe(false);
    expect(rendersFrame(missed, 'resize', false)).toBe(true);
    expect(rendersFrame(missed, 'rotate', true)).toBe(false);
    expect(rendersFrame(missed, 'rotate', false)).toBe(true);
    expect(rendersFrame(missed, 'other', true)).toBe(true);
  });
});

describe('gestureReport', () => {
  it('publishes the five fields a driver reads, rounded to a tenth', () => {
    const record = frames(EMPTY_GESTURE_RECORD, 8.26, 12.04, 10);
    expect(gestureReport(skippedFrame(record))).toEqual({
      frames: 3,
      maxMs: 12,
      meanMs: 10.1,
      skipped: 1,
      degraded: false,
    });
  });
});

describe('createFrameCoalescer', () => {
  function fakeScheduler(): FrameScheduler & { flush: () => void; requests: number } {
    const queue = new Map<number, () => void>();
    let next = 1;
    const scheduler = {
      requests: 0,
      request: (callback: () => void) => {
        scheduler.requests += 1;
        const handle = next;
        next += 1;
        queue.set(handle, callback);
        return handle;
      },
      cancel: (handle: number) => {
        queue.delete(handle);
      },
      flush: () => {
        const callbacks = [...queue.values()];
        queue.clear();
        for (const callback of callbacks) callback();
      },
    };
    return scheduler;
  }

  it('renders a burst of pushes inside one frame once, with the last one', () => {
    const scheduler = fakeScheduler();
    const coalescer = createFrameCoalescer(scheduler);
    const applied: number[] = [];
    coalescer.push(() => applied.push(1));
    coalescer.push(() => applied.push(2));
    coalescer.push(() => applied.push(3));
    expect(scheduler.requests).toBe(1);
    expect(coalescer.pending()).toBe(true);
    expect(applied).toEqual([]);
    scheduler.flush();
    expect(applied).toEqual([3]);
    expect(coalescer.pending()).toBe(false);
    /* the next frame's push schedules again */
    coalescer.push(() => applied.push(4));
    expect(scheduler.requests).toBe(2);
    scheduler.flush();
    expect(applied).toEqual([3, 4]);
  });

  it('cancel drops the pending work and a flush after it runs nothing', () => {
    const scheduler = fakeScheduler();
    const coalescer = createFrameCoalescer(scheduler);
    const applied: number[] = [];
    coalescer.push(() => applied.push(1));
    coalescer.cancel();
    expect(coalescer.pending()).toBe(false);
    scheduler.flush();
    expect(applied).toEqual([]);
  });

  it('a push from inside the frame callback schedules the next frame, never the same one', () => {
    const scheduler = fakeScheduler();
    const coalescer = createFrameCoalescer(scheduler);
    const applied: string[] = [];
    coalescer.push(() => {
      applied.push('first');
      coalescer.push(() => applied.push('second'));
    });
    scheduler.flush();
    expect(applied).toEqual(['first']);
    expect(coalescer.pending()).toBe(true);
    scheduler.flush();
    expect(applied).toEqual(['first', 'second']);
  });
});

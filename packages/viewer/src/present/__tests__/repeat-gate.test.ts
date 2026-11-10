import { describe, expect, it } from 'vitest';

import { createRepeatGate } from '../repeatGate';
import type { FrameScheduler } from '../repeatGate';

// A held arrow in a show (the presenter audit of a95d4097d, item 2): one press is one move at
// once; the repeats of a held key run at most one move a frame, the latest standing for the ones
// before it; letting the key go drops a repeat not yet run, so nothing moves after the release.

function fakeFrames(): FrameScheduler & { flush: () => void; waiting: () => number } {
  const queue = new Map<number, () => void>();
  let next = 0;
  return {
    request(run) {
      next += 1;
      queue.set(next, run);
      return next;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    flush() {
      const due = [...queue.values()];
      queue.clear();
      for (const run of due) run();
    },
    waiting: () => queue.size,
  };
}

const down = (key: string, repeat = false) => ({ key, repeat });

describe('createRepeatGate', () => {
  it('runs every press at once, however fast the presses come', () => {
    const frames = fakeFrames();
    const gate = createRepeatGate(frames);
    let moves = 0;
    for (let i = 0; i < 5; i += 1) {
      gate.press(down('ArrowRight'), () => (moves += 1));
      gate.release('ArrowRight');
    }
    expect(moves).toBe(5);
    expect(frames.waiting()).toBe(0);
  });

  it('runs a held key at most once a frame, with the latest repeat', () => {
    const frames = fakeFrames();
    const gate = createRepeatGate(frames);
    const ran: number[] = [];
    gate.press(down('ArrowRight'), () => ran.push(0));
    /* five repeats queued behind a slow render: one move on the next frame */
    for (let i = 1; i <= 5; i += 1) gate.press(down('ArrowRight', true), () => ran.push(i));
    expect(ran).toEqual([0]);
    expect(frames.waiting()).toBe(1);
    frames.flush();
    expect(ran).toEqual([0, 5]);
    gate.press(down('ArrowRight', true), () => ran.push(6));
    frames.flush();
    frames.flush();
    expect(ran).toEqual([0, 5, 6]);
  });

  it('drops the repeat not yet run when the key is let go, and never overshoots', () => {
    const frames = fakeFrames();
    const gate = createRepeatGate(frames);
    let moves = 0;
    gate.press(down('ArrowRight'), () => (moves += 1));
    gate.press(down('ArrowRight', true), () => (moves += 1));
    gate.press(down('ArrowRight', true), () => (moves += 1));
    gate.release('ArrowRight');
    frames.flush();
    expect(moves).toBe(1);
    /* another key going up leaves the held one alone */
    gate.press(down('ArrowLeft'), () => (moves -= 1));
    gate.press(down('ArrowLeft', true), () => (moves -= 1));
    gate.release('Shift');
    frames.flush();
    expect(moves).toBe(-1);
  });

  it('drops a waiting repeat on a new press and on cancel', () => {
    const frames = fakeFrames();
    const gate = createRepeatGate(frames);
    const ran: string[] = [];
    gate.press(down('ArrowRight'), () => ran.push('right'));
    gate.press(down('ArrowRight', true), () => ran.push('right held'));
    gate.press(down('ArrowLeft'), () => ran.push('left'));
    frames.flush();
    expect(ran).toEqual(['right', 'left']);
    gate.press(down('ArrowLeft', true), () => ran.push('left held'));
    gate.cancel();
    frames.flush();
    expect(ran).toEqual(['right', 'left']);
  });
});

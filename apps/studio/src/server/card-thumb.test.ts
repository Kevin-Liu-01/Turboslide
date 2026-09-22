import { describe, expect, it } from 'vitest';

import { CARD_THUMB_FLOOR_MS, CARD_THUMB_SETTLE_MS, createCardThumbScheduler } from './card-thumb';
import type { CardThumbClock } from './card-thumb';

// The card's capture on save (the product round, docs/PRODUCT.md 3.6; the row
// decks.card.thumbnail-slide-1): one render per deck once its writes settle, floored so a typing
// burst renders once, never a timer that polls. Pure over a fake clock.

function fakeClock(): CardThumbClock & { advance: (ms: number) => void; timers: () => number } {
  let t = 0;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => t,
    setTimeout: (run, ms) => {
      const id = next++;
      timers.set(id, { at: t + ms, run });
      return id;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
    timers: () => timers.size,
    advance(ms) {
      const until = t + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        t = due[1].at;
        timers.delete(due[0]);
        due[1].run();
      }
      t = until;
    },
  };
}

describe('the card thumbnail scheduler', () => {
  it('renders once after the writes settle, and a burst of writes renders once', () => {
    const clock = fakeClock();
    const runs: string[] = [];
    const scheduler = createCardThumbScheduler(
      async (deckId) => void runs.push(`${deckId}@${clock.now()}`),
      { clock },
    );
    scheduler.note('q4-review');
    scheduler.note('q4-review');
    clock.advance(500);
    scheduler.note('q4-review');
    expect(scheduler.pending()).toEqual(['q4-review']);
    clock.advance(CARD_THUMB_SETTLE_MS);
    expect(runs).toEqual([`q4-review@${CARD_THUMB_SETTLE_MS}`]);
    expect(scheduler.pending()).toEqual([]);
    // the settle is the rest of docs/SYNC.md 3.10: a seller mid edit is not rendered every few
    // seconds, and the row's bound is the flush at the stream's close (the test below)
    expect(CARD_THUMB_SETTLE_MS).toBe(30_000);
    expect(CARD_THUMB_SETTLE_MS).toBeGreaterThan(CARD_THUMB_FLOOR_MS);
  });

  it('renders at once on a flush (the tab hid, the stream closed), at the floor after a recent render, and never without a pending write', () => {
    const clock = fakeClock();
    const runs: number[] = [];
    const scheduler = createCardThumbScheduler(async () => void runs.push(clock.now()), { clock });
    // nothing pending: a flush renders nothing
    expect(scheduler.flush('q4-review')).toBe(false);
    expect(runs).toEqual([]);
    // a write, then the stream closes 3 s later: the render moves up from the settle to now
    scheduler.note('q4-review');
    clock.advance(3_000);
    expect(scheduler.flush('q4-review')).toBe(true);
    expect(scheduler.pending()).toEqual(['q4-review']);
    clock.advance(0);
    expect(runs).toEqual([3_000]);
    expect(scheduler.pending()).toEqual([]);
    // a write right after and a second flush: the floor holds the render to 8 s after the last
    clock.advance(1_000);
    scheduler.note('q4-review');
    expect(scheduler.flush('q4-review')).toBe(true);
    clock.advance(1_000);
    expect(runs).toEqual([3_000]);
    clock.advance(CARD_THUMB_FLOOR_MS);
    expect(runs).toEqual([3_000, 3_000 + CARD_THUMB_FLOOR_MS]);
    // a flush of another deck moves nothing of this one
    scheduler.note('q4-review');
    expect(scheduler.flush('other-deck')).toBe(false);
    expect(scheduler.pending()).toEqual(['q4-review']);
    scheduler.stop();
    expect(clock.timers()).toBe(0);
  });

  it('holds the next render at the floor after one ran, then renders again', () => {
    const clock = fakeClock();
    const runs: number[] = [];
    // a settle under the floor, so the floor is what holds the second render (the module's
    // settle is above its floor since docs/SYNC.md 3.10; the flush test reads the floor there)
    const settleMs = 2_000;
    const scheduler = createCardThumbScheduler(async () => void runs.push(clock.now()), {
      clock,
      settleMs,
    });
    scheduler.note('q4-review');
    clock.advance(settleMs);
    expect(runs).toEqual([settleMs]);
    // a write right after: the render waits for the floor, not the settle
    clock.advance(100);
    scheduler.note('q4-review');
    clock.advance(settleMs);
    expect(runs).toHaveLength(1);
    clock.advance(CARD_THUMB_FLOOR_MS);
    expect(runs).toEqual([settleMs, settleMs + CARD_THUMB_FLOOR_MS]);
    // with the module's settle a write right after a render waits the settle, which is longer
    const slow = createCardThumbScheduler(async () => void runs.push(clock.now()), { clock });
    slow.note('other-deck');
    clock.advance(CARD_THUMB_FLOOR_MS);
    expect(runs).toHaveLength(2);
    clock.advance(CARD_THUMB_SETTLE_MS - CARD_THUMB_FLOOR_MS);
    expect(runs).toHaveLength(3);
    slow.stop();
    // two decks are two schedules
    scheduler.note('other-deck');
    scheduler.note('q4-review');
    expect(scheduler.pending().sort()).toEqual(['other-deck', 'q4-review']);
    scheduler.stop();
    expect(scheduler.pending()).toEqual([]);
    expect(clock.timers()).toBe(0);
  });

  it('logs a failed render and schedules again on the next write, and ignores a deck id that is not a slug', () => {
    const clock = fakeClock();
    const lines: string[] = [];
    let fail = true;
    const scheduler = createCardThumbScheduler(
      async () => {
        if (fail) throw new Error('the worker is busy');
      },
      { clock, log: (line) => lines.push(line) },
    );
    scheduler.note('../evil');
    expect(scheduler.pending()).toEqual([]);
    scheduler.note('q4-review');
    clock.advance(CARD_THUMB_SETTLE_MS);
    return Promise.resolve().then(() => {
      expect(lines).toEqual(['q4-review: the worker is busy']);
      fail = false;
      scheduler.note('q4-review');
      expect(scheduler.pending()).toEqual(['q4-review']);
    });
  });
});

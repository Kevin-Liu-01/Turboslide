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
    // the first edit's render lands within the row's 10 s: the settle is well under it
    expect(CARD_THUMB_SETTLE_MS).toBeLessThan(10_000);
  });

  it('holds the next render at the floor after one ran, then renders again', () => {
    const clock = fakeClock();
    const runs: number[] = [];
    const scheduler = createCardThumbScheduler(async () => void runs.push(clock.now()), { clock });
    scheduler.note('q4-review');
    clock.advance(CARD_THUMB_SETTLE_MS);
    expect(runs).toEqual([CARD_THUMB_SETTLE_MS]);
    // a write right after: the render waits for the floor, not the settle
    clock.advance(100);
    scheduler.note('q4-review');
    clock.advance(CARD_THUMB_SETTLE_MS);
    expect(runs).toHaveLength(1);
    clock.advance(CARD_THUMB_FLOOR_MS);
    expect(runs).toEqual([CARD_THUMB_SETTLE_MS, CARD_THUMB_SETTLE_MS + CARD_THUMB_FLOOR_MS]);
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

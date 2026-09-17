import { describe, expect, it } from 'vitest';

import { CHECKPOINT_MAX_MS } from '../server/checkpoint';
import { ACK_WAIT_MS, awaitAcknowledged } from './ack-wait';

// The acknowledgement wait behind a write's answer (SPEC-3 3.10; VERIFICATION F22): a window API
// caller chains writes on the answer's revision, and the controller's checkBase compares that
// base against the reported revision, so the answer must be a number the page has reported.

/** A fake clock and sleep: every sleep advances the clock by its ms. */
function fakeTime(): { now: () => number; sleep: (ms: number) => Promise<void>; at: () => number } {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    at: () => t,
  };
}

describe('awaitAcknowledged', () => {
  it('answers the reported revision once it moves above the base', async () => {
    const time = fakeTime();
    let reported = 8;
    const answer = awaitAcknowledged(() => reported, 8, { ...time, waitMs: 5000, pollMs: 20 });
    // the checkpoint lands after a few polls
    await Promise.resolve();
    reported = 9;
    expect(await answer).toBe(9);
    expect(time.at()).toBeLessThan(1_000_000 + 5000);
  });

  it('answers at once when the acknowledgement is already there (the blob tier)', async () => {
    const time = fakeTime();
    expect(await awaitAcknowledged(() => 13, 12, { ...time, waitMs: 5000 })).toBe(13);
    expect(time.at()).toBe(1_000_000);
  });

  it('at the cap answers the reported revision, never the floor base + 1 (F22)', async () => {
    const time = fakeTime();
    // the memory tier under load: the checkpoint has not moved the revision within the cap
    const answer = await awaitAcknowledged(() => 8, 8, { ...time, waitMs: 5000, pollMs: 100 });
    expect(answer).toBe(8);
    expect(answer).not.toBe(9);
    expect(time.at()).toBeGreaterThanOrEqual(1_000_000 + 5000);
  });

  it('the cap covers the checkpointer hard limit, so a chained write on a busy memory tier is acknowledged', () => {
    // check step 21's chains met a 5 s cap while the checkpoint fired at its 10 s hard limit
    expect(ACK_WAIT_MS).toBeGreaterThan(CHECKPOINT_MAX_MS);
  });
});

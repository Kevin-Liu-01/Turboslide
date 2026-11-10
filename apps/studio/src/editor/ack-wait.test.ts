import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHECKPOINT_MAX_MS } from '../server/checkpoint';
import { ACK_WAIT_MS, awaitAcknowledged } from './ack-wait';

// The acknowledgement wait behind a write's answer (SPEC-3 3.10; VERIFICATION F22): a window API
// caller chains writes on the answer's revision, and the controller's checkBase compares that
// base against the reported revision, so the answer must be a number the page has reported.

/** A reported revision and the listener set the controller's publish calls. */
function fakeRevision(start: number): {
  reported: () => number;
  subscribe: (listener: () => void) => () => void;
  /** moves the revision and publishes, as the room client's onStatus does */
  move: (next: number) => void;
  /** publishes without moving the revision (a presence or document change) */
  publish: () => void;
  listeners: () => number;
} {
  let revision = start;
  const listeners = new Set<() => void>();
  const publish = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    reported: () => revision,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    move: (next) => {
      revision = next;
      publish();
    },
    publish,
    listeners: () => listeners.size,
  };
}

/** Lets the promise reactions queued so far run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('awaitAcknowledged', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers the reported revision once it moves above the base', async () => {
    const room = fakeRevision(8);
    let answer: number | undefined;
    void awaitAcknowledged(room.reported, 8, room.subscribe, { waitMs: 5000 }).then((n) => {
      answer = n;
    });
    room.publish();
    await flush();
    expect(answer).toBeUndefined();
    // the checkpoint lands: the publish after it releases the wait, with no clock moved
    room.move(9);
    await flush();
    expect(answer).toBe(9);
    expect(room.listeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('answers at once when the acknowledgement is already there (the blob tier)', async () => {
    const room = fakeRevision(13);
    expect(await awaitAcknowledged(room.reported, 12, room.subscribe, { waitMs: 5000 })).toBe(13);
    expect(room.listeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a pending wait sets no timer besides the cap, however long it waits', async () => {
    const room = fakeRevision(8);
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    try {
      const pending = awaitAcknowledged(room.reported, 8, room.subscribe);
      for (let ms = 0; ms < 9_000; ms += 1_000) {
        room.publish();
        await vi.advanceTimersByTimeAsync(1_000);
      }
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(timeout.mock.calls[0]?.[1]).toBe(ACK_WAIT_MS);
      expect(interval).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
      room.move(9);
      expect(await pending).toBe(9);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      timeout.mockRestore();
      interval.mockRestore();
    }
  });

  it('at the cap answers the reported revision, never the floor base + 1 (F22)', async () => {
    const room = fakeRevision(8);
    // the memory tier under load: the checkpoint has not moved the revision within the cap
    let answer: number | undefined;
    void awaitAcknowledged(room.reported, 8, room.subscribe, { waitMs: 5000 }).then((n) => {
      answer = n;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toBe(8);
    expect(answer).not.toBe(9);
    expect(room.listeners()).toBe(0);
  });

  it('a subscription that calls its listener at once finishes the wait and unsubscribes', async () => {
    let revision = 3;
    let unsubscribed = 0;
    const answer = awaitAcknowledged(
      () => revision,
      3,
      (listener) => {
        revision = 4;
        listener();
        return () => {
          unsubscribed += 1;
        };
      },
    );
    expect(await answer).toBe(4);
    expect(unsubscribed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the cap covers the checkpointer hard limit, so a chained write on a busy memory tier is acknowledged', () => {
    // check step 21's chains met a 5 s cap while the checkpoint fired at its 10 s hard limit
    expect(ACK_WAIT_MS).toBeGreaterThan(CHECKPOINT_MAX_MS);
  });
});

// PERF-18 (hardening HR-O#8): the shutdown's order and bounds with fake timers and a fake exit. The
// node-server build itself is read by scripts/check-sigterm.mjs.
import { describe, expect, it } from 'vitest';

import { CLOSE_WAIT_MS, SHUTDOWN_DEADLINE_MS, createShutdown } from './shutdown';

function harness(flush: () => Promise<void>) {
  const timers: { ms: number; run: () => void }[] = [];
  const exits: number[] = [];
  const lines: string[] = [];
  const shutdown = createShutdown({
    flush,
    exit: (code) => exits.push(code),
    log: (line) => lines.push(line),
    setTimer: (run, ms) => timers.push({ ms, run }),
  });
  const fire = (ms: number): void => {
    for (const timer of timers.filter((row) => row.ms === ms)) timer.run();
  };
  return { shutdown, timers, exits, lines, fire };
}

describe('the SIGTERM shutdown', () => {
  it('flushes once the listener closed and exits 0, inside the 10 s pin', async () => {
    let flushed = 0;
    const h = harness(async () => {
      flushed += 1;
    });
    h.shutdown.signal('SIGTERM');
    expect(h.timers.map((row) => row.ms).sort((a, b) => a - b)).toEqual([
      CLOSE_WAIT_MS,
      SHUTDOWN_DEADLINE_MS,
    ]);
    expect(SHUTDOWN_DEADLINE_MS).toBeLessThan(10_000);
    await h.shutdown.closed();
    expect(flushed).toBe(1);
    expect(h.exits).toEqual([0]);
    // the wait for the listener and the deadline fire later and change nothing
    h.fire(CLOSE_WAIT_MS);
    h.fire(SHUTDOWN_DEADLINE_MS);
    expect(flushed).toBe(1);
    expect(h.exits).toEqual([0]);
  });

  it('flushes after the wait when no close hook comes (srvx installs no handler under CI)', async () => {
    let flushed = 0;
    const h = harness(async () => {
      flushed += 1;
    });
    h.shutdown.signal('SIGTERM');
    h.fire(CLOSE_WAIT_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(flushed).toBe(1);
    expect(h.exits).toEqual([0]);
  });

  it('exits 1 when the flush fails, and 1 at the deadline when it hangs', async () => {
    const failing = harness(async () => {
      throw new Error('the store did not answer');
    });
    failing.shutdown.signal('SIGTERM');
    await failing.shutdown.closed();
    expect(failing.exits).toEqual([1]);
    expect(failing.lines.at(-1)).toMatch(/the flush failed: the store did not answer/);

    const hanging = harness(() => new Promise<void>(() => undefined));
    hanging.shutdown.signal('SIGTERM');
    void hanging.shutdown.closed();
    hanging.fire(SHUTDOWN_DEADLINE_MS);
    expect(hanging.exits).toEqual([1]);
  });

  it('takes the second signal as the first', () => {
    const h = harness(async () => undefined);
    h.shutdown.signal('SIGTERM');
    h.shutdown.signal('SIGINT');
    expect(h.timers).toHaveLength(2);
  });
});

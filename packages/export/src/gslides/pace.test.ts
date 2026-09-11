// The pacer (SPEC 8.3 quotas): 60 calls per minute per bucket pass at once and the 61st waits for
// the oldest to age out; a 429 or a 5xx retries with exponential backoff, Retry-After wins over
// the computed delay, every other error is rethrown at once, and the attempt cap ends the retries.
// The clock and the sleep are fakes, so nothing here waits.
import { describe, expect, test } from 'vitest';

import { RatePacer, backoffMs, isRetryable, retryAfterMs, statusOf } from './pace.ts';

function fakeClock(): {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  slept: number[];
} {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

function httpError(status: number, retryAfter?: string): Error {
  const error = new Error(`HTTP ${status}`) as Error & {
    response: { status: number; headers: Record<string, string> };
  };
  error.response = { status, headers: retryAfter ? { 'retry-after': retryAfter } : {} };
  return error;
}

describe('RatePacer', () => {
  test('60 writes pass without waiting and the 61st waits for the window', async () => {
    const clock = fakeClock();
    const pacer = new RatePacer({ now: clock.now, sleep: clock.sleep, jitter: () => 0 });
    for (let i = 0; i < 60; i += 1) await pacer.acquire('write');
    expect(clock.slept).toEqual([]);
    expect(pacer.waitFor('write')).toBe(60_000);
    await pacer.acquire('write');
    expect(clock.slept).toEqual([60_000]);
    expect(pacer.stats.waits).toBe(1);
    expect(pacer.stats.calls.write).toBe(61);
    // reads are their own bucket
    expect(pacer.waitFor('read')).toBe(0);
  });

  test('a slot frees as the oldest call ages out', async () => {
    const clock = fakeClock();
    const pacer = new RatePacer({
      limits: { write: 3 },
      windowMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    await pacer.acquire('write');
    await clock.sleep(400);
    await pacer.acquire('write');
    await pacer.acquire('write');
    expect(pacer.waitFor('write')).toBe(600);
    await pacer.acquire('write');
    expect(clock.slept).toEqual([400, 600]);
  });

  test('retries 429 with backoff, honors Retry-After and stops at the attempt cap', async () => {
    const clock = fakeClock();
    const pacer = new RatePacer({
      now: clock.now,
      sleep: clock.sleep,
      jitter: () => 1,
      maxAttempts: 4,
      baseDelayMs: 1000,
    });
    let calls = 0;
    const result = await pacer.run('write', 'test', async () => {
      calls += 1;
      if (calls === 1) throw httpError(429, '7');
      if (calls === 2) throw httpError(503);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    // Retry-After 7 s, then the computed 2 s (base 1000 * 2^(2-1) with jitter 1)
    expect(clock.slept).toEqual([7000, 2000]);
    expect(pacer.stats.retries).toBe(2);

    let attempts = 0;
    await expect(
      pacer.run('write', 'always 500', async () => {
        attempts += 1;
        throw httpError(500);
      }),
    ).rejects.toThrow(/HTTP 500/);
    expect(attempts).toBe(4);
  });

  test('a non-retryable error is rethrown at once', async () => {
    const clock = fakeClock();
    const pacer = new RatePacer({ now: clock.now, sleep: clock.sleep });
    let attempts = 0;
    await expect(
      pacer.run('write', 'bad request', async () => {
        attempts += 1;
        throw httpError(400);
      }),
    ).rejects.toThrow(/HTTP 400/);
    expect(attempts).toBe(1);
    expect(clock.slept).toEqual([]);
  });
});

describe('error helpers', () => {
  test('statusOf reads gaxios, fetch and plain shapes', () => {
    expect(statusOf(httpError(429))).toBe(429);
    expect(statusOf({ code: 503 })).toBe(503);
    expect(statusOf({ code: '500' })).toBe(500);
    expect(statusOf({ status: 404 })).toBe(404);
    expect(statusOf(new Error('x'))).toBeUndefined();
    expect(statusOf(null)).toBeUndefined();
  });

  test('isRetryable is 429 and the 5xx family', () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(502))).toBe(true);
    expect(isRetryable(httpError(403))).toBe(false);
    expect(isRetryable(new Error('network'))).toBe(false);
  });

  test('retryAfterMs reads seconds and HTTP dates, from headers objects and Headers', () => {
    expect(retryAfterMs(httpError(429, '3'))).toBe(3000);
    const at = new Date(2_000_000);
    expect(retryAfterMs(httpError(429, at.toUTCString()), 1_000_000)).toBe(1_000_000);
    const withHeaders = Object.assign(new Error('h'), {
      response: { status: 429, headers: new Headers({ 'retry-after': '2' }) },
    });
    expect(retryAfterMs(withHeaders)).toBe(2000);
    expect(retryAfterMs(httpError(429))).toBeUndefined();
  });

  test('backoff doubles per attempt, caps, and jitters within half to full', () => {
    expect(backoffMs(1, { baseDelayMs: 1000, jitter: () => 1 })).toBe(1000);
    expect(backoffMs(2, { baseDelayMs: 1000, jitter: () => 1 })).toBe(2000);
    expect(backoffMs(3, { baseDelayMs: 1000, jitter: () => 0 })).toBe(2000);
    expect(backoffMs(10, { baseDelayMs: 1000, maxDelayMs: 8000, jitter: () => 1 })).toBe(8000);
  });
});

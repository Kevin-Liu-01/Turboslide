// The deck pulse (pulse.ts; the focus round, cycle 3 fix round; VERIFICATION C3-F1, C3-F2): the
// path agrees with the store's own spelling, a put lands a nonce body and never fails its caller,
// the store's refusals are told from its answers, and the backoff doubles to a minute and never
// under what the store asked for. The budget's arithmetic is pinned here: one timed call per
// tick, at most 30 a minute per open deck per instance.
import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import { BlobTimeoutError, deckPrefix } from './blob-store.ts';
import { STATE_DIR } from './file-store.ts';
import {
  HOSTED_POLL_MS,
  POLL_BACKOFF_MAX_MS,
  POLL_CALLS_PER_MINUTE_MAX,
  PULSE_FILE,
  PULSE_SAFETY_TICKS,
  headPulse,
  isStoreBusy,
  pollBackoffMs,
  pulsePath,
  putPulse,
  storeRetryAfterMs,
} from './pulse.ts';

/** The SDK's 429, as @vercel/blob throws it: an anonymous class, the message and `retryAfter`. */
function rateLimited(seconds: number): Error {
  const error = new Error(
    `Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in ${seconds} seconds.`,
  );
  (error as { retryAfter?: number }).retryAfter = seconds;
  return error;
}

describe('the deck pulse', () => {
  it('lives under the deck state folder the mirror never pulls, spelled as the store spells it', () => {
    expect(pulsePath('q4-review')).toBe(`${deckPrefix('q4-review')}${STATE_DIR}/${PULSE_FILE}`);
    expect(pulsePath('q4-review')).toBe('decks/q4-review/.turboslide/pulse.json');
  });

  it('puts a nonce body that moves the etag on every write, and answers null instead of failing its caller', async () => {
    const client = memoryBlobClient();
    expect(await headPulse(client, 'q4-review')).toBeNull();
    const first = await putPulse(client, 'q4-review', 'deck', { now: () => 't1' });
    const second = await putPulse(client, 'q4-review', 'presence', { now: () => 't1' });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.version).not.toBe(second!.version);
    expect(await headPulse(client, 'q4-review')).toBe(second!.version);
    const body = JSON.parse(
      new TextDecoder().decode(client.blobs.get(pulsePath('q4-review'))!.bytes),
    ) as { v: number; source: string; at: string; nonce: string };
    expect(body).toMatchObject({ v: 1, source: 'presence', at: 't1' });
    expect(body.nonce.length).toBeGreaterThan(8);
    // a put the store refuses is the caller's null, never its error
    client.failNextPut(pulsePath('q4-review'), rateLimited(60));
    expect(await putPulse(client, 'q4-review', 'comments')).toBeNull();
    expect(client.calls.filter((call) => call.op === 'put')).toHaveLength(3);
  });

  it("tells the store's refusals (the deadline, a 429, a 5xx, the network) from a missing blob and a precondition", () => {
    expect(isStoreBusy(new BlobTimeoutError('head', 'decks/x/deck.json', 10_000))).toBe(true);
    expect(isStoreBusy(rateLimited(60))).toBe(true);
    expect(
      isStoreBusy(
        new Error('Vercel Blob: The blob service is currently not available. Please try again.'),
      ),
    ).toBe(true);
    expect(
      isStoreBusy(new Error('Vercel Blob: Unknown error, please visit https://vercel.com/help.')),
    ).toBe(true);
    expect(isStoreBusy(new TypeError('fetch failed'))).toBe(true);
    expect(isStoreBusy(new Error('Vercel Blob: The requested blob does not exist'))).toBe(false);
    expect(isStoreBusy(new Error('Vercel Blob: Precondition failed: ETag mismatch.'))).toBe(false);
    expect(isStoreBusy(new RangeError('No deck x in the Blob store'))).toBe(false);
    expect(isStoreBusy('down')).toBe(false);
    expect(storeRetryAfterMs(rateLimited(60))).toBe(60_000);
    expect(
      storeRetryAfterMs(new Error('Vercel Blob: Too many requests - try again in 7 seconds.')),
    ).toBe(7000);
    expect(storeRetryAfterMs(new BlobTimeoutError('head', 'x', 10_000))).toBeNull();
  });

  it('backs a poll off from the tick to a minute, never under what the store asked for', () => {
    expect(pollBackoffMs(0)).toBe(HOSTED_POLL_MS);
    expect(pollBackoffMs(1)).toBe(HOSTED_POLL_MS * 2);
    expect(pollBackoffMs(3)).toBe(HOSTED_POLL_MS * 8);
    expect(pollBackoffMs(20)).toBe(POLL_BACKOFF_MAX_MS);
    expect(pollBackoffMs(1, HOSTED_POLL_MS, 60_000)).toBe(60_000);
    expect(pollBackoffMs(1, HOSTED_POLL_MS, 90_000)).toBe(POLL_BACKOFF_MAX_MS);
    expect(pollBackoffMs(1, 20, 1000)).toBe(1000);
  });

  it('pins the budget: one timed call per tick is at most 30 a minute per open deck per instance', () => {
    expect(HOSTED_POLL_MS).toBe(2000);
    expect(Math.ceil(60_000 / HOSTED_POLL_MS)).toBeLessThanOrEqual(POLL_CALLS_PER_MINUTE_MAX);
    // the safety tick heads the manifest in place of the pulse, one call that tick as well
    expect(PULSE_SAFETY_TICKS * HOSTED_POLL_MS).toBe(30_000);
    expect(POLL_BACKOFF_MAX_MS).toBe(60_000);
  });
});

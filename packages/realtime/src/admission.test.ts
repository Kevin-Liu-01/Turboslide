// The admission caps of SPEC-3 3.4 steps 1 and 2 and the stream draws of report 10 F24.
import { describe, expect, it } from 'vitest';

import { appendWithRetry } from './admission.ts';
import { CLIENT_A, CLIENT_B, editEntry, kevin, maya } from './channel-contract.ts';
import { memoryChannel } from './memory.ts';
import {
  CAPS,
  budgetsFor,
  checkBaseWindow,
  checkPostCaps,
  replayPlan,
  streamLifetimeMs,
  streamRetryMs,
  windowOf,
} from './admission.ts';
import { OPS_POST_MAX_BYTES } from './protocol.ts';

describe('admission', () => {
  it('refuses the 65th entry and the 257th kB before any transform', () => {
    expect(checkPostCaps(64, 1000)).toEqual({ ok: true });
    expect(checkPostCaps(65, 1000)).toMatchObject({
      ok: false,
      status: 400,
      reason: 'too-many-entries',
    });
    expect(checkPostCaps(1, OPS_POST_MAX_BYTES)).toEqual({ ok: true });
    expect(checkPostCaps(1, OPS_POST_MAX_BYTES + 1)).toMatchObject({
      ok: false,
      status: 400,
      reason: 'too-large',
    });
  });

  it('answers resync for a base more than 500 entries behind the head, or ahead of it', () => {
    expect(checkBaseWindow(100, 600)).toEqual({ ok: true });
    expect(checkBaseWindow(99, 600)).toMatchObject({
      ok: false,
      status: 409,
      resync: true,
      head: 600,
    });
    expect(checkBaseWindow(601, 600)).toMatchObject({ ok: false, resync: true });
    expect(checkBaseWindow(0, 0)).toEqual({ ok: true });
  });

  it('replays at most 2,000 entries per open and resyncs an older position', () => {
    expect(replayPlan(0, 2000)).toEqual({ kind: 'ops', from: 0 });
    expect(replayPlan(0, 2001)).toEqual({ kind: 'resync' });
    expect(replayPlan(5, 4)).toEqual({ kind: 'resync' });
    expect(replayPlan(4112, 4112)).toEqual({ kind: 'ops', from: 4112 });
  });

  it('names the budgets per identity kind and the fixed windows', () => {
    expect(budgetsFor('anonymous')).toEqual({
      opsPerMinute: 2400,
      bytesPerMinute: 2 * 1024 * 1024,
      streams: 4,
      redisCommandsPerDay: 500_000,
    });
    expect(budgetsFor('signedIn').opsPerMinute).toBe(4800);
    expect(budgetsFor('agent').streams).toBe(4);
    expect(CAPS.streams.ip).toBe(16);
    expect(CAPS.streams.instance).toBe(256);
    expect(CAPS.opsPerSecondPerClient).toBe(60);
    expect(CAPS.deckBytesPerMinute).toBe(16 * 1024 * 1024);
    expect(windowOf(125_000, 60_000)).toBe(2);
  });

  it('retries a missed append against what landed and takes the append lock after two misses', async () => {
    let clock = 1_700_000_000_000;
    const channel = memoryChannel({ now: () => clock });
    // two entries land while the writer holds base 0
    await channel.append('gt-brand', 0, [
      editEntry(CLIENT_B, 1, maya),
      editEntry(CLIENT_B, 2, maya),
    ]);
    const seen: number[] = [];
    const first = await appendWithRetry(
      channel,
      'gt-brand',
      0,
      [editEntry(CLIENT_A, 1, kevin)],
      (pending, landed) => {
        seen.push(landed.length);
        return pending;
      },
    );
    expect(first).toMatchObject({ ok: true, attempts: 2, locked: false });
    expect(first.ok && first.entries[0]?.seq).toBe(3);
    expect(seen).toEqual([2]);

    // a room whose head keeps moving: the third attempt runs under the lock and lands
    let moved = 0;
    let alwaysMove = false;
    const busy = memoryChannel({ now: () => clock });
    const original = busy.append;
    busy.append = async (deckId, base, entries, appendOptions) => {
      // another writer lands first, without a token: it yields while the lock is held
      if (moved < 3 || alwaysMove) {
        moved += 1;
        await original(deckId, base, [editEntry(CLIENT_B, 100 + moved, maya)]);
      }
      return original(deckId, base, entries, appendOptions);
    };
    const second = await appendWithRetry(
      busy,
      'gt-brand',
      0,
      [editEntry(CLIENT_A, 2, kevin)],
      (pending) => pending,
      { lockMs: 50, lockPollMs: 1 },
    );
    expect(second).toMatchObject({ ok: true, locked: true });
    expect(second.ok && second.attempts).toBeGreaterThanOrEqual(3);
    // the lock was released on the way out
    expect(await busy.lock('deck:gt-brand:append', 'other', 100)).toBe(true);

    // an entry the transform cannot place comes back as unplaceable with the head
    await channel.append('gt-brand', 3, [editEntry(CLIENT_B, 3, maya)]);
    const refused = await appendWithRetry(
      channel,
      'gt-brand',
      0,
      [editEntry(CLIENT_A, 3, kevin)],
      () => null,
    );
    expect(refused).toEqual({ ok: false, reason: 'unplaceable', attempts: 1, head: 4 });

    // a writer that never catches up (the lock is never taken here) gives up as contended
    alwaysMove = true;
    const contended = await appendWithRetry(
      busy,
      'gt-brand',
      -1,
      [editEntry(CLIENT_A, 4, kevin)],
      (pending) => pending.map((entry) => ({ ...entry })),
      { maxAttempts: 3, lockAfter: 10, lockMs: 10 },
    );
    expect(contended).toMatchObject({ ok: false, reason: 'contended', attempts: 3 });
    clock += 1;
  });

  it('draws the stream lifetime between 240 and 290 s and the retry between 1 and 4 s', () => {
    expect(streamLifetimeMs(0)).toBe(240_000);
    expect(streamLifetimeMs(1)).toBe(290_000);
    expect(streamLifetimeMs(0.5)).toBe(265_000);
    expect(streamRetryMs(0)).toBe(1000);
    expect(streamRetryMs(1)).toBe(4000);
    const drawn = streamLifetimeMs();
    expect(drawn).toBeGreaterThanOrEqual(240_000);
    expect(drawn).toBeLessThanOrEqual(290_000);
  });
});

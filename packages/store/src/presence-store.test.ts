// The shared presence roster of the blob tier (the focus round, cycle 3; VERIFICATION.md C2-F28):
// two `sharedPresence` instances over one fake Blob store stand in for two function instances.
// A row set on one reaches the other's listeners within one poll and its roster, a leave clears
// it everywhere, a row without a heartbeat leaves every roster inside 30 s, a tombstone beats a
// set pushed late from another instance, two concurrent writers both land through the ifMatch
// retry, a heartbeat alone pushes nothing until the row's remaining life is under half, the CDN's
// stale body is read through the immutable copy, the pointer stays per instance and the old
// copies are deleted. The stream fix round two fix round (b4.md C3T-R1, C3T-R2): a read that
// proved nothing schedules the one push at the floor, and a tombstone keeps the beacon's clock so
// a set at or below it never lands, on the same instance or pushed from another. The sync round
// fix round (VERIFICATION.md sync pass 1, F5): an idle tab at the quiet heartbeat of 10 s pushes
// every 20 s, three pushes and nine puts a minute, and the deferred heartbeat's timer pushes only
// once the heartbeats stop reaching the instance.
import { describe, expect, it, vi } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  PRESENCE_POLL_MS,
  PRESENCE_PUSH_SPACING_MS,
  PRESENCE_REFRESH_TIMER_MS,
  PRESENCE_SHARED_TTL_MS,
  PRESENCE_VOLATILE_FIELDS,
  parsePresenceRecord,
  presenceCopyPath,
  presencePath,
  sharedPresence,
} from './presence-store.ts';
import type { PresenceRow, SharedPresenceEvent } from './presence-store.ts';
import { HOSTED_POLL_MS, pulsePath } from './pulse.ts';

const DECK = 'q4-review';
const C1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const C2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TTL = 120_000;

type Row = PresenceRow & {
  slideId?: string;
  pointer?: { x: number; y: number };
  selection?: { blockIds: string[] };
  label: string;
};

function row(clientId: string, clock: number, label: string, slideId = 'cover'): Row {
  return { clientId, clock, slideId, label };
}

type Instance = {
  presence: ReturnType<typeof sharedPresence<Row>>;
  seen: SharedPresenceEvent<Row>[];
  errors: string[];
};

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function instance(
  client: FakeBlobClient,
  now: () => number,
  options: { pushSpacingMs?: number; pollMs?: number; copyGraceMs?: number } = {},
): Instance {
  const seen: SharedPresenceEvent<Row>[] = [];
  const errors: string[] = [];
  const presence = sharedPresence<Row>({
    client,
    publish: (_deckId, event) => seen.push(event),
    now,
    pushSpacingMs: options.pushSpacingMs ?? 0,
    pollMs: options.pollMs ?? 2000,
    ...(options.copyGraceMs === undefined ? {} : { copyGraceMs: options.copyGraceMs }),
    proven: { fetchFresh: async () => null, sleep: async () => {}, retries: 0 },
    onError: (error, context) =>
      errors.push(`${context}: ${error instanceof Error ? error.message : String(error)}`),
  });
  return { presence, seen, errors };
}

function puts(client: FakeBlobClient): number {
  return client.calls.filter((call) => call.op === 'put').length;
}

describe('the shared presence roster, two instances over one Blob store', () => {
  it('announces a row set on one instance to the other within one poll, lists it in its roster and clears it on the leave', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    // the setter's own listeners saw it at once, as on the memory tier
    expect(a.seen).toEqual([
      { type: 'presence', clientId: C1, clock: 1, state: row(C1, 1, 'Titanium 471') },
    ]);
    expect(client.blobs.has(presencePath(DECK))).toBe(true);
    await b.presence.poll(DECK);
    expect(b.seen).toEqual([
      { type: 'presence', clientId: C1, clock: 1, state: row(C1, 1, 'Titanium 471') },
    ]);
    expect((await b.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    // the same version read twice announces nothing twice
    await b.presence.poll(DECK);
    expect(b.seen).toHaveLength(1);
    await a.presence.leave(DECK, C1);
    expect(a.seen[1]).toEqual({ type: 'leave', clientId: C1 });
    await b.presence.poll(DECK);
    expect(b.seen[1]).toEqual({ type: 'leave', clientId: C1 });
    expect(await b.presence.roster(DECK)).toEqual([]);
    expect(await a.presence.roster(DECK)).toEqual([]);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  it('lets a leave that lands on the other instance clear the row the first instance set (the beacon of a closed tab)', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 3, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen.map((e) => e.type)).toEqual(['presence']);
    // the tab's beacon lands on b, which never held the row itself
    await b.presence.leave(DECK, C1);
    expect(b.seen[1]).toEqual({ type: 'leave', clientId: C1 });
    await a.presence.poll(DECK);
    expect(a.seen[1]).toEqual({ type: 'leave', clientId: C1 });
    expect(await a.presence.roster(DECK)).toEqual([]);
    // a heartbeat stamped at the leave's own time is buried by the tombstone (at or after); one
    // stamped later is a new row, the way a rejoin would be
    await a.presence.set(DECK, C1, row(C1, 4, 'Titanium 471'), TTL);
    expect(await a.presence.roster(DECK)).toEqual([]);
    await b.presence.poll(DECK);
    expect(b.seen.filter((e) => e.type === 'presence')).toHaveLength(1);
    time.advance(500);
    await a.presence.set(DECK, C1, row(C1, 5, 'Titanium 471'), TTL);
    expect((await a.presence.roster(DECK)).map((r) => r.clock)).toEqual([5]);
  });

  it('drops a row without a heartbeat from every roster inside 30 s whatever ttl the route gave', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen).toHaveLength(1);
    time.advance(29_000);
    await b.presence.poll(DECK);
    expect((await b.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    time.advance(1_500);
    await b.presence.poll(DECK);
    expect(b.seen[1]).toEqual({ type: 'leave', clientId: C1 });
    expect(await b.presence.roster(DECK)).toEqual([]);
    expect(await a.presence.roster(DECK)).toEqual([]);
  });

  it("announces the leave of its own row that ran out its life, on the tick when the pulse stands still and on the poll, so the chip of a tab whose beacon was lost goes at the record's 30 s on the instance its set landed on (R1-F1)", async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    // C2 is the owner's tab, streaming here and heartbeating; C1 is the collaborator whose set
    // landed on this instance and whose leave beacon never arrived
    const a = instance(client, time.now);
    await a.presence.set(DECK, C2, row(C2, 1, 'Cobalt 12'), TTL);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await a.presence.flush(DECK);
    expect(a.seen.map((e) => e.type)).toEqual(['presence', 'presence']);
    // the owner heartbeats on, the collaborator is silent; nothing else moves the pulse
    time.advance(20_000);
    await a.presence.set(DECK, C2, row(C2, 2, 'Cobalt 12'), TTL);
    await a.presence.flush(DECK);
    time.advance(9_000);
    a.presence.confirm(DECK);
    expect(a.seen.filter((e) => e.type === 'leave')).toEqual([]);
    expect((await a.presence.roster(DECK)).map((r) => r.clientId).sort()).toEqual([C1, C2]);
    // 30 s after C1's last set the tick announces its leave without a read of the record
    time.advance(1_500);
    const reads = client.calls.length;
    a.presence.confirm(DECK);
    expect(client.calls.length).toBe(reads);
    expect(a.seen.filter((e) => e.type === 'leave')).toEqual([{ type: 'leave', clientId: C1 }]);
    expect((await a.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C2]);
    // the poll path says the same on another instance that set a row and never heard again
    const b = instance(client, time.now);
    await b.presence.set(DECK, C1, row(C1, 5, 'Titanium 471'), TTL);
    await b.presence.flush(DECK);
    time.advance(30_500);
    await b.presence.poll(DECK);
    // (the owner's record row ran out as well by now, and b announces that leave too)
    expect(b.seen.filter((e) => e.type === 'leave' && e.clientId === C1)).toEqual([
      { type: 'leave', clientId: C1 },
    ]);
    expect(await b.presence.roster(DECK)).toEqual([]);
  });

  it('writes nothing back under a removed deck: a record that vanished after this instance knew it costs one manifest head, drops the pending rows and holds the heartbeats for a minute; a record that vanished alone pushes as before (R1-F3)', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const manifest = `decks/${DECK}/deck.json`;
    await client.put(manifest, new TextEncoder().encode('{}'), {
      overwrite: true,
      contentType: 'application/json',
    });
    const a = instance(client, time.now, { pushSpacingMs: 5000 });
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    expect(client.blobs.has(presencePath(DECK))).toBe(true);
    // the deck is deleted forever on another instance: the manifest, the record and the pulse go
    await client.del([manifest, presencePath(DECK), pulsePath(DECK)]);
    const ops = (since: number): string[] => client.calls.slice(since).map((c) => c.op);
    let mark = client.calls.length;
    // the tab's heartbeats land here; the one at the row's half life is due to push
    time.advance(16_000);
    await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471'), TTL);
    expect(ops(mark)).toEqual(['head', 'head']);
    expect(client.blobs.has(presencePath(DECK))).toBe(false);
    expect(client.blobs.has(pulsePath(DECK))).toBe(false);
    expect(a.errors.at(-1)).toBe(
      `presence: push: ${presencePath(DECK)}: the deck is gone; its presence is dropped`,
    );
    expect(await a.presence.roster(DECK)).toEqual([]);
    // the heartbeats of the minute after cost the store nothing
    mark = client.calls.length;
    for (let i = 0; i < 6; i += 1) {
      time.advance(5_000);
      await a.presence.set(DECK, C1, row(C1, 3 + i, 'Titanium 471'), TTL);
    }
    expect(ops(mark)).toEqual([]);
    // a record that vanished alone, with the deck still there, is written again
    const b = instance(client, time.now);
    await client.put(manifest, new TextEncoder().encode('{}'), {
      overwrite: true,
      contentType: 'application/json',
    });
    await b.presence.set(DECK, C2, row(C2, 1, 'Cobalt 12'), TTL);
    expect(client.blobs.has(presencePath(DECK))).toBe(true);
    await client.del([presencePath(DECK)]);
    time.advance(30_000);
    await b.presence.set(DECK, C2, row(C2, 2, 'Cobalt 12'), TTL);
    expect(client.blobs.has(presencePath(DECK))).toBe(true);
  });

  it("keeps a client whose heartbeats moved to another instance: its expired row here is replaced by the record's live row and no leave is announced", async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await a.presence.flush(DECK);
    // the tab's later heartbeats land on b, which refreshes the record once the row is under half its life
    time.advance(16_000);
    await b.presence.set(DECK, C1, row(C1, 4, 'Titanium 471'), TTL);
    await b.presence.flush(DECK);
    // a's own row of C1 runs out at 30 s while the record's row (b's) lives on
    time.advance(15_000);
    await a.presence.poll(DECK);
    expect(a.seen.filter((e) => e.type === 'leave')).toEqual([]);
    expect(a.seen.at(-1)).toMatchObject({ type: 'presence', clientId: C1, clock: 4 });
    expect((await a.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    a.presence.confirm(DECK);
    expect(a.seen.filter((e) => e.type === 'leave')).toEqual([]);
  });

  it('buries a set pushed late from another instance under the leave that came after it', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now, { pushSpacingMs: 60_000 });
    const b = instance(client, time.now);
    // a pushed another row a moment ago, so its spacing holds the next push
    await a.presence.set(DECK, C2, row(C2, 1, 'Cobalt 12'), TTL);
    const before = puts(client);
    // a's set of C1 is pending; the tab closes and the beacon lands on b
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    expect(puts(client)).toBe(before);
    time.advance(100);
    await b.presence.leave(DECK, C1);
    const leftAt = time.now();
    // a's late push meets the tombstone: the row never lands and a's listeners see the leave
    time.advance(100);
    await a.presence.flush(DECK);
    expect(a.seen.slice(1)).toEqual([
      { type: 'presence', clientId: C1, clock: 1, state: row(C1, 1, 'Titanium 471') },
      { type: 'leave', clientId: C1 },
    ]);
    const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()]).toEqual([C2]);
    expect(stored.left.get(C1)).toEqual({ at: leftAt });
    await b.presence.poll(DECK);
    expect(b.seen.filter((e) => e.type === 'presence').map((e) => e.clientId)).toEqual([C2]);
  });

  it('lands both rows when two instances write at once: the loser of the ifMatch race pushes again on its next push, not inside the same one', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now, { pushSpacingMs: 60_000 });
    const b = instance(client, time.now, { pushSpacingMs: 60_000 });
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await b.presence.set(DECK, C2, row(C2, 1, 'Cobalt 12'), TTL);
    await Promise.all([a.presence.flush(DECK), b.presence.flush(DECK)]);
    // one attempt each: the record puts are two at most, one of them refused when both read
    // the same version (the budget: no retry loop on ifMatch)
    const recordPuts = client.calls.filter(
      (call) => call.op === 'put' && call.pathname === presencePath(DECK),
    );
    expect(recordPuts.length).toBeLessThanOrEqual(2);
    // the next push of each carries what the lost race left pending
    await Promise.all([a.presence.flush(DECK), b.presence.flush(DECK)]);
    const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()].sort()).toEqual([C1, C2]);
    await a.presence.poll(DECK);
    await b.presence.poll(DECK);
    expect((await a.presence.roster(DECK)).map((r) => r.clientId).sort()).toEqual([C1, C2]);
    expect((await b.presence.roster(DECK)).map((r) => r.clientId).sort()).toEqual([C1, C2]);
    expect(a.seen.some((e) => e.type === 'presence' && e.clientId === C2)).toBe(true);
    expect(b.seen.some((e) => e.type === 'presence' && e.clientId === C1)).toBe(true);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  it('pushes nothing for a heartbeat that moves the clock alone, and pushes the refresh once the row has under half its life left', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    const after = puts(client);
    expect(after).toBe(3); // the copy, the record and the deck's pulse (the cycle 3 fix round)
    expect(client.blobs.has(pulsePath(DECK))).toBe(true);
    time.advance(5000);
    await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471'), TTL);
    time.advance(5000);
    await a.presence.set(DECK, C1, row(C1, 3, 'Titanium 471'), TTL);
    expect(puts(client)).toBe(after);
    // a slide change is pushed at once
    await a.presence.set(DECK, C1, row(C1, 4, 'Titanium 471', 'content-rule'), TTL);
    expect(puts(client)).toBe(after + 3);
    const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect(stored.rows.get(C1)?.state.slideId).toBe('content-rule');
    // the heartbeat that finds the shared row under half its life refreshes it
    time.advance(16_000);
    await a.presence.set(DECK, C1, row(C1, 5, 'Titanium 471', 'content-rule'), TTL);
    expect(puts(client)).toBe(after + 6);
    const refreshed = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect(refreshed.rows.get(C1)?.expiresAt).toBe(time.now() + 30_000);
  });

  it('pushes an idle tab at the quiet heartbeat of 10 s every 20 s, three pushes and nine puts a minute, and the timer pushes a deferred row only once the heartbeats stop (docs/SYNC.md 4.5; cost.editor-idle.calls; sync pass 1 F5)', async () => {
    expect(PRESENCE_REFRESH_TIMER_MS).toBe(5000);
    // after the heartbeat the quiet cadence lands with the least life left (15 s of 30 minus 10 s)
    expect(PRESENCE_REFRESH_TIMER_MS).toBeLessThanOrEqual(PRESENCE_SHARED_TTL_MS / 2 - 10_000);
    vi.useFakeTimers();
    try {
      const client = memoryBlobClient();
      const a = instance(client, () => Date.now(), { pushSpacingMs: PRESENCE_PUSH_SPACING_MS });
      let clock = 0;
      const heartbeat = async (): Promise<void> => {
        clock += 1;
        await a.presence.set(DECK, C1, row(C1, clock, 'Titanium 471'), TTL);
      };
      const pushes = (): number => puts(client) / 3; // the copy, the record and the pulse
      const start = Date.now();
      await heartbeat();
      expect(pushes()).toBe(1);
      // one minute of the quiet cadence, the timers running with the clock: the refresh rides the
      // heartbeat that finds the record's row under half its life, every second heartbeat
      const pushedAt: number[] = [];
      let last = pushes();
      for (let second = 1; second <= 60; second += 1) {
        await vi.advanceTimersByTimeAsync(1000);
        if (second % 10 === 0) await heartbeat();
        if (pushes() !== last) {
          pushedAt.push(second);
          last = pushes();
        }
      }
      expect(pushedAt).toEqual([20, 40, 60]);
      expect(puts(client)).toBe(12);
      expect(a.errors).toEqual([]);
      const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
      expect(stored.rows.get(C1)?.expiresAt).toBe(start + 60_000 + PRESENCE_SHARED_TTL_MS);
      // the heartbeats stop after one more (70 s, deferred at 20 s of life left): the timer
      // pushes that row once at PRESENCE_REFRESH_TIMER_MS of life left and nothing after it
      await vi.advanceTimersByTimeAsync(10_000);
      await heartbeat();
      expect(pushes()).toBe(4);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(pushes()).toBe(4);
      await vi.advanceTimersByTimeAsync(2000);
      expect(pushes()).toBe(5);
      const refreshed = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
      expect(refreshed.rows.get(C1)?.expiresAt).toBe(start + 70_000 + PRESENCE_SHARED_TTL_MS);
      await vi.advanceTimersByTimeAsync(90_000);
      expect(pushes()).toBe(5);
      expect(a.errors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('arms no timer for a row the record holds under a higher clock or a local row that ran out, so a stale heartbeat never makes the timer fire and re-arm at once', async () => {
    vi.useFakeTimers();
    try {
      const client = memoryBlobClient();
      const a = instance(client, () => Date.now(), { pushSpacingMs: PRESENCE_PUSH_SPACING_MS });
      const b = instance(client, () => Date.now(), { pushSpacingMs: PRESENCE_PUSH_SPACING_MS });
      await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
      // the tab's heartbeats moved to b, whose push carries clock 3; a reads it on its poll
      await vi.advanceTimersByTimeAsync(20_000);
      await b.presence.set(DECK, C1, row(C1, 3, 'Titanium 471'), TTL);
      await a.presence.poll(DECK);
      const before = puts(client);
      // a late heartbeat with a lower clock lands on a: not material, and no timer is armed,
      // so the clock runs a minute with no push and no timer of a's firing
      await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471'), TTL);
      const timers = vi.getTimerCount();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(puts(client)).toBe(before);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(timers);
      expect(a.errors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pins the budget: reads on the tick, pushes on a change alone with a five second floor, a selection change starts none', async () => {
    expect(PRESENCE_PUSH_SPACING_MS).toBe(5000);
    expect(PRESENCE_POLL_MS).toBe(5000);
    expect(PRESENCE_POLL_MS).toBeGreaterThanOrEqual(HOSTED_POLL_MS);
    expect(PRESENCE_VOLATILE_FIELDS).toEqual(['selection', 'follow', 'pointerOn']);
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now, { pushSpacingMs: PRESENCE_PUSH_SPACING_MS });
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    const after = puts(client);
    // a selection change travels with the next push and starts none
    time.advance(1000);
    await a.presence.set(
      DECK,
      C1,
      { ...row(C1, 2, 'Titanium 471'), selection: { blockIds: ['h'] } },
      TTL,
    );
    expect(puts(client)).toBe(after);
    // a slide change inside the floor waits for it, then one push carries both
    await a.presence.set(
      DECK,
      C1,
      { ...row(C1, 3, 'Titanium 471', 'content-rule'), selection: { blockIds: ['h'] } },
      TTL,
    );
    expect(puts(client)).toBe(after);
    time.advance(PRESENCE_PUSH_SPACING_MS);
    await a.presence.flush(DECK);
    expect(puts(client)).toBe(after + 3);
    const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect(stored.rows.get(C1)?.state.slideId).toBe('content-rule');
    expect(stored.rows.get(C1)?.state.selection).toEqual({ blockIds: ['h'] });
  });

  it('reads on poll alone and never writes from it; confirm() keeps a roster read fresh while the pulse says nothing moved', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now, { pushSpacingMs: 60_000 });
    const b = instance(client, time.now, { pushSpacingMs: 60_000 });
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen.map((e) => e.type)).toEqual(['presence']);
    // a pending change inside the floor: a poll reads and writes nothing
    time.advance(1000);
    await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471', 'content-rule'), TTL);
    const before = puts(client);
    await a.presence.poll(DECK);
    expect(puts(client)).toBe(before);
    // roster() on an undriven deck reads the record once it is older than the poll interval;
    // confirm() (the pulse did not move) counts the record as read now, so no head goes
    const heads = (): number => client.calls.filter((call) => call.op === 'head').length;
    time.advance(PRESENCE_POLL_MS + 1);
    b.presence.confirm(DECK);
    const h = heads();
    await b.presence.roster(DECK);
    expect(heads()).toBe(h);
    time.advance(PRESENCE_POLL_MS + 1);
    await b.presence.roster(DECK);
    expect(heads()).toBe(h + 1);
  });

  it('reads the record through its immutable copy while the store serves the overwritten body stale', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen).toHaveLength(1);
    // the CDN keeps the first body for every later get of the record's own path
    client.holdGet();
    await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471', 'content-rule'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen[1]).toMatchObject({
      type: 'presence',
      clientId: C1,
      clock: 2,
      state: { slideId: 'content-rule' },
    });
    const version = b.presence.version(DECK)!;
    expect(client.blobs.has(presenceCopyPath(DECK, version))).toBe(true);
    client.releaseGet();
    expect(b.errors).toEqual([]);
  });

  it('keeps the live pointer on the instance that received it and lists every instance in a fresh roster read', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    await a.presence.set(DECK, C1, { ...row(C1, 1, 'Titanium 471'), pointer: { x: 8, y: 9 } }, TTL);
    expect((await a.presence.roster(DECK))[0]?.pointer).toEqual({ x: 8, y: 9 });
    // a fresh instance's hello reads the record without a poll or a watch
    const b = instance(client, time.now);
    const roster = await b.presence.roster(DECK);
    expect(roster.map((r) => r.clientId)).toEqual([C1]);
    expect(roster[0]).not.toHaveProperty('pointer');
    expect(b.seen).toEqual([{ type: 'presence', clientId: C1, clock: 1, state: roster[0] }]);
  });

  it('deletes the copies this instance wrote once they are a minute old and keeps the current one', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now, { copyGraceMs: 60_000 });
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    const first = presenceCopyPath(DECK, a.presence.version(DECK)!);
    time.advance(61_000);
    await a.presence.set(DECK, C1, row(C1, 2, 'Titanium 471', 'content-rule'), TTL);
    const second = presenceCopyPath(DECK, a.presence.version(DECK)!);
    expect(client.blobs.has(first)).toBe(false);
    expect(client.blobs.has(second)).toBe(true);
    expect(client.calls.some((call) => call.op === 'del' && call.pathname === first)).toBe(true);
  });

  it('announces the newer state when a client moves to another instance and yields the older local row', async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    // the client's next posts land on b
    await b.presence.set(DECK, C1, row(C1, 2, 'Titanium 471', 'content-rule'), TTL);
    await a.presence.poll(DECK);
    expect(a.seen[1]).toMatchObject({ type: 'presence', clientId: C1, clock: 2 });
    const roster = await a.presence.roster(DECK);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ clock: 2, slideId: 'content-rule' });
  });

  it('polls on the interval while watched and stops with the last watcher', async () => {
    const client = memoryBlobClient();
    const a = instance(client, Date.now, { pollMs: 20 });
    const b = instance(client, Date.now, { pollMs: 20 });
    const stop = b.presence.watch(DECK);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    const started = Date.now();
    while (b.seen.length === 0 && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(b.seen[0]).toMatchObject({ type: 'presence', clientId: C1 });
    stop();
    const heads = client.calls.filter((call) => call.op === 'head').length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(client.calls.filter((call) => call.op === 'head').length).toBe(heads);
    await a.presence.close();
    await b.presence.close();
  });

  it("schedules one push at the floor when no read proved the record, so a closed tab's leave lands once the copy is readable without another event of the deck (b4.md C3T-R1)", async () => {
    const base = memoryBlobClient();
    // the copy under the head's version is not found while `copiesHidden` (the CDN lags the copy)
    let copiesHidden = false;
    const client = new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === 'get')
          return async (
            pathname: string,
            options?: Parameters<FakeBlobClient['get']>[1],
          ): ReturnType<FakeBlobClient['get']> =>
            copiesHidden && pathname.includes('/presence/') ? null : target.get(pathname, options);
        return Reflect.get(target, prop, receiver) as unknown;
      },
    }) as FakeBlobClient;
    const time = fakeClock();
    const spacing = 20;
    const a = instance(client, time.now, { pushSpacingMs: spacing });
    const b = instance(client, time.now);
    await a.presence.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    // the store's body lags from here on: get() keeps answering the record a wrote
    base.holdGet();
    time.advance(spacing);
    await b.presence.set(DECK, C2, row(C2, 1, 'Cobalt 12'), TTL);
    copiesHidden = true;
    time.advance(spacing);
    const heads = (): number => base.calls.filter((call) => call.op === 'head').length;
    const recordPuts = (): number =>
      base.calls.filter((call) => call.op === 'put' && call.pathname === presencePath(DECK)).length;
    const putsBefore = recordPuts();
    const headsBefore = heads();
    // the closed tab's beacon lands on a: one read, unproven, no write, the push waits
    await a.presence.leave(DECK, C1);
    expect(a.errors).toEqual([
      `presence: push: ${presencePath(DECK)}: no read proved the record; the push waits`,
    ]);
    // one read: readRemote's head and provenGet's own; no write
    expect(heads()).toBe(headsBefore + 2);
    expect(recordPuts()).toBe(putsBefore);
    expect(a.seen.at(-1)).toEqual({ type: 'leave', clientId: C1 });
    // before the fix nothing was scheduled here and the tombstone waited for the next set, leave
    // or timer of the deck on this instance. Now the store becomes readable, the floor passes and
    // the one scheduled push lands the tombstone with no other call on a
    copiesHidden = false;
    base.releaseGet();
    time.advance(spacing);
    await new Promise((resolve) => setTimeout(resolve, spacing * 4));
    expect(recordPuts()).toBe(putsBefore + 1);
    const stored = parsePresenceRecord<Row>(base.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()]).toEqual([C2]);
    expect(stored.left.has(C1)).toBe(true);
    expect(a.errors).toHaveLength(1);
    await b.presence.poll(DECK);
    expect(b.seen.at(-1)).toEqual({ type: 'leave', clientId: C1 });
    expect(await b.presence.roster(DECK)).toHaveLength(1);
  });

  it("never lands a set posted before the tab's leave beacon on the same instance: a set at or below the tombstone's clock is refused and the pending leave stays (b4.md C3T-R2)", async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    // a 20 s floor (under the 30 s a row lives) holds every push after the first, so the leave
    // and the late set meet in `pending` and the came-back row is still alive at its flush
    const a = instance(client, time.now, { pushSpacingMs: 20_000 });
    await a.presence.set(DECK, C1, row(C1, 3, 'Titanium 471'), TTL);
    time.advance(10);
    // the beacon carries presenceClock + 1 (room-client.ts stop), above every set of the tab
    await a.presence.leave(DECK, C1, 5);
    const leftAt = time.now();
    time.advance(10);
    // the route's set handler for a post the tab made before it left runs after the leave
    await a.presence.set(DECK, C1, row(C1, 4, 'Titanium 471', 'content-rule'), TTL);
    expect(a.seen.map((e) => e.type)).toEqual(['presence', 'leave']);
    expect(await a.presence.roster(DECK)).toEqual([]);
    time.advance(20_000);
    await a.presence.flush(DECK);
    const stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()]).toEqual([]);
    expect(stored.left.get(C1)).toEqual({ at: leftAt, clock: 5 });
    // a tab that came back posts above the beacon's clock and lands
    time.advance(10);
    await a.presence.set(DECK, C1, row(C1, 6, 'Titanium 471'), TTL);
    expect((await a.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    time.advance(20_000);
    await a.presence.flush(DECK);
    const again = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...again.rows.keys()]).toEqual([C1]);
    expect([...a.errors]).toEqual([]);
  });

  it("keeps the beacon's clock in the record's tombstone, so a set with a lower clock pushed from another instance after the leave never lands and one above it does (b4.md C3T-R2)", async () => {
    const client = memoryBlobClient();
    const time = fakeClock();
    const a = instance(client, time.now);
    const b = instance(client, time.now, { pushSpacingMs: 60_000 });
    await a.presence.set(DECK, C1, row(C1, 3, 'Titanium 471'), TTL);
    await b.presence.poll(DECK);
    expect(b.seen.map((e) => e.type)).toEqual(['presence']);
    // the beacon lands on a and its tombstone is written with the clock
    time.advance(10);
    await a.presence.leave(DECK, C1, 5);
    const leftAt = time.now();
    let stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect(stored.left.get(C1)).toEqual({ at: leftAt, clock: 5 });
    // b's set handler ran after the tombstone was written, for a post below the beacon's clock;
    // its `at` is after the tombstone's, which the time rule alone would let land
    time.advance(10);
    await b.presence.set(DECK, C1, row(C1, 4, 'Titanium 471', 'content-rule'), TTL);
    await b.presence.flush(DECK);
    stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()]).toEqual([]);
    expect(stored.left.get(C1)).toEqual({ at: leftAt, clock: 5 });
    expect(b.seen.at(-1)).toEqual({ type: 'leave', clientId: C1 });
    expect(await b.presence.roster(DECK)).toEqual([]);
    await a.presence.poll(DECK);
    expect(await a.presence.roster(DECK)).toEqual([]);
    // the tab came back: a set above the beacon's clock lands from any instance
    time.advance(10);
    await b.presence.set(DECK, C1, row(C1, 6, 'Titanium 471'), TTL);
    await b.presence.flush(DECK);
    stored = parsePresenceRecord<Row>(client.blobs.get(presencePath(DECK))!.bytes);
    expect([...stored.rows.keys()]).toEqual([C1]);
    await a.presence.poll(DECK);
    expect((await a.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  it('keeps presence per instance when there is no Blob client', async () => {
    const seen: SharedPresenceEvent<Row>[] = [];
    const a = sharedPresence<Row>({
      client: async () => null,
      publish: (_deckId, event) => seen.push(event),
    });
    await a.set(DECK, C1, row(C1, 1, 'Titanium 471'), TTL);
    expect(seen).toHaveLength(1);
    expect((await a.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);
    await a.close();
  });
});

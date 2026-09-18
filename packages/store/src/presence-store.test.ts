// The shared presence roster of the blob tier (the focus round, cycle 3; VERIFICATION.md C2-F28):
// two `sharedPresence` instances over one fake Blob store stand in for two function instances.
// A row set on one reaches the other's listeners within one poll and its roster, a leave clears
// it everywhere, a row without a heartbeat leaves every roster inside 30 s, a tombstone beats a
// set pushed late from another instance, two concurrent writers both land through the ifMatch
// retry, a heartbeat alone pushes nothing until the row's remaining life is under half, the CDN's
// stale body is read through the immutable copy, the pointer stays per instance and the old
// copies are deleted.
import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  PRESENCE_POLL_MS,
  PRESENCE_PUSH_SPACING_MS,
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
    expect(stored.left.get(C1)).toBe(leftAt);
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

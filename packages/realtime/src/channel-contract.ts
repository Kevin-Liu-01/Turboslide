// The RealtimeChannel contract as a shared test body (SPEC-3 3.2): memory.test.ts and
// redis.test.ts run it over their implementation, so the two tiers agree on the stream, the
// presence roster, the bindings, the locks, the budgets and the flags. Test code only; the
// package's exports never name it.
import { describe, expect, it } from 'vitest';

import type { CommentOp, Thread } from '@turboslide/schema/comments';
import type { Author } from '@turboslide/schema/mutations';

import type { NewEntry, RealtimeChannel, RoomEvent, RosterEntry } from './channel.ts';

export const CLIENT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const CLIENT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const kevin: Author = { kind: 'human', name: 'kevin' };
export const maya: Author = { kind: 'human', name: 'maya' };

export function editEntry(
  clientId: string,
  n: number,
  author: Author = kevin,
  value: number = n,
): NewEntry {
  return {
    rev: 412,
    kind: 'edit',
    author,
    clientId,
    opId: `${clientId}:${n}`,
    mutations: [
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value },
    ],
    at: '2026-09-13T10:00:00.000Z',
  };
}

export const THREAD_ID = '01j8z2kmayaq4e0s7r9x2v8b3c';
export const PRINCIPAL_A = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';

/** A valid thread of the schema's shape at a block anchor. */
export function threadFixture(id: string = THREAD_ID, text = 'Check this'): Thread {
  return {
    id,
    deckId: 'gt-brand',
    anchor: { kind: 'block', slideId: 'content-rule', blockId: 'p1' },
    comment: {
      id,
      author: { principalId: PRINCIPAL_A, label: 'Titanium 471', kind: 'human' },
      createdAt: '2026-09-13T10:00:00.000Z',
      body: { text, mentions: [] },
    },
    replies: [],
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    revision: 0,
  };
}

/** A `kind: 'comment'` entry adding a thread. */
export function commentEntry(
  clientId: string,
  n: number,
  op: CommentOp = { op: 'add', thread: threadFixture() },
  author: Author = kevin,
): NewEntry {
  return {
    rev: 412,
    kind: 'comment',
    author,
    clientId,
    opId: `${clientId}:${n}`,
    comment: op,
    at: '2026-09-13T10:00:00.000Z',
  };
}

export function rosterEntry(clientId: string, clock: number, label: string): RosterEntry {
  return {
    clientId,
    clock,
    slideId: 'content-rule',
    pointerOn: false,
    presenting: false,
    principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
    label,
    trust: 'label',
    mark: { kind: 'initials', text: label[0] ?? 'T' },
    hueSlot: 1,
    kind: 'human',
    role: 'editor',
  };
}

/** Waits until the predicate holds or the time runs out (pub/sub delivers asynchronously). */
export async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

export type ContractSetup = () => Promise<{
  channel: RealtimeChannel;
  /** a second instance over the same backing store; the channel itself when the tier has one instance */
  peer: RealtimeChannel;
  /** moves the clock the channels read by ms */
  advance: (ms: number) => void;
}>;

export function channelContract(name: string, setup: ContractSetup): void {
  describe(`RealtimeChannel contract over ${name}`, () => {
    it('appends after the head, numbers entries from 1 and reads them back in order', async () => {
      const { channel, peer } = await setup();
      expect(await channel.head('gt-brand')).toBe(0);
      const first = await channel.append('gt-brand', 0, [
        editEntry(CLIENT_A, 1),
        editEntry(CLIENT_A, 2),
      ]);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.entries.map((entry) => entry.seq)).toEqual([1, 2]);
      expect(first.entries[0]).toMatchObject({ opId: `${CLIENT_A}:1`, author: kevin, rev: 412 });
      expect(await peer.head('gt-brand')).toBe(2);
      const second = await peer.append('gt-brand', 2, [editEntry(CLIENT_B, 1, maya)]);
      expect(second.ok && second.entries[0]?.seq).toBe(3);
      const all = await channel.since('gt-brand', 0, 10);
      expect(all.map((entry) => [entry.seq, entry.opId])).toEqual([
        [1, `${CLIENT_A}:1`],
        [2, `${CLIENT_A}:2`],
        [3, `${CLIENT_B}:1`],
      ]);
      expect((await channel.since('gt-brand', 1, 1)).map((entry) => entry.seq)).toEqual([2]);
      expect(await channel.since('gt-brand', 3, 10)).toEqual([]);
      // another deck is another stream
      expect(await channel.head('mood-compass')).toBe(0);
    });

    it('answers the head and the count on a stale base, never the entries (report 10 F34)', async () => {
      const { channel, peer } = await setup();
      await channel.append('gt-brand', 0, [editEntry(CLIENT_A, 1), editEntry(CLIENT_A, 2)]);
      const stale = await peer.append('gt-brand', 0, [editEntry(CLIENT_B, 1, maya)]);
      expect(stale).toEqual({ ok: false, head: 2, count: 2 });
      expect(await channel.head('gt-brand')).toBe(2);
      // the writer reads the count with since, transforms and retries at the head
      const gap = await peer.since('gt-brand', 0, 2);
      expect(gap).toHaveLength(2);
      const retry = await peer.append('gt-brand', 2, [editEntry(CLIENT_B, 1, maya)]);
      expect(retry.ok && retry.entries[0]?.seq).toBe(3);
    });

    it('makes other writers yield while one holds the append lock (SPEC-3 3.4 step 5)', async () => {
      const { channel, peer, advance } = await setup();
      const lockKey = 'deck:gt-brand:append';
      expect(await channel.lock(lockKey, 'holder', 200)).toBe(true);
      expect(await peer.append('gt-brand', 0, [editEntry(CLIENT_B, 1, maya)])).toEqual({
        ok: false,
        head: 0,
        count: 0,
        locked: true,
      });
      const own = await channel.append('gt-brand', 0, [editEntry(CLIENT_A, 1)], {
        token: 'holder',
      });
      expect(own.ok && own.entries[0]?.seq).toBe(1);
      await channel.unlock(lockKey, 'holder');
      expect((await peer.append('gt-brand', 1, [editEntry(CLIENT_B, 1, maya)])).ok).toBe(true);
      // an expired lock holds nobody
      expect(await channel.lock(lockKey, 'holder', 100)).toBe(true);
      advance(150);
      expect((await peer.append('gt-brand', 2, [editEntry(CLIENT_B, 2, maya)])).ok).toBe(true);
    });

    it('delivers every admitted op to every instance’s listeners in order', async () => {
      const { channel, peer } = await setup();
      const seenA: RoomEvent[] = [];
      const seenB: RoomEvent[] = [];
      const stopA = channel.subscribe('gt-brand', (event) => seenA.push(event));
      const stopB = peer.subscribe('gt-brand', (event) => seenB.push(event));
      await until(() => true);
      await channel.append('gt-brand', 0, [editEntry(CLIENT_A, 1)]);
      await peer.append('gt-brand', 1, [
        editEntry(CLIENT_B, 1, maya),
        editEntry(CLIENT_B, 2, maya),
      ]);
      await until(() => seenA.length >= 3 && seenB.length >= 3);
      const seqs = (events: RoomEvent[]): number[] =>
        events.flatMap((event) => (event.type === 'op' ? [event.entry.seq] : []));
      expect(seqs(seenA)).toEqual([1, 2, 3]);
      expect(seqs(seenB)).toEqual([1, 2, 3]);
      stopA();
      stopB();
      await channel.append('gt-brand', 3, [editEntry(CLIENT_A, 2)]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(seenA).toHaveLength(3);
      expect(seenB).toHaveLength(3);
    });

    it('publishes an event to the other instance', async () => {
      const { channel, peer } = await setup();
      const seen: RoomEvent[] = [];
      const stop = peer.subscribe('gt-brand', (event) => seen.push(event));
      await until(() => true);
      await channel.publish('gt-brand', { type: 'access', revision: 7 });
      await channel.publish('gt-brand', {
        type: 'checkpoint',
        revision: 413,
        fromSeq: 1,
        toSeq: 3,
        author: kevin,
        note: '',
      });
      await until(() => seen.length >= 2);
      expect(seen[0]).toEqual({ type: 'access', revision: 7 });
      expect(seen[1]).toMatchObject({ type: 'checkpoint', revision: 413, toSeq: 3 });
      stop();
    });

    it('trims retained entries after a checkpoint', async () => {
      const { channel } = await setup();
      const entries = Array.from({ length: 6 }, (_, i) => editEntry(CLIENT_A, i + 1));
      await channel.append('gt-brand', 0, entries);
      await channel.trim('gt-brand', { minSeq: 3 });
      expect((await channel.since('gt-brand', 0, 10)).map((entry) => entry.seq)).toEqual([
        3, 4, 5, 6,
      ]);
      await channel.trim('gt-brand', { maxEntries: 2 });
      expect((await channel.since('gt-brand', 0, 10)).map((entry) => entry.seq)).toEqual([5, 6]);
      // the head never moves back
      expect(await channel.head('gt-brand')).toBe(6);
    });

    it('keeps a roster with expiry, drops an older clock, announces presence and leave', async () => {
      const { channel, peer, advance } = await setup();
      const seen: RoomEvent[] = [];
      const stop = peer.subscribe('gt-brand', (event) => seen.push(event));
      await until(() => true);
      await channel.presence.set(
        'gt-brand',
        CLIENT_A,
        rosterEntry(CLIENT_A, 2, 'Titanium 471'),
        1000,
      );
      await channel.presence.set('gt-brand', CLIENT_B, rosterEntry(CLIENT_B, 1, 'Cobalt 12'), 5000);
      const roster = await peer.presence.roster('gt-brand');
      expect(roster.map((row) => row.label).sort()).toEqual(['Cobalt 12', 'Titanium 471']);
      // a late batch with an older clock changes nothing
      await channel.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Late'), 1000);
      expect(
        (await peer.presence.roster('gt-brand')).find((row) => row.clientId === CLIENT_A)?.label,
      ).toBe('Titanium 471');
      advance(1500);
      expect((await peer.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([
        CLIENT_B,
      ]);
      await channel.presence.leave('gt-brand', CLIENT_B);
      expect(await peer.presence.roster('gt-brand')).toEqual([]);
      await until(() => seen.some((event) => event.type === 'leave'));
      const presence = seen.filter((event) => event.type === 'presence');
      expect(presence.length).toBeGreaterThanOrEqual(2);
      expect(presence[0]).toMatchObject({ type: 'presence', clientId: CLIENT_A, clock: 2 });
      expect(seen.find((event) => event.type === 'leave')).toEqual({
        type: 'leave',
        clientId: CLIENT_B,
      });
      stop();
    });

    it('binds a client id to its session for a while (report 10 F26)', async () => {
      const { channel, peer, advance } = await setup();
      expect(await peer.presence.owner('gt-brand', CLIENT_A)).toBeNull();
      await channel.presence.bind('gt-brand', CLIENT_A, 'sess_1', 1000);
      expect(await peer.presence.owner('gt-brand', CLIENT_A)).toBe('sess_1');
      expect(await peer.presence.owner('mood-compass', CLIENT_A)).toBeNull();
      advance(1500);
      expect(await peer.presence.owner('gt-brand', CLIENT_A)).toBeNull();
      await expect(channel.presence.bind('gt-brand', 'tab-1', 'sess_1', 1000)).rejects.toThrow(
        TypeError,
      );
    });

    it('takes, refreshes, breaks and releases the checkpoint lock (SPEC-3 0.8)', async () => {
      const { channel, peer, advance } = await setup();
      expect(await channel.lock('deck:gt-brand:ckpt', 'tokenA', 5000)).toBe(true);
      expect(await peer.lock('deck:gt-brand:ckpt', 'tokenB', 5000)).toBe(false);
      expect(await peer.heartbeat('deck:gt-brand:ckpt', 'tokenB')).toBe(false);
      advance(1000);
      expect(await channel.heartbeat('deck:gt-brand:ckpt', 'tokenA')).toBe(true);
      // a heartbeat 2 s old is not stale at 3 s; 4 s old is
      advance(2000);
      expect(await peer.lock('deck:gt-brand:ckpt', 'tokenB', 5000, { staleMs: 3000 })).toBe(false);
      advance(2000);
      expect(await peer.lock('deck:gt-brand:ckpt', 'tokenB', 5000, { staleMs: 3000 })).toBe(true);
      // the old holder lost it: its heartbeat and unlock touch nothing
      expect(await channel.heartbeat('deck:gt-brand:ckpt', 'tokenA')).toBe(false);
      await channel.unlock('deck:gt-brand:ckpt', 'tokenA');
      expect(await channel.lock('deck:gt-brand:ckpt', 'tokenC', 5000)).toBe(false);
      await peer.unlock('deck:gt-brand:ckpt', 'tokenB');
      expect(await channel.lock('deck:gt-brand:ckpt', 'tokenC', 1000)).toBe(true);
      // the TTL frees it without an unlock
      advance(1500);
      expect(await peer.lock('deck:gt-brand:ckpt', 'tokenD', 1000)).toBe(true);
    });

    it('counts a fixed window budget and answers the time to the window’s end', async () => {
      const { channel, peer, advance } = await setup();
      const key = 'q:usr_a:ops:1';
      expect(await channel.budget(key, 1, 3, 60_000)).toEqual({ ok: true, retryAfterMs: 0 });
      expect(await peer.budget(key, 2, 3, 60_000)).toEqual({ ok: true, retryAfterMs: 0 });
      advance(10_000);
      const over = await channel.budget(key, 1, 3, 60_000);
      expect(over.ok).toBe(false);
      expect(over.retryAfterMs).toBeGreaterThan(0);
      expect(over.retryAfterMs).toBeLessThanOrEqual(50_000);
      // another window is another key (keys.ts budgetKey carries the window)
      expect((await channel.budget('q:usr_a:ops:2', 1, 3, 60_000)).ok).toBe(true);
    });

    it('reads flags as on by default and refuses an unknown name', async () => {
      const { channel } = await setup();
      expect(await channel.flag('realtime')).toBe(true);
      expect(await channel.flag('readOnly')).toBe(true);
      await expect(channel.flag('chat')).rejects.toThrow(TypeError);
    });

    it('refuses a deck id that is not a slug on every call', async () => {
      const { channel } = await setup();
      await expect(channel.head('Gt-Brand')).rejects.toThrow(TypeError);
      await expect(channel.append('a/b', 0, [])).rejects.toThrow(TypeError);
      expect(() => channel.subscribe('', () => {})).toThrow(TypeError);
    });
  });
}

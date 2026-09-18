// The blob channel over a deck store (SPEC-3 2.5, 3.7 e): every append is a commit whose
// revision is the seq, `since` reads the version log, a stale base answers the head, two
// channels over one store see each other's records through the watch channel, comment entries
// need the comments store, presence stays per instance without the shared half and travels
// through the store's presence record with it (the focus round, cycle 3; VERIFICATION C2-F28).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { BlobClient } from '@turboslide/store/blob-store';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';
import { applyAndPush, localIndexEtag, watchSidecarIndex } from '@turboslide/store/comments-store';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';
import { sharedPresence } from '@turboslide/store/presence-store';
import {
  HOSTED_POLL_MS,
  POLL_CALLS_PER_MINUTE_MAX,
  headPulse,
  pulsePath,
} from '@turboslide/store/pulse';

import { ConflictError } from '@turboslide/schema/errors';

import { blobChannel, isDeckGone, isLostRace } from './blob.ts';
import type { RoomEvent, RosterEntry } from './channel.ts';
import { roomEventSchema } from './protocol.ts';
import {
  CLIENT_A,
  CLIENT_B,
  THREAD_ID,
  commentEntry,
  editEntry,
  kevin,
  maya,
  rosterEntry,
  threadFixture,
  until,
} from './channel-contract.ts';

function writeRawDeck(dir: string): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES) {
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  }
}

describe('blobChannel', () => {
  let root: string;
  let dir: string;
  let store: FileStore;
  const now = '2026-09-13T10:00:00.000Z';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-realtime-'));
    dir = join(root, 'decks', 'gt-brand');
    writeRawDeck(dir);
    store = openFileStore({ dir, now: () => now });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('commits an append as one record whose revision is the seq, and answers a stale base', async () => {
    const channel = blobChannel({ open: async () => store, minWriteSpacingMs: 0 });
    expect(channel.tier).toBe('blob');
    expect(await channel.head('gt-brand')).toBe(412);
    const seen: RoomEvent[] = [];
    channel.subscribe('gt-brand', (event) => seen.push(event));
    const result = await channel.append('gt-brand', 412, [
      editEntry(CLIENT_A, 1, kevin, 22),
      editEntry(CLIENT_A, 2, kevin, 24),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.seq)).toEqual([413, 413]);
    expect(await store.revision()).toBe(413);
    const records = await store.records();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ revision: 413, baseRevision: 412, author: kevin });
    // the two sets of one pointer folded into the last value (SPEC-3 0.51)
    expect(records[0]?.mutations).toEqual([
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 24 },
    ]);
    // the writer's own listeners saw the ops and the checkpoint the commit is
    expect(seen.map((event) => event.type)).toEqual(['op', 'op', 'checkpoint']);
    expect(seen[2]).toMatchObject({ type: 'checkpoint', revision: 413, fromSeq: 413, toSeq: 413 });
    // since reads the log: one entry per record, the revision as its seq
    const since = await channel.since('gt-brand', 412, 10);
    expect(since).toHaveLength(1);
    expect(since[0]).toMatchObject({
      seq: 413,
      rev: 412,
      opId: 'store:1',
      clientId: 'store',
      author: kevin,
    });
    expect(await channel.since('gt-brand', 413, 10)).toEqual([]);
    // a stale base answers the head and the count
    expect(await channel.append('gt-brand', 412, [editEntry(CLIENT_B, 1, maya)])).toEqual({
      ok: false,
      head: 413,
      count: 1,
    });
    await channel.close();
  });

  it('refuses an invalid write and a comment entry without a comments store', async () => {
    const channel = blobChannel({ open: async () => store, minWriteSpacingMs: 0 });
    await expect(
      channel.append('gt-brand', 412, [
        { ...editEntry(CLIENT_A, 1), mutations: [{ op: 'slide.remove', slideId: 'missing' }] },
      ]),
    ).rejects.toThrow(TypeError);
    expect(await store.revision()).toBe(412);
    const comment = commentEntry(CLIENT_A, 2);
    await expect(channel.append('gt-brand', 412, [comment])).rejects.toThrow(/comments store/);
    // with the comments store attached, the comment lands without a revision change
    const applied: string[] = [];
    const withComments = blobChannel({
      open: async () => store,
      minWriteSpacingMs: 0,
      applyComments: async (deckId, entries) => {
        applied.push(...entries.map((entry) => `${deckId}:${entry.opId}`));
      },
    });
    const result = await withComments.append('gt-brand', 412, [comment]);
    expect(result.ok && result.entries[0]?.seq).toBe(412);
    expect(applied).toEqual([`gt-brand:${CLIENT_A}:2`]);
    expect(await store.revision()).toBe(412);
  });

  it('shows another instance’s commit through the watch channel as an op and a checkpoint', async () => {
    const a = blobChannel({
      open: async () => openFileStore({ dir, now: () => now }),
      minWriteSpacingMs: 0,
    });
    const b = blobChannel({
      open: async () => openFileStore({ dir, now: () => now }),
      minWriteSpacingMs: 0,
    });
    const seen: RoomEvent[] = [];
    const stop = b.subscribe('gt-brand', (event) => seen.push(event));
    // the watcher takes its position first; give it a moment before the write lands
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await a.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]);
    expect(result.ok).toBe(true);
    await until(() => seen.some((event) => event.type === 'checkpoint'), 4000);
    const op = seen.find((event) => event.type === 'op');
    expect(op).toMatchObject({ type: 'op', entry: { seq: 413, opId: 'store:1', author: kevin } });
    expect(seen.find((event) => event.type === 'checkpoint')).toMatchObject({
      type: 'checkpoint',
      revision: 413,
    });
    expect(await b.head('gt-brand')).toBe(413);
    // presence is per instance on this tier without the shared half (the test below has it)
    await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Titanium 471'), 5000);
    expect(await a.presence.roster('gt-brand')).toHaveLength(1);
    expect(await b.presence.roster('gt-brand')).toEqual([]);
    stop();
    await a.close();
    await b.close();
  });

  it("shares presence and a pushed comment across two instances through the store's presence record and the comments index poll (VERIFICATION C2-F28)", async () => {
    const blob = memoryBlobClient();
    const proven = { fetchFresh: async () => null, retries: 0, sleep: async () => {} };
    const dirB = join(root, 'b', 'decks', 'gt-brand');
    writeRawDeck(dirB);
    const instance = (mirror: string) => {
      const channel = blobChannel({
        open: async () => openFileStore({ dir: mirror, now: () => now }),
        minWriteSpacingMs: 0,
        shared: {
          presence: sharedPresence<RosterEntry>({
            client: blob,
            publish: (deckId, event) => void channel.publish(deckId, event),
            pushSpacingMs: 0,
            proven,
          }),
          pulse: (deckId) => headPulse(blob, deckId),
          watchComments: (deckId, onChange) =>
            watchSidecarIndex(blob, deckId, onChange, {
              pollMs: null,
              localEtag: () => localIndexEtag(mirror),
              proven,
            }),
          pollMs: 20,
        },
      });
      return channel;
    };
    const a = instance(dir);
    const b = instance(dirB);
    const seen: RoomEvent[] = [];
    const stop = b.subscribe('gt-brand', (event) => seen.push(event));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // a presence write on a reaches b's listeners and b's roster (the hello of a later stream)
    await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Titanium 471'), 120_000);
    await until(() => seen.some((event) => event.type === 'presence'), 4000);
    expect(seen.find((event) => event.type === 'presence')).toMatchObject({
      type: 'presence',
      clientId: CLIENT_A,
      state: { label: 'Titanium 471' },
    });
    expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
    // the leave (a closed tab's beacon, on a) clears the chip on b
    await a.presence.leave('gt-brand', CLIENT_A);
    await until(() => seen.some((event) => event.type === 'leave'), 4000);
    expect(await b.presence.roster('gt-brand')).toEqual([]);
    // a comment pushed to the sidecar from a's mirror becomes a checkpoint frame with
    // `comments` on b, which every tab answers with comment.list
    await applyAndPush(
      blob,
      'gt-brand',
      dir,
      [{ op: 'add', thread: threadFixture() }],
      now,
      4,
      proven,
    );
    await until(
      () =>
        seen.some(
          (event) =>
            event.type === 'checkpoint' && event.comments?.threadIds.includes(THREAD_ID) === true,
        ),
      4000,
    );
    const frame = seen.find((event) => event.type === 'checkpoint' && event.comments !== undefined);
    expect(frame).toMatchObject({
      type: 'checkpoint',
      comments: { revision: 1, threadIds: [THREAD_ID] },
    });
    stop();
    await a.close();
    await b.close();
  });

  describe('the store poll on the blob tier budget (the cycle 3 fix round; VERIFICATION C3-F1, C3-F2)', () => {
    const proven = { fetchFresh: async () => null, retries: 0, sleep: async () => {} };
    /** The seed of the store's tests, pushed to a fake store; two channels over two mirrors of it. */
    const setup = async (
      options: { pollMs?: number; client?: (fake: BlobClient) => BlobClient } = {},
    ) => {
      const fake = memoryBlobClient();
      const seedRoot = join(root, 'seed');
      mkdirSync(join(seedRoot, 'gt-brand'), { recursive: true });
      writeRawDeck(join(seedRoot, 'gt-brand'));
      await pushDeckDir(fake, 'gt-brand', join(seedRoot, 'gt-brand'), { overwrite: false });
      const client = options.client === undefined ? fake : options.client(fake);
      const errors: string[] = [];
      const instance = (name: string) => {
        const mirror = join(root, name, 'decks', 'gt-brand');
        const channel = blobChannel({
          open: async () =>
            openBlobStore({
              client,
              deckId: 'gt-brand',
              dir: mirror,
              now: () => now,
              syncTtlMs: 0,
            }),
          minWriteSpacingMs: 0,
          shared: {
            presence: sharedPresence<RosterEntry>({
              client,
              publish: (deckId, event) => void channel.publish(deckId, event),
              pushSpacingMs: 0,
              proven,
            }),
            pulse: (deckId) => headPulse(client, deckId),
            watchComments: (deckId, onChange) =>
              watchSidecarIndex(client, deckId, onChange, {
                pollMs: null,
                localEtag: () => localIndexEtag(mirror),
                proven,
              }),
            pollMs: options.pollMs ?? 20,
          },
          onError: (error, context) =>
            errors.push(`${context}: ${error instanceof Error ? error.message : String(error)}`),
        });
        return channel;
      };
      const calls = (op?: string): number =>
        fake.calls.filter((call) => op === undefined || call.op === op).length;
      return { fake, instance, errors, calls };
    };

    it('makes one head of the pulse per tick while a stream is open, none for a passive listener, and none once the last stream closed', async () => {
      const { fake, instance, calls, errors } = await setup({ pollMs: 20 });
      const a = instance('a');
      const passive = a.subscribe('gt-brand', () => undefined, { passive: true });
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(calls('head')).toBe(0);
      const seen: RoomEvent[] = [];
      const stop = a.subscribe('gt-brand', (event) => seen.push(event));
      // the first tick reads the pulse and, with no pulse read before, the three signals
      await until(() => calls('head') >= 1, 2000);
      await new Promise((resolve) => setTimeout(resolve, 60));
      const heads = fake.calls.filter((call) => call.op === 'head').map((call) => call.pathname);
      expect(heads).toContain(pulsePath('gt-brand'));
      // at rest: one call per tick, the pulse alone
      const before = calls();
      const pulseBefore = heads.filter((path) => path === pulsePath('gt-brand')).length;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const during = fake.calls.slice(before);
      expect(
        during.every((call) => call.op === 'head' && call.pathname === pulsePath('gt-brand')),
      ).toBe(true);
      expect(during.length).toBeGreaterThanOrEqual(6);
      expect(during.length).toBeLessThanOrEqual(12);
      expect(
        fake.calls.filter((call) => call.pathname === pulsePath('gt-brand')).length,
      ).toBeGreaterThan(pulseBefore);
      // the budget in the constants: one call per tick is at most 30 a minute
      expect(Math.ceil(60_000 / HOSTED_POLL_MS)).toBeLessThanOrEqual(POLL_CALLS_PER_MINUTE_MAX);
      // the last stream closes: no call follows
      stop();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const after = calls();
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(calls()).toBe(after);
      passive();
      expect(errors).toEqual([]);
      await a.close();
    });

    it("reads the manifest, the presence record and the comments index when the pulse moved, and announces the other instance's commit, chip and thread", async () => {
      const { instance, errors } = await setup({ pollMs: 20 });
      const a = instance('a');
      const b = instance('b');
      const seen: RoomEvent[] = [];
      const stop = b.subscribe('gt-brand', (event) => seen.push(event));
      await new Promise((resolve) => setTimeout(resolve, 80));
      // a commit on a: its pulse put moves b's poll onto the manifest
      const result = await a.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]);
      expect(result.ok).toBe(true);
      await until(() => seen.some((event) => event.type === 'checkpoint'), 4000);
      expect(seen.find((event) => event.type === 'op')).toMatchObject({
        type: 'op',
        entry: { seq: 413, clientId: 'store' },
      });
      // a presence write on a reaches b's listeners through the same poll
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Titanium 471'), 120_000);
      await until(() => seen.some((event) => event.type === 'presence'), 4000);
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
      stop();
      expect(errors).toEqual([]);
      await a.close();
      await b.close();
    });

    it('backs the poll off when the store refuses and tells the streams, then says the store answers again', async () => {
      let refuse = false;
      const rateLimited = (): Error => {
        const error = new Error(
          'Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in 1 seconds.',
        );
        (error as { retryAfter?: number }).retryAfter = 1;
        return error;
      };
      const { fake, instance, calls } = await setup({
        pollMs: 20,
        client: (raw) => ({
          ...raw,
          head: (pathname, options) =>
            refuse && pathname === pulsePath('gt-brand')
              ? Promise.reject(rateLimited())
              : raw.head(pathname, options),
        }),
      });
      const a = instance('a');
      const seen: RoomEvent[] = [];
      const stop = a.subscribe('gt-brand', (event) => seen.push(event));
      await until(() => calls('head') >= 2, 2000);
      refuse = true;
      await until(() => seen.some((event) => event.type === 'store' && !event.ok), 2000);
      const degraded = seen.find((event) => event.type === 'store');
      expect(degraded).toMatchObject({ type: 'store', ok: false });
      // the store asked for a second: the next poll waits at least that long, so no call goes
      const before = calls();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(calls()).toBe(before);
      // the event is told once per outage and parses as a stream frame
      expect(seen.filter((event) => event.type === 'store')).toHaveLength(1);
      expect(roomEventSchema.parse(degraded)).toEqual(degraded);
      refuse = false;
      await until(() => seen.some((event) => event.type === 'store' && event.ok), 3000);
      stop();
      void fake;
      await a.close();
    });

    it('tells a stream opened during the outage at once that the store refuses, so its title row and its route read the same state as the others (the stream fix round, fix round)', async () => {
      let refuse = false;
      const rateLimited = (): Error => {
        const error = new Error(
          'Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in 1 seconds.',
        );
        (error as { retryAfter?: number }).retryAfter = 1;
        return error;
      };
      const { instance, calls } = await setup({
        pollMs: 20,
        client: (raw) => ({
          ...raw,
          head: (pathname, options) =>
            refuse && pathname === pulsePath('gt-brand')
              ? Promise.reject(rateLimited())
              : raw.head(pathname, options),
        }),
      });
      const a = instance('a');
      const first: RoomEvent[] = [];
      const stopFirst = a.subscribe('gt-brand', (event) => first.push(event));
      await until(() => calls('head') >= 2, 2000);
      refuse = true;
      await until(() => first.some((event) => event.type === 'store' && !event.ok), 2000);
      // a second stream of the deck opens on the instance during the outage: the event went to
      // the streams of the time, so this one is told on its own
      const late: RoomEvent[] = [];
      const stopLate = a.subscribe('gt-brand', (event) => late.push(event));
      await until(() => late.some((event) => event.type === 'store' && !event.ok), 500);
      const told = late.find((event) => event.type === 'store');
      expect(told).toMatchObject({ type: 'store', ok: false });
      if (told?.type === 'store') expect(told.retryAfterMs).toBeGreaterThan(0);
      // a passive listener (the room's own) is told nothing
      const passive: RoomEvent[] = [];
      const stopPassive = a.subscribe('gt-brand', (event) => passive.push(event), {
        passive: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(passive.filter((event) => event.type === 'store')).toHaveLength(0);
      refuse = false;
      await until(() => late.some((event) => event.type === 'store' && event.ok), 3000);
      stopFirst();
      stopLate();
      stopPassive();
      await a.close();
    });
    it('stops the poll with one line when the deck is removed under it, instead of a failure per tick (VERIFICATION C3-F13)', async () => {
      const { fake, instance, calls, errors } = await setup({ pollMs: 20 });
      const a = instance('a');
      const stop = a.subscribe('gt-brand', () => undefined);
      await until(() => calls('head') >= 2, 2000);
      expect(errors).toEqual([]);
      // Delete forever on another instance: every blob of the deck goes while the stream here is open
      await fake.del([...fake.blobs.keys()].filter((key) => key.startsWith('decks/gt-brand/')));
      await until(() => errors.length >= 1, 2000);
      expect(errors[0]).toBe(
        'blob: polling gt-brand stopped, the deck is gone: No deck gt-brand in the Blob store',
      );
      expect(isDeckGone(new RangeError('No deck gt-brand in the Blob store'))).toBe(true);
      expect(isDeckGone(new Error('Vercel Blob: Too many requests'))).toBe(false);
      // no tick follows: no further line and no further call while the stream stays open
      const before = calls();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(errors).toHaveLength(1);
      expect(calls()).toBe(before);
      stop();
      await a.close();
    });
  });

  it('announces a revision the store reached without a readable record as an external checkpoint, so a tab reloads at the head (docs/FOCUS.md rank 20)', async () => {
    const b = blobChannel({
      open: async () => openFileStore({ dir, now: () => now }),
      minWriteSpacingMs: 0,
    });
    const seen: RoomEvent[] = [];
    const stop = b.subscribe('gt-brand', (event) => seen.push(event));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // the manifest moves to 413 with no record behind it: what an instance met when the record
    // of another instance's commit was not stored yet, or its put had failed
    writeFileSync(
      join(dir, 'deck.json'),
      canonicalJson({ ...WORKED_DECK, revision: 413, updatedAt: now }),
    );
    await until(() => seen.some((event) => event.type === 'checkpoint'), 4000);
    expect(seen.filter((event) => event.type === 'op')).toEqual([]);
    expect(seen.find((event) => event.type === 'checkpoint')).toMatchObject({
      type: 'checkpoint',
      revision: 413,
      external: true,
    });
    expect(await b.head('gt-brand')).toBe(413);
    // the announcement is made once: no second checkpoint for the same revision
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(seen.filter((event) => event.type === 'checkpoint')).toHaveLength(1);
    stop();
    await b.close();
  });

  it("announces the records another instance committed between this instance's position and its own write before that write's entries, so a tab's stream holds no gap (VERIFICATION C3S-F8)", async () => {
    // instance B holds a tab's stream and, for this reading, no watch of the store (the blob
    // tier's poll runs every 2 s; the append path is what is read here): its position is 412
    const quiet = (): FileStore => ({
      ...openFileStore({ dir, now: () => now }),
      watch: () => () => undefined,
    });
    const a = blobChannel({
      open: async () => openFileStore({ dir, now: () => now }),
      minWriteSpacingMs: 0,
    });
    const b = blobChannel({ open: async () => quiet(), minWriteSpacingMs: 0 });
    const seen: RoomEvent[] = [];
    const stop = b.subscribe('gt-brand', (event) => seen.push(event));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // another instance commits 413 (a second picture's asset.add, on the instance its upload reached)
    const other = await a.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]);
    expect(other.ok).toBe(true);
    // this instance admits the tab's next write on the moved head (admitOnBlob synced its mirror)
    const mine = await b.append('gt-brand', 413, [editEntry(CLIENT_B, 1, maya, 24)]);
    expect(mine.ok && mine.entries[0]?.seq).toBe(414);
    // the tab's stream got the other instance's record first, then its own write: no gap
    const ops = seen
      .filter((event): event is Extract<RoomEvent, { type: 'op' }> => event.type === 'op')
      .map((event) => [event.entry.seq, event.entry.opId]);
    expect(ops).toEqual([
      [413, 'store:1'],
      [414, `${CLIENT_B}:1`],
    ]);
    const checkpoints = seen
      .filter(
        (event): event is Extract<RoomEvent, { type: 'checkpoint' }> => event.type === 'checkpoint',
      )
      .map((event) => event.revision);
    expect(checkpoints).toEqual([413, 414]);
    // the record announced once: the write moved the position to 414 and nothing is under it
    expect(await b.head('gt-brand')).toBe(414);
    stop();
    await a.close();
    await b.close();
  });

  it('announces a version.restore record as an external checkpoint and never as an op, so every tab reloads at its revision (VERIFICATION F-versions, docs/FOCUS.md rank 21)', async () => {
    const b = blobChannel({
      open: async () => openFileStore({ dir, now: () => now }),
      minWriteSpacingMs: 0,
    });
    const seen: RoomEvent[] = [];
    const stop = b.subscribe('gt-brand', (event) => seen.push(event));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // two writes outside this channel, then a restore of the first (the store resolves the
    // version from its log; a tab cannot)
    const first = await store.write({
      baseRevision: 412,
      author: kevin,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 20 },
      ],
    });
    expect(first.ok).toBe(true);
    const second = await store.write({
      baseRevision: 413,
      author: kevin,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 24 },
      ],
    });
    expect(second.ok).toBe(true);
    const restore = await store.write(
      { baseRevision: 414, author: maya, mutations: [{ op: 'version.restore', n: 1 }] },
      { force: true },
    );
    expect(restore.ok).toBe(true);
    await until(
      () => seen.some((event) => event.type === 'checkpoint' && event.revision === 415),
      4000,
    );
    const ops = seen.filter((event) => event.type === 'op');
    // the two writes travel as ops; the restore does not
    expect(ops.map((event) => (event.type === 'op' ? event.entry.seq : 0))).toEqual([413, 414]);
    expect(
      ops.some(
        (event) =>
          event.type === 'op' &&
          (event.entry.mutations ?? []).some((mutation) => mutation.op === 'version.restore'),
      ),
    ).toBe(false);
    expect(
      seen.find((event) => event.type === 'checkpoint' && event.revision === 415),
    ).toMatchObject({ type: 'checkpoint', revision: 415, external: true, author: maya });
    expect(await b.head('gt-brand')).toBe(415);
    // the announcement is made once
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(
      seen.filter((event) => event.type === 'checkpoint' && event.revision === 415),
    ).toHaveLength(1);
    stop();
    await b.close();
  });

  it('spaces two commits of one deck by the minimum write spacing', async () => {
    const channel = blobChannel({ open: async () => store, minWriteSpacingMs: 150 });
    const started = Date.now();
    expect((await channel.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)])).ok).toBe(
      true,
    );
    expect((await channel.append('gt-brand', 413, [editEntry(CLIENT_A, 2, kevin, 24)])).ok).toBe(
      true,
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(await store.revision()).toBe(414);
    await channel.close();
  });

  it('answers a race the store reports as an error with the head, never by throwing', async () => {
    // the Blob mirror throws StaleMirrorError when the store moved under it and ConflictError
    // when a record was taken first (VERIFICATION-3 finding 19: six 500s beside 34 409s)
    const racy = (error: Error): FileStore =>
      new Proxy(store, {
        get(target, property, receiver) {
          if (property === 'write') return async () => Promise.reject(error);
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
    const stale = new Error('This instance is behind the store');
    stale.name = 'StaleMirrorError';
    expect(isLostRace(stale)).toBe(true);
    expect(isLostRace(new ConflictError('taken', { currentRevision: 413 }))).toBe(true);
    expect(isLostRace(new TypeError('invalid'))).toBe(false);
    for (const error of [stale, new ConflictError('taken', { currentRevision: 413 })]) {
      const channel = blobChannel({ open: async () => racy(error), minWriteSpacingMs: 0 });
      const result = await channel.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.head).toBe(412);
      await channel.close();
    }
    // any other failure still surfaces
    const broken = blobChannel({
      open: async () => racy(new Error('network down')),
      minWriteSpacingMs: 0,
    });
    await expect(
      broken.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]),
    ).rejects.toThrow(/network down/);
    await broken.close();
  });
});

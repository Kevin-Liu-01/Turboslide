// The blob channel over a deck store (SPEC-3 2.5, 3.7 e): every append is a commit whose
// revision is the seq, `since` reads the version log, a stale base answers the head, two
// channels over one store see each other's records through the watch channel, comment entries
// need the comments store, presence is one roster file across instances, and chat messages are
// numbered files every instance lists (SPEC-5 10).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';
import type { BlobStore } from '@turboslide/store/blob-store';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { ConflictError } from '@turboslide/schema/errors';

import { blobChannel, CHAT_PROBE_MIN_MS, isLostRace } from './blob.ts';
import type { NewEntry, RoomEvent } from './channel.ts';
import {
  CLIENT_A,
  CLIENT_B,
  commentEntry,
  editEntry,
  kevin,
  maya,
  rosterEntry,
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
    // since reads the log: one entry per record, the revision as its seq; the record names the
    // tab and its batch (SPEC-5-amendments A3 items 5 and 6), so the echo carries the client id
    // and the batch op id `<first>+<count>` the author's tab settles both ops from
    expect(records[0]).toMatchObject({
      clientId: CLIENT_A,
      opIds: [`${CLIENT_A}:1`, `${CLIENT_A}:2`],
    });
    const since = await channel.since('gt-brand', 412, 10);
    expect(since).toHaveLength(1);
    expect(since[0]).toMatchObject({
      seq: 413,
      rev: 412,
      opId: `${CLIENT_A}:1+2`,
      clientId: CLIENT_A,
      author: kevin,
    });
    expect(await channel.since('gt-brand', 413, 10)).toEqual([]);
    // a record written outside the room (no origin) still echoes as the store's
    const outside = await store.write({
      baseRevision: 413,
      author: maya,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 22 },
      ],
    });
    expect(outside).toMatchObject({ ok: true });
    expect((await channel.since('gt-brand', 413, 10))[0]).toMatchObject({
      seq: 414,
      opId: 'store:2',
      clientId: 'store',
      author: maya,
    });
    // a stale base answers the head and the count
    expect(await channel.append('gt-brand', 412, [editEntry(CLIENT_B, 1, maya)])).toEqual({
      ok: false,
      head: 414,
      count: 2,
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
    // the other instance's echo names the writing tab and its batch, so that tab reads it as its
    // own acknowledgement (A3 items 5 and 6) and every other tab applies it once
    expect(op).toMatchObject({
      type: 'op',
      entry: { seq: 413, opId: `${CLIENT_A}:1+1`, clientId: CLIENT_A, author: kevin },
    });
    expect(seen.find((event) => event.type === 'checkpoint')).toMatchObject({
      type: 'checkpoint',
      revision: 413,
    });
    expect(await b.head('gt-brand')).toBe(413);
    // presence is per instance on this tier
    await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Titanium 471'), 5000);
    expect(await a.presence.roster('gt-brand')).toHaveLength(1);
    expect(await b.presence.roster('gt-brand')).toEqual([]);
    stop();
    await a.close();
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

// The shared roster of the blob tier (gslides-parity SPEC-5-amendments A3 item 6, A8 row 4; B7;
// the fix round of VERIFICATION-5 finding 14): two instances over one Blob store, each with its
// own memory roster, joined through one roster file under the deck's state folder, written with a
// compare and swap inside the request that changed a row. A row set on one instance reaches the
// other's streams as a `presence` frame and its roster; a leave reaches it as `leave`, and undoes
// the row on the instance that still carries it in memory; a leave announced on the reading
// instance is never undone by a row written before it; a row older than the roster's expiry counts
// for nothing; the store's listing lag and the CDN's body lag change nothing; a store without
// state files (a FileStore) keeps the per instance roster.
describe('blobChannel, the shared roster (SPEC-5-amendments A3 item 6)', () => {
  let root: string;
  let fake: FakeBlobClient;
  let storeA: BlobStore;
  let storeB: BlobStore;
  let clock = Date.parse('2026-09-15T10:00:00.000Z');
  const now = (): number => clock;
  const rosterFiles = (): string[] =>
    [...fake.blobs.keys()].filter((key) => key.endsWith('/.turboslide/presence.json'));

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-realtime-roster-'));
    const seed = join(root, 'seed', 'gt-brand');
    writeRawDeck(seed);
    fake = memoryBlobClient();
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    storeA = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'a', 'gt-brand') });
    storeB = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'b', 'gt-brand') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function instance(name: string, store: BlobStore) {
    return blobChannel({
      open: async () => store,
      now,
      instanceId: name,
      presencePollMs: 60_000,
      presenceWriteMs: 0,
    });
  }

  it('carries a row set on one instance to the other as presence, and its leave as leave', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    const seenByB: RoomEvent[] = [];
    b.subscribe('gt-brand', (event) => seenByB.push(event));
    try {
      // the set writes the roster file inside the call: no timer, no flush needed
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Kevin'), 120_000);
      expect(rosterFiles()).toHaveLength(1);
      // the other instance learns the row on its poll and delivers it to its streams
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      const presence = seenByB.filter((event) => event.type === 'presence');
      expect(presence).toHaveLength(1);
      expect(presence[0]).toMatchObject({ type: 'presence', clientId: CLIENT_A, clock: 1 });
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
      // an unchanged file is one head call and is not delivered twice
      const heads = fake.calls.filter((call) => call.op === 'head').length;
      const gets = fake.calls.filter((call) => call.op === 'get').length;
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'presence')).toHaveLength(1);
      expect(fake.calls.filter((call) => call.op === 'head').length).toBeGreaterThan(heads);
      expect(
        fake.calls
          .filter((call) => call.op === 'get')
          .slice(gets)
          .filter((call) => call.pathname.endsWith('presence.json')),
      ).toHaveLength(0);
      // a newer state on the first instance moves the row on the second
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 2, 'Kevin'), 120_000);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'presence')).toHaveLength(2);
      // the leave on the first instance reaches the second as a leave and empties its roster
      await a.presence.leave('gt-brand', CLIENT_A);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'leave')).toEqual([
        { type: 'leave', clientId: CLIENT_A },
      ]);
      expect(await b.presence.roster('gt-brand')).toEqual([]);
    } finally {
      await a.close();
      await b.close();
    }
    // closed instances leave nothing live in the file
    const file = fake.blobs.get(rosterFiles()[0] ?? '');
    const rows = JSON.parse(new TextDecoder().decode(file?.bytes ?? new Uint8Array())) as {
      rows: { left?: true }[];
    };
    expect(rows.rows.filter((row) => row.left !== true)).toEqual([]);
  });

  it('reads the other instances before a hello, never resurrects a row that left here, and ignores a stale row', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    try {
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Kevin'), 120_000);
      await a.presence.set('gt-brand', CLIENT_B, rosterEntry(CLIENT_B, 1, 'Maya'), 120_000);
      // the roster read of a fresh stream's hello polls first: both rows are there at once
      clock += 1000;
      const hello = await b.presence.roster('gt-brand');
      expect(hello.map((row) => row.clientId).sort()).toEqual([CLIENT_A, CLIENT_B].sort());
      // a leave announced on the reading instance (a tab's leave landed here) holds against the
      // first instance's row, written before the leave
      clock += 1000;
      await b.presence.leave('gt-brand', CLIENT_B);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
      // the instance that carried the rows goes quiet for longer than the expiry: its rows
      // count for nothing and leave the reading instance
      clock += 130_000;
      await b.sharedRoster.poll('gt-brand');
      expect(await b.presence.roster('gt-brand')).toEqual([]);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('a leave landing on one instance drops the row the other instance still carries (finding 14)', async () => {
    // the tab's presence posts landed on A, which carries the row; the tab's leave (its pagehide
    // beacon, or its stream's close) landed on B; A's next write or poll must forget the tab and
    // tell A's streams, else A's hello lists a ghost until the roster's expiry
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    const seenByA: RoomEvent[] = [];
    a.subscribe('gt-brand', (event) => seenByA.push(event));
    try {
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Kevin'), 120_000);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
      clock += 1000;
      await b.presence.leave('gt-brand', CLIENT_A);
      clock += 1000;
      await a.sharedRoster.poll('gt-brand');
      expect(await a.presence.roster('gt-brand')).toEqual([]);
      expect(seenByA.filter((event) => event.type === 'leave')).toEqual([
        { type: 'leave', clientId: CLIENT_A },
      ]);
      // A writes again for another tab: the left tab does not come back
      await a.presence.set('gt-brand', CLIENT_B, rosterEntry(CLIENT_B, 1, 'Maya'), 120_000);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_B]);
      // the tab comes back under its id (a reload): its new post outranks the leave
      clock += 1000;
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 5, 'Kevin'), 120_000);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId).sort()).toEqual(
        [CLIENT_A, CLIENT_B].sort(),
      );
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('meets the window when the listing lags and the CDN serves the last body (finding 14)', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    try {
      // the listing frozen before any roster write: the file is read by name, never listed
      fake.holdList();
      await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Kevin'), 120_000);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect((await b.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([CLIENT_A]);
      fake.releaseList();
      // the CDN keeps serving the body before the leave: the read is unproven, the reader keeps
      // what it had and the writer never swaps on the stale body; once the CDN catches up the
      // leave lands on the next poll
      fake.holdGet();
      await a.presence.leave('gt-brand', CLIENT_A);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      fake.releaseGet();
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(await b.presence.roster('gt-brand')).toEqual([]);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('keeps the per instance roster over a store without state files', async () => {
    const plain = openFileStore({
      dir: join(root, 'seed', 'gt-brand'),
      now: () => new Date(now()).toISOString(),
    });
    const file = blobChannel({ open: async () => plain, now, instanceId: 'file-instance' });
    try {
      await file.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Kevin'), 120_000);
      await file.sharedRoster.flush('gt-brand');
      await file.sharedRoster.poll('gt-brand');
      expect((await file.presence.roster('gt-brand')).map((row) => row.clientId)).toEqual([
        CLIENT_A,
      ]);
    } finally {
      await file.close();
    }
  });
});

// Chat on the blob tier (gslides-parity SPEC-5 10, 0.46; VERIFICATION-5 finding 3; B7): a chat
// entry appended on one instance is a numbered file under the deck's state folder, moves no
// revision, is listed by `since` on every instance at once (the smoke's chat.send then chat.list
// across instances), reaches the other instance's streams on its poll, and two instances appending
// at once never share a number. A store without state files keeps the chat per instance.
describe('blobChannel, chat entries (SPEC-5 10)', () => {
  let root: string;
  let fake: FakeBlobClient;
  let storeA: BlobStore;
  let storeB: BlobStore;
  let clock = Date.parse('2026-09-15T12:00:00.000Z');
  const now = (): number => clock;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-realtime-chat-'));
    const seed = join(root, 'seed', 'gt-brand');
    writeRawDeck(seed);
    fake = memoryBlobClient();
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    storeA = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'a', 'gt-brand') });
    storeB = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'b', 'gt-brand') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function instance(name: string, store: BlobStore) {
    return blobChannel({
      open: async () => store,
      now,
      instanceId: name,
      minWriteSpacingMs: 0,
      presencePollMs: 60_000,
      presenceWriteMs: 0,
    });
  }

  function chat(clientId: string, n: number, text: string, at: string): NewEntry {
    const id = `chat_${n}`;
    return {
      rev: 412,
      kind: 'chat',
      author: kevin,
      clientId,
      opId: id,
      at,
      chat: { id, principalId: 'anon_kevin', text, at },
    };
  }

  it('lists a message sent on one instance from another at once, without moving the revision', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    try {
      const at = new Date(now()).toISOString();
      const result = await a.append('gt-brand', 412, [
        chat('chat', 1, 'Pricing slide is ready', at),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.entries[0]).toMatchObject({ seq: 412, kind: 'chat', opId: 'chat_1' });
      expect(await storeA.revision()).toBe(412);
      expect(await storeB.revision()).toBe(412);
      expect([...fake.blobs.keys()].filter((key) => key.includes('/.turboslide/chat/'))).toEqual([
        'decks/gt-brand/.turboslide/chat/1.json',
      ]);
      // the other instance's since carries it (chat.list reads since(head - window, ...))
      clock += 10;
      const listed = await b.since('gt-brand', 0, 2000);
      expect(listed.filter((entry) => entry.kind === 'chat')).toHaveLength(1);
      expect(listed.find((entry) => entry.kind === 'chat')).toMatchObject({
        seq: 412,
        chat: { id: 'chat_1', text: 'Pricing slide is ready' },
      });
      // and the version log holds no record for it
      expect(await storeB.records()).toEqual([]);
      // an edit after it: the record comes first, the message after the record of its revision
      const edit = await a.append('gt-brand', 412, [editEntry(CLIENT_A, 1, kevin, 22)]);
      expect(edit.ok).toBe(true);
      clock += CHAT_PROBE_MIN_MS + 1;
      const later = await a.append('gt-brand', 413, [chat('chat', 2, 'Looks good', at)]);
      expect(later.ok && later.entries[0]?.seq).toBe(413);
      clock += CHAT_PROBE_MIN_MS + 1;
      const page = await b.since('gt-brand', 411, 2000);
      expect(page.map((entry) => `${entry.seq}:${entry.kind}`)).toEqual([
        '412:chat',
        '413:edit',
        '413:chat',
      ]);
      // a page that filled its limit carries the messages up to its last record only
      const first = await b.since('gt-brand', 411, 1);
      expect(first.map((entry) => `${entry.seq}:${entry.kind}`)).toEqual([
        '412:chat',
        '413:edit',
        '413:chat',
      ]);
      expect(await b.since('gt-brand', 413, 10)).toEqual([]);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('reaches the other instance’s streams on its poll and survives a lagging listing', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    const seenByB: RoomEvent[] = [];
    b.subscribe('gt-brand', (event) => seenByB.push(event));
    try {
      fake.holdList();
      const at = new Date(now()).toISOString();
      await a.append('gt-brand', 412, [chat('chat', 1, 'first', at)]);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'op')).toHaveLength(1);
      expect(seenByB[0]).toMatchObject({ type: 'op', entry: { kind: 'chat', opId: 'chat_1' } });
      // a second message is found past the last number by name while the listing still lags
      clock += CHAT_PROBE_MIN_MS + 1;
      await a.append('gt-brand', 412, [chat('chat', 2, 'second', at)]);
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'op')).toHaveLength(2);
      // an announced message is not announced twice
      clock += 1000;
      await b.sharedRoster.poll('gt-brand');
      expect(seenByB.filter((event) => event.type === 'op')).toHaveLength(2);
      fake.releaseList();
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('two instances appending at once never share a number', async () => {
    const a = instance('instance-a', storeA);
    const b = instance('instance-b', storeB);
    try {
      const at = new Date(now()).toISOString();
      const [x, y] = await Promise.all([
        a.append('gt-brand', 412, [chat('chat', 1, 'from a', at)]),
        b.append('gt-brand', 412, [chat('chat', 2, 'from b', at)]),
      ]);
      expect(x.ok && y.ok).toBe(true);
      const names = [...fake.blobs.keys()]
        .filter((key) => key.includes('/.turboslide/chat/'))
        .sort();
      expect(names).toEqual([
        'decks/gt-brand/.turboslide/chat/1.json',
        'decks/gt-brand/.turboslide/chat/2.json',
      ]);
      clock += CHAT_PROBE_MIN_MS + 1;
      const listed = await a.since('gt-brand', 0, 2000);
      expect(
        listed
          .filter((entry) => entry.kind === 'chat')
          .map((entry) => entry.chat?.text)
          .sort(),
      ).toEqual(['from a', 'from b']);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('keeps the chat per instance over a store without state files', async () => {
    const plain = openFileStore({
      dir: join(root, 'seed', 'gt-brand'),
      now: () => new Date(now()).toISOString(),
    });
    const file = blobChannel({
      open: async () => plain,
      now,
      instanceId: 'file-instance',
      minWriteSpacingMs: 0,
    });
    try {
      const at = new Date(now()).toISOString();
      const result = await file.append('gt-brand', 412, [chat('chat', 1, 'hello', at)]);
      expect(result.ok).toBe(true);
      expect(await plain.revision()).toBe(412);
      expect(
        (await file.since('gt-brand', 0, 100)).filter((entry) => entry.kind === 'chat'),
      ).toHaveLength(1);
    } finally {
      await file.close();
    }
  });
});

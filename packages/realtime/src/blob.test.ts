// The blob channel over a deck store (SPEC-3 2.5, 3.7 e): every append is a commit whose
// revision is the seq, `since` reads the version log, a stale base answers the head, two
// channels over one store see each other's records through the watch channel, comment entries
// need the comments store, and presence stays per instance.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import { ConflictError } from '@turboslide/schema/errors';

import { blobChannel, isLostRace } from './blob.ts';
import type { RoomEvent } from './channel.ts';
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
    // presence is per instance on this tier
    await a.presence.set('gt-brand', CLIENT_A, rosterEntry(CLIENT_A, 1, 'Titanium 471'), 5000);
    expect(await a.presence.roster('gt-brand')).toHaveLength(1);
    expect(await b.presence.roster('gt-brand')).toEqual([]);
    stop();
    await a.close();
    await b.close();
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

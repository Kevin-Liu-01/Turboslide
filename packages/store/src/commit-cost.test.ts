// The cost of a commit as call counts, which no machine load moves (hardening 8.4): the parses
// and validations a write makes on a long log (PS#2, PERF-2) and the puts of a commit (PS#3,
// PERF-3 item 1).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { applyWrite } from '@turboslide/schema/reduce';
import { validateDeck, validateDocument } from '@turboslide/schema/validate';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import { openBlobStore, pushDeckDir } from './blob-store.ts';
import type { BlobStore } from './blob-store.ts';
import { loadDeckDir, loadDeckDirCached, openFileStore } from './file-store.ts';
import { LruMap, clearParseCache } from './parse-cache.ts';
import { pulseWanted, putPulse, setPulseRule } from './pulse.ts';
import { snapshotBody, snapshotKey, snapshotPath } from './snapshots.ts';
import type { VersionRecord } from './store.ts';
import { readVersions, versionRecordSchema, versionRecordText } from './versions.ts';

// every validation the store and the reducer make, counted where the module is shared
vi.mock('@turboslide/schema/validate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@turboslide/schema/validate')>();
  return {
    ...actual,
    validateDeck: vi.fn(actual.validateDeck),
    validateDocument: vi.fn(actual.validateDocument),
  };
});

const agent: Author = { kind: 'agent', name: 'agent', runId: 'a' };
const setSize = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});
const SIZES = [20, 22, 24];

let root: string;
let seed: string;
let clock: string;
const now = (): string => clock;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-commit-cost-'));
  seed = join(root, 'seed', 'gt-brand');
  mkdirSync(join(seed, 'slides'), { recursive: true });
  writeFileSync(join(seed, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(seed, 'slides', `${slide.id}.json`), canonicalJson(slide));
  clock = '2026-10-12T10:00:00.000Z';
  clearParseCache();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * `count` commits of the worked deck stored the way `write()` stores them (each record under its
 * number with its snapshot key, the newest snapshot, the manifest and the changed slide), built
 * with the store's own reducer and record text rather than a store per commit. With
 * `snapshotEvery`, a record names its key and the store holds its snapshot on every that many
 * records alone, as a commit stores them since PS#4 (the newest 50 records' snapshots stored).
 */
async function commitLog(
  fake: FakeBlobClient,
  count: number,
  snapshotEvery?: number,
): Promise<DeckDocument> {
  const stored = new Map<string, Uint8Array>();
  let document = loadDeckDir(seed).document;
  const text = new TextEncoder();
  for (let n = 1; n <= count; n += 1) {
    const createdAt = new Date(Date.parse('2026-10-12T09:00:00.000Z') + n).toISOString();
    const result = applyWrite(
      document,
      {
        baseRevision: document.deck.revision,
        author: agent,
        mutations: [setSize(SIZES[n % 3] ?? 20)],
      },
      { now: createdAt },
    );
    if (!result.ok) throw new Error(result.message);
    const key = snapshotKey(canonicalJson(result.document.deck));
    const named = snapshotEvery === undefined || n % snapshotEvery === 0;
    if (named && snapshotEvery !== undefined && n > count - 50)
      stored.set(key, snapshotBody(result.document));
    const record: VersionRecord = {
      n,
      revision: result.document.deck.revision,
      baseRevision: document.deck.revision,
      author: agent,
      note: '',
      createdAt,
      mutations: result.entry.mutations,
      inverse: result.inverse,
      ...(named ? { snapshot: key } : {}),
    };
    await fake.put(`decks/gt-brand/versions/${n}.json`, text.encode(versionRecordText(record)), {
      overwrite: false,
    });
    document = result.document;
  }
  if (snapshotEvery === undefined)
    stored.set(snapshotKey(canonicalJson(document.deck)), snapshotBody(document));
  for (const [key, body] of stored)
    await fake.put(`decks/gt-brand/${snapshotPath(key)}`, body, { overwrite: false });
  await fake.put(
    'decks/gt-brand/slides/content-rule.json',
    text.encode(canonicalJson(document.slides['content-rule'])),
    { overwrite: true },
  );
  await fake.put('decks/gt-brand/deck.json', text.encode(canonicalJson(document.deck)), {
    overwrite: true,
  });
  fake.calls.length = 0;
  return document;
}

async function mirrorOf(
  count: number,
  snapshotEvery?: number,
): Promise<{ fake: FakeBlobClient; store: BlobStore }> {
  const fake = memoryBlobClient(undefined, { now });
  await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
  await commitLog(fake, count, snapshotEvery);
  const store = openBlobStore({
    client: fake,
    deckId: 'gt-brand',
    dir: join(root, 'mirror', 'gt-brand'),
    now,
    syncTtlMs: 0,
  });
  return { fake, store };
}

/** Ten writes, each from the revision the last one left, with the clock moved a second each. */
async function tenWrites(store: BlobStore): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    clock = new Date(Date.parse(clock) + 1000).toISOString();
    const baseRevision = await store.revision();
    const outcome = await store.write({
      baseRevision,
      author: agent,
      mutations: [setSize(SIZES[i % 3] ?? 20)],
    });
    if (!outcome.ok) throw new Error(outcome.message);
  }
}

describe('hardening PS#2: the mirror parses and validates once per commit (PERF-2)', () => {
  it('ten writes on a 1,000 record mirror make at most 10 record parses and 10 validations', async () => {
    const { store } = await mirrorOf(1000);
    // the whole log in the mirror, as the room's open reads it, and the mirror's first read
    expect(await store.records()).toHaveLength(1000);
    await store.read();
    const parses = vi.spyOn(versionRecordSchema, 'safeParse');
    vi.mocked(validateDeck).mockClear();
    vi.mocked(validateDocument).mockClear();
    await tenWrites(store);
    const validations =
      vi.mocked(validateDeck).mock.calls.length + vi.mocked(validateDocument).mock.calls.length;
    // origin/main 8c9465b6: 10,045 parses (a log read of 1,000 and more records per write) and
    // 30 validations (the revision, the write's read of the folder and the reducer's)
    expect({ parses: parses.mock.calls.length, validations }).toEqual({
      parses: expect.toSatisfy((n: number) => n <= 10),
      validations: expect.toSatisfy((n: number) => n <= 10),
    });
    expect(validations).toBeGreaterThan(0);
    const log = await store.records();
    expect(log).toHaveLength(1010);
    expect(log.at(-1)?.mutations).toEqual([setSize(SIZES[9 % 3] ?? 20)]);
  }, 240_000);

  it('a read, a revision and the log on an unchanged mirror parse and validate nothing', async () => {
    const { store } = await mirrorOf(60);
    await store.records();
    await store.read();
    const parses = vi.spyOn(versionRecordSchema, 'safeParse');
    vi.mocked(validateDeck).mockClear();
    vi.mocked(validateDocument).mockClear();
    for (let i = 0; i < 5; i += 1) {
      await store.revision();
      await store.read();
      await store.records();
    }
    expect(parses).not.toHaveBeenCalled();
    expect(vi.mocked(validateDeck)).not.toHaveBeenCalled();
    expect(vi.mocked(validateDocument)).not.toHaveBeenCalled();
  }, 120_000);

  it('the cached read equals a fresh read of the files after every kind of write', async () => {
    const dir = join(root, 'checkout', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    const store = openFileStore({ dir, now, cache: true });
    const fresh = (): unknown => {
      const loaded = loadDeckDir(dir);
      return { document: loaded.document, issues: loaded.issues, ok: loaded.ok };
    };
    const section = WORKED_DECK.sections[0]?.id ?? '';
    const copied = {
      ...structuredClone(WORKED_SLIDES[1]),
      id: 'copied',
    } as (typeof WORKED_SLIDES)[number];
    const writes: Mutation[][] = [
      [setSize(22)],
      [{ op: 'slide.insert', sectionId: section, after: 'title', slide: copied }],
      [{ op: 'slide.move', slideId: 'copied', sectionId: section, after: 'thesis' }],
      [setSize(24)],
      [{ op: 'slide.remove', slideId: 'copied' }],
      [setSize(20)],
    ];
    for (const mutations of writes) {
      const outcome = await store.write({
        baseRevision: await store.revision(),
        author: agent,
        mutations,
      });
      if (!outcome.ok) throw new Error(outcome.message);
      const read = await store.read();
      expect(JSON.stringify(read)).toBe(JSON.stringify(fresh()));
      expect(await store.records()).toEqual(readVersions(dir));
    }
  }, 120_000);

  it('a file changed outside the store is read again, and a caller’s change stays its own', async () => {
    const dir = join(root, 'checkout', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    const store = openFileStore({ dir, now, cache: true });
    const outcome = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [setSize(22)],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const first = await store.read();
    // a caller's change to its copy reaches neither the next read nor the log
    first.document.deck.title = 'changed by a caller';
    (await store.records())[0]?.mutations.splice(0);
    expect((await store.read()).document.deck.title).toBe(WORKED_DECK.title);
    expect((await store.records())[0]?.mutations).toHaveLength(1);
    // a hand edit of the same size outside the store
    const deck = { ...outcome.document.deck, title: WORKED_DECK.title.replace(/./, 'X') };
    writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
    expect((await store.read()).document.deck.title).toBe(deck.title);
    expect(await store.revision()).toBe(413);
    expect(loadDeckDirCached(dir).document.deck.title).toBe(deck.title);
  }, 120_000);

  it('the cache keeps its newest entries and drops the least recently used', () => {
    const lru = new LruMap<number>(3);
    for (const key of ['a', 'b', 'c']) lru.set(key, key.charCodeAt(0));
    expect(lru.get('a')).toBe(97);
    lru.set('d', 100);
    expect(lru.size).toBe(3);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(97);
  });
});

describe('hardening PS#3: no pulse put where no poll reads it (PERF-3 item 1)', () => {
  afterEach(() => setPulseRule(null));
  /** The puts of the calls since the last reset, as stored paths with the numbers and keys named. */
  const putsOf = (fake: FakeBlobClient): string[] =>
    fake.calls
      .filter((call) => call.op === 'put')
      .map((call) =>
        call.pathname
          .replace('decks/gt-brand/', '')
          .replace(/^versions\/\d+\.json$/, 'versions/<n>.json')
          .replace(/^snapshots\/[0-9a-f]{32}\.json$/, 'snapshots/<md5>.json'),
      )
      .sort();
  async function writer(): Promise<{ fake: FakeBlobClient; store: BlobStore }> {
    const fake = memoryBlobClient(undefined, { now });
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    const store = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'writer', 'gt-brand'),
      now,
      syncTtlMs: 0,
    });
    await store.read();
    return { fake, store };
  }
  async function commit(store: BlobStore, size: number): Promise<void> {
    clock = new Date(Date.parse(clock) + 1000).toISOString();
    const outcome = await store.write({
      baseRevision: await store.revision(),
      author: agent,
      mutations: [setSize(size)],
    });
    if (!outcome.ok) throw new Error(outcome.message);
  }

  it('a commit on the do tier makes at most 4 puts and no pulse put', async () => {
    const { fake, store } = await writer();
    // the do tier: room.ts sets the rule from the tier the instance serves
    setPulseRule(() => false);
    for (let i = 0; i < 5; i += 1) {
      fake.calls.length = 0;
      await commit(store, SIZES[i % 3] ?? 20);
      // origin/main 8c9465b6: these four and `.turboslide/pulse.json` on every commit. Since
      // PS#4 the snapshot is stored by record 1 and every tenth record alone
      expect(putsOf(fake)).toEqual([
        'deck.json',
        'slides/content-rule.json',
        ...(i === 0 ? ['snapshots/<md5>.json'] : []),
        'versions/<n>.json',
      ]);
    }
    // handed off to the blob tier: the next commit writes the pulse again
    setPulseRule(() => true);
    fake.calls.length = 0;
    await commit(store, 24);
    expect(putsOf(fake)).toEqual([
      '.turboslide/pulse.json',
      'deck.json',
      'slides/content-rule.json',
      'versions/<n>.json',
    ]);
  }, 120_000);

  it('a process with no rule, or a rule that throws, writes the pulse', async () => {
    expect(pulseWanted()).toBe(true);
    setPulseRule(() => {
      throw new Error('no tier');
    });
    expect(pulseWanted()).toBe(true);
    const fake = memoryBlobClient(undefined, { now });
    expect(await putPulse(fake, 'gt-brand', 'deck', { now })).not.toBeNull();
    setPulseRule(() => false);
    expect(await putPulse(fake, 'gt-brand', 'deck', { now })).toBeNull();
    expect(fake.calls.filter((call) => call.op === 'put')).toHaveLength(1);
  });
});

describe('hardening PS#4: the snapshot every tenth commit and at the last close (PERF-3 item 2)', () => {
  const snapshotGets = (fake: FakeBlobClient): number =>
    fake.calls.filter((call) => call.op === 'get' && call.pathname.includes('/snapshots/')).length;
  const snapshotPuts = (fake: FakeBlobClient): number =>
    fake.calls.filter((call) => call.op === 'put' && call.pathname.includes('/snapshots/')).length;
  const mirrorAt = (fake: FakeBlobClient, name: string): BlobStore =>
    openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, name, 'gt-brand'),
      now,
      syncTtlMs: 0,
    });
  /** `count` writes through the store, each a second after the last. */
  async function writes(store: BlobStore, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      clock = new Date(Date.parse(clock) + 1000).toISOString();
      const outcome = await store.write({
        baseRevision: await store.revision(),
        author: agent,
        mutations: [setSize(SIZES[i % 3] ?? 20)],
      });
      if (!outcome.ok) throw new Error(outcome.message);
    }
  }
  const canonical = async (store: BlobStore): Promise<string> =>
    canonicalJson((await store.read()).document);

  it('20 commits store 2 snapshots, and the records of the others name none', async () => {
    const fake = memoryBlobClient(undefined, { now });
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    const writer = mirrorAt(fake, 'writer');
    // record 1 stores one whatever the count: the deck's first base a fresh mirror can prove
    await writes(writer, 1);
    fake.calls.length = 0;
    await writes(writer, 20);
    // origin/main 8c9465b6: 20, one per commit
    expect(snapshotPuts(fake)).toBe(2);
    const named = (await writer.records()).filter((record) => record.snapshot !== undefined);
    expect(named.map((record) => record.n)).toEqual([1, 10, 20]);
  }, 240_000);

  it('the replay equals the snapshot path for a fresh, a warm and a far behind mirror', async () => {
    const fake = memoryBlobClient(undefined, { now });
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    const writer = mirrorAt(fake, 'writer');
    await writes(writer, 1);
    const warm = mirrorAt(fake, 'warm');
    const farBehind = mirrorAt(fake, 'far');
    await warm.read();
    await farBehind.read();
    await writes(writer, 22);
    const head = await canonical(writer);

    // a mirror 22 commits behind (records 2 to 23, past SNAPSHOT_EVERY_RECORDS) proves the head
    // from the newest stored snapshot (record 20's) and three records
    fake.calls.length = 0;
    expect(await canonical(farBehind)).toBe(head);
    expect(snapshotGets(fake)).toBe(1);

    // a warm mirror learning one commit replays the record and reads no snapshot
    expect(await canonical(warm)).toBe(head);
    await writes(writer, 1);
    const next = await canonical(writer);
    fake.calls.length = 0;
    expect(await canonical(warm)).toBe(next);
    expect(snapshotGets(fake)).toBe(0);

    // a fresh mirror of a head with no snapshot (record 24) replays from record 20's
    fake.calls.length = 0;
    const fresh = mirrorAt(fake, 'fresh');
    expect(await canonical(fresh)).toBe(next);
    const read = fake.calls.filter(
      (call) => call.op === 'get' && call.pathname.includes('/snapshots/'),
    );
    // the head's key (a miss) and record 20's
    expect(read).toHaveLength(2);
    expect(
      fake.calls.some((call) => call.op === 'get' && call.pathname.endsWith('/slides/title.json')),
    ).toBe(false);

    // the last close stores the head's snapshot, and the next fresh mirror reads it alone
    expect(await writer.snapshotCurrent()).toBe(true);
    expect(await writer.snapshotCurrent()).toBe(false);
    const rested = mirrorAt(fake, 'rested');
    fake.calls.length = 0;
    expect(await canonical(rested)).toBe(next);
    expect(snapshotGets(fake)).toBe(1);

    // and a write on each mirror commits on the head the others proved
    await writes(fresh, 1);
    await writes(warm, 1);
    expect(await canonical(rested)).toBe(await canonical(writer));
  }, 240_000);

  it('a fresh mirror of 1,000 records whose head stores no snapshot reads in at most 60 calls', async () => {
    const { fake, store } = await mirrorOf(1005, 10);
    const { document } = await store.read();
    expect(document.deck.revision).toBe(412 + 1005);
    // PS#1's ceiling: the manifest head, the head's snapshot (a miss), the manifest body, record
    // 1, the newest 50 records, the walk's miss, the comments index and record 1000's snapshot
    expect(fake.calls.length).toBeLessThanOrEqual(60);
    expect(snapshotGets(fake)).toBe(2);
    // a revision whose record names no snapshot is rebuilt from the inverses above it, which the
    // mirror holds: no record below the log floor is read (the whole log was 1,005 gets)
    fake.calls.length = 0;
    const at = await store.documentAtRevision(412 + 1003);
    expect(at.deck.revision).toBe(412 + 1003);
    const recordGets = fake.calls.filter(
      (call) => call.op === 'get' && call.pathname.includes('/versions/'),
    );
    expect(recordGets).toHaveLength(0);
  }, 240_000);
});

// The cost of a commit as call counts, which no machine load moves (hardening 8.4): the parses
// and validations a write makes on a long log (PS#2, PERF-2).
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
 * with the store's own reducer and record text rather than a store per commit.
 */
async function commitLog(fake: FakeBlobClient, count: number): Promise<DeckDocument> {
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
    const record: VersionRecord = {
      n,
      revision: result.document.deck.revision,
      baseRevision: document.deck.revision,
      author: agent,
      note: '',
      createdAt,
      mutations: result.entry.mutations,
      inverse: result.inverse,
      snapshot: snapshotKey(canonicalJson(result.document.deck)),
    };
    await fake.put(`decks/gt-brand/versions/${n}.json`, text.encode(versionRecordText(record)), {
      overwrite: false,
    });
    document = result.document;
  }
  const key = snapshotKey(canonicalJson(document.deck));
  await fake.put(`decks/gt-brand/${snapshotPath(key)}`, snapshotBody(document), {
    overwrite: false,
  });
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

async function mirrorOf(count: number): Promise<{ fake: FakeBlobClient; store: BlobStore }> {
  const fake = memoryBlobClient(undefined, { now });
  await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
  await commitLog(fake, count);
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

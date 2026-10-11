// The nightly backup (hardening O#1a, docs/hardening/HARDENING.md 4.8; RELIABILITY-13) over two
// in-memory stores: the source holds two decks the store itself wrote (manifests, slides, version
// records, snapshots, twins, sidecars), the principal indexes and the link index; the target is
// the backup store. A night cut into calls by a small budget resumes from the cursor and ends
// with every kept document byte equal, a deck that moved between two calls is copied again with
// the snapshot its manifest names, and the expired days leave while the newest complete one
// stays.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';
import { snapshotKey } from '@turboslide/store/snapshots';

import {
  BACKUP_FLAT_PREFIXES,
  backupBlobClient,
  backupDay,
  isBackedUpDocument,
  newestCompleteDay,
  pruneBackups,
  runBackup,
} from './backup';
import type { BackupResult } from './backup';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const NIGHT = Date.parse('2026-10-11T03:00:00.000Z');
const DAY = '2026-10-11';
const agent: Author = { kind: 'agent', name: 'agent', runId: 'backup-test' };
const setSize = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'o1a-backup-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The worked deck as a folder: its manifest, its slides and its twins as stub files. */
function deckFolder(): string {
  const dir = join(root, 'seed', 'gt-brand');
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const asset of Object.values(WORKED_DECK.assets))
    for (const twin of Object.values(asset.twins)) writeFileSync(join(dir, twin), PNG);
  return dir;
}

/** Commits one write through the store, as a function instance does (a record and a snapshot). */
async function commit(source: FakeBlobClient, deckId: string, size: number): Promise<void> {
  const store = openBlobStore({
    client: source,
    deckId,
    dir: join(root, 'mirror', `${deckId}-${size}`),
    syncTtlMs: 0,
    snapshotGraceMs: 0,
  });
  const { document } = await store.read();
  const outcome = await store.write({
    baseRevision: document.deck.revision,
    author: agent,
    mutations: [setSize(size)],
  });
  expect(outcome.ok, JSON.stringify(outcome).slice(0, 300)).toBe(true);
}

/** The source store: two decks with history, their sidecars, the indexes, an export. */
async function seededSource(): Promise<FakeBlobClient> {
  const source = memoryBlobClient('https://source.blob.local');
  const dir = deckFolder();
  await pushDeckDir(source, 'gt-brand', dir, { overwrite: false });
  await pushDeckDir(source, 'q8wf2kzr0uyb3nxc5vlp1a7h2m', dir, { overwrite: false });
  await commit(source, 'gt-brand', 20);
  await commit(source, 'gt-brand', 22);
  await commit(source, 'q8wf2kzr0uyb3nxc5vlp1a7h2m', 24);
  const put = (pathname: string, text: string) =>
    source.put(pathname, enc(text), { overwrite: true });
  await put('decks/gt-brand/access.json', '{"schemaVersion":1}');
  await put('decks/gt-brand/comments/index.json', '{"rows":[]}');
  await put('decks/gt-brand/leases.json', '{"leases":[]}');
  await put('decks/gt-brand/.turboslide/presence.json', '{"rows":[]}');
  await put('decks/gt-brand/.thumbs/x.webp', 'thumb');
  await put('decks/twins-only/assets/a.png', 'png');
  await put('users/p1/decks.json', '{"decks":["gt-brand"]}');
  await put('users/p1/.turboslide/copies/abc.json', '{"decks":[]}');
  await put('links/0f0f.json', '{"deckId":"gt-brand","linkId":"l1"}');
  await put('exports/gt-brand/j1/file.pdf', 'pdf');
  return source;
}

/** The source pathnames a night keeps. */
function keptPaths(source: FakeBlobClient): string[] {
  return [...source.blobs.keys()]
    .filter((pathname) => {
      const deck = /^decks\/[^/]+\/(.*)$/.exec(pathname);
      if (deck !== null) return isBackedUpDocument(deck[1] ?? '');
      return (
        BACKUP_FLAT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
        !pathname.includes('/.')
      );
    })
    .sort();
}

/**
 * The backup store with a clock its puts move, one millisecond each: a call's budget is spent by
 * the objects it writes, as on the real store, and an object already there costs nothing.
 */
function slowStore(start: number): { target: FakeBlobClient; now: () => number } {
  const target = memoryBlobClient('https://backup.blob.local');
  let at = start;
  const put = target.put.bind(target);
  target.put = async (...args) => {
    at += 1;
    return put(...args);
  };
  return { target, now: () => at };
}

describe('the nightly backup (hardening O#1a)', () => {
  it('keeps the documents and the indexes, and leaves twins, sidecars, leases and exports out', () => {
    expect(isBackedUpDocument('deck.json')).toBe(true);
    expect(isBackedUpDocument('access.json')).toBe(true);
    expect(isBackedUpDocument('slides/title.json')).toBe(true);
    expect(isBackedUpDocument('versions/413.json')).toBe(true);
    expect(isBackedUpDocument('snapshots/0123.json')).toBe(true);
    expect(isBackedUpDocument('comments/index.json')).toBe(true);
    expect(isBackedUpDocument('assets/mood-earth-light.png')).toBe(false);
    expect(isBackedUpDocument('leases.json')).toBe(false);
    expect(isBackedUpDocument('.turboslide/presence.json')).toBe(false);
    expect(isBackedUpDocument('.thumbs/x.webp')).toBe(false);
    expect(isBackedUpDocument('slides/')).toBe(false);
    expect(backupDay(NIGHT + 3 * 3_600_000)).toBe(DAY);
  });

  it('a night stopped at its budget resumes from the cursor and ends equal', async () => {
    const source = await seededSource();
    const { target, now } = slowStore(NIGHT);
    const calls: BackupResult[] = [];
    for (let i = 0; i < 60; i += 1) {
      const result = await runBackup({ source, target, now, budgetMs: 8, concurrency: 1 });
      calls.push(result);
      if (result.state !== 'partial') break;
    }
    const last = calls[calls.length - 1];
    expect(calls.length).toBeGreaterThan(2);
    expect(calls[0]?.state).toBe('partial');
    expect(last?.state).toBe('done');
    // every kept document is in the day's folder with the source's bytes, and nothing else is
    const kept = keptPaths(source);
    expect(kept.length).toBeGreaterThan(20);
    const prefix = `backup/${DAY}/`;
    for (const pathname of kept)
      expect(target.blobs.get(`${prefix}${pathname}`)?.version, pathname).toBe(
        source.blobs.get(pathname)?.version,
      );
    const copied = [...target.blobs.keys()]
      .filter((pathname) => pathname.startsWith(prefix))
      .map((pathname) => pathname.slice(prefix.length))
      .filter((pathname) => pathname !== 'cursor.json' && pathname !== 'done.json')
      .sort();
    expect(copied).toEqual(kept);
    const done = JSON.parse(
      new TextDecoder().decode(target.blobs.get(`${prefix}done.json`)?.bytes),
    );
    expect(done).toMatchObject({ day: DAY, decks: 2, objects: kept.length, failedCount: 0 });
    expect(done.calls).toBe(calls.length);
    // a call after the day is done copies nothing
    const after = await runBackup({ source, target, now, budgetMs: 40 });
    expect(after).toMatchObject({ state: 'was-done', copied: 0, objects: kept.length });
  });

  it('copies a deck that moved between two calls again, with the snapshot its manifest names', async () => {
    const source = await seededSource();
    const { target, now } = slowStore(NIGHT);
    // the first call stops inside the first deck (gt-brand sorts first)
    const first = await runBackup({ source, target, now, budgetMs: 4, concurrency: 1 });
    expect(first.state).toBe('partial');
    expect(target.blobs.has(`backup/${DAY}/decks/gt-brand/deck.json`)).toBe(true);
    await commit(source, 'gt-brand', 24);
    let result = first;
    for (let i = 0; i < 60 && result.state === 'partial'; i += 1)
      result = await runBackup({ source, target, now, budgetMs: 200 });
    expect(result.state).toBe('done');
    const manifest = target.blobs.get(`backup/${DAY}/decks/gt-brand/deck.json`);
    expect(manifest?.version).toBe(source.blobs.get('decks/gt-brand/deck.json')?.version);
    const key = snapshotKey(manifest?.bytes ?? new Uint8Array());
    expect(target.blobs.has(`backup/${DAY}/decks/gt-brand/snapshots/${key}.json`)).toBe(true);
    expect(result.failedCount).toBe(0);
  });

  it('removes the days past thirty, oldest first, and keeps the newest complete day whatever its age', async () => {
    const target = memoryBlobClient('https://backup.blob.local');
    const put = (pathname: string) => target.put(pathname, enc('{}'), { overwrite: true });
    for (const day of ['2026-08-01', '2026-09-10', '2026-09-11', '2026-09-12', '2026-10-10'])
      await put(`backup/${day}/decks/gt-brand/deck.json`);
    await put('backup/2026-08-01/done.json');
    await put('backup/drills/2026-09.json');
    // nothing complete since August: that day stays, the other expired ones leave
    expect(await pruneBackups(target, { today: DAY })).toEqual(['2026-09-10', '2026-09-11']);
    expect(target.blobs.has('backup/2026-08-01/done.json')).toBe(true);
    expect(target.blobs.has('backup/2026-09-11/decks/gt-brand/deck.json')).toBe(false);
    // 2026-09-12 is the thirtieth day before 2026-10-11 counted with it, so it stays
    expect(target.blobs.has('backup/2026-09-12/decks/gt-brand/deck.json')).toBe(true);
    expect(target.blobs.has('backup/drills/2026-09.json')).toBe(true);
    // once a newer day is complete, the August day leaves too
    await put('backup/2026-10-10/done.json');
    expect(await newestCompleteDay(target)).toBe('2026-10-10');
    expect(await pruneBackups(target, { today: DAY })).toEqual(['2026-08-01']);
  });

  it('opens the backup store by either token name, private, or a folder, and nothing without one', () => {
    expect(backupBlobClient({})).toBeNull();
    expect(backupBlobClient({ TURBOSLIDE_BACKUP_DIR: join(root, 'b') })).not.toBeNull();
    expect(
      backupBlobClient({ TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_0000' }),
    ).not.toBeNull();
    expect(
      backupBlobClient({ TURBOSLIDE_BACKUP_BLOB_TOKEN: 'vercel_blob_rw_test_0000' }),
    ).not.toBeNull();
  });
});

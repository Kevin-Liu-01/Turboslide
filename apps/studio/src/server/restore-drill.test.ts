// The monthly restore drill (hardening O#1b, docs/hardening/HARDENING.md 4.8; RELIABILITY-13)
// over two in-memory stores: a night of the backup (O#1a) made from decks the store itself wrote,
// then the drill restores one deck into a scratch id in a folder, reads it through the store,
// compares it with the backup, removes the folder and writes the month's record. A backup without
// the snapshot its manifest names, and a store without a complete night, fail with their reason.
// The route takes the cron secret alone.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';

import { DRILLS_PREFIX, runBackup, runRestoreDrill } from './backup';
import type { DrillRecord } from './backup';

const NIGHT = Date.parse('2026-11-01T03:00:00.000Z');
const DRILL = Date.parse('2026-11-01T06:00:00.000Z');
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'o1b-drill-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Two decks the store wrote (a seed push and a commit each), with their history. */
async function seededSource(): Promise<FakeBlobClient> {
  const source = memoryBlobClient('https://source.blob.local');
  const dir = join(root, 'seed');
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const [deckId, size] of [
    ['gt-brand', 20],
    ['q8wf2kzr0uyb3nxc5vlp1a7h2m', 22],
  ] as const) {
    await pushDeckDir(source, deckId, dir, { overwrite: false });
    const store = openBlobStore({
      client: source,
      deckId,
      dir: join(root, 'mirror', deckId),
      syncTtlMs: 0,
    });
    const { document } = await store.read();
    const outcome = await store.write({
      baseRevision: document.deck.revision,
      author: { kind: 'agent', name: 'agent', runId: 'drill-test' },
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: size },
      ],
    });
    expect(outcome.ok).toBe(true);
  }
  return source;
}

/** A backup store holding one complete night of the seeded source. */
async function backedUp(): Promise<FakeBlobClient> {
  const source = await seededSource();
  const backup = memoryBlobClient('https://backup.blob.local');
  const night = await runBackup({ source, target: backup, now: () => NIGHT });
  expect(night.state).toBe('done');
  return backup;
}

function recordOf(backup: FakeBlobClient, month: string): DrillRecord {
  const stored = backup.blobs.get(`${DRILLS_PREFIX}${month}.json`);
  expect(stored).toBeDefined();
  return JSON.parse(new TextDecoder().decode(stored?.bytes)) as DrillRecord;
}

describe('the restore drill (hardening O#1b)', () => {
  it('restores a deck into a scratch id, reads it through the store, every check holds, and the folder leaves', async () => {
    const backup = await backedUp();
    const scratchRoot = join(root, 'scratch');
    const record = await runRestoreDrill({ backup, scratchRoot, now: () => DRILL });
    expect(record.reason).toBeUndefined();
    expect(record).toMatchObject({ ok: true, month: '2026-11', day: '2026-11-01' });
    expect(record.checks).toEqual({
      manifestBytes: true,
      snapshotPresent: true,
      snapshotBytes: true,
      validates: true,
      documentMatchesSnapshot: true,
    });
    expect(['gt-brand', 'q8wf2kzr0uyb3nxc5vlp1a7h2m']).toContain(record.deckId);
    expect(record.scratchId).toMatch(/^drill-20261101-[0-9a-f]{8}$/);
    expect(record.revision).toBe(413);
    expect(record.objects).toBeGreaterThan(5);
    expect(existsSync(scratchRoot)).toBe(false);
    expect(recordOf(backup, '2026-11')).toEqual(record);
  });

  it('keeps the restored deck for a person to read with keep, and writes no record without record', async () => {
    const backup = await backedUp();
    const scratchRoot = join(root, 'kept');
    const record = await runRestoreDrill({
      backup,
      scratchRoot,
      now: () => DRILL,
      deckId: 'gt-brand',
      keep: true,
      record: false,
    });
    expect(record.ok).toBe(true);
    expect(record.deckId).toBe('gt-brand');
    const deck = join(scratchRoot, 'store', 'decks', record.scratchId ?? '');
    expect(readdirSync(deck).sort()).toEqual(['deck.json', 'slides', 'snapshots', 'versions']);
    const restored = await diskBlobClient(join(scratchRoot, 'store')).head(
      `decks/${record.scratchId}/deck.json`,
    );
    expect(restored?.version).toBe(
      backup.blobs.get('backup/2026-11-01/decks/gt-brand/deck.json')?.version,
    );
    expect(backup.blobs.has(`${DRILLS_PREFIX}2026-11.json`)).toBe(false);
  });

  it('fails with its reason when the backup lacks the snapshot the manifest names', async () => {
    const backup = await backedUp();
    await backup.del(
      [...backup.blobs.keys()].filter((pathname) => pathname.includes('/snapshots/')),
    );
    const record = await runRestoreDrill({
      backup,
      scratchRoot: join(root, 'scratch'),
      now: () => DRILL,
    });
    expect(record.ok).toBe(false);
    expect(record.checks.snapshotPresent).toBe(false);
    expect(record.reason).toMatch(/^the restored deck failed snapshotPresent/);
    expect(recordOf(backup, '2026-11').ok).toBe(false);
  });

  it('fails with its reason when no night is complete', async () => {
    const backup = memoryBlobClient('https://backup.blob.local');
    await backup.put('backup/2026-11-01/cursor.json', new TextEncoder().encode('{}'), {
      overwrite: false,
    });
    const record = await runRestoreDrill({
      backup,
      scratchRoot: join(root, 'scratch'),
      now: () => DRILL,
    });
    expect(record).toMatchObject({
      ok: false,
      reason: 'the backup store holds no complete day',
      day: null,
    });
    expect(recordOf(backup, '2026-11').ok).toBe(false);
  });
});

describe('GET /api/cron/restore-drill (hardening O#1b)', () => {
  const SECRET = 'cron-secret-for-the-drill-test-000000000';
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  type Handler = (input: { request: Request }) => Promise<Response>;
  async function handler(): Promise<Handler> {
    const { Route } = await import('../routes/api/cron.restore-drill');
    return (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
      .GET;
  }
  const call = async (bearer?: string): Promise<Response> =>
    (await handler())({
      request: new Request('https://www.turboslide.com/api/cron/restore-drill', {
        headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
      }),
    });

  it('answers 401 without the secret or with a wrong one, and 503 without a backup store', async () => {
    process.env.CRON_SECRET = SECRET;
    delete process.env.TURBOSLIDE_BACKUP_BLOB_TOKEN;
    delete process.env.TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN;
    delete process.env.TURBOSLIDE_BACKUP_DIR;
    expect((await call()).status).toBe(401);
    expect((await call(`${SECRET.slice(0, -1)}1`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(503);
  });

  it('runs the drill over the backup folder: 200 when every check held, 500 with the reason when none is complete', async () => {
    process.env.CRON_SECRET = SECRET;
    const folder = join(root, 'backup-store');
    process.env.TURBOSLIDE_BACKUP_DIR = folder;
    const empty = await call(SECRET);
    expect(empty.status).toBe(500);
    expect(await empty.json()).toMatchObject({
      ok: false,
      reason: 'the backup store holds no complete day',
    });
    const source = await seededSource();
    await runBackup({ source, target: diskBlobClient(folder), now: () => Date.now() });
    const passed = await call(SECRET);
    const body = (await passed.json()) as DrillRecord;
    expect(body.reason).toBeUndefined();
    expect(passed.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

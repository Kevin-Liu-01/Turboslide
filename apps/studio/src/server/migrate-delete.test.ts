// HR-K1#4b (docs/hosting.md 10): the public store is one store for production, every preview and
// development, so `admin.migrateStorage` refuses `delete` and `rollback` on a deployment whose
// public store another environment reads: every preview, and a checkout or development deployment
// with the public store's token. The steps run here through the action on the fake public store
// and a folder as the private store (`TURBOSLIDE_BLOB_PRIVATE_DIR`), never on a real store, and
// every answer matches the action's output schema. A delete whose removals do not all land answers
// `done: false` with the count left, never a 500 (HR-K1#4b's fix of 2026-10-17).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import type { BlobClient } from '@turboslide/store/blob-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import {
  DELETE_BATCH,
  MIGRATION_PLAN,
  MIGRATION_PROGRESS,
  putLayoutRecord,
} from '@turboslide/store/hosted';
import { sharesPublicStore } from '@turboslide/store/select';

const deployment = vi.hoisted((): { client: unknown } => ({ client: null }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exportBlobClient: () => Promise.resolve(deployment.client),
}));

const { runMigrateStorage } = await import('./migrate');

const TOKEN = 'vercel_blob_rw_teststore_secret';
const output = ACTIONS['admin.migrateStorage'].output;
const encoder = new TextEncoder();

/**
 * The rehearsal's private store on layout v2 as a run leaves it ready for `delete`: switched 4
 * hours ago, verified and rekeyed since, with every document of `legacy` in the plan of record.
 * Answers the backup time `delete` wants.
 */
async function switchedRehearsal(legacy: FakeBlobClient): Promise<string> {
  const records = diskBlobClient(dir, { hidden: true });
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const json = (value: unknown) => encoder.encode(JSON.stringify(value));
  const put = { overwrite: true, contentType: 'application/json' };
  await putLayoutRecord(records, { state: 'v2' });
  await records.put(
    MIGRATION_PROGRESS,
    json({
      schemaVersion: 1,
      run: at(5),
      switchedAt: at(4),
      verifiedAt: at(3),
      rekey: { passFrom: at(3), cleanFrom: at(3) },
    }),
    put,
  );
  const entries = [...legacy.blobs].map(([path, blob]) => [
    path,
    blob.version,
    blob.bytes.byteLength,
  ]);
  await records.put(
    MIGRATION_PLAN,
    json({ schemaVersion: 1, run: at(5), takenAt: at(5), entries }),
    put,
  );
  return at(2);
}

let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-k1b-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('delete on a shared public store (HR-K1#4b)', () => {
  it('names every preview, and a checkout or development with the public token, as shared', () => {
    expect(sharesPublicStore({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(sharesPublicStore({ VERCEL_ENV: 'preview', BLOB_READ_WRITE_TOKEN: TOKEN })).toBe(true);
    expect(sharesPublicStore({ VERCEL_ENV: 'development', BLOB_READ_WRITE_TOKEN: TOKEN })).toBe(
      true,
    );
    expect(sharesPublicStore({ BLOB_READ_WRITE_TOKEN: TOKEN })).toBe(true);
    expect(sharesPublicStore({ VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: TOKEN })).toBe(
      false,
    );
    // a rehearsal on a checkout without the token runs on a store of its own
    expect(sharesPublicStore({})).toBe(false);
  });

  it('runs the steps through the action, and refuses delete on a preview before any store call', async () => {
    const legacy = memoryBlobClient('https://public.local');
    await legacy.put('decks/q4/deck.json', new TextEncoder().encode('{"id":"q4"}'), {
      overwrite: false,
    });
    deployment.client = legacy;
    const rehearsal = { TURBOSLIDE_BLOB_PRIVATE_DIR: dir };
    for (const step of ['plan', 'freeze'] as const) {
      const answer = await runMigrateStorage({ step, budgetMs: 120_000 }, rehearsal);
      // the dispatcher checks every answer against the action's output
      expect(output.safeParse(answer).success, step).toBe(true);
      expect(answer.rowCount, step).toBe(0);
    }
    // the freeze settles minutes after its write, and the copy waits for it
    await expect(runMigrateStorage({ step: 'copy' }, rehearsal)).rejects.toThrow(
      /the freeze settles at /,
    );
    legacy.calls.length = 0;
    await expect(
      runMigrateStorage(
        { step: 'delete', backupAt: '2026-10-13T04:00:00Z' },
        { ...rehearsal, VERCEL_ENV: 'preview' },
      ),
    ).rejects.toThrow(/production alone/);
    expect(legacy.calls.filter((call) => call.op === 'del')).toEqual([]);
    expect(legacy.blobs.has('decks/q4/deck.json')).toBe(true);
    await expect(
      runMigrateStorage({ step: 'rollback' }, { ...rehearsal, VERCEL_ENV: 'preview' }),
    ).rejects.toThrow(/production alone/);
    // on the rehearsal's own store it is the missing switch that refuses
    await expect(
      runMigrateStorage({ step: 'delete', backupAt: '2026-10-13T04:00:00Z' }, rehearsal),
    ).rejects.toThrow(/after a recorded switch/);
    // unfreeze ends the freeze, without the lease, and answers through the action's output
    const unfrozen = await runMigrateStorage({ step: 'unfreeze' }, rehearsal);
    expect(output.safeParse(unfrozen).success).toBe(true);
    expect(unfrozen).toMatchObject({ state: 'v1', frozen: false, done: true });
  }, 60_000);
});

describe('delete inside its budget (HR-K1#4b fix)', () => {
  it('answers done false with a row for a batch the store refused, and the next call removes it', async () => {
    const legacy = memoryBlobClient('https://public.local');
    const paths = Array.from(
      { length: 60 },
      (_, i) => `decks/q4/versions/${String(i).padStart(2, '0')}.json`,
    );
    for (const path of paths) await legacy.put(path, encoder.encode(path), { overwrite: false });
    const backupAt = await switchedRehearsal(legacy);
    const refused = paths[DELETE_BATCH] ?? '';
    const refusing: BlobClient = {
      ...legacy,
      del: async (pathnames, options) => {
        if (pathnames.includes(refused)) throw new Error('Vercel Blob: Access denied');
        await legacy.del(pathnames, options);
      },
    };
    deployment.client = refusing;
    const rehearsal = { TURBOSLIDE_BLOB_PRIVATE_DIR: dir };
    const held = await runMigrateStorage(
      { step: 'delete', backupAt, budgetMs: 120_000 },
      rehearsal,
    );
    expect(output.safeParse(held).success).toBe(true);
    expect(held).toMatchObject({
      step: 'delete',
      state: 'v2',
      done: false,
      processed: DELETE_BATCH,
      remaining: paths.length - DELETE_BATCH,
      rows: [
        `${refused} and ${paths.length - DELETE_BATCH - 1} more: not removed: Vercel Blob: Access denied`,
      ],
    });
    expect([...legacy.blobs.keys()].sort()).toEqual(paths.slice(DELETE_BATCH));
    deployment.client = legacy;
    const gone = await runMigrateStorage(
      { step: 'delete', backupAt, budgetMs: 120_000 },
      rehearsal,
    );
    expect(output.safeParse(gone).success).toBe(true);
    expect(gone).toMatchObject({ done: true, rowCount: 0, remaining: 0 });
    expect(legacy.blobs.size).toBe(0);
  }, 60_000);
});

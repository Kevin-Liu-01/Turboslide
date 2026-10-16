// HR-K1#4b (docs/hosting.md 10): the public store is one store for production, every preview and
// development, so `admin.migrateStorage` refuses `delete` and `rollback` on a deployment whose
// public store another environment reads: every preview, and a checkout or development deployment
// with the public store's token. The steps run here through the action on the fake public store
// and a folder as the private store (`TURBOSLIDE_BLOB_PRIVATE_DIR`), never on a real store, and
// every answer matches the action's output schema.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { sharesPublicStore } from '@turboslide/store/select';

const deployment = vi.hoisted((): { client: unknown } => ({ client: null }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exportBlobClient: () => Promise.resolve(deployment.client),
}));

const { runMigrateStorage } = await import('./migrate');

const TOKEN = 'vercel_blob_rw_teststore_secret';
const output = ACTIONS['admin.migrateStorage'].output;

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

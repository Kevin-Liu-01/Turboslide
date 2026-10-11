// The backup's route (hardening O#1a): `GET /api/cron/backup` takes the cron secret alone (no
// secret, a wrong one, or one of equal length answers 401), answers 503 without a backup store,
// and with both runs a night into the backup store: here a folder (TURBOSLIDE_BACKUP_DIR) over a
// fake documents store, as a checkout's rehearsal runs it.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlobClient } from '@turboslide/store/blob-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';

const state = vi.hoisted(() => ({ source: null as BlobClient | null }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exportBlobClient: () => Promise.resolve(state.source),
}));

const { Route } = await import('../routes/api/cron.backup');
const { backupDay } = await import('./backup');

type Handler = (input: { request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  .GET;

const SECRET = 'cron-secret-for-the-backup-test-00000000';
const saved = { ...process.env };
let dir = '';

function call(bearer?: string): Promise<Response> {
  return get({
    request: new Request('https://www.turboslide.com/api/cron/backup', {
      headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
    }),
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'o1a-route-'));
  process.env.CRON_SECRET = SECRET;
  process.env.TURBOSLIDE_BACKUP_DIR = join(dir, 'backup-store');
  delete process.env.TURBOSLIDE_BACKUP_BLOB_TOKEN;
  delete process.env.TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN;
  const source = memoryBlobClient('https://source.blob.local');
  await source.put('decks/d1/deck.json', new TextEncoder().encode('{"revision":1}'), {
    overwrite: false,
  });
  await source.put('users/p1/decks.json', new TextEncoder().encode('{"decks":[]}'), {
    overwrite: false,
  });
  state.source = source;
});

afterEach(() => {
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/cron/backup (hardening O#1a)', () => {
  it('answers 401 without the secret, with a wrong one and with one of equal length', async () => {
    for (const bearer of [undefined, 'wrong', `${SECRET.slice(0, -1)}1`]) {
      const response = await call(bearer);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { status: 401 } });
    }
    expect(existsSync(join(dir, 'backup-store'))).toBe(false);
  });

  it('answers 401 to the right value when the project has no cron secret', async () => {
    delete process.env.CRON_SECRET;
    expect((await call(SECRET)).status).toBe(401);
  });

  it('answers 503 with the variable names when no backup store is connected', async () => {
    delete process.env.TURBOSLIDE_BACKUP_DIR;
    const response = await call(SECRET);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/TURBOSLIDE_BACKUP_BLOB_TOKEN/);
    expect(body.error.message).not.toMatch(/vercel_blob_rw/);
  });

  it('runs the night with the secret and writes the day into the backup store', async () => {
    const response = await call(SECRET);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { state: string; decks: number; objects: number };
    expect(body).toMatchObject({ state: 'done', decks: 1, objects: 2 });
    const day = join(dir, 'backup-store', 'backup', backupDay(Date.now()));
    expect(existsSync(join(day, 'decks', 'd1', 'deck.json'))).toBe(true);
    expect(existsSync(join(day, 'users', 'p1', 'decks.json'))).toBe(true);
    expect(existsSync(join(day, 'done.json'))).toBe(true);
    // the next call of the night reads the day's record and copies nothing
    expect(await (await call(SECRET)).json()).toMatchObject({ state: 'was-done', copied: 0 });
  });
});

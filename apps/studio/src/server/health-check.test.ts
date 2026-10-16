import { afterEach, describe, expect, test } from 'vitest';

import {
  DEFAULT_CANARY_DECK,
  HEALTH_CACHE_MS,
  cachedHealth,
  publicHealth,
  readHealth,
  resetHealthCache,
} from './health-check';
import type { HealthDeps } from './health-check';

// The app's health check of hardening HR-O#3 (RELIABILITY-14): the canary deck's manifest and the
// accounts database decide `ok`; the night's backup and the month's drill ride beside them for the
// Worker's alert; one reading per instance per 30 s. Every value is a test value.

const T = Date.parse('2026-10-13T06:05:00.000Z');

function deps(extra: Partial<HealthDeps> = {}): HealthDeps & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    env: { VERCEL_GIT_COMMIT_SHA: '8c9465b6823c3b9ed1bcc4174dc7e8c0f59f169e' },
    now: () => T,
    hasDeck: async (deckId) => {
      asked.push(deckId);
      return true;
    },
    accounts: async () => ({ engine: 'd1' }),
    backupJson: null,
    ...extra,
  };
}

afterEach(() => resetHealthCache());

describe('readHealth', () => {
  test('the canary deck and the accounts database answer: ok, and no backup on a deployment without its store', async () => {
    const d = deps();
    const reading = await readHealth(d);
    expect(reading).toMatchObject({
      ok: true,
      commit: '8c9465b6823c3b9ed1bcc4174dc7e8c0f59f169e',
      checkedAt: '2026-10-13T06:05:00.000Z',
      checks: {
        store: { ok: true, canary: DEFAULT_CANARY_DECK },
        accounts: { ok: true, engine: 'd1' },
      },
      backup: null,
      drill: null,
    });
    expect(d.asked).toEqual(['gt-brand']);
    expect(publicHealth(reading)).toEqual({
      ok: true,
      commit: '8c9465b6823c3b9ed1bcc4174dc7e8c0f59f169e',
    });
  });

  test('a missing canary, a store that throws, one that hangs and a database that refuses each fail by name', async () => {
    const missing = await readHealth(deps({ hasDeck: async () => false }));
    expect(missing.ok).toBe(false);
    expect(missing.checks.store).toMatchObject({ ok: false, reason: 'missing' });
    const thrown = await readHealth(
      deps({
        hasDeck: async () => {
          const error = new Error('the store said 503 for decks/gt-brand/deck.json');
          error.name = 'BlobServiceNotAvailable';
          throw error;
        },
      }),
    );
    expect(thrown.checks.store).toMatchObject({ ok: false, reason: 'BlobServiceNotAvailable' });
    expect(JSON.stringify(thrown)).not.toContain('decks/gt-brand');
    const hung = await readHealth(
      deps({ checkMs: 20, hasDeck: () => new Promise<boolean>(() => undefined) }),
    );
    expect(hung.checks.store).toMatchObject({ ok: false, reason: 'TimeoutError' });
    const refused = await readHealth(
      deps({
        accounts: async () => {
          throw new TypeError('fetch failed');
        },
      }),
    );
    expect(refused.ok).toBe(false);
    expect(refused.checks.accounts).toMatchObject({
      ok: false,
      engine: 'unknown',
      reason: 'TypeError',
    });
    // no accounts database is no failure
    expect((await readHealth(deps({ accounts: async () => null }))).checks.accounts).toMatchObject({
      ok: true,
      engine: 'none',
    });
  });

  test('the night’s backup and the month’s drill, read from the backup store', async () => {
    const paths: string[] = [];
    const store = (files: Record<string, unknown>) => async (pathname: string) => {
      paths.push(pathname);
      return files[pathname] ?? null;
    };
    const notDone = await readHealth(deps({ backupJson: store({}) }));
    expect(notDone.backup).toEqual({ day: '2026-10-13', done: false, failed: 0 });
    expect(notDone.drill).toBeNull();
    expect(paths).toEqual(['backup/2026-10-13/done.json', 'backup/drills/2026-10.json']);
    const done = await readHealth(
      deps({
        backupJson: store({
          'backup/2026-10-13/done.json': { day: '2026-10-13', failedCount: 2 },
          'backup/drills/2026-10.json': { month: '2026-10', ok: false, reason: 'snapshotPresent' },
        }),
      }),
    );
    expect(done.backup).toEqual({ day: '2026-10-13', done: true, failed: 2 });
    expect(done.drill).toEqual({ month: '2026-10', ok: false });
    // the backup's state never decides ok: the app serves while a night is late
    expect(done.ok).toBe(true);
  });
});

describe('cachedHealth', () => {
  test('one reading per 30 s per instance, shared by concurrent calls', async () => {
    let readings = 0;
    const make = () =>
      deps({
        hasDeck: async () => {
          readings += 1;
          return true;
        },
      });
    await Promise.all([
      cachedHealth(make, T),
      cachedHealth(make, T + 1),
      cachedHealth(make, T + 2),
    ]);
    expect(readings).toBe(1);
    await cachedHealth(make, T + HEALTH_CACHE_MS - 1);
    expect(readings).toBe(1);
    await cachedHealth(make, T + HEALTH_CACHE_MS);
    expect(readings).toBe(2);
  });
});

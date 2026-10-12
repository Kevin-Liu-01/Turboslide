import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { setSecurityLogSink } from '../log.ts';
import { DB_PRUNE_EVERY_MS, dbLimiter } from '../ratelimit.ts';
import { limiterSpentSet } from '../tokens.ts';
import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { buildIdentityRuntime } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { dbLimitStore, limitDigest } from './limits.ts';
import { memoryAuthDb } from './db.ts';

// HR-SA#3 (AUTH-8): the one limiter over the accounts database. Two identity runtimes over one
// fake D1 stand for two function instances: each has its own proxy client, its own memory and its
// own fallback, and the only state they share is the database, as on production. The live
// reading over two studio processes and the local Worker is in docs/hardening/build/SA-wave3.md.
// Every value here is a test value.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const BEARER = 'sa3-test-db-bearer-00000000000000000000000000000000000000000000';
const ORIGIN = 'http://localhost:4474';

let dir = '';
let fake: FakeD1;
const runtimes: IdentityRuntime[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-limits-'));
  fake = fakeD1(BEARER);
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

/** One instance: its own runtime over the shared fake, with the library's sign in limits on. */
function instance(name: string): IdentityRuntime {
  const runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_ACCOUNTS: 'd1',
      TURBOSLIDE_ROOM_HOST: '127.0.0.1:8794',
      TURBOSLIDE_DB_BEARER: BEARER,
      TURBOSLIDE_ROOM_INSECURE: '1',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
    },
    root: join(dir, name),
    stateDir: join(dir, name, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
    fetch: fake.fetch,
  });
  runtimes.push(runtime);
  return runtime;
}

function askMail(runtime: IdentityRuntime, email: string): Promise<Response> {
  return runtime.auth!.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: {
        host: 'localhost:4474',
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({ email, callbackURL: '/decks' }),
    }),
  );
}

describe('the one limiter over the accounts database (HR-SA#3)', () => {
  test('two instances read one count: a quota, a spent download token and the sign in limit', async () => {
    const a = instance('a');
    const b = instance('b');
    await Promise.all([a.ready, b.ready]);
    expect(a.limits?.kind).toBe('db');
    expect(b.limits).not.toBe(a.limits);

    // a quota of 3 a minute: two on one instance, one on the other, and the fourth is refused
    expect((await a.limits!.limit('acct_1:rendersPerHour', 3, 60_000)).ok).toBe(true);
    expect((await a.limits!.limit('acct_1:rendersPerHour', 3, 60_000)).ok).toBe(true);
    const third = await b.limits!.limit('acct_1:rendersPerHour', 3, 60_000);
    expect(third).toMatchObject({ ok: true, remaining: 0 });
    const fourth = await a.limits!.limit('acct_1:rendersPerHour', 3, 60_000);
    expect(fourth.ok).toBe(false);
    expect(fourth.resetAt).toBe(third.resetAt);
    // a refusal writes nothing: the stored count stays at the limit
    expect(
      fake.sqlite
        .prepare('select count from ts_limits where key = ?')
        .get(limitDigest('acct_1:rendersPerHour')),
    ).toEqual({ count: 3 });

    // a download token spent on one instance is refused on the other
    const exp = Date.now() + 10 * 60_000;
    expect(await limiterSpentSet(a.limits!).spend('0123456789abcdef', exp)).toBe(true);
    expect(await limiterSpentSet(b.limits!).spend('0123456789abcdef', exp)).toBe(false);
    expect(await limiterSpentSet(a.limits!).spend('0123456789abcdef', exp)).toBe(false);

    // the library's 10 mails an hour per address: ten on one instance, the eleventh on the other
    for (let n = 1; n <= 10; n += 1)
      expect((await askMail(a, `limit-${n}@example.test`)).status, `mail ${n}`).toBe(200);
    const eleventh = await askMail(b, 'limit-11@example.test');
    expect(eleventh.status).toBe(429);
    expect(Number(eleventh.headers.get('x-retry-after'))).toBeGreaterThan(3000);

    // no address and no counted key is stored as it was given
    const keys = (fake.sqlite.prepare('select key from ts_limits').all() as { key: string }[]).map(
      (row) => row.key,
    );
    expect(keys.every((key) => /^[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(JSON.stringify(keys)).not.toContain('203.0.113.7');
  });

  test('a window that ended starts again, a slot is released, and a cost above the limit writes nothing', async () => {
    const auth = await memoryAuthDb();
    let t = 1_000_000;
    const limiter = dbLimiter(dbLimitStore(auth.db), { now: () => t });
    expect((await limiter.limit('k', 2, 1_000)).ok).toBe(true);
    expect((await limiter.limit('k', 2, 1_000)).ok).toBe(true);
    expect((await limiter.limit('k', 2, 1_000)).ok).toBe(false);
    t += 1_000;
    expect(await limiter.limit('k', 2, 1_000)).toMatchObject({ ok: true, remaining: 1 });

    // a concurrency slot (window 0): taken, refused, released, taken again
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(true);
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(false);
    await limiter.release!('slot');
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(true);

    expect((await limiter.limit('big', 10, 60_000, 11)).ok).toBe(false);
    expect(
      auth
        .sqlite!.prepare('select count(*) as n from ts_limits where key = ?')
        .get(limitDigest('big')),
    ).toEqual({ n: 0 });
    await auth.close();
  });

  test('rows whose window ended are deleted at most every ten minutes per process', async () => {
    const auth = await memoryAuthDb();
    let t = 5_000_000;
    const limiter = dbLimiter(dbLimitStore(auth.db), { now: () => t });
    await limiter.limit('old', 5, 1_000);
    t += DB_PRUNE_EVERY_MS;
    await limiter.limit('new', 5, 60_000);
    await vi.waitFor(() =>
      expect(
        (auth.sqlite!.prepare('select key from ts_limits').all() as { key: string }[]).map(
          (row) => row.key,
        ),
      ).toEqual([limitDigest('new')]),
    );
    await auth.close();
  });

  test('a store that fails counts in this process and never refuses for it', async () => {
    const lines: string[] = [];
    const previous = setSecurityLogSink((line) => {
      lines.push(JSON.stringify(line));
    });
    try {
      const failing = {
        take: () => Promise.reject(new Error('no such table: ts_limits')),
        release: () => Promise.reject(new Error('no such table: ts_limits')),
        prune: () => Promise.resolve(),
      };
      const limiter = dbLimiter(failing);
      expect((await limiter.limit('k', 1, 60_000)).ok).toBe(true);
      expect((await limiter.limit('k', 1, 60_000)).ok).toBe(false);
      await limiter.release!('k');
      expect((await limiter.limit('k', 1, 60_000)).ok).toBe(true);
      const degraded = lines.filter((line) => line.includes('config.degraded'));
      expect(degraded).toHaveLength(1);
      expect(degraded[0]).toContain('counts in memory');
    } finally {
      setSecurityLogSink(previous);
    }
  });

  test('a checkout on SQLite keeps the limiter in its own memory', async () => {
    const runtime = buildIdentityRuntime({
      env: { TURBOSLIDE_AUTH_DB: join(dir, 'auth.sqlite'), TURBOSLIDE_SESSION_SECRET: SECRET },
      root: dir,
      stateDir: join(dir, 'state'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
    });
    runtimes.push(runtime);
    expect(runtime.db?.kind).toBe('sqlite');
    expect(runtime.limits).toBeNull();
  });
});

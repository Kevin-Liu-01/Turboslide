import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { migrateAuthDb, openAuthDb } from './db.ts';
import type { AuthDb } from './db.ts';
import { buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { KEY_CACHE_MS, dbApiKeyStore, resolveBearerSync } from './tokens.ts';

// HR-SA#6 (AUTH-5): on the D1 path the API keys are read from what an instance read before. A key
// minted on another instance was refused until a background refresh landed, and an idle instance
// served a key revoked elsewhere from its old read. Now each request primes the key: a key not
// read yet, or read more than KEY_CACHE_MS ago, is read by its hash before the synchronous checks.
// Two stores over one fake D1 stand for two instances. Every value here is a test value.

const BEARER = 'sa6-test-db-bearer-00000000000000000000000000000000000000000000';
const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const STATIC = 'sa6-static-bootstrap-bearer-000000000000';

let fake: FakeD1;
const opened: AuthDb[] = [];

beforeEach(() => {
  fake = fakeD1(BEARER);
});

afterEach(async () => {
  for (const db of opened.splice(0)) await db.close();
});

function instance(): AuthDb {
  const db = openAuthDb(
    { kind: 'd1', host: '127.0.0.1:8794', insecure: true, reason: 'test' },
    { TURBOSLIDE_DB_BEARER: BEARER },
    { fetch: fake.fetch },
  );
  opened.push(db);
  return db;
}

describe('the key cache of the D1 path (HR-SA#6)', () => {
  test('a key minted on one instance works on another at once, and the static bearer sees it', async () => {
    let t = 1_000_000;
    const a = instance();
    await migrateAuthDb(a);
    const keysA = dbApiKeyStore(a, () => new Date(t));
    const keysB = dbApiKeyStore(instance(), () => new Date(t));
    await keysB.prime(STATIC); // the cold read of the count settles: no key yet
    expect(keysB.countSync()).toBe(0);
    const made = await keysA.create({ userId: 'user-1', name: 'ci', scopes: ['read'] });
    // without the prime, the second instance's view does not hold the key (the finding)
    expect(keysB.resolveSync(made.secret)).toBeNull();
    await keysB.prime(made.secret);
    expect(resolveBearerSync(made.secret, { env: {}, keys: keysB })).toMatchObject({
      kind: 'api-key',
      record: { id: made.record.id },
    });
    // the static bearer is the bootstrap bearer alone once a key exists, on this instance too
    t += KEY_CACHE_MS;
    await keysB.prime(STATIC);
    expect(resolveBearerSync(STATIC, { env: { TURBOSLIDE_TOKEN: STATIC }, keys: keysB })).toEqual({
      kind: 'bootstrap',
      bootstrapOnly: true,
    });
  });

  test('a key revoked on one instance is refused on the other once its read is KEY_CACHE_MS old, however long it sat idle', async () => {
    let t = 2_000_000;
    const a = instance();
    await migrateAuthDb(a);
    const keysA = dbApiKeyStore(a, () => new Date(t));
    const keysB = dbApiKeyStore(instance(), () => new Date(t));
    const made = await keysA.create({ userId: 'user-1', name: 'ci', scopes: ['read'] });
    await keysB.prime(made.secret);
    expect(keysB.resolveSync(made.secret)?.id).toBe(made.record.id);
    await keysA.revoke(made.record.id);
    // the revoking instance refuses at once
    expect(keysA.resolveSync(made.secret)).toBeNull();
    // an hour idle: the old read is stale, so the next request reads the key again and refuses it
    t += 60 * 60_000;
    await keysB.prime(made.secret);
    expect(resolveBearerSync(made.secret, { env: {}, keys: keysB })).toEqual({
      kind: 'refused',
      reason: 'unknown_key',
    });
    // a read within KEY_CACHE_MS is not repeated: one statement per key per window
    const before = fake.statements.length;
    await keysB.prime(made.secret);
    expect(fake.statements.length).toBe(before);
  });

  test('through the request identity of two runtimes: cold, then revoked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-key-cache-'));
    const runtimes: IdentityRuntime[] = [];
    const runtime = (name: string): IdentityRuntime => {
      const built = buildIdentityRuntime({
        env: {
          TURBOSLIDE_ACCOUNTS: 'd1',
          TURBOSLIDE_ROOM_HOST: '127.0.0.1:8794',
          TURBOSLIDE_DB_BEARER: BEARER,
          TURBOSLIDE_ROOM_INSECURE: '1',
          TURBOSLIDE_SESSION_SECRET: SECRET,
        },
        root: join(dir, name),
        stateDir: join(dir, name, 'state'),
        hosted: true,
        announce: () => undefined,
        log: () => undefined,
        fetch: fake.fetch,
      });
      runtimes.push(built);
      return built;
    };
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-12T09:00:00.000Z') });
    try {
      const a = runtime('a');
      await a.ready;
      const b = runtime('b');
      await b.ready;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const user = 'user-key-cache';
      fake.sqlite
        .prepare(
          'insert into "user" (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, 1, ?, ?)',
        )
        .run(
          user,
          'K',
          'key-cache@example.test',
          new Date().toISOString(),
          new Date().toISOString(),
        );
      const made = await a.keys.create({ userId: user, name: 'ci', scopes: ['read'] });
      const asAgent = (): Request =>
        new Request('https://studio.test/api/actions/account.me', {
          method: 'POST',
          headers: { authorization: `Bearer ${made.secret}` },
        });
      expect((await requestIdentity(asAgent(), b, { mint: false })).kind).toBe('agent');
      await a.keys.revoke(made.record.id);
      vi.setSystemTime(new Date(Date.now() + KEY_CACHE_MS));
      expect((await requestIdentity(asAgent(), b, { mint: false })).kind).toBe('none');
    } finally {
      vi.useRealTimers();
      for (const built of runtimes) await built.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

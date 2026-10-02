import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { labelFor } from '@turboslide/identity/labels';

import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import {
  SESSION_FACTS_CACHE_MS,
  accountSession,
  buildIdentityRuntime,
  forgetAccountFacts,
  requestIdentity,
  resolveIdentity,
  sessionCacheKey,
} from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { boundPrincipalD1, selectPrincipalStore } from './principal.ts';
import { AUTH_SCHEMA_VERSION } from './schema.ts';

// The identity runtime on the `d1` engine (docs/CLOUDFLARE.md 4.1 to 4.3), every row against
// d1-fake.ts: the two migration sets run through the proxy once and the `ts_schema` row skips
// them on the next cold instance; a sign in with the captured code writes the library's rows
// through the proxy; the session facts are cached per instance under the SHA-256 of the session
// cookie for 300 s and a second request costs no statement; `forgetAccountFacts` drops the row;
// the principal records live in `ts_principal` with the hourly touch; a refused or timed out
// proxy makes the request anonymous after one retry (the second unit row of 4.3). The values
// below are test values for a local process.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const BEARER = 'r4-test-room-bearer-0000000000000000000000000000000000000000';
const ORIGIN = 'http://localhost:4474';

let dir = '';
let fake: FakeD1;
const runtimes: IdentityRuntime[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-identity-d1-'));
  fake = fakeD1(BEARER);
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function runtimeOn(
  d1: FakeD1,
  extra: Record<string, string | undefined> = {},
  options: { cacheMs?: number; log?: (line: string) => void; readyRetryMs?: number } = {},
): IdentityRuntime {
  const runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_ACCOUNTS: 'd1',
      TURBOSLIDE_ROOM_HOST: '127.0.0.1:8794',
      TURBOSLIDE_ROOM_BEARER: BEARER,
      TURBOSLIDE_ROOM_INSECURE: '1',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
      TURBOSLIDE_ADMIN_EMAILS: 'admin@example.test',
      ...extra,
    },
    root: dir,
    stateDir: join(dir, 'state'),
    hosted: false,
    announce: () => undefined,
    log: options.log ?? (() => undefined),
    fetch: d1.fetch,
    ...(options.cacheMs !== undefined ? { sessionFactsCacheMs: options.cacheMs } : {}),
    ...(options.readyRetryMs !== undefined ? { readyRetryMs: options.readyRetryMs } : {}),
  });
  runtimes.push(runtime);
  return runtime;
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4474');
  headers.set('origin', ORIGIN);
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function cookiesOf(response: Response, previous = ''): string {
  const pairs = new Map<string, string>();
  for (const part of previous.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) pairs.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq > 0) pairs.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** The magic link request, the captured code read from `ts_mail` through the proxy, the code sign in. */
async function signIn(
  runtime: IdentityRuntime,
  email: string,
  cookie = '',
): Promise<{ cookie: string; userId: string }> {
  const asked = await runtime.auth!.handler(
    request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/decks' }),
      cookie,
    }),
  );
  expect(asked.status).toBe(200);
  const mails = await runtime.mailer.list();
  const mail = mails.find((m) => m.to === email && m.kind === 'sign-in');
  const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  expect(code).toHaveLength(6);
  const verified = await runtime.auth!.handler(
    request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, otp: code }),
      cookie,
    }),
  );
  expect(verified.status).toBe(200);
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie: cookiesOf(verified, cookie), userId: body.user.id };
}

describe('the d1 engine boots through the proxy', () => {
  test('selects d1, migrates both table sets through /db/query once, and the next cold instance skips them', async () => {
    const first = runtimeOn(fake);
    expect(first.dbSelection.kind).toBe('d1');
    expect(first.db?.kind).toBe('d1');
    expect(first.sessionFacts.ttlMs).toBe(SESSION_FACTS_CACHE_MS);
    await first.ready;
    const tables = (
      fake.sqlite
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    for (const name of [
      'user',
      'session',
      'account',
      'verification',
      'ts_alias',
      'ts_principal',
      'ts_schema',
    ])
      expect(tables).toContain(name);
    expect(fake.sqlite.prepare('select v from ts_schema').all()).toEqual([
      { v: AUTH_SCHEMA_VERSION },
    ]);
    const migrated = fake.statements.length;
    expect(migrated).toBeGreaterThan(10);
    /* the second instance over the same database: one statement, the version row */
    fake.reset();
    const second = runtimeOn(fake);
    await second.ready;
    /* the version row, and the key store's one time refresh of its 5 s cache; no schema statement */
    expect([...fake.statements].sort(), fake.statements.join(' | ')).toEqual(
      [
        expect.stringMatching(/^select "v" from "ts_schema"/),
        expect.stringMatching(/^select \* from "ts_api_key"/),
      ].sort(),
    );
    expect(fake.statements.filter((s) => /^(create|alter)/i.test(s))).toEqual([]);
    expect(first.methods).toMatchObject({ available: true, email: true, google: false });
    /* the first boot carried the migrations' schema statements; the reason never names the bearer */
    expect(JSON.stringify(first.dbSelection)).not.toContain(BEARER);
    expect(first.dbSelection.reason).toContain('TURBOSLIDE_ROOM_HOST=127.0.0.1:8794');
  });

  test('a sign in with the captured code writes the library rows and the alias through the proxy, and the agent key store takes the cache path', async () => {
    const runtime = runtimeOn(fake);
    await runtime.ready;
    const first = await requestIdentity(request('/edit/q4'), runtime);
    expect(first.kind).toBe('anonymous');
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const anonId = first.principalId ?? '';
    /* the anonymous record landed in ts_principal */
    expect(fake.sqlite.prepare('select principal_id from ts_principal').all()).toEqual([
      { principal_id: anonId },
    ]);
    const { cookie, userId } = await signIn(runtime, 'maya@example.test', anonCookie);
    const signedIn = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(signedIn.kind).toBe('account');
    expect(signedIn.principalId).toBe(`usr_${userId}`);
    expect(signedIn.account?.email).toBe('maya@example.test');
    expect(await runtime.aliases.accountOf(anonId)).toBe(userId);
    expect((await resolveIdentity(runtime, anonId)).accountId).toBe(userId);
    expect(
      (fake.sqlite.prepare('select count(*) as n from ts_alias').get() as { n: number }).n,
    ).toBe(1);
    expect(
      (fake.sqlite.prepare('select count(*) as n from session').get() as { n: number }).n,
    ).toBe(1);
    /* the key store: no synchronous handle, so a key resolves from the 5 s cache after a refresh */
    const made = await runtime.keys.create({ userId, name: 'ci', scopes: ['read'] });
    expect(runtime.keys.resolveSync(made.secret)?.id).toBe(made.record.id);
    expect(runtime.keys.countSync()).toBe(1);
  });
});

describe('the session facts cache (CLOUDFLARE.md 4.1; cost.d1.reads)', () => {
  test('the second request of a session costs no statement; the key is the hash of the cookie; forgetAccountFacts drops it', async () => {
    const runtime = runtimeOn(fake);
    await runtime.ready;
    const { cookie, userId } = await signIn(runtime, 'maya@example.test');
    const req = request('/edit/q4', { cookie });
    const key = sessionCacheKey(req);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(cookie.split('=')[1] ?? 'x');
    fake.reset();
    const a = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(a.kind).toBe('account');
    const missStatements = fake.statements.length;
    expect(missStatements).toBeGreaterThan(0);
    expect(missStatements).toBeLessThanOrEqual(6);
    fake.reset();
    const b = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(b.kind).toBe('account');
    expect(b.account?.userId).toBe(userId);
    expect(fake.statements, 'a cache hit reads nothing from D1').toEqual([]);
    /* `fresh: true` reads past the cache */
    fake.reset();
    await requestIdentity(request('/edit/q4', { cookie }), runtime, { fresh: true });
    expect(fake.statements.length).toBeGreaterThan(0);
    /* a rename lands in the user row; the cache still answers the old name until it is dropped */
    fake.sqlite.prepare("update user set name = 'Maya Chen' where id = ?").run(userId);
    expect((await requestIdentity(request('/edit/q4', { cookie }), runtime)).account?.name).toBe(
      '',
    );
    forgetAccountFacts(`usr_${userId}`, runtime);
    expect((await requestIdentity(request('/edit/q4', { cookie }), runtime)).account?.name).toBe(
      'Maya Chen',
    );
    /* a request without a session cookie asks the library nothing */
    fake.reset();
    const none = await accountSession(runtime, request('/edit/q4'));
    expect(none).toBeNull();
    expect(fake.statements).toEqual([]);
  });

  test('the cache is off on the sqlite engine unless asked, and the anonymous link is written once per cached session', async () => {
    const runtime = runtimeOn(fake);
    await runtime.ready;
    const first = await requestIdentity(request('/edit/q4'), runtime);
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const { cookie, userId } = await signIn(runtime, 'kai@example.test');
    const both = `${anonCookie}; ${cookie}`;
    await requestIdentity(request('/edit/q4', { cookie: both }), runtime);
    expect(await runtime.aliases.accountOf(first.principalId ?? '')).toBe(userId);
    fake.reset();
    await requestIdentity(request('/edit/q4', { cookie: both }), runtime);
    expect(
      fake.statements.filter((s) => s.includes('ts_alias')),
      'the alias read is not repeated inside the cached session',
    ).toEqual([]);
    const sqlite = buildIdentityRuntime({
      env: { TURBOSLIDE_AUTH_DB: 'state2/auth.sqlite', TURBOSLIDE_SESSION_SECRET: SECRET },
      root: dir,
      stateDir: join(dir, 'state2'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
    });
    runtimes.push(sqlite);
    await sqlite.ready;
    expect(sqlite.sessionFacts.ttlMs).toBe(0);
  });
});

describe('the principal records on D1 (realtime.departed-guest.name-stable)', () => {
  test('a name typed through the store is read back through a second runtime over the same database; touch writes at most once an hour', async () => {
    const a = runtimeOn(fake);
    const b = runtimeOn(fake);
    await a.ready;
    await b.ready;
    const first = await requestIdentity(request('/edit/q4'), a);
    const id = first.principalId ?? '';
    await a.principals.put({ ...(await a.principals.get(id))!, name: 'Imani Okafor' });
    expect((await b.principals.get(id))?.name).toBe('Imani Okafor');
    expect((await resolveIdentity(b, id)).displayName).toBe('Imani Okafor');
    /* the hourly rule: a touch inside the hour writes nothing and hands back the stored record */
    fake.reset();
    const now = new Date();
    const touched = await b.principals.touch(id, now, true);
    expect(touched?.name).toBe('Imani Okafor');
    expect(fake.statements.filter((s) => /^insert|^update/i.test(s))).toEqual([]);
    const later = new Date(now.getTime() + 61 * 60_000);
    const rewritten = await b.principals.touch(id, later, true);
    expect(rewritten?.lastSeenAt).toBe(later.toISOString());
    expect(fake.statements.filter((s) => /^insert into "ts_principal"/i.test(s))).toHaveLength(1);
    /* the process binding: the runtime is not the process one, so nothing is bound here */
    expect(boundPrincipalD1()).toBeUndefined();
    expect(selectPrincipalStore({ stateDir: join(dir, 'x') }).kind).toBe('file');
    expect(selectPrincipalStore({ stateDir: join(dir, 'x'), d1: a.db!.db }).kind).toBe('d1');
  });
});

describe('a D1 proxy that does not answer (CLOUDFLARE.md 4.3, 3.8)', () => {
  test('a refused /db/query makes the request anonymous after one retry, logged once', async () => {
    const lines: string[] = [];
    const runtime = runtimeOn(fake, {}, { log: (line) => lines.push(line) });
    await runtime.ready;
    const first = await requestIdentity(request('/edit/q4'), runtime);
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const { cookie } = await signIn(runtime, 'maya@example.test', anonCookie);
    /* the account is cached; a fresh read against a refusing proxy is the row's case */
    fake.reset();
    fake.behaviour.refuse = { status: 503, error: 'over the daily rows' };
    const identity = await requestIdentity(
      request('/edit/q4', { cookie: `${anonCookie}; ${cookie}` }),
      runtime,
      {
        fresh: true,
      },
    );
    expect(identity.kind).toBe('anonymous');
    expect(identity.principalId).toBe(first.principalId);
    expect(identity.author?.name).toBe(labelFor(first.principalId ?? ''));
    /* one retry: the library's session read was asked twice before the fall */
    expect(fake.calls.query).toBeGreaterThanOrEqual(2);
    expect(lines.filter((l) => l.includes('the account session was not read'))).toHaveLength(1);
    expect(lines.join('\n')).toContain('after one retry');
    expect(lines.join('\n')).not.toContain(BEARER);
    /* the proxy back: the session is read again */
    fake.behaviour.refuse = null;
    const back = await requestIdentity(request('/edit/q4', { cookie }), runtime, { fresh: true });
    expect(back.kind).toBe('account');
  });

  test('a migration refused while the proxy is down runs again on a later read and the runtime recovers', async () => {
    const lines: string[] = [];
    fake.behaviour.refuse = { status: 503, error: 'the Worker is starting' };
    const runtime = runtimeOn(fake, {}, { log: (line) => lines.push(line), readyRetryMs: 0 });
    await expect(runtime.ready).rejects.toThrow();
    expect(lines.filter((l) => l.includes('did not migrate'))).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(BEARER);
    /* the Worker answers again: the next read of ready runs the migration and resolves */
    fake.behaviour.refuse = null;
    await runtime.ready;
    const identity = await requestIdentity(request('/edit/q4'), runtime);
    expect(identity.kind).toBe('anonymous');
    expect(identity.minted).not.toBeNull();
  });

  test('a timed out /db/query falls to anonymous after the two attempts, and so does an anonymous record read', async () => {
    const runtime = runtimeOn(fake);
    await runtime.ready;
    const first = await requestIdentity(request('/edit/q4'), runtime);
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const { cookie } = await signIn(runtime, 'maya@example.test');
    const key = sessionCacheKey(request('/edit/q4', { cookie })) ?? '';
    runtime.sessionFacts.rows.delete(key);
    /* the fake fails each call the way a passed deadline fails, 50 ms in, so the row runs in
       under a second; the real 10 s deadline is the dialect test's */
    fake.behaviour.hangMs = 50;
    fake.reset();
    fake.behaviour.hangMs = 50;
    const identity = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    /* the request is anonymous: no anonymous cookie rode with the session cookie, so a fresh
       anonymous principal is minted for it, as for any first request */
    expect(identity.kind).toBe('anonymous');
    expect(identity.minted).not.toBeNull();
    expect(fake.calls.query, 'two attempts on the facts, one refused record write').toBe(3);
    /* an anonymous browser whose record cannot be read keeps its id and reads as its label */
    const anonymous = await requestIdentity(request('/edit/q4', { cookie: anonCookie }), runtime);
    expect(anonymous.kind).toBe('anonymous');
    expect(anonymous.principalId).toBe(first.principalId);
    expect(anonymous.author?.name).toBe(labelFor(first.principalId ?? ''));
  });
});

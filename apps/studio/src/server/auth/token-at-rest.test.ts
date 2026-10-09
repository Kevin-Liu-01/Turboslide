import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Session tokens at rest (CRIT-M5, HARDENING.md HR-K2#5): the rewrite of one statement, then the
// library's own flows on both engines that pass token-at-rest.ts, D1 through the proxy (over
// d1-fake.ts, which answers as the Worker) and a local SQLite file. Each flow reads the session
// table itself: a digest in every row, the token in the cookie alone. Every value is a test value.

vi.mock('../room', () => ({ forgetIdentity: () => undefined }));
vi.mock('../access', () => ({
  noteDisplayName: () => Promise.resolve(),
  noteAvatarChoice: () => Promise.resolve(),
}));

import { registerAccountActions } from './actions.ts';
import type { ActionRequestFacts } from './actions.ts';
import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import {
  isSealedToken,
  openSessionRows,
  sealSessionStatement,
  sealToken,
} from './token-at-rest.ts';

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz012345';
const SEALED = sealToken(TOKEN);

describe('the rewrite of one statement', () => {
  test('a token is stored as h1: and its SHA-256 hex, and a digest is never digested again', () => {
    expect(SEALED).toBe('h1:99ace9ac249ad4adce3e97d48cf9e52fd415e937dbe66c07e4c03f954a2d3ac1');
    expect(isSealedToken(SEALED)).toBe(true);
    expect(isSealedToken(TOKEN)).toBe(false);
    expect(isSealedToken('h1:short')).toBe(false);
    expect(sealToken(SEALED)).toBe(SEALED);
    expect(sealToken('h1:short')).not.toBe('h1:short');
  });

  test('the library’s session statements seal the token parameter and nothing else', () => {
    const insert = sealSessionStatement(
      'insert into "session" ("id", "expiresAt", "token", "createdAt", "userId") values (?, ?, ?, ?, ?) returning *',
      ['s1', 'e', TOKEN, 'c', 'u1'],
    );
    expect(insert.params).toEqual(['s1', 'e', SEALED, 'c', 'u1']);
    expect(insert.opened.get(SEALED)).toBe(TOKEN);
    const byToken = sealSessionStatement(
      'select "primary".* from (select * from "session" where "session"."token" = ? limit ?) as "primary"',
      [TOKEN, 1],
    );
    expect(byToken.params).toEqual([SEALED, 1]);
    const update = sealSessionStatement(
      'update "session" set "expiresAt" = ?, "updatedAt" = ? where "session"."token" = ? returning *',
      ['e', 'u', TOKEN],
    );
    expect(update.params).toEqual(['e', 'u', SEALED]);
    // a set item on the column and an in list, as a later library version could send them
    expect(
      sealSessionStatement('update "session" set "token" = ? where "id" = ?', [TOKEN, 's1']).params,
    ).toEqual([SEALED, 's1']);
    expect(
      sealSessionStatement('delete from "session" where "session"."token" in (?, ?)', [TOKEN, 'x'])
        .params,
    ).toEqual([SEALED, sealToken('x')]);
    // a digest from the sessions list passes unchanged and is not mapped back
    const revoke = sealSessionStatement('delete from "session" where "session"."token" = ?', [
      SEALED,
    ]);
    expect(revoke.params).toEqual([SEALED]);
    expect(revoke.opened.size).toBe(0);
    // the sessions of a user: no parameter changes, the rows still pass the session rule
    const list = sealSessionStatement(
      'select "primary".* from (select * from "session" where "session"."userId" = ? limit ?) as "primary"',
      ['u1', 100],
    );
    expect(list.params).toEqual(['u1', 100]);
    expect(list.session).toBe(true);
  });

  test('other tables, another table’s token column and the schema statements pass unchanged', () => {
    for (const [sql, params] of [
      ['select * from "ts_api_key" where "hash" = ?', [TOKEN]],
      ['select "token" from "invite" where "invite"."token" = ?', [TOKEN]],
      ['create table "session" ("id" text not null primary key, "token" text not null unique)', []],
      ['create index "session_token_idx" on "session" ("token")', []],
    ] as const) {
      const sealed = sealSessionStatement(sql, params);
      expect(sealed.params, sql).toEqual(params);
      expect(sealed.session, sql).toBe(false);
    }
  });

  test('a comparison of the token column the rewrite does not know is refused', () => {
    for (const sql of [
      'delete from "session" where "session"."token" <> ?',
      'select * from "session" where "token" like ?',
      'select * from "session" where "token" not in (?)',
    ])
      expect(() => sealSessionStatement(sql, [TOKEN]), sql).toThrow(TypeError);
  });

  test('rows: the digest the statement sealed reads as the token, a plain row is dropped, other rows pass', () => {
    const statement = sealSessionStatement(
      'select "primary".* from (select * from "session" where "session"."token" = ?) as "primary"',
      [TOKEN],
    );
    expect(openSessionRows([{ id: 's1', token: SEALED }], statement)).toEqual([
      { id: 's1', token: TOKEN },
    ]);
    const list = sealSessionStatement('select * from "session" where "userId" = ?', ['u1']);
    expect(
      openSessionRows(
        [
          { id: 's1', token: SEALED },
          { id: 'old', token: 'aPlainTokenFromBeforeTheRewrite0' },
          { n: 2 },
        ],
        list,
      ),
    ).toEqual([{ id: 's1', token: SEALED }, { n: 2 }]);
    const other = sealSessionStatement('select * from "user" where "id" = ?', ['u1']);
    const rows = [{ id: 'u1', token: 'not a session' }];
    expect(openSessionRows(rows, other)).toBe(rows);
  });
});

// ------------------------------------------------------------------------------------------
// The flows, on both engines

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const BEARER = 'k2-test-database-bearer-111111111111111111111111111111111111111';
const HOST = 'localhost:4852';
const ORIGIN = `http://${HOST}`;

let dir = '';
let fake: FakeD1 | null = null;
let runtime: IdentityRuntime;
let dispatcher: Dispatcher;

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', HOST);
  headers.set('origin', ORIGIN);
  headers.set('user-agent', 'token-at-rest');
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function post(path: string, body: unknown, cookie?: string): Request {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(cookie !== undefined ? { cookie } : {}),
  });
}

/** The session token cookie alone (no cookie cache), as `name=value`. */
function sessionCookieOf(response: Response): string {
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0] ?? '';
    if (first.startsWith('ts.session_token=') && first.length > 'ts.session_token='.length)
      return first;
  }
  throw new Error(`no session cookie (${response.status})`);
}

/** The token the signed cookie carries: the value before its signature. */
function tokenOf(cookie: string): string {
  const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  return value.slice(0, value.lastIndexOf('.'));
}

async function signIn(email: string): Promise<string> {
  const handle = (req: Request): Promise<Response> => runtime.auth!.handler(req);
  const sent = await handle(
    post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
  );
  expect(sent.status).toBe(200);
  // the newest mail first (mailer.ts `list`)
  const mail = (await runtime.mailer.list()).find((m) => m.to === email);
  const otp = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  const verified = await handle(post('/api/auth/sign-in/email-otp', { email, otp }));
  expect(verified.status).toBe(200);
  return sessionCookieOf(verified);
}

async function act(cookie: string, action: string, input: unknown = {}): Promise<unknown> {
  const req = request('/api/actions/x', { cookie });
  const facts: ActionRequestFacts = {
    identity: await requestIdentity(req, runtime),
    request: req,
    setHeader: () => undefined,
  };
  dispatcher = createDispatcher();
  registerAccountActions(dispatcher, { runtime, facts: () => Promise.resolve(facts) });
  return dispatcher.dispatch(action, input, { author: { kind: 'human' as const, name: 'test' } });
}

function table(): DatabaseSync {
  return fake !== null ? fake.sqlite : runtime.db!.sqlite!;
}

function storedTokens(): string[] {
  return (
    table().prepare('select token from session order by createdAt').all() as { token: string }[]
  ).map((row) => row.token);
}

describe.each(['d1', 'sqlite'] as const)('the session table on the %s engine', (engine) => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'turboslide-token-at-rest-'));
    fake = engine === 'd1' ? fakeD1(BEARER) : null;
    runtime = buildIdentityRuntime({
      env: {
        ...(engine === 'd1'
          ? {
              TURBOSLIDE_ACCOUNTS: 'd1',
              TURBOSLIDE_ROOM_HOST: '127.0.0.1:8852',
              TURBOSLIDE_DB_BEARER: BEARER,
              TURBOSLIDE_ROOM_INSECURE: '1',
            }
          : { TURBOSLIDE_AUTH_DB: 'state/auth.sqlite' }),
        TURBOSLIDE_MAIL: 'capture',
        TURBOSLIDE_SESSION_SECRET: SECRET,
        TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
      },
      root: dir,
      stateDir: join(dir, 'state'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
      sessionFactsCacheMs: 0,
      ...(fake !== null ? { fetch: fake.fetch } : {}),
    });
    await runtime.ready;
  });

  afterEach(async () => {
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('a sign in stores the digest, the cookie carries the token, and the cookie reads the session through a refresh', async () => {
    const cookie = await signIn('maya@example.test');
    const token = tokenOf(cookie);
    expect(isSealedToken(token)).toBe(false);
    expect(storedTokens()).toEqual([sealToken(token)]);
    expect((await requestIdentity(request('/edit/q4', { cookie }), runtime)).kind).toBe('account');
    const read = await runtime.auth!.handler(
      request('/api/auth/get-session?disableCookieCache=true', { cookie }),
    );
    expect(((await read.json()) as { session: { token: string } }).session.token).toBe(token);
    // a session past its update age is refreshed: the row keeps the digest, the cookie the token
    table()
      .prepare('update session set expiresAt = ?')
      .run(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    const refreshed = await runtime.auth!.handler(
      request('/api/auth/get-session?disableCookieCache=true', { cookie }),
    );
    expect(refreshed.status).toBe(200);
    expect(tokenOf(sessionCookieOf(refreshed))).toBe(token);
    const row = table().prepare('select token, expiresAt from session').get() as {
      token: string;
      expiresAt: string;
    };
    expect(row.token).toBe(sealToken(token));
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  test('the list holds digests; one session ended, Sign out everywhere else and sign out', async () => {
    const email = 'sana@example.test';
    const one = await signIn(email);
    const two = await signIn(email);
    const three = await signIn(email);
    expect(storedTokens().every(isSealedToken)).toBe(true);
    const listed = (await (
      await runtime.auth!.handler(request('/api/auth/list-sessions', { cookie: one }))
    ).json()) as { token: string }[];
    expect(listed).toHaveLength(3);
    expect(listed.every((s) => isSealedToken(s.token))).toBe(true);
    const { sessions } = (await act(one, 'account.sessions')) as {
      sessions: { id: string; current: boolean }[];
    };
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const other = sessions.find((s) => !s.current)!;
    expect(await act(one, 'account.signOut', { sessionId: other.id })).toEqual({ signedOut: 1 });
    expect(storedTokens()).toHaveLength(2);
    expect(await act(one, 'account.signOut', { all: true })).toEqual({ signedOut: 1 });
    expect(storedTokens()).toEqual([sealToken(tokenOf(one))]);
    expect((await requestIdentity(request('/edit/q4', { cookie: one }), runtime)).kind).toBe(
      'account',
    );
    for (const ended of [two, three])
      expect((await requestIdentity(request('/edit/q4', { cookie: ended }), runtime)).kind).toBe(
        'anonymous',
      );
    // the library's own route would end this session too: it is off
    expect(
      (await runtime.auth!.handler(post('/api/auth/revoke-other-sessions', {}, one))).status,
    ).toBe(404);
    expect((await runtime.auth!.handler(post('/api/auth/sign-out', {}, one))).status).toBe(200);
    expect(storedTokens()).toEqual([]);
  });

  test('a session stored before the rewrite reaches no one and leaves the list', async () => {
    const email = 'lena@example.test';
    const old = await signIn(email);
    const current = await signIn(email);
    // the row as a build before HR-K2#5 wrote it: the plain token
    table()
      .prepare('update session set token = ? where token = ?')
      .run(tokenOf(old), sealToken(tokenOf(old)));
    expect((await requestIdentity(request('/edit/q4', { cookie: old }), runtime)).kind).toBe(
      'anonymous',
    );
    const { sessions } = (await act(current, 'account.sessions')) as {
      sessions: { current: boolean }[];
    };
    expect(sessions).toEqual([expect.objectContaining({ current: true })]);
    // Sign out everywhere else ends it with the user's other sessions
    expect(await act(current, 'account.signOut', { all: true })).toEqual({ signedOut: 0 });
    expect(
      await runtime.auth!.handler(post('/api/auth/revoke-sessions', {}, current)),
    ).toHaveProperty('status', 200);
    expect(storedTokens()).toEqual([]);
  });
});

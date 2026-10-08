import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { statementSkeleton } from '@turboslide/realtime/d1-statements';
import type { StatementList } from '@turboslide/realtime/d1-statements';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// The accounts allowlist of the realtime Worker's `/db` routes (AUTH-3; docs/security.md section
// 12; HARDENING.md HR-K2#3). Every statement the accounts code sends through the D1 dialect is
// recorded here over a database in production's state: the Worker's migrations applied and the
// `ts_schema` row current, so a cold instance sends no schema statement, as on both D1 databases
// today. The flows are the ones a browser, the CLI or an agent can reach: the magic link and the
// code, the session reads and refresh, the sign outs, Google's callback (a new account with a
// picture and a refresh token, the return without either, an address account linking Google),
// the device flow, the API keys, the profile, the quotas, the captured mail, the admin actions
// and the account's deletion. The fake answers as the Worker does, so a statement missing from
// apps/realtime-worker/src/db-statements.json fails the flow that sent it and the last test lists
// it. `TURBOSLIDE_RECORD_STATEMENTS=write` turns the check off and writes the list from what the
// flows sent:
//
//   TURBOSLIDE_RECORD_STATEMENTS=write node_modules/.bin/vitest run \
//     apps/studio/src/server/auth/record-statements.test.ts
//
// Google's token endpoint is stubbed on the global fetch (the library's code exchange) with a
// token answer whose ID token is unsigned: the library reads Google's profile by decoding it
// (@better-auth/core google.mjs `getUserInfo`). Every value below is a test value.

const forgetIdentity = vi.fn((_id: string) => undefined);
vi.mock('../room', () => ({ forgetIdentity: (id: string) => forgetIdentity(id) }));
vi.mock('../access', () => ({
  noteDisplayName: () => Promise.resolve(),
  noteAvatarChoice: () => Promise.resolve(),
}));

import { registerAccountActions, registerAdminActions } from './actions.ts';
import type { ActionRequestFacts } from './actions.ts';
import { DEVICE_CLIENT_ID, GOOGLE_ID_VARIABLE, GOOGLE_SECRET_VARIABLE } from './better-auth.ts';
import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { keyForDeviceGrant } from './device-grant.ts';
import { buildIdentityRuntime, forgetAllAccountFacts, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { AUTH_SCHEMA_KEY, AUTH_SCHEMA_VERSION } from './schema.ts';

const WRITE = process.env.TURBOSLIDE_RECORD_STATEMENTS === 'write';
const LIST = fileURLToPath(
  new URL('../../../../realtime-worker/src/db-statements.json', import.meta.url),
);
const MIGRATIONS = fileURLToPath(
  new URL('../../../../realtime-worker/migrations/', import.meta.url),
);
const HINT =
  'statements the Worker would refuse (apps/realtime-worker/src/db-statements.json); a new statement of the accounts code is recorded with TURBOSLIDE_RECORD_STATEMENTS=write';

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const BEARER = 'k2-test-database-bearer-000000000000000000000000000000000000000';
const HOST = 'localhost:4474';
const ORIGIN = `http://${HOST}`;
const GOOGLE_ID = 'fake-client-id.apps.googleusercontent.com';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let dir = '';
let fake: FakeD1;
let runtime: IdentityRuntime;
let dispatcher: Dispatcher;
let facts: ActionRequestFacts;
const setCookies: string[] = [];

/** A database in production's state: the Worker's migrations, then the version row a boot wrote. */
function productionShaped(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  sqlite
    .prepare('insert into ts_schema (k, v) values (?, ?)')
    .run(AUTH_SCHEMA_KEY, AUTH_SCHEMA_VERSION);
  return sqlite;
}

function readList(): StatementList {
  return JSON.parse(readFileSync(LIST, 'utf8')) as StatementList;
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', HOST);
  headers.set('origin', ORIGIN);
  headers.set('user-agent', 'record-statements');
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

function cookiesOf(response: Response, previous = ''): string {
  const pairs = new Map<string, string>();
  for (const part of previous.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) pairs.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const value = first.slice(eq + 1).trim();
    if (value === '') pairs.delete(first.slice(0, eq).trim());
    else pairs.set(first.slice(0, eq).trim(), value);
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** The library's answer, with the refused statements named when the status is not the one asked. */
async function expectStatus(response: Response, status: number, label: string): Promise<void> {
  if (response.status === status) return;
  const text = await response.clone().text();
  throw new Error(
    `${label}: ${response.status}, not ${status} (${text.slice(0, 200)}); ${HINT}: ${JSON.stringify(fake.refused)}`,
  );
}

async function handle(req: Request): Promise<Response> {
  return runtime.auth!.handler(req);
}

/** The captured sign in mail of an address: the code and the link. */
async function mailOf(email: string): Promise<{ code: string; link: string }> {
  const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
  return {
    code: /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '',
    link: /(https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+)/.exec(mail?.text ?? '')?.[1] ?? '',
  };
}

/** The code sign in (the magic link request carries the code), the way the sign in page does it. */
async function signInWithCode(email: string, cookie = ''): Promise<string> {
  /* a fresh mail and quota for the address, written past the proxy: the per address limit allows
     three mails in ten minutes and this file signs one address in several times */
  fake.sqlite.prepare('delete from ts_mail where toAddress = ?').run(email);
  fake.sqlite.prepare('delete from ts_quota').run();
  await expectStatus(
    await handle(post('/api/auth/sign-in/magic-link', { email, callbackURL: '/decks' }, cookie)),
    200,
    'sign-in/magic-link',
  );
  const { code } = await mailOf(email);
  expect(code).toHaveLength(6);
  const verified = await handle(post('/api/auth/sign-in/email-otp', { email, otp: code }, cookie));
  await expectStatus(verified, 200, 'sign-in/email-otp');
  return cookiesOf(verified, cookie);
}

async function actAs(cookie: string, action: string, input: unknown = {}): Promise<unknown> {
  const req = request('/api/actions/x', { cookie });
  facts = {
    identity: await requestIdentity(req, runtime),
    request: req,
    setHeader: (name, value) => {
      if (name === 'set-cookie') setCookies.push(...(Array.isArray(value) ? value : [value]));
    },
  };
  return dispatcher.dispatch(action, input, { author: { kind: 'human' as const, name: 'test' } });
}

/** An unsigned ID token: the library decodes Google's profile from it and verifies nothing here. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: 'https://accounts.google.com',
    aud: GOOGLE_ID,
    iat: now,
    exp: now + 3600,
    email_verified: true,
    ...claims,
  })}.c2lnbmF0dXJl`;
}

/** One Google sign in: the social start, the stubbed code exchange, the callback. */
async function googleSignIn(
  claims: Record<string, unknown>,
  tokens: { refresh?: boolean } = {},
  cookie = '',
): Promise<string> {
  const started = await handle(
    post(
      '/api/auth/sign-in/social',
      { provider: 'google', callbackURL: `${ORIGIN}/decks` },
      cookie,
    ),
  );
  await expectStatus(started, 200, 'sign-in/social');
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const jar = cookiesOf(started, cookie);
  const exchange = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!target.startsWith(TOKEN_ENDPOINT)) throw new Error(`unexpected fetch ${target}`);
    void init;
    return Response.json({
      access_token: `ya29.test-${Math.random().toString(36).slice(2)}`,
      expires_in: 3599,
      scope:
        'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      token_type: 'Bearer',
      id_token: idToken(claims),
      ...(tokens.refresh === true ? { refresh_token: '1//test-refresh-token' } : {}),
    });
  });
  try {
    const back = await handle(
      request(`/api/auth/callback/google?state=${encodeURIComponent(state)}&code=test-code`, {
        cookie: jar,
      }),
    );
    await expectStatus(back, 302, 'callback/google');
    expect(back.headers.get('location') ?? '').not.toContain('error');
    const signedIn = cookiesOf(back, jar);
    expect(signedIn).toContain('ts.session_token=');
    return signedIn;
  } finally {
    exchange.mockRestore();
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-record-statements-'));
  fake = fakeD1(
    BEARER,
    productionShaped(),
    WRITE ? {} : { allowed: new Set(readList().statements) },
  );
  runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_ACCOUNTS: 'd1',
      TURBOSLIDE_ROOM_HOST: '127.0.0.1:8771',
      TURBOSLIDE_DB_BEARER: BEARER,
      TURBOSLIDE_ROOM_INSECURE: '1',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
      TURBOSLIDE_ADMIN_EMAILS: 'admin@example.test',
      [GOOGLE_ID_VARIABLE]: GOOGLE_ID,
      [GOOGLE_SECRET_VARIABLE]: 'fake-secret-for-local-tests',
    },
    root: dir,
    stateDir: join(dir, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
    fetch: fake.fetch,
  });
  dispatcher = createDispatcher();
  const deps = { runtime, facts: () => Promise.resolve(facts) };
  registerAccountActions(dispatcher, deps);
  registerAdminActions(dispatcher, deps);
});

afterAll(async () => {
  await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the accounts statements, recorded over a database in production’s state (AUTH-3)', () => {
  test('a cold instance reads the version row and the key cache, and sends no schema statement', async () => {
    await runtime.ready;
    expect(runtime.db?.kind).toBe('d1');
    expect(fake.statements.filter((sql) => /^\s*(create|alter|drop|pragma)\b/i.test(sql))).toEqual(
      [],
    );
  });

  test('anonymous visitors, the code sign in, the magic link, a wrong code and a resend', async () => {
    const first = await requestIdentity(request('/edit/q4'), runtime);
    expect(first.kind).toBe('anonymous');
    const anon = first.minted?.setCookie?.split(';')[0] ?? '';
    const cookie = await signInWithCode('maya@example.test', anon);
    const me = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(me.kind).toBe('account');

    // the link in the mail, opened in another browser
    await expectStatus(
      await handle(
        post('/api/auth/sign-in/magic-link', { email: 'lena@example.test', callbackURL: '/decks' }),
      ),
      200,
      'sign-in/magic-link (link)',
    );
    const { link } = await mailOf('lena@example.test');
    const opened = await handle(request(new URL(link).pathname + new URL(link).search));
    await expectStatus(opened, 302, 'magic-link/verify');
    expect(cookiesOf(opened)).toContain('ts.session_token=');

    // a wrong code counts an attempt; a fresh code by the OTP route
    await handle(
      post('/api/auth/sign-in/magic-link', { email: 'omar@example.test', callbackURL: '/decks' }),
    );
    const wrong = await handle(
      post('/api/auth/sign-in/email-otp', { email: 'omar@example.test', otp: '000000' }),
    );
    expect(wrong.status).toBe(400);
    await expectStatus(
      await handle(
        post('/api/auth/email-otp/send-verification-otp', {
          email: 'omar@example.test',
          type: 'sign-in',
        }),
      ),
      200,
      'email-otp/send-verification-otp',
    );
  });

  test('the session: read past the cookie cache, refresh, list, the account, revoke, sign out', async () => {
    const email = 'sana@example.test';
    const one = await signInWithCode(email);
    const two = await signInWithCode(email);
    const three = await signInWithCode(email);
    await expectStatus(
      await handle(request('/api/auth/get-session?disableCookieCache=true', { cookie: one })),
      200,
      'get-session',
    );
    // a session past its update age is refreshed by the next read
    fake.sqlite
      .prepare(
        'update session set expiresAt = ? where userId = (select id from user where email = ?)',
      )
      .run(new Date(Date.now() + 60 * 60 * 1000).toISOString(), email);
    await expectStatus(
      await handle(request('/api/auth/get-session?disableCookieCache=true', { cookie: one })),
      200,
      'get-session (refresh)',
    );
    await expectStatus(
      await handle(request('/api/auth/list-sessions', { cookie: one })),
      200,
      'list-sessions',
    );
    await expectStatus(
      await handle(request('/api/auth/list-accounts', { cookie: one })),
      200,
      'list-accounts',
    );
    await expectStatus(
      await handle(post('/api/auth/update-user', { name: 'Sana' }, one)),
      200,
      'update-user',
    );
    forgetAllAccountFacts(runtime);
    const { sessions } = (await actAs(one, 'account.sessions')) as {
      sessions: { id: string; current: boolean }[];
    };
    expect(sessions.length).toBe(3);
    const other = sessions.find((s) => !s.current)!;
    expect(await actAs(one, 'account.signOut', { sessionId: other.id })).toEqual({ signedOut: 1 });
    expect(await actAs(one, 'account.signOut', { all: true })).toEqual({ signedOut: 1 });
    const four = await signInWithCode(email);
    await expectStatus(
      await handle(post('/api/auth/revoke-other-sessions', {}, four)),
      200,
      'revoke-other-sessions',
    );
    const five = await signInWithCode(email);
    await expectStatus(
      await handle(post('/api/auth/revoke-sessions', {}, five)),
      200,
      'revoke-sessions',
    );
    const six = await signInWithCode(email);
    const current = (await actAs(six, 'account.sessions')) as {
      sessions: { id: string; current: boolean }[];
    };
    const mine = current.sessions.find((s) => s.current)!;
    expect(await actAs(six, 'account.signOut', { sessionId: mine.id })).toEqual({ signedOut: 1 });
    const seven = await signInWithCode(email);
    await expectStatus(await handle(post('/api/auth/sign-out', {}, seven)), 200, 'sign-out');
    void two;
    void three;
  });

  test('Google: a new account with a picture and a refresh token, the return without, a link to an address account, an account with no picture', async () => {
    const gina = { sub: 'google-sub-gina', email: 'gina@example.test', name: 'Gina Park' };
    await googleSignIn(
      { ...gina, picture: 'https://lh3.googleusercontent.com/a/gina' },
      { refresh: true },
    );
    await googleSignIn({ ...gina, picture: 'https://lh3.googleusercontent.com/a/gina' });
    await googleSignIn(gina, { refresh: true });
    // an address that signed in by code first takes Google as a second account row
    await signInWithCode('ravi@example.test');
    await googleSignIn({ sub: 'google-sub-ravi', email: 'ravi@example.test', name: 'Ravi' });
    await googleSignIn({ sub: 'google-sub-ines', email: 'ines@example.test', name: 'Ines' });
  });

  test('the device flow: a pending poll, the page’s read, approve, the grant as an API key, deny', async () => {
    const cookie = await signInWithCode('dev@example.test');
    const start = async (): Promise<{ device_code: string; user_code: string }> => {
      const asked = await handle(
        post('/api/auth/device/code', { client_id: DEVICE_CLIENT_ID, scope: 'read write' }),
      );
      await expectStatus(asked, 200, 'device/code');
      return (await asked.json()) as { device_code: string; user_code: string };
    };
    const poll = (deviceCode: string): Promise<Response> =>
      handle(
        post('/api/auth/device/token', {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: DEVICE_CLIENT_ID,
        }),
      );
    const code = await start();
    expect((await poll(code.device_code)).status).toBe(400);
    await expectStatus(
      await handle(
        request(`/api/auth/device?user_code=${encodeURIComponent(code.user_code)}`, { cookie }),
      ),
      200,
      'device (verify)',
    );
    await expectStatus(
      await handle(post('/api/auth/device/approve', { userCode: code.user_code }, cookie)),
      200,
      'device/approve',
    );
    // the CLI's next poll after its interval
    fake.sqlite.prepare('update deviceCode set lastPolledAt = null').run();
    const granted = await poll(code.device_code);
    await expectStatus(granted, 200, 'device/token');
    const context = await runtime.auth!.$context;
    const key = await keyForDeviceGrant(granted, {
      keys: runtime.keys,
      findSession: async (token) => {
        const found = await context.internalAdapter.findSession(token);
        return found === null ? null : { userId: found.session.userId };
      },
      deleteSession: (token) => context.internalAdapter.deleteSession(token),
    });
    const { access_token } = (await key.json()) as { access_token: string };
    const agent = await requestIdentity(
      request('/api/actions/deck.list', { headers: { authorization: `Bearer ${access_token}` } }),
      runtime,
    );
    expect(agent.kind).toBe('agent');
    const denied = await start();
    await expectStatus(
      await handle(
        request(`/api/auth/device?user_code=${encodeURIComponent(denied.user_code)}`, { cookie }),
      ),
      200,
      'device (verify before deny)',
    );
    await expectStatus(
      await handle(post('/api/auth/device/deny', { userCode: denied.user_code }, cookie)),
      200,
      'device/deny',
    );
    fake.sqlite.prepare('update deviceCode set lastPolledAt = null').run();
    expect((await poll(denied.device_code)).status).toBe(400);
  });

  test('keys, the profile, the quotas, the captured mail and the admin actions', async () => {
    const admin = await signInWithCode('admin@example.test');
    const made = (await actAs(admin, 'account.tokens.create', {
      name: 'ci',
      scopes: ['read', 'write'],
    })) as { token: { tokenId: string }; secret: string };
    await actAs(admin, 'account.tokens.list');
    const used = await requestIdentity(
      request('/api/actions/deck.list', { headers: { authorization: `Bearer ${made.secret}` } }),
      runtime,
    );
    expect(used.kind).toBe('agent');
    await runtime.keys.touch(made.token.tokenId, new Date());
    expect(await runtime.keys.resolve(made.secret)).not.toBeNull();
    await actAs(admin, 'account.tokens.revoke', { tokenId: made.token.tokenId });
    await actAs(admin, 'account.setName', { name: 'Ada Admin' });
    await actAs(admin, 'account.setAvatar', { variant: 'initials', initials: 'AA' });
    await actAs(admin, 'account.me');
    await actAs(admin, 'admin.bootstrap', { email: 'boot@example.test' });
    await actAs(admin, 'admin.mail.list', { limit: 5 });
    await actAs(admin, 'admin.mail.list', { since: new Date(0).toISOString() });
    await runtime.profiles.admins();
    await runtime.profiles.avatarKeys();
    await runtime.quotas.take('record:probe', 3, 60_000);
    await runtime.quotas.take('record:probe', 3, 60_000);
    await runtime.quotas.peek('record:probe');
    await runtime.quotas.reset('record:probe');
    await actAs(admin, 'account.forget');
  });

  test('the account’s deletion: the library’s rows, then the profile, the aliases, the record and the keys', async () => {
    const email = 'gone@example.test';
    const first = await requestIdentity(request('/edit/q4'), runtime);
    const anon = first.minted?.setCookie?.split(';')[0] ?? '';
    const cookie = await signInWithCode(email, anon);
    await actAs(cookie, 'account.tokens.create', { name: 'gone', scopes: ['read'] });
    await expectStatus(await handle(post('/api/auth/delete-user', {}, cookie)), 200, 'delete-user');
    expect(
      fake.sqlite.prepare('select count(*) as n from user where email = ?').get(email),
    ).toEqual({ n: 0 });
  });

  test('every statement sent is in the list, and the list holds no statement the code no longer sends', () => {
    const recorded = [...new Set(fake.statements.map(statementSkeleton))]
      .filter((skeleton): skeleton is string => skeleton !== null)
      .sort();
    if (WRITE) {
      const list: StatementList = {
        about:
          'The accounts allowlist of the realtime Worker’s /db routes (AUTH-3): the statement skeletons the accounts code sends, recorded by apps/studio/src/server/auth/record-statements.test.ts (@turboslide/realtime/d1-statements has the skeleton rule). Regenerate with TURBOSLIDE_RECORD_STATEMENTS=write node_modules/.bin/vitest run apps/studio/src/server/auth/record-statements.test.ts; never edit by hand.',
        statements: recorded,
      };
      writeFileSync(LIST, `${JSON.stringify(list, null, 2)}\n`);
      return;
    }
    expect(fake.refused, HINT).toEqual([]);
    const listed = readList().statements;
    expect(
      listed.filter((skeleton) => !recorded.includes(skeleton)),
      'listed statements no flow sent: regenerate the list',
    ).toEqual([]);
    expect([...listed].sort()).toEqual(listed);
  });
});

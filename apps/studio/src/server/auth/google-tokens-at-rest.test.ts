import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { StatementList } from '@turboslide/realtime/d1-statements';

import { GOOGLE_ID_VARIABLE, GOOGLE_SECRET_VARIABLE } from './better-auth.ts';
import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';

// Google's tokens at rest in the accounts database (SPEC-2; docs/hardening/HARDENING.md HR-K2#7;
// docs/security.md section 12). The library stores the access and refresh tokens of a Google sign
// in encrypted under `BETTER_AUTH_SECRET` (`account.encryptOAuthTokens`), which the database
// bearer never reaches, and reads a row stored before the option as it is until the next Google
// sign in rewrites it (better-auth 1.7.4 `dist/oauth2/utils.mjs`). The library leaves the ID token
// as Google sent it (`dist/oauth2/link-account.mjs`), and a Google ID token signed within the hour
// is a sign in on `/api/auth/sign-in/social`, so the Google provider refuses ID tokens there
// (`disableIdTokenSignIn`): nothing in the studio, the CLI or an agent signs in that way.
//
// The database is a fake D1 in production's state, made by the Worker's migrations alone and
// refusing what the Worker's statement list refuses, so the rows read here are the rows the
// Worker's D1 holds and every statement of the flow is one production runs. Google's token endpoint and its key set are
// stubbed on the global fetch, and the ID tokens are signed with a key made by this file. Every
// value below is a test value. The rows claim stored values and statuses, never a time, so each
// test may take a minute on a loaded machine.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const AUTH_SECRET = 'k2-test-better-auth-secret-0000000000000000000000000000000000000';
const BEARER = 'k2-test-database-bearer-000000000000000000000000000000000000000';
const HOST = 'localhost:4474';
const ORIGIN = `http://${HOST}`;
const GOOGLE_ID = 'fake-client-id.apps.googleusercontent.com';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const KEY_SET = 'https://www.googleapis.com/oauth2/v3/certs';
const KEY_ID = 'k2-test-key';
const TEST_MS = 60_000;
const MIGRATIONS = fileURLToPath(
  new URL('../../../../realtime-worker/migrations/', import.meta.url),
);
const STATEMENTS = fileURLToPath(
  new URL('../../../../realtime-worker/src/db-statements.json', import.meta.url),
);

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEYS = {
  keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: KEY_ID, alg: 'RS256', use: 'sig' }],
};

type Issued = { access: string; refresh: string | null; id: string };
type AccountRow = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
};

let dir = '';
let fake: FakeD1;
let runtime: IdentityRuntime;

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', HOST);
  headers.set('origin', ORIGIN);
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

async function handle(req: Request): Promise<Response> {
  return runtime.auth!.handler(req);
}

/** A Google ID token signed with this file's key, as Google signs one: RS256, its key id, an hour. */
function signedIdToken(claims: Record<string, unknown>): string {
  const part = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = `${part({ alg: 'RS256', typ: 'JWT', kid: KEY_ID })}.${part({
    iss: 'https://accounts.google.com',
    aud: GOOGLE_ID,
    iat: now,
    exp: now + 3600,
    email_verified: true,
    ...claims,
  })}`;
  return `${head}.${sign('sha256', Buffer.from(head), keys.privateKey).toString('base64url')}`;
}

/** Google's two endpoints the library calls: the code exchange answers `issued`, the key set this file's key. */
function stubGoogle(issued: Issued) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const target =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith(KEY_SET)) return Response.json(KEYS);
    if (!target.startsWith(TOKEN_ENDPOINT)) throw new Error(`unexpected fetch ${target}`);
    return Response.json({
      access_token: issued.access,
      expires_in: 3599,
      scope:
        'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      token_type: 'Bearer',
      id_token: issued.id,
      ...(issued.refresh !== null ? { refresh_token: issued.refresh } : {}),
    });
  });
}

/** One Google sign in through the browser's path: the social start, the code exchange, the callback. */
async function googleSignIn(
  claims: { sub: string; email: string },
  refresh: boolean,
): Promise<{ cookie: string; issued: Issued }> {
  const nonce = Math.random().toString(36).slice(2);
  const issued: Issued = {
    access: `ya29.k2-test-access-${nonce}`,
    refresh: refresh ? `1//k2-test-refresh-${nonce}` : null,
    id: signedIdToken({ ...claims, name: 'Test Person' }),
  };
  const started = await handle(
    post('/api/auth/sign-in/social', { provider: 'google', callbackURL: `${ORIGIN}/decks` }),
  );
  expect(started.status, 'sign-in/social').toBe(200);
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const exchange = stubGoogle(issued);
  try {
    const back = await handle(
      request(`/api/auth/callback/google?state=${encodeURIComponent(state)}&code=test-code`, {
        cookie: cookiesOf(started),
      }),
    );
    expect(back.status, 'callback/google').toBe(302);
    expect(back.headers.get('location') ?? '').not.toContain('error');
    const cookie = cookiesOf(back, cookiesOf(started));
    expect(cookie).toContain('ts.session_token=');
    return { cookie, issued };
  } finally {
    exchange.mockRestore();
  }
}

/** The Google account row of a subject, as a reader of the Worker's D1 sees it. */
function storedRow(sub: string): AccountRow {
  const row = fake.sqlite
    .prepare(
      'select id, accessToken, refreshToken, idToken from account where providerId = ? and accountId = ?',
    )
    .get('google', sub) as AccountRow | undefined;
  if (row === undefined) throw new Error(`no Google account row for ${sub}`);
  return row;
}

/** No statement of the flow is one the Worker would refuse (apps/realtime-worker/src/db-statements.json). */
function expectNoneRefused(): void {
  expect(fake.refused, 'statements the Worker would refuse').toEqual([]);
}

/** The access token the library reads back for the cookie's person (`/get-access-token`). */
async function readBack(cookie: string, accountId: string): Promise<string> {
  const answer = await handle(post('/api/auth/get-access-token', { accountId }, cookie));
  expect(answer.status, 'get-access-token').toBe(200);
  return ((await answer.json()) as { accessToken: string }).accessToken;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-google-tokens-'));
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  const list = JSON.parse(readFileSync(STATEMENTS, 'utf8')) as StatementList;
  fake = fakeD1(BEARER, sqlite, { allowed: new Set(list.statements) });
  // production's settings: no TURBOSLIDE_LOCAL_OPEN and the library's limiter on
  runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_ACCOUNTS: 'd1',
      TURBOSLIDE_ROOM_HOST: '127.0.0.1:8772',
      TURBOSLIDE_DB_BEARER: BEARER,
      TURBOSLIDE_ROOM_INSECURE: '1',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      BETTER_AUTH_SECRET: AUTH_SECRET,
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
  await runtime.ready;
  expect(runtime.db?.kind).toBe('d1');
}, TEST_MS);

afterAll(async () => {
  await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Google’s tokens at rest (SPEC-2, HR-K2#7)', { timeout: TEST_MS }, () => {
  test('a Google sign in stores the access and refresh tokens encrypted, and the library reads the access token back equal', async () => {
    const { cookie, issued } = await googleSignIn(
      { sub: 'k2-google-1001', email: 'ada@example.test' },
      true,
    );
    const row = storedRow('k2-google-1001');
    expect(row.accessToken, 'the stored access token').not.toBe(issued.access);
    expect(row.accessToken ?? '').not.toContain(issued.access);
    expect(row.accessToken).toMatch(/^[0-9a-f]+$/);
    expect(row.refreshToken, 'the stored refresh token').not.toBe(issued.refresh);
    expect(row.refreshToken ?? '').not.toContain(issued.refresh ?? '');
    expect(row.refreshToken).toMatch(/^[0-9a-f]+$/);
    expect(await readBack(cookie, row.id)).toBe(issued.access);
    expectNoneRefused();
  });

  test('a row stored before the change reads as it is, and the next Google sign in rewrites it', async () => {
    const first = await googleSignIn({ sub: 'k2-google-1002', email: 'bo@example.test' }, true);
    const { id } = storedRow('k2-google-1002');
    // the row as a build before HR-K2#7 wrote it
    fake.sqlite
      .prepare('update account set accessToken = ?, refreshToken = ? where id = ?')
      .run('ya29.k2-test-stored-plain', '1//k2-test-stored-plain', id);
    expect(await readBack(first.cookie, id)).toBe('ya29.k2-test-stored-plain');

    const again = await googleSignIn({ sub: 'k2-google-1002', email: 'bo@example.test' }, true);
    const row = storedRow('k2-google-1002');
    expect(row.id).toBe(id);
    expect(row.accessToken).not.toBe(again.issued.access);
    expect(row.accessToken).toMatch(/^[0-9a-f]+$/);
    expect(row.refreshToken).not.toBe(again.issued.refresh);
    expect(row.refreshToken).toMatch(/^[0-9a-f]+$/);
    expect(await readBack(again.cookie, id)).toBe(again.issued.access);
    expectNoneRefused();
  });

  test('the stored ID token is no sign in: an ID token posted to /sign-in/social is refused', async () => {
    const { issued } = await googleSignIn(
      { sub: 'k2-google-1003', email: 'cy@example.test' },
      false,
    );
    const row = storedRow('k2-google-1003');
    // the library keeps the ID token as Google sent it, signed and inside its hour
    expect(row.idToken).toBe(issued.id);

    const keySet = stubGoogle(issued);
    try {
      const replay = await handle(
        post('/api/auth/sign-in/social', {
          provider: 'google',
          idToken: { token: row.idToken },
          callbackURL: `${ORIGIN}/decks`,
        }),
      );
      const cookie = cookiesOf(replay);
      const who = await requestIdentity(request('/decks', { cookie }), runtime);
      expect(
        { status: replay.status, signedInAs: who.account?.email ?? null },
        'the stored ID token posted as a sign in',
      ).toEqual({ status: 404, signedInAs: null });
      expect(((await replay.json()) as { code?: string }).code).toBe('ID_TOKEN_NOT_SUPPORTED');
      expect(cookie).not.toContain('ts.session_token=');
      expectNoneRefused();
    } finally {
      keySet.mockRestore();
    }
  });
});

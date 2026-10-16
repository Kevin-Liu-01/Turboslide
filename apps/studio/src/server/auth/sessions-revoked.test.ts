import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SESSION_CACHE_S } from './better-auth.ts';
import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import { SESSION_FACTS_CACHE_MS, buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';

// HR-SA#7 (AUTH-6): Sign out everywhere else took up to 5 minutes to reach other sessions, since
// both the library's cookie cache and an instance's session facts kept a session for 300 s, and
// a facts miss read the cookie cache, so the two could stack. Both now keep it 60 s and a facts
// miss reads the session row, so a copied cookie is refused on any instance within a minute.
// Two runtimes over one fake D1 stand for two instances. Every value here is a test value.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const BEARER = 'sa7-test-db-bearer-00000000000000000000000000000000000000000000';
const ORIGIN = 'http://localhost:4474';

let dir = '';
let fake: FakeD1;
const runtimes: IdentityRuntime[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-sessions-revoked-'));
  fake = fakeD1(BEARER);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const runtime of runtimes.splice(0)) await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function instance(name: string): IdentityRuntime {
  const runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_ACCOUNTS: 'd1',
      TURBOSLIDE_ROOM_HOST: '127.0.0.1:8794',
      TURBOSLIDE_DB_BEARER: BEARER,
      TURBOSLIDE_ROOM_INSECURE: '1',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
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

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4474');
  headers.set('origin', ORIGIN);
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function post(runtime: IdentityRuntime, path: string, body: unknown, cookie?: string) {
  return runtime.auth!.handler(
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(cookie !== undefined ? { cookie } : {}),
    }),
  );
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

async function signIn(runtime: IdentityRuntime, email: string): Promise<string> {
  /* one mail per address at a time: the clock stands still, so two mails would tie on their time */
  fake.sqlite.prepare('delete from ts_quota').run();
  fake.sqlite.prepare('delete from ts_mail where toAddress = ?').run(email);
  const asked = await post(runtime, '/api/auth/sign-in/magic-link', {
    email,
    callbackURL: '/decks',
  });
  expect(asked.status).toBe(200);
  const jar = cookiesOf(asked);
  const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
  const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  const verified = await post(runtime, '/api/auth/sign-in/email-otp', { email, otp: code }, jar);
  expect(verified.status).toBe(200);
  return cookiesOf(verified, jar);
}

describe('Sign out everywhere else reaches every instance within a minute (HR-SA#7)', () => {
  test('both caches keep a session 60 s', () => {
    expect(SESSION_CACHE_S).toBe(60);
    expect(SESSION_FACTS_CACHE_MS).toBe(60_000);
    const a = instance('a');
    expect(a.sessionFacts.ttlMs).toBe(60_000);
    const options = a.auth!.options as { session?: { cookieCache?: { maxAge?: number } } };
    expect(options.session?.cookieCache?.maxAge).toBe(60);
  });

  test('a copied cookie read on another instance is refused 60 s after the sessions end', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-12T09:00:00.000Z') });
    const a = instance('a');
    await a.ready;
    const b = instance('b');
    await b.ready;
    const email = 'sana-sessions@example.test';
    const one = await signIn(a, email);
    const two = await signIn(a, email);
    // the second browser's cookie, read on the other instance: its session and the library's copy
    const read = async (runtime: IdentityRuntime) =>
      (await requestIdentity(request('/decks', { cookie: two }), runtime, { mint: false })).kind;
    const library = async () => {
      const answer = await b.auth!.handler(request('/api/auth/get-session', { cookie: two }));
      return ((await answer.json()) as { session?: unknown } | null)?.session !== undefined;
    };
    expect(await read(b)).toBe('account');
    expect(await library()).toBe(true);
    // every session of the account ends, on the first instance
    expect((await post(a, '/api/auth/revoke-sessions', {}, one)).status).toBe(200);
    expect(fake.sqlite.prepare('select count(*) as n from session').get() as { n: number }).toEqual(
      { n: 0 },
    );
    // 61 s later: the facts cache and the cookie cache have both ended
    vi.setSystemTime(new Date(Date.now() + 61_000));
    // no session and no anonymous cookie in the copied pair: the request is nobody
    expect(await read(b)).toBe('none');
    expect(await library()).toBe(false);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { DeckHead } from '@turboslide/store/templates';

import {
  KEEP_SEPARATE_COOKIE,
  answerMerge,
  bindIdentityHooks,
  buildIdentityRuntime,
  mergeQuestion,
  requestIdentity,
} from './identity.ts';
import type { IdentityRuntime } from './identity.ts';

// HR-SA#2b (docs/hardening/HARDENING.md; AUTH-4): an anonymous id that owns decks joins the
// account it signs into only when the person says Add Them. The deck index is a fake that names
// how many decks each anonymous id owns; the rest is the studio's runtime over SQLite with
// captured mail, signed in through the library's routes.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4853';

let dir = '';
let runtime: IdentityRuntime;
const owned = new Map<string, number>();

function head(id: string): DeckHead {
  const at = new Date(0).toISOString();
  return { id, title: id, slides: 1, sections: 1, revision: 1, updatedAt: at, createdAt: at };
}

function build(hosted: boolean): IdentityRuntime {
  const built = buildIdentityRuntime({
    env: {
      TURBOSLIDE_AUTH_DB: 'state/auth.sqlite',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
    },
    root: dir,
    stateDir: join(dir, 'state'),
    hosted,
    announce: () => undefined,
    log: () => undefined,
  });
  bindIdentityHooks(
    {
      deckIndex: async (principalId, view) =>
        view === 'owned'
          ? Array.from({ length: owned.get(principalId) ?? 0 }, (_, i) => head(`deck-${i}`))
          : [],
    },
    built,
  );
  return built;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-merge-'));
  owned.clear();
  runtime = build(true);
  await runtime.ready;
});

afterEach(async () => {
  await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4853');
  headers.set('origin', ORIGIN);
  if (init.cookie !== undefined && init.cookie !== '') headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

/** The cookie pairs a response set, over the ones the browser held. */
function cookiesOf(setCookies: readonly string[], previous = ''): string {
  const pairs = new Map<string, string>();
  for (const part of previous.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) pairs.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const line of setCookies) {
    const first = line.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq > 0) pairs.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** An anonymous browser: its first request mints the id. */
async function anonymousBrowser(): Promise<{ cookie: string; anonymousId: string }> {
  const first = await requestIdentity(request('/decks'), runtime);
  return {
    cookie: cookiesOf(first.minted?.setCookie === undefined ? [] : [first.minted.setCookie]),
    anonymousId: first.principalId ?? '',
  };
}

/** Signs the browser in through the mail request and its code, carrying the browser's cookies. */
async function signIn(email: string, cookie: string): Promise<{ cookie: string; userId: string }> {
  const asked = await runtime.auth!.handler(
    request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/decks' }),
      cookie,
    }),
  );
  expect(asked.status).toBe(200);
  let jar = cookiesOf(asked.headers.getSetCookie(), cookie);
  const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
  const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  const verified = await runtime.auth!.handler(
    request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, otp: code }),
      cookie: jar,
    }),
  );
  expect(verified.status).toBe(200);
  jar = cookiesOf(verified.headers.getSetCookie(), jar);
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie: jar, userId: body.user.id };
}

describe('the merge asks first', () => {
  test('a browser with no decks joins the account with no question', async () => {
    const browser = await anonymousBrowser();
    const { cookie, userId } = await signIn('maya@example.test', browser.cookie);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(userId);
    expect(await mergeQuestion(runtime, request('/signin', { cookie }))).toBeNull();
  });

  test('a browser with decks is asked, and Add Them joins its decks to the account', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 3);
    const { cookie, userId } = await signIn('maya@example.test', browser.cookie);
    // the session hook linked nothing
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
    // nor does a request of the signed in browser: it acts for its own decks, for itself alone
    const signedIn = await requestIdentity(request('/decks', { cookie }), runtime);
    expect(signedIn.kind).toBe('account');
    expect(signedIn.ctx.principal?.aliases).toContain(browser.anonymousId);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
    expect(await runtime.aliases.aliasesOf(userId)).not.toContain(browser.anonymousId);
    // the account in another browser does not reach them
    const elsewhere = await anonymousBrowser();
    const second = await signIn('maya@example.test', elsewhere.cookie);
    const there = await requestIdentity(request('/decks', { cookie: second.cookie }), runtime);
    expect(there.ctx.principal?.aliases ?? []).not.toContain(browser.anonymousId);
    const question = await mergeQuestion(runtime, request('/signin', { cookie }));
    expect(question).toEqual({
      anonymousId: browser.anonymousId,
      userId,
      email: 'maya@example.test',
      decks: 3,
    });
    expect(await answerMerge(runtime, request('/signin', { cookie }), true)).toEqual({
      linked: true,
    });
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(userId);
    expect(await mergeQuestion(runtime, request('/signin', { cookie }))).toBeNull();
    const after = await requestIdentity(request('/decks', { cookie }), runtime);
    expect(after.ctx.principal?.aliases).toContain(browser.anonymousId);
  });

  test('Keep Them Separate links nothing and the browser is not asked again', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 2);
    const { cookie } = await signIn('maya@example.test', browser.cookie);
    const answer = await answerMerge(runtime, request('/signin', { cookie }), false);
    expect(answer?.linked).toBe(false);
    expect(answer?.setCookie).toMatch(new RegExp(`^${KEEP_SEPARATE_COOKIE}=`));
    expect(answer?.setCookie).toMatch(/HttpOnly/);
    expect(answer?.setCookie).toMatch(/Secure/);
    const kept = cookiesOf([answer?.setCookie ?? ''], cookie);
    expect(await mergeQuestion(runtime, request('/signin', { cookie: kept }))).toBeNull();
    const keptIdentity = await requestIdentity(request('/decks', { cookie: kept }), runtime);
    expect(keptIdentity.ctx.principal?.aliases ?? []).not.toContain(browser.anonymousId);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
    // a second sign in of the same browser is not asked either
    const again = await signIn('maya@example.test', kept);
    expect(await mergeQuestion(runtime, request('/signin', { cookie: again.cookie }))).toBeNull();
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
  });

  test("another browser's answer, or a forged one, does not stand for this browser", async () => {
    const browser = await anonymousBrowser();
    const other = await anonymousBrowser();
    owned.set(browser.anonymousId, 1);
    owned.set(other.anonymousId, 1);
    const { cookie } = await signIn('maya@example.test', browser.cookie);
    const otherSignedIn = await signIn('kai@example.test', other.cookie);
    const otherAnswer = await answerMerge(
      runtime,
      request('/signin', { cookie: otherSignedIn.cookie }),
      false,
    );
    const borrowed = cookiesOf([otherAnswer?.setCookie ?? ''], cookie);
    expect((await mergeQuestion(runtime, request('/signin', { cookie: borrowed })))?.decks).toBe(1);
    const forged = `${cookie}; ${KEEP_SEPARATE_COOKIE}=${encodeURIComponent(`${browser.anonymousId}.${'0'.repeat(32)}`)}`;
    expect((await mergeQuestion(runtime, request('/signin', { cookie: forged })))?.decks).toBe(1);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
  });

  test('nothing to answer without a session or an anonymous id', async () => {
    const browser = await anonymousBrowser();
    expect(await mergeQuestion(runtime, request('/signin', { cookie: browser.cookie }))).toBeNull();
    expect(await answerMerge(runtime, request('/signin'), true)).toBeNull();
  });
});

describe("a checkout's file store", () => {
  test('one person: the browser joins with no question, as before', async () => {
    await runtime.close();
    runtime = build(false);
    await runtime.ready;
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 4);
    const { cookie, userId } = await signIn('maya@example.test', browser.cookie);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(userId);
    expect(await mergeQuestion(runtime, request('/signin', { cookie }))).toBeNull();
  });
});

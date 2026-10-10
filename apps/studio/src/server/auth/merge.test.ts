import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { DeckHead } from '@turboslide/store/templates';

import { registerAccountActions } from './actions.ts';
import type { ActionRequestFacts } from './actions.ts';
import {
  KEEP_SEPARATE_COOKIE,
  answerMerge,
  asksMergeOn,
  bindIdentityHooks,
  buildIdentityRuntime,
  mergeAskLocation,
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

/** The client address the library's mail limit counts by (ten an hour per address). */
let clientAddress = '203.0.113.1';

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4853');
  headers.set('origin', ORIGIN);
  headers.set('x-forwarded-for', clientAddress);
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
    // the browser keeps acting for its own decks, for itself alone (verifier pass 1 F4: it lost
    // them at once, and /decks forgot them from its Recent record)
    const keptIdentity = await requestIdentity(request('/decks', { cookie: kept }), runtime);
    expect(keptIdentity.ctx.principal?.aliases ?? []).toContain(browser.anonymousId);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
    // on another instance too, which reads the answer from the browser's cookie
    const cold = build(true);
    await cold.ready;
    try {
      const there = await requestIdentity(request('/decks', { cookie: kept }), cold);
      expect(there.ctx.principal?.aliases ?? []).toContain(browser.anonymousId);
    } finally {
      await cold.close();
    }
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

/** The account menu's Sign out of this browser: `account.signOut` with the current session. */
async function signOut(cookie: string): Promise<{ signedOut: number; cookie: string }> {
  const dispatcher = createDispatcher();
  const set: string[] = [];
  const current = request('/decks', { cookie });
  const facts: ActionRequestFacts = {
    identity: await requestIdentity(current, runtime),
    request: current,
    setHeader: (name, value) => {
      if (name === 'set-cookie') set.push(...(Array.isArray(value) ? value : [value]));
    },
  };
  registerAccountActions(dispatcher, { runtime, facts: () => Promise.resolve(facts) });
  const author = { kind: 'human' as const, name: 'test' };
  const sessions = (await dispatcher.dispatch('account.sessions', {}, { author })) as {
    sessions: { id: string; current: boolean }[];
  };
  const sessionId = sessions.sessions.find((session) => session.current)?.id;
  const answer = (await dispatcher.dispatch('account.signOut', { sessionId }, { author })) as {
    signedOut: number;
  };
  return { signedOut: answer.signedOut, cookie: cookiesOf(set, cookie) };
}

/** The decks a browser reaches: its own id's and its aliases', as authorize reads them. */
async function reaches(cookie: string): Promise<string[]> {
  const identity = await requestIdentity(request('/decks', { cookie }), runtime);
  const ids = [identity.principalId ?? '', ...(identity.ctx.principal?.aliases ?? [])];
  return ids.filter((id) => (owned.get(id) ?? 0) > 0);
}

describe('the sign out keeps a browser whose decks are its own (verifier pass 1)', () => {
  let person = 10;
  beforeEach(() => {
    person += 1;
    clientAddress = `203.0.113.${person}`;
  });

  test('a question never answered: the editor sign in, then Sign out, keeps the deck', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 1);
    // the editor's own sign in window returns to the deck and never passes /signin
    const { cookie } = await signIn('editor-out@example.test', browser.cookie);
    expect(await reaches(cookie)).toEqual([browser.anonymousId]);
    const out = await signOut(cookie);
    expect(out.signedOut).toBe(1);
    // the browser is anonymous again under the id that owns the deck, not a fresh one
    const after = await requestIdentity(request('/decks', { cookie: out.cookie }), runtime);
    expect(after.kind).toBe('anonymous');
    expect(after.principalId).toBe(browser.anonymousId);
    expect(await reaches(out.cookie)).toEqual([browser.anonymousId]);
    // and the next sign in asks the question, so Add It joins the deck to the account
    const again = await signIn('editor-out@example.test', out.cookie);
    const question = await mergeQuestion(runtime, request('/signin', { cookie: again.cookie }));
    expect(question?.decks).toBe(1);
    expect(await answerMerge(runtime, request('/signin', { cookie: again.cookie }), true)).toEqual({
      linked: true,
    });
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(again.userId);
  });

  test('Keep Them Separate, then Sign out: the browser still reaches its decks', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 2);
    const { cookie } = await signIn('kept-out@example.test', browser.cookie);
    const answer = await answerMerge(runtime, request('/signin', { cookie }), false);
    const kept = cookiesOf([answer?.setCookie ?? ''], cookie);
    expect(await reaches(kept)).toEqual([browser.anonymousId]);
    const out = await signOut(kept);
    expect(out.signedOut).toBe(1);
    const after = await requestIdentity(request('/decks', { cookie: out.cookie }), runtime);
    expect(after.kind).toBe('anonymous');
    expect(after.principalId).toBe(browser.anonymousId);
    expect(await reaches(out.cookie)).toEqual([browser.anonymousId]);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBeNull();
  });

  test('a linked browser leaves as a new anonymous principal, as before', async () => {
    const browser = await anonymousBrowser();
    const { cookie, userId } = await signIn('linked-out@example.test', browser.cookie);
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(userId);
    const out = await signOut(cookie);
    expect(out.signedOut).toBe(1);
    const after = await requestIdentity(request('/decks', { cookie: out.cookie }), runtime);
    expect(after.kind).toBe('anonymous');
    expect(after.principalId).not.toBe(browser.anonymousId);
    expect(await runtime.aliases.accountOf(after.principalId ?? '')).toBeNull();
  });
});

/** A document load of a page in the browser, as Chromium sends it. */
function documentLoad(path: string, cookie: string): Request {
  return request(path, { cookie, headers: { 'sec-fetch-dest': 'document', accept: 'text/html' } });
}

describe('the editor sign in is asked on the next page load (verifier pass 2, regression 1)', () => {
  let person = 40;
  beforeEach(() => {
    person += 1;
    clientAddress = `203.0.113.${person}`;
  });

  test('a document load of a page that lists or opens decks asks while the question is open', () => {
    const asks = (path: string, init: RequestInit = {}) =>
      asksMergeOn(new Request(`${ORIGIN}${path}`, init), path);
    const page = { headers: { 'sec-fetch-dest': 'document' } };
    for (const path of ['/edit/deck-0', '/deck/deck-0', '/decks', '/new', '/present/deck-0'])
      expect(asks(path, page), path).toBe(true);
    // the router's reading of the path: case and the Kelvin sign
    expect(asks('/Edit/deck-0', page)).toBe(true);
    expect(asks('/dec%E2%84%AA/deck-0', page)).toBe(true);
    // not the sign in page itself, the API, a server function, an asset, the link exchange or the embed
    for (const path of [
      '/signin',
      '/api/access/deck-0',
      '/_serverFn/abc',
      '/decks/deck-0/assets/a.png',
      '/s/abcdefghijklmnopqrstuv',
      '/embed/deck-0',
      '/home',
    ])
      expect(asks(path, page), path).toBe(false);
    // only a document load: not a fetch, a picture or a POST
    expect(asks('/edit/deck-0', { headers: { 'sec-fetch-dest': 'empty' } })).toBe(false);
    expect(asks('/edit/deck-0', { headers: { 'sec-fetch-dest': 'image' } })).toBe(false);
    expect(
      asks('/edit/deck-0', { method: 'POST', headers: { 'sec-fetch-dest': 'document' } }),
    ).toBe(false);
    // a client without Sec-Fetch-Dest: the Accept header says a document
    expect(asks('/edit/deck-0', { headers: { accept: 'text/html,*/*' } })).toBe(true);
    expect(asks('/edit/deck-0', { headers: { accept: 'application/json' } })).toBe(false);
  });

  test('the reload after the editor sign in goes to /signin with the deck as next, then back', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 1);
    // the editor's window: the mail and the code, then the reload of the deck, never /signin
    const { cookie, userId } = await signIn('editor-join@example.test', browser.cookie);
    const reload = documentLoad('/edit/deck-0?edit=1', cookie);
    expect(await mergeAskLocation(runtime, reload, '/edit/deck-0')).toBe(
      `/signin?next=${encodeURIComponent('/edit/deck-0?edit=1')}`,
    );
    expect(await mergeAskLocation(runtime, documentLoad('/decks', cookie), '/decks')).toBe(
      '/signin?next=%2Fdecks',
    );
    // the sign in page itself asks; it is never sent to itself
    expect(await mergeAskLocation(runtime, documentLoad('/signin', cookie), '/signin')).toBeNull();
    // Add It: the deck is the account's, and the deck opens with no detour
    expect(await answerMerge(runtime, request('/signin', { cookie }), true)).toEqual({
      linked: true,
    });
    expect(await runtime.aliases.accountOf(browser.anonymousId)).toBe(userId);
    expect(await mergeAskLocation(runtime, reload, '/edit/deck-0')).toBeNull();
    // the account's other browser reaches the deck
    const elsewhere = await anonymousBrowser();
    const second = await signIn('editor-join@example.test', elsewhere.cookie);
    const there = await requestIdentity(request('/decks', { cookie: second.cookie }), runtime);
    expect(there.ctx.principal?.aliases ?? []).toContain(browser.anonymousId);
  });

  test('Keep It Separate ends the detour, on this instance and on another', async () => {
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 1);
    const { cookie } = await signIn('editor-keep@example.test', browser.cookie);
    expect(
      await mergeAskLocation(runtime, documentLoad('/edit/deck-0', cookie), '/edit/deck-0'),
    ).not.toBeNull();
    const answer = await answerMerge(runtime, request('/signin', { cookie }), false);
    const kept = cookiesOf([answer?.setCookie ?? ''], cookie);
    expect(
      await mergeAskLocation(runtime, documentLoad('/edit/deck-0', kept), '/edit/deck-0'),
    ).toBeNull();
    const cold = build(true);
    await cold.ready;
    try {
      expect(
        await mergeAskLocation(cold, documentLoad('/edit/deck-0', kept), '/edit/deck-0'),
      ).toBeNull();
    } finally {
      await cold.close();
    }
  });

  test('no detour for a browser without decks, an anonymous visitor or a fetch', async () => {
    const empty = await anonymousBrowser();
    const signedIn = await signIn('editor-empty@example.test', empty.cookie);
    expect(
      await mergeAskLocation(
        runtime,
        documentLoad('/edit/deck-0', signedIn.cookie),
        '/edit/deck-0',
      ),
    ).toBeNull();
    const visitor = await anonymousBrowser();
    owned.set(visitor.anonymousId, 1);
    expect(
      await mergeAskLocation(runtime, documentLoad('/edit/deck-0', visitor.cookie), '/edit/deck-0'),
    ).toBeNull();
    const browser = await anonymousBrowser();
    owned.set(browser.anonymousId, 1);
    const { cookie } = await signIn('editor-fetch@example.test', browser.cookie);
    const fetchLoad = request('/edit/deck-0', { cookie, headers: { 'sec-fetch-dest': 'empty' } });
    expect(await mergeAskLocation(runtime, fetchLoad, '/edit/deck-0')).toBeNull();
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

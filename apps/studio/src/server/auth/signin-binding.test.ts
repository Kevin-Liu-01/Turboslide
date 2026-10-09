import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { magicLink } from 'better-auth/plugins/magic-link';

import { memoryAuthDb } from './db.ts';
import type { AuthDb } from './db.ts';
import {
  BINDINGS_PER_BROWSER,
  BINDING_COOKIE,
  OTHER_BROWSER,
  PAIR_ALPHABET,
  WRONG_PAIR_CODE,
  browserAsked,
  bindingCookieName,
  cleanPairCode,
  confirmAddress,
  notePairCode,
  pairCodeFor,
  signInBinding,
  storedTokenOf,
  withBinding,
} from './signin-binding.ts';

// HR-SA#2a (docs/hardening/HARDENING.md; AUTH-4): the mail's link and code sign in only the
// browser that asked. Browser two is a request without browser one's cookies. The plugin runs
// in a library instance of its own here, with the two mail plugins as better-auth.ts configures
// them; signin-binding-runtime.test.ts reads the same rules through the studio's runtime.

const SECRET = 'an-obviously-fake-better-auth-secret-for-tests-0123';
const ORIGIN = 'http://localhost:4853';
const NOW = 1_800_000_000_000;

describe('the cookie and the code', () => {
  test('a binding covers its own address until it expires, and no other', () => {
    const value = withBinding(SECRET, undefined, 'maya@example.test', 300, NOW);
    expect(browserAsked(SECRET, value, 'maya@example.test', NOW + 1000)).toBe(true);
    expect(browserAsked(SECRET, value, 'MAYA@example.test'.toLowerCase(), NOW)).toBe(true);
    expect(browserAsked(SECRET, value, 'kai@example.test', NOW)).toBe(false);
    expect(browserAsked(SECRET, value, 'maya@example.test', NOW + 301_000)).toBe(false);
    expect(
      browserAsked(
        'another-secret-of-the-same-length-for-tests-0123',
        value,
        'maya@example.test',
        NOW,
      ),
    ).toBe(false);
    expect(browserAsked(SECRET, undefined, 'maya@example.test', NOW)).toBe(false);
    expect(browserAsked(SECRET, 'garbage', 'maya@example.test', NOW)).toBe(false);
    // a forged entry with a far expiry and a MAC of other bytes
    expect(browserAsked(SECRET, `zzzzzzzz.${'é'.repeat(22)}`, 'maya@example.test', NOW)).toBe(
      false,
    );
  });

  test('a browser waits on three addresses at most, newest first, and drops expired ones', () => {
    let value: string | undefined;
    const addresses = ['a@example.test', 'b@example.test', 'c@example.test', 'd@example.test'];
    addresses.forEach((address, i) => {
      value = withBinding(SECRET, value, address, 300, NOW + i * 1000);
    });
    expect(value?.split('~')).toHaveLength(BINDINGS_PER_BROWSER);
    expect(browserAsked(SECRET, value, 'a@example.test', NOW + 4000)).toBe(false);
    expect(browserAsked(SECRET, value, 'd@example.test', NOW + 4000)).toBe(true);
    const later = withBinding(SECRET, value, 'e@example.test', 300, NOW + 400_000);
    expect(later.split('~')).toHaveLength(1);
  });

  test('the code is eight characters of the alphabet, fixed per token, typed in any case', () => {
    const code = pairCodeFor(SECRET, 'token-one');
    expect(code).toHaveLength(8);
    for (const char of code) expect(PAIR_ALPHABET).toContain(char);
    expect(pairCodeFor(SECRET, 'token-one')).toBe(code);
    expect(pairCodeFor(SECRET, 'token-two')).not.toBe(code);
    expect(cleanPairCode(` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} `)).toBe(code);
  });

  test('the cookie is __Host- on a hosted deployment', () => {
    expect(bindingCookieName(true)).toBe(`__Host-${BINDING_COOKIE}`);
    expect(bindingCookieName(false)).toBe(BINDING_COOKIE);
  });

  test('a link from another browser lands on /signin with its token and a same origin return', () => {
    const at = new URL(
      confirmAddress(ORIGIN, '/signin', 'abc', encodeURIComponent(`${ORIGIN}/edit/q4?x=1`)),
    );
    expect(at.pathname).toBe('/signin');
    expect(at.searchParams.get('confirm')).toBe('abc');
    expect(at.searchParams.get('next')).toBe('/edit/q4?x=1');
    const away = new URL(confirmAddress(ORIGIN, '/signin', 'abc', 'https://elsewhere.test/x'));
    expect(away.searchParams.get('next')).toBeNull();
  });
});

type Browser = { cookies: Map<string, string> };

let db: AuthDb;
let links: Map<string, string>;
let otps: Map<string, string>;
let auth: ReturnType<typeof buildAuth>;

function buildAuth() {
  return betterAuth({
    appName: 'Turboslide test',
    baseURL: ORIGIN,
    basePath: '/api/auth',
    secret: SECRET,
    database: { db: db.db, type: 'sqlite' },
    trustedOrigins: [ORIGIN],
    rateLimit: { enabled: false },
    advanced: { cookiePrefix: 'ts', database: { validateSchema: false } },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url, token }, ctx) => {
          notePairCode(ctx, token);
          links.set(email, url);
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp }) => {
          otps.set(email, otp);
        },
      }),
      signInBinding({ hosted: false, ttlS: 300, signInPage: '/signin' }),
    ],
  });
}

function browser(): Browser {
  return { cookies: new Map() };
}

async function call(
  who: Browser,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers = new Headers({ origin: ORIGIN });
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const cookie = [...who.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie !== '') headers.set('cookie', cookie);
  const url = path.startsWith('http') ? path : `${ORIGIN}${path}`;
  const response = await auth.handler(
    new Request(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq > 0) who.cookies.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return response;
}

async function ask(who: Browser, email: string): Promise<{ pair: string; link: string }> {
  const asked = await call(who, '/api/auth/sign-in/magic-link', {
    body: {
      email,
      callbackURL: `${ORIGIN}/decks`,
      errorCallbackURL: `${ORIGIN}/signin?next=%2Fdecks`,
    },
  });
  expect(asked.status).toBe(200);
  const body = (await asked.json()) as { status: boolean; pair?: string };
  expect(body.status).toBe(true);
  return { pair: body.pair ?? '', link: links.get(email) ?? '' };
}

/** The code alone, as the OTP plugin's own request asks for it (better-auth.ts puts it in the link's mail). */
async function askCode(who: Browser, email: string): Promise<string> {
  const asked = await call(who, '/api/auth/email-otp/send-verification-otp', {
    body: { email, type: 'sign-in' },
  });
  expect(asked.status).toBe(200);
  return otps.get(email) ?? '';
}

async function verificationRows(): Promise<number> {
  const rows = await db.db
    .selectFrom('verification' as never)
    .selectAll()
    .execute();
  return rows.length;
}

const sessionCookie = (who: Browser) => who.cookies.get('ts.session_token');

beforeEach(async () => {
  db = await memoryAuthDb();
  links = new Map();
  otps = new Map();
  auth = buildAuth();
  await (await getMigrations(auth.options)).runMigrations();
});

afterEach(async () => {
  await db.close();
});

describe('the browser that asked', () => {
  test('asks for the mail: the cookie is set and the page is answered the code', async () => {
    const one = browser();
    const asked = await call(one, '/api/auth/sign-in/magic-link', {
      body: { email: 'maya@example.test', callbackURL: `${ORIGIN}/decks` },
    });
    expect(asked.status).toBe(200);
    const body = (await asked.json()) as { status: boolean; pair: string };
    expect(body.pair).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const line = asked.headers.getSetCookie().find((l) => l.startsWith(`${BINDING_COOKIE}=`)) ?? '';
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Max-Age=300/i);
    expect(line).toMatch(/Path=\//i);
    const token = new URL(links.get('maya@example.test') ?? '').searchParams.get('token') ?? '';
    expect(body.pair).toBe(pairCodeFor(SECRET, token));
  });

  test('opens its own link and signs in', async () => {
    const one = browser();
    const { link } = await ask(one, 'maya@example.test');
    const opened = await call(one, link);
    expect(opened.status).toBe(302);
    expect(opened.headers.get('location')).toBe(`${ORIGIN}/decks`);
    expect(sessionCookie(one)).toBeDefined();
  });

  test('types its own code and signs in', async () => {
    const one = browser();
    const otp = await askCode(one, 'maya@example.test');
    expect(one.cookies.has(BINDING_COOKIE)).toBe(true);
    const verified = await call(one, '/api/auth/sign-in/email-otp', {
      body: { email: 'maya@example.test', otp },
    });
    expect(verified.status).toBe(200);
    expect(sessionCookie(one)).toBeDefined();
  });
});

describe('another browser', () => {
  test('opening the link lands on /signin, signs nothing in and leaves the link usable', async () => {
    const one = browser();
    const two = browser();
    const { link } = await ask(one, 'maya@example.test');
    const token = new URL(link).searchParams.get('token') ?? '';
    const rows = await verificationRows();
    const opened = await call(two, link);
    expect(opened.status).toBe(302);
    const at = new URL(opened.headers.get('location') ?? '');
    expect(at.pathname).toBe('/signin');
    expect(at.searchParams.get('confirm')).toBe(token);
    expect(at.searchParams.get('next')).toBe('/decks');
    expect(sessionCookie(two)).toBeUndefined();
    expect(await verificationRows()).toBe(rows);
    // the browser that asked can still use it
    expect((await call(one, link)).status).toBe(302);
    expect(sessionCookie(one)).toBeDefined();
  });

  test('the link without a return address is refused with the code OTHER_BROWSER', async () => {
    const one = browser();
    const two = browser();
    const { link } = await ask(one, 'maya@example.test');
    const bare = new URL(link);
    bare.searchParams.delete('callbackURL');
    const opened = await call(two, bare.toString());
    expect(opened.status).toBe(403);
    expect(((await opened.json()) as { code: string }).code).toBe(OTHER_BROWSER);
    expect(sessionCookie(two)).toBeUndefined();
  });

  test('the mail code is refused with OTHER_BROWSER', async () => {
    const one = browser();
    const two = browser();
    const otp = await askCode(one, 'maya@example.test');
    const typed = await call(two, '/api/auth/sign-in/email-otp', {
      body: { email: 'maya@example.test', otp },
    });
    expect(typed.status).toBe(403);
    expect(((await typed.json()) as { code: string }).code).toBe(OTHER_BROWSER);
    expect(sessionCookie(two)).toBeUndefined();
    // the code was not spent by the refusal: the browser that asked still signs in with it
    const own = await call(one, '/api/auth/sign-in/email-otp', {
      body: { email: 'maya@example.test', otp },
    });
    expect(own.status).toBe(200);
  });

  test('a browser that asked for another address is another browser', async () => {
    const one = browser();
    const two = browser();
    const { link } = await ask(one, 'maya@example.test');
    await ask(two, 'kai@example.test');
    const opened = await call(two, link);
    expect(new URL(opened.headers.get('location') ?? '').pathname).toBe('/signin');
    expect(sessionCookie(two)).toBeUndefined();
  });

  test('the code shown in the browser that asked lets this browser open the link', async () => {
    const one = browser();
    const two = browser();
    const { pair, link } = await ask(one, 'maya@example.test');
    const token = new URL(link).searchParams.get('token') ?? '';
    const wrongCode = pair === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA';
    const wrong = await call(two, '/api/auth/sign-in/pair', { body: { token, code: wrongCode } });
    expect(wrong.status).toBe(403);
    expect(((await wrong.json()) as { code: string }).code).toBe(WRONG_PAIR_CODE);
    expect(two.cookies.has(BINDING_COOKIE)).toBe(false);
    const forged = await call(two, '/api/auth/sign-in/pair', {
      body: { token: 'not-a-token', code: pair },
    });
    expect(forged.status).toBe(400);
    const right = await call(two, '/api/auth/sign-in/pair', {
      body: { token, code: `${pair.slice(0, 4).toLowerCase()} ${pair.slice(4)}` },
    });
    expect(right.status).toBe(200);
    expect(two.cookies.has(BINDING_COOKIE)).toBe(true);
    const opened = await call(two, link);
    expect(opened.headers.get('location')).toBe(`${ORIGIN}/decks`);
    expect(sessionCookie(two)).toBeDefined();
  });

  test('a used link answers the library sentence, not the code page', async () => {
    const one = browser();
    const two = browser();
    const { link } = await ask(one, 'maya@example.test');
    await call(one, link);
    const again = await call(two, link);
    const at = new URL(again.headers.get('location') ?? '');
    expect(at.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(at.searchParams.get('confirm')).toBeNull();
  });

  test('the stored key of a token is the library hash', () => {
    // sha256 in base64url without padding, as better-auth's magic link defaultKeyHasher
    expect(storedTokenOf('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});

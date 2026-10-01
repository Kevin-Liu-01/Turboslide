import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  AUTH_HOSTS_VARIABLE,
  DEFAULT_AUTH_HOSTS,
  GOOGLE_ID_VARIABLE,
  GOOGLE_SECRET_VARIABLE,
  PASSKEYS_LATER,
  authHosts,
  signInMethods,
} from './better-auth.ts';
import { buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { ANON_COOKIE, ANON_COOKIE_INSECURE, serializeAnonymousCookie } from './session.ts';

// The Google sign in of the realtime round (docs/REALTIME.md 4.1 to 4.4; design-google-login.md
// 6.1): the six unit rows, none of which touches the network. The library builds the Google
// authorization URL locally (@better-auth/core google.mjs createAuthorizationURL), so the
// sign-in/social answer is read from a handler call with fake variables; the round trip itself
// (the code exchange at Google's token endpoint) is the hand row `accounts.google-roundtrip`.
// The two values below are test values for a local process and never a client Google knows.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const GOOGLE_ENV = {
  [GOOGLE_ID_VARIABLE]: 'fake-client-id.apps.googleusercontent.com',
  [GOOGLE_SECRET_VARIABLE]: 'fake-secret-for-local-tests',
};
const ORIGIN = 'http://localhost:4474';

let dir = '';
const runtimes: IdentityRuntime[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-better-auth-'));
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A runtime over a SQLite file under the test folder, with captured mail and the fake Google pair unless `env` says otherwise. */
async function runtimeWith(
  env: Record<string, string | undefined>,
  name = 'a',
): Promise<IdentityRuntime> {
  const runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_AUTH_DB: `state-${name}/auth.sqlite`,
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
      ...GOOGLE_ENV,
      ...env,
    },
    root: dir,
    stateDir: join(dir, `state-${name}`),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  runtimes.push(runtime);
  await runtime.ready;
  return runtime;
}

/** A request on `origin` with the Host and Origin headers the library and the CSRF filter read. */
function request(
  origin: string,
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set('host', new URL(origin).host);
  headers.set('origin', origin);
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${origin}${path}`, { ...init, headers });
}

/** POST /api/auth/sign-in/social for Google with a callback on the deck; the response, never thrown. */
async function startGoogle(runtime: IdentityRuntime, origin: string): Promise<Response> {
  return runtime
    .auth!.handler(
      request(origin, '/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: `${origin}/edit/x` }),
      }),
    )
    .catch(
      (error: unknown) =>
        new Response(error instanceof Error ? error.message : 'error', { status: 500 }),
    );
}

describe('signInMethods (REALTIME.md 4.1)', () => {
  test('google needs both variables and a database; email needs a mail sender', () => {
    expect(signInMethods(GOOGLE_ENV, true, 'capture')).toEqual({
      available: true,
      email: true,
      passkeys: false,
      passkeysNotice: PASSKEYS_LATER,
      github: false,
      google: true,
    });
    expect(signInMethods({ [GOOGLE_ID_VARIABLE]: 'id-alone' }, true, 'capture').google).toBe(false);
    expect(
      signInMethods({ [GOOGLE_SECRET_VARIABLE]: 'secret-alone' }, true, 'capture').google,
    ).toBe(false);
    expect(signInMethods({ ...GOOGLE_ENV, [GOOGLE_ID_VARIABLE]: '' }, true, 'resend').google).toBe(
      false,
    );
    // the production default (7.7): a database, TURBOSLIDE_MAIL=off, the Google pair
    expect(signInMethods(GOOGLE_ENV, true, 'off')).toEqual({
      available: true,
      email: false,
      passkeys: false,
      passkeysNotice: PASSKEYS_LATER,
      github: false,
      google: true,
    });
    // no database: nothing, whatever the variables say (the anonymous path is unchanged)
    expect(signInMethods(GOOGLE_ENV, false, 'capture')).toEqual({
      available: false,
      email: false,
      passkeys: false,
      passkeysNotice: null,
      github: false,
      google: false,
    });
  });

  test('authHosts reads TURBOSLIDE_AUTH_HOSTS as a comma separated list and defaults to the deployment’s own hosts', () => {
    expect(authHosts({})).toEqual([...DEFAULT_AUTH_HOSTS]);
    expect(authHosts({ [AUTH_HOSTS_VARIABLE]: '' })).toEqual([...DEFAULT_AUTH_HOSTS]);
    expect(authHosts({ [AUTH_HOSTS_VARIABLE]: ' preview.example , *.vercel.app,, ' })).toEqual([
      'preview.example',
      '*.vercel.app',
    ]);
  });
});

describe('createAuth with the Google pair (REALTIME.md 4.1)', () => {
  test('the provider is configured with the account chooser alone: prompt select_account, no accessType', async () => {
    const runtime = await runtimeWith({});
    const providers = (
      runtime.auth!.options as {
        socialProviders?: Record<
          string,
          { clientId?: string; prompt?: string; accessType?: string }
        >;
      }
    ).socialProviders;
    expect(providers?.google).toBeDefined();
    expect(providers?.google?.prompt).toBe('select_account');
    expect(providers?.google?.accessType).toBeUndefined();
    expect(providers?.github).toBeUndefined();
    expect(runtime.methods.google).toBe(true);
    expect(runtime.methods.email).toBe(true);
  });

  test('without the pair the provider is absent and the methods say so', async () => {
    const runtime = await runtimeWith({
      [GOOGLE_ID_VARIABLE]: undefined,
      [GOOGLE_SECRET_VARIABLE]: undefined,
    });
    const providers = (runtime.auth!.options as { socialProviders?: Record<string, unknown> })
      .socialProviders;
    expect(providers?.google).toBeUndefined();
    expect(runtime.methods.google).toBe(false);
  });

  test('TURBOSLIDE_MAIL=off hides the email method and keeps Google (default 7.7)', async () => {
    const runtime = await runtimeWith({ TURBOSLIDE_MAIL: 'off' });
    expect(runtime.mailMode).toBe('off');
    expect(runtime.methods.email).toBe(false);
    expect(runtime.methods.google).toBe(true);
    expect(runtime.methods.available).toBe(true);
  });
});

describe('the sign-in/social answer, built locally (design-google-login.md 6.1 row 3)', () => {
  test('carries the Google URL with redirect_uri on the request’s origin, the three scopes, prompt, code_challenge and no access_type', async () => {
    const runtime = await runtimeWith({});
    const response = await startGoogle(runtime, ORIGIN);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url?: string; redirect?: boolean };
    expect(typeof body.url).toBe('string');
    const url = new URL(body.url ?? '');
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(url.searchParams.get('client_id')).toBe(GOOGLE_ENV[GOOGLE_ID_VARIABLE]);
    const scope = (url.searchParams.get('scope') ?? '').split(/[\s+]+/);
    expect(scope).toEqual(expect.arrayContaining(['openid', 'email', 'profile']));
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(url.searchParams.has('access_type')).toBe(false);
    // the mailer saw nothing: a social sign in sends no mail
    expect(await runtime.mailer.list()).toEqual([]);
  });

  test('a Host off allowedHosts is refused with no fallback; TURBOSLIDE_AUTH_HOSTS naming it answers the URL on that host', async () => {
    const refused = await runtimeWith({}, 'refused');
    const foreign = 'http://evil.example';
    const response = await startGoogle(refused, foreign);
    expect(response.status).toBeGreaterThanOrEqual(400);
    const text = await response.text();
    expect(text).not.toContain('accounts.google.com');
    const allowed = await runtimeWith({ [AUTH_HOSTS_VARIABLE]: 'evil.example' }, 'allowed');
    const answered = await startGoogle(allowed, foreign);
    expect(answered.status).toBe(200);
    const body = (await answered.json()) as { url?: string };
    expect(new URL(body.url ?? '').searchParams.get('redirect_uri')).toBe(
      `${foreign}/api/auth/callback/google`,
    );
    // the variable replaces the default list: localhost is off it on that runtime and answers on
    // the runtime without the variable
    expect((await startGoogle(allowed, 'http://127.0.0.1:4484')).status).toBeGreaterThanOrEqual(
      400,
    );
    expect((await startGoogle(refused, 'http://127.0.0.1:4484')).status).toBe(200);
  });
});

describe('the account linking rule (REALTIME.md 4.2)', () => {
  test('the identity cookie is SameSite=Lax, so the top level callback GET from Google carries the anonymous id', () => {
    const secure = serializeAnonymousCookie(ANON_COOKIE, 'v1.sealed');
    expect(secure).toContain('SameSite=Lax');
    expect(secure).not.toContain('SameSite=Strict');
    expect(secure).toContain('Secure');
    expect(secure).toContain('HttpOnly');
    const insecure = serializeAnonymousCookie(ANON_COOKIE_INSECURE, 'v1.sealed');
    expect(insecure).toContain('SameSite=Lax');
    expect(insecure).not.toContain('Secure');
  });

  test('the session create hook links the anonymous cookie’s principal whatever method created the session', async () => {
    const runtime = await runtimeWith({});
    // the browser's anonymous principal with a typed name
    const first = await requestIdentity(request(ORIGIN, '/edit/q4'), runtime);
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const anonId = first.principalId ?? '';
    expect(anonId).toMatch(/^anon_/);
    await runtime.principals.put({ ...(await runtime.principals.get(anonId))!, name: 'Maya' });
    // a user row the way the Google callback would create it (name from the id token)
    const stamp = new Date().toISOString();
    await runtime
      .db!.db.insertInto('user')
      .values({
        id: 'google01',
        name: 'Maya Chen',
        email: 'maya@example.test',
        emailVerified: 1,
        image: null,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .execute();
    // the hook, called as the library calls it after any session insert, with the callback request
    const hooks = (
      runtime.auth!.options as {
        databaseHooks?: {
          session?: {
            create?: {
              after?: (
                session: { id: string; userId: string; token: string },
                ctx?: { request?: Request },
              ) => Promise<void>;
            };
          };
        };
      }
    ).databaseHooks;
    expect(typeof hooks?.session?.create?.after).toBe('function');
    const callback = request(ORIGIN, '/api/auth/callback/google?code=c&state=s', {
      cookie: anonCookie,
    });
    await hooks!.session!.create!.after!(
      { id: 'sess01', userId: 'google01', token: 'tok01' },
      { request: callback },
    );
    expect(await runtime.aliases.accountOf(anonId)).toBe('google01');
    expect(await runtime.aliases.aliasesOf('google01')).toEqual([anonId]);
    // the merged record keeps the typed name; Google's name wins at render through the user row (default 7.8)
    expect((await runtime.principals.get('usr_google01'))?.name).toBe('Maya');
    // a second call with no request links nothing more and throws nothing
    await hooks!.session!.create!.after!({ id: 'sess02', userId: 'google01', token: 'tok02' }, {});
    expect(await runtime.aliases.aliasesOf('google01')).toEqual([anonId]);
  });
});

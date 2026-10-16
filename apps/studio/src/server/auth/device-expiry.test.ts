import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { agentAuthWith } from '../auth.ts';
import { DEVICE_CLIENT_ID, DEVICE_EXPIRES } from './better-auth.ts';
import {
  DEVICE_CODE_LIFETIME_MS,
  DEVICE_KEY_LEGACY_EXPIRY,
  DEVICE_KEY_LIFETIME_MS,
  DEVICE_KEY_NAME,
  deviceRequestOf,
  keyForDeviceGrant,
} from './device-grant.ts';
import { buildIdentityRuntime } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { keyExpiry, memoryApiKeyStore, resolveBearerSync } from './tokens.ts';

// HR-SA#5 (AUTH-7, CRIT-M14): a device key lives 90 days; a device key minted before the rule
// (no expiry) stops on 2027-01-06, read at every use; a key past its expiry answers 401 with the
// code key_expired; /device reads what the code asks for. And, from rust.md section 6, the two
// classes of better-auth advisory in features Turboslide uses, pinned in its own suite: the device
// flow's owner binding and Google's account linking. Every value here is a test value.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4474';
const GOOGLE_ID = 'fake-client-id.apps.googleusercontent.com';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

describe('device keys expire (HR-SA#5)', () => {
  test('a new device key expires 90 days after it is made, and the grant says when', async () => {
    const now = new Date('2026-10-12T08:00:00.000Z');
    const keys = memoryApiKeyStore(() => now);
    const answer = await keyForDeviceGrant(
      Response.json({ access_token: 'session-token', scope: 'read write' }),
      {
        keys,
        findSession: () => Promise.resolve({ userId: 'user-1' }),
        deleteSession: () => Promise.resolve(),
        now: () => now,
      },
    );
    const body = (await answer.json()) as { access_token: string; expires_at: string };
    const expected = new Date(now.getTime() + DEVICE_KEY_LIFETIME_MS).toISOString();
    expect(body.expires_at).toBe(expected);
    expect(expected).toBe('2027-01-10T08:00:00.000Z');
    expect(keys.resolveSync(body.access_token)?.expiresAt).toBe(expected);
  });

  test('a device key made with no expiry works until 2027-01-06 and then answers key_expired', async () => {
    let now = new Date('2027-01-05T23:59:00.000Z');
    const keys = memoryApiKeyStore(() => now);
    const legacy = await keys.create({ userId: 'user-1', name: DEVICE_KEY_NAME, scopes: ['read'] });
    const profile = await keys.create({ userId: 'user-1', name: 'ci', scopes: ['read'] });
    expect(legacy.record.expiresAt).toBeNull();
    expect(keyExpiry(legacy.record)).toBe(DEVICE_KEY_LEGACY_EXPIRY);
    expect(keyExpiry(profile.record)).toBeNull();
    const read = (secret: string) => resolveBearerSync(secret, { env: {}, keys, now });
    expect(read(legacy.secret).kind).toBe('api-key');
    now = new Date(DEVICE_KEY_LEGACY_EXPIRY);
    expect(read(legacy.secret)).toEqual({ kind: 'refused', reason: 'key_expired' });
    expect(keys.resolveSync(legacy.secret)).toBeNull();
    // a key made in Profile with no expiry is not a device key and keeps working
    expect(read(profile.secret).kind).toBe('api-key');
    // the agent surface answers 401 with the code the CLI reads, at the clock's own time
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(DEVICE_KEY_LEGACY_EXPIRY) });
    try {
      const refused = agentAuthWith(
        new Request('https://studio.test/api/actions/account.me', {
          method: 'POST',
          headers: { authorization: `Bearer ${legacy.secret}` },
        }),
        { env: {}, keys, checkoutToken: null, hosted: true },
      );
      expect(refused).toMatchObject({ ok: false, status: 401, code: 'key_expired' });
    } finally {
      vi.useRealTimers();
    }
    // a revoked key reads as unknown, never as expired
    await keys.revoke(profile.record.id);
    expect(read(profile.secret)).toEqual({ kind: 'refused', reason: 'unknown_key' });
  });

  test('what /device shows for a code: its scopes and when it was made, for the person alone', () => {
    const now = new Date('2026-10-12T22:50:00.000Z');
    const row = {
      scope: 'read comment write export share admin',
      expiresAt: new Date(Date.parse('2026-10-12T22:41:00.000Z') + DEVICE_CODE_LIFETIME_MS),
      status: 'pending',
      userId: null,
    };
    expect(DEVICE_EXPIRES).toBe('30m');
    expect(deviceRequestOf(row, 'user-1', now)).toEqual({
      scopes: ['read', 'comment', 'write', 'export', 'share'],
      madeAt: '22:41 UTC',
    });
    expect(deviceRequestOf({ ...row, userId: 'user-1' }, 'user-1', now)).not.toBeNull();
    expect(deviceRequestOf({ ...row, userId: 'user-2' }, 'user-1', now)).toBeNull();
    expect(deviceRequestOf({ ...row, status: 'approved' }, 'user-1', now)).toBeNull();
    expect(deviceRequestOf(row, 'user-1', new Date('2026-10-12T23:12:00.000Z'))).toBeNull();
    expect(deviceRequestOf(null, 'user-1', now)).toBeNull();
  });
});

describe('the library flows Turboslide relies on (rust.md section 6)', () => {
  let dir = '';
  let runtime: IdentityRuntime;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'turboslide-device-expiry-'));
    runtime = buildIdentityRuntime({
      env: {
        TURBOSLIDE_AUTH_DB: join(dir, 'auth.sqlite'),
        TURBOSLIDE_MAIL: 'capture',
        TURBOSLIDE_SESSION_SECRET: SECRET,
        TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
        GOOGLE_CLIENT_ID: GOOGLE_ID,
        GOOGLE_CLIENT_SECRET: 'fake-secret-for-local-tests',
      },
      root: dir,
      stateDir: join(dir, 'state'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
    });
    await runtime.ready;
  });

  afterAll(async () => {
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
    const headers = new Headers(init.headers);
    headers.set('host', 'localhost:4474');
    headers.set('origin', ORIGIN);
    if (init.cookie !== undefined) headers.set('cookie', init.cookie);
    return new Request(`${ORIGIN}${path}`, { ...init, headers });
  }

  function post(path: string, body: unknown, cookie?: string): Promise<Response> {
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

  async function signIn(email: string): Promise<string> {
    const asked = await post('/api/auth/sign-in/magic-link', { email, callbackURL: '/decks' });
    expect(asked.status).toBe(200);
    const jar = cookiesOf(asked);
    const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
    const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
    const verified = await post('/api/auth/sign-in/email-otp', { email, otp: code }, jar);
    expect(verified.status).toBe(200);
    return cookiesOf(verified, jar);
  }

  function userIdOf(email: string): string {
    const row = runtime.db!.sqlite!.prepare('select id from user where email = ?').get(email) as
      { id: string } | undefined;
    return row?.id ?? '';
  }

  test('a code claimed by one account cannot be approved by another; the key is the claimer’s', async () => {
    const ada = await signIn('ada-device@example.test');
    const ben = await signIn('ben-device@example.test');
    const asked = await post('/api/auth/device/code', {
      client_id: DEVICE_CLIENT_ID,
      scope: 'read write',
    });
    const code = (await asked.json()) as { device_code: string; user_code: string };
    const claimed = await runtime.auth!.handler(
      request(`/api/auth/device?user_code=${code.user_code}`, { cookie: ada }),
    );
    expect(claimed.status).toBe(200);
    expect(((await claimed.json()) as { scope?: string }).scope).toBe('read write');
    // the other account reads no scope and cannot decide the code
    const peek = await runtime.auth!.handler(
      request(`/api/auth/device?user_code=${code.user_code}`, { cookie: ben }),
    );
    expect(((await peek.json()) as { scope?: string }).scope).toBeUndefined();
    const stolen = await post('/api/auth/device/approve', { userCode: code.user_code }, ben);
    expect(stolen.status).toBeGreaterThanOrEqual(400);
    expect((await post('/api/auth/device/approve', { userCode: code.user_code }, ada)).status).toBe(
      200,
    );
    runtime.db!.sqlite!.prepare('update deviceCode set lastPolledAt = null').run();
    const polled = await post('/api/auth/device/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: code.device_code,
      client_id: DEVICE_CLIENT_ID,
    });
    expect(polled.status).toBe(200);
    const context = await runtime.auth!.$context;
    const key = await keyForDeviceGrant(polled, {
      keys: runtime.keys,
      findSession: async (token) => {
        const found = await context.internalAdapter.findSession(token);
        return found === null ? null : { userId: found.session.userId };
      },
      deleteSession: (token) => context.internalAdapter.deleteSession(token),
    });
    const { access_token } = (await key.json()) as { access_token: string };
    const record = runtime.keys.resolveSync(access_token);
    expect(record?.userId).toBe(userIdOf('ada-device@example.test'));
    expect(record?.expiresAt).not.toBeNull();
  });

  async function google(claims: Record<string, unknown>): Promise<Response> {
    const started = await post('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: `${ORIGIN}/decks`,
    });
    const { url } = (await started.json()) as { url: string };
    const state = new URL(url).searchParams.get('state') ?? '';
    const part = (value: unknown): string =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const idToken = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
      iss: 'https://accounts.google.com',
      aud: GOOGLE_ID,
      iat: now,
      exp: now + 3600,
      ...claims,
    })}.c2lnbmF0dXJl`;
    const exchange = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!target.startsWith(TOKEN_ENDPOINT)) throw new Error(`unexpected fetch ${target}`);
      return Response.json({
        access_token: 'ya29.test-access',
        expires_in: 3599,
        token_type: 'Bearer',
        id_token: idToken,
      });
    });
    try {
      return await runtime.auth!.handler(
        request(`/api/auth/callback/google?state=${encodeURIComponent(state)}&code=test-code`, {
          cookie: cookiesOf(started),
        }),
      );
    } finally {
      exchange.mockRestore();
    }
  }

  test('Google joins an address account only when Google says it verified the address', async () => {
    const email = 'cleo-link@example.test';
    await signIn(email);
    const userId = userIdOf(email);
    const googleRows = () =>
      Number(
        (
          runtime
            .db!.sqlite!.prepare(
              "select count(*) as n from account where userId = ? and providerId = 'google'",
            )
            .get(userId) as { n: number }
        ).n,
      );
    const unverified = await google({ sub: 'google-sub-cleo-x', email, email_verified: false });
    expect(unverified.status).toBe(302);
    expect(unverified.headers.get('location') ?? '').toContain('error');
    expect(cookiesOf(unverified)).not.toContain('ts.session_token=');
    expect(googleRows()).toBe(0);
    const verified = await google({ sub: 'google-sub-cleo', email, email_verified: true });
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location') ?? '').not.toContain('error');
    expect(googleRows()).toBe(1);
    expect(
      runtime.db!.sqlite!.prepare('select count(*) as n from user where email = ?').get(email),
    ).toEqual({ n: 1 });
  });
});

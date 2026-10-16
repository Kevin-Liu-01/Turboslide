import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { magicLink } from 'better-auth/plugins/magic-link';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { mailPaths } from './better-auth.ts';
import { buildIdentityRuntime } from './identity.ts';
import type { IdentityRuntime } from './identity.ts';

// HR-SA#4 (AUTH-8, second half): with TURBOSLIDE_MAIL=off no mail leaves, and the mail sign in
// routes wrote a verification row and a quota row for every request all the same. Now they answer
// 404 before the library's limiter or any row. Every value here is a test value.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4474';

let dir = '';
const runtimes: IdentityRuntime[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-mail-off-'));
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function runtimeWith(mail: 'off' | 'capture'): IdentityRuntime {
  const runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_AUTH_DB: join(dir, `auth-${mail}.sqlite`),
      TURBOSLIDE_MAIL: mail,
      TURBOSLIDE_SESSION_SECRET: SECRET,
    },
    root: dir,
    stateDir: join(dir, `state-${mail}`),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  runtimes.push(runtime);
  return runtime;
}

function post(runtime: IdentityRuntime, path: string, body: unknown): Promise<Response> {
  return runtime.auth!.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { host: 'localhost:4474', origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function rows(runtime: IdentityRuntime): { verification: number; quota: number } {
  const count = (table: string): number =>
    Number(
      (runtime.db!.sqlite!.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n,
    );
  return { verification: count('verification'), quota: count('ts_quota') };
}

describe('the mail sign in with TURBOSLIDE_MAIL=off (HR-SA#4)', () => {
  test('every mail route answers 404 and writes no row', async () => {
    const runtime = runtimeWith('off');
    await runtime.ready;
    expect(runtime.methods.email).toBe(false);
    const asked = [
      await post(runtime, '/sign-in/magic-link', {
        email: 'off@example.test',
        callbackURL: '/decks',
      }),
      await post(runtime, '/email-otp/send-verification-otp', {
        email: 'off@example.test',
        type: 'sign-in',
      }),
      await post(runtime, '/sign-in/email-otp', { email: 'off@example.test', otp: '123456' }),
      await post(runtime, '/sign-in/pair', { token: 'x', code: 'ABCD2345' }),
      await runtime.auth!.handler(
        new Request(`${ORIGIN}/api/auth/magic-link/verify?token=x&callbackURL=/decks`, {
          headers: { host: 'localhost:4474' },
        }),
      ),
    ];
    expect(asked.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(asked[0]!.headers.getSetCookie()).toEqual([]);
    expect(rows(runtime)).toEqual({ verification: 0, quota: 0 });
  });

  test('with mail on, the same request writes its row and answers 200', async () => {
    const runtime = runtimeWith('capture');
    await runtime.ready;
    const asked = await post(runtime, '/sign-in/magic-link', {
      email: 'on@example.test',
      callbackURL: '/decks',
    });
    expect(asked.status).toBe(200);
    expect(rows(runtime).verification).toBeGreaterThan(0);
  });

  test('the routes are read from the plugins, so a route the library adds is covered', () => {
    const paths = mailPaths([
      magicLink({ sendMagicLink: async () => undefined }),
      emailOTP({ sendVerificationOTP: async () => undefined }),
    ]);
    expect(paths).toContain('/sign-in/magic-link');
    expect(paths).toContain('/magic-link/verify');
    expect(paths).toContain('/email-otp/send-verification-otp');
    expect(paths).toContain('/sign-in/email-otp');
    expect(paths).toContain('/sign-in/pair');
    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
    // the routes every sign in needs stay open
    for (const kept of ['/sign-in/social', '/callback/google', '/get-session', '/sign-out'])
      expect(paths).not.toContain(kept);
  });
});

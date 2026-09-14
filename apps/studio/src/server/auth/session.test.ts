import { describe, expect, test } from 'vitest';

import {
  ANON_COOKIE,
  ANON_COOKIE_INSECURE,
  ANON_COOKIE_MAX_AGE_S,
  anonymousCookieName,
  authContextFor,
  ensurePrincipal,
  expireAnonymousCookie,
  isSecureRequest,
  parseCookies,
  readPrincipal,
  sealPrincipalCookie,
  serializeAnonymousCookie,
  unsealPrincipalCookie,
} from './session.ts';

// Test secrets are obviously fake values, never a deployment's.
const SECRET = 'test-secret-test-secret-test-secret-0001';
const OTHER = 'test-secret-test-secret-test-secret-0002';
const UUID = '9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const ID = `anon_${UUID}`;

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe('the seal', () => {
  test('round trips and carries the issue time', async () => {
    const value = await sealPrincipalCookie(ID, SECRET, 1_757_764_800_000);
    expect(value.split('.')).toHaveLength(3);
    expect(value.startsWith('v1.')).toBe(true);
    expect(value).not.toContain(UUID);
    expect(await unsealPrincipalCookie(value, SECRET)).toEqual({
      principalId: ID,
      issuedAt: 1_757_764_800_000,
    });
  });

  test('refuses a tampered value, another secret and other shapes', async () => {
    const value = await sealPrincipalCookie(ID, SECRET);
    const [version, payload, mac] = value.split('.') as [string, string, string];
    expect(await unsealPrincipalCookie(value, OTHER)).toBeNull();
    expect(await unsealPrincipalCookie(`${version}.${payload}x.${mac}`, SECRET)).toBeNull();
    // The last base64url character carries padding bits, so flip one in the middle.
    const flipped = `${mac.slice(0, 20)}${mac[20] === 'A' ? 'B' : 'A'}${mac.slice(21)}`;
    expect(await unsealPrincipalCookie(`${version}.${payload}.${flipped}`, SECRET)).toBeNull();
    expect(await unsealPrincipalCookie(`v0.${payload}.${mac}`, SECRET)).toBeNull();
    expect(await unsealPrincipalCookie('', SECRET)).toBeNull();
    expect(await unsealPrincipalCookie('v1..', SECRET)).toBeNull();
    expect(await unsealPrincipalCookie('not a cookie', SECRET)).toBeNull();
    // A sealed account id is not an anonymous cookie even under the right secret.
    await expect(sealPrincipalCookie('usr_01J', SECRET)).rejects.toThrow(RangeError);
    await expect(sealPrincipalCookie(ID, 'short')).rejects.toThrow(RangeError);
  });
});

describe('the cookie', () => {
  test('parseCookies reads a header and keeps the first of a repeated name', () => {
    const cookies = parseCookies(`a=1; ${ANON_COOKIE}=v1.x.y; a=2; empty; =x`);
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get(ANON_COOKIE)).toBe('v1.x.y');
    expect(cookies.size).toBe(2);
    expect(parseCookies(null).size).toBe(0);
  });

  test('the name is __Host-ts_id on https and localhost, ts_id on plain http elsewhere', () => {
    expect(anonymousCookieName(request('https://turboslide.vercel.app/edit/x'))).toBe(ANON_COOKIE);
    expect(anonymousCookieName(request('http://localhost:4332/edit/x'))).toBe(ANON_COOKIE);
    expect(anonymousCookieName(request('http://127.0.0.1:4332/'))).toBe(ANON_COOKIE);
    expect(
      anonymousCookieName(request('http://10.0.0.5:4332/', { 'x-forwarded-proto': 'https' })),
    ).toBe(ANON_COOKIE);
    expect(anonymousCookieName(request('http://10.0.0.5:4332/'))).toBe(ANON_COOKIE_INSECURE);
    expect(isSecureRequest(request('http://studio.lan:4332/', { host: 'studio.lan:4332' }))).toBe(
      false,
    );
  });

  test('serializeAnonymousCookie writes the attributes of SPEC-3 7.1', () => {
    const secure = serializeAnonymousCookie(ANON_COOKIE, 'v1.a.b');
    expect(secure).toBe(
      `${ANON_COOKIE}=v1.a.b; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(ANON_COOKIE_MAX_AGE_S).toBe(400 * 86_400);
    const plain = serializeAnonymousCookie(ANON_COOKIE_INSECURE, 'v1.a.b');
    expect(plain).not.toContain('Secure');
    expect(plain).toContain('HttpOnly');
    expect(expireAnonymousCookie(ANON_COOKIE)).toBe(
      `${ANON_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    );
  });
});

describe('readPrincipal and ensurePrincipal', () => {
  test('a first request mints an anonymous principal and the Set-Cookie header', async () => {
    const req = request('https://turboslide.vercel.app/edit/x');
    expect(await readPrincipal(req, SECRET)).toBeNull();
    const ensured = await ensurePrincipal(req, SECRET, {
      randomUUID: () => UUID,
      now: 1_757_764_800_000,
    });
    expect(ensured).not.toBeNull();
    expect(ensured?.minted).toBe(true);
    expect(ensured?.principal).toEqual({ id: ID, kind: 'anonymous', admin: false });
    expect(ensured?.cookieName).toBe(ANON_COOKIE);
    expect(ensured?.setCookie).toMatch(
      new RegExp(
        `^${ANON_COOKIE}=v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure$`,
      ),
    );
    // The next request with that cookie is the same person and mints nothing.
    const value = ensured?.setCookie?.split(';')[0]?.slice(ANON_COOKIE.length + 1) ?? '';
    const again = request('https://turboslide.vercel.app/edit/x', {
      cookie: `${ANON_COOKIE}=${value}`,
    });
    expect(await readPrincipal(again, SECRET)).toEqual({ id: ID, kind: 'anonymous', admin: false });
    const kept = await ensurePrincipal(again, SECRET);
    expect(kept).toEqual({
      principal: { id: ID, kind: 'anonymous', admin: false },
      minted: false,
      cookieName: ANON_COOKIE,
    });
  });

  test('two first requests are two people', async () => {
    const a = await ensurePrincipal(request('http://localhost:4332/'), SECRET);
    const b = await ensurePrincipal(request('http://localhost:4332/'), SECRET);
    expect(a?.principal.id).not.toBe(b?.principal.id);
    expect(a?.principal.id).toMatch(/^anon_[0-9a-f-]{36}$/);
  });

  test('a forged or foreign cookie is replaced, the plain name is read too, and a bearer mints nothing', async () => {
    const forged = request('https://turboslide.vercel.app/', {
      cookie: `${ANON_COOKIE}=v1.forged.mac`,
    });
    const ensured = await ensurePrincipal(forged, SECRET);
    expect(ensured?.minted).toBe(true);
    const otherSecret = await sealPrincipalCookie(ID, OTHER);
    expect(
      await readPrincipal(
        request('https://x/', { cookie: `${ANON_COOKIE}=${otherSecret}` }),
        SECRET,
      ),
    ).toBeNull();
    const plain = await sealPrincipalCookie(ID, SECRET);
    expect(
      await readPrincipal(
        request('http://10.0.0.5/', { cookie: `${ANON_COOKIE_INSECURE}=${plain}` }),
        SECRET,
      ),
    ).toEqual({
      id: ID,
      kind: 'anonymous',
      admin: false,
    });
    const agent = request('https://turboslide.vercel.app/api/actions/deck.info', {
      authorization: 'Bearer ts_not_a_real_token',
    });
    expect(await ensurePrincipal(agent, SECRET)).toBeNull();
  });

  test('authContextFor carries the principal and no grants yet', async () => {
    const value = await sealPrincipalCookie(ID, SECRET);
    const ctx = await authContextFor(
      request('https://x/', { cookie: `${ANON_COOKIE}=${value}` }),
      SECRET,
    );
    expect(ctx).toEqual({ principal: { id: ID, kind: 'anonymous', admin: false }, linkGrants: [] });
    expect(await authContextFor(request('https://x/'), SECRET)).toEqual({
      principal: null,
      linkGrants: [],
    });
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { requestAuthor } from '@turboslide/agent/http/auth';
import { decide } from '@turboslide/identity/access';
import { parsePrincipalId } from '@turboslide/identity/ids';
import { labelFor } from '@turboslide/identity/labels';

import { actionOfRequest, agentAuthWith } from '../auth.ts';
import {
  accountFacts,
  buildIdentityRuntime,
  identityViewFor,
  linkAnonymous,
  requestIdentity,
  resolveIdentity,
} from './identity.ts';
import type { IdentityRuntime } from './identity.ts';
import { bindRequestPrincipal, ensurePrincipal, parseCookies } from './session.ts';

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4332';

let dir = '';
let runtime: IdentityRuntime;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-identity-'));
  runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_AUTH_DB: 'state/auth.sqlite',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
      TURBOSLIDE_ADMIN_EMAILS: 'admin@example.test',
    },
    root: dir,
    stateDir: join(dir, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  await runtime.ready;
});

afterEach(async () => {
  await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4332');
  headers.set('origin', ORIGIN);
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

/** The cookie pairs a response set, as one Cookie header value. */
function cookiesOf(response: Response, previous = ''): string {
  const pairs = new Map<string, string>();
  for (const part of previous.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) pairs.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const line of response.headers.getSetCookie()) {
    const first = line.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq > 0) pairs.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** A user row the way better-auth would create it, for the tests that need an account first. */
async function insertUser(id: string, email: string, name = ''): Promise<void> {
  const stamp = new Date().toISOString();
  await runtime
    .db!.db.insertInto('user')
    .values({ id, name, email, emailVerified: 1, image: null, createdAt: stamp, updatedAt: stamp })
    .execute();
}

/** Signs an address in through the library's routes: the magic link request, the captured code, the code sign in. */
async function signIn(email: string, cookie = ''): Promise<{ cookie: string; userId: string }> {
  const asked = await runtime.auth!.handler(
    request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/decks' }),
      cookie,
    }),
  );
  expect(asked.status).toBe(200);
  const mails = await runtime.mailer.list();
  const mail = mails.find((m) => m.to === email && m.kind === 'sign-in');
  expect(mail).toBeDefined();
  const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  expect(code).toHaveLength(6);
  expect(mail?.text).toContain('/api/auth/magic-link/verify?token=');
  const verified = await runtime.auth!.handler(
    request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, otp: code }),
      cookie,
    }),
  );
  expect(verified.status).toBe(200);
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie: cookiesOf(verified, cookie), userId: body.user.id };
}

describe('the runtime', () => {
  test('opens the sqlite database, captures mail, and reports the sign in methods', () => {
    expect(runtime.dbSelection.kind).toBe('sqlite');
    expect(runtime.mailMode).toBe('capture');
    expect(runtime.auth).not.toBeNull();
    expect(runtime.methods).toEqual({
      available: true,
      email: true,
      passkeys: false,
      passkeysNotice: 'Passkeys arrive once the address is final',
      github: false,
    });
    expect(runtime.checkoutToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test('without a database the studio is anonymous only and says so', async () => {
    const bare = buildIdentityRuntime({
      env: { TURBOSLIDE_SESSION_SECRET: SECRET },
      root: dir,
      stateDir: join(dir, 'state2'),
      hosted: false,
      announce: () => undefined,
      log: () => undefined,
    });
    expect(bare.auth).toBeNull();
    expect(bare.methods.available).toBe(false);
    expect(bare.methods.passkeysNotice).toBeNull();
    await expect(bare.keys.create({ userId: 'u', name: 'x', scopes: ['read'] })).rejects.toThrow(
      RangeError,
    );
    await bare.close();
  });
});

describe('requestIdentity', () => {
  test('mints an anonymous principal on a bare request and reads it back from the cookie', async () => {
    const first = await requestIdentity(request('/edit/q4'), runtime);
    expect(first.kind).toBe('anonymous');
    expect(first.minted?.setCookie).toMatch(/^__Host-ts_id=v1\./);
    expect(parsePrincipalId(first.principalId ?? '')?.kind).toBe('anonymous');
    expect(first.author).toEqual({
      kind: 'human',
      name: labelFor(first.principalId ?? ''),
      principalId: first.principalId,
    });
    expect(await runtime.principals.get(first.principalId ?? '')).not.toBeNull();
    const cookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const again = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(again.kind).toBe('anonymous');
    expect(again.principalId).toBe(first.principalId);
    expect(again.minted).toBeNull();
    expect(again.ctx.principal).toEqual({ id: first.principalId, kind: 'anonymous', admin: false });
    // a read that must not set a cookie
    const none = await requestIdentity(request('/deck/q4'), runtime, { mint: false });
    expect(none.kind).toBe('none');
    expect(none.minted).toBeNull();
  });

  test('a principal the request middleware minted is reused and never minted twice', async () => {
    const req = request('/s/token');
    const ensured = await ensurePrincipal(req, SECRET);
    expect(ensured?.minted).toBe(true);
    bindRequestPrincipal(req, ensured!);
    const identity = await requestIdentity(req, runtime);
    expect(identity.kind).toBe('anonymous');
    expect(identity.principalId).toBe(ensured?.principal.id);
    expect(identity.minted).toBeNull();
  });

  test('an API key acts for its owner with its scopes and binds the author; a revoked key is refused', async () => {
    await insertUser('maya01', 'maya@example.test', 'Maya Chen');
    const { record, secret } = await runtime.keys.create({
      userId: 'maya01',
      name: 'ci runner',
      scopes: ['read', 'export'],
    });
    const req = request('/api/actions/deck.info?deck=q4&author=kevin', {
      headers: { authorization: `Bearer ${secret}`, 'x-turboslide-author': 'agent:run-42' },
    });
    const identity = await requestIdentity(req, runtime);
    expect(identity.kind).toBe('agent');
    expect(identity.principalId).toBe(`agent:${record.id}`);
    expect(identity.ctx.principal).toEqual({
      id: 'usr_maya01',
      kind: 'account',
      email: 'maya@example.test',
      admin: false,
    });
    expect(identity.ctx.agent).toEqual({
      tokenId: record.id,
      ownerId: 'usr_maya01',
      scopes: ['read', 'export'],
      name: 'ci runner',
      runId: 'run-42',
    });
    expect(identity.author).toEqual({
      kind: 'agent',
      name: 'ci runner',
      runId: 'run-42',
      principalId: `agent:${record.id}`,
    });
    // the matrix: the owner's role intersected with the scopes on an open deck
    expect(decide(null, identity.ctx, 'read')).toEqual({ ok: true, role: 'editor', via: 'agent' });
    expect(decide(null, identity.ctx, 'write')).toMatchObject({ ok: false, status: 403 });
    // the studio's bearer rule binds the author so ?author= and the header's name are ignored
    const auth = agentAuthWith(req, runtime);
    expect(auth).toEqual({ ok: true, mode: 'token' });
    expect(requestAuthor(req)).toEqual({
      kind: 'agent',
      name: 'ci runner',
      runId: 'run-42',
      principalId: `agent:${record.id}`,
    });
    await runtime.keys.revoke(record.id, 'maya01');
    const refused = agentAuthWith(req, runtime);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/unknown or revoked/);
    expect((await requestIdentity(req, runtime)).kind).toBe('none');
  });

  test('the static bearer is the bootstrap admin, confined to admin.bootstrap once a key exists', async () => {
    const withToken: IdentityRuntime = {
      ...runtime,
      env: { ...runtime.env, TURBOSLIDE_TOKEN: 'fake-static-bearer-for-this-test' },
    };
    const req = (path: string) =>
      request(path, { headers: { authorization: 'Bearer fake-static-bearer-for-this-test' } });
    const identity = await requestIdentity(req('/api/actions/deck.info'), withToken);
    expect(identity.kind).toBe('bootstrap');
    expect(identity.ctx.agent?.scopes).toEqual(['admin']);
    expect(decide(null, identity.ctx, 'remove')).toEqual({ ok: true, role: 'owner', via: 'admin' });
    expect(agentAuthWith(req('/api/actions/deck.info'), withToken)).toEqual({
      ok: true,
      mode: 'token',
    });
    await insertUser('kevin01', 'kevin@example.test');
    await runtime.keys.create({ userId: 'kevin01', name: 'first', scopes: ['admin'] });
    const confined = agentAuthWith(req('/api/actions/deck.info'), withToken);
    expect(confined.ok).toBe(false);
    if (!confined.ok) expect(confined.message).toMatch(/bootstrap token once an API key exists/);
    expect(actionOfRequest(req('/api/actions/admin.bootstrap'))).toBe('admin.bootstrap');
    expect(agentAuthWith(req('/api/actions/admin.bootstrap'), withToken)).toEqual({
      ok: true,
      mode: 'token',
    });
    // without the bearer the token deployment refuses, and a wrong bearer too
    expect(agentAuthWith(request('/api/actions/deck.info'), withToken).ok).toBe(false);
    expect(
      agentAuthWith(
        request('/api/actions/deck.info', { headers: { authorization: 'Bearer wrong' } }),
        withToken,
      ).ok,
    ).toBe(false);
  });

  test('the per checkout token opens the localhost surface and is refused off localhost', () => {
    const token = runtime.checkoutToken ?? '';
    expect(
      agentAuthWith(
        request('/api/agent', { headers: { authorization: `Bearer ${token}` } }),
        runtime,
      ),
    ).toEqual({ ok: true, mode: 'localhost' });
    const remote = new Request('http://studio.example.test/api/agent', {
      headers: { host: 'studio.example.test', authorization: `Bearer ${token}` },
    });
    expect(agentAuthWith(remote, runtime).ok).toBe(false);
    // with the requirement on, a bare localhost request is refused and TURBOSLIDE_LOCAL_OPEN reopens it
    const requiring = { ...runtime, env: { ...runtime.env, TURBOSLIDE_LOCAL_TOKEN: 'require' } };
    expect(agentAuthWith(request('/api/agent'), requiring).ok).toBe(false);
    expect(
      agentAuthWith(request('/api/agent'), {
        ...requiring,
        env: { ...requiring.env, TURBOSLIDE_LOCAL_OPEN: '1' },
      }).ok,
    ).toBe(true);
  });
});

describe('sign in through the library', () => {
  test('a magic link request captures one mail with a link and a code, the code signs in, and the anonymous id links to the account', async () => {
    const first = await requestIdentity(request('/edit/q4'), runtime);
    const anonCookie = first.minted?.setCookie?.split(';')[0] ?? '';
    const anonId = first.principalId ?? '';
    await runtime.principals.put({ ...(await runtime.principals.get(anonId))!, name: 'Maya' });
    const { cookie, userId } = await signIn('maya@example.test', anonCookie);
    expect(parseCookies(cookie).has('ts.session_token')).toBe(true);
    // the same answer for an address that does not exist yet and an unknown code refused
    const stranger = await runtime.auth!.handler(
      request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.test' }),
      }),
    );
    expect(stranger.status).toBe(200);
    const wrong = await runtime.auth!.handler(
      request('/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.test', otp: '000000' }),
      }),
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    // the account session
    const signedIn = await requestIdentity(request('/edit/q4', { cookie }), runtime);
    expect(signedIn.kind).toBe('account');
    expect(signedIn.principalId).toBe(`usr_${userId}`);
    expect(signedIn.account?.email).toBe('maya@example.test');
    expect(signedIn.session?.fresh).toBe(true);
    expect(signedIn.author).toEqual({ kind: 'human', name: 'Maya', principalId: `usr_${userId}` });
    // the alias, written by the session hook, renders the old id as the account with the check badge
    expect(await runtime.aliases.accountOf(anonId)).toBe(userId);
    const resolved = await resolveIdentity(runtime, anonId);
    expect(resolved.trust).toBe('verified');
    expect(resolved.accountId).toBe(userId);
    expect(resolved.email).toBe('maya@example.test');
    expect(resolved.displayName).toBe('maya@example.test');
    // the merged record kept the typed name; the view carries the mark and hides the address by default
    expect((await runtime.principals.get(`usr_${userId}`))?.name).toBe('Maya');
    const { view, mark } = await identityViewFor(runtime, `usr_${userId}`, { hueSlot: 2 });
    expect(view.kind).toBe('account');
    expect(view.email).toBeUndefined();
    expect(mark.hue).toEqual({ slot: 2, hex: '#789000' });
    expect((await identityViewFor(runtime, `usr_${userId}`, { showEmail: true })).view.email).toBe(
      'maya@example.test',
    );
    // an admin address is the admin
    const { cookie: adminCookie, userId: adminId } = await signIn('admin@example.test');
    const admin = await requestIdentity(request('/edit/q4', { cookie: adminCookie }), runtime);
    expect(admin.ctx.principal?.admin).toBe(true);
    expect((await accountFacts(runtime, adminId))?.admin).toBe(true);
    expect(decide(null, admin.ctx, 'remove')).toEqual({ ok: true, role: 'owner', via: 'admin' });
  });

  test('the fourth sign in mail for one address in ten minutes is withheld with the same answer', async () => {
    const email = `capped-${Date.now()}@example.test`;
    for (let i = 0; i < 4; i += 1) {
      const asked = await runtime.auth!.handler(
        request('/api/auth/sign-in/magic-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        }),
      );
      expect(asked.status).toBe(200);
    }
    const mails = (await runtime.mailer.list({ limit: 50 })).filter((m) => m.to === email);
    expect(mails).toHaveLength(3);
  });

  test('linking is idempotent and a second browser is a second alias of one account', async () => {
    await insertUser('kai01', 'kai@example.test', 'Kai');
    const a = 'anon_1f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
    const b = 'anon_2f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
    expect(await linkAnonymous(runtime, a, 'kai01')).toBe(true);
    expect(await linkAnonymous(runtime, a, 'kai01')).toBe(false);
    expect(await linkAnonymous(runtime, b, 'kai01')).toBe(true);
    expect(await runtime.aliases.aliasesOf('kai01')).toEqual([a, b]);
    expect((await resolveIdentity(runtime, b)).displayName).toBe('Kai');
    expect((await resolveIdentity(runtime, 'usr_missing')).displayName).toBe('Deleted account');
    const agent = await resolveIdentity(runtime, 'agent:tok_unknown', {
      agent: { name: 'ci', runId: 'r1' },
    });
    expect(agent.trust).toBe('agent');
    expect(agent.runId).toBe('r1');
  });
});

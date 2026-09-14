import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { labelFor } from '@turboslide/identity/labels';
import { NAME_REFUSALS } from '@turboslide/identity/names';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  ADMIN_ONLY,
  FORGET_HEADER,
  SIGN_IN_FOR_KEYS,
  avatarAnswer,
  dataUrlBytes,
  ensureUserByEmail,
  registerAccountActions,
  registerAdminActions,
} from './actions.ts';
import type { ActionRequestFacts } from './actions.ts';
import type { AvatarFile, AvatarStore } from './avatar.ts';
import { buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityRuntime, RequestIdentity } from './identity.ts';

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4332';

let dir = '';
let runtime: IdentityRuntime;
let dispatcher: Dispatcher;
let facts: ActionRequestFacts;
const headers: [string, string][] = [];
const store: AvatarStore & { files: Map<string, AvatarFile> } = {
  files: new Map(),
  put(file) {
    store.files.set(file.relative, file);
    return Promise.resolve(`https://store.test/${file.relative}`);
  },
  removeKey(key) {
    let n = 0;
    for (const relative of [...store.files.keys()])
      if (relative.startsWith(`u/${key}/`)) {
        store.files.delete(relative);
        n += 1;
      }
    return Promise.resolve(n);
  },
  base: (key) => `https://store.test/u/${key}`,
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-actions-'));
  runtime = buildIdentityRuntime({
    env: {
      TURBOSLIDE_AUTH_DB: 'state/auth.sqlite',
      TURBOSLIDE_MAIL: 'capture',
      TURBOSLIDE_SESSION_SECRET: SECRET,
    },
    root: dir,
    stateDir: join(dir, 'state'),
    hosted: false,
    announce: () => undefined,
    log: () => undefined,
  });
  await runtime.ready;
  headers.length = 0;
  store.files.clear();
  dispatcher = createDispatcher();
  const deps = {
    runtime,
    facts: () => Promise.resolve(facts),
    avatarStore: () => store,
    namesInUse: () => Promise.resolve(['Kevin Liu']),
  };
  registerAccountActions(dispatcher, deps);
  registerAdminActions(dispatcher, deps);
});

afterEach(async () => {
  await runtime.close();
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const h = new Headers(init.headers);
  h.set('host', 'localhost:4332');
  h.set('origin', ORIGIN);
  if (init.cookie !== undefined) h.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers: h });
}

async function anonymous(): Promise<{ identity: RequestIdentity; cookie: string }> {
  const first = await requestIdentity(request('/edit/q4'), runtime);
  const cookie = first.minted?.setCookie?.split(';')[0] ?? '';
  const identity = await requestIdentity(request('/edit/q4', { cookie }), runtime);
  return { identity, cookie };
}

async function asAccount(email: string): Promise<RequestIdentity> {
  const { id } = await ensureUserByEmail(runtime, email);
  const { secret } = await runtime.keys.create({ userId: id, name: 'probe', scopes: ['read'] });
  // an API key resolves to its owner; the account kind itself needs a session cookie, which the
  // identity tests exercise through the library, so the account rows here go through the key's owner facts
  const viaKey = await requestIdentity(
    request('/api/actions/account.me', { headers: { authorization: `Bearer ${secret}` } }),
    runtime,
  );
  const account = viaKey.account!;
  const record = (await runtime.principals.touch(account.principalId, new Date(), true))!;
  return {
    kind: 'account',
    ctx: {
      principal: {
        id: account.principalId,
        kind: 'account',
        email: account.email,
        admin: account.admin,
      },
      linkGrants: [],
    },
    principalId: account.principalId,
    author: { kind: 'human', name: account.email, principalId: account.principalId },
    session: {
      id: 'sess_test',
      userId: account.userId,
      fresh: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    account,
    agent: null,
    bearer: { kind: 'none' },
    minted: null,
    record,
  };
}

const author = { kind: 'human' as const, name: 'test' };
const run = (id: string, input: unknown = {}) => dispatcher.dispatch(id, input, { author });

describe('account.me and account.setName', () => {
  test('an anonymous principal reads its label, trust and mark, and the fixed refusals hold', async () => {
    const { identity } = await anonymous();
    facts = { identity };
    const me = (await run('account.me')) as {
      principal: { id: string; kind: string; admin: boolean };
      trust: string;
      label: string;
      name?: string;
      avatar: { variant: string } | null;
      mark: { variant: string };
    };
    expect(me.principal).toEqual({ id: identity.principalId, kind: 'anonymous', admin: false });
    expect(me.trust).toBe('label');
    expect(me.label).toBe(labelFor(identity.principalId ?? ''));
    expect(me.name).toBeUndefined();
    expect(me.avatar).toEqual({ variant: 'initials' });
    expect(me.mark.variant).toBe('initials');
    await expect(run('account.setName', { name: 'Owner' })).rejects.toThrow(NAME_REFUSALS.reserved);
    // a Cyrillic letter inside a Latin name is a mixed script (rule 4) and answers the validity
    // sentence; the uniqueness sentence answers a same script confusable, here the case fold
    await expect(run('account.setName', { name: 'Kevіn Liu' })).rejects.toThrow(
      NAME_REFUSALS.invalid,
    );
    await expect(run('account.setName', { name: 'KEVIN LIU' })).rejects.toThrow(
      NAME_REFUSALS.inUse,
    );
    await expect(run('account.setName', { name: '@@@' })).rejects.toThrow(NAME_REFUSALS.invalid);
    const named = (await run('account.setName', { name: '  Maya  Chen ' })) as {
      name?: string;
      trust: string;
      label: string;
    };
    expect(named.name).toBe('Maya Chen');
    expect(named.trust).toBe('guest');
    expect(named.label).toBe('Maya Chen');
    expect((await runtime.principals.get(identity.principalId ?? ''))?.name).toBe('Maya Chen');
  });
});

describe('account.setAvatar', () => {
  test('a glyph with a salt lands on the record; a picture is refused for an anonymous principal in words', async () => {
    const { identity } = await anonymous();
    facts = { identity };
    const glyph = (await run('account.setAvatar', { variant: 'glyph', salt: 7 })) as {
      avatar: { variant: string; salt?: number };
      mark: { variant: string };
    };
    expect(glyph.avatar).toEqual({ variant: 'glyph', salt: 7 });
    expect(glyph.mark.variant).toBe('glyph');
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#406080' },
    })
      .png()
      .toBuffer();
    await expect(
      run('account.setAvatar', {
        variant: 'picture',
        picture: `data:image/png;base64,${png.toString('base64')}`,
      }),
    ).rejects.toThrow('Sign in to upload a picture');
    expect(avatarAnswer({ variant: 'initials', initials: 'MC' })).toEqual({
      variant: 'initials',
      initials: 'MC',
    });
    expect(avatarAnswer(null)).toBeNull();
    expect(() => dataUrlBytes('/etc/passwd')).toThrow(TypeError);
  });

  test('a signed in principal uploads a picture and reads its URL back', async () => {
    facts = { identity: await asAccount('maya@example.test') };
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#406080' },
    })
      .png()
      .toBuffer();
    const me = (await run('account.setAvatar', {
      variant: 'picture',
      picture: `data:image/png;base64,${png.toString('base64')}`,
    })) as {
      avatar: { variant: string; url?: string };
      mark: { variant: string; pictureUrl?: string };
    };
    expect(me.avatar.variant).toBe('picture');
    expect(me.avatar.url).toMatch(
      /^https:\/\/store\.test\/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-64\.webp$/,
    );
    expect(store.files.size).toBe(5);
  });
});

describe('Forget this browser and the deck index', () => {
  test('forget mints a fresh id, sets the cookie and the clear header, and answers the new id', async () => {
    const { identity } = await anonymous();
    facts = { identity, setHeader: (name, value) => headers.push([name, value]) };
    const out = (await run('account.forget')) as { principalId: string };
    expect(out.principalId).not.toBe(identity.principalId);
    expect(out.principalId).toMatch(/^anon_/);
    expect(headers.find(([name]) => name === 'set-cookie')?.[1]).toMatch(/^__Host-ts_id=v1\./);
    expect(headers.find(([name]) => name === FORGET_HEADER)?.[1]).toBe('1');
    expect(await runtime.principals.get(out.principalId)).not.toBeNull();
    // the old record stays, so earlier edits keep their old label
    expect(await runtime.principals.get(identity.principalId ?? '')).not.toBeNull();
  });

  test('account.decks lists the store as owned on a checkout and refuses all to a non admin', async () => {
    const { identity } = await anonymous();
    facts = { identity };
    const owned = (await run('account.decks', { view: 'owned' })) as {
      id: string;
      role?: string;
      owner?: string | null;
    }[];
    expect(Array.isArray(owned)).toBe(true);
    for (const row of owned) {
      expect(row.role).toBe('owner');
      expect(row.owner).toBe(identity.principalId);
    }
    expect(await run('account.decks', { view: 'shared' })).toEqual([]);
    await expect(run('account.decks', { view: 'all' })).rejects.toThrow(ADMIN_ONLY);
  });
});

describe('API keys and the admin actions', () => {
  test('keys are minted for signed in principals only, listed without secrets, revoked by their owner', async () => {
    const { identity } = await anonymous();
    facts = { identity };
    await expect(run('account.tokens.create', { name: 'ci', scopes: ['read'] })).rejects.toThrow(
      SIGN_IN_FOR_KEYS,
    );
    expect(await run('account.tokens.list')).toEqual({ tokens: [] });
    facts = { identity: await asAccount('kai@example.test') };
    const created = (await run('account.tokens.create', {
      name: 'ci',
      scopes: ['read', 'export'],
    })) as {
      token: { tokenId: string; scopes: string[] };
      secret: string;
    };
    expect(created.secret).toMatch(/^ts_/);
    expect(created.token.scopes).toEqual(['read', 'export']);
    const listed = (await run('account.tokens.list')) as { tokens: { tokenId: string }[] };
    expect(listed.tokens.map((t) => t.tokenId)).toContain(created.token.tokenId);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    // the key works as a bearer and is gone after the revoke
    expect(runtime.keys.resolveSync(created.secret)?.id).toBe(created.token.tokenId);
    const revoked = (await run('account.tokens.revoke', { tokenId: created.token.tokenId })) as {
      revoked: true;
      sessionsClosed: number;
    };
    expect(revoked).toEqual({ tokenId: created.token.tokenId, revoked: true, sessionsClosed: 0 });
    expect(runtime.keys.resolveSync(created.secret)).toBeNull();
    await expect(run('account.tokens.revoke', { tokenId: created.token.tokenId })).rejects.toThrow(
      RangeError,
    );
    // another account may not revoke it
    facts = { identity: await asAccount('other@example.test') };
    const { record } = await runtime.keys.create({
      userId: (await ensureUserByEmail(runtime, 'kai@example.test')).id,
      name: 'x',
      scopes: ['read'],
    });
    await expect(run('account.tokens.revoke', { tokenId: record.id })).rejects.toThrow(RangeError);
  });

  test('admin.bootstrap is the bootstrap bearer’s and mints the first key; admin.mail.list reads the capture', async () => {
    const { identity } = await anonymous();
    facts = { identity };
    await expect(run('admin.bootstrap', { email: 'kevin@example.test' })).rejects.toThrow(
      ADMIN_ONLY,
    );
    const withToken: IdentityRuntime = {
      ...runtime,
      env: { ...runtime.env, TURBOSLIDE_TOKEN: 'fake-static-bearer' },
    };
    const bootstrap = await requestIdentity(
      request('/api/actions/admin.bootstrap', {
        headers: { authorization: 'Bearer fake-static-bearer' },
      }),
      withToken,
    );
    expect(bootstrap.kind).toBe('bootstrap');
    facts = { identity: bootstrap };
    const out = (await run('admin.bootstrap', { email: 'Kevin@Example.test' })) as {
      principalId: string;
      tokenOnce: string;
    };
    expect(out.principalId).toMatch(/^usr_/);
    expect(out.tokenOnce).toMatch(/^ts_/);
    const userId = out.principalId.slice(4);
    expect((await runtime.profiles.get(userId))?.admin).toBe(true);
    expect(runtime.keys.resolveSync(out.tokenOnce)?.scopes).toEqual(['admin']);
    // the second bootstrap of the same address reuses the account and mints another key
    const again = (await run('admin.bootstrap', { email: 'kevin@example.test' })) as {
      principalId: string;
    };
    expect(again.principalId).toBe(out.principalId);
    // captured mail
    await runtime.mailer.send({ to: 'a@example.test', subject: 'S', text: 'T', kind: 'sign-in' });
    const mail = (await run('admin.mail.list', { limit: 5 })) as {
      mail: { to: string; kind: string; sentAt: string }[];
    };
    expect(mail.mail[0]).toMatchObject({ to: 'a@example.test', kind: 'sign-in' });
    expect(mail.mail[0]?.sentAt).toMatch(/^\d{4}-/);
  });
});

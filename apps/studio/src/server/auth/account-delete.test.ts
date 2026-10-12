// Hardening HR-SD#2 (DATA-V5, DATA-4): an account deletion moves the account's decks to the trash,
// drops its grants, requests and pending ownerships from other people's records, removes its deck
// index and its picture files, and refuses the whole deletion when a step fails. The stores are
// the memory ones (the access store behind two instances' caches, the index, the profiles) and a
// picture folder in a temporary directory; the last group signs a person in through the library's
// routes over SQLite and deletes the account through `/api/auth/delete-user`.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { accountPrincipalId } from '@turboslide/identity/ids';
import type { AccessRecord } from '@turboslide/schema/access';
import { legacyAssetKey, newDeckRecord } from '@turboslide/schema/access';
import { ConflictError } from '@turboslide/schema/errors';
import {
  cachedAccessStore,
  indexUpdates,
  memoryAccessBus,
  memoryAccessStore,
  memoryIndexStore,
  memoryLinkIndex,
} from '@turboslide/store/access-store';
import type { AccessStore } from '@turboslide/store/access-store';
import type { DeckHead } from '@turboslide/store/templates';

import { hostedAccessHooks } from '../access';
import type { AccessHookDeps } from '../access';
import { bindFlags } from '../flags';
import { setSecurityLogSink } from '../log';
import type { SecurityLine } from '../log';
import {
  DELETE_NOT_DONE,
  DELETE_READ_ONLY,
  RECORD_ATTEMPTS,
  deleteAccountData,
  recordUpdater,
  recordWithout,
  removeAccountData,
} from './account-delete.ts';
import type { AccountDataDeps } from './account-delete.ts';
import { fileAvatarStore } from './avatar.ts';
import { bindIdentityHooks, buildIdentityRuntime, requestIdentity } from './identity.ts';
import type { IdentityHooks, IdentityRuntime } from './identity.ts';
import { memoryProfileStore } from './profile.ts';
import type { ProfileStore } from './profile.ts';

const NOW = '2026-10-12T00:00:00.000Z';
const MAYA = 'usr_maya';
const MAYA_BROWSER = 'anon_7f0c2a52-8a39-4f43-9d71-0d6a8f1e6b11';
const OMAR = 'usr_omar';
const LEE = 'usr_lee';
const MAYA_KEY = 'AAAAAAAAAAAAAAAAAAAAAA';
const OMAR_KEY = 'BBBBBBBBBBBBBBBBBBBBBB';

function record(deckId: string, owner: string, change: Partial<AccessRecord> = {}): AccessRecord {
  return { ...newDeckRecord(deckId, owner, legacyAssetKey(deckId), NOW), ...change };
}

function grant(
  principalId: string,
  role: 'viewer' | 'editor' = 'editor',
): AccessRecord['grants'][number] {
  return {
    principalId,
    email: null,
    role,
    invitedBy: OMAR,
    invitedAt: NOW,
    acceptedAt: NOW,
    expiresAt: null,
  };
}

function head(id: string, trashedAt?: string): DeckHead {
  return {
    id,
    title: id,
    slides: 1,
    sections: 1,
    revision: 1,
    updatedAt: NOW,
    createdAt: NOW,
    ...(trashedAt === undefined ? {} : { trashedAt }),
  };
}

/** One instance's share hooks: its own cache over the shared inner store, the room told of each write. */
function instance(inner: AccessStore): AccessHookDeps & { announced: string[] } {
  const announced: string[] = [];
  return {
    store: cachedAccessStore(inner, { bus: memoryAccessBus(), ttlMs: 60_000 }),
    links: memoryLinkIndex(),
    announce: async (deckId, revision) => {
      announced.push(`${deckId}@${revision}`);
    },
    now: () => NOW,
    announced,
  };
}

/** Five files under a picture key, as `processAvatar` writes them. */
async function pictureFiles(store: ReturnType<typeof fileAvatarStore>, key: string): Promise<void> {
  const digest = 'a'.repeat(64);
  for (const [size, ext] of [
    [32, 'webp'],
    [64, 'webp'],
    [128, 'webp'],
    [256, 'webp'],
    [256, 'png'],
  ] as const)
    await store.put({
      relative: `u/${key}/${digest}-${size}.${ext}`,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: `image/${ext}`,
      size,
    });
}

type World = {
  inner: AccessStore;
  hooks: ReturnType<typeof instance>;
  heads: DeckHead[];
  trashedIds: string[];
  index: ReturnType<typeof memoryIndexStore>;
  profiles: ProfileStore;
  picturesDir: string;
  deps: AccountDataDeps;
};

/**
 * Maya owns `maya-q4` and, through the browser she linked, `maya-draft`; `maya-old` is in the
 * trash already. Omar's `omar-plan` grants her an edit, `omar-board` holds her access request,
 * `omar-handover` offers her its ownership, and `omar-invite` invites her address before she
 * accepted. `gt-brand` has no record.
 */
async function world(dir: string): Promise<World> {
  const inner = memoryAccessStore();
  const hooks = instance(inner);
  const records: AccessRecord[] = [
    record('maya-q4', MAYA, { grants: [grant(LEE, 'viewer')] }),
    record('maya-draft', MAYA_BROWSER),
    record('maya-old', MAYA),
    record('omar-plan', OMAR, { grants: [grant(MAYA), grant(LEE, 'viewer')] }),
    record('omar-board', OMAR, {
      requests: [
        {
          id: 'req_maya0001',
          principalId: MAYA,
          email: 'maya@example.test',
          role: 'viewer',
          askedAt: NOW,
          respondedAt: null,
        },
      ],
    }),
    record('omar-handover', OMAR, {
      pendingOwner: { principalId: MAYA, email: null, askedAt: NOW, askedBy: OMAR },
    }),
    record('omar-invite', OMAR, {
      grants: [
        {
          principalId: null,
          email: 'maya@example.test',
          role: 'viewer',
          invitedBy: OMAR,
          invitedAt: NOW,
          acceptedAt: null,
          expiresAt: null,
        },
      ],
    }),
  ];
  for (const one of records) await inner.write(one.deckId, one, {});
  const heads = [
    head('maya-q4'),
    head('maya-draft'),
    head('maya-old', NOW),
    head('omar-plan'),
    head('omar-board'),
    head('omar-handover'),
    head('omar-invite'),
    head('gt-brand'),
  ];
  const trashedIds: string[] = [];
  const index = memoryIndexStore();
  await index.update(MAYA, indexUpdates.name('Maya'));
  await index.update(MAYA_BROWSER, indexUpdates.name('Guest'));
  await index.update(OMAR, indexUpdates.name('Omar'));
  const profiles = memoryProfileStore();
  await profiles.setAvatar('maya', { variant: 'picture' }, MAYA_KEY);
  await profiles.setAvatar('omar', { variant: 'picture' }, OMAR_KEY);
  const picturesDir = join(dir, 'users');
  mkdirSync(picturesDir, { recursive: true });
  const pictures = fileAvatarStore(picturesDir);
  await pictureFiles(pictures, MAYA_KEY);
  await pictureFiles(pictures, OMAR_KEY);
  const deps: AccountDataDeps = {
    decks: {
      list: async () => heads.map((one) => ({ ...one })),
      trash: async (deckId) => {
        trashedIds.push(deckId);
        const found = heads.find((one) => one.id === deckId);
        if (found !== undefined) found.trashedAt = NOW;
      },
    },
    readRecord: async (deckId) => (await hooks.store.read(deckId))?.record ?? null,
    updateRecord: recordUpdater((deckId) =>
      hostedAccessHooks(deckId, { ...hooks, missing: async () => null }),
    ),
    index,
    pictures,
    profiles,
  };
  return { inner, hooks, heads, trashedIds, index, profiles, picturesDir, deps };
}

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-account-delete-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('recordWithout', () => {
  test('drops the grants, requests and pending ownership naming the ids, keeps the rest and counts one revision', () => {
    const before = record('omar-plan', OMAR, {
      grants: [grant(MAYA), grant(LEE, 'viewer'), grant(MAYA_BROWSER, 'viewer')],
      pendingOwner: { principalId: MAYA, email: null, askedAt: NOW, askedBy: OMAR },
      revision: 4,
    });
    const after = recordWithout(before, new Set([MAYA, MAYA_BROWSER]));
    expect(after?.grants).toEqual([grant(LEE, 'viewer')]);
    expect(after?.pendingOwner).toBeNull();
    expect(after?.revision).toBe(5);
    expect(after?.owner).toBe(OMAR);
    expect(after?.createdBy).toBe(OMAR);
  });

  test('answers null for a record that names none of the ids by principal id', () => {
    const invited = record('omar-invite', OMAR, {
      grants: [{ ...grant(LEE), principalId: null, email: 'maya@example.test' }],
    });
    expect(recordWithout(invited, new Set([MAYA]))).toBeNull();
    expect(recordWithout(record('maya-q4', MAYA), new Set([MAYA]))).toBeNull();
  });
});

describe('removeAccountData', () => {
  test('trashes the owned decks, releases the other records, removes the indexes and the picture files', async () => {
    const w = await world(dir);
    const report = await removeAccountData(
      { userId: 'maya', principalIds: [MAYA, MAYA_BROWSER] },
      w.deps,
    );
    expect(report).toEqual({
      trashed: ['maya-draft', 'maya-q4'],
      released: ['omar-board', 'omar-handover', 'omar-plan'],
      indexFiles: 2,
      pictureFiles: 5,
    });
    // the deck already in the trash keeps its first stamp
    expect(w.trashedIds.sort()).toEqual(['maya-draft', 'maya-q4']);
    const stored = async (deckId: string): Promise<AccessRecord | undefined> =>
      (await w.inner.read(deckId))?.record;
    expect((await stored('omar-plan'))?.grants).toEqual([grant(LEE, 'viewer')]);
    expect((await stored('omar-plan'))?.revision).toBe(1);
    expect((await stored('omar-board'))?.requests).toEqual([]);
    expect((await stored('omar-handover'))?.pendingOwner).toBeNull();
    // an invitation of the address is the inviter's, and Maya's own decks keep their records
    expect((await stored('omar-invite'))?.revision).toBe(0);
    expect((await stored('maya-q4'))?.grants).toEqual([grant(LEE, 'viewer')]);
    expect(w.hooks.announced.sort()).toEqual(['omar-board@1', 'omar-handover@1', 'omar-plan@1']);
    expect(w.index.indexes.has(MAYA)).toBe(false);
    expect(w.index.indexes.has(MAYA_BROWSER)).toBe(false);
    expect(w.index.indexes.has(OMAR)).toBe(true);
    expect(existsSync(join(w.picturesDir, 'u', MAYA_KEY))).toBe(false);
    expect(readdirSync(join(w.picturesDir, 'u', OMAR_KEY))).toHaveLength(5);
  });

  test('a second run finds nothing left to do', async () => {
    const w = await world(dir);
    const account = { userId: 'maya', principalIds: [MAYA, MAYA_BROWSER] };
    await removeAccountData(account, w.deps);
    const again = await removeAccountData(account, w.deps);
    expect(again).toEqual({ trashed: [], released: [], indexFiles: 0, pictureFiles: 0 });
  });

  test('a record that cannot be read refuses the deletion before the index and the pictures go', async () => {
    const w = await world(dir);
    const refused = removeAccountData(
      { userId: 'maya', principalIds: [MAYA] },
      {
        ...w.deps,
        concurrency: 1,
        readRecord: async (deckId) => {
          if (deckId === 'omar-plan') throw new Error('the store did not answer');
          return w.deps.readRecord(deckId);
        },
      },
    );
    await expect(refused).rejects.toThrow('the store did not answer');
    expect(w.index.indexes.has(MAYA)).toBe(true);
    expect(readdirSync(join(w.picturesDir, 'u', MAYA_KEY))).toHaveLength(5);
    // with one reader, the decks after the failed one are not reached
    expect(w.trashedIds).toEqual(['maya-q4']);
  });
});

describe('recordUpdater', () => {
  test('a grant written by another instance between the read and the write is kept, and the change is based on it', async () => {
    const inner = memoryAccessStore();
    const mine = instance(inner);
    const theirs = instance(inner);
    await inner.write('omar-plan', record('omar-plan', OMAR, { grants: [grant(MAYA)] }), {});
    let loads = 0;
    const update = recordUpdater((deckId) => {
      const hooks = hostedAccessHooks(deckId, mine);
      return {
        load: async () => {
          const read = await hooks.load();
          loads += 1;
          if (loads === 1) {
            // Omar shares with Lee on another instance before this write lands
            const other = hostedAccessHooks(deckId, theirs);
            const current = (await other.load())!;
            await other.save({
              ...current,
              grants: [...current.grants, grant(LEE, 'viewer')],
              revision: current.revision + 1,
            });
          }
          return read;
        },
        save: hooks.save,
      };
    });
    expect(await update('omar-plan', (current) => recordWithout(current, new Set([MAYA])))).toBe(
      true,
    );
    expect(loads).toBe(2);
    const stored = (await inner.read('omar-plan'))?.record;
    expect(stored?.grants).toEqual([grant(LEE, 'viewer')]);
    expect(stored?.revision).toBe(2);
  });

  test('gives up after RECORD_ATTEMPTS conflicts, and throws any other error at once', async () => {
    let saves = 0;
    const conflicted = recordUpdater(() => ({
      load: async () => record('omar-plan', OMAR, { grants: [grant(MAYA)] }),
      save: async () => {
        saves += 1;
        throw new ConflictError('moved', { currentRevision: 9 });
      },
    }));
    await expect(
      conflicted('omar-plan', (current) => recordWithout(current, new Set([MAYA]))),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(saves).toBe(RECORD_ATTEMPTS);
    saves = 0;
    const failing = recordUpdater(() => ({
      load: async () => record('omar-plan', OMAR, { grants: [grant(MAYA)] }),
      save: async () => {
        saves += 1;
        throw new Error('the store did not answer');
      },
    }));
    await expect(
      failing('omar-plan', (current) => recordWithout(current, new Set([MAYA]))),
    ).rejects.toThrow('the store did not answer');
    expect(saves).toBe(1);
  });
});

describe('bindIdentityHooks', () => {
  test('a deletion hook bound on every request is bound once', () => {
    const hooks: IdentityHooks = {
      onLinked: [],
      beforeDelete: [],
      onDeleted: [],
      bindInvitations: null,
      deckIndex: null,
      findShareLink: null,
      closeAgentSessions: null,
      onLinkGrant: null,
    };
    const runtime = { hooks } as unknown as IdentityRuntime;
    const hook = async (): Promise<void> => undefined;
    for (let request = 0; request < 3; request += 1)
      bindIdentityHooks({ beforeDelete: hook, onDeleted: hook, onLinked: hook }, runtime);
    expect(hooks.beforeDelete).toEqual([hook]);
    expect(hooks.onDeleted).toEqual([hook]);
    expect(hooks.onLinked).toEqual([hook]);
  });
});

// ------------------------------------------------------------------------------------------
// Through the library's delete route, over SQLite with captured mail

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4855';

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4855');
  headers.set('origin', ORIGIN);
  headers.set('x-forwarded-for', '203.0.113.7');
  if (init.cookie !== undefined && init.cookie !== '') headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

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

describe('an account deleted through /api/auth/delete-user', () => {
  let runtime: IdentityRuntime;
  let lines: SecurityLine[];
  let previousSink: ReturnType<typeof setSecurityLogSink>;

  beforeEach(async () => {
    runtime = buildIdentityRuntime({
      env: {
        TURBOSLIDE_AUTH_DB: 'state/auth.sqlite',
        TURBOSLIDE_MAIL: 'capture',
        TURBOSLIDE_SESSION_SECRET: SECRET,
      },
      root: dir,
      stateDir: join(dir, 'state'),
      hosted: true,
      announce: () => undefined,
      log: () => undefined,
    });
    await runtime.ready;
    lines = [];
    previousSink = setSecurityLogSink((line) => lines.push(line));
    // every switch on, whatever a flags file of this folder says
    bindFlags({ read: async () => true });
  });

  afterEach(async () => {
    setSecurityLogSink(previousSink);
    bindFlags({ read: null });
    await runtime.close();
  });

  /** A browser that signs in with no decks of its own, so its anonymous id joins the account. */
  async function signedIn(
    email: string,
  ): Promise<{ cookie: string; userId: string; anonymousId: string }> {
    const first = await requestIdentity(request('/decks'), runtime);
    const anonymousId = first.principalId ?? '';
    let cookie = cookiesOf(first.minted?.setCookie === undefined ? [] : [first.minted.setCookie]);
    const asked = await runtime.auth!.handler(
      request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: '/decks' }),
        cookie,
      }),
    );
    expect(asked.status).toBe(200);
    cookie = cookiesOf(asked.headers.getSetCookie(), cookie);
    const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
    const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
    const verified = await runtime.auth!.handler(
      request('/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
        cookie,
      }),
    );
    expect(verified.status).toBe(200);
    cookie = cookiesOf(verified.headers.getSetCookie(), cookie);
    const { user } = (await verified.json()) as { user: { id: string } };
    expect(await runtime.aliases.accountOf(anonymousId)).toBe(user.id);
    return { cookie, userId: user.id, anonymousId };
  }

  /** Maya's stores: one deck made by her account, one by her browser before the sign in, one picture. */
  async function stores(
    userId: string,
    anonymousId: string,
  ): Promise<World & { principal: string }> {
    const principal = accountPrincipalId(userId);
    const w = await world(dir);
    await w.inner.write('signed-in-deck', record('signed-in-deck', principal), {});
    await w.inner.write('browser-deck', record('browser-deck', anonymousId), {});
    w.heads.push(head('signed-in-deck'), head('browser-deck'));
    await w.index.update(principal, indexUpdates.name('Maya'));
    await w.index.update(anonymousId, indexUpdates.name('Guest'));
    await runtime.profiles.setAvatar(userId, { variant: 'picture' }, MAYA_KEY);
    return { ...w, principal, deps: { ...w.deps, profiles: runtime.profiles } };
  }

  async function deleteUser(cookie: string): Promise<Response> {
    return runtime.auth!.handler(
      request('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cookie,
      }),
    );
  }

  function bindDeletion(w: World): void {
    bindIdentityHooks(
      {
        beforeDelete: async (userId) => {
          await deleteAccountData(userId, {
            principalIds: async (id) => [
              accountPrincipalId(id),
              ...(await runtime.aliases.aliasesOf(id)),
            ],
            data: async () => w.deps,
          });
        },
      },
      runtime,
    );
  }

  test('the decks of the account and of its browser go to the trash, and the index and the picture go', async () => {
    const maya = await signedIn('maya@example.test');
    const w = await stores(maya.userId, maya.anonymousId);
    bindDeletion(w);
    const answer = await deleteUser(maya.cookie);
    expect(answer.status).toBe(200);
    expect(w.trashedIds.sort()).toEqual(['browser-deck', 'signed-in-deck']);
    expect(w.index.indexes.has(accountPrincipalId(maya.userId))).toBe(false);
    expect(w.index.indexes.has(maya.anonymousId)).toBe(false);
    expect(existsSync(join(w.picturesDir, 'u', MAYA_KEY))).toBe(false);
    expect((await runtime.profiles.get(maya.userId))?.deletedAt).not.toBeNull();
    // one line with the counts, naming the principal and never the address
    const line = lines.find((one) => one.event === 'delete' && one.action === 'account.delete');
    expect(line).toMatchObject({
      status: 200,
      identity: accountPrincipalId(maya.userId),
      removed: 2,
    });
    expect(JSON.stringify(lines)).not.toContain('maya@example.test');
  });

  test('read only, the deletion answers 503 with its sentence and the account stays', async () => {
    const maya = await signedIn('maya@example.test');
    const w = await stores(maya.userId, maya.anonymousId);
    bindDeletion(w);
    bindFlags({ read: async (name) => name !== 'readOnly' });
    const answer = await deleteUser(maya.cookie);
    expect(answer.status).toBe(503);
    expect(((await answer.json()) as { message: string }).message).toBe(DELETE_READ_ONLY);
    expect(w.trashedIds).toEqual([]);
    expect((await runtime.profiles.get(maya.userId))?.deletedAt).toBeNull();
    const session = await requestIdentity(request('/decks', { cookie: maya.cookie }), runtime);
    expect(session.kind).toBe('account');
  });

  test('a step that fails answers 503 with its sentence, and the account and its picture stay', async () => {
    const maya = await signedIn('maya@example.test');
    const w = await stores(maya.userId, maya.anonymousId);
    w.deps.decks.trash = async () => {
      throw new Error('the store did not answer');
    };
    bindDeletion(w);
    const answer = await deleteUser(maya.cookie);
    expect(answer.status).toBe(503);
    expect(((await answer.json()) as { message: string }).message).toBe(DELETE_NOT_DONE);
    expect((await runtime.profiles.get(maya.userId))?.deletedAt).toBeNull();
    expect(readdirSync(join(w.picturesDir, 'u', MAYA_KEY))).toHaveLength(5);
    const session = await requestIdentity(request('/decks', { cookie: maya.cookie }), runtime);
    expect(session.kind).toBe('account');
    expect(lines.find((one) => one.event === 'delete')?.status).toBe(503);
  });
});

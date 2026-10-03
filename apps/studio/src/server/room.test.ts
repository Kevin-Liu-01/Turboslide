import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { labelFor } from '@turboslide/identity/labels';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { AccountProfile } from '@turboslide/identity/resolve';
import type { RosterEntry } from '@turboslide/realtime/channel';
import type { AccessRecord } from '@turboslide/schema/access';
import { indexUpdates, principalFolder } from '@turboslide/store/access-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { sharedPresence } from '@turboslide/store/presence-store';
import type { SharedPresenceEvent } from '@turboslide/store/presence-store';

import { indexStore } from './access';
import { buildIdentityRuntime, setIdentityRuntime } from './auth/identity';
import type { IdentityRuntime } from './auth/identity';
import {
  JOIN_ROW_CLOCK,
  announceJoin,
  authorOf,
  identityViewsFor,
  requestIdentity,
  resolveIdentity,
  resolvePrincipalId,
  resolveRequestIdentity,
  roleMark,
  rosterEntryFor,
  rosterEntryForReader,
  withFreshIndexFacts,
} from './room';
import type { Room } from './room';
import type { ViewerFacts } from './room';
import { stateDir } from './root';

// The room's identity seam of the people round (docs/archive/rounds/PEOPLE.md 3.6, 3.7, 3.8, 3.27; 6.5): the
// account session read on the room routes, the resolver's account and alias lookups, the roster
// entry a link visitor reads (the role's plate, the hue kept) and the address a grant holder
// reads, the resolved views of the people a page names. The runtime is a sqlite database in a
// temporary folder with the capture mailer, the way identity.test.ts builds it; the room's own
// module state (the memory channel, the file principal store) is the checkout's.

const SECRET = 'an-obviously-fake-session-secret-for-tests-0123456789';
const ORIGIN = 'http://localhost:4332';
const ANON = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const USR_A = 'usr_people01';
const USR_B = 'usr_people02';

let dir = '';
let runtime: IdentityRuntime;
const secretBefore = process.env.TURBOSLIDE_SESSION_SECRET;

beforeEach(async () => {
  process.env.TURBOSLIDE_SESSION_SECRET = SECRET;
  dir = mkdtempSync(join(tmpdir(), 'turboslide-room-people-'));
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
  await setIdentityRuntime(runtime);
});

afterEach(async () => {
  await setIdentityRuntime(undefined);
  rmSync(dir, { recursive: true, force: true });
  if (secretBefore === undefined) delete process.env.TURBOSLIDE_SESSION_SECRET;
  else process.env.TURBOSLIDE_SESSION_SECRET = secretBefore;
});

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4332');
  headers.set('origin', ORIGIN);
  if (init.cookie !== undefined) headers.set('cookie', init.cookie);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
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
    if (eq > 0) pairs.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function insertUser(id: string, email: string, name = ''): Promise<void> {
  const stamp = new Date().toISOString();
  await runtime
    .db!.db.insertInto('user')
    .values({ id, name, email, emailVerified: 1, image: null, createdAt: stamp, updatedAt: stamp })
    .execute();
}

/** The library's own sign in: the magic link request, the captured code, the code sign in. */
async function signIn(email: string): Promise<{ cookie: string; userId: string }> {
  const asked = await runtime.auth!.handler(
    request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/decks' }),
    }),
  );
  expect(asked.status).toBe(200);
  const mail = (await runtime.mailer.list()).find((m) => m.to === email && m.kind === 'sign-in');
  const code = /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  expect(code).toHaveLength(6);
  const verified = await runtime.auth!.handler(
    request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, otp: code }),
    }),
  );
  expect(verified.status).toBe(200);
  const body = (await verified.json()) as { user: { id: string } };
  return { cookie: cookiesOf(verified), userId: body.user.id };
}

function entry(principalId: string, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    clientId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    clock: 1,
    pointerOn: false,
    presenting: false,
    principalId,
    label: 'Maya Chen',
    trust: 'verified',
    mark: {
      variant: 'picture',
      initials: '',
      density: 3,
      glyphSeed: 12345,
      pictureUrl: 'https://store.example.test/u/k/d-64.webp',
      hue: { slot: 3, hex: '#0f6a6a' },
      label: 'Maya Chen',
    },
    hueSlot: 2,
    kind: 'human',
    role: 'editor',
    ...overrides,
  };
}

const reader = (via: ViewerFacts['via'], showNames = false): ViewerFacts => ({
  role: 'editor',
  via,
  showNames,
  readComments: true,
});

describe('rosterEntryForReader', () => {
  it('swaps the whole mark for the role word plate for a link visitor and keeps the hue', () => {
    const seen = rosterEntryForReader(entry(USR_A), reader('link'));
    expect(seen.label).toBe('An editor');
    expect(seen.trust).toBe('label');
    expect(seen.hueSlot).toBe(2);
    expect(seen.mark).toEqual(roleMark('editor', 3));
    expect(seen.mark).toMatchObject({ variant: 'initials', initials: 'E', label: 'An editor' });
    expect(seen.mark).not.toHaveProperty('pictureUrl');
    expect((seen.mark as { hue: { slot: number } }).hue.slot).toBe(3);
    expect(seen).not.toHaveProperty('email');
    // the plate is the role's, not the person's: two editors read as one plate with two hues
    const other = rosterEntryForReader(entry(USR_B, { hueSlot: 4 }), reader('open'));
    const { hue: _h1, ...plateA } = seen.mark as { hue: unknown };
    const { hue: _h2, ...plateB } = other.mark as { hue: unknown };
    expect(plateB).toEqual(plateA);
    // a different role, a different plate
    expect(
      rosterEntryForReader(entry(USR_A, { role: 'owner' }), reader('link')).mark,
    ).toMatchObject({
      initials: 'O',
      label: 'The owner',
    });
  });

  it('passes a label, a guest and an agent through, and a named person under the owner switch', () => {
    const label = entry(ANON, { trust: 'label', label: labelFor(ANON) });
    expect(rosterEntryForReader(label, reader('link'))).toEqual(label);
    const guest = entry(ANON, { trust: 'guest', label: 'Maya' });
    expect(rosterEntryForReader(guest, reader('open'))).toEqual(guest);
    const agent = entry('agent:tok_1', { trust: 'agent', kind: 'agent' });
    expect(rosterEntryForReader(agent, reader('link'))).toEqual(agent);
    const named = rosterEntryForReader(entry(USR_A), reader('link', true));
    expect(named.label).toBe('Maya Chen');
    expect(named.mark).toEqual(entry(USR_A).mark);
    expect(named).not.toHaveProperty('email');
  });

  it('writes the address for the owner and a grant holder only, from what this instance resolved', async () => {
    await insertUser('people01', 'maya@example.test', 'Maya Chen');
    // nothing resolved yet on this instance: no address for anyone
    expect(rosterEntryForReader(entry(USR_A), reader('grant'))).not.toHaveProperty('email');
    const resolved = await resolvePrincipalId(USR_A);
    expect(resolved.email).toBe('maya@example.test');
    expect(rosterEntryForReader(entry(USR_A), reader('grant')).email).toBe('maya@example.test');
    expect(rosterEntryForReader(entry(USR_A), reader('owner')).email).toBe('maya@example.test');
    expect(rosterEntryForReader(entry(USR_A), reader('link', true))).not.toHaveProperty('email');
    expect(rosterEntryForReader(entry(USR_A), reader('admin'))).not.toHaveProperty('email');
    // a stored entry that carries an address is never trusted: the reader's own view decides
    const foreign = entry(USR_A, { email: 'leak@example.test' });
    expect(rosterEntryForReader(foreign, reader('link'))).not.toHaveProperty('email');
    expect(rosterEntryForReader(foreign, reader('grant')).email).toBe('maya@example.test');
    // a guest never carries one
    const guest = entry(ANON, { trust: 'guest', label: 'Maya' });
    expect(rosterEntryForReader(guest, reader('grant'))).not.toHaveProperty('email');
  });
});

describe('resolveIdentity', () => {
  const profile: AccountProfile = {
    userId: 'people01',
    name: 'Maya Chen',
    email: 'maya@example.test',
    emailVerified: true,
    admin: false,
  };

  it('renders an account id through the account the request resolved to, and only that account', () => {
    const own = resolveIdentity(USR_A, newPrincipalRecord(USR_A), profile);
    expect(own).toMatchObject({
      displayName: 'Maya Chen',
      trust: 'verified',
      email: 'maya@example.test',
    });
    const other = resolveIdentity(USR_B, null, profile);
    expect(other).toMatchObject({ displayName: 'Deleted account', deleted: true });
    const none = resolveIdentity(USR_A, null);
    expect(none.deleted).toBe(true);
    const anonymous = resolveIdentity(ANON, { ...newPrincipalRecord(ANON), name: 'Kai' }, profile);
    expect(anonymous).toMatchObject({ displayName: 'Kai', trust: 'guest' });
  });
});

describe('the account session on the room routes', () => {
  it('reads the session before the anonymous cookie: one id for the boot, the author and the roster', async () => {
    const { cookie, userId } = await signIn('maya@example.test');
    const identity = await requestIdentity(request('/api/decks/q4/presence', { cookie }));
    expect(identity.kind).toBe('signedIn');
    expect(identity.principalId).toBe(`usr_${userId}`);
    expect(identity.identity).toBe(`usr_${userId}`);
    expect(identity.ctx.principal).toMatchObject({
      id: `usr_${userId}`,
      kind: 'account',
      email: 'maya@example.test',
    });
    expect(identity.account?.email).toBe('maya@example.test');
    expect(identity.record?.principalId).toBe(`usr_${userId}`);
    expect(identity.setCookie).toBeUndefined();
    // an account without a typed name writes under its label, never its address (3.18)
    expect(authorOf(identity)).toEqual({
      kind: 'human',
      name: labelFor(`usr_${userId}`),
      principalId: `usr_${userId}`,
    });
    const resolved = await resolveRequestIdentity(identity);
    expect(resolved).toMatchObject({
      kind: 'account',
      trust: 'verified',
      displayName: labelFor(`usr_${userId}`),
      email: 'maya@example.test',
      deleted: false,
    });
    // the same answer for an id the request did not carry (the version history, the comments)
    const again = await resolvePrincipalId(`usr_${userId}`);
    expect(again.email).toBe('maya@example.test');
    expect((await resolvePrincipalId('usr_missing')).displayName).toBe('Deleted account');
  });

  it('a request without a session is anonymous as before', async () => {
    const identity = await requestIdentity(
      request('/api/decks/q4/presence', { cookie: 'ts.session_token=nonsense' }),
    );
    expect(identity.kind).toBe('anonymous');
    expect(identity.principalId).toMatch(/^anon_/);
    expect(identity.account).toBeUndefined();
  });
});

describe('identityViewsFor', () => {
  const record: AccessRecord = {
    schemaVersion: 1,
    deckId: 'q4',
    owner: USR_A,
    pendingOwner: null,
    createdAt: '2026-09-29T10:00:00.000Z',
    createdBy: USR_A,
    generalAccess: { mode: 'link', role: 'commenter' },
    links: [],
    publish: null,
    grants: [
      {
        id: 'grt_1',
        principalId: USR_B,
        email: null,
        role: 'viewer',
        invitedBy: USR_A,
        createdAt: '2026-09-29T10:00:00.000Z',
        expiresAt: null,
        acceptedAt: null,
      },
    ],
    requests: [],
    settings: {
      editorsCanShare: true,
      viewersCanDownload: true,
      viewersCanSeeComments: false,
      showNamesToLinkVisitors: false,
      allowHtmlBlocks: false,
    },
    revision: 1,
  } as unknown as AccessRecord;

  it('resolves accounts, anonymous ids and skips legacy names; the address for a sharer only', async () => {
    await insertUser('people01', 'maya@example.test', 'Maya Chen');
    await insertUser('people02', 'kai@example.test');
    const views = await identityViewsFor([USR_A, USR_B, ANON, 'kevinliu', USR_A], {
      showEmail: true,
      roleWords: false,
      access: record,
    });
    expect(Object.keys(views).sort()).toEqual([USR_A, USR_B, ANON].sort());
    expect(views[USR_A]).toMatchObject({
      name: 'Maya Chen',
      trust: 'verified',
      email: 'maya@example.test',
    });
    expect(views[USR_A]?.mark).toMatchObject({ variant: 'initials', initials: 'MC' });
    // an account without a typed name: its label, the badge, the address for the sharer
    expect(views[USR_B]).toMatchObject({
      label: labelFor(USR_B),
      trust: 'verified',
      email: 'kai@example.test',
    });
    expect(views[USR_B]?.name).toBeUndefined();
    expect(views[ANON]).toMatchObject({ label: labelFor(ANON), trust: 'label', kind: 'anonymous' });
    const hidden = await identityViewsFor([USR_A], {
      showEmail: false,
      roleWords: false,
      access: record,
    });
    expect(hidden[USR_A]?.email).toBeUndefined();
    expect(hidden[USR_A]?.name).toBe('Maya Chen');
  });

  it('reads a verified person as the role word for a link visitor without the owner switch', async () => {
    await insertUser('people01', 'maya@example.test', 'Maya Chen');
    await insertUser('people02', 'kai@example.test', 'Kai');
    const views = await identityViewsFor([USR_A, USR_B, ANON, 'usr_people03'], {
      showEmail: false,
      roleWords: true,
      access: record,
    });
    expect(views[USR_A]).toEqual({
      principalId: USR_A,
      label: 'The owner',
      trust: 'label',
      kind: 'anonymous',
      mark: roleMark('owner', null),
    });
    expect(views[USR_B]).toMatchObject({ label: 'A viewer', trust: 'label' });
    expect(views[USR_B]?.mark).toMatchObject({ initials: 'V' });
    // a label passes through; a deleted account stays "Deleted account" with no badge
    expect(views[ANON]).toMatchObject({ label: labelFor(ANON), trust: 'label' });
    expect(views['usr_people03']).toMatchObject({
      label: labelFor('usr_people03'),
      name: 'Deleted account',
      trust: 'verified',
      deleted: true,
    });
    expect(views['usr_people03']?.email).toBeUndefined();
  });
});

describe("the caller's own index facts past the cache (docs/archive/rounds/PEOPLE.md 6.4)", () => {
  it('the boot reads the choice another instance wrote at once, the presence tick keeps the row, and the resolution follows the facts inside the 5 s', async () => {
    /* people.own-chip-follows-avatar red on preview 7 (the verifier's pass 1 finding 3): the
       choice `account.setAvatar` wrote on one instance reached the instance that served the
       reload only when its index row expired, and the resolution cached over that row held the
       old plate for another 5 s. The write below skips the writer's cache drop, the way another
       instance's write reaches this one. */
    const minted = await requestIdentity(
      request('/api/decks/q4/presence', { cookie: 'ts.session_token=nonsense' }),
    );
    const id = minted.principalId ?? '';
    expect(id).toMatch(/^anon_/);
    const cookie = (minted.setCookie ?? '').split(';')[0] ?? '';
    const again = () => requestIdentity(request('/api/decks/q4/presence', { cookie }));
    const folder = join(stateDir(), 'users', principalFolder(id));
    const glyph = { variant: 'glyph' as const, salt: 7 };
    try {
      // this instance read the row before the write: initials, cached for 5 s
      expect((await again()).record?.avatar).toEqual({ variant: 'initials' });
      const before = await resolveRequestIdentity(minted);
      expect(before.avatar.variant).toBe('initials');
      await (await indexStore()).update(id, indexUpdates.avatar(glyph));
      // a presence tick keeps the row: the old choice, and the resolution cached over it
      const tick = await again();
      expect(tick.record?.avatar).toEqual({ variant: 'initials' });
      expect((await resolveRequestIdentity(tick)).avatar.variant).toBe('initials');
      // the boot reads the store, and its resolution misses the row cached seconds ago
      const boot = await requestIdentity(request('/api/decks/q4/presence', { cookie }), {
        freshIndex: true,
      });
      expect(boot.record?.avatar).toEqual(glyph);
      expect((await resolveRequestIdentity(boot)).avatar).toEqual(glyph);
      // the reads after the boot on this instance take the filled row
      expect((await again()).record?.avatar).toEqual(glyph);
      // a first presence post reads the store the same way on an instance that holds the old row
      await (await indexStore()).update(id, indexUpdates.avatar({ variant: 'dither', salt: 2 }));
      const stale = await again();
      expect(stale.record?.avatar).toEqual(glyph);
      const fresh = await withFreshIndexFacts(stale);
      expect(fresh.record?.avatar).toEqual({ variant: 'dither', salt: 2 });
      expect(await withFreshIndexFacts(fresh)).toBe(fresh);
      const post = { clientId: 'b'.repeat(32), clock: 1, pointerOn: false, presenting: false };
      const entry = await rosterEntryFor({} as Room, stale, 'editor', post, []);
      expect(entry.mark).toMatchObject({ variant: 'dither' });
      // the second post of the client keeps the row (one read per client, never per tick)
      await (await indexStore()).update(id, indexUpdates.avatar(glyph));
      const second = await rosterEntryFor({} as Room, await again(), 'editor', post, [entry]);
      expect(second.mark).toMatchObject({ variant: 'dither' });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('resolvePrincipalId', () => {
  it('reads the name another instance wrote onto the deck index past this instance cache', async () => {
    /* the blob tier's principal store is a file store per instance and the index cache of
       access.ts is process local (5 s): the guest typed the name on one instance and A's reload
       was served by another that had read the guest's index row before the write (the verifier's
       pass 1 finding 2, people.comment-departed-guest). The write below skips the writer's cache
       drop, the way another instance's write reaches this one. */
    const anon = `anon_${randomUUID()}`;
    const folder = join(stateDir(), 'users', principalFolder(anon));
    try {
      const before = await resolvePrincipalId(anon);
      expect(before).toMatchObject({ displayName: labelFor(anon), trust: 'label' });
      await (await indexStore()).update(anon, indexUpdates.name('Noor Haddad'));
      const after = await resolvePrincipalId(anon);
      expect(after).toMatchObject({ displayName: 'Noor Haddad', trust: 'guest' });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the joiner's row at the stream's open (hotfix/join-latency)", () => {
  it('announces the roster entry the route resolved, at the join clock and the hello role, to the shared roster alone and with no store call', async () => {
    const minted = await requestIdentity(
      request('/api/decks/q4/stream', { cookie: 'ts.session_token=nonsense' }),
    );
    const folder = join(stateDir(), 'users', principalFolder(minted.principalId ?? ''));
    try {
      const client = memoryBlobClient();
      const seen: SharedPresenceEvent<RosterEntry>[] = [];
      const shared = sharedPresence<RosterEntry>({ client, publish: (_d, e) => seen.push(e) });
      const room = { deckId: 'q4' } as Room;
      const clientId = 'c'.repeat(32);
      expect(await announceJoin(room, minted, 'viewer', clientId, [], () => true, shared)).toBe(
        true,
      );
      expect(seen).toHaveLength(1);
      const state = (seen[0] as Extract<SharedPresenceEvent<RosterEntry>, { type: 'presence' }>)
        .state;
      expect(state).toMatchObject({
        clientId,
        clock: JOIN_ROW_CLOCK,
        pointerOn: false,
        presenting: false,
        principalId: minted.identity,
        role: 'viewer',
        kind: 'human',
      });
      expect(state.slideId).toBeUndefined();
      expect(state.label).toBe((await resolveRequestIdentity(minted)).displayName);
      expect((await shared.roster('q4')).map((row) => row.clientId)).toEqual([clientId]);
      expect(client.calls.filter((call) => call.op === 'put')).toEqual([]);
      // a stream closed while the entry was built announces nothing; nor does a tier without a
      // shared roster (memory, redis: every set reaches every stream there)
      const other = 'd'.repeat(32);
      expect(await announceJoin(room, minted, 'editor', other, [], () => false, shared)).toBe(
        false,
      );
      expect(await announceJoin(room, minted, 'editor', other, [], () => true, null)).toBe(false);
      expect(seen).toHaveLength(1);
      await shared.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

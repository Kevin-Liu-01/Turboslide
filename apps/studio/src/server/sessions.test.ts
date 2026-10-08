// The session directory (gslides-parity SPEC-3 11.3; MILESTONES-3 B2 day 5 "sessions.test.ts
// caps"): bindings carry the identity, one identity attaches at most 20 pages and one deck at
// most 200, a binding not polled for 90 s is gone, and the Redis backend over a fake answers the
// same as memory.
import { describe, expect, it } from 'vitest';

import {
  SESSIONS_PER_DECK_MAX,
  SESSIONS_PER_IDENTITY_MAX,
  SESSION_BINDING_TTL_MS,
  memorySessionDirectory,
  redisSessionDirectory,
} from './sessions';
import type { SessionBinding, SessionDirectory } from './sessions';
import { viewScopeOf, visibleSessions } from './sessions.server';
import type { StudioSession } from '@turboslide/agent/http/sessions';
import type { Scope } from '@turboslide/schema/access';

import type { RequestIdentity } from './auth/identity';

const T0 = Date.parse('2026-09-13T10:00:00.000Z');
const at = (ms: number): string => new Date(T0 + ms).toISOString();

function binding(id: string, identity: string, deckId = 'q4-review', now = at(0)): SessionBinding {
  return {
    id,
    deckId,
    owner: 'editor',
    identity,
    kind: 'anonymous',
    attachedAt: now,
    lastSeenAt: now,
  };
}

function fakeKv(): { call: (command: string, ...args: (string | number)[]) => Promise<unknown> } {
  const store = new Map<string, string>();
  return {
    async call(command, ...args) {
      if (command === 'GET') return store.get(String(args[0])) ?? null;
      if (command === 'SET') {
        store.set(String(args[0]), String(args[1]));
        return 'OK';
      }
      throw new Error(`unexpected ${command}`);
    },
  };
}

async function exercise(directory: SessionDirectory): Promise<void> {
  const me = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
  for (let i = 0; i < SESSIONS_PER_IDENTITY_MAX; i += 1) {
    expect(await directory.bind(binding(`s${i}`, me, `deck-${i % 3}`))).toEqual({ ok: true });
  }
  expect(await directory.bind(binding('one-more', me))).toEqual({
    ok: false,
    reason: 'identity',
    cap: SESSIONS_PER_IDENTITY_MAX,
  });
  // a re-attach under an id the directory holds is not a new page
  expect(await directory.bind(binding('s3', me, 'deck-0'))).toEqual({ ok: true });
  expect((await directory.forIdentity(me, at(0))).length).toBe(SESSIONS_PER_IDENTITY_MAX);
  // another identity fills a deck to its cap
  for (let i = 0; i < SESSIONS_PER_DECK_MAX; i += 1) {
    const ok = await directory.bind(
      binding(`d${i}`, `usr_${Math.floor(i / SESSIONS_PER_IDENTITY_MAX)}`, 'busy'),
    );
    expect(ok).toEqual({ ok: true });
  }
  expect(await directory.bind(binding('late', 'usr_late', 'busy'))).toEqual({
    ok: false,
    reason: 'deck',
    cap: SESSIONS_PER_DECK_MAX,
  });
  expect((await directory.forDeck('busy', at(0))).length).toBe(SESSIONS_PER_DECK_MAX);
  // a poll refreshes one binding; the rest expire past the TTL
  await directory.touch('s0', at(SESSION_BINDING_TTL_MS + 1000));
  const later = at(SESSION_BINDING_TTL_MS + 2000);
  expect((await directory.forIdentity(me, later)).map((row) => row.id)).toEqual(['s0']);
  expect(await directory.bind(binding('fresh', 'usr_late', 'busy', later))).toEqual({ ok: true });
  await directory.unbind('fresh');
  expect((await directory.forDeck('busy', later)).length).toBe(0);
}

describe('the session directory', () => {
  it('caps pages per identity and per deck, expires silent bindings, in memory', async () => {
    await exercise(memorySessionDirectory());
  });

  it('answers the same over Redis (a fake of GET and SET PX)', async () => {
    await exercise(redisSessionDirectory(fakeKv()));
  });
});

describe("an agent's reach over the attached pages (security hotfix H3)", () => {
  const page = (id: string, principalId?: string): StudioSession => ({
    id,
    deckId: 'q4-review',
    owner: 'editor',
    actions: ['view.goto'],
    ...(principalId === undefined ? {} : { principalId }),
    attachedAt: at(0),
    lastSeenAt: at(0),
    state: {},
  });
  const pages = [page('a', 'usr_alice'), page('b', 'usr_bob'), page('c')];
  const key = (
    owner: string,
    admin = false,
    scopes: Scope[] = ['read'],
  ): Pick<RequestIdentity, 'kind' | 'ctx'> => ({
    kind: 'agent',
    ctx: {
      principal: { id: owner, kind: 'account', admin },
      agent: { tokenId: 'tok_1', ownerId: owner, scopes, name: 'key' },
      linkGrants: [],
    },
  });

  it("lists and drives a key's own pages alone, and every page for the admin", () => {
    const alice = viewScopeOf({ identity: key('usr_alice'), caller: {} });
    expect(alice).toEqual({ allowed: true, principalId: 'usr_alice' });
    expect(visibleSessions(pages, alice).map((p) => p.id)).toEqual(['a']);
    /* an admin account's key needs the admin scope to reach other pages */
    const adminRead = viewScopeOf({ identity: key('usr_root', true), caller: {} });
    expect(visibleSessions(pages, adminRead).map((p) => p.id)).toEqual([]);
    const admin = viewScopeOf({ identity: key('usr_root', true, ['admin']), caller: {} });
    expect(visibleSessions(pages, admin).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    const bearer = viewScopeOf({
      identity: { kind: 'bootstrap', ctx: { principal: null, linkGrants: [] } },
      caller: {},
    });
    expect(visibleSessions(pages, bearer)).toHaveLength(3);
    /* no identity: the checkout's holder reaches every page, anyone else none */
    expect(
      visibleSessions(pages, viewScopeOf({ identity: null, caller: { admin: true } })),
    ).toHaveLength(3);
    expect(visibleSessions(pages, viewScopeOf({ identity: null, caller: {} }))).toEqual([]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { synthesizeLegacyRecord } from '@turboslide/identity/access';

import {
  ACCESS_RECORD_FILE,
  CAPABILITIES,
  DeniedError,
  anonymousContext,
  authorFor,
  authorize,
  authorizeMode,
  bindAuthorNamer,
  bindAuthorize,
  bootstrapAgentContext,
  boundDecide,
  capabilityForAction,
  carriesBootstrapToken,
  denialBody,
  fileRecordLoader,
  missingRecordMode,
  requestContext,
  roleOf,
  shadowStanding,
  withLinkGrants,
} from './authorize';
import type { AccessRecord, AuthContext, Capability } from './authorize';
import { studioSessionSecret } from './auth/middleware';
import { sealPrincipalCookie } from './auth/session';
import { setSecurityLogSink } from './log';
import type { SecurityLine } from './log';

// The server wrapper of gslides-parity SPEC-3 6.2 in shadow and enforce mode (11.5 R3) over the
// identity package's decide() (merge 1b, build-3/integrator.md section 4): the file record
// loader of a checkout, the request context from the bootstrap bearer or the sealed cookie, the
// server derived author (8.2), the shadow fallback role, and every denial as one log line. The
// matrix itself is pinned cell by cell in packages/identity/src/access.test.ts.

const OWNER: AuthContext = {
  principal: { id: 'usr_owner', kind: 'account', email: 'owner@example.test', admin: false },
  linkGrants: [],
};
const STRANGER: AuthContext = {
  principal: { id: 'anon_11111111-1111-4111-8111-111111111111', kind: 'anonymous', admin: false },
  linkGrants: [],
};

function restricted(): AccessRecord {
  return {
    ...synthesizeLegacyRecord('q4-review'),
    owner: 'usr_owner',
    createdBy: 'usr_owner',
    generalAccess: { mode: 'restricted', role: 'viewer' },
    links: [
      {
        id: 'lnk_view01',
        hash: `sha256:${'a'.repeat(64)}`,
        role: 'viewer',
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'usr_owner',
        revokedAt: null,
        expiresAt: null,
      },
    ],
    grants: [
      {
        principalId: 'usr_editor',
        email: null,
        role: 'editor',
        invitedBy: 'usr_owner',
        invitedAt: '2026-09-01T00:00:00Z',
        acceptedAt: '2026-09-01T00:00:00Z',
        expiresAt: null,
      },
    ],
  };
}

const lines: SecurityLine[] = [];
setSecurityLogSink((line) => lines.push(line));

afterEach(() => {
  lines.length = 0;
  bindAuthorize({
    decide: boundDecide,
    loadRecord: () => Promise.resolve(null),
    mode: () => 'shadow',
    now: () => Date.now(),
  });
  bindAuthorNamer(undefined);
});

describe('the mode', () => {
  it('is shadow by default and enforce only when spelled', () => {
    expect(authorizeMode({})).toBe('shadow');
    expect(authorizeMode({ TURBOSLIDE_AUTHORIZE: 'ENFORCE ' })).toBe('enforce');
    expect(authorizeMode({ TURBOSLIDE_AUTHORIZE: 'yes' })).toBe('shadow');
    expect(missingRecordMode({})).toBe('open');
    expect(missingRecordMode({ TURBOSLIDE_MISSING_RECORD: 'notFound' })).toBe('notFound');
  });
});

describe('the bound decide() (the identity package, SPEC-3 6.2)', () => {
  it('reads a missing record as open: editor with the owner rows withheld; nobody may read it and nothing else', () => {
    expect(boundDecide(null, STRANGER, 'write')).toMatchObject({ ok: true, role: 'editor' });
    expect(boundDecide(null, STRANGER, 'remove')).toMatchObject({ ok: false, status: 403 });
    // the focus round (the enforce preview; packages/identity/src/access.ts decide()): a caller with
    // no identity at all (a browser's very first request, before the cookie the answer mints) reads
    // an open deck as its general access role, the way the same caller reads it one request later
    // with the cookie; before, the first visit to /deck/<id> of an open deck answered You need
    // access and the reload answered the deck. Every write, and every read of a restricted or link
    // mode deck, still needs an identity and stays 401 for nobody.
    expect(boundDecide(null, anonymousContext(), 'read')).toMatchObject({
      ok: true,
      role: 'editor',
      via: 'open',
    });
    expect(boundDecide(null, anonymousContext(), 'write')).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(boundDecide(restricted(), anonymousContext(), 'read')).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('gives a stranger one 404 on a restricted deck and the owner everything', () => {
    const record = restricted();
    for (const capability of CAPABILITIES) {
      expect(boundDecide(record, STRANGER, capability)).toMatchObject({ ok: false, status: 404 });
      expect(boundDecide(record, OWNER, capability)).toMatchObject({ ok: true, role: 'owner' });
    }
  });

  it('gives the bootstrap bearer the admin role', () => {
    const record = restricted();
    expect(boundDecide(record, bootstrapAgentContext('token'), 'remove')).toEqual({
      ok: true,
      role: 'owner',
      via: 'admin',
    });
    expect(boundDecide(null, bootstrapAgentContext('localhost'), 'transfer')).toMatchObject({
      ok: true,
      via: 'admin',
    });
  });
});

describe('the file record loader (a checkout, SPEC-3 6.9)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'turboslide-authz-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('answers null for a deck without a record and the validated record when one exists', async () => {
    process.env.TURBOSLIDE_ROOT = tmp;
    try {
      const dir = join(tmp, 'decks', 'q4-review', '.turboslide');
      mkdirSync(dir, { recursive: true });
      expect(await fileRecordLoader('q4-review')).toBeNull();
      const record = { ...restricted(), assetKey: 'abcdefghijklmnopqrstuv' };
      writeFileSync(join(dir, 'access.json'), JSON.stringify(record));
      expect(ACCESS_RECORD_FILE).toBe(join('.turboslide', 'access.json'));
      const loaded = await fileRecordLoader('q4-review');
      expect(loaded?.owner).toBe('usr_owner');
      expect(loaded?.generalAccess.mode).toBe('restricted');
      writeFileSync(join(dir, 'access.json'), JSON.stringify({ owner: 3 }));
      await expect(fileRecordLoader('q4-review')).rejects.toThrow(TypeError);
      expect(await fileRecordLoader('not a slug!')).toBeNull();
    } finally {
      delete process.env.TURBOSLIDE_ROOT;
    }
  });
});

describe('authorize() in shadow and enforce mode (SPEC-3 11.5 R3)', () => {
  it('logs a denial and lets the call proceed in shadow mode, with the denial attached', async () => {
    bindAuthorize({ loadRecord: () => Promise.resolve(restricted()), mode: () => 'shadow' });
    const decision = await authorize(STRANGER, 'q4-review', 'write', {
      action: 'slide.update',
      transport: 'window',
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.shadow).toEqual({ status: 404, code: 'not_found' });
      // the floor of the focus round (docs/FOCUS.md rank 1): a stranger on a restricted deck is
      // handed the viewer role in shadow mode, never the editor the parity rounds let through
      expect(decision.role).toBe('viewer');
      expect(decision.via).toBe('open');
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'authorize.deny',
      status: 404,
      reason: 'not_found',
      shadow: true,
      deckId: 'q4-review',
      action: 'slide.update',
      capability: 'write',
      identity: STRANGER.principal?.id,
      transport: 'window',
    });
    const allowed = await authorize(OWNER, 'q4-review', 'remove');
    expect(allowed).toEqual({ ok: true, role: 'owner', via: 'owner' });
    expect(lines).toHaveLength(1);
  });

  it('refuses in enforce mode with the status of the decision and one log line', async () => {
    bindAuthorize({ loadRecord: () => Promise.resolve(restricted()), mode: () => 'enforce' });
    const denied = await authorize(STRANGER, 'q4-review', 'read');
    expect(denied).toEqual({ ok: false, status: 404, code: 'not_found' });
    const editor: AuthContext = {
      principal: { id: 'usr_editor', kind: 'account', admin: false },
      linkGrants: [],
    };
    const forbidden = await authorize(editor, 'q4-review', 'remove');
    expect(forbidden).toMatchObject({ ok: false, status: 403, code: 'forbidden' });
    if (!forbidden.ok) {
      expect(denialBody(forbidden, 'remove')).toEqual({ error: 'forbidden', capability: 'remove' });
      expect(denialBody(denied as typeof forbidden, 'read')).toEqual({ error: 'not_found' });
    }
    expect(lines.map((line) => line.shadow)).toEqual([false, false]);
    expect(await authorize(anonymousContext(), 'q4-review', 'read')).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
    });
  });

  it('treats a loader failure as a denial: logged, 404 in enforce mode, through in shadow mode', async () => {
    bindAuthorize({
      loadRecord: () => Promise.reject(new TypeError('bad json')),
      mode: () => 'enforce',
    });
    expect(await authorize(OWNER, 'q4-review', 'read')).toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
    });
    expect(lines[0]).toMatchObject({ event: 'authorize.error', reason: 'TypeError' });
    bindAuthorize({ mode: () => 'shadow' });
    const through = await authorize(OWNER, 'q4-review', 'read');
    expect(through.ok).toBe(true);
  });

  it('uses the bound decide() and never writes an address into the log', async () => {
    bindAuthorize({
      decide: () => ({ ok: false, status: 403, code: 'forbidden', capability: 'write' }),
      mode: () => 'enforce',
    });
    const leaky: AuthContext = {
      principal: { id: 'someone@example.test', kind: 'account', admin: false },
      linkGrants: [],
    };
    expect(await authorize(leaky, 'q4-review', 'write')).toMatchObject({ status: 403 });
    expect(lines[0]?.identity).toBe('[redacted]');
    expect(JSON.stringify(lines)).not.toContain('example.test');
  });
});

describe('the shadow fallback role', () => {
  it('reads a missing record as the open editor and a restricted record by standing', () => {
    expect(roleOf(null, STRANGER)).toEqual({ role: 'editor', via: 'open' });
    expect(roleOf(restricted(), STRANGER)).toBeNull();
    expect(roleOf(restricted(), OWNER)).toEqual({ role: 'owner', via: 'owner' });
    expect(roleOf(restricted(), anonymousContext())).toBeNull();
  });

  it('hands a caller with no standing the viewer floor, and every other caller their standing (docs/FOCUS.md rank 1)', async () => {
    expect(shadowStanding(null, STRANGER)).toEqual({ role: 'editor', via: 'open' });
    expect(shadowStanding(restricted(), STRANGER)).toEqual({ role: 'viewer', via: 'open' });
    expect(shadowStanding(restricted(), anonymousContext())).toEqual({
      role: 'viewer',
      via: 'open',
    });
    expect(shadowStanding(restricted(), OWNER)).toEqual({ role: 'owner', via: 'owner' });
    const viewerByLink: AuthContext = {
      ...STRANGER,
      linkGrants: [{ linkId: 'lnk_view01', deckId: 'q4-review', role: 'viewer' }],
    };
    expect(shadowStanding(restricted(), viewerByLink)).toEqual({ role: 'viewer', via: 'link' });
    // through authorize(): the viewer who changed /deck/ to /edit/ is refused `write` and handed
    // the viewer role the record grants, so the editor opens in Viewing mode (audit-present row
    // 29); the stranger is handed the floor (row 26); the editor refused `remove` keeps `editor`
    bindAuthorize({ loadRecord: () => Promise.resolve(restricted()), mode: () => 'shadow' });
    const viewer = await authorize(viewerByLink, 'q4-review', 'write');
    expect(viewer).toMatchObject({ ok: true, role: 'viewer', via: 'link' });
    const stranger = await authorize(STRANGER, 'q4-review', 'read');
    expect(stranger).toMatchObject({ ok: true, role: 'viewer', via: 'open' });
    const editor: AuthContext = {
      principal: { id: 'usr_editor', kind: 'account', admin: false },
      linkGrants: [],
    };
    const refusedRemove = await authorize(editor, 'q4-review', 'remove');
    expect(refusedRemove).toMatchObject({ ok: true, role: 'editor', via: 'grant' });
    expect(lines.map((line) => line.shadow)).toEqual([true, true, true]);
  });
});

describe('the request context and the derived author (SPEC-3 8.2)', () => {
  it('is the stranger outside a request and with no cookie, the admin agent with the bearer, the cookie principal otherwise', async () => {
    expect(await requestContext()).toEqual(anonymousContext());
    const bare = new Request('http://localhost:4333/x');
    expect(await requestContext(bare)).toEqual(anonymousContext());
    process.env.TURBOSLIDE_TOKEN = 'fake-bootstrap-token-for-the-test';
    try {
      const bearer = new Request('http://localhost:4333/x', {
        headers: {
          authorization: 'Bearer fake-bootstrap-token-for-the-test',
          'x-turboslide-author': 'agent:run-7',
        },
      });
      expect(carriesBootstrapToken(bearer)).toBe(true);
      const agent = await requestContext(bearer);
      expect(agent.agent).toMatchObject({
        tokenId: 'bootstrap',
        scopes: ['admin'],
        runId: 'run-7',
      });
      const wrong = new Request('http://localhost:4333/x', {
        headers: { authorization: 'Bearer fake-bootstrap-token-for-the-tesT' },
      });
      expect(carriesBootstrapToken(wrong)).toBe(false);
    } finally {
      delete process.env.TURBOSLIDE_TOKEN;
    }
    // sealed under the process secret the middleware resolves (the file or the derived one)
    const sealed = await sealPrincipalCookie(STRANGER.principal!.id, studioSessionSecret());
    const withCookie = new Request('http://localhost:4333/x', {
      headers: { cookie: `__Host-ts_id=${sealed}` },
    });
    const ctx = await requestContext(withCookie);
    expect(ctx.principal?.id).toBe(STRANGER.principal!.id);
    expect(ctx.agent).toBeUndefined();
  });

  it('loads the link grants of a cookie principal for the server functions, and nothing for a stranger or a bearer (SPEC-3 6.4)', async () => {
    const grants = [{ linkId: 'lnk_view01', deckId: 'q4-review', role: 'viewer' as const }];
    const calls: string[] = [];
    const load = async (id: string) => {
      calls.push(id);
      return grants;
    };
    const loaded = await withLinkGrants(STRANGER, load);
    expect(loaded.linkGrants).toEqual(grants);
    expect(calls).toEqual([STRANGER.principal!.id]);
    /* the grants make the difference between 404 and the viewer role on a restricted deck */
    bindAuthorize({ loadRecord: () => Promise.resolve(restricted()), mode: () => 'enforce' });
    expect(await authorize(loaded, 'q4-review', 'read')).toEqual({
      ok: true,
      role: 'viewer',
      via: 'link',
    });
    expect(await authorize(STRANGER, 'q4-review', 'read')).toMatchObject({
      ok: false,
      status: 404,
    });
    /* a context that carries grants, a stranger and a bearer are not loaded again */
    expect(await withLinkGrants(loaded, load)).toBe(loaded);
    expect(await withLinkGrants(anonymousContext(), load)).toEqual(anonymousContext());
    const bearer = bootstrapAgentContext('token');
    expect(await withLinkGrants(bearer, load)).toBe(bearer);
    expect(calls).toHaveLength(1);
    /* a loader that finds nothing leaves the context as it was */
    expect(await withLinkGrants(STRANGER, async () => [])).toBe(STRANGER);
  });

  it('derives the author from the identity, never from the body', () => {
    const anon = authorFor(STRANGER, { kind: 'human', name: 'kevin' });
    expect(anon.kind).toBe('human');
    expect(anon.principalId).toBe(STRANGER.principal!.id);
    expect(anon.name).not.toBe('kevin');
    expect(anon.name.length).toBeGreaterThan(0);
    const agent = authorFor(bootstrapAgentContext('token', 'run-7'));
    expect(agent).toEqual({
      kind: 'agent',
      name: 'agent',
      runId: 'run-7',
      principalId: 'agent:bootstrap',
    });
    expect(authorFor(anonymousContext(), { kind: 'human', name: 'studio' })).toEqual({
      kind: 'human',
      name: 'studio',
    });
    bindAuthorNamer(() => 'Maya');
    expect(authorFor(OWNER).name).toBe('Maya');
    expect(JSON.stringify(authorFor(OWNER))).not.toContain('@');
  });

  it('DeniedError carries the 6.2 body as its message and the status', () => {
    const error = new DeniedError(403, { error: 'forbidden', capability: 'write' });
    expect(error.status).toBe(403);
    expect(JSON.parse(error.message)).toEqual({ error: 'forbidden', capability: 'write' });
  });
});

describe('capabilityForAction (SPEC-3 6.2 per route, section 12 per action)', () => {
  it('names the capability each action needs on its deck', () => {
    const expected: Record<string, Capability | null> = {
      'deck.remove': 'remove',
      'deck.trash': 'trash',
      'deck.restore': 'restore',
      'deck.copy': 'copy',
      'deck.rename': 'rename',
      'deck.publish': 'publish',
      'deck.unpublish': 'publish',
      'deck.list': null,
      'deck.create': null,
      'share.settings': 'settings',
      'share.transferOwnership': 'transfer',
      'share.get': 'read',
      'share.createLink': 'share',
      'share.requestAccess': null,
      'comment.list': 'readComments',
      'comment.get': 'readComments',
      'comment.link': 'readComments',
      'comment.add': 'comment',
      'comment.resolve': 'comment',
      'activity.list': 'history',
      'version.list': 'history',
      'version.diff': 'history',
      'presence.follow': 'follow',
      'presence.list': 'presence',
      'export.run': 'export',
      'build.run': 'export',
      'account.me': null,
      'notification.list': null,
      'admin.flag': null,
      'slide.update': 'write',
      'deck.info': 'read',
      'not.an.action': 'read',
    };
    for (const [id, capability] of Object.entries(expected))
      expect(capabilityForAction(id), id).toBe(capability);
  });
});

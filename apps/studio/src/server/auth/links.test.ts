import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { tokenHash } from '@turboslide/identity/access';
import { memoryPrincipalStore, newPrincipalRecord } from '@turboslide/identity/principal';
import { newDeckRecord } from '@turboslide/schema/access';
import type { AccessRecord } from '@turboslide/schema/access';

import type {
  IdentityHooks,
  IdentityRuntime,
  RequestIdentity,
  ShareLinkLookupOptions,
} from './identity.ts';
import {
  exchangeShareToken,
  fileLinkLookup,
  findLinkInRecord,
  isNavigation,
  landingPath,
  notNavigationSentence,
  readAccessRecordFile,
} from './links.ts';

const ANON = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const REVOKED = 'ZyXwVuTsRqPoNmLkJiHgFe';
const NOW = new Date('2026-09-13T12:00:00.000Z');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

function record(): AccessRecord {
  const base = newDeckRecord('q4-review', 'usr_owner', 'aaaaaaaaaaaaaaaaaaaaaa', NOW.toISOString());
  return {
    ...base,
    generalAccess: { mode: 'link', role: 'viewer' },
    links: [
      {
        id: 'lnk_viewer1',
        hash: tokenHash(TOKEN),
        role: 'viewer',
        createdAt: NOW.toISOString(),
        createdBy: 'usr_owner',
        revokedAt: null,
        expiresAt: null,
      },
      {
        id: 'lnk_revoked',
        hash: tokenHash(REVOKED),
        role: 'editor',
        createdAt: NOW.toISOString(),
        createdBy: 'usr_owner',
        revokedAt: NOW.toISOString(),
        expiresAt: null,
      },
    ],
  };
}

function navigation(headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:4332/s/${TOKEN}`, {
    headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', ...headers },
  });
}

function runtimeWith(): { runtime: IdentityRuntime; hooks: IdentityHooks } {
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
  const runtime = { principals: memoryPrincipalStore(), hooks } as unknown as IdentityRuntime;
  return { runtime, hooks };
}

function anonymousIdentity(principalId = ANON): RequestIdentity {
  return {
    kind: 'anonymous',
    ctx: { principal: { id: principalId, kind: 'anonymous', admin: false }, linkGrants: [] },
    principalId,
    author: { kind: 'human', name: 'Ink 100', principalId },
    session: null,
    account: null,
    agent: null,
    bearer: { kind: 'none' },
    minted: null,
    record: null,
  };
}

describe('the navigation rule and the landing', () => {
  test('a top level navigation and a request without fetch metadata pass; fetches do not', () => {
    expect(isNavigation(navigation())).toBe(true);
    expect(isNavigation(new Request('http://localhost:4332/s/x'))).toBe(true);
    expect(
      isNavigation(
        new Request('http://localhost:4332/s/x', { headers: { 'sec-fetch-mode': 'cors' } }),
      ),
    ).toBe(false);
    expect(
      isNavigation(
        new Request('http://localhost:4332/s/x', { headers: { 'sec-fetch-mode': 'no-cors' } }),
      ),
    ).toBe(false);
    expect(
      isNavigation(
        new Request('http://localhost:4332/s/x', {
          headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
        }),
      ),
    ).toBe(false);
    expect(
      isNavigation(
        new Request('http://localhost:4332/s/x', {
          headers: {
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
            'sec-fetch-site': 'cross-site',
          },
        }),
      ),
    ).toBe(true);
  });

  test("a Node fetch is never a navigation: undici stamps sec-fetch-mode cors over a caller's navigate (VERIFICATION-3 finding 18)", async () => {
    // the header set undici produces when a script asks for a navigation through fetch()
    const stamped = new Request('http://localhost:4332/s/x', {
      headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' },
    });
    expect(isNavigation(stamped)).toBe(false);
    expect(notNavigationSentence(stamped)).toBe(
      'Share links open by a top level navigation. This request carried Sec-Fetch-Mode cors with Sec-Fetch-Dest document, which the exchange refuses. Open the address in a browser tab.',
    );
    // curl with a browser's headers is a navigation
    expect(
      isNavigation(
        new Request('http://localhost:4332/s/x', {
          headers: {
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
          },
        }),
      ),
    ).toBe(true);
    // a value that is not a token is named "other", never echoed
    expect(
      notNavigationSentence(
        new Request('http://localhost:4332/s/x', { headers: { 'sec-fetch-mode': 'x"y<z' } }),
      ),
    ).toContain('Sec-Fetch-Mode other with Sec-Fetch-Dest none');
    // the live fact: fetch() against a local listener arrives with sec-fetch-mode cors
    const seen: Record<string, string> = {};
    const server = createServer((req, res) => {
      for (const [name, value] of Object.entries(req.headers))
        if (typeof value === 'string' && name.startsWith('sec-fetch')) seen[name] = value;
      res.statusCode = 204;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      await fetch(`http://127.0.0.1:${port}/s/x`, {
        headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(seen['sec-fetch-mode']).toBe('cors');
    expect(isNavigation(new Request('http://localhost:4332/s/x', { headers: seen }))).toBe(false);
  });

  test('a viewer lands on /deck, a commenter and an editor on /edit (0.13)', () => {
    expect(landingPath('q4', 'viewer')).toBe('/deck/q4');
    expect(landingPath('q4', 'commenter')).toBe('/edit/q4');
    expect(landingPath('q4', 'editor')).toBe('/edit/q4');
  });
});

describe('the record lookup', () => {
  test('finds a live link by its hash and never a revoked or expired one', () => {
    const rec = record();
    expect(findLinkInRecord(rec, tokenHash(TOKEN), NOW)).toEqual({
      deckId: 'q4-review',
      linkId: 'lnk_viewer1',
      role: 'viewer',
    });
    expect(findLinkInRecord(rec, tokenHash(REVOKED), NOW)).toBeNull();
    expect(findLinkInRecord(rec, tokenHash('nope'), NOW)).toBeNull();
    const expired = {
      ...rec,
      links: [{ ...rec.links[0]!, expiresAt: '2026-09-13T11:00:00.000Z' }],
    };
    expect(findLinkInRecord(expired, tokenHash(TOKEN), NOW)).toBeNull();
  });

  test('reads a deck folder record from either path and skips a foreign file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-links-'));
    dirs.push(dir);
    const deck = join(dir, 'q4-review');
    mkdirSync(join(deck, '.turboslide'), { recursive: true });
    writeFileSync(join(deck, '.turboslide', 'access.json'), JSON.stringify(record()));
    expect(readAccessRecordFile(deck)?.deckId).toBe('q4-review');
    const other = join(dir, 'other');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'access.json'), '{"not": "a record"}');
    expect(readAccessRecordFile(other)).toBeNull();
    expect(readAccessRecordFile(join(dir, 'missing'))).toBeNull();
    const lookup = fileLinkLookup(
      () =>
        Promise.resolve([
          { deckId: 'other', dir: other },
          { deckId: 'q4-review', dir: deck },
        ]),
      () => NOW,
    );
    return Promise.all([
      expect(lookup(tokenHash(TOKEN), { fresh: true })).resolves.toMatchObject({
        linkId: 'lnk_viewer1',
      }),
      expect(lookup(tokenHash(REVOKED), { fresh: true })).resolves.toBeNull(),
    ]);
  });
});

describe('the exchange', () => {
  test('writes the grant on the principal record and redirects with no token in the address', async () => {
    const { runtime } = runtimeWith();
    await runtime.principals.put(newPrincipalRecord(ANON, NOW));
    const asked: (ShareLinkLookupOptions | undefined)[] = [];
    const lookup = (hash: string, options?: ShareLinkLookupOptions) => {
      asked.push(options);
      return Promise.resolve(findLinkInRecord(record(), hash, NOW));
    };
    const outcome = await exchangeShareToken(TOKEN, navigation(), {
      runtime,
      identity: anonymousIdentity(),
      lookup,
      now: NOW,
    });
    expect(outcome).toEqual({
      kind: 'redirect',
      location: '/deck/q4-review',
      grant: { linkId: 'lnk_viewer1', deckId: 'q4-review', role: 'viewer' },
    });
    // the exchange reads past any record cache: a mint seconds old counts on every instance
    expect(asked).toEqual([{ fresh: true }]);
    const stored = await runtime.principals.get(ANON, NOW);
    expect(stored?.linkGrants).toEqual([
      { linkId: 'lnk_viewer1', deckId: 'q4-review', role: 'viewer' },
    ]);
    // a second exchange of the same link replaces the grant, never doubles it
    await exchangeShareToken(TOKEN, navigation(), {
      runtime,
      identity: anonymousIdentity(),
      lookup,
      now: NOW,
    });
    expect((await runtime.principals.get(ANON, NOW))?.linkGrants).toHaveLength(1);
  });

  test('a fetch, a malformed token, a dead link and a cookieless request are refused in words', async () => {
    const { runtime } = runtimeWith();
    const lookup = (hash: string) => Promise.resolve(findLinkInRecord(record(), hash, NOW));
    const deps = { runtime, identity: anonymousIdentity(), lookup, now: NOW };
    expect(
      await exchangeShareToken(
        TOKEN,
        new Request('http://localhost:4332/s/x', { headers: { 'sec-fetch-mode': 'cors' } }),
        deps,
      ),
    ).toEqual({ kind: 'not_navigation' });
    expect(await exchangeShareToken('short', navigation(), deps)).toEqual({ kind: 'not_found' });
    expect(await exchangeShareToken(REVOKED, navigation(), deps)).toEqual({ kind: 'not_found' });
    const stranger: RequestIdentity = {
      ...anonymousIdentity(),
      kind: 'none',
      principalId: null,
      ctx: { principal: null, linkGrants: [] },
    };
    expect(await exchangeShareToken(TOKEN, navigation(), { ...deps, identity: stranger })).toEqual({
      kind: 'no_cookie',
    });
    expect(await runtime.principals.get(ANON, NOW)).toBeNull();
  });

  test('an account also records the grant on its index through the hook', async () => {
    const { runtime, hooks } = runtimeWith();
    const seen: unknown[] = [];
    hooks.onLinkGrant = (principalId, grant) => {
      seen.push([principalId, grant]);
      return Promise.resolve();
    };
    const account: RequestIdentity = {
      ...anonymousIdentity('usr_maya'),
      kind: 'account',
      ctx: { principal: { id: 'usr_maya', kind: 'account', admin: false }, linkGrants: [] },
    };
    const editorRecord = {
      ...record(),
      links: [{ ...record().links[0]!, role: 'editor' as const }],
    };
    const outcome = await exchangeShareToken(TOKEN, navigation(), {
      runtime,
      identity: account,
      lookup: (hash) => Promise.resolve(findLinkInRecord(editorRecord, hash, NOW)),
      now: NOW,
    });
    expect(outcome).toMatchObject({ kind: 'redirect', location: '/edit/q4-review' });
    expect(seen).toEqual([
      ['usr_maya', { linkId: 'lnk_viewer1', deckId: 'q4-review', role: 'editor' }],
    ]);
    expect((await runtime.principals.get('usr_maya', NOW))?.linkGrants).toHaveLength(1);
  });
});

// Cycle 2 (VERIFICATION.md pass 2 F-share-404): the grant lands where every instance reads it as
// well as on this instance's principal record; a failure of that second write never fails the
// exchange.
describe('the grant across instances (cycle 2)', () => {
  const lookup = async (hash: string) => findLinkInRecord(record(), hash, NOW);

  test('notes the grant with the principal id, the link and the stamp for an anonymous visitor', async () => {
    const { runtime } = runtimeWith();
    const noted: { principalId: string; grant: unknown; now: string }[] = [];
    const outcome = await exchangeShareToken(TOKEN, navigation(), {
      runtime,
      identity: anonymousIdentity(),
      lookup,
      now: NOW,
      noteGrant: async (principalId, grant, now) => {
        noted.push({ principalId, grant, now });
      },
    });
    expect(outcome.kind).toBe('redirect');
    expect(noted).toEqual([
      {
        principalId: ANON,
        grant: { linkId: 'lnk_viewer1', deckId: 'q4-review', role: 'viewer' },
        now: NOW.toISOString(),
      },
    ]);
    const held = await runtime.principals.get(ANON);
    expect(held?.linkGrants).toEqual([
      { linkId: 'lnk_viewer1', deckId: 'q4-review', role: 'viewer' },
    ]);
  });

  test('a failing note leaves the redirect and the record grant standing', async () => {
    const { runtime } = runtimeWith();
    const outcome = await exchangeShareToken(TOKEN, navigation(), {
      runtime,
      identity: anonymousIdentity(),
      lookup,
      now: NOW,
      noteGrant: async () => {
        throw new Error('the index is unreachable');
      },
    });
    expect(outcome.kind).toBe('redirect');
    expect((await runtime.principals.get(ANON))?.linkGrants).toHaveLength(1);
  });

  test('a dead token notes nothing', async () => {
    const { runtime } = runtimeWith();
    let calls = 0;
    const outcome = await exchangeShareToken(REVOKED, navigation(), {
      runtime,
      identity: anonymousIdentity(),
      lookup,
      now: NOW,
      noteGrant: async () => {
        calls += 1;
      },
    });
    expect(outcome.kind).toBe('not_found');
    expect(calls).toBe(0);
  });
});

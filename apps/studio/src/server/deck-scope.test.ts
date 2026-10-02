import { describe, expect, test } from 'vitest';

import type { AccessRecord, AuthContext, LinkGrant } from '@turboslide/identity/access';
import type { DeckHead } from '@turboslide/store/templates';

import { listingScope, ownStanding, principalOf, scopeHeads } from './deck-scope';

// The deck listing scoped to the viewer (docs/NEXT.md 3.2 H2): who lists what, and which decks a
// principal's own listing keeps, read against records written the way the studio writes them.

const NOW = Date.parse('2026-10-01T12:00:00.000Z');
const ANON = 'anon_11111111-1111-4111-8111-111111111111';
const OTHER = 'anon_22222222-2222-4222-8222-222222222222';
const ACCOUNT = 'usr_kaiaccount000000000000000000000';

function head(id: string): DeckHead {
  return {
    id,
    title: id,
    slides: 1,
    sections: 1,
    revision: 1,
    updatedAt: '2026-10-01T11:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
  };
}

function record(deckId: string, patch: Partial<AccessRecord> = {}): AccessRecord {
  return {
    schemaVersion: 1,
    deckId,
    owner: OTHER,
    pendingOwner: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    createdBy: OTHER,
    assetKey: 'e2eAssetKey0000000000a',
    generalAccess: { mode: 'restricted', role: 'viewer' },
    links: [],
    publish: null,
    grants: [],
    requests: [],
    settings: {
      editorsCanShare: true,
      viewersCanDownload: true,
      viewersCanSeeComments: false,
      showNamesToLinkVisitors: false,
      allowHtmlBlocks: false,
    },
    revision: 0,
    ...patch,
  };
}

const anonymous: AuthContext = {
  principal: { id: ANON, kind: 'anonymous', admin: false },
  linkGrants: [],
};
const account: AuthContext = {
  principal: {
    id: ACCOUNT,
    kind: 'account',
    email: 'kai@example.test',
    admin: false,
    aliases: [ANON],
  },
  linkGrants: [],
};

describe('who lists what', () => {
  test('a checkout lists every deck for every caller', () => {
    expect(
      listingScope({ kind: 'anonymous', ctx: anonymous }, { fileStore: true, page: true }),
    ).toEqual({ kind: 'every' });
  });
  test('the bootstrap bearer and the checkout holder list every deck', () => {
    for (const kind of ['bootstrap', 'checkout'] as const)
      expect(
        listingScope(
          { kind, ctx: { principal: null, linkGrants: [] } },
          { fileStore: false, page: false },
        ).kind,
      ).toBe('every');
  });
  test("an anonymous visitor's page reads the browser's record; the action reads the principal's own", () => {
    expect(
      listingScope({ kind: 'anonymous', ctx: anonymous }, { fileStore: false, page: true }).kind,
    ).toBe('browser');
    expect(
      listingScope({ kind: 'anonymous', ctx: anonymous }, { fileStore: false, page: false }).kind,
    ).toBe('own');
  });
  test('a signed in person lists their own; an admin account carries the flag', () => {
    const own = listingScope({ kind: 'account', ctx: account }, { fileStore: false, page: true });
    expect(own).toEqual({ kind: 'own', ctx: account, admin: false });
    const admin: AuthContext = {
      ...account,
      principal: { ...account.principal!, admin: true },
    };
    expect(listingScope({ kind: 'account', ctx: admin }, { fileStore: false, page: true })).toEqual(
      { kind: 'own', ctx: admin, admin: true },
    );
  });
  test('a request with no identity lists nothing', () => {
    expect(
      listingScope(
        { kind: 'none', ctx: { principal: null, linkGrants: [] } },
        { fileStore: false, page: false },
      ),
    ).toEqual({ kind: 'none' });
  });
  test("an API key lists its owner's decks", () => {
    const key: AuthContext = {
      principal: null,
      agent: { tokenId: 'tok_1', ownerId: ACCOUNT, scopes: ['read'], name: 'ci' },
      linkGrants: [],
    };
    expect(principalOf(key)?.id).toBe(ACCOUNT);
    expect(listingScope({ kind: 'agent', ctx: key }, { fileStore: false, page: false }).kind).toBe(
      'own',
    );
  });
});

describe("a principal's own and shared decks", () => {
  test('the owner, through the account or an anonymous id linked to it', () => {
    expect(ownStanding(record('a', { owner: ACCOUNT }), account, [], NOW)).toEqual({
      role: 'owner',
    });
    expect(ownStanding(record('b', { owner: ANON }), account, [], NOW)).toEqual({ role: 'owner' });
    expect(ownStanding(record('c'), account, [], NOW)).toBeNull();
  });
  test('a live grant by id or by the verified address; an expired one is not', () => {
    const grant = {
      principalId: ACCOUNT,
      email: null,
      role: 'commenter' as const,
      invitedBy: OTHER,
      invitedAt: '2026-10-01T10:00:00.000Z',
      acceptedAt: '2026-10-01T10:00:00.000Z',
      expiresAt: null,
    };
    expect(ownStanding(record('d', { grants: [grant] }), account, [], NOW)).toEqual({
      role: 'commenter',
    });
    const pending = { ...grant, principalId: null, email: 'KAI@example.test', acceptedAt: null };
    expect(ownStanding(record('e', { grants: [pending] }), account, [], NOW)).toEqual({
      role: 'commenter',
    });
    const expired = { ...grant, expiresAt: '2026-09-30T00:00:00.000Z' };
    expect(ownStanding(record('f', { grants: [expired] }), account, [], NOW)).toBeNull();
  });
  test('an exchanged live link; a revoked link is not', () => {
    const link = {
      id: 'lnk_000001',
      hash: `sha256:${'0'.repeat(64)}`,
      role: 'viewer' as const,
      createdAt: '2026-10-01T10:00:00.000Z',
      createdBy: OTHER,
      revokedAt: null,
      expiresAt: null,
    };
    const held: LinkGrant[] = [{ linkId: 'lnk_000001', deckId: 'g', role: 'viewer' }];
    expect(ownStanding(record('g', { links: [link] }), anonymous, held, NOW)).toEqual({
      role: 'viewer',
    });
    const revoked = { ...link, revokedAt: '2026-10-01T11:00:00.000Z' };
    expect(ownStanding(record('g', { links: [revoked] }), anonymous, held, NOW)).toBeNull();
  });
  test("the legacy open mode and the admin flag alone make no deck anyone's", () => {
    const open = record('h', { generalAccess: { mode: 'open', role: 'editor' } });
    expect(ownStanding(open, anonymous, [], NOW)).toBeNull();
    expect(ownStanding(null, anonymous, [], NOW)).toBeNull();
    const admin: AuthContext = { ...account, principal: { ...account.principal!, admin: true } };
    expect(ownStanding(record('i'), admin, [], NOW)).toBeNull();
    /* a viewer grant on an open editor deck still lists: the open mode never hides the grant */
    const grant = {
      principalId: ACCOUNT,
      email: null,
      role: 'viewer' as const,
      invitedBy: OTHER,
      invitedAt: '2026-10-01T10:00:00.000Z',
      acceptedAt: '2026-10-01T10:00:00.000Z',
      expiresAt: null,
    };
    expect(
      ownStanding(
        record('j', { generalAccess: { mode: 'open', role: 'editor' }, grants: [grant] }),
        account,
        [],
        NOW,
      ),
    ).toEqual({ role: 'viewer' });
  });
});

describe('scopeHeads', () => {
  const records = new Map<string, AccessRecord | null>([
    ['mine', record('mine', { owner: ANON })],
    ['theirs', record('theirs')],
    ['legacy', null],
    ['linked', record('linked')],
  ]);
  const heads = ['mine', 'theirs', 'legacy', 'linked', 'unreadable'].map(head);
  const deps = {
    readRecord: async (id: string) => {
      if (id === 'unreadable') throw new Error('the store did not answer');
      return records.get(id) ?? null;
    },
    now: () => NOW,
  };

  test('every keeps every head; browser and none keep nothing and read nothing', async () => {
    let reads = 0;
    const counting = { ...deps, readRecord: async (id: string) => (reads++, deps.readRecord(id)) };
    expect((await scopeHeads(heads, { kind: 'every' }, counting)).map((r) => r.id)).toEqual(
      heads.map((h) => h.id),
    );
    expect(await scopeHeads(heads, { kind: 'browser' }, counting)).toEqual([]);
    expect(await scopeHeads(heads, { kind: 'none' }, counting)).toEqual([]);
    expect(reads).toBe(0);
  });

  test("own keeps the principal's decks in order, with the index's link grants", async () => {
    const rows = await scopeHeads(
      heads,
      { kind: 'own', ctx: anonymous, admin: false },
      {
        ...deps,
        readRecord: async (id: string) =>
          id === 'linked'
            ? record('linked', {
                links: [
                  {
                    id: 'lnk_000009',
                    hash: `sha256:${'1'.repeat(64)}`,
                    role: 'commenter',
                    createdAt: '2026-10-01T10:00:00.000Z',
                    createdBy: OTHER,
                    revokedAt: null,
                    expiresAt: null,
                  },
                ],
              })
            : deps.readRecord(id),
        linkGrants: async () => [{ linkId: 'lnk_000009', deckId: 'linked', role: 'commenter' }],
      },
    );
    expect(rows.map((r) => [r.id, r.role, r.owner])).toEqual([
      ['mine', 'owner', ANON],
      ['linked', 'commenter', OTHER],
    ]);
  });

  test('a record that cannot be read lists nothing, and at most eight are read at once', async () => {
    let inFlight = 0;
    let most = 0;
    const many = Array.from({ length: 40 }, (_, i) => head(`deck-${i}`));
    const rows = await scopeHeads(
      many,
      { kind: 'own', ctx: anonymous, admin: false },
      {
        readRecord: async (id) => {
          inFlight += 1;
          most = Math.max(most, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 2));
          inFlight -= 1;
          if (id === 'deck-3') throw new Error('refused');
          return record(id, { owner: id === 'deck-5' || id === 'deck-3' ? ANON : OTHER });
        },
        now: () => NOW,
      },
    );
    expect(rows.map((r) => r.id)).toEqual(['deck-5']);
    expect(most).toBeLessThanOrEqual(8);
  });
});

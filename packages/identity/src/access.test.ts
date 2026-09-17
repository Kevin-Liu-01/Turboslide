import { describe, expect, test } from 'vitest';

import type {
  AccessRecord,
  AuthContext,
  Capability,
  Decision,
  Principal,
  Role,
  Scope,
} from './access.ts';
import {
  CAPABILITIES,
  DEFAULT_ACCESS_SETTINGS,
  SCOPES_FOR,
  decide,
  roleAllows,
  synthesizeLegacyRecord,
  tokenHash,
} from './access.ts';

// The matrix of research 09 2.1 with `readComments` (SPEC-3 6.2), one assertion per cell for the
// owner, a grant at each role, a link visitor at each link role, the legacy open deck at each
// role, and an agent at each scope; then the settings switches, the denial shapes and the
// synthesized legacy record.

const NOW = '2026-09-13T12:00:00.000Z';
const OWNER = 'usr_owner';
const OWNER_PRINCIPAL: Principal = { id: OWNER, kind: 'account', admin: false };

function principal(id: string, kind: 'anonymous' | 'account' = 'account'): Principal {
  return { id, kind, admin: false };
}

function ctx(p: Principal | null, extra: Partial<AuthContext> = {}): AuthContext {
  return { principal: p, linkGrants: [], ...extra };
}

function record(overrides: Partial<AccessRecord> = {}): AccessRecord {
  return {
    schemaVersion: 1,
    deckId: 'q4-review',
    owner: OWNER,
    pendingOwner: null,
    createdAt: NOW,
    createdBy: OWNER,
    generalAccess: { mode: 'restricted', role: 'viewer' },
    links: [],
    publish: null,
    grants: [],
    requests: [],
    settings: { ...DEFAULT_ACCESS_SETTINGS },
    revision: 1,
    ...overrides,
  };
}

function grant(principalId: string, role: Role): AccessRecord['grants'][number] {
  if (role === 'owner') throw new Error('an owner is not a grant');
  return {
    principalId,
    email: null,
    role,
    invitedBy: OWNER,
    invitedAt: NOW,
    acceptedAt: NOW,
    expiresAt: null,
  };
}

function link(
  id: string,
  role: Exclude<Role, 'owner'>,
  extra: Partial<AccessRecord['links'][number]> = {},
) {
  return {
    id,
    hash: tokenHash(`token-${id}`),
    role,
    createdAt: NOW,
    createdBy: OWNER,
    revokedAt: null,
    expiresAt: null,
    ...extra,
  };
}

const hashToken = (token: string): string => tokenHash(token);

function ok(d: Decision): boolean {
  return d.ok;
}

// The expected cells for a grant holder (and the owner) under the default settings: the columns
// of 09 2.1 in this order.
const GRANT_CELLS: Record<
  Capability,
  [owner: boolean, editor: boolean, commenter: boolean, viewer: boolean]
> = {
  read: [true, true, true, true],
  readSkipped: [true, true, true, false],
  readNotes: [true, true, false, false],
  readComments: [true, true, true, false],
  comment: [true, true, true, false],
  write: [true, true, false, false],
  history: [true, true, false, false],
  export: [true, true, true, true],
  exportNotes: [true, true, false, false],
  share: [true, true, false, false],
  settings: [true, false, false, false],
  rename: [true, true, false, false],
  copy: [true, true, true, true],
  trash: [true, true, false, false],
  restore: [true, true, false, false],
  remove: [true, false, false, false],
  publish: [true, true, false, false],
  transfer: [true, false, false, false],
  presence: [true, true, true, true],
  follow: [true, true, false, false],
};

// A link visitor at a link role: the role's cells minus the sharing, trash, publish, transfer and
// follow cells (09 2.1 "Link visitor" column).
const NOT_BY_LINK = new Set<Capability>([
  'share',
  'settings',
  'trash',
  'restore',
  'remove',
  'publish',
  'transfer',
  'follow',
]);

describe('the matrix, one assertion per cell', () => {
  test('the owner and grants at each role', () => {
    const rec = record({
      grants: [grant('usr_ed', 'editor'), grant('usr_co', 'commenter'), grant('usr_vi', 'viewer')],
    });
    const holders: Array<[Role, Principal]> = [
      ['owner', OWNER_PRINCIPAL],
      ['editor', principal('usr_ed')],
      ['commenter', principal('usr_co')],
      ['viewer', principal('usr_vi')],
    ];
    for (const capability of CAPABILITIES) {
      const cells = GRANT_CELLS[capability];
      holders.forEach(([role, p], column) => {
        const d = decide(rec, ctx(p), capability, { now: NOW });
        expect(ok(d), `${role} ${capability}`).toBe(cells[column] ?? false);
        if (d.ok) {
          expect(d.role).toBe(role);
          expect(d.via).toBe(role === 'owner' ? 'owner' : 'grant');
        } else {
          expect(d.status).toBe(403);
        }
      });
    }
  });

  test('a link visitor at each link role, attributed to the anonymous principal', () => {
    const rec = record({
      generalAccess: { mode: 'link', role: 'viewer' },
      links: [link('lnk_e', 'editor'), link('lnk_c', 'commenter'), link('lnk_v', 'viewer')],
    });
    const anon = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');
    const columns: Array<[Exclude<Role, 'owner'>, string, number]> = [
      ['editor', 'lnk_e', 1],
      ['commenter', 'lnk_c', 2],
      ['viewer', 'lnk_v', 3],
    ];
    for (const capability of CAPABILITIES) {
      for (const [role, linkId, column] of columns) {
        const c = ctx(anon, { linkGrants: [{ linkId, deckId: 'q4-review', role }] });
        const d = decide(rec, c, capability, { now: NOW });
        const expected = (GRANT_CELLS[capability][column] ?? false) && !NOT_BY_LINK.has(capability);
        expect(ok(d), `link ${role} ${capability}`).toBe(expected);
        if (d.ok) expect(d).toEqual({ ok: true, role, via: 'link' });
        else expect(d.status).toBe(403);
      }
    }
  });

  test('the legacy open deck at each role, and nothing by address when restricted or link', () => {
    const anon = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');
    const roles: Array<[Exclude<Role, 'owner'>, number]> = [
      ['editor', 1],
      ['commenter', 2],
      ['viewer', 3],
    ];
    for (const capability of CAPABILITIES) {
      for (const [role, column] of roles) {
        const rec = record({ generalAccess: { mode: 'open', role } });
        const d = decide(rec, ctx(anon), capability, { now: NOW });
        const expected = (GRANT_CELLS[capability][column] ?? false) && !NOT_BY_LINK.has(capability);
        expect(ok(d), `open ${role} ${capability}`).toBe(expected);
        if (d.ok) expect(d).toEqual({ ok: true, role, via: 'open' });
      }
      expect(decide(record(), ctx(anon), capability, { now: NOW })).toEqual({
        ok: false,
        status: 404,
        code: 'not_found',
      });
      const linkOnly = record({
        generalAccess: { mode: 'link', role: 'editor' },
        links: [link('lnk_e', 'editor')],
      });
      expect(decide(linkOnly, ctx(anon), capability, { now: NOW })).toEqual({
        ok: false,
        status: 404,
        code: 'not_found',
      });
    }
  });

  test("an agent gets its owner's role intersected with its scopes, never transfer or follow", () => {
    const rec = record({ grants: [grant('usr_ed', 'editor')] });
    const scopes: Scope[] = ['read', 'comment', 'write', 'export', 'share', 'admin'];
    for (const capability of CAPABILITIES) {
      for (const scope of scopes) {
        const agentCtx: AuthContext = {
          principal: principal('usr_ed'),
          agent: { tokenId: 'key_1', ownerId: 'usr_ed', scopes: [scope], name: 'bot' },
          linkGrants: [],
        };
        const d = decide(rec, agentCtx, capability, { now: NOW });
        const ownerCell = GRANT_CELLS[capability][1] ?? false;
        const expected = ownerCell && SCOPES_FOR[capability].includes(scope);
        expect(ok(d), `agent ${scope} ${capability}`).toBe(expected);
        if (d.ok) expect(d).toEqual({ ok: true, role: 'editor', via: 'agent' });
        else expect(d.status).toBe(403);
      }
      // The owner's own key with every scope still cannot transfer or be followed.
      const ownerKey: AuthContext = {
        principal: OWNER_PRINCIPAL,
        agent: { tokenId: 'key_2', ownerId: OWNER, scopes: [...scopes], name: 'bot' },
        linkGrants: [],
      };
      const d = decide(rec, ownerKey, capability, { now: NOW });
      expect(ok(d), `owner key ${capability}`).toBe(
        capability !== 'transfer' && capability !== 'follow',
      );
    }
    // An agent context with no principal resolves to its owner.
    const bare: AuthContext = {
      principal: null,
      agent: { tokenId: 'key_3', ownerId: 'usr_ed', scopes: ['write'], name: 'bot' },
      linkGrants: [],
    };
    expect(decide(rec, bare, 'write', { now: NOW })).toEqual({
      ok: true,
      role: 'editor',
      via: 'agent',
    });
  });

  test('the deployment admin may do everything with via admin', () => {
    const admin: Principal = { id: 'usr_admin', kind: 'account', admin: true };
    for (const capability of CAPABILITIES) {
      expect(decide(record(), ctx(admin), capability, { now: NOW })).toEqual({
        ok: true,
        role: 'owner',
        via: 'admin',
      });
    }
  });
});

describe('the settings switches', () => {
  const co = principal('usr_co');
  const vi = principal('usr_vi');
  const ed = principal('usr_ed');
  const base = {
    grants: [grant('usr_ed', 'editor'), grant('usr_co', 'commenter'), grant('usr_vi', 'viewer')],
  };

  test('viewersCanDownload gates export and copy for commenters and viewers', () => {
    const off = record({
      ...base,
      settings: { ...DEFAULT_ACCESS_SETTINGS, viewersCanDownload: false },
    });
    for (const capability of ['export', 'copy'] as const) {
      expect(decide(off, ctx(co), capability, { now: NOW }).ok).toBe(false);
      expect(decide(off, ctx(vi), capability, { now: NOW }).ok).toBe(false);
      expect(decide(off, ctx(ed), capability, { now: NOW }).ok).toBe(true);
      expect(decide(off, ctx(OWNER_PRINCIPAL), capability, { now: NOW }).ok).toBe(true);
    }
    expect(roleAllows('viewer', 'export', DEFAULT_ACCESS_SETTINGS)).toBe(true);
  });

  test('viewersCanSeeComments gates readComments for viewers only', () => {
    const on = record({
      ...base,
      settings: { ...DEFAULT_ACCESS_SETTINGS, viewersCanSeeComments: true },
    });
    expect(decide(record(base), ctx(vi), 'readComments', { now: NOW }).ok).toBe(false);
    expect(decide(on, ctx(vi), 'readComments', { now: NOW }).ok).toBe(true);
    expect(decide(on, ctx(vi), 'comment', { now: NOW }).ok).toBe(false);
    expect(decide(record(base), ctx(co), 'readComments', { now: NOW }).ok).toBe(true);
  });

  test('editorsCanShare gates share for editors and never publish', () => {
    const off = record({
      ...base,
      settings: { ...DEFAULT_ACCESS_SETTINGS, editorsCanShare: false },
    });
    expect(decide(off, ctx(ed), 'share', { now: NOW }).ok).toBe(false);
    expect(decide(off, ctx(ed), 'publish', { now: NOW }).ok).toBe(true);
    expect(decide(off, ctx(OWNER_PRINCIPAL), 'share', { now: NOW }).ok).toBe(true);
  });
});

describe('expiry, revocation and the highest standing', () => {
  const anon = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');

  test('an expired grant and a dead link give nothing', () => {
    const rec = record({
      grants: [{ ...grant('usr_late', 'editor'), expiresAt: '2026-09-01T00:00:00.000Z' }],
      links: [
        link('lnk_revoked', 'editor', { revokedAt: '2026-09-02T00:00:00.000Z' }),
        link('lnk_expired', 'editor', { expiresAt: '2026-09-02T00:00:00.000Z' }),
        link('lnk_future', 'viewer', { expiresAt: '2027-01-01T00:00:00.000Z' }),
      ],
    });
    expect(decide(rec, ctx(principal('usr_late')), 'read', { now: NOW }).ok).toBe(false);
    for (const linkId of ['lnk_revoked', 'lnk_expired', 'lnk_unknown']) {
      const c = ctx(anon, { linkGrants: [{ linkId, deckId: 'q4-review', role: 'editor' }] });
      expect(decide(rec, c, 'read', { now: NOW })).toEqual({
        ok: false,
        status: 404,
        code: 'not_found',
      });
    }
    const alive = ctx(anon, {
      linkGrants: [{ linkId: 'lnk_future', deckId: 'q4-review', role: 'viewer' }],
    });
    expect(decide(rec, alive, 'read', { now: NOW })).toEqual({
      ok: true,
      role: 'viewer',
      via: 'link',
    });
    // A link grant for another deck does not carry over.
    const other = ctx(anon, {
      linkGrants: [{ linkId: 'lnk_future', deckId: 'other', role: 'viewer' }],
    });
    expect(decide(rec, other, 'read', { now: NOW }).ok).toBe(false);
  });

  test('a pending email grant binds nobody yet', () => {
    const rec = record({
      grants: [
        {
          ...grant('usr_x', 'editor'),
          principalId: null,
          email: 'lee@example.com',
          acceptedAt: null,
        },
      ],
    });
    expect(decide(rec, ctx(principal('usr_x')), 'read', { now: NOW }).ok).toBe(false);
  });

  test('the stored role of the link wins over the role the session remembers', () => {
    const rec = record({ links: [link('lnk_v', 'viewer')] });
    const c = ctx(anon, { linkGrants: [{ linkId: 'lnk_v', deckId: 'q4-review', role: 'editor' }] });
    expect(decide(rec, c, 'write', { now: NOW }).ok).toBe(false);
    expect(decide(rec, c, 'read', { now: NOW })).toEqual({ ok: true, role: 'viewer', via: 'link' });
  });

  test('the highest role wins across sources', () => {
    const rec = record({
      generalAccess: { mode: 'open', role: 'viewer' },
      grants: [grant('usr_co', 'commenter')],
      links: [link('lnk_e', 'editor')],
    });
    const c = ctx(principal('usr_co'), {
      linkGrants: [{ linkId: 'lnk_e', deckId: 'q4-review', role: 'editor' }],
    });
    expect(decide(rec, c, 'write', { now: NOW })).toEqual({
      ok: true,
      role: 'editor',
      via: 'link',
    });
    // Read prefers the grant when the roles tie.
    const tie = record({
      generalAccess: { mode: 'open', role: 'commenter' },
      grants: [grant('usr_co', 'commenter')],
    });
    expect(decide(tie, ctx(principal('usr_co')), 'read', { now: NOW })).toEqual({
      ok: true,
      role: 'commenter',
      via: 'grant',
    });
  });

  test('follow needs an account with a grant or the ownership', () => {
    const rec = record({
      grants: [grant('usr_ed', 'editor'), grant(anon.id, 'editor')],
      generalAccess: { mode: 'open', role: 'editor' },
    });
    expect(decide(rec, ctx(principal('usr_ed')), 'follow', { now: NOW }).ok).toBe(true);
    expect(decide(rec, ctx(anon), 'follow', { now: NOW }).ok).toBe(false);
    expect(decide(rec, ctx(principal('usr_other')), 'follow', { now: NOW }).ok).toBe(false);
    const anonOwner = record({ owner: anon.id });
    expect(decide(anonOwner, ctx(anon), 'write', { now: NOW })).toEqual({
      ok: true,
      role: 'owner',
      via: 'owner',
    });
    expect(decide(anonOwner, ctx(anon), 'follow', { now: NOW }).ok).toBe(false);
  });
});

describe('the published player', () => {
  const stranger = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');
  const published = record({
    publish: {
      hash: hashToken('pub-token'),
      publishedAt: NOW,
      publishedBy: OWNER,
      revokedAt: null,
    },
  });

  test('a live token reads and nothing else', () => {
    const c = ctx(stranger, { publishToken: 'pub-token' });
    expect(decide(published, c, 'read', { now: NOW })).toEqual({
      ok: true,
      role: 'viewer',
      via: 'publish',
    });
    expect(decide(published, c, 'readComments', { now: NOW })).toEqual({
      ok: false,
      status: 403,
      code: 'forbidden',
      capability: 'readComments',
    });
    expect(decide(published, c, 'presence', { now: NOW }).ok).toBe(false);
  });

  test('a wrong token is a missing deck and a revoked one is gone', () => {
    expect(
      decide(published, ctx(stranger, { publishToken: 'nope' }), 'read', { now: NOW }),
    ).toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
    });
    const revoked = record({ publish: { ...published.publish!, revokedAt: NOW } });
    expect(
      decide(revoked, ctx(stranger, { publishToken: 'pub-token' }), 'read', { now: NOW }),
    ).toEqual({
      ok: false,
      status: 410,
      code: 'gone',
    });
  });
});

describe('the denial shapes and the legacy record', () => {
  test('no principal and no agent is 401 on a restricted deck, and on every capability but read of an open one', () => {
    expect(decide(record(), ctx(null), 'read')).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
    });
    /* the focus round (the enforce preview): a caller with no identity yet reads an open deck as
       its general access role, the way the same caller reads it with the cookie the response mints;
       a link mode deck without a token, and every write, stay 401 */
    const open = record({ generalAccess: { mode: 'open', role: 'viewer' } });
    expect(decide(open, ctx(null), 'read')).toEqual({ ok: true, role: 'viewer', via: 'open' });
    expect(decide(open, ctx(null), 'write').ok).toBe(false);
    expect(decide(open, ctx(null), 'readNotes').ok).toBe(false);
    const link = record({ generalAccess: { mode: 'link', role: 'viewer' } });
    expect(decide(link, ctx(null), 'read')).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
    });
    /* a legacy deck with no record is the open editor deck: a read without identity is admitted */
    expect(decide(null, ctx(null), 'read', { now: NOW })).toMatchObject({ ok: true, via: 'open' });
    expect(decide(null, ctx(null), 'read', { now: NOW, missingRecord: 'notFound' }).ok).toBe(false);
  });

  test('a null record is the open editor deck until R8, then a 404', () => {
    const anon = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');
    expect(decide(null, ctx(anon), 'write')).toEqual({ ok: true, role: 'editor', via: 'open' });
    expect(decide(null, ctx(anon), 'read')).toEqual({ ok: true, role: 'editor', via: 'open' });
    expect(decide(null, ctx(anon), 'share').ok).toBe(false);
    expect(decide(null, ctx(anon), 'trash').ok).toBe(false);
    expect(decide(null, ctx(anon), 'remove').ok).toBe(false);
    expect(decide(null, ctx(anon), 'write', { missingRecord: 'notFound' })).toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
    });
    const legacy = synthesizeLegacyRecord('gt-brand', new Date(NOW));
    expect(legacy).toMatchObject({
      schemaVersion: 1,
      deckId: 'gt-brand',
      owner: null,
      createdBy: 'legacy',
      generalAccess: { mode: 'open', role: 'editor' },
      links: [],
      grants: [],
      publish: null,
      settings: DEFAULT_ACCESS_SETTINGS,
      revision: 0,
    });
    expect(legacy.createdAt).toBe(NOW);
  });

  test('a claimed legacy deck keeps viewing by address and stops editing', () => {
    const anon = principal('anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', 'anonymous');
    const claimed = record({ generalAccess: { mode: 'open', role: 'viewer' } });
    expect(decide(claimed, ctx(anon), 'read')).toEqual({ ok: true, role: 'viewer', via: 'open' });
    expect(decide(claimed, ctx(anon), 'write')).toEqual({
      ok: false,
      status: 403,
      code: 'forbidden',
      capability: 'write',
    });
    expect(decide(claimed, ctx(anon), 'readNotes').ok).toBe(false);
  });
});

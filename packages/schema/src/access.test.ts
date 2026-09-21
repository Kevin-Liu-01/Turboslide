// The access record (gslides-parity SPEC-3 6.1, 6.2, 16.6): the schema on the record of 09 1.1,
// the synthesized legacy record, the capability table `decide()` reads, the token scopes and the
// kill switch defaults.
import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  DEFAULT_ACCESS_SETTINGS,
  FLAG_DEFAULTS,
  FLAG_NAMES,
  REQUEST_ACCESS_ANSWER,
  ROLES,
  accessRecordSchema,
  capabilitiesForRole,
  grantIsLive,
  grantSchema,
  grantWhoSchema,
  legacyAssetKey,
  linkIsLive,
  maxRole,
  newDeckRecord,
  scopedCapabilities,
  synthesizeLegacyRecord,
  decisionSchema,
} from './access.ts';
import type { AccessRecord, Capability, Role } from './access.ts';

const NOW = '2026-09-13T10:00:00.000Z';
const HASH = `sha256:${'0'.repeat(64)}`;

/** The record of SPEC-3 6.1, as the fixture. */
export const RECORD: AccessRecord = {
  schemaVersion: 1,
  deckId: 'q4-review',
  owner: 'usr_01J8Z2KOWNER',
  pendingOwner: null,
  createdAt: NOW,
  createdBy: 'usr_01J8Z2KOWNER',
  assetKey: 'q4reviewAAAAAAAAAAAAAA',
  generalAccess: { mode: 'link', role: 'viewer' },
  links: [
    {
      id: 'lnk_01J8Z2KLINK',
      hash: HASH,
      role: 'viewer',
      createdAt: NOW,
      createdBy: 'usr_01J8Z2KOWNER',
      revokedAt: null,
      expiresAt: null,
      label: 'Prospect deck',
      useCount: 0,
    },
  ],
  publish: { hash: HASH, publishedAt: NOW, publishedBy: 'usr_01J8Z2KOWNER', revokedAt: null },
  grants: [
    {
      principalId: 'usr_02K8Z2KEDITOR',
      email: null,
      role: 'editor',
      invitedBy: 'usr_01J8Z2KOWNER',
      invitedAt: NOW,
      acceptedAt: NOW,
      expiresAt: null,
    },
    {
      principalId: null,
      email: 'lee@example.com',
      role: 'commenter',
      invitedBy: 'usr_01J8Z2KOWNER',
      invitedAt: NOW,
      acceptedAt: null,
      expiresAt: '2026-10-13T10:00:00.000Z',
      message: 'Please review slides 4 and 9',
    },
  ],
  requests: [
    {
      id: 'req_01J8Z2KREQ',
      principalId: 'anon_0f8fad5b-d9cb-469f-a165-70867728950e',
      email: 'sam@example.com',
      role: 'editor',
      message: 'I need to fix the pricing slide',
      askedAt: NOW,
      respondedAt: null,
    },
  ],
  settings: {
    editorsCanShare: true,
    viewersCanDownload: true,
    viewersCanSeeComments: false,
    showNamesToLinkVisitors: false,
    allowHtmlBlocks: false,
  },
  revision: 7,
};

describe('accessRecordSchema (SPEC-3 6.1)', () => {
  it('accepts the record of 6.1 and refuses a token, a bad hash and an unknown field', () => {
    expect(accessRecordSchema.safeParse(RECORD).success).toBe(true);
    const link = RECORD.links[0];
    if (link === undefined) throw new Error('fixture');
    expect(
      accessRecordSchema.safeParse({ ...RECORD, links: [{ ...link, hash: 'abcdef' }] }).success,
    ).toBe(false);
    expect(
      accessRecordSchema.safeParse({ ...RECORD, links: [{ ...link, token: 'x'.repeat(22) }] })
        .success,
    ).toBe(false);
    expect(accessRecordSchema.safeParse({ ...RECORD, assetKey: 'short' }).success).toBe(false);
    expect(
      accessRecordSchema.safeParse({ ...RECORD, generalAccess: { mode: 'public', role: 'viewer' } })
        .success,
    ).toBe(false);
    expect(
      accessRecordSchema.safeParse({ ...RECORD, settings: { ...RECORD.settings, extra: true } })
        .success,
    ).toBe(false);
  });

  it('refuses a grant that names both a principal and an email, or neither', () => {
    const grant = RECORD.grants[0];
    if (grant === undefined) throw new Error('fixture');
    expect(grantSchema.safeParse(grant).success).toBe(true);
    expect(grantSchema.safeParse({ ...grant, email: 'a@b.co' }).success).toBe(false);
    expect(grantSchema.safeParse({ ...grant, principalId: null }).success).toBe(false);
    expect(grantSchema.safeParse({ ...grant, role: 'owner' }).success).toBe(false);
    expect(grantWhoSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(grantWhoSchema.safeParse({ principalId: 'usr_1', email: 'a@b.co' }).success).toBe(false);
  });

  it('synthesizes the legacy record: unowned, open to editing, revision 0 (0.14)', () => {
    const legacy = synthesizeLegacyRecord('gt-brand', NOW);
    expect(accessRecordSchema.safeParse(legacy).success).toBe(true);
    expect(legacy).toMatchObject({
      owner: null,
      generalAccess: { mode: 'open', role: 'editor' },
      links: [],
      grants: [],
      publish: null,
      settings: DEFAULT_ACCESS_SETTINGS,
      revision: 0,
    });
    expect(legacyAssetKey('gt-brand')).toHaveLength(22);
    expect(legacyAssetKey('gt-brand')).toBe(legacyAssetKey('gt-brand'));
    const fresh = newDeckRecord('q4-review', 'usr_01J8Z2KOWNER', 'q4reviewAAAAAAAAAAAAAA', NOW);
    expect(accessRecordSchema.safeParse(fresh).success).toBe(true);
    expect(fresh.generalAccess).toEqual({ mode: 'restricted', role: 'viewer' });
    expect(fresh.owner).toBe('usr_01J8Z2KOWNER');
  });

  it('knows a live link and a live grant', () => {
    const link = RECORD.links[0];
    const grant = RECORD.grants[1];
    if (link === undefined || grant === undefined) throw new Error('fixture');
    expect(linkIsLive(link, NOW)).toBe(true);
    expect(linkIsLive({ ...link, revokedAt: NOW }, NOW)).toBe(false);
    expect(linkIsLive({ ...link, expiresAt: '2026-09-13T09:00:00.000Z' }, NOW)).toBe(false);
    expect(grantIsLive(grant, NOW)).toBe(true);
    expect(grantIsLive(grant, '2026-11-01T00:00:00.000Z')).toBe(false);
    expect(maxRole('viewer', 'editor')).toBe('editor');
    expect(maxRole('owner', 'commenter')).toBe('owner');
    expect(REQUEST_ACCESS_ANSWER).toBe('If this presentation exists, its owner has been asked.');
  });
});

/**
 * The matrix of SPEC-3 6.2 (09 2.1 with readComments), one row per capability, the roles that
 * hold it under the default settings and under the settings that widen or narrow it.
 */
const MATRIX: Record<
  Capability,
  { roles: Role[]; when?: Partial<typeof DEFAULT_ACCESS_SETTINGS>; then?: Role[] }
> = {
  read: { roles: ['owner', 'editor', 'commenter', 'viewer'] },
  readSkipped: { roles: ['owner', 'editor', 'commenter'] },
  readNotes: { roles: ['owner', 'editor'] },
  readComments: {
    roles: ['owner', 'editor', 'commenter'],
    when: { viewersCanSeeComments: true },
    then: ['owner', 'editor', 'commenter', 'viewer'],
  },
  comment: { roles: ['owner', 'editor', 'commenter'] },
  write: { roles: ['owner', 'editor'] },
  history: { roles: ['owner', 'editor'] },
  export: {
    roles: ['owner', 'editor', 'commenter', 'viewer'],
    when: { viewersCanDownload: false },
    then: ['owner', 'editor'],
  },
  exportNotes: { roles: ['owner', 'editor'] },
  share: { roles: ['owner', 'editor'], when: { editorsCanShare: false }, then: ['owner'] },
  settings: { roles: ['owner'] },
  rename: { roles: ['owner', 'editor'] },
  copy: {
    roles: ['owner', 'editor', 'commenter', 'viewer'],
    when: { viewersCanDownload: false },
    then: ['owner', 'editor'],
  },
  trash: { roles: ['owner', 'editor'] },
  restore: { roles: ['owner', 'editor'] },
  remove: { roles: ['owner'] },
  publish: { roles: ['owner', 'editor'] },
  transfer: { roles: ['owner'] },
  presence: { roles: ['owner', 'editor', 'commenter', 'viewer'] },
  follow: { roles: ['owner', 'editor'] },
};

describe('decisionSchema (SPEC-3 6.2, 6.4)', () => {
  it('parses the ok branch and the four refusals, the 403 with its capability and the 410 for a revoked publish token', () => {
    expect(decisionSchema.parse({ ok: true, role: 'editor', via: 'grant' })).toEqual({
      ok: true,
      role: 'editor',
      via: 'grant',
    });
    expect(decisionSchema.parse({ ok: false, status: 401, code: 'unauthorized' }).ok).toBe(false);
    expect(
      decisionSchema.parse({ ok: false, status: 403, code: 'forbidden', capability: 'write' }),
    ).toEqual({ ok: false, status: 403, code: 'forbidden', capability: 'write' });
    expect(decisionSchema.parse({ ok: false, status: 403, code: 'forbidden' }).ok).toBe(false);
    expect(decisionSchema.parse({ ok: false, status: 404, code: 'not_found' }).ok).toBe(false);
    expect(decisionSchema.parse({ ok: false, status: 410, code: 'gone' }).ok).toBe(false);
    // a status and a code that do not belong together are refused
    expect(decisionSchema.safeParse({ ok: false, status: 403, code: 'not_found' }).success).toBe(
      false,
    );
    expect(decisionSchema.safeParse({ ok: false, status: 410, code: 'forbidden' }).success).toBe(
      false,
    );
  });
});

describe('capabilitiesForRole (SPEC-3 6.2)', () => {
  const cells = CAPABILITIES.flatMap((capability) =>
    ROLES.map((role) => [capability, role] as const),
  );

  it.each(cells)('%s for %s under the default settings', (capability, role) => {
    const expected = MATRIX[capability].roles.includes(role);
    expect(capabilitiesForRole(role, DEFAULT_ACCESS_SETTINGS).has(capability)).toBe(expected);
  });

  it('moves with the switches', () => {
    for (const capability of CAPABILITIES) {
      const row = MATRIX[capability];
      if (row.when === undefined || row.then === undefined) continue;
      const settings = { ...DEFAULT_ACCESS_SETTINGS, ...row.when };
      for (const role of ROLES) {
        expect(
          capabilitiesForRole(role, settings).has(capability),
          `${capability} for ${role} under ${JSON.stringify(row.when)}`,
        ).toBe(row.then.includes(role));
      }
    }
  });

  it('cuts an owner’s capabilities to a token’s scopes; transfer and follow never travel', () => {
    const owner = capabilitiesForRole('owner', DEFAULT_ACCESS_SETTINGS);
    expect([...scopedCapabilities(owner, ['read'])].sort()).toEqual(
      ['history', 'presence', 'read', 'readComments', 'readNotes', 'readSkipped'].sort(),
    );
    expect(scopedCapabilities(owner, ['comment']).has('comment')).toBe(true);
    expect(scopedCapabilities(owner, ['comment']).has('write')).toBe(false);
    expect(scopedCapabilities(owner, ['write']).has('write')).toBe(true);
    expect(scopedCapabilities(owner, ['share']).has('publish')).toBe(true);
    expect(scopedCapabilities(owner, ['admin']).has('remove')).toBe(true);
    const every = scopedCapabilities(owner, [
      'read',
      'comment',
      'write',
      'export',
      'share',
      'admin',
    ]);
    expect(every.has('transfer')).toBe(false);
    expect(every.has('follow')).toBe(false);
    // a viewer's token holds no more than the viewer
    expect(
      scopedCapabilities(capabilitiesForRole('viewer', DEFAULT_ACCESS_SETTINGS), ['write']).has(
        'write',
      ),
    ).toBe(false);
  });
});

describe('the kill switches (SPEC-3 8.12)', () => {
  it('lists the thirteen flags (the twelve of 8.12 and the assistant switch of docs/PRODUCT.md 6.3) with realtime off and every other on when Redis is unreachable', () => {
    expect(FLAG_NAMES).toHaveLength(13);
    expect(FLAG_DEFAULTS.realtime).toBe(false);
    for (const name of FLAG_NAMES)
      if (name !== 'realtime') expect(FLAG_DEFAULTS[name], name).toBe(true);
  });
});

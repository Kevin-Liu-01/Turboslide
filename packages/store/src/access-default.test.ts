import { describe, expect, it } from 'vitest';

import {
  SHARE_TOKEN_PATTERN,
  TOKEN_HASH_PATTERN,
  accessRecordSchema,
  legacyAssetKey,
  linkIsLive,
  newDeckRecord,
} from '@turboslide/schema/access';

import {
  GENERAL_LINK_LABEL,
  defaultGeneralAccessFor,
  mintedGeneralLink,
  newHostedDeckRecord,
} from './access-store.ts';

// The general access a deck created from `/new` starts with (the product round, docs/PRODUCT.md
// section 1's decision, question 10; the row share.dialog.co-edit-from-copied-link): Anyone with
// the link, Editor on a deployment with anonymous principals, restricted where people sign in.
// The word is `link` with one live general link minted in the record (the fix round; pass 1
// finding 1: `open` is the Share dialog's legacy row, which draws no access select and no link).

describe('the default general access of a new deck', () => {
  it('is Anyone with the link, Editor on a deployment with anonymous principals and restricted otherwise', () => {
    expect(defaultGeneralAccessFor({ anonymousPrincipals: true })).toEqual({
      mode: 'link',
      role: 'editor',
    });
    expect(defaultGeneralAccessFor({ anonymousPrincipals: false })).toEqual({
      mode: 'restricted',
      role: 'viewer',
    });
  });

  it('mints the general link with the record: a live editor link under the dialog’s label, a hash and never a token', () => {
    const now = '2026-09-19T12:00:00.000Z';
    const link = mintedGeneralLink('editor', 'anon_1', now);
    expect(link).toMatchObject({
      role: 'editor',
      createdAt: now,
      createdBy: 'anon_1',
      revokedAt: null,
      expiresAt: null,
      label: GENERAL_LINK_LABEL,
      useCount: 0,
    });
    expect(link.id).toMatch(/^lnk_[A-Za-z0-9_-]{16}$/);
    expect(link.hash).toMatch(TOKEN_HASH_PATTERN);
    expect(linkIsLive(link, now)).toBe(true);
    // no field of the link is a token (22 base64url characters)
    for (const value of Object.values(link))
      if (typeof value === 'string') expect(SHARE_TOKEN_PATTERN.test(value)).toBe(false);
    // two mints never share a hash or an id
    const again = mintedGeneralLink('editor', 'anon_1', now);
    expect(again.hash).not.toBe(link.hash);
    expect(again.id).not.toBe(link.id);
  });

  it('shapes the record as the schema’s new deck record with the deployment’s access, and validates', () => {
    const now = '2026-09-19T12:00:00.000Z';
    const key = legacyAssetKey('q4-review');
    const shared = newHostedDeckRecord('q4-review', 'anon_1', key, now, {
      anonymousPrincipals: true,
    });
    expect(accessRecordSchema.safeParse(shared).success).toBe(true);
    expect(shared.generalAccess).toEqual({ mode: 'link', role: 'editor' });
    expect(shared.owner).toBe('anon_1');
    expect(shared.revision).toBe(0);
    expect(shared.links).toHaveLength(1);
    expect(shared.links[0]).toMatchObject({
      role: 'editor',
      label: GENERAL_LINK_LABEL,
      createdBy: 'anon_1',
      revokedAt: null,
    });
    const restricted = newHostedDeckRecord('q4-review', 'acct_1', key, now, {
      anonymousPrincipals: false,
    });
    expect(restricted).toEqual(newDeckRecord('q4-review', 'acct_1', key, now));
    expect(restricted.links).toEqual([]);
  });
});

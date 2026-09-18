import { describe, expect, it, vi } from 'vitest';

import type { LinkGrant } from '@turboslide/identity/access';

import { linkGrantsFor } from './authorize';

// The link grants across instances (the focus round, cycle 2; VERIFICATION.md pass 2
// F-share-404): the exchange writes the grant on this instance's principal record and on the
// principal's deck index on the Blob store, and `authorize.ts` reads the union so a visitor a link
// admitted is the same person on every instance. The index is mocked here; its own reads and
// writes are pinned in packages/store/src/access-cache.test.ts (the proven read, the shared row).

const fromIndex = vi.fn<(principalId: string) => Promise<LinkGrant[]>>();
vi.mock('./access', () => ({
  linkGrantsFromIndex: (principalId: string) => fromIndex(principalId),
}));

const VIEW: LinkGrant = { linkId: 'lnk_view01', deckId: 'q4-review', role: 'viewer' };
const EDIT: LinkGrant = { linkId: 'lnk_edit01', deckId: 'q4-review', role: 'editor' };

describe('linkGrantsFor', () => {
  it('joins the record grants with the index grants, one entry per link id, the record first', async () => {
    fromIndex.mockResolvedValueOnce([VIEW, EDIT]);
    const grants = await linkGrantsFor('anon_a', { linkGrants: [VIEW] });
    expect(grants).toEqual([VIEW, EDIT]);
    expect(fromIndex).toHaveBeenCalledWith('anon_a');
  });

  it('answers the index grants alone for a principal this instance has no record of', async () => {
    fromIndex.mockResolvedValueOnce([EDIT]);
    expect(await linkGrantsFor('anon_b', null)).toEqual([EDIT]);
  });

  it('keeps the record grants when the index cannot be read, never adding a grant', async () => {
    fromIndex.mockRejectedValueOnce(new Error('blob unreachable'));
    expect(await linkGrantsFor('anon_c', { linkGrants: [VIEW] })).toEqual([VIEW]);
    fromIndex.mockRejectedValueOnce(new Error('blob unreachable'));
    expect(await linkGrantsFor('anon_d', null)).toEqual([]);
  });
});

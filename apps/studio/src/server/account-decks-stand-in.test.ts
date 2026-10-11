// Hardening HR-SD#1d, the sweep for the class of the verifier's findings: `account.decks` (the
// hosted deck index, start.ts binds `accountDecks` as the identity runtime's deckIndex hook)
// named the owner's principal id on every row of a deck shared with the caller, a viewer link's
// row included. The index, the head cache and the record are fakes over the hosted branch.
import { afterAll, describe, expect, it, vi } from 'vitest';

import { newDeckRecord } from '@turboslide/schema/access';
import type { DeckIndex } from '@turboslide/store/hosted';
import type { DeckHead } from '@turboslide/store/templates';

const OWNER = 'usr_owner01';
const VIEWER = 'anon_33333333-3333-4333-8333-333333333333';
const SHARED = 'q8wf2kzr0uyb3nxc5vlp1a7h2m';
const MINE = 'k3d9x2mbt7rq4zw1nyc8hv5p0e';
const AT = '2026-10-10T00:00:00.000Z';

const previous = process.env.TURBOSLIDE_DOWNLOAD_SECRET;
process.env.TURBOSLIDE_DOWNLOAD_SECRET = 'a-download-secret-for-tests-only-0123456789';

function head(id: string): DeckHead {
  return {
    id,
    title: id === SHARED ? 'Shared with the viewer' : 'The viewer’s own',
    slides: 1,
    sections: 1,
    revision: 1,
    createdAt: AT,
    updatedAt: AT,
  } as DeckHead;
}

const index: DeckIndex = {
  owned: [MINE],
  shared: [{ deckId: SHARED, role: 'viewer', since: AT }],
  recent: [
    { deckId: SHARED, at: AT },
    { deckId: MINE, at: AT },
  ],
  trashed: [],
};

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSelection: () => ({ kind: 'blob', reason: 'test', persistent: true, blob: true }),
}));
vi.mock('./access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  indexStore: async () => ({ read: async () => index }),
  headCache: async () => ({
    get: async (ids: readonly string[]) => new Map(ids.map((id) => [id, head(id)])),
    set: async () => undefined,
  }),
  effectiveAccess: async (deckId: string) =>
    newDeckRecord(deckId, deckId === SHARED ? OWNER : VIEWER, 'AbCdEfGhIjKlMnOpQrStUv', AT),
}));

const { accountDecks } = await import('./index');
const { standInFor } = await import('./stand-ins');

afterAll(() => {
  if (previous === undefined) delete process.env.TURBOSLIDE_DOWNLOAD_SECRET;
  else process.env.TURBOSLIDE_DOWNLOAD_SECRET = previous;
});

describe('account.decks rows of decks shared with the caller (HR-SD#1d sweep)', () => {
  it("name the owner by the owner's stand-in on that deck, and the caller's own rows by its id", async () => {
    for (const view of ['shared', 'recent'] as const) {
      const rows = await accountDecks({ principalId: VIEWER, admin: false }, view);
      const shared = rows.find((row) => row.id === SHARED);
      expect(shared?.owner, view).toBe(standInFor(SHARED, OWNER));
      expect(JSON.stringify(rows), view).not.toContain(OWNER);
      if (view === 'recent') expect(rows.find((row) => row.id === MINE)?.owner).toBe(VIEWER);
    }
  });
});

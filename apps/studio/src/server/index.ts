// The per identity deck index (gslides-parity SPEC-3 6.7, 2.2; MILESTONES-3 B2 day 5):
// `users/<principalId>/decks.json` (the Blob store) or `.turboslide/users/<principal>/decks.json`
// (a checkout, the tmp overlay) lists what a person owns, what is shared with them, what they
// opened recently and what they trashed, so `/decks` and `account.decks` never scan the store.
// The heads a row needs (title, counts, revision, times) come from the head cache the commit
// path refreshes, and from one listing of the collection for the ids the cache lacks. Framework
// free apart from the studio's root helpers.
import type { Role } from '@turboslide/schema/access';
import type { DeckHead as StoredHead } from '@turboslide/store/templates';
import { indexUpdates } from '@turboslide/store/hosted';
import type { DeckIndex } from '@turboslide/store/hosted';

import { effectiveAccess, headCache, indexStore, readAccess } from './access';
import { hostedDecks, storeSelection } from './root';

export type DeckView = 'owned' | 'shared' | 'recent' | 'trash' | 'all';

/** A row of `account.decks` (the schema's `deckHeadSchema`): the stored head with the owner and the caller's role (SPEC-3 6.7). */
export type DeckHead = StoredHead & { owner: string | null; role: Role };

/** The heads of these decks: the cache first, one listing for the rest, which refills the cache. */
export async function headsFor(deckIds: readonly string[]): Promise<Map<string, StoredHead>> {
  const cache = await headCache();
  const wanted = [...new Set(deckIds)];
  const found = wanted.length === 0 ? new Map<string, StoredHead>() : await cache.get(wanted);
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    const all = await hostedDecks().list({ includeTrashed: true });
    for (const head of all) {
      if (missing.includes(head.id)) {
        found.set(head.id, head);
        await cache.set(head).catch(() => undefined);
      }
    }
  }
  return found;
}

/** The commit path's refresh: the head after a write, so the next list needs no listing. */
export async function noteHead(head: StoredHead): Promise<void> {
  await (await headCache()).set(head).catch(() => undefined);
}

export async function touchRecent(
  principalId: string,
  deckId: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.recent(deckId, now));
}

export async function noteOwned(principalId: string, deckId: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.owned(deckId));
}

export async function noteUnowned(principalId: string, deckId: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.unowned(deckId));
}

export async function noteShared(
  principalId: string,
  deckId: string,
  role: 'viewer' | 'commenter' | 'editor',
  since: string,
  via?: 'grant' | 'link',
): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.shared(deckId, role, since, via));
}

export async function noteUnshared(principalId: string, deckId: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.unshared(deckId));
}

export async function noteTrashed(principalId: string, deckId: string, at: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.trashed(deckId, at));
}

export async function noteRestored(principalId: string, deckId: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.restored(deckId));
}

export async function noteRemoved(principalId: string, deckId: string): Promise<void> {
  await (await indexStore()).update(principalId, indexUpdates.removed(deckId));
  await (await headCache()).drop(deckId).catch(() => undefined);
}

function row(head: StoredHead, owner: string | null, role: Role): DeckHead {
  return { ...head, owner, role };
}

/**
 * `account.decks` (SPEC-3 6.7): the caller's rows per view. On a checkout every deck is the
 * folder holder's (09 1.6). Hosted, a view reads the index; an owned view with an empty index
 * falls back to the records that name the caller as owner, so a deck made before the index
 * existed still lists. `all` is the admin's: every deck with its owner.
 */
export async function accountDecks(
  caller: { principalId: string; admin: boolean },
  view: DeckView,
): Promise<DeckHead[]> {
  if (storeSelection().kind === 'file') {
    const heads = await hostedDecks().list({ includeTrashed: view === 'trash' || view === 'all' });
    return heads
      .filter((head) =>
        view === 'trash'
          ? head.trashedAt !== undefined
          : view === 'all'
            ? true
            : head.trashedAt === undefined,
      )
      .map((head) => row(head, caller.principalId, 'owner'));
  }
  if (view === 'all') {
    if (!caller.admin) throw new TypeError('the all view is the deployment admin’s');
    const heads = await hostedDecks().list({ includeTrashed: true });
    const out: DeckHead[] = [];
    for (const head of heads) {
      const record = await readAccess(head.id).catch(() => null);
      out.push(row(head, record?.owner ?? null, 'owner'));
    }
    return out;
  }
  const index: DeckIndex = await (await indexStore()).read(caller.principalId);
  let ids: { deckId: string; role: Role }[];
  switch (view) {
    case 'owned': {
      const owned = index.owned.filter((id) => !index.trashed.some((t) => t.deckId === id));
      if (owned.length === 0) {
        // the records are the truth when the index was never written for this principal
        const heads = await hostedDecks().list();
        for (const head of heads) {
          const record = await readAccess(head.id).catch(() => null);
          if (record?.owner === caller.principalId) owned.push(head.id);
        }
      }
      ids = owned.map((deckId) => ({ deckId, role: 'owner' as const }));
      break;
    }
    case 'shared':
      ids = index.shared.map((s) => ({ deckId: s.deckId, role: s.role }));
      break;
    case 'trash':
      ids = index.trashed.map((t) => ({ deckId: t.deckId, role: 'owner' as const }));
      break;
    case 'recent':
      ids = index.recent.map((r) => ({
        deckId: r.deckId,
        role: index.owned.includes(r.deckId)
          ? ('owner' as const)
          : (index.shared.find((s) => s.deckId === r.deckId)?.role ?? ('viewer' as const)),
      }));
      break;
  }
  const heads = await headsFor(ids.map((entry) => entry.deckId));
  const out: DeckHead[] = [];
  for (const entry of ids) {
    const head = heads.get(entry.deckId);
    if (head === undefined) continue;
    if (view !== 'trash' && head.trashedAt !== undefined) continue;
    const record = await effectiveAccess(entry.deckId).catch(() => null);
    out.push(row(head, record?.owner ?? null, entry.role));
  }
  return out;
}

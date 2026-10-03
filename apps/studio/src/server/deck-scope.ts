// The deck listing scoped to the viewer (docs/NEXT.md 3.2 H2; audit-auth finding 18,
// audit-brand-surfaces rank 1, audit-clutter 87 to 89). Before H2, `/decks` and the `deck.list`
// action answered every deck the store holds to every caller: a fresh anonymous browser on
// production read 147 cards with restricted titles among them, and `POST /api/actions/deck.list`
// answered 143 presentations. The rules here are the one answer both callers share:
//
// - The deployment's admin (the bootstrap bearer, a checkout's localhost holder, an account the
//   deployment names as admin) and every caller of a checkout's file store list the whole store:
//   on a checkout the holder of the folder owns every deck (research 09 1.6, server/index.ts).
// - A signed in person, and the owner of an API key, list the decks they own and the decks
//   shared with them: the record names them (or an anonymous id linked to their account) as the
//   owner, a live grant names them or their verified address, or they exchanged a live link of
//   the deck. A deck whose general access alone admits them (the legacy open mode) is neither.
// - An anonymous visitor's `/decks` reads this browser's Recent record alone (routes/-recent.ts):
//   the page asks the store for nothing, so a fresh browser lists no deck and costs no store read.
//   The `deck.list` action, which has no Recent record to read, answers the anonymous principal's
//   own and shared decks by the rule above.
//
// The record is read for each listed head (the access store's cache: 60 s on the file and tmp
// tiers, 5 s on the blob tier), at most eight at a time. The heads come from the collection's one
// listing, as before; the index object of Round 2 (docs/NEXT.md 4.2.2 fix 1) replaces that
// listing for every caller.
import type { AccessRecord, AuthContext, LinkGrant, Principal } from '@turboslide/identity/access';
import { standingOf } from '@turboslide/identity/access';
import type { Role } from '@turboslide/schema/access';
import type { DeckHead } from '@turboslide/store/templates';

/** How a listing is answered for one caller. */
export type ListingScope =
  /** every deck the store holds: the deployment's admin, or any caller of a checkout's file store */
  | { kind: 'every' }
  /** the decks the principal owns and the ones shared with it */
  | { kind: 'own'; ctx: AuthContext; admin: boolean }
  /** an anonymous visitor's page: this browser's Recent record, no store read */
  | { kind: 'browser' }
  /** no identity at all: nothing */
  | { kind: 'none' };

/** A listed head with the record's owner and the caller's role on it. */
export type ScopedHead = DeckHead & { owner: string | null; role: Role };

/** The facts of a request the scope is decided from (server/auth/identity.ts RequestIdentity). */
export type ScopeFacts = {
  kind: 'anonymous' | 'account' | 'agent' | 'bootstrap' | 'checkout' | 'none';
  ctx: AuthContext;
};

/**
 * The scope of a listing for a caller. `fileStore` is true on a checkout's file store. `page` is
 * true for `/decks` and the editor's Open and Import slides dialogs, where an anonymous visitor's
 * own decks come from this browser's Recent record; the action answers the principal's own.
 */
export function listingScope(
  facts: ScopeFacts,
  options: { fileStore: boolean; page: boolean },
): ListingScope {
  if (options.fileStore) return { kind: 'every' };
  if (facts.kind === 'bootstrap' || facts.kind === 'checkout') return { kind: 'every' };
  const principal = principalOf(facts.ctx);
  if (principal === null) return { kind: 'none' };
  const admin = facts.ctx.principal?.admin === true;
  if (facts.kind === 'anonymous' && options.page) return { kind: 'browser' };
  return { kind: 'own', ctx: facts.ctx, admin };
}

/** The principal `decide()` reads for a context: the session's, else an API key's owner. */
export function principalOf(ctx: AuthContext): Principal | null {
  if (ctx.principal !== null) return ctx.principal;
  if (ctx.agent !== undefined) return { id: ctx.agent.ownerId, kind: 'account', admin: false };
  return null;
}

/**
 * The caller's standing on a deck as the owner, a grant holder or a link holder, or null. The
 * record's general access is read as restricted and the admin flag as off, so a deck the legacy
 * open mode or the admin's reach alone admits is never "theirs" (`standingOf` picks the highest
 * role first, and an open editor deck would otherwise hide a viewer grant behind `via: open`).
 */
export function ownStanding(
  record: AccessRecord | null,
  ctx: AuthContext,
  linkGrants: readonly LinkGrant[],
  now: number,
): { role: Role } | null {
  if (record === null) return null;
  const principal = principalOf(ctx);
  if (principal === null) return null;
  const restricted: AccessRecord = {
    ...record,
    generalAccess: { ...record.generalAccess, mode: 'restricted' },
  };
  const standing = standingOf(restricted, { ...principal, admin: false }, linkGrants, now);
  if (standing === null) return null;
  return standing.via === 'owner' || standing.via === 'grant' || standing.via === 'link'
    ? { role: standing.role }
    : null;
}

export type ScopeDeps = {
  /** The deck's stored access record, or null for a deck nobody claimed. */
  readRecord: (deckId: string) => Promise<AccessRecord | null>;
  /** The link grants of the caller beyond the context's (the principal's deck index). */
  linkGrants?: (principalId: string) => Promise<readonly LinkGrant[]>;
  now?: () => number;
  /** How many records are read at once; 8 by default. */
  concurrency?: number;
};

/**
 * The heads this scope lists, in the order given. `every` keeps every head with its record's
 * owner unread (`owner: null`, `role: 'owner'`, the checkout's rule); `own` keeps the heads whose
 * record makes the caller the owner, a grant holder or a link holder; `browser` and `none` keep
 * nothing.
 */
export async function scopeHeads(
  heads: readonly DeckHead[],
  scope: ListingScope,
  deps: ScopeDeps,
): Promise<ScopedHead[]> {
  if (scope.kind === 'every') return heads.map((head) => ({ ...head, owner: null, role: 'owner' }));
  if (scope.kind !== 'own') return [];
  const principal = principalOf(scope.ctx);
  if (principal === null) return [];
  const now = (deps.now ?? Date.now)();
  const extra = deps.linkGrants === undefined ? [] : await deps.linkGrants(principal.id);
  const grants: LinkGrant[] = [...scope.ctx.linkGrants];
  for (const grant of extra)
    if (!grants.some((held) => held.linkId === grant.linkId)) grants.push(grant);
  const out: (ScopedHead | null)[] = new Array<ScopedHead | null>(heads.length).fill(null);
  const width = Math.max(1, deps.concurrency ?? 8);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= heads.length) return;
      const head = heads[index]!;
      /* a record that cannot be read lists nothing: the refusal, never an admission */
      const record = await deps.readRecord(head.id).catch(() => null);
      const standing = ownStanding(record, scope.ctx, grants, now);
      if (standing !== null)
        out[index] = { ...head, owner: record?.owner ?? null, role: standing.role };
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, heads.length) }, () => worker()));
  return out.filter((row): row is ScopedHead => row !== null);
}

/**
 * The trashed heads a scope lists on `/decks/trash` (round1/build/ha.md request 1): every one for
 * `every`; for `own`, the ones whose record makes the caller the owner, since only the owner
 * restores or deletes a deck forever; nothing otherwise. The trash has no browser record to draw,
 * so the trash page answers an anonymous visitor through its principal (`listingScope` with
 * `page: false`), never `browser`.
 */
export async function ownedTrash(
  heads: readonly DeckHead[],
  scope: ListingScope,
  deps: ScopeDeps,
): Promise<DeckHead[]> {
  const trashed = heads.filter((head) => head.trashedAt !== undefined);
  if (scope.kind === 'every') return trashed;
  const owned = new Set(
    (await scopeHeads(trashed, scope, deps))
      .filter((row) => row.role === 'owner')
      .map((row) => row.id),
  );
  return trashed.filter((head) => owned.has(head.id));
}

/**
 * The studio's dependencies of `scopeHeads`: the access store's record (its cache) and the link
 * grants the principal's deck index carries (server/access.ts `linkGrantsFromIndex`, the second
 * place a link exchange writes them). Loaded late: access.ts imports the room and the store.
 */
export async function studioScopeDeps(): Promise<ScopeDeps> {
  const access = await import('./access');
  return {
    readRecord: (deckId) => access.readAccess(deckId),
    linkGrants: (principalId) => access.linkGrantsFromIndex(principalId).catch(() => []),
  };
}

/**
 * The heads a scope lists from the store: no store read for `browser` and `none`; one listing of
 * the collection otherwise, with the records of `own` read through `scopeHeads`. The rows are
 * the stored heads alone (no owner, no role), so a listing never names another principal's id.
 */
export async function listScoped(
  scope: ListingScope,
  options: { includeTrashed?: boolean } = {},
): Promise<DeckHead[]> {
  if (scope.kind === 'browser' || scope.kind === 'none') return [];
  const { ensureDecks, listStoredDecks } = await import('./root');
  const heads =
    options.includeTrashed === true
      ? await (await ensureDecks()).list({ includeTrashed: true })
      : await listStoredDecks();
  if (scope.kind === 'every') return heads;
  const kept = new Set(
    (await scopeHeads(heads, scope, await studioScopeDeps())).map((row) => row.id),
  );
  return heads.filter((head) => kept.has(head.id));
}

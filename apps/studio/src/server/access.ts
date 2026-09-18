import type { AccessRecord } from '@turboslide/schema/access';
import type { ActionId } from '@turboslide/schema/actions';
import {
  accessRecordSchema,
  capabilitiesForRole,
  legacyAssetKey,
  newDeckRecord,
  synthesizeLegacyRecord,
} from '@turboslide/schema/access';
import type { Capability, Role, Via } from '@turboslide/schema/access';
import { ConflictError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';
import {
  blobAccessStore,
  blobIndexStore,
  blobLinkIndex,
  cachedAccessStore,
  fileAccessStore,
  fileIndexStore,
  fileLinkIndex,
  indexUpdates,
  isAccessPrecondition,
  memoryAccessBus,
  memoryHeadCache,
  newLinkHashes,
} from '@turboslide/store/hosted';
import type {
  AccessStore,
  CachedAccessStore,
  HeadCache,
  IndexStore,
  LinkIndex,
  StoredAccess,
} from '@turboslide/store/hosted';

import type { ShareLinkHit, ShareLinkLookupOptions } from './auth/identity';
import { findLinkInRecord } from './auth/links';
import type { AuthContext } from './authorize';
import type { LinkGrant } from '@turboslide/identity/access';
import { denialBody } from './authorize';
import type { RequestIdentity } from './room';
import { decksDir, exportBlobClient, stateDir, storeSelection } from './root';

/**
 * The access record on this studio (gslides-parity SPEC-3 2.2, 6.1; MILESTONES-3 B2 day 5): the
 * store the backend selects (`decks/<id>/.turboslide/access.json` on a checkout and the tmp
 * overlay, `decks/<id>/access.json` on the Blob store), behind the read through cache, the per
 * identity index, the link hash index and the head cache beside it, and the loader `authorize()`
 * binds (`loadAccessRecord`). The share actions of section 12 run over `hostedAccessHooks`, and
 * the link exchange finds a link through `findShareLink`.
 *
 * The cache and the instances (VERIFICATION-3 finding 34). The drop bus is process local on every
 * hosted tier this round (the redis tier's shared `PUBLISH access:<deckId>` is Kevin's install),
 * so another instance's write never drops this instance's entry. Three rules bound the stale
 * window: the blob tier trusts an entry for `BLOB_ACCESS_TTL_MS` (5 s) instead of 60 s; every
 * share write and every link exchange reads past the cache (`readStoredAccessFresh`, the F1
 * "drop before the fresh read"), so a write's `ifMatch` etag is the store's and a mint or a
 * revocation seconds old counts on every instance; and the link hash index (`links/<hex>`,
 * written beside the record before the record itself, F2) makes the exchange one record read
 * instead of one per deck. A conflict the store still reports is never the store's own sentence:
 * `hostedAccessHooks.save` retries once when the store holds the very record the write based on
 * under another etag, and otherwise answers the SPEC-3 sentence with the current record attached.
 */

/** How long a blob tier instance trusts a record it read (finding 34); the file tier keeps 60 s. */
export const BLOB_ACCESS_TTL_MS = 5_000;

/** The 409 sentence of a share write that lost to another (SPEC-3 6.1, 6.9). */
export const SHARE_CONFLICT_SENTENCE =
  'The sharing settings changed since they were read; reload and retry';

type Shared = typeof globalThis & {
  __turboslideAccess?: {
    access: CachedAccessStore;
    index: IndexStore;
    heads: HeadCache;
    links: LinkIndex;
    kind: AccessStore['kind'];
  };
};

const shared = globalThis as Shared;
let building: Promise<NonNullable<Shared['__turboslideAccess']>> | undefined;

function warn(line: string): void {
  console.error(`turboslide access: ${line}`);
}

async function build(): Promise<NonNullable<Shared['__turboslideAccess']>> {
  const selection = storeSelection();
  const bus = memoryAccessBus();
  if (selection.kind === 'blob') {
    const client = await exportBlobClient();
    if (client !== null) {
      return {
        // the bus is process local, so on the blob tier another instance's write never drops
        // this instance's entry: a short trust window bounds the stale read (VERIFICATION-3
        // finding 34: a link minted or revoked on one instance took up to a minute to land on
        // another); the redis tier's shared drop message is Kevin's install
        access: cachedAccessStore(blobAccessStore(client), { bus, ttlMs: BLOB_ACCESS_TTL_MS }),
        index: blobIndexStore(client),
        heads: memoryHeadCache(),
        links: blobLinkIndex(client),
        kind: 'blob',
      };
    }
  }
  return {
    access: cachedAccessStore(fileAccessStore(decksDir()), { bus }),
    index: fileIndexStore(stateDir()),
    heads: memoryHeadCache(),
    links: fileLinkIndex(stateDir()),
    kind: 'file',
  };
}

async function stores(): Promise<NonNullable<Shared['__turboslideAccess']>> {
  if (shared.__turboslideAccess !== undefined) return shared.__turboslideAccess;
  building ??= build().then((built) => {
    shared.__turboslideAccess = built;
    return built;
  });
  return building;
}

/** The access store this process writes and reads. */
export async function accessStore(): Promise<CachedAccessStore> {
  return (await stores()).access;
}

export async function indexStore(): Promise<IndexStore> {
  return (await stores()).index;
}

export async function headCache(): Promise<HeadCache> {
  return (await stores()).heads;
}

/** The link hash index beside the records (SPEC-3 6.4; finding 34 F2). */
export async function linkIndex(): Promise<LinkIndex> {
  return (await stores()).links;
}

/** The stored record with its etag, or null for a deck nobody claimed. */
export async function readStoredAccess(deckId: string): Promise<StoredAccess | null> {
  return (await accessStore()).read(deckId);
}

/**
 * The stored record read past this instance's cache (VERIFICATION-3 finding 34, F1 "drop before
 * the fresh read"): what a write bases its etag on, and what a link exchange reads. One store
 * read per call.
 */
export async function readStoredAccessFresh(deckId: string): Promise<StoredAccess | null> {
  const store = await accessStore();
  store.drop(deckId);
  return store.read(deckId);
}

// ---------------------------------------------------------------------------------------------
// The link grants across instances (the focus round, VERIFICATION.md pass 2 F-share-404)

/** How long an instance trusts the index's grants it read for a principal. */
export const LINK_GRANT_TTL_MS = 5_000;

const grantCache = new Map<string, { grants: LinkGrant[]; at: number }>();

/**
 * Records a link grant on the principal's deck index (`users/<principalId>/decks.json`, a `shared`
 * row with `via: 'link'` and the link's id), beside the principal record the exchange writes. The
 * principal store of the blob tier is a file store under the instance's state folder
 * (`selectPrincipalStore` without Redis), so a grant written by the exchange on one instance was
 * unknown to the next: the visitor a link admitted met You need access when the landing or a
 * server function ran on another instance. The index lives on the Blob store every instance
 * reads, so `linkGrantsFromIndex` finds the grant wherever the request lands.
 */
export async function noteLinkGrant(
  principalId: string,
  grant: LinkGrant,
  now: string = new Date().toISOString(),
): Promise<void> {
  grantCache.delete(principalId);
  await (
    await indexStore()
  ).update(principalId, indexUpdates.shared(grant.deckId, grant.role, now, 'link', grant.linkId));
}

/** The link grants the principal's deck index records (`via: 'link'` rows with a link id), read past a 5 s cache. */
export async function linkGrantsFromIndex(
  principalId: string,
  now: number = Date.now(),
): Promise<LinkGrant[]> {
  const cached = grantCache.get(principalId);
  if (cached !== undefined && now - cached.at < LINK_GRANT_TTL_MS) return cached.grants;
  const index = await (await indexStore()).read(principalId);
  const grants: LinkGrant[] = [];
  for (const row of index.shared) {
    if (row.via !== 'link' || row.linkId === undefined) continue;
    grants.push({ linkId: row.linkId, deckId: row.deckId, role: row.role });
  }
  grantCache.set(principalId, { grants, at: now });
  return grants;
}

/** Forgets the cached grants (a test, a hook that knows the index moved). */
export function dropLinkGrantCache(principalId?: string): void {
  if (principalId === undefined) grantCache.clear();
  else grantCache.delete(principalId);
}

/** The record `decide()` reads: the stored one, or null (the legacy synthesis is the decider's). */
export async function readAccess(deckId: string): Promise<AccessRecord | null> {
  const stored = await readStoredAccess(deckId);
  return stored === null ? null : stored.record;
}

/** The loader `bindAuthorize({ loadRecord })` takes (build-3/integrator.md section 4, B4 R3). */
export async function loadAccessRecord(deckId: string): Promise<AccessRecord | null> {
  return readAccess(deckId);
}

/** The record as the surfaces read it: stored, or the legacy synthesis of SPEC-3 6.1. */
export async function effectiveAccess(
  deckId: string,
  now: string = new Date().toISOString(),
): Promise<AccessRecord> {
  return (await readAccess(deckId)) ?? synthesizeLegacyRecord(deckId, now);
}

/**
 * The record past this instance's cache, or the legacy synthesis: what `share.get` and
 * `GET /api/access/<id>` answer, since the Share dialog bases its next write on it (the cycle 2
 * preview: the dialog reopened on an instance whose 5 s entry was the record from before another
 * instance's mint, minted again with the old base and was refused with "the access record is at
 * revision 1, not 0", and its Copy link minted a second token where the first was remembered).
 */
export async function effectiveAccessFresh(
  deckId: string,
  now: string = new Date().toISOString(),
): Promise<AccessRecord> {
  const stored = await readStoredAccessFresh(deckId);
  return stored?.record ?? synthesizeLegacyRecord(deckId, now);
}

/** Writes a record with the etag the caller read (an AccessPreconditionError when stale). */
export async function writeAccess(
  deckId: string,
  record: AccessRecord,
  ifMatch: string | null | undefined,
): Promise<StoredAccess> {
  const parsed = accessRecordSchema.parse(record);
  return (await accessStore()).write(deckId, parsed, ifMatch === undefined ? {} : { ifMatch });
}

/**
 * The principal a deck the studio creates belongs to (SPEC-3 6.1 "New decks start restricted
 * with their creator as owner"): the session's principal (anonymous or account), else the agent's
 * owner as `decide()` derives it, else nobody (a request with no identity writes no record).
 */
export function creatorOf(ctx: AuthContext): string | null {
  if (ctx.principal !== null) return ctx.principal.id;
  if (ctx.agent !== undefined) return ctx.agent.ownerId;
  return null;
}

/**
 * Writes the access record of a deck the studio just created (the draft's first save, `deck.create`,
 * `deck.copy`): restricted, the creator its owner, the asset key of the pre migration layout, at
 * revision 0 so the first share write bases on 0 (VERIFICATION-3 finding 4: without it the loader
 * synthesized the legacy open record while `share.get` synthesized a restricted one, the Share
 * dialog opened on the legacy row for a fresh copy, and enforce mode refused the creator's own
 * `share.createLink` and `deck.trash`). A record that exists already is kept; a caller with no
 * identity leaves the deck unrecorded, which `decide()` reads as the legacy open deck.
 */
export async function recordNewDeck(
  deckId: string,
  ctx: AuthContext,
  options: { now?: string; store?: AccessStore } = {},
): Promise<StoredAccess | null> {
  const owner = creatorOf(ctx);
  if (owner === null) return null;
  const now = options.now ?? new Date().toISOString();
  const record = newDeckRecord(deckId, owner, legacyAssetKey(deckId), now);
  const store = options.store ?? (await accessStore());
  try {
    return await store.write(deckId, record, { ifMatch: null });
  } catch (error) {
    if (isAccessPrecondition(error)) return error.current;
    throw error;
  }
}

/** The capabilities a role holds on a record (SPEC-3 6.2), as the editor and `share.get` list them. */
export function capabilitiesOf(role: Role | null, record: AccessRecord): Capability[] {
  if (role === null) return [];
  return [...capabilitiesForRole(role, record.settings)];
}

export type CallerStanding = { role: Role | null; via: Via | null; capabilities: Capability[] };

/** The caller's standing on a deck from an ok decision, for the payloads the loaders shape. */
export function standingOf(
  decision: { ok: true; role: Role; via: Via } | { ok: false },
  record: AccessRecord,
): CallerStanding {
  if (!decision.ok) return { role: null, via: null, capabilities: [] };
  return {
    role: decision.role,
    via: decision.via,
    capabilities: capabilitiesOf(decision.role, record),
  };
}

export type { AuthContext };

// ---------------------------------------------------------------------------------------------
// The share actions' hooks (SPEC-3 6.9; MILESTONES-3 B2 day 5; VERIFICATION-3 finding 34)

/** What the hooks and the lookup run over; the process wide stores by default, fakes in a test. */
export type AccessHookDeps = {
  store: Pick<CachedAccessStore, 'read' | 'write' | 'drop'>;
  links: LinkIndex;
  /** announces the change to the room's open tabs (SPEC-3 2.2, 6.3); the realtime channel by default */
  announce: (deckId: string, revision: number) => Promise<void>;
  now?: () => string;
};

async function defaultHookDeps(): Promise<AccessHookDeps> {
  const [store, links] = await Promise.all([accessStore(), linkIndex()]);
  return {
    store,
    links,
    announce: async (deckId, revision) => {
      // the room learns of the change (SPEC-3 2.2, 6.3): every open tab re-reads its role and
      // the stream re-decides the connection; loaded late, as shareWriteFor does, because
      // room.ts imports this module (VERIFICATION-3 findings 1 and 4: a viewer's page had no
      // signal when the owner turned on "Viewers can see comments")
      const { realtimeChannel } = await import('./room');
      await realtimeChannel().publish(deckId, { type: 'access', revision });
    },
  };
}

function sameRecord(a: AccessRecord, b: AccessRecord): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** The 409 a share write answers when the record moved: the current record travels with it. */
function shareConflict(current: StoredAccess | null): ConflictError {
  return new ConflictError(SHARE_CONFLICT_SENTENCE, {
    currentRevision: current?.record.revision ?? 0,
    ...(current === null ? {} : { current: current.record }),
  });
}

/**
 * Indexes the links a save mints (`links/<hex>` to the deck and link id), before the record is
 * written so the exchange on another instance never reads an indexed record without its entry.
 * A failed index write is logged and never blocks the share write: the exchange's record scan
 * covers a missing entry and heals it.
 */
async function indexNewLinks(
  links: LinkIndex,
  deckId: string,
  previous: AccessRecord | null,
  next: AccessRecord,
): Promise<void> {
  for (const link of newLinkHashes(previous, next)) {
    try {
      await links.put(link.hash, { deckId, linkId: link.id });
    } catch (error) {
      warn(
        `indexing link ${link.id} of ${deckId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * The conditional write with the one retry of finding 34: a conflict against the very record the
 * write based on (the store holds equal bytes under another etag, the case a lagging copy of
 * `access.json` produces) is retried once on the store's etag; a record that changed is the
 * SPEC-3 sentence with the current record attached. The store's own sentence never leaves here.
 */
async function writeBasedOn(
  store: AccessHookDeps['store'],
  deckId: string,
  record: AccessRecord,
  based: StoredAccess | null,
): Promise<StoredAccess> {
  try {
    return await store.write(deckId, record, { ifMatch: based?.etag ?? null });
  } catch (error) {
    if (!isAccessPrecondition(error)) throw error;
    let current = error.current;
    if (current === undefined) {
      store.drop(deckId);
      current = await store.read(deckId);
    }
    if (current !== null && based !== null && sameRecord(current.record, based.record)) {
      try {
        return await store.write(deckId, record, { ifMatch: current.etag });
      } catch (again) {
        if (!isAccessPrecondition(again)) throw again;
        throw shareConflict(again.current ?? current);
      }
    }
    throw shareConflict(current);
  }
}

/**
 * The `load` and `save` a share action runs over the access store: `load` reads past the cache
 * and keeps what it read, `save` indexes the new links, writes with the read etag as `ifMatch`
 * and announces the change, so two owners changing one record from two instances meet a 409
 * instead of a lost write (2.2). B1's record functions take these as `AccessDeps.load` and
 * `AccessDeps.save`; the store's cache drops on every write through its bus.
 */
export function hostedAccessHooks(
  deckId: string,
  deps?: AccessHookDeps,
): {
  load: () => Promise<AccessRecord | null>;
  save: (record: AccessRecord) => Promise<void>;
} {
  // undefined until load() ran; null for a deck with no stored record
  let loaded: StoredAccess | null | undefined;
  const resolved = async (): Promise<AccessHookDeps> => deps ?? defaultHookDeps();
  const fresh = async (store: AccessHookDeps['store']): Promise<StoredAccess | null> => {
    store.drop(deckId);
    return store.read(deckId);
  };
  return {
    async load() {
      const d = await resolved();
      // past the cache: the etag a share write bases on must be the store's, not an entry another
      // instance's write has made stale (finding 34: "access.json changed in the Blob store since
      // it was read" on the second link a rep minted within a minute)
      loaded = await fresh(d.store);
      // one record on the studio (VERIFICATION-3 finding 4): a deck nobody claimed is the legacy
      // open record `decide()` and the loader read, never the checkout's "the folder's holder is
      // the owner" synthesis of the record functions (that one stands on a checkout's CLI, where
      // no hooks are passed); the first save of a claim or a share write then lands with
      // `ifMatch: null`, so two instances cannot both create the record
      return (
        loaded?.record ??
        synthesizeLegacyRecord(deckId, (d.now ?? (() => new Date().toISOString()))())
      );
    },
    async save(record) {
      const d = await resolved();
      const parsed = accessRecordSchema.parse(record);
      // a save without a load bases on a fresh read (the record functions always load first)
      if (loaded === undefined) loaded = await fresh(d.store);
      await indexNewLinks(d.links, deckId, loaded?.record ?? null, parsed);
      loaded = await writeBasedOn(d.store, deckId, parsed, loaded);
      await d.announce(deckId, parsed.revision).catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The link lookup of the exchange (SPEC-3 6.4; VERIFICATION-3 finding 34 F1 and F2)

export type ShareLinkLookupDeps = {
  store: Pick<CachedAccessStore, 'read' | 'drop'>;
  links: LinkIndex;
  /** the ids of the stored decks, for the scan a miss in the index falls back to */
  deckIds: () => Promise<string[]>;
  now?: () => Date;
};

async function defaultLookupDeps(): Promise<ShareLinkLookupDeps> {
  const [store, links] = await Promise.all([accessStore(), linkIndex()]);
  return {
    store,
    links,
    deckIds: async () => {
      const { listStoredDecks } = await import('./root');
      return (await listStoredDecks()).map((head) => head.id);
    },
  };
}

/**
 * The share link a token hash names, or null (`bindIdentityHooks({ findShareLink })` in start.ts):
 * the index names the deck and one record read answers, live or dead; an entry the record does
 * not know (an index written before a lost record write, a deck id reused) and a hash the index
 * never saw (a link minted by the CLI on a checkout, an entry whose write failed) fall back to
 * the scan of every stored deck's record, one read each, and a hit heals the index. With
 * `fresh`, every record is read past this instance's cache (the exchange always asks for that:
 * a mint or a revocation seconds old counts on every instance, F1).
 */
export async function findShareLink(
  hash: string,
  options: ShareLinkLookupOptions,
  deps?: ShareLinkLookupDeps,
): Promise<ShareLinkHit | null> {
  const d = deps ?? (await defaultLookupDeps());
  const now = (d.now ?? (() => new Date()))();
  const readRecord = async (deckId: string): Promise<AccessRecord | null> => {
    if (options.fresh) d.store.drop(deckId);
    const stored = await d.store.read(deckId).catch(() => null);
    return stored?.record ?? null;
  };
  const names = (record: AccessRecord): boolean => record.links.some((link) => link.hash === hash);
  const indexed = await d.links.get(hash).catch(() => null);
  if (indexed !== null) {
    const record = await readRecord(indexed.deckId);
    if (record !== null && names(record)) return findLinkInRecord(record, hash, now);
  }
  for (const deckId of await d.deckIds()) {
    const record = await readRecord(deckId);
    if (record === null || !names(record)) continue;
    const hit = findLinkInRecord(record, hash, now);
    if (hit !== null) {
      await d.links.put(hash, { deckId: hit.deckId, linkId: hit.linkId }).catch(() => undefined);
    }
    // a hash names one token: the record that holds it is the answer, live or dead
    return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The share reads and writes of the routes (SPEC-3 6.9)

export type ShareGetView = {
  record: Partial<AccessRecord> & Pick<AccessRecord, 'deckId' | 'owner' | 'generalAccess'>;
  role: Role | null;
  via: Via | null;
  capabilities: Capability[];
};

export type ShareResult<T> = { ok: true; value: T } | { ok: false; status: number; body: unknown };

/** The record shaped for one caller (`share.get`, `/api/access/<id>`): whole for share holders, three fields and the own grant otherwise. */
export function shapeRecordFor(
  record: AccessRecord,
  role: Role | null,
  principalId: string | null,
): ShareGetView['record'] {
  const holder = role === 'owner' || (role === 'editor' && record.settings.editorsCanShare);
  if (holder) return record;
  const own =
    principalId === null
      ? undefined
      : record.grants.find((grant) => grant.principalId === principalId);
  return {
    schemaVersion: record.schemaVersion,
    deckId: record.deckId,
    owner: record.owner,
    generalAccess: record.generalAccess,
    settings: record.settings,
    revision: record.revision,
    ...(own === undefined ? {} : { grants: [own] }),
  };
}

/** `share.get` for a request's identity: `authorize(read)` first, one 404 for a stranger (6.2). */
export async function shareGetFor(
  identity: RequestIdentity,
  deckId: string,
): Promise<ShareResult<ShareGetView>> {
  const { decideFor } = await import('./room');
  const decision = await decideFor(identity, deckId, 'read', 'share.get');
  if (!decision.ok)
    return { ok: false, status: decision.status, body: denialBody(decision, 'read') };
  // past the cache: the dialog's next write bases on this revision (effectiveAccessFresh)
  const record = await effectiveAccessFresh(deckId);
  const standing = standingOf(decision, record);
  return {
    ok: true,
    value: {
      record: shapeRecordFor(record, standing.role, identity.principalId),
      role: standing.role,
      via: standing.via,
      capabilities: standing.capabilities,
    },
  };
}

/**
 * A share write over the hooks above. The record functions live in B1's
 * `apps/cli/src/records/access.ts`, which `@turboslide/cli` does not export to the studio yet
 * (b2.md request R8: `"./record-actions"` and `"./records/*"`); until the export lands every
 * write answers 501 naming the action, never a silent no-op.
 */
export async function shareWriteFor(
  identity: RequestIdentity,
  deckId: string,
  action: string,
  _input: unknown,
): Promise<ShareResult<unknown>> {
  const { decideFor } = await import('./room');
  const capability: Capability =
    action === 'share.requestAccess' ? 'read' : action === 'share.claim' ? 'read' : 'share';
  const decision = await decideFor(identity, deckId, capability, action);
  if (!decision.ok && action !== 'share.requestAccess') {
    return { ok: false, status: decision.status, body: denialBody(decision, capability) };
  }
  // the record functions of apps/cli/src/records/access.ts over `hostedAccessHooks`, registered
  // on the deck dispatcher by server/actions.ts with the request's identity as the caller (the
  // integrator at merge 2, b2.md R8): one implementation for this route, the window, HTTP and MCP
  const [{ deckDispatcher }, { authorOf }, { errorBodyOf }] = await Promise.all([
    import('./actions'),
    import('./room'),
    import('@turboslide/agent/http/errors'),
  ]);
  try {
    const deck = await deckDispatcher(deckId);
    const value = await deck.dispatcher.dispatch(action as ActionId, _input, {
      author: authorOf(identity),
      deckDir: deck.store.dir,
    });
    return { ok: true, value };
  } catch (error) {
    const body = errorBodyOf(error, action);
    return { ok: false, status: body.error.status, body };
  }
}

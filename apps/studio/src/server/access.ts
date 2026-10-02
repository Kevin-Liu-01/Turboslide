import type { AccessRecord } from '@turboslide/schema/access';
import type { ActionId } from '@turboslide/schema/actions';
import {
  accessRecordSchema,
  capabilitiesForRole,
  legacyAssetKey,
  synthesizeLegacyRecord,
} from '@turboslide/schema/access';
import type { Capability, Role, Via } from '@turboslide/schema/access';
import { ConflictError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';
import { newHostedDeckRecordWithToken } from '@turboslide/store/access-store';
import type { MintedGeneralLink } from '@turboslide/store/access-store';
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
  AccessBus,
  AccessStore,
  CachedAccessStore,
  HeadCache,
  IndexAvatarChoice,
  IndexStore,
  LinkIndex,
  StoredAccess,
} from '@turboslide/store/hosted';

import type { DropBus, DropTopic } from '@turboslide/realtime/bus';
import { isDoChannel } from '@turboslide/realtime/do';

import type { ShareLinkHit, ShareLinkLookupOptions } from './auth/identity';
import { findLinkInRecord } from './auth/links';
import type { AuthContext } from './authorize';
import { isPendingEmailGrantFor } from '@turboslide/identity/access';
import type { LinkGrant, Principal } from '@turboslide/identity/access';
import type { PrincipalRecord } from '@turboslide/identity/principal';
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
 * The cache and the instances (VERIFICATION-3 finding 34; the realtime round, docs/REALTIME.md
 * 3.6). The drop bus is the realtime channel's (`RealtimeChannel.bus`, packages/realtime bus.ts):
 * in process on the memory tier, Redis pub/sub on the redis tier, so a share write or a link
 * exchange on one instance drops the record's row (`access`) and the person's deck index row
 * (`link`: the link grants, the typed name, the avatar choice) on every instance at once; the blob
 * tier has no bus and another instance's write never drops this instance's entry there. Three
 * rules bound the stale window where the bus is absent or a message is lost: the blob tier trusts
 * an entry for `BLOB_ACCESS_TTL_MS` (5 s) instead of 60 s; every share write and every link
 * exchange reads past the cache (`readStoredAccessFresh`, the F1 "drop before the fresh read"),
 * so a write's `ifMatch` etag is the store's and a mint or a revocation seconds old counts on
 * every instance; and the link hash index (`links/<hex>`, written beside the record before the
 * record itself, F2) makes the exchange one record read instead of one per deck. A conflict the
 * store still reports is never the store's own sentence: `hostedAccessHooks.save` retries once
 * when the store holds the very record the write based on under another etag, and otherwise
 * answers the SPEC-3 sentence with the current record attached.
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
    /** the realtime channel's drop bus (docs/REALTIME.md 3.6); undefined on the blob tier */
    drops: DropBus | undefined;
  };
};

const shared = globalThis as Shared;
let building: Promise<NonNullable<Shared['__turboslideAccess']>> | undefined;

function warn(line: string): void {
  console.error(`turboslide access: ${line}`);
}

/**
 * The realtime channel's drop bus (docs/REALTIME.md 3.6), loaded late because room.ts imports
 * this module: the memory tier's in process bus, the redis tier's pub/sub, nothing on the blob
 * tier. A channel that cannot be built answers nothing and the caches keep their TTLs.
 */
async function channelDropBus(): Promise<DropBus | undefined> {
  try {
    const { realtimeChannel } = await import('./room');
    return realtimeChannel().bus;
  } catch (error) {
    warn(
      `the drop bus is not available: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * The access record cache's bus over the drop bus's `access` topic, so a write on any instance
 * drops the record on every instance (SPEC-3 6.1's `PUBLISH` drop, landed with the bus). A publish
 * that fails (Redis unreachable) is logged and never fails the write that made it; the TTL then
 * bounds the stale read as before.
 */
function accessBusOver(drops: DropBus): AccessBus {
  return {
    publish: (deckId) =>
      drops.publish('access', deckId).catch((error: unknown) => {
        warn(
          `the access drop of ${deckId} was not published: ${error instanceof Error ? error.message : String(error)}`,
        );
      }),
    subscribe: (onDrop) => drops.subscribe('access', onDrop),
  };
}

/**
 * Tells the deck's Durable Object that an access record or a link grant changed (the Cloudflare
 * move, docs/CLOUDFLARE.md 3.3): the object sends `reauth` to the named principals' sockets (every
 * socket when none is named) and closes within 10 s any whose fresh ticket does not arrive or
 * arrives with a lower role. Nothing on the other tiers; a failed call is logged and never fails
 * the write that made it.
 */
async function roomAccessChanged(deckId: string, principalIds?: readonly string[]): Promise<void> {
  try {
    const { realtimeChannel } = await import('./room');
    const channel = realtimeChannel();
    if (!isDoChannel(channel)) return;
    await channel.accessChanged(deckId, principalIds);
  } catch (error) {
    warn(
      `the object was not told of the access change on ${deckId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Publishes one drop message; nothing on a tier without a bus, a warning on a failed publish. */
async function publishDrop(topic: DropTopic, id: string): Promise<void> {
  const drops = (await stores()).drops;
  if (drops === undefined) return;
  await drops.publish(topic, id).catch((error: unknown) => {
    warn(
      `the ${topic} drop of ${id} was not published: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

async function build(): Promise<NonNullable<Shared['__turboslideAccess']>> {
  const selection = storeSelection();
  const drops = await channelDropBus();
  const bus = drops === undefined ? memoryAccessBus() : accessBusOver(drops);
  // the deck index row (the link grants, the typed name, the avatar choice) leaves this instance
  // on the other instances' word (docs/REALTIME.md 3.6; audit-sync.md defects 7 and 8)
  drops?.subscribe('link', (principalId) => grantCache.delete(principalId));
  if (selection.kind === 'blob') {
    const client = await exportBlobClient();
    if (client !== null) {
      return {
        // without a bus (the blob tier) another instance's write never drops this instance's
        // entry: a short trust window bounds the stale read (VERIFICATION-3 finding 34: a link
        // minted or revoked on one instance took up to a minute to land on another); with one
        // (the redis tier) the drop lands at once and the window is the safety net
        access: cachedAccessStore(blobAccessStore(client), { bus, ttlMs: BLOB_ACCESS_TTL_MS }),
        index: blobIndexStore(client),
        heads: memoryHeadCache(),
        links: blobLinkIndex(client),
        kind: 'blob',
        drops,
      };
    }
  }
  return {
    access: cachedAccessStore(fileAccessStore(decksDir()), { bus }),
    index: fileIndexStore(stateDir()),
    heads: memoryHeadCache(),
    links: fileLinkIndex(stateDir()),
    kind: 'file',
    drops,
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

/** What the principal's deck index carries beside its decks: the link grants, the typed name (b1.md R17) and the non picture avatar choice (docs/PEOPLE.md 3.13). */
export type IndexFacts = { grants: LinkGrant[]; name?: string; avatar?: IndexAvatarChoice };

/* the index's link grants, its display name (b1.md R17) and its avatar choice (docs/PEOPLE.md
   3.13), one read per principal per 5 s */
const grantCache = new Map<string, IndexFacts & { at: number }>();

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
  // the other instances forget their row of this person at once (docs/REALTIME.md 3.6; the row
  // `realtime.share-link.every-instance`: a copied link answered 404 on the next instance for up
  // to 5 s before the round)
  await publishDrop('link', principalId);
  // the person's sockets on the deck's object refresh their ticket (docs/CLOUDFLARE.md 3.3)
  await roomAccessChanged(grant.deckId, [principalId]);
}

/** The link grants the principal's deck index records (`via: 'link'` rows with a link id), read past a 5 s cache. */
export async function linkGrantsFromIndex(
  principalId: string,
  now: number = Date.now(),
): Promise<LinkGrant[]> {
  return (await indexFactsFor(principalId, now)).grants;
}

/**
 * The index's link grants, display name and avatar choice, read once per principal per 5 s (the
 * grant cache). `fresh` reads the store past this instance's row and fills the row with what it
 * read, so the reads that follow in the same request take it: the drop bus is process local, so
 * a name or a choice written on another instance reaches this one only when its row expires or
 * a caller asks for the store (docs/PEOPLE.md 6.4; `refreshIndexFacts`).
 */
export async function indexFactsFor(
  principalId: string,
  now: number = Date.now(),
  options: { fresh?: boolean } = {},
): Promise<IndexFacts> {
  const cached = grantCache.get(principalId);
  if (options.fresh !== true && cached !== undefined && now - cached.at < LINK_GRANT_TTL_MS)
    return cached;
  const index = await (await indexStore()).read(principalId);
  const grants: LinkGrant[] = [];
  for (const row of index.shared) {
    if (row.via !== 'link' || row.linkId === undefined) continue;
    grants.push({ linkId: row.linkId, deckId: row.deckId, role: row.role });
  }
  const facts = {
    grants,
    ...(index.name === undefined ? {} : { name: index.name }),
    ...(index.avatar === undefined ? {} : { avatar: index.avatar }),
    at: now,
  };
  grantCache.set(principalId, facts);
  return facts;
}

/**
 * The display name the principal's deck index carries (b1.md R17): `account.setName` writes the
 * typed name there beside the record, because the principal store of the blob tier is a file
 * store per instance and the instance that serves the next presence post has not seen the
 * record; the index lives on the Blob store every instance reads. Undefined when none was typed.
 */
export async function displayNameFromIndex(
  principalId: string,
  now: number = Date.now(),
): Promise<string | undefined> {
  return (await indexFactsFor(principalId, now)).name;
}

/** Writes the typed display name onto the principal's deck index (R17) and forgets the cached row. */
export async function noteDisplayName(principalId: string, name: string): Promise<void> {
  grantCache.delete(principalId);
  await (await indexStore()).update(principalId, indexUpdates.name(name));
  await publishDrop('link', principalId);
}

/**
 * The non picture avatar choice the principal's deck index carries (docs/PEOPLE.md 3.13; AUDIT.md
 * defect 13): `account.setAvatar` writes a glyph, dither or initials choice here beside the
 * record, so the instance that serves the next presence post draws the same plate. Undefined
 * when none was chosen or the choice is a picture (which the index never carries).
 */
export async function avatarChoiceFromIndex(
  principalId: string,
  now: number = Date.now(),
): Promise<IndexAvatarChoice | undefined> {
  return (await indexFactsFor(principalId, now)).avatar;
}

/** Writes the non picture avatar choice onto the principal's deck index, or clears it with null. */
export async function noteAvatarChoice(
  principalId: string,
  choice: IndexAvatarChoice | null,
): Promise<void> {
  grantCache.delete(principalId);
  await (await indexStore()).update(principalId, indexUpdates.avatar(choice));
  await publishDrop('link', principalId);
}

/**
 * The index's facts read from the store past this instance's cache and kept for the next 5 s
 * (docs/PEOPLE.md 6.4, the fix round of the verifier's pass 1 finding 3): the editor boot and a
 * client's first presence post read the choice `account.setAvatar` wrote on another instance
 * at once instead of after the cache's window, so the payload of a reload and the roster's own
 * row draw the new plate on any instance. One proven read on the blob tier (a head and a get), a
 * file read on a checkout; never on the presence ticks between, which keep the 5 s row.
 */
export async function refreshIndexFacts(
  principalId: string,
  now: number = Date.now(),
): Promise<IndexFacts> {
  return indexFactsFor(principalId, now, { fresh: true });
}

/**
 * The principal record with what the deck index carries, by the rules of b1.md R17 and
 * docs/PEOPLE.md 3.13 (b4.md R4): the index's typed name when the record carries none (a record
 * that carries a name keeps it), and the index's non picture choice whenever the index carries
 * one, unless the record's choice is a picture (the index never carries a picture and the
 * handler clears the field when one is chosen, so a stale glyph cannot outlive a picture). Pure;
 * the same record object when nothing applies, so a caller can tell a change by identity. The
 * room's `requestIdentity` and its resolver read the index through this one rule.
 */
export function recordWithIndexFacts(record: PrincipalRecord, facts: IndexFacts): PrincipalRecord {
  const name = record.name === undefined && facts.name !== undefined ? facts.name : undefined;
  const avatar =
    facts.avatar !== undefined &&
    record.avatar.variant !== 'picture' &&
    !sameChoice(record.avatar, facts.avatar)
      ? facts.avatar
      : undefined;
  if (name === undefined && avatar === undefined) return record;
  return {
    ...record,
    ...(name !== undefined ? { name } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
  };
}

/** Whether the record's choice is the index's (the variant, the letters and the salt). */
function sameChoice(record: PrincipalRecord['avatar'], index: IndexAvatarChoice): boolean {
  return (
    record.variant === index.variant &&
    record.initials === index.initials &&
    record.salt === index.salt
  );
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
): Promise<(StoredAccess & { general?: MintedGeneralLink }) | null> {
  const owner = creatorOf(ctx);
  if (owner === null) return null;
  const now = options.now ?? new Date().toISOString();
  /* the deployment's default general access (the polish round, docs/POLISH.md item 78): every
     new deck starts Restricted with Viewer for the link, as Google's does; the product round's
     Anyone with the link, Editor for an anonymous creator (docs/PRODUCT.md question 10; build/b7.md
     R1) is gone. `newHostedDeckRecordWithToken` keeps its shape: were a deployment to start a
     deck under a link again, the minted token would ride the answer once (b7.md FR1) */
  const { record, general } = newHostedDeckRecordWithToken(
    deckId,
    owner,
    legacyAssetKey(deckId),
    now,
    { anonymousPrincipals: ctx.principal?.kind !== 'account' },
  );
  const store = options.store ?? (await accessStore());
  try {
    const stored = await store.write(deckId, record, { ifMatch: null });
    return general === null ? stored : { ...stored, general };
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
      // every socket of the deck's object re-proves its right (docs/CLOUDFLARE.md 3.3)
      await roomAccessChanged(deckId);
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

/**
 * Binds the deck's pending grants by email to the signed in principal whose verified address they
 * name (SPEC-3 6.5; docs/PEOPLE.md 3.10; build/b5.md R7). The store keeps no index of grants by
 * address, so the identity runtime's `bindInvitations` hook has nothing to bind through at sign
 * in and stays null; the binding happens where the invitee first reads the deck (the editor
 * boot, write.ts), after `decide()` admitted them through the pure address match
 * (identity/access.ts `isPendingEmailGrantFor`). A bound grant names the principal and drops the
 * address (the schema names one or the other, never both); the payload's resolved view carries
 * the address for a sharer from then on. One write, based on the fresh record, announced to the
 * room's open tabs like a share write; a conflict with another instance's write answers null and
 * the next read binds. Answers the bound record, or null when no grant named the address.
 */
export async function bindEmailGrants(
  deckId: string,
  principal: Pick<Principal, 'id' | 'kind' | 'email' | 'admin'>,
  deps?: AccessHookDeps,
): Promise<AccessRecord | null> {
  if (principal.kind !== 'account' || principal.email === undefined) return null;
  const hooks = hostedAccessHooks(deckId, deps);
  const record = await hooks.load();
  if (record === null) return null;
  const now = (deps?.now ?? (() => new Date().toISOString()))();
  const at = Date.parse(now);
  const grants = record.grants.map((grant) =>
    isPendingEmailGrantFor(grant, principal, at)
      ? { ...grant, principalId: principal.id, email: null, acceptedAt: now, expiresAt: null }
      : grant,
  );
  if (grants.every((grant, i) => grant === record.grants[i])) return null;
  const next: AccessRecord = { ...record, grants, revision: record.revision + 1 };
  try {
    await hooks.save(next);
  } catch {
    return null;
  }
  dropLinkGrantCache(principal.id);
  return next;
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

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
import {
  AccessPreconditionError,
  blobAccessStore,
  blobIndexStore,
  cachedAccessStore,
  fileAccessStore,
  fileIndexStore,
  memoryAccessBus,
  memoryHeadCache,
} from '@turboslide/store/hosted';
import type {
  AccessStore,
  CachedAccessStore,
  HeadCache,
  IndexStore,
  StoredAccess,
} from '@turboslide/store/hosted';

import type { AuthContext } from './authorize';
import { denialBody } from './authorize';
import type { RequestIdentity } from './room';
import { decksDir, exportBlobClient, stateDir, storeSelection } from './root';

/**
 * The access record on this studio (gslides-parity SPEC-3 2.2, 6.1; MILESTONES-3 B2 day 5): the
 * store the backend selects (`decks/<id>/.turboslide/access.json` on a checkout and the tmp
 * overlay, `decks/<id>/access.json` on the Blob store), behind the 60 s cache whose drop message
 * rides the room's channel hosted, the per identity index and the head cache beside it, and the
 * loader `authorize()` binds (`loadAccessRecord`). The share actions of section 12 land here on
 * day 5; this module is what day 3's routes read for the roster's switches.
 */

/** How long a blob tier instance trusts a record it read (finding 34); the file tier keeps 60 s. */
export const BLOB_ACCESS_TTL_MS = 5_000;

type Shared = typeof globalThis & {
  __turboslideAccess?: {
    access: CachedAccessStore;
    index: IndexStore;
    heads: HeadCache;
    kind: AccessStore['kind'];
  };
};

const shared = globalThis as Shared;
let building: Promise<NonNullable<Shared['__turboslideAccess']>> | undefined;

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
        // another); the redis tier's shared drop message is round four's
        access: cachedAccessStore(blobAccessStore(client), { bus, ttlMs: BLOB_ACCESS_TTL_MS }),
        index: blobIndexStore(client),
        heads: memoryHeadCache(),
        kind: 'blob',
      };
    }
  }
  return {
    access: cachedAccessStore(fileAccessStore(decksDir()), { bus }),
    index: fileIndexStore(stateDir()),
    heads: memoryHeadCache(),
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

/** The stored record with its etag, or null for a deck nobody claimed. */
export async function readStoredAccess(deckId: string): Promise<StoredAccess | null> {
  return (await accessStore()).read(deckId);
}

/**
 * The stored record read past this instance's cache (VERIFICATION-3 finding 34, F1 "drop before
 * the fresh read"): what a write bases its etag on, and what a link exchange falls back to when
 * the cached record knows no such link. One store read per call.
 */
export async function readStoredAccessFresh(deckId: string): Promise<StoredAccess | null> {
  const store = await accessStore();
  store.drop(deckId);
  return store.read(deckId);
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
    if (error instanceof AccessPreconditionError) return error.current;
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
// The share actions' hooks and reads (SPEC-3 6.9; MILESTONES-3 B2 day 5)

/**
 * The `load` and `save` a share action runs over the access store: `load` keeps the etag it
 * read, `save` writes with it as `ifMatch`, so two owners changing one record from two instances
 * meet a 409 instead of a lost write (2.2). B1's record functions take these as `AccessDeps.load`
 * and `AccessDeps.save`; the store's cache drops on every write through its bus.
 */
export function hostedAccessHooks(deckId: string): {
  load: () => Promise<AccessRecord | null>;
  save: (record: AccessRecord) => Promise<void>;
} {
  let etag: string | null | undefined;
  return {
    async load() {
      // past the cache: the etag a share write bases on must be the store's, not an entry another
      // instance's write has made stale (finding 34: "access.json changed in the Blob store since
      // it was read" on the second link a rep minted within a minute)
      const stored = await readStoredAccessFresh(deckId);
      etag = stored?.etag ?? null;
      // one record on the studio (VERIFICATION-3 finding 4): a deck nobody claimed is the legacy
      // open record `decide()` and the loader read, never the checkout's "the folder's holder is
      // the owner" synthesis of the record functions (that one stands on a checkout's CLI, where
      // no hooks are passed); the first save of a claim or a share write then lands with
      // `ifMatch: null`, so two instances cannot both create the record
      return stored?.record ?? synthesizeLegacyRecord(deckId, new Date().toISOString());
    },
    async save(record) {
      try {
        const written = await writeAccess(deckId, record, etag);
        etag = written.etag;
        // the room learns of the change (SPEC-3 2.2, 6.3): every open tab re-reads its role and
        // the stream re-decides the connection; loaded late, as shareWriteFor does, because
        // room.ts imports this module (VERIFICATION-3 findings 1 and 4: a viewer's page had no
        // signal when the owner turned on "Viewers can see comments")
        const { realtimeChannel } = await import('./room');
        await realtimeChannel()
          .publish(deckId, { type: 'access', revision: record.revision })
          .catch(() => undefined);
      } catch (error) {
        if (error instanceof AccessPreconditionError) {
          throw new ConflictError(
            'The sharing settings changed since they were read; reload and retry',
            {
              currentRevision: record.revision,
            },
          );
        }
        throw error;
      }
    },
  };
}

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
  const record = await effectiveAccess(deckId);
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

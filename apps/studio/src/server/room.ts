import { createHmac, timingSafeEqual } from 'node:crypto';

import { Redis } from 'ioredis';

import { authorize as bearerAuthorize } from '@turboslide/agent/http/auth';
import type { AuthContext, Principal, Role } from '@turboslide/identity/access';
import { assignHueSlot, preferredHueSlot } from '@turboslide/identity/hues';
import type { HueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
import { resolvePrincipal } from '@turboslide/identity/resolve';
import type { ResolvedIdentity, Trust } from '@turboslide/identity/resolve';
import { appendWithRetry, CAPS, checkBaseWindow, replayPlan } from '@turboslide/realtime/admission';
import type { IdentityKind } from '@turboslide/realtime/admission';
import { blobChannel } from '@turboslide/realtime/blob';
import type {
  Entry,
  NewEntry,
  RealtimeChannel,
  RealtimeTier,
  RejectReason,
  RoomEvent,
  RosterEntry,
} from '@turboslide/realtime/channel';
import { commentThreadId } from '@turboslide/realtime/channel';
import { deckKeys } from '@turboslide/realtime/keys';
import { memoryChannel } from '@turboslide/realtime/memory';
import { ioredisCommands, redisChannel } from '@turboslide/realtime/redis';
import type { RedisCommands } from '@turboslide/realtime/redis';
import {
  CLIENT_BINDING_TTL_MS,
  EDITING_TABS_MAX,
  LIVE_POINTERS_MAX,
  PRESENCE_EXPIRY_MS,
  PRESENCE_PER_SECOND,
  REPLAY_MAX_BYTES,
  REPLAY_MAX_ENTRIES,
} from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import { selectRealtime } from '@turboslide/realtime/select';
import type { RealtimeSelection } from '@turboslide/realtime/select';
import type { AccessRecord } from '@turboslide/schema/access';
import { canonicalJson } from '@turboslide/schema/json';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { ConflictError, NotImplementedError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { isTextOp, sameText, transformMutation } from '@turboslide/schema/transform';
import { validateDocument } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { touchedSlides } from '@turboslide/store/store';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import { capabilitiesOf, effectiveAccess, readAccess } from './access';
import { agentAuth } from './auth';
import { authorize, bootstrapAgentContext, denialBody, linkGrantsFor } from './authorize';
import type { Capability, ShadowedDecision } from './authorize';
import { studioSessionSecret } from './auth/middleware';
import { selectPrincipalStore } from './auth/principal';
import { ensurePrincipal, readPrincipal } from './auth/session';
import { applyStreamEntries, createCheckpointer, coveredSeq } from './checkpoint';
import { commentCapabilityOf, commentsApplierFor, shiftEntriesFor } from './comments';
import type { CommentActionId, CommentCaller } from './comments';
import type { Checkpointer } from './checkpoint';
import { logSecurityEvent } from './log';
import { hasStoredDeck, isHosted, openDeckStore, stateDir } from './root';

/**
 * The room (gslides-parity SPEC-3 2.3, 3.2 to 3.8; MILESTONES-3 B2 day 3): one process wide
 * realtime channel selected from the environment (`memory` on a checkout, `redis` over ioredis,
 * `blob` over the deck store), and per deck the live document (the last checkpoint plus every
 * stream entry since), the admission of an ops POST (the caps, the base window, the transform
 * against what landed, the reducer and the validator, the compare and append), the presence
 * roster with the identity fields written from the session, the stream's hello with the roster
 * filtered by role, the follower that turns a write made outside the room (a CLI write beside the
 * dev server, an agent's strict write) into stream entries, and the checkpointer (checkpoint.ts).
 * Server only: the three routes under routes/api/decks.$deckId.* and write.ts call it.
 */

// ---------------------------------------------------------------------------------------------
// The channel, once per process

type Shared = typeof globalThis & {
  __turboslideRoom?: {
    selection: RealtimeSelection;
    channel: RealtimeChannel;
    rooms: Map<string, Promise<Room>>;
    principals: PrincipalStore;
    streams: StreamCounters;
    /** the raw Redis commands on the redis tier (the inbox, the session directory), null elsewhere */
    redis: RedisCommands | null;
  };
};

const shared = globalThis as Shared;

function log(line: string): void {
  console.error(`turboslide room: ${line}`);
}

function buildChannel(selection: RealtimeSelection): {
  channel: RealtimeChannel;
  redis: RedisCommands | null;
} {
  switch (selection.tier) {
    case 'memory':
      return { channel: memoryChannel(), redis: null };
    case 'redis': {
      const url = process.env.REDIS_URL ?? '';
      const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
      client.on('error', (error: unknown) =>
        log(`redis: ${error instanceof Error ? error.message : String(error)}`),
      );
      const redis = ioredisCommands(client);
      return {
        channel: redisChannel(redis, {
          onError: (error, context) =>
            log(`${context}: ${error instanceof Error ? error.message : String(error)}`),
        }),
        redis,
      };
    }
    case 'blob':
      return {
        channel: blobChannel({
          open: (deckId) => openDeckStore(deckId),
          // the comments store (SPEC-3 5.2): on this tier an append writes the sidecar itself,
          // since the version log carries no comment entries for the checkpointer to fold
          // (VERIFICATION-3 finding 6: without it every comment write answered 400)
          applyComments: async (deckId, entries) => {
            // strict: a comment op the sidecar refuses fails the append with its sentence, so
            // the seller's action is refused instead of admitted and dropped (comments.ts)
            await commentsApplierFor(deckId, { strict: true }).apply(entries);
          },
          onError: (error, context) =>
            log(`${context}: ${error instanceof Error ? error.message : String(error)}`),
        }),
        redis: null,
      };
  }
}

function state(): NonNullable<Shared['__turboslideRoom']> {
  if (shared.__turboslideRoom === undefined) {
    const selection = selectRealtime(process.env);
    const { channel, redis } = buildChannel(selection);
    const principals = selectPrincipalStore({ stateDir: stateDir() }).store;
    log(`realtime tier ${selection.tier} (${selection.reason})`);
    shared.__turboslideRoom = {
      selection,
      channel,
      rooms: new Map(),
      principals,
      streams: createStreamCounters(),
      redis,
    };
  }
  return shared.__turboslideRoom;
}

/** The raw Redis commands of the redis tier (B3 R6: `get`, `set ... PX`, `del` ride `call`), null on the other tiers. */
export function redisCommands(): RedisCommands | null {
  return state().redis;
}

/** The process wide channel (SPEC-3 2.5). */
export function realtimeChannel(): RealtimeChannel {
  return state().channel;
}

export function realtimeSelection(): RealtimeSelection {
  return state().selection;
}

export function realtimeTier(): RealtimeTier {
  return state().selection.tier;
}

/** The principal records (the name, the avatar, the link grants), file or Redis backed. */
export function principalStore(): PrincipalStore {
  return state().principals;
}

// ---------------------------------------------------------------------------------------------
// Who is asking (SPEC-3 0.17, 3.11, 6.2)

export type RequestIdentity = {
  /** the context `authorize()` decides over */
  ctx: AuthContext;
  /** the principal id of a browser session, null for a bearer */
  principalId: string | null;
  /** what the client bindings and the stream counters key on: the principal id or `agent:<tokenId>` */
  identity: string;
  kind: IdentityKind;
  /** the Set-Cookie value when this request minted the anonymous id */
  setCookie?: string;
  record: PrincipalRecord | null;
};

/**
 * The identity of a request on the room routes: the sealed cookie (minted here when absent, so
 * a stream opened before the middleware ran still gets an id), else the bearer as the bootstrap
 * admin agent (SPEC-3 0.23; B3's key resolver binds records on day four), else a stranger.
 */
export async function requestIdentity(request: Request): Promise<RequestIdentity> {
  const secret = studioSessionSecret();
  if (request.headers.get('authorization') !== null) {
    const bearer = bearerAuthorize(request, process.env);
    if (bearer.ok) {
      const ctx = bootstrapAgentContext(bearer.mode);
      return {
        ctx,
        principalId: null,
        identity: `agent:${ctx.agent?.tokenId ?? 'bootstrap'}`,
        kind: 'agent',
        record: null,
      };
    }
  } else if (request.headers.get('cookie') === null) {
    // a cookieless request the localhost rule admits (SPEC-3 0.23: curl, the CLI's --to, an MCP
    // client on a checkout's dev server) is the checkout holder, as the agent routes decide;
    // minting an anonymous principal per call would make every call a different stranger (the
    // integrator at merge 2, seen on the merge 2 action walk)
    const local = agentAuth(request);
    if (local.ok && local.mode === 'localhost') {
      const ctx = bootstrapAgentContext('localhost');
      return { ctx, principalId: null, identity: 'agent:localhost', kind: 'agent', record: null };
    }
  }
  const existing = await readPrincipal(request, secret);
  let principal: Principal | null = existing;
  let setCookie: string | undefined;
  if (principal === null) {
    const ensured = await ensurePrincipal(request, secret);
    if (ensured !== null) {
      principal = ensured.principal;
      setCookie = ensured.setCookie;
    }
  }
  if (principal === null) {
    return {
      ctx: { principal: null, linkGrants: [] },
      principalId: null,
      identity: 'anon_00000000-0000-4000-8000-000000000000',
      kind: 'anonymous',
      record: null,
    };
  }
  const record = await principalStore()
    .touch(principal.id, new Date(), true)
    .catch(() => null);
  return {
    /* the link grants are the union of the principal record's and the deck index's, so a grant
       exchanged on another instance admits the visitor on the ops, stream, presence and comments
       routes too (b6 R1; authorize.ts linkGrantsFor) */
    ctx: { principal, linkGrants: await linkGrantsFor(principal.id, record) },
    principalId: principal.id,
    identity: principal.id,
    kind: principal.kind === 'account' ? 'signedIn' : 'anonymous',
    ...(setCookie !== undefined ? { setCookie } : {}),
    record,
  };
}

/** The author a server derived identity writes as (SPEC-3 0.17): the label or the typed name, the principal id. */
export function authorOf(identity: RequestIdentity): Author {
  if (identity.ctx.agent !== undefined) {
    return {
      kind: 'agent',
      name: identity.ctx.agent.name,
      ...(identity.ctx.agent.runId !== undefined ? { runId: identity.ctx.agent.runId } : {}),
      principalId: `agent:${identity.ctx.agent.tokenId}`,
    };
  }
  const resolved = resolveIdentity(identity.principalId ?? identity.identity, identity.record);
  return {
    kind: 'human',
    name: resolved.displayName,
    ...(identity.principalId !== null ? { principalId: identity.principalId } : {}),
  };
}

/** The resolved identity of a principal id from its record (the alias and account lookups are B3's day four). */
export function resolveIdentity(
  principalId: string,
  record: PrincipalRecord | null,
): ResolvedIdentity {
  return resolvePrincipal(principalId, {
    record: () => record,
    alias: () => null,
    account: () => null,
  });
}

/** The same resolution over the store, for ids the request did not carry (the version history, comments). */
export async function resolvePrincipalId(principalId: string): Promise<ResolvedIdentity> {
  const record = await principalStore()
    .get(principalId)
    .catch(() => null);
  return resolveIdentity(principalId, record);
}

/** `authorize()` for a request on a deck, with the route's transport word. */
export async function decideFor(
  identity: RequestIdentity,
  deckId: string,
  capability: Capability,
  action?: string,
): Promise<ShadowedDecision> {
  return authorize(identity.ctx, deckId, capability, {
    transport: 'route',
    ...(action !== undefined ? { action } : {}),
  });
}

// ---------------------------------------------------------------------------------------------
// The live document: the last checkpoint plus every entry since

export type LiveDocument = {
  /** the last stream entry applied */
  seq: number;
  /** the document, its `deck.revision` at the last checkpoint */
  document: DeckDocument;
};

type Live = LiveDocument & { chain: Promise<unknown> };

/** The comment ops the stream carried since a seq, for the checkpointer and the stream's readers. */
export type Room = {
  readonly deckId: string;
  readonly channel: RealtimeChannel;
  readonly tier: RealtimeTier;
  readonly store: DeckStore;
  /** the live document, synced to the channel's head */
  live: () => Promise<LiveDocument>;
  /** the checkpointer of this deck on this instance */
  checkpointer: Checkpointer;
  /** the record's revision at the last checkpoint this instance knows */
  revision: () => number;
  /** turns the records written outside the room since the live revision into stream entries now */
  follow: () => Promise<void>;
  /** stops the subscription, the follower and the checkpointer (tests) */
  close: () => Promise<void>;
};

function cloneEntryAuthor(author: Author): Author {
  return { ...author };
}

const applyEntries = applyStreamEntries;

async function createRoom(deckId: string): Promise<Room> {
  const { channel, selection } = state();
  const store = await openDeckStore(deckId);
  const read = await store.read();
  const records = await store.records();
  const live: Live = {
    seq: coveredSeq(records),
    document: read.document,
    chain: Promise.resolve(),
  };
  const ownRevisions = new Set<number>();
  let followerBusy = false;

  const queued = <T>(run: () => Promise<T>): Promise<T> => {
    const next = live.chain.then(run, run);
    live.chain = next.catch(() => undefined);
    return next;
  };

  /** Advances the live document to the channel's head, or reloads it from the store when the stream was trimmed past it. */
  const syncLive = async (): Promise<LiveDocument> => {
    if (selection.tier === 'blob') {
      const current = await store.read();
      live.document = current.document;
      live.seq = current.document.deck.revision;
      return { seq: live.seq, document: live.document };
    }
    const head = await channel.head(deckId);
    if (head < live.seq) {
      // the stream was reset under this instance (a Redis flush, a test): the store is the truth
      const current = await store.read();
      live.document = current.document;
      live.seq = coveredSeq(await store.records());
    }
    while (live.seq < head) {
      const entries = await channel.since(deckId, live.seq, REPLAY_MAX_ENTRIES);
      if (entries.length === 0) break;
      try {
        live.document = applyEntries(live.document, entries);
      } catch (error) {
        // an entry that no longer applies on this instance's copy: reload from the store and keep going
        log(
          `${deckId}: live apply failed at seq ${live.seq}: ${error instanceof Error ? error.message : String(error)}`,
        );
        const current = await store.read();
        live.document = current.document;
      }
      live.seq = entries[entries.length - 1]?.seq ?? head;
    }
    return { seq: live.seq, document: live.document };
  };

  const setRevision = (revision: number, updatedAt: string): void => {
    if (live.document.deck.revision === revision) return;
    live.document = {
      deck: { ...live.document.deck, revision, updatedAt },
      slides: live.document.slides,
    };
  };

  const checkpointer = createCheckpointer({
    deckId,
    channel,
    store,
    comments: commentsApplierFor(deckId),
    onCommitted: (record) => {
      ownRevisions.add(record.revision);
      void queued(async () => {
        setRevision(record.revision, record.createdAt);
      });
    },
    log,
  });

  // every admitted op of every instance reaches the live document in stream order
  const stopSubscription = channel.subscribe(deckId, (event) => {
    if (event.type === 'op') {
      void queued(async () => {
        if (event.entry.seq <= live.seq) return;
        if (event.entry.seq !== live.seq + 1) {
          await syncLive();
          return;
        }
        try {
          live.document = applyEntries(live.document, [event.entry]);
        } catch {
          const current = await store.read();
          live.document = current.document;
        }
        live.seq = event.entry.seq;
      });
    } else if (event.type === 'checkpoint') {
      void queued(async () => {
        if (event.external === true) {
          const current = await store.read();
          live.document = current.document;
          return;
        }
        setRevision(event.revision, new Date().toISOString());
      });
    }
  });

  /**
   * The follower (SPEC-3 0.48, 3.7 c): a record written outside the room (a CLI write beside the
   * dev server, an agent's strict write through writeDeck, a `version.restore`) becomes stream
   * entries so every tab applies it live; a record the stream cannot replay (a restore, a record
   * whose base is not the live document) is announced as an external checkpoint and the tabs
   * reload at its revision. The instance takes the deck's follow lock so two instances never
   * append one record twice, and checks the stream's tail for the record's op id first.
   */
  const follow = async (): Promise<void> => {
    if (selection.tier === 'blob' || followerBusy) return;
    followerBusy = true;
    try {
      const all = await store.records();
      const known = live.document.deck.revision;
      const fresh = all
        .filter((record) => record.revision > known && !ownRevisions.has(record.revision))
        .sort((a, b) => a.n - b.n);
      if (fresh.length === 0) return;
      const token = crypto.randomUUID().replace(/-/g, '');
      const keys = deckKeys(deckId);
      if (!(await channel.lock(keys.follow, token, 5000))) return;
      try {
        for (const record of fresh) {
          if (record.ops !== undefined) {
            // another instance's checkpoint: its entries are in the stream already
            await queued(async () => setRevision(record.revision, record.createdAt));
            continue;
          }
          await queued(async () => {
            await syncLive();
            const head = await channel.head(deckId);
            const tail = await channel.since(deckId, Math.max(0, head - 64), 64);
            const opId = `store:${record.n}`;
            if (tail.some((entry) => entry.opId === opId)) return;
            const replayable =
              record.mutations.length > 0 &&
              record.baseRevision === live.document.deck.revision &&
              !record.mutations.some((mutation) => mutation.op === 'version.restore');
            if (replayable) {
              try {
                applyEntries(live.document, [
                  {
                    seq: head + 1,
                    rev: record.baseRevision,
                    kind: 'edit',
                    author: record.author,
                    clientId: 'store',
                    opId,
                    mutations: record.mutations,
                    at: record.createdAt,
                  },
                ]);
              } catch {
                await announceExternal(record);
                return;
              }
              const entry: NewEntry = {
                rev: record.baseRevision,
                kind: 'edit',
                author: cloneEntryAuthor(record.author),
                clientId: 'store',
                opId,
                mutations: record.mutations,
                at: record.createdAt,
              };
              const result = await channel.append(deckId, head, [entry], { token });
              if (!result.ok) {
                await announceExternal(record);
                return;
              }
              const admitted = result.entries[0];
              if (admitted !== undefined && admitted.seq === live.seq + 1) {
                live.document = applyEntries(live.document, [admitted]);
                live.seq = admitted.seq;
              }
              setRevision(record.revision, record.createdAt);
              ownRevisions.add(record.revision);
              await channel.publish(deckId, {
                type: 'checkpoint',
                revision: record.revision,
                fromSeq: admitted?.seq ?? head,
                toSeq: admitted?.seq ?? head,
                ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
                author: record.author,
                note: record.note,
              });
              checkpointer.covered(admitted?.seq ?? head);
            } else {
              await announceExternal(record);
            }
          });
        }
      } finally {
        await channel.unlock(keys.follow, token);
      }
    } catch (error) {
      log(`${deckId}: follower: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      followerBusy = false;
    }
  };

  const announceExternal = async (record: VersionRecord): Promise<void> => {
    const current = await store.read();
    live.document = current.document;
    ownRevisions.add(record.revision);
    const head = await channel.head(deckId);
    await channel.publish(deckId, {
      type: 'checkpoint',
      revision: current.document.deck.revision,
      fromSeq: head,
      toSeq: head,
      ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
      author: record.author,
      note: record.note,
      external: true,
    });
  };

  const stopWatch =
    selection.tier === 'blob'
      ? () => {}
      : store.watch((event) => {
          if (event.revision === null) return;
          if (event.revision <= live.document.deck.revision) return;
          void follow();
        });

  return {
    deckId,
    channel,
    tier: selection.tier,
    store,
    live: () => queued(syncLive),
    checkpointer,
    revision: () => live.document.deck.revision,
    follow,
    async close() {
      stopSubscription();
      stopWatch();
      await checkpointer.stop();
    },
  };
}

/** The room of a deck on this instance; a RangeError when the deck is missing. */
export async function roomFor(deckId: string): Promise<Room> {
  const { rooms } = state();
  let room = rooms.get(deckId);
  if (room === undefined) {
    if (!(await hasStoredDeck(deckId))) throw new RangeError(`No deck ${deckId}`);
    room = createRoom(deckId).catch((error: unknown) => {
      rooms.delete(deckId);
      throw error;
    });
    rooms.set(deckId, room);
  }
  return room;
}

/**
 * The live document of a deck whose room this instance holds, or null when no room is open here.
 * The viewer, print and thumbnail payloads (`decks.ts` `getDeck`) read the store, which the
 * checkpointer writes 2 s after the last op and 10 s at most under a burst, so a slide skipped or
 * a fill written a moment before the page opened was missing from them (docs/FOCUS.md
 * `export.print.include-skipped`, `shapes.reload-and-viewer`); a read here takes the room's
 * document ahead of the store, and opens no room for a deck nobody is editing on this instance
 * (the integrator at the cycle 2 merge, for b7).
 */
export async function liveIfOpen(deckId: string): Promise<LiveDocument | null> {
  const s = shared.__turboslideRoom;
  const pending = s?.rooms.get(deckId);
  if (pending === undefined) return null;
  try {
    return await (await pending).live();
  } catch {
    return null;
  }
}

/**
 * Forgets one deck's room on this instance and stops its checkpointer (the focus round, cycle 2;
 * VERIFICATION C2-F19). Delete forever removes the deck's folder without the store's write lock
 * (`@turboslide/store/templates` removeDeck), and a checkpoint run that loaded the document before
 * the removal writes the slide files, the version record and the manifest after it, which brings
 * the folder back with the changed slides alone and `/deck/<id>` answers 200 for a deck the
 * seller deleted. The route closes the room first, so no run of this instance's checkpointer is
 * in flight or pending when the folder goes.
 */
export async function closeRoom(deckId: string): Promise<void> {
  const s = shared.__turboslideRoom;
  const pending = s?.rooms.get(deckId);
  if (s === undefined || pending === undefined) return;
  s.rooms.delete(deckId);
  await (await pending).close().catch(() => undefined);
}

/** Forgets every room on this instance (a test, a deck removal). */
export async function closeRooms(): Promise<void> {
  const s = shared.__turboslideRoom;
  if (s === undefined) return;
  for (const [deckId, room] of s.rooms) {
    s.rooms.delete(deckId);
    await (await room).close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Comment anchors following their text (SPEC-3 0.52) and the comment actions' caller (5.9)

/**
 * Appends the `comment.shift` entries a landed edit produced, right after it (the second stream
 * entry of 0.52); the checkpointer writes them with the edit's checkpoint. A failure to append
 * them is logged and never fails the edit: the next read re-places the anchor by its quoted text.
 */
async function appendShifts(
  room: Room,
  landed: readonly Entry[],
  before: DeckDocument,
): Promise<void> {
  if (landed.every((entry) => entry.kind !== 'edit')) return;
  try {
    const after = applyEntries(before, landed);
    const shifts = await shiftEntriesFor(room, landed, before, after);
    if (shifts.length === 0) return;
    const last = landed[landed.length - 1]?.seq ?? (await room.channel.head(room.deckId));
    const result = await appendWithRetry(
      room.channel,
      room.deckId,
      last,
      shifts,
      (entries) => entries,
    );
    if (result.ok) {
      room.checkpointer.noteComments(result.entries);
      room.checkpointer.noteAppended(result.entries, 0);
    }
  } catch (error) {
    log(
      `${room.deckId}: comment.shift did not land: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export type CommentCallerResult =
  | { ok: true; caller: CommentCaller; identity: RequestIdentity }
  | { ok: false; status: number; body: unknown; identity: RequestIdentity };

/**
 * The caller of a comment action on a request: the identity, `authorize()` for the capability the
 * action needs (a denial is the body of 6.2), the capabilities of the role on the record, the
 * author the server derives, and the inbox's Redis handle.
 */
export async function commentCallerFor(
  request: Request,
  deckId: string,
  action: CommentActionId,
): Promise<CommentCallerResult> {
  const identity = await requestIdentity(request);
  const capability = commentCapabilityOf(action);
  const decision = await decideFor(identity, deckId, capability, action);
  if (!decision.ok)
    return { ok: false, status: decision.status, body: denialBody(decision, capability), identity };
  const room = await roomFor(deckId);
  const record = await effectiveAccess(deckId);
  const caller: CommentCaller = {
    room,
    author: authorOf(identity),
    capabilities: new Set(capabilitiesOf(decision.role, record)),
    principalId: identity.principalId ?? identity.identity,
    origin: new URL(request.url).origin,
    redis: state().redis,
  };
  return { ok: true, caller, identity };
}

// ---------------------------------------------------------------------------------------------
// Admission (SPEC-3 3.4)

export type Rejected = { opId: string; reason: RejectReason; message?: string };

export type AdmissionResult =
  | { ok: true; entries: Entry[]; rejected: Rejected[]; head: number; revision: number }
  | {
      ok: false;
      status: 400 | 403 | 409 | 429;
      code: string;
      message: string;
      head?: number;
      retryAfterMs?: number;
    };

/** A slide document after the write is at most 200 KB (report 04 7.5, 10 F27). */
function slideBytes(slide: Slide): number {
  return new TextEncoder().encode(canonicalJson(slide)).byteLength;
}

/** The whole Text rewrites a text op cannot survive (SPEC-3 3.5): a set of its own pointer, its block's removal, its slide's replacement. */
function rewritesText(against: Mutation, op: Mutation): boolean {
  if (!isTextOp(op)) return false;
  switch (against.op) {
    case 'block.set':
      return (
        against.slideId === op.slideId && against.blockId === op.blockId && against.path === op.path
      );
    case 'text.replace':
      return (
        against.slideId === op.slideId && against.blockId === op.blockId && against.path === op.path
      );
    case 'block.remove':
      return against.slideId === op.slideId && against.blockId === op.blockId;
    case 'slide.replace':
      // the slide was rewritten (a canvas conversion, the source drawer): a text op on a block
      // whose id survives is kept and re-anchored, the rest return to their author (SPEC-3 3.5)
      return (
        against.slideId === op.slideId &&
        !slideBlocks(against.slide).some((row) => row.block.id === op.blockId)
      );
    case 'slide.remove':
      return against.slideId === op.slideId;
    case 'version.restore':
      return true;
    default:
      return false;
  }
}

/**
 * Transforms one entry's mutations against the mutations that landed since its base (SPEC-3
 * 3.4 step 3): text ops through the schema's transform (identity while B1's functions throw
 * NotImplementedError, which keeps a non concurrent keystroke flowing), a text op against a whole
 * Text rewrite returned to its author, `after` anchors re-resolved by the reducer at apply time,
 * everything else unchanged. Null when nothing survives.
 */
export function transformEntry(
  mutations: readonly Mutation[],
  landed: readonly Mutation[],
): Mutation[] | null {
  let out: Mutation[] = [...mutations];
  for (const against of landed) {
    const next: Mutation[] = [];
    for (const mutation of out) {
      if (rewritesText(against, mutation)) continue;
      if (isTextOp(mutation) && isTextOp(against) && sameText(mutation, against)) {
        try {
          next.push(...transformMutation(mutation, against, 'right'));
        } catch (error) {
          if (error instanceof NotImplementedError) next.push(mutation);
          else throw error;
        }
        continue;
      }
      next.push(mutation);
    }
    out = next;
    if (out.length === 0) return null;
  }
  return out;
}

/** `after` anchors of inserts and moves re-resolve to the end of the slot or section when the anchor left (SPEC-3 3.5). */
export function reanchor(document: DeckDocument, mutation: Mutation): Mutation {
  switch (mutation.op) {
    case 'slide.insert':
    case 'slide.move': {
      if (mutation.after === undefined) return mutation;
      const section = document.deck.sections.find((row) => row.id === mutation.sectionId);
      if (section === undefined || section.slideIds.includes(mutation.after)) return mutation;
      const last = section.slideIds[section.slideIds.length - 1];
      const { after: _after, ...rest } = mutation;
      return last === undefined ? rest : { ...rest, after: last };
    }
    case 'block.insert':
    case 'block.move': {
      if (mutation.after === undefined) return mutation;
      const slide = document.slides[mutation.slideId];
      if (slide === undefined) return mutation;
      const inSlot = slideBlocks(slide).filter((row) => row.slot === mutation.slot);
      if (inSlot.some((row) => row.block.id === mutation.after)) return mutation;
      const last = inSlot[inSlot.length - 1]?.block.id;
      const { after: _after, ...rest } = mutation;
      return last === undefined ? rest : { ...rest, after: last };
    }
    default:
      return mutation;
  }
}

type Candidate = {
  opId: string;
  kind: 'edit' | 'comment';
  mutations?: Mutation[];
  comment?: NewEntry['comment'];
};

/**
 * The splices that undo a refused entry's text splices, by length alone (docs/FOCUS.md rank
 * 13): the entries after a refused one in the same POST were written on a text that carried its
 * insertion, so they are transformed past this undo before they are judged, the way they are
 * transformed past what landed since their base. Before this the later splices of a burst met
 * "text.splice: 10 plus 0 is outside a text of 7 characters" one after another (audit-text row
 * 21). The characters a splice removed are not known here and do not matter to a transform,
 * which reads lengths and offsets; a placeholder of the removed length stands in.
 */
export function undoOfSplices(mutations: readonly Mutation[]): Mutation[] {
  const out: Mutation[] = [];
  for (let i = mutations.length - 1; i >= 0; i -= 1) {
    const mutation = mutations[i];
    if (mutation === undefined || mutation.op !== 'text.splice') continue;
    const { flags: _flags, ...rest } = mutation;
    out.push({ ...rest, remove: mutation.insert.length, insert: 'x'.repeat(mutation.remove) });
  }
  return out;
}

/** Applies one candidate to the running document and validates; the reject reason when it cannot land. */
function landCandidate(
  document: DeckDocument,
  candidate: Candidate,
  canReadSlide: (slideId: string) => boolean,
): { ok: true; document: DeckDocument; mutations: Mutation[] } | { ok: false; rejected: Rejected } {
  if (candidate.kind !== 'edit' || candidate.mutations === undefined) {
    return { ok: true, document, mutations: [] };
  }
  const mutations = candidate.mutations.map((mutation) => reanchor(document, mutation));
  let next: DeckDocument;
  try {
    next = applyMutations(document, mutations).document;
  } catch (error) {
    const touched = touchedSlides(mutations);
    const readable = touched.every(canReadSlide);
    return {
      ok: false,
      rejected: {
        opId: candidate.opId,
        reason: 'invalid',
        ...(readable && error instanceof Error ? { message: error.message } : {}),
      },
    };
  }
  for (const slideId of touchedSlides(mutations)) {
    const slide = next.slides[slideId];
    if (slide !== undefined && slideBytes(slide) > CAPS.slideMaxBytes) {
      return { ok: false, rejected: { opId: candidate.opId, reason: 'too-large' } };
    }
  }
  const validation = validateDocument(next);
  if (!validation.ok) {
    const touched = touchedSlides(mutations);
    const first = refusalIssue(validation.issues, touched);
    return {
      ok: false,
      rejected: {
        opId: candidate.opId,
        reason: 'invalid',
        ...(touched.every(canReadSlide) && first !== undefined
          ? { message: refusalMessage(first) }
          : {}),
      },
    };
  }
  return { ok: true, document: next, mutations };
}

/**
 * The issue a refusal names (the focus round, cycle 2; VERIFICATION C2-F1). The validator sorts
 * its issues by severity, then by file name, so on a document whose slide fails its own schema
 * after the write the manifest's `reference` issue ("No slide file for X": a slide that does not
 * validate is left out of the slide map, and the manifest still lists it) comes before the
 * slide's own issue (`Unknown field "typography"` on a list block, the cause). The seller and
 * the probe need the cause: the first severity 3 issue on a slide the write touched, else the
 * first that is not a reference, else the first. Before this the reject card of a `block.set
 * /typography` on a plain block read "No slide file for blank-1 (slides/blank-1.json)" and three
 * passes read it as a store that had lost a slide body. Pure.
 */
export function refusalIssue(
  issues: ReadonlyArray<Issue>,
  touched: ReadonlyArray<string>,
): Issue | undefined {
  const blocking = issues.filter((issue) => issue.severity === 3);
  const files = new Set(touched.map((slideId) => `slides/${slideId}.json`));
  return (
    blocking.find((issue) => files.has(issue.file)) ??
    blocking.find((issue) => issue.code !== 'reference') ??
    blocking[0]
  );
}

/** The refusal's sentence: the slide file first when the issue is a slide's, then the pointer and the message. */
export function refusalMessage(issue: Issue): string {
  const file = issue.file.startsWith('slides/') ? `${issue.file} ` : '';
  return `${file}${issue.pointer}: ${issue.message}`;
}

export type AdmitInput = {
  post: OpsPost;
  bytes: number;
  identity: RequestIdentity;
  author: Author;
  role: Role;
  /** the request's clock, for tests */
  now?: () => number;
  /** forces a checkpoint at once (an agent write, SPEC-3 0.3) */
  checkpointAtOnce?: boolean;
};

/**
 * The ops route's admission (SPEC-3 3.4): the client binding, the budgets, the base window, then
 * for each entry the transform against what landed since its base, the reducer and the validator
 * on the live document, and the compare and append with the transform hook. An entry that cannot
 * be placed is rejected to its author with its content and a fixed reason and never enters the
 * stream (report 10 F29); the rest land in one append.
 */
export async function admitOps(room: Room, input: AdmitInput): Promise<AdmissionResult> {
  const { channel, deckId } = room;
  const { post, identity } = input;
  const now = input.now ?? (() => Date.now());
  if (!(await clientBoundTo(room, post.clientId, identity))) {
    logSecurityEvent({
      event: 'http.403',
      deckId,
      identity: identity.identity,
      status: 403,
      reason: 'client id not bound to this session',
    });
    return {
      ok: false,
      status: 403,
      code: 'client_unbound',
      message: 'The client id is not bound to this session; open the stream first',
    };
  }
  const window = Math.floor(now() / 60_000);
  const second = Math.floor(now() / 1000);
  const keys = deckKeys(deckId);
  const perSecond = await channel.budget(
    keys.clientBudget(post.clientId, 'ops', second),
    post.entries.length,
    CAPS.opsPerSecondPerClient,
    1000,
  );
  const perMinute = await channel.budget(
    `q:${identity.identity}:ops:${window}`,
    post.entries.length,
    CAPS.opsPerMinute[identity.kind],
    60_000,
  );
  const bytesPerMinute = await channel.budget(
    `q:${identity.identity}:bytes:${window}`,
    input.bytes,
    CAPS.bytesPerMinute[identity.kind],
    60_000,
  );
  const deckBytes = await channel.budget(
    keys
      .clientBudget(post.clientId.slice(0, 32), 'deckBytes', window)
      .replace(`:client:${post.clientId}`, ''),
    input.bytes,
    CAPS.deckBytesPerMinute,
    60_000,
  );
  const over = [perSecond, perMinute, bytesPerMinute, deckBytes].find((row) => !row.ok);
  if (over !== undefined) {
    return {
      ok: false,
      status: 429,
      code: 'rate_limited',
      message: 'Too many operations; slow down',
      retryAfterMs: over.retryAfterMs,
    };
  }
  if (room.tier === 'blob') return admitOnBlob(room, input);
  const live = await room.live();
  const head = live.seq;
  const windowCheck = checkBaseWindow(post.base.seq, head);
  if (!windowCheck.ok) {
    return {
      ok: false,
      status: 409,
      code: 'resync',
      message: `base.seq ${post.base.seq} is more than the window behind the head ${head}`,
      head,
    };
  }
  const canReadSlide = (slideId: string): boolean => {
    const slide = live.document.slides[slideId];
    if (slide === undefined) return true;
    return input.role === 'owner' || input.role === 'editor' || slide.skip !== true;
  };
  const landed =
    post.base.seq < head ? await channel.since(deckId, post.base.seq, head - post.base.seq) : [];
  // what the later entries of this POST are transformed past: what landed since the base, then
  // the undo of every entry refused before them (undoOfSplices)
  const landedMutations = landed.flatMap((entry) => entry.mutations ?? []);
  // a retried POST (a fetch that failed after the server admitted it, a tab that resends its
  // persisted queue) carries the op ids of the first one: an id already in the stream's tail is
  // answered with its entry and never appended twice (SPEC-3 3.4; report 10 F29). Measured
  // before this: a persisted queue of three keystrokes landed as five characters.
  const tail =
    head > 0
      ? await channel.since(deckId, Math.max(0, head - REPLAY_MAX_ENTRIES), REPLAY_MAX_ENTRIES)
      : [];
  const known = new Map<string, Entry>();
  for (const entry of tail) if (entry.clientId === post.clientId) known.set(entry.opId, entry);
  const replayed: Entry[] = [];
  const rejected: Rejected[] = [];
  const stamp = new Date(now()).toISOString();
  const candidates: NewEntry[] = [];
  let running = live.document;
  for (const entry of post.entries) {
    const already = known.get(entry.opId);
    if (already !== undefined) {
      replayed.push(already);
      continue;
    }
    if (entry.kind === 'comment') {
      if (entry.comment === undefined) continue;
      candidates.push({
        rev: live.document.deck.revision,
        kind: 'comment',
        author: input.author,
        clientId: post.clientId,
        opId: entry.opId,
        comment: entry.comment,
        at: stamp,
      });
      continue;
    }
    const transformed = transformEntry(entry.mutations ?? [], landedMutations);
    if (transformed === null) {
      rejected.push({ opId: entry.opId, reason: 'stale' });
      continue;
    }
    const placed = landCandidate(
      running,
      { opId: entry.opId, kind: 'edit', mutations: transformed },
      canReadSlide,
    );
    if (!placed.ok) {
      rejected.push(placed.rejected);
      landedMutations.push(...undoOfSplices(transformed));
      continue;
    }
    running = placed.document;
    candidates.push({
      rev: live.document.deck.revision,
      kind: 'edit',
      author: input.author,
      clientId: post.clientId,
      opId: entry.opId,
      mutations: placed.mutations,
      at: stamp,
    });
  }
  if (candidates.length === 0) {
    return { ok: true, entries: replayed, rejected, head, revision: live.document.deck.revision };
  }
  const result = await appendWithRetry(channel, deckId, head, candidates, (entries, more) => {
    // the head moved while this request transformed: transform once more against what landed
    // (SPEC-3 3.4 step 5); a candidate that cannot be placed is dropped and rejected
    const moreMutations = more.flatMap((entry) => entry.mutations ?? []);
    const base = applyEntries(running, []);
    let document = base;
    try {
      document = applyEntries(live.document, more);
    } catch {
      return null;
    }
    const out: NewEntry[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'edit' || entry.mutations === undefined) {
        out.push(entry);
        continue;
      }
      const transformed = transformEntry(entry.mutations, moreMutations);
      if (transformed === null) {
        rejected.push({ opId: entry.opId, reason: 'stale' });
        continue;
      }
      const placed = landCandidate(
        document,
        { opId: entry.opId, kind: 'edit', mutations: transformed },
        canReadSlide,
      );
      if (!placed.ok) {
        rejected.push(placed.rejected);
        moreMutations.push(...undoOfSplices(transformed));
        continue;
      }
      document = placed.document;
      out.push({ ...entry, mutations: placed.mutations });
    }
    return out;
  });
  if (!result.ok) {
    if (result.reason === 'unplaceable') {
      for (const entry of candidates)
        if (!rejected.some((row) => row.opId === entry.opId))
          rejected.push({ opId: entry.opId, reason: 'stale' });
      return { ok: true, entries: [], rejected, head: result.head, revision: room.revision() };
    }
    return {
      ok: false,
      status: 409,
      code: 'contended',
      message: 'The room is busy; retry',
      head: result.head,
    };
  }
  const commentEntries = result.entries.filter((entry) => entry.kind === 'comment');
  if (commentEntries.length > 0) room.checkpointer.noteComments(commentEntries);
  room.checkpointer.noteAppended(result.entries, input.bytes);
  await appendShifts(room, result.entries, live.document);
  if (input.checkpointAtOnce === true || input.author.kind === 'agent') {
    await room.checkpointer.run({ force: true });
  } else {
    room.checkpointer.schedule();
  }
  const revision = room.revision();
  return {
    ok: true,
    entries: [...replayed, ...result.entries].sort((a, b) => a.seq - b.seq),
    rejected,
    head: result.entries[result.entries.length - 1]?.seq ?? head,
    revision,
  };
}

/**
 * The document the blob tier admits against (docs/FOCUS.md rank 3). The room's live document is
 * this instance's mirror, synced within the store's window; a client whose base is above its
 * revision has seen a commit this instance has not pulled yet, so the store is synced by force
 * and the live document read again before anything is judged against it. Before this an
 * instance that was one revision behind refused the undo of a saved delete as "Slide already
 * exists" and the redo as "No slide", with the mutation shown to the seller (audit-slides rows
 * 93, 95 and 96): the reducer ran on a document the client had never written against.
 */
async function liveForBase(room: Room, baseSeq: number): Promise<LiveDocument> {
  return liveAtLeast(room, baseSeq);
}

/**
 * The live document at or above a revision the caller knows (the focus round, cycle 2): on the
 * blob tier the room's document is this instance's mirror within the store's sync window, so a
 * reader that learned a revision from a write's answer (the editor's reload after a
 * `version.restore`, a tab's resync at an external checkpoint) can land on an instance whose
 * mirror is behind it; the store is synced by force, up to `attempts` times a short pause apart,
 * until the mirror reaches the revision. Before this the reload after a restore read the
 * document from before it and the tab kept that document while its revision moved
 * (VERIFICATION F-versions). On the other tiers the live document is the stream's and is
 * answered as it stands.
 */
export async function liveAtLeast(
  room: Room,
  revision: number | undefined,
  attempts = 3,
): Promise<LiveDocument> {
  let live = await room.live();
  if (room.tier !== 'blob') return live;
  const store = room.store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof store.sync !== 'function') return live;
  if (revision === undefined) {
    // no revision named: the head, read once past the sync window (a page load)
    await store.sync(true);
    return room.live();
  }
  for (let attempt = 0; attempt < attempts && revision > live.document.deck.revision; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    await store.sync(true);
    live = await room.live();
  }
  return live;
}

/**
 * A candidate the reducer refused on the blob tier is a real refusal only when the document it
 * was judged against is the one the client wrote against (the base of the POST). Judged against
 * a document at another revision, the refusal says nothing about the client's write: the
 * answer is a resync at the head, and the client transforms and sends the write again.
 */
export function blobRefusal(
  baseSeq: number,
  liveRevision: number,
  rejected: Rejected,
): { kind: 'reject'; rejected: Rejected } | { kind: 'resync' } {
  if (baseSeq !== liveRevision && rejected.reason === 'invalid') return { kind: 'resync' };
  return {
    kind: 'reject',
    rejected:
      rejected.message === undefined
        ? rejected
        : {
            ...rejected,
            message: `${rejected.message} (this instance's document is at revision ${liveRevision}; the write's base was ${baseSeq})`,
          },
  };
}

/** The blob tier (SPEC-3 3.7 e): every append is a commit; the seq is the revision. */
async function admitOnBlob(room: Room, input: AdmitInput): Promise<AdmissionResult> {
  const { post, identity } = input;
  const live = await liveForBase(room, post.base.seq);
  const stamp = new Date((input.now ?? (() => Date.now()))()).toISOString();
  const rejected: Rejected[] = [];
  const candidates: NewEntry[] = [];
  let running = live.document;
  // the undo of every entry refused so far, which the later entries are transformed past
  const refusedUndo: Mutation[] = [];
  for (const entry of post.entries) {
    if (entry.kind === 'comment') {
      if (entry.comment !== undefined)
        candidates.push({
          rev: live.document.deck.revision,
          kind: 'comment',
          author: input.author,
          clientId: post.clientId,
          opId: entry.opId,
          comment: entry.comment,
          at: stamp,
        });
      continue;
    }
    const mutations =
      refusedUndo.length === 0
        ? (entry.mutations ?? [])
        : transformEntry(entry.mutations ?? [], refusedUndo);
    if (mutations === null) {
      rejected.push({ opId: entry.opId, reason: 'stale' });
      continue;
    }
    const placed = landCandidate(
      running,
      { opId: entry.opId, kind: 'edit', mutations },
      () => true,
    );
    if (!placed.ok) {
      refusedUndo.push(...undoOfSplices(mutations));
      const refusal = blobRefusal(post.base.seq, live.document.deck.revision, placed.rejected);
      if (refusal.kind === 'resync') {
        return {
          ok: false,
          status: 409,
          code: 'resync',
          message: `The deck is at revision ${live.document.deck.revision} on this instance and the write was made against ${post.base.seq}; reload and rebase`,
          head: live.document.deck.revision,
        };
      }
      rejected.push(refusal.rejected);
      continue;
    }
    running = placed.document;
    candidates.push({
      rev: live.document.deck.revision,
      kind: 'edit',
      author: input.author,
      clientId: post.clientId,
      opId: entry.opId,
      mutations: placed.mutations,
      at: stamp,
    });
  }
  void identity;
  if (candidates.length === 0)
    return {
      ok: true,
      entries: [],
      rejected,
      head: live.seq,
      revision: live.document.deck.revision,
    };
  const result = await room.channel.append(room.deckId, live.document.deck.revision, candidates);
  if (!result.ok) {
    return {
      ok: false,
      status: 409,
      code: 'resync',
      message: `The deck moved to revision ${result.head}; reload and rebase`,
      head: result.head,
    };
  }
  const revision = result.entries[0]?.seq ?? live.document.deck.revision;
  return { ok: true, entries: result.entries, rejected, head: revision, revision };
}

// ---------------------------------------------------------------------------------------------
// Presence (SPEC-3 3.8) and the roster by role (4.8)

type IdentityCacheRow = { at: number; identity: ResolvedIdentity };
const identityCache = new Map<string, IdentityCacheRow>();
const IDENTITY_CACHE_MS = 5000;

async function cachedIdentity(identity: RequestIdentity): Promise<ResolvedIdentity> {
  const key = identity.identity;
  const hit = identityCache.get(key);
  const now = Date.now();
  if (hit !== undefined && now - hit.at < IDENTITY_CACHE_MS) return hit.identity;
  const resolved =
    identity.ctx.agent !== undefined
      ? resolvePrincipal(`agent:${identity.ctx.agent.tokenId}`, {
          record: () => null,
          alias: () => null,
          account: () => null,
          token: () => ({
            tokenId: identity.ctx.agent?.tokenId ?? '',
            ownerId: identity.ctx.agent?.ownerId ?? '',
            name: identity.ctx.agent?.name ?? 'Agent',
          }),
        })
      : resolveIdentity(identity.principalId ?? identity.identity, identity.record);
  identityCache.set(key, { at: now, identity: resolved });
  return resolved;
}

/** The hue slot the room grants a principal (SPEC-3 3.8; research 11 3.1): its preferred slot, else the least used, held for the entry's life. */
export function grantHueSlot(principalId: string, roster: readonly RosterEntry[]): HueSlot {
  const own = roster.find((row) => row.principalId === principalId);
  if (own !== undefined) return (own.hueSlot + 1) as HueSlot;
  const held = roster.map((row) => (row.hueSlot + 1) as HueSlot);
  return assignHueSlot(preferredHueSlot(principalId), held);
}

/**
 * The roster entry the presence route writes: the client's state and the identity fields from
 * the session, never from the body (report 10 F31); the pointer only for roles that may edit and
 * only for the first 20 clients by join order (SPEC-3 3.8).
 */
export async function rosterEntryFor(
  room: Room,
  identity: RequestIdentity,
  role: Role,
  post: PresencePost,
  existing: readonly RosterEntry[],
): Promise<RosterEntry> {
  const resolved = await cachedIdentity(identity);
  const principalId =
    identity.ctx.agent !== undefined ? `agent:${identity.ctx.agent.tokenId}` : identity.identity;
  const slot = grantHueSlot(principalId, existing);
  const mark = markSpec(resolved, { hueSlot: slot });
  const canEdit = role === 'owner' || role === 'editor';
  const joinOrder = existing.findIndex((row) => row.clientId === post.clientId);
  const pointerAllowed =
    canEdit &&
    (joinOrder < 0 ? existing.length < LIVE_POINTERS_MAX : joinOrder < LIVE_POINTERS_MAX);
  const { pointer, ...rest } = post;
  void room;
  return {
    ...rest,
    ...(pointer !== undefined && pointerAllowed && post.pointerOn ? { pointer } : {}),
    principalId,
    label: resolved.displayName,
    trust: resolved.trust as Trust,
    mark: mark as unknown as Record<string, unknown>,
    hueSlot: slot - 1,
    kind: resolved.kind === 'agent' ? 'agent' : 'human',
    role,
  };
}

/** The word a link visitor sees instead of a named person (SPEC-3 0.12, 4.8). */
export function roleWord(role: Role): string {
  switch (role) {
    case 'owner':
      return 'The owner';
    case 'editor':
      return 'An editor';
    case 'commenter':
      return 'A commenter';
    case 'viewer':
      return 'A viewer';
  }
}

export type ViewerFacts = {
  role: Role;
  via: string;
  /** the record's switch: names shown to people admitted by link (0.12) */
  showNames: boolean;
  readComments: boolean;
  /** the reader's principal id, so an `inbox` event reaches its principal's connections only (SPEC-3 3.3) */
  principalId?: string;
};

/**
 * A roster entry as one reader may see it (SPEC-3 4.8): people with a grant see every named
 * person; a person admitted by link sees named people as their role word unless the owner turned
 * the switch on; anonymous labels and agents are shown to everyone as they are.
 */
export function rosterEntryForReader(entry: RosterEntry, reader: ViewerFacts): RosterEntry {
  const byLink = reader.via === 'link' || reader.via === 'open';
  if (!byLink || reader.showNames) return entry;
  if (entry.trust === 'label' || entry.trust === 'agent') return entry;
  const word = roleWord(entry.role);
  const mark = {
    ...entry.mark,
    initials: word.split(' ').pop()?.[0]?.toUpperCase() ?? '',
    label: word,
  };
  return { ...entry, label: word, trust: 'label', mark };
}

/** A slide field the reader may not see: the notes below editor (report 10 F21). */
function stripNotes(entry: Entry): Entry | null {
  if (entry.kind !== 'edit' || entry.mutations === undefined) return entry;
  const mutations: Mutation[] = [];
  for (const mutation of entry.mutations) {
    if (mutation.op === 'slide.set' && mutation.path === '/notes') continue;
    if (mutation.op === 'slide.insert' || mutation.op === 'slide.replace') {
      const { notes: _notes, ...slide } = mutation.slide as Slide & { notes?: string };
      mutations.push({ ...mutation, slide: slide as Slide });
      continue;
    }
    mutations.push(mutation);
  }
  if (mutations.length === 0) return null;
  return { ...entry, mutations };
}

/**
 * The events one stream forwards (SPEC-3 3.3, report 10 F25): a viewer receives checkpoints,
 * presence and the deck level notices and never raw operations; a commenter receives operations
 * with the notes stripped; comment entries only for a reader with `readComments`.
 */
export function filterEventForReader(event: RoomEvent, reader: ViewerFacts): RoomEvent | null {
  const canSeeOps =
    reader.role === 'owner' || reader.role === 'editor' || reader.role === 'commenter';
  const fullOps = reader.role === 'owner' || reader.role === 'editor';
  const filterEntry = (entry: Entry): Entry | null => {
    if (entry.kind === 'comment') return reader.readComments ? entry : null;
    if (!canSeeOps) return null;
    return fullOps ? entry : stripNotes(entry);
  };
  switch (event.type) {
    case 'op': {
      const entry = filterEntry(event.entry);
      return entry === null ? null : { type: 'op', entry };
    }
    case 'ops': {
      const entries = event.entries
        .map(filterEntry)
        .filter((entry): entry is Entry => entry !== null);
      return { type: 'ops', entries };
    }
    case 'presence':
      return { ...event, state: rosterEntryForReader(event.state, reader) };
    case 'reject':
      return event;
    case 'inbox':
      if (event.principalId !== undefined && event.principalId !== reader.principalId) return null;
      return { type: 'inbox', unread: event.unread };
    default:
      return event;
  }
}

/** The facts of a reader from the access record and the decision. */
export async function viewerFacts(
  deckId: string,
  decision: Extract<ShadowedDecision, { ok: true }>,
  ctx: AuthContext,
  principalId?: string,
): Promise<ViewerFacts> {
  const record: AccessRecord | null = await readAccess(deckId).catch(() => null);
  const readComments = await authorize(ctx, deckId, 'readComments', { transport: 'route' });
  return {
    role: decision.role,
    via: decision.via,
    showNames: record?.settings.showNamesToLinkVisitors ?? false,
    readComments: readComments.ok && readComments.shadow === undefined,
    ...(principalId === undefined ? {} : { principalId }),
  };
}

/** The count of editing connections in a roster (SPEC-3 0.9). */
export function editingCount(roster: readonly RosterEntry[]): number {
  return roster.filter((row) => row.role === 'owner' || row.role === 'editor').length;
}

/** True when a new editing tab must open in Viewing mode (SPEC-3 0.9). */
export function overEditingCeiling(roster: readonly RosterEntry[], role: Role): boolean {
  return (role === 'owner' || role === 'editor') && editingCount(roster) >= EDITING_TABS_MAX;
}

/** The presence rate per client: 15 states a second, coalesced (SPEC-3 3.8). */
export async function presenceBudget(
  room: Room,
  clientId: string,
  now = Date.now(),
): Promise<boolean> {
  const second = Math.floor(now / 1000);
  const result = await room.channel.budget(
    deckKeys(room.deckId).clientBudget(clientId, 'presence', second),
    1,
    PRESENCE_PER_SECOND,
    1000,
  );
  return result.ok;
}

/** Issues a client id and binds it to the session (report 10 F26). */
/** The signed half of a client id: 16 hex of an HMAC over the deck, the identity and the nonce. */
function clientIdMac(deckId: string, identity: string, nonce: string): string {
  return createHmac('sha256', studioSessionSecret())
    .update(`client\n${deckId}\n${identity}\n${nonce}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * A server issued client id (report 10 F26): 32 hex characters, the protocol's shape, made of a
 * 16 hex nonce and a 16 hex MAC over the deck and the identity under the session secret. The
 * binding is stored on the channel as before; the MAC lets another instance recognise the id as
 * this identity's when the store is per instance (the blob tier of SPEC-3 2.5, where the stream
 * that bound the id and the ops or presence request that carries it land on different
 * functions; VERIFICATION-3 findings 5 and 25: every write on the preview answered 403
 * `client_unbound`, so a keystroke stayed pending and the chip never appeared).
 */
export function mintClientId(deckId: string, identity: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${nonce}${clientIdMac(deckId, identity, nonce)}`;
}

/** True when the client id's own MAC names this deck and this identity. */
export function clientIdMatches(deckId: string, clientId: string, identity: string): boolean {
  if (!/^[0-9a-f]{32}$/.test(clientId)) return false;
  const nonce = clientId.slice(0, 16);
  const given = Buffer.from(clientId.slice(16), 'utf8');
  const expected = Buffer.from(clientIdMac(deckId, identity, nonce), 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The client binding check of the ops and presence routes (SPEC-3 3.3, 3.4; F26): the channel's
 * stored binding decides when it exists; when this instance holds none (another instance bound
 * it, or the TTL lapsed) the id's MAC decides and the binding is stored here for the next call.
 * A foreign id (another session's, another deck's, a made up one) is never admitted.
 */
export async function clientBoundTo(
  room: Room,
  clientId: string,
  identity: RequestIdentity,
): Promise<boolean> {
  const owner = await room.channel.presence.owner(room.deckId, clientId);
  if (owner !== null) return owner === identity.identity;
  if (!clientIdMatches(room.deckId, clientId, identity.identity)) return false;
  await room.channel.presence.bind(room.deckId, clientId, identity.identity, CLIENT_BINDING_TTL_MS);
  return true;
}

/** At most this many earlier ids a stream open may retire (hotfix 2 cause B1). */
export const RETIRE_MAX = 8;

/**
 * Removes the roster rows of the client ids a tab held before this page (hotfix 2, build-4/
 * hotfix-2.md causes B1 and B2): a reload posts no leave, and on the blob tier the roster is per
 * instance, so the reloaded tab's `hello` listed its own earlier id as a collaborator. The ids
 * come from the stream open's `retire` query (comma separated); an id is retired only when its
 * MAC names this deck and this identity (`clientIdMatches`), so a tab retires its own principal's
 * ids alone and never a stranger's. Answers the ids it retired.
 */
export async function retireClients(
  room: Room,
  raw: string | null,
  identity: RequestIdentity,
  exceptClientId?: string,
): Promise<string[]> {
  if (raw === null || raw === '') return [];
  const seen = new Set<string>();
  const retired: string[] = [];
  for (const candidate of raw.split(',')) {
    const clientId = candidate.trim();
    if (clientId === '' || clientId === exceptClientId || seen.has(clientId)) continue;
    seen.add(clientId);
    if (seen.size > RETIRE_MAX) break;
    if (!clientIdMatches(room.deckId, clientId, identity.identity)) continue;
    await room.channel.presence.leave(room.deckId, clientId).catch(() => undefined);
    retired.push(clientId);
  }
  return retired;
}

export async function bindClient(room: Room, identity: RequestIdentity): Promise<string> {
  const clientId = mintClientId(room.deckId, identity.identity);
  await room.channel.presence.bind(room.deckId, clientId, identity.identity, CLIENT_BINDING_TTL_MS);
  return clientId;
}

export { CLIENT_BINDING_TTL_MS, PRESENCE_EXPIRY_MS };

/** The replay a stream open sends first (SPEC-3 3.3 `ops` or `resync`; report 10 F25). */
export async function replayFor(
  room: Room,
  position: number,
  reader: ViewerFacts,
): Promise<RoomEvent> {
  const live = await room.live();
  const plan = replayPlan(position, live.seq);
  if (plan.kind === 'resync') return { type: 'resync', revision: room.revision() };
  const entries: Entry[] = [];
  let bytes = 0;
  let from = plan.from;
  while (from < live.seq && entries.length < REPLAY_MAX_ENTRIES && bytes < REPLAY_MAX_BYTES) {
    const page = await room.channel.since(
      room.deckId,
      from,
      Math.min(256, REPLAY_MAX_ENTRIES - entries.length),
    );
    if (page.length === 0) break;
    for (const entry of page) {
      bytes += JSON.stringify(entry).length;
      entries.push(entry);
      from = entry.seq;
    }
  }
  const filtered = filterEventForReader({ type: 'ops', entries }, reader);
  return filtered ?? { type: 'ops', entries: [] };
}

// ---------------------------------------------------------------------------------------------
// Stream counters (report 10 F24): per identity, per address, per instance, on this instance

export type StreamCounters = {
  /** takes one slot; the refusal names the cap that is full */
  take: (
    identity: string,
    kind: IdentityKind,
    address: string | null,
  ) => { ok: true; release: () => void } | { ok: false; cap: 'identity' | 'ip' | 'instance' };
  counts: () => { total: number; identities: number };
};

export function createStreamCounters(): StreamCounters {
  const byIdentity = new Map<string, number>();
  const byAddress = new Map<string, number>();
  let total = 0;
  const bump = (map: Map<string, number>, key: string, by: number): void => {
    const next = (map.get(key) ?? 0) + by;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  };
  return {
    take(identity, kind, address) {
      if (total >= CAPS.streams.instance) return { ok: false, cap: 'instance' };
      if ((byIdentity.get(identity) ?? 0) >= CAPS.streams[kind])
        return { ok: false, cap: 'identity' };
      if (address !== null && (byAddress.get(address) ?? 0) >= CAPS.streams.ip)
        return { ok: false, cap: 'ip' };
      total += 1;
      bump(byIdentity, identity, 1);
      if (address !== null) bump(byAddress, address, 1);
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          total -= 1;
          bump(byIdentity, identity, -1);
          if (address !== null) bump(byAddress, address, -1);
        },
      };
    },
    counts: () => ({ total, identities: byIdentity.size }),
  };
}

export function streamCounters(): StreamCounters {
  return state().streams;
}

/** The comment thread ids a list of entries names, for the checkpoint event. */
export function threadIdsOf(entries: readonly Entry[]): string[] {
  const out = new Set<string>();
  for (const entry of entries)
    if (entry.comment !== undefined) out.add(commentThreadId(entry.comment));
  return [...out];
}

/** Whether the studio runs hosted, for the routes' cookie attributes. */
export function hostedRoom(): boolean {
  return isHosted();
}

// ---------------------------------------------------------------------------------------------
// The HTTP rules of the room routes (SPEC-3 3.3, 3.11, 8.7; report 10 F30)

/** The body cap of the ops route (SPEC-3 3.3): 256 kB. */
export const OPS_BODY_MAX_BYTES = 256 * 1024;

export type RouteRefusal = { status: 400 | 403 | 413 | 415; code: string; message: string };

/** The host of the request as the browser saw it (the proxy header only under trust, headers.ts). */
function requestHostOf(request: Request): string {
  const host = request.headers.get('host');
  if (host !== null && host !== '') return host.trim().toLowerCase();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The cross site rule of the room routes: a browser's POST carries `Sec-Fetch-Site` (same-origin
 * or none pass), else an `Origin` that must name this host; a request with neither is a non
 * browser client (the CLI, an agent) and passes on its bearer rule. JSON routes require
 * `Content-Type: application/json` (report 10 F30).
 */
export function refuseCrossSite(request: Request): RouteRefusal | null {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) {
    if (site === 'same-origin' || site === 'none') return null;
    return {
      status: 403,
      code: 'cross_site',
      message: 'This route takes same origin requests only',
    };
  }
  const origin = request.headers.get('origin');
  if (origin === null || origin === 'null') return null;
  try {
    const host = new URL(origin).host.toLowerCase();
    if (host === requestHostOf(request)) return null;
  } catch {
    // an origin that does not parse is refused below
  }
  return { status: 403, code: 'cross_site', message: 'This route takes same origin requests only' };
}

export function refuseNonJson(request: Request): RouteRefusal | null {
  const type = request.headers.get('content-type') ?? '';
  if (/^application\/json(\s*;.*)?$/i.test(type.trim())) return null;
  return {
    status: 415,
    code: 'content_type',
    message: 'This route takes application/json',
  };
}

/** Reads a JSON body up to a cap; a larger one is a 413 before any parse. */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown; bytes: number } | { ok: false; refusal: RouteRefusal }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return {
      ok: false,
      refusal: { status: 413, code: 'too_large', message: `The body is at most ${maxBytes} bytes` },
    };
  }
  const text = await request.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    return {
      ok: false,
      refusal: { status: 413, code: 'too_large', message: `The body is at most ${maxBytes} bytes` },
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown, bytes };
  } catch {
    return {
      ok: false,
      refusal: { status: 400, code: 'invalid_json', message: 'The body is not JSON' },
    };
  }
}

/** The client address for the per address stream cap (headers.ts clientAddress; null on a checkout). */
export function streamAddress(request: Request): string | null {
  const vercel = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip');
  if (process.env.VERCEL !== undefined && process.env.VERCEL !== '' && vercel !== null)
    return vercel.split(',')[0]?.trim() ?? null;
  if (process.env.TURBOSLIDE_TRUST_PROXY === '1') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded !== null) return forwarded.split(',')[0]?.trim() ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Server side writes through the room (SPEC-3 3.7 c; 11.3 `writeDeck`)

export type ServerWriteInput = {
  author: Author;
  mutations: Mutation[];
  /** the document revision the writer read */
  baseRevision: number;
  /** keep the exact revision check; the default is the per touched slide rule of 3.7 c */
  strict?: boolean;
  note?: string;
};

export type ServerWriteResult =
  | { ok: true; revision: number; record: VersionRecord; seq: number }
  | {
      ok: false;
      code: 'conflict';
      message: string;
      currentRevision: number;
      current: DeckDocument;
      since: VersionRecord[];
    }
  | { ok: false; code: 'invalid'; message: string };

/**
 * An agent's or the editor's strict write admitted through the room and checkpointed at once
 * (SPEC-3 3.7 c): the base is checked per touched slide unless `strict`, the mutations apply to
 * the live document, the entry lands in the stream (every tab receives it) and the checkpointer
 * commits it, so the answer carries a revision and its record as `writeDeck` always has. A
 * `version.restore` never rides the stream (a tab cannot replay it without the log): it commits
 * through the store and the follower announces the external checkpoint.
 */
/**
 * A store error that means another instance won the write: `ConflictError` (a named version or
 * a comment index taken first) and the Blob mirror's `StaleMirrorError` (the store moved between
 * the head read and the pull). Both are a 409 by the contract of 6.2, never a 500.
 */
export function isLostRace(error: unknown): boolean {
  if (error instanceof ConflictError) return true;
  return error instanceof Error && error.name === 'StaleMirrorError';
}

export async function admitServerWrite(
  room: Room,
  input: ServerWriteInput,
): Promise<ServerWriteResult> {
  const { store, channel, deckId } = room;
  const isRestore = input.mutations.some((mutation) => mutation.op === 'version.restore');
  if (room.tier === 'blob' || isRestore) {
    let outcome: Awaited<ReturnType<DeckStore['write']>>;
    try {
      outcome = await store.write(
        {
          baseRevision: input.baseRevision,
          author: input.author,
          mutations: input.mutations,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        { force: true },
      );
    } catch (error) {
      // a race the store reports as an error (a mirror behind the store, a named version taken
      // first) is a lost race, answered as the conflict of 6.2 (VERIFICATION-3 finding 19)
      if (!isLostRace(error)) throw error;
      const current = await store.read();
      const records = await store.records();
      return {
        ok: false,
        code: 'conflict',
        message: error instanceof Error ? error.message : String(error),
        currentRevision: current.document.deck.revision,
        current: current.document,
        since: records.filter((record) => record.revision > input.baseRevision),
      };
    }
    if (!outcome.ok) {
      if (outcome.code === 'conflict') {
        const records = await store.records();
        return {
          ok: false,
          code: 'conflict',
          message: outcome.message,
          currentRevision: outcome.currentRevision,
          current: outcome.current,
          since: records.filter((record) => record.revision > input.baseRevision),
        };
      }
      // the refusal names the two revisions (docs/FOCUS.md rank 3): the instance's document and
      // the write's base, so a probe records both on every refused write
      const current = await store.revision().catch(() => input.baseRevision);
      return {
        ok: false,
        code: 'invalid',
        message: `${outcome.message} (this instance's document is at revision ${current}; the write's base was ${input.baseRevision})`,
      };
    }
    // the follower turns the record into stream entries or an external checkpoint at once
    await room.follow();
    return { ok: true, revision: outcome.revision, record: outcome.entry, seq: outcome.revision };
  }
  const live = await room.live();
  const current = live.document.deck.revision;
  if (input.baseRevision !== current) {
    const records = await store.records();
    const since = records.filter((record) => record.revision > input.baseRevision);
    const mine = new Set(touchedSlides(input.mutations));
    const changed = new Set<string>();
    for (const record of since) for (const id of touchedSlides(record.mutations)) changed.add(id);
    const covered = coveredSeq(records);
    if (live.seq > covered) {
      const entries = await channel.since(deckId, covered, live.seq - covered);
      for (const entry of entries)
        for (const id of touchedSlides(entry.mutations ?? [])) changed.add(id);
    }
    const overlap = [...mine].some((id) => changed.has(id));
    const deckLevel =
      input.mutations.some((mutation) => !('slideId' in mutation)) ||
      since.some((record) => record.mutations.some((mutation) => !('slideId' in mutation)));
    if (input.strict === true || overlap || deckLevel) {
      return {
        ok: false,
        code: 'conflict',
        message:
          input.strict === true
            ? `baseRevision ${input.baseRevision} is stale; the document is at revision ${current}`
            : `a slide this write touches changed since revision ${input.baseRevision}; the document is at revision ${current}`,
        currentRevision: current,
        current: live.document,
        since,
      };
    }
  }
  const opId = `server:${crypto.randomUUID()}`;
  const placed = landCandidate(
    live.document,
    { opId, kind: 'edit', mutations: input.mutations },
    () => true,
  );
  if (!placed.ok) {
    return {
      ok: false,
      code: 'invalid',
      message: placed.rejected.message ?? `the write does not apply (${placed.rejected.reason})`,
    };
  }
  const entry: NewEntry = {
    rev: current,
    kind: 'edit',
    author: input.author,
    clientId: 'server',
    opId,
    mutations: placed.mutations,
    at: new Date().toISOString(),
  };
  const result = await appendWithRetry(channel, deckId, live.seq, [entry], (entries, more) => {
    const moreMutations = more.flatMap((row) => row.mutations ?? []);
    let document: DeckDocument;
    try {
      document = applyEntries(live.document, more);
    } catch {
      return null;
    }
    const out: NewEntry[] = [];
    for (const row of entries) {
      const transformed = transformEntry(row.mutations ?? [], moreMutations);
      if (transformed === null) return null;
      const again = landCandidate(
        document,
        { opId: row.opId, kind: 'edit', mutations: transformed },
        () => true,
      );
      if (!again.ok) return null;
      document = again.document;
      out.push({ ...row, mutations: again.mutations });
    }
    return out;
  });
  if (!result.ok) {
    const fresh = await room.live();
    return {
      ok: false,
      code: 'conflict',
      message: 'The write could not be placed on the current document; read it and retry',
      currentRevision: fresh.document.deck.revision,
      current: fresh.document,
      since: (await store.records()).filter((record) => record.revision > input.baseRevision),
    };
  }
  const admitted = result.entries[0];
  const seq = admitted?.seq ?? live.seq;
  room.checkpointer.noteAppended(result.entries, JSON.stringify(entry).length);
  await appendShifts(room, result.entries, live.document);
  // the checkpoint at once (SPEC-3 0.3); another instance's run covers it when the lock is held
  let record: VersionRecord | undefined;
  for (let attempt = 0; attempt < 10 && record === undefined; attempt += 1) {
    const checkpoint = await room.checkpointer.run({ force: true });
    if (checkpoint.ok) {
      record = checkpoint.committed.find(
        (row) => row.ops !== undefined && row.ops.fromSeq <= seq && seq <= row.ops.toSeq,
      );
      if (record === undefined && checkpoint.toSeq >= seq) break;
    } else if (checkpoint.reason === 'locked') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    } else {
      break;
    }
  }
  if (record === undefined) {
    const records = await store.records();
    record = records.find(
      (row) => row.ops !== undefined && row.ops.fromSeq <= seq && seq <= row.ops.toSeq,
    );
  }
  if (record === undefined) {
    return {
      ok: false,
      code: 'invalid',
      message:
        'The write landed in the room but no checkpoint committed it yet; read the deck again',
    };
  }
  return { ok: true, revision: record.revision, record, seq };
}

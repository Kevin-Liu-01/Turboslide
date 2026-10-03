import { createHmac, timingSafeEqual } from 'node:crypto';

import { Redis } from 'ioredis';

import { authorize as bearerAuthorize } from '@turboslide/agent/http/auth';
import type { AuthContext, Principal, Role } from '@turboslide/identity/access';
import { isPrincipalId, parsePrincipalId } from '@turboslide/identity/ids';
import { markSpec } from '@turboslide/identity/marks';
import { newPrincipalRecord } from '@turboslide/identity/principal';
import type { PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
import { resolvePrincipal, toIdentityView } from '@turboslide/identity/resolve';
import type {
  AccountProfile,
  IdentityView,
  ResolvedIdentity,
  Trust,
} from '@turboslide/identity/resolve';
import { appendWithRetry, CAPS, checkBaseWindow, replayPlan } from '@turboslide/realtime/admission';
import type { IdentityKind } from '@turboslide/realtime/admission';
import { blobChannel, synthesizeReplayed } from '@turboslide/realtime/blob';
import { doChannel, isDoChannel } from '@turboslide/realtime/do';
import type { DoChannel } from '@turboslide/realtime/do';
import type {
  Entry,
  NewEntry,
  RealtimeChannel,
  RealtimeTier,
  RoomEvent,
  RosterEntry,
} from '@turboslide/realtime/channel';
import { commentThreadId } from '@turboslide/realtime/channel';
import { deckKeys } from '@turboslide/realtime/keys';
import { memoryChannel } from '@turboslide/realtime/memory';
import { ioredisCommands, redisChannel } from '@turboslide/realtime/redis';
import type { RedisCommands } from '@turboslide/realtime/redis';
import {
  BASE_SEQ_WINDOW,
  CLIENT_BINDING_TTL_MS,
  LIVE_POINTERS_MAX,
  PRESENCE_EXPIRY_MS,
  PRESENCE_PER_SECOND,
  REPLAY_MAX_BYTES,
  REPLAY_MAX_ENTRIES,
} from '@turboslide/realtime/protocol';
import { STREAM_HEARTBEAT_MS } from '@turboslide/realtime/protocol';
import type { OpsPost, PresencePost } from '@turboslide/realtime/protocol';
import {
  BLOB_TIER_NOTICE,
  ROOM_BEARER_VARIABLE,
  selectRealtime,
} from '@turboslide/realtime/select';
import type { RealtimeSelection } from '@turboslide/realtime/select';
import {
  BETWEEN_MAX_BYTES,
  BETWEEN_MAX_ENTRIES,
  betweenEntries,
  editingCount,
  entryRun,
  filterEventForReader as filterEventForReaderCore,
  grantHueSlot,
  landCandidate,
  landedOf,
  landedOwn,
  overEditingCeiling,
  reanchor,
  reanchorAll,
  refusalIssue,
  refusalMessage,
  roleMark,
  roleWord,
  rosterEntryForReader as rosterEntryForReaderCore,
  touchedSlides,
  transformEntry,
  undoOfSplices,
  yieldConcurrentConversion,
} from '@turboslide/realtime/room-core';
import type { Landed, ReaderDeps, Rejected, ViewerFacts } from '@turboslide/realtime/room-core';
import type { AccessRecord } from '@turboslide/schema/access';
import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { boundedBlobClient } from '@turboslide/store/blob-store';
import type { BlobClient } from '@turboslide/store/blob-store';
import { localIndexEtag, watchSidecarIndex } from '@turboslide/store/comments-store';
import { sharedPresence } from '@turboslide/store/presence-store';
import type { SharedPresence } from '@turboslide/store/presence-store';
import { headPulse, isStoreBusy, storeRetryAfterMs } from '@turboslide/store/pulse';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import {
  avatarChoiceFromIndex,
  capabilitiesOf,
  displayNameFromIndex,
  dropLinkGrantCache,
  effectiveAccess,
  indexFactsFor,
  readAccess,
  recordWithIndexFacts,
  refreshIndexFacts,
} from './access';
import { agentAuth } from './auth';
import {
  authorize,
  bootstrapAgentContext,
  cookieLinkGrants,
  denialBody,
  linkGrantsFor,
  unionLinkGrants,
} from './authorize';
import type { Capability, ShadowedDecision } from './authorize';
import {
  accountSession,
  bindIdentityRedis,
  forgetAccountFacts,
  identityRuntime,
  linkAnonymous,
  principalKvOf,
  resolveIdentity as resolveThroughRuntime,
} from './auth/identity';
import { studioSessionSecret } from './auth/middleware';
import { selectPrincipalStore } from './auth/principal';
import type { RedisKvLike } from './auth/secondary-storage';
import { boundPrincipal, ensurePrincipal, readPrincipal } from './auth/session';
import { applyStreamEntries, createCheckpointer, coveredSeq } from './checkpoint';
import { roomHost, roomInsecure } from './room-ticket';
import { commentCapabilityOf, commentsApplierFor, shiftEntriesFor } from './comments';
import type { CommentActionId, CommentCaller } from './comments';
import type { Checkpointer } from './checkpoint';
import { logSecurityEvent } from './log';
import {
  deckDir,
  exportBlobClient,
  hasStoredDeck,
  isHosted,
  openDeckStore,
  stateDir,
} from './root';

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
    /** the tier the instance serves now: the selection's, or the blob tier after the hand off of docs/REALTIME.md 3.8 */
    selection: RealtimeSelection;
    channel: RealtimeChannel;
    rooms: Map<string, Promise<Room>>;
    principals: PrincipalStore;
    streams: StreamCounters;
    /** the raw Redis commands on the redis tier (the inbox, the session directory), null elsewhere */
    redis: RedisCommands | null;
    /** the blob tier's shared roster (store/presence-store.ts), for the leave that carries the beacon's clock (`leavePresence`); absent elsewhere */
    presence?: SharedPresence<RosterEntry>;
    /** the selection the environment made, kept for the hand back */
    selected: RealtimeSelection;
    /** the redis channel on the redis tier, null elsewhere; the hand off reads its `realtime` flag */
    redisChannel: RealtimeChannel | null;
    /** the Worker's channel on the do tier (docs/CLOUDFLARE.md 3.6.1), null elsewhere; the hand off of 3.8 reads its `/health` */
    doChannel: DoChannel | null;
    /** the blob channel the redis tier falls to, built on the first hand off */
    fallback?: { channel: RealtimeChannel; presence?: SharedPresence<RosterEntry> };
  };
};

const shared = globalThis as Shared;

function log(line: string): void {
  console.error(`turboslide room: ${line}`);
}

/** `redis.unavailable` once a minute while the flag read keeps failing (docs/REALTIME.md 3.8). */
let unavailableLoggedAt = 0;
function noteRedisUnavailable(name: string, error: unknown): void {
  const now = Date.now();
  if (now - unavailableLoggedAt < 60_000) return;
  unavailableLoggedAt = now;
  logSecurityEvent({
    event: 'redis.unavailable',
    killSwitch: name,
    reason: error instanceof Error ? error.message : String(error),
  });
}

function buildChannel(selection: RealtimeSelection): {
  channel: RealtimeChannel;
  redis: RedisCommands | null;
  presence?: SharedPresence<RosterEntry>;
  /** the ioredis client of the redis tier, for the principal records and the identity runtime */
  kv?: RedisKvLike;
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
          onUnavailable: noteRedisUnavailable,
        }),
        redis,
        kv: client as unknown as RedisKvLike,
      };
    }
    case 'do': {
      // the Worker's channel (docs/CLOUDFLARE.md 3.6.1): the object orders the deck, the function
      // publishes, reads the roster and the document, flushes and forwards writes under the bearer
      const host = roomHost();
      const bearer = process.env[ROOM_BEARER_VARIABLE] ?? '';
      if (host === null || bearer === '') {
        throw new TypeError(`the do tier needs TURBOSLIDE_ROOM_HOST and ${ROOM_BEARER_VARIABLE}`);
      }
      return {
        channel: doChannel({
          host,
          bearer,
          insecure: roomInsecure(),
          onError: (error, context) =>
            log(`worker ${context}: ${error instanceof Error ? error.message : String(error)}`),
        }),
        redis: null,
      };
    }
    case 'blob': {
      const onError = (error: unknown, context: string): void =>
        log(`${context}: ${error instanceof Error ? error.message : String(error)}`);
      // the roster every instance agrees on and the comments index other instances push, over
      // the export Blob client (store/presence-store.ts, comments-store.ts `watchSidecarIndex`;
      // the focus round cycle 3, VERIFICATION C2-F28), read when the deck's pulse moved
      // (store/pulse.ts; the cycle 3 fix round's budget: one head per tick per open deck per
      // instance, none without a stream). `channel` is assigned below; the sink runs only once a
      // presence write reaches the room, so the reference is settled by then.
      let channel: RealtimeChannel | undefined;
      // every call of the shared half meets the store's deadlines (blob-store.ts boundedBlobClient)
      let boundedExport: Promise<BlobClient | null> | undefined;
      const exportClient = (): Promise<BlobClient | null> => {
        boundedExport ??= exportBlobClient()
          .then((client) => (client === null ? null : boundedBlobClient(client)))
          .catch((error: unknown) => {
            boundedExport = undefined;
            throw error;
          });
        return boundedExport;
      };
      const presence = sharedPresence<RosterEntry>({
        client: exportClient,
        publish: (deckId, event) => void channel?.publish(deckId, event),
        onError,
      });
      channel = blobChannel({
        open: (deckId) => openDeckStore(deckId),
        // the comments store (SPEC-3 5.2): on this tier an append writes the sidecar itself,
        // since the version log carries no comment entries for the checkpointer to fold
        // (VERIFICATION-3 finding 6: without it every comment write answered 400)
        applyComments: async (deckId, entries) => {
          // strict: a comment op the sidecar refuses fails the append with its sentence, so
          // the seller's action is refused instead of admitted and dropped (comments.ts)
          await commentsApplierFor(deckId, { strict: true }).apply(entries);
        },
        shared: {
          presence,
          pulse: async (deckId) => {
            const client = await exportClient();
            return client === null ? null : headPulse(client, deckId);
          },
          watchComments: (deckId, onChange) => {
            let stopped = false;
            let watch: { poll: () => Promise<void>; stop: () => void } | undefined;
            const ready = exportClient()
              .then((client) => {
                if (client === null || stopped) return;
                // this instance's own pushes carry the etag of its mirror's index and are not
                // announced twice (its append published the op already); no timer of its own,
                // the channel reads it when the pulse moved
                watch = watchSidecarIndex(client, deckId, onChange, {
                  pollMs: null,
                  localEtag: () => localIndexEtag(deckDir(deckId)),
                  onError,
                });
              })
              .catch((error: unknown) => onError(error, 'comments: the Blob client'));
            return {
              poll: async () => {
                await ready;
                await watch?.poll();
              },
              stop: () => {
                stopped = true;
                watch?.stop();
              },
            };
          },
        },
        onError,
      });
      return { channel, redis: null, presence };
    }
  }
}

function state(): NonNullable<Shared['__turboslideRoom']> {
  if (shared.__turboslideRoom === undefined) {
    const selection = selectRealtime(process.env);
    const { channel, redis, presence, kv } = buildChannel(selection);
    /* the principal records live in Redis on the redis tier (docs/REALTIME.md 3.6; docs/hosting.md
       section 9), here and in the identity runtime, which reads the binding at every call
       (auth/identity.ts bindIdentityRedis): a name typed on one instance is the name on the next */
    bindIdentityRedis(kv);
    const principals = selectPrincipalStore({
      ...(kv === undefined ? {} : { kv: principalKvOf(kv) }),
      stateDir: stateDir(),
    }).store;
    log(`realtime tier ${selection.tier} (${selection.reason})`);
    shared.__turboslideRoom = {
      selection,
      channel,
      rooms: new Map(),
      principals,
      streams: createStreamCounters(),
      redis,
      ...(presence === undefined ? {} : { presence }),
      selected: selection,
      redisChannel: selection.tier === 'redis' ? channel : null,
      doChannel: selection.tier === 'do' && isDoChannel(channel) ? channel : null,
    };
    // the resolved identity cache leaves on the other instances' word (3.6): a rename or an
    // avatar change on one instance drops the row everywhere at once instead of after 5 s
    channel.bus?.subscribe('identity', (identity) => {
      identityCache.delete(identity);
      emailMemory.delete(identity);
    });
  }
  return shared.__turboslideRoom;
}

/** One hand off or hand back at a time. */
let switchingTier: Promise<void> | null = null;

/**
 * The redis tier's hand off and hand back (docs/REALTIME.md 3.8). The `realtime` flag is read
 * through the redis channel (cached 5 s; it reads off when Redis is unreachable, which
 * `noteRedisUnavailable` logs, or when a hand set it off: `SET flag:realtime off`). Off while the
 * instance serves the redis tier: the blob channel is built once over the deck store, the
 * instance's selection, channel and shared roster move to it, every open room is superseded (its
 * streams write `resync` and close, so each tab reloads once and reopens on the blob tier) and
 * closed, and the next `roomFor` opens a blob room. On again: the same in reverse. Nothing is
 * lost: every admitted entry of the redis tier reached the store within the checkpoint interval
 * and the blob tier commits every append. Called by `roomFor` on every request and by the stream
 * route's heartbeat, so an idle instance notices within 15 s. Nothing on the other tiers.
 */
export async function ensureRealtimeTier(): Promise<void> {
  const s = state();
  // the tier with a flag driven hand off: redis (docs/REALTIME.md 3.8), or do (docs/CLOUDFLARE.md
  // 3.8 item 4: the Worker's `/health`, cached 60 s, off or three failed reads)
  const primary = s.redisChannel ?? s.doChannel;
  if (primary === null) return;
  if (switchingTier !== null) return switchingTier;
  const on = await primary.flag('realtime');
  const servingBlob = s.selection.tier === 'blob';
  if (on === !servingBlob) return;
  const word = s.selected.tier;
  switchingTier = (async () => {
    if (!on) {
      const reason = `handed off from ${word}: the realtime flag reads off`;
      s.fallback ??= buildChannel({
        tier: 'blob',
        reason,
        redis: s.selected.redis,
        room: s.selected.room,
        notice: BLOB_TIER_NOTICE,
      });
      s.channel = s.fallback.channel;
      s.selection = {
        tier: 'blob',
        reason,
        redis: s.selected.redis,
        room: s.selected.room,
        notice: BLOB_TIER_NOTICE,
      };
      if (s.fallback.presence === undefined) delete s.presence;
      else s.presence = s.fallback.presence;
      log('realtime handed off to the blob tier: the realtime flag reads off');
    } else {
      s.channel = primary;
      s.selection = s.selected;
      delete s.presence;
      log(`realtime handed back to the ${word} tier: the realtime flag reads on`);
    }
    await supersedeRooms();
  })().finally(() => {
    switchingTier = null;
  });
  return switchingTier;
}

/** Supersedes and closes every room of this instance: the open streams resync and close, the next request opens a room on the tier served now. */
async function supersedeRooms(): Promise<void> {
  const s = shared.__turboslideRoom;
  if (s === undefined) return;
  for (const [deckId, pending] of s.rooms) {
    s.rooms.delete(deckId);
    try {
      const room = await pending;
      room.supersede();
      await room.close();
    } catch {
      // a room that never opened has nothing to supersede
    }
  }
}

/** The blob tier's shared roster, undefined on the memory and redis tiers. */
export function sharedRoster(): SharedPresence<RosterEntry> | undefined {
  return state().presence;
}

/**
 * A client's leave with the clock its beacon carried (room-client.ts `stop`: `presenceClock + 1`,
 * above every set of that tab). On the blob tier the shared roster keeps the clock in the
 * tombstone, so a set of the same tab that reaches this or another instance after the leave (the
 * presence route awaits the roster read before its set; b4.md C3T-R2) never lands; the channel's
 * own `leave` (the memory and redis tiers, and the clockless leaves of the stream's close and
 * `retireClients`) is the path otherwise. `shared` is the roster to write; the tests pass one.
 */
export async function leavePresence(
  room: Room,
  clientId: string,
  clock?: number,
  shared: SharedPresence<RosterEntry> | null = sharedRoster() ?? null,
): Promise<void> {
  if (shared !== null && clock !== undefined) await shared.leave(room.deckId, clientId, clock);
  /* the channel carries the clock too since B7-R3 (realtime/channel.ts `leave`; the blob channel
     hands it to the shared roster, the memory and redis channels ignore it) */
  else await room.channel.presence.leave(room.deckId, clientId, clock);
}

/**
 * The clock of the join row (`announceJoin`): under every state of the tab, whose first post
 * carries 1 (room-client.ts `postPresence` counts up before it posts), so the tab's own state
 * always replaces it.
 */
export const JOIN_ROW_CLOCK = 0;

/**
 * The joiner's row at its stream's open, on the blob tier (hotfix/join-latency): the stream route
 * holds the joiner's identity, role and the roster when it writes `hello`, so the instance that
 * holds the stream announces the joiner to the other tabs streaming there at once
 * (presence-store.ts `join`: no push, no store call). Before this the joiner reached those tabs
 * only through its first presence POST: when the platform landed that POST on another instance,
 * this one read the row at its next pulse tick, 2 s after the stream's wake or up to 10 s when
 * the tab here was alone and quiet, and the joiner's chip came 3.7 to 11 s after the navigation
 * against the 3.5 s of `collab.presence.join-within-2s`. The row carries no slide, selection or
 * pointer; the tab's first POST replaces it. The memory and redis tiers have no shared roster
 * and announce every set to every stream already: nothing to do there. `open` is the stream's,
 * read after the entry is built so a stream closed meanwhile announces nothing.
 */
export async function announceJoin(
  room: Room,
  identity: RequestIdentity,
  role: Role,
  clientId: string,
  roster: readonly RosterEntry[],
  open: () => boolean,
  shared: SharedPresence<RosterEntry> | null = sharedRoster() ?? null,
): Promise<boolean> {
  if (shared === null) return false;
  const post = { clientId, clock: JOIN_ROW_CLOCK, pointerOn: false, presenting: false };
  const entry = await rosterEntryFor(room, identity, role, post, roster);
  if (!open()) return false;
  return shared.join(room.deckId, clientId, entry, PRESENCE_EXPIRY_MS);
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
  /**
   * the account a sign in session resolved to (docs/archive/rounds/PEOPLE.md 3.6; SPEC-3 7.4), so the author,
   * the boot identity and the roster entry render the account without a store read; null or
   * absent for an anonymous browser and a bearer
   */
  account?: AccountProfile | null;
};

export type RequestIdentityOptions = {
  /**
   * read the principal's deck index past this instance's 5 s row (access.ts refreshIndexFacts):
   * the editor boot, so a reload's payload carries the name and the choice written on another
   * instance at once (docs/archive/rounds/PEOPLE.md 6.4); the routes between keep the row
   */
  freshIndex?: boolean;
};

/**
 * The identity of a request on the room routes: the bearer as the bootstrap admin agent (SPEC-3
 * 0.23), else the account session when the deployment has an identity database (docs/archive/rounds/PEOPLE.md
 * 3.6: a signed in browser is its account on the editor boot, presence, ops, the stream, share,
 * access, notify, assist and the version authors, one id with the comments the actions transport
 * writes), else the sealed anonymous cookie (minted here when absent, so a stream opened before
 * the middleware ran still gets an id), else a stranger.
 */
export async function requestIdentity(
  request: Request,
  options: RequestIdentityOptions = {},
): Promise<RequestIdentity> {
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
  } else if (request.headers.get('cookie') === null && boundPrincipal(request) === undefined) {
    // a cookieless request the localhost rule admits (SPEC-3 0.23: curl, the CLI's --to, an MCP
    // client on a checkout's dev server) is the checkout holder, as the agent routes decide;
    // minting an anonymous principal per call would make every call a different stranger (the
    // integrator at merge 2, seen on the merge 2 action walk). A browser's first request carries
    // no cookie either, but the request middleware minted its principal and bound it to the
    // request (session.ts bindRequestPrincipal), so that request is the person, never the holder
    // (the people round: the draft on /new read as the checkout holder before the first cookie)
    const local = agentAuth(request);
    if (local.ok && local.mode === 'localhost') {
      const ctx = bootstrapAgentContext('localhost');
      return { ctx, principalId: null, identity: 'agent:localhost', kind: 'agent', record: null };
    }
  }
  /* the principal the request middleware minted for this very request rides the binding (its
     cookie is on the response, not in the request), so no route mints a second one */
  const existing = boundPrincipal(request)?.principal ?? (await readPrincipal(request, secret));
  const signedIn = await sessionIdentity(request, existing);
  if (signedIn !== null) return signedIn;
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
  const touched = await principalStore()
    .touch(principal.id, new Date(), true)
    .catch(() => null);
  /* the display name typed on another instance (b1.md R17) and the avatar choice chosen there
     (docs/archive/rounds/PEOPLE.md 3.13; b4.md R4): the principal store of the blob tier is a file store per
     instance, so what `account.setName` and `account.setAvatar` wrote elsewhere rides the
     principal's deck index on the Blob store (the carrier the link grants use), read through
     this instance's 5 s row (access.ts indexFactsFor) or past it when the caller asks
     (`freshIndex`, the editor boot; docs/archive/rounds/PEOPLE.md 6.4), and applied by access.ts
     recordWithIndexFacts: a record that carries a name keeps it; the index's non picture choice
     replaces the record's unless the record's choice is a picture, which the index never carries
     and a stale glyph must not outlive */
  const facts =
    touched === null
      ? null
      : await (
          options.freshIndex === true
            ? refreshIndexFacts(principal.id)
            : indexFactsFor(principal.id)
        ).catch(() => null);
  const record =
    touched !== null && facts !== null ? recordWithIndexFacts(touched, facts) : touched;
  return {
    /* the link grants are the union of the principal record's and the deck index's, so a grant
       exchanged on another instance admits the visitor on the ops, stream, presence and comments
       routes too (b6 R1; authorize.ts linkGrantsFor), and the link grant cookie's for the
       seconds before either store shows the exchange (authorize.ts cookieLinkGrants) */
    ctx: {
      principal,
      linkGrants: unionLinkGrants(
        await linkGrantsFor(principal.id, record),
        await cookieLinkGrants(request, principal.id),
      ),
    },
    principalId: principal.id,
    identity: principal.id,
    kind: principal.kind === 'account' ? 'signedIn' : 'anonymous',
    ...(setCookie !== undefined ? { setCookie } : {}),
    record,
  };
}

/**
 * The account session of a request, as the room reads it (docs/archive/rounds/PEOPLE.md 3.6): the better-auth
 * session before the anonymous cookie when the deployment has an identity database. The rule is
 * the auth runtime's `requestIdentity` (auth/identity.ts): the account principal `usr_<id>` with
 * its address and the admin flag, the anonymous cookie beside it linked to the account if it is
 * not yet (7.4), the account's own record touched. Null for no database, no session, a deleted
 * account, or a database that did not answer (logged once per minute; the browser is then its
 * anonymous cookie for this request, as before this round).
 */
async function sessionIdentity(
  request: Request,
  anonymous: Principal | null,
): Promise<RequestIdentity | null> {
  const runtime = identityRuntime();
  if (runtime.auth === null) return null;
  try {
    // the session and its facts through R4's per instance cache (auth/identity.ts
    // `accountSession`; docs/CLOUDFLARE.md 4.1: 300 s under the session token's hash on the D1
    // engine, one retry on a refused proxy call, null to anonymous), so a signed in request on
    // the function pays the four reads once per cache life and not once per request (R4-R1c)
    const found = await accountSession(runtime, request);
    if (found === null) return null;
    const facts = found.account;
    if (anonymous !== null) await linkAnonymous(runtime, anonymous.id, facts.userId);
    const now = new Date();
    const record =
      (await runtime.principals.touch(facts.principalId, now, true)) ??
      newPrincipalRecord(facts.principalId, now);
    /* the choice on the profile row first, the record second (docs/archive/rounds/PEOPLE.md 3.13): the profile
       outlives the record's 90 day TTL */
    const avatar = facts.profile.avatar ?? record.avatar;
    const account: AccountProfile = {
      userId: facts.userId,
      name: facts.name,
      email: facts.email,
      emailVerified: facts.emailVerified,
      admin: facts.admin,
      avatar,
    };
    /* the verified address, so a pending grant by email admits the invitee (identity/access.ts
       isPendingEmailGrantFor), and the anonymous ids linked to the account, so a deck made
       before the sign in keeps its creator as the owner (standingOf; b1.md R3) */
    const aliases = found.aliases;
    const principal: Principal = {
      id: facts.principalId,
      kind: 'account',
      ...(facts.emailVerified ? { email: facts.email } : {}),
      admin: facts.admin,
      ...(aliases.length > 0 ? { aliases } : {}),
    };
    return {
      ctx: {
        principal,
        linkGrants: unionLinkGrants(
          await linkGrantsFor(facts.principalId, record),
          await cookieLinkGrants(request, facts.principalId),
        ),
      },
      principalId: facts.principalId,
      identity: facts.principalId,
      kind: 'signedIn',
      record,
      account,
    };
  } catch (error) {
    const now = Date.now();
    if (now - sessionErrorLoggedAt > 60_000) {
      sessionErrorLoggedAt = now;
      log(
        `the account session was not read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }
}
let sessionErrorLoggedAt = 0;

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
  const resolved = resolveIdentity(
    identity.principalId ?? identity.identity,
    identity.record,
    identity.account ?? null,
  );
  return {
    kind: 'human',
    name: resolved.displayName,
    ...(identity.principalId !== null ? { principalId: identity.principalId } : {}),
  };
}

/**
 * The resolved identity of a principal id from its record and, for a signed in request, the
 * account the session resolved to (docs/archive/rounds/PEOPLE.md 3.6). Synchronous: the author of a write and
 * the boot identity read it on the request's own facts. An anonymous id linked to an account by
 * the alias table is resolved by `resolvePrincipalId` and `resolveRequestIdentity`, which read
 * the runtime's alias and account stores.
 */
export function resolveIdentity(
  principalId: string,
  record: PrincipalRecord | null,
  account: AccountProfile | null = null,
): ResolvedIdentity {
  const parsed = parsePrincipalId(principalId);
  const own =
    account !== null && parsed?.kind === 'account' && parsed.userId === account.userId
      ? account
      : null;
  return resolvePrincipal(principalId, {
    record: () => record,
    alias: () => null,
    account: () => own,
  });
}

/**
 * The resolution over the stores for an id the request did not carry (the version history, the
 * comment authors, the access record's people; docs/archive/rounds/PEOPLE.md 3.6, 3.8): an account id and an
 * anonymous id the alias table links to an account resolve through the auth runtime (its
 * profile, its picture, "Deleted account" for a profile that is gone), an agent id through its
 * token record, and an anonymous id nobody linked from the room's principal record.
 */
export async function resolvePrincipalId(principalId: string): Promise<ResolvedIdentity> {
  const parsed = parsePrincipalId(principalId);
  const runtime = identityRuntime();
  if (parsed?.kind === 'account' || parsed?.kind === 'agent')
    return noteResolved(await resolveThroughRuntime(runtime, principalId));
  if (parsed?.kind === 'anonymous') {
    const alias = await runtime.aliases.accountOf(principalId).catch(() => null);
    if (alias !== null) return noteResolved(await resolveThroughRuntime(runtime, principalId));
  }
  const record = await principalStore()
    .get(principalId)
    .catch(() => null);
  /* the name and the choice typed on another instance ride the principal's deck index (b1.md
     R17; docs/archive/rounds/PEOPLE.md 3.13), read here the way requestIdentity reads them for the request's
     own principal: the blob tier's principal store is a file store per instance, so a departed
     guest's comment read on another instance drew the label without this (the integrator's
     preview run, people.comment-departed-guest) */
  const carried =
    record !== null && record.name !== undefined ? record : await carriedFacts(principalId, record);
  return resolveIdentity(principalId, carried);
}

/**
 * The record with the name and the non picture choice the deck index carries, when it carries
 * any, read past this instance's 5 s index cache (access.ts `indexFactsFor`): `account.setName`
 * drops the cache on the instance that wrote the index and no bus reaches the others, so an
 * instance that read the person's index row before the write (their join, a presence post)
 * answered the old row for up to 5 s and A's reload drew the departed guest's label (the
 * verifier's pass 1 finding 2, `people.comment-departed-guest` red twice on preview 7 about 2 s
 * after the reload). The drop costs one store read per person per boot on the blob tier; the
 * name's read fills the cache and the choice's read takes it.
 */
async function carriedFacts(
  principalId: string,
  record: PrincipalRecord | null,
): Promise<PrincipalRecord | null> {
  dropLinkGrantCache(principalId);
  const name = await displayNameFromIndex(principalId).catch(() => undefined);
  const avatar = await avatarChoiceFromIndex(principalId).catch(() => undefined);
  if (name === undefined && avatar === undefined) return record;
  const base = record ?? newPrincipalRecord(principalId, new Date());
  return {
    ...base,
    ...(name !== undefined ? { name } : {}),
    ...(avatar !== undefined && base.avatar.variant !== 'picture' ? { avatar } : {}),
  };
}

/**
 * The address of a verified person this instance resolved lately, for the roster entry a grant
 * holder or the owner reads (docs/archive/rounds/PEOPLE.md 3.7): never on the shared roster, so the reader's
 * instance answers from what it resolved itself (the presence post it served, the boot payload
 * it built) within EMAIL_MEMORY_MS; a person resolved on another instance alone reads with no
 * address until this instance resolves them.
 */
const emailMemory = new Map<string, { at: number; email: string }>();
const EMAIL_MEMORY_MS = 90_000;

function noteResolved(resolved: ResolvedIdentity): ResolvedIdentity {
  if (resolved.trust === 'verified' && !resolved.deleted && resolved.email !== undefined)
    emailMemory.set(resolved.principalId, { at: Date.now(), email: resolved.email });
  else emailMemory.delete(resolved.principalId);
  return resolved;
}

function rememberedEmail(principalId: string): string | undefined {
  const hit = emailMemory.get(principalId);
  if (hit === undefined) return undefined;
  if (Date.now() - hit.at > EMAIL_MEMORY_MS) {
    emailMemory.delete(principalId);
    return undefined;
  }
  return hit.email;
}

/** The view of a role word in place of a verified person (SPEC-3 0.12), for the payload's map. */
function roleView(principalId: string, role: Role): IdentityView {
  const word = roleWord(role);
  return {
    principalId,
    label: word,
    trust: 'label',
    kind: 'anonymous',
    mark: roleMark(role, null),
  };
}

/** The role a person holds on the record, for the role word a link visitor reads them as. */
function roleOnRecord(principalId: string, record: AccessRecord | null): Role {
  if (record === null) return 'editor';
  if (record.owner === principalId) return 'owner';
  const grant = record.grants.find((row) => row.principalId === principalId);
  if (grant !== undefined) return grant.role;
  return record.generalAccess.role;
}

export type IdentityViewsOptions = {
  /** the reader holds a grant or owns the deck: the address travels (SPEC-3 4.8) */
  showEmail: boolean;
  /** the reader arrived by link or the open mode and the owner's names switch is off: a verified person reads as a role word (0.12) */
  roleWords: boolean;
  /** the record, for the role a verified person reads as */
  access: AccessRecord | null;
};

/**
 * The resolved views of the people a page names (docs/archive/rounds/PEOPLE.md 3.8): the version authors, the
 * comment authors, the owner, the pending owner and the grants, keyed by principal id, with the
 * mark and, for a reader who may see it, the address. An id of no known format (a round one
 * author name) is left out and renders by the chrome's fallback.
 */
export async function identityViewsFor(
  ids: Iterable<string>,
  options: IdentityViewsOptions,
): Promise<Record<string, IdentityView>> {
  const wanted = [...new Set(ids)].filter((id) => isPrincipalId(id));
  const out: Record<string, IdentityView> = {};
  const BATCH = 8;
  for (let i = 0; i < wanted.length; i += BATCH) {
    const views = await Promise.all(
      wanted.slice(i, i + BATCH).map(async (id) => {
        const resolved = await resolvePrincipalId(id);
        if (options.roleWords && resolved.trust === 'verified' && !resolved.deleted)
          return [id, roleView(id, roleOnRecord(id, options.access))] as const;
        return [
          id,
          toIdentityView(resolved, { mark: markSpec(resolved), showEmail: options.showEmail }),
        ] as const;
      }),
    );
    for (const [id, view] of views) out[id] = view;
  }
  return out;
}

/**
 * `authorize()` for a request on a deck, with the route's transport word. On the do tier a
 * refusal of a principal is judged once more over the deck index read past this instance's 5 s
 * row (docs/CLOUDFLARE.md 2.1 `realtime.share-link.every-instance`, 3.6.1): the object holds no
 * bus a function could subscribe to, so a link grant exchanged on another instance seconds ago
 * reaches this one through the store and not a drop; one fresh read on the refusal path alone,
 * never on a success path, and the request's context keeps the grants it found.
 */
export async function decideFor(
  identity: RequestIdentity,
  deckId: string,
  capability: Capability,
  action?: string,
): Promise<ShadowedDecision> {
  const options = { transport: 'route' as const, ...(action !== undefined ? { action } : {}) };
  const decision = await authorize(identity.ctx, deckId, capability, options);
  if (decision.ok || identity.principalId === null || realtimeTier() !== 'do') return decision;
  try {
    await refreshIndexFacts(identity.principalId);
    const grants = await linkGrantsFor(identity.principalId, identity.record);
    const held = new Set(identity.ctx.linkGrants.map((grant) => grant.linkId));
    if (grants.every((grant) => held.has(grant.linkId))) return decision;
    identity.ctx = { ...identity.ctx, linkGrants: grants };
  } catch {
    return decision;
  }
  return authorize(identity.ctx, deckId, capability, options);
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
  /**
   * The last stream seq a checkpoint covered, as this instance knows it (the checkpointer's
   * count, or the records' at the room's open; on the blob tier every seq is a commit, so the
   * live seq). The stream's hello carries it so a tab trims the ops it retained while its stream
   * was down (the focus round, cycle 3 stream fix round; VERIFICATION SEAM-F8: a checkpoint
   * that fired while no stream carried it left an acknowledged op retained for good and the
   * title row read Saving on a quiet deck). Never above what a checkpoint wrote.
   */
  covered: () => number;
  /** turns the records written outside the room since the live revision into stream entries now */
  follow: () => Promise<void>;
  /**
   * Registers a listener for the room's supersession (the hand off of docs/REALTIME.md 3.8: the
   * instance moved to another tier and this room is closed in favour of one on it): the stream
   * route writes `resync` and closes, so the tab reloads once. The return value unregisters.
   */
  onSupersede: (fn: () => void) => () => void;
  /** fires the supersede listeners, before `close()` */
  supersede: () => void;
  /** stops the subscription, the follower and the checkpointer (tests) */
  close: () => Promise<void>;
};

function cloneEntryAuthor(author: Author): Author {
  return { ...author };
}

const applyEntries = applyStreamEntries;

async function createRoom(deckId: string): Promise<Room> {
  const { channel, selection } = state();
  // the do tier (docs/CLOUDFLARE.md 3.6.1): the object is the live document and the order, so the
  // room here is a reader of it with the store as the fallback; no checkpointer, no subscription,
  // no follower and no watch run on the function
  const onDo = selection.tier === 'do' && isDoChannel(channel) ? channel : null;
  const store = await openDeckStore(deckId);
  const read = await store.read();
  const records = await store.records();
  const coveredAtOpen = coveredSeq(records);
  const live: Live = {
    seq: coveredAtOpen,
    document: read.document,
    chain: Promise.resolve(),
  };
  /** the object's covered seq from its last document read on the do tier, null before one */
  let objectCovered: number | null = null;
  const ownRevisions = new Set<number>();
  let followerBusy = false;

  const queued = <T>(run: () => Promise<T>): Promise<T> => {
    const next = live.chain.then(run, run);
    live.chain = next.catch(() => undefined);
    return next;
  };

  /** Advances the live document to the channel's head, or reloads it from the store when the stream was trimmed past it. */
  const syncLive = async (): Promise<LiveDocument> => {
    if (onDo !== null) {
      // the object's document at its head with a 2 s deadline (3.2), else the store at the last
      // checkpoint (the first open of a deck and every open after its last close)
      try {
        const doc = await onDo.document(deckId);
        if (doc !== null) {
          live.document = doc.document;
          live.seq = doc.seq;
          objectCovered = doc.covered;
          return { seq: live.seq, document: live.document };
        }
      } catch (error) {
        log(
          `${deckId}: the object's document was not read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
      if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
      const current = await store.read();
      live.document = current.document;
      live.seq = coveredSeq(await store.records());
      objectCovered = null;
      return { seq: live.seq, document: live.document };
    }
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

  const checkpointer =
    onDo !== null
      ? doCheckpointer(onDo, deckId)
      : createCheckpointer({
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

  // every admitted op of every instance reaches the live document in stream order; the room's
  // listener is passive, so it holds no poll of the store on the blob tier (a client stream does);
  // on the do tier the object holds the document and the function subscribes to nothing
  const stopSubscription =
    onDo !== null
      ? () => {}
      : channel.subscribe(
          deckId,
          (event) => {
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
                // another instance's run covered the stream up to here (checkpoint.ts `covered`; the
                // realtime round's two process run): this instance's next run starts above it instead
                // of committing the same entries again
                checkpointer.covered(event.toSeq);
              });
            }
          },
          { passive: true },
        );
  const supersedeListeners = new Set<() => void>();

  /**
   * The follower (SPEC-3 0.48, 3.7 c): a record written outside the room (a CLI write beside the
   * dev server, an agent's strict write through writeDeck, a `version.restore`) becomes stream
   * entries so every tab applies it live; a record the stream cannot replay (a restore, a record
   * whose base is not the live document) is announced as an external checkpoint and the tabs
   * reload at its revision. The instance takes the deck's follow lock so two instances never
   * append one record twice, and checks the stream's tail for the record's op id first.
   */
  const follow = async (): Promise<void> => {
    if (selection.tier === 'blob' || onDo !== null || followerBusy) return;
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
            // another instance's checkpoint: its entries are in the stream already and covered
            const toSeq = record.ops.toSeq;
            await queued(async () => {
              setRevision(record.revision, record.createdAt);
              checkpointer.covered(toSeq);
            });
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
              // the store entry is committed already and the checkpointer never commits a store
              // entry again (checkpoint.ts isStoreEntry), so nothing here moves the checkpointer's
              // `covered`: it used to be moved to this entry's seq, which skipped every client
              // entry admitted since the last checkpoint and still uncommitted below it (a tab's
              // five keystrokes typed just before an agent's strict write), so those ops never
              // reached the store, every later checkpoint of that paragraph was refused at its
              // offsets and the title row stayed at unsaved (the stream fix round two, t1.md
              // T1-R4; realtime.spec.ts:546's last line after :315 and :359). The next checkpoint
              // reads from the last covered seq, filters this entry and commits the rest
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
    selection.tier === 'blob' || onDo !== null
      ? () => {}
      : store.watch((event) => {
          if (event.revision === null) return;
          if (event.revision <= live.document.deck.revision) return;
          void follow();
        });

  // `version.save` on the do tier (3.5): the object flushes its tail first, so every acknowledged
  // entry is a record under the stamp, then the manifest stamp as today, then the object's
  // revision follows through `/external`
  const roomStore: DeckStore =
    onDo === null
      ? store
      : {
          ...store,
          async saveVersion(author, note) {
            await onDo
              .flush(deckId)
              .catch((error: unknown) =>
                log(
                  `${deckId}: the flush before version.save failed: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
            const version = await store.saveVersion(author, note);
            await onDo
              .external(deckId, { revision: version.revision, author, note })
              .catch((error: unknown) =>
                log(
                  `${deckId}: the object was not told of version.save: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
            return version;
          },
        };

  return {
    deckId,
    channel,
    tier: selection.tier,
    store: roomStore,
    live: () => queued(syncLive),
    checkpointer,
    revision: () => live.document.deck.revision,
    covered: () =>
      selection.tier === 'blob'
        ? live.seq
        : onDo !== null
          ? (objectCovered ?? coveredAtOpen)
          : Math.max(coveredAtOpen, checkpointer.state().covered),
    follow,
    onSupersede(fn) {
      supersedeListeners.add(fn);
      return () => {
        supersedeListeners.delete(fn);
      };
    },
    supersede() {
      for (const fn of [...supersedeListeners]) {
        try {
          fn();
        } catch {
          // a listener that throws has its own error path
        }
      }
      supersedeListeners.clear();
    },
    async close() {
      stopSubscription();
      stopWatch();
      await checkpointer.stop();
    },
  };
}

/**
 * The checkpointer's shape over the object (docs/CLOUDFLARE.md 3.6.1): the object commits on its
 * own alarm, so nothing is scheduled or counted here; `run` is the flush of 3.4 item 8 (the object
 * posts its tail to the checkpoint route at once), which `flushRoom`, `admitServerWrite`'s callers
 * and `version.save` ask for. `covered` follows the flush's answer.
 */
function doCheckpointer(channel: DoChannel, deckId: string): Checkpointer {
  let covered = -1;
  return {
    schedule() {},
    noteAppended() {},
    noteComments() {},
    pendingComments: () => [],
    covered(seq) {
      if (seq > covered) covered = seq;
    },
    async run() {
      try {
        const flushed = await channel.flush(deckId);
        covered = Math.max(covered, flushed.covered);
        return {
          ok: true,
          committed: [],
          fromSeq: flushed.covered,
          toSeq: flushed.covered,
          skipped: [],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`${deckId}: the object did not flush: ${message}`);
        return { ok: false, reason: 'failed', message };
      }
    },
    state: () => ({ retainedEntries: 0, retainedBytes: 0, covered, running: false }),
    async stop() {},
  };
}

/** The room of a deck on this instance; a RangeError when the deck is missing. */
export async function roomFor(deckId: string): Promise<Room> {
  // the redis tier's hand off and hand back run here, on every request (docs/REALTIME.md 3.8)
  await ensureRealtimeTier().catch((error: unknown) =>
    log(`the tier check failed: ${error instanceof Error ? error.message : String(error)}`),
  );
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

/** How many times `flushRoom` waits behind another run of the checkpointer, and the pause between. */
export const FLUSH_ROOM_ATTEMPTS = 10;
export const FLUSH_ROOM_PAUSE_MS = 100;

/**
 * Commits what the room admitted and the store does not hold yet, before an agent reads the
 * deck (the product round fix round; VERIFICATION.md "Product round, pass 1" finding 12). On the
 * memory and redis tiers a tab's edits sit in the stream until the checkpointer's idle timer
 * (2 s, 10 s under a burst) writes them, while the HTTP, MCP and window dispatchers read the
 * store: `deck.tailor` over HTTP right after the editor typed five Acme found none and answered
 * `replacements: 0`, where the blob tier, whose every append is a commit, answered 3 of 3. One
 * forced run of this instance's checkpointer when the live seq is past what a checkpoint
 * covered; nothing when no room is open here, when the tier is blob, or when the store is
 * current. A run another writer holds the lock of is waited for, briefly; a failure is logged
 * and never fails the read, which then answers the store as it stands.
 */
export async function flushRoom(deckId: string): Promise<void> {
  const s = shared.__turboslideRoom;
  const pending = s?.rooms.get(deckId);
  if (pending === undefined) return;
  let room: Room;
  try {
    room = await pending;
  } catch {
    return;
  }
  if (room.tier === 'blob') return;
  try {
    const live = await room.live();
    if (live.seq <= room.covered()) return;
    for (let attempt = 0; attempt < FLUSH_ROOM_ATTEMPTS; attempt += 1) {
      const result = await room.checkpointer.run({ force: true });
      if (result.ok || result.reason !== 'locked') return;
      await new Promise((resolve) => setTimeout(resolve, FLUSH_ROOM_PAUSE_MS));
    }
  } catch (error) {
    log(
      `${deckId}: the room did not flush before the read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * A store for the dispatchers over a deck this instance holds a room for (the product round fix
 * round, pass 1 finding 12; the seam `flushRoom` papers over): the reads answer the room's live
 * document, so `deck.info`'s revision and the texts an agent plans over are the tab's as it
 * stands, and a write goes through `admitServerWrite` with the exact revision check, so the base
 * an agent read is the base the write is judged against, the entry lands in the stream (every tab
 * receives it, transformed past what is pending) and the checkpointer commits it at once. The
 * store's other methods (the versions, the leases, the assets) are the store's. A deck with no
 * room on this instance, and the blob tier, whose store is the live document, answer the store
 * itself. Wired by `deckDispatcher` (server/actions.ts) as its `storeDeps.store`; with it in
 * place the flush before an agent action is not needed.
 */
export async function roomBackedStore(deckId: string, store: DeckStore): Promise<DeckStore> {
  let pending = shared.__turboslideRoom?.rooms.get(deckId);
  if (pending === undefined) {
    // on the do tier the room is a reader of the object and costs no checkpointer, no
    // subscription and no watch (createRoom), so an instance that never served a page still
    // answers the agent surface the object's live document instead of the store at the last
    // checkpoint (R1's two process run of 2026-10-01: `slide.get` through the second instance
    // read the store 300 ms after the ack, two seconds before the record). `realtimeTier()`
    // builds the shared state when a bearer's requests alone have reached this instance
    if (realtimeTier() !== 'do') return store;
    try {
      pending = roomFor(deckId);
      await pending;
    } catch {
      return store;
    }
  }
  let room: Room;
  try {
    room = await pending;
  } catch {
    return store;
  }
  if (room.tier === 'blob') return store;
  return {
    ...store,
    async read() {
      const live = await room.live();
      return { document: live.document, issues: [], ok: true };
    },
    async revision() {
      return (await room.live()).document.deck.revision;
    },
    async write(write) {
      const admitted = await admitServerWrite(room, {
        author: write.author,
        mutations: write.mutations,
        baseRevision: write.baseRevision,
        strict: true,
        ...(write.note === undefined ? {} : { note: write.note }),
      });
      if (!admitted.ok) {
        if (admitted.code === 'conflict') {
          return {
            ok: false,
            code: 'conflict',
            message: admitted.message,
            current: admitted.current,
            currentRevision: admitted.currentRevision,
          };
        }
        return { ok: false, code: 'invalid', message: admitted.message, issues: [] };
      }
      const live = await room.live();
      return {
        ok: true,
        document: live.document,
        revision: admitted.revision,
        entry: admitted.record,
        changed: [
          ...new Set(admitted.record.mutations.flatMap((m) => ('slideId' in m ? [m.slideId] : []))),
        ],
        issues: [],
        warnings: [],
      };
    },
  };
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

/** A comment action's caller that took this long or longer writes one line to the server log. */
export const COMMENT_CALLER_SLOW_MS = 1000;

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
  const started = Date.now();
  const capability = commentCapabilityOf(action);
  /* the identity read, the room's open and the access record leave together: on the blob tier
     each is a round of store calls, and on an instance that has not opened the deck the room's
     open pulls the mirror (the snapshot, the records, the sidecar). The production gate of the
     people round read one `comment.resolve` at 5.2 s with the op's stamp 4.6 s after the request
     arrived, so the time was spent here, before the op (the comments hotfix of 2026-10-01). The
     room's failure is kept aside until the decision is in: a denied request answers its denial
     and never the room's words, as before */
  const settle = <T>(run: Promise<T>) =>
    run.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  const [identity, opened, read] = await Promise.all([
    requestIdentity(request),
    settle(roomFor(deckId)),
    settle(effectiveAccess(deckId)),
  ]);
  const decided = Date.now();
  const decision = await decideFor(identity, deckId, capability, action);
  if (!decision.ok)
    return { ok: false, status: decision.status, body: denialBody(decision, capability), identity };
  if (!opened.ok) throw opened.error;
  if (!read.ok) throw read.error;
  const room = opened.value;
  const record = read.value;
  const total = Date.now() - started;
  if (total >= COMMENT_CALLER_SLOW_MS) {
    // one line per slow caller, so a production reading names where a comment action's time went
    log(
      `${deckId}: ${action} caller took ${total} ms (identity, room and record ${decided - started} ms, the decision ${Date.now() - decided} ms)`,
    );
  }
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

export type AdmissionResult =
  | {
      ok: true;
      entries: Entry[];
      rejected: Rejected[];
      head: number;
      revision: number;
      /**
       * The entries between the POST's `base.seq` and the first admitted entry, oldest first
       * (the focus round, cycle 3 stream fix round two; VERIFICATION C3S-F8): what other writers
       * landed while the tab's stream had not delivered it, so the client settles the answered
       * ops without a stream delivery under them (before this the answered entry sat above a gap
       * for the gap watch's 8 s where the picture row allows 5 s). Absent when nothing sits
       * between or the run is over BETWEEN_MAX_ENTRIES or BETWEEN_MAX_BYTES, when the reopen's
       * replay stays the way.
       */
      between?: Entry[];
    }
  | {
      ok: false;
      status: 400 | 403 | 409 | 429 | 503;
      code: string;
      message: string;
      head?: number;
      retryAfterMs?: number;
    };

/**
 * The answer to an ops POST the store refused (a 429, a 5xx, the deadline): 503 with the wait
 * the store named, or one second; the room client keeps the ops pending and sends them again
 * after it (room-client.ts, the 5xx branch).
 */
export function storeBusyResult(error: unknown): AdmissionResult {
  const retryAfterMs = storeRetryAfterMs(error) ?? 1000;
  return {
    ok: false,
    status: 503,
    code: 'store_busy',
    message: `The store did not answer; the change is sent again in ${Math.ceil(retryAfterMs / 1000)} s`,
    retryAfterMs,
  };
}

/**
 * The store's refusal at a route's boundary (the ops and presence routes; the focus round, cycle
 * 3 stream fix round, VERIFICATION C3S-F4: a Blob 403 on a fresh deck's file reached the tab as
 * nine 500 answers with the SDK's sentence, against the budget's rule that nothing thrown by the
 * store reaches the editor): an error the store threw anywhere under the route (the room's open,
 * the mirror's pull, the presence record) is answered as the product's 503 `store_busy` with
 * `retry-after`, which the room client resends after; every other error is the caller's to throw.
 */
export function storeRefusalOf(
  error: unknown,
): { status: 503; body: { error: string; message: string }; retryAfterS: number } | null {
  if (!isStoreBusy(error)) return null;
  const busy = storeBusyResult(error);
  if (busy.ok) return null;
  return {
    status: 503,
    body: { error: busy.code, message: busy.message },
    retryAfterS: Math.max(1, Math.ceil((busy.retryAfterMs ?? 1000) / 1000)),
  };
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
  if (room.tier === 'blob') {
    try {
      return await admitOnBlob(room, input);
    } catch (error) {
      // the store refused (a 429, a 5xx, the deadline; pulse.ts isStoreBusy): a transient the
      // client resends after `retry-after`, never a 500 the tab reads as a refusal and never a
      // 404 of the room (the focus round, cycle 3 fix round; VERIFICATION C3-F2)
      if (!isStoreBusy(error)) throw error;
      return storeBusyResult(error);
    }
  }
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
  // what the later entries of this POST are transformed past: what landed since the base (each
  // with the tie the POST declared, landedOf), then the undo of every entry refused before them
  // (undoOfSplices)
  const landedMutations = landedOf(landed, post);
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
    // the run rule (channel.ts runTieSide): an entry that continues its author's own text keeps
    // the left of a landed insert at its offset, as the client that sent it moved it; the
    // running document lets a cover's conversion follow the slide as it stands (conversion.ts
    // in @turboslide/realtime; the realtime round's fix round 3)
    const transformed = transformEntry(
      entry.mutations ?? [],
      landedMutations,
      entryRun(entry),
      running,
    );
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
      landedMutations.push(...landedOwn(undoOfSplices(transformed)));
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
      // the history label rides the entry to the checkpointer (channel.ts Entry.note)
      ...(entry.note === undefined ? {} : { note: entry.note }),
    });
  }
  if (candidates.length === 0) {
    return { ok: true, entries: replayed, rejected, head, revision: live.document.deck.revision };
  }
  // the run declaration of each posted entry, for the transform past a moved head below
  const runOf = new Map(post.entries.map((entry) => [entry.opId, entryRun(entry)] as const));
  const result = await appendWithRetry(channel, deckId, head, candidates, (entries, more) => {
    // the head moved while this request transformed: transform once more against what landed
    // (SPEC-3 3.4 step 5); a candidate that cannot be placed is dropped and rejected
    const moreMutations = landedOf(more, post);
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
      const transformed = transformEntry(
        entry.mutations,
        moreMutations,
        runOf.get(entry.opId),
        document,
      );
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
        moreMutations.push(...landedOwn(undoOfSplices(transformed)));
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
  const entries = [...replayed, ...result.entries].sort((a, b) => a.seq - b.seq);
  // what landed between the tab's position and its own entries rides the answer (C3S-F8)
  const between = betweenEntries(
    landed,
    post.base.seq,
    entries[0]?.seq ?? Number.POSITIVE_INFINITY,
  );
  return {
    ok: true,
    entries,
    rejected,
    head: result.entries[result.entries.length - 1]?.seq ?? head,
    revision,
    ...(between === undefined ? {} : { between }),
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
/**
 * How many forced syncs a resync that names a revision makes, and the pause between them: up to
 * about three seconds in all (the product round, docs/archive/rounds/PRODUCT.md 8.2 the recorded classes;
 * RETURN ship.md section 5 `versions.undo-restore`: the restore's resync on the blob tier landed
 * after the revision on another instance inside the row's bound, so the tab kept the document
 * from before the restore and Cmd+Z had nothing to bring back; three tries 250 ms apart were
 * under a second). Each sync is one head and, when the head moved, the reads it names; the
 * request pays for them and no timer runs, so the blob tier budget stands.
 */
export const LIVE_AT_LEAST_ATTEMPTS = 6;
export const LIVE_AT_LEAST_PAUSE_MS = 500;

export async function liveAtLeast(
  room: Room,
  revision: number | undefined,
  attempts = LIVE_AT_LEAST_ATTEMPTS,
  pauseMs = LIVE_AT_LEAST_PAUSE_MS,
): Promise<LiveDocument> {
  let live = await room.live();
  if (room.tier !== 'blob') return live;
  const store = room.store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof store.sync !== 'function') return live;
  // the store refused the forced sync (a 429, a 5xx, the deadline): the mirror's document as it
  // stands answers the page instead of the store's error (the focus round, cycle 3 fix round;
  // VERIFICATION C3-F3: a 429 of this head reached the editor's loader and the router replaced
  // the editor with its default error page)
  const syncOrKeep = async (): Promise<void> => {
    try {
      await store.sync?.(true);
    } catch (error) {
      if (!isStoreBusy(error)) throw error;
    }
  };
  if (revision === undefined) {
    // no revision named: the head, read once past the sync window (a page load)
    await syncOrKeep();
    return room.live();
  }
  for (let attempt = 0; attempt < attempts && revision > live.document.deck.revision; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    await syncOrKeep();
    live = await room.live();
  }
  if (revision > live.document.deck.revision) {
    // the reader learns the document is behind the revision it asked for: one line names it
    console.error(
      `turboslide room: ${room.deckId} read at revision ${live.document.deck.revision} after ${attempts} syncs; the caller asked for ${revision}`,
    );
  }
  return live;
}

/**
 * A candidate the reducer refused on the blob tier. Since the sync round the entry was transformed
 * past every record between its base and the mirror's revision before the reducer judged it
 * (docs/archive/rounds/SYNC.md 3.3, invariant 2), so a refusal against a mirror at or above the base is the
 * reducer's answer to the client's write and the loser reads the reducer's sentence in its
 * reject card, as on the memory tier (row `sync.structural.concurrent`: a move of a block whose
 * slide another person deleted first is refused with "No slide"). Before the round the blob
 * tier placed the entry verbatim, so a refusal against a document at another revision said
 * nothing about the write and every such refusal was a resync; that reading stays for the one
 * case the transform cannot cover, a mirror the forced syncs could not bring up to the client's
 * base (the write names a document this instance has not read), where the answer is a resync at
 * the head and the client sends the write again. The sentence travels as the reducer wrote it.
 */
export function blobRefusal(
  baseSeq: number,
  liveRevision: number,
  rejected: Rejected,
): { kind: 'reject'; rejected: Rejected } | { kind: 'resync' } {
  if (liveRevision < baseSeq && rejected.reason === 'invalid') return { kind: 'resync' };
  return { kind: 'reject', rejected };
}

/**
 * The origin check of docs/archive/rounds/SYNC.md 3.2 (invariant 3), the cheap first pass: the records above a
 * POST's base, read from the mirror as stream entries (blob.ts `since`, `Entry.covers`), name the
 * op ids they folded, so a resent POST whose first attempt committed is answered with one
 * synthesized entry per op id at that record's seq and never placed again. Until the sync round
 * this instance kept a per instance memory of the last 512 admitted op ids (the focus round,
 * cycle 3; VERIFICATION C2-F24), which a resend landing on another instance never met; the
 * record's origin is the same fact on every instance. The second pass, against the records the
 * write path's own head and pull just proved, is the store's (`WriteOutcome.replayed`, blob.ts
 * `append`). `entries` are the POST's; the answer names the covered ones and the rest.
 */
export function splitReplayed(
  entries: ReadonlyArray<OpsPost['entries'][number]>,
  landed: ReadonlyArray<Entry>,
): { replayed: Entry[]; fresh: OpsPost['entries'][number][] } {
  const coveredBy = new Map<string, Entry>();
  for (const entry of landed) for (const opId of entry.covers ?? []) coveredBy.set(opId, entry);
  const replayed: Entry[] = [];
  const fresh: OpsPost['entries'][number][] = [];
  const byRecord = new Map<Entry, string[]>();
  for (const entry of entries) {
    const covering = coveredBy.get(entry.opId);
    if (covering === undefined) {
      fresh.push(entry);
      continue;
    }
    const ids = byRecord.get(covering);
    if (ids === undefined) byRecord.set(covering, [entry.opId]);
    else ids.push(entry.opId);
  }
  for (const [covering, opIds] of byRecord) replayed.push(...synthesizeReplayed(covering, opIds));
  return { replayed: replayed.sort((a, b) => a.seq - b.seq), fresh };
}

/** The sentence of a text op returned to its author because a whole Text rewrite landed first (SPEC-3 3.5); the room client's own words for the same case. */
export const STALE_AFTER_REMOTE =
  'This change no longer fits the slide after another change landed; make it again';

/** A refusal that names an asset the instance's document does not hold (the validator's sentence). */
export function namesUnknownAsset(rejected: Rejected): boolean {
  return rejected.reason === 'invalid' && /is not in deck\.json/.test(rejected.message ?? '');
}

/** How many times the blob admission places and appends again after the store moved under its write. */
export const BLOB_APPEND_RETRIES = 1;

/** The sentence of an entry refused because an earlier entry of its batch was (SPEC-3 3.4 step 3): shown, never silent. */
export const STALE_AFTER_REFUSAL =
  'This change was not applied because a change before it was refused; make it again';

/**
 * The blob tier (SPEC-3 3.7 e): every append is a commit; the seq is the revision. Exported for
 * its test. The sync round (docs/archive/rounds/SYNC.md 3.2, 3.3; invariants 2 and 3) made it read the records
 * between the POST's base and the mirror's revision once (`channel.since`, from the mirror, no
 * store call) and use them twice: the op ids they cover answer a resend without a placement
 * (`splitReplayed`), and their mutations are what every fresh entry is transformed past before
 * the reducer judges it, with the memory tier's `transformEntry`. Before this the entries were
 * placed against the newer document verbatim, so two inserts at one offset landed in the wrong
 * order on the server while the client had shifted its own past the other's, and two browsers
 * read two orders until the session repaired them (audit-ordering item 4, run 4). After a head
 * that moved under the append the loop reads the records again and transforms the POST's
 * original mutations past the whole set, never the transformed candidates past the delta alone.
 * A candidate the reducer refuses after that transform is the reducer's answer (`blobRefusal`):
 * the loser reads the sentence in its reject card, as on the memory tier, and a resync is left
 * for the mirror the syncs could not bring up to the client's base. Two inserts at one offset tie
 * by the rule the POST declares (`landedOf`; `OpsPost.insertTie`).
 */
export async function admitOnBlob(room: Room, input: AdmitInput): Promise<AdmissionResult> {
  const { post, identity } = input;
  let live = await liveForBase(room, post.base.seq);
  const stamp = new Date((input.now ?? (() => Date.now()))()).toISOString();
  const resyncAt = (head: number): AdmissionResult => ({
    ok: false,
    status: 409,
    code: 'resync',
    message: `The deck is at revision ${head} on this instance and the write was made against ${post.base.seq}; reload and rebase`,
    head,
  });
  // the base window (admission.ts checkBaseWindow, the "behind" half): a tab more than the
  // window behind the head reloads instead of being transformed past hundreds of records
  if (live.document.deck.revision - post.base.seq > BASE_SEQ_WINDOW) {
    return resyncAt(live.document.deck.revision);
  }
  /** The records between the POST's base and the mirror's revision, as stream entries; none at the head. */
  const readLanded = async (): Promise<Entry[]> => {
    const count = live.document.deck.revision - post.base.seq;
    return count > 0 ? await room.channel.since(room.deckId, post.base.seq, count) : [];
  };
  /**
   * A candidate that names an asset this instance's document lacks is judged once more on a
   * mirror synced by force (the focus round, cycle 3 stream fix round; VERIFICATION C3S-F6,
   * SEAM-F2: the `asset.add` answered on one instance and the `block.insert` naming the asset
   * landed on another whose mirror at the same revision did not hold it yet, 3 of 213 burst
   * calls). The sync is the store's forced one (`liveAtLeast`'s), once per POST.
   */
  let resynced = false;
  type Placement =
    | { kind: 'resync'; head: number }
    | { kind: 'placed'; replayed: Entry[]; candidates: NewEntry[]; rejected: Rejected[] };
  /**
   * Places the POST's entries against the live document as it stands: the origin check first
   * (an op a landed record covers is answered from it), then for each fresh entry the transform
   * of its original mutations past the landed records' mutations, then past the undo of every
   * entry refused before it in this POST, then the reducer and the validator. Run once, and once
   * more from the originals against the head when the store moved under the append below.
   */
  const place = async (landed: ReadonlyArray<Entry>): Promise<Placement> => {
    const { replayed, fresh } = splitReplayed(post.entries, landed);
    const rejected: Rejected[] = [];
    const candidates: NewEntry[] = [];
    let running = live.document;
    // each landed row with the tie this POST's inserts take against it (landedOf)
    const landedMutations = landedOf(landed, post);
    // the undo of every entry refused so far, which the later entries are transformed past
    const refusedUndo: Landed[] = [];
    const freshLive = async (): Promise<boolean> => {
      if (resynced || candidates.length > 0) return false;
      resynced = true;
      const store = room.store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
      if (typeof store.sync !== 'function') return false;
      try {
        await store.sync(true);
      } catch (error) {
        if (!isStoreBusy(error)) throw error;
        return false;
      }
      live = await room.live();
      running = live.document;
      return true;
    };
    /**
     * The record that names a fresh entry's op id when the reducer refused the entry (the vector
     * round fix round; VERIFICATION.md "Vector round, pass 1" finding 1): the origin check of
     * `splitReplayed` reads the records above the POST's base, and on preview 3 a star's
     * `block.insert` came back "Block shape-6 already exists" while the store held the block from
     * the first attempt, so the entry's own commit was in the live document and outside `landed`.
     * A record that names the op id is that first admission whatever its seq (a tab mints an op
     * id once), so the entry is answered from it as a resend is, never refused. The log is read
     * from the mirror within the base window under the POST's base, once per placement and only
     * on a refusal (`since` reads the mirror; no store call); when nothing names it and nothing
     * was placed yet, the mirror is synced by force once (`freshLive`) and read again, since a
     * commit can reach the document before its record reaches the log.
     */
    let recentLog: Entry[] | null = null;
    const readWindow = async (): Promise<Entry[]> => {
      const floor = Math.max(0, post.base.seq - BASE_SEQ_WINDOW);
      const count = live.document.deck.revision - floor;
      return count > 0 ? await room.channel.since(room.deckId, floor, count) : [];
    };
    const naming = (entries: ReadonlyArray<Entry>, opId: string): Entry | undefined => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        if (entry?.covers?.includes(opId)) return entry;
      }
      return undefined;
    };
    const coveringEntry = async (opId: string): Promise<Entry | undefined> => {
      if (recentLog === null) recentLog = await readWindow();
      const found = naming(recentLog, opId);
      if (found !== undefined) return found;
      if (!(await freshLive())) return undefined;
      recentLog = await readWindow();
      return naming(recentLog, opId);
    };
    for (const entry of fresh) {
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
      // past what landed since the base (3.3), then past the undo of the refused (rank 13); the
      // running document lets a cover's conversion follow the slide as it stands, whether rows
      // landed or none did (conversion.ts in @turboslide/realtime; the realtime round's fix round 3)
      const moved = transformEntry(
        entry.mutations ?? [],
        landedMutations,
        entryRun(entry),
        running,
      );
      if (moved === null) {
        // a whole Text rewrite landed first: the op returns to its author with a sentence
        rejected.push({ opId: entry.opId, reason: 'stale', message: STALE_AFTER_REMOTE });
        continue;
      }
      const mutations = refusedUndo.length === 0 ? moved : transformEntry(moved, refusedUndo);
      if (mutations === null) {
        // a refusal the tab can show (the product round fix round, pass 1 finding 9: a paste
        // that vanished on the blob tier left no sentence anywhere); the reason stays `stale`
        rejected.push({ opId: entry.opId, reason: 'stale', message: STALE_AFTER_REFUSAL });
        continue;
      }
      let placed = landCandidate(
        running,
        { opId: entry.opId, kind: 'edit', mutations },
        () => true,
      );
      if (!placed.ok && namesUnknownAsset(placed.rejected) && (await freshLive())) {
        placed = landCandidate(running, { opId: entry.opId, kind: 'edit', mutations }, () => true);
      }
      if (!placed.ok) {
        // the entry's own first admission, found by its op id: answered from the record, as a
        // resend above the base is (docs/archive/rounds/SYNC.md 3.2), and the refusal is not the tab's to read
        const covering = await coveringEntry(entry.opId);
        if (covering !== undefined) {
          replayed.push(...synthesizeReplayed(covering, [entry.opId]));
          continue;
        }
        refusedUndo.push(...landedOwn(undoOfSplices(mutations)));
        const refusal = blobRefusal(post.base.seq, live.document.deck.revision, placed.rejected);
        if (refusal.kind === 'resync') return { kind: 'resync', head: live.document.deck.revision };
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
        // the history label rides the entry into the record the append commits (blob.ts)
        ...(entry.note === undefined ? {} : { note: entry.note }),
      });
    }
    // a record found under the base (coveringEntry) sorts before the ones splitReplayed named
    replayed.sort((a, b) => a.seq - b.seq);
    return { kind: 'placed', replayed, candidates, rejected };
  };
  void identity;
  /** The seq of the first answered entry above the POST's base (an entry answered from a record at or under the base sits below what `between` would fill). */
  const firstAbove = (entries: ReadonlyArray<Entry>): number | undefined =>
    entries.find((entry) => entry.seq > post.base.seq)?.seq;
  const nothingToAppend = (placed: Extract<Placement, { kind: 'placed' }>): AdmissionResult => {
    const revision = live.document.deck.revision;
    const first = firstAbove(placed.replayed);
    // a resend answered from the records alone: what landed under the record rides the answer
    const between =
      first !== undefined && first - post.base.seq > 1
        ? betweenEntries(landed, post.base.seq, first)
        : undefined;
    return {
      ok: true,
      entries: placed.replayed,
      rejected: placed.rejected,
      head: revision,
      revision,
      ...(between === undefined ? {} : { between }),
    };
  };
  let landed = await readLanded();
  let placement = await place(landed);
  if (placement.kind === 'resync') return resyncAt(placement.head);
  if (placement.candidates.length === 0) return nothingToAppend(placement);
  let result = await room.channel.append(
    room.deckId,
    live.document.deck.revision,
    placement.candidates,
  );
  for (let retry = 0; !result.ok && retry < BLOB_APPEND_RETRIES; retry += 1) {
    if (result.head <= live.document.deck.revision) break;
    // the store moved under the write: another instance committed between this instance's
    // placement and its manifest put (on the wire, the second upload's `asset.set` landing under
    // the first picture's insert; the focus round, cycle 3 stream fix round two, VERIFICATION
    // C3T-F2). The mirror is synced to the head the store named, the records above the base are
    // read again (the origin check runs on them too, so a first attempt that committed between
    // the placement and the retry is answered, not committed again), the POST's original
    // mutations are transformed past the whole set and placed, and appended once more, in place
    // of the 409 the tab answered with a resync read and a resend (about a second of the
    // picture's 5 s). A mirror that cannot reach that head keeps the 409 below.
    live = await liveAtLeast(room, result.head);
    if (live.document.deck.revision < result.head) break;
    landed = await readLanded();
    placement = await place(landed);
    if (placement.kind === 'resync') return resyncAt(placement.head);
    if (placement.candidates.length === 0) return nothingToAppend(placement);
    result = await room.channel.append(
      room.deckId,
      live.document.deck.revision,
      placement.candidates,
    );
  }
  if (!result.ok) {
    if (result.head === live.document.deck.revision) {
      // the store did not move and the write did not land (a claim in flight on another
      // instance, a mirror the pull could not prove): a resync at the same revision would send
      // the client round again with the same base, so the answer is the transient 503 and the
      // client sends the ops again after a second (VERIFICATION C3-F1, `decks.access.paint`)
      return storeBusyResult(null);
    }
    return {
      ok: false,
      status: 409,
      code: 'resync',
      message: `The deck moved to revision ${result.head}; reload and rebase`,
      head: result.head,
    };
  }
  const revision = result.entries[0]?.seq ?? live.document.deck.revision;
  const entries = [...placement.replayed, ...result.entries].sort((a, b) => a.seq - b.seq);
  // the records other writers committed between the tab's position and this write ride the
  // answer, so the tab settles its ops without a stream delivery under them (C3S-F8: the
  // second picture's insert waited 8.4 s on the gap watch for the first's commit). They are the
  // records the placement transformed past, read from the mirror above: no store call
  const first = firstAbove(entries) ?? revision;
  const between =
    first - post.base.seq > 1 ? betweenEntries(landed, post.base.seq, first) : undefined;
  return {
    ok: true,
    entries,
    rejected: placement.rejected,
    head: revision,
    revision,
    ...(between === undefined ? {} : { between }),
  };
}

// ---------------------------------------------------------------------------------------------
// Presence (SPEC-3 3.8) and the roster by role (4.8)

type IdentityCacheRow = { at: number; facts: string; identity: ResolvedIdentity };
const identityCache = new Map<string, IdentityCacheRow>();
const IDENTITY_CACHE_MS = 5000;
/** The do tier has no drop bus, so the room's identity cache reads 2 s there (docs/CLOUDFLARE.md 2.1, 3.6.1). */
const IDENTITY_CACHE_DO_MS = 2000;

function identityCacheMs(): number {
  return realtimeTier() === 'do' ? IDENTITY_CACHE_DO_MS : IDENTITY_CACHE_MS;
}

/**
 * Drops the cached resolution of one identity (a rename or an avatar change on this instance,
 * b1.md R18), so the next presence post reads the new record, and tells the other instances to
 * drop theirs through the channel's bus (docs/REALTIME.md 3.6; the row
 * `realtime.departed-guest.name-stable`). A publish that fails is logged; the 5 s cache bounds it.
 */
export function forgetIdentity(identity: string): void {
  identityCache.delete(identity);
  emailMemory.delete(identity);
  // the cached session facts of the account go with the row (R4-R1d; docs/CLOUDFLARE.md 4.1)
  forgetAccountFacts(identity);
  void realtimeChannel()
    .bus?.publish('identity', identity)
    .catch((error: unknown) =>
      log(
        `the identity drop of ${identity} was not published: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
}

/**
 * The facts of a request its resolution depends on, the cache row's validator (docs/archive/rounds/PEOPLE.md
 * 6.4): a request whose record or account carries another name or choice than the row was
 * resolved from (the index read past its cache at a boot or a first presence post, a record
 * another route wrote on this instance) is resolved again inside the 5 s, so the index row's
 * window and this one never add up to ten.
 */
function identityFactsKey(identity: RequestIdentity): string {
  return JSON.stringify([
    identity.record?.name ?? null,
    identity.record?.avatar ?? null,
    identity.account?.name ?? null,
    identity.account?.avatar ?? null,
  ]);
}

/**
 * The request identity with its record read against the deck index past this instance's 5 s row
 * (access.ts refreshIndexFacts and recordWithIndexFacts; docs/archive/rounds/PEOPLE.md 6.4): a client's first
 * presence post after its boot. The same identity for a bearer, a request without a record, a
 * store that did not answer, or an index that carries nothing new.
 */
export async function withFreshIndexFacts(identity: RequestIdentity): Promise<RequestIdentity> {
  if (identity.ctx.agent !== undefined || identity.principalId === null || identity.record === null)
    return identity;
  const facts = await refreshIndexFacts(identity.principalId).catch(() => null);
  if (facts === null) return identity;
  const record = recordWithIndexFacts(identity.record, facts);
  return record === identity.record ? identity : { ...identity, record };
}

/**
 * The resolved identity of a request, through the 5 s cache (docs/archive/rounds/PEOPLE.md 3.6): a bearer as
 * its agent, a signed in request as the account the session resolved to, an anonymous request as
 * its record, or as the account the alias table links it to (a browser that signed in once and
 * carries the old cookie; SPEC-3 7.4). The boot payload and the roster entry read it.
 */
export async function resolveRequestIdentity(identity: RequestIdentity): Promise<ResolvedIdentity> {
  const key = identity.identity;
  const facts = identityFactsKey(identity);
  const hit = identityCache.get(key);
  const now = Date.now();
  if (hit !== undefined && now - hit.at < identityCacheMs() && hit.facts === facts)
    return hit.identity;
  const resolved = noteResolved(await resolveFresh(identity));
  identityCache.set(key, { at: now, facts, identity: resolved });
  return resolved;
}

async function resolveFresh(identity: RequestIdentity): Promise<ResolvedIdentity> {
  if (identity.ctx.agent !== undefined)
    return resolvePrincipal(`agent:${identity.ctx.agent.tokenId}`, {
      record: () => null,
      alias: () => null,
      account: () => null,
      token: () => ({
        tokenId: identity.ctx.agent?.tokenId ?? '',
        ownerId: identity.ctx.agent?.ownerId ?? '',
        name: identity.ctx.agent?.name ?? 'Agent',
      }),
    });
  const principalId = identity.principalId ?? identity.identity;
  if (identity.account !== undefined && identity.account !== null)
    return resolveIdentity(principalId, identity.record, identity.account);
  if (parsePrincipalId(principalId)?.kind === 'anonymous') {
    const runtime = identityRuntime();
    const alias = await runtime.aliases.accountOf(principalId).catch(() => null);
    if (alias !== null) return resolveThroughRuntime(runtime, principalId);
  }
  return resolveIdentity(principalId, identity.record);
}

const cachedIdentity = resolveRequestIdentity;

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
  /* a client's first post after its boot reads the person's index past this instance's 5 s row
     (docs/archive/rounds/PEOPLE.md 6.4): the boot's payload read the store on its instance, and the instance
     that serves the first post may hold the row from before the choice; the ticks after keep
     the row, so the cost is one index read per client, never per tick */
  const first = existing.every((row) => row.clientId !== post.clientId);
  const resolved = await cachedIdentity(first ? await withFreshIndexFacts(identity) : identity);
  const principalId =
    identity.ctx.agent !== undefined ? `agent:${identity.ctx.agent.tokenId}` : identity.identity;
  const slot = grantHueSlot(principalId, existing);
  const mark = markSpec(resolved, { hueSlot: slot });
  const canEdit = role === 'owner' || role === 'editor';
  const joinOrder = existing.findIndex((row) => row.clientId === post.clientId);
  const amongFirst =
    joinOrder < 0 ? existing.length < LIVE_POINTERS_MAX : joinOrder < LIVE_POINTERS_MAX;
  const pointerAllowed = canEdit && amongFirst;
  /* `drag`, the box of a block the tab is moving or resizing (docs/REALTIME.md 3.4, R2's field
     in protocol.ts), follows the pointer's role and count rule and not `pointerOn`: a dragged
     block's ghost is drawn whatever the live pointers switch says; the field is read by name
     here so this file compiles before and after R2's commit */
  const { pointer, drag, ...rest } = post as PresencePost & { drag?: unknown };
  const dragPart: Record<string, unknown> =
    drag !== undefined && canEdit && amongFirst ? { drag } : {};
  void room;
  return {
    ...rest,
    ...(pointer !== undefined && pointerAllowed && post.pointerOn ? { pointer } : {}),
    ...dragPart,
    principalId,
    label: resolved.displayName,
    trust: resolved.trust as Trust,
    mark: mark as unknown as Record<string, unknown>,
    hueSlot: slot - 1,
    kind: resolved.kind === 'agent' ? 'agent' : 'human',
    role,
  } as RosterEntry;
}

// ---------------------------------------------------------------------------------------------
// The pure admission lives in @turboslide/realtime/room-core since the Cloudflare move
// (docs/CLOUDFLARE.md 3.3, 3.6.1; the integrator's seam commit of the realtime round): the object
// and the function run one transform, one placement and one reader projection. Every name is
// re-exported here so the routes, the dispatchers and the tests read them where they always did;
// the two reader functions are bound to this instance's email memory (`rememberedEmail`,
// docs/archive/rounds/PEOPLE.md 3.7), which the object replaces with the ticket's `email` claim.

export {
  BETWEEN_MAX_BYTES,
  BETWEEN_MAX_ENTRIES,
  betweenEntries,
  editingCount,
  entryRun,
  grantHueSlot,
  landedOf,
  landedOwn,
  overEditingCeiling,
  reanchor,
  reanchorAll,
  refusalIssue,
  refusalMessage,
  roleMark,
  roleWord,
  transformEntry,
  undoOfSplices,
  yieldConcurrentConversion,
};
export type { Landed, Rejected, ViewerFacts };

/** The reader projection's host facts on the function: this instance's email memory. */
const readerDeps: ReaderDeps = { rememberedEmail };

/** A roster entry as one reader may see it (SPEC-3 4.8), read with this instance's email memory; the rule is room-core's. */
export function rosterEntryForReader(entry: RosterEntry, reader: ViewerFacts): RosterEntry {
  return rosterEntryForReaderCore(entry, reader, readerDeps);
}

/** The events one stream forwards (SPEC-3 3.3, report 10 F25), read with this instance's email memory; the rule is room-core's. */
export function filterEventForReader(event: RoomEvent, reader: ViewerFacts): RoomEvent | null {
  return filterEventForReaderCore(event, reader, readerDeps);
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
  const retired: string[] = [];
  for (const clientId of retireCandidates(room.deckId, raw, identity, exceptClientId)) {
    await room.channel.presence.leave(room.deckId, clientId).catch(() => undefined);
    retired.push(clientId);
  }
  return retired;
}

/**
 * The ids of a stream open's `retire` query this identity may retire: trimmed, deduplicated,
 * at most RETIRE_MAX, never the new stream's own id, and only an id whose MAC names this deck
 * and this identity. Shared by `retireClients` (the roster rows) and the stream route's slot
 * release (the stream counters), so both read the same list.
 */
export function retireCandidates(
  deckId: string,
  raw: string | null,
  identity: RequestIdentity,
  exceptClientId?: string,
): string[] {
  if (raw === null || raw === '') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw.split(',')) {
    const clientId = candidate.trim();
    if (clientId === '' || clientId === exceptClientId || seen.has(clientId)) continue;
    seen.add(clientId);
    if (seen.size > RETIRE_MAX) break;
    if (!clientIdMatches(deckId, clientId, identity.identity)) continue;
    out.push(clientId);
  }
  return out;
}

/**
 * Binds a client id to the identity on the channel; the stream route mints the id first (so
 * its stream slot is counted under the id before the caps are judged) and hands it in.
 */
export async function bindClient(
  room: Room,
  identity: RequestIdentity,
  clientId = mintClientId(room.deckId, identity.identity),
): Promise<string> {
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
    /* a since the stream does not hold (docs/REALTIME.md 3.7): the first entry after the
       position is not the next seq, so the entries below it are gone (the stream trimmed behind
       a checkpoint, a Redis reset, a position from the other tier after a hand off or a
       rollback, a hole in the blob tier's log) and a replay from here would apply entries over a
       base the tab never saw; the tab reloads at the head instead, once, never a hang */
    const first = page[0];
    if (first !== undefined && first.seq !== from + 1)
      return { type: 'resync', revision: room.revision() };
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

export type StreamCap = 'identity' | 'ip' | 'instance';

/** The counts a refusal is logged with (the focus round, cycle 3 stream fix round, S1 step 5). */
export type StreamCounts = {
  total: number;
  identities: number;
  /** open streams of one identity on this instance */
  identity: number;
  /** open streams behind one address on this instance; 0 when the address is unknown */
  address: number;
};

export type StreamTakeOptions = {
  /**
   * The client id the stream is bound to, so a later open of the same tab can release this
   * slot by name (`retire`). A slot without an id is released by its `release()` alone.
   */
  clientId?: string;
  /**
   * The client ids the opening tab held before (its own earlier pages and its earlier streams
   * of this page: the stream open's `retire` query, filtered to this identity's ids by the
   * route). Their slots on this instance are released before the caps are judged, so a reload
   * or a reconnect never fills a tab's own cap while the runtime has not yet seen the earlier
   * connection go (VERIFICATION.md C3-F1: a closed stream kept its slot for 73 s on the preview).
   * Only a slot taken by the same identity is released this way.
   */
  retire?: readonly string[];
  /**
   * The opening tab's token (the stream open's `tab` query: 32 hex the tab keeps in its
   * sessionStorage, so it survives a reload and dies with the tab). Every slot this instance
   * still holds under the same tab and the same identity is released before the caps are
   * judged, whatever deck it was for and whether or not its stream ever said hello. A tab holds
   * one stream at a time, so an earlier slot under its token is a stream the tab has left
   * behind (the focus round, cycle 3 stream fix round; VERIFICATION C3S-F2: three quick
   * navigations left slots the tab could never name in `retire`, since their opens were
   * aborted before their hello, and every later open of the tab was refused at the identity
   * cap for the stream lifetime). Only a slot taken by the same identity is released this way.
   */
  tab?: string;
};

export type StreamSlot =
  | { ok: true; release: () => void; retired: string[]; tabReleased: number }
  | { ok: false; cap: StreamCap; counts: StreamCounts };

export type StreamCounters = {
  /** takes one slot; the refusal names the cap that is full and the counts at the refusal */
  take: (
    identity: string,
    kind: IdentityKind,
    address: string | null,
    options?: StreamTakeOptions,
  ) => StreamSlot;
  /** releases the slots the client ids name when `identity` took them; answers the ids released */
  release: (identity: string, clientIds: readonly string[]) => string[];
  /** releases every slot held under a tab token by `identity`; answers how many */
  releaseTab: (identity: string, tab: string) => number;
  counts: (identity?: string, address?: string | null) => StreamCounts;
};

/** The shape of a stream open's `tab` token: 32 hex, as a client id is shaped. */
export const TAB_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** The tab token of a stream open's query, or undefined when absent or malformed. */
export function tabTokenOf(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const token = raw.trim().toLowerCase();
  return TAB_TOKEN_PATTERN.test(token) ? token : undefined;
}

/**
 * The instance's open stream slots (report 10 F24; the focus round, cycle 3 stream fix round).
 * Every slot is counted under its identity, its address and the instance, and, when the stream
 * route names one, under its client id, so a later stream of the same tab can release it before
 * its own cap is judged. A slot's `release()` is idempotent; a slot released by a `retire` list
 * is gone when the route's own `close()` runs later.
 */
export function createStreamCounters(): StreamCounters {
  const byIdentity = new Map<string, number>();
  const byAddress = new Map<string, number>();
  const byClient = new Map<string, { identity: string; release: () => void }>();
  /** the slots held under a tab token, by token: a tab's earlier streams on this instance */
  const byTab = new Map<string, Set<{ identity: string; release: () => void }>>();
  let total = 0;
  const bump = (map: Map<string, number>, key: string, by: number): void => {
    const next = (map.get(key) ?? 0) + by;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  };
  const counts = (identity?: string, address?: string | null): StreamCounts => ({
    total,
    identities: byIdentity.size,
    identity: identity === undefined ? 0 : (byIdentity.get(identity) ?? 0),
    address: address === undefined || address === null ? 0 : (byAddress.get(address) ?? 0),
  });
  const release = (identity: string, clientIds: readonly string[]): string[] => {
    const released: string[] = [];
    for (const clientId of clientIds) {
      const held = byClient.get(clientId);
      if (held === undefined || held.identity !== identity) continue;
      held.release();
      released.push(clientId);
    }
    return released;
  };
  const releaseTab = (identity: string, tab: string): number => {
    const held = byTab.get(tab);
    if (held === undefined) return 0;
    let released = 0;
    for (const slot of [...held]) {
      if (slot.identity !== identity) continue;
      slot.release();
      released += 1;
    }
    return released;
  };
  return {
    take(identity, kind, address, options = {}) {
      // the tab's earlier streams on this instance go first (hello or not, this deck or
      // another), then the ids the tab names, then a slot already held under the new id
      const tabReleased = options.tab === undefined ? 0 : releaseTab(identity, options.tab);
      const retired = options.retire === undefined ? [] : release(identity, options.retire);
      if (options.clientId !== undefined) release(identity, [options.clientId]);
      if (total >= CAPS.streams.instance)
        return { ok: false, cap: 'instance', counts: counts(identity, address) };
      if ((byIdentity.get(identity) ?? 0) >= CAPS.streams[kind])
        return { ok: false, cap: 'identity', counts: counts(identity, address) };
      if (address !== null && (byAddress.get(address) ?? 0) >= CAPS.streams.ip)
        return { ok: false, cap: 'ip', counts: counts(identity, address) };
      total += 1;
      bump(byIdentity, identity, 1);
      if (address !== null) bump(byAddress, address, 1);
      let released = false;
      const clientId = options.clientId;
      const tab = options.tab;
      const slot = { identity, release: (): void => slotRelease() };
      const slotRelease = (): void => {
        if (released) return;
        released = true;
        total -= 1;
        bump(byIdentity, identity, -1);
        if (address !== null) bump(byAddress, address, -1);
        if (clientId !== undefined && byClient.get(clientId)?.release === slotRelease)
          byClient.delete(clientId);
        if (tab !== undefined) {
          const held = byTab.get(tab);
          held?.delete(slot);
          if (held !== undefined && held.size === 0) byTab.delete(tab);
        }
      };
      if (clientId !== undefined) byClient.set(clientId, { identity, release: slotRelease });
      if (tab !== undefined) {
        const held = byTab.get(tab) ?? new Set();
        held.add(slot);
        byTab.set(tab, held);
      }
      return { ok: true, release: slotRelease, retired, tabReleased };
    },
    release,
    releaseTab,
    counts,
  };
}

/** How long a fresh stream may go without its reader's presence before it is judged (the first presence takes the hello, a POST and, across instances, a push and a poll). */
export const STREAM_PRESENCE_GRACE_MS = 45_000;
/**
 * A reader whose presence has not reached this instance for this long is gone. A live tab's
 * presence arrives every 5 s on its own instance and about every 15 s through the shared record;
 * a tab hidden for five minutes has its timers aligned to the minute by the browser, so its
 * heartbeat lands once a minute, which this covers with a margin.
 */
export const STREAM_PRESENCE_UNSEEN_MS = 75_000;

export type ReaderLiveness = {
  /** the reader's presence reached this instance (a `presence` event with its client id) */
  seen: () => void;
  /** the room's store refuses its poll (a `store` event); no judgement while it does */
  storeOk: (ok: boolean) => void;
  /** true when the reader is gone by the presence rule; never inside the grace or under a store outage */
  gone: () => boolean;
};

/**
 * The reader's liveness by its presence (the focus round, cycle 3 stream fix round; VERIFICATION
 * SEAM-F4, C3S-F1: the preview's runtime reports neither the abort nor the cancel of a stream
 * whose browser has gone and drains the queue for it, so the slot stayed until the lifetime and
 * sixteen page loads from one address filled the address cap of an instance). The room client
 * posts its presence every 5 s while it lives, and every instance learns of it (the memory
 * tier's `set` publishes at once; the blob tier's shared record refreshes a live row about every
 * 15 s and the pulse poll reads it within 2 s), so a stream whose reader's `presence` event has
 * not reached this instance for STREAM_PRESENCE_UNSEEN_MS after the grace is a stream nobody
 * reads, and the route closes it and releases its slot. While the room's store refuses its poll
 * no presence arrives for anyone, so nothing is judged then (the budget: a backoff never turns
 * into a reopen per stream). Reads the clock alone; the route calls `gone()` at its heartbeat.
 */
export function createReaderLiveness(
  now: () => number = Date.now,
  graceMs = STREAM_PRESENCE_GRACE_MS,
  unseenMs = STREAM_PRESENCE_UNSEEN_MS,
): ReaderLiveness {
  const opened = now();
  let seenAt = opened;
  let storeOk = true;
  return {
    seen() {
      seenAt = now();
    },
    storeOk(ok) {
      storeOk = ok;
      // the outage's end counts as seen: the reader gets the full window to show up again
      if (ok) seenAt = now();
    },
    gone() {
      if (!storeOk) return false;
      const t = now();
      if (t - opened < graceMs) return false;
      return t - seenAt >= unseenMs;
    },
  };
}

/**
 * How long a stream's queue may stay unpulled before its reader is taken as gone (two heartbeats
 * and a margin; the route's heartbeat is STREAM_HEARTBEAT_MS).
 */
export const STREAM_READER_GONE_MS = 2 * STREAM_HEARTBEAT_MS + 5_000;

export type StreamCloser = {
  /** ends the stream once: the cleanup set so far, the release, the controller's close */
  close: () => void;
  closed: () => boolean;
  /** enqueues text on the attached controller; a controller that refuses the bytes closes the stream */
  write: (text: string) => void;
  /** the stream's controller, once `start` has it; an aborted request closes at once */
  attach: (controller: ReadableStreamDefaultController<Uint8Array>) => void;
  /** what `close()` runs first (the timers and the subscription), set once they exist */
  onClose: (cleanup: () => void) => void;
};

/**
 * The one close of a stream (the stream route; the focus round, cycle 3 stream fix round,
 * VERIFICATION.md C3-F1): whichever the runtime reports first, the request's abort, the body's
 * `cancel()`, a write the controller refuses, the lifetime timer, an access recheck or an error
 * while the stream is set up, runs the whole cleanup and releases the slot; every later report
 * finds the stream closed. Before this the route's `write()` catch set `open = false` without
 * releasing, `close()` returned early once `open` was false, and a stream whose bytes the runtime
 * had refused kept its slot until the lifetime timer. `release` is the slot's release together
 * with the roster row's leave; `signal` is the request's.
 */
export function createStreamCloser(
  release: () => void,
  signal?: AbortSignal,
  now: () => number = Date.now,
): StreamCloser {
  let closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cleanup: (() => void) | undefined;
  const encoder = new TextEncoder();
  /* the last write that found the queue drained (the reader had pulled everything before it) */
  let drainedAt = now();
  const close = (): void => {
    if (closed) return;
    closed = true;
    try {
      cleanup?.();
    } catch {
      // a timer or a subscription already gone: the release below still runs
    }
    release();
    try {
      controller?.close();
    } catch {
      // closed or cancelled by the reader already
    }
  };
  signal?.addEventListener('abort', close, { once: true });
  return {
    close,
    closed: () => closed,
    write(text) {
      if (closed || controller === null) return;
      // the reader that stopped pulling (the seam step of the cycle 3 stream fix round; the
      // preview's runtime reported neither the abort nor the cancel of a stream whose browser
      // had closed it, and its writes were taken, for 73 s and more): a chunk still queued when
      // the next write comes means nobody read the stream since; once nothing was pulled for
      // STREAM_READER_GONE_MS the reader is gone and the stream closes, releasing its slot. A
      // burst of frames drains within milliseconds and never trips this; the heartbeat every
      // STREAM_HEARTBEAT_MS is the write that reads the queue on a quiet stream.
      const desired = controller.desiredSize;
      const at = now();
      if (desired === null || desired > 0) drainedAt = at;
      else if (at - drainedAt >= STREAM_READER_GONE_MS) {
        close();
        return;
      }
      try {
        controller.enqueue(encoder.encode(text));
      } catch {
        close();
      }
    },
    attach(next) {
      controller = next;
      if (signal?.aborted === true) close();
    },
    onClose(next) {
      cleanup = next;
      if (closed) next();
    },
  };
}

/** The one log line of a refused stream open (S1 step 5): the cap, the identity kind and the counts, never the identity itself. */
export function streamRefusalLine(
  deckId: string,
  kind: IdentityKind,
  refusal: { cap: StreamCap; counts: StreamCounts },
): string {
  const { cap, counts } = refusal;
  return (
    `stream refused on ${deckId}: cap ${cap} for ${kind}; ` +
    `identity ${counts.identity}/${CAPS.streams[kind]}, ` +
    `address ${counts.address}/${CAPS.streams.ip}, ` +
    `instance ${counts.total}/${CAPS.streams.instance} (${counts.identities} identities)`
  );
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

/**
 * The client id a server write's stream entry carries (docs/REALTIME.md 3.3): `agent:<principal
 * id>` for an agent's author, so the open tab's banner gate (controller.tsx announceAgentWrite:
 * an agent author whose client id is not the tab's own) passes on every tier that runs the
 * room, `server` for every other writer as before; cut to the 64 characters of
 * `entrySchema.clientId`. Exported for its test.
 */
export function serverClientId(author: Author): string {
  if (author.kind !== 'agent') return 'server';
  return `agent:${author.principalId ?? author.name}`.slice(0, 64);
}

export async function admitServerWrite(
  room: Room,
  input: ServerWriteInput,
): Promise<ServerWriteResult> {
  const { store, channel, deckId } = room;
  const onDo = isDoChannel(channel) ? channel : null;
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
      // the store refused (a 429, a 5xx, the deadline): the caller's card reads the product's
      // sentence, never the SDK's (the focus round, cycle 3 fix round; VERIFICATION C3-F2 read
      // "Vercel Blob: Too many requests" in the Share dialog)
      if (isStoreBusy(error)) {
        const wait = Math.ceil((storeRetryAfterMs(error) ?? 1000) / 1000);
        throw new Error(`The store did not answer; try again in ${wait} s`);
      }
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
    // the follower turns the record into stream entries or an external checkpoint at once; on
    // the do tier the object is told instead (docs/CLOUDFLARE.md 3.5: a restore writes the
    // manifest outside the object)
    await room.follow();
    if (onDo !== null) {
      await onDo
        .external(deckId, {
          revision: outcome.revision,
          author: input.author,
          note: input.note ?? '',
        })
        .catch((error: unknown) =>
          log(
            `${deckId}: the object was not told of the restore: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
    return { ok: true, revision: outcome.revision, record: outcome.entry, seq: outcome.revision };
  }
  if (onDo !== null) {
    // the do tier (docs/CLOUDFLARE.md 3.2 "An agent HTTP write"): the write enters the object's
    // order under the bearer with `agent:<principalId>` as its client id, fans out as an `op`,
    // and the object checkpoints at once, so the record exists before this answer
    const answer = await onDo.serverWrite(deckId, {
      author: input.author,
      clientId: serverClientId(input.author),
      mutations: input.mutations,
      baseRevision: input.baseRevision,
      ...(input.strict === undefined ? {} : { strict: input.strict }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
    if (!answer.ok) {
      if (answer.code === 'conflict') {
        const fresh = await room.live();
        if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
        const records = await store.records();
        return {
          ok: false,
          code: 'conflict',
          message: answer.message,
          currentRevision: answer.currentRevision,
          current: fresh.document,
          since: records.filter((record) => record.revision > input.baseRevision),
        };
      }
      return { ok: false, code: 'invalid', message: answer.message };
    }
    // the record the checkpoint route wrote: read past this instance's mirror
    if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
    const records = await store.records();
    const record =
      records.find(
        (row) =>
          row.ops !== undefined && row.ops.fromSeq <= answer.seq && answer.seq <= row.ops.toSeq,
      ) ?? records.find((row) => row.revision === answer.revision);
    if (record === undefined) {
      return {
        ok: false,
        code: 'invalid',
        message:
          'The write landed in the room but no checkpoint committed it yet; read the deck again',
      };
    }
    return { ok: true, revision: record.revision, record, seq: answer.seq };
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
    clientId: serverClientId(input.author),
    opId,
    mutations: placed.mutations,
    at: new Date().toISOString(),
    // the write's note reaches the record the checkpointer commits, as it does on the blob path
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const result = await appendWithRetry(channel, deckId, live.seq, [entry], (entries, more) => {
    // a server write declares no tie rule: server order, as a client before the round
    const moreMutations = landedOwn(more.flatMap((row) => row.mutations ?? []));
    let document: DeckDocument;
    try {
      document = applyEntries(live.document, more);
    } catch {
      return null;
    }
    const out: NewEntry[] = [];
    for (const row of entries) {
      const transformed = transformEntry(row.mutations ?? [], moreMutations, false, document);
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

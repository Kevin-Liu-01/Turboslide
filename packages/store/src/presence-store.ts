// The shared presence roster of the blob tier (the focus round, cycle 3; VERIFICATION.md C2-F28;
// docs/FOCUS.md rank 36). Without Redis every function instance kept its own roster in memory
// (realtime/memory.ts behind realtime/blob.ts), and under fluid compute a tab's stream, its
// presence posts and its leave beacon land on different instances: a second browser's chip
// appeared only when its post happened to land on the instance that streams to the first, and a
// closed tab's chip stayed on every other instance until the 120 s expiry. One record per deck in
// the Blob store, `decks/<id>/.turboslide/presence.json`, is the roster every instance agrees on.
// An instance keeps the rows its own posts wrote, merges its changes (a set or a leave per client)
// into the record with `ifMatch`, and while a stream of the deck is open here polls the record on
// a short interval and announces the rows of other instances to its listeners as `presence` and
// `leave` events, so the stream's frames are the same on every tier. A row lives at most 30 s
// without a refresh whatever ttl the caller gave (the client's heartbeat is 5 s), so a tab whose
// beacon was lost leaves every roster inside the matrix's 30 s bound, and the expiry is announced
// as `leave` to this instance's listeners on the tick whether the row was this instance's own or
// the record's (the return round fix round, R1-F1: an expired local row left without a word and
// the owner's chip of a gone tab stayed); a leave writes a tombstone
// for the client, so a set another instance pushes late cannot bring the row back. The record
// goes up with an immutable copy under its md5 first and is read through `provenGet`
// (access-store.ts): the public store's url serves an overwritten body stale for a while, and the
// copy under the version `head()` names is the read that holds; an instance deletes the copies it
// wrote once they are a minute old. The live pointer stays per instance (it is stripped from the
// shared rows): a cursor moving at the poll's cadence would jump. The cost is bounded by the
// blob tier budget of the focus round's cycle 3 fix round (VERIFICATION C3-F2; pulse.ts): the
// record is read when the deck's pulse moved (the blob channel's one head per tick drives
// `poll`; `watch` keeps a timer of its own for a caller without the pulse), a push is three puts
// (the copy, the record, the pulse) at most every PRESENCE_PUSH_SPACING_MS per deck per instance
// and only on a change that travels (a join, a leave, a slide change, the identity fields, the
// presenting flag) or when a row's expiry needs a refresh; a heartbeat alone moves the clock and
// nothing else, and is pushed once the row's remaining life is under half, by the heartbeat that
// finds it so: with the client at 10 s between heartbeats when the tab is quiet (docs/SYNC.md
// 3.10) that is every 20 s, three pushes and nine puts a minute for an idle tab (SYNC.md 4.5,
// the row `cost.editor-idle.calls`). The timer a deferred heartbeat arms fires at
// PRESENCE_REFRESH_TIMER_MS of life left, after the heartbeat that would carry the refresh: it
// pushes only when no heartbeat of the tab reached this instance in time. Before the sync round
// fix round it fired at the half life itself, ahead of every heartbeat, so an idle tab pushed
// every 10 s and the idle store count read 18 advanced operations a minute against the ceiling
// of 11 (VERIFICATION.md sync pass 1, F5); a selection or a
// follow change rides the next push and starts none (PRESENCE_VOLATILE_FIELDS). A push is one
// attempt under `ifMatch`: a lost race leaves the changes pending for the next push after the
// floor, never a loop inside one push; a read that proved nothing (the copy under the head's
// version not yet readable) leaves them pending the same way and schedules the one push at the
// floor, so a closed tab's leave lands without another event of that deck on this instance
// (b4.md C3T-R1). A tombstone keeps the clock the leave beacon carried (presenceClock + 1 on the
// wire, above every set of that tab): a set at or below it is a post the tab made before it left
// and never lands, on this instance or pushed from another (C3T-R2); a set above it is a tab
// that came back and lands. Framework free and generic over the row: the blob channel wires it
// (realtime/blob.ts) and the studio builds it over the export Blob client (server/room.ts).
import { createHash } from 'node:crypto';

import { canonicalJson } from '@turboslide/schema/json';
import { z } from 'zod';

import type { ProvenReadOptions } from './access-store.ts';
import { provenGet, versionHex } from './access-store.ts';
import type { BlobClient, BlobEntry } from './blob-store.ts';
import {
  boundedBlobClient,
  deckPrefix,
  isBlobExistsError,
  isBlobPreconditionError,
} from './blob-store.ts';
import { STATE_DIR } from './file-store.ts';
import { putPulse } from './pulse.ts';

export const PRESENCE_FILE = 'presence.json';

/**
 * How stale a roster read may be on an instance where nothing drives the record's reads (no
 * stream of the deck is open here, so the pulse poll of realtime/blob.ts is not running): a
 * presence post landing on such an instance reads the record at most this often. With a stream
 * open the pulse drives every read and this interval is not consulted. Also the interval of the
 * standalone `watch` timer, for a caller without the pulse.
 */
export const PRESENCE_POLL_MS = 5000;
/** The floor between two pushes of one deck from one instance (the budget: a change alone, 5 s apart at least). */
export const PRESENCE_PUSH_SPACING_MS = 5000;
/** The most a shared row lives without a refresh; the client posts a heartbeat every 5 s while active and every 10 s when quiet (docs/SYNC.md 3.10). */
export const PRESENCE_SHARED_TTL_MS = 30_000;
/**
 * The remaining life at which the timer a deferred heartbeat armed pushes the row when no later
 * heartbeat carried the refresh. A heartbeat pushes the refresh itself once the row has under
 * half its life left (`material`), and the quiet cadence of 10 s lands one with between 5 s and
 * 15 s left, so the timer sits at 5 s: after every heartbeat that would refresh the row and
 * ahead of the row's expiry by the tick and the push (the other instances read the record on
 * their 2 s tick once the pulse moved). A timer at the half life pushed ahead of every heartbeat
 * and doubled the idle pushes (VERIFICATION.md sync pass 1, F5).
 */
export const PRESENCE_REFRESH_TIMER_MS = 5000;
/** How long an instance's earlier copies of the record stay before it deletes them. */
export const PRESENCE_COPY_GRACE_MS = 60_000;
/** The row fields that never travel: the live pointer stays per instance. */
export const PRESENCE_OMITTED_FIELDS: readonly string[] = ['pointer'];
/**
 * The row fields that travel with the next push and start none: a selection or a follow change
 * every few hundred milliseconds would push the record at the floor for good, while a join, a
 * leave, a slide change or a name is what a second browser's chip shows (the budget).
 */
export const PRESENCE_VOLATILE_FIELDS: readonly string[] = ['selection', 'follow', 'pointerOn'];

/**
 * `decks/<id>/.turboslide/presence.json`: under the deck's state folder, which the mirror never
 * pulls (blob-store.ts `isMirroredDocument` leaves `.turboslide/` out) and a deck removal deletes
 * with the prefix.
 */
export function presencePath(deckId: string): string {
  return `${deckPrefix(deckId)}${STATE_DIR}/${PRESENCE_FILE}`;
}

/** The immutable copy of one record version: `decks/<id>/.turboslide/presence/<md5 hex>.json`. */
export function presenceCopyPath(deckId: string, version: string): string {
  return `${deckPrefix(deckId)}${STATE_DIR}/presence/${versionHex(version)}.json`;
}

/** What a roster row must carry for the record: the client id and the clock its owner increments. */
export type PresenceRow = { clientId: string; clock: number };

/** The two events the record's changes become for this instance's listeners. */
export type SharedPresenceEvent<T extends PresenceRow> =
  | { type: 'presence'; clientId: string; clock: number; state: T }
  | { type: 'leave'; clientId: string };

export type SharedPresenceOptions<T extends PresenceRow> = {
  /** the Blob client, or a function that resolves it once; null keeps presence per instance */
  client: BlobClient | (() => Promise<BlobClient | null>);
  /** delivers an event to this instance's listeners of the deck (the blob channel's local publish) */
  publish: (deckId: string, event: SharedPresenceEvent<T>) => void;
  /** the clock in ms; Date.now by default */
  now?: () => number;
  pollMs?: number;
  pushSpacingMs?: number;
  maxTtlMs?: number;
  copyGraceMs?: number;
  /** the remaining life at which the timer pushes a deferred heartbeat's row; PRESENCE_REFRESH_TIMER_MS by default */
  refreshTimerMs?: number;
  /** the row fields stripped from the shared record; the pointer by default */
  omit?: readonly string[];
  /** the row fields whose change starts no push; PRESENCE_VOLATILE_FIELDS by default */
  volatile?: readonly string[];
  /** the proven read's options (the tests pass a fetch that answers nothing and no sleep) */
  proven?: ProvenReadOptions;
  onError?: (error: unknown, context: string) => void;
};

export type SharedPresence<T extends PresenceRow> = {
  /** writes a row, alive for `ttlMs` at most `maxTtlMs`, announces it here and pushes it when due */
  set: (deckId: string, clientId: string, state: T, ttlMs: number) => Promise<void>;
  /** the live rows of every instance, this instance's own pointer included */
  roster: (deckId: string) => Promise<T[]>;
  /**
   * removes a row everywhere, announces `leave` here and pushes the tombstone when due; `clock`
   * is the beacon's (above every set of that tab), kept in the tombstone so a set at or below it
   * never lands
   */
  leave: (deckId: string, clientId: string, clock?: number) => Promise<void>;
  /** polls the record while at least one watcher holds the deck; the return value releases this one */
  watch: (deckId: string) => () => void;
  /** one read of the record now (the pulse moved, or a caller without the pulse) and the announcements it brings */
  poll: (deckId: string) => Promise<void>;
  /** the record did not move (the pulse says so): the last read counts as fresh from now, and the rows that ran out since are announced as `leave` */
  confirm: (deckId: string) => void;
  /** pushes the pending changes now, the spacing and the refresh rule aside (the tests) */
  flush: (deckId: string) => Promise<void>;
  /** the last version of the record this instance read or wrote, null before the first read */
  version: (deckId: string) => string | null;
  /**
   * whether the roster this instance holds is a reading of the record: a proven read of it or
   * of its absence. False before the first read and while the record exists but its body could
   * not be read (`readRemote`: the public store's edge on a just written record); the pulse poll
   * keeps its active tick then instead of counting the tab alone (realtime/blob.ts nextTickMs)
   */
  proven: (deckId: string) => boolean;
  close: () => Promise<void>;
};

// ---------------------------------------------------------------------------------------------
// The record

const CLIENT_ID = /^[0-9a-f]{32}$/;

const storedRowSchema = z.object({
  /** when the owner's instance set the row, in ms; a tombstone at or after it wins */
  at: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  state: z.looseObject({
    clientId: z.string().regex(CLIENT_ID),
    clock: z.number().int().nonnegative(),
  }),
});

const storedRecordSchema = z.object({
  v: z.literal(1),
  rows: z.array(storedRowSchema),
  left: z.array(
    z.object({
      clientId: z.string().regex(CLIENT_ID),
      at: z.number().int(),
      /** the beacon's clock; absent in a record an earlier build wrote */
      clock: z.number().int().nonnegative().optional(),
    }),
  ),
});

type StoredRow<T> = { at: number; expiresAt: number; state: T };

/** A tombstone: when the leave was written and, when the beacon carried it, its clock. */
export type PresenceTombstone = { at: number; clock?: number };

type RemoteRecord<T> = {
  rows: Map<string, StoredRow<T>>;
  /** the tombstones by client id */
  left: Map<string, PresenceTombstone>;
  version: string | null;
  /** when this instance last read or wrote it, in ms; 0 before the first read */
  readAt: number;
  /** the bytes read hashed to the version head() named (a stale body never drops a local row) */
  proven: boolean;
};

type PendingChange =
  { kind: 'set'; n: number } | { kind: 'leave'; n: number; at: number; clock?: number };

type DeckPresence<T> = {
  /** this instance's rows, from the posts that landed here */
  local: Map<string, StoredRow<T>>;
  /** the changes not yet in the record */
  pending: Map<string, PendingChange>;
  remote: RemoteRecord<T>;
  /** the rows of other instances the listeners here were told of, by clock */
  announced: Map<string, number>;
  seq: number;
  lastPushAt: number;
  pushTimer: ReturnType<typeof setTimeout> | undefined;
  watchers: number;
  pollTimer: ReturnType<typeof setInterval> | undefined;
  /** the copies this instance wrote, oldest first */
  copies: { pathname: string; at: number }[];
  chain: Promise<unknown>;
  /** the record was there at some read or write of this instance (a later miss is a removed deck, `pushNow`) */
  sawRecord: boolean;
  /** when this instance found the deck's manifest gone, in ms; no push for PRESENCE_GONE_MEMORY_MS after */
  goneAt: number | undefined;
};

/** How long a deck found gone (its manifest deleted) stays so for this instance's pushes before the manifest is headed again. */
export const PRESENCE_GONE_MEMORY_MS = 60_000;

function quotedMd5(bytes: Uint8Array): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

/**
 * Writes the record conditional on the version this instance read (`ifMatch`; no record yet means
 * the file must not exist); null when another instance wrote first.
 */
async function putRecord(
  client: BlobClient,
  path: string,
  bytes: Uint8Array,
  version: string | null,
): Promise<BlobEntry | null> {
  try {
    return await client.put(
      path,
      bytes,
      version === null
        ? { overwrite: false, contentType: 'application/json' }
        : { overwrite: true, ifMatch: version, contentType: 'application/json' },
    );
  } catch (error) {
    if (isBlobPreconditionError(error) || isBlobExistsError(error)) return null;
    throw error;
  }
}

function emptyRemote<T>(): RemoteRecord<T> {
  return { rows: new Map(), left: new Map(), version: null, readAt: 0, proven: false };
}

/** Parses a stored record; anything but a version 1 record reads as empty. */
export function parsePresenceRecord<T extends PresenceRow>(
  bytes: Uint8Array,
): { rows: Map<string, StoredRow<T>>; left: Map<string, PresenceTombstone> } {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { rows: new Map(), left: new Map() };
  }
  const parsed = storedRecordSchema.safeParse(value);
  if (!parsed.success) return { rows: new Map(), left: new Map() };
  const rows = new Map<string, StoredRow<T>>();
  for (const row of parsed.data.rows) {
    rows.set(row.state.clientId, {
      at: row.at,
      expiresAt: row.expiresAt,
      state: row.state as unknown as T,
    });
  }
  const left = new Map<string, PresenceTombstone>();
  for (const row of parsed.data.left)
    left.set(
      row.clientId,
      row.clock === undefined ? { at: row.at } : { at: row.at, clock: row.clock },
    );
  return { rows, left };
}

/** The bytes a record is stored as: canonical JSON with the rows and tombstones sorted by client id. */
export function presenceRecordBytes<T extends PresenceRow>(
  rows: ReadonlyMap<string, StoredRow<T>>,
  left: ReadonlyMap<string, PresenceTombstone>,
): Uint8Array {
  const record = {
    v: 1,
    rows: [...rows.values()].sort((a, b) => a.state.clientId.localeCompare(b.state.clientId)),
    left: [...left.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clientId, tomb]) => ({
        clientId,
        at: tomb.at,
        ...(tomb.clock === undefined ? {} : { clock: tomb.clock }),
      })),
  };
  return new TextEncoder().encode(canonicalJson(record));
}

export function sharedPresence<T extends PresenceRow>(
  options: SharedPresenceOptions<T>,
): SharedPresence<T> {
  const now = options.now ?? (() => Date.now());
  const pollMs = options.pollMs ?? PRESENCE_POLL_MS;
  const spacing = options.pushSpacingMs ?? PRESENCE_PUSH_SPACING_MS;
  const maxTtl = options.maxTtlMs ?? PRESENCE_SHARED_TTL_MS;
  const copyGrace = options.copyGraceMs ?? PRESENCE_COPY_GRACE_MS;
  const refreshTimer = options.refreshTimerMs ?? PRESENCE_REFRESH_TIMER_MS;
  const omit = options.omit ?? PRESENCE_OMITTED_FIELDS;
  const volatile = options.volatile ?? PRESENCE_VOLATILE_FIELDS;
  const onError = options.onError ?? (() => {});
  const decks = new Map<string, DeckPresence<T>>();
  let closed = false;
  let clientPromise: Promise<BlobClient | null> | undefined;

  const clientOf = (): Promise<BlobClient | null> => {
    // every call meets a deadline (blob-store.ts boundedBlobClient), so a fetch that never
    // answers cannot hold a presence post or the deck's push queue on this instance
    clientPromise ??= (
      typeof options.client === 'function' ? options.client() : Promise.resolve(options.client)
    )
      .then((client) => (client === null ? null : boundedBlobClient(client)))
      .catch((error: unknown) => {
        clientPromise = undefined;
        onError(error, 'presence: the Blob client');
        return null;
      });
    return clientPromise;
  };

  const deckOf = (deckId: string): DeckPresence<T> => {
    let d = decks.get(deckId);
    if (d === undefined) {
      d = {
        local: new Map(),
        pending: new Map(),
        remote: emptyRemote(),
        announced: new Map(),
        seq: 0,
        lastPushAt: 0,
        pushTimer: undefined,
        watchers: 0,
        pollTimer: undefined,
        copies: [],
        chain: Promise.resolve(),
        sawRecord: false,
        goneAt: undefined,
      };
      decks.set(deckId, d);
    }
    return d;
  };

  /** One slot in the deck's queue: a push and a poll of one deck never interleave. */
  const queued = <TResult>(deckId: string, run: () => Promise<TResult>): Promise<TResult> => {
    const d = deckOf(deckId);
    const next = d.chain.then(run, run);
    d.chain = next.catch(() => undefined);
    return next;
  };

  const alive = (row: StoredRow<T> | undefined, t: number): row is StoredRow<T> =>
    row !== undefined && row.expiresAt > t;

  /**
   * True when a tombstone names the row's client and is at or after the row's set time, or
   * carries the beacon's clock and the row's clock is at or below it (a set the tab posted
   * before it left, landing late; C3T-R2).
   */
  const buried = (row: StoredRow<T>, left: ReadonlyMap<string, PresenceTombstone>): boolean => {
    const tomb = left.get(row.state.clientId);
    if (tomb === undefined) return false;
    return tomb.at >= row.at || (tomb.clock !== undefined && tomb.clock >= row.state.clock);
  };

  /**
   * True when this instance holds a leave for the row's client that the record does not carry
   * yet (the floor holds the push) and the row is not a later post of a tab that came back: the
   * roster and the announcements here read the leave as a fact from the moment it landed, not
   * from the moment its tombstone reaches the record.
   */
  const leftPending = (d: DeckPresence<T>, row: StoredRow<T>): boolean => {
    const pending = d.pending.get(row.state.clientId);
    if (pending?.kind !== 'leave') return false;
    return pending.clock === undefined || row.state.clock <= pending.clock;
  };

  /** The clock a set of this client must exceed to land: the pending leave's or the record's tombstone's, whichever is higher. */
  const tombstoneClock = (d: DeckPresence<T>, clientId: string): number | undefined => {
    const pending = d.pending.get(clientId);
    const local = pending?.kind === 'leave' ? pending.clock : undefined;
    const remote = d.remote.left.get(clientId)?.clock;
    if (local === undefined) return remote;
    if (remote === undefined) return local;
    return Math.max(local, remote);
  };

  const stripped = (state: T): T => {
    const out: Record<string, unknown> = { ...state };
    for (const key of omit) delete out[key];
    return out as T;
  };

  /** The row's body that starts a push: without its clock, the omitted and the volatile fields. */
  const bodyOf = (state: T): string => {
    const out: Record<string, unknown> = { ...stripped(state), clock: 0 };
    for (const key of volatile) delete out[key];
    return canonicalJson(out);
  };

  /** The rows every instance agrees on, this instance's live rows over the record's, less the clients whose leave this instance holds. */
  const merged = (d: DeckPresence<T>, t: number): Map<string, StoredRow<T>> => {
    const out = new Map<string, StoredRow<T>>();
    for (const [clientId, row] of d.remote.rows) {
      if (alive(row, t) && !buried(row, d.remote.left) && !leftPending(d, row))
        out.set(clientId, row);
    }
    for (const [clientId, row] of d.local) {
      if (!alive(row, t) || buried(row, d.remote.left)) continue;
      const remote = out.get(clientId);
      if (remote === undefined || row.state.clock >= remote.state.clock) out.set(clientId, row);
    }
    return out;
  };

  /** Whether a pending change has to reach the record now (a leave, a new row, a changed body, an expiry under half). */
  const material = (d: DeckPresence<T>, clientId: string, t: number): boolean => {
    const change = d.pending.get(clientId);
    if (change === undefined) return false;
    if (change.kind === 'leave') return true;
    const local = d.local.get(clientId);
    if (!alive(local, t)) return false;
    const remote = d.remote.rows.get(clientId);
    if (remote === undefined || !alive(remote, t)) return true;
    if (remote.state.clock > local.state.clock) return false;
    if (bodyOf(remote.state) !== bodyOf(local.state)) return true;
    return remote.expiresAt - t < maxTtl / 2;
  };

  const needsPush = (d: DeckPresence<T>, t: number): boolean =>
    [...d.pending.keys()].some((clientId) => material(d, clientId, t));

  /**
   * When the timer pushes the earliest deferred heartbeat's row, or null when nothing is
   * deferred: at `refreshTimer` of the record's row's life left, after the heartbeat that would
   * carry the refresh at the half life (`material`), so the timer pushes only for a tab whose
   * heartbeats stopped reaching this instance in time. A local row that ran out and a row the
   * record holds under a higher clock (the tab's heartbeats land on another instance now) arm
   * nothing: the next reconcile drops them, and a timer at their record row's past due would
   * fire at once and arm itself again until then.
   */
  const nextRefreshAt = (d: DeckPresence<T>, t: number): number | null => {
    let at: number | null = null;
    for (const [clientId, change] of d.pending) {
      if (change.kind !== 'set' || material(d, clientId, t)) continue;
      const local = d.local.get(clientId);
      const remote = d.remote.rows.get(clientId);
      if (!alive(local, t) || remote === undefined || remote.state.clock > local.state.clock)
        continue;
      const due = remote.expiresAt - refreshTimer;
      if (at === null || due < at) at = due;
    }
    return at;
  };

  /**
   * Tells this instance's listeners what changed in the record: a row of another instance that
   * is new or moved (by clock) is `presence`, a row that left the record or expired is `leave`,
   * and a local row the proven record no longer holds (a leave that landed on another instance,
   * a tombstone) is dropped and announced as `leave` too; a pending local change stands.
   */
  const reconcile = (deckId: string, d: DeckPresence<T>): void => {
    const t = now();
    const rows = new Map<string, StoredRow<T>>();
    for (const [clientId, row] of d.remote.rows) {
      // a client whose leave is pending here is not announced back from the record's copy of
      // its row while the floor holds the tombstone's push
      if (alive(row, t) && !buried(row, d.remote.left) && !leftPending(d, row))
        rows.set(clientId, row);
    }
    for (const [clientId, row] of rows) {
      const local = d.local.get(clientId);
      if (alive(local, t) && local.state.clock >= row.state.clock) continue;
      if (d.announced.get(clientId) === row.state.clock) continue;
      // the client moved to another instance: its row here is behind the record's
      if (local !== undefined) {
        d.local.delete(clientId);
        d.pending.delete(clientId);
      }
      d.announced.set(clientId, row.state.clock);
      options.publish(deckId, {
        type: 'presence',
        clientId,
        clock: row.state.clock,
        state: row.state,
      });
    }
    for (const clientId of [...d.announced.keys()]) {
      if (rows.has(clientId)) continue;
      const local = d.local.get(clientId);
      d.announced.delete(clientId);
      if (alive(local, t) && !buried(local, d.remote.left)) continue;
      options.publish(deckId, { type: 'leave', clientId });
    }
    // a local row that ran out its life (no heartbeat of its tab reached this instance for
    // maxTtl) leaves whatever the record says and whether or not the read proved it: the clock
    // alone decides an expiry. The listeners here were told of the row when it was set and hear
    // the leave, unless the record holds a live row of the same client from another instance
    // (its heartbeats land there now), which the loop above announced in its place. Before this
    // the row was dropped without a word (`if (alive(local, t))` guarded the leave below), so a
    // tab whose collaborator's set had landed on its own stream instance kept the chip for good
    // once the leave beacon was lost, while the record had let the row go at 30 s
    // (VERIFICATION R1-F1; the return round fix round, return/build/b7.md)
    for (const [clientId, local] of [...d.local]) {
      if (alive(local, t)) continue;
      d.local.delete(clientId);
      d.pending.delete(clientId);
      if (!rows.has(clientId)) options.publish(deckId, { type: 'leave', clientId });
    }
    if (!d.remote.proven) return;
    for (const [clientId, local] of [...d.local]) {
      if (d.pending.has(clientId) && !buried(local, d.remote.left)) continue;
      if (rows.has(clientId) && !buried(local, d.remote.left)) continue;
      d.local.delete(clientId);
      d.pending.delete(clientId);
      options.publish(deckId, { type: 'leave', clientId });
    }
  };

  /** Reads the record when its head moved since the last read; a missing record reads as empty. */
  const readRemote = async (
    deckId: string,
    d: DeckPresence<T>,
    client: BlobClient,
  ): Promise<void> => {
    const path = presencePath(deckId);
    const head = await client.head(path);
    const t = now();
    if (head === null) {
      d.remote = { ...emptyRemote<T>(), readAt: t, proven: true };
      return;
    }
    if (head.version === d.remote.version) {
      d.remote.readAt = t;
      return;
    }
    const got = await provenGet(client, path, {
      ...options.proven,
      copyOf: (_pathname, version) => presenceCopyPath(deckId, version),
    });
    if (got === null) {
      // the head named a record whose body no read answered: the public store's edge answers 403
      // on a just written file for a while (C3S-F4; the SDK's get throws, provenGet swallows it
      // and tries the copy and the url past the CDN, all on the same edge), so the record is
      // there and not empty. The rows this instance holds stand, the copy is unproven so the next
      // roster question reads again once it is stale (roster, confirm) and a push waits for a
      // proven base (pushNow) instead of trying to create over the record, and the pulse poll
      // keeps its active tick while the deck's company is unknown (realtime/blob.ts nextTickMs).
      // Before this the read counted as "no record", proven: a fresh viewer's instance read an
      // empty roster at its first tick and went quiet for 10 s while the editor's first word
      // waited (the features round, ship one, sync.viewer.live-updates), and every announced row
      // left this instance's roster until the next read
      d.remote = { ...d.remote, version: null, readAt: t, proven: false };
      d.sawRecord = true;
      return;
    }
    const parsed = parsePresenceRecord<T>(got.bytes);
    d.sawRecord = true;
    d.remote = {
      rows: parsed.rows,
      left: parsed.left,
      version: got.entry.version,
      readAt: t,
      proven: got.entry.version === head.version,
    };
  };

  /**
   * Merges the pending changes into the record and writes it with ifMatch, once: a lost race
   * (another instance wrote first) leaves the changes pending and the floor applies, so the next
   * push after PRESENCE_PUSH_SPACING_MS (a change, a heartbeat that finds them due, the one
   * timer scheduled here) carries them over a fresh read. Before the fix round four attempts ran
   * inside one push, each a read and two puts, which multiplied into the store's concurrency
   * limit under several instances (VERIFICATION C3-F2).
   */
  const pushNow = async (deckId: string, d: DeckPresence<T>, client: BlobClient): Promise<void> => {
    const path = presencePath(deckId);
    {
      await readRemote(deckId, d, client);
      if (d.remote.version === null && d.remote.proven && d.sawRecord) {
        // the record this instance knew is gone: nobody deletes it but the deck's removal
        // (blob-store.ts `remove`), so the manifest says whether the deck went with it. A push
        // here would write the record, its copy and the pulse back under a folder the removal
        // emptied, and every listing on every instance would head that folder for good (the
        // return round fix round, R1-F3: 489 such folders, one per removed deck, for 65 decks).
        // The head costs once per removed deck per instance, the miss is remembered for
        // PRESENCE_GONE_MEMORY_MS, and the heartbeats of a tab that has not noticed yet cost
        // nothing until then; a deck that is there (the record alone was removed) pushes as before
        const manifest = await client.head(`${deckPrefix(deckId)}deck.json`);
        if (manifest === null) {
          onError(
            new Error(`${path}: the deck is gone; its presence is dropped`),
            'presence: push',
          );
          d.goneAt = now();
          d.pending.clear();
          d.local.clear();
          return;
        }
      }
      if (!d.remote.proven) {
        // no read proved the body: a merge over a stale base would drop another instance's rows.
        // The changes stay pending and one push is scheduled at the floor over a fresh read, the
        // lost race's own shape below (b4.md C3T-R1: before it nothing was scheduled, so a
        // closed tab's leave waited for the next event of the deck on this instance, which the
        // instance's only tab of the deck never sends, and the row lived out its 30 s elsewhere)
        onError(new Error(`${path}: no read proved the record; the push waits`), 'presence: push');
        const waitedAt = now();
        d.lastPushAt = waitedAt;
        scheduleAt(deckId, d, waitedAt + spacing);
        return;
      }
      const t = now();
      const rows = new Map<string, StoredRow<T>>();
      for (const [clientId, row] of d.remote.rows) {
        if (alive(row, t) && !buried(row, d.remote.left)) rows.set(clientId, row);
      }
      const left = new Map<string, PresenceTombstone>();
      for (const [clientId, tomb] of d.remote.left)
        if (tomb.at + maxTtl > t) left.set(clientId, tomb);
      const snapshot = new Map(d.pending);
      for (const [clientId, change] of snapshot) {
        if (change.kind === 'leave') {
          rows.delete(clientId);
          // the later time and the higher clock of the two tombstones win
          const previous = left.get(clientId);
          const clock =
            previous?.clock === undefined
              ? change.clock
              : change.clock === undefined
                ? previous.clock
                : Math.max(previous.clock, change.clock);
          left.set(clientId, {
            at: Math.max(change.at, previous?.at ?? 0),
            ...(clock === undefined ? {} : { clock }),
          });
          continue;
        }
        const local = d.local.get(clientId);
        if (!alive(local, t)) continue;
        if (buried(local, left)) {
          // the client left through another instance after this set: the row never lands
          d.local.delete(clientId);
          options.publish(deckId, { type: 'leave', clientId });
          continue;
        }
        const existing = rows.get(clientId);
        if (existing !== undefined && existing.state.clock > local.state.clock) continue;
        rows.set(clientId, {
          at: local.at,
          expiresAt: local.expiresAt,
          state: stripped(local.state),
        });
      }
      const bytes = presenceRecordBytes(rows, left);
      const version = quotedMd5(bytes);
      const settle = (): void => {
        for (const [clientId, change] of snapshot) {
          if (d.pending.get(clientId) === change) d.pending.delete(clientId);
        }
      };
      if (version === d.remote.version) {
        settle();
        return;
      }
      const copy = presenceCopyPath(deckId, version);
      await client.put(copy, bytes, { overwrite: true, contentType: 'application/json' });
      const entry = await putRecord(client, path, bytes, d.remote.version);
      if (entry === null) {
        // another instance wrote first: the changes stay pending, the floor applies from this
        // attempt, and one push is scheduled at the floor over a fresh read; no loop here
        d.remote.version = null;
        d.remote.proven = false;
        d.lastPushAt = t;
        scheduleAt(deckId, d, t + spacing);
        return;
      }
      d.remote = { rows, left, version: entry.version, readAt: t, proven: true };
      d.sawRecord = true;
      d.lastPushAt = t;
      settle();
      // the deck's pulse (pulse.ts): the one head every instance's poll makes moves with this push
      await putPulse(client, deckId, 'presence', { now: () => new Date(t).toISOString() });
      d.copies.push({ pathname: copy, at: t });
      const old = d.copies.filter((row) => row.at + copyGrace <= t && row.pathname !== copy);
      if (old.length > 0) {
        d.copies = d.copies.filter((row) => !old.includes(row));
        await client
          .del(old.map((row) => row.pathname))
          .catch((error: unknown) => onError(error, 'presence: deleting old copies'));
      }
      reconcile(deckId, d);
    }
  };

  const pushIfDue = async (deckId: string, force = false): Promise<void> => {
    const client = await clientOf();
    if (client === null || closed) return;
    await queued(deckId, async () => {
      const d = deckOf(deckId);
      if (d.pending.size === 0) return;
      const t = now();
      if (d.goneAt !== undefined) {
        // the deck was found gone under a push a moment ago (pushNow): its heartbeats write
        // nothing for a minute, then the manifest is headed again
        if (d.goneAt + PRESENCE_GONE_MEMORY_MS > t) {
          d.pending.clear();
          d.local.clear();
          return;
        }
        d.goneAt = undefined;
      }
      if (!force) {
        if (!needsPush(d, t)) {
          scheduleAt(deckId, d, nextRefreshAt(d, t));
          return;
        }
        if (d.lastPushAt + spacing > t) {
          scheduleAt(deckId, d, d.lastPushAt + spacing);
          return;
        }
      }
      try {
        await pushNow(deckId, d, client);
      } catch (error) {
        onError(error, `presence: pushing ${deckId}`);
        scheduleAt(deckId, d, now() + spacing);
      }
    });
  };

  /** A timer for the next push at `at`, replacing an earlier one that is later. */
  const scheduleAt = (deckId: string, d: DeckPresence<T>, at: number | null): void => {
    if (at === null || closed) return;
    if (d.pushTimer !== undefined) clearTimeout(d.pushTimer);
    const wait = Math.max(0, at - now());
    const timer = setTimeout(() => {
      d.pushTimer = undefined;
      void pushIfDue(deckId);
    }, wait);
    timer.unref();
    d.pushTimer = timer;
  };

  /**
   * One read of the record and the announcements it brings. A read alone: the pushes run from
   * `set`, `leave` and the timer a deferred change or a lost race scheduled, so a read never
   * turns into a write of its own (the budget: presence writes land on a change alone).
   */
  const pollNow = async (deckId: string): Promise<void> => {
    const client = await clientOf();
    if (client === null || closed) return;
    await queued(deckId, async () => {
      const d = deckOf(deckId);
      try {
        await readRemote(deckId, d, client);
      } catch (error) {
        onError(error, `presence: reading ${deckId}`);
        return;
      }
      reconcile(deckId, d);
    });
  };

  return {
    async set(deckId, clientId, state, ttlMs) {
      const d = deckOf(deckId);
      const t = now();
      const current = d.local.get(clientId);
      // an older clock is a late batch; the roster keeps the newer state (SPEC-3 3.8)
      if (alive(current, t) && current.state.clock > state.clock) return;
      // a set at or below the tombstone's clock is a post the tab made before its leave beacon
      // (the beacon carries presenceClock + 1): it never lands and never replaces the pending
      // leave (C3T-R2: the route's set handler runs after a `?leave=1` for the same id when the
      // roster read it awaits takes longer, and `pending` is keyed by the client id)
      const tomb = tombstoneClock(d, clientId);
      if (tomb !== undefined && state.clock <= tomb) return;
      d.seq += 1;
      d.local.set(clientId, { at: t, expiresAt: t + Math.min(ttlMs, maxTtl), state });
      d.pending.set(clientId, { kind: 'set', n: d.seq });
      options.publish(deckId, { type: 'presence', clientId, clock: state.clock, state });
      await pushIfDue(deckId);
    },

    async roster(deckId) {
      const d = deckOf(deckId);
      if (now() - d.remote.readAt >= pollMs) await pollNow(deckId);
      return [...merged(d, now()).values()].map((row) => row.state);
    },

    async leave(deckId, clientId, clock) {
      const d = deckOf(deckId);
      const t = now();
      const known =
        alive(d.local.get(clientId), t) ||
        d.announced.has(clientId) ||
        alive(d.remote.rows.get(clientId), t);
      d.seq += 1;
      d.local.delete(clientId);
      d.announced.delete(clientId);
      d.pending.set(clientId, {
        kind: 'leave',
        n: d.seq,
        at: t,
        ...(clock === undefined ? {} : { clock }),
      });
      if (known) options.publish(deckId, { type: 'leave', clientId });
      await pushIfDue(deckId);
    },

    watch(deckId) {
      const d = deckOf(deckId);
      d.watchers += 1;
      if (d.pollTimer === undefined) {
        const timer = setInterval(() => void pollNow(deckId), pollMs);
        timer.unref();
        d.pollTimer = timer;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        d.watchers -= 1;
        if (d.watchers <= 0 && d.pollTimer !== undefined) {
          clearInterval(d.pollTimer);
          d.pollTimer = undefined;
        }
      };
    },

    poll: pollNow,

    confirm(deckId) {
      const d = decks.get(deckId);
      if (d === undefined || d.remote.readAt <= 0) return;
      // a copy no read proved (the record's body could not be read, readRemote) is not
      // confirmed: the next roster question reads it again once it is stale
      if (d.remote.proven) d.remote.readAt = now();
      // the rows that ran out since the last read leave now, on the tick: an expiry is the
      // clock's and needs no read, and a deck whose pulse stands still (nobody writes, the
      // collaborator's tab is gone) would otherwise announce its expiries only when the pulse
      // next moved (R1-F1). No store call: the tick's one head is the pulse's
      reconcile(deckId, d);
    },

    flush(deckId) {
      return pushIfDue(deckId, true);
    },

    version(deckId) {
      return decks.get(deckId)?.remote.version ?? null;
    },

    proven(deckId) {
      return decks.get(deckId)?.remote.proven ?? false;
    },

    async close() {
      closed = true;
      for (const d of decks.values()) {
        if (d.pollTimer !== undefined) clearInterval(d.pollTimer);
        if (d.pushTimer !== undefined) clearTimeout(d.pushTimer);
        d.pollTimer = undefined;
        d.pushTimer = undefined;
      }
      decks.clear();
    },
  };
}

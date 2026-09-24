// The blob channel (gslides-parity SPEC-3 2.5, 3.7 e; report 02 7.7): the reduced tier for a
// deployment without Redis and the automatic fallback while Redis is unreachable. There is no
// stream: every append is one commit through the deck's store (`BlobStore.write` hosted, a
// `FileStore` on a checkout), so the seq of an entry is the revision its record made, `since`
// reads the version log, `head` is the revision, and `subscribe` follows the store's watch
// channel (the Blob mirror's head poll, `fs.watch` on a checkout). Locks, budgets and flags are
// per instance, from memory.ts. Presence is shared when `shared` is given (the focus round, cycle
// 3; VERIFICATION C2-F28): the roster lives in the store's presence record (store/presence-store.ts)
// and the comments index other instances push is read beside it (comments-store.ts
// `watchSidecarIndex`) and announced as the checkpoint frame with `comments`, so a second browser
// on another instance sees the chips, the leaves and a new thread; without it presence stays per
// instance. With `shared` the channel polls the store on the blob tier budget of the cycle 3 fix
// round (store/pulse.ts; VERIFICATION C3-F1, C3-F2): one head of the deck's pulse per
// HOSTED_POLL_MS while a client stream of the deck is open on this instance, none when no stream
// is open (the room's own listener is `passive`), the three reads (the manifest, the presence
// record, the comments index) only when the pulse moved, the manifest alone every fifteenth
// tick, and a 429 or a 5xx from the store backs the poll off to 60 s and tells the streams with
// a `store` event, whose title row reads Reconnecting until a poll succeeds. One write per second
// per deck per instance keeps the deployment under the Blob operation cap. Comment entries go
// straight to the sidecar through `applyComments`, which the comments store supplies (SPEC-3
// 5.2); without it a comment entry is refused. No `node:` (store/pulse.ts is node free).
import { ConflictError } from '@turboslide/schema/errors';
import type { WriteOrigin } from '@turboslide/schema/mutations';
import type { SidecarIndexChange } from '@turboslide/store/comments-store';
import type { SharedPresence } from '@turboslide/store/presence-store';
import {
  HOSTED_POLL_MS,
  HOSTED_POLL_QUIET_MS,
  PULSE_SAFETY_TICKS,
  isStoreBusy,
  pollBackoffMs,
  pollTickMs,
  storeRetryAfterMs,
} from '@turboslide/store/pulse';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import type {
  AppendResult,
  Entry,
  NewEntry,
  RealtimeChannel,
  RoomEvent,
  RoomListener,
  RoomMutation,
  RosterEntry,
  SubscribeOptions,
} from './channel.ts';
import { foldMutation } from './coalesce.ts';
import type { FlagName } from './keys.ts';
import { checkDeckId } from './keys.ts';
import { memoryChannel } from './memory.ts';
import type { MemoryChannel } from './memory.ts';
import { PRESENCE_EXPIRY_MS, REPLAY_MAX_ENTRIES } from './protocol.ts';

/** A watcher of the deck's comments index the channel drives: one read now, and the stop. */
export type CommentsWatch = { poll: () => Promise<void>; stop: () => void };

/** The cross instance half of the blob tier (store/presence-store.ts, comments-store.ts, pulse.ts). */
export type BlobSharedDeps = {
  /** the roster every instance agrees on, over the store's presence record */
  presence: SharedPresence<RosterEntry>;
  /**
   * the deck's pulse version (store/pulse.ts `headPulse`): the one head the poll makes per tick;
   * null when the store holds no pulse for the deck yet
   */
  pulse: (deckId: string) => Promise<string | null>;
  /**
   * a watcher of the deck's comments index without a timer of its own (`pollMs: null`); the
   * channel reads it when the pulse moved and hands over every version another instance pushed
   */
  watchComments?: (deckId: string, onChange: (change: SidecarIndexChange) => void) => CommentsWatch;
  /** the tick while the deck is in use or the roster holds another client; HOSTED_POLL_MS by default (the tests shorten it) */
  pollMs?: number;
  /** the tick when the one tab is alone and quiet (docs/SYNC.md 3.10); HOSTED_POLL_QUIET_MS by default */
  quietPollMs?: number;
};

export type BlobChannelDeps = {
  /** the deck's store on this instance (`openDeckStore`); a RangeError for a missing deck */
  open: (deckId: string) => Promise<DeckStore>;
  /** the clock in ms; Date.now by default */
  now?: () => number;
  /** the least time between two commits of one deck on this instance; 1,000 ms per SPEC-3 2.5 */
  minWriteSpacingMs?: number;
  /** writes comment entries to the sidecar (the comments store); absent, a comment entry is refused */
  applyComments?: (deckId: string, entries: NewEntry[]) => Promise<void>;
  /** kill switch values (SPEC-3 0.33) */
  flags?: Partial<Record<FlagName, boolean>>;
  /** the shared roster and the comments index poll; absent, presence is per instance */
  shared?: BlobSharedDeps;
  /** how long after the deck's last stream closed here the prune runs; PRUNE_AT_CLOSE_DELAY_MS by default (the tests shorten it) */
  pruneAtCloseDelayMs?: number;
  onError?: (error: unknown, context: string) => void;
};

/**
 * The wait between the close of a deck's last stream on the instance and the snapshot prune
 * (docs/SYNC.md 3.6, invariant 13; the sync round fix round, VERIFICATION.md sync pass 1 F6 and
 * F7). A stream closes and reopens without the seller leaving: at its lifetime's end
 * (protocol.ts STREAM_LIFETIME_MS), on a reconnect, on a resync; the client reopens within
 * seconds. A prune at every such close listed `snapshots/` once per tab per rollover, an
 * advanced operation the budget did not name (`sync.pull.no-listing` read `list` 2 and
 * `cost.two-tabs-idle.calls` `list` 1 inside their windows on the preview). The prune therefore
 * waits this long and a stream that reopens inside the wait cancels it; a seller who left is
 * pruned once, half a minute later.
 */
export const PRUNE_AT_CLOSE_DELAY_MS = 30_000;

export type BlobChannel = RealtimeChannel & {
  setFlag: MemoryChannel['setFlag'];
};

type DeckState = {
  chain: Promise<unknown>;
  lastWriteAt: number;
  /**
   * when an op last landed on this instance for the deck (a commit of its own or a record
   * announced to its streams), for the two paced tick (pulse.ts `pollTickMs`); 0 before any
   */
  lastOpAt: number;
  /** the last revision delivered to this instance's listeners */
  lastSeq: number;
  /**
   * the client ids whose presence this instance's tabs set, with the time of the last set; the
   * two paced tick reads its company from them and the roster (`nextTickMs`): a roster row not
   * among them is another instance's tab, a second row among them is a second tab of this
   * instance; an id no tab refreshed within PRESENCE_EXPIRY_MS is no longer own
   */
  ownClients: Map<string, number>;
  /** the store poll (the pulse loop with `shared`, the store's own watch without); running while a client stream is open here */
  watching: Promise<() => void> | undefined;
  /**
   * reads the roster once and re-arms the running pulse poll's tick from it (`startPulsePoll`):
   * a stream that opens while the poll runs at the quiet pace is company, and its first words
   * would otherwise wait for the quiet tick; undefined without a running pulse poll
   */
  wake: (() => void) | undefined;
  store: Promise<DeckStore> | undefined;
  /** the client streams subscribed on this instance; the poll runs while there is one */
  listeners: number;
  /** the records this instance committed since a stream of the deck last opened here; the prune at the last stream's close runs only above zero */
  commits: number;
  /** the prune waiting on the last stream's close (`pruneAtClose`); a stream that reopens inside the wait cancels it */
  pruneTimer: ReturnType<typeof setTimeout> | undefined;
  /** the pulse version the poll read last; undefined before the first read */
  lastPulse: string | null | undefined;
  /** the ticks so far, for the safety tick */
  ticks: number;
  /** the refusals of the store in a row, for the backoff */
  failures: number;
  /** the streams were told the store refuses; cleared with the `store` ok event */
  degraded: boolean;
  comments: CommentsWatch | undefined;
};

/**
 * The origin a record names (docs/SYNC.md 3.2; `Write.origin` carried onto the record by the
 * store), or undefined for a record written outside a room or before the round. Read through a
 * shape of its own so this module compiles beside a store whose `VersionRecord` is a step behind.
 */
export function recordOrigin(record: VersionRecord): WriteOrigin | undefined {
  const origin = (record as VersionRecord & { origin?: unknown }).origin;
  if (typeof origin !== 'object' || origin === null) return undefined;
  const { clientId, opIds } = origin as { clientId?: unknown; opIds?: unknown };
  if (typeof clientId !== 'string' || !Array.isArray(opIds) || opIds.length === 0) return undefined;
  if (!opIds.every((id) => typeof id === 'string')) return undefined;
  return { clientId, opIds: opIds as string[] };
}

/**
 * A record as one stream entry: the writer's author, its mutations, the revision as the seq. A
 * record that names its origin travels with its writer's client id and every op id it folded
 * (channel.ts `Entry.covers`), so the writer's tab acknowledges by id and skips its own echo; a
 * record without one travels as `store`, as every record did before the round.
 */
export function entryOfRecord(record: VersionRecord): Entry {
  const origin = recordOrigin(record);
  return {
    seq: record.revision,
    rev: record.baseRevision,
    kind: 'edit',
    author: record.author,
    clientId: origin?.clientId ?? 'store',
    opId: `store:${record.n}`,
    mutations: record.mutations,
    at: record.createdAt,
    ...(origin === undefined ? {} : { covers: [...origin.opIds] }),
  };
}

/**
 * The answer to a resent POST whose op ids a record already covers (docs/SYNC.md 3.2): one entry
 * per requested op id at the record's seq, in the record's order, the first carrying the
 * record's folded mutations and the rest none, so a client that applies the answer applies the
 * fold once and settles every op by its id (`covers` rides each so a client that acknowledges by
 * cover settles them all from the first). `covering` is the record's stream entry; `opIds` the
 * resend's, of which only those the record covers are answered.
 */
export function synthesizeReplayed(covering: Entry, opIds: readonly string[]): Entry[] {
  const covers = covering.covers ?? [];
  const wanted = new Set(opIds);
  const out: Entry[] = [];
  for (const opId of covers) {
    if (!wanted.has(opId)) continue;
    out.push({
      ...covering,
      clientId: covering.clientId,
      opId,
      mutations: out.length === 0 ? (covering.mutations ?? []) : [],
      covers: [...covers],
    });
  }
  return out;
}

function checkpointOf(record: VersionRecord, external = false): RoomEvent {
  return {
    type: 'checkpoint',
    revision: record.revision,
    fromSeq: record.revision,
    toSeq: record.revision,
    ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
    author: record.author,
    note: record.note,
    ...(external ? { external: true } : {}),
  };
}

/**
 * Whether a record's mutations apply on a tab's copy of the document at the record's base, so
 * the record can travel as an `op`. A `version.restore` cannot: the reducer resolves the version
 * from the log the store holds and a tab has none (the memory tier's follower makes the same
 * distinction, apps/studio/src/server/room.ts `follow`), so it is announced as an external
 * checkpoint and every tab reloads at its revision. Before this the blob channel announced a
 * restore as an op whose apply failed silently in every tab, which then took the checkpoint
 * frame's revision on the document from before the restore: the panel said "Restored" while the
 * slides did not change (VERIFICATION F-versions; docs/FOCUS.md rank 21).
 */
export function isReplayableRecord(record: VersionRecord): boolean {
  return (
    record.mutations.length > 0 &&
    !record.mutations.some((mutation) => mutation.op === 'version.restore')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The record a store's write answered as already committed (docs/SYNC.md 3.2: `{ ok: true,
 * replayed: <record> }` from the write path's origin check, with no claim and no commit), or
 * undefined for an ordinary commit. Read through its shape so this module compiles beside a
 * store whose `WriteOutcome` is a step behind.
 */
function replayedRecordOf(outcome: { ok: true }): VersionRecord | undefined {
  const replayed = (outcome as { replayed?: unknown }).replayed;
  if (typeof replayed !== 'object' || replayed === null) return undefined;
  const record = replayed as Partial<VersionRecord>;
  return typeof record.revision === 'number' && typeof record.n === 'number'
    ? (record as VersionRecord)
    : undefined;
}

/**
 * A store error that means another writer won: the schema's `ConflictError`, and the Blob
 * mirror's `StaleMirrorError` (matched by name; the store's class imports `node:fs`, which this
 * package never loads).
 */
export function isLostRace(error: unknown): boolean {
  if (error instanceof ConflictError) return true;
  return error instanceof Error && error.name === 'StaleMirrorError';
}

/**
 * The store's word that the deck is gone: the RangeError the store's reads throw once the
 * manifest's head answers null (blob-store.ts `requirePresent`, "No deck <id> in the Blob
 * store"), matched by message since a bundle can carry two copies of the store module.
 */
export function isDeckGone(error: unknown): boolean {
  return error instanceof Error && /^No deck .* in the Blob store$/.test(error.message);
}

export function blobChannel(deps: BlobChannelDeps): BlobChannel {
  const now = deps.now ?? (() => Date.now());
  const spacing = deps.minWriteSpacingMs ?? 1000;
  const onError = deps.onError ?? (() => {});
  const local = memoryChannel({
    now,
    ...(deps.flags === undefined ? {} : { flags: deps.flags }),
  });
  const decks = new Map<string, DeckState>();

  const stateOf = (deckId: string): DeckState => {
    const id = checkDeckId(deckId);
    let state = decks.get(id);
    if (state === undefined) {
      state = {
        chain: Promise.resolve(),
        lastWriteAt: 0,
        lastOpAt: 0,
        lastSeq: -1,
        ownClients: new Map(),
        watching: undefined,
        wake: undefined,
        store: undefined,
        listeners: 0,
        commits: 0,
        pruneTimer: undefined,
        lastPulse: undefined,
        ticks: 0,
        failures: 0,
        degraded: false,
        comments: undefined,
      };
      decks.set(id, state);
    }
    return state;
  };

  const storeOf = (deckId: string): Promise<DeckStore> => {
    const state = stateOf(deckId);
    state.store ??= deps.open(deckId);
    return state.store;
  };

  /** One slot in the deck's queue: appends and polls of one deck never interleave. */
  const queued = <T>(deckId: string, run: () => Promise<T>): Promise<T> => {
    const state = stateOf(deckId);
    const next = state.chain.then(run, run);
    state.chain = next.catch(() => undefined);
    return next;
  };

  /**
   * The records after a revision, oldest first, write entries only (a named version moves
   * nothing), each with whether it sits on the far side of a hole in the log: a record whose
   * number is not the previous record's plus one, the previous being any record of the log (a
   * named version counts, its number is taken). The store's pull continues past a missing number
   * since the sync round (docs/SYNC.md 3.6), so the mirror can hold n and n plus 2 without n
   * plus 1; `announce` reads the flag.
   */
  const recordsAfter = async (
    deckId: string,
    seq: number,
    limit: number,
  ): Promise<{ record: VersionRecord; afterHole: boolean }[]> => {
    const store = await storeOf(deckId);
    const records = await store.records();
    const out: { record: VersionRecord; afterHole: boolean }[] = [];
    let previous: VersionRecord | undefined;
    for (const record of records) {
      const afterHole = previous !== undefined && record.n !== previous.n + 1;
      previous = record;
      if (record.revision <= seq || record.mutations.length === 0) continue;
      out.push({ record, afterHole });
      if (out.length >= limit) break;
    }
    return out;
  };

  /**
   * Delivers the records this instance has not announced yet: an `op` and a `checkpoint` each.
   * A revision the store reached without a record this instance can read (a record put that
   * failed after its commit, a record the pull could not fetch) is announced as an external
   * checkpoint at that revision, so every tab reloads at the head instead of waiting for an op
   * that never comes; before this the watch fired once per revision, the announce found no record
   * and nothing was delivered until the next write (docs/FOCUS.md rank 20: a second browser's
   * edits arrived 30 to 45 s late or never). With `below`, the records under that revision
   * alone and no head read: the append path announces what other instances committed between
   * this instance's position and its own write before it publishes that write's entries, so a
   * tab whose stream is here never holds a gap under an entry it was handed (VERIFICATION
   * C3S-F8: the write path moved the position past a record it had not announced, and a tab's
   * second picture waited on the gap watch's 8 s reopen where the row allows 5 s).
   */
  const announce = async (deckId: string, below = Number.POSITIVE_INFINITY): Promise<void> => {
    const state = stateOf(deckId);
    if (state.lastSeq < 0) return;
    const records = await recordsAfter(deckId, state.lastSeq, REPLAY_MAX_ENTRIES);
    for (const { record, afterHole } of records) {
      if (record.revision >= below) break;
      state.lastSeq = record.revision;
      if (!isReplayableRecord(record) || afterHole) {
        // a restore: the tabs reload at its revision (isReplayableRecord says why). The first
        // record above a hole in the log the same way (docs/SYNC.md 3.6, the reader's rule): a
        // tab at the revision under the hole cannot apply an op whose base it never reached, so
        // it reloads once at the head and takes the records after this one as ops
        await local.publish(deckId, checkpointOf(record, true));
        continue;
      }
      // an op landed on this instance's streams: the deck is in use here (the two paced tick)
      state.lastOpAt = now();
      await local.publish(deckId, { type: 'op', entry: entryOfRecord(record) });
      await local.publish(deckId, checkpointOf(record));
    }
    if (below !== Number.POSITIVE_INFINITY) return;
    const revision = await (await storeOf(deckId)).revision();
    if (revision > state.lastSeq) {
      state.lastSeq = revision;
      await local.publish(deckId, {
        type: 'checkpoint',
        revision,
        fromSeq: revision,
        toSeq: revision,
        author: { kind: 'agent', name: 'store' },
        note: '',
        external: true,
      });
    }
  };

  /** Ends a deck's poll on this instance; the next stream starts it again from the position it reads then. */
  const stopWatching = (state: DeckState): void => {
    const watching = state.watching;
    state.watching = undefined;
    state.lastPulse = undefined;
    if (watching === undefined) return;
    watching.then(
      (release) => release(),
      () => undefined,
    );
  };

  /**
   * The snapshot prune at the last stream's close (docs/SYNC.md 3.6, invariant 13): the write
   * path prunes every twentieth commit, so a deck edited fewer than twenty times between two
   * visits would keep its unreferenced snapshots until its twentieth record; the close of the
   * deck's last stream on this instance runs the store's prune once, on the deck's queue so it
   * never runs beside an append. Two rules keep it off the hot path (PRUNE_AT_CLOSE_DELAY_MS):
   * it runs only when this instance committed a record for the deck while a stream was open here
   * (a reader's close makes no garbage to name; the instance that wrote the snapshots is the
   * one that prunes them), and only once the last stream has stayed closed for the delay, so a
   * stream that reopens at its lifetime's end or after a reconnect costs no listing. The file
   * and memory tiers have no prune and the call is a no-op there (store/build/b3.md R3).
   */
  const pruneAtClose = (deckId: string): void => {
    const state = stateOf(deckId);
    if (state.pruneTimer !== undefined) clearTimeout(state.pruneTimer);
    if (state.commits === 0) return;
    const run = (): void => {
      state.pruneTimer = undefined;
      if (state.listeners > 0 || state.commits === 0) return;
      state.commits = 0;
      void queued(deckId, async () => {
        const store = (await storeOf(deckId)) as DeckStore & {
          pruneSnapshots?: () => Promise<number>;
        };
        await store.pruneSnapshots?.();
      }).catch((error: unknown) =>
        onError(error, `blob: pruning ${deckId} at the last stream's close`),
      );
    };
    state.pruneTimer = setTimeout(run, deps.pruneAtCloseDelayMs ?? PRUNE_AT_CLOSE_DELAY_MS);
    state.pruneTimer.unref?.();
  };

  /**
   * The three reads a moved pulse asks for, together: the manifest (a sync of the mirror, then
   * the records since the position announced as ops), the presence record and the comments
   * index. Each read is a head, plus what moved.
   */
  const readMoved = async (deckId: string, shared: BlobSharedDeps): Promise<void> => {
    const state = stateOf(deckId);
    await Promise.all([
      queued(deckId, async () => {
        const store = (await storeOf(deckId)) as DeckStore & {
          sync?: (force?: boolean) => Promise<unknown>;
        };
        await store.sync?.(true);
        await announce(deckId);
      }),
      shared.presence.poll(deckId),
      state.comments?.poll() ?? Promise.resolve(),
    ]);
  };

  /**
   * The poll of one deck on this instance (the blob tier budget): one head of the deck's pulse
   * per tick, the three reads when it moved, the manifest alone every PULSE_SAFETY_TICKS ticks
   * (a writer that stopped between its commit and its pulse put), and the backoff with the
   * `store` events when the store refuses. Runs while a client stream of the deck is open here.
   * The tick is two paced (docs/SYNC.md 3.10; pulse.ts `pollTickMs`): `pollMs` while an op
   * landed on this instance in the last POLL_ACTIVE_WINDOW_MS, the roster holds more than one
   * row or more than one stream of the deck is open here, `quietPollMs` when the one tab is
   * alone and quiet (nextTickMs says why a second tab of this instance counts). The roster is
   * read from the presence store's copy after the tick's own read confirmed or refreshed it,
   * so the question costs no store call of its own.
   */
  const startPulsePoll = (deckId: string, shared: BlobSharedDeps): (() => void) => {
    const state = stateOf(deckId);
    const pollMs = shared.pollMs ?? HOSTED_POLL_MS;
    const quietPollMs = shared.quietPollMs ?? HOSTED_POLL_QUIET_MS;
    /**
     * The wait before the next tick: the active or the quiet one, by the deck's state on this
     * instance. The platform routes every request on its own, so a tab's ops POST may commit on
     * an instance other than the one holding its stream, and every other tab of the deck then
     * learns of that commit through its own instance's tick. The tick is therefore active
     * whenever the deck has more than one tab anywhere: a roster row another instance's tab
     * set, a second row this instance's tabs set, or a second stream open here; it is quiet
     * only for a tab that is alone. Before the sync and costs round's ship the rows this
     * instance's tabs set never counted, so two tabs of one instance read each other's first
     * words at the quiet tick (VERIFICATION.md "Sync and costs round, pass 2" F1).
     */
    const nextTickMs = async (): Promise<number> => {
      const roster = await shared.presence.roster(deckId);
      const t = now();
      const own = (clientId: string): boolean => {
        const at = state.ownClients.get(clientId);
        if (at === undefined) return false;
        if (t - at < PRESENCE_EXPIRY_MS) return true;
        state.ownClients.delete(clientId);
        return false;
      };
      const ownRows = roster.filter((row) => own(row.clientId)).length;
      const otherRows = roster.length - ownRows;
      // company: a row of another instance's tab, a second row of this instance's tabs, or a
      // second stream open here (a stream whose tab has not pushed its row yet counts as well).
      // A roster that is not a reading of the record yet (the record's body could not be read,
      // presence-store.ts readRemote) never counts the tab alone: the active tick holds until
      // a read proves it (the features round, ship one: a fresh viewer's instance read an empty
      // roster at its first tick and waited a quiet tick for the editor's first word)
      return pollTickMs({
        now: t,
        lastOpAt: state.lastOpAt,
        others: otherRows + Math.max(0, ownRows - 1, state.listeners - 1),
        activeMs: pollMs,
        quietMs: quietPollMs,
        rosterKnown: shared.presence.proven(deckId),
      });
    };
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** when the armed timer fires, in the clock's ms; +Infinity while a tick runs (it arms the next one itself) */
    let dueAt = Number.POSITIVE_INFINITY;
    const arm = (wait: number): void => {
      if (timer !== undefined) clearTimeout(timer);
      dueAt = now() + wait;
      timer = setTimeout(() => {
        timer = undefined;
        dueAt = Number.POSITIVE_INFINITY;
        void tick();
      }, wait);
      timer.unref?.();
    };
    /**
     * A stream opened while this poll runs (`subscribe`): one read of the record now, the one
     * extra store call of a stream open, then the tick re-armed from the fresh roster when it
     * is sooner than the armed one. The new stream is company (`nextTickMs` counts the open
     * streams), so a poll at the quiet pace returns to the active pace at once instead of at
     * its next quiet tick, up to 10 s away (the features round, ship one: a viewer joining an
     * editor's deck read the first word past the 5 s bound on the preview). A tick in flight
     * arms the next wait from the same fresh roster itself. Nothing periodic is added.
     */
    state.wake = (): void => {
      if (stopped) return;
      void (async () => {
        await shared.presence.poll(deckId);
        if (stopped || dueAt === Number.POSITIVE_INFINITY) return;
        const wait = await nextTickMs();
        if (now() + wait < dueAt) arm(wait);
      })().catch((error: unknown) => onError(error, `blob: waking the poll of ${deckId} failed`));
    };
    state.comments = shared.watchComments?.(deckId, (change) => {
      // a moved comments index becomes the checkpoint frame with `comments` the memory tier's
      // checkpointer sends, at the revision this instance announced last, so every tab reads
      // the sidecar again (docs/FOCUS.md ranks 20 and 36; VERIFICATION C2-F28)
      const revision = Math.max(0, state.lastSeq);
      void local.publish(deckId, {
        type: 'checkpoint',
        revision,
        fromSeq: revision,
        toSeq: revision,
        author: { kind: 'agent', name: 'store' },
        note: '',
        comments: { revision: change.revision, threadIds: change.threadIds },
      });
    });
    const tick = async (): Promise<void> => {
      if (stopped) return;
      let wait = pollMs;
      try {
        const safety = state.ticks > 0 && state.ticks % PULSE_SAFETY_TICKS === 0;
        state.ticks += 1;
        if (safety) {
          // the manifest alone, in place of the pulse: one call this tick as well
          await queued(deckId, async () => {
            const store = (await storeOf(deckId)) as DeckStore & {
              sync?: (force?: boolean) => Promise<unknown>;
            };
            await store.sync?.(true);
            await announce(deckId);
          });
        } else {
          const version = await shared.pulse(deckId);
          const moved = state.lastPulse === undefined || version !== state.lastPulse;
          state.lastPulse = version;
          if (moved) await readMoved(deckId, shared);
          else shared.presence.confirm(deckId);
        }
        if (state.degraded) {
          state.degraded = false;
          state.failures = 0;
          await local.publish(deckId, { type: 'store', ok: true });
        }
        // after the read: the roster copy is fresh from this tick, so no store call is made here
        wait = await nextTickMs();
      } catch (error) {
        if (isDeckGone(error)) {
          // the deck was removed under the poll (Delete forever on another instance while a
          // stream of it was still open here; VERIFICATION C3-F13): one line, and the poll
          // ends instead of failing once per tick until the last stream closes. The next
          // stream of the deck, should one open, starts a poll from the store's word then
          onError(error, `blob: polling ${deckId} stopped, the deck is gone`);
          stopped = true;
          state.comments?.stop();
          state.comments = undefined;
          state.watching = undefined;
          state.lastPulse = undefined;
          return;
        }
        if (isStoreBusy(error)) {
          state.failures += 1;
          wait = pollBackoffMs(state.failures, pollMs, storeRetryAfterMs(error));
          if (!state.degraded) {
            state.degraded = true;
            await local
              .publish(deckId, { type: 'store', ok: false, retryAfterMs: wait })
              .catch(() => undefined);
          }
        }
        onError(error, `blob: polling ${deckId} failed`);
      }
      if (stopped) return;
      arm(wait);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      state.wake = undefined;
      state.comments?.stop();
      state.comments = undefined;
    };
  };

  const channel: BlobChannel = {
    tier: 'blob',

    append(deckId, base, entries): Promise<AppendResult> {
      // no append lock on this tier: the instance's queue orders its writers and the store's
      // ifMatch orders the instances
      return queued(deckId, async () => {
        const store = await storeOf(deckId);
        const head = await store.revision();
        if (head !== base) return { ok: false, head, count: head - base };
        const edits = entries.filter((entry) => entry.kind === 'edit');
        const comments = entries.filter((entry) => entry.kind === 'comment');
        if (comments.length > 0 && deps.applyComments === undefined) {
          throw new TypeError(
            'The blob tier writes comments through the comments store; none is attached to this channel',
          );
        }
        let revision = head;
        let record: VersionRecord | undefined;
        if (edits.length > 0) {
          const first = edits[0] as NewEntry;
          const mutations: RoomMutation[] = [];
          for (const entry of edits)
            for (const mutation of entry.mutations ?? []) foldMutation(mutations, mutation);
          // the history label of the batch: a noted entry's (channel.ts Entry.note); the room
          // client posts a labelled write on its own, so one note names the record
          const note = edits.find((entry) => entry.note !== undefined)?.note;
          // the record names its origin (docs/SYNC.md 3.2): the batch's client and its op ids,
          // in posting order, so a resend on any instance is answered from the record and a
          // tab acknowledges its own echo by id (entryOfRecord). One POST is one client's.
          const origin: WriteOrigin = {
            clientId: first.clientId,
            opIds: edits.map((entry) => entry.opId),
          };
          const state = stateOf(deckId);
          const wait = state.lastWriteAt + spacing - now();
          if (wait > 0) await sleep(wait);
          // the store applies through applyWrite: SPEC-3 3.1's ops reach it once the reducer
          // carries them (B1, merge 1); until then a splice is `invalid` and answered as such
          let outcome: Awaited<ReturnType<DeckStore['write']>>;
          try {
            outcome = await store.write({
              baseRevision: head,
              author: first.author,
              mutations: mutations as VersionRecord['mutations'],
              ...(note === undefined ? {} : { note }),
              origin,
            });
          } catch (error) {
            state.lastWriteAt = now();
            // a race the store reports as an error (its mirror behind the store, a record taken
            // first) is a lost race: the head it answers is the contract's 409, never a 500
            // (VERIFICATION-3 finding 19)
            if (!isLostRace(error)) throw error;
            const current = await store.revision();
            return { ok: false, head: current, count: Math.max(0, current - base) };
          }
          state.lastWriteAt = now();
          if (!outcome.ok) {
            if (outcome.code === 'conflict') {
              return {
                ok: false,
                head: outcome.currentRevision,
                count: outcome.currentRevision - base,
              };
            }
            throw new TypeError(outcome.message);
          }
          // the store found a record above the base that names this batch's op ids (its write
          // path's origin check after its head and pull, docs/SYNC.md 3.2): the first attempt
          // committed and its answer was lost. Nothing was claimed or committed; the answer is
          // one synthesized entry per op id at that record's seq, and the record reaches the
          // streams here as any other instance's commit does (announce)
          const replayed = replayedRecordOf(outcome);
          if (replayed !== undefined) {
            const covering = entryOfRecord(replayed);
            await announce(deckId, replayed.revision + 1);
            state.lastSeq = Math.max(state.lastSeq, replayed.revision);
            const entries = synthesizeReplayed(
              covering,
              edits.map((entry) => entry.opId),
            );
            if (entries.length === 0) {
              throw new TypeError(
                `The store answered a replay of record ${replayed.n} that names none of this write's op ids`,
              );
            }
            return { ok: true, entries };
          }
          revision = outcome.revision;
          record = outcome.entry;
          state.lastOpAt = now();
          // a record of this instance's making: the prune at the last stream's close has work
          state.commits += 1;
        }
        if (comments.length > 0 && deps.applyComments !== undefined) {
          await deps.applyComments(deckId, comments);
        }
        const admitted: Entry[] = entries.map((entry) => ({ ...entry, seq: revision }));
        const state = stateOf(deckId);
        // what other instances committed between this instance's position and this write goes
        // to the streams here first, so no tab holds a gap under the entries below (C3S-F8)
        if (edits.length > 0) await announce(deckId, revision);
        state.lastSeq = Math.max(state.lastSeq, revision);
        for (const entry of admitted) await local.publish(deckId, { type: 'op', entry });
        if (record !== undefined) await local.publish(deckId, checkpointOf(record));
        return { ok: true, entries: admitted };
      });
    },

    async since(deckId, seq, limit): Promise<Entry[]> {
      return (await recordsAfter(deckId, seq, limit)).map(({ record }) => entryOfRecord(record));
    },

    async head(deckId): Promise<number> {
      return (await storeOf(deckId)).revision();
    },

    subscribe(deckId, onEvent: RoomListener, options?: SubscribeOptions): () => void {
      const state = stateOf(deckId);
      const stop = local.subscribe(deckId, onEvent);
      // the room's own listener holds no poll: the store is polled while a client stream of the
      // deck is open on this instance, and never otherwise (the budget)
      if (options?.passive === true) return stop;
      state.listeners += 1;
      // a stream back inside the prune's wait (the lifetime's end, a reconnect): no prune
      if (state.pruneTimer !== undefined) {
        clearTimeout(state.pruneTimer);
        state.pruneTimer = undefined;
      }
      // a stream opened during an outage learns of it at once (the `store` event went to the
      // streams of the time): its title row reads Reconnecting and the route suspends its
      // reader judgement, as for the others (the cycle 3 stream fix round; room.ts
      // createReaderLiveness)
      if (state.degraded) {
        queueMicrotask(() =>
          onEvent({
            type: 'store',
            ok: false,
            retryAfterMs: pollBackoffMs(state.failures, deps.shared?.pollMs ?? HOSTED_POLL_MS),
          }),
        );
      }
      if (state.watching === undefined) {
        // the position first, then the poll; both on the deck's queue so a poll never runs
        // beside an append of this instance
        state.watching = queued(deckId, async () => {
          const store = await storeOf(deckId);
          state.lastSeq = await store.revision();
          return deps.shared === undefined
            ? store.watch(() => {
                void queued(deckId, () => announce(deckId)).catch((error: unknown) =>
                  onError(error, `blob: announcing ${deckId} failed`),
                );
              })
            : startPulsePoll(deckId, deps.shared);
        });
        state.watching.catch((error: unknown) => onError(error, `blob: watching ${deckId} failed`));
      } else if (deps.shared !== undefined) {
        // a stream opened while the pulse poll runs: the roster is read once now and the tick
        // re-armed at the active pace, this stream being company, instead of at the running
        // poll's next tick, up to 10 s away when the tab before it was alone (startPulsePoll
        // `wake`; the features round, ship one)
        void state.watching.then(() => state.wake?.()).catch(() => undefined);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        stop();
        state.listeners -= 1;
        if (state.listeners <= 0) {
          stopWatching(state);
          pruneAtClose(deckId);
        }
      };
    },

    async publish(deckId, event): Promise<void> {
      await local.publish(deckId, event);
    },

    async trim(): Promise<void> {
      // the version log is the stream; retention is the store's (snapshots, records)
    },

    presence:
      deps.shared === undefined
        ? local.presence
        : {
            set: (deckId, clientId, state, ttlMs) => {
              // a row this instance's tab set is its own: the two paced tick reads its company
              // from the rows that are not, and from a second own row (nextTickMs)
              stateOf(deckId).ownClients.set(clientId, now());
              return deps.shared!.presence.set(deckId, clientId, state, ttlMs);
            },
            roster: (deckId) => deps.shared!.presence.roster(deckId),
            leave: (deckId, clientId, clock) => {
              stateOf(deckId).ownClients.delete(clientId);
              return deps.shared!.presence.leave(deckId, clientId, clock);
            },
            // the client bindings stay per instance: the id's own MAC decides on another one
            // (apps/studio/src/server/room.ts clientBoundTo)
            bind: local.presence.bind,
            owner: local.presence.owner,
          },
    lock: local.lock,
    heartbeat: local.heartbeat,
    unlock: local.unlock,
    budget: local.budget,
    flag: local.flag,
    setFlag: local.setFlag,

    async close(): Promise<void> {
      for (const [deckId, state] of decks) {
        decks.delete(deckId);
        if (state.pruneTimer !== undefined) clearTimeout(state.pruneTimer);
        state.pruneTimer = undefined;
        const watching = state.watching;
        state.watching = undefined;
        if (watching !== undefined) {
          try {
            (await watching)();
          } catch {
            // closing anyway
          }
        }
      }
      await deps.shared?.presence.close();
      await local.close();
    },
  };
  return channel;
}

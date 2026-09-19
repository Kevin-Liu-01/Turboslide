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
import type { SidecarIndexChange } from '@turboslide/store/comments-store';
import type { SharedPresence } from '@turboslide/store/presence-store';
import {
  HOSTED_POLL_MS,
  PULSE_SAFETY_TICKS,
  isStoreBusy,
  pollBackoffMs,
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
import { REPLAY_MAX_ENTRIES } from './protocol.ts';

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
  /** the tick; HOSTED_POLL_MS by default (the tests shorten it) */
  pollMs?: number;
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
  onError?: (error: unknown, context: string) => void;
};

export type BlobChannel = RealtimeChannel & {
  setFlag: MemoryChannel['setFlag'];
};

type DeckState = {
  chain: Promise<unknown>;
  lastWriteAt: number;
  /** the last revision delivered to this instance's listeners */
  lastSeq: number;
  /** the store poll (the pulse loop with `shared`, the store's own watch without); running while a client stream is open here */
  watching: Promise<() => void> | undefined;
  store: Promise<DeckStore> | undefined;
  /** the client streams subscribed on this instance; the poll runs while there is one */
  listeners: number;
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

/** A record as one stream entry: the writer's author, its mutations, the revision as the seq. */
export function entryOfRecord(record: VersionRecord): Entry {
  return {
    seq: record.revision,
    rev: record.baseRevision,
    kind: 'edit',
    author: record.author,
    clientId: 'store',
    opId: `store:${record.n}`,
    mutations: record.mutations,
    at: record.createdAt,
  };
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
        lastSeq: -1,
        watching: undefined,
        store: undefined,
        listeners: 0,
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

  /** The records after a revision, oldest first, write entries only (a named version moves nothing). */
  const recordsAfter = async (
    deckId: string,
    seq: number,
    limit: number,
  ): Promise<VersionRecord[]> => {
    const store = await storeOf(deckId);
    const records = await store.records();
    const out: VersionRecord[] = [];
    for (const record of records) {
      if (record.revision <= seq || record.mutations.length === 0) continue;
      out.push(record);
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
    for (const record of records) {
      if (record.revision >= below) break;
      state.lastSeq = record.revision;
      if (!isReplayableRecord(record)) {
        // a restore: the tabs reload at its revision (isReplayableRecord says why)
        await local.publish(deckId, checkpointOf(record, true));
        continue;
      }
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
   */
  const startPulsePoll = (deckId: string, shared: BlobSharedDeps): (() => void) => {
    const state = stateOf(deckId);
    const pollMs = shared.pollMs ?? HOSTED_POLL_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      timer = setTimeout(() => void tick(), wait);
      timer.unref?.();
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
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
          revision = outcome.revision;
          record = outcome.entry;
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
      return (await recordsAfter(deckId, seq, limit)).map(entryOfRecord);
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
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        stop();
        state.listeners -= 1;
        if (state.listeners <= 0) stopWatching(state);
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
            set: (deckId, clientId, state, ttlMs) =>
              deps.shared!.presence.set(deckId, clientId, state, ttlMs),
            roster: (deckId) => deps.shared!.presence.roster(deckId),
            leave: (deckId, clientId, clock) =>
              deps.shared!.presence.leave(deckId, clientId, clock),
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

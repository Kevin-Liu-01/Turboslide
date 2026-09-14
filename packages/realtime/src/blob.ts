// The blob channel (gslides-parity SPEC-3 2.5, 3.7 e; report 02 7.7): the reduced tier for a
// deployment without Redis and the automatic fallback while Redis is unreachable. There is no
// stream: every append is one commit through the deck's store (`BlobStore.write` hosted, a
// `FileStore` on a checkout), so the seq of an entry is the revision its record made, `since`
// reads the version log, `head` is the revision, and `subscribe` follows the store's watch
// channel (the Blob mirror's one second head poll, `fs.watch` on a checkout). Presence, locks,
// budgets and flags are per instance, from memory.ts; the title row says so (select.ts
// BLOB_TIER_NOTICE). One write per second per deck per instance keeps the deployment under the
// Blob operation cap. Comment entries go straight to the sidecar through `applyComments`, which
// the comments store supplies (SPEC-3 5.2); without it a comment entry is refused. No `node:`.
import { ConflictError } from '@turboslide/schema/errors';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import type {
  AppendResult,
  Entry,
  NewEntry,
  RealtimeChannel,
  RoomEvent,
  RoomListener,
  RoomMutation,
} from './channel.ts';
import { foldMutation } from './coalesce.ts';
import type { FlagName } from './keys.ts';
import { checkDeckId } from './keys.ts';
import { memoryChannel } from './memory.ts';
import type { MemoryChannel } from './memory.ts';
import { REPLAY_MAX_ENTRIES } from './protocol.ts';

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
  watching: Promise<() => void> | undefined;
  store: Promise<DeckStore> | undefined;
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

function checkpointOf(record: VersionRecord): RoomEvent {
  return {
    type: 'checkpoint',
    revision: record.revision,
    fromSeq: record.revision,
    toSeq: record.revision,
    ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
    author: record.author,
    note: record.note,
  };
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

  /** Delivers the records this instance has not announced yet: an `op` and a `checkpoint` each. */
  const announce = async (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    if (state.lastSeq < 0) return;
    const records = await recordsAfter(deckId, state.lastSeq, REPLAY_MAX_ENTRIES);
    for (const record of records) {
      state.lastSeq = record.revision;
      await local.publish(deckId, { type: 'op', entry: entryOfRecord(record) });
      await local.publish(deckId, checkpointOf(record));
    }
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

    subscribe(deckId, onEvent: RoomListener): () => void {
      const state = stateOf(deckId);
      const stop = local.subscribe(deckId, onEvent);
      if (state.watching === undefined) {
        // the position first, then the watch; both on the deck's queue so a poll never runs
        // beside an append of this instance
        state.watching = queued(deckId, async () => {
          const store = await storeOf(deckId);
          state.lastSeq = await store.revision();
          return store.watch(() => {
            void queued(deckId, () => announce(deckId)).catch((error: unknown) =>
              onError(error, `blob: announcing ${deckId} failed`),
            );
          });
        });
        state.watching.catch((error: unknown) => onError(error, `blob: watching ${deckId} failed`));
      }
      return stop;
    },

    async publish(deckId, event): Promise<void> {
      await local.publish(deckId, event);
    },

    async trim(): Promise<void> {
      // the version log is the stream; retention is the store's (snapshots, records)
    },

    presence: local.presence,
    lock: local.lock,
    heartbeat: local.heartbeat,
    unlock: local.unlock,
    budget: local.budget,
    flag: local.flag,
    setFlag: local.setFlag,

    async close(): Promise<void> {
      for (const [deckId, state] of decks) {
        decks.delete(deckId);
        if (state.watching !== undefined) {
          try {
            (await state.watching)();
          } catch {
            // closing anyway
          }
        }
      }
      await local.close();
    },
  };
  return channel;
}

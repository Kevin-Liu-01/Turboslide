import type { Entry, RealtimeChannel, RoomEvent } from '@turboslide/realtime/channel';
import { coalesceEntries } from '@turboslide/realtime/coalesce';
import type { CoalescedWrite } from '@turboslide/realtime/coalesce';
import { deckKeys } from '@turboslide/realtime/keys';
import { REPLAY_MAX_ENTRIES } from '@turboslide/realtime/protocol';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Author } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

/**
 * The checkpointer (gslides-parity SPEC-3 0.3, 0.8, 0.51, 3.7 d; report 02 7.1): coalesces the
 * stream's entries since the last checkpoint into version records through the store, one Write
 * per author per contiguous run (coalesce.ts), after 2 s without operations, every 10 s under
 * continuous typing, when 1 MB or 2,000 entries are retained, and at once for an agent write, a
 * `version.restore` and `version.save`. It runs on the instance that admitted the latest
 * operation under `deck:<id>:ckpt` (`SET NX PX 5000`, a heartbeat every second, a waiter breaks
 * a lock whose heartbeat is older than 3 s), announces one `checkpoint` event per run, hands the
 * comment entries to the comments store (SPEC-3 5.2), and trims the stream. Pure over its
 * dependencies, so checkpoint.test.ts drives it with the memory channel, a file store in a
 * temp folder and fake timers.
 */

/** The idle trigger. */
export const CHECKPOINT_IDLE_MS = 2000;
/** The trigger under continuous activity. */
export const CHECKPOINT_MAX_MS = 10_000;
/** The retained entry trigger (SPEC-3 0.3, 0.53). */
export const CHECKPOINT_MAX_ENTRIES = 2000;
/** The retained byte trigger. */
export const CHECKPOINT_MAX_BYTES = 1024 * 1024;
/** The lock's TTL, heartbeat and break (SPEC-3 0.8). */
export const CHECKPOINT_LOCK_MS = 5000;
export const CHECKPOINT_HEARTBEAT_MS = 1000;
export const CHECKPOINT_STALE_MS = 3000;
/** The stream retention after a checkpoint (SPEC-3 3.9): the larger of 10,000 entries or 24 hours, trimmed here by count. */
export const STREAM_RETAIN_ENTRIES = 10_000;

/**
 * What writes comment entries to the sidecar (the comments store, SPEC-3 5.2). The applier reads
 * `comment` alone, so the blob channel hands it entries before they carry a seq (`NewEntry`).
 */
export type CommentsApplier = {
  apply: (
    entries: ReadonlyArray<Pick<Entry, 'comment'>>,
  ) => Promise<{ revision: number; threadIds: string[] }>;
};

export type Timers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (run: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

const REAL_TIMERS: Timers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export type CheckpointerDeps = {
  deckId: string;
  channel: RealtimeChannel;
  store: DeckStore;
  /** a committed record; the room marks the revision as its own */
  onCommitted?: (record: VersionRecord) => void;
  comments?: CommentsApplier;
  now?: () => number;
  timers?: Timers;
  log?: (line: string) => void;
  /** the lock token source, random by default */
  token?: () => string;
};

export type CheckpointResult =
  | { ok: true; committed: VersionRecord[]; fromSeq: number; toSeq: number; skipped: string[] }
  | { ok: false; reason: 'locked' | 'nothing' | 'failed'; message?: string };

export type CheckpointerState = {
  retainedEntries: number;
  retainedBytes: number;
  /** the last seq a checkpoint (this instance's or another's) covered */
  covered: number;
  running: boolean;
};

export type Checkpointer = {
  /** arms the idle timer (2 s) and the hard timer (10 s) after an admitted operation */
  schedule: () => void;
  /** counts admitted entries toward the size triggers and runs at once past them */
  noteAppended: (entries: readonly Entry[], bytes: number) => void;
  /** comment entries ride the same run (the sidecar write) */
  noteComments: (entries: readonly Entry[]) => void;
  /** the comment entries admitted since the last run, for the live threads a read folds in */
  pendingComments: () => Entry[];
  /** another writer covered the stream up to this seq (the follower, another instance's checkpoint) */
  covered: (seq: number) => void;
  run: (options?: { force?: boolean }) => Promise<CheckpointResult>;
  state: () => CheckpointerState;
  stop: () => Promise<void>;
};

/** The last seq the store's records cover: the `ops.toSeq` of the newest record carrying one. */
export function coveredSeq(records: readonly VersionRecord[]): number {
  let covered = 0;
  for (const record of records) {
    if (record.ops !== undefined) covered = Math.max(covered, record.ops.toSeq);
  }
  return covered;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The store entries the follower appended are committed already; they are covered, never re-committed. */
export function isStoreEntry(entry: Entry): boolean {
  return entry.clientId === 'store';
}

/**
 * Applies stream entries in order to a document. A store entry (the follower's copy of a record
 * written outside the room) whose `rev` is below the document's revision is in the document
 * already (the record it mirrors is committed), so it is skipped; a cold instance that loads the
 * store and replays the stream therefore never applies a CLI write twice. The manifest's revision
 * is the checkpointer's to move (`checkpoint` events), never an entry's.
 */
export function applyStreamEntries(
  document: DeckDocument,
  entries: readonly Entry[],
): DeckDocument {
  let next = document;
  for (const entry of entries) {
    if (entry.kind !== 'edit' || entry.mutations === undefined) continue;
    if (isStoreEntry(entry) && entry.rev < next.deck.revision) continue;
    next = applyMutations(next, entry.mutations, { now: entry.at }).document;
  }
  return next;
}

export function createCheckpointer(deps: CheckpointerDeps): Checkpointer {
  const { deckId, channel, store } = deps;
  const timers = deps.timers ?? REAL_TIMERS;
  const log = deps.log ?? (() => {});
  const token = deps.token ?? randomToken;
  const keys = deckKeys(deckId);
  let idleTimer: unknown;
  let hardTimer: unknown;
  let retainedEntries = 0;
  let retainedBytes = 0;
  let covered = -1;
  let running: Promise<CheckpointResult> | null = null;
  let stopped = false;
  let pendingComments: Entry[] = [];

  const clearTimers = (): void => {
    if (idleTimer !== undefined) timers.clearTimeout(idleTimer);
    if (hardTimer !== undefined) timers.clearTimeout(hardTimer);
    idleTimer = undefined;
    hardTimer = undefined;
  };

  const fire = (): void => {
    clearTimers();
    void run().catch((error: unknown) => {
      log(
        `${deckId}: checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  const schedule = (): void => {
    if (stopped) return;
    if (idleTimer !== undefined) timers.clearTimeout(idleTimer);
    idleTimer = timers.setTimeout(fire, CHECKPOINT_IDLE_MS);
    if (hardTimer === undefined) hardTimer = timers.setTimeout(fire, CHECKPOINT_MAX_MS);
  };

  const knownCovered = async (): Promise<number> => {
    if (covered >= 0) return covered;
    covered = coveredSeq(await store.records());
    return covered;
  };

  /** One Write through the store, rebased once when another writer moved the revision in between. */
  const commit = async (
    write: CoalescedWrite,
  ): Promise<{ ok: true; record: VersionRecord } | { ok: false; message: string }> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const baseRevision = await store.revision();
      const outcome = await store.write(
        { baseRevision, author: write.author, mutations: write.mutations },
        { ops: { fromSeq: write.fromSeq, toSeq: write.toSeq }, force: true },
      );
      if (outcome.ok) return { ok: true, record: outcome.entry };
      if (outcome.code === 'conflict') continue;
      return { ok: false, message: outcome.message };
    }
    return { ok: false, message: 'the store kept moving under the checkpoint' };
  };

  const runOnce = async (force: boolean): Promise<CheckpointResult> => {
    const mine = token();
    const taken = await channel.lock(keys.ckpt, mine, CHECKPOINT_LOCK_MS, {
      staleMs: CHECKPOINT_STALE_MS,
    });
    if (!taken) {
      // another instance holds the lock: it will cover these entries; try again after its life
      if (!force) schedule();
      return { ok: false, reason: 'locked' };
    }
    const beat = timers.setInterval(() => {
      void channel.heartbeat(keys.ckpt, mine).catch(() => undefined);
    }, CHECKPOINT_HEARTBEAT_MS);
    try {
      const from = await knownCovered();
      const head = await channel.head(deckId);
      if (head <= from) {
        retainedEntries = 0;
        retainedBytes = 0;
        return { ok: false, reason: 'nothing' };
      }
      const entries: Entry[] = [];
      let at = from;
      while (at < head) {
        const page = await channel.since(deckId, at, Math.min(REPLAY_MAX_ENTRIES, head - at));
        if (page.length === 0) break;
        entries.push(...page);
        at = page[page.length - 1]?.seq ?? head;
      }
      if (entries.length === 0) {
        covered = head;
        return { ok: false, reason: 'nothing' };
      }
      const edits = entries.filter((entry) => entry.kind === 'edit' && !isStoreEntry(entry));
      const comments = entries.filter((entry) => entry.kind === 'comment');
      const committed: VersionRecord[] = [];
      const skipped: string[] = [];
      for (const write of coalesceEntries(edits)) {
        const result = await commit(write);
        if (result.ok) {
          committed.push(result.record);
          deps.onCommitted?.(result.record);
        } else {
          skipped.push(...write.opIds);
          log(
            `${deckId}: a coalesced write of ${write.opIds.length} ops did not commit: ${result.message}`,
          );
        }
      }
      let commentsResult: { revision: number; threadIds: string[] } | undefined;
      if (comments.length > 0 && deps.comments !== undefined) {
        try {
          commentsResult = await deps.comments.apply(comments);
        } catch (error) {
          log(
            `${deckId}: comments did not land: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      pendingComments = [];
      const first = entries[0]?.seq ?? from + 1;
      const last = entries[entries.length - 1]?.seq ?? head;
      covered = last;
      retainedEntries = 0;
      retainedBytes = 0;
      const revision = await store.revision();
      const lastRecord = committed[committed.length - 1];
      const author: Author = lastRecord?.author ??
        edits[edits.length - 1]?.author ?? {
          kind: 'agent',
          name: 'room',
        };
      if (committed.length > 0 || commentsResult !== undefined) {
        const event: RoomEvent = {
          type: 'checkpoint',
          revision,
          fromSeq: first,
          toSeq: last,
          ...(lastRecord?.snapshot === undefined ? {} : { snapshot: lastRecord.snapshot }),
          author,
          note: lastRecord?.note ?? '',
          ...(commentsResult === undefined ? {} : { comments: commentsResult }),
        };
        await channel.publish(deckId, event);
      }
      await channel.trim(deckId, {
        minSeq: Math.max(1, last - STREAM_RETAIN_ENTRIES + 1),
        maxEntries: STREAM_RETAIN_ENTRIES,
      });
      return { ok: true, committed, fromSeq: first, toSeq: last, skipped };
    } finally {
      timers.clearInterval(beat);
      await channel.unlock(keys.ckpt, mine);
    }
  };

  const run = (options: { force?: boolean } = {}): Promise<CheckpointResult> => {
    if (running !== null) {
      // a run in flight covers up to the head it read; anything after it needs one more
      return running.then(() => runOnce(options.force ?? false));
    }
    clearTimers();
    running = runOnce(options.force ?? false).finally(() => {
      running = null;
    });
    return running;
  };

  return {
    schedule,
    noteAppended(entries, bytes) {
      retainedEntries += entries.length;
      retainedBytes += bytes;
      if (retainedEntries >= CHECKPOINT_MAX_ENTRIES || retainedBytes >= CHECKPOINT_MAX_BYTES)
        fire();
    },
    noteComments(entries) {
      pendingComments.push(...entries);
    },
    pendingComments: () => [...pendingComments],
    covered(seq) {
      if (seq > covered) covered = seq;
    },
    run,
    state: () => ({ retainedEntries, retainedBytes, covered, running: running !== null }),
    async stop() {
      stopped = true;
      clearTimers();
      if (running !== null) await running.catch(() => undefined);
    },
  };
}

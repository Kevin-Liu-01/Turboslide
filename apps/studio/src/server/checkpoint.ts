import type { Entry, RealtimeChannel, RoomEvent } from '@turboslide/realtime/channel';
import { coalesceEntries, originKey, originKeysOf } from '@turboslide/realtime/coalesce';
import { CHECKPOINT_PROTOCOL_HEADER, CHECKPOINT_SCHEMA_HEADER } from '@turboslide/realtime/frames';
import type { CoalescedWrite } from '@turboslide/realtime/coalesce';
import { deckKeys } from '@turboslide/realtime/keys';
import { REPLAY_MAX_ENTRIES } from '@turboslide/realtime/protocol';
import type { DeckDocument } from '@turboslide/schema/deck';
import { DeckGoneError } from '@turboslide/schema/errors';
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
  apply: (entries: ReadonlyArray<Pick<Entry, 'comment'>>) => Promise<{
    revision: number;
    threadIds: string[];
    /** the ops the sidecar's reducer refused (the very objects the entries carry), with its sentence */
    refused?: ReadonlyArray<{ op: unknown; message: string }>;
  }>;
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

export type CommitWriteResult =
  | { ok: true; record: VersionRecord }
  | { ok: false; conflict: boolean; message: string; revision?: number };

/**
 * One coalesced Write through the store at the store's current revision, with `ops` and `force`
 * (the lease skip, never a bypass of the manifest condition) and, when asked, the write's origin
 * (`{ clientId, opIds }`, docs/archive/rounds/SYNC.md 3.2), so the resync read's `origins` answer the tab on the
 * do tier (docs/CLOUDFLARE.md 3.5, T1 finding 9). A conflict is answered as one, not retried: the
 * caller decides (the checkpointer re-bases, the checkpoint route tells the object).
 */
export async function commitWrite(
  store: DeckStore,
  write: CoalescedWrite,
  options: { origin: boolean },
): Promise<CommitWriteResult> {
  const baseRevision = await store.revision();
  // a noted run is one record under its history label (coalesce.ts; channel.ts Entry.note)
  const outcome = await store.write(
    {
      baseRevision,
      author: write.author,
      mutations: write.mutations,
      ...(write.note === undefined ? {} : { note: write.note }),
      ...(options.origin ? { origin: { clientId: write.clientId, opIds: [...write.opIds] } } : {}),
    },
    { ops: { fromSeq: write.fromSeq, toSeq: write.toSeq }, force: true },
  );
  if (outcome.ok) return { ok: true, record: outcome.entry };
  if (outcome.code === 'conflict')
    return {
      ok: false,
      conflict: true,
      message: outcome.message,
      revision: outcome.currentRevision,
    };
  return { ok: false, conflict: false, message: outcome.message };
}

export type CommitRunsResult =
  | {
      ok: true;
      committed: VersionRecord[];
      skipped: string[];
      /** the last seq of the runs this call handled, when its budget ended it before the rest */
      through?: number;
    }
  | { ok: false; conflict: true; revision: number; committed: VersionRecord[] }
  | { ok: false; aborted: true; committed: VersionRecord[] };

export type CheckpointPlan =
  | { kind: 'conflict'; revision: number }
  | { kind: 'commit'; answered: VersionRecord[]; fresh: Entry[] };

/**
 * What a checkpoint post asks of the store (RELIABILITY-1, hardening HR-RT#1 fix 1). The object
 * names the revision it last read. A store still at that revision commits every entry. A store
 * that moved is read once: when every record above that revision names only entries of this
 * post in its origin, those records are this post's own first attempt, whose answer the object
 * never read (its 25 s deadline, a function killed mid run, an answer dropped on the way). The
 * entries they name are answered from the log and never committed a second time, and the rest
 * are committed after them, in order. Before this the retry met 409, `readmit` read its own
 * records as foreign, and every word of the checkpoint was in the store twice. A record above
 * the object's revision that names anything else, or names nothing, is a write from outside the
 * object: answered 409, so the object re-admits its tail past it (3.5). Entries are matched by
 * client and op id, one entry at a time, so a retry whose run grew since the first attempt
 * commits only the entries the first attempt did not.
 */
export async function planCheckpoint(
  store: DeckStore,
  body: { revision?: number | undefined; entries: readonly Entry[] },
): Promise<CheckpointPlan> {
  const entries = [...body.entries];
  if (body.revision === undefined) return { kind: 'commit', answered: [], fresh: entries };
  const current = await store.revision();
  if (current === body.revision) return { kind: 'commit', answered: [], fresh: entries };
  const since = body.revision;
  const above = current > since ? (await store.records()).filter((r) => r.revision > since) : [];
  if (above.length === 0) return { kind: 'conflict', revision: current };
  const posted = new Set(
    entries
      .filter((entry) => entry.kind === 'edit')
      .map((entry) => originKey(entry.clientId, entry.opId)),
  );
  const named = new Set<string>();
  for (const record of above) {
    const keys = originKeysOf(record);
    if (keys.length === 0 || !keys.every((key) => posted.has(key)))
      return { kind: 'conflict', revision: current };
    for (const key of keys) named.add(key);
  }
  return {
    kind: 'commit',
    answered: above,
    fresh: entries.filter(
      (entry) => entry.kind !== 'edit' || !named.has(originKey(entry.clientId, entry.opId)),
    ),
  };
}

/**
 * The body of a checkpoint run as the checkpoint route commits it (docs/CLOUDFLARE.md 3.6.1): one
 * Write per coalesced run of the edit entries, each with its origin, in order; a Write the store
 * refuses for its content is skipped and its op ids named (the run goes on, as the checkpointer
 * does); a conflict stops the run and is answered to the caller with the store's revision, so
 * the object takes the re-admission path of 3.5 for what remains. A run starts only while
 * `signal` stands (RELIABILITY-1 fix 3): once the object's call is gone (its deadline passed, its
 * connection closed) nothing reads the answer, and its retry is answered from the log by
 * `planCheckpoint`, so the route stops between runs instead of committing on for nobody. With a
 * `budgetMs` a run starts only while the call is younger than it (RELIABILITY-1 fix 5, hardening
 * HR-RT#4): two people typing at once for ten seconds make one run per switch of author, each a
 * four round commit of about 650 ms on production, and 40 of them passed the object's 25 s
 * deadline, which is how a lost answer began. The first run always starts; `through` names the
 * last seq handled when the budget ended the call, and the object posts from there next.
 */
export async function commitRuns(
  store: DeckStore,
  edits: readonly Entry[],
  log: (line: string) => void = () => {},
  options: { signal?: AbortSignal; budgetMs?: number; now?: () => number } = {},
): Promise<CommitRunsResult> {
  const committed: VersionRecord[] = [];
  const skipped: string[] = [];
  const now = options.now ?? (() => Date.now());
  const started = now();
  let handled = 0;
  let through: number | undefined;
  for (const write of coalesceEntries(edits)) {
    if (options.signal?.aborted === true) {
      log(`the call was gone after ${committed.length} runs; the rest waits for the retry`);
      return { ok: false, aborted: true, committed };
    }
    if (options.budgetMs !== undefined && handled > 0 && now() - started >= options.budgetMs) {
      log(`the call's ${options.budgetMs} ms ended after ${handled} runs, through seq ${through}`);
      return { ok: true, committed, skipped, ...(through === undefined ? {} : { through }) };
    }
    handled += 1;
    const result = await commitWrite(store, write, { origin: true });
    through = write.toSeq;
    if (result.ok) {
      committed.push(result.record);
      continue;
    }
    if (result.conflict) {
      return {
        ok: false,
        conflict: true,
        revision: result.revision ?? (await store.revision()),
        committed,
      };
    }
    skipped.push(...write.opIds);
    log(`a coalesced write of ${write.opIds.length} ops did not commit: ${result.message}`);
  }
  return { ok: true, committed, skipped };
}

/** What the checkpoint route hands `answerCheckpoint` from its deck's room. */
export type CheckpointRouteDeps = {
  store: DeckStore;
  /** the sidecar's applier of the post's comment entries */
  comments: CommentsApplier;
  /** the `comment.shift` entries the landed edits produce (comments.ts `shiftEntriesFor`) */
  shifts: (
    edits: readonly Entry[],
    before: DeckDocument,
    after: DeckDocument,
  ) => Promise<unknown[]>;
  log: (line: string) => void;
  /** the object's call: gone once its deadline passed or its connection closed */
  signal?: AbortSignal;
  /** how long the call starts runs for, when the object continues from a partial answer (HR-RT#4) */
  budgetMs?: number;
  /**
   * the object returns refused runs to their authors (HR-RT#9; it names its protocol): a refused
   * run is answered 409 `refused`; an older object reads 200 with `skipped`, as before
   */
  refusesSkipped?: boolean;
  now?: () => number;
};

/** The route's answer before it adds the tier: a status, a JSON body, and how many records this call wrote. */
export type CheckpointReply = { status: number; body: Record<string, unknown>; landed: number };

/**
 * The checkpoint route's work over the deck's store (docs/CLOUDFLARE.md 3.5, 3.6.1), apart from
 * the request so a test drives it over a Blob store: the plan (`planCheckpoint`: a store that
 * moved under the object is answered 409 unless the records above the object's revision are this
 * post's own first attempt, which answer their entries), one Write per coalesced run of the
 * fresh edits (`commitRuns`), the comment entries to the sidecar, the comment anchors shifted
 * past the edits this call landed. `committed` lists the records that answered entries from the
 * log first, then the ones this call wrote, so the object reads one answer either way.
 */
export async function answerCheckpoint(
  deps: CheckpointRouteDeps,
  body: { revision?: number | undefined; entries: readonly Entry[] },
): Promise<CheckpointReply> {
  const { store, log } = deps;
  const plan = await planCheckpoint(store, body);
  if (plan.kind === 'conflict') {
    // a write landed outside the object (a blob instance during the alias switch, a restore):
    // the object reloads at this revision and re-admits its tail transformed (3.5)
    return { status: 409, body: { conflict: true, revision: plan.revision }, landed: 0 };
  }
  const edits = plan.fresh.filter((entry) => entry.kind === 'edit' && !isStoreEntry(entry));
  const comments = plan.fresh.filter((entry) => entry.kind === 'comment');
  const before = edits.length > 0 ? (await store.read()).document : null;
  const result = await commitRuns(store, edits, log, {
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    ...(deps.budgetMs === undefined ? {} : { budgetMs: deps.budgetMs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  if (!result.ok && 'aborted' in result) {
    // nobody reads this answer; the retry is answered from the log
    return {
      status: 503,
      body: { error: 'aborted', committed: result.committed.length },
      landed: result.committed.length,
    };
  }
  if (!result.ok) {
    return {
      status: 409,
      body: { conflict: true, revision: result.revision, committed: result.committed },
      landed: result.committed.length,
    };
  }
  // a call its budget ended takes the comments up to the last seq it handled; the rest ride the next
  const through = result.through;
  const landedComments =
    through === undefined ? comments : comments.filter((entry) => entry.seq <= through);
  let commentsResult: { revision: number; threadIds: string[] } | undefined;
  const refusedComments: string[] = [];
  if (landedComments.length > 0) {
    // the sidecar takes the comments or the call fails (RELIABILITY-9, hardening HR-RT#8): a
    // write the store did not take (a 429, a 5xx, a deadline) is a 503, so the object keeps the
    // entries and tries again, and the edits above are answered from the log on that retry.
    // Before this the route logged it, answered 200 and the object marked the comments committed
    try {
      const applied = await deps.comments.apply(landedComments);
      commentsResult = { revision: applied.revision, threadIds: applied.threadIds };
      for (const refused of applied.refused ?? []) {
        const entry = landedComments.find((row) => row.comment === refused.op);
        if (entry === undefined) continue;
        refusedComments.push(entry.opId);
        log(`a comment ${entry.opId} was refused by the sidecar: ${refused.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`comments did not land: ${message}`);
      return {
        status: 503,
        body: { error: 'comments', message: `The comments did not land: ${message}` },
        landed: result.committed.length,
      };
    }
  }
  if (result.committed.length > 0 && before !== null) {
    // the comment anchors follow their text (SPEC-3 0.52; room.ts appendShifts' sidecar half):
    // the shifts are applied to the sidecar here, since no stream entry rides the object for them
    try {
      const after = (await store.read()).document;
      const shifts = await deps.shifts(edits, before, after);
      if (shifts.length > 0) {
        const shifted = await deps.comments.apply(shifts as Pick<Entry, 'comment'>[]);
        commentsResult = {
          revision: shifted.revision,
          threadIds: [...new Set([...(commentsResult?.threadIds ?? []), ...shifted.threadIds])],
        };
      }
    } catch (error) {
      log(`comment.shift did not land: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // a run the store refused for its content is answered 409 with its op ids (RELIABILITY-11,
  // hardening HR-RT#9): the object returns them to their authors and reloads the tabs, where
  // before it read the 200, covered them, and the tabs kept text the store never held
  const refused = deps.refusesSkipped === true && result.skipped.length > 0;
  return {
    status: refused ? 409 : 200,
    body: {
      ...(refused ? { refused: true } : {}),
      committed: [...plan.answered, ...result.committed],
      skipped: result.skipped,
      revision: await store.revision(),
      ...(commentsResult === undefined ? {} : { comments: commentsResult }),
      // the comments the sidecar's reducer refused: the object keeps them as dead letters (HR-RT#8)
      ...(refusedComments.length === 0 ? {} : { refusedComments }),
      // the object covers up to here and posts the rest on its next call (HR-RT#4)
      ...(through === undefined ? {} : { toSeq: through }),
    },
    landed: result.committed.length,
  };
}

/**
 * The checkpoint route's answer to an error its work threw (RELIABILITY-10, hardening HR-RT#7):
 * 404 `{ gone: true }` for a deck the store does not hold (`DeckGoneError`, or any error once
 * `deckExists` says the deck is gone), the one answer the object may read as final; 500 for every
 * other error, which the object retries on its backoff. Before this every RangeError answered
 * 404 gone, and the reducer, the pointer code and the slug code all throw RangeError.
 */
export async function checkpointErrorReply(
  error: unknown,
  deckId: string,
  deckExists: () => Promise<boolean>,
): Promise<CheckpointReply> {
  let gone = error instanceof DeckGoneError;
  if (!gone) gone = !(await deckExists().catch(() => true));
  if (gone)
    return {
      status: 404,
      body: { error: 'not_found', gone: true, message: `No deck ${deckId} in the store` },
      landed: 0,
    };
  return {
    status: 500,
    body: { error: 'checkpoint', message: error instanceof Error ? error.message : String(error) },
    landed: 0,
  };
}

/**
 * Whether the object posts from a newer build than this app (HR-RT#9): its room protocol or its
 * document schema version (the checkpoint's headers) above this build's. Such a post is answered
 * 503 `upgrade_pending`, and the object keeps its tail until the app it reaches is as new; null
 * when this build reads the post. A post without the headers is an object older than the round.
 */
export function upgradePending(
  headers: Headers,
  ours: { protocol: number; schemaVersion: number },
): CheckpointReply | null {
  const read = (name: string): number | null => {
    const raw = headers.get(name);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(value) ? value : null;
  };
  const protocol = read(CHECKPOINT_PROTOCOL_HEADER);
  const schemaVersion = read(CHECKPOINT_SCHEMA_HEADER);
  if ((protocol ?? 0) <= ours.protocol && (schemaVersion ?? 0) <= ours.schemaVersion) return null;
  return {
    status: 503,
    body: {
      error: 'upgrade_pending',
      message: `The room posts protocol ${protocol ?? '?'} and schema ${schemaVersion ?? '?'}; this app reads ${ours.protocol} and ${ours.schemaVersion}`,
    },
    landed: 0,
  };
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

  /**
   * The last seq the store's records cover, read under the lock on every run (the realtime
   * round, R1's two process run of docs/REALTIME.md 5.4 item 1). Two instances each hold a
   * checkpointer of one deck; before this the value was read from the records once and then
   * moved by this instance's own runs alone, so the instance that took the lock second started
   * from where its own last run ended and committed the other instance's run again (the same
   * mutations applied twice in the store, a doubled word). The records are the truth: a mirror
   * syncs first when the store has one (the redis tier over the Blob store), then the newest
   * `ops.toSeq` is taken, never below what this instance already knows (`covered()` moves it on
   * another instance's checkpoint event too). One records read per run, under the lock: the
   * newest records down to one with `ops` where the store reads them so (`newestRecords`, a Blob
   * mirror from its log floor; wave 2 PS.md request 1), else the whole log.
   */
  const knownCovered = async (): Promise<number> => {
    const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
    if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
    const records =
      store.newestRecords === undefined ? await store.records() : await store.newestRecords();
    covered = Math.max(covered, coveredSeq(records));
    return covered;
  };

  /** One Write through the store, rebased once when another writer moved the revision in between. */
  const commit = async (
    write: CoalescedWrite,
  ): Promise<{ ok: true; record: VersionRecord } | { ok: false; message: string }> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await commitWrite(store, write, { origin: false });
      if (outcome.ok) return outcome;
      if (outcome.conflict) continue;
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

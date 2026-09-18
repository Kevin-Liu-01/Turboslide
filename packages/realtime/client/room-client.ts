// The room client (gslides-parity SPEC-3 3.6, 0.7; report 02 7.4): what the editor's controller
// holds instead of the write queue and the long poll. Three sets: pending (applied locally, not
// yet in the stream), retained (acked at a seq, not yet covered by a checkpoint) and the local
// document, which is the server document at `seq` with the pending operations folded on top. A
// local gesture applies through the reducer at once and flushes at once for structural ops, at
// 50 ms during a drag and at 100 ms while typing; an incoming operation transforms the pending
// text ops against it (the schema's transform), applies, and the local document is re-derived; the
// author's own admitted op drops its pending copy. Undo is per author: the controller asks
// `transformSince` to move an inverse past the operations that landed after it was recorded.
// Offline, the pending and retained ops persist to the pending store; a reconnect replays from the
// last seq; `resync` reloads at a revision and rebases. Framework free, browser safe (no `node:`);
// the transport is injected so the tests run it against fake-transport.ts.
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { NotImplementedError } from '@turboslide/schema/errors';
import type { Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { isTextOp, sameText, transformMutation } from '@turboslide/schema/transform';

import type {
  CommentOp,
  Entry,
  RealtimeTier,
  RejectReason,
  Role,
  RoomEvent,
  RoomMutation,
  RosterEntry,
} from '../src/channel.ts';
import { foldMutation } from '../src/coalesce.ts';
import {
  CLIENT_ID_PATTERN,
  OPS_POST_MAX_BYTES,
  OPS_POST_MAX_ENTRIES,
  PRESENCE_BATCH_MS,
  PRESENCE_HEARTBEAT_MS,
} from '../src/protocol.ts';
import type { OpsPost, PresencePost } from '../src/protocol.ts';
import type { PendingStore, PersistedOp, PersistedQueue } from './pending-store.ts';
import { pendingKey, unsavedCount } from './pending-store.ts';

// ---------------------------------------------------------------------------------------------
// The transport

export type Rejected = { opId: string; reason: RejectReason; message?: string };

export type OpsResponse =
  | {
      ok: true;
      entries: Entry[];
      rejected: Rejected[];
      head: number;
      revision: number;
      /**
       * The entries between the POST's `base.seq` and its first admitted entry, oldest first
       * (the focus round, cycle 3 stream fix round two; VERIFICATION C3S-F8): the client takes
       * them before the admitted ones, so an answer whose entries sit above the position settles
       * from the answer alone instead of waiting for the stream to fill the gap (or the gap
       * watch's GAP_REOPEN_MS). Absent from an older server, when the stream and the gap watch
       * stay the way.
       */
      between?: Entry[];
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      head?: number;
      retryAfterMs?: number;
    };

export type StreamHandle = { close: () => void };

export type OpenOptions = {
  since: number;
  /**
   * The client ids this tab held before (an earlier page of the same tab, hotfix 2 cause B1):
   * the stream route removes their roster rows before it writes `hello`, so a reload never
   * lists the tab's own earlier id as a collaborator. Sent on every open, so a reconnect that
   * lands on another instance retires them there too.
   */
  retire?: readonly string[];
  onEvent: (event: RoomEvent) => void;
  /**
   * The stream ended or its open was refused. The transport reports it once per `open` and
   * reconnects nothing itself: the client owns the reopen (the focus round, cycle 3 stream fix
   * round, VERIFICATION.md C3-F1; before this the browser's EventSource reconnected on its own
   * and nobody read the 503 or its `retry-after`). The argument is a `StreamFailure` when the
   * transport knows the status and the wait, any error otherwise (`streamFailureOf` reads both).
   */
  onError: (error: unknown) => void;
};

/**
 * How a stream ended, as the transport reports it: a refused open carries the HTTP status, the
 * body's `error` code and the `retry-after` the server sent; a stream that closed after a hello
 * carries the server's `retry:` field when it sent one and no status.
 */
export type StreamFailure = {
  status?: number;
  code?: string;
  /** the wait the server named before the next open, in milliseconds */
  retryAfterMs?: number;
  /**
   * The client id the refused open minted (the stream route's 503 body; the focus round, cycle
   * 3 stream fix round, VERIFICATION C3S-F2): a page whose every open is refused has no hello
   * to learn an id from, and without one it cannot post. The route's id names this deck and
   * this identity, so the ops and presence routes admit it on any instance.
   */
  clientId?: string;
  message: string;
};

/** Reads a transport's `onError` argument as a StreamFailure; a plain error carries the message alone. */
export function streamFailureOf(error: unknown): StreamFailure {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const row = error as {
      status?: unknown;
      code?: unknown;
      retryAfterMs?: unknown;
      clientId?: unknown;
      message?: unknown;
    };
    const out: StreamFailure = {
      message: typeof row.message === 'string' ? row.message : 'the stream closed',
    };
    if (typeof row.status === 'number' && Number.isFinite(row.status)) out.status = row.status;
    if (typeof row.code === 'string') out.code = row.code;
    if (
      typeof row.retryAfterMs === 'number' &&
      Number.isFinite(row.retryAfterMs) &&
      row.retryAfterMs >= 0
    )
      out.retryAfterMs = row.retryAfterMs;
    if (typeof row.clientId === 'string' && CLIENT_ID_PATTERN.test(row.clientId))
      out.clientId = row.clientId;
    return out;
  }
  return { message: typeof error === 'string' ? error : 'the stream closed' };
}

/**
 * Splits the text a stream has delivered so far into its complete Server-Sent Events blocks
 * (the lines up to a blank line; the server writes `\n\n`, a `\r\n\r\n` is read too) and the
 * rest, a block still arriving. Pure; the browser transport feeds each block to
 * `parseSseBlock` and `roomEventOf` (protocol.ts). Here rather than in the studio so a unit
 * test covers a frame split across two chunks.
 */
export function splitSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const text = buffer.replace(/\r\n/g, '\n');
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf('\n\n', from);
    if (at < 0) break;
    blocks.push(text.slice(from, at));
    from = at + 2;
  }
  return { blocks, rest: text.slice(from) };
}

/** What the client needs of the wire: the stream, the ops POST and the presence POST. */
export type RoomTransport = {
  open: (options: OpenOptions) => StreamHandle;
  postOps: (body: OpsPost) => Promise<OpsResponse>;
  postPresence: (body: PresencePost, options?: { leave?: boolean }) => Promise<void>;
};

// ---------------------------------------------------------------------------------------------
// The client

export type FlushClass = 'now' | 'pos' | 'text';

/** The flush cadence (SPEC-3 3.9): structural ops at once, pos sets 50 ms, typing 100 ms. */
export const FLUSH_MS: Readonly<Record<FlushClass, number>> = { now: 0, pos: 50, text: 100 };
/** The reconnect and resend backoff cap (SPEC-3 3.6). */
export const BACKOFF_MAX_MS = 8000;
/** The longest wait a server's `retry-after` or `retry:` is honoured for before the next open. */
export const REOPEN_WAIT_MAX_MS = 60_000;
/** At most this many earlier ids ride an open's `retire` (server/room.ts RETIRE_MAX reads no more). */
export const RETIRE_MAX = 8;
/**
 * How long an entry may wait above the position for the stream to fill the gap under it before
 * the client reopens the stream (the focus round, cycle 3 stream fix round; VERIFICATION
 * C3S-F1: a POST's answer arrived at a revision two above the tab's, the revision between them
 * never came down the stream, and the answered ops sat pending and in flight for 238 s while
 * the title row read Saving; the reopen's replay from the position filled the gap at once). A
 * stream that delivers fills a gap within a few seconds (the writer's pulse, the 2 s poll, the
 * announce), so eight is a stream that is not delivering.
 */
export const GAP_REOPEN_MS = 8000;
/** How many recent entries `transformSince` can reach back over. */
export const RECENT_ENTRIES = 2000;

/** How a pending op ended: in the stream at a seq, or returned to its author. */
export type Settled = { seq: number } | { rejected: Rejected };

export type PendingOp = {
  /** the client's own id, assigned at flush; empty until then */
  opId: string;
  kind: 'edit' | 'comment';
  mutations?: Mutation[];
  comment?: CommentOp;
  label: string;
  /** sent in the POST in flight */
  inflight: boolean;
  /** the local clock the op was recorded at, for `transformSince` */
  at: number;
  /** the mutations that undo this op on the document it was applied to, for the rebase of the ops after it when it is refused */
  inverse?: Mutation[];
  /** resolves when the op is admitted or rejected */
  settle?: (outcome: Settled) => void;
};

export type RetainedOp = { opId: string; seq: number; mutations?: Mutation[] };

export type SyncStatus = {
  seq: number;
  revision: number;
  pending: number;
  retained: number;
  tier: RealtimeTier;
  transport: 'sse' | 'poll' | 'none';
  connected: boolean;
  /** the stream is down and the last POST failed */
  offline: boolean;
  /**
   * The room's store refuses its poll (a `store` event with `ok: false`; the blob tier alone
   * sends one): the title row reads Reconnecting until a poll succeeds (the focus round, cycle 3
   * fix round, VERIFICATION C3-F2). False on every other tier.
   */
  storeDegraded: boolean;
  /**
   * The stream ended or its open was refused and the client is reopening it (the focus round,
   * cycle 3 stream fix round, C3-F1). Writes still post over `POST /ops` meanwhile; the title
   * row reads Reconnecting while this is true and nothing is pending. False before the first
   * open answers and from the next hello on.
   */
  streamDown: boolean;
  clientId: string | null;
  role: Role | null;
  /** editing connections at the last hello; at 100 the tab opens in Viewing mode (SPEC-3 0.9) */
  editing: number;
  overCeiling: boolean;
};

export type ChangeReason =
  'local' | 'remote' | 'ack' | 'reject' | 'checkpoint' | 'resync' | 'rebase' | 'persisted';

export type DocumentChange = {
  document: DeckDocument;
  changed: readonly string[] | 'all';
  reason: ChangeReason;
};

export type PersistedOffer = {
  count: number;
  apply: () => Promise<void>;
  discard: () => Promise<void>;
};

export type RoomClientOptions = {
  deckId: string;
  transport: RoomTransport;
  /** the document the editor was handed and its stream position */
  document: DeckDocument;
  seq: number;
  tier?: RealtimeTier;
  /** the client ids this tab held before this page (hotfix 2 cause B1); sent as `retire` on every open */
  retire?: readonly string[];
  pendingStore?: PendingStore;
  now?: () => number;
  /** the schema's transform unless a test injects one */
  transform?: (mutation: Mutation, against: Mutation) => Mutation[];
  /** the flush timers, for tests; the globals by default */
  timers?: {
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  onChange: (change: DocumentChange) => void;
  onStatus?: (status: SyncStatus) => void;
  /** every event of the stream after the client applied it (presence, checkpoint, inbox, access) */
  onEvent?: (event: RoomEvent) => void;
  onReject?: (rejected: Rejected & { mutations?: Mutation[]; comment?: CommentOp }) => void;
  /** the document at a revision the server named (a `resync`); null keeps the current one */
  onResync?: (revision: number) => Promise<DeckDocument | null>;
  /** a persisted queue from an earlier tab of this browser (SPEC-3 0.7) */
  onPersisted?: (offer: PersistedOffer) => void;
  /** a pending op that no longer applies after a remote change was returned to its author */
  onUnplaceable?: (op: PendingOp) => void;
};

export type RoomClient = {
  start: () => void;
  stop: () => Promise<void>;
  /**
   * The local half of a write: the mutations apply through the reducer now, the op is pending
   * and flushes at its cadence; the answer carries the inverse for the history and the local
   * clock for `transformSince`. Throws when the reducer refuses (nothing changes).
   */
  apply: (
    mutations: Mutation[],
    label: string,
    flush?: FlushClass,
  ) => { document: DeckDocument; inverse: Mutation[]; at: number; settled: Promise<Settled> };
  /** reloads the server document at a revision (the controller's reload) and rebases the pending ops */
  resync: (revision?: number) => Promise<void>;
  /** a comment op on the stream (kind: 'comment') */
  sendComment: (op: CommentOp) => void;
  /** mutations recorded at local clock `at`, moved past every operation that landed since */
  transformSince: (mutations: readonly Mutation[], at: number) => Mutation[];
  /** flushes every unsent op now and waits for the POST */
  flush: () => Promise<void>;
  setPresence: (state: Partial<Omit<PresencePost, 'clientId' | 'clock'>>) => void;
  status: () => SyncStatus;
  document: () => DeckDocument;
  /** the roster as the stream told it: hello's clients, then presence and leave events */
  roster: () => readonly RosterEntry[];
  clientId: () => string | null;
  /** the reject notices not yet dismissed, with their content */
  rejects: () => readonly (Rejected & { mutations?: Mutation[] })[];
  dismissReject: (opId: string) => void;
};

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** The default transform: the schema's, identity while B1's functions throw NotImplementedError. */
export function defaultTransform(mutation: Mutation, against: Mutation): Mutation[] {
  if (!isTextOp(mutation) || !isTextOp(against) || !sameText(mutation, against)) return [mutation];
  try {
    return transformMutation(mutation, against, 'right');
  } catch (error) {
    if (error instanceof NotImplementedError) return [mutation];
    throw error;
  }
}

/** The whole Text rewrites a pending text op cannot survive (SPEC-3 3.5). */
export function rewritesText(against: Mutation, op: Mutation): boolean {
  if (!isTextOp(op)) return false;
  switch (against.op) {
    case 'block.set':
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

/** The slides a mutation list touches, for the change signal; deck level ops mark `all`. */
export function changedSlides(mutations: readonly Mutation[]): readonly string[] | 'all' {
  const ids = new Set<string>();
  for (const mutation of mutations) {
    if (!('slideId' in mutation)) {
      if (mutation.op === 'slide.insert') {
        ids.add(mutation.slide.id);
        continue;
      }
      return 'all';
    }
    ids.add(mutation.slideId);
  }
  return [...ids];
}

/** Moves mutations past a landed list (the transform of SPEC-3 3.5); null when nothing survives. */
export function transformPast(
  mutations: readonly Mutation[],
  landed: readonly Mutation[],
  transform: (mutation: Mutation, against: Mutation) => Mutation[],
): Mutation[] | null {
  let out: Mutation[] = [...mutations];
  for (const against of landed) {
    const next: Mutation[] = [];
    for (const mutation of out) {
      if (rewritesText(against, mutation)) continue;
      next.push(...transform(mutation, against));
    }
    out = next;
    if (out.length === 0) return null;
  }
  return out;
}

/** The flush class of a mutation list: pos sets 50 ms, text ops 100 ms, anything else at once. */
export function flushClassOf(mutations: readonly Mutation[]): FlushClass {
  let cls: FlushClass = 'text';
  for (const mutation of mutations) {
    if (mutation.op === 'text.splice' || mutation.op === 'text.mark') continue;
    if (mutation.op === 'block.set' && mutation.path === '/pos') {
      cls = 'pos';
      continue;
    }
    return 'now';
  }
  return mutations.length === 0 ? 'now' : cls;
}

export function createRoomClient(options: RoomClientOptions): RoomClient {
  const { deckId, transport } = options;
  const now = options.now ?? (() => Date.now());
  const timers = options.timers ?? {
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const transform = options.transform ?? defaultTransform;
  let server: DeckDocument = options.document;
  let local: DeckDocument = options.document;
  let seq = options.seq;
  let revision = options.document.deck.revision;
  let pending: PendingOp[] = [];
  let retained: RetainedOp[] = [];
  const recent: Entry[] = [];
  /**
   * The entries buffered ahead of the position, by seq. A list per seq, because the blob tier
   * commits one ops POST as one revision and gives every entry of the batch that revision as its
   * seq (blob.ts `append`; hotfix 2 cause A2), so two entries at one seq are siblings, not
   * duplicates.
   */
  const incoming = new Map<number, Entry[]>();
  /** the op ids applied at the current position, so a duplicate delivery of a sibling is dropped */
  const appliedAtSeq = new Set<string>();
  let clientId: string | null = null;
  const myClientIds = new Set<string>();
  let counter = 0;
  let clock = 0;
  let role: Role | null = null;
  let editing = 0;
  let overCeiling = false;
  let connected = false;
  let offline = false;
  let storeDegraded = false;
  let streamDown = false;
  /**
   * Whether the server's binding of `clientId` stands: true from a hello, false after the ops
   * route answered `client_unbound` (a long sleep, a lapsed TTL), when the ops wait for the
   * reopen's hello. `connected` no longer gates a flush (C3-F1: a tab whose stream was refused
   * posted nothing and read Saving for a minute), so this is the one gate left besides the id.
   */
  let bound = false;
  /** the reopen ladder of the stream: 500 ms doubling to BACKOFF_MAX_MS, reset by a hello */
  let streamBackoff = 0;
  let reopenTimer: unknown;
  /** the wait for the stream to fill a gap under a buffered entry (GAP_REOPEN_MS) */
  let gapTimer: unknown;
  /** the ops of the POST in flight, which a hello leaves in flight (their answer settles them) */
  let inflightBatch: readonly PendingOp[] | null = null;
  /** the head the last hello named; a resync moves the position here */
  let helloSeq = options.seq;
  /**
   * Whether this client has caught the stream up to the head the last hello named (SPEC-3 3.6;
   * VERIFICATION-3 finding 33). A freshly opened page whose document is a revision behind the
   * stream (a write landed just before it opened) holds its first flush until the replay has
   * drained, so the first write is transformed against what landed and never sent on a base the
   * server would have to resync. The keystrokes are applied locally and stay pending meanwhile,
   * so nothing is lost; a reconnect that names a head ahead of this client's position gates the
   * flush again until the replay is drained.
   */
  let caughtUp = false;
  let tier: RealtimeTier = options.tier ?? 'memory';
  let stream: StreamHandle | null = null;
  let flushTimer: unknown;
  let flushAt = Number.POSITIVE_INFINITY;
  let posting: Promise<void> | null = null;
  let backoff = 0;
  let stopped = false;
  /**
   * The POSTs of this client on the blob tier whose commit may reach this tab as a store echo
   * before, or instead of, their answer: the one in flight and every one whose answer was lost
   * (the transport threw at the 30 s deadline, a dropped connection, a 5xx). Each carries its
   * base and the fold of its mutations as the blob channel commits them (blob.ts `append` folds
   * a POST's entries with `foldMutation`). On the blob tier a record carries `clientId: 'store'`
   * and no client op id, so before this an echo of the tab's own write was taken for another
   * author's: the pending ops moved past their own content, the fold applied them a second time
   * and the resend committed them a second time (the focus round, cycle 3, VERIFICATION C2-F24: a
   * doubled word after a stalled save); and an echo arriving while the POST was still in flight
   * doubled the text until the answer landed (cycle 3 fix round, C3-F1). `settleOwnEcho` reads
   * an echo against these records and acknowledges the ops instead. An answered POST leaves the
   * list; a resync clears it.
   */
  type PostedBatch = { base: number; opIds: string[]; folded: string; answered: boolean };
  let posted: PostedBatch[] = [];
  let roster: RosterEntry[] = [];
  let presence: Omit<PresencePost, 'clientId' | 'clock'> = { pointerOn: false, presenting: false };
  let presenceClock = 0;
  let presenceTimer: unknown;
  let presenceDirty = false;
  let heartbeatTimer: unknown;
  const rejects: (Rejected & { mutations?: Mutation[] })[] = [];
  const persistKey = (): string => pendingKey(deckId, clientId ?? 'unbound');

  const status = (): SyncStatus => ({
    seq,
    revision,
    pending: pending.length,
    retained: retained.length,
    tier,
    transport: 'sse',
    connected,
    offline,
    storeDegraded,
    streamDown,
    clientId,
    role,
    editing,
    overCeiling,
  });

  const emitStatus = (): void => {
    options.onStatus?.(status());
  };

  const emitChange = (
    document: DeckDocument,
    changed: readonly string[] | 'all',
    reason: ChangeReason,
  ): void => {
    local = document;
    options.onChange({ document, changed, reason });
  };

  /** Persists pending and retained ops (SPEC-3 0.7); a memory store when the page has none. */
  const persist = (): void => {
    const store = options.pendingStore;
    if (store === undefined) return;
    const entries: PersistedOp[] = [
      ...retained.map((op) => ({
        opId: op.opId,
        kind: 'edit' as const,
        ...(op.mutations === undefined ? {} : { mutations: op.mutations }),
        seq: op.seq,
      })),
      ...pending.map((op) => ({
        opId: op.opId,
        kind: op.kind,
        ...(op.mutations === undefined ? {} : { mutations: op.mutations }),
        ...(op.comment === undefined
          ? {}
          : { comment: op.comment as unknown as Record<string, unknown> }),
      })),
    ];
    const queue: PersistedQueue = {
      key: persistKey(),
      deckId,
      clientId: clientId ?? 'unbound',
      savedAt: new Date(now()).toISOString(),
      entries,
    };
    void store.save(queue).catch(() => undefined);
  };

  /**
   * The pending ops after one of them was refused (docs/FOCUS.md rank 13): every op recorded
   * after it moves past the refused op's inverse, as if a remote undo had landed, so a burst
   * typed on a text that carried the refused insertion is neither refused for an offset the
   * server never reached ("text.splice: 10 plus 0 is outside a text of 7 characters", audit-text
   * row 21) nor folded at the wrong place; an op that cannot move is returned to its author.
   * Pure over `pending`; the caller folds afterwards.
   */
  const rebasePast = (refused: PendingOp | undefined): void => {
    if (refused?.inverse === undefined || refused.inverse.length === 0) return;
    const next: PendingOp[] = [];
    for (const op of pending) {
      if (op.kind !== 'edit' || op.mutations === undefined || op.at <= refused.at) {
        next.push(op);
        continue;
      }
      const moved = transformPast(op.mutations, refused.inverse, transform);
      if (moved === null) {
        options.onUnplaceable?.(op);
        const rejected: Rejected = { opId: op.opId, reason: 'stale' };
        rejects.push({ ...rejected, mutations: op.mutations });
        op.settle?.({ rejected });
        continue;
      }
      next.push({ ...op, mutations: moved });
    }
    pending = next;
  };

  /** The local document from the server document and the pending ops; an op that no longer applies is returned to its author, and the ops after it move past it. */
  const fold = (): { document: DeckDocument; changed: readonly string[] | 'all' } => {
    let document = server;
    const kept: PendingOp[] = [];
    let changed: readonly string[] | 'all' = [];
    const touched = new Set<string>();
    const queue = [...pending];
    while (queue.length > 0) {
      const op = queue.shift() as PendingOp;
      if (op.kind !== 'edit' || op.mutations === undefined) {
        kept.push(op);
        continue;
      }
      try {
        document = applyMutations(document, op.mutations).document;
        kept.push(op);
        const slides = changedSlides(op.mutations);
        if (slides === 'all') changed = 'all';
        else for (const id of slides) touched.add(id);
      } catch {
        options.onUnplaceable?.(op);
        const rejected: Rejected = { opId: op.opId, reason: 'stale' };
        rejects.push({ ...rejected, mutations: op.mutations });
        op.settle?.({ rejected });
        changed = 'all';
        // the ops after it were recorded on a text that carried it: they move past its inverse
        pending = queue;
        rebasePast(op);
        queue.splice(0, queue.length, ...pending);
      }
    }
    pending = kept;
    return { document, changed: changed === 'all' ? 'all' : [...touched] };
  };

  const remember = (entry: Entry): void => {
    recent.push(entry);
    if (recent.length > RECENT_ENTRIES) recent.splice(0, recent.length - RECENT_ENTRIES);
  };

  /** The fold of a batch's edit mutations, as the blob channel commits one POST (blob.ts `append`). */
  const foldOf = (batch: readonly PendingOp[]): string => {
    const folded: RoomMutation[] = [];
    for (const op of batch) {
      if (op.kind !== 'edit') continue;
      for (const mutation of op.mutations ?? []) foldMutation(folded, mutation);
    }
    return JSON.stringify(folded);
  };

  /**
   * A store echo that is the commit of one of this client's own POSTs (in flight or lost): its
   * base at or above the POST's and its mutations the POST's fold, byte for byte. The ops of
   * that POST still pending are acknowledged at the echo's seq, the server document takes the
   * echo once, and nothing is resent; the answer of the POST, when it comes, finds its ops
   * settled and repeats nothing (`held`). False for any other echo.
   */
  const settleOwnEcho = (entry: Entry): boolean => {
    if (tier !== 'blob' || posted.length === 0) return false;
    const folded = JSON.stringify(entry.mutations ?? []);
    const batch = posted.find(
      (row) => !row.answered && entry.rev >= row.base && row.folded === folded,
    );
    if (batch === undefined) return false;
    batch.answered = true;
    posted = posted.filter((row) => row !== batch);
    const own = pending.filter((op) => batch.opIds.includes(op.opId));
    pending = pending.filter((op) => !own.includes(op));
    for (const op of own) {
      op.settle?.({ seq: entry.seq });
      if (!retained.some((row) => row.opId === op.opId)) {
        retained.push({
          opId: op.opId,
          seq: entry.seq,
          ...(op.mutations === undefined ? {} : { mutations: op.mutations }),
        });
      }
    }
    try {
      server = applyMutations(server, entry.mutations ?? [], { now: entry.at }).document;
    } catch {
      scheduleResync(Math.max(entry.seq, revision));
    }
    const refolded = fold();
    emitChange(refolded.document, 'all', 'ack');
    options.onEvent?.({ type: 'op', entry });
    persist();
    emitStatus();
    return true;
  };

  /**
   * An entry of this client's own at or behind the position (the answer of a resent POST, which
   * the server replays with the seq its first admission made; VERIFICATION C3-F1): the op it
   * names is acknowledged and leaves the pending set. The document holds its content already,
   * through the echo applied at that seq or the resync that brought the revision in, so nothing
   * is applied again. Before this such an entry was dropped as a duplicate of the position and
   * its op stayed pending and in flight for good: the title row read Saving with the tab and
   * the server at one revision (the stall of C2-F24 and C3-F1 on the blob tier).
   */
  const settleBehind = (entry: Entry): void => {
    if (!myClientIds.has(entry.clientId)) return;
    const own = pending.find((op) => op.opId === entry.opId);
    if (own === undefined) return;
    pending = pending.filter((op) => op !== own);
    own.settle?.({ seq: entry.seq });
    if (entry.kind === 'edit' && !retained.some((row) => row.opId === own.opId)) {
      retained.push({
        opId: own.opId,
        seq: entry.seq,
        ...(own.mutations === undefined ? {} : { mutations: own.mutations }),
      });
    }
    const folded = fold();
    emitChange(folded.document, 'all', 'ack');
    persist();
    emitStatus();
  };

  /** One admitted entry in stream order. */
  const applyEntry = (entry: Entry): void => {
    if (entry.seq !== seq) appliedAtSeq.clear();
    seq = entry.seq;
    appliedAtSeq.add(entry.opId);
    remember(entry);
    const mine = myClientIds.has(entry.clientId);
    if (entry.kind === 'comment') {
      if (mine) {
        pending.find((op) => op.opId === entry.opId)?.settle?.({ seq: entry.seq });
        pending = pending.filter((op) => op.opId !== entry.opId);
      }
      options.onEvent?.({ type: 'op', entry });
      persist();
      emitStatus();
      return;
    }
    const mutations = entry.mutations ?? [];
    // a store entry (the follower's copy of a record) that the document holds already is skipped
    if (entry.clientId === 'store' && entry.rev < server.deck.revision) return;
    if (entry.clientId === 'store' && settleOwnEcho(entry)) return;
    if (mine) {
      const own = pending.find((op) => op.opId === entry.opId);
      // acknowledged before this entry arrived (the store echo of its POST, settleOwnEcho): its
      // content is in the server document already
      const acknowledged = own === undefined && retained.some((row) => row.opId === entry.opId);
      pending = pending.filter((op) => op.opId !== entry.opId);
      own?.settle?.({ seq: entry.seq });
      if (!retained.some((row) => row.opId === entry.opId))
        retained.push({ opId: entry.opId, seq: entry.seq, mutations });
      // on the blob tier the seq is the revision the record made: an entry at or under the
      // revision the server document already holds (a resent POST answered with its first
      // admission after a resync brought that revision in), or one acknowledged from its echo,
      // is in the document, and applying it again would double it
      const held = tier === 'blob' && (entry.seq <= server.deck.revision || acknowledged);
      let next: DeckDocument;
      try {
        next = held ? server : applyMutations(server, mutations, { now: entry.at }).document;
      } catch {
        next = server;
      }
      server = next;
      // the fast path: the admitted form equals the pending one and it was first in line
      if (
        own !== undefined &&
        pending.length === 0 &&
        JSON.stringify(own.mutations) === JSON.stringify(mutations)
      ) {
        local = { deck: { ...local.deck, updatedAt: server.deck.updatedAt }, slides: local.slides };
        persist();
        emitStatus();
        return;
      }
      const folded = fold();
      emitChange(folded.document, 'all', 'ack');
      persist();
      emitStatus();
      return;
    }
    // another author's op: the pending text ops move past it, then the local document re-derives
    const next: PendingOp[] = [];
    for (const op of pending) {
      if (op.kind !== 'edit' || op.mutations === undefined) {
        next.push(op);
        continue;
      }
      const moved = transformPast(op.mutations, mutations, transform);
      if (moved === null) {
        options.onUnplaceable?.(op);
        const rejected: Rejected = { opId: op.opId, reason: 'stale' };
        rejects.push({ ...rejected, mutations: op.mutations });
        op.settle?.({ rejected });
        continue;
      }
      next.push({ ...op, mutations: moved });
    }
    pending = next;
    try {
      server = applyMutations(server, mutations, { now: entry.at }).document;
    } catch {
      // an entry this copy cannot apply (a store record whose mutations need the version log, a
      // restore; an entry on a document this copy never reached): the server document is ahead
      // of this copy, so the tab reloads at the entry's position, which on the blob tier is the
      // revision the record made. Before this the catch trusted a resync that never came: the
      // checkpoint frame after the entry moved the revision and the document stayed the one from
      // before the entry (VERIFICATION F-versions, "restore changed the deck false")
      scheduleResync(tier === 'blob' ? Math.max(entry.seq, revision) : revision);
    }
    const folded = fold();
    const changed = changedSlides(mutations);
    emitChange(
      folded.document,
      changed === 'all' || folded.changed === 'all'
        ? 'all'
        : [...new Set([...changed, ...folded.changed])],
      'remote',
    );
    options.onEvent?.({ type: 'op', entry });
    persist();
    emitStatus();
  };

  /** The replay has reached the head the last hello named: the first flush may go (finding 33). */
  const noteCaughtUp = (): void => {
    if (caughtUp || seq < helloSeq) return;
    caughtUp = true;
    if (pending.some((op) => !op.inflight)) scheduleFlush('now');
  };

  /** Drains the contiguous entries buffered by seq, every sibling of a seq in arrival order. */
  const drain = (): void => {
    for (;;) {
      const next = incoming.get(seq + 1);
      if (next === undefined) break;
      incoming.delete(seq + 1);
      for (const entry of next) applyEntry(entry);
    }
    // anything below the seq is a duplicate
    for (const key of [...incoming.keys()]) if (key <= seq) incoming.delete(key);
    noteCaughtUp();
    watchGap();
  };

  /**
   * The gap watch (GAP_REOPEN_MS): an entry buffered above the position waits for the stream to
   * deliver what sits between; when nothing has for GAP_REOPEN_MS the stream is not delivering
   * (its instance stopped announcing, or it is refused and the reopen is on its way), and the
   * client reopens it so the replay from the position fills the gap. Armed when a gap appears,
   * moved on every advance of the position, cleared when the buffer empties; a stream already
   * down has its reopen scheduled and is left to it.
   */
  const watchGap = (): void => {
    if (incoming.size === 0) {
      if (gapTimer !== undefined) timers.clearTimeout(gapTimer);
      gapTimer = undefined;
      return;
    }
    if (gapTimer !== undefined) timers.clearTimeout(gapTimer);
    gapTimer = timers.setTimeout(() => {
      gapTimer = undefined;
      if (stopped || incoming.size === 0) return;
      if (connected && !streamDown) reopenStream({ message: 'the stream fell behind the room' });
    }, GAP_REOPEN_MS);
  };

  /**
   * One entry off the wire (the stream or an ops POST answer). Below the position it is a
   * duplicate. At the position it is a sibling of a batch the blob tier committed as one
   * revision (hotfix 2 cause A2) and is applied unless its op id was applied already; a store
   * echo (`clientId: 'store'`, the record's folded mutations) at the position repeats what the
   * batch's entries already carried and is dropped. Above the position it is buffered by seq.
   */
  const take = (entry: Entry): void => {
    if (entry.seq < seq) {
      settleBehind(entry);
      return;
    }
    if (entry.seq === seq) {
      if (entry.clientId === 'store') return;
      if (appliedAtSeq.has(entry.opId)) {
        settleBehind(entry);
        return;
      }
      applyEntry(entry);
      return;
    }
    const siblings = incoming.get(entry.seq);
    if (siblings === undefined) incoming.set(entry.seq, [entry]);
    else if (!siblings.some((row) => row.opId === entry.opId)) siblings.push(entry);
    drain();
  };

  const setRevision = (next: number, at: string): void => {
    revision = next;
    server = { deck: { ...server.deck, revision: next, updatedAt: at }, slides: server.slides };
    local = { deck: { ...local.deck, revision: next, updatedAt: at }, slides: local.slides };
  };

  /** One reload at a time for the entries this copy cannot apply; a burst of them is one resync. */
  let resyncing = false;
  const scheduleResync = (at: number): void => {
    if (resyncing || options.onResync === undefined) return;
    resyncing = true;
    void resync(at)
      .catch(() => undefined)
      .finally(() => {
        resyncing = false;
      });
  };

  const resync = async (at: number): Promise<void> => {
    if (options.onResync === undefined) return;
    const fresh = await options.onResync(at);
    if (fresh === null || stopped) return;
    server = fresh;
    revision = Math.max(revision, fresh.deck.revision);
    // the reload brought the document to the head. On the blob tier the seq of an entry is the
    // revision its record made (blob.ts), so the fresh document's revision is the stream
    // position; a position left at the last hello buffered every later entry for good and the
    // document stopped moving while the revision climbed (hotfix 2 cause A3, "revision 2 vs 12").
    seq = Math.max(seq, helloSeq, tier === 'blob' ? fresh.deck.revision : 0);
    appliedAtSeq.clear();
    // the pending ops (re-folded on the fresh document) may flush
    caughtUp = true;
    incoming.clear();
    watchGap();
    retained = [];
    posted = [];
    for (const op of pending) op.inflight = false;
    const folded = fold();
    emitChange(folded.document, 'all', 'resync');
    persist();
    emitStatus();
    scheduleFlush('now');
  };

  const onEvent = (event: RoomEvent): void => {
    switch (event.type) {
      case 'hello': {
        const previousId = clientId;
        clientId = event.clientId;
        myClientIds.add(event.clientId);
        if (previousId !== null && previousId !== event.clientId) {
          // a reconnect under a new id (the seam step of the cycle 3 stream fix round): the
          // pending ops travel and persist under the new id from here, so the record kept under
          // the old one goes, or the next page is offered as unsaved changes ops that landed
          // (realtime.spec.ts:515 read 6 unsaved changes where 3 were typed once an offline blip
          // ended the stream)
          persist();
          void options.pendingStore?.remove(pendingKey(deckId, previousId)).catch(() => undefined);
        }
        role = event.role;
        editing = event.editing;
        overCeiling = event.role === 'viewer' && event.editing >= 100;
        tier = event.tier;
        roster = event.clients;
        helloSeq = event.seq;
        // caught up when this client's position already reaches the head; otherwise the flush
        // waits for the replay to drain (finding 33), which noteCaughtUp arms
        caughtUp = seq >= helloSeq;
        connected = true;
        bound = true;
        streamDown = false;
        streamBackoff = 0;
        offline = false;
        backoff = 0;
        if (event.revision > revision) revision = event.revision;
        // the ops retained at or below the seq the last checkpoint covered are saved: the
        // checkpoint event that covered them may have fired while this tab's stream was down,
        // and a reopen replays entries, not checkpoints (SEAM-F8: the title row read Saving on
        // a quiet deck after a reconnect, for good)
        if (event.covered !== undefined) {
          const covered = event.covered;
          retained = retained.filter((op) => op.seq > covered);
        }
        if (event.seq < seq) {
          // the stream was reset behind this client; reload at the server's revision
          seq = event.seq;
          appliedAtSeq.clear();
          void resync(event.revision);
        }
        // ops sent on a connection that died are re-sent under the new client id once the
        // replay has shown which of them landed; the ops of a POST still in flight stay in
        // flight, since the client posts while its stream is down and that POST's answer
        // settles them (or hands them back to the resend when it fails)
        for (const op of pending) if (!(inflightBatch?.includes(op) ?? false)) op.inflight = false;
        options.onEvent?.(event);
        emitStatus();
        presenceDirty = true;
        schedulePresence(0);
        scheduleFlush('now');
        return;
      }
      case 'ops':
        for (const entry of event.entries) take(entry);
        return;
      case 'op':
        take(event.entry);
        return;
      case 'checkpoint': {
        retained = retained.filter((op) => op.seq > event.toSeq);
        if (event.external === true) {
          void resync(event.revision).catch(() => undefined);
        } else {
          // never backwards: on the blob tier the ops POST answer names the revision first and
          // the stream's instance delivers the checkpoint frames of earlier revisions after it,
          // so a late frame must not pull the reported revision behind the server's (hotfix 2)
          setRevision(Math.max(revision, event.revision), new Date(now()).toISOString());
          emitChange(local, [], 'checkpoint');
        }
        options.onEvent?.(event);
        persist();
        emitStatus();
        return;
      }
      case 'presence': {
        // the row is replaced in place and a client the roster does not hold is appended, so the
        // roster keeps its join order across presence posts: the title row's four slots read it
        // in order, and a post from one person moves nobody's chip (before this the roster was
        // rebuilt as [...rest, state], so every post moved its participant to the end and a
        // second person's chip moved 28 px whenever a third was present; presence.spec.ts's
        // second person row, build/t2.md T2-R1)
        const at = roster.findIndex((row) => row.clientId === event.clientId);
        roster =
          at === -1
            ? [...roster, event.state]
            : roster.map((row, index) => (index === at ? event.state : row));
        options.onEvent?.(event);
        return;
      }
      case 'leave':
        roster = roster.filter((row) => row.clientId !== event.clientId);
        options.onEvent?.(event);
        return;
      case 'reject': {
        const own = pending.find((op) => op.opId === event.opId);
        pending = pending.filter((op) => op.opId !== event.opId);
        rebasePast(own);
        own?.settle?.({ rejected: { opId: event.opId, reason: event.reason } });
        const notice: Rejected & { mutations?: Mutation[]; comment?: CommentOp } = {
          opId: event.opId,
          reason: event.reason,
          ...(event.message === undefined ? {} : { message: event.message }),
          ...(event.mutations === undefined ? {} : { mutations: event.mutations }),
          ...(event.comment === undefined ? {} : { comment: event.comment }),
        };
        rejects.push(notice);
        options.onReject?.(notice);
        const folded = fold();
        emitChange(folded.document, 'all', 'reject');
        persist();
        emitStatus();
        return;
      }
      case 'resync':
        void resync(event.revision).catch(() => undefined);
        return;
      case 'store':
        // the room's store refuses its poll, or answers again: the title row's word
        storeDegraded = !event.ok;
        options.onEvent?.(event);
        emitStatus();
        return;
      case 'inbox':
      case 'access':
        options.onEvent?.(event);
        return;
    }
  };

  // -------------------------------------------------------------------------------------------
  // Sending

  const nextOpId = (): string => {
    counter += 1;
    return `${clientId ?? 'unbound'}:${counter}`;
  };

  const scheduleFlush = (cls: FlushClass): void => {
    if (stopped) return;
    const at = now() + FLUSH_MS[cls];
    if (at >= flushAt && flushTimer !== undefined) return;
    if (flushTimer !== undefined) timers.clearTimeout(flushTimer);
    flushAt = at;
    flushTimer = timers.setTimeout(
      () => {
        flushTimer = undefined;
        flushAt = Number.POSITIVE_INFINITY;
        void flush();
      },
      Math.max(0, at - now()),
    );
  };

  const flush = async (): Promise<void> => {
    if (posting !== null) {
      await posting;
      if (pending.some((op) => !op.inflight)) await flush();
      return;
    }
    // the POST needs the server's client id and its binding, not the stream: while the stream
    // is down or refused the pending ops post as before and the answer settles them (the focus
    // round, cycle 3 stream fix round, C3-F1; before this `!connected` returned here and a tab
    // whose stream was refused 503 read Saving for the 60 s bound with nothing on the wire)
    if (clientId === null || !bound) return;
    // hold the first flush until the replay has caught the stream up (finding 33): the op stays
    // pending and applied locally, and goes once it has been transformed against what landed
    if (!caughtUp) return;
    const unsent = pending.filter((op) => !op.inflight);
    if (unsent.length === 0) return;
    const batch: PendingOp[] = [];
    let bytes = 0;
    for (const op of unsent) {
      if (op.opId === '' || !op.opId.startsWith(`${clientId}:`)) op.opId = nextOpId();
      const size = bytesOf(op.kind === 'edit' ? op.mutations : op.comment);
      if (batch.length >= OPS_POST_MAX_ENTRIES || bytes + size > OPS_POST_MAX_BYTES - 1024) break;
      batch.push(op);
      bytes += size;
    }
    if (batch.length === 0) return;
    for (const op of batch) op.inflight = true;
    const body: OpsPost = {
      clientId,
      base: { seq },
      entries: batch.map((op) =>
        op.kind === 'edit'
          ? { opId: op.opId, kind: 'edit' as const, mutations: op.mutations ?? [] }
          : {
              opId: op.opId,
              kind: 'comment' as const,
              comment: op.comment as OpsPost['entries'][number]['comment'],
            },
      ),
    };
    // the POST's record (blob tier): its commit may reach this tab as a store echo before its
    // answer, and the echo is matched against this record (settleOwnEcho)
    const record: PostedBatch | null =
      tier === 'blob'
        ? {
            base: body.base.seq,
            opIds: batch.map((op) => op.opId),
            folded: foldOf(batch),
            answered: false,
          }
        : null;
    if (record !== null) posted.push(record);
    inflightBatch = batch;
    posting = (async () => {
      let response: OpsResponse;
      try {
        response = await transport.postOps(body);
      } catch (error) {
        void error;
        // the answer is lost, the write may not be: the record stays for the store echo of its
        // commit, which settles the ops before they are resent
        for (const op of batch) op.inflight = false;
        offline = true;
        emitStatus();
        backoff = Math.min(BACKOFF_MAX_MS, backoff === 0 ? 500 : backoff * 2);
        timers.setTimeout(() => void flush(), backoff);
        return;
      }
      offline = false;
      if (response.ok) {
        backoff = 0;
        if (record !== null) posted = posted.filter((row) => row !== record);
        // what landed under the admitted entries first, so they drain at once (C3S-F8); an
        // entry the stream delivered meanwhile is a duplicate `take` drops
        for (const entry of response.between ?? []) take(entry);
        for (const entry of response.entries) take(entry);
        for (const rejected of response.rejected) {
          const op = pending.find((row) => row.opId === rejected.opId);
          pending = pending.filter((row) => row.opId !== rejected.opId);
          rebasePast(op);
          op?.settle?.({ rejected });
          const notice = {
            ...rejected,
            ...(op?.mutations === undefined ? {} : { mutations: op.mutations }),
            ...(op?.comment === undefined ? {} : { comment: op.comment }),
          };
          rejects.push(notice);
          options.onReject?.(notice);
        }
        if (response.rejected.length > 0) {
          const folded = fold();
          emitChange(folded.document, 'all', 'reject');
        }
        if (response.revision > revision) revision = response.revision;
        // an entry admitted but not yet seen on the stream stays in flight until it arrives
        for (const op of batch) {
          if (pending.includes(op) && !response.entries.some((entry) => entry.opId === op.opId))
            op.inflight = false;
        }
        persist();
        emitStatus();
        if (pending.some((op) => !op.inflight)) scheduleFlush('now');
        return;
      }
      for (const op of batch) op.inflight = false;
      if (response.code === 'resync') {
        await resync(response.head ?? revision);
        return;
      }
      if (response.status === 429) {
        // the room's budget or the store's window: the ops stay pending and go again after the
        // wait the answer named; the record stays, since a 429 may follow the store's commit
        timers.setTimeout(() => void flush(), response.retryAfterMs ?? 1000);
        return;
      }
      if (response.status >= 500) {
        // a server side failure is transient (the store did not answer within its deadline, an
        // instance that stalled): the ops stay pending and are resent after a backoff, the way a
        // POST that threw is, never returned to the author as a refusal. On the cycle 2 enforce
        // preview a stalled Blob head landed here as "A change was not applied HTTPError" and
        // every later row failed in the stuck save state (the integrator at the cycle 2 merge)
        offline = true;
        emitStatus();
        backoff = Math.min(BACKOFF_MAX_MS, backoff === 0 ? 500 : backoff * 2);
        timers.setTimeout(() => void flush(), response.retryAfterMs ?? backoff);
        return;
      }
      if (response.status === 403 && response.code === 'client_unbound') {
        // the binding lapsed (a long sleep): the ops wait for the hello of a fresh stream, which
        // this client opens itself now (before this the wait was for the browser's EventSource
        // to reconnect at the lifetime's end)
        bound = false;
        connected = false;
        emitStatus();
        reopenStream({ message: 'the client binding lapsed' });
        return;
      }
      // a refusal that will not change on a retry (a forbidden write): the ops return to the author
      if (record !== null) posted = posted.filter((row) => row !== record);
      for (const op of batch) {
        pending = pending.filter((row) => row !== op);
        const notice = {
          opId: op.opId,
          reason: 'forbidden' as const,
          message: response.message,
          ...(op.mutations === undefined ? {} : { mutations: op.mutations }),
        };
        op.settle?.({
          rejected: { opId: op.opId, reason: 'forbidden', message: response.message },
        });
        rejects.push(notice);
        options.onReject?.(notice);
      }
      const folded = fold();
      emitChange(folded.document, 'all', 'reject');
      persist();
      emitStatus();
    })().finally(() => {
      posting = null;
      inflightBatch = null;
    });
    await posting;
  };

  // -------------------------------------------------------------------------------------------
  // The stream and its reopen (the focus round, cycle 3 stream fix round, C3-F1)

  /**
   * The ids this open retires on the instance it lands on: the tab's earlier pages' ids
   * (`options.retire`) and this page's own earlier ids, so a reconnect releases the slot its
   * last stream still holds there and removes that stream's roster row, the newest last and at
   * most RETIRE_MAX of them (server/room.ts reads no more).
   */
  const retireList = (): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of [...(options.retire ?? []), ...myClientIds]) {
      if (id === '' || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out.slice(Math.max(0, out.length - RETIRE_MAX));
  };

  /** The wait before the next open: the server's word when it gave one, else the ladder. */
  const reopenWaitMs = (failure: StreamFailure): number => {
    if (failure.retryAfterMs !== undefined)
      return Math.min(failure.retryAfterMs, REOPEN_WAIT_MAX_MS);
    if (failure.status === 403 || failure.status === 404) return BACKOFF_MAX_MS;
    streamBackoff = Math.min(BACKOFF_MAX_MS, streamBackoff === 0 ? 500 : streamBackoff * 2);
    return streamBackoff;
  };

  const openStream = (): void => {
    if (stopped || stream !== null) return;
    const retire = retireList();
    let reported = false;
    let self: StreamHandle | null = null;
    const handle = transport.open({
      since: seq,
      ...(retire.length === 0 ? {} : { retire }),
      onEvent,
      onError: (error) => {
        // one report per open, and none from a handle the client has already replaced
        if (reported) return;
        reported = true;
        if (self !== null && stream !== self) return;
        reopenStream(streamFailureOf(error));
      },
    });
    self = handle;
    // a transport that refused inside `open` has scheduled the reopen already
    if (reported) return;
    stream = handle;
  };

  /**
   * The stream is gone (closed at its lifetime, dropped, or refused at the open): the client
   * marks it down, closes the handle and opens the next one after the wait the server named
   * (`retry-after` on a 503, the `retry:` field of a stream that closed) or its own ladder, with
   * `since` at its position so the replay fills the gap. Nothing here waits on a browser's
   * EventSource; the studio's transport reports and reconnects nothing itself.
   */
  const reopenStream = (failure: StreamFailure): void => {
    stream?.close();
    stream = null;
    connected = false;
    streamDown = true;
    if (stopped) {
      emitStatus();
      return;
    }
    if (reopenTimer !== undefined) timers.clearTimeout(reopenTimer);
    reopenTimer = timers.setTimeout(() => {
      reopenTimer = undefined;
      openStream();
    }, reopenWaitMs(failure));
    // a refused open that minted an id for this page: the page posts under it while it waits
    // for a slot (C3S-F2: with no hello there was no id, so nothing left the tab and the title
    // row read Saving for the 60 s bound). The document is the one the page was handed, so the
    // first flush goes at once and the server transforms or resyncs as for any base; a hello
    // later replaces the id and the ops travel under the new one
    if (clientId === null && failure.clientId !== undefined) {
      clientId = failure.clientId;
      myClientIds.add(failure.clientId);
      bound = true;
      caughtUp = true;
      presenceDirty = true;
      schedulePresence(0);
      if (pending.some((op) => !op.inflight)) scheduleFlush('now');
    }
    emitStatus();
  };

  // -------------------------------------------------------------------------------------------
  // Presence (SPEC-3 3.8): one batch per 80 ms, a heartbeat every 5 s

  const postPresence = async (): Promise<void> => {
    // the binding gates a presence post, not the stream: a tab whose stream is down or refused
    // is alive, its row stays in every roster (the chip, the server's reader liveness) and its
    // leave lands when it closes (C3S-F3: a closed tab's chip stayed while its leave was lost)
    if (clientId === null || !bound) return;
    presenceClock += 1;
    presenceDirty = false;
    try {
      await transport.postPresence({ clientId, clock: presenceClock, ...presence });
    } catch {
      // a lost presence batch is replaced by the next one
    }
  };

  const schedulePresence = (ms: number): void => {
    if (stopped || presenceTimer !== undefined) return;
    presenceTimer = timers.setTimeout(() => {
      presenceTimer = undefined;
      if (presenceDirty) void postPresence();
    }, ms);
  };

  const heartbeat = (): void => {
    heartbeatTimer = timers.setTimeout(() => {
      heartbeatTimer = undefined;
      if (stopped) return;
      void postPresence();
      heartbeat();
    }, PRESENCE_HEARTBEAT_MS);
  };

  // -------------------------------------------------------------------------------------------
  // The persisted queue of an earlier tab (SPEC-3 0.7)

  const offerPersisted = async (): Promise<void> => {
    const store = options.pendingStore;
    if (store === undefined || options.onPersisted === undefined) return;
    const queues = await store.load(deckId, now());
    const others = queues.filter((queue) => queue.clientId !== clientId && unsavedCount(queue) > 0);
    if (others.length === 0) return;
    const count = others.reduce((sum, queue) => sum + unsavedCount(queue), 0);
    options.onPersisted({
      count,
      apply: async () => {
        for (const queue of others) {
          for (const op of queue.entries) {
            if (op.seq !== undefined || op.kind !== 'edit' || op.mutations === undefined) continue;
            try {
              client.apply(op.mutations, 'persisted', 'now');
            } catch {
              // an op the document no longer takes is dropped with the queue
            }
          }
          await store.remove(queue.key);
        }
        emitChange(local, 'all', 'persisted');
      },
      discard: async () => {
        for (const queue of others) await store.remove(queue.key);
      },
    });
  };

  const client: RoomClient = {
    start() {
      if (stream !== null || stopped) return;
      openStream();
      heartbeat();
      void offerPersisted();
    },
    async stop() {
      stopped = true;
      if (flushTimer !== undefined) timers.clearTimeout(flushTimer);
      if (presenceTimer !== undefined) timers.clearTimeout(presenceTimer);
      if (heartbeatTimer !== undefined) timers.clearTimeout(heartbeatTimer);
      if (reopenTimer !== undefined) timers.clearTimeout(reopenTimer);
      if (gapTimer !== undefined) timers.clearTimeout(gapTimer);
      // the leave goes first (a `pagehide` gives it no time to wait on a POST in flight; the
      // browser transport sends it with keepalive), then the POST in flight is awaited. The
      // binding gates it, not the stream: a tab closed while its stream was down leaves too
      const leaving =
        clientId !== null && bound
          ? transport
              .postPresence({ clientId, clock: presenceClock + 1, ...presence }, { leave: true })
              .catch(() => undefined)
          : Promise.resolve();
      stream?.close();
      stream = null;
      connected = false;
      if (posting !== null) await posting.catch(() => undefined);
      await leaving;
      persist();
    },
    apply(mutations, label, flush) {
      const result = applyMutations(local, mutations);
      clock += 1;
      let settle: ((outcome: Settled) => void) | undefined;
      const settled = new Promise<Settled>((resolve) => {
        settle = resolve;
      });
      // the op holds its own copy: the controller's typing group grows the array it handed in
      // with every later burst (controller.tsx commitAs, `group.mutations.push`), and a shared
      // reference made an offline resend, a lost POST's resend and the persisted queue carry a
      // later burst's splice twice (realtime.spec.ts:515 `late12323`; s2.md S2-R1)
      pending.push({
        opId: '',
        kind: 'edit',
        mutations: [...mutations],
        label,
        inflight: false,
        at: clock,
        inverse: result.inverse,
        ...(settle === undefined ? {} : { settle }),
      });
      emitChange(result.document, changedSlides(mutations), 'local');
      persist();
      emitStatus();
      scheduleFlush(flush ?? flushClassOf(mutations));
      return { document: result.document, inverse: result.inverse, at: clock, settled };
    },
    resync(at) {
      return resync(at ?? revision);
    },
    sendComment(op) {
      clock += 1;
      pending.push({
        opId: '',
        kind: 'comment',
        comment: op,
        label: `comment.${op.op}`,
        inflight: false,
        at: clock,
      });
      persist();
      emitStatus();
      scheduleFlush('now');
    },
    transformSince(mutations, at) {
      // the entries that landed after the op was recorded: every remote entry with a higher
      // position in the recent log, and none of the author's own (which the inverse already knows)
      const marker = recentMarkers.get(at);
      const since = marker === undefined ? [] : recent.filter((entry) => entry.seq > marker);
      const landed = since
        .filter((entry) => !myClientIds.has(entry.clientId))
        .flatMap((entry) => entry.mutations ?? []);
      return transformPast(mutations, landed, transform) ?? [];
    },
    flush,
    setPresence(state) {
      presence = { ...presence, ...state };
      presenceDirty = true;
      schedulePresence(PRESENCE_BATCH_MS);
    },
    status,
    document: () => local,
    roster: () => roster,
    clientId: () => clientId,
    rejects: () => rejects,
    dismissReject(opId) {
      const at = rejects.findIndex((row) => row.opId === opId);
      if (at >= 0) rejects.splice(at, 1);
    },
  };

  /** The stream seq at each local clock, so `transformSince` knows which entries came after. */
  const recentMarkers = new Map<number, number>();
  const originalApply = client.apply;
  client.apply = (mutations, label, flush) => {
    const result = originalApply(mutations, label, flush);
    recentMarkers.set(result.at, seq);
    if (recentMarkers.size > RECENT_ENTRIES) {
      const oldest = recentMarkers.keys().next().value;
      if (oldest !== undefined) recentMarkers.delete(oldest);
    }
    return result;
  };

  return client;
}

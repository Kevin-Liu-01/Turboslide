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
//
// Round five (gslides-parity SPEC-5-amendments A3, B7): one client id per tab, asked for on every
// stream open and kept across a reload (item 5); `revision` is only ever a number a write answer
// or a stream frame carried (item 1); one POST in flight per tab and the next leaves after the
// answer's entries are applied (item 4); a 409 that carries the entries since the base rebases the
// pending ops onto them and posts again once, without a reload or a prompt (item 3); a record's
// echo from another instance of the blob tier names the tab and its batch (`+<count>` op ids,
// src/op-ids.ts) and is applied as an acknowledgement, never drawn as a remote change (items 5
// and 6); the tab's own persisted queue replays on its own after a reload while another tab's is
// offered (SPEC-3 0.7); the presence heartbeat is 25 s and pauses while the tab is hidden (A8
// rows 7 and 8); an op returned to its author names who changed the same text (item 8).
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
  RosterEntry,
} from '../src/channel.ts';
import { OPS_POST_MAX_BYTES, OPS_POST_MAX_ENTRIES, PRESENCE_BATCH_MS } from '../src/protocol.ts';
import type { OpsPost, PresencePost } from '../src/protocol.ts';
import { opIdsOfBatch } from '../src/op-ids.ts';
import type { PendingStore, PersistedOp, PersistedQueue } from './pending-store.ts';
import { pendingKey, unsavedCount } from './pending-store.ts';

// ---------------------------------------------------------------------------------------------
// The transport

export type Rejected = { opId: string; reason: RejectReason; message?: string };

export type OpsResponse =
  | { ok: true; entries: Entry[]; rejected: Rejected[]; head: number; revision: number }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      head?: number;
      retryAfterMs?: number;
      /** a blob tier 409's entries since the client's base (SPEC-5-amendments A3 item 3) */
      since?: Entry[];
    };

export type StreamHandle = { close: () => void };

export type OpenOptions = {
  since: number;
  /**
   * The client id this tab holds (sessionStorage; SPEC-5-amendments A3 item 5): the stream route
   * keeps it when its signature names this deck and this identity, so a reload or a reconnect
   * replaces the tab's own roster row instead of adding one, and issues a fresh id otherwise.
   */
  clientId?: string;
  /**
   * The client ids this tab held before (an earlier page of the same tab, hotfix 2 cause B1):
   * the stream route removes their roster rows before it writes `hello`, so a reload never
   * lists the tab's own earlier id as a collaborator. Sent on every open, so a reconnect that
   * lands on another instance retires them there too.
   */
  retire?: readonly string[];
  onEvent: (event: RoomEvent) => void;
  /** the connection dropped; the transport reconnects on its own and sends a new hello */
  onError: (error: unknown) => void;
};

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
/** How many recent entries `transformSince` can reach back over. */
export const RECENT_ENTRIES = 2000;
/**
 * The presence heartbeat of a visible tab (SPEC-5-amendments A8 row 7): 25 s, under the roster's
 * 30 s stale mark (protocol.ts PRESENCE_STALE_MS), where the 5 s of SPEC-3 3.8 made 720 function
 * invocations an hour per open editor. A hidden tab posts no heartbeat (A8 row 8) and posts once
 * when it is shown again.
 */
export const HEARTBEAT_MS = 25_000;
/** A stream down this long with nothing answered reads as offline in the save words. */
export const OFFLINE_AFTER_MS = 3000;
/** How many own op ids the client remembers as settled, so a late echo of one is dropped. */
export const SETTLED_IDS_KEPT = 4000;

/** How a pending op ended: in the stream at a seq, or returned to its author. */
export type Settled = { seq: number } | { rejected: Rejected };

export type PendingOp = {
  /** the client's own id, assigned at flush; empty until then; kept from a persisted queue */
  opId: string;
  kind: 'edit' | 'comment';
  mutations?: Mutation[];
  comment?: CommentOp;
  label: string;
  /** sent in the POST in flight */
  inflight: boolean;
  /** the local clock the op was recorded at, for `transformSince` */
  at: number;
  /** resolves when the op is admitted or rejected */
  settle?: (outcome: Settled) => void;
};

export type RetainedOp = { opId: string; seq: number; mutations?: Mutation[] };

export type SyncStatus = {
  seq: number;
  /** the highest revision a write answer or a stream frame carried; never computed here (A3 item 1) */
  revision: number;
  pending: number;
  retained: number;
  tier: RealtimeTier;
  transport: 'sse' | 'poll' | 'none';
  connected: boolean;
  /** a POST failed, or the stream has been down for OFFLINE_AFTER_MS */
  offline: boolean;
  clientId: string | null;
  role: Role | null;
  /** editing connections at the last hello; at 100 the tab opens in Viewing mode (SPEC-3 0.9) */
  editing: number;
  overCeiling: boolean;
  /** how many refused writes were rebased onto the entries a 409 carried and posted again (A3 item 3) */
  rebased: number;
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

/** The op counter a tab keeps across a reload, so a kept client id never reuses a counter (A3 item 5). */
export type OpCounter = { next: () => number };

/** Whether the document is hidden, and a way to hear it change; the page's `document` by default. */
export type Visibility = {
  hidden: () => boolean;
  onChange: (listener: () => void) => () => void;
};

export type RoomClientOptions = {
  deckId: string;
  transport: RoomTransport;
  /** the document the editor was handed and its stream position */
  document: DeckDocument;
  seq: number;
  tier?: RealtimeTier;
  /**
   * The client id this tab holds (sessionStorage, SPEC-5-amendments A3 item 5): asked for on
   * every stream open; the server keeps it when it names this deck and this identity. The tab's
   * own persisted queue is recognised by it and replayed without a prompt.
   */
  clientId?: string;
  /** the op counter, persisted by the caller so a kept client id never repeats a counter; in memory by default */
  opCounter?: OpCounter;
  /** the client ids this tab held before this page (hotfix 2 cause B1); sent as `retire` on every open */
  retire?: readonly string[];
  pendingStore?: PendingStore;
  /** the page's visibility, for the heartbeat pause (A8 row 8); `document` when it exists */
  visibility?: Visibility;
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
  /**
   * A pending op that no longer applies after a remote change was returned to its author; the
   * entry that rewrote its text names who did (A3 item 8: the conflict card names the other author).
   */
  onUnplaceable?: (op: PendingOp, against?: Entry) => void;
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

/** The page's visibility when a `document` exists; never hidden and never changing otherwise (Node, the tests). */
export function documentVisibility(): Visibility {
  const doc = (globalThis as { document?: Document }).document;
  if (doc === undefined || typeof doc.addEventListener !== 'function') {
    return { hidden: () => false, onChange: () => () => undefined };
  }
  return {
    hidden: () => doc.visibilityState === 'hidden',
    onChange: (listener) => {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
  };
}

/** An op counter that lives with the client: the default when the caller persists none. */
export function memoryOpCounter(start = 0): OpCounter {
  let counter = start;
  return { next: () => (counter += 1) };
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
  /** the tab's own op ids the stream or an answer settled, so a late echo repeats nothing */
  const settledIds = new Set<string>();
  let rebased = 0;
  const visibility: Visibility = options.visibility ?? documentVisibility();
  let stopVisibility: (() => void) | null = null;
  let offlineTimer: unknown;
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
  const myClientIds = new Set<string>(options.clientId === undefined ? [] : [options.clientId]);
  const opCounter: OpCounter = options.opCounter ?? memoryOpCounter();
  let clock = 0;
  let role: Role | null = null;
  let editing = 0;
  let overCeiling = false;
  let connected = false;
  let offline = false;
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
  let roster: RosterEntry[] = [];
  let presence: Omit<PresencePost, 'clientId' | 'clock'> = { pointerOn: false, presenting: false };
  // the clock starts at the wall clock so a reload's first state outranks the row the earlier
  // page left under the same client id (the roster keeps the newer clock, SPEC-3 3.8)
  let presenceClock = Math.max(0, Math.floor(now()));
  let presenceTimer: unknown;
  let presenceDirty = false;
  let heartbeatTimer: unknown;
  const rejects: (Rejected & { mutations?: Mutation[] })[] = [];
  /** The stream seq at each local clock, so `transformSince` knows which entries came after. */
  const recentMarkers = new Map<number, number>();
  /** the id the queue is stored under: the tab's own, known before the hello when the tab kept one */
  const ownId = (): string | null => clientId ?? options.clientId ?? null;
  const persistKey = (): string => pendingKey(deckId, ownId() ?? 'unbound');

  const status = (): SyncStatus => ({
    seq,
    revision,
    pending: pending.length,
    retained: retained.length,
    tier,
    transport: 'sse',
    connected,
    offline,
    clientId,
    role,
    editing,
    overCeiling,
    rebased,
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
        ...(op.inflight ? { sent: true } : {}),
      })),
    ];
    const queue: PersistedQueue = {
      key: persistKey(),
      deckId,
      clientId: ownId() ?? 'unbound',
      savedAt: new Date(now()).toISOString(),
      entries,
    };
    void store.save(queue).catch(() => undefined);
  };

  /** The local document from the server document and the pending ops; an op that no longer applies is returned to its author. */
  const fold = (): { document: DeckDocument; changed: readonly string[] | 'all' } => {
    let document = server;
    const kept: PendingOp[] = [];
    let changed: readonly string[] | 'all' = [];
    const touched = new Set<string>();
    for (const op of pending) {
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
      }
    }
    pending = kept;
    return { document, changed: changed === 'all' ? 'all' : [...touched] };
  };

  const remember = (entry: Entry): void => {
    recent.push(entry);
    if (recent.length > RECENT_ENTRIES) recent.splice(0, recent.length - RECENT_ENTRIES);
  };

  /** Remembers an own op id as settled, bounded. */
  const noteSettled = (opId: string): void => {
    settledIds.add(opId);
    if (settledIds.size > SETTLED_IDS_KEPT) {
      const oldest = settledIds.values().next().value;
      if (oldest !== undefined) settledIds.delete(oldest);
    }
  };

  /**
   * One admitted entry in stream order. An entry of this tab (its client id, from the POST
   * answer, the same instance's stream or a record's echo from another instance whose op id
   * names the batch, src/op-ids.ts) is an acknowledgement: the ops it names settle, the retained
   * set takes them and the server document takes the mutations once; an echo whose every op this
   * tab settled already moves the position and nothing else (A3 items 5 and 6). Another author's
   * entry moves the pending text ops past it and re-derives the local document.
   */
  const applyEntry = (entry: Entry): void => {
    if (entry.seq !== seq) appliedAtSeq.clear();
    seq = entry.seq;
    // on the blob tier the seq is the revision the record made (blob.ts), so an op frame is a
    // revision the stream delivered (A3 item 1); the checkpoint frame that follows agrees
    if (tier === 'blob' && entry.kind === 'edit' && entry.seq > revision) revision = entry.seq;
    appliedAtSeq.add(entry.opId);
    remember(entry);
    const mine = myClientIds.has(entry.clientId);
    const ids = mine ? opIdsOfBatch(entry.opId) : [];
    for (const id of ids) appliedAtSeq.add(id);
    if (entry.kind === 'comment') {
      if (mine) {
        pending.find((op) => op.opId === entry.opId)?.settle?.({ seq: entry.seq });
        pending = pending.filter((op) => op.opId !== entry.opId);
        noteSettled(entry.opId);
      }
      options.onEvent?.({ type: 'op', entry });
      persist();
      emitStatus();
      return;
    }
    const mutations = entry.mutations ?? [];
    // a store entry (the follower's copy of a record) that the document holds already is skipped
    if (entry.clientId === 'store' && entry.rev < server.deck.revision) return;
    if (mine) {
      const named = new Set(ids.length > 0 ? ids : [entry.opId]);
      const owns = pending.filter((op) => named.has(op.opId));
      const known = [...named].every((id) => settledIds.has(id));
      if (owns.length === 0 && known) {
        // a late echo of a batch this tab settled already: the position moved, the document did
        persist();
        emitStatus();
        return;
      }
      pending = pending.filter((op) => !named.has(op.opId));
      for (const own of owns) own.settle?.({ seq: entry.seq });
      for (const id of named) {
        noteSettled(id);
        retained.push({ opId: id, seq: entry.seq, ...(id === entry.opId ? { mutations } : {}) });
      }
      let next: DeckDocument;
      try {
        next = applyMutations(server, mutations, { now: entry.at }).document;
      } catch {
        next = server;
      }
      server = next;
      // the fast path: the admitted form equals the pending one and it was first in line
      const own = owns[0];
      if (
        owns.length === 1 &&
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
        options.onUnplaceable?.(op, entry);
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
      // an entry this copy cannot apply: the server document is behind; a resync will follow
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
  };

  /**
   * One entry off the wire (the stream or an ops POST answer). Below the position it is a
   * duplicate. At the position it is a sibling of a batch the blob tier committed as one
   * revision (hotfix 2 cause A2) and is applied unless its op id was applied already; a store
   * echo (`clientId: 'store'`, the record's folded mutations) at the position repeats what the
   * batch's entries already carried and is dropped. Above the position it is buffered by seq.
   */
  const take = (entry: Entry, source: 'stream' | 'answer' = 'stream'): void => {
    if (
      source === 'answer' &&
      myClientIds.has(entry.clientId) &&
      (entry.seq < seq || (entry.seq === seq && appliedAtSeq.has(entry.opId)))
    ) {
      // an answer that names an op at or below the position: the op landed before (a replayed
      // POST, a persisted queue re-sent after its entry arrived), so it settles here and is never
      // left pending under Saving (A3 item 4)
      const named = new Set(opIdsOfBatch(entry.opId));
      named.add(entry.opId);
      const owns = pending.filter((op) => named.has(op.opId));
      if (owns.length > 0) {
        pending = pending.filter((op) => !named.has(op.opId));
        for (const own of owns) {
          own.settle?.({ seq: entry.seq });
          noteSettled(own.opId);
        }
        const folded = fold();
        emitChange(folded.document, 'all', 'ack');
        persist();
        emitStatus();
      }
      return;
    }
    if (entry.seq < seq) return;
    if (entry.seq === seq) {
      if (entry.clientId === 'store' || appliedAtSeq.has(entry.opId)) return;
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
    retained = [];
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
        clientId = event.clientId;
        myClientIds.add(event.clientId);
        clearOfflineTimer();
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
        offline = false;
        backoff = 0;
        if (event.revision > revision) revision = event.revision;
        if (event.seq < seq) {
          // the stream was reset behind this client; reload at the server's revision
          seq = event.seq;
          appliedAtSeq.clear();
          void resync(event.revision);
        }
        // ops sent on a connection that died are re-sent under the new client id once the
        // replay has shown which of them landed
        for (const op of pending) op.inflight = false;
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
          void resync(event.revision);
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
        const rest = roster.filter((row) => row.clientId !== event.clientId);
        roster = [...rest, event.state];
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
        void resync(event.revision);
        return;
      case 'inbox':
      case 'access':
        options.onEvent?.(event);
        return;
    }
  };

  // -------------------------------------------------------------------------------------------
  // Sending

  const nextOpId = (): string => `${clientId ?? 'unbound'}:${opCounter.next()}`;

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
    if (clientId === null || !connected) return;
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
    posting = (async () => {
      let response: OpsResponse;
      try {
        response = await transport.postOps(body);
      } catch (error) {
        void error;
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
        for (const entry of response.entries) take(entry, 'answer');
        for (const rejected of response.rejected) {
          const op = pending.find((row) => row.opId === rejected.opId);
          pending = pending.filter((row) => row.opId !== rejected.opId);
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
        // the rebase of A3 item 3: the 409 carries the entries since this client's base; they
        // apply as remote entries (the pending ops move past them with the transform, an echo of
        // this tab settles) and the pending ops post again on the new base at once. A 409 that
        // carries nothing, or one this client cannot reach the head from, reloads as before.
        const since = response.since ?? [];
        if (since.length > 0 && response.head !== undefined) {
          for (const entry of since) take(entry);
          if (seq >= response.head) {
            rebased += 1;
            if (response.head > revision) revision = response.head;
            persist();
            emitStatus();
            if (pending.some((op) => !op.inflight)) scheduleFlush('now');
            return;
          }
        }
        await resync(response.head ?? revision);
        return;
      }
      if (response.status === 429) {
        timers.setTimeout(() => void flush(), response.retryAfterMs ?? 1000);
        return;
      }
      if (response.status === 403 && response.code === 'client_unbound') {
        // the binding lapsed (a long sleep): the stream reconnects and a new hello rebinds
        connected = false;
        emitStatus();
        return;
      }
      // a refusal that will not change on a retry (a forbidden write): the ops return to the author
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
    });
    await posting;
  };

  // -------------------------------------------------------------------------------------------
  // Presence (SPEC-3 3.8): one batch per 80 ms, a heartbeat every 5 s

  const postPresence = async (): Promise<void> => {
    if (clientId === null || !connected) return;
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

  /**
   * The heartbeat (SPEC-3 3.8; A8 rows 7 and 8): every HEARTBEAT_MS while the tab is shown; a
   * hidden tab posts nothing (its row goes idle and then leaves the roster on its own, which is
   * what a person not looking at the deck is) and posts once when it is shown again.
   */
  const heartbeat = (): void => {
    heartbeatTimer = timers.setTimeout(() => {
      heartbeatTimer = undefined;
      if (stopped) return;
      if (!visibility.hidden()) void postPresence();
      heartbeat();
    }, HEARTBEAT_MS);
  };

  const clearOfflineTimer = (): void => {
    if (offlineTimer !== undefined) timers.clearTimeout(offlineTimer);
    offlineTimer = undefined;
  };

  /** The stream dropped: connected goes off now, offline after OFFLINE_AFTER_MS without a hello. */
  const streamDown = (): void => {
    connected = false;
    emitStatus();
    if (offlineTimer !== undefined || stopped) return;
    offlineTimer = timers.setTimeout(() => {
      offlineTimer = undefined;
      if (connected || stopped) return;
      offline = true;
      emitStatus();
    }, OFFLINE_AFTER_MS);
  };

  // -------------------------------------------------------------------------------------------
  // The persisted queue of an earlier tab (SPEC-3 0.7)

  /**
   * An op of a persisted queue back in the pending set with its op id kept: the server answers a
   * replayed id with its entry (the memory tier's tail, the blob tier's records) and appends the
   * rest, so nothing lands twice and nothing typed is lost.
   */
  const restore = (op: PersistedOp): void => {
    if (op.kind !== 'edit' || op.mutations === undefined) return;
    let result: ReturnType<typeof applyMutations>;
    try {
      result = applyMutations(local, op.mutations);
    } catch {
      return;
    }
    clock += 1;
    pending.push({
      opId: op.opId.startsWith(`${ownId() ?? 'unbound'}:`) ? op.opId : '',
      kind: 'edit',
      mutations: op.mutations,
      label: 'persisted',
      inflight: false,
      at: clock,
    });
    recentMarkers.set(clock, seq);
    local = result.document;
  };

  const offerPersisted = async (): Promise<void> => {
    const store = options.pendingStore;
    if (store === undefined) return;
    const queues = await store.load(deckId, now());
    // this tab's own queue (the same client id after a reload, SPEC-5-amendments A3 item 5):
    // what the earlier page had not seen acknowledged replays now, without a prompt, because it
    // is the same person on the same tab continuing; the server dedups what did land
    const own = queues.filter((queue) => queue.clientId === ownId() && unsavedCount(queue) > 0);
    if (own.length > 0 && !stopped) {
      let restored = 0;
      for (const queue of own) {
        for (const op of queue.entries) {
          if (op.seq !== undefined) continue;
          restore(op);
          restored += 1;
        }
        await store.remove(queue.key);
      }
      if (restored > 0) {
        emitChange(local, 'all', 'persisted');
        persist();
        emitStatus();
        scheduleFlush('now');
      }
    }
    if (options.onPersisted === undefined) return;
    const others = queues.filter((queue) => queue.clientId !== ownId() && unsavedCount(queue) > 0);
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
      stream = transport.open({
        since: seq,
        ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
        ...(options.retire === undefined || options.retire.length === 0
          ? {}
          : { retire: options.retire }),
        onEvent,
        onError: streamDown,
      });
      heartbeat();
      // a tab shown again posts its presence at once, so its row stops reading idle (A8 row 8)
      stopVisibility = visibility.onChange(() => {
        if (stopped || visibility.hidden()) return;
        presenceDirty = true;
        schedulePresence(0);
      });
      void offerPersisted();
    },
    async stop() {
      stopped = true;
      if (flushTimer !== undefined) timers.clearTimeout(flushTimer);
      if (presenceTimer !== undefined) timers.clearTimeout(presenceTimer);
      if (heartbeatTimer !== undefined) timers.clearTimeout(heartbeatTimer);
      clearOfflineTimer();
      stopVisibility?.();
      stopVisibility = null;
      // the queue first (a `pagehide` may end the page before any await below returns): every
      // pending op, sent or not, reaches the mirror so the reloaded tab replays it (A3 item 7)
      persist();
      // the leave goes first (a `pagehide` gives it no time to wait on a POST in flight; the
      // browser transport sends it with keepalive), then the POST in flight is awaited
      const leaving =
        clientId !== null && connected
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
      // the op holds its own copy of the list: a caller that keeps appending to the array it
      // passed (the editor's undo group coalesces a typing burst into the entry it made) must not
      // grow a pending op behind its back, else an op held while offline posts every later
      // keystroke twice (SPEC-5-amendments A3 item 7; sync.spec.ts's offline row)
      const own = [...mutations];
      const result = applyMutations(local, own);
      clock += 1;
      let settle: ((outcome: Settled) => void) | undefined;
      const settled = new Promise<Settled>((resolve) => {
        settle = resolve;
      });
      pending.push({
        opId: '',
        kind: 'edit',
        mutations: own,
        label,
        inflight: false,
        at: clock,
        ...(settle === undefined ? {} : { settle }),
      });
      emitChange(result.document, changedSlides(own), 'local');
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

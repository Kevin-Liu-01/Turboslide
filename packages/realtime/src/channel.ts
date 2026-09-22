// The realtime channel (gslides-parity SPEC-3 2.3, 3.2): the room of one deck, the operation
// stream in front of the revision log, the presence roster, the client bindings, the checkpoint
// lock, the budgets and the kill switch flags, behind one framework free interface with three
// implementations: `memory` (a checkout, the tests, one process), `redis` (hosted, the Redis
// protocol, one Lua compare and append) and `blob` (hosted without Redis, every append a commit).
// Nothing here reaches `node:`; the Redis adapter of redis.ts is the one file that may.
import type { CommentOp as SchemaCommentOp } from '@turboslide/schema/comments';
import type { Author, MarkMutation, Mutation, SpliceMutation } from '@turboslide/schema/mutations';

export const REALTIME_TIERS = ['memory', 'redis', 'blob'] as const;
export type RealtimeTier = (typeof REALTIME_TIERS)[number];

export type EntryKind = 'edit' | 'comment';

/**
 * SPEC-3 3.1's two text ops, the schema's own types since merge 1 (`@turboslide/schema/mutations`
 * carries `text.splice` and `text.mark`); the names stay for the callers of stage 1.
 */
export type TextSpliceMutation = SpliceMutation;
export type TextMarkMutation = MarkMutation;

/** Every mutation the stream carries: the seventeen of the schema, the two text ops included. */
export type RoomMutation = Mutation;

/** The comment operations of SPEC-3 5.2, one per `kind: 'comment'` entry. */
export const COMMENT_OPS = [
  'add',
  'reply',
  'edit',
  'delete',
  'resolve',
  'reopen',
  'assign',
  'reassign',
  'done',
  'react',
  'unreact',
  'move',
  'shift',
] as const;
export type CommentOpName = (typeof COMMENT_OPS)[number];

/**
 * A comment operation as the stream carries it: the schema's `CommentOp`
 * (`@turboslide/schema/comments`, B1). Every member names its thread (`add` inside `thread.id`).
 * The channel never reads the payload beyond the op name.
 */
export type CommentOp = SchemaCommentOp;

/** The thread a comment op names. */
export function commentThreadId(op: CommentOp): string {
  return op.op === 'add' ? op.thread.id : op.threadId;
}

/** One admitted entry of a deck's operation stream (SPEC-3 3.2). */
export type Entry = {
  /** the position in the stream, from 1 */
  seq: number;
  /** the revision the entry followed (the last checkpoint at admission) */
  rev: number;
  kind: EntryKind;
  author: Author;
  /**
   * the server issued client id (SPEC-3 3.3), or a fixed word for a writer without a tab; on the
   * blob tier a record that names its origin travels with its writer's id (blob.ts
   * `entryOfRecord`), a record without one as `store`
   */
  clientId: string;
  /** `<clientId>:<counter>`, the client's own id, deduplicated per (deck, client) */
  opId: string;
  mutations?: RoomMutation[];
  comment?: CommentOp;
  /** the admission time, ISO 8601 */
  at: string;
  /**
   * The op ids one blob tier record folded, in the order the client posted them (the sync round,
   * docs/SYNC.md 3.2; `VersionRecord.origin`): a record's stream entry carries `opId: store:<n>`
   * and every client op id it covers here, so a tab acknowledges its own ops by id from the
   * echo, the replay and the answer's `between`, and undo skips the own echo by `clientId`. A
   * resent POST is answered with one synthesized entry per covered op id at the record's seq
   * (apps/studio room.ts `admitOnBlob`), the first carrying the record's mutations and the rest
   * none, so a client applies the fold once. Absent on the memory and redis tiers and on a
   * record written before the round.
   */
  covers?: string[];
  /**
   * The history label an edit carries into Version history (the product round fix round;
   * docs/PRODUCT.md 4.1 "Brand kit: Primary", 6.1 "Assist: <sentence>"): the checkpointer
   * commits a noted entry as its own version record with this note, so the panel lists the row
   * by name. Absent on an ordinary edit, whose record's note stays '' (a named version is one
   * whose note is not empty, `@turboslide/store/store`).
   */
  note?: string;
};

/** What a writer hands `append`: everything but the seq the stream assigns. */
export type NewEntry = Omit<Entry, 'seq'>;

export type AppendResult =
  | { ok: true; entries: Entry[] }
  /**
   * The head moved: the writer reads `count` entries after `base` with `since`, transforms and
   * retries. With `locked`, another writer holds the deck's append lock (SPEC-3 3.4 step 5) and
   * this one waits for it before retrying, so a writer that missed twice gets its turn.
   */
  | { ok: false; head: number; count: number; locked?: boolean };

export type AppendOptions = {
  /** the append lock token this writer holds (admission.ts `appendWithRetry`); none by default */
  token?: string;
};

/** The share roles of SPEC-3 6.1; `@turboslide/schema/access` (B1) is the source of truth. */
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';

/** The trust states a mark shows (SPEC-3 0.19): a generated label, a typed name, a verified account, an agent. */
export type Trust = 'label' | 'guest' | 'verified' | 'agent';

export type CaretState = {
  blockId: string;
  path: string;
  offset?: number;
  range?: [number, number];
};

export type SelectionState = {
  /** at most 64 (SPEC-3 3.8) */
  blockIds: string[];
  caret?: CaretState;
};

/** Sheet units inside the 1600 by 900 sheet. */
export type PointerState = { x: number; y: number };

/** What a client posts about itself (SPEC-3 3.8); the identity fields are the server's. */
export type PresenceState = {
  clientId: string;
  /** increases with every change; a state with an older clock is dropped */
  clock: number;
  slideId?: string;
  selection?: SelectionState;
  pointer?: PointerState;
  /** the client this one follows */
  follow?: string;
  pointerOn: boolean;
  presenting: boolean;
};

/** The fields the server writes into the roster from the session (SPEC-3 3.8; report 10 F31). */
export type RosterIdentity = {
  principalId: string;
  label: string;
  trust: Trust;
  /** the mark spec `@turboslide/identity` draws (B3); opaque to the channel */
  mark: Record<string, unknown>;
  /** the hue slot the room granted, 0 to 5 */
  hueSlot: number;
  kind: 'human' | 'agent';
  role: Role;
};

export type RosterEntry = PresenceState & RosterIdentity;

/** The fixed reasons a rejected operation carries (report 10 F29). */
export const REJECT_REASONS = ['stale', 'invalid', 'forbidden', 'too-large', 'locked'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type CheckpointEvent = {
  type: 'checkpoint';
  revision: number;
  fromSeq: number;
  toSeq: number;
  /** the Blob snapshot key of the revision, when the store has one */
  snapshot?: string;
  author: Author;
  note: string;
  comments?: { revision: number; threadIds: string[] };
  /**
   * The revision was written outside the room (a strict agent write, a `version.restore`, a CLI
   * write on a checkout) and the stream holds no entries for it: a client whose document is behind
   * reloads at `revision` and rebases its pending operations (SPEC-3 3.6 reconnect; 3.7 c).
   */
  external?: true;
};

/** The messages down the stream (SPEC-3 3.3); every one is framed as one SSE event by protocol.ts. */
export type RoomEvent =
  | {
      type: 'hello';
      seq: number;
      revision: number;
      clientId: string;
      role: Role;
      clients: RosterEntry[];
      /** the count of editing connections; above 100 the tab opens in Viewing mode (SPEC-3 0.9) */
      editing: number;
      tier: RealtimeTier;
      /**
       * The last seq a checkpoint covered, as the instance knows it (the focus round, cycle 3
       * stream fix round; VERIFICATION SEAM-F8): a client trims the ops it retained at or
       * below it, since the `checkpoint` event that covered them may have fired while its
       * stream was down and a reopen's replay carries entries, not checkpoints. Absent from an
       * older server, and the client keeps what it retained.
       */
      covered?: number;
    }
  | { type: 'ops'; entries: Entry[] }
  | { type: 'op'; entry: Entry }
  | CheckpointEvent
  | { type: 'presence'; clientId: string; clock: number; state: RosterEntry }
  | { type: 'leave'; clientId: string }
  | {
      type: 'reject';
      opId: string;
      reason: RejectReason;
      mutations?: RoomMutation[];
      comment?: CommentOp;
      /** the validator's pointer, only for a slide the author may read */
      message?: string;
    }
  | { type: 'inbox'; unread: number; principalId?: string }
  | { type: 'access'; revision: number }
  | { type: 'resync'; revision: number }
  /**
   * The deck's store refused the room's poll (a 429, a 5xx, the deadline) and the poll is backing
   * off, or answered again after refusing (the focus round, cycle 3 fix round; VERIFICATION
   * C3-F2): a tab's title row reads Reconnecting while `ok` is false. `retryAfterMs` is the wait
   * before the next poll. The blob tier alone sends it; the other tiers have no store poll.
   */
  | { type: 'store'; ok: boolean; retryAfterMs?: number };

export type RoomEventType = RoomEvent['type'];

export type RoomListener = (event: RoomEvent) => void;

export type SubscribeOptions = {
  /** a listener of the instance's own (the room's live document), never a client's stream */
  passive?: boolean;
};

export type LockOptions = {
  /**
   * A held lock whose heartbeat is older than this is taken over (SPEC-3 0.8: a waiter breaks a
   * checkpoint lock whose heartbeat is older than 3 s). Absent, a held lock is never broken
   * before its TTL.
   */
  staleMs?: number;
};

export type BudgetResult = { ok: boolean; retryAfterMs: number };

export type TrimOptions = {
  /** drop every entry with a seq below this one */
  minSeq?: number;
  /** keep at most this many entries (an approximate bound on Redis) */
  maxEntries?: number;
};

export type PresenceChannel = {
  /** writes a client's roster entry with its identity fields, alive for `ttlMs`, and announces it */
  set: (deckId: string, clientId: string, state: RosterEntry, ttlMs: number) => Promise<void>;
  /** the live entries, expired ones dropped */
  roster: (deckId: string) => Promise<RosterEntry[]>;
  /**
   * removes a client's entry and announces `leave`; `clock` is the leave beacon's clock (room-client
   * `stop`, above every set of that tab), which the blob tier keeps in the tombstone so a set of
   * the same tab landing after the leave never brings the row back (return/build/b7.md B7-R3);
   * the memory and redis tiers ignore it
   */
  leave: (deckId: string, clientId: string, clock?: number) => Promise<void>;
  /** binds a server issued client id to the session that opened the stream (report 10 F26) */
  bind: (deckId: string, clientId: string, sessionId: string, ttlMs: number) => Promise<void>;
  /** the session a client id is bound to, or null when unbound or expired */
  owner: (deckId: string, clientId: string) => Promise<string | null>;
};

export type RealtimeChannel = {
  readonly tier: RealtimeTier;
  /**
   * Appends entries after `base` when `base` is the head; otherwise answers the head and how
   * many entries the writer must read and transform against before it retries (SPEC-3 3.4 step
   * 5; report 10 F34: never the entries themselves).
   */
  append: (
    deckId: string,
    base: number,
    entries: NewEntry[],
    options?: AppendOptions,
  ) => Promise<AppendResult>;
  /** the entries after `seq`, oldest first, at most `limit` */
  since: (deckId: string, seq: number, limit: number) => Promise<Entry[]>;
  /** the last seq of the stream, 0 for an empty one */
  head: (deckId: string) => Promise<number>;
  /**
   * Delivers every admitted `op`, every presence change and every published event of the deck
   * to the listener, in stream order; the return value unsubscribes. One subscription per
   * instance per deck on Redis, however many listeners (report 10 F24). A `passive` listener
   * (the room's own, for its live document) holds no poll of the store on the blob tier: the
   * store is polled while a client stream of the deck is open on the instance and never
   * otherwise (the focus round, cycle 3 fix round, the blob tier budget); the other tiers
   * ignore the option.
   */
  subscribe: (deckId: string, onEvent: RoomListener, options?: SubscribeOptions) => () => void;
  /** announces an event to every instance's listeners (the checkpointer's `checkpoint`, `access`, `inbox`) */
  publish: (deckId: string, event: RoomEvent) => Promise<void>;
  /** drops retained entries after a checkpoint (SPEC-3 3.7 d, `XTRIM`) */
  trim: (deckId: string, options: TrimOptions) => Promise<void>;
  presence: PresenceChannel;
  /** takes a lock for `ttlMs` with a random token; false while another token holds it */
  lock: (key: string, token: string, ttlMs: number, options?: LockOptions) => Promise<boolean>;
  /** refreshes the holder's heartbeat and TTL; false when the token no longer holds the lock */
  heartbeat: (key: string, token: string) => Promise<boolean>;
  /** releases the lock when the token holds it; another holder's lock is left alone */
  unlock: (key: string, token: string) => Promise<void>;
  /**
   * Counts `cost` against a fixed window budget under `key` (the window is part of the key,
   * keys.ts `budgetKey`); over `limit` the answer is not ok with the time until the window ends.
   */
  budget: (key: string, cost: number, limit: number, windowMs: number) => Promise<BudgetResult>;
  /** a kill switch (SPEC-3 0.33); on by default, `realtime` reads as off when Redis is unreachable */
  flag: (name: string) => Promise<boolean>;
  /** closes subscriptions and connections */
  close: () => Promise<void>;
};

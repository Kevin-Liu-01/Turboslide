// The blob channel (gslides-parity SPEC-3 2.5, 3.7 e; report 02 7.7): the reduced tier for a
// deployment without Redis and the automatic fallback while Redis is unreachable. There is no
// stream: every append is one commit through the deck's store (`BlobStore.write` hosted, a
// `FileStore` on a checkout), so the seq of an entry is the revision its record made, `since`
// reads the version log, `head` is the revision, and `subscribe` follows the store's watch
// channel (the Blob mirror's head poll, `fs.watch` on a checkout). Locks, budgets and flags are
// per instance, from memory.ts. Presence is the memory roster of each instance joined through one
// record in the Blob store (gslides-parity SPEC-5-amendments A3 item 6, A8 row 4; B7): every
// instance merges the rows it holds into the deck's roster file (`.turboslide/presence.json`, a
// compare and swap on the store's etag) inside the request that changed them, at most once a
// second per deck per instance, reads the file on a poll while it streams the deck (one head call;
// the body only when the version moved) and before a hello, and merges the other instances' rows
// into its roster as `presence` and `leave` frames. One file, read by name, because the store's
// listing lags a write by up to a minute and a timer on a fluid compute instance with no request
// in flight never fires (VERIFICATION-5 finding 14). Chat messages (SPEC-5 10; finding 3) are
// numbered files under `.turboslide/chat/`, appended with a create only put so two instances
// never take one number, read past the last known number by name, merged into `since` at the
// revision they were sent at, and announced to this instance's streams on the same poll; they
// move no revision and never reach the version log. A store without state files (a checkout's
// FileStore) keeps the per instance roster and a per instance chat. Comment entries go straight to
// the sidecar through `applyComments`, which the comments store supplies (SPEC-3 5.2); without it
// a comment entry is refused. No `node:`.
import { ConflictError } from '@turboslide/schema/errors';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import type {
  AppendResult,
  Entry,
  NewEntry,
  PresenceChannel,
  RealtimeChannel,
  RoomEvent,
  RoomListener,
  RoomMutation,
  RosterEntry,
} from './channel.ts';
import { foldMutation } from './coalesce.ts';
import type { FlagName } from './keys.ts';
import { checkDeckId } from './keys.ts';
import { memoryChannel } from './memory.ts';
import type { MemoryChannel } from './memory.ts';
import { batchOpId } from './op-ids.ts';
import { PRESENCE_EXPIRY_MS, REPLAY_MAX_ENTRIES } from './protocol.ts';

export { batchOpId, opIdsOfBatch } from './op-ids.ts';

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
  /**
   * This instance's name in the shared roster (SPEC-5-amendments A3 item 6): the rows it carries
   * in the roster file name it. A random id per process by default; the tests name two.
   */
  instanceId?: string;
  /** the least time between two roster file writes of one deck; PRESENCE_SHARD_WRITE_MS by default */
  presenceWriteMs?: number;
  /** how often the roster file and the chat are read while a stream is open; PRESENCE_SHARD_POLL_MS by default */
  presencePollMs?: number;
};

/** The least time between two roster file writes of one deck on one instance. */
export const PRESENCE_SHARD_WRITE_MS = 1000;
/** How often an instance streaming a deck reads the roster file and the chat. */
export const PRESENCE_SHARD_POLL_MS = 3000;
/** How many compare and swap rounds a roster write takes before it gives up for this round. */
export const ROSTER_WRITE_ATTEMPTS = 4;
/** The least time between two chat reads of one deck on one instance (a `since` call, the panel's two second poll). */
export const CHAT_PROBE_MIN_MS = 500;
/** How many chat files one read walks past the last known number before it stops (the rest on the next read). */
export const CHAT_READ_MAX_FILES = 64;
/** How many numbers a chat append tries when another instance took the ones it wanted. */
export const CHAT_APPEND_ATTEMPTS = 50;

/** The roster file of a deck, under the state folder the mirror never pulls. */
export const ROSTER_FILE = 'presence.json';
/** The chat folder of a deck, under the same state folder: `chat/<n>.json`, n from 1. */
export const CHAT_DIR = 'chat';

/** The state file functions of `@turboslide/store/blob-store`'s BlobStore, duck typed like `noteDelivered` (a FileStore has none). */
type StateFile = { name: string; version: string; bytes: Uint8Array; proven: boolean };
type StateFileKnown = { version: string; bytes: Uint8Array };
type StateStore = DeckStore & {
  readStateFile?: (name: string, known?: StateFileKnown) => Promise<StateFile | null>;
  putStateFile?: (
    name: string,
    bytes: Uint8Array,
    options?: { ifMatch?: string; create?: boolean },
  ) => Promise<{ version: string }>;
  deleteStateFile?: (name: string) => Promise<void>;
  listStateFiles?: (folder: string) => Promise<{ name: string; version: string }[]>;
};

/**
 * One row of the roster file: a tab's state with the instance that carries it and the time of
 * the tab's last presence post, or (`left`) a leave an instance announced at `at`, kept for the
 * roster's expiry so the instance that still carries the row in memory drops it (a tab's posts
 * and its leave land on different instances of fluid compute).
 */
type RosterFileRow = {
  clientId: string;
  instanceId: string;
  at: string;
  state?: RosterEntry;
  left?: true;
};
type RosterFile = { v: 1; rows: RosterFileRow[] };

export type BlobChannel = RealtimeChannel & {
  setFlag: MemoryChannel['setFlag'];
  /**
   * The shared roster's hooks (SPEC-5-amendments A3 item 6): the instance id, the read of the
   * roster file and the chat, and the write of this instance's rows, both run by the channel on
   * their own cadence and callable by a test or a route that wants the roster fresh now.
   */
  sharedRoster: {
    readonly instanceId: string;
    poll: (deckId: string) => Promise<void>;
    flush: (deckId: string) => Promise<void>;
  };
};

type DeckState = {
  chain: Promise<unknown>;
  lastWriteAt: number;
  /** the last revision delivered to this instance's listeners */
  lastSeq: number;
  watching: Promise<() => void> | undefined;
  store: Promise<DeckStore> | undefined;
  /** the shared roster (SPEC-5-amendments A3 item 6): the client ids whose rows this instance carries in the roster file */
  ownRows: Set<string>;
  /** the client ids this instance learnt from the roster file, with the clock and the post time it took */
  remoteRows: Map<string, { clock: number; at: number }>;
  /** when each row this instance carries was last set here (the row's `at` in the file) */
  rowSetAt: Map<string, number>;
  /** leaves announced here, by client id, at the channel clock: a row written before the leave never comes back */
  tombstones: Map<string, number>;
  rosterDirty: boolean;
  rosterTimer: unknown;
  rosterWriting: Promise<void>;
  lastRosterWriteAt: number;
  pollTimer: unknown;
  lastPollAt: number;
  /** the roster file as last read, so an unchanged version costs one head call */
  rosterKnown: StateFileKnown | undefined;
  /** whether the store holds state files; undefined until the store answered */
  sharing: boolean | undefined;
  /** the chat messages read or written on this instance, by file number */
  chat: Map<number, Entry>;
  /** the highest chat number read past (0 before any read); undefined before the first read walked the listing */
  chatLast: number | undefined;
  lastChatReadAt: number;
  chatReading: Promise<void> | null;
  /** the chat message ids this instance's streams were given already */
  chatAnnounced: Set<string>;
  /** a store without state files keeps the chat here, per instance */
  chatMemory: Entry[];
};

/** A store whose mirror takes the delivered revision (the BlobStore of @turboslide/store; a checkout's FileStore has no mirror). */
type DeliveryAware = DeckStore & { noteDelivered?: (revision: number) => void };

/**
 * Tells the store's mirror which revision the room delivered to this instance (gslides-parity
 * SPEC-5-amendments A3 items 2 and 6): the mirror serves reads at that revision without a head
 * call and reads the head again once a higher revision is announced or committed.
 */
function noteDelivered(store: DeckStore, revision: number): void {
  (store as DeliveryAware).noteDelivered?.(revision);
}

/**
 * A record as one stream entry: the writer's author, its folded mutations, the revision as the
 * seq. A record the blob tier committed for a tab (store.ts `WriteOptions.origin`) carries that
 * tab's client id and its batch as `batchOpId`, so the author's tab reads its own echo as an
 * acknowledgement (A3 item 5); a record from anywhere else is the store's, `store:<n>`.
 */
export function entryOfRecord(record: VersionRecord): Entry {
  const batch =
    record.clientId !== undefined && record.opIds !== undefined
      ? batchOpId(record.clientId, record.opIds)
      : null;
  return {
    seq: record.revision,
    rev: record.baseRevision,
    kind: 'edit',
    author: record.author,
    clientId: batch === null ? 'store' : (record.clientId as string),
    opId: batch ?? `store:${record.n}`,
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

/**
 * A state file write another instance won (matched by name; the store's classes import
 * `node:fs`): the compare and swap's precondition, or the create only put meeting a name taken.
 */
export function isLostWrite(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'BlobPreconditionError' || error.name === 'BlobExistsError')
  );
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
        ownRows: new Set(),
        remoteRows: new Map(),
        rowSetAt: new Map(),
        tombstones: new Map(),
        rosterDirty: false,
        rosterTimer: undefined,
        rosterWriting: Promise.resolve(),
        lastRosterWriteAt: 0,
        pollTimer: undefined,
        lastPollAt: 0,
        rosterKnown: undefined,
        sharing: undefined,
        chat: new Map(),
        chatLast: undefined,
        lastChatReadAt: 0,
        chatReading: null,
        chatAnnounced: new Set(),
        chatMemory: [],
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

  // -------------------------------------------------------------------------------------------
  // The shared roster (SPEC-5-amendments A3 item 6, A8 row 4): the memory roster of this instance,
  // joined with the other instances' through one roster file in the store

  const instanceId =
    deps.instanceId ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${now().toString(16)}${Math.random().toString(16).slice(2)}`);
  const writeMs = deps.presenceWriteMs ?? PRESENCE_SHARD_WRITE_MS;
  const pollMs = deps.presencePollMs ?? PRESENCE_SHARD_POLL_MS;
  const timers = {
    set: (fn: () => void, ms: number): unknown => {
      const t = setTimeout(fn, ms) as unknown as { unref?: () => void };
      t.unref?.();
      return t;
    },
    clear: (t: unknown): void => clearTimeout(t as ReturnType<typeof setTimeout>),
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /** The store when it holds state files, null otherwise (a checkout's FileStore keeps the per instance roster and chat). */
  const stateStoreOf = async (deckId: string): Promise<Required<StateStore> | null> => {
    const state = stateOf(deckId);
    const store = (await storeOf(deckId)) as StateStore;
    const sharing =
      typeof store.readStateFile === 'function' &&
      typeof store.putStateFile === 'function' &&
      typeof store.deleteStateFile === 'function' &&
      typeof store.listStateFiles === 'function';
    state.sharing = sharing;
    return sharing ? (store as Required<StateStore>) : null;
  };

  /** A row of the roster file that reads: a live row with a roster entry, or a leave. */
  const rosterRowOf = (raw: unknown): RosterFileRow | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Partial<RosterFileRow>;
    if (typeof row.clientId !== 'string' || typeof row.instanceId !== 'string') return null;
    if (typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))) return null;
    if (row.left === true)
      return { clientId: row.clientId, instanceId: row.instanceId, at: row.at, left: true };
    if (typeof row.state !== 'object' || row.state === null) return null;
    const state = row.state as Partial<RosterEntry>;
    if (typeof state.clientId !== 'string' || typeof state.clock !== 'number') return null;
    if (typeof state.principalId !== 'string') return null;
    return { clientId: row.clientId, instanceId: row.instanceId, at: row.at, state: row.state };
  };

  /** The rows of a roster file body; an unreadable body is an empty roster. */
  const rosterRowsOf = (bytes: Uint8Array): RosterFileRow[] => {
    try {
      const parsed = JSON.parse(decoder.decode(bytes)) as Partial<RosterFile>;
      if (!Array.isArray(parsed.rows)) return [];
      return parsed.rows.map(rosterRowOf).filter((row): row is RosterFileRow => row !== null);
    } catch {
      return [];
    }
  };

  /** A row older than the roster's expiry counts for nothing: its tab, or the instance that carried it, went away. */
  const expired = (row: RosterFileRow, t: number): boolean =>
    t - Date.parse(row.at) > PRESENCE_EXPIRY_MS;

  /**
   * The file's rows per client, resolved: the newest live row (by the tab's clock) and the
   * newest leave (by time); a leave at or after the live row's post is the last word. This
   * instance's own live rows are left out (its memory roster is their truth), its own leaves are
   * read like any other.
   */
  const resolveRows = (
    rows: RosterFileRow[],
    t: number,
  ): Map<string, { live: RosterFileRow | null; left: RosterFileRow | null }> => {
    const out = new Map<string, { live: RosterFileRow | null; left: RosterFileRow | null }>();
    for (const row of rows) {
      if (expired(row, t)) continue;
      const slot = out.get(row.clientId) ?? { live: null, left: null };
      if (row.left === true) {
        if (slot.left === null || Date.parse(slot.left.at) < Date.parse(row.at)) slot.left = row;
      } else if (row.instanceId !== instanceId && row.state !== undefined) {
        if (slot.live === null || (slot.live.state?.clock ?? 0) < row.state.clock) slot.live = row;
      }
      out.set(row.clientId, slot);
    }
    return out;
  };

  /**
   * Merges the roster file into this instance's roster: a live row this instance does not hold,
   * or holds at an older clock, is set locally (the memory roster delivers the `presence` frame
   * to this instance's streams); a leave at or after the post of a row held here (own or learnt)
   * leaves locally, so the instance that carried the tab's row forgets it once the tab's leave
   * landed anywhere; a row learnt from the file that the file no longer carries leaves.
   */
  const mergeRoster = async (deckId: string, rows: RosterFileRow[]): Promise<void> => {
    const state = stateOf(deckId);
    const t = now();
    const resolved = resolveRows(rows, t);
    const roster = await local.presence.roster(deckId);
    const current = new Map(roster.map((row) => [row.clientId, row]));
    const seen = new Set<string>();
    for (const [clientId, { live, left }] of resolved) {
      const leftAt = left === null ? Number.NEGATIVE_INFINITY : Date.parse(left.at);
      const liveAt = live === null ? Number.NEGATIVE_INFINITY : Date.parse(live.at);
      if (left !== null && (live === null || liveAt <= leftAt)) {
        // a leave is the last word on this client in the file; a row set here after it stays
        const setAt = state.rowSetAt.get(clientId) ?? state.remoteRows.get(clientId)?.at;
        if (current.has(clientId) && (setAt === undefined || setAt <= leftAt)) {
          state.ownRows.delete(clientId);
          state.rowSetAt.delete(clientId);
          state.remoteRows.delete(clientId);
          if (state.tombstones.get(clientId) === undefined) state.tombstones.set(clientId, leftAt);
          await local.presence.leave(deckId, clientId);
        }
        continue;
      }
      if (live === null || live.state === undefined) continue;
      const tomb = state.tombstones.get(clientId);
      if (tomb !== undefined && tomb >= liveAt) continue;
      seen.add(clientId);
      const held = current.get(clientId);
      if (held !== undefined && held.clock >= live.state.clock) continue;
      // the row moved to the instance that saw the newer clock
      if (state.ownRows.delete(clientId)) {
        state.rowSetAt.delete(clientId);
        state.rosterDirty = true;
      }
      state.remoteRows.set(clientId, { clock: live.state.clock, at: liveAt });
      await local.presence.set(deckId, clientId, live.state, PRESENCE_EXPIRY_MS);
    }
    for (const clientId of [...state.remoteRows.keys()]) {
      if (seen.has(clientId) || state.ownRows.has(clientId)) continue;
      state.remoteRows.delete(clientId);
      await local.presence.leave(deckId, clientId);
    }
    // tombstones older than the expiry have done their work
    for (const [clientId, at] of state.tombstones)
      if (t - at > PRESENCE_EXPIRY_MS) state.tombstones.delete(clientId);
  };

  /**
   * Writes this instance's rows into the roster file now: read the file (proven against its
   * etag), merge what the other instances wrote, carry their unexpired rows and leaves forward,
   * write this instance's live rows at the time of their last post and its leaves, and put with
   * `ifMatch` (or create the file). A precondition failure is another instance's write landing
   * first: read and merge again, up to ROSTER_WRITE_ATTEMPTS. The merged rows of the other
   * instances reach this instance's roster on the way, so a write is also a read.
   */
  const writeRoster = async (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    state.rosterDirty = false;
    state.lastRosterWriteAt = now();
    const store = await stateStoreOf(deckId);
    if (store === null) return;
    for (let attempt = 0; attempt < ROSTER_WRITE_ATTEMPTS; attempt++) {
      const read = await store.readStateFile(ROSTER_FILE, state.rosterKnown);
      if (read !== null && !read.proven) {
        // the CDN has not caught up with the last write: never a compare and swap on a stale body
        await sleep(50 * (attempt + 1));
        continue;
      }
      const rows = read === null ? [] : rosterRowsOf(read.bytes);
      await mergeRoster(deckId, rows);
      const roster = await local.presence.roster(deckId);
      const live = new Map(roster.map((row) => [row.clientId, row]));
      for (const id of [...state.ownRows]) if (!live.has(id)) state.ownRows.delete(id);
      const t = now();
      const next: RosterFileRow[] = [];
      for (const row of rows) {
        if (row.instanceId === instanceId || expired(row, t)) continue;
        const at = Date.parse(row.at);
        if (row.left === true) {
          // another instance's leave stays until it expires, unless a row set here is newer
          const setAt = state.ownRows.has(row.clientId)
            ? state.rowSetAt.get(row.clientId)
            : undefined;
          if (setAt !== undefined && setAt > at) continue;
          next.push(row);
          continue;
        }
        const tomb = state.tombstones.get(row.clientId);
        if (tomb !== undefined && tomb >= at) continue;
        const own = state.ownRows.has(row.clientId) ? live.get(row.clientId) : undefined;
        // a row this instance carries at a clock at least the file's is this instance's now
        if (own !== undefined && own.clock >= (row.state?.clock ?? 0)) continue;
        if (own !== undefined) {
          state.ownRows.delete(row.clientId);
          state.rowSetAt.delete(row.clientId);
        }
        next.push(row);
      }
      for (const clientId of state.ownRows) {
        const entry = live.get(clientId);
        if (entry === undefined) continue;
        const at = new Date(state.rowSetAt.get(clientId) ?? t).toISOString();
        next.push({ clientId, instanceId, at, state: entry });
      }
      for (const [clientId, at] of state.tombstones) {
        if (t - at > PRESENCE_EXPIRY_MS || state.ownRows.has(clientId)) continue;
        if (
          next.some(
            (row) => row.left === true && row.clientId === clientId && Date.parse(row.at) >= at,
          )
        )
          continue;
        next.push({ clientId, instanceId, at: new Date(at).toISOString(), left: true });
      }
      const bytes = encoder.encode(JSON.stringify({ v: 1, rows: next } satisfies RosterFile));
      try {
        const put =
          read === null
            ? await store.putStateFile(ROSTER_FILE, bytes, { create: true })
            : await store.putStateFile(ROSTER_FILE, bytes, { ifMatch: read.version });
        state.rosterKnown = { version: put.version, bytes };
        return;
      } catch (error) {
        if (!isLostWrite(error)) throw error;
        // another instance wrote first: the next round reads its rows
        state.rosterKnown = undefined;
      }
    }
    // the rounds ran out: the next change or poll writes again
    state.rosterDirty = true;
  };

  /** Runs `writeRoster` on the deck's write chain, one at a time, errors reported and swallowed. */
  const flushRoster = (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    if (state.rosterTimer !== undefined) {
      timers.clear(state.rosterTimer);
      state.rosterTimer = undefined;
    }
    state.rosterWriting = state.rosterWriting
      .then(() => writeRoster(deckId))
      .catch((error: unknown) =>
        onError(error, `blob: writing the roster file of ${deckId} failed`),
      );
    return state.rosterWriting;
  };

  /**
   * A roster change on this instance: written inside the request when the last write is older
   * than the spacing (a timer on a fluid compute instance with no request in flight never fires,
   * finding 14), else scheduled for when the spacing allows; `leave` waits for the spacing and
   * writes inside the request every time, since a leave is the last word a tab says.
   */
  const noteRosterChange = async (deckId: string, urgent: boolean): Promise<void> => {
    const state = stateOf(deckId);
    state.rosterDirty = true;
    if (state.sharing === false) return;
    const wait = state.lastRosterWriteAt + writeMs - now();
    if (wait <= 0) {
      await flushRoster(deckId);
      return;
    }
    if (urgent) {
      await sleep(wait);
      await flushRoster(deckId);
      return;
    }
    if (state.rosterTimer !== undefined) return;
    state.rosterTimer = timers.set(() => {
      state.rosterTimer = undefined;
      if (state.rosterDirty) void flushRoster(deckId);
    }, wait);
  };

  // -------------------------------------------------------------------------------------------
  // The chat (SPEC-5 10; VERIFICATION-5 finding 3): numbered files under the state folder

  /** The number of a chat file name (`chat/12.json` is 12), null for anything else. */
  const chatNumberOf = (name: string): number | null => {
    const match = /^chat\/([1-9][0-9]{0,9})\.json$/.exec(name);
    return match === null ? null : Number(match[1]);
  };

  const chatFileName = (n: number): string => `${CHAT_DIR}/${n}.json`;

  /** An entry of a chat file body: the stream entry as it was appended, or null. */
  const chatEntryOf = (bytes: Uint8Array): Entry | null => {
    try {
      const parsed = JSON.parse(decoder.decode(bytes)) as Partial<Entry>;
      if (parsed.kind !== 'chat' || typeof parsed.seq !== 'number') return null;
      if (typeof parsed.opId !== 'string' || typeof parsed.clientId !== 'string') return null;
      if (typeof parsed.chat !== 'object' || parsed.chat === null) return null;
      return parsed as Entry;
    } catch {
      return null;
    }
  };

  /**
   * Reads the chat messages this instance has not seen: the first read walks the store's listing
   * for a lower bound (it lags a write by up to a minute), then every read goes past the highest
   * number by name until a number is not stored. At most one read per CHAT_PROBE_MIN_MS per deck,
   * so the panel's two second poll and a replay's pages cost one head call between them.
   */
  const readChat = async (deckId: string, force = false): Promise<void> => {
    const state = stateOf(deckId);
    if (state.chatReading !== null) return state.chatReading;
    if (!force && now() - state.lastChatReadAt < CHAT_PROBE_MIN_MS) return;
    state.chatReading = (async () => {
      const store = await stateStoreOf(deckId);
      if (store === null) return;
      let last = state.chatLast;
      if (last === undefined) {
        last = 0;
        const listed = await store.listStateFiles(CHAT_DIR);
        for (const file of listed) {
          const n = chatNumberOf(file.name);
          if (n === null) continue;
          if (!state.chat.has(n)) {
            const read = await store.readStateFile(file.name);
            const entry = read === null ? null : chatEntryOf(read.bytes);
            if (entry !== null) state.chat.set(n, entry);
          }
          if (n > last) last = n;
        }
        state.chatLast = last;
      }
      for (let walked = 0; walked < CHAT_READ_MAX_FILES; walked++) {
        const n: number = last + 1;
        const read = await store.readStateFile(chatFileName(n));
        if (read === null) break;
        const entry = chatEntryOf(read.bytes);
        if (entry !== null) state.chat.set(n, entry);
        last = n;
        state.chatLast = n;
      }
      pruneChat(state);
      state.lastChatReadAt = now();
    })().finally(() => {
      state.chatReading = null;
    });
    return state.chatReading;
  };

  /** Keeps the newest REPLAY_MAX_ENTRIES messages on this instance: `chat.list` reads that window of the stream and no more. */
  const pruneChat = (state: DeckState): void => {
    if (state.chat.size <= REPLAY_MAX_ENTRIES) return;
    const numbers = [...state.chat.keys()].sort((a, b) => a - b);
    for (const n of numbers.slice(0, numbers.length - REPLAY_MAX_ENTRIES)) {
      const entry = state.chat.get(n);
      if (entry !== undefined) state.chatAnnounced.delete(entry.opId);
      state.chat.delete(n);
    }
  };

  /** The chat entries this instance knows, oldest first (by number, or by arrival on a store without state files). */
  const chatEntries = (deckId: string): Entry[] => {
    const state = stateOf(deckId);
    if (state.sharing === false) return state.chatMemory;
    return [...state.chat.entries()].sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
  };

  /**
   * Appends chat entries at the revision they were sent at: each takes the next free number with
   * a create only put, so two instances appending at once never share a number and no revision
   * moves. A store without state files keeps them in memory on this instance.
   */
  const appendChat = async (deckId: string, entries: Entry[]): Promise<void> => {
    const state = stateOf(deckId);
    const store = await stateStoreOf(deckId);
    if (store === null) {
      state.chatMemory.push(...entries);
      if (state.chatMemory.length > REPLAY_MAX_ENTRIES)
        state.chatMemory.splice(0, state.chatMemory.length - REPLAY_MAX_ENTRIES);
      return;
    }
    await readChat(deckId, true);
    for (const entry of entries) {
      const bytes = encoder.encode(JSON.stringify(entry));
      let stored = false;
      for (let attempt = 0; attempt < CHAT_APPEND_ATTEMPTS && !stored; attempt++) {
        const n = (state.chatLast ?? 0) + 1;
        try {
          await store.putStateFile(chatFileName(n), bytes, { create: true });
          state.chat.set(n, entry);
          state.chatLast = n;
          state.chatAnnounced.add(entry.opId);
          stored = true;
        } catch (error) {
          if (!isLostWrite(error)) throw error;
          // another instance took the number: read what it wrote and try the next
          await readChat(deckId, true);
          if ((state.chatLast ?? 0) < n) state.chatLast = n;
        }
      }
      if (!stored)
        throw new TypeError(
          `The chat of ${deckId} is busy; the message did not land, send it again`,
        );
    }
  };

  /** Hands this instance's streams the chat messages other instances appended since the last poll. */
  const announceChat = async (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    for (const entry of chatEntries(deckId)) {
      if (state.chatAnnounced.has(entry.opId)) continue;
      state.chatAnnounced.add(entry.opId);
      await local.publish(deckId, { type: 'op', entry });
    }
  };

  /**
   * Merges the chat entries into a `since` page: after `seq`, and inside the page's range when
   * the page filled its limit (the tail page carries every later message); a message sits after
   * the record of the revision it was sent at.
   */
  const withChat = (deckId: string, seq: number, limit: number, records: Entry[]): Entry[] => {
    const chats = chatEntries(deckId);
    if (chats.length === 0) return records;
    const last = records[records.length - 1]?.seq;
    const ceiling = records.length >= limit && last !== undefined ? last : Number.POSITIVE_INFINITY;
    const picked = chats.filter((entry) => entry.seq > seq && entry.seq <= ceiling);
    if (picked.length === 0) return records;
    const out = [...records, ...picked];
    const rank = (entry: Entry): number => (entry.kind === 'chat' ? 1 : 0);
    return out.sort((a, b) => a.seq - b.seq || rank(a) - rank(b));
  };

  /** The roster file and the chat, read once: the poll while a deck streams and the read before a hello. */
  const pollShared = async (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    state.lastPollAt = now();
    const store = await stateStoreOf(deckId);
    if (store === null) return;
    if (state.rosterDirty && state.lastRosterWriteAt + writeMs <= now()) {
      // a change a frozen timer never wrote leaves with this request
      await flushRoster(deckId);
    } else {
      const read = await store.readStateFile(ROSTER_FILE, state.rosterKnown);
      if (read !== null && !read.proven) {
        // the CDN has not caught up with the last write: this poll keeps what it had, the next
        // one reads again (a stale body could redraw a row a newer version removed)
      } else {
        if (read !== null) state.rosterKnown = { version: read.version, bytes: read.bytes };
        await mergeRoster(deckId, read === null ? [] : rosterRowsOf(read.bytes));
      }
    }
    await readChat(deckId, true);
    await announceChat(deckId);
  };

  const startPolling = (deckId: string): void => {
    const state = stateOf(deckId);
    if (state.pollTimer !== undefined) return;
    const tick = (): void => {
      state.pollTimer = timers.set(() => {
        state.pollTimer = undefined;
        if (!decks.has(deckId)) return;
        void pollShared(deckId)
          .catch((error: unknown) =>
            onError(error, `blob: reading the roster file of ${deckId} failed`),
          )
          .then(() => {
            if (decks.has(deckId) && state.pollTimer === undefined) tick();
          });
      }, pollMs);
    };
    tick();
  };

  const presence: PresenceChannel = {
    async set(deckId, clientId, state, ttlMs) {
      await local.presence.set(deckId, clientId, state, ttlMs);
      const st = stateOf(deckId);
      st.ownRows.add(clientId);
      st.rowSetAt.set(clientId, now());
      st.remoteRows.delete(clientId);
      st.tombstones.delete(clientId);
      await noteRosterChange(deckId, false);
    },
    async roster(deckId) {
      // a roster read for a fresh stream's hello sees the other instances first when the last
      // poll is older than the poll cadence
      const st = stateOf(deckId);
      if (st.sharing !== false && now() - st.lastPollAt > pollMs) {
        await pollShared(deckId).catch((error: unknown) =>
          onError(error, `blob: reading the roster file of ${deckId} failed`),
        );
      }
      return local.presence.roster(deckId);
    },
    async leave(deckId, clientId) {
      await local.presence.leave(deckId, clientId);
      const st = stateOf(deckId);
      st.remoteRows.delete(clientId);
      st.ownRows.delete(clientId);
      st.rowSetAt.delete(clientId);
      st.tombstones.set(clientId, now());
      // the leave is the tab's last word: it reaches the file inside this request
      await noteRosterChange(deckId, true);
    },
    bind: (deckId, clientId, sessionId, ttlMs) =>
      local.presence.bind(deckId, clientId, sessionId, ttlMs),
    owner: (deckId, clientId) => local.presence.owner(deckId, clientId),
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
   * Delivers the records this instance has not announced yet: an `op` and a `checkpoint` each,
   * the record's tab and batch on the op (`entryOfRecord`), and the mirror told the revision it
   * now holds (A3 items 2 and 6: a frame with a higher revision moves the cache key).
   */
  const announce = async (deckId: string): Promise<void> => {
    const state = stateOf(deckId);
    if (state.lastSeq < 0) return;
    const store = await storeOf(deckId);
    const records = await recordsAfter(deckId, state.lastSeq, REPLAY_MAX_ENTRIES);
    for (const record of records) {
      state.lastSeq = record.revision;
      noteDelivered(store, record.revision);
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
        const chats = entries.filter((entry) => entry.kind === 'chat');
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
            outcome = await store.write(
              {
                baseRevision: head,
                author: first.author,
                mutations: mutations as VersionRecord['mutations'],
              },
              // the record names the tab and its batch, so its echo on another instance is the
              // tab's own acknowledgement and a replayed op is answered, never committed twice
              // (SPEC-5-amendments A3 items 5 and 6)
              { origin: { clientId: first.clientId, opIds: edits.map((entry) => entry.opId) } },
            );
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
        if (chats.length > 0) {
          // a chat message is a file under the state folder at the revision it was sent at
          // (SPEC-5 10; finding 3): no record, no revision, listed by every instance's `since`
          await appendChat(
            deckId,
            admitted.filter((entry) => entry.kind === 'chat'),
          );
        }
        const state = stateOf(deckId);
        state.lastSeq = Math.max(state.lastSeq, revision);
        // publication after the commit (A3 item 6): the store holds the revision, the mirror is
        // told, then the frames leave with the revision as their seq and the author's client id
        noteDelivered(store, revision);
        for (const entry of admitted) await local.publish(deckId, { type: 'op', entry });
        if (record !== undefined) await local.publish(deckId, checkpointOf(record));
        return { ok: true, entries: admitted };
      });
    },

    async since(deckId, seq, limit): Promise<Entry[]> {
      const records = (await recordsAfter(deckId, seq, limit)).map(entryOfRecord);
      const state = stateOf(deckId);
      if (state.sharing !== false) {
        await readChat(deckId).catch((error: unknown) =>
          onError(error, `blob: reading the chat of ${deckId} failed`),
        );
      }
      return withChat(deckId, seq, limit, records);
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
        startPolling(deckId);
        state.watching = queued(deckId, async () => {
          const store = await storeOf(deckId);
          state.lastSeq = await store.revision();
          noteDelivered(store, state.lastSeq);
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

    presence,
    sharedRoster: {
      instanceId,
      poll: (deckId) => pollShared(deckId),
      flush: (deckId) => flushRoster(deckId),
    },
    lock: local.lock,
    heartbeat: local.heartbeat,
    unlock: local.unlock,
    budget: local.budget,
    flag: local.flag,
    setFlag: local.setFlag,

    async close(): Promise<void> {
      for (const [deckId, state] of decks) {
        if (state.rosterTimer !== undefined) timers.clear(state.rosterTimer);
        if (state.pollTimer !== undefined) timers.clear(state.pollTimer);
        state.rosterTimer = undefined;
        state.pollTimer = undefined;
        // this instance's rows leave the shared roster with it
        try {
          await state.rosterWriting.catch(() => undefined);
          if (state.sharing === true) {
            state.ownRows.clear();
            state.rowSetAt.clear();
            state.lastRosterWriteAt = 0;
            await writeRoster(deckId);
          }
        } catch {
          // closing anyway
        }
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

// The memory channel (gslides-parity SPEC-3 2.5, 3.2): the room in one process, for a checkout's
// dev server, the tests and `node-server`. Two browsers on localhost are two anonymous principals
// and this is what carries their operations between them (SPEC-3 3.11). The same maps back the
// per instance half of the blob tier (blob.ts): presence, locks, budgets and flags that need no
// other instance. Keys follow keys.ts so a memory dump reads like the Redis one. No `node:`.
import type {
  AppendResult,
  BudgetResult,
  Entry,
  LockOptions,
  NewEntry,
  RealtimeChannel,
  RoomEvent,
  RoomListener,
  RosterEntry,
  TrimOptions,
} from './channel.ts';
import type { FlagName } from './keys.ts';
import { checkClientId, checkDeckId, deckKeys, isFlagName } from './keys.ts';

export type MemoryChannelOptions = {
  /** the clock in ms, for tests; Date.now by default */
  now?: () => number;
  /** kill switch values (SPEC-3 0.33); every flag not named reads as on */
  flags?: Partial<Record<FlagName, boolean>>;
};

type Room = {
  entries: Entry[];
  head: number;
  listeners: Set<RoomListener>;
  roster: Map<string, { state: RosterEntry; expiresAt: number }>;
  bindings: Map<string, { sessionId: string; expiresAt: number }>;
};

type Lock = { token: string; heartbeatAt: number; ttlMs: number; expiresAt: number };

type Budget = { count: number; resetAt: number };

/** The memory channel plus the flag setter the CLI's `admin flag` uses on a checkout. */
export type MemoryChannel = RealtimeChannel & {
  setFlag: (name: FlagName, value: boolean) => void;
  /** every deck with a room in this process */
  rooms: () => string[];
};

export function memoryChannel(options: MemoryChannelOptions = {}): MemoryChannel {
  const now = options.now ?? (() => Date.now());
  const flags = new Map<FlagName, boolean>(
    Object.entries(options.flags ?? {}).filter(
      (row): row is [FlagName, boolean] => isFlagName(row[0]) && typeof row[1] === 'boolean',
    ),
  );
  const rooms = new Map<string, Room>();
  const locks = new Map<string, Lock>();
  const budgets = new Map<string, Budget>();

  const roomOf = (deckId: string): Room => {
    const id = checkDeckId(deckId);
    let room = rooms.get(id);
    if (room === undefined) {
      room = { entries: [], head: 0, listeners: new Set(), roster: new Map(), bindings: new Map() };
      rooms.set(id, room);
    }
    return room;
  };

  /** Delivers to every listener; one listener's failure never stops the others or the writer. */
  const deliver = (room: Room, event: RoomEvent): void => {
    for (const listener of [...room.listeners]) {
      try {
        listener(event);
      } catch {
        // a listener that throws has its own error path; the room keeps going
      }
    }
  };

  const sweepRoster = (room: Room): void => {
    const t = now();
    for (const [clientId, row] of room.roster) if (row.expiresAt <= t) room.roster.delete(clientId);
  };

  const channel: MemoryChannel = {
    tier: 'memory',

    async append(deckId, base, entries, appendOptions = {}): Promise<AppendResult> {
      const room = roomOf(deckId);
      // a writer that missed twice holds the append lock; the others yield (SPEC-3 3.4 step 5)
      const held = locks.get(deckKeys(deckId).append);
      if (held !== undefined && held.expiresAt > now() && held.token !== appendOptions.token) {
        return { ok: false, head: room.head, count: 0, locked: true };
      }
      if (room.head !== base) return { ok: false, head: room.head, count: room.head - base };
      const admitted: Entry[] = entries.map((entry: NewEntry) => {
        room.head += 1;
        return { ...entry, seq: room.head };
      });
      room.entries.push(...admitted);
      for (const entry of admitted) deliver(room, { type: 'op', entry });
      return { ok: true, entries: admitted };
    },

    async since(deckId, seq, limit): Promise<Entry[]> {
      const room = roomOf(deckId);
      const out: Entry[] = [];
      for (const entry of room.entries) {
        if (entry.seq <= seq) continue;
        out.push(entry);
        if (out.length >= limit) break;
      }
      return out;
    },

    async head(deckId): Promise<number> {
      return roomOf(deckId).head;
    },

    subscribe(deckId, onEvent): () => void {
      const room = roomOf(deckId);
      room.listeners.add(onEvent);
      return () => {
        room.listeners.delete(onEvent);
      };
    },

    async publish(deckId, event): Promise<void> {
      deliver(roomOf(deckId), event);
    },

    async trim(deckId, trimOptions: TrimOptions): Promise<void> {
      const room = roomOf(deckId);
      if (trimOptions.minSeq !== undefined) {
        const min = trimOptions.minSeq;
        room.entries = room.entries.filter((entry) => entry.seq >= min);
      }
      if (trimOptions.maxEntries !== undefined && room.entries.length > trimOptions.maxEntries) {
        room.entries = room.entries.slice(room.entries.length - trimOptions.maxEntries);
      }
    },

    presence: {
      async set(deckId, clientId, state, ttlMs): Promise<void> {
        const room = roomOf(deckId);
        const id = checkClientId(clientId);
        const current = room.roster.get(id);
        // an older clock is a late batch; the roster keeps the newer state (SPEC-3 3.8)
        if (current !== undefined && current.expiresAt > now() && current.state.clock > state.clock)
          return;
        room.roster.set(id, { state, expiresAt: now() + ttlMs });
        deliver(room, { type: 'presence', clientId: id, clock: state.clock, state });
      },
      async roster(deckId): Promise<RosterEntry[]> {
        const room = roomOf(deckId);
        sweepRoster(room);
        return [...room.roster.values()].map((row) => row.state);
      },
      async leave(deckId, clientId): Promise<void> {
        const room = roomOf(deckId);
        const id = checkClientId(clientId);
        if (room.roster.delete(id)) deliver(room, { type: 'leave', clientId: id });
      },
      async bind(deckId, clientId, sessionId, ttlMs): Promise<void> {
        roomOf(deckId).bindings.set(checkClientId(clientId), {
          sessionId,
          expiresAt: now() + ttlMs,
        });
      },
      async owner(deckId, clientId): Promise<string | null> {
        const room = roomOf(deckId);
        const id = checkClientId(clientId);
        const bound = room.bindings.get(id);
        if (bound === undefined) return null;
        if (bound.expiresAt <= now()) {
          room.bindings.delete(id);
          return null;
        }
        return bound.sessionId;
      },
    },

    async lock(key, token, ttlMs, lockOptions: LockOptions = {}): Promise<boolean> {
      const t = now();
      const held = locks.get(key);
      if (held !== undefined && held.expiresAt > t) {
        const stale = lockOptions.staleMs;
        if (stale === undefined || t - held.heartbeatAt <= stale) return false;
      }
      locks.set(key, { token, heartbeatAt: t, ttlMs, expiresAt: t + ttlMs });
      return true;
    },

    async heartbeat(key, token): Promise<boolean> {
      const t = now();
      const held = locks.get(key);
      if (held === undefined || held.token !== token || held.expiresAt <= t) return false;
      held.heartbeatAt = t;
      held.expiresAt = t + held.ttlMs;
      return true;
    },

    async unlock(key, token): Promise<void> {
      const held = locks.get(key);
      if (held !== undefined && held.token === token) locks.delete(key);
    },

    async budget(key, cost, limit, windowMs): Promise<BudgetResult> {
      const t = now();
      let row = budgets.get(key);
      if (row === undefined || row.resetAt <= t) {
        row = { count: 0, resetAt: t + windowMs };
        budgets.set(key, row);
      }
      row.count += cost;
      if (row.count > limit) return { ok: false, retryAfterMs: Math.max(1, row.resetAt - t) };
      return { ok: true, retryAfterMs: 0 };
    },

    async flag(name): Promise<boolean> {
      if (!isFlagName(name)) throw new TypeError(`${JSON.stringify(name)} is not a flag name`);
      return flags.get(name) ?? true;
    },

    async close(): Promise<void> {
      for (const room of rooms.values()) room.listeners.clear();
    },

    setFlag(name, value) {
      flags.set(name, value);
    },

    rooms() {
      return [...rooms.keys()].sort();
    },
  };
  return channel;
}

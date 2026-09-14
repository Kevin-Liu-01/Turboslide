// The redis channel (gslides-parity SPEC-3 2.5, 3.2, 3.4 step 5, 3.8; reports 02 7.3, 10 F24,
// F26, F33 to F35): the room over a Redis database reached through the Redis protocol (Upstash
// over TCP; the REST API cannot block or subscribe). One stream per deck (`XADD` with `<seq>-0`
// ids), one head counter, one Lua compare and append, one pub/sub channel per deck that every
// instance with an open stream subscribes to once, a hash and a sorted set for the roster, `SET
// PX` bindings, the lock scripts and the budget script of lua.ts.
//
// The channel talks to Redis through the small `RedisCommands` interface below, so the tests run
// it against the in process fake (redis-fake.ts) and the studio against ioredis through
// `ioredisCommands` (typed structurally, so this package carries no ioredis import; the studio's
// server module constructs the client). This is the one file of the package allowed a `node:`
// import; today it needs none.
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
import { checkClientId, deckKeys, flagKey, isFlagName } from './keys.ts';
import { SCRIPTS } from './lua.ts';
import type { ScriptName } from './lua.ts';
import { entrySchema, roomEventSchema, rosterEntrySchema } from './protocol.ts';

// ---------------------------------------------------------------------------------------------
// The command interface

export type RedisReply = string | number | null | RedisReply[];

export type RedisCommands = {
  /** one command, arguments as Redis sees them; integer replies as numbers, bulk as strings */
  call: (command: string, ...args: (string | number)[]) => Promise<RedisReply>;
  /** a pub/sub subscription on its own connection; resolves once subscribed, returns the unsubscribe */
  subscribe: (
    channel: string,
    onMessage: (message: string) => void,
  ) => Promise<() => Promise<void>>;
  quit: () => Promise<void>;
};

/** What the channel needs of an ioredis client, structurally, so no ioredis type is imported here. */
export type IoredisLike = {
  call: (command: string, ...args: (string | number)[]) => Promise<unknown>;
  duplicate: () => IoredisLike;
  subscribe: (...channels: string[]) => Promise<unknown>;
  unsubscribe: (...channels: string[]) => Promise<unknown>;
  on: (event: 'message', listener: (channel: string, message: string) => void) => unknown;
  quit: () => Promise<unknown>;
};

/** RedisCommands over an ioredis client: one connection for commands, one duplicate for pub/sub. */
export function ioredisCommands(client: IoredisLike): RedisCommands {
  let subscriber: IoredisLike | undefined;
  const listeners = new Map<string, Set<(message: string) => void>>();
  const subscriberFor = (): IoredisLike => {
    if (subscriber === undefined) {
      subscriber = client.duplicate();
      subscriber.on('message', (channel, message) => {
        for (const listener of listeners.get(channel) ?? []) listener(message);
      });
    }
    return subscriber;
  };
  return {
    call: (command, ...args) => client.call(command, ...args) as Promise<RedisReply>,
    async subscribe(channel, onMessage) {
      const sub = subscriberFor();
      let set = listeners.get(channel);
      if (set === undefined) {
        set = new Set();
        listeners.set(channel, set);
        await sub.subscribe(channel);
      }
      set.add(onMessage);
      return async () => {
        const current = listeners.get(channel);
        if (current === undefined) return;
        current.delete(onMessage);
        if (current.size === 0) {
          listeners.delete(channel);
          await sub.unsubscribe(channel);
        }
      };
    },
    async quit() {
      await Promise.all([client.quit(), subscriber?.quit()]);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The channel

export type RedisChannelOptions = {
  /** the clock in ms; Date.now by default */
  now?: () => number;
  /** how long a flag value is trusted before the next GET; 5 s per SPEC-3 0.33 */
  flagCacheMs?: number;
  /** where a subscriber's failure is reported (a message that does not parse, a gap fill that fails) */
  onError?: (error: unknown, context: string) => void;
};

/** The wire shape of a pub/sub message; `entries` are bodies without `seq`, numbered from `from`. */
type WireMessage =
  | { t: 'ops'; from: number; entries: NewEntry[] }
  | { t: 'presence'; clientId: string; clock: number; state: RosterEntry }
  | { t: 'leave'; clientId: string }
  | { t: 'event'; event: RoomEvent };

type Subscription = {
  listeners: Set<RoomListener>;
  /** the last seq delivered in order; -1 until the head is read */
  lastSeq: number;
  /** the message chain, so gap fills and deliveries stay in order */
  chain: Promise<void>;
  unsubscribe: Promise<() => Promise<void>>;
};

function asNumber(reply: RedisReply | undefined): number {
  if (typeof reply === 'number') return reply;
  if (typeof reply === 'string') {
    const n = Number(reply);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isNoScript(error: unknown): boolean {
  return error instanceof Error && /NOSCRIPT/i.test(error.message);
}

/** The redis channel over a command connection. */
export function redisChannel(
  commands: RedisCommands,
  options: RedisChannelOptions = {},
): RealtimeChannel {
  const now = options.now ?? (() => Date.now());
  const flagCacheMs = options.flagCacheMs ?? 5000;
  const onError = options.onError ?? (() => {});
  const shas = new Map<ScriptName, string>();
  const subscriptions = new Map<string, Subscription>();
  const flagCache = new Map<FlagName, { value: boolean; at: number }>();

  const load = async (name: ScriptName): Promise<string> => {
    const sha = String(await commands.call('SCRIPT', 'LOAD', SCRIPTS[name]));
    shas.set(name, sha);
    return sha;
  };

  /** EVALSHA with one reload on NOSCRIPT (a flushed script cache, a failover). */
  const run = async (
    name: ScriptName,
    keys: string[],
    args: (string | number)[],
  ): Promise<RedisReply> => {
    const sha = shas.get(name) ?? (await load(name));
    try {
      return await commands.call('EVALSHA', sha, keys.length, ...keys, ...args);
    } catch (error) {
      if (!isNoScript(error)) throw error;
      const fresh = await load(name);
      return commands.call('EVALSHA', fresh, keys.length, ...keys, ...args);
    }
  };

  const parseEntry = (seq: number, body: string): Entry | null => {
    try {
      const parsed = entrySchema.safeParse({ ...(JSON.parse(body) as object), seq });
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  /** `XRANGE` from `seq + 1`, ids `<seq>-0`, fields `seq`, `body`. */
  const range = async (opsKey: string, seq: number, limit: number): Promise<Entry[]> => {
    if (limit <= 0) return [];
    const reply = await commands.call('XRANGE', opsKey, `${seq + 1}-0`, '+', 'COUNT', limit);
    const out: Entry[] = [];
    if (!Array.isArray(reply)) return out;
    for (const row of reply) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const [id, fields] = row;
      if (typeof id !== 'string' || !Array.isArray(fields)) continue;
      const entrySeq = Number(id.split('-')[0]);
      let body: string | undefined;
      for (let i = 0; i + 1 < fields.length; i += 2) {
        if (fields[i] === 'body' && typeof fields[i + 1] === 'string')
          body = fields[i + 1] as string;
      }
      if (body === undefined) continue;
      const entry = parseEntry(entrySeq, body);
      if (entry !== null) out.push(entry);
    }
    return out;
  };

  const deliver = (sub: Subscription, event: RoomEvent): void => {
    for (const listener of [...sub.listeners]) {
      try {
        listener(event);
      } catch {
        // a listener that throws has its own error path
      }
    }
  };

  /** Applies one wire message in order: gap fills from the stream, then the message's own entries. */
  const handle = async (deckId: string, sub: Subscription, raw: string): Promise<void> => {
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch (error) {
      onError(error, `redis: a message on ${deckId} did not parse`);
      return;
    }
    if (message.t === 'ops') {
      const keys = deckKeys(deckId);
      if (sub.lastSeq >= 0 && message.from > sub.lastSeq + 1) {
        // a message was lost (pub/sub is fire and forget): the stream holds the truth
        try {
          const missing = await range(keys.ops, sub.lastSeq, message.from - 1 - sub.lastSeq);
          for (const entry of missing) {
            if (entry.seq <= sub.lastSeq) continue;
            sub.lastSeq = entry.seq;
            deliver(sub, { type: 'op', entry });
          }
        } catch (error) {
          onError(error, `redis: the gap before ${message.from} on ${deckId} could not be read`);
        }
      }
      message.entries.forEach((body, index) => {
        const seq = message.from + index;
        if (seq <= sub.lastSeq) return;
        const parsed = entrySchema.safeParse({ ...body, seq });
        if (!parsed.success) {
          onError(parsed.error, `redis: entry ${seq} on ${deckId} did not parse`);
          return;
        }
        sub.lastSeq = seq;
        deliver(sub, { type: 'op', entry: parsed.data });
      });
      return;
    }
    if (message.t === 'presence') {
      const state = rosterEntrySchema.safeParse(message.state);
      if (state.success)
        deliver(sub, {
          type: 'presence',
          clientId: message.clientId,
          clock: message.clock,
          state: state.data,
        });
      return;
    }
    if (message.t === 'leave') {
      deliver(sub, { type: 'leave', clientId: message.clientId });
      return;
    }
    if (message.t === 'event') {
      const event = roomEventSchema.safeParse(message.event);
      if (event.success) deliver(sub, event.data);
    }
  };

  const publishWire = async (deckId: string, message: WireMessage): Promise<void> => {
    await commands.call('PUBLISH', deckKeys(deckId).events, JSON.stringify(message));
  };

  const channel: RealtimeChannel = {
    tier: 'redis',

    async append(deckId, base, entries, appendOptions = {}): Promise<AppendResult> {
      const keys = deckKeys(deckId);
      const bodies = entries.map((entry) => JSON.stringify(entry));
      const reply = await run(
        'append',
        [keys.ops, keys.head, keys.append],
        [base, keys.events, appendOptions.token ?? '', ...bodies],
      );
      if (!Array.isArray(reply)) throw new Error('redis: the append script answered no list');
      const [flag, head, count] = reply;
      if (asNumber(flag) === 2) return { ok: false, head: asNumber(head), count: 0, locked: true };
      if (asNumber(flag) === 1) {
        const last = asNumber(head);
        const first = last - entries.length + 1;
        return {
          ok: true,
          entries: entries.map((entry, index) => ({ ...entry, seq: first + index })),
        };
      }
      return { ok: false, head: asNumber(head), count: asNumber(count ?? 0) };
    },

    async since(deckId, seq, limit): Promise<Entry[]> {
      return range(deckKeys(deckId).ops, seq, limit);
    },

    async head(deckId): Promise<number> {
      return asNumber(await commands.call('GET', deckKeys(deckId).head));
    },

    subscribe(deckId, onEvent): () => void {
      const keys = deckKeys(deckId);
      let sub = subscriptions.get(deckId);
      if (sub === undefined) {
        const created: Subscription = {
          listeners: new Set(),
          lastSeq: -1,
          chain: Promise.resolve(),
          unsubscribe: Promise.resolve(async () => {}),
        };
        // the position first, then the subscription, both on the chain so no message is handled
        // before the head is known and none is handled out of order
        created.chain = created.chain.then(async () => {
          created.lastSeq = asNumber(await commands.call('GET', keys.head));
        });
        created.unsubscribe = created.chain.then(() =>
          commands.subscribe(keys.events, (raw) => {
            created.chain = created.chain
              .then(() => handle(deckId, created, raw))
              .catch((error: unknown) => onError(error, `redis: a message on ${deckId} failed`));
          }),
        );
        created.unsubscribe.catch((error: unknown) =>
          onError(error, `redis: subscribing to ${deckId} failed`),
        );
        subscriptions.set(deckId, created);
        sub = created;
      }
      sub.listeners.add(onEvent);
      return () => {
        const current = subscriptions.get(deckId);
        if (current === undefined) return;
        current.listeners.delete(onEvent);
        if (current.listeners.size === 0) {
          subscriptions.delete(deckId);
          void current.unsubscribe
            .then((stop) => stop())
            .catch((error: unknown) => onError(error, `redis: unsubscribing ${deckId} failed`));
        }
      };
    },

    async publish(deckId, event): Promise<void> {
      await publishWire(deckId, { t: 'event', event });
    },

    async trim(deckId, trimOptions: TrimOptions): Promise<void> {
      const keys = deckKeys(deckId);
      if (trimOptions.minSeq !== undefined)
        await commands.call('XTRIM', keys.ops, 'MINID', `${trimOptions.minSeq}-0`);
      if (trimOptions.maxEntries !== undefined)
        await commands.call('XTRIM', keys.ops, 'MAXLEN', '~', trimOptions.maxEntries);
    },

    presence: {
      async set(deckId, clientId, state, ttlMs): Promise<void> {
        const keys = deckKeys(deckId);
        const id = checkClientId(clientId);
        const expiresAt = now() + ttlMs;
        // an older clock is a late batch; the roster keeps the newer state (SPEC-3 3.8)
        const stored = await commands.call('HGET', keys.roster, id);
        if (typeof stored === 'string') {
          try {
            const previous = JSON.parse(stored) as { clock?: unknown };
            const score = await commands.call('ZSCORE', keys.presence, id);
            const live = asNumber(score) > now();
            if (live && typeof previous.clock === 'number' && previous.clock > state.clock) return;
          } catch {
            // an unreadable body is replaced
          }
        }
        await commands.call('HSET', keys.roster, id, JSON.stringify(state));
        await commands.call('ZADD', keys.presence, expiresAt, id);
        await commands.call('PEXPIRE', keys.roster, ttlMs);
        await commands.call('PEXPIRE', keys.presence, ttlMs);
        await publishWire(deckId, { t: 'presence', clientId: id, clock: state.clock, state });
      },
      async roster(deckId): Promise<RosterEntry[]> {
        const keys = deckKeys(deckId);
        const t = now();
        const expired = await commands.call('ZRANGEBYSCORE', keys.presence, '-inf', t);
        if (Array.isArray(expired) && expired.length > 0) {
          const ids = expired.filter((row): row is string => typeof row === 'string');
          if (ids.length > 0) {
            await commands.call('HDEL', keys.roster, ...ids);
            await commands.call('ZREM', keys.presence, ...ids);
          }
        }
        const live = await commands.call('ZRANGEBYSCORE', keys.presence, `(${t}`, '+inf');
        if (!Array.isArray(live) || live.length === 0) return [];
        const ids = live.filter((row): row is string => typeof row === 'string');
        const bodies = await commands.call('HMGET', keys.roster, ...ids);
        const out: RosterEntry[] = [];
        if (!Array.isArray(bodies)) return out;
        for (const body of bodies) {
          if (typeof body !== 'string') continue;
          try {
            const parsed = rosterEntrySchema.safeParse(JSON.parse(body));
            if (parsed.success) out.push(parsed.data);
          } catch {
            // a body that does not parse is dropped from the roster read
          }
        }
        return out;
      },
      async leave(deckId, clientId): Promise<void> {
        const keys = deckKeys(deckId);
        const id = checkClientId(clientId);
        const removed = asNumber(await commands.call('HDEL', keys.roster, id));
        await commands.call('ZREM', keys.presence, id);
        if (removed > 0) await publishWire(deckId, { t: 'leave', clientId: id });
      },
      async bind(deckId, clientId, sessionId, ttlMs): Promise<void> {
        await commands.call('SET', deckKeys(deckId).client(clientId), sessionId, 'PX', ttlMs);
      },
      async owner(deckId, clientId): Promise<string | null> {
        const reply = await commands.call('GET', deckKeys(deckId).client(clientId));
        return typeof reply === 'string' ? reply : null;
      },
    },

    async lock(key, token, ttlMs, lockOptions: LockOptions = {}): Promise<boolean> {
      if (token.includes(':')) throw new TypeError('a lock token carries no colon');
      const reply = await run('lock', [key], [token, ttlMs, now(), lockOptions.staleMs ?? 0]);
      return asNumber(reply) === 1;
    },

    async heartbeat(key, token): Promise<boolean> {
      return asNumber(await run('heartbeat', [key], [token, now()])) === 1;
    },

    async unlock(key, token): Promise<void> {
      await run('unlock', [key], [token]);
    },

    async budget(key, cost, limit, windowMs): Promise<BudgetResult> {
      const reply = await run('budget', [key], [cost, windowMs]);
      if (!Array.isArray(reply)) throw new Error('redis: the budget script answered no list');
      const [count, pttl] = reply;
      if (asNumber(count) > limit) return { ok: false, retryAfterMs: Math.max(1, asNumber(pttl)) };
      return { ok: true, retryAfterMs: 0 };
    },

    async flag(name): Promise<boolean> {
      if (!isFlagName(name)) throw new TypeError(`${JSON.stringify(name)} is not a flag name`);
      const cached = flagCache.get(name);
      const t = now();
      if (cached !== undefined && t - cached.at < flagCacheMs) return cached.value;
      let value: boolean;
      try {
        const reply = await commands.call('GET', flagKey(name));
        value = !(typeof reply === 'string' && /^(off|0|false)$/i.test(reply.trim()));
      } catch {
        // Redis unreachable: realtime reads as off (the blob tier), every other flag as on (SPEC-3 0.33)
        value = name !== 'realtime';
      }
      flagCache.set(name, { value, at: t });
      return value;
    },

    async close(): Promise<void> {
      for (const [deckId, sub] of subscriptions) {
        subscriptions.delete(deckId);
        try {
          await (
            await sub.unsubscribe
          )();
        } catch {
          // closing anyway
        }
      }
      await commands.quit();
    },
  };
  return channel;
}

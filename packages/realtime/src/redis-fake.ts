// An in process Redis for the redis channel's tests (gslides-parity SPEC-3 16.6 "redis.test.ts
// (against a fake)"): the commands redis.ts sends, the Lua scripts of lua.ts as the same steps in
// JavaScript, one command at a time behind an optional latency (Redis runs on one thread, so a
// script is atomic and two instances never interleave), pub/sub delivered asynchronously with a
// hook to drop messages (pub/sub is fire and forget; the subscriber's gap fill is what the test
// exercises), a call log to count round trips, and SCRIPT FLUSH to stage a NOSCRIPT reload. No
// `node:` import: the fake is plain JavaScript and stays out of the studio's bundles.
import { SCRIPTS } from './lua.ts';
import type { RedisCommands, RedisReply } from './redis.ts';

export type FakeRedisOptions = {
  /** the delay before each command runs, in ms, or a function drawing one; under 1 ms is a microtask turn */
  latencyMs?: number | (() => number);
  /** the clock in ms for TTLs; Date.now by default */
  now?: () => number;
  /** returns true to drop a delivery: `n` counts deliveries per channel from 1 */
  dropPublish?: (channel: string, message: string, n: number) => boolean;
};

export type FakeRedis = RedisCommands & {
  /** every command as sent, arguments stringified */
  readonly calls: string[][];
  /** the stream entries under a key, for assertions */
  stream: (key: string) => { id: string; seq: number; body: string }[];
  get: (key: string) => string | null;
  /** how many deliveries a channel has made */
  published: (channel: string) => number;
  /** forgets loaded scripts, so the next EVALSHA answers NOSCRIPT (a failover, a flushed cache) */
  flushScripts: () => void;
  /** the subscriber count of a channel */
  subscribers: (channel: string) => number;
};

type Stored = { value: string; expiresAt: number | null };
type StreamEntry = { id: string; seq: number; fields: string[] };

class FakeRedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FakeRedisError';
  }
}

function str(value: string | number): string {
  return typeof value === 'number' ? String(value) : value;
}

function seqOf(id: string): number {
  const n = Number(id.split('-')[0]);
  if (!Number.isFinite(n)) throw new FakeRedisError(`fake: bad stream id ${id}`);
  return n;
}

/** Parses a ZRANGEBYSCORE bound: `-inf`, `+inf`, `(5` (exclusive), `5`. */
function bound(value: string): { n: number; exclusive: boolean } {
  if (value === '-inf') return { n: -Infinity, exclusive: false };
  if (value === '+inf') return { n: Infinity, exclusive: false };
  if (value.startsWith('(')) return { n: Number(value.slice(1)), exclusive: true };
  return { n: Number(value), exclusive: false };
}

export function fakeRedis(options: FakeRedisOptions = {}): FakeRedis {
  const now = options.now ?? (() => Date.now());
  const latency = (): number =>
    typeof options.latencyMs === 'function' ? options.latencyMs() : (options.latencyMs ?? 0);
  const strings = new Map<string, Stored>();
  const streams = new Map<string, StreamEntry[]>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const scripts = new Map<string, string>();
  const subscribers = new Map<string, Set<(message: string) => void>>();
  const publishedCount = new Map<string, number>();
  const calls: string[][] = [];
  let scriptSerial = 0;
  let tail: Promise<unknown> = Promise.resolve();

  const alive = (key: string): Stored | undefined => {
    const row = strings.get(key);
    if (row === undefined) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= now()) {
      strings.delete(key);
      return undefined;
    }
    return row;
  };

  // ----- the commands, each a synchronous step on the data -----------------------------------

  const get = (key: string): RedisReply => alive(key)?.value ?? null;

  const set = (args: string[]): RedisReply => {
    const [key, value, ...rest] = args;
    if (key === undefined || value === undefined)
      throw new FakeRedisError('fake: SET wants key and value');
    let nx = false;
    let xx = false;
    let px: number | null = null;
    for (let i = 0; i < rest.length; i += 1) {
      const word = (rest[i] ?? '').toUpperCase();
      if (word === 'NX') nx = true;
      else if (word === 'XX') xx = true;
      else if (word === 'PX') {
        px = Number(rest[i + 1]);
        i += 1;
      } else if (word === 'EX') {
        px = Number(rest[i + 1]) * 1000;
        i += 1;
      } else throw new FakeRedisError(`fake: SET option ${word} is not supported`);
    }
    const existing = alive(key) !== undefined;
    if ((nx && existing) || (xx && !existing)) return null;
    strings.set(key, { value, expiresAt: px === null ? null : now() + px });
    return 'OK';
  };

  const del = (keys: string[]): RedisReply => {
    let n = 0;
    for (const key of keys) {
      if (strings.delete(key)) n += 1;
      if (streams.delete(key)) n += 1;
      if (hashes.delete(key)) n += 1;
      if (zsets.delete(key)) n += 1;
    }
    return n;
  };

  const incrby = (key: string, by: number): RedisReply => {
    const row = alive(key);
    const next = (row === undefined ? 0 : Number(row.value)) + by;
    strings.set(key, { value: String(next), expiresAt: row?.expiresAt ?? null });
    return next;
  };

  const pexpire = (key: string, ms: number): RedisReply => {
    const row = alive(key);
    if (row !== undefined) {
      row.expiresAt = now() + ms;
      return 1;
    }
    // hashes and sorted sets carry no expiry in the fake beyond deletion on demand
    return hashes.has(key) || zsets.has(key) || streams.has(key) ? 1 : 0;
  };

  const pttl = (key: string): RedisReply => {
    const row = alive(key);
    if (row === undefined) return hashes.has(key) || zsets.has(key) || streams.has(key) ? -1 : -2;
    return row.expiresAt === null ? -1 : Math.max(0, row.expiresAt - now());
  };

  const xadd = (key: string, id: string, fields: string[]): RedisReply => {
    let stream = streams.get(key);
    if (stream === undefined) {
      stream = [];
      streams.set(key, stream);
    }
    const seq = seqOf(id);
    const last = stream[stream.length - 1];
    if (last !== undefined && seq <= last.seq)
      throw new FakeRedisError(
        'ERR The ID specified in XADD is equal or smaller than the target stream top item',
      );
    stream.push({ id, seq, fields });
    return id;
  };

  const xrange = (key: string, start: string, end: string, count: number | null): RedisReply => {
    const stream = streams.get(key) ?? [];
    const from = start === '-' ? -Infinity : seqOf(start);
    const to = end === '+' ? Infinity : seqOf(end);
    const out: RedisReply[] = [];
    for (const entry of stream) {
      if (entry.seq < from || entry.seq > to) continue;
      out.push([entry.id, [...entry.fields]]);
      if (count !== null && out.length >= count) break;
    }
    return out;
  };

  const xtrim = (key: string, args: string[]): RedisReply => {
    const stream = streams.get(key);
    if (stream === undefined) return 0;
    const before = stream.length;
    const mode = (args[0] ?? '').toUpperCase();
    const approx = args[1] === '~';
    const value = args[approx ? 2 : 1];
    if (value === undefined) throw new FakeRedisError('fake: XTRIM wants a value');
    if (mode === 'MINID') {
      const min = seqOf(value);
      streams.set(
        key,
        stream.filter((entry) => entry.seq >= min),
      );
    } else if (mode === 'MAXLEN') {
      const max = Number(value);
      if (stream.length > max) streams.set(key, stream.slice(stream.length - max));
    } else throw new FakeRedisError(`fake: XTRIM mode ${mode} is not supported`);
    return before - (streams.get(key)?.length ?? 0);
  };

  const hashOf = (key: string): Map<string, string> => {
    let hash = hashes.get(key);
    if (hash === undefined) {
      hash = new Map();
      hashes.set(key, hash);
    }
    return hash;
  };

  const zsetOf = (key: string): Map<string, number> => {
    let zset = zsets.get(key);
    if (zset === undefined) {
      zset = new Map();
      zsets.set(key, zset);
    }
    return zset;
  };

  const publish = (channel: string, message: string): RedisReply => {
    const set = subscribers.get(channel);
    const n = (publishedCount.get(channel) ?? 0) + 1;
    publishedCount.set(channel, n);
    if (set === undefined || set.size === 0) return 0;
    if (options.dropPublish?.(channel, message, n) === true) return set.size;
    for (const listener of [...set]) {
      // asynchronous, as a socket delivers, and never inside the publisher's command
      setTimeout(() => listener(message), 0);
    }
    return set.size;
  };

  // ----- the scripts as JavaScript, the same steps as lua.ts ---------------------------------

  const runScript = (text: string, keys: string[], args: string[]): RedisReply => {
    switch (text) {
      case SCRIPTS.append: {
        const [opsKey, headKey, lockKey] = keys;
        const [baseArg, channel, token, ...bodies] = args;
        if (
          opsKey === undefined ||
          headKey === undefined ||
          lockKey === undefined ||
          baseArg === undefined ||
          channel === undefined ||
          token === undefined
        )
          throw new FakeRedisError('fake: append wants 3 keys and 3 args');
        const lockValue = get(lockKey);
        if (typeof lockValue === 'string' && lockValue.split(':')[0] !== token) {
          return [2, Number(get(headKey) ?? '0'), 0];
        }
        let head = Number(get(headKey) ?? '0');
        const base = Number(baseArg);
        if (head !== base) return [0, head, head - base];
        const first = head + 1;
        for (const body of bodies) {
          head += 1;
          xadd(opsKey, `${head}-0`, ['seq', String(head), 'body', body]);
        }
        set([headKey, String(head)]);
        publish(channel, `{"t":"ops","from":${first},"entries":[${bodies.join(',')}]}`);
        return [1, head];
      }
      case SCRIPTS.lock: {
        const [key] = keys;
        const [token, ttl, clock, stale] = args;
        if (
          key === undefined ||
          token === undefined ||
          ttl === undefined ||
          clock === undefined ||
          stale === undefined
        )
          throw new FakeRedisError('fake: lock wants 1 key and 4 args');
        const value = get(key);
        if (typeof value === 'string') {
          const [, beat] = value.split(':');
          const staleMs = Number(stale);
          if (staleMs === 0 || Number(clock) - Number(beat) <= staleMs) return 0;
        }
        set([key, `${token}:${clock}:${ttl}`, 'PX', ttl]);
        return 1;
      }
      case SCRIPTS.heartbeat: {
        const [key] = keys;
        const [token, clock] = args;
        if (key === undefined || token === undefined || clock === undefined)
          throw new FakeRedisError('fake: heartbeat wants 1 key and 2 args');
        const value = get(key);
        if (typeof value !== 'string') return 0;
        const [held, , ttl] = value.split(':');
        if (held !== token || ttl === undefined) return 0;
        set([key, `${token}:${clock}:${ttl}`, 'PX', ttl]);
        return 1;
      }
      case SCRIPTS.unlock: {
        const [key] = keys;
        const [token] = args;
        if (key === undefined || token === undefined)
          throw new FakeRedisError('fake: unlock wants 1 key and 1 arg');
        const value = get(key);
        if (typeof value !== 'string') return 0;
        if (value.split(':')[0] !== token) return 0;
        del([key]);
        return 1;
      }
      case SCRIPTS.budget: {
        const [key] = keys;
        const [cost, windowMs] = args;
        if (key === undefined || cost === undefined || windowMs === undefined)
          throw new FakeRedisError('fake: budget wants 1 key and 2 args');
        const count = incrby(key, Number(cost));
        let ttl = pttl(key);
        if (typeof ttl === 'number' && ttl < 0) {
          pexpire(key, Number(windowMs));
          ttl = Number(windowMs);
        }
        return [count, ttl];
      }
      default:
        throw new FakeRedisError(
          'fake: unknown script; redis-fake.ts runs the scripts of lua.ts only',
        );
    }
  };

  const execute = (command: string, args: string[]): RedisReply => {
    const name = command.toUpperCase();
    const key = args[0];
    switch (name) {
      case 'PING':
        return 'PONG';
      case 'GET':
        if (key === undefined) throw new FakeRedisError('fake: GET wants a key');
        return get(key);
      case 'MGET':
        return args.map((k) => get(k));
      case 'SET':
        return set(args);
      case 'DEL':
        return del(args);
      case 'EXISTS':
        return args.filter(
          (k) => alive(k) !== undefined || hashes.has(k) || zsets.has(k) || streams.has(k),
        ).length;
      case 'INCRBY':
        if (key === undefined) throw new FakeRedisError('fake: INCRBY wants a key');
        return incrby(key, Number(args[1] ?? '1'));
      case 'INCR':
        if (key === undefined) throw new FakeRedisError('fake: INCR wants a key');
        return incrby(key, 1);
      case 'PEXPIRE':
        if (key === undefined) throw new FakeRedisError('fake: PEXPIRE wants a key');
        return pexpire(key, Number(args[1]));
      case 'EXPIRE':
        if (key === undefined) throw new FakeRedisError('fake: EXPIRE wants a key');
        return pexpire(key, Number(args[1]) * 1000);
      case 'PTTL':
        if (key === undefined) throw new FakeRedisError('fake: PTTL wants a key');
        return pttl(key);
      case 'XADD': {
        const [k, id, ...fields] = args;
        if (k === undefined || id === undefined)
          throw new FakeRedisError('fake: XADD wants key and id');
        return xadd(k, id, fields);
      }
      case 'XRANGE': {
        const [k, start, end, countWord, countValue] = args;
        if (k === undefined || start === undefined || end === undefined)
          throw new FakeRedisError('fake: XRANGE wants key, start, end');
        const count =
          countWord !== undefined && countWord.toUpperCase() === 'COUNT'
            ? Number(countValue)
            : null;
        return xrange(k, start, end, count);
      }
      case 'XLEN':
        if (key === undefined) throw new FakeRedisError('fake: XLEN wants a key');
        return streams.get(key)?.length ?? 0;
      case 'XTRIM':
        if (key === undefined) throw new FakeRedisError('fake: XTRIM wants a key');
        return xtrim(key, args.slice(1));
      case 'HSET': {
        if (key === undefined) throw new FakeRedisError('fake: HSET wants a key');
        const hash = hashOf(key);
        let added = 0;
        for (let i = 1; i + 1 < args.length; i += 2) {
          const field = args[i];
          const value = args[i + 1];
          if (field === undefined || value === undefined) continue;
          if (!hash.has(field)) added += 1;
          hash.set(field, value);
        }
        return added;
      }
      case 'HGET':
        if (key === undefined) throw new FakeRedisError('fake: HGET wants a key');
        return hashes.get(key)?.get(args[1] ?? '') ?? null;
      case 'HMGET':
        if (key === undefined) throw new FakeRedisError('fake: HMGET wants a key');
        return args.slice(1).map((field) => hashes.get(key)?.get(field) ?? null);
      case 'HGETALL': {
        if (key === undefined) throw new FakeRedisError('fake: HGETALL wants a key');
        const out: RedisReply[] = [];
        for (const [field, value] of hashes.get(key) ?? []) out.push(field, value);
        return out;
      }
      case 'HDEL': {
        if (key === undefined) throw new FakeRedisError('fake: HDEL wants a key');
        const hash = hashes.get(key);
        if (hash === undefined) return 0;
        let n = 0;
        for (const field of args.slice(1)) if (hash.delete(field)) n += 1;
        if (hash.size === 0) hashes.delete(key);
        return n;
      }
      case 'ZADD': {
        if (key === undefined) throw new FakeRedisError('fake: ZADD wants a key');
        const zset = zsetOf(key);
        let added = 0;
        for (let i = 1; i + 1 < args.length; i += 2) {
          const score = Number(args[i]);
          const member = args[i + 1];
          if (member === undefined) continue;
          if (!zset.has(member)) added += 1;
          zset.set(member, score);
        }
        return added;
      }
      case 'ZSCORE': {
        if (key === undefined) throw new FakeRedisError('fake: ZSCORE wants a key');
        const score = zsets.get(key)?.get(args[1] ?? '');
        return score === undefined ? null : String(score);
      }
      case 'ZREM': {
        if (key === undefined) throw new FakeRedisError('fake: ZREM wants a key');
        const zset = zsets.get(key);
        if (zset === undefined) return 0;
        let n = 0;
        for (const member of args.slice(1)) if (zset.delete(member)) n += 1;
        if (zset.size === 0) zsets.delete(key);
        return n;
      }
      case 'ZRANGEBYSCORE': {
        const [k, min, max] = args;
        if (k === undefined || min === undefined || max === undefined)
          throw new FakeRedisError('fake: ZRANGEBYSCORE wants key, min, max');
        const lo = bound(min);
        const hi = bound(max);
        return [...(zsets.get(k) ?? [])]
          .filter(
            ([, score]) =>
              (lo.exclusive ? score > lo.n : score >= lo.n) &&
              (hi.exclusive ? score < hi.n : score <= hi.n),
          )
          .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
          .map(([member]) => member);
      }
      case 'ZREMRANGEBYSCORE': {
        const [k, min, max] = args;
        if (k === undefined || min === undefined || max === undefined)
          throw new FakeRedisError('fake: ZREMRANGEBYSCORE wants key, min, max');
        const zset = zsets.get(k);
        if (zset === undefined) return 0;
        const lo = bound(min);
        const hi = bound(max);
        let n = 0;
        for (const [member, score] of [...zset]) {
          if (
            (lo.exclusive ? score > lo.n : score >= lo.n) &&
            (hi.exclusive ? score < hi.n : score <= hi.n)
          ) {
            zset.delete(member);
            n += 1;
          }
        }
        return n;
      }
      case 'PUBLISH': {
        const [channel, message] = args;
        if (channel === undefined || message === undefined)
          throw new FakeRedisError('fake: PUBLISH wants channel and message');
        return publish(channel, message);
      }
      case 'SCRIPT': {
        const sub = (args[0] ?? '').toUpperCase();
        if (sub === 'LOAD') {
          const text = args[1];
          if (text === undefined) throw new FakeRedisError('fake: SCRIPT LOAD wants a script');
          for (const [sha, stored] of scripts) if (stored === text) return sha;
          scriptSerial += 1;
          const sha = `fake-sha-${scriptSerial}`;
          scripts.set(sha, text);
          return sha;
        }
        if (sub === 'FLUSH') {
          scripts.clear();
          return 'OK';
        }
        throw new FakeRedisError(`fake: SCRIPT ${sub} is not supported`);
      }
      case 'EVAL':
      case 'EVALSHA': {
        const [scriptArg, numKeys, ...rest] = args;
        if (scriptArg === undefined || numKeys === undefined)
          throw new FakeRedisError(`fake: ${name} wants a script and a key count`);
        const text = name === 'EVAL' ? scriptArg : scripts.get(scriptArg);
        if (text === undefined)
          throw new FakeRedisError('NOSCRIPT No matching script. Please use EVAL.');
        const n = Number(numKeys);
        return runScript(text, rest.slice(0, n), rest.slice(n));
      }
      case 'FLUSHALL':
        strings.clear();
        streams.clear();
        hashes.clear();
        zsets.clear();
        return 'OK';
      default:
        throw new FakeRedisError(`fake: ${name} is not supported`);
    }
  };

  const queue = <T>(run: () => T): Promise<T> => {
    const next = tail.then(async () => {
      // a timer has a one millisecond floor in Node, so anything under it is a microtask turn:
      // still asynchronous, still one command at a time, and fast enough for a thousand appends
      const ms = latency();
      await new Promise<void>((resolve) =>
        ms >= 1 ? setTimeout(resolve, ms) : queueMicrotask(resolve),
      );
      return run();
    });
    tail = next.catch(() => undefined);
    return next;
  };

  return {
    calls,
    call(command, ...args) {
      const words = args.map(str);
      calls.push([command.toUpperCase(), ...words]);
      return queue(() => execute(command, words));
    },
    async subscribe(channel, onMessage) {
      let set = subscribers.get(channel);
      if (set === undefined) {
        set = new Set();
        subscribers.set(channel, set);
      }
      set.add(onMessage);
      calls.push(['SUBSCRIBE', channel]);
      return async () => {
        const current = subscribers.get(channel);
        current?.delete(onMessage);
        if (current !== undefined && current.size === 0) subscribers.delete(channel);
      };
    },
    async quit() {
      subscribers.clear();
    },
    stream(key) {
      return (streams.get(key) ?? []).map((entry) => {
        let body = '';
        for (let i = 0; i + 1 < entry.fields.length; i += 2)
          if (entry.fields[i] === 'body') body = entry.fields[i + 1] ?? '';
        return { id: entry.id, seq: entry.seq, body };
      });
    },
    get(key) {
      const value = get(key);
      return typeof value === 'string' ? value : null;
    },
    published(channel) {
      return publishedCount.get(channel) ?? 0;
    },
    flushScripts() {
      scripts.clear();
    },
    subscribers(channel) {
      return subscribers.get(channel)?.size ?? 0;
    },
  };
}

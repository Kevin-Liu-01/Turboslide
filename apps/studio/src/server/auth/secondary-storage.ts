// better-auth's secondary storage over the deployment's Redis (gslides-parity SPEC-3 7.3;
// research 03 D1): sessions, verification rows and the sign in rate limit counters live in
// Redis when the realtime tier has one (`REDIS_URL`), so ten function instances share one
// session set, and in the identity database otherwise. The client is typed structurally after
// the four ioredis methods the interface needs, the same shape `ioredisCommands` in
// @turboslide/realtime takes, so the studio hands over the one ioredis client B2's room module
// constructs and the tests hand over a fake. TTLs arrive in seconds (the library's contract) and
// leave as `EX` seconds.
export type RedisKvLike = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode?: 'EX', ttlSeconds?: number) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  getdel: (key: string) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
};

/** The interface `betterAuth({ secondaryStorage })` takes (03 C4). */
export type SecondaryStorage = {
  get: (key: string) => Promise<unknown>;
  getAndDelete: (key: string) => Promise<unknown>;
  increment: (key: string, ttl: number) => Promise<number>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export const SECONDARY_PREFIX = 'auth:';

export function redisSecondaryStorage(
  client: RedisKvLike,
  prefix = SECONDARY_PREFIX,
): SecondaryStorage {
  const k = (key: string): string => `${prefix}${key}`;
  return {
    get: (key) => client.get(k(key)),
    getAndDelete: (key) => client.getdel(k(key)),
    async increment(key, ttl) {
      const count = await client.incr(k(key));
      // the TTL is set on creation only, so the window is fixed from the first count
      if (count === 1 && ttl > 0) await client.expire(k(key), ttl);
      return count;
    },
    async set(key, value, ttl) {
      if (ttl !== undefined && ttl > 0) await client.set(k(key), value, 'EX', Math.ceil(ttl));
      else await client.set(k(key), value);
    },
    async delete(key) {
      await client.del(k(key));
    },
  };
}

/** An in memory client with the six methods and expiry, for tests. */
export function memoryRedisKv(clock: () => number = () => Date.now()): RedisKvLike & {
  size: () => number;
} {
  const entries = new Map<string, { value: string; expiresAt: number | null }>();
  const live = (key: string): { value: string; expiresAt: number | null } | undefined => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= clock()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get: (key) => Promise.resolve(live(key)?.value ?? null),
    set(key, value, mode, ttlSeconds) {
      entries.set(key, {
        value,
        expiresAt: mode === 'EX' && ttlSeconds !== undefined ? clock() + ttlSeconds * 1000 : null,
      });
      return Promise.resolve('OK');
    },
    del(...keys) {
      let n = 0;
      for (const key of keys) if (entries.delete(key)) n += 1;
      return Promise.resolve(n);
    },
    getdel(key) {
      const value = live(key)?.value ?? null;
      entries.delete(key);
      return Promise.resolve(value);
    },
    incr(key) {
      const entry = live(key);
      const next = (entry === undefined ? 0 : Number(entry.value)) + 1;
      entries.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return Promise.resolve(next);
    },
    expire(key, seconds) {
      const entry = live(key);
      if (entry === undefined) return Promise.resolve(0);
      entry.expiresAt = clock() + seconds * 1000;
      return Promise.resolve(1);
    },
    size() {
      for (const key of [...entries.keys()]) live(key);
      return entries.size;
    },
  };
}

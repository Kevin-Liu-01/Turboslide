// The access record store (gslides-parity SPEC-3 2.2, 6.1, 6.7, 11.2; research 09 1.2, 5.1): one
// `access.json` per deck beside the document, written with `ifMatch` by owners and sharing
// editors, read by `authorize()` on every server function and route; the per identity index
// `users/<principalId>/decks.json` the home page reads; and the deck head cache the commit path
// writes. Three backends behind one interface: the checkout's `decks/<id>/.turboslide/access.json`
// (gitignored, absent by default: the folder's holder is the owner), the private Blob store's
// `decks/<id>/access.json` (the same `ifMatch` protocol `deck.json` uses), and a cache layer with
// a 60 s TTL, dropped on every write and on the message another instance publishes (the Redis
// `PUBLISH access:<deckId>` of 6.1; a checkout's memory bus). The etag is the md5 of the bytes in
// quotes on every backend, the value Vercel Blob answers, so the same conflict rule holds on a
// checkout and hosted: a stale `ifMatch` is an AccessPreconditionError the transports map to 409
// with the current record attached. Framework free; the studio's server/access.ts wires it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AccessRecord } from '@turboslide/schema/access';
import { accessRecordSchema } from '@turboslide/schema/access';
import { canonicalJson } from '@turboslide/schema/json';
import { z } from 'zod';

import type { BlobClient } from './blob-store.ts';
import { ACCESS_FILE, BlobExistsError, BlobPreconditionError, deckPrefix } from './blob-store.ts';
import { STATE_DIR } from './file-store.ts';
import type { DeckHead } from './templates.ts';

// ---------------------------------------------------------------------------------------------
// The record store

/** A record with the etag its bytes carry; `ifMatch` on the next write. */
export type StoredAccess = { record: AccessRecord; etag: string };

export type AccessWriteOptions = {
  /** the etag the caller read; null for a record that must not exist yet; absent skips the check */
  ifMatch?: string | null;
};

export type AccessStore = {
  readonly kind: 'file' | 'blob' | 'memory';
  /** the stored record, or null when the deck has none (the caller synthesizes the legacy record) */
  read: (deckId: string) => Promise<StoredAccess | null>;
  /** writes the record; a stale `ifMatch` is an AccessPreconditionError carrying the current one */
  write: (
    deckId: string,
    record: AccessRecord,
    options?: AccessWriteOptions,
  ) => Promise<StoredAccess>;
  /** removes the record (deck.remove takes the whole prefix; this is the explicit form) */
  remove: (deckId: string) => Promise<void>;
};

/** The record changed since it was read (SPEC-3 6.1; research 09 1.3): the transports answer 409 with the current record. */
export class AccessPreconditionError extends Error {
  readonly deckId: string;
  readonly current: StoredAccess | null;
  constructor(deckId: string, current: StoredAccess | null) {
    super(
      `The access record of ${deckId} changed since it was read; the current record is attached`,
    );
    this.name = 'AccessPreconditionError';
    this.deckId = deckId;
    this.current = current;
  }
}

/** The etag every backend answers: the md5 of the bytes in quotes (Vercel Blob's, measured 2026-09-11). */
export function accessEtag(bytes: Uint8Array | string): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

/** The bytes a record is stored as: canonical JSON, one line, so equal records give equal etags. */
export function accessBytes(record: AccessRecord): Uint8Array {
  return new TextEncoder().encode(canonicalJson(accessRecordSchema.parse(record)));
}

/** Parses stored bytes; a TypeError names the first field that does not hold. */
export function parseAccessRecord(bytes: Uint8Array, file: string): AccessRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new TypeError(
      `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = accessRecordSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `${file} is not an access record at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  return parsed.data;
}

function writeAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
}

/** `<decksDir>/<deckId>/.turboslide/access.json` (research 09 1.2). */
export function accessFilePath(decksDir: string, deckId: string): string {
  return join(decksDir, deckId, STATE_DIR, ACCESS_FILE);
}

/**
 * The checkout's backend. The write is a read, a compare and a rename; two processes on one
 * machine are serialized by the deck's write lock when the caller takes it (file-store.ts
 * `withDeckLock`), and the etag compare catches the rest.
 */
export function fileAccessStore(decksDir: string): AccessStore {
  const readAt = (deckId: string): StoredAccess | null => {
    const path = accessFilePath(decksDir, deckId);
    if (!existsSync(path)) return null;
    const bytes = new Uint8Array(readFileSync(path));
    return { record: parseAccessRecord(bytes, path), etag: accessEtag(bytes) };
  };
  return {
    kind: 'file',
    async read(deckId) {
      return readAt(deckId);
    },
    async write(deckId, record, options = {}) {
      const current = readAt(deckId);
      if (options.ifMatch !== undefined) {
        const have = current === null ? null : current.etag;
        if (have !== options.ifMatch) throw new AccessPreconditionError(deckId, current);
      }
      const bytes = accessBytes(record);
      writeAtomic(accessFilePath(decksDir, deckId), bytes);
      return { record: accessRecordSchema.parse(record), etag: accessEtag(bytes) };
    },
    async remove(deckId) {
      rmSync(accessFilePath(decksDir, deckId), { force: true });
    },
  };
}

/**
 * The Blob backend over the private client (SPEC-3 2.5): `decks/<id>/access.json`, read with
 * the client's uncached `get`, written with `ifMatch` on the etag the caller read, or with
 * overwrite refused for a record that must not exist yet.
 */
export function blobAccessStore(client: BlobClient): AccessStore {
  const pathOf = (deckId: string): string => `${deckPrefix(deckId)}${ACCESS_FILE}`;
  const readAt = async (deckId: string): Promise<StoredAccess | null> => {
    const fetched = await client.get(pathOf(deckId));
    if (fetched === null) return null;
    return {
      record: parseAccessRecord(fetched.bytes, pathOf(deckId)),
      etag: fetched.entry.version,
    };
  };
  return {
    kind: 'blob',
    read: readAt,
    async write(deckId, record, options = {}) {
      const bytes = accessBytes(record);
      try {
        const entry = await client.put(pathOf(deckId), bytes, {
          overwrite: options.ifMatch !== null,
          contentType: 'application/json',
          ...(typeof options.ifMatch === 'string' ? { ifMatch: options.ifMatch } : {}),
        });
        return { record: accessRecordSchema.parse(record), etag: entry.version };
      } catch (error) {
        if (error instanceof BlobPreconditionError || error instanceof BlobExistsError) {
          throw new AccessPreconditionError(deckId, await readAt(deckId));
        }
        throw error;
      }
    },
    async remove(deckId) {
      await client.del([pathOf(deckId)]);
    },
  };
}

/** An in memory backend for tests and the tmp overlay's fallback. */
export function memoryAccessStore(): AccessStore & { readonly records: Map<string, StoredAccess> } {
  const records = new Map<string, StoredAccess>();
  return {
    kind: 'memory',
    records,
    async read(deckId) {
      return records.get(deckId) ?? null;
    },
    async write(deckId, record, options = {}) {
      const current = records.get(deckId) ?? null;
      if (options.ifMatch !== undefined) {
        const have = current === null ? null : current.etag;
        if (have !== options.ifMatch) throw new AccessPreconditionError(deckId, current);
      }
      const stored = {
        record: accessRecordSchema.parse(record),
        etag: accessEtag(accessBytes(record)),
      };
      records.set(deckId, stored);
      return stored;
    },
    async remove(deckId) {
      records.delete(deckId);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The cache (SPEC-3 6.1: 60 s, dropped on every write, with a message to the other instances)

/** What carries the drop message between instances: Redis pub/sub hosted, a memory bus on a checkout. */
export type AccessBus = {
  publish: (deckId: string) => Promise<void>;
  subscribe: (onDrop: (deckId: string) => void) => () => void;
};

export function memoryAccessBus(): AccessBus {
  const listeners = new Set<(deckId: string) => void>();
  return {
    async publish(deckId) {
      for (const listener of [...listeners]) listener(deckId);
    },
    subscribe(onDrop) {
      listeners.add(onDrop);
      return () => {
        listeners.delete(onDrop);
      };
    },
  };
}

export type CachedAccessOptions = {
  /** how long a read is trusted; 60 s per SPEC-3 6.1 */
  ttlMs?: number;
  now?: () => number;
  bus?: AccessBus;
};

export type CachedAccessStore = AccessStore & {
  /** forgets one deck's cached record (an `access` event, a test) */
  drop: (deckId: string) => void;
  /** stops the bus subscription */
  close: () => void;
};

/**
 * A read through cache in front of a backend: a page load is one lookup instead of one store
 * read; a write on this instance drops the entry and publishes the deck id so every other
 * instance drops its own. A null (no record) is cached too, for the same 60 s.
 */
export function cachedAccessStore(
  inner: AccessStore,
  options: CachedAccessOptions = {},
): CachedAccessStore {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, { value: StoredAccess | null; at: number }>();
  const unsubscribe = options.bus?.subscribe((deckId) => cache.delete(deckId)) ?? (() => {});
  return {
    kind: inner.kind,
    async read(deckId) {
      const hit = cache.get(deckId);
      if (hit !== undefined && now() - hit.at < ttlMs) return hit.value;
      const value = await inner.read(deckId);
      cache.set(deckId, { value, at: now() });
      return value;
    },
    async write(deckId, record, writeOptions) {
      cache.delete(deckId);
      try {
        const stored = await inner.write(deckId, record, writeOptions);
        cache.set(deckId, { value: stored, at: now() });
        return stored;
      } finally {
        await options.bus?.publish(deckId);
      }
    },
    async remove(deckId) {
      cache.delete(deckId);
      await inner.remove(deckId);
      await options.bus?.publish(deckId);
    },
    drop(deckId) {
      cache.delete(deckId);
    },
    close() {
      unsubscribe();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The per identity index (SPEC-3 6.7; research 09 5.1): users/<principalId>/decks.json

export type DeckIndex = {
  owned: string[];
  shared: {
    deckId: string;
    role: 'viewer' | 'commenter' | 'editor';
    since: string;
    via?: 'grant' | 'link';
  }[];
  trashed: { deckId: string; at: string }[];
  recent: { deckId: string; at: string }[];
  /** a deck whose owner asked this principal to take it over (SPEC-3 6.5) */
  pendingOwnership?: string[];
};

export const deckIndexSchema = z.strictObject({
  owned: z.array(z.string().min(1)),
  shared: z.array(
    z.strictObject({
      deckId: z.string().min(1),
      role: z.enum(['viewer', 'commenter', 'editor']),
      since: z.string(),
      via: z.enum(['grant', 'link']).optional(),
    }),
  ),
  trashed: z.array(z.strictObject({ deckId: z.string().min(1), at: z.string() })),
  recent: z.array(z.strictObject({ deckId: z.string().min(1), at: z.string() })),
  pendingOwnership: z.array(z.string().min(1)).optional(),
}) satisfies z.ZodType<DeckIndex>;

export function emptyDeckIndex(): DeckIndex {
  return { owned: [], shared: [], trashed: [], recent: [] };
}

/** Recent is written at most once an hour per deck (research 09 5.1), so opens do not amplify writes. */
export const RECENT_WRITE_SPACING_MS = 60 * 60_000;
/** The most recent decks kept per identity. */
export const RECENT_MAX = 50;

export type IndexStore = {
  read: (principalId: string) => Promise<DeckIndex>;
  /** reads, applies `update` and writes with the etag read, retrying once on a stale etag */
  update: (
    principalId: string,
    update: (index: DeckIndex) => DeckIndex | null,
  ) => Promise<DeckIndex>;
};

/** A file safe name for a principal id: everything outside `[A-Za-z0-9_-]` becomes `_`. */
export function principalFolder(principalId: string): string {
  return principalId.replace(/[^A-Za-z0-9_-]/g, '_');
}

function parseIndex(bytes: Uint8Array, file: string): DeckIndex {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return emptyDeckIndex();
  }
  const parsed = deckIndexSchema.safeParse(raw);
  if (!parsed.success) throw new TypeError(`${file} is not a deck index`);
  return parsed.data;
}

/** `<stateDir>/users/<principalId>/decks.json` on a checkout and the tmp overlay. */
export function fileIndexStore(stateDir: string): IndexStore {
  const pathOf = (principalId: string): string =>
    join(stateDir, 'users', principalFolder(principalId), 'decks.json');
  const readAt = (principalId: string): DeckIndex => {
    const path = pathOf(principalId);
    if (!existsSync(path)) return emptyDeckIndex();
    return parseIndex(new Uint8Array(readFileSync(path)), path);
  };
  return {
    async read(principalId) {
      return readAt(principalId);
    },
    async update(principalId, update) {
      const current = readAt(principalId);
      const next = update(current);
      if (next === null) return current;
      writeAtomic(pathOf(principalId), new TextEncoder().encode(canonicalJson(next)));
      return next;
    },
  };
}

/** `users/<principalId>/decks.json` on the private Blob store, written with `ifMatch`. */
export function blobIndexStore(client: BlobClient): IndexStore {
  const pathOf = (principalId: string): string =>
    `users/${principalFolder(principalId)}/decks.json`;
  const readAt = async (
    principalId: string,
  ): Promise<{ index: DeckIndex; etag: string | null }> => {
    const fetched = await client.get(pathOf(principalId));
    if (fetched === null) return { index: emptyDeckIndex(), etag: null };
    return { index: parseIndex(fetched.bytes, pathOf(principalId)), etag: fetched.entry.version };
  };
  return {
    async read(principalId) {
      return (await readAt(principalId)).index;
    },
    async update(principalId, update) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { index, etag } = await readAt(principalId);
        const next = update(index);
        if (next === null) return index;
        try {
          await client.put(pathOf(principalId), new TextEncoder().encode(canonicalJson(next)), {
            overwrite: etag !== null,
            contentType: 'application/json',
            ...(etag === null ? {} : { ifMatch: etag }),
          });
          return next;
        } catch (error) {
          if (error instanceof BlobPreconditionError || error instanceof BlobExistsError) continue;
          throw error;
        }
      }
      throw new AccessPreconditionError(principalId, null);
    },
  };
}

export function memoryIndexStore(): IndexStore & { readonly indexes: Map<string, DeckIndex> } {
  const indexes = new Map<string, DeckIndex>();
  return {
    indexes,
    async read(principalId) {
      return indexes.get(principalId) ?? emptyDeckIndex();
    },
    async update(principalId, update) {
      const current = indexes.get(principalId) ?? emptyDeckIndex();
      const next = update(current);
      if (next === null) return current;
      indexes.set(principalId, next);
      return next;
    },
  };
}

/** The pure updates the actions apply to an index. */
export const indexUpdates = {
  owned(deckId: string): (index: DeckIndex) => DeckIndex | null {
    return (index) =>
      index.owned.includes(deckId) ? null : { ...index, owned: [...index.owned, deckId] };
  },
  unowned(deckId: string): (index: DeckIndex) => DeckIndex | null {
    return (index) =>
      index.owned.includes(deckId)
        ? { ...index, owned: index.owned.filter((id) => id !== deckId) }
        : null;
  },
  shared(
    deckId: string,
    role: 'viewer' | 'commenter' | 'editor',
    since: string,
    via: 'grant' | 'link' = 'grant',
  ): (index: DeckIndex) => DeckIndex | null {
    return (index) => {
      const rest = index.shared.filter((row) => row.deckId !== deckId);
      const existing = index.shared.find((row) => row.deckId === deckId);
      if (existing !== undefined && existing.role === role && existing.via === via) return null;
      return { ...index, shared: [...rest, { deckId, role, since, via }] };
    };
  },
  unshared(deckId: string): (index: DeckIndex) => DeckIndex | null {
    return (index) =>
      index.shared.some((row) => row.deckId === deckId)
        ? { ...index, shared: index.shared.filter((row) => row.deckId !== deckId) }
        : null;
  },
  trashed(deckId: string, at: string): (index: DeckIndex) => DeckIndex | null {
    return (index) => ({
      ...index,
      trashed: [...index.trashed.filter((row) => row.deckId !== deckId), { deckId, at }],
    });
  },
  restored(deckId: string): (index: DeckIndex) => DeckIndex | null {
    return (index) =>
      index.trashed.some((row) => row.deckId === deckId)
        ? { ...index, trashed: index.trashed.filter((row) => row.deckId !== deckId) }
        : null;
  },
  removed(deckId: string): (index: DeckIndex) => DeckIndex | null {
    return (index) => ({
      owned: index.owned.filter((id) => id !== deckId),
      shared: index.shared.filter((row) => row.deckId !== deckId),
      trashed: index.trashed.filter((row) => row.deckId !== deckId),
      recent: index.recent.filter((row) => row.deckId !== deckId),
      ...(index.pendingOwnership === undefined
        ? {}
        : { pendingOwnership: index.pendingOwnership.filter((id) => id !== deckId) }),
    });
  },
  /** at most once an hour per deck; null when the last open is inside the window */
  recent(deckId: string, at: string): (index: DeckIndex) => DeckIndex | null {
    return (index) => {
      const last = index.recent.find((row) => row.deckId === deckId);
      if (last !== undefined && Date.parse(at) - Date.parse(last.at) < RECENT_WRITE_SPACING_MS)
        return null;
      const rest = index.recent.filter((row) => row.deckId !== deckId);
      return { ...index, recent: [{ deckId, at }, ...rest].slice(0, RECENT_MAX) };
    };
  },
  pendingOwnership(deckId: string, on: boolean): (index: DeckIndex) => DeckIndex | null {
    return (index) => {
      const current = index.pendingOwnership ?? [];
      const has = current.includes(deckId);
      if (on === has) return null;
      const next = on ? [...current, deckId] : current.filter((id) => id !== deckId);
      return { ...index, pendingOwnership: next };
    };
  },
};

// ---------------------------------------------------------------------------------------------
// The head cache (SPEC-3 6.7): head:<deckId>, written by the commit path, read by the home page

export type HeadCache = {
  get: (deckIds: readonly string[]) => Promise<Map<string, DeckHead>>;
  set: (head: DeckHead) => Promise<void>;
  drop: (deckId: string) => Promise<void>;
};

/** The two ioredis methods the cache needs, structurally, so the store carries no Redis import. */
export type HeadKv = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlMs: number) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

/** Heads live a day in the cache; the commit path refreshes them on every write. */
export const HEAD_TTL_MS = 24 * 60 * 60_000;

export function kvHeadCache(kv: HeadKv, keyOf: (deckId: string) => string): HeadCache {
  return {
    async get(deckIds) {
      const out = new Map<string, DeckHead>();
      await Promise.all(
        deckIds.map(async (deckId) => {
          const raw = await kv.get(keyOf(deckId));
          if (raw === null) return;
          try {
            out.set(deckId, JSON.parse(raw) as DeckHead);
          } catch {
            // a body that does not parse is a miss
          }
        }),
      );
      return out;
    },
    async set(head) {
      await kv.set(keyOf(head.id), JSON.stringify(head), HEAD_TTL_MS);
    },
    async drop(deckId) {
      await kv.del(keyOf(deckId));
    },
  };
}

export function memoryHeadCache(): HeadCache & { readonly heads: Map<string, DeckHead> } {
  const heads = new Map<string, DeckHead>();
  return {
    heads,
    async get(deckIds) {
      const out = new Map<string, DeckHead>();
      for (const id of deckIds) {
        const head = heads.get(id);
        if (head !== undefined) out.set(id, head);
      }
      return out;
    },
    async set(head) {
      heads.set(head.id, head);
    },
    async drop(deckId) {
      heads.delete(deckId);
    },
  };
}

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
// with the current record attached. Beside the record, a link hash index (`links/<hex>` to the
// deck and link id, VERIFICATION-3 finding 34 F2) lets the exchange read one record instead of
// every deck's. A Blob conflict is matched by class and by name: the deployed function loads
// this module twice (the Nitro server chunk that builds the Blob client and the SSR chunk that
// runs the store), so an `instanceof` across the two copies fails and the raw store sentence
// ("… changed in the Blob store since it was read") reached a person in the production walk.
// Since the focus round's second cycle every document this module writes to the Blob store goes
// up with an immutable copy under its md5 first (`putWithCopy`, `immutableCopyPath`) and every
// read is proven against `head()` with that copy as the read that holds when the document's own
// url serves a stale body (`provenGet`). Framework free; the studio's server/access.ts wires it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AccessRecord, ShareLink } from '@turboslide/schema/access';
import { accessRecordSchema } from '@turboslide/schema/access';
import { canonicalJson } from '@turboslide/schema/json';
import { z } from 'zod';

import type { BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
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

/**
 * True for the store's two conflict classes, whichever module copy threw them (a bundle that
 * carries two copies of blob-store.ts defeats `instanceof`; the name survives).
 */
export function isBlobConflict(error: unknown): boolean {
  if (error instanceof BlobPreconditionError || error instanceof BlobExistsError) return true;
  return (
    error instanceof Error &&
    (error.name === 'BlobPreconditionError' || error.name === 'BlobExistsError')
  );
}

/** True for an AccessPreconditionError from any copy of this module. */
export function isAccessPrecondition(error: unknown): error is AccessPreconditionError {
  if (error instanceof AccessPreconditionError) return true;
  return error instanceof Error && error.name === 'AccessPreconditionError' && 'current' in error;
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

// ---------------------------------------------------------------------------------------------
// The proven read (the focus round, docs/FOCUS.md section 5 rank 1; VERIFICATION.md pass 2
// F-share-copy, F-share-404, F-missing-record)

/** Reads a body at its public url past the CDN's cached copy; null when the read fails. */
export type FreshBodyFetch = (url: string, version: string) => Promise<Uint8Array | null>;

export type ProvenReadOptions = {
  /**
   * the read past the CDN when the client's body does not hash to the head's version; the default
   * fetches the url with a query the CDN keys by (measured 2026-09-16: a new query is a MISS to
   * the store, the plain url may be a stale HIT for a while after an overwrite)
   */
  fetchFresh?: FreshBodyFetch;
  /** how many times the client's read is tried again after the url read; 2 by default */
  retries?: number;
  /** the wait before each try again, in ms; 120 by default */
  waitMs?: number;
  /** the clock's sleep, for tests */
  sleep?: (ms: number) => Promise<void>;
  /**
   * the immutable copy read when the document's own body does not prove (`immutableCopyPath` by
   * default); false for a document that is never overwritten and so has no copy
   */
  copyOf?: ((pathname: string, version: string) => string) | false;
};

const MD5_VERSION = /^"[0-9a-f]{32}"$/;

/** The hex of an md5 version, without the quotes and a weak validator's prefix. */
export function versionHex(version: string): string {
  return version.replace(/^W\//, '').replace(/"/g, '');
}

/**
 * The folder the immutable copies of a stored document live under: the deck's or the user's own
 * state folder (`decks/<id>/.turboslide/copies/`, `users/<folder>/.turboslide/copies/`), which
 * the mirror never pulls (`blob-store.ts` `isMirroredDocument` leaves `.turboslide/` out) and
 * `deck.remove` deletes with the prefix; for any other path, a state folder beside the file.
 */
function copiesFolderOf(pathname: string): string {
  const segments = pathname.split('/');
  const root =
    (segments[0] === 'decks' || segments[0] === 'users') && segments.length >= 3
      ? `${segments[0]}/${segments[1]}/`
      : `${segments.slice(0, -1).join('/')}${segments.length > 1 ? '/' : ''}`;
  return `${root}${STATE_DIR}/copies/`;
}

/**
 * The immutable copy of a document at one version (the focus round, cycle 2 fix round; the rule
 * `snapshots/<md5>.json` applies to `deck.json`): `<folder>/.turboslide/copies/<md5 hex>.json`,
 * written before the document itself and never overwritten with other bytes, so the CDN can hold
 * no copy of it from before a write, and a reader that learned the version from `head()` reads the
 * body the writer stored whatever the CDN serves at the document's own url. Measured on the
 * cycle 2 enforce preview: the plain url and the url with a cache busting query both served the
 * access record from before a mint for seconds on the function's edge (the dialog refused with
 * "the access record is at revision 0, not 1", the exchange answered 404 for a link the record
 * did not yet list), while from another edge every read was a miss to the store.
 */
export function immutableCopyPath(pathname: string, version: string): string {
  return `${copiesFolderOf(pathname)}${versionHex(version)}.json`;
}

/**
 * Stores the immutable copy of `bytes` under their md5, then the document itself with the
 * caller's options; the copy goes first so no version `head()` ever names is without its copy.
 * The copy's put overwrites: two writers of the same bytes store the same copy.
 */
export async function putWithCopy(
  client: BlobClient,
  pathname: string,
  bytes: Uint8Array,
  options: BlobPutOptions,
): Promise<BlobEntry> {
  await client.put(immutableCopyPath(pathname, accessEtag(bytes)), bytes, {
    overwrite: true,
    contentType: options.contentType ?? 'application/json',
  });
  return client.put(pathname, bytes, options);
}

/** The default url read: the same url with `?v=<hex>` appended, so the CDN cannot answer the cached copy. */
export const fetchFreshByQuery: FreshBodyFetch = async (url, version) => {
  const hex = version.replace(/^W\//, '').replace(/"/g, '');
  const target = `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(hex)}`;
  const response = await fetch(target, { cache: 'no-store' });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * The current bytes of a blob, proven (the rule `packages/store/src/blob-store.ts` `pull()` applies
 * to `deck.json`, now on the records the studio reads on every request): `head()` answers the
 * store's version at once while the body a public url serves may be the CDN's copy from before
 * the last overwrite, or a cached miss for a path written since. So a body counts only when its
 * md5 is the version `head()` names. A body that does not is read from the document's immutable
 * copy under that version (`immutableCopyPath`, stored before the document by `putWithCopy`; a
 * path the CDN never served stale, since no other bytes were ever stored under it), then at the
 * url with a query the CDN keys by, then the client is asked again after a short wait. When no
 * read proves the body (a document written before the copies existed, behind a lagging edge),
 * the last body the client gave is answered under its own version, so a write based on it is
 * refused as stale rather than committed over a newer record. A version that is not an md5 (a
 * client that reports the upload time) takes the client's body as it is. Measured on the enforce
 * preview 2026-09-16: a second `share.createLink` 155 ms after the first read the record at
 * revision 0 through the plain read and was refused ("the access record is at revision 0, not
 * 1"), and on the cycle 2 preview the url read with the query served the same stale body (the
 * verifier's C2-F2: "revision 0, not 1" with the store at revision 3); the Share dialog's second
 * Copy link, the link exchange's lookup and the record of a fresh deck all read through this path.
 */
export async function provenGet(
  client: BlobClient,
  pathname: string,
  options: ProvenReadOptions = {},
): Promise<{ entry: BlobEntry; bytes: Uint8Array } | null> {
  const head = await client.head(pathname);
  if (head === null) return null;
  const wanted = head.version;
  if (!MD5_VERSION.test(wanted)) return client.get(pathname);
  const proves = (bytes: Uint8Array): boolean => accessEtag(bytes) === wanted;
  const fetchFresh = options.fetchFresh ?? fetchFreshByQuery;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tries = 1 + Math.max(0, options.retries ?? 2);
  const copyOf = options.copyOf === undefined ? immutableCopyPath : options.copyOf;
  let last: { entry: BlobEntry; bytes: Uint8Array } | null = null;
  let copyMissing = copyOf === false;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt > 0) await sleep(options.waitMs ?? 120);
    const got = await client.get(pathname).catch(() => null);
    if (got !== null) {
      if (proves(got.bytes)) return { entry: { ...got.entry, version: wanted }, bytes: got.bytes };
      last = got;
    }
    if (!copyMissing && copyOf !== false) {
      // the copy under the version head() named: the bytes the writer stored, from a path no
      // edge served before they existed; absent (null, not an error) for a document written
      // before the copies, which the later tries then skip
      const copy = await client.get(copyOf(pathname, wanted)).then(
        (got) => ({ ok: true as const, got }),
        () => ({ ok: false as const, got: null }),
      );
      if (copy.got !== null && proves(copy.got.bytes))
        return { entry: head, bytes: copy.got.bytes };
      if (copy.ok && copy.got === null) copyMissing = true;
    }
    const fresh = await fetchFresh(head.url, wanted).catch(() => null);
    if (fresh !== null && proves(fresh)) return { entry: head, bytes: fresh };
  }
  return last;
}

/**
 * The Blob backend over the store's client (SPEC-3 2.5): `decks/<id>/access.json`, read through
 * `provenGet` (the head's version against the body's md5, the immutable copy under that version
 * as the second read, the url past the CDN as the third), written with its copy first and then
 * with `ifMatch` on the etag the caller read, or with overwrite refused for a record that must
 * not exist yet.
 */
export function blobAccessStore(client: BlobClient, options: ProvenReadOptions = {}): AccessStore {
  const pathOf = (deckId: string): string => `${deckPrefix(deckId)}${ACCESS_FILE}`;
  const readAt = async (deckId: string): Promise<StoredAccess | null> => {
    const fetched = await provenGet(client, pathOf(deckId), options);
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
        // the immutable copy first, then the record (putWithCopy): a reader whose edge still
        // serves the record from before this write proves the copy under the head's version
        const entry = await putWithCopy(client, pathOf(deckId), bytes, {
          overwrite: options.ifMatch !== null,
          contentType: 'application/json',
          ...(typeof options.ifMatch === 'string' ? { ifMatch: options.ifMatch } : {}),
        });
        return { record: accessRecordSchema.parse(record), etag: entry.version };
      } catch (error) {
        if (isBlobConflict(error)) {
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
 * instance drops its own. A null (no record) is cached too, for the same 60 s, except on the
 * blob tier: there a deck created a moment ago on another instance can read as recordless on
 * this one, and a cached null would hold that answer for the window while `decide()` treats a
 * recordless deck as the legacy open deck (VERIFICATION F-missing-record; b7 C2-R13), so a null
 * is read again on the next call and a record, once found, is cached as before.
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
      if (value !== null || inner.kind !== 'blob') cache.set(deckId, { value, at: now() });
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
    /** the link the row came from (`via: 'link'`), so the grant follows the link's revocation (SPEC-3 6.4) */
    linkId?: string;
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
      linkId: z.string().min(1).optional(),
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

/** `users/<principalId>/decks.json` on the Blob store, read through `provenGet`, written with its immutable copy first and then with `ifMatch`. */
export function blobIndexStore(client: BlobClient, options: ProvenReadOptions = {}): IndexStore {
  const pathOf = (principalId: string): string =>
    `users/${principalFolder(principalId)}/decks.json`;
  const readAt = async (
    principalId: string,
  ): Promise<{ index: DeckIndex; etag: string | null }> => {
    const fetched = await provenGet(client, pathOf(principalId), options);
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
          await putWithCopy(
            client,
            pathOf(principalId),
            new TextEncoder().encode(canonicalJson(next)),
            {
              overwrite: etag !== null,
              contentType: 'application/json',
              ...(etag === null ? {} : { ifMatch: etag }),
            },
          );
          return next;
        } catch (error) {
          if (isBlobConflict(error)) continue;
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
    linkId?: string,
  ): (index: DeckIndex) => DeckIndex | null {
    return (index) => {
      const rest = index.shared.filter((row) => row.deckId !== deckId);
      const existing = index.shared.find((row) => row.deckId === deckId);
      if (
        existing !== undefined &&
        existing.role === role &&
        existing.via === via &&
        existing.linkId === linkId
      )
        return null;
      return {
        ...index,
        shared: [
          ...rest,
          { deckId, role, since, via, ...(linkId === undefined ? {} : { linkId }) },
        ],
      };
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
// The link hash index (SPEC-3 6.4; VERIFICATION-3 finding 34 F2): links/<hex> to the deck

/** What the index holds for a token hash: the deck the link is on and the link's id. */
export type LinkIndexEntry = { deckId: string; linkId: string };

export type LinkIndex = {
  /** the entry for `sha256:<hex>`, or null when no link with that hash was ever indexed here */
  get: (hash: string) => Promise<LinkIndexEntry | null>;
  /** writes the entry; idempotent, so two instances indexing one link never conflict */
  put: (hash: string, entry: LinkIndexEntry) => Promise<void>;
  remove: (hash: string) => Promise<void>;
};

/** Where the index lives on the Blob store and under the state folder. */
export const LINKS_PREFIX = 'links/';

const HASH_PATTERN = /^sha256:([0-9a-f]{64})$/;

/**
 * The index key of a token hash: the hex alone, so the path holds no colon. A value that is not
 * `sha256:<hex>` is a TypeError; the exchange validates the token's grammar before it hashes.
 */
export function linkIndexKey(hash: string): string {
  const match = HASH_PATTERN.exec(hash);
  if (match === null) throw new TypeError('a link index key is sha256:<hex>');
  return `${LINKS_PREFIX}${match[1]}.json`;
}

const linkIndexEntrySchema = z.strictObject({
  deckId: z.string().min(1),
  linkId: z.string().min(1),
}) satisfies z.ZodType<LinkIndexEntry>;

function parseLinkIndexEntry(bytes: Uint8Array): LinkIndexEntry | null {
  try {
    const parsed = linkIndexEntrySchema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    // a torn or foreign body is a miss; the lookup falls back to the record scan
    return null;
  }
}

function linkIndexBytes(entry: LinkIndexEntry): Uint8Array {
  return new TextEncoder().encode(canonicalJson(linkIndexEntrySchema.parse(entry)));
}

/**
 * The hashes `next` carries that `previous` did not: the links a share write minted, which the
 * writer indexes before it saves the record. A record with no previous (the first write) indexes
 * every link it holds.
 */
export function newLinkHashes(previous: AccessRecord | null, next: AccessRecord): ShareLink[] {
  const known = new Set(previous?.links.map((link) => link.hash) ?? []);
  return next.links.filter((link) => !known.has(link.hash));
}

/** `<stateDir>/links/<hex>.json` on a checkout and the tmp overlay. */
export function fileLinkIndex(stateDir: string): LinkIndex {
  const pathOf = (hash: string): string => join(stateDir, linkIndexKey(hash));
  return {
    async get(hash) {
      const path = pathOf(hash);
      if (!existsSync(path)) return null;
      return parseLinkIndexEntry(new Uint8Array(readFileSync(path)));
    },
    async put(hash, entry) {
      writeAtomic(pathOf(hash), linkIndexBytes(entry));
    },
    async remove(hash) {
      rmSync(pathOf(hash), { force: true });
    },
  };
}

/** `links/<hex>.json` on the Blob store the records live on, read through `provenGet` (one body per hash, never overwritten with other bytes, so no copy); a put overwrites, so it never conflicts. */
export function blobLinkIndex(client: BlobClient, options: ProvenReadOptions = {}): LinkIndex {
  return {
    async get(hash) {
      const fetched = await provenGet(client, linkIndexKey(hash), { copyOf: false, ...options });
      return fetched === null ? null : parseLinkIndexEntry(fetched.bytes);
    },
    async put(hash, entry) {
      await client.put(linkIndexKey(hash), linkIndexBytes(entry), {
        overwrite: true,
        contentType: 'application/json',
      });
    },
    async remove(hash) {
      await client.del([linkIndexKey(hash)]);
    },
  };
}

export function memoryLinkIndex(): LinkIndex & { readonly entries: Map<string, LinkIndexEntry> } {
  const entries = new Map<string, LinkIndexEntry>();
  return {
    entries,
    async get(hash) {
      return entries.get(linkIndexKey(hash)) ?? null;
    },
    async put(hash, entry) {
      entries.set(linkIndexKey(hash), linkIndexEntrySchema.parse(entry));
    },
    async remove(hash) {
      entries.delete(linkIndexKey(hash));
    },
  };
}

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

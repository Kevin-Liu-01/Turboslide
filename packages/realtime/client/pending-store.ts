// The pending queue mirror (gslides-parity SPEC-3 0.7; report 10 F36): pending and retained
// operations are written to IndexedDB under `turboslide:pending:<deckId>:<clientId>`, at most
// 1 MB and 24 hours, so a tab closed with unsent changes offers them on the next open ("3 unsaved
// changes from this browser; Apply or Discard"). Behind an interface with a memory implementation
// for the tests and the server side render. Browser safe, no `node:`; the IndexedDB implementation
// touches `indexedDB` only when called.
import type { Mutation } from '@turboslide/schema/mutations';

export const PENDING_KEY_PREFIX = 'turboslide:pending:';
/** The mirror's size cap (SPEC-3 0.7). */
export const PENDING_MAX_BYTES = 1024 * 1024;
/** The mirror's age cap (SPEC-3 0.7). */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PENDING_DB_NAME = 'turboslide';
export const PENDING_STORE_NAME = 'pending';

/** One operation of a persisted queue: what the room client would have sent. */
export type PersistedOp = {
  opId: string;
  kind: 'edit' | 'comment';
  mutations?: Mutation[];
  comment?: Record<string, unknown>;
  /** the history label the edit carries into Version history (room-client.ts `apply` options) */
  note?: string;
  /** the stream seq once admitted (a retained op), absent while pending */
  seq?: number;
};

export type PersistedQueue = {
  key: string;
  deckId: string;
  clientId: string;
  /** ISO time of the last save */
  savedAt: string;
  entries: PersistedOp[];
};

export type PendingStore = {
  /** every queue of a deck, this browser's, newest first; stale ones (24 h) are dropped on read */
  load: (deckId: string, now?: number) => Promise<PersistedQueue[]>;
  /** writes a queue; an empty one removes the key; a queue over 1 MB keeps its newest entries */
  save: (queue: PersistedQueue) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export function pendingKey(deckId: string, clientId: string): string {
  return `${PENDING_KEY_PREFIX}${deckId}:${clientId}`;
}

/** The deck id of a key, or null for a key outside the prefix. */
export function deckOfPendingKey(key: string): string | null {
  if (!key.startsWith(PENDING_KEY_PREFIX)) return null;
  const rest = key.slice(PENDING_KEY_PREFIX.length);
  const colon = rest.lastIndexOf(':');
  return colon <= 0 ? null : rest.slice(0, colon);
}

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Drops the oldest entries until the queue fits the cap (SPEC-3 0.7). */
export function trimQueue(queue: PersistedQueue, maxBytes = PENDING_MAX_BYTES): PersistedQueue {
  let out = queue;
  while (out.entries.length > 0 && bytesOf(out) > maxBytes) {
    out = { ...out, entries: out.entries.slice(1) };
  }
  return out;
}

export function isStaleQueue(
  queue: PersistedQueue,
  now: number,
  maxAgeMs = PENDING_MAX_AGE_MS,
): boolean {
  const saved = Date.parse(queue.savedAt);
  return !Number.isFinite(saved) || now - saved > maxAgeMs;
}

/** The count the offer names: pending operations, retained ones excluded (they landed). */
export function unsavedCount(queue: PersistedQueue): number {
  return queue.entries.filter((entry) => entry.seq === undefined).length;
}

export function memoryPendingStore(): PendingStore & {
  readonly queues: Map<string, PersistedQueue>;
} {
  const queues = new Map<string, PersistedQueue>();
  return {
    queues,
    async load(deckId, now = Date.now()) {
      const out: PersistedQueue[] = [];
      for (const [key, queue] of [...queues]) {
        if (queue.deckId !== deckId) continue;
        if (isStaleQueue(queue, now)) {
          queues.delete(key);
          continue;
        }
        out.push(queue);
      }
      return out.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    },
    async save(queue) {
      if (queue.entries.length === 0) {
        queues.delete(queue.key);
        return;
      }
      queues.set(queue.key, trimQueue(queue));
    },
    async remove(key) {
      queues.delete(key);
    },
  };
}

type IdbLike = {
  open: (name: string, version?: number) => IDBOpenDBRequest;
  deleteDatabase?: (name: string) => IDBOpenDBRequest;
};

/**
 * Forget this browser (SPEC-3 7.4): the IndexedDB pending mirror and every `turboslide:` key of
 * localStorage go together with the anonymous cookie, so a shared machine hands over clean. A
 * browser without either store resolves at once.
 */
export async function clearPendingMirror(
  options: { indexedDB?: IdbLike; dbName?: string; localStorage?: Storage } = {},
): Promise<void> {
  const local =
    options.localStorage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (local !== undefined) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < local.length; i += 1) {
        const key = local.key(i);
        if (key !== null && key.startsWith(PENDING_KEY_PREFIX.split(':')[0] + ':'))
          doomed.push(key);
      }
      for (const key of doomed) local.removeItem(key);
    } catch {
      // a storage the browser refuses: nothing to clear
    }
  }
  const factory =
    options.indexedDB ?? (typeof indexedDB === 'undefined' ? null : (indexedDB as IdbLike));
  if (factory === null || typeof factory.deleteDatabase !== 'function') return;
  await new Promise<void>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.deleteDatabase!(options.dbName ?? PENDING_DB_NAME);
    } catch {
      resolve();
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * The IndexedDB implementation: one object store keyed by the queue key. Every call opens the
 * database (a few milliseconds) so a page holds no connection open; a browser without IndexedDB
 * (a private window that refuses it) makes every call a no-op that resolves.
 */
export function indexedDbPendingStore(
  options: { indexedDB?: IdbLike; dbName?: string } = {},
): PendingStore {
  const dbName = options.dbName ?? PENDING_DB_NAME;
  const idb = (): IdbLike | null =>
    options.indexedDB ?? (typeof indexedDB === 'undefined' ? null : (indexedDB as IdbLike));

  const open = (): Promise<IDBDatabase | null> => {
    const factory = idb();
    if (factory === null) return Promise.resolve(null);
    return new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(dbName, 1);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PENDING_STORE_NAME)) {
          db.createObjectStore(PENDING_STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  };

  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    const db = await open();
    if (db === null) return fallback;
    try {
      const tx = db.transaction(PENDING_STORE_NAME, mode);
      const result = await run(tx.objectStore(PENDING_STORE_NAME));
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      return result;
    } catch {
      return fallback;
    } finally {
      db.close();
    }
  };

  return {
    async load(deckId, now = Date.now()) {
      const all = await withStore('readonly', (store) => request(store.getAll()), [] as unknown[]);
      const out: PersistedQueue[] = [];
      const stale: string[] = [];
      for (const raw of all) {
        const queue = raw as PersistedQueue;
        if (typeof queue?.key !== 'string' || queue.deckId !== deckId) continue;
        if (isStaleQueue(queue, now)) stale.push(queue.key);
        else out.push(queue);
      }
      if (stale.length > 0) {
        await withStore(
          'readwrite',
          async (store) => {
            for (const key of stale) await request(store.delete(key));
          },
          undefined,
        );
      }
      return out.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    },
    async save(queue) {
      if (queue.entries.length === 0) {
        await withStore('readwrite', (store) => request(store.delete(queue.key)), undefined);
        return;
      }
      const trimmed = trimQueue(queue);
      await withStore('readwrite', (store) => request(store.put(trimmed)), undefined);
    },
    async remove(key) {
      await withStore('readwrite', (store) => request(store.delete(key)), undefined);
    },
  };
}

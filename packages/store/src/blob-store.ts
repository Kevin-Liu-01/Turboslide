// The Blob backend (the hosting round; SPEC 11 "a store with the same interface"). A Vercel Blob
// store holds each deck under `decks/<id>/` in the layout of SPEC 4.1: `deck.json`,
// `slides/<slideId>.json`, `versions/<n>.json`, `leases.json`, the sidecars, and `assets/<file>`
// (public URLs the browser reads directly). The BlobStore keeps a mirror of one deck's documents
// in the overlay (tmp-store.ts) and is a FileStore over that mirror with a sync step around every
// call: a read asks the store for the manifest's version (one `head`) and pulls the changed files
// when it moved; a write pulls first, applies through FileStore (so applyWrite, leases and the
// version log are the same code as on disk), then pushes `deck.json` conditionally on the version
// it synced (`ifMatch`), the changed slides and the version record. Two instances writing at once
// therefore end with one committed write and one conflict outcome, never two manifests. The
// store talks to Blob through the small BlobClient below, so the tests run it against an
// in-memory fake (blob-fake.ts) and the studio against @vercel/blob (blob-vercel.ts).
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, posix } from 'node:path';

import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Lease, Version, Write } from '@turboslide/schema/mutations';

import { STATE_DIR, loadDeckDir, openFileStore } from './file-store.ts';
import type { FileStore } from './file-store.ts';
import type { HostedDecks, HostedOptions } from './hosted.ts';
import { assetPathWithin, factsFor } from './hosted.ts';
import { eachLimit, isAssetKey, isSafeKey } from './seed.ts';
import type {
  DeckStore,
  LeaseOptions,
  LeasePolicy,
  ReadResult,
  StoreListener,
  VersionRecord,
  WriteOptions,
  WriteOutcome,
} from './store.ts';
import { createDeck, deckIdFor, listDeckHeads } from './templates.ts';
import { createOverlay } from './tmp-store.ts';
import type { Overlay } from './tmp-store.ts';
import { readRevision } from './watch.ts';

// ---------------------------------------------------------------------------------------------
// The client the store talks to

/** One stored blob as the client reports it. `version` is the etag (uploadedAt when absent). */
export type BlobEntry = { pathname: string; url: string; size: number; version: string };

export type BlobPutOptions = {
  /** replace an existing blob; false makes an existing pathname a BlobExistsError */
  overwrite: boolean;
  /** commit only when the stored version is this one (a BlobPreconditionError otherwise) */
  ifMatch?: string;
  contentType?: string;
};

export type BlobClient = {
  /** the entry, or null when the pathname is not stored */
  head: (pathname: string) => Promise<BlobEntry | null>;
  /** the current bytes, never a cached copy, or null */
  get: (pathname: string) => Promise<{ entry: BlobEntry; bytes: Uint8Array } | null>;
  /** every blob under a prefix, every page */
  list: (prefix: string) => Promise<BlobEntry[]>;
  /** the folders directly under a prefix, each with its trailing slash */
  folders: (prefix: string) => Promise<string[]>;
  put: (pathname: string, bytes: Uint8Array, options: BlobPutOptions) => Promise<BlobEntry>;
  /** removes what exists; a missing pathname is not an error */
  del: (pathnames: ReadonlyArray<string>) => Promise<void>;
};

export class BlobExistsError extends Error {
  readonly pathname: string;
  constructor(pathname: string) {
    super(`${pathname} exists in the Blob store already`);
    this.name = 'BlobExistsError';
    this.pathname = pathname;
  }
}

export class BlobPreconditionError extends Error {
  readonly pathname: string;
  constructor(pathname: string) {
    super(`${pathname} changed in the Blob store since it was read`);
    this.name = 'BlobPreconditionError';
    this.pathname = pathname;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function blobContentType(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

/** `decks/<id>/`: where a deck's files live in the store. */
export function deckPrefix(deckId: string): string {
  return `decks/${deckId}/`;
}

export const LEASES_FILE = 'leases.json';

/** The files the mirror manages: every document of the deck, not the twins and not the leases. */
export function isMirroredDocument(relative: string): boolean {
  return (
    relative !== LEASES_FILE &&
    !relative.startsWith('assets/') &&
    !relative.startsWith(`${STATE_DIR}/`) &&
    isSafeKey(relative)
  );
}

// ---------------------------------------------------------------------------------------------
// The mirror manifest: which version of each document this instance holds

type Manifest = { files: Record<string, string> };

function manifestPath(dir: string): string {
  return join(dir, STATE_DIR, 'blob.json');
}

function readManifest(dir: string): Manifest {
  const path = manifestPath(dir);
  if (!existsSync(path)) return { files: {} };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { files?: unknown };
    return {
      files:
        typeof raw.files === 'object' && raw.files !== null
          ? (raw.files as Record<string, string>)
          : {},
    };
  } catch {
    return { files: {} };
  }
}

function writeManifestFile(dir: string, manifest: Manifest): void {
  mkdirSync(join(dir, STATE_DIR), { recursive: true });
  writeFileSync(manifestPath(dir), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Writes through a sibling name and a rename, so a reader never sees a half-written file. */
function writeAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
}

/** The documents the mirror holds, as relative posix paths. */
function localDocuments(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== LEASES_FILE) {
      out.push(entry.name);
    } else if (entry.isDirectory() && (entry.name === 'slides' || entry.name === 'versions')) {
      for (const file of readdirSync(join(dir, entry.name))) {
        if (file.endsWith('.json')) out.push(posix.join(entry.name, file));
      }
    }
  }
  return out;
}

function serialQueue(): <T>(run: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };
}

// ---------------------------------------------------------------------------------------------
// The store

export type SyncState = {
  /** false when the store holds no manifest for the deck */
  present: boolean;
  /** true when this call pulled files */
  pulled: boolean;
  revision: number | null;
};

export type BlobStoreOptions = {
  client: BlobClient;
  deckId: string;
  /** the mirror directory: <overlay>/decks/<deckId> */
  dir: string;
  now?: () => string;
  leases?: LeasePolicy;
  /** how often watch() asks the store for the manifest's version; default 3000 ms */
  pollMs?: number;
  /** how long a sync result is trusted before the next head call; default 750 ms */
  syncTtlMs?: number;
  /** test hooks: runs between the local write and the push, to stage a race */
  hooks?: { beforeCommit?: () => Promise<void> };
};

export type BlobStore = DeckStore & {
  readonly dir: string;
  /** pulls the deck's documents when the store's manifest moved; `force` skips the time window */
  sync: (force?: boolean) => Promise<SyncState>;
  /** pulls the deck's twins that are missing locally; returns how many were written */
  pullAssets: () => Promise<number>;
};

export function openBlobStore(options: BlobStoreOptions): BlobStore {
  const { client, deckId, dir } = options;
  const prefix = deckPrefix(deckId);
  const pollMs = options.pollMs ?? 3000;
  const syncTtlMs = options.syncTtlMs ?? 750;
  const serial = serialQueue();
  const file: FileStore = openFileStore({
    dir,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.leases === undefined ? {} : { leases: options.leases }),
  });
  let syncedAt = 0;
  let lastState: SyncState = { present: false, pulled: false, revision: null };

  const pathOf = (relative: string): string => join(dir, ...relative.split('/'));

  /** Pulls every document whose version differs from the mirror's; removes what the store no longer has. */
  const pull = async (): Promise<void> => {
    const manifest = readManifest(dir);
    const entries = (await client.list(prefix))
      .map((entry) => ({ entry, relative: entry.pathname.slice(prefix.length) }))
      .filter(({ relative }) => isMirroredDocument(relative));
    const next: Manifest = { files: {} };
    await eachLimit(entries, 8, async ({ entry, relative }) => {
      const local = pathOf(relative);
      if (manifest.files[relative] === entry.version && existsSync(local)) {
        next.files[relative] = entry.version;
        return;
      }
      const fetched = await client.get(entry.pathname);
      if (fetched === null) return;
      writeAtomic(local, fetched.bytes);
      next.files[relative] = fetched.entry.version;
    });
    for (const relative of localDocuments(dir)) {
      if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
    }
    writeManifestFile(dir, next);
  };

  /** The sync step itself; callers already inside the queue use this, everyone else `sync`. */
  const syncNow = async (force: boolean): Promise<SyncState> => {
    if (!force && Date.now() - syncedAt < syncTtlMs) return lastState;
    const head = await client.head(`${prefix}deck.json`);
    let pulled = false;
    if (head === null) {
      lastState = { present: false, pulled, revision: null };
    } else {
      const manifest = readManifest(dir);
      if (manifest.files['deck.json'] !== head.version || !existsSync(pathOf('deck.json'))) {
        await pull();
        pulled = true;
      }
      lastState = { present: true, pulled, revision: readRevision(dir) };
    }
    syncedAt = Date.now();
    return lastState;
  };

  const sync = (force = false): Promise<SyncState> => serial(() => syncNow(force));

  const requirePresent = async (force = false): Promise<void> => {
    const state = await sync(force);
    if (!state.present) throw new RangeError(`No deck ${deckId} in the Blob store`);
  };

  const pullLeases = async (): Promise<void> => {
    const fetched = await client.get(`${prefix}${LEASES_FILE}`);
    if (fetched === null) rmSync(file.leaseFile, { force: true });
    else writeAtomic(file.leaseFile, fetched.bytes);
  };

  const pushLeases = async (): Promise<void> => {
    if (!existsSync(file.leaseFile)) return;
    await client.put(`${prefix}${LEASES_FILE}`, new Uint8Array(readFileSync(file.leaseFile)), {
      overwrite: true,
      contentType: blobContentType(LEASES_FILE),
    });
  };

  const putDocument = async (relative: string, ifMatch?: string): Promise<BlobEntry> =>
    client.put(`${prefix}${relative}`, new Uint8Array(readFileSync(pathOf(relative))), {
      overwrite: true,
      contentType: blobContentType(relative),
      ...(ifMatch === undefined ? {} : { ifMatch }),
    });

  /** Forgets the mirror's versions so the next sync pulls everything the store has. */
  const invalidate = (): void => {
    writeManifestFile(dir, { files: {} });
    syncedAt = 0;
  };

  /** Runs inside the write's queue slot, so it syncs directly. */
  const conflictFromStore = async (): Promise<WriteOutcome> => {
    invalidate();
    await syncNow(true);
    const current = loadDeckDir(dir).document;
    return {
      ok: false,
      code: 'conflict',
      message: `Another instance wrote revision ${current.deck.revision} to ${deckId} first; the current document is attached`,
      current,
      currentRevision: current.deck.revision,
    };
  };

  const store: BlobStore = {
    id: deckId,
    dir,
    sync,

    async read(): Promise<ReadResult> {
      await requirePresent();
      return file.read();
    },

    async revision(): Promise<number> {
      await requirePresent();
      return file.revision();
    },

    write(write: Write, writeOptions: WriteOptions = {}): Promise<WriteOutcome> {
      return serial(async () => {
        // inside the queue already: sync directly, not through serial()
        const head = await client.head(`${prefix}deck.json`);
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        const before = readManifest(dir);
        if (before.files['deck.json'] !== head.version || !existsSync(pathOf('deck.json'))) {
          await pull();
        }
        await pullLeases();
        const manifest = readManifest(dir);
        const synced = manifest.files['deck.json'];
        const outcome = await file.write(write, writeOptions);
        if (!outcome.ok) return outcome;
        try {
          if (options.hooks?.beforeCommit) await options.hooks.beforeCommit();
          // the commit point: the manifest goes first, conditional on the version this instance read
          const committed = await putDocument('deck.json', synced);
          manifest.files['deck.json'] = committed.version;
          writeManifestFile(dir, manifest);
          for (const slideId of outcome.changed) {
            const relative = `slides/${slideId}.json`;
            if (existsSync(pathOf(relative))) {
              const entry = await putDocument(relative);
              manifest.files[relative] = entry.version;
            } else {
              await client.del([`${prefix}${relative}`]);
              delete manifest.files[relative];
            }
          }
          const record = `versions/${outcome.entry.n}.json`;
          const entry = await putDocument(record);
          manifest.files[record] = entry.version;
          writeManifestFile(dir, manifest);
          syncedAt = Date.now();
          lastState = { present: true, pulled: false, revision: outcome.revision };
          return outcome;
        } catch (error) {
          if (error instanceof BlobPreconditionError) return conflictFromStore();
          // the mirror is ahead of the store: forget its versions so the next sync pulls the truth
          invalidate();
          throw error;
        }
      });
    },

    saveVersion(author: Author, note: string): Promise<Version> {
      return serial(async () => {
        const head = await client.head(`${prefix}deck.json`);
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        if (readManifest(dir).files['deck.json'] !== head.version) await pull();
        const version = await file.saveVersion(author, note);
        const relative = `versions/${version.n}.json`;
        try {
          const entry = await client.put(
            `${prefix}${relative}`,
            new Uint8Array(readFileSync(pathOf(relative))),
            { overwrite: false, contentType: blobContentType(relative) },
          );
          const manifest = readManifest(dir);
          manifest.files[relative] = entry.version;
          writeManifestFile(dir, manifest);
          return version;
        } catch (error) {
          rmSync(pathOf(relative), { force: true });
          if (error instanceof BlobExistsError) {
            invalidate();
            await pull();
            const current = loadDeckDir(dir).document;
            throw new ConflictError(
              `Another instance saved version ${version.n} of ${deckId} first`,
              { currentRevision: current.deck.revision, current },
            );
          }
          invalidate();
          throw error;
        }
      });
    },

    async listVersions(): Promise<Version[]> {
      await requirePresent();
      return file.listVersions();
    },

    async records(): Promise<VersionRecord[]> {
      await requirePresent();
      return file.records();
    },

    async documentAt(n: number): Promise<DeckDocument> {
      await requirePresent();
      return file.documentAt(n);
    },

    async documentAtRevision(revision: number): Promise<DeckDocument> {
      await requirePresent();
      return file.documentAtRevision(revision);
    },

    lease(slideId: string, holder: Author, leaseOptions: LeaseOptions = {}): Promise<Lease> {
      return serial(async () => {
        const head = await client.head(`${prefix}deck.json`);
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        if (readManifest(dir).files['deck.json'] !== head.version) await pull();
        await pullLeases();
        const lease = await file.lease(slideId, holder, leaseOptions);
        await pushLeases();
        return lease;
      });
    },

    release(slideId: string, holder: Author): Promise<Lease | undefined> {
      return serial(async () => {
        await pullLeases();
        const released = await file.release(slideId, holder);
        await pushLeases();
        return released;
      });
    },

    async leases(): Promise<Lease[]> {
      await serial(pullLeases);
      return file.leases();
    },

    watch(listener: StoreListener): () => void {
      // the store has no push channel: the manifest's version is polled, and a change of the
      // mirror's revision (a pull, or a write on this instance) is one event
      let last = readRevision(dir);
      const timer = setInterval(() => {
        void sync()
          .catch(() => undefined)
          .then(() => {
            const revision = readRevision(dir);
            if (revision === last) return;
            last = revision;
            listener({ type: 'change', revision, files: ['deck.json'] });
          });
      }, pollMs);
      timer.unref();
      return () => clearInterval(timer);
    },

    async pullAssets(): Promise<number> {
      await requirePresent();
      const entries = await client.list(`${prefix}assets/`);
      let written = 0;
      await eachLimit(entries, 8, async (entry) => {
        const relative = entry.pathname.slice(prefix.length);
        if (!isSafeKey(relative)) return;
        const local = pathOf(relative);
        if (existsSync(local)) return;
        const fetched = await client.get(entry.pathname);
        if (fetched === null) return;
        writeAtomic(local, fetched.bytes);
        written += 1;
      });
      return written;
    },
  };
  return store;
}

// ---------------------------------------------------------------------------------------------
// The collection

/**
 * Uploads every file of a deck directory. `deck.json` goes last so another instance that sees
 * the manifest sees a complete deck; with `overwrite` false an existing manifest means another
 * instance won the race and a BlobExistsError comes back. Writes the mirror manifest so the
 * deck's store starts in sync.
 */
export async function pushDeckDir(
  client: BlobClient,
  deckId: string,
  dir: string,
  options: { overwrite: boolean; log?: (line: string) => void },
): Promise<void> {
  const prefix = deckPrefix(deckId);
  const files: string[] = [];
  const walk = (folder: string, relative: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(join(folder, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
    }
  };
  walk(dir, '');
  const t = performance.now();
  const manifest: Manifest = { files: {} };
  const rest = files.filter((relative) => relative !== 'deck.json' && relative !== LEASES_FILE);
  await eachLimit(rest, 8, async (relative) => {
    const bytes = new Uint8Array(readFileSync(join(dir, ...relative.split('/'))));
    let entry: BlobEntry;
    try {
      entry = await client.put(`${prefix}${relative}`, bytes, {
        overwrite: options.overwrite,
        contentType: blobContentType(relative),
      });
    } catch (error) {
      // the seed of two cold instances at once: the file is there, which is what was wanted
      if (error instanceof BlobExistsError) return;
      throw error;
    }
    if (isMirroredDocument(relative)) manifest.files[relative] = entry.version;
  });
  const deck = await client.put(
    `${prefix}deck.json`,
    new Uint8Array(readFileSync(join(dir, 'deck.json'))),
    { overwrite: options.overwrite, contentType: blobContentType('deck.json') },
  );
  manifest.files['deck.json'] = deck.version;
  writeManifestFile(dir, manifest);
  options.log?.(
    `blob: pushed ${files.length} files of ${deckId} in ${Math.round(performance.now() - t)} ms`,
  );
}

/** The Blob backend: the overlay as a mirror, one BlobStore per deck, the seed uploaded once. */
export function blobDecks(options: HostedOptions): HostedDecks {
  if (options.blob === null) {
    throw new TypeError(
      'The blob store needs a Blob client (BLOB_READ_WRITE_TOKEN and @vercel/blob)',
    );
  }
  const log = options.log ?? (() => {});
  const overlay: Overlay = createOverlay({
    root: options.overlayRoot,
    seed: options.seed,
    log,
  });
  const { decksDir } = overlay;
  const blobOption = options.blob;
  let clientPromise: Promise<BlobClient> | undefined;
  const client = (): Promise<BlobClient> => {
    clientPromise ??= typeof blobOption === 'function' ? blobOption() : Promise.resolve(blobOption);
    return clientPromise;
  };
  const stores = new Map<string, BlobStore>();
  const urls = new Map<string, string | null>();
  let readyPromise: Promise<void> | undefined;

  const storeFor = async (deckId: string): Promise<BlobStore> => {
    let store = stores.get(deckId);
    if (store === undefined) {
      store = openBlobStore({
        client: await client(),
        deckId,
        dir: join(decksDir, deckId),
        ...(options.now === undefined ? {} : { now: options.now }),
      });
      stores.set(deckId, store);
    }
    return store;
  };

  /** The seed decks go up once: the first instance that finds no manifest uploads them. */
  const seedOnce = async (): Promise<void> => {
    const c = await client();
    for (const deckId of await overlay.seedDecks()) {
      if ((await c.head(`${deckPrefix(deckId)}deck.json`)) !== null) continue;
      await overlay.ensureAssets(deckId);
      await pushDeckDir(c, deckId, join(decksDir, deckId), { overwrite: false, log });
    }
  };

  const ready = (): Promise<void> => {
    readyPromise ??= (async () => {
      await overlay.ready();
      await seedOnce();
    })();
    return readyPromise;
  };

  const deckIds = async (): Promise<string[]> => {
    const folders = await (await client()).folders('decks/');
    return folders
      .map((folder) => folder.slice('decks/'.length).replace(/\/$/, ''))
      .filter((id) => id !== '' && !id.includes('/'))
      .sort();
  };

  return {
    kind: 'blob',
    persistent: true,
    root: overlay.root,
    decksDir,
    ready,
    async list() {
      await ready();
      const ids = await deckIds();
      await eachLimit(ids, 4, async (deckId) => {
        await (await storeFor(deckId)).sync();
      });
      const wanted = new Set(ids);
      return listDeckHeads(decksDir).filter((head) => wanted.has(head.id));
    },
    async has(deckId) {
      await ready();
      return (await (await client()).head(`${deckPrefix(deckId)}deck.json`)) !== null;
    },
    async open(deckId) {
      await ready();
      const store = await storeFor(deckId);
      const state = await store.sync(true);
      if (!state.present) throw new RangeError(`No deck ${deckId} in the Blob store`);
      return store;
    },
    async create(input) {
      await ready();
      const deckId = deckIdFor(input);
      const c = await client();
      if ((await c.head(`${deckPrefix(deckId)}deck.json`)) !== null) {
        throw new TypeError(`decks/${deckId} exists already; pick another name`);
      }
      if (input.from !== 'blank') await overlay.ensureAllAssets();
      const dir = join(decksDir, deckId);
      rmSync(dir, { recursive: true, force: true });
      const result = createDeck(
        decksDir,
        input,
        options.now === undefined ? {} : { now: options.now },
      );
      try {
        await pushDeckDir(c, deckId, dir, { overwrite: false, log });
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        if (error instanceof BlobExistsError) {
          throw new TypeError(`decks/${deckId} exists already; pick another name`);
        }
        throw error;
      }
      return result;
    },
    async ensureAssets(deckId) {
      await ready();
      // the seed's twins from the bundle, then whatever the store holds beyond them
      await overlay.ensureAssets(deckId);
      await (await storeFor(deckId)).pullAssets();
    },
    async assetFile(deckId, relative) {
      await ready();
      await overlay.ensureAssets(deckId);
      const file = assetPathWithin(decksDir, deckId, relative);
      return file !== null && existsSync(file) ? file : null;
    },
    async assetUrl(deckId, relative) {
      await ready();
      if (!isSafeKey(relative) || !isAssetKey(`${deckId}/assets/${relative}`)) return null;
      const pathname = `${deckPrefix(deckId)}assets/${relative}`;
      const cached = urls.get(pathname);
      if (cached !== undefined) return cached;
      const entry = await (await client()).head(pathname);
      const url = entry === null ? null : entry.url;
      urls.set(pathname, url);
      return url;
    },
    facts() {
      return factsFor(options.selection, decksDir, options.seed);
    },
  };
}

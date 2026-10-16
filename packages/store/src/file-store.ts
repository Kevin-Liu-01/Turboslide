// FileStore (SPEC 4.1, 11 "Storage is FileStore"): the deck directory as the store. deck.json and
// slides/<id>.json are read and validated into the normalized document; a write runs applyWrite,
// writes only the slide files whose normalized value changed, removes the files of removed slides,
// appends versions/<n>.json and rewrites deck.json last, all under a lock file so two processes
// never interleave. Leases live under <dir>/.turboslide/leases.json, which the repository's
// .gitignore already excludes, because they expire; a lease another author holds refuses an
// agent's write and warns on a human's (lease.ts, MILESTONES M4 item 2).
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { ASSET_CATALOG_FILE, assetCatalogOf, inlineAssetCatalog } from '@turboslide/schema/deck';
import type { Deck, DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import type { Author, Lease, Mutation, Version } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { applyWrite } from '@turboslide/schema/reduce';
import { validateDeck } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';

import {
  describeLease,
  activeLeases,
  leaseConflict,
  leasePolicyFor,
  leaseRefusalMessage,
  readLeases,
  releaseLease,
  takeLease,
  writeLeases,
} from './lease.ts';
import type {
  AssetPut,
  DeckStore,
  LeaseOptions,
  LeasePolicy,
  ReadResult,
  StoreListener,
  StoreWrite,
  VersionRecord,
  WriteOptions,
  WriteOutcome,
} from './store.ts';
import { AssetExistsError, assetRelative, touchedSlides } from './store.ts';
import {
  documentAtVersion,
  nextVersionNumber,
  readVersions,
  readVersionsCached,
  recordAtRevision,
  recordMinor,
  recordNamingOps,
  toVersion,
  versionRecordText,
  writeVersion,
} from './versions.ts';
import { watchDeck } from './watch.ts';
import { cachedDocuments, fileStamp, forgetFile } from './parse-cache.ts';

export type FileStoreOptions = {
  /** The deck directory holding deck.json. */
  dir: string;
  /** The clock, for tests. Defaults to Date. */
  now?: () => string;
  /**
   * The lease policy for every write. Absent, the policy follows the author of each write
   * (lease.ts leasePolicyFor: agents enforced, humans advisory; MILESTONES M4 item 2).
   */
  leases?: LeasePolicy;
  /** Where the lease records live. Default <dir>/.turboslide/leases.json. */
  leaseFile?: string;
  /** The lock taken around a write. Default <dir>/.turboslide/write.lock. */
  lockFile?: string;
  /** How long a write waits for another process's lock before failing. Default 5000 ms. */
  lockTimeoutMs?: number;
  /**
   * Runs inside the write lock after a committed write, with the documents before and after and
   * the mutations that were applied (gslides-parity SPEC-3 0.52: the comments store shifts the
   * text anchors the write moved and writes the sidecar under the same lock).
   */
  onWrite?: (before: DeckDocument, after: DeckDocument, mutations: ReadonlyArray<Mutation>) => void;
  /**
   * Keep the store's contract on a write that names its origin (store.ts `DeckStore.write`;
   * hardening HR-O#6): a write whose op id a record above its base names is answered with that
   * record (`replayed`), and a committed write's record stores its origin. The tmp backend sets
   * it; the Blob store's FileStore does not, since the Blob store keeps the contract itself.
   */
  origins?: boolean;
  /**
   * Reads the deck and its version log through the parse cache (hardening PS#2, PERF-2:
   * `loadDeckDirCached`, `readVersionsCached`), and keeps the document a write validated, so a
   * read or a write on an unchanged folder validates nothing. A Blob mirror sets it; a checkout
   * reads its files fresh on every call. Default false.
   */
  cache?: boolean;
};

export type FileStore = DeckStore & { readonly dir: string; readonly leaseFile: string };

/** A lock older than this is treated as left behind by a crashed process. */
export const STALE_LOCK_MS = 30_000;

export const STATE_DIR = '.turboslide';

export function slidePath(dir: string, slideId: string): string {
  return join(dir, 'slides', `${slideId}.json`);
}

type Loaded = ReadResult & { manifestPath: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The slide ids the raw manifest lists, before validation, so every listed file is read. */
function rawOrder(deck: unknown): string[] {
  if (!isRecord(deck) || !Array.isArray(deck.sections)) return [];
  const ids: string[] = [];
  for (const section of deck.sections) {
    if (!isRecord(section) || !Array.isArray(section.slideIds)) continue;
    for (const id of section.slideIds) if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

/**
 * The manifest with its asset catalog inline (hardening PS#12a, CRIT-M13): a `deck.json` in the
 * external shape PS#12b writes names the md5 of `assets.json` beside it in `assetCatalog`, and
 * reads as the inline manifest with that catalog in its place. A missing catalog is a TypeError,
 * the error a manifest that does not validate answers. The folder's files are trusted as a slide
 * body is: the Blob mirror proves the catalog against the manifest's digest before it counts the
 * document proven (blob-store.ts `pull`). An inline manifest comes back as it is.
 */
function withAssetCatalog(
  dir: string,
  rawDeck: unknown,
  stamps?: Array<readonly [string, string | null]>,
): unknown {
  const digest = assetCatalogOf(rawDeck);
  if (digest === null) return rawDeck;
  const catalogPath = join(dir, ASSET_CATALOG_FILE);
  if (stamps !== undefined) stamps.push([ASSET_CATALOG_FILE, fileStamp(catalogPath)]);
  if (!existsSync(catalogPath))
    throw new TypeError(
      `${join(dir, 'deck.json')} names the asset catalog ${digest}, and ${catalogPath} is missing`,
    );
  return inlineAssetCatalog(rawDeck, parseJson(readFileSync(catalogPath, 'utf8'), catalogPath));
}

/** Reads deck.json and the listed slide files, then validates and normalizes them (SPEC 4.4). */
export function loadDeckDir(dir: string): Loaded {
  return readDeckDir(dir);
}

/**
 * The deck folder's files read and validated; with `stamps`, the stamp of each file is taken
 * before its bytes are read (`fileStamp`), so a write between the two leaves an older stamp,
 * which the next lookup refuses.
 */
function readDeckDir(dir: string, stamps?: Array<readonly [string, string | null]>): Loaded {
  const manifestPath = join(dir, 'deck.json');
  if (stamps !== undefined) stamps.push(['deck.json', fileStamp(manifestPath)]);
  if (!existsSync(manifestPath)) throw new RangeError(`No deck.json in ${dir}`);
  const rawDeck = withAssetCatalog(
    dir,
    parseJson(readFileSync(manifestPath, 'utf8'), manifestPath),
    stamps,
  );
  const rawSlides: Record<string, unknown> = {};
  for (const id of rawOrder(rawDeck)) {
    const path = slidePath(dir, id);
    if (stamps !== undefined) stamps.push([`slides/${id}.json`, fileStamp(path)]);
    if (existsSync(path)) rawSlides[id] = parseJson(readFileSync(path, 'utf8'), path);
  }
  const result = validateDeck({ deck: rawDeck, slides: rawSlides });
  if (result.deck === null) {
    const first = result.issues[0];
    throw new TypeError(
      `${manifestPath} is not a deck manifest${first === undefined ? '' : `: ${first.pointer} ${first.message}`}`,
    );
  }
  return {
    document: { deck: result.deck, slides: result.slides },
    issues: result.issues,
    ok: result.ok,
    manifestPath,
  };
}

/**
 * The folder's read from the parse cache when every file it was read from is unchanged (hardening
 * PS#2, PERF-2), else read, validated and kept. The result is the cache's own and is never handed
 * to a caller: `loadDeckDirCached` copies it.
 */
function cachedDeckDir(dir: string): Loaded {
  const entry = cachedDocuments.get(dir);
  if (
    entry !== undefined &&
    entry.files.every(([relative, stamp]) => fileStamp(join(dir, ...relative.split('/'))) === stamp)
  )
    return entry.value as Loaded;
  const stamps: Array<readonly [string, string | null]> = [];
  const loaded = readDeckDir(dir, stamps);
  cachedDocuments.set(dir, { files: stamps, value: loaded });
  return loaded;
}

/**
 * `loadDeckDir` through the parse cache (hardening PS#2): a folder whose files are unchanged since
 * the last read or write of this process is not read or validated again. Each call answers its own
 * copy (2 ms of CPU for the GT deck against 13 ms for a validation), so a caller that changes the
 * document changes nothing another caller reads.
 */
export function loadDeckDirCached(dir: string): Loaded {
  const loaded = cachedDeckDir(dir);
  return {
    document: structuredClone(loaded.document),
    issues: structuredClone(loaded.issues),
    ok: loaded.ok,
    manifestPath: loaded.manifestPath,
  };
}

/** The folder's revision through the parse cache, with no copy of the document. */
export function deckDirRevisionCached(dir: string): number {
  return cachedDeckDir(dir).document.deck.revision;
}

/**
 * Keeps a document a write validated as the folder's read, so the next read or write validates
 * nothing (hardening PS#2). Kept only when a read of the files the write just wrote would answer
 * the same document and issues: the slides in the order the sections list them and every listed
 * slide present, and no issue that names a form the files no longer hold (a migrated value) or a
 * slide the read would not open (an unlisted one). Otherwise the next read validates the files.
 */
function rememberDeckDir(dir: string, document: DeckDocument, issues: ReadonlyArray<Issue>): void {
  const listed = rawOrder(document.deck);
  const ids = Object.keys(document.slides);
  if (
    ids.length !== listed.length ||
    ids.some((id, i) => listed[i] !== id) ||
    issues.some(
      (issue) => issue.code === 'migrated' || issue.code === 'unlisted' || issue.severity === 3,
    )
  )
    return;
  const files: Array<readonly [string, string | null]> = [
    ['deck.json', fileStamp(join(dir, 'deck.json'))],
    ...listed.map((id) => [`slides/${id}.json`, fileStamp(slidePath(dir, id))] as const),
  ];
  if (files.some(([, stamp]) => stamp === null)) return;
  const loaded: Loaded = {
    document: structuredClone(document),
    issues: structuredClone([...issues]),
    ok: true,
    manifestPath: join(dir, 'deck.json'),
  };
  cachedDocuments.set(dir, { files, value: loaded });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Creates the lock file exclusively, waiting for another holder and clearing a stale one. */
async function withLock<T>(path: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      closeSync(openSync(path, 'wx'));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let age = 0;
      try {
        age = Date.now() - statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (age > STALE_LOCK_MS) {
        rmSync(path, { force: true });
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Another write holds ${path}; wait for it, or remove the file if no turboslide process is running`,
        );
      }
      await sleep(25);
    }
  }
  try {
    return await run();
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // Already gone: a stale-lock sweep by another process removed it.
    }
  }
}

function writeSlideFiles(dir: string, before: DeckDocument, after: DeckDocument): string[] {
  const changed: string[] = [];
  mkdirSync(join(dir, 'slides'), { recursive: true });
  for (const [id, slide] of Object.entries(after.slides)) {
    if (jsonEqual(before.slides[id], slide)) continue;
    writeFileSync(slidePath(dir, id), canonicalJson(slide));
    forgetFile(slidePath(dir, id));
    changed.push(id);
  }
  for (const id of Object.keys(before.slides)) {
    if (after.slides[id] !== undefined) continue;
    rmSync(slidePath(dir, id), { force: true });
    forgetFile(slidePath(dir, id));
    changed.push(id);
  }
  return changed.sort();
}

export function writeManifest(dir: string, deck: Deck): void {
  writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
  forgetFile(join(dir, 'deck.json'));
}

/**
 * The content digest an asset file name carries (gslides-parity SPEC-3 0.26, 8.5: twins
 * `assets/<id>.<sha8>-light.png`, sources `assets/<id>.source.<sha8>.<ext>`, frames
 * `assets/<id>.<sha8>@2x.png`): the first eight hex characters of the sha256 of the bytes.
 */
export function assetDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/** `assets/<id>.<sha8><suffix>` for a file's bytes; the suffix carries the twin side and the extension. */
export function digestAssetName(id: string, bytes: Uint8Array, suffix: string): string {
  return `assets/${id}.${assetDigest(bytes)}${suffix}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The local half of `DeckStore.putAsset` (SPEC-3 8.5): writes the file under the deck directory
 * through a sibling name and a rename, refuses other bytes under a taken name, and reports a
 * file already there with the same bytes as `existed`. The Blob backend runs this before its put.
 */
export function putAssetFile(dir: string, relative: string, bytes: Uint8Array): AssetPut {
  const rel = assetRelative(relative);
  const path = join(dir, ...rel.split('/'));
  if (existsSync(path)) {
    if (!sameBytes(new Uint8Array(readFileSync(path)), bytes)) throw new AssetExistsError(rel);
    return { relative: rel, path, url: null, existed: true };
  }
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
  return { relative: rel, path, url: null, existed: false };
}

/** The local half of `DeckStore.removeAsset`: a missing file is not an error. */
export function removeAssetFile(dir: string, relative: string): void {
  const rel = assetRelative(relative);
  rmSync(join(dir, ...rel.split('/')), { force: true });
}

/**
 * Runs `run` under a deck's write lock (`<dir>/.turboslide/write.lock`, the one every FileStore
 * write takes), so a sidecar write on a checkout (the comments store, SPEC-3 5.2) never interleaves
 * with a document write of another process.
 */
export function withDeckLock<T>(
  dir: string,
  run: () => Promise<T>,
  options: { lockFile?: string; timeoutMs?: number } = {},
): Promise<T> {
  return withLock(
    options.lockFile ?? join(dir, STATE_DIR, 'write.lock'),
    options.timeoutMs ?? 5000,
    run,
  );
}

export function openFileStore(options: FileStoreOptions): FileStore {
  const dir = options.dir;
  const clock = options.now ?? (() => new Date().toISOString());
  const policyFor = (author: Author): LeasePolicy => options.leases ?? leasePolicyFor(author);
  const leaseFile = options.leaseFile ?? join(dir, STATE_DIR, 'leases.json');
  const lockFile = options.lockFile ?? join(dir, STATE_DIR, 'write.lock');
  const lockTimeoutMs = options.lockTimeoutMs ?? 5000;
  const locked = <T>(run: () => Promise<T>): Promise<T> => withLock(lockFile, lockTimeoutMs, run);
  // the parse cache of a mirror (hardening PS#2), or the files read fresh on every call
  const cached = options.cache === true;
  const load = cached ? loadDeckDirCached : loadDeckDir;
  const versions = cached ? readVersionsCached : readVersions;

  const store: FileStore = {
    id: basename(dir),
    dir,
    leaseFile,

    async read(): Promise<ReadResult> {
      const { document, issues, ok } = load(dir);
      return { document, issues, ok };
    },

    async revision(): Promise<number> {
      return cached ? deckDirRevisionCached(dir) : loadDeckDir(dir).document.deck.revision;
    },

    write(write: StoreWrite, writeOptions: WriteOptions = {}): Promise<WriteOutcome> {
      return locked(async () => {
        const loaded = load(dir);
        const current = loaded.document;
        const origin = options.origins === true ? write.origin : undefined;
        const now = clock();
        const warnings: string[] = [];
        const records = versions(dir);
        if (origin !== undefined) {
          // the resend of a write that committed: its record, nothing claimed or written
          const replayed = recordNamingOps(records, write.baseRevision, origin.opIds);
          if (replayed !== undefined) {
            return {
              ok: true,
              document: current,
              revision: replayed.revision,
              entry: replayed,
              changed: [],
              issues: [],
              warnings,
              replayed,
            };
          }
        }
        if (writeOptions.force !== true) {
          const policy = policyFor(write.author);
          const leases = readLeases(leaseFile);
          for (const slideId of touchedSlides(write.mutations)) {
            const held = leaseConflict(leases, slideId, write.author, now);
            if (held === undefined) continue;
            if (policy === 'enforce') {
              return {
                ok: false,
                code: 'conflict',
                message: leaseRefusalMessage(slideId, held),
                current,
                currentRevision: current.deck.revision,
                holder: held.holder,
              };
            }
            warnings.push(describeLease(held));
          }
        }
        const result = applyWrite(current, write, {
          now,
          resolveVersion: (n) => documentAtVersion(current, records, n),
        });
        if (!result.ok) return result;
        const minor = recordMinor(current, result.document);
        const entry: VersionRecord = {
          n: nextVersionNumber(records),
          revision: result.document.deck.revision,
          baseRevision: write.baseRevision,
          author: write.author,
          note: write.note ?? '',
          createdAt: now,
          mutations: result.entry.mutations,
          inverse: result.inverse,
          ...(writeOptions.ops !== undefined ? { ops: writeOptions.ops } : {}),
          ...(origin !== undefined ? { origin } : {}),
          ...(minor !== undefined ? { schemaMinor: minor } : {}),
        };
        // the record's text before any file changes: a record that cannot be written refuses the
        // write whole, so the slide files never move without the record and the manifest (the
        // wave 3b verify's finding 1: a refused record left a slide file one write ahead)
        const recordText = versionRecordText(entry);
        const changed = writeSlideFiles(dir, current, result.document);
        writeVersion(dir, entry, recordText);
        writeManifest(dir, result.document.deck);
        // the document the reducer just validated is the folder's next read (hardening PS#2)
        if (cached) rememberDeckDir(dir, result.document, result.issues);
        // the comment anchors follow the text they name (gslides-parity SPEC-3 0.52): the shift
        // entries a checkout's write produces are written to the sidecar under this same lock
        if (options.onWrite !== undefined)
          options.onWrite(current, result.document, write.mutations);
        return {
          ok: true,
          document: result.document,
          revision: entry.revision,
          entry,
          changed,
          issues: result.issues,
          warnings,
        };
      });
    },

    async saveVersion(author: Author, note: string): Promise<Version> {
      if (note.trim() === '') throw new TypeError('A named version needs a note');
      return locked(async () => {
        const { document } = load(dir);
        const records = versions(dir);
        const entry: VersionRecord = {
          n: nextVersionNumber(records),
          revision: document.deck.revision,
          baseRevision: document.deck.revision,
          author,
          note,
          createdAt: clock(),
          mutations: [],
          inverse: [],
        };
        writeVersion(dir, entry);
        return toVersion(entry);
      });
    },

    async listVersions(): Promise<Version[]> {
      return versions(dir).map(toVersion);
    },

    async records(): Promise<VersionRecord[]> {
      return versions(dir);
    },

    async documentAt(n: number): Promise<DeckDocument> {
      const { document } = load(dir);
      return documentAtVersion(document, versions(dir), n);
    },

    async documentAtRevision(revision: number): Promise<DeckDocument> {
      const { document } = load(dir);
      if (revision === document.deck.revision) return document;
      const records = versions(dir);
      const record = recordAtRevision(records, revision);
      if (record !== undefined) return documentAtVersion(document, records, record.n);
      const first = records[0];
      if (first !== undefined && first.baseRevision === revision)
        return documentAtVersion(document, records, 0);
      throw new RangeError(
        `Revision ${revision} is not in the version log (the deck is at ${document.deck.revision}${first === undefined ? ' and the log is empty' : `; the log covers ${first.baseRevision} to ${records[records.length - 1]?.revision ?? first.revision}`})`,
      );
    },

    lease(slideId: string, holder: Author, leaseOptions: LeaseOptions = {}): Promise<Lease> {
      return locked(async () => {
        const { document } = load(dir);
        if (document.slides[slideId] === undefined) {
          throw new RangeError(`No slide "${slideId}" in ${store.id}`);
        }
        const taken = takeLease(readLeases(leaseFile), {
          slideId,
          holder,
          now: clock(),
          currentRevision: document.deck.revision,
          ...(leaseOptions.minutes !== undefined ? { minutes: leaseOptions.minutes } : {}),
          ...(leaseOptions.force !== undefined ? { force: leaseOptions.force } : {}),
        });
        writeLeases(leaseFile, taken.leases);
        return taken.lease;
      });
    },

    release(slideId: string, holder: Author): Promise<Lease | undefined> {
      return locked(async () => {
        const result = releaseLease(readLeases(leaseFile), slideId, holder, clock());
        writeLeases(leaseFile, result.leases);
        return result.released;
      });
    },

    async leases(): Promise<Lease[]> {
      return activeLeases(readLeases(leaseFile), clock());
    },

    watch(listener: StoreListener): () => void {
      return watchDeck(dir, listener);
    },

    async putAsset(relative: string, bytes: Uint8Array): Promise<AssetPut> {
      return putAssetFile(dir, relative, bytes);
    },

    async removeAsset(relative: string): Promise<void> {
      removeAssetFile(dir, relative);
    },
  };
  return store;
}

/** The validator's issues at severity 3, the ones a write cannot leave behind. */
export function blockingIssues(issues: ReadonlyArray<Issue>): Issue[] {
  return issues.filter((issue) => issue.severity === 3);
}

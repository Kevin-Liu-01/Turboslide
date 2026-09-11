// FileStore (SPEC 4.1, 11 "Storage is FileStore"): the deck directory as the store. deck.json and
// slides/<id>.json are read and validated into the normalized document; a write runs applyWrite,
// writes only the slide files whose normalized value changed, removes the files of removed slides,
// appends versions/<n>.json and rewrites deck.json last, all under a lock file so two processes
// never interleave. Leases live under <dir>/.turboslide/leases.json, which the repository's
// .gitignore already excludes, because they are advisory and expire.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { Deck, DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson, parseJson } from '@turboslide/schema/json';
import type { Author, Lease, Version, Write } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';
import { applyWrite } from '@turboslide/schema/reduce';
import { validateDeck } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';

import {
  describeLease,
  activeLeases,
  leaseConflict,
  readLeases,
  releaseLease,
  takeLease,
  writeLeases,
} from './lease.ts';
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
import { authorLabel, touchedSlides } from './store.ts';
import {
  documentAtVersion,
  nextVersionNumber,
  readVersions,
  recordAtRevision,
  toVersion,
  writeVersion,
} from './versions.ts';
import { watchDeck } from './watch.ts';

export type FileStoreOptions = {
  /** The deck directory holding deck.json. */
  dir: string;
  /** The clock, for tests. Defaults to Date. */
  now?: () => string;
  /** Advisory (default) or enforced leases (SPEC 6.7). */
  leases?: LeasePolicy;
  /** Where the lease records live. Default <dir>/.turboslide/leases.json. */
  leaseFile?: string;
  /** The lock taken around a write. Default <dir>/.turboslide/write.lock. */
  lockFile?: string;
  /** How long a write waits for another process's lock before failing. Default 5000 ms. */
  lockTimeoutMs?: number;
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

/** Reads deck.json and the listed slide files, then validates and normalizes them (SPEC 4.4). */
export function loadDeckDir(dir: string): Loaded {
  const manifestPath = join(dir, 'deck.json');
  if (!existsSync(manifestPath)) throw new RangeError(`No deck.json in ${dir}`);
  const rawDeck = parseJson(readFileSync(manifestPath, 'utf8'), manifestPath);
  const rawSlides: Record<string, unknown> = {};
  for (const id of rawOrder(rawDeck)) {
    const path = slidePath(dir, id);
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
    changed.push(id);
  }
  for (const id of Object.keys(before.slides)) {
    if (after.slides[id] !== undefined) continue;
    rmSync(slidePath(dir, id), { force: true });
    changed.push(id);
  }
  return changed.sort();
}

export function writeManifest(dir: string, deck: Deck): void {
  writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
}

export function openFileStore(options: FileStoreOptions): FileStore {
  const dir = options.dir;
  const clock = options.now ?? (() => new Date().toISOString());
  const policy: LeasePolicy = options.leases ?? 'advisory';
  const leaseFile = options.leaseFile ?? join(dir, STATE_DIR, 'leases.json');
  const lockFile = options.lockFile ?? join(dir, STATE_DIR, 'write.lock');
  const lockTimeoutMs = options.lockTimeoutMs ?? 5000;
  const locked = <T>(run: () => Promise<T>): Promise<T> => withLock(lockFile, lockTimeoutMs, run);

  const store: FileStore = {
    id: basename(dir),
    dir,
    leaseFile,

    async read(): Promise<ReadResult> {
      const { document, issues, ok } = loadDeckDir(dir);
      return { document, issues, ok };
    },

    async revision(): Promise<number> {
      return loadDeckDir(dir).document.deck.revision;
    },

    write(write: Write, writeOptions: WriteOptions = {}): Promise<WriteOutcome> {
      return locked(async () => {
        const loaded = loadDeckDir(dir);
        const current = loaded.document;
        const now = clock();
        const warnings: string[] = [];
        if (writeOptions.force !== true) {
          const leases = readLeases(leaseFile);
          for (const slideId of touchedSlides(write.mutations)) {
            const held = leaseConflict(leases, slideId, write.author, now);
            if (held === undefined) continue;
            if (policy === 'enforce') {
              return {
                ok: false,
                code: 'conflict',
                message: `Slide "${slideId}" is leased by ${authorLabel(held.holder)} until ${held.until}; pass force to write anyway`,
                current,
                currentRevision: current.deck.revision,
                holder: held.holder,
              };
            }
            warnings.push(describeLease(held));
          }
        }
        const records = readVersions(dir);
        const result = applyWrite(current, write, {
          now,
          resolveVersion: (n) => documentAtVersion(current, records, n),
        });
        if (!result.ok) return result;
        const changed = writeSlideFiles(dir, current, result.document);
        const entry: VersionRecord = {
          n: nextVersionNumber(records),
          revision: result.document.deck.revision,
          baseRevision: write.baseRevision,
          author: write.author,
          note: write.note ?? '',
          createdAt: now,
          mutations: result.entry.mutations,
          inverse: result.inverse,
        };
        writeVersion(dir, entry);
        writeManifest(dir, result.document.deck);
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
        const { document } = loadDeckDir(dir);
        const records = readVersions(dir);
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
      return readVersions(dir).map(toVersion);
    },

    async records(): Promise<VersionRecord[]> {
      return readVersions(dir);
    },

    async documentAt(n: number): Promise<DeckDocument> {
      const { document } = loadDeckDir(dir);
      return documentAtVersion(document, readVersions(dir), n);
    },

    async documentAtRevision(revision: number): Promise<DeckDocument> {
      const { document } = loadDeckDir(dir);
      if (revision === document.deck.revision) return document;
      const records = readVersions(dir);
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
        const { document } = loadDeckDir(dir);
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
  };
  return store;
}

/** The validator's issues at severity 3, the ones a write cannot leave behind. */
export function blockingIssues(issues: ReadonlyArray<Issue>): Issue[] {
  return issues.filter((issue) => issue.severity === 3);
}

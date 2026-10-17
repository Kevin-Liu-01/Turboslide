// The parse cache of a Blob mirror (hardening PS#2, PERF-2). Before it every commit read and
// validated the whole deck folder several times (12.8 ms of CPU per validation of the GT deck)
// and parsed every version record again (46 microseconds each, 32.5 ms at 708 records), so the
// cost of a commit grew with the deck's history. A value is kept with the identity of the files it
// was read from (`fileStamp`), and a lookup checks that identity first, so a file a writer outside
// the store changed (a hand edit on a checkout, another process) is read again. The store's own
// writes drop the entries of the files they touch (`forgetFile`). Bounded, the least recently
// used leaving first: a function instance mirrors many decks.
import { statSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** How many deck folders' validated documents the cache keeps. */
const CACHED_DOCUMENTS_MAX = 16;
/** How many parsed version records the cache keeps, across every folder. */
const CACHED_RECORDS_MAX = 10_000;

/**
 * A file's identity on disk: its inode, size, and modification and change times in nanoseconds;
 * null when the file is missing. A rename gives a new inode, an in place write a new time.
 */
export function fileStamp(path: string): string | null {
  try {
    const stat = statSync(path, { bigint: true, throwIfNoEntry: false });
    if (stat === undefined) return null;
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch {
    return null;
  }
}

/** A map that keeps at most `max` entries and drops the least recently used one first. */
export class LruMap<V> {
  readonly #entries = new Map<string, V>();
  readonly #max: number;

  constructor(max: number) {
    this.#max = max;
  }

  get size(): number {
    return this.#entries.size;
  }

  /** The value, which becomes the most recently used. */
  get(key: string): V | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  /** Drops every key that starts with `prefix`. */
  deletePrefix(prefix: string): void {
    for (const key of [...this.#entries.keys()])
      if (key.startsWith(prefix)) this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }
}

/** The parsed version records, by absolute file path, each with the stamp it was read at. */
export const cachedRecords = new LruMap<{ stamp: string; value: unknown }>(CACHED_RECORDS_MAX);

/**
 * The validated documents, by deck folder: the stamp of `deck.json` and of every slide file the
 * read opened (null for a listed file that was missing), and the read's result.
 */
export const cachedDocuments = new LruMap<{
  files: ReadonlyArray<readonly [string, string | null]>;
  value: unknown;
}>(CACHED_DOCUMENTS_MAX);

/**
 * Drops what the cache holds for one file the store wrote or removed: its record, or the
 * document of the deck folder it belongs to (`deck.json` sits in the folder, a slide one level
 * down; a record is not part of the document). A rename or an in place write changes the stamp anyway; this makes the store's own
 * writes independent of the file system's clock.
 */
export function forgetFile(path: string): void {
  cachedRecords.delete(path);
  const parent = dirname(path);
  if (basename(path) === 'deck.json') cachedDocuments.delete(parent);
  else if (basename(parent) === 'slides') cachedDocuments.delete(dirname(parent));
}

/** Drops everything the cache holds for one deck folder. */
export function forgetFolder(dir: string): void {
  cachedDocuments.delete(dir);
  cachedRecords.deletePrefix(`${dir}/`);
}

/** Empties the cache (tests). */
export function clearParseCache(): void {
  cachedRecords.clear();
  cachedDocuments.clear();
}

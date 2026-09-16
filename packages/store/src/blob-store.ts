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
import { createHash } from 'node:crypto';
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

import { MEDIA_MIME_BY_EXTENSION } from '@turboslide/schema/blocks/media';
import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Lease, Version, Write } from '@turboslide/schema/mutations';
import { applyWrite } from '@turboslide/schema/reduce';

import { fileCommentsOnWrite, pushSidecar } from './comments-store.ts';
import type { SidecarChange } from './comments-store.ts';
import {
  STATE_DIR,
  loadDeckDir,
  openFileStore,
  putAssetFile,
  removeAssetFile,
  slidePath,
  writeManifest,
} from './file-store.ts';
import {
  SNAPSHOTS_DIR,
  SNAPSHOT_GRACE_MS,
  etagMd5,
  parseSnapshot,
  prunableSnapshots,
  retainedSnapshots,
  snapshotBody,
  snapshotKey,
  snapshotKeyOf,
  snapshotPath,
} from './snapshots.ts';
import { documentAtVersion, readVersions, recordAtRevision, writeVersion } from './versions.ts';
import type { FileStore } from './file-store.ts';
import type { HostedDecks, HostedOptions } from './hosted.ts';
import { assetPathWithin, checkRevision, factsFor } from './hosted.ts';
import { eachLimit, isAssetKey, isSafeKey } from './seed.ts';
import type {
  AssetPut,
  DeckStore,
  LeaseOptions,
  LeasePolicy,
  ReadResult,
  StoreListener,
  VersionRecord,
  WriteOptions,
  WriteOutcome,
} from './store.ts';
import { AssetExistsError, assetRelative } from './store.ts';
import { byNewest, copyDeck, createDeck, deckIdFor, restoreDeck, trashDeck } from './templates.ts';
import type { DeckHead, TrashState } from './templates.ts';
import { createOverlay } from './tmp-store.ts';
import type { Overlay } from './tmp-store.ts';
import { readRevision } from './watch.ts';

// ---------------------------------------------------------------------------------------------
// The client the store talks to

/** One stored blob as the client reports it. `version` is the etag (uploadedAt when absent). */
export type BlobEntry = {
  pathname: string;
  url: string;
  size: number;
  version: string;
  /** ISO time of the upload, when the client reports one (the snapshot prune and the export job prune read it). */
  uploadedAt?: string;
};

export type BlobPutOptions = {
  /** replace an existing blob; false makes an existing pathname a BlobExistsError */
  overwrite: boolean;
  /** commit only when the stored version is this one (a BlobPreconditionError otherwise) */
  ifMatch?: string;
  contentType?: string;
  /**
   * the browser and CDN max age of the stored body in seconds (Vercel Blob `cacheControlMaxAge`);
   * the thumbnail cache puts a year, because a stamp names its pixels (SPEC-4 0.31). Clients that
   * cannot pass it through ignore it.
   */
  cacheControlMaxAge?: number;
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

/**
 * The two conflict classes by name as well as by class (gslides-parity VERIFICATION-5 finding 11,
 * the round five fix round): the deployed server bundle carries more than one copy of this module
 * (the store is reached from the route chunks and from the CLI child's graph), so an error thrown
 * by one copy fails `instanceof` in another and a catch written for it rethrows. Production's
 * `seedOnce` did that on 2026-09-15 and its cached `readyPromise` answered 500 to every route.
 * Every catch in this package tests these guards, never the class alone; `name` is set by the
 * constructors above and survives the copy.
 */
export function isBlobExistsError(error: unknown): boolean {
  return (
    error instanceof BlobExistsError || (error instanceof Error && error.name === 'BlobExistsError')
  );
}

export function isBlobPreconditionError(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionError ||
    (error instanceof Error && error.name === 'BlobPreconditionError')
  );
}

/**
 * The content type per extension of a stored object. The media rows (gslides-parity SPEC-5 3.3;
 * R11 1.5) come from the schema's one table (`MEDIA_MIME_BY_EXTENSION`), which the assets route,
 * the inline list and the bundle scan read too, so a `.m4v` is `video/mp4` everywhere; B2 owns
 * this table and the media functions of this file, B7 the document read path (A6).
 */
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
  ...Object.fromEntries(
    Object.entries(MEDIA_MIME_BY_EXTENSION).map(([extension, mime]) => [`.${extension}`, mime]),
  ),
};

export function blobContentType(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

/** `decks/<id>/`: where a deck's files live in the store. */
export function deckPrefix(deckId: string): string {
  return `decks/${deckId}/`;
}

// ---------------------------------------------------------------------------------------------
// The keyed prefix of media files on a restricted deck (gslides-parity SPEC-5 0.19, 3.3; R11 2
// rule 6; B2 day 5): a media file of a deck whose access mode is `restricted` is written under
// `d/<deckId>/<assetKey>/<file>` on the public store, where `assetKey` is the 128 bit segment
// the deck's access record carries (`AccessRecord.assetKey`, 22 base64url characters). The page
// receives the key after `authorize(read)` and the renderer's `mediaUrl` names the keyed Blob URL;
// a collaborator removed or a link revoked rotates the key (`rotateAssetKey`), so the URLs they
// saw stop answering. Pictures keep the `decks/<id>/assets/` precedent (0.19: moving them is
// Kevin's). `isPublicPath` (migrate.ts) already routes `d/` to the public store.

/** The prefix keyed media files live under on the public store. */
export const KEYED_PREFIX = 'd/';

/** The 22 base64url characters of an asset key (the share token grammar, packages/schema access.ts). */
export const ASSET_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** `d/<deckId>/<assetKey>/`: every keyed file of one deck under one key. */
export function keyedPrefix(deckId: string, assetKey: string): string {
  if (!ASSET_KEY_PATTERN.test(assetKey))
    throw new TypeError('an asset key is 22 base64url characters');
  return `${KEYED_PREFIX}${deckId}/${assetKey}/`;
}

/** `assets/<file>` of a deck under a key: `d/<deckId>/<assetKey>/<file>` (the `assets/` segment drops; the name keeps its digest). */
export function keyedAssetPathname(deckId: string, assetKey: string, relative: string): string {
  const rel = assetRelative(relative);
  return `${keyedPrefix(deckId, assetKey)}${rel.slice('assets/'.length)}`;
}

/**
 * A year, the `cacheControlMaxAge` of every asset file the intake puts (SPEC-5 3.3; R11 2 rule
 * 4): an asset name carries its content digest and the store refuses an overwrite (SPEC-3 0.26),
 * so the CDN and the browser may keep the body for as long as they like.
 */
export const ASSET_CACHE_MAX_AGE_S = 31_536_000;

// The deck index on the blob tier (SPEC-5 11 "The deck index"; SPEC-4 7; B2 day 7): one object,
// `decks/index.json`, holding every deck's list row, written with `ifMatch` by `deck.create`,
// `copy`, `trash`, `restore`, `remove` and every commit that changes a row (the title, the slide
// count, the sections, the revision), coalesced per instance over `INDEX_COALESCE_MS`. `/decks`
// reads one `get` past `INDEX_READ_THRESHOLD` decks and falls back to the manifest walk when the
// index is missing or disagrees with the store's folder listing; `reindex()` rebuilds it from the
// walk. Titles are public on a link already, so the index lives on the public store beside the
// manifests it summarises.

/** The index object's pathname. */
export const INDEX_PATHNAME = 'decks/index.json';
/** Past this many decks the list reads the index instead of every manifest. */
export const INDEX_READ_THRESHOLD = 50;
/** How long an instance holds index writes before one `put` carries them all. */
export const INDEX_COALESCE_MS = 2000;

export type DeckIndexFile = {
  schemaVersion: 1;
  updatedAt: string;
  decks: DeckHead[];
};

/** The index bytes: canonical, so two instances writing the same rows write the same etag. */
export function deckIndexBytes(index: DeckIndexFile): Uint8Array {
  const decks = [...index.decks].sort((a, b) => a.id.localeCompare(b.id));
  return new TextEncoder().encode(
    `${canonicalJson({ schemaVersion: 1, updatedAt: index.updatedAt, decks })}\n`,
  );
}

/** The index a stored object holds, or null when the bytes are not an index. */
export function parseDeckIndex(bytes: Uint8Array): DeckIndexFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const file = raw as Record<string, unknown>;
  if (file.schemaVersion !== 1 || !Array.isArray(file.decks)) return null;
  const decks = file.decks.filter(
    (row): row is DeckHead =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as DeckHead).id === 'string' &&
      typeof (row as DeckHead).title === 'string' &&
      typeof (row as DeckHead).revision === 'number',
  );
  return {
    schemaVersion: 1,
    updatedAt: typeof file.updatedAt === 'string' ? file.updatedAt : '',
    decks,
  };
}

/** A deck's list row from its document (the same row `deckHeadOf` reads from the manifest bytes). */
export function deckHeadOfDocument(document: DeckDocument): DeckHead {
  const { deck } = document;
  const head: DeckHead = {
    id: deck.id,
    title: deck.title,
    slides: deck.sections.reduce((sum, section) => sum + section.slideIds.length, 0),
    sections: deck.sections.length,
    revision: deck.revision,
    updatedAt: deck.updatedAt,
    createdAt: deck.createdAt,
  };
  const trashedAt = (deck as { trashedAt?: unknown }).trashedAt;
  if (typeof trashedAt === 'string' && trashedAt !== '') head.trashedAt = trashedAt;
  return head;
}

export const LEASES_FILE = 'leases.json';

/**
 * The deck's access record (gslides-parity SPEC-3 2.2, 6.1): a deck level record beside the
 * document with its own lifecycle, never a document of the mirror and never in a bundle.
 */
export const ACCESS_FILE = 'access.json';

/** The comments sidecar folder (SPEC-3 2.2, 0.10): a deck folder like `slides/`, mirrored and bundled. */
export const COMMENTS_DIR = 'comments';

/**
 * The thumbnail cache of round four (gslides-parity SPEC-4 0.31, 3.2): the render route's
 * captures live under `decks/<id>/.thumbs/<stamp>/<theme>@<width>/<slide>.png`, shared by every
 * instance and never mirrored (the mirror holds documents; a capture is derived from them). The
 * stamp is the name the URL carries as `r`: the slide's content stamp for the filmstrip and the
 * viewer, the deck revision for the home cards. `pruneThumbs` keeps the newest THUMB_KEEP stamps
 * per slide and theme.
 */
export const THUMBS_DIR = '.thumbs';
/** How many stamps a slide keeps per theme (SPEC-4 0.31: K is 3). */
export const THUMB_KEEP = 3;

/** `decks/<id>/.thumbs/` */
export function thumbsPrefix(deckId: string): string {
  return `${deckPrefix(deckId)}${THUMBS_DIR}/`;
}

/** `decks/<id>/.thumbs/<stamp>/<theme>@<width>/<slide>.png` */
export function thumbPathname(
  deckId: string,
  stamp: string,
  theme: string,
  width: number,
  slideId: string,
): string {
  return `${thumbsPrefix(deckId)}${stamp}/${theme}@${width}/${slideId}.png`;
}

export type ThumbKey = {
  deckId: string;
  stamp: string;
  theme: string;
  width: number;
  slideId: string;
};

/** The parts of a thumbnail pathname, or null when the pathname is not one. */
export function parseThumbPathname(pathname: string): ThumbKey | null {
  const match = /^decks\/([^/]+)\/\.thumbs\/([^/]+)\/([a-z]+)@(\d+)\/([^/]+)\.png$/.exec(pathname);
  if (match === null) return null;
  const [, deckId, stamp, theme, width, slideId] = match;
  if (!deckId || !stamp || !theme || !width || !slideId) return null;
  return { deckId, stamp, theme, width: Number(width), slideId };
}

/** The stored thumbnails of one slide and theme at one width, newest first by `uploadedAt`. */
export function storedThumbs(
  entries: ReadonlyArray<BlobEntry>,
  deckId: string,
  slideId: string,
  theme: string,
  width: number,
): (BlobEntry & { key: ThumbKey })[] {
  const out: (BlobEntry & { key: ThumbKey })[] = [];
  for (const entry of entries) {
    const key = parseThumbPathname(entry.pathname);
    if (key === null) continue;
    if (key.deckId !== deckId || key.slideId !== slideId) continue;
    if (key.theme !== theme || key.width !== width) continue;
    out.push({ ...entry, key });
  }
  return out.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
}

/**
 * Removes every stored thumbnail of a slide and theme beyond the newest `keep` stamps (every
 * width of an evicted stamp goes); returns the pathnames removed. One `list` of the deck's
 * `.thumbs/` prefix and at most one `del`; the render route runs it after its own put, behind the
 * response (SPEC-4 0.31).
 */
export async function pruneThumbs(
  client: BlobClient,
  deckId: string,
  slideId: string,
  theme: string,
  keep: number = THUMB_KEEP,
): Promise<string[]> {
  const entries = await client.list(thumbsPrefix(deckId));
  const mine = entries
    .map((entry) => ({ entry, key: parseThumbPathname(entry.pathname) }))
    .filter(
      (row): row is { entry: BlobEntry; key: ThumbKey } =>
        row.key !== null && row.key.slideId === slideId && row.key.theme === theme,
    );
  /* the newest upload per stamp decides the stamp's age */
  const newestOf = new Map<string, string>();
  for (const { entry, key } of mine) {
    const at = entry.uploadedAt ?? '';
    if ((newestOf.get(key.stamp) ?? '') < at) newestOf.set(key.stamp, at);
  }
  const stamps = [...newestOf.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([stamp]) => stamp);
  const doomedStamps = new Set(stamps.slice(Math.max(0, keep)));
  const doomed = mine
    .filter(({ key }) => doomedStamps.has(key.stamp))
    .map(({ entry }) => entry.pathname);
  if (doomed.length > 0) await client.del(doomed);
  return doomed;
}

/**
 * The files the mirror manages: every document of the deck, not the twins, the leases, the
 * access record, the snapshots or the thumbnail cache.
 */
export function isMirroredDocument(relative: string): boolean {
  return (
    relative !== LEASES_FILE &&
    relative !== ACCESS_FILE &&
    !relative.startsWith('assets/') &&
    !relative.startsWith(`${SNAPSHOTS_DIR}/`) &&
    !relative.startsWith(`${THUMBS_DIR}/`) &&
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
    if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      entry.name !== LEASES_FILE &&
      entry.name !== ACCESS_FILE
    ) {
      out.push(entry.name);
    } else if (
      entry.isDirectory() &&
      (entry.name === 'slides' || entry.name === 'versions' || entry.name === COMMENTS_DIR)
    ) {
      for (const file of readdirSync(join(dir, entry.name))) {
        if (file.endsWith('.json')) out.push(posix.join(entry.name, file));
      }
    }
  }
  return out;
}

/** Vercel Blob's etag: the md5 of the body in quotes (measured 2026-09-11). */
function quotedMd5(body: Uint8Array | string): string {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

/** A short pause between two reads of a body the CDN has not caught up on. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The pathname of a state file inside a deck's prefix: `name` is relative to the state folder,
 * every segment a safe key, so a caller names `presence.json` or `chat/12.json` and never a
 * document of the deck.
 */
function stateFilePathname(prefix: string, name: string): string {
  if (!isSafeKey(name) || name.endsWith('/') || name.startsWith(`${STATE_DIR}/`))
    throw new RangeError(`not a state file name: ${JSON.stringify(name)}`);
  return `${prefix}${STATE_DIR}/${name}`;
}

/** The mirror could not prove it holds the store's current document; the caller retries. */
export class StaleMirrorError extends Error {
  constructor(deckId: string) {
    super(
      `This instance's copy of ${deckId} is behind the store and the store's current copy could not be read yet; retry the write`,
    );
    this.name = 'StaleMirrorError';
  }
}

/**
 * Another instance stored a different document under the snapshot name this write computed (the
 * same base revision, the same clock millisecond, other slides); the write stops before its
 * manifest push and the caller retries from the current document (SPEC-2 8.2).
 */
export class SnapshotContestedError extends Error {
  readonly key: string;
  constructor(deckId: string, key: string) {
    super(
      `Another instance is committing the same revision of ${deckId} at this moment (snapshot ${key} holds its document); retry the write from the current document`,
    );
    this.name = 'SnapshotContestedError';
    this.key = key;
  }
}

/** The highest version record number the mirror holds (or the manifest being built names), 0 without any. */
function lastRecord(dir: string, manifest?: Manifest): number {
  let last = 0;
  const names = [...localDocuments(dir), ...Object.keys(manifest?.files ?? {})];
  for (const relative of names) {
    const match = /^versions\/(\d+)\.json$/.exec(relative);
    if (match) last = Math.max(last, Number(match[1]));
  }
  return last;
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
  /**
   * No effect since round five (gslides-parity SPEC-5-amendments A3 item 2; B7). Until then a
   * sync result was trusted for this long (750 ms) before the next head call, so a write admitted
   * against the mirror inside the window met a store one revision ahead (build-4/hotfix-4.md 3.6,
   * 3.7). A read now serves the mirror without a head call only while the mirror's revision is
   * the one the room last delivered to this instance (`noteDelivered`); a write always reads the
   * head. Kept so the callers' option objects still typecheck.
   */
  syncTtlMs?: number;
  /**
   * test hooks, to stage a race: `beforeCommit` runs between the local write and the push,
   * `afterHead` between the head read that opens a write and the pull that follows it
   */
  hooks?: { beforeCommit?: () => Promise<void>; afterHead?: () => Promise<void> };
  /** how long an unreferenced snapshot is left alone before the prune removes it; default 5 minutes */
  snapshotGraceMs?: number;
};

/**
 * A small document under the deck's state folder in the Blob store (`decks/<id>/.turboslide/
 * <name>`) that the realtime package shares between the instances of the blob tier: the roster
 * (gslides-parity SPEC-5-amendments A3 item 6, A8 row 4) and the chat messages (SPEC-5 10; B7,
 * the fix round of VERIFICATION-5 findings 3 and 14). The mirror never pulls the folder and the
 * deck's removal deletes it. The store holds bytes and versions and reads nothing into them.
 * `proven` says the body hashes to the etag `head()` answered; a body the CDN served stale for an
 * overwritten name is answered unproven after the retries, so a writer never builds a compare
 * and swap on it.
 */
export type StateFile = { name: string; version: string; bytes: Uint8Array; proven: boolean };

/** A copy read before: when the store's version is still this one, the copy is answered without a body read. */
export type StateFileKnown = { version: string; bytes: Uint8Array };

export type PutStateFileOptions = {
  /** the version the file must still have (compare and swap); a BlobPreconditionError otherwise */
  ifMatch?: string;
  /** the file must not exist yet (an append under a numbered name); a BlobExistsError otherwise */
  create?: boolean;
};

/** How many times a state file's body is read again when it does not hash to the head's etag. */
export const STATE_FILE_READ_RETRIES = 3;

export type BlobStore = DeckStore & {
  readonly dir: string;
  /**
   * Pulls the deck's documents when the store's manifest moved. Without `force` the mirror is
   * served as it stands only while its revision equals the one the room last delivered to this
   * instance (`noteDelivered`), otherwise the store's head is read (gslides-parity
   * SPEC-5-amendments A3 item 2); `force` always reads the head.
   */
  sync: (force?: boolean) => Promise<SyncState>;
  /**
   * The room delivered this revision to this instance (the blob channel's own commit, or a record
   * its poll announced): reads of the mirror at that revision need no head call until a frame
   * with a higher revision or a forced sync moves it. Instance memory is never the truth (fluid
   * compute runs several instances), so the rule keys on what the room delivered, not on time.
   */
  noteDelivered: (revision: number) => void;
  /** the revision `noteDelivered` last named, null before the room delivered anything */
  deliveredRevision: () => number | null;
  /**
   * Reads a state file (`StateFile`) from the store, never the mirror: one `head()` for the
   * current version, and the body only when `known` is not at that version; the body is read
   * again up to STATE_FILE_READ_RETRIES times while it does not hash to the etag (the CDN serving
   * an overwritten name stale), and answered `proven: false` when it never does. Null when the
   * file is not stored. `name` is relative to the state folder (`presence.json`, `chat/12.json`).
   */
  readStateFile: (name: string, known?: StateFileKnown) => Promise<StateFile | null>;
  /**
   * Writes a state file: in place with `ifMatch` (a compare and swap; the store's precondition is
   * the arbiter across instances), or created under a new name with `create` (an append that two
   * instances cannot both make). No cache on the object, so a fresh read follows a write.
   */
  putStateFile: (
    name: string,
    bytes: Uint8Array,
    options?: PutStateFileOptions,
  ) => Promise<{ version: string }>;
  /** Removes a state file; a missing one is not an error. */
  deleteStateFile: (name: string) => Promise<void>;
  /**
   * The state files under a folder of the state folder (`chat`), by name with their versions.
   * The listing of Vercel Blob lags a write by up to a minute (measured 2026-09-11), so a reader
   * treats it as a lower bound and reads past it by name.
   */
  listStateFiles: (folder: string) => Promise<{ name: string; version: string }[]>;
  /** pulls the deck's twins that are missing locally; returns how many were written */
  pullAssets: () => Promise<number>;
  /** how many immutable documents the store holds under snapshots/ (deck.info's `snapshots`, SPEC-2 8.2) */
  snapshots: () => Promise<number>;
  /** removes every snapshot no retained record names; returns how many went (write() runs this after a commit) */
  pruneSnapshots: () => Promise<number>;
  /**
   * A media file of a restricted deck under the keyed prefix (gslides-parity SPEC-5 0.19, 3.3):
   * the local mirror file first (this instance's renderer and exporter read `assets/<file>`), then
   * `d/<deckId>/<assetKey>/<file>` on the store with overwrite refused and a year's cache age; the
   * answer's `url` is the keyed Blob URL the page mounts.
   */
  putKeyedAsset: (
    relative: string,
    bytes: Uint8Array,
    assetKey: string,
    contentType?: string,
  ) => Promise<AssetPut>;
  /** the keyed URL of a stored file, or null when the store does not hold it under that key */
  keyedAssetUrl: (relative: string, assetKey: string) => Promise<string | null>;
  /**
   * Moves every keyed file from one key to another (a collaborator removed, a link revoked, SPEC-5
   * 0.19): each object is read and put under the new prefix, then the old prefix is deleted;
   * answers the file names moved. Idempotent: a file already under the new key is left as it is.
   */
  rotateAssetKey: (from: string, to: string) => Promise<{ moved: string[] }>;
};

export function openBlobStore(options: BlobStoreOptions): BlobStore {
  const { client, deckId, dir } = options;
  const prefix = deckPrefix(deckId);
  const pollMs = options.pollMs ?? 3000;
  const statePathname = (name: string): string => stateFilePathname(prefix, name);
  const snapshotGraceMs = options.snapshotGraceMs ?? SNAPSHOT_GRACE_MS;
  const serial = serialQueue();
  // the text anchors of the comments follow the text a write moved, inside the lock (SPEC-3
  // 0.52); the changed sidecar files are pushed after the commit below
  const shifted: SidecarChange[] = [];
  const file: FileStore = openFileStore({
    dir,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.leases === undefined ? {} : { leases: options.leases }),
    onWrite: fileCommentsOnWrite(
      dir,
      deckId,
      options.now ?? (() => new Date().toISOString()),
      (change) => shifted.push(change),
    ),
  });
  let lastState: SyncState = { present: false, pulled: false, revision: null };
  /** the revision the room last delivered to this instance (A3 item 2); null before any frame */
  let delivered: number | null = null;

  const pathOf = (relative: string): string => join(dir, ...relative.split('/'));

  /**
   * Pulls the store's documents into the mirror. Three facts about Vercel Blob decide the shape
   * of this (measured against the live store on 2026-09-11): `list()` lags `head()` by up to a
   * minute; the public URL a body is fetched from is served by the CDN, which keeps an overwritten
   * blob's previous body for a while after `head()` already answers the new etag (the SDK's
   * `useCache: false` only bypasses it for private stores); and the etag is the md5 of the body.
   * So a document counts as current only when its bytes hash to the etag `head()` reports, and
   * the current document is otherwise derived, never guessed: the version records are written
   * once under immutable names (always fresh), every record above the mirror's last one is
   * fetched by number, and they are replayed through `applyWrite` from the mirror's previous state
   * exactly as the writing instance ran them (same clock value, same reducer), which reproduces
   * the writer's bytes and therefore its etag. When neither proof succeeds, the mirror keeps what
   * it has for reads and `write()` refuses to commit on it (StaleMirrorError) rather than commit
   * a stale base over a newer document; before this a second write from another instance failed
   * with "changed in the Blob store since it was read", and a fresh mirror that took a lagging
   * body as its base could commit over newer revisions (docs/hosting.md).
   */
  const pull = async (): Promise<void> => {
    const manifest = readManifest(dir);
    const before = existsSync(pathOf('deck.json')) ? loadDeckDir(dir).document : null;
    const deckHead = await client.head(`${prefix}deck.json`);
    const entries = (await client.list(prefix))
      .map((entry) => ({ entry, relative: entry.pathname.slice(prefix.length) }))
      .filter(({ relative }) => isMirroredDocument(relative) && relative !== 'deck.json');
    const next: Manifest = { files: {} };
    const fetchBody = async (
      relative: string,
    ): Promise<{ bytes: Uint8Array; version: string } | null> => {
      const fetched = await client.get(`${prefix}${relative}`);
      return fetched === null ? null : { bytes: fetched.bytes, version: fetched.entry.version };
    };
    /** records never change, so their first body is the body */
    const fetchRecord = async (relative: string): Promise<boolean> => {
      const fetched = await fetchBody(relative);
      if (fetched === null) return false;
      writeAtomic(pathOf(relative), fetched.bytes);
      next.files[relative] = fetched.version;
      return true;
    };
    // 1. the records: the listing's, then by number past what the listing shows; the comments
    // sidecar (SPEC-3 2.2) travels with the same rule as a record, by version, because it is
    // neither a slide body the snapshot proves nor a record that never changes
    const slideEntries: { entry: BlobEntry; relative: string }[] = [];
    await eachLimit(entries, 8, async ({ entry, relative }) => {
      if (relative.startsWith(`${COMMENTS_DIR}/`)) {
        if (manifest.files[relative] === entry.version && existsSync(pathOf(relative))) {
          next.files[relative] = entry.version;
          return;
        }
        const fetched = await fetchBody(relative);
        if (fetched === null) return;
        writeAtomic(pathOf(relative), fetched.bytes);
        next.files[relative] = fetched.version;
        return;
      }
      if (!relative.startsWith('versions/')) {
        slideEntries.push({ entry, relative });
        return;
      }
      if (manifest.files[relative] === entry.version && existsSync(pathOf(relative))) {
        next.files[relative] = entry.version;
        return;
      }
      if (!(await fetchRecord(relative)) && existsSync(pathOf(relative)))
        next.files[relative] = manifest.files[relative] ?? entry.version;
    });
    const first = lastRecord(dir, next) + 1;
    for (let n = first; n < first + 10_000; n++) {
      const relative = `versions/${n}.json`;
      if (
        (next.files[relative] === undefined || !existsSync(pathOf(relative))) &&
        !(await fetchRecord(relative))
      )
        break;
    }
    if (deckHead === null) {
      for (const relative of localDocuments(dir)) {
        if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
      }
      writeManifestFile(dir, next);
      return;
    }
    /** the mirror's documents from a proven document, and the manifest rows they get */
    const writeDocuments = (document: DeckDocument): void => {
      const current = existsSync(pathOf('deck.json')) ? loadDeckDir(dir).document : null;
      mkdirSync(join(dir, 'slides'), { recursive: true });
      for (const [id, slide] of Object.entries(document.slides)) {
        const bytes = new TextEncoder().encode(canonicalJson(slide));
        if (
          current === null ||
          canonicalJson(current.slides[id]) !== canonicalJson(slide) ||
          !existsSync(slidePath(dir, id))
        )
          writeAtomic(slidePath(dir, id), bytes);
        next.files[`slides/${id}.json`] = quotedMd5(bytes);
      }
      for (const id of Object.keys(current?.slides ?? {})) {
        if (document.slides[id] === undefined) rmSync(slidePath(dir, id), { force: true });
      }
      writeManifest(dir, document.deck);
      next.files['deck.json'] = deckHead.version;
    };
    // 1b. the snapshot path (gslides-parity SPEC-2 8.2): the etag is the md5 of the current
    // deck.json bytes and the writer stored the whole document under that key before it pushed
    // the manifest, so the snapshot is the current document, proven by its name; no revision is
    // read and no slide body is fetched. A deck written before the round, or a store whose
    // deck.json push failed after its snapshot, has none and takes the replay below.
    const currentKey = etagMd5(deckHead.version);
    const snapshot = currentKey === null ? null : await readSnapshot(currentKey);
    if (snapshot !== null && quotedMd5(canonicalJson(snapshot.deck)) === deckHead.version) {
      writeDocuments(snapshot);
      for (const relative of localDocuments(dir)) {
        if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
      }
      writeManifestFile(dir, next);
      return;
    }
    // 2. the base: the mirror's previous state, or the bodies the store serves for an empty mirror
    let base = before;
    const unproven = new Set<string>();
    if (base === null) {
      const deck = await fetchBody('deck.json');
      if (deck === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
      writeAtomic(pathOf('deck.json'), deck.bytes);
      await eachLimit(slideEntries, 8, async ({ relative }) => {
        const body = await fetchBody(relative);
        if (body === null) return;
        writeAtomic(pathOf(relative), body.bytes);
        const head = await client.head(`${prefix}${relative}`);
        if (head === null || head.version !== quotedMd5(body.bytes))
          unproven.add(relative.slice('slides/'.length, -'.json'.length));
      });
      base = loadDeckDir(dir).document;
    }
    // 3. the replay: every record above the base, through the writer's own reducer and clock
    const records = readVersions(dir);
    let document = base;
    const rewritten = new Set<string>();
    for (const record of [...records].sort((a, b) => a.n - b.n)) {
      if (record.baseRevision !== document.deck.revision) continue;
      const applied = applyWrite(
        document,
        { baseRevision: record.baseRevision, author: record.author, mutations: record.mutations },
        { now: record.createdAt, resolveVersion: (n) => documentAtVersion(document, records, n) },
      );
      if (!applied.ok) break;
      document = applied.document;
      for (const id of Object.keys(document.slides)) {
        if (canonicalJson(document.slides[id]) !== canonicalJson(base.slides[id]))
          rewritten.add(id);
      }
    }
    // deck.json's etag proves the manifest; a slide body the CDN served stale is proven only when
    // the replay rewrote it from the records
    const derivedEtag = quotedMd5(canonicalJson(document.deck));
    let proven = derivedEtag === deckHead.version && [...unproven].every((id) => rewritten.has(id));
    if (!proven) {
      // 4. the fresh path: the bodies themselves, each proven against its own head
      const deck = await fetchBody('deck.json');
      if (deck !== null && quotedMd5(deck.bytes) === deckHead.version) {
        const bodies = new Map<string, Uint8Array>();
        let lagging = 0;
        await eachLimit(slideEntries, 8, async ({ relative }) => {
          const body = await fetchBody(relative);
          const head = await client.head(`${prefix}${relative}`);
          if (body === null || head === null) return;
          if (quotedMd5(body.bytes) === head.version) bodies.set(relative, body.bytes);
          else lagging += 1;
        });
        if (lagging === 0) {
          writeAtomic(pathOf('deck.json'), deck.bytes);
          for (const [relative, bytes] of bodies) writeAtomic(pathOf(relative), bytes);
          document = loadDeckDir(dir).document;
          proven = true;
        }
      }
    }
    if (proven) {
      writeDocuments(document);
    } else {
      // unprovable for now: reads keep the mirror's copy, write() refuses until a later pull proves one
      for (const relative of localDocuments(dir)) {
        if (relative === 'deck.json' || relative.startsWith('slides/'))
          next.files[relative] = quotedMd5(readFileSync(pathOf(relative)));
      }
    }
    for (const relative of localDocuments(dir)) {
      if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
    }
    writeManifestFile(dir, next);
  };

  /**
   * The sync step itself; callers already inside the queue use this, everyone else `sync`. The
   * cache rule of gslides-parity SPEC-5-amendments A3 item 2: the mirror is served without a head
   * call only when the room delivered its revision to this instance and nothing higher since; a
   * time window (750 ms until round five) let an admission read a mirror another instance had
   * already moved past (build-4/hotfix-4.md 3.6, 3.7).
   */
  const syncNow = async (force: boolean): Promise<SyncState> => {
    if (
      !force &&
      delivered !== null &&
      lastState.present &&
      existsSync(pathOf('deck.json')) &&
      readRevision(dir) === delivered
    )
      return lastState;
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

  /** The stored snapshot under a key as a document, or null when the store has none or it does not parse. */
  const readSnapshot = async (key: string): Promise<DeckDocument | null> => {
    const fetched = await client.get(`${prefix}${snapshotPath(key)}`);
    if (fetched === null) return null;
    try {
      return parseSnapshot(fetched.bytes, `${prefix}${snapshotPath(key)}`);
    } catch {
      return null;
    }
  };

  /**
   * Stores the whole document under its key with overwrite refused (SPEC-2 8.2). A snapshot that
   * exists already is left alone when its bytes are ours (a retry, or an identical write on
   * another instance: equal bytes are one document). The key is the md5 of the manifest bytes
   * alone, so two writers that start from one revision inside one clock millisecond push equal
   * manifests with different slide bodies and want the same name (measured in hosted.test.ts with
   * a frozen clock); the one whose body the name holds proceeds, the other stops before its
   * manifest push with SnapshotContestedError, which write() answers as a conflict, so no
   * committed etag ever names a body its writer did not store.
   */
  const putSnapshot = async (key: string, body: Uint8Array): Promise<void> => {
    const relative = snapshotPath(key);
    try {
      await client.put(`${prefix}${relative}`, body, {
        overwrite: false,
        contentType: blobContentType(relative),
      });
    } catch (error) {
      if (!isBlobExistsError(error)) throw error;
      const existing = await client.head(`${prefix}${relative}`);
      if (existing !== null && existing.version === quotedMd5(body)) return;
      throw new SnapshotContestedError(deckId, key);
    }
  };

  /**
   * Removes every snapshot no retained record names (the newest 50 records and every named
   * version keep theirs) and that is older than the grace, so a commit in flight on another
   * instance keeps the snapshot it stored a moment ago. The current manifest's snapshot stays
   * whatever the records say. One `del` call.
   */
  const pruneSnapshots = async (current: string | null): Promise<number> => {
    const retained = retainedSnapshots(readVersions(dir));
    const entries = await client.list(`${prefix}${SNAPSHOTS_DIR}/`);
    const doomed = prunableSnapshots(entries, prefix, retained, {
      now: Date.now(),
      graceMs: snapshotGraceMs,
      current,
    });
    if (doomed.length > 0) await client.del(doomed);
    return doomed.length;
  };

  /** Forgets the mirror's versions so the next sync pulls everything the store has. */
  const invalidate = (): void => {
    writeManifestFile(dir, { files: {} });
    delivered = null;
  };

  /**
   * Forgets the mirror's documents as well as its versions: after a failed commit the mirror holds
   * a state the store never had (the local apply that preceded the push), so the next pull must
   * start from the store's bodies, not from that state.
   */
  const discard = (): void => {
    for (const relative of localDocuments(dir)) rmSync(pathOf(relative), { force: true });
    invalidate();
  };

  /** Runs inside the write's queue slot, so it syncs directly. */
  const conflictFromStore = async (): Promise<WriteOutcome> => {
    discard();
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
    noteDelivered(revision) {
      // a lower revision than the one delivered is a late frame and moves nothing
      if (delivered === null || revision > delivered) delivered = revision;
    },
    deliveredRevision: () => delivered,

    // the state files the blob tier's roster and chat share between instances (SPEC-5-amendments
    // A3 item 6, A8 row 4; SPEC-5 10; B7): the store holds bytes and versions under the state
    // folder; the blob channel reads and merges what is in them
    async readStateFile(name, known) {
      const pathname = statePathname(name);
      const head = await client.head(pathname);
      if (head === null) return null;
      if (known !== undefined && known.version === head.version)
        return { name, version: head.version, bytes: known.bytes, proven: true };
      let bytes: Uint8Array | null = null;
      for (let attempt = 0; attempt <= STATE_FILE_READ_RETRIES; attempt++) {
        const fetched = await client.get(pathname);
        if (fetched === null) return null;
        bytes = fetched.bytes;
        if (quotedMd5(fetched.bytes) === head.version)
          return { name, version: head.version, bytes, proven: true };
        if (attempt < STATE_FILE_READ_RETRIES) await pause(40 * (attempt + 1));
      }
      return { name, version: head.version, bytes: bytes ?? new Uint8Array(), proven: false };
    },
    async putStateFile(name, bytes, putOptions = {}) {
      const pathname = statePathname(name);
      const entry = await client.put(pathname, bytes, {
        overwrite: putOptions.create !== true,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
        ...(putOptions.ifMatch === undefined ? {} : { ifMatch: putOptions.ifMatch }),
      });
      return { version: entry.version };
    },
    async deleteStateFile(name) {
      await client.del([statePathname(name)]);
    },
    async listStateFiles(folder) {
      const base = `${statePathname(folder)}/`;
      const entries = await client.list(base);
      return entries
        .filter((entry) => entry.pathname.startsWith(base))
        .map((entry) => ({
          name: `${folder}/${entry.pathname.slice(base.length)}`,
          version: entry.version,
        }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

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
        // inside the queue already: sync directly, not through serial(). Round one of the four
        // (gslides-parity SPEC-4 0.33): the manifest head and the leases read leave together;
        // the leases file is its own document, so neither waits on the other
        const [head] = await Promise.all([client.head(`${prefix}deck.json`), pullLeases()]);
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        if (options.hooks?.afterHead) await options.hooks.afterHead();
        const before = readManifest(dir);
        if (before.files['deck.json'] !== head.version || !existsSync(pathOf('deck.json'))) {
          await pull();
        }
        const manifest = readManifest(dir);
        const synced = manifest.files['deck.json'];
        if (synced !== head.version) {
          // the store moved between the head read and the pull (another instance committed, the
          // pull proved its document) or the pull could not prove the current document yet: a
          // lost race either way, answered as the conflict outcome with the store's current
          // document, never as an error (VERIFICATION-3 finding 19: five concurrent writers met
          // six 500s beside their 409s). The mirror is discarded and re-read from the store.
          const current = await client.head(`${prefix}deck.json`);
          if (current === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
          if (current.version === head.version) throw new StaleMirrorError(deckId);
          return conflictFromStore();
        }
        const outcome = await file.write(write, writeOptions);
        if (!outcome.ok) return outcome;
        // the snapshot key (SPEC-2 8.2, 0.40): the md5 of the deck.json bytes about to be pushed,
        // which is the etag the store will answer for them; the record of this commit names it
        const key = snapshotKey(new Uint8Array(readFileSync(pathOf('deck.json'))));
        const entry: VersionRecord = { ...outcome.entry, snapshot: key };
        writeVersion(dir, entry);
        try {
          if (options.hooks?.beforeCommit) await options.hooks.beforeCommit();
          // Round two (SPEC-4 0.33): the whole document under its immutable name and the changed
          // slide bodies leave together, before the manifest flips. A loser of the race below
          // leaves a snapshot no record and no etag names, which the prune removes, and slide
          // bodies the live manifest still names by an older etag: a reader proves the document
          // by the winner's snapshot (pull step 1b) and never reads those bodies, and the next
          // write of the slide overwrites them. Deletions wait until after the commit (below),
          // because a body removed before a commit that fails on ifMatch is one the live manifest
          // still names, and a reader's next pull would get null for it.
          const changedBodies = outcome.changed.filter((slideId) =>
            existsSync(pathOf(`slides/${slideId}.json`)),
          );
          const removedBodies = outcome.changed.filter(
            (slideId) => !existsSync(pathOf(`slides/${slideId}.json`)),
          );
          const [, ...pushedSlides] = await Promise.all([
            putSnapshot(key, snapshotBody(outcome.document)),
            ...changedBodies.map((slideId) => putDocument(`slides/${slideId}.json`)),
          ]);
          // Round three: the commit point, alone. The manifest goes up conditional on the version
          // this instance read; a precondition failure is the conflict outcome below.
          const committed = await putDocument('deck.json', synced);
          manifest.files['deck.json'] = committed.version;
          changedBodies.forEach((slideId, i) => {
            const pushed = pushedSlides[i];
            if (pushed !== undefined) manifest.files[`slides/${slideId}.json`] = pushed.version;
          });
          writeManifestFile(dir, manifest);
          // the removed bodies leave after the commit, then round four: the version record, kept
          // after the commit because records are put with overwrite and a loser's record must never
          // overwrite the winner's, and kept synchronous because adoptExternal on another editor
          // reads the records to apply the revision forward
          if (removedBodies.length > 0) {
            await client.del(removedBodies.map((slideId) => `${prefix}slides/${slideId}.json`));
            for (const slideId of removedBodies) delete manifest.files[`slides/${slideId}.json`];
          }
          const record = `versions/${entry.n}.json`;
          const stored = await putDocument(record);
          manifest.files[record] = stored.version;
          writeManifestFile(dir, manifest);
          for (const change of shifted.splice(0)) {
            // the shifted threads and their index; a stale index (another instance's comment
            // landed first) is left to that instance's next push, which pulls and re-shifts
            const indexHead = await client
              .head(`${prefix}${COMMENTS_DIR}/index.json`)
              .catch(() => null);
            await pushSidecar(client, deckId, dir, change, indexHead?.version ?? null).catch(
              () => undefined,
            );
          }
          lastState = { present: true, pulled: false, revision: outcome.revision };
          // retention runs after the commit and never blocks the answer (SPEC-2 8.2)
          void pruneSnapshots(key).catch(() => undefined);
          return { ...outcome, entry };
        } catch (error) {
          if (isBlobPreconditionError(error)) return conflictFromStore();
          if (error instanceof SnapshotContestedError) {
            // the other writer may have committed already (the round one sentence holds) or may
            // still be between its snapshot and its manifest push (the contention alone)
            const conflict = await conflictFromStore();
            return conflict.ok || conflict.code !== 'conflict'
              ? conflict
              : {
                  ...conflict,
                  message:
                    conflict.currentRevision > write.baseRevision
                      ? `${conflict.message} (its snapshot took the name this write computed)`
                      : error.message,
                };
          }
          // the mirror is ahead of the store: forget it so the next sync pulls the truth
          discard();
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
        // a named version pins the document it names (SPEC-2 8.2 retention): its record carries
        // the current manifest's snapshot key, and the snapshot is stored now when the deck's
        // last write predates the round
        const key = snapshotKey(new Uint8Array(readFileSync(pathOf('deck.json'))));
        const record = readVersions(dir).find((row) => row.n === version.n);
        if (record !== undefined) writeVersion(dir, { ...record, snapshot: key });
        try {
          if ((await client.head(`${prefix}${snapshotPath(key)}`)) === null)
            await putSnapshot(key, snapshotBody(loadDeckDir(dir).document));
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
          if (isBlobExistsError(error)) {
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
      const { document } = loadDeckDir(dir);
      if (revision === document.deck.revision) return document;
      // the record's snapshot first (SPEC-2 8.2), the round one replay from the inverses when the
      // record carries no key or its snapshot is gone
      const record = recordAtRevision(readVersions(dir), revision);
      if (record?.snapshot !== undefined) {
        const snapshot = await readSnapshot(record.snapshot);
        if (snapshot !== null) return snapshot;
      }
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
        // the poll reads the head every time: it is what invalidates the delivered revision
        // when another instance committed (A3 item 2), so it never serves the mirror as it stands
        void sync(true)
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

    async snapshots(): Promise<number> {
      const entries = await client.list(`${prefix}${SNAPSHOTS_DIR}/`);
      return entries.filter((entry) => snapshotKeyOf(entry.pathname.slice(prefix.length)) !== null)
        .length;
    },

    pruneSnapshots(): Promise<number> {
      return serial(async () => {
        const head = await client.head(`${prefix}deck.json`);
        return pruneSnapshots(head === null ? null : etagMd5(head.version));
      });
    },

    async putAsset(relative: string, bytes: Uint8Array, contentType?: string): Promise<AssetPut> {
      await requirePresent();
      // the local file first (this instance's renderer and exporter read the mirror), then the
      // store with overwrite refused (SPEC-3 0.26): a name in use with the same bytes is the same
      // file, a retry or another instance's identical write; other bytes are a mistake
      const local = putAssetFile(dir, relative, bytes);
      const pathname = `${prefix}${local.relative}`;
      try {
        const entry = await client.put(pathname, bytes, {
          overwrite: false,
          contentType: contentType ?? blobContentType(local.relative),
          // a digest named file is never overwritten (SPEC-3 0.26), so the CDN and the browser
          // keep it for a year (gslides-parity SPEC-5 3.3; R11 2 rule 4)
          cacheControlMaxAge: ASSET_CACHE_MAX_AGE_S,
        });
        return { ...local, url: entry.url };
      } catch (error) {
        if (!isBlobExistsError(error)) throw error;
        const existing = await client.head(pathname);
        if (existing !== null && existing.version === quotedMd5(bytes)) {
          return { ...local, url: existing.url, existed: true };
        }
        if (!local.existed) rmSync(local.path, { force: true });
        throw new AssetExistsError(local.relative);
      }
    },

    async putKeyedAsset(
      relative: string,
      bytes: Uint8Array,
      assetKey: string,
      contentType?: string,
    ): Promise<AssetPut> {
      await requirePresent();
      const local = putAssetFile(dir, relative, bytes);
      const pathname = keyedAssetPathname(deckId, assetKey, local.relative);
      try {
        const entry = await client.put(pathname, bytes, {
          overwrite: false,
          contentType: contentType ?? blobContentType(local.relative),
          cacheControlMaxAge: ASSET_CACHE_MAX_AGE_S,
        });
        return { ...local, url: entry.url };
      } catch (error) {
        if (!isBlobExistsError(error)) throw error;
        const existing = await client.head(pathname);
        if (existing !== null && existing.version === quotedMd5(bytes)) {
          return { ...local, url: existing.url, existed: true };
        }
        if (!local.existed) rmSync(local.path, { force: true });
        throw new AssetExistsError(local.relative);
      }
    },

    async keyedAssetUrl(relative: string, assetKey: string): Promise<string | null> {
      const entry = await client.head(keyedAssetPathname(deckId, assetKey, relative));
      return entry === null ? null : entry.url;
    },

    async rotateAssetKey(from: string, to: string): Promise<{ moved: string[] }> {
      const source = keyedPrefix(deckId, from);
      const target = keyedPrefix(deckId, to);
      if (source === target) return { moved: [] };
      const entries = await client.list(source);
      const moved: string[] = [];
      await eachLimit(entries, 4, async (entry) => {
        const name = entry.pathname.slice(source.length);
        if (name === '' || !isSafeKey(name)) return;
        const fetched = await client.get(entry.pathname);
        if (fetched === null) return;
        try {
          await client.put(`${target}${name}`, fetched.bytes, {
            overwrite: false,
            contentType: blobContentType(name),
            cacheControlMaxAge: ASSET_CACHE_MAX_AGE_S,
          });
        } catch (error) {
          // the same bytes already under the new key: a retry after a failed delete
          if (!isBlobExistsError(error)) throw error;
        }
        moved.push(name);
      });
      if (entries.length > 0) await client.del(entries.map((entry) => entry.pathname));
      return { moved: moved.sort() };
    },

    async removeAsset(relative: string): Promise<void> {
      removeAssetFile(dir, relative);
      await client.del([`${prefix}${relative}`]);
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
      if (isBlobExistsError(error)) return;
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

/**
 * A deck's list row from its manifest bytes (the shape `readDeckHead` in templates.ts reads from a
 * folder, applied to the store's `deck.json` without a mirror; SPEC-4 0.29). Null when the bytes
 * do not parse to a manifest.
 */
export function deckHeadOf(deckId: string, bytes: Uint8Array): DeckHead | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const manifest = raw as Record<string, unknown>;
  const sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  const head: DeckHead = {
    id: deckId,
    title: typeof manifest.title === 'string' ? manifest.title : deckId,
    slides: sections.reduce(
      (sum: number, section: unknown) =>
        sum +
        (typeof section === 'object' &&
        section !== null &&
        Array.isArray((section as { slideIds?: unknown }).slideIds)
          ? ((section as { slideIds: unknown[] }).slideIds.length ?? 0)
          : 0),
      0,
    ),
    sections: sections.length,
    revision: typeof manifest.revision === 'number' ? manifest.revision : 0,
    updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : '',
    createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : '',
  };
  if (typeof manifest.trashedAt === 'string' && manifest.trashedAt !== '')
    head.trashedAt = manifest.trashedAt;
  return head;
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
  const nowIso = options.now ?? (() => new Date().toISOString());
  const indexReadThreshold = options.indexReadThreshold ?? INDEX_READ_THRESHOLD;

  // The deck index (SPEC-5 11; B2 day 7). Rows change through `noteHead` (a row, or null for a
  // removed deck) and leave in one conditional `put` after INDEX_COALESCE_MS; a precondition
  // failure (another instance wrote first) re-reads the index and applies the pending rows again,
  // once. `flushIndex` is awaited by the tests and by `reindex`; the timer path never throws into
  // a caller, it logs.
  const pendingRows = new Map<string, DeckHead | null>();
  let indexTimer: ReturnType<typeof setTimeout> | null = null;
  let indexFlush: Promise<void> | null = null;

  const readIndex = async (
    c: BlobClient,
  ): Promise<{ index: DeckIndexFile | null; version: string | null }> => {
    const fetched = await c.get(INDEX_PATHNAME);
    if (fetched === null) return { index: null, version: null };
    return { index: parseDeckIndex(fetched.bytes), version: fetched.entry.version };
  };

  const putIndex = async (
    c: BlobClient,
    index: DeckIndexFile,
    version: string | null,
  ): Promise<void> => {
    await c.put(INDEX_PATHNAME, deckIndexBytes(index), {
      overwrite: true,
      contentType: 'application/json',
      ...(version === null ? {} : { ifMatch: version }),
    });
  };

  const applyRows = (
    index: DeckIndexFile | null,
    rows: Map<string, DeckHead | null>,
  ): DeckIndexFile => {
    const byId = new Map((index?.decks ?? []).map((row) => [row.id, row] as const));
    for (const [deckId, row] of rows) {
      if (row === null) byId.delete(deckId);
      else byId.set(deckId, row);
    }
    return { schemaVersion: 1, updatedAt: nowIso(), decks: [...byId.values()] };
  };

  const flushIndex = async (): Promise<void> => {
    if (indexTimer !== null) {
      clearTimeout(indexTimer);
      indexTimer = null;
    }
    if (indexFlush !== null) return indexFlush;
    if (pendingRows.size === 0) return;
    indexFlush = (async () => {
      const rows = new Map(pendingRows);
      pendingRows.clear();
      const c = await client();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { index, version } = await readIndex(c);
        try {
          await putIndex(c, applyRows(index, rows), version);
          return;
        } catch (error) {
          if (!isBlobPreconditionError(error) || attempt === 1) {
            // the rows are not lost: they wait for the next write or the next reindex
            for (const [deckId, row] of rows)
              if (!pendingRows.has(deckId)) pendingRows.set(deckId, row);
            log(
              `blob: the deck index write did not land (${error instanceof Error ? error.message : 'error'})`,
            );
            return;
          }
        }
      }
    })().finally(() => {
      indexFlush = null;
    });
    return indexFlush;
  };

  const noteHead = (deckId: string, row: DeckHead | null): void => {
    pendingRows.set(deckId, row);
    if (indexTimer === null) {
      indexTimer = setTimeout(() => {
        indexTimer = null;
        void flushIndex().catch((error: unknown) =>
          log(
            `blob: the deck index write failed (${error instanceof Error ? error.message : 'error'})`,
          ),
        );
      }, INDEX_COALESCE_MS);
      // a timer never keeps a function alive for the index
      (indexTimer as { unref?: () => void }).unref?.();
    }
  };

  /** The row of a deck read from its mirror, or null when the mirror holds no manifest. */
  const headFromMirror = (deckId: string): DeckHead | null => {
    const dir = join(decksDir, deckId);
    if (!existsSync(join(dir, 'deck.json'))) return null;
    try {
      return deckHeadOfDocument(loadDeckDir(dir).document);
    } catch {
      return null;
    }
  };

  const storeFor = async (deckId: string): Promise<BlobStore> => {
    let store = stores.get(deckId);
    if (store === undefined) {
      const inner = openBlobStore({
        client: await client(),
        deckId,
        dir: join(decksDir, deckId),
        ...(options.now === undefined ? {} : { now: options.now }),
      });
      // every commit through this collection's stores notes its row for the index (the title,
      // the slide count, the sections and the revision are what a commit can change)
      store = {
        ...inner,
        write: async (write, writeOptions) => {
          const outcome = await inner.write(write, writeOptions);
          if (outcome.ok) noteHead(deckId, deckHeadOfDocument(outcome.document));
          return outcome;
        },
      };
      stores.set(deckId, store);
    }
    return store;
  };

  /** The twin files a deck's manifest names, relative to the deck folder (`assets/<file>`). */
  const twinNames = (deckId: string): string[] => {
    const dir = join(decksDir, deckId);
    if (!existsSync(join(dir, 'deck.json'))) return [];
    try {
      const { document } = loadDeckDir(dir);
      return Object.values(document.deck.assets).flatMap((asset) =>
        Object.values(asset.twins).filter(
          (relative): relative is string => typeof relative === 'string' && isSafeKey(relative),
        ),
      );
    } catch {
      return [];
    }
  };

  /**
   * The twins of a deck that neither the bundle nor the store handed this instance, fetched from
   * the source `options.fetchAsset` names (the deployment's static files for the seed deck,
   * SPEC-4 0.35) and, with `upload`, put to the store so the next instance and the assets route
   * find them there. Returns how many were written.
   */
  const fetchMissingTwins = async (deckId: string, upload: boolean): Promise<number> => {
    const fetchAsset = options.fetchAsset;
    if (fetchAsset === undefined) return 0;
    const dir = join(decksDir, deckId);
    const missing = twinNames(deckId).filter(
      (relative) => !existsSync(join(dir, ...relative.split('/'))),
    );
    if (missing.length === 0) return 0;
    const c = upload ? await client() : null;
    let written = 0;
    const t = performance.now();
    await eachLimit(missing, 8, async (relative) => {
      const bytes = await fetchAsset(deckId, relative.replace(/^assets\//, ''));
      if (bytes === null) return;
      writeAtomic(join(dir, ...relative.split('/')), bytes);
      written += 1;
      if (c === null) return;
      try {
        await c.put(`${deckPrefix(deckId)}${relative}`, bytes, {
          overwrite: false,
          contentType: blobContentType(relative),
        });
      } catch (error) {
        if (!isBlobExistsError(error)) throw error;
      }
    });
    if (written > 0)
      log(
        `blob: fetched ${written} of ${missing.length} missing twins of ${deckId} in ${Math.round(performance.now() - t)} ms`,
      );
    return written;
  };

  /**
   * The seed decks go up once: the first instance that finds no manifest uploads them. The twins
   * come from the bundle where it carries them and from the static source otherwise (SPEC-4 0.35).
   */
  const seedOnce = async (): Promise<void> => {
    const c = await client();
    for (const deckId of await overlay.seedDecks()) {
      if ((await c.head(`${deckPrefix(deckId)}deck.json`)) !== null) continue;
      await overlay.ensureAssets(deckId);
      await fetchMissingTwins(deckId, false);
      await pushDeckDir(c, deckId, join(decksDir, deckId), { overwrite: false, log });
      // the seed's row joins the index on the first boot of a fresh store (SPEC-5 11)
      const row = headFromMirror(deckId);
      if (row !== null) noteHead(deckId, row);
    }
  };

  // A rejected ready is never cached (VERIFICATION-5 finding 11): the instance that met an error
  // while seeding (a transient Blob failure, a duplicated error class before the guards above)
  // used to answer 500 to every route for its whole life. The promise is dropped on rejection so
  // the next request tries the seed again; the error still reaches the caller that saw it.
  const ready = (): Promise<void> => {
    readyPromise ??= (async () => {
      await overlay.ready();
      await seedOnce();
    })().catch((error: unknown) => {
      readyPromise = undefined;
      log(
        `blob: ready failed and will be retried on the next call (${error instanceof Error ? error.message : String(error)})`,
      );
      throw error;
    });
    return readyPromise;
  };

  const deckIds = async (): Promise<string[]> => {
    const folders = await (await client()).folders('decks/');
    return folders
      .map((folder) => folder.slice('decks/'.length).replace(/\/$/, ''))
      .filter((id) => id !== '' && !id.includes('/'))
      .sort();
  };

  /**
   * The trash stamp on deck.json, pushed conditionally on the version the mirror synced so two
   * instances never overwrite each other's manifest (gslides-parity SPEC 7.2.5). The write goes
   * around the version log, like the local trashDeck, so the mirror's proof of the new manifest
   * is its body's etag (pull's fresh path), not a replayed record.
   */
  const stamp = async (deckId: string, apply: () => TrashState): Promise<TrashState> => {
    await ready();
    const c = await client();
    const store = await storeFor(deckId);
    const state = await store.sync(true);
    if (!state.present) throw new RangeError(`No deck ${deckId} in the Blob store`);
    const before = readManifest(store.dir).files['deck.json'];
    const result = apply();
    const bytes = new Uint8Array(readFileSync(join(store.dir, 'deck.json')));
    try {
      const entry = await c.put(`${deckPrefix(deckId)}deck.json`, bytes, {
        overwrite: true,
        contentType: blobContentType('deck.json'),
        ...(before === undefined ? {} : { ifMatch: before }),
      });
      const manifest = readManifest(store.dir);
      manifest.files['deck.json'] = entry.version;
      writeManifestFile(store.dir, manifest);
    } catch (error) {
      // the store moved under us: forget the mirror's manifest so the next sync pulls the truth
      writeManifestFile(store.dir, { files: {} });
      if (isBlobPreconditionError(error)) {
        await store.sync(true);
        const current = loadDeckDir(store.dir).document;
        throw new ConflictError(
          `Another instance wrote ${deckId} first; the current document is attached`,
          { currentRevision: current.deck.revision, current },
        );
      }
      throw error;
    }
    return result;
  };

  return {
    kind: 'blob',
    persistent: true,
    root: overlay.root,
    decksDir,
    ready,
    async list(listOptions) {
      await ready();
      const ids = await deckIds();
      const c = await client();
      // past the threshold one `get` of the index answers the page (SPEC-5 11): the folder listing
      // is the agreement check (a deck the index lacks or lists without a folder means another
      // instance's write has not landed yet), and a disagreement falls back to the walk below and
      // schedules the rebuild of the rows that differ
      if (ids.length > indexReadThreshold) {
        const { index } = await readIndex(c);
        if (index !== null) {
          const listed = new Set(index.decks.map((row) => row.id));
          const agree = ids.length === listed.size && ids.every((id) => listed.has(id));
          if (agree) {
            return index.decks
              .filter(
                (head) => head.trashedAt === undefined || listOptions?.includeTrashed === true,
              )
              .sort(byNewest);
          }
        }
      }
      // the listing reads every manifest through the SDK's origin read, in parallel, and writes
      // no mirror (gslides-parity SPEC-4 0.29, 3.1; PP 3.1): a trash stamp or a title written on
      // another instance shows on the next home page load (SPEC 6.2), and a deck store opens only
      // when a deck is opened. The mirrors on this instance are left as they are; open() syncs.
      const heads: DeckHead[] = [];
      await eachLimit(ids, 8, async (deckId) => {
        const fetched = await c.get(`${deckPrefix(deckId)}deck.json`);
        if (fetched === null) return;
        const head = deckHeadOf(deckId, fetched.bytes);
        if (head === null) return;
        if (ids.length > indexReadThreshold) noteHead(deckId, head);
        if (head.trashedAt !== undefined && listOptions?.includeTrashed !== true) return;
        heads.push(head);
      });
      return heads.sort(byNewest);
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
      if (input.from !== 'blank') {
        // the GT template's assets folder is the seed deck's (`../../gt-brand/assets`), so every
        // twin of every seed deck is on disk before createDeck copies the folder whole: from the
        // bundle, from the store, else from the static source (SPEC-4 0.35, 3.6)
        await overlay.ensureAllAssets();
        for (const seedId of await overlay.seedDecks()) {
          if ((await c.head(`${deckPrefix(seedId)}deck.json`)) !== null)
            await (await storeFor(seedId)).pullAssets().catch(() => 0);
          await fetchMissingTwins(seedId, true);
        }
      }
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
        if (isBlobExistsError(error)) {
          throw new TypeError(`decks/${deckId} exists already; pick another name`);
        }
        throw error;
      }
      const row = headFromMirror(deckId);
      if (row !== null) noteHead(deckId, row);
      return result;
    },
    async copy(input, baseRevision) {
      await ready();
      const c = await client();
      const source = await storeFor(input.id);
      const state = await source.sync(true);
      if (!state.present) throw new RangeError(`No deck ${input.id} in the Blob store`);
      // the copy takes the assets folder whole, so every twin of the source must be on disk
      await overlay.ensureAssets(input.id);
      await source.pullAssets();
      if (baseRevision !== undefined) checkRevision(decksDir, input.id, baseRevision);
      const deckId = deckIdFor({
        name: input.name,
        from: 'blank',
        ...(input.newId !== undefined ? { id: input.newId } : {}),
      });
      if ((await c.head(`${deckPrefix(deckId)}deck.json`)) !== null) {
        throw new TypeError(`decks/${deckId} exists already; pick another name`);
      }
      const dir = join(decksDir, deckId);
      rmSync(dir, { recursive: true, force: true });
      const result = copyDeck(
        decksDir,
        input,
        options.now === undefined ? {} : { now: options.now },
      );
      try {
        await pushDeckDir(c, deckId, dir, { overwrite: false, log });
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        if (isBlobExistsError(error)) {
          throw new TypeError(`decks/${deckId} exists already; pick another name`);
        }
        throw error;
      }
      const row = headFromMirror(deckId);
      if (row !== null) noteHead(deckId, row);
      return result;
    },
    async trash(deckId, baseRevision) {
      const result = await stamp(deckId, () =>
        trashDeck(decksDir, deckId, {
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(baseRevision !== undefined ? { baseRevision } : {}),
        }),
      );
      const row = headFromMirror(deckId);
      if (row !== null) noteHead(deckId, row);
      return result;
    },
    async restore(deckId, baseRevision) {
      const result = await stamp(deckId, () =>
        restoreDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {}),
      );
      const row = headFromMirror(deckId);
      if (row !== null) noteHead(deckId, row);
      return result;
    },
    async remove(deckId, baseRevision) {
      await ready();
      const c = await client();
      const prefix = deckPrefix(deckId);
      if ((await c.head(`${prefix}deck.json`)) === null)
        throw new RangeError(`No deck ${deckId} in the Blob store`);
      if (baseRevision !== undefined) {
        const store = await storeFor(deckId);
        await store.sync(true);
        checkRevision(decksDir, deckId, baseRevision);
      }
      // the manifest goes first, so a reader that lists the prefix never sees a deck without one
      await c.del([`${prefix}deck.json`]);
      const rest = (await c.list(prefix)).map((entry) => entry.pathname);
      await c.del(rest);
      stores.delete(deckId);
      for (const pathname of [...urls.keys()])
        if (pathname.startsWith(prefix)) urls.delete(pathname);
      rmSync(join(decksDir, deckId), { recursive: true, force: true });
      noteHead(deckId, null);
      return { id: deckId, removed: true as const };
    },
    async ensureAssets(deckId) {
      await ready();
      // the seed's twins from the bundle, then whatever the store holds beyond them, then the
      // static source for a seed deck whose twins left the bundle (SPEC-4 0.35)
      await overlay.ensureAssets(deckId);
      await (await storeFor(deckId)).pullAssets();
      await fetchMissingTwins(deckId, true);
    },
    async assetFile(deckId, relative) {
      await ready();
      await overlay.ensureAssets(deckId);
      const file = assetPathWithin(decksDir, deckId, relative);
      return file !== null && existsSync(file) ? file : null;
    },
    async assetUrl(deckId, relative, assetKey) {
      await ready();
      if (!isSafeKey(relative) || !isAssetKey(`${deckId}/assets/${relative}`)) return null;
      // a keyed media file first when the caller holds the deck's key (SPEC-5 0.19), the plain
      // prefix otherwise; both answers are cached by pathname, a miss never is
      const pathnames = [
        ...(assetKey !== undefined && ASSET_KEY_PATTERN.test(assetKey)
          ? [`${keyedPrefix(deckId, assetKey)}${relative}`]
          : []),
        `${deckPrefix(deckId)}assets/${relative}`,
      ];
      for (const pathname of pathnames) {
        const cached = urls.get(pathname);
        if (cached !== undefined && cached !== null) return cached;
        const entry = await (await client()).head(pathname);
        const url = entry === null ? null : entry.url;
        // a miss is not cached: a twin another instance puts after this instance asked for it
        // (SPEC-3 0.39) must be found on the next request, and asset names never change bytes
        if (url !== null) {
          urls.set(pathname, url);
          return url;
        }
      }
      return null;
    },
    async rotateAssetKey(deckId, from, to) {
      await ready();
      const result = await (await storeFor(deckId)).rotateAssetKey(from, to);
      for (const pathname of [...urls.keys()])
        if (pathname.startsWith(keyedPrefix(deckId, from))) urls.delete(pathname);
      return result;
    },
    async reindex() {
      await ready();
      const ids = await deckIds();
      const c = await client();
      const rows: DeckHead[] = [];
      await eachLimit(ids, 8, async (deckId) => {
        const fetched = await c.get(`${deckPrefix(deckId)}deck.json`);
        if (fetched === null) return;
        const head = deckHeadOf(deckId, fetched.bytes);
        if (head !== null) rows.push(head);
      });
      const { version } = await readIndex(c);
      pendingRows.clear();
      await putIndex(c, { schemaVersion: 1, updatedAt: nowIso(), decks: rows }, version);
      return { decks: rows.length };
    },
    flushIndex,
    facts() {
      return factsFor(options.selection, decksDir, options.seed);
    },
  };
}

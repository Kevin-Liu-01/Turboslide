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
//
// The sync and costs round (docs/SYNC.md 3.2, 3.5, 3.6, 6.3): the head is read, never listed (a
// pull walks the records by number, proves the document from the snapshot the manifest's etag
// names and reads the comments sidecar through its index head; `list` runs in the prune, the
// removal and the listing page alone); a record names its origin and a write whose op ids a
// record above its base names is answered with that record instead of a second commit (on
// deployment N, which writes no origin yet, the instance holds the origins of its own commits in
// memory and answers the resend it committed itself; the sync round fix round, F4); the
// walk continues past a missing record number and a timed out commit keeps its record as a
// claim; the leases are read proven; the prune runs every SNAPSHOT_PRUNE_EVERY records; and
// `boundedBlobClient` counts every call by deck and operation for `sync.status.storeCalls`.
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

import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Lease, Version } from '@turboslide/schema/mutations';
import { applyWrite } from '@turboslide/schema/reduce';

import { INDEX_FILE, fileCommentsOnWrite, pullSidecar, pushSidecar } from './comments-store.ts';
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
  pruneDue,
  retainedSnapshots,
  snapshotBody,
  snapshotKey,
  snapshotKeyOf,
  snapshotPath,
} from './snapshots.ts';
import {
  RECORD_ORIGIN_WRITES,
  documentAtVersion,
  readVersions,
  recordAtRevision,
  recordNamingOps,
  versionRecordSchema,
  writeVersion,
} from './versions.ts';
import type { FileStore } from './file-store.ts';
import type { HostedDecks, HostedOptions } from './hosted.ts';
import { provenGet, putWithCopy } from './access-store.ts';
import { assetPathWithin, checkRevision, factsFor } from './hosted.ts';
import { HOSTED_POLL_MS, isStoreBusy, pulsePath, putPulse } from './pulse.ts';
import { eachLimit, isAssetKey, isSafeKey } from './seed.ts';
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
  WriteOrigin,
  WriteOutcome,
} from './store.ts';
import { AssetExistsError } from './store.ts';
import { byNewest, copyDeck, createDeck, deckIdFor, restoreDeck, trashDeck } from './templates.ts';
import type { DeckHead, TrashState } from './templates.ts';
import { blobTemplates } from './blob-templates.ts';
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
  /** cancels the put underneath (BlobCallOptions.signal) */
  signal?: AbortSignal;
};

/**
 * What every call of the client may carry: a signal that cancels the call underneath (the SDK's
 * `abortSignal`). The bounded client (`boundedBlobClient`) fires it at the call's deadline, so
 * the SDK's own retry chain ends there; without it a call past its deadline kept running for
 * minutes (the focus round, cycle 3; the note on `boundedBlobClient`). A client that cannot
 * cancel ignores it.
 */
export type BlobCallOptions = {
  signal?: AbortSignal;
  /**
   * The version (etag) the caller knows the body has now, from a `head` or from a manifest that
   * names it: a client whose body reads go through a CDN (Vercel Blob's public stores) reads until
   * the copy carries this version, since an overwrite at the same pathname leaves the edge's copy
   * behind for a few seconds (the product round's ship step: the templates index read stale 1 s
   * after a delete on another instance). A BlobStaleReadError ends the wait after CDN_LAG_MS.
   */
  version?: string;
};

/** How long a body read waits for the CDN copy to carry the version the caller named. */
export const CDN_LAG_MS = 6000;

export type BlobClient = {
  /** the entry, or null when the pathname is not stored */
  head: (pathname: string, options?: BlobCallOptions) => Promise<BlobEntry | null>;
  /** the current bytes, never a cached copy, or null */
  get: (
    pathname: string,
    options?: BlobCallOptions,
  ) => Promise<{ entry: BlobEntry; bytes: Uint8Array } | null>;
  /** every blob under a prefix, every page */
  list: (prefix: string, options?: BlobCallOptions) => Promise<BlobEntry[]>;
  /** the folders directly under a prefix, each with its trailing slash */
  folders: (prefix: string, options?: BlobCallOptions) => Promise<string[]>;
  put: (pathname: string, bytes: Uint8Array, options: BlobPutOptions) => Promise<BlobEntry>;
  /** removes what exists; a missing pathname is not an error */
  del: (pathnames: ReadonlyArray<string>, options?: BlobCallOptions) => Promise<void>;
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

/** A body read that never caught up with the version the caller named (BlobCallOptions.version). */
export class BlobStaleReadError extends Error {
  readonly pathname: string;
  readonly version: string;
  constructor(pathname: string, version: string) {
    super(`${pathname} still reads an older copy than ${version} in the Blob store's CDN`);
    this.name = 'BlobStaleReadError';
    this.pathname = pathname;
    this.version = version;
  }
}

/** True for a BlobStaleReadError from any copy of this module (see isBlobExistsError). */
export function isBlobStaleReadError(error: unknown): error is BlobStaleReadError {
  if (error instanceof BlobStaleReadError) return true;
  return (
    error instanceof Error &&
    (error.name === 'BlobStaleReadError' || / in the Blob store's CDN$/.test(error.message))
  );
}

/**
 * True for a BlobExistsError from any copy of this module. A server bundle can carry two copies
 * of blob-store.ts (the studio's own chunk and the one the hosted dispatcher pulls in), and then
 * `instanceof` fails against the copy that threw while the name and the message survive. Every
 * catch site reads through this helper, never through `instanceof` (VERIFICATION-3 finding 34;
 * the production outage of 2026-09-15 where the seed's refused asset put poisoned `ready()`).
 */
export function isBlobExistsError(error: unknown): error is BlobExistsError {
  if (error instanceof BlobExistsError) return true;
  return (
    error instanceof Error &&
    (error.name === 'BlobExistsError' || / exists in the Blob store already$/.test(error.message))
  );
}

/** True for a BlobPreconditionError from any copy of this module (see isBlobExistsError). */
export function isBlobPreconditionError(error: unknown): error is BlobPreconditionError {
  if (error instanceof BlobPreconditionError) return true;
  return (
    error instanceof Error &&
    (error.name === 'BlobPreconditionError' ||
      / changed in the Blob store since it was read$/.test(error.message))
  );
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

/**
 * The record number this write wants is stored already (the focus round, docs/FOCUS.md ranks 20
 * and 21): a record of a commit this mirror has not fetched, or the claim of a write in flight on
 * another instance. The write stops before its commit and the caller retries from the current
 * document; a record is never overwritten.
 */
export class RecordTakenError extends Error {
  readonly relative: string;
  constructor(deckId: string, relative: string) {
    super(
      `Another instance holds ${relative} of ${deckId}; retry the write from the current document`,
    );
    this.name = 'RecordTakenError';
    this.relative = relative;
  }
}

/**
 * How long a record claim whose revision is above the deck's may stand before another writer
 * treats it as the leftover of a writer that stopped between its claim and its commit and takes
 * the number over. A commit follows its claim within a request, so a minute is generous.
 */
export const CLAIM_GRACE_MS = 60_000;

/** A stored record's bytes as a record, or null when they do not parse. */
function parseRecordBytes(bytes: Uint8Array): VersionRecord | null {
  try {
    const parsed = versionRecordSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The slide ids a manifest lists, in section order, read from its raw bytes without validating
 * the deck: the set of slide bodies a document at that manifest is made of. The listing of a
 * deck prefix lags the store by up to a minute (the note on `pull`), so the manifest, never the
 * listing, names the bodies a pull must prove (docs/FOCUS.md rank 3: an instance answered a
 * document at the manifest's revision with the listing's slides, and refused the undo of a
 * delete with "Slide already exists" or the redo with "No slide").
 */
export function manifestSlideIds(bytes: Uint8Array): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null) return [];
  const sections = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  const ids: string[] = [];
  for (const section of sections) {
    const list = (section as { slideIds?: unknown } | null)?.slideIds;
    if (!Array.isArray(list)) continue;
    for (const id of list) if (typeof id === 'string' && isSafeKey(id)) ids.push(id);
  }
  return ids;
}

/**
 * Stores the whole document under its key with overwrite refused (SPEC-2 8.2). A snapshot that
 * exists already is left alone when its bytes are ours (a retry, or an identical write on
 * another instance: equal bytes are one document). The key is the md5 of the manifest bytes
 * alone, so two writers that start from one revision inside one clock millisecond push equal
 * manifests with different slide bodies and want the same name (measured in hosted.test.ts with
 * a frozen clock); the one whose body the name holds proceeds, the other stops before its
 * manifest push with SnapshotContestedError, which write() answers as a conflict, so no
 * committed etag ever names a body its writer did not store. Since the focus round every push
 * of `deck.json` stores its snapshot first: the write, the trash and restore stamps and the
 * upload of a new deck (`pushDeckDir`), so a reader proves any current manifest from its
 * snapshot without a body read (docs/FOCUS.md ranks 7 and 21). A stamp passes `acceptExisting`:
 * it changes no slide, so a snapshot that already holds its key is this document (a restore's
 * manifest bytes are the last write's, whose snapshot that write stored), and the head read that
 * proves a write's body is one round trip a restore does not need (the fix round, F12: the
 * reload the trash page's Restore is followed by lands inside the stamp's flight time).
 */
async function storeSnapshot(
  client: BlobClient,
  deckId: string,
  key: string,
  body: Uint8Array,
  options: { acceptExisting?: boolean } = {},
): Promise<void> {
  const relative = snapshotPath(key);
  const pathname = `${deckPrefix(deckId)}${relative}`;
  try {
    await client.put(pathname, body, {
      overwrite: false,
      contentType: blobContentType(relative),
    });
  } catch (error) {
    if (!isBlobExistsError(error)) throw error;
    if (options.acceptExisting === true) return;
    const existing = await client.head(pathname);
    if (existing !== null && existing.version === quotedMd5(body)) return;
    throw new SnapshotContestedError(deckId, key);
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

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** A promise's outcome as a value, so several puts in flight are every one awaited. */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long a write waits before it retries after another writer's claim took its record number. */
export const CLAIM_RETRY_MS = 200;

/** How many of the newest records a pull reads to find claims above the proven document. */
export const CLAIMS_CHECKED = 4;

/**
 * How many missing record numbers in a row the pull's walk reads past while the records it
 * found sit below the proven manifest's revision (docs/SYNC.md 3.6, the hole's second rule): a
 * hole in the log is one or two numbers wide (a claim released under a commit that landed late,
 * a record a store lost), never a run of them, so a longer run of misses under the manifest's
 * revision is a log the manifest got ahead of (a commit whose record put failed) and the walk
 * stops there rather than head numbers to the horizon on every pull.
 */
export const HOLE_WALK_LOOKAHEAD = 3;
/** The most records the walk reads by number in a row before it asks the store's head for the next: a cold mirror of a long log. */
export const RECORD_WALK_BATCH = 8;
/** The most records one pull walks (the bound the walk had when it ran off the listing). */
export const RECORD_WALK_MAX = 10_000;
/**
 * The most record origins one store instance holds in memory for the records it committed
 * without storing their origin (docs/SYNC.md 3.2, deployment N): the bound of invariant 3, the
 * replay's 2,000 entries (`REPLAY_MAX_ENTRIES`, realtime/protocol.ts), spelled here so this
 * package takes no realtime dependency; the oldest number leaves first.
 */
export const HELD_ORIGINS_MAX = 2000;

function serialQueue(): <T>(run: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };
}

// ---------------------------------------------------------------------------------------------
// The deadline on every call to the store

/**
 * How long one read of the Blob store (`head`, `get`, `list`, `folders`, `del`) may take, how
 * long a put of a document may (a manifest, a slide body, a record, a snapshot: kilobytes) and
 * how long a put of a twin may (up to the asset cap). A call past its deadline is a
 * BlobTimeoutError and the store's queue moves on (the focus round, cycle 2). Every call of a
 * deck's store runs through one serial queue per instance (`serialQueue`), and the SDK's fetch
 * has no timeout of its own, so one call that never answered held the queue and every request
 * of that deck on the instance with it: `asset.add` through the window API did not return for
 * nine and a half minutes on the enforce preview while the deck stood unchanged in the store
 * (VERIFICATION F-stall, F-asset-add-intermittent; b4's fix round saw 665 s once).
 *
 * The read deadline is 10 s since cycle 3 (it was 20 s): a `head` answers in well under a second
 * and an ops POST on the blob tier makes two to four of them in a row (the live document, the
 * forced syncs of `liveAtLeast`, the write's own head), while the room client gives a POST 30 s
 * (controller.tsx OPS_POST_TIMEOUT_MS) and resends after that with the server still working on
 * the first, which admits the write twice. With 10 s the SDK still gets four attempts inside the
 * deadline (its retry waits are 1, 2 and 4 s), and the POST's reads end inside the client's
 * bound. The document put deadline keeps the commit inside the same bound; the twin put keeps
 * 90 s.
 */
export const BLOB_READ_TIMEOUT_MS = 10_000;
/**
 * The deadline on one call of the deck listing (`HostedDecks.list` on the blob tier): a manifest
 * head answers in well under a second, and the listing makes one per deck, four at a time, so a
 * head the store holds for the full read deadline held a lane of the listing for 10 s and the
 * Open dialog with it (the return round, VERIFICATION R1-F3: the list arrived after 26 s once
 * and not within 30 s once on a store of 65 decks). A deck whose call meets this deadline is
 * served from the listing's cache or left out of this one listing, never the whole listing failed.
 */
export const BLOB_LISTING_READ_TIMEOUT_MS = 4_000;
/**
 * How long the listing remembers a folder under `decks/` that held no manifest, before it heads
 * it again (the return round fix round, VERIFICATION R1-F3, R1-F4). The shared store held 489
 * such folders beside 65 decks on 2026-09-19: the leftovers of removed decks (the presence
 * record, its copies and the pulse, refreshed every few seconds while a tab is open, which the
 * removal's prefix listing missed because the listing lags the store by up to a minute), and
 * every listing headed each of them, 552 heads for 65 cards. A folder a deck is made into again
 * under the same id lists on this instance at once (`create` and `copy` forget it) and on every
 * other within this time.
 */
export const LISTING_PHANTOM_TTL_MS = 5 * 60_000;

// ---------------------------------------------------------------------------------------------
// The fresh deck index (the product round, docs/PRODUCT.md 8.2 the recorded classes; RETURN
// VERIFICATION R2-F2, ship.md section 5 `decks.card.make-a-copy`): a deck made or copied on one
// instance listed on another only once `folders('decks/')` showed its folder, up to a minute,
// so a `/decks` load inside that minute on another instance showed no card for the copy a
// seller had just made. One record at a fixed pathname, which a `get` reads at the store's head
// (a pathname read is consistent where the folder listing is not), names the decks made in the
// last FRESH_DECK_TTL_MS: the create and the copy append the id after their push (one get and
// one put, event driven), the listing reads it once (one get) and heads the manifests the folder
// listing lacks (one head each, as for every listed deck). Best effort on both sides: a lost
// race on the put leaves the old lag for that one deck and never fails the create; a record
// that cannot be read leaves the listing as it was. Nothing here is a timer.

/** Where the record lives: outside `decks/`, so the folder listing never reads it as a deck. */
export const FRESH_DECKS_PATH = 'index/fresh-decks.json';
/** How long a deck stays in the record: past the folder listing's lag with a margin. */
export const FRESH_DECK_TTL_MS = 2 * 60_000;
/** The most ids the record holds, newest kept. */
export const FRESH_DECKS_MAX = 200;

export type FreshDeck = { id: string; at: string };

/** The rows of a stored record; anything malformed reads as no rows. */
export function parseFreshDecks(bytes: Uint8Array | null | undefined): FreshDeck[] {
  if (bytes === null || bytes === undefined) return [];
  try {
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; decks?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.decks)) return [];
    return raw.decks.filter(
      (row): row is FreshDeck =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as FreshDeck).id === 'string' &&
        isSafeKey((row as FreshDeck).id) &&
        typeof (row as FreshDeck).at === 'string' &&
        Number.isFinite(Date.parse((row as FreshDeck).at)),
    );
  } catch {
    return [];
  }
}

export function freshDecksBytes(rows: readonly FreshDeck[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, decks: rows }));
}

/** The rows with `id` noted at `at`, the stale rows dropped, newest first, at most FRESH_DECKS_MAX. */
export function withFreshDeck(
  rows: readonly FreshDeck[],
  id: string,
  at: string,
  ttlMs: number = FRESH_DECK_TTL_MS,
): FreshDeck[] {
  const now = Date.parse(at);
  const kept = rows.filter((row) => row.id !== id && now - Date.parse(row.at) <= ttlMs);
  return [{ id, at }, ...kept]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, FRESH_DECKS_MAX);
}

/** The ids the record names that are younger than the ttl at `now`. */
export function freshDeckIdsOf(
  rows: readonly FreshDeck[],
  now: number,
  ttlMs: number = FRESH_DECK_TTL_MS,
): string[] {
  return rows.filter((row) => now - Date.parse(row.at) <= ttlMs).map((row) => row.id);
}

/**
 * Notes a deck made or copied a moment ago: one get, one put under the record's version (a lost
 * race is tried once more, then left; the folder listing catches the deck up within its minute).
 * Never throws: the create it follows has landed already.
 */
export async function noteFreshDeck(
  client: BlobClient,
  deckId: string,
  at: string,
  log: (line: string) => void = () => undefined,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const current = await client.get(FRESH_DECKS_PATH);
      const rows = withFreshDeck(parseFreshDecks(current?.bytes), deckId, at);
      await client.put(FRESH_DECKS_PATH, freshDecksBytes(rows), {
        overwrite: true,
        contentType: 'application/json',
        ...(current !== null ? { ifMatch: current.entry.version } : {}),
      });
      return true;
    } catch (error) {
      if (attempt === 1 || !isBlobPreconditionError(error)) {
        log(
          `blob: the fresh deck index was not written for ${deckId}: ${error instanceof Error ? error.message : String(error)}; the folder listing catches it up`,
        );
        return false;
      }
    }
  }
  return false;
}

/** The decks the record names as fresh at `now`; nothing when the record cannot be read. */
export async function freshDeckIds(client: BlobClient, now: number): Promise<string[]> {
  try {
    const current = await client.get(FRESH_DECKS_PATH);
    return freshDeckIdsOf(parseFreshDecks(current?.bytes), now);
  } catch {
    return [];
  }
}
/** The turn after the deadline in which an answer that arrived during a stall still counts. */
export const TIMEOUT_GRACE_MS = 250;
export const BLOB_WRITE_TIMEOUT_MS = 90_000;
/** A put of a body at or under this many bytes is a document put and meets the document deadline. */
export const DOCUMENT_PUT_MAX_BYTES = 256 * 1024;
export const BLOB_DOCUMENT_WRITE_TIMEOUT_MS = 20_000;

export class BlobTimeoutError extends Error {
  readonly op: keyof BlobClient;
  readonly pathname: string;
  constructor(op: keyof BlobClient, pathname: string, ms: number) {
    super(`The Blob store did not answer ${op} ${pathname} within ${Math.round(ms / 1000)} s`);
    this.name = 'BlobTimeoutError';
    this.op = op;
    this.pathname = pathname;
  }
}

/** True for a BlobTimeoutError from any copy of this module (see isBlobExistsError). */
export function isBlobTimeoutError(error: unknown): error is BlobTimeoutError {
  if (error instanceof BlobTimeoutError) return true;
  return (
    error instanceof Error &&
    (error.name === 'BlobTimeoutError' || /^The Blob store did not answer /.test(error.message))
  );
}

// ---------------------------------------------------------------------------------------------
// The store call counters (docs/SYNC.md 6.3, the call counting harness)

/** The sliding window the counters cover. */
export const STORE_CALLS_WINDOW_MS = 60_000;

/** The five operations the counters name; `folders` counts as a `list` (one advanced operation per page, like a list). */
export type StoreCallOp = 'head' | 'get' | 'put' | 'list' | 'del';

export const STORE_CALL_OPS: readonly StoreCallOp[] = ['head', 'get', 'put', 'list', 'del'];

/**
 * What `sync.status.storeCalls` answers for one deck: the calls of each operation this instance
 * made under the deck's prefix inside the last `windowMs`, and the id of the instance that
 * answered, so a probe that samples a deployment can tell two answering instances apart (the
 * counters are per instance and the platform routes to whichever is warm; docs/SYNC.md 6.3).
 */
export type StoreCalls = Record<StoreCallOp, number> & {
  windowMs: number;
  instance: string;
  /**
   * the `list` calls by the folder they listed under the deck (the sync and costs round's ship):
   * the pull reads records by number and never lists `versions` (docs/SYNC.md 3.5, the row
   * `sync.pull.no-listing`); the prune lists `snapshots`, a deck's first open on an instance
   * `assets`, the card render `thumbs`, the removal `presence` and the deck itself, so a probe
   * that counts the deck's listings can name each one
   */
  lists: Record<StoreListFolder, number>;
};

/** The folders a `list` under `decks/<id>/` names, for `StoreCalls.lists`. */
export type StoreListFolder =
  'versions' | 'snapshots' | 'assets' | 'thumbs' | 'presence' | 'deck' | 'other';

export const STORE_LIST_FOLDERS: readonly StoreListFolder[] = [
  'versions',
  'snapshots',
  'assets',
  'thumbs',
  'presence',
  'deck',
  'other',
];

/** The folder a listed prefix names under its deck: `decks/<id>/snapshots/` is `snapshots`, `decks/<id>/.turboslide/presence/` is `presence`, the deck prefix itself is `deck`. */
export function listFolderOf(prefix: string): StoreListFolder {
  const match = /^decks\/[^/]+\/(.*)$/.exec(prefix);
  if (match === null) return 'other';
  const rest = (match[1] ?? '').replace(/^\.turboslide\//, '');
  if (rest === '') return 'deck';
  const folder = rest.split('/')[0] ?? '';
  return (STORE_LIST_FOLDERS as readonly string[]).includes(folder) && folder !== 'deck'
    ? (folder as StoreListFolder)
    : 'other';
}

type CallTimes = Record<StoreCallOp, number[]> & { lists: Record<StoreListFolder, number[]> };

const CALLS = Symbol.for('turboslide.storeCalls');
const INSTANCE = Symbol.for('turboslide.storeInstanceId');

type SharedCounters = typeof globalThis & {
  [CALLS]?: Map<string, CallTimes>;
  [INSTANCE]?: string;
};

/** The log of call times by deck, one per process whatever copies of this module a bundle carries (isBlobExistsError says why). */
function callLog(): Map<string, CallTimes> {
  const shared = globalThis as SharedCounters;
  return (shared[CALLS] ??= new Map());
}

/**
 * A random id the process mints once: the `instance` of every `storeCalls` answer, the same on
 * every copy of this module. Eight hex characters, enough to tell the two or three instances a
 * deployment runs at once apart in a probe's JSON, and nothing anyone can address.
 */
export function storeInstanceId(): string {
  const shared = globalThis as SharedCounters;
  return (shared[INSTANCE] ??= createHash('md5')
    .update(`${process.pid}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 8));
}

/** The deck a stored pathname belongs to (`decks/<id>/...`), or null for a path outside `decks/`. */
export function deckIdOfPathname(pathname: string): string | null {
  const match = /^decks\/([^/]+)\//.exec(pathname);
  return match?.[1] ?? null;
}

const emptyLists = (): Record<StoreListFolder, number[]> => ({
  versions: [],
  snapshots: [],
  assets: [],
  thumbs: [],
  presence: [],
  deck: [],
  other: [],
});

const emptyTimes = (): CallTimes => ({
  head: [],
  get: [],
  put: [],
  list: [],
  del: [],
  lists: emptyLists(),
});

/** Drops the times older than the window from one list of times. */
function trimList(list: number[], now: number): void {
  let drop = 0;
  while (drop < list.length && (list[drop] as number) <= now - STORE_CALLS_WINDOW_MS) drop += 1;
  if (drop > 0) list.splice(0, drop);
}

/** Drops the times older than the window from one deck's log. */
function trimTimes(times: CallTimes, now: number): void {
  for (const op of STORE_CALL_OPS) trimList(times[op], now);
  for (const folder of STORE_LIST_FOLDERS) trimList(times.lists[folder], now);
}

/**
 * Records one call of the store on this instance under the deck the pathname names (a path
 * outside `decks/` counts under the empty key). `boundedBlobClient` calls it for every call it
 * bounds, so every call of a deck store, the collection, the presence store and the comments
 * watch is counted once; the fake of the unit tests records its own `calls` list beside this.
 */
export function noteStoreCall(op: StoreCallOp, pathname: string, now: number = Date.now()): void {
  const key = deckIdOfPathname(pathname) ?? '';
  const log = callLog();
  let times = log.get(key);
  if (times === undefined) {
    times = emptyTimes();
    log.set(key, times);
  }
  trimTimes(times, now);
  times[op].push(now);
  if (op === 'list') times.lists[listFolderOf(pathname)].push(now);
}

/** The counts of one deck's calls inside the window, and this instance's id. */
export function storeCallsFor(deckId: string, now: number = Date.now()): StoreCalls {
  const times = callLog().get(deckId);
  const counts: StoreCalls = {
    head: 0,
    get: 0,
    put: 0,
    list: 0,
    del: 0,
    windowMs: STORE_CALLS_WINDOW_MS,
    instance: storeInstanceId(),
    lists: { versions: 0, snapshots: 0, assets: 0, thumbs: 0, presence: 0, deck: 0, other: 0 },
  };
  if (times === undefined) return counts;
  trimTimes(times, now);
  for (const op of STORE_CALL_OPS) counts[op] = times[op].length;
  for (const folder of STORE_LIST_FOLDERS) counts.lists[folder] = times.lists[folder].length;
  return counts;
}

/** Forgets every counted call (the tests). */
export function resetStoreCalls(): void {
  callLog().clear();
}

const BOUNDED = Symbol.for('turboslide.boundedBlobClient');

type Bounded = BlobClient & { [BOUNDED]?: true };

export type BlobDeadlines = {
  readMs?: number;
  /** the put of a twin (a body above DOCUMENT_PUT_MAX_BYTES) */
  writeMs?: number;
  /** the put of a document (a body at or under DOCUMENT_PUT_MAX_BYTES) */
  documentWriteMs?: number;
};

/** The put deadline a body meets: the document deadline for a document sized body, the twin deadline above it. */
export function putDeadlineFor(bytes: number, deadlines: BlobDeadlines = {}): number {
  return bytes > DOCUMENT_PUT_MAX_BYTES
    ? (deadlines.writeMs ?? BLOB_WRITE_TIMEOUT_MS)
    : (deadlines.documentWriteMs ?? BLOB_DOCUMENT_WRITE_TIMEOUT_MS);
}

/** The signal the call underneath gets: the deadline's, joined with the caller's when there is one. */
function callSignal(deadline: AbortSignal, own: AbortSignal | undefined): AbortSignal {
  if (own === undefined) return deadline;
  return AbortSignal.any([deadline, own]);
}

/**
 * The client with a deadline on every call. At the deadline the call underneath is cancelled
 * through its signal (`BlobCallOptions.signal`, the SDK's `abortSignal`) and the caller's promise
 * settles with BlobTimeoutError; the store continues. The cancel matters (the focus round, cycle
 * 3, VERIFICATION C2-F24 and C2-F27): the SDK retries every request up to VERCEL_BLOB_RETRIES
 * (10) times on a network error or a 5xx, with waits of 1, 2, 4, 8 ... seconds between them, so
 * a call this deadline gave up on kept retrying underneath for up to seventeen minutes, holding
 * its sockets and hitting the store at every step; every timed out call on a stalled instance
 * left one such chain behind it, and the instance stayed slow long after whatever had stalled
 * it (the enforce preview's "Saving..." for eight minutes, the ops route's `BlobTimeoutError ...
 * head deck.json within 20 s` lines). A client wrapped once is not wrapped again. Every call it
 * bounds is counted under the deck the pathname names (`noteStoreCall`; docs/SYNC.md 6.3), which
 * is what `sync.status.storeCalls` reads.
 */
export function boundedBlobClient(client: BlobClient, deadlines: BlobDeadlines = {}): BlobClient {
  if ((client as Bounded)[BOUNDED] === true) return client;
  const readMs = deadlines.readMs ?? BLOB_READ_TIMEOUT_MS;
  const bound = <T>(
    op: keyof BlobClient,
    pathname: string,
    ms: number,
    own: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>,
  ) =>
    new Promise<T>((resolve, reject) => {
      noteStoreCall(op === 'folders' ? 'list' : op, pathname);
      const controller = new AbortController();
      let settled = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        // an instance that stalled (a frozen function, a blocked loop) runs its expired timers
        // before the poll phase delivers the answers that arrived during the stall, so the
        // deadline is judged one short turn later: an answer that did arrive settles the call,
        // one that did not is the timeout (the cycle 2 enforce preview flushed fifteen queued
        // presence posts in two seconds and refused the ops POST beside them with this error;
        // the integrator at the merge, for b7)
        grace = setTimeout(() => {
          if (settled) return;
          settled = true;
          // the call underneath ends here with the deadline, retry chain included; the abort
          // carries no reason of its own, so the SDK meets the plain AbortError its retry loop
          // bails on (any other error class is one it retries)
          controller.abort();
          reject(new BlobTimeoutError(op, pathname, ms));
        }, TIMEOUT_GRACE_MS);
        grace.unref();
      }, ms);
      timer.unref();
      const done = (): void => {
        clearTimeout(timer);
        if (grace !== undefined) clearTimeout(grace);
      };
      run(callSignal(controller.signal, own)).then(
        (value) => {
          if (settled) return;
          settled = true;
          done();
          resolve(value);
        },
        (error: unknown) => {
          // the rejection of a call this deadline cancelled is the deadline's, already answered
          if (settled) return;
          settled = true;
          done();
          reject(error);
        },
      );
    });
  const wrapped: Bounded = {
    head: (pathname, options) =>
      bound('head', pathname, readMs, options?.signal, (signal) =>
        client.head(pathname, { ...options, signal }),
      ),
    get: (pathname, options) =>
      bound('get', pathname, readMs, options?.signal, (signal) =>
        client.get(pathname, { ...options, signal }),
      ),
    list: (prefix, options) =>
      bound('list', prefix, readMs, options?.signal, (signal) =>
        client.list(prefix, { ...options, signal }),
      ),
    folders: (prefix, options) =>
      bound('folders', prefix, readMs, options?.signal, (signal) =>
        client.folders(prefix, { ...options, signal }),
      ),
    put: (pathname, bytes, options) =>
      bound(
        'put',
        pathname,
        putDeadlineFor(bytes.byteLength, deadlines),
        options.signal,
        (signal) => client.put(pathname, bytes, { ...options, signal }),
      ),
    del: (pathnames, options) =>
      bound('del', pathnames[0] ?? '', readMs, options?.signal, (signal) =>
        client.del(pathnames, { ...options, signal }),
      ),
  };
  wrapped[BOUNDED] = true;
  return wrapped;
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
  /**
   * test hooks, to stage a race: `beforeCommit` runs between the local write and the push,
   * `afterHead` between the head read that opens a write and the pull that follows it
   */
  hooks?: { beforeCommit?: () => Promise<void>; afterHead?: () => Promise<void> };
  /** how long an unreferenced snapshot is left alone before the prune removes it; default 5 minutes */
  snapshotGraceMs?: number;
  /** the deadlines on the store's calls (boundedBlobClient); the module's defaults when absent */
  deadlines?: BlobDeadlines;
  /**
   * A read of a deck this instance has mirrored is answered from the mirror while the store
   * refuses (a 429, a 5xx, the deadline); off, the refusal is the caller's error. The hosted
   * collection turns it on for the studio's pages (`blobDecks`); a bare store, the CLI's among
   * them, keeps the store's answer (the focus round, cycle 3 fix round).
   */
  degradedReads?: boolean;
  /**
   * Whether a committed write's record stores the write's `origin` (docs/SYNC.md 3.2); the
   * deployment constant `RECORD_ORIGIN_WRITES` (versions.ts) by default, which deployment N
   * ships as false and N plus 1 as true. The origin check on a write runs whatever this reads.
   */
  writeOrigin?: boolean;
};

export type BlobStore = DeckStore & {
  readonly dir: string;
  /** pulls the deck's documents when the store's manifest moved; `force` skips the time window */
  sync: (force?: boolean) => Promise<SyncState>;
  /** pulls the deck's twins that are missing locally; returns how many were written */
  pullAssets: () => Promise<number>;
  /** how many immutable documents the store holds under snapshots/ (deck.info's `snapshots`, SPEC-2 8.2) */
  snapshots: () => Promise<number>;
  /** removes every snapshot no retained record names; returns how many went (write() runs this every SNAPSHOT_PRUNE_EVERY records; the channel runs it when the deck's last stream on the instance closes) */
  pruneSnapshots: () => Promise<number>;
  /** how many reads the mirror answered while the store refused (the focus round, cycle 3 fix round) */
  degradedReads: () => number;
};

export function openBlobStore(options: BlobStoreOptions): BlobStore {
  const { deckId, dir } = options;
  // every call to the store meets a deadline, so a fetch that never answers cannot hold the
  // deck's queue on this instance (boundedBlobClient)
  const client = boundedBlobClient(options.client, options.deadlines ?? {});
  const prefix = deckPrefix(deckId);
  const pollMs = options.pollMs ?? 3000;
  const syncTtlMs = options.syncTtlMs ?? 750;
  const snapshotGraceMs = options.snapshotGraceMs ?? SNAPSHOT_GRACE_MS;
  const serial = serialQueue();
  const clock = options.now ?? (() => new Date().toISOString());
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
  let syncedAt = 0;
  let lastState: SyncState = { present: false, pulled: false, revision: null };

  /**
   * The origins of the records this instance committed while the record's bytes store none
   * (docs/SYNC.md 3.2: deployment N ships `writeOrigin` off, N plus 1 writes the field), by
   * record number. `records()` and the write path's origin check read the log with these merged
   * in, so the resend of a POST whose first attempt committed here is answered with its record on
   * this instance, as the memory of the last 512 admitted op ids did before the round (room.ts,
   * the focus round's cycle 3; retired for the record's origin, which deployment N does not
   * write yet: VERIFICATION.md sync pass 1, F4). The bytes in the store and in the mirror are
   * untouched, so a reader on the older deployment parses them as before, and a resend that
   * lands on another instance meets a record with no origin until N plus 1 is production. Held
   * on a proven commit alone: a claim another writer takes over after CLAIM_GRACE_MS would name
   * the wrong record. Bounded to HELD_ORIGINS_MAX, the oldest number first.
   */
  const heldOrigins = new Map<number, WriteOrigin>();
  const holdOrigin = (n: number, origin: WriteOrigin): void => {
    heldOrigins.delete(n);
    heldOrigins.set(n, origin);
    while (heldOrigins.size > HELD_ORIGINS_MAX) {
      const oldest = heldOrigins.keys().next().value;
      if (oldest === undefined) break;
      heldOrigins.delete(oldest);
    }
  };
  /** The log as read, with a held origin on every record of this instance's that stores none. */
  const withHeldOrigins = (records: VersionRecord[]): VersionRecord[] => {
    if (heldOrigins.size === 0) return records;
    return records.map((record) => {
      if (record.origin !== undefined) return record;
      const held = heldOrigins.get(record.n);
      return held === undefined ? record : { ...record, origin: held };
    });
  };

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
   * body as its base could commit over newer revisions (docs/hosting.md). The bodies a document
   * is made of are the ones its manifest names, never the listing's (the focus round, docs/
   * FOCUS.md rank 3): the listing lags, so it named a removed slide's body and missed an added
   * one, and a document "proven" by the manifest's etag alone carried the wrong slide set, which
   * the reducer refused as "Slide already exists" or "No slide" on the next write.
   */
  const pull = async (knownHead?: BlobEntry | null): Promise<void> => {
    const manifest = readManifest(dir);
    const before = existsSync(pathOf('deck.json')) ? loadDeckDir(dir).document : null;
    // the head the caller read a moment ago serves as the pull's, so a moved pulse costs one
    // manifest head and not two (docs/SYNC.md 4.5); a head that moves between the two calls
    // is caught by the caller's own check or the next tick
    const deckHead = knownHead === undefined ? await client.head(`${prefix}deck.json`) : knownHead;
    const next: Manifest = { files: {} };
    const fetchBody = async (
      relative: string,
    ): Promise<{ bytes: Uint8Array; version: string } | null> => {
      const fetched = await client.get(`${prefix}${relative}`);
      return fetched === null ? null : { bytes: fetched.bytes, version: fetched.entry.version };
    };
    /**
     * Records never change, so their first body is the body. The store's API (`head`) says
     * whether the record exists before its public URL is read: a `get` of the path before the
     * record landed seeded the edge's cached miss for that path, which then hid the record for
     * a while after it landed, so the pull could not prove the document and the next write on
     * the instance met a stale mirror (b6's cycle 3 reading, R2 b; VERIFICATION C2-F25 and
     * C2-F28, a second browser's slide late). A body the edge serves that does not hash to the
     * head's etag, or a miss the edge still serves, is read past the edge (`provenGet`). Answers
     * the record's revision (null when its bytes do not parse), or null when the store holds
     * no record under the name.
     */
    const fetchRecord = async (relative: string): Promise<{ revision: number | null } | null> => {
      const pathname = `${prefix}${relative}`;
      const version = (await client.head(pathname))?.version ?? null;
      if (version === null) return null;
      let fetched = await client.get(pathname);
      if (fetched === null || quotedMd5(fetched.bytes) !== version) {
        // a record has no immutable copy of its own: it is one
        fetched = await provenGet(client, pathname, { copyOf: false });
      }
      if (fetched === null) return null;
      writeAtomic(pathOf(relative), fetched.bytes);
      next.files[relative] = version;
      return { revision: parseRecordBytes(fetched.bytes)?.revision ?? null };
    };
    // 1. the records the mirror holds keep their rows: a record never changes, so the bytes
    // this instance proved once are the store's, and no call is made for them (the listing of
    // the prefix that used to open every pull is gone: docs/SYNC.md 3.5, invariant 7; the
    // listing lagged the store by up to a minute and cost one advanced operation per thousand
    // files under the prefix, and the walk below read the same records by number anyway)
    for (const relative of localDocuments(dir)) {
      if (!relative.startsWith('versions/')) continue;
      next.files[relative] =
        manifest.files[relative] ?? quotedMd5(new Uint8Array(readFileSync(pathOf(relative))));
    }
    if (deckHead === null) {
      for (const relative of localDocuments(dir)) {
        if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
      }
      writeManifestFile(dir, next);
      return;
    }
    // 1b. the snapshot path (gslides-parity SPEC-2 8.2): the etag is the md5 of the current
    // deck.json bytes and the writer stored the whole document under that key before it pushed
    // the manifest, so the snapshot is the current document, proven by its name; no revision is
    // read and no slide body is fetched. It is read first, so the walk of the records knows the
    // revision the log must reach. A deck written before the round, or a store whose deck.json
    // push failed after its snapshot, has none and takes the replay of step 3.
    const currentKey = etagMd5(deckHead.version);
    const snapshot = currentKey === null ? null : await readSnapshot(currentKey);
    const provenSnapshot =
      snapshot !== null && quotedMd5(canonicalJson(snapshot.deck)) === deckHead.version
        ? snapshot
        : null;
    /**
     * 1c. The records by number from the mirror's last one (docs/SYNC.md 3.5, 3.6): each is a
     * head and a get, RECORD_WALK_BATCH at a time once the walk has found records in a row (a
     * cold mirror of a long log), one at a time at the log's head (a warm mirror learning of one
     * commit pays one hit and one miss). A missing number is not the end of the log: the walk
     * continues past it while the records found sit below the proven manifest's revision, up to
     * HOLE_WALK_LOOKAHEAD misses in a row, and stops at the first miss once they have reached
     * it; a mirror that reads a hole holds the records on both sides of it, `announce` covers
     * the tabs above it with an external checkpoint and `deck.info.counts.holes` counts it
     * (versions.ts logHoles). Before this the walk stopped at the first missing number for good,
     * so every later commit reached the other instances as an external checkpoint alone.
     */
    const walkRecords = async (target: number | null): Promise<void> => {
      const last = lastRecord(dir, next);
      const newest = last === 0 ? null : pathOf(`versions/${last}.json`);
      let known =
        newest !== null && existsSync(newest)
          ? (parseRecordBytes(new Uint8Array(readFileSync(newest)))?.revision ?? 0)
          : 0;
      let n = last + 1;
      let batch = 1;
      let misses = 0;
      let hits = 0;
      const limit = last + RECORD_WALK_MAX;
      while (n <= limit) {
        const numbers: number[] = [];
        for (let k = n; k < n + batch && k <= limit; k += 1) numbers.push(k);
        const results = await Promise.all(numbers.map((k) => fetchRecord(`versions/${k}.json`)));
        let stop = false;
        for (const result of results) {
          if (result !== null) {
            misses = 0;
            hits += 1;
            if (result.revision !== null) known = Math.max(known, result.revision);
            continue;
          }
          misses += 1;
          hits = 0;
          // the lookahead runs only past a log the walk knows a record of: a deck with no
          // record at all (the seed at its revision, a deck made from a template) has nothing
          // to walk toward
          if (target === null || known === 0 || known >= target || misses > HOLE_WALK_LOOKAHEAD) {
            stop = true;
            break;
          }
        }
        if (stop) break;
        n += numbers.length;
        // the batch grows from the second hit in a row, so a warm mirror learning of one
        // commit pays one hit and one miss, and returns to one behind a hole
        batch = hits >= 2 ? Math.min(RECORD_WALK_BATCH, batch * 2) : 1;
      }
    };
    await walkRecords(provenSnapshot?.deck.revision ?? null);
    /**
     * 1d. The comments sidecar (SPEC-3 2.2), through its index head (docs/SYNC.md 3.5): the
     * index is the sidecar's commit point (comments-store.ts), so an index at the version the
     * mirror holds means every thread file is current too and nothing else is read; a moved
     * index is pulled proven with the thread files it names whose etag rows changed
     * (`pullSidecar`). The rows the manifest keeps are the local bytes' md5, which a proven
     * pull makes the store's version.
     */
    const syncSidecar = async (): Promise<void> => {
      const indexRelative = `${COMMENTS_DIR}/${INDEX_FILE}`;
      const local = (): string[] =>
        localDocuments(dir).filter((relative) => relative.startsWith(`${COMMENTS_DIR}/`));
      const indexHead = await client.head(`${prefix}${indexRelative}`);
      if (indexHead === null) {
        for (const relative of local()) rmSync(pathOf(relative), { force: true });
        return;
      }
      if (manifest.files[indexRelative] !== indexHead.version || !existsSync(pathOf(indexRelative)))
        await pullSidecar(client, deckId, dir);
      for (const relative of local())
        next.files[relative] = quotedMd5(new Uint8Array(readFileSync(pathOf(relative))));
    };
    await syncSidecar();
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
    /**
     * A record whose revision is above the proven document's leaves the mirror: the claim of a
     * write in flight on another instance (stored before its commit, the write's round two), or
     * the leftover of a writer that stopped before its commit. The next pull fetches it again by
     * number once the manifest moved, so a committed write's record is never lost; a reader in
     * between never sees a log that ends above the deck (docs/FOCUS.md rank 21).
     */
    const dropRecordsAbove = (revision: number): void => {
      // a claim is numbered above every committed record, so the newest few by number are the
      // only candidates; the rest of the log is not read on every pull
      const newest = localDocuments(dir)
        .map((relative) => ({ relative, n: Number(/^versions\/(\d+)\.json$/.exec(relative)?.[1]) }))
        .filter((row) => Number.isInteger(row.n))
        .sort((a, b) => b.n - a.n)
        .slice(0, CLAIMS_CHECKED);
      for (const { relative } of newest) {
        const record = parseRecordBytes(new Uint8Array(readFileSync(pathOf(relative))));
        if (record === null || record.revision <= revision) continue;
        rmSync(pathOf(relative), { force: true });
        delete next.files[relative];
      }
    };
    if (provenSnapshot !== null) {
      // the document the snapshot of step 1b proved, and no slide body read
      writeDocuments(provenSnapshot);
      dropRecordsAbove(provenSnapshot.deck.revision);
      for (const relative of localDocuments(dir)) {
        if (next.files[relative] === undefined) rmSync(pathOf(relative), { force: true });
      }
      writeManifestFile(dir, next);
      return;
    }
    // 2. the base: the mirror's previous state, or the bodies the store serves for an empty
    // mirror. The bodies are the ones the manifest names, fetched by name and each proven
    // against its own head; the listing of the prefix lags and names neither a slide added a
    // moment ago nor the removal of one (docs/FOCUS.md rank 3)
    let base = before;
    const unproven = new Set<string>();
    let manifestBody: Uint8Array | null = null;
    if (base === null) {
      const deck = await fetchBody('deck.json');
      if (deck === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
      manifestBody = deck.bytes;
      writeAtomic(pathOf('deck.json'), deck.bytes);
      await eachLimit(manifestSlideIds(deck.bytes), 8, async (id) => {
        const relative = `slides/${id}.json`;
        const body = await fetchBody(relative);
        if (body === null) {
          unproven.add(id);
          return;
        }
        writeAtomic(pathOf(relative), body.bytes);
        const head = await client.head(`${prefix}${relative}`);
        if (head === null || head.version !== quotedMd5(body.bytes)) unproven.add(id);
      });
      base = loadDeckDir(dir).document;
    }
    // 3. the replay: every record above the base, through the writer's own reducer and clock,
    // until the derived manifest is the head's; a record that moves nothing (a named version, a
    // claim a writer neutralized) is skipped, since the reducer would move the revision for it
    const records = readVersions(dir);
    let document = base;
    const rewritten = new Set<string>();
    for (const record of [...records].sort((a, b) => a.n - b.n)) {
      if (quotedMd5(canonicalJson(document.deck)) === deckHead.version) break;
      if (record.mutations.length === 0) continue;
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
      // 4. the fresh path: the bodies the manifest names, each proven against its own head; a
      // body that is missing or that the CDN still serves in an older form leaves the document
      // unproven, never a document at the manifest's revision with another slide set
      const deck =
        manifestBody !== null && quotedMd5(manifestBody) === deckHead.version
          ? { bytes: manifestBody, version: deckHead.version }
          : await fetchBody('deck.json');
      if (deck !== null && quotedMd5(deck.bytes) === deckHead.version) {
        const bodies = new Map<string, Uint8Array>();
        let lagging = 0;
        await eachLimit(manifestSlideIds(deck.bytes), 8, async (id) => {
          const relative = `slides/${id}.json`;
          const body = await fetchBody(relative);
          const head = await client.head(`${prefix}${relative}`);
          if (body === null || head === null) {
            lagging += 1;
            return;
          }
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
      dropRecordsAbove(document.deck.revision);
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
        await pull(head);
        pulled = true;
      }
      lastState = { present: true, pulled, revision: readRevision(dir) };
    }
    syncedAt = Date.now();
    return lastState;
  };

  const sync = (force = false): Promise<SyncState> => serial(() => syncNow(force));

  /**
   * A read of a deck this instance has mirrored is answered from the mirror while the store
   * refuses (a 429, a 5xx, the deadline; pulse.ts `isStoreBusy`): the document may be a moment
   * behind, which the next sync corrects, and nothing thrown by the store reaches a page or the
   * room's live document (the focus round, cycle 3 fix round; VERIFICATION C3-F2, C3-F3: a 429 of
   * a head reached the editor's loader and the router replaced the editor with its default error
   * page). A deck with no mirror here still throws, since there is nothing to answer.
   */
  let degradedReads = 0;
  const answersFromMirror = options.degradedReads === true;
  const requirePresent = async (force = false): Promise<void> => {
    let state: SyncState;
    try {
      state = await sync(force);
    } catch (error) {
      if (!answersFromMirror || !isStoreBusy(error) || !existsSync(pathOf('deck.json')))
        throw error;
      degradedReads += 1;
      return;
    }
    if (!state.present) throw new RangeError(`No deck ${deckId} in the Blob store`);
  };

  /**
   * The leases file is an overwritten path and is read proven (docs/SYNC.md 3.5, invariant 8;
   * audit-costs items 4 and 13): the head's version first, the body accepted only when its md5
   * is that version, else the immutable copy `pushLeases` stores under it (`putWithCopy`). A
   * plain `get` read the public host, which serves an overwritten object for up to thirty days,
   * so a lease taken on another instance could stay invisible here and the enforce policy of
   * agent writes decided on stale rows.
   */
  const pullLeases = async (): Promise<void> => {
    const fetched = await provenGet(client, `${prefix}${LEASES_FILE}`);
    if (fetched === null) rmSync(file.leaseFile, { force: true });
    else writeAtomic(file.leaseFile, fetched.bytes);
  };

  /** The lease read of a page load: the mirror's copy while the store refuses (requirePresent says why). */
  const pullLeasesOrKeep = async (): Promise<void> => {
    try {
      await pullLeases();
    } catch (error) {
      if (!answersFromMirror || !isStoreBusy(error)) throw error;
      degradedReads += 1;
    }
  };

  /** The leases file with its immutable copy first (`putWithCopy`), so `pullLeases` proves it whatever the CDN serves. */
  const pushLeases = async (): Promise<void> => {
    if (!existsSync(file.leaseFile)) return;
    await putWithCopy(
      client,
      `${prefix}${LEASES_FILE}`,
      new Uint8Array(readFileSync(file.leaseFile)),
      {
        overwrite: true,
        contentType: blobContentType(LEASES_FILE),
      },
    );
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

  const putSnapshot = (key: string, body: Uint8Array): Promise<void> =>
    storeSnapshot(client, deckId, key, body);

  /**
   * The record of a write goes up before its commit, as a claim on its number (the focus round,
   * docs/FOCUS.md ranks 20 and 21): `overwrite` false, so two writers that computed one number
   * from one base store one record and the other stops before its commit (RecordTakenError, a
   * conflict outcome), and no record is ever overwritten. Before this the record went up after
   * the commit, so every other instance's pull (which fetches records by number when the
   * manifest's etag moves) missed it until the next commit: the edit never reached a second
   * browser over the head poll (rank 20), and a writer whose mirror lacked the record reused its
   * number and overwrote it, which broke the version log (rank 21, "The version log breaks
   * between versions 3 and 4"). A number held by a record whose revision is above the base is a
   * claim in flight, or the leftover of a writer that stopped before its commit; the leftover is
   * taken over once it is older than CLAIM_GRACE_MS.
   */
  const claimRecord = async (relative: string, entry: VersionRecord): Promise<BlobEntry> => {
    const bytes = new Uint8Array(readFileSync(pathOf(relative)));
    const pathname = `${prefix}${relative}`;
    const contentType = blobContentType(relative);
    try {
      return await client.put(pathname, bytes, { overwrite: false, contentType });
    } catch (error) {
      if (!isBlobExistsError(error)) throw error;
      const existing = await client.get(pathname);
      const held = existing === null ? null : parseRecordBytes(existing.bytes);
      const stale =
        held !== null &&
        held.revision > entry.baseRevision &&
        Date.parse(clock()) - Date.parse(held.createdAt) > CLAIM_GRACE_MS;
      // the same write's own earlier claim (the same author, base and mutations): an attempt of
      // this instance that met a deadline after its claim, or the client's resend of a POST
      // whose first attempt stopped before its commit. Its claim is taken over at once instead
      // of holding this write for the grace, which answered the client a conflict at the
      // revision it wrote against and looped it through resyncs (the focus round, cycle 3 fix
      // round; VERIFICATION C3-F1 `decks.access.paint`, the write right after a restore)
      const own =
        held !== null &&
        held.baseRevision === entry.baseRevision &&
        held.revision === entry.revision &&
        canonicalJson(held.author) === canonicalJson(entry.author) &&
        canonicalJson(held.mutations) === canonicalJson(entry.mutations);
      if (existing === null || stale || own) {
        return client.put(pathname, bytes, { overwrite: true, contentType });
      }
      throw new RecordTakenError(deckId, relative);
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
    syncedAt = 0;
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

    async read(): Promise<ReadResult> {
      await requirePresent();
      return file.read();
    },

    async revision(): Promise<number> {
      await requirePresent();
      return file.revision();
    },

    write(write: StoreWrite, writeOptions: WriteOptions = {}): Promise<WriteOutcome> {
      const writeOrigin = options.writeOrigin ?? RECORD_ORIGIN_WRITES;
      const runWrite = async (retries: number): Promise<WriteOutcome> => {
        // inside the queue already: sync directly, not through serial(). Round one of the four
        // (gslides-parity SPEC-4 0.33): the manifest head and the leases read leave together;
        // the leases file is its own document, so neither waits on the other. Both are awaited
        // to their end, so a write that fails on one leaves no call of the other in flight
        const [headRead, leasesRead] = await Promise.all([
          settle(client.head(`${prefix}deck.json`)),
          settle(pullLeases()),
        ]);
        if (!headRead.ok) throw headRead.error;
        if (!leasesRead.ok) throw leasesRead.error;
        const head = headRead.value;
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        if (options.hooks?.afterHead) await options.hooks.afterHead();
        const before = readManifest(dir);
        if (before.files['deck.json'] !== head.version || !existsSync(pathOf('deck.json'))) {
          await pull(head);
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
        // the origin check (docs/SYNC.md 3.2, invariant 3), here where the mirror is proven: a
        // write whose op ids a record above its base already names is the resend of a POST whose
        // first attempt committed and whose answer was lost (on this instance or another, since
        // the record travels), so it is answered with that record and nothing is claimed or put.
        // The admission's own check before placement catches the same instance and already
        // synced cases first; this one runs after the head and the pull brought the record here.
        // The held origins stand in for the field on the records this instance committed while
        // the deployment writes none (heldOrigins)
        if (write.origin !== undefined) {
          const replayed = recordNamingOps(
            withHeldOrigins(readVersions(dir)),
            write.baseRevision,
            write.origin.opIds,
          );
          if (replayed !== undefined) {
            return {
              ok: true,
              document: loadDeckDir(dir).document,
              revision: replayed.revision,
              entry: replayed,
              changed: [],
              issues: [],
              warnings: [],
              replayed,
            };
          }
        }
        const outcome = await file.write(write, writeOptions);
        if (!outcome.ok) return outcome;
        // the snapshot key (SPEC-2 8.2, 0.40): the md5 of the deck.json bytes about to be pushed,
        // which is the etag the store will answer for them; the record of this commit names it.
        // The write's origin joins the record once the deployment writes it (RECORD_ORIGIN_WRITES)
        const key = snapshotKey(new Uint8Array(readFileSync(pathOf('deck.json'))));
        const entry: VersionRecord = {
          ...outcome.entry,
          snapshot: key,
          ...(writeOrigin && write.origin !== undefined ? { origin: write.origin } : {}),
        };
        writeVersion(dir, entry);
        const record = `versions/${entry.n}.json`;
        let claimed = false;
        /** A claim this write stored and cannot commit leaves the store (best effort). */
        const releaseClaim = async (): Promise<void> => {
          if (!claimed) return;
          claimed = false;
          await client.del([`${prefix}${record}`]).catch(() => undefined);
        };
        try {
          if (options.hooks?.beforeCommit) await options.hooks.beforeCommit();
          // Round two (SPEC-4 0.33, amended in the focus round): the whole document under its
          // immutable name, the changed slide bodies and the version record as a claim on its
          // number leave together, before the manifest flips. A loser of the race below leaves a
          // snapshot no record and no etag names, which the prune removes, slide bodies the live
          // manifest still names by an older etag (a reader proves the document by the winner's
          // snapshot, pull step 1b, and never reads those bodies, and the next write of the
          // slide overwrites them) and a claim it releases. Deletions wait until after the commit
          // (below), because a body removed before a commit that fails on ifMatch is one the live
          // manifest still names, and a reader's next pull would get null for it.
          const changedBodies = outcome.changed.filter((slideId) =>
            existsSync(pathOf(`slides/${slideId}.json`)),
          );
          const removedBodies = outcome.changed.filter(
            (slideId) => !existsSync(pathOf(`slides/${slideId}.json`)),
          );
          // the three leave together and every one is awaited, so a claim that landed while
          // another put failed is known and released below
          const snapshotPut = settle(putSnapshot(key, snapshotBody(outcome.document)));
          const claimPut = settle(claimRecord(record, entry));
          const bodyPuts = Promise.all(
            changedBodies.map((slideId) => settle(putDocument(`slides/${slideId}.json`))),
          );
          const snapshotResult = await snapshotPut;
          const claimResult = await claimPut;
          const bodyResults = await bodyPuts;
          claimed = claimResult.ok;
          if (!snapshotResult.ok) throw snapshotResult.error;
          if (!claimResult.ok) throw claimResult.error;
          const failedBody = bodyResults.find((result) => !result.ok);
          if (failedBody !== undefined) throw failedBody.error;
          const stored = claimResult.value;
          const pushedSlides = bodyResults.map((result) => (result.ok ? result.value : undefined));
          // Round three: the commit point, alone. The manifest goes up conditional on the version
          // this instance read; a precondition failure is the conflict outcome below.
          let committed: BlobEntry;
          try {
            committed = await putDocument('deck.json', synced);
          } catch (error) {
            // the commit put met its deadline while the store may hold the commit (the answer
            // was slow, not the write): the head says. A head at our bytes is our commit and the
            // write finishes as one; before this the claim was released (the record deleted
            // under a manifest that names its revision) and the mirror discarded, so the client's
            // resend was admitted a second time and the version log lost a number (the focus
            // round, cycle 3 fix round; VERIFICATION C3-F1, docs/FOCUS.md rank 21)
            if (!isBlobTimeoutError(error)) throw error;
            const ours = quotedMd5(new Uint8Array(readFileSync(pathOf('deck.json'))));
            const landed = await client.head(`${prefix}deck.json`).catch(() => null);
            if (landed === null || landed.version !== ours) {
              // the hole's first rule (docs/SYNC.md 3.6): the put may still land after this
              // answer, so the record stays in the store as the claim it is. Released, a commit
              // that landed late named a revision with no record, which every reader's walk
              // stopped at for good; kept, a put that never lands is a claim another writer
              // takes over after CLAIM_GRACE_MS (claimRecord), and a put that lands makes it the
              // record of its revision. The mirror is discarded below as before
              claimed = false;
              throw error;
            }
            committed = landed;
          }
          claimed = false;
          // the commit is proven: the record of this number is this write's for good, so its
          // origin is held here when the deployment stored none in the record (heldOrigins)
          if (entry.origin === undefined && write.origin !== undefined)
            holdOrigin(entry.n, write.origin);
          manifest.files['deck.json'] = committed.version;
          manifest.files[record] = stored.version;
          changedBodies.forEach((slideId, i) => {
            const pushed = pushedSlides[i];
            if (pushed !== undefined) manifest.files[`slides/${slideId}.json`] = pushed.version;
          });
          writeManifestFile(dir, manifest);
          // Round four: the removed bodies leave after the commit
          if (removedBodies.length > 0) {
            await client.del(removedBodies.map((slideId) => `${prefix}slides/${slideId}.json`));
            for (const slideId of removedBodies) delete manifest.files[`slides/${slideId}.json`];
            writeManifestFile(dir, manifest);
          }
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
          syncedAt = Date.now();
          lastState = { present: true, pulled: false, revision: outcome.revision };
          // the deck's pulse (pulse.ts): the one head every other instance's poll makes moves
          // with this commit; awaited, because a function instance is frozen once its answer
          // has gone and a put left in flight would never land
          await putPulse(client, deckId, 'deck', { now: clock });
          // retention runs behind the answer on every SNAPSHOT_PRUNE_EVERY records the log gains
          // and at the deck's last stream's close (the channel calls `pruneSnapshots`), never on
          // every commit (docs/SYNC.md 3.6; the one `list` of the write path leaves the hot path)
          if (pruneDue(entry.n)) void pruneSnapshots(key).catch(() => undefined);
          return { ...outcome, entry };
        } catch (error) {
          await releaseClaim();
          if (isBlobPreconditionError(error)) return conflictFromStore();
          if (error instanceof RecordTakenError) {
            // the number is another writer's: a commit this mirror has not fetched yet, or a
            // claim in flight from the same base. The write runs once more from the store's
            // current document after a short wait (the other commit lands within it); a second
            // refusal is answered the way a lost manifest race is
            if (retries > 0) {
              discard();
              await sleep(CLAIM_RETRY_MS);
              return runWrite(retries - 1);
            }
            return conflictFromStore();
          }
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
      };
      return serial(() => runWrite(1));
    },

    saveVersion(author: Author, note: string): Promise<Version> {
      /**
       * A named version's number is taken the way a write's is: `overwrite` false. A number
       * another instance holds (its named version, or the claim of its write in flight) is the
       * ConflictError the panel shows (audit-present row 43, "Another instance saved version 16
       * first"); since the write's record leaves before its commit, the pull that opens this
       * call holds every committed record, so the refusal names a true race and nothing else.
       */
      const save = async (): Promise<Version> => {
        const head = await client.head(`${prefix}deck.json`);
        if (head === null) throw new RangeError(`No deck ${deckId} in the Blob store`);
        if (readManifest(dir).files['deck.json'] !== head.version) await pull(head);
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
      };
      return serial(save);
    },

    async listVersions(): Promise<Version[]> {
      await requirePresent();
      return file.listVersions();
    },

    async records(): Promise<VersionRecord[]> {
      await requirePresent();
      // the held origins ride the records this instance committed without the field, so the
      // channel's entries carry `covers` and the resync read's `origins` on this instance
      // (docs/SYNC.md 3.2) on deployment N as they will everywhere on N plus 1
      return withHeldOrigins(await file.records());
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
        if (readManifest(dir).files['deck.json'] !== head.version) await pull(head);
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
      await serial(pullLeasesOrKeep);
      return file.leases();
    },

    degradedReads: () => degradedReads,

    watch(listener: StoreListener): () => void {
      // the store has no push channel: the manifest's version is polled, and a change of the
      // mirror's revision (a pull, or a write on this instance) is one event. One poll at a
      // time: a tick that finds the last poll's sync still in flight is skipped, so a store that
      // answers slowly meets one head from the watch in the deck's queue and not one per tick
      // (the focus round, cycle 3: with the deadline at 20 s and a tick every 3 s, a slow store
      // queued seven polls behind one another, each waiting its own deadline, and every write of
      // the deck waited behind them)
      let last = readRevision(dir);
      let polling = false;
      const timer = setInterval(() => {
        if (polling) return;
        polling = true;
        void sync()
          .catch(() => undefined)
          .then(() => {
            polling = false;
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
  const deckBytes = new Uint8Array(readFileSync(join(dir, 'deck.json')));
  // the snapshot of the new manifest before the manifest itself (the focus round): a reader on
  // another instance proves the fresh deck from it while the CDN still answers nothing or an
  // older body for its bodies (docs/FOCUS.md rank 7, the listing after Make a copy)
  try {
    await storeSnapshot(
      client,
      deckId,
      snapshotKey(deckBytes),
      snapshotBody(loadDeckDir(dir).document),
    );
  } catch (error) {
    // a deck that does not validate has no snapshot and is proven from its bodies as before
    if (!(error instanceof SnapshotContestedError) && !(error instanceof TypeError)) throw error;
  }
  const deck = await client.put(`${prefix}deck.json`, deckBytes, {
    overwrite: options.overwrite,
    contentType: blobContentType('deck.json'),
  });
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
/**
 * The two facts a home page card needs beyond its head (gslides-parity SPEC 6.2; the studio's
 * `deckCardFacts`): the appearance the card's plate and thumbnail are drawn in, by the rule of
 * `deckAppearance` (SPEC 7.2.3: `defaults.appearance`, else the kit's `brand.appearance`, else
 * dark), and the first slide's id. Read from the manifest bytes the listing proved at the store's
 * head, so an instance that never opened the deck draws the same card as one that did: before
 * the sync and costs round's ship the studio read them from the mirror on disk alone, and an
 * instance without the mirror drew every card as a dark plate with no thumbnail (VERIFICATION.md
 * "Sync and costs round, pass 2" F3; production read 53 of 55 cards that way on 2026-09-22).
 */
export type DeckCardFacts = { appearance: Appearance; firstSlide: string | null };

export function deckCardFactsOf(bytes: Uint8Array): DeckCardFacts | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const manifest = raw as {
    defaults?: { appearance?: unknown };
    brand?: { appearance?: unknown };
    sections?: unknown;
  };
  const named = (value: unknown): Appearance | null =>
    value === 'light' || value === 'dark' ? value : null;
  const appearance =
    named(manifest.defaults?.appearance) ?? named(manifest.brand?.appearance) ?? 'dark';
  let firstSlide: string | null = null;
  for (const section of Array.isArray(manifest.sections) ? manifest.sections : []) {
    const ids =
      typeof section === 'object' &&
      section !== null &&
      Array.isArray((section as { slideIds?: unknown }).slideIds)
        ? (section as { slideIds: unknown[] }).slideIds
        : [];
    const first = ids.find((id) => typeof id === 'string');
    if (typeof first === 'string') {
      firstSlide = first;
      break;
    }
  }
  return { appearance, firstSlide };
}

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
          ? (section as { slideIds: unknown[] }).slideIds.length
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

/**
 * The hosted poll interval per open deck per instance (SPEC-3 2.5, amended by the focus round's
 * cycle 3 fix round): the one timed store call the blob channel makes per tick while a client
 * stream of the deck is open on the instance, a head of the deck's pulse (pulse.ts). Defined
 * there, node free, so the realtime package reads the same number; re-exported here for the
 * callers of the store.
 */
export { HOSTED_POLL_MS };

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
    // the collection's own calls (the listing, the stamps, the uploads) meet the same deadlines
    // as a deck store's (boundedBlobClient)
    clientPromise ??= (
      typeof blobOption === 'function' ? blobOption() : Promise.resolve(blobOption)
    ).then((raw) => boundedBlobClient(raw));
    return clientPromise;
  };
  const stores = new Map<string, BlobStore>();
  const urls = new Map<string, string | null>();
  // the saved templates across instances (blob-templates.ts; the product round fix round)
  const templates = blobTemplates({
    client,
    decksDir,
    log,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  /**
   * One listing in flight per shape (by whether the trash is included): the listing is one
   * head per deck the store holds, so a burst of home page loads on one instance (the drivers'
   * navigations, a person's reload) multiplied into the store's concurrency limit (the focus
   * round, cycle 3 fix round; VERIFICATION C3-F2, C3-F5: the /decks page did not hydrate after
   * a move to the trash). A load that arrives while a listing runs joins it; the next load after
   * it reads the store again, so a change made on any instance still lists on the next load
   * (SPEC 6.2, rank 7). A write of this collection ends the join early, so its own change lists
   * at once.
   */
  const listingInFlight = new Map<string, Promise<DeckHead[]>>();
  let readyPromise: Promise<void> | undefined;

  const storeFor = async (deckId: string): Promise<BlobStore> => {
    let store = stores.get(deckId);
    if (store === undefined) {
      store = openBlobStore({
        client: await client(),
        deckId,
        dir: join(decksDir, deckId),
        // the store's own watch is a fallback (a caller without the pulse); the blob channel
        // polls the deck's pulse at this cadence instead (packages/realtime/src/blob.ts,
        // pulse.ts): one head per tick per open deck per instance, and one at a time
        pollMs: HOSTED_POLL_MS,
        // the studio's pages read the mirror while the store refuses (requirePresent says why)
        degradedReads: true,
        ...(options.now === undefined ? {} : { now: options.now }),
      });
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
      try {
        await pushDeckDir(c, deckId, join(decksDir, deckId), { overwrite: false, log });
      } catch (error) {
        // another instance seeded the deck between the head and the push, or the store still
        // holds the deck's files from an earlier life: the deck is there, which is what was wanted
        if (!isBlobExistsError(error)) throw error;
        log(`blob: seed of ${deckId} found its files in the store already`);
      }
    }
  };

  const ready = (): Promise<void> => {
    readyPromise ??= (async () => {
      await overlay.ready();
      await seedOnce();
    })().catch((error: unknown) => {
      // a failed seed is retried by the next request instead of answering every route with it
      readyPromise = undefined;
      throw error;
    });
    return readyPromise;
  };

  /**
   * The deck ids the store holds: the folder listing of `decks/`, which lags the store by up to
   * a minute (the note on `pull`), joined with the mirrors this instance holds, so a deck made or
   * opened on this instance lists at once (the focus round, cycle 2; VERIFICATION F-share-404:
   * the share link exchange runs over `list()` and did not find a deck made a minute ago, so the
   * link answered 404 to its visitor). A mirror whose manifest the store no longer holds (a deck
   * deleted forever elsewhere) answers null at `cardOf` and is left out.
   */
  const deckIds = async (): Promise<string[]> => {
    const c = await client();
    const folders = await c.folders('decks/');
    const listed = folders
      .map((folder) => folder.slice('decks/'.length).replace(/\/$/, ''))
      .filter((id) => id !== '' && !id.includes('/'));
    // the decks made anywhere in the last two minutes, whose folders the listing may lag (the
    // fresh deck index above); each is headed like every listed deck, so a removed one drops out
    const fresh = (
      await freshDeckIds(c, Date.parse((options.now ?? (() => new Date().toISOString()))()))
    ).filter((id) => isSafeKey(id));
    const mirrored = existsSync(decksDir)
      ? readdirSync(decksDir, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              !entry.name.startsWith('.') &&
              isSafeKey(entry.name) &&
              existsSync(join(decksDir, entry.name, 'deck.json')),
          )
          .map((entry) => entry.name)
      : [];
    return [...new Set([...listed, ...fresh, ...mirrored])].sort();
  };

  /**
   * A deck's manifest bytes at the head the caller read, for the listing (docs/FOCUS.md rank 7):
   * the mirror's copy when this instance's manifest row names the head's etag, else the origin
   * body when its md5 is that etag, else the snapshot the etag names (every push of `deck.json`
   * stores one since the focus round), each of those `proven`; else the body the CDN served,
   * which is the state before the last push and is not. Null when the store holds no body.
   */
  const manifestAtHead = async (
    c: BlobClient,
    deckId: string,
    head: BlobEntry,
  ): Promise<{ bytes: Uint8Array; proven: boolean } | null> => {
    const pathname = `${deckPrefix(deckId)}deck.json`;
    const dir = join(decksDir, deckId);
    const mirrored = join(dir, 'deck.json');
    if (readManifest(dir).files['deck.json'] === head.version && existsSync(mirrored)) {
      return { bytes: new Uint8Array(readFileSync(mirrored)), proven: true };
    }
    const fetched = await c.get(pathname);
    if (fetched !== null && quotedMd5(fetched.bytes) === head.version)
      return { bytes: fetched.bytes, proven: true };
    const key = etagMd5(head.version);
    const snapshot = key === null ? null : await c.get(`${deckPrefix(deckId)}${snapshotPath(key)}`);
    if (snapshot !== null) {
      try {
        const document = parseSnapshot(
          snapshot.bytes,
          `${deckPrefix(deckId)}${snapshotPath(key ?? '')}`,
        );
        return { bytes: new TextEncoder().encode(canonicalJson(document.deck)), proven: true };
      } catch {
        // a snapshot that does not parse: the body below
      }
    }
    return fetched === null ? null : { bytes: fetched.bytes, proven: false };
  };

  /**
   * The listing's memory of each deck's card by the manifest etag it was proven from (the
   * return round fix round, VERIFICATION R1-F3, R1-F4): a listing costs one head per deck, and
   * a body only for a deck whose etag moved since this instance last proved it. Before this
   * every listing fetched every manifest body again, two or three calls per deck the instance
   * had never opened (the origin body, then the snapshot when the CDN served it stale), which on
   * a store of 65 decks took 5 s at best and past the Open dialog's 30 s under load. A card
   * proven from an unproven body (the CDN's state before the last push) is not kept, so the next
   * listing tries the proof again, as before. `null` is a manifest that made no card.
   */
  const listed = new Map<
    string,
    { version: string; head: DeckHead | null; facts: DeckCardFacts | null }
  >();
  /** The folders under `decks/` without a manifest when this instance last headed them, by id and time (LISTING_PHANTOM_TTL_MS). */
  const phantoms = new Map<string, number>();
  let listingClientPromise: Promise<BlobClient> | undefined;
  /** The client the listing calls the store through: the collection's, under the listing's shorter deadline. */
  const listingClient = (): Promise<BlobClient> => {
    listingClientPromise ??= (
      typeof blobOption === 'function' ? blobOption() : Promise.resolve(blobOption)
    ).then((raw) => boundedBlobClient(raw, { readMs: BLOB_LISTING_READ_TIMEOUT_MS }));
    return listingClientPromise;
  };

  /**
   * One deck's card for the listing: the head, the cache by etag, the proven body when the etag
   * moved. A store answer of "not now" (a 429, a 5xx, the listing deadline; pulse.ts
   * `isStoreBusy`) for one deck answers the card this instance proved last, or leaves the deck
   * out of this listing when it never proved one, and logs one line; before this it failed the
   * whole listing and the Open dialog listed nothing (R1-F3, run 1: "0 decks listed after
   * 30028 ms"). Any other error is the caller's.
   */
  const cardOf = async (c: BlobClient, deckId: string): Promise<DeckHead | null> => {
    const pathname = `${deckPrefix(deckId)}deck.json`;
    const kept = listed.get(deckId);
    try {
      const head = await c.head(pathname);
      if (head === null) {
        listed.delete(deckId);
        phantoms.set(deckId, Date.now());
        return null;
      }
      phantoms.delete(deckId);
      if (kept !== undefined && kept.version === head.version) return kept.head;
      const manifest = await manifestAtHead(c, deckId, head);
      const card = manifest === null ? null : deckHeadOf(deckId, manifest.bytes);
      // the card's two thumbnail facts travel with the head (`cardFacts`), read from the same bytes
      const facts = manifest === null ? null : deckCardFactsOf(manifest.bytes);
      if (manifest === null || manifest.proven)
        listed.set(deckId, { version: head.version, head: card, facts });
      return card;
    } catch (error) {
      if (!isStoreBusy(error)) throw error;
      log(
        `blob: the listing's read of ${deckId} met ${error instanceof Error ? error.message : String(error)}; ${kept === undefined ? 'the deck is left out of this listing' : 'the card proven last is listed'}`,
      );
      return kept?.head ?? null;
    }
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
      // the stamped document under its key first (the focus round, docs/FOCUS.md rank 7): the
      // listing on any instance proves the stamp from the snapshot while the CDN still serves
      // the manifest without it, and a pull proves the document without a body read. A key the
      // store holds already is this document (a restore returns the manifest to the last
      // write's bytes, and that write stored the snapshot), so no head proves it: the stamp is
      // the manifest head, this put and the manifest put, three round trips (the fix round, F12)
      await storeSnapshot(
        c,
        deckId,
        snapshotKey(bytes),
        snapshotBody(loadDeckDir(store.dir).document),
        { acceptExisting: true },
      );
      const entry = await c.put(`${deckPrefix(deckId)}deck.json`, bytes, {
        overwrite: true,
        contentType: blobContentType('deck.json'),
        ...(before === undefined ? {} : { ifMatch: before }),
      });
      const manifest = readManifest(store.dir);
      manifest.files['deck.json'] = entry.version;
      writeManifestFile(store.dir, manifest);
      listingInFlight.clear();
      await putPulse(c, deckId, 'deck', options.now === undefined ? {} : { now: options.now });
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
    cardFacts(deckId) {
      // the facts of the manifest the last listing proved for the deck on this instance; null
      // before a listing named it (the studio then reads the mirror on disk, root.ts)
      return listed.get(deckId)?.facts ?? null;
    },
    async list(listOptions) {
      await ready();
      // the listing reads every manifest at the store's head, in parallel, and writes no mirror
      // (gslides-parity SPEC-4 0.29, 3.1; PP 3.1): a trash stamp or a title written on another
      // instance shows on the next home page load (SPEC 6.2), and a deck store opens only when a
      // deck is opened. The mirrors on this instance are left as they are; open() syncs. Since
      // the focus round (docs/FOCUS.md rank 7) the body is proven against the manifest's head:
      // the mirror's copy when this instance holds the head's etag (no body read), else the
      // origin body when its md5 is the etag, else the snapshot the etag names; the CDN kept
      // serving an overwritten manifest for a while, so a rename, a Make a copy and a Restore
      // listed the state before them and a card sent that revision back as a stale base. Since
      // the return round the card is kept by the etag it was proven from (`listed`), so a warm
      // instance pays one head per deck and no body, each call under the listing's own deadline,
      // and one deck's refusal never empties the list (`cardOf`).
      const shape = listOptions?.includeTrashed === true ? 'all' : 'live';
      const joined = listingInFlight.get(shape);
      if (joined !== undefined) return [...(await joined)];
      const run = (async (): Promise<DeckHead[]> => {
        const t = Date.now();
        // a folder that held no manifest when this instance last looked is not headed again
        // within LISTING_PHANTOM_TTL_MS (the leftovers of removed decks; `phantoms` says why)
        const ids = (await deckIds()).filter(
          (id) => (phantoms.get(id) ?? 0) + LISTING_PHANTOM_TTL_MS <= t,
        );
        const c = await listingClient();
        const heads: DeckHead[] = [];
        // four at a time: the store's 429 names the number of concurrent requests (C3-F2)
        await eachLimit(ids, 4, async (deckId) => {
          const head = await cardOf(c, deckId);
          if (head === null) return;
          if (head.trashedAt !== undefined && listOptions?.includeTrashed !== true) return;
          heads.push(head);
        });
        return heads.sort(byNewest);
      })();
      listingInFlight.set(shape, run);
      try {
        return [...(await run)];
      } finally {
        if (listingInFlight.get(shape) === run) listingInFlight.delete(shape);
      }
    },
    async has(deckId) {
      await ready();
      try {
        return (await (await client()).head(`${deckPrefix(deckId)}deck.json`)) !== null;
      } catch (error) {
        // the store refused (a 429, a 5xx, the deadline): a deck this instance has mirrored is
        // there until the store says otherwise, so its routes keep answering (the focus round,
        // cycle 3 fix round; VERIFICATION C3-F2, C3-F5: a 429 of this head answered 500 and 404)
        if (isStoreBusy(error) && existsSync(join(decksDir, deckId, 'deck.json'))) return true;
        throw error;
      }
    },
    async open(deckId) {
      await ready();
      const store = await storeFor(deckId);
      let state: SyncState;
      try {
        state = await store.sync(true);
      } catch (error) {
        // the mirror answers while the store refuses (openBlobStore requirePresent says why)
        if (isStoreBusy(error) && existsSync(join(store.dir, 'deck.json'))) return store;
        throw error;
      }
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
        // a template saved on another instance is in the store: its folder is pulled first (one
        // head when nothing moved), so a deck made from it here starts from the saved slides
        await templates.pull();
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
      // a folder of this id the listing remembered as empty is a deck now
      phantoms.delete(deckId);
      listed.delete(deckId);
      listingInFlight.clear();
      await putPulse(c, deckId, 'deck', options.now === undefined ? {} : { now: options.now });
      // the listing on another instance shows the deck before the folder listing does
      await noteFreshDeck(c, deckId, (options.now ?? (() => new Date().toISOString()))(), log);
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
      // a folder of this id the listing remembered as empty is a deck now
      phantoms.delete(deckId);
      listed.delete(deckId);
      listingInFlight.clear();
      await putPulse(c, deckId, 'deck', options.now === undefined ? {} : { now: options.now });
      // the listing on another instance shows the deck before the folder listing does
      await noteFreshDeck(c, deckId, (options.now ?? (() => new Date().toISOString()))(), log);
      return result;
    },
    async trash(deckId, baseRevision) {
      return stamp(deckId, () =>
        trashDeck(decksDir, deckId, {
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(baseRevision !== undefined ? { baseRevision } : {}),
        }),
      );
    },
    async restore(deckId, baseRevision) {
      return stamp(deckId, () =>
        restoreDeck(decksDir, deckId, baseRevision !== undefined ? { baseRevision } : {}),
      );
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
      // the current presence record's copy is named by the record's version (presence-store.ts
      // `presenceCopyPath`: the md5 hex the etag quotes), read before the record goes
      const record = await c.head(`${prefix}${STATE_DIR}/presence.json`).catch(() => null);
      // the manifest goes first, so a reader that lists the prefix never sees a deck without one
      await c.del([`${prefix}deck.json`]);
      const rest = new Set((await c.list(prefix)).map((entry) => entry.pathname));
      if (record !== null) {
        const hex = record.version.replace(/^W\//, '').replace(/"/g, '');
        rest.add(`${prefix}${STATE_DIR}/presence/${hex}.json`);
      }
      // the deck's state files by name as well (the return round fix round, R1-F3): the listing
      // lags the store by up to a minute (the note on `pull`), and the presence record, its
      // copies and the pulse (presence-store.ts, pulse.ts) are refreshed every few seconds while
      // a tab is open, so the listing above missed them and a folder without a manifest stayed
      // under `decks/` for good, one head per listing on every instance (489 of them on
      // 2026-09-19); the copies folder is listed on its own since its names are hashes
      rest.add(`${prefix}${STATE_DIR}/presence.json`);
      rest.add(pulsePath(deckId));
      for (const entry of await c.list(`${prefix}${STATE_DIR}/presence/`)) rest.add(entry.pathname);
      await c.del([...rest]);
      stores.delete(deckId);
      listed.delete(deckId);
      listingInFlight.clear();
      for (const pathname of [...urls.keys()])
        if (pathname.startsWith(prefix)) urls.delete(pathname);
      rmSync(join(decksDir, deckId), { recursive: true, force: true });
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
    async assetUrl(deckId, relative) {
      await ready();
      if (!isSafeKey(relative) || !isAssetKey(`${deckId}/assets/${relative}`)) return null;
      const pathname = `${deckPrefix(deckId)}assets/${relative}`;
      const cached = urls.get(pathname);
      if (cached !== undefined) return cached;
      const entry = await (await client()).head(pathname);
      const url = entry === null ? null : entry.url;
      // a miss is not cached: a twin another instance puts after this instance asked for it
      // (SPEC-3 0.39) must be found on the next request, and asset names never change bytes
      if (url !== null) urls.set(pathname, url);
      return url;
    },
    templates,
    facts() {
      return factsFor(options.selection, decksDir, options.seed);
    },
  };
}

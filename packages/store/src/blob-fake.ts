// An in-memory BlobClient with the semantics the store relies on (blob-store.ts): versions are a
// hash of the bytes, `overwrite: false` refuses an existing pathname, `ifMatch` refuses a stale
// version, list and folders read the prefix, del ignores what is missing. The contract test runs
// the BlobStore against it, two store instances against one fake stand in for two function
// instances, and `calls` records every operation so a test can count round trips.
import { createHash } from 'node:crypto';

import type { BlobCallOptions, BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
import { BlobExistsError, BlobPreconditionError } from './blob-store.ts';

/** One recorded call; `aborted` when the caller's signal ended it while the fake held it. */
export type FakeBlobCall = { op: keyof BlobClient; pathname: string; aborted?: true };

export type FakeBlobClient = BlobClient & {
  /** the stored bytes by pathname */
  readonly blobs: Map<string, { bytes: Uint8Array; version: string }>;
  readonly calls: FakeBlobCall[];
  /** the URL prefix the fake reports, so tests can check redirects */
  readonly base: string;
  /** injects a failure for the next put of a pathname (a network fault) */
  failNextPut: (pathname: string, error: Error) => void;
  /** freezes what list() answers at this moment until releaseList(): Vercel Blob's listing lags */
  holdList: () => void;
  releaseList: () => void;
  /** get() keeps answering the bodies stored now for overwritten pathnames until releaseGet(): the CDN lags an overwrite */
  holdGet: () => void;
  releaseGet: () => void;
  /**
   * head() stops answering until releaseHead(): a store call that hangs (the focus round, cycle
   * 3). A held call ends with the caller's signal when it fires (recorded as `aborted`), the way
   * the SDK's request ends with its `abortSignal`; releaseHead() answers the calls still held.
   */
  holdHead: () => void;
  releaseHead: () => void;
  /** how many calls the fake holds right now */
  readonly held: () => number;
};

/** The rejection of a cancelled call, the shape the SDK's `abortSignal` produces. */
function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  return new DOMException('The operation was aborted', 'AbortError');
}

/** The etag Vercel Blob answers is the md5 of the body in quotes (measured 2026-09-11); the fake matches it so the mirror's proofs hold in tests. */
export function versionOf(bytes: Uint8Array): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

export type FakeBlobOptions = {
  /** the upload clock every put records as `uploadedAt`; the wall clock by default */
  now?: () => string;
};

export function memoryBlobClient(
  base = 'https://fake.blob.local',
  options: FakeBlobOptions = {},
): FakeBlobClient {
  const blobs = new Map<string, { bytes: Uint8Array; version: string; uploadedAt: string }>();
  const calls: FakeBlobCall[] = [];
  const failures = new Map<string, Error>();
  const now = options.now ?? (() => new Date().toISOString());
  let heldList: BlobEntry[] | null = null;
  let heldBodies: Map<string, { bytes: Uint8Array; version: string }> | null = null;
  let headHeld = false;
  const heldHeads: (() => void)[] = [];
  /** Waits while head() is held; the caller's signal ends the wait with its abort error. */
  const whileHeld = (call: FakeBlobCall, signal: AbortSignal | undefined): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (!headHeld) {
        resolve();
        return;
      }
      if (signal?.aborted) {
        call.aborted = true;
        reject(abortError(signal));
        return;
      }
      const release = (): void => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = (): void => {
        const i = heldHeads.indexOf(release);
        if (i >= 0) heldHeads.splice(i, 1);
        call.aborted = true;
        reject(abortError(signal as AbortSignal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      heldHeads.push(release);
    });
  const listing = (): BlobEntry[] =>
    [...blobs.keys()]
      .sort()
      .map((pathname) => entryOf(pathname))
      .filter((entry): entry is BlobEntry => entry !== null);
  const entryOf = (pathname: string): BlobEntry | null => {
    const stored = blobs.get(pathname);
    return stored === undefined
      ? null
      : {
          pathname,
          url: `${base}/${pathname}`,
          size: stored.bytes.byteLength,
          version: stored.version,
          uploadedAt: stored.uploadedAt,
        };
  };
  return {
    blobs,
    calls,
    base,
    failNextPut(pathname, error) {
      failures.set(pathname, error);
    },
    holdList() {
      heldList = listing();
    },
    holdGet() {
      heldBodies = new Map(
        [...blobs].map(([k, v]) => [k, { bytes: new Uint8Array(v.bytes), version: v.version }]),
      );
    },
    releaseGet() {
      heldBodies = null;
    },
    releaseList() {
      heldList = null;
    },
    holdHead() {
      headHeld = true;
    },
    releaseHead() {
      headHeld = false;
      for (const release of heldHeads.splice(0)) release();
    },
    held: () => heldHeads.length,
    async head(pathname, options?: BlobCallOptions) {
      const call: FakeBlobCall = { op: 'head', pathname };
      calls.push(call);
      await whileHeld(call, options?.signal);
      return entryOf(pathname);
    },
    async get(pathname) {
      calls.push({ op: 'get', pathname });
      const held = heldBodies?.get(pathname);
      const stored = held ?? blobs.get(pathname);
      const entry = held ? { ...entryOf(pathname), version: held.version } : entryOf(pathname);
      if (stored === undefined || entry === null || entry.pathname === undefined) return null;
      return { entry: entry as BlobEntry, bytes: new Uint8Array(stored.bytes) };
    },
    async list(prefix) {
      calls.push({ op: 'list', pathname: prefix });
      return (heldList ?? listing()).filter((entry) => entry.pathname.startsWith(prefix));
    },
    async folders(prefix) {
      calls.push({ op: 'folders', pathname: prefix });
      const out = new Set<string>();
      for (const pathname of blobs.keys()) {
        if (!pathname.startsWith(prefix)) continue;
        const rest = pathname.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0) out.add(`${prefix}${rest.slice(0, slash)}/`);
      }
      return [...out].sort();
    },
    async put(pathname, bytes, putOptions: BlobPutOptions) {
      calls.push({ op: 'put', pathname });
      const failure = failures.get(pathname);
      if (failure !== undefined) {
        failures.delete(pathname);
        throw failure;
      }
      const existing = blobs.get(pathname);
      if (existing !== undefined && !putOptions.overwrite) throw new BlobExistsError(pathname);
      if (putOptions.ifMatch !== undefined && existing?.version !== putOptions.ifMatch) {
        throw new BlobPreconditionError(pathname);
      }
      const copy = new Uint8Array(bytes);
      blobs.set(pathname, { bytes: copy, version: versionOf(copy), uploadedAt: now() });
      const entry = entryOf(pathname);
      if (entry === null) throw new Error('unreachable');
      return entry;
    },
    async del(pathnames) {
      for (const pathname of pathnames) {
        calls.push({ op: 'del', pathname });
        blobs.delete(pathname);
      }
    },
  };
}

// An in-memory BlobClient with the semantics the store relies on (blob-store.ts): versions are a
// hash of the bytes, `overwrite: false` refuses an existing pathname, `ifMatch` refuses a stale
// version, list and folders read the prefix, del ignores what is missing. The contract test runs
// the BlobStore against it, two store instances against one fake stand in for two function
// instances, and `calls` records every operation so a test can count round trips.
import { createHash } from 'node:crypto';

import type { BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
import { BlobExistsError, BlobPreconditionError } from './blob-store.ts';

export type FakeBlobCall = { op: keyof BlobClient; pathname: string };

export type FakeBlobClient = BlobClient & {
  /** the stored bytes by pathname */
  readonly blobs: Map<string, { bytes: Uint8Array; version: string }>;
  readonly calls: FakeBlobCall[];
  /** the URL prefix the fake reports, so tests can check redirects */
  readonly base: string;
  /** injects a failure for the next put of a pathname (a network fault) */
  failNextPut: (pathname: string, error: Error) => void;
};

export function versionOf(bytes: Uint8Array): string {
  return `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;
}

export function memoryBlobClient(base = 'https://fake.blob.local'): FakeBlobClient {
  const blobs = new Map<string, { bytes: Uint8Array; version: string }>();
  const calls: FakeBlobCall[] = [];
  const failures = new Map<string, Error>();
  const entryOf = (pathname: string): BlobEntry | null => {
    const stored = blobs.get(pathname);
    return stored === undefined
      ? null
      : {
          pathname,
          url: `${base}/${pathname}`,
          size: stored.bytes.byteLength,
          version: stored.version,
        };
  };
  return {
    blobs,
    calls,
    base,
    failNextPut(pathname, error) {
      failures.set(pathname, error);
    },
    async head(pathname) {
      calls.push({ op: 'head', pathname });
      return entryOf(pathname);
    },
    async get(pathname) {
      calls.push({ op: 'get', pathname });
      const stored = blobs.get(pathname);
      const entry = entryOf(pathname);
      if (stored === undefined || entry === null) return null;
      return { entry, bytes: new Uint8Array(stored.bytes) };
    },
    async list(prefix) {
      calls.push({ op: 'list', pathname: prefix });
      return [...blobs.keys()]
        .filter((pathname) => pathname.startsWith(prefix))
        .sort()
        .map((pathname) => entryOf(pathname))
        .filter((entry): entry is BlobEntry => entry !== null);
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
    async put(pathname, bytes, options: BlobPutOptions) {
      calls.push({ op: 'put', pathname });
      const failure = failures.get(pathname);
      if (failure !== undefined) {
        failures.delete(pathname);
        throw failure;
      }
      const existing = blobs.get(pathname);
      if (existing !== undefined && !options.overwrite) throw new BlobExistsError(pathname);
      if (options.ifMatch !== undefined && existing?.version !== options.ifMatch) {
        throw new BlobPreconditionError(pathname);
      }
      const copy = new Uint8Array(bytes);
      blobs.set(pathname, { bytes: copy, version: versionOf(copy) });
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

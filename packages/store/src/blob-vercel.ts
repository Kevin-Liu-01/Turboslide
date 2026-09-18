// The BlobClient over @vercel/blob (the hosting round). Server only: the studio's Nitro plugin
// imports this module and hands the client to the store; nothing the browser bundles reaches it.
// Reads that must be current go through `get(..., { useCache: false })`, which the SDK serves from
// origin storage instead of the CDN cache (an overwritten blob is otherwise served stale for up to
// its cache-control max-age, one minute at least); public URLs stay for the asset twins the
// browser fetches. The token comes from BLOB_READ_WRITE_TOKEN, the variable Vercel sets when a
// store is connected to the project (docs/hosting.md).
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  head,
  list,
  put,
} from '@vercel/blob';

import type { BlobClient, BlobEntry } from './blob-store.ts';
import { BlobExistsError, BlobPreconditionError } from './blob-store.ts';
import { splitBlobClient } from './migrate.ts';
import type { Env } from './select.ts';
import { BLOB_TOKEN_VARIABLE } from './select.ts';

/** The store's access level; `public` is what the twins need. TURBOSLIDE_BLOB_ACCESS overrides. */
export const BLOB_ACCESS_VARIABLE = 'TURBOSLIDE_BLOB_ACCESS';

type Access = 'public' | 'private';

type WithMeta = {
  pathname: string;
  url: string;
  size?: number | null;
  uploadedAt?: Date | string;
  etag?: string;
};

/**
 * One version string for one stored body: `head`, `list` and `put` answer the strong etag
 * (`"fc8e..."`) while `get({ useCache: false })` answers the same value as a weak validator
 * (`W/"fc8e..."`), and `ifMatch` accepts only the strong form (measured against the live store on
 * 2026-09-11: every commit answered "Precondition failed" until the prefix was dropped).
 */
export function strongEtag(etag: string): string {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

function entryOf(blob: WithMeta): BlobEntry {
  const uploaded =
    blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() : (blob.uploadedAt ?? '');
  return {
    pathname: blob.pathname,
    url: blob.url,
    size: typeof blob.size === 'number' ? blob.size : 0,
    version: blob.etag !== undefined && blob.etag !== '' ? strongEtag(blob.etag) : uploaded,
    ...(uploaded === '' ? {} : { uploadedAt: uploaded }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The SDK's error classes are anonymous (`var BlobNotFoundError = class extends BlobError`), so
// their `name` is never the class name; a class check with the message as the fallback (measured
// on the first blob-backed preview: `head()` of a missing blob surfaced as "Vercel Blob: The
// requested blob does not exist" and every page answered 500).
function isNotFound(error: unknown): boolean {
  return (
    error instanceof BlobNotFoundError || /requested blob does not exist/i.test(errorMessage(error))
  );
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError || /precondition failed/i.test(errorMessage(error))
  );
}

async function bytesOf(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array();
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The private store of storage layout v2 (gslides-parity SPEC-3 2.2, 11.5): its read write token.
 * Set, `vercelDocumentsClient` opens it and `splitBlobClient` (migrate.ts) puts every document
 * there; unset, the deployment runs layout v1 on the public store alone.
 */
export const DOCUMENTS_TOKEN_VARIABLE = 'TURBOSLIDE_BLOB_PRIVATE_TOKEN';

export function hasDocumentsToken(env: Env = process.env): boolean {
  const token = env[DOCUMENTS_TOKEN_VARIABLE];
  return token !== undefined && token !== '';
}

export type VercelClientOptions = {
  /** the variable holding the token; `BLOB_READ_WRITE_TOKEN` by default */
  tokenVariable?: string;
  /** the access of every put; `TURBOSLIDE_BLOB_ACCESS` (public unless `private`) by default */
  access?: Access;
};

/** The private documents store's client (layout v2); a TypeError names the variable when it is unset. */
export function vercelDocumentsClient(env: Env = process.env): BlobClient {
  return vercelBlobClient(env, { tokenVariable: DOCUMENTS_TOKEN_VARIABLE, access: 'private' });
}

/** The SDK's own switch for its retry loop; the store leaves it off unless the deployment sets it. */
export const SDK_RETRIES_VARIABLE = 'VERCEL_BLOB_RETRIES';

/**
 * The SDK's retry loop off, unless the deployment set the variable itself (the focus round,
 * cycle 3 fix round; the blob tier budget): `@vercel/blob` retries a network error or a 5xx up
 * to VERCEL_BLOB_RETRIES times (10 by default) with waits of 1, 2, 4 ... seconds inside every
 * call, which under the store's concurrency limit multiplied one refused head into a chain of
 * them and a 10 s deadline into a timeout. The store's own layers retry instead, on a budget:
 * the blob channel's poll backs off exponentially to 60 s (realtime/blob.ts, pulse.ts), the room
 * client sends a refused write again after the wait the answer names (room-client.ts), and the
 * seed upload is tried again by the next request that finds no manifest (blob-store.ts
 * `seedOnce`). The SDK reads the variable at call time from `process.env`, so it is set once
 * here; a 429 was never retried by the SDK (it bails with `retryAfter`).
 */
function disableSdkRetries(): void {
  if (process.env[SDK_RETRIES_VARIABLE] === undefined) process.env[SDK_RETRIES_VARIABLE] = '0';
}

export function vercelBlobClient(
  env: Env = process.env,
  options: VercelClientOptions = {},
): BlobClient {
  disableSdkRetries();
  const variable = options.tokenVariable ?? BLOB_TOKEN_VARIABLE;
  const token = env[variable];
  if (token === undefined || token === '') {
    throw new TypeError(
      variable === BLOB_TOKEN_VARIABLE
        ? `${BLOB_TOKEN_VARIABLE} is not set; connect a Blob store to the project`
        : `${variable} is not set; create the private store and set its token (docs/hosting.md, the private store)`,
    );
  }
  const access: Access =
    options.access ?? (env[BLOB_ACCESS_VARIABLE] === 'private' ? 'private' : 'public');
  return {
    // every call carries the caller's signal as the SDK's `abortSignal` (blob-store.ts
    // BlobCallOptions): the bounded client fires it at the deadline, which ends the SDK's own
    // retry chain (async-retry, VERCEL_BLOB_RETRIES attempts with growing waits) there instead
    // of letting it run on for minutes after the store gave up on the call (the focus round,
    // cycle 3; boundedBlobClient says what that did on the enforce preview)
    async head(pathname, options) {
      try {
        return entryOf(await head(pathname, { token, abortSignal: options?.signal }));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async get(pathname, options) {
      let result;
      try {
        result = await get(pathname, {
          access,
          token,
          useCache: false,
          abortSignal: options?.signal,
        });
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      if (result === null) return null;
      return { entry: entryOf(result.blob), bytes: await bytesOf(result.stream) };
    },
    async list(prefix, options) {
      const out: BlobEntry[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({
          token,
          prefix,
          limit: 1000,
          abortSignal: options?.signal,
          ...(cursor === undefined ? {} : { cursor }),
        });
        for (const blob of page.blobs) out.push(entryOf(blob));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
      return out;
    },
    async folders(prefix, options) {
      const out = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await list({
          token,
          prefix,
          limit: 1000,
          mode: 'folded',
          abortSignal: options?.signal,
          ...(cursor === undefined ? {} : { cursor }),
        });
        for (const folder of page.folders) out.add(folder);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
      return [...out].sort();
    },
    async put(pathname, bytes, options) {
      try {
        // the SDK's PutBody names Buffer, not Uint8Array; the copy is the bytes' own view
        const result = await put(
          pathname,
          Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          {
            access,
            token,
            addRandomSuffix: false,
            allowOverwrite: options.overwrite,
            abortSignal: options.signal,
            ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
            ...(options.ifMatch === undefined ? {} : { ifMatch: options.ifMatch }),
            // the object's own max age (gslides-parity SPEC-4 0.31; build-4/b4.md R1): the
            // thumbnail cache's stamped objects take a year, everything else the store's default
            ...(options.cacheControlMaxAge === undefined
              ? {}
              : { cacheControlMaxAge: options.cacheControlMaxAge }),
          },
        );
        return entryOf(result);
      } catch (error) {
        if (isPreconditionFailed(error)) throw new BlobPreconditionError(pathname);
        if (/already exists/i.test(errorMessage(error))) throw new BlobExistsError(pathname);
        throw error;
      }
    },
    async del(pathnames, options) {
      if (pathnames.length === 0) return;
      await del([...pathnames], { token, abortSignal: options?.signal });
    },
  };
}

/**
 * The client a deployment opens (gslides-parity SPEC-3 2.2, 11.5): with the private store's token
 * set, one client over both stores that routes documents private and twins public and honours the
 * migration's dual read window (`splitBlobClient`); without it, the public store alone (layout
 * v1). The studio's hosting plugin registers the result as `HostingProviders.blob`.
 */
export function layoutBlobClient(env: Env = process.env): BlobClient {
  const legacy = vercelBlobClient(env);
  if (!hasDocumentsToken(env)) return legacy;
  return splitBlobClient({ legacy, documents: vercelDocumentsClient(env) });
}

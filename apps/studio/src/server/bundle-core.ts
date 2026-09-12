import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { bearerToken } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import { defaultPaths } from '@turboslide/render-worker/paths';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { BlobExistsError, deckPrefix, pushDeckDir } from '@turboslide/store/blob-store';
import { BUNDLE_MAX_BYTES, listDeckFiles } from '@turboslide/store/bundle';
import { packDeckDir } from '@turboslide/store/pack';
import type { PackedBundle } from '@turboslide/store/pack';
import { unpackBundle } from '@turboslide/store/unpack';
import type { UnpackResult } from '@turboslide/store/unpack';

import {
  deckDir,
  ensureDeckAssets,
  ensureDecks,
  exportBlobClient,
  isHosted,
  openDeckStore,
  stateDir,
  workerPaths,
} from './root';

/**
 * Deck transfer on the server (docs/deck-transfer.md; Kevin's directive of 2026-09-11: copy a
 * deck into the hosted app, or connect the local slides with it). exportDeckBundle packs a deck
 * the store holds (synced, its twins on disk) and importDeckBundle writes a bundle into the folder
 * the store owns, pushing it to the Blob store on that backend, so a deck pushed from a checkout
 * appears on every instance. The two routes (routes/api/decks.bundle.ts, decks.$deckId.bundle.ts)
 * are the adapters for the CLI's `deck push` and `deck pull`, behind the bearer token of the
 * deployment (SPEC 11); the studio's own page reaches them through the server functions below,
 * which mint a short-lived signed ticket the route accepts in place of the bearer, so the browser
 * never holds TURBOSLIDE_TOKEN (docs/hosting.md section 6, option 2). This module is Node only
 * (node:crypto for the tickets, the store and the worker paths) and is imported by the two routes
 * and by bundle.ts, whose server functions are what the pages import: a page module must not
 * reach node:crypto, which Vite's dev server externalizes for the browser with a throw at module
 * evaluation (measured 2026-09-11: /deck/gt-brand never hydrated while the tickets lived in the
 * module the pages imported). createServerFn appears only under apps/studio/src/server (SPEC 3.3
 * item 4).
 */

/** How long a ticket stays valid: long enough for a download to start, short enough to forget. */
export const TICKET_TTL_MS = 10 * 60 * 1000;
export const TICKET_QUERY = 't';
export const DOWNLOAD_PURPOSE = 'bundle-download';
export const UPLOAD_PURPOSE = 'bundle-upload';
/** The subject an upload ticket names: any deck. */
export const ANY_SUBJECT = '*';

type Ticket = { p: string; s: string; exp: number; nonce: string };

type Shared = { secret?: Buffer };

const shared = globalThis as typeof globalThis & { __turboslideBundleTickets?: Shared };

/**
 * The signing key: the deployment's bearer token when set (every instance of the deployment
 * shares it, so a ticket minted on one instance verifies on another), else the download secret,
 * else a per-process random key (a checkout: one process serves every request).
 */
function secret(): Buffer {
  shared.__turboslideBundleTickets ??= {};
  const state = shared.__turboslideBundleTickets;
  if (state.secret === undefined) {
    const seed = process.env.TURBOSLIDE_TOKEN || process.env.TURBOSLIDE_DOWNLOAD_SECRET;
    state.secret = seed
      ? createHmac('sha256', 'turboslide-bundle').update(seed).digest()
      : randomBytes(32);
  }
  return state.secret;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('hex');
}

/** A ticket for one purpose and subject, valid for TICKET_TTL_MS. */
export function signTicket(purpose: string, subject: string, now: number = Date.now()): string {
  const ticket: Ticket = {
    p: purpose,
    s: subject,
    exp: now + TICKET_TTL_MS,
    nonce: randomBytes(8).toString('hex'),
  };
  const body = Buffer.from(JSON.stringify(ticket), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** True when the ticket is well formed, signed here, unexpired and names the purpose and subject. */
export function verifyTicket(
  token: string,
  purpose: string,
  subject: string,
  now: number = Date.now(),
): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(body);
  if (given.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;
  const ticket = parsed as Partial<Ticket>;
  return (
    ticket.p === purpose &&
    ticket.s === subject &&
    typeof ticket.exp === 'number' &&
    ticket.exp >= now
  );
}

function sameToken(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The bundle routes' rule: a valid ticket for the purpose and subject (the studio's own page),
 * else the bearer token when TURBOSLIDE_TOKEN is set, else open (a checkout, the rule of the
 * export and render routes). Returns the 401 Response to send, or null when the request may proceed.
 */
export function bundleRouteAuth(
  request: Request,
  purpose: string,
  subject: string,
): Response | null {
  const url = new URL(request.url);
  const ticket = url.searchParams.get(TICKET_QUERY);
  if (ticket !== null && verifyTicket(ticket, purpose, subject)) return null;
  const token = process.env.TURBOSLIDE_TOKEN;
  if (token === undefined || token === '') return null;
  const given = bearerToken(request);
  if (given !== undefined && sameToken(given, token)) return null;
  return refuse(
    401,
    'unauthorized',
    'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>, or ask the studio page for a ticket',
  );
}

function requireSlug(deckId: string): void {
  if (!SLUG_PATTERN.test(deckId)) throw new TypeError('deckId must be a slug');
}

/** The deck as a bundle: synced from the store, its twins on disk, packed with its versions. */
export async function exportDeckBundle(deckId: string): Promise<PackedBundle> {
  requireSlug(deckId);
  // a RangeError when the deck is missing (404 in the route); the sync brings the documents down
  await openDeckStore(deckId);
  await ensureDeckAssets(deckId);
  return packDeckDir(deckDir(deckId));
}

/**
 * Stores a bundle where any instance can serve it (the blob backend), for a download over a
 * function's response cap: `bundles/<deckId>/<stamp>-<random>/<fileName>`, public but unguessable.
 * Returns the URL, or null on the other backends.
 */
export async function storeBundleCopy(
  deckId: string,
  fileName: string,
  zip: Uint8Array,
): Promise<string | null> {
  const client = await exportBlobClient();
  if (client === null) return null;
  const folder = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
  const entry = await client.put(`bundles/${deckId}/${folder}/${fileName}`, zip, {
    overwrite: false,
    contentType: 'application/zip',
  });
  return entry.url;
}

export type ImportBundleOptions = { as?: string; replace?: boolean };

export type ImportedBundle = UnpackResult & {
  /** the editor path of the deck on this studio */
  editUrl: string;
  /** the deck was uploaded to the Blob store (the blob backend) */
  pushed: boolean;
};

/** Derived files of a deck that no longer match it after a replace: thumbnails and the render cache. */
function purgeDerived(deckId: string): void {
  const paths = workerPaths();
  const workerDir = paths === undefined ? defaultPaths().workerDir : paths.workerDir;
  for (const dir of [join(stateDir(), 'thumbs', deckId), join(workerDir, 'cache', deckId)]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Writes a bundle as a deck of this studio: validated and unpacked into the store's folder (a
 * taken id gets a free sibling unless `replace`), then, on the blob backend, uploaded with
 * deck.json last and the store's stale files of a replaced deck removed, so the next instance
 * lists and opens it. A TypeError names what a refused bundle got wrong (400 in the route).
 */
export async function importDeckBundle(
  zip: Uint8Array,
  options: ImportBundleOptions = {},
): Promise<ImportedBundle> {
  if (zip.byteLength > BUNDLE_MAX_BYTES) {
    throw new TypeError(
      `the bundle is ${zip.byteLength} bytes; a bundle is at most ${BUNDLE_MAX_BYTES}`,
    );
  }
  if (options.as !== undefined) requireSlug(options.as);
  const decks = await ensureDecks();
  const result = await unpackBundle(zip, {
    decksDir: decks.decksDir,
    ...(options.as !== undefined ? { as: options.as } : {}),
    replace: options.replace === true,
    exists: (deckId) => decks.has(deckId),
  });
  if (result.replaced) purgeDerived(result.deckId);
  let pushed = false;
  const client = await exportBlobClient();
  if (client !== null && decks.kind === 'blob') {
    try {
      await pushDeckDir(client, result.deckId, result.dir, { overwrite: result.replaced });
    } catch (error) {
      rmSync(result.dir, { recursive: true, force: true });
      if (error instanceof BlobExistsError) {
        throw new TypeError(
          `decks/${result.deckId} appeared in the store meanwhile; run the upload again`,
        );
      }
      throw error;
    }
    if (result.replaced) {
      // files of the old deck the new one does not carry: removed slides, old versions, leases
      const kept = new Set<string>();
      const files = listDeckFiles(result.dir);
      for (const relative of [...files.documents, ...files.assets]) kept.add(relative);
      const prefix = deckPrefix(result.deckId);
      const stale = (await client.list(prefix))
        .map((entry) => entry.pathname)
        .filter((pathname) => !kept.has(pathname.slice(prefix.length)));
      if (stale.length > 0) await client.del(stale);
    }
    pushed = true;
  }
  return { ...result, editUrl: `/edit/${result.deckId}`, pushed };
}

/** A URL the upload route may fetch a bundle from: the deck store's Blob host, and localhost in a checkout. */
export function isAllowedBundleSource(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (
    url.protocol === 'https:' &&
    (host.endsWith('.blob.vercel-storage.com') || host === 'blob.vercel-storage.com')
  )
    return true;
  if (!isHosted() && (url.protocol === 'http:' || url.protocol === 'https:')) {
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  }
  return false;
}

/**
 * Fetches a bundle from a stored copy (the `{ url }` form of the upload route, for bundles over a
 * function's 4.5 MB request body cap): the host must be allowed, redirects are refused and the
 * bytes are capped at BUNDLE_MAX_BYTES.
 */
export async function fetchBundleFromUrl(raw: string): Promise<Uint8Array> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError(`"${raw}" is not a URL`);
  }
  if (!isAllowedBundleSource(url)) {
    throw new TypeError(
      `the studio fetches bundles only from the deck store's Blob host (*.blob.vercel-storage.com); ${url.host} is not allowed`,
    );
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new TypeError(`${url.host} answered ${response.status} for the bundle`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > BUNDLE_MAX_BYTES)
    throw new TypeError(
      `the stored bundle is ${length} bytes; a bundle is at most ${BUNDLE_MAX_BYTES}`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > BUNDLE_MAX_BYTES)
    throw new TypeError(
      `the stored bundle is ${bytes.byteLength} bytes; a bundle is at most ${BUNDLE_MAX_BYTES}`,
    );
  return bytes;
}

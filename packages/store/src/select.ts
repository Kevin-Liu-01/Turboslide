// Store selection (SPEC 11 "Storage is FileStore ... behind the DeckStore interface"; the hosting
// round). One place decides which backend a process uses, from the environment alone, so the
// studio, the CLI and the tests agree:
//
//   TURBOSLIDE_STORE=file|tmp|blob   an explicit choice wins
//   VERCEL set                        blob when BLOB_READ_WRITE_TOKEN is set, else tmp
//   otherwise                         file (a checkout with a writable decks/ folder)
//
// `file` is the repository's decks/ tree with git as history. `tmp` is a per-instance overlay
// under the OS temp directory, seeded from the bundled decks; edits live only for the life of the
// instance, which the editor says in a banner. `blob` is the same overlay used as a mirror of a
// Vercel Blob store: reads sync from the store, writes push to it, so edits persist across
// instances and deploys. Framework free: no Nitro, no Vercel SDK here.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const STORE_KINDS = ['file', 'tmp', 'blob'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

/** The variable Vercel Blob sets when a store is connected to the project. */
export const BLOB_TOKEN_VARIABLE = 'BLOB_READ_WRITE_TOKEN';

/** The variable that forces a backend. */
export const STORE_VARIABLE = 'TURBOSLIDE_STORE';

/** The variable that moves the overlay away from <tmpdir>/turboslide. */
export const OVERLAY_VARIABLE = 'TURBOSLIDE_OVERLAY_DIR';

/** The banner text the editor shows over a store whose edits do not persist. */
export const NOT_PERSISTENT_NOTICE =
  'Edits are kept on this server instance only and do not persist until a Blob store is connected';

export type Env = Readonly<Record<string, string | undefined>>;

export type StoreSelection = {
  kind: StoreKind;
  /** why this kind was chosen, for the deck list and the logs */
  reason: string;
  /** false for the tmp overlay: a new instance starts from the seed again */
  persistent: boolean;
  /** true when a Blob token is present, whatever the kind */
  blob: boolean;
};

export function isStoreKind(value: unknown): value is StoreKind {
  return typeof value === 'string' && (STORE_KINDS as ReadonlyArray<string>).includes(value);
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

export function hasBlobToken(env: Env = process.env): boolean {
  return isSet(env[BLOB_TOKEN_VARIABLE]);
}

/** True inside a Vercel build or function (Vercel sets VERCEL=1 in both). */
export function isVercel(env: Env = process.env): boolean {
  return isSet(env.VERCEL);
}

/**
 * The backend for this process. A TypeError names the problem when TURBOSLIDE_STORE holds an
 * unknown word or asks for blob without a token, so a misconfigured deploy fails at the first
 * request with a message instead of writing into a folder nobody reads.
 */
export function selectStore(env: Env = process.env): StoreSelection {
  const blob = hasBlobToken(env);
  const forced = env[STORE_VARIABLE];
  if (isSet(forced)) {
    if (!isStoreKind(forced)) {
      throw new TypeError(
        `${STORE_VARIABLE} must be one of ${STORE_KINDS.join(', ')}, got ${JSON.stringify(forced)}`,
      );
    }
    if (forced === 'blob' && !blob) {
      throw new TypeError(`${STORE_VARIABLE}=blob needs ${BLOB_TOKEN_VARIABLE} in the environment`);
    }
    return {
      kind: forced,
      reason: `${STORE_VARIABLE}=${forced}`,
      persistent: forced !== 'tmp',
      blob,
    };
  }
  if (isVercel(env)) {
    return blob
      ? { kind: 'blob', reason: `VERCEL with ${BLOB_TOKEN_VARIABLE}`, persistent: true, blob }
      : { kind: 'tmp', reason: `VERCEL without ${BLOB_TOKEN_VARIABLE}`, persistent: false, blob };
  }
  return { kind: 'file', reason: 'a checkout with decks/', persistent: true, blob };
}

/**
 * The overlay root for the hosted kinds: TURBOSLIDE_OVERLAY_DIR, else <tmpdir>/turboslide, which
 * is /tmp/turboslide in a Vercel function, the one writable path there. Its decks/ folder is the
 * materialized seed plus the instance's edits (or the Blob mirror), and its .turboslide/ folder
 * holds the derived files the studio writes (thumbnails, worker jobs, HTTP scratch).
 */
export function overlayRoot(env: Env = process.env): string {
  const fromEnv = env[OVERLAY_VARIABLE];
  return isSet(fromEnv) ? resolve(fromEnv) : join(tmpdir(), 'turboslide');
}

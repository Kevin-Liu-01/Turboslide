// Storage layout v2 and its migration (gslides-parity SPEC-3 11.5, 2.2, 0.26; MILESTONES-3 B2 day
// 6). Layout v1 is one public Blob store holding documents and twins under `decks/<id>/`. Layout
// v2 keeps the twins on the public store (the browser reads them by URL) and moves every document
// (`deck.json`, `slides/`, `versions/`, `snapshots/`, `leases.json`, `access.json`, `comments/`,
// the sidecars, `users/<id>/decks.json`) to a private store, so a record is never readable by
// URL. `splitBlobClient` is one `BlobClient` over the two stores that routes by pathname, reads
// documents from the private store first and falls back to the public one during the dual read
// window, and writes documents private from the first request; `openBlobStore` and
// `openHostedDecks` take it as their client unchanged. `runMigrationStep` is
// `turboslide admin migrate-storage <step>`: plan, copy, verify, cutover, delete and rollback,
// each resumable from the cursor `meta.json` in the private store keeps, every copy verified by
// etag (Vercel Blob's etag is the md5 of the body, the fake's too), snapshots compared byte for
// byte, the public documents deleted in batches of 50 after the cutover, and a rollback flag
// before it. The assetKey copy of the twins to `d/<id>/<assetKey>/` is not part of this module
// (b2.md records why); the twins stay where the assets route serves them from.
import type { BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
import { deckPrefix, isBlobExistsError } from './blob-store.ts';

export const MIGRATION_META = 'meta.json';
export const MIGRATION_STEPS = ['plan', 'copy', 'verify', 'cutover', 'delete', 'rollback'] as const;
export type MigrationStep = (typeof MIGRATION_STEPS)[number];
/** The public documents leave in batches of this many paths (11.5). */
export const DELETE_BATCH = 50;
export const DEFAULT_DECK_BATCH = 5;
/** How long a process trusts the layout it read before asking the private store again. */
export const LAYOUT_TTL_MS = 5_000;

export type StorageLayout = 'v1' | 'v2';

export type MigrationMeta = {
  schemaVersion: 1;
  layout: StorageLayout;
  /** the last step run */
  step: MigrationStep;
  /** the deck ids the plan found, in store order */
  decks: string[];
  /** the last deck id the current step finished, null before the first */
  cursor: string | null;
  copied: string[];
  verified: string[];
  /** `<deckId>: <reason>` per deck that did not verify */
  failed: string[];
  /** both stores are read while true */
  dualRead: boolean;
  /** set by `rollback` before the cutover: reads and writes go to the public store again */
  rollback: boolean;
  /** the public documents removed after the cutover */
  deleted: string[];
  startedAt: string;
  updatedAt: string;
};

export type MigrationResult = {
  step: MigrationStep;
  cursor: string | null;
  processed: number;
  verified: number;
  failed: string[];
  done: boolean;
  dualRead: boolean;
};

export type MigrationClients = {
  /** the public store of layout v1: documents and twins today, twins only after the cutover */
  legacy: BlobClient;
  /** the private store: documents */
  documents: BlobClient;
};

export type MigrationOptions = {
  /** decks per call of copy, verify and delete; default 5 */
  batch?: number;
  now?: () => string;
};

/** True for the paths that stay on the public store: the twins under a deck, the keyed twins, the produced exports and bundles. */
export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('d/')) return true;
  if (pathname.startsWith('exports/') || pathname.startsWith('bundles/')) return true;
  const match = /^decks\/[^/]+\/(.*)$/.exec(pathname);
  return match !== null && match[1] !== undefined && match[1].startsWith('assets/');
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function emptyMeta(now: string): MigrationMeta {
  return {
    schemaVersion: 1,
    layout: 'v1',
    step: 'plan',
    decks: [],
    cursor: null,
    copied: [],
    verified: [],
    failed: [],
    dualRead: false,
    rollback: false,
    deleted: [],
    startedAt: now,
    updatedAt: now,
  };
}

/** The migration record of the private store, or null before a plan ran. */
export async function readMeta(documents: BlobClient): Promise<MigrationMeta | null> {
  const fetched = await documents.get(MIGRATION_META);
  if (fetched === null) return null;
  try {
    const raw = JSON.parse(decoder.decode(fetched.bytes)) as Partial<MigrationMeta>;
    if (raw.schemaVersion !== 1 || (raw.layout !== 'v1' && raw.layout !== 'v2')) return null;
    return { ...emptyMeta(raw.startedAt ?? new Date(0).toISOString()), ...raw } as MigrationMeta;
  } catch {
    return null;
  }
}

export async function writeMeta(documents: BlobClient, meta: MigrationMeta): Promise<void> {
  await documents.put(MIGRATION_META, encoder.encode(`${JSON.stringify(meta, null, 2)}\n`), {
    overwrite: true,
    contentType: 'application/json',
  });
}

/** The reads a process makes of the layout, cached for a few seconds; `v1` with no record. */
export function layoutReader(
  documents: BlobClient,
  options: { ttlMs?: number; now?: () => number } = {},
): () => Promise<{ layout: StorageLayout; dualRead: boolean; rollback: boolean }> {
  const ttl = options.ttlMs ?? LAYOUT_TTL_MS;
  const clock = options.now ?? (() => Date.now());
  let cached:
    | { at: number; value: { layout: StorageLayout; dualRead: boolean; rollback: boolean } }
    | undefined;
  return async () => {
    const at = clock();
    if (cached !== undefined && at - cached.at < ttl) return cached.value;
    const meta = await readMeta(documents).catch(() => null);
    const value =
      meta === null
        ? { layout: 'v1' as const, dualRead: false, rollback: false }
        : { layout: meta.layout, dualRead: meta.dualRead, rollback: meta.rollback };
    cached = { at, value };
    return value;
  };
}

/**
 * One client over the two stores (SPEC-3 2.2): twins and exports on the public store, documents
 * on the private one. Before a plan runs (no `meta.json`) everything reads and writes the public
 * store, as layout v1 does. During the dual read window a document is read from the private store
 * and, when absent there, from the public one; every document write goes private. After the
 * cutover the public store holds twins only. Under the rollback flag the public store is the
 * truth again.
 */
export function splitBlobClient(
  clients: MigrationClients,
  options: { ttlMs?: number; now?: () => number } = {},
): BlobClient {
  const { legacy, documents } = clients;
  const layout = layoutReader(documents, options);
  const documentsStore = async (): Promise<{
    primary: BlobClient;
    fallback: BlobClient | null;
  }> => {
    const state = await layout();
    if (state.rollback) return { primary: legacy, fallback: null };
    if (state.layout === 'v2') return { primary: documents, fallback: null };
    if (state.dualRead) return { primary: documents, fallback: legacy };
    return { primary: legacy, fallback: null };
  };
  const forWrite = async (pathname: string): Promise<BlobClient> =>
    isPublicPath(pathname) ? legacy : (await documentsStore()).primary;
  return {
    // the caller's options (the deadline's signal, blob-store.ts BlobCallOptions) reach the
    // client that makes the request
    async head(pathname, options) {
      if (isPublicPath(pathname)) return legacy.head(pathname, options);
      const { primary, fallback } = await documentsStore();
      const found = await primary.head(pathname, options);
      return found ?? (fallback === null ? null : fallback.head(pathname, options));
    },
    async get(pathname, options) {
      if (isPublicPath(pathname)) return legacy.get(pathname, options);
      const { primary, fallback } = await documentsStore();
      const found = await primary.get(pathname, options);
      return found ?? (fallback === null ? null : fallback.get(pathname, options));
    },
    async list(prefix, options) {
      const { primary, fallback } = await documentsStore();
      const seen = new Map<string, BlobEntry>();
      const sources: BlobClient[] =
        primary === legacy ? [legacy] : [primary, legacy, ...(fallback === null ? [] : [fallback])];
      for (const source of new Set(sources)) {
        for (const entry of await source.list(prefix, options)) {
          const publicPath = isPublicPath(entry.pathname);
          // a document listed on the public store counts only while the public store is a document source
          if (source === legacy && !publicPath && primary !== legacy && fallback !== legacy)
            continue;
          if (source !== legacy && publicPath) continue;
          if (!seen.has(entry.pathname)) seen.set(entry.pathname, entry);
        }
      }
      return [...seen.values()].sort((a, b) => a.pathname.localeCompare(b.pathname));
    },
    async folders(prefix, options) {
      const { primary, fallback } = await documentsStore();
      const out = new Set<string>();
      for (const source of new Set([primary, legacy, ...(fallback === null ? [] : [fallback])])) {
        for (const folder of await source.folders(prefix, options)) out.add(folder);
      }
      return [...out].sort();
    },
    async put(pathname, bytes, putOptions: BlobPutOptions) {
      return (await forWrite(pathname)).put(pathname, bytes, putOptions);
    },
    async del(pathnames, options) {
      const publicPaths = pathnames.filter(isPublicPath);
      const documentPaths = pathnames.filter((pathname) => !isPublicPath(pathname));
      if (publicPaths.length > 0) await legacy.del(publicPaths, options);
      if (documentPaths.length > 0) {
        const { primary, fallback } = await documentsStore();
        await primary.del(documentPaths, options);
        if (fallback !== null) await fallback.del(documentPaths, options);
      }
    },
  };
}

function deckIdOfFolder(folder: string): string | null {
  const match = /^decks\/([^/]+)\/$/.exec(folder);
  return match?.[1] ?? null;
}

async function legacyDocuments(legacy: BlobClient, deckId: string): Promise<BlobEntry[]> {
  return (await legacy.list(deckPrefix(deckId))).filter((entry) => !isPublicPath(entry.pathname));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** The decks after the cursor, at most `batch`. */
function nextDecks(meta: MigrationMeta, batch: number): string[] {
  const start = meta.cursor === null ? 0 : meta.decks.indexOf(meta.cursor) + 1;
  return meta.decks.slice(start, start + batch);
}

async function copyDeck(clients: MigrationClients, deckId: string): Promise<string | null> {
  for (const entry of await legacyDocuments(clients.legacy, deckId)) {
    const stored = await clients.documents.head(entry.pathname);
    if (stored !== null) continue; // copied before, or written private during the window (newer than the public copy)
    const fetched = await clients.legacy.get(entry.pathname);
    if (fetched === null) continue; // deleted between the list and the read
    try {
      const put = await clients.documents.put(entry.pathname, fetched.bytes, {
        overwrite: false,
        contentType: contentTypeOf(entry.pathname),
      });
      if (put.version !== fetched.entry.version)
        return `${deckId}: ${entry.pathname} stored with etag ${put.version}, expected ${fetched.entry.version}`;
    } catch (error) {
      if (!isBlobExistsError(error)) throw error;
    }
  }
  return null;
}

function contentTypeOf(pathname: string): string {
  return pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream';
}

/** A head per document and a byte comparison per snapshot (11.5); a private copy newer than the public one is a write of the window. */
async function verifyDeck(clients: MigrationClients, deckId: string): Promise<string | null> {
  for (const entry of await legacyDocuments(clients.legacy, deckId)) {
    const stored = await clients.documents.head(entry.pathname);
    if (stored === null) return `${deckId}: ${entry.pathname} is missing from the private store`;
    if (stored.version === entry.version) {
      if (/\/snapshots\//.test(entry.pathname)) {
        const [a, b] = await Promise.all([
          clients.legacy.get(entry.pathname),
          clients.documents.get(entry.pathname),
        ]);
        if (a === null || b === null || !sameBytes(a.bytes, b.bytes))
          return `${deckId}: ${entry.pathname} differs byte for byte`;
      }
      continue;
    }
    const newer =
      stored.uploadedAt !== undefined &&
      entry.uploadedAt !== undefined &&
      Date.parse(stored.uploadedAt) > Date.parse(entry.uploadedAt);
    if (!newer)
      return `${deckId}: ${entry.pathname} has etag ${stored.version} privately and ${entry.version} publicly`;
  }
  return null;
}

/**
 * One step of the migration from its cursor. Every step writes `meta.json` back so the next call,
 * from any instance, continues where this one stopped. The result is the action's output.
 */
export async function runMigrationStep(
  clients: MigrationClients,
  step: MigrationStep,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const batch = options.batch ?? DEFAULT_DECK_BATCH;
  let meta = await readMeta(clients.documents);
  const result = (processed: number, done: boolean): MigrationResult => ({
    step,
    cursor: meta?.cursor ?? null,
    processed,
    verified: meta?.verified.length ?? 0,
    failed: meta?.failed ?? [],
    done,
    dualRead: meta?.dualRead ?? false,
  });
  switch (step) {
    case 'plan': {
      if (meta !== null && meta.layout === 'v2')
        throw new TypeError('the store is on layout v2 already; nothing to plan');
      const folders = await clients.legacy.folders('decks/');
      const decks = folders
        .map(deckIdOfFolder)
        .filter((id): id is string => id !== null && id !== 'templates');
      meta = { ...emptyMeta(now()), step, decks, dualRead: true, updatedAt: now() };
      await writeMeta(clients.documents, meta);
      return result(decks.length, true);
    }
    case 'copy':
    case 'verify': {
      if (meta === null) throw new TypeError('run plan first');
      if (meta.rollback)
        throw new TypeError('the migration was rolled back; run plan again to restart it');
      // a new step starts from the first deck; a finished step asked again runs a whole new pass
      if (meta.step !== step || meta.cursor === meta.decks[meta.decks.length - 1]) {
        meta = { ...meta, step, cursor: null };
      }
      const decks = nextDecks(meta, batch);
      for (const deckId of decks) {
        const problem =
          step === 'copy' ? await copyDeck(clients, deckId) : await verifyDeck(clients, deckId);
        const failed: string[] = meta.failed.filter((row) => !row.startsWith(`${deckId}:`));
        if (problem !== null) failed.push(problem);
        meta = {
          ...meta,
          cursor: deckId,
          failed,
          ...(step === 'copy'
            ? {
                copied:
                  problem === null && !meta.copied.includes(deckId)
                    ? [...meta.copied, deckId]
                    : meta.copied,
              }
            : {
                verified:
                  problem === null && !meta.verified.includes(deckId)
                    ? [...meta.verified, deckId]
                    : meta.verified.filter((id) => problem === null || id !== deckId),
              }),
          updatedAt: now(),
        };
      }
      const last = meta.decks[meta.decks.length - 1];
      const done = meta.decks.length === 0 || meta.cursor === last;
      await writeMeta(clients.documents, meta);
      return result(decks.length, done);
    }
    case 'cutover': {
      if (meta === null) throw new TypeError('run plan first');
      if (meta.rollback)
        throw new TypeError('the migration was rolled back; run plan again to restart it');
      const unverified = meta.decks.filter((id) => !meta?.verified.includes(id));
      if (unverified.length > 0 || meta.failed.length > 0) {
        meta = { ...meta, step, updatedAt: now() };
        await writeMeta(clients.documents, meta);
        return {
          ...result(0, false),
          failed: [...meta.failed, ...unverified.map((id) => `${id}: not verified`)],
        };
      }
      meta = { ...meta, step, layout: 'v2', dualRead: false, cursor: null, updatedAt: now() };
      await writeMeta(clients.documents, meta);
      return result(meta.decks.length, true);
    }
    case 'delete': {
      if (meta === null) throw new TypeError('run plan first');
      if (meta.layout !== 'v2')
        throw new TypeError('the public documents are deleted after the cutover only');
      if (meta.step !== 'delete' || meta.cursor === meta.decks[meta.decks.length - 1])
        meta = { ...meta, step, cursor: null };
      const decks = nextDecks(meta, batch);
      let removed = 0;
      for (const deckId of decks) {
        const paths = (await legacyDocuments(clients.legacy, deckId)).map(
          (entry) => entry.pathname,
        );
        for (let i = 0; i < paths.length; i += DELETE_BATCH) {
          await clients.legacy.del(paths.slice(i, i + DELETE_BATCH));
          removed += Math.min(DELETE_BATCH, paths.length - i);
        }
        meta = {
          ...meta,
          cursor: deckId,
          deleted: meta.deleted.includes(deckId) ? meta.deleted : [...meta.deleted, deckId],
          updatedAt: now(),
        };
      }
      const last = meta.decks[meta.decks.length - 1];
      const done = meta.decks.length === 0 || meta.cursor === last;
      await writeMeta(clients.documents, meta);
      return result(removed, done);
    }
    case 'rollback': {
      if (meta === null) throw new TypeError('nothing to roll back; no plan ran');
      if (meta.layout === 'v2') {
        throw new TypeError(
          'the cutover happened; after it a deck moves with deck pull and deck push, not a rollback',
        );
      }
      meta = { ...meta, step, rollback: true, dualRead: false, updatedAt: now() };
      await writeMeta(clients.documents, meta);
      return result(0, true);
    }
  }
}

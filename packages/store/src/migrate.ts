// Storage layout v2 and its migration in one maintenance window (gslides-parity SPEC-3 11.5, 2.2;
// HR-K1#4b, docs/hosting.md section 10). Layout v1 keeps every object on one public Blob store.
// Layout v2 keeps the twins, keyed twins, avatars, exports and bundles there (`isPublicPath`) and
// every other path, a document, on a private store, so a record is never readable by URL.
//
// Every deployment with a private store reads `meta.json` there through `splitBlobClient`, at most
// LAYOUT_TTL_MS old, and fails the request when the read fails. The record names the store that
// documents are read from and written to (`state`), and while a freeze lasts every document write
// and removal is refused with 503 (StorageFrozenError); reads go on. A freeze carries the time it
// ends, so a run whose operator stops never leaves the store read only.
//
// `runMigrationStep` is `turboslide admin migrate-storage <step>`. A migration is one run on one
// environment: `plan` (the counts), `freeze`, then after the settle `plan` again (the plan of
// record), `copy` (every planned document, in parallel, resumable), `verify`, and `switch`, one
// record write to v2. A run that fails before the switch ends its freeze with `unfreeze`, by itself
// when `verify` finds a difference, or by the freeze's own end. After the switch: `rekey` gives each
// deck a key of the environment's own, `verify` names the public documents a v1 writer changed,
// `rollback` copies back every document written on v2, and `delete`, 3 hours later and after a
// backup, removes the public documents. The keyed twins (K1#3, K1#4) are at the end of the file.
import { hasOwnAssetKey, keyedTwinPrefix, newAssetKey } from '@turboslide/schema/access';

import { blobAccessStore, parseAccessRecord } from './access-store.ts';
import type { BlobCallOptions, BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
import {
  ACCESS_FILE,
  BlobStaleReadError,
  blobContentType,
  deckPrefix,
  isBlobExistsError,
  isBlobPreconditionError,
} from './blob-store.ts';
import { pool } from './copy.ts';
import { isStoreBusy, storeRetryAfterMs } from './pulse.ts';

export const MIGRATION_META = 'meta.json';
export const MIGRATION_PROGRESS = 'migration.json';
/** The plan of record: every document the run copies, with its etag, which is also the manifest of the switch. */
export const MIGRATION_PLAN = 'migration/plan.json';
export const MIGRATION_STEPS = [
  'plan',
  'freeze',
  'copy',
  'verify',
  'switch',
  'unfreeze',
  'rekey',
  'rollback',
  'delete',
] as const;
export type MigrationStep = (typeof MIGRATION_STEPS)[number];
/**
 * Where documents live: `v1` the public store, `v2` the private store, `dual` the dual read
 * window of the migration before HR-K1#4b (the preview's since 2026-10-11): read from the private
 * store first and the public one when absent there, written to the private store.
 */
export const STORAGE_STATES = ['v1', 'dual', 'v2'] as const;
export type StorageState = (typeof STORAGE_STATES)[number];

/** How long a process trusts the layout it read (the only layout cache the code keeps). */
export const LAYOUT_TTL_MS = 5_000;
/** The deadline on one read of the layout record; past it the request fails. */
export const LAYOUT_READ_MS = 5_000;
/** The deadline on every document put and removal of the split client. */
export const DOCUMENT_WRITE_CAP_MS = 90_000;
/** How long after its client gave up a write can still land: the store applies a request it got. */
export const LANDING_MS = 30_000;
/** How long a Vercel Blob listing can lag a write (docs/hosting.md section 6, measured). */
export const LIST_LAG_MS = 60_000;
/**
 * From the frozen record's landing until no instance writes a document and the public listing
 * shows the last write: LAYOUT_TTL_MS (an instance that read the record just before it landed),
 * DOCUMENT_WRITE_CAP_MS (a write it admitted then), LANDING_MS, LIST_LAG_MS, and 55 s of margin.
 * The record's put has RECORD_WRITE_MS, so `settlesAt` is set that much later than the call began.
 */
export const FREEZE_SETTLE_MS = 4 * 60_000;
/** A freeze ends at most this long after the last call of its run (`expiresAt`). */
export const FREEZE_HOLD_MS = 10 * 60_000;
/** No freeze lasts longer than this from its start, whatever its calls do. */
export const FREEZE_LIMIT_MS = 45 * 60_000;
/** A call inside a freeze refuses when less than this is left of it, and ends the run. */
export const FREEZE_MARGIN_MS = 90_000;
/**
 * After a write that moves the reads to the other store (the switch, the end of a rollback),
 * document writes stay refused this long: the record's put, an instance's cached record and 5 s of
 * clock skew. So no instance writes one store while another still reads the other.
 */
export const OPEN_AFTER_MS = 20_000 + LAYOUT_TTL_MS + 5_000;
/** The deadline on a write of the migration's records, which the budget does not cover. */
export const RECORD_WRITE_MS = 20_000;
/** One call's budget (the CLI's `--budget`, 120 to 240 s), under the function's 300 s. */
export const DEFAULT_BUDGET_MS = 240_000;
/** No item starts in the last this many ms of a call's budget. */
const ITEM_RESERVE_MS = 10_000;
/** How long a lease holds past the call's budget, for a write the store applies late. */
export const LEASE_MARGIN_MS = 60_000;
/**
 * How long after the switch `delete` waits: 3 hours of guard passes on layout v2, during which
 * `rollback` stays possible. It was a day until Kevin cut it on 2026-10-16: production had no real
 * saves for days, and the v2 code ran the guard's full walk and specs on the preview since the
 * rehearsal. After `delete`, a full backup of the private store taken after the switch is the way
 * back.
 */
export const DELETE_AFTER_SWITCH_MS = 3 * 3_600_000;
/** The `retry-after` of a refused document write, in seconds. */
export const FROZEN_RETRY_AFTER_S = 30;
/**
 * The requests in flight of `copy` and `rollback`: the copy throughput test (migrate-copy.test.ts)
 * at 200 ms a put; the Vercel Blob rate limit is read on the preview's run and set with
 * `--concurrency`.
 */
export const DEFAULT_CONCURRENCY = 32;
export const MAX_CONCURRENCY = 128;
/** How many times one store call is tried on a 429, a 5xx or a network error. */
export const TRIES = 5;
/** The public documents and the old twins leave in batches of this many paths (11.5). */
export const DELETE_BATCH = 50;
/**
 * The removal batches of one call in flight at a time, each tried on its own (`tried`), so a 429
 * holds back only its own batch. migrate.test.ts removes through a store that refuses every batch
 * over four in flight and every tenth batch with a 429 that asks for a second.
 */
export const DELETE_IN_FLIGHT = 4;
/** The rows an answer lists; `rowCount` counts them all. */
export const ROWS_LISTED = 200;

export type MigrationClients = {
  /** the public store: documents on layout v1, twins and produced files always */
  legacy: BlobClient;
  /** the private store: documents on layout v2, and the migration's records */
  documents: BlobClient;
};

export type MigrationOptions = {
  budgetMs?: number;
  concurrency?: number;
  /** the clock in ms; the wall clock by default */
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** a signal that aborts after `ms`; AbortSignal.timeout by default */
  abortAfter?: (ms: number) => AbortSignal;
  /** the key `rekey` gives a deck; `newAssetKey` by default */
  newKey?: () => string;
  /** `delete` only: when the backup of the private store began (the CLI's `--i-have-a-backup`) */
  backupAt?: string;
  /**
   * a deployment whose public store another environment reads (select.ts `sharesPublicStore`):
   * the public store is only read, and `rollback` and `delete` refuse
   */
  sharedPublicStore?: boolean;
};

export type MigrationResult = {
  step: MigrationStep;
  /** the record's state when the call answered */
  state: StorageState;
  /** document writes are refused now: a freeze, or a switch before its writes open */
  frozen: boolean;
  /** the step has nothing left to do */
  done: boolean;
  /** the call found no row */
  clean: boolean;
  processed: number;
  remaining: number;
  /** the call's rows, at most ROWS_LISTED */
  rows: string[];
  rowCount: number;
  /** the documents of the plan (`plan`, `copy`, `verify`) */
  planned: number | null;
  settlesAt: string | null;
  expiresAt: string | null;
  switchedAt: string | null;
  /** how long the call's listings took */
  listMs: number | null;
  /** `copy` and `rollback`: documents copied per second in this call */
  perSecond: number | null;
  /** store calls tried again after a 429, a 5xx or a network error */
  retries: number;
  /** `rekey`: when a pass must begin to copy every twin written under a key this run replaced */
  rekeyAfter: string | null;
  /** one sentence of counts the step adds */
  note: string | null;
};

/**
 * The top level folders of the public store whose every object stays public: the keyed twins, the
 * picture avatars, the produced exports and bundles.
 */
export const PUBLIC_PREFIXES = ['d/', 'u/', 'exports/', 'bundles/'] as const;

/**
 * True for the paths that stay on the public store: PUBLIC_PREFIXES and the twins under a deck
 * (`decks/<id>/assets/`), which an `<img>` loads by URL. Every other path is a document, deck
 * folder or not, so a new prefix is a document unless PUBLIC_PREFIXES names it.
 */
export function isPublicPath(pathname: string): boolean {
  if (isPublicFolder(pathname)) return true;
  const match = /^decks\/[^/]+\/(.*)$/.exec(pathname);
  return match !== null && match[1] !== undefined && match[1].startsWith('assets/');
}

export function isPublicFolder(prefix: string): boolean {
  return PUBLIC_PREFIXES.some((folder) => prefix.startsWith(folder));
}

/** The migration's own records, which no listing of documents counts. */
export function isMigrationPath(pathname: string): boolean {
  return (
    pathname === MIGRATION_META ||
    pathname === MIGRATION_PROGRESS ||
    pathname.startsWith('migration/')
  );
}

/** Plain code unit order, the same on every machine (`localeCompare` is not). */
export function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function documentsOnly(entries: BlobEntry[]): BlobEntry[] {
  return entries
    .filter((entry) => !isPublicPath(entry.pathname) && !isMigrationPath(entry.pathname))
    .sort((a, b) => byPath(a.pathname, b.pathname));
}

/**
 * Every document of the public store in path order: the files at the top and a listing of each top
 * level folder but the public ones, so the root units (`users/`, `links/`, `templates/`,
 * `system/`, `index/`, `builds/`, `vitals/`, `decks/index.json`) move with the deck folders.
 */
export async function publicDocuments(
  legacy: BlobClient,
  options?: BlobCallOptions,
): Promise<BlobEntry[]> {
  const folders = (await legacy.folders('', options)).filter((folder) => !isPublicFolder(folder));
  const top =
    legacy.files !== undefined
      ? legacy.files('', options)
      : legacy.list('', options).then((all) => all.filter((e) => !e.pathname.includes('/')));
  const listed = await Promise.all([top, ...folders.map((folder) => legacy.list(folder, options))]);
  return documentsOnly(listed.flat());
}

/** Every document of the private store in path order: the whole store but the migration's records. */
export async function privateDocuments(
  documents: BlobClient,
  options?: BlobCallOptions,
): Promise<BlobEntry[]> {
  return documentsOnly(await documents.list('', options));
}

// ---------------------------------------------------------------------------------------------
// The layout record and the split client

/**
 * The layout record could not be read: no answer within LAYOUT_READ_MS, bytes that are no layout
 * record, or `meta.json` absent while the store holds or lists a migration record. The request
 * fails with 503 and nothing is cached; before HR-K1#4b a failed read read as v1.
 */
export class StorageLayoutError extends Error {
  readonly status = 503;
  readonly retryAfter = Math.ceil(LAYOUT_TTL_MS / 1000);
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageLayoutError';
  }
}

/**
 * A document write refused while the record is frozen, or on a deployment that shares the public
 * store before its own switch. The caller keeps what it meant to write and tries again after
 * `retryAfter` seconds; a route answers 503 (`status`; pulse.ts `isStoreBusy` reads `retryAfter`).
 */
export class StorageFrozenError extends Error {
  readonly status = 503;
  readonly retryAfter = FROZEN_RETRY_AFTER_S;
  constructor(message: string) {
    super(message);
    this.name = 'StorageFrozenError';
  }
}

/** True for a StorageFrozenError from any copy of this module (see blob-store.ts isBlobExistsError). */
export function isStorageFrozenError(error: unknown): error is StorageFrozenError {
  return error instanceof Error && error.name === 'StorageFrozenError';
}

export const FROZEN_SENTENCE =
  'Saving is paused while the documents move between stores; your changes are kept, try again in a minute';
const SHARED_SENTENCE =
  'This deployment shares the public store with production and saves documents only after its own switch (docs/hosting.md 10)';

export type Freeze = { since: number; settlesAt: number; expiresAt: number };

/** A layout record as read; times in ms. */
export type LayoutRecord = {
  state: StorageState;
  /** document writes are refused until `expiresAt`; null when not frozen */
  frozen: Freeze | null;
  /** document writes are refused before this time: a switch or a rollback's end; null for none */
  opensAt: number | null;
};

const UNPLANNED: LayoutRecord = { state: 'v1', frozen: null, opensAt: null };

/** True when the record refuses document writes at `now`, by a clock that may be skewed. */
export function closedAt(record: LayoutRecord, now: number): boolean {
  return (
    (record.frozen !== null && now < record.frozen.expiresAt) ||
    (record.opensAt !== null && now < record.opensAt)
  );
}

/**
 * The row a deployment from before HR-K1#4b finds in `failed`: its `cutover` refuses while `failed`
 * is not empty, and its `delete` walks the record's `decks`, which a new record never holds.
 */
export const OLDER_DEPLOYMENT_ROW = `${MIGRATION_META}: written by HR-K1#4b; run the step on a deployment that carries it`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iso = (ms: number): string => new Date(ms).toISOString();
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function recordOf(raw: Record<string, unknown>): LayoutRecord {
  if (raw.schemaVersion !== 1)
    throw new StorageLayoutError(`${MIGRATION_META} holds no layout record of schema version 1`);
  if (raw.state === undefined) {
    // the record of the dual read migration (before HR-K1#4b): its layout, its window, its rollback
    if (raw.layout === 'v2') return { state: 'v2', frozen: null, opensAt: null };
    if (raw.layout === 'v1') {
      const dual = raw.dualRead === true && raw.rollback !== true;
      return { state: dual ? 'dual' : 'v1', frozen: null, opensAt: null };
    }
    throw new StorageLayoutError(
      `${MIGRATION_META} holds the unknown layout ${String(raw.layout)}`,
    );
  }
  const state = STORAGE_STATES.find((known) => known === raw.state);
  if (state === undefined)
    throw new StorageLayoutError(`${MIGRATION_META} holds the unknown state ${String(raw.state)}`);
  const time = (value: unknown, what: string): number => {
    const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    if (Number.isNaN(ms)) throw new StorageLayoutError(`${MIGRATION_META} holds no time ${what}`);
    return ms;
  };
  const frozen = raw.frozen as Record<string, unknown> | null | undefined;
  return {
    state,
    frozen:
      frozen === undefined || frozen === null
        ? null
        : {
            since: time(frozen.since, 'since'),
            settlesAt: time(frozen.settlesAt, 'settlesAt'),
            expiresAt: time(frozen.expiresAt, 'expiresAt'),
          },
    opensAt: raw.opensAt === undefined ? null : time(raw.opensAt, 'opensAt'),
  };
}

/**
 * The bytes of a layout record. `writtenAt` gives every write its own bytes, and so its own etag.
 * `layout`, `dualRead`, `rollback` and `failed` are for deployments from before HR-K1#4b, which
 * read `layout` and `dualRead` alone and know no freeze: on a public store another environment
 * shares they read `v2` in every state, so such a deployment writes its own private store and
 * removes no public document; on a store of its own they read the state's layout.
 */
function layoutBytes(record: LayoutRecord, shared: boolean, writtenAt: number): Uint8Array {
  const { frozen, opensAt } = record;
  const body = {
    schemaVersion: 1,
    state: record.state,
    ...(frozen === null
      ? {}
      : {
          frozen: {
            since: iso(frozen.since),
            settlesAt: iso(frozen.settlesAt),
            expiresAt: iso(frozen.expiresAt),
          },
        }),
    ...(opensAt === null ? {} : { opensAt: iso(opensAt) }),
    writtenAt: iso(writtenAt),
    layout: shared || record.state === 'v2' ? 'v2' : 'v1',
    dualRead: false,
    rollback: false,
    failed: [OLDER_DEPLOYMENT_ROW],
  };
  return encoder.encode(`${JSON.stringify(body)}\n`);
}

/** One JSON object of the private store with its etag; null only when the store says it is absent. */
async function readVersioned(
  documents: BlobClient,
  pathname: string,
  signal: AbortSignal,
): Promise<{ raw: Record<string, unknown>; version: string } | null> {
  let fetched: { entry: BlobEntry; bytes: Uint8Array } | null;
  try {
    fetched = await documents.get(pathname, { signal });
  } catch (error) {
    throw new StorageLayoutError(`The private store did not answer the read of ${pathname}`, {
      cause: error,
    });
  }
  if (fetched === null) return null;
  try {
    const raw: unknown = JSON.parse(decoder.decode(fetched.bytes));
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
      return { raw: raw as Record<string, unknown>, version: fetched.entry.version };
  } catch {
    // answered below
  }
  throw new StorageLayoutError(`${pathname} in the private store is not a JSON object`);
}

/**
 * Rejects when the private store's root listing names `meta.json` or `migration.json`: a store that
 * ever held a migration record never reads an absent `meta.json` as `v1` (a 404 during an
 * overwrite answers both reads of a cold process; a listing is not emptied by an overwrite).
 */
async function recordsListed(documents: BlobClient, signal: AbortSignal): Promise<void> {
  let names: string[];
  try {
    const listed =
      documents.files !== undefined
        ? await documents.files('', { signal })
        : (
            await Promise.all(
              [MIGRATION_META, MIGRATION_PROGRESS].map((path) => documents.list(path, { signal })),
            )
          ).flat();
    names = listed.map((entry) => entry.pathname);
  } catch (error) {
    throw new StorageLayoutError('The private store did not answer the listing of its records', {
      cause: error,
    });
  }
  const held = names.find((name) => name === MIGRATION_META || name === MIGRATION_PROGRESS);
  if (held !== undefined)
    throw new StorageLayoutError(`${MIGRATION_META} read absent while the store lists ${held}`);
}

/**
 * The layout record of the private store with its etag (null when absent): a confirmed absence on a
 * store that never held a migration record, else StorageLayoutError.
 */
export async function readLayout(
  documents: BlobClient,
  signal: AbortSignal,
  seen = false,
): Promise<{ record: LayoutRecord; etag: string | null }> {
  const found = await readVersioned(documents, MIGRATION_META, signal);
  if (found !== null) return { record: recordOf(found.raw), etag: found.version };
  if (seen) throw new StorageLayoutError(`${MIGRATION_META} is absent after this process read it`);
  if ((await readVersioned(documents, MIGRATION_PROGRESS, signal)) !== null)
    throw new StorageLayoutError(`${MIGRATION_META} is absent while ${MIGRATION_PROGRESS} exists`);
  await recordsListed(documents, signal);
  return { record: UNPLANNED, etag: null };
}

/**
 * A process's reads of the layout, kept LAYOUT_TTL_MS from the time the read began and shared by
 * concurrent callers. A read that fails or answers after LAYOUT_READ_MS (an instance suspended
 * while it waited) rejects with StorageLayoutError and is not kept. The deadline is a timer of its
 * own, as in boundedBlobClient: at LAYOUT_READ_MS the call underneath is cancelled through its
 * signal and the shared read rejects whether or not that call ever answers. Every document call of
 * the split client waits on this read, so one store call that never settled held all of them on
 * the instance until it was recycled (the 96b4fb72 preview, 2026-10-16: every head and list of a
 * document met the 10 s deadline, and the requests that wait without one met the 300 s limit).
 */
export function layoutReader(
  documents: BlobClient,
  options: { ttlMs?: number; now?: () => number } = {},
): () => Promise<LayoutRecord> {
  const ttl = options.ttlMs ?? LAYOUT_TTL_MS;
  const clock = options.now ?? (() => Date.now());
  let cached: { at: number; value: LayoutRecord } | undefined;
  let pending: Promise<LayoutRecord> | undefined;
  // once a record was read, an absence is a read that failed (a 404 during an overwrite)
  let seen = false;
  const read = async (): Promise<LayoutRecord> => {
    const began = clock();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // no reason of its own: the SDK meets the plain AbortError (boundedBlobClient)
        controller.abort();
        reject(
          new StorageLayoutError(
            `the read of ${MIGRATION_META} did not answer within ${LAYOUT_READ_MS / 1000} s`,
          ),
        );
      }, LAYOUT_READ_MS);
      timer.unref?.();
    });
    const reading = readLayout(documents, controller.signal, seen);
    // the read that lost to the deadline settles unobserved
    reading.catch(() => undefined);
    let answer: { record: LayoutRecord; etag: string | null };
    try {
      answer = await Promise.race([reading, deadline]);
    } finally {
      clearTimeout(timer);
    }
    const { record, etag } = answer;
    if (clock() - began > LAYOUT_READ_MS)
      throw new StorageLayoutError(`the read of ${MIGRATION_META} answered after its deadline`);
    seen ||= etag !== null;
    cached = { at: began, value: record };
    return record;
  };
  return async () => {
    if (cached !== undefined && clock() - cached.at < ttl) return cached.value;
    pending ??= read().finally(() => (pending = undefined));
    return pending;
  };
}

/**
 * One client over the two stores (SPEC-3 2.2). Public paths go to the public store in every state
 * and never ask the layout. A document is read and listed on the public store in `v1`, on the
 * private store in `v2`, and on the private store first in `dual`. It is written and removed on the
 * public store in `v1` and on the private one otherwise, unless the record is closed (`closedAt`):
 * then the write throws StorageFrozenError. With `sharedPublicStore` (a preview) a document write
 * in `v1` is refused too, so such a deployment never writes or removes a public document. Every
 * document put and removal carries DOCUMENT_WRITE_CAP_MS, so the last write admitted before a
 * freeze lands within FREEZE_SETTLE_MS.
 */
export function splitBlobClient(
  clients: MigrationClients,
  options: { ttlMs?: number; now?: () => number; sharedPublicStore?: boolean } = {},
): BlobClient {
  const { legacy, documents } = clients;
  const clock = options.now ?? (() => Date.now());
  const layout = layoutReader(documents, options);
  const readers = async (): Promise<BlobClient[]> => {
    const { state } = await layout();
    return state === 'v1' ? [legacy] : state === 'v2' ? [documents] : [documents, legacy];
  };
  const writes = async (): Promise<BlobClient> => {
    const record = await layout();
    if (closedAt(record, clock())) throw new StorageFrozenError(FROZEN_SENTENCE);
    if (record.state === 'v1' && options.sharedPublicStore === true)
      throw new StorageFrozenError(SHARED_SENTENCE);
    return record.state === 'v1' ? legacy : documents;
  };
  const capped = (signal: AbortSignal | undefined): AbortSignal =>
    AbortSignal.any([AbortSignal.timeout(DOCUMENT_WRITE_CAP_MS), ...(signal ? [signal] : [])]);
  const first = async <T>(pathname: string, read: (client: BlobClient) => Promise<T | null>) => {
    if (isPublicPath(pathname)) return read(legacy);
    for (const client of await readers()) {
      const found = await read(client);
      if (found !== null) return found;
    }
    return null;
  };
  return {
    head: (pathname, options) => first(pathname, (client) => client.head(pathname, options)),
    get: (pathname, options) => first(pathname, (client) => client.get(pathname, options)),
    async list(prefix, options) {
      const from = await readers();
      if (from[0] === legacy) return legacy.list(prefix, options);
      const lists = await Promise.all([...from, legacy].map((c) => c.list(prefix, options)));
      const seen = new Map<string, BlobEntry>();
      // documents from the document stores, the first that holds one; public paths from the public store
      for (const entries of lists.slice(0, from.length))
        for (const entry of entries)
          if (!isPublicPath(entry.pathname) && !isMigrationPath(entry.pathname))
            if (!seen.has(entry.pathname)) seen.set(entry.pathname, entry);
      for (const entry of lists[from.length] ?? [])
        if (isPublicPath(entry.pathname)) seen.set(entry.pathname, entry);
      return [...seen.values()].sort((a, b) => byPath(a.pathname, b.pathname));
    },
    async folders(prefix, options) {
      const from = new Set([...(await readers()), legacy]);
      const lists = await Promise.all([...from].map((client) => client.folders(prefix, options)));
      return [...new Set(lists.flat())].filter((folder) => !isMigrationPath(folder)).sort();
    },
    async put(pathname, bytes, putOptions: BlobPutOptions) {
      if (isPublicPath(pathname)) return legacy.put(pathname, bytes, putOptions);
      const store = await writes();
      return store.put(pathname, bytes, { ...putOptions, signal: capped(putOptions.signal) });
    },
    async del(pathnames, options) {
      const own = pathnames.filter((pathname) => !isPublicPath(pathname));
      // a closed store refuses the whole removal before any of it happens
      const store = own.length > 0 ? await writes() : null;
      const published = pathnames.filter(isPublicPath);
      if (published.length > 0) await legacy.del(published, options);
      if (store !== null) await store.del(own, { ...options, signal: capped(options?.signal) });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The run's records

/**
 * The run's progress (`migration.json`), written by the steps alone over the etag read. `run` is
 * the ISO start of the run's freeze, `from` the state it froze. `busyUntil` is the lease: one call
 * at a time, and none while a write a call gave up on can still land. `copied` is the copy's
 * cursor in the plan, `failed` the planned paths a copy call could not copy, tried again first.
 */
export type MigrationProgress = {
  schemaVersion: 1;
  run?: string;
  from?: StorageState;
  busyUntil?: string;
  /** the last plan's counts; `run` when it is the plan of record */
  planned?: { at: string; run: string | null; count: number; bytes: number; listMs: number };
  copied?: number;
  failed?: string[];
  copiedAt?: string;
  verifiedAt?: string;
  switchedAt?: string;
  endedAt?: string;
  rekey?: { keyedUntil?: string; cleanFrom?: string; cursor?: string; passFrom?: string };
  rollback?: { run: string };
  rolledBackAt?: string;
  deleteStartedAt?: string;
};

/** The plan of record: [path, etag, size] per document, in path order. */
export type MigrationPlan = {
  schemaVersion: 1;
  run: string;
  takenAt: string;
  entries: [string, string, number][];
};

export const RECORD_CHANGED =
  'the migration record changed since this call read it (another call, or a rollback); run the step again';

/** A step the record's state refuses: 409, with the sentence that says what to run instead. */
export class MigrationRefusal extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'MigrationRefusal';
  }
}

type Call = {
  step: MigrationStep;
  legacy: BlobClient;
  documents: BlobClient;
  shared: boolean;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  options: MigrationOptions;
  concurrency: number;
  startedAt: number;
  endsAt: number;
  /** aborts the call's store calls at the end of its budget */
  signal: AbortSignal;
  layout: LayoutRecord;
  layoutEtag: string | null;
  progress: MigrationProgress;
  progressEtag: string | null;
  rows: string[];
  rowCount: number;
  retries: number;
  /** a store call of this call was cut by its budget: its write may still land */
  cut: boolean;
};

function refuse(message: string): never {
  throw new MigrationRefusal(message);
}

const recordSignal = () => AbortSignal.timeout(RECORD_WRITE_MS);

/** Writes one record over the etag the call read (absent: only while still absent). */
async function putRecord(
  documents: BlobClient,
  pathname: string,
  bytes: Uint8Array,
  etag: string | null,
): Promise<string> {
  try {
    const put = await documents.put(pathname, bytes, {
      overwrite: etag !== null,
      ...(etag === null ? {} : { ifMatch: etag }),
      contentType: 'application/json',
      signal: recordSignal(),
    });
    return put.version;
  } catch (error) {
    if (isBlobPreconditionError(error) || isBlobExistsError(error))
      throw new MigrationRefusal(RECORD_CHANGED);
    throw error;
  }
}

/** Writes a layout record as it stands, with no etag check: a test's or a rehearsal's setup. */
export async function putLayoutRecord(
  documents: BlobClient,
  record: Partial<LayoutRecord>,
  shared = false,
): Promise<void> {
  const bytes = layoutBytes({ ...UNPLANNED, ...record }, shared, Date.now());
  await documents.put(MIGRATION_META, bytes, { overwrite: true, contentType: 'application/json' });
}

async function writeLayout(call: Call, record: LayoutRecord): Promise<void> {
  const bytes = layoutBytes(record, call.shared, call.clock());
  call.layoutEtag = await putRecord(call.documents, MIGRATION_META, bytes, call.layoutEtag);
  call.layout = record;
}

async function writeProgress(call: Call): Promise<void> {
  const bytes = encoder.encode(`${JSON.stringify(call.progress)}\n`);
  call.progressEtag = await putRecord(call.documents, MIGRATION_PROGRESS, bytes, call.progressEtag);
}

async function readProgress(
  documents: BlobClient,
): Promise<{ progress: MigrationProgress; etag: string | null }> {
  const found = await readVersioned(documents, MIGRATION_PROGRESS, recordSignal());
  if (found === null) return { progress: { schemaVersion: 1 }, etag: null };
  return { progress: found.raw as MigrationProgress, etag: found.version };
}

async function readPlan(call: Call): Promise<MigrationPlan> {
  const got = await call.documents.get(MIGRATION_PLAN, { signal: recordSignal() });
  if (got === null) refuse('no plan of record; run plan after the freeze settles');
  return JSON.parse(decoder.decode(got.bytes)) as MigrationPlan;
}

function row(call: Call, line: string): void {
  call.rowCount += 1;
  if (call.rows.length < ROWS_LISTED) call.rows.push(line);
}

function answer(
  call: Call,
  fields: Partial<MigrationResult> & { done: boolean; processed: number },
): MigrationResult {
  const { frozen } = call.layout;
  return {
    step: call.step,
    state: call.layout.state,
    frozen: closedAt(call.layout, call.clock()),
    clean: call.rowCount === 0,
    remaining: 0,
    rows: call.rows,
    rowCount: call.rowCount,
    planned: call.progress.planned?.count ?? null,
    settlesAt: frozen === null ? null : iso(frozen.settlesAt),
    expiresAt: frozen === null ? null : iso(frozen.expiresAt),
    switchedAt: call.progress.switchedAt ?? null,
    listMs: null,
    perSecond: null,
    retries: call.retries,
    rekeyAfter: null,
    note: null,
    ...fields,
  };
}

/** True for a store answer worth trying again: a 429, a 5xx, a network error, the CDN's lag. */
function retryable(error: unknown): boolean {
  if (isBlobPreconditionError(error) || isBlobExistsError(error)) return false;
  return isStoreBusy(error) || error instanceof BlobStaleReadError;
}

/** A spread of 0.75 to 1.25 by the name, so workers refused together do not come back together. */
function spread(name: string, attempt: number): number {
  let hash = attempt;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return 0.75 + (hash % 1000) / 2000;
}

/** One store call, tried TRIES times on a retryable answer, never past the call's budget. */
async function tried<T>(call: Call, name: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (call.signal.aborted) call.cut = true;
      if (attempt >= TRIES || call.signal.aborted || !retryable(error)) throw error;
      const asked = storeRetryAfterMs(error);
      const wait = Math.round((asked ?? 250 * 2 ** attempt) * spread(name, attempt));
      if (call.clock() + wait >= call.endsAt) throw error;
      call.retries += 1;
      await call.sleep(wait);
    }
  }
}

/** The pool's stop: true once no item may start in the call's budget. */
const outOfBudget = (call: Call) => () => call.clock() >= call.endsAt - ITEM_RESERVE_MS;

/** Copies one document between the stores, checked by the etag the target answers. */
async function copyOne(
  call: Call,
  from: BlobClient,
  to: BlobClient,
  path: string,
  version: string | undefined,
): Promise<'copied' | 'absent'> {
  const signal = call.signal;
  const got = await tried(call, path, async () => {
    try {
      return await from.get(path, { signal, ...(version === undefined ? {} : { version }) });
    } catch (error) {
      // the other environment wrote the public document after the plan: the snapshot takes it
      if (call.shared && error instanceof BlobStaleReadError) return from.get(path, { signal });
      throw error;
    }
  });
  if (got === null) return 'absent';
  const put = await tried(call, path, () =>
    to.put(path, got.bytes, { overwrite: true, contentType: blobContentType(path), signal }),
  );
  if (put.version !== got.entry.version) {
    // a multipart upload's etag is not the body's md5: read the copy back and compare the bytes
    const back = await tried(call, path, () => to.get(path, { signal }));
    if (back === null || !sameBytes(back.bytes, got.bytes))
      throw new Error(`stored with etag ${put.version}, expected ${got.entry.version}`);
  }
  return 'copied';
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** What one call of `removeAll` removed, and how many of its paths are left for the next call. */
type Removal = { removed: number; left: number };

/**
 * Removes paths in batches of DELETE_BATCH, `inFlight` batches at a time, each tried as one store
 * call. No batch starts once the call's budget is out (`outOfBudget`). A batch the budget cut, or
 * one that failed TRIES times (a row), stays, and the answer counts it as left: each step lists
 * again on its next call. Before HR-K1#4b's fix the batches ran one after another with no budget
 * check, so a removal longer than the budget met the call's abort and the route answered 500
 * (production's `delete`, calls 2 to 6 on 2026-10-17).
 */
async function removeAll(
  call: Call,
  client: BlobClient,
  paths: string[],
  inFlight = DELETE_IN_FLIGHT,
): Promise<Removal> {
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += DELETE_BATCH)
    batches.push(paths.slice(i, i + DELETE_BATCH));
  const stop = outOfBudget(call);
  let removed = 0;
  await pool(
    batches,
    inFlight,
    async (batch) => {
      try {
        await tried(call, batch[0] ?? '', () => client.del(batch, { signal: call.signal }));
        removed += batch.length;
      } catch (error) {
        // a batch the budget ended is no fault of the store's: the next call removes it
        if (!call.signal.aborted && !stop())
          row(call, `${batch[0]} and ${batch.length - 1} more: not removed: ${messageOf(error)}`);
      }
    },
    stop,
  );
  return { removed, left: paths.length - removed };
}

// ---------------------------------------------------------------------------------------------
// The steps

const runOf = (call: Call): string | null =>
  call.layout.frozen === null ? null : iso(call.layout.frozen.since);

/**
 * The checks of every call inside the run's freeze (plan of record, copy, verify, switch): the
 * freeze is this run's, it settled, and more than FREEZE_MARGIN_MS of it is left. A freeze near
 * its end is ended here: an instance with a fast clock may already admit writes. Then the freeze
 * is moved FREEZE_HOLD_MS out, never past FREEZE_LIMIT_MS from its start.
 */
async function insideFreeze(call: Call, run = call.progress.run): Promise<Freeze> {
  const { frozen, state } = call.layout;
  const rollback = run !== undefined && run === call.progress.rollback?.run;
  if (frozen === null || (state === 'v2') !== rollback || run !== runOf(call))
    refuse('no freeze of this run; run freeze first');
  const now = call.clock();
  if (now < frozen.settlesAt)
    refuse(`the freeze settles at ${iso(frozen.settlesAt)}; run the step after it`);
  if (frozen.expiresAt - now < FREEZE_MARGIN_MS) {
    await endFreeze(call, 'its freeze came within 90 s of its end');
    refuse(
      `the freeze ends at ${iso(frozen.expiresAt)}; the run is over, start a new one with freeze`,
    );
  }
  const expiresAt = Math.min(frozen.since + FREEZE_LIMIT_MS, now + FREEZE_HOLD_MS);
  if (expiresAt - frozen.expiresAt > 60_000) {
    await writeLayout(call, { ...call.layout, frozen: { ...frozen, expiresAt } });
    return { ...frozen, expiresAt };
  }
  return frozen;
}

/** Ends a freeze before its switch: the state it froze, unfrozen, over the etag read. */
async function endFreeze(call: Call, why: string): Promise<void> {
  await writeLayout(call, { state: call.layout.state, frozen: null, opensAt: null });
  call.progress.endedAt = `${iso(call.clock())}: ${why}`;
}

/**
 * `plan`: every document of the public store with its etag, the private store's count beside it.
 * Outside a freeze it records the counts and the listing's time (the window's size). Inside a
 * settled freeze it writes the plan of record, which `copy` copies and `verify`, `rollback` and
 * `delete` read as the manifest of the switch.
 */
async function planStep(call: Call): Promise<MigrationResult> {
  if (call.layout.state === 'v2')
    refuse('the store switched to layout v2; there is nothing to plan');
  const frozen = call.layout.frozen !== null && call.clock() < call.layout.frozen.expiresAt;
  if (frozen) await insideFreeze(call);
  const began = call.clock();
  const [listed, own] = await Promise.all([
    publicDocuments(call.legacy, { signal: call.signal }),
    privateDocuments(call.documents, { signal: call.signal }),
  ]);
  const listMs = call.clock() - began;
  const run = frozen ? runOf(call) : null;
  const bytes = listed.reduce((sum, entry) => sum + entry.size, 0);
  if (run !== null) {
    const plan: MigrationPlan = {
      schemaVersion: 1,
      run,
      takenAt: iso(call.clock()),
      entries: listed.map((entry) => [entry.pathname, entry.version, entry.size]),
    };
    const bytes = encoder.encode(JSON.stringify(plan));
    await tried(call, MIGRATION_PLAN, () =>
      call.documents.put(MIGRATION_PLAN, bytes, {
        overwrite: true,
        contentType: 'application/json',
        signal: AbortSignal.timeout(RECORD_WRITE_MS * 3),
      }),
    );
    call.progress = { ...call.progress, copied: 0, failed: [] };
    delete call.progress.copiedAt;
    delete call.progress.verifiedAt;
  }
  call.progress.planned = { at: iso(began), run, count: listed.length, bytes, listMs };
  const note = `${run === null ? 'counts' : 'the plan of record'}: ${listed.length} public documents of ${bytes} bytes listed in ${listMs} ms; the private store holds ${own.length}`;
  return answer(call, { done: true, processed: listed.length, listMs, note });
}

/**
 * `freeze`: a new run. The record keeps its state and refuses every document write until
 * `expiresAt`; the run's other calls wait for `settlesAt`, past every write an instance admitted
 * before it read the frozen record (FREEZE_SETTLE_MS).
 */
async function freezeStep(call: Call): Promise<MigrationResult> {
  const { state, frozen } = call.layout;
  if (state === 'v2')
    refuse('the store switched to layout v2 already; rollback runs its own freeze');
  const now = call.clock();
  if (frozen !== null && now < frozen.expiresAt)
    refuse(`a freeze runs until ${iso(frozen.expiresAt)}; run unfreeze to end it`);
  const settlesAt = now + RECORD_WRITE_MS + FREEZE_SETTLE_MS;
  const next = { since: now, settlesAt, expiresAt: settlesAt + FREEZE_HOLD_MS };
  const { busyUntil } = call.progress;
  call.progress = {
    schemaVersion: 1,
    run: iso(now),
    from: state,
    ...(busyUntil ? { busyUntil } : {}),
  };
  await writeProgress(call);
  await writeLayout(call, { state, frozen: next, opensAt: null });
  return answer(call, { done: true, processed: 0 });
}

/**
 * `copy`: the plan of record's documents from the cursor, DEFAULT_CONCURRENCY in flight, each a
 * get of the planned etag and a put with `overwrite`, checked by the etag the private store
 * answers; never a write of the public store. The first call removes from the private store each
 * document the plan does not name (a copy of an earlier run whose public document left since),
 * except on a shared store, where the private store is the preview's own. A call that reaches its
 * budget stores the cursor; a document that failed TRIES times is a row and is tried first by the
 * next call.
 */
async function copyStep(call: Call): Promise<MigrationResult> {
  const freeze = await insideFreeze(call);
  const plan = await readPlan(call);
  if (plan.run !== call.progress.run || Date.parse(plan.takenAt) < freeze.settlesAt)
    refuse('the plan of record is not of this freeze; run plan');
  const progress = call.progress;
  let cursor = progress.copied ?? 0;
  if (cursor === 0 && (progress.failed ?? []).length === 0 && !call.shared) {
    const planned = new Set(plan.entries.map(([path]) => path));
    const extra = (await privateDocuments(call.documents, { signal: call.signal }))
      .map((entry) => entry.pathname)
      .filter((path) => !planned.has(path));
    const { left } = await removeAll(call, call.documents, extra);
    // the cursor stays at 0, so the next call lists the private store and removes them first
    if (left > 0)
      return answer(call, {
        done: false,
        processed: 0,
        remaining: plan.entries.length,
        note: `${left} private documents the plan does not name are left to remove; the next call removes them before it copies`,
      });
  }
  const version = new Map(plan.entries.map(([path, etag]) => [path, etag]));
  const retry = progress.failed ?? [];
  const work = [...retry, ...plan.entries.slice(cursor).map(([path]) => path)];
  const done = new Set<string>();
  const failed: string[] = [];
  const began = call.clock();
  const left = await pool(
    work,
    call.concurrency,
    async (path) => {
      try {
        const outcome = await copyOne(call, call.legacy, call.documents, path, version.get(path));
        if (outcome === 'absent' && !call.shared)
          throw new Error('absent from the public store, which the freeze holds still');
        done.add(path);
      } catch (error) {
        failed.push(path);
        row(call, `${path}: ${messageOf(error)}`);
      }
    },
    outOfBudget(call),
  );
  const failedNow = new Set(failed);
  const finished = (path: string) => done.has(path) || failedNow.has(path);
  while (cursor < plan.entries.length && finished(plan.entries[cursor]?.[0] ?? '')) cursor += 1;
  const tail = new Set(plan.entries.slice(cursor).map(([path]) => path));
  // a retried path the budget did not reach stays listed; one past the cursor is in the tail
  progress.failed = [...new Set([...retry.filter((path) => !done.has(path)), ...failed])].filter(
    (path) => !tail.has(path),
  );
  progress.copied = cursor;
  const remaining = plan.entries.length - cursor + progress.failed.length;
  if (remaining === 0) progress.copiedAt = iso(call.clock());
  const seconds = Math.max(1, call.clock() - began) / 1000;
  return answer(call, {
    done: remaining === 0,
    processed: done.size,
    remaining,
    perSecond: Math.round(done.size / seconds),
    note: left > 0 ? `the budget ended with ${left} documents not started` : null,
  });
}

/** One difference between the plan and a store's listing, as a row. */
function differs(path: string, planned?: string, entry?: BlobEntry): string | null {
  if (entry?.version === planned) return null;
  return `${path}: planned ${planned ?? 'absent'}, found ${entry?.version ?? 'absent'}`;
}

/**
 * `verify`. Before the switch, inside the freeze, a listing after the copy's last put: every
 * planned document has a private copy with the planned etag (Vercel Blob's etag is the md5 of the
 * body), and nothing else differs: the public store still holds the plan exactly, and the private
 * store holds nothing else. On a shared store the public documents the other environment wrote,
 * added or removed since the plan, and the preview's own documents, are counted, not rows. A
 * verify with rows ends the freeze by itself. After the switch it names each public document a v1
 * writer changed or added since (`delete` keeps them).
 */
async function verifyStep(call: Call): Promise<MigrationResult> {
  if (call.layout.state === 'v2') return verifyAfterSwitch(call);
  await insideFreeze(call);
  const copiedAt = call.progress.copiedAt;
  if (copiedAt === undefined) refuse('the copy is not done; run copy until it answers done');
  const listFrom = Date.parse(copiedAt) + LIST_LAG_MS;
  if (call.clock() < listFrom)
    refuse(`the listings show the copy's last put from ${iso(listFrom)}; run verify after it`);
  const plan = await readPlan(call);
  const began = call.clock();
  const [published, own] = await Promise.all([
    publicDocuments(call.legacy, { signal: call.signal }),
    privateDocuments(call.documents, { signal: call.signal }),
  ]);
  const listMs = call.clock() - began;
  const ofPublic = new Map(published.map((entry) => [entry.pathname, entry]));
  const ofPrivate = new Map(own.map((entry) => [entry.pathname, entry]));
  const planned = new Map(plan.entries.map(([path, etag]) => [path, etag]));
  let other = 0;
  for (const [path, etag] of planned) {
    const mine = ofPrivate.get(path);
    const now = ofPublic.get(path);
    // the public copy changed or left since the plan: on a shared store, the other environment
    // wrote it, and the copy holds one of its versions or none, which the snapshot takes
    const moved = now?.version !== etag;
    if (call.shared && moved) other += 1;
    else if (mine?.version !== etag) row(call, `private ${differs(path, etag, mine)}`);
    else if (moved) row(call, `public ${differs(path, etag, now)}`);
  }
  if (!call.shared) {
    for (const path of ofPublic.keys())
      if (!planned.has(path)) row(call, `public ${path}: not planned`);
    for (const path of ofPrivate.keys())
      if (!planned.has(path)) row(call, `private ${path}: not planned`);
  }
  const note = call.shared
    ? `${other} planned documents the other environment changed or removed since the plan; ${published.filter((e) => !planned.has(e.pathname)).length} more public documents; ${own.length} private documents`
    : null;
  if (call.rowCount === 0) call.progress.verifiedAt = iso(call.clock());
  else await endFreeze(call, `verify found ${call.rowCount} differences`);
  return answer(call, { done: call.rowCount === 0, processed: planned.size, listMs, note });
}

/** `verify` on v2: the public documents that differ from the plan of the switch. */
async function verifyAfterSwitch(call: Call): Promise<MigrationResult> {
  const switchedAt = afterSwitch(call, 'verify');
  const plan = await readPlan(call);
  const planned = new Map(plan.entries.map(([path, etag]) => [path, etag]));
  const began = call.clock();
  const published = await publicDocuments(call.legacy, { signal: call.signal });
  for (const entry of published) {
    const line = differs(entry.pathname, planned.get(entry.pathname), entry);
    if (line !== null)
      row(call, `${line}; written on the public store since the switch at ${switchedAt}`);
  }
  call.progress.verifiedAt = iso(call.clock());
  return answer(call, { done: true, processed: published.length, listMs: call.clock() - began });
}

/**
 * `switch`: one write of the record, `v2` and not frozen, over the etag of the freeze the run's
 * verify read, with document writes open OPEN_AFTER_MS later, so no instance writes the private
 * store while another still reads the public one.
 */
async function switchStep(call: Call): Promise<MigrationResult> {
  await insideFreeze(call);
  const { copiedAt, verifiedAt } = call.progress;
  if (verifiedAt === undefined || copiedAt === undefined || verifiedAt <= copiedAt)
    refuse('no clean verify after the last copy of this run; run verify');
  const now = call.clock();
  call.progress.switchedAt = iso(now);
  await writeProgress(call);
  await writeLayout(call, { state: 'v2', frozen: null, opensAt: now + OPEN_AFTER_MS });
  return answer(call, { done: true, processed: 0 });
}

/**
 * `unfreeze`: ends a freeze and keeps the state, an expired one included: a run that failed
 * before its switch goes back to the state it froze, and a rollback that failed stays on v2. It
 * takes no lease, so it ends a freeze while another call runs; that call's next record write meets
 * RECORD_CHANGED.
 */
async function unfreezeStep(call: Call): Promise<MigrationResult> {
  if (call.layout.frozen !== null) await endFreeze(call, 'unfreeze');
  return answer(call, { done: true, processed: 0 });
}

/** The switch's time, or a refusal on a store that did not switch. */
function afterSwitch(call: Call, what: string): string {
  const { switchedAt } = call.progress;
  if (call.layout.state !== 'v2' || switchedAt === undefined)
    refuse(`${what} runs on layout v2 after a recorded switch`);
  return switchedAt;
}

/**
 * `rollback`, after the switch and before `delete`, on a store of its own: the first call freezes
 * v2; the calls after the settle copy to the public store every private document whose etag it
 * lacks, remove from it each document of the plan the private store no longer holds, and then
 * write `v1` with writes open OPEN_AFTER_MS later. A public document neither store explains (a v1
 * writer after the switch) is replaced or kept, with a row.
 */
async function rollbackStep(call: Call): Promise<MigrationResult> {
  if (call.shared)
    refuse(
      "rollback runs on production alone: this deployment shares the public store, whose documents are production's",
    );
  if (call.progress.deleteStartedAt !== undefined)
    refuse(
      `delete began at ${call.progress.deleteStartedAt}; the private store and the backup hold the documents now`,
    );
  const switchedAt = afterSwitch(call, 'rollback');
  const waiting = rekeyWait(call.progress);
  if (waiting !== null) refuse(waiting);
  const { frozen } = call.layout;
  const now = call.clock();
  if (
    frozen === null ||
    now >= frozen.expiresAt ||
    call.progress.rollback?.run !== iso(frozen.since)
  ) {
    const settlesAt = now + RECORD_WRITE_MS + FREEZE_SETTLE_MS;
    call.progress.rollback = { run: iso(now) };
    await writeProgress(call);
    await writeLayout(call, {
      state: 'v2',
      frozen: { since: now, settlesAt, expiresAt: settlesAt + FREEZE_HOLD_MS },
      opensAt: null,
    });
    return answer(call, { done: false, processed: 0 });
  }
  await insideFreeze(call, call.progress.rollback.run);
  const plan = await readPlan(call);
  const planned = new Map(plan.entries.map(([path, etag]) => [path, etag]));
  const began = call.clock();
  const [own, published] = await Promise.all([
    privateDocuments(call.documents, { signal: call.signal }),
    publicDocuments(call.legacy, { signal: call.signal }),
  ]);
  const listMs = call.clock() - began;
  const ofPublic = new Map(published.map((entry) => [entry.pathname, entry]));
  const ofPrivate = new Set(own.map((entry) => entry.pathname));
  const after = Date.parse(switchedAt);
  const stray = (entry: BlobEntry | undefined) =>
    entry !== undefined &&
    entry.version !== planned.get(entry.pathname) &&
    Date.parse(entry.uploadedAt ?? '') >= after;
  const copies = own.filter((entry) => ofPublic.get(entry.pathname)?.version !== entry.version);
  for (const entry of copies)
    if (stray(ofPublic.get(entry.pathname)))
      row(call, `${entry.pathname}: a v1 write since the switch, replaced by the v2 one`);
  const removals: string[] = [];
  for (const entry of published) {
    if (ofPrivate.has(entry.pathname)) continue;
    if (planned.get(entry.pathname) === entry.version) removals.push(entry.pathname);
    else row(call, `${entry.pathname}: a v1 write since the switch, kept`);
  }
  let copied = 0;
  let failures = 0;
  const left = await pool(
    copies,
    call.concurrency,
    async (entry) => {
      try {
        await copyOne(call, call.documents, call.legacy, entry.pathname, entry.version);
        copied += 1;
      } catch (error) {
        failures += 1;
        row(call, `${entry.pathname}: not copied back: ${messageOf(error)}`);
      }
    },
    outOfBudget(call),
  );
  // v1 is written only once every removal landed: a planned document left on the public store
  // would read again there as the document v2 removed
  const removal =
    left === 0 && failures === 0 ? await removeAll(call, call.legacy, removals) : null;
  const done = removal !== null && removal.left === 0;
  if (done) {
    call.progress.rolledBackAt = iso(call.clock());
    await writeLayout(call, { state: 'v1', frozen: null, opensAt: call.clock() + OPEN_AFTER_MS });
  }
  const seconds = Math.max(1, call.clock() - began) / 1000;
  return answer(call, {
    done,
    processed: copied + (removal?.removed ?? 0),
    remaining: left + failures + (removal?.left ?? removals.length),
    listMs,
    perSecond: Math.round(copied / seconds),
  });
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Why `delete` may not run now, or null (docs/hosting.md 10): after it the private store and the
 * backup hold the only copies, so it runs on a store of its own, on v2 not frozen, after a verify
 * on v2 and a clean rekey, 3 hours after the switch, with the time a backup of the private store
 * began after the switch.
 */
export function deleteRefusal(
  progress: MigrationProgress,
  record: LayoutRecord,
  options: { now: number; backupAt?: string; sharedPublicStore?: boolean },
): string | null {
  if (options.sharedPublicStore === true)
    return "delete runs on production alone: this deployment shares the public store with production, so the documents it would remove are production's";
  const { switchedAt, verifiedAt } = progress;
  if (record.state !== 'v2' || closedAt(record, options.now) || switchedAt === undefined)
    return 'delete runs on layout v2, not frozen, after a recorded switch';
  if (verifiedAt === undefined || verifiedAt <= switchedAt)
    return 'run verify on layout v2 first: delete keeps the documents it names';
  if (progress.rekey?.cleanFrom === undefined || rekeyAfter(progress) !== null)
    return 'run rekey until a pass is clean after its settle: delete removes the old twins of keyed decks';
  const switched = Date.parse(switchedAt);
  if (options.now < switched + DELETE_AFTER_SWITCH_MS)
    return `delete waits ${DELETE_AFTER_SWITCH_MS / 3_600_000} hours after the switch at ${switchedAt}: from ${iso(switched + DELETE_AFTER_SWITCH_MS)}`;
  const { backupAt } = options;
  if (backupAt === undefined)
    return 'pass --i-have-a-backup <ISO time>, the time the backup of the private store began, after the switch';
  const backup = ISO_TIME.test(backupAt) ? Date.parse(backupAt) : Number.NaN;
  if (Number.isNaN(backup))
    return `--i-have-a-backup wants an ISO time with its zone, such as 2026-10-16T04:00:00Z; got ${backupAt}`;
  if (backup <= switched)
    return `the backup began at ${backupAt}, at or before the switch at ${switchedAt}; take one that begins after it`;
  if (backup > options.now) return `the backup time ${backupAt} is later than now`;
  return null;
}

/**
 * `delete`: first, per deck folder of the public store whose private record holds a key of its own
 * (not the public record's), the twins at the old place `decks/<id>/assets/` that the key lacks are
 * copied under it, then the old place leaves once the key holds every one of its names (else the
 * deck is a row and keeps them); then each public document whose etag is the plan's
 * leaves in batches (`removeAll`, inside the call's budget), and any other stays with a row. A call
 * whose budget ends first answers `done: false` with the count left. Each call lists again, so it
 * resumes anywhere.
 */
async function deleteStep(call: Call): Promise<MigrationResult> {
  const refusal = deleteRefusal(call.progress, call.layout, {
    now: call.clock(),
    ...(call.options.backupAt === undefined ? {} : { backupAt: call.options.backupAt }),
    sharedPublicStore: call.shared,
  });
  if (refusal !== null) refuse(refusal);
  if (call.progress.deleteStartedAt === undefined) {
    // stored before the first removal: from it on rollback refuses
    call.progress.deleteStartedAt = iso(call.clock());
    await writeProgress(call);
  }
  const old = new Map<string, string[]>();
  for (const entry of await call.legacy.list('decks/', { signal: call.signal })) {
    const twin = DECK_TWIN.exec(entry.pathname);
    if (twin !== null) old.set(twin[1] ?? '', [...(old.get(twin[1] ?? '') ?? []), entry.pathname]);
  }
  let processed = 0;
  let failures = 0;
  let unfinished = 0;
  const left = await pool(
    [...old.keys()],
    Math.min(call.concurrency, 8),
    async (deckId) => {
      try {
        const stored = await recordIn(call.documents, deckId);
        if (stored === null || !hasOwnAssetKey(stored.record)) return;
        const key = stored.record.assetKey;
        if (key === (await publishedKey(call.legacy, deckId))) return;
        const held = await copyTwins(call, deckId, key, [`${deckPrefix(deckId)}assets/`]);
        // an old twin leaves only once its name is under the key: copyTwins skips a twin whose
        // public read answered nothing (the CDN can cache a miss), and no backup holds the twins
        const paths = old.get(deckId) ?? [];
        const lacking = paths.filter((path) => !held.has(path.slice(deckPrefix(deckId).length)));
        if (lacking.length > 0)
          throw new Error(
            `${lacking.length} not under the key yet (${lacking.slice(0, 3).join(', ')}); the next call tries again`,
          );
        // one batch at a time per deck: eight decks in flight are already eight removals
        const removal = await removeAll(call, call.legacy, paths, 1);
        processed += removal.removed;
        if (removal.left > 0) unfinished += 1;
      } catch (error) {
        failures += 1;
        row(call, `${deckId}: its old twins stay: ${messageOf(error)}`);
      }
    },
    outOfBudget(call),
  );
  if (left > 0 || failures > 0 || unfinished > 0)
    return answer(call, { done: false, processed, remaining: left + failures + unfinished });
  const plan = await readPlan(call);
  const planned = new Map(plan.entries.map(([path, etag]) => [path, etag]));
  const removable: string[] = [];
  for (const entry of await publicDocuments(call.legacy, { signal: call.signal })) {
    const line = differs(entry.pathname, planned.get(entry.pathname), entry);
    if (line === null) removable.push(entry.pathname);
    else row(call, `${line}; delete kept it`);
  }
  const removal = await removeAll(call, call.legacy, removable);
  return answer(call, {
    done: removal.left === 0,
    processed: processed + removal.removed,
    remaining: removal.left,
    note:
      removal.left === 0
        ? null
        : `${removal.left} of ${removable.length} public documents of the plan are left; the next call lists them again`,
  });
}

// ---------------------------------------------------------------------------------------------
// rekey (K1#4): a key of the environment's own for every deck

async function deckIds(client: BlobClient): Promise<string[]> {
  const ids = (await client.folders('decks/')).map((f) => /^decks\/([^/]+)\/$/.exec(f)?.[1]);
  return ids.filter((id): id is string => id !== undefined).sort(byPath);
}

/** A deck's record in one store: null only when the store says it is absent. */
async function recordIn(client: BlobClient, deckId: string) {
  const path = `${deckPrefix(deckId)}${ACCESS_FILE}`;
  const got = await client.get(path);
  return got === null
    ? null
    : { record: parseAccessRecord(got.bytes, path), etag: got.entry.version };
}

/** The key the public record holds of its own, which anyone could read by URL on v1; else null. */
async function publishedKey(legacy: BlobClient, deckId: string): Promise<string | null> {
  const record = (await recordIn(legacy, deckId))?.record ?? null;
  return record !== null && hasOwnAssetKey(record) ? record.assetKey : null;
}

/**
 * Copies under `d/<id>/<key>/` each twin the source prefixes hold that the key lacks, with
 * `overwrite: false`: a twin's name carries its digest, so the same name is the same bytes.
 * Answers the names the key holds after it (`assets/<name>` for the old place); a twin whose read
 * answered nothing is not among them.
 */
async function copyTwins(
  call: Call,
  deckId: string,
  key: string,
  sources: string[],
): Promise<Set<string>> {
  const target = keyedTwinPrefix(deckId, key);
  const signal = call.signal;
  const held = new Set(
    (await call.legacy.list(target, { signal })).map((e) => e.pathname.slice(target.length)),
  );
  for (const source of sources) {
    for (const entry of await call.legacy.list(source, { signal })) {
      const rest = entry.pathname.slice(source.length);
      const name = source.startsWith('d/') ? rest : `assets/${rest}`;
      if (held.has(name)) continue;
      const got = await tried(call, entry.pathname, () =>
        call.legacy.get(entry.pathname, { signal }),
      );
      if (got === null) continue;
      try {
        await tried(call, entry.pathname, () =>
          call.legacy.put(`${target}${name}`, got.bytes, {
            overwrite: false,
            contentType: blobContentType(entry.pathname),
            signal,
          }),
        );
      } catch (error) {
        if (!isBlobExistsError(error)) throw error;
      }
      held.add(name);
    }
  }
  return held;
}

/**
 * After rekey replaced a key, how long an instance may still write a twin under the old one: its
 * cache (TWIN_KEY_TTL_MS), a write admitted at its end (DOCUMENT_WRITE_CAP_MS) and LANDING_MS.
 */
export const REKEY_SETTLE_MS = 10 * 60_000 + DOCUMENT_WRITE_CAP_MS + LANDING_MS;

/** Why the rollback waits for a rekey pass, or null. */
function rekeyWait(progress: MigrationProgress): string | null {
  const after = rekeyAfter(progress);
  if (after === null) return null;
  return `rekey replaced keys until ${progress.rekey?.keyedUntil}; run rekey from ${iso(after)} until a pass is clean, then rollback`;
}

function rekeyAfter(progress: MigrationProgress): number | null {
  const { keyedUntil, cleanFrom } = progress.rekey ?? {};
  if (keyedUntil === undefined) return null;
  const from = Date.parse(keyedUntil) + REKEY_SETTLE_MS;
  return cleanFrom !== undefined && Date.parse(cleanFrom) >= from ? null : from;
}

/**
 * `rekey` (v2): every deck folder of the private store from the pass's cursor. A deck whose private
 * record holds the public record's key, or none, gets a new random key (the environment's own: the
 * preview's are not production's, and neither is one anyone read by URL on v1); its twins, from the
 * old place and from under the public record's key, are copied under the new key, then the key is
 * written to the private record over the etag read. A deck that holds a key of its own gets the
 * twins its key lacks (one an instance wrote under the old key from its cache). A pass that began
 * REKEY_SETTLE_MS after the last key it wrote and ended clean closes the rekey (`rekeyAfter`).
 */
async function rekeyStep(call: Call): Promise<MigrationResult> {
  afterSwitch(call, 'rekey');
  if (closedAt(call.layout, call.clock())) refuse('the store is frozen; rekey runs on v2 open');
  const state = { ...call.progress.rekey };
  const newKey = call.options.newKey ?? newAssetKey;
  const decks = (await deckIds(call.documents)).filter(
    (id) => state.cursor === undefined || id > state.cursor,
  );
  if (state.cursor === undefined) state.passFrom = iso(call.clock());
  // stored before the call writes its first key: every key it writes lands before this bound
  let bound: Promise<void> | undefined;
  const beforeKeys = () =>
    (bound ??= (async () => {
      const until = iso(call.endsAt + RECORD_WRITE_MS + LANDING_MS);
      if ((call.progress.rekey?.keyedUntil ?? '') >= until) return;
      call.progress.rekey = { ...call.progress.rekey, keyedUntil: until };
      state.keyedUntil = until;
      await writeProgress(call);
    })());
  let failures = 0;
  const done = new Set<string>();
  const left = await pool(
    decks,
    Math.min(call.concurrency, 8),
    async (deckId) => {
      try {
        const stored = await recordIn(call.documents, deckId);
        if (stored !== null) {
          const published = await publishedKey(call.legacy, deckId);
          const own = hasOwnAssetKey(stored.record) ? stored.record.assetKey : null;
          const sources = [`${deckPrefix(deckId)}assets/`];
          if (published !== null) sources.push(keyedTwinPrefix(deckId, published));
          if (own !== null && own !== published) {
            await copyTwins(call, deckId, own, sources);
          } else {
            const key = newKey();
            await copyTwins(call, deckId, key, sources);
            await beforeKeys();
            await blobAccessStore(call.documents).write(
              deckId,
              { ...stored.record, assetKey: key },
              { ifMatch: stored.etag },
            );
          }
        }
        done.add(deckId);
      } catch (error) {
        failures += 1;
        row(call, `${deckId}: ${messageOf(error)}`);
      }
    },
    outOfBudget(call),
  );
  if (left > 0) {
    // the cursor: the deck before the first one not done; a later deck done here is done again
    const first = decks.findIndex((id) => !done.has(id));
    if (first > 0) state.cursor = decks[first - 1];
  } else {
    delete state.cursor;
    if (failures === 0 && state.passFrom !== undefined) state.cleanFrom = state.passFrom;
  }
  call.progress.rekey = state;
  const after = rekeyAfter(call.progress);
  return answer(call, {
    done: left === 0 && failures === 0,
    processed: done.size,
    remaining: left + failures,
    rekeyAfter: after === null ? null : iso(after),
  });
}

// ---------------------------------------------------------------------------------------------
// One call

const STEPS: Record<MigrationStep, (call: Call) => Promise<MigrationResult>> = {
  plan: planStep,
  freeze: freezeStep,
  copy: copyStep,
  verify: verifyStep,
  switch: switchStep,
  unfreeze: unfreezeStep,
  rekey: rekeyStep,
  rollback: rollbackStep,
  delete: deleteStep,
};

/**
 * One call of a step. Every step but `unfreeze` takes the lease in `migration.json` first (after a
 * layout record exists, so the store never holds `migration.json` without `meta.json`), and gives
 * it back when it answers, held LANDING_MS longer when the budget cut a write.
 */
export async function runMigrationStep(
  clients: MigrationClients,
  step: MigrationStep,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const clock = options.clock ?? (() => Date.now());
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = clock();
  const { record, etag } = await readLayout(clients.documents, recordSignal());
  const { progress, etag: progressEtag } = await readProgress(clients.documents);
  const call: Call = {
    step,
    ...clients,
    shared: options.sharedPublicStore === true,
    clock,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    options,
    concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, options.concurrency ?? DEFAULT_CONCURRENCY)),
    startedAt,
    endsAt: startedAt + budget,
    signal: (options.abortAfter ?? ((ms) => AbortSignal.timeout(ms)))(budget),
    layout: record,
    layoutEtag: etag,
    progress,
    progressEtag,
    rows: [],
    rowCount: 0,
    retries: 0,
    cut: false,
  };
  if (step === 'unfreeze') {
    const result = await unfreezeStep(call);
    // best effort: a call still running holds the progress, and its next record write fails
    if (call.progress.endedAt !== undefined) await writeProgress(call).catch(() => undefined);
    return result;
  }
  const busy = Date.parse(progress.busyUntil ?? '');
  if (busy > startedAt)
    refuse(
      `another call holds the migration until ${progress.busyUntil}; run the step again after it`,
    );
  if (call.layoutEtag === null) await writeLayout(call, UNPLANNED);
  call.progress.busyUntil = iso(startedAt + budget + LEASE_MARGIN_MS);
  await writeProgress(call);
  try {
    return await STEPS[step](call);
  } finally {
    if (call.cut) call.progress.busyUntil = iso(clock() + LANDING_MS);
    else delete call.progress.busyUntil;
    await writeProgress(call).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// The keyed twins (hardening K1#3, DATA-2; docs/hardening/HARDENING.md 4.1)

/** A deck's own key, or null for a deck whose twins keep `decks/<id>/assets/`. */
export type TwinKeyOf = (deckId: string) => Promise<string | null>;

/** How long a process trusts a deck's key it read; a deck without a key is asked again sooner. */
export const TWIN_KEY_TTL_MS = 10 * 60_000;
export const TWIN_NO_KEY_TTL_MS = 60_000;

/**
 * The key reader the keyed client asks: a deck's record, read once and kept for a while. A read
 * that fails is not kept, and the twin call that asked fails with it, so a twin is never written
 * to the wrong place on a store that did not answer.
 */
export function twinKeyResolver(
  read: (deckId: string) => Promise<{ deckId: string; assetKey: string } | null>,
  options: { now?: () => number } = {},
): TwinKeyOf & { forget: (deckId: string) => void } {
  const clock = options.now ?? (() => Date.now());
  const known = new Map<string, { key: string | null; at: number }>();
  const pending = new Map<string, Promise<string | null>>();
  const resolve = async (deckId: string): Promise<string | null> => {
    const hit = known.get(deckId);
    const at = clock();
    if (
      hit !== undefined &&
      at - hit.at < (hit.key === null ? TWIN_NO_KEY_TTL_MS : TWIN_KEY_TTL_MS)
    )
      return hit.key;
    const inflight = pending.get(deckId);
    if (inflight !== undefined) return inflight;
    const next = read(deckId)
      .then((record) => {
        const key = record !== null && hasOwnAssetKey(record) ? record.assetKey : null;
        known.set(deckId, { key, at: clock() });
        return key;
      })
      .finally(() => pending.delete(deckId));
    pending.set(deckId, next);
    return next;
  };
  return Object.assign(resolve, { forget: (deckId: string) => void known.delete(deckId) });
}

const DECK_TWIN = /^decks\/([^/]+)\/(assets\/.+)$/;
const DECK_FOLDER = /^decks\/([^/]+)\/(.*)$/;

/**
 * One client in which a keyed deck's twins live at `d/<id>/<assetKey>/assets/<file>` while every
 * caller keeps naming them `decks/<id>/assets/<file>` (hardening K1#3): the store's twin writes,
 * its pull, its removal and the assets route reach the keyed place with no change of their own. A
 * twin a deck holds at its old place is read there until `delete` moves it. Answers carry the
 * caller's pathname and the object's own URL. A removal reads each deck's key fresh
 * (`freshKeyOf`) before it removes and again after, so a key `rekey` wrote meanwhile loses the
 * twin too.
 *
 * `sharedKeyOf`, on a deployment that shares the public store (a preview; HR-K1#4b): the key of the
 * deck's public record, read at each removal. There a twin removed by name leaves only from under a
 * key of the deployment's own, never from the old place and never from under the public record's
 * key, which production's manifest may still name.
 */
export function keyedTwinsClient(
  inner: BlobClient,
  keyOf: TwinKeyOf,
  options: { sharedKeyOf?: TwinKeyOf; freshKeyOf?: TwinKeyOf } = {},
): BlobClient {
  const { sharedKeyOf } = options;
  const freshKeyOf = options.freshKeyOf ?? keyOf;
  const keyedPath = async (pathname: string): Promise<string | null> => {
    const match = DECK_TWIN.exec(pathname);
    if (match === null) return null;
    const deckId = match[1] ?? '';
    const key = await keyOf(deckId);
    return key === null ? null : `${keyedTwinPrefix(deckId, key)}${match[2] ?? ''}`;
  };
  /** The keyed prefix a listing of `prefix` also covers, with the deck's own prefix; null when none. */
  const keyedListing = async (
    prefix: string,
  ): Promise<{ keyed: string; deckId: string; base: string } | null> => {
    const match = DECK_FOLDER.exec(prefix);
    if (match === null) return null;
    const deckId = match[1] ?? '';
    const rest = match[2] ?? '';
    // a listing reaches the twins when it names the deck's folder, part of `assets/`, or a
    // folder under it
    if (!'assets/'.startsWith(rest) && !rest.startsWith('assets/')) return null;
    const key = await keyOf(deckId);
    if (key === null) return null;
    const base = keyedTwinPrefix(deckId, key);
    return { keyed: `${base}${rest}`, deckId, base };
  };
  const named = (entry: BlobEntry, pathname: string): BlobEntry => ({ ...entry, pathname });
  return {
    async head(pathname, options) {
      const keyed = await keyedPath(pathname);
      if (keyed === null) return inner.head(pathname, options);
      const found = await inner.head(keyed, options);
      return found !== null ? named(found, pathname) : inner.head(pathname, options);
    },
    async get(pathname, options) {
      const keyed = await keyedPath(pathname);
      if (keyed === null) return inner.get(pathname, options);
      const found = await inner.get(keyed, options);
      if (found !== null) return { ...found, entry: named(found.entry, pathname) };
      return inner.get(pathname, options);
    },
    async list(prefix, options) {
      const listing = await keyedListing(prefix);
      if (listing === null) return inner.list(prefix, options);
      const [plain, keyed] = await Promise.all([
        inner.list(prefix, options),
        inner.list(listing.keyed, options),
      ]);
      const out = new Map<string, BlobEntry>();
      for (const entry of plain) out.set(entry.pathname, entry);
      // the keyed copy is the twin; one at the old place under the same name is its leftover
      for (const entry of keyed) {
        const pathname = `decks/${listing.deckId}/${entry.pathname.slice(listing.base.length)}`;
        out.set(pathname, named(entry, pathname));
      }
      return [...out.values()].sort((a, b) => byPath(a.pathname, b.pathname));
    },
    async folders(prefix, options) {
      const listing = await keyedListing(prefix);
      if (listing === null) return inner.folders(prefix, options);
      const [plain, keyed] = await Promise.all([
        inner.folders(prefix, options),
        inner.folders(listing.keyed, options),
      ]);
      const out = new Set(plain);
      for (const folder of keyed)
        out.add(`decks/${listing.deckId}/${folder.slice(listing.base.length)}`);
      return [...out].sort();
    },
    async put(pathname, bytes, options) {
      const keyed = await keyedPath(pathname);
      if (keyed === null) return inner.put(pathname, bytes, options);
      return named(await inner.put(keyed, bytes, options), pathname);
    },
    async del(pathnames, options) {
      const twins = pathnames.map((pathname) => ({ pathname, match: DECK_TWIN.exec(pathname) }));
      const decks = [...new Set(twins.flatMap(({ match }) => (match ? [match[1] ?? ''] : [])))];
      const shared = new Map<string, string | null>();
      if (sharedKeyOf !== undefined)
        for (const deckId of decks) shared.set(deckId, await sharedKeyOf(deckId));
      const keysNow = async () => {
        const keys = new Map<string, string | null>();
        for (const deckId of decks) keys.set(deckId, await freshKeyOf(deckId));
        return keys;
      };
      // one read of each deck's key names the paths and the key the shared guard compares
      const removals = (keys: Map<string, string | null>, plain: boolean): string[] =>
        twins.flatMap(({ pathname, match }) => {
          const deckId = match?.[1];
          const key = deckId === undefined ? null : (keys.get(deckId) ?? null);
          const keyed =
            deckId === undefined || key === null
              ? null
              : `${keyedTwinPrefix(deckId, key)}${match?.[2] ?? ''}`;
          // both places: a twin removed by name leaves no copy at the other
          if (sharedKeyOf === undefined || deckId === undefined)
            return [...(keyed === null ? [] : [keyed]), ...(plain ? [pathname] : [])];
          return keyed !== null && shared.get(deckId) !== key ? [keyed] : [];
        });
      const before = await keysNow();
      const out = removals(before, true);
      if (out.length > 0) await inner.del(out, options);
      if (decks.length === 0) return;
      // the keys again after the removal: a key `rekey` wrote while it ran loses the twin too
      const after = await keysNow();
      for (const deckId of decks)
        if (after.get(deckId) === before.get(deckId)) after.delete(deckId);
      const again = removals(after, false).filter((path) => !out.includes(path));
      if (again.length > 0) await inner.del(again, options);
    },
  };
}

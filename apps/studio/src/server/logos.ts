// The logo picker's server (docs/FEATURES.md 4.2, 4.4, 4.7, 4.9, 4.11; audit-logos 2, 8, 10, 12):
// the cached index held in memory per instance and read from the store once (one `get`, then a
// `head` at most once an hour on a request, never on a timer, docs/SYNC.md 4), the search over
// it, the mark route's cache rule (an open licence mark's sanitized file is kept in the store with
// its attribution `<desc>` and served from there; every other mark is fetched at each call,
// sanitized in the function and never written to the store, judge-design rejection 17), the
// insert (the SVG fetched once, sanitized, rasterized with sharp at 3x of the logo size into PNG
// twins, the asset record with its `logo` source, the picture block at the logo size for an agent
// that names a slide, the kit's three slots for `everySlide` and `kit`, one write) and the three
// action handlers `logo.search`, `logo.insert` and `logo.refresh` for the deck dispatcher. The
// refresh route's two credentials (the agent bearer, `CRON_SECRET`) are decided here too. The
// runtime seams (the store, the upstream, the rasterizer, the clock) are injected so logos.test.ts
// drives every rule over fakes; `logoService()` binds the deployment's: the disk under the state
// folder on a checkout and the tmp store, the public Blob store hosted, the upstream the variable
// names. Server only: sharp, the store and node:fs are on its graph.
//
// The hotfix of ship one (build/hotfix.md section 2; ship.md 13.4): a read of the index the store
// refuses for now (store/pulse.ts `isStoreBusy`: the public store's edge on the file the refresh
// just wrote, a 429, the deadline) is answered from the copy this instance holds, or from its disk
// mirror through the store, and only an instance that holds nothing answers 503 with a retry of a
// few seconds (`LogoStoreBusyError`), so no logo route answers 500 for a store condition. A
// discovery (a mark cached on a first fetch, a variant found missing or broken) no longer rewrites
// the index: it is held in memory and persisted to the small side record of logo-index.ts
// (`LogoDiscoveries`), which the refresh alone folds into the file. A cached mark whose file the
// edge withholds is answered from the upstream for that call and nothing is written, since the
// store holds the file already.
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

import sharp from 'sharp';

import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import { bearerToken } from '@turboslide/agent/http/auth';
import {
  LOGO_SOURCE,
  LOGO_WORDS,
  chooseVariant,
  insertKindOf,
  isOpenLicence,
  kitTextColour,
  logoAssetId,
  logoBoxAtStart,
  logoBoxIn,
  logoInsertSize,
  logoRasterSize,
  logoTitleArea,
  monoOffered,
  rankLogos,
  searchRowOf,
  tintAllowed,
  variantAvailable,
} from '@turboslide/chrome/logo-model';
import type {
  LogoIndexFacts,
  LogoRow,
  LogoSearchOptions,
  LogoSearchRow,
  LogoUnavailable,
} from '@turboslide/chrome/logo-model';
import type { Asset, AssetTwins, LogoAssetSource } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import type { BrandKit, KitAppearance } from '@turboslide/schema/brand';
import { brandWriteMutation } from '@turboslide/schema/brand';
import { grammarRecordOf } from '@turboslide/schema/canvas';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import {
  canvasObjects,
  deckAppearance,
  isCanvasSlide,
  slideBlocks,
  slideOrder,
} from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import type { Box } from '@turboslide/schema/render';
import { CONTENT_BOX } from '@turboslide/schema/render';
import { isStoreBusy } from '@turboslide/store/pulse';
import type { DeckStore } from '@turboslide/store/store';

import { bodyRect, freeRectangles, occupiedRects } from '../editor/place-insert';
import { agentAuth } from './auth';
import {
  LOGO_DOWN_MESSAGE,
  applyLogoDiscoveries,
  blobLogoStore,
  cachedMarkKey,
  densityFor,
  discoveriesEmpty,
  diskLogoStore,
  downUpstream,
  emptyLogoDiscoveries,
  emptyLogoIndex,
  fixtureUpstream,
  logoDigest,
  logoUpstreamMode,
  mergeLogoDiscoveries,
  networkUpstream,
  refreshLogoIndex,
  sharpRasterizer,
} from './logo-index';
import type {
  CachedMark,
  LogoDiscoveries,
  LogoIndex,
  LogoStore,
  LogoUpstream,
  Rasterizer,
  RefreshCounts,
} from './logo-index';
import {
  LogoBrokenError,
  LogoTooLargeError,
  sanitizeLogoSvg,
  tintLogoSvg,
  withAttribution,
} from './logo-sanitize';
import type { SanitizedSvg } from './logo-sanitize';
import { exportBlobClient, isHosted, stateDir } from './root';

// ---------------------------------------------------------------------------------------------
// The service

/** How long an instance keeps the index it read before it asks the store for the version again. */
export const INDEX_REVALIDATE_MS = 60 * 60 * 1000;
/**
 * How often at most an instance asks the store for the version because a search named a build it
 * does not hold (`since`, the refresh answer's `builtAt`; the verifier's pass 1, F4): a refresh
 * made on another instance is adopted by the instance that answers the next search that names
 * it, in place of waiting out the hour above. One head per instance per this interval at most,
 * on a request, never on a timer (docs/SYNC.md 4).
 */
export const SEARCH_REVALIDATE_MS = 2 * 1000;
/** How often an instance persists a discovery (an unavailable variant, a newly cached mark) at most. */
export const PERSIST_THROTTLE_MS = 60 * 1000;
/** A mark that is not open is kept in memory this long between fetches (a tile drawn twice, a scroll back). */
export const MEMORY_MARK_TTL_MS = 10 * 60 * 1000;
export const MEMORY_MARK_MAX = 500;

export type LogoServiceDeps = {
  store: LogoStore;
  upstream: LogoUpstream;
  rasterize?: Rasterizer;
  now?: () => Date;
  log?: (line: string) => void;
};

/** The answer of the mark route (4.7): the sanitized file as text, its row and whether the store held it. */
export type MarkAnswer =
  | {
      ok: true;
      svg: string;
      row: LogoRow;
      variant: string;
      sanitized: SanitizedSvg;
      cached: boolean;
    }
  | { ok: false; status: 404 | 413 | 422 | 503; message: string };

/** The `logo.search` answer (4.11). */
export type LogoSearchAnswer = LogoIndexFacts & {
  logos: LogoSearchRow[];
  source: typeof LOGO_SOURCE;
  /** how many rows the index holds in the collections searched */
  indexed: number;
};

/** An upstream failure at a mark fetch (4.9): the sentence, the status kept for the log. */
export class LogoUpstreamError extends Error {
  readonly status = 503;
  readonly upstreamStatus: number;
  constructor(upstreamStatus: number) {
    super(LOGO_WORDS.upstreamDown);
    this.name = 'LogoUpstreamError';
    this.upstreamStatus = upstreamStatus;
  }
}

/** The sentence a logo route answers while the store refuses the index and this instance holds no copy. */
export const LOGO_STORE_BUSY_MESSAGE =
  'The logo index is not readable right now; try again in a few seconds';
/** The `retry-after` of that answer, in seconds: the edge's window is minutes, the caller asks again sooner. */
export const LOGO_STORE_RETRY_AFTER_S = 5;

/**
 * The store refused the index read (store/pulse.ts `isStoreBusy`) and this instance holds no copy
 * of it yet (build/hotfix.md section 2): the routes answer 503 with `retry-after`, never the
 * framework's 500 and never an empty index. `storeError` is what the store threw, for the log.
 */
export class LogoStoreBusyError extends Error {
  readonly status = 503;
  readonly retryAfterS = LOGO_STORE_RETRY_AFTER_S;
  readonly storeError: unknown;
  constructor(storeError: unknown) {
    super(LOGO_STORE_BUSY_MESSAGE);
    this.name = 'LogoStoreBusyError';
    this.storeError = storeError;
  }
}

/** True for a store refusal the logo routes answer as 503 (the typed error above, or the store's own thrown under a read). */
export function isLogoStoreBusy(error: unknown): error is LogoStoreBusyError | Error {
  return error instanceof LogoStoreBusyError || isStoreBusy(error);
}

/**
 * What a search may name beside its options (4.2; F4): `since`, the `builtAt` a refresh answered,
 * so the instance answering the search adopts that build when its copy is older (the CLI's
 * `turboslide logo refresh` then `logo search --since <builtAt>`, and the fixture spec's takedown
 * read); the dialog names nothing and reads the instance's copy.
 */
export type LogoSearchExtra = {
  since?: string;
};

export type LogoService = {
  readonly deps: LogoServiceDeps;
  /** the index this instance holds, read from the store once and revalidated by version at most hourly */
  index: () => Promise<LogoIndex>;
  /** asks the store for the version now and adopts a newer index; the held index when unchanged */
  revalidate: () => Promise<LogoIndex>;
  facts: () => Promise<LogoIndexFacts>;
  search: (
    query: string,
    options?: LogoSearchOptions,
    extra?: LogoSearchExtra,
  ) => Promise<LogoSearchAnswer>;
  refresh: (options?: { dryRun?: boolean }) => Promise<RefreshCounts>;
  /** the sanitized file of a variant by the cache rule of 4.2 */
  mark: (slug: string, variant: string) => Promise<MarkAnswer>;
  row: (slug: string) => Promise<LogoRow | null>;
  /** replaces the held index (a test, a refresh made elsewhere) */
  adopt: (index: LogoIndex) => void;
  /** the index this instance holds right now, without a read; null before the first load */
  held: () => LogoIndex | null;
};

export function createLogoService(deps: LogoServiceDeps): LogoService {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  let held: LogoIndex | null = null;
  let heldVersion: string | null = null;
  let heldAt = 0;
  let loading: Promise<LogoIndex> | null = null;
  let persistedAt = 0;
  /**
   * the discoveries this instance made and has not persisted to the side record yet (a mark
   * cached on a first fetch, a variant found missing or broken); the held index carries them in
   * memory as well, so this instance's own answers read them at once
   */
  let pending: LogoDiscoveries = emptyLogoDiscoveries();
  /** the failure the instance saw since the index was written, for the foot (4.9) */
  let memoryError: LogoIndexFacts['lastError'] | undefined;
  const memoryMarks = new Map<string, { svg: string; sanitized: SanitizedSvg; at: number }>();

  const load = async (): Promise<LogoIndex> => {
    let stored: LogoIndex | null;
    let mirrored = false;
    try {
      stored = await deps.store.readIndex();
    } catch (error) {
      // the store refuses the read for now (the edge's window after the refresh wrote the file,
      // a 429, the deadline): the copy this instance holds on disk from its last read stands in,
      // its version left unknown so the next revalidation asks the store again; with no copy the
      // routes answer 503 with a retry and the next request loads again (build/hotfix.md
      // section 2; ship.md 13.4)
      if (!isStoreBusy(error)) throw error;
      stored = await deps.store.readMirror().catch(() => null);
      if (stored === null) throw new LogoStoreBusyError(error);
      mirrored = true;
    }
    heldVersion = mirrored ? null : await deps.store.indexVersion().catch(() => null);
    heldAt = Date.now();
    held = stored ?? emptyLogoIndex();
    if (stored === null && deps.upstream.mode === 'fixture') {
      // the fixture upstream is ten marks: a fresh instance builds its index inline so the spec
      // project drives the picker without a refresh call first (4.9); the built index is adopted
      // from the refresh's own hand, not read back through the store's edge
      const written: { index: LogoIndex | null } = { index: null };
      await refreshLogoIndex({
        store: deps.store,
        upstream: deps.upstream,
        ...(deps.rasterize ? { rasterize: deps.rasterize } : {}),
        now,
        log,
        onWritten: (index) => {
          written.index = index;
        },
      });
      held = written.index ?? (await deps.store.readIndex().catch(() => null)) ?? emptyLogoIndex();
      heldVersion = await deps.store.indexVersion().catch(() => null);
    }
    // the discoveries other instances made since the last refresh, small and best effort: a
    // read the store refuses leaves them to the refresh, and this instance discovers on its own
    const recorded = await deps.store.readDiscoveries().catch(() => null);
    if (recorded !== null) applyLogoDiscoveries(held, recorded);
    return held;
  };

  /** One head, on this request (never a timer): a refresh made elsewhere is adopted when the version moved. */
  const revalidate = async (): Promise<LogoIndex> => {
    if (held === null) return index();
    const version = await deps.store.indexVersion().catch(() => heldVersion);
    heldAt = Date.now();
    if (version === heldVersion) return held;
    const stored = await deps.store.readIndex().catch(() => null);
    if (stored !== null) {
      held = stored;
      heldVersion = version;
    }
    return held;
  };

  const index = async (): Promise<LogoIndex> => {
    if (held !== null) {
      if (Date.now() - heldAt < INDEX_REVALIDATE_MS) return held;
      // one head at most an hour, on this request (never a timer): a refresh elsewhere is adopted
      return revalidate();
    }
    loading ??= load().finally(() => {
      loading = null;
    });
    return loading;
  };

  /** True when the held index is the build the caller names, or a newer one (ISO times compare as strings). */
  const holdsBuild = (current: LogoIndex, since: string): boolean =>
    current.builtAt !== null && current.builtAt >= since;

  let checkedAt = 0;
  /** One head now unless one ran inside SEARCH_REVALIDATE_MS on this instance; the held copy otherwise. */
  const revalidateSoon = async (current: LogoIndex): Promise<LogoIndex> => {
    if (Date.now() - checkedAt < SEARCH_REVALIDATE_MS) return current;
    checkedAt = Date.now();
    return revalidate();
  };

  /**
   * The index for a search that names a build (`since`): the held copy when it is that build or
   * newer, else one head now (at most once per SEARCH_REVALIDATE_MS per instance) and the store's
   * index when the version moved. A `since` the store never wrote (a clock ahead, a typo) costs
   * the one head and answers the held copy.
   */
  const indexSince = async (since: string | undefined): Promise<LogoIndex> => {
    const current = await index();
    if (since === undefined || since === '' || holdsBuild(current, since)) return current;
    return revalidateSoon(current);
  };

  /**
   * Writes this instance's pending discoveries into the store's side record, merged over the
   * record as read now; the index's pathname is never written here (build/hotfix.md section 2).
   * A read or a put the store refuses puts the discoveries back into the pending record for the
   * next persist or the refresh, which folds them either way.
   */
  const persistNow = async (): Promise<void> => {
    if (discoveriesEmpty(pending)) return;
    persistedAt = Date.now();
    const snapshot = pending;
    pending = emptyLogoDiscoveries();
    try {
      const recorded = await deps.store.readDiscoveries();
      const at = now().toISOString();
      const merged =
        recorded === null ? { ...snapshot, at } : mergeLogoDiscoveries(recorded, snapshot, at);
      await deps.store.writeDiscoveries(merged);
    } catch (error) {
      pending = mergeLogoDiscoveries(snapshot, pending, now().toISOString());
      log(
        `logo index: the discoveries did not persist (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  };

  /** Persists the pending discoveries at most once a minute per instance (the throttle persistSoon always had). */
  const persistSoon = async (): Promise<void> => {
    if (held === null) return;
    if (Date.now() - persistedAt < PERSIST_THROTTLE_MS) return;
    await persistNow();
  };

  /** A mark's sanitized file landed in the store: the held index and the pending record learn it. */
  const recordCached = (key: string, mark: CachedMark): void => {
    if (held !== null) held.cached[key] = mark;
    pending.cached[key] = mark;
    void persistSoon();
  };

  const facts = async (): Promise<LogoIndexFacts> => {
    const current = await index();
    const lastError = memoryError ?? current.lastError;
    return {
      updatedAt: current.updatedAt,
      ...(lastError !== undefined ? { lastError } : {}),
      ...(current.progress !== undefined ? { progress: current.progress } : {}),
    };
  };

  const row = async (slug: string): Promise<LogoRow | null> =>
    (await index()).icons.find((entry) => entry.slug === slug) ?? null;

  const markUnavailable = (entry: LogoRow, variant: string, mark: LogoUnavailable): void => {
    entry.unavailable = { ...(entry.unavailable ?? {}), [variant]: mark };
    pending.unavailable[entry.slug] = {
      ...(pending.unavailable[entry.slug] ?? {}),
      [variant]: mark,
    };
    void persistSoon();
  };

  const mark = async (slug: string, variant: string): Promise<MarkAnswer> => {
    let entry = await row(slug);
    if (entry === null) return { ok: false, status: 404, message: LOGO_WORDS.unknown(slug) };
    if (isOpenLicence(entry.license)) {
      // a first fetch of an open licence mark on this instance (nothing cached for it in the
      // index this instance holds): one head first, at most every SEARCH_REVALIDATE_MS, so a
      // refresh made elsewhere that took the mark down is adopted before its file is fetched and
      // written to the store again (4.2; the verifier's pass 1, F4). A cached mark costs no head.
      const held = await index();
      if (held.cached[cachedMarkKey(slug, variant)] === undefined) {
        const fresh = await revalidateSoon(held);
        if (fresh !== held) {
          entry = fresh.icons.find((each) => each.slug === slug) ?? null;
          if (entry === null) return { ok: false, status: 404, message: LOGO_WORDS.unknown(slug) };
        }
      }
    }
    const path = entry.variants[variant];
    if (path === undefined)
      return { ok: false, status: 404, message: LOGO_WORDS.noVariant(entry.title, variant) };
    const unavailable = entry.unavailable?.[variant];
    if (unavailable !== undefined)
      return {
        ok: false,
        status: unavailable.reason === 'missing' ? 404 : 422,
        message:
          unavailable.reason === 'missing'
            ? LOGO_WORDS.noVariant(entry.title, variant)
            : LOGO_WORDS.broken,
      };
    const key = cachedMarkKey(slug, variant);
    const open = isOpenLicence(entry.license);
    /** the store holds the file by the index's word and refuses to serve it right now (the edge's window) */
    let withheld = false;
    if (open) {
      const current = await index();
      if (current.cached[key] !== undefined) {
        let bytes: Uint8Array | null = null;
        try {
          bytes = await deps.store.readMark(slug, variant);
        } catch (error) {
          // a mark another instance cached moments ago, its file not yet served by the public
          // store's edge (build/hotfix.md section 2): the upstream answers this call and nothing
          // is written or recorded, since the store holds the file already
          if (isStoreBusy(error)) withheld = true;
        }
        if (bytes !== null) {
          try {
            const sanitized = sanitizeLogoSvg(bytes);
            return { ok: true, svg: sanitized.svg, row: entry, variant, sanitized, cached: true };
          } catch {
            // a cached file that no longer parses is fetched again below
          }
          delete current.cached[key];
        } else if (!withheld) {
          // the file this instance's index says is cached is gone from the store: a refresh made
          // on another instance took the mark down or evicted it (4.2; the verifier's pass 1, F4),
          // so the index is read again before anything is fetched, and a slug that left it
          // answers 404 instead of a fresh copy of a file the source removed
          const fresh = await revalidate();
          if (fresh !== current) {
            const still = fresh.icons.find((row) => row.slug === slug);
            if (still === undefined)
              return { ok: false, status: 404, message: LOGO_WORDS.unknown(slug) };
            if (still.variants[variant] === undefined)
              return {
                ok: false,
                status: 404,
                message: LOGO_WORDS.noVariant(still.title, variant),
              };
            return mark(slug, variant);
          }
          delete current.cached[key];
        }
      }
    } else {
      const remembered = memoryMarks.get(key);
      if (remembered !== undefined && Date.now() - remembered.at < MEMORY_MARK_TTL_MS)
        return {
          ok: true,
          svg: remembered.svg,
          row: entry,
          variant,
          sanitized: remembered.sanitized,
          cached: false,
        };
    }
    const answer = await deps.upstream.mark(path, 'single');
    const at = now().toISOString();
    if (!answer.ok) {
      if (answer.status === 0 || answer.status >= 500) {
        memoryError = { at, status: answer.status, message: answer.message || LOGO_DOWN_MESSAGE };
        return { ok: false, status: 503, message: LOGO_WORDS.upstreamDown };
      }
      markUnavailable(entry, variant, { at, status: answer.status, reason: 'missing' });
      return { ok: false, status: 404, message: LOGO_WORDS.noVariant(entry.title, variant) };
    }
    let sanitized: SanitizedSvg;
    try {
      sanitized = sanitizeLogoSvg(answer.bytes);
    } catch (error) {
      if (error instanceof LogoTooLargeError) {
        markUnavailable(entry, variant, { at, status: 413, reason: 'broken' });
        return { ok: false, status: 413, message: error.message };
      }
      markUnavailable(entry, variant, { at, status: 422, reason: 'broken' });
      return { ok: false, status: 422, message: LOGO_WORDS.broken };
    }
    if (sanitized.draws) {
      markUnavailable(entry, variant, { at, reason: 'sanitized' });
      return { ok: false, status: 422, message: LOGO_WORDS.broken };
    }
    const svg = withAttribution(sanitized.svg, entry.title, entry.license);
    if (open && withheld) {
      // the store's copy stands; this call alone was answered from the upstream
    } else if (open) {
      const bytes = new TextEncoder().encode(svg);
      try {
        await deps.store.writeMark(slug, variant, bytes);
        recordCached(key, { at, digest: logoDigest(bytes), bytes: bytes.byteLength });
      } catch (error) {
        log(
          `logo cache: ${key} did not persist (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    } else {
      if (memoryMarks.size >= MEMORY_MARK_MAX) {
        const oldest = memoryMarks.keys().next().value;
        if (oldest !== undefined) memoryMarks.delete(oldest);
      }
      memoryMarks.set(key, { svg, sanitized, at: Date.now() });
    }
    return { ok: true, svg, row: entry, variant, sanitized, cached: false };
  };

  const search = async (
    query: string,
    options: LogoSearchOptions = {},
    extra: LogoSearchExtra = {},
  ): Promise<LogoSearchAnswer> => {
    const current = await indexSince(extra.since);
    const rows = rankLogos(current.icons, query, options);
    const indexed = current.icons.filter(
      (entry) =>
        options.collection === 'all' ||
        entry.collection === 'brands' ||
        entry.collection === 'community',
    ).length;
    return { ...(await facts()), logos: rows.map(searchRowOf), source: LOGO_SOURCE, indexed };
  };

  const refresh = async (options: { dryRun?: boolean } = {}): Promise<RefreshCounts> => {
    if (options.dryRun === true) {
      const current = await index();
      const counts = await refreshLogoIndex(
        { store: memoryOnly(current), upstream: deps.upstream, now },
        { dryRun: true },
      );
      const lastError = memoryError ?? counts.lastError;
      return { ...counts, ...(lastError !== undefined ? { lastError } : {}) };
    }
    // the store's index first, on every instance: the fixture upstream decides its takedown from
    // the index this instance holds (4.9), and a held copy older than another instance's refresh
    // would re list what that refresh dropped (the verifier's pass 2 F.5 finding 3), so the
    // refresh heads the store's version and adopts its index before the manifest is asked
    await revalidate();
    // this instance's pending discoveries ride into the refresh beside the store's side record
    // (the flush of the index the refresh used to make); what lands while it runs stays pending
    const own = pending;
    pending = emptyLogoDiscoveries();
    const written: { index: LogoIndex | null } = { index: null };
    let counts: RefreshCounts;
    try {
      counts = await refreshLogoIndex({
        store: deps.store,
        upstream: deps.upstream,
        ...(deps.rasterize ? { rasterize: deps.rasterize } : {}),
        now,
        log,
        ...(discoveriesEmpty(own) ? {} : { discoveries: own }),
        onWritten: (index) => {
          written.index = index;
        },
      });
    } catch (error) {
      pending = mergeLogoDiscoveries(own, pending, now().toISOString());
      throw error;
    }
    // the index the refresh wrote, from its own hand: a read back through the store's edge
    // right after the put is what the window refuses (ship.md 13.4)
    held = written.index ?? (await deps.store.readIndex().catch(() => held)) ?? emptyLogoIndex();
    heldVersion = await deps.store.indexVersion().catch(() => null);
    heldAt = Date.now();
    if (counts.lastError === undefined) memoryError = undefined;
    return counts;
  };

  return {
    deps,
    index,
    revalidate,
    facts,
    search,
    refresh,
    mark,
    row,
    adopt: (next) => {
      held = next;
      heldAt = Date.now();
    },
    held: () => held,
  };
}

/** A read only view of one index for the dry run's counts. */
function memoryOnly(index: LogoIndex): LogoStore {
  return {
    kind: 'memory',
    readIndex: async () => index,
    readMirror: async () => null,
    indexVersion: async () => null,
    writeIndex: async () => undefined,
    readMark: async () => null,
    writeMark: async () => undefined,
    removeMarks: async () => undefined,
    readDiscoveries: async () => null,
    writeDiscoveries: async () => undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// The deployment's service, one per process

const SERVICE = Symbol.for('turboslide.studio.logoService');

/** The upstream the variable names (4.9). */
export function logoUpstreamFor(
  current: () => LogoIndex | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): LogoUpstream {
  const mode = logoUpstreamMode(env);
  if (mode === 'fixture') return fixtureUpstream(current);
  if (mode === 'down') return downUpstream();
  return networkUpstream({ env });
}

/** The deployment's service: the store by the backend, the upstream by the variable; one per process. */
export async function logoService(): Promise<LogoService> {
  const holder = globalThis as unknown as Record<symbol, Promise<LogoService> | undefined>;
  holder[SERVICE] ??= (async () => {
    const dir = join(stateDir(), 'logos');
    const client = isHosted() ? await exportBlobClient().catch(() => null) : null;
    const store = client === null ? diskLogoStore(dir) : blobLogoStore(client, dir);
    // the fixture upstream reads the index this instance holds to decide the takedown (4.9)
    let service: LogoService | null = null;
    const upstream = logoUpstreamFor(() => service?.held() ?? null);
    service = createLogoService({
      store,
      upstream,
      rasterize: sharpRasterizer(),
      log: (line) => console.error(`turboslide logos: ${line}`),
    });
    return service;
  })().catch((error: unknown) => {
    delete holder[SERVICE];
    throw error;
  });
  return holder[SERVICE];
}

/** Drops the process's service (a test, a store change). */
export function resetLogoService(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[SERVICE];
}

// ---------------------------------------------------------------------------------------------
// The refresh credentials (4.2; judge-design rejection 7)

export const CRON_SECRET_ENV = 'CRON_SECRET';

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/**
 * Who may refresh (4.2): the agent bearer as every agent route decides it (the token, or a
 * checkout's localhost), or `Authorization: Bearer <CRON_SECRET>`, all a Vercel cron sends; with
 * neither, or a wrong secret, 401.
 */
export function refreshCredential(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
  agent: (request: Request) => { ok: boolean } = agentAuth,
): 'agent' | 'cron' | null {
  const given = bearerToken(request);
  const secret = env[CRON_SECRET_ENV];
  if (given !== undefined && secret !== undefined && secret !== '' && sameSecret(given, secret))
    return 'cron';
  if (agent(request).ok) return 'agent';
  return null;
}

// ---------------------------------------------------------------------------------------------
// The insert (4.4; audit-logos 2, 9, 11, 14)

export type LogoInsertInput = {
  slug: string;
  variant?: string;
  slideId?: string;
  box?: { x: number; y: number; w: number; h: number };
  everySlide?: boolean;
  kit?: boolean;
  blockId?: string;
  baseRevision: number;
};

export type LogoInsertOutput = {
  asset: Asset;
  blockId?: string;
  slideId?: string;
  revision: number;
  /** the variant the insert took, when the caller named none */
  variant: string;
};

export type LogoInsertDeps = {
  service: LogoService;
  /** the deck's store; assets go through `putAsset` */
  store: DeckStore;
  deckId: string;
  /** runs another action on the same deck: `slide.toCanvas` before a block lands on a slide that is not a canvas */
  dispatch?: (id: string, input: unknown, ctx: ActionContext) => Promise<unknown>;
  now?: () => Date;
  /** the PNG encoder; sharp when absent */
  rasterizePng?: (
    svg: string,
    size: [number, number],
  ) => Promise<{ png: Uint8Array; width: number; height: number }>;
};

/** The three kit writes of Use on every slide (4.4; packages/chrome/src/brand/UseOnEverySlide.tsx), on the server. */
export function kitLogoMutations(deck: Pick<Deck, 'brand'>, assetId: string): Mutation[] {
  const first = brandWriteMutation(deck, '/mark', { kind: 'picture', assetId });
  const afterFirst: { brand: BrandKit } = {
    brand: { ...(deck.brand ?? {}), mark: { kind: 'picture', assetId } },
  };
  const second = brandWriteMutation(afterFirst, '/footer/logo', 'picture');
  const afterSecond: { brand: BrandKit } = {
    brand: { ...afterFirst.brand, footer: { ...(afterFirst.brand.footer ?? {}), logo: 'picture' } },
  };
  const third = brandWriteMutation(afterSecond, '/footer/assetId', assetId);
  return [first, second, third] as Mutation[];
}

/** sharp from the sanitized SVG at the density that yields the size, to PNG (4.4). */
export async function rasterizeLogoPng(
  svg: string,
  size: [number, number],
): Promise<{ png: Uint8Array; width: number; height: number }> {
  const bytes = Buffer.from(svg, 'utf8');
  const meta = await sharp(bytes, { failOn: 'error' }).metadata();
  const intrinsic: [number, number] = [meta.width ?? size[0], meta.height ?? size[1]];
  const density = densityFor(intrinsic, Math.max(size[0], size[1]));
  const { data, info } = await sharp(bytes, {
    density,
    failOn: 'error',
    limitInputPixels: 64_000_000,
  })
    .resize({ width: size[0], height: size[1], fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return {
    png: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/** The kit's text colour per appearance a tinted mono takes (4.4). */
function tintColours(deck: Deck): { light: string; dark: string } {
  return { light: kitTextColour(deck.brand, 'light'), dark: kitTextColour(deck.brand, 'dark') };
}

/**
 * The box for a logo on a canvas slide: on a converted title slide the mark slot's row beside the
 * brand's mark (logo-model.ts `logoTitleArea`; the title layout has no body slot and its stack
 * sits in the middle of the sheet, so the general rule landed the mark over the heading's words);
 * elsewhere the free rectangle rule of the product round (place-insert.ts) with the logo size
 * inside it.
 */
export function logoPlacementOn(slide: Slide, size: [number, number]): Box {
  const titleArea = logoTitleArea(grammarRecordOf(slide)?.kind, canvasObjects(slide), CONTENT_BOX);
  if (titleArea !== null) return logoBoxAtStart(titleArea, size);
  const body = bodyRect(slide);
  const occupied = occupiedRects(slide, body);
  let best: { rect: Box; area: number } | null = null;
  for (const rect of freeRectangles(body, occupied)) {
    const box: Box = [rect.x, rect.y, rect.w, rect.h];
    const fitted = logoBoxIn(box, size);
    if (fitted[2] < 8 || fitted[3] < 8) continue;
    const area = fitted[2] * fitted[3];
    if (
      best === null ||
      area > best.area ||
      (area === best.area &&
        (rect.y < best.rect[1] || (rect.y === best.rect[1] && rect.x < best.rect[0])))
    )
      best = { rect: box, area };
  }
  return logoBoxIn(best?.rect ?? [body.x, body.y, body.w, body.h], size);
}

function blockIdsOf(slide: Slide): Set<string> {
  const ids = new Set<string>();
  const walk = (block: Block): void => {
    ids.add(block.id);
    const children = (block as { blocks?: Block[] }).blocks;
    if (Array.isArray(children)) for (const child of children) walk(child);
  };
  for (const { block } of slideBlocks(slide)) walk(block);
  return ids;
}

function freeBlockId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** The slide that holds a block, for a Replace image target without a slide id. */
function slideOfBlock(document: DeckDocument, blockId: string): Slide | undefined {
  for (const id of slideOrder(document.deck)) {
    const slide = document.slides[id];
    if (slide !== undefined && blockIdsOf(slide).has(blockId)) return slide;
  }
  return undefined;
}

/** A mono mark whose fill references a gradient is not offered as Mono (4.4): the default, untinted, takes its place. */
async function pickMark(
  deps: LogoInsertDeps,
  row: LogoRow,
  appearance: KitAppearance,
  wanted: string | undefined,
): Promise<{ answer: Extract<MarkAnswer, { ok: true }>; variant: string; tint: boolean }> {
  let variant: string;
  let tint: boolean;
  if (wanted !== undefined) {
    if (row.variants[wanted] === undefined)
      throw new RangeError(LOGO_WORDS.noVariant(row.title, wanted));
    variant = wanted;
    tint = (wanted === 'mono' || wanted === 'wordmarkMono') && tintAllowed(row.license);
  } else {
    const choice = chooseVariant(row, appearance);
    if (choice === null) throw new RangeError(LOGO_WORDS.noVariant(row.title, 'default'));
    variant = choice.variant;
    tint = choice.tint;
  }
  const answer = await deps.service.mark(row.slug, variant);
  if (!answer.ok) {
    if (answer.status === 503) throw new LogoUpstreamError(0);
    throw answer.status === 404
      ? new RangeError(answer.message)
      : new LogoBrokenError(answer.message);
  }
  if (tint && !monoOffered(answer.svg)) {
    // the gradient case: not offered as Mono, the appearance rule skips it
    if (row.unavailable?.[variant] === undefined)
      row.unavailable = {
        ...(row.unavailable ?? {}),
        [variant]: { at: (deps.now ?? (() => new Date()))().toISOString(), reason: 'gradient' },
      };
    if (variant !== 'default' && variantAvailable(row, 'default')) {
      const fallback = await deps.service.mark(row.slug, 'default');
      if (fallback.ok) return { answer: fallback, variant: 'default', tint: false };
    }
    tint = false;
  }
  return { answer, variant, tint };
}

/**
 * The variant drawn for a ground, when the brand has one (4.4): thesvg.org names a variant after
 * the ground it is drawn for (`light.svg` is the mark for a light ground, `dark.svg` the one for a
 * dark ground; logo-model.ts `chooseVariant`), so the light twin is the `light` file and the dark
 * twin the `dark` file.
 */
function pairedVariant(row: LogoRow, variant: string, ground: 'light' | 'dark'): string | null {
  const wanted = variant.startsWith('wordmark')
    ? ground === 'light'
      ? 'wordmarkLight'
      : 'wordmarkDark'
    : ground === 'light'
      ? 'light'
      : 'dark';
  return variantAvailable(row, wanted) ? wanted : null;
}

/**
 * `logo.insert` (4.4, 4.11): the mark fetched once through the service (the cache rule applies),
 * the twins at 3x of the logo size (the `light` variant as the light twin and the `dark` variant as
 * the dark twin when the pair exists, a tinted mono per appearance, else one neutral file), the
 * asset with its `logo` source and the sanitized `sourceFile`, then one write: the record, the
 * picture block at the logo size when `slideId` names a slide (a slide that is not a canvas
 * converts first through `slide.toCanvas`), the swap of `blockId`'s asset for Replace image, and
 * the kit's three slots for `everySlide` and `kit`. The document never carries the source's
 * address.
 */
export async function logoInsert(
  deps: LogoInsertDeps,
  ctx: ActionContext,
  input: LogoInsertInput,
): Promise<LogoInsertOutput> {
  const now = deps.now ?? (() => new Date());
  const row = await deps.service.row(input.slug);
  if (row === null) throw new RangeError(LOGO_WORDS.unknown(input.slug));
  let document = (await deps.store.read()).document;
  const appearance = deckAppearance(document.deck);
  const { answer, variant, tint } = await pickMark(deps, row, appearance, input.variant);
  const kind = insertKindOf(variant);
  const natural = answer.sanitized.size;
  const rasterSize = logoRasterSize(kind, natural);
  const rasterize = deps.rasterizePng ?? rasterizeLogoPng;
  const colours = tintColours(document.deck);
  const taken = new Set(Object.keys(document.deck.assets));
  const id = logoAssetId(row.slug, taken);
  const fetchedAt = now().toISOString();

  // the files: the source (the sanitized file, tinted for the deck's appearance when the mark is
  // tinted), then the twins
  let sourceSvg = answer.svg;
  let twinsSvg: { light: string; dark: string } | { neutral: string };
  const tintRecord: LogoAssetSource['tint'] = {};
  if (tint) {
    twinsSvg = {
      light: tintLogoSvg(answer.svg, colours.light),
      dark: tintLogoSvg(answer.svg, colours.dark),
    };
    tintRecord.light = colours.light;
    tintRecord.dark = colours.dark;
    sourceSvg = appearance === 'light' ? twinsSvg.light : twinsSvg.dark;
  } else {
    const forLight = pairedVariant(row, variant, 'light');
    const forDark = pairedVariant(row, variant, 'dark');
    if (forLight !== null && forDark !== null && (forLight === variant || forDark === variant)) {
      const other = forLight === variant ? forDark : forLight;
      const pair = await deps.service.mark(row.slug, other);
      twinsSvg = pair.ok
        ? forLight === variant
          ? { light: answer.svg, dark: pair.svg }
          : { light: pair.svg, dark: answer.svg }
        : { neutral: answer.svg };
    } else twinsSvg = { neutral: answer.svg };
  }
  const sourceBytes = new TextEncoder().encode(sourceSvg);
  const digest = logoDigest(sourceBytes);
  const short = digest.slice(0, 8);
  const sourcePut = await deps.store.putAsset(
    `assets/${id}.source.${short}.svg`,
    sourceBytes,
    'image/svg+xml',
  );
  let twins: AssetTwins;
  let size: [number, number];
  if ('neutral' in twinsSvg) {
    const raster = await rasterize(twinsSvg.neutral, rasterSize);
    const put = await deps.store.putAsset(
      `assets/${id}.${logoDigest(raster.png).slice(0, 8)}.png`,
      raster.png,
      'image/png',
    );
    twins = { neutral: put.relative };
    size = [raster.width, raster.height];
  } else {
    const light = await rasterize(twinsSvg.light, rasterSize);
    const dark = await rasterize(twinsSvg.dark, rasterSize);
    const putLight = await deps.store.putAsset(
      `assets/${id}.${logoDigest(light.png).slice(0, 8)}-light.png`,
      light.png,
      'image/png',
    );
    const putDark = await deps.store.putAsset(
      `assets/${id}.${logoDigest(dark.png).slice(0, 8)}-dark.png`,
      dark.png,
      'image/png',
    );
    twins = { light: putLight.relative, dark: putDark.relative };
    size = [light.width, light.height];
  }
  const source: LogoAssetSource = {
    kind: 'logo',
    provider: 'thesvg',
    slug: row.slug,
    variant,
    title: row.title,
    license: row.license,
    ...(row.url !== undefined ? { url: row.url } : {}),
    ...(row.guidelines !== undefined ? { guidelines: row.guidelines } : {}),
    fetchedAt,
    digest,
    ...(answer.sanitized.removed.length > 0
      ? { sanitized: { removed: answer.sanitized.removed } }
      : {}),
    ...(tint ? { tint: tintRecord } : {}),
  };
  const asset: Asset = {
    id,
    role: 'logo',
    alt: LOGO_WORDS.alt(row.title),
    twins,
    size,
    scale: 3,
    source,
    sourceFile: sourcePut.relative,
    inline: 'pass-through',
  };

  // a slide that is not a canvas converts first (the rule of slide.setBackgroundPicture)
  let placeOn: Slide | undefined;
  if (input.slideId !== undefined && input.blockId === undefined) {
    const slide = document.slides[input.slideId];
    if (slide === undefined) throw new RangeError(`No slide "${input.slideId}"`);
    if (!isCanvasSlide(slide)) {
      if (deps.dispatch === undefined)
        throw new TypeError(
          `Slide "${input.slideId}" is not arranged by hand yet; run slide.toCanvas first`,
        );
      await deps.dispatch(
        'slide.toCanvas',
        { slideIds: [input.slideId], baseRevision: document.deck.revision },
        ctx,
      );
      document = (await deps.store.read()).document;
    }
    placeOn = document.slides[input.slideId];
  }

  const mutations: Mutation[] = [{ op: 'asset.set', asset }];
  let blockId: string | undefined;
  let slideId: string | undefined;
  if (input.blockId !== undefined) {
    const slide =
      input.slideId !== undefined
        ? document.slides[input.slideId]
        : slideOfBlock(document, input.blockId);
    if (slide === undefined)
      throw new RangeError(`No block "${input.blockId}" in this presentation`);
    const target = slideBlocks(slide).find(({ block }) => block.id === input.blockId)?.block;
    if (target === undefined || (target.type !== 'shot' && target.type !== 'picture'))
      throw new RangeError(`Block "${input.blockId}" is not a picture`);
    mutations.push({
      op: 'block.set',
      slideId: slide.id,
      blockId: target.id,
      path: '/asset',
      value: id,
    });
    blockId = target.id;
    slideId = slide.id;
  } else if (placeOn !== undefined) {
    const objects = canvasObjects(placeOn);
    const box: Box =
      input.box !== undefined
        ? [input.box.x, input.box.y, input.box.w, input.box.h]
        : logoPlacementOn(placeOn, logoInsertSize(kind, natural));
    const z = Math.max(0, ...objects.map((block) => block.pos?.z ?? 0)) + 1;
    blockId = freeBlockId('logo', blockIdsOf(placeOn));
    const last = objects[objects.length - 1]?.id;
    mutations.push({
      op: 'block.insert',
      slideId: placeOn.id,
      slot: 'main',
      ...(last !== undefined ? { after: last } : {}),
      block: {
        id: blockId,
        type: 'shot',
        asset: id,
        pos: {
          x: Math.round(box[0]),
          y: Math.round(box[1]),
          w: Math.max(1, Math.round(box[2])),
          h: Math.max(1, Math.round(box[3])),
          z,
        },
      } as Block,
    });
    slideId = placeOn.id;
  }
  if (input.everySlide === true || input.kit === true)
    mutations.push(...kitLogoMutations(document.deck, id));

  const note =
    input.kit === true || input.everySlide === true ? 'Brand kit: Logo' : `Logo: ${row.title}`;
  const author: Author = ctx.author;
  // the record is additive, so the write is made against the head the store reports and again
  // when another write lands in between (the rule of asset.add, packages/materials commitAssetsAtHead)
  let lastConflict: ConflictError | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = attempt === 0 ? document : (await deps.store.read()).document;
    if (current.deck.assets[id] !== undefined)
      throw new ConflictError(`logo.insert: the document already holds an asset "${id}"`, {
        currentRevision: current.deck.revision,
        current,
      });
    const outcome = await deps.store.write(
      { baseRevision: current.deck.revision, author, note, mutations },
      { ...(ctx.force !== undefined ? { force: ctx.force } : {}) },
    );
    if (outcome.ok) {
      return {
        asset: outcome.document.deck.assets[id] ?? asset,
        ...(blockId !== undefined ? { blockId } : {}),
        ...(slideId !== undefined ? { slideId } : {}),
        revision: outcome.revision,
        variant,
      };
    }
    if (outcome.code === 'conflict') {
      lastConflict = new ConflictError(outcome.message, {
        currentRevision: outcome.currentRevision,
        current: outcome.current,
        ...(outcome.holder !== undefined ? { holder: outcome.holder } : {}),
      });
      if (outcome.holder !== undefined) throw lastConflict;
      continue;
    }
    throw new TypeError(`logo.insert: ${outcome.message}`);
  }
  throw lastConflict ?? new TypeError('logo.insert: the write did not land');
}

// ---------------------------------------------------------------------------------------------
// The handlers (4.11)

export type LogoActionDeps = {
  store: DeckStore;
  deckId: string;
  dispatch?: (id: string, input: unknown, ctx: ActionContext) => Promise<unknown>;
  /** the service; the deployment's when absent */
  service?: LogoService;
  now?: () => Date;
  rasterizePng?: LogoInsertDeps['rasterizePng'];
};

/** Registers `logo.search`, `logo.insert` and `logo.refresh` on a deck dispatcher (the studio's, build/b6.md R4). */
export function registerLogoActions(dispatcher: Dispatcher, deps: LogoActionDeps): void {
  const service = async (): Promise<LogoService> => deps.service ?? (await logoService());
  dispatcher.register('logo.search', async (input) => {
    const request = input as {
      query: string;
      limit?: number;
      kind?: 'symbol' | 'wordmark';
      collection?: 'brands' | 'all';
      /** the build a refresh answered (`builtAt`), once the table's input names it (build/b6.md, the fix round) */
      since?: string;
    };
    const { query, since, ...options } = request;
    return (await service()).search(query, options, since === undefined ? {} : { since });
  });
  dispatcher.register('logo.insert', async (input, ctx: ActionContext) =>
    logoInsert(
      {
        service: await service(),
        store: deps.store,
        deckId: deps.deckId,
        ...(deps.dispatch !== undefined ? { dispatch: deps.dispatch } : {}),
        ...(deps.now !== undefined ? { now: deps.now } : {}),
        ...(deps.rasterizePng !== undefined ? { rasterizePng: deps.rasterizePng } : {}),
      },
      ctx,
      input as LogoInsertInput,
    ),
  );
  dispatcher.register('logo.refresh', async (input) => {
    const request = (input ?? {}) as { dryRun?: boolean };
    return (await service()).refresh({
      ...(request.dryRun !== undefined ? { dryRun: request.dryRun } : {}),
    });
  });
}

/** The action ids this module registers. */
export const LOGO_ACTION_IDS = ['logo.search', 'logo.insert', 'logo.refresh'] as const;

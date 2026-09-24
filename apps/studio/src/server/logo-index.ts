// The cached logo index and its refresh (docs/FEATURES.md 4.2, 4.9; audit-logos 10, 13). The
// server keeps `system/logo-index.json`, built from jsDelivr's `icons.json` (the file with the
// variant paths, `dateAdded`, `collection` and `guidelines`; `registry.json` is not a fallback,
// judge-design rejection 8) and trimmed to the row shape of @turboslide/chrome/logo-model, with two
// flags per brand mark computed by rasterizing its default once at 96 px: a mark reads when over
// 0.2 percent of its pixels differ from the ground by more than 40 luminance steps (the measure of
// the audit's raster-check.json). The cache reads variant paths from the manifest and never
// composes an address from a key; a 404, a 5xx or a parse failure marks the variant unavailable
// and the next refresh retries it; a slug absent from the manifest leaves the index and its cached
// files the same day (thesvg's 24 hour takedown). The first build is bounded: the reads pass runs at
// a concurrency of 8 with 10 s per fetch inside a time budget under the function's maxDuration, a
// build that reaches the budget writes the partial file with `progress` and keeps `updatedAt` at
// the previous complete build's, and the next invocation resumes from the first slug without flags.
// A failed upstream keeps the previous file and records `lastError`. The store is the disk under
// the state folder on a checkout and the tmp store, the public Blob store hosted (logos.ts binds
// it); the upstream is the network, the ten mark fixture (`TURBOSLIDE_LOGO_UPSTREAM=fixture`) or
// nothing at all (`down`), so the rows can be driven without thesvg.org. Framework free; the
// rasterizer is injected so the tests run without sharp where they measure nothing.
//
// The hotfix of ship one (build/hotfix.md section 2; ship.md 13.4): the index's pathname is
// written by the refresh alone. A discovery an instance makes between refreshes (a mark cached on
// a first fetch, a variant found missing or broken) goes to the small side record
// `system/logo-discoveries.json`, which every instance merges into the index it reads at its load
// and the refresh folds into the file it writes, then clears. Before this every discovery
// rewrote the 3.6 MB index, and the public store's edge refuses a just written pathname for two
// to three minutes, so a seller's searches opened a window in which every logo route of a cold
// instance answered 500. In that window the Blob store's `readIndex` answers this instance's disk
// mirror when it holds one, and throws the store's own error otherwise, which logos.ts turns
// into a 503 with `retry-after`; nothing here answers an empty index for a store condition.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import {
  LOGO_BRAND_COLLECTIONS,
  isBrandCollection,
  isOpenLicence,
} from '@turboslide/chrome/logo-model';
import type { LogoIndexFacts, LogoRow, LogoUnavailable } from '@turboslide/chrome/logo-model';
import { pinnedFetch, readCapped, resolvePinned } from '@turboslide/headless/capture/shared';
import { canonicalJson } from '@turboslide/schema/json';
import type { BlobClient } from '@turboslide/store/blob-store';

import { FIXTURE_DROPPED_SLUG, FIXTURE_ICONS } from './logo-fixtures/manifest';
import { FIXTURE_MARKS } from './logo-fixtures/marks';
import { LOGO_MAX_BYTES, sanitizeLogoSvg } from './logo-sanitize';
import type { SanitizedSvg } from './logo-sanitize';

// ---------------------------------------------------------------------------------------------
// The upstream (4.2; audit-logos 16)

/** `fixture` serves the ten marks, `down` answers nothing, unset reads the network. */
export const LOGO_UPSTREAM_ENV = 'TURBOSLIDE_LOGO_UPSTREAM';
export type LogoUpstreamMode = 'network' | 'fixture' | 'down';

export function logoUpstreamMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LogoUpstreamMode {
  const value = env[LOGO_UPSTREAM_ENV]?.trim().toLowerCase();
  if (value === 'fixture') return 'fixture';
  if (value === 'down') return 'down';
  return 'network';
}

/** The hosts the route fetches, its own list and never By URL's allowlist (audit-logos 16). */
export const LOGO_HOSTS: ReadonlyArray<string> = [
  'cdn.jsdelivr.net',
  'thesvg.org',
  'raw.githubusercontent.com',
];

/** The manifest, jsDelivr first and the GitHub raw address second (the audit's two addresses). */
export const LOGO_MANIFEST_URLS: ReadonlyArray<string> = [
  'https://cdn.jsdelivr.net/gh/glincker/thesvg@main/src/data/icons.json',
  'https://raw.githubusercontent.com/glincker/thesvg/main/src/data/icons.json',
];

/** The manifest is 3.3 MB today; the cap leaves room for growth. */
export const LOGO_MANIFEST_MAX_BYTES = 16 * 1024 * 1024;
/** One fetch of a mark or the manifest (4.2: 10 s). */
export const LOGO_FETCH_TIMEOUT_MS = 10_000;
export const LOGO_FETCH_MAX_REDIRECTS = 3;

/** The two addresses of a mark's file: jsDelivr first for the bulk pass, thesvg.org first for one insert (4.2). */
export function logoMarkUrls(path: string, mode: 'bulk' | 'single'): string[] {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const site = `https://thesvg.org${clean}`;
  const mirror = `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public${clean}`;
  return mode === 'bulk' ? [mirror, site] : [site, mirror];
}

/** The User-Agent every logo fetch sends (audit-logos 16, Wikimedia's policy applied to thesvg too). */
export function logoUserAgent(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const origin =
    env.TURBOSLIDE_PUBLIC_ORIGIN?.replace(/\/+$/, '') || 'https://turboslide.vercel.app';
  return `Turboslide/0.0.0 (+${origin})`;
}

export type UpstreamAnswer =
  | { ok: true; bytes: Uint8Array; contentType: string | null; url: string }
  | { ok: false; status: number; message: string; url: string };

export type LogoUpstream = {
  readonly mode: LogoUpstreamMode;
  manifest: () => Promise<UpstreamAnswer>;
  mark: (path: string, mode: 'bulk' | 'single') => Promise<UpstreamAnswer>;
};

/** A fetch the tests inject in place of the pinned one. */
export type LogoFetch = (
  url: URL,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

function hostAllowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return LOGO_HOSTS.some((allowed) => host === allowed);
}

/**
 * One fetch of an allowlisted address: the pinned lookup of the capture allowlist's own fetch,
 * the timeout, at most three redirects each re checked, the counted body; a status outside 2xx is
 * an answer, not a throw, so the caller can mark a variant unavailable with its status.
 */
export async function fetchLogoUrl(
  address: string,
  options: {
    maxBytes: number;
    fetchImpl?: LogoFetch;
    env?: Readonly<Record<string, string | undefined>>;
  },
): Promise<UpstreamAnswer> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { ok: false, status: 0, message: `not a URL: ${address}`, url: address };
  }
  const signal = AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS);
  const headers = {
    'user-agent': logoUserAgent(options.env),
    accept: 'image/svg+xml, application/json;q=0.9, */*;q=0.5',
  };
  for (let hop = 0; ; hop += 1) {
    if (url.protocol !== 'https:' || !hostAllowed(url))
      return {
        ok: false,
        status: 0,
        message: `host ${url.hostname} is not a logo source`,
        url: url.href,
      };
    let response: Response;
    try {
      response =
        options.fetchImpl !== undefined
          ? await options.fetchImpl(url, { signal, headers })
          : await pinnedFetch(url, await resolvePinned(url), { signal, headers });
    } catch (error) {
      const message = signal.aborted
        ? `${url.href}: no answer within ${LOGO_FETCH_TIMEOUT_MS} ms`
        : error instanceof Error
          ? error.message
          : String(error);
      return { ok: false, status: 0, message, url: url.href };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (location === null || hop >= LOGO_FETCH_MAX_REDIRECTS)
        return {
          ok: false,
          status: response.status,
          message: `${url.href}: HTTP ${response.status}`,
          url: url.href,
        };
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        status: response.status,
        message: `${url.href}: HTTP ${response.status}`,
        url: url.href,
      };
    }
    try {
      const bytes = await readCapped(response, options.maxBytes, url.href);
      return { ok: true, bytes, contentType: response.headers.get('content-type'), url: url.href };
    } catch (error) {
      return {
        ok: false,
        status: 413,
        message: error instanceof Error ? error.message : String(error),
        url: url.href,
      };
    }
  }
}

/** The network upstream: each address in turn, the first answer that is not a failure wins. */
export function networkUpstream(
  options: { fetchImpl?: LogoFetch; env?: Readonly<Record<string, string | undefined>> } = {},
): LogoUpstream {
  const tryEach = async (
    urls: ReadonlyArray<string>,
    maxBytes: number,
  ): Promise<UpstreamAnswer> => {
    let last: UpstreamAnswer | null = null;
    for (const address of urls) {
      const answer = await fetchLogoUrl(address, { maxBytes, ...options });
      if (answer.ok) return answer;
      last = answer;
      // a 404 on the site is a 404 on the mirror too when both serve one repository; the mirror
      // is still asked once, since the site's edge lags a commit by minutes
    }
    return last ?? { ok: false, status: 0, message: 'no address', url: '' };
  };
  return {
    mode: 'network',
    manifest: () => tryEach(LOGO_MANIFEST_URLS, LOGO_MANIFEST_MAX_BYTES),
    mark: (path, mode) => tryEach(logoMarkUrls(path, mode), LOGO_MAX_BYTES),
  };
}

/** The sentence a failed upstream answers (4.9). */
export const LOGO_DOWN_MESSAGE = 'thesvg.org did not answer';

/** `TURBOSLIDE_LOGO_UPSTREAM=down`: every call fails at once, the way an unreachable host does. */
export function downUpstream(): LogoUpstream {
  const fail = (url: string): UpstreamAnswer => ({
    ok: false,
    status: 0,
    message: LOGO_DOWN_MESSAGE,
    url,
  });
  return {
    mode: 'down',
    manifest: async () => fail(LOGO_MANIFEST_URLS[0] ?? ''),
    mark: async (path) => fail(logoMarkUrls(path, 'single')[0] ?? path),
  };
}

/**
 * `TURBOSLIDE_LOGO_UPSTREAM=fixture`: the ten marks of logo-fixtures, one variant path answering
 * 404 (the manifest lists it, no file has it) and one slug dropped from the manifest once the
 * index already holds it, so the second refresh takes it down (4.9). Deterministic across
 * function instances because the decision reads the shared index, not a counter.
 */
export function fixtureUpstream(currentIndex: () => LogoIndex | null): LogoUpstream {
  const encoder = new TextEncoder();
  return {
    mode: 'fixture',
    manifest: async () => {
      const index = currentIndex();
      const holds = index?.icons.some((row) => row.slug === FIXTURE_DROPPED_SLUG) === true;
      const icons = holds
        ? FIXTURE_ICONS.filter((icon) => icon.slug !== FIXTURE_DROPPED_SLUG)
        : FIXTURE_ICONS;
      return {
        ok: true,
        bytes: encoder.encode(JSON.stringify(icons)),
        contentType: 'application/json',
        url: 'fixture://icons.json',
      };
    },
    mark: async (path) => {
      const named = path.startsWith('/') ? path : `/${path}`;
      const text = FIXTURE_MARKS[named];
      // the takedown removes the files too (TRADEMARK.md): once a built index no longer holds the
      // dropped slug (the refresh above took it down) its files answer 404, as thesvg.org's do
      // after a removal; while the index holds it, or before the first build, the files serve
      const index = currentIndex();
      const dropped =
        index !== null &&
        index.icons.length > 0 &&
        !index.icons.some((row) => row.slug === FIXTURE_DROPPED_SLUG) &&
        FIXTURE_ICONS.some(
          (icon) =>
            icon.slug === FIXTURE_DROPPED_SLUG && Object.values(icon.variants).includes(named),
        );
      if (text === undefined || dropped)
        return {
          ok: false,
          status: 404,
          message: `fixture: HTTP 404 for ${path}`,
          url: `fixture://${path}`,
        };
      return {
        ok: true,
        bytes: encoder.encode(text),
        contentType: 'image/svg+xml',
        url: `fixture://${path}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The index file (4.2)

/** A cached sanitized file in the store: when it was written and the digest of its bytes. */
export type CachedMark = { at: string; digest: string; bytes: number };

export type LogoIndex = LogoIndexFacts & {
  v: 1;
  source: 'thesvg.org';
  /** the time of the last write, complete or partial; null before the first */
  builtAt: string | null;
  icons: LogoRow[];
  /** `<slug>/<variant>` of every sanitized file the store holds (open licences alone, 4.2) */
  cached: Record<string, CachedMark>;
};

export function emptyLogoIndex(): LogoIndex {
  return { v: 1, source: 'thesvg.org', updatedAt: null, builtAt: null, icons: [], cached: {} };
}

const SLUG = /^[a-z0-9][a-z0-9._-]{0,199}$/;
const VARIANT_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const MARK_PATH = /^\/icons\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.svg$/;

export function isLogoSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value);
}

export function isLogoVariantKey(value: unknown): value is string {
  return typeof value === 'string' && VARIANT_KEY.test(value);
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.slice(0, 200))
    .slice(0, max);
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** One `icons.json` record as an index row, or null for a record the picker cannot use. */
export function rowOfIcon(raw: unknown): LogoRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isLogoSlug(record.slug)) return null;
  if (typeof record.title !== 'string' || record.title.trim() === '') return null;
  if (typeof record.variants !== 'object' || record.variants === null) return null;
  const variants: Record<string, string> = {};
  for (const [key, path] of Object.entries(record.variants as Record<string, unknown>)) {
    if (!isLogoVariantKey(key) || typeof path !== 'string' || !MARK_PATH.test(path)) continue;
    variants[key] = path;
  }
  if (variants.default === undefined) return null;
  const url = httpUrl(record.url);
  const guidelines = httpUrl(record.guidelines);
  const row: LogoRow = {
    slug: record.slug,
    title: record.title.trim().slice(0, 200),
    aliases: stringList(record.aliases, 20),
    categories: stringList(record.categories, 20),
    variants,
    license:
      typeof record.license === 'string' && record.license.trim() !== ''
        ? record.license.trim().slice(0, 400)
        : 'Unknown',
    collection:
      typeof record.collection === 'string' && record.collection.trim() !== ''
        ? record.collection.trim().slice(0, 40)
        : 'brands',
  };
  if (typeof record.hex === 'string' && /^[0-9a-fA-F]{3,8}$/.test(record.hex)) row.hex = record.hex;
  if (url !== undefined) row.url = url;
  if (guidelines !== undefined) row.guidelines = guidelines;
  if (typeof record.dateAdded === 'string' && /^\d{4}-\d{2}-\d{2}/.test(record.dateAdded))
    row.dateAdded = record.dateAdded.slice(0, 10);
  return row;
}

/** The manifest's records: the top level list, or `{ icons: [...] }`. */
export function rowsOfManifest(raw: unknown): LogoRow[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { icons?: unknown }).icons)
      ? (raw as { icons: unknown[] }).icons
      : null;
  if (list === null) throw new TypeError('the manifest is not a list of icons');
  const seen = new Set<string>();
  const rows: LogoRow[] = [];
  for (const entry of list) {
    const row = rowOfIcon(entry);
    if (row === null || seen.has(row.slug)) continue;
    seen.add(row.slug);
    rows.push(row);
  }
  return rows;
}

function isUnavailable(value: unknown): value is LogoUnavailable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { at?: unknown }).at === 'string'
  );
}

/** The index as this module wrote it; null for anything else (a truncated put, another shape). */
export function parseLogoIndex(raw: unknown): LogoIndex | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.icons)) return null;
  const icons: LogoRow[] = [];
  for (const entry of record.icons) {
    const row = rowOfIcon(entry);
    if (row === null) continue;
    const extra = entry as Record<string, unknown>;
    if (typeof extra.readsOnPaper === 'boolean') row.readsOnPaper = extra.readsOnPaper;
    if (typeof extra.readsOnInk === 'boolean') row.readsOnInk = extra.readsOnInk;
    if (typeof extra.unavailable === 'object' && extra.unavailable !== null) {
      const unavailable: Record<string, LogoUnavailable> = {};
      for (const [key, value] of Object.entries(extra.unavailable as Record<string, unknown>))
        if (isLogoVariantKey(key) && isUnavailable(value)) unavailable[key] = value;
      if (Object.keys(unavailable).length > 0) row.unavailable = unavailable;
    }
    icons.push(row);
  }
  const cached: Record<string, CachedMark> = {};
  if (typeof record.cached === 'object' && record.cached !== null) {
    for (const [key, value] of Object.entries(record.cached as Record<string, unknown>)) {
      const mark = value as { at?: unknown; digest?: unknown; bytes?: unknown } | null;
      if (
        /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key) &&
        mark !== null &&
        typeof mark.at === 'string' &&
        typeof mark.digest === 'string'
      )
        cached[key] = {
          at: mark.at,
          digest: mark.digest,
          bytes: typeof mark.bytes === 'number' ? mark.bytes : 0,
        };
    }
  }
  const index: LogoIndex = {
    v: 1,
    source: 'thesvg.org',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    builtAt: typeof record.builtAt === 'string' ? record.builtAt : null,
    icons,
    cached,
  };
  const lastError = record.lastError as
    { at?: unknown; status?: unknown; message?: unknown } | undefined;
  if (lastError !== undefined && lastError !== null && typeof lastError.at === 'string')
    index.lastError = {
      at: lastError.at,
      message: typeof lastError.message === 'string' ? lastError.message : LOGO_DOWN_MESSAGE,
      ...(typeof lastError.status === 'number' ? { status: lastError.status } : {}),
    };
  const progress = record.progress as { done?: unknown; total?: unknown } | undefined;
  if (
    progress !== undefined &&
    progress !== null &&
    typeof progress.done === 'number' &&
    typeof progress.total === 'number'
  )
    index.progress = { done: progress.done, total: progress.total };
  return index;
}

export function logoIndexBytes(index: LogoIndex): Uint8Array {
  return new TextEncoder().encode(canonicalJson(index));
}

/** The key of a cached mark in `index.cached` and its path in the store. */
export function cachedMarkKey(slug: string, variant: string): string {
  return `${slug}/${variant}`;
}

/** `<slug>/<variant>` of every cached mark of a slug. */
export function cachedKeysOfSlug(index: LogoIndex, slug: string): string[] {
  return Object.keys(index.cached).filter((key) => key.startsWith(`${slug}/`));
}

// ---------------------------------------------------------------------------------------------
// The store: the disk of a checkout, the public Blob store hosted (4.2)

export type LogoStore = {
  readonly kind: 'disk' | 'blob' | 'memory';
  /**
   * the stored index, or null when the store holds none; a read the store refuses for now (the
   * public store's edge on a just written file, a 429, the deadline; store/pulse.ts
   * `isStoreBusy`) throws the store's error, never answers null, so a caller can tell "not
   * there" from "not now"
   */
  readIndex: () => Promise<LogoIndex | null>;
  /**
   * the copy of the index this instance holds on disk from its last read or write (the Blob
   * store's mirror folder, the disk store's own file); null when none. Read when the store
   * refuses the index (logos.ts `load`), never in place of the store: its version is unknown
   */
  readMirror: () => Promise<LogoIndex | null>;
  /** the version of the stored index (an etag, an mtime), for a cheap revalidation; null when none */
  indexVersion: () => Promise<string | null>;
  writeIndex: (index: LogoIndex) => Promise<void>;
  readMark: (slug: string, variant: string) => Promise<Uint8Array | null>;
  writeMark: (slug: string, variant: string, bytes: Uint8Array) => Promise<void>;
  removeMarks: (keys: ReadonlyArray<string>) => Promise<void>;
  /** the side record of the discoveries made since the last refresh (`LogoDiscoveries`); null when none */
  readDiscoveries: () => Promise<LogoDiscoveries | null>;
  writeDiscoveries: (record: LogoDiscoveries) => Promise<void>;
};

/**
 * The discoveries the instances make between two refreshes (build/hotfix.md section 2): the
 * marks cached on a first fetch and the variants found missing or broken, keyed as the index
 * keys them. One small file for every instance, merged at each write (`mergeLogoDiscoveries`),
 * merged into the index an instance loads (`applyLogoDiscoveries`) and folded into the index by
 * the refresh alone, which then clears it. Under a hundred rows on a busy day, against the 3.6 MB
 * index it used to rewrite.
 */
export type LogoDiscoveries = {
  v: 1;
  /** the time of the last write */
  at: string;
  cached: Record<string, CachedMark>;
  unavailable: Record<string, Record<string, LogoUnavailable>>;
};

export function emptyLogoDiscoveries(at = new Date(0).toISOString()): LogoDiscoveries {
  return { v: 1, at, cached: {}, unavailable: {} };
}

/** True when the record names nothing. */
export function discoveriesEmpty(record: LogoDiscoveries): boolean {
  return Object.keys(record.cached).length === 0 && Object.keys(record.unavailable).length === 0;
}

export function parseLogoDiscoveries(raw: unknown): LogoDiscoveries | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1) return null;
  const out = emptyLogoDiscoveries(typeof record.at === 'string' ? record.at : undefined);
  if (typeof record.cached === 'object' && record.cached !== null) {
    for (const [key, value] of Object.entries(record.cached as Record<string, unknown>)) {
      const [slug, variant] = key.split('/');
      if (!isLogoSlug(slug) || !isLogoVariantKey(variant) || !isCachedMark(value)) continue;
      out.cached[key] = { at: value.at, digest: value.digest, bytes: value.bytes };
    }
  }
  if (typeof record.unavailable === 'object' && record.unavailable !== null) {
    for (const [slug, marks] of Object.entries(record.unavailable as Record<string, unknown>)) {
      if (!isLogoSlug(slug) || typeof marks !== 'object' || marks === null) continue;
      const kept: Record<string, LogoUnavailable> = {};
      for (const [variant, mark] of Object.entries(marks as Record<string, unknown>))
        if (isLogoVariantKey(variant) && isUnavailable(mark)) kept[variant] = mark;
      if (Object.keys(kept).length > 0) out.unavailable[slug] = kept;
    }
  }
  return out;
}

function isCachedMark(value: unknown): value is CachedMark {
  if (typeof value !== 'object' || value === null) return false;
  const mark = value as Record<string, unknown>;
  return (
    typeof mark.at === 'string' && typeof mark.digest === 'string' && typeof mark.bytes === 'number'
  );
}

export function logoDiscoveriesBytes(record: LogoDiscoveries): Uint8Array {
  return new TextEncoder().encode(canonicalJson(record));
}

/** The union of two records; where both name one variant, the later mark stands. */
export function mergeLogoDiscoveries(
  base: LogoDiscoveries,
  over: LogoDiscoveries,
  at: string,
): LogoDiscoveries {
  const out: LogoDiscoveries = {
    v: 1,
    at,
    cached: { ...base.cached },
    unavailable: {},
  };
  for (const [key, mark] of Object.entries(over.cached)) {
    const held = out.cached[key];
    if (held === undefined || held.at <= mark.at) out.cached[key] = mark;
  }
  for (const record of [base, over]) {
    for (const [slug, marks] of Object.entries(record.unavailable)) {
      const kept = { ...(out.unavailable[slug] ?? {}) };
      for (const [variant, mark] of Object.entries(marks)) {
        const held = kept[variant];
        if (held === undefined || held.at <= mark.at) kept[variant] = mark;
      }
      out.unavailable[slug] = kept;
    }
  }
  return out;
}

/**
 * Writes the record's discoveries into an index, in place: a cached mark whose slug and variant
 * the index lists under an open licence, and an unavailable mark of a variant the row has, where
 * the index does not already record one. What the record names and the index does not hold (a
 * dropped slug) is left out, as the refresh's eviction leaves it out.
 */
export function applyLogoDiscoveries(index: LogoIndex, record: LogoDiscoveries): number {
  const bySlug = new Map(index.icons.map((row) => [row.slug, row]));
  let applied = 0;
  for (const [key, mark] of Object.entries(record.cached)) {
    if (index.cached[key] !== undefined) continue;
    const [slug, variant] = key.split('/') as [string, string];
    const row = bySlug.get(slug);
    if (row === undefined || row.variants[variant] === undefined || !isOpenLicence(row.license))
      continue;
    index.cached[key] = mark;
    applied += 1;
  }
  for (const [slug, marks] of Object.entries(record.unavailable)) {
    const row = bySlug.get(slug);
    if (row === undefined) continue;
    for (const [variant, mark] of Object.entries(marks)) {
      if (row.variants[variant] === undefined || row.unavailable?.[variant] !== undefined) continue;
      row.unavailable = { ...(row.unavailable ?? {}), [variant]: mark };
      applied += 1;
    }
  }
  return applied;
}

/** The index and the sanitized marks under the store: `system/logo-index.json`, `system/logos/<slug>/<variant>.svg`. */
export const LOGO_INDEX_PATH = 'system/logo-index.json';
/** The side record of the discoveries between refreshes (build/hotfix.md section 2). */
export const LOGO_DISCOVERIES_PATH = 'system/logo-discoveries.json';
export const LOGO_MARKS_PREFIX = 'system/logos/';
/** A cached mark leaves the store after a week (4.2). */
export const LOGO_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** What the store's put carries for a mark: a week at the CDN (4.2). */
export const LOGO_CACHE_CONTROL_MAX_AGE_S = 7 * 24 * 60 * 60;

function markPathname(slug: string, variant: string): string {
  if (!isLogoSlug(slug) || !isLogoVariantKey(variant))
    throw new RangeError(`not a mark: ${slug}/${variant}`);
  return `${LOGO_MARKS_PREFIX}${slug}/${variant}.svg`;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** The store of a checkout and the tmp backend: `<dir>/index.json`, `<dir>/discoveries.json` and `<dir>/marks/<slug>/<variant>.svg`. */
export function diskLogoStore(dir: string): LogoStore {
  const indexPath = join(dir, 'index.json');
  const discoveriesPath = join(dir, 'discoveries.json');
  const markPath = (slug: string, variant: string): string =>
    join(dir, 'marks', markPathname(slug, variant).slice(LOGO_MARKS_PREFIX.length));
  return {
    kind: 'disk',
    async readIndex() {
      if (!existsSync(indexPath)) return null;
      return parseLogoIndex(readJson(indexPath));
    },
    async readMirror() {
      // the disk never refuses a read; its own file is the copy
      if (!existsSync(indexPath)) return null;
      return parseLogoIndex(readJson(indexPath));
    },
    async indexVersion() {
      if (!existsSync(indexPath)) return null;
      return String(statSync(indexPath).mtimeMs);
    },
    async writeIndex(index) {
      mkdirSync(dir, { recursive: true });
      const bytes = logoIndexBytes(index);
      writeFileSync(`${indexPath}.part`, bytes);
      rmSync(indexPath, { force: true });
      writeFileSync(indexPath, bytes);
      rmSync(`${indexPath}.part`, { force: true });
    },
    async readDiscoveries() {
      if (!existsSync(discoveriesPath)) return null;
      return parseLogoDiscoveries(readJson(discoveriesPath));
    },
    async writeDiscoveries(record) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(discoveriesPath, logoDiscoveriesBytes(record));
    },
    async readMark(slug, variant) {
      const path = markPath(slug, variant);
      if (!existsSync(path)) return null;
      return new Uint8Array(readFileSync(path));
    },
    async writeMark(slug, variant, bytes) {
      const path = markPath(slug, variant);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    },
    async removeMarks(keys) {
      for (const key of keys) {
        const [slug, variant] = key.split('/');
        if (slug === undefined || variant === undefined) continue;
        rmSync(markPath(slug, variant), { force: true });
      }
    },
  };
}

/**
 * The public Blob store hosted (4.2, 4.10): the index under `system/logo-index.json` with
 * `overwrite`, each cached mark under `system/logos/<slug>/<variant>.svg` with its content type
 * and a week of `cacheControlMaxAge` and no other metadata (the attribution is inside the file),
 * the side record of the discoveries under `system/logo-discoveries.json`. A mirror folder keeps
 * this instance's last read and write of the index (`readMirror`), so a read the store refuses
 * for now (the edge's window after the refresh wrote the file, ship.md 13.4) has a copy to fall
 * back on in logos.ts `load`; `readIndex` itself throws the store's error, so the service never
 * takes the copy for the store's current version.
 */
export function blobLogoStore(client: BlobClient, mirrorDir?: string): LogoStore {
  const mirror = mirrorDir === undefined ? null : diskLogoStore(mirrorDir);
  return {
    kind: 'blob',
    async readIndex() {
      const got = await client.get(LOGO_INDEX_PATH);
      if (got === null) return null;
      const index = parseLogoIndex(JSON.parse(new TextDecoder().decode(got.bytes)) as unknown);
      if (index !== null && mirror !== null) await mirror.writeIndex(index).catch(() => undefined);
      return index;
    },
    async readMirror() {
      return mirror === null ? null : mirror.readIndex().catch(() => null);
    },
    async indexVersion() {
      const head = await client.head(LOGO_INDEX_PATH);
      return head?.version ?? null;
    },
    async writeIndex(index) {
      await client.put(LOGO_INDEX_PATH, logoIndexBytes(index), {
        overwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      if (mirror !== null) await mirror.writeIndex(index).catch(() => undefined);
    },
    async readDiscoveries() {
      const got = await client.get(LOGO_DISCOVERIES_PATH);
      if (got === null) return null;
      return parseLogoDiscoveries(JSON.parse(new TextDecoder().decode(got.bytes)) as unknown);
    },
    async writeDiscoveries(record) {
      await client.put(LOGO_DISCOVERIES_PATH, logoDiscoveriesBytes(record), {
        overwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
    },
    async readMark(slug, variant) {
      const got = await client.get(markPathname(slug, variant));
      return got === null ? null : got.bytes;
    },
    async writeMark(slug, variant, bytes) {
      await client.put(markPathname(slug, variant), bytes, {
        overwrite: true,
        contentType: 'image/svg+xml',
        cacheControlMaxAge: LOGO_CACHE_CONTROL_MAX_AGE_S,
      });
    },
    async removeMarks(keys) {
      const pathnames: string[] = [];
      for (const key of keys) {
        const [slug, variant] = key.split('/');
        if (slug === undefined || variant === undefined) continue;
        pathnames.push(markPathname(slug, variant));
      }
      if (pathnames.length > 0) await client.del(pathnames);
    },
  };
}

/** An in memory store for the tests; `writes` counts the index writes, `discoveryWrites` the side record's. */
export function memoryLogoStore(): LogoStore & {
  marks: Map<string, Uint8Array>;
  writes: number;
  discoveryWrites: number;
} {
  let index: LogoIndex | null = null;
  let discoveries: LogoDiscoveries | null = null;
  let version = 0;
  const marks = new Map<string, Uint8Array>();
  const store = {
    kind: 'memory' as const,
    marks,
    writes: 0,
    discoveryWrites: 0,
    async readIndex() {
      return index === null ? null : parseLogoIndex(JSON.parse(canonicalJson(index)) as unknown);
    },
    async readMirror() {
      return null;
    },
    async indexVersion() {
      return index === null ? null : String(version);
    },
    async writeIndex(next: LogoIndex) {
      index = JSON.parse(canonicalJson(next)) as LogoIndex;
      version += 1;
      store.writes += 1;
    },
    async readDiscoveries() {
      return discoveries === null
        ? null
        : parseLogoDiscoveries(JSON.parse(canonicalJson(discoveries)) as unknown);
    },
    async writeDiscoveries(record: LogoDiscoveries) {
      discoveries = JSON.parse(canonicalJson(record)) as LogoDiscoveries;
      store.discoveryWrites += 1;
    },
    async readMark(slug: string, variant: string) {
      return marks.get(cachedMarkKey(slug, variant)) ?? null;
    },
    async writeMark(slug: string, variant: string, bytes: Uint8Array) {
      marks.set(cachedMarkKey(slug, variant), bytes);
    },
    async removeMarks(keys: ReadonlyArray<string>) {
      for (const key of keys) marks.delete(key);
    },
  };
  return store;
}

// ---------------------------------------------------------------------------------------------
// The reads measure (4.2; audit-logos 6, raster-check.mjs)

/** The height a default is rasterized at for its two flags. */
export const READS_HEIGHT_PX = 96;
/** A mark reads when over this fraction of its pixels differ from the ground by more than 40 luminance steps. */
export const READS_LIT_FRACTION = 0.002;
export const READS_LUMINANCE_STEPS = 40;

export type Raster = { data: Uint8Array; width: number; height: number };
/** Rasterizes an SVG to RGBA at a height in px; null when the rasterizer refuses the file. */
export type Rasterizer = (
  svg: string,
  size: { height?: number; width?: number },
) => Promise<Raster | null>;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The fraction of pixels that differ from a grey ground (0 ink, 255 paper) by more than 40 steps, alpha blended. */
export function litFraction(raster: Raster, ground: number): number {
  const n = raster.width * raster.height;
  if (n === 0) return 0;
  let lit = 0;
  const data = raster.data;
  for (let i = 0; i < n; i += 1) {
    const a = (data[i * 4 + 3] ?? 0) / 255;
    const r = (data[i * 4] ?? 0) * a + ground * (1 - a);
    const g = (data[i * 4 + 1] ?? 0) * a + ground * (1 - a);
    const b = (data[i * 4 + 2] ?? 0) * a + ground * (1 - a);
    if (Math.abs(luminance(r, g, b) - ground) > READS_LUMINANCE_STEPS) lit += 1;
  }
  return lit / n;
}

/** The density that renders an SVG of `intrinsic` user units at `target` px on its long side. */
export function densityFor(intrinsic: readonly [number, number], target: number): number {
  const long = Math.max(intrinsic[0], intrinsic[1], 1);
  return Math.max(1, Math.min(2400, Math.round((72 * target) / long)));
}

/**
 * sharp over librsvg (the rasterizer packages/export carries): the buffer alone, no base URL, so
 * nothing outside the file is read; the SVG is refused at the sanitizer already. Null when
 * librsvg refuses the file.
 */
export function sharpRasterizer(): Rasterizer {
  return async (svg, size) => {
    const bytes = Buffer.from(svg, 'utf8');
    try {
      const meta = await sharp(bytes, { failOn: 'error' }).metadata();
      const intrinsic: [number, number] = [meta.width ?? 100, meta.height ?? 100];
      const target = Math.max(size.height ?? 0, size.width ?? 0, 1);
      const density = densityFor(intrinsic, target);
      const { data, info } = await sharp(bytes, {
        density,
        failOn: 'error',
        limitInputPixels: 64_000_000,
      })
        .resize({
          ...(size.height !== undefined ? { height: size.height } : {}),
          ...(size.width !== undefined ? { width: size.width } : {}),
          fit: 'inside',
          withoutEnlargement: false,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height,
      };
    } catch {
      return null;
    }
  };
}

/** The two flags of a sanitized default (4.2): read on paper, read on ink; null when it does not rasterize. */
export async function readsFlagsOf(
  svg: string,
  rasterize: Rasterizer,
): Promise<{ readsOnPaper: boolean; readsOnInk: boolean } | null> {
  const raster = await rasterize(svg, { height: READS_HEIGHT_PX });
  if (raster === null) return null;
  return {
    readsOnPaper: litFraction(raster, 255) > READS_LIT_FRACTION,
    readsOnInk: litFraction(raster, 0) > READS_LIT_FRACTION,
  };
}

// ---------------------------------------------------------------------------------------------
// The refresh (4.2)

/** The reads pass runs inside this budget under the function's 300 s maxDuration. */
export const REFRESH_BUDGET_MS = 240_000;
export const REFRESH_CONCURRENCY = 8;
/** An unavailable default is asked again after this long. */
export const UNAVAILABLE_RETRY_MS = 20 * 60 * 60 * 1000;

export type RefreshCounts = {
  icons: number;
  brands: number;
  cachedMarks: number;
  unavailable: number;
  updatedAt: string | null;
  builtAt: string | null;
  lastError?: LogoIndex['lastError'];
  progress?: LogoIndex['progress'];
  /** the marks fetched for their flags in this call (0 on a dry run) */
  fetched: number;
  /** the slugs that left the index in this call */
  dropped: string[];
  dryRun: boolean;
  /** the upstream this call read */
  upstream: LogoUpstreamMode;
};

export type RefreshDeps = {
  store: LogoStore;
  upstream: LogoUpstream;
  rasterize?: Rasterizer;
  sanitize?: (bytes: Uint8Array) => SanitizedSvg;
  now?: () => Date;
  budgetMs?: number;
  concurrency?: number;
  log?: (line: string) => void;
  /**
   * the discoveries the caller holds beside the store's side record (the instance's own, made
   * since its last persist; logos.ts `refresh`), folded into the index with the record's
   */
  discoveries?: LogoDiscoveries;
  /**
   * called with every index this refresh writes (the built one, or the previous with
   * `lastError`), so the caller adopts it without reading the just written file back through
   * the store's edge (build/hotfix.md section 2)
   */
  onWritten?: (index: LogoIndex) => void;
};

/** The counts a dry run answers and a refresh returns (4.2). */
export function indexCounts(
  index: LogoIndex,
  upstream: LogoUpstreamMode,
  dryRun: boolean,
): RefreshCounts {
  let unavailable = 0;
  for (const row of index.icons)
    if (row.unavailable !== undefined) unavailable += Object.keys(row.unavailable).length;
  return {
    icons: index.icons.length,
    brands: index.icons.filter((row) => isBrandCollection(row.collection)).length,
    cachedMarks: Object.keys(index.cached).length,
    unavailable,
    updatedAt: index.updatedAt,
    builtAt: index.builtAt,
    ...(index.lastError !== undefined ? { lastError: index.lastError } : {}),
    ...(index.progress !== undefined ? { progress: index.progress } : {}),
    fetched: 0,
    dropped: [],
    dryRun,
    upstream,
  };
}

/**
 * The upstream rows merged over the previous index: a row keeps its flags and its unavailable
 * marks while its default path is the same file (a changed path is a new drawing); an unavailable
 * mark of a variant the manifest no longer lists is forgotten; a slug the manifest lacks is
 * dropped. Answers the rows in manifest order and the dropped slugs.
 */
export function mergeLogoRows(
  previous: ReadonlyArray<LogoRow>,
  upstream: ReadonlyArray<LogoRow>,
): { rows: LogoRow[]; dropped: string[] } {
  const before = new Map(previous.map((row) => [row.slug, row]));
  const rows: LogoRow[] = [];
  for (const fresh of upstream) {
    const old = before.get(fresh.slug);
    const row: LogoRow = { ...fresh };
    if (old !== undefined && old.variants.default === fresh.variants.default) {
      if (old.readsOnPaper !== undefined) row.readsOnPaper = old.readsOnPaper;
      if (old.readsOnInk !== undefined) row.readsOnInk = old.readsOnInk;
    }
    if (old?.unavailable !== undefined) {
      const kept: Record<string, LogoUnavailable> = {};
      for (const [key, mark] of Object.entries(old.unavailable))
        if (fresh.variants[key] !== undefined && fresh.variants[key] === old.variants[key])
          kept[key] = mark;
      if (Object.keys(kept).length > 0) row.unavailable = kept;
    }
    rows.push(row);
  }
  const fresh = new Set(upstream.map((row) => row.slug));
  const dropped = previous.filter((row) => !fresh.has(row.slug)).map((row) => row.slug);
  return { rows, dropped };
}

/** True for a brand row whose default still wants its flags (never measured, or unavailable long enough to retry). */
export function wantsFlags(row: LogoRow, now: number): boolean {
  if (!isBrandCollection(row.collection)) return false;
  if (row.readsOnPaper !== undefined && row.readsOnInk !== undefined) return false;
  const missing = row.unavailable?.default;
  if (missing === undefined) return true;
  const at = new Date(missing.at).getTime();
  return !Number.isFinite(at) || now - at > UNAVAILABLE_RETRY_MS;
}

function markUnavailable(row: LogoRow, variant: string, mark: LogoUnavailable): void {
  row.unavailable = { ...(row.unavailable ?? {}), [variant]: mark };
}

function clearUnavailable(row: LogoRow, variant: string): void {
  if (row.unavailable === undefined) return;
  const { [variant]: _gone, ...rest } = row.unavailable;
  row.unavailable = Object.keys(rest).length > 0 ? rest : undefined;
  if (row.unavailable === undefined) delete row.unavailable;
}

/**
 * Fetches, sanitizes and rasterizes one row's default for its flags (4.2): a 404, a 5xx, a broken
 * file or a drop that draws marks the default unavailable; a mark whose rasterizer refuses it
 * keeps no flags and is marked broken. Answers what it did for the counts.
 */
export async function measureRow(
  row: LogoRow,
  deps: Required<Pick<RefreshDeps, 'upstream' | 'rasterize' | 'sanitize'>> & { now: () => Date },
): Promise<'flagged' | 'unavailable' | 'failed'> {
  const path = row.variants.default;
  if (path === undefined) return 'failed';
  const at = deps.now().toISOString();
  const answer = await deps.upstream.mark(path, 'bulk');
  if (!answer.ok) {
    if (answer.status === 0) return 'failed';
    markUnavailable(row, 'default', { at, status: answer.status, reason: 'missing' });
    return 'unavailable';
  }
  let sanitized: SanitizedSvg;
  try {
    sanitized = deps.sanitize(answer.bytes);
  } catch {
    markUnavailable(row, 'default', { at, status: 422, reason: 'broken' });
    return 'unavailable';
  }
  if (sanitized.draws) {
    markUnavailable(row, 'default', { at, reason: 'sanitized' });
    return 'unavailable';
  }
  const flags = await readsFlagsOf(sanitized.svg, deps.rasterize);
  if (flags === null) {
    markUnavailable(row, 'default', { at, status: 422, reason: 'broken' });
    return 'unavailable';
  }
  clearUnavailable(row, 'default');
  row.readsOnPaper = flags.readsOnPaper;
  row.readsOnInk = flags.readsOnInk;
  return 'flagged';
}

/**
 * `POST /api/logo/refresh` and `logo.refresh` (4.2): the manifest fetched once, the rows merged,
 * the dropped slugs' cached files removed, the stale cached marks evicted, the reads pass over the
 * brand rows without flags at the concurrency inside the budget, the file written (complete or
 * partial with `progress`). `dryRun` answers the counts with no upstream fetch and no write. The
 * discoveries since the last refresh (the store's side record and the caller's own) are folded
 * into the previous index first, so the cached marks and the unavailable variants the instances
 * found ride into the file, and the side record is cleared once the file is written
 * (build/hotfix.md section 2); a dry run reads the record and clears nothing.
 */
export async function refreshLogoIndex(
  deps: RefreshDeps,
  options: { dryRun?: boolean } = {},
): Promise<RefreshCounts> {
  const now = deps.now ?? (() => new Date());
  const previous = (await deps.store.readIndex()) ?? emptyLogoIndex();
  // the side record is small and best effort: a read the store refuses leaves the discoveries
  // for the next refresh, and the caller's own copy still folds in
  const recorded = await deps.store.readDiscoveries().catch(() => null);
  if (recorded !== null) applyLogoDiscoveries(previous, recorded);
  if (deps.discoveries !== undefined) applyLogoDiscoveries(previous, deps.discoveries);
  if (options.dryRun === true) return indexCounts(previous, deps.upstream.mode, true);
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? REFRESH_BUDGET_MS;
  const concurrency = Math.max(1, deps.concurrency ?? REFRESH_CONCURRENCY);
  const sanitize = deps.sanitize ?? ((bytes: Uint8Array) => sanitizeLogoSvg(bytes));
  const rasterize = deps.rasterize ?? sharpRasterizer();
  const log = deps.log ?? (() => undefined);
  const write = async (index: LogoIndex): Promise<void> => {
    await deps.store.writeIndex(index);
    deps.onWritten?.(index);
  };

  const manifest = await deps.upstream.manifest();
  if (!manifest.ok) {
    const failed: LogoIndex = {
      ...previous,
      builtAt: now().toISOString(),
      lastError: { at: now().toISOString(), status: manifest.status, message: manifest.message },
    };
    await write(failed);
    log(
      `logo refresh: the manifest did not answer (${manifest.message}); the previous index stands`,
    );
    return indexCounts(failed, deps.upstream.mode, false);
  }
  let upstreamRows: LogoRow[];
  try {
    upstreamRows = rowsOfManifest(JSON.parse(new TextDecoder().decode(manifest.bytes)) as unknown);
  } catch (error) {
    const failed: LogoIndex = {
      ...previous,
      builtAt: now().toISOString(),
      lastError: {
        at: now().toISOString(),
        status: 422,
        message: `the manifest did not parse: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
    await write(failed);
    return indexCounts(failed, deps.upstream.mode, false);
  }
  if (upstreamRows.length === 0) {
    const failed: LogoIndex = {
      ...previous,
      builtAt: now().toISOString(),
      lastError: { at: now().toISOString(), status: 422, message: 'the manifest lists no icons' },
    };
    await write(failed);
    return indexCounts(failed, deps.upstream.mode, false);
  }

  const { rows, dropped } = mergeLogoRows(previous.icons, upstreamRows);
  // the takedown (4.2): a slug the manifest lacks leaves with its cached files the same day; a
  // cached mark older than a week, or of a variant gone or unavailable, leaves too
  const cached: Record<string, CachedMark> = {};
  const evict: string[] = [];
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const nowMs = now().getTime();
  for (const [key, mark] of Object.entries(previous.cached)) {
    const [slug, variant] = key.split('/') as [string, string];
    const row = bySlug.get(slug);
    const at = new Date(mark.at).getTime();
    const stale = !Number.isFinite(at) || nowMs - at > LOGO_CACHE_MAX_AGE_MS;
    if (
      row === undefined ||
      row.variants[variant] === undefined ||
      row.unavailable?.[variant] !== undefined ||
      stale ||
      !isOpenLicence(row.license)
    )
      evict.push(key);
    else cached[key] = mark;
  }
  if (evict.length > 0) await deps.store.removeMarks(evict).catch(() => undefined);

  // the reads pass: the brand rows without flags, in manifest order, at the concurrency, inside
  // the budget; a stop leaves `progress` so the next invocation resumes from the first without flags
  const pending = rows.filter((row) => wantsFlags(row, nowMs));
  const brandTotal = rows.filter((row) => isBrandCollection(row.collection)).length;
  let fetched = 0;
  let stopped = false;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (Date.now() - started > budgetMs) {
        stopped = true;
        return;
      }
      const row = pending[cursor];
      cursor += 1;
      if (row === undefined) return;
      fetched += 1;
      await measureRow(row, { upstream: deps.upstream, rasterize, sanitize, now });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  const remaining = rows.filter((row) => wantsFlags(row, nowMs)).length;
  const complete = !stopped && remaining === 0;
  const stamp = now().toISOString();
  const next: LogoIndex = {
    v: 1,
    source: 'thesvg.org',
    updatedAt: complete ? stamp : previous.updatedAt,
    builtAt: stamp,
    icons: rows,
    cached,
  };
  if (!complete) next.progress = { done: brandTotal - remaining, total: brandTotal };
  await write(next);
  // the discoveries are in the file now: the record is cleared, best effort, so the next load
  // and the next refresh fold nothing twice (a put the store refuses leaves a record whose
  // entries the index already holds, which applyLogoDiscoveries skips)
  if (recorded !== null && !discoveriesEmpty(recorded))
    await deps.store
      .writeDiscoveries(emptyLogoDiscoveries(stamp))
      .catch((error: unknown) =>
        log(
          `logo refresh: the discoveries record did not clear (${error instanceof Error ? error.message : String(error)})`,
        ),
      );
  log(
    `logo refresh: ${rows.length} icons, ${brandTotal} brand marks, ${fetched} fetched, ${remaining} without flags, ${dropped.length} dropped, ${evict.length} cached files evicted${complete ? '' : ' (partial, the next refresh resumes)'} in ${Date.now() - started} ms`,
  );
  return { ...indexCounts(next, deps.upstream.mode, false), fetched, dropped };
}

/** The sha256 hex of a file's bytes, the digest the asset's source record and the cache carry. */
export function logoDigest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The brand collections, re exported for the callers that need the list beside the index. */
export { LOGO_BRAND_COLLECTIONS };

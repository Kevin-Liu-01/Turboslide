// The copy of one Blob store into another (hardening O#1a, docs/hardening/HARDENING.md 4.8;
// RELIABILITY-13). One module for every store to store copy: `scripts/blob-copy.mjs` (the hosting
// move's fallback, docs/HOSTING-MOVE.md section 3) runs it over the SDK, and the nightly backup
// (apps/studio/src/server/backup.ts) runs it over the store's own clients. It moved here from
// `blob-copy.mjs` unchanged in what a pass does, with three additions for the backup: a deadline
// after which no object starts (the cron call's budget), `replaceDiffering` (a backup copy the
// source has moved past is replaced, where the move's plain pass lists it as a conflict), and the
// two adapters below (`prefixedCopyClient`, `copyClientOf`).
//
// The pass: for every entry, `head` the target (an object already there with the source's etag
// is skipped, so a pass that stopped resumes where it was), `get` the source's bytes and one
// `head` for `contentType` and `cacheControl`, then `put` under the same pathname with the same
// content type and max age, and compare the returned etag with the source's; when they differ (a
// multipart upload's etag is not the body's md5) the target's body is read back and compared by
// the md5 of the bytes. Eight objects are in flight at a time.
//
// The module has no import but `node:crypto` and types, so `node scripts/blob-copy.mjs` loads it
// with Node's type stripping and no build.
import { createHash } from 'node:crypto';

import type { BlobClient } from './blob-store.ts';

export const DEFAULT_CONCURRENCY = 8;
export const DIFFERING_LISTED = 20;
/** The SDK refuses a cache max age under a minute. */
const MIN_CACHE_MAX_AGE_S = 60;

/** One object of a listing: the etag is the store's, quoted or not. */
export type CopyEntry = { pathname: string; size?: number; uploadedAt?: string; etag?: string };

export type CopyHead = CopyEntry & { contentType?: string; cacheControl?: string };

export type CopyPutOptions = {
  contentType?: string;
  cacheControlMaxAge?: number;
  /** overwrite what the target holds; with `ifMatch`, only while it still holds that etag */
  replace?: boolean;
  ifMatch?: string;
};

/** The four calls a copy makes of a store. */
export type CopyClient = {
  pages: (prefix?: string) => AsyncIterable<CopyEntry[]>;
  head: (pathname: string) => Promise<CopyHead | null>;
  get: (pathname: string) => Promise<{ bytes: Uint8Array; etag?: string } | null>;
  put: (pathname: string, bytes: Uint8Array, options: CopyPutOptions) => Promise<{ etag: string }>;
};

export type SkipRule =
  | { kind: 'exports-older-than'; ms: number; label: string }
  | { kind: 'turboslide-sidecars'; label: string };

/** `exports-older-than=1d,turboslide-sidecars` as rules; an unknown rule is refused by name. */
export function parseSkip(text: string): SkipRule[] {
  const rules: SkipRule[] = [];
  for (const part of String(text)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^exports-older-than=(\d+)([dh])$/.exec(part);
    if (m) {
      const ms = Number(m[1]) * (m[2] === 'd' ? 86_400_000 : 3_600_000);
      rules.push({ kind: 'exports-older-than', ms, label: part });
    } else if (part === 'turboslide-sidecars') {
      rules.push({ kind: 'turboslide-sidecars', label: part });
    } else {
      throw new RangeError(
        `unknown skip rule ${part}; the rules are exports-older-than=<n>d|h and turboslide-sidecars`,
      );
    }
  }
  return rules;
}

const SIDECAR = /^decks\/[^/]+\/\.turboslide\//;
const EXPORT_FILE = /^exports\/(?!\.jobs\/)/;

/** The skip rule an entry falls under, or null when it is copied. */
export function skipRuleOf(
  entry: CopyEntry,
  rules: ReadonlyArray<SkipRule>,
  now: number = Date.now(),
): string | null {
  for (const rule of rules) {
    if (rule.kind === 'turboslide-sidecars' && SIDECAR.test(entry.pathname)) return rule.label;
    if (rule.kind === 'exports-older-than' && EXPORT_FILE.test(entry.pathname)) {
      const at = entry.uploadedAt === undefined ? NaN : new Date(entry.uploadedAt).getTime();
      if (Number.isFinite(at) && now - at > rule.ms) return rule.label;
    }
  }
  return null;
}

export type SkippedCounts = Record<string, { objects: number; bytes: number }>;

/** Splits a source listing into the copied set and the skipped set, counted per rule. */
export function planCopy<E extends CopyEntry>(
  entries: ReadonlyArray<E>,
  rules: ReadonlyArray<SkipRule>,
  now: number = Date.now(),
): { copy: E[]; skipped: SkippedCounts } {
  const copy: E[] = [];
  const skipped: SkippedCounts = {};
  for (const entry of entries) {
    const rule = skipRuleOf(entry, rules, now);
    if (rule === null) {
      copy.push(entry);
    } else {
      const row = (skipped[rule] ??= { objects: 0, bytes: 0 });
      row.objects += 1;
      row.bytes += entry.size ?? 0;
    }
  }
  return { copy, skipped };
}

/** An etag without its weak marker and quotes, so a `W/"x"` from a body read equals the `"x"` of a head. */
export function normalizeEtag(etag: unknown): string {
  if (typeof etag !== 'string') return '';
  return etag.replace(/^W\//, '').replace(/^"|"$/g, '');
}

/** The `max-age` of a cache-control value in seconds, or undefined when it names none. */
export function maxAgeOf(cacheControl: string | undefined | null): number | undefined {
  const m = /max-age=(\d+)/.exec(String(cacheControl ?? ''));
  if (!m) return undefined;
  return Math.max(MIN_CACHE_MAX_AGE_S, Number(m[1]));
}

/** The first path segment with its slash (`decks/`), the prefix the counts are kept by. */
export function prefixOf(pathname: string): string {
  const slash = pathname.indexOf('/');
  return slash < 0 ? pathname : `${pathname.slice(0, slash + 1)}`;
}

export function md5(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

/** Every page of a client's listing as one array. */
export async function listAll(client: CopyClient, prefix = ''): Promise<CopyEntry[]> {
  const out: CopyEntry[] = [];
  for await (const page of client.pages(prefix)) out.push(...page);
  return out;
}

/**
 * Runs `work(item)` over the items with at most `limit` in flight, in order of the list; once
 * `stop()` answers true no further item starts, and the items left are counted.
 */
export async function pool<T>(
  items: ReadonlyArray<T>,
  limit: number,
  work: (item: T) => Promise<void>,
  stop: () => boolean,
): Promise<number> {
  let next = 0;
  let left = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const i = next;
          next += 1;
          if (i >= items.length) return;
          if (stop()) {
            left += items.length - i;
            next = items.length;
            return;
          }
          await work(items[i] as T);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return left;
}

function isExistsError(error: unknown): boolean {
  return /already exists|exists in the Blob store/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

export type CopySummary = {
  objects: number;
  copied: number;
  copiedBytes: number;
  already: number;
  planned: number;
  plannedBytes: number;
  vanished: number;
  hashChecked: number;
  /** the entries the deadline left unstarted; a later pass copies them */
  stopped: number;
  conflicts: string[];
  /** the backup copies the source had moved past, replaced (`replaceDiffering`) */
  replaced: string[];
  rewrittenOnTarget: string[];
  differing: string[];
  failed: { pathname: string; error: string }[];
  elapsedMs: number;
};

export type CopyOptions = {
  source: CopyClient;
  target: CopyClient;
  entries: ReadonlyArray<CopyEntry>;
  concurrency?: number;
  dryRun?: boolean;
  delta?: boolean;
  /** pathname to the source etag the target holds, filled as the pass goes (the delta's memory) */
  state?: Record<string, string>;
  /** a target copy with another etag is replaced over its own etag, never listed as a conflict */
  replaceDiffering?: boolean;
  /** the clock time after which no further object starts */
  deadline?: number;
  now?: () => number;
  log?: (line: string) => void;
};

/**
 * Copies the entries from the source to the target. `state` (a map pathname to source etag) is
 * filled for every object the target holds with the source's etag at the end of the pass. With
 * `delta`, an entry whose current source etag differs from `state[pathname]` is written over a
 * target copy that still carries the first pass's etag (`ifMatch`); a target copy carrying a third
 * etag is left alone and listed under `rewrittenOnTarget`. With `replaceDiffering`, a target copy
 * with any other etag is replaced over that etag (`ifMatch`) and listed under `replaced`.
 */
export async function copyStore({
  source,
  target,
  entries,
  concurrency = DEFAULT_CONCURRENCY,
  dryRun = false,
  delta = false,
  state = {},
  replaceDiffering = false,
  deadline,
  now = () => Date.now(),
  log = () => {},
}: CopyOptions): Promise<CopySummary> {
  const started = now();
  const summary: CopySummary = {
    objects: entries.length,
    copied: 0,
    copiedBytes: 0,
    already: 0,
    planned: 0,
    plannedBytes: 0,
    vanished: 0,
    hashChecked: 0,
    stopped: 0,
    conflicts: [],
    replaced: [],
    rewrittenOnTarget: [],
    differing: [],
    failed: [],
    elapsedMs: 0,
  };
  let done = 0;
  const stop = (): boolean => deadline !== undefined && now() >= deadline;
  summary.stopped = await pool(
    entries,
    concurrency,
    async (entry) => {
      const pathname = entry.pathname;
      const sourceEtag = normalizeEtag(entry.etag);
      try {
        const existing = await target.head(pathname);
        if (existing !== null && normalizeEtag(existing.etag) === sourceEtag) {
          summary.already += 1;
          state[pathname] = sourceEtag;
          return;
        }
        let ifMatch: string | undefined;
        let replacing = false;
        if (existing !== null) {
          const firstPass = state[pathname];
          if (replaceDiffering && existing.etag !== undefined) {
            ifMatch = existing.etag; // a backup copy the source moved past: replace it
            replacing = true;
          } else if (
            delta &&
            firstPass !== undefined &&
            normalizeEtag(existing.etag) === normalizeEtag(firstPass)
          ) {
            ifMatch = existing.etag; // the target still carries the first pass's copy: replace it
          } else if (delta) {
            summary.rewrittenOnTarget.push(pathname); // rewritten on the target since the first pass
            return;
          } else {
            summary.conflicts.push(pathname); // there with another etag: never overwritten by a plain pass
            return;
          }
        }
        if (dryRun) {
          summary.planned += 1;
          summary.plannedBytes += entry.size ?? 0;
          return;
        }
        const [body, meta] = await Promise.all([source.get(pathname), source.head(pathname)]);
        if (body === null || meta === null) {
          summary.vanished += 1; // deleted between the listing and the read
          return;
        }
        const bodyEtag = normalizeEtag(body.etag ?? meta.etag);
        let put: { etag: string };
        try {
          const maxAge = maxAgeOf(meta.cacheControl);
          put = await target.put(pathname, body.bytes, {
            ...(meta.contentType === undefined ? {} : { contentType: meta.contentType }),
            ...(maxAge === undefined ? {} : { cacheControlMaxAge: maxAge }),
            ...(ifMatch === undefined ? {} : { replace: true, ifMatch }),
          });
        } catch (error) {
          if (!isExistsError(error)) throw error;
          const raced = await target.head(pathname); // another run put it first
          if (raced !== null && normalizeEtag(raced.etag) === bodyEtag) {
            summary.already += 1;
            state[pathname] = bodyEtag;
            return;
          }
          summary.conflicts.push(pathname);
          return;
        }
        summary.copied += 1;
        summary.copiedBytes += body.bytes.byteLength;
        if (replacing) summary.replaced.push(pathname);
        if (normalizeEtag(put.etag) !== bodyEtag) {
          // a multipart upload's etag is not the body's md5: read the copy back and compare the bytes
          summary.hashChecked += 1;
          const copy = await target.get(pathname);
          if (copy === null || md5(copy.bytes) !== md5(body.bytes)) {
            summary.differing.push(pathname);
            return;
          }
        }
        state[pathname] = bodyEtag;
      } catch (error) {
        summary.failed.push({
          pathname,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        done += 1;
        if (done % 1000 === 0)
          log(
            `${done} of ${entries.length} objects, ${summary.copied} copied, ${summary.already} already there, ${now() - started} ms`,
          );
      }
    },
    stop,
  );
  summary.elapsedMs = now() - started;
  return summary;
}

export type VerifyReport = {
  ok: boolean;
  sourceObjects: number;
  targetObjects: number;
  copiedSet: number;
  skipped: SkippedCounts;
  skippedRules: string[];
  prefixes: Record<
    string,
    { expected: number; found: number; expectedBytes: number; foundBytes: number }
  >;
  differing: string[];
  targetObjectsOutsideTheSet: number;
  elapsedMs: number;
};

/**
 * Verifies the copied set: every source object outside the skip rules is on the target with an equal
 * etag, and the count per prefix agrees. The expected counts come from the source listing of this
 * run; the skipped set is named with its counts.
 */
export async function verifyStores({
  source,
  target,
  rules,
  prefix = '',
  now = Date.now(),
}: {
  source: CopyClient;
  target: CopyClient;
  rules: ReadonlyArray<SkipRule>;
  prefix?: string;
  now?: number;
}): Promise<VerifyReport> {
  const started = Date.now();
  const [sourceAll, targetAll] = await Promise.all([
    listAll(source, prefix),
    listAll(target, prefix),
  ]);
  const { copy, skipped } = planCopy(sourceAll, rules, now);
  const targetByPath = new Map(targetAll.map((entry) => [entry.pathname, entry]));
  const prefixes: VerifyReport['prefixes'] = {};
  const differing: string[] = [];
  for (const entry of copy) {
    const row = (prefixes[prefixOf(entry.pathname)] ??= {
      expected: 0,
      found: 0,
      expectedBytes: 0,
      foundBytes: 0,
    });
    row.expected += 1;
    row.expectedBytes += entry.size ?? 0;
    const stored = targetByPath.get(entry.pathname);
    if (stored === undefined) {
      differing.push(`${entry.pathname} (missing on the target)`);
      continue;
    }
    if (normalizeEtag(stored.etag) !== normalizeEtag(entry.etag)) {
      differing.push(`${entry.pathname} (etag differs)`);
      continue;
    }
    row.found += 1;
    row.foundBytes += stored.size ?? 0;
  }
  const copied = new Set(copy.map((entry) => entry.pathname));
  const extra = targetAll.filter((entry) => !copied.has(entry.pathname)).length;
  return {
    ok: differing.length === 0,
    sourceObjects: sourceAll.length,
    targetObjects: targetAll.length,
    copiedSet: copy.length,
    skipped,
    skippedRules: rules.map((rule) => rule.label),
    prefixes,
    differing,
    targetObjectsOutsideTheSet: extra,
    elapsedMs: Date.now() - started,
  };
}

/** The entries of the copied set whose source etag moved since the first pass, plus the ones the first pass never saw. */
export function deltaEntries<E extends CopyEntry>(
  entries: ReadonlyArray<E>,
  state: Readonly<Record<string, string>>,
): E[] {
  return entries.filter((entry) => {
    const first = state[entry.pathname];
    return first === undefined || normalizeEtag(first) !== normalizeEtag(entry.etag);
  });
}

/** The first twenty differing pathnames, the way the summary prints them. */
export function listedDiffering(list: ReadonlyArray<string>): string[] {
  return list.slice(0, DIFFERING_LISTED);
}

/**
 * A client whose pathnames live under `prefix` of another (the backup's `backup/<day>/`): every
 * call adds the prefix, and a listing answers the pathnames without it.
 */
export function prefixedCopyClient(inner: CopyClient, prefix: string): CopyClient {
  return {
    async *pages(sub = '') {
      for await (const page of inner.pages(`${prefix}${sub}`))
        yield page
          .filter((entry) => entry.pathname.startsWith(prefix))
          .map((entry) => ({ ...entry, pathname: entry.pathname.slice(prefix.length) }));
    },
    async head(pathname) {
      const found = await inner.head(`${prefix}${pathname}`);
      return found === null ? null : { ...found, pathname };
    },
    get: (pathname) => inner.get(`${prefix}${pathname}`),
    put: (pathname, bytes, options) => inner.put(`${prefix}${pathname}`, bytes, options),
  };
}

/**
 * The copy's view of the store's own client (blob-store.ts `BlobClient`): one page per listing,
 * the version as the etag, and the content type the caller names per pathname (the store's head
 * carries none). The max age is left to the target client's own rule.
 */
export function copyClientOf(
  client: BlobClient,
  contentTypeOf: (pathname: string) => string,
): CopyClient {
  const entryOf = (entry: {
    pathname: string;
    size: number;
    version: string;
    uploadedAt?: string;
  }): CopyEntry => ({
    pathname: entry.pathname,
    size: entry.size,
    etag: entry.version,
    ...(entry.uploadedAt === undefined ? {} : { uploadedAt: entry.uploadedAt }),
  });
  return {
    async *pages(prefix = '') {
      yield (await client.list(prefix)).map(entryOf);
    },
    async head(pathname) {
      const found = await client.head(pathname);
      return found === null ? null : { ...entryOf(found), contentType: contentTypeOf(pathname) };
    },
    async get(pathname) {
      const found = await client.get(pathname);
      return found === null ? null : { bytes: found.bytes, etag: found.entry.version };
    },
    async put(pathname, bytes, options) {
      const entry = await client.put(pathname, bytes, {
        overwrite: options.replace === true,
        ...(options.ifMatch === undefined ? {} : { ifMatch: options.ifMatch }),
        ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
        ...(options.cacheControlMaxAge === undefined
          ? {}
          : { cacheControlMaxAge: options.cacheControlMaxAge }),
      });
      return { etag: entry.version };
    },
  };
}

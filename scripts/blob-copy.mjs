#!/usr/bin/env node
// The fallback of docs/HOSTING-MOVE.md section 3: copies one Vercel Blob store into another when the
// rehearsal of 2.2 refuses the transfer. Written by the sync round's B6 and tested against two
// in-memory fakes alone (scripts/blob-copy.test.mjs over packages/store/src/blob-fake.ts); it has
// never run against a real store. It runs only if Kevin decides the copy is the path.
//
//   ( set -a; . <env file>; set +a; node scripts/blob-copy.mjs --dry-run --skip exports-older-than=1d,turboslide-sidecars )
//   ( set -a; . <env file>; set +a; node scripts/blob-copy.mjs --skip exports-older-than=1d,turboslide-sidecars --state .turboslide/blob-copy.json )
//   ( set -a; . <env file>; set +a; node scripts/blob-copy.mjs --verify --skip ... --state .turboslide/blob-copy.json )
//   ( set -a; . <env file>; set +a; node scripts/blob-copy.mjs --delta --skip ... --state .turboslide/blob-copy.json )
//
// The two tokens come from the environment, SOURCE_BLOB_TOKEN and TARGET_BLOB_TOKEN, sourced in a
// subshell from a file that is never committed; neither is printed, written or passed on the command
// line. The script prints counts, bytes, elapsed time and the first twenty differing pathnames and
// nothing else (`--json <file>` writes the same summary as JSON, pathnames and etags alone).
//
// The pass: list the source with `list({ limit: 1000, cursor })`; for every object not in the skipped
// set, `head` the target (an object already there with the source's etag is skipped, so a pass that
// stopped resumes where it was; an object there with another etag is a conflict, listed and never
// overwritten), `get` the source's bytes (`useCache: false`, so the body is the origin's and not a
// CDN copy) and one `head` for `contentType` and `cacheControl`, then `put` under the same pathname
// with `addRandomSuffix: false`, `allowOverwrite: false`, the same content type and
// `cacheControlMaxAge`, and compare the returned etag with the source's; when they differ (a
// multipart upload's etag is not the body's md5; packages/store/src/migrate.ts 251 to 296 is the
// pattern) the target's body is read back and compared by the md5 of the bytes. Eight objects are in
// flight at a time.
//
// `--skip exports-older-than=1d,turboslide-sidecars` leaves out the produced export files older than
// a day (no job record names them; the records under `exports/.jobs/` are kept) and every object
// under `decks/<id>/.turboslide/` (the presence sidecars, `presence.json`, `pulse.json` and
// `copies/`: per instance state that regenerates). `--verify` re-lists both stores and, over the
// copied set alone, compares the count per prefix and the etag per object, naming the skipped set it
// excludes and the count it expects per prefix from the source listing of the same run (the store
// moves, so the expected counts are recomputed at run time). `--delta` copies the objects whose
// source etag changed since the first pass (`--state` holds the first pass's source etags), over a
// target copy that still carries the first pass's etag (`ifMatch`), and never over an object the
// target has rewritten since (a target etag that differs from both the first pass's and the source's
// is left alone and listed).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_TOKEN_VARIABLE = 'SOURCE_BLOB_TOKEN';
export const TARGET_TOKEN_VARIABLE = 'TARGET_BLOB_TOKEN';
export const DEFAULT_CONCURRENCY = 8;
export const DIFFERING_LISTED = 20;
/** The SDK refuses a cache max age under a minute. */
const MIN_CACHE_MAX_AGE_S = 60;
const STATE_VERSION = 1;

const USAGE =
  'usage: node scripts/blob-copy.mjs [--dry-run] [--verify] [--delta] [--skip <rules>] [--state <file>] [--prefix <p>] [--concurrency 8] [--access public|private] [--json <out>]';

export function parseArgs(argv) {
  const out = {
    dryRun: false,
    verify: false,
    delta: false,
    skip: [],
    state: null,
    prefix: '',
    concurrency: DEFAULT_CONCURRENCY,
    access: 'public',
    json: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verify') out.verify = true;
    else if (arg === '--delta') out.delta = true;
    else if (arg === '--skip') out.skip = parseSkip(argv[++i] ?? '');
    else if (arg === '--state') out.state = argv[++i] ?? null;
    else if (arg === '--prefix') out.prefix = argv[++i] ?? '';
    else if (arg === '--concurrency')
      out.concurrency = Math.max(1, Number(argv[++i] ?? out.concurrency) || 1);
    else if (arg === '--access') out.access = argv[++i] === 'private' ? 'private' : 'public';
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new RangeError(`unknown argument ${arg}\n${USAGE}`);
  }
  if (out.delta && out.state === null)
    throw new RangeError("--delta needs --state <file>, the first pass's etags");
  return out;
}

/** `exports-older-than=1d,turboslide-sidecars` as rules; an unknown rule is refused by name. */
export function parseSkip(text) {
  const rules = [];
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
export function skipRuleOf(entry, rules, now = Date.now()) {
  for (const rule of rules) {
    if (rule.kind === 'turboslide-sidecars' && SIDECAR.test(entry.pathname)) return rule.label;
    if (rule.kind === 'exports-older-than' && EXPORT_FILE.test(entry.pathname)) {
      const at = entry.uploadedAt === undefined ? NaN : new Date(entry.uploadedAt).getTime();
      if (Number.isFinite(at) && now - at > rule.ms) return rule.label;
    }
  }
  return null;
}

/** Splits a source listing into the copied set and the skipped set, counted per rule. */
export function planCopy(entries, rules, now = Date.now()) {
  const copy = [];
  const skipped = {};
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
export function normalizeEtag(etag) {
  if (typeof etag !== 'string') return '';
  return etag.replace(/^W\//, '').replace(/^"|"$/g, '');
}

/** The `max-age` of a cache-control value in seconds, or undefined when it names none. */
export function maxAgeOf(cacheControl) {
  const m = /max-age=(\d+)/.exec(String(cacheControl ?? ''));
  if (!m) return undefined;
  return Math.max(MIN_CACHE_MAX_AGE_S, Number(m[1]));
}

/** The first path segment with its slash (`decks/`), the prefix the counts are kept by. */
export function prefixOf(pathname) {
  const slash = pathname.indexOf('/');
  return slash < 0 ? pathname : `${pathname.slice(0, slash + 1)}`;
}

export function md5(bytes) {
  return createHash('md5').update(bytes).digest('hex');
}

/** Every page of a client's listing as one array. */
export async function listAll(client, prefix = '') {
  const out = [];
  for await (const page of client.pages(prefix)) out.push(...page);
  return out;
}

/** Runs `work(item)` over the items with at most `limit` in flight, in order of the list. */
async function pool(items, limit, work) {
  let next = 0;
  const workers = [];
  for (let w = 0; w < Math.min(limit, items.length); w += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const i = next;
          next += 1;
          if (i >= items.length) return;
          await work(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
}

function isExistsError(error) {
  return /already exists|exists in the Blob store/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Copies the entries from the source to the target. `state` (a map pathname to source etag) is
 * filled for every object the target holds with the source's etag at the end of the pass. With
 * `delta`, an entry whose current source etag differs from `state[pathname]` is written over a
 * target copy that still carries the first pass's etag (`ifMatch`); a target copy carrying a third
 * etag is left alone and listed under `rewrittenOnTarget`.
 */
export async function copyStore({
  source,
  target,
  entries,
  concurrency = DEFAULT_CONCURRENCY,
  dryRun = false,
  delta = false,
  state = {},
  log = () => {},
}) {
  const started = Date.now();
  const summary = {
    objects: entries.length,
    copied: 0,
    copiedBytes: 0,
    already: 0,
    planned: 0,
    plannedBytes: 0,
    vanished: 0,
    hashChecked: 0,
    conflicts: [],
    rewrittenOnTarget: [],
    differing: [],
    failed: [],
  };
  const noteDiffering = (pathname) => {
    summary.differing.push(pathname);
  };
  let done = 0;
  await pool(entries, concurrency, async (entry) => {
    const pathname = entry.pathname;
    const sourceEtag = normalizeEtag(entry.etag);
    try {
      const existing = await target.head(pathname);
      if (existing !== null && normalizeEtag(existing.etag) === sourceEtag) {
        summary.already += 1;
        state[pathname] = sourceEtag;
        return;
      }
      let ifMatch;
      if (existing !== null) {
        const firstPass = state[pathname];
        if (
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
      let put;
      try {
        put = await target.put(pathname, body.bytes, {
          contentType: meta.contentType,
          cacheControlMaxAge: maxAgeOf(meta.cacheControl),
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
      if (normalizeEtag(put.etag) !== bodyEtag) {
        // a multipart upload's etag is not the body's md5: read the copy back and compare the bytes
        summary.hashChecked += 1;
        const copy = await target.get(pathname);
        if (copy === null || md5(copy.bytes) !== md5(body.bytes)) {
          noteDiffering(pathname);
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
          `${done} of ${entries.length} objects, ${summary.copied} copied, ${summary.already} already there, ${Date.now() - started} ms`,
        );
    }
  });
  summary.elapsedMs = Date.now() - started;
  return summary;
}

/**
 * Verifies the copied set: every source object outside the skip rules is on the target with an equal
 * etag, and the count per prefix agrees. The expected counts come from the source listing of this
 * run; the skipped set is named with its counts.
 */
export async function verifyStores({ source, target, rules, prefix = '', now = Date.now() }) {
  const started = Date.now();
  const [sourceAll, targetAll] = await Promise.all([
    listAll(source, prefix),
    listAll(target, prefix),
  ]);
  const { copy, skipped } = planCopy(sourceAll, rules, now);
  const targetByPath = new Map(targetAll.map((entry) => [entry.pathname, entry]));
  const prefixes = {};
  const differing = [];
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
  const extra = targetAll.filter(
    (entry) => !copy.some((c) => c.pathname === entry.pathname),
  ).length;
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
export function deltaEntries(entries, state) {
  return entries.filter((entry) => {
    const first = state[entry.pathname];
    return first === undefined || normalizeEtag(first) !== normalizeEtag(entry.etag);
  });
}

export function readState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed?.version !== STATE_VERSION || typeof parsed.etags !== 'object')
      throw new TypeError('not a blob-copy state file');
    return parsed.etags;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export function writeState(file, etags) {
  writeFileSync(
    file,
    `${JSON.stringify({ version: STATE_VERSION, writtenAt: new Date().toISOString(), etags }, null, 2)}\n`,
  );
}

/** The first twenty differing pathnames, the way the summary prints them. */
export function listedDiffering(list) {
  return list.slice(0, DIFFERING_LISTED);
}

/**
 * The store client over the SDK for one token: pages of the listing, a head, a body read from the
 * origin and a put under the same pathname. The token never leaves this closure.
 */
export async function sdkStoreClient(token, access = 'public') {
  const sdk = await import('@vercel/blob');
  const bytesOf = async (stream) => new Uint8Array(await new Response(stream).arrayBuffer());
  return {
    async *pages(prefix = '') {
      let cursor;
      do {
        const page = await sdk.list({
          token,
          limit: 1000,
          ...(prefix ? { prefix } : {}),
          ...(cursor === undefined ? {} : { cursor }),
        });
        yield page.blobs.map((blob) => ({
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt:
            blob.uploadedAt instanceof Date ? blob.uploadedAt.toISOString() : blob.uploadedAt,
          etag: blob.etag,
        }));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
    },
    async head(pathname) {
      try {
        const result = await sdk.head(pathname, { token });
        return {
          etag: result.etag,
          size: result.size,
          contentType: result.contentType,
          cacheControl: result.cacheControl,
          uploadedAt:
            result.uploadedAt instanceof Date ? result.uploadedAt.toISOString() : result.uploadedAt,
        };
      } catch (error) {
        if (error instanceof sdk.BlobNotFoundError || /does not exist/i.test(error?.message ?? ''))
          return null;
        throw error;
      }
    },
    async get(pathname) {
      let result;
      try {
        result = await sdk.get(pathname, { token, access, useCache: false });
      } catch (error) {
        if (error instanceof sdk.BlobNotFoundError || /does not exist/i.test(error?.message ?? ''))
          return null;
        throw error;
      }
      if (result === null || result.stream === null) return null;
      return { bytes: await bytesOf(result.stream), etag: result.headers.get('etag') ?? undefined };
    },
    async put(pathname, bytes, options) {
      const result = await sdk.put(
        pathname,
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        {
          token,
          access,
          addRandomSuffix: false,
          allowOverwrite: options.replace === true,
          ...(options.ifMatch === undefined ? {} : { ifMatch: options.ifMatch }),
          ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
          ...(options.cacheControlMaxAge === undefined
            ? {}
            : { cacheControlMaxAge: options.cacheControlMaxAge }),
        },
      );
      return { etag: result.etag };
    },
  };
}

function formatBytes(bytes) {
  return `${bytes} bytes (${(bytes / 1048576).toFixed(1)} MiB)`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const sourceToken = process.env[SOURCE_TOKEN_VARIABLE];
  const targetToken = process.env[TARGET_TOKEN_VARIABLE];
  if (!sourceToken || !targetToken) {
    console.error(
      `${SOURCE_TOKEN_VARIABLE} and ${TARGET_TOKEN_VARIABLE} must be in the environment (sourced in a subshell); nothing copied`,
    );
    process.exit(2);
  }
  if (sourceToken === targetToken) {
    console.error(
      'the two tokens are the same value; the source and the target must be two stores',
    );
    process.exit(2);
  }
  const source = await sdkStoreClient(sourceToken, args.access);
  const target = await sdkStoreClient(targetToken, args.access);
  const started = Date.now();
  const out = {
    startedAt: new Date(started).toISOString(),
    mode: args.verify ? 'verify' : args.delta ? 'delta' : args.dryRun ? 'dry-run' : 'copy',
    skip: args.skip.map((r) => r.label),
    prefix: args.prefix,
  };
  if (args.verify) {
    const report = await verifyStores({ source, target, rules: args.skip, prefix: args.prefix });
    out.verify = report;
    console.log(
      `verify: source ${report.sourceObjects} objects, target ${report.targetObjects}, the copied set ${report.copiedSet}; skipped ${JSON.stringify(report.skipped)}; ${report.elapsedMs} ms`,
    );
    for (const [prefix, row] of Object.entries(report.prefixes))
      console.log(
        `  ${prefix} expected ${row.expected} (${formatBytes(row.expectedBytes)}), found ${row.found} (${formatBytes(row.foundBytes)})`,
      );
    console.log(
      `  ${report.differing.length} differing; ${report.targetObjectsOutsideTheSet} target objects outside the set (ignored)`,
    );
    for (const line of listedDiffering(report.differing)) console.log(`  differs: ${line}`);
    console.log(report.ok ? 'verify: the copied set is whole' : 'verify: the copied set differs');
  } else {
    const listed = await listAll(source, args.prefix);
    const { copy, skipped } = planCopy(listed, args.skip);
    const state = args.state === null ? {} : readState(resolve(args.state));
    const entries = args.delta ? deltaEntries(copy, state) : copy;
    console.log(
      `source ${listed.length} objects; the copied set ${copy.length}; skipped ${JSON.stringify(skipped)}${args.delta ? `; ${entries.length} moved since the first pass` : ''}; listing ${Date.now() - started} ms`,
    );
    const summary = await copyStore({
      source,
      target,
      entries,
      concurrency: args.concurrency,
      dryRun: args.dryRun,
      delta: args.delta,
      state,
      log: (line) => console.log(line),
    });
    out.summary = summary;
    out.skipped = skipped;
    if (args.state !== null && !args.dryRun) writeState(resolve(args.state), state);
    console.log(
      `${args.dryRun ? 'dry run: ' : ''}${summary.copied} copied (${formatBytes(summary.copiedBytes)}), ${summary.already} already there, ${summary.planned} planned (${formatBytes(summary.plannedBytes)}), ${summary.vanished} vanished, ${summary.hashChecked} checked by md5, ${summary.conflicts.length} conflicts, ${summary.rewrittenOnTarget.length} rewritten on the target, ${summary.differing.length} differing, ${summary.failed.length} failed; ${summary.elapsedMs} ms`,
    );
    for (const line of listedDiffering([
      ...summary.differing,
      ...summary.conflicts,
      ...summary.rewrittenOnTarget,
      ...summary.failed.map((f) => `${f.pathname} (${f.error})`),
    ]))
      console.log(`  differs: ${line}`);
  }
  out.elapsedMs = Date.now() - started;
  if (args.json !== null) writeFileSync(resolve(args.json), `${JSON.stringify(out, null, 2)}\n`);
  const ok = args.verify
    ? out.verify.ok
    : out.summary.differing.length === 0 &&
      out.summary.failed.length === 0 &&
      out.summary.conflicts.length === 0;
  process.exit(ok ? 0 : 1);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

#!/usr/bin/env node
// The cost probe (docs/SYNC.md 6.3; the drivers lane of the sync and costs round): the driver
// `cost-probe` of the matrix rows `cost.*` and `sync.pull.no-listing`. One page state per process
// for three minutes at human speed, in the shape of docs/gslides-parity/sync/audit-costs/measure.mjs:
// a scratch deck made from /new through the product with its title typed, then the state; every
// request the page made is recorded (the route, the method, the status, the time; never a header,
// a cookie or a body) and summed per route per minute over the window; `sync.status.storeCalls`
// (the per instance, per deck, sliding 60 s counters B3 lands in `boundedBlobClient`) is sampled
// five times over the window through `POST /api/actions/sync.status?deck=<id>`, the maximum per
// operation per `instance` is kept and the instances that answered are recorded (the counters are
// per instance and a deployment routes each request to whichever instance is warm); the counts
// are written beside the row's ceiling to the run's JSON, and the process exits 1 on a row over
// its ceiling. The ceilings are the rows' (core-matrix.json, docs/SYNC.md 6.1: about 1.5 times the
// model's expected count after the fix and under today's measured count, question 4's default).
//
//   node scripts/probes/sync-cost-probe.mjs --base <origin> --row <id> --out <json>
//     [--minutes 3] [--shots <dir>]
//   node scripts/probes/sync-cost-probe.mjs --base <origin> --all --out <json>
//     [--rows <id>[,<id>]] [--minutes 3] [--shots <dir>]
//
// `--row` drives one state in this process; `--all` runs one child process per row (every cost
// row, or the `--rows` named), writes each child's JSON beside the merged file and merges them.
// The gate (scripts/probes/core-gate.mjs) calls `--all`. `--minutes` shortens a state's window for
// a smoke; the run of record keeps 3 and the JSON names the minutes it ran.
//
// What a row asserts, and where: the function requests a minute are counted from the page's own
// requests to the origin that are not static assets (documents, /api/*, /_serverFn/*; a static
// asset is a CDN hit after the first load). The session poll is a POST to a server function
// whose body names `timeoutMs` (server/sessions.ts `PollSessionInput`), the attach one that names
// `owner`. The store calls a minute are `storeCalls` as `sync.status` answers them: simple is
// `head` plus `get`, advanced `put` plus `list`, `del` is free. On the preview the probe sends
// VERCEL_OIDC_TOKEN as x-vercel-trusted-oidc-idp-token on every request; on production nothing
// but the bearer for sync.status, read into memory from TURBOSLIDE_TOKEN or the origin's row of
// ~/.config/turboslide/hosts.json and never printed (the JSON names the source, never the value).
// Locally (a localhost base) the agent surface is open and the store is the file or tmp store, so
// `storeCalls` is absent or reads zero and the row asserts its function requests alone (6.3); a
// row whose ceilings are store calls alone then records its counts and asserts its state (both
// tabs connected and in each other's roster; the ten commits landed). A deployment run that holds
// no bearer cannot read the counters, so a row whose claim needs them is recorded not driven with
// that reason, its function requests still recorded. `cost.editor-hidden.calls` is not driven
// with the reason when the headless browser never reads `document.visibilityState` as hidden after
// a second page is brought to the front, as its row says.
//
// The probe's own sync.status reads are requests of the probe, not the page, and are left out of
// the function request counts; each costs the deck one `deck.json` head on the answering instance
// (b3.md R7 b: the handler reads the store's revision before it reads the counters, once the
// mirror's 750 ms sync window has passed), so every sample records how many of the probe's own
// reads sit inside its 60 s window (`own`), the show row's zero ceiling is judged on the calls
// beyond them, and the simple ceilings, which carry the samples' heads (R7 b), record the count
// beside the measure. The probe's `deck.info` is the window transport's (controller.tsx answers it
// from the page's snapshot) and costs the store nothing.
//
// The window starts once the store is quiet of the setup (the settle, the verifier's pass 1 F7
// and F8): the setup's write renders the deck's card once the deck has rested 30 s, and a render
// is one put and one `list` (`pruneThumbs`, thumbs.ts; card-thumb.ts CARD_THUMB_SETTLE_MS); the
// editor tab the show row leaves behind keeps its stream until the runtime reports the reader
// gone (room.ts STREAM_READER_GONE_MS, 35 s), and that close flushes the card render and runs the
// The realtime round (docs/REALTIME.md section 2, 5.1 R5): the row `cost.redis.commands` reads
// `INFO commandstats` on the deployment's Redis before and after an editing window and an idle
// window of `--minutes` each (`--idle-minutes` sets the idle window apart) and counts the editor
// hour as docs/SYNC.md 4.3 does, 12 editing minutes and 48 idle minutes, from the two rates
// (`--minutes 12 --idle-minutes 48` drives the literal hour). The Redis URL comes from `--redis-url`,
// else TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL in the environment a wrapper set, and is never
// printed (the JSON names its source, the host and the database number alone); without one, or
// with a Redis that does not answer, the row is not driven with the reason. The read is a plain
// RESP exchange over node:net or node:tls (AUTH, SELECT, INFO commandstats, CLIENT LIST, QUIT):
// the probes carry no dependency and ioredis is not hoisted. `INFO commandstats` is server wide,
// so on a local container shared by several databases the delta carries the other databases'
// commands too; the JSON records how many clients of other databases were connected, and the
// presence write is counted apart by command name (the presence family: hset, hget, zadd,
// zscore, pexpire, publish, zrangebyscore, hmget) beside evalsha, the one command a scripted
// presence write or an append costs. The three store ceilings of the sync round's cost rows are
// restated per tier (REALTIME.md section 2): the tier is `--tier` when given, else the deck's
// `sync.status` tier, and `ceilingsFor(id, tier)` picks the numbers.
//
// snapshot prune (blob.ts `pruneAtClose`, one `list`). Those calls landed inside the first 60 s
// window of the pass 1 runs (`list` 1 on the two tabs row, 11 calls on the show row). So after
// the state is ready the probe reads the counters every SETTLE_EVERY_MS until the row's quiet
// reading (`list` 0 for every row; nothing beyond the probe's own heads for the show row) or
// SETTLE_MAX_MS, records the settle's samples in the JSON, and only then starts the window; the
// first window sample lands a full counters' window after the settle's last read. A settle that
// never quiets is recorded and the window starts anyway, so a product cost is never hidden. The
// scratch deck is trashed and deleted forever in a finally block (File > Move to trash, Delete
// forever on /decks/trash, the 404 read), so a run leaves nothing on a store. Imports playwright-core
// alone, the way the walk probe does.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COST_PROBE_DRIVER, coreRow, costRows } from './core-matrix.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium, request: playwrightRequest } = require('playwright-core');

// ---------------------------------------------------------------------------------------------
// arguments

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
const OUT = arg('out', null);
const ROW = arg('row', null);
const ALL = flag('all');
const MINUTES = Number(arg('minutes', '3'));
/** The idle window of `cost.redis.commands` in minutes (`--idle-minutes`; the editing window's minutes when absent). */
const IDLE_MINUTES = Number(arg('idle-minutes', String(MINUTES)));
/** The realtime tier named by the caller (`--tier`); the deck's sync.status tier when absent. */
const TIER_ARG = arg('tier', null);
/** The Redis URL of `cost.redis.commands` (never printed): --redis-url, else the wrapper's environment. */
const REDIS_URL =
  arg('redis-url', null) ?? process.env.TURBOSLIDE_PROBE_REDIS_URL ?? process.env.REDIS_URL ?? null;
const REDIS_URL_SOURCE =
  arg('redis-url', null) !== null
    ? '--redis-url'
    : process.env.TURBOSLIDE_PROBE_REDIS_URL
      ? 'TURBOSLIDE_PROBE_REDIS_URL'
      : process.env.REDIS_URL
        ? 'REDIS_URL'
        : 'none';
const SHOTS = arg('shots', null);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
/** The header a preview behind Vercel Authentication needs; nothing on production and localhost. */
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const VIEWPORT = { width: 1440, height: 900 };
const SELF = fileURLToPath(import.meta.url);

const USAGE =
  'usage: node scripts/probes/sync-cost-probe.mjs --base <origin> (--row <id> | --all [--rows <ids>]) --out <json> [--minutes 3] [--idle-minutes <n>] [--tier redis|blob|memory] [--redis-url <url>] [--shots <dir>]';

/** The ceilings of docs/SYNC.md 6.1 by row, as the interaction texts give them. */
export const CEILINGS = Object.freeze({
  'cost.editor-idle.calls': { functionPerMinute: 12, simplePerMinute: 40, advancedPerMinute: 11 },
  'cost.editor-hidden.calls': { functionPerMinute: 8, polls: 0 },
  'cost.editor-editing.calls': {
    functionPerMinute: 75,
    simplePerMinute: 140,
    advancedPerMinute: 85,
  },
  'cost.two-tabs-idle.calls': { list: 0, advancedPerMinute: 30 },
  'cost.show.calls': { functionRequests: 0, storeCalls: 0 },
  /* the pull's own listing: `storeCalls.lists.versions` (the pull reads records by number,
     docs/SYNC.md 3.5); the deck's other listings inside the window (the prune's `snapshots/`, a
     first open's `assets/`, the card render's `thumbs/`) are recorded beside it and never judged
     here (the sync and costs round's ship; VERIFICATION.md pass 2 F2 read `list` 1 from those) */
  'sync.pull.no-listing': { listVersions: 0, commits: 10 },
  /* the realtime round (docs/REALTIME.md section 2): one editor hour of Redis commands, counted
     as 12 editing minutes and 48 idle minutes from the two windows the probe drives */
  'cost.redis.commands': { redisCommandsPerHour: 12_000 },
});

/**
 * The store ceilings restated per realtime tier (docs/REALTIME.md section 2: on the redis tier no
 * pulse and no record per POST, so the simple and advanced counts fall). A tier with no entry
 * keeps CEILINGS as written (the blob tier's numbers, which the memory tier reads as zero).
 */
export const TIER_CEILINGS = Object.freeze({
  redis: Object.freeze({
    'cost.editor-idle.calls': { simplePerMinute: 10, advancedPerMinute: 2 },
    'cost.editor-editing.calls': { simplePerMinute: 30, advancedPerMinute: 12 },
    'cost.two-tabs-idle.calls': { advancedPerMinute: 2 },
  }),
});

/** The ceilings of a row on a tier: CEILINGS with the tier's restated store numbers over it. */
export function ceilingsFor(id, tier) {
  const base = CEILINGS[id];
  if (!base) return undefined;
  const over = tier ? TIER_CEILINGS[tier]?.[id] : undefined;
  return over ? { ...base, ...over } : base;
}

/** The command names of a presence write on the redis tier before the PRESENCE_SET script (research-hosting.md 2.1). */
export const PRESENCE_COMMANDS = Object.freeze([
  'hset',
  'hget',
  'zadd',
  'zscore',
  'pexpire',
  'publish',
  'zrangebyscore',
  'hmget',
]);

/** The per command calls of an `INFO commandstats` text: `{ get: 12, evalsha: 3, ... }`. */
export function parseCommandstats(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^cmdstat_([A-Za-z0-9_|.-]+):(.*)$/.exec(line.trim());
    if (!m) continue;
    const calls = /(?:^|,)calls=(\d+)/.exec(m[2]);
    if (calls) out[m[1].toLowerCase()] = Number(calls[1]);
  }
  return out;
}

/** The per command difference of two commandstats readings (names in either), and its sum. */
export function commandDelta(before, after) {
  const byName = {};
  let total = 0;
  for (const name of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const d = Number(after?.[name] ?? 0) - Number(before?.[name] ?? 0);
    if (d !== 0) byName[name] = d;
    if (d > 0) total += d;
  }
  return { byName, total };
}

/**
 * The editor hour from an editing window and an idle window (docs/SYNC.md 4.3: 12 editing
 * minutes and 48 idle minutes), each a command count over its minutes; the rates and the hour.
 */
export function editorHour(editing, idle) {
  const rate = (w) => (w.minutes > 0 ? w.commands / w.minutes : 0);
  const editingPerMinute = rate(editing);
  const idlePerMinute = rate(idle);
  return {
    editingPerMinute,
    idlePerMinute,
    hour: Math.round(editingPerMinute * 12 + idlePerMinute * 48),
  };
}

/** The presence family's calls and the evalsha calls of a per command delta. */
export function presenceApart(byName) {
  let presence = 0;
  for (const name of PRESENCE_COMMANDS) presence += Math.max(0, Number(byName?.[name] ?? 0));
  const evalsha =
    Math.max(0, Number(byName?.evalsha ?? 0)) + Math.max(0, Number(byName?.eval ?? 0));
  return { presence, evalsha };
}

/** The URL's parts the JSON may name: the host, the port, the database number and whether TLS; never the password. */
export function redisTarget(url) {
  const u = new URL(url);
  const db = Number((u.pathname || '/0').slice(1) || '0');
  return {
    host: u.hostname,
    port: Number(u.port || '6379'),
    db: Number.isFinite(db) ? db : 0,
    tls: u.protocol === 'rediss:',
  };
}

/** The fractions of the window at which the five storeCalls samples are read. */
export const SAMPLE_FRACTIONS = Object.freeze([1 / 3, 1 / 2, 2 / 3, 5 / 6, 1]);

/** The counters' sliding window (docs/SYNC.md 6.3; blob-store.ts STORE_CALLS_WINDOW_MS). */
export const STORE_WINDOW_MS = 60_000;
/** The settle before a window: the counters read every SETTLE_EVERY_MS, for at most SETTLE_MAX_MS. */
export const SETTLE_EVERY_MS = 10_000;
export const SETTLE_MAX_MS = 150_000;

// ---------------------------------------------------------------------------------------------
// the pure judgement, exported for the unit test (sync-cost-probe.test.mjs)

/** simple is head plus get, advanced put plus list; del is free (docs/SYNC.md 4.2). */
export function classifyStoreCalls(max) {
  const n = (k) => Number(max?.[k] ?? 0);
  const lists =
    max && typeof max.lists === 'object' && max.lists !== null
      ? Object.fromEntries(Object.entries(max.lists).map(([k, v]) => [k, Number(v ?? 0)]))
      : null;
  return {
    simple: n('head') + n('get'),
    advanced: n('put') + n('list'),
    head: n('head'),
    get: n('get'),
    put: n('put'),
    list: n('list'),
    del: n('del'),
    /* the `list` calls by the folder listed (blob-store.ts StoreCalls.lists), when the
       deployment's counters name it */
    ...(lists === null ? {} : { lists }),
  };
}

/**
 * The maximum per operation per instance over the samples, and the instances that answered. A
 * sample without counters (`counters` absent) contributes nothing.
 */
export function foldSamples(samples) {
  const byInstance = {};
  for (const sample of samples) {
    const c = sample?.storeCalls;
    if (!c || typeof c !== 'object') continue;
    const instance = typeof c.instance === 'string' && c.instance !== '' ? c.instance : 'unknown';
    const row = (byInstance[instance] ??= { head: 0, get: 0, put: 0, list: 0, del: 0 });
    for (const op of ['head', 'get', 'put', 'list', 'del'])
      row[op] = Math.max(row[op], Number(c[op] ?? 0));
    if (c.lists && typeof c.lists === 'object') {
      row.lists ??= {};
      for (const [folder, count] of Object.entries(c.lists))
        row.lists[folder] = Math.max(row.lists[folder] ?? 0, Number(count ?? 0));
    }
  }
  const instances = Object.keys(byInstance);
  const max = { head: 0, get: 0, put: 0, list: 0, del: 0 };
  for (const row of Object.values(byInstance)) {
    for (const op of ['head', 'get', 'put', 'list', 'del']) max[op] = Math.max(max[op], row[op]);
    if (row.lists) {
      max.lists ??= {};
      for (const [folder, count] of Object.entries(row.lists))
        max.lists[folder] = Math.max(max.lists[folder] ?? 0, count);
    }
  }
  return { byInstance, instances, max };
}

/**
 * The probe's own `sync.status` reads inside one sample's window: each costs the deck one
 * `deck.json` head on the answering instance (b3.md R7 b), noted before the counters are read, so
 * a sample of a quiet deck reads head 1 at the least. `reads` are the times of every read the
 * probe made (the settle's and the window's); the count is of those in (at - windowMs, at].
 */
export function ownReadsIn(reads, at, windowMs = STORE_WINDOW_MS) {
  return reads.filter((t) => t > at - windowMs && t <= at).length;
}

/**
 * Whether a settle sample reads the store quiet of the setup, so the row's window may start:
 * every row waits for `list` 0 (the one call the setup leaves behind: the card render of the
 * setup's write once the deck has rested 30 s prunes with one `list`, and so does a stream the
 * runtime reports closed late), and the show row, whose ceiling is no store call at all, waits
 * until nothing beyond the probe's own heads is in the window. A sample without counters (a
 * localhost base, a build whose sync.status carries no storeCalls) reads quiet at once.
 */
export function quietFor(id, storeCalls, own) {
  if (!storeCalls || typeof storeCalls !== 'object') return true;
  const c = classifyStoreCalls(storeCalls);
  if (c.list > 0) return false;
  if (id !== 'cost.show.calls') return true;
  return c.head - own <= 0 && c.get === 0 && c.put === 0 && c.del === 0;
}

/**
 * Judges one row from its counts (docs/SYNC.md 6.1). `counts` carries `functionPerMinute`,
 * `functionRequests`, `polls`, `commits`, `landed`, `connected`, `mutual`, `failedRequests`, the
 * folded store calls (`store`, null when the counters were not read), `firstSampleStore` with the
 * probe's `own` reads inside that sample's window, `ownMax` (the most of them in any window
 * sample) and `settle` (`{ settled, ms, samples, last }`, the wait before the window); `where`
 * says how the store half reads: `present` (the counters answered), `zero` (a localhost base: the
 * file store, the row asserts its function requests alone), `absent` (a deployment whose
 * sync.status carries no storeCalls yet, B3), `no-bearer` (a deployment run without the bearer).
 * Returns the result, the reason and the measure lines the gate records beside the row.
 */
export function judgeRow(id, counts, where) {
  /* the tier's restated store ceilings (docs/REALTIME.md section 2) when the run named one or the deck's sync.status did */
  const ceiling = ceilingsFor(id, counts?.tier ?? null);
  if (!ceiling) throw new RangeError(`${id} is not a cost probe row`);
  const measures = [];
  const over = [];
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  if (counts?.tier) measures.push(`tier ${counts.tier}`);
  /* the Redis command row (REALTIME.md section 2): the hour from the two windows, the presence
     write apart, the ceiling judged on the hour; no URL or no answer is not driven */
  if (ceiling.redisCommandsPerHour !== undefined) {
    const r = counts.redis;
    if (!r || r.where !== 'present')
      return {
        result: 'not driven',
        reason:
          r?.reason ??
          'no Redis URL (--redis-url, TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL): INFO commandstats cannot be read',
        measures: [
          `function requests ${fmt(counts.functionPerMinute ?? 0)} a minute in the editing window were read from the page${r?.target ? `; redis ${r.target.host}:${r.target.port} db ${r.target.db}` : ''}`,
        ],
      };
    const top = Object.entries(r.byName)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, n]) => `${name} ${n}`)
      .join(', ');
    measures.push(
      `Redis commands an editor hour ${r.hour} (ceiling ${ceiling.redisCommandsPerHour}): ${fmt(r.editingPerMinute)} a minute editing over ${fmt(r.editing.minutes)} min (${r.editing.commands} commands, ${r.editing.presencePosts} presence POSTs, ${r.editing.opsPosts} ops POSTs) and ${fmt(r.idlePerMinute)} a minute idle over ${fmt(r.idle.minutes)} min (${r.idle.commands} commands, ${r.idle.presencePosts} presence POSTs), counted as 12 editing and 48 idle minutes`,
    );
    measures.push(
      `the presence write apart: ${r.presence} calls of the presence family (${PRESENCE_COMMANDS.join(', ')}) and ${r.evalsha} evalsha over both windows; by command ${top || 'none'}`,
    );
    measures.push(
      `read from INFO commandstats on ${r.target.host}:${r.target.port} db ${r.target.db} (${r.source}); ${r.otherDbClients} client(s) of other databases were connected, whose commands the server wide counters carry too`,
    );
    if (r.hour > ceiling.redisCommandsPerHour)
      over.push(`Redis commands an editor hour ${r.hour} over ${ceiling.redisCommandsPerHour}`);
    if (counts.failedRequests > 0)
      over.push(`${counts.failedRequests} request(s) of the page failed or answered 5xx`);
    if (counts.connected === false) over.push('the tab lost its stream during the windows');
    if (over.length > 0) return { result: 'failed', reason: over.join('; '), measures };
    return { result: 'passed', reason: '', measures };
  }
  /* a state the probe never reached (the hidden tab when the browser reads visible) is not driven
     with the reason, whatever the visible tab's counts read; the counts are still recorded */
  if (counts.notDriven)
    return {
      result: 'not driven',
      reason: counts.notDriven,
      measures: [
        `function requests ${fmt(counts.functionPerMinute)} a minute and ${counts.polls} session poll(s) were read from the tab that stayed visible`,
      ],
    };
  if (ceiling.functionPerMinute !== undefined) {
    measures.push(
      `function requests ${fmt(counts.functionPerMinute)} a minute (ceiling ${ceiling.functionPerMinute}; ${counts.functionRequests} in ${fmt(counts.minutes)} min)`,
    );
    if (counts.functionPerMinute > ceiling.functionPerMinute)
      over.push(
        `function requests ${fmt(counts.functionPerMinute)} a minute over ${ceiling.functionPerMinute}`,
      );
  }
  if (ceiling.functionRequests !== undefined) {
    measures.push(
      `function requests ${counts.functionRequests} in the window (ceiling ${ceiling.functionRequests})`,
    );
    if (counts.functionRequests > ceiling.functionRequests)
      over.push(`${counts.functionRequests} function request(s) in the window, ceiling none`);
  }
  if (ceiling.polls !== undefined) {
    measures.push(`session polls ${counts.polls} (ceiling ${ceiling.polls})`);
    if (counts.polls > ceiling.polls) over.push(`${counts.polls} session poll(s), ceiling none`);
  }
  if (ceiling.commits !== undefined) {
    measures.push(
      `commits ${counts.commits} (at least ${ceiling.commits}), landed in A ${counts.landed ?? 'unread'}`,
    );
    if (counts.commits < ceiling.commits)
      over.push(`${counts.commits} commit(s) landed, ${ceiling.commits} asked`);
    if (counts.landed === false) over.push("A never read every word of B's ten commits");
  }
  if (counts.failedRequests > 0)
    over.push(`${counts.failedRequests} request(s) of the page failed or answered 5xx`);
  if (counts.connected === false) over.push('a tab lost its stream during the window');
  if (counts.mutual === false) over.push('the two tabs never listed each other in the roster');
  const storeCeilings = [
    'simplePerMinute',
    'advancedPerMinute',
    'list',
    'listVersions',
    'storeCalls',
  ].filter((k) => ceiling[k] !== undefined);
  let storeNote = '';
  if (storeCeilings.length > 0) {
    if (where === 'present') {
      const s = counts.store;
      const settle = counts.settle ?? null;
      if (settle !== null) {
        const last = settle.last
          ? ` (the last read before it: head ${settle.last.head}, get ${settle.last.get}, put ${settle.last.put}, list ${settle.last.list}, del ${settle.last.del}, ${settle.own ?? 0} of the heads the probe's own)`
          : '';
        measures.push(
          settle.settled
            ? `the store settled ${fmt(settle.ms / 1000)} s after the state was ready (${settle.samples} sync.status read(s) before the window${settle.samples > 1 ? `; the first read: head ${settle.first?.head ?? 0}, put ${settle.first?.put ?? 0}, list ${settle.first?.list ?? 0}, del ${settle.first?.del ?? 0}` : ''})`
            : `the store did not settle within ${fmt(settle.ms / 1000)} s and the window started anyway${last}`,
        );
      }
      if (ceiling.simplePerMinute !== undefined) {
        measures.push(
          `store simple ${s.simple} a minute (ceiling ${ceiling.simplePerMinute}; ${counts.ownMax ?? 0} of the heads the probe's own sync.status reads, which the ceiling carries, b3.md R7 b)`,
        );
        if (s.simple > ceiling.simplePerMinute)
          over.push(`store simple ${s.simple} a minute over ${ceiling.simplePerMinute}`);
      }
      if (ceiling.advancedPerMinute !== undefined) {
        measures.push(
          `store advanced ${s.advanced} a minute (ceiling ${ceiling.advancedPerMinute})`,
        );
        if (s.advanced > ceiling.advancedPerMinute)
          over.push(`store advanced ${s.advanced} a minute over ${ceiling.advancedPerMinute}`);
      }
      if (ceiling.list !== undefined) {
        measures.push(`store list ${s.list} (ceiling ${ceiling.list})`);
        if (s.list > ceiling.list) over.push(`store list ${s.list}, ceiling none`);
      }
      if (ceiling.listVersions !== undefined) {
        /* the pull row: judged on the pull's own listing, `lists.versions` (docs/SYNC.md 3.5);
           the deck's other listings inside the window are recorded by folder and never judged */
        if (s.lists) {
          const versions = Number(s.lists.versions ?? 0);
          const byFolder =
            Object.entries(s.lists)
              .filter(([, count]) => count > 0)
              .map(([folder, count]) => `${folder} ${count}`)
              .join(', ') || 'none';
          measures.push(
            `store list ${s.list} in the window, by folder: ${byFolder}; the pull's own listing (versions) ${versions} (ceiling ${ceiling.listVersions})`,
          );
          if (versions > ceiling.listVersions)
            over.push(`the pull listed versions/ ${versions} time(s), ceiling none`);
        } else {
          measures.push(
            `store list ${s.list} (ceiling ${ceiling.listVersions} on the pull's listing; these counters do not name the folder, so the whole count is judged)`,
          );
          if (s.list > ceiling.listVersions)
            over.push(`store list ${s.list}, ceiling none (the folder unnamed)`);
        }
      }
      if (ceiling.storeCalls !== undefined) {
        const first = counts.firstSampleStore ?? s;
        const own = Number(first.own ?? 0);
        const total = first.head + first.get + first.put + first.list + first.del;
        /* the probe's own reads are heads alone (b3.md R7 b); the page's calls are the rest */
        const page = Math.max(0, first.head - own) + first.get + first.put + first.list + first.del;
        measures.push(
          `store calls at the first sample ${total} (head ${first.head}, get ${first.get}, put ${first.put}, list ${first.list}, del ${first.del}), of which ${own} the probe's own sync.status read(s) (one deck.json head each, b3.md R7 b); the page's ${page} (ceiling ${ceiling.storeCalls})`,
        );
        if (page > ceiling.storeCalls)
          over.push(
            `${page} store call(s) in the window beyond the probe's own reads, ceiling none`,
          );
      }
      if (counts.functionRequestsBeforeWindow !== undefined)
        measures.push(
          `function requests between the load and the window ${counts.functionRequestsBeforeWindow} (the settle, ${fmt((counts.settle?.ms ?? 0) / 1000)} s)`,
        );
      if (id === 'sync.pull.no-listing')
        measures.push(
          `store get ${s.get} against ${counts.commits} commit(s) (one snapshot or record read per commit)`,
        );
      measures.push(`instances answering sync.status ${counts.instances}`);
    } else if (where === 'zero') {
      storeNote =
        'the store half reads zero on this base (the file store); the function requests alone are asserted';
      measures.push(storeNote);
    } else if (where === 'absent') {
      storeNote =
        'sync.status carries no storeCalls on this build (docs/SYNC.md 6.3, B3): the store half is not driven';
    } else {
      storeNote = `no bearer for sync.status on ${BASE} (TURBOSLIDE_TOKEN or the hosts.json row): the store half is not driven`;
    }
  }
  if (over.length > 0) return { result: 'failed', reason: over.join('; '), measures };
  if (storeNote !== '' && where !== 'zero')
    return { result: 'not driven', reason: storeNote, measures };
  return { result: 'passed', reason: '', measures };
}

// ---------------------------------------------------------------------------------------------
// helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const now = () => Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ROW ?? 'all', ...a);

const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (now() > until) return v;
    await sleep(every);
  }
};
const connected = (page, timeout = 45_000) =>
  pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    timeout,
  );
const settled = (page, timeout = 20_000) =>
  pollUntil(
    () => state(page),
    (s) => (s.sync?.pending ?? s.pending ?? 0) === 0,
    timeout,
  );
const waitRevision = (page, want, timeout = 45_000) =>
  pollUntil(
    () => state(page).then((s) => s.revision),
    (r) => r >= want,
    timeout,
  );
const runs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
const runRect = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, run);
const runText = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  }, run);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
const openRun = async (page, run) => {
  const r = await runRect(page, run);
  if (!r) throw new Error(`no run ${run}`);
  await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  const ok = await pollUntil(
    () => editing(page),
    (v) => v === true,
    4000,
    50,
  );
  await page.keyboard.press(END_OF_TEXT);
  await page.keyboard.press('End');
  return ok;
};
const dismissPrompt = async (page) => {
  if (
    await ctl(page, 'dialog.namePrompt')
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0)
      await clickControl(page, 'dialog.namePrompt.close').catch(() => undefined);
    else await clickControl(page, 'dialog.namePrompt.skip').catch(() => undefined);
  }
  if (
    await ctl(page, 'sync.persisted')
      .first()
      .isVisible()
      .catch(() => false)
  )
    await clickControl(page, 'sync.persisted.apply').catch(() => undefined);
};
const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => undefined);
};

// ---------------------------------------------------------------------------------------------
// the network log (the shape of measure.mjs; no header, cookie or body is recorded)

const ORIGIN_HOST = (() => {
  try {
    return new URL(BASE).host;
  } catch {
    return '';
  }
})();

export function routeOf(url, originHost = ORIGIN_HOST) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { route: 'other', kind: 'other' };
  }
  if (u.hostname.endsWith('.blob.vercel-storage.com'))
    return { route: 'blob public host', kind: 'store' };
  if (u.host !== originHost) return { route: `third party ${u.hostname}`, kind: 'other' };
  const p = u.pathname;
  let m;
  if ((m = /^\/api\/decks\/[^/]+\/(stream|ops|presence)$/.exec(p)))
    return { route: `/api/decks/<id>/${m[1]}`, kind: 'function' };
  if (p.startsWith('/_serverFn/'))
    return { route: `/_serverFn/${p.slice(11, 19)}…`, kind: 'function' };
  if (p.startsWith('/api/render/')) return { route: '/api/render/<slide>', kind: 'function' };
  if (p.startsWith('/api/x/csp/')) return { route: '/api/x/csp/report', kind: 'function' };
  if (p.startsWith('/api/')) return { route: p.replace(/[a-z0-9]{8,}/g, '<x>'), kind: 'function' };
  if (/^\/decks\/[^/]+\/assets\//.test(p))
    return { route: '/decks/<id>/assets/*', kind: 'function' };
  if (
    p.startsWith('/assets/') ||
    p.startsWith('/home/') ||
    p.startsWith('/brand/') ||
    p.startsWith('/icons/') ||
    p.startsWith('/fonts/') ||
    p === '/favicon.ico' ||
    p.startsWith('/@') ||
    p.startsWith('/node_modules/') ||
    p.startsWith('/src/') ||
    p.startsWith('/packages/') ||
    /\.(js|mjs|css|map|woff2?|png|jpe?g|svg|webp|ico|json)$/.test(p)
  )
    return { route: `${p.split('/')[1] || 'root'}/* (static)`, kind: 'static' };
  if (/^\/(edit|deck|present|embed|print)\/[^/]+/.test(p))
    return { route: `/${p.split('/')[1]}/<id> (document)`, kind: 'function' };
  return { route: `${p} (document)`, kind: 'function' };
}

/** Which server function a POST body names: the session poll, the attach, the answer, or unknown. */
export function serverFnKind(postData) {
  const body = postData ?? '';
  if (body.includes('timeoutMs')) return 'poll';
  if (body.includes('"owner"') || body.includes('\\"owner\\"')) return 'attach';
  if (body.includes('"answer"') || body.includes('\\"answer\\"')) return 'answer';
  return 'other';
}

function attachLog(page, who, records) {
  page.on('request', (request) => {
    const url = request.url();
    const { route, kind } = routeOf(url);
    const row = {
      who,
      t: now(),
      route,
      kind,
      method: request.method(),
      type: request.resourceType(),
      status: null,
      ms: null,
      failed: null,
      fn:
        route.startsWith('/_serverFn/') && request.method() === 'POST'
          ? serverFnKind(request.postData())
          : null,
      _req: request,
    };
    records.push(row);
  });
  page.on('response', (response) => {
    const row = records.find((r) => r._req === response.request());
    if (!row) return;
    row.status = response.status();
  });
  page.on('requestfinished', (request) => {
    const row = records.find((r) => r._req === request);
    if (!row) return;
    row.ms = now() - row.t;
  });
  page.on('requestfailed', (request) => {
    const row = records.find((r) => r._req === request);
    if (!row) return;
    row.ms = now() - row.t;
    row.failed = request.failure()?.errorText ?? 'failed';
  });
}

/** The requests inside [t0, t1) by route, with the function request count and the polls. */
export function summarize(records, t0, t1) {
  const minutes = Math.max(1 / 60, (t1 - t0) / 60_000);
  const inWindow = records.filter((r) => r.t >= t0 && r.t < t1);
  const byRoute = {};
  for (const r of inWindow) {
    const b = (byRoute[r.route] ??= { requests: 0, statuses: {}, methods: {}, failed: 0 });
    b.requests += 1;
    const key = r.status ?? (r.failed ? 'failed' : 'pending');
    b.statuses[key] = (b.statuses[key] ?? 0) + 1;
    b.methods[r.method] = (b.methods[r.method] ?? 0) + 1;
    if (r.failed) b.failed += 1;
  }
  const fn = inWindow.filter((r) => r.kind === 'function');
  const rows = Object.entries(byRoute)
    .map(([route, b]) => ({ route, ...b, perMinute: Number((b.requests / minutes).toFixed(2)) }))
    .sort((a, b) => b.requests - a.requests);
  return {
    windowMs: t1 - t0,
    minutes: Number(minutes.toFixed(2)),
    requests: inWindow.length,
    functionRequests: fn.length,
    functionPerMinute: Number((fn.length / minutes).toFixed(2)),
    polls: fn.filter((r) => r.fn === 'poll').length,
    attaches: fn.filter((r) => r.fn === 'attach').length,
    presence: fn.filter((r) => r.route === '/api/decks/<id>/presence').length,
    ops: fn.filter((r) => r.route === '/api/decks/<id>/ops').length,
    streams: fn.filter((r) => r.route === '/api/decks/<id>/stream').length,
    /* a request that failed or answered 5xx; an aborted stream at the window's end is not a failure */
    failedRequests: fn.filter(
      (r) =>
        (r.status !== null && r.status >= 500) ||
        (r.failed !== null && r.route !== '/api/decks/<id>/stream'),
    ).length,
    rows,
  };
}

const strip = (records) => records.map(({ _req, ...r }) => r);

// ---------------------------------------------------------------------------------------------
// the Redis read of cost.redis.commands (docs/REALTIME.md section 2): a plain RESP exchange

/** Encodes one command as a RESP array. */
export function respCommand(parts) {
  let out = `*${parts.length}\r\n`;
  for (const part of parts) {
    const s = String(part);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

/**
 * Parses one RESP reply at `offset` of a buffer: `{ value, end }` or null while the reply is
 * incomplete. Simple strings, errors (as `{ error }`), integers, bulk strings and arrays.
 */
export function respParse(buf, offset = 0) {
  if (offset >= buf.length) return null;
  const type = String.fromCharCode(buf[offset]);
  const lineEnd = buf.indexOf('\r\n', offset);
  if (lineEnd < 0) return null;
  const line = buf.toString('utf8', offset + 1, lineEnd);
  const after = lineEnd + 2;
  if (type === '+') return { value: line, end: after };
  if (type === '-') return { value: { error: line }, end: after };
  if (type === ':') return { value: Number(line), end: after };
  if (type === '$') {
    const n = Number(line);
    if (n < 0) return { value: null, end: after };
    if (buf.length < after + n + 2) return null;
    return { value: buf.toString('utf8', after, after + n), end: after + n + 2 };
  }
  if (type === '*') {
    const n = Number(line);
    if (n < 0) return { value: null, end: after };
    const items = [];
    let at = after;
    for (let i = 0; i < n; i += 1) {
      const item = respParse(buf, at);
      if (item === null) return null;
      items.push(item.value);
      at = item.end;
    }
    return { value: items, end: at };
  }
  throw new Error(`redis: an unknown reply type ${JSON.stringify(type)}`);
}

/**
 * One connection to the Redis the URL names, running the commands in order and answering their
 * replies; the password rides AUTH and is never read back. Rejects on a connection error or a
 * reply error, after at most `timeoutMs`.
 */
export function redisExchange(url, commands, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const target = redisTarget(url);
    const password = decodeURIComponent(u.password || '');
    const username = decodeURIComponent(u.username || '');
    const all = [
      ...(password !== ''
        ? [username && username !== 'default' ? ['AUTH', username, password] : ['AUTH', password]]
        : []),
      ['SELECT', String(target.db)],
      ...commands,
      ['QUIT'],
    ];
    const replies = [];
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else {
        /* the AUTH and SELECT answers and QUIT's are dropped; the commands' replies answer */
        const skip = password !== '' ? 2 : 1;
        resolve(replies.slice(skip, skip + commands.length));
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(`redis: no answer from ${target.host}:${target.port} within ${timeoutMs} ms`),
        ),
      timeoutMs,
    );
    const options = { host: target.host, port: target.port };
    const socket = target.tls
      ? tlsConnect({ ...options, servername: target.host })
      : netConnect(options);
    socket.on('error', (error) => finish(new Error(`redis: ${error.message}`)));
    socket.on('close', () => {
      if (replies.length >= all.length) finish(null);
      else
        finish(
          new Error(
            `redis: the connection closed after ${replies.length} of ${all.length} replies`,
          ),
        );
    });
    socket.on(target.tls ? 'secureConnect' : 'connect', () => {
      socket.write(all.map(respCommand).join(''));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        let parsed;
        try {
          parsed = respParse(buf, 0);
        } catch (error) {
          finish(error);
          return;
        }
        if (parsed === null) break;
        buf = buf.subarray(parsed.end);
        if (
          parsed.value &&
          typeof parsed.value === 'object' &&
          !Array.isArray(parsed.value) &&
          'error' in parsed.value
        ) {
          finish(new Error(`redis: ${parsed.value.error}`));
          return;
        }
        replies.push(parsed.value);
        if (replies.length >= all.length) {
          finish(null);
          return;
        }
      }
    });
  });
}

/**
 * One reading of the Redis: the per command calls of `INFO commandstats`, the connected clients
 * and how many of them sit on another database than the URL's (a shared local container).
 */
export async function readRedisStats(url) {
  const target = redisTarget(url);
  const [info, clients] = await redisExchange(url, [
    ['INFO', 'commandstats'],
    ['CLIENT', 'LIST'],
  ]);
  const lines = String(clients ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const otherDbClients = lines.filter((l) => {
    const m = /(?:^|\s)db=(\d+)/.exec(l);
    return m !== null && Number(m[1]) !== target.db;
  }).length;
  return {
    at: now(),
    calls: parseCommandstats(info),
    clients: lines.length,
    otherDbClients,
    target,
  };
}

// ---------------------------------------------------------------------------------------------
// the bearer and the counters

/** Where the bearer for sync.status comes from; the value stays in memory and is never printed. */
function bearer() {
  if (LOCAL) return { token: '', source: 'localhost' };
  const env = process.env.TURBOSLIDE_TOKEN ?? '';
  if (env !== '') return { token: env, source: 'TURBOSLIDE_TOKEN' };
  const file = join(homedir(), '.config', 'turboslide', 'hosts.json');
  if (existsSync(file)) {
    try {
      const hosts = JSON.parse(readFileSync(file, 'utf8')).hosts ?? {};
      const row = hosts[BASE] ?? null;
      if (row && typeof row.token === 'string' && row.token !== '')
        return { token: row.token, source: 'hosts.json' };
    } catch {
      // no row
    }
  }
  return { token: '', source: 'none' };
}

/**
 * One `sync.status` read for the deck through the agent surface, with the probe's own request
 * context (never the page's). Answers `{ at, status, storeCalls | null, counters }`, where
 * `counters` is `present`, `absent` (the answer carries no storeCalls) or `unreadable` (a refusal).
 */
async function sampleStoreCalls(api, deckId, auth) {
  const headers = { 'content-type': 'application/json', ...extraHTTPHeaders };
  if (auth.token !== '') headers.authorization = `Bearer ${auth.token}`;
  const at = now();
  try {
    const res = await api.post(
      `${BASE}/api/actions/sync.status?deck=${encodeURIComponent(deckId)}`,
      {
        headers,
        data: {},
        timeout: 30_000,
        maxRedirects: 0,
      },
    );
    const status = res.status();
    const body = await res.json().catch(() => null);
    const storeCalls =
      body && typeof body === 'object' && body.storeCalls && typeof body.storeCalls === 'object'
        ? body.storeCalls
        : null;
    return {
      at,
      status,
      storeCalls,
      counters: status === 200 ? (storeCalls ? 'present' : 'absent') : 'unreadable',
      revision: body?.revision ?? null,
    };
  } catch (error) {
    return {
      at,
      status: 0,
      storeCalls: null,
      counters: 'unreadable',
      error: String(error).slice(0, 200),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// the scratch deck and its teardown

async function freshDeck(page) {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  const all = await runs(page);
  const head = all.find((x) => /heading/.test(x)) ?? all[0] ?? null;
  if (!head) throw new Error(`${info.id}: no run to type the title into`);
  await dismissPrompt(page);
  await openRun(page, head);
  await typeHuman(page, `Cost probe ${ROW ?? ''}`.trim());
  await sleep(300);
  await page.keyboard.press('Escape');
  const revision = await waitRevision(page, 1, 60_000);
  await page.waitForURL(/\/edit\//, { timeout: 45_000 }).catch(() => undefined);
  await connected(page);
  await dismissPrompt(page);
  await settled(page);
  const s = await state(page);
  const body = all.find((x) => x !== head) ?? null;
  return { id: info.id, titleSlide: s.slideId, head, body, revision, tier: s.sync?.tier ?? null };
}

async function teardown(page, deckId) {
  const result = { trashed: 'not tried', removed: 'not tried', edit: null, deck: null };
  try {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await settled(page);
    await page.keyboard.press('Escape');
    await clickControl(page, 'menubar.file');
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'menu.file.moveToTrash');
    await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
    result.trashed = 'File > Move to trash';
  } catch (error) {
    result.trashed = `the menu failed (${String(error).split('\n')[0].slice(0, 120)}); the window API`;
    try {
      await page
        .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
      await editorReady(page).catch(() => undefined);
      const info = await invoke(page, 'deck.info').catch(() => null);
      if (info)
        await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
    } catch {
      // the 404 row below tells the truth
    }
  }
  try {
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
      timeout: 30_000,
    });
    const card = page.locator(`[data-control="trash.card.${deckId}"]`);
    await card.waitFor({ timeout: 30_000 });
    await clickControl(page, `trash.delete.${deckId}`);
    await clickControl(page, 'trash.confirm.ok');
    await card.waitFor({ state: 'detached', timeout: 30_000 });
    result.removed = 'Delete forever on /decks/trash';
  } catch (error) {
    result.removed = `the trash page failed (${String(error).split('\n')[0].slice(0, 120)}); the window API`;
    await page
      .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await editorReady(page).catch(() => undefined);
    const info = await invoke(page, 'deck.info').catch(() => null);
    if (info) {
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
        () => undefined,
      );
      const again = await invoke(page, 'deck.info').catch(() => null);
      await invoke(page, 'deck.remove', {
        id: deckId,
        baseRevision: again?.revision ?? info.revision,
        confirm: true,
      }).catch(() => undefined);
    }
  }
  const until = now() + 30_000;
  for (;;) {
    for (const route of ['edit', 'deck']) {
      const res = await page.request
        .get(`${BASE}/${route}/${deckId}`, { headers: extraHTTPHeaders, maxRedirects: 0 })
        .catch(() => null);
      result[route] = res ? res.status() : 'no answer';
    }
    if ((result.edit === 404 && result.deck === 404) || now() > until) break;
    await sleep(2000);
  }
  result.gone = result.edit === 404 && result.deck === 404;
  return result;
}

// ---------------------------------------------------------------------------------------------
// one state

async function runRow(id) {
  const row = coreRow(id);
  if (row.driver !== COST_PROBE_DRIVER) throw new RangeError(`${id} is not a cost probe row`);
  const out = {
    id,
    interaction: row.interaction,
    base: BASE,
    local: LOCAL,
    minutes: MINUTES,
    startedAt: new Date().toISOString(),
    ceilings: CEILINGS[id],
    phases: {},
  };
  const auth = bearer();
  out.bearer = auth.source;
  out.tierArg = TIER_ARG;
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: VIEWPORT, extraHTTPHeaders });
  const A = await ctxA.newPage();
  const api = await playwrightRequest.newContext({ extraHTTPHeaders });
  const records = [];
  attachLog(A, 'A', records);
  A.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !/upgrade-insecure-requests|ERR_INTERNET_DISCONNECTED/.test(m.text())
    )
      (out.console ??= []).push({ who: 'A', at: now(), error: m.text().slice(0, 300) });
  });
  let ctxB = null;
  let B = null;
  let deck = null;
  const samples = [];
  /** The times of every sync.status read the probe made (the settle's and the window's), R7 b. */
  const reads = [];
  let counts = null;
  try {
    const tSetup0 = now();
    deck = await freshDeck(A);
    out.deck = deck;
    /* the tier the ceilings follow: the caller's --tier, else the deck's sync.status tier (REALTIME.md section 2) */
    out.tier = TIER_ARG ?? deck.tier;
    out.phases.setup = summarize(records, tSetup0, now());
    log('deck', deck.id, 'tier', deck.tier, 'revision', deck.revision, 'ceilings for', out.tier);

    /** One read of the counters, with the probe's own reads inside its window counted (R7 b). */
    const read = async () => {
      const sample = await sampleStoreCalls(api, deck.id, auth);
      reads.push(sample.at);
      return { ...sample, own: ownReadsIn(reads, sample.at) };
    };
    const brief = (sample) =>
      sample.storeCalls
        ? `head ${sample.storeCalls.head} get ${sample.storeCalls.get} put ${sample.storeCalls.put} list ${sample.storeCalls.list} del ${sample.storeCalls.del} own ${sample.own} instance ${String(sample.storeCalls.instance ?? '').slice(0, 8)}`
        : `status ${sample.status}`;
    /** Samples the counters at the five fractions of a window of `ms` from `t0` while `during` runs. */
    const sampler = async (t0, ms) => {
      for (const f of SAMPLE_FRACTIONS) {
        const at = t0 + Math.round(ms * f);
        const wait = at - now();
        if (wait > 0) await sleep(wait);
        const sample = await read();
        samples.push({ fraction: f, sinceWindowMs: now() - t0, ...sample });
        log('sample', f.toFixed(2), sample.counters, brief(sample));
      }
    };
    /**
     * The settle before the window (the module comment): the counters read every SETTLE_EVERY_MS
     * until the row's quiet reading or SETTLE_MAX_MS, then a pause so the first window sample
     * lands a full counters' window after the last read here. Answers what judgeRow records.
     */
    const settle = async () => {
      const startedAt = now();
      const rows = [];
      let settled = false;
      for (;;) {
        const sample = await read();
        rows.push({ sinceMs: sample.at - startedAt, ...sample });
        settled =
          sample.counters === 'present' ? quietFor(id, sample.storeCalls, sample.own) : true;
        log('settle', settled ? 'quiet' : 'busy', sample.counters, brief(sample));
        if (settled || now() - startedAt >= SETTLE_MAX_MS) break;
        await sleep(SETTLE_EVERY_MS);
      }
      await sleep(2000);
      const first = rows[0];
      const last = rows[rows.length - 1];
      const phase = {
        startedAt: new Date(startedAt).toISOString(),
        ms: now() - startedAt,
        settled,
        maxMs: SETTLE_MAX_MS,
        everyMs: SETTLE_EVERY_MS,
        samples: rows,
      };
      out.phases.settle = phase;
      return {
        settled,
        ms: phase.ms,
        samples: rows.length,
        first: first?.storeCalls ? classifyStoreCalls(first.storeCalls) : null,
        last: last?.storeCalls ? classifyStoreCalls(last.storeCalls) : null,
        own: last?.own ?? 0,
      };
    };
    const windowMs = MINUTES * 60_000;

    if (
      id === 'cost.editor-idle.calls' ||
      id === 'cost.editor-hidden.calls' ||
      id === 'cost.editor-editing.calls'
    ) {
      await sleep(5000);
      let notDriven = null;
      if (id === 'cost.editor-hidden.calls') {
        /* a second page brought to the front; the row is not driven when the browser never reads hidden */
        const second = await ctxA.newPage();
        await second.goto('about:blank');
        await second.bringToFront();
        await sleep(1500);
        const visibility = await A.evaluate(() => document.visibilityState);
        out.visibility = visibility;
        if (visibility !== 'hidden')
          notDriven = `document.visibilityState read "${visibility}" after a second page was brought to the front (headless Chromium reports no hidden page), so the hidden state was not reached`;
        log('visibility after bringToFront', visibility);
      }
      const settledAs = await settle();
      const t0 = now();
      await shot(A, `${id}-start`);
      const sampling = sampler(t0, windowMs);
      if (id === 'cost.editor-editing.calls') {
        const target = deck.body ?? deck.head;
        let n = 0;
        const end = t0 + windowMs;
        while (now() < end) {
          const tick = now();
          try {
            await openRun(A, target);
            await typeHuman(A, n % 2 === 0 ? 'ok ' : 'go ');
            await A.keyboard.press('Escape');
            n += 1;
          } catch (error) {
            (out.editErrors ??= []).push(String(error).split('\n')[0].slice(0, 200));
          }
          const wait = 5000 - (now() - tick);
          if (wait > 0) await sleep(Math.min(wait, Math.max(0, end - now())));
        }
        out.edits = n;
      }
      await sampling;
      const t1 = now();
      await shot(A, `${id}-end`);
      const s = await state(A);
      out.phases.window = summarize(records, t0, t1);
      out.saveState = await A.evaluate(
        () =>
          document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
      );
      out.revisionAfter = s.revision;
      counts = {
        ...windowCounts(out.phases.window),
        connected: s.sync?.connected ?? null,
        notDriven,
        settle: settledAs,
      };
    }

    if (id === 'cost.two-tabs-idle.calls') {
      ctxB = await browser.newContext({
        viewport: VIEWPORT,
        extraHTTPHeaders,
        storageState: await ctxA.storageState(),
      });
      B = await ctxB.newPage();
      attachLog(B, 'B', records);
      await B.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
      await editorReady(B);
      await connected(B);
      await dismissPrompt(B);
      await sleep(5000);
      const settledAs = await settle();
      const t0 = now();
      await shot(A, `${id}-a-start`);
      await shot(B, `${id}-b-start`);
      await sampler(t0, windowMs);
      const t1 = now();
      const [sa, sb] = await Promise.all([state(A), state(B)]);
      out.phases.window = summarize(records, t0, t1);
      out.roster = {
        a: { clientId: sa.presence?.clientId ?? null, others: (sa.presence?.others ?? []).length },
        b: { clientId: sb.presence?.clientId ?? null, others: (sb.presence?.others ?? []).length },
      };
      counts = {
        ...windowCounts(out.phases.window),
        connected: sa.sync?.connected === true && sb.sync?.connected === true,
        mutual: (sa.presence?.others ?? []).length >= 1 && (sb.presence?.others ?? []).length >= 1,
        settle: settledAs,
      };
    }

    if (id === 'cost.show.calls') {
      const tLoad0 = now();
      await A.goto(`${BASE}/deck/${deck.id}?present=1`, { waitUntil: 'load' });
      await sleep(8000);
      const tLoad1 = now();
      out.phases.load = summarize(records, tLoad0, tLoad1);
      /* the editor tab this page left behind: its stream closes when the runtime reports the
         reader gone (35 s), which flushes the card render and prunes the snapshots; the window
         starts once those calls have left the counters' window (the module comment) */
      const settledAs = await settle();
      const t0 = now();
      out.phases.settleRequests = summarize(records, tLoad1, t0);
      await shot(A, `${id}-start`);
      await sampler(t0, windowMs);
      const t1 = now();
      await shot(A, `${id}-end`);
      out.phases.window = summarize(records, t0, t1);
      out.showDrawn = await A.evaluate(
        () =>
          document.querySelector('[data-control="present.show"], .pt-slide, .pt-viewer') !== null,
      );
      counts = {
        ...windowCounts(out.phases.window),
        settle: settledAs,
        functionRequestsBeforeWindow: out.phases.settleRequests.functionRequests,
      };
    }

    if (id === 'cost.redis.commands') {
      /* the Redis command row (docs/REALTIME.md section 2): INFO commandstats before and after
         an editing window (one edit per 5 s) and an idle window, the hour counted as 12 editing
         and 48 idle minutes from the two rates; without a URL or an answer the row is not driven */
      const redis = { where: 'no-url', source: REDIS_URL_SOURCE, reason: null, target: null };
      let stats0 = null;
      if (REDIS_URL !== null) {
        redis.target = redisTarget(REDIS_URL);
        try {
          stats0 = await readRedisStats(REDIS_URL);
          redis.where = 'present';
        } catch (error) {
          redis.where = 'unreachable';
          redis.reason = `the Redis at ${redis.target.host}:${redis.target.port} did not answer INFO commandstats: ${String(error.message ?? error).slice(0, 160)}`;
        }
      }
      await sleep(5000);
      const target = deck.body ?? deck.head;
      const editMs = MINUTES * 60_000;
      const idleMs = IDLE_MINUTES * 60_000;
      const tE0 = now();
      await shot(A, `${id}-editing-start`);
      let n = 0;
      const endE = tE0 + editMs;
      while (now() < endE) {
        const tick = now();
        try {
          await openRun(A, target);
          await typeHuman(A, n % 2 === 0 ? 'ok ' : 'go ');
          await A.keyboard.press('Escape');
          n += 1;
        } catch (error) {
          (out.editErrors ??= []).push(String(error).split('\n')[0].slice(0, 200));
        }
        const wait = 5000 - (now() - tick);
        if (wait > 0) await sleep(Math.min(wait, Math.max(0, endE - now())));
      }
      /* the last edit's run lands with the checkpointer's 2 s idle before the stats are read */
      await sleep(2500);
      const tE1 = now();
      const stats1 =
        redis.where === 'present' ? await readRedisStats(REDIS_URL).catch(() => null) : null;
      out.edits = n;
      const tI0 = now();
      await sleep(idleMs);
      const tI1 = now();
      const stats2 =
        redis.where === 'present' ? await readRedisStats(REDIS_URL).catch(() => null) : null;
      await shot(A, `${id}-idle-end`);
      const s = await state(A);
      out.phases.editing = summarize(records, tE0, tE1);
      out.phases.idle = summarize(records, tI0, tI1);
      out.phases.window = out.phases.editing;
      if (redis.where === 'present' && (stats1 === null || stats2 === null)) {
        redis.where = 'unreachable';
        redis.reason = `the Redis at ${redis.target.host}:${redis.target.port} answered the first INFO commandstats and not a later one`;
      }
      if (redis.where === 'present') {
        const editing = commandDelta(stats0.calls, stats1.calls);
        const idle = commandDelta(stats1.calls, stats2.calls);
        const whole = commandDelta(stats0.calls, stats2.calls);
        const hour = editorHour(
          { commands: editing.total, minutes: out.phases.editing.minutes },
          { commands: idle.total, minutes: out.phases.idle.minutes },
        );
        const apart = presenceApart(whole.byName);
        Object.assign(redis, {
          editing: {
            commands: editing.total,
            minutes: out.phases.editing.minutes,
            byName: editing.byName,
            presencePosts: out.phases.editing.presence,
            opsPosts: out.phases.editing.ops,
          },
          idle: {
            commands: idle.total,
            minutes: out.phases.idle.minutes,
            byName: idle.byName,
            presencePosts: out.phases.idle.presence,
            opsPosts: out.phases.idle.ops,
          },
          byName: whole.byName,
          ...hour,
          presence: apart.presence,
          evalsha: apart.evalsha,
          clients: stats2.clients,
          otherDbClients: Math.max(
            stats0.otherDbClients,
            stats1.otherDbClients,
            stats2.otherDbClients,
          ),
          readsAt: [stats0.at, stats1.at, stats2.at],
        });
        log(
          'redis',
          `editing ${editing.total} in ${out.phases.editing.minutes} min, idle ${idle.total} in ${out.phases.idle.minutes} min, hour ${hour.hour}`,
        );
      } else log('redis', redis.where, redis.reason ?? '');
      out.redis = redis;
      counts = {
        ...windowCounts(out.phases.editing),
        connected: s.sync?.connected ?? null,
        redis,
      };
    }

    if (id === 'sync.pull.no-listing') {
      ctxB = await browser.newContext({
        viewport: VIEWPORT,
        extraHTTPHeaders,
        storageState: await ctxA.storageState(),
      });
      B = await ctxB.newPage();
      attachLog(B, 'B', records);
      await B.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
      await editorReady(B);
      await connected(B);
      await dismissPrompt(B);
      const target = deck.body ?? deck.head;
      await sleep(2000);
      const settledAs = await settle();
      const t0 = now();
      const exchangeMs = 10 * 3000 + 15_000;
      const sampling = sampler(t0, exchangeMs);
      const words = [];
      const revisionBefore = (await state(B)).revision;
      for (let k = 1; k <= 10; k += 1) {
        const tick = now();
        const word = `pull${k} `;
        words.push(word.trim());
        await openRun(B, target);
        await typeHuman(B, word);
        await B.keyboard.press('Escape');
        await settled(B, 10_000);
        const wait = 3000 - (now() - tick);
        if (wait > 0) await sleep(wait);
      }
      const landed = await pollUntil(
        () => runText(A, target),
        (t) => t !== null && words.every((w) => t.includes(w)),
        15_000,
        200,
      );
      await sampling;
      const t1 = now();
      const sb = await state(B);
      out.phases.window = summarize(records, t0, t1);
      out.commits = { revisionBefore, revisionAfter: sb.revision, words, aText: landed };
      const opsPosts = records.filter(
        (r) => r.t >= t0 && r.t < t1 && r.route === '/api/decks/<id>/ops' && r.method === 'POST',
      );
      counts = {
        ...windowCounts(out.phases.window),
        commits: sb.revision - revisionBefore,
        opsPosts: opsPosts.length,
        opsAnswered200: opsPosts.filter((r) => r.status === 200).length,
        landed: landed !== null && words.every((w) => landed.includes(w)),
        settle: settledAs,
      };
      if (counts.opsPosts > counts.opsAnswered200)
        counts.failedRequests =
          (counts.failedRequests ?? 0) + counts.opsPosts - counts.opsAnswered200;
    }

    /* the store half */
    const folded = foldSamples(samples);
    out.storeCalls = {
      samples,
      byInstance: folded.byInstance,
      max: folded.max,
      instances: folded.instances,
      counters: samples.some((s) => s.counters === 'present')
        ? 'present'
        : samples.some((s) => s.counters === 'absent')
          ? 'absent'
          : 'unreadable',
    };
    let where;
    if (LOCAL) where = 'zero';
    else if (auth.token === '') where = 'no-bearer';
    else if (out.storeCalls.counters === 'present') where = 'present';
    else if (out.storeCalls.counters === 'absent') where = 'absent';
    else where = 'no-bearer';
    if (LOCAL && out.storeCalls.counters === 'present') {
      /* B3's counters on a localhost server: recorded, and read as zero for the row (6.3) */
      out.storeCalls.note =
        'counters present on a localhost base; the row reads them as zero (the file store)';
    }
    out.where = where;
    const firstPresent = samples.find((s) => s.counters === 'present');
    counts.store = classifyStoreCalls(folded.max);
    counts.firstSampleStore = firstPresent
      ? { ...classifyStoreCalls(firstPresent.storeCalls), own: firstPresent.own }
      : { ...counts.store, own: 0 };
    counts.ownMax = samples.reduce((m, s) => Math.max(m, s.own ?? 0), 0);
    out.storeCalls.ownReads = reads.length;
    counts.instances = folded.instances.length;
    counts.minutes = out.phases.window?.minutes ?? MINUTES;
    counts.tier = out.tier ?? null;
    const verdict = judgeRow(id, counts, where);
    out.counts = counts;
    out.result = verdict.result;
    out.reason = verdict.reason;
    out.measures = verdict.measures;
    log(id, verdict.result, verdict.reason || '', '|', verdict.measures.join(' | '));
  } catch (error) {
    out.error = String(error && error.stack ? error.stack : error)
      .split('\n')
      .slice(0, 4)
      .join(' | ');
    out.result = 'failed';
    out.reason = `the probe failed: ${String(error).split('\n')[0].slice(0, 240)}`;
    out.measures = [];
    log('error', out.error);
    await shot(A, `${id}-error`);
  } finally {
    if (deck) {
      try {
        await B?.close().catch(() => undefined);
        await ctxB?.close().catch(() => undefined);
        out.teardown = await teardown(A, deck.id);
      } catch (error) {
        out.teardown = { error: String(error).slice(0, 200) };
      }
      log('teardown', JSON.stringify(out.teardown));
    }
    out.requests = strip(records);
    out.endedAt = new Date().toISOString();
    await api.dispose().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
  return out;
}

/** The function request counts of a window, the fields judgeRow reads. */
function windowCounts(window) {
  return {
    minutes: window.minutes,
    functionRequests: window.functionRequests,
    functionPerMinute: window.functionPerMinute,
    polls: window.polls,
    failedRequests: window.failedRequests,
  };
}

// ---------------------------------------------------------------------------------------------
// --all: one child per row, merged

function runAll() {
  const wanted = arg('rows', null);
  const ids = costRows()
    .map((r) => r.id)
    .filter((id) => !wanted || wanted.split(',').some((x) => x.trim() === id));
  const outPath = resolve(OUT);
  const dir = join(dirname(outPath), 'cost-probe');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const startedAt = new Date().toISOString();
  for (const id of ids) {
    const json = join(dir, `${id}.json`);
    const args = [SELF, '--base', BASE, '--row', id, '--out', json, '--minutes', String(MINUTES)];
    if (SHOTS) args.push('--shots', SHOTS);
    if (arg('idle-minutes', null) !== null) args.push('--idle-minutes', String(IDLE_MINUTES));
    if (TIER_ARG !== null) args.push('--tier', TIER_ARG);
    console.log(
      `sync-cost-probe: node ${args.map((a) => (a === SELF ? 'scripts/probes/sync-cost-probe.mjs' : a)).join(' ')}${arg('redis-url', null) !== null ? ' --redis-url <set>' : ''}`,
    );
    /* the Redis URL rides to the child after the line above was printed; never printed itself */
    if (arg('redis-url', null) !== null) args.push('--redis-url', arg('redis-url', null));
    const run = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
    if (existsSync(json)) {
      const parsed = JSON.parse(readFileSync(json, 'utf8'));
      rows.push({
        id,
        result: parsed.result,
        reason: parsed.reason ?? '',
        measures: parsed.measures ?? [],
        counts: parsed.counts ?? null,
        ceilings: parsed.ceilings ?? null,
        where: parsed.where ?? null,
        instances: parsed.storeCalls?.instances ?? [],
        settle: parsed.phases?.settle
          ? {
              settled: parsed.phases.settle.settled,
              ms: parsed.phases.settle.ms,
              samples: parsed.phases.settle.samples?.length ?? 0,
            }
          : null,
        tier: parsed.tier ?? null,
        deck: parsed.deck?.id ?? null,
        teardown: parsed.teardown ?? null,
        json,
        exit: run.status,
      });
    } else {
      rows.push({
        id,
        result: 'failed',
        reason: `the cost probe wrote no JSON for ${id} (exit ${run.status})`,
        measures: [],
        json: null,
        exit: run.status,
      });
    }
  }
  const instances = [...new Set(rows.flatMap((r) => r.instances ?? []))];
  const exitCode = rows.some((r) => r.result === 'failed') ? 1 : 0;
  const summary = {
    base: BASE,
    startedAt,
    endedAt: new Date().toISOString(),
    minutes: MINUTES,
    idleMinutes: IDLE_MINUTES,
    tier: TIER_ARG ?? rows.find((r) => r.tier)?.tier ?? null,
    instances,
    rows,
    exitCode,
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(
    `sync-cost-probe: ${rows.length} row(s): ${rows.filter((r) => r.result === 'passed').length} passed, ${rows.filter((r) => r.result === 'failed').length} failed, ${rows.filter((r) => r.result === 'not driven').length} not driven; instances ${instances.length}; ${outPath}; exit ${exitCode}`,
  );
  for (const r of rows) console.log(`  ${r.id}: ${r.result}${r.reason ? ` (${r.reason})` : ''}`);
  return exitCode;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (
    !BASE ||
    !OUT ||
    (!ROW && !ALL) ||
    !Number.isFinite(MINUTES) ||
    MINUTES <= 0 ||
    !Number.isFinite(IDLE_MINUTES) ||
    IDLE_MINUTES <= 0
  ) {
    console.error(USAGE);
    process.exit(2);
  }
  if (TIER_ARG !== null && !['redis', 'blob', 'memory'].includes(TIER_ARG)) {
    console.error(
      `sync-cost-probe: --tier takes redis, blob or memory, not ${JSON.stringify(TIER_ARG)}`,
    );
    process.exit(2);
  }
  if (ALL) {
    process.exit(runAll());
  } else {
    if (!CEILINGS[ROW]) {
      console.error(
        `sync-cost-probe: ${ROW} is not a cost probe row (${Object.keys(CEILINGS).join(', ')})`,
      );
      process.exit(2);
    }
    const out = await runRow(ROW);
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(resolve(OUT), JSON.stringify(out, null, 2));
    console.log(
      `sync-cost-probe: ${ROW} ${out.result}${out.reason ? ` (${out.reason})` : ''}; ${resolve(OUT)}`,
    );
    process.exit(out.result === 'failed' ? 1 : 0);
  }
}

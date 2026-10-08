#!/usr/bin/env node
// The hosting setup of the realtime round's Cloudflare phase (docs/CLOUDFLARE.md 3.6.1, 3.7,
// 3.8, 4.4 and section 6), as subcommands. The Vercel side sets variables on the General
// Translation team's project turboslide-gt with `vercel env add <NAME> <environment> [--sensitive]`
// and the value on stdin; the Worker side runs the workspace's wrangler from apps/realtime-worker
// with a secret's value on stdin, or talks to the Worker's control routes under the room bearer.
// Every value comes from a 600 file under ~/.config/turboslide/ and is printed nowhere: the output
// names variables, environments, hosts and deck ids, and the CLIs' own output is scrubbed of every
// value read before a line of it is shown. `--dry-run` prints what a subcommand would read, mint,
// set, remove, post or run and makes no call (no vercel, no wrangler, no network).
//
//   node scripts/hosting/realtime-env.mjs <subcommand> [--dry-run] [--scope <team>]
//     [--project <name>] [--cwd <linked root>] [--environments production,preview]
//     [--config-dir <dir>] [--admin-emails <a,b>] [--force] [--tier do] [--env preview]
//     [--local] [--host <worker host>] [--wrangler <path>] [--worker-dir <dir>] [--from-shared]
//
//   status          the expected names per environment (present or absent), the names that must
//                   never be set (REDIS_URL, DATABASE_URL, the Upstash pair; CLOUDFLARE.md 4.4), the
//                   600 files and their keys, the tree's tier expectation; sets nothing
//   do              section 6 step 14: reads /health on each environment's Worker, then sets
//                   TURBOSLIDE_ROOM_HOST (plain, from cloudflare.env) and the environment's own
//                   TURBOSLIDE_ROOM_SECRET, TURBOSLIDE_ROOM_BEARER and TURBOSLIDE_DB_BEARER
//                   (sensitive, from room.env) on production and preview. On production a value
//                   that is not the shared pair, and the database bearer, wait for a Worker whose
//                   /health names a database bearer (docs/hosting.md 13.8)
//   mint            AUTH-3: mints the three secrets of each --environments environment into
//                   room.env (<NAME>_PRODUCTION, <NAME>_PREVIEW) with `openssl rand -hex 32` when
//                   absent; never replaces a key
//   database        4.4 step 2: requires the host and the bearer on each environment (run `do`
//                   first); mints BETTER_AUTH_SECRET per environment into better-auth.env with
//                   `openssl rand -hex 32` when absent; sets TURBOSLIDE_ACCOUNTS=d1 (plain) and
//                   BETTER_AUTH_SECRET (sensitive)
//   google          4.4 step 4: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from google-oauth.env, and
//                   TURBOSLIDE_ADMIN_EMAILS, on every environment; requires TURBOSLIDE_ACCOUNTS
//   mail            4.4 step 5: with mail.env (RESEND_API_KEY, TURBOSLIDE_MAIL_FROM) sets both, removes
//                   the forced TURBOSLIDE_MAIL on production and sets TURBOSLIDE_MAIL=capture on
//                   preview; without the file TURBOSLIDE_MAIL stays off (REALTIME.md 7.7)
//   flip --tier do  3.7 item 4: requires the three room variables on each environment, removes the
//                   forced TURBOSLIDE_REALTIME row (so TURBOSLIDE_ROOM_HOST selects do, select.ts;
//                   REALTIME.md default 7.9) and writes scripts/hosting/production.json to do.
//                   `--tier redis` is refused: the redis tier stays in the tree and is never
//                   deployed (CLOUDFLARE.md 5.1)
//   rollback        3.8 item 2: sets TURBOSLIDE_REALTIME=blob (--force) and writes the expectation to
//                   blob; run `drain` first so no acknowledged entry is left in an object
//   drain           3.8 item 2: GET /control/open on the Worker and POST /rooms/<id>/flush per deck
//   do-flag on|off  3.8 item 1: POST /control/flags { realtime } on the Worker, then reads it back
//   worker-migrate  3.6.2: `wrangler d1 migrations apply <database> --remote` (--local for a
//                   checkout's wrangler dev; --env preview for the preview database)
//   worker-secrets  3.6.2 and section 6 step 11: pipes the environment's TURBOSLIDE_ROOM_SECRET,
//                   TURBOSLIDE_ROOM_BEARER and TURBOSLIDE_DB_BEARER from room.env into `wrangler
//                   secret put <NAME>` one at a time (--env preview for the preview Worker, which also
//                   takes VERCEL_AUTOMATION_BYPASS_SECRET from vercel-bypass.env when the file
//                   exists). `--from-shared` (production, docs/hosting.md 13.8 phase 2) first puts
//                   the shared pair as the three <NAME>_PREVIOUS secrets the Worker keeps taking
//   worker-settle   13.8 phase 4: `wrangler secret delete` of the three <NAME>_PREVIOUS secrets
//   worker-rollback 13.8 step 3's way back on production: the shared pair put back as the current
//                   ticket secret and room bearer, then TURBOSLIDE_DB_BEARER and the three
//                   <NAME>_PREVIOUS secrets deleted (a name the Worker lacks is said and passed)
//   app-partner     13.8 phase 1: TURBOSLIDE_ROOM_BEARER_PREVIOUS on the Vercel environments, the
//                   coming room bearer the app accepts from the objects before the Worker sends it
//   app-settle      13.8 phase 3: removes TURBOSLIDE_ROOM_BEARER_PREVIOUS from the environments
//
// AUTH-3: each environment holds its own three values (room.env's <NAME>_PRODUCTION and
// <NAME>_PREVIEW keys). Production falls back to the shared pair of before (the unsuffixed
// TURBOSLIDE_ROOM_SECRET and TURBOSLIDE_ROOM_BEARER, the values it holds until its rotation);
// the preview never does. Every subcommand that sends a preview value refuses (exit 2) when one
// equals a production value, the shared pair included, and every one that sends an environment's
// values refuses when its database bearer equals its room bearer or ticket secret. `status`
// compares the two environments' values by SHA-256 in memory and prints `distinct` or `shared`.
//
// Rules. The Vercel subcommands run from a root whose linked project (.vercel/project.json) is
// `--project` (turboslide-gt by default), else a real run refuses; a dry run says so and goes on.
// A 600 file is read only when its mode lets nobody else read it ((mode & 0o077) is zero); a
// looser mode is refused with the chmod to run. A variable already present on an environment is
// skipped unless `--force` (rotation is docs/security.md section 12's runbook). The Worker
// subcommands use the workspace's wrangler (apps/realtime-worker/node_modules/.bin/wrangler, or
// `--wrangler`) with CLOUDFLARE_ACCOUNT_ID from cloudflare.env in the child's environment; a remote
// wrangler command is the integrator's (preview) and the ship step's (production) by the round's
// rules. Exit 0 when done or nothing to do, 1 when a precondition is absent (a step named in the
// output), 2 on usage or a refusal. Node only; no dependency. Tested by realtime-env.test.mjs
// against a fake `vercel` on PATH, a fake wrangler and a fake fetch.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** The repository root of this script's tree: the expectation file is written there. */
export const ROOT = resolve(here, '..', '..');
/** The tree's expectation of production's realtime tier, read by the guard before a production deploy. */
export const EXPECTATION_REL = 'scripts/hosting/production.json';
/** The Worker app the wrangler commands run from (docs/CLOUDFLARE.md 3.6.2). */
export const WORKER_DIR_REL = 'apps/realtime-worker';

export const SUBCOMMANDS = Object.freeze([
  'status',
  'do',
  'database',
  'google',
  'mail',
  'flip',
  'rollback',
  'drain',
  'do-flag',
  'worker-migrate',
  'worker-secrets',
  'worker-settle',
  'worker-rollback',
  'mint',
  'app-partner',
  'app-settle',
]);
/** The subcommands that touch the Vercel project and need the linked root. */
export const VERCEL_SUBCOMMANDS = Object.freeze([
  'status',
  'do',
  'database',
  'google',
  'mail',
  'flip',
  'rollback',
  'app-partner',
  'app-settle',
]);
/** Subcommands of the first realtime round that this phase retired, with the reason the output gives. */
export const RETIRED = Object.freeze({
  redis:
    'the redis tier stays in the tree and is never deployed (docs/CLOUDFLARE.md 5.1); REDIS_URL and the Upstash pair are never set on either project (4.4). The channel is the Worker: run `do`, then `database`, then `flip --tier do`',
});
export const ENVIRONMENTS = Object.freeze(['production', 'preview']);
/** The realtime tiers the expectation file may name (packages/realtime/src/channel.ts REALTIME_TIERS less memory). */
export const TIERS = Object.freeze(['blob', 'redis', 'do']);
export const DEFAULT_PROJECT = 'turboslide-gt';
export const DEFAULT_SCOPE = 'general-translation';
export const DEFAULT_ADMIN_EMAILS = 'kevin@generaltranslation.com';
export const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'turboslide');
/** The Worker hosts when cloudflare.env does not name them (docs/CLOUDFLARE.md 3.1; the account's subdomain). */
export const DEFAULT_ROOM_HOSTS = Object.freeze({
  production: 'turboslide-realtime.kk23907751.workers.dev',
  preview: 'turboslide-realtime-preview.kk23907751.workers.dev',
});
/** The D1 database names (docs/CLOUDFLARE.md 3.6.2, section 6 step 9). */
export const DEFAULT_DATABASES = Object.freeze({
  production: 'turboslide-accounts',
  preview: 'turboslide-accounts-preview',
});

/**
 * The files under the config folder and the keys each may carry. `public` marks a file whose
 * values are account facts and not secrets (the Cloudflare account id, the hosts, the D1 ids);
 * they are still printed only where the output names a host or a database.
 */
export const FILES = Object.freeze({
  google: {
    name: 'google-oauth.env',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TURBOSLIDE_ADMIN_EMAILS'],
  },
  mail: { name: 'mail.env', keys: ['RESEND_API_KEY', 'TURBOSLIDE_MAIL_FROM'] },
  auth: {
    name: 'better-auth.env',
    keys: ['BETTER_AUTH_SECRET_PRODUCTION', 'BETTER_AUTH_SECRET_PREVIEW'],
  },
  room: {
    name: 'room.env',
    keys: [
      'TURBOSLIDE_ROOM_SECRET',
      'TURBOSLIDE_ROOM_BEARER',
      'TURBOSLIDE_ROOM_SECRET_PRODUCTION',
      'TURBOSLIDE_ROOM_BEARER_PRODUCTION',
      'TURBOSLIDE_DB_BEARER_PRODUCTION',
      'TURBOSLIDE_ROOM_SECRET_PREVIEW',
      'TURBOSLIDE_ROOM_BEARER_PREVIEW',
      'TURBOSLIDE_DB_BEARER_PREVIEW',
    ],
  },
  bypass: { name: 'vercel-bypass.env', keys: ['VERCEL_AUTOMATION_BYPASS_SECRET'] },
  cloudflare: {
    name: 'cloudflare.env',
    public: true,
    keys: [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_WORKERS_SUBDOMAIN',
      'D1_ACCOUNTS_NAME',
      'D1_ACCOUNTS_ID',
      'D1_ACCOUNTS_PREVIEW_NAME',
      'D1_ACCOUNTS_PREVIEW_ID',
      'TURBOSLIDE_ROOM_HOST',
      'TURBOSLIDE_ROOM_HOST_PREVIEW',
    ],
  },
});

/** The names `status` reports per environment, in the order of CLOUDFLARE.md 4.4 and section 6. */
export const EXPECTED_NAMES = Object.freeze([
  'TURBOSLIDE_ROOM_HOST',
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_BEARER',
  'TURBOSLIDE_DB_BEARER',
  'TURBOSLIDE_ROOM_BEARER_PREVIOUS',
  'TURBOSLIDE_ACCOUNTS',
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'TURBOSLIDE_ADMIN_EMAILS',
  'RESEND_API_KEY',
  'TURBOSLIDE_MAIL_FROM',
  'TURBOSLIDE_MAIL',
  'TURBOSLIDE_REALTIME',
]);
/** The names that must never be set on either project (CLOUDFLARE.md 4.4): `status` reports them apart. */
export const NEVER_NAMES = Object.freeze([
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'DATABASE_URL',
]);
/** The three variables the `do` tier needs on a Vercel environment (packages/realtime/src/select.ts; CLOUDFLARE.md 3.6.1). */
export const ROOM_NAMES = Object.freeze([
  'TURBOSLIDE_ROOM_HOST',
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_BEARER',
]);

/**
 * The three secrets each environment holds since AUTH-3: the ticket secret, the room bearer and
 * the database bearer of the Worker's `/db` routes.
 */
export const PAIR_NAMES = Object.freeze([
  'TURBOSLIDE_ROOM_SECRET',
  'TURBOSLIDE_ROOM_BEARER',
  'TURBOSLIDE_DB_BEARER',
]);
/** The shared pair of room.env before AUTH-3: both environments held it; production's until its rotation. */
export const SHARED_NAMES = Object.freeze(['TURBOSLIDE_ROOM_SECRET', 'TURBOSLIDE_ROOM_BEARER']);
/** The Worker secret a rotation adds beside each of the three, taken and never sent (docs/hosting.md 13.8). */
export const PREVIOUS_SUFFIX = '_PREVIOUS';
/** The app's rotation partner of the room bearer (packages/realtime/src/select.ts). */
export const APP_PARTNER_NAME = 'TURBOSLIDE_ROOM_BEARER_PREVIOUS';
/** The /health `db` answers of a Worker that holds a database bearer (apps/realtime-worker/src/index.ts). */
export const WORKER_DB_READY = Object.freeze(['own', 'rotating']);

const USAGE = `usage: node scripts/hosting/realtime-env.mjs <${SUBCOMMANDS.join('|')}> [on|off for do-flag] [--dry-run] [--scope <team>] [--project <name>] [--cwd <linked root>] [--environments production,preview] [--config-dir <dir>] [--admin-emails <a,b>] [--force] [--tier do] [--env preview] [--local] [--host <worker host>] [--wrangler <path>] [--worker-dir <dir>] [--from-shared]`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const out = {
    subcommand: null,
    flag: null,
    dryRun: false,
    scope: DEFAULT_SCOPE,
    project: DEFAULT_PROJECT,
    cwd: process.cwd(),
    environments: [...ENVIRONMENTS],
    configDir: DEFAULT_CONFIG_DIR,
    adminEmails: null,
    force: false,
    tier: null,
    env: 'production',
    local: false,
    host: null,
    wrangler: null,
    workerDir: null,
    fromShared: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${arg} wants a value\n${USAGE}`);
      return v;
    };
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--local') out.local = true;
    else if (arg === '--from-shared') out.fromShared = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--scope') out.scope = value();
    else if (arg === '--project') out.project = value();
    else if (arg === '--cwd') out.cwd = resolve(value());
    else if (arg === '--config-dir') out.configDir = resolve(value());
    else if (arg === '--admin-emails') out.adminEmails = value();
    else if (arg === '--host') out.host = value();
    else if (arg === '--wrangler') out.wrangler = resolve(value());
    else if (arg === '--worker-dir') out.workerDir = resolve(value());
    else if (arg === '--tier') {
      out.tier = value();
      if (!TIERS.includes(out.tier))
        throw new UsageError(`--tier takes one of ${TIERS.join(', ')}, not ${out.tier}`);
    } else if (arg === '--env') {
      out.env = value();
      if (!ENVIRONMENTS.includes(out.env))
        throw new UsageError(`--env takes ${ENVIRONMENTS.join(' or ')}, not ${out.env}`);
    } else if (arg === '--environments') {
      out.environments = value()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const e of out.environments)
        if (!ENVIRONMENTS.includes(e))
          throw new UsageError(`unknown environment ${e}; one of ${ENVIRONMENTS.join(', ')}`);
      if (out.environments.length === 0) throw new UsageError(`--environments wants a list`);
    } else if (arg.startsWith('-')) throw new UsageError(`unknown argument ${arg}\n${USAGE}`);
    else if (out.subcommand === null) {
      if (Object.hasOwn(RETIRED, arg))
        throw new UsageError(`the subcommand ${arg} is retired: ${RETIRED[arg]}`);
      if (!SUBCOMMANDS.includes(arg)) throw new UsageError(`unknown subcommand ${arg}\n${USAGE}`);
      out.subcommand = arg;
    } else if (out.subcommand === 'do-flag' && out.flag === null) {
      if (arg !== 'on' && arg !== 'off')
        throw new UsageError(`do-flag takes on or off, not ${arg}`);
      out.flag = arg;
    } else throw new UsageError(`one subcommand at a time\n${USAGE}`);
  }
  if (!out.help && out.subcommand === null) throw new UsageError(USAGE);
  if (out.subcommand === 'do-flag' && out.flag === null)
    throw new UsageError(`do-flag wants on or off\n${USAGE}`);
  if (out.fromShared && (out.subcommand !== 'worker-secrets' || out.env !== 'production'))
    throw new UsageError(
      '--from-shared belongs to worker-secrets on production: the shared pair was never the preview’s to keep',
    );
  return out;
}

// ---------------------------------------------------------------------------------------------
// the 600 files

/** `KEY=value` lines; `#` comments and blank lines skipped; one layer of quotes removed. */
export function parseEnvFile(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    )
      value = value.slice(1, -1);
    if (value !== '') out.set(m[1], value);
  }
  return out;
}

/** True when the mode lets neither the group nor others read the file (600 or stricter). */
export function isPrivateMode(mode) {
  return (mode & 0o077) === 0;
}

/**
 * Reads one config file: `{ path, exists, mode, private, keys, values }`. The values stay in the
 * map for the caller's stdin and are never written to the output; a file whose mode is not
 * private is reported with `private: false` and its values are not read.
 */
export function readSecretFile(path) {
  if (!existsSync(path))
    return { path, exists: false, mode: null, private: false, keys: [], values: new Map() };
  const mode = statSync(path).mode & 0o777;
  if (!isPrivateMode(mode))
    return { path, exists: true, mode, private: false, keys: [], values: new Map() };
  const values = parseEnvFile(readFileSync(path, 'utf8'));
  return { path, exists: true, mode, private: true, keys: [...values.keys()], values };
}

function octal(mode) {
  return mode === null ? 'absent' : mode.toString(8).padStart(3, '0');
}

/** The linked project name of a repository root, from .vercel/project.json; null when unlinked. */
export function linkedProject(cwd) {
  try {
    const j = JSON.parse(readFileSync(join(cwd, '.vercel', 'project.json'), 'utf8'));
    return typeof j.projectName === 'string' ? j.projectName : null;
  } catch {
    return null;
  }
}

/** The variable names of `vercel env ls <environment> --json`: the `key` of every row, no value. */
export function namesFromEnvLs(text) {
  const j = JSON.parse(text);
  const rows = Array.isArray(j) ? j : Array.isArray(j?.envs) ? j.envs : null;
  if (rows === null) throw new TypeError('vercel env ls --json answered no envs list');
  const names = new Set();
  for (const r of rows) if (r && typeof r.key === 'string') names.add(r.key);
  return names;
}

/** Replaces every secret value in a line with `<value>` and drops anything that reads as a token. */
export function scrub(text, values) {
  let out = String(text);
  for (const v of values)
    if (typeof v === 'string' && v.length >= 4) out = out.split(v).join('<value>');
  return out.replace(/eyJ[A-Za-z0-9_-]{20,}/g, '<jwt>');
}

/** The tree's expectation file: `{ realtime: 'blob' | 'redis' | 'do' }`; absent or unknown reads as blob. */
export function readExpectation(root = ROOT) {
  try {
    const j = JSON.parse(readFileSync(join(root, EXPECTATION_REL), 'utf8'));
    return TIERS.includes(j.realtime) ? j.realtime : 'blob';
  } catch {
    return 'blob';
  }
}

export function writeExpectation(realtime, root = ROOT) {
  if (!TIERS.includes(realtime)) throw new RangeError(`no tier ${realtime}`);
  const path = join(root, EXPECTATION_REL);
  const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const next = { ...current, realtime };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return path;
}

/** The Worker host for an environment: `--host`, else cloudflare.env's row, else the default. */
export function roomHostFor(environment, options, files) {
  if (options.host) return options.host;
  const key = environment === 'preview' ? 'TURBOSLIDE_ROOM_HOST_PREVIEW' : 'TURBOSLIDE_ROOM_HOST';
  return files.cloudflare.values.get(key) ?? DEFAULT_ROOM_HOSTS[environment];
}

/** The D1 database name for an environment: cloudflare.env's row, else the default. */
export function databaseFor(environment, files) {
  const key = environment === 'preview' ? 'D1_ACCOUNTS_PREVIEW_NAME' : 'D1_ACCOUNTS_NAME';
  return files.cloudflare.values.get(key) ?? DEFAULT_DATABASES[environment];
}

/** The room.env key of an environment's own value of one of the three secrets. */
export function roomKey(name, environment) {
  return `${name}_${environment.toUpperCase()}`;
}

/**
 * Where an environment's value of one of the three secrets comes from in room.env: its own key;
 * production alone falls back to the shared key of the room pair, the value it holds until its
 * rotation. Null when there is none.
 */
export function roomSource(name, environment, room) {
  const own = roomKey(name, environment);
  if (room.values.has(own)) return { file: 'room', key: own };
  if (environment === 'production' && SHARED_NAMES.includes(name) && room.values.has(name))
    return { file: 'room', key: name };
  return null;
}

/** True when the production source of a name is its own key and not the shared pair. */
const rotated = (source) => source !== null && source.key.endsWith('_PRODUCTION');

/**
 * The reasons an environment's values may not be sent (AUTH-3), compared in memory and named by
 * key, never by value: on the preview, a value equal to any production value (the shared pair
 * included); on production, a value equal to a preview value; in either, a database bearer equal
 * to the room bearer or the ticket secret, or a room bearer equal to the ticket secret.
 */
export function separationProblems(environment, room) {
  const problems = [];
  const value = (key) => room.values.get(key);
  const own = PAIR_NAMES.map((name) => roomSource(name, environment, room)).filter(Boolean);
  const productionKeys = [...SHARED_NAMES, ...PAIR_NAMES.map((n) => roomKey(n, 'production'))];
  const previewKeys = PAIR_NAMES.map((n) => roomKey(n, 'preview'));
  const others = environment === 'preview' ? productionKeys : previewKeys;
  for (const source of own) {
    const mine = value(source.key);
    for (const key of others)
      if (value(key) !== undefined && value(key) === mine)
        problems.push(
          environment === 'preview'
            ? `${source.key} equals the production value ${key}; the preview never takes a production value (mint --environments preview)`
            : `${source.key} equals the preview value ${key}; mint new production values`,
        );
  }
  const at = (name) => {
    const source = roomSource(name, environment, room);
    return source === null ? undefined : value(source.key);
  };
  const [secret, bearer, db] = PAIR_NAMES.map(at);
  if (db !== undefined && (db === bearer || db === secret))
    problems.push(
      `the ${environment} database bearer equals its room bearer or ticket secret; the database bearer is its own (AUTH-3)`,
    );
  if (bearer !== undefined && bearer === secret)
    problems.push(`the ${environment} room bearer equals its ticket secret`);
  return problems;
}

const digestOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Whether the two environments hold the same value of a name, by SHA-256 in memory: `distinct`,
 * `shared`, or `unknown` when room.env lacks one of the two. The preview without its own key is
 * read as holding the shared pair, which is what it held before AUTH-3.
 */
export function sharingOf(name, room) {
  const at = (environment) => {
    const source =
      roomSource(name, environment, room) ??
      (SHARED_NAMES.includes(name) && room.values.has(name) ? { key: name } : null);
    return source === null ? undefined : room.values.get(source.key);
  };
  const production = at('production');
  const preview = at('preview');
  if (production === undefined || preview === undefined) return 'unknown';
  return digestOf(production) === digestOf(preview) ? 'shared' : 'distinct';
}

// ---------------------------------------------------------------------------------------------
// the plan: one list of steps per subcommand, executed or printed

const step = (kind, fields) => ({ kind, ...fields });

/** True when room.env cannot give the environment its ticket secret and room bearer. */
const roomFileMissing = (room, environment = 'production') =>
  !room.exists ||
  !room.private ||
  roomSource('TURBOSLIDE_ROOM_SECRET', environment, room) === null ||
  roomSource('TURBOSLIDE_ROOM_BEARER', environment, room) === null;

const roomFileStop = (room, environment = 'production') =>
  step('stop', {
    exit: 1,
    text: `${FILES.room.name} ${room.exists ? (room.private ? `lacks the ${environment} TURBOSLIDE_ROOM_SECRET or TURBOSLIDE_ROOM_BEARER` : `has mode ${octal(room.mode)}; chmod 600 it`) : 'is absent'}: \`realtime-env.mjs mint --environments ${environment}\` writes the environment's own values (docs/hosting.md 13.8)`,
  });

/** The refusal of an environment's values that break the separation of AUTH-3, or null. */
const separationStop = (environment, room) => {
  const problems = separationProblems(environment, room);
  return problems.length === 0
    ? null
    : step('stop', { exit: 2, text: `refused: ${problems.join('; ')}` });
};

/**
 * The steps of a subcommand. `files` is `{ google, mail, auth, room, bypass, cloudflare }` as
 * `readSecretFile` returns them. Step kinds: `report` (names per environment), `never` (the names
 * that must be absent), `require` (names that must be present, else stop with exit 1), `mint` (a
 * key into better-auth.env), `add` (vercel env add; `source` names the file and key or the
 * literal's name, never the value; `when: 'absent'` skips a present variable unless `force`;
 * `plain` omits --sensitive), `rm` (vercel env rm when present), `expect` (the expectation file),
 * `health` (GET /health on a Worker host), `flush` (the drain), `flag` (POST then GET
 * /control/flags), `wrangler` (one wrangler command, a secret's value on stdin when `source`),
 * `note` (a sentence), `stop` (end with an exit code).
 */
export function planFor(sub, options, files) {
  const envs = options.environments;
  const steps = [];
  const google = files.google;
  const mail = files.mail;
  const auth = files.auth;
  const room = files.room;
  switch (sub) {
    case 'status': {
      for (const e of envs)
        steps.push(step('report', { environment: e, names: [...EXPECTED_NAMES] }));
      for (const e of envs) steps.push(step('never', { environment: e, names: [...NEVER_NAMES] }));
      for (const [key, spec] of Object.entries(FILES)) {
        const f = files[key];
        steps.push(
          step('note', {
            text: `${spec.name}: ${f.exists ? `mode ${octal(f.mode)}${f.private ? '' : ' (not private; chmod 600 and run again)'}, keys ${f.keys.length ? f.keys.join(', ') : 'none'}` : 'absent'}`,
          }),
        );
      }
      steps.push(
        step('note', {
          text: `${EXPECTATION_REL}: realtime ${readExpectation(options.root ?? ROOT)}`,
        }),
      );
      // AUTH-3: the two environments' values compared by digest in memory, never printed
      for (const name of PAIR_NAMES)
        steps.push(
          step('note', { text: `${name}: production and preview ${sharingOf(name, room)}` }),
        );
      for (const e of ENVIRONMENTS)
        for (const problem of separationProblems(e, room))
          steps.push(step('note', { text: `${e}: ${problem}` }));
      break;
    }
    case 'do': {
      const missing = envs.find((e) => roomFileMissing(room, e));
      if (missing !== undefined) {
        steps.push(roomFileStop(room, missing));
        break;
      }
      const refused = envs.map((e) => separationStop(e, room)).find(Boolean);
      if (refused !== undefined) {
        steps.push(refused);
        break;
      }
      for (const e of envs)
        steps.push(
          step('health', {
            environment: e,
            host: roomHostFor(e, options, files),
            reason:
              'the Worker answers /health before any Vercel variable names it (docs/CLOUDFLARE.md 3.8 last row, section 6 step 14); deploy it and run worker-migrate first',
          }),
        );
      for (const e of envs) {
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_ROOM_HOST',
            environment: e,
            plain: true,
            source: {
              file: 'cloudflare',
              key: e === 'preview' ? 'TURBOSLIDE_ROOM_HOST_PREVIEW' : 'TURBOSLIDE_ROOM_HOST',
              fallback: roomHostFor(e, options, files),
            },
            when: 'absent',
          }),
        );
        for (const name of PAIR_NAMES) {
          const source = roomSource(name, e, room);
          if (source === null) {
            steps.push(
              step('note', {
                text: `${name} ${e}: room.env has no ${roomKey(name, e)}, so nothing is set (mint --environments ${e}); the Worker keeps taking the room bearer on /db`,
              }),
            );
            continue;
          }
          steps.push(
            step('add', {
              name,
              environment: e,
              source,
              when: 'absent',
              // production switches off the shared pair, or gains the database bearer, only once
              // its Worker takes the new values (13.8 phase 2 before phase 3)
              ...(e === 'production' && (rotated(source) || name === 'TURBOSLIDE_DB_BEARER')
                ? { gate: 'worker-db' }
                : {}),
            }),
          );
        }
      }
      steps.push(
        step('note', {
          text: 'a Vercel variable reaches a deployment at its next build; the guard’s next push deploys it (docs/hosting.md 13.8)',
        }),
      );
      break;
    }
    case 'database': {
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['TURBOSLIDE_ROOM_HOST', 'TURBOSLIDE_ROOM_BEARER'],
            reason:
              'the d1 accounts kind reaches the database through the Worker under TURBOSLIDE_DB_BEARER, or the room bearer before the database bearer is set (docs/CLOUDFLARE.md 4.2, auth/db.ts, AUTH-3); run `do` first (section 6 step 14)',
          }),
        );
      for (const e of envs) {
        const key = `BETTER_AUTH_SECRET_${e.toUpperCase()}`;
        steps.push(
          step('mint', { file: 'auth', key, when: auth.values.has(key) ? 'present' : 'absent' }),
        );
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_ACCOUNTS',
            environment: e,
            plain: true,
            source: { literal: 'd1', label: 'the literal d1' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'BETTER_AUTH_SECRET',
            environment: e,
            source: { file: 'auth', key },
            when: 'absent',
          }),
        );
      }
      steps.push(
        step('note', {
          text: 'DATABASE_URL is never set (docs/CLOUDFLARE.md 4.4 step 2): the accounts are D1 rows behind the Worker, one database for every instance',
        }),
      );
      break;
    }
    case 'google': {
      if (
        !google.exists ||
        !google.private ||
        !google.values.has('GOOGLE_CLIENT_ID') ||
        !google.values.has('GOOGLE_CLIENT_SECRET')
      ) {
        steps.push(
          step('stop', {
            exit: 1,
            text: `${FILES.google.name} ${google.exists ? (google.private ? 'lacks GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' : `has mode ${octal(google.mode)}; chmod 600 it`) : 'is absent'}: the Google Cloud project Turboslide and the Web application client Turboslide web are Kevin's console steps or the orchestrator's in his session (docs/CLOUDFLARE.md section 6 step 13); the two values go into the file (design-google-login.md section 8 line 6)`,
          }),
        );
        break;
      }
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['TURBOSLIDE_ACCOUNTS'],
            reason:
              'the Google button needs a database (better-auth.ts signInMethods, databaseConfigured under the d1 kind); run `database` first (docs/CLOUDFLARE.md 4.4 step 2)',
          }),
        );
      const adminEmails =
        options.adminEmails ?? google.values.get('TURBOSLIDE_ADMIN_EMAILS') ?? DEFAULT_ADMIN_EMAILS;
      for (const e of envs) {
        steps.push(
          step('add', {
            name: 'GOOGLE_CLIENT_ID',
            environment: e,
            source: { file: 'google', key: 'GOOGLE_CLIENT_ID' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'GOOGLE_CLIENT_SECRET',
            environment: e,
            source: { file: 'google', key: 'GOOGLE_CLIENT_SECRET' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_ADMIN_EMAILS',
            environment: e,
            source: {
              literal: adminEmails,
              label: options.adminEmails
                ? '--admin-emails'
                : google.values.has('TURBOSLIDE_ADMIN_EMAILS')
                  ? `${FILES.google.name} TURBOSLIDE_ADMIN_EMAILS`
                  : 'the default of CLOUDFLARE.md 4.4 step 4',
            },
            when: 'absent',
          }),
        );
      }
      break;
    }
    case 'mail': {
      if (!mail.exists) {
        steps.push(
          step('note', {
            text: `${FILES.mail.name} is absent: TURBOSLIDE_MAIL stays off and Google may be the only method (docs/CLOUDFLARE.md 4.4 step 5, REALTIME.md default 7.7); nothing set`,
          }),
        );
        break;
      }
      if (
        !mail.private ||
        !mail.values.has('RESEND_API_KEY') ||
        !mail.values.has('TURBOSLIDE_MAIL_FROM')
      ) {
        steps.push(
          step('stop', {
            exit: 1,
            text: `${FILES.mail.name} ${mail.private ? 'lacks RESEND_API_KEY or TURBOSLIDE_MAIL_FROM' : `has mode ${octal(mail.mode)}; chmod 600 it`}: Kevin provides Resend's key and a sending address on turboslide.com (REALTIME.md 4.5 step 5)`,
          }),
        );
        break;
      }
      for (const e of envs) {
        steps.push(
          step('add', {
            name: 'RESEND_API_KEY',
            environment: e,
            source: { file: 'mail', key: 'RESEND_API_KEY' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_MAIL_FROM',
            environment: e,
            source: { file: 'mail', key: 'TURBOSLIDE_MAIL_FROM' },
            when: 'absent',
          }),
        );
        if (e === 'production')
          steps.push(
            step('rm', {
              name: 'TURBOSLIDE_MAIL',
              environment: e,
              reason:
                'with no forced value the Resend pair selects resend (auth/mail/mailer.ts selectMail)',
            }),
          );
        else
          steps.push(
            step('add', {
              name: 'TURBOSLIDE_MAIL',
              environment: e,
              source: { literal: 'capture', label: 'the literal capture' },
              when: 'always',
              force: true,
              reason:
                'a preview writes outgoing mail to the capture list (docs/hosting.md section 11)',
            }),
          );
      }
      break;
    }
    case 'flip': {
      const tier = options.tier ?? 'do';
      if (tier === 'redis') {
        steps.push(
          step('stop', { exit: 2, text: `flip --tier redis is refused: ${RETIRED.redis}` }),
        );
        break;
      }
      if (tier === 'blob') {
        steps.push(
          step('stop', {
            exit: 2,
            text: 'flip --tier blob is not a flip: `rollback` sets the forced blob row and writes the expectation (docs/CLOUDFLARE.md 3.8 item 2)',
          }),
        );
        break;
      }
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: [...ROOM_NAMES],
            reason:
              'a removal without the host, the ticket secret and the bearer would select blob on its own and the tree would expect do (docs/CLOUDFLARE.md 3.6.1 select.ts, 3.7 item 4); run `do` first',
          }),
        );
      for (const e of envs)
        steps.push(
          step('rm', {
            name: 'TURBOSLIDE_REALTIME',
            environment: e,
            reason:
              'TURBOSLIDE_ROOM_HOST then selects do at the next deploy (select.ts; REALTIME.md default 7.9: the removal, never a forced do)',
          }),
        );
      steps.push(step('expect', { realtime: 'do' }));
      steps.push(
        step('note', {
          text: `commit ${EXPECTATION_REL} with the push that follows; the guard deploys the Worker before the app on that push and reads /health for the sha (docs/CLOUDFLARE.md 5.6); the next production deployment selects do and every open tab resyncs once (3.7 item 5); the rollback is \`drain\` then \`rollback\` (3.8 item 2), or \`do-flag off\` with no deploy (3.8 item 1)`,
        }),
      );
      break;
    }
    case 'rollback': {
      for (const e of envs)
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_REALTIME',
            environment: e,
            source: { literal: 'blob', label: 'the literal blob' },
            when: 'always',
            force: true,
            reason: 'the rollback switch of docs/CLOUDFLARE.md 3.8 item 2',
          }),
        );
      steps.push(step('expect', { realtime: 'blob' }));
      steps.push(
        step('note', {
          text: `run \`drain\` before this when production was on do, so no acknowledged entry is left in an object's SQLite with no committer (3.8 item 2); then redeploy (the guard's next pass, or \`vercel rollback --scope ${options.scope} --yes\` to the previous production deployment) and commit ${EXPECTATION_REL}; the Worker stays deployed and the tabs reload onto the blob deployment at the object's next checkpoint; the runtime switch without a deploy is \`do-flag off\` (3.8 item 1)`,
        }),
      );
      break;
    }
    case 'drain': {
      if (roomFileMissing(room, options.env)) {
        steps.push(roomFileStop(room, options.env));
        break;
      }
      steps.push(
        step('flush', {
          environment: options.env,
          host: roomHostFor(options.env, options, files),
        }),
      );
      break;
    }
    case 'do-flag': {
      if (roomFileMissing(room, options.env)) {
        steps.push(roomFileStop(room, options.env));
        break;
      }
      steps.push(
        step('flag', {
          environment: options.env,
          host: roomHostFor(options.env, options, files),
          realtime: options.flag,
        }),
      );
      break;
    }
    case 'worker-migrate': {
      const database = databaseFor(options.env, files);
      const args = ['d1', 'migrations', 'apply', database, options.local ? '--local' : '--remote'];
      if (options.env === 'preview') args.push('--env', 'preview');
      steps.push(
        step('wrangler', {
          args,
          label: `the control tables rt_open and rt_flags and the realtime = on row from apps/realtime-worker/migrations/ (docs/CLOUDFLARE.md 3.6.2) on ${options.local ? `the local D1 of wrangler dev` : `the remote database ${database}`}`,
        }),
      );
      if (!options.local)
        steps.push(
          step('note', {
            text: `a remote migration is the integrator's for the preview and the ship step's for production (the round's rules); /health answers realtime: 'on' once the row exists`,
          }),
        );
      break;
    }
    case 'worker-secrets': {
      const e = options.env;
      if (roomFileMissing(room, e)) {
        steps.push(roomFileStop(room, e));
        break;
      }
      const refused = separationStop(e, room);
      if (refused !== null) {
        steps.push(refused);
        break;
      }
      const envArgs = e === 'preview' ? ['--env', 'preview'] : [];
      const put = (name, source, label) =>
        step('wrangler', { args: ['secret', 'put', name, ...envArgs], source, label });
      if (options.fromShared) {
        // 13.8 phase 2: the Worker keeps taking the shared pair (the ticket secret, the room
        // bearer, and the room bearer on /db, which is what the app sends there today) while it
        // switches to production's own values; the previous names go first, so no moment takes
        // neither
        const own = PAIR_NAMES.map((name) => roomSource(name, e, room));
        if (!own.every(rotated) || !SHARED_NAMES.every((name) => room.values.has(name))) {
          steps.push(
            step('stop', {
              exit: 1,
              text: `--from-shared needs the shared pair and the three production keys in room.env (${PAIR_NAMES.map((n) => roomKey(n, e)).join(', ')}): run \`mint --environments production\` first`,
            }),
          );
          break;
        }
        steps.push(
          put(
            `TURBOSLIDE_ROOM_SECRET${PREVIOUS_SUFFIX}`,
            { file: 'room', key: 'TURBOSLIDE_ROOM_SECRET' },
            'the shared ticket secret as the previous one (tickets the app mints before it switches)',
          ),
          put(
            `TURBOSLIDE_ROOM_BEARER${PREVIOUS_SUFFIX}`,
            { file: 'room', key: 'TURBOSLIDE_ROOM_BEARER' },
            'the shared room bearer as the previous one (the app’s room calls before it switches)',
          ),
          put(
            `TURBOSLIDE_DB_BEARER${PREVIOUS_SUFFIX}`,
            { file: 'room', key: 'TURBOSLIDE_ROOM_BEARER' },
            'the shared room bearer as the previous database bearer (the app’s /db calls before it switches)',
          ),
        );
      }
      // the database bearer before the room pair: on production the bearer the objects send
      // changes last
      for (const name of [
        'TURBOSLIDE_DB_BEARER',
        'TURBOSLIDE_ROOM_SECRET',
        'TURBOSLIDE_ROOM_BEARER',
      ]) {
        const source = roomSource(name, e, room);
        if (source === null) {
          steps.push(
            step('note', {
              text: `${name}: room.env has no ${roomKey(name, e)}; the ${e} Worker keeps ${name === 'TURBOSLIDE_DB_BEARER' ? 'taking the room bearer on /db' : 'its value'} (mint --environments ${e})`,
            }),
          );
          continue;
        }
        steps.push(
          put(name, source, `${name} on the ${e} Worker (the value on stdin, from ${source.key})`),
        );
      }
      if (e === 'preview') {
        const bypass = files.bypass;
        if (bypass.exists && bypass.private && bypass.values.has('VERCEL_AUTOMATION_BYPASS_SECRET'))
          steps.push(
            step('wrangler', {
              args: ['secret', 'put', 'VERCEL_AUTOMATION_BYPASS_SECRET', ...envArgs],
              source: { file: 'bypass', key: 'VERCEL_AUTOMATION_BYPASS_SECRET' },
              label:
                'VERCEL_AUTOMATION_BYPASS_SECRET on the preview Worker (the value on stdin; the object’s callbacks to a protected preview, docs/CLOUDFLARE.md section 6 step 15)',
            }),
          );
        else
          steps.push(
            step('note', {
              text: `${FILES.bypass.name} ${bypass.exists ? (bypass.private ? 'lacks VERCEL_AUTOMATION_BYPASS_SECRET' : `has mode ${octal(bypass.mode)}; chmod 600 it`) : 'is absent'}: the preview Worker gets no VERCEL_AUTOMATION_BYPASS_SECRET, so the object cannot call a protected Vercel preview back and the hosted realtime rows are read on the local two process run and on production (docs/CLOUDFLARE.md 5.5 item 2; the project setting is Kevin's, section 6 step 15)`,
            }),
          );
      }
      steps.push(
        step('note', {
          text: 'each `wrangler secret put` creates and deploys a new version of the Worker at once (the wrangler skill); the Vercel environment takes the same three values with `do` (docs/hosting.md 13.8)',
        }),
      );
      break;
    }
    case 'worker-rollback': {
      if (options.env !== 'production' || !SHARED_NAMES.every((name) => room.values.has(name))) {
        steps.push(
          step('stop', {
            exit: 2,
            text: 'worker-rollback puts the shared pair back on the production Worker; it needs room.env’s TURBOSLIDE_ROOM_SECRET and TURBOSLIDE_ROOM_BEARER and runs on production alone (docs/hosting.md 13.8 step 3)',
          }),
        );
        break;
      }
      for (const name of SHARED_NAMES)
        steps.push(
          step('wrangler', {
            args: ['secret', 'put', name],
            source: { file: 'room', key: name },
            label: `${name} back to the shared value on the production Worker (the value on stdin)`,
          }),
        );
      for (const name of [
        'TURBOSLIDE_DB_BEARER',
        ...PAIR_NAMES.map((n) => `${n}${PREVIOUS_SUFFIX}`),
      ])
        steps.push(
          step('wrangler', {
            args: ['secret', 'delete', name],
            label: `${name} deleted from the production Worker`,
            tolerate: true,
          }),
        );
      steps.push(
        step('note', {
          text: '/health answers db: fallback again: /db takes the shared room bearer, as before step 3; valid while the production app sends the shared pair (before step 4’s deploy)',
        }),
      );
      break;
    }
    case 'worker-settle': {
      const envArgs = options.env === 'preview' ? ['--env', 'preview'] : [];
      for (const name of PAIR_NAMES)
        steps.push(
          step('wrangler', {
            args: ['secret', 'delete', `${name}${PREVIOUS_SUFFIX}`, ...envArgs],
            label: `${name}${PREVIOUS_SUFFIX} deleted from the ${options.env} Worker: the rotation's window closes (docs/hosting.md 13.8 phase 4)`,
          }),
        );
      steps.push(
        step('note', {
          text: '/health answers db: own once the Worker version without the previous names serves; a Worker that never held one answers the delete with an error, which reads exit 2',
        }),
      );
      break;
    }
    case 'mint': {
      if (room.exists && !room.private) {
        steps.push(roomFileStop(room, envs[0]));
        break;
      }
      for (const e of envs)
        for (const name of PAIR_NAMES) {
          const key = roomKey(name, e);
          steps.push(
            step('mint', { file: 'room', key, when: room.values.has(key) ? 'present' : 'absent' }),
          );
        }
      steps.push(
        step('note', {
          text: 'a minted value reaches nothing until `worker-secrets` and `do` send it, in the order of docs/hosting.md 13.8',
        }),
      );
      break;
    }
    case 'app-partner': {
      for (const e of envs) {
        const source = roomSource('TURBOSLIDE_ROOM_BEARER', e, room);
        if (source === null || (e === 'production' && !rotated(source))) {
          steps.push(
            step('stop', {
              exit: 1,
              text: `app-partner needs the coming ${e} room bearer ${roomKey('TURBOSLIDE_ROOM_BEARER', e)} in room.env: run \`mint --environments ${e}\` first`,
            }),
          );
          return steps;
        }
        const refused = separationStop(e, room);
        if (refused !== null) {
          steps.push(refused);
          return steps;
        }
        steps.push(
          step('add', {
            name: APP_PARTNER_NAME,
            environment: e,
            source,
            when: 'always',
            force: true,
            reason:
              'the coming room bearer the app accepts from the objects before the Worker sends it (docs/hosting.md 13.8 phase 1)',
          }),
        );
      }
      break;
    }
    case 'app-settle': {
      for (const e of envs)
        steps.push(
          step('rm', {
            name: APP_PARTNER_NAME,
            environment: e,
            reason:
              'the room bearer’s rotation is over on the app side (docs/hosting.md 13.8 phase 3)',
          }),
        );
      break;
    }
    default:
      throw new UsageError(USAGE);
  }
  return steps;
}

// ---------------------------------------------------------------------------------------------
// running the plan

function describeAdd(s, dry) {
  const src = s.source.file
    ? `value from ${FILES[s.source.file].name} ${s.source.key}${s.source.fallback !== undefined ? ' or its default' : ''} on stdin`
    : `value ${s.source.label}`;
  const guard =
    s.when === 'absent' ? (dry ? ' when absent on the environment; --force replaces' : '') : '';
  return `${s.name} ${s.environment} (${s.plain ? 'plain' : 'sensitive'}, ${src})${guard}`;
}

const lastLine = (text) =>
  String(text ?? '')
    .trim()
    .split('\n')
    .pop() ?? '';

/** The deck ids of GET /control/open's answer: an array of ids or of `{ deckId | id }`, or an object with `decks` or `open`. */
export function openDecksOf(body) {
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.decks)
      ? body.decks
      : Array.isArray(body?.open)
        ? body.open
        : null;
  if (list === null) throw new TypeError('/control/open answered no list of decks');
  const ids = [];
  for (const d of list) {
    const id = typeof d === 'string' ? d : (d?.deckId ?? d?.id);
    if (typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(id)) ids.push(id);
  }
  return ids;
}

/**
 * Runs or prints the steps. `io` carries `out(line)`, `vercel(args, input)` and `wrangler(args,
 * input)` (spawnSync's result shape: `{ status, stdout, stderr }`), `fetch(url, init)` (an
 * answer `{ status, json }`), `mint()` (the hex string of `openssl rand -hex 32`), `writeFile(path,
 * text)` and `root`. Returns the exit code.
 */
export function execute(steps, options, files, io) {
  const dry = options.dryRun;
  const secrets = new Set();
  for (const [key, f] of Object.entries(files))
    if (!FILES[key]?.public) for (const v of f.values.values()) secrets.add(v);
  const say = (line) => io.out(scrub(line, secrets));
  const namesCache = new Map();
  const names = (environment) => {
    if (namesCache.has(environment)) return namesCache.get(environment);
    const r = io.vercel(['env', 'ls', environment, '--json', '--scope', options.scope], undefined);
    if (r.status !== 0)
      throw new Error(
        `vercel env ls ${environment} failed (exit ${r.status}): ${scrub(lastLine(r.stderr), secrets)}`,
      );
    const set = namesFromEnvLs(r.stdout);
    namesCache.set(environment, set);
    return set;
  };
  const valueOf = (source) => {
    if (source.file) {
      const v = files[source.file].values.get(source.key);
      if (v === undefined) {
        if (source.fallback !== undefined) return source.fallback;
        throw new Error(`${FILES[source.file].name} lacks ${source.key}`);
      }
      return v;
    }
    return source.literal;
  };
  /** The environment's room bearer: its own key, or the shared one on production before the rotation. */
  const bearer = (environment) => {
    const source = roomSource('TURBOSLIDE_ROOM_BEARER', environment, files.room);
    return source === null ? undefined : files.room.values.get(source.key);
  };
  const call = (environment, host, path, init = {}) => {
    const headers = { authorization: `Bearer ${bearer(environment)}`, ...(init.headers ?? {}) };
    return io.fetch(`https://${host}${path}`, { ...init, headers });
  };
  /** The `db` answer of each environment's /health this run read (the gate of `do` on production). */
  const workerDb = new Map();
  for (const s of steps) {
    switch (s.kind) {
      case 'report': {
        if (dry) {
          say(`would read vercel env ls ${s.environment} --json and report ${s.names.join(', ')}`);
          break;
        }
        const set = names(s.environment);
        say(
          `${s.environment}: ${s.names.map((n) => `${n} ${set.has(n) ? 'present' : 'absent'}`).join(', ')}`,
        );
        break;
      }
      case 'never': {
        if (dry) {
          say(
            `would read vercel env ls ${s.environment} --json and confirm ${s.names.join(', ')} absent (never set, docs/CLOUDFLARE.md 4.4)`,
          );
          break;
        }
        const set = names(s.environment);
        const present = s.names.filter((n) => set.has(n));
        say(
          present.length === 0
            ? `${s.environment}: ${s.names.join(', ')} absent, as they must be (never set, docs/CLOUDFLARE.md 4.4)`
            : `${s.environment}: ${present.join(', ')} PRESENT; these names are never set on either project (docs/CLOUDFLARE.md 4.4) and are Kevin's to remove`,
        );
        break;
      }
      case 'require': {
        if (dry) {
          say(`would require ${s.names.join(', ')} on ${s.environment} (${s.reason})`);
          break;
        }
        const set = names(s.environment);
        const missing = s.names.filter((n) => !set.has(n));
        if (missing.length > 0) {
          say(`${s.environment}: ${missing.join(', ')} absent; ${s.reason}`);
          return 1;
        }
        say(`${s.environment}: ${s.names.join(', ')} present`);
        break;
      }
      case 'mint': {
        const spec = FILES[s.file];
        const path = join(options.configDir, spec.name);
        if (s.when === 'present') {
          say(`${spec.name} ${s.key}: present`);
          break;
        }
        if (dry) {
          say(`would mint ${s.key} with openssl rand -hex 32 into ${path} (mode 600)`);
          break;
        }
        const f = files[s.file];
        if (f.exists && !f.private) {
          say(`${spec.name} has mode ${octal(f.mode)}; chmod 600 ${path} and run again`);
          return 2;
        }
        const value = io.mint();
        if (!/^[0-9a-f]{64}$/.test(value))
          throw new Error('openssl rand -hex 32 answered no 64 hex characters');
        const current = f.exists ? readFileSync(path, 'utf8') : '';
        io.writeFile(
          path,
          `${current}${current && !current.endsWith('\n') ? '\n' : ''}${s.key}=${value}\n`,
        );
        f.values.set(s.key, value);
        f.keys.push(s.key);
        f.exists = true;
        f.private = true;
        secrets.add(value);
        say(`minted ${s.key} into ${path} (mode 600)`);
        break;
      }
      case 'add': {
        if (dry) {
          say(`would set ${describeAdd(s, true)}`);
          break;
        }
        const set = names(s.environment);
        const present = set.has(s.name);
        if (s.when === 'absent' && present && !options.force) {
          say(`skip ${s.name} ${s.environment}: present (pass --force to replace)`);
          break;
        }
        if (s.gate === 'worker-db' && !WORKER_DB_READY.includes(workerDb.get(s.environment))) {
          say(
            `skip ${s.name} ${s.environment}: the ${s.environment} Worker's /health answers db ${workerDb.get(s.environment) ?? 'unread'}, so it does not take the new values yet; run \`worker-secrets --from-shared\` first (docs/hosting.md 13.8 phase 2)`,
          );
          break;
        }
        const force = present && (s.force || options.force);
        const args = ['env', 'add', s.name, s.environment];
        if (!s.plain) args.push('--sensitive');
        args.push('--yes', '--scope', options.scope);
        if (force) args.push('--force');
        const r = io.vercel(args, valueOf(s.source));
        if (r.status !== 0) {
          say(
            `vercel env add ${s.name} ${s.environment} failed (exit ${r.status}): ${lastLine(r.stderr)}`,
          );
          return 2;
        }
        set.add(s.name);
        say(`set ${describeAdd(s, false)}${force ? ', replaced' : ''}`);
        break;
      }
      case 'rm': {
        if (dry) {
          say(`would remove ${s.name} ${s.environment} when present (${s.reason})`);
          break;
        }
        const set = names(s.environment);
        if (!set.has(s.name)) {
          say(`${s.name} ${s.environment}: absent, nothing to remove`);
          break;
        }
        const r = io.vercel(
          ['env', 'rm', s.name, s.environment, '--yes', '--scope', options.scope],
          undefined,
        );
        if (r.status !== 0) {
          say(
            `vercel env rm ${s.name} ${s.environment} failed (exit ${r.status}): ${lastLine(r.stderr)}`,
          );
          return 2;
        }
        set.delete(s.name);
        say(`removed ${s.name} ${s.environment} (${s.reason})`);
        break;
      }
      case 'expect': {
        if (dry) {
          say(`would write ${EXPECTATION_REL} with realtime ${s.realtime}`);
          break;
        }
        const path = writeExpectation(s.realtime, io.root ?? ROOT);
        say(`wrote ${path}: realtime ${s.realtime}`);
        break;
      }
      case 'health': {
        if (dry) {
          say(`would read https://${s.host}/health for the ${s.environment} Worker (${s.reason})`);
          break;
        }
        let answer;
        try {
          answer = io.fetch(`https://${s.host}/health`, { method: 'GET' });
        } catch (error) {
          say(
            `${s.environment}: https://${s.host}/health unreachable (${error instanceof Error ? error.message : String(error)}); ${s.reason}`,
          );
          return 1;
        }
        const body = answer.json ?? {};
        if (answer.status !== 200 || body.ok !== true) {
          say(`${s.environment}: https://${s.host}/health answered ${answer.status}; ${s.reason}`);
          return 1;
        }
        if (body.realtime === 'unset') {
          say(
            `${s.environment}: https://${s.host}/health answers realtime unset (the control tables are not made); run worker-migrate${s.environment === 'preview' ? ' --env preview' : ''} first (docs/CLOUDFLARE.md 3.6.2)`,
          );
          return 1;
        }
        workerDb.set(s.environment, typeof body.db === 'string' ? body.db : 'fallback');
        say(
          `${s.environment}: https://${s.host}/health ok, realtime ${body.realtime}, commit ${body.commit || '(empty)'}, appOrigin ${body.appOrigin || '(empty)'}, db ${workerDb.get(s.environment)}`,
        );
        break;
      }
      case 'flush': {
        if (dry) {
          say(
            `would read https://${s.host}/control/open under the room bearer and post /rooms/<id>/flush per open deck (the ${s.environment} Worker)`,
          );
          break;
        }
        const open = call(s.environment, s.host, '/control/open', { method: 'GET' });
        if (open.status !== 200) {
          say(`${s.environment}: GET https://${s.host}/control/open answered ${open.status}`);
          return 2;
        }
        const ids = openDecksOf(open.json);
        if (ids.length === 0) {
          say(`${s.environment}: no open deck on ${s.host}; nothing to flush`);
          break;
        }
        let flushed = 0;
        const failed = [];
        for (const id of ids) {
          const r = call(s.environment, s.host, `/rooms/${id}/flush`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          if (r.status >= 200 && r.status < 300) flushed += 1;
          else failed.push(`${id} (${r.status})`);
        }
        say(
          `${s.environment}: ${flushed} of ${ids.length} open deck${ids.length === 1 ? '' : 's'} flushed on ${s.host}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`,
        );
        if (failed.length > 0) return 1;
        break;
      }
      case 'flag': {
        if (dry) {
          say(
            `would post https://${s.host}/control/flags { realtime: ${JSON.stringify(s.realtime)} } under the room bearer and read it back (the ${s.environment} Worker)`,
          );
          break;
        }
        const r = call(s.environment, s.host, '/control/flags', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ realtime: s.realtime }),
        });
        if (r.status < 200 || r.status >= 300) {
          say(`${s.environment}: POST https://${s.host}/control/flags answered ${r.status}`);
          return 2;
        }
        const back = call(s.environment, s.host, '/control/flags', { method: 'GET' });
        const value = back.json?.realtime ?? back.json?.flags?.realtime;
        say(
          `${s.environment}: realtime flag ${value ?? 'unread'} on ${s.host} (read within 30 s by the router and every awake object, docs/CLOUDFLARE.md 3.8 item 1)`,
        );
        if (value !== s.realtime) return 1;
        break;
      }
      case 'wrangler': {
        const shown = `wrangler ${s.args.join(' ')}`;
        if (dry) {
          say(`would run ${shown} from ${WORKER_DIR_REL}: ${s.label}`);
          break;
        }
        const r = io.wrangler(s.args, s.source ? valueOf(s.source) : undefined);
        if (r.status !== 0 && s.tolerate === true) {
          say(
            `${shown} answered exit ${r.status}; passed (${s.label}: the Worker may not hold it)`,
          );
          break;
        }
        if (r.status !== 0) {
          say(`${shown} failed (exit ${r.status}): ${lastLine(r.stderr) || lastLine(r.stdout)}`);
          return 2;
        }
        say(`ran ${shown}: ${s.label}`);
        break;
      }
      case 'note':
        say(s.text);
        break;
      case 'stop':
        say(s.text);
        return s.exit;
      default:
        throw new Error(`unknown step ${s.kind}`);
    }
  }
  return 0;
}

/** The `vercel` call: the CLI on PATH, the value on stdin, VERCEL_OIDC_TOKEN out of the child's environment. */
export function spawnVercel(cwd) {
  return (args, input) => {
    const env = { ...process.env };
    delete env.VERCEL_OIDC_TOKEN;
    const r = spawnSync('vercel', args, { cwd, input, encoding: 'utf8', env });
    if (r.error) return { status: 127, stdout: '', stderr: r.error.message };
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}

/**
 * The `wrangler` call: the workspace's binary from apps/realtime-worker (never a global one), the
 * value on stdin, CLOUDFLARE_ACCOUNT_ID from cloudflare.env in the child's environment when the
 * file names it, VERCEL_OIDC_TOKEN out. A missing binary answers 127 with the install sentence.
 */
export function spawnWrangler(options, files) {
  const workerDir = options.workerDir ?? join(ROOT, WORKER_DIR_REL);
  const binary = options.wrangler ?? join(workerDir, 'node_modules', '.bin', 'wrangler');
  return (args, input) => {
    if (!existsSync(binary))
      return {
        status: 127,
        stdout: '',
        stderr: `${binary} is absent: the workspace's wrangler is installed by the integrator's pnpm install (docs/CLOUDFLARE.md section 6 step 6), or pass --wrangler <path>`,
      };
    const env = { ...process.env };
    delete env.VERCEL_OIDC_TOKEN;
    const account = files.cloudflare.values.get('CLOUDFLARE_ACCOUNT_ID');
    if (account) env.CLOUDFLARE_ACCOUNT_ID = account;
    const r = spawnSync(binary, args, { cwd: workerDir, input, encoding: 'utf8', env });
    if (r.error) return { status: 127, stdout: '', stderr: r.error.message };
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}

/** One HTTP call with a 10 s deadline, answered as `{ status, json }` (json null when the body is not JSON). */
export function fetchJsonSync(url, init) {
  // spawnSync keeps the script synchronous: one node child per call, the body on stdout as JSON.
  const script = `
const [url, init] = [process.argv[1], JSON.parse(process.argv[2])];
fetch(url, { ...init, signal: AbortSignal.timeout(10000) }).then(async (r) => {
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  process.stdout.write(JSON.stringify({ status: r.status, json }));
}).catch((e) => { process.stdout.write(JSON.stringify({ error: String(e && e.message || e) })); });
`;
  const r = spawnSync(process.execPath, ['-e', script, url, JSON.stringify(init ?? {})], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) throw new Error(`fetch ${url} failed (exit ${r.status})`);
  const answer = JSON.parse(r.stdout);
  if (answer.error) throw new Error(answer.error);
  return answer;
}

export function mintWithOpenssl() {
  const r = spawnSync('openssl', ['rand', '-hex', '32'], { encoding: 'utf8' });
  if (r.status !== 0)
    throw new Error(`openssl rand -hex 32 failed (exit ${r.status ?? r.error?.message})`);
  return r.stdout.trim();
}

function writePrivate(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Reads the files, checks the link for a Vercel subcommand, builds the plan and runs or prints it; returns the exit code. */
export function run(options, io = {}) {
  const out = io.out ?? ((line) => console.log(line));
  const files = Object.fromEntries(
    Object.entries(FILES).map(([k, spec]) => [
      k,
      readSecretFile(join(options.configDir, spec.name)),
    ]),
  );
  const vercelSide = VERCEL_SUBCOMMANDS.includes(options.subcommand);
  out(
    `realtime-env ${options.subcommand}${options.flag ? ` ${options.flag}` : ''}${options.dryRun ? ' --dry-run' : ''} (${vercelSide ? `project ${options.project}, scope ${options.scope}, environments ${options.environments.join(', ')}` : options.subcommand === 'mint' ? `environments ${options.environments.join(', ')}` : `worker environment ${options.env}`}, config ${options.configDir})`,
  );
  if (vercelSide) {
    const linked = linkedProject(options.cwd);
    if (linked !== options.project) {
      const line = `the linked project of ${options.cwd} is ${linked ?? 'none (.vercel/project.json absent)'}, not ${options.project}`;
      if (!options.dryRun) {
        out(
          `${line}; refused. Run from a root linked to ${options.project}, or pass --project <name> on purpose`,
        );
        return 2;
      }
      out(`${line}; a real run would refuse`);
    }
  }
  const steps = planFor(options.subcommand, options, files);
  return execute(steps, options, files, {
    out,
    vercel: io.vercel ?? spawnVercel(options.cwd),
    wrangler: io.wrangler ?? spawnWrangler(options, files),
    fetch: io.fetch ?? fetchJsonSync,
    mint: io.mint ?? mintWithOpenssl,
    writeFile: io.writeFile ?? writePrivate,
    root: io.root ?? ROOT,
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : String(error));
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    process.exit(0);
  }
  try {
    process.exit(run(options));
  } catch (error) {
    console.error(`realtime-env: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

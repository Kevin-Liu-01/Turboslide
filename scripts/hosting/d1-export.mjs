#!/usr/bin/env node
// The weekly export of the accounts database (hardening O#1b, docs/hardening/HARDENING.md 4.8;
// RELIABILITY-13 and the export rule of CRIT-M5). The guard runs it from its checkout on every
// poll (docs/hardening/build/guard-d1-export.patch); it does nothing until the newest export is a
// week old, then runs the workspace's wrangler from apps/realtime-worker:
//
//   wrangler d1 export turboslide-accounts --remote --skip-confirmation --output <file>
//     --table user --table account --table ts_alias --table ts_api_key --table ts_principal
//     --table ts_profile --table ts_schema --table rt_flags
//
// The tables are a list, never a rule: `session`, `verification`, `deviceCode`, `ts_mail`,
// `ts_quota`, `rt_open` and every table the hardening round adds (`ts_db_unlisted` from K2#3, the
// limiter's and the report counts' to come) stay out, because a session token or a code in a file
// on disk is a key to an account. `account` holds Google's tokens until K2#7 stores them
// encrypted, so the file is a secret either way: it is written into a folder of mode 700 under
// the name `.accounts-<day>.sql.part`, set to mode 600, then renamed `accounts-<yyyy-mm-dd>.sql`;
// the newest eight are kept and the older ones removed. The file never leaves the machine and is
// never committed (docs/hardening/HARDENING.md question 30: `~/.config/turboslide/backups/` on the
// encrypted disk). A failed run leaves `.last-attempt` in the folder, so the guard tries again
// after `--retry-hours`, not on every poll.
//
//   node scripts/hosting/d1-export.mjs [--dir ~/.config/turboslide/backups] [--every-days 7]
//     [--keep 8] [--retry-hours 6] [--wrangler <path>] [--cwd apps/realtime-worker] [--dry-run]
//
// The account id reaches wrangler through the environment the guard gives it
// (CLOUDFLARE_ACCOUNT_ID). Nothing of the database is printed: one line names the file and its
// size, or the wrangler exit code and its last two lines with every line that names a token
// dropped. Exit 0 when a file was written or none was due, 1 when wrangler failed, 2 on a usage
// error.
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DATABASE = 'turboslide-accounts';

/** The tables the export carries, in this order. */
export const EXPORT_TABLES = [
  'user',
  'account',
  'ts_alias',
  'ts_api_key',
  'ts_principal',
  'ts_profile',
  'ts_schema',
  'rt_flags',
];

/** Tables that never enter the file, named so the test can hold the list to them. */
export const NEVER_TABLES = [
  'session',
  'verification',
  'deviceCode',
  'ts_mail',
  'ts_quota',
  'rt_open',
  'ts_db_unlisted',
];

const DAY_MS = 86_400_000;
const FILE_PATTERN = /^accounts-(\d{4}-\d{2}-\d{2})\.sql$/;
const ATTEMPT_FILE = '.last-attempt';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE =
  'usage: node scripts/hosting/d1-export.mjs [--dir <folder>] [--every-days 7] [--keep 8] [--retry-hours 6] [--wrangler <path>] [--cwd <worker dir>] [--dry-run]';

export function parseArgs(argv) {
  const out = {
    dir: join(homedir(), '.config', 'turboslide', 'backups'),
    everyDays: 7,
    keep: 8,
    retryHours: 6,
    wrangler: null,
    cwd: join(ROOT, 'apps', 'realtime-worker'),
    dryRun: false,
    help: false,
  };
  const number = (value, name) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new RangeError(`${name} takes a number\n${USAGE}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') out.dir = argv[++i] ?? out.dir;
    else if (arg === '--every-days') out.everyDays = number(argv[++i], arg);
    else if (arg === '--keep') out.keep = Math.max(1, Math.floor(number(argv[++i], arg)));
    else if (arg === '--retry-hours') out.retryHours = number(argv[++i], arg);
    else if (arg === '--wrangler') out.wrangler = argv[++i] ?? null;
    else if (arg === '--cwd') out.cwd = argv[++i] ?? out.cwd;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new RangeError(`unknown argument ${arg}\n${USAGE}`);
  }
  out.wrangler ??= join(out.cwd, 'node_modules', '.bin', 'wrangler');
  return out;
}

/** The wrangler arguments of one export into `output`. */
export function exportArgs(output) {
  return [
    'd1',
    'export',
    DATABASE,
    '--remote',
    '--skip-confirmation',
    '--output',
    output,
    ...EXPORT_TABLES.flatMap((table) => ['--table', table]),
  ];
}

/** The exports the folder holds, newest first, by the day in their name. */
export function exportsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, day: FILE_PATTERN.exec(name)?.[1] }))
    .filter((row) => row.day !== undefined)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/** Whether an export is due: none yet, or the newest one `everyDays` old, and no failure within `retryHours`. */
export function due(dir, { everyDays, retryHours }, now = Date.now()) {
  const newest = exportsIn(dir)[0];
  if (newest !== undefined && now - Date.parse(`${newest.day}T00:00:00.000Z`) < everyDays * DAY_MS)
    return { due: false, why: `the newest export is ${newest.name}` };
  const attempt = join(dir, ATTEMPT_FILE);
  if (existsSync(attempt) && now - statSync(attempt).mtimeMs < retryHours * 3_600_000)
    return { due: false, why: `the last attempt failed less than ${retryHours} hours ago` };
  return {
    due: true,
    why: newest === undefined ? 'no export yet' : `${newest.name} is a week old`,
  };
}

/** The folder with mode 700, made when absent and narrowed when it is wider. */
export function secureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if ((statSync(dir).mode & 0o777) !== 0o700) chmodSync(dir, 0o700);
}

/** Removes all but the newest `keep` exports; answers the names removed, the oldest first. */
export function prune(dir, keep) {
  const removed = [];
  for (const row of exportsIn(dir).slice(keep).reverse()) {
    rmSync(join(dir, row.name), { force: true });
    removed.push(row.name);
  }
  return removed;
}

/** A line of wrangler's output that may be printed: nothing that names a token. */
function printable(line) {
  return !/token|bearer|authorization|secret|api[_-]?key/i.test(line);
}

function run(command, args, cwd, env) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    const take = (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean));
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (error) => resolveRun({ code: 127, lines: [error.message] }));
    child.on('close', (code) => resolveRun({ code: code ?? 1, lines }));
  });
}

/** One run: the export when due, the mode, the rename and the prune. */
export async function exportAccounts(options, now = Date.now(), env = process.env) {
  const verdict = due(options.dir, options, now);
  if (!verdict.due) return { code: 0, line: `nothing to do: ${verdict.why}` };
  const day = new Date(now).toISOString().slice(0, 10);
  const name = `accounts-${day}.sql`;
  const part = join(options.dir, `.${name}.part`);
  const args = exportArgs(part);
  if (options.dryRun)
    return { code: 0, line: `would run ${options.wrangler} ${args.join(' ')} in ${options.cwd}` };
  if (!existsSync(options.wrangler))
    return {
      code: 1,
      line: `wrangler is not installed at ${options.wrangler}; run pnpm install --frozen-lockfile once`,
    };
  secureDir(options.dir);
  const attempt = join(options.dir, ATTEMPT_FILE);
  const result = await run(options.wrangler, args, options.cwd, env);
  if (result.code !== 0 || !existsSync(part)) {
    rmSync(part, { force: true });
    writeFileSync(attempt, `${new Date(now).toISOString()}\n`, { mode: 0o600 });
    const tail = result.lines.filter(printable).slice(-2).join(' ').slice(0, 240);
    return { code: 1, line: `wrangler exited ${result.code}: ${tail}` };
  }
  chmodSync(part, 0o600);
  renameSync(part, join(options.dir, name));
  rmSync(attempt, { force: true });
  const removed = prune(options.dir, options.keep);
  const bytes = statSync(join(options.dir, name)).size;
  return {
    code: 0,
    line: `wrote ${name} (${bytes} bytes, ${EXPORT_TABLES.length} tables)${removed.length === 0 ? '' : `; removed ${removed.join(', ')}`}`,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const { code, line } = await exportAccounts(options);
  (code === 0 ? console.log : console.error)(line);
  process.exit(code);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

#!/usr/bin/env node
// The realtime Worker's bundle hash (RELIABILITY-16; hardening HR-RT#18,
// docs/hardening/HARDENING.md 4.6). A Worker deploy restarts every Durable Object and closes every
// editor's socket ("Code updates disconnect all WebSockets", the Durable Objects WebSocket page),
// and the guard deployed the production Worker on every push that was not docs only while the
// tree expects the do tier, a favicon commit among them. This script prints the SHA-256 of what a
// deploy would upload, so the guard deploys the Worker only when that changes
// (docs/hardening/build/guard-worker-hash.patch): it runs the workspace's wrangler from
// apps/realtime-worker,
//
//   wrangler deploy --dry-run --outdir <temporary folder> --env <"" | preview>
//
// which bundles and uploads nothing, and hashes the bundle with the configuration beside it:
// the environment's name, `wrangler.jsonc` as it stands (a variable, a cron or a binding changes
// what a deploy sets though the code is the same) and every file of the output by its path, but
// the README the dry run stamps with its time and the source maps, which name absolute paths.
// The deploy passes the hash as `--var TURBOSLIDE_BUNDLE_HASH:<hash>` and `/health` answers it as
// `bundle`, so the guard compares the hash of the push with the deployed one.
//
//   node scripts/hosting/worker-hash.mjs [--env production|preview] [--cwd apps/realtime-worker]
//     [--wrangler <path>]
//
// Prints the hash and nothing else on stdout. Exit 0 with the hash, 1 when the dry run failed (its
// last two lines on stderr), 2 on a usage error. Needs no account and no network.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** The two environments the guard deploys: production is wrangler's top level one. */
export const ENVIRONMENTS = ['production', 'preview'];

/** Whether a file of the dry run's output enters the hash: not its README, not a source map. */
export function hashedFile(name) {
  return name !== 'README.md' && !name.endsWith('.map');
}

/** wrangler's arguments for the dry run of one environment into `outdir`. */
export function dryRunArgs(environment, outdir) {
  return [
    'deploy',
    '--dry-run',
    '--outdir',
    outdir,
    '--env',
    environment === 'preview' ? 'preview' : '',
  ];
}

/** Every file under `dir`, as paths relative to it with `/` between the parts, sorted. */
export function filesUnder(dir) {
  const out = [];
  const walk = (at, prefix) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      const relative = prefix === '' ? name : `${prefix}/${name}`;
      if (statSync(path).isDirectory()) walk(path, relative);
      else out.push(relative);
    }
  };
  walk(dir, '');
  return out.sort();
}

/**
 * The hash of a bundle: the environment's name, the configuration's text and each hashed file by
 * its relative path, each field ended by a NUL byte so no two layouts read alike. Pure over the
 * folder it is given.
 */
export function bundleHash({ environment, config, outdir }) {
  const hash = createHash('sha256');
  const field = (value) => {
    hash.update(value);
    hash.update(Buffer.from([0]));
  };
  field(`environment ${environment}`);
  field('wrangler.jsonc');
  field(config);
  for (const file of filesUnder(outdir).filter((path) => hashedFile(basename(path)))) {
    field(file);
    field(readFileSync(join(outdir, file)));
  }
  return hash.digest('hex');
}

/** Parses the command line; throws a usage error for anything else. */
export function parseArgs(argv) {
  const options = { environment: 'production', cwd: join(ROOT, 'apps', 'realtime-worker') };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--env' && value !== undefined && ENVIRONMENTS.includes(value)) {
      options.environment = value;
      i += 1;
    } else if (flag === '--cwd' && value !== undefined) {
      options.cwd = resolve(value);
      i += 1;
    } else if (flag === '--wrangler' && value !== undefined) {
      options.wrangler = resolve(value);
      i += 1;
    } else {
      throw new TypeError(
        'usage: worker-hash.mjs [--env production|preview] [--cwd <worker folder>] [--wrangler <path>]',
      );
    }
  }
  options.wrangler ??= join(options.cwd, 'node_modules', '.bin', 'wrangler');
  return options;
}

/**
 * Runs the dry run of one environment and answers the hash, or `{ error }` with the run's last
 * two lines when it failed. The temporary folder is removed either way.
 */
export function workerHash({ environment, cwd, wrangler, run = spawnSync }) {
  const outdir = mkdtempSync(join(tmpdir(), 'turboslide-worker-hash-'));
  try {
    const result = run(wrangler, dryRunArgs(environment, outdir), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      const lines = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
        .split('\n')
        .filter((line) => line.trim() !== '' && !/token|secret|bearer/i.test(line));
      return {
        error: `wrangler deploy --dry-run exit ${result.status ?? 'none'}: ${lines.slice(-2).join(' ')}`,
      };
    }
    const config = readFileSync(join(cwd, 'wrangler.jsonc'));
    return { hash: bundleHash({ environment, config, outdir }) };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const answer = workerHash(options);
  if ('error' in answer) {
    console.error(answer.error);
    process.exit(1);
  }
  console.log(answer.hash);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

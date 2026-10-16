// The Worker's bundle hash (RELIABILITY-16; hardening HR-RT#18) over folders the test writes and a
// fake wrangler: the hash reads the bundle and the configuration, never the dry run's README or
// its source maps, so a push that changes no file of the bundle hashes the same and the guard
// leaves the production Worker, and every editor's socket, alone. No network and no account.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  bundleHash,
  dryRunArgs,
  filesUnder,
  hashedFile,
  parseArgs,
  workerHash,
} from './worker-hash.mjs';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'worker-hash-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes `files` (relative path to text) under a new folder of `dir` and answers it. */
function bundle(name, files) {
  const out = join(dir, name);
  for (const [path, text] of Object.entries(files)) {
    const file = join(out, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
  }
  return out;
}

const CONFIG = '{ "name": "turboslide-realtime" }\n';
const BUILT = {
  'index.js': 'export default {};\n',
  'chunks/room.js': 'export const room = 1;\n',
  'README.md': 'generated at 2026-10-12T23:34:33.787Z\n',
  'index.js.map': '{"sources":["/Users/someone/repo/src/index.ts"]}',
};

describe('the bundle hash (HR-RT#18)', () => {
  it('reads the bundle and the configuration, not the README or the source maps', () => {
    expect(hashedFile('index.js')).toBe(true);
    expect(hashedFile('README.md')).toBe(false);
    expect(hashedFile('index.js.map')).toBe(false);
    const a = bundle('a', BUILT);
    expect(filesUnder(a)).toEqual(['README.md', 'chunks/room.js', 'index.js', 'index.js.map']);
    const hash = bundleHash({ environment: 'production', config: CONFIG, outdir: a });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // another dry run of the same tree: a new time in the README, another path in the map
    const b = bundle('b', {
      'index.js.map': '{"sources":["/Users/other/checkout/src/index.ts"]}',
      'index.js': BUILT['index.js'],
      'README.md': 'generated at 2026-10-13T08:00:00.000Z\n',
      'chunks/room.js': BUILT['chunks/room.js'],
    });
    expect(bundleHash({ environment: 'production', config: CONFIG, outdir: b })).toBe(hash);
  });

  it('changes with the code, the configuration and the environment', () => {
    const a = bundle('a', BUILT);
    const hash = bundleHash({ environment: 'production', config: CONFIG, outdir: a });
    const code = bundle('code', { ...BUILT, 'chunks/room.js': 'export const room = 2;\n' });
    expect(bundleHash({ environment: 'production', config: CONFIG, outdir: code })).not.toBe(hash);
    const moved = bundle('moved', {
      'index.js': BUILT['index.js'],
      'room.js': BUILT['chunks/room.js'],
    });
    expect(bundleHash({ environment: 'production', config: CONFIG, outdir: moved })).not.toBe(hash);
    expect(
      bundleHash({ environment: 'production', config: `${CONFIG}// a cron\n`, outdir: a }),
    ).not.toBe(hash);
    expect(bundleHash({ environment: 'preview', config: CONFIG, outdir: a })).not.toBe(hash);
  });

  it('runs the dry run of the environment it names and hashes what it wrote', () => {
    expect(dryRunArgs('production', '/out')).toEqual([
      'deploy',
      '--dry-run',
      '--outdir',
      '/out',
      '--env',
      '',
    ]);
    expect(dryRunArgs('preview', '/out').slice(-2)).toEqual(['--env', 'preview']);
    const worker = bundle('worker', { 'wrangler.jsonc': CONFIG });
    const calls = [];
    let outdir = '';
    const fake = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      outdir = args[args.indexOf('--outdir') + 1];
      for (const [path, text] of Object.entries(BUILT)) {
        mkdirSync(join(outdir, path, '..'), { recursive: true });
        writeFileSync(join(outdir, path), text);
      }
      return { status: 0, stdout: '--dry-run: exiting now.\n', stderr: '' };
    };
    const answer = workerHash({
      environment: 'preview',
      cwd: worker,
      wrangler: 'wrangler',
      run: fake,
    });
    expect(calls).toEqual([
      { command: 'wrangler', args: dryRunArgs('preview', outdir), cwd: worker },
    ]);
    expect(answer).toEqual({
      hash: bundleHash({ environment: 'preview', config: CONFIG, outdir: bundle('same', BUILT) }),
    });
    // the temporary folder is gone
    expect(existsSync(outdir)).toBe(false);
  });

  it('answers a failed dry run with its last lines, never a line that names a token', () => {
    const worker = bundle('worker', { 'wrangler.jsonc': CONFIG });
    const fake = () => ({
      status: 1,
      stdout: '',
      stderr: 'bundling\nCLOUDFLARE_API_TOKEN is not set\nX [ERROR] Could not resolve "x"\n',
    });
    const answer = workerHash({ environment: 'production', cwd: worker, wrangler: 'w', run: fake });
    expect(answer).toEqual({
      error: 'wrangler deploy --dry-run exit 1: bundling X [ERROR] Could not resolve "x"',
    });
  });

  it('takes the environment, the folder and the wrangler, and refuses anything else', () => {
    expect(parseArgs(['--env', 'preview', '--cwd', '/w', '--wrangler', '/bin/w'])).toEqual({
      environment: 'preview',
      cwd: '/w',
      wrangler: '/bin/w',
    });
    expect(parseArgs(['--cwd', '/w']).wrangler).toBe('/w/node_modules/.bin/wrangler');
    expect(() => parseArgs(['--env', 'staging'])).toThrow(/usage/);
    expect(() => parseArgs(['--hash'])).toThrow(/usage/);
  });
});

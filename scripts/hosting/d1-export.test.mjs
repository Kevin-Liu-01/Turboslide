// The weekly accounts export (hardening O#1b) over a fake wrangler: the command line the guard
// patch runs (the database, `--remote`, the eight tables and none of the tables that hold a
// session token or a code), the file's mode 600 inside a folder of mode 700, the week between two
// exports, the newest eight kept, and a failed run that prints no token and waits before trying
// again. No network and no Cloudflare account: the fake records its arguments and writes a file.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DATABASE,
  EXPORT_TABLES,
  NEVER_TABLES,
  exportAccounts,
  exportArgs,
  parseArgs,
} from './d1-export.mjs';

const DAY_MS = 86_400_000;
/** The child's environment: the PATH alone, so the fake's `#!/usr/bin/env node` finds node. */
const ENV = { PATH: process.env.PATH };
const NOW = Date.parse('2026-10-11T12:00:00.000Z');
let root = '';

/** A wrangler that records its arguments and writes the file `--output` names, or fails. */
function fakeWrangler(fail = false) {
  const file = join(root, fail ? 'wrangler-failing' : 'wrangler');
  writeFileSync(
    file,
    `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
writeFileSync(${JSON.stringify(join(root, 'argv.json'))}, JSON.stringify(args));
${
  fail
    ? `console.error('Authentication error: the API token sk_test_0000 was refused');
console.error('code 10000');
process.exit(3);`
    : `writeFileSync(args[args.indexOf('--output') + 1], '-- the fake export\\n');`
}
`,
  );
  chmodSync(file, 0o755);
  return file;
}

function options(extra = {}) {
  return {
    ...parseArgs(['--dir', join(root, 'backups'), '--cwd', root]),
    wrangler: fakeWrangler(),
    ...extra,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'o1b-export-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the weekly accounts export (hardening O#1b)', () => {
  it('names the database, --remote and the eight tables, and none that holds a token or a code', () => {
    const args = exportArgs('/x/.accounts.sql.part');
    expect(args.slice(0, 4)).toEqual(['d1', 'export', DATABASE, '--remote']);
    expect(args[args.indexOf('--output') + 1]).toBe('/x/.accounts.sql.part');
    const tables = args.flatMap((arg, i) => (args[i - 1] === '--table' ? [arg] : []));
    expect(tables).toEqual([
      'user',
      'account',
      'ts_alias',
      'ts_api_key',
      'ts_principal',
      'ts_profile',
      'ts_schema',
      'rt_flags',
    ]);
    for (const never of NEVER_TABLES) expect(tables).not.toContain(never);
    expect(EXPORT_TABLES).toEqual(tables);
  });

  it('writes accounts-<day>.sql with mode 600 in a folder of mode 700 from the fake wrangler', async () => {
    const run = options();
    const result = await exportAccounts(run, NOW, ENV);
    expect(result.code).toBe(0);
    expect(result.line).toMatch(/^wrote accounts-2026-10-11\.sql \(\d+ bytes, 8 tables\)$/);
    const file = join(run.dir, 'accounts-2026-10-11.sql');
    expect(readFileSync(file, 'utf8')).toBe('-- the fake export\n');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(run.dir).mode & 0o777).toBe(0o700);
    expect(readdirSync(run.dir)).toEqual(['accounts-2026-10-11.sql']);
    const argv = JSON.parse(readFileSync(join(root, 'argv.json'), 'utf8'));
    expect(argv).toEqual(exportArgs(join(run.dir, '.accounts-2026-10-11.sql.part')));
  });

  it('waits a week between two exports and narrows a folder made wider', async () => {
    const run = options();
    await exportAccounts(run, NOW, ENV);
    rmSync(join(root, 'argv.json'));
    expect((await exportAccounts(run, NOW + 6 * DAY_MS, ENV)).line).toBe(
      'nothing to do: the newest export is accounts-2026-10-11.sql',
    );
    expect(existsSync(join(root, 'argv.json'))).toBe(false);
    chmodSync(run.dir, 0o755);
    const later = await exportAccounts(run, NOW + 7 * DAY_MS, ENV);
    expect(later.line).toMatch(/^wrote accounts-2026-10-18\.sql/);
    expect(statSync(run.dir).mode & 0o777).toBe(0o700);
  });

  it('keeps the newest eight exports and removes the older ones', async () => {
    const run = options();
    mkdirSync(run.dir, { recursive: true, mode: 0o700 });
    for (let week = 10; week >= 1; week -= 1) {
      const day = new Date(NOW - week * 7 * DAY_MS).toISOString().slice(0, 10);
      writeFileSync(join(run.dir, `accounts-${day}.sql`), '--\n', { mode: 0o600 });
    }
    const result = await exportAccounts(run, NOW, ENV);
    expect(result.line).toMatch(
      /removed accounts-2026-08-02\.sql, accounts-2026-08-09\.sql, accounts-2026-08-16\.sql$/,
    );
    const left = readdirSync(run.dir).sort();
    expect(left).toHaveLength(8);
    expect(left[left.length - 1]).toBe('accounts-2026-10-11.sql');
  });

  it('a failed run prints no token, leaves no file, and waits before it tries again', async () => {
    const run = options({ wrangler: fakeWrangler(true) });
    const failed = await exportAccounts(run, NOW, ENV);
    expect(failed.code).toBe(1);
    expect(failed.line).toBe('wrangler exited 3: code 10000');
    expect(failed.line).not.toMatch(/sk_test|token/i);
    expect(readdirSync(run.dir)).toEqual(['.last-attempt']);
    const soon = await exportAccounts(
      { ...run, wrangler: fakeWrangler() },
      Date.now() + 3_600_000,
      {},
    );
    expect(soon.line).toBe('nothing to do: the last attempt failed less than 6 hours ago');
  });

  it('a dry run names the command and runs nothing', async () => {
    const run = options({ dryRun: true });
    const result = await exportAccounts(run, NOW, ENV);
    expect(result.line).toContain('d1 export turboslide-accounts --remote');
    expect(existsSync(join(root, 'argv.json'))).toBe(false);
    expect(existsSync(run.dir)).toBe(false);
  });
});

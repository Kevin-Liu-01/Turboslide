import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CORE_MATRIX, PROBE_DRIVER } from './core-matrix.mjs';

// The core gate's tail (docs/FOCUS.md 6.2; VERIFICATION.md F3): after the drivers the gate merges
// every row by id, writes core-gate.json, core-matrix.md and the `--matrix` ledger copy, prints
// the verdict line and exits by the verdict. F3 was a ReferenceError at that point on every run,
// so the gate never printed a verdict and check step 32 could not pass. This test runs the gate
// with `--report <dir>` over a stub Playwright JSON report (no browser, no server) and pins the
// four outputs and the exit code, once with every spec row passing and once with one row failed.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = join(ROOT, 'scripts', 'probes', 'core-gate.mjs');
const specRows = CORE_MATRIX.filter((row) => row.driver !== PROBE_DRIVER);

/** A Playwright JSON report with one passed test per spec row, `failing` rows failed. */
function stubReport(failing = []) {
  const byFile = new Map();
  for (const row of specRows) {
    const list = byFile.get(row.driver) ?? [];
    const failed = failing.includes(row.id);
    list.push({
      title: `${row.id}: ${row.interaction}`,
      file: `apps/studio/e2e/${row.driver}`,
      tests: [
        {
          status: failed ? 'unexpected' : 'expected',
          results: [
            failed
              ? {
                  status: 'failed',
                  retry: 0,
                  error: { message: 'Error: the stub failed this row' },
                }
              : { status: 'passed', retry: 0 },
          ],
          annotations: [],
        },
      ],
    });
    byFile.set(row.driver, list);
  }
  return {
    config: { projects: [{ retries: 0 }] },
    suites: [...byFile.entries()].map(([file, specs]) => ({ title: file, specs })),
  };
}

function runGate(report, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'core-gate-'));
  writeFileSync(join(dir, 'specs.json'), JSON.stringify(report));
  const out = join(dir, 'out');
  const ledger = join(dir, 'ledger', 'copy.json');
  const run = spawnSync(
    'node',
    [
      GATE,
      '--base',
      'http://stub.invalid',
      '--only',
      'specs',
      '--report',
      dir,
      '--out',
      out,
      '--matrix',
      ledger,
      ...extra,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { run, dir, out, ledger };
}

describe('the core gate renders its verdict from a finished run', () => {
  it('writes the JSON, the table and the ledger copy and exits 0 when every spec row passed', () => {
    const { run, out, ledger } = runGate(stubReport());
    expect(run.stderr, run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(existsSync(join(out, 'core-gate.json'))).toBe(true);
    expect(existsSync(join(out, 'core-matrix.md'))).toBe(true);
    expect(existsSync(ledger)).toBe(true);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(readFileSync(ledger, 'utf8')).toBe(JSON.stringify(summary, null, 2));
    expect(summary.rows).toBe(specRows.length);
    expect(summary.passed).toBe(specRows.length);
    expect(summary.noStep).toEqual([]);
    expect(summary.verdict.ok).toBe(true);
    expect(summary.retriesOk).toBe(true);
    expect(summary.exitCode).toBe(0);
    const table = readFileSync(join(out, 'core-matrix.md'), 'utf8');
    for (const row of specRows) expect(table).toContain(`| \`${row.id}\` | ${row.feature} |`);
    expect(run.stdout).toMatch(
      /core-gate: \d+ rows: \d+ passed, 0 failed, 0 not driven \(0 manual\), 0 no step; verdict ok; retries zero/,
    );
  }, 30_000);

  it('lists a failed row by id, names it in the verdict line and exits 1', () => {
    const victim = specRows.find((row) => row.feature === 'decks').id;
    const { run, out } = runGate(stubReport([victim]));
    expect(run.status).toBe(1);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.failed).toBe(1);
    expect(summary.results[victim]).toBe('failed');
    expect(summary.verdict.ok).toBe(false);
    expect(summary.wouldPark).toContain('decks');
    const table = readFileSync(join(out, 'core-matrix.md'), 'utf8');
    expect(table).toContain(`- \`${victim}\`: Error: the stub failed this row`);
    expect(run.stdout).toContain(`failing the gate: ${victim} (failed)`);
    expect(run.stdout).toContain('verdict failed');
  }, 30_000);

  it('reads a row nobody drove as no step and exits 1 whatever the parked list says', () => {
    const report = stubReport();
    report.suites[0].specs.pop();
    const { run, out } = runGate(report);
    expect(run.status).toBe(1);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.noStep.length).toBe(1);
    expect(readFileSync(join(out, 'core-matrix.md'), 'utf8')).toContain('## No step');
  }, 30_000);
});

// The gate's start (C2-F29 and C3-F9). These tests spawn the real gate against a localhost base
// nobody answers, so they run with `--dry-run` (the gate stops after the scratch check, before the
// lock and the drivers) and `--lock <temp folder>` (the lock a run would take is the test's own,
// never the checkout's). Before C3-F9 the second test ran the gate past the check: `takeLock()`
// made the repository's `.turboslide/e2e.lock`, `runSpecs()` started Playwright against the dead
// port, `spawnSync`'s timeout killed the gate and the `finally` never released the lock; under the
// whole suite's load (check step 5) the lock stayed behind and blocked every Playwright step after.
// Since the fix round the gate holds the rule itself: under vitest a localhost run that names
// neither `--dry-run` nor `--lock` is refused before the scratch check (the last two tests below).
describe('the core gate refuses to start over scratch decks (C2-F29)', () => {
  /** A decks folder outside the repository: git does not answer for it, so the name rule decides. */
  function decksDir(names) {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-decks-'));
    for (const name of names) mkdirSync(join(dir, name), { recursive: true });
    return dir;
  }
  /** Starts the gate in a dry run with its own out folder and its own lock path under tmp. */
  function start(decks, extra = [], base = 'http://127.0.0.1:1') {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-out-'));
    const out = join(dir, 'out');
    const lock = join(dir, 'e2e.lock');
    const run = spawnSync(
      'node',
      [
        GATE,
        '--base',
        base,
        '--only',
        'specs',
        '--decks',
        decks,
        '--out',
        out,
        '--lock',
        lock,
        '--dry-run',
        ...extra,
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    return { run, out, lock };
  }

  it('names every scratch deck, runs nothing and exits 2', () => {
    const decks = decksDir(['untitled-20260917-abcd', 'e2e-realtime-xyz', 'gt-brand', 'fixture']);
    const { run, out, lock } = start(decks);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('2 scratch deck(s)');
    expect(run.stderr).toContain('untitled-20260917-abcd');
    expect(run.stderr).toContain('e2e-realtime-xyz');
    expect(run.stderr).not.toContain('gt-brand');
    expect(run.stderr).toContain('--allow-scratch');
    expect(existsSync(join(out, 'core-gate.json'))).toBe(false);
    expect(existsSync(lock)).toBe(false);
  }, 30_000);

  it('starts over an empty decks folder and over scratch with --allow-scratch', () => {
    /* the dry run stops right after the check, so a start is exit 0 with the plan line and no
       scratch sentence; the refusal would have been exit 2 on stderr */
    const clean = start(decksDir(['gt-brand']));
    expect(clean.run.stderr, clean.run.stderr).toBe('');
    expect(clean.run.status).toBe(0);
    expect(clean.run.stdout).toContain('core-gate: dry run against http://127.0.0.1:1');
    expect(clean.run.stdout).toContain('(0 scratch deck(s))');
    const allowed = start(decksDir(['untitled-20260917-abcd']), ['--allow-scratch']);
    expect(allowed.run.status).toBe(0);
    expect(allowed.run.stdout).toContain('by --allow-scratch: untitled-20260917-abcd');
    expect(allowed.run.stdout).toContain('(1 scratch deck(s))');
  }, 30_000);

  it('reads nothing under decks/ for a deployment base and keeps the refusal for localhost (C3-F10)', () => {
    /* the same folder, two bases: a deployment's store is the Blob store and not the checkout's,
       so the deck another run holds under decks/ (the check chain's audit deck of VERIFICATION.md
       C3-F10) refuses a localhost run and is not read for a deployment run */
    const decks = decksDir(['untitled-20260918-og2g', 'gt-brand']);
    const deployment = start(decks, [], 'https://stub.invalid');
    expect(deployment.run.stderr, deployment.run.stderr).toBe('');
    expect(deployment.run.status).toBe(0);
    expect(deployment.run.stdout).toContain(
      `the scratch check read nothing under ${decks} (a deployment's store is not the checkout's)`,
    );
    expect(deployment.run.stdout).not.toContain('untitled-20260918-og2g');
    expect(deployment.run.stdout).not.toContain('scratch deck(s)');
    expect(deployment.run.stdout).toContain('the run would take no lock (a deployment)');
    const local = start(decks);
    expect(local.run.status).toBe(2);
    expect(local.run.stderr).toContain('1 scratch deck(s)');
    expect(local.run.stderr).toContain('untitled-20260918-og2g');
    expect(local.run.stderr).not.toContain('gt-brand');
  }, 30_000);
});

describe('the core gate never takes the checkout lock from a unit test (C3-F9)', () => {
  function start(base) {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-lock-'));
    const decks = join(dir, 'decks');
    mkdirSync(join(decks, 'gt-brand'), { recursive: true });
    const lock = join(dir, 'e2e.lock');
    const run = spawnSync(
      'node',
      [
        GATE,
        '--base',
        base,
        '--only',
        'specs',
        '--decks',
        decks,
        '--out',
        join(dir, 'out'),
        '--lock',
        lock,
        '--dry-run',
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    return { run, lock, out: join(dir, 'out') };
  }

  it('plans the --lock path for a localhost base and takes it in no dry run', () => {
    const { run, lock, out } = start('http://127.0.0.1:1');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`the run would take the lock ${lock}`);
    expect(run.stdout).not.toContain(join('.turboslide', 'e2e.lock'));
    expect(run.stdout).toContain('Nothing ran and no lock was taken');
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(join(out, 'core-gate.json'))).toBe(false);
    expect(existsSync(join(out, 'core-matrix.md'))).toBe(false);
  }, 30_000);

  it('plans no lock for a deployment base', () => {
    const { run, lock } = start('https://stub.invalid');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('the run would take no lock (a deployment)');
    expect(existsSync(lock)).toBe(false);
  }, 30_000);

  /**
   * Starts the gate past the dry run, with VITEST set as a worker sets it, over a decks folder that
   * holds one scratch deck: were the guard gone, the scratch check would refuse next with its own
   * sentence, so neither test below reaches takeLock() whatever the gate does.
   */
  function startPast(withLock) {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-guard-'));
    const decks = join(dir, 'decks');
    mkdirSync(join(decks, 'untitled-20260917-abcd'), { recursive: true });
    const lock = join(dir, 'e2e.lock');
    const args = [GATE, '--base', 'http://127.0.0.1:1', '--only', 'specs', '--decks', decks];
    args.push('--out', join(dir, 'out'));
    if (withLock) args.push('--lock', lock);
    const run = spawnSync('node', args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, VITEST: 'true' },
    });
    return { run, lock, out: join(dir, 'out') };
  }

  it('refuses a localhost run under vitest that names neither --dry-run nor --lock, before the scratch check', () => {
    const { run, lock, out } = startPast(false);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('under vitest');
    expect(run.stderr).toContain('--lock');
    expect(run.stderr).toContain(join('.turboslide', 'e2e.lock'));
    expect(run.stderr).not.toContain('scratch deck(s)');
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(join(out, 'core-gate.json'))).toBe(false);
  }, 30_000);

  it('lets --lock past the guard, and the scratch check refuses next before the named lock is made', () => {
    const { run, lock, out } = startPast(true);
    expect(run.status).toBe(2);
    expect(run.stderr).not.toContain('under vitest');
    expect(run.stderr).toContain('1 scratch deck(s)');
    expect(run.stderr).toContain('untitled-20260917-abcd');
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(join(out, 'core-gate.json'))).toBe(false);
  }, 30_000);
});

describe('the gate refuses an --only value that names no driver (s2.md S2-R4)', () => {
  it('exits 2 with the usage line and runs nothing when --only carries an area list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-only-'));
    const out = join(dir, 'out');
    const run = spawnSync(
      'node',
      [GATE, '--base', 'http://127.0.0.1:1', '--only', 'text,slides', '--out', out, '--dry-run'],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--only takes probe or specs, not "text,slides"');
    expect(run.stderr).toContain('--spec <areas>');
    expect(run.stderr).toContain('usage: node scripts/probes/core-gate.mjs');
    expect(run.stdout).toBe('');
    expect(existsSync(join(out, 'core-gate.json'))).toBe(false);
  }, 30_000);

  it('still takes probe and specs', () => {
    const run = spawnSync(
      'node',
      [GATE, '--base', 'https://stub.invalid', '--only', 'probe', '--dry-run'],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('--only takes probe or specs');
  }, 30_000);
});

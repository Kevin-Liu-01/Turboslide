import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CORE_MATRIX, CORE_SPEC_DRIVERS, localRows } from './core-matrix.mjs';

// The core gate's tail (docs/FOCUS.md 6.2; VERIFICATION.md F3): after the drivers the gate merges
// every row by id, writes core-gate.json, core-matrix.md and the `--matrix` ledger copy, prints
// the verdict line and exits by the verdict. F3 was a ReferenceError at that point on every run,
// so the gate never printed a verdict and check step 32 could not pass. This test runs the gate
// with `--report <dir>` over a stub Playwright JSON report (no browser, no server) and pins the
// four outputs and the exit code, once with every spec row passing and once with one row failed.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = join(ROOT, 'scripts', 'probes', 'core-gate.mjs');
/* the spec rows alone: `--only specs` judges them, never the walk probe's or the cost probe's rows
   (the sync and costs round added the `cost-probe` driver) */
const specRows = CORE_MATRIX.filter((row) => CORE_SPEC_DRIVERS.includes(row.driver));

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
      /core-gate: \d+ rows: \d+ passed, 0 failed, 0 not driven \(0 manual\), 0 no step, 0 local rows not recorded; verdict ok; retries zero/,
    );
  }, 30_000);

  it('lists a failed row by id, names it in the verdict line and exits 1', () => {
    /* decks is unparkable (RETURN.md rule 2): its failed row blocks; a tables row without parks parks tables; a parks row parks its controls alone */
    const victim = specRows.find((row) => row.feature === 'decks' && row.parks === undefined).id;
    const parkable = specRows.find((row) => row.feature === 'tables' && row.parks === undefined).id;
    const withParks = specRows.find((row) => row.parks !== undefined);
    const { run, out } = runGate(stubReport([victim, parkable, withParks.id]));
    expect(run.status).toBe(1);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.failed).toBe(3);
    expect(summary.results[victim]).toBe('failed');
    expect(summary.verdict.ok).toBe(false);
    expect(summary.wouldPark).toEqual(['tables']);
    expect(summary.blocking.map((b) => b.id)).toEqual([victim]);
    expect(summary.wouldParkRows).toEqual([
      { id: withParks.id, parks: [...withParks.parks], result: 'failed' },
    ]);
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
    expect(run.stderr).toContain('--only takes probe, specs, cost or accounts, not "text,slides"');
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
    expect(run.stderr).not.toContain('--only takes probe, specs, cost or accounts');
  }, 30_000);
});

// The objects round fix round (docs/OBJECTS.md 6.2; the verifier's pass 1 finding 8): `--rows
// <ids>` runs and judges the spec rows named alone, `--areas <areas>` the walk probe's areas, so
// the ship step reads two export rows again on production without the whole export spec. Each is
// refused before any driver runs when it names another driver's row or area or is given without
// its driver; a narrowed run's summary names the narrowing under `narrowed`.
describe('the gate narrows one driver to rows or areas (the objects round fix round)', () => {
  const exportRows = specRows.filter((row) => row.driver === 'core/export.spec.ts');
  const syncRows = specRows.filter((row) => row.driver === 'core/sync.spec.ts');
  const twoExport = exportRows.slice(0, 2).map((row) => row.id);
  const oneSync = syncRows[0].id;
  const probeRow = CORE_MATRIX.find((row) => row.driver === 'probe --core');
  const escape = (id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function dryRun(extra) {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-narrow-'));
    const run = spawnSync(
      'node',
      [GATE, '--base', 'https://stub.invalid', '--out', join(dir, 'out'), '--dry-run', ...extra],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    return run;
  }

  it('judges the --rows named alone from a finished run and names them under narrowed', () => {
    const { run, out } = runGate(stubReport(), ['--rows', twoExport.join(',')]);
    expect(run.stderr, run.stderr).toBe('');
    expect(run.status).toBe(0);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.rows).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.noStep).toEqual([]);
    expect(summary.table.map((r) => r.id)).toEqual(twoExport);
    expect(summary.narrowed).toEqual({
      only: 'specs',
      spec: null,
      rows: twoExport,
      areas: null,
      costRows: null,
    });
    const failed = runGate(stubReport([twoExport[0]]), ['--rows', twoExport.join(',')]);
    expect(failed.run.status).toBe(1);
    const again = JSON.parse(readFileSync(join(failed.out, 'core-gate.json'), 'utf8'));
    expect(again.rows).toBe(2);
    expect(again.failed).toBe(1);
    expect(again.results[twoExport[0]]).toBe('failed');
  }, 30_000);

  it('plans the rows run over the rows own spec files with an anchored --grep', () => {
    const run = dryRun(['--only', 'specs', '--rows', `${twoExport[0]},${oneSync}`]);
    expect(run.stderr, run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`the core spec rows ${twoExport[0]}, ${oneSync}`);
    expect(run.stdout).toContain('apps/studio/e2e/core/export.spec.ts');
    expect(run.stdout).toContain('apps/studio/e2e/core/sync.spec.ts');
    expect(run.stdout).toContain(
      `--grep ${JSON.stringify(`(^| )(${escape(twoExport[0])}|${escape(oneSync)}): `)}`,
    );
    expect(run.stdout).toContain('2 rows judged');
    expect(run.stdout).toContain('Nothing ran and no lock was taken');
  }, 30_000);

  it('refuses --rows without --only specs, a row of another driver, and a row outside --spec', () => {
    const noDriver = dryRun(['--rows', twoExport[0]]);
    expect(noDriver.status).toBe(2);
    expect(noDriver.stderr).toContain('--rows narrows the core specs and needs --only specs');
    expect(noDriver.stdout).toBe('');
    const walkRow = dryRun(['--only', 'specs', '--rows', `${twoExport[0]},${probeRow.id}`]);
    expect(walkRow.status).toBe(2);
    expect(walkRow.stderr).toContain(`not a spec row: ${JSON.stringify(probeRow.id)}`);
    expect(walkRow.stderr).not.toContain(JSON.stringify(twoExport[0]));
    const outside = dryRun(['--only', 'specs', '--spec', 'export', '--rows', oneSync]);
    expect(outside.status).toBe(2);
    expect(outside.stderr).toContain(`--rows names rows outside the --spec files: ${oneSync}`);
    expect(outside.stderr).toContain('core/sync.spec.ts');
    const empty = dryRun(['--only', 'specs', '--rows', ',']);
    expect(empty.status).toBe(2);
    expect(empty.stderr).toContain('(none named)');
  }, 30_000);

  it('plans an --areas run over the walk probe and refuses an unknown area or another driver', () => {
    const tables = CORE_MATRIX.filter(
      (row) => row.driver === 'probe --core' && row.id.startsWith('tables.'),
    );
    const run = dryRun(['--only', 'probe', '--areas', 'tables']);
    expect(run.stderr, run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      `the walk probe over the areas tables (${tables.length} rows judged; the walk's modules tables)`,
    );
    /* an id area whose rows another module declares (the versions rows live in the share module;
       the people round, build/b5.md): the walk's --only names the module, the gate judges the ids */
    const versions = CORE_MATRIX.filter(
      (row) => row.driver === 'probe --core' && row.id.startsWith('versions.'),
    );
    const byModule = dryRun(['--only', 'probe', '--areas', 'versions']);
    expect(byModule.stderr, byModule.stderr).toBe('');
    expect(byModule.status).toBe(0);
    expect(byModule.stdout).toContain(
      `the walk probe over the areas versions (${versions.length} rows judged; the walk's modules share)`,
    );
    const unknown = dryRun(['--only', 'probe', '--areas', 'tables,nosuch']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('not one: "nosuch"');
    expect(unknown.stderr).toContain('tables');
    const specs = dryRun(['--only', 'specs', '--areas', 'tables']);
    expect(specs.status).toBe(2);
    expect(specs.stderr).toContain('--areas narrows the walk probe and needs --only probe');
  }, 30_000);

  it('judges the --areas named alone from a finished walk', () => {
    const tables = CORE_MATRIX.filter(
      (row) => row.driver === 'probe --core' && row.id.startsWith('tables.'),
    );
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-areas-'));
    writeFileSync(
      join(dir, 'core-walk.json'),
      JSON.stringify({
        deckId: 'stub',
        steps: tables.length,
        core: {
          exitCode: 0,
          table: tables.map((row) => ({ id: row.id, result: 'passed', reason: '' })),
        },
      }),
    );
    const out = join(dir, 'out');
    const run = spawnSync(
      'node',
      [
        GATE,
        '--base',
        'http://stub.invalid',
        '--only',
        'probe',
        '--areas',
        'tables',
        '--report',
        dir,
        '--out',
        out,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(run.stderr, run.stderr).toBe('');
    expect(run.status).toBe(0);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.rows).toBe(tables.length);
    expect(summary.passed).toBe(tables.length);
    expect(summary.noStep).toEqual([]);
    expect(summary.narrowed.areas).toEqual(['tables']);
    expect(summary.narrowed.only).toBe('probe');
  }, 30_000);
});

// The people round (docs/PEOPLE.md 6.2): `--only accounts` runs apps/studio/e2e/accounts.spec.ts
// against a node server with an identity database and judges the ten local rows alone; in every
// other run a local row is absent from the results and is listed apart under `local` with the
// reason, never counted as passed, never "no step" and never a reason to park.
describe('the gate judges the local rows through --only accounts and lists them apart otherwise', () => {
  const local = localRows();
  const accountsSpec = 'apps/studio/e2e/accounts.spec.ts';

  /** A Playwright JSON report of the accounts spec: one passed test per local row, `failing` failed, plus one untitled test. */
  function accountsReport(failing = []) {
    const specs = local.map((row) => {
      const failed = failing.includes(row.id);
      return {
        title: `${row.id}: ${row.interaction}`,
        file: accountsSpec,
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
      };
    });
    /* the spec's older tests carry no matrix id and are not judged */
    specs.push({
      title: 'the device authorization flow: a code from the terminal',
      file: accountsSpec,
      tests: [{ status: 'expected', results: [{ status: 'passed', retry: 0 }], annotations: [] }],
    });
    return {
      config: { projects: [{ retries: 0 }] },
      suites: [{ title: accountsSpec, specs }],
    };
  }

  function reportRun(files, extra) {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-accounts-'));
    for (const [name, json] of Object.entries(files))
      writeFileSync(join(dir, name), JSON.stringify(json));
    const out = join(dir, 'out');
    const run = spawnSync(
      'node',
      [GATE, '--base', 'http://stub.invalid', '--report', dir, '--out', out, ...extra],
      { cwd: ROOT, encoding: 'utf8' },
    );
    return { run, out };
  }

  it('plans the accounts spec in a dry run and refuses a spec row under --rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'core-gate-accounts-dry-'));
    const plan = spawnSync(
      'node',
      [
        GATE,
        '--base',
        'http://127.0.0.1:1',
        '--only',
        'accounts',
        '--decks',
        join(dir, 'decks'),
        '--out',
        join(dir, 'out'),
        '--lock',
        join(dir, 'e2e.lock'),
        '--dry-run',
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    expect(plan.stderr, plan.stderr).toBe('');
    expect(plan.status).toBe(0);
    expect(plan.stdout).toContain(`the accounts spec ${accountsSpec}`);
    expect(plan.stdout).toContain(`${local.length} local rows judged`);
    expect(plan.stdout).toContain(`the run would take the lock ${join(dir, 'e2e.lock')}`);
    const narrowed = spawnSync(
      'node',
      [
        GATE,
        '--base',
        'https://stub.invalid',
        '--only',
        'accounts',
        '--rows',
        `${local[0].id},${local[1].id}`,
        '--out',
        join(dir, 'out2'),
        '--dry-run',
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    expect(narrowed.status).toBe(0);
    expect(narrowed.stdout).toContain(`narrowed to the local rows ${local[0].id}, ${local[1].id}`);
    expect(narrowed.stdout).toContain('2 local rows judged');
    const specRow = specRows[0].id;
    const refused = spawnSync(
      'node',
      [
        GATE,
        '--base',
        'https://stub.invalid',
        '--only',
        'accounts',
        '--rows',
        specRow,
        '--dry-run',
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 20_000 },
    );
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain(`not a local row: ${JSON.stringify(specRow)}`);
  }, 40_000);

  it('judges the ten local rows alone from an accounts run, red rows included', () => {
    const clean = reportRun({ 'accounts.json': accountsReport() }, ['--only', 'accounts']);
    expect(clean.run.stderr, clean.run.stderr).toBe('');
    expect(clean.run.status).toBe(0);
    const summary = JSON.parse(readFileSync(join(clean.out, 'core-gate.json'), 'utf8'));
    expect(summary.rows).toBe(local.length);
    expect(summary.passed).toBe(local.length);
    expect(summary.noStep).toEqual([]);
    expect(summary.local).toEqual([]);
    expect(summary.accounts.retries).toBe(0);
    expect(summary.specs).toBeNull();
    expect(summary.narrowed.only).toBe('accounts');
    expect(summary.table.map((r) => r.id)).toEqual(local.map((r) => r.id));
    /* a red local row without parks blocks share; a red picture row parks its two controls */
    const badge = 'people.verified-badge';
    const upload = 'people.avatar-upload';
    const red = reportRun({ 'accounts.json': accountsReport([badge, upload]) }, [
      '--only',
      'accounts',
    ]);
    expect(red.run.status).toBe(1);
    const again = JSON.parse(readFileSync(join(red.out, 'core-gate.json'), 'utf8'));
    expect(again.failed).toBe(2);
    expect(again.results[badge]).toBe('failed');
    expect(again.blocking.map((b) => b.id)).toEqual([badge]);
    expect(again.wouldParkRows).toEqual([
      {
        id: upload,
        parks: ['dialog.avatarBuilder.panel.picture', 'dialog.avatarBuilder.file'],
        result: 'failed',
      },
    ]);
    expect(again.wouldPark).toEqual([]);
    expect(red.run.stdout).toContain(`failing the gate: ${badge} (failed), ${upload} (failed)`);
  }, 40_000);

  it('lists the local rows apart in a run that did not record them, never as no step and never blocking', () => {
    /* a specs run over the whole matrix's judgement: every core spec row passed, the walk and the
       cost probe unrun (their rows read no step, which is what fails this run), the local rows
       absent and listed apart */
    const { run, out } = reportRun({ 'specs.json': stubReport() }, []);
    const summary = JSON.parse(readFileSync(join(out, 'core-gate.json'), 'utf8'));
    expect(summary.local).toEqual(local.map((r) => r.id));
    for (const id of local.map((r) => r.id)) {
      expect(summary.noStep).not.toContain(id);
      const row = summary.table.find((r) => r.id === id);
      expect(row.result).toBe('not driven');
      expect(row.reason).toBe('no identity database on this base');
    }
    expect(summary.verdict.failures.map((f) => f.id)).not.toContain(local[0].id);
    expect(summary.blocking.map((b) => b.id)).not.toContain(local[0].id);
    expect(summary.wouldParkRows.map((r) => r.id)).not.toContain('people.avatar-upload');
    const table = readFileSync(join(out, 'core-matrix.md'), 'utf8');
    expect(table).toContain('## Local rows this run did not record (docs/PEOPLE.md 6.2)');
    expect(table).toContain(`${local.length} local rows this run did not record`);
    expect(run.stdout).toContain(`${local.length} local rows not recorded`);
    /* the walk probe's rows are no step in this stub, so the run exits 1 for them and not for the local rows */
    expect(run.status).toBe(1);
    expect(summary.noStep.length).toBe(
      CORE_MATRIX.filter((r) => !CORE_SPEC_DRIVERS.includes(r.driver) && !localRows().includes(r))
        .length,
    );
  }, 40_000);
});

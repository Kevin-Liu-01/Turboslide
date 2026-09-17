import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

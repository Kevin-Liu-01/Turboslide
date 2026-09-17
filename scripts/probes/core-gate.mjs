#!/usr/bin/env node
// The core gate (docs/FOCUS.md section 6; the drivers lane of the focus round): one command that
// runs every driver of the matrix against one base and judges the whole matrix. It runs the walk
// probe in --core mode (scripts/probes/editor-walk-probe.mjs --core) and the seven core specs
// under apps/studio/e2e/core/ with Playwright's JSON reporter, merges every row's result by its
// matrix id, writes the matrix table with every row id and its result, and exits 1 on any
// failed or not driven driven row unless its feature is in the committed parked list (6.2;
// `surface` cannot be listed). A row no driver recorded is "no step" and fails the run whatever
// the list says. Not driven rows are listed by id and reason and are never counted as passed.
//
//   node scripts/probes/core-gate.mjs --base <origin> [--out <dir>] [--parked <ship json>]
//     [--only probe|specs] [--spec <area>[,<area>]] [--shots] [--matrix <path>] [--report <dir>]
// `--matrix <path>` also writes the merged summary (the rows by id with their result and reason,
// the counts, the verdict and the `results` map) to that path, the ledger copy a ship note or the
// verifier keeps under docs/gslides-parity/focus/verification/. `--report <dir>` runs no driver:
// it reads a finished run's core-walk.json and specs.json from that directory and renders the
// merge, the table and the verdict again (the fix round's test of the gate's tail runs it on a
// stub report; a ship note can re-render a ledger copy from it).
//
// `--out` (default .turboslide/core-gate) receives core-walk.json, core-walk.md, specs.json,
// core-matrix.md and core-gate.json. On a preview the drivers send VERCEL_OIDC_TOKEN as
// x-vercel-trusted-oidc-idp-token; on production nothing. Against a localhost base the gate
// takes .turboslide/e2e.lock for the whole run (mkdir, released after; a lock older than two
// hours with no Playwright or probe process alive is orphaned); a run against a deployment
// needs no lock. `retries` is read from the Playwright report and asserted to be zero (6.2).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_MATRIX,
  CORE_SPEC_DRIVERS,
  PROBE_DRIVER,
  coreRow,
  isManualRow,
  parkedFeaturesOf,
  readParkedList,
  rowsForDriver,
  shipVerdict,
} from './core-matrix.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error(
    'usage: node scripts/probes/core-gate.mjs --base <origin> [--out <dir>] [--matrix <path>] [--parked <ship json>] [--only probe|specs] [--spec <areas>]',
  );
  process.exit(2);
}
const OUT = resolve(ROOT, arg('out', '.turboslide/core-gate'));
const PARKED = arg('parked', null);
const ONLY = arg('only', null);
const SPEC_ONLY = arg('spec', null);
const MATRIX_OUT = arg('matrix', null);
/** A finished run's directory to re-render from, instead of running the drivers. */
const REPORT = arg('report', null);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const LOCK = join(ROOT, '.turboslide', 'e2e.lock');

/** The tree's commit, for the run's JSON; the working tree may carry uncommitted edits (the ledger names that). */
function gitCommit() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : null;
}
mkdirSync(OUT, { recursive: true });

const parked = PARKED
  ? readParkedList(resolve(ROOT, PARKED))
  : { commit: null, parkedFeatures: [] };
const startedAt = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Takes the e2e lock for a localhost base; an orphaned lock (two hours, no browser alive) is removed. */
async function takeLock() {
  if (!LOCAL) return false;
  for (;;) {
    try {
      mkdirSync(LOCK);
      return true;
    } catch {
      const age = Date.now() - statSync(LOCK).mtimeMs;
      const alive =
        spawnSync('pgrep', ['-f', 'playwright|editor-walk-probe|chrome-headless-shell'], {
          encoding: 'utf8',
        }).stdout.trim() !== '';
      if (age > 2 * 60 * 60_000 && !alive) {
        console.log('core-gate: removing an orphaned e2e.lock');
        rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      await sleep(5000);
    }
  }
}
const releaseLock = (held) => {
  if (held) rmSync(LOCK, { recursive: true, force: true });
};

// ---------------------------------------------------------------------------------------------
// the walk probe in --core mode

function runProbe() {
  const json = join(OUT, 'core-walk.json');
  const matrix = join(OUT, 'core-walk.md');
  const args = [
    'scripts/probes/editor-walk-probe.mjs',
    '--core',
    '--base',
    BASE,
    '--json',
    json,
    '--matrix',
    matrix,
  ];
  if (flag('shots')) args.push('--shots', join(OUT, 'shots'));
  if (PARKED) args.push('--parked', resolve(ROOT, PARKED));
  console.log(`core-gate: node ${args.join(' ')}`);
  const t = Date.now();
  const result = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  return readProbe(json, result.status, Date.now() - t);
}

/** The probe's rows from its core-walk.json: every row id with its result and reason. */
function readProbe(json, exit, ms) {
  const results = {};
  const reasons = {};
  if (existsSync(json)) {
    const summary = JSON.parse(readFileSync(json, 'utf8'));
    for (const row of summary.core?.table ?? []) {
      if (row.result === 'no step') continue;
      results[row.id] = row.result;
      if (row.reason) reasons[row.id] = row.reason;
    }
    return {
      exit: exit ?? summary.core?.exitCode ?? null,
      ms,
      results,
      reasons,
      json,
      deckId: summary.deckId,
      steps: summary.steps,
    };
  }
  return {
    exit: exit ?? 1,
    ms,
    results,
    reasons,
    json: null,
    error: 'the probe wrote no JSON',
  };
}

// ---------------------------------------------------------------------------------------------
// the core specs with the JSON reporter

/** Walks a Playwright JSON report and yields every test with its spec title and outcome. */
function* testsOf(suite) {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? []) yield { title: spec.title, file: spec.file, test };
  for (const child of suite.suites ?? []) yield* testsOf(child);
}
const idOfTitle = (title) => {
  const head = title.split(':')[0]?.trim() ?? '';
  return /^[a-z][a-z0-9]*(?:\.[a-z0-9-]+){1,3}$/.test(head) ? head : null;
};

function runSpecs() {
  const areas = SPEC_ONLY
    ? SPEC_ONLY.split(',').map((s) => s.trim())
    : CORE_SPEC_DRIVERS.map((d) => d.replace(/^core\//, '').replace(/\.spec\.ts$/, ''));
  const files = areas.map((a) => `apps/studio/e2e/core/${a}.spec.ts`);
  const report = join(OUT, 'specs.json');
  rmSync(report, { force: true });
  /* the run's own output folder for traces and screenshots: every Playwright start on the
     machine clears the shared `.turboslide/playwright`, which deleted a failed row's trace mid
     run (b4.md fix round, b3 R22) */
  const args = ['test', ...files, '--reporter=list,json', '--output', join(OUT, 'playwright')];
  console.log(
    `core-gate: node_modules/.bin/playwright ${args.join(' ')} (PLAYWRIGHT_BASE_URL=${BASE})`,
  );
  const t = Date.now();
  const result = spawnSync(join(ROOT, 'node_modules', '.bin', 'playwright'), args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BASE_URL: BASE, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
  });
  return readSpecs(report, result.status, Date.now() - t);
}

/** The specs' rows from Playwright's JSON report: every matrix id in a title with its outcome. */
function readSpecs(report, exit, ms) {
  const results = {};
  const reasons = {};
  let retries = null;
  let retried = 0;
  if (existsSync(report)) {
    const json = JSON.parse(readFileSync(report, 'utf8'));
    retries = Math.max(0, ...(json.config?.projects ?? []).map((p) => p.retries ?? 0));
    for (const { title, test } of testsOf({ suites: json.suites ?? [] })) {
      const id = idOfTitle(title);
      if (id === null) continue;
      const attempts = test.results ?? [];
      if (attempts.some((r) => r.retry > 0)) retried += 1;
      const last = attempts[attempts.length - 1];
      let result;
      let reason = '';
      if (test.status === 'skipped' || last?.status === 'skipped') {
        result = 'not driven';
        reason = (test.annotations ?? []).find((a) => a.type === 'skip')?.description ?? 'skipped';
      } else if (test.status === 'expected' && last?.status === 'passed') {
        result = 'passed';
      } else {
        result = 'failed';
        reason = (last?.error?.message ?? last?.status ?? 'failed').split('\n')[0].slice(0, 300);
      }
      // a row with several tests passes only when every test passes
      const prior = results[id];
      if (
        prior === undefined ||
        result === 'failed' ||
        (result === 'not driven' && prior === 'passed')
      ) {
        results[id] = prior === 'failed' ? 'failed' : result;
        if (reason && !(prior === 'failed')) reasons[id] = reason;
      }
    }
    return { exit, ms, results, reasons, report, retries, retried };
  }
  return {
    exit: exit ?? 1,
    ms,
    results,
    reasons,
    report: null,
    retries,
    retried,
    error: 'Playwright wrote no JSON report',
  };
}

// ---------------------------------------------------------------------------------------------
// the merge and the verdict

let probe = null;
let specs = null;
if (REPORT !== null) {
  const dir = resolve(ROOT, REPORT);
  console.log(`core-gate: re-rendering the run under ${dir} (no driver runs)`);
  if (ONLY !== 'specs') probe = readProbe(join(dir, 'core-walk.json'), null, 0);
  if (ONLY !== 'probe') specs = readSpecs(join(dir, 'specs.json'), null, 0);
} else {
  const held = await takeLock();
  try {
    if (ONLY !== 'specs') probe = runProbe();
    if (ONLY !== 'probe') specs = runSpecs();
  } finally {
    releaseLock(held);
  }
}

const results = { ...(probe?.results ?? {}), ...(specs?.results ?? {}) };
const reasons = { ...(probe?.reasons ?? {}), ...(specs?.reasons ?? {}) };
const judged =
  ONLY === 'probe'
    ? rowsForDriver(PROBE_DRIVER)
    : ONLY === 'specs'
      ? CORE_MATRIX.filter(
          (r) =>
            r.driver !== PROBE_DRIVER &&
            (!SPEC_ONLY ||
              SPEC_ONLY.split(',').some((a) => r.driver === `core/${a.trim()}.spec.ts`)),
        )
      : CORE_MATRIX;
const table = judged.map((row) => ({
  id: row.id,
  feature: row.feature,
  driver: row.driver,
  today: row.today,
  result: results[row.id] ?? 'no step',
  reason: results[row.id] === undefined ? 'no driver recorded this row' : (reasons[row.id] ?? ''),
}));
const noStep = table.filter((r) => r.result === 'no step').map((r) => r.id);
/* the manual rows of ruling (3): not driven by design, listed apart, never counted as passed */
const manual = table
  .filter((r) => r.result === 'not driven' && isManualRow(coreRow(r.id)))
  .map((r) => r.id);
const verdict = shipVerdict(results, parked.parkedFeatures, judged);
const parking = parkedFeaturesOf(results, judged);
const retriesOk = specs === null || (specs.retries === 0 && specs.retried === 0);
const count = (word) => table.filter((r) => r.result === word).length;
const exitCode = verdict.ok && noStep.length === 0 && retriesOk ? 0 : 1;

const summary = {
  base: BASE,
  startedAt: new Date(startedAt).toISOString(),
  ms: Date.now() - startedAt,
  parked,
  probe: probe && {
    exit: probe.exit,
    ms: probe.ms,
    json: probe.json,
    deckId: probe.deckId,
    steps: probe.steps,
    error: probe.error,
  },
  specs: specs && {
    exit: specs.exit,
    ms: specs.ms,
    report: specs.report,
    retries: specs.retries,
    retried: specs.retried,
    error: specs.error,
  },
  rows: table.length,
  passed: count('passed'),
  failed: count('failed'),
  notDriven: count('not driven'),
  manual,
  noStep,
  /* the run's results by row id, the shape docs/readme/what-works.mjs --results reads (b5.md R10) */
  commit: gitCommit(),
  origin: BASE,
  date: new Date(startedAt).toISOString().slice(0, 10),
  results,
  verdict,
  wouldPark: parking.parked,
  blocking: parking.blocking,
  retriesOk,
  exitCode,
  table,
};
writeFileSync(join(OUT, 'core-gate.json'), JSON.stringify(summary, null, 2));
if (MATRIX_OUT !== null) {
  const target = resolve(ROOT, MATRIX_OUT);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(summary, null, 2));
}

const esc = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .slice(0, 300);
const lines = [
  '# Core gate matrix',
  '',
  `Base ${BASE}, started ${summary.startedAt}, ${Math.round(summary.ms / 1000)} s. ${table.length} rows judged: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} of them manual, the checklist's: ${manual.join(', ') || 'none'}), ${noStep.length} no step. Verdict ${verdict.ok ? 'ok' : 'failed'}${parked.parkedFeatures.length > 0 ? ` with the committed parked list ${parked.parkedFeatures.join(', ')}` : ''}; retries ${specs === null ? 'no specs run' : `${specs.retries} configured, ${specs.retried} test(s) retried`}; exit ${exitCode}. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1): ${parking.parked.join(', ') || 'none'}; surface rows blocking the ship: ${parking.blocking.map((b) => b.id).join(', ') || 'none'}.`,
  '',
  '| Row | Feature | Driver | Today | Result | Reason |',
  '| --- | --- | --- | --- | --- | --- |',
  ...table.map(
    (r) =>
      `| \`${r.id}\` | ${r.feature} | ${r.driver} | ${r.today} | ${r.result} | ${esc(r.reason)} |`,
  ),
  '',
  '## Not driven rows, by id and reason',
  '',
  ...table.filter((r) => r.result === 'not driven').map((r) => `- \`${r.id}\`: ${esc(r.reason)}`),
  '',
  '## Failed rows, by id and reason',
  '',
  ...table.filter((r) => r.result === 'failed').map((r) => `- \`${r.id}\`: ${esc(r.reason)}`),
  '',
];
if (noStep.length > 0) lines.push('## No step', '', ...noStep.map((id) => `- \`${id}\``), '');
writeFileSync(join(OUT, 'core-matrix.md'), `${lines.join('\n')}\n`);

console.log(
  `\ncore-gate: ${table.length} rows: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} manual), ${noStep.length} no step; verdict ${verdict.ok ? 'ok' : 'failed'}; retries ${retriesOk ? 'zero' : 'NOT zero'}; ${Math.round(summary.ms / 1000)} s against ${BASE}; table ${join(OUT, 'core-matrix.md')}; exit ${exitCode}`,
);
if (!verdict.ok)
  console.log(
    `  failing the gate: ${verdict.failures.map((f) => `${f.id} (${f.result})`).join(', ')}`,
  );
process.exit(exitCode);

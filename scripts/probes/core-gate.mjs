#!/usr/bin/env node
// The core gate (docs/FOCUS.md section 6; the drivers lane of the focus round): one command that
// runs every driver of the matrix against one base and judges the whole matrix. It runs the walk
// probe in --core mode (scripts/probes/editor-walk-probe.mjs --core), the core specs under
// apps/studio/e2e/core/ with Playwright's JSON reporter and, since the sync and costs round
// (docs/SYNC.md 6.3), the cost probe (scripts/probes/sync-cost-probe.mjs --all: one page state per
// process for three minutes, every request the page made, sync.status.storeCalls sampled five
// times, the counts beside the ceilings in its JSON), merges every row's result by its
// matrix id, writes the matrix table with every row id and its result, and exits 1 on any
// failed or not driven driven row unless its feature is in the committed parked list (6.2;
// an unparkable feature cannot be listed) or the row is one of the list's `parkedRows` (a row
// carrying `parks`, docs/RETURN.md section 1 rule 2; the run's `wouldParkRows` names them). A row no driver recorded is "no step" and fails the run whatever
// the list says. Not driven rows are listed by id and reason and are never counted as passed.
//
//   node scripts/probes/core-gate.mjs --base <origin> [--out <dir>] [--parked <ship json>]
//     [--only probe|specs|cost] [--spec <area>[,<area>]] [--cost-rows <id>[,<id>]]
//     [--cost-minutes <n>] [--shots] [--matrix <path>] [--report <dir>]
//     [--allow-scratch] [--decks <dir>] [--dry-run] [--lock <path>]
// `--only cost` runs the cost probe alone and judges its rows alone; `--only specs` judges the spec
// rows alone and `--only probe` the walk probe's, so a driver's partial run never reads another
// driver's rows as "no step". `--cost-rows` narrows the cost probe to the rows named and
// `--cost-minutes` shortens each state's window for a smoke (the run of record keeps 3; the JSON
// names the minutes it ran). On a deployment the cost probe reads the bearer for sync.status
// from TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json and never prints it.
// The gate refuses to start while scratch decks sit under the repository's decks/ folder (every
// folder there git does not track; the check chains' spec runs left eight behind, VERIFICATION.md
// C2-F29): it prints them and exits 2, so a run never measures against a store carrying another
// run's leftovers and the leftovers are removed on purpose rather than shipped. The check is a
// localhost run's alone: a deployment's store is the Blob store and not the checkout's, so for a
// base that is not localhost the gate reads nothing under decks/ and says so (VERIFICATION.md
// C3-F10: a preview gate run exited 2 on the audit deck the check chain held on 4321 at that
// moment, and ran with `--allow-scratch` for a folder its deployment never reads). `--allow-scratch`
// runs anyway (a contributor's own local decks); `--decks <dir>` names another folder to read (the
// gate's own test). A `--report` re-render reads no store and skips the check. `--dry-run` stops
// after the check: it prints the plan (the base, the drivers, the lock a localhost run would take),
// takes no lock, runs no driver, writes no file and exits 0 (2 on the refusal). `--lock <path>`
// names the lock folder a localhost run takes instead of the repository's .turboslide/e2e.lock.
// Both exist for the gate's own test: a unit test never takes the checkout's lock, because a test
// killed on its timeout cannot release it (VERIFICATION.md C3-F9: check step 5 left one behind).
// The gate holds that rule itself: under vitest (`VITEST` is set in every worker and a spawned gate
// inherits it) a localhost run that names neither flag is refused with exit 2 before the scratch
// check, so a later test cannot take the checkout's lock by leaving the flags out.
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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_MATRIX,
  CORE_SPEC_DRIVERS,
  COST_PROBE_DRIVER,
  PROBE_DRIVER,
  coreRow,
  costRows,
  isCostRow,
  isManualRow,
  isMeasureRow,
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
const USAGE =
  'usage: node scripts/probes/core-gate.mjs --base <origin> [--out <dir>] [--matrix <path>] [--parked <ship json>] [--only probe|specs|cost] [--spec <areas>] [--cost-rows <ids>] [--cost-minutes <n>]';
if (!BASE) {
  console.error(USAGE);
  process.exit(2);
}
const OUT = resolve(ROOT, arg('out', '.turboslide/core-gate'));
const PARKED = arg('parked', null);
const ONLY = arg('only', null);
if (ONLY !== null && ONLY !== 'probe' && ONLY !== 'specs' && ONLY !== 'cost') {
  // `--only` names a driver, never an area: an unknown value used to run the whole matrix without
  // a word (s2.md S2-R4, `--only text,slides`); the areas go to `--spec` here and to the walk
  // probe's own `--only`
  console.error(
    `core-gate: --only takes probe, specs or cost, not ${JSON.stringify(ONLY)}; name the areas with --spec <areas> (the specs), the walk probe's --only (the walk) or --cost-rows <ids> (the cost probe)`,
  );
  console.error(USAGE);
  process.exit(2);
}
const SPEC_ONLY = arg('spec', null);
/** The cost rows the cost probe drives (`--cost-rows`); every cost row when absent. */
const COST_ROWS = arg('cost-rows', null);
/** The minutes of each cost state's window (`--cost-minutes`; the probe's own default, 3, when absent). */
const COST_MINUTES = arg('cost-minutes', null);
const MATRIX_OUT = arg('matrix', null);
/** A finished run's directory to re-render from, instead of running the drivers. */
const REPORT = arg('report', null);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
/** The lock folder a localhost run takes (the repository's e2e.lock; `--lock` for the gate's own test). */
const LOCK = resolve(ROOT, arg('lock', join('.turboslide', 'e2e.lock')));
/** `--dry-run`: stop after the scratch check, before the lock and the drivers. */
const DRY_RUN = flag('dry-run');
/** The decks folder the scratch check reads (the repository's by default). */
const DECKS_DIR = resolve(ROOT, arg('decks', 'decks'));
const ALLOW_SCRATCH = flag('allow-scratch');
/** Set in every vitest worker and inherited by the gate a test spawns (the guard of C3-F9). */
const UNDER_VITEST = (process.env.VITEST ?? '') !== '';
/** Whether `--lock` named a folder (the way past the guard for a test that must run a driver). */
const LOCK_NAMED = arg('lock', null) != null;

/**
 * The scratch decks under a decks folder: every folder git does not track (`git ls-files` from
 * the repository), or, when git does not answer, every folder named like a run's deck
 * (`e2e-*`, `untitled-*`, `scratch-*`, `<template>-<date>-<suffix>`). A tracked deck (the GT
 * brand deck, the fixture, the templates) is never scratch.
 */
export function scratchDecks(dir = DECKS_DIR) {
  if (!existsSync(dir)) return [];
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  const git = spawnSync('git', ['-C', ROOT, 'ls-files', '--', dir], { encoding: 'utf8' });
  if (git.status === 0) {
    const tracked = new Set(
      git.stdout
        .split('\n')
        .filter(Boolean)
        .map((f) => f.slice(f.indexOf('decks/') + 'decks/'.length).split('/')[0]),
    );
    return folders.filter((name) => !tracked.has(name));
  }
  const runDeck = /^(e2e-|untitled-|scratch-|[a-z-]+-\d{8}-[a-z0-9]{4}$)/;
  return folders.filter((name) => runDeck.test(name));
}

/** The tree's commit, for the run's JSON; the working tree may carry uncommitted edits (the ledger names that). */
function gitCommit() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : null;
}
mkdirSync(OUT, { recursive: true });

const parked = PARKED
  ? readParkedList(resolve(ROOT, PARKED))
  : { commit: null, parkedFeatures: [], parkedRows: [] };
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
// the cost probe (docs/SYNC.md 6.3)

function runCost() {
  const json = join(OUT, 'cost-probe.json');
  rmSync(json, { force: true });
  const args = ['scripts/probes/sync-cost-probe.mjs', '--all', '--base', BASE, '--out', json];
  if (COST_ROWS) args.push('--rows', COST_ROWS);
  if (COST_MINUTES) args.push('--minutes', COST_MINUTES);
  if (flag('shots')) args.push('--shots', join(OUT, 'cost-shots'));
  console.log(`core-gate: node ${args.join(' ')}`);
  const t = Date.now();
  const result = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  return readCost(json, result.status, Date.now() - t);
}

/**
 * The cost probe's rows from its JSON: every row id with its result, its reason and its counts
 * beside its ceilings, the last rendered as the row's measure lines (the shape of a spec's
 * `measure` annotations, so the ship note reads both kinds from one place).
 */
function readCost(json, exit, ms) {
  const results = {};
  const reasons = {};
  const measures = {};
  if (existsSync(json)) {
    const summary = JSON.parse(readFileSync(json, 'utf8'));
    for (const row of summary.rows ?? []) {
      if (!row?.id || !row.result) continue;
      results[row.id] = row.result;
      if (row.reason) reasons[row.id] = row.reason;
      if (Array.isArray(row.measures) && row.measures.length > 0) measures[row.id] = row.measures;
    }
    return {
      exit: exit ?? summary.exitCode ?? null,
      ms,
      results,
      reasons,
      measures,
      json,
      minutes: summary.minutes,
      instances: summary.instances,
    };
  }
  return {
    exit: exit ?? 1,
    ms,
    results,
    reasons,
    measures,
    json: null,
    error: 'the cost probe wrote no JSON',
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
  /* the `measure` annotations of a measurement row's tests (PRODUCT.md 8.2), by row id */
  const measures = {};
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
      const measured = [...(test.annotations ?? []), ...(last?.annotations ?? [])]
        .filter((a) => a.type === 'measure' && typeof a.description === 'string')
        .map((a) => a.description);
      if (measured.length > 0) measures[id] = [...(measures[id] ?? []), ...measured];
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
    return { exit, ms, results, reasons, measures, report, retries, retried };
  }
  return {
    exit: exit ?? 1,
    ms,
    results,
    reasons,
    measures,
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
let cost = null;
/** Which drivers this run covers: every one, or the one `--only` names. */
const runs = (driver) => ONLY === null || ONLY === driver;
if (REPORT !== null) {
  const dir = resolve(ROOT, REPORT);
  console.log(`core-gate: re-rendering the run under ${dir} (no driver runs)`);
  if (runs('probe')) probe = readProbe(join(dir, 'core-walk.json'), null, 0);
  if (runs('specs')) specs = readSpecs(join(dir, 'specs.json'), null, 0);
  /* a run from before the sync and costs round has no cost-probe.json; its rows then read no step */
  if (runs('cost') && existsSync(join(dir, 'cost-probe.json')))
    cost = readCost(join(dir, 'cost-probe.json'), null, 0);
} else {
  if (UNDER_VITEST && LOCAL && !DRY_RUN && !LOCK_NAMED) {
    console.error(
      `core-gate: a localhost run under vitest (VITEST is set) would take the checkout's lock ${LOCK}, which a test killed on its timeout cannot release (VERIFICATION.md C3-F9): pass --dry-run, or --lock <folder> outside the repository. Nothing ran; exit 2.`,
    );
    process.exit(2);
  }
  // the scratch check is a localhost run's: the checkout's decks/ is the store a localhost server
  // reads, while a deployment's store is the Blob store, so a deck another run holds under decks/
  // (the check chain's spec run on 4321, an audit deck) says nothing about the preview or the
  // production a deployment run measures (C3-F10)
  const scratch = LOCAL ? scratchDecks() : [];
  const scratchLine = LOCAL
    ? `the scratch check passed over ${DECKS_DIR} (${scratch.length} scratch deck(s))`
    : `the scratch check read nothing under ${DECKS_DIR} (a deployment's store is not the checkout's)`;
  if (scratch.length > 0 && !ALLOW_SCRATCH) {
    console.error(
      `core-gate: ${scratch.length} scratch deck(s) under ${DECKS_DIR} (folders git does not track): ${scratch.join(', ')}. A run leaves nothing behind, so these are another run's leftovers: remove them (each through the product, or the folder when its run is gone) or pass --allow-scratch to run anyway. Nothing ran; exit 2.`,
    );
    process.exit(2);
  }
  if (scratch.length > 0)
    console.log(
      `core-gate: running with ${scratch.length} scratch deck(s) under ${DECKS_DIR} by --allow-scratch: ${scratch.join(', ')}`,
    );
  if (!LOCAL) console.log(`core-gate: ${scratchLine}`);
  if (DRY_RUN) {
    const drivers =
      ONLY === 'probe'
        ? 'the walk probe'
        : ONLY === 'specs'
          ? 'the core specs'
          : ONLY === 'cost'
            ? 'the cost probe'
            : 'the walk probe, the core specs and the cost probe';
    console.log(
      `core-gate: dry run against ${BASE}: ${scratchLine}; the run would take ${LOCAL ? `the lock ${LOCK}` : 'no lock (a deployment)'} and run ${drivers}. Nothing ran and no lock was taken; exit 0.`,
    );
    process.exit(0);
  }
  const held = await takeLock();
  try {
    if (runs('probe')) probe = runProbe();
    if (runs('specs')) specs = runSpecs();
    if (runs('cost')) cost = runCost();
  } finally {
    releaseLock(held);
  }
}

const results = {
  ...(probe?.results ?? {}),
  ...(specs?.results ?? {}),
  ...(cost?.results ?? {}),
};
const reasons = {
  ...(probe?.reasons ?? {}),
  ...(specs?.reasons ?? {}),
  ...(cost?.reasons ?? {}),
};
/* the rows this run judges: every row, or the rows of the one driver `--only` names, narrowed by
   `--spec` (the specs) or `--cost-rows` (the cost probe); a driver's partial run never reads the
   other drivers' rows as no step */
const specRowsJudged = CORE_MATRIX.filter(
  (r) =>
    CORE_SPEC_DRIVERS.includes(r.driver) &&
    (!SPEC_ONLY || SPEC_ONLY.split(',').some((a) => r.driver === `core/${a.trim()}.spec.ts`)),
);
const costRowsJudged = costRows().filter(
  (r) => !COST_ROWS || COST_ROWS.split(',').some((id) => id.trim() === r.id),
);
const judged =
  ONLY === 'probe'
    ? rowsForDriver(PROBE_DRIVER)
    : ONLY === 'specs'
      ? specRowsJudged
      : ONLY === 'cost'
        ? costRowsJudged
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
/* the measurement rows (PRODUCT.md 8.2) and the cost rows (SYNC.md 6.1): their result, reason and
   recorded numbers, listed apart; a cost row's numbers are its counts beside its ceilings */
const measures = { ...(specs?.measures ?? {}), ...(cost?.measures ?? {}) };
const measured = table
  .filter((r) => isMeasureRow(coreRow(r.id)))
  .map((r) => ({
    id: r.id,
    result: r.result,
    reason: r.reason,
    measures: measures[r.id] ?? [],
    ...(isCostRow(coreRow(r.id)) ? { cost: true } : {}),
  }));
/* SYNC.md 6.2: a cost row over its ceiling holds the ship. The module's verdict records a measure
   row and never counts it, so the gate adds the cost probe's own reading: a cost row it judged
   as failed fails this run's exit code (the ship step reads the preview run's), while a not
   driven cost row stays recorded (the hidden row's visibility reason, a deployment without the
   bearer) and holds nothing. */
const costOverCeiling = table
  .filter((r) => isCostRow(coreRow(r.id)) && r.result === 'failed')
  .map((r) => r.id);
const verdict = shipVerdict(results, parked, judged);
const parking = parkedFeaturesOf(results, judged);
const retriesOk = specs === null || (specs.retries === 0 && specs.retried === 0);
const count = (word) => table.filter((r) => r.result === word).length;
const exitCode =
  verdict.ok && noStep.length === 0 && retriesOk && costOverCeiling.length === 0 ? 0 : 1;

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
  /* the cost probe (SYNC.md 6.3): its exit, its JSON, the minutes each state ran and the instances it saw */
  cost: cost && {
    exit: cost.exit,
    ms: cost.ms,
    json: cost.json,
    minutes: cost.minutes,
    instances: cost.instances,
    error: cost.error,
  },
  /* the cost rows over their ceiling in this run (SYNC.md 6.2: on the preview they hold the ship) */
  costOverCeiling,
  rows: table.length,
  passed: count('passed'),
  failed: count('failed'),
  notDriven: count('not driven'),
  manual,
  /* the measurement rows with their recorded numbers (PRODUCT.md 8.2); a red one never fails the verdict */
  measured,
  noStep,
  /* the run's results by row id, the shape docs/readme/what-works.mjs --results reads (b5.md R10) */
  commit: gitCommit(),
  origin: BASE,
  date: new Date(startedAt).toISOString().slice(0, 10),
  results,
  verdict,
  wouldPark: parking.parked,
  /* docs/RETURN.md section 1 rule 2: the red rows whose own controls a ship would keep parked */
  wouldParkRows: parking.parkedRows,
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
  `Base ${BASE}, started ${summary.startedAt}, ${Math.round(summary.ms / 1000)} s. ${table.length} rows judged: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} of them manual, the checklist's: ${manual.join(', ') || 'none'}), ${noStep.length} no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): ${measured.map((m) => `${m.id} ${m.result}${m.measures.length > 0 ? ` (${m.measures.join('; ')})` : ''}`).join('; ') || 'none judged'}. Cost rows over their ceiling in this run: ${costOverCeiling.join(', ') || 'none'}. Verdict ${verdict.ok ? 'ok' : 'failed'}${parked.parkedFeatures.length > 0 ? ` with the committed parked list ${parked.parkedFeatures.join(', ')}` : ''}${(parked.parkedRows ?? []).length > 0 ? ` and the parked rows ${parked.parkedRows.map((r) => r.id).join(', ')}` : ''}; retries ${specs === null ? 'no specs run' : `${specs.retries} configured, ${specs.retried} test(s) retried`}; exit ${exitCode}. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): ${parking.parked.join(', ') || 'none'}; rows whose own controls a ship would keep parked: ${parking.parkedRows.map((r) => `${r.id} (${r.parks.join(', ')})`).join('; ') || 'none'}; rows of an unparkable feature blocking the ship: ${parking.blocking.map((b) => b.id).join(', ') || 'none'}.`,
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
if (measured.length > 0)
  lines.push(
    '## Measurement rows, by id (PRODUCT.md 8.2; the cost rows of SYNC.md 6.1)',
    '',
    ...measured.map(
      (m) =>
        `- \`${m.id}\`: ${m.result}${m.reason ? ` (${esc(m.reason)})` : ''}${m.measures.length > 0 ? `; recorded ${esc(m.measures.join('; '))}` : ''}${m.cost ? ' (a cost row: over its ceiling on the preview it holds the ship)' : ''}`,
    ),
    '',
  );
writeFileSync(join(OUT, 'core-matrix.md'), `${lines.join('\n')}\n`);

console.log(
  `\ncore-gate: ${table.length} rows: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} manual), ${noStep.length} no step; verdict ${verdict.ok ? 'ok' : 'failed'}; retries ${retriesOk ? 'zero' : 'NOT zero'}; cost rows over their ceiling ${costOverCeiling.length}; ${Math.round(summary.ms / 1000)} s against ${BASE}; table ${join(OUT, 'core-matrix.md')}; exit ${exitCode}`,
);
if (!verdict.ok)
  console.log(
    `  failing the gate: ${verdict.failures.map((f) => `${f.id} (${f.result})`).join(', ')}`,
  );
if (costOverCeiling.length > 0)
  console.log(`  cost rows over their ceiling: ${costOverCeiling.join(', ')}`);
process.exit(exitCode);

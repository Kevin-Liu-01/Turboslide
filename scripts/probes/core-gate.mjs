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
//     [--only probe|specs|cost|accounts] [--spec <area>[,<area>]] [--rows <id>[,<id>]]
//     [--areas <area>[,<area>]] [--cost-rows <id>[,<id>]]
//     [--cost-minutes <n>] [--shots] [--matrix <path>] [--report <dir>]
//     [--allow-scratch] [--decks <dir>] [--dry-run] [--lock <path>]
// `--only cost` runs the cost probe alone and judges its rows alone; `--only specs` judges the spec
// rows alone and `--only probe` the walk probe's, so a driver's partial run never reads another
// driver's rows as "no step". The people round (docs/PEOPLE.md 6.2): `--only accounts` runs
// apps/studio/e2e/accounts.spec.ts with the JSON reporter against a node server started with an
// identity database (`TURBOSLIDE_AUTH_DB`, `TURBOSLIDE_MAIL=capture`; the spec reads the same
// `TURBOSLIDE_AUTH_DB` and `TURBOSLIDE_OVERLAY_DIR` from this process's environment to find the
// server's database and state folder) and judges the ten local rows alone (`--rows` narrows them);
// in every other run a local row is absent from the results and is listed apart under `local`
// with the reason "no identity database on this base", never counted as passed, never "no step"
// and never a reason to park, while a local row a run did record is judged like any row.
// `--cost-rows` narrows the cost probe to the rows named and
// `--cost-minutes` shortens each state's window for a smoke (the run of record keeps 3; the JSON
// names the minutes it ran). On a deployment the cost probe reads the bearer for sync.status
// from TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json and never prints it.
// The objects round fix round (docs/OBJECTS.md 6.2, the verifier's pass 1 finding 8): `--rows
// <ids>` with `--only specs` runs the tests of the spec rows named alone (Playwright's `--grep`
// on each id at the head of its title, over the rows' own spec files unless `--spec` names them)
// and judges those rows alone, so the ship step reads two export rows again on production in
// minutes rather than the whole export spec with its brand deck rows; `--areas <areas>` with
// `--only probe` passes the walk probe's `--only` and judges the rows of those areas alone. Both
// are narrowings of one driver, never a way past a row: the summary names them under `narrowed`,
// and the ledger of a narrowed run stands beside the run of record, never in its place.
// The blob tier's admission class (finding 8: a write acknowledged late, resent and admitted a
// second time by an instance behind the store, docs/SYNC.md 3.2, the sync owner's): a spec's
// setup that reads one more slide than it wrote is recorded not driven by the export rows with
// the count and the class in the reason, and read red by the sync rows with the same words, so
// the table names the mechanism; nothing here changes the merge or the verdict.
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
// The objects round (docs/OBJECTS.md 6.1, 6.3): the `gestures.*` rows are the arrange feature's
// (unparkable), driven by the walk probe's gestures area with the toolkit's frame capture; the two
// frame rows read `describe().state.gesture` and their reason carries the record (frames, maxMs,
// skipped, degraded) with the animation frames the drag had, so a frame row red on the preview
// alone with fewer than 6 animation frames (a throttled headless tab) is the recorded class of 6.3,
// rerun once, and a second reading fails the row; nothing here changes the merge or the verdict.
// The polish round (docs/POLISH.md 5.1): `--areas` names the walk's modules (core-walk/index.mjs
// AREAS, the names the walk's `--only` takes), and a module's rows are the ids it declares, so
// `--areas polish-tables` runs and judges the polish round's table rows alone while `--areas
// tables` keeps the tables module's own rows.
// The realtime round (docs/REALTIME.md 5.1 R5, 5.4): `--tier redis|blob|memory` names the
// realtime tier of the base and is recorded in the ledger (`tier` in core-gate.json and the table's
// first line) and passed to the cost probe, whose three store ceilings of the sync round are
// restated per tier; without it the probe reads the tier from the deck's `sync.status`.
// `--only realtime` runs the drivers of the `realtime` feature's rows alone and judges those rows
// alone: the core specs narrowed to the realtime spec rows (core/realtime.spec.ts, the two rows in
// core/share.spec.ts and the agent write row in e2e/agent-http.spec.ts, each by its id at the head
// of its title) and the walk probe over the module that declares the realtime probe row (the
// presence area), so a lane reads its rows in minutes on the memory tier and the ship step reads
// them narrowed on production; a run so narrowed is `narrowed.only: realtime` in the ledger and
// stands beside the run of record, never in its place. `--redis-url <url>` is passed to the cost
// probe for `cost.redis.commands` (INFO commandstats before and after; the value is never
// printed, the gate's command line shows `--redis-url <set>`); without it the probe reads
// TURBOSLIDE_PROBE_REDIS_URL or REDIS_URL from the environment a wrapper set, else the row is not
// driven with the reason. A spec driver's file is `specPathOf` (core-matrix.mjs): `core/<area>`
// under apps/studio/e2e/core/, `e2e/<name>` at the folder's root.
// The Cloudflare phase (docs/CLOUDFLARE.md section 2, 5.2 R5): `--tier do` is the fourth tier
// word, recorded in the ledger and passed to the cost probe with `--room-host` (the Worker host,
// else TURBOSLIDE_ROOM_HOST from a wrapper's environment; the room bearer is TURBOSLIDE_ROOM_BEARER
// in that environment alone and is never a flag) and `--cost-dashboard <json>` (the hand read
// figures of the hour for the two rows only the dashboard answers). The `setup` feature's rows
// are the `do` tier's (core-matrix.mjs TIER_FEATURES): a `--tier do` run judges them like any
// unparkable rows and any other run lists them apart under `tierRows` with the reason, never
// counted as passed, never "no step" and never a reason to park. `--only setup` runs their
// drivers alone and implies the `do` tier: the gate itself reads `GET /health` on the Worker
// (`setup.worker.health`: 200, `ok`, `protocol` 1, `realtime` on, within 2 s, `appOrigin` the
// base's origin, `commit` the base's build commit from `GET /api/agent` or the sha `--known-skew`
// names), the two browser spec narrowed to `setup.do.two-instances` (A on the base, B on
// `--second-base`, which rides to the spec as PLAYWRIGHT_SECOND_BASE_URL and REALTIME_BASES), and
// the two hand rows from the files given to it: `--caps-before <json>` and `--caps-after <json>`
// (the dashboard's daily Durable Object requests, rows written and Worker requests around the one
// hosted run; `setup.free-plan.caps` passes when the differences are under 10,000 requests and
// 20,000 rows written) and `--memory-reading <json>` (the verifier's reading of `setup.do.memory`
// with its `result` and `reason`); a hand row without its file stays not driven with the flag
// named. The ledger records `secondBase`, `roomHost`, `health`, `freePlanCaps` and
// `memoryReading` beside `tier`.
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
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_MATRIX,
  CORE_SPEC_DRIVERS,
  COST_PROBE_DRIVER,
  LOCAL_ABSENT_REASON,
  LOCAL_SPEC_DRIVERS,
  PROBE_DRIVER,
  areaOf,
  coreRow,
  costRows,
  isCostRow,
  isLocalRow,
  isManualRow,
  isMeasureRow,
  localRows,
  parkedFeaturesOf,
  readParkedList,
  rowsForDriver,
  rowsForFeature,
  shipVerdict,
  specPathOf,
  tierAbsentReason,
  tierRows,
} from './core-matrix.mjs';
import { declaredIds } from './core-walk/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
const USAGE =
  'usage: node scripts/probes/core-gate.mjs --base <origin> [--out <dir>] [--matrix <path>] [--parked <ship json>] [--only probe|specs|cost|accounts|realtime|setup] [--spec <areas>] [--rows <ids>] [--areas <areas>] [--cost-rows <ids>] [--cost-minutes <n>] [--tier redis|blob|memory|do] [--redis-url <url>] [--second-base <origin>] [--room-host <host>] [--known-skew <sha>] [--caps-before <json>] [--caps-after <json>] [--memory-reading <json>] [--cost-dashboard <json>]';
if (!BASE) {
  console.error(USAGE);
  process.exit(2);
}
const OUT = resolve(ROOT, arg('out', '.turboslide/core-gate'));
const PARKED = arg('parked', null);
const ONLY = arg('only', null);
/**
 * The drivers `--only` names (docs/PEOPLE.md 6.2 added the accounts spec) and the one feature
 * narrowing (docs/REALTIME.md 5.1 R5: `realtime`, the realtime rows' drivers and rows alone).
 */
const ONLY_VALUES = ['probe', 'specs', 'cost', 'accounts', 'realtime', 'setup'];
/** The realtime tier of the base (`--tier`), recorded in the ledger and passed to the cost probe; `do` since the Cloudflare phase. */
const TIER_VALUES = ['redis', 'blob', 'memory', 'do'];
const TIER_ARG = arg('tier', null);
if (TIER_ARG !== null && !TIER_VALUES.includes(TIER_ARG)) {
  console.error(
    `core-gate: --tier takes redis, blob, memory or do, not ${JSON.stringify(TIER_ARG)}`,
  );
  console.error(USAGE);
  process.exit(2);
}
/* `--only setup` reads the do tier's rows and implies it (docs/CLOUDFLARE.md 2.3); another tier named with it is a contradiction */
if (ONLY === 'setup' && TIER_ARG !== null && TIER_ARG !== 'do') {
  console.error(
    `core-gate: --only setup reads the do tier's rows and implies --tier do; --tier ${TIER_ARG} contradicts it`,
  );
  console.error(USAGE);
  process.exit(2);
}
const TIER = ONLY === 'setup' ? 'do' : TIER_ARG;
/** B's origin for the two browser specs (`--second-base`): PLAYWRIGHT_SECOND_BASE_URL and REALTIME_BASES ride to Playwright; null for one origin. */
const SECOND_BASE = (arg('second-base', null) ?? '').replace(/\/$/, '') || null;
/** The Worker host of the do tier (`--room-host`, else TURBOSLIDE_ROOM_HOST); the bearer stays in the environment and is never a flag. */
const ROOM_HOST = arg('room-host', null) ?? process.env.TURBOSLIDE_ROOM_HOST ?? null;
/** `http` to the Worker on a checkout (TURBOSLIDE_ROOM_INSECURE=1 or a loopback host). */
const ROOM_INSECURE =
  process.env.TURBOSLIDE_ROOM_INSECURE === '1' ||
  /^(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(ROOM_HOST ?? '');
/** A Worker commit named as a known skew against the base's build commit (`--known-skew <sha>`). */
const KNOWN_SKEW = arg('known-skew', null);
/** The two hand rows' files (docs/CLOUDFLARE.md 2.3): the dashboard's caps before and after, the verifier's memory reading. */
const CAPS_BEFORE = arg('caps-before', null);
const CAPS_AFTER = arg('caps-after', null);
const MEMORY_READING = arg('memory-reading', null);
/** The hand read dashboard figures of the cost probe's hour (`--cost-dashboard <json>`), passed through. */
const COST_DASHBOARD = arg('cost-dashboard', null);
/** The Redis URL for `cost.redis.commands`, passed through to the cost probe and never printed. */
const REDIS_URL_ARG = arg('redis-url', null);
if (ONLY !== null && !ONLY_VALUES.includes(ONLY)) {
  // `--only` names a driver, never an area: an unknown value used to run the whole matrix without
  // a word (s2.md S2-R4, `--only text,slides`); the areas go to `--spec` here and to the walk
  // probe's own `--only`
  console.error(
    `core-gate: --only takes probe, specs, cost, accounts, realtime or setup, not ${JSON.stringify(ONLY)}; name the areas with --spec <areas> (the specs), the walk probe's --only (the walk) or --cost-rows <ids> (the cost probe)`,
  );
  console.error(USAGE);
  process.exit(2);
}
/** The accounts spec of the local rows (docs/PEOPLE.md 6.2), as the gate runs it. */
const ACCOUNTS_SPEC = 'apps/studio/e2e/accounts.spec.ts';
const SPEC_ONLY = arg('spec', null);
/** A comma list flag as its trimmed, non empty items; null when absent. */
const listArg = (name) => {
  const value = arg(name, null);
  if (value === null) return null;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
};
/**
 * The spec rows a `--rows` run drives and judges alone (`--only specs`), by id; the walk areas an
 * `--areas` run drives and judges alone (`--only probe`). Each is refused with exit 2 before any
 * driver runs when it names another driver's row or area, or is given without its driver, so a
 * narrowing typed wrong never runs the whole matrix in silence (the rule of `--only` above).
 */
const ROWS_ONLY = listArg('rows');
const AREAS_ONLY = listArg('areas');
/**
 * The realtime feature's rows (docs/REALTIME.md section 2) an `--only realtime` run drives and
 * judges alone: its spec rows by id (the specs' `--grep`) and its probe rows through the walk
 * modules that declare them.
 */
const REALTIME_ROWS = rowsForFeature('realtime');
const REALTIME_SPEC_IDS = REALTIME_ROWS.filter((r) => CORE_SPEC_DRIVERS.includes(r.driver)).map(
  (r) => r.id,
);
const REALTIME_PROBE_ROWS = REALTIME_ROWS.filter((r) => r.driver === PROBE_DRIVER);
/**
 * The setup rows of the do tier (docs/CLOUDFLARE.md 2.3; core-matrix.mjs TIER_FEATURES): judged
 * by a `--tier do` run or an `--only setup` run, listed apart by every other run. Their spec rows
 * ride Playwright's `--grep` like the realtime rows'; the gate's own rows (`core-gate`) are the
 * health read and the two hand rows.
 */
const SETUP_ROWS = rowsForFeature('setup');
const SETUP_SPEC_IDS = SETUP_ROWS.filter((r) => CORE_SPEC_DRIVERS.includes(r.driver)).map(
  (r) => r.id,
);
/** True when this run judges the tier rows (the setup rows): the run is on their tier. */
const TIER_ROWS_JUDGED = TIER === 'do';
/** Every probe row's walk module (core-walk/index.mjs `declaredIds`: id to module name). */
const WALK_MODULE_OF = declaredIds();
/** The walk's module names, the names its `--only` takes. */
const WALK_MODULES = new Set([...WALK_MODULE_OF.values()]);
/**
 * True when a probe row is in the area `--areas` names. A module's name names the rows that
 * module declares and no other (the polish round, docs/POLISH.md 5.1: `polish-tables` drives
 * `tables.*` rows, so `tables` is the tables module's own 48 rows); a name that is no module is
 * an id area, the rows whose id starts with it wherever they are declared (the people round,
 * build/b5.md: the versions and comments rows live in the share module). The ship step's third
 * attempt merged the two rules.
 */
function inArea(row, area) {
  return (
    WALK_MODULE_OF.get(row.id) === area || (!WALK_MODULES.has(area) && areaOf(row.id) === area)
  );
}
if (ROWS_ONLY !== null) {
  if (ONLY !== 'specs' && ONLY !== 'accounts') {
    console.error(
      `core-gate: --rows narrows the core specs and needs --only specs, or the local rows and needs --only accounts (the walk probe's rows are narrowed by area with --areas, the cost probe's with --cost-rows)`,
    );
    console.error(USAGE);
    process.exit(2);
  }
  /* `--only specs` takes core spec rows, `--only accounts` the local rows (docs/PEOPLE.md 6.2) */
  const drivers = ONLY === 'accounts' ? LOCAL_SPEC_DRIVERS : CORE_SPEC_DRIVERS;
  const unknown = ROWS_ONLY.filter((id) => {
    const row = CORE_MATRIX.find((r) => r.id === id);
    return row === undefined || !drivers.includes(row.driver);
  });
  if (ROWS_ONLY.length === 0 || unknown.length > 0) {
    console.error(
      ONLY === 'accounts'
        ? `core-gate: --rows with --only accounts takes local row ids (a row whose driver is e2e/accounts.spec.ts); not a local row: ${unknown.map((id) => JSON.stringify(id)).join(', ') || '(none named)'}`
        : `core-gate: --rows takes core spec row ids (a row whose driver is core/<area>.spec.ts); not a spec row: ${unknown.map((id) => JSON.stringify(id)).join(', ') || '(none named)'}`,
    );
    console.error(USAGE);
    process.exit(2);
  }
  if (SPEC_ONLY !== null) {
    const files = SPEC_ONLY.split(',').map((a) => `core/${a.trim()}.spec.ts`);
    const outside = ROWS_ONLY.filter((id) => !files.includes(coreRow(id).driver));
    if (outside.length > 0) {
      console.error(
        `core-gate: --rows names rows outside the --spec files: ${outside.join(', ')} (their drivers ${[...new Set(outside.map((id) => coreRow(id).driver))].join(', ')})`,
      );
      console.error(USAGE);
      process.exit(2);
    }
  }
}
if (AREAS_ONLY !== null) {
  if (ONLY !== 'probe') {
    console.error(
      `core-gate: --areas narrows the walk probe and needs --only probe (the specs are narrowed with --spec <areas> or --rows <ids>)`,
    );
    console.error(USAGE);
    process.exit(2);
  }
  /* the walk's own modules (core-walk/index.mjs AREAS), the names its `--only` takes, and the id
     areas of the probe rows: since the polish round (docs/POLISH.md 5.1) a module's name can
     differ from its rows' id area (`polish-tables` drives `tables.*` rows), so a run over a
     module's name judges the rows that module declares, never every row whose id starts with
     the name; an id area no module carries (`versions`, `comments`, in the share module) judges
     its ids wherever they are declared (`inArea`) */
  const known = new Set([
    ...WALK_MODULES,
    ...rowsForDriver(PROBE_DRIVER).map((row) => areaOf(row.id)),
  ]);
  const unknown = AREAS_ONLY.filter((area) => !known.has(area));
  if (AREAS_ONLY.length === 0 || unknown.length > 0) {
    console.error(
      `core-gate: --areas takes the walk probe's areas (${[...known].sort().join(', ')}); not one: ${unknown.map((a) => JSON.stringify(a)).join(', ') || '(none named)'}`,
    );
    console.error(USAGE);
    process.exit(2);
  }
}
/**
 * The walk modules that declare the rows of the id areas named (`--areas`): the walk's `--only`
 * takes module names, and an id area can live in another module (the versions and comments rows
 * in `share`), so the gate passes the modules and judges the ids (the people round, build/b5.md).
 */
function walkModulesOf(areas) {
  const modules = new Set();
  for (const row of rowsForDriver(PROBE_DRIVER))
    if (areas.some((area) => inArea(row, area))) {
      const module = WALK_MODULE_OF.get(row.id);
      if (module !== undefined && module !== 'cleanup' && module !== 'walk') modules.add(module);
    }
  return [...modules];
}
/** The walk modules that declare the realtime probe rows (the presence area), for `--only realtime`. */
function realtimeWalkModules() {
  const modules = new Set();
  for (const row of REALTIME_PROBE_ROWS) {
    const module = WALK_MODULE_OF.get(row.id);
    if (module !== undefined && module !== 'cleanup' && module !== 'walk') modules.add(module);
  }
  return [...modules];
}
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

/* the rows this run judges: every row, or the rows of the one driver `--only` names, narrowed by
   `--spec` or `--rows` (the specs), `--areas` (the walk probe) or `--cost-rows` (the cost probe);
   a driver's partial run never reads the other drivers' rows as no step */
const specRowsJudged = CORE_MATRIX.filter(
  (r) =>
    CORE_SPEC_DRIVERS.includes(r.driver) &&
    (!SPEC_ONLY || SPEC_ONLY.split(',').some((a) => r.driver === `core/${a.trim()}.spec.ts`)) &&
    (ROWS_ONLY === null || ROWS_ONLY.includes(r.id)),
);
const probeRowsJudged = rowsForDriver(PROBE_DRIVER).filter(
  (r) => AREAS_ONLY === null || AREAS_ONLY.some((area) => inArea(r, area)),
);
const costRowsJudged = costRows().filter(
  (r) => !COST_ROWS || COST_ROWS.split(',').some((id) => id.trim() === r.id),
);
/* the local rows an `--only accounts` run drives and judges alone (docs/PEOPLE.md 6.2), narrowed by `--rows` */
const accountsRowsJudged = localRows().filter(
  (r) => ROWS_ONLY === null || ROWS_ONLY.includes(r.id),
);
/* the tier rows this run lists apart (core-matrix.mjs TIER_FEATURES): a run not on their tier
   never judges them and never reads them as no step */
const tierRowsApart = TIER_ROWS_JUDGED ? [] : tierRows();
const judgedBefore =
  ONLY === 'probe'
    ? probeRowsJudged
    : ONLY === 'specs'
      ? specRowsJudged
      : ONLY === 'cost'
        ? costRowsJudged
        : ONLY === 'accounts'
          ? accountsRowsJudged
          : ONLY === 'realtime'
            ? REALTIME_ROWS
            : ONLY === 'setup'
              ? SETUP_ROWS
              : CORE_MATRIX;
const judged = judgedBefore.filter((row) => !tierRowsApart.includes(row));

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
  /* the walk's own `--only`: the modules that declare the rows of the id areas an `--areas` run
     judges (the versions and comments rows live in the share module, the people round's two
     versions rows among them), so a narrowed run drives what it judges */
  if (AREAS_ONLY !== null) args.push('--only', walkModulesOf(AREAS_ONLY).join(','));
  /* an `--only realtime` run names the modules that declare the realtime probe rows (the presence area) */
  else if (ONLY === 'realtime') args.push('--only', realtimeWalkModules().join(','));
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
  if (TIER !== null) args.push('--tier', TIER);
  /* the Cloudflare phase: the Worker host and the dashboard figures ride to the probe; the room
     bearer stays in the environment the probe inherits */
  if (arg('room-host', null) !== null) args.push('--room-host', arg('room-host', null));
  if (COST_DASHBOARD !== null) args.push('--dashboard', resolve(ROOT, COST_DASHBOARD));
  /* the Redis URL rides to the probe and is never printed (docs/REALTIME.md 1.1, 5.5) */
  const shown = args.join(' ');
  if (REDIS_URL_ARG !== null) args.push('--redis-url', REDIS_URL_ARG);
  console.log(`core-gate: node ${shown}${REDIS_URL_ARG !== null ? ' --redis-url <set>' : ''}`);
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

/**
 * The spec files a run covers: the `--spec` areas, else the drivers of the `--rows` named, else
 * every core spec. The dry run prints them, which is how the gate's own test reads them.
 */
function specFiles(specOnly = SPEC_ONLY, rowsOnly = ROWS_ONLY ?? realtimeRowsOnly()) {
  const drivers = specOnly
    ? specOnly.split(',').map((s) => `core/${s.trim()}.spec.ts`)
    : rowsOnly
      ? [...new Set(rowsOnly.map((id) => coreRow(id).driver))]
      : [...CORE_SPEC_DRIVERS];
  return drivers.map((d) => specPathOf(d));
}
/** The spec rows an `--only realtime` or `--only setup` run greps for, in place of `--rows`; null otherwise. */
function realtimeRowsOnly() {
  return ONLY === 'realtime' ? REALTIME_SPEC_IDS : ONLY === 'setup' ? SETUP_SPEC_IDS : null;
}
/**
 * Playwright's `--grep` for a `--rows` run: each id at the head of its test title (`coreTitle`,
 * e2e/core/matrix.ts: "<id>: <interaction>"), matched inside the title path Playwright greps
 * (the project, the file and the titles joined by spaces), so `svg.export.pdf-vector` never
 * matches a row whose id merely contains it. The dry run prints it for the gate's own test.
 */
function rowsGrep(rowsOnly = ROWS_ONLY ?? realtimeRowsOnly()) {
  const escaped = rowsOnly.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `(^| )(${escaped.join('|')}): `;
}

/**
 * Runs Playwright over `files` with the JSON reporter into `report` (specs.json for the core
 * specs, accounts.json for the local rows' spec) and its own output folder under `OUT`; the
 * `--rows` grep narrows either run to the rows named.
 */
function runPlaywright(files, report, output) {
  rmSync(report, { force: true });
  /* the run's own output folder for traces and screenshots: every Playwright start on the
     machine clears the shared `.turboslide/playwright`, which deleted a failed row's trace mid
     run (b4.md fix round, b3 R22) */
  const args = ['test', ...files, '--reporter=list,json', '--output', join(OUT, output)];
  if (ROWS_ONLY !== null || ONLY === 'realtime' || ONLY === 'setup')
    args.push('--grep', rowsGrep());
  /* the Cloudflare phase: B's origin rides to the two browser spec under both names it reads */
  const second =
    SECOND_BASE === null
      ? {}
      : { PLAYWRIGHT_SECOND_BASE_URL: SECOND_BASE, REALTIME_BASES: `${BASE},${SECOND_BASE}` };
  console.log(
    `core-gate: node_modules/.bin/playwright ${args.join(' ')} (PLAYWRIGHT_BASE_URL=${BASE}${SECOND_BASE === null ? '' : ` PLAYWRIGHT_SECOND_BASE_URL=${SECOND_BASE}`})`,
  );
  const t = Date.now();
  const result = spawnSync(join(ROOT, 'node_modules', '.bin', 'playwright'), args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: BASE,
      PLAYWRIGHT_JSON_OUTPUT_NAME: report,
      ...second,
    },
  });
  return readSpecs(report, result.status, Date.now() - t);
}

function runSpecs() {
  return runPlaywright(specFiles(), join(OUT, 'specs.json'), 'playwright');
}

/**
 * The local rows' spec (docs/PEOPLE.md 6.2): apps/studio/e2e/accounts.spec.ts against a node
 * server with an identity database. The spec titles its rows by `coreTitle(id)` the way the
 * core specs do, so `readSpecs` maps the report back to the ten local rows; its other tests
 * (the share link exchange, the device flow, the seeded route) carry no id and are not judged.
 * The spec reads `TURBOSLIDE_AUTH_DB` and `TURBOSLIDE_OVERLAY_DIR` from this environment.
 */
function runAccounts() {
  return runPlaywright([ACCOUNTS_SPEC], join(OUT, 'accounts.json'), 'playwright-accounts');
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
// the gate's own rows (the Cloudflare phase, docs/CLOUDFLARE.md 2.3): the Worker's health and the
// two hand rows read from files

/** True when two origins name one host: localhost and 127.0.0.1 read as one, the scheme and port must agree. */
export function sameOrigin(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const host = (u) =>
      u.hostname === 'localhost' || u.hostname === '[::1]' ? '127.0.0.1' : u.hostname;
    const port = (u) => u.port || (u.protocol === 'https:' ? '443' : '80');
    return x.protocol === y.protocol && host(x) === host(y) && port(x) === port(y);
  } catch {
    return false;
  }
}

/** The bearer of a deployment base: TURBOSLIDE_TOKEN, else the origin's row of ~/.config/turboslide/hosts.json; empty on localhost and without one. Never printed. */
function bearerForBase() {
  if (LOCAL) return '';
  let token = process.env.TURBOSLIDE_TOKEN ?? '';
  if (token === '') {
    try {
      const file = join(homedir(), '.config', 'turboslide', 'hosts.json');
      const hosts = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).hosts ?? {}) : {};
      const row = hosts[BASE] ?? hosts[BASE.replace(/\/$/, '')] ?? null;
      if (row && typeof row.token === 'string') token = row.token;
    } catch {
      token = '';
    }
  }
  return token;
}

/** The base's build commit from GET /api/agent (`instance.commit`), or the reason it could not be read. */
async function baseCommit() {
  const headers = {
    accept: 'application/json',
    ...(process.env.VERCEL_OIDC_TOKEN
      ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
      : {}),
  };
  const token = bearerForBase();
  if (token !== '') headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(new URL('/api/agent', BASE), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (res.status !== 200)
      return { commit: null, reason: `GET /api/agent answered ${res.status}` };
    const commit = body?.instance?.commit ?? null;
    return { commit, reason: commit === null ? 'GET /api/agent names no instance.commit' : null };
  } catch (error) {
    return {
      commit: null,
      reason: `GET /api/agent did not answer: ${String(error).slice(0, 120)}`,
    };
  }
}

/**
 * The row `setup.worker.health` (docs/CLOUDFLARE.md 2.3): GET /health on the Worker within 2 s,
 * `ok`, `protocol` 1, `realtime` on, `appOrigin` the base's origin, `commit` the base's build
 * commit or the sha named as a known skew. Answers the probe's shape: results and reasons by
 * row id, the measures and the health facts for the ledger.
 */
async function runHealth() {
  const id = 'setup.worker.health';
  const json = join(OUT, 'health.json');
  const t = Date.now();
  const facts = {
    host: ROOM_HOST,
    scheme: ROOM_INSECURE ? 'http' : 'https',
    knownSkew: KNOWN_SKEW,
  };
  const finish = (result, reason, measure) => {
    const health = { ...facts, result, reason, ms: Date.now() - t };
    writeFileSync(json, JSON.stringify(health, null, 2));
    return {
      exit: result === 'passed' ? 0 : 1,
      ms: health.ms,
      results: { [id]: result },
      reasons: reason ? { [id]: reason } : {},
      measures: measure ? { [id]: [measure] } : {},
      json,
      health,
    };
  };
  if (ROOM_HOST === null)
    return finish(
      'not driven',
      'no room host (--room-host or TURBOSLIDE_ROOM_HOST): GET /health was not read',
    );
  const url = `${facts.scheme}://${ROOM_HOST}/health`;
  console.log(`core-gate: GET ${url}`);
  let status = 0;
  let body = null;
  let ms = 0;
  try {
    const t0 = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    body = await res.json().catch(() => null);
    ms = Date.now() - t0;
    status = res.status;
  } catch (error) {
    return finish(
      'failed',
      `GET /health on ${ROOM_HOST} did not answer within 2 s: ${String(error).slice(0, 120)}`,
    );
  }
  Object.assign(facts, { status, ms, body });
  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (body?.ok !== true) problems.push('ok is not true');
  if (body?.protocol !== 1) problems.push(`protocol ${JSON.stringify(body?.protocol)} (1 asked)`);
  if (body?.realtime !== 'on')
    problems.push(`realtime ${JSON.stringify(body?.realtime)} (on asked)`);
  if (ms > 2000) problems.push(`${ms} ms (2 s asked)`);
  const appOrigin = typeof body?.appOrigin === 'string' ? body.appOrigin.replace(/\/$/, '') : '';
  if (!sameOrigin(appOrigin, BASE))
    problems.push(`appOrigin ${JSON.stringify(appOrigin)} is not this run's base ${BASE}`);
  const base = await baseCommit();
  facts.baseCommit = base.commit;
  const commit = typeof body?.commit === 'string' ? body.commit : '';
  let commitWord;
  let unread = false;
  if (
    base.commit === null &&
    KNOWN_SKEW !== null &&
    commit !== '' &&
    (commit === KNOWN_SKEW || commit.startsWith(KNOWN_SKEW) || KNOWN_SKEW.startsWith(commit))
  )
    commitWord = `commit ${commit.slice(0, 12)}, the sha --known-skew names (the base's commit unread: ${base.reason})`;
  else if (base.commit === null) {
    /* a base that names no build commit (a vite dev server without TURBOSLIDE_BUILD_COMMIT) cannot be compared: the row is not driven on that half, the health facts recorded */
    commitWord = `the base's commit unread (${base.reason}) and no --known-skew names the Worker's ${commit || 'empty commit'}, so the commit half cannot be read`;
    unread = true;
  } else if (
    commit !== '' &&
    (commit === base.commit || commit.startsWith(base.commit) || base.commit.startsWith(commit))
  )
    commitWord = `commit ${commit.slice(0, 12)} equal to the base's`;
  else if (
    KNOWN_SKEW !== null &&
    commit !== '' &&
    (commit === KNOWN_SKEW || commit.startsWith(KNOWN_SKEW) || KNOWN_SKEW.startsWith(commit))
  )
    commitWord = `commit ${commit.slice(0, 12)} against the base's ${base.commit.slice(0, 12)}, the known skew --known-skew names`;
  else {
    commitWord = `commit ${commit || 'empty'} against the base's ${base.commit.slice(0, 12)}, not named as a known skew`;
    problems.push(commitWord);
  }
  facts.commitWord = commitWord;
  const measure = `GET /health on ${ROOM_HOST} answered ${status} in ${ms} ms: realtime ${JSON.stringify(body?.realtime)}, protocol ${JSON.stringify(body?.protocol)}, appOrigin ${JSON.stringify(appOrigin)}; ${commitWord}`;
  if (problems.length > 0) return finish('failed', problems.join('; '), measure);
  if (unread) return finish('not driven', commitWord, measure);
  return finish('passed', '', measure);
}

/** A JSON file of a hand reading, or null; a missing or malformed file is the reason. */
function readHandFile(path) {
  if (path === null) return { body: null, reason: null };
  try {
    const body = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      return { body: null, reason: `${path} is not an object` };
    return { body, reason: null };
  } catch (error) {
    return { body: null, reason: `${path} could not be read: ${String(error).slice(0, 120)}` };
  }
}

/**
 * The two hand rows (docs/CLOUDFLARE.md 2.3): `setup.free-plan.caps` from the dashboard's daily
 * figures before and after the run (`--caps-before`, `--caps-after`; passed when the differences
 * are under 10,000 Durable Object requests and 20,000 rows written, the Worker requests recorded),
 * and `setup.do.memory` from the verifier's reading (`--memory-reading`: its `result` and
 * `reason`). A row without its file stays not driven with the flag named.
 */
function runHandRows() {
  const results = {};
  const reasons = {};
  const measures = {};
  const before = readHandFile(CAPS_BEFORE);
  const after = readHandFile(CAPS_AFTER);
  let freePlanCaps = null;
  if (CAPS_BEFORE === null || CAPS_AFTER === null) {
    results['setup.free-plan.caps'] = 'not driven';
    reasons['setup.free-plan.caps'] =
      "the dashboard's figures before and after the run were not given (--caps-before <json> and --caps-after <json>, each { readAt, doRequests, doRowsWritten, workerRequests })";
  } else if (before.body === null || after.body === null) {
    results['setup.free-plan.caps'] = 'not driven';
    reasons['setup.free-plan.caps'] = before.reason ?? after.reason;
  } else {
    const n = (o, k) => (typeof o?.[k] === 'number' ? o[k] : null);
    const fields = ['doRequests', 'doRowsWritten', 'workerRequests'];
    const delta = {};
    const missing = [];
    for (const f of fields) {
      const a = n(before.body, f);
      const b = n(after.body, f);
      if (a === null || b === null) missing.push(f);
      else delta[f] = b - a;
    }
    freePlanCaps = { before: before.body, after: after.body, delta, missing };
    const over = [];
    if (delta.doRequests !== undefined && delta.doRequests >= 10_000)
      over.push(`Durable Object requests grew by ${delta.doRequests} (under 10,000 asked)`);
    if (delta.doRowsWritten !== undefined && delta.doRowsWritten >= 20_000)
      over.push(`rows written grew by ${delta.doRowsWritten} (under 20,000 asked)`);
    const measure = `the dashboard's daily figures: before (${before.body.readAt ?? 'unnamed time'}) requests ${n(before.body, 'doRequests') ?? 'unread'}, rows written ${n(before.body, 'doRowsWritten') ?? 'unread'}, Worker requests ${n(before.body, 'workerRequests') ?? 'unread'}; after (${after.body.readAt ?? 'unnamed time'}) requests ${n(after.body, 'doRequests') ?? 'unread'}, rows written ${n(after.body, 'doRowsWritten') ?? 'unread'}, Worker requests ${n(after.body, 'workerRequests') ?? 'unread'}; the run cost ${delta.doRequests ?? 'unread'} requests, ${delta.doRowsWritten ?? 'unread'} rows written and ${delta.workerRequests ?? 'unread'} Worker requests`;
    measures['setup.free-plan.caps'] = [measure];
    if (missing.length > 0) {
      results['setup.free-plan.caps'] = 'not driven';
      reasons['setup.free-plan.caps'] =
        `the figures ${missing.join(', ')} are missing from the files`;
    } else if (over.length > 0) {
      results['setup.free-plan.caps'] = 'failed';
      reasons['setup.free-plan.caps'] = over.join('; ');
    } else results['setup.free-plan.caps'] = 'passed';
  }
  const memory = readHandFile(MEMORY_READING);
  let memoryReading = null;
  if (MEMORY_READING === null) {
    results['setup.do.memory'] = 'not driven';
    reasons['setup.do.memory'] =
      "the verifier's hand reading was not given (--memory-reading <json> with result, reason and the dashboard's memory percentiles)";
  } else if (memory.body === null) {
    results['setup.do.memory'] = 'not driven';
    reasons['setup.do.memory'] = memory.reason;
  } else {
    memoryReading = memory.body;
    const result = ['passed', 'failed', 'not driven'].includes(memory.body.result)
      ? memory.body.result
      : 'not driven';
    results['setup.do.memory'] = result;
    reasons['setup.do.memory'] =
      result === 'passed'
        ? ''
        : (memory.body.reason ?? `the reading's result is ${JSON.stringify(memory.body.result)}`);
    if (typeof memory.body.measure === 'string')
      measures['setup.do.memory'] = [memory.body.measure];
  }
  return { results, reasons, measures, freePlanCaps, memoryReading };
}

// ---------------------------------------------------------------------------------------------
// the merge and the verdict

let probe = null;
/** The gate's own rows (the Cloudflare phase): the Worker's health and the two hand rows. */
let health = null;
let hand = null;
/** The deployment's default template after the drivers, and whether this run put Blank back (the templates rows' side effect on a shared store). */
let defaultTemplate = null;
let specs = null;
let cost = null;
/** The accounts spec's run (docs/PEOPLE.md 6.2): `--only accounts` alone runs it. */
let accounts = null;
/**
 * Which drivers this run covers: the walk probe, the core specs and the cost probe when `--only`
 * is absent, else the one it names; the accounts spec runs only when named, since a deployment
 * has no identity database and its local rows are listed apart (6.2).
 */
const runs = (driver) =>
  driver === 'accounts'
    ? ONLY === 'accounts'
    : driver === 'gate'
      ? /* the gate's own rows: a do tier run or an --only setup run (docs/CLOUDFLARE.md 2.3) */
        TIER_ROWS_JUDGED && (ONLY === null || ONLY === 'setup')
      : ONLY === 'realtime'
        ? driver === 'probe' || driver === 'specs'
        : ONLY === 'setup'
          ? driver === 'specs'
          : ONLY === null || ONLY === driver;
if (REPORT !== null) {
  const dir = resolve(ROOT, REPORT);
  console.log(`core-gate: re-rendering the run under ${dir} (no driver runs)`);
  if (runs('probe')) probe = readProbe(join(dir, 'core-walk.json'), null, 0);
  if (runs('specs')) specs = readSpecs(join(dir, 'specs.json'), null, 0);
  /* a run from before the sync and costs round has no cost-probe.json; its rows then read no step */
  if (runs('cost') && existsSync(join(dir, 'cost-probe.json')))
    cost = readCost(join(dir, 'cost-probe.json'), null, 0);
  if (runs('accounts')) accounts = readSpecs(join(dir, 'accounts.json'), null, 0);
  if (runs('gate')) {
    /* a re-render reads the health row from its JSON and the hand rows from the files named again */
    const file = join(dir, 'health.json');
    if (existsSync(file)) {
      const h = JSON.parse(readFileSync(file, 'utf8'));
      health = {
        exit: h.result === 'passed' ? 0 : 1,
        ms: 0,
        results: { 'setup.worker.health': h.result },
        reasons: h.reason ? { 'setup.worker.health': h.reason } : {},
        measures: {},
        json: file,
        health: h,
      };
    }
    hand = runHandRows();
  }
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
        ? AREAS_ONLY === null
          ? 'the walk probe'
          : `the walk probe over the areas ${AREAS_ONLY.join(', ')} (${probeRowsJudged.length} rows judged; the walk's modules ${walkModulesOf(AREAS_ONLY).join(', ') || 'none'})`
        : ONLY === 'specs'
          ? ROWS_ONLY === null
            ? SPEC_ONLY === null
              ? 'the core specs'
              : `the core specs ${specFiles().join(', ')}`
            : `the core spec rows ${ROWS_ONLY.join(', ')} (${specFiles().join(', ')} with --grep ${JSON.stringify(rowsGrep())}; ${specRowsJudged.length} rows judged)`
          : ONLY === 'cost'
            ? 'the cost probe'
            : ONLY === 'accounts'
              ? `the accounts spec ${ACCOUNTS_SPEC}${ROWS_ONLY === null ? '' : ` narrowed to the local rows ${ROWS_ONLY.join(', ')} (--grep ${JSON.stringify(rowsGrep())})`} (${accountsRowsJudged.length} local rows judged; the server needs an identity database)`
              : ONLY === 'realtime'
                ? `the realtime rows alone (docs/REALTIME.md section 2): the walk probe over ${realtimeWalkModules().join(', ') || 'no module'} and the spec rows ${REALTIME_SPEC_IDS.join(', ')} (${specFiles().join(', ')} with --grep ${JSON.stringify(rowsGrep())}; ${REALTIME_ROWS.length} rows judged)`
                : ONLY === 'setup'
                  ? `the setup rows alone (docs/CLOUDFLARE.md 2.3, the do tier): GET /health on ${ROOM_HOST ?? 'no room host (--room-host or TURBOSLIDE_ROOM_HOST)'}, the spec rows ${SETUP_SPEC_IDS.join(', ')} (${specFiles().join(', ')} with --grep ${JSON.stringify(rowsGrep())}; B on ${SECOND_BASE ?? 'the base (one origin, so the two instance row is not driven)'}) and the two hand rows from ${CAPS_BEFORE === null || CAPS_AFTER === null ? 'no caps files' : 'the caps files'} and ${MEMORY_READING === null ? 'no memory reading' : 'the memory reading'} (${SETUP_ROWS.length} rows judged)`
                  : `the walk probe, the core specs and the cost probe${TIER_ROWS_JUDGED ? ', and the setup rows of the do tier (GET /health, the two hand rows)' : ''}`;
    console.log(
      `core-gate: dry run against ${BASE}${TIER === null ? '' : ` (tier ${TIER})`}${SECOND_BASE === null ? '' : ` with B on ${SECOND_BASE}`}: ${scratchLine}; the run would take ${LOCAL ? `the lock ${LOCK}` : 'no lock (a deployment)'} and run ${drivers}${tierRowsApart.length > 0 ? `; the ${tierRowsApart.length} tier rows (${tierRowsApart.map((r) => r.id).join(', ')}) would be listed apart (${tierAbsentReason(tierRowsApart[0], TIER)})` : ''}. Nothing ran and no lock was taken; exit 0.`,
    );
    process.exit(0);
  }
  /* the health read first (no lock, no browser): a Worker that does not answer is read before any row runs (5.5 item 2) */
  if (runs('gate')) {
    health = await runHealth();
    hand = runHandRows();
  }
  const held = await takeLock();
  try {
    if (runs('probe')) probe = runProbe();
    if (runs('specs')) specs = runSpecs();
    if (runs('cost')) cost = runCost();
    if (runs('accounts')) accounts = runAccounts();
  } finally {
    releaseLock(held);
  }
  defaultTemplate = await settleDefaultTemplate();
}

/**
 * The deployment's default template after the drivers (a deployment base alone): a spec that
 * drives templates.default.use-for-new sets it and its teardown can time out, which left a test
 * deck as production's default for two hours on 2026-09-25 (hotfix.md 16); every preview shares
 * production's store. Reads template.list with the bearer (TURBOSLIDE_TOKEN or the origin's row
 * of ~/.config/turboslide/hosts.json, never printed) and puts Blank back through
 * template.setDefault when the default is anything else; answers the reading for the summary.
 */
async function settleDefaultTemplate() {
  if (LOCAL) return null;
  let token = process.env.TURBOSLIDE_TOKEN ?? '';
  if (token === '') {
    try {
      const file = join(homedir(), '.config', 'turboslide', 'hosts.json');
      const hosts = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).hosts ?? {}) : {};
      const row = hosts[BASE] ?? hosts[BASE.replace(/\/$/, '')] ?? null;
      if (row && typeof row.token === 'string') token = row.token;
    } catch {
      token = '';
    }
  }
  if (token === '') return { read: 'no bearer', reset: false };
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    ...(process.env.VERCEL_OIDC_TOKEN
      ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
      : {}),
  };
  const post = async (action, input) => {
    const r = await fetch(new URL(`/api/actions/${action}`, BASE), {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    return { status: r.status, body: r.ok ? await r.json() : null };
  };
  try {
    const list = await post('template.list', {});
    const current = list.body?.default ?? null;
    if (list.status !== 200 || current === null)
      return { read: `template.list ${list.status}`, reset: false };
    if (current === 'blank') return { read: 'blank', reset: false };
    const set = await post('template.setDefault', { id: 'blank' });
    const after = set.body?.default ?? null;
    console.log(
      `core-gate: the deployment's default template read ${current} after the drivers; template.setDefault blank answered ${set.status}${after ? ` (${after})` : ''}`,
    );
    return { read: current, reset: after === 'blank' };
  } catch (error) {
    return { read: `error ${String(error).slice(0, 120)}`, reset: false };
  }
}

const results = {
  ...(probe?.results ?? {}),
  ...(specs?.results ?? {}),
  ...(cost?.results ?? {}),
  ...(accounts?.results ?? {}),
  ...(health?.results ?? {}),
  ...(hand?.results ?? {}),
};
const reasons = {
  ...(probe?.reasons ?? {}),
  ...(specs?.reasons ?? {}),
  ...(cost?.reasons ?? {}),
  ...(accounts?.reasons ?? {}),
  ...(health?.reasons ?? {}),
  ...(hand?.reasons ?? {}),
};
/**
 * A local row this run did not record (docs/PEOPLE.md 6.2): the accounts run's, listed apart
 * with the reason, never counted as passed and never "no step"; a local row the run did record
 * (an `--only accounts` run) is judged like any row below.
 */
const localAbsent = (row) => isLocalRow(row) && results[row.id] === undefined;
const table = judged.map((row) => ({
  id: row.id,
  feature: row.feature,
  driver: row.driver,
  today: row.today,
  result: localAbsent(row) ? 'not driven' : (results[row.id] ?? 'no step'),
  reason: localAbsent(row)
    ? LOCAL_ABSENT_REASON
    : results[row.id] === undefined
      ? 'no driver recorded this row'
      : (reasons[row.id] ?? ''),
}));
const noStep = table.filter((r) => r.result === 'no step').map((r) => r.id);
/* the local rows this run did not record, by id (PEOPLE.md 6.2) */
const local = judged.filter(localAbsent).map((row) => row.id);
/* the manual rows of ruling (3): not driven by design, listed apart, never counted as passed */
const manual = table
  .filter((r) => r.result === 'not driven' && isManualRow(coreRow(r.id)))
  .map((r) => r.id);
/* the measurement rows (PRODUCT.md 8.2) and the cost rows (SYNC.md 6.1): their result, reason and
   recorded numbers, listed apart; a cost row's numbers are its counts beside its ceilings */
const measures = {
  ...(specs?.measures ?? {}),
  ...(cost?.measures ?? {}),
  ...(health?.measures ?? {}),
  ...(hand?.measures ?? {}),
};
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
/* the accounts run reads its retries the way the core specs do (6.2: zero, or the row is flaky) */
const retriesOk =
  (specs === null || (specs.retries === 0 && specs.retried === 0)) &&
  (accounts === null || (accounts.retries === 0 && accounts.retried === 0));
const count = (word) => table.filter((r) => r.result === word).length;
const exitCode =
  verdict.ok && noStep.length === 0 && retriesOk && costOverCeiling.length === 0 ? 0 : 1;

const summary = {
  base: BASE,
  /* the realtime tier of the base as the caller named it (docs/REALTIME.md 5.4; --tier), or null;
     `do` since the Cloudflare phase, implied by --only setup */
  tier: TIER,
  /* the Cloudflare phase (docs/CLOUDFLARE.md 2.3, 5.4): B's origin for the two browser specs, the
     Worker host the run read, the health row's facts, the two hand rows' readings and the tier
     rows this run listed apart (never judged, never passed) */
  secondBase: SECOND_BASE,
  roomHost: ROOM_HOST,
  health: health?.health ?? null,
  freePlanCaps: hand?.freePlanCaps ?? null,
  memoryReading: hand?.memoryReading ?? null,
  tierRows:
    tierRowsApart.length === 0
      ? null
      : {
          reason: tierAbsentReason(tierRowsApart[0], TIER),
          ids: tierRowsApart.map((r) => r.id),
        },
  defaultTemplate,
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
  /* the accounts spec's run (PEOPLE.md 6.2): the local rows' driver on a node server with an identity database */
  accounts: accounts && {
    exit: accounts.exit,
    ms: accounts.ms,
    report: accounts.report,
    retries: accounts.retries,
    retried: accounts.retried,
    error: accounts.error,
  },
  /* the cost rows over their ceiling in this run (SYNC.md 6.2: on the preview they hold the ship) */
  costOverCeiling,
  /* how this run was narrowed, if it was: a narrowed run's ledger stands beside the run of record */
  narrowed: {
    only: ONLY,
    spec: SPEC_ONLY === null ? null : SPEC_ONLY.split(',').map((s) => s.trim()),
    rows: ROWS_ONLY,
    areas: AREAS_ONLY,
    costRows: COST_ROWS === null ? null : COST_ROWS.split(',').map((s) => s.trim()),
  },
  rows: table.length,
  passed: count('passed'),
  failed: count('failed'),
  notDriven: count('not driven'),
  manual,
  /* the measurement rows with their recorded numbers (PRODUCT.md 8.2); a red one never fails the verdict */
  measured,
  noStep,
  /* the local rows this run did not record (PEOPLE.md 6.2): listed apart, never passed, never a reason to park */
  local,
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
  `Base ${BASE}${TIER === null ? '' : ` (tier ${TIER})`}${SECOND_BASE === null ? '' : ` with B on ${SECOND_BASE}`}${ROOM_HOST === null ? '' : `, the Worker ${ROOM_HOST}`}, started ${summary.startedAt}, ${Math.round(summary.ms / 1000)} s. ${table.length} rows judged: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} of them manual, the checklist's: ${manual.join(', ') || 'none'}), ${noStep.length} no step, ${local.length} local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): ${measured.map((m) => `${m.id} ${m.result}${m.measures.length > 0 ? ` (${m.measures.join('; ')})` : ''}`).join('; ') || 'none judged'}. Cost rows over their ceiling in this run: ${costOverCeiling.join(', ') || 'none'}. Verdict ${verdict.ok ? 'ok' : 'failed'}${parked.parkedFeatures.length > 0 ? ` with the committed parked list ${parked.parkedFeatures.join(', ')}` : ''}${(parked.parkedRows ?? []).length > 0 ? ` and the parked rows ${parked.parkedRows.map((r) => r.id).join(', ')}` : ''}; retries ${specs === null ? 'no specs run' : `${specs.retries} configured, ${specs.retried} test(s) retried`}; exit ${exitCode}. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): ${parking.parked.join(', ') || 'none'}; rows whose own controls a ship would keep parked: ${parking.parkedRows.map((r) => `${r.id} (${r.parks.join(', ')})`).join('; ') || 'none'}; rows of an unparkable feature blocking the ship: ${parking.blocking.map((b) => b.id).join(', ') || 'none'}.`,
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
if (tierRowsApart.length > 0)
  lines.push(
    '## Tier rows this run did not judge (docs/CLOUDFLARE.md 2.3)',
    '',
    `Listed apart with the reason "${tierAbsentReason(tierRowsApart[0], TIER)}": judged by a run on their tier alone, never counted as passed and never a reason to park.`,
    '',
    ...tierRowsApart.map((r) => `- \`${r.id}\``),
    '',
  );
if (local.length > 0)
  lines.push(
    '## Local rows this run did not record (docs/PEOPLE.md 6.2)',
    '',
    `Driven by ${LOCAL_SPEC_DRIVERS.join(', ')} on a node server with an identity database (\`--only accounts\`), never by a deployment run; listed apart with the reason "${LOCAL_ABSENT_REASON}", never counted as passed and never a reason to park.`,
    '',
    ...local.map((id) => `- \`${id}\``),
    '',
  );
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
/* the Cloudflare phase (docs/CLOUDFLARE.md 2.3): the gate's own rows in the table, so a ledger
   reader sees the health read and the hand readings beside the rows */
if (health !== null || hand !== null) {
  const own = { ...(health?.measures ?? {}), ...(hand?.measures ?? {}) };
  lines.push(
    '## The setup rows of the do tier (docs/CLOUDFLARE.md 2.3)',
    '',
    ...table
      .filter((r) => r.driver === 'core-gate')
      .map(
        (r) =>
          `- \`${r.id}\`: ${r.result}${r.reason ? ` (${esc(r.reason)})` : ''}${(own[r.id] ?? []).length > 0 ? `; recorded ${esc(own[r.id].join('; '))}` : ''}`,
      ),
    '',
  );
}
writeFileSync(join(OUT, 'core-matrix.md'), `${lines.join('\n')}\n`);

console.log(
  `\ncore-gate: ${table.length} rows: ${summary.passed} passed, ${summary.failed} failed, ${summary.notDriven} not driven (${manual.length} manual), ${noStep.length} no step, ${local.length} local rows not recorded; verdict ${verdict.ok ? 'ok' : 'failed'}; retries ${retriesOk ? 'zero' : 'NOT zero'}; cost rows over their ceiling ${costOverCeiling.length}; ${Math.round(summary.ms / 1000)} s against ${BASE}; table ${join(OUT, 'core-matrix.md')}; exit ${exitCode}`,
);
if (!verdict.ok)
  console.log(
    `  failing the gate: ${verdict.failures.map((f) => `${f.id} (${f.result})`).join(', ')}`,
  );
if (costOverCeiling.length > 0)
  console.log(`  cost rows over their ceiling: ${costOverCeiling.join(', ')}`);
process.exit(exitCode);

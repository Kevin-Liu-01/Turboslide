#!/usr/bin/env node
// The core test matrix of the focus round as a module (docs/FOCUS.md section 6; the integrator's
// day 0). The data is docs/gslides-parity/focus/core-matrix.json, the one file docs/FOCUS.md is
// rendered from, and this module reads it so the ids exist in one place: the walk probe's --core
// mode (scripts/probes/editor-walk-probe.mjs) and the core specs (apps/studio/e2e/core/*.spec.ts,
// through apps/studio/e2e/core/matrix.ts) import the same list and the same lookups, and a row
// added or renamed in the JSON reaches both without a second edit. The module validates the file
// on load and throws on a malformed row, so a run never drives an id the matrix does not hold.
//
// The id scheme (6): `area.feature.interaction`, lower case letters, digits and hyphens, two to
// four dot separated parts, the first part the area; the `feature` field names the section 2
// feature (`collab.*` rows belong to `share`, the one area that is not a feature). `today` is one
// of the four words of the audits; `severity` sits on broken and flaky rows alone; `driver` is
// the probe or one of the seven spec files; `setup` names a window API write that is never a
// driven step. The two ship helpers at the end compute rule 4 of section 1 and the exit rule of
// 6.2 from a run's results, so the parked list is computed and never typed.
//
//   node scripts/probes/core-matrix.mjs            prints the counts of 6.3 from the file
//   node scripts/probes/core-matrix.mjs --ids      prints every id, one per line
//
// Node only, no dependency. Type declarations for the TypeScript callers are in core-matrix.d.mts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The matrix file docs/FOCUS.md is rendered from. */
export const CORE_MATRIX_PATH = fileURLToPath(
  new URL('../../docs/gslides-parity/focus/core-matrix.json', import.meta.url),
);

/** The section 2 features in the order of the document, plus the switch (section 3). */
export const CORE_FEATURES = Object.freeze([
  'decks',
  'slides',
  'text',
  'images',
  'arrange',
  'shapes',
  'lines',
  'present',
  'share',
  'comments',
  'versions',
  'export',
  'help',
  'surface',
]);

/** An id's first part that is not a feature name, with the feature its rows belong to. */
export const AREA_FEATURE = Object.freeze({ collab: 'share' });

/** The four words of the audits for what production did; nothing else is a state. */
export const CORE_STATES = Object.freeze(['works', 'broken', 'flaky', 'not driven']);

/** The three results a run records for a driven row (6.2); a step nobody drove is `not driven`. */
export const RUN_RESULTS = Object.freeze(['passed', 'failed', 'not driven']);

/** The walk probe in --core mode. */
export const PROBE_DRIVER = 'probe --core';

/** The Playwright specs under apps/studio/e2e/core/, as the `driver` field spells them. */
export const CORE_SPEC_DRIVERS = Object.freeze([
  'core/decks.spec.ts',
  'core/slides.spec.ts',
  'core/images.spec.ts',
  'core/present.spec.ts',
  'core/share.spec.ts',
  'core/export.spec.ts',
  'core/surface.spec.ts',
]);

export const CORE_DRIVERS = Object.freeze([PROBE_DRIVER, ...CORE_SPEC_DRIVERS]);

/** `area.feature.interaction`: two to four parts of lower case letters, digits and hyphens. */
export const CORE_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;

/** The feature that cannot be parked: a failed or not driven `surface.*` row blocks the ship (rule 4). */
export const UNPARKABLE_FEATURE = 'surface';

const ROW_KEYS = new Set([
  'id',
  'feature',
  'interaction',
  'driver',
  'today',
  'evidence',
  'severity',
  'note',
  'setup',
  'manual',
]);

/**
 * A manual row (the orchestrator's ruling (3) on docs/FOCUS.md section 9): a row whose only
 * obstacle is the headless browser (the OS print dialog, a second screen, a chord the browser does
 * not synthesize) carries `manual: <the reason>` and a checklist step in
 * docs/gslides-parity/focus/manual-checklist.md. A run records it as not driven with that reason
 * and never as passed; it does not park its feature and does not fail the ship. A manual row a
 * driver does record as failed is a failure like any other.
 */
export function isManualRow(row) {
  return typeof row?.manual === 'string' && row.manual.length > 0;
}

/** The area of an id: its first part. */
export function areaOf(id) {
  return String(id).split('.')[0];
}

/**
 * Checks every row against the scheme and throws one error naming every problem: a duplicate or
 * malformed id, an unknown feature, driver or state, a feature that disagrees with the area, a
 * severity on a row that is not broken or flaky or missing on one that is, an unknown key.
 */
export function validateCoreMatrix(rows) {
  const problems = [];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('core-matrix.json: no rows');
  const seen = new Set();
  rows.forEach((row, index) => {
    const where = `row ${index + 1} (${row?.id ?? 'no id'})`;
    if (row === null || typeof row !== 'object') {
      problems.push(`${where}: not an object`);
      return;
    }
    for (const key of Object.keys(row))
      if (!ROW_KEYS.has(key)) problems.push(`${where}: unknown key ${key}`);
    if (typeof row.id !== 'string' || !CORE_ID_PATTERN.test(row.id))
      problems.push(`${where}: id does not read area.feature.interaction`);
    if (seen.has(row.id)) problems.push(`${where}: duplicate id`);
    seen.add(row.id);
    if (!CORE_FEATURES.includes(row.feature))
      problems.push(`${where}: unknown feature ${row.feature}`);
    const area = areaOf(row.id);
    const expected = AREA_FEATURE[area] ?? area;
    if (row.feature !== expected)
      problems.push(`${where}: area ${area} belongs to ${expected}, not ${row.feature}`);
    if (typeof row.interaction !== 'string' || row.interaction.length === 0)
      problems.push(`${where}: no interaction`);
    if (!CORE_DRIVERS.includes(row.driver)) problems.push(`${where}: unknown driver ${row.driver}`);
    if (!CORE_STATES.includes(row.today)) problems.push(`${where}: unknown state ${row.today}`);
    if (typeof row.evidence !== 'string' || row.evidence.length === 0)
      problems.push(`${where}: no evidence`);
    const red = row.today === 'broken' || row.today === 'flaky';
    if (red && ![1, 2, 3].includes(row.severity))
      problems.push(`${where}: a ${row.today} row needs a severity of 1, 2 or 3`);
    if (!red && row.severity !== undefined)
      problems.push(`${where}: a ${row.today} row carries no severity`);
    if (row.note !== undefined && typeof row.note !== 'string')
      problems.push(`${where}: note is not a string`);
    if (row.manual !== undefined && (typeof row.manual !== 'string' || row.manual.length === 0))
      problems.push(`${where}: manual is not a sentence naming the obstacle`);
    if (row.setup !== undefined && typeof row.setup !== 'string')
      problems.push(`${where}: setup is not a string`);
  });
  if (problems.length > 0) throw new Error(`core-matrix.json: ${problems.join('; ')}`);
  return rows;
}

/** Reads and validates a matrix file; the rows are frozen. */
export function loadCoreMatrix(path = CORE_MATRIX_PATH) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = validateCoreMatrix(parsed.rows);
  return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

/** Every row of docs/gslides-parity/focus/core-matrix.json, in the file's order. */
export const CORE_MATRIX = loadCoreMatrix();

/** Every id, in the file's order. */
export const CORE_IDS = Object.freeze(CORE_MATRIX.map((row) => row.id));

const BY_ID = new Map(CORE_MATRIX.map((row) => [row.id, row]));

/** True for an id the matrix holds. */
export function isCoreId(id) {
  return BY_ID.has(id);
}

/** The row with the id; a RangeError on an unknown id, so a typo in a probe tag or a spec fails the run. */
export function coreRow(id) {
  const row = BY_ID.get(id);
  if (row === undefined) throw new RangeError(`unknown core matrix id ${id}`);
  return row;
}

/** The feature a row belongs to. */
export function featureOf(id) {
  return coreRow(id).feature;
}

/** The rows of a feature, in the file's order. */
export function rowsForFeature(feature) {
  return CORE_MATRIX.filter((row) => row.feature === feature);
}

/** The rows a driver carries: `probe --core` or a `core/<area>.spec.ts` file name (`core/` optional). */
export function rowsForDriver(driver) {
  const name = driver === PROBE_DRIVER || driver.startsWith('core/') ? driver : `core/${driver}`;
  return CORE_MATRIX.filter((row) => row.driver === name);
}

/** The rows the walk probe drives in --core mode. */
export function probeRows() {
  return rowsForDriver(PROBE_DRIVER);
}

/** The counts of a list of rows by the four words, the shape of 6.3. */
export function tally(rows = CORE_MATRIX) {
  const out = { rows: rows.length };
  for (const state of CORE_STATES) out[state] = rows.filter((row) => row.today === state).length;
  return out;
}

/**
 * Rule 4 of section 1 over a run: `results` maps every core id to `passed`, `failed` or
 * `not driven` (an id the run did not record is `not driven`). Returns the features that would
 * be parked at a ship on this run, the `surface` rows that would block it, and the red rows by
 * feature, so the ship note renders the list instead of typing it. `rows` narrows the reading to
 * one driver's rows (the walk probe judges its own rows, the gate judges the whole matrix).
 */
export function parkedFeaturesOf(results, rows = CORE_MATRIX) {
  const red = new Map();
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed') continue;
    /* a manual row not driven is the checklist's, never a reason to park (ruling (3)) */
    if (result === 'not driven' && isManualRow(row)) continue;
    const list = red.get(row.feature) ?? [];
    list.push({ id: row.id, result });
    red.set(row.feature, list);
  }
  const parked = CORE_FEATURES.filter(
    (feature) => feature !== UNPARKABLE_FEATURE && red.has(feature),
  );
  const blocking = red.get(UNPARKABLE_FEATURE) ?? [];
  return { parked, blocking, red: Object.fromEntries(red) };
}

/**
 * The exit rule of 6.2 over a run and the ship's committed parked list: every core id must be
 * `passed` unless its feature is in `parkedFeatures`; `surface` cannot be listed. Returns `ok`
 * and the ids that fail it with their result. `rows` narrows the rule to one driver's rows.
 */

/**
 * The committed parked list of a ship (6.2): `docs/gslides-parity/focus/ship-<commit>.json`
 * with `{ "commit": "<sha>", "parkedFeatures": [...] }`. Returns the list, checked against the
 * feature names; `surface` is refused here as it is in `shipVerdict`.
 */
export function readParkedList(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const list = parsed?.parkedFeatures;
  if (!Array.isArray(list)) throw new Error(`${path}: no parkedFeatures list`);
  for (const feature of list) {
    if (feature === UNPARKABLE_FEATURE)
      throw new RangeError(`${path}: ${UNPARKABLE_FEATURE} cannot be parked`);
    if (!CORE_FEATURES.includes(feature))
      throw new RangeError(`${path}: unknown feature ${feature}`);
  }
  return { commit: typeof parsed.commit === 'string' ? parsed.commit : null, parkedFeatures: list };
}

export function shipVerdict(results, parkedFeatures = [], rows = CORE_MATRIX) {
  if (parkedFeatures.includes(UNPARKABLE_FEATURE))
    throw new RangeError(
      `${UNPARKABLE_FEATURE} cannot be parked: a failed or not driven surface row blocks the ship`,
    );
  for (const feature of parkedFeatures)
    if (!CORE_FEATURES.includes(feature))
      throw new RangeError(`unknown feature ${feature} in the parked list`);
  const failures = [];
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed' || parkedFeatures.includes(row.feature)) continue;
    if (result === 'not driven' && isManualRow(row)) continue;
    failures.push({ id: row.id, feature: row.feature, result });
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--ids')) {
    for (const id of CORE_IDS) console.log(id);
  } else {
    const all = tally();
    console.log(
      `core-matrix: ${all.rows} rows; ${all.works} works, ${all.broken} broken, ${all.flaky} flaky, ${all['not driven']} not driven`,
    );
    for (const feature of CORE_FEATURES) {
      const t = tally(rowsForFeature(feature));
      console.log(
        `  ${feature.padEnd(9)} ${String(t.rows).padStart(3)} rows  ${String(t.works).padStart(3)} works ${String(t.broken).padStart(3)} broken ${String(t.flaky).padStart(3)} flaky ${String(t['not driven']).padStart(3)} not driven`,
      );
    }
    for (const driver of CORE_DRIVERS)
      console.log(
        `  ${driver.padEnd(22)} ${String(rowsForDriver(driver).length).padStart(3)} rows`,
      );
  }
}

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
// 6.2 from a run's results, so the parked list is computed and never typed. The return round
// (docs/RETURN.md section 1 rule 2 and section 5) added the features tables, charts, diagrams,
// wordart, formatting, chrome, view and inbox, the list of unparkable features (a red row of one
// blocks the ship), the `parks` field (the data-control ids a row alone guards, validated against
// the menu model's sources) and the `parkedRows` half of the parked list beside `parkedFeatures`.
//
//   node scripts/probes/core-matrix.mjs            prints the counts of 6.3 from the file
//   node scripts/probes/core-matrix.mjs --ids      prints every id, one per line
//
// Node only, no dependency. Type declarations for the TypeScript callers are in core-matrix.d.mts.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The matrix file docs/FOCUS.md is rendered from. */
export const CORE_MATRIX_PATH = fileURLToPath(
  new URL('../../docs/gslides-parity/focus/core-matrix.json', import.meta.url),
);

/**
 * The section 2 features in the order of the document, plus the switch (section 3), plus the
 * return round's features (docs/RETURN.md section 5): the documents (tables, charts, diagrams,
 * word art), the text and paragraph formatting rows, the chrome (the title row's split button,
 * the separators and the right cluster), the View menu rows and the inbox.
 */
export const CORE_FEATURES = Object.freeze([
  'decks',
  'slides',
  'text',
  'images',
  'arrange',
  'shapes',
  'lines',
  'tables',
  'charts',
  'diagrams',
  'wordart',
  'formatting',
  'present',
  'share',
  'comments',
  'versions',
  'export',
  'help',
  'chrome',
  'view',
  'inbox',
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
  /* the return round (docs/RETURN.md section 5): the clipboard paste into the chart grid */
  'core/documents.spec.ts',
]);

export const CORE_DRIVERS = Object.freeze([PROBE_DRIVER, ...CORE_SPEC_DRIVERS]);

/** `area.feature.interaction`: two to four parts of lower case letters, digits and hyphens. */
export const CORE_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;

/**
 * The features that cannot be parked (docs/RETURN.md section 1 rule 2): a feature already in the
 * default view with no flag to hide it. A failed or not driven row of one of them blocks the ship
 * unless the row carries `parks` (below). `surface` (the switch), `chrome` (the title row's split
 * button, separators and right cluster; nothing hides them) and every core feature of FOCUS.md
 * section 2. The parkable features are the rest of CORE_FEATURES: every menu row and control of
 * each carries the `advanced` flag or a stub sentence, so hiding the feature is one flag change.
 */
export const UNPARKABLE_FEATURES = Object.freeze([
  'surface',
  'chrome',
  'decks',
  'slides',
  'text',
  'images',
  'arrange',
  'present',
  'share',
  'comments',
  'versions',
  'export',
  'help',
]);

/** The focus round's one unparkable feature, kept for the callers that named it. */
export const UNPARKABLE_FEATURE = 'surface';

/** True for a feature a red row can park (rule 2). */
export function isParkable(feature) {
  return CORE_FEATURES.includes(feature) && !UNPARKABLE_FEATURES.includes(feature);
}

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
  'parks',
]);

/**
 * The sources the `parks` ids are validated against (docs/RETURN.md section 5: "validated against
 * model.ts"): the menu model, the toolbar tails and the title row, read as text; an id is known
 * when it appears as a string literal in one of them. A plain Node module cannot import the
 * TypeScript model, so the check is the literal's presence, which catches a typo and a row that
 * names a control the product no longer has.
 */
export const CONTROL_SOURCE_PATHS = Object.freeze(
  [
    '../../packages/chrome/src/menus/model.ts',
    '../../packages/chrome/src/menus/toolbar-tails.ts',
    '../../packages/chrome/src/TitleRow.tsx',
  ].map((rel) => fileURLToPath(new URL(rel, import.meta.url))),
);

let controlSourceText = null;
/** The concatenated text of the control sources, read once; empty when none exists (a copied file alone). */
function controlSources() {
  if (controlSourceText === null)
    controlSourceText = CONTROL_SOURCE_PATHS.filter((p) => existsSync(p))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
  return controlSourceText;
}

/** A data-control id: dot separated parts of letters and digits. */
export const CONTROL_ID_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/;

/** True when the id appears as a string literal in one of the control sources. */
export function isKnownControl(id) {
  const text = controlSources();
  if (text === '') return true;
  return text.includes(`'${id}'`) || text.includes(`"${id}"`) || text.includes(`\`${id}\``);
}

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
    if (row.parks !== undefined) {
      if (!Array.isArray(row.parks) || row.parks.length === 0)
        problems.push(`${where}: parks is not a list of data-control ids`);
      else
        for (const control of row.parks) {
          if (typeof control !== 'string' || !CONTROL_ID_PATTERN.test(control))
            problems.push(
              `${where}: parks names ${JSON.stringify(control)}, not a data-control id`,
            );
          else if (!isKnownControl(control))
            problems.push(
              `${where}: parks names ${control}, which no control source holds (model.ts, toolbar-tails.ts, TitleRow.tsx)`,
            );
        }
    }
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
 * Rule 4 of section 1, with docs/RETURN.md section 1 rule 2, over a run: `results` maps every core
 * id to `passed`, `failed` or `not driven` (an id the run did not record is `not driven`). Returns
 * the features that would be parked at a ship on this run (`parked`), the rows whose own controls
 * would stay parked (`parkedRows`, each `{ id, parks, result }`: a red row carrying `parks` parks
 * those ids alone, never its feature), the rows of an unparkable feature that would block the ship
 * (`blocking`), and the red rows by feature, so the ship note renders the list instead of typing
 * it. `rows` narrows the reading to one driver's rows (the walk probe judges its own rows, the gate
 * judges the whole matrix).
 */
export function parkedFeaturesOf(results, rows = CORE_MATRIX) {
  const red = new Map();
  const parkedRows = [];
  const parkingFeatures = new Set();
  const blocking = [];
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed') continue;
    /* a manual row not driven is the checklist's, never a reason to park (ruling (3)) */
    if (result === 'not driven' && isManualRow(row)) continue;
    const list = red.get(row.feature) ?? [];
    list.push({ id: row.id, result });
    red.set(row.feature, list);
    if (row.parks !== undefined) {
      parkedRows.push({ id: row.id, parks: [...row.parks], result });
      continue;
    }
    if (isParkable(row.feature)) parkingFeatures.add(row.feature);
    else blocking.push({ id: row.id, feature: row.feature, result });
  }
  const parked = CORE_FEATURES.filter((feature) => parkingFeatures.has(feature));
  return { parked, parkedRows, blocking, red: Object.fromEntries(red) };
}

/** The features and rows of a parked list: an array of features (the focus round's form) or the object. */
function parkedOf(parked) {
  if (Array.isArray(parked)) return { parkedFeatures: parked, parkedRows: [] };
  return {
    parkedFeatures: parked?.parkedFeatures ?? [],
    parkedRows: parked?.parkedRows ?? [],
  };
}

/** Throws on a parked list that names an unparkable feature, an unknown feature or a row without `parks`. */
function checkParkedList(parkedFeatures, parkedRows, where) {
  for (const feature of parkedFeatures) {
    if (UNPARKABLE_FEATURES.includes(feature))
      throw new RangeError(
        `${where}${feature} cannot be parked: a failed or not driven ${feature} row blocks the ship`,
      );
    if (!CORE_FEATURES.includes(feature))
      throw new RangeError(`${where}unknown feature ${feature} in the parked list`);
  }
  for (const entry of parkedRows) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string')
      throw new RangeError(`${where}parkedRows holds an entry without an id`);
    const row = BY_ID.get(entry.id);
    if (row === undefined)
      throw new RangeError(`${where}parkedRows names an unknown row ${entry.id}`);
    if (row.parks === undefined)
      throw new RangeError(`${where}parkedRows names ${entry.id}, a row that carries no parks`);
    if (!Array.isArray(entry.parks) || entry.parks.some((id) => !row.parks.includes(id)))
      throw new RangeError(
        `${where}parkedRows entry ${entry.id} names controls the row does not guard (${row.parks.join(', ')})`,
      );
  }
}

/**
 * The committed parked list of a ship (6.2; docs/RETURN.md section 1 rule 2):
 * `docs/gslides-parity/focus/ship-<commit>.json` with `{ "commit": "<sha>", "parkedFeatures":
 * [...], "parkedRows": [{ "id", "parks" }] }` (`parkedRows` optional; rendered from a run, never
 * typed). Returns the list, checked against the feature names and the matrix; an unparkable
 * feature is refused here as it is in `shipVerdict`, and a parkedRows entry must name a row that
 * carries `parks` and only the controls that row guards.
 */
export function readParkedList(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const list = parsed?.parkedFeatures;
  if (!Array.isArray(list)) throw new Error(`${path}: no parkedFeatures list`);
  const parkedRows = parsed?.parkedRows ?? [];
  if (!Array.isArray(parkedRows)) throw new Error(`${path}: parkedRows is not a list`);
  checkParkedList(list, parkedRows, `${path}: `);
  return {
    commit: typeof parsed.commit === 'string' ? parsed.commit : null,
    parkedFeatures: list,
    parkedRows: parkedRows.map((entry) => ({ id: entry.id, parks: [...entry.parks] })),
  };
}

/**
 * The exit rule of 6.2 over a run and the ship's committed parked list: every core id must be
 * `passed` unless its feature is in `parkedFeatures` or the row itself is in `parkedRows` (a row
 * carrying `parks`, whose own controls stay behind the switch for the ship); an unparkable
 * feature cannot be listed. `parked` is the array of features (the focus round's form) or the
 * object `readParkedList` returns. Returns `ok` and the ids that fail it with their result.
 * `rows` narrows the rule to one driver's rows.
 */
export function shipVerdict(results, parked = [], rows = CORE_MATRIX) {
  const { parkedFeatures, parkedRows } = parkedOf(parked);
  checkParkedList(parkedFeatures, parkedRows, '');
  const parkedIds = new Set(parkedRows.map((entry) => entry.id));
  const failures = [];
  for (const row of rows) {
    const result = results[row.id] ?? 'not driven';
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${row.id}: unknown result ${result}`);
    if (result === 'passed' || parkedFeatures.includes(row.feature) || parkedIds.has(row.id))
      continue;
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
        `  ${driver.padEnd(24)} ${String(rowsForDriver(driver).length).padStart(3)} rows`,
      );
    const withParks = CORE_MATRIX.filter((row) => row.parks !== undefined);
    console.log(
      `  ${withParks.length} rows carry parks; unparkable features: ${UNPARKABLE_FEATURES.join(', ')}`,
    );
  }
}

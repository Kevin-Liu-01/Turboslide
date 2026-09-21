// Renders the README section "What works today" (docs/FOCUS.md section 7) from the core matrix
// (`docs/gslides-parity/focus/core-matrix.json`, read through `scripts/probes/core-matrix.mjs`) and
// the paragraphs of `docs/readme/what-works-data.mjs`, between the markers
// `<!-- what-works:begin -->` and `<!-- what-works:end -->` in README.md. A feature's paragraph and
// its pictures appear only while every row of the feature passes; a feature with a failed or not
// driven row is listed as held, with the rows that hold it. Every count is computed from the file.
//
//   node docs/readme/what-works.mjs                      writes README.md from the matrix's "today"
//   node docs/readme/what-works.mjs --results <run.json> writes it from a run's results
//   node docs/readme/what-works.mjs --check              exits 1 when README.md is not what it would write
//   node docs/readme/what-works.mjs --print              prints the section and writes nothing
//
// Without `--results` a row's result is read from the matrix's `today` field (works is passed,
// broken and flaky are failed, not driven stays not driven), which is what the focus audits saw
// on production on the date the matrix names. With `--results` the file is a run of FOCUS.md 6.2:
// `{ "commit", "origin", "date", "results": { "<id>": "passed" | "failed" | "not driven" } }`, or
// the `results` map alone; an id the run does not name is not driven (the rule of
// `parkedFeaturesOf`). Node only; no dependency.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_FEATURES,
  CORE_MATRIX,
  CORE_MATRIX_PATH,
  RUN_RESULTS,
  coreRow,
  isManualRow,
  isMeasureRow,
  parkedFeaturesOf,
} from '../../scripts/probes/core-matrix.mjs';
import { FEATURES, LEAD, OUTPUTS_SENTENCE } from './what-works-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const README_PATH = join(ROOT, 'README.md');
export const BEGIN = '<!-- what-works:begin -->';
export const END = '<!-- what-works:end -->';
const MATRIX_REL = relative(ROOT, CORE_MATRIX_PATH);
const SELF_REL = 'docs/readme/what-works.mjs';
const SHOTS_REL = 'docs/readme';

const code = (s) => `\`${s}\``;

/** The date the matrix's `$comment` names as the day the audits ran. */
export function matrixDate() {
  const { $comment } = JSON.parse(readFileSync(CORE_MATRIX_PATH, 'utf8'));
  const m = /on (\d{4}-\d{2}-\d{2})/.exec($comment ?? '');
  if (!m) throw new Error(`${MATRIX_REL}: the $comment names no date`);
  return m[1];
}

/** The results the matrix's `today` field implies: works passed, broken and flaky failed. */
export function resultsFromToday() {
  const out = {};
  for (const row of CORE_MATRIX)
    out[row.id] =
      row.today === 'works' ? 'passed' : row.today === 'not driven' ? 'not driven' : 'failed';
  return out;
}

/** Reads a run file of 6.2 (or a bare results map) and validates every result word. */
export function readResults(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const results = parsed.results ?? parsed;
  if (typeof results !== 'object' || results === null || Array.isArray(results))
    throw new Error(`${path}: expected a results object`);
  for (const [id, result] of Object.entries(results)) {
    coreRow(id);
    if (!RUN_RESULTS.includes(result)) throw new RangeError(`${path}: ${id} has result ${result}`);
  }
  return {
    results,
    commit: parsed.commit,
    origin: parsed.origin,
    date: parsed.date,
  };
}

/**
 * The section as markdown, without the markers. `run` carries the results and, when they come
 * from a run, its commit, origin and date; the source line says which. With `fromToday` the held
 * rows print the matrix's own word for the row (broken, flaky or not driven) instead of a run's.
 */
export function renderSection(run) {
  const { results } = run;
  const featureOf = new Map(FEATURES.map((f) => [f.key, f]));
  for (const key of CORE_FEATURES)
    if (!featureOf.has(key)) throw new Error(`what-works-data.mjs has no entry for ${key}`);
  const { red } = parkedFeaturesOf(results);
  const rowsOf = (key) => CORE_MATRIX.filter((r) => r.feature === key);
  /* from the matrix's own reading the row keeps its audit word (broken, flaky, not driven); from a run it carries the run's */
  const wordOf = (r) => (run.fromToday ? coreRow(r.id).today : r.result);
  const lines = [];
  lines.push('## What works today');
  lines.push('');
  lines.push(LEAD);
  lines.push('');
  const source =
    run.commit !== undefined || run.origin !== undefined
      ? `the run against ${run.origin ?? 'the deployment'}${run.commit ? ` at ${code(run.commit)}` : ''}${run.date ? ` on ${run.date}` : ''}`
      : `what the focus audits saw on production on ${run.date}`;
  lines.push(
    `_Rendered from ${code(MATRIX_REL)} by ${code(SELF_REL)}, from ${source}. A feature appears below only while every row of its part of the matrix passes; the rest of the matrix is listed under "Held until every row passes". [docs/FOCUS.md](docs/FOCUS.md) is the specification._`,
  );
  const passing = FEATURES.filter((f) => !red[f.key]);
  const held = FEATURES.filter((f) => red[f.key]);
  if (passing.length === 0) {
    lines.push('');
    lines.push(
      'No feature has every row passing yet, so this section holds no feature paragraph until a release whose run passes them.',
    );
  }
  for (const f of passing) {
    lines.push('');
    lines.push(f.paragraph);
    for (const shot of f.shots) {
      lines.push('');
      lines.push(`<img alt="${shot.alt.replace(/"/g, '&quot;')}" src="${SHOTS_REL}/${shot.file}">`);
      lines.push('');
      lines.push(`_${shot.caption}_`);
    }
  }
  const outputsPass = OUTPUTS_SENTENCE.rows.every((id) => {
    coreRow(id);
    return results[id] === 'passed';
  });
  if (outputsPass) {
    lines.push('');
    lines.push(OUTPUTS_SENTENCE.text);
  }
  /* the manual rows of the orchestrator's ruling (3): a run leaves them not driven, they hold
     nothing and they are never counted as passed; the checklist step is the seller's walk */
  const manual = CORE_MATRIX.filter((r) => isManualRow(r) && results[r.id] !== 'passed');
  if (manual.length > 0) {
    lines.push('');
    lines.push(
      `Walked by hand, never counted as passed by a run (docs/gslides-parity/focus/manual-checklist.md): ${manual
        .map((r) => code(r.id))
        .join(', ')}.`,
    );
  }
  /* the measurement rows of docs/PRODUCT.md 8.2: a red one is recorded with its number and never
     holds a release or a feature's paragraph; the ship note carries it by id with its mechanism */
  const measured = CORE_MATRIX.filter((r) => isMeasureRow(r) && results[r.id] !== 'passed');
  if (measured.length > 0) {
    lines.push('');
    lines.push(
      `Measured and recorded, never holding a release (docs/PRODUCT.md 8.2): ${measured
        .map(
          (r) => `${code(r.id)} (${wordOf({ id: r.id, result: results[r.id] ?? 'not driven' })})`,
        )
        .join(', ')}.`,
    );
  }
  if (held.length > 0) {
    lines.push('');
    lines.push('### Held until every row passes');
    lines.push('');
    lines.push(
      'A feature is in the default view only when every one of its interactions passes on the preview and on production (docs/FOCUS.md section 1). Each feature below has a row that failed or was not driven in the run above, so its menu rows sit behind Tools > Advanced tools until the rows named pass; the switch itself cannot be parked, and a failed or not driven row of it blocks the release.',
    );
    lines.push('');
    for (const f of held) {
      const rows = red[f.key];
      lines.push(
        `- ${f.heading}: ${rows.length} of ${rowsOf(f.key).length} rows hold it: ${rows
          .map((r) => `${code(r.id)} (${wordOf(r)})`)
          .join(', ')}.`,
      );
    }
  }
  return lines.join('\n');
}

/** README.md with the block between the markers replaced by `section`. */
export function splice(readme, section) {
  const a = readme.indexOf(BEGIN);
  const b = readme.indexOf(END);
  if (a < 0 || b < 0 || b < a)
    throw new Error(`README.md must carry ${BEGIN} before ${END} exactly once`);
  return `${readme.slice(0, a + BEGIN.length)}\n\n${section}\n\n${readme.slice(b)}`;
}

function runOf(argv) {
  const i = argv.indexOf('--results');
  if (i >= 0) return readResults(argv[i + 1]);
  return { results: resultsFromToday(), date: matrixDate(), fromToday: true };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const section = renderSection(runOf(argv));
  if (argv.includes('--print')) {
    console.log(section);
  } else {
    const readme = readFileSync(README_PATH, 'utf8');
    const next = splice(readme, section);
    if (argv.includes('--check')) {
      if (next !== readme) {
        console.error(
          `what-works: README.md is not what ${SELF_REL} renders; run node ${SELF_REL} and prettier`,
        );
        process.exit(1);
      }
      console.log('what-works: README.md is current');
    } else {
      writeFileSync(README_PATH, next);
      console.log(`wrote README.md: ${section.split('\n').length} lines between the markers`);
    }
  }
}

#!/usr/bin/env node
// The vector round's copy of the features round's renderer (docs/VECTOR.md 6.2: one gate run of
// record on the enforce preview and the once rerun of the spec files that carried a red row, in
// place of the two runs of docs/FEATURES.md 7.2; the rule sentence is the one change). Renders a
// ship's parked list from its gate runs of record (docs/FEATURES.md 7.2; docs/RETURN.md
// section 1 rule 2): a row carrying `parks` that is red in the last reading of every run named
// parks its controls (`parkedRows`); a parkable feature red through a row without `parks` in every
// run is parked whole (`parkedFeatures`); a row or feature red in one run and green in another is
// flaky and is not listed. A row of a feature the list parks whole is not listed a second time in
// `parkedRows`: the feature's flag already hides its controls. The previous ship's list is carried
// forward for the features and rows its `advanced` flags still hold (`--carry <ship json>`),
// because the switch's flags in menus/model.ts follow the list and a row this ship did not drive
// green stays where it was; a carried row green in every run leaves the list (`leaves`) and the
// ship step lifts its flag.
//
// The ship rule makes exceptions the gate's mechanical `wouldPark` cannot (FEATURES.md sections 1
// and 7.2; PRODUCT.md 8.2): a feature named `--not-feature <name>=<why>` is not parked and a row
// named `--not-row <id>=<why>` is not listed, each written into the list's `notParked` with its
// reason so the exception is on the record and never typed into the list by hand. The cases this
// round names: a P1 row whose control is not on the build (its `not driven` is the P1 condition of
// section 1, not a red control), a row not driven by design on the deployment of record with its
// unit test named, and the assist's quota row, which PRODUCT.md 8.2 exempts as the environment's.
//
// Prints the list and the rows that differ between the runs; `--write <path>` writes it with the
// commit and the rule.
//
//   node render-ship-json.mjs --commit <sha> --run <gate.json> --run <gate.json> [--carry <ship json>]
//     [--not-feature <name>=<why>]... [--not-row <id>=<why>]... [--preview <url>] [--built-from <sha>]
//     [--write <path>]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const argv = process.argv.slice(2);
const values = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const one = (name) => values(name)[0];
const runs = values('run').map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) }));
if (runs.length === 0) {
  console.error(
    'usage: render-ship-json.mjs --commit <sha> --run <gate.json> [--run ...] [--carry <ship json>] [--not-feature <name>=<why>]... [--not-row <id>=<why>]... [--write <path>]',
  );
  process.exit(2);
}
const carry = one('carry') ? JSON.parse(readFileSync(one('carry'), 'utf8')) : null;
/** `<name>=<why>` pairs of an exception flag, as `{ name, why }`. */
const exceptions = (flag) =>
  values(flag).map((pair) => {
    const at = pair.indexOf('=');
    if (at <= 0) {
      console.error(`--${flag} takes <name>=<why>, got ${pair}`);
      process.exit(2);
    }
    return { name: pair.slice(0, at), why: pair.slice(at + 1) };
  });
const notFeatures = exceptions('not-feature');
const notRows = exceptions('not-row');

const redRowsPerRun = runs.map((r) => new Map(r.json.wouldParkRows.map((e) => [e.id, e])));
const redFeaturesPerRun = runs.map((r) => new Set(r.json.wouldPark));

/** Red in every run. */
const inEvery = (id, maps) => maps.every((m) => m.has(id));
const parkedRows = [];
const flakyRows = [];
for (const [id, entry] of redRowsPerRun[0]) {
  if (inEvery(id, redRowsPerRun)) parkedRows.push({ id, parks: [...entry.parks] });
  else flakyRows.push(id);
}
for (let i = 1; i < redRowsPerRun.length; i += 1)
  for (const id of redRowsPerRun[i].keys())
    if (!redRowsPerRun[0].has(id) && !flakyRows.includes(id)) flakyRows.push(id);

let parkedFeatures = [...redFeaturesPerRun[0]].filter((f) =>
  redFeaturesPerRun.every((s) => s.has(f)),
);
const flakyFeatures = [
  ...new Set(runs.flatMap((r) => r.json.wouldPark).filter((f) => !parkedFeatures.includes(f))),
];

/* the previous ship's list carried forward: its features and rows keep their flags unless every
   run of this ship read them green (then they leave the list and the ship step lifts the flag) */
const leaves = [];
if (carry) {
  for (const feature of carry.parkedFeatures ?? []) {
    const greenEverywhere = runs.every((r) => !r.json.wouldPark.includes(feature));
    if (!parkedFeatures.includes(feature) && !greenEverywhere) parkedFeatures.push(feature);
    if (greenEverywhere) {
      leaves.push({ feature, why: 'read green in every run of this ship' });
      console.log(`carried feature ${feature} read green in every run: not listed`);
    }
  }
  for (const row of carry.parkedRows ?? []) {
    const greenEverywhere = runs.every(
      (r) => (r.json.results?.[row.id] ?? 'not driven') === 'passed',
    );
    if (!parkedRows.some((e) => e.id === row.id) && !greenEverywhere)
      parkedRows.push({ id: row.id, parks: [...row.parks] });
    if (greenEverywhere) {
      leaves.push({
        id: row.id,
        controls: [...row.parks],
        why: 'read green in every run of this ship',
      });
      console.log(`carried row ${row.id} read green in every run: not listed`);
    }
  }
}

/* the ship rule's exceptions, each on the record */
const notParked = [];
for (const { name, why } of notFeatures) {
  const wouldPark = parkedFeatures.includes(name) || flakyFeatures.includes(name);
  parkedFeatures = parkedFeatures.filter((f) => f !== name);
  notParked.push({
    feature: name,
    why: `${wouldPark ? "the gate's wouldPark names it; " : ''}${why}`,
  });
  console.log(`feature ${name} not parked by the ship rule: ${why}`);
}
for (const { name, why } of notRows) {
  const entry = parkedRows.find((e) => e.id === name);
  if (entry === undefined)
    console.log(`row ${name} named by --not-row is not in the rendered parkedRows`);
  else {
    parkedRows.splice(parkedRows.indexOf(entry), 1);
    notParked.push({ id: name, controls: [...entry.parks], why });
    console.log(`row ${name} not listed by the ship rule: ${why}`);
  }
}

/* a row of a feature parked whole is hidden by the feature's flag already */
const featureOf = (id) => {
  for (const r of runs) {
    const hit = r.json.verdict?.failures?.find((f) => f.id === id);
    if (hit?.feature) return hit.feature;
  }
  return id.split('.')[0];
};
const subsumed = parkedRows
  .filter((e) => parkedFeatures.includes(featureOf(e.id)))
  .map((e) => e.id);
for (const id of subsumed) {
  parkedRows.splice(
    parkedRows.findIndex((e) => e.id === id),
    1,
  );
  console.log(`row ${id} is a row of a parked feature: not listed a second time`);
}

parkedRows.sort((a, b) => a.id.localeCompare(b.id));
parkedFeatures.sort();

const blocking = runs.map((r) => r.json.blocking.map((b) => b.id));
const blockingInEvery = blocking[0].filter((id) => blocking.every((list) => list.includes(id)));

console.log(
  `runs: ${runs.map((r) => `${r.path} (${r.json.passed} passed, ${r.json.failed} failed, ${r.json.notDriven} not driven)`).join('; ')}`,
);
console.log(`parkedFeatures: ${JSON.stringify(parkedFeatures)}`);
console.log(`parkedRows: ${JSON.stringify(parkedRows)}`);
console.log(`flaky rows (red in some run, not every run): ${JSON.stringify(flakyRows)}`);
console.log(`flaky features: ${JSON.stringify(flakyFeatures)}`);
console.log(
  `blocking rows red in every run (an unparkable feature): ${JSON.stringify(blockingInEvery)}`,
);
console.log(`blocking rows per run: ${JSON.stringify(blocking)}`);

const out = one('write');
if (out) {
  const carryName = one('carry') ? basename(one('carry')) : 'no earlier list';
  const list = {
    commit: one('commit') ?? null,
    renderedFrom: runs.map((r) => r.path.replace(/^.*?docs\//, 'docs/')),
    rule: `docs/VECTOR.md 6.2 and docs/RETURN.md section 1 rule 2: parkedFeaturesOf over the last readings of the one gate run of record and the once rerun of the spec files that carried a red row on the enforce preview ${one('preview') ?? ''} built from ${one('built-from') ?? one('commit') ?? 'the ship commit'}; a row carrying parks red in both runs parks the controls it names, a parkable feature red through a row without parks in both runs is parked whole, a row of a feature parked whole is not listed a second time, and a row or feature red in one run and green in the other is flaky and is not listed; the previous ship's list (${carryName}) is carried forward where its rows did not read green in both runs, since the menu model's advanced flags follow this list, and a carried row green in both runs leaves it (leaves); the exceptions the ship rule makes over the gate's mechanical wouldPark are in notParked, each with its reason`,
    parkedFeatures,
    parkedRows,
    notParked,
    leaves,
  };
  writeFileSync(out, `${JSON.stringify(list, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

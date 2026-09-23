#!/usr/bin/env node
// Renders a ship's parked list from its gate runs of record (docs/FEATURES.md 7.2; docs/RETURN.md
// section 1 rule 2): a row carrying `parks` that is red in the last reading of every run named
// parks its controls (`parkedRows`); a parkable feature red through a row without `parks` in every
// run is parked whole (`parkedFeatures`); a row or feature red in one run and green in another is
// flaky and is not listed. The previous ship's list is carried forward for the features and rows
// its `advanced` flags still hold (`--carry <ship json>`), because the switch's flags in menus/model.ts
// follow the list and a row this ship did not drive green stays where it was. Prints the list and
// the rows that differ between the runs; `--write <path>` writes it with the commit and the rule.
//
//   node render-ship-json.mjs --commit <sha> --run <gate.json> --run <gate.json> [--carry <ship json>]
//     [--preview <url>] [--write <path>]
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const values = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const one = (name) => values(name)[0];
const runs = values('run').map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) }));
if (runs.length === 0) {
  console.error('usage: render-ship-json.mjs --commit <sha> --run <gate.json> [--run ...] [--carry <ship json>] [--write <path>]');
  process.exit(2);
}
const carry = one('carry') ? JSON.parse(readFileSync(one('carry'), 'utf8')) : null;

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

const parkedFeatures = [...redFeaturesPerRun[0]].filter((f) => redFeaturesPerRun.every((s) => s.has(f)));
const flakyFeatures = [
  ...new Set(runs.flatMap((r) => r.json.wouldPark).filter((f) => !parkedFeatures.includes(f))),
];

/* the previous ship's list carried forward: its features and rows keep their flags unless every
   run of this ship read them green (then they leave the list and the fix round lifts the flag) */
if (carry) {
  for (const feature of carry.parkedFeatures ?? []) {
    const greenEverywhere = runs.every((r) => !r.json.wouldPark.includes(feature));
    if (!parkedFeatures.includes(feature) && !greenEverywhere) parkedFeatures.push(feature);
    if (greenEverywhere) console.log(`carried feature ${feature} read green in every run: not listed`);
  }
  for (const row of carry.parkedRows ?? []) {
    const greenEverywhere = runs.every((r) => (r.json.results?.[row.id] ?? 'not driven') === 'passed');
    if (!parkedRows.some((e) => e.id === row.id) && !greenEverywhere)
      parkedRows.push({ id: row.id, parks: [...row.parks] });
    if (greenEverywhere) console.log(`carried row ${row.id} read green in every run: not listed`);
  }
}
parkedRows.sort((a, b) => a.id.localeCompare(b.id));
parkedFeatures.sort();

const blocking = runs.map((r) => r.json.blocking.map((b) => b.id));
const blockingInEvery = blocking[0].filter((id) => blocking.every((list) => list.includes(id)));

console.log(`runs: ${runs.map((r) => `${r.path} (${r.json.passed} passed, ${r.json.failed} failed, ${r.json.notDriven} not driven)`).join('; ')}`);
console.log(`parkedFeatures: ${JSON.stringify(parkedFeatures)}`);
console.log(`parkedRows: ${JSON.stringify(parkedRows)}`);
console.log(`flaky rows (red in some run, not every run): ${JSON.stringify(flakyRows)}`);
console.log(`flaky features: ${JSON.stringify(flakyFeatures)}`);
console.log(`blocking rows red in every run (an unparkable feature): ${JSON.stringify(blockingInEvery)}`);
console.log(`blocking rows per run: ${JSON.stringify(blocking)}`);

const out = one('write');
if (out) {
  const list = {
    commit: one('commit') ?? null,
    renderedFrom: runs.map((r) => r.path.replace(/^.*?docs\//, 'docs/')),
    rule: `docs/FEATURES.md 7.2 and docs/RETURN.md section 1 rule 2: parkedFeaturesOf over the last readings of the two gate runs of record on the enforce preview ${one('preview') ?? ''} built from ${one('commit') ?? 'the ship commit'}; a row carrying parks red in both runs parks the controls it names, a parkable feature red through a row without parks in both runs is parked whole, and a row or feature red in one run and green in the other is flaky and is not listed; the previous ship's list (ship-7ea3db9.json) is carried forward where its rows did not read green in both runs, since the menu model's advanced flags follow this list`,
    parkedFeatures,
    parkedRows,
  };
  writeFileSync(out, `${JSON.stringify(list, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

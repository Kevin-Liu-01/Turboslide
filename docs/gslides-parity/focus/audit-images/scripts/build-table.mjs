#!/usr/bin/env node
// Builds the audit table: every chosen row from the run JSON files, joined with the auditor's
// judgement (severity, need, why) from judgement.json, written as a Markdown table and as the
// structured rows JSON. Evidence is copied from the runs, never retyped.
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus/audit-images';
const runs = {};
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  try {
    runs[n] = JSON.parse(readFileSync(`${DIR}/run-${n}.json`, 'utf8'));
  } catch {
    runs[n] = null;
  }
}
const judgement = JSON.parse(readFileSync(new URL('./judgement.json', import.meta.url), 'utf8'));

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)} …` : s);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rowsOut = [];
const lines = [];
lines.push('| # | Feature | Interaction | Result | Evidence | Severity | Need | Why |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
let i = 0;
for (const j of judgement) {
  i += 1;
  let evidence = j.evidence ?? '';
  let result = j.result;
  let interaction = j.interaction;
  let feature = j.feature;
  if (j.from) {
    const parts = [];
    for (const ref of j.from) {
      const run = runs[ref.run];
      const row = run?.table.find((r) => r.n === ref.n);
      if (!row) {
        parts.push(`run ${ref.run} row ${ref.n}: missing`);
        continue;
      }
      feature ??= row.feature;
      interaction ??= row.interaction;
      result ??= row.result;
      parts.push(`run ${ref.run} (deck ${run.deckId}) row ${ref.n} ${row.result}: ${clip(row.evidence, ref.clip ?? 700)}`);
    }
    evidence = [evidence, ...parts].filter(Boolean).join(' ');
  }
  if (j.shots) evidence += ` Screenshots: ${j.shots.join(', ')}.`;
  const out = { feature, interaction, result, evidence, severity: j.severity, need: j.need, why: j.why };
  rowsOut.push(out);
  lines.push(`| ${i} | ${cell(feature)} | ${cell(interaction)} | ${cell(result)} | ${cell(evidence)} | ${j.severity} | ${j.need} | ${cell(j.why)} |`);
}
writeFileSync(new URL('./table.md', import.meta.url), lines.join('\n') + '\n');
writeFileSync(new URL('./rows.json', import.meta.url), JSON.stringify(rowsOut, null, 2));
const counts = { works: 0, broken: 0, flaky: 0, 'not driven': 0 };
for (const r of rowsOut) counts[r.result] = (counts[r.result] ?? 0) + 1;
console.log(`${rowsOut.length} rows: ${JSON.stringify(counts)}`);

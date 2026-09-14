#!/usr/bin/env node
// Summarizes a parity audit report: totals, the misses with their evidence, the skipped rows by
// reason. node summarize-audit.mjs <parity-audit.json> [--skips]
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const j = JSON.parse(readFileSync(file, 'utf8'));
const rows = j.rows ?? j.items ?? [];
const status = (r) =>
  r.pass === true ? 'pass' : r.pass === false ? 'fail' : r.pass === null ? 'skip' : 'unknown';
const counts = {};
for (const r of rows) counts[status(r)] = (counts[status(r)] ?? 0) + 1;
console.log(
  'summary',
  JSON.stringify(j.summary),
  'counted',
  JSON.stringify(counts),
  'sections',
  Object.keys(j.totals ?? {}).length,
  'meta',
  JSON.stringify({
    base: j.base,
    deck: j.scratchDeck,
    seconds: j.seconds,
    prompts: j.namePromptAnswered,
    pageErrors: j.pageErrors?.length,
  }),
);
for (const r of rows.filter((r) => status(r) === 'fail'))
  console.log(
    `FAIL ${r.section ?? r.menu} ${r.id ?? r.name}: ${String(r.evidence ?? r.detail ?? '')
      .slice(0, 260)
      .replace(/\s+/g, ' ')}`,
  );
if (process.argv.includes('--skips'))
  for (const r of rows.filter((r) => status(r) === 'skip'))
    console.log(
      `skip ${r.section ?? r.menu} ${r.id ?? r.name}: ${String(r.evidence ?? '').slice(0, 160)}`,
    );

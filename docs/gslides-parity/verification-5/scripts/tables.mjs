#!/usr/bin/env node
// Builds the markdown tables of VERIFICATION-5.md from the run outputs under verification-5/
// (nothing typed by hand): `check` reads logs/check-from-*.log into the 37 step table; `perf`
// reads a perf-budget JSON beside the day 0 baseline into the budget table (every asserted row
// with its ceiling and the baseline's value); `walk` summarises a probe or walk JSON table.
//   node docs/gslides-parity/verification-5/scripts/tables.mjs check
//   node docs/gslides-parity/verification-5/scripts/tables.mjs perf <run.json> [<baseline.json>]
//   node docs/gslides-parity/verification-5/scripts/tables.mjs walk <table.json>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const V = 'docs/gslides-parity/verification-5';
const [mode, a, b] = process.argv.slice(2);

if (mode === 'check') {
  const logs = readdirSync(`${V}/logs`)
    .filter((f) => /^check-from-\d+\.log$/.test(f))
    .sort((x, y) => Number(x.match(/\d+/)[0]) - Number(y.match(/\d+/)[0]));
  const steps = new Map();
  for (const file of logs) {
    const text = readFileSync(`${V}/logs/${file}`, 'utf8');
    for (const m of text.matchAll(
      /^check\s+(\d+)\/37: (ok in ([\d.]+) s|FAIL exit (\d+) after ([\d.]+) s|skip.*|not yet.*)$/gm,
    )) {
      const n = Number(m[1]);
      if (!steps.has(n)) steps.set(n, { n, result: m[2], file });
    }
    for (const m of text.matchAll(/^check\s+(\d+)\/37: (.*)$/gm)) {
      const n = Number(m[1]);
      const line = m[2];
      if (/^(ok in|FAIL exit)/.test(line)) continue;
      const row = steps.get(n) ?? { n, file };
      if (!row.command) row.command = line.slice(0, 120);
      if (!steps.has(n)) steps.set(n, row);
    }
  }
  const list = readFileSync(`${V}/check-list-merge2-2026-09-15.txt`, 'utf8').split('\n');
  console.log('| Step | Command (abridged) | Result |');
  console.log('| ---- | ------------------ | ------ |');
  for (let n = 1; n <= 37; n += 1) {
    const row = steps.get(n);
    const listed = list.find((l) => new RegExp(`^\\s*${n}\\s`).test(l)) ?? '';
    const cmd = listed
      .replace(/^\s*\d+\s+/, '')
      .replace(/\|/g, '\\|')
      .slice(0, 110);
    console.log(
      `| ${n} | \`${cmd}\` | ${row ? row.result.replace(/\|/g, '\\|') : 'not reached'} |`,
    );
  }
}

if (mode === 'perf') {
  const run = JSON.parse(readFileSync(resolve(a), 'utf8'));
  const base = JSON.parse(
    readFileSync(resolve(b ?? `${V}/perf-budget-production-2026-09-15.json`), 'utf8'),
  );
  const baseRows = new Map((base.rows ?? []).map((r) => [r.name, r]));
  const fmt = (r) =>
    r === undefined || r.value === undefined || r.value === null
      ? 'n/a'
      : typeof r.value === 'number'
        ? `${Math.round(r.value * 100) / 100}${r.unit ? ` ${r.unit}` : ''}`
        : String(r.value);
  console.log(
    `Run: ${run.base} (${run.profile}), ${run.startedAt} to ${run.finishedAt}. Baseline: ${base.base}, ${base.startedAt}.`,
  );
  console.log('');
  console.log('| Check | Row | Value | Ceiling | Verdict | Baseline (production, day 0) |');
  console.log('| ----- | --- | ----- | ------- | ------- | ---------------------------- |');
  let met = 0;
  let asserted = 0;
  for (const r of run.rows ?? []) {
    const asserts = r.limit !== null && r.limit !== undefined;
    if (asserts) {
      asserted += 1;
      if (r.ok) met += 1;
    }
    const bl = baseRows.get(r.name);
    console.log(
      `| ${r.check} | ${r.name} | ${fmt(r)} | ${asserts ? `${r.limit}${r.unit ? ` ${r.unit}` : ''} (${r.kind})` : 'reported'} | ${asserts ? (r.ok ? 'ok' : 'MISS') : 'info'} | ${bl ? `${fmt(bl)}${bl.limit !== null && bl.limit !== undefined ? (bl.ok ? ' ok' : ' MISS') : ''}` : 'no row'} |`,
    );
  }
  console.log('');
  console.log(
    `${met} of ${asserted} asserted rows met (the baseline read ${(base.rows ?? []).filter((r) => r.limit !== null && r.limit !== undefined && r.ok).length} of ${(base.rows ?? []).filter((r) => r.limit !== null && r.limit !== undefined).length}).`,
  );
}

if (mode === 'walk') {
  const json = JSON.parse(readFileSync(resolve(a), 'utf8'));
  const rows = json.rows ?? json.steps ?? [];
  const summary = json.summary ?? {};
  const ok = rows.filter((r) => r.ok === true).length;
  const fail = rows.filter((r) => r.ok === false).length;
  const skip = rows.filter((r) => r.ok === null).length;
  console.log(
    `${rows.length} rows: ${ok} ok, ${fail} failed, ${skip} not driven${summary.ms ? `, ${Math.round(summary.ms / 1000)} s` : ''}`,
  );
  for (const r of rows.filter((r) => r.ok !== true))
    console.log(
      `- ${r.ok === null ? 'not driven' : 'FAIL'} ${r.n ?? ''} ${r.id ?? ''} ${r.name ?? r.step ?? ''}: ${String(r.observed ?? r.evidence ?? '').slice(0, 300)}`,
    );
}

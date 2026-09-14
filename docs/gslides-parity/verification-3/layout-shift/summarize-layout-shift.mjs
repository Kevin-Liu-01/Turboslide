#!/usr/bin/env node
// Summarizes a layout shift audit report: cells at zero, the entries' sources, the anchor moves and
// the driven states per route. node summarize-layout-shift.mjs <layout-shift.json>
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const runs = j.runs;
const zero = runs.filter((r) => r.loadEntries.length === 0);
console.log(
  `${j.base}: ${runs.length} cells in ${Math.round(j.ms / 1000)} s; ${zero.length} at zero load entries, ${runs.length - zero.length} with entries; failures ${j.failures?.length ?? j.failures}; skipped states ${j.skipped?.length ?? j.skipped}`,
);
const byRoute = {};
for (const r of runs) {
  const key = r.route.replace(/gt-brand/, '<deck>');
  const b = (byRoute[key] ??= {
    cells: 0,
    withEntries: 0,
    maxCls: 0,
    sources: {},
    anchorMoveCells: 0,
    stateFails: {},
  });
  b.cells += 1;
  if (r.loadEntries.length > 0) b.withEntries += 1;
  b.maxCls = Math.max(b.maxCls, r.loadCls ?? 0);
  if ((r.loadAnchorMoves ?? []).some((m) => Array.isArray(m.to) && m.to.every((v) => v === 0)))
    b.anchorMoveCells += 1;
  for (const e of r.loadEntries)
    for (const s of e.sources ?? []) {
      const k = (s.path ?? s.selector ?? s.node ?? '?').split(' > ').pop();
      b.sources[k] = (b.sources[k] ?? 0) + 1;
    }
  for (const s of r.states ?? [])
    if (
      s.skipped === null &&
      ((s.entries?.length ?? 0) > 0 || (s.unexpected?.length ?? 0) > 0 || s.overBudget === true)
    ) {
      const k = `${s.name}${s.overBudget ? ' (frames)' : ''}${s.unexpected?.length ? ' (undeclared)' : ''}`;
      b.stateFails[k] = (b.stateFails[k] ?? 0) + 1;
    }
}
for (const [route, b] of Object.entries(byRoute)) {
  console.log(
    `${route}: ${b.cells} cells, ${b.withEntries} with load entries, max CLS ${b.maxCls.toFixed(4)}, unmount and remount seen in ${b.anchorMoveCells}; sources ${JSON.stringify(
      Object.entries(b.sources)
        .sort((a, c) => c[1] - a[1])
        .slice(0, 5),
    )}; state misses ${JSON.stringify(b.stateFails)}`,
  );
}
const first = runs.find((r) => r.loadEntries.length > 0);
if (first) console.log('example entry', JSON.stringify(first.loadEntries[0]).slice(0, 500));
const st = runs.find((r) => (r.states ?? []).length > 0);
if (st) console.log('example state', JSON.stringify(st.states[0]).slice(0, 500));

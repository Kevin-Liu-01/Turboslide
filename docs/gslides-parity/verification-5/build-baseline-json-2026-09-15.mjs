#!/usr/bin/env node
// Verifier day 0 (round five): assembles baseline-2026-09-15.json from the run outputs beside it.
// Reads only; every number comes from the JSON or text the scripts wrote (MILESTONES-5 "Verifier"
// item 1; the orchestrator's ruling 4). Run: node docs/gslides-parity/verification-5/build-baseline-json-2026-09-15.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const DATE = '2026-09-15';
const read = (name) => (existsSync(join(DIR, name)) ? readFileSync(join(DIR, name), 'utf8') : null);
const json = (name) => {
  const text = read(name);
  return text === null ? null : JSON.parse(text);
};
const stamps = (log) => {
  const text = read(log) ?? '';
  const started = text.match(/^started (\S+)/m)?.[1] ?? null;
  const finished = text.match(/finished (\S+)/)?.[1] ?? null;
  const exit = text.match(/exit=(\d+)/)?.[1];
  return { log, started, finished, exit: exit === undefined ? null : Number(exit) };
};

// the facts the runs were taken against (read from the tools on the day; recorded here once)
const facts = json('production-facts-2026-09-15.json');

// 1. perf-budget.mjs --profile deployment --runs 3 --report
const perf = json(`perf-budget-production-${DATE}.json`);
const perfOut = perf && {
  ...stamps(`perf-budget-production-${DATE}.log`),
  file: `perf-budget-production-${DATE}.json`,
  base: perf.base,
  profile: perf.profile,
  startedAt: perf.startedAt,
  finishedAt: perf.finishedAt,
  chromeFlags: perf.chromeFlags,
  asserted: perf.rows.filter((r) => r.limit !== null).length,
  met: perf.rows.filter((r) => r.limit !== null && r.ok).length,
  failures: perf.failures,
  misses: perf.rows
    .filter((r) => r.limit !== null && !r.ok)
    .map((r) => ({
      check: r.check,
      name: r.name,
      value: r.value,
      limit: r.limit,
      unit: r.unit,
      kind: r.kind,
    })),
  rows: perf.rows,
  routes: perf.routes.map((r) =>
    r.absent
      ? { route: r.route, absent: true }
      : {
          route: r.route,
          kind: r.kind,
          n: r.n,
          ttfb: r.ttfb,
          fcp: r.fcp,
          lcp: r.lcp,
          ready: r.ready,
          jsDecoded: r.jsDecoded,
          jsTransfer: r.jsTransfer,
          jsCount: r.jsCount,
          largestJs: r.largestJs,
          largestJsName: r.largestJsName,
          loafMax: r.loafMax,
          cls: r.cls,
          nodes: r.nodes,
          elements: r.elements,
          imagesBeforeReady: r.imagesBeforeReady,
          imagesAfterScroll: r.imagesAfterScroll,
          lcpEl: r.lcpEl,
          lcpUrl: r.lcpUrl,
          cards: r.cards,
          errors: r.errors,
          samples: (r.samples ?? []).map((s) => ({
            ttfb: s.ttfb,
            fcp: s.fcp,
            lcp: s.lcp,
            ready: s.ready,
            jsDecoded: s.jsDecoded,
            largestJs: s.largestJs,
            loafMax: s.loafMax,
            cls: s.cls,
            nodes: s.nodes,
            error: s.error ?? null,
          })),
        },
  ),
  transitions: perf.transitions,
  filmstrip: perf.filmstrip,
  idle: perf.idle,
  twins: perf.twins,
  cdn: perf.cdn,
  vitals: perf.vitals,
  write: perf.write,
};

// 2. layout-shift-audit.mjs --report
const ls = json(`layout-shift-production-${DATE}.json`);
const lsOut = ls && {
  ...stamps(`layout-shift-production-${DATE}.log`),
  file: `layout-shift-production-${DATE}.json`,
  base: ls.base,
  deck: ls.deck,
  startedAt: ls.startedAt,
  seconds: Math.round(ls.ms / 1000),
  renderer: ls.renderer,
  version: ls.version,
  cells: ls.cells,
  failureCount: ls.failures.length,
  skippedCount: ls.skipped.length,
  cellsAtZeroLoadEntries: ls.runs.filter((r) => !r.error && (r.loadEntries?.length ?? 0) === 0)
    .length,
  cellsWithErrors: ls.runs.filter((r) => r.error).length,
  failures: ls.failures,
  skipped: ls.skipped,
  perCell: ls.runs.map((r) => ({
    cell: r.cell,
    status: r.error ? 'error' : (r.status ?? null),
    error: r.error ?? null,
    loadCls: r.loadCls ?? null,
    loadEntries: r.loadEntries?.length ?? null,
    statesRun: (r.states ?? []).filter((s) => s.skipped === null).length,
    statesSkipped: (r.states ?? []).filter((s) => s.skipped !== null).length,
  })),
};

// 3. gslides-parity-audit.mjs --report
const pa = json(`parity-audit-production-${DATE}.json`);
const paOut = pa && {
  ...stamps(`parity-audit-production-${DATE}.log`),
  file: `parity-audit-production-${DATE}.json`,
  base: pa.base,
  at: pa.at,
  commit: pa.commit,
  seconds: pa.seconds,
  scratchDeck: pa.scratchDeck,
  summary: pa.summary,
  perSection: pa.perSection,
  totals: pa.totals,
  pageErrors: pa.pageErrors,
  scratchDeckCleanup: (read(`remove-scratch-deck-${DATE}.txt`) ?? '').split('\n').filter(Boolean),
  failures: pa.rows
    .filter((r) => r.pass === false)
    .map((r) => ({
      section: r.section,
      id: r.id,
      menu: r.menu ?? null,
      status: r.status ?? null,
      evidence:
        typeof r.evidence === 'string'
          ? r.evidence.slice(0, 300)
          : JSON.stringify(r.evidence ?? { wanted: r.wanted, observed: r.observed }).slice(0, 300),
    })),
};

// 4. hosted-smoke.mjs
const hs = read(`hosted-smoke-production-${DATE}.txt`);
const hsOut = hs && {
  ...stamps(`hosted-smoke-production-${DATE}.txt`),
  file: `hosted-smoke-production-${DATE}.txt`,
  verdict: hs.match(/^(\d+)\/(\d+) passed against (\S+)/m)?.[0] ?? null,
  passed: Number(hs.match(/^(\d+)\/(\d+) passed/m)?.[1] ?? NaN),
  total: Number(hs.match(/^(\d+)\/(\d+) passed/m)?.[2] ?? NaN),
  skipped: hs
    .split('\n')
    .filter((l) => l.startsWith('skip  '))
    .map((l) => l.slice(6)),
  rows: hs
    .split('\n')
    .filter((l) => /^(\S.*?)\s{2,}(\d{3})\s+(\d+)\s+(pass|fail)\s+/.test(l))
    .map((l) => {
      const m = l.match(/^(.*?)\s{2,}(\d{3})\s+(\d+)\s+(pass|fail)\s+(.*)$/);
      return { path: m[1], status: Number(m[2]), ms: Number(m[3]), result: m[4], detail: m[5] };
    }),
};

// 5. check.mjs --list
const cl = read(`check-list-${DATE}.txt`);
const clOut = cl && {
  file: `check-list-${DATE}.txt`,
  rows: cl.split('\n').filter((l) => /^\s*\d+\s{2}/.test(l)).length,
  steps: cl
    .split('\n')
    .filter((l) => /^\s*\d+\s{2}/.test(l))
    .map((l) => {
      const m = l.match(/^\s*(\d+)\s{2}(\[[a-z-]+\]\s)?(.*)$/);
      return {
        step: Number(m[1]),
        needs: m[2] ? m[2].trim().slice(1, -1) : null,
        command: m[3].slice(0, 140),
      };
    }),
};

const baseline = {
  round: 5,
  day: 0,
  role: 'verifier',
  date: DATE,
  productionUrl: 'https://turboslide.vercel.app',
  facts,
  hostedSmoke: hsOut,
  checkList: clOut,
  perfBudget: perfOut,
  layoutShift: lsOut,
  parityAudit: paOut,
};
writeFileSync(join(DIR, `baseline-${DATE}.json`), `${JSON.stringify(baseline, null, 2)}\n`);
console.log(
  `baseline-${DATE}.json: hosted smoke ${hsOut?.verdict ?? 'missing'}; check --list ${clOut?.rows ?? 'missing'} rows; perf ${perfOut ? `${perfOut.met} of ${perfOut.asserted} met` : 'missing'}; layout shift ${lsOut ? `${lsOut.cells} cells, ${lsOut.failureCount} failures, ${lsOut.cellsAtZeroLoadEntries} at zero load entries` : 'missing'}; parity ${paOut ? `${paOut.summary.pass} / ${paOut.summary.fail} / ${paOut.summary.skip} in ${paOut.seconds} s` : 'missing'}`,
);

#!/usr/bin/env node
// The field vitals report (gslides-parity SPEC-5 11; SPEC-4 4.7): the p75 per route family and
// metric of the samples POST /api/vitals recorded. Reads a studio's report endpoint or a local
// `vitals/<date>.jsonl` file (the instance's state folder, `.turboslide/vitals/` on a checkout):
//
//   node scripts/vitals-report.mjs --base https://<deployment>        (GET /api/vitals?report=1)
//   node scripts/vitals-report.mjs --file .turboslide/vitals/2026-09-15.jsonl
//   node scripts/vitals-report.mjs --base <url> --json                (the report as JSON)
//
// Exit 0 with the table; 2 on a usage error or an unreachable endpoint. The INP ceiling of
// scripts/perf-budget.mjs (200 ms at p75 on the deployment profile) is printed beside the row so
// the table reads like the budget's; nothing here asserts, the budget script does.
import { readFileSync } from 'node:fs';

const INP_CEILING_MS = 200;

function args(argv) {
  const out = { base: null, file: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base' || arg === '--url') out.base = argv[++i] ?? null;
    else if (arg === '--file') out.file = argv[++i] ?? null;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function p75(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function reportOf(samples) {
  const routes = {};
  const byKey = new Map();
  for (const sample of samples) {
    const key = `${sample.route} ${sample.name}`;
    const list = byKey.get(key) ?? [];
    list.push(sample);
    byKey.set(key, list);
  }
  for (const [key, list] of byKey) {
    const [route, name] = key.split(' ');
    routes[route] ??= {};
    routes[route][name] = {
      p75: p75(list.map((sample) => sample.value)),
      count: list.length,
      good: list.filter((sample) => sample.rating === 'good').length,
    };
  }
  return { samples: samples.length, routes };
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help || (options.base === null && options.file === null)) {
    console.log(
      'usage: node scripts/vitals-report.mjs (--base <studio url> | --file <vitals jsonl>) [--json]',
    );
    process.exit(options.help ? 0 : 2);
  }
  let report;
  if (options.file !== null) {
    const samples = readFileSync(options.file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    report = reportOf(samples);
  } else {
    const base = options.base.endsWith('/') ? options.base : `${options.base}/`;
    const response = await fetch(new URL('api/vitals?report=1', base), {
      headers: process.env.VERCEL_OIDC_TOKEN
        ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
        : {},
    });
    if (!response.ok) {
      console.error(`${base}api/vitals?report=1 answered ${response.status}`);
      process.exit(2);
    }
    report = await response.json();
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`${report.samples} sample(s)`);
  console.log('route                 metric  p75       count  good   ceiling');
  const routes = Object.keys(report.routes).sort();
  for (const route of routes) {
    for (const name of ['INP', 'LCP', 'CLS']) {
      const row = report.routes[route][name];
      if (row === undefined) continue;
      const value = name === 'CLS' ? row.p75.toFixed(3) : `${Math.round(row.p75)} ms`;
      const ceiling = name === 'INP' ? `${INP_CEILING_MS} ms` : '';
      console.log(
        `${route.padEnd(21)} ${name.padEnd(7)} ${value.padEnd(9)} ${String(row.count).padEnd(6)} ${String(row.good).padEnd(6)} ${ceiling}`,
      );
    }
  }
  if (routes.length === 0) console.log('no samples yet: the shell posts one page load in ten');
}

await main();

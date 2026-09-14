#!/usr/bin/env node
// The ship step's commit path list (docs/gslides-parity/MILESTONES-3.md "Ship step"; the
// orchestrator's rule: only this round's source, tests, docs, evidence under verification-3 and
// build-3, the decks/ template and fixture assets, firewall/, packages/realtime and
// packages/identity). Reads `git status --porcelain -uall`, drops what never ships (the other
// workflow's `.github/`, `research-4/`, `design-4/`, `verification-4/`, `SPEC-4.md`,
// `MILESTONES-4.md`; the scratch decks a spec or a probe left under decks/; `scripts/__pycache__`),
// asserts no forbidden path is left (`.turboslide`, `.vercel`, `dist`, `target`, `node_modules`,
// `.log`, `.env`, `.sqlite`, `.tsbuildinfo`, `.pyc`) and prints one path per line. Untracked
// directories are expanded by `-uall`, so every path is a file.
//
//   node docs/gslides-parity/verification-3/ship/commit-paths.mjs > /tmp/paths.txt
import { execFileSync } from 'node:child_process';

const status = execFileSync('git', ['status', '--porcelain=v1', '-uall', '-z'], {
  cwd: '/Users/kevinliu/repos/Turboslide',
  maxBuffer: 64 * 1024 * 1024,
}).toString('utf8');

const EXCLUDED_PREFIXES = [
  '.github/',
  'docs/gslides-parity/research-4/',
  'docs/gslides-parity/design-4/',
  'docs/gslides-parity/verification-4/',
  'scripts/__pycache__/',
];
const EXCLUDED_FILES = new Set([
  'docs/gslides-parity/SPEC-4.md',
  'docs/gslides-parity/MILESTONES-4.md',
]);
// a scratch deck a spec or a probe left behind: never this round's fixture or template
const SCRATCH_DECK = /^decks\/(e2e-|untitled-|verifier-|ship-)/;
const FORBIDDEN = [
  /(^|\/)\.turboslide(\/|$)/,
  /(^|\/)\.vercel(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)target(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /\.log$/,
  /(^|\/)\.env(\.|$)/,
  /\.sqlite(-wal|-shm)?$/,
  /\.tsbuildinfo$/,
  /\.pyc$/,
  /(^|\/)\.DS_Store$/,
];

const entries = status.split('\0').filter((row) => row.length > 0);
const paths = [];
const excluded = [];
for (let i = 0; i < entries.length; i += 1) {
  const row = entries[i];
  const code = row.slice(0, 2);
  let path = row.slice(3);
  if (code[0] === 'R' || code[0] === 'C') {
    // "R  new\0old": the new path is this row, the old one follows
    i += 1;
  }
  if (code === '!!') continue;
  if (
    EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    EXCLUDED_FILES.has(path) ||
    SCRATCH_DECK.test(path)
  ) {
    excluded.push(path);
    continue;
  }
  paths.push(path);
}
const bad = paths.filter((path) => FORBIDDEN.some((rule) => rule.test(path)));
if (bad.length > 0) {
  process.stderr.write(`forbidden paths in the list:\n${bad.join('\n')}\n`);
  process.exit(2);
}
process.stderr.write(
  `${paths.length} paths to commit; ${excluded.length} excluded:\n${excluded.map((p) => `  ${p}`).join('\n')}\n`,
);
process.stdout.write(`${paths.join('\n')}\n`);

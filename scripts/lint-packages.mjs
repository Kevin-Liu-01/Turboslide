#!/usr/bin/env node
// eslint per workspace package (gslides-parity SPEC-2 8.4, 0.34, 0.56; VERIFICATION finding 6:
// `eslint .` over the whole tree ran out of a 4 GB heap after 35 s because the type aware rules
// load every project at once).
//
//   node scripts/lint-packages.mjs                 # every package, one process each, the counts
//   node scripts/lint-packages.mjs --changed       # the files the round touched, grouped per package
//   node scripts/lint-packages.mjs --json <file>   # also write the per package counts as JSON
//   node scripts/lint-packages.mjs --baseline      # rewrite tooling/eslint-config/baseline.json
//   node scripts/lint-packages.mjs --only store,export
//
// The tree run: `eslint . --max-warnings 0` inside every folder under apps/ and packages/ that has
// a tsconfig.json, plus the repository root for the files outside every package (scripts/,
// playwright.config.ts), each process under NODE_OPTIONS=--max-old-space-size=2048, one at a
// time. One line per package with the error and warning counts. Exit 1 when a package's error
// count rises above `tooling/eslint-config/baseline.json` (the counts measured on `main` at
// a65b313); the packages that fell below their baseline are printed so it can be lowered.
//
// `--changed`: the files `git diff --name-only <base>` and `git ls-files --others
// --exclude-standard` name (base is `main`, or --base <ref>), filtered to the extensions eslint
// lints and grouped per package, run as `eslint <files>` in that package, so a builder's gate reads
// only the files the round touched and a package's pre existing errors do not block it; exit 1 on
// any error or warning there. Files eslint ignores (a generated route tree, a folder outside every
// project) are dropped quietly (--no-warn-ignored).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const BASELINE = join(ROOT, 'tooling', 'eslint-config', 'baseline.json');
const HEAP = '--max-old-space-size=2048';
const EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
/** The eslint flags every run gets: warnings count, ignored files pass quietly, JSON out. */
const COMMON = ['--max-warnings', '0', '--no-warn-ignored', '--no-error-on-unmatched-pattern'];

function parseArgs(argv) {
  const out = { changed: false, json: null, baseline: false, only: null, base: 'main' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changed') out.changed = true;
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--baseline') out.baseline = true;
    else if (arg === '--only') out.only = new Set((argv[++i] ?? '').split(',').filter(Boolean));
    else if (arg === '--base') out.base = argv[++i] ?? out.base;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

/** Every workspace package with TypeScript sources: apps/* and packages/* holding a tsconfig.json. */
function workspacePackages() {
  const out = [];
  for (const group of ['apps', 'packages']) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const folder = join(dir, name);
      if (existsSync(join(folder, 'tsconfig.json')))
        out.push({ name: `${group}/${name}`, dir: folder });
    }
  }
  return out;
}

/** The pseudo package for the files outside every workspace package (scripts/, the root configs). */
const ROOT_PACKAGE = { name: 'root', dir: ROOT };

function runEslint(cwd, targets) {
  // the .bin entry is pnpm's shell shim, so it runs as a command; NODE_OPTIONS reaches the node it starts
  const run = spawnSync(ESLINT, [...targets, ...COMMON, '-f', 'json'], {
    cwd,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, HEAP].filter(Boolean).join(' '),
    },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let results = [];
  try {
    results = JSON.parse(run.stdout || '[]');
  } catch {
    // eslint answered no JSON: a crash (the heap, a config error); the stderr says why
  }
  const errors = results.reduce((n, file) => n + file.errorCount, 0);
  const warnings = results.reduce((n, file) => n + file.warningCount, 0);
  const files = results.length;
  const crashed = run.status !== 0 && errors === 0 && warnings === 0 && results.length === 0;
  return { errors, warnings, files, status: run.status ?? 1, stderr: run.stderr, results, crashed };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return null;
  }
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/** The files the round touched: the diff against the base plus the untracked files, lintable extensions only. */
function changedFiles(base) {
  const git = (args) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const diff = git(['diff', '--name-only', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  const seen = new Set();
  const out = [];
  for (const file of [...diff, ...untracked]) {
    if (!EXTENSIONS.test(file) || seen.has(file)) continue;
    if (!existsSync(join(ROOT, file))) continue;
    seen.add(file);
    out.push(file);
  }
  return out.sort();
}

/** The package a repository relative file belongs to, else the root pseudo package. */
function packageOf(file, packages) {
  for (const pkg of packages) {
    const rel = relative(ROOT, pkg.dir).replace(/\\/g, '/');
    if (file.startsWith(`${rel}/`)) return pkg;
  }
  return ROOT_PACKAGE;
}

function printMessages(results, cwd, limit = 40) {
  let shown = 0;
  for (const file of results) {
    for (const message of file.messages) {
      if (shown >= limit) return;
      const where = `${relative(ROOT, resolve(cwd, file.filePath))}:${message.line}:${message.column}`;
      console.log(
        `  ${where}  ${message.severity === 2 ? 'error' : 'warning'}  ${message.ruleId ?? ''}  ${message.message}`,
      );
      shown += 1;
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: node scripts/lint-packages.mjs [--changed [--base <ref>]] [--only a,b] [--json <file>] [--baseline]',
    );
    process.exit(0);
  }
  const packages = workspacePackages();

  if (args.changed) {
    const files = changedFiles(args.base);
    if (files.length === 0) {
      console.log(`lint-packages: no changed lintable files against ${args.base}`);
      process.exit(0);
    }
    const groups = new Map();
    for (const file of files) {
      const pkg = packageOf(file, packages);
      if (!groups.has(pkg.name)) groups.set(pkg.name, { pkg, files: [] });
      groups.get(pkg.name).files.push(relative(pkg.dir, join(ROOT, file)));
    }
    let failed = 0;
    const width = Math.max(...[...groups.keys()].map((k) => k.length), 7);
    console.log(`${pad('package', width)}  files  errors  warnings`);
    for (const { pkg, files: list } of [...groups.values()].sort((a, b) =>
      a.pkg.name.localeCompare(b.pkg.name),
    )) {
      const run = runEslint(pkg.dir, list);
      const bad = run.errors > 0 || run.warnings > 0 || run.crashed;
      if (bad) failed += 1;
      console.log(
        `${pad(pkg.name, width)}  ${pad(list.length, 5)}  ${pad(run.errors, 6)}  ${pad(run.warnings, 8)}${run.crashed ? '  eslint did not answer' : ''}`,
      );
      if (bad) {
        printMessages(run.results, pkg.dir);
        if (run.crashed) console.log(run.stderr.trim().split('\n').slice(-5).join('\n'));
      }
    }
    console.log(
      `lint-packages: ${files.length} changed file(s) against ${args.base} in ${groups.size} package(s); ${failed === 0 ? 'clean' : `${failed} package(s) with findings`}`,
    );
    process.exit(failed === 0 ? 0 : 1);
  }

  const targets = [...packages, ROOT_PACKAGE].filter(
    (pkg) =>
      args.only === null || args.only.has(pkg.name) || args.only.has(pkg.name.split('/').pop()),
  );
  const baseline = readBaseline();
  const counts = {};
  let above = 0;
  const below = [];
  const width = Math.max(...targets.map((pkg) => pkg.name.length), 7);
  console.log(`${pad('package', width)}  files  errors  warnings  baseline  ms`);
  for (const pkg of targets) {
    const t = performance.now();
    // the root run lints scripts/ and the root configs; the packages have their own runs
    const run =
      pkg === ROOT_PACKAGE
        ? runEslint(ROOT, ['scripts', 'playwright.config.ts', 'vitest.config.ts'])
        : runEslint(pkg.dir, ['.']);
    const ms = Math.round(performance.now() - t);
    const allowed = baseline?.[pkg.name];
    counts[pkg.name] = run.crashed ? null : run.errors;
    if (run.crashed) above += 1;
    else if (allowed !== undefined && run.errors > allowed) above += 1;
    else if (allowed !== undefined && run.errors < allowed)
      below.push(`${pkg.name} ${run.errors} < ${allowed}`);
    console.log(
      `${pad(pkg.name, width)}  ${pad(run.files, 5)}  ${pad(run.crashed ? 'crash' : run.errors, 6)}  ${pad(run.warnings, 8)}  ${pad(allowed ?? '-', 8)}  ${ms}`,
    );
    if (run.crashed) console.log(run.stderr.trim().split('\n').slice(-5).join('\n'));
    else if (allowed !== undefined && run.errors > allowed) printMessages(run.results, pkg.dir);
  }
  const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  if (args.json) writeFileSync(args.json, `${JSON.stringify(counts, null, 2)}\n`);
  if (args.baseline) {
    writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
    console.log(`lint-packages: baseline written to ${relative(ROOT, BASELINE)}`);
  }
  if (below.length > 0)
    console.log(`lint-packages: below the baseline, lower it: ${below.join('; ')}`);
  if (baseline === null && !args.baseline) {
    console.log(
      `lint-packages: ${total} error(s) over ${targets.length} package(s); no baseline at ${relative(ROOT, BASELINE)} (pass --baseline to write one)`,
    );
    process.exit(total === 0 ? 0 : 1);
  }
  console.log(
    `lint-packages: ${total} error(s) over ${targets.length} package(s); ${above === 0 ? 'no package above its baseline' : `${above} package(s) above the baseline`}`,
  );
  process.exit(above === 0 ? 0 : 1);
}

main();

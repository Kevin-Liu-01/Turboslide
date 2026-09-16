#!/usr/bin/env node
// The dictionaries under apps/studio/public/dictionaries/ (gslides-parity SPEC-5 7.2, 0.35; R10
// 4.4, 10.4; MILESTONES-5 B5 day 1; check step 35). The seven Hunspell pairs the browser's spell
// check Worker loads come from the `dictionary-*` packages the integrator pinned in the pnpm
// catalog (packages/spelling/package.json), copied here once and committed, so the check chain
// never installs or fetches anything: each `<tag>/` folder holds `index.aff.gz` and `index.dic.gz`
// (the package's `index.aff` and `index.dic`, gzip compressed at level 9 with Node's zlib, so the
// bytes on the wire are the bytes this script measures on every host and the Worker inflates them
// through DecompressionStream) and the package's notice as `LICENSE`; `manifest.json` beside the
// folders names each tag's package, version, licence option, raw and gzip sizes and sha256 digests.
//
//   node scripts/check-dictionaries.mjs            check the folder against the packages and the budgets
//   node scripts/check-dictionaries.mjs --write    copy the pairs from the installed packages and write the manifest
//
// The check fails (exit 1) when: a tag's folder or one of its three files is missing; a gzip file
// does not inflate to the installed package's bytes (a package bump without `--write`, or a file
// edited by hand); `LICENSE` differs from the package's notice; the manifest disagrees with the
// files or with the tables of packages/spelling/src/index.ts (the packages, the licence options,
// the budget rows); a tag's gzip bytes exceed its budget row or the seven exceed the total; the
// folder holds an entry that is not one of the seven tags or the manifest, which is how a GPL only
// dictionary (de, it; R10 12 item 1) is kept out until Kevin's decision writes the `.gpl-accepted`
// flag file there. It prints one row per tag with the sizes either way. The tables come from the
// spelling package's catalog module through Node's type stripping, the way apps/cli/bin/turboslide.mjs
// runs the sources, so the tags, files and budgets have one home.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  DICTIONARIES_GZIP_BUDGET_TOTAL,
  DICTIONARIES_MANIFEST_NAME,
  DICTIONARIES_PUBLIC_DIR,
  DICTIONARY_FILE_NAMES,
  DICTIONARY_GZIP_BUDGETS,
  DICTIONARY_LICENCES,
  DICTIONARY_PACKAGES,
  DICTIONARY_TAGS,
  GPL_ACCEPTED_FLAG,
  GPL_ONLY_DICTIONARY_TAGS,
} from '../packages/spelling/src/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'apps/studio/public', DICTIONARIES_PUBLIC_DIR);
const SPELLING_PACKAGE = join(ROOT, 'packages/spelling/package.json');
const WRITE = process.argv.includes('--write');

/** The installed package's folder, resolved from the spelling package the way Node would. */
function packageDirOf(name) {
  const require = createRequire(SPELLING_PACKAGE);
  return dirname(require.resolve(name));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The installed package's files and facts for one tag. */
function installed(tag) {
  const name = DICTIONARY_PACKAGES[tag];
  const dir = packageDirOf(name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return {
    name,
    version: pkg.version,
    spdx: pkg.license,
    aff: readFileSync(join(dir, 'index.aff')),
    dic: readFileSync(join(dir, 'index.dic')),
    licence: readFileSync(join(dir, 'license')),
  };
}

function fileRow(raw, gz) {
  return { bytes: raw.length, gzipBytes: gz.length, sha256: sha256(raw) };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1).padStart(8)} KB`;
}

function write() {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const tags = {};
  for (const tag of DICTIONARY_TAGS) {
    const source = installed(tag);
    const aff = gzipSync(source.aff, { level: 9 });
    const dic = gzipSync(source.dic, { level: 9 });
    const folder = join(PUBLIC_DIR, tag);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, DICTIONARY_FILE_NAMES.aff), aff);
    writeFileSync(join(folder, DICTIONARY_FILE_NAMES.dic), dic);
    writeFileSync(join(folder, DICTIONARY_FILE_NAMES.licence), source.licence);
    tags[tag] = {
      package: source.name,
      version: source.version,
      licence: DICTIONARY_LICENCES[tag],
      spdx: source.spdx,
      aff: fileRow(source.aff, aff),
      dic: fileRow(source.dic, dic),
      gzipBytes: aff.length + dic.length,
      budgetGzipBytes: DICTIONARY_GZIP_BUDGETS[tag],
    };
  }
  const manifest = {
    $comment:
      'Written by scripts/check-dictionaries.mjs --write from the dictionary-* packages of packages/spelling; the spell check Worker loads index.aff.gz and index.dic.gz per tag and inflates them; LICENSE is each package’s notice (gslides-parity SPEC-5 7.2).',
    files: DICTIONARY_FILE_NAMES,
    tags,
  };
  writeFileSync(
    join(PUBLIC_DIR, DICTIONARIES_MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

function check() {
  const problems = [];
  const fail = (line) => problems.push(line);
  const manifestPath = join(PUBLIC_DIR, DICTIONARIES_MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    fail(`${manifestPath} is missing; run node scripts/check-dictionaries.mjs --write`);
    return problems;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`${manifestPath} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    return problems;
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(DICTIONARY_FILE_NAMES)) {
    fail(`manifest.files disagrees with DICTIONARY_FILE_NAMES`);
  }

  // the folder holds the seven tags and the manifest, nothing else (the GPL rule)
  const gplAccepted = existsSync(join(PUBLIC_DIR, GPL_ACCEPTED_FLAG));
  for (const entry of readdirSync(PUBLIC_DIR)) {
    if (entry === DICTIONARIES_MANIFEST_NAME || entry === GPL_ACCEPTED_FLAG) continue;
    if (DICTIONARY_TAGS.includes(entry)) continue;
    if (GPL_ONLY_DICTIONARY_TAGS.includes(entry) && gplAccepted) continue;
    const gpl = GPL_ONLY_DICTIONARY_TAGS.includes(entry)
      ? ` (a GPL only dictionary stays out until ${GPL_ACCEPTED_FLAG} is written there by Kevin's decision, R10 12 item 1)`
      : '';
    fail(`${DICTIONARIES_PUBLIC_DIR}/${entry} is not one of the shipped tags${gpl}`);
  }
  const manifestTags = Object.keys(manifest.tags ?? {}).sort();
  if (manifestTags.join(',') !== [...DICTIONARY_TAGS].sort().join(',')) {
    fail(
      `manifest.tags names ${manifestTags.join(', ') || 'nothing'}; expected ${DICTIONARY_TAGS.join(', ')}`,
    );
  }

  let total = 0;
  const rows = [];
  for (const tag of DICTIONARY_TAGS) {
    const entry = manifest.tags?.[tag];
    const folder = join(PUBLIC_DIR, tag);
    const source = installed(tag);
    const files = {};
    for (const key of ['aff', 'dic', 'licence']) {
      const path = join(folder, DICTIONARY_FILE_NAMES[key]);
      if (!existsSync(path)) {
        fail(`${tag}: ${DICTIONARY_FILE_NAMES[key]} is missing`);
        continue;
      }
      files[key] = readFileSync(path);
    }
    if (files.licence !== undefined && !files.licence.equals(source.licence)) {
      fail(`${tag}: LICENSE differs from ${source.name}@${source.version}'s notice`);
    }
    let gzipBytes = 0;
    for (const key of ['aff', 'dic']) {
      const gz = files[key];
      if (gz === undefined) continue;
      let raw;
      try {
        raw = gunzipSync(gz);
      } catch {
        fail(`${tag}: ${DICTIONARY_FILE_NAMES[key]} is not gzip`);
        continue;
      }
      if (!raw.equals(source[key])) {
        fail(
          `${tag}: ${DICTIONARY_FILE_NAMES[key]} inflates to other bytes than ${source.name}@${source.version}'s index.${key} (sha256 ${sha256(raw).slice(0, 12)} against ${sha256(source[key]).slice(0, 12)}); run --write`,
        );
      }
      gzipBytes += gz.length;
      if (entry !== undefined) {
        const row = entry[key];
        if (
          row === undefined ||
          row.gzipBytes !== gz.length ||
          row.bytes !== raw.length ||
          row.sha256 !== sha256(raw)
        ) {
          fail(`${tag}: manifest.${key} disagrees with the file (run --write)`);
        }
      }
    }
    if (entry !== undefined) {
      if (entry.package !== source.name)
        fail(`${tag}: manifest names ${entry.package}, the catalog ${source.name}`);
      if (entry.version !== source.version)
        fail(
          `${tag}: manifest at ${entry.version}, ${source.name} installed at ${source.version}; run --write`,
        );
      if (entry.spdx !== source.spdx)
        fail(`${tag}: manifest spdx ${entry.spdx}, the package says ${source.spdx}`);
      if (entry.licence !== DICTIONARY_LICENCES[tag])
        fail(
          `${tag}: manifest licence ${entry.licence}, DICTIONARY_LICENCES says ${DICTIONARY_LICENCES[tag]}`,
        );
      if (entry.budgetGzipBytes !== DICTIONARY_GZIP_BUDGETS[tag])
        fail(
          `${tag}: manifest budget ${entry.budgetGzipBytes}, DICTIONARY_GZIP_BUDGETS says ${DICTIONARY_GZIP_BUDGETS[tag]}`,
        );
      if (entry.gzipBytes !== gzipBytes)
        fail(`${tag}: manifest gzipBytes ${entry.gzipBytes}, the files ${gzipBytes}`);
    }
    if (/GPL/.test(DICTIONARY_LICENCES[tag]))
      fail(`${tag}: the licence option ${DICTIONARY_LICENCES[tag]} is GPL`);
    const budget = DICTIONARY_GZIP_BUDGETS[tag];
    if (gzipBytes > budget)
      fail(`${tag}: ${gzipBytes} gzip bytes over the budget row of ${budget}`);
    total += gzipBytes;
    const state = gzipBytes > budget ? 'OVER' : 'ok';
    rows.push(
      `  ${tag.padEnd(6)} ${source.name.padEnd(17)} ${String(source.version).padEnd(6)} ${DICTIONARY_LICENCES[tag].padEnd(13)} aff ${kb(files.aff?.length ?? 0)}  dic ${kb(files.dic?.length ?? 0)}  gzip ${kb(gzipBytes)} of ${kb(budget)}  ${state}`,
    );
  }
  if (total > DICTIONARIES_GZIP_BUDGET_TOTAL) {
    fail(
      `the seven dictionaries gzip to ${total} bytes, over the total budget of ${DICTIONARIES_GZIP_BUDGET_TOTAL}`,
    );
  }
  console.log(
    `dictionaries under apps/studio/public/${DICTIONARIES_PUBLIC_DIR}/ (gzip bytes on the wire, budget per tag):`,
  );
  for (const row of rows) console.log(row);
  console.log(
    `  total ${kb(total)} of ${kb(DICTIONARIES_GZIP_BUDGET_TOTAL)} gzip; raw ${kb(DICTIONARY_TAGS.reduce((sum, tag) => sum + (manifest.tags?.[tag]?.aff?.bytes ?? 0) + (manifest.tags?.[tag]?.dic?.bytes ?? 0), 0))}`,
  );
  return problems;
}

if (WRITE) {
  const manifest = write();
  const count = Object.keys(manifest.tags).length;
  console.log(
    `wrote ${count} dictionaries and ${DICTIONARIES_MANIFEST_NAME} under apps/studio/public/${DICTIONARIES_PUBLIC_DIR}/`,
  );
}
const problems = check();
if (problems.length > 0) {
  console.error(`check-dictionaries: ${problems.length} problem(s)`);
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-dictionaries: ok (${DICTIONARY_TAGS.length} dictionaries under their budgets)`);

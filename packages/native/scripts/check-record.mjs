#!/usr/bin/env node
// The committed native outputs against BUILD-RECORD.json (gslides-parity SPEC-4 0.38; docs/native.md
// "Round four"): every file the record names exists with the recorded size and sha256, and, when
// cargo, the wasm32 target and wasm-bindgen are installed, the wasm module rebuilt from the crate
// hashes to the same bytes (the build is reproducible on one toolchain; the record names the
// toolchain). The Linux addon is CI's build alone (cargo zigbuild against glibc 2.28, or a
// manylinux_2_28 container) and is compared by hash only; a record row with `sha256: null` is a
// pending output and is reported, never failed, unless --require-addon is given.
//
//   node packages/native/scripts/check-record.mjs            compare, rebuild the wasm when possible
//   node packages/native/scripts/check-record.mjs --no-build  compare the files alone
//   node packages/native/scripts/check-record.mjs --require-addon   a pending addon is a failure (CI after the first run)
//   node packages/native/scripts/check-record.mjs --write     rewrite the wasm rows of the record from the files (a local rebuild; the run id stays null)
//
// Exit 1 names the first row that differs. `pnpm check` step 29 runs the default form after the
// brand build (the integrator adds the command).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = join(PACKAGE_DIR, 'BUILD-RECORD.json');
const BUILD = join(PACKAGE_DIR, 'scripts', 'build.mjs');
const args = new Set(process.argv.slice(2));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function compare(record, label) {
  const failures = [];
  const pending = [];
  for (const [relative, row] of Object.entries(record.outputs)) {
    const path = join(PACKAGE_DIR, relative);
    if (row.sha256 === null) {
      pending.push(relative);
      if (existsSync(path))
        failures.push(
          `${relative}: present on disk but the record has no hash for it (record it with the CI run id)`,
        );
      continue;
    }
    if (!existsSync(path)) {
      failures.push(`${relative}: missing (the record names ${row.bytes} bytes, ${row.sha256})`);
      continue;
    }
    const bytes = readFileSync(path).length;
    const hash = sha256(path);
    if (bytes !== row.bytes || hash !== row.sha256) {
      failures.push(
        `${relative}: ${bytes} bytes ${hash} ${label}; the record has ${row.bytes} bytes ${row.sha256}`,
      );
    }
  }
  return { failures, pending };
}

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
let { failures, pending } = compare(record, 'on disk');

if (args.has('--write')) {
  for (const relative of Object.keys(record.outputs)) {
    if (!relative.startsWith('wasm/')) continue;
    const path = join(PACKAGE_DIR, relative);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    record.outputs[relative] = {
      ...record.outputs[relative],
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      builtBy: 'local',
      built: new Date().toISOString().slice(0, 10),
      runId: null,
      runUrl: null,
    };
  }
  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
  console.log('check-record: the wasm rows were rewritten from the files on disk (run id null)');
  ({ failures, pending } = compare(record, 'on disk'));
}

if (!args.has('--no-build') && failures.length === 0) {
  // a rebuild into place: the build script writes wasm/ and exits 0 with a message when the
  // toolchain is missing, which is not a failure of this check
  const built = spawnSync(process.execPath, [BUILD, '--wasm'], { encoding: 'utf8' });
  if (built.status !== 0) {
    console.error(built.stdout);
    console.error(built.stderr);
    failures.push('the wasm rebuild failed');
  } else {
    const skipped = /skipped/.test(built.stdout);
    console.log(
      skipped
        ? 'check-record: no Rust toolchain here; the files were compared with the record and not rebuilt'
        : 'check-record: the wasm module was rebuilt from the crate',
    );
    if (!skipped) ({ failures } = compare(record, 'after the rebuild'));
  }
}

for (const relative of pending) {
  const row = record.outputs[relative];
  const line = `check-record: ${relative} is pending (${row.note ?? 'no build yet'})`;
  if (args.has('--require-addon')) failures.push(line);
  else console.log(line);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-record: FAIL ${failure}`);
  process.exit(1);
}
console.log(
  `check-record: ${Object.keys(record.outputs).length - pending.length} outputs match BUILD-RECORD.json`,
);

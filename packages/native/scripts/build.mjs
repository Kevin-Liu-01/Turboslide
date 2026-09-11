// Builds crates/turboslide-native for this machine (docs/native.md):
//
//   node scripts/build.mjs            the napi addon for this platform and the wasm module
//   node scripts/build.mjs --napi     the addon only
//   node scripts/build.mjs --wasm     the wasm module only
//   --target <triple>                 cross-build the addon for a declared triple (CI)
//   --debug                           the debug profile
//   --strict                          a missing toolchain is an error instead of a skip
//
// The addon is `cargo build --release --features napi` with the cdylib renamed to
// npm/<platform>/turboslide-native.<platform>.node; the wasm module is
// `cargo build --release --target wasm32-unknown-unknown --features wasm` followed by
// `wasm-bindgen --target web` into wasm/. That is what the napi-rs CLI would do; doing it here
// keeps the build free of an npm dependency (SPEC 10: "the CLI installs without a Rust
// toolchain"). Without cargo, without the wasm32 target or without wasm-bindgen the script
// prints why and exits 0 (unless --strict or TURBOSLIDE_NATIVE_STRICT=1), so `turbo run build`
// passes on a checkout without Rust and @turboslide/effects stays on TypeScript there. A
// failing cargo build is always an error.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PLATFORM_TARGETS, addonFileName, platformKey, targetForTriple } from '../src/platform.ts';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CRATE_DIR = resolve(PACKAGE_DIR, '..', '..', 'crates', 'turboslide-native');
const MANIFEST = join(CRATE_DIR, 'Cargo.toml');
const TARGET_DIR = process.env.CARGO_TARGET_DIR ?? join(CRATE_DIR, 'target');
const WASM_TRIPLE = 'wasm32-unknown-unknown';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const wantNapi = flag('--napi') || !flag('--wasm');
const wantWasm = flag('--wasm') || !flag('--napi');
const strict = flag('--strict') || process.env.TURBOSLIDE_NATIVE_STRICT === '1';
const profile = flag('--debug') ? 'debug' : 'release';
const crossTriple = option('--target');

function log(line) {
  process.stdout.write(`[native] ${line}\n`);
}

function skip(reason) {
  if (strict) {
    process.stderr.write(`[native] ${reason}\n`);
    process.exit(1);
  }
  log(`${reason}; skipped (TypeScript effects stay in use)`);
}

function findBinary(name) {
  const candidates = [
    process.env[name.toUpperCase()],
    join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? `${name}.exe` : name),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
  return probe.error ? null : name;
}

function run(bin, runArgs, env = {}) {
  log(`${bin} ${runArgs.join(' ')}`);
  const result = spawnSync(bin, runArgs, {
    stdio: 'inherit',
    cwd: CRATE_DIR,
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`[native] ${bin} exited with ${result.status}\n`);
    process.exit(result.status ?? 1);
  }
}

function installedTargets(rustup) {
  if (!rustup) return null;
  const out = spawnSync(rustup, ['target', 'list', '--installed'], { encoding: 'utf8' });
  if (out.status !== 0) return null;
  return out.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const cargo = findBinary('cargo');
if (!cargo) {
  skip('cargo not found (install Rust from https://rustup.rs)');
  process.exit(0);
}
const rustup = findBinary('rustup');
const targets = installedTargets(rustup);
const profileArgs = profile === 'release' ? ['--release'] : [];

if (wantNapi) {
  const target = crossTriple
    ? targetForTriple(crossTriple)
    : (PLATFORM_TARGETS.find((t) => t.key === platformKey()) ?? null);
  if (!target) {
    skip(
      crossTriple
        ? `--target ${crossTriple} is not a declared platform (${PLATFORM_TARGETS.map((t) => t.triple).join(', ')})`
        : `no declared addon platform for ${process.platform}-${process.arch}`,
    );
  } else if (crossTriple && targets && !targets.includes(crossTriple)) {
    skip(`rustup target ${crossTriple} is not installed (rustup target add ${crossTriple})`);
  } else {
    const cargoArgs = ['build', ...profileArgs, '--features', 'napi', '--manifest-path', MANIFEST];
    if (crossTriple) cargoArgs.push('--target', crossTriple);
    run(cargo, cargoArgs, { CARGO_TARGET_DIR: TARGET_DIR });
    const built = join(TARGET_DIR, ...(crossTriple ? [crossTriple] : []), profile, target.cdylib);
    if (!existsSync(built)) {
      process.stderr.write(`[native] expected ${built} after the build\n`);
      process.exit(1);
    }
    const outDir = join(PACKAGE_DIR, 'npm', target.key);
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, addonFileName(target.key));
    copyFileSync(built, out);
    log(`addon ${target.key}: ${out} (${statSync(out).size} bytes)`);
  }
}

if (wantWasm) {
  const wasmBindgen = findBinary('wasm-bindgen');
  if (targets && !targets.includes(WASM_TRIPLE)) {
    skip(`rustup target ${WASM_TRIPLE} is not installed (rustup target add ${WASM_TRIPLE})`);
  } else if (!wasmBindgen) {
    skip('wasm-bindgen not found (cargo install wasm-bindgen-cli --version 0.2.128 --locked)');
  } else {
    run(
      cargo,
      [
        'build',
        ...profileArgs,
        '--target',
        WASM_TRIPLE,
        '--features',
        'wasm',
        '--manifest-path',
        MANIFEST,
      ],
      { CARGO_TARGET_DIR: TARGET_DIR },
    );
    const built = join(TARGET_DIR, WASM_TRIPLE, profile, 'turboslide_native.wasm');
    const outDir = join(PACKAGE_DIR, 'wasm');
    mkdirSync(outDir, { recursive: true });
    run(wasmBindgen, [
      '--target',
      'web',
      '--out-dir',
      outDir,
      '--out-name',
      'turboslide_native',
      built,
    ]);
    const glue = join(outDir, 'turboslide_native.js');
    const binary = join(outDir, 'turboslide_native_bg.wasm');
    log(`wasm: ${glue}, ${binary} (${statSync(binary).size} bytes)`);
  }
}

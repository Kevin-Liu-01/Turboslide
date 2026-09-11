// Loading the crate in Node (SPEC 10): the napi addon for this platform, then the wasm module
// wasm-bindgen wrote, each behind a synchronous `require` so the effects package can pick a
// backend without an async boundary. Nothing here throws for a missing build: a loader returns
// null and `describeNative` says what was tried, and @turboslide/effects keeps its TypeScript
// implementation. The `require` calls are dynamic on purpose: the files are build outputs that
// may not exist, and a static import would fail the whole module graph.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { addonFileName, addonPackageName, platformKey } from './platform.ts';
import type { PlatformKey } from './platform.ts';
import type { NativeModule } from './types.ts';
import { hasNativeSurface } from './types.ts';
import { initWasmSync } from './wasm.ts';
import type { WasmGlueModule } from './wasm.ts';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Where the loader looks for the addon of a key, in order: the platform package, then the local build. */
export function addonCandidates(key: PlatformKey): string[] {
  return [addonPackageName(key), join(PACKAGE_DIR, 'npm', key, addonFileName(key))];
}

/** The wasm glue and binary as `pnpm --filter @turboslide/native build` writes them. */
export const WASM_GLUE_PATH = join(PACKAGE_DIR, 'wasm', 'turboslide_native.js');
export const WASM_BINARY_PATH = join(PACKAGE_DIR, 'wasm', 'turboslide_native_bg.wasm');

export type LoadAttempt = { source: string; error: string };

export type LoadReport = {
  platform: PlatformKey | null;
  /** The addon that loaded, or null. */
  native: string | null;
  /** The wasm glue that loaded, or null. */
  wasm: string | null;
  attempts: LoadAttempt[];
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let addonCache: { module: NativeModule | null; report: LoadReport } | undefined;
let wasmCache: { module: NativeModule | null; attempts: LoadAttempt[] } | undefined;

function loadAddonUncached(): { module: NativeModule | null; report: LoadReport } {
  const key = platformKey();
  const report: LoadReport = { platform: key, native: null, wasm: null, attempts: [] };
  if (key === null) {
    report.attempts.push({
      source: `${process.platform}-${process.arch}`,
      error: 'no prebuilt addon is declared for this platform',
    });
    return { module: null, report };
  }
  for (const source of addonCandidates(key)) {
    if (source.startsWith('/') || source.startsWith('.')) {
      if (!existsSync(source)) {
        report.attempts.push({ source, error: 'not built' });
        continue;
      }
    }
    try {
      const loaded: unknown = require(source);
      if (!hasNativeSurface(loaded)) {
        report.attempts.push({ source, error: 'loaded, but the surface is incomplete' });
        continue;
      }
      report.native = source;
      const module = Object.assign(
        Object.create(null) as Record<string, unknown>,
        loaded,
      ) as unknown as NativeModule;
      module.kind = 'native';
      return { module, report };
    } catch (error) {
      report.attempts.push({ source, error: message(error) });
    }
  }
  return { module: null, report };
}

/** The napi addon for this platform, or null when none is built or it fails to load. */
export function loadNativeAddon(): NativeModule | null {
  addonCache ??= loadAddonUncached();
  return addonCache.module;
}

function loadWasmUncached(): { module: NativeModule | null; attempts: LoadAttempt[] } {
  const attempts: LoadAttempt[] = [];
  if (!existsSync(WASM_GLUE_PATH) || !existsSync(WASM_BINARY_PATH)) {
    attempts.push({ source: WASM_GLUE_PATH, error: 'not built' });
    return { module: null, attempts };
  }
  try {
    // Node 22.12 and later load an ESM file without top-level await through require().
    const glue: unknown = require(WASM_GLUE_PATH);
    const namespace = glue as WasmGlueModule;
    if (typeof namespace.initSync !== 'function') {
      attempts.push({ source: WASM_GLUE_PATH, error: 'glue has no initSync export' });
      return { module: null, attempts };
    }
    const bytes = readFileSync(WASM_BINARY_PATH);
    const module = initWasmSync(namespace, bytes);
    return { module, attempts };
  } catch (error) {
    attempts.push({ source: WASM_GLUE_PATH, error: message(error) });
    return { module: null, attempts };
  }
}

/** The wasm module from wasm/, initialized synchronously, or null when it is not built. */
export function loadWasmNode(): NativeModule | null {
  wasmCache ??= loadWasmUncached();
  return wasmCache.module;
}

/** What is available on this machine, with the reason for each miss. */
export function describeNative(): LoadReport {
  loadNativeAddon();
  loadWasmNode();
  const addon = addonCache;
  const wasm = wasmCache;
  const report: LoadReport = addon
    ? { ...addon.report, attempts: [...addon.report.attempts] }
    : { platform: platformKey(), native: null, wasm: null, attempts: [] };
  if (wasm) {
    report.wasm = wasm.module ? WASM_GLUE_PATH : null;
    report.attempts.push(...wasm.attempts);
  }
  return report;
}

/** Forget the cached loads, for tests that build between calls. */
export function resetNativeCache(): void {
  addonCache = undefined;
  wasmCache = undefined;
}

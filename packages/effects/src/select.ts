// Backend selection in Node (SPEC 10: "twoTone() and diff() use the addon or the wasm module
// when present and the TypeScript implementation otherwise"). The order is native, then wasm,
// then TypeScript; TURBOSLIDE_EFFECTS_BACKEND=native|wasm|typescript|auto pins one, and naming a
// backend that is not built is an error rather than a silent fallback. The choice is made on the
// first call and cached; `setBackend` overrides it for tests and for callers that loaded a module
// themselves. This module imports Node loaders, so browser code builds its backend through
// backend.ts instead.
import { describeNative, loadNativeAddon, loadWasmNode } from '@turboslide/native/node';
import type { LoadReport } from '@turboslide/native/node';

import { backendFromNative, typescriptBackend } from './backend.ts';
import type { BackendKind, EffectsBackend } from './backend.ts';

export type BackendPreference = BackendKind | 'auto';

export const BACKEND_ENV = 'TURBOSLIDE_EFFECTS_BACKEND';

const PREFERENCES: readonly BackendPreference[] = ['native', 'wasm', 'typescript', 'auto'];

let current: EffectsBackend | null = null;

/** The preference from the environment; unset and empty mean auto. */
export function readPreference(
  env: Record<string, string | undefined> = process.env,
): BackendPreference {
  const raw = env[BACKEND_ENV]?.trim();
  if (!raw) return 'auto';
  if ((PREFERENCES as readonly string[]).includes(raw)) return raw as BackendPreference;
  throw new Error(`${BACKEND_ENV}=${raw} is not one of ${PREFERENCES.join(', ')}`);
}

function unavailable(kind: BackendKind, report: LoadReport): Error {
  const tried = report.attempts.map((a) => `${a.source}: ${a.error}`).join('; ');
  return new Error(
    `${BACKEND_ENV} asks for ${kind}, but no ${kind} build loaded (pnpm --filter @turboslide/native build). Tried ${tried}`,
  );
}

/** Resolve a backend for a preference without caching it. */
export function selectBackend(preference: BackendPreference = readPreference()): EffectsBackend {
  const order: readonly BackendKind[] =
    preference === 'auto' ? ['native', 'wasm', 'typescript'] : [preference];
  for (const kind of order) {
    if (kind === 'typescript') return typescriptBackend();
    const loaded = kind === 'native' ? loadNativeAddon() : loadWasmNode();
    if (loaded) return backendFromNative(loaded);
    if (preference !== 'auto') throw unavailable(kind, describeNative());
  }
  return typescriptBackend();
}

/** The backend in use, selected on first call. */
export function getBackend(): EffectsBackend {
  current ??= selectBackend();
  return current;
}

/**
 * Pin the backend: a ready EffectsBackend, a preference to resolve now, or null to forget the
 * cached choice so the next call selects again. Returns what is now current (null after a reset).
 */
export function setBackend(
  backend: EffectsBackend | BackendPreference | null,
): EffectsBackend | null {
  if (backend === null) {
    current = null;
    return null;
  }
  current = typeof backend === 'string' ? selectBackend(backend) : backend;
  return current;
}

export type BackendReport = {
  selected: BackendKind;
  version: string;
  preference: BackendPreference;
  native: LoadReport;
};

/** The selected backend and what the loaders found, for `turboslide doctor` style output. */
export function describeBackends(): BackendReport {
  const backend = getBackend();
  return {
    selected: backend.kind,
    version: backend.version,
    preference: readPreference(),
    native: describeNative(),
  };
}

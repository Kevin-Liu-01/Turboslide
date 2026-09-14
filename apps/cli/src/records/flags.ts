// The kill switches on a checkout (gslides-parity SPEC-3 8.12, 0.33): `.turboslide/flags.json` at
// the repository root, read per call, flipped by `turboslide admin flag <name> on|off`. Hosted the
// flags are Redis keys read by every instance within 5 s (B4's flags.ts); this file is the
// checkout's backend and the answer shape is the action's: the value, the default the flag reads
// when the store is unreachable, and where the value came from.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FlagName } from '@turboslide/schema/access';
import { FLAG_DEFAULTS, FLAG_NAMES } from '@turboslide/schema/access';

export const FLAGS_FILE = 'flags.json';

export type FlagAnswer = {
  name: FlagName;
  on: boolean;
  default: boolean;
  source: 'file' | 'default';
};

function flagsPath(stateDir: string): string {
  return join(stateDir, FLAGS_FILE);
}

/** Every flag stored in the file, by name; an unknown name or a non boolean value is skipped. */
export function readFlags(stateDir: string): Partial<Record<FlagName, boolean>> {
  const path = flagsPath(stateDir);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null) return {};
    const out: Partial<Record<FlagName, boolean>> = {};
    for (const name of FLAG_NAMES) {
      const value = (raw as Record<string, unknown>)[name];
      if (typeof value === 'boolean') out[name] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function readFlag(stateDir: string, name: FlagName): FlagAnswer {
  const stored = readFlags(stateDir)[name];
  return {
    name,
    on: stored ?? FLAG_DEFAULTS[name],
    default: FLAG_DEFAULTS[name],
    source: stored === undefined ? 'default' : 'file',
  };
}

export function writeFlag(stateDir: string, name: FlagName, on: boolean): FlagAnswer {
  const flags = { ...readFlags(stateDir), [name]: on };
  mkdirSync(stateDir, { recursive: true });
  const path = flagsPath(stateDir);
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, `${JSON.stringify(flags, null, 2)}\n`);
  renameSync(partial, path);
  return { name, on, default: FLAG_DEFAULTS[name], source: 'file' };
}

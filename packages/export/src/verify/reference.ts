// The reference side of the verify loop (SPEC 8.5 step 3): the Turboslide renders at the same
// revision as the export, read from a render directory's render.json (RenderRecord[], the shape
// `turboslide render --out <dir> --json` writes) and rendered on demand through the CLI when they
// are missing or stale. The export package does not depend on apps/cli, so the binary is found by
// TURBOSLIDE_BIN, then the workspace's apps/cli/bin/turboslide.mjs, then `turboslide` on PATH.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { RenderRecord, Theme } from '@turboslide/schema/render';

/** The device scale of a reference render: 1 for native mode, 2 for the flatten sheet. */
export type ReferenceScale = 1 | 2;

const execFileAsync = promisify(execFile);

export type ReferenceSet = {
  dir: string;
  records: RenderRecord[];
};

/** The nearest ancestor holding pnpm-workspace.yaml, starting at this package. */
export function workspaceRoot(start: string = fileURLToPath(import.meta.url)): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The command that runs the turboslide CLI: [binary, ...leading args]. */
export function turboslideCommand(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.TURBOSLIDE_BIN) return [env.TURBOSLIDE_BIN];
  const root = workspaceRoot();
  if (root) {
    const bin = join(root, 'apps', 'cli', 'bin', 'turboslide.mjs');
    if (existsSync(bin)) return [process.execPath, bin];
  }
  return ['turboslide'];
}

/** render.json of a render directory, or null. */
export function readReference(dir: string): ReferenceSet | null {
  const path = join(dir, 'render.json');
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(raw)) return null;
  return { dir, records: raw as RenderRecord[] };
}

export function referenceRecord(
  set: ReferenceSet,
  slideId: string,
  theme: Theme,
  scale: ReferenceScale = 1,
): RenderRecord | undefined {
  return set.records.find((r) => r.slideId === slideId && r.theme === theme && r.scale === scale);
}

/** The absolute path of a record's image. */
export function referenceImage(set: ReferenceSet, record: RenderRecord): string {
  return isAbsolute(record.image) ? record.image : resolve(set.dir, record.image);
}

/** Slides of a theme the set lacks, or whose image file is gone. */
export function missingReferences(
  set: ReferenceSet | null,
  slideIds: readonly string[],
  theme: Theme,
  scale: ReferenceScale = 1,
): string[] {
  if (!set) return [...slideIds];
  return slideIds.filter((id) => {
    const record = referenceRecord(set, id, theme, scale);
    return !record || !existsSync(referenceImage(set, record));
  });
}

export type EnsureReferenceOptions = {
  dir: string;
  deckDir: string;
  theme: Theme;
  slideIds: readonly string[];
  /** The device scale to render at (default 1; flatten verifies at 2). */
  scale?: ReferenceScale;
  /** Re-render when the records carry another revision (default true). */
  revision?: number;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  log?: (line: string) => void;
};

/**
 * Renders the missing slides of a theme into `dir` with `turboslide render` and returns the set.
 * When every slide is present at the wanted revision nothing runs.
 */
export async function ensureReference(options: EnsureReferenceOptions): Promise<ReferenceSet> {
  const env = options.env ?? process.env;
  const scale = options.scale ?? 1;
  let set = readReference(options.dir);
  let missing = missingReferences(set, options.slideIds, options.theme, scale);
  if (set && options.revision !== undefined) {
    const stale = options.slideIds.filter((id) => {
      const record = referenceRecord(set as ReferenceSet, id, options.theme, scale);
      return record !== undefined && record.revision !== options.revision;
    });
    if (stale.length) {
      options.log?.(
        `verify: ${stale.length} reference render(s) are at another revision than the export (${options.revision}); re-rendering`,
      );
      missing = [...new Set([...missing, ...stale])];
    }
  }
  if (missing.length === 0 && set) return set;
  const [bin, ...lead] = turboslideCommand(env);
  const args = [
    ...lead,
    'render',
    ...(missing.length === options.slideIds.length ? ['all'] : missing),
    '--deck',
    options.deckDir,
    '--theme',
    options.theme,
    '--scale',
    String(scale),
    '--out',
    options.dir,
    '--json',
  ];
  options.log?.(`verify: rendering ${missing.length} reference slide(s): ${bin} ${args.join(' ')}`);
  const { stdout } = await execFileAsync(bin ?? 'turboslide', args, {
    env,
    timeout: options.timeoutMs ?? 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const fresh = JSON.parse(stdout) as RenderRecord[];
  // `turboslide render` rewrites render.json with only the slides it rendered; keep the others.
  const kept = (set?.records ?? []).filter(
    (r) =>
      !fresh.some((f) => f.slideId === r.slideId && f.theme === r.theme && f.scale === r.scale),
  );
  set = { dir: options.dir, records: [...kept, ...fresh] };
  const still = missingReferences(set, options.slideIds, options.theme, scale);
  if (still.length)
    throw new Error(`verify: no reference render for ${still.join(', ')} after rendering`);
  return set;
}

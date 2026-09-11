// Where the worker finds decks and keeps its files. Decks: TURBOSLIDE_DECKS_DIR, else /work/decks
// when a checkout is mounted at /work (the Docker image's volume), else <repo>/decks. Work files:
// TURBOSLIDE_WORKER_DIR, else <repo>/.turboslide/worker, git-ignored like every derived file
// (SPEC 4.1). Renders are content addressed under cache/<deckId>/<revision>/<theme>@<scale>/ so a
// repeated request is a cache hit (SPEC 11, Hosting).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Theme } from '@turboslide/schema/render';

export type WorkerPaths = {
  decksDir: string;
  workerDir: string;
  env: NodeJS.ProcessEnv;
};

/** The nearest ancestor holding pnpm-workspace.yaml; TURBOSLIDE_ROOT wins. */
export function repoRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TURBOSLIDE_ROOT) return resolve(env.TURBOSLIDE_ROOT);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export function defaultPaths(env: NodeJS.ProcessEnv = process.env): WorkerPaths {
  const root = repoRoot(env);
  const decksDir =
    env.TURBOSLIDE_DECKS_DIR ?? (existsSync('/work/decks') ? '/work/decks' : join(root, 'decks'));
  const workerDir = env.TURBOSLIDE_WORKER_DIR ?? join(root, '.turboslide', 'worker');
  return { decksDir: resolve(decksDir), workerDir: resolve(workerDir), env };
}

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** The deck directory for an id; RangeError when the id is not a slug or the deck is missing. */
export function deckDirOf(paths: WorkerPaths, deckId: string): string {
  if (!isSlug(deckId)) throw new RangeError(`deckId must be a slug, got ${JSON.stringify(deckId)}`);
  const dir = join(paths.decksDir, deckId);
  if (!existsSync(join(dir, 'deck.json')))
    throw new RangeError(`no deck ${deckId} under ${paths.decksDir}`);
  return dir;
}

export type DeckHead = { id: string; revision: number; order: string[] };

/** The manifest facts a job needs: the revision and the slide order (SPEC 4.2). */
export function readDeckHead(deckDir: string): DeckHead {
  const raw = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    id?: string;
    revision?: number;
    sections?: { slideIds?: string[] }[];
  };
  return {
    id: raw.id ?? '',
    revision: raw.revision ?? 0,
    order: (raw.sections ?? []).flatMap((s) => s.slideIds ?? []),
  };
}

export function cacheDir(
  paths: WorkerPaths,
  deckId: string,
  revision: number,
  theme: Theme,
  scale: 1 | 2,
): string {
  return join(paths.workerDir, 'cache', deckId, String(revision), `${theme}@${scale}x`);
}

export function jobsDir(paths: WorkerPaths): string {
  return join(paths.workerDir, 'jobs');
}

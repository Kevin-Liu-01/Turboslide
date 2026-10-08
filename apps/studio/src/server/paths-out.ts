import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';

import { decksDir, repoRoot, stateDir, workspaceRoot } from './root';

/**
 * No answer carries a path of this instance's file system (security hotfix H3, DATA-V6):
 * `deck.create` and `deck.copy` answered `dir`, the deck's absolute folder; a bundle upload, a
 * worker job, a render record and an export report carried the job, cache and overlay folders.
 * The answers built from the store's and the worker's results pass through `withoutServerPaths`,
 * which drops every `dir` key and cuts every path under one of the instance's own folders to its
 * last segment (the file's name, which the pages show). Deck content never passes through it.
 * Server only.
 */

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** The instance's own folders, longest first, each with its resolved form beside it. */
export function serverRoots(): string[] {
  const roots = new Set<string>();
  const add = (path: string | null | undefined): void => {
    if (path === null || path === undefined || path.length < 2) return;
    roots.add(path);
    try {
      roots.add(realpathSync(path));
    } catch {
      // a folder not made yet: its given form alone
    }
  };
  for (const path of [
    repoRoot(),
    decksDir(),
    stateDir(),
    workspaceRoot(),
    process.env.TURBOSLIDE_WORKER_DIR,
    process.env.TURBOSLIDE_DECKS_DIR,
    process.env.TURBOSLIDE_PACKAGES_DIR,
    tmpdir(),
    process.cwd(),
  ])
    add(path);
  return [...roots].filter((root) => root !== '/').sort((a, b) => b.length - a.length);
}

/** A text with every path under one of the roots cut to its last segment. */
export function scrubServerPaths(text: string, roots: readonly string[] = serverRoots()): string {
  let out = text;
  for (const root of roots) {
    if (!out.includes(root)) continue;
    const pattern = new RegExp(
      `${root.replace(ESCAPE, '\\$&')}(?:[\\\\/][^\\s'"\`,;)\\]}]*)?`,
      'g',
    );
    out = out.replace(pattern, (match) => basename(match));
  }
  return out;
}

/** A JSON value with its `dir` keys dropped and every server path cut to its last segment. */
export function withoutServerPaths<T>(value: T, roots: readonly string[] = serverRoots()): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return scrubServerPaths(node, roots);
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) if (key !== 'dir') out[key] = walk(child);
      return out;
    }
    return node;
  };
  return walk(value) as T;
}

/**
 * A new deck's answer (`deck.create`, `deck.copy`, a template copy, a bundle upload): no path of
 * this instance, and `dir`, which the actions' output schema requires, as the deck's place in the
 * store's layout (`decks/<id>`) instead of its absolute folder on the instance.
 */
export function publicDeckAnswer<T extends { deckId: string; dir: string }>(
  made: T,
  roots: readonly string[] = serverRoots(),
): T {
  return { ...withoutServerPaths(made, roots), dir: `decks/${made.deckId}` };
}

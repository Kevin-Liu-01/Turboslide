import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The repository root, for the server side of the studio: the deck folders
 * (decks/*), the theme sprite and the generated contracts live at the root,
 * and the dev server may be started from the root (scripts/check.mjs) or
 * from apps/studio (pnpm --filter). TURBOSLIDE_ROOT wins when set; otherwise
 * the nearest ancestor of the working directory holding pnpm-workspace.yaml.
 */
export function repoRoot(): string {
  const fromEnv = process.env.TURBOSLIDE_ROOT;
  if (fromEnv) return resolve(fromEnv);
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** The folder a deck lives in: decks/<id> under the root (SPEC 4.1). */
export function deckDir(deckId: string): string {
  return join(repoRoot(), 'decks', deckId);
}

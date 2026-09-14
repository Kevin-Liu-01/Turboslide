// The deck lock the record writers take (gslides-parity SPEC-3 5.2, 6.9: "on a checkout the CLI
// writes comments/ under the FileStore's lock"): the same file the FileStore takes around a
// document write, `<deck>/.turboslide/write.lock`, created exclusively, so a comment or an access
// record write never interleaves with a document write of another process. The FileStore's own
// helper is not exported (packages/store/src/file-store.ts withLock, B2's); this is the same
// protocol on the same path (b1.md requests B2 to export it so the copy goes), with the same
// stale rule: a lock older than 30 s was left behind by a crashed process and is cleared.
import { mkdirSync, openSync, closeSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_DIR = '.turboslide';
export const LOCK_FILE = 'write.lock';
/** A lock older than this is treated as left behind by a crashed process (file-store.ts STALE_LOCK_MS). */
export const STALE_LOCK_MS = 30_000;
export const LOCK_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function lockPath(deckDir: string): string {
  return join(deckDir, STATE_DIR, LOCK_FILE);
}

/** Runs `run` while holding the deck's write lock; waits for another holder and clears a stale one. */
export async function withDeckLock<T>(
  deckDir: string,
  run: () => Promise<T> | T,
  options: { timeoutMs?: number; staleMs?: number } = {},
): Promise<T> {
  const path = lockPath(deckDir);
  const timeoutMs = options.timeoutMs ?? LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? STALE_LOCK_MS;
  mkdirSync(join(deckDir, STATE_DIR), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      closeSync(fd);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > staleMs) {
          rmSync(path, { force: true });
          continue;
        }
      } catch {
        // gone between the stat and the removal: another process cleared it
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`the deck is locked by another process (${path}); try again in a moment`);
      }
      await sleep(10);
    }
  }
  try {
    return await run();
  } finally {
    rmSync(path, { force: true });
  }
}

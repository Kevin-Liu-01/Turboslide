// The watch channel (SPEC 6.7 "External changes arrive over the store's watch channel as a new
// revision"): fs.watch on the deck directory, recursive, debounced, reporting the files that
// changed and the revision deck.json carries afterwards. Files under .turboslide/ (leases, the
// write lock, renders) are not deck changes and are filtered out.
import { existsSync, readFileSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';

import type { StoreEvent, StoreListener } from './store.ts';

export type WatchOptions = {
  /** How long to wait for a burst of file events to settle. Default 80 ms. */
  debounceMs?: number;
  /** Path prefixes (relative to the deck directory) that never count as deck changes. */
  ignore?: ReadonlyArray<string>;
};

export const DEFAULT_IGNORE: ReadonlyArray<string> = ['.turboslide'];

/** The revision in deck.json, or null when the manifest is missing or unreadable. */
export function readRevision(dir: string): number | null {
  const path = join(dir, 'deck.json');
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { revision?: unknown };
    return typeof raw.revision === 'number' ? raw.revision : null;
  } catch {
    return null;
  }
}

function isIgnored(file: string, ignore: ReadonlyArray<string>): boolean {
  return ignore.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

/**
 * Watches a deck directory. The listener receives one event per settled burst with the changed
 * paths relative to the directory. The return value stops the watcher.
 */
export function watchDeck(
  dir: string,
  listener: StoreListener,
  options: WatchOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 80;
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const flush = (): void => {
    timer = undefined;
    const files = [...pending].sort();
    pending.clear();
    if (files.length === 0) return;
    const event: StoreEvent = { type: 'change', revision: readRevision(dir), files };
    listener(event);
  };
  const watcher = fsWatch(dir, { recursive: true }, (_eventType, filename) => {
    const file = filename === null ? '' : String(filename).split('\\').join('/');
    if (file === '' || isIgnored(file, ignore)) return;
    pending.add(file);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    pending.clear();
    watcher.close();
  };
}

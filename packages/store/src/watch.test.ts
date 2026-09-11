// The watch channel reports a settled burst of file changes with the revision deck.json carries
// afterwards, and ignores the state directory.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoreEvent } from './store.ts';
import { readRevision, watchDeck } from './watch.ts';

/**
 * Waits until an event names `file` at `revision`. A burst of writes may settle in more than one
 * event under load, and FSEvents on macOS can deliver a write made just before the watcher
 * started, so the test reads the whole sequence and waits for the state it caused.
 */
function until(
  events: StoreEvent[],
  file: string,
  revision: number,
  timeoutMs: number,
): Promise<StoreEvent[]> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = (): void => {
      if (events.some((event) => event.files.includes(file) && event.revision === revision)) {
        resolve([...events]);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(
          new Error(
            `no watch event named ${file} at revision ${revision}; saw ${JSON.stringify(events)}`,
          ),
        );
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

describe('watchDeck', () => {
  let dir: string;
  let stop: (() => void) | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'turboslide-watch-'));
    mkdirSync(join(dir, 'slides'));
    mkdirSync(join(dir, '.turboslide'));
    writeFileSync(join(dir, 'deck.json'), '{ "revision": 3 }\n');
  });

  afterEach(() => {
    stop?.();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the revision from the manifest', () => {
    expect(readRevision(dir)).toBe(3);
    expect(readRevision(join(dir, 'nowhere'))).toBeNull();
    writeFileSync(join(dir, 'deck.json'), 'not json');
    expect(readRevision(dir)).toBeNull();
  });

  it('reports a change with the new revision and skips .turboslide', async () => {
    const events: StoreEvent[] = [];
    stop = watchDeck(dir, (event) => events.push(event), { debounceMs: 40 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    writeFileSync(join(dir, '.turboslide', 'leases.json'), '{ "leases": [] }\n');
    writeFileSync(join(dir, 'slides', 'thesis.json'), '{}\n');
    writeFileSync(join(dir, 'deck.json'), '{ "revision": 4 }\n');
    const seen = await until(events, 'deck.json', 4, 8000);
    const files = seen.flatMap((event) => event.files);
    expect(seen.every((event) => event.type === 'change')).toBe(true);
    expect(files).toContain('deck.json');
    expect(files).toContain('slides/thesis.json');
    expect(files.some((file) => file.startsWith('.turboslide'))).toBe(false);
  }, 15_000);
});

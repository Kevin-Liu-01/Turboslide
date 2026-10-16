// The deck index's removal (hardening HR-SD#2, DATA-V5): an account deletion drops the person's
// `users/<principalId>/decks.json` (the link grants, the typed name, the avatar choice) on every
// backend. On the Blob store the index's immutable copies under `users/<folder>/.turboslide/`
// go with it, and a principal whose folder name starts with the removed one's keeps its index.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  blobIndexStore,
  emptyDeckIndex,
  fileIndexStore,
  indexUpdates,
  memoryIndexStore,
} from './access-store';
import { memoryBlobClient } from './blob-fake';

const NOW = '2026-10-12T00:00:00.000Z';
const noSleep = async (): Promise<void> => undefined;

describe('IndexStore.remove', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('the Blob backend removes the index and its copies, and no other principal’s', async () => {
    const client = memoryBlobClient();
    const index = blobIndexStore(client, { sleep: noSleep });
    await index.update('usr_ab', indexUpdates.name('Maya'));
    await index.update('usr_ab', indexUpdates.shared('q4', 'viewer', NOW, 'link', 'lnk_a'));
    await index.update('usr_abc', indexUpdates.name('Omar'));
    const own = [...client.blobs.keys()].filter((path) => path.startsWith('users/usr_ab/'));
    // the document and one immutable copy per version written
    expect(own).toHaveLength(3);
    expect(await index.remove('usr_ab')).toBe(3);
    expect([...client.blobs.keys()].filter((path) => path.startsWith('users/usr_ab/'))).toEqual([]);
    expect(await index.read('usr_ab')).toEqual(emptyDeckIndex());
    expect((await index.read('usr_abc')).name).toBe('Omar');
    expect(await index.remove('usr_ab')).toBe(0);
  });

  it('the file backend removes the index and its folder, and no other principal’s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-index-remove-'));
    dirs.push(dir);
    const index = fileIndexStore(dir);
    await index.update('usr_ab', indexUpdates.name('Maya'));
    await index.update('anon_ab', indexUpdates.name('Guest'));
    expect(existsSync(join(dir, 'users', 'usr_ab', 'decks.json'))).toBe(true);
    expect(await index.remove('usr_ab')).toBe(1);
    expect(existsSync(join(dir, 'users', 'usr_ab'))).toBe(false);
    expect(await index.read('usr_ab')).toEqual(emptyDeckIndex());
    expect((await index.read('anon_ab')).name).toBe('Guest');
    expect(await index.remove('usr_ab')).toBe(0);
  });

  it('the memory backend removes the index', async () => {
    const index = memoryIndexStore();
    await index.update('usr_ab', indexUpdates.name('Maya'));
    expect(await index.remove('usr_ab')).toBe(1);
    expect(index.indexes.has('usr_ab')).toBe(false);
    expect(await index.remove('usr_ab')).toBe(0);
  });
});

// The copy module's additions for the backup (hardening O#1a): the deadline after which no object
// starts, `replaceDiffering`, and the two adapters over the store's own client. The pass itself,
// the skip rules, the verify and the delta are scripts/blob-copy.test.mjs's, over the same module.
import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import { copyClientOf, copyStore, listAll, prefixedCopyClient } from './copy.ts';

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const json = (): string => 'application/json';

async function sourceWith(count: number) {
  const fake = memoryBlobClient('https://source.blob.local');
  for (let i = 0; i < count; i += 1)
    await fake.put(`decks/d1/versions/${i}.json`, enc(`{"n":${i}}`), { overwrite: false });
  return fake;
}

describe('the copy over the store clients', () => {
  it('stops starting objects at the deadline, counts what it left, and a later pass ends equal', async () => {
    const sourceFake = await sourceWith(10);
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = copyClientOf(sourceFake, json);
    const target = prefixedCopyClient(copyClientOf(targetFake, json), 'backup/2026-10-11/');
    const entries = await listAll(source, 'decks/');
    let clock = 0;
    const now = (): number => clock;
    // every object moves the clock by 10 ms; the deadline at 35 ms lets four start
    const ticking = {
      ...target,
      put: async (...args: Parameters<typeof target.put>) => {
        clock += 10;
        return target.put(...args);
      },
    };
    const first = await copyStore({
      source,
      target: ticking,
      entries,
      concurrency: 1,
      deadline: 35,
      now,
    });
    expect(first.copied).toBe(4);
    expect(first.stopped).toBe(6);
    expect(targetFake.blobs.size).toBe(4);
    const second = await copyStore({ source, target, entries, concurrency: 3 });
    expect(second.already).toBe(4);
    expect(second.copied).toBe(6);
    expect(second.stopped).toBe(0);
    for (const [pathname, stored] of sourceFake.blobs)
      expect(targetFake.blobs.get(`backup/2026-10-11/${pathname}`)?.version).toBe(stored.version);
  });

  it('replaces a copy the source moved past with replaceDiffering, and lists it as a conflict without', async () => {
    const sourceFake = await sourceWith(1);
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = copyClientOf(sourceFake, json);
    const target = copyClientOf(targetFake, json);
    const entries = await listAll(source);
    await copyStore({ source, target, entries });
    await sourceFake.put('decks/d1/versions/0.json', enc('{"n":"moved"}'), { overwrite: true });
    const moved = await listAll(source);
    const plain = await copyStore({ source, target, entries: moved });
    expect(plain.conflicts).toEqual(['decks/d1/versions/0.json']);
    const replacing = await copyStore({ source, target, entries: moved, replaceDiffering: true });
    expect(replacing.replaced).toEqual(['decks/d1/versions/0.json']);
    expect(new TextDecoder().decode(targetFake.blobs.get('decks/d1/versions/0.json')?.bytes)).toBe(
      '{"n":"moved"}',
    );
  });

  it('lists a prefixed client without its prefix and puts the content type the caller names', async () => {
    const targetFake = memoryBlobClient('https://target.blob.local');
    const day = prefixedCopyClient(copyClientOf(targetFake, json), 'backup/2026-10-11/');
    await day.put('users/u1/decks.json', enc('{}'), { contentType: 'application/json' });
    await targetFake.put('backup/2026-10-10/users/u0/decks.json', enc('{}'), { overwrite: false });
    expect((await listAll(day, 'users/')).map((entry) => entry.pathname)).toEqual([
      'users/u1/decks.json',
    ]);
    expect(await day.head('users/u1/decks.json')).toMatchObject({
      pathname: 'users/u1/decks.json',
      contentType: 'application/json',
    });
  });
});

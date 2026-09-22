// The store call counters of the sync and costs round (docs/SYNC.md 6.3, the call counting
// harness): `boundedBlobClient` counts every call it bounds by deck prefix and operation over a
// sliding 60 s window, per process, and `sync.status.storeCalls` reads the counts with the
// instance id. Pure over an injected clock; the fake client records the same calls beside.
import { afterEach, describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import {
  STORE_CALLS_WINDOW_MS,
  STORE_CALL_OPS,
  boundedBlobClient,
  deckIdOfPathname,
  listFolderOf,
  noteStoreCall,
  resetStoreCalls,
  storeCallsFor,
  storeInstanceId,
} from './blob-store.ts';

afterEach(() => {
  resetStoreCalls();
});

describe('the store call counters', () => {
  it('count by deck and operation over a sliding window, and forget what left it', () => {
    const t0 = 1_000_000;
    noteStoreCall('head', 'decks/q4-review/deck.json', t0);
    noteStoreCall('head', 'decks/q4-review/.turboslide/pulse.json', t0 + 10);
    noteStoreCall('get', 'decks/q4-review/snapshots/abc.json', t0 + 20);
    noteStoreCall('put', 'decks/q4-review/versions/3.json', t0 + 30);
    noteStoreCall('list', 'decks/q4-review/snapshots/', t0 + 40);
    noteStoreCall('del', 'decks/q4-review/slides/gone.json', t0 + 50);
    noteStoreCall('head', 'decks/other-deck/deck.json', t0 + 60);
    noteStoreCall('put', 'index/fresh-decks.json', t0 + 70);
    const counts = storeCallsFor('q4-review', t0 + 100);
    expect(counts).toMatchObject({ head: 2, get: 1, put: 1, list: 1, del: 1 });
    expect(counts.windowMs).toBe(STORE_CALLS_WINDOW_MS);
    expect(counts.instance).toBe(storeInstanceId());
    // a list is named by the folder it listed (the ship of the sync and costs round: the pull row
    // reads `lists.versions`, the prune's, the open's and the render's listings beside it)
    expect(counts.lists).toEqual({
      versions: 0,
      snapshots: 1,
      assets: 0,
      thumbs: 0,
      presence: 0,
      deck: 0,
      other: 0,
    });

    expect(storeCallsFor('other-deck', t0 + 100)).toMatchObject({ head: 1, get: 0, put: 0 });
    // a path outside decks/ counts under the empty key, never under a deck
    expect(storeCallsFor('', t0 + 100)).toMatchObject({ put: 1 });
    // the window slides: the first head has left it at t0 plus the window, the rest stay
    const later = storeCallsFor('q4-review', t0 + STORE_CALLS_WINDOW_MS + 5);
    expect(later).toMatchObject({ head: 1, get: 1, put: 1, list: 1, del: 1 });
    expect(storeCallsFor('q4-review', t0 + STORE_CALLS_WINDOW_MS + 1000)).toMatchObject({
      head: 0,
      get: 0,
      put: 0,
      list: 0,
      del: 0,
    });
    // a deck never called answers zeros with the instance id
    expect(storeCallsFor('never-seen')).toMatchObject({ head: 0, instance: storeInstanceId() });
    expect(STORE_CALL_OPS).toEqual(['head', 'get', 'put', 'list', 'del']);
  });

  it('names the folder each list read, so the pull row can tell its own listing from the prune, the open and the render', () => {
    const t0 = 2_000_000;
    noteStoreCall('list', 'decks/q4-review/assets/', t0 + 1);
    noteStoreCall('list', 'decks/q4-review/thumbs/', t0 + 2);
    noteStoreCall('list', 'decks/q4-review/versions/', t0 + 3);
    noteStoreCall('list', 'decks/q4-review/.turboslide/presence/', t0 + 4);
    noteStoreCall('list', 'decks/q4-review/', t0 + 5);
    noteStoreCall('list', 'decks/q4-review/exports/', t0 + 6);
    noteStoreCall('list', 'decks/q4-review/snapshots/', t0 + 7);
    expect(storeCallsFor('q4-review', t0 + 100)).toMatchObject({
      list: 7,
      lists: { versions: 1, snapshots: 1, assets: 1, thumbs: 1, presence: 1, deck: 1, other: 1 },
    });
    // the window slides over the folders as over the operations
    expect(storeCallsFor('q4-review', t0 + STORE_CALLS_WINDOW_MS + 4)).toMatchObject({
      list: 3,
      lists: { versions: 0, snapshots: 1, assets: 0, thumbs: 0, presence: 0, deck: 1, other: 1 },
    });
    expect(listFolderOf('decks/q4-review/snapshots/')).toBe('snapshots');
    expect(listFolderOf('decks/q4-review/.turboslide/presence/')).toBe('presence');
    expect(listFolderOf('decks/q4-review/')).toBe('deck');
    expect(listFolderOf('decks/q4-review/exports/')).toBe('other');
    expect(listFolderOf('index/')).toBe('other');
  });

  it('read the deck off a pathname', () => {
    expect(deckIdOfPathname('decks/q4-review/deck.json')).toBe('q4-review');
    expect(deckIdOfPathname('decks/q4-review/.turboslide/presence/abc.json')).toBe('q4-review');
    expect(deckIdOfPathname('decks/q4-review/')).toBe('q4-review');
    expect(deckIdOfPathname('decks/')).toBeNull();
    expect(deckIdOfPathname('index/fresh-decks.json')).toBeNull();
    expect(deckIdOfPathname('exports/.jobs/x.json')).toBeNull();
  });

  it('are fed by the bounded client for every call it bounds, folders as a list', async () => {
    const fake = memoryBlobClient();
    const client = boundedBlobClient(fake);
    const body = new TextEncoder().encode('{}');
    await client.put('decks/q4-review/deck.json', body, { overwrite: true });
    await client.head('decks/q4-review/deck.json');
    await client.get('decks/q4-review/deck.json');
    await client.list('decks/q4-review/snapshots/');
    await client.folders('decks/');
    await client.del(['decks/q4-review/slides/gone.json']);
    const counts = storeCallsFor('q4-review');
    expect(counts).toMatchObject({ head: 1, get: 1, put: 1, list: 1, del: 1 });
    // the folders listing names no deck: it counts under the empty key as a list
    expect(storeCallsFor('')).toMatchObject({ list: 1 });
    // the fake saw the same calls
    expect(fake.calls.map((call) => call.op)).toEqual([
      'put',
      'head',
      'get',
      'list',
      'folders',
      'del',
    ]);
    // a client bounded twice counts once
    const again = boundedBlobClient(client);
    await again.head('decks/q4-review/deck.json');
    expect(storeCallsFor('q4-review').head).toBe(2);
  });

  it('mint one instance id per process, eight hex characters', () => {
    const id = storeInstanceId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(storeInstanceId()).toBe(id);
    expect(storeCallsFor('any').instance).toBe(id);
  });
});

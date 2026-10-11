// The pending queue mirror (gslides-parity SPEC-3 0.7): the key grammar, the 1 MB trim, the 24
// hour age, the unsaved count the offer names, and the memory store's load, save and remove.
import { describe, expect, it } from 'vitest';

import {
  PENDING_DB_NAME,
  PENDING_MAX_BYTES,
  clearPendingMirror,
  deckOfPendingKey,
  isStaleQueue,
  memoryPendingStore,
  pendingKey,
  trimQueue,
  unsavedCount,
} from './pending-store.ts';
import type { PersistedQueue } from './pending-store.ts';

const CLIENT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function queue(
  entries: PersistedQueue['entries'],
  savedAt = '2026-09-13T10:00:00.000Z',
): PersistedQueue {
  return {
    key: pendingKey('gt-brand', CLIENT),
    deckId: 'gt-brand',
    clientId: CLIENT,
    savedAt,
    entries,
  };
}

function op(n: number, seq?: number): PersistedQueue['entries'][number] {
  return {
    opId: `${CLIENT}:${n}`,
    kind: 'edit',
    mutations: [
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: n,
        remove: 0,
        insert: 'x',
      },
    ],
    ...(seq === undefined ? {} : { seq }),
  };
}

describe('the pending store', () => {
  it('keys a queue by deck and client and reads the deck back from a key', () => {
    expect(pendingKey('gt-brand', CLIENT)).toBe(`turboslide:pending:gt-brand:${CLIENT}`);
    expect(deckOfPendingKey(`turboslide:pending:gt-brand:${CLIENT}`)).toBe('gt-brand');
    expect(deckOfPendingKey('other:gt-brand:x')).toBeNull();
  });

  it('counts the pending ops and not the retained ones', () => {
    expect(unsavedCount(queue([op(1, 4), op(2), op(3)]))).toBe(2);
  });

  it('fits 1 MB by dropping retained entries, the oldest first, and keeps every pending one (HR-RC#5d)', () => {
    const entry = (i: number, seq?: number): PersistedQueue['entries'][number] => ({
      opId: `${CLIENT}:${i}`,
      kind: 'edit' as const,
      mutations: [
        {
          op: 'block.set' as const,
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          value: 'y'.repeat(50_000),
        },
      ],
      ...(seq === undefined ? {} : { seq }),
    });
    // 30 retained entries, then 10 pending ones: 2 MB
    const big = queue([
      ...Array.from({ length: 30 }, (_, i) => entry(i, i + 1)),
      ...Array.from({ length: 10 }, (_, i) => entry(30 + i)),
    ]);
    const trimmed = trimQueue(big);
    expect(new TextEncoder().encode(JSON.stringify(trimmed)).byteLength).toBeLessThanOrEqual(
      PENDING_MAX_BYTES,
    );
    expect(unsavedCount(trimmed)).toBe(10);
    expect(trimmed.entries.filter((row) => row.seq !== undefined)[0]?.opId).not.toBe(`${CLIENT}:0`);
    // a queue of pending entries alone over the cap keeps them all (the client refuses the next)
    const pending = queue(Array.from({ length: 25 }, (_, i) => entry(i)));
    expect(trimQueue(pending).entries).toHaveLength(25);
  });

  it('treats a queue saved more than 24 hours ago as stale', () => {
    const saved = Date.parse('2026-09-13T10:00:00.000Z');
    expect(isStaleQueue(queue([op(1)]), saved + 60_000)).toBe(false);
    expect(isStaleQueue(queue([op(1)]), saved + 25 * 60 * 60_000)).toBe(true);
  });

  it('saves, lists per deck newest first, keeps a queue older than 24 hours (HR-RC#5c) and removes', async () => {
    const store = memoryPendingStore();
    await store.save(queue([op(1)]));
    await store.save({
      ...queue([op(2)], '2026-09-13T11:00:00.000Z'),
      key: 'turboslide:pending:gt-brand:b',
      clientId: 'b',
    });
    await store.save({
      ...queue([op(3)]),
      key: 'turboslide:pending:other:c',
      deckId: 'other',
      clientId: 'c',
    });
    const listed = await store.load('gt-brand', Date.parse('2026-09-13T12:00:00.000Z'));
    expect(listed.map((q) => q.clientId)).toEqual(['b', CLIENT]);
    // two days later both are still there, and stale by isStaleQueue: the client offers them as text
    const later = await store.load('gt-brand', Date.parse('2026-09-15T12:00:00.000Z'));
    expect(later.map((q) => q.clientId)).toEqual(['b', CLIENT]);
    expect(later.every((q) => isStaleQueue(q, Date.parse('2026-09-15T12:00:00.000Z')))).toBe(true);
    await store.save(queue([]));
    expect(store.queues.has(pendingKey('gt-brand', CLIENT))).toBe(false);
    await store.remove('turboslide:pending:gt-brand:b');
    await store.remove('turboslide:pending:other:c');
    expect(store.queues.size).toBe(0);
  });

  it('keeps the position and the tier the pending entries were written on (HR-RC#5a)', async () => {
    const store = memoryPendingStore();
    await store.save({ ...queue([op(1)]), position: 41, tier: 'do' });
    const [saved] = await store.load('gt-brand', Date.parse('2026-09-13T10:01:00.000Z'));
    expect(saved).toMatchObject({ position: 41, tier: 'do' });
  });
});

describe('clearPendingMirror (SPEC-3 7.4, Forget this browser)', () => {
  it('removes the turboslide keys of localStorage and deletes the IndexedDB database together', async () => {
    const kept = new Map<string, string>([
      ['turboslide:pending:gt-brand:a1b2', '{}'],
      ['turboslide:other', 'x'],
      ['gt-theme', 'dark'],
    ]);
    const storage = {
      get length() {
        return kept.size;
      },
      key: (i: number) => [...kept.keys()][i] ?? null,
      removeItem: (key: string) => {
        kept.delete(key);
      },
    } as unknown as Storage;
    const deleted: string[] = [];
    const idb = {
      open: () => {
        throw new Error('not opened');
      },
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const req = {} as IDBOpenDBRequest & { onsuccess: (() => void) | null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    };
    await clearPendingMirror({ indexedDB: idb, localStorage: storage });
    expect([...kept.keys()]).toEqual(['gt-theme']);
    expect(deleted).toEqual([PENDING_DB_NAME]);
  });

  it('resolves in a browser without either store', async () => {
    await expect(
      clearPendingMirror({ indexedDB: { open: () => ({}) as IDBOpenDBRequest } }),
    ).resolves.toBeUndefined();
  });
});

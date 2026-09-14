// The read through cache in front of the access store (gslides-parity SPEC-3 6.1; VERIFICATION-3
// finding 34): a read inside the trust window answers the entry and costs no store read, the
// window is the option the studio shortens on the blob tier, a write on this instance replaces
// the entry and publishes the drop to every subscriber, and `drop` then `read` sees a record
// another instance wrote behind the cache, which is what a share write's etag and a link
// exchange's second pass lean on (apps/studio/src/server/access.ts `readStoredAccessFresh`).
import { describe, expect, it, vi } from 'vitest';

import { legacyAssetKey, newDeckRecord } from '@turboslide/schema/access';

import { cachedAccessStore, memoryAccessBus, memoryAccessStore } from './access-store';

const DECK = 'q4-review';
const NOW = '2026-09-14T00:00:00.000Z';

function recordBy(owner: string) {
  return newDeckRecord(DECK, owner, legacyAssetKey(DECK), NOW);
}

function harness(ttlMs?: number) {
  const inner = memoryAccessStore();
  const reads = vi.spyOn(inner, 'read');
  let clock = 1_000;
  const bus = memoryAccessBus();
  const dropped: string[] = [];
  bus.subscribe((deckId) => dropped.push(deckId));
  const store = cachedAccessStore(inner, {
    bus,
    now: () => clock,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
  return { inner, reads, store, bus, dropped, advance: (ms: number) => (clock += ms) };
}

describe('cachedAccessStore', () => {
  it('answers the entry inside the trust window and reads the store again after it', async () => {
    const { inner, reads, store, advance } = harness(5_000);
    await inner.write(DECK, recordBy('anon_first'));
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    // another instance writes behind this cache
    await inner.write(DECK, recordBy('anon_second'));
    advance(4_000);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    expect(reads).toHaveBeenCalledTimes(1);
    advance(1_001);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('trusts a read for 60 s by default', async () => {
    const { inner, reads, store, advance } = harness();
    await inner.write(DECK, recordBy('anon_first'));
    await store.read(DECK);
    await inner.write(DECK, recordBy('anon_second'));
    advance(59_000);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
    advance(1_001);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('sees a record written behind the cache after drop, inside the window', async () => {
    const { inner, store, advance } = harness(60_000);
    await inner.write(DECK, recordBy('anon_first'));
    const first = await store.read(DECK);
    const behind = await inner.write(DECK, recordBy('anon_second'));
    advance(100);
    expect((await store.read(DECK))?.etag).toBe(first?.etag);
    store.drop(DECK);
    const fresh = await store.read(DECK);
    expect(fresh?.record.owner).toBe('anon_second');
    expect(fresh?.etag).toBe(behind.etag);
    // and the fresh etag is the one a conditional write needs
    await expect(
      store.write(DECK, { ...recordBy('anon_second'), revision: 1 }, { ifMatch: fresh?.etag }),
    ).resolves.toMatchObject({ record: { revision: 1 } });
  });

  it('caches a missing record too, until a drop or the window ends', async () => {
    const { inner, reads, store } = harness(5_000);
    expect(await store.read(DECK)).toBeNull();
    await inner.write(DECK, recordBy('anon_first'));
    expect(await store.read(DECK)).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
    store.drop(DECK);
    expect((await store.read(DECK))?.record.owner).toBe('anon_first');
  });

  it('replaces the entry on a write here and publishes the drop to every subscriber', async () => {
    const { inner, store, bus, dropped } = harness(60_000);
    const other = cachedAccessStore(inner, { bus, now: () => 1_000, ttlMs: 60_000 });
    await inner.write(DECK, recordBy('anon_first'));
    await store.read(DECK);
    await other.read(DECK);
    await store.write(DECK, recordBy('anon_second'));
    expect(dropped).toEqual([DECK]);
    expect((await store.read(DECK))?.record.owner).toBe('anon_second');
    // the other cache on the same bus dropped its entry and reads the store
    expect((await other.read(DECK))?.record.owner).toBe('anon_second');
    await store.remove(DECK);
    expect(dropped).toEqual([DECK, DECK]);
    expect(await store.read(DECK)).toBeNull();
    other.close();
    store.close();
  });
});

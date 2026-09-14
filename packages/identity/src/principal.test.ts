import { describe, expect, test } from 'vitest';

import {
  PRINCIPAL_TTL_MS,
  isPrincipalExpired,
  kvPrincipalStore,
  memoryKv,
  memoryPrincipalStore,
  newPrincipalRecord,
  parsePrincipalRecord,
  principalExpiresAt,
  principalKey,
} from './principal.ts';
import type { KvClient } from './principal.ts';

const ID = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const T0 = Date.parse('2026-09-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('the record', () => {
  test('a new record carries the label, the defaults and one stamp', () => {
    const record = newPrincipalRecord(ID, new Date(T0));
    expect(record).toEqual({
      principalId: ID,
      label: expect.stringMatching(/^[A-Z][a-z]+ [1-9][0-9]{2}$/),
      avatar: { variant: 'initials' },
      linkGrants: [],
      notificationSettings: 'forYou',
      livePointers: { collaborators: true, mine: {} },
      createdAt: '2026-09-13T12:00:00.000Z',
      lastSeenAt: '2026-09-13T12:00:00.000Z',
    });
    expect(principalExpiresAt(record)).toBe(T0 + PRINCIPAL_TTL_MS);
    expect(PRINCIPAL_TTL_MS).toBe(90 * DAY);
    expect(isPrincipalExpired(record, new Date(T0 + 89 * DAY))).toBe(false);
    expect(isPrincipalExpired(record, new Date(T0 + 90 * DAY))).toBe(true);
    expect(() => newPrincipalRecord('kevin')).toThrow(RangeError);
    expect(principalKey(ID)).toBe(`principal:${ID}`);
  });

  test('parsePrincipalRecord accepts a round trip and refuses other shapes', () => {
    const record = newPrincipalRecord(ID, new Date(T0));
    record.name = 'Maya Chen';
    record.linkGrants.push({ linkId: 'lnk_1', deckId: 'q4-review', role: 'viewer' });
    record.avatar = {
      variant: 'picture',
      picture: { avatarKey: 'k', digest: 'd', sizes: [32, 64] },
    };
    expect(parsePrincipalRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(parsePrincipalRecord(null)).toBeNull();
    expect(parsePrincipalRecord([])).toBeNull();
    expect(parsePrincipalRecord({ ...record, principalId: 'kevin' })).toBeNull();
    expect(parsePrincipalRecord({ ...record, extra: 1 })).toBeNull();
    expect(parsePrincipalRecord({ ...record, notificationSettings: 'loud' })).toBeNull();
    expect(parsePrincipalRecord({ ...record, avatar: { variant: 'photo' } })).toBeNull();
    expect(parsePrincipalRecord({ ...record, linkGrants: [{ linkId: 1 }] })).toBeNull();
    expect(parsePrincipalRecord({ ...record, lastSeenAt: 'yesterday' })).toBeNull();
    expect(
      parsePrincipalRecord({ ...record, livePointers: { collaborators: 'yes', mine: {} } }),
    ).toBeNull();
    expect(parsePrincipalRecord({ ...record, name: 7 })).toBeNull();
  });
});

describe('the key value store', () => {
  test('put, get, touch and the sliding TTL against the memory client', async () => {
    let now = T0;
    const kv = memoryKv(() => now);
    const store = kvPrincipalStore(kv);
    expect(await store.get(ID, new Date(now))).toBeNull();
    expect(await store.touch(ID, new Date(now))).toBeNull();

    const created = await store.touch(ID, new Date(now), true);
    expect(created?.principalId).toBe(ID);
    expect(kv.size()).toBe(1);

    now += 60 * DAY;
    const seen = await store.get(ID, new Date(now));
    expect(seen?.lastSeenAt).toBe(new Date(T0).toISOString());
    const touched = await store.touch(ID, new Date(now));
    expect(touched?.lastSeenAt).toBe(new Date(now).toISOString());

    // 89 days after the touch the record is there; 90 days after it is gone on both counts.
    now += 89 * DAY;
    expect(await store.get(ID, new Date(now))).not.toBeNull();
    now += DAY;
    expect(await store.get(ID, new Date(now))).toBeNull();
    expect(kv.size()).toBe(0);
  });

  test('put writes the record with the TTL left on it and get refuses bad bytes', async () => {
    const writes: Array<{ key: string; ttl: number }> = [];
    const backing = new Map<string, string>();
    const kv: KvClient = {
      async get(key) {
        return backing.get(key) ?? null;
      },
      async set(key, value, ttl) {
        backing.set(key, value);
        writes.push({ key, ttl });
      },
      async del(key) {
        backing.delete(key);
      },
    };
    const store = kvPrincipalStore(kv);
    const record = newPrincipalRecord(ID, new Date(Date.now() - 10 * DAY));
    await store.put(record);
    expect(writes[0]?.key).toBe(`principal:${ID}`);
    expect(writes[0]?.ttl).toBeGreaterThan(79 * DAY);
    expect(writes[0]?.ttl).toBeLessThanOrEqual(80 * DAY);
    expect(await store.get(ID)).toEqual(record);

    backing.set(`principal:${ID}`, '{not json');
    expect(await store.get(ID)).toBeNull();
    backing.set(`principal:${ID}`, JSON.stringify({ principalId: ID }));
    expect(await store.get(ID)).toBeNull();

    await store.put(record);
    await store.delete(ID);
    expect(await store.get(ID)).toBeNull();
  });

  test('an expired record read from the store answers null even before the backend sweeps it', async () => {
    const store = memoryPrincipalStore(() => T0);
    const old = newPrincipalRecord(ID, new Date(T0 - 91 * DAY));
    const kv = memoryKv(() => T0);
    const kvStore = kvPrincipalStore(kv);
    await kv.set(principalKey(ID), JSON.stringify(old), DAY);
    expect(await kvStore.get(ID, new Date(T0))).toBeNull();
    expect(await store.get(ID, new Date(T0))).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';

import { defaultPreferences, setPreference } from '@turboslide/schema/preferences';

import {
  PRINCIPAL_TTL_MS,
  isPrincipalExpired,
  kvPrincipalStore,
  memoryKv,
  memoryPrincipalStore,
  newPrincipalRecord,
  parsePrincipalRecord,
  preferencesOf,
  principalExpiresAt,
  principalKey,
  principalPreferencesStore,
  withPreferences,
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

// The preferences on the record (gslides-parity SPEC-5 7.1; R10 3.2, 3.4): absent reads as the
// defaults, an older or partial record fills its members, a malformed one refuses the record, and
// the store adapter behind prefs.get, prefs.set and the dictionary actions.
describe('the preferences on the record', () => {
  test('absent reads as the defaults; a stored record round trips; a partial one fills its members', () => {
    const record = newPrincipalRecord(ID, new Date(T0));
    expect(record.preferences).toBeUndefined();
    expect(preferencesOf(record)).toEqual(defaultPreferences());
    expect(preferencesOf(null)).toEqual(defaultPreferences());
    expect(parsePrincipalRecord(JSON.parse(JSON.stringify(record)))?.preferences).toBeUndefined();

    const prefs = setPreference(defaultPreferences(), '/units', 'cm');
    const stored = withPreferences(record, prefs, new Date(T0 + DAY));
    expect(stored.lastSeenAt).toBe(new Date(T0 + DAY).toISOString());
    expect(stored.preferences).toEqual(prefs);
    expect(record.preferences).toBeUndefined();
    expect(parsePrincipalRecord(JSON.parse(JSON.stringify(stored)))).toEqual(stored);

    // a record written before svgText and starred existed, or with only one member
    const older = { ...stored, preferences: { units: 'px', spelling: { underline: false } } };
    const parsed = parsePrincipalRecord(JSON.parse(JSON.stringify(older)));
    expect(parsed?.preferences?.units).toBe('px');
    expect(parsed?.preferences?.spelling).toEqual({ underline: false, dictionary: [] });
    expect(parsed?.preferences?.svgText).toBe('embed');
    expect(parsed?.preferences?.starred).toEqual([]);
    expect(parsed?.preferences?.substitutions.rows).toHaveLength(12);
  });

  test('a wrong type or an unknown member refuses the record', () => {
    const record = newPrincipalRecord(ID, new Date(T0));
    expect(parsePrincipalRecord({ ...record, preferences: null })).toBeNull();
    expect(parsePrincipalRecord({ ...record, preferences: 'in' })).toBeNull();
    expect(parsePrincipalRecord({ ...record, preferences: { units: 'pt' } })).toBeNull();
    expect(parsePrincipalRecord({ ...record, preferences: { theme: 'dark' } })).toBeNull();
    expect(parsePrincipalRecord({ ...record, preferences: { starred: 'q4' } })).toBeNull();
  });

  test('principalPreferencesStore creates the record on the first read, saves and re-arms the TTL', async () => {
    let now = T0;
    const kv = memoryKv(() => now);
    const principals = kvPrincipalStore(kv);
    const store = principalPreferencesStore(principals, ID, () => new Date(now));
    expect(await principals.get(ID, new Date(now))).toBeNull();
    expect(await store.load()).toEqual(defaultPreferences());
    const created = await principals.get(ID, new Date(now));
    expect(created?.principalId).toBe(ID);
    expect(created?.preferences).toBeUndefined();

    now += 10 * DAY;
    const saved = await store.save(setPreference(defaultPreferences(), '/starred/-', 'gt-brand'));
    expect(saved.starred).toEqual(['gt-brand']);
    const stored = await principals.get(ID, new Date(now));
    expect(stored?.preferences?.starred).toEqual(['gt-brand']);
    expect(stored?.lastSeenAt).toBe(new Date(now).toISOString());
    expect(stored?.label).toBe(created?.label);
    expect(await store.load()).toEqual(saved);

    // the record's other fields survive a save
    await principals.put({ ...stored!, name: 'Maya Chen' });
    await store.save(setPreference(saved, '/units', 'cm'));
    const after = await principals.get(ID, new Date(now));
    expect(after?.name).toBe('Maya Chen');
    expect(after?.preferences?.units).toBe('cm');
    expect(after?.preferences?.starred).toEqual(['gt-brand']);

    // an expired record starts over at the defaults
    now += 91 * DAY;
    expect(await store.load()).toEqual(defaultPreferences());
    expect(() => principalPreferencesStore(principals, 'kevin')).toThrow(RangeError);
    expect(() => principalPreferencesStore(principals, 'local:kevin')).toThrow(RangeError);
    expect(memoryPrincipalStore).toBeTypeOf('function');
  });
});

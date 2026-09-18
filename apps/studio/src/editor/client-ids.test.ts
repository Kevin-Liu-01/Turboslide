// The tab's client id memory and the self filter (build-4/hotfix-2.md causes B1 to B3): the ids a
// tab was issued survive in its storage, oldest first and capped, and a roster row with any of
// them is the tab itself, never a collaborator, while another tab of the same person stays one.
import { describe, expect, it } from 'vitest';

import {
  CLIENT_IDS_KEPT,
  TAB_TOKEN_KEY,
  clientIdsKey,
  partitionRoster,
  readClientIds,
  rememberClientId,
  tabToken,
} from './client-ids';
import type { IdStorage } from './client-ids';

function storage(): IdStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const id = (n: number): string => n.toString(16).padStart(32, '0');

describe('the tab’s client ids', () => {
  it('remembers every id the stream issued, oldest first, once each, at most CLIENT_IDS_KEPT', () => {
    const store = storage();
    expect(readClientIds(store, 'gt-brand')).toEqual([]);
    expect(rememberClientId(store, 'gt-brand', id(1))).toEqual([id(1)]);
    expect(rememberClientId(store, 'gt-brand', id(2))).toEqual([id(1), id(2)]);
    // the same id again moves to the end instead of doubling
    expect(rememberClientId(store, 'gt-brand', id(1))).toEqual([id(2), id(1)]);
    for (let n = 3; n <= CLIENT_IDS_KEPT + 4; n += 1) rememberClientId(store, 'gt-brand', id(n));
    const kept = readClientIds(store, 'gt-brand');
    expect(kept).toHaveLength(CLIENT_IDS_KEPT);
    expect(kept[kept.length - 1]).toBe(id(CLIENT_IDS_KEPT + 4));
    // per deck
    expect(readClientIds(store, 'other')).toEqual([]);
    expect(store.map.has(clientIdsKey('gt-brand'))).toBe(true);
  });

  it('answers an empty list without storage, on a malformed value and when storage throws', () => {
    expect(readClientIds(null, 'gt-brand')).toEqual([]);
    expect(readClientIds(undefined, 'gt-brand')).toEqual([]);
    const bad = storage();
    bad.map.set(clientIdsKey('gt-brand'), '{not json');
    expect(readClientIds(bad, 'gt-brand')).toEqual([]);
    bad.map.set(clientIdsKey('gt-brand'), JSON.stringify([1, '', 'ok']));
    expect(readClientIds(bad, 'gt-brand')).toEqual(['ok']);
    const throwing: IdStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readClientIds(throwing, 'gt-brand')).toEqual([]);
    expect(rememberClientId(throwing, 'gt-brand', id(9))).toEqual([id(9)]);
  });
});

describe('partitionRoster', () => {
  const rows = [
    { clientId: id(1), principalId: 'anon_me', label: 'earlier page of this tab' },
    { clientId: id(2), principalId: 'anon_me', label: 'this page' },
    { clientId: id(3), principalId: 'anon_me', label: 'another tab of the same person' },
    { clientId: id(4), principalId: 'anon_maya', label: 'someone else' },
  ];

  it('puts the current id in self and every id this tab held out of others', () => {
    const { self, others } = partitionRoster(rows, new Set([id(1), id(2)]), id(2));
    expect(self?.label).toBe('this page');
    expect(others.map((row) => row.label)).toEqual([
      'another tab of the same person',
      'someone else',
    ]);
  });

  it('keeps the earlier id out of others before the current id is known, and answers no self then', () => {
    const { self, others } = partitionRoster(rows, new Set([id(1)]), null);
    expect(self).toBeNull();
    expect(others.map((row) => row.clientId)).toEqual([id(2), id(3), id(4)]);
  });

  it('lists a second tab of the same person as one other participant', () => {
    const { others } = partitionRoster(
      rows.filter((row) => row.principalId === 'anon_me'),
      new Set([id(1), id(2)]),
      id(2),
    );
    expect(others).toHaveLength(1);
    expect(others[0]?.clientId).toBe(id(3));
  });
});

describe('the tab’s token (the cycle 3 stream fix round, fix round; VERIFICATION C3S-F2)', () => {
  it('mints one 32 hex token per tab, keeps it in storage across a reload and answers the same one on every read', () => {
    const store = storage();
    const first = tabToken(store);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(store.map.get(TAB_TOKEN_KEY)).toBe(first);
    expect(tabToken(store)).toBe(first);
    // another tab (its own storage) gets its own token
    expect(tabToken(storage())).not.toBe(first);
  });

  it('mints a fresh token without storage, when the stored value is malformed and when storage throws', () => {
    const fixed = (bytes: Uint8Array<ArrayBuffer>): void => {
      bytes.fill(0xab);
    };
    expect(tabToken(null, fixed)).toBe('ab'.repeat(16));
    expect(tabToken(undefined, fixed)).toBe('ab'.repeat(16));
    const bad = storage();
    bad.map.set(TAB_TOKEN_KEY, 'not-a-token');
    expect(tabToken(bad, fixed)).toBe('ab'.repeat(16));
    expect(bad.map.get(TAB_TOKEN_KEY)).toBe('ab'.repeat(16));
    const throwing: IdStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(tabToken(throwing, fixed)).toBe('ab'.repeat(16));
  });
});

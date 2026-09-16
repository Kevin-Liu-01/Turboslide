// The tab's client id memory and the self filter (build-4/hotfix-2.md causes B1 to B3): the ids a
// tab was issued survive in its storage, oldest first and capped, and a roster row with any of
// them is the tab itself, never a collaborator, while another tab of the same person stays one.
import { describe, expect, it } from 'vitest';

import {
  CLIENT_IDS_KEPT,
  clientIdsKey,
  heldClientId,
  idsToRetire,
  opCounterFor,
  opCounterKey,
  partitionRoster,
  readClientIds,
  rememberClientId,
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
    const { self, others } = partitionRoster(
      rows.map((row) => ({ ...row, principalId: `anon_${row.clientId}` })),
      new Set([id(1), id(2)]),
      id(2),
    );
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

  it('reads the person from the self row when the caller knows no principal, so a second tab of the same person is nobody (A3 item 5)', () => {
    const { self, others } = partitionRoster(rows, new Set([id(1), id(2)]), id(2));
    expect(self?.clientId).toBe(id(2));
    expect(others.map((row) => row.label)).toEqual(['someone else']);
    // no current id and no principal: the client id rule alone, as before round five
    const { others: unknown } = partitionRoster(rows, new Set([id(1)]), null);
    expect(unknown.map((row) => row.clientId)).toEqual([id(2), id(3), id(4)]);
  });

  it('keeps every row of the tab’s own principal out of others once the principal is known (A3 item 5)', () => {
    const { self, others } = partitionRoster(rows, new Set([id(2)]), id(2), 'anon_me');
    expect(self?.label).toBe('this page');
    expect(others.map((row) => row.label)).toEqual(['someone else']);
    // the current row stays self even though it is the own principal's
    const alone = partitionRoster(rows.slice(0, 3), new Set([id(2)]), id(2), 'anon_me');
    expect(alone.self?.clientId).toBe(id(2));
    expect(alone.others).toEqual([]);
  });
});

describe('one client id per tab (A3 item 5)', () => {
  it('holds the id the stream issued last and retires every other id it held', () => {
    const store = storage();
    expect(heldClientId(store, 'gt-brand')).toBeNull();
    expect(idsToRetire(store, 'gt-brand', null)).toEqual([]);
    rememberClientId(store, 'gt-brand', id(1));
    expect(heldClientId(store, 'gt-brand')).toBe(id(1));
    // the server kept the id: nothing to retire
    expect(idsToRetire(store, 'gt-brand', id(1))).toEqual([]);
    // the server issued a fresh id: the earlier one rides as retire on the next open
    rememberClientId(store, 'gt-brand', id(2));
    expect(heldClientId(store, 'gt-brand')).toBe(id(2));
    expect(idsToRetire(store, 'gt-brand', id(2))).toEqual([id(1)]);
    expect(heldClientId(null, 'gt-brand')).toBeNull();
  });

  it('keeps the op counter across a reload so a kept id never repeats a counter', () => {
    const store = storage();
    const first = opCounterFor(store, 'gt-brand');
    expect(first.next()).toBe(1);
    expect(first.next()).toBe(2);
    expect(store.map.get(opCounterKey('gt-brand'))).toBe('2');
    // the reloaded page continues where the earlier one stopped
    const second = opCounterFor(store, 'gt-brand');
    expect(second.next()).toBe(3);
    // per deck, and from zero without storage or with a malformed value
    expect(opCounterFor(store, 'other').next()).toBe(1);
    expect(opCounterFor(null, 'gt-brand').next()).toBe(1);
    store.map.set(opCounterKey('gt-brand'), 'nine');
    expect(opCounterFor(store, 'gt-brand').next()).toBe(1);
    const throwing: IdStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const counter = opCounterFor(throwing, 'gt-brand');
    expect(counter.next()).toBe(1);
    expect(counter.next()).toBe(2);
  });
});

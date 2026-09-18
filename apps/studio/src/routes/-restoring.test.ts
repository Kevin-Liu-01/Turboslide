import { describe, expect, it } from 'vitest';

import {
  RESTORING_KEY,
  RESTORING_MAX_AGE_MS,
  RESTORING_TRIES,
  clearRestoringMarker,
  readRestoringMarker,
  restoringStep,
  writeRestoringMarker,
} from './-restoring';
import type { MarkerStorage } from './-restoring';

// The restore marker (docs/FOCUS.md rank 7; build/b7.md R9): the trash page writes it before the
// restore's request, the home page reads it while it is young, asks for the listing again until
// the restored card is listed, and removes it; a stale or malformed marker is removed unread. The
// storage half needs a window and is covered by core/decks.spec.ts's restore rows.

function memory(): MarkerStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('the restore marker', () => {
  it('round trips a young marker and removes a stale one', () => {
    const storage = memory();
    writeRestoringMarker(storage, 'deck-1', 1_000);
    expect(storage.map.get(RESTORING_KEY)).toBe('{"id":"deck-1","at":1000}');
    expect(readRestoringMarker(storage, 1_000 + 500)).toEqual({ id: 'deck-1', at: 1_000 });
    expect(readRestoringMarker(storage, 1_000 + RESTORING_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.map.has(RESTORING_KEY)).toBe(false);
  });

  it('removes a malformed marker unread and answers null without storage', () => {
    const storage = memory();
    storage.setItem(RESTORING_KEY, 'not json');
    expect(readRestoringMarker(storage, 5)).toBeNull();
    expect(storage.map.has(RESTORING_KEY)).toBe(false);
    storage.setItem(RESTORING_KEY, JSON.stringify({ id: 4, at: 'now' }));
    expect(readRestoringMarker(storage, 5)).toBeNull();
    expect(storage.map.has(RESTORING_KEY)).toBe(false);
    expect(readRestoringMarker(null, 5)).toBeNull();
    writeRestoringMarker(null, 'deck-2', 5);
    clearRestoringMarker(null);
  });

  it('asks for the listing again until the card is listed, the marker is stale or the tries are spent', () => {
    const marker = { id: 'deck-1', at: 10_000 };
    expect(restoringStep(marker, ['deck-9'], 0, 11_000)).toBe('again');
    expect(restoringStep(marker, ['deck-9', 'deck-1'], 0, 11_000)).toBe('done');
    expect(restoringStep(marker, ['deck-9'], RESTORING_TRIES, 11_000)).toBe('done');
    expect(restoringStep(marker, ['deck-9'], 0, 10_000 + RESTORING_MAX_AGE_MS + 1)).toBe('done');
  });

  it('clears the marker the trash page wrote when the restore is refused', () => {
    const storage = memory();
    writeRestoringMarker(storage, 'deck-1', 1_000);
    clearRestoringMarker(storage);
    expect(readRestoringMarker(storage, 1_100)).toBeNull();
  });
});

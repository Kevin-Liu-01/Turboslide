import { describe, expect, it } from 'vitest';

import { newestFirst, recentRowsOf, withRecent } from '../dialogs/recent-rows';
import type { DeckHeadRow } from '../editor-shell';

// The Open and Import slides dialogs draw this browser's own decks before the store's listing
// lands and fold them in above it after (docs/POLISH.md item 75; B5's R29 to B1).

function row(id: string, updatedAt: string): DeckHeadRow {
  return { id, title: id, slides: 1, sections: 1, revision: 1, updatedAt, createdAt: updatedAt };
}

describe('the recent rows of the deck dialogs', () => {
  it('draws the mirror newest first before the listing, and nothing when the mirror is empty or absent', () => {
    const mirror = () => [row('a', '2026-09-30T10:00:00Z'), row('b', '2026-09-30T12:00:00Z')];
    expect(recentRowsOf(mirror)?.map((r) => r.id)).toEqual(['b', 'a']);
    expect(recentRowsOf(() => [])).toBeNull();
    expect(recentRowsOf(undefined)).toBeNull();
    expect(
      recentRowsOf(() => {
        throw new Error('no storage');
      }),
    ).toBeNull();
  });

  it('leaves the excepted deck out (Import slides never lists the deck it imports into)', () => {
    const mirror = () => [row('own', '2026-09-30T12:00:00Z'), row('other', '2026-09-30T11:00:00Z')];
    expect(recentRowsOf(mirror, 'own')?.map((r) => r.id)).toEqual(['other']);
    expect(recentRowsOf(() => [row('own', '2026-09-30T12:00:00Z')], 'own')).toBeNull();
  });

  it("folds the mirror's rows the listing does not hold above it and lets the listing's facts win", () => {
    const listed = [
      row('x', '2026-09-30T09:00:00Z'),
      { ...row('a', '2026-09-30T10:30:00Z'), title: 'A listed' },
    ];
    const mirror = () => [row('a', '2026-09-30T10:00:00Z'), row('fresh', '2026-09-30T12:00:00Z')];
    const rows = withRecent(listed, mirror);
    expect(rows.map((r) => r.id)).toEqual(['fresh', 'a', 'x']);
    expect(rows.find((r) => r.id === 'a')?.title).toBe('A listed');
    expect(withRecent(listed, undefined).map((r) => r.id)).toEqual(['a', 'x']);
    expect(withRecent(listed, mirror, 'a').map((r) => r.id)).toEqual(['fresh', 'x']);
  });

  it('sorts newest first', () => {
    expect(
      newestFirst([row('old', '2026-09-01T00:00:00Z'), row('new', '2026-09-30T00:00:00Z')]).map(
        (r) => r.id,
      ),
    ).toEqual(['new', 'old']);
  });
});

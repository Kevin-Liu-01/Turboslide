import { describe, expect, it } from 'vitest';

import {
  RECENT_COOKIE,
  RECENT_MAX,
  encodeRecentCookie,
  parseRecentCookie,
  recentCookieValue,
} from './-recent';
import type { RecentEntry } from './-recent';

// The Recent record's cookie mirror (gslides-parity SPEC-4 0.29; routes/-recent.ts): the compact
// form round trips, the parser takes the newest RECENT_MAX rows and drops malformed ones, the
// Set-Cookie value is scoped to /decks and shrinks to the size cap by dropping the oldest entries.
// The localStorage half needs a window and is covered by home.spec.ts.

function entry(n: number, title = `Deck ${n}`): RecentEntry {
  return {
    id: `deck-${n}`,
    at: new Date(Date.UTC(2026, 8, 14, 0, 0, n)).toISOString(),
    title,
    appearance: n % 2 === 0 ? 'light' : 'dark',
    firstSlide: n % 5 === 0 ? null : `slide-${n}`,
    revision: n,
  };
}

describe('the Recent cookie', () => {
  it('round trips through the compact form, newest first', () => {
    const entries = [entry(3), entry(1), entry(2)];
    const header = `other=1; ${RECENT_COOKIE}=${encodeRecentCookie(entries)}; ts-home=view%3Agrid`;
    expect(parseRecentCookie(header)).toEqual([entry(3), entry(2), entry(1)]);
  });

  it('answers an empty row for no cookie, a foreign cookie and an unreadable one', () => {
    expect(parseRecentCookie(null)).toEqual([]);
    expect(parseRecentCookie('ts-home=view%3Alist')).toEqual([]);
    expect(parseRecentCookie(`${RECENT_COOKIE}=not%20json`)).toEqual([]);
    expect(parseRecentCookie(`${RECENT_COOKIE}=${encodeURIComponent('{"a":1}')}`)).toEqual([]);
  });

  it('drops malformed rows and keeps the newest RECENT_MAX', () => {
    const rows = [
      ['deck-a', '2026-09-14T00:00:00.000Z', 'A', 'd', 'first', 1],
      ['deck-b', '2026-09-14T00:00:01.000Z', 'B', 'x', 'first', 1],
      ['deck-c', '2026-09-14T00:00:02.000Z'],
      'nonsense',
      ['deck-d', '2026-09-14T00:00:03.000Z', 'D', 'l', null, 'seven'],
    ];
    const parsed = parseRecentCookie(
      `${RECENT_COOKIE}=${encodeURIComponent(JSON.stringify(rows))}`,
    );
    expect(parsed.map((row) => row.id)).toEqual(['deck-a']);
    const many = Array.from({ length: RECENT_MAX + 6 }, (_, i) => entry(i + 1));
    const kept = parseRecentCookie(`${RECENT_COOKIE}=${encodeRecentCookie(many)}`);
    expect(kept).toHaveLength(RECENT_MAX);
    expect(kept[0]?.id).toBe(`deck-${RECENT_MAX + 6}`);
  });

  it('writes a cookie scoped to /decks that fits the size cap by dropping the oldest entries', () => {
    const value = recentCookieValue([entry(2), entry(1)]);
    expect(value).toMatch(/^ts-recent=/);
    expect(value).toContain('; Path=/decks;');
    expect(value).toContain('SameSite=Lax');
    /* a title of eighty quotation marks encodes to three bytes a character, so twelve entries
       pass the cap and the oldest leave until the value fits */
    const long = Array.from({ length: RECENT_MAX }, (_, i) => entry(i + 1, '"'.repeat(80)));
    expect(encodeRecentCookie(long).length).toBeGreaterThan(3_000);
    const capped = recentCookieValue(long);
    expect(capped.split(';')[0]!.length).toBeLessThanOrEqual(3_000 + RECENT_COOKIE.length + 1);
    const kept = parseRecentCookie(capped.split(';')[0]);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(RECENT_MAX);
    /* the newest survive */
    expect(kept[0]?.id).toBe(`deck-${RECENT_MAX}`);
  });
});

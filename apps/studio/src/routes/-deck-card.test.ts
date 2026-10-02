import { describe, expect, it } from 'vitest';

import { SITE } from '@turboslide/theme/brand/site';

import { deckCardMeta } from './-deck-card';

// The card a shared deck unfurls as (docs/NEXT.md 4.1.3 item 12; the row decks.og.deck-card): the
// deck's title on og:title and twitter:title, its address on the public origin, one sentence.

describe('deckCardMeta', () => {
  const meta = deckCardMeta({ id: 'q4-review', title: 'Q4 review', slides: 12 });
  const read = (key: string) =>
    meta.find((entry) => entry.property === key || entry.name === key)?.content;

  it("names the deck's title and its address", () => {
    expect(meta[0]).toEqual({ title: 'Q4 review, Turboslide' });
    expect(read('og:title')).toBe('Q4 review');
    expect(read('twitter:title')).toBe('Q4 review');
    expect(read('og:url')).toBe(`${SITE.origin()}/deck/q4-review`);
  });

  it('says what the link opens in one sentence', () => {
    expect(read('og:description')).toBe(
      'A presentation of 12 slides, opened in Turboslide in the browser.',
    );
    expect(read('twitter:description')).toBe(read('og:description'));
    expect(
      deckCardMeta({ id: 'one', title: 'One', slides: 1 }).find(
        (e) => e.property === 'og:description',
      )?.content,
    ).toBe('A presentation of 1 slide, opened in Turboslide in the browser.');
  });

  it('encodes the id in the address', () => {
    const odd = deckCardMeta({ id: 'a b', title: 'A', slides: 2 });
    expect(odd.find((e) => e.property === 'og:url')?.content).toBe(`${SITE.origin()}/deck/a%20b`);
  });
});

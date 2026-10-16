import { describe, expect, it } from 'vitest';

import { SITE } from '@turboslide/theme/brand/site';

import { DECK_CARD_SIZE, deckCardImagePath, deckCardMeta, deckCardPicture } from './-deck-card';

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

// The link card's picture (GF-2.1): the first slide from the render route at 1200 by 675 when a
// stranger holding the link may read the deck (general access open, or the address's publish
// token); every other deck adds no image tag, so the root route's site card stands.

describe('the link card picture', () => {
  const tag = (meta: ReturnType<typeof deckCardMeta>, key: string) =>
    meta.filter((entry) => entry.property === key || entry.name === key);
  const IMAGE_TAGS = [
    'og:image',
    'og:image:type',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
    'twitter:image',
    'twitter:image:alt',
  ];

  it('adds no image tag for a deck a stranger cannot open, so the site card stands', () => {
    for (const picture of [undefined, null]) {
      const meta = deckCardMeta({ id: 'q4-review', title: 'Q4 review', slides: 12, picture });
      for (const key of IMAGE_TAGS)
        expect({ key, tags: tag(meta, key) }).toEqual({ key, tags: [] });
    }
  });

  it('names the first slide on the render route at 1200 by 675 for an open deck', () => {
    const meta = deckCardMeta({
      id: 'q4-review',
      title: 'Q4 review',
      slides: 12,
      picture: { standing: 'open', slideId: 'cover', revision: 31, theme: 'dark' },
    });
    const image = `${SITE.origin()}/api/render/cover?deck=q4-review&theme=dark&w=1200&r=31`;
    expect(tag(meta, 'og:image')).toEqual([{ property: 'og:image', content: image }]);
    expect(tag(meta, 'twitter:image')).toEqual([{ name: 'twitter:image', content: image }]);
    expect(tag(meta, 'og:image:type')[0]?.content).toBe('image/png');
    expect(tag(meta, 'og:image:width')[0]?.content).toBe('1200');
    expect(tag(meta, 'og:image:height')[0]?.content).toBe('675');
    expect(tag(meta, 'og:image:alt')[0]?.content).toBe('The first slide of Q4 review');
    expect(tag(meta, 'twitter:image:alt')[0]?.content).toBe('The first slide of Q4 review');
    // the sheet's 16 by 9, so the render route's downsample lands on the size the tags state
    expect((DECK_CARD_SIZE.width * 900) / 1600).toBe(DECK_CARD_SIZE.height);
  });

  it('carries the publish token only when the token is what opens the deck', () => {
    const token = 'pub_token_0123456789abcdef';
    expect(
      deckCardImagePath('q4-review', {
        standing: 'publish',
        slideId: 'cover',
        revision: 4,
        theme: 'light',
        publishToken: token,
      }),
    ).toBe(`/api/render/cover?deck=q4-review&theme=light&w=1200&r=4&p=${token}`);
    // an open deck reached with a token on the address: the picture needs no token
    expect(
      deckCardImagePath('q4-review', {
        standing: 'open',
        slideId: 'cover',
        revision: 4,
        theme: 'light',
        publishToken: token,
      }),
    ).toBe('/api/render/cover?deck=q4-review&theme=light&w=1200&r=4');
    expect(
      deckCardImagePath('a b', { standing: 'open', slideId: 's 1', revision: 1, theme: 'light' }),
    ).toBe('/api/render/s%201?deck=a%20b&theme=light&w=1200&r=1');
  });

  it("reads the picture from getDeck's answer: the first slide shown, its revision and theme", () => {
    const deck = { revision: 9, slides: [{ id: 'cover' }, { id: 'agenda' }] };
    expect(deckCardPicture({ theme: 'light', deck })).toBeNull();
    expect(
      deckCardPicture({ card: 'open', theme: 'light', deck: { revision: 9, slides: [] } }),
    ).toBeNull();
    expect(deckCardPicture({ card: 'open', theme: 'dark', deck })).toEqual({
      standing: 'open',
      slideId: 'cover',
      revision: 9,
      theme: 'dark',
    });
    expect(
      deckCardPicture({ card: 'publish', theme: 'light', deck }, 'tok_0123456789abcdef'),
    ).toEqual({
      standing: 'publish',
      slideId: 'cover',
      revision: 9,
      theme: 'light',
      publishToken: 'tok_0123456789abcdef',
    });
  });
});

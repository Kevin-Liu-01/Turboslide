import { SITE } from '@turboslide/theme/brand/site';

/**
 * The deck card's picture (GF-2.1): the first slide the link opens, at 1200 by 675 (the sheet's
 * 16 by 9), drawn by the render route. The route serves this width to the card rule alone
 * (server/deck-card.ts), never through the thumbnail grant or a session.
 */
export const DECK_CARD_SIZE = { width: 1200, height: 675 } as const;

/**
 * How a stranger holding only the link reaches the deck (server/deck-card.ts `cardStanding`): its
 * general access is open, or the address carries the publish token. Any other deck keeps the
 * site's card.
 */
export type DeckCardStanding = 'open' | 'publish';

/** What the card's picture names: the first slide shown, the revision, the appearance and the token. */
export type DeckCardPicture = {
  standing: DeckCardStanding;
  slideId: string;
  revision: number;
  theme: 'light' | 'dark';
  /** the address's publish token; the picture's URL carries it only when it is what opens the deck */
  publishToken?: string;
};

/**
 * The card's picture for a viewer payload (`getDeck` with `card: true`): the first slide the page
 * shows, at the payload's revision and appearance, when a stranger holding this address may read
 * the deck; null keeps the site's card. `publishToken` is the address's `p`.
 */
export function deckCardPicture(
  payload: {
    card?: DeckCardStanding;
    theme: 'light' | 'dark';
    deck: { revision: number; slides: readonly { id: string }[] };
  },
  publishToken?: string,
): DeckCardPicture | null {
  const first = payload.deck.slides[0];
  if (payload.card === undefined || first === undefined) return null;
  return {
    standing: payload.card,
    slideId: first.id,
    revision: payload.deck.revision,
    theme: payload.theme,
    ...(publishToken === undefined ? {} : { publishToken }),
  };
}

/**
 * The card picture's path on the render route: the deck, the appearance, the card width and the
 * revision, which names the pixels for the CDN (a new revision is a new URL). The publish token
 * travels only when it is what lets a stranger read the deck, so an open deck's card never carries
 * a token the address happened to hold.
 */
export function deckCardImagePath(deckId: string, picture: DeckCardPicture): string {
  const token =
    picture.standing === 'publish' && picture.publishToken !== undefined
      ? `&p=${encodeURIComponent(picture.publishToken)}`
      : '';
  return `/api/render/${encodeURIComponent(picture.slideId)}?deck=${encodeURIComponent(deckId)}&theme=${picture.theme}&w=${DECK_CARD_SIZE.width}&r=${picture.revision}${token}`;
}

/**
 * The card a shared deck unfurls as (docs/NEXT.md 4.1.3 item 12; audit-brand-surfaces ranks 7 and
 * 8): `og:title` and `twitter:title` are the deck's own title, `og:url` is the deck's address on
 * the deployment's public origin (`SITE.origin()`: TURBOSLIDE_PUBLIC_ORIGIN when the deployment
 * sets it, else www.turboslide.com, the address `og:image` names from the root route), and
 * `og:description` says what the link opens in one sentence. With `picture` (GF-2.1: a stranger
 * holding the link may read the deck) `og:image` and `twitter:image` are the first slide at 1200
 * by 675 from the render route; without it the root route's site card stands, so a restricted,
 * link only or unpublished deck shows nothing of itself in an unfurl. The router keeps the deepest
 * route's tag of each name, so the size, type and alt replace the site card's too. A link with a
 * publish token keeps the robots meta beside these. A module of its own, so the test reads it
 * without the route's server functions; a dash prefixed file under routes/ is not a route (the
 * convention of -edit-search.ts).
 */
export function deckCardMeta(deck: {
  id: string;
  title: string;
  slides: number;
  picture?: DeckCardPicture | null;
}): { title?: string; name?: string; property?: string; content?: string }[] {
  const url = `${SITE.origin()}/deck/${encodeURIComponent(deck.id)}`;
  const description = `A presentation of ${deck.slides} slide${deck.slides === 1 ? '' : 's'}, opened in Turboslide in the browser.`;
  const meta: { title?: string; name?: string; property?: string; content?: string }[] = [
    { title: `${deck.title}, Turboslide` },
    { property: 'og:title', content: deck.title },
    { property: 'og:url', content: url },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: deck.title },
    { name: 'twitter:description', content: description },
  ];
  if (deck.picture === undefined || deck.picture === null) return meta;
  const image = `${SITE.origin()}${deckCardImagePath(deck.id, deck.picture)}`;
  const alt = `The first slide of ${deck.title}`;
  meta.push(
    { property: 'og:image', content: image },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(DECK_CARD_SIZE.width) },
    { property: 'og:image:height', content: String(DECK_CARD_SIZE.height) },
    { property: 'og:image:alt', content: alt },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: alt },
  );
  return meta;
}

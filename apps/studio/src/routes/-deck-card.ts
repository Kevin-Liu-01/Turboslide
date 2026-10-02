import { SITE } from '@turboslide/theme/brand/site';

/**
 * The card a shared deck unfurls as (docs/NEXT.md 4.1.3 item 12; audit-brand-surfaces ranks 7 and
 * 8): `og:title` and `twitter:title` are the deck's own title, `og:url` is the deck's address on
 * the deployment's public origin (`SITE.origin()`: TURBOSLIDE_PUBLIC_ORIGIN when the deployment
 * sets it, else www.turboslide.com, the address `og:image` names from the root route), and
 * `og:description` says what the link opens in one sentence. The root route keeps the card
 * picture; a link with a publish token keeps the robots meta beside these. A module of its own,
 * so the test reads it without the route's server functions; a dash prefixed file under routes/
 * is not a route (the convention of -edit-search.ts).
 */
export function deckCardMeta(deck: {
  id: string;
  title: string;
  slides: number;
}): { title?: string; name?: string; property?: string; content?: string }[] {
  const url = `${SITE.origin()}/deck/${encodeURIComponent(deck.id)}`;
  const description = `A presentation of ${deck.slides} slide${deck.slides === 1 ? '' : 's'}, opened in Turboslide in the browser.`;
  return [
    { title: `${deck.title}, Turboslide` },
    { property: 'og:title', content: deck.title },
    { property: 'og:url', content: url },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: deck.title },
    { name: 'twitter:description', content: description },
  ];
}

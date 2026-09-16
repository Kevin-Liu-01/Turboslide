import { createFileRoute } from '@tanstack/react-router';

import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { readAccess } from '../server/access';
import { IMMUTABLE_CACHE_CONTROL, renderCard } from '../server/thumbs';

// GET /og/deck/:deckId.png (gslides-parity SPEC-5 11 "The per deck card"; SPEC-4 7): the deck's
// first slide contained in the 1200 by 630 card frame on the panel ink, rendered through the
// render worker at 1x in the deck's appearance (server/thumbs.ts `renderCard`, under the renders
// quota the worker applies). Served for decks whose general access is `link` or `open` alone: a
// restricted deck answers a redirect to the site card, so an unfurler never sees a private slide.
// Keyed by the deck revision: `?r=<revision>` matching the current one is immutable for a year
// (the URL changes with the document); without `r`, or with another revision, the current card
// answers with `s-maxage=60`. `/deck/$deckId` sets `og:image` to this route with the revision
// (the integrator's line in routes/deck.$deckId.tsx). The route is a splat because the router's
// file naming reads `$deckId.png` as one parameter name; the tail must end in `.png`.
export const SITE_CARD_PATH = '/og/turboslide.png';
export const CARD_REVALIDATE_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=86400';

/** The deck id of a card path tail (`gt-brand.png`), or null when the tail is not `<slug>.png`. */
export function cardDeckId(tail: string | undefined): string | null {
  const match = /^([^/]+)\.png$/.exec(tail ?? '');
  const id = match?.[1];
  return id !== undefined && SLUG_PATTERN.test(id) ? id : null;
}

export const Route = createFileRoute('/og/deck/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const deckId = cardDeckId(params._splat);
        if (deckId === null)
          return Response.json(
            { error: { message: 'the card path is /og/deck/<deckId>.png', status: 400 } },
            { status: 400 },
          );
        const record = await readAccess(deckId);
        if (record !== null && record.generalAccess.mode === 'restricted')
          return Response.redirect(new URL(SITE_CARD_PATH, request.url), 302);
        try {
          const card = await renderCard(deckId);
          const asked = new URL(request.url).searchParams.get('r');
          const immutable = asked !== null && Number(asked) === card.revision;
          return new Response(card.png, {
            headers: {
              'content-type': 'image/png',
              'content-length': String(card.png.byteLength),
              'cache-control': immutable ? IMMUTABLE_CACHE_CONTROL : CARD_REVALIDATE_CACHE_CONTROL,
              'x-turboslide-revision': String(card.revision),
              'x-turboslide-slide': card.slideId,
              'x-turboslide-cached': card.cached ? '1' : '0',
              'x-content-type-options': 'nosniff',
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status =
            error instanceof RangeError || /no deck|no slide|ENOENT/.test(message) ? 404 : 502;
          return Response.json({ error: { message, status } }, { status });
        }
      },
    },
  },
});

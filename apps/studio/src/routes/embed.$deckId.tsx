import { createFileRoute, notFound } from '@tanstack/react-router';

import { DeckViewer } from '../components/DeckViewer';
import { deckResponseHeaders, deckRobotsMeta, validateDeckSearch } from './deck.$deckId';
import { getDeck } from '../server/decks';
import { publishedPlayerGate } from '../server/published';

// The framed viewer for Prototemplate's /deck iframe (SPEC 3.4, 5.3): the same
// shell as /deck/:deckId with the embed protocol on. The frame writes #NN,
// posts { type: 'gt-deck-slide', n } to its parent on every move and applies
// { type: 'gt-theme', theme } from the page around it (DeckFrame.tsx). ?p=<token> is the
// published embed (gslides-parity SPEC-3 6.4): the token reaches `getDeck`, the answer carries
// noindex, and a revoked token is the 410 page (server/published.ts; hotfix B request R1).
export const Route = createFileRoute('/embed/$deckId')({
  validateSearch: validateDeckSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme, p: search.p }),
  loader: async ({ params, deps }) => {
    const payload = await getDeck({
      data: {
        deckId: params.deckId,
        theme: deps.theme,
        ...(deps.p === undefined ? {} : { publishToken: deps.p }),
      },
    });
    if (!payload) throw notFound();
    return payload;
  },
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ request, params, next }) =>
          (await publishedPlayerGate(request, params.deckId)) ?? next(),
      }),
  },
  headers: ({ match }) => deckResponseHeaders(match.search),
  head: ({ loaderData, match }) => ({
    meta: [
      { title: loaderData ? loaderData.deck.title : 'Turboslide' },
      ...deckRobotsMeta(match.search),
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  return <DeckViewer payload={payload} mode={search.mode} theme={search.theme} embed />;
}

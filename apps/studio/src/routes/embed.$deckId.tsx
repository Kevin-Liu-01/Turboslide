import { createFileRoute } from '@tanstack/react-router';

import { DeckViewer } from '../components/DeckViewer';
import {
  deckResponseHeaders,
  deckRobotsMeta,
  loadDeckView,
  validateDeckSearch,
} from './deck.$deckId';
import { publishedPlayerGate } from '../server/published';

// The framed viewer for Prototemplate's /deck iframe (SPEC 3.4, 5.3): the same
// shell as /deck/:deckId with the embed protocol on. The frame writes #NN,
// posts { type: 'gt-deck-slide', n } to its parent on every move and applies
// { type: 'gt-theme', theme } from the page around it (DeckFrame.tsx). ?p=<token> is the
// published embed (gslides-parity SPEC-3 6.4): the token reaches `getDeck`, the answer carries
// noindex, and a revoked token is the 410 page (server/published.ts; hotfix B request R1). The
// loader is the deck route's (gslides-parity SPEC-4 3.11): the first slide's HTML in the
// document, the rest fetched by the viewer after it mounts, the reads keyed by the revision for
// the CDN (deck.$deckId.tsx says why the rest no longer streams inside the document). A missing
// or restricted deck falls to the root's Not found page: the You need access form belongs to a
// top level document, not to a frame another page embeds.
export const Route = createFileRoute('/embed/$deckId')({
  validateSearch: validateDeckSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme, p: search.p }),
  loader: ({ params, deps }) => loadDeckView(params.deckId, deps),
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
      { title: loaderData ? loaderData.payload.deck.title : 'Turboslide' },
      ...deckRobotsMeta(match.search),
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const { payload, rest } = Route.useLoaderData();
  const search = Route.useSearch();
  return <DeckViewer payload={payload} rest={rest} mode={search.mode} theme={search.theme} embed />;
}

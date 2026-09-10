import { createFileRoute, notFound } from '@tanstack/react-router';

import { DeckViewer } from '../components/DeckViewer';
import { validateDeckSearch } from './deck.$deckId';
import { getDeck } from '../server/decks';

// The framed viewer for Prototemplate's /deck iframe (SPEC 3.4, 5.3): the same
// shell as /deck/:deckId with the embed protocol on. The frame writes #NN,
// posts { type: 'gt-deck-slide', n } to its parent on every move and applies
// { type: 'gt-theme', theme } from the page around it (DeckFrame.tsx).
export const Route = createFileRoute('/embed/$deckId')({
  validateSearch: validateDeckSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme }),
  loader: async ({ params, deps }) => {
    const payload = await getDeck({ data: { deckId: params.deckId, theme: deps.theme } });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? loaderData.deck.title : 'Turboslide' }],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  return <DeckViewer payload={payload} mode={search.mode} theme={search.theme} embed />;
}

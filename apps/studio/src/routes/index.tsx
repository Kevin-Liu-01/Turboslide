import { Link, createFileRoute, redirect } from '@tanstack/react-router';

import { createNewDeck, listDecks } from '../server/decks';

// The root route opens the editor at once, the way Google Slides opens a document (Kevin's
// directive; SPEC 3.4 put the deck list here, it is /decks now). beforeLoad reads every deck's
// manifest facts, newest first by the updatedAt the store rewrites on every write, and redirects
// to /edit/<that deck>; with no deck under decks/ it creates one from the GT brand template
// (deck.create, from gt-brand) and opens that. On the server the redirect is a 307; a client-side
// visit runs the same two server functions and navigates.
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const decks = await listDecks();
    const latest = decks[0];
    const deckId =
      latest === undefined
        ? (await createNewDeck({ name: 'GT brand deck', from: 'gt-brand' })).deckId
        : latest.id;
    throw redirect({ to: '/edit/$deckId', params: { deckId }, replace: true });
  },
  component: Landing,
});

/** Rendered only if the redirect did not happen: a link to the list. */
function Landing() {
  return (
    <main className="ts-home">
      <h1>Turboslide</h1>
      <p>
        Opening the editor. If nothing happens, the <Link to="/decks">deck list</Link> has every
        deck.
      </p>
    </main>
  );
}

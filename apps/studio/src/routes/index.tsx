import { Link, createFileRoute, redirect } from '@tanstack/react-router';

import { createNewDeck, listDecks } from '../server/decks';

// The root route opens the editor at once, the way Google Slides opens a document (Kevin's
// directive; SPEC 3.4 put the deck list here, it is /decks now). beforeLoad reads every deck's
// manifest facts through the store, newest first by the updatedAt the store rewrites on every
// write, and redirects to /edit/<that deck>; with no deck it creates one from the GT brand
// template (deck.create, from gt-brand) and opens that. Hosted, the store's first call
// materializes the bundled seed, so a fresh instance lands on the GT deck. On the server the
// redirect is a 307; a client-side visit runs the same two server functions and navigates. When
// the store itself fails (no seed in the bundle, a Blob store that does not answer) the page
// below names the failure instead of the router's blank error view.
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    let deckId: string;
    try {
      const decks = await listDecks();
      const latest = decks[0];
      deckId =
        latest === undefined
          ? (await createNewDeck({ name: 'GT brand deck', from: 'gt-brand' })).deckId
          : latest.id;
    } catch (error) {
      return { failure: error instanceof Error ? error.message : String(error) };
    }
    throw redirect({ to: '/edit/$deckId', params: { deckId }, replace: true });
  },
  component: Landing,
});

/** Rendered only if the redirect did not happen: the failure, and a link to the list. */
function Landing() {
  const { failure } = Route.useRouteContext();
  return (
    <main className="ts-home">
      <h1>Turboslide</h1>
      {failure ? (
        <>
          <p>The studio could not open a deck: {failure}</p>
          <p>
            A hosted studio needs its seed decks in the build and, for edits that persist, a Blob
            store connected to the project (docs/hosting.md). The <Link to="/decks">deck list</Link>{' '}
            shows what this instance holds.
          </p>
        </>
      ) : (
        <p>
          Opening the editor. If nothing happens, the <Link to="/decks">deck list</Link> has every
          deck.
        </p>
      )}
    </main>
  );
}

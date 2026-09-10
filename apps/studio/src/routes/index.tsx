import { Link, createFileRoute } from '@tanstack/react-router';

import { GtMark } from '@turboslide/chrome/GtMark';

import { listDecks } from '../server/decks';
import { getServerHealth } from '../server/health';

// The deck list (SPEC 3.4: `/` is the deck list, SSR), reading decks/*. It
// also calls the health server function so every build exercises the
// server-only marker that scripts/check-client-bundle.mjs looks for
// (AGENTS.md, contracts between builders).
export const Route = createFileRoute('/')({
  loader: async () => {
    const [decks, health] = await Promise.all([listDecks(), getServerHealth()]);
    return { decks, health };
  },
  component: Home,
});

function Home() {
  const { decks, health } = Route.useLoaderData();
  return (
    <main className="ts-home">
      <header className="ts-home-head">
        <GtMark width={38} height={24} />
        <h1>Turboslide</h1>
        <p>
          A block document with a validator and a grammar linter. Every deck under decks/ is listed
          here; open one in the viewer, or read /api/agent, /openapi.json and /llms.txt.
        </p>
      </header>
      {decks.length === 0 ? (
        <p className="ts-home-empty">
          No decks yet. Run <code>turboslide import</code> or add a folder under decks/ with a
          deck.json.
        </p>
      ) : (
        <ul className="ts-decks">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link to="/deck/$deckId" params={{ deckId: deck.id }} className="ts-deck-row">
                <b>{deck.title}</b>
                <span className="ts-deck-id">{deck.id}</span>
                <span className="ts-deck-meta">
                  {deck.slides} slides in {deck.sections} sections, r{deck.revision}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <footer className="ts-home-foot">
        Node {health.node}. The sheet is {health.sheet[0]} by {health.sheet[1]}.
      </footer>
    </main>
  );
}

import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';

import type { ShellMode } from '@turboslide/chrome/shell-data';
import type { Theme } from '@turboslide/viewer/theme';

import { DeckViewer } from '../components/DeckViewer';
import { getDeck } from '../server/decks';

// The viewer (SPEC 3.4, 6.1): slide, grid, book and present modes; the theme;
// the keys; #NN and #s/<slideId> hashes; the sidebar tree, the toolbar, the
// hover preview layer. Search params carry view state so links reproduce a
// view: ?mode=slide|grid|book and ?theme=light|dark. No editing in M1. ?present=1 opens the deck
// in present mode (chrome hidden), the address the editor's Presentation entry and the deck
// list's Present links open (docs/deck-transfer.md, the GT template presentation).
export type DeckSearch = { mode?: ShellMode; theme?: Theme; present?: 1 };

function isMode(value: unknown): value is ShellMode {
  return value === 'slide' || value === 'grid' || value === 'book';
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function validateDeckSearch(search: Record<string, unknown>): DeckSearch {
  const out: DeckSearch = {};
  if (isMode(search.mode)) out.mode = search.mode;
  if (isTheme(search.theme)) out.theme = search.theme;
  if (search.present === 1 || search.present === '1' || search.present === true) out.present = 1;
  return out;
}

export const Route = createFileRoute('/deck/$deckId')({
  validateSearch: validateDeckSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme }),
  loader: async ({ params, deps }) => {
    const payload = await getDeck({ data: { deckId: params.deckId, theme: deps.theme } });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.deck.title}, Turboslide` : 'Turboslide' }],
  }),
  component: DeckPage,
  notFoundComponent: DeckMissing,
});

function DeckPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onModeChange = (mode: ShellMode) => {
    void navigate({
      search: (prev) => ({ ...prev, mode: mode === 'slide' ? undefined : mode }),
      hash: true,
      replace: true,
    });
  };
  return (
    <DeckViewer
      payload={payload}
      mode={search.mode}
      theme={search.theme}
      present={search.present === 1}
      onModeChange={onModeChange}
    />
  );
}

function DeckMissing() {
  const { deckId } = Route.useParams();
  return (
    <main className="ts-home">
      <h1>No deck named {deckId}</h1>
      <p>
        This studio holds no deck at decks/{deckId}, and no decks/fixture to stand in for it. The
        list at /decks has every deck it serves.
      </p>
    </main>
  );
}

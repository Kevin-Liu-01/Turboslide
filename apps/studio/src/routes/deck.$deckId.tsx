import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';

import { REFUSALS } from '@turboslide/chrome/menus/strings';
import type { ShellMode } from '@turboslide/chrome/shell-data';
import type { Theme } from '@turboslide/viewer/theme';

import { DeckViewer } from '../components/DeckViewer';
import { getDeck } from '../server/decks';
import { publishedPlayerGate } from '../server/published';

// The viewer (SPEC 3.4, 6.1): slide, grid, book and present modes; the theme;
// the keys; #NN and #s/<slideId> hashes; the sidebar tree, the toolbar, the
// hover preview layer. Search params carry view state so links reproduce a
// view: ?mode=slide|grid|book and ?theme=light|dark. No editing in M1. ?present=1 opens the deck
// in present mode (chrome hidden), the address the editor's Presentation entry and the deck
// list's Present links open (docs/deck-transfer.md, the GT template presentation). ?p=<token> is
// the published player (gslides-parity SPEC-3 6.4): every response reached through the token
// carries `X-Robots-Tag: noindex` and the robots meta (VERIFICATION-3 finding 48), the loader
// passes the token to `getDeck` so the record decides the read, and the route's server GET gate
// answers 410 with "This presentation is no longer published" once the deck is unpublished
// (server/published.ts; hotfix B request R1).
export type DeckSearch = { mode?: ShellMode; theme?: Theme; present?: 1; p?: string };

/** The published token's grammar, the one `getDeck` validates (`publishToken`). */
const PUBLISH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

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
  if (typeof search.p === 'string' && PUBLISH_TOKEN_PATTERN.test(search.p)) out.p = search.p;
  return out;
}

/** The player's header (SPEC-3 6.4): set on the server's answer when the address carries the token. */
export function deckResponseHeaders(search: DeckSearch): Record<string, string> | undefined {
  return search.p === undefined ? undefined : { 'x-robots-tag': 'noindex' };
}

/** The robots meta beside the title when the address carries the token (SPEC-3 6.4). */
export function deckRobotsMeta(search: DeckSearch): { name: string; content: string }[] {
  return search.p === undefined ? [] : [{ name: 'robots', content: 'noindex' }];
}

/**
 * Whether a loader error is the 410 of a revoked publish token (`getDeck` throws `DeniedError`
 * with the body `{ error: 'gone' }`; over the wire the client reads the serialized message).
 */
export function isNoLongerPublished(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { status?: unknown }).status === 410) return true;
  return /"error":"gone"/.test(error.message);
}

export const Route = createFileRoute('/deck/$deckId')({
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
    // the 410 of a revoked publish token before the document renders (SPEC-3 6.4); every other
    // request goes on to the loader
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ request, params, next }) =>
          (await publishedPlayerGate(request, params.deckId)) ?? next(),
      }),
  },
  headers: ({ match }) => deckResponseHeaders(match.search),
  head: ({ loaderData, match }) => ({
    meta: [
      { title: loaderData ? `${loaderData.deck.title}, Turboslide` : 'Turboslide' },
      ...deckRobotsMeta(match.search),
    ],
  }),
  component: DeckPage,
  notFoundComponent: DeckMissing,
  errorComponent: DeckRefused,
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

/** The loader's refusal on a client side navigation: the unpublished player, or the plain error. */
function DeckRefused({ error }: { error: unknown }) {
  const gone = isNoLongerPublished(error);
  return (
    <main className="ts-home ts-access-page">
      <h1>{gone ? REFUSALS.noLongerPublished : 'This presentation could not be opened'}</h1>
      {gone ? null : <p>{error instanceof Error ? error.message : String(error)}</p>}
    </main>
  );
}

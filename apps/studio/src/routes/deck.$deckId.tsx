import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';

import { REFUSALS } from '@turboslide/chrome/menus/strings';
import type { ShellMode } from '@turboslide/chrome/shell-data';
import type { Theme } from '@turboslide/viewer/theme';

import { DeckViewer } from '../components/DeckViewer';
import { deckRevision, getDeck } from '../server/decks';
import type { DeckPayload, GetDeckInput } from '../server/decks';
import { publishedPlayerGate } from '../server/published';
import { AccessPage } from './-access-page';

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
//
// Round four (gslides-parity SPEC-4 3.11; PP 6, 5 "The Blob read path"): the document carries the
// first slide's HTML alone. The loader reads the revision first (`deckRevision`), asks `getDeck`
// for the payload with the first slide's markup (`slides: 'first'`) and returns the request for
// the other slides as `rest`, the input DeckViewer hands to `getDeckSlides` once it has mounted,
// so the sidebar's clones and the grid fill in a moment after first paint while the document is
// one slide long (85 slides were 381 KB of HTML and 6,470 nodes to hydrate). Both reads are GET
// server functions whose URL names the deck, the theme and the revision, so a client's request is
// a CDN key: the answer carries `public, s-maxage=60, stale-while-revalidate=3600` when the
// reader reached the deck as anyone would and the shape is the public one (server/decks.ts
// setDeckCacheHeader), else `private, no-store`. The revision is learned inside the loader
// rather than through `loaderDeps`, which the router derives from the search alone.
// `notFoundComponent` is the You need access page (VERIFICATION-3 finding 53; ruling 3):
// `getDeck` answers null for a missing and a restricted deck alike and the server's status is 404.
//
// The round four fixer (VERIFICATION-4 finding 6): the first build returned `getDeckSlides`
// unawaited and the router streamed the answer behind the shell as one document, which made
// /deck/gt-brand 481 KB (275 KB of encoded slide markup after the shell) and slower than the
// whole deck on both deployments (production LCP 808 ms against 400 at day 0, ready 1,067 against
// 560), because the browser waits for the document's end before `load` and the CDN cannot keep a
// streamed document. The request now travels as data and the viewer fetches it after hydration
// through the cacheable GET, so the document is the shell and one slide, and the CDN serves the
// other slides from its cache for a minute (stale for an hour) under the revision's URL.
export type DeckSearch = { mode?: ShellMode; theme?: Theme; present?: 1; p?: string };

/** What the two viewer routes' loaders return: the document's payload and the request for the rest. */
export type DeckLoaderData = {
  payload: DeckPayload;
  /**
   * the input DeckViewer hands to `getDeckSlides` after it mounts, for the other slides' HTML;
   * null when the payload carries every slide
   */
  rest: GetDeckInput | null;
};

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

/**
 * The loader of /deck and /embed (SPEC-4 3.11): the revision, the first slide's payload, and the
 * request for the rest, which the viewer sends after it mounts (the module comment). Shared by
 * the two routes so they read the store the same way.
 */
export async function loadDeckView(
  deckId: string,
  deps: { theme?: Theme; p?: string },
): Promise<DeckLoaderData> {
  const head = await deckRevision({ data: { deckId } });
  if (!head) throw notFound();
  const input: GetDeckInput = {
    deckId,
    ...(deps.theme === undefined ? {} : { theme: deps.theme }),
    revision: head.revision,
    ...(deps.p === undefined ? {} : { publishToken: deps.p }),
  };
  const payload = await getDeck({ data: { ...input, slides: 'first' } });
  if (!payload) throw notFound();
  // the other slides are not read here: the viewer asks `getDeckSlides` for them once it has
  // mounted, through the CDN cacheable GET (VERIFICATION-4 finding 6)
  return { payload, rest: payload.partial === true ? input : null };
}

export const Route = createFileRoute('/deck/$deckId')({
  validateSearch: validateDeckSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme, p: search.p }),
  loader: ({ params, deps }) => loadDeckView(params.deckId, deps),
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
      { title: loaderData ? `${loaderData.payload.deck.title}, Turboslide` : 'Turboslide' },
      ...deckRobotsMeta(match.search),
    ],
  }),
  component: DeckPage,
  notFoundComponent: DeckMissing,
  errorComponent: DeckRefused,
});

function DeckPage() {
  const { payload, rest } = Route.useLoaderData();
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
      rest={rest}
      mode={search.mode}
      theme={search.theme}
      present={search.present === 1}
      onModeChange={onModeChange}
    />
  );
}

function DeckMissing() {
  const { deckId } = Route.useParams();
  return <AccessPage deckId={deckId} />;
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

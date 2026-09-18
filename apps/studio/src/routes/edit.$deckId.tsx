import { useMemo } from 'react';

import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

import { authorLabel } from '@turboslide/store/store';

import { EditorSkeleton } from '../components/EditorSkeleton';
import { EditorRoot, authorOfIdentity } from '../editor/EditorRoot';
import { readEditorDeck } from '../server/write';
import { AccessPage } from './-access-page';
import { validateEditSearch } from './-edit-search';
import { REFUSED_PAGE, RouteRefused } from './-refused-page';
import type { EditSearch } from './-edit-search';

/**
 * The editor route, /edit/:deckId (SPEC 3.4, 6; MILESTONES M3; gslides-parity SPEC 6.1). The route
 * holds its options alone: the loader (readEditorDeck), the search params of ./-edit-search.ts,
 * the skeleton at 0 ms (SPEC-3 9.2 E1) and the You need access page. The editor itself is
 * EditorRoot of ../editor/EditorRoot.tsx over the controller of ../editor/controller.tsx and the
 * shell glue of ../editor/shell-bridge.tsx (gslides-parity SPEC-4 0.44; PP 7 row 1, the round
 * four split): the component is the only reader of that module, so the router's code splitting
 * keeps the editor's graph out of the entry the route tree imports and /decks, /deck and /home
 * stop preloading it. The editor's own CSS travels with EditorRoot since the round four day 2
 * change, so a document that never opens the editor never loads it.
 *
 * `ssr: 'data-only'` (SPEC-4 0.34; PP 3.5 items 1 and 2): the loader runs on the server and its
 * payload rides the document as the dehydrated loader data, the server renders the skeleton in
 * the route's place, and the client renders the editor without a `readEditorDeck` round trip
 * after its JavaScript arrives. The route is `noindex` (routes/__root.tsx NOINDEX_ROUTES) because
 * the dehydrated document is in the HTML. `pendingMinMs: 0` beside `pendingMs: 0`: the router's
 * default of 500 ms would hold the skeleton half a second after the editor is ready, and the
 * default `pendingMs` of 1,000 ms would show the old page for a second on a same document link.
 * The version log leaves the payload (server/write.ts `readEditorDeck`: the newest 50 entries
 * without their mutations and the count; the Version history panel loads the rest).
 *
 * `notFoundComponent` is the You need access page (VERIFICATION-3 finding 53; the round four
 * ruling 3): `readEditorDeck` answers null for a missing deck and for a deck the caller may not
 * read, the loader throws `notFound()` and the server answers 404 with that page.
 *
 * `shouldReload: false` and `errorComponent` (the focus round, cycle 3 fix round; VERIFICATION
 * C3-F3): the loader runs when the route is entered and when the router invalidates it, never on
 * a navigation to the address the editor already stands on. Without the option a same address
 * navigation (`onSearch` with a View > Mode row picked while it is the mode, or a search key
 * cleared that was already absent; the router's `forceStaleReload` on an unchanged href) ran
 * `readEditorDeck` again in the background, and when the store refused it (the 429 of C3-F2) the
 * match's status turned to `error`, the router threw the store's sentence from the match's render
 * and, with no `errorComponent` here or on the root, the global boundary replaced the editor with
 * the library's page "Something went wrong!" for the rest of the text walk (22 rows). The /new
 * route set the same option in round three (finding 51); `staleTime` alone does not close the
 * window on this router (routes/-edit-reload.test.ts measures both). A loader that still refuses
 * (the first open, `router.invalidate()`) and a component that throws while it stands draw
 * EditRefused, the product's page of ./-refused-page.tsx with Reload and Your Presentations, so
 * the editor never falls through to the router's words again. The editor's own document stays
 * the room stream's (SPEC-3 3.3) once it stands; a rerun of the loader is a round trip nothing
 * reads, the reading the /new route recorded.
 */

export const Route = createFileRoute('/edit/$deckId')({
  ssr: 'data-only',
  validateSearch: validateEditSearch,
  loader: async ({ params }) => {
    const payload = await readEditorDeck({ deckId: params.deckId });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.document.deck.title}, editor, Turboslide` : 'Turboslide',
      },
    ],
  }),
  component: EditPage,
  // the editor skeleton at 0 ms while the loader runs, in the server's HTML under 'data-only'
  // (gslides-parity SPEC-3 9.2 E1; SPEC-4 0.34): the shell's fixed boxes paint before the document
  pendingComponent: EditorSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
  // the loader runs on entry and on invalidation, never on a same address navigation (C3-F3;
  // the /new route's finding 51)
  shouldReload: false,
  notFoundComponent: EditMissing,
  errorComponent: EditRefused,
});

function EditMissing() {
  const { deckId } = Route.useParams();
  return <AccessPage deckId={deckId} />;
}

/**
 * The route's refusal (C3-F3): a loader that threw on the way in could not open the
 * presentation; a component that threw while the editor stood has stopped. Reload runs the
 * loader again in place (`router.invalidate()` in RouteRefused).
 */
function EditRefused({ error }: ErrorComponentProps) {
  return (
    <RouteRefused
      error={error}
      loaderHeading={REFUSED_PAGE.notOpened}
      renderHeading={REFUSED_PAGE.editorStopped}
    />
  );
}

function EditPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const author = useMemo(() => authorOfIdentity(payload.identity), [payload.identity]);
  const onSearch = (patch: Partial<EditSearch>) => {
    void navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        return next;
      },
      hash: true,
      replace: true,
    });
  };
  const onDeckCreated = (deckId: string) => {
    void navigate({ to: '/edit/$deckId', params: { deckId } });
  };
  return (
    <EditorRoot
      key={`${payload.deckId}:${authorLabel(author)}`}
      payload={payload}
      search={search}
      author={author}
      onSearch={onSearch}
      onDeckCreated={onDeckCreated}
    />
  );
}

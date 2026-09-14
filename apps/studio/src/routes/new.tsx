import { useMemo, useState } from 'react';

import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { parseAuthor } from '@turboslide/schema/mutations';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';

import { EditorSkeleton } from '../components/EditorSkeleton';
import { useMountEffect } from '../components/useMountEffect';
import { EditorRoot } from '../editor/EditorRoot';
import { DECK_CREATED_EVENT, readDraftDeck } from '../server/write';
import type { DeckCreatedDetail } from '../server/write';
import { validateEditSearch } from './-edit-search';
import type { EditSearch } from './-edit-search';

/**
 * The fresh presentation, /new (gslides-parity SPEC 6.1; MILESTONES B5 item 1): the editor on a
 * draft built from the blank template, titled "Untitled presentation", one Title slide with empty
 * heading and lead, the theme starter pictures as assets, under a draft id the store has not
 * seen. Nothing is written by a visit: the loader's `readDraftDeck` reads the template, and the
 * first write from the editor creates the deck through `createStoredDeck` (server/write.ts) and
 * applies the edit against revision 0. When that write lands the page raises `DECK_CREATED_EVENT`
 * and this route moves the address to /edit/<id>, so a reload lands on the saved deck while the
 * editor keeps its state. A reload of /new before any write shows a fresh draft again; two tabs
 * on /new create two decks. The route is `noindex` (routes/__root.tsx).
 *
 * The address moves through the browser's own `History.prototype.replaceState`, not the router
 * (gslides-parity SPEC-2 8.6, 0.29; VERIFICATION finding 4): `@tanstack/history` replaces
 * `window.history.replaceState` with a wrapper that tells the router about every call, so a
 * `history.replaceState` here made the router match `/edit/$deckId`, mount that route's page in
 * place of this one and start a second editor with an empty history, which is why the first
 * write from /new could not be undone. The native call changes the address bar alone: the same
 * `EditorRoot` and the same `createEditHistory()` stay mounted, the first commit's entry is in
 * the history before `createStoredDeck` runs and stays there when the address moves, and Cmd+Z
 * restores the empty heading. The router's own location stays /new for this page's life, which
 * is why a view toggle after the save updates the search on this route and pins the address again
 * rather than navigating to the edit route (a remount would lose the history the same way).
 *
 * Round four (gslides-parity SPEC-4 0.34, 0.42; PP 3.5, 6): `ssr: 'data-only'` runs the loader
 * on the server, so the draft rides the document as dehydrated loader data and the server
 * renders the skeleton where the editor will stand; the client renders the editor without a
 * `readDraftDeck` round trip. `pendingMinMs: 0` beside `pendingMs: 0`, because the router's
 * default of 500 ms would hold the skeleton after the editor is ready. `shouldReload: false`
 * closes the window VERIFICATION-3 finding 51 measured: the loader ran again on every search
 * change of this route (a Mode or View toggle after the first save; `staleTime` 0 reloads a
 * successful match on every navigation to it), and a run whose answer arrives while the editor
 * stands is a round trip nothing reads (`holdDraft` already made it answer the same draft); with
 * `shouldReload: false` the loader runs when the route is entered and when the router
 * invalidates it, never on a search change, so no pending state and no skeleton can appear
 * beside the live editor, and a return to /new after leaving it is a new match and a fresh draft.
 * `holdDraft` stays as the second belt. A `/new` document that Chrome prerenders from /home's
 * speculation rules (0.42) runs its loader and renders, but the editor's session attach and the
 * room stream wait for `prerenderingchange` (editor/EditorRoot.tsx, editor/shell-bridge.tsx).
 *
 * The editor itself is `EditorRoot` of ../editor/EditorRoot.tsx, imported here and read by the
 * component alone (gslides-parity SPEC-4 0.44; PP 7 row 1): the router's code splitting moves
 * the component and that import into this route's lazy chunk, so the editor's graph leaves the
 * entry every route loads. Before the round four split this file imported the edit route as a
 * namespace at module level, which kept the whole editor in the entry.
 */

/** The author of a browser session when ?author= is absent (editor/EditorRoot.tsx DEFAULT_AUTHOR). */
const DEFAULT_AUTHOR = 'studio';

export const Route = createFileRoute('/new')({
  ssr: 'data-only',
  validateSearch: validateEditSearch,
  // first paint carries the editor's rows and columns while the loader answers (SPEC-3 9.2 E1);
  // under 'data-only' the skeleton is the server's markup for the route (SPEC-4 0.34)
  pendingComponent: EditorSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
  // the loader runs on entry and on invalidation, never on a search change (finding 51)
  shouldReload: false,
  loader: () => readDraftDeck(),
  head: () => ({ meta: [{ title: `${TITLE_ROW.untitled}, Turboslide` }] }),
  component: NewPage,
});

/** The address of the saved deck, keeping the search and hash the draft carried. */
function editAddress(deckId: string): string {
  return `/edit/${encodeURIComponent(deckId)}${window.location.search}${window.location.hash}`;
}

/**
 * Moves the address bar to the saved deck without telling the router (the module comment): the
 * prototype's method is the browser's, the instance's own property is the router's wrapper. The
 * router's history state travels along so Back still works.
 */
function pinAddress(deckId: string): void {
  History.prototype.replaceState.call(
    window.history,
    window.history.state,
    '',
    editAddress(deckId),
  );
}

function NewPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const author = useMemo(() => parseAuthor(search.author ?? DEFAULT_AUTHOR), [search.author]);
  /* the draft's id once its first write has created the deck; null while it is a draft */
  const [savedId, setSavedId] = useState<string | null>(null);

  useMountEffect(() => {
    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent<DeckCreatedDetail>).detail;
      if (detail.deckId !== payload.deckId) return;
      setSavedId(detail.deckId);
      // the same document, saved: the address follows without a reload (SPEC 6.1) and without a
      // route change, so the editor and its undo history stay (SPEC-2 8.6)
      pinAddress(detail.deckId);
    };
    window.addEventListener(DECK_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(DECK_CREATED_EVENT, onCreated);
  });

  const onSearch = (patch: Partial<EditSearch>) => {
    const next = (prev: Record<string, unknown>): Record<string, unknown> => {
      const merged: Record<string, unknown> = { ...prev, ...patch };
      for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
      return merged;
    };
    if (savedId !== null) {
      // the address already names the saved deck: the search changes on this route (the router
      // still stands on /new) and the address is pinned to /edit/<id> again afterwards, so the
      // editor is not remounted and its history stays (the module comment)
      void navigate({ search: next, hash: true, replace: true }).then(() => pinAddress(savedId));
      return;
    }
    void navigate({ search: next, hash: true, replace: true });
  };
  const onDeckCreated = (deckId: string) => {
    void navigate({ to: '/edit/$deckId', params: { deckId } });
  };

  return (
    <EditorRoot
      key={payload.deckId}
      payload={payload}
      search={search}
      author={author}
      onSearch={onSearch}
      onDeckCreated={onDeckCreated}
    />
  );
}

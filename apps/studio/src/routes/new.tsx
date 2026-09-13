import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';

import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

import { parseAuthor } from '@turboslide/schema/mutations';
import type { Author } from '@turboslide/schema/mutations';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';

import { useMountEffect } from '../components/useMountEffect';
import { DECK_CREATED_EVENT, readDraftDeck } from '../server/write';
import type { DeckCreatedDetail, EditorDeck } from '../server/write';
import * as editRoute from './edit.$deckId';
import { validateEditSearch } from './edit.$deckId';
import type { EditSearch } from './edit.$deckId';

/**
 * The fresh presentation, /new (gslides-parity SPEC 6.1; MILESTONES B5 item 1): the editor on a
 * draft built from the blank template, titled "Untitled presentation", one Title slide with empty
 * heading and lead, the theme starter pictures as assets, under a draft id the store has not
 * seen. Nothing is written by a visit: the loader's `readDraftDeck` reads the template, and the
 * first write from the editor creates the deck through `createStoredDeck` (server/write.ts) and
 * applies the edit against revision 0. When that write lands the page raises `DECK_CREATED_EVENT`
 * and this route moves the address to /edit/<id>, so a reload lands on the saved deck while the
 * editor keeps its state. A reload of /new before any write shows a fresh draft again; two tabs
 * on /new create two decks. The route is `ssr: false` like /edit and is `noindex`
 * (routes/__root.tsx).
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
 * The editor itself is `EditorRoot` of edit.$deckId.tsx (the integrator's file). Until that
 * module exports it, the namespace read below is undefined and the page says so instead of
 * failing the tree's typecheck; the request to export it, with the draft behaviours the editor
 * owns (the "Not saved yet" title row, the auto-title mutation of SPEC 6.3 in `commit`), is in
 * docs/gslides-parity/build/b5.md. Once exported, this file imports it directly.
 */

/** The author of a browser session when ?author= is absent (edit.$deckId.tsx DEFAULT_AUTHOR). */
const DEFAULT_AUTHOR = 'studio';

type DraftEditorProps = {
  payload: EditorDeck;
  search: EditSearch;
  author: Author;
  onSearch: (patch: Partial<EditSearch>) => void;
  onDeckCreated: (deckId: string) => void;
};

/* the editor component, when the edit route exports it (see the module comment) */
const EditorRoot: ComponentType<DraftEditorProps> | undefined = (
  editRoute as { EditorRoot?: ComponentType<DraftEditorProps> }
).EditorRoot;

export const Route = createFileRoute('/new')({
  ssr: false,
  validateSearch: validateEditSearch,
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

  if (EditorRoot === undefined) return <DraftPending payload={payload} />;
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

/** Shown while the editor module does not export its root yet (the module comment). */
function DraftPending({ payload }: { payload: EditorDeck }) {
  return (
    <main className="ts-home" data-draft={payload.deckId}>
      <h1>{payload.document.deck.title}</h1>
      <p>
        The editor is not attached to this page yet. Open{' '}
        <Link to="/decks">your presentations</Link> to edit an existing one.
      </p>
    </main>
  );
}

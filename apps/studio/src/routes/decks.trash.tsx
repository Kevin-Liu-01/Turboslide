import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { DeleteForeverDialog } from '@turboslide/chrome/dialogs/DeleteForever';
import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import { Icon } from '@turboslide/chrome/icons';
import { HOME } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../components/useMountEffect';
import { listTrashedDecks, removeStoredDeck, restoreStoredDeck } from '../server/decks';
import { clearRestoringMarker, sessionMarkerStorage, writeRestoringMarker } from './-restoring';
import type { DeckCard, TrashListing } from '../server/decks';
import { DECKS_PAGE, Thumb, openFactsOf, shortDate, useStreamedList } from './decks.index';
import { RouterLinkSlot } from './-link-slot';
import {
  browserTrashIds,
  browserTrashIdsOfCookies,
  forgetDeckOpened,
  forgetDeckTrashed,
  forgetTrashedMarker,
  recordDeckOpened,
} from './-recent';

import './decks.css';

/**
 * The trash, /decks/trash (gslides-parity SPEC 6.4; MILESTONES B5 item 2): the decks whose
 * manifest carries `trashedAt`, newest stamp first, each with Restore (`deck.restore`) and Delete
 * forever (`deck.remove`, after "Delete <title> forever? This cannot be undone"), and an Empty
 * trash button that asks once and runs `deck.remove` per deck. Nothing here runs on a schedule:
 * a trashed deck stays until someone clicks Delete forever (SPEC 0.24). The reads and writes go
 * through the store's collection (server/decks.ts), so the Blob backend deletes the prefix and
 * the file backend the folder. The page is `noindex` (routes/__root.tsx) and announces hydration
 * like the home page.
 *
 * Round four (gslides-parity SPEC-4 0.29, 0.32; PP 3.1, 3.3): the shell streams before the list
 * (the loader returns the listing as an unawaited promise and the cards render under `<Await>`
 * with the grid's frames as the stand in), and Restore and Delete forever take the optimistic
 * path Move to trash takes on /decks: the confirmed cards leave the rendered list at the click
 * through local state over the loader's cards, `router.invalidate()` runs without being awaited,
 * and a refused removal (a stale revision, a right the caller lacks, a store that fails) brings
 * the card back with the error sentence in the snackbar. Before this round the page awaited the
 * invalidation under a busy state, which was the list call's 1 to 8 s (R04 section 8).
 *
 * The product round (docs/archive/rounds/PRODUCT.md 3.3, 3.6; audit-interface 21, 29): the confirm is the chrome's
 * one Dialog (DeleteForeverDialog: the 18 px title, the lead "This cannot be undone.", Delete
 * forever focused), the card's Restore and Delete forever are 32 px with Delete forever in ink and
 * its glyph, and Empty trash is the page's one solid button, since it is the page's act.
 *
 * The Round 1 follow-up (lane C item 5): /decks draws ruled rows on the page grammar since Round 1
 * (decks.index.tsx DeckRowView), and this page, one click away, still drew boxed cards with framed
 * buttons. It now stands on the same grammar (the rails, the 58 px bar with a seam, the column)
 * and lists the trashed decks in the same ruled rows: the 64 by 36 framed thumbnail and the title,
 * the trashed date, the slide count, then Restore and Delete forever as 32 px text buttons. The
 * data-control ids stay (`trash.card.<id>` is the row), so every reader of the page reads it.
 */
export const Route = createFileRoute('/decks/trash')({
  loader: () => ({ decks: loadTrash() }),
  head: () => ({ meta: [{ title: `${HOME.trash}, Turboslide` }] }),
  component: TrashPage,
});

/**
 * This browser's ids for the trash listing on the server's first render: the document request
 * carries the trash and Recent cookie mirrors (Path=/decks), which a server function call from
 * the page does not, so the page sends the ids it reads from its own storage instead.
 */
const readTrashCookies = createServerFn({ method: 'GET' }).handler((): string[] => {
  try {
    return browserTrashIdsOfCookies(getRequest().headers.get('cookie'));
  } catch {
    return [];
  }
});

/**
 * The listing in the scope /decks takes (server/decks.ts listTrashedDecks; the Round 1 fix round,
 * VERIFICATION.md "Round 1, pass 1" finding 4): a signed in person's or the admin's trash from the
 * store, an anonymous visitor's from this browser's ids. The ids come from the cookies on the
 * server and from localStorage and sessionStorage in the page.
 */
async function loadTrash(): Promise<TrashListing> {
  const deckIds = typeof window === 'undefined' ? await readTrashCookies() : browserTrashIds();
  return listTrashedDecks({ data: { deckIds } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Confirm = { kind: 'one'; card: DeckCard } | { kind: 'all'; cards: ReadonlyArray<DeckCard> };

/** The empty trash (SPEC-4 1.10): the figure, the title, one sentence, no action. */
export const TRASH_EMPTY = {
  title: HOME.trashEmpty,
  sentence:
    'Presentations moved to the trash appear here until they are restored or deleted forever.',
} as const;

function TrashPage() {
  const { decks } = Route.useLoaderData();
  const router = useRouter();
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [mounted, setMounted] = useState(false);
  /* the cards a click has taken out of the list, before the loader confirms it (0.32) */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  /* the cards a write is in flight for: their buttons take no second click */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useMountEffect(() => {
    setMounted(true);
    page.current?.setAttribute('data-hydrated', '');
  });

  const refresh = useCallback(() => {
    // not awaited (0.32): the card left at the click; the loader confirms behind it
    void router.invalidate();
  }, [router]);

  const hide = (ids: ReadonlyArray<string>) =>
    setHidden((current) => new Set([...current, ...ids]));
  const unhide = (ids: ReadonlyArray<string>) =>
    setHidden((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  const mark = (ids: ReadonlyArray<string>, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      for (const id of ids)
        if (on) next.add(id);
        else next.delete(id);
      return next;
    });

  const restore = async (card: DeckCard) => {
    if (busy.has(card.id)) return;
    mark([card.id], true);
    hide([card.id]);
    /* the marker the home page reads when the seller leaves for Recent presentations inside the
       restore's flight time (rank 7; build/b7.md R9, routes/-restoring.ts): written before the
       request, removed when the restore is refused, retired by the home page or its age */
    writeRestoringMarker(sessionMarkerStorage(), card.id);
    /* the editor's Move to trash left a marker for the home page (rank 16): a restore here within
       its 15 s would otherwise hide the deck again on the next visit */
    forgetTrashedMarker(card.id);
    try {
      /* no revision from the listing, which lags the store (docs/FOCUS.md rank 7); Delete forever
         below keeps its revision, since an irreversible action on a stale card should stop */
      await restoreStoredDeck({ deckId: card.id });
      /* Move to trash took the deck out of this browser's Recent record (markDeckTrashed), and
         since H2 an anonymous visitor's /decks lists that record alone, so the restored deck goes
         back into it; a signed in owner's listing holds it either way */
      recordDeckOpened(card.id, openFactsOf(card));
      forgetDeckTrashed(card.id);
      snackbar.show(`Restored ${card.title}`);
      refresh();
    } catch (error) {
      clearRestoringMarker(sessionMarkerStorage());
      unhide([card.id]);
      snackbar.show(`${HOME.restore}: ${errorMessage(error)}`);
    } finally {
      mark([card.id], false);
    }
  };

  const remove = async (cards: ReadonlyArray<DeckCard>) => {
    setConfirm(null);
    const pending = cards.filter((card) => !busy.has(card.id));
    if (pending.length === 0) return;
    const ids = pending.map((card) => card.id);
    mark(ids, true);
    hide(ids);
    let removed = 0;
    try {
      // one at a time: the Blob backend deletes a prefix per deck and the store lists them again
      for (const card of pending) {
        await removeStoredDeck({ deckId: card.id, baseRevision: card.revision });
        forgetDeckOpened(card.id);
        forgetDeckTrashed(card.id);
        removed += 1;
      }
    } catch (error) {
      // the refused card and the ones after it come back; the removed ones stay gone
      unhide(ids.slice(removed));
      snackbar.show(HOME.deleteForeverRefused(errorMessage(error)));
    } finally {
      mark(ids, false);
    }
    if (removed > 0) refresh();
    if (removed > 0 && cards.length > 1)
      snackbar.show(`Deleted ${removed} presentation${removed === 1 ? '' : 's'} forever`);
  };

  const now = new Date();

  return (
    <main ref={page} className="ts-home ts-home-page ts-decks-page ts-trash-page">
      {/* the column's two rails, drawn once for the page (grammar.css .ts-rails), as on /decks */}
      <div className="ts-rails" aria-hidden="true" />
      <header className="ts-appbar ts-seam">
        <div className="ts-col ts-appbar-row">
          <AppBarBrand linkComponent={RouterLinkSlot} homeTo="/decks" aboutTo="/home" />
        </div>
      </header>

      <section className="ts-trash ts-seam" aria-labelledby="ts-trash-heading">
        <div className="ts-col">
          {/* the listing streams behind the shell (SPEC-4 0.29): the frames stand in until it lands,
          and a refetch keeps the cards on the page (decks.index.tsx useStreamedList) */}
          <Suspense
            fallback={
              <TrashBody
                cards={null}
                mounted={mounted}
                now={now}
                hidden={hidden}
                busy={busy}
                onRestore={(card) => void restore(card)}
                onDelete={(card) => setConfirm({ kind: 'one', card })}
                onEmpty={(cards) => setConfirm({ kind: 'all', cards })}
              />
            }
          >
            <TrashList
              promise={decks}
              mounted={mounted}
              now={now}
              hidden={hidden}
              busy={busy}
              onRestore={(card) => void restore(card)}
              onDelete={(card) => setConfirm({ kind: 'one', card })}
              onEmpty={(cards) => setConfirm({ kind: 'all', cards })}
            />
          </Suspense>
        </div>
      </section>

      {confirm !== null ? (
        <DeleteForeverDialog
          title={confirm.kind === 'one' ? confirm.card.title : HOME.trash}
          {...(confirm.kind === 'one'
            ? { slides: confirm.card.slides }
            : { count: confirm.cards.length })}
          busy={busy.size > 0}
          onClose={() => setConfirm(null)}
          onConfirm={() => void remove(confirm.kind === 'one' ? [confirm.card] : confirm.cards)}
        />
      ) : null}

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}

type TrashBodyProps = {
  cards: ReadonlyArray<DeckCard> | null;
  mounted: boolean;
  now: Date;
  hidden: ReadonlySet<string>;
  busy: ReadonlySet<string>;
  onRestore: (card: DeckCard) => void;
  onDelete: (card: DeckCard) => void;
  onEmpty: (cards: ReadonlyArray<DeckCard>) => void;
};

/**
 * The listing once it lands, kept across refetches (decks.index.tsx useStreamedList). The ids the
 * store answered as gone (no such deck, or not the caller's) leave this browser's trash record.
 */
function TrashList({
  promise,
  ...props
}: Omit<TrashBodyProps, 'cards'> & { promise: Promise<TrashListing> }) {
  const listing = useStreamedList(promise);
  useEffect(() => {
    if (listing.gone.length > 0) forgetDeckTrashed(...listing.gone);
  }, [listing]);
  return <TrashBody cards={listing.cards} {...props} />;
}

/**
 * The head and the rows: with `cards` null the listing is on its way and the rows' frames stand in
 * (`aria-busy`); with the list the rows a click took out stay hidden until the loader confirms
 * it. The Empty trash button counts the rows on the page, so a deck that just left is not deleted
 * twice.
 */
function TrashBody({
  cards,
  mounted,
  now,
  hidden,
  busy,
  onRestore,
  onDelete,
  onEmpty,
}: TrashBodyProps) {
  const shown = cards === null ? null : cards.filter((card) => !hidden.has(card.id));
  return (
    <>
      <div className="ts-trash-head">
        <div>
          <h1 id="ts-trash-heading">{HOME.trash}</h1>
          <p>
            Presentations moved to the trash stay here until they are restored or deleted forever.
          </p>
        </div>
        <div className="ts-trash-actions">
          <Link
            to="/decks"
            className="pt-ib is-text"
            data-control="trash.back"
            {...tipProps({ name: HOME.back, doc: 'Back to your presentations.' })}
          >
            <span className="pt-lb">{HOME.back}</span>
          </Link>
          <button
            type="button"
            className="pt-ib is-text"
            data-control="trash.empty"
            disabled={shown === null || shown.length === 0 || busy.size > 0}
            onClick={() => (shown === null ? undefined : onEmpty(shown))}
            {...tipProps({
              name: HOME.emptyTrash,
              doc: 'Deletes every presentation in the trash forever, after asking once.',
            })}
          >
            <Icon name="archive" />
            <span className="pt-lb">{HOME.emptyTrash}</span>
          </button>
        </div>
      </div>

      {shown === null ? (
        <table
          className="ts-rows ts-rows-pending"
          data-control="trash.pending"
          aria-busy="true"
          aria-label={`${HOME.trash}, loading`}
        >
          <TrashRowsHead />
          <tbody>
            {[0, 1, 2, 3].map((i) => (
              <tr key={i} className="ts-row ts-row-frame" aria-hidden="true">
                <td className="ts-row-title">
                  <span className="ts-row-name">
                    <span className="ts-hm-card-thumb ts-row-thumb" />
                    <span className="ts-frame-line" />
                  </span>
                </td>
                <td className="ts-row-when" />
                <td className="ts-row-count" />
                <td className="ts-trash-row-actions" />
              </tr>
            ))}
          </tbody>
        </table>
      ) : shown.length === 0 ? (
        <div className="ts-home-empty-figure" data-control="trash.empty-state">
          <EmptyFigure figure="figure" title={TRASH_EMPTY.title} sentence={TRASH_EMPTY.sentence} />
        </div>
      ) : (
        <table className="ts-rows" data-control="trash.cards">
          <TrashRowsHead />
          <tbody>
            {shown.map((card) => (
              <TrashRow
                key={card.id}
                card={card}
                mounted={mounted}
                now={now}
                busy={busy.has(card.id)}
                onRestore={() => onRestore(card)}
                onDelete={() => onDelete(card)}
              />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** The words of the trash's column heads: the name and the count as /decks says them. */
export const TRASH_ROWS = {
  trashed: 'Trashed',
  trashedOn: (when: string) => `Trashed ${when}`,
} as const;

/** The column heads, as /decks draws them (decks.index.tsx RowsHead), with Trashed for the date. */
function TrashRowsHead() {
  return (
    <thead>
      <tr>
        <th scope="col">{DECKS_PAGE.name}</th>
        <th scope="col">{TRASH_ROWS.trashed}</th>
        <th scope="col">{DECKS_PAGE.slides}</th>
        <th scope="col">
          <span className="ts-visually-hidden">{DECKS_PAGE.actions}</span>
        </th>
      </tr>
    </thead>
  );
}

/**
 * One ruled row of the trash: the first slide in the 64 by 36 frame and the title, the trashed
 * date (under the title below 720 px), the slide count, and Restore and Delete forever as 32 px
 * text buttons, Delete forever in ink with its glyph. The row is `trash.card.<id>`, the id the
 * card had.
 */
function TrashRow({
  card,
  mounted,
  now,
  busy,
  onRestore,
  onDelete,
}: {
  card: DeckCard;
  mounted: boolean;
  now: Date;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const trashed = card.trashedAt ?? card.updatedAt;
  const when = mounted ? shortDate(trashed, now) : trashed.slice(0, 10);
  return (
    <tr
      className="ts-row ts-trash-row"
      data-deck={card.id}
      data-control={`trash.card.${card.id}`}
      data-busy={busy ? '' : undefined}
    >
      <td className="ts-row-title">
        <span className="ts-row-name">
          <span className="ts-row-open">
            <Thumb card={card} size="row" />
          </span>
          <span className="ts-row-label">
            <span className="ts-hm-card-title">
              <span className="ts-hm-card-title-text">{card.title}</span>
            </span>
            <span className="ts-row-when-under" suppressHydrationWarning>
              {`${TRASH_ROWS.trashedOn(when)} · ${card.slides} slide${card.slides === 1 ? '' : 's'}`}
            </span>
          </span>
        </span>
      </td>
      <td className="ts-row-when ts-hm-card-when" suppressHydrationWarning>
        {when}
      </td>
      <td className="ts-row-count">{card.slides}</td>
      <td className="ts-trash-row-actions">
        <span className="ts-trash-card-actions">
          <button
            type="button"
            className="pt-ib is-text"
            data-control={`trash.restore.${card.id}`}
            disabled={busy}
            onClick={onRestore}
            {...tipProps({ name: HOME.restore, doc: 'Puts the presentation back in your list.' })}
          >
            <Icon name="sync" />
            <span className="pt-lb">{HOME.restore}</span>
          </button>
          <button
            type="button"
            className="pt-ib is-text ts-trash-delete"
            data-control={`trash.delete.${card.id}`}
            disabled={busy}
            onClick={onDelete}
            {...tipProps({
              name: HOME.deleteForever,
              doc: 'Deletes the presentation after asking; nothing brings it back.',
            })}
          >
            <Icon name="trash" />
            <span className="pt-lb">{HOME.deleteForever}</span>
          </button>
        </span>
      </td>
    </tr>
  );
}

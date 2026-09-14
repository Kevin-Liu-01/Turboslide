import { Suspense, useCallback, useRef, useState } from 'react';

import { Link, createFileRoute, useRouter } from '@tanstack/react-router';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import { Icon } from '@turboslide/chrome/icons';
import { DIALOGS, HOME } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../components/useMountEffect';
import { listTrashedDecks, removeStoredDeck, restoreStoredDeck } from '../server/decks';
import type { DeckCard } from '../server/decks';
import { Dialog, cardThumbUrl, shortDate, useStreamedList } from './decks.index';
import { RouterLinkSlot } from './-link-slot';
import { forgetDeckOpened } from './-recent';

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
 */
export const Route = createFileRoute('/decks/trash')({
  loader: () => ({ decks: listTrashedDecks() }),
  head: () => ({ meta: [{ title: `${HOME.trash}, Turboslide` }] }),
  component: TrashPage,
});

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
    try {
      await restoreStoredDeck({ deckId: card.id, baseRevision: card.revision });
      snackbar.show(`Restored ${card.title}`);
      refresh();
    } catch (error) {
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
        removed += 1;
      }
    } catch (error) {
      // the refused card and the ones after it come back; the removed ones stay gone
      unhide(ids.slice(removed));
      snackbar.show(`${HOME.deleteForever}: ${errorMessage(error)}`);
    } finally {
      mark(ids, false);
    }
    if (removed > 0) refresh();
    if (removed > 0 && cards.length > 1)
      snackbar.show(`Deleted ${removed} presentation${removed === 1 ? '' : 's'} forever`);
  };

  const now = new Date();

  return (
    <main ref={page} className="ts-home ts-home-page ts-trash-page">
      <header className="ts-appbar">
        <AppBarBrand linkComponent={RouterLinkSlot} homeTo="/decks" aboutTo="/home" />
        <span />
      </header>

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

      {confirm !== null ? (
        <Dialog
          title={
            confirm.kind === 'one'
              ? DIALOGS.deleteForever.title(confirm.card.title)
              : `Delete ${confirm.cards.length} presentation${confirm.cards.length === 1 ? '' : 's'} forever? This cannot be undone`
          }
          control="trash.confirm"
          onClose={() => setConfirm(null)}
          onSubmit={() => void remove(confirm.kind === 'one' ? [confirm.card] : confirm.cards)}
          actions={
            <>
              <button
                type="button"
                className="pt-ib is-text"
                data-control="trash.confirm.cancel"
                data-autofocus
                onClick={() => setConfirm(null)}
                {...tipProps({
                  name: DIALOGS.deleteForever.cancel,
                  doc: 'Keeps the presentation in the trash.',
                })}
              >
                <span className="pt-lb">{DIALOGS.deleteForever.cancel}</span>
              </button>
              <button
                type="button"
                className="pt-ib is-text is-solid"
                data-control="trash.confirm.ok"
                onClick={() => void remove(confirm.kind === 'one' ? [confirm.card] : confirm.cards)}
                {...tipProps({
                  name: DIALOGS.deleteForever.ok,
                  doc: 'Deletes the files; nothing brings them back.',
                  key: 'Enter',
                })}
              >
                <span className="pt-lb">{DIALOGS.deleteForever.ok}</span>
              </button>
            </>
          }
        >
          <p>
            {confirm.kind === 'one'
              ? `${confirm.card.slides} slide${confirm.card.slides === 1 ? '' : 's'} and every version of ${confirm.card.title} are deleted.`
              : 'Every presentation in the trash, with its slides and versions, is deleted.'}
          </p>
        </Dialog>
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

/** The listing once it lands, kept across refetches (decks.index.tsx useStreamedList). */
function TrashList({
  promise,
  ...props
}: Omit<TrashBodyProps, 'cards'> & { promise: Promise<DeckCard[]> }) {
  const cards = useStreamedList(promise);
  return <TrashBody cards={cards} {...props} />;
}

/**
 * The head and the cards: with `cards` null the listing is on its way and the grid's frames
 * stand in (`aria-busy`); with the list the cards a click took out stay hidden until the loader
 * confirms it. The Empty trash button counts the cards on the page, so a card that just left is
 * not deleted twice.
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
          <h1>{HOME.trash}</h1>
          <p>
            Presentations moved to the trash stay here until they are restored or deleted forever.
          </p>
        </div>
        <div className="ts-trash-actions">
          <Link
            to="/decks"
            className="pt-ib is-text"
            data-control="trash.back"
            {...tipProps({ name: HOME.recent, doc: 'Back to your presentations.' })}
          >
            <span className="pt-lb">{HOME.recent}</span>
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
        <ul
          className="ts-cards ts-cards-pending"
          data-control="trash.pending"
          aria-busy="true"
          aria-label={`${HOME.trash}, loading`}
        >
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="ts-hm-card ts-hm-card-frame" aria-hidden="true">
              <span className="ts-hm-card-thumb" />
              <div className="ts-hm-card-body">
                <span className="ts-frame-line" />
                <span className="ts-frame-line is-short" />
              </div>
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <div className="ts-home-empty-figure" data-control="trash.empty-state">
          <EmptyFigure figure="figure" title={TRASH_EMPTY.title} sentence={TRASH_EMPTY.sentence} />
        </div>
      ) : (
        <ul className="ts-cards" data-control="trash.cards">
          {shown.map((card) => (
            <TrashCard
              key={card.id}
              card={card}
              mounted={mounted}
              now={now}
              busy={busy.has(card.id)}
              onRestore={() => onRestore(card)}
              onDelete={() => onDelete(card)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function TrashCard({
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
  const [failed, setFailed] = useState(false);
  const url = cardThumbUrl(card);
  const trashed = card.trashedAt ?? card.updatedAt;
  return (
    <li
      className="ts-hm-card ts-trash-card"
      data-deck={card.id}
      data-control={`trash.card.${card.id}`}
    >
      <span className="ts-hm-card-thumb" data-theme={card.appearance} aria-hidden="true">
        {url !== null && !failed ? (
          <img
            src={url}
            width={320}
            height={180}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="ts-hm-card-plate">{card.title}</span>
        )}
      </span>
      <div className="ts-hm-card-body">
        <span className="ts-hm-card-title">{card.title}</span>
        <span className="ts-hm-card-when" suppressHydrationWarning>
          {`Trashed ${mounted ? shortDate(trashed, now) : trashed.slice(0, 10)} · ${card.slides} slide${card.slides === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="ts-trash-card-actions">
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
          className="pt-ib is-text"
          data-control={`trash.delete.${card.id}`}
          disabled={busy}
          onClick={onDelete}
          {...tipProps({
            name: HOME.deleteForever,
            doc: 'Deletes the presentation after asking; nothing brings it back.',
          })}
        >
          <span className="pt-lb">{HOME.deleteForever}</span>
        </button>
      </div>
    </li>
  );
}

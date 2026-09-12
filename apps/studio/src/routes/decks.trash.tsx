import { useRef, useState } from 'react';

import { Link, createFileRoute, useRouter } from '@tanstack/react-router';

import { GtMark } from '@turboslide/chrome/GtMark';
import { Icon } from '@turboslide/chrome/icons';
import { DIALOGS, HOME } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../components/useMountEffect';
import { listTrashedDecks, removeStoredDeck, restoreStoredDeck } from '../server/decks';
import type { DeckCard } from '../server/decks';
import { Dialog, cardThumbUrl, shortDate } from './decks.index';

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
 */
export const Route = createFileRoute('/decks/trash')({
  loader: async () => ({ decks: await listTrashedDecks() }),
  head: () => ({ meta: [{ title: `${HOME.trash}, Turboslide` }] }),
  component: TrashPage,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Confirm = { kind: 'one'; card: DeckCard } | { kind: 'all' };

function TrashPage() {
  const { decks } = Route.useLoaderData();
  const router = useRouter();
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useMountEffect(() => {
    setMounted(true);
    page.current?.setAttribute('data-hydrated', '');
  });

  const refresh = async () => {
    await router.invalidate();
  };

  const restore = async (card: DeckCard) => {
    if (busy !== null) return;
    setBusy(card.id);
    try {
      await restoreStoredDeck({ deckId: card.id, baseRevision: card.revision });
      await refresh();
      snackbar.show(`Restored ${card.title}`);
    } catch (error) {
      snackbar.show(`${HOME.restore}: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (cards: ReadonlyArray<DeckCard>) => {
    setConfirm(null);
    if (busy !== null || cards.length === 0) return;
    setBusy(cards.length === 1 ? (cards[0]?.id ?? 'all') : 'all');
    let removed = 0;
    try {
      // one at a time: the Blob backend deletes a prefix per deck and the store lists them again
      for (const card of cards) {
        await removeStoredDeck({ deckId: card.id, baseRevision: card.revision });
        removed += 1;
      }
    } catch (error) {
      snackbar.show(`${HOME.deleteForever}: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
    await refresh();
    if (removed > 0 && cards.length > 1)
      snackbar.show(`Deleted ${removed} presentation${removed === 1 ? '' : 's'} forever`);
  };

  const now = new Date();

  return (
    <main ref={page} className="ts-home ts-home-page ts-trash-page">
      <header className="ts-appbar">
        <Link
          to="/decks"
          className="ts-appbar-brand"
          {...tipProps({ name: 'Turboslide', doc: 'Your presentations.' })}
        >
          <GtMark width={30} height={19} />
          <span>Turboslide</span>
        </Link>
        <span />
      </header>

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
            disabled={decks.length === 0 || busy !== null}
            onClick={() => setConfirm({ kind: 'all' })}
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

      {decks.length === 0 ? (
        <p className="ts-home-empty" data-control="trash.empty-state">
          {HOME.trashEmpty}
        </p>
      ) : (
        <ul className="ts-cards" data-control="trash.cards">
          {decks.map((card) => (
            <TrashCard
              key={card.id}
              card={card}
              mounted={mounted}
              now={now}
              busy={busy === card.id || busy === 'all'}
              onRestore={() => void restore(card)}
              onDelete={() => setConfirm({ kind: 'one', card })}
            />
          ))}
        </ul>
      )}

      {confirm !== null ? (
        <Dialog
          title={
            confirm.kind === 'one'
              ? DIALOGS.deleteForever.title(confirm.card.title)
              : `Delete ${decks.length} presentation${decks.length === 1 ? '' : 's'} forever? This cannot be undone`
          }
          control="trash.confirm"
          onClose={() => setConfirm(null)}
          onSubmit={() => void remove(confirm.kind === 'one' ? [confirm.card] : decks)}
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
                onClick={() => void remove(confirm.kind === 'one' ? [confirm.card] : decks)}
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

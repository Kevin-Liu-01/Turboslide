import type { DragEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { sectionOfSlide } from '@turboslide/schema/deck';

import { Dialog, DialogTabs } from '../Dialog';
import type { DeckHeadRow, SourceDeckSlides } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS, IMPORT_PPTX } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';
import { pictureGate } from './picture-gate';
import type { PictureGate } from './picture-gate';
import { recentRowsOf, withRecent } from './recent-rows';

import './upload.css';

/**
 * The words on the Import button: the count of the picked slides, as Google's "Import slides"
 * reads its count (docs/PRODUCT.md section 8.1 `slides.import.none-preselected`; audit-brand 19).
 */
export function importButtonLabel(picked: number, fallback: string): string {
  if (picked === 0) return fallback;
  return `Import ${picked} slide${picked === 1 ? '' : 's'}`;
}

/**
 * The next selection after a click on a tile (`slides.import.none-preselected`): a plain click
 * toggles the tile and becomes the anchor of a range; a Shift click adds every tile between the
 * anchor and the clicked tile, as Google's grid does. `order` is every slide id of the source in
 * order; a Shift click with no anchor is a plain click.
 */
export function togglePick(
  picked: ReadonlySet<string>,
  order: ReadonlyArray<string>,
  id: string,
  anchor: string | null,
  shift: boolean,
): { picked: Set<string>; anchor: string | null } {
  const next = new Set(picked);
  const at = order.indexOf(id);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (shift && at >= 0 && from >= 0) {
    const [lo, hi] = from < at ? [from, at] : [at, from];
    for (const each of order.slice(lo, hi + 1)) next.add(each);
    return { picked: next, anchor };
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { picked: next, anchor: id };
}

/**
 * File > Import slides (gslides-parity SPEC 2.1, 6.5, 12 "Dialogs"): step 1 picks a presentation
 * of this studio (deck.list) or a bundle upload; step 2 lists its slides with All, None, Back and
 * Import slides. One `slide.import` copies the chosen slides with fresh ids and their assets
 * after the current slide. Keep original theme is omitted: one theme. Nothing is picked when the
 * list opens (the product round, docs/PRODUCT.md `slides.import.none-preselected`; audit-brand 19
 * measured 84 slides coming over after one click on a tile meant to pick one); the button counts
 * the picks and a Shift click picks a range.
 */
export function ImportSlidesDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'presentations' | 'upload'>('presentations');
  /* this browser's own decks first (docs/POLISH.md item 75), never the deck imported into; the
     store's listing replaces them when it lands and the list is marked busy until then */
  const [decks, setDecks] = useState<ReadonlyArray<DeckHeadRow> | null>(() =>
    recentRowsOf(input.recentDecks, input.deckId),
  );
  const [listing, setListing] = useState(true);
  const [source, setSource] = useState<SourceDeckSlides | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  /** the tile of the last plain click, the start of a Shift click's range */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /* the tile pictures load near the list's visible area and six at a time (TilePicture) */
  const tiles = useRef<HTMLDivElement>(null);
  const [gate] = useState<PictureGate>(() => pictureGate());

  /* the Upload tab is a drop zone with a button (docs/POLISH.md item 88): a dropped or picked
     bundle is uploaded and its slides listed next */
  const takeFile = (file: File | null | undefined) => {
    if (!file) return;
    if (/\.pptx$/i.test(file.name)) {
      setError(IMPORT_PPTX);
      return;
    }
    if (input.uploadBundle === undefined) {
      setError('Upload a bundle from the home page, then import from it here');
      return;
    }
    setError(null);
    setBusy(true);
    input
      .uploadBundle(file)
      .then(({ id }) => choose(id))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    takeFile(event.dataTransfer.files[0]);
  };

  useEffect(() => {
    const list =
      input.listDecks ??
      (() => input.dispatch('deck.list', {}) as Promise<ReadonlyArray<DeckHeadRow>>);
    let live = true;
    list()
      .then((rows) => {
        if (!live) return;
        setDecks(withRecent(rows, input.recentDecks, input.deckId));
        setListing(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : String(err));
        setListing(false);
      });
    return () => {
      live = false;
    };
  }, [input]);

  const choose = (deckId: string) => {
    if (input.readDeck === undefined) {
      setError('Reading another presentation is not wired yet');
      return;
    }
    setBusy(true);
    input
      .readDeck(deckId)
      .then((read) => {
        setSource(read);
        // nothing preselected: a person picks the slides they want (audit-brand 19)
        setPicked(new Set());
        setAnchor(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const importSlides = () => {
    if (source === null || picked.size === 0) return;
    const slideIds = source.slides.filter((slide) => picked.has(slide.id)).map((slide) => slide.id);
    const section = sectionOfSlide(input.document.deck, input.slideId);
    setBusy(true);
    input
      .dispatch('slide.import', {
        sourceDeckId: source.id,
        slideIds,
        after: input.slideId,
        ...(section === undefined ? {} : { sectionId: section.id }),
        baseRevision: input.revision,
      })
      .then(() => {
        shell.closeDialog();
        shell.say(`Imported ${slideIds.length} slide${slideIds.length === 1 ? '' : 's'}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const toggle = (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (source === null) return;
    const next = togglePick(
      picked,
      source.slides.map((slide) => slide.id),
      id,
      anchor,
      event?.shiftKey === true,
    );
    setPicked(next.picked);
    setAnchor(next.anchor);
  };
  const okLabel = importButtonLabel(picked.size, DIALOGS.importSlides.ok);

  const step2 = source !== null;
  return (
    <Dialog
      title={DIALOGS.importSlides.title}
      onClose={shell.closeDialog}
      width={640}
      control="dialog.importSlides"
      actions={
        step2
          ? [
              {
                label: DIALOGS.importSlides.back,
                onClick: () => setSource(null),
                control: 'dialog.importSlides.back',
                doc: 'Back to the list of presentations',
              },
              {
                label: okLabel,
                primary: true,
                disabled: busy || picked.size === 0,
                onClick: importSlides,
                control: 'dialog.importSlides.ok',
                doc:
                  picked.size === 0
                    ? 'Pick the slides to copy first; a click picks a slide and a Shift click a range'
                    : 'Copies the picked slides after the current slide',
              },
            ]
          : []
      }
    >
      {!step2 ? (
        <>
          <DialogTabs
            tabs={[
              { value: 'presentations', label: DIALOGS.importSlides.presentations },
              { value: 'upload', label: DIALOGS.importSlides.upload },
            ]}
            value={tab}
            onChange={setTab}
            control="dialog.importSlides.tab"
          />
          {tab === 'presentations' ? (
            <>
              {decks === null && error === null ? (
                <ul className="ts-dialog-list is-loading" aria-busy="true" aria-label="Loading" />
              ) : null}
              {decks !== null && decks.length === 0 ? (
                <p className="ts-dialog-empty">No other presentations on this Turboslide</p>
              ) : null}
              {decks !== null && decks.length > 0 ? (
                <ul
                  className="ts-dialog-list"
                  role="listbox"
                  aria-label={DIALOGS.importSlides.presentations}
                  aria-busy={listing ? 'true' : undefined}
                >
                  {decks.map((deck) => (
                    <li key={deck.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="ts-dialog-row is-button"
                        data-control={`dialog.importSlides.deck.${deck.id}`}
                        disabled={busy}
                        onClick={() => choose(deck.id)}
                        {...tipProps({
                          name: deck.title,
                          doc: `${deck.slides} slide${deck.slides === 1 ? '' : 's'}, edited ${formatWhen(deck.updatedAt)}; click to pick its slides`,
                        })}
                      >
                        <span className="ts-dialog-row-title">{deck.title}</span>
                        <span className="ts-dialog-row-meta">
                          {deck.slides} slide{deck.slides === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div
              className={cn('ts-upload-zone', over && 'is-over')}
              data-control="dialog.importSlides.upload"
              onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <p>Drop a Turboslide bundle (.zip) here, or pick one from your device</p>
              <p>{IMPORT_PPTX}</p>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                aria-label="Bundle file"
                data-control="dialog.importSlides.file"
                tabIndex={-1}
                onChange={(event) => takeFile(event.target.files?.[0])}
              />
              <button
                type="button"
                className="pt-ib"
                disabled={busy}
                data-control="dialog.importSlides.upload.button"
                onClick={() => fileInput.current?.click()}
                {...tipProps({
                  name: 'Select a file from your device',
                  doc: 'A Turboslide bundle (.zip); its slides are listed next',
                })}
              >
                <span className="pt-lb">
                  {busy ? 'Uploading' : 'Select a file from your device'}
                </span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ts-dialog-code" role="group" aria-label="Selection">
            <span className="ts-dialog-row-title">{source.title}</span>
            <button
              type="button"
              className="pt-ib is-text"
              data-control="dialog.importSlides.all"
              onClick={() => setPicked(new Set(source.slides.map((slide) => slide.id)))}
              {...tipProps({ name: DIALOGS.importSlides.all, doc: 'Selects every slide' })}
            >
              <span className="pt-lb">{DIALOGS.importSlides.all}</span>
            </button>
            <button
              type="button"
              className="pt-ib is-text"
              data-control="dialog.importSlides.none"
              onClick={() => setPicked(new Set())}
              {...tipProps({ name: DIALOGS.importSlides.none, doc: 'Clears the selection' })}
            >
              <span className="pt-lb">{DIALOGS.importSlides.none}</span>
            </button>
          </div>
          <div
            ref={tiles}
            className="ts-dialog-slides"
            role="listbox"
            aria-label="Slides"
            aria-multiselectable="true"
          >
            {source.slides.map((slide) => (
              <button
                key={slide.id}
                type="button"
                role="option"
                aria-selected={picked.has(slide.id)}
                className={cn('ts-dialog-slide', picked.has(slide.id) && 'is-on')}
                data-control={`dialog.importSlides.slide.${slide.id}`}
                onClick={(event) => toggle(slide.id, event)}
                {...tipProps({
                  name: slide.title,
                  doc: picked.has(slide.id)
                    ? 'Picked; click to leave it out'
                    : 'Click to pick it; Shift and click to pick every slide up to here',
                })}
              >
                <span className="ts-dialog-slide-frame">
                  <TilePicture
                    src={`/api/render/${encodeURIComponent(slide.id)}?deck=${encodeURIComponent(source.id)}&theme=dark&w=320`}
                    gate={gate}
                    list={tiles}
                  />
                </span>
                <span className="ts-dialog-slide-title">
                  {slide.n}. {slide.title}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * One tile's picture (round1/build/ha.md "Round 1 fix round" request 1): asked for when the tile
 * comes within 200 px of the list's visible area, then through the dialog's picture gate
 * (picture-gate.ts, six at a time) at low fetch priority, so the import's own request never waits
 * behind 95 tile renders. Before, every tile asked at once: the browser's lazy margin covers the
 * whole 320 px list.
 */
function TilePicture({
  src,
  gate,
  list,
}: {
  src: string;
  gate: PictureGate;
  list: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  /* none, then waiting for a turn, then loading on a turn, then done (the turn given back) */
  const turn = useRef<'none' | 'waiting' | 'loading' | 'done'>('none');
  const finish = () => {
    if (turn.current !== 'loading') return;
    turn.current = 'done';
    gate.done();
  };
  useEffect(() => {
    const img = ref.current;
    if (img === null) return;
    let cancel: (() => void) | null = null;
    const ask = () => {
      if (turn.current !== 'none') return;
      turn.current = 'waiting';
      cancel = gate.ask(() => {
        turn.current = 'loading';
        setShown(src);
      });
    };
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') ask();
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          ask();
        },
        { root: list.current, rootMargin: '200px 0px' },
      );
      observer.observe(img);
    }
    return () => {
      observer?.disconnect();
      /* a tile that leaves gives its place in the queue or its turn back */
      if (turn.current === 'waiting') {
        cancel?.();
        turn.current = 'none';
      } else if (turn.current === 'loading') {
        turn.current = 'done';
        gate.done();
      }
    };
  }, [src, gate, list]);
  return (
    <img
      ref={ref}
      src={shown ?? undefined}
      alt=""
      fetchPriority="low"
      decoding="async"
      onLoad={finish}
      onError={finish}
    />
  );
}

import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { sectionOfSlide } from '@turboslide/schema/deck';

import type { Theme } from '@turboslide/viewer/theme';

import { Dialog, DialogTabs } from '../Dialog';
import { appearanceOf } from '../editor-shell';
import type { DeckHeadRow, SourceDeckSlides } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS, IMPORT_PPTX } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';
import { pictureGate } from './picture-gate';
import type { PictureGate, PictureTurn } from './picture-gate';
import { recentRowsOf, withRecent } from './recent-rows';

import './upload.css';

/**
 * The words on the Import button: the count of the picked slides, as Google's "Import slides"
 * reads its count (docs/archive/rounds/PRODUCT.md section 8.1 `slides.import.none-preselected`; audit-brand 19).
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
 * after the current slide; the copies take this presentation's theme (docs/DESIGN.md question 18), as
 * the dialog says under the slides. Nothing is picked when the
 * list opens (the product round, docs/archive/rounds/PRODUCT.md `slides.import.none-preselected`; audit-brand 19
 * measured 84 slides coming over after one click on a tile meant to pick one); the button counts
 * the picks and a Shift click picks a range.
 */
export function ImportSlidesDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'presentations' | 'upload'>('presentations');
  /* this browser's own decks first (docs/archive/rounds/POLISH.md item 75), never the deck imported into; the
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

  /* the Upload tab is a drop zone with a button (docs/archive/rounds/POLISH.md item 88): a dropped or picked
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
        setDecks(withRecent(rows, input.recentDecks, input.deckId, { example: true }));
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
              {/* the sentence is true of the viewer's own decks: the example deck after them is
                  every browser's (the Round 1 follow-up, lane A item 1) */}
              {decks !== null && !listing && decks.every((deck) => deck.example === true) ? (
                <p className="ts-dialog-empty">{IMPORT_NONE_OF_YOURS}</p>
              ) : null}
              {decks !== null && decks.length > 0 ? (
                <ul
                  className="ts-dialog-list pt-scroll"
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
                          doc:
                            deck.example === true
                              ? `The example deck, ${deck.slides} slide${deck.slides === 1 ? '' : 's'}; click to pick its slides`
                              : `${deck.slides} slide${deck.slides === 1 ? '' : 's'}, edited ${formatWhen(deck.updatedAt)}; click to pick its slides`,
                        })}
                      >
                        <span className="ts-dialog-row-title">{deck.title}</span>
                        <span className="ts-dialog-row-meta">{rowMeta(deck)}</span>
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
          <SlideTiles
            key={source.id}
            source={source}
            appearance={appearanceOf(input.document.deck)}
            picked={picked}
            onToggle={toggle}
          />
          <p className="ts-dialog-hint" data-control="dialog.importSlides.theme">
            {DIALOGS.importSlides.theme}
          </p>
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

/** The sentence over the example deck when the viewer has no other presentation to import from. */
export const IMPORT_NONE_OF_YOURS = 'You have no other presentations yet';

/** A row's meta: its slide count, and "Example" before it on the example deck. */
export function rowMeta(deck: Pick<DeckHeadRow, 'slides' | 'example'>): string {
  const count = `${deck.slides} slide${deck.slides === 1 ? '' : 's'}`;
  return deck.example === true ? `Example · ${count}` : count;
}

/**
 * The picture of one tile: the source's slide at 320 px in the appearance of the deck imported
 * into, the appearance its copy is drawn in, so the tile shows what the sentence under the grid
 * promises (design round pass 2 finding 1: every tile asked for `theme=dark`, and a light deck's
 * slides showed black).
 */
export function importTileSrc(sourceId: string, slideId: string, appearance: Theme): string {
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(sourceId)}&theme=${appearance}&w=320`;
}

/**
 * Step 2's grid of the source's slides. One picture gate and one watch per source, so Back and
 * another deck start from nothing and every turn of the last source goes back when it unmounts.
 */
function SlideTiles({
  source,
  appearance,
  picked,
  onToggle,
}: {
  source: SourceDeckSlides;
  /** the appearance of the deck imported into, which the copies take */
  appearance: Theme;
  picked: ReadonlySet<string>;
  onToggle: (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [gate] = useState<PictureGate>(() => pictureGate());
  const [watch] = useState<TileWatch>(() => tileWatch(() => list.current));
  useEffect(() => () => watch.stop(), [watch]);
  return (
    <div
      ref={list}
      className="ts-dialog-slides pt-scroll"
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
          onClick={(event) => onToggle(slide.id, event)}
          {...tipProps({
            name: slide.title,
            doc: picked.has(slide.id)
              ? 'Picked; click to leave it out'
              : 'Click to pick it; Shift and click to pick every slide up to here',
          })}
        >
          <span className="ts-dialog-slide-frame">
            <TilePicture
              src={importTileSrc(source.id, slide.id, appearance)}
              gate={gate}
              watch={watch}
            />
          </span>
          <span className="ts-dialog-slide-title">
            {slide.n}. {slide.title}
          </span>
        </button>
      ))}
    </div>
  );
}

/** What a tile hears from the list: near its visible area (within 200 px) or not, in view or not. */
type TileHandlers = { near: (yes: boolean) => void; view: (yes: boolean) => void };

/** Watches the tiles of one list; `observe` answers the stop for one tile. */
export type TileWatch = {
  observe: (tile: Element, handlers: TileHandlers) => () => void;
  stop: () => void;
};

/** How far past the list's visible area a tile's picture is asked for. */
export const TILE_NEAR_MARGIN = '200px 0px';

/**
 * Two IntersectionObservers for a whole list, made on the first tile (the list's element exists
 * by then): one for the visible area, made first so a tile knows it is in view before it asks,
 * and one for the visible area and 200 px around it. Both report every change, so a tile that
 * leaves is heard; the old observer disconnected after a tile's first sighting. Without
 * IntersectionObserver every tile is near and in view.
 */
export function tileWatch(root: () => Element | null): TileWatch {
  const handlers = new Map<Element, TileHandlers>();
  let view: IntersectionObserver | null = null;
  let near: IntersectionObserver | null = null;
  const ensure = (): void => {
    if (near !== null) return;
    const options = { root: root() };
    view = new IntersectionObserver((entries) => {
      for (const entry of entries) handlers.get(entry.target)?.view(entry.isIntersecting);
    }, options);
    near = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) handlers.get(entry.target)?.near(entry.isIntersecting);
      },
      { ...options, rootMargin: TILE_NEAR_MARGIN },
    );
  };
  return {
    observe(tile, on) {
      if (typeof IntersectionObserver === 'undefined') {
        on.view(true);
        on.near(true);
        return () => undefined;
      }
      ensure();
      handlers.set(tile, on);
      view?.observe(tile);
      near?.observe(tile);
      return () => {
        handlers.delete(tile);
        view?.unobserve(tile);
        near?.unobserve(tile);
      };
    },
    stop() {
      handlers.clear();
      view?.disconnect();
      near?.disconnect();
    },
  };
}

/**
 * One tile's picture (round1/build/ha.md "Round 1 fix round" request 1; the Round 1 follow-up,
 * lane A item 2): asked for through the list's picture gate (picture-gate.ts, six at a time) when
 * the tile comes within 200 px of the list's visible area, in the in-view rank while it is in
 * view, at low fetch priority so the import's own request never waits behind the tile renders. A
 * tile that leaves before its picture is drawn gives its place back: a waiting tile leaves the
 * queue, and a loading one drops its `src`, which ends the browser's request, and frees its turn.
 * It asks again when it comes back. A loading tile only near the view drops its `src` the same way
 * when a tile in view takes its turn, and loads again on its next turn. A drawn picture stays. A
 * picture that fails gives its turn back and is asked for again after the tile leaves and
 * returns.
 */
function TilePicture({ src, gate, watch }: { src: string; gate: PictureGate; watch: TileWatch }) {
  const ref = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const img = ref.current;
    if (img === null) return;
    let turn: PictureTurn | null = null;
    let inView = false;
    let drawn = false;
    const giveBack = (): void => {
      turn?.release();
      turn = null;
    };
    const onLoad = (): void => {
      drawn = true;
      giveBack();
    };
    img.addEventListener('load', onLoad);
    img.addEventListener('error', giveBack);
    const unwatch = watch.observe(img, {
      view: (yes) => {
        inView = yes;
        turn?.see(yes);
      },
      near: (yes) => {
        if (drawn) return;
        if (yes) {
          /* a tile in view may take this tile's turn while it is only near: it drops its src */
          turn ??= gate.ask(
            () => setShown(src),
            inView,
            () => setShown(null),
          );
          return;
        }
        giveBack();
        setShown(null);
      },
    });
    return () => {
      unwatch();
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', giveBack);
      giveBack();
    };
  }, [src, gate, watch]);
  return (
    <img
      ref={ref}
      src={shown ?? undefined}
      alt=""
      fetchPriority="low"
      decoding="async"
    />
  );
}

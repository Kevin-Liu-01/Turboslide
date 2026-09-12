import { useEffect, useState } from 'react';

import { sectionOfSlide } from '@turboslide/schema/deck';

import { Dialog, DialogTabs } from '../Dialog';
import type { DeckHeadRow, SourceDeckSlides } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS, IMPORT_PPTX } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';

/**
 * File > Import slides (gslides-parity SPEC 2.1, 6.5, 12 "Dialogs"): step 1 picks a presentation
 * of this studio (deck.list) or a bundle upload; step 2 lists its slides with All, None, Back and
 * Import slides. One `slide.import` copies the chosen slides with fresh ids and their assets
 * after the current slide. Keep original theme is omitted: one theme.
 */
export function ImportSlidesDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'presentations' | 'upload'>('presentations');
  const [decks, setDecks] = useState<ReadonlyArray<DeckHeadRow> | null>(null);
  const [source, setSource] = useState<SourceDeckSlides | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list =
      input.listDecks ??
      (() => input.dispatch('deck.list', {}) as Promise<ReadonlyArray<DeckHeadRow>>);
    let live = true;
    list()
      .then((rows) => {
        if (live)
          setDecks(
            rows
              .filter((row) => row.id !== input.deckId)
              .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
          );
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
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
        setPicked(new Set(read.slides.map((slide) => slide.id)));
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

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

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
                label: DIALOGS.importSlides.ok,
                primary: true,
                disabled: busy || picked.size === 0,
                onClick: importSlides,
                control: 'dialog.importSlides.ok',
                doc: 'Copies the selected slides after the current slide',
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
                <p className="ts-dialog-empty">Loading…</p>
              ) : null}
              {decks !== null && decks.length === 0 ? (
                <p className="ts-dialog-empty">No other presentations on this Turboslide</p>
              ) : null}
              {decks !== null && decks.length > 0 ? (
                <ul
                  className="ts-dialog-list"
                  role="listbox"
                  aria-label={DIALOGS.importSlides.presentations}
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
                          doc: `${deck.slides} slides, edited ${formatWhen(deck.updatedAt)}; click to pick its slides`,
                        })}
                      >
                        <span className="ts-dialog-row-title">{deck.title}</span>
                        <span className="ts-dialog-row-meta">{deck.slides} slides</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <p>{IMPORT_PPTX}</p>
              <input
                type="file"
                accept=".zip,application/zip"
                aria-label="Bundle file"
                data-control="dialog.importSlides.file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (/\.pptx$/i.test(file.name)) {
                    setError(IMPORT_PPTX);
                    return;
                  }
                  if (input.uploadBundle === undefined) {
                    setError('Upload a bundle from the home page, then import from it here');
                    return;
                  }
                  setBusy(true);
                  input
                    .uploadBundle(file)
                    .then(({ id }) => choose(id))
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : String(err)),
                    )
                    .finally(() => setBusy(false));
                }}
                {...tipProps({
                  name: 'Bundle file',
                  doc: 'A Turboslide bundle (.zip); its slides are listed next',
                })}
              />
            </>
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
                onClick={() => toggle(slide.id)}
                {...tipProps({
                  name: slide.title,
                  doc: picked.has(slide.id) ? 'Selected; click to leave it out' : 'Click to select',
                })}
              >
                <span className="ts-dialog-slide-frame">
                  <img
                    src={`/api/render/${encodeURIComponent(slide.id)}?deck=${encodeURIComponent(source.id)}&theme=dark&w=320`}
                    alt=""
                    loading="lazy"
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

import { useEffect, useMemo, useState } from 'react';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { sectionOfSlide, slideTitle } from '@turboslide/schema/deck';
import type { ImportReport } from '@turboslide/schema/import-report';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import { Dialog, DialogTabs } from '../Dialog';
import type { DeckHeadRow, SourceDeckSlides } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS, ROUND_FIVE } from '../menus/strings';
import { UPLOAD_ACCEPT, isPptxFile } from './upload-accept';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';

import './import-dialogs.css';

/**
 * File > Import slides (gslides-parity SPEC 2.1, 6.5, 12 "Dialogs"; SPEC-5 0.27, 5.2): step 1
 * picks a presentation of this studio (deck.list), a bundle upload, or since round five a
 * PowerPoint file; step 2 lists its slides with All, None, Back and Import slides. A deck's
 * slides copy through one `slide.import` with fresh ids and their assets after the current
 * slide. A `.pptx` is read once as a dry run (`import.pptx { dryRun }`, the file as a `data:`
 * URL) so step 2 can list its slides with the report's sentence and, when the answer carries the
 * document (b3.md request B3-8), their thumbnails through the route's renderer; Import slides
 * then runs one `slide.import` with `sourceFile` and the chosen slide numbers, fitted onto this
 * deck's page. Keep original theme is Google's checkbox, unchecked: on, the file's first theme
 * joins In this presentation.
 */
type PptxStep = {
  url: string;
  name: string;
  report: ImportReport;
  slides?: Slide[];
  deck?: Deck;
};

export function ImportSlidesDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'presentations' | 'upload'>('presentations');
  const [decks, setDecks] = useState<ReadonlyArray<DeckHeadRow> | null>(null);
  const [source, setSource] = useState<SourceDeckSlides | null>(null);
  const [pptx, setPptx] = useState<PptxStep | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pickedIndexes, setPickedIndexes] = useState<ReadonlySet<number>>(new Set());
  const [keepTheme, setKeepTheme] = useState(false);
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

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

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
      .catch(fail)
      .finally(() => setBusy(false));
  };

  /** A `.pptx` read once as a dry run: the report and, when the action answers it, the document. */
  const readPptx = (file: File) => {
    setBusy(true);
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setBusy(false);
      setError(`${file.name} could not be read`);
    };
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null;
      if (url === null) {
        setBusy(false);
        setError(`${file.name} could not be read`);
        return;
      }
      input
        .dispatch('import.pptx', { file: url, dryRun: true })
        .then((answer) => {
          const report = answer as ImportReport & { deck?: Deck; slides?: Slide[] };
          const step: PptxStep = { url, name: file.name, report };
          if (report.deck !== undefined) step.deck = report.deck;
          if (report.slides !== undefined) step.slides = report.slides;
          setPptx(step);
          setPickedIndexes(new Set(Array.from({ length: report.source.slides }, (_, i) => i + 1)));
        })
        .catch(fail)
        .finally(() => setBusy(false));
    };
    reader.readAsDataURL(file);
  };

  const importSlides = () => {
    const section = sectionOfSlide(input.document.deck, input.slideId);
    if (pptx !== null) {
      if (pickedIndexes.size === 0) return;
      const slideIndexes = [...pickedIndexes].sort((a, b) => a - b);
      setBusy(true);
      input
        .dispatch('slide.import', {
          sourceFile: pptx.url,
          slideIndexes,
          after: input.slideId,
          ...(section === undefined ? {} : { sectionId: section.id }),
          ...(keepTheme ? { keepTheme: true } : {}),
          baseRevision: input.revision,
        })
        .then(() => {
          shell.closeDialog();
          const { substituted, dropped } = pptx.report.summary;
          shell.say(
            `Imported ${slideIndexes.length} slide${slideIndexes.length === 1 ? '' : 's'} from ${pptx.name}${substituted + dropped > 0 ? `. ${ROUND_FIVE.importNotice}` : ''}`,
          );
        })
        .catch(fail)
        .finally(() => setBusy(false));
      return;
    }
    if (source === null || picked.size === 0) return;
    const slideIds = source.slides.filter((slide) => picked.has(slide.id)).map((slide) => slide.id);
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
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const toggleIndex = (n: number) => {
    const next = new Set(pickedIndexes);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setPickedIndexes(next);
  };

  /** The rows of a file's step 2: every source slide by number, with its title and thumbnail when the document came over. */
  const pptxRows = useMemo(() => {
    if (pptx === null) return [];
    const count = pptx.report.source.slides;
    const rows: { n: number; title: string; html: string | null }[] = [];
    for (let n = 1; n <= count; n += 1) {
      const slide = pptx.slides?.[n - 1];
      let html: string | null = null;
      if (slide !== undefined && input.renderSlide !== undefined) {
        try {
          html = input.renderSlide(slide, 'dark');
        } catch {
          html = null;
        }
      }
      rows.push({ n, title: slide === undefined ? `Slide ${n}` : slideTitle(slide, n), html });
    }
    return rows;
  }, [pptx, input]);

  const step2 = source !== null || pptx !== null;
  const back = () => {
    setSource(null);
    setPptx(null);
    setError(null);
  };
  const selectedCount = pptx !== null ? pickedIndexes.size : picked.size;

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
                onClick: back,
                control: 'dialog.importSlides.back',
                doc: 'Back to the list of presentations',
              },
              {
                label: DIALOGS.importSlides.ok,
                primary: true,
                disabled: busy || selectedCount === 0,
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
              <p>
                A PowerPoint file (.pptx), or a Turboslide bundle (.zip). Its slides are listed
                next.
              </p>
              <input
                type="file"
                accept={UPLOAD_ACCEPT}
                aria-label="Presentation file"
                data-control="dialog.importSlides.file"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (isPptxFile(file)) {
                    readPptx(file);
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
                    .catch(fail)
                    .finally(() => setBusy(false));
                }}
                {...tipProps({
                  name: 'Presentation file',
                  doc: 'A PowerPoint file (.pptx) or a Turboslide bundle (.zip); its slides are listed next',
                })}
              />
              {busy ? <p className="ts-dialog-empty">Reading the file…</p> : null}
            </>
          )}
        </>
      ) : pptx !== null ? (
        <>
          <div className="ts-dialog-code" role="group" aria-label="Selection">
            <span className="ts-dialog-row-title">{pptx.name}</span>
            <button
              type="button"
              className="pt-ib is-text"
              data-control="dialog.importSlides.all"
              onClick={() => setPickedIndexes(new Set(pptxRows.map((row) => row.n)))}
              {...tipProps({ name: DIALOGS.importSlides.all, doc: 'Selects every slide' })}
            >
              <span className="pt-lb">{DIALOGS.importSlides.all}</span>
            </button>
            <button
              type="button"
              className="pt-ib is-text"
              data-control="dialog.importSlides.none"
              onClick={() => setPickedIndexes(new Set())}
              {...tipProps({ name: DIALOGS.importSlides.none, doc: 'Clears the selection' })}
            >
              <span className="pt-lb">{DIALOGS.importSlides.none}</span>
            </button>
          </div>
          <p className="ts-import-notice" data-control="dialog.importSlides.report">
            {ROUND_FIVE.importSummary(
              pptx.report.summary.imported,
              pptx.report.summary.substituted,
              pptx.report.summary.dropped,
            )}
            {pptx.report.summary.substituted + pptx.report.summary.dropped > 0
              ? `. ${ROUND_FIVE.importNotice}`
              : ''}
          </p>
          <div
            className="ts-dialog-slides"
            role="listbox"
            aria-label="Slides"
            aria-multiselectable="true"
          >
            {pptxRows.map((row) => (
              <button
                key={row.n}
                type="button"
                role="option"
                aria-selected={pickedIndexes.has(row.n)}
                className={cn('ts-dialog-slide', pickedIndexes.has(row.n) && 'is-on')}
                data-control={`dialog.importSlides.index.${row.n}`}
                onClick={() => toggleIndex(row.n)}
                {...tipProps({
                  name: row.title,
                  doc: pickedIndexes.has(row.n)
                    ? 'Selected; click to leave it out'
                    : 'Click to select',
                })}
              >
                <span className="ts-dialog-slide-frame" data-theme="dark">
                  {row.html === null ? (
                    <span className="ts-pane-tile-plate">{row.n}</span>
                  ) : (
                    <LiveClone html={row.html} theme="dark" frame={false} />
                  )}
                </span>
                <span className="ts-dialog-slide-title">
                  {row.n}. {row.title}
                </span>
              </button>
            ))}
          </div>
          <label className="ts-import-check">
            <input
              type="checkbox"
              checked={keepTheme}
              data-control="dialog.importSlides.keepTheme"
              onChange={(event) => setKeepTheme(event.target.checked)}
              {...tipProps({
                name: 'Keep original theme',
                doc: 'The file’s theme joins In this presentation; off, the slides take this presentation’s theme',
              })}
            />
            <span>Keep original theme</span>
          </label>
        </>
      ) : source !== null ? (
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
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

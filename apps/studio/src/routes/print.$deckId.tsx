import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Link, createFileRoute, notFound } from '@tanstack/react-router';

import { PRESENT, SNACKBARS } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { Frame } from '@turboslide/viewer/Frame';
import { SHEET_H, SHEET_W, sheetSizeVars } from '@turboslide/viewer/model';
import type { PageSize, ViewerSlide } from '@turboslide/viewer/model';
import { applyThemeToTree } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';
import {
  NOTES_LEADING_PT,
  NOTES_SIZE_PT,
  estimateNotesLines,
  pageSlides,
  paperForLocale,
  printLayout,
  printPageCount,
  ptToPx,
} from '@turboslide/render/print-layout';
import type { PrintLayoutResult, PtBox } from '@turboslide/render/print-layout';
import type { Orientation, Paper, PrintLayout } from '@turboslide/schema/export';
import { PRINT_LAYOUTS, PRINT_LAYOUT_LABELS } from '@turboslide/schema/export';

import { useMountEffect } from '../components/useMountEffect';
import { getDeck } from '../server/decks';
import { AccessPage } from './-access-page';
import {
  EXPORT_POLL_MS,
  exportCapabilities,
  pollExport,
  startExport,
  syncExport,
} from '../server/download';
import type { StartExportInput } from '../server/download';
import { triggerDownload } from './decks.index';

import './print.css';

/**
 * Print settings and preview, /print/:deckId (gslides-parity SPEC 6.8; SPEC-5 6.2; R03 c.2
 * "Print preview toolbar"; R08 4): the deck as printed pages with Google's toolbar. Left, "Close
 * preview"; then the layout dropdown ("1 slide without notes", "1 slide with notes", the handouts
 * of 2, 3, 4, 6 and 9 per page), Orientation (Landscape, Portrait), a Paper dropdown (Letter,
 * A4; Letter under `en-US`, A4 elsewhere; a Turboslide row), "Include skipped slides" (off, SPEC
 * 7.2.1), "Hide background" (the light appearance on white, the paper ground and every background
 * colour removed); right, "Download as PDF" (`export.run` with format pdf and the layout fields
 * through the same server functions the editor's export uses) and "Print" (the browser's dialog
 * through `window.print()` with the paper's `@page`). The pages on screen are laid out by the same
 * `printLayout` the PDF prints from (`@turboslide/render/print-layout`): the slides on their own
 * paper for the one slide layout, the paper's cells with a hairline around every slide, the 3 per
 * page ruled lines, the notes page and the footer band for the rest. The route is the fallback of
 * SPEC 7.6 when the worker's PDF misses its gate: Print then Save as PDF in the browser's dialog.
 * The payload comes from `getDeck` with the notes and the skipped slides, so the toggles need no
 * refetch; a deck in the trash prints (its owner may want the paper before Delete forever).
 * `noindex` (routes/__root.tsx).
 */

/** The paper the dropdown offers (SPEC-5 6.2): Letter and A4; the slide's own page is the one slide layout's. */
type PaperChoice = Exclude<Paper, 'slide'>;

export type PrintSearch = {
  theme?: Theme;
  layout?: PrintLayout;
  paper?: PaperChoice;
  orientation?: Orientation;
  skipped?: 1;
  hidebg?: 1;
};

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function isFlag(value: unknown): boolean {
  return value === 1 || value === '1' || value === true;
}

export function validatePrintSearch(search: Record<string, unknown>): PrintSearch {
  const out: PrintSearch = {};
  if (isTheme(search.theme)) out.theme = search.theme;
  if (
    typeof search.layout === 'string' &&
    (PRINT_LAYOUTS as readonly string[]).includes(search.layout)
  )
    out.layout = search.layout as PrintLayout;
  if (search.paper === 'letter' || search.paper === 'a4') out.paper = search.paper;
  if (search.orientation === 'landscape' || search.orientation === 'portrait')
    out.orientation = search.orientation;
  if (isFlag(search.skipped)) out.skipped = 1;
  if (isFlag(search.hidebg)) out.hidebg = 1;
  return out;
}

/** The orientation a layout takes when the person named none (R08 4.4): landscape for the slides alone. */
function defaultOrientationOf(layout: PrintLayout): Orientation {
  return layout === 'slides' ? 'landscape' : 'portrait';
}

export const Route = createFileRoute('/print/$deckId')({
  validateSearch: validatePrintSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme }),
  loader: async ({ params, deps }) => {
    const payload = await getDeck({
      data: {
        deckId: params.deckId,
        theme: deps.theme,
        notes: true,
        includeSkipped: true,
        includeTrashed: true,
      },
    });
    if (!payload) throw notFound();
    return payload;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.deck.title}, print, Turboslide` : 'Print, Turboslide' },
    ],
  }),
  component: PrintPage,
  notFoundComponent: PrintMissing,
});

/** The layout rows of the dropdown: Google's seven strings (the handout strings are unverified; SPEC-5 6.2). */
const LAYOUTS: ReadonlyArray<{ value: PrintLayout; label: string }> = PRINT_LAYOUTS.map(
  (value) => ({
    value,
    label: PRINT_LAYOUT_LABELS[value],
  }),
);

/** The paper rows: Letter and A4 (a Turboslide dropdown, SPEC-5 6.2). */
const PAPERS_OFFERED: ReadonlyArray<{ value: PaperChoice; label: string }> = [
  { value: 'letter', label: 'Letter' },
  { value: 'a4', label: 'A4' },
];

/** Points to CSS px inside the on screen page box (the same 1 pt = 1/0.6 px the PDF document uses). */
function place(box: PtBox): { left: number; top: number; width: number; height: number } {
  return { left: ptToPx(box.x), top: ptToPx(box.y), width: ptToPx(box.w), height: ptToPx(box.h) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function PrintPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const { deckId } = Route.useParams();
  const snackbar = useSnackbar();
  const [layout, setLayout] = useState<PrintLayout>(search.layout ?? 'slides');
  const [paper, setPaper] = useState<PaperChoice>(
    search.paper ?? paperForLocale(typeof navigator === 'undefined' ? 'en-US' : navigator.language),
  );
  const [orientationChoice, setOrientation] = useState<Orientation | null>(
    search.orientation ?? null,
  );
  const [includeSkipped, setIncludeSkipped] = useState(search.skipped === 1);
  const [hideBackground, setHideBackground] = useState(search.hidebg === 1);
  const [pdf, setPdf] = useState<string | null>(null);
  /* Hide background prints the light appearance on white (SPEC-5 6.2) */
  const theme: Theme = hideBackground ? 'light' : (search.theme ?? 'dark');
  const skipped = useMemo(() => new Set(payload.skipped), [payload.skipped]);
  /* the deck's page (gslides-parity SPEC-5 6.1): every sheet's --k is its width over the page's; 1600 by 900 for a deck without one */
  const page: PageSize = payload.deck.page ?? { width: SHEET_W, height: SHEET_H };
  const orientation = orientationChoice ?? defaultOrientationOf(layout);
  const onPaper = layout !== 'slides' || orientationChoice !== null;

  const slides = useMemo(
    () => payload.deck.slides.filter((slide) => includeSkipped || !skipped.has(slide.id)),
    [payload.deck.slides, includeSkipped, skipped],
  );
  /* the page geometry the PDF prints from, laid out on screen (SPEC-5 6.2) */
  const geometry: PrintLayoutResult | null = useMemo(
    () => (onPaper ? printLayout({ page, layout, paper, orientation }) : null),
    [onPaper, page, layout, paper, orientation],
  );
  const pageCount = onPaper ? printPageCount(slides.length, layout) : slides.length;

  const downloadPdf = async () => {
    if (pdf !== null) return;
    const count = slides.length;
    setPdf(
      `Preparing your PDF, about ${Math.max(1, Math.ceil(count / 12))} minute${count > 12 ? 's' : ''} for ${count} slide${count === 1 ? '' : 's'}`,
    );
    /* the layout fields ride on export.run (SPEC-5 6.2); the one slide layout on the slide's own paper carries none */
    const input = {
      format: 'pdf' as const,
      slideIds: slides.map((slide) => slide.id),
      ...(onPaper ? { layout, paper, orientation } : {}),
      ...(hideBackground ? { hideBackground: true } : {}),
    };
    try {
      const caps = await exportCapabilities();
      let url: string | null = null;
      if (caps.sync) {
        const answer = await syncExport({ deckId, input: input as StartExportInput['input'] });
        url = answer.files.find((file) => file.name.endsWith('.pdf'))?.url ?? null;
      } else {
        const job = await startExport({ deckId, input: input as StartExportInput['input'] });
        for (;;) {
          const poll = await pollExport({ jobId: job.jobId });
          if (poll.status === 'failed') throw new Error(poll.error ?? 'the export failed');
          if (poll.status === 'done') {
            url = poll.downloads?.find((file) => file.name.endsWith('.pdf'))?.url ?? null;
            break;
          }
          await sleep(EXPORT_POLL_MS);
        }
      }
      if (url === null) throw new Error('the export produced no PDF');
      setPdf('Your file is ready');
      triggerDownload(url);
    } catch (error) {
      // the worker has no PDF builder yet, or the gate refused it: the browser's dialog stands in
      snackbar.show(`${SNACKBARS.pdfUnavailable} (${errorMessage(error)})`);
    } finally {
      window.setTimeout(() => setPdf(null), 1500);
    }
  };

  return (
    <main
      className="ts-print"
      data-layout={layout}
      data-paper={onPaper ? paper : 'slide'}
      data-orientation={orientation}
      data-theme={theme}
      data-hide-background={hideBackground ? '' : undefined}
      data-pages={pageCount}
      data-control="print.page"
      style={
        {
          /* the slide's own page for the print rules: inches and the 0.8 scaled CSS px box */
          '--ts-page-in-w': `${Math.round((page.width / 120) * 1000) / 1000}in`,
          '--ts-page-in-h': `${Math.round((page.height / 120) * 1000) / 1000}in`,
          '--ts-page-print-w': `${page.width * 0.8}px`,
          '--ts-page-print-h': `${page.height * 0.8}px`,
          ...(onPaper && geometry !== null
            ? {
                '--ts-paper-w': `${ptToPx(geometry.paperPt.width)}px`,
                '--ts-paper-h': `${ptToPx(geometry.paperPt.height)}px`,
              }
            : {}),
        } as React.CSSProperties
      }
    >
      {/* the paper's @page for the browser's print dialog: the slide's own page, or the paper in its orientation */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            onPaper && geometry !== null
              ? `@page { size: ${geometry.paperPt.width}pt ${geometry.paperPt.height}pt; margin: 0; }`
              : `@page { size: ${page.width * 0.6}pt ${page.height * 0.6}pt; margin: 0; }`,
        }}
      />
      {/* the theme's sprite once per document, so the frames' <use href="#gt-mark"> resolve (DeckViewer does the same) */}
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: payload.sprite }}
      />
      <header className="ts-print-bar" data-control="print.bar">
        <Link
          to="/edit/$deckId"
          params={{ deckId }}
          className="pt-ib is-text"
          data-control="print.close"
          {...tipProps({ name: 'Close preview', doc: 'Back to the editor.', key: 'Esc' })}
        >
          <span className="pt-lb">Close preview</span>
        </Link>
        <span className="ts-print-title">
          {/* the Turboslide mark at 20 px before the title (gslides-parity SPEC-4 1.10); the GT mark stays the theme's, on the sheet */}
          <TurboslideMark size={20} />
          <span>{payload.deck.title}</span>
        </span>
        <label className="ts-print-layout">
          <span className="ts-visually-hidden">Layout</span>
          <select
            value={layout}
            data-control="print.layout"
            onChange={(event) => {
              const next = event.target.value;
              if ((PRINT_LAYOUTS as readonly string[]).includes(next))
                setLayout(next as PrintLayout);
            }}
            {...tipProps({
              name: 'Layout',
              doc: 'One slide per page, one slide with its notes, or a handout of 2, 3, 4, 6 or 9 slides per page.',
            })}
          >
            {LAYOUTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ts-print-layout">
          <span className="ts-visually-hidden">Orientation</span>
          <select
            value={orientation}
            data-control="print.orientation"
            onChange={(event) =>
              setOrientation(event.target.value === 'portrait' ? 'portrait' : 'landscape')
            }
            {...tipProps({ name: 'Orientation', doc: 'The paper on its side, or upright.' })}
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
        <label className="ts-print-layout">
          <span className="ts-visually-hidden">Paper</span>
          <select
            value={paper}
            data-control="print.paper"
            disabled={!onPaper}
            onChange={(event) => setPaper(event.target.value === 'a4' ? 'a4' : 'letter')}
            {...tipProps({
              name: 'Paper',
              doc: onPaper
                ? 'Letter (8.5 by 11 in) or A4 (210 by 297 mm); Letter under en-US, A4 elsewhere.'
                : "The one slide layout prints on the slide's own page; pick an orientation or another layout for paper.",
            })}
          >
            {PAPERS_OFFERED.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="ts-print-check"
          {...tipProps({
            name: 'Include skipped slides',
            doc: `Prints the ${payload.skipped.length} skipped slide${payload.skipped.length === 1 ? '' : 's'} too.`,
          })}
        >
          <input
            type="checkbox"
            checked={includeSkipped}
            data-control="print.skipped"
            onChange={(event) => setIncludeSkipped(event.target.checked)}
          />
          <span className="ts-hm-dialog-box" aria-hidden="true" />
          <span>Include skipped slides</span>
        </label>
        <label
          className="ts-print-check"
          {...tipProps({
            name: 'Hide background',
            doc: 'Prints the light appearance on white with every background colour removed; pictures, the frame, the wordmark and the counter stay.',
          })}
        >
          <input
            type="checkbox"
            checked={hideBackground}
            data-control="print.hideBackground"
            onChange={(event) => setHideBackground(event.target.checked)}
          />
          <span className="ts-hm-dialog-box" aria-hidden="true" />
          <span>Hide background</span>
        </label>
        <span className="ts-print-spacer" />
        {pdf !== null ? (
          <span className="ts-print-progress" role="status">
            {pdf}
          </span>
        ) : null}
        <button
          type="button"
          className="pt-ib is-text"
          data-control="print.pdf"
          disabled={pdf !== null}
          onClick={() => void downloadPdf()}
          {...tipProps({
            name: 'Download as PDF',
            doc: onPaper
              ? `${PRINT_LAYOUT_LABELS[layout]} on ${paper === 'a4' ? 'A4' : 'Letter'} ${orientation}, ${pageCount} page${pageCount === 1 ? '' : 's'}.`
              : 'One slide per page, every slide shown here.',
          })}
        >
          <span className="pt-lb">Download as PDF</span>
        </button>
        <button
          type="button"
          className="pt-ib is-text is-solid"
          data-control="print.print"
          onClick={() => window.print()}
          {...tipProps({
            name: 'Print',
            doc: "The browser's print dialog; Save as PDF lives there too.",
            key: 'Cmd P',
          })}
        >
          <span className="pt-lb">Print</span>
        </button>
      </header>

      <section
        className="ts-print-pages"
        data-control="print.pages"
        data-count={slides.length}
        data-pages={pageCount}
      >
        {onPaper && geometry !== null
          ? Array.from({ length: pageCount }, (_, pageIndex) => (
              <PaperPage
                key={pageIndex}
                geometry={geometry}
                pageIndex={pageIndex}
                pageCount={pageCount}
                slides={pageSlides(
                  slides.map((slide) => slide.id),
                  geometry.perPage,
                  pageIndex,
                ).map((id) => slides.find((slide) => slide.id === id)!)}
                total={slides.length}
                theme={theme}
                page={page}
                title={payload.deck.title}
                skipped={skipped}
              />
            ))
          : slides.map((slide, index) => (
              <PrintPage1
                key={slide.id}
                slide={slide}
                index={index}
                total={slides.length}
                theme={theme}
                withNotes={false}
                skipped={skipped.has(slide.id)}
                page={page}
              />
            ))}
        {/* the fit before first paint (gslides-parity SPEC-3 9.2 R1): every sheet's --k from its own
            width as the parser reaches this script, so the server frame is already at scale and the
            observer above only follows resizes; the sheets suppress the hydration warning for it */}
        <script dangerouslySetInnerHTML={{ __html: printFitScript(page) }} />
      </section>
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}

function PrintPage1({
  slide,
  index,
  total,
  theme,
  withNotes,
  skipped,
  page,
}: {
  slide: ViewerSlide;
  index: number;
  total: number;
  theme: Theme;
  withNotes: boolean;
  skipped: boolean;
  page: PageSize;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  /* the sheet scales to its box on screen (--k = width / the page's width, 1600 on the default
     page); the print stylesheet fixes the box to the page and sets --k itself, since no observer
     runs inside the print layout */
  useMountEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w) el.style.setProperty('--k', String(w / page.width));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    if (body.current) applyThemeToTree(body.current, theme);
  }, [slide.html, theme]);

  return (
    <article
      className="ts-print-page"
      data-slide={slide.id}
      data-skipped={skipped ? '' : undefined}
      aria-label={`Slide ${index + 1}${skipped ? ', skipped' : ''}`}
    >
      <div ref={sheet} className="ts-print-sheet" suppressHydrationWarning>
        <div className="ts-sheet sheet" data-theme={theme} style={sheetSizeVars(page)}>
          <div className="ts-stage stage">
            <Frame index={index} total={total} />
            <div ref={body} className="pt-slide" dangerouslySetInnerHTML={{ __html: slide.html }} />
          </div>
        </div>
      </div>
      {withNotes ? (
        <div className="ts-print-notes" data-control={`print.notes.${slide.id}`}>
          <b>{PRESENT.notes}</b>
          <p>
            {slide.notes !== undefined && slide.notes.trim() !== '' ? slide.notes : PRESENT.noNotes}
          </p>
        </div>
      ) : null}
    </article>
  );
}

/**
 * One page of a paper layout on screen (SPEC-5 6.2; R08 4.5): the paper's box at 1 pt per 1/0.6
 * px, the cells with their slide boxes placed by `printLayout`, a hairline around every slide,
 * the 3 per page ruled lines, the notes text under the slide of the notes page (clipped at the
 * box, the clipped slide marked), and the footer band with the title and `n of m`.
 */
function PaperPage({
  geometry,
  pageIndex,
  pageCount,
  slides,
  total,
  theme,
  page,
  title,
  skipped,
}: {
  geometry: PrintLayoutResult;
  pageIndex: number;
  pageCount: number;
  slides: ViewerSlide[];
  total: number;
  theme: Theme;
  page: PageSize;
  title: string;
  skipped: Set<string>;
}) {
  return (
    <article
      className="ts-print-page ts-print-paper-page"
      data-page={pageIndex + 1}
      aria-label={`Page ${pageIndex + 1} of ${pageCount}`}
      style={{ width: ptToPx(geometry.paperPt.width), height: ptToPx(geometry.paperPt.height) }}
    >
      {slides.map((slide, cellIndex) => {
        const cell = geometry.cells[cellIndex];
        if (cell === undefined) return null;
        const k = ptToPx(cell.slide.w) / page.width;
        const notes = geometry.notes;
        const notesText = slide.notes ?? '';
        const clipped =
          notes !== undefined &&
          estimateNotesLines(notesText, notes.box.w, notes.sizePt) > notes.lines;
        return (
          <div key={slide.id} className="ts-print-cell" data-cell={cellIndex} data-slide={slide.id}>
            <div
              className="ts-print-cell-slide"
              data-skipped={skipped.has(slide.id) ? '' : undefined}
              style={{ ...place(cell.slide), '--k': String(k) } as React.CSSProperties}
            >
              <PaperSheet
                slide={slide}
                index={slide.n - 1}
                total={total}
                theme={theme}
                page={page}
              />
            </div>
            {cell.lines.map((line) => (
              <span
                key={line.y}
                className="ts-print-rule"
                style={{
                  left: ptToPx(line.x1),
                  top: ptToPx(line.y),
                  width: ptToPx(line.x2 - line.x1),
                }}
                aria-hidden="true"
              />
            ))}
            {notes !== undefined ? (
              <div
                className="ts-print-paper-notes"
                data-control={`print.notes.${slide.id}`}
                data-truncated={clipped ? '' : undefined}
                style={{
                  ...place(notes.box),
                  fontSize: ptToPx(NOTES_SIZE_PT),
                  lineHeight: `${ptToPx(NOTES_LEADING_PT)}px`,
                }}
              >
                {notesText.trim() !== '' ? notesText : PRESENT.noNotes}
              </div>
            ) : null}
          </div>
        );
      })}
      {geometry.footer !== undefined ? (
        <footer className="ts-print-footer" style={place(geometry.footer.box)}>
          <span className="ts-print-footer-title">{title}</span>
          <span className="ts-print-footer-count">
            {pageIndex + 1} of {pageCount}
          </span>
        </footer>
      ) : null}
    </article>
  );
}

/** A sheet inside a paper cell: the stage at the page's own pixels, scaled by the cell's --k. */
function PaperSheet({
  slide,
  index,
  total,
  theme,
  page,
}: {
  slide: ViewerSlide;
  index: number;
  total: number;
  theme: Theme;
  page: PageSize;
}) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (body.current) applyThemeToTree(body.current, theme);
  }, [slide.html, theme]);
  return (
    <div className="ts-print-cell-sheet" style={{ width: page.width, height: page.height }}>
      <div className="ts-sheet sheet" data-theme={theme} style={sheetSizeVars(page)}>
        <div className="ts-stage stage">
          <Frame index={index} total={total} />
          <div ref={body} className="pt-slide" dangerouslySetInnerHTML={{ __html: slide.html }} />
        </div>
      </div>
    </div>
  );
}

/**
 * The You need access page as the print route's `notFoundComponent` (gslides-parity SPEC-3 6.5,
 * 9.3; VERIFICATION-3 finding 53; the round four orchestrator's ruling 3, applied by the
 * integrator at merge 2 on build-4/b3.md R7): the loader answers null for a missing and a
 * restricted deck alike, so this page is the 404 body in both cases, in the server's HTML because
 * the print route stays full SSR.
 */
function PrintMissing() {
  const { deckId } = Route.useParams();
  return <AccessPage deckId={deckId} />;
}

/**
 * The inline fit (SPEC-3 9.2 R1): runs as the parser reaches it, before first paint, and writes
 * `--k` on every `.ts-print-sheet` from its width over the page's width (1600 px on the default
 * page), the same value the observer computes after hydration; a print layout ignores it
 * (`@media print` fixes `--k`).
 */
export function printFitScript(page: PageSize = { width: SHEET_W, height: SHEET_H }): string {
  return `(function(){try{var s=document.querySelectorAll('.ts-print-sheet');for(var i=0;i<s.length;i+=1){var w=s[i].clientWidth;if(w)s[i].style.setProperty('--k',String(w/${page.width}))}}catch(e){}})();`;
}

/** The inline fit of the default page. */
export const PRINT_FIT_SCRIPT = printFitScript();

/** The default page's aspect, exported for the stylesheet's page geometry comment. */
export const PRINT_SHEET = { width: SHEET_W, height: SHEET_H } as const;

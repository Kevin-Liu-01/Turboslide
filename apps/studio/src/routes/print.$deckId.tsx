import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

import { DialogCheck } from '@turboslide/chrome/Dialog';
import { DOWNLOAD_WORDS, downloadFromPage, fileNameOf } from '@turboslide/chrome/download';
import { PRESENT, SNACKBARS, STUB_PREFIX } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import type { FrameBand } from '@turboslide/render/stage';
import { bandForSlide } from '@turboslide/render/stage';
import { Frame } from '@turboslide/viewer/Frame';
import { SHEET_H, SHEET_W } from '@turboslide/viewer/model';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { applyThemeToTree } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import { useMountEffect } from '../components/useMountEffect';
import { getDeck } from '../server/decks';
import { AccessPage } from './-access-page';
import { REFUSED_PAGE, RouteRefused } from './-refused-page';
import {
  EXPORT_POLL_MS,
  exportCapabilities,
  pollExport,
  startExport,
  syncExport,
} from '../server/download';

import './print.css';

/**
 * Print settings and preview, /print/:deckId (gslides-parity SPEC 6.8; R03 c.2 "Print preview
 * toolbar"): the deck one sheet per page with Google's toolbar. Left, "Close preview"; then the
 * layout dropdown ("1 slide without notes", "1 slide with notes"; the handouts of 2, 3, 4, 6 and 9
 * per page are Later inside it), "Include skipped slides" (off, SPEC 7.2.1); right, "Download as
 * PDF" (the Download dialog's PDF path, `export.run` with format pdf through the same server
 * functions the editor's export uses) and "Print" (the browser's dialog through `window.print()`
 * with `@page { size: 13.333in 7.5in; margin: 0 }`). The route is the fallback of SPEC 7.6 when
 * the worker's PDF misses its gate: Print then Save as PDF in the browser's dialog. The payload
 * comes from `getDeck` with the notes and the skipped slides, so both toggles need no refetch;
 * a deck in the trash prints (its owner may want the paper before Delete forever). `noindex`
 * (routes/__root.tsx).
 */

type PrintLayout = 'slides' | 'notes';

export type PrintSearch = { theme?: Theme; layout?: PrintLayout; skipped?: 1 };

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function validatePrintSearch(search: Record<string, unknown>): PrintSearch {
  const out: PrintSearch = {};
  if (isTheme(search.theme)) out.theme = search.theme;
  if (search.layout === 'notes') out.layout = 'notes';
  if (search.skipped === 1 || search.skipped === '1' || search.skipped === true) out.skipped = 1;
  return out;
}

/** True for the store's "not now" answers (packages/store/src/pulse.ts isStoreBusy's words). */
export function isBusyRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /too many requests|currently not available|failed to fetch blob|fetch failed|network|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|did not answer|store is busy/i.test(
    message,
  );
}

/** The pauses before the loader's second and third read of a busy store. */
export const PRINT_READ_RETRY_MS: ReadonlyArray<number> = [400, 900];

/**
 * The deck for the print page (docs/archive/rounds/POLISH.md item 83): the same read the viewer routes make,
 * tried again twice when the store answers "not now" (a 429, a deadline: the polish audit met the
 * refusal on a deck four writes old and the page drew the error card at once), so the preview
 * opens on the head the editor holds; a refusal that stands is the route's own page with Reload
 * (PrintRefused), never an aborted document.
 */
async function readPrintDeck(
  deckId: string,
  theme: Theme | undefined,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getDeck({
        data: { deckId, theme, notes: true, includeSkipped: true, includeTrashed: true },
      });
    } catch (error) {
      const wait = PRINT_READ_RETRY_MS[attempt];
      if (wait === undefined || !isBusyRefusal(error)) throw error;
      await sleep(wait);
    }
  }
}

export const Route = createFileRoute('/print/$deckId')({
  validateSearch: validatePrintSearch,
  loaderDeps: ({ search }) => ({ theme: search.theme }),
  loader: async ({ params, deps }) => {
    const payload = await readPrintDeck(params.deckId, deps.theme);
    if (!payload) throw notFound();
    return payload;
  },
  errorComponent: PrintRefused,
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.deck.title}, print, Turboslide` : 'Print, Turboslide' },
    ],
  }),
  component: PrintPage,
  notFoundComponent: PrintMissing,
});

/** The layout options of the dropdown; the handouts are present and disabled (Later). */
const LAYOUTS: ReadonlyArray<{ value: string; label: string; later?: true }> = [
  { value: 'slides', label: '1 slide without notes' },
  { value: 'notes', label: '1 slide with notes' },
  { value: 'handout-2', label: 'Handout (2 slides per page)', later: true },
  { value: 'handout-3', label: 'Handout (3 slides per page)', later: true },
  { value: 'handout-4', label: 'Handout (4 slides per page)', later: true },
  { value: 'handout-6', label: 'Handout (6 slides per page)', later: true },
  { value: 'handout-9', label: 'Handout (9 slides per page)', later: true },
];

const HANDOUT_STUB = `${STUB_PREFIX}. Handouts need a page layout the renderer does not have`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function PrintPage() {
  const payload = Route.useLoaderData();
  const search = Route.useSearch();
  const { deckId } = Route.useParams();
  const snackbar = useSnackbar();
  const [layout, setLayout] = useState<PrintLayout>(search.layout ?? 'slides');
  const [includeSkipped, setIncludeSkipped] = useState(search.skipped === 1);
  const [pdf, setPdf] = useState<string | null>(null);
  /* the deck's own appearance unless the address names one (docs/archive/rounds/POLISH.md item 77): the preview
     drew every light deck as black pages while the PDF it downloaded was light */
  const theme: Theme = search.theme ?? payload.theme;
  const skipped = useMemo(() => new Set(payload.skipped), [payload.skipped]);
  /* the page announces hydration (`data-hydrated`, the home page's convention): the server
     renders the bar, and a click on Include skipped slides before React attaches its handler
     toggles nothing, so a driver waits for the mark (core/export.spec.ts, the integrator) */
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  }, []);

  const slides = useMemo(
    () => payload.deck.slides.filter((slide) => includeSkipped || !skipped.has(slide.id)),
    [payload.deck.slides, includeSkipped, skipped],
  );

  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdf(DOWNLOAD_WORDS.preparing('pdf'));
    /* the file follows the preview (docs/FOCUS.md rank 25, `export.print.download-pdf-follows-preview`):
       the builder drops a skipped slide unless `includeSkipped` travels, whatever `slideIds` says
       (packages/render/src/print.ts `renderPrintDocument`), and the notes layout asks for the notes
       with `includeNotes` (the builder carries them once it draws the notes page) */
    const input = {
      format: 'pdf' as const,
      theme: [theme],
      slideIds: slides.map((slide) => slide.id),
      ...(includeSkipped ? { includeSkipped: true } : {}),
      ...(layout === 'notes' ? { includeNotes: true } : {}),
    };
    try {
      const caps = await exportCapabilities();
      let url: string | null = null;
      if (caps.sync) {
        const answer = await syncExport({ deckId, input });
        url = answer.files.find((file) => file.name.endsWith('.pdf'))?.url ?? null;
      } else {
        const job = await startExport({ deckId, input });
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
      /* the file is named after the title, and the button is live again the moment the file is
         saved (docs/archive/rounds/POLISH.md items 83 and 86; audit-pages item 39) */
      const name = fileNameOf(payload.deck.title, deckId, 'pdf');
      const saved = await downloadFromPage(url, { name });
      setPdf(null);
      snackbar.show(DOWNLOAD_WORDS.saved(saved?.name ?? name));
    } catch (error) {
      // the worker has no PDF builder yet, or the gate refused it: the browser's dialog stands in
      console.error('turboslide print: the PDF export was refused', error);
      setPdf(null);
      snackbar.show(SNACKBARS.pdfUnavailable);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <main
      ref={root}
      className="ts-print"
      data-layout={layout}
      data-theme={theme}
      data-control="print.page"
    >
      {/* the theme's sprite once per document, so the frames' <use href="#gt-mark"> resolve (DeckViewer does the same) */}
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: payload.sprite }}
      />
      <header className="ts-print-bar" data-control="print.bar">
        {/* Close preview runs no route view transition (docs/FOCUS.md rank 37,
            `export.print.file-menu-after-close`; VERIFICATION C2-F25): while a view transition
            is active the browser hit tests the `::view-transition` pseudo tree and not the live
            document, so a click on the editor's File title in the window after the editor paints
            reaches nothing (measured on 4381: `:active-view-transition` true at the click,
            `elementFromPoint` the root element, `::view-transition-new(pt-stage)` running for the
            enter duration after its 60 ms delay; `pointer-events: none` on the pseudo tree does
            not restore the hit test). The editor's chrome is the same frame the print bar left,
            so the return is a cut and the first click lands. */}
        <Link
          to="/edit/$deckId"
          params={{ deckId }}
          viewTransition={false}
          className="pt-ib is-text"
          data-control="print.close"
          {...tipProps({ name: 'Close preview', doc: 'Back to the editor.', key: 'Esc' })}
        >
          <span className="pt-lb">Close preview</span>
        </Link>
        <span className="ts-print-title">
          {/* the Turboslide mark at 20 px before the title (gslides-parity SPEC-4 1.10); the GT mark stays the theme's, on the sheet */}
          <TurboslideMark size={24} />
          <span>{payload.deck.title}</span>
        </span>
        <label className="ts-print-layout">
          <span className="ts-visually-hidden">Layout</span>
          <select
            value={layout}
            data-control="print.layout"
            onChange={(event) => setLayout(event.target.value === 'notes' ? 'notes' : 'slides')}
            {...tipProps({
              name: 'Layout',
              doc: `One slide per page, with or without its speaker notes. ${HANDOUT_STUB}.`,
            })}
          >
            {LAYOUTS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.later}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {/* the chrome's DialogCheck (docs/archive/rounds/POLISH.md item 83; audit-pages item 39): a tick in the
            box, not a filled square */}
        <DialogCheck
          label="Include skipped slides"
          checked={includeSkipped}
          onChange={setIncludeSkipped}
          control="print.skipped"
          doc={`Prints the ${payload.skipped.length} skipped slide${payload.skipped.length === 1 ? '' : 's'} too`}
        />
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
          disabled={pdfBusy}
          onClick={() => void downloadPdf()}
          {...tipProps({
            name: 'Download as PDF',
            doc: 'One slide per page, every slide shown here.',
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

      <section className="ts-print-pages" data-control="print.pages" data-count={slides.length}>
        {slides.map((slide, index) => (
          <PrintPage1
            key={slide.id}
            slide={slide}
            index={index}
            total={slides.length}
            theme={theme}
            withNotes={layout === 'notes'}
            skipped={skipped.has(slide.id)}
            {...(payload.deck.band === undefined ? {} : { band: payload.deck.band })}
          />
        ))}
        {/* the fit before first paint (gslides-parity SPEC-3 9.2 R1): every sheet's --k from its own
            width as the parser reaches this script, so the server frame is already at scale and the
            observer above only follows resizes; the sheets suppress the hydration warning for it */}
        <script dangerouslySetInnerHTML={{ __html: PRINT_FIT_SCRIPT }} />
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
  band,
}: {
  slide: ViewerSlide;
  index: number;
  total: number;
  theme: Theme;
  /** the brand kit's frame band (docs/archive/rounds/PRODUCT.md 4.1) */
  band?: FrameBand;
  withNotes: boolean;
  skipped: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  /* the sheet scales to its box on screen (--k = width / 1600); the print stylesheet fixes the
     box to the page and sets --k itself, since no observer runs inside the print layout */
  useMountEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w) el.style.setProperty('--k', String(w / SHEET_W));
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
        <div className="ts-sheet sheet" data-theme={theme}>
          <div className="ts-stage stage">
            <Frame
              index={index}
              total={total}
              counter={slide.counter ?? true}
              {...(band === undefined ? {} : { band: bandForSlide(band, slide) })}
            />
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

/** The route's refusal (item 83): the product's page with Reload, in place of an aborted document. */
function PrintRefused({ error }: ErrorComponentProps) {
  return (
    <RouteRefused
      error={error}
      loaderHeading={REFUSED_PAGE.notOpened}
      renderHeading={REFUSED_PAGE.notOpened}
    />
  );
}

/**
 * The inline fit (SPEC-3 9.2 R1): runs as the parser reaches it, before first paint, and writes
 * `--k` on every `.ts-print-sheet` from its width over the sheet's 1600 px, the same value the
 * observer computes after hydration; a print layout ignores it (`@media print` fixes `--k`).
 */
export const PRINT_FIT_SCRIPT = `(function(){try{var s=document.querySelectorAll('.ts-print-sheet');for(var i=0;i<s.length;i+=1){var w=s[i].clientWidth;if(w)s[i].style.setProperty('--k',String(w/${SHEET_W}))}}catch(e){}})();`;

/** The sheet's aspect, exported for the stylesheet's page geometry comment. */
export const PRINT_SHEET = { width: SHEET_W, height: SHEET_H } as const;

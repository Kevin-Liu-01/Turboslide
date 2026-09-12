// export.run for PDF (gslides-parity SPEC 7.6): the deck's print document (the render package's
// renderPrintDocument: one 960 by 540 pt page per slide, PowerPoint's 13.333 by 7.5 in, margin 0,
// the skipped slides removed unless asked, notes never, one appearance from `defaults.appearance`
// or the caller) printed by Chromium through `page.pdf({ preferCSSPageSize: true, printBackground:
// true, scale: 0.8 })` in the headless package, so the text stays vector and searchable and the
// pictures travel at their twin size. The gate: where poppler exists, `pdftoppm` (pdftocairo when
// it is the one present) rasterizes each page at 3200 by 1800 and pixelmatch at threshold 0.1
// diffs it against the web render of the same slide at 2x, shot from the render surface in the
// same browser. Everything the browser draws itself (text, rules, plates, shapes, the frame) is
// gated: a page at or under the flatten budget (0.1 percent) is the target, a page between 0.1 and
// 0.5 percent ships with the worst page named in the report, a page over 0.5 percent fails the
// export (`passed` false). The pictures (img, canvas and raster elements) are compared separately
// and reported, never gated: the PDF holds the picture bytes and every viewer resamples them with
// its own filter (measured on the GT deck: a dither canvas 9 percent, a downscaled screenshot 2 to
// 6 percent between poppler and Chromium, where the text around them sits at 0.02), the same
// reading the flatten loop gives regenerated pictures (SPEC 8.5). Without poppler the gate is the
// page count. The report is an ExportReport (format `pdf`, mode `flatten`: a PDF page is one flat
// page) so the worker, the studio and the MCP tool read it like a PPTX report: `files[].bytes` is
// the size, `slides.length` the pages, each slide's `verify` the page's mismatch outside its
// pictures and `pictureFraction` inside them, and `residual` names the rasterizer, the budget and
// the worst page.
//
// SPEC 7.6 names `pdftoppm -r 144`; the diff needs the page on the same pixel grid as the 2x
// render, so the rasterizer runs with `-scale-to-x 3200 -scale-to-y 1800` (240 dpi on this page)
// instead, and the report says which binary ran. That reading, the picture regions and the print
// scale are recorded for Kevin in docs/gslides-parity/build/b2.md.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { promisify } from 'node:util';

import { BAYER8 } from '@turboslide/effects/bayer';
import { openSheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import type { LaunchedBrowser } from '@turboslide/headless/launch';
import { pdfPageCount, pdfPageSize, printPdf } from '@turboslide/headless/pdf';
import { waitForReady } from '@turboslide/headless/ready';
import { renderDeck } from '@turboslide/render/deck';
import { PRINT_PAGE_PT, PRINT_SCALE, renderPrintDocument } from '@turboslide/render/print';
import { loadThemeBundle } from '@turboslide/render/theme-node';
import type { DeckDocument } from '@turboslide/schema/deck';
import { deckAppearance, slideTitle } from '@turboslide/schema/deck';
import type { ExportReport } from '@turboslide/schema/export';
import { PAGE_RASTER_BUDGETS, exportReportSchema } from '@turboslide/schema/export';
import type { Box, Theme } from '@turboslide/schema/render';

import { playList } from '../export-pptx.ts';
import { fileEntry } from '../report.ts';
import { READY_SELECTOR } from '../scene/extract.ts';
import { diffImagesOutside, readPng, writePng } from '../verify/diff.ts';
import { resolveTools, toolVersions } from '../verify/libreoffice.ts';
import type { ToolPaths } from '../verify/libreoffice.ts';

const execFileAsync = promisify(execFile);

/** The PDF gate of SPEC 7.6: the target per page, and the fraction above which the export fails. */
export const PDF_GATE = {
  /** pixelmatch threshold, the flatten loop's. */
  threshold: PAGE_RASTER_BUDGETS.threshold,
  /** A page at or under this ships silently: the flatten budget. */
  target: 0.001,
  /** A page over this fails the export; between the two the worst page is named. */
  fail: 0.005,
} as const;

/** The pages are compared at the 2x render's size. */
export const PDF_RASTER = { width: 3200, height: 1800, dpi: 240, scale: 2 } as const;

export type ExportPdfOptions = {
  deckDir: string;
  document: DeckDocument;
  outDir: string;
  /** The appearance; the deck's `defaults.appearance` when absent. */
  theme?: Theme;
  /** A subset of the play list, in deck order. */
  slideIds?: string[];
  /** Carry the skipped slides too; left out by default (SPEC 7.2.1). */
  includeSkipped?: boolean;
  /** Run the raster gate where poppler exists; the page count gate otherwise. Default off. */
  verify?: boolean;
  /** A launched browser to run on, which the caller closes; default launchBrowser(), closed here. */
  browser?: LaunchedBrowser;
  tools?: ToolPaths;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  onPage?: (page: PdfPageResult) => void;
};

export type PdfPageVerify = {
  /** Mismatched pixels outside the picture regions, and their fraction of those pixels. */
  mismatch: number;
  fraction: number;
  /** Inside the picture regions: reported, never gated. */
  pictureMismatch: number;
  pictureFraction: number;
  /** The picture regions in 2x pixels. */
  pictures: Box[];
  ref: string;
  got: string;
  diff: string;
};

export type PdfPageResult = {
  slideId: string;
  n: number;
  page: number;
  /** The raster gate's result, when it ran. */
  verify?: PdfPageVerify;
};

export type ExportPdfResult = {
  path: string;
  bytes: number;
  pages: number;
  /** The first page's size in points, read from the file. */
  pageSize: { width: number; height: number } | null;
  theme: Theme;
  slides: PdfPageResult[];
  omitted: string[];
  report: ExportReport;
  reportPath: string;
  /** Which gate ran: the raster diff through poppler, or the page count alone. */
  gate: 'raster' | 'pages';
  rasterizer: 'pdftoppm' | 'pdftocairo' | null;
  renderer: string;
  passed: boolean;
  ms: number;
};

/** Which poppler rasterizer answers on this machine: pdftoppm first (SPEC 7.6), else pdftocairo. */
export async function pdfRasterizer(tools: ToolPaths): Promise<'pdftoppm' | 'pdftocairo' | null> {
  const versions = await toolVersions(tools);
  if (versions.pdftoppm) return 'pdftoppm';
  if (versions.pdftocairo) return 'pdftocairo';
  return null;
}

/** `pdftoppm -png -r 240 -scale-to-x 3200 -scale-to-y 1800 <pdf> <dir>/page`: one PNG per page in order. */
export async function rasterizePdf(
  pdf: string,
  outDir: string,
  rasterizer: 'pdftoppm' | 'pdftocairo',
  tools: ToolPaths,
  log?: (line: string) => void,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const args = [
    '-png',
    '-r',
    String(PDF_RASTER.dpi),
    '-scale-to-x',
    String(PDF_RASTER.width),
    '-scale-to-y',
    String(PDF_RASTER.height),
    pdf,
    join(outDir, 'page'),
  ];
  const bin = rasterizer === 'pdftoppm' ? tools.pdftoppm : tools.pdftocairo;
  log?.(`pdf: ${bin} ${args.join(' ')}`);
  await execFileAsync(bin, args, { timeout: 600_000 });
  return (await readdir(outDir))
    .map((name) => ({ name, match: /^page-(\d+)\.png$/.exec(name) }))
    .filter((e): e is { name: string; match: RegExpExecArray } => e.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map((e) => join(outDir, e.name));
}

export async function exportPdf(options: ExportPdfOptions): Promise<ExportPdfResult> {
  const started = performance.now();
  const log = options.log ?? (() => {});
  const { deck, slides } = options.document;
  const theme = options.theme ?? deckAppearance(deck);
  await mkdir(options.outDir, { recursive: true });
  const bundle = loadThemeBundle();
  const assetBase = fileUrl(options.deckDir, true);
  const { play, ids, omitted } = playList(options.document, options);
  if (ids.length === 0) throw new RangeError('exportPdf: every selected slide is skipped');
  const printed = renderPrintDocument(deck, Object.values(slides), {
    theme,
    bundle,
    slideIds: ids,
    includeSkipped: options.includeSkipped,
    assetBase,
    title: `${deck.title} (${theme})`,
  });
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-pdf-'));
  const path = join(options.outDir, `${deck.id}-${theme}.pdf`);
  const pages: PdfPageResult[] = printed.slides.map((entry, index) => ({
    slideId: entry.slideId,
    n: entry.n,
    page: index + 1,
  }));
  const residual: string[] = [];
  let gate: ExportPdfResult['gate'] = 'pages';
  let rasterizer: ExportPdfResult['rasterizer'] = null;
  let renderer = '';
  let bytes = 0;
  let count = 0;
  let pageSize: ExportPdfResult['pageSize'] = null;
  try {
    const doc = await writeTempDocument(printed.html, `print-${theme}.html`, tmp);
    const launched = options.browser ?? (await launchBrowser());
    renderer = launched.renderer;
    try {
      // the print page: 1x, the sheet's own grid; the printer scales the page (PRINT_SCALE)
      const printPage = await openSheetPage(launched.browser, { theme, scale: 1 });
      try {
        const result = await printPdf(printPage.page, {
          url: doc.url,
          path,
          bayerTable: BAYER8.flat(),
          theme,
          scale: PRINT_SCALE,
        });
        bytes = result.bytes;
        log(
          `pdf: ${basename(path)} ${bytes} bytes, ${printed.pages} page(s), fonts ${result.ready.fonts.status}, ${result.ms} ms`,
        );
      } finally {
        await printPage.close();
      }
      count = await pdfPageCount(path);
      pageSize = await pdfPageSize(path);
      if (options.verify) {
        const tools = options.tools ?? resolveTools(options.env);
        rasterizer = await pdfRasterizer(tools);
        if (rasterizer === null) {
          residual.push(
            'pdf gate: neither pdftoppm nor pdftocairo is on this machine; the page count is the gate (install poppler for the raster diff of SPEC 7.6)',
          );
        } else {
          gate = 'raster';
          await gatePages({
            pdf: path,
            pages,
            document: options.document,
            play,
            ids,
            theme,
            bundle,
            assetBase,
            launched,
            outDir: join(options.outDir, 'pdf-verify'),
            tmp,
            rasterizer,
            tools,
            log,
            onPage: options.onPage,
          });
        }
      }
    } finally {
      if (!options.browser) await launched.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  if (gate === 'pages') for (const page of pages) options.onPage?.(page);

  // The gate's verdict (SPEC 7.6): the pages outside their pictures.
  const measured = pages.filter((p) => p.verify !== undefined);
  const fractionOf = (p: PdfPageResult): number => p.verify?.fraction ?? 0;
  const worst = measured.reduce<PdfPageResult | undefined>(
    (best, p) => (best === undefined || fractionOf(p) > fractionOf(best) ? p : best),
    undefined,
  );
  const overFail = measured.filter((p) => fractionOf(p) > PDF_GATE.fail);
  const overTarget = measured.filter((p) => fractionOf(p) > PDF_GATE.target);
  const withPictures = measured.filter((p) => (p.verify?.pictures.length ?? 0) > 0);
  const worstPicture = withPictures.reduce<PdfPageResult | undefined>(
    (best, p) =>
      best === undefined || (p.verify?.pictureFraction ?? 0) > (best.verify?.pictureFraction ?? 0)
        ? p
        : best,
    undefined,
  );
  const pagesMatch = count === printed.pages;
  const passed = pagesMatch && overFail.length === 0;
  residual.push(`renderer: ${renderer}`);
  residual.push(
    `pdf: ${printed.pages} page(s) at ${PRINT_PAGE_PT.width} by ${PRINT_PAGE_PT.height} pt (13.333 by 7.5 in), ${bytes} bytes, ${theme}; the text is vector and searchable; notes never travel`,
  );
  residual.push(
    pagesMatch
      ? `pdf gate: the file holds ${count} page(s) for ${printed.pages} slide(s)`
      : `pdf gate: the file holds ${count} page(s) for ${printed.pages} slide(s); the counts differ`,
  );
  if (pageSize)
    residual.push(`pdf: the first page measures ${pageSize.width} by ${pageSize.height} pt`);
  residual.push(
    omitted.length > 0
      ? `skipped: ${omitted.length} slide(s) left out (${omitted.join(', ')}); pass includeSkipped to carry them`
      : 'skipped: none; every slide of the deck is in the file',
  );
  if (gate === 'raster' && rasterizer) {
    residual.push(
      `pdf gate: ${rasterizer} at ${PDF_RASTER.width} by ${PDF_RASTER.height} against the 2x web render, pixelmatch threshold ${PDF_GATE.threshold}, the picture regions (img, canvas, raster elements) compared separately; target ${PDF_GATE.target * 100} percent per page, fail over ${PDF_GATE.fail * 100}; ${measured.length} page(s) measured, ${overTarget.length} over the target, ${overFail.length} over the fail line`,
    );
    if (worst?.verify)
      residual.push(
        `pdf gate: worst page ${worst.page} (${worst.slideId}) at ${(worst.verify.fraction * 100).toFixed(3)} percent outside its pictures${worst.verify.fraction > PDF_GATE.target ? (worst.verify.fraction > PDF_GATE.fail ? ', over the fail line' : ', ships with this note') : ''}`,
      );
    if (worstPicture?.verify)
      residual.push(
        `pdf pictures: ${withPictures.length} page(s) carry pictures; inside their boxes the worst is page ${worstPicture.page} (${worstPicture.slideId}) at ${(worstPicture.verify.pictureFraction * 100).toFixed(3)} percent (informational: the file holds the picture bytes and a viewer resamples them with its own filter)`,
      );
  }
  const report = exportReportSchema.parse({
    deckId: deck.id,
    revision: deck.revision,
    format: 'pdf',
    mode: 'flatten',
    theme,
    fontSet: 'exact',
    fontSetVersion: 'inter-variable',
    files: [fileEntry(path)],
    fonts: { embedded: ['Inter'], requiredOnViewer: [], substitutedIn: [] },
    slides: pages.map((page) => ({
      slideId: page.slideId,
      theme,
      native: [],
      raster: [],
      ...(page.verify
        ? {
            verify: {
              mismatch: page.verify.mismatch,
              fraction: page.verify.fraction,
              scale: PDF_RASTER.scale,
              ...(page.verify.pictures.length > 0
                ? {
                    pictureMismatch: page.verify.pictureMismatch,
                    pictureFraction: page.verify.pictureFraction,
                  }
                : {}),
              blocks: [],
              ref: page.verify.ref,
              got: page.verify.got,
              diff: page.verify.diff,
            },
          }
        : {}),
    })),
    geometryInBounds: true,
    perfect: gate === 'raster' && measured.length === pages.length && overTarget.length === 0,
    passed,
    residual,
  } satisfies ExportReport);
  const reportPath = join(options.outDir, 'export-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    path,
    bytes,
    pages: count,
    pageSize,
    theme,
    slides: pages,
    omitted,
    report,
    reportPath,
    gate,
    rasterizer,
    renderer,
    passed,
    ms: Math.round(performance.now() - started),
  };
}

type GateInput = {
  pdf: string;
  pages: PdfPageResult[];
  document: DeckDocument;
  play: string[];
  ids: string[];
  theme: Theme;
  bundle: ReturnType<typeof loadThemeBundle>;
  assetBase: string;
  launched: LaunchedBrowser;
  outDir: string;
  tmp: string;
  rasterizer: 'pdftoppm' | 'pdftocairo';
  tools: ToolPaths;
  log: (line: string) => void;
  onPage?: (page: PdfPageResult) => void;
};

/**
 * The raster gate: each PDF page through poppler at 3200 by 1800, each slide shot at 2x from the
 * render surface in the same browser (the flatten export's own reference), pixelmatch between
 * them outside the slide's picture boxes, and the boxes measured on their own.
 */
async function gatePages(input: GateInput): Promise<void> {
  const { deck, slides } = input.document;
  await mkdir(input.outDir, { recursive: true });
  const rasterDir = join(input.outDir, 'pages');
  await rm(rasterDir, { recursive: true, force: true });
  const rendered = await rasterizePdf(
    input.pdf,
    rasterDir,
    input.rasterizer,
    input.tools,
    input.log,
  );
  // the reference: the render surface at 2x, one slide at a time by hash
  const surface = renderDeck(deck, Object.values(slides), {
    theme: input.theme,
    bundle: input.bundle,
    chrome: true,
    assetBase: input.assetBase,
    blockAttrs: false,
    gtWord: true,
    present: true,
    slideIds: input.ids,
    numbering: input.play,
    title: `${deck.title} (${input.theme})`,
  });
  const doc = await writeTempDocument(surface.html, `surface-${input.theme}.html`, input.tmp);
  const shotPage = await openSheetPage(input.launched.browser, {
    theme: input.theme,
    scale: PDF_RASTER.scale,
  });
  const refDir = join(input.outDir, 'reference');
  await mkdir(refDir, { recursive: true });
  try {
    for (const page of input.pages) {
      const got = rendered[page.page - 1];
      if (!got) continue;
      const hash = `s/${encodeURIComponent(page.slideId)}`;
      if (shotPage.page.url().split('#')[0] === doc.url) {
        await shotPage.page.evaluate((h) => {
          document.documentElement.removeAttribute('data-ts-ready');
          location.hash = h;
        }, hash);
      } else {
        await shotPage.page.goto(`${doc.url}#${hash}`, { waitUntil: 'load' });
      }
      await shotPage.page.waitForSelector(READY_SELECTOR, { state: 'attached', timeout: 20_000 });
      await waitForReady(shotPage.page);
      // the picture boxes of the shown slide, in 2x pixels: every image, canvas and raster element
      const pictures = (
        await shotPage.page.evaluate((k: number) => {
          const els = document.querySelectorAll<HTMLElement>(
            '.slide.is-on img, .slide.is-on canvas, .slide.is-on [data-raster]',
          );
          const out: [number, number, number, number][] = [];
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            out.push([
              Math.floor(r.left * k),
              Math.floor(r.top * k),
              Math.ceil(r.width * k) + 1,
              Math.ceil(r.height * k) + 1,
            ]);
          }
          return out;
        }, PDF_RASTER.scale)
      ).map((box): Box => [box[0], box[1], box[2], box[3]]);
      const nn = String(page.page).padStart(2, '0');
      const refPath = join(refDir, `${nn}-${page.slideId}@2x.png`);
      await shotPage.page.screenshot({
        path: refPath,
        type: 'png',
        clip: { x: 0, y: 0, width: 1600, height: 900 },
        animations: 'disabled',
        caret: 'hide',
      });
      const ref = await readPng(refPath);
      const pageImage = await readPng(got);
      const diff = diffImagesOutside(ref, pageImage, pictures, PDF_GATE.threshold);
      const diffPath = join(input.outDir, `${nn}-${page.slideId}.diff.png`);
      await writePng(diffPath, diff.diff);
      page.verify = {
        mismatch: diff.mismatch,
        fraction: diff.fraction,
        pictureMismatch: diff.inside.mismatch,
        pictureFraction: diff.inside.total === 0 ? 0 : diff.inside.mismatch / diff.inside.total,
        pictures,
        ref: relative(input.outDir, refPath),
        got: relative(input.outDir, got),
        diff: relative(input.outDir, diffPath),
      };
      input.log(
        `  ${nn} ${page.slideId} ${(diff.fraction * 100).toFixed(3)} percent${pictures.length > 0 ? `, pictures ${(page.verify.pictureFraction * 100).toFixed(3)} percent in ${pictures.length} box(es)` : ''}${diff.fraction > PDF_GATE.fail ? ' FAIL' : diff.fraction > PDF_GATE.target ? ' over target' : ''}`,
      );
      input.onPage?.(page);
    }
  } finally {
    await shotPage.close();
  }
}

/** True when poppler can rasterize on this machine (the gate of SPEC 7.6 can run). */
export async function pdfGateAvailable(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await pdfRasterizer(resolveTools(env))) !== null;
}

/** The slide titles of a PDF's pages, for a caller listing them. */
export function pdfPageTitles(document: DeckDocument, pages: readonly PdfPageResult[]): string[] {
  return pages.map((page) => {
    const slide = document.slides[page.slideId];
    return slide ? slideTitle(slide, page.n) : page.slideId;
  });
}

export { existsSync as pdfExists };

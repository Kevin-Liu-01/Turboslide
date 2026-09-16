// renderPrintDocument: the deck as printed pages for print and PDF (gslides-parity SPEC 6.8, 7.6;
// SPEC-5 6.2). The one slide layout on the slide's own paper is today's document: every page is a
// 0.6W by 0.6H pt box (960 by 540 pt on the GT sheet, PowerPoint's 13.333 by 7.5 in page, `@page`
// with no margin) holding one stage of the sheet, the frame, the wordmark and the counter at the
// sheet's own pixels, which the printer scales by PRINT_SCALE onto the page so the vector text and
// the pictures fill it edge to edge; `slides` on `paper: 'slide'` is byte identical to what it was
// before the layouts. Every other layout is a printout on Letter or A4 in either orientation laid
// out by `printLayout` (print-layout.ts; R08 4.5): the handout cells with their slides contained
// and centred, a hairline around every slide, the 3 per page ruled lines, the notes page with the
// slide over its notes at 11 pt on 16.5 pt leading (clipped, the slide named in `truncatedNotes`),
// the footer band with the deck title and `n of m`, and Hide background (the light appearance on
// white, the paper ground and every background colour removed, the pictures kept). The paper's
// box is `pt / 0.6` CSS px so the same PRINT_SCALE 0.8 lands it on the paper. The play list is the
// deck without its skipped slides unless asked; notes travel on the notes page alone (SPEC 7.6);
// the appearance is the deck's `defaults.appearance` unless the caller names one. The sprite is
// written once, in the first stage: `<use href="#i-...">` resolves anywhere in the document. No
// runtime: the headless driver draws the dither canvases and waits for the fonts before
// `page.pdf`, and a browser's print dialog does the same through the sheet's own CSS.
import { BLOCK_CSS } from './block-css.ts';
import { renderSlides, slideCounter } from './deck.ts';
import type { RenderedDeck, ThemeBundle } from './deck.ts';
import { escapeText } from './html.ts';
import { renderStage } from './stage.ts';
import { slideOrder } from './slide.ts';
import type { RenderOptions } from './slide.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { deckAppearance, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { Orientation, Paper, PrintLayout, PrintOrder } from '@turboslide/schema/export';
import type { Page, Theme } from '@turboslide/schema/render';
import { DEFAULT_PAGE, deckPage } from '@turboslide/schema/render';

import {
  NOTES_LEADING_PT,
  NOTES_SIZE_PT,
  PRINT_FOOTER_HEX,
  PRINT_FOOTER_SIZE_PT,
  PRINT_HAIRLINE_HEX,
  PRINT_HAIRLINE_PT,
  estimateNotesLines,
  pageSlides,
  printLayout,
  printPageCount,
  ptToPx,
} from './print-layout.ts';
import type { PrintLayoutResult, PtBox } from './print-layout.ts';

/** A page size in sheet pixels (the schema's `Page` without its preset). */
export type PageSize = Pick<Page, 'width' | 'height'>;

/** Points per sheet pixel: 0.6 (120 sheet px per inch, 72 pt per inch; packages/export units.ts PT_PER_PX). */
const PT_PER_PX = 0.6;

/** PowerPoint's page in points for the default page: 13.333333 in by 7.5 in (packages/export units.ts PAGE_IN). */
export const PRINT_PAGE_PT = { width: 960, height: 540 } as const;

/** The print page in points of a page: `0.6W by 0.6H` (gslides-parity SPEC-5 6.1; R08 3e), 960 by 540 on the GT sheet. */
export function printPagePt(page: PageSize = DEFAULT_PAGE): { width: number; height: number } {
  return { width: page.width * PT_PER_PX, height: page.height * PT_PER_PX };
}

/**
 * The print scale that puts the sheet's 1600 px onto the page's 1280 CSS px (960 pt at 96 px per
 * in). The document lays every page out at the sheet's own 1600 by 900 px and the printer scales
 * the finished page by 0.8 (`page.pdf({ scale })` in the headless package; a browser's print
 * dialog shrinks to fit the same way): Chromium snaps hairlines to whole CSS pixels before it
 * scales, so a CSS zoom or transform of 0.8 landed every rule half a raster pixel off and a pixel
 * wide (measured on the fixture deck: 0.27 to 0.63 percent per page against the 2x render),
 * while the print scale keeps them exact (0.000 to 0.017 percent).
 */
export const PRINT_SCALE = 0.8;

/** The page box in CSS px for the default page: the sheet's own size; the print scale brings it to PRINT_PAGE_PT. */
export const PRINT_PAGE_PX = { width: 1600, height: 900 } as const;

/** A number in CSS as the print stylesheet has always written it: no trailing zeros. */
function cssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/**
 * The print stylesheet of a page: the page size, one sheet per page, no sheet edge or mat.
 * `contain: strict` on the page box is load bearing: without it Chromium's print fragmentation
 * dropped whole blocks from any page that had a page after it (measured on the GT deck: the
 * swatches of `color` and the twelve tile pictures of `engines` were absent from the PDF while the
 * same slide printed alone was complete); a page box with size, layout and paint containment
 * prints whole. `printCss(DEFAULT_PAGE)` is `PRINT_CSS` byte for byte, so a 16:9 document is
 * unchanged (gslides-parity SPEC-5 6.2).
 */
export function printCss(page: PageSize = DEFAULT_PAGE): string {
  const pt = printPagePt(page);
  return `
@page { size: ${cssNumber(pt.width)}pt ${cssNumber(pt.height)}pt; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body.ts-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ts-page { position: relative; width: ${page.width}px; height: ${page.height}px; overflow: hidden; contain: strict; page-break-after: always; break-after: page; background: var(--paper); }
.ts-page:last-child { page-break-after: auto; break-after: auto; }
.ts-page > .ts-sheet { position: absolute; left: 0; top: 0; width: ${page.width}px; height: ${page.height}px; border: 0; box-shadow: none; overflow: hidden; }
.ts-page .slide.is-on { animation: none; }
`;
}

/** The print stylesheet of the default page. */
export const PRINT_CSS = printCss(DEFAULT_PAGE);

export type PrintDocumentOptions = {
  theme?: Theme;
  bundle: ThemeBundle;
  /* the print layouts of gslides-parity SPEC-5 6.2 (R08 4.4, 4.5): one slide per page on the
     slide's own paper when every field is absent, the one slide document of every earlier round */
  /** `slides` (the default), `notes`, or a handout of 2, 3, 4, 6 or 9. */
  layout?: PrintLayout;
  /** The paper: the slide's own page for `slides` (the default there), Letter or A4. */
  paper?: Paper;
  orientation?: Orientation;
  /** The fill order of a handout's cells. */
  order?: PrintOrder;
  /** The light appearance on white with the paper ground and every background colour removed; the pictures kept. */
  hideBackground?: boolean;
  /** Only these slides, in deck order; default the play list. */
  slideIds?: SlideId[];
  /** Carry the skipped slides too; left out by default (SPEC 7.2.1). */
  includeSkipped?: boolean;
  /** Prefix for asset twin paths; ignored when `assetSrc` is given. */
  assetBase: string;
  assetSrc?: RenderOptions['assetSrc'];
  gtWord?: boolean;
  title?: string;
  /** Extra CSS appended after the print stylesheet. */
  extraCss?: string;
};

/** One cell of a printed page: which slide landed where (the PDF report's `cells`, SPEC-5 6.2). */
export type PrintCellEntry = { page: number; cell: number; slideId: SlideId };

export type PrintDocument = {
  html: string;
  theme: Theme;
  /** The deck's page the document was laid out on (gslides-parity SPEC-5 6.1). */
  page: PageSize;
  /** The rendered slides in order (one per page on the one slide layouts, several per page on a handout). */
  slides: RenderedDeck['slides'];
  /** The page count: `ceil(slides / perPage)` (SPEC-5 6.2). */
  pages: number;
  /** Slides left out because they are skipped (SPEC 7.2.1). */
  omitted: SlideId[];
  warnings: string[];
  /* the layout facts (SPEC-5 6.2), the defaults of the one slide document when the caller named none */
  layout: PrintLayout;
  paper: Paper;
  orientation: Orientation;
  order: PrintOrder;
  /** The paper's printed size in points. */
  paperPt: { width: number; height: number };
  /** Every cell of every page in order. */
  cells: PrintCellEntry[];
  /** The slides whose notes the notes page clipped (an estimate over the box's line count). */
  truncatedNotes: SlideId[];
  hideBackground: boolean;
};

/** A number in CSS with at most three decimals, for the paper layouts' boxes. */
function px(value: number): string {
  return cssNumber(Math.round(value * 1000) / 1000);
}

/** A points box as CSS px placement (absolute, in the page box). */
function placePt(box: PtBox): string {
  return `left:${px(ptToPx(box.x))}px;top:${px(ptToPx(box.y))}px;width:${px(ptToPx(box.w))}px;height:${px(ptToPx(box.h))}px`;
}

/**
 * The stylesheet of a paper layout: the page box at the paper's size in CSS px (`pt / 0.6`, so
 * PRINT_SCALE lands it on the paper), the cells and the slide boxes placed absolutely, the sheet
 * inside a slide box at its own pixels scaled by `k`, the hairline, the ruled lines, the notes
 * text at 11 pt on 16.5 pt leading and the footer band at 9 pt; Hide background as the paper on
 * white with the `.slide-bg` layers removed.
 */
export function paperCss(
  layout: PrintLayoutResult,
  page: PageSize,
  hideBackground: boolean,
): string {
  const paper = layout.paperPt;
  const hair = ptToPx(PRINT_HAIRLINE_PT);
  return `
@page { size: ${cssNumber(paper.width)}pt ${cssNumber(paper.height)}pt; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body.ts-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ts-page { position: relative; width: ${px(ptToPx(paper.width))}px; height: ${px(ptToPx(paper.height))}px; overflow: hidden; contain: strict; page-break-after: always; break-after: page; background: #ffffff; }
.ts-page:last-child { page-break-after: auto; break-after: auto; }
.ts-cell, .ts-cell-slide, .ts-rule, .ts-notes, .ts-footer { position: absolute; box-sizing: border-box; }
.ts-cell-slide { outline: ${px(hair)}px solid ${PRINT_HAIRLINE_HEX}; overflow: hidden; }
.ts-cell-sheet { position: absolute; left: 0; top: 0; width: ${page.width}px; height: ${page.height}px; transform-origin: 0 0; transform: scale(var(--k)); }
.ts-cell-sheet > .ts-sheet { position: absolute; left: 0; top: 0; width: ${page.width}px; height: ${page.height}px; border: 0; box-shadow: none; overflow: hidden; }
.ts-page .slide.is-on { animation: none; }
.ts-rule { height: 0; border-top: ${px(hair)}px solid ${PRINT_HAIRLINE_HEX}; }
.ts-notes { overflow: hidden; font-family: Inter, system-ui, sans-serif; font-size: ${px(ptToPx(NOTES_SIZE_PT))}px; line-height: ${px(ptToPx(NOTES_LEADING_PT))}px; color: #070707; white-space: pre-wrap; }
.ts-footer { display: flex; align-items: center; justify-content: space-between; font-family: Inter, system-ui, sans-serif; font-size: ${px(ptToPx(PRINT_FOOTER_SIZE_PT))}px; line-height: 1; color: ${PRINT_FOOTER_HEX}; font-variant-numeric: tabular-nums; }
.ts-footer-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
${hideBackground ? HIDE_BACKGROUND_CSS : ''}
`;
}

export function renderPrintDocument(
  deck: Deck,
  slides: Slide[],
  options: PrintDocumentOptions,
): PrintDocument {
  const layoutName: PrintLayout = options.layout ?? 'slides';
  const paper: Paper = options.paper ?? (layoutName === 'slides' ? 'slide' : 'letter');
  if (layoutName === 'slides' && paper === 'slide')
    return renderSlidePaperDocument(deck, slides, options);
  return renderPaperDocument(deck, slides, options, layoutName, paper);
}

/** The Hide background rule (SPEC-5 6.2): the paper and the plates white, the background colour layers gone; the pictures, the frame, the wordmark and the counter stay. */
export const HIDE_BACKGROUND_CSS =
  '.ts-sheet { --paper: #ffffff; --plate: #ffffff; } .ts-page .slide-bg { display: none; }';

/**
 * The one slide document on the slide's own paper: today's pages, byte identical for a 16:9 deck
 * without Hide background (SPEC-5 6.2); with it, the light appearance and the rule above appended.
 */
function renderSlidePaperDocument(
  deck: Deck,
  slides: Slide[],
  options: PrintDocumentOptions,
): PrintDocument {
  const hideBackground = options.hideBackground === true;
  const theme: Theme = hideBackground ? 'light' : (options.theme ?? deckAppearance(deck));
  const page = deckPage(deck);
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const play =
    options.includeSkipped === true
      ? slideOrder(deck)
      : unskippedSlideOrder({ deck, slides: Object.fromEntries(byId) });
  const omitted = slideOrder(deck).filter((id) => !play.includes(id));
  const wanted = options.slideIds ? play.filter((id) => options.slideIds?.includes(id)) : play;
  const rendered = renderSlides(
    deck,
    slides,
    {
      theme,
      chrome: true,
      assetBase: options.assetBase,
      assetSrc: options.assetSrc,
      blockAttrs: true,
      gtWord: options.gtWord ?? true,
    },
    wanted,
    play,
  ).map((entry) => ({
    ...entry,
    // one visible slide per page: the section carries is-on on its own stage
    rendered: {
      ...entry.rendered,
      html: entry.rendered.html.replace(/^<section class="slide/, '<section class="slide is-on'),
    },
  }));
  const pages = rendered.map((entry, index) => {
    const slide = byId.get(entry.slideId);
    const stage = renderStage(entry.rendered.html, {
      theme,
      counter: slide ? slideCounter(deck, slide, entry.n, play.length) : undefined,
      sprite: index === 0 ? options.bundle.sprite : undefined,
      present: true,
      page,
    });
    return `<div class="ts-page" data-page="${index + 1}" data-slide="${escapeText(entry.slideId)}">${stage}</div>`;
  });
  const title = options.title ?? deck.title;
  const head =
    `<meta charset="utf-8"><meta name="viewport" content="width=${page.width},initial-scale=1">` +
    `<title>${escapeText(title)}</title><meta name="robots" content="noindex">` +
    `<style>${options.bundle.fontsCss}</style><style>${options.bundle.sheetCss}</style><style>${options.bundle.stageCss}</style>` +
    `<style>${BLOCK_CSS}</style><style>${printCss(page)}</style>${hideBackground ? `<style>${HIDE_BACKGROUND_CSS}</style>` : ''}${options.extraCss ? `<style>${options.extraCss}</style>` : ''}`;
  const html =
    `<!doctype html><html lang="en" data-theme="${theme}"><head>${head}</head>` +
    `<body class="ts-print">${pages.join('\n')}</body></html>\n`;
  const pagePt = printPagePt(page);
  return {
    html,
    theme,
    page,
    slides: rendered,
    pages: rendered.length,
    omitted,
    warnings: rendered.flatMap((entry) => entry.rendered.warnings),
    layout: 'slides',
    paper: 'slide',
    orientation: page.width >= page.height ? 'landscape' : 'portrait',
    order: options.order ?? 'across',
    paperPt: { width: pagePt.width, height: pagePt.height },
    cells: rendered.map((entry, index) => ({ page: index + 1, cell: 0, slideId: entry.slideId })),
    truncatedNotes: [],
    hideBackground,
  };
}

/**
 * A printout on Letter or A4 (SPEC-5 6.2; R08 4.4, 4.5): the slides of the play list placed in
 * the cells `printLayout` computes, `ceil(slides / perPage)` pages, the notes page with the
 * slide's notes under it, the footer band on every page. `slides` with a paper other than the
 * slide's own is one slide per page contained in the printable area with the footer.
 */
function renderPaperDocument(
  deck: Deck,
  slides: Slide[],
  options: PrintDocumentOptions,
  layoutName: PrintLayout,
  paper: Paper,
): PrintDocument {
  const hideBackground = options.hideBackground === true;
  // Hide background prints the light appearance (SPEC-5 6.2)
  const theme: Theme = hideBackground ? 'light' : (options.theme ?? deckAppearance(deck));
  const page = deckPage(deck);
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const play =
    options.includeSkipped === true
      ? slideOrder(deck)
      : unskippedSlideOrder({ deck, slides: Object.fromEntries(byId) });
  const omitted = slideOrder(deck).filter((id) => !play.includes(id));
  const wanted = options.slideIds ? play.filter((id) => options.slideIds?.includes(id)) : play;
  const rendered = renderSlides(
    deck,
    slides,
    {
      theme,
      chrome: true,
      assetBase: options.assetBase,
      assetSrc: options.assetSrc,
      blockAttrs: true,
      gtWord: options.gtWord ?? true,
    },
    wanted,
    play,
  ).map((entry) => ({
    ...entry,
    rendered: {
      ...entry.rendered,
      html: entry.rendered.html.replace(/^<section class="slide/, '<section class="slide is-on'),
    },
  }));
  // the paper of the `slides` layout on paper: one slide per page, landscape unless named
  const geometry = printLayout({
    page,
    layout: layoutName,
    paper: paper === 'slide' ? 'letter' : paper,
    ...(options.orientation !== undefined ? { orientation: options.orientation } : {}),
    ...(options.order !== undefined ? { order: options.order } : {}),
  });
  const ids = rendered.map((entry) => entry.slideId);
  const pageCount = printPageCount(ids.length, layoutName);
  const title = options.title ?? deck.title;
  const cells: PrintCellEntry[] = [];
  const truncatedNotes: SlideId[] = [];
  const byRendered = new Map(rendered.map((entry) => [entry.slideId, entry]));
  let spriteWritten = false;
  const pagesHtml: string[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const onPage = pageSlides(ids, geometry.perPage, pageIndex);
    const parts: string[] = [];
    onPage.forEach((slideId, cellIndex) => {
      const cell = geometry.cells[cellIndex];
      const entry = byRendered.get(slideId);
      const slide = byId.get(slideId);
      if (cell === undefined || entry === undefined) return;
      cells.push({ page: pageIndex + 1, cell: cellIndex, slideId });
      const stage = renderStage(entry.rendered.html, {
        theme,
        counter: slide ? slideCounter(deck, slide, entry.n, play.length) : undefined,
        sprite: spriteWritten ? undefined : options.bundle.sprite,
        present: true,
        page,
      });
      spriteWritten = true;
      // the slide box in the cell: the sheet at its own pixels scaled to the box's width
      const k = ptToPx(cell.slide.w) / page.width;
      const rules = cell.lines
        .map(
          (line) =>
            `<div class="ts-rule" style="left:${px(ptToPx(line.x1))}px;top:${px(ptToPx(line.y))}px;width:${px(ptToPx(line.x2 - line.x1))}px"></div>`,
        )
        .join('');
      parts.push(
        `<div class="ts-cell" data-cell="${cellIndex}" data-slide="${escapeText(slideId)}" style="${placePt(cell.box)}"></div>` +
          `<div class="ts-cell-slide" data-slide="${escapeText(slideId)}" style="${placePt(cell.slide)};--k:${cssNumber(Math.round(k * 100000) / 100000)}"><div class="ts-cell-sheet">${stage}</div></div>` +
          rules,
      );
      if (geometry.notes !== undefined) {
        const notes = slide?.notes ?? deck.defaults?.notes ?? '';
        const box = geometry.notes.box;
        const fits =
          estimateNotesLines(notes, box.w, geometry.notes.sizePt) <= geometry.notes.lines;
        if (!fits) truncatedNotes.push(slideId);
        parts.push(
          `<div class="ts-notes" data-slide="${escapeText(slideId)}" data-lines="${geometry.notes.lines}"${fits ? '' : ' data-truncated=""'} style="${placePt(box)}">${escapeText(notes)}</div>`,
        );
      }
    });
    if (geometry.footer !== undefined) {
      parts.push(
        `<div class="ts-footer" style="${placePt(geometry.footer.box)}"><span class="ts-footer-title">${escapeText(title)}</span><span class="ts-footer-count">${pageIndex + 1} of ${pageCount}</span></div>`,
      );
    }
    pagesHtml.push(
      `<div class="ts-page ts-page-paper" data-page="${pageIndex + 1}" data-layout="${layoutName}" data-paper="${geometry.paper}" data-orientation="${geometry.orientation}">${parts.join('')}</div>`,
    );
  }
  const head =
    `<meta charset="utf-8"><meta name="viewport" content="width=${page.width},initial-scale=1">` +
    `<title>${escapeText(title)}</title><meta name="robots" content="noindex">` +
    `<style>${options.bundle.fontsCss}</style><style>${options.bundle.sheetCss}</style><style>${options.bundle.stageCss}</style>` +
    `<style>${BLOCK_CSS}</style><style>${paperCss(geometry, page, hideBackground)}</style>${options.extraCss ? `<style>${options.extraCss}</style>` : ''}`;
  const html =
    `<!doctype html><html lang="en" data-theme="${theme}"><head>${head}</head>` +
    `<body class="ts-print ts-print-paper">${pagesHtml.join('\n')}</body></html>\n`;
  return {
    html,
    theme,
    page,
    slides: rendered,
    pages: pageCount,
    omitted,
    warnings: rendered.flatMap((entry) => entry.rendered.warnings),
    layout: layoutName,
    paper: geometry.paper,
    orientation: geometry.orientation,
    order: geometry.order,
    paperPt: geometry.paperPt,
    cells,
    truncatedNotes,
    hideBackground,
  };
}

/** The asset ids a print document references, for a caller that inlines twins. */
export function printAssetIds(deck: Deck): AssetId[] {
  return Object.keys(deck.assets);
}

// printLayout (gslides-parity SPEC-5 0.31, 6.2; R08 4.4, 4.5): the one pure function the print
// route and the PDF share. `slides` on the slide's own paper is today's page, `0.6W by 0.6H` pt
// with no margin; every other layout is a printout on Letter (612 by 792 pt) or A4 (595.28 by
// 841.89 pt) in either orientation: a 36 pt margin on every side, an 18 pt footer band inside the
// bottom margin edge (the deck title left, `n of m` right), a printable area `W = Pw - 72` by
// `H = Ph - 72 - 18` at (36, 36), the cells of the handout grid with 18 pt gutters, the slide
// contained in its cell by the deck's aspect and centred, a 0.5 pt hairline around every slide,
// the 3 per page handout in one column with ruled lines at 18 pt pitch beside each slide (the
// slide at 45 percent of the printable width, no wider than its cell allows), and the notes page
// with the slide capped at 45 percent of the printable height over 11 pt notes on 16.5 pt leading.
// Everything is computed in points and rounded to 0.01 pt; the document lays it out in sheet
// pixels (1 pt is 1/0.6 px) and prints at PRINT_SCALE 0.8, the same printer path the one slide
// document takes. No import beyond the schema's types, so the print route reads it in the browser.
import type { Orientation, Paper, PrintLayout, PrintOrder } from '@turboslide/schema/export';
import { PRINT_SLIDES_PER_PAGE } from '@turboslide/schema/export';
import type { Page } from '@turboslide/schema/render';
import { DEFAULT_PAGE } from '@turboslide/schema/render';

/** A page size in sheet pixels (the schema's `Page` without its preset). */
export type PageSize = Pick<Page, 'width' | 'height'>;

/** A box in points: x, y, width, height. */
export type PtBox = { x: number; y: number; w: number; h: number };

/** Points per sheet pixel (packages/export units.ts PT_PER_PX). */
export const PT_PER_PX = 0.6;

/** The paper sizes in points (R08 4.4): Letter and A4 in portrait. */
export const PAPER_PT: Readonly<
  Record<Exclude<Paper, 'slide'>, { width: number; height: number }>
> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/** The margin on every side of a paper page, in points (0.5 in). */
export const PRINT_MARGIN_PT = 36;
/** The gutter between handout cells, in points. */
export const PRINT_GUTTER_PT = 18;
/** The footer band inside the bottom margin edge, in points. */
export const PRINT_FOOTER_PT = 18;
/** The footer's type size in points (9 pt Inter, tabular numerals, titanium). */
export const PRINT_FOOTER_SIZE_PT = 9;
/** The ruled lines' pitch beside a 3 per page handout slide, in points. */
export const PRINT_LINE_PITCH_PT = 18;
/** The 3 per page handout's slide width as a fraction of the printable width. */
export const HANDOUT_3_SLIDE_FRACTION = 0.45;
/** The notes page's slide height cap as a fraction of the printable height. */
export const NOTES_SLIDE_FRACTION = 0.45;
/** The notes text: 11 pt on 16.5 pt leading. */
export const NOTES_SIZE_PT = 11;
export const NOTES_LEADING_PT = 16.5;
/** The hairline around every slide picture and the ruled lines, in points and as a colour. */
export const PRINT_HAIRLINE_PT = 0.5;
export const PRINT_HAIRLINE_HEX = '#bfbfbf';
/** The footer's colour: the titanium of the chrome's tokens. */
export const PRINT_FOOTER_HEX = '#8a8f98';

export type PrintLayoutInput = {
  /** The deck's page in sheet pixels; the default page when absent. */
  page?: PageSize;
  layout: PrintLayout;
  /** The paper; `slide` (the layout's own page) is allowed for `slides` alone. */
  paper?: Paper;
  /** Portrait for the notes page and the handouts, landscape for `slides` on paper, when absent. */
  orientation?: Orientation;
  /** The fill order of a handout's cells: across the rows first (the default) or down the columns. */
  order?: PrintOrder;
};

/** One ruled line beside a handout slide, in points. */
export type PrintRule = { x1: number; x2: number; y: number };

/** One cell of a page: the cell's box, the slide's box inside it, and the lines beside it. */
export type PrintCell = {
  /** The cell's index on its page, in fill order. */
  index: number;
  /** The grid position: the column and the row the cell occupies. */
  column: number;
  row: number;
  box: PtBox;
  /** The slide's box: contained in the cell by the deck's aspect. */
  slide: PtBox;
  /** The ruled lines of the 3 per page handout; empty elsewhere. */
  lines: PrintRule[];
};

/** The notes box of the notes page: the text block under the slide, its type and its line count. */
export type PrintNotesBox = {
  box: PtBox;
  sizePt: number;
  leadingPt: number;
  /** How many lines of notes fit before the footer. */
  lines: number;
};

export type PrintFooter = {
  /** The whole band. */
  box: PtBox;
  /** The deck title, left. */
  title: PtBox;
  /** `n of m`, right. */
  count: PtBox;
  sizePt: number;
};

export type PrintLayoutResult = {
  layout: PrintLayout;
  paper: Paper;
  orientation: Orientation;
  order: PrintOrder;
  /** The paper's size in points as printed (the orientation applied). */
  paperPt: { width: number; height: number };
  /** The deck's page the slides are laid out from. */
  page: PageSize;
  /** The printable area (the page less the margins and the footer band) in points. */
  printable: PtBox;
  margin: number;
  gutter: number;
  /** The grid of cells: columns by rows. */
  grid: { columns: number; rows: number };
  perPage: number;
  cells: PrintCell[];
  /** The scale of a slide clone: slide width in sheet px over the page width (`k`). */
  k: number;
  notes?: PrintNotesBox;
  footer?: PrintFooter;
  /** True for today's one slide document on the slide's own page: no margin, footer or hairline. */
  slidePaper: boolean;
};

/** A number rounded to 0.01 pt, the precision R08 4.5 states its tables at. */
export function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Points to sheet pixels: 1 pt is 1/0.6 px. */
export function ptToPx(pt: number): number {
  return pt / PT_PER_PX;
}

/** The orientation a layout takes when the caller names none (R08 4.4). */
export function defaultOrientation(layout: PrintLayout): Orientation {
  return layout === 'slides' ? 'landscape' : 'portrait';
}

/** The paper a layout takes when the caller names none: the slide's own page for `slides`, else Letter. */
export function defaultPaper(layout: PrintLayout): Paper {
  return layout === 'slides' ? 'slide' : 'letter';
}

/** Letter under an `en-US` locale, A4 elsewhere (SPEC-5 6.2); the print route's dropdown default. */
export function paperForLocale(locale: string | undefined): Exclude<Paper, 'slide'> {
  return locale !== undefined && /^en-US\b/i.test(locale) ? 'letter' : 'a4';
}

/** The grid of a layout on a paper orientation: columns by rows (R08 4.4). */
export function handoutGrid(
  layout: PrintLayout,
  orientation: Orientation,
): { columns: number; rows: number } {
  const portrait = orientation === 'portrait';
  switch (layout) {
    case 'slides':
    case 'notes':
      return { columns: 1, rows: 1 };
    case 'handout-2':
      return portrait ? { columns: 1, rows: 2 } : { columns: 2, rows: 1 };
    case 'handout-3':
      return { columns: 1, rows: 3 };
    case 'handout-4':
      return { columns: 2, rows: 2 };
    case 'handout-6':
      return portrait ? { columns: 2, rows: 3 } : { columns: 3, rows: 2 };
    case 'handout-9':
      return { columns: 3, rows: 3 };
  }
}

/** The paper's printed size in points, the orientation applied; the slide's own page for `slide`. */
export function paperSizePt(
  paper: Paper,
  orientation: Orientation,
  page: PageSize,
): { width: number; height: number } {
  if (paper === 'slide') return { width: page.width * PT_PER_PX, height: page.height * PT_PER_PX };
  const size = PAPER_PT[paper];
  return orientation === 'landscape'
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** A box of the deck's aspect contained in a box, centred in it (R08 4.4). */
export function containSlide(
  cell: PtBox,
  page: PageSize,
  align: 'centre' | 'start' = 'centre',
): PtBox {
  const aspect = page.width / page.height;
  let w = cell.w;
  let h = w / aspect;
  if (h > cell.h) {
    h = cell.h;
    w = h * aspect;
  }
  const x = align === 'start' ? cell.x : cell.x + (cell.w - w) / 2;
  const y = cell.y + (cell.h - h) / 2;
  return { x: roundPt(x), y: roundPt(y), w: roundPt(w), h: roundPt(h) };
}

/** How many pages a layout takes for a slide count. */
export function printPageCount(slides: number, layout: PrintLayout): number {
  return Math.max(1, Math.ceil(slides / PRINT_SLIDES_PER_PAGE[layout]));
}

/**
 * The print geometry of one page (R08 4.4, 4.5): the paper, the printable area, the cells with
 * their slide boxes and lines, the notes box and the footer. `slides` on `paper: 'slide'` answers
 * today's page: one cell the size of the page and nothing else, so the one slide document is byte
 * identical to what it was before the layouts (SPEC-5 6.2).
 */
export function printLayout(input: PrintLayoutInput): PrintLayoutResult {
  const page = input.page ?? DEFAULT_PAGE;
  const layout = input.layout;
  const paper = input.paper ?? defaultPaper(layout);
  if (paper === 'slide' && layout !== 'slides')
    throw new RangeError(
      `printLayout: paper "slide" is the one slide layout's alone, not ${layout}`,
    );
  const orientation = input.orientation ?? defaultOrientation(layout);
  const order = input.order ?? 'across';
  const paperPt = paperSizePt(paper, orientation, page);
  const perPage = PRINT_SLIDES_PER_PAGE[layout];

  if (paper === 'slide') {
    const box = { x: 0, y: 0, w: roundPt(paperPt.width), h: roundPt(paperPt.height) };
    return {
      layout,
      paper,
      orientation: page.width >= page.height ? 'landscape' : 'portrait',
      order,
      paperPt: { width: roundPt(paperPt.width), height: roundPt(paperPt.height) },
      page,
      printable: box,
      margin: 0,
      gutter: 0,
      grid: { columns: 1, rows: 1 },
      perPage: 1,
      cells: [{ index: 0, column: 0, row: 0, box, slide: box, lines: [] }],
      k: 1,
      slidePaper: true,
    };
  }

  const m = PRINT_MARGIN_PT;
  const g = PRINT_GUTTER_PT;
  const printable: PtBox = {
    x: m,
    y: m,
    w: roundPt(paperPt.width - 2 * m),
    h: roundPt(paperPt.height - 2 * m - PRINT_FOOTER_PT),
  };
  const footerTop = paperPt.height - m - PRINT_FOOTER_PT;
  const footer: PrintFooter = {
    box: { x: m, y: roundPt(footerTop), w: printable.w, h: PRINT_FOOTER_PT },
    title: { x: m, y: roundPt(footerTop), w: roundPt(printable.w * 0.7), h: PRINT_FOOTER_PT },
    count: {
      x: roundPt(m + printable.w * 0.7),
      y: roundPt(footerTop),
      w: roundPt(printable.w * 0.3),
      h: PRINT_FOOTER_PT,
    },
    sizePt: PRINT_FOOTER_SIZE_PT,
  };

  if (layout === 'notes') {
    // the cap is applied unrounded so the slide's width follows R08 4.5's figures (404.22 on A4
    // landscape); the cell the result lists is the rounded cap
    const capH = printable.h * NOTES_SLIDE_FRACTION;
    const cap: PtBox = { x: m, y: m, w: printable.w, h: roundPt(capH) };
    const slide = containSlide({ ...cap, h: capH }, page);
    // the slide sits at the top of the printable area, centred horizontally
    slide.y = m;
    const notesTop = roundPt(slide.y + slide.h + g);
    const notesBox: PtBox = {
      x: m,
      y: notesTop,
      w: printable.w,
      h: roundPt(footerTop - notesTop),
    };
    return {
      layout,
      paper,
      orientation,
      order,
      paperPt,
      page,
      printable,
      margin: m,
      gutter: g,
      grid: { columns: 1, rows: 1 },
      perPage,
      cells: [{ index: 0, column: 0, row: 0, box: cap, slide, lines: [] }],
      k: slide.w / PT_PER_PX / page.width,
      notes: {
        box: notesBox,
        sizePt: NOTES_SIZE_PT,
        leadingPt: NOTES_LEADING_PT,
        lines: Math.max(0, Math.floor(notesBox.h / NOTES_LEADING_PT)),
      },
      footer,
      slidePaper: false,
    };
  }

  const grid = handoutGrid(layout, orientation);
  const cw = (printable.w - (grid.columns - 1) * g) / grid.columns;
  const ch = (printable.h - (grid.rows - 1) * g) / grid.rows;
  const cells: PrintCell[] = [];
  const positions: { column: number; row: number }[] = [];
  if (order === 'down') {
    for (let column = 0; column < grid.columns; column += 1)
      for (let row = 0; row < grid.rows; row += 1) positions.push({ column, row });
  } else {
    for (let row = 0; row < grid.rows; row += 1)
      for (let column = 0; column < grid.columns; column += 1) positions.push({ column, row });
  }
  positions.forEach(({ column, row }, index) => {
    // the cell unrounded for the slide arithmetic (R08 4.5's figures derive from the exact
    // cell), rounded in the record
    const exact: PtBox = { x: m + column * (cw + g), y: m + row * (ch + g), w: cw, h: ch };
    const box: PtBox = {
      x: roundPt(exact.x),
      y: roundPt(exact.y),
      w: roundPt(exact.w),
      h: roundPt(exact.h),
    };
    let slide: PtBox;
    const lines: PrintRule[] = [];
    if (layout === 'handout-3') {
      // the slide at 45 percent of the printable width, no wider than the cell allows, at the
      // cell's left edge and centred vertically; the lines run from its right edge plus the
      // gutter to the printable area's right edge at the 18 pt pitch
      const wanted = printable.w * HANDOUT_3_SLIDE_FRACTION;
      slide = containSlide({ ...exact, w: Math.min(wanted, exact.w) }, page, 'start');
      const count = Math.floor(slide.h / PRINT_LINE_PITCH_PT);
      const x1 = roundPt(slide.x + slide.w + g);
      const x2 = roundPt(printable.x + printable.w);
      for (let i = 1; i <= count; i += 1)
        lines.push({ x1, x2, y: roundPt(slide.y + i * PRINT_LINE_PITCH_PT) });
    } else {
      slide = containSlide(exact, page);
    }
    cells.push({ index, column, row, box, slide, lines });
  });
  const first = cells[0];
  return {
    layout,
    paper,
    orientation,
    order,
    paperPt,
    page,
    printable,
    margin: m,
    gutter: g,
    grid,
    perPage,
    cells,
    k: first ? first.slide.w / PT_PER_PX / page.width : 1,
    footer,
    slidePaper: false,
  };
}

/** The cells of one printed page over a slide list: the slide ids that land on page `pageIndex` (zero based), one per cell in order. */
export function pageSlides(
  slideIds: readonly string[],
  perPage: number,
  pageIndex: number,
): string[] {
  return slideIds.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
}

/**
 * The lines a notes text takes at a width, estimated without a browser: characters per line from
 * the type size (an average Inter glyph at 11 pt is about 5.3 pt wide, so about 0.48 em), each
 * paragraph wrapped on its own, a blank line between paragraphs. The print document clips the
 * text at the box, so a text past the count is a report row; the number is an estimate and the
 * report says so.
 */
export function estimateNotesLines(text: string, widthPt: number, sizePt = NOTES_SIZE_PT): number {
  const perLine = Math.max(1, Math.floor(widthPt / (sizePt * 0.48)));
  const paragraphs = text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
  let lines = 0;
  paragraphs.forEach((paragraph, i) => {
    lines += Math.max(1, Math.ceil(paragraph.length / perLine));
    if (i < paragraphs.length - 1) lines += 1;
  });
  return lines;
}

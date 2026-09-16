// printLayout (gslides-parity SPEC-5 6.2; R08 4.5): the four tables of the research pinned row by
// row, Letter and A4 in both orientations, the notes page's box and line count, the 3 per page
// handout's lines, the fill orders, the 4:3 deck's taller slides, and the slide's own paper as
// today's page with nothing around it.
import { describe, expect, it } from 'vitest';

import { PAGE_PRESET_SIZES } from '@turboslide/schema/render';

import {
  PAPER_PT,
  containSlide,
  defaultOrientation,
  defaultPaper,
  estimateNotesLines,
  handoutGrid,
  pageSlides,
  paperForLocale,
  paperSizePt,
  printLayout,
  printPageCount,
  ptToPx,
  roundPt,
} from '../print-layout.ts';
import type { PrintLayoutResult } from '../print-layout.ts';

type Row = {
  layout: PrintLayoutResult['layout'];
  grid: [number, number];
  cell: [number, number];
  slide: [number, number];
  k: number;
  lines?: [number, number, number];
  notes?: { box: [number, number, number, number]; lines: number };
};

/** One table of R08 4.5: the grid (columns by rows), the cell, the slide in pt, k and the lines or the notes box. */
function pinTable(
  paper: 'letter' | 'a4',
  orientation: 'portrait' | 'landscape',
  printable: [number, number],
  rows: Row[],
): void {
  for (const row of rows) {
    const out = printLayout({ layout: row.layout, paper, orientation });
    expect(out.printable.w, `${row.layout} printable width`).toBe(printable[0]);
    expect(out.printable.h, `${row.layout} printable height`).toBe(printable[1]);
    expect([out.grid.columns, out.grid.rows], `${row.layout} grid`).toEqual(row.grid);
    const cell = out.cells[0];
    expect(cell).toBeDefined();
    if (!cell) continue;
    if (row.layout !== 'notes')
      expect([cell.box.w, cell.box.h], `${row.layout} cell`).toEqual(row.cell);
    expect([cell.slide.w, cell.slide.h], `${row.layout} slide`).toEqual(row.slide);
    expect(Math.round(out.k * 100) / 100, `${row.layout} k`).toBe(row.k);
    if (row.lines) {
      expect(cell.lines.length, `${row.layout} lines`).toBe(row.lines[2]);
      expect(cell.lines[0]?.x1, `${row.layout} lines x1`).toBe(row.lines[0]);
      expect(cell.lines[0]?.x2, `${row.layout} lines x2`).toBe(row.lines[1]);
    } else expect(cell.lines).toEqual([]);
    if (row.notes) {
      expect(out.notes).toBeDefined();
      expect(
        [out.notes?.box.w, out.notes?.box.h, out.notes?.box.y],
        `${row.layout} notes box`,
      ).toEqual([row.notes.box[2], row.notes.box[3], row.notes.box[1]]);
      expect(out.notes?.lines, `${row.layout} notes lines`).toBe(row.notes.lines);
    }
    expect(out.cells).toHaveLength(out.perPage);
    expect(out.footer?.box.h).toBe(18);
    expect(out.footer?.box.y).toBe(roundPt(out.paperPt.height - 36 - 18));
  }
}

describe('printLayout on Letter', () => {
  it('portrait pins the first table of R08 4.5', () => {
    pinTable(
      'letter',
      'portrait',
      [540, 702],
      [
        { layout: 'slides', grid: [1, 1], cell: [540, 702], slide: [540, 303.75], k: 0.56 },
        {
          layout: 'notes',
          grid: [1, 1],
          cell: [540, 315.9],
          slide: [540, 303.75],
          k: 0.56,
          notes: { box: [36, 357.75, 540, 380.25], lines: 23 },
        },
        { layout: 'handout-2', grid: [1, 2], cell: [540, 342], slide: [540, 303.75], k: 0.56 },
        {
          layout: 'handout-3',
          grid: [1, 3],
          cell: [540, 222],
          slide: [243, 136.69],
          k: 0.25,
          lines: [297, 576, 7],
        },
        { layout: 'handout-4', grid: [2, 2], cell: [261, 342], slide: [261, 146.81], k: 0.27 },
        { layout: 'handout-6', grid: [2, 3], cell: [261, 222], slide: [261, 146.81], k: 0.27 },
        { layout: 'handout-9', grid: [3, 3], cell: [168, 222], slide: [168, 94.5], k: 0.18 },
      ],
    );
  });

  it('landscape pins the second table', () => {
    pinTable(
      'letter',
      'landscape',
      [720, 522],
      [
        { layout: 'slides', grid: [1, 1], cell: [720, 522], slide: [720, 405], k: 0.75 },
        {
          layout: 'notes',
          grid: [1, 1],
          cell: [720, 234.9],
          slide: [417.6, 234.9],
          k: 0.44,
          notes: { box: [36, 288.9, 720, 269.1], lines: 16 },
        },
        { layout: 'handout-2', grid: [2, 1], cell: [351, 522], slide: [351, 197.44], k: 0.37 },
        {
          layout: 'handout-3',
          grid: [1, 3],
          cell: [720, 162],
          slide: [288, 162],
          k: 0.3,
          lines: [342, 756, 9],
        },
        { layout: 'handout-4', grid: [2, 2], cell: [351, 252], slide: [351, 197.44], k: 0.37 },
        { layout: 'handout-6', grid: [3, 2], cell: [228, 252], slide: [228, 128.25], k: 0.24 },
        { layout: 'handout-9', grid: [3, 3], cell: [228, 162], slide: [228, 128.25], k: 0.24 },
      ],
    );
  });
});

describe('printLayout on A4', () => {
  it('portrait pins the third table', () => {
    pinTable(
      'a4',
      'portrait',
      [523.28, 751.89],
      [
        {
          layout: 'slides',
          grid: [1, 1],
          cell: [523.28, 751.89],
          slide: [523.28, 294.35],
          k: 0.55,
        },
        {
          layout: 'notes',
          grid: [1, 1],
          cell: [523.28, 338.35],
          slide: [523.28, 294.35],
          k: 0.55,
          notes: { box: [36, 348.35, 523.28, 439.54], lines: 26 },
        },
        {
          layout: 'handout-2',
          grid: [1, 2],
          cell: [523.28, 366.95],
          slide: [523.28, 294.35],
          k: 0.55,
        },
        {
          layout: 'handout-3',
          grid: [1, 3],
          cell: [523.28, 238.63],
          slide: [235.48, 132.46],
          k: 0.25,
          lines: [289.48, 559.28, 7],
        },
        {
          layout: 'handout-4',
          grid: [2, 2],
          cell: [252.64, 366.95],
          slide: [252.64, 142.11],
          k: 0.26,
        },
        {
          layout: 'handout-6',
          grid: [2, 3],
          cell: [252.64, 238.63],
          slide: [252.64, 142.11],
          k: 0.26,
        },
        {
          layout: 'handout-9',
          grid: [3, 3],
          cell: [162.43, 238.63],
          slide: [162.43, 91.37],
          k: 0.17,
        },
      ],
    );
  });

  it('landscape pins the fourth table', () => {
    pinTable(
      'a4',
      'landscape',
      [769.89, 505.28],
      [
        { layout: 'slides', grid: [1, 1], cell: [769.89, 505.28], slide: [769.89, 433.06], k: 0.8 },
        {
          layout: 'notes',
          grid: [1, 1],
          cell: [769.89, 227.38],
          slide: [404.22, 227.38],
          k: 0.42,
          notes: { box: [36, 281.38, 769.89, 259.9], lines: 15 },
        },
        {
          layout: 'handout-2',
          grid: [2, 1],
          cell: [375.95, 505.28],
          slide: [375.95, 211.47],
          k: 0.39,
        },
        {
          layout: 'handout-3',
          grid: [1, 3],
          cell: [769.89, 156.43],
          slide: [278.09, 156.43],
          k: 0.29,
          lines: [332.09, 805.89, 8],
        },
        {
          layout: 'handout-4',
          grid: [2, 2],
          cell: [375.95, 243.64],
          slide: [375.95, 211.47],
          k: 0.39,
        },
        {
          layout: 'handout-6',
          grid: [3, 2],
          cell: [244.63, 243.64],
          slide: [244.63, 137.6],
          k: 0.25,
        },
        {
          layout: 'handout-9',
          grid: [3, 3],
          cell: [244.63, 156.43],
          slide: [244.63, 137.6],
          k: 0.25,
        },
      ],
    );
  });
});

describe('printLayout on other pages and papers', () => {
  it('holds taller slides in the same cells for a 4:3 deck on Letter portrait', () => {
    const page = PAGE_PRESET_SIZES['standard-4-3'];
    const h2 = printLayout({ page, layout: 'handout-2', paper: 'letter', orientation: 'portrait' });
    expect([h2.cells[0]?.slide.w, h2.cells[0]?.slide.h]).toEqual([456, 342]);
    expect(Math.round(h2.k * 100) / 100).toBe(0.63);
    const h3 = printLayout({ page, layout: 'handout-3', paper: 'letter', orientation: 'portrait' });
    expect([h3.cells[0]?.slide.w, h3.cells[0]?.slide.h]).toEqual([243, 182.25]);
    expect(h3.cells[0]?.lines).toHaveLength(10);
    const h4 = printLayout({ page, layout: 'handout-4', paper: 'letter', orientation: 'portrait' });
    expect([h4.cells[0]?.slide.w, h4.cells[0]?.slide.h]).toEqual([261, 195.75]);
    expect(Math.round(h4.k * 100) / 100).toBe(0.36);
    const h9 = printLayout({ page, layout: 'handout-9', paper: 'letter', orientation: 'portrait' });
    expect([h9.cells[0]?.slide.w, h9.cells[0]?.slide.h]).toEqual([168, 126]);
    expect(Math.round(h9.k * 100) / 100).toBe(0.23);
    const notes = printLayout({ page, layout: 'notes', paper: 'letter', orientation: 'portrait' });
    expect([notes.cells[0]?.slide.w, notes.cells[0]?.slide.h]).toEqual([421.2, 315.9]);
    expect(notes.notes?.lines).toBe(22);
  });

  it('answers the slide’s own paper as today’s page with no margin, footer or notes', () => {
    const out = printLayout({ layout: 'slides' });
    expect(out.slidePaper).toBe(true);
    expect(out.paper).toBe('slide');
    expect(out.paperPt).toEqual({ width: 960, height: 540 });
    expect(out.cells).toEqual([
      {
        index: 0,
        column: 0,
        row: 0,
        box: { x: 0, y: 0, w: 960, h: 540 },
        slide: { x: 0, y: 0, w: 960, h: 540 },
        lines: [],
      },
    ]);
    expect(out.k).toBe(1);
    expect(out.footer).toBeUndefined();
    expect(out.notes).toBeUndefined();
    const p43 = printLayout({ layout: 'slides', page: PAGE_PRESET_SIZES['standard-4-3'] });
    expect(p43.paperPt).toEqual({ width: 720, height: 540 });
    expect(() => printLayout({ layout: 'handout-2', paper: 'slide' })).toThrow(/one slide layout/);
  });

  it('fills across the rows by default and down the columns on request', () => {
    const across = printLayout({ layout: 'handout-6', paper: 'letter', orientation: 'portrait' });
    expect(across.cells.map((c) => [c.column, c.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ]);
    const down = printLayout({
      layout: 'handout-6',
      paper: 'letter',
      orientation: 'portrait',
      order: 'down',
    });
    expect(down.cells.map((c) => [c.column, c.row])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    // the second cell of a portrait 2 per page lies under the first, the gutter between
    const h2 = printLayout({ layout: 'handout-2', paper: 'letter', orientation: 'portrait' });
    expect(h2.cells[1]?.box).toEqual({ x: 36, y: 396, w: 540, h: 342 });
  });

  it('states the defaults, the papers, the grids and the page count', () => {
    expect(defaultOrientation('slides')).toBe('landscape');
    expect(defaultOrientation('notes')).toBe('portrait');
    expect(defaultOrientation('handout-6')).toBe('portrait');
    expect(defaultPaper('slides')).toBe('slide');
    expect(defaultPaper('handout-3')).toBe('letter');
    expect(paperForLocale('en-US')).toBe('letter');
    expect(paperForLocale('en-GB')).toBe('a4');
    expect(paperForLocale(undefined)).toBe('a4');
    expect(PAPER_PT.letter).toEqual({ width: 612, height: 792 });
    expect(PAPER_PT.a4).toEqual({ width: 595.28, height: 841.89 });
    expect(paperSizePt('a4', 'landscape', { width: 1600, height: 900 })).toEqual({
      width: 841.89,
      height: 595.28,
    });
    expect(handoutGrid('handout-2', 'landscape')).toEqual({ columns: 2, rows: 1 });
    expect(handoutGrid('handout-6', 'landscape')).toEqual({ columns: 3, rows: 2 });
    expect(printPageCount(6, 'handout-6')).toBe(1);
    expect(printPageCount(7, 'handout-6')).toBe(2);
    expect(printPageCount(28, 'handout-9')).toBe(4);
    expect(printPageCount(0, 'slides')).toBe(1);
    expect(pageSlides(['a', 'b', 'c', 'd', 'e'], 2, 1)).toEqual(['c', 'd']);
    expect(pageSlides(['a', 'b', 'c', 'd', 'e'], 2, 2)).toEqual(['e']);
    expect(ptToPx(0.6)).toBe(1);
    expect(containSlide({ x: 0, y: 0, w: 100, h: 100 }, { width: 1600, height: 900 })).toEqual({
      x: 0,
      y: 21.88,
      w: 100,
      h: 56.25,
    });
  });

  it('estimates the note lines a box holds', () => {
    expect(estimateNotesLines('', 540)).toBe(0);
    expect(estimateNotesLines('Short.', 540)).toBe(1);
    // two paragraphs separated by a blank line: one line each plus the blank between
    expect(estimateNotesLines('One.\n\nTwo.', 540)).toBe(3);
    const long = 'word '.repeat(400);
    expect(estimateNotesLines(long, 540)).toBeGreaterThan(15);
  });
});

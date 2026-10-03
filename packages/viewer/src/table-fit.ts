// The table's rows as the stage draws them (docs/archive/rounds/OBJECTS.md 3.3 items 3 and 4): what the row
// seam drag and the table's autofit read. A positioned table fills its box and its rows share
// the box's height (block-css.ts `.free > .table`), so the block's fields say nothing about the
// height a row draws at; the stage does. `readTableRows` reads, per row, the pitch drawn (the
// row's border box in the classic form, the union of its cells in the grid form, where the row
// is display contents) and the least the row can draw at (its tallest cell's paragraphs with the
// paddings and the rule), in sheet px, and `rowsMeasureFromFacts` is the arithmetic over those
// readings so a test pins it without a DOM. The Editor takes the measure at a row seam's press
// (table-seam.ts `tableSeamDrag`) and after a burst or a command that touched a table, where
// `tableGrowMutation` writes `pos.h` up when the rows are taller than the box (the table's
// autofit, the rule text blocks have as `grow`; text-fit.ts `growMutation`), so the ring meets
// the last rule. `tableRowsAddedMutation` is the pure sibling for a command that adds rows: the
// box grows by the rows' tracks in the same commit, with no stage to measure on.
import type { TableBlock, TableRow, TableRowsMeasure } from '@turboslide/schema/blocks/table';
import { tableGrownByRows, tableGrownHeight } from '@turboslide/schema/blocks/table';
import type { Mutation } from '@turboslide/schema/mutations';

/** One row as read from the stage, in CSS px: its box and, per drawn cell, the text's extent and the frame around it. */
export type RowFacts = {
  /** the row's top and bottom edges (the classic form's `.tr`, else the union of its cells) */
  top: number;
  bottom: number;
  /** the rule under the row when the row draws it (the classic form); 0 in the grid form, whose cells carry theirs */
  rule: number;
  cells: {
    /** the top of the first paragraph and the bottom of the last; equal when the cell has none */
    contentTop: number;
    contentBottom: number;
    /** the cell's paddings and its own rule (the grid form) */
    padTop: number;
    padBottom: number;
    rule: number;
  }[];
};

/** The whole table as read from the stage, in CSS px. */
export type TableFacts = {
  /** the hairline above the first row */
  top: number;
  rows: RowFacts[];
};

/** Sheet px at 1/100 from CSS px at the stage scale `k`. */
function sheet(px: number, k: number): number {
  return Math.round((px / k) * 100) / 100;
}

/**
 * The rows' measure from the stage's readings: the natural height is the tallest cell's text
 * with its paddings and the rule under the row, and the drawn pitch is the row's box, never
 * below the natural height (a row whose track is shorter than its text, a set height in a box
 * too short for it, overflows its track, and what the seam drag and the autofit must hold is the
 * text). A cell with no paragraph counts its paddings and rule alone.
 */
export function rowsMeasureFromFacts(facts: TableFacts, k: number): TableRowsMeasure {
  return {
    top: sheet(facts.top, k),
    rows: facts.rows.map((row) => {
      const drawn = Math.max(0, row.bottom - row.top);
      const content = row.cells.reduce(
        (max, cell) =>
          Math.max(
            max,
            Math.max(0, cell.contentBottom - cell.contentTop) +
              cell.padTop +
              cell.padBottom +
              cell.rule,
          ),
        0,
      );
      const natural = content + row.rule;
      return { drawn: sheet(Math.max(drawn, natural), k), natural: sheet(natural, k) };
    }),
  };
}

/** The drawn height of the rows with the hairline above, in sheet px: what `pos.h` must hold. */
export function tableRowsHeight(measure: TableRowsMeasure): number {
  return measure.top + measure.rows.reduce((sum, row) => sum + row.drawn, 0);
}

/** The least the rows can draw at with the hairline above, in sheet px: the resize handle's floor. */
export function tableRowsNaturalHeight(measure: TableRowsMeasure): number {
  return measure.top + measure.rows.reduce((sum, row) => sum + row.natural, 0);
}

function width(
  view: Window,
  el: Element,
  property: 'borderTopWidth' | 'borderBottomWidth',
): number {
  return parseFloat(view.getComputedStyle(el)[property]) || 0;
}

/**
 * The table's rows as the stage draws them, from the rendered `.table` element at the stage
 * scale `k` (the stage's width over 1600). Null when the element holds no row. Both forms read
 * alike: the classic form's `.tr` is a box with the rule under it, the grid form's `.tr` is
 * display contents and its cells carry the rules, so a row's box is the union of its cells.
 */
export function readTableRows(
  table: HTMLElement,
  k: number,
  view: Window,
): TableRowsMeasure | null {
  if (!(k > 0)) return null;
  const grid = table.classList.contains('grid');
  const rowEls = Array.from(table.querySelectorAll<HTMLElement>(':scope > .tr'));
  if (rowEls.length === 0) return null;
  const rows: RowFacts[] = rowEls.map((row) => {
    const cellEls = Array.from(row.querySelectorAll<HTMLElement>(':scope > .td'));
    let top = Infinity;
    let bottom = -Infinity;
    if (!grid) {
      const r = row.getBoundingClientRect();
      top = r.top;
      bottom = r.bottom;
    }
    const cells = cellEls.map((cell) => {
      const r = cell.getBoundingClientRect();
      if (grid) {
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      const cs = view.getComputedStyle(cell);
      const paras = Array.from(cell.querySelectorAll<HTMLElement>(':scope > .para'));
      const first = paras[0];
      const last = paras[paras.length - 1];
      const contentTop = first ? first.getBoundingClientRect().top : r.top;
      const contentBottom = last ? last.getBoundingClientRect().bottom : r.top;
      /* the computed paddings and rules are the sheet's own lengths (the sheet lays out at 1600 px
         and scales by k), while the rects are client px: the lengths are scaled to client px
         here so the measure adds like with like (read 64.5 for an empty 54 px row at k 0.705
         before: 29 + 25 / k; the integrator's reproduction of tables.resize.rows-share-extra) */
      return {
        contentTop,
        contentBottom,
        padTop: (parseFloat(cs.paddingTop) || 0) * k,
        padBottom: (parseFloat(cs.paddingBottom) || 0) * k,
        rule: grid ? (parseFloat(cs.borderBottomWidth) || 0) * k : 0,
      };
    });
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
      top = 0;
      bottom = 0;
    }
    return { top, bottom, rule: grid ? 0 : width(view, row, 'borderBottomWidth') * k, cells };
  });
  return rowsMeasureFromFacts({ top: width(view, table, 'borderTopWidth') * k, rows }, k);
}

/**
 * The `pos.h` write that lets a positioned table hold its rows: the rows' drawn height with the
 * hairline above when it exceeds the box by more than a pixel (the schema's `tableGrownHeight`,
 * the rule `withAutofit` applies to a `grow` text box), else null.
 */
export function tableGrowMutation(
  slideId: string,
  block: TableBlock & { pos?: { h: number } },
  measure: TableRowsMeasure | null,
): Mutation | null {
  const height = tableGrownHeight(block, measure === null ? null : tableRowsHeight(measure));
  if (height === null) return null;
  return { op: 'block.set', slideId, blockId: block.id, path: '/pos/h', value: height };
}

/**
 * The `pos.h` write of a command that added rows (Insert row above or below from the cell's menu,
 * Format > Table, the panel or a row head, Tab from the last cell, a grid pasted past the last
 * row): the box grown by the added rows' tracks through the schema's `tableGrownByRows`, to
 * travel in the same commit as the `/rows` write so the ring meets the last rule and one Cmd+Z
 * takes both back (VERIFICATION.md "Objects round, pass 1" finding 1). `rows` are the rows the
 * write lands. Null when nothing grows: a removal, the same count, a table with no box.
 */
export function tableRowsAddedMutation(
  slideId: string,
  block: TableBlock & { pos?: { h: number } },
  rows: ReadonlyArray<TableRow>,
): Mutation | null {
  const height = tableGrownByRows(block, rows);
  if (height === null) return null;
  return { op: 'block.set', slideId, blockId: block.id, path: '/pos/h', value: height };
}

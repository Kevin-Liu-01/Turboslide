// The seam handles of a selected table (docs/archive/rounds/RETURN.md 2.4 fix 5; docs/archive/rounds/OBJECTS.md 3.3 items 4
// and 5; Google drags a gridline between columns or rows, research 05 A6 "Resize"): one `v`
// handle on every inner column seam, placed from the header row's measured cell boxes, whose
// drag widens the column on its left and narrows the one on its right with the widths written on
// every column (the schema's `columnsAfterSeamDrag`), so the grid template stays proportional and
// the show, the PDF and the PowerPoint draw the same seam; and, since the objects round, one
// handle on the rule under every row, the last row's included, placed from the first column's
// measured cells, whose drag writes every row's height (the schema's `rowsAfterSeamDrag`: the
// moved row takes its drawn height plus the drag, never below its text, the others keep theirs)
// and the table's `pos.h` in the same commit, so the rows below move down and the seam under the
// last row grows the table. Both are the layout's `col-seam` kind with a `blockId` and an
// `index`; the row seam carries `axis: 'y'` and the window API id `handle.<block>.row.<n>`; the
// label a tooltip reads is the gesture alone, "Column seam 2", never the block's id (docs/archive/rounds/POLISH.md
// 2.6 item 60: a seller read "table-2: Column seam 2" and a hash on a pasted table). The
// overlay draws a `v` handle as a vertical rule and tells a row seam by its axis (Overlay.tsx);
// the Editor tells a table seam from the layout's by the block (Gestures.tsx `Handle.blockId`,
// "absent for the slide-level handles") and routes the drag by the axis through
// `tableSeamDrag`. Pure functions, pinned by table-seam.test.ts; the Editor wires the drag, the
// nudge and the readout, and reads the rows' measure from the stage through table-fit.ts.
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { TableRowsMeasure } from '@turboslide/schema/blocks/table';
import {
  columnShares,
  columnsAfterSeamDrag,
  rowsAfterSeamDrag,
} from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Box } from '@turboslide/schema/render';

import type { GestureReadout } from './gesture-life';
import type { Handle } from './Gestures';
import { HANDLE_HIT } from './Gestures';

/** A table block as the Editor holds it: the fields with the canvas position a positioned table carries (schema blocks.ts BlockBase). */
export type PositionedTable = TableBlock & { pos?: { h: number } };

/** A seam handle: the layout's kind on a table block, one per seam; `axis` tells a column seam (`x`) from a row seam (`y`). */
export type TableSeamHandle = Handle & { kind: 'col-seam'; blockId: string; index: number };

export function isTableSeamHandle(handle: Handle): handle is TableSeamHandle {
  return handle.kind === 'col-seam' && handle.blockId !== undefined && handle.index !== undefined;
}

/** A table seam whose drag moves a row rule up or down (docs/archive/rounds/OBJECTS.md 3.3 item 4). */
export function isTableRowSeamHandle(handle: Handle): handle is TableSeamHandle & { axis: 'y' } {
  return isTableSeamHandle(handle) && handle.axis === 'y';
}

/** The pointer of a table cell as data-run writes it. */
function cellRun(blockId: string, row: number, column: number): string {
  return `${blockId}/rows/${row}/cells/${column}`;
}

/**
 * The seam x positions of a table `box` px wide, in sheet px: the right edge of each header
 * cell as measured, else the drawn shares of the block's columns from the box's left edge.
 */
export function tableSeamXs(
  block: TableBlock,
  box: Box,
  runs: Readonly<Record<string, Box>>,
): number[] {
  const shares = columnShares(block.columns, box[2]);
  const xs: number[] = [];
  let x = box[0];
  for (let c = 0; c < block.columns.length - 1; c += 1) {
    x += shares[c] ?? 0;
    const cell = runs[cellRun(block.id, 0, c)];
    xs.push(cell ? cell[0] + cell[2] : x);
  }
  return xs;
}

/**
 * The handles of the seams between a selected table's columns: `v` handles the table's height
 * over each seam, `handle.<block>.column.<c>` for the window API, the drag direction to the right.
 * None for a table of one column or one with no measured box.
 */
export function tableSeamHandles(
  block: TableBlock,
  box: Box | undefined,
  runs: Readonly<Record<string, Box>>,
): TableSeamHandle[] {
  if (!box || block.columns.length < 2) return [];
  return tableSeamXs(block, box, runs).map((x, index) => ({
    id: `col-seam:${block.id}:${index}`,
    kind: 'col-seam',
    box: [x - HANDLE_HIT / 2, box[1], HANDLE_HIT, box[3]],
    blockId: block.id,
    index,
    cursor: 'col-resize',
    label: `Column seam ${index + 1}`,
    control: `handle.${block.id}.column.${index}`,
    shape: 'v',
    axis: 'x',
    sign: 1,
  }));
}

/**
 * The seam y positions under every row of a table, in sheet px, the last row's included: the
 * bottom edge of the row's first drawn cell as measured (the rule sits within a pixel of it in
 * both forms: under the cell in the classic form, inside its box in the grid form), else the
 * rows' equal shares of the box from its top edge. A merged cell that covers the first column
 * leaves the row's own cell unmeasured; the next measured cell of the row stands in.
 */
export function tableRowSeamYs(
  block: TableBlock,
  box: Box,
  runs: Readonly<Record<string, Box>>,
): number[] {
  const n = block.rows.length;
  return block.rows.map((row, r) => {
    for (let c = 0; c < row.cells.length; c += 1) {
      const cell = runs[cellRun(block.id, r, c)];
      if (cell) return cell[1] + cell[3];
    }
    return box[1] + (box[3] * (r + 1)) / n;
  });
}

/**
 * The handles on the rules under a selected table's rows (docs/archive/rounds/OBJECTS.md 3.3 item 4; ship one
 * P1 item 1): one per row, the table's width along each rule, `handle.<block>.row.<r>` for the
 * window API, the drag direction down; the one under the last row grows the table. None for a
 * table with no measured box.
 */
export function tableRowSeamHandles(
  block: TableBlock,
  box: Box | undefined,
  runs: Readonly<Record<string, Box>>,
): TableSeamHandle[] {
  if (!box || block.rows.length < 1) return [];
  return tableRowSeamYs(block, box, runs).map((y, index) => ({
    id: `row-seam:${block.id}:${index}`,
    kind: 'col-seam',
    box: [box[0], y - HANDLE_HIT / 2, box[2], HANDLE_HIT],
    blockId: block.id,
    index,
    cursor: 'ns-resize',
    label: `Row seam ${index + 1}`,
    control: `handle.${block.id}.row.${index}`,
    shape: 'v',
    axis: 'y',
    sign: 1,
  }));
}

/**
 * The `block.set /columns` a seam drag of `dx` px stands for, with the widths of the two columns
 * it moved for the readout; null when nothing changes (a click, a seam at the smallest column).
 */
export function tableSeamMutation(
  slide: Slide,
  block: TableBlock,
  tableWidth: number,
  index: number,
  dx: number,
): { mutation: Mutation; left: number; right: number } | null {
  const next = columnsAfterSeamDrag(block.columns, tableWidth, index, dx);
  if (next === null) return null;
  return {
    mutation: {
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: '/columns',
      value: next.columns,
    },
    left: next.left,
    right: next.right,
  };
}

/**
 * The writes a row seam drag of `dy` px stands for: `block.set /rows` with every row's height
 * (the schema's `rowsAfterSeamDrag` over the rows' measure read from the stage, table-fit.ts)
 * and, for a positioned table, `block.set /pos/h` with the rows' new sum and the hairline above,
 * both in one commit; `height` is the moved row's new height for the readout. Null when nothing
 * changes (a click, a row at its text's height).
 */
export function tableRowSeamMutations(
  slide: Slide,
  block: PositionedTable,
  measure: TableRowsMeasure,
  index: number,
  dy: number,
): { mutations: Mutation[]; height: number; boxHeight: number } | null {
  const next = rowsAfterSeamDrag(block, measure, index, dy);
  if (next === null) return null;
  const mutations: Mutation[] = [
    { op: 'block.set', slideId: slide.id, blockId: block.id, path: '/rows', value: next.rows },
  ];
  if (block.pos !== undefined && next.boxHeight !== Math.round(block.pos.h))
    mutations.push({
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: '/pos/h',
      value: next.boxHeight,
    });
  return { mutations, height: next.height, boxHeight: next.boxHeight };
}

/** What the Editor hands a seam drag: the slide, the table, its drawn width and its rows' measure from the stage. */
export type TableSeamContext = {
  slide: Slide;
  block: PositionedTable;
  /** the table's width in sheet px: its `pos` on a canvas, else its measured box */
  width: number;
  /** the rows' drawn and natural heights, read at the press (table-fit.ts `readTableRows`); a row seam needs it */
  measure: TableRowsMeasure | null;
};

/**
 * One seam drag of either axis as the Editor's gesture reads it (Editor.tsx `moveGesture`): the
 * mutations to preview and to commit and the readout beside the handle, the moved column's
 * width or the moved row's height in px (both through the `width` readout, which reads "N px").
 * `dx` and `dy` are the pointer's travel from the press in sheet px; a column seam reads `dx`,
 * a row seam `dy`. Null mutations and no readout when nothing changes.
 */
export function tableSeamDrag(
  handle: TableSeamHandle,
  ctx: TableSeamContext,
  dx: number,
  dy: number,
): { mutations: Mutation[]; readout: GestureReadout } {
  if (handle.axis === 'y') {
    if (ctx.measure === null) return { mutations: [], readout: null };
    const seam = tableRowSeamMutations(ctx.slide, ctx.block, ctx.measure, handle.index, dy);
    return seam === null
      ? { mutations: [], readout: null }
      : { mutations: seam.mutations, readout: { kind: 'width', value: seam.height } };
  }
  const seam = tableSeamMutation(ctx.slide, ctx.block, ctx.width, handle.index, dx);
  return seam === null
    ? { mutations: [], readout: null }
    : { mutations: [seam.mutation], readout: { kind: 'width', value: seam.left } };
}

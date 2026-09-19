// The column seam handles of a selected table (docs/RETURN.md 2.4 fix 5; Google drags a gridline
// between columns, research 05 A6 "Resize"): one `v` handle on every inner seam of the selected
// table, placed from the header row's measured cell boxes, whose drag widens the column on its
// left and narrows the one on its right with the widths written on every column (the schema's
// `columnsAfterSeamDrag`), so the grid template stays proportional and the show, the PDF and the
// PowerPoint draw the same seam. The handle kind is the layout's `col-seam` with a `blockId` and
// an `index`: the overlay draws it as any vertical edge, and the Editor tells the two apart by the
// block (Gestures.tsx `Handle.blockId`, "absent for the slide-level handles"). Pure functions,
// pinned by table-seam.test.ts; the Editor wires the drag, the nudge and the readout.
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { columnShares, columnsAfterSeamDrag } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Box } from '@turboslide/schema/render';

import type { Handle } from './Gestures';
import { HANDLE_HIT } from './Gestures';

/** A seam handle: the layout's kind on a table block, one per inner seam. */
export type TableSeamHandle = Handle & { kind: 'col-seam'; blockId: string; index: number };

export function isTableSeamHandle(handle: Handle): handle is TableSeamHandle {
  return handle.kind === 'col-seam' && handle.blockId !== undefined && handle.index !== undefined;
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
    label: `${block.id}: Column seam ${index + 1}`,
    control: `handle.${block.id}.column.${index}`,
    shape: 'v',
    axis: 'x',
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

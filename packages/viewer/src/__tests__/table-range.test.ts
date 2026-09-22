import { describe, expect, it } from 'vitest';

import { emptyTable } from '@turboslide/schema/blocks/table';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Box } from '@turboslide/schema/render';

import {
  adjacentCell,
  cellAtPoint,
  cellInBounds,
  cellRunPointer,
  clampCell,
  drawnCellsIn,
  isMultiCell,
  rangeBounds,
  rangeBox,
  rangeStands,
  rowsWithRangeCleared,
  tableRangeShapeOf,
} from '../table-range';

// The cell range of a selected table (docs/RETURN.md 2.4; the matrix rows
// tables.cells.merge-unmerge and tables.tail.merge-unmerge-buttons): the bounds the plans read, the
// box the overlay draws, the texts Delete clears, and when the range ends.

function table(rows: string[][]): TableBlock {
  const t = emptyTable('tbl', rows[0]?.length ?? 1, rows.length);
  t.rows = rows.map((cells, i) => ({ cells, ...(i === 0 ? { header: true as const } : {}) }));
  return t;
}

const grid = table([
  ['Region', 'Q1', 'Q2', 'Q3'],
  ['North', '100', '200', '300'],
  ['South', '400', '500', '600'],
]);

describe('rangeBounds', () => {
  it('orders the anchor and the focus whichever way the gesture went', () => {
    const forward = rangeBounds(grid, {
      blockId: 'tbl',
      anchor: { row: 1, col: 0 },
      focus: { row: 1, col: 1 },
    });
    expect(forward).toEqual({ r0: 1, c0: 0, r1: 1, c1: 1 });
    const backward = rangeBounds(grid, {
      blockId: 'tbl',
      anchor: { row: 2, col: 3 },
      focus: { row: 0, col: 1 },
    });
    expect(backward).toEqual({ r0: 0, c0: 1, r1: 2, c1: 3 });
  });

  it('clamps a focus that left the grid to its last row and column', () => {
    expect(clampCell(grid, { row: 9, col: -2 })).toEqual({ row: 2, col: 0 });
    expect(
      rangeBounds(grid, { blockId: 'tbl', anchor: { row: 1, col: 1 }, focus: { row: 9, col: 9 } }),
    ).toEqual({ r0: 1, c0: 1, r1: 2, c1: 3 });
  });

  it('grows over a merged cell the range touches so the merged cell is selected whole', () => {
    const merged = { ...grid, spans: [{ row: 1, column: 1, rows: 2, columns: 2 }] };
    expect(
      rangeBounds(merged, {
        blockId: 'tbl',
        anchor: { row: 1, col: 0 },
        focus: { row: 1, col: 1 },
      }),
    ).toEqual({ r0: 1, c0: 0, r1: 2, c1: 2 });
    /* a range beside the merged cell stays where it is */
    expect(
      rangeBounds(merged, {
        blockId: 'tbl',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 3 },
      }),
    ).toEqual({ r0: 0, c0: 0, r1: 0, c1: 3 });
  });
});

describe('isMultiCell and drawnCellsIn', () => {
  it('needs two drawn cells: a merged cell counts as one', () => {
    expect(
      isMultiCell(grid, { blockId: 'tbl', anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } }),
    ).toBe(false);
    expect(
      isMultiCell(grid, { blockId: 'tbl', anchor: { row: 1, col: 0 }, focus: { row: 1, col: 1 } }),
    ).toBe(true);
    const merged = { ...grid, spans: [{ row: 1, column: 1, rows: 2, columns: 2 }] };
    expect(
      isMultiCell(merged, {
        blockId: 'tbl',
        anchor: { row: 1, col: 1 },
        focus: { row: 2, col: 2 },
      }),
    ).toBe(false);
    expect(drawnCellsIn(merged, { r0: 1, c0: 1, r1: 2, c1: 2 })).toEqual([[1, 1]]);
  });

  it('reads whether a cell lies in the bounds', () => {
    const bounds = { r0: 1, c0: 0, r1: 1, c1: 1 };
    expect(cellInBounds(bounds, { row: 1, col: 1 })).toBe(true);
    expect(cellInBounds(bounds, { row: 2, col: 1 })).toBe(false);
    expect(cellRunPointer({ row: 2, col: 1 })).toBe('rows/2/cells/1');
  });
});

describe('rangeBox', () => {
  const runs: Record<string, Box> = {
    'tbl/rows/1/cells/0': [320, 350, 240, 60],
    'tbl/rows/1/cells/1': [560, 350, 240, 60],
    'tbl/rows/2/cells/0': [320, 410, 240, 60],
    'tbl/rows/2/cells/1': [560, 410, 240, 60],
  };

  it('unions the measured cells of the range', () => {
    expect(rangeBox(grid, { r0: 1, c0: 0, r1: 1, c1: 1 }, runs)).toEqual([320, 350, 480, 60]);
    expect(rangeBox(grid, { r0: 1, c0: 0, r1: 2, c1: 1 }, runs)).toEqual([320, 350, 480, 120]);
  });

  it('answers null when no cell of the range was measured', () => {
    expect(rangeBox(grid, { r0: 0, c0: 2, r1: 0, c1: 3 }, runs)).toBeNull();
  });

  it('finds the cell under a sheet point, and none outside the table or on another block', () => {
    expect(cellAtPoint('tbl', runs, { x: 600, y: 430 })).toEqual({ row: 2, col: 1 });
    expect(cellAtPoint('tbl', runs, { x: 320, y: 350 })).toEqual({ row: 1, col: 0 });
    expect(cellAtPoint('tbl', runs, { x: 900, y: 430 })).toBeNull();
    expect(cellAtPoint('other', runs, { x: 600, y: 430 })).toBeNull();
    expect(cellAtPoint('tbl', { 'tbl/text': [0, 0, 1600, 900] }, { x: 600, y: 430 })).toBeNull();
  });

  it('leaves out the cells a merged cell covers and takes the anchor cell whole', () => {
    const merged = { ...grid, spans: [{ row: 1, column: 0, rows: 2, columns: 1 }] };
    const tall: Record<string, Box> = {
      'tbl/rows/1/cells/0': [320, 350, 240, 120],
      'tbl/rows/1/cells/1': [560, 350, 240, 60],
      'tbl/rows/2/cells/1': [560, 410, 240, 60],
    };
    expect(rangeBox(merged, { r0: 1, c0: 0, r1: 2, c1: 1 }, tall)).toEqual([320, 350, 480, 120]);
  });
});

describe('rowsWithRangeCleared', () => {
  it('empties the texts of the range and leaves the other cells and the header flag', () => {
    const rows = rowsWithRangeCleared(grid, { r0: 1, c0: 1, r1: 2, c1: 2 });
    expect(rows).not.toBeNull();
    expect(rows?.map((row) => row.cells)).toEqual([
      ['Region', 'Q1', 'Q2', 'Q3'],
      ['North', '', '', '300'],
      ['South', '', '', '600'],
    ]);
    expect(rows?.[0]).toMatchObject({ header: true });
    /* the block is not written to */
    expect(grid.rows[1]?.cells[1]).toBe('100');
  });

  it('answers null when every cell of the range is empty already', () => {
    const blank = table([
      ['', ''],
      ['', ''],
    ]);
    expect(rowsWithRangeCleared(blank, { r0: 0, c0: 0, r1: 1, c1: 1 })).toBeNull();
  });
});

describe('rangeStands', () => {
  it('holds while the grid and the merged cells are as they were', () => {
    const shape = tableRangeShapeOf(grid);
    expect(rangeStands(shape, grid)).toBe(true);
    expect(rangeStands(shape, { ...grid, rows: [...grid.rows, { cells: ['', '', '', ''] }] })).toBe(
      false,
    );
    expect(rangeStands(shape, { ...grid, columns: grid.columns.slice(0, 3) })).toBe(false);
    expect(
      rangeStands(shape, { ...grid, spans: [{ row: 1, column: 0, rows: 1, columns: 2 }] }),
    ).toBe(false);
  });

  it('holds through a text change, which never ends a range', () => {
    const shape = tableRangeShapeOf(grid);
    const typed = { ...grid, rows: grid.rows.map((row) => ({ ...row, cells: [...row.cells] })) };
    if (typed.rows[1]) typed.rows[1].cells[1] = '101';
    expect(rangeStands(shape, typed)).toBe(true);
  });
});

describe('adjacentCell (docs/FEATURES.md 2.2 rank 5: the arrows cross cells at the text edges)', () => {
  it('walks the drawn cells in reading order for Left and Right and stops at the grid', () => {
    expect(adjacentCell(grid, { row: 1, col: 1 }, 'right')).toEqual({ row: 1, col: 2 });
    expect(adjacentCell(grid, { row: 1, col: 3 }, 'right')).toEqual({ row: 2, col: 0 });
    expect(adjacentCell(grid, { row: 2, col: 3 }, 'right')).toBeNull();
    expect(adjacentCell(grid, { row: 1, col: 0 }, 'left')).toEqual({ row: 0, col: 3 });
    expect(adjacentCell(grid, { row: 0, col: 0 }, 'left')).toBeNull();
  });

  it('takes the cell above or below in the same column for Up and Down and stops at the first and last row', () => {
    expect(adjacentCell(grid, { row: 1, col: 2 }, 'down')).toEqual({ row: 2, col: 2 });
    expect(adjacentCell(grid, { row: 2, col: 2 }, 'down')).toBeNull();
    expect(adjacentCell(grid, { row: 1, col: 2 }, 'up')).toEqual({ row: 0, col: 2 });
    expect(adjacentCell(grid, { row: 0, col: 2 }, 'up')).toBeNull();
  });

  it('counts a merged cell as one: its anchor is the stop, a covered position resolves to it, Down steps past its rows', () => {
    const merged: TableBlock = {
      ...grid,
      rows: [...grid.rows, { cells: ['West', '7', '8', '9'] }],
      spans: [{ row: 1, column: 1, rows: 2, columns: 2 }],
    };
    /* Right from North lands on the anchor and then skips the covered 1,2 */
    expect(adjacentCell(merged, { row: 1, col: 0 }, 'right')).toEqual({ row: 1, col: 1 });
    expect(adjacentCell(merged, { row: 1, col: 1 }, 'right')).toEqual({ row: 1, col: 3 });
    /* Left from 1,3 lands on the anchor; a position inside the span resolves to the anchor first */
    expect(adjacentCell(merged, { row: 1, col: 3 }, 'left')).toEqual({ row: 1, col: 1 });
    expect(adjacentCell(merged, { row: 2, col: 2 }, 'left')).toEqual({ row: 1, col: 0 });
    /* Down from the anchor steps past the two rows it spans; Up into the span lands on the anchor */
    expect(adjacentCell(merged, { row: 1, col: 1 }, 'down')).toEqual({ row: 3, col: 1 });
    expect(adjacentCell(merged, { row: 3, col: 2 }, 'up')).toEqual({ row: 1, col: 1 });
    expect(adjacentCell(merged, { row: 0, col: 2 }, 'down')).toEqual({ row: 1, col: 1 });
  });

  it('clamps a position outside the grid before it walks', () => {
    expect(adjacentCell(grid, { row: 9, col: 9 }, 'left')).toEqual({ row: 2, col: 2 });
  });
});

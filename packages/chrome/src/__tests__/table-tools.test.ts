import { describe, expect, it } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import { applyTableCommand, emptyTable } from '@turboslide/schema/blocks/table';

import {
  SELECT_CELL,
  SELECT_CELLS,
  SELECT_MERGED,
  TABLE_FULL_ROWS,
  cellStyleAt,
  cellsInRange,
  clampCell,
  edgeInsert,
  headRange,
  isHeaderRow,
  isMergedAnchor,
  nextCell,
  rangeOf,
  rowsWithHeader,
  tableCommandOfItem,
  tablePlan,
  tableWriteInput,
} from '../table-tools';

// The table tool plans (gslides-parity SPEC-2 2.7, section 3, 11.5 table-tools.test.ts): from a
// cell or a range to the inputs of table.insertRows, insertColumns, deleteRows, deleteColumns,
// distribute, merge, unmerge and cellStyle, and block.set /border; the refusals with their
// sentences; the range growing over merged cells; Tab walking across merged cells; the row ids
// of Format > Table mapping to commands.

function table(): TableBlock {
  const block = emptyTable('t', 4, 4);
  return {
    ...block,
    rows: block.rows.map((row, r) => ({ ...row, cells: row.cells.map((_cell, c) => `${r},${c}`) })),
    spans: [{ row: 1, column: 1, rows: 2, columns: 2 }],
    cells: [{ row: 0, column: 0, fill: 'plate' }],
  };
}

describe('rangeOf', () => {
  it('orders and clamps a range, and one cell is a one cell range', () => {
    const block = table();
    expect(rangeOf(block, { cells: { r0: 3, c0: 3, r1: 0, c1: 0 } })).toEqual({
      r0: 0,
      c0: 0,
      r1: 3,
      c1: 3,
    });
    expect(rangeOf(block, { cell: [9, 9] })).toEqual({ r0: 3, c0: 3, r1: 3, c1: 3 });
    expect(rangeOf(block, {})).toBeNull();
  });

  it('grows over the merged cells it touches so a merge never crosses another', () => {
    const block = table();
    /* the caret in a covered cell selects the whole merged extent */
    expect(rangeOf(block, { cell: [2, 2] })).toEqual({ r0: 1, c0: 1, r1: 2, c1: 2 });
    /* a range touching one corner of the merged cells takes them whole */
    expect(rangeOf(block, { cells: { r0: 0, c0: 0, r1: 1, c1: 1 } })).toEqual({
      r0: 0,
      c0: 0,
      r1: 2,
      c1: 2,
    });
  });

  it('lists the cells of a range without the covered ones', () => {
    const block = table();
    const range = rangeOf(block, { cells: { r0: 1, c0: 1, r1: 2, c1: 3 } });
    expect(range).toEqual({ r0: 1, c0: 1, r1: 2, c1: 3 });
    expect(cellsInRange(block, range!)).toEqual([
      [1, 1],
      [1, 3],
      [2, 3],
    ]);
  });
});

describe('tablePlan', () => {
  it('inserts as many rows as the range holds, above at the first row and below at the last', () => {
    const block = table();
    expect(tablePlan(block, { cells: { r0: 1, c0: 0, r1: 2, c1: 0 } }, 'insertRowsAbove')).toEqual({
      action: 'table.insertRows',
      input: { blockId: 't', at: 1, count: 2, where: 'above' },
    });
    expect(tablePlan(block, { cell: [3, 0] }, 'insertRowsBelow', { count: 2 })).toEqual({
      action: 'table.insertRows',
      input: { blockId: 't', at: 3, count: 2, where: 'below' },
    });
    expect(tablePlan(block, { cell: [0, 2] }, 'insertColumnsLeft')).toEqual({
      action: 'table.insertColumns',
      input: { blockId: 't', at: 2, count: 1, where: 'left' },
    });
    expect(
      tablePlan(block, { cells: { r0: 0, c0: 2, r1: 0, c1: 3 } }, 'insertColumnsRight'),
    ).toEqual({
      action: 'table.insertColumns',
      input: { blockId: 't', at: 3, count: 2, where: 'right' },
    });
  });

  it('refuses an insert on a full table and clamps a count to the room left', () => {
    const full = emptyTable('f', 2, 20);
    expect(tablePlan(full, { cell: [0, 0] }, 'insertRowsBelow')).toEqual({
      refused: TABLE_FULL_ROWS,
    });
    const nearly = emptyTable('n', 2, 19);
    expect(tablePlan(nearly, { cell: [0, 0] }, 'insertRowsBelow', { count: 5 })).toEqual({
      action: 'table.insertRows',
      input: { blockId: 'n', at: 0, count: 1, where: 'below' },
    });
  });

  it('deletes the rows or columns of the range', () => {
    const block = table();
    expect(tablePlan(block, { cell: [3, 1] }, 'deleteRows')).toEqual({
      action: 'table.deleteRows',
      input: { blockId: 't', from: 3 },
    });
    expect(tablePlan(block, { cells: { r0: 0, c0: 0, r1: 0, c1: 3 } }, 'deleteColumns')).toEqual({
      action: 'table.deleteColumns',
      input: { blockId: 't', from: 0, to: 3 },
    });
    /* a caret in the merged cells deletes their whole extent */
    expect(tablePlan(block, { cell: [2, 2] }, 'deleteRows')).toEqual({
      action: 'table.deleteRows',
      input: { blockId: 't', from: 1, to: 2 },
    });
  });

  it('distributes every row when one cell is selected, the range when several are, with the measured total', () => {
    const block = table();
    expect(tablePlan(block, { cell: [0, 0] }, 'distributeRows', { total: 320 })).toEqual({
      action: 'table.distribute',
      input: { blockId: 't', axis: 'rows', total: 320 },
    });
    expect(
      tablePlan(block, { cells: { r0: 0, c0: 0, r1: 0, c1: 2 } }, 'distributeColumns'),
    ).toEqual({
      action: 'table.distribute',
      input: { blockId: 't', axis: 'columns', range: [0, 2] },
    });
  });

  it('merges a range of two cells or more and refuses one cell', () => {
    const block = table();
    expect(tablePlan(block, { cells: { r0: 0, c0: 0, r1: 0, c1: 1 } }, 'merge')).toEqual({
      action: 'table.merge',
      input: { blockId: 't', from: [0, 0], to: [0, 1] },
    });
    expect(tablePlan(block, { cell: [0, 0] }, 'merge')).toEqual({ refused: SELECT_CELLS });
    /* the merged cells alone count as one cell */
    expect(tablePlan(block, { cells: { r0: 1, c0: 1, r1: 2, c1: 2 } }, 'merge')).toEqual({
      refused: SELECT_CELLS,
    });
    expect(tablePlan(block, {}, 'merge')).toEqual({ refused: SELECT_CELL });
  });

  it('unmerges the merged cells under the caret or inside the range and refuses elsewhere', () => {
    const block = table();
    expect(tablePlan(block, { cell: [2, 2] }, 'unmerge')).toEqual({
      action: 'table.unmerge',
      input: { blockId: 't', at: [1, 1] },
    });
    expect(tablePlan(block, { cells: { r0: 0, c0: 0, r1: 3, c1: 3 } }, 'unmerge')).toEqual({
      action: 'table.unmerge',
      input: { blockId: 't', at: [1, 1] },
    });
    expect(tablePlan(block, { cell: [0, 0] }, 'unmerge')).toEqual({ refused: SELECT_MERGED });
    expect(isMergedAnchor(block, [1, 1])).toBe(true);
    expect(isMergedAnchor(block, [2, 1])).toBe(true);
    expect(isMergedAnchor(block, [0, 0])).toBe(false);
    expect(isMergedAnchor(block, undefined)).toBe(false);
  });

  it('styles the cells of the range: a fill, a border, weight 0 for Transparent, null to clear', () => {
    const block = table();
    expect(
      tablePlan(block, { cells: { r0: 0, c0: 0, r1: 0, c1: 1 } }, 'cellFill', { fill: 'plate' }),
    ).toEqual({
      action: 'table.cellStyle',
      input: {
        blockId: 't',
        cells: [
          [0, 0],
          [0, 1],
        ],
        fill: 'plate',
      },
    });
    expect(tablePlan(block, { cell: [0, 0] }, 'cellFill', { fill: null })).toEqual({
      action: 'table.cellStyle',
      input: { blockId: 't', cells: [[0, 0]], fill: null },
    });
    expect(tablePlan(block, { cell: [3, 3] }, 'cellBorder', { border: { weight: 0 } })).toEqual({
      action: 'table.cellStyle',
      input: { blockId: 't', cells: [[3, 3]], border: { weight: 0 } },
    });
    expect(tablePlan(block, { cell: [3, 3] }, 'cellBorder')).toEqual({
      action: 'table.cellStyle',
      input: { blockId: 't', cells: [[3, 3]], border: null },
    });
    expect(cellStyleAt(block, [0, 0])).toEqual({ fill: 'plate' });
    expect(cellStyleAt(block, [1, 1])).toEqual({});
  });

  it('writes the table border over the current one and removes it with null, without a cell', () => {
    const block: TableBlock = { ...table(), border: { weight: 1, color: 'ink' } };
    expect(tablePlan(block, {}, 'tableBorder', { border: { dash: 'dot' } })).toEqual({
      action: 'block.set',
      input: { blockId: 't', path: '/border', value: { weight: 1, color: 'ink', dash: 'dot' } },
    });
    expect(tablePlan(block, {}, 'tableBorder', { border: { weight: 0 } })).toEqual({
      action: 'block.set',
      input: { blockId: 't', path: '/border', value: { weight: 0, color: 'ink' } },
    });
    expect(tablePlan(block, {}, 'tableBorder', { border: null })).toEqual({
      action: 'block.set',
      input: { blockId: 't', path: '/border' },
    });
    expect(tablePlan(table(), {}, 'tableBorder', { border: { weight: 2 } })).toEqual({
      action: 'block.set',
      input: { blockId: 't', path: '/border', value: { weight: 2 } },
    });
  });

  it('every plan applies through the schema’s command and the write input carries the slide and the revision', () => {
    const block = table();
    const merge = tablePlan(block, { cells: { r0: 0, c0: 0, r1: 0, c1: 3 } }, 'merge');
    expect('action' in merge).toBe(true);
    if ('action' in merge) {
      const edit = applyTableCommand(block, {
        kind: 'merge',
        from: merge.input.from as [number, number],
        to: merge.input.to as [number, number],
      });
      expect('deleted' in edit).toBe(false);
      if (!('deleted' in edit)) expect(edit.spans).toHaveLength(2);
      expect(tableWriteInput(merge, 'slide-1', 12)).toEqual({
        slideId: 'slide-1',
        blockId: 't',
        from: [0, 0],
        to: [0, 3],
        baseRevision: 12,
      });
    }
  });
});

describe('nextCell', () => {
  it('walks Tab and Shift+Tab across merged cells, stopping on the anchor once', () => {
    const block = table();
    expect(nextCell(block, { row: 1, column: 0 }, 1)).toEqual({ row: 1, column: 1 });
    /* the covered cell (1, 2) is skipped */
    expect(nextCell(block, { row: 1, column: 1 }, 1)).toEqual({ row: 1, column: 3 });
    /* the covered row start (2, 1) and (2, 2) are skipped */
    expect(nextCell(block, { row: 2, column: 0 }, 1)).toEqual({ row: 2, column: 3 });
    expect(nextCell(block, { row: 2, column: 3 }, -1)).toEqual({ row: 2, column: 0 });
    expect(nextCell(block, { row: 1, column: 3 }, -1)).toEqual({ row: 1, column: 1 });
    expect(nextCell(block, { row: 3, column: 3 }, 1)).toBe('append');
    expect(nextCell(block, { row: 0, column: 0 }, -1)).toBeNull();
  });

  it('clamps a caret into a smaller grid after a delete', () => {
    expect(clampCell({ rows: [{ cells: [''] }], columns: [{}] }, { row: 5, column: 5 })).toEqual({
      row: 0,
      column: 0,
    });
  });
});

describe('tableCommandOfItem', () => {
  it('names the command of every Format > Table row and null for another row', () => {
    expect(tableCommandOfItem('format.table.insertRowAbove')).toBe('insertRowsAbove');
    expect(tableCommandOfItem('format.table.insertRowBelow')).toBe('insertRowsBelow');
    expect(tableCommandOfItem('format.table.insertColumnLeft')).toBe('insertColumnsLeft');
    expect(tableCommandOfItem('format.table.insertColumnRight')).toBe('insertColumnsRight');
    expect(tableCommandOfItem('format.table.deleteRow')).toBe('deleteRows');
    expect(tableCommandOfItem('format.table.deleteColumn')).toBe('deleteColumns');
    expect(tableCommandOfItem('format.table.distributeRows')).toBe('distributeRows');
    expect(tableCommandOfItem('format.table.distributeColumns')).toBe('distributeColumns');
    expect(tableCommandOfItem('format.table.mergeCells')).toBe('merge');
    expect(tableCommandOfItem('format.table.unmergeCells')).toBe('unmerge');
    /* the row head's check row (docs/OBJECTS.md 3.3 item 4; build/b5.md R1) */
    expect(tableCommandOfItem('format.table.headerRow')).toBe('toggleHeader');
    expect(tableCommandOfItem('format.table.deleteTable')).toBeNull();
  });
});

// The table's own controls of the objects round (docs/OBJECTS.md 3.3 items 4 and 6; 6.4
// table-tools.test.ts): the header toggle as one /rows write, the range a row or column head
// names, and the one commit of the edge "+" that keeps every other width.

describe('the header row toggle', () => {
  it('flips rows[0].header as one block.set /rows and leaves the other rows alone', () => {
    const block = table();
    expect(isHeaderRow(block)).toBe(true);
    const off = tablePlan(block, {}, 'toggleHeader');
    expect(off).toEqual({
      action: 'block.set',
      input: { blockId: 't', path: '/rows', value: rowsWithHeader(block, false) },
    });
    const rows = ('input' in off ? off.input.value : []) as TableBlock['rows'];
    expect(rows[0]?.header).toBeUndefined();
    expect(rows.slice(1)).toEqual(block.rows.slice(1));
    const cleared = { ...block, rows };
    expect(isHeaderRow(cleared)).toBe(false);
    const on = tablePlan(cleared, { cell: [2, 2] }, 'toggleHeader');
    expect('input' in on && (on.input.value as TableBlock['rows'])[0]?.header).toBe(true);
  });
});

describe('headRange', () => {
  it('names every cell of the column above the band, or of the row left of it, and null off the grid', () => {
    const block = table();
    expect(headRange(block, 'column', 2)).toEqual({ r0: 0, c0: 2, r1: 3, c1: 2 });
    expect(headRange(block, 'row', 1)).toEqual({ r0: 1, c0: 0, r1: 1, c1: 3 });
    expect(headRange(block, 'column', 4)).toBeNull();
    expect(headRange(block, 'row', -1)).toBeNull();
    expect(headRange({ rows: [], columns: [] }, 'row', 0)).toBeNull();
  });
});

describe('edgeInsert', () => {
  const pos = { x: 320, y: 129, w: 960, h: 320, z: 1 };

  it('adds a column right of the last one as wide as the last drawn column and grows the box by it', () => {
    const block = emptyTable('e', 3, 3);
    const out = edgeInsert(block, pos, 'column', 320, 960);
    expect(out).not.toBeNull();
    const columns = out!.writes.find((write) => write.path === '/columns')!.value as {
      width?: number;
    }[];
    /* every column carries its drawn width so the shares stay proportional in the wider box */
    expect(columns.map((column) => column.width)).toEqual([320, 320, 320, 320]);
    expect(out!.pos).toEqual({ ...pos, w: 1280 });
    expect(out!.writes.find((write) => write.path === '/pos')!.value).toEqual({ ...pos, w: 1280 });
    const rows = out!.writes.find((write) => write.path === '/rows')!.value as TableBlock['rows'];
    expect(rows.every((row) => row.cells.length === 4)).toBe(true);
    /* nothing else is written on a plain table */
    expect(out!.writes.map((write) => write.path)).toEqual(['/columns', '/rows', '/pos']);
  });

  it('keeps unequal widths and shifts the merges and cell styles of a styled table', () => {
    const block: TableBlock = {
      ...table(),
      columns: [{ width: 200 }, { width: 400 }, { width: 200 }, { width: 160 }],
    };
    const out = edgeInsert(block, pos, 'column', 160, 960);
    const columns = out!.writes.find((write) => write.path === '/columns')!.value as {
      width?: number;
    }[];
    expect(columns.map((column) => column.width)).toEqual([200, 400, 200, 160, 160]);
    expect(out!.pos.w).toBe(1120);
    /* the merge at (1, 1) spanning two columns stays where it is; the styled cell (0, 0) too */
    expect(out!.writes.find((write) => write.path === '/spans')).toBeUndefined();
    expect(out!.writes.find((write) => write.path === '/cells')).toBeUndefined();
  });

  it('adds a row under the last one and grows the box by the last row’s drawn height', () => {
    const block = table();
    const out = edgeInsert(block, pos, 'row', 53, 960);
    const rows = out!.writes.find((write) => write.path === '/rows')!.value as TableBlock['rows'];
    expect(rows).toHaveLength(5);
    expect(rows[4]).toEqual({ cells: ['', '', '', ''] });
    expect(out!.pos).toEqual({ ...pos, h: 373 });
    expect(out!.writes.map((write) => write.path)).toEqual(['/rows', '/pos']);
  });

  it('refuses a full table', () => {
    expect(edgeInsert(emptyTable('f', 2, 20), pos, 'row', 53, 960)).toBeNull();
    expect(edgeInsert(emptyTable('g', 20, 2), pos, 'column', 48, 960)).toBeNull();
  });
});

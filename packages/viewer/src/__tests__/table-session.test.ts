import { describe, expect, it } from 'vitest';

import { emptyTable } from '@turboslide/schema/blocks/table';
import type { TableBlock } from '@turboslide/schema/blocks/table';

import {
  isNumberCell,
  movedCellPointer,
  parseTablePaste,
  pastedTableBlock,
  pastedTableSize,
  tableShapeOf,
  tableWithPastedGrid,
} from '../table-session';

// The cell a parked session's pointer names after the grid changed under it (docs/RETURN.md 2.4;
// build/b5.md section 7: Insert row above duplicated the cell's text into the new row), and a
// spreadsheet's rows on the clipboard (docs/FEATURES.md 2.3 item 5; audit-objects 12).

function table(rows: string[][]): TableBlock {
  const t = emptyTable('tbl', rows[0]?.length ?? 1, rows.length);
  t.rows = rows.map((cells, i) => ({ cells, ...(i === 0 ? { header: true as const } : {}) }));
  return t;
}

const start = table([
  ['', '', ''],
  ['', 'Q1 revenue', ''],
  ['', '', ''],
]);
const shape = tableShapeOf(start);

describe('movedCellPointer', () => {
  it('follows the cell one row down after a row was inserted above it', () => {
    const after = table([
      ['', '', ''],
      ['', '', ''],
      ['', 'Q1 revenue', ''],
      ['', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/1/cells/1', 'Q1 revenue')).toBe('rows/2/cells/1');
  });

  it('keeps the position after a row was inserted below it', () => {
    const after = table([
      ['', '', ''],
      ['', 'Q1 revenue', ''],
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/1/cells/1', 'Q1 revenue')).toBe('rows/1/cells/1');
  });

  it('follows the cell one column right after a column was inserted on its left', () => {
    const after = table([
      ['', '', '', ''],
      ['', '', 'Q1 revenue', ''],
      ['', '', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/1/cells/1', 'Q1 revenue')).toBe('rows/1/cells/2');
  });

  it('follows the cell up after a row above it was deleted', () => {
    const after = table([
      ['', 'Q1 revenue', ''],
      ['', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/1/cells/1', 'Q1 revenue')).toBe('rows/0/cells/1');
  });

  it('answers null when the cell’s own row was deleted', () => {
    const after = table([
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/1/cells/1', 'Q1 revenue')).toBeNull();
  });

  it('answers null off a table cell pointer and for a pointer past the grid', () => {
    expect(movedCellPointer(start, shape, 'text', 'Q1 revenue')).toBeNull();
    expect(movedCellPointer(start, { rows: 2, columns: 3 }, 'rows/5/cells/1', '')).toBeNull();
  });

  it('prefers the same position for an empty cell, where either choice holds no text', () => {
    const after = table([
      ['', '', ''],
      ['', '', ''],
      ['', 'Q1 revenue', ''],
      ['', '', ''],
    ]);
    expect(movedCellPointer(after, shape, 'rows/2/cells/0', '')).toBe('rows/2/cells/0');
  });
});

const TSV = ['Region\tQ1\tQ2', 'East\t120\t140', 'West\t80\t95'].join('\n');

describe('parseTablePaste', () => {
  it('reads two or more tab separated rows as a grid, the trailing line break no row', () => {
    expect(parseTablePaste(TSV)).toEqual([
      ['Region', 'Q1', 'Q2'],
      ['East', '120', '140'],
      ['West', '80', '95'],
    ]);
    expect(parseTablePaste(`${TSV}\n`)).toHaveLength(3);
    expect(parseTablePaste(TSV.replace(/\n/g, '\r\n'))).toHaveLength(3);
  });

  it('answers null for one row, for a row with no tab and for plain text', () => {
    expect(parseTablePaste('Region\tQ1\tQ2')).toBeNull();
    expect(parseTablePaste('Region\tQ1\nEast')).toBeNull();
    expect(parseTablePaste('Hello\nworld')).toBeNull();
    expect(parseTablePaste('')).toBeNull();
  });

  it('pads a shorter row to the widest and trims the cells', () => {
    expect(parseTablePaste('a\tb\tc\n d \te')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', ''],
    ]);
  });

  it('keeps a tab, a line break and a doubled quote inside a quoted cell', () => {
    expect(parseTablePaste('"a\tb"\t"two\nlines"\n"say ""hi"""\tc')).toEqual([
      ['a\tb', 'two\nlines'],
      ['say "hi"', 'c'],
    ]);
  });
});

describe('isNumberCell', () => {
  it('reads a spreadsheet number and not a label', () => {
    for (const cell of ['120', '1,200', '$5', '12%', '(12)', '-3.5', '.5', '+7'])
      expect(isNumberCell(cell), cell).toBe(true);
    for (const cell of ['Q1', 'Region', '', '1a', 'FY2026', '-'])
      expect(isNumberCell(cell), cell).toBe(false);
  });
});

describe('pastedTableBlock', () => {
  it('makes a table of the grid with a header row when the first row has no numbers', () => {
    const block = pastedTableBlock('table', parseTablePaste(TSV) ?? []);
    expect(block.type).toBe('table');
    expect(block.columns).toHaveLength(3);
    expect(block.rows.map((row) => row.cells)).toEqual([
      ['Region', 'Q1', 'Q2'],
      ['East', '120', '140'],
      ['West', '80', '95'],
    ]);
    expect(block.rows[0]?.header).toBe(true);
    expect(block.rows[1]?.header).toBeUndefined();
  });

  it('writes no header row when the first row holds a number', () => {
    const block = pastedTableBlock('table', [
      ['East', '120'],
      ['West', '80'],
    ]);
    expect(block.rows.every((row) => row.header === undefined)).toBe(true);
  });

  it('keeps a literal star and bracket literal, and caps the grid at 20 by 20', () => {
    const block = pastedTableBlock('table', [
      ['*not bold*', '[x]'],
      ['1', '2'],
    ]);
    expect(block.rows[0]?.cells[0]).toBe('\\*not bold\\*');
    expect(block.rows[0]?.cells[1]).toBe('\\[x]');
    const wide = Array.from({ length: 25 }, (_, r) =>
      Array.from({ length: 25 }, (_, c) => `${r},${c}`),
    );
    const capped = pastedTableBlock('table', wide);
    expect(capped.columns).toHaveLength(20);
    expect(capped.rows).toHaveLength(20);
    expect(capped.rows.every((row) => row.cells.length === 20)).toBe(true);
  });
});

describe('pastedTableSize', () => {
  it('grows with the rows and columns inside the sheet', () => {
    expect(pastedTableSize(3, 3)).toEqual([720, 192]);
    expect(pastedTableSize(2, 2)).toEqual([480, 128]);
    expect(pastedTableSize(20, 20)).toEqual([1440, 800]);
  });
});

describe('tableWithPastedGrid', () => {
  const base = table([
    ['A', 'B', 'C'],
    ['a1', 'b1', 'c1'],
    ['a2', 'b2', 'c2'],
  ]);
  const grid = parseTablePaste(TSV) ?? [];

  it('fills right and down from the cell and adds the rows and columns it needs', () => {
    const edited = tableWithPastedGrid(base, { row: 2, col: 1 }, grid);
    expect(edited).not.toBeNull();
    expect(edited?.columns).toHaveLength(4);
    expect(edited?.rows.map((row) => row.cells)).toEqual([
      ['A', 'B', 'C', ''],
      ['a1', 'b1', 'c1', ''],
      ['a2', 'Region', 'Q1', 'Q2'],
      ['', 'East', '120', '140'],
      ['', 'West', '80', '95'],
    ]);
    expect(edited?.rows[0]?.header).toBe(true);
    /* the table given is untouched */
    expect(base.rows).toHaveLength(3);
    expect(base.rows[2]?.cells[1]).toBe('b2');
  });

  it('writes inside the grid without adding anything when the cells fit', () => {
    const edited = tableWithPastedGrid(base, { row: 1, col: 1 }, [
      ['x', 'y'],
      ['z', 'w'],
    ]);
    expect(edited?.columns).toHaveLength(3);
    expect(edited?.rows.map((row) => row.cells)).toEqual([
      ['A', 'B', 'C'],
      ['a1', 'x', 'y'],
      ['a2', 'z', 'w'],
    ]);
    expect(edited?.columns).toBe(base.columns);
  });

  it('stops at 20 by 20 and drops the cells past the cap', () => {
    const wide = Array.from({ length: 25 }, (_, r) =>
      Array.from({ length: 25 }, (_, c) => `${r},${c}`),
    );
    const edited = tableWithPastedGrid(base, { row: 1, col: 1 }, wide);
    expect(edited?.rows).toHaveLength(20);
    expect(edited?.columns).toHaveLength(20);
    expect(edited?.rows[19]?.cells[19]).toBe('18,18');
  });

  it('shares the width among sized columns when a column is added', () => {
    const sized = table([
      ['A', 'B'],
      ['a1', 'b1'],
    ]);
    sized.columns = [{ width: 300 }, { width: 300 }];
    const edited = tableWithPastedGrid(sized, { row: 0, col: 1 }, [
      ['x', 'y'],
      ['z', 'w'],
    ]);
    expect(edited?.columns).toHaveLength(3);
    const total = (edited?.columns ?? []).reduce((sum, column) => sum + (column.width ?? 0), 0);
    expect(Math.round(total)).toBe(600);
  });

  it('answers null for an empty grid', () => {
    expect(tableWithPastedGrid(base, { row: 0, col: 0 }, [])).toBeNull();
  });
});

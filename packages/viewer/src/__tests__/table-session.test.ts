import { describe, expect, it } from 'vitest';

import { emptyTable } from '@turboslide/schema/blocks/table';
import type { TableBlock } from '@turboslide/schema/blocks/table';

import { movedCellPointer, tableShapeOf } from '../table-session';

// The cell a parked session's pointer names after the grid changed under it (docs/RETURN.md 2.4;
// build/b5.md section 7: Insert row above duplicated the cell's text into the new row).

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

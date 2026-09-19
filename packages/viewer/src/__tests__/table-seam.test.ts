import { describe, expect, it } from 'vitest';

import { TABLE_MIN_COLUMN_PX, emptyTable } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';

import { HANDLE_HIT } from '../Gestures';
import { isTableSeamHandle, tableSeamHandles, tableSeamMutation, tableSeamXs } from '../table-seam';

// The column seam handles of a selected table (docs/RETURN.md 2.4 fix 5): where they sit, what
// they are named, and the /columns write a drag of them stands for.

const table = emptyTable('tbl', 3, 2);
const box: [number, number, number, number] = [320, 290, 960, 320];
const slide = { id: 's1' } as unknown as Slide;

describe('tableSeamXs', () => {
  it('reads each seam from the header row’s measured cells when they are there', () => {
    const runs = {
      'tbl/rows/0/cells/0': [320, 290, 300, 60] as [number, number, number, number],
      'tbl/rows/0/cells/1': [620, 290, 400, 60] as [number, number, number, number],
      'tbl/rows/0/cells/2': [1020, 290, 260, 60] as [number, number, number, number],
    };
    expect(tableSeamXs(table, box, runs)).toEqual([620, 1020]);
  });

  it('falls back to the drawn shares from the box’s left edge', () => {
    expect(tableSeamXs(table, box, {})).toEqual([640, 960]);
    const sized = { ...table, columns: [{ width: 240 }, { width: 480 }, { width: 240 }] };
    expect(tableSeamXs(sized, box, {})).toEqual([560, 1040]);
  });
});

describe('tableSeamHandles', () => {
  it('draws one vertical handle per inner seam, the table’s height, named for the window API', () => {
    const handles = tableSeamHandles(table, box, {});
    expect(handles).toHaveLength(2);
    const [first, second] = handles;
    expect(first).toMatchObject({
      id: 'col-seam:tbl:0',
      kind: 'col-seam',
      blockId: 'tbl',
      index: 0,
      cursor: 'col-resize',
      label: 'tbl: Column seam 1',
      control: 'handle.tbl.column.0',
      shape: 'v',
      axis: 'x',
      sign: 1,
    });
    expect(first?.box).toEqual([640 - HANDLE_HIT / 2, 290, HANDLE_HIT, 320]);
    expect(second?.control).toBe('handle.tbl.column.1');
    expect(handles.every(isTableSeamHandle)).toBe(true);
  });

  it('draws none for one column or for a table with no measured box', () => {
    expect(tableSeamHandles(emptyTable('one', 1, 2), box, {})).toEqual([]);
    expect(tableSeamHandles(table, undefined, {})).toEqual([]);
  });

  it('tells a table seam from the layout’s column seam by the block', () => {
    expect(
      isTableSeamHandle({
        id: 'col-seam',
        kind: 'col-seam',
        box: [0, 0, 8, 100],
        cursor: 'col-resize',
        label: 'Layout: Column seam',
        control: 'handle.layout.ratio',
        shape: 'v',
        axis: 'x',
        sign: 1,
      }),
    ).toBe(false);
  });
});

describe('tableSeamMutation', () => {
  it('writes every column width with the left column wider by the drag and its neighbour narrower', () => {
    const out = tableSeamMutation(slide, table, 960, 0, 80);
    expect(out).not.toBeNull();
    expect(out?.left).toBe(400);
    expect(out?.right).toBe(240);
    expect(out?.mutation).toEqual({
      op: 'block.set',
      slideId: 's1',
      blockId: 'tbl',
      path: '/columns',
      value: [{ width: 400 }, { width: 240 }, { width: 320 }],
    });
  });

  it('keeps the column’s alignment and fill through the write', () => {
    const aligned = {
      ...table,
      columns: [{ align: 'right' as const }, {}, { fill: 'plate' as const }],
    };
    const out = tableSeamMutation(slide, aligned, 960, 1, -20);
    expect(out?.mutation.op === 'block.set' && out.mutation.value).toEqual([
      { align: 'right', width: 320 },
      { width: 300 },
      { fill: 'plate', width: 340 },
    ]);
  });

  it('answers null for a click and stops at the smallest column', () => {
    expect(tableSeamMutation(slide, table, 960, 0, 0)).toBeNull();
    const far = tableSeamMutation(slide, table, 960, 1, 5000);
    expect(far?.right).toBe(TABLE_MIN_COLUMN_PX);
  });
});

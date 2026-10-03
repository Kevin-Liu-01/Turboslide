import { describe, expect, it } from 'vitest';

import { TABLE_MIN_COLUMN_PX, emptyTable } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';

import { HANDLE_HIT } from '../Gestures';
import {
  isTableRowSeamHandle,
  isTableSeamHandle,
  tableRowSeamHandles,
  tableRowSeamMutations,
  tableRowSeamYs,
  tableSeamDrag,
  tableSeamHandles,
  tableSeamMutation,
  tableSeamXs,
} from '../table-seam';

// The column seam handles of a selected table (docs/archive/rounds/RETURN.md 2.4 fix 5): where they sit, what
// they are named, and the /columns write a drag of them stands for; and the row seam handles of
// the objects round (docs/archive/rounds/OBJECTS.md 3.3 item 4): one under every row, the /rows and /pos/h
// writes a drag of them stands for, the floor at the row's natural height, and the one gesture
// reader of both axes.

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
      label: 'Column seam 1',
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

describe('tableRowSeamYs and tableRowSeamHandles', () => {
  const runs = {
    'tbl/rows/0/cells/0': [320, 290, 300, 53] as [number, number, number, number],
    'tbl/rows/1/cells/0': [320, 344, 300, 53] as [number, number, number, number],
  };

  it('reads each seam from the bottom edge of the row’s first measured cell, the last row’s included', () => {
    expect(tableRowSeamYs(table, box, runs)).toEqual([343, 397]);
  });

  it('takes the next measured cell of a row whose first is covered, and shares the box otherwise', () => {
    const covered = {
      'tbl/rows/0/cells/1': [620, 290, 400, 53] as [number, number, number, number],
    };
    expect(tableRowSeamYs(table, box, covered)).toEqual([343, 290 + 320]);
    expect(tableRowSeamYs(table, box, {})).toEqual([450, 610]);
  });

  it('draws one handle under every row, the table’s width, named for the window API, the drag down', () => {
    const handles = tableRowSeamHandles(table, box, runs);
    expect(handles).toHaveLength(2);
    const [first, second] = handles;
    expect(first).toMatchObject({
      id: 'row-seam:tbl:0',
      kind: 'col-seam',
      blockId: 'tbl',
      index: 0,
      cursor: 'ns-resize',
      label: 'Row seam 1',
      control: 'handle.tbl.row.0',
      shape: 'v',
      axis: 'y',
      sign: 1,
    });
    expect(first?.box).toEqual([320, 343 - HANDLE_HIT / 2, 960, HANDLE_HIT]);
    expect(second?.control).toBe('handle.tbl.row.1');
    expect(handles.every(isTableSeamHandle)).toBe(true);
    expect(handles.every(isTableRowSeamHandle)).toBe(true);
    expect(tableSeamHandles(table, box, {}).some(isTableRowSeamHandle)).toBe(false);
  });

  it('draws none for a table with no measured box', () => {
    expect(tableRowSeamHandles(table, undefined, runs)).toEqual([]);
  });
});

describe('tableRowSeamMutations', () => {
  const positioned = { ...table, pos: { x: 320, y: 290, w: 960, h: 109, z: 1 } };
  const measure = {
    top: 1,
    rows: [
      { drawn: 54, natural: 54 },
      { drawn: 54, natural: 54 },
    ],
  };

  it('writes every row’s height with the moved row taller by the drag, and the box in the same commit', () => {
    const out = tableRowSeamMutations(slide, positioned, measure, 0, 40);
    expect(out?.height).toBe(94);
    expect(out?.boxHeight).toBe(149);
    expect(out?.mutations).toEqual([
      {
        op: 'block.set',
        slideId: 's1',
        blockId: 'tbl',
        path: '/rows',
        value: [
          { cells: ['', '', ''], header: true, height: 94 },
          { cells: ['', '', ''], height: 54 },
        ],
      },
      { op: 'block.set', slideId: 's1', blockId: 'tbl', path: '/pos/h', value: 149 },
    ]);
  });

  it('grows the table from the seam under the last row', () => {
    const out = tableRowSeamMutations(slide, positioned, measure, 1, 30);
    expect(out?.height).toBe(84);
    expect(out?.mutations.map((m) => m.op === 'block.set' && m.path)).toEqual(['/rows', '/pos/h']);
  });

  it('writes the rows alone for a table in a layout slot, and nothing for a click or a row at its floor', () => {
    const inSlot = tableRowSeamMutations(slide, table, measure, 0, 40);
    expect(inSlot?.mutations.map((m) => m.op === 'block.set' && m.path)).toEqual(['/rows']);
    expect(tableRowSeamMutations(slide, positioned, measure, 0, 0)).toBeNull();
    expect(tableRowSeamMutations(slide, positioned, measure, 1, -30)).toBeNull();
  });
});

describe('tableSeamDrag', () => {
  const positioned = { ...table, pos: { x: 320, y: 290, w: 960, h: 109, z: 1 } };
  const measure = {
    top: 1,
    rows: [
      { drawn: 54, natural: 54 },
      { drawn: 54, natural: 54 },
    ],
  };
  const ctx = { slide, block: positioned, width: 960, measure };

  it('reads dx for a column seam and answers the moved column’s width', () => {
    const [column] = tableSeamHandles(positioned, box, {});
    const out = tableSeamDrag(column!, ctx, 80, 999);
    expect(out.readout).toEqual({ kind: 'width', value: 400 });
    expect(out.mutations).toHaveLength(1);
    expect(out.mutations[0]?.op === 'block.set' && out.mutations[0].path).toBe('/columns');
  });

  it('reads dy for a row seam and answers the moved row’s height', () => {
    const [row] = tableRowSeamHandles(positioned, box, {});
    const out = tableSeamDrag(row!, ctx, 999, 40);
    expect(out.readout).toEqual({ kind: 'width', value: 94 });
    expect(out.mutations.map((m) => m.op === 'block.set' && m.path)).toEqual(['/rows', '/pos/h']);
  });

  it('answers no write and no readout for a click, or for a row seam with no measure', () => {
    const [row] = tableRowSeamHandles(positioned, box, {});
    expect(tableSeamDrag(row!, ctx, 0, 0)).toEqual({ mutations: [], readout: null });
    expect(tableSeamDrag(row!, { ...ctx, measure: null }, 0, 40)).toEqual({
      mutations: [],
      readout: null,
    });
    const [column] = tableSeamHandles(positioned, box, {});
    expect(tableSeamDrag(column!, ctx, 0, 0)).toEqual({ mutations: [], readout: null });
  });
});

// The table cell writer of the parity round two fix round (docs/gslides-parity/build-2/b2.md):
// every cell carries the exact line pitch, and its top margin gives up the first baseline shift
// less the cell constant, so LibreOffice lands the cell's text on the browser's within the budget.
import { describe, expect, it } from 'vitest';

import type { SceneStyle, SceneTable, SceneTableCell, SceneText } from '../scene/types.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import { CELL_FIRST_BASELINE_PX, cellMargin, normalisedColumnWidths, tableCell } from './table.ts';
import type { TableCellOptions, TableEmitOptions } from './table.ts';

const style: SceneStyle = {
  family: 'Inter',
  mono: false,
  weight: 400,
  size: 16,
  letterSpacing: 0,
  lineHeight: 23.2,
  color: 'rgb(7, 7, 7)',
  strike: false,
  features: 'normal',
  align: 'right',
};

const text: SceneText = {
  id: 'table/rows/1/cells/1',
  blockId: 'table',
  box: [468.5, 448.69, 331.5, 54],
  textBox: [773, 464, 10, 23.2],
  style,
  native: true,
  lines: [
    {
      box: [773, 464, 10, 23.2],
      paragraph: 0,
      runs: [{ text: '5', box: [773, 464, 10, 23.2], style }],
    },
  ],
};

const cell: SceneTableCell = {
  box: [468.5, 448.69, 331.5, 54],
  textId: text.id,
  align: 'right',
  margin: [12, 16, 12, 16],
};

const table: SceneTable = {
  blockId: 'table',
  box: [137, 393.69, 1326, 217],
  columns: [
    { x: 137, w: 331.5 },
    { x: 468.5, w: 331.5 },
  ],
  rows: [
    { y: 394.69, h: 54, header: true, cells: [cell] },
    { y: 448.69, h: 54, header: false, cells: [cell] },
  ],
  rule: { color: 'rgb(210, 210, 210)', width: 1 },
  headerRule: { color: 'rgb(7, 7, 7)', width: 1 },
  valign: 'top',
  size: 20,
};

const options: TableEmitOptions = {
  fontSet: 'exact',
  invisible: false,
  hairHex: 'D2D2D2',
  families: new Set(),
  namePrefix: 'ts:table',
  paperHex: 'FFFFFF',
};

describe('a table cell', () => {
  it('carries the exact line pitch as lineSpacing, in points', () => {
    const out = tableCell(table, 1, cell, text, options);
    expect((out.options as TableCellOptions | undefined)?.lineSpacing).toBeCloseTo(23.2 * 0.6, 5);
    expect(out.options?.align).toBe('right');
    expect(
      (tableCell(table, 1, cell, undefined, options).options as TableCellOptions | undefined)
        ?.lineSpacing,
    ).toBeUndefined();
  });

  it('gives up the first baseline shift less the cell constant from its top margin', () => {
    const shift = firstBaselineShiftPx(16, 23.2);
    expect(shift).toBeGreaterThan(CELL_FIRST_BASELINE_PX);
    const margin = cellMargin(cell, text, options);
    expect(margin[0]).toBeCloseTo((12 - (shift - CELL_FIRST_BASELINE_PX)) / 120, 6);
    expect(margin[1]).toBeCloseTo(16 / 120, 6);
    expect(margin[2]).toBeCloseTo(12 / 120, 6);
    expect(margin[3]).toBeCloseTo(16 / 120, 6);
    // the browser's coordinates as they are with the shift switched off
    expect(cellMargin(cell, text, { ...options, baseline: 'none' })[0]).toBeCloseTo(12 / 120, 6);
    // an empty cell keeps its padding
    expect(cellMargin(cell, undefined, options)[0]).toBeCloseTo(12 / 120, 6);
  });
});

describe('normalisedColumnWidths (docs/RETURN.md 2.4 fix 4)', () => {
  it('writes the measured widths when they fill the box', () => {
    expect(
      normalisedColumnWidths({
        columns: [
          { x: 0, w: 480 },
          { x: 480, w: 480 },
        ],
        box: [0, 0, 960, 100],
      }),
    ).toEqual([480, 480]);
    expect(
      normalisedColumnWidths({
        columns: [
          { x: 0, w: 480.2 },
          { x: 480.2, w: 480 },
        ],
        box: [0, 0, 960, 100],
      }),
    ).toEqual([480.2, 480]);
  });
  it('scales widths whose sum drifted from the box, so no gridCol is wider than the frame', () => {
    const widths = normalisedColumnWidths({
      columns: [
        { x: 0, w: 240 },
        { x: 240, w: 240 },
        { x: 480, w: 240 },
        { x: 720, w: 960 },
      ],
      box: [0, 0, 960, 100],
    });
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(960, 6);
    expect(widths.map((w) => Math.round(w))).toEqual([137, 137, 137, 549]);
    expect(
      normalisedColumnWidths({
        columns: [
          { x: 0, w: 300 },
          { x: 300, w: 300 },
        ],
        box: [0, 0, 960, 100],
      }),
    ).toEqual([480, 480]);
  });
  it('leaves a zero total or a zero box as measured', () => {
    expect(normalisedColumnWidths({ columns: [{ x: 0, w: 0 }], box: [0, 0, 960, 100] })).toEqual([
      0,
    ]);
    expect(normalisedColumnWidths({ columns: [{ x: 0, w: 300 }], box: [0, 0, 0, 100] })).toEqual([
      300,
    ]);
  });
});

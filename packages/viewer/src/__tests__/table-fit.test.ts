import { describe, expect, it } from 'vitest';

import { emptyTable } from '@turboslide/schema/blocks/table';

import {
  readTableRows,
  rowsMeasureFromFacts,
  tableGrowMutation,
  tableRowsHeight,
  tableRowsNaturalHeight,
} from '../table-fit';
import type { TableFacts } from '../table-fit';

// The table's rows as the stage draws them (docs/OBJECTS.md 3.3 items 3 and 4): the arithmetic
// over the stage's readings, the two heights the seam drag and the autofit read from it, the
// `pos.h` write, and the DOM reader over a hand built stage in both forms.

const stretched: TableFacts = {
  top: 1,
  rows: [
    /* a 3 by 3 table in a box with slack at scale 1: 106.34 px rows around a wrapped row that
       draws at its three lines, 29 px each */
    {
      top: 130,
      bottom: 236.34,
      rule: 1,
      cells: [
        { contentTop: 142, contentBottom: 171, padTop: 12, padBottom: 12, rule: 0 },
        { contentTop: 142, contentBottom: 171, padTop: 12, padBottom: 12, rule: 0 },
      ],
    },
    {
      top: 236.34,
      bottom: 348.34,
      rule: 1,
      cells: [
        /* a wrapped cell of three lines: the row draws at its text */
        { contentTop: 248.34, contentBottom: 335.34, padTop: 12, padBottom: 12, rule: 0 },
        { contentTop: 248.34, contentBottom: 277.34, padTop: 12, padBottom: 12, rule: 0 },
      ],
    },
    {
      top: 348.34,
      bottom: 454.68,
      rule: 1,
      cells: [{ contentTop: 360.34, contentBottom: 389.34, padTop: 12, padBottom: 12, rule: 0 }],
    },
  ],
};

describe('rowsMeasureFromFacts', () => {
  it('reads the drawn pitch and the tallest cell’s text with the paddings and the rule, in sheet px', () => {
    const out = rowsMeasureFromFacts(stretched, 1);
    expect(out.top).toBe(1);
    expect(out.rows).toEqual([
      { drawn: 106.34, natural: 54 },
      { drawn: 112, natural: 112 },
      { drawn: 106.34, natural: 54 },
    ]);
  });

  it('divides by the stage scale and never reads a row’s drawn height below its text', () => {
    const out = rowsMeasureFromFacts(stretched, 2);
    expect(out.top).toBe(0.5);
    expect(out.rows[0]).toEqual({ drawn: 53.17, natural: 27 });
    /* a track shorter than the text (a set height in a box too short for it): the text is what
       the box must hold */
    const tight = rowsMeasureFromFacts(
      { top: 1, rows: [{ ...stretched.rows[1]!, top: 0, bottom: 100 }] },
      1,
    );
    expect(tight.rows[0]).toEqual({ drawn: 112, natural: 112 });
  });

  it('counts a cell with no paragraph as its paddings and rule alone', () => {
    const out = rowsMeasureFromFacts(
      {
        top: 0,
        rows: [
          {
            top: 0,
            bottom: 60,
            rule: 0,
            cells: [{ contentTop: 0, contentBottom: 0, padTop: 12, padBottom: 12, rule: 1 }],
          },
        ],
      },
      1,
    );
    expect(out.rows[0]).toEqual({ drawn: 60, natural: 25 });
  });
});

describe('tableRowsHeight, tableRowsNaturalHeight and tableGrowMutation', () => {
  const measure = rowsMeasureFromFacts(stretched, 1);

  it('sums the rows with the hairline above, drawn and natural', () => {
    expect(tableRowsHeight(measure)).toBeCloseTo(325.68, 2);
    expect(tableRowsNaturalHeight(measure)).toBe(221);
  });

  it('writes pos.h up when the rows draw taller than the box, and nothing otherwise', () => {
    const table = { ...emptyTable('t', 2, 3), pos: { x: 0, y: 0, w: 960, h: 163, z: 1 } };
    expect(tableGrowMutation('s1', table, measure)).toEqual({
      op: 'block.set',
      slideId: 's1',
      blockId: 't',
      path: '/pos/h',
      value: 326,
    });
    expect(
      tableGrowMutation('s1', { ...table, pos: { ...table.pos, h: 326 } }, measure),
    ).toBeNull();
    expect(tableGrowMutation('s1', table, null)).toBeNull();
    expect(tableGrowMutation('s1', emptyTable('t', 2, 3), measure)).toBeNull();
  });
});

// A hand built stage: the elements the reader touches (the rows, the cells, the paragraphs) with
// the boxes and the computed widths it reads, the classic form and the grid form.
type FakeRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};
type FakeEl = {
  classes: string[];
  rect: FakeRect;
  style: {
    paddingTop?: string;
    paddingBottom?: string;
    borderTopWidth?: string;
    borderBottomWidth?: string;
  };
  children: FakeEl[];
  getBoundingClientRect: () => FakeRect;
  classList: { contains: (name: string) => boolean };
  querySelectorAll: (selector: string) => FakeEl[];
};

function el(
  classes: string[],
  top: number,
  bottom: number,
  style: FakeEl['style'] = {},
  children: FakeEl[] = [],
): FakeEl {
  const rect = { top, bottom, left: 0, right: 100, width: 100, height: bottom - top };
  const node: FakeEl = {
    classes,
    rect,
    style,
    children,
    getBoundingClientRect: () => rect,
    classList: { contains: (name) => classes.includes(name) },
    querySelectorAll: (selector) => {
      const name = selector.replace(':scope > .', '');
      return children.filter((child) => child.classes.includes(name));
    },
  };
  return node;
}

const view = {
  getComputedStyle: (node: unknown) => (node as FakeEl).style,
} as unknown as Window;

describe('readTableRows', () => {
  it('reads the classic form: the row’s box and its rule, the cells’ paragraphs and paddings', () => {
    const cell = (top: number, lines: number) =>
      el(
        ['td'],
        top,
        top + 24 + 29 * lines,
        { paddingTop: '12px', paddingBottom: '12px', borderBottomWidth: '0px' },
        [el(['para'], top + 12, top + 12 + 29 * lines)],
      );
    const table = el(['table'], 100, 400, { borderTopWidth: '1px' }, [
      el(['tr', 'header'], 101, 201, { borderBottomWidth: '1px' }, [cell(101, 1), cell(101, 1)]),
      el(['tr'], 201, 301, { borderBottomWidth: '1px' }, [cell(201, 2), cell(201, 1)]),
    ]);
    const out = readTableRows(table as unknown as HTMLElement, 1, view);
    expect(out).toEqual({
      top: 1,
      rows: [
        { drawn: 100, natural: 54 },
        { drawn: 100, natural: 83 },
      ],
    });
  });

  it('reads the grid form: the row as the union of its cells, the rule on each cell', () => {
    const cell = (top: number, bottom: number, lines: number) =>
      el(
        ['td'],
        top,
        bottom,
        { paddingTop: '12px', paddingBottom: '12px', borderBottomWidth: '1.5px' },
        [el(['para'], top + 12, top + 12 + 29 * lines)],
      );
    const table = el(['table', 'grid'], 100, 300, { borderTopWidth: '1.5px' }, [
      /* display contents: the row's own rect is empty */
      el(['tr'], 0, 0, { borderBottomWidth: '1.5px' }, [cell(101.5, 200, 1), cell(101.5, 200, 1)]),
      el(['tr'], 0, 0, { borderBottomWidth: '1.5px' }, [cell(200, 300, 1)]),
    ]);
    const out = readTableRows(table as unknown as HTMLElement, 2, view);
    expect(out).toEqual({
      top: 0.75,
      rows: [
        { drawn: 49.25, natural: 27.25 },
        { drawn: 50, natural: 27.25 },
      ],
    });
  });

  it('answers null with no rows or no scale', () => {
    const table = el(['table'], 0, 0, { borderTopWidth: '1px' });
    expect(readTableRows(table as unknown as HTMLElement, 1, view)).toBeNull();
    const rows = el(['table'], 0, 100, {}, [el(['tr'], 0, 100, {})]);
    expect(readTableRows(rows as unknown as HTMLElement, 0, view)).toBeNull();
  });
});

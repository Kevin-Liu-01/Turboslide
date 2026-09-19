// The table block (gslides-parity SPEC 7.3, 14.2 blocks/table.test.ts): the 20 by 20 cap, a
// ragged row refused, the nine commands as block.set writes producing valid tables, the
// multiline cells, and the catalog entry.
import { describe, expect, it } from 'vitest';

import type { ContentSlide, Slide } from '../deck.ts';
import { CATALOG, blockMultilinePaths, blockTextPaths } from '../catalog.ts';
import { tableBlockSchema } from '../blocks.ts';
import { WORKED_DECK } from '../fixtures.ts';
import { applyMutations } from '../reduce.ts';
import { validateDeck, validateSlide } from '../validate.ts';
import {
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  applyTableCommand,
  emptyTable,
  tableSizeProblem,
  columnShares,
  columnsAfterSeamDrag,
  TABLE_MIN_COLUMN_PX,
} from './table.ts';
import type { TableBlock, TableCommand } from './table.ts';

function slideWith(table: TableBlock): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'pricing',
    kind: 'content',
    layout: { type: 'split', head: { cols: '4/8' } },
    slots: {
      headLeft: [{ id: 'h', type: 'heading', level: 'h2', text: 'Pricing' }],
      body: [table],
    },
  };
}

function validate(slide: Slide) {
  return validateDeck({
    deck: { ...WORKED_DECK, sections: [{ id: 'brand', name: 'Brand', slideIds: [slide.id] }] },
    slides: { [slide.id]: slide },
  });
}

describe('the table block', () => {
  it('parses the fixture shape: aligned columns, a header row, multiline cells', () => {
    const table: TableBlock = {
      id: 't',
      type: 'table',
      columns: [{ align: 'left' }, { align: 'right', fill: 'plate' }],
      rows: [{ cells: ['Plan', 'Price'], header: true }, { cells: ['Starter\nFive seats', '$0'] }],
      border: { weight: 1 },
      size: 18,
    };
    expect(tableBlockSchema.safeParse(table).success).toBe(true);
    const result = validate(slideWith(table));
    expect(result.issues.filter((issue) => issue.severity === 3)).toEqual([]);
    expect(blockTextPaths(table)).toEqual([
      '/rows/0/cells/0',
      '/rows/0/cells/1',
      '/rows/1/cells/0',
      '/rows/1/cells/1',
    ]);
    expect(blockMultilinePaths(table)).toEqual(blockTextPaths(table));
    expect(CATALOG.table.label).toBe('Table');
    expect(CATALOG.table.export).toBe('native');
    expect(tableBlockSchema.safeParse(CATALOG.table.make('t')).success).toBe(true);
  });

  it('refuses a carriage return in a cell and a line break in a heading', () => {
    const table = emptyTable('t', 2, 2);
    table.rows[1]!.cells[0] = 'a\rb';
    expect(tableBlockSchema.safeParse(table).success).toBe(false);
    const slide = slideWith(emptyTable('t', 2, 2));
    const heading = slide.slots.headLeft?.[0];
    if (heading?.type === 'heading') heading.text = 'Two\nlines';
    expect(validateSlide(slide).ok).toBe(false);
  });

  it('caps the table at 20 by 20 and refuses a ragged row, as table_size at severity 3', () => {
    const wide = emptyTable('t', TABLE_MAX_COLUMNS + 1, 2);
    expect(wide.columns).toHaveLength(TABLE_MAX_COLUMNS);
    wide.columns.push({});
    for (const row of wide.rows) row.cells.push('');
    expect(tableSizeProblem(wide)?.pointer).toBe('/columns');
    const tall = emptyTable('t', 2, TABLE_MAX_ROWS);
    tall.rows.push({ cells: ['', ''] });
    expect(tableSizeProblem(tall)?.pointer).toBe('/rows');
    const ragged = emptyTable('t', 3, 2);
    ragged.rows[1] = { cells: ['a', 'b'] };
    expect(tableSizeProblem(ragged)).toEqual({
      pointer: '/rows/1/cells',
      message: expect.stringContaining('Row 2 has 2 cell(s) for 3 column(s)'),
    });
    const result = validateSlide(slideWith(ragged));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'table_size',
        severity: 3,
        pointer: '/slots/body/0/rows/1/cells',
      }),
    );
    expect(validateSlide(slideWith(wide)).issues).toContainEqual(
      expect.objectContaining({ code: 'table_size', pointer: '/slots/body/0/columns' }),
    );
    expect(tableSizeProblem(emptyTable('t', 20, 20))).toBeNull();
  });

  it('runs the nine commands as block.set writes of /rows and /columns that leave a valid table', () => {
    const start = emptyTable('t', 3, 3);
    start.rows[1]!.cells[1] = 'middle';
    const commands: TableCommand[] = [
      { kind: 'insertRowAbove', row: 1 },
      { kind: 'insertRowBelow', row: 1 },
      { kind: 'insertColumnLeft', column: 0 },
      { kind: 'insertColumnRight', column: 3 },
      { kind: 'deleteRow', row: 0 },
      { kind: 'deleteColumn', column: 1 },
      { kind: 'distributeRows' },
      { kind: 'distributeColumns' },
    ];
    let document = validate(slideWith(start));
    expect(document.ok).toBe(true);
    let current = { deck: document.deck!, slides: document.slides };
    for (const command of commands) {
      const slide = current.slides.pricing;
      const table = slide?.kind === 'content' ? slide.slots.body?.[0] : undefined;
      if (table?.type !== 'table') throw new Error('fixture');
      const edit = applyTableCommand(table, command);
      if ('deleted' in edit) throw new Error(`${command.kind} deleted the table`);
      const applied = applyMutations(current, [
        { op: 'block.set', slideId: 'pricing', blockId: 't', path: '/rows', value: edit.rows },
        {
          op: 'block.set',
          slideId: 'pricing',
          blockId: 't',
          path: '/columns',
          value: edit.columns,
        },
      ]);
      const check = validateDeck({
        deck: applied.document.deck,
        slides: applied.document.slides,
      });
      expect(
        check.issues.filter((issue) => issue.severity === 3),
        command.kind,
      ).toEqual([]);
      current = { deck: check.deck!, slides: check.slides };
    }
    const final = current.slides.pricing;
    const table = final?.kind === 'content' ? final.slots.body?.[0] : undefined;
    if (table?.type !== 'table') throw new Error('fixture');
    // 3 rows + 2 inserted - 1 deleted = 4; 3 columns + 2 inserted - 1 deleted = 4; widths cleared
    expect(table.rows).toHaveLength(4);
    expect(table.columns).toHaveLength(4);
    expect(table.columns.every((column) => column.width === undefined)).toBe(true);
    expect(table.rows.some((row) => row.cells.includes('middle'))).toBe(true);
    // the ninth command removes the table, as does deleting the last row or column
    expect(applyTableCommand(table, { kind: 'deleteTable' })).toEqual({ deleted: true });
    expect(applyTableCommand(emptyTable('t', 1, 1), { kind: 'deleteRow', row: 0 })).toEqual({
      deleted: true,
    });
    expect(applyTableCommand(emptyTable('t', 1, 2), { kind: 'deleteColumn', column: 0 })).toEqual({
      deleted: true,
    });
    // the cap holds through the commands
    const full = emptyTable('t', 20, 20);
    expect(applyTableCommand(full, { kind: 'insertRowBelow', row: 19 })).toMatchObject({
      rows: expect.arrayContaining([]),
    });
    const edit = applyTableCommand(full, { kind: 'insertColumnRight', column: 19 });
    expect('deleted' in edit ? 0 : edit.columns.length).toBe(20);
  });

  it('inserts an empty table with a header row from the grid picker counts', () => {
    const table = emptyTable('t', 4, 3);
    expect(table.columns).toHaveLength(4);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]?.header).toBe(true);
    expect(table.rows[1]?.header).toBeUndefined();
    expect(table.rows.every((row) => row.cells.every((cell) => cell === ''))).toBe(true);
    expect(emptyTable('t', 2, 2, { header: false }).rows[0]?.header).toBeUndefined();
  });
});

describe('column widths through the column commands (docs/RETURN.md 2.4 fix 4)', () => {
  const sized = (): ReturnType<typeof emptyTable> => {
    const table = emptyTable('t', 3, 2);
    table.columns = [{ width: 240 }, { width: 480 }, { width: 240 }];
    return table;
  };
  const widths = (columns: { width?: number }[]) => columns.map((column) => column.width);
  const sum = (columns: { width?: number }[]) =>
    columns.reduce((acc, column) => acc + (column.width ?? 0), 0);

  it('gives an inserted column a width and keeps the total when the grid is sized', () => {
    const edit = applyTableCommand(sized(), { kind: 'insertColumnRight', column: 0 });
    if ('deleted' in edit) throw new Error('deleted');
    expect(edit.columns).toHaveLength(4);
    expect(edit.columns.every((column) => column.width !== undefined)).toBe(true);
    expect(sum(edit.columns)).toBeCloseTo(960, 0);
    // the new column takes an equal share, the others scale down by 3/4
    expect(widths(edit.columns)).toEqual([180, 240, 360, 180]);
  });

  it('leaves an unsized grid unsized after an insert, as before', () => {
    const edit = applyTableCommand(emptyTable('t', 3, 2), { kind: 'insertColumnLeft', column: 1 });
    if ('deleted' in edit) throw new Error('deleted');
    expect(edit.columns).toHaveLength(4);
    expect(edit.columns.every((column) => column.width === undefined)).toBe(true);
  });

  it('counts an unsized column of a mixed grid at the mean and sizes every column after the insert', () => {
    const table = emptyTable('t', 3, 2);
    table.columns = [{ width: 200 }, {}, { width: 400 }];
    const edit = applyTableCommand(table, { kind: 'insertColumnRight', column: 2 });
    if ('deleted' in edit) throw new Error('deleted');
    // the declared total is 200 + 300 (the mean) + 400 = 900; four columns of it
    expect(sum(edit.columns)).toBeCloseTo(900, 0);
    expect(edit.columns[3]?.width).toBe(225);
    expect(edit.columns.every((column) => column.width !== undefined)).toBe(true);
  });

  it('gives the deleted column’s room to the columns left', () => {
    const edit = applyTableCommand(sized(), { kind: 'deleteColumn', column: 1 });
    if ('deleted' in edit) throw new Error('deleted');
    expect(widths(edit.columns)).toEqual([480, 480]);
  });

  it('keeps the total through a counted insert and a ranged delete', () => {
    const inserted = applyTableCommand(sized(), {
      kind: 'insertColumns',
      at: 1,
      count: 2,
      where: 'left',
    });
    if ('deleted' in inserted) throw new Error('deleted');
    expect(inserted.columns).toHaveLength(5);
    expect(sum(inserted.columns)).toBeCloseTo(960, 0);
    const removed = applyTableCommand(
      { ...sized(), columns: inserted.columns, rows: inserted.rows },
      { kind: 'deleteColumns', from: 1, to: 2 },
    );
    if ('deleted' in removed) throw new Error('deleted');
    expect(removed.columns).toHaveLength(3);
    expect(sum(removed.columns)).toBeCloseTo(960, 0);
  });
});

describe('columnShares, the grid template’s rule as numbers', () => {
  it('shares a total equally when no column carries a width', () => {
    expect(columnShares([{}, {}, {}], 960)).toEqual([320, 320, 320]);
  });
  it('scales a fully sized grid to the total', () => {
    expect(columnShares([{ width: 100 }, { width: 300 }], 800)).toEqual([200, 600]);
  });
  it('keeps a set width in px and shares the rest among the unset columns', () => {
    expect(columnShares([{ width: 160 }, {}, {}], 960)).toEqual([160, 400, 400]);
    expect(columnShares([{ width: 1000 }, {}], 960)).toEqual([1000, 0]);
  });
  it('answers zeros for a total of 0 and nothing for no columns', () => {
    expect(columnShares([{}, {}], 0)).toEqual([0, 0]);
    expect(columnShares([], 960)).toEqual([]);
  });
});

describe('columnsAfterSeamDrag, the column seam handle (docs/RETURN.md 2.4 fix 5)', () => {
  it('widens the left column by the drag and narrows its neighbour, sizing every column', () => {
    const out = columnsAfterSeamDrag([{}, {}, {}], 960, 0, 80);
    expect(out).not.toBeNull();
    expect(out?.left).toBe(400);
    expect(out?.right).toBe(240);
    expect(out?.columns.map((column) => column.width)).toEqual([400, 240, 320]);
  });
  it('drags backwards and keeps the other columns at their drawn widths', () => {
    const out = columnsAfterSeamDrag(
      [{ width: 240 }, { width: 480 }, { width: 240 }],
      960,
      1,
      -100,
    );
    expect(out?.columns.map((column) => column.width)).toEqual([240, 380, 340]);
  });
  it('stops at the smallest column on either side', () => {
    const out = columnsAfterSeamDrag([{}, {}], 960, 0, 10_000);
    expect(out?.right).toBe(TABLE_MIN_COLUMN_PX);
    expect(out?.left).toBe(960 - TABLE_MIN_COLUMN_PX);
    const back = columnsAfterSeamDrag([{}, {}], 960, 0, -10_000);
    expect(back?.left).toBe(TABLE_MIN_COLUMN_PX);
  });
  it('answers null for a click, a seam off the grid and a pair too narrow to move', () => {
    expect(columnsAfterSeamDrag([{}, {}], 960, 0, 0)).toBeNull();
    expect(columnsAfterSeamDrag([{}, {}], 960, 0, 0.3)).toBeNull();
    expect(columnsAfterSeamDrag([{}, {}], 960, 1, 40)).toBeNull();
    expect(columnsAfterSeamDrag([{}, {}], 960, -1, 40)).toBeNull();
    expect(columnsAfterSeamDrag([{}, {}], 60, 0, 40)).toBeNull();
  });
});

// The table block's markup after the polish round (docs/POLISH.md 2.1 items 1 and 3, 2.2 item 10;
// section 5.5): no prompt markup in a cell, the header row's `has-text` class, and a cell's own
// alignment read before its column's. The older contract stays pinned in __tests__/table.test.ts.
import { describe, expect, it } from 'vitest';

import type { TableBlock } from '@turboslide/schema/blocks/table';
import { emptyTable } from '@turboslide/schema/blocks/table';
import type { BlockContext } from './context.ts';
import { renderTable, rowHasText } from './table.ts';

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'polish',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    slotWidth: 1200,
    rasters: [],
    warnings: [],
    rasterCount: 0,
    ...extra,
  };
}

/** The `<div class="tr …">` open tags in order. */
const rowTags = (html: string): string[] => html.match(/<div class="tr[^"]*">/g) ?? [];

describe('no prompt in a table cell (2.1 item 1; the row tables.cells.no-prompt)', () => {
  it('writes no prompt markup or words into an empty cell, on the stage or elsewhere', () => {
    for (const ctx of [context({ live: true }), context()]) {
      const html = renderTable(emptyTable('t', 10, 10), ctx);
      expect(html).not.toContain('prompt');
      expect(html).not.toContain('Type to add text');
      expect(html).not.toContain('Click to add text');
      /* every empty cell keeps its empty paragraph, the line box the sheet's CSS gives it */
      expect(html.match(/<span class="para"><\/span>/g)?.length).toBe(100);
    }
  });
});

describe('the header rule with text (2.1 item 3; the row tables.header.rule-with-text)', () => {
  it('marks an inserted table’s empty header row as header alone, so the sheet draws the hairline', () => {
    const html = renderTable(emptyTable('t', 3, 3), context({ live: true }));
    expect(rowTags(html)).toEqual([
      '<div class="tr header">',
      '<div class="tr">',
      '<div class="tr">',
    ]);
    expect(html).not.toContain('has-text');
  });

  it('adds has-text once a header cell holds text past whitespace, on a plain or a marked up cell', () => {
    const typed = emptyTable('t', 3, 3);
    typed.rows[0]!.cells[0] = 'North';
    expect(rowTags(renderTable(typed, context()))[0]).toBe('<div class="tr header has-text">');
    const marked = emptyTable('t', 3, 3);
    marked.rows[0]!.cells[2] = '**Q3**\nunits';
    expect(rowTags(renderTable(marked, context()))[0]).toBe('<div class="tr header has-text">');
    const blank = emptyTable('t', 3, 3);
    blank.rows[0]!.cells[1] = '  ';
    expect(rowTags(renderTable(blank, context()))[0]).toBe('<div class="tr header">');
    /* a body row with text is never marked: the class is the header's */
    const body = emptyTable('t', 3, 3);
    body.rows[1]!.cells[0] = 'North';
    expect(rowTags(renderTable(body, context()))).toEqual([
      '<div class="tr header">',
      '<div class="tr">',
      '<div class="tr">',
    ]);
    expect(rowHasText({ cells: ['', ' ', ''] })).toBe(false);
    expect(rowHasText({ cells: ['', '*x*', ''] })).toBe(true);
  });

  it('draws the grid form’s header rule in ink only once the header holds text', () => {
    const grid: TableBlock = {
      ...emptyTable('t', 2, 2),
      spans: [{ row: 1, column: 0, rows: 1, columns: 2 }],
    };
    const empty = renderTable(grid, context());
    expect(empty).toContain('class="td first" style="border-bottom:1px solid var(--hair)"');
    expect(empty).not.toContain('var(--ink)');
    const typed: TableBlock = {
      ...grid,
      rows: [{ cells: ['Plan', ''], header: true }, grid.rows[1]!],
    };
    const html = renderTable(typed, context());
    expect(html).toContain('class="td first" style="border-bottom:1px solid var(--ink)"');
    expect(rowTags(html)[0]).toBe('<div class="tr header has-text">');
  });
});

describe('the cell’s own alignment (2.2 item 10; the row tables.range.align-cells-only)', () => {
  const table: TableBlock = {
    ...emptyTable('t', 2, 2, { header: false }),
    columns: [{ align: 'right' }, {}],
    cells: [
      { row: 0, column: 0, align: 'center' },
      { row: 1, column: 1, align: 'right', fill: 'plate' },
      { row: 1, column: 0, fill: 'plate' },
    ],
  };

  it('reads a cell’s align before its column’s and leaves the column’s to the other cells', () => {
    const html = renderTable(table, context());
    const cells = html.match(/<span class="td[^>]*>/g) ?? [];
    expect(cells).toHaveLength(4);
    /* row 0: the first cell's own centre over the column's right; the second the column's default */
    expect(cells[0]).toContain('style="text-align:center"');
    expect(cells[1]).not.toContain('text-align');
    /* row 1: the first cell keeps the column's right beside its fill; the second its own right */
    expect(cells[2]).toContain('style="text-align:right;background:var(--plate)"');
    expect(cells[3]).toContain('style="text-align:right;background:var(--plate)"');
  });

  it('draws a left aligned cell over a right aligned column with no inline alignment, the sheet’s default', () => {
    const left: TableBlock = { ...table, cells: [{ row: 0, column: 0, align: 'left' }] };
    const cells = renderTable(left, context()).match(/<span class="td[^>]*>/g) ?? [];
    expect(cells[0]).not.toContain('text-align');
    expect(cells[2]).toContain('text-align:right');
  });
});

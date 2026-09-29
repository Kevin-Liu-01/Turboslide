// The table block's markup (gslides-parity SPEC 7.3): a CSS grid in the ruled rows idiom whose
// cells carry the data-run pointers `<blockId>/rows/<r>/cells/<c>` and one .para span per
// paragraph, the contract the linter, find and replace and the inline editor read.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import { emptyTable } from '@turboslide/schema/blocks/table';
import type { BlockContext } from '../blocks/context.ts';
import { renderBlock } from '../blocks/render-block.ts';
import {
  TABLE_CELL_PROMPT,
  renderTable,
  tableColumnsTemplate,
  tableRowsTemplate,
} from '../blocks/table.ts';

function context(extra: Partial<BlockContext> = {}): BlockContext {
  return {
    slideId: 'table',
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

const pricing: TableBlock = {
  id: 'table',
  type: 'table',
  columns: [{ align: 'left' }, { align: 'right', width: 160 }, { align: 'right', fill: 'plate' }],
  rows: [
    { cells: ['Plan', 'Seats', 'Price'], header: true },
    { cells: ['Starter', '5', '$0'] },
    { cells: ['Team\nfor small groups', '25', '*$99*'] },
  ],
  border: { weight: 1.5 },
  valign: 'middle',
  size: 17,
};

describe('renderTable', () => {
  it('draws one grid with a row per row and the header row marked', () => {
    const ctx = context();
    const html = renderTable(pricing, ctx);
    expect(ctx.warnings).toEqual([]);
    expect(html.startsWith('<div class="table table-17"')).toBe(true);
    expect(html).toContain('data-block="table"');
    expect(html).toContain('data-type="table"');
    expect(html).toContain('role="table"');
    expect(html.match(/<div class="tr/g)?.length).toBe(3);
    /* the header row holds text, so it carries has-text (docs/POLISH.md 2.1 item 3) */
    expect(html).toContain('<div class="tr header has-text">');
    expect(html.match(/<span class="td/g)?.length).toBe(9);
  });

  it('addresses every cell by the linter pointer rows/<r>/cells/<c>', () => {
    const html = renderTable(pricing, context());
    for (const [r, row] of pricing.rows.entries())
      for (const c of row.cells.keys())
        expect(html).toContain(`data-run="table/rows/${r}/cells/${c}"`);
  });

  it('writes the column template, the rule weight and the vertical alignment as custom properties', () => {
    const html = renderTable(pricing, context());
    expect(html).toContain('--table-cols:minmax(0, 1fr) 160px minmax(0, 1fr)');
    expect(html).toContain('--table-rule:1.5px');
    expect(html).toContain('--table-valign:center');
    expect(tableColumnsTemplate([{}, { width: 200.5 }])).toBe('minmax(0, 1fr) 200.5px');
  });

  it('draws a fully sized grid as proportional shares so the row always fills the table (RETURN.md 2.4 fix 4)', () => {
    expect(tableColumnsTemplate([{ width: 240 }, { width: 480 }, { width: 240 }])).toBe(
      'minmax(0, 240fr) minmax(0, 480fr) minmax(0, 240fr)',
    );
    // one unset column keeps the px form: the set width is a designer's px, the rest shares
    expect(tableColumnsTemplate([{ width: 240 }, {}])).toBe('240px minmax(0, 1fr)');
    expect(tableColumnsTemplate([])).toBe('');
  });

  it('marks the edges as classes and the alignment and the column fill inline', () => {
    const html = renderTable(pricing, context());
    expect(html).toContain('class="td first"');
    expect(html).toContain('class="td" style="text-align:right"');
    expect(html).toContain('class="td last" style="text-align:right;background:var(--plate)"');
    /* never the `center` or `right` class: the sheet's layout helper `.ts-sheet .center` placed a
       centre aligned cell absolutely over its whole row (audit-objects row 97) */
    expect(html).not.toMatch(/class="td[^"]*\b(center|right)\b/);
    const centred = renderTable(
      { ...pricing, columns: [{ align: 'center' }, ...pricing.columns.slice(1)] },
      context(),
    );
    expect(centred).toContain('class="td first" style="text-align:center"');
  });

  it('renders each paragraph of a cell in its own span and the text markup inside', () => {
    const html = renderTable(pricing, context());
    expect(html).toContain(
      '<span class="para">Team</span><span class="para">for small groups</span>',
    );
    expect(html).toContain('<span class="para"><b>$99</b></span>');
  });

  it('renders an empty grid picker table with empty cells and no attributes when blockAttrs is off', () => {
    const ctx = context({ blockAttrs: false });
    const html = renderTable(emptyTable('t', 2, 2), ctx);
    expect(html.match(/<span class="para"><\/span>/g)?.length).toBe(4);
    expect(html).not.toContain('data-run');
    expect(html).not.toContain('data-block');
    expect(html).not.toContain('prompt');
    // the default weight and alignment write nothing; the column template and the row tracks always do
    expect(html).toContain(
      'style="--table-cols:minmax(0, 1fr) minmax(0, 1fr);grid-template-rows:auto auto"',
    );
    expect(html).not.toContain('--table-rule');
  });

  it('writes the row tracks of both forms: auto for a row, minmax(<height>px, auto) for a set height (docs/OBJECTS.md 3.3 item 3)', () => {
    /* an auto track: the floor is the empty cell's line box (54 at 20 px with the rule) and a
       wrapped cell grows it; a fixed minimum would turn the row's content minimum off */
    expect(tableRowsTemplate(emptyTable('t', 2, 3))).toBe('auto auto auto');
    /* a set height is the track's floor (Google's minimum row height) */
    expect(
      tableRowsTemplate({
        ...pricing,
        rows: [pricing.rows[0]!, { ...pricing.rows[1]!, height: 80 }, pricing.rows[2]!],
      }),
    ).toBe('auto minmax(80px, auto) auto');
    expect(tableRowsTemplate({ ...pricing, rows: [{ ...pricing.rows[0]!, height: 50.155 }] })).toBe(
      'minmax(50.16px, auto)',
    );
    const html = renderTable(pricing, context());
    expect(html).toContain('grid-template-rows:auto auto auto"');
    /* the grid form takes the same template */
    const merged = renderTable(
      { ...pricing, spans: [{ row: 1, column: 1, rows: 1, columns: 2 }] },
      context(),
    );
    expect(merged).toContain('class="table table-17 grid"');
    expect(merged).toContain('grid-template-rows:auto auto auto"');
  });

  it('writes no inline height on a row: its set height is the track floor, never a clip', () => {
    const html = renderTable(
      { ...pricing, rows: [pricing.rows[0]!, { ...pricing.rows[1]!, height: 80 }] },
      context(),
    );
    expect(html).not.toContain('style="height:');
    expect(html).toContain('<div class="tr">');
    expect(html).toContain('minmax(80px, auto)');
  });

  it('names the absent rules for the stage guides and writes no guide of its own (docs/OBJECTS.md 3.3 item 2)', () => {
    const plain = renderTable(emptyTable('t', 2, 2), context());
    expect(plain).not.toContain('no-rule');
    /* Google's Transparent border: the class on the root */
    const bare = renderTable({ ...emptyTable('t', 2, 2), border: { weight: 0 } }, context());
    expect(bare).toContain('class="table no-rule"');
    expect(bare).toContain('--table-rule:0px');
    /* a grid form cell whose own rule is 0: the class on the cell */
    const cell = renderTable(
      {
        ...emptyTable('t', 2, 2),
        cells: [{ row: 1, column: 0, border: { weight: 0 } }],
      },
      context(),
    );
    expect(cell).toContain('class="td first no-rule" style="border-bottom:0"');
    expect(cell.match(/no-rule/g)?.length).toBe(1);
    /* the guides are the editor stage's CSS (packages/viewer Editor.css): nothing here draws
       a seam, a box shadow or a right border */
    for (const html of [plain, bare, cell]) {
      expect(html).not.toContain('guide');
      expect(html).not.toContain('box-shadow');
      expect(html).not.toContain('border-right');
    }
  });

  it('writes no prompt words into a cell (docs/POLISH.md 2.1 item 1; the stage draws none since the polish round)', () => {
    expect(TABLE_CELL_PROMPT).toBe('Type to add text');
    expect(renderTable(emptyTable('t', 1, 1), context({ live: true }))).not.toContain(
      TABLE_CELL_PROMPT,
    );
  });

  it('draws no prompt in an empty cell, on the editor stage or elsewhere, and keeps the empty paragraph (docs/FEATURES.md 2.3 item 9)', () => {
    /* a 5 by 6 table drew thirty prompts before the features round; since the polish round no
       prompt is drawn in a cell at all (docs/POLISH.md 2.1 item 1) */
    const live = renderTable(emptyTable('t', 2, 1), context({ live: true }));
    expect(live).not.toContain('data-prompt');
    expect(live.match(/<span class="para"><\/span>/g)?.length).toBe(2);
    const still = renderTable(emptyTable('t', 2, 1), context());
    expect(still).not.toContain('data-prompt');
  });

  it('is reached through renderBlock', () => {
    const block: Block = pricing;
    expect(renderBlock(block, context())).toBe(renderTable(pricing, context()));
  });
});

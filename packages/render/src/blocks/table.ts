// The table block (gslides-parity SPEC 7.3): Google's Insert > Table as a grid of Text cells in
// the `.rows` idiom. The markup is a CSS grid, not a <table>: one `.table` root with a hairline
// above, one `.tr` row per row (display grid over the column template, a rule under every row,
// the header row at display weight 500 with an ink rule under it), one `.td` cell per cell with
// `text-align` from its column, a plate fill when the column sets one, the vertical alignment
// through `align-items`, tabular numerals, and the `.rows` size ladder. Every cell is addressable
// through data-run "<blockId>/rows/<r>/cells/<c>" (the pointer the linter, find and replace and
// the inline editor read, packages/lint/src/context.ts), and every paragraph of a cell is its own
// `.para` span (SPEC 7.4), always, so the editor's cell contract has one shape. An empty cell
// draws the prompt "Click to add text" on the editor stage and nothing elsewhere (SPEC 5.4).
//
// The exporter reads the same elements: the row rules from the computed borders (the ruled rows
// construction), the cell boxes for addTable's column widths and row heights, and the alignment
// and fill from the computed style (packages/export/src/scene/measure.ts).
import type { BlockOf } from '@turboslide/schema/blocks';
import { colorCss } from '@turboslide/schema/color';
import { TABLE_BORDER_WEIGHTS } from '@turboslide/schema/blocks/table';
import { classes, el, px, style } from '../html.ts';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderMultiline } from './prompt.ts';

/** The .rows ladder step a table draws at when the block sets none (blocks/table.ts TABLE_SIZES). */
export const TABLE_DEFAULT_SIZE = 20;

/** The rule weight when the block sets none: the sheet hairline. */
export const TABLE_DEFAULT_BORDER = TABLE_BORDER_WEIGHTS[0];

/** The grid template of the columns: a width in px where set, an equal share otherwise. */
export function tableColumnsTemplate(columns: BlockOf<'table'>['columns']): string {
  return columns
    .map((column) => (column.width !== undefined ? `${px(column.width)}px` : 'minmax(0, 1fr)'))
    .join(' ');
}

export function renderTable(block: BlockOf<'table'>, ctx: BlockContext): string {
  const size = block.size ?? TABLE_DEFAULT_SIZE;
  const weight = block.border?.weight ?? TABLE_DEFAULT_BORDER;
  const inline = style(
    `--table-cols:${tableColumnsTemplate(block.columns)}`,
    weight !== TABLE_DEFAULT_BORDER && `--table-rule:${px(weight)}px`,
    block.valign === 'middle' && '--table-valign:center',
    block.valign === 'bottom' && '--table-valign:end',
  );
  const last = block.columns.length - 1;
  const rows = block.rows
    .map((row, r) => {
      const cells = row.cells
        .map((cell, c) => {
          const column = block.columns[c];
          return el(
            'span',
            {
              class: classes(
                'td',
                column?.align === 'center' && 'center',
                column?.align === 'right' && 'right',
                c === 0 && 'first',
                c === last && 'last',
              ),
              style: column?.fill !== undefined ? `background:${colorCss(column.fill)}` : undefined,
              'data-run': runAttr(ctx, block.id, `rows/${r}/cells/${c}`),
            },
            renderMultiline(cell, ctx, block, `/rows/${r}/cells/${c}`, true),
          );
        })
        .join('');
      return el('div', { class: classes('tr', row.header === true && 'header') }, cells);
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes('table', size !== TABLE_DEFAULT_SIZE && `table-${size}`),
      style: inline,
      role: 'table',
    }),
    rows,
  );
}

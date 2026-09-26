// The table block (gslides-parity SPEC 7.3; SPEC-2 2.7): Google's Insert > Table as a grid of Text
// cells in the `.rows` idiom. The markup is a CSS grid, not a <table>: one `.table` root with a
// hairline above, one `.tr` row per row (display grid over the column template, a rule under
// every row, the header row at display weight 500 with an ink rule under it), one `.td` cell per
// cell with `text-align` from its column, a plate fill when the column sets one, the vertical
// alignment through `align-items`, tabular numerals, and the `.rows` size ladder. Every cell is
// addressable through data-run "<blockId>/rows/<r>/cells/<c>" (the pointer the linter, find and
// replace and the inline editor read, packages/lint/src/context.ts), and every paragraph of a
// cell is its own `.para` span (SPEC 7.4), always, so the editor's cell contract has one shape. An
// empty cell draws no prompt (docs/FEATURES.md 2.3 item 9): the editor's stage draws "Click to add
// text" in the hovered empty cell alone, and the empty `.para` keeps a line box through CSS.
//
// Round two (SPEC-2 2.7): a row's `height` is written on its `.tr`; the table border's colour and
// dash travel as `--table-rule-color` and `--table-rule-style`, weight 0 as `--table-rule: 0px`
// (no rule); a table with merged cells (`spans`) or a cell border (`cells[].border`) takes the
// grid form, where the `.tr` rows are `display: contents`, every `.td` is a grid item of the one
// `.table` grid (`grid-row: span n; grid-column: span m` on a span's anchor, the covered cells
// not drawn) and the rules are drawn per cell (the row's rule under every cell, none where a cell
// border says weight 0, the cell's own colour and dash where set); a cell fill is inline. A table
// written before this round renders byte for byte.
//
// The objects round (docs/OBJECTS.md 3.3 items 2 and 3): both forms are one CSS grid whose row
// tracks the renderer writes inline (`tableRowsTemplate`): `auto` for a row with no set height,
// whose floor is its content (the empty cell's line box, 54 px at 20 px with the rule, the
// schema's `tableRowTrack`), and `minmax(<height>px, auto)` for a row with a set `height`,
// Google's minimum row height; so an empty row stands at its line box, a wrapped cell grows its
// row and a positioned table taller than its rows shares the extra evenly (the auto tracks
// stretch, block-css.ts); the classic form's `.tr` no longer carries an inline height. A table whose rule
// weight is 0 carries the class `no-rule` on its root, and a grid form cell whose own rule is 0
// carries it on the cell: the editor's stage draws its guide grid from those classes and from
// `.td:not(.last)` (packages/viewer Editor.css), never from anything written here, so the show,
// the thumbnails, the PDF and the PowerPoint draw the grammar's rules alone.
//
// The exporter reads the same elements: the row rules from the computed borders (the ruled rows
// construction), the cell boxes for addTable's column widths and row heights, and the alignment
// and fill from the computed style (packages/export/src/scene/measure.ts).
import type { BlockOf } from '@turboslide/schema/blocks';
import { isCoveredCell, spanAt } from '@turboslide/schema/blocks';
import { colorCss } from '@turboslide/schema/color';
import type { TableBorderWeight, TableCellStyle } from '@turboslide/schema/blocks/table';
import { tableRowTrack } from '@turboslide/schema/blocks/table';
import { classes, el, px, style } from '../html.ts';
import { rootAttrs, runAttr } from './context.ts';
import type { BlockContext } from './context.ts';
import { renderMultiline } from './prompt.ts';
import { borderStyleDeclaration, boxShadowDeclaration } from './primitives.ts';

/** The .rows ladder step a table draws at when the block sets none (blocks/table.ts TABLE_SIZES). */
export const TABLE_DEFAULT_SIZE = 20;

/** 1, the sheet hairline; not the first weight of the list, which is Google's Transparent 0 since round two (SPEC-2 0.63). */
export const TABLE_DEFAULT_BORDER: TableBorderWeight = 1;

/**
 * The words the editor's stage draws in the hovered empty cell (docs/OBJECTS.md 3.3 item 7):
 * one click already places the caret, so the prompt names the next gesture. The renderer writes
 * no prompt; packages/viewer Editor.tsx `promptHoveredCell` appends it to the hovered cell alone.
 */
export const TABLE_CELL_PROMPT = 'Type to add text';

/**
 * The row tracks of the table's grid: `auto` for a row with no set height, so its floor is its
 * content (an empty cell keeps a line box through the sheet's CSS, 54 px at 20 px with the rule;
 * the schema's `tableRowTrack` states the same number) and a wrapped cell grows it; and
 * `minmax(<height>px, auto)` for a row with a set height, Google's minimum row height. The auto
 * max lets a positioned table's slack stretch every row alike (block-css.ts `align-content`). A
 * fixed minimum is written only where the document sets one: a track whose minimum is a length
 * turns the grid item's automatic minimum size off (CSS Grid 6.6), and in a box shorter than the
 * rows the item then overflows its track instead of growing it (measured on the lane's stage:
 * forty words in a 320 px box gave a 211 px track under a 314 px cell), so the common row keeps
 * the content-based minimum an auto track gives.
 */
export function tableRowsTemplate(block: BlockOf<'table'>): string {
  return block.rows
    .map((row) =>
      row.height === undefined
        ? 'auto'
        : `minmax(${px(Math.round(tableRowTrack(block, row) * 100) / 100)}px, auto)`,
    )
    .join(' ');
}

/**
 * The grid template of the columns: an equal share when no column carries a width; a width in
 * px where set and an equal share of the rest otherwise; and, once every column carries a width,
 * proportional shares (`fr`) of the table's own width, so a table resized by its handles scales
 * its columns and widths that drifted from the box still fill it with no gap and no overlap
 * (docs/RETURN.md 2.4 fix 4; the seam handle and the column commands write every width). The
 * numbers agree with `columnShares` in @turboslide/schema/blocks/table.
 */
export function tableColumnsTemplate(columns: BlockOf<'table'>['columns']): string {
  if (columns.length > 0 && columns.every((column) => column.width !== undefined))
    return columns.map((column) => `minmax(0, ${px(column.width ?? 0)}fr)`).join(' ');
  return columns
    .map((column) => (column.width !== undefined ? `${px(column.width)}px` : 'minmax(0, 1fr)'))
    .join(' ');
}

/** True when the table draws in the grid form: merged cells or a per cell border (SPEC-2 2.7.1, 2.7.2). */
export function usesGridForm(block: BlockOf<'table'>): boolean {
  return (
    (block.spans !== undefined && block.spans.length > 0) ||
    (block.cells ?? []).some((cell) => cell.border !== undefined)
  );
}

function cellStyleAt(block: BlockOf<'table'>, r: number, c: number): TableCellStyle | undefined {
  return (block.cells ?? []).find((cell) => cell.row === r && cell.column === c);
}

/** The border declaration of one cell's rule in the grid form (SPEC-2 2.7.2, 2.7.3). */
function cellRule(
  block: BlockOf<'table'>,
  header: boolean,
  cell: TableCellStyle | undefined,
): string {
  const weight = cell?.border?.weight ?? block.border?.weight ?? TABLE_DEFAULT_BORDER;
  if (weight === 0) return 'border-bottom:0';
  const color =
    cell?.border?.color !== undefined
      ? colorCss(cell.border.color)
      : header
        ? 'var(--ink)'
        : block.border?.color !== undefined
          ? colorCss(block.border.color)
          : 'var(--hair)';
  const dash = cell?.border?.dash ?? block.border?.dash;
  const lineStyle =
    dash === undefined || dash === 'solid' ? 'solid' : dash === 'dot' ? 'dotted' : 'dashed';
  return `border-bottom:${px(weight)}px ${lineStyle} ${color}`;
}

export function renderTable(block: BlockOf<'table'>, ctx: BlockContext): string {
  const size = block.size ?? TABLE_DEFAULT_SIZE;
  const weight = block.border?.weight ?? TABLE_DEFAULT_BORDER;
  const grid = usesGridForm(block);
  const inline = style(
    `--table-cols:${tableColumnsTemplate(block.columns)}`,
    weight !== TABLE_DEFAULT_BORDER && `--table-rule:${px(weight)}px`,
    block.border?.color !== undefined && `--table-rule-color:${colorCss(block.border.color)}`,
    block.border?.dash !== undefined &&
      block.border.dash !== 'solid' &&
      `--table-rule-style:${block.border.dash === 'dot' ? 'dotted' : 'dashed'}`,
    block.valign === 'middle' && '--table-valign:center',
    block.valign === 'bottom' && '--table-valign:end',
    /* the row tracks of both forms (docs/OBJECTS.md 3.3 item 3): a floor per row, growth with
       the text, the slack shared; the classic form's rows are the items of the root's one column
       grid (sheet.css `.ts-sheet .table`) and the grid form's cells span it */
    `grid-template-rows:${tableRowsTemplate(block)}`,
    boxShadowDeclaration(block.shadow),
  );
  const last = block.columns.length - 1;
  const rows = block.rows
    .map((row, r) => {
      const cells = row.cells
        .map((cell, c) => {
          if (grid && isCoveredCell(block.spans ?? [], r, c)) return '';
          const column = block.columns[c];
          const own = cellStyleAt(block, r, c);
          const span = grid ? spanAt(block.spans ?? [], r, c) : undefined;
          const fill = own?.fill ?? column?.fill;
          /* the alignment travels inline, never as a `center` or `right` class: the sheet's
             layout helper `.ts-sheet .center` (sheet.css, position absolute over the slot) matched
             a centre aligned cell and drew it across its whole row, over the other cells, in the
             editor, the show and the exports (audit-objects rows 97 and 85, the "one column at
             the whole table width"; measured on the checkout in docs/gslides-parity/return/build/b5.md) */
          const align = column?.align;
          const rule = grid ? cellRule(block, row.header === true, own) : undefined;
          return el(
            'span',
            {
              class: classes(
                'td',
                c === 0 && 'first',
                (span !== undefined ? c + span.columns - 1 : c) === last && 'last',
                /* a grid form cell with no rule of its own: the stage's guide draws one (Editor.css) */
                rule === 'border-bottom:0' && 'no-rule',
              ),
              style: style(
                (align === 'center' || align === 'right') && `text-align:${align}`,
                fill !== undefined && `background:${colorCss(fill)}`,
                span !== undefined && span.rows > 1 && `grid-row:span ${span.rows}`,
                span !== undefined && span.columns > 1 && `grid-column:span ${span.columns}`,
                rule,
              ),
              'data-run': runAttr(ctx, block.id, `rows/${r}/cells/${c}`),
              'data-span':
                span !== undefined && (span.rows > 1 || span.columns > 1)
                  ? `${span.rows}x${span.columns}`
                  : undefined,
            },
            /* an empty cell draws no prompt (docs/FEATURES.md 2.3 item 9; audit-objects 24): the
               editor's stage appends "Click to add text" to the hovered empty cell alone, and the
               empty `.para` keeps its line box through the sheet's CSS (block-css.ts) */
            cell === ''
              ? el('span', { class: 'para' }, '')
              : renderMultiline(cell, ctx, block, `/rows/${r}/cells/${c}`, true),
          );
        })
        .join('');
      /* a row's set height is its track's floor (the root's grid-template-rows above), never an
         inline height that clipped a wrapped cell: Google's minimum row height */
      return el('div', { class: classes('tr', row.header === true && 'header') }, cells);
    })
    .join('');
  return el(
    'div',
    rootAttrs(block, ctx, {
      className: classes(
        'table',
        size !== TABLE_DEFAULT_SIZE && `table-${size}`,
        grid && 'grid',
        /* Google's Transparent border (SPEC-2 0.63): no rule drawn; the stage's guide grid draws
           the rows' seams from the class (Editor.css) */
        weight === 0 && 'no-rule',
      ),
      style: inline,
      role: 'table',
      'data-dash': borderStyleDeclaration(block.border?.dash) ? block.border?.dash : undefined,
    }),
    rows,
  );
}

// The table block (gslides-parity SPEC 7.3; R11 A8 for the 20 by 20 cap): Google's Insert > Table
// as a grid of Text cells in the `.rows` idiom. Columns carry an optional width, alignment and
// plate fill; rows carry their cells and an optional header flag; the cells take the multiline
// Text of SPEC 7.4. The cap and the one-cell-per-column rule are checked by validate.ts under the
// issue code `table_size` at severity 3, so the code names the rule rather than the Zod path.
// Imports only zod, annotate, color, ids and text so blocks.ts can import it without a cycle.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { Color } from '../color.ts';
import { colorField } from '../color.ts';
import type { BlockId } from '../ids.ts';
import type { Text } from '../text.ts';
import { multilineTextSchema } from '../text.ts';

/** Google's table limit (R11 A8): 20 columns by 20 rows. */
export const TABLE_MAX_COLUMNS = 20;
export const TABLE_MAX_ROWS = 20;

/** The `.rows` size ladder the table draws at; 20 when absent (head:96-101). */
export const TABLE_SIZES = [20, 18, 17, 16, 15] as const;
export type TableSize = (typeof TABLE_SIZES)[number];

export const TABLE_ALIGNS = ['left', 'center', 'right'] as const;
export type TableAlign = (typeof TABLE_ALIGNS)[number];

export const TABLE_VALIGNS = ['top', 'middle', 'bottom'] as const;
export type TableValign = (typeof TABLE_VALIGNS)[number];

export const TABLE_BORDER_WEIGHTS = [1, 1.5, 2] as const;
export type TableBorderWeight = (typeof TABLE_BORDER_WEIGHTS)[number];

export type TableColumn = { width?: number; align?: TableAlign; fill?: Color };
export type TableRow = { cells: Text[]; header?: true };

/** The table's own fields; BlockBase (id, ext, pos, link) is added in blocks.ts. */
export type TableFields = {
  type: 'table';
  columns: TableColumn[];
  /** cells use multilineTextSchema */
  rows: TableRow[];
  valign?: TableValign;
  border?: { weight: TableBorderWeight };
  /** the .rows ladder; 20 when absent */
  size?: TableSize;
};

export type TableBlock = TableFields & { id: BlockId; ext?: Record<string, unknown> };

export const tableColumnSchema = z.strictObject({
  width: annotate(z.number().positive().optional(), {
    label: 'Width',
    control: 'number',
    group: 'Layout',
    help: 'The column width in px; equal columns when every width is absent.',
  }),
  align: annotate(z.enum(TABLE_ALIGNS).optional(), {
    label: 'Align',
    control: 'select',
    snap: TABLE_ALIGNS,
    group: 'Block',
  }),
  fill: colorField('Fill', 'A plate fill behind the column; none unless set.'),
}) satisfies z.ZodType<TableColumn>;

export const tableRowSchema = z.strictObject({
  cells: z
    .array(annotate(multilineTextSchema, { label: 'Cell', control: 'textarea', group: 'Text' }))
    .min(1),
  header: annotate(z.literal(true).optional(), {
    label: 'Header row',
    control: 'toggle',
    group: 'Block',
    help: 'Display weight 500 with an ink rule under it.',
  }),
}) satisfies z.ZodType<TableRow>;

/** The fields of a table block as a shape, spread into the block schema in blocks.ts. */
export const tableFieldsShape = {
  type: z.literal('table'),
  columns: annotate(z.array(tableColumnSchema).min(1), {
    label: 'Columns',
    control: 'json',
    group: 'Layout',
    help: `One entry per column, ${TABLE_MAX_COLUMNS} at most (R11 A8).`,
  }),
  rows: annotate(z.array(tableRowSchema).min(1), {
    label: 'Rows',
    control: 'json',
    group: 'Block',
    help: `One entry per row with one cell per column, ${TABLE_MAX_ROWS} rows at most (R11 A8).`,
  }),
  valign: annotate(z.enum(TABLE_VALIGNS).optional(), {
    label: 'Vertical alignment',
    control: 'select',
    snap: TABLE_VALIGNS,
    group: 'Block',
  }),
  border: z
    .strictObject({
      weight: annotate(z.literal(TABLE_BORDER_WEIGHTS), {
        label: 'Border weight',
        control: 'select',
        snap: TABLE_BORDER_WEIGHTS,
        group: 'Block',
        help: '1 is the sheet hairline, 1.5 the diagram stroke, 2 a plate edge.',
      }),
    })
    .optional(),
  size: annotate(z.literal(TABLE_SIZES).optional(), {
    label: 'Size',
    control: 'select',
    snap: TABLE_SIZES,
    group: 'Block',
    help: 'The .rows ladder in px; 20 unless set.',
  }),
};

/**
 * Why a table's shape is refused, or null when it holds: at most 20 by 20 and every row with
 * exactly as many cells as there are columns (gslides-parity SPEC 7.3). validate.ts reports the
 * first problem as `table_size` at severity 3 with a pointer.
 */
export function tableSizeProblem(
  table: Pick<TableFields, 'columns' | 'rows'>,
): { pointer: string; message: string } | null {
  if (table.columns.length > TABLE_MAX_COLUMNS) {
    return {
      pointer: '/columns',
      message: `A table has at most ${TABLE_MAX_COLUMNS} columns, this one has ${table.columns.length} (R11 A8)`,
    };
  }
  if (table.rows.length > TABLE_MAX_ROWS) {
    return {
      pointer: '/rows',
      message: `A table has at most ${TABLE_MAX_ROWS} rows, this one has ${table.rows.length} (R11 A8)`,
    };
  }
  for (const [index, row] of table.rows.entries()) {
    if (row.cells.length !== table.columns.length) {
      return {
        pointer: `/rows/${index}/cells`,
        message: `Row ${index + 1} has ${row.cells.length} cell(s) for ${table.columns.length} column(s); every row carries one cell per column`,
      };
    }
  }
  return null;
}

/** An empty table of the given size with a header row: what the grid picker inserts (SPEC 7.3). */
export function emptyTable(
  id: BlockId,
  columns: number,
  rows: number,
  options: { header?: boolean } = {},
): TableBlock {
  const width = Math.max(1, Math.min(TABLE_MAX_COLUMNS, Math.round(columns)));
  const height = Math.max(1, Math.min(TABLE_MAX_ROWS, Math.round(rows)));
  const header = options.header ?? true;
  return {
    id,
    type: 'table',
    columns: Array.from({ length: width }, () => ({})),
    rows: Array.from({ length: height }, (_, index) => ({
      cells: Array.from({ length: width }, () => ''),
      ...(header && index === 0 ? { header: true as const } : {}),
    })),
  };
}

/**
 * The nine row and column commands of Google's table menu as new `rows` and `columns` values
 * (gslides-parity SPEC 7.3): each one is written back with one `block.set` of `/rows` or
 * `/columns`. Indexes are zero based; an index past the end appends.
 */
export type TableCommand =
  | { kind: 'insertRowAbove'; row: number }
  | { kind: 'insertRowBelow'; row: number }
  | { kind: 'insertColumnLeft'; column: number }
  | { kind: 'insertColumnRight'; column: number }
  | { kind: 'deleteRow'; row: number }
  | { kind: 'deleteColumn'; column: number }
  | { kind: 'deleteTable' }
  | { kind: 'distributeRows' }
  | { kind: 'distributeColumns' };

export type TableEdit = { columns: TableColumn[]; rows: TableRow[] } | { deleted: true };

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(index)));
}

/** Applies one command and returns the new columns and rows, or `deleted` for Delete table. */
export function applyTableCommand(
  table: Pick<TableFields, 'columns' | 'rows'>,
  command: TableCommand,
): TableEdit {
  const columns = table.columns.map((column) => ({ ...column }));
  const rows = table.rows.map((row) => ({ ...row, cells: [...row.cells] }));
  const blankRow = (): TableRow => ({ cells: columns.map(() => '') });
  switch (command.kind) {
    case 'insertRowAbove': {
      if (rows.length >= TABLE_MAX_ROWS) return { columns, rows };
      rows.splice(clampIndex(command.row, rows.length), 0, blankRow());
      return { columns, rows };
    }
    case 'insertRowBelow': {
      if (rows.length >= TABLE_MAX_ROWS) return { columns, rows };
      rows.splice(clampIndex(command.row, rows.length - 1) + 1, 0, blankRow());
      return { columns, rows };
    }
    case 'insertColumnLeft':
    case 'insertColumnRight': {
      if (columns.length >= TABLE_MAX_COLUMNS) return { columns, rows };
      const at =
        command.kind === 'insertColumnLeft'
          ? clampIndex(command.column, columns.length)
          : clampIndex(command.column, columns.length - 1) + 1;
      columns.splice(at, 0, {});
      for (const row of rows) row.cells.splice(at, 0, '');
      return { columns, rows };
    }
    case 'deleteRow': {
      if (rows.length <= 1) return { deleted: true };
      rows.splice(clampIndex(command.row, rows.length - 1), 1);
      return { columns, rows };
    }
    case 'deleteColumn': {
      if (columns.length <= 1) return { deleted: true };
      const at = clampIndex(command.column, columns.length - 1);
      columns.splice(at, 1);
      for (const row of rows) row.cells.splice(at, 1);
      return { columns, rows };
    }
    case 'deleteTable':
      return { deleted: true };
    case 'distributeRows':
      // rows have no stored height: the grid already gives every row its content height
      return { columns, rows };
    case 'distributeColumns':
      return { columns: columns.map(({ width: _width, ...rest }) => rest), rows };
  }
}

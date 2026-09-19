// The table block (gslides-parity SPEC 7.3; R11 A8 for the 20 by 20 cap; SPEC-2 2.7 for merged
// cells, cell styles, row heights and the table border): Google's Insert > Table as a grid of Text
// cells in the `.rows` idiom. Columns carry an optional width, alignment and plate fill; rows carry
// their cells, an optional header flag and an optional height; `spans` merge cells (the anchor and
// its extent, the covered cells keeping their Text); `cells` style single cells (fill, border with
// weight 0 for Google's Transparent border, 0.63); `border` colours and dashes the table's rules.
// The cap, the one-cell-per-column rule, the spans inside the grid and not overlapping and the
// styled cells inside the grid are checked by validate.ts under the issue code `table_size` at
// severity 3, so the code names the rule rather than the Zod path. Imports only zod, annotate,
// color, ids, shapes and text so blocks.ts can import it without a cycle.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { Color } from '../color.ts';
import { colorField } from '../color.ts';
import type { BlockId } from '../ids.ts';
import type { Dash } from '../shapes.ts';
import { DASHES } from '../shapes.ts';
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

/** 0 is Google's Transparent border: no rule is drawn (SPEC-2 0.63). */
export const TABLE_BORDER_WEIGHTS = [0, 1, 1.5, 2] as const;
export type TableBorderWeight = (typeof TABLE_BORDER_WEIGHTS)[number];

export type TableColumn = { width?: number; align?: TableAlign; fill?: Color };
export type TableRow = { cells: Text[]; header?: true; height?: number };

/** A merged cell: the anchor at (row, column) spanning `rows` by `columns` cells (SPEC-2 2.7.1). */
export type TableSpan = { row: number; column: number; rows: number; columns: number };

/** The border of one cell or of the table (SPEC-2 2.7.2, 2.7.3). */
export type CellBorder = { color?: Color; weight?: TableBorderWeight; dash?: Dash };

/** One styled cell (SPEC-2 2.7.2). */
export type TableCellStyle = { row: number; column: number; fill?: Color; border?: CellBorder };

export type TableBorder = { weight: TableBorderWeight; color?: Color; dash?: Dash };

/** The table's own fields; BlockBase (id, ext, pos, link, alt) is added in blocks.ts. */
export type TableFields = {
  type: 'table';
  columns: TableColumn[];
  /** cells use multilineTextSchema */
  rows: TableRow[];
  valign?: TableValign;
  border?: TableBorder;
  /** the .rows ladder; 20 when absent */
  size?: TableSize;
  spans?: TableSpan[];
  cells?: TableCellStyle[];
};

export type TableBlock = TableFields & { id: BlockId; ext?: Record<string, unknown> };

const gridIndex = z.number().int().nonnegative();

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
  height: annotate(z.number().positive().optional(), {
    label: 'Row height',
    control: 'number',
    group: 'Layout',
    help: 'The row height in px; the content height when absent (gslides-parity SPEC-2 2.7.4).',
  }),
}) satisfies z.ZodType<TableRow>;

export const tableSpanSchema = z.strictObject({
  row: gridIndex,
  column: gridIndex,
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
}) satisfies z.ZodType<TableSpan>;

export const cellBorderSchema = z.strictObject({
  color: colorField('Border color', 'The rule color; the hairline token unless set.'),
  weight: annotate(z.literal(TABLE_BORDER_WEIGHTS).optional(), {
    label: 'Border weight',
    control: 'select',
    snap: TABLE_BORDER_WEIGHTS,
    group: 'Block',
    help: '0 draws no rule (Google’s Transparent border), 1 is the sheet hairline, 1.5 the diagram stroke, 2 a plate edge.',
  }),
  dash: annotate(z.enum(DASHES).optional(), {
    label: 'Border dash',
    control: 'select',
    snap: DASHES,
    group: 'Block',
  }),
}) satisfies z.ZodType<CellBorder>;

export const tableCellStyleSchema = z.strictObject({
  row: gridIndex,
  column: gridIndex,
  fill: colorField('Cell fill', 'A plate fill behind the cell; none unless set.'),
  border: cellBorderSchema.optional(),
}) satisfies z.ZodType<TableCellStyle>;

export const tableBorderSchema = z.strictObject({
  weight: annotate(z.literal(TABLE_BORDER_WEIGHTS), {
    label: 'Border weight',
    control: 'select',
    snap: TABLE_BORDER_WEIGHTS,
    group: 'Block',
    help: '1 is the sheet hairline, 1.5 the diagram stroke, 2 a plate edge; 0 removes the table’s rules (gslides-parity SPEC-2 0.63).',
  }),
  color: colorField('Border color', 'The rule color; the hairline token unless set.'),
  dash: annotate(z.enum(DASHES).optional(), {
    label: 'Border dash',
    control: 'select',
    snap: DASHES,
    group: 'Block',
  }),
}) satisfies z.ZodType<TableBorder>;

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
  border: tableBorderSchema.optional(),
  size: annotate(z.literal(TABLE_SIZES).optional(), {
    label: 'Size',
    control: 'select',
    snap: TABLE_SIZES,
    group: 'Block',
    help: 'The .rows ladder in px; 20 unless set.',
  }),
  spans: annotate(z.array(tableSpanSchema).optional(), {
    label: 'Merged cells',
    control: 'json',
    group: 'Block',
    help: 'Each entry is the anchor cell and how many rows and columns it spans; the covered cells keep their text (gslides-parity SPEC-2 2.7.1).',
  }),
  cells: annotate(z.array(tableCellStyleSchema).optional(), {
    label: 'Cell styles',
    control: 'json',
    group: 'Block',
    help: 'Fill and border per cell (gslides-parity SPEC-2 2.7.2).',
  }),
};

/** The cells a span covers as `r,c` keys, the anchor included. */
export function spanCells(span: TableSpan): string[] {
  const out: string[] = [];
  for (let r = span.row; r < span.row + span.rows; r += 1)
    for (let c = span.column; c < span.column + span.columns; c += 1) out.push(`${r},${c}`);
  return out;
}

/** The span whose extent covers a cell, or undefined. */
export function spanAt(
  spans: ReadonlyArray<TableSpan> | undefined,
  row: number,
  column: number,
): TableSpan | undefined {
  return (spans ?? []).find(
    (span) =>
      row >= span.row &&
      row < span.row + span.rows &&
      column >= span.column &&
      column < span.column + span.columns,
  );
}

/** True when the cell is covered by a span whose anchor is another cell (the renderer skips it). */
export function isCoveredCell(
  spans: ReadonlyArray<TableSpan> | undefined,
  row: number,
  column: number,
): boolean {
  const span = spanAt(spans, row, column);
  return span !== undefined && (span.row !== row || span.column !== column);
}

/**
 * Why a table's shape is refused, or null when it holds: at most 20 by 20, every row with
 * exactly as many cells as there are columns (gslides-parity SPEC 7.3), every span inside the grid
 * with none overlapping and none of one cell, every styled cell inside the grid (SPEC-2 2.7).
 * validate.ts reports the first problem as `table_size` at severity 3 with a pointer.
 */
export function tableSizeProblem(
  table: Pick<TableFields, 'columns' | 'rows'> & Partial<Pick<TableFields, 'spans' | 'cells'>>,
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
  const covered = new Map<string, number>();
  for (const [index, span] of (table.spans ?? []).entries()) {
    if (span.rows * span.columns < 2) {
      return {
        pointer: `/spans/${index}`,
        message: `Merged cells cover two cells or more; the entry at row ${span.row + 1}, column ${span.column + 1} covers one`,
      };
    }
    if (
      span.row + span.rows > table.rows.length ||
      span.column + span.columns > table.columns.length
    ) {
      return {
        pointer: `/spans/${index}`,
        message: `Merged cells at row ${span.row + 1}, column ${span.column + 1} reach past the ${table.columns.length} by ${table.rows.length} grid`,
      };
    }
    for (const key of spanCells(span)) {
      const other = covered.get(key);
      if (other !== undefined) {
        return {
          pointer: `/spans/${index}`,
          message: `Merged cells at row ${span.row + 1}, column ${span.column + 1} overlap the merged cells of entry ${other + 1}`,
        };
      }
      covered.set(key, index);
    }
  }
  for (const [index, cell] of (table.cells ?? []).entries()) {
    if (cell.row >= table.rows.length || cell.column >= table.columns.length) {
      return {
        pointer: `/cells/${index}`,
        message: `The cell style at row ${cell.row + 1}, column ${cell.column + 1} names a cell outside the ${table.columns.length} by ${table.rows.length} grid`,
      };
    }
  }
  return null;
}

/** The px a sized grid declares: the set widths, an unset column counted at their mean. */
function declaredTotal(columns: ReadonlyArray<TableColumn>): number {
  const set = columns.flatMap((column) => (column.width === undefined ? [] : [column.width]));
  if (set.length === 0) return 0;
  const mean = set.reduce((sum, w) => sum + w, 0) / set.length;
  return columns.reduce((sum, column) => sum + (column.width ?? mean), 0);
}

/** A column width as stored: whole hundredths of a px, never below the smallest column. */
function roundWidth(width: number): number {
  return Math.max(TABLE_MIN_COLUMN_PX, Math.round(width * 100) / 100);
}

/** The narrowest a column drag or a column insert leaves a column, in sheet px (docs/RETURN.md 2.4 fix 5). */
export const TABLE_MIN_COLUMN_PX = 40;

/**
 * The widths the columns draw at inside a table `total` px wide, the grid template's own rule
 * (packages/render blocks/table.ts tableColumnsTemplate): equal shares when no column carries a
 * width; the widths scaled to the total when every column carries one (the template is
 * proportional, so a resized table scales its columns and a sum that drifted from the box still
 * fills it); a width kept in px where set and the remainder shared by the others otherwise.
 * Never negative; a total of 0 gives zeros. The seam handle and the column commands read it.
 */
export function columnShares(columns: ReadonlyArray<TableColumn>, total: number): number[] {
  const n = columns.length;
  if (n === 0) return [];
  const set = columns.filter((column) => column.width !== undefined);
  if (set.length === 0) return columns.map(() => total / n);
  if (set.length === n) {
    const sum = columns.reduce((acc, column) => acc + (column.width ?? 0), 0);
    return columns.map((column) => (sum > 0 ? ((column.width ?? 0) * total) / sum : total / n));
  }
  const fixed = set.reduce((acc, column) => acc + (column.width ?? 0), 0);
  const rest = Math.max(0, total - fixed) / (n - set.length);
  return columns.map((column) => column.width ?? rest);
}

/**
 * The columns after a seam between `index` and `index + 1` moved by `dx` px inside a table
 * `total` px wide (docs/RETURN.md 2.4 fix 5; Google drags a gridline, research 05 A6): the left
 * column widens by dx and its neighbour narrows, neither below TABLE_MIN_COLUMN_PX, the others
 * keep their drawn widths, and every column carries a width so the grid stays proportional.
 * Null when nothing would change (a click, a seam at its limit, an index off the grid).
 */
export function columnsAfterSeamDrag(
  columns: ReadonlyArray<TableColumn>,
  total: number,
  index: number,
  dx: number,
): { columns: TableColumn[]; left: number; right: number } | null {
  if (index < 0 || index >= columns.length - 1 || !Number.isFinite(dx)) return null;
  const shares = columnShares(columns, total);
  const left = shares[index] ?? 0;
  const right = shares[index + 1] ?? 0;
  const pair = left + right;
  if (pair < TABLE_MIN_COLUMN_PX * 2) return null;
  const nextLeft = Math.round(
    Math.min(pair - TABLE_MIN_COLUMN_PX, Math.max(TABLE_MIN_COLUMN_PX, left + dx)),
  );
  const nextRight = Math.round(pair) - nextLeft;
  if (nextLeft === Math.round(left)) return null;
  const next = columns.map((column, i) => ({
    ...column,
    width: roundWidth(i === index ? nextLeft : i === index + 1 ? nextRight : (shares[i] ?? 0)),
  }));
  return { columns: next, left: nextLeft, right: nextRight };
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
 * The row and column commands of Google's table menus as new field values (gslides-parity
 * SPEC 7.3, SPEC-2 2.7): each one is written back with one `block.set` per changed field. The
 * round one single-cell forms stay; the counted and ranged forms are the round two additions.
 * Indexes are zero based; an index past the end appends.
 */
export type TableCommand =
  | { kind: 'insertRowAbove'; row: number }
  | { kind: 'insertRowBelow'; row: number }
  | { kind: 'insertColumnLeft'; column: number }
  | { kind: 'insertColumnRight'; column: number }
  | { kind: 'deleteRow'; row: number }
  | { kind: 'deleteColumn'; column: number }
  | { kind: 'deleteTable' }
  | { kind: 'distributeRows'; total?: number }
  | { kind: 'distributeColumns'; total?: number }
  | { kind: 'insertRows'; at: number; count?: number; where: 'above' | 'below' }
  | { kind: 'insertColumns'; at: number; count?: number; where: 'left' | 'right' }
  | { kind: 'deleteRows'; from: number; to?: number }
  | { kind: 'deleteColumns'; from: number; to?: number }
  | { kind: 'merge'; from: [number, number]; to: [number, number] }
  | { kind: 'unmerge'; at: [number, number] }
  | {
      kind: 'cellStyle';
      cells: [number, number][];
      fill?: Color | null;
      border?: CellBorder | null;
    };

/** The table fields a command rewrites; `spans` and `cells` absent mean the field is removed. */
export type TableEdit =
  | { columns: TableColumn[]; rows: TableRow[]; spans?: TableSpan[]; cells?: TableCellStyle[] }
  | { deleted: true };

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(index)));
}

type Working = {
  columns: TableColumn[];
  rows: TableRow[];
  spans: TableSpan[];
  cells: TableCellStyle[];
};

function copy(table: Pick<TableFields, 'columns' | 'rows' | 'spans' | 'cells'>): Working {
  return {
    columns: table.columns.map((column) => ({ ...column })),
    rows: table.rows.map((row) => ({ ...row, cells: [...row.cells] })),
    spans: (table.spans ?? []).map((span) => ({ ...span })),
    cells: (table.cells ?? []).map((cell) => ({
      ...cell,
      ...(cell.border !== undefined ? { border: { ...cell.border } } : {}),
    })),
  };
}

function finish(working: Working): TableEdit {
  return {
    columns: working.columns,
    rows: working.rows,
    ...(working.spans.length > 0 ? { spans: working.spans } : {}),
    ...(working.cells.length > 0 ? { cells: working.cells } : {}),
  };
}

/** Inserts `count` rows at `at` (before the row there), shifting spans and cell styles down. */
function insertRowsAt(working: Working, at: number, count: number): void {
  const room = Math.max(0, Math.min(count, TABLE_MAX_ROWS - working.rows.length));
  if (room === 0) return;
  const blank = (): TableRow => ({ cells: working.columns.map(() => '') });
  working.rows.splice(at, 0, ...Array.from({ length: room }, blank));
  for (const span of working.spans) {
    if (span.row >= at) span.row += room;
    else if (span.row + span.rows > at) span.rows += room;
  }
  for (const cell of working.cells) if (cell.row >= at) cell.row += room;
}

/**
 * Inserts `count` columns at `at` (before the column there). A grid whose columns carry widths
 * keeps its total: the new columns take an equal share and every other width scales down, so no
 * column is left as `{}` beside sized neighbours (the grid template then gave it the remainder or
 * nothing at all, and the Editable text PowerPoint wrote a gridCol the file could not hold;
 * docs/RETURN.md 2.4 fix 4, audit-objects rows 85 and 97).
 */
function insertColumnsAt(working: Working, at: number, count: number): void {
  const room = Math.max(0, Math.min(count, TABLE_MAX_COLUMNS - working.columns.length));
  if (room === 0) return;
  const sized = working.columns.some((column) => column.width !== undefined);
  const before = working.columns.length;
  const total = sized ? declaredTotal(working.columns) : 0;
  const shares = sized ? columnShares(working.columns, total) : [];
  working.columns.splice(at, 0, ...Array.from({ length: room }, () => ({})));
  if (sized) {
    const each = total / (before + room);
    const scale = before / (before + room);
    let from = 0;
    working.columns = working.columns.map((column, i) => {
      if (i >= at && i < at + room) return { ...column, width: roundWidth(each) };
      const width = shares[from] ?? each;
      from += 1;
      return { ...column, width: roundWidth(width * scale) };
    });
  }
  for (const row of working.rows)
    row.cells.splice(at, 0, ...Array.from({ length: room }, () => ''));
  for (const span of working.spans) {
    if (span.column >= at) span.column += room;
    else if (span.column + span.columns > at) span.columns += room;
  }
  for (const cell of working.cells) if (cell.column >= at) cell.column += room;
}

/** Removes the rows from..to inclusive; spans shrink or go, cell styles move or go. */
function deleteRowRange(working: Working, from: number, to: number): TableEdit | undefined {
  const start = clampIndex(from, working.rows.length - 1);
  const end = clampIndex(to, working.rows.length - 1);
  const count = end - start + 1;
  if (count >= working.rows.length) return { deleted: true };
  working.rows.splice(start, count);
  working.spans = working.spans.flatMap((span) => {
    const spanEnd = span.row + span.rows - 1;
    if (spanEnd < start) return [span];
    if (span.row > end) return [{ ...span, row: span.row - count }];
    const kept = span.rows - (Math.min(spanEnd, end) - Math.max(span.row, start) + 1);
    if (kept * span.columns < 2) return [];
    return [{ ...span, row: Math.min(span.row, start), rows: kept }];
  });
  working.cells = working.cells.flatMap((cell) => {
    if (cell.row < start) return [cell];
    if (cell.row > end) return [{ ...cell, row: cell.row - count }];
    return [];
  });
  return undefined;
}

function deleteColumnRange(working: Working, from: number, to: number): TableEdit | undefined {
  const start = clampIndex(from, working.columns.length - 1);
  const end = clampIndex(to, working.columns.length - 1);
  const count = end - start + 1;
  if (count >= working.columns.length) return { deleted: true };
  const sized = working.columns.some((column) => column.width !== undefined);
  const total = sized ? declaredTotal(working.columns) : 0;
  working.columns.splice(start, count);
  if (sized) {
    /* the columns left take the removed ones' room, so the grid keeps filling the table */
    const shares = columnShares(working.columns, total);
    working.columns = working.columns.map((column, i) => ({
      ...column,
      width: roundWidth(shares[i] ?? total / working.columns.length),
    }));
  }
  for (const row of working.rows) row.cells.splice(start, count);
  working.spans = working.spans.flatMap((span) => {
    const spanEnd = span.column + span.columns - 1;
    if (spanEnd < start) return [span];
    if (span.column > end) return [{ ...span, column: span.column - count }];
    const kept = span.columns - (Math.min(spanEnd, end) - Math.max(span.column, start) + 1);
    if (kept * span.rows < 2) return [];
    return [{ ...span, column: Math.min(span.column, start), columns: kept }];
  });
  working.cells = working.cells.flatMap((cell) => {
    if (cell.column < start) return [cell];
    if (cell.column > end) return [{ ...cell, column: cell.column - count }];
    return [];
  });
  return undefined;
}

/** Applies one command and returns the new fields, or `deleted` for Delete table. */
export function applyTableCommand(
  table: Pick<TableFields, 'columns' | 'rows'> & Partial<Pick<TableFields, 'spans' | 'cells'>>,
  command: TableCommand,
): TableEdit {
  const working = copy(table);
  const { columns, rows } = working;
  switch (command.kind) {
    case 'insertRowAbove':
      insertRowsAt(working, clampIndex(command.row, rows.length), 1);
      return finish(working);
    case 'insertRowBelow':
      insertRowsAt(working, clampIndex(command.row, rows.length - 1) + 1, 1);
      return finish(working);
    case 'insertRows': {
      const count = Math.max(1, Math.round(command.count ?? 1));
      const at =
        command.where === 'above'
          ? clampIndex(command.at, rows.length)
          : clampIndex(command.at, rows.length - 1) + 1;
      insertRowsAt(working, at, count);
      return finish(working);
    }
    case 'insertColumnLeft':
    case 'insertColumnRight': {
      const at =
        command.kind === 'insertColumnLeft'
          ? clampIndex(command.column, columns.length)
          : clampIndex(command.column, columns.length - 1) + 1;
      insertColumnsAt(working, at, 1);
      return finish(working);
    }
    case 'insertColumns': {
      const count = Math.max(1, Math.round(command.count ?? 1));
      const at =
        command.where === 'left'
          ? clampIndex(command.at, columns.length)
          : clampIndex(command.at, columns.length - 1) + 1;
      insertColumnsAt(working, at, count);
      return finish(working);
    }
    case 'deleteRow': {
      if (rows.length <= 1) return { deleted: true };
      const at = clampIndex(command.row, rows.length - 1);
      return deleteRowRange(working, at, at) ?? finish(working);
    }
    case 'deleteRows':
      return deleteRowRange(working, command.from, command.to ?? command.from) ?? finish(working);
    case 'deleteColumn': {
      if (columns.length <= 1) return { deleted: true };
      const at = clampIndex(command.column, columns.length - 1);
      return deleteColumnRange(working, at, at) ?? finish(working);
    }
    case 'deleteColumns':
      return (
        deleteColumnRange(working, command.from, command.to ?? command.from) ?? finish(working)
      );
    case 'deleteTable':
      return { deleted: true };
    case 'distributeRows': {
      // equal heights from the declared total, else the row heights go so every row takes its
      // content height again (SPEC-2 2.7.4)
      const total = command.total;
      const each = total !== undefined && total > 0 ? Math.round(total / rows.length) : undefined;
      for (const row of rows) {
        if (each !== undefined) row.height = each;
        else delete row.height;
      }
      return finish(working);
    }
    case 'distributeColumns': {
      const total = command.total;
      const each =
        total !== undefined && total > 0 ? Math.round(total / columns.length) : undefined;
      for (const column of columns) {
        if (each !== undefined) column.width = each;
        else delete column.width;
      }
      return finish(working);
    }
    case 'merge': {
      const r0 = Math.min(command.from[0], command.to[0]);
      const r1 = Math.max(command.from[0], command.to[0]);
      const c0 = Math.min(command.from[1], command.to[1]);
      const c1 = Math.max(command.from[1], command.to[1]);
      const span: TableSpan = {
        row: clampIndex(r0, rows.length - 1),
        column: clampIndex(c0, columns.length - 1),
        rows: clampIndex(r1, rows.length - 1) - clampIndex(r0, rows.length - 1) + 1,
        columns: clampIndex(c1, columns.length - 1) - clampIndex(c0, columns.length - 1) + 1,
      };
      if (span.rows * span.columns < 2) return finish(working);
      // spans inside the new extent fold into it; a span reaching past it refuses the merge
      const keys = new Set(spanCells(span));
      const kept: TableSpan[] = [];
      for (const existing of working.spans) {
        const cells = spanCells(existing);
        if (cells.every((key) => keys.has(key))) continue;
        if (cells.some((key) => keys.has(key)))
          throw new RangeError(
            `The cells from row ${r0 + 1}, column ${c0 + 1} to row ${r1 + 1}, column ${c1 + 1} cross merged cells; unmerge those first`,
          );
        kept.push(existing);
      }
      // Google joins the covered cells' text into the anchor (SPEC-2 3 table.merge)
      const anchor = rows[span.row];
      if (anchor !== undefined) {
        const parts: string[] = [];
        for (let r = span.row; r < span.row + span.rows; r += 1) {
          const row = rows[r];
          if (row === undefined) continue;
          for (let c = span.column; c < span.column + span.columns; c += 1) {
            const text = row.cells[c] ?? '';
            if (text !== '') parts.push(text);
            if (r !== span.row || c !== span.column) row.cells[c] = '';
          }
        }
        anchor.cells[span.column] = parts.join('\n');
      }
      working.spans = [...kept, span];
      return finish(working);
    }
    case 'unmerge': {
      const span = spanAt(working.spans, command.at[0], command.at[1]);
      if (span === undefined) return finish(working);
      working.spans = working.spans.filter((candidate) => candidate !== span);
      return finish(working);
    }
    case 'cellStyle': {
      for (const [row, column] of command.cells) {
        const r = clampIndex(row, rows.length - 1);
        const c = clampIndex(column, columns.length - 1);
        const index = working.cells.findIndex((cell) => cell.row === r && cell.column === c);
        const current: TableCellStyle = working.cells[index] ?? { row: r, column: c };
        if (command.fill === null) delete current.fill;
        else if (command.fill !== undefined) current.fill = command.fill;
        if (command.border === null) delete current.border;
        else if (command.border !== undefined) current.border = { ...command.border };
        const empty = current.fill === undefined && current.border === undefined;
        if (index >= 0) {
          if (empty) working.cells.splice(index, 1);
          else working.cells[index] = current;
        } else if (!empty) working.cells.push(current);
      }
      return finish(working);
    }
  }
}

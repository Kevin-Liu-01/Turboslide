import type { CellBorder, TableBlock, TableSpan } from '@turboslide/schema/blocks/table';
import {
  applyTableCommand,
  columnShares,
  isCoveredCell,
  spanAt,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from '@turboslide/schema/blocks/table';
import type { Color } from '@turboslide/schema/color';
import type { Position } from '@turboslide/schema/position';

import type { EditorSelection } from './editor-shell';
import type { MenuActionId } from './menus/model';

/**
 * The table tools (gslides-parity SPEC-2 2.7, 4.2, 4.3, section 5; R11 A5, A6; R05 A6): pure
 * plans from a table block and the selection inside it (the caret's cell, or a range of cells) to
 * the inputs of the round two table actions of section 3. Format > Table, the cell context menus,
 * the table tail's Merge cells and Unmerge cells buttons and the Table section of Format options
 * all call `tablePlan` and dispatch what comes back; the plan carries `blockId` and the action's
 * fields, and the caller adds `slideId` and `baseRevision` (`tableWriteInput`). A plan that cannot
 * be made says why in a sentence a sales user reads in the snackbar. Also here: the cell walk of
 * Tab and Shift+Tab across merged cells (`nextCell`), the range arithmetic the sections share, the
 * facts the menu context reads (`isMergedAnchor`), and the table's own controls of the objects
 * round (docs/OBJECTS.md 3.3 item 4): the range a row or column head names (`headRange`), the
 * header row toggle (`toggleHeader`) and the one commit of the edge "+" (`edgeInsert`). No React,
 * no DOM.
 */
export type TableCommandId =
  | 'insertRowsAbove'
  | 'insertRowsBelow'
  | 'insertColumnsLeft'
  | 'insertColumnsRight'
  | 'deleteRows'
  | 'deleteColumns'
  | 'distributeRows'
  | 'distributeColumns'
  | 'merge'
  | 'unmerge'
  | 'cellFill'
  | 'cellBorder'
  | 'tableBorder'
  /** the Header row check of the Table section and the row head's menu (docs/OBJECTS.md 3.3 items 4 and 6) */
  | 'toggleHeader';

export type TablePlan =
  { action: MenuActionId; input: Record<string, unknown> } | { refused: string };

export type TableSelection = {
  /** the caret's cell as [row, column] */
  cell?: [number, number];
  /** a range of cells, from (r0, c0) to (r1, c1) in either order */
  cells?: EditorSelection['cells'];
};

export type TablePlanOptions = {
  /** how many rows or columns to insert; the range's height or width, else one */
  count?: number;
  /** the cell fill; null clears it */
  fill?: Color | null;
  /** the cell or table border; null clears it */
  border?: CellBorder | null;
  /** the measured total the editor passes to Distribute rows or columns; absent clears the sizes */
  total?: number;
};

export const TABLE_COMMAND_LABELS: Readonly<Record<TableCommandId, string>> = {
  insertRowsAbove: 'Insert row above',
  insertRowsBelow: 'Insert row below',
  insertColumnsLeft: 'Insert column left',
  insertColumnsRight: 'Insert column right',
  deleteRows: 'Delete row',
  deleteColumns: 'Delete column',
  distributeRows: 'Distribute rows',
  distributeColumns: 'Distribute columns',
  merge: 'Merge cells',
  unmerge: 'Unmerge cells',
  cellFill: 'Fill color',
  cellBorder: 'Border',
  tableBorder: 'Table border',
  toggleHeader: 'Header row',
};

export const SELECT_CELL = 'Click a table cell first';
export const SELECT_CELLS = 'Select two or more cells first';
export const SELECT_MERGED = 'Select a merged cell first';
export const TABLE_FULL_ROWS = `A table has at most ${TABLE_MAX_ROWS} rows`;
export const TABLE_FULL_COLUMNS = `A table has at most ${TABLE_MAX_COLUMNS} columns`;

/** A cell range with r0 <= r1 and c0 <= c1, clamped to the grid. */
export type CellRange = { r0: number; c0: number; r1: number; c1: number };

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/**
 * The range a selection names, ordered and clamped to the table: the cells range when one is
 * set, else the one cell, else null. The anchor of merged cells inside the range extends it to
 * cover the whole merged extent, as Google's selection does.
 */
export function rangeOf(block: TableBlock, selection: TableSelection): CellRange | null {
  const rows = block.rows.length - 1;
  const columns = block.columns.length - 1;
  let range: CellRange | null = null;
  if (selection.cells !== undefined) {
    const { r0, c0, r1, c1 } = selection.cells;
    range = {
      r0: clamp(Math.min(r0, r1), rows),
      r1: clamp(Math.max(r0, r1), rows),
      c0: clamp(Math.min(c0, c1), columns),
      c1: clamp(Math.max(c0, c1), columns),
    };
  } else if (selection.cell !== undefined) {
    const r = clamp(selection.cell[0], rows);
    const c = clamp(selection.cell[1], columns);
    range = { r0: r, r1: r, c0: c, c1: c };
  }
  if (range === null) return null;
  /* grow over the merged cells the range touches until it holds every one whole */
  let grown = true;
  while (grown) {
    grown = false;
    for (const span of block.spans ?? []) {
      const overlaps =
        span.row <= range.r1 &&
        span.row + span.rows - 1 >= range.r0 &&
        span.column <= range.c1 &&
        span.column + span.columns - 1 >= range.c0;
      if (!overlaps) continue;
      const next: CellRange = {
        r0: Math.min(range.r0, span.row),
        r1: Math.max(range.r1, span.row + span.rows - 1),
        c0: Math.min(range.c0, span.column),
        c1: Math.max(range.c1, span.column + span.columns - 1),
      };
      if (
        next.r0 !== range.r0 ||
        next.r1 !== range.r1 ||
        next.c0 !== range.c0 ||
        next.c1 !== range.c1
      ) {
        range = next;
        grown = true;
      }
    }
  }
  return range;
}

/** Every cell of a range as [row, column], covered cells left out (the anchors carry the style). */
export function cellsInRange(block: TableBlock, range: CellRange): [number, number][] {
  const out: [number, number][] = [];
  for (let r = range.r0; r <= range.r1; r += 1)
    for (let c = range.c0; c <= range.c1; c += 1)
      if (!isCoveredCell(block.spans, r, c)) out.push([r, c]);
  return out;
}

/** True when the range covers two cells or more (merged cells count as one). */
export function isMultiCell(block: TableBlock, range: CellRange): boolean {
  return cellsInRange(block, range).length >= 2;
}

/** True when the selected cell is the anchor of merged cells, or lies inside one (Unmerge applies). */
export function isMergedAnchor(block: TableBlock, cell: [number, number] | undefined): boolean {
  if (cell === undefined) return false;
  return spanAt(block.spans, cell[0], cell[1]) !== undefined;
}

/** The merged cells a cell belongs to, or undefined. */
export function mergedAt(block: TableBlock, cell: [number, number]): TableSpan | undefined {
  return spanAt(block.spans, cell[0], cell[1]);
}

/**
 * The next cell Tab (delta 1) or Shift+Tab (delta -1) lands in, skipping the cells merged into
 * another (SPEC-2 section 5 "Tab across merged cells"): the anchor of merged cells is one stop.
 * 'append' past the last cell (Tab there adds a row, round one), null before the first.
 */
export function nextCell(
  block: TableBlock,
  cell: { row: number; column: number },
  delta: 1 | -1,
): { row: number; column: number } | 'append' | null {
  const columns = block.columns.length;
  const total = block.rows.length * columns;
  let flat = cell.row * columns + cell.column;
  for (;;) {
    flat += delta;
    if (flat < 0) return null;
    if (flat >= total) return 'append';
    const row = Math.floor(flat / columns);
    const column = flat % columns;
    if (!isCoveredCell(block.spans, row, column)) return { row, column };
  }
}

/** The cell after an insert or delete for the caret to keep its place: clamped into the new grid. */
export function clampCell(
  block: Pick<TableBlock, 'rows' | 'columns'>,
  cell: { row: number; column: number },
): { row: number; column: number } {
  return {
    row: clamp(cell.row, Math.max(0, block.rows.length - 1)),
    column: clamp(cell.column, Math.max(0, block.columns.length - 1)),
  };
}

function plan(action: MenuActionId, blockId: string, input: Record<string, unknown>): TablePlan {
  return { action, input: { blockId, ...input } };
}

/**
 * The plan of one table command over a selection: the action id of SPEC-2 section 3 and its
 * input less `slideId` and `baseRevision`, or a refusal sentence.
 */
export function tablePlan(
  block: TableBlock,
  selection: TableSelection,
  command: TableCommandId,
  options: TablePlanOptions = {},
): TablePlan {
  const range = rangeOf(block, selection);
  if (command === 'toggleHeader') {
    return plan('block.set', block.id, {
      path: '/rows',
      value: rowsWithHeader(block, !isHeaderRow(block)),
    });
  }
  if (command === 'tableBorder') {
    if (options.border === null) return plan('block.set', block.id, { path: '/border' });
    const border = options.border ?? {};
    const current = block.border;
    const weight = border.weight ?? current?.weight ?? 1;
    const color = border.color ?? current?.color;
    const dash = border.dash ?? current?.dash;
    return plan('block.set', block.id, {
      path: '/border',
      value: {
        weight,
        ...(color === undefined ? {} : { color }),
        ...(dash === undefined ? {} : { dash }),
      },
    });
  }
  if (range === null) return { refused: SELECT_CELL };
  const rowsSelected = range.r1 - range.r0 + 1;
  const columnsSelected = range.c1 - range.c0 + 1;
  switch (command) {
    case 'insertRowsAbove':
    case 'insertRowsBelow': {
      const count = Math.max(1, Math.round(options.count ?? rowsSelected));
      if (block.rows.length >= TABLE_MAX_ROWS) return { refused: TABLE_FULL_ROWS };
      return plan('table.insertRows', block.id, {
        at: command === 'insertRowsAbove' ? range.r0 : range.r1,
        count: Math.min(count, TABLE_MAX_ROWS - block.rows.length),
        where: command === 'insertRowsAbove' ? 'above' : 'below',
      });
    }
    case 'insertColumnsLeft':
    case 'insertColumnsRight': {
      const count = Math.max(1, Math.round(options.count ?? columnsSelected));
      if (block.columns.length >= TABLE_MAX_COLUMNS) return { refused: TABLE_FULL_COLUMNS };
      return plan('table.insertColumns', block.id, {
        at: command === 'insertColumnsLeft' ? range.c0 : range.c1,
        count: Math.min(count, TABLE_MAX_COLUMNS - block.columns.length),
        where: command === 'insertColumnsLeft' ? 'left' : 'right',
      });
    }
    case 'deleteRows':
      return plan('table.deleteRows', block.id, {
        from: range.r0,
        ...(range.r1 === range.r0 ? {} : { to: range.r1 }),
      });
    case 'deleteColumns':
      return plan('table.deleteColumns', block.id, {
        from: range.c0,
        ...(range.c1 === range.c0 ? {} : { to: range.c1 }),
      });
    case 'distributeRows':
    case 'distributeColumns': {
      const axis = command === 'distributeRows' ? 'rows' : 'columns';
      const whole = selection.cells === undefined;
      const span = axis === 'rows' ? [range.r0, range.r1] : [range.c0, range.c1];
      return plan('table.distribute', block.id, {
        axis,
        ...(options.total !== undefined && options.total > 0 ? { total: options.total } : {}),
        ...(whole || span[0] === span[1] ? {} : { range: span }),
      });
    }
    case 'merge': {
      if (!isMultiCell(block, range)) return { refused: SELECT_CELLS };
      return plan('table.merge', block.id, {
        from: [range.r0, range.c0],
        to: [range.r1, range.c1],
      });
    }
    case 'unmerge': {
      const cell: [number, number] = selection.cell ?? [range.r0, range.c0];
      const span =
        mergedAt(block, cell) ??
        (block.spans ?? []).find(
          (each) =>
            each.row >= range.r0 &&
            each.row + each.rows - 1 <= range.r1 &&
            each.column >= range.c0 &&
            each.column + each.columns - 1 <= range.c1,
        );
      if (span === undefined) return { refused: SELECT_MERGED };
      return plan('table.unmerge', block.id, { at: [span.row, span.column] });
    }
    case 'cellFill':
      return plan('table.cellStyle', block.id, {
        cells: cellsInRange(block, range),
        fill: options.fill ?? null,
      });
    case 'cellBorder':
      return plan('table.cellStyle', block.id, {
        cells: cellsInRange(block, range),
        border: options.border ?? null,
      });
    default:
      return { refused: SELECT_CELL };
  }
}

/** The full input of a table plan: the plan's fields with the slide and the revision the caller read. */
export function tableWriteInput(
  plan: { input: Record<string, unknown> },
  slideId: string,
  revision: number,
): Record<string, unknown> {
  return { slideId, ...plan.input, baseRevision: revision };
}

/** The table command a Format > Table or context row names, or null for another row. */
export function tableCommandOfItem(itemId: string): TableCommandId | null {
  switch (itemId) {
    case 'format.table.insertRowAbove':
      return 'insertRowsAbove';
    case 'format.table.insertRowBelow':
      return 'insertRowsBelow';
    case 'format.table.insertColumnLeft':
      return 'insertColumnsLeft';
    case 'format.table.insertColumnRight':
      return 'insertColumnsRight';
    case 'format.table.deleteRow':
      return 'deleteRows';
    case 'format.table.deleteColumn':
      return 'deleteColumns';
    case 'format.table.distributeRows':
      return 'distributeRows';
    case 'format.table.distributeColumns':
      return 'distributeColumns';
    case 'format.table.mergeCells':
      return 'merge';
    case 'format.table.unmergeCells':
      return 'unmerge';
    case 'format.table.headerRow':
      return 'toggleHeader';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The header row, the heads and the edge "+" (docs/OBJECTS.md 3.3 items 4 and 6)

/** True while the table's first row is its header (`rows[0].header`). */
export function isHeaderRow(block: Pick<TableBlock, 'rows'>): boolean {
  return block.rows[0]?.header === true;
}

/** The rows with the first row's header flag set or cleared; the other rows untouched. */
export function rowsWithHeader(block: Pick<TableBlock, 'rows'>, on: boolean): TableBlock['rows'] {
  return block.rows.map((row, index) => {
    if (index !== 0) return row;
    const next = { ...row };
    if (on) next.header = true;
    else delete next.header;
    return next;
  });
}

/** The head's axis: the band above a column, the band left of a row. */
export type HeadAxis = 'column' | 'row';

/**
 * The range a row or column head names (the band above column `index`, or left of row `index`;
 * docs/OBJECTS.md 3.3 item 4): every cell of that column or row, in the shell's `cells` words,
 * clamped to the grid; null off the grid or on an empty table.
 */
export function headRange(
  block: Pick<TableBlock, 'rows' | 'columns'>,
  axis: HeadAxis,
  index: number,
): NonNullable<EditorSelection['cells']> | null {
  const rows = block.rows.length;
  const columns = block.columns.length;
  if (rows === 0 || columns === 0) return null;
  const at = Math.round(index);
  if (axis === 'column') {
    if (at < 0 || at >= columns) return null;
    return { r0: 0, c0: at, r1: rows - 1, c1: at };
  }
  if (at < 0 || at >= rows) return null;
  return { r0: at, c0: 0, r1: at, c1: columns - 1 };
}

/** The field writes of one edge insert: the table's fields and its box, each as a `block.set` path and value. */
export type EdgeInsert = {
  writes: { path: string; value?: unknown }[];
  /** the table's box after the insert */
  pos: Position;
};

/**
 * The one commit the edge "+" makes (docs/OBJECTS.md 3.3 item 4; the row
 * `tables.edge.add-row-column`: "the widths of the others hold"): a column right of the last one
 * as wide as the last column drawn (`size` px), the table's `pos.w` grown by it, so every other
 * column keeps its width; or a row under the last one, `pos.h` grown by the last row's drawn
 * height. Every column takes its drawn width in px so the grid stays proportional after the box
 * grows (`columnShares`). `total` is the table's drawn width. Null on a full table.
 */
export function edgeInsert(
  block: TableBlock,
  pos: Position,
  axis: HeadAxis,
  size: number,
  total: number,
): EdgeInsert | null {
  const grow = Math.max(1, Math.round(size));
  if (axis === 'column') {
    if (block.columns.length >= TABLE_MAX_COLUMNS) return null;
    const at = block.columns.length - 1;
    const edited = applyTableCommand(block, { kind: 'insertColumns', at, where: 'right' });
    if ('deleted' in edited) return null;
    const shares = columnShares(block.columns, total);
    const columns = edited.columns.map((column, index) => ({
      ...column,
      width: index <= at ? Math.round(shares[index] ?? total / block.columns.length) : grow,
    }));
    return {
      writes: [
        { path: '/columns', value: columns },
        { path: '/rows', value: edited.rows },
        ...spanAndCellWrites(block, edited),
        { path: '/pos', value: { ...pos, w: pos.w + grow } },
      ],
      pos: { ...pos, w: pos.w + grow },
    };
  }
  if (block.rows.length >= TABLE_MAX_ROWS) return null;
  const at = block.rows.length - 1;
  const edited = applyTableCommand(block, { kind: 'insertRows', at, where: 'below' });
  if ('deleted' in edited) return null;
  return {
    writes: [
      { path: '/rows', value: edited.rows },
      ...(jsonEqual(edited.columns, block.columns)
        ? []
        : [{ path: '/columns', value: edited.columns }]),
      ...spanAndCellWrites(block, edited),
      { path: '/pos', value: { ...pos, h: pos.h + grow } },
    ],
    pos: { ...pos, h: pos.h + grow },
  };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The `spans` and `cells` writes an edit needs: only when they changed; an absent field is removed. */
function spanAndCellWrites(
  block: TableBlock,
  edited: { spans?: TableSpan[]; cells?: TableBlock['cells'] },
): { path: string; value?: unknown }[] {
  const out: { path: string; value?: unknown }[] = [];
  if (!jsonEqual(edited.spans, block.spans))
    out.push(
      edited.spans === undefined ? { path: '/spans' } : { path: '/spans', value: edited.spans },
    );
  if (!jsonEqual(edited.cells, block.cells))
    out.push(
      edited.cells === undefined ? { path: '/cells' } : { path: '/cells', value: edited.cells },
    );
  return out;
}

/** The style of one cell, as stored: fill and border, or nothing. */
export function cellStyleAt(
  block: TableBlock,
  cell: [number, number],
): { fill?: Color; border?: CellBorder } {
  const found = (block.cells ?? []).find((each) => each.row === cell[0] && each.column === cell[1]);
  if (found === undefined) return {};
  return {
    ...(found.fill === undefined ? {} : { fill: found.fill }),
    ...(found.border === undefined ? {} : { border: found.border }),
  };
}

// A cell session under a table whose grid changed (docs/RETURN.md 2.4; measured in
// docs/gslides-parity/return/build/b5.md section 7): a session names its cell by position
// (`rows/<r>/cells/<c>`), so when Format > Table or the cell menu adds or removes a row or a column
// while the session is parked, the same pointer names another cell. The Editor ends the session on
// such a change and lets its last write follow the cell that moved, found by the text the session
// last saw in the document one step along the change; a cell that is gone gets no write.
//
// The second half is a spreadsheet's rows on the clipboard (docs/FEATURES.md 2.3 item 5;
// audit-objects 12): the tab separated text read as a grid, the table block a paste with no
// session makes from it and the box it takes, and a table's rows and columns after the grid was
// pasted into one of its cells. Pure, pinned by table-session.test.ts.
import type { BlockId } from '@turboslide/schema/ids';
import type { TableBlock, TableEdit } from '@turboslide/schema/blocks/table';
import {
  applyTableCommand,
  emptyTable,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from '@turboslide/schema/blocks/table';
import type { Text } from '@turboslide/schema/text';
import { serializeRuns } from '@turboslide/schema/text';

import { cellPointer } from './Selection';
import type { CellAddress } from './table-range';

/** The grid a session began in. */
export type TableShape = { rows: number; columns: number };

export function tableShapeOf(block: TableBlock): TableShape {
  return { rows: block.rows.length, columns: block.columns.length };
}

/**
 * The pointer of the cell a session's cell moved to after the grid changed from `shape` to the
 * block's, or null when the cell is gone. `expected` is the text the session last saw in the
 * document for its cell. The candidates, in order: the same position, the position shifted by the
 * change in rows (rows added above), the position shifted by the change in columns (columns
 * added on the left), both; the first one inside the grid whose text is `expected` wins. With no
 * candidate carrying the text the cell was deleted (or rewritten from outside) and null answers.
 */
export function movedCellPointer(
  block: TableBlock,
  shape: TableShape,
  pointer: string,
  expected: string,
): string | null {
  const cell = cellPointer(pointer);
  if (cell === null) return null;
  const dr = block.rows.length - shape.rows;
  const dc = block.columns.length - shape.columns;
  const candidates: [number, number][] = [[cell.row, cell.col]];
  if (dr !== 0) candidates.push([cell.row + dr, cell.col]);
  if (dc !== 0) candidates.push([cell.row, cell.col + dc]);
  if (dr !== 0 && dc !== 0) candidates.push([cell.row + dr, cell.col + dc]);
  for (const [r, c] of candidates) {
    if (r < 0 || c < 0 || r >= block.rows.length || c >= block.columns.length) continue;
    if ((block.rows[r]?.cells[c] ?? '') === expected) return `rows/${r}/cells/${c}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// A spreadsheet's rows pasted (docs/FEATURES.md 2.3 item 5; audit-objects 12)

/** The cells of a paste as plain strings, one array per row, every row as wide as the widest. */
export type PastedGrid = string[][];

/**
 * The clipboard's text as a grid, or null when it is not one. A grid is two or more rows with a
 * tab in each, the way Sheets, Excel and Numbers write a copied range: a cell holding a tab, a
 * line break or a quote is wrapped in double quotes with a quote inside doubled, so a quoted cell
 * keeps its tabs and line breaks. Cells are trimmed, a shorter row is padded to the widest and
 * the empty line a trailing line break leaves is no row. One row, or a row with no tab, is text
 * and pastes as before.
 */
export function parseTablePaste(text: string): PastedGrid | null {
  const source = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      continue;
    }
    if (ch === '\t') {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  /* the last line: the empty tail of a trailing line break is no row */
  if (row.length > 1 || row[0] !== '') rows.push(row);
  if (rows.length < 2 || rows.some((cells) => cells.length < 2)) return null;
  const width = Math.max(...rows.map((cells) => cells.length));
  return rows.map((cells) => [...cells, ...Array.from({ length: width - cells.length }, () => '')]);
}

/**
 * True for a cell a spreadsheet holds as a number: digits with an optional sign, thousands
 * separators, a decimal point, a currency sign, a percent sign or parentheses for a negative
 * (the chart grid's rule, packages/chrome/src/chart-tools.ts parseChartNumber, repeated here
 * because the viewer does not import the chrome). "Q1" is a word, "1,200" and "(12%)" numbers.
 */
export function isNumberCell(raw: string): boolean {
  let text = raw.trim();
  if (text === '') return false;
  if (/^\(.*\)$/.test(text)) text = text.slice(1, -1);
  text = text.replace(/[$€£¥%\s,]/g, '');
  if (text.startsWith('-') || text.startsWith('+')) text = text.slice(1);
  return /^\d*\.?\d+$/.test(text) || /^\d+\.?\d*$/.test(text);
}

/** A pasted cell as a Text: every line one plain run, so a literal `*`, `[` or GT stays literal. */
function cellMarkup(plain: string): Text {
  return plain
    .split('\n')
    .map((paragraph) => (paragraph === '' ? '' : serializeRuns([{ t: paragraph }])))
    .join('\n');
}

/**
 * The table a paste with no session makes: one column per grid column and one row per grid row,
 * at most 20 by 20 with the rest dropped, the first row a header row when none of its cells is
 * a number (a row of labels over rows of figures, the shape a copied range has).
 */
export function pastedTableBlock(id: BlockId, grid: PastedGrid): TableBlock {
  const rows = grid.slice(0, TABLE_MAX_ROWS);
  const width = Math.max(1, Math.min(TABLE_MAX_COLUMNS, grid[0]?.length ?? 0));
  const header = (grid[0] ?? []).every((cell) => !isNumberCell(cell));
  const table = emptyTable(id, width, Math.max(1, rows.length), { header });
  table.rows = rows.map((cells, r) => ({
    cells: Array.from({ length: width }, (_, c) => cellMarkup(cells[c] ?? '')),
    ...(header && r === 0 ? { header: true as const } : {}),
  }));
  return table;
}

/** A pasted table's box grows by these sheet px per column and per row. */
export const PASTED_TABLE_COLUMN_PX = 240;
export const PASTED_TABLE_ROW_PX = 64;
/** The widest and the tallest a pasted table's box gets: the 1600 by 900 sheet inside 80 px margins, 50 px less tall. */
const PASTED_TABLE_MAX_W = 1440;
const PASTED_TABLE_MAX_H = 800;

/**
 * The box a pasted table takes, sized to its rows (docs/FEATURES.md 2.3 item 5 "sized to the
 * rows"): 240 px a column and 64 px a row, never narrower than two columns or shorter than two
 * rows, never past the sheet's margins; the Editor centres it like an insert.
 */
export function pastedTableSize(rows: number, columns: number): [number, number] {
  const w = Math.min(PASTED_TABLE_MAX_W, Math.max(2, columns) * PASTED_TABLE_COLUMN_PX);
  const h = Math.min(PASTED_TABLE_MAX_H, Math.max(2, rows) * PASTED_TABLE_ROW_PX);
  return [w, h];
}

/**
 * The table's fields after a grid was pasted into the cell `at` (docs/FEATURES.md 2.3 item 5
 * "spreads the columns and rows from that cell"): the cells fill right and down from there, the
 * rows and columns the grid needs are added at the bottom and the right edge through
 * applyTableCommand (sized columns share the width, merged cells and cell styles stand), never
 * past 20 by 20, the cells the cap leaves out dropped. Null when the grid is empty.
 */
export function tableWithPastedGrid(
  table: TableBlock,
  at: CellAddress,
  grid: PastedGrid,
): Exclude<TableEdit, { deleted: true }> | null {
  const width = grid[0]?.length ?? 0;
  if (grid.length === 0 || width === 0) return null;
  let edited: Exclude<TableEdit, { deleted: true }> = {
    columns: table.columns,
    rows: table.rows,
    ...(table.spans !== undefined ? { spans: table.spans } : {}),
    ...(table.cells !== undefined ? { cells: table.cells } : {}),
  };
  const rowsNeeded = at.row + grid.length - edited.rows.length;
  if (rowsNeeded > 0) {
    const grown = applyTableCommand(edited, {
      kind: 'insertRows',
      at: edited.rows.length - 1,
      count: rowsNeeded,
      where: 'below',
    });
    if (!('deleted' in grown)) edited = grown;
  }
  const columnsNeeded = at.col + width - edited.columns.length;
  if (columnsNeeded > 0) {
    const grown = applyTableCommand(edited, {
      kind: 'insertColumns',
      at: edited.columns.length - 1,
      count: columnsNeeded,
      where: 'right',
    });
    if (!('deleted' in grown)) edited = grown;
  }
  const rows = edited.rows.map((row) => ({ ...row, cells: [...row.cells] }));
  grid.forEach((cells, r) => {
    const row = rows[at.row + r];
    if (row === undefined) return;
    cells.forEach((plain, c) => {
      const column = at.col + c;
      if (column >= edited.columns.length) return;
      row.cells[column] = cellMarkup(plain);
    });
  });
  return { ...edited, rows };
}

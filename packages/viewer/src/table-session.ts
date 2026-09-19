// A cell session under a table whose grid changed (docs/RETURN.md 2.4; measured in
// docs/gslides-parity/return/build/b5.md section 7): a session names its cell by position
// (`rows/<r>/cells/<c>`), so when Format > Table or the cell menu adds or removes a row or a column
// while the session is parked, the same pointer names another cell. The Editor ends the session on
// such a change and lets its last write follow the cell that moved, found by the text the session
// last saw in the document one step along the change; a cell that is gone gets no write. Pure,
// pinned by table-session.test.ts.
import type { TableBlock } from '@turboslide/schema/blocks/table';

import { cellPointer } from './Selection';

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

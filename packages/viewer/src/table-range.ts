// A range of table cells (docs/RETURN.md 2.4, "a drag over cells to select a range"; the matrix
// rows tables.cells.merge-unmerge and tables.tail.merge-unmerge-buttons; VERIFICATION.md return
// round pass 1 finding R1-F6). Google Slides selects the cells between two cells of one table by a
// Shift click on the second cell or by a drag from the first cell into another, and Merge cells,
// Unmerge cells and the other Table rows act on that range. The Editor holds one range at a time
// on the selected table: the anchor cell, where the gesture began, and the focus cell, where it
// ended. These pure functions read from it the ordered bounds the menus and the plans use
// (`EditorSelection.cells`, grown over the merged cells the range touches, as table-tools.ts
// `rangeOf` grows them), the union box the overlay draws from the measured cell runs, the rows
// with the range's texts cleared for Delete, and whether the range still stands after the
// document changed under it. Pinned by table-range.test.ts; the Editor wires the gestures.
import type { TableBlock, TableRow } from '@turboslide/schema/blocks/table';
import { isCoveredCell, spanAt } from '@turboslide/schema/blocks/table';
import type { Box } from '@turboslide/schema/render';

/** A cell by position, as data-run names it (`rows/<row>/cells/<col>`). */
export type CellAddress = { row: number; col: number };

/** The range on one table: the cell the gesture began in and the cell it ended in. */
export type CellRange = { blockId: string; anchor: CellAddress; focus: CellAddress };

/** The ordered bounds of a range, as `EditorSelection.cells` carries them. */
export type CellBounds = { r0: number; c0: number; r1: number; c1: number };

/** The grid a range was made on: a change under it ends the range (table-session.ts does the same for a session). */
export type TableRangeShape = { rows: number; columns: number; spans: string };

export function tableRangeShapeOf(block: TableBlock): TableRangeShape {
  return {
    rows: block.rows.length,
    columns: block.columns.length,
    spans: JSON.stringify(block.spans ?? []),
  };
}

/** True when the table's grid and its merged cells read as they did when the range was made. */
export function rangeStands(shape: TableRangeShape, block: TableBlock): boolean {
  const now = tableRangeShapeOf(block);
  return now.rows === shape.rows && now.columns === shape.columns && now.spans === shape.spans;
}

/** A cell clamped into the table's grid. */
export function clampCell(block: TableBlock, cell: CellAddress): CellAddress {
  return {
    row: Math.max(0, Math.min(block.rows.length - 1, cell.row)),
    col: Math.max(0, Math.min(block.columns.length - 1, cell.col)),
  };
}

/**
 * The ordered bounds of a range, clamped to the table and grown until every merged cell the
 * bounds touch lies inside them whole (Google selects a merged cell whole; the plan's `rangeOf`
 * grows the same way, so the ring and the write agree).
 */
export function rangeBounds(block: TableBlock, range: CellRange): CellBounds {
  const a = clampCell(block, range.anchor);
  const b = clampCell(block, range.focus);
  const bounds: CellBounds = {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
  const spans = block.spans ?? [];
  for (let grown = true; grown;) {
    grown = false;
    for (const span of spans) {
      const sr1 = span.row + span.rows - 1;
      const sc1 = span.column + span.columns - 1;
      const touches =
        span.row <= bounds.r1 && sr1 >= bounds.r0 && span.column <= bounds.c1 && sc1 >= bounds.c0;
      if (!touches) continue;
      const next: CellBounds = {
        r0: Math.min(bounds.r0, span.row),
        c0: Math.min(bounds.c0, span.column),
        r1: Math.max(bounds.r1, sr1),
        c1: Math.max(bounds.c1, sc1),
      };
      if (
        next.r0 !== bounds.r0 ||
        next.c0 !== bounds.c0 ||
        next.r1 !== bounds.r1 ||
        next.c1 !== bounds.c1
      ) {
        bounds.r0 = next.r0;
        bounds.c0 = next.c0;
        bounds.r1 = next.r1;
        bounds.c1 = next.c1;
        grown = true;
      }
    }
  }
  return bounds;
}

/** True when the cell lies inside the bounds. */
export function cellInBounds(bounds: CellBounds, cell: CellAddress): boolean {
  return (
    cell.row >= bounds.r0 && cell.row <= bounds.r1 && cell.col >= bounds.c0 && cell.col <= bounds.c1
  );
}

/** The drawn cells inside the bounds as [row, col]: the cells a merged cell covers are left out. */
export function drawnCellsIn(block: TableBlock, bounds: CellBounds): [number, number][] {
  const out: [number, number][] = [];
  for (let r = bounds.r0; r <= bounds.r1; r += 1)
    for (let c = bounds.c0; c <= bounds.c1; c += 1)
      if (!isCoveredCell(block.spans, r, c)) out.push([r, c]);
  return out;
}

/**
 * True when the range is a range and not one cell: two drawn cells or more (a merged cell counts
 * as one). A Shift click or a drag that ends where it began makes no range.
 */
export function isMultiCell(block: TableBlock, range: CellRange): boolean {
  return drawnCellsIn(block, rangeBounds(block, range)).length >= 2;
}

/** The pointer of a cell as data-run writes it without the block id. */
export function cellRunPointer(cell: CellAddress): string {
  return `rows/${cell.row}/cells/${cell.col}`;
}

/** The four ways the caret leaves a cell at its text edges (docs/FEATURES.md 2.2 rank 5). */
export type CellDirection = 'left' | 'right' | 'up' | 'down';

/** The anchor of the merged cell a position belongs to, else the position itself. */
function anchorOf(block: TableBlock, cell: CellAddress): CellAddress {
  const span = spanAt(block.spans, cell.row, cell.col);
  return span === undefined ? cell : { row: span.row, col: span.column };
}

/**
 * The cell the caret crosses into from `cell` (docs/FEATURES.md 2.2 rank 5; audit-objects 6:
 * Google, Notion, Pitch and Keynote all leave a cell with the arrows): Left and Right walk the
 * drawn cells in reading order, so Right from the last cell of a row lands on the next row's
 * first cell and Left from a row's first cell on the row above's last; Up and Down take the cell
 * above or below in the same column. A merged cell counts as one: its anchor is the one stop, a
 * position inside it resolves to the anchor, and Down from an anchor steps past the rows it
 * spans. Null at the edge of the grid (the first cell's Left, the last cell's Right, the first
 * row's Up, the last row's Down), where the caret stays where it is.
 */
export function adjacentCell(
  block: TableBlock,
  cell: CellAddress,
  direction: CellDirection,
): CellAddress | null {
  const rows = block.rows.length;
  const columns = block.columns.length;
  if (rows === 0 || columns === 0) return null;
  const from = anchorOf(block, clampCell(block, cell));
  if (direction === 'left' || direction === 'right') {
    const delta = direction === 'right' ? 1 : -1;
    let flat = from.row * columns + from.col;
    for (;;) {
      flat += delta;
      if (flat < 0 || flat >= rows * columns) return null;
      const next = { row: Math.floor(flat / columns), col: flat % columns };
      if (!isCoveredCell(block.spans, next.row, next.col)) return next;
    }
  }
  if (direction === 'up') {
    if (from.row === 0) return null;
    return anchorOf(block, { row: from.row - 1, col: from.col });
  }
  const span = spanAt(block.spans, from.row, from.col);
  const below = from.row + (span === undefined ? 1 : span.rows);
  if (below >= rows) return null;
  return anchorOf(block, { row: below, col: from.col });
}

/**
 * The union box of the range's drawn cells in sheet px, read from the measured runs (keyed
 * `<blockId>/rows/<r>/cells/<c>`, Gestures.tsx MeasuredBoxes.runs), or null when none of them was
 * measured (the table is off the slide, or the markup has not been measured yet).
 */
export function rangeBox(
  block: TableBlock,
  bounds: CellBounds,
  runs: Readonly<Record<string, Box>>,
): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [r, c] of drawnCellsIn(block, bounds)) {
    const box = runs[`${block.id}/${cellRunPointer({ row: r, col: c })}`];
    if (!box) continue;
    x0 = Math.min(x0, box[0]);
    y0 = Math.min(y0, box[1]);
    x1 = Math.max(x1, box[0] + box[2]);
    y1 = Math.max(y1, box[1] + box[3]);
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * The cell of `blockId` whose measured run box holds the sheet point, or null when the point is
 * outside every cell (the overlay layer sits over the sheet, so a drag reads the cell under the
 * pointer from the measured boxes, never from the element under it).
 */
export function cellAtPoint(
  blockId: string,
  runs: Readonly<Record<string, Box>>,
  point: { x: number; y: number },
): CellAddress | null {
  const prefix = `${blockId}/rows/`;
  for (const [key, box] of Object.entries(runs)) {
    if (!key.startsWith(prefix)) continue;
    const match = /\/rows\/(\d+)\/cells\/(\d+)$/.exec(key);
    if (!match) continue;
    if (
      point.x >= box[0] &&
      point.x <= box[0] + box[2] &&
      point.y >= box[1] &&
      point.y <= box[1] + box[3]
    )
      return { row: Number(match[1]), col: Number(match[2]) };
  }
  return null;
}

/**
 * The rows with every drawn cell of the bounds emptied (Delete or Backspace on a range clears the
 * texts and keeps the cells, as Google does), or null when every one of them is empty already.
 */
export function rowsWithRangeCleared(block: TableBlock, bounds: CellBounds): TableRow[] | null {
  let changed = false;
  const rows = block.rows.map((row) => ({ ...row, cells: [...row.cells] }));
  for (const [r, c] of drawnCellsIn(block, bounds)) {
    const row = rows[r];
    if (!row || (row.cells[c] ?? '') === '') continue;
    row.cells[c] = '';
    changed = true;
  }
  return changed ? rows : null;
}

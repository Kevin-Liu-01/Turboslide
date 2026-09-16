// Tables (gslides-parity SPEC-5 5.1; R04 5.6): one `a:tbl` inside a `p:graphicFrame` read into a
// `table` block: the column widths and row heights in sheet px, the cells as multiline Texts
// through `text.ts`, the merges as spans on the origin cell (the covered cells keep their text),
// the per cell fills and borders (round five's per edge `CellBorder`, so a left or right border
// lands as itself), the header row, the dominant size and the per column alignment. Over 20 by
// 20 the table is truncated with a row (or dropped when `truncateTables` is off).
import type { Element } from '@xmldom/xmldom';

import type {
  Block,
  TableBlock,
  TableCellStyle,
  TableColumn,
  TableRow,
  TableSpan,
} from '@turboslide/schema/blocks';
import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TABLE_SIZES } from '@turboslide/schema/blocks';
import type {
  CellBorder,
  CellEdgeBorder,
  TableAlign,
  TableBorder,
  TableBorderWeight,
  TableSize,
  TableValign,
} from '@turboslide/schema/blocks/table';
import type { Color } from '@turboslide/schema/color';
import type { Position } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { altOf, colorOf, placed, px2, rowOn } from './context.ts';
import type { ShapeFacts } from './context.ts';
import { ROW_CODES } from './report.ts';
import { dashOf, snapLadder } from './shapes.ts';
import { readTextBody } from './text.ts';
import { readFill } from './theme.ts';
import { emuToPx, lineWidthPx } from './units.ts';
import { attr, child, children, intAttr } from './xml.ts';

const BORDER_WEIGHTS = [0, 1, 1.5, 2] as const;

/** One `a:lnX` cell edge as the schema's edge border: `a:noFill` is weight 0 (Google's Transparent border). */
function edgeBorder(ln: Element | undefined, ctx: SlideContext): CellEdgeBorder | undefined {
  if (ln === undefined) return undefined;
  if (child(ln, 'a', 'noFill') !== undefined) return { weight: 0 };
  const out: CellEdgeBorder = {};
  const w = intAttr(ln, 'w');
  if (w !== undefined)
    out.weight = snapLadder(lineWidthPx(w, ctx.mapping), BORDER_WEIGHTS).value as TableBorderWeight;
  const fill = readFill(ln, ctx.chain.colors);
  if (fill !== undefined && 'color' in fill && fill.color !== undefined)
    out.color = colorOf(fill.color, ctx);
  const dash = dashOf(attr(child(ln, 'a', 'prstDash') ?? ln, 'val'));
  if (child(ln, 'a', 'prstDash') !== undefined && dash.dash !== undefined) out.dash = dash.dash;
  return Object.keys(out).length === 0 ? undefined : out;
}

function sameEdge(a: CellEdgeBorder | undefined, b: CellEdgeBorder | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function valignOf(anchor: string | undefined): TableValign | undefined {
  switch (anchor) {
    case 't':
      return 'top';
    case 'ctr':
      return 'middle';
    case 'b':
      return 'bottom';
    default:
      return undefined;
  }
}

/** Reads one `a:tbl` into a table block; an empty list when the table was dropped. */
export function readTable(
  frame: Element,
  tbl: Element,
  pos: Position,
  facts: ShapeFacts,
  ctx: SlideContext,
): Block[] {
  const object = facts.name;
  const grid = child(tbl, 'a', 'tblGrid');
  const gridCols = grid === undefined ? [] : children(grid, 'a', 'gridCol');
  const trs = children(tbl, 'a', 'tr');
  const columnCount = gridCols.length;
  const rowCount = trs.length;
  if (columnCount === 0 || rowCount === 0) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: 'table.empty',
      message: 'A table without cells was dropped',
    });
    return [];
  }
  const truncated = columnCount > TABLE_MAX_COLUMNS || rowCount > TABLE_MAX_ROWS;
  if (truncated && !ctx.options.truncateTables) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.tableColumns,
      message: `A ${columnCount} by ${rowCount} table is over the 20 by 20 limit and was dropped`,
    });
    return [];
  }
  const keepCols = Math.min(columnCount, TABLE_MAX_COLUMNS);
  const keepRows = Math.min(rowCount, TABLE_MAX_ROWS);
  const columns: TableColumn[] = gridCols.slice(0, keepCols).map((col) => {
    const w = intAttr(col, 'w');
    return w === undefined ? {} : { width: px2(emuToPx(w, ctx.mapping)) };
  });
  const rows: TableRow[] = [];
  const spans: TableSpan[] = [];
  const cells: TableCellStyle[] = [];
  const sizes: number[] = [];
  const anchors = new Map<string, number>();
  const columnAligns: Map<TableAlign, number>[] = columns.map(() => new Map());
  const columnFills: (Color | undefined | null)[] = columns.map(() => undefined);
  const bottoms: (CellEdgeBorder | undefined)[] = [];
  let firstTop: CellEdgeBorder | undefined;
  let sideBorders = 0;
  const mark = ctx.report.mark();
  const tblPr = child(tbl, 'a', 'tblPr');
  const firstRow =
    tblPr !== undefined && (attr(tblPr, 'firstRow') === '1' || attr(tblPr, 'firstRow') === 'true');
  trs.slice(0, keepRows).forEach((tr, r) => {
    const h = intAttr(tr, 'h');
    const row: TableRow = { cells: [] };
    if (h !== undefined) row.height = px2(emuToPx(h, ctx.mapping));
    if (r === 0 && firstRow) row.header = true;
    const tcs = children(tr, 'a', 'tc').slice(0, keepCols);
    tcs.forEach((tc, c) => {
      const txBody = child(tc, 'a', 'txBody');
      const reading =
        txBody === undefined
          ? undefined
          : readTextBody(ctx, { shape: frame, txBody, withBody: false });
      for (const [family, runs] of reading?.fonts ?? []) ctx.report.font(family, runs);
      row.cells.push(reading === undefined ? '' : reading.text);
      const size = reading?.typography?.size;
      if (size !== undefined) sizes.push(size);
      const align = reading?.typography?.align;
      if (align !== undefined && align !== 'justify')
        columnAligns[c]?.set(align, (columnAligns[c]?.get(align) ?? 0) + 1);
      const gridSpan = intAttr(tc, 'gridSpan') ?? 1;
      const rowSpan = intAttr(tc, 'rowSpan') ?? 1;
      const hMerge = attr(tc, 'hMerge') === '1' || attr(tc, 'hMerge') === 'true';
      const vMerge = attr(tc, 'vMerge') === '1' || attr(tc, 'vMerge') === 'true';
      if (!hMerge && !vMerge && (gridSpan > 1 || rowSpan > 1))
        spans.push({
          row: r,
          column: c,
          rows: Math.min(rowSpan, keepRows - r),
          columns: Math.min(gridSpan, keepCols - c),
        });
      const tcPr = child(tc, 'a', 'tcPr');
      if (tcPr !== undefined) {
        const anchor = attr(tcPr, 'anchor');
        if (anchor !== undefined) anchors.set(anchor, (anchors.get(anchor) ?? 0) + 1);
        const fill = readFill(tcPr, ctx.chain.colors);
        const style: TableCellStyle = { row: r, column: c };
        if (fill !== undefined && 'color' in fill && fill.color !== undefined) {
          style.fill = colorOf(fill.color, ctx, ctx.chain.colors.scheme.colors.lt1);
          if (fill.kind !== 'solid')
            ctx.report.substitute({
              ...rowOn(ctx, object),
              code: ROW_CODES.shapeFill,
              message: `A ${fill.kind} cell fill became its first colour`,
            });
        }
        const current = columnFills[c];
        if (current === undefined) columnFills[c] = style.fill ?? null;
        else if (current !== (style.fill ?? null)) columnFills[c] = null;
        const border: CellBorder = {};
        const top = edgeBorder(child(tcPr, 'a', 'lnT'), ctx);
        const bottom = edgeBorder(child(tcPr, 'a', 'lnB'), ctx);
        const left = edgeBorder(child(tcPr, 'a', 'lnL'), ctx);
        const right = edgeBorder(child(tcPr, 'a', 'lnR'), ctx);
        if (r === 0 && top !== undefined && firstTop === undefined) firstTop = top;
        bottoms.push(bottom);
        if (top !== undefined) border.top = top;
        if (bottom !== undefined) border.bottom = bottom;
        if (left !== undefined) {
          border.left = left;
          sideBorders += 1;
        }
        if (right !== undefined) {
          border.right = right;
          sideBorders += 1;
        }
        if (
          child(tcPr, 'a', 'lnTlToBr') !== undefined ||
          child(tcPr, 'a', 'lnBlToTr') !== undefined
        )
          ctx.report.substitute({
            ...rowOn(ctx, object),
            code: ROW_CODES.tableBorder,
            message: 'A diagonal cell border was dropped',
          });
        if (Object.keys(border).length > 0) style.border = border;
        const margins = ['marL', 'marR', 'marT', 'marB']
          .map((name) => intAttr(tcPr, name))
          .filter((v): v is number => v !== undefined);
        if (margins.some((m) => Math.abs(emuToPx(m, ctx.mapping) - 8) > 4))
          ctx.report.row('kept', {
            ...rowOn(ctx, object),
            code: 'table.margins',
            message: 'Cell margins differ from the renderer’s padding by more than 4 px',
          });
        if (style.fill !== undefined || style.border !== undefined) cells.push(style);
      } else {
        columnFills[c] = null;
      }
    });
    while (row.cells.length < keepCols) row.cells.push('');
    rows.push(row);
  });
  if (truncated) {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.tableColumns,
      message: `A ${columnCount} by ${rowCount} table was truncated to ${keepCols} by ${keepRows}`,
    });
  } else ctx.report.keepUnless(mark);

  // a column whose every cell shares one fill writes the column's fill and drops the cells' (R04 5.6)
  columnFills.forEach((fill, c) => {
    if (fill === undefined || fill === null) return;
    columns[c] = { ...(columns[c] ?? {}), fill };
    for (const cell of cells) if (cell.column === c && cell.fill === fill) delete cell.fill;
  });
  columnAligns.forEach((counts, c) => {
    let best: TableAlign | undefined;
    let n = 0;
    for (const [align, count] of counts) if (count > n) [best, n] = [align, count];
    if (best !== undefined && best !== 'left') columns[c] = { ...(columns[c] ?? {}), align: best };
  });
  // the table wide border: the bottom edge every cell shares
  let border: TableBorder | undefined;
  const firstBottom = bottoms[0];
  if (
    firstBottom !== undefined &&
    bottoms.length === rows.length * keepCols &&
    bottoms.every((b) => sameEdge(b, firstBottom))
  ) {
    border = { weight: firstBottom.weight ?? 1 };
    if (firstBottom.color !== undefined) border.color = firstBottom.color;
    if (firstBottom.dash !== undefined) border.dash = firstBottom.dash;
    for (const cell of cells) {
      if (cell.border !== undefined) {
        delete cell.border.bottom;
        if (
          cell.row === 0 &&
          sameEdge(cell.border.top, firstTop) &&
          sameEdge(firstTop, firstBottom)
        )
          delete cell.border.top;
        if (Object.keys(cell.border).length === 0) delete cell.border;
      }
    }
  }
  const styled = cells.filter((cell) => cell.fill !== undefined || cell.border !== undefined);
  if (sideBorders > 0)
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: ROW_CODES.tableBorder,
      message: `${sideBorders} left or right cell borders landed as per edge borders`,
    });
  const block: TableBlock = {
    id: ctx.ids.take(facts.name, 'table'),
    type: 'table',
    columns,
    rows,
    pos,
  };
  if (spans.length > 0) block.spans = spans;
  if (styled.length > 0) block.cells = styled;
  if (border !== undefined) block.border = border;
  if (sizes.length > 0) {
    const counts = new Map<number, number>();
    for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 16;
    const size = snapLadder(dominant, TABLE_SIZES).value as TableSize;
    if (size !== 16) block.size = size;
  }
  if (anchors.size > 0) {
    const dominant = [...anchors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const valign = valignOf(dominant);
    if (valign !== undefined && valign !== 'top') block.valign = valign;
    if (anchors.size > 1)
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'table.anchor',
        message: 'Cells with different vertical alignments took the dominant one',
      });
  }
  const styleId = tblPr === undefined ? undefined : child(tblPr, 'a', 'tableStyleId');
  if (
    styleId !== undefined ||
    (tblPr !== undefined &&
      ['bandRow', 'firstCol', 'lastRow', 'lastCol', 'bandCol'].some((a) => attr(tblPr, a) === '1'))
  )
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: 'table.style',
      message: `The table style${styleId === undefined ? '' : ` ${styleId.textContent ?? ''}`} (banding, first column) was dropped; the cells keep their own fills and borders`,
    });
  const alt = altOf(facts);
  if (alt !== undefined) block.alt = alt;
  block.ext = { pptxName: facts.name };
  return [placed(ctx, block)];
}

// The table block as a PPTX table (gslides-parity SPEC 7.3, Editable text): `addTable` with the
// measured grid as `colW` and `rowH` in inches, per cell the alignment, the vertical alignment,
// the header row's display face (weight 500 is a family name, fonts-map.ts), the column fill, the
// rules as cell borders (the hairline above the first row, the row rule under every row, the ink
// rule under a header row, no side borders) from the block's weight and the computed colors, the
// export font map's face and size on every run, the exact line pitch as `lineSpacing` on every
// cell, and the cell padding as the margin, the top one lifted by the renderer's first-baseline
// constant (baseline.ts) the way a text box is. The runs
// are the measured lines of each cell (text.ts textRuns: the browser's breaks, paragraph breaks,
// links), so no renderer rewraps. SPEC 8.2's "never a PPTX table" is scoped to `rows` and `plain`
// (SPEC 7.9 item 2); the ruled rows construction stays as the fallback the builder takes when the
// verify loop finds a cell outside the 3 px budget. Round two (gslides-parity SPEC-2 2.7): a
// merged cell travels as `rowspan` and `colspan` on its anchor with the covered cells left out of
// the row arrays, a cell's own fill and border per cell (`type: 'none'` at weight 0, `dash` for
// the six dashes), the table border's dash on every rule, and the table's rotation, shadow and
// alt text on the frame.
import type PptxGenJS from 'pptxgenjs';

import type { SceneDash, SceneTable, SceneTableCell, SceneText } from '../scene/types.ts';
import { PX_PER_IN, pxToIn, pxToPt } from '../units.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import { fillProps, lineColor } from './lines.ts';
import { familyFor, textRuns } from './text.ts';
import type { TextEmitOptions } from './text.ts';

export type TableEmitOptions = TextEmitOptions & {
  /** The paper hex the translucent rule colors composite on. */
  paperHex: string;
};

/**
 * A cell's options with the line pitch: pptxgenjs 4.0.1 declares `TableCellProps` without
 * `lineSpacing` while its text body writer reads the field from a cell the way it does from a
 * text box (gen-xml `genXmlTextBody`, `<a:lnSpc><a:spcPts>`), so the writer takes it typed here.
 */
export type TableCellOptions = PptxGenJS.TableCellProps & { lineSpacing?: number };

/**
 * How much less a table cell's top margin gives up than a text box does for the first baseline
 * shift (baseline.ts), in sheet px. With the text box model alone LibreOffice sets a cell's first
 * line about a pixel higher than the browser: measured in the render worker image on the
 * fixture's two tables (32 cells at 16 px on a 23.2 px pitch, `lineSpacing` written), every cell
 * read dy -1 or -2 against the 1 px budget; a pixel kept lands them on 0 and -1 (b2.md, fix
 * round). Not applied with `--baseline-target none`.
 */
export const CELL_FIRST_BASELINE_PX = 1;

/** pptxgenjs `BorderProps.type` takes solid, dash or none: the six dashes map to dash but solid. */
function borderType(dash: SceneDash | undefined): 'solid' | 'dash' {
  return dash === undefined || dash === 'solid' ? 'solid' : 'dash';
}

/** A cell border: the measured rule as a line in its composite color and dash, or none. */
export function cellBorder(
  rule: { color: string; width: number; dash?: SceneDash } | undefined,
  paperHex: string,
  dash?: SceneDash,
): PptxGenJS.BorderProps {
  if (!rule || rule.width <= 0) return { type: 'none' };
  return {
    type: borderType(rule.dash ?? dash),
    color: lineColor(rule.color, paperHex).color,
    pt: pxToPt(rule.width),
  };
}

/**
 * The four borders of a cell: top on the first row (the hairline above), bottom on every row; a
 * cell's own border (SPEC-2 2.7.2) replaces the row's rule under it, `none` at weight 0.
 */
export function cellBorders(
  table: SceneTable,
  rowIndex: number,
  paperHex: string,
  cell?: SceneTableCell,
): [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] {
  const row = table.rows[rowIndex];
  const under = row?.header ? (table.headerRule ?? table.rule) : table.rule;
  const none: PptxGenJS.BorderProps = { type: 'none' };
  const dash = table.border?.dash;
  const own =
    cell?.border === 'none'
      ? none
      : cell?.border !== undefined
        ? cellBorder(cell.border, paperHex, dash)
        : cellBorder(under, paperHex, dash);
  return [rowIndex === 0 ? cellBorder(table.rule, paperHex, dash) : none, none, own, none];
}

/**
 * The cell margin in inches: the renderer's padding, the top one reduced by the first-baseline
 * shift of the cell's text (LibreOffice sets the first line lower than the browser, baseline.ts).
 */
export function cellMargin(
  cell: SceneTableCell,
  text: SceneText | undefined,
  options: TableEmitOptions,
): [number, number, number, number] {
  const [top, right, bottom, left] = cell.margin;
  let shift = 0;
  if (text && text.lines.length > 0) {
    const lineHeight = Math.max(...text.lines.map((l) => l.box[3]));
    shift =
      firstBaselineShiftPx(
        text.style.size,
        lineHeight,
        options.baseline ?? 'libreoffice',
        undefined,
        text.style.mono,
      ) - (options.baseline === 'none' ? 0 : CELL_FIRST_BASELINE_PX);
  }
  return [pxToIn(Math.max(0, top - shift)), pxToIn(right), pxToIn(bottom), pxToIn(left)];
}

/** One measured cell as a pptxgenjs table cell: its runs and its options. */
export function tableCell(
  table: SceneTable,
  rowIndex: number,
  cell: SceneTableCell,
  text: SceneText | undefined,
  options: TableEmitOptions,
): PptxGenJS.TableCell {
  const style = text?.style;
  const family = style ? familyFor(style, options.fontSet) : undefined;
  if (family) options.families.add(family);
  // the exact line pitch on the cell (the text box writes the same lnSpc): without it LibreOffice
  // lays the cell's lines out at the face's natural height, which puts the first line about 6 px
  // higher than the browser's line box and the first baseline shift of cellMargin compensates
  // for (measured in the render worker image on the fixture's two tables, every cell dy -6)
  const lineHeight =
    text && text.lines.length > 0 ? Math.max(...text.lines.map((l) => l.box[3])) : undefined;
  const cellOptions: TableCellOptions = {
    align: cell.align,
    valign: table.valign,
    margin: cellMargin(cell, text, options),
    ...(lineHeight !== undefined ? { lineSpacing: pxToPt(lineHeight) } : {}),
    border: cellBorders(table, rowIndex, options.paperHex, cell),
    ...(cell.fill !== undefined ? { fill: fillProps(cell.fill, options.paperHex) } : {}),
    ...(family ? { fontFace: family } : {}),
    fontSize: pxToPt(style?.size ?? table.size),
    ...(cell.rowspan !== undefined && cell.rowspan > 1 ? { rowspan: cell.rowspan } : {}),
    ...(cell.colspan !== undefined && cell.colspan > 1 ? { colspan: cell.colspan } : {}),
  };
  if (!text || text.lines.length === 0) return { text: '', options: cellOptions };
  // the run options are TextPropsOptions (charSpacing, transparency, hyperlink); pptxgenjs reads
  // them from a cell run the same way, its TableCellProps type names the base set only
  const runs = textRuns(text, options).map((run): PptxGenJS.TableCell => ({
    text: run.text,
    options: run.options,
  }));
  return { text: runs, options: cellOptions };
}

/**
 * The column widths `a:tbl` takes, in sheet px, summing to the table's measured box: the scene's
 * cell boxes as measured, scaled when their sum drifted from the box (a grid the browser laid
 * out past or short of the table, or a measurement of a cell that spanned the row while a
 * session was open); a `gridCol` wider than the frame is a width the file cannot hold
 * (docs/RETURN.md 2.4 fix 4; audit-objects row 85 read 240, 240, 240 and 960 for a 960 px table).
 * Columns of zero total, or a box of zero width, are written as measured.
 */
export function normalisedColumnWidths(table: Pick<SceneTable, 'columns' | 'box'>): number[] {
  const widths = table.columns.map((column) => Math.max(0, column.w));
  const sum = widths.reduce((acc, w) => acc + w, 0);
  const target = table.box[2];
  if (sum <= 0 || target <= 0 || Math.abs(sum - target) <= 0.5) return widths;
  return widths.map((w) => (w * target) / sum);
}

/**
 * Adds one measured table to a slide as `a:tbl`. `texts` are the scene's texts; the cells find
 * theirs by `textId`. Returns the rows and columns written.
 */
export function addSceneTable(
  slide: PptxGenJS.Slide,
  table: SceneTable,
  texts: readonly SceneText[],
  options: TableEmitOptions,
): { rows: number; columns: number; merged: number; rotated: boolean } {
  const byId = new Map(texts.map((text) => [text.id, text]));
  let merged = 0;
  const rows: PptxGenJS.TableRow[] = table.rows.map((row, r) =>
    row.cells.map((cell) => {
      if ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1) merged += 1;
      return tableCell(table, r, cell, byId.get(cell.textId), options);
    }),
  );
  const colW = normalisedColumnWidths(table).map((w) => pxToIn(w));
  const rowH = table.rows.map((row) => pxToIn(row.h));
  const [x, y] = table.box;
  // pptxgenjs's TableProps carry no rotate, shadow or altText (4.0.1 declarations): a rotated
  // table travels upright at its box and the residual says so (the builder reads `rotated`)
  slide.addTable(rows, {
    x: pxToIn(x),
    y: pxToIn(y),
    w: colW.reduce((sum, w) => sum + w, 0),
    h: rowH.reduce((sum, h) => sum + h, 0),
    colW,
    rowH,
    margin: 0,
    fontSize: pxToPt(table.size),
    objectName: `${options.namePrefix}#${table.blockId}${table.userGroup ? `@g:${table.userGroup}` : ''}`,
  });
  return {
    rows: table.rows.length,
    columns: table.columns.length,
    merged,
    rotated: table.rotate !== undefined && table.rotate !== 0,
  };
}

/** The sheet px per inch, for a caller sizing against the measured grid. */
export { PX_PER_IN };

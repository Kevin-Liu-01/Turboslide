// The table block as a PPTX table (gslides-parity SPEC 7.3, Editable text): `addTable` with the
// measured grid as `colW` and `rowH` in inches, per cell the alignment, the vertical alignment,
// the header row's display face (weight 500 is a family name, fonts-map.ts), the column fill, the
// rules as cell borders (the hairline above the first row, the row rule under every row, the ink
// rule under a header row, no side borders) from the block's weight and the computed colors, the
// export font map's face and size on every run, and the cell padding as the margin, the top one
// lifted by the renderer's first-baseline constant (baseline.ts) the way a text box is. The runs
// are the measured lines of each cell (text.ts textRuns: the browser's breaks, paragraph breaks,
// links), so no renderer rewraps. SPEC 8.2's "never a PPTX table" is scoped to `rows` and `plain`
// (SPEC 7.9 item 2); the ruled rows construction stays as the fallback the builder takes when the
// verify loop finds a cell outside the 3 px budget.
import type PptxGenJS from 'pptxgenjs';

import type { SceneTable, SceneTableCell, SceneText } from '../scene/types.ts';
import { PX_PER_IN, pxToIn, pxToPt } from '../units.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import { fillProps, lineColor } from './lines.ts';
import { familyFor, textRuns } from './text.ts';
import type { TextEmitOptions } from './text.ts';

export type TableEmitOptions = TextEmitOptions & {
  /** The paper hex the translucent rule colors composite on. */
  paperHex: string;
};

/** A cell border: the measured rule as a solid line in its composite color, or none. */
export function cellBorder(
  rule: { color: string; width: number } | undefined,
  paperHex: string,
): PptxGenJS.BorderProps {
  if (!rule || rule.width <= 0) return { type: 'none' };
  return { type: 'solid', color: lineColor(rule.color, paperHex).color, pt: pxToPt(rule.width) };
}

/** The four borders of a cell: top on the first row (the hairline above), bottom on every row. */
export function cellBorders(
  table: SceneTable,
  rowIndex: number,
  paperHex: string,
): [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] {
  const row = table.rows[rowIndex];
  const under = row?.header ? (table.headerRule ?? table.rule) : table.rule;
  const none: PptxGenJS.BorderProps = { type: 'none' };
  return [
    rowIndex === 0 ? cellBorder(table.rule, paperHex) : none,
    none,
    cellBorder(under, paperHex),
    none,
  ];
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
    shift = firstBaselineShiftPx(
      text.style.size,
      lineHeight,
      options.baseline ?? 'libreoffice',
      undefined,
      text.style.mono,
    );
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
  const cellOptions: PptxGenJS.TableCellProps = {
    align: cell.align,
    valign: table.valign,
    margin: cellMargin(cell, text, options),
    border: cellBorders(table, rowIndex, options.paperHex),
    ...(cell.fill !== undefined ? { fill: fillProps(cell.fill, options.paperHex) } : {}),
    ...(family ? { fontFace: family } : {}),
    fontSize: pxToPt(style?.size ?? table.size),
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
 * Adds one measured table to a slide as `a:tbl`. `texts` are the scene's texts; the cells find
 * theirs by `textId`. Returns the rows and columns written.
 */
export function addSceneTable(
  slide: PptxGenJS.Slide,
  table: SceneTable,
  texts: readonly SceneText[],
  options: TableEmitOptions,
): { rows: number; columns: number } {
  const byId = new Map(texts.map((text) => [text.id, text]));
  const rows: PptxGenJS.TableRow[] = table.rows.map((row, r) =>
    row.cells.map((cell) => tableCell(table, r, cell, byId.get(cell.textId), options)),
  );
  const colW = table.columns.map((column) => pxToIn(column.w));
  const rowH = table.rows.map((row) => pxToIn(row.h));
  const [x, y] = table.box;
  slide.addTable(rows, {
    x: pxToIn(x),
    y: pxToIn(y),
    w: colW.reduce((sum, w) => sum + w, 0),
    h: rowH.reduce((sum, h) => sum + h, 0),
    colW,
    rowH,
    margin: 0,
    fontSize: pxToPt(table.size),
    objectName: `${options.namePrefix}#${table.blockId}`,
  });
  return { rows: table.rows.length, columns: table.columns.length };
}

/** The sheet px per inch, for a caller sizing against the measured grid. */
export { PX_PER_IN };

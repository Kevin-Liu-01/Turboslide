// A table block of the ODP (gslides-parity SPEC-5 6.3; SPEC 7.3): the measured grid as a
// `draw:frame` holding a `table:table` with one `table:table-column` per measured column (its
// width), one `table:table-row` per row (its height), and `table:table-cell` elements carrying
// the cell's paragraphs from the scene's texts (named by `textId`), the cell padding, the fill
// and the rule under the row as `fo:border-bottom` (the header rule in ink, the others as the
// table's rule); a merged cell spans through `table:number-columns-spanned` and
// `table:number-rows-spanned` with `table:covered-table-cell` for the covered ones (SPEC-2 2.7).
import type { SceneTable, SceneText } from '../scene/types.ts';
import type { OdfShapeContext } from './shapes.ts';
import { fillProperties } from './shapes.ts';
import type { OdfTextContext } from './text.ts';
import { paragraphsXml } from './text.ts';
import { cm, cssColor, el } from './xml.ts';

/** The `fo:border` value of a rule: width, solid, colour; `none` for no rule. */
function borderValue(rule: { color: string; width: number } | 'none' | undefined): string {
  if (rule === undefined || rule === 'none') return 'none';
  const color = cssColor(rule.color);
  if (color === null || rule.width <= 0) return 'none';
  return `${(Math.max(rule.width, 0.5) * 0.6).toFixed(2)}pt solid ${color.hex}`;
}

/**
 * The table as ODF: the frame at the block's box, the columns, the rows and the cells with their
 * texts; the texts the caller must not write again are answered as `written`.
 */
export function tableXml(
  table: SceneTable,
  texts: readonly SceneText[],
  shapes: OdfShapeContext,
  text: OdfTextContext,
  attributes: Record<string, string | undefined> = {},
): { xml: string; written: Set<string> } {
  const written = new Set<string>();
  const byId = new Map(texts.map((t) => [t.id, t]));
  const [x, y, w, h] = table.box;
  const columns = table.columns
    .map((column) => {
      const style = shapes.styles.add(
        'table-column',
        el('style:table-column-properties', { 'style:column-width': cm(column.w) }),
      );
      return el('table:table-column', { 'table:style-name': style });
    })
    .join('');
  const rows = table.rows
    .map((row, rowIndex) => {
      const rowStyle = shapes.styles.add(
        'table-row',
        el('style:table-row-properties', {
          'style:row-height': cm(row.h),
          'style:min-row-height': cm(row.h),
        }),
      );
      const cells = row.cells
        .map((cell) => {
          const rule =
            cell.border !== undefined
              ? cell.border
              : row.header && table.headerRule
                ? table.headerRule
                : table.rule;
          const edges = cell.edges;
          const cellStyle = shapes.styles.add(
            'table-cell',
            el('style:table-cell-properties', {
              ...fillProperties(cell.fill),
              'fo:padding-top': cm(cell.margin[0]),
              'fo:padding-right': cm(cell.margin[1]),
              'fo:padding-bottom': cm(cell.margin[2]),
              'fo:padding-left': cm(cell.margin[3]),
              'fo:border-top': borderValue(edges?.top ?? (rowIndex === 0 ? table.rule : 'none')),
              'fo:border-bottom': borderValue(edges?.bottom ?? rule),
              'fo:border-left': borderValue(edges?.left ?? 'none'),
              'fo:border-right': borderValue(edges?.right ?? 'none'),
              'style:vertical-align':
                table.valign === 'middle' ? 'middle' : table.valign === 'bottom' ? 'bottom' : 'top',
            }),
          );
          const cellText = byId.get(cell.textId);
          if (cellText !== undefined) written.add(cellText.id);
          const body = cellText !== undefined ? paragraphsXml(cellText, text) : '<text:p/>';
          const spans: Record<string, string | undefined> = {
            ...(cell.colspan !== undefined && cell.colspan > 1
              ? { 'table:number-columns-spanned': String(cell.colspan) }
              : {}),
            ...(cell.rowspan !== undefined && cell.rowspan > 1
              ? { 'table:number-rows-spanned': String(cell.rowspan) }
              : {}),
          };
          const own = el('table:table-cell', { 'table:style-name': cellStyle, ...spans }, body);
          const covered = (cell.colspan ?? 1) - 1;
          return own + '<table:covered-table-cell/>'.repeat(Math.max(0, covered));
        })
        .join('');
      return el('table:table-row', { 'table:style-name': rowStyle }, cells);
    })
    .join('');
  const frameStyle = shapes.styles.add(
    'graphic',
    el('style:graphic-properties', { 'draw:stroke': 'none', 'draw:fill': 'none' }),
    'standard',
  );
  const xml = el(
    'draw:frame',
    {
      'draw:style-name': frameStyle,
      'draw:layer': 'layout',
      'svg:x': cm(x),
      'svg:y': cm(y),
      'svg:width': cm(w),
      'svg:height': cm(h),
      ...attributes,
    },
    el('table:table', {}, columns + rows),
  );
  return { xml, written };
}

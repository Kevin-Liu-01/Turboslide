// The chart block as a native chart part (gslides-parity SPEC-2 2.8.1, decision 0.24): pptxgenjs
// `addChart` with the block's data, `barDir` for a bar or column chart, the legend position, the
// title, the series colours as the theme resolved them, the number format on the value axis and
// the shown values, the export faces on the labels, and the object's alt text. The chart's box is a
// picture region in the verify loop (never gated): PowerPoint and LibreOffice lay a chart out
// with their own axes, ticks and label placement, so its pixels are the viewer's.
import type PptxGenJS from 'pptxgenjs';

import type { SceneChart } from '../scene/types.ts';
import { parseCssColor, pxToIn, pxToPt } from '../units.ts';
import type { FontSet } from './fonts-map.ts';
import { pickFamily } from './fonts-map.ts';
import { objectName } from './shapes.ts';

export type ChartEmitOptions = {
  fontSet: FontSet;
  namePrefix: string;
  families: Set<string>;
  /** The paper hex, for the plot area (no fill) and the legend ground. */
  paperHex: string;
};

/** The Excel style format code of a chart's number format (SPEC-2 2.8.1). */
export function chartFormatCode(format: SceneChart['numberFormat']): string {
  switch (format) {
    case 'thousands':
      return '#,##0';
    case 'percent':
      return '0"%"';
    case 'currency':
      return '"$"#,##0';
    case 'plain':
    default:
      return 'General';
  }
}

/** pptxgenjs's chart type and bar direction of a chart kind. */
export function chartType(kind: SceneChart['kind']): {
  type: 'bar' | 'line' | 'pie';
  barDir?: 'bar' | 'col';
} {
  switch (kind) {
    case 'bar':
      return { type: 'bar', barDir: 'bar' };
    case 'column':
      return { type: 'bar', barDir: 'col' };
    case 'line':
      return { type: 'line' };
    case 'pie':
      return { type: 'pie' };
  }
}

/** The pptxgenjs legend position of the block's legend. */
export function legendPos(legend: SceneChart['legend']): 'b' | 'l' | 'r' | 't' | undefined {
  switch (legend) {
    case 'bottom':
      return 'b';
    case 'left':
      return 'l';
    case 'top':
      return 't';
    case 'right':
      return 'r';
    case 'none':
    default:
      return undefined;
  }
}

/** The chart's data in pptxgenjs's series form. */
export function chartData(
  chart: SceneChart,
): { name: string; labels: string[]; values: number[] }[] {
  return chart.series.map((series) => ({
    name: series.name,
    labels: [...chart.categories],
    values: [...series.values],
  }));
}

export function addSceneChart(
  slide: PptxGenJS.Slide,
  chart: SceneChart,
  options: ChartEmitOptions,
  pptx: PptxGenJS,
): void {
  const { type, barDir } = chartType(chart.kind);
  const [x, y, w, h] = chart.box;
  const label = pickFamily(18, 400, options.fontSet).family;
  const title = pickFamily(20, 500, options.fontSet).family;
  options.families.add(label);
  if (chart.title) options.families.add(title);
  const labelColor = parseCssColor(chart.labelColor).hex;
  const titleColor = parseCssColor(chart.titleColor).hex;
  const legend = legendPos(chart.legend);
  const colors =
    chart.kind === 'pie' && chart.sliceColorsHex !== undefined && chart.sliceColorsHex.length > 0
      ? chart.sliceColorsHex
      : chart.series.map((series) => series.colorHex);
  const format = chartFormatCode(chart.numberFormat);
  const chartTypeName =
    type === 'bar'
      ? pptx.ChartType.bar
      : type === 'line'
        ? pptx.ChartType.line
        : pptx.ChartType.pie;
  slide.addChart(chartTypeName, chartData(chart), {
    x: pxToIn(x),
    y: pxToIn(y),
    w: pxToIn(w),
    h: pxToIn(h),
    ...(barDir ? { barDir } : {}),
    chartColors: colors,
    showLegend: legend !== undefined,
    ...(legend ? { legendPos: legend } : {}),
    legendFontFace: label,
    legendFontSize: pxToPt(15),
    legendColor: labelColor,
    showTitle: chart.title !== undefined,
    ...(chart.title !== undefined ? { title: chart.title } : {}),
    titleFontFace: title,
    titleFontSize: pxToPt(20),
    titleColor,
    showValue: chart.labels,
    ...(chart.kind === 'pie'
      ? { showPercent: chart.numberFormat === 'percent', showLabel: false }
      : {}),
    dataLabelFormatCode: chart.kind === 'pie' && chart.numberFormat === 'percent' ? '0%' : format,
    dataLabelFontFace: label,
    dataLabelFontSize: pxToPt(15),
    dataLabelColor: labelColor,
    catAxisLabelFontFace: label,
    catAxisLabelFontSize: pxToPt(18),
    catAxisLabelColor: labelColor,
    valAxisLabelFontFace: label,
    valAxisLabelFontSize: pxToPt(18),
    valAxisLabelColor: labelColor,
    valAxisLabelFormatCode: format,
    plotArea: { fill: { type: 'none' } },
    chartArea: { fill: { type: 'none' }, roundedCorners: false },
    ...(chart.alt !== undefined ? { altText: chart.alt } : {}),
    objectName: objectName(options.namePrefix, chart.blockId, chart.userGroup),
  });
}

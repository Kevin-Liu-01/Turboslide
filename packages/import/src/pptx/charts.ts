// Charts (gslides-parity SPEC-5 5.1; R04 5.7): one `c:chart` part behind a `p:graphicFrame` read
// from its caches into a `chart` block: the kind (bar, column, line, pie), the categories and the
// series values from `c:strCache` and `c:numCache`, the series colours, the title, the legend, the
// data labels and the number format. The embedded workbook is never opened. A kind the schema
// lacks (scatter, bubble, radar, stock, surface) lands as a labelled box; a 3D, doughnut or
// stacked chart lands on its 2D clustered kind with a row; more than 12 categories or 6 series
// truncate with a row; a combination chart keeps its first plot.
import type { Element } from '@xmldom/xmldom';

import type {
  Block,
  ChartBlock,
  ChartKind,
  ChartLegend,
  ChartNumberFormat,
  ChartSeries,
} from '@turboslide/schema/blocks';
import { CHART_MAX_CATEGORIES, CHART_MAX_SERIES } from '@turboslide/schema/blocks';
import type { Position } from '@turboslide/schema/position';

import type { SlideContext } from './context.ts';
import { altOf, colorOf, placed, rowOn } from './context.ts';
import type { ShapeFacts } from './context.ts';
import { placeholderBox } from './pictures.ts';
import { ROW_CODES } from './report.ts';
import { readFill } from './theme.ts';
import { attr, child, children, descendants, elementChildren, is } from './xml.ts';

const PLOT_KINDS: Readonly<
  Record<string, { kind: ChartKind | 'box'; exact: boolean; note?: string }>
> = {
  barChart: { kind: 'bar', exact: true },
  bar3DChart: { kind: 'bar', exact: false, note: 'A 3D bar chart became a flat one' },
  lineChart: { kind: 'line', exact: true },
  line3DChart: { kind: 'line', exact: false, note: 'A 3D line chart became a flat one' },
  areaChart: { kind: 'line', exact: false, note: 'An area chart became a line chart' },
  area3DChart: { kind: 'line', exact: false, note: 'A 3D area chart became a line chart' },
  pieChart: { kind: 'pie', exact: true },
  pie3DChart: { kind: 'pie', exact: false, note: 'A 3D pie chart became a flat one' },
  doughnutChart: { kind: 'pie', exact: false, note: 'A doughnut chart became a pie chart' },
  ofPieChart: { kind: 'pie', exact: false, note: 'A bar of pie chart became a pie chart' },
  scatterChart: { kind: 'box', exact: false },
  bubbleChart: { kind: 'box', exact: false },
  radarChart: { kind: 'box', exact: false },
  stockChart: { kind: 'box', exact: false },
  surfaceChart: { kind: 'box', exact: false },
  surface3DChart: { kind: 'box', exact: false },
};

/** The values of a `c:strCache` or `c:numCache` by point index, formatted numbers as strings. */
function cachePoints(ref: Element | undefined): {
  values: (string | undefined)[];
  count: number;
  formatCode?: string;
} {
  if (ref === undefined) return { values: [], count: 0 };
  // a `c:lvl` of a multi level cache holds its points directly (the exporter's category form)
  const cache =
    child(ref, 'c', 'strCache') ??
    child(ref, 'c', 'numCache') ??
    (is(ref, 'c', 'strLit') || is(ref, 'c', 'numLit') || is(ref, 'c', 'lvl') ? ref : undefined);
  if (cache === undefined) return { values: [], count: 0 };
  const parentCount = is(ref, 'c', 'lvl')
    ? child(ref.parentNode as Element, 'c', 'ptCount')
    : undefined;
  const count = Number(attr(child(cache, 'c', 'ptCount') ?? parentCount ?? cache, 'val') ?? '0');
  const format = child(cache, 'c', 'formatCode');
  const values: (string | undefined)[] = [];
  for (const pt of children(cache, 'c', 'pt')) {
    const idx = Number(attr(pt, 'idx') ?? '0');
    const v = child(pt, 'c', 'v');
    values[idx] = v?.textContent ?? '';
  }
  return {
    values,
    count: Number.isFinite(count) ? count : values.length,
    ...(format?.textContent ? { formatCode: format.textContent } : {}),
  };
}

/** A category or value reference: `c:strRef`, `c:numRef`, `c:strLit`, `c:numLit`, or a `c:multiLvlStrRef`'s last level. */
function refOf(holder: Element | undefined): Element | undefined {
  if (holder === undefined) return undefined;
  const direct = elementChildren(holder)[0];
  if (direct !== undefined && is(direct, 'c', 'multiLvlStrRef')) {
    const cache = child(direct, 'c', 'multiLvlStrCache');
    const lvl = cache === undefined ? undefined : children(cache, 'c', 'lvl')[0];
    return lvl;
  }
  return direct;
}

function numberFormatOf(code: string | undefined): {
  format: ChartNumberFormat | undefined;
  decimalsDropped: boolean;
} {
  if (code === undefined || code === 'General')
    return { format: undefined, decimalsDropped: false };
  const decimalsDropped = /\.0+/.test(code);
  if (code.includes('%')) return { format: 'percent', decimalsDropped };
  if (/[$€£]|\[\$/.test(code)) return { format: 'currency', decimalsDropped };
  if (code.includes('#,##0')) return { format: 'thousands', decimalsDropped };
  return { format: undefined, decimalsDropped };
}

function legendOf(legend: Element | undefined, ctx: SlideContext, object: string): ChartLegend {
  if (legend === undefined) return 'none';
  const pos = attr(child(legend, 'c', 'legendPos') ?? legend, 'val') ?? 'r';
  switch (pos) {
    case 'b':
      return 'bottom';
    case 'l':
      return 'left';
    case 't':
      return 'top';
    case 'tr':
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'chart.legend',
        message: 'A top right legend became a right legend',
      });
      return 'right';
    default:
      return 'right';
  }
}

function richText(el: Element | undefined): string | undefined {
  if (el === undefined) return undefined;
  const text = descendants(el, 'a', 't')
    .map((t) => t.textContent ?? '')
    .join('');
  return text.trim() === '' ? undefined : text.trim();
}

/** Reads one chart part into a chart block, or a labelled box for a kind the schema lacks. */
export function readChart(
  frame: Element,
  chartPart: string,
  pos: Position,
  facts: ShapeFacts,
  ctx: SlideContext,
): Block[] {
  const object = facts.name;
  const mark = ctx.report.mark();
  if (!ctx.pkg.has(chartPart)) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: `The chart part ${chartPart} is missing`,
    });
    return [];
  }
  const root = ctx.pkg.root(chartPart);
  const chart = child(root, 'c', 'chart');
  const plotArea = chart === undefined ? undefined : child(chart, 'c', 'plotArea');
  if (chart === undefined || plotArea === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: 'The chart part has no plot area',
    });
    return [];
  }
  const plots = elementChildren(plotArea).filter((el) => (el.localName ?? '').endsWith('Chart'));
  const plot = plots[0];
  if (plot === undefined) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: 'The chart has no plot',
    });
    return [];
  }
  if (plots.length > 1)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: `A combination chart of ${plots.length} plots kept its first (${plot.localName})`,
    });
  const mapping = PLOT_KINDS[plot.localName ?? ''];
  const title = richText(child(chart, 'c', 'title'));
  const autoTitleDeleted = attr(child(chart, 'c', 'autoTitleDeleted') ?? chart, 'val') === '1';
  if (mapping === undefined || mapping.kind === 'box') {
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: `A ${plot.localName ?? 'chart'} has no form in the schema; a labelled box stands in its place`,
    });
    return [
      placeholderBox(ctx.ids.take(facts.name, 'chart'), pos, title ?? altOf(facts) ?? 'Chart', ctx),
    ];
  }
  let kind: ChartKind = mapping.kind;
  if (kind === 'bar') {
    const dir = attr(child(plot, 'c', 'barDir') ?? plot, 'val') ?? 'col';
    kind = dir === 'bar' ? 'bar' : 'column';
  }
  if (!mapping.exact && mapping.note !== undefined)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: mapping.note,
    });
  const grouping = attr(child(plot, 'c', 'grouping') ?? plot, 'val');
  if (grouping === 'stacked' || grouping === 'percentStacked')
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: `A ${grouping === 'stacked' ? 'stacked' : 'percent stacked'} chart is drawn clustered`,
    });
  const sers = children(plot, 'c', 'ser').sort(
    (a, b) =>
      Number(attr(child(a, 'c', 'idx') ?? a, 'val') ?? '0') -
      Number(attr(child(b, 'c', 'idx') ?? b, 'val') ?? '0'),
  );
  let categories: string[] = [];
  const series: ChartSeries[] = [];
  let formatCode: string | undefined;
  let missing = 0;
  sers.forEach((ser, index) => {
    const name =
      richText(child(ser, 'c', 'tx')) ??
      cachePoints(refOf(child(ser, 'c', 'tx'))).values[0] ??
      `Series ${index + 1}`;
    const cat = cachePoints(refOf(child(ser, 'c', 'cat')));
    const val = cachePoints(refOf(child(ser, 'c', 'val')));
    if (formatCode === undefined) formatCode = val.formatCode;
    if (index === 0 || categories.length === 0) {
      categories = Array.from(
        { length: Math.max(cat.count, cat.values.length) },
        (_, i) => cat.values[i] ?? '',
      );
    }
    const count = Math.max(val.count, val.values.length, categories.length);
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const raw = val.values[i];
      if (raw === undefined || raw === '') {
        missing += 1;
        values.push(0);
      } else {
        const n = Number(raw);
        values.push(Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0);
      }
    }
    const row: ChartSeries = { name, values };
    const spPr = child(ser, 'c', 'spPr');
    const fill = spPr === undefined ? undefined : readFill(spPr, ctx.chain.colors);
    if (fill !== undefined && 'color' in fill && fill.color !== undefined)
      row.color = colorOf(fill.color, ctx);
    if (children(ser, 'c', 'dPt').length > 0 && kind === 'pie')
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'chart.slices',
        message: 'Per slice colours were dropped; the pie takes the palette',
      });
    series.push(row);
  });
  if (series.length === 0) {
    ctx.report.drop({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartKind,
      message: 'A chart without series was dropped',
    });
    return [];
  }
  if (missing > 0)
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: 'chart.missing',
      message: `${missing} missing point${missing === 1 ? '' : 's'} read as 0`,
    });
  if (categories.length === 0) categories = series[0]?.values.map((_, i) => `${i + 1}`) ?? [];
  let truncatedCategories = false;
  let truncatedSeries = false;
  if (categories.length > CHART_MAX_CATEGORIES) {
    categories = categories.slice(0, CHART_MAX_CATEGORIES);
    truncatedCategories = true;
  }
  for (const row of series)
    if (row.values.length !== categories.length)
      row.values = Array.from({ length: categories.length }, (_, i) => row.values[i] ?? 0);
  let kept = series;
  if (series.length > CHART_MAX_SERIES) {
    kept = series.slice(0, CHART_MAX_SERIES);
    truncatedSeries = true;
  }
  if (kind === 'pie' && kept.length > 1) {
    kept = kept.slice(0, 1);
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: 'chart.pieSeries',
      message: 'A pie chart keeps its first series',
    });
  }
  if (truncatedCategories || truncatedSeries)
    ctx.report.substitute({
      ...rowOn(ctx, object),
      code: ROW_CODES.chartTruncated,
      message:
        [
          truncatedCategories ? `${CHART_MAX_CATEGORIES} of the categories` : '',
          truncatedSeries ? `${CHART_MAX_SERIES} of the ${series.length} series` : '',
        ]
          .filter((s) => s !== '')
          .join(' and ') + ' were kept',
    });
  else ctx.report.keepUnless(mark);
  const block: ChartBlock = {
    id: ctx.ids.take(facts.name, 'chart'),
    type: 'chart',
    kind,
    categories,
    series: kept,
    pos,
  };
  if (title !== undefined && !autoTitleDeleted) block.title = title;
  const legend = legendOf(child(chart, 'c', 'legend'), ctx, object);
  if (legend !== 'none') block.legend = legend;
  const dLbls = child(plot, 'c', 'dLbls');
  if (dLbls !== undefined) {
    if (attr(child(dLbls, 'c', 'showVal') ?? dLbls, 'val') === '1') block.labels = true;
    if (kind === 'pie' && attr(child(dLbls, 'c', 'showPercent') ?? dLbls, 'val') === '1')
      block.numberFormat = 'percent';
    const labelFormat = child(dLbls, 'c', 'numFmt');
    if (labelFormat !== undefined) formatCode = attr(labelFormat, 'formatCode') ?? formatCode;
  }
  const valAx = child(plotArea, 'c', 'valAx');
  const axisFormat = valAx === undefined ? undefined : child(valAx, 'c', 'numFmt');
  const code =
    formatCode ?? (axisFormat === undefined ? undefined : attr(axisFormat, 'formatCode'));
  const format = numberFormatOf(code);
  if (format.format !== undefined && block.numberFormat === undefined)
    block.numberFormat = format.format;
  if (format.decimalsDropped)
    ctx.report.row('kept', {
      ...rowOn(ctx, object),
      code: 'chart.decimals',
      message: `The number format ${code ?? ''} dropped its decimal places`,
    });
  const alt = altOf(facts);
  if (alt !== undefined) block.alt = alt;
  block.ext = { pptxName: facts.name, pptxChartPart: chartPart };
  void frame;
  return [placed(ctx, block)];
}

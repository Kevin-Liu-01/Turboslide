// The chart block (gslides-parity SPEC-2 2.8.1, decision 0.24): Google's Insert > Chart as data
// the renderer draws as inline SVG in the diagram grammar and the export writes natively through
// pptxgenjs addChart. Four kinds, 1 to 12 categories, 1 to 6 series each as long as the categories,
// a pie with one series; the caps are checked by validate.ts under the issue code `chart_size` at
// severity 3, so the code names the rule, and chart/size is the legibility lint at severity 2
// (SPEC-2 0.60). Imports only zod, annotate, color, ids and text so blocks.ts can import it.
import { z } from 'zod';
import { annotate } from '../annotate.ts';
import type { Color } from '../color.ts';
import { colorField } from '../color.ts';
import type { BlockId } from '../ids.ts';
import type { Text } from '../text.ts';
import { textSchema } from '../text.ts';

export const CHART_KINDS = ['bar', 'column', 'line', 'pie'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** Google's labels for the chart kinds (SPEC-2 4.1, insert.chart). */
export const CHART_KIND_LABELS: Readonly<Record<ChartKind, string>> = {
  bar: 'Bar',
  column: 'Column',
  line: 'Line',
  pie: 'Pie',
};

export const CHART_LEGENDS = ['none', 'right', 'bottom', 'top', 'left'] as const;
export type ChartLegend = (typeof CHART_LEGENDS)[number];

export const CHART_NUMBER_FORMATS = ['plain', 'thousands', 'percent', 'currency'] as const;
export type ChartNumberFormat = (typeof CHART_NUMBER_FORMATS)[number];

export const CHART_MAX_CATEGORIES = 12;
export const CHART_MAX_SERIES = 6;

/** The series colours when none is set, in series order (SPEC-2 2.8.1). */
export const CHART_SERIES_COLORS: ReadonlyArray<Color> = [
  'ink',
  'ink-2',
  'titanium',
  'plate',
  'blue',
  'green',
];

/** chart/size (SPEC-2 0.60): more categories than this in a chart narrower than the width, or more pie slices. */
export const CHART_LEGIBLE_CATEGORIES = 8;
export const CHART_LEGIBLE_WIDTH_PX = 960;

export type ChartSeries = { name: string; values: number[]; color?: Color };

/** The chart's own fields; BlockBase (id, ext, pos, link, alt) is added in blocks.ts. */
export type ChartFields = {
  type: 'chart';
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  title?: Text;
  legend?: ChartLegend;
  numberFormat?: ChartNumberFormat;
  /** Show the values on the bars, points or slices. */
  labels?: true;
  /** The chart's height in a flow layout; on a positioned block `pos.h` wins. */
  height?: number;
};

export type ChartBlock = ChartFields & { id: BlockId; ext?: Record<string, unknown> };

export const chartSeriesSchema = z.strictObject({
  name: annotate(z.string(), { label: 'Series name', control: 'text', group: 'Block' }),
  values: annotate(z.array(z.number()), {
    label: 'Values',
    control: 'json',
    group: 'Block',
    help: 'One number per category.',
  }),
  color: colorField(
    'Series color',
    'The bars, line or slices of the series; the palette order when absent.',
  ),
}) satisfies z.ZodType<ChartSeries>;

/** The fields of a chart block as a shape, spread into the block schema in blocks.ts. */
export const chartFieldsShape = {
  type: z.literal('chart'),
  kind: annotate(z.enum(CHART_KINDS), {
    label: 'Chart type',
    control: 'select',
    snap: CHART_KINDS,
    group: 'Block',
    help: 'Bar, Column, Line or Pie (gslides-parity SPEC-2 2.8.1); a pie keeps its first series.',
  }),
  categories: annotate(z.array(z.string()).min(1), {
    label: 'Categories',
    control: 'json',
    group: 'Block',
    help: `One label per category, ${CHART_MAX_CATEGORIES} at most.`,
  }),
  series: annotate(z.array(chartSeriesSchema).min(1), {
    label: 'Series',
    control: 'json',
    group: 'Block',
    help: `One entry per series with one value per category, ${CHART_MAX_SERIES} at most.`,
  }),
  title: annotate(textSchema.optional(), { label: 'Title', control: 'text', group: 'Text' }),
  legend: annotate(z.enum(CHART_LEGENDS).optional(), {
    label: 'Legend',
    control: 'select',
    snap: CHART_LEGENDS,
    group: 'Block',
    help: 'Where the legend sits; right when absent.',
  }),
  numberFormat: annotate(z.enum(CHART_NUMBER_FORMATS).optional(), {
    label: 'Number format',
    control: 'select',
    snap: CHART_NUMBER_FORMATS,
    group: 'Block',
    help: 'Plain, thousands separators, percent or currency on the axis and the values.',
  }),
  labels: annotate(z.literal(true).optional(), {
    label: 'Show values',
    control: 'toggle',
    group: 'Block',
  }),
  height: annotate(z.number().positive().optional(), {
    label: 'Height',
    control: 'number',
    group: 'Layout',
    help: 'The height in a flow layout; on a positioned block the position box decides.',
  }),
};

/**
 * Why a chart's data is refused, or null when it holds (SPEC-2 2.8.1): 1 to 12 categories, 1 to
 * 6 series, every series as long as the categories, a pie with one series. validate.ts reports
 * the first problem as `chart_size` at severity 3 with a pointer.
 */
export function chartProblem(
  chart: Pick<ChartFields, 'kind' | 'categories' | 'series'>,
): { pointer: string; message: string } | null {
  if (chart.categories.length > CHART_MAX_CATEGORIES) {
    return {
      pointer: '/categories',
      message: `A chart has at most ${CHART_MAX_CATEGORIES} categories, this one has ${chart.categories.length}`,
    };
  }
  if (chart.series.length > CHART_MAX_SERIES) {
    return {
      pointer: '/series',
      message: `A chart has at most ${CHART_MAX_SERIES} series, this one has ${chart.series.length}`,
    };
  }
  if (chart.kind === 'pie' && chart.series.length > 1) {
    return { pointer: '/series', message: 'A pie chart has one series' };
  }
  for (const [index, series] of chart.series.entries()) {
    if (series.values.length !== chart.categories.length) {
      return {
        pointer: `/series/${index}/values`,
        message: `Series ${index + 1} has ${series.values.length} value(s) for ${chart.categories.length} categor${chart.categories.length === 1 ? 'y' : 'ies'}; every series carries one value per category`,
      };
    }
  }
  return null;
}

/** Insert > Chart's placeholder data (SPEC-2 2.8.2): three categories, one series of 30, 45, 20. */
export function emptyChart(id: BlockId, kind: ChartKind): ChartBlock {
  return {
    id,
    type: 'chart',
    kind,
    categories: ['Category 1', 'Category 2', 'Category 3'],
    series: [{ name: 'Series 1', values: [30, 45, 20] }],
  };
}

/** The colour of a series: its own, else the palette order. */
export function chartSeriesColor(series: ChartSeries, index: number): Color {
  return series.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] ?? 'ink';
}

/** A value written in the chart's number format (the axis labels, the shown values, the text export). */
export function formatChartNumber(value: number, format: ChartNumberFormat | undefined): string {
  switch (format ?? 'plain') {
    case 'thousands':
      return value.toLocaleString('en-US');
    case 'percent':
      return `${value.toLocaleString('en-US')}%`;
    case 'currency':
      return `$${value.toLocaleString('en-US')}`;
    case 'plain':
    default:
      return String(value);
  }
}

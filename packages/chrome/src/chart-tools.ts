import type {
  ChartBlock,
  ChartKind,
  ChartLegend,
  ChartNumberFormat,
  ChartSeries,
} from '@turboslide/schema/blocks/chart';
import {
  CHART_KINDS,
  CHART_KIND_LABELS,
  CHART_LEGENDS,
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  CHART_NUMBER_FORMATS,
  chartSeriesColor,
  emptyChart,
} from '@turboslide/schema/blocks/chart';
import type { Color } from '@turboslide/schema/color';
import type { BlockId } from '@turboslide/schema/ids';

import { PANELS } from './menus/strings';

/**
 * The chart tools (gslides-parity SPEC-2 2.8, 4.2, section 5; R11 A10; R05 A7): pure plans from
 * a chart block and an edit to the inputs of `chart.setData`, `chart.setKind` and `block.set`.
 * The Chart data section's grid, the chart tail's dropdowns (Chart type, Legend, Number format),
 * the Insert > Chart rows and the context menu's Chart type submenu call these and dispatch what
 * comes back; every plan carries `blockId` and the fields, and the caller adds `slideId` and
 * `baseRevision` (`chartWriteInput`). Google edits a chart's numbers in a Sheet (R11 A10); the
 * grid here is the Turboslide replacement, so the words it uses are the panel's (`PANELS.chart`).
 * No React, no DOM.
 */

/** Insert > Chart's placeholder data (SPEC-2 2.8.2): three categories, one series of 30, 45, 20. */
export function chartPlaceholder(kind: ChartKind): Pick<ChartBlock, 'categories' | 'series'> {
  const { categories, series } = emptyChart('chart' as BlockId, kind);
  return { categories, series };
}

/** The whole block Insert > Chart inserts at an id: the placeholder data with the kind. */
export function chartBlockFor(id: BlockId, kind: ChartKind): ChartBlock {
  return emptyChart(id, kind);
}

export type ChartGridEdit =
  | { kind: 'cell'; row: number; column: number; value: number }
  | { kind: 'addSeries' }
  | { kind: 'addCategory' }
  | { kind: 'removeSeries'; index: number }
  | { kind: 'removeCategory'; index: number }
  | { kind: 'renameSeries'; index: number; name: string }
  | { kind: 'renameCategory'; index: number; name: string }
  | { kind: 'seriesColor'; index: number; color: Color }
  /** the whole grid at once: a paste from a spreadsheet */
  | { kind: 'replace'; categories: string[]; series: ChartSeries[] };

export type ChartDataPlan = { action: 'chart.setData'; input: Record<string, unknown> };
export type ChartKindPlan = {
  action: 'chart.setKind';
  input: Record<string, unknown>;
  dropped: string[];
};
export type ChartOptionPlan = { action: 'block.set'; input: Record<string, unknown> };

export const CHART_FULL_SERIES = `A chart has at most ${CHART_MAX_SERIES} series`;
export const CHART_FULL_CATEGORIES = `A chart has at most ${CHART_MAX_CATEGORIES} categories`;
export const CHART_LAST_SERIES = 'A chart keeps at least one series';
export const CHART_LAST_CATEGORY = 'A chart keeps at least one category';
export const CHART_PIE_ONE_SERIES = 'A pie chart has one series';

/** A series name free in the block: Series 1, Series 2, … */
export function nextSeriesName(series: ReadonlyArray<ChartSeries>): string {
  const taken = new Set(series.map((each) => each.name));
  for (let n = series.length + 1; ; n += 1) {
    const name = PANELS.chart.series(n);
    if (!taken.has(name)) return name;
  }
}

export function nextCategoryName(categories: ReadonlyArray<string>): string {
  const taken = new Set(categories);
  for (let n = categories.length + 1; ; n += 1) {
    const name = PANELS.chart.category(n);
    if (!taken.has(name)) return name;
  }
}

function copy(block: Pick<ChartBlock, 'categories' | 'series'>): {
  categories: string[];
  series: ChartSeries[];
} {
  return {
    categories: [...block.categories],
    series: block.series.map((each) => ({ ...each, values: [...each.values] })),
  };
}

/**
 * The `chart.setData` write one grid edit produces (SPEC-2 section 5, Chart data): a cell value, a
 * new or removed series or category, a rename, a series colour, or a whole replacement from a
 * paste. Refused with a RangeError at the caps of 2.8.1 (the grid disables its buttons there, so
 * the error is for a caller that skipped them).
 */
export function chartDataPlan(block: ChartBlock, edit: ChartGridEdit): ChartDataPlan {
  const next = copy(block);
  switch (edit.kind) {
    case 'cell': {
      const series = next.series[edit.column];
      if (series === undefined || edit.row < 0 || edit.row >= next.categories.length)
        throw new RangeError('The cell is outside the chart’s data');
      series.values[edit.row] = Number.isFinite(edit.value) ? edit.value : 0;
      break;
    }
    case 'addSeries': {
      if (next.series.length >= CHART_MAX_SERIES) throw new RangeError(CHART_FULL_SERIES);
      if (block.kind === 'pie') throw new RangeError(CHART_PIE_ONE_SERIES);
      next.series.push({ name: nextSeriesName(next.series), values: next.categories.map(() => 0) });
      break;
    }
    case 'addCategory': {
      if (next.categories.length >= CHART_MAX_CATEGORIES)
        throw new RangeError(CHART_FULL_CATEGORIES);
      next.categories.push(nextCategoryName(next.categories));
      for (const series of next.series) series.values.push(0);
      break;
    }
    case 'removeSeries': {
      if (next.series.length <= 1) throw new RangeError(CHART_LAST_SERIES);
      if (edit.index < 0 || edit.index >= next.series.length)
        throw new RangeError('No such series');
      next.series.splice(edit.index, 1);
      break;
    }
    case 'removeCategory': {
      if (next.categories.length <= 1) throw new RangeError(CHART_LAST_CATEGORY);
      if (edit.index < 0 || edit.index >= next.categories.length)
        throw new RangeError('No such category');
      next.categories.splice(edit.index, 1);
      for (const series of next.series) series.values.splice(edit.index, 1);
      break;
    }
    case 'renameSeries': {
      const series = next.series[edit.index];
      if (series === undefined) throw new RangeError('No such series');
      series.name =
        edit.name.trim() === '' ? PANELS.chart.series(edit.index + 1) : edit.name.trim();
      break;
    }
    case 'renameCategory': {
      if (edit.index < 0 || edit.index >= next.categories.length)
        throw new RangeError('No such category');
      next.categories[edit.index] =
        edit.name.trim() === '' ? PANELS.chart.category(edit.index + 1) : edit.name.trim();
      break;
    }
    case 'seriesColor': {
      const series = next.series[edit.index];
      if (series === undefined) throw new RangeError('No such series');
      series.color = edit.color;
      break;
    }
    case 'replace': {
      if (edit.categories.length < 1 || edit.categories.length > CHART_MAX_CATEGORIES)
        throw new RangeError(CHART_FULL_CATEGORIES);
      if (edit.series.length < 1 || edit.series.length > CHART_MAX_SERIES)
        throw new RangeError(CHART_FULL_SERIES);
      next.categories = [...edit.categories];
      next.series = edit.series.map((each, index) => ({
        name: each.name.trim() === '' ? PANELS.chart.series(index + 1) : each.name,
        values: edit.categories.map((_category, row) => {
          const value = each.values[row];
          return typeof value === 'number' && Number.isFinite(value) ? value : 0;
        }),
        /* a pasted series keeps the colour the block had at its place */
        ...(block.series[index]?.color === undefined ? {} : { color: block.series[index]?.color }),
      }));
      break;
    }
  }
  return {
    action: 'chart.setData',
    input: { blockId: block.id, categories: next.categories, series: next.series },
  };
}

/**
 * The `chart.setKind` write of a kind change: pie keeps the first series and the plan names the
 * dropped ones so the caller can say so (the store action drops them in the same write).
 */
export function chartKindPlan(block: ChartBlock, kind: ChartKind): ChartKindPlan {
  const dropped =
    kind === 'pie' && block.series.length > 1 ? block.series.slice(1).map((each) => each.name) : [];
  return { action: 'chart.setKind', input: { blockId: block.id, kind }, dropped };
}

/** The sentence the snackbar reads after a kind change dropped series, or null. */
export function droppedNote(plan: ChartKindPlan): string | null {
  if (plan.dropped.length === 0) return null;
  const names = plan.dropped.join(', ');
  return plan.dropped.length === 1
    ? `The pie chart keeps its first series; ${names} was left out`
    : `The pie chart keeps its first series; ${names} were left out`;
}

export type ChartOptionField = 'legend' | 'numberFormat' | 'labels' | 'title';

/**
 * A `block.set` of one chart option: the legend position, the number format, Show values or the
 * title. The default of a field (right, plain, off, no title) removes it, so a chart with
 * defaults stores nothing for them.
 */
export function chartOptionPlan(
  block: ChartBlock,
  field: ChartOptionField,
  value: unknown,
): ChartOptionPlan {
  const path = `/${field}`;
  let stored: unknown;
  switch (field) {
    case 'legend': {
      const legend = value as ChartLegend | undefined;
      stored = legend === undefined || legend === 'right' ? undefined : legend;
      break;
    }
    case 'numberFormat': {
      const format = value as ChartNumberFormat | undefined;
      stored = format === undefined || format === 'plain' ? undefined : format;
      break;
    }
    case 'labels':
      stored = value === true ? true : undefined;
      break;
    case 'title': {
      const text = typeof value === 'string' ? value.trim() : '';
      stored = text === '' ? undefined : text;
      break;
    }
  }
  return {
    action: 'block.set',
    input: { blockId: block.id, path, ...(stored === undefined ? {} : { value: stored }) },
  };
}

/** The full input of a chart plan: the plan's fields with the slide and the revision the caller read. */
export function chartWriteInput(
  plan: { input: Record<string, unknown> },
  slideId: string,
  revision: number,
): Record<string, unknown> {
  return { slideId, ...plan.input, baseRevision: revision };
}

// ---------------------------------------------------------------------------------------------
// The tail's dropdowns and the panel's selects: options with Google words

export const CHART_LEGEND_LABELS: Readonly<Record<ChartLegend, string>> = {
  none: 'None',
  right: 'Right',
  bottom: 'Bottom',
  top: 'Top',
  left: 'Left',
};

export const CHART_NUMBER_FORMAT_LABELS: Readonly<Record<ChartNumberFormat, string>> = {
  plain: 'Plain',
  thousands: 'Thousands',
  percent: 'Percent',
  currency: 'Currency',
};

export type ChartTailOp = 'chartType' | 'legend' | 'numberFormat';

export type ChartTailOption = {
  id: string;
  label: string;
  value: string;
  checked: boolean;
  doc?: string;
};

/** The rows of a chart tail dropdown (SPEC-2 4.2), the current one checked. */
export function chartTailOptions(block: ChartBlock, op: ChartTailOp): ChartTailOption[] {
  switch (op) {
    case 'chartType':
      return CHART_KINDS.map((kind) => ({
        id: `chart-${kind}`,
        label: CHART_KIND_LABELS[kind],
        value: kind,
        checked: block.kind === kind,
        ...(kind === 'pie' && block.series.length > 1 ? { doc: 'Keeps the first series' } : {}),
      }));
    case 'legend':
      return CHART_LEGENDS.map((legend) => ({
        id: `legend-${legend}`,
        label: CHART_LEGEND_LABELS[legend],
        value: legend,
        checked: (block.legend ?? 'right') === legend,
      }));
    case 'numberFormat':
      return CHART_NUMBER_FORMATS.map((format) => ({
        id: `format-${format}`,
        label: CHART_NUMBER_FORMAT_LABELS[format],
        value: format,
        checked: (block.numberFormat ?? 'plain') === format,
      }));
  }
}

/** The plan a chart tail dropdown pick makes: a kind change, else a block.set of the option. */
export function chartTailPlan(
  block: ChartBlock,
  op: ChartTailOp,
  value: string,
): ChartKindPlan | ChartOptionPlan {
  switch (op) {
    case 'chartType':
      return chartKindPlan(block, value as ChartKind);
    case 'legend':
      return chartOptionPlan(block, 'legend', value);
    case 'numberFormat':
      return chartOptionPlan(block, 'numberFormat', value);
  }
}

// ---------------------------------------------------------------------------------------------
// Paste from a spreadsheet

/** A number as a spreadsheet writes it: thousands separators, a currency sign, a percent sign, parentheses for negatives. */
export function parseChartNumber(raw: string): number | null {
  let text = raw.trim();
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[$€£¥%\s,]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(text) && !/^\d+\.?\d*$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Tab or comma separated rows from a spreadsheet as chart data: the first column holds the
 * categories and every other column a series; a first row whose cells past the first are not
 * numbers is the header with the series names. Returns null when nothing numeric was found.
 */
export function parseChartPaste(
  text: string,
): { categories: string[]; series: ChartSeries[] } | null {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;
  const separator = lines.some((line) => line.includes('\t')) ? '\t' : ',';
  const rows = lines.map((line) =>
    line.split(separator).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1')),
  );
  const width = Math.max(...rows.map((row) => row.length));
  if (width < 2) return null;
  const first = rows[0] ?? [];
  const firstIsHeader = first
    .slice(1)
    .some((cell) => cell !== '' && parseChartNumber(cell) === null);
  const header = firstIsHeader ? first : null;
  const body = firstIsHeader ? rows.slice(1) : rows;
  if (body.length === 0) return null;
  const categories = body.map(
    (row, index) => (row[0] ?? '').trim() || PANELS.chart.category(index + 1),
  );
  const series: ChartSeries[] = [];
  for (let column = 1; column < width; column += 1) {
    const values = body.map((row) => parseChartNumber(row[column] ?? '') ?? 0);
    const name = (header?.[column] ?? '').trim() || PANELS.chart.series(column);
    series.push({ name, values });
  }
  const numeric = body.some((row) => row.slice(1).some((cell) => parseChartNumber(cell) !== null));
  if (!numeric) return null;
  return {
    categories: categories.slice(0, CHART_MAX_CATEGORIES),
    series: series.slice(0, CHART_MAX_SERIES).map((each) => ({
      ...each,
      values: each.values.slice(0, CHART_MAX_CATEGORIES),
    })),
  };
}

/** The colour swatch a series header shows: its own, else the palette order (SPEC-2 2.8.1). */
export function seriesSwatch(series: ChartSeries, index: number): Color {
  return chartSeriesColor(series, index);
}

/** The chart's data as the tab separated rows the TXT export and the clipboard carry. */
export function chartDataText(block: Pick<ChartBlock, 'categories' | 'series'>): string {
  const rows = [['', ...block.categories].join('\t')];
  for (const series of block.series)
    rows.push([series.name, ...series.values.map(String)].join('\t'));
  return rows.join('\n');
}

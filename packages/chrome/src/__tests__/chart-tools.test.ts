import { describe, expect, it } from 'vitest';

import type { ChartBlock } from '@turboslide/schema/blocks/chart';
import {
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  chartProblem,
} from '@turboslide/schema/blocks/chart';

import {
  CHART_FULL_CATEGORIES,
  CHART_FULL_SERIES,
  CHART_LAST_CATEGORY,
  CHART_LAST_SERIES,
  CHART_PIE_ONE_SERIES,
  chartBlockFor,
  chartDataPlan,
  chartDataText,
  chartKindPlan,
  chartOptionPlan,
  chartPlaceholder,
  chartTailOptions,
  chartTailPlan,
  chartWriteInput,
  droppedNote,
  parseChartNumber,
  parseChartPaste,
} from '../chart-tools';

// The chart tool plans (gslides-parity SPEC-2 2.8, section 3, section 5, 11.5 chart-grid): the
// placeholder data of Insert > Chart; every grid edit as one chart.setData that passes the block's
// own caps; the kind change naming the dropped series; the option writes storing nothing for a
// default; the tail dropdown rows; a spreadsheet paste as categories and series.

function chart(): ChartBlock {
  return {
    id: 'c',
    type: 'chart',
    kind: 'column',
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'Docs', values: [10, 20, 30], color: 'blue' },
      { name: 'App', values: [5, 6, 7] },
    ],
    legend: 'bottom',
  };
}

describe('chartPlaceholder', () => {
  it('is Insert > Chart’s sample data: three categories, one series of 30, 45, 20', () => {
    expect(chartPlaceholder('bar')).toEqual({
      categories: ['Category 1', 'Category 2', 'Category 3'],
      series: [{ name: 'Series 1', values: [30, 45, 20] }],
    });
    const block = chartBlockFor('chart', 'pie');
    expect(block).toMatchObject({ id: 'chart', type: 'chart', kind: 'pie' });
    expect(chartProblem(block)).toBeNull();
  });
});

describe('chartDataPlan', () => {
  it('writes one cell', () => {
    const plan = chartDataPlan(chart(), { kind: 'cell', row: 1, column: 1, value: 60 });
    expect(plan.action).toBe('chart.setData');
    expect(plan.input).toEqual({
      blockId: 'c',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [
        { name: 'Docs', values: [10, 20, 30], color: 'blue' },
        { name: 'App', values: [5, 60, 7] },
      ],
    });
    expect(chartWriteInput(plan, 's', 3)).toMatchObject({
      slideId: 's',
      blockId: 'c',
      baseRevision: 3,
    });
  });

  it('adds a series of zeros with the next free name and a category of zeros', () => {
    const withSeries = chartDataPlan(chart(), { kind: 'addSeries' });
    expect((withSeries.input.series as unknown[]).length).toBe(3);
    expect((withSeries.input.series as { name: string; values: number[] }[])[2]).toEqual({
      name: 'Series 3',
      values: [0, 0, 0],
    });
    const withCategory = chartDataPlan(chart(), { kind: 'addCategory' });
    expect(withCategory.input.categories).toEqual(['Q1', 'Q2', 'Q3', 'Category 4']);
    for (const series of withCategory.input.series as { values: number[] }[])
      expect(series.values).toHaveLength(4);
  });

  it('removes a series or a category and keeps the last one', () => {
    const one = chartDataPlan(chart(), { kind: 'removeSeries', index: 0 });
    expect(one.input.series).toEqual([{ name: 'App', values: [5, 6, 7] }]);
    const fewer = chartDataPlan(chart(), { kind: 'removeCategory', index: 2 });
    expect(fewer.input.categories).toEqual(['Q1', 'Q2']);
    expect((fewer.input.series as { values: number[] }[])[0]?.values).toEqual([10, 20]);
    const single: ChartBlock = {
      ...chart(),
      categories: ['Q1'],
      series: [{ name: 'A', values: [1] }],
    };
    expect(() => chartDataPlan(single, { kind: 'removeSeries', index: 0 })).toThrow(
      CHART_LAST_SERIES,
    );
    expect(() => chartDataPlan(single, { kind: 'removeCategory', index: 0 })).toThrow(
      CHART_LAST_CATEGORY,
    );
  });

  it('renames a series or a category and falls back to the numbered name for an empty one', () => {
    expect(
      (
        chartDataPlan(chart(), { kind: 'renameSeries', index: 1, name: ' Mobile ' }).input
          .series as { name: string }[]
      )[1]?.name,
    ).toBe('Mobile');
    expect(
      chartDataPlan(chart(), { kind: 'renameCategory', index: 0, name: '' }).input.categories,
    ).toEqual(['Category 1', 'Q2', 'Q3']);
  });

  it('sets a series colour', () => {
    const plan = chartDataPlan(chart(), { kind: 'seriesColor', index: 1, color: 'green' });
    expect((plan.input.series as { color?: string }[])[1]?.color).toBe('green');
  });

  it('refuses at the caps of 2.8.1 with the sentences the grid shows', () => {
    const wide: ChartBlock = {
      ...chart(),
      series: Array.from({ length: CHART_MAX_SERIES }, (_, index) => ({
        name: `S${index}`,
        values: [1, 2, 3],
      })),
    };
    expect(() => chartDataPlan(wide, { kind: 'addSeries' })).toThrow(CHART_FULL_SERIES);
    const long: ChartBlock = {
      ...chart(),
      categories: Array.from({ length: CHART_MAX_CATEGORIES }, (_, index) => `C${index}`),
      series: [{ name: 'A', values: Array.from({ length: CHART_MAX_CATEGORIES }, () => 1) }],
    };
    expect(() => chartDataPlan(long, { kind: 'addCategory' })).toThrow(CHART_FULL_CATEGORIES);
    const pie: ChartBlock = { ...chart(), kind: 'pie', series: [{ name: 'A', values: [1, 2, 3] }] };
    expect(() => chartDataPlan(pie, { kind: 'addSeries' })).toThrow(CHART_PIE_ONE_SERIES);
  });

  it('every edit leaves data the block’s own check accepts', () => {
    const block = chart();
    const edits = [
      { kind: 'cell', row: 0, column: 0, value: 1 },
      { kind: 'addSeries' },
      { kind: 'addCategory' },
      { kind: 'removeSeries', index: 1 },
      { kind: 'removeCategory', index: 0 },
      { kind: 'renameSeries', index: 0, name: 'x' },
      { kind: 'renameCategory', index: 0, name: 'y' },
      { kind: 'seriesColor', index: 0, color: 'red' },
    ] as const;
    for (const edit of edits) {
      const plan = chartDataPlan(block, edit);
      expect(
        chartProblem({
          kind: block.kind,
          categories: plan.input.categories as string[],
          series: plan.input.series as ChartBlock['series'],
        }),
      ).toBeNull();
    }
  });
});

describe('chartKindPlan', () => {
  it('names the dropped series of a pie and nothing otherwise', () => {
    const pie = chartKindPlan(chart(), 'pie');
    expect(pie).toEqual({
      action: 'chart.setKind',
      input: { blockId: 'c', kind: 'pie' },
      dropped: ['App'],
    });
    expect(droppedNote(pie)).toBe('The pie chart keeps its first series; App was left out');
    const line = chartKindPlan(chart(), 'line');
    expect(line.dropped).toEqual([]);
    expect(droppedNote(line)).toBeNull();
    const many: ChartBlock = {
      ...chart(),
      series: [...chart().series, { name: 'Web', values: [1, 1, 1] }],
    };
    expect(droppedNote(chartKindPlan(many, 'pie'))).toBe(
      'The pie chart keeps its first series; App, Web were left out',
    );
  });
});

describe('chartOptionPlan', () => {
  it('stores nothing for a default and the value otherwise', () => {
    expect(chartOptionPlan(chart(), 'legend', 'right')).toEqual({
      action: 'block.set',
      input: { blockId: 'c', path: '/legend' },
    });
    expect(chartOptionPlan(chart(), 'legend', 'left').input).toEqual({
      blockId: 'c',
      path: '/legend',
      value: 'left',
    });
    expect(chartOptionPlan(chart(), 'numberFormat', 'plain').input).toEqual({
      blockId: 'c',
      path: '/numberFormat',
    });
    expect(chartOptionPlan(chart(), 'numberFormat', 'percent').input.value).toBe('percent');
    expect(chartOptionPlan(chart(), 'labels', true).input.value).toBe(true);
    expect(chartOptionPlan(chart(), 'labels', false).input).toEqual({
      blockId: 'c',
      path: '/labels',
    });
    expect(chartOptionPlan(chart(), 'title', '  Revenue ').input.value).toBe('Revenue');
    expect(chartOptionPlan(chart(), 'title', '  ').input).toEqual({ blockId: 'c', path: '/title' });
  });
});

describe('the chart tail', () => {
  it('lists Google words with the current one checked and plans the pick', () => {
    expect(chartTailOptions(chart(), 'chartType').map((option) => option.label)).toEqual([
      'Bar',
      'Column',
      'Line',
      'Pie',
    ]);
    expect(chartTailOptions(chart(), 'chartType').find((option) => option.checked)?.value).toBe(
      'column',
    );
    expect(
      chartTailOptions(chart(), 'chartType').find((option) => option.value === 'pie')?.doc,
    ).toBe('Keeps the first series');
    expect(chartTailOptions(chart(), 'legend').map((option) => option.label)).toEqual([
      'None',
      'Right',
      'Bottom',
      'Top',
      'Left',
    ]);
    expect(chartTailOptions(chart(), 'legend').find((option) => option.checked)?.value).toBe(
      'bottom',
    );
    expect(chartTailOptions(chart(), 'numberFormat').map((option) => option.label)).toEqual([
      'Plain',
      'Thousands',
      'Percent',
      'Currency',
    ]);
    expect(chartTailOptions(chart(), 'numberFormat').find((option) => option.checked)?.value).toBe(
      'plain',
    );
    expect(chartTailPlan(chart(), 'chartType', 'pie').action).toBe('chart.setKind');
    expect(chartTailPlan(chart(), 'legend', 'none')).toEqual({
      action: 'block.set',
      input: { blockId: 'c', path: '/legend', value: 'none' },
    });
    expect(chartTailPlan(chart(), 'numberFormat', 'currency').input.value).toBe('currency');
  });
});

describe('parseChartPaste', () => {
  it('reads tab separated rows with a header as categories and named series', () => {
    const pasted = parseChartPaste(
      '\tDocs\tApp\nJan\t1,200\t800\nFeb\t$1,350\t860\nMar\t1480\t(900)\n',
    );
    expect(pasted).toEqual({
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'Docs', values: [1200, 1350, 1480] },
        { name: 'App', values: [800, 860, -900] },
      ],
    });
  });

  it('reads comma separated rows without a header, naming the series', () => {
    expect(parseChartPaste('North,10,20\nSouth,30,40')).toEqual({
      categories: ['North', 'South'],
      series: [
        { name: 'Series 1', values: [10, 30] },
        { name: 'Series 2', values: [20, 40] },
      ],
    });
  });

  it('returns null for text with no numbers and caps the size', () => {
    expect(parseChartPaste('hello world')).toBeNull();
    expect(parseChartPaste('a\tb\nc\td')).toBeNull();
    expect(parseChartPaste('')).toBeNull();
    const rows = Array.from({ length: 20 }, (_, index) => `C${index}\t${index}`).join('\n');
    expect(parseChartPaste(rows)?.categories).toHaveLength(CHART_MAX_CATEGORIES);
  });

  it('a paste replaces the data as one chart.setData keeping the series colours in place', () => {
    const pasted = parseChartPaste('\tA\tB\nx\t1\t2\ny\t3\t4');
    const plan = chartDataPlan(chart(), { kind: 'replace', ...pasted! });
    expect(plan.input.categories).toEqual(['x', 'y']);
    expect(plan.input.series).toEqual([
      { name: 'A', values: [1, 3], color: 'blue' },
      { name: 'B', values: [2, 4] },
    ]);
  });

  it('parses the numbers a spreadsheet writes', () => {
    expect(parseChartNumber('1,234.5')).toBe(1234.5);
    expect(parseChartNumber('45%')).toBe(45);
    expect(parseChartNumber('$ 12')).toBe(12);
    expect(parseChartNumber('(7)')).toBe(-7);
    expect(parseChartNumber('-3')).toBe(-3);
    expect(parseChartNumber('n/a')).toBeNull();
    expect(parseChartNumber('')).toBeNull();
  });

  it('writes the data back as tab separated rows for the clipboard', () => {
    expect(chartDataText(chart())).toBe('\tQ1\tQ2\tQ3\nDocs\t10\t20\t30\nApp\t5\t6\t7');
  });
});

// The chart block (gslides-parity SPEC-2 2.8.1, 11.5 blocks/chart.test.ts): the caps (12
// categories, 6 series), a ragged series refused, a pie keeping one series, the placeholder data
// of Insert > Chart, the catalog entry and the validator's chart_size issue.
import { describe, expect, it } from 'vitest';

import { CATALOG, blockTextPaths } from '../catalog.ts';
import type { ContentSlide } from '../deck.ts';
import { chartBlockSchema } from '../blocks.ts';
import { validateSlide } from '../validate.ts';
import {
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  CHART_SERIES_COLORS,
  chartProblem,
  chartSeriesColor,
  emptyChart,
  formatChartNumber,
} from './chart.ts';
import type { ChartBlock } from './chart.ts';

function slideWith(chart: ChartBlock): ContentSlide {
  return {
    schemaVersion: 1,
    id: 'charts',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main: [{ ...chart, pos: { x: 320, y: 180, w: 960, h: 540, z: 0 } }] },
  };
}

describe('the chart block', () => {
  it('has the placeholder data of Insert > Chart and a catalog entry with the title as its Text', () => {
    const chart = emptyChart('chart', 'bar');
    expect(chart).toEqual({
      id: 'chart',
      type: 'chart',
      kind: 'bar',
      categories: ['Category 1', 'Category 2', 'Category 3'],
      series: [{ name: 'Series 1', values: [30, 45, 20] }],
    });
    expect(chartBlockSchema.safeParse(chart).success).toBe(true);
    expect(CATALOG.chart.export).toBe('native');
    expect(CATALOG.chart.allowedIn).toEqual(['content']);
    expect(blockTextPaths({ ...chart, title: 'Revenue' })).toEqual(['/title']);
    expect(validateSlide(slideWith(chart)).issues).toEqual([]);
  });

  it('refuses the caps, a ragged series and a pie with several series with the chart_size code', () => {
    const many = emptyChart('chart', 'column');
    many.categories = Array.from({ length: CHART_MAX_CATEGORIES + 1 }, (_c, i) => `C${i}`);
    many.series = [{ name: 'S', values: many.categories.map((_c, i) => i) }];
    expect(chartProblem(many)?.pointer).toBe('/categories');
    expect(validateSlide(slideWith(many)).issues).toContainEqual(
      expect.objectContaining({
        code: 'chart_size',
        severity: 3,
        pointer: '/slots/main/0/categories',
      }),
    );
    const series = emptyChart('chart', 'line');
    series.series = Array.from({ length: CHART_MAX_SERIES + 1 }, (_s, i) => ({
      name: `S${i}`,
      values: [1, 2, 3],
    }));
    expect(chartProblem(series)?.pointer).toBe('/series');
    const ragged = emptyChart('chart', 'bar');
    ragged.series = [{ name: 'S', values: [1, 2] }];
    expect(chartProblem(ragged)?.pointer).toBe('/series/0/values');
    expect(chartProblem(ragged)?.message).toMatch(/one value per category/);
    const pie = emptyChart('chart', 'pie');
    pie.series = [
      { name: 'A', values: [1, 2, 3] },
      { name: 'B', values: [1, 2, 3] },
    ];
    expect(chartProblem(pie)?.message).toBe('A pie chart has one series');
    pie.series = pie.series.slice(0, 1);
    expect(chartProblem(pie)).toBeNull();
  });

  it('colours series in the palette order and formats numbers per format', () => {
    expect(chartSeriesColor({ name: 'S', values: [] }, 0)).toBe('ink');
    expect(chartSeriesColor({ name: 'S', values: [] }, 1)).toBe('ink-2');
    expect(chartSeriesColor({ name: 'S', values: [], color: 'green' }, 1)).toBe('green');
    expect(chartSeriesColor({ name: 'S', values: [] }, CHART_SERIES_COLORS.length)).toBe('ink');
    expect(formatChartNumber(1234.5, undefined)).toBe('1234.5');
    expect(formatChartNumber(1234.5, 'thousands')).toBe('1,234.5');
    expect(formatChartNumber(42, 'percent')).toBe('42%');
    expect(formatChartNumber(42, 'currency')).toBe('$42');
  });
});

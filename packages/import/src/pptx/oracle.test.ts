// The python-pptx oracle (gslides-parity SPEC-5 5.4; R04 10 test 5): `scripts/pptx-oracle.py`
// reads fixtures 01 to 04 with an independent library and this test compares its counts with the
// reader's: the shapes per slide (the exporter's chrome left out by the same name rule), the merge
// origins of every table, the chart categories and values, the media count. Skipped with a notice
// when the fonts venv is absent (`.turboslide/venv/bin/python`); the check chain never installs it.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureBytes, FIXTURES } from './__tests__/unzip.ts';
import { importPptxBytes } from './read.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const PYTHON = join(ROOT, '.turboslide', 'venv', 'bin', 'python');
const ORACLE = join(ROOT, 'scripts', 'pptx-oracle.py');
const NAMES = ['01-text', '02-shapes', '03-pictures-tables', '04-charts-motion-media'] as const;

type OracleSlide = {
  index: number;
  shapes: number;
  hidden: number;
  tables: { rows: number; columns: number; merges: number }[];
  charts: {
    categories: string[];
    series: { name: string; values: (number | null)[] }[];
    plots: number;
  }[];
  pictures: number;
  media: number;
};
type Oracle = { size: { cx: number; cy: number }; slides: OracleSlide[] };

const venv = existsSync(PYTHON);
if (!venv) {
  // eslint-disable-next-line no-console
  console.warn(
    'pptx-oracle: the fonts venv is absent (.turboslide/venv); the oracle comparison is skipped',
  );
}

function oracle(name: string): Oracle {
  const run = spawnSync(PYTHON, [ORACLE, join(FIXTURES, `${name}.pptx`)], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (run.status !== 0) throw new Error(`pptx-oracle.py failed: ${run.stderr}`);
  return JSON.parse(run.stdout) as Oracle;
}

describe.skipIf(!venv)('the python-pptx oracle agrees with the reader', () => {
  it.each(NAMES)('%s: shapes per slide, merges, chart values, media', async (name) => {
    const facts = oracle(name);
    const document = await importPptxBytes(fixtureBytes(`${name}.pptx`), {
      fileName: `${name}.pptx`,
      now: () => 'x',
    });
    expect(document.report.source.slides).toBe(facts.slides.length);
    expect({
      width: Math.round(facts.size.cx / 7620),
      height: Math.round(facts.size.cy / 7620),
    }).toEqual(document.report.source.page);
    const totalShapes = facts.slides.reduce((sum, slide) => sum + slide.shapes, 0);
    expect(document.shapeCount).toBe(totalShapes);
    for (const slide of facts.slides) {
      const ours = document.slides[slide.index - 1];
      const blocks = ours?.kind === 'content' ? (ours.slots.main ?? []) : [];
      const singles = await importPptxBytes(fixtureBytes(`${name}.pptx`), {
        fileName: `${name}.pptx`,
        now: () => 'x',
        slideIndexes: [slide.index],
      });
      expect(singles.shapeCount, `slide ${slide.index} shape count`).toBe(slide.shapes);
      const tables = blocks.filter((block) => block.type === 'table');
      expect(tables.length, `slide ${slide.index} tables`).toBe(slide.tables.length);
      for (const [i, table] of slide.tables.entries()) {
        const ours2 = tables[i];
        if (ours2?.type !== 'table') continue;
        expect(ours2.rows.length).toBe(Math.min(20, table.rows));
        expect(ours2.columns.length).toBe(Math.min(20, table.columns));
        expect((ours2.spans ?? []).length).toBe(table.merges);
      }
      const charts = blocks.filter((block) => block.type === 'chart');
      const readable = slide.charts.filter((chart) => chart.series.length > 0);
      expect(charts.length, `slide ${slide.index} charts`).toBe(readable.length);
      for (const [i, chart] of readable.entries()) {
        const ours2 = charts[i];
        if (ours2?.type !== 'chart') continue;
        const categories = chart.categories.slice(0, 12);
        expect(ours2.categories).toEqual(categories);
        const series = chart.series.slice(0, ours2.kind === 'pie' ? 1 : 6);
        expect(ours2.series.map((s) => s.values)).toEqual(
          series.map((s) =>
            s.values.slice(0, 12).map((v) => (v === null ? 0 : Math.round(v * 1000) / 1000)),
          ),
        );
      }
      const media = blocks.filter((block) => block.type === 'media');
      expect(media.length, `slide ${slide.index} media`).toBe(slide.media);
    }
  });
});

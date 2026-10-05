// The brand area's kit colour row (the Round 1 follow-up, lane D; verify-r1.md finding 1): the
// row read the table and the chart the tables and charts areas had left in the walk's deck, so a
// walk without those areas read "no table from the tables area to read" and never reached a plate.
// It now makes its own through the Insert menu when the deck holds neither; these tests pin that
// the step no longer depends on the other areas and checks that the blocks it reuses are held.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('./areas/brand.mjs', import.meta.url), 'utf8');

/** The text from the last place of one marker to the next place of another. */
function between(from, to) {
  const start = SOURCE.lastIndexOf(from);
  expect(start, from).toBeGreaterThan(0);
  const end = SOURCE.indexOf(to, start + from.length);
  return SOURCE.slice(start, end === -1 ? SOURCE.length : end);
}

describe('brand.objects.kit-colours-first', () => {
  it('makes its own table and chart instead of reading red without the other areas', () => {
    const step = between("'brand.objects.kit-colours-first',\n", '\n  );\n}');
    expect(step).not.toContain("observed: 'no table from the tables area to read'");
    expect(step).toContain('await ownTableAndChart()');
    expect(step).toContain('own.chartSlide');
  });

  it('reuses the other areas’ blocks only while the deck holds them', () => {
    const helper = between('const ownTableAndChart = async () => {', '\n  };\n');
    expect(helper).toMatch(/order\.includes\(slide\)/);
    expect(helper).toMatch(/t\.blockOf\(slide, id\)/);
    expect(helper).toContain("t.menuPath('insert', 'insert.chart', 'insert.chart.bar')");
    expect(helper).toContain('insert.table.pick.4x3');
  });
});

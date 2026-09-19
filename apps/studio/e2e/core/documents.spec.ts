import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  coverage,
  ctl,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  ownerContext,
  placeBlock,
  selectBlock,
  settled,
  state,
  teardownAll,
  title,
} from './lib';

// The documents, the spec rows (docs/RETURN.md 2.5, section 5 `charts.data.paste-rows` with the
// driver core/documents.spec.ts): the clipboard paste of tab separated rows into the chart's data
// grid, which the walk probe cannot drive in one tab (a paste event the grid handles,
// inspector/chart.tsx `onPaste`). The chart is placed through the window API as a setup write;
// the paste goes through the product's own grid. One context for the file; the deck is torn down
// through the product at the end.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/documents.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Documents spec deck');
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

/** Turns Tools > Advanced tools on when the chart's tail is still parked on this build. */
async function reachChartTail(p: Page): Promise<boolean> {
  if ((await ctl(p, 'toolbar.editData').count()) > 0) return false;
  await menuPath(p, 'tools', 'tools.advancedTools');
  await expect
    .poll(async () => (await state(p)).settings?.['advancedTools'] === true, { timeout: 5000 })
    .toBe(true);
  return true;
}

test(title('charts.data.paste-rows'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  /* the chart as a setup write, the matrix's convention; the paste is the driven step */
  await placeBlock(page, slideId, {
    id: 'paste-chart',
    type: 'chart',
    kind: 'bar',
    categories: ['Category 1', 'Category 2', 'Category 3'],
    series: [{ name: 'Series 1', values: [30, 45, 20] }],
    pos: { x: 320, y: 180, w: 960, h: 540 },
  });
  await selectBlock(page, 'paste-chart');
  const switched = await reachChartTail(page);
  await selectBlock(page, 'paste-chart');
  /* Edit data opens Format options at the Chart data grid */
  await ctl(page, 'toolbar.editData').click();
  await ctl(page, 'formatOptions.chart.grid').waitFor({ timeout: 8000 });
  const grid = ctl(page, 'formatOptions.chart.grid');
  await grid.scrollIntoViewIfNeeded();
  const chartOf = async () =>
    (await objectsOf(page, slideId)).find((o) => o.id === 'paste-chart')?.block as
      { categories: string[]; series: { name: string; values: number[] }[] } | undefined;
  const svgBars = () =>
    page.evaluate(() =>
      [
        ...(document
          .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-block="paste-chart"]')
          ?.querySelectorAll('.series rect') ?? []),
      ].map((r) => Number(r.getAttribute('width'))),
    );
  const before = await chartOf();
  const barsBefore = await svgBars();
  /* the paste event on the grid, the way a spreadsheet's rows arrive: a header row of series
     names and one row per category, tab separated */
  const rows = ['\tNorth\tSouth', 'Q1\t12\t7', 'Q2\t18\t9', 'Q3\t25\t11', 'Q4\t30\t14'].join('\n');
  await ctl(page, 'formatOptions.chart.cell.1.1').click();
  await page.evaluate(
    ([text]) => {
      const grid = document.querySelector('[data-control="formatOptions.chart.grid"]');
      const data = new DataTransfer();
      data.setData('text/plain', text!);
      const event = new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement ?? grid)?.dispatchEvent(event);
    },
    [rows] as const,
  );
  await expect
    .poll(async () => (await chartOf())?.categories.length ?? 0, { timeout: 10_000 })
    .toBe(4);
  await settled(page);
  const after = await chartOf();
  expect(after?.categories, 'the categories are the pasted rows').toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  expect(
    after?.series.map((s) => s.name),
    'the series are the pasted columns',
  ).toEqual(['North', 'South']);
  expect(after?.series.map((s) => s.values)).toEqual([
    [12, 18, 25, 30],
    [7, 9, 11, 14],
  ]);
  await expect
    .poll(svgBars, { timeout: 8000, message: 'the chart redraws with the pasted data' })
    .toHaveLength(8);
  expect(JSON.stringify(await svgBars())).not.toBe(JSON.stringify(barsBefore));
  test.info().annotations.push({
    type: 'route',
    description: `${switched ? 'Tools > Advanced tools turned on for the parked chart tail; ' : ''}before ${JSON.stringify(before?.categories)} ${JSON.stringify(before?.series.map((s) => s.values))}`,
  });
  if (switched) await menuPath(page, 'tools', 'tools.advancedTools');
});

coverage(import.meta.filename, ['charts.data.paste-rows']);

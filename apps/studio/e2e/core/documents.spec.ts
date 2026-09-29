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
  snackbarText,
  typeInto,
  runsOfBlock,
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

/** The tab separated rows of docs/FEATURES.md 2.3 item 5: a header row and two rows of numbers. */
const TSV = ['Region\tQ1\tQ2', 'East\t120\t140', 'West\t80\t95'].join('\n');
/** Dispatches a paste of text on the element in focus (or the stage), the clipboard event built in the page. */
async function pasteText(p: Page, text: string): Promise<void> {
  await p.evaluate((value) => {
    const target =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.querySelector('.ts-stagewrap.ts-editor');
    if (!target) throw new Error('nothing to paste on');
    const data = new DataTransfer();
    data.setData('text/plain', value);
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}
type TableBlock = { columns: unknown[]; rows: { cells: unknown[]; header?: boolean }[] };
const cellText = (cell: unknown): string =>
  typeof cell === 'string' ? cell : ((cell as { text?: string } | null)?.text ?? '');

test(title('tables.paste.tsv-makes-table'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  /* the stage takes the focus so the paste reaches the editor with nothing selected */
  await page
    .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  const before = await objectsOf(page, slideId);
  const rev0 = (await state(page)).revision;
  await pasteText(page, TSV);
  const fresh = await expect
    .poll(
      async () =>
        (await objectsOf(page, slideId)).filter((o) => !before.some((b) => b.id === o.id)),
      { timeout: 8000 },
    )
    .not.toEqual([])
    .then(async () =>
      (await objectsOf(page, slideId)).filter((o) => !before.some((b) => b.id === o.id)),
    );
  await settled(page);
  const table = fresh.find((o) => o.type === 'table') ?? null;
  const other = fresh.filter((o) => o.type !== 'table').map((o) => `${o.type}:${o.id}`);
  const snackbar = await page
    .locator('[data-control="snackbar"], .ts-snackbar, .pt-toast')
    .filter({ hasText: /Table pasted/ })
    .first()
    .textContent({ timeout: 4000 })
    .catch(() => null);
  const undo = await ctl(page, 'snackbar.action')
    .isVisible()
    .catch(() => false);
  const rev1 = (await state(page)).revision;
  test.info().annotations.push({
    type: 'paste',
    description: `new objects ${fresh.map((o) => `${o.type}:${o.id}`).join(', ')}; snackbar "${snackbar ?? 'none'}" with Undo ${undo}; revision ${rev0} -> ${rev1}`,
  });
  expect(
    table,
    `a table is inserted (the paste made ${other.join(', ') || 'nothing else'}; docs/FEATURES.md 2.3 item 5, B3)`,
  ).not.toBeNull();
  const block = table!.block as unknown as TableBlock;
  expect(block.columns.length, 'three columns').toBe(3);
  expect(block.rows.length, 'three rows').toBe(3);
  expect(block.rows[0]?.header, 'a header row (the first row has no numbers)').toBe(true);
  expect(block.rows.map((r) => r.cells.map(cellText))).toEqual([
    ['Region', 'Q1', 'Q2'],
    ['East', '120', '140'],
    ['West', '80', '95'],
  ]);
  expect(snackbar ?? '', 'the snackbar "Table pasted"').toMatch(/Table pasted/);
  expect(undo, 'with Undo').toBe(true);
  expect(rev1, 'one commit').toBe(rev0 + 1);
});

test(title('tables.paste.into-cell-spreads'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  await placeBlock(page, slideId, {
    id: 'paste-table',
    type: 'table',
    columns: [{}, {}, {}],
    rows: [
      { cells: ['A', 'B', 'C'], header: true },
      { cells: ['a1', 'b1', 'c1'] },
      { cells: ['a2', 'b2', 'c2'] },
    ],
    pos: { x: 160, y: 160, w: 900, h: 260 },
  });
  const cell = page
    .locator('.ts-stagewrap.ts-editor .pt-slide [data-run="paste-table/rows/2/cells/1"]')
    .first();
  await cell.dblclick();
  await page.waitForTimeout(300);
  const editing = await page.evaluate(
    () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
  );
  expect(editing, 'cell 2,1 is open').toBe(true);
  const rev0 = (await state(page)).revision;
  await pasteText(page, TSV);
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await settled(page);
  const read = async () =>
    (await objectsOf(page, slideId)).find((o) => o.id === 'paste-table')?.block as unknown as
      TableBlock | undefined;
  await expect
    .poll(async () => (await read())?.rows.length ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(3);
  const after = await read();
  const grid = after?.rows.map((r) => r.cells.map(cellText)) ?? [];
  const rev1 = (await state(page)).revision;
  test.info().annotations.push({
    type: 'spread',
    description: `${after?.rows.length} rows by ${after?.columns.length} columns: ${JSON.stringify(grid)}; revision ${rev0} -> ${rev1}`,
  });
  expect(after?.rows.length, 'two rows added for the three pasted rows from row 2').toBe(5);
  expect(after?.columns.length, 'one column added for the three pasted columns from column 1').toBe(
    4,
  );
  expect(grid[2]?.slice(1), 'the first pasted row fills from cell 2,1').toEqual([
    'Region',
    'Q1',
    'Q2',
  ]);
  expect(grid[3]?.slice(1)).toEqual(['East', '120', '140']);
  expect(grid[4]?.slice(1)).toEqual(['West', '80', '95']);
  /* every row carries one cell per column (packages/schema/src/blocks/table.ts tableSizeProblem),
     so the untouched row gains the empty cell of the column the paste added (build/b3.md R9) */
  expect(grid[1], 'the row above is untouched but for the added column').toEqual([
    'a1',
    'b1',
    'c1',
    '',
  ]);
});

// ---------------------------------------------------------------------------------------------
// the polish round (docs/POLISH.md 2.7 items 91, 92 and 95, 5.1 `versions.*` and
// `comments.marker.one-per-anchor`): the versions panel's rows, the Last edit words inline, one
// comment marker per anchor.

test(title('versions.panel.rows-read-clean'), async () => {
  test.setTimeout(150_000);
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'vh-box',
    type: 'text',
    text: 'Versions',
    pos: { x: 200, y: 500, w: 500, h: 100 },
  });
  const run = (await runsOfBlock(page, 'vh-box'))[0]!;
  await typeInto(page, run, ' written once');
  await settled(page);
  await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
  await ctl(page, 'panel.versionHistory').waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => {
    const panel = document.querySelector('[data-control="panel.versionHistory"]')!;
    const pr = panel.getBoundingClientRect();
    const windows = [...panel.querySelectorAll('[data-control^="versionHistory.window."]')].map(
      (el) => {
        const r = el.getBoundingClientRect();
        const mark = el.querySelector('.ts-version-mark, .ts-chip');
        const mr = mark?.getBoundingClientRect() ?? null;
        return {
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          markInside: mr ? mr.x >= pr.x - 1 && mr.right <= pr.right + 1 && mr.x >= r.x - 1 : null,
        };
      },
    );
    const clipped = [
      ...panel.querySelectorAll('.ts-version-meta, .ts-version-note, .ts-version-body'),
    ].filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).textOverflow === 'ellipsis' &&
        /…$|\.\.\.$/.test((el.textContent ?? '').trim()),
    ).length;
    return {
      windows,
      clipped,
      text: (panel.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  });
  /* the same time from and to: one time on the row */
  const sameTwice = rows.windows.filter((w) => /(\d{1,2}:\d{2} [AP]M) to \1/.test(w.text));
  /* Name this version opens the dialog and the snackbar reads Saved the version <name> */
  await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.nameCurrent');
  const dialog = await ctl(page, 'dialog.nameVersion.name')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  let words: string | null = null;
  if (dialog) {
    await ctl(page, 'dialog.nameVersion.name').click();
    await page.keyboard.type('Sent to Acme', { delay: 40 });
    await ctl(page, 'dialog.nameVersion.save').click();
    words = await expect
      .poll(() => snackbarText(page), { timeout: 6000 })
      .toMatch(/version/i)
      .then(() => snackbarText(page))
      .catch(() => snackbarText(page));
  }
  test.info().annotations.push({
    type: 'versions',
    description: `${rows.windows.length} window rows (${rows.windows.map((w) => `"${w.text.slice(0, 60)}" mark inside ${w.markInside}`).join(' | ')}); a time twice ${sameTwice.length}; clipped rows ${rows.clipped}; the dialog ${dialog}; snackbar "${words}"`,
  });
  expect(rows.windows.length, 'a window row after one write').toBeGreaterThan(0);
  expect(sameTwice, 'one time when start and end agree').toEqual([]);
  expect(
    rows.windows.every((w) => w.markInside !== false),
    'the mark inside the row',
  ).toBe(true);
  expect(rows.clipped, "no tail cut to 'cur…'").toBe(0);
  expect(dialog, 'Name this version opens the dialog').toBe(true);
  expect(words ?? '', 'Saved the version Sent to Acme').toMatch(/Saved the version Sent to Acme/);
});

test(title('versions.title-row.last-edit-inline'), async () => {
  test.setTimeout(90_000);
  const out: string[] = [];
  const failures: string[] = [];
  /* one write first, so the deck holds a record for the words to name (the span is empty on a
     deck with no edit yet); the write is setup, never a driven step */
  await openEditor(page, deck);
  const slideId = await addSlide(page);
  await placeBlock(page, slideId, {
    id: 'last-edit-box',
    type: 'text',
    text: 'A word for the record',
    pos: { x: 200, y: 200, w: 600, h: 60 },
  });
  await settled(page);
  await page.waitForTimeout(2500);
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await openEditor(page, deck);
    await page.waitForTimeout(500);
    const facts = await page.evaluate(() => {
      /* the words beside the clock (item 92): `deck.lastEdit.words` in the slot
         `deck.lastEdit.slot`, a span drawn from 1280 px up; the clock button's own text is its
         icon alone */
      const slot =
        document.querySelector('[data-control="deck.lastEdit.slot"]') ??
        document.querySelector('[data-control="deck.lastEdit"]')?.parentElement ??
        null;
      if (!slot) return null;
      const words = slot.querySelector('[data-control="deck.lastEdit.words"]');
      const clone = slot.cloneNode(true) as HTMLElement;
      for (const svg of clone.querySelectorAll('svg')) svg.remove();
      const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      const drawn = (el: Element | null) =>
        el !== null &&
        (el.textContent ?? '').trim().length > 0 &&
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).display !== 'none' &&
        el.getBoundingClientRect().width > 8;
      const visible =
        drawn(words) || [...slot.querySelectorAll('span, b, em')].some((el) => drawn(el));
      return {
        text,
        visible,
        tip: slot.querySelector('[data-tip]')?.getAttribute('data-tip') ?? null,
      };
    });
    out.push(
      `${width}: ${facts ? `"${facts.text}" visible ${facts.visible} (tip "${facts.tip}")` : 'no Last edit slot'}`,
    );
    if (!facts || !/Last edit/.test(facts.text) || !facts.visible)
      failures.push(`${width}: the words are not inline`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  test.info().annotations.push({ type: 'last edit', description: out.join('; ') });
  expect(failures).toEqual([]);
});

test(title('comments.marker.one-per-anchor'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'marker-shape',
    type: 'shape',
    shape: 'rectangle',
    fill: 'plate',
    stroke: 'ink',
    pos: { x: 900, y: 500, w: 240, h: 160 },
  });
  await selectBlock(page, 'marker-shape');
  await page.keyboard.press('Meta+Alt+m');
  await ctl(page, 'comment.card').waitFor({ timeout: 8000 });
  await ctl(page, 'comment.card.new.field').click();
  await page.keyboard.type('One marker please', { delay: 40 });
  await ctl(page, 'comment.card.new.submit').click();
  await expect
    .poll(() => page.locator('[data-control="comment.marker"]').count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const markers = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    const sr = sheet?.getBoundingClientRect();
    const k = sr ? sr.width / 1600 : 1;
    const els = [
      ...document.querySelectorAll(
        '[data-control="comment.marker"], .ts-comment-marker, .ts-comment-marker-btn',
      ),
    ].filter((el) => el.getClientRects().length > 0);
    const tiles = [
      ...document.querySelectorAll('.ts-overlay [class*="comment"], .ts-collab [class*="comment"]'),
    ].filter(
      (el) => el.getClientRects().length > 0 && !el.closest('[data-control="comment.card"]'),
    );
    return {
      markers: els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: sr ? Math.round((r.x - sr.x) / k) : 0,
          y: sr ? Math.round((r.y - sr.y) / k) : 0,
          w: Math.round(r.width),
          h: Math.round(r.height),
          count: el.getAttribute('data-count'),
          avatar: el.querySelector('.ts-chip, img, svg') !== null,
        };
      }),
      tiles: tiles.length,
    };
  });
  test.info().annotations.push({
    type: 'markers',
    description: `${markers.markers.length} marker(s): ${markers.markers.map((m) => `${m.x},${m.y} ${m.w}x${m.h} count ${m.count} avatar ${m.avatar}`).join(' | ')}; comment elements on the overlay ${markers.tiles}`,
  });
  expect(markers.markers.length, 'one marker element at the anchor').toBe(1);
  expect(markers.markers[0]!.avatar, 'with the avatar').toBe(true);
  expect(markers.markers[0]!.count, 'and the count').toBe('1');
});

coverage(import.meta.filename, [
  'charts.data.paste-rows',
  /* the features round, ship one (docs/FEATURES.md 2.3 item 5) */
  'tables.paste.tsv-makes-table',
  'tables.paste.into-cell-spreads',
  /* the polish round (docs/POLISH.md 2.7 items 91, 92 and 95) */
  'versions.panel.rows-read-clean',
  'versions.title-row.last-edit-inline',
  'comments.marker.one-per-anchor',
]);

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  coverage,
  ctl,
  download,
  invoke,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  otherContext,
  ownerContext,
  pdfPages,
  placeBlock,
  rightClickBlock,
  selectBlock,
  settled,
  state,
  teardownAll,
  title,
  waitEditor,
} from './lib';

// The switch, Tools > Advanced tools (docs/FOCUS.md section 3, 6.4 `surface.*` with the driver
// core/surface.spec.ts): off by default with no parked row on any surface, on shows the parked
// rows in their Google positions, remembered across a reload and off in a fresh browser, a
// parked block placed as setup still renders on the sheet, in the viewer and in the PDF, a
// parked row's chord does nothing while the switch is off and runs with it on, and a parked
// block takes every core row with the switch off. The parked flags of 3.2 to 3.4 are the surface
// lane's; until they land the off row reads the switch's default view honestly.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/surface.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';

/** Parked rows named by section 3.2 to 3.4, one per surface the row leaves. */
/* the rows that keep the switch after the return round (docs/RETURN.md section 8 and its
   section 2 questions 6 and 7): Insert > Table, Chart, Diagram and Word art, Arrange > Group and
   Distribute, File > Details, Superscript, Paint format, Theme and Rotate returned to the default
   view (RETURN.md sections 2 and 3), so the lists name what is still parked */
const PARKED_MENU_ROWS = [
  'view.gridView',
  'view.showSections',
  'insert.specialCharacters',
  'tools.spelling',
  'tools.activityDashboard',
  'tools.advanced',
];
/* no toolbar button keeps the switch after the return round (RETURN.md 3.2) */
const PARKED_TOOLBAR: string[] = [];
const PARKED_CONTEXT_ROWS = ['format.dropShadow', 'format.altText'];

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Advanced tools deck');
});
test.afterAll(async () => {
  /* the teardown runs past a failed row and past the file's own test timeout, so no scratch deck
     is left behind (VERIFICATION.md C2-F29) */
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

async function advancedOn(p: Page): Promise<boolean> {
  return (await state(p)).settings?.['advancedTools'] === true;
}
async function setAdvanced(p: Page, on: boolean): Promise<void> {
  if ((await advancedOn(p)) === on) return;
  await menuPath(p, 'tools', 'tools.advancedTools');
  await expect.poll(() => advancedOn(p), { timeout: 5000 }).toBe(on);
}
async function menuHas(p: Page, menuId: string, rowId: string): Promise<boolean> {
  const bar = ctl(p, `menubar.${menuId}`);
  if (!(await bar.isVisible().catch(() => false))) return false;
  await bar.click();
  await p.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  /* a row inside a submenu shows once its parent is hovered */
  const parts = rowId.split('.');
  for (let i = 2; i < parts.length; i += 1) {
    const parent = parts.slice(0, i).join('.');
    const row = p.locator(`#ts-menu-${menuId} [data-control="menu.${parent}"]`).first();
    if (await row.isVisible().catch(() => false)) {
      await row.hover();
      await p.waitForTimeout(350);
    }
  }
  const present = await p
    .locator(`[data-control="menu.${rowId}"]`)
    .first()
    .isVisible()
    .catch(() => false);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return present;
}
async function paletteHas(p: Page, rowId: string): Promise<boolean> {
  await ctl(p, 'toolbar.search').click();
  await ctl(p, 'palette.query').waitFor({ timeout: 8000 });
  await p.keyboard.type(rowId.split('.').pop() ?? rowId, { delay: 40 });
  await p.waitForTimeout(400);
  const present = await p
    .locator(`[data-control="palette.menu:${rowId}"]`)
    .first()
    .isVisible()
    .catch(() => false);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return present;
}
async function contextRows(p: Page, blockId: string): Promise<string[]> {
  /* the block selected as an object and right clicked on its frame edge (lib rightClickBlock: a
     click in the run opens the caret, and a right click with a collapsed caret opens no menu, F4) */
  await rightClickBlock(p, blockId);
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll('.ts-context-menu [data-control^="menu."]')].map((e) =>
      (e.getAttribute('data-control') ?? '').replace(/^menu\./, ''),
    ),
  );
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return rows;
}

test(title('surface.advanced.off-by-default'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  expect(await advancedOn(page), 'the setting is off by default').toBe(false);
  expect(await ctl(page, 'menu.tools.advancedTools').count()).toBe(0);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'plain-box',
    type: 'text',
    text: 'Plain',
    pos: { x: 200, y: 200, w: 240, h: 120 },
  });
  const present: string[] = [];
  for (const row of PARKED_MENU_ROWS)
    if (await menuHas(page, row.split('.')[0]!, row)) present.push(`menu ${row}`);
  for (const control of PARKED_TOOLBAR)
    if (
      await ctl(page, control)
        .isVisible()
        .catch(() => false)
    )
      present.push(`toolbar ${control}`);
  const ctx = await contextRows(page, 'plain-box');
  for (const row of PARKED_CONTEXT_ROWS) if (ctx.includes(row)) present.push(`right click ${row}`);
  if (await paletteHas(page, 'view.gridView')) present.push('palette view.gridView');
  if (
    await ctl(page, 'menubar.extensions')
      .isVisible()
      .catch(() => false)
  )
    present.push('the Extensions menu');
  expect(present, 'parked rows present with the switch off').toEqual([]);
});

test(title('surface.advanced.on-shows-parked'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await setAdvanced(page, true);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)').first()).toHaveAttribute(
    'data-advanced-tools',
    '',
  );
  const missing: string[] = [];
  for (const row of PARKED_MENU_ROWS)
    if (!(await menuHas(page, row.split('.')[0]!, row))) missing.push(`menu ${row}`);
  for (const control of PARKED_TOOLBAR)
    if (
      !(await ctl(page, control)
        .isVisible()
        .catch(() => false))
    )
      missing.push(`toolbar ${control}`);
  if (
    !(await ctl(page, 'menubar.extensions')
      .isVisible()
      .catch(() => false))
  )
    missing.push('the Extensions menu');
  expect(missing, 'parked rows absent with the switch on').toEqual([]);
  /* Google's position: Insert > Table sits between Image and Chart */
  await ctl(page, 'menubar.insert').click();
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('#ts-menu-insert [data-control^="menu.insert."]')].map((e) =>
      e.getAttribute('data-control'),
    ),
  );
  await page.keyboard.press('Escape');
  const at = (id: string) => order.indexOf(`menu.${id}`);
  expect(at('insert.image')).toBeLessThan(at('insert.table'));
  expect(at('insert.table')).toBeLessThan(at('insert.chart'));
});

test(title('surface.advanced.remembered'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  await setAdvanced(page, true);
  /* the reload as a full load of the same address: in the runner `page.reload()` on the
     preview never brought the studio back within 90 s (two runs of two, VERIFICATION.md's run
     too) while the same address loaded by a navigation does; the setting is read from the page
     the load produces either way */
  const address = page.url();
  const t = Date.now();
  await page.goto(address);
  /* the setting is read as soon as the page reports it, from the studio's describe() or the
     viewer's data-advanced-tools attribute, with a 180 s budget: on the preview the editor's boot
     after a full load with the switch on ran past the 90 s waitEditor allows (VERIFICATION.md
     pass 2 F-remembered, the sweep's eight minute tail); the boot time is recorded in the message */
  const read = async (): Promise<boolean | null> =>
    page.evaluate(() => {
      try {
        const s = window.turboslide?.studio?.describe().state as
          { settings?: Record<string, unknown> } | undefined;
        if (s?.settings && 'advancedTools' in s.settings)
          return s.settings['advancedTools'] === true;
      } catch {
        // the studio is not up yet
      }
      const viewer = document.querySelector('.pt-viewer:not(.ts-skeleton)');
      if (viewer?.hasAttribute('data-advanced-tools'))
        return viewer.getAttribute('data-advanced-tools') !== 'false';
      return null;
    });
  await expect
    .poll(read, {
      timeout: 180_000,
      message: 'the editor reports the Advanced tools setting after a full load with the switch on',
    })
    .not.toBeNull();
  const bootMs = Date.now() - t;
  expect(await read(), `on after a reload (the page reported the setting after ${bootMs} ms)`).toBe(
    true,
  );
  await waitEditor(page);
  expect(await advancedOn(page), 'on after the editor settled').toBe(true);
  /* a fresh browser: a second context with no cookie of the first and the preview's header
     (lib otherContext). Cycle 2's bare newContext carried no header, so on a preview behind
     Vercel Authentication its /new met the sign in redirect and waitEditor timed out at 90 s
     while the product half of the row passed (VERIFICATION.md C2-F3); /new writes nothing until
     a first edit, so the fresh context leaves no deck to tear down */
  const { context: fresh, page: other } = await otherContext(context.browser()!);
  try {
    await other.goto('/new');
    await waitEditor(other);
    expect(await advancedOn(other), 'off in a fresh browser').toBe(false);
  } finally {
    await fresh.close();
  }
  await setAdvanced(page, false);
});

test(title('surface.parked-blocks-render'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await setAdvanced(page, false);
  const slideId = (await state(page)).slideId;
  /* the setup writes of the matrix row: a chart, a table and a diagram through the window API */
  await placeBlock(page, slideId, {
    id: 'parked-chart',
    type: 'chart',
    kind: 'bar',
    categories: ['A', 'B'],
    series: [{ name: 'S', values: [3, 5] }],
    pos: { x: 100, y: 400, w: 400, h: 240 },
  });
  /* the table block's shape (packages/schema/src/blocks/table.ts): one entry per column, rows
     as cells, a header row flagged */
  await placeBlock(page, slideId, {
    id: 'parked-table',
    type: 'table',
    columns: [{}, {}],
    rows: [{ cells: ['A', 'B'], header: true }, { cells: ['1', '2'] }],
    pos: { x: 600, y: 400, w: 400, h: 200 },
  });
  /* the diagram block (blocks.ts diaBlockSchema): a raw SVG with its fit and alt text */
  await placeBlock(page, slideId, {
    id: 'parked-dia',
    type: 'dia',
    fit: 'slot',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect x="20" y="80" width="140" height="80" fill="none" stroke="currentColor" stroke-width="2"/><rect x="240" y="80" width="140" height="80" fill="none" stroke="currentColor" stroke-width="2"/><line x1="160" y1="120" x2="240" y2="120" stroke="currentColor" stroke-width="2"/></svg>',
    alt: 'Two boxes joined by a line',
    pos: { x: 1050, y: 400, w: 400, h: 240 },
  });
  const placed = (await objectsOf(page, slideId)).map((o) => o.id);
  const onSheet = await page.evaluate(
    (ids) =>
      ids.map((id) =>
        Boolean(document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`)),
      ),
    placed.filter((id) => id.startsWith('parked-')),
  );
  expect(
    placed.filter((id) => id.startsWith('parked-')).sort(),
    'the chart, the table and the diagram were placed',
  ).toEqual(['parked-chart', 'parked-dia', 'parked-table']);
  expect(onSheet.every(Boolean), 'every parked block draws on the sheet with the switch off').toBe(
    true,
  );
  await expect(ctl(page, 'toolbar.chartType')).toHaveCount(0);
  const viewer = await context.newPage();
  await viewer.goto(`/deck/${deck}#s/${slideId}`);
  await viewer.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  const inViewer = await viewer.evaluate(
    (ids) => ids.map((id) => Boolean(document.querySelector(`[data-block="${id}"]`))),
    placed.filter((id) => id.startsWith('parked-')),
  );
  await viewer.close();
  expect(inViewer.every(Boolean), 'every parked block draws in the viewer').toBe(true);
  const pdf = await download(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    await ctl(page, 'dialog.download.ok').click();
  });
  expect(pdf.ms).toBeLessThan(30_000);
  expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdfPages(pdf.bytes)).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
});

test(title('surface.parked-shortcut-unbound'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await setAdvanced(page, false);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'g1',
    type: 'text',
    text: 'One',
    pos: { x: 100, y: 100, w: 200, h: 100 },
  });
  await placeBlock(page, slideId, {
    id: 'g2',
    type: 'text',
    text: 'Two',
    pos: { x: 400, y: 100, w: 200, h: 100 },
  });
  const chip = page.locator('.ts-overlay .ts-select-chip');
  const selectPair = async () => {
    await page.keyboard.press('Escape');
    /* g1 as an object by one click (AMENDMENTS.md A1 rule 1; on a build that still opens the
       session, lib selectBlock ends it with Escape and keeps g1 selected), then Shift click g2
       (b2 R11 reworded the pass 1 comment) */
    await selectBlock(page, 'g1');
    await page
      .locator('.ts-stagewrap.ts-editor .pt-slide [data-block="g2"]')
      .first()
      .click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    if ((await chip.textContent().catch(() => '')) !== '2 objects') {
      /* the marquee: from the bare sheet above and left of g1 to below and right of g2 */
      await page.keyboard.press('Escape');
      const sheet = (await page
        .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
        .first()
        .boundingBox())!;
      const k = sheet.width / 1600;
      await page.mouse.move(sheet.x + 60 * k, sheet.y + 60 * k);
      await page.mouse.down();
      await page.mouse.move(sheet.x + 640 * k, sheet.y + 240 * k, { steps: 12 });
      await page.mouse.up();
    }
    await expect(chip).toHaveText('2 objects');
  };
  /* the pair is kept as the test's objects; the chord under test is a still parked row's: Alt
     text (Cmd+Option+Y, format.altText, RETURN.md question 6), which opens Format options on a
     selected block. Group (Cmd+Option+G) and Justify (Cmd+Shift+J) returned to the default view
     this round (RETURN.md sections 2 and 3), so they are core rows and no longer this row's chord */
  const panelOpen = async () => (await ctl(page, 'panel.formatOptions').count()) > 0;
  const closePanel = async () => {
    for (let i = 0; i < 3 && (await panelOpen()); i += 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  };
  await closePanel();
  /* off: the chord matches nothing */
  await selectBlock(page, 'g1');
  await page.keyboard.press('Meta+Alt+y');
  await page.waitForTimeout(1500);
  expect(await panelOpen(), 'Cmd+Option+Y opens nothing with the switch off').toBe(false);
  /* on: the chord runs the row */
  await setAdvanced(page, true);
  await selectBlock(page, 'g1');
  await page.keyboard.press('Meta+Alt+y');
  await expect
    .poll(panelOpen, {
      timeout: 8000,
      message: 'Cmd+Option+Y opens Format options with the switch on',
    })
    .toBe(true);
  await closePanel();
  await setAdvanced(page, false);
  void selectPair;
});

test(title('surface.parked-block-core-rows'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await setAdvanced(page, false);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'core-chart',
    type: 'chart',
    kind: 'bar',
    categories: ['A', 'B'],
    series: [{ name: 'S', values: [3, 5] }],
    pos: { x: 300, y: 300, w: 400, h: 240 },
  });
  await placeBlock(page, slideId, {
    id: 'core-ref',
    type: 'text',
    text: 'Ref',
    pos: { x: 100, y: 600, w: 200, h: 100 },
  });
  const pos = async () =>
    (await objectsOf(page, slideId)).find((o) => o.id === 'core-chart')?.pos ?? null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const undo = async (before: unknown) => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+z');
    await expect.poll(pos, { timeout: 8000 }).toEqual(before);
    await settled(page);
  };
  const block = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="core-chart"]').first();
  /* select */
  await block.click();
  await expect(page.locator('.ts-overlay [data-control="handle.core-chart.move"]')).toBeAttached();
  const chip = await page.locator('.ts-overlay .ts-select-chip').textContent();
  expect(chip).toBeTruthy();
  /* move by the frame edge */
  let before = await pos();
  const edge = await page.locator('.ts-overlay .ts-frame-edge[data-side="n"]').boundingBox();
  const k =
    (await page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)').boundingBox())!
      .width / 1600;
  await page.mouse.move(edge!.x + edge!.width * 0.3, edge!.y + edge!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    edge!.x + edge!.width * 0.3 + 120 * k,
    edge!.y + edge!.height / 2 + 80 * k,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await pos())?.x, { timeout: 8000 }).not.toBe(before!.x);
  await settled(page);
  await undo(before);
  /* resize by the se handle */
  await block.click();
  before = await pos();
  const se = await page
    .locator('.ts-overlay [data-control="handle.core-chart.resize.se"]')
    .boundingBox();
  await page.mouse.move(se!.x + se!.width / 2, se!.y + se!.height / 2);
  await page.mouse.down();
  await page.mouse.move(se!.x + se!.width / 2 + 60 * k, se!.y + se!.height / 2 + 40 * k, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(async () => (await pos())?.w, { timeout: 8000 }).not.toBe(before!.w);
  await settled(page);
  await undo(before);
  /* send to back */
  await block.click();
  before = await pos();
  await menuPath(page, 'arrange', 'arrange.order', 'arrange.order.sendToBack');
  await expect.poll(async () => same(await pos(), before), { timeout: 8000 }).toBe(false);
  await settled(page);
  await undo(before);
  /* align left with the reference selected too */
  await block.click();
  await page
    .locator('.ts-stagewrap.ts-editor .pt-slide [data-block="core-ref"]')
    .first()
    .click({ modifiers: ['Shift'] });
  before = await pos();
  await menuPath(page, 'arrange', 'arrange.align', 'arrange.align.left');
  await expect.poll(async () => (await pos())?.x, { timeout: 8000 }).toBe(100);
  await settled(page);
  await undo(before);
  /* duplicate and delete */
  await block.click();
  const count = async () => (await objectsOf(page, slideId)).length;
  const n0 = await count();
  await page.keyboard.press('Meta+d');
  await expect.poll(count, { timeout: 8000 }).toBe(n0 + 1);
  await settled(page);
  await page.keyboard.press('Meta+z');
  await expect.poll(count, { timeout: 8000 }).toBe(n0);
  await settled(page);
  await block.click();
  await page.keyboard.press('Delete');
  await expect.poll(count, { timeout: 8000 }).toBe(n0 - 1);
  await settled(page);
  await page.keyboard.press('Meta+z');
  await expect.poll(count, { timeout: 8000 }).toBe(n0);
  await settled(page);
  expect(await invoke(page, 'deck.info')).toBeTruthy();
});

coverage(import.meta.filename, [
  'surface.advanced.off-by-default',
  'surface.advanced.on-shows-parked',
  'surface.advanced.remembered',
  'surface.parked-blocks-render',
  'surface.parked-shortcut-unbound',
  'surface.parked-block-core-rows',
]);

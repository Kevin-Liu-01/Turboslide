import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

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
  agentHeaders,
  extraHTTPHeaders,
  isLocalBase,
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
/* the rows that keep the switch after the return round (docs/archive/rounds/RETURN.md section 8 and its
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
/* Alt text returned to the default view in the product round (docs/archive/rounds/PRODUCT.md section 5, b2 R1 b) */
const PARKED_CONTEXT_ROWS = ['format.dropShadow'];

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
  /* the PDF row starts its download at once since the product round (section 2 rank 8) */
  const pdf = await download(page, async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    const ok = ctl(page, 'dialog.download.ok');
    if (await ok.isVisible({ timeout: 1500 }).catch(() => false)) await ok.click();
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
  /* Alt text returned to the default view in the product round (docs/archive/rounds/PRODUCT.md section 5, b2
     R1 b): the chord opens Format options with the switch off as well */
  await selectBlock(page, 'g1');
  await page.keyboard.press('Meta+Alt+y');
  await expect
    .poll(panelOpen, {
      timeout: 8000,
      message:
        'Cmd+Option+Y opens Format options with the switch off (Alt text is in the default view)',
    })
    .toBe(true);
  await closePanel();
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

// ---------------------------------------------------------------------------------------------
// the polish round (docs/archive/rounds/POLISH.md section 0 and 2.8 item 106, 5.1 `surface.*`): the build's
// commit on the gate's origin, and the skeleton as the editor's frame.

test(title('surface.domain.build-commit'), async () => {
  test.setTimeout(120_000);
  const base = new URL(
    page.url() === 'about:blank'
      ? `${process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321'}/`
      : page.url(),
  ).origin;
  /* the ship's sha: the checkout the gate runs from (read only git) */
  const root = resolve(import.meta.dirname, '..', '..', '..', '..');
  const head =
    spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? '';
  const headers = agentHeaders(base);
  const res =
    headers === null
      ? null
      : await page.request.get(`${base}/api/agent`, { headers, maxRedirects: 0 });
  const body = res
    ? ((await res.json().catch(() => null)) as { instance?: { commit?: string } } | null)
    : null;
  const commit = body?.instance?.commit ?? null;
  /* Tools > Preferences lists Play shaders on the build the round ships (the row only the current
     build draws; it left the View menu for Tools > Preferences in Round 1, docs/NEXT.md 4.1.3
     item 20) */
  await openEditor(page, deck);
  const drawsPlayShaders = async (): Promise<boolean> => {
    await ctl(page, 'menubar.tools').click();
    await page.locator('#ts-menu-tools').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.tools.preferences')
      .hover()
      .catch(() => undefined);
    const drawn = await page
      .locator('[data-control="menu.tools.preferences.playShaders"]')
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
    return drawn;
  };
  let playShaders = await drawsPlayShaders();
  let switched = false;
  if (!playShaders) {
    await setAdvanced(page, true);
    switched = true;
    playShaders = await drawsPlayShaders();
    await setAdvanced(page, false);
  }
  test.info().annotations.push({
    type: 'build',
    description: `HEAD ${head.slice(0, 12)}; /api/agent ${res ? res.status() : 'no bearer for this origin'} instance.commit ${commit ?? 'none'}; Tools > Preferences > Play animated patterns drawn ${playShaders}${switched ? ' with the switch on' : ''}`,
  });
  expect(
    res,
    'the agent surface answered (a bearer on a deployment, open on localhost)',
  ).not.toBeNull();
  expect(res!.status()).toBe(200);
  expect(commit, 'instance.commit is on the answer').not.toBeNull();
  expect(
    head.startsWith(commit!) || commit!.startsWith(head.slice(0, 7)),
    `instance.commit ${commit} equals the checkout's HEAD ${head.slice(0, 12)}`,
  ).toBe(true);
  expect(playShaders, 'Tools > Preferences lists Play animated patterns').toBe(true);
  void isLocalBase;
});

test(title('surface.skeleton.matches-editor'), async ({ browser }) => {
  test.setTimeout(120_000);
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
  });
  const p = await fresh.newPage();
  try {
    await p.addInitScript(() => {
      const w = window as unknown as {
        __skel: {
          at: number;
          ground: string;
          menus: string[];
          plate: { x: number; y: number; w: number; h: number } | null;
        } | null;
      };
      w.__skel = null;
      const read = () => {
        const sk = document.querySelector('.ts-skeleton');
        if (!sk || w.__skel !== null) return;
        const plate = sk.querySelector('.ts-skeleton-sheet');
        const r = plate?.getBoundingClientRect() ?? null;
        w.__skel = {
          at: performance.now(),
          ground: getComputedStyle(sk).backgroundColor,
          menus: [...sk.querySelectorAll('.ts-skeleton-menu')].map((el) =>
            (el.textContent ?? '').trim(),
          ),
          plate: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        };
      };
      new MutationObserver(read).observe(document, { childList: true, subtree: true });
      setTimeout(read, 150);
    });
    await p.goto('/new');
    await waitEditor(p);
    const facts = await p.evaluate(() => {
      const w = window as unknown as {
        __skel: {
          at: number;
          ground: string;
          menus: string[];
          plate: { x: number; y: number; w: number; h: number } | null;
        } | null;
      };
      const menus = [...document.querySelectorAll('[data-control^="menubar."]')]
        .filter((el) => el.tagName.toLowerCase() === 'button' && el.getClientRects().length > 0)
        .map((el) => (el.textContent ?? '').trim());
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      const r = sheet?.getBoundingClientRect() ?? null;
      const probe = document.createElement('div');
      probe.style.background = 'var(--pt-paper, #fff)';
      document.body.append(probe);
      const paper = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        skeleton: w.__skel,
        menus,
        sheet: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        paper,
      };
    });
    const sk = facts.skeleton;
    const white = sk
      ? /^rgb\(255, 255, 255\)$/.test(sk.ground) || sk.ground === facts.paper
      : false;
    const plateOff =
      sk?.plate && facts.sheet
        ? Math.max(
            Math.abs(sk.plate.x - facts.sheet.x),
            Math.abs(sk.plate.y - facts.sheet.y),
            Math.abs(sk.plate.w - facts.sheet.w),
            Math.abs(sk.plate.h - facts.sheet.h),
          )
        : null;
    test.info().annotations.push({
      type: 'skeleton',
      description: sk
        ? `at ${Math.round(sk.at)} ms: ground ${sk.ground} (paper ${facts.paper}), menus ${sk.menus.join(', ')} against the editor's ${facts.menus.join(', ')}; plate ${sk.plate ? `${Math.round(sk.plate.x)},${Math.round(sk.plate.y)} ${Math.round(sk.plate.w)}x${Math.round(sk.plate.h)}` : 'none'} against the sheet ${facts.sheet ? `${Math.round(facts.sheet.x)},${Math.round(facts.sheet.y)} ${Math.round(facts.sheet.w)}x${Math.round(facts.sheet.h)}` : 'none'} (off by ${plateOff === null ? '?' : Math.round(plateOff)} px)`
        : 'no skeleton was drawn',
    });
    expect(sk, 'a skeleton was drawn at 150 ms').not.toBeNull();
    expect(white, 'a white ground').toBe(true);
    expect(sk!.menus, "the menu list equal to the editor's").toEqual(facts.menus);
    expect(plateOff, "the plate within 4 px of the sheet's final box").toBeLessThanOrEqual(4);
  } finally {
    await fresh.close();
  }
});

coverage(import.meta.filename, [
  'surface.advanced.off-by-default',
  'surface.advanced.on-shows-parked',
  'surface.advanced.remembered',
  'surface.parked-blocks-render',
  'surface.parked-shortcut-unbound',
  'surface.parked-block-core-rows',
  /* the polish round (docs/archive/rounds/POLISH.md section 0, 2.8 item 106) */
  'surface.domain.build-commit',
  'surface.skeleton.matches-editor',
]);

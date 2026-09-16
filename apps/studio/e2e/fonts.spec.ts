import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The font catalog spec of round five (gslides-parity SPEC-5-amendments A5 items 3, 4, 6 and 7,
// A6; B7): the faces the studio serves (`/fonts/faces/<version>/<ids>.css`, one `@font-face` group
// per family and the `--ts-font-<id>` rule; the woff2 files immutable under the catalog's version),
// `font.list` through the window API (the catalog with its licences), no font file before the ready
// mark on a deck set in the theme's face (SPEC-4 4), a family written through the text style action
// drawing the block in that face once its stylesheet is linked, and the toolbar's Font dropdown in
// Google's position: the search, the families of the presentation first, the catalog by category,
// every label in its own face, the pick, and More fonts with the licence line. The scratch deck is
// a copy of the GT deck, which uses Inter alone.
//
// Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory:
// PLAYWRIGHT_BASE_URL=http://localhost:4358 node_modules/.bin/playwright test apps/studio/e2e/fonts.spec.ts

const SOURCE = 'gt-brand';
const DECK = `e2e-fonts-${Date.now().toString(36)}`;
const SLIDE = 'content-rule';
const BLOCK = 'p1';
const CATEGORIES = new Set(['sans', 'serif', 'display', 'mono']);
const LICENCES = new Set(['OFL 1.1', 'Apache 2.0']);

type FontRow = {
  id: string;
  name: string;
  category: string;
  weights: number[];
  italic: boolean;
  licence: string;
};

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function settled(page: Page, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      async () =>
        (await invoke<{ pending: number; retained: number }>(page, 'sync.status')).pending,
      { timeout },
    )
    .toBe(0);
}

async function openEditor(page: Page, deckId: string): Promise<void> {
  await page.goto(`/edit/${deckId}`);
  await editorReady(page);
  await invoke(page, 'view.goto', { slideId: SLIDE });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', SLIDE);
  await expect
    .poll(async () => (await invoke<{ connected: boolean }>(page, 'sync.status')).connected, {
      timeout: 45_000,
    })
    .toBe(true);
}

/** The block's typography as the document holds it. */
async function typographyOf(page: Page): Promise<Record<string, unknown>> {
  const got = await invoke<{
    slide: { slots: Record<string, { id: string; typography?: Record<string, unknown> }[]> };
  }>(page, 'slide.get', { slideId: SLIDE });
  const block = Object.values(got.slide.slots)
    .flat()
    .find((b) => b.id === BLOCK);
  return block?.typography ?? {};
}

/** Selects the paragraph as an object (a click at its corner; Esc closes an inline session that opened). */
async function selectBlock(page: Page): Promise<void> {
  const block = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${BLOCK}"]`);
  const box = await block.boundingBox();
  if (!box) throw new Error(`no block ${BLOCK}`);
  await page.mouse.click(box.x + 1, box.y + 1);
  if ((await page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]').count()) > 0)
    await page.keyboard.press('Escape');
  await expect(page.locator(`.ts-overlay [data-control="handle.${BLOCK}.move"]`)).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/edit/${SOURCE}`);
  await editorReady(page);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Fonts walk',
    newId: DECK,
    baseRevision: info.revision,
  });
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`/edit/${DECK}`);
    await editorReady(page);
    const info = await invoke<{ revision: number }>(page, 'deck.info');
    await invoke(page, 'deck.remove', { id: DECK, baseRevision: info.revision, confirm: true });
  } catch {
    // the deck may be gone already
  }
  await context.close();
});

test('the studio serves one @font-face group per family with the custom property rule, and the files immutable under the catalog version (A5 item 3)', async ({
  request,
}) => {
  const sheet = await request.get('/fonts/faces/current/roboto.css');
  expect(sheet.status()).toBe(200);
  expect(sheet.headers()['content-type']).toContain('text/css');
  const css = await sheet.text();
  expect(css).toContain("font-family: 'Roboto'");
  expect(css).toContain('font-display: swap');
  expect(css).toMatch(/\.ts-sheet\s*\{[^}]*--ts-font-roboto:\s*'Roboto', sans-serif/);
  const urls = [...css.matchAll(/url\('?([^')]+)'?\)/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => /^\/fonts\/[0-9a-f]{12}\/roboto\/.+\.woff2$/.test(url))).toBe(true);
  const file = await request.get(urls[0]!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('font/woff2');
  expect(file.headers()['cache-control']).toContain('immutable');
  expect(Number(file.headers()['content-length'])).toBeGreaterThan(1000);
  // two families in one sheet, two groups
  const two = await request.get('/fonts/faces/current/roboto+lora.css');
  expect(two.status()).toBe(200);
  const twoCss = await two.text();
  expect(twoCss).toContain("font-family: 'Roboto'");
  expect(twoCss).toContain("font-family: 'Lora'");
  expect(twoCss).toMatch(/--ts-font-lora:\s*'Lora', serif/);
  // nothing outside the catalog
  expect((await request.get('/fonts/faces/current/comic-sans.css')).status()).toBe(404);
  expect((await request.get('/fonts/faces/current/inter.css')).status()).toBe(200);
  expect((await request.get(`${urls[0]!.replace(/[^/]+$/, 'missing.woff2')}`)).status()).toBe(404);
});

test('font.list answers the catalog with its names, categories, weights and licences (A5 item 6)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openEditor(page, DECK);
  const actions = await page.evaluate(() => window.turboslide!.studio.describe().actions);
  expect(actions).toContain('font.list');
  const answer = await invoke<{ fonts: FontRow[] }>(page, 'font.list', {});
  const rows = answer.fonts;
  expect(rows.length).toBeGreaterThanOrEqual(20);
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  expect(rows.map((row) => row.id)).toContain('inter');
  expect(rows.map((row) => row.id)).toContain('roboto');
  for (const row of rows) {
    expect(row.id).toMatch(/^[a-z0-9-]+$/);
    expect(row.name.length).toBeGreaterThan(0);
    expect(CATEGORIES.has(row.category), row.id).toBe(true);
    expect(row.weights.length).toBeGreaterThan(0);
    expect(
      row.weights.every((w) => w >= 100 && w <= 900 && w % 100 === 0),
      row.id,
    ).toBe(true);
    expect(typeof row.italic).toBe('boolean');
    expect(LICENCES.has(row.licence), row.id).toBe(true);
  }
  // the served sheet of every family answers 200: every catalog row has its files
  const all = await page.request.get(`/fonts/faces/current/${rows.map((r) => r.id).join('+')}.css`);
  expect(all.status()).toBe(200);
  await context.close();
});

test('a deck in the theme face loads no catalog font before the ready mark (A5 item 3; SPEC-4 4)', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const fontRequests: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (/^\/fonts\/(faces\/|[0-9a-f]{12}\/)/.test(url.pathname)) fontRequests.push(url.pathname);
  });
  await openEditor(page, DECK);
  await settled(page);
  expect(await page.locator('link[data-control="fonts.faces"]').count()).toBe(0);
  expect(fontRequests).toEqual([]);
  await context.close();
});

test('a family written through the text style action links its stylesheet and draws the block in that face (A5 items 3, 4)', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const fontRequests: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/fonts/')) fontRequests.push(url.pathname);
  });
  await openEditor(page, DECK);
  await settled(page);
  const typography = await typographyOf(page);
  await invoke(page, 'block.set', {
    slideId: SLIDE,
    blockId: BLOCK,
    path: '/typography',
    value: { ...typography, family: 'roboto' },
    baseRevision: (await invoke<{ revision: number }>(page, 'deck.info')).revision,
  });
  await settled(page);
  expect((await typographyOf(page)).family).toBe('roboto');
  // the block's declaration names the custom property; the sheet's link defines it
  const block = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${BLOCK}"]`);
  await expect
    .poll(() => page.locator('link[data-control="fonts.faces"]').getAttribute('href'), {
      timeout: 10_000,
    })
    .toContain('roboto');
  await expect
    .poll(() => block.evaluate((el) => getComputedStyle(el).fontFamily), { timeout: 10_000 })
    .toContain('Roboto');
  await expect
    .poll(() => fontRequests.some((path) => path.startsWith('/fonts/faces/current/roboto')), {
      timeout: 10_000,
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check("16px 'Roboto'")), { timeout: 20_000 })
    .toBe(true);
  // the theme's face again: the key leaves the typography and the link goes with it
  await invoke(page, 'block.set', {
    slideId: SLIDE,
    blockId: BLOCK,
    path: '/typography',
    value: typography,
    baseRevision: (await invoke<{ revision: number }>(page, 'deck.info')).revision,
  });
  await settled(page);
  expect((await typographyOf(page)).family).toBeUndefined();
  await expect(page.locator('link[data-control="fonts.faces"]')).toHaveCount(0);
  await context.close();
});

test('the toolbar’s Font dropdown searches the catalog, lists the presentation’s families first, draws every label in its face, picks, and opens More fonts (A5 items 4, 7)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await openEditor(page, DECK);
  await settled(page);
  await selectBlock(page);
  const control = page.locator('[data-control="toolbar.font"]');
  await expect(control).toBeVisible();
  // Google's position: the Font control sits left of the font size control
  const fontBox = await control.boundingBox();
  const sizeBox = await page.locator('[data-control="toolbar.fontSize"]').first().boundingBox();
  expect(fontBox).not.toBeNull();
  expect(sizeBox).not.toBeNull();
  expect(fontBox!.x).toBeLessThan(sizeBox!.x);
  await expect(control.locator('.ts-font-label')).toHaveText('Inter');
  await control.click();
  const plate = page.locator('[data-control="toolbar.font.plate"]');
  await expect(plate).toBeVisible();
  const search = plate.locator('[data-control="toolbar.font.search"]');
  await expect(search).toBeFocused();
  const list = plate.locator('[data-control="toolbar.font.list"]');
  await expect(list).toBeVisible({ timeout: 15_000 });
  // the row count equals the catalog's (A5 item 7): every catalog face once, plus the theme row
  const rows = (await invoke<{ fonts: FontRow[] }>(page, 'font.list', {})).fonts;
  await expect(list.locator('[role="option"][data-font]:not([data-font="theme"])')).toHaveCount(
    rows.length,
  );
  await expect(list.locator('[data-control="toolbar.font.pick.theme"]')).toHaveCount(1);
  // the groups in Google's order, no "In this presentation" group on a deck in the theme face
  const groups = await list.locator('.ts-font-group h4').allTextContents();
  expect(groups).toEqual(['Sans serif', 'Serif', 'Display', 'Monospace']);
  // every label in its own face
  const styled = await list
    .locator('[data-font="roboto"] .ts-font-name')
    .first()
    .evaluate((el) => (el as HTMLElement).style.fontFamily);
  expect(styled).toContain('Roboto');
  // the search narrows the rows, case folded
  await search.fill('rob');
  await expect(list.locator('[role="option"][data-font]:not([data-font="theme"])')).toHaveCount(2);
  // the row and its label both carry data-font: the rows are the options
  await expect(list.locator('[role="option"][data-font="roboto"]')).toHaveCount(1);
  await expect(list.locator('[role="option"][data-font="roboto-mono"]')).toHaveCount(1);
  await search.fill('zzzz');
  await expect(list.locator('.ts-font-empty')).toHaveText('No font matches');
  await search.fill('');
  // the pick writes the family through the text style action and the control reads its name
  await list.locator('[data-control="toolbar.font.pick.roboto"]').first().click();
  await expect(plate).toBeHidden();
  await settled(page);
  expect((await typographyOf(page)).family).toBe('roboto');
  await expect(control.locator('.ts-font-label')).toHaveText('Roboto');
  // the families of the presentation lead the list now
  await control.click();
  await expect(list).toBeVisible({ timeout: 15_000 });
  const groupsAfter = await list.locator('.ts-font-group h4').allTextContents();
  expect(groupsAfter[0]).toBe('In this presentation');
  await expect(list.locator('[data-group="used"][data-font="roboto"]')).toHaveCount(1);
  // More fonts: Google's dialog form with the category filter and the licence line
  await list.locator('[data-control="toolbar.font.more"]').click();
  const dialog = page.locator('[data-control="dialog.moreFonts"]');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('[data-control="dialog.moreFonts.list"] [role="option"]'),
  ).toHaveCount(rows.length);
  await expect(dialog.locator('[data-font="lora"] .ts-more-fonts-meta')).toContainText(
    'SIL Open Font License 1.1',
  );
  await dialog.locator('[data-control="dialog.moreFonts.category"]').selectOption('serif');
  const serif = rows.filter((row) => row.category === 'serif').length;
  await expect(
    dialog.locator('[data-control="dialog.moreFonts.list"] [role="option"]'),
  ).toHaveCount(serif);
  await dialog.locator('[data-control="dialog.moreFonts.pick.lora"]').click();
  await dialog.locator('[data-control="dialog.moreFonts.ok"]').click();
  await expect(dialog).toBeHidden();
  await settled(page);
  expect((await typographyOf(page)).family).toBe('lora');
  await expect(control.locator('.ts-font-label')).toHaveText('Lora');
  // the words of the default view (SPEC-4 0.26) stay out of the picker
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bis stale\b|\bbaseRevision\b/);
  await context.close();
});

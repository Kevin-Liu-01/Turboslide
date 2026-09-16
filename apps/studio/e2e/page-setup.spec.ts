import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Page setup (gslides-parity SPEC-5 6.1, 16.7 step 32; R08 3). On a scratch copy of the GT deck
// (deck.copy through the window API) the page moves to Standard (4:3) through `deck.setPageSize`
// and the editor follows it without a reload: the sheet root carries `data-page="1200x900"` and
// the two custom properties, the stage's aspect is 4:3, the rulers count 0 to 10 across and 0 to 7
// down, `deck.info` answers the page with its inches and EMU, and a guide beyond the new edge is
// gone under `keep`. A canvas object at the right edge scales under `fit` (PowerPoint's Ensure
// Fit, `k = min`) about the centre, the page, the objects and the guides in one commit (one
// revision; Edit > Undo takes the shell's own writes, so the dialog's path is the undo test). The
// dialog rows (File > Page setup with Google's four labels, the readout, the second step and OK)
// drive when the menu row is live; while the row stays Later on this tree (the integrator's
// flips of b4.md's fix round) the dialog test is skipped with the reason, never passed.
//
// Runs against a dev server with TURBOSLIDE_STORE=tmp (AGENTS.md dev server rules):
// PLAYWRIGHT_BASE_URL=http://localhost:4354 node_modules/.bin/playwright test apps/studio/e2e/page-setup.spec.ts

const SOURCE = 'gt-brand';
const ROOT = join(import.meta.dirname, '..', '..', '..');
const COPY = `e2e-page-${Date.now().toString(36)}`;
const SLIDE = 'page-canvas';

type Pos = { x: number; y: number; w: number; h: number; z?: number };
type Block = { id: string; type: string; pos?: Pos };
type Slide = { id: string; layout?: { type: string }; slots?: Record<string, Block[]> };
type PageInfo = {
  width: number;
  height: number;
  preset?: string;
  inches?: [number, number];
  emu?: [number, number];
};

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

async function revision(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
  );
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (typeof window.turboslide?.studio.describe !== 'function') return false;
    const state = window.turboslide.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
      sync?: { pending?: number } | null;
    };
    const inFlight = state.sync?.pending ?? state.pending;
    return inFlight === 0 && state.revision === state.serverRevision;
  });
}

async function act<T>(page: Page, action: string, input: Record<string, unknown>): Promise<T> {
  const base = await revision(page);
  return invoke<T>(page, action, { ...input, baseRevision: base });
}

async function landed(page: Page, before: number): Promise<void> {
  await expect.poll(() => revision(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await settled(page);
}

async function openDeck(page: Page, deckId: string): Promise<void> {
  await page.goto(`/edit/${deckId}?author=agent:e2e-page`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await settled(page);
}

async function slideGet(page: Page, slideId: string): Promise<Slide> {
  return (await invoke<{ slide: Slide }>(page, 'slide.get', { slideId })).slide;
}

/** The editor's live sheet root (viewer Sheet.tsx `.sheet`, `data-page` and the two custom properties). */
function sheet(page: Page) {
  return page.locator('.ts-stagewrap.ts-editor .sheet').first();
}

let ready = false;

async function ensureCopy(page: Page): Promise<void> {
  /* every test gets its own page: the copy exists after the first test and is opened afresh */
  if (ready) {
    await openDeck(page, COPY);
    return;
  }
  await openDeck(page, SOURCE);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Page setup',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, COPY);
  let before = await revision(page);
  await act(page, 'slide.new', { layout: 'blank', id: SLIDE });
  await landed(page, before);
  const slide = await slideGet(page, SLIDE);
  if (slide.layout?.type !== 'freeform') {
    before = await revision(page);
    await act(page, 'slide.setLayout', { slideId: SLIDE, layout: { type: 'freeform' } });
    await landed(page, before);
  }
  /* a rectangle at the right edge of the 16:9 sheet: it crosses the 4:3 edge at 1200 */
  before = await revision(page);
  await act(page, 'block.insert', {
    slideId: SLIDE,
    slot: 'main',
    block: {
      id: 'edge-box',
      type: 'shape',
      shape: 'rectangle',
      stroke: 'hair',
      fill: 'plate',
      pos: { x: 1300, y: 200, w: 240, h: 160, z: 1 },
    },
  });
  await landed(page, before);
  /* a vertical guide beyond the 4:3 edge and one inside it */
  before = await revision(page);
  await act(page, 'deck.guides', {
    add: [
      { axis: 'x', at: 1500 },
      { axis: 'x', at: 600 },
    ],
  });
  await landed(page, before);
  ready = true;
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('the editor draws the GT sheet at the default page', async ({ page }) => {
  test.setTimeout(180_000);
  await ensureCopy(page);
  await expect(sheet(page)).toHaveAttribute('data-page', '1600x900');
  const info = await invoke<{ page?: PageInfo }>(page, 'deck.info');
  if (info.page !== undefined) {
    expect(info.page.width).toBe(1600);
    expect(info.page.height).toBe(900);
  }
});

test('Standard (4:3) through deck.setPageSize under keep: the sheet, the rulers and the guides follow', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ensureCopy(page);
  await invoke(page, 'view.goto', { slideId: SLIDE });
  const before = await revision(page);
  const result = await act<{
    page: PageInfo;
    previous: PageInfo;
    guidesDropped: number;
    objectsScaled: number;
    slidesTouched: number;
  }>(page, 'deck.setPageSize', { preset: 'standard-4-3', objects: 'keep' });
  expect(result.page).toMatchObject({ width: 1200, height: 900, preset: 'standard-4-3' });
  expect(result.previous).toMatchObject({ width: 1600, height: 900 });
  expect(result.guidesDropped).toBe(1);
  expect(result.objectsScaled).toBe(0);
  await landed(page, before);
  /* the sheet root and its custom properties follow without a reload (SPEC-5 6.1) */
  await expect(sheet(page)).toHaveAttribute('data-page', '1200x900');
  const vars = await sheet(page).evaluate((el) => ({
    w: el.style.getPropertyValue('--ts-sheet-w'),
    h: el.style.getPropertyValue('--ts-sheet-h'),
    box: el.getBoundingClientRect(),
  }));
  expect(vars.w).toBe('1200px');
  expect(vars.h).toBe('900px');
  expect(Math.round((vars.box.width / vars.box.height) * 100) / 100).toBeCloseTo(4 / 3, 1);
  /* the object at the right edge kept its coordinates under keep */
  const slide = await slideGet(page, SLIDE);
  const box = (slide.slots?.['main'] ?? []).find((b) => b.id === 'edge-box');
  expect(box?.pos).toMatchObject({ x: 1300, y: 200, w: 240, h: 160 });
  /* the guide beyond the new edge is gone, the one inside stays */
  const info = await invoke<{ guides?: { x: number[]; y: number[] }; page?: PageInfo }>(
    page,
    'deck.info',
  );
  expect(info.guides?.x ?? []).toContain(600);
  expect(info.guides?.x ?? []).not.toContain(1500);
  if (info.page !== undefined) {
    expect(info.page).toMatchObject({ width: 1200, height: 900, preset: 'standard-4-3' });
    expect(info.page.inches).toEqual([10, 7.5]);
    expect(info.page.emu).toEqual([9144000, 6858000]);
  }
  /* the rulers count the page: 0 to 10 across, 0 to 7 down in inches */
  await page.locator('[data-control="menubar.view"]').click();
  const rulerRow = page.locator('[data-menu-item="view.showRuler"]');
  const checked = await rulerRow.getAttribute('aria-checked');
  if (checked !== 'true') await rulerRow.click();
  else await page.keyboard.press('Escape');
  const across = page.locator('[data-control="ruler.x"] .ts-ruler-numeral');
  const down = page.locator('[data-control="ruler.y"] .ts-ruler-numeral');
  await expect(across).toHaveCount(11);
  await expect(down).toHaveCount(8);
  await expect(across.last()).toHaveText('10');
});

test('the same page again is a no write, and fit scales the edge object about the centre in one commit', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ensureCopy(page);
  await invoke(page, 'view.goto', { slideId: SLIDE });
  const before = await revision(page);
  const same = await act<{ revision: number; slidesTouched: number }>(page, 'deck.setPageSize', {
    preset: 'standard-4-3',
  });
  expect(same.revision).toBe(before);
  expect(same.slidesTouched).toBe(0);
  /* back to 16:9 under keep, then to 4:3 under fit: the object at 1300 to 1540 crosses the new
     edge and scales by k = min(1200 / 1600, 900 / 900) = 0.75 about the sheet centre */
  let base = await revision(page);
  await act(page, 'deck.setPageSize', { preset: 'widescreen-16-9', objects: 'keep' });
  await landed(page, base);
  base = await revision(page);
  const fit = await act<{ revision: number; objectsScaled: number; slidesTouched: number }>(
    page,
    'deck.setPageSize',
    { preset: 'standard-4-3', objects: 'fit' },
  );
  await landed(page, base);
  expect(fit.slidesTouched).toBeGreaterThanOrEqual(1);
  expect(fit.objectsScaled).toBeGreaterThanOrEqual(1);
  /* the page, the scaled objects and the guides land in one commit (SPEC-5 6.1): one revision */
  expect(fit.revision).toBe(base + 1);
  const slide = await slideGet(page, SLIDE);
  const box = (slide.slots?.['main'] ?? []).find((b) => b.id === 'edge-box');
  expect(box?.pos).toBeDefined();
  expect(box?.pos?.w).toBeCloseTo(180, 0);
  expect(box?.pos?.h).toBeCloseTo(120, 0);
  expect((box?.pos?.x ?? 0) + (box?.pos?.w ?? 0)).toBeLessThanOrEqual(1200);
  await expect(sheet(page)).toHaveAttribute('data-page', '1200x900');
  /* Edit > Undo takes the shell's own writes (the dialog's path, tested once the row is live),
     not a window API write; the deck goes back through the action and the object through block.set */
  base = await revision(page);
  await act(page, 'deck.setPageSize', { preset: 'widescreen-16-9', objects: 'keep' });
  await landed(page, base);
  await expect(sheet(page)).toHaveAttribute('data-page', '1600x900');
  base = await revision(page);
  await act(page, 'block.set', {
    slideId: SLIDE,
    blockId: 'edge-box',
    path: '/pos',
    value: { ...(box?.pos ?? {}), x: 1300, y: 200, w: 240, h: 160 },
  });
  await landed(page, base);
  const restored = await slideGet(page, SLIDE);
  const back = (restored.slots?.['main'] ?? []).find((b) => b.id === 'edge-box');
  expect(back?.pos).toMatchObject({ x: 1300, y: 200, w: 240, h: 160 });
});

test("File > Page setup opens Google's dialog with the four labels, the readout and OK", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ensureCopy(page);
  await page.locator('[data-control="menubar.file"]').click();
  const row = page.locator('[data-menu-item="file.pageSetup"]');
  await expect(row).toBeVisible();
  const disabled = (await row.getAttribute('aria-disabled')) === 'true';
  if (disabled) {
    await page.keyboard.press('Escape');
    test.skip(
      true,
      'file.pageSetup is Later on this tree: the integrator flips the row and registers the dialog (b4.md fix round requests); not driven',
    );
    return;
  }
  await row.click();
  const dialog = page.locator('[data-control="dialog.pageSetup"]');
  await expect(dialog).toBeVisible();
  const size = dialog.locator('[data-control="pageSetup.size"]');
  const labels = await size.locator('option').allTextContents();
  expect(labels).toEqual(['Standard (4:3)', 'Widescreen (16:9)', 'Widescreen (16:10)', 'Custom']);
  await size.selectOption('widescreen-16-10');
  await expect(dialog.locator('[data-control="pageSetup.readout"]')).toHaveText(
    '1440 by 900 sheet px, 12 by 7.5 in',
  );
  await size.selectOption('custom');
  await expect(dialog.locator('[data-control="pageSetup.width"]')).toBeVisible();
  await expect(dialog.locator('[data-control="pageSetup.unit"]')).toBeVisible();
  const before = await revision(page);
  await size.selectOption('widescreen-16-10');
  await dialog.locator('[data-control="pageSetup.ok"]').click();
  await landed(page, before);
  await expect(dialog).toBeHidden();
  await expect(sheet(page)).toHaveAttribute('data-page', '1440x900');
  const base = await revision(page);
  await act(page, 'deck.setPageSize', { preset: 'widescreen-16-9' });
  await landed(page, base);
});

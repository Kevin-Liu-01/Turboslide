import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  ctl,
  headingRun,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  settled,
  slideJson,
  slideOrder,
  teardownAll,
  title,
  typeInto,
} from './lib';

// Slides, the spec row (docs/FOCUS.md 2.2, 6.4 `slides.clipboard.copy-paste-card`, driver
// core/slides.spec.ts): a slide copied from a filmstrip card's right click menu and pasted after
// another card, within one deck and between two decks open in two tabs of one browser. The Round 1
// follow-up, lane A, adds the Import slides row of the example deck a fresh browser is offered
// (`slides.import.example-deck`, a second context of its own).
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/slides.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
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

async function copyCard(p: Page, slideId: string): Promise<void> {
  await p.locator(`[data-control="filmstrip.slide.${slideId}"]`).click({ button: 'right' });
  await p.locator('.ts-context-menu [data-control="menu.edit.copy"]').first().click();
  await p.waitForTimeout(300);
}
async function pasteAfterCard(p: Page, slideId: string): Promise<void> {
  await p.locator(`[data-control="filmstrip.slide.${slideId}"]`).click({ button: 'right' });
  const row = p.locator('.ts-context-menu [data-control="menu.edit.paste"]').first();
  await row.waitFor({ timeout: 6000 });
  /* a disabled Paste row is the row's failure, read at once rather than as a click that waits
     for the test's timeout: in a tab that has not copied anything the menu predicate reads the
     page's own clipboard payload alone and disables Paste while the system clipboard holds the
     other tab's envelope (b4.md Fix round FR2) */
  await expect(row, 'the Paste row is enabled').not.toHaveAttribute('aria-disabled', 'true', {
    timeout: 3000,
  });
  await row.click();
  await p.waitForTimeout(300);
}

test(title('slides.clipboard.copy-paste-card'), async () => {
  test.setTimeout(240_000);
  const a = await newDeck(page, scratch, 'Copy paste source');
  const first = await slideOrder(page);
  const source = await addSlide(page);
  const run = await headingRun(page);
  await typeInto(page, run, 'Travelling slide');
  await settled(page);
  /* within the deck: right click the source card > Copy, right click the first card > Paste */
  await copyCard(page, source);
  await pasteAfterCard(page, first[0]!);
  await expect
    .poll(async () => (await slideOrder(page)).length, { timeout: 15_000 })
    .toBe(first.length + 2);
  const within = await slideOrder(page);
  const pasted = within.find((id) => !first.includes(id) && id !== source)!;
  expect(within.indexOf(pasted), 'the pasted slide lands after the card it was pasted on').toBe(
    within.indexOf(first[0]!) + 1,
  );
  expect(JSON.stringify(await slideJson(page, pasted))).toContain('Travelling slide');
  await settled(page);
  /* between two decks in two tabs: copy in deck A, paste in deck B */
  const pageB = await context.newPage();
  const b = await newDeck(pageB, scratch, 'Copy paste target');
  const beforeB = await slideOrder(pageB);
  await page.bringToFront();
  await openEditor(page, a);
  await clickCard(page, source);
  await copyCard(page, source);
  await pageB.bringToFront();
  await pasteAfterCard(pageB, beforeB[0]!);
  await expect
    .poll(async () => (await slideOrder(pageB)).length, { timeout: 15_000 })
    .toBe(beforeB.length + 1);
  const afterB = await slideOrder(pageB);
  const landed = afterB.find((id) => !beforeB.includes(id))!;
  expect(afterB.indexOf(landed)).toBe(afterB.indexOf(beforeB[0]!) + 1);
  expect(JSON.stringify(await slideJson(pageB, landed))).toContain('Travelling slide');
  await settled(pageB);
  await pageB.close();
  void b;
});

/** What the open Import slides dialog lists: the deck rows, the sentences and whether it is busy. */
async function importListing(p: Page) {
  return p.evaluate(() => {
    const dialog = document.querySelector('[data-control="dialog.importSlides"]');
    if (dialog === null) return { open: false, busy: false, rows: [], metas: [], sentences: [] };
    const buttons = [...dialog.querySelectorAll('[data-control^="dialog.importSlides.deck."]')];
    return {
      open: true,
      busy: dialog.querySelector('[aria-busy="true"]') !== null,
      rows: buttons.map((el) =>
        (el.getAttribute('data-control') ?? '').replace('dialog.importSlides.deck.', ''),
      ),
      metas: buttons.map((el) => el.querySelector('.ts-dialog-row-meta')?.textContent ?? ''),
      sentences: [...dialog.querySelectorAll('.ts-dialog-empty')].map(
        (el) => el.textContent?.trim() ?? '',
      ),
    };
  });
}

/** File > Import slides, waited until its listing has landed. */
async function openImportSlides(p: Page) {
  await menuPath(p, 'file', 'file.importSlides');
  await ctl(p, 'dialog.importSlides').waitFor({ timeout: 8000 });
  await expect
    .poll(async () => (await importListing(p)).busy, { timeout: 30_000 })
    .toBe(false);
  return importListing(p);
}

/** The tile buttons of step 2. */
const TILES = '[data-control^="dialog.importSlides.slide."]';

test(title('slides.import.example-deck'), async ({ browser }) => {
  test.setTimeout(240_000);
  /* a fresh browser: a context of its own, whose one deck is the one it imports into */
  const fresh = await ownerContext(browser);
  const own = new Scratch();
  try {
    await newDeck(fresh.page, own, 'Import target');
    /* File > Open lists this browser's decks: the example deck is not one of them */
    await menuPath(fresh.page, 'file', 'file.open');
    await ctl(fresh.page, 'dialog.open').waitFor({ timeout: 8000 });
    await expect
      .poll(
        () =>
          fresh.page.evaluate(
            () =>
              document.querySelector('[data-control="dialog.open"] [aria-busy="true"]') === null,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    expect(await ctl(fresh.page, 'dialog.open.deck.gt-brand').count()).toBe(0);
    await fresh.page.keyboard.press('Escape');
    await ctl(fresh.page, 'dialog.open').waitFor({ state: 'detached', timeout: 4000 });
    /* File > Import slides offers the example deck under a sentence true of this browser's decks */
    const listed = await openImportSlides(fresh.page);
    expect(listed.rows, 'the example deck is the one presentation offered').toEqual(['gt-brand']);
    expect(listed.metas[0]).toMatch(/^Example · \d+ slides$/);
    expect(listed.sentences).toEqual(['You have no other presentations yet']);
    const before = await slideOrder(fresh.page);
    await ctl(fresh.page, 'dialog.importSlides.deck.gt-brand').click();
    const tiles = fresh.page.locator(TILES);
    await tiles.first().waitFor({ timeout: 30_000 });
    expect(
      await fresh.page.locator(`${TILES}[aria-selected="true"]`).count(),
      'no tile is picked when the list opens',
    ).toBe(0);
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(ctl(fresh.page, 'dialog.importSlides.ok')).toHaveText('Import 2 slides');
    await ctl(fresh.page, 'dialog.importSlides.ok').click();
    await expect
      .poll(async () => (await slideOrder(fresh.page)).length, { timeout: 30_000 })
      .toBe(before.length + 2);
    const after = await slideOrder(fresh.page);
    const landed = after.filter((id) => !before.includes(id));
    expect(landed).toHaveLength(2);
    expect(after.indexOf(landed[0]!), 'the slides land after the current one').toBe(
      after.indexOf(before[0]!) + 1,
    );
    await settled(fresh.page);
  } finally {
    test.setTimeout(240_000);
    try {
      await teardownAll(fresh.page, own);
    } finally {
      await fresh.context.close();
    }
  }
});

coverage(import.meta.filename, [
  'slides.clipboard.copy-paste-card',
  'slides.import.example-deck',
]);

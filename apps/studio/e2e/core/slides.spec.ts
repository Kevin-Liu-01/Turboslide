import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  clickCard,
  coverage,
  headingRun,
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
// another card, within one deck and between two decks open in two tabs of one browser.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/slides.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ({ context, page } = await ownerContext(browser));
});
test.afterAll(async () => {
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

coverage(import.meta.filename, ['slides.clipboard.copy-paste-card']);

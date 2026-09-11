import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The landing, the templates and the Export menu (Kevin's directive: `/` opens the editor the
// way Google Slides opens a document, with exporting from the toolbar). Four steps, in order:
// `/` lands on /edit/<the newest deck> with the sidebar tree and the deck name as the toolbar's
// rename control beside the status chip and Search; New deck on /decks creates a deck
// from the GT brand template with 85 slides and opens it; the Export menu of a blank deck runs
// export.run (PPTX flatten, light) and the browser receives a download above 1 MB (the fonts
// alone are 1.9 MiB) while the ExportReport card summarizes the run; the Google Slides entry
// shows the setup card because TURBOSLIDE_GOOGLE_CREDENTIALS is not set. The decks the spec
// creates (decks/e2e-landing-deck, decks/e2e-landing-blank) are removed afterwards with their
// worker caches, so `git status decks` stays empty.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TEMPLATE_DECK = 'e2e-landing-deck';
const BLANK_DECK = 'e2e-landing-blank';

function removeDeck(id: string): void {
  rmSync(join(ROOT, 'decks', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  removeDeck(TEMPLATE_DECK);
  removeDeck(BLANK_DECK);
});

test.afterAll(() => {
  removeDeck(TEMPLATE_DECK);
  removeDeck(BLANK_DECK);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('/ lands on /edit/<the newest deck> with the sidebar tree', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/edit\/[a-z0-9-]+/);
  await settled(page);
  expect(await page.locator('.pt-orow').count()).toBeGreaterThan(0);
  /* the deck name sits in the toolbar as the rename control (deck.rename) in the default view,
     with the list open (the M5 integration hid it at the fourth label tier, which 1440 reaches):
     a click opens the field over the same box, Escape restores the title */
  const name = page.locator('.pt-toolbar button[data-control="deck.name"]');
  await expect(name).toBeVisible();
  const title = await name.textContent();
  await name.click();
  const field = page.locator('.pt-toolbar input[data-control="deck.name"]');
  await expect(field).toBeVisible();
  await expect(field).toHaveValue(title ?? '');
  await field.press('Escape');
  await expect(name).toBeVisible();
  await expect(name).toHaveText(title ?? '');
  /* after the round trip the name keeps at least its 56px minimum, and the status chip and the
     Search pill keep their own boxes beside it (the M5 verification found the chip drawn under
     Search at 1280); the tier the bar lands on is the measure's business, so the boxes are read
     fresh here */
  await expect(async () => {
    const nameBox = await name.boundingBox();
    const chip = await page.locator('[data-control="edit.status"]').boundingBox();
    const search = await page.locator('[data-control="palette.open"]').boundingBox();
    expect(nameBox).not.toBeNull();
    expect(chip).not.toBeNull();
    expect(search).not.toBeNull();
    expect(nameBox!.width).toBeGreaterThanOrEqual(56);
    expect(chip!.x).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width - 1);
    expect(search!.x).toBeGreaterThanOrEqual(chip!.x + chip!.width);
  }).toPass({ timeout: 5_000 });
  await expect(page.locator('[data-control="export.open"]')).toBeVisible();
});

test('New deck from the GT brand template creates a deck with 85 slides and opens it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/decks');
  await expect(page.locator('h1')).toHaveText('Decks');
  // The page is server rendered; on the dev server the first visit can hydrate late or reload once
  // the dependency optimizer finds new modules (measured in the M5 integration: the click landed
  // before hydration and the form never opened), so the click is retried until the form is there.
  await expect(async () => {
    await page.locator('[data-control="decks.new"]').click();
    await expect(page.locator('[data-control="decks.name"]')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await page.locator('[data-control="decks.name"]').fill('E2E landing deck');
  await expect(page.locator('[data-control="decks.from.gt-brand"]')).toBeChecked();
  await page.locator('[data-control="decks.create"]').click();
  await expect(page).toHaveURL(new RegExp(`/edit/${TEMPLATE_DECK}`));
  await settled(page);
  const info = (await page.evaluate(() => window.turboslide!.studio.invoke('deck.info'))) as {
    id: string;
    title: string;
    revision: number;
    counts: { slides: number; sections: number; assets: number };
  };
  expect(info.id).toBe(TEMPLATE_DECK);
  expect(info.title).toBe('E2E landing deck');
  expect(info.revision).toBe(0);
  expect(info.counts.slides).toBe(85);
  expect(info.counts.sections).toBe(8);
  expect(info.counts.assets).toBeGreaterThan(100);
  await expect(page.locator('.pt-orow')).toHaveCount(85);
  expect(existsSync(join(ROOT, 'decks', TEMPLATE_DECK, 'assets'))).toBe(true);
  /* the list shows the new deck first, newest by updatedAt */
  await page.goto('/decks');
  await expect(page.locator('.ts-decks-row').first()).toHaveAttribute('data-deck', TEMPLATE_DECK);
});

test('the Export menu produces a PPTX download above 1 MB and an ExportReport card', async ({
  page,
}) => {
  test.setTimeout(180_000);
  /* a blank deck through the window API's deck.create, so the export runs on one slide */
  await page.goto(`/edit/${TEMPLATE_DECK}?author=agent:e2e-landing`);
  await settled(page);
  const created = (await page.evaluate(() =>
    window.turboslide!.studio.invoke('deck.create', {
      name: 'E2E landing blank',
      from: 'blank',
    }),
  )) as { deckId: string; counts: { slides: number } };
  expect(created.deckId).toBe(BLANK_DECK);
  expect(created.counts.slides).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/edit/${BLANK_DECK}`));
  await settled(page);

  await page.locator('[data-control="export.open"]').click();
  const menu = page.locator('[data-control="export.menu"]');
  await expect(menu).toBeVisible();
  await page.locator('[data-control="export.theme.light"]').click();
  await expect(page.locator('[data-control="export.theme.light"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
  await page.locator('[data-control="export.pptx"]').click();
  await expect(menu).toHaveAttribute('data-busy', '');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${BLANK_DECK}-light.pptx`);
  const path = await download.path();
  expect(statSync(path).size).toBeGreaterThan(1_000_000);

  const card = page.locator('[data-control="export.report"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-passed', 'true');
  await expect(card).toContainText('pptx flatten, light');
  await expect(card).toContainText('1 (one per slide per theme)');
  await expect(card).toContainText('Fonts embedded');
  await expect(
    card.locator(`[data-control="export.download.${BLANK_DECK}-light.pptx"]`),
  ).toBeVisible();
  /* the export.run result is the ExportReport, the same claim the CLI prints */
  const versions = (await page.evaluate(() =>
    window.turboslide!.studio.invoke('version.list'),
  )) as unknown[];
  expect(Array.isArray(versions)).toBe(true);
  await card.locator('[data-control="export.report.close"]').click();
  await expect(card).toHaveCount(0);
});

test('the Google Slides entry shows the setup card without credentials', async ({ page }) => {
  test.skip(
    Boolean(process.env.TURBOSLIDE_GOOGLE_CREDENTIALS),
    'credentials are configured on this machine',
  );
  await page.goto(`/edit/${BLANK_DECK}`);
  await settled(page);
  await page.locator('[data-control="export.open"]').click();
  const google = page.locator('[data-control="export.gslides"]');
  await expect(google).toBeEnabled();
  await expect(google).toHaveText('Set up Google Slides');
  await google.click();
  const setup = page.locator('[data-control="export.setup"]');
  await expect(setup).toBeVisible();
  await expect(setup).toContainText('TURBOSLIDE_GOOGLE_CREDENTIALS');
  await expect(setup).toContainText('https://www.googleapis.com/auth/drive.file');
  await expect(setup).toContainText('Enable the Google Slides API and the Google Drive API');
  await setup.locator('[data-control="export.setup.close"]').click();
  await expect(setup).toHaveCount(0);
});

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Deck transfer in the studio's pages (docs/deck-transfer.md): the /decks row's Download bundle
// downloads `<id>-r<revision>.zip` through the bundle route with a ticket from the server function
// (no bearer in the page); Upload deck bundle takes a zip `turboslide deck pack` wrote, creates the
// deck under a free sibling id and opens it in the editor; the editor's Export menu has Download
// deck bundle and its toolbar has Presentation, which opens /deck/<id>?present=1 in a new tab in
// present mode; the same address opens in present mode directly. The spec works on decks/fixture
// (always in a checkout) and removes the deck the upload creates. A click on /decks waits for the
// page to announce hydration (`data-hydrated`, decks.index.tsx): on the dev server the server's
// HTML takes a click up to 1.5 s before the handlers are attached and the click is lost (measured
// 2026-09-12: two of these four tests timed out that way).

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'fixture';
const created: string[] = [];

function removeCreated(): void {
  for (const id of created) {
    rmSync(join(ROOT, 'decks', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
  }
  created.length = 0;
}

test.afterEach(removeCreated);

/** /decks with its handlers attached. */
async function openDecks(page: Page): Promise<void> {
  await page.goto('/decks');
  await page.locator('.ts-decks-page[data-hydrated]').waitFor({ timeout: 30_000 });
}

test('Download bundle on a /decks row downloads the deck as a zip', async ({ page }) => {
  await openDecks(page);
  const row = page.locator(`.ts-decks-row[data-deck="${DECK}"]`);
  await expect(row).toBeVisible();
  const download = page.waitForEvent('download');
  await row.locator(`[data-control="decks.bundle.${DECK}"]`).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^fixture-r\d+\.zip$/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(bytes.byteLength).toBeGreaterThan(1000);
});

test('Upload deck bundle creates the deck under a free id and opens it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'turboslide-e2e-upload-'));
  const zip = join(dir, 'fixture.zip');
  execFileSync(
    'node',
    [join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs'), 'deck', 'pack', DECK, '--out', zip],
    { cwd: ROOT, stdio: 'ignore' },
  );
  expect(existsSync(zip)).toBe(true);
  await openDecks(page);
  await page.locator('[data-control="decks.upload"]').click();
  await page.locator('[data-control="decks.bundle-file"]').setInputFiles(zip);
  await page.locator('[data-control="decks.bundle-submit"]').click();
  await page.waitForURL(/\/edit\/fixture-\d+/, { timeout: 30_000 });
  const id = /\/edit\/(fixture-\d+)/.exec(page.url())?.[1] ?? '';
  created.push(id);
  expect(existsSync(join(ROOT, 'decks', id, 'deck.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(ROOT, 'decks', id, 'deck.json'), 'utf8')) as {
    id: string;
  };
  expect(manifest.id).toBe(id);
  await page.goto('/decks');
  await expect(page.locator(`.ts-decks-row[data-deck="${id}"]`)).toBeVisible();
  rmSync(dir, { recursive: true, force: true });
});

test('the editor offers Download deck bundle and Presentation opens present mode in a new tab', async ({
  page,
  context,
}) => {
  await page.goto(`/edit/${DECK}`);
  await page.locator('[data-control="export.open"]').click({ timeout: 30_000 });
  const entry = page.locator('[data-control="export.bundle"]');
  await expect(entry).toBeVisible();
  const download = page.waitForEvent('download');
  await entry.click();
  expect((await download).suggestedFilename()).toMatch(/^fixture-r\d+\.zip$/);
  const popup = context.waitForEvent('page');
  await page.locator('[data-control="present.open"]').click();
  const presentation = await popup;
  await presentation.waitForLoadState();
  expect(presentation.url()).toContain(`/deck/${DECK}?present=1`);
  await expect(presentation.locator('.pt-viewer.is-present')).toBeVisible({ timeout: 15_000 });
  await presentation.close();
});

test('/deck/<id>?present=1 opens the presentation in present mode', async ({ page }) => {
  await page.goto(`/deck/${DECK}?present=1`);
  await expect(page.locator('.pt-viewer.is-present')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/deck/${DECK}`);
  await expect(page.locator('.pt-viewer')).toBeVisible();
  await expect(page.locator('.pt-viewer.is-present')).toHaveCount(0);
});

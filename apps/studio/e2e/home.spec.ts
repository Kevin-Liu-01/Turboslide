import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The home page and the trash (gslides-parity SPEC 6.2, 6.4, 6.5; SPEC 14.3 `home.spec.ts`): the
// template strip, the recent cards with thumbnails, search, sort, the grid and list toggle, the
// card menu; Move to trash hides the deck and Undo or Restore brings it back; Delete forever
// removes it; Rename writes the title; Make a copy opens the copy in a new tab without the
// speaker notes. The spec seeds two scratch decks from decks/fixture (decks/e2e-home-alpha, the
// newer, and decks/e2e-home-beta, with a speaker note) and removes them and the copy it makes,
// with their caches. A click on the page waits for `data-hydrated` (decks.index.tsx): the
// server's HTML takes a click before the handlers attach and loses it.
//
// The Open dialog (File > Open) is B3's; "the Open dialog lists and opens" of SPEC 14.3 is
// asserted by the chrome's own specs once the dialog is mounted, not here.
//
// Round four (gslides-parity SPEC-4 0.29, 0.32, 3.1, 3.3; MILESTONES-4 B3 item 6): the Recent row
// is in the server's HTML once this browser has opened a deck (the record's cookie mirror,
// routes/-recent.ts) and the store's cards are in the same document or arrive after it; Delete
// forever takes the card out within 100 ms of the confirm click and it stays out after the
// loader answers; a removal the store refuses (a stale revision planted in the manifest) brings
// the card back with the error sentence in the snackbar.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = join(ROOT, 'decks');
const ALPHA = 'e2e-home-alpha';
const BETA = 'e2e-home-beta';
const COPY = 'copy-of-home-beta';

function seedDeck(id: string, title: string, updatedAt: string, note?: string): void {
  const dir = join(DECKS, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(DECKS, 'fixture', 'slides'), join(dir, 'slides'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(DECKS, 'fixture', 'deck.json'), 'utf8')) as {
    id: string;
    title: string;
    updatedAt: string;
    createdAt: string;
  };
  manifest.id = id;
  manifest.title = title;
  manifest.updatedAt = updatedAt;
  manifest.createdAt = updatedAt;
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (note !== undefined) {
    const path = join(dir, 'slides', 'title.json');
    const slide = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    slide.notes = note;
    writeFileSync(path, `${JSON.stringify(slide, null, 2)}\n`);
  }
}

function removeDeck(id: string): void {
  rmSync(join(DECKS, id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
}

function manifestOf(id: string): { title: string; trashedAt?: string; revision: number } {
  return JSON.parse(readFileSync(join(DECKS, id, 'deck.json'), 'utf8')) as {
    title: string;
    trashedAt?: string;
    revision: number;
  };
}

/** Moves the manifest's revision on disk, so a write carrying the card's revision is refused as stale. */
function bumpRevision(id: string, by = 7): void {
  const path = join(DECKS, id, 'deck.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { revision: number };
  manifest.revision += by;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** /decks with its handlers attached. */
async function openHome(page: Page): Promise<void> {
  await page.goto('/decks');
  await page.locator('.ts-home-page[data-hydrated]').waitFor({ timeout: 30_000 });
}

async function openTrash(page: Page): Promise<void> {
  await page.goto('/decks/trash');
  await page.locator('.ts-trash-page[data-hydrated]').waitFor({ timeout: 30_000 });
}

async function openCardMenu(page: Page, id: string): Promise<void> {
  await page.locator(`[data-control="home.more.${id}"]`).click();
  await expect(page.locator('#home-card-menu[role="menu"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  seedDeck(ALPHA, 'Home alpha', '2026-09-12T10:00:00.000Z');
  seedDeck(BETA, 'Home beta', '2026-09-11T10:00:00.000Z', 'Speak slowly here.');
});

test.afterAll(() => {
  for (const id of [ALPHA, BETA, COPY]) removeDeck(id);
});

test.beforeEach(async ({ page }) => {
  /* a clean browser history per test, cleared once (an init script would clear it on every
     navigation and erase the opens a test records) */
  await page.goto('/decks');
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('the three bands: the strip, the recent cards with thumbnails, search, sort and the view toggle', async ({
  page,
}) => {
  await openHome(page);
  await expect(page).toHaveTitle('Recent presentations, Turboslide');
  /* the app bar and the strip (SPEC 6.2) */
  await expect(page.locator('[data-control="home.search"]')).toHaveAttribute(
    'placeholder',
    'Search presentations',
  );
  await expect(page.getByRole('heading', { name: 'Start a new presentation' })).toBeVisible();
  await expect(page.locator('[data-control="home.blank"]')).toHaveAttribute('href', '/new');
  await expect(page.locator('[data-control="home.blank"]')).toContainText('Blank presentation');
  await expect(page.locator('[data-control="home.gt-brand"]')).toContainText('GT brand deck');
  await expect(page.locator('[data-control="home.gallery"]')).toHaveText('Template gallery');
  /* the recent list */
  await expect(page.getByRole('heading', { name: 'Recent presentations' })).toBeVisible();
  await expect(
    page.getByText('Every presentation on this Turboslide is listed here'),
  ).toBeVisible();
  const alpha = page.locator(`[data-control="home.card.${ALPHA}"]`);
  const beta = page.locator(`[data-control="home.card.${BETA}"]`);
  await expect(alpha).toBeVisible();
  await expect(beta).toBeVisible();
  await expect(alpha.locator('img')).toHaveAttribute(
    'src',
    new RegExp(`/api/render/title\\?deck=${ALPHA}&theme=dark&w=320&r=\\d+`),
  );
  await expect(alpha.locator('.ts-hm-card-when')).toContainText('Edited');
  /* the default order is Last opened by me, which falls back to the last edit: alpha is newer */
  const titles = () =>
    page.locator('[data-control="home.cards"] .ts-hm-card-title').allTextContents();
  let order = await titles();
  expect(order.indexOf('Home alpha')).toBeLessThan(order.indexOf('Home beta'));
  /* Title sorts beta after alpha too; Last modified keeps alpha first */
  await page.locator('[data-control="home.sort"]').selectOption('title');
  order = await titles();
  expect(order.indexOf('Home alpha')).toBeLessThan(order.indexOf('Home beta'));
  await page.locator('[data-control="home.sort"]').selectOption('modified');
  order = await titles();
  expect(order.indexOf('Home alpha')).toBeLessThan(order.indexOf('Home beta'));
  /* search filters by title */
  await page.locator('[data-control="home.search"]').fill('beta');
  await expect(alpha).toHaveCount(0);
  await expect(beta).toBeVisible();
  await page.locator('[data-control="home.search"]').fill('nothing like this');
  await expect(page.locator('[data-control="home.empty"]')).toContainText(
    'No presentation matches',
  );
  await page.locator('[data-control="home.search"]').fill('');
  await expect(alpha).toBeVisible();
  /* the list view: rows with the title, the last edit and the slide count */
  await page.locator('[data-control="home.view.list"]').click();
  await expect(page.locator('[data-control="home.view.list"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const row = page.locator(`[data-control="home.rows"] tr[data-deck="${ALPHA}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.ts-row-count')).toHaveText('2');
  await page.locator('[data-control="home.view.grid"]').click();
  await expect(page.locator('[data-control="home.cards"]')).toBeVisible();
  /* the Trash link at the bottom, and nothing else there */
  await expect(page.locator('[data-control="home.trash"]')).toHaveAttribute('href', '/decks/trash');
  await expect(page.locator('.ts-home-foot')).toHaveCount(0);
});

test('the card menu carries the items in order, follows the menu pattern and opens the deck', async ({
  page,
  context,
}) => {
  await openHome(page);
  await openCardMenu(page, ALPHA);
  const items = page.locator('#home-card-menu [role="menuitem"]');
  await expect(items).toHaveText([
    'Open',
    'Open in new tab',
    'Present',
    'Rename',
    'Make a copy',
    'Download',
    'Move to trash',
  ]);
  /* Esc closes and focus returns to the button (SPEC 13.2) */
  await page.keyboard.press('Escape');
  await expect(page.locator('#home-card-menu')).toHaveCount(0);
  await expect(page.locator(`[data-control="home.more.${ALPHA}"]`)).toBeFocused();
  /* Present opens the presentation in a new tab */
  await openCardMenu(page, ALPHA);
  const popup = context.waitForEvent('page');
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Present' }).click();
  const presentation = await popup;
  await presentation.waitForLoadState();
  expect(presentation.url()).toContain(`/deck/${ALPHA}?present=1`);
  await presentation.close();
  /* Open lands in the editor and records the open for Recent */
  await openCardMenu(page, ALPHA);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: /^Open$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${ALPHA}`));
  const opened = await page.evaluate(() => window.localStorage.getItem('turboslide:opened'));
  expect(opened).toContain(ALPHA);
  /* back on the home page the card reads Opened ... and sorts first under Last opened by me */
  await openHome(page);
  await expect(page.locator(`[data-control="home.card.${ALPHA}"] .ts-hm-card-when`)).toContainText(
    'Opened',
  );
});

test('Rename in place writes the title', async ({ page }) => {
  await openHome(page);
  await openCardMenu(page, ALPHA);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Rename' }).click();
  const field = page.locator(`[data-control="home.rename.${ALPHA}"]`);
  await expect(field).toBeFocused();
  await field.fill('Home alpha renamed');
  await field.press('Enter');
  await expect(page.locator(`[data-control="home.title.${ALPHA}"]`)).toHaveText(
    'Home alpha renamed',
    { timeout: 15_000 },
  );
  expect(manifestOf(ALPHA).title).toBe('Home alpha renamed');
});

test('Make a copy opens the copy in a new tab without the speaker notes', async ({
  page,
  context,
}) => {
  await openHome(page);
  await openCardMenu(page, BETA);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Make a copy' }).click();
  const dialog = page.locator('[data-control="home.copy"][role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Make a copy' })).toBeVisible();
  const name = dialog.locator('[data-control="home.copy.name"]');
  await expect(name).toHaveValue('Copy of Home beta');
  await expect(name).toBeFocused();
  await dialog.locator('[data-control="home.copy.remove-notes"]').check({ force: true });
  const popup = context.waitForEvent('page');
  await dialog.locator('[data-control="home.copy.ok"]').click();
  const tab = await popup;
  await tab.waitForURL(new RegExp(`/edit/${COPY}`), { timeout: 30_000 });
  await tab.close();
  await expect(dialog).toHaveCount(0);
  expect(existsSync(join(DECKS, COPY, 'deck.json'))).toBe(true);
  const copied = JSON.parse(readFileSync(join(DECKS, COPY, 'slides', 'title.json'), 'utf8')) as {
    notes?: string;
  };
  expect(copied.notes).toBeUndefined();
  expect(manifestOf(COPY).title).toBe('Copy of Home beta');
  await expect(page.locator(`[data-control="home.card.${COPY}"]`)).toBeVisible({
    timeout: 15_000,
  });
});

test('Move to trash hides the deck, Undo brings it back, the trash page restores and deletes forever', async ({
  page,
}) => {
  await openHome(page);
  /* Move to trash, then Undo from the snackbar */
  await openCardMenu(page, COPY);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Move to trash' }).click();
  await expect(page.locator(`[data-control="home.card.${COPY}"]`)).toHaveCount(0);
  const snackbar = page.locator('[data-control="snackbar"]');
  await expect(snackbar).toContainText('Moved to trash');
  await expect(async () => expect(manifestOf(COPY).trashedAt).toBeDefined()).toPass();
  await page.locator('[data-control="snackbar.action"]').click();
  await expect(page.locator(`[data-control="home.card.${COPY}"]`)).toBeVisible({
    timeout: 15_000,
  });
  expect(manifestOf(COPY).trashedAt).toBeUndefined();
  /* Move to trash again: gone from the home page after a reload, listed in the trash */
  await openCardMenu(page, COPY);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Move to trash' }).click();
  await expect(async () => expect(manifestOf(COPY).trashedAt).toBeDefined()).toPass();
  await openHome(page);
  await expect(page.locator(`[data-control="home.card.${COPY}"]`)).toHaveCount(0);
  await openTrash(page);
  await expect(page).toHaveTitle('Trash, Turboslide');
  const card = page.locator(`[data-control="trash.card.${COPY}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('.ts-hm-card-when')).toContainText('Trashed');
  /* Restore puts it back: the card leaves at the click (SPEC-4 0.32), the empty figure follows */
  await card.locator(`[data-control="trash.restore.${COPY}"]`).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('[data-control="trash.empty-state"] .ts-empty-title')).toHaveText(
    'Trash is empty',
  );
  expect(manifestOf(COPY).trashedAt).toBeUndefined();
  await openHome(page);
  await expect(page.locator(`[data-control="home.card.${COPY}"]`)).toBeVisible();
  /* Move to trash once more and Delete forever, through the confirming dialog */
  await openCardMenu(page, COPY);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Move to trash' }).click();
  await expect(async () => expect(manifestOf(COPY).trashedAt).toBeDefined()).toPass();
  await openTrash(page);
  await page.locator(`[data-control="trash.delete.${COPY}"]`).click();
  const dialog = page.locator('[data-control="trash.confirm"][role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText(
    'Delete Copy of Home beta forever? This cannot be undone',
  );
  /* Esc cancels and keeps the deck; the button then deletes */
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(existsSync(join(DECKS, COPY, 'deck.json'))).toBe(true);
  /* the optimistic path (SPEC-4 0.32): the card is out within 100 ms of the confirm click, and
     stays out once the loader has answered and the folder is gone */
  await page.locator(`[data-control="trash.delete.${COPY}"]`).click();
  const confirmAt = Date.now();
  await page.locator('[data-control="trash.confirm.ok"]').click();
  await expect(page.locator(`[data-control="trash.card.${COPY}"]`)).toHaveCount(0, {
    timeout: 100,
  });
  const goneMs = Date.now() - confirmAt;
  console.log(`delete forever: the card left ${goneMs} ms after the confirm click`);
  await expect.poll(() => existsSync(join(DECKS, COPY)), { timeout: 15_000 }).toBe(false);
  await expect(page.locator(`[data-control="trash.card.${COPY}"]`)).toHaveCount(0);
  await expect(page.locator('[data-control="trash.empty"]')).toBeDisabled();
});

test('a refused Delete forever brings the card back with the sentence (SPEC-4 0.32)', async ({
  page,
}) => {
  /* alpha goes to the trash, then its manifest moves on disk behind the page's back: the card's
     revision is stale and the store refuses the removal */
  await openHome(page);
  await openCardMenu(page, ALPHA);
  await page.locator('#home-card-menu [role="menuitem"]', { hasText: 'Move to trash' }).click();
  await expect(async () => expect(manifestOf(ALPHA).trashedAt).toBeDefined()).toPass();
  await openTrash(page);
  const card = page.locator(`[data-control="trash.card.${ALPHA}"]`);
  await expect(card).toBeVisible();
  bumpRevision(ALPHA);
  await page.locator(`[data-control="trash.delete.${ALPHA}"]`).click();
  await page.locator('[data-control="trash.confirm.ok"]').click();
  /* the card comes back with the refusal in the snackbar; the folder stays */
  await expect(page.locator('[data-control="snackbar"]')).toContainText('Delete forever:', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-control="snackbar"]')).toContainText(/stale/i);
  await expect(card).toBeVisible();
  expect(existsSync(join(DECKS, ALPHA, 'deck.json'))).toBe(true);
  /* Restore with the fresh revision puts alpha back on the home page */
  await openTrash(page);
  await page.locator(`[data-control="trash.restore.${ALPHA}"]`).click();
  await expect(page.locator(`[data-control="trash.card.${ALPHA}"]`)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(async () => expect(manifestOf(ALPHA).trashedAt).toBeUndefined()).toPass();
});

test("the Recent row is in the server's HTML once this browser opened a deck, and the store's cards are in the document (SPEC-4 0.29)", async ({
  page,
}) => {
  /* a browser that opened nothing here: no Recent row, the store's cards */
  let html = await (await page.request.get('/decks')).text();
  expect(html).not.toContain('data-control="home.recent"');
  /* open beta from its card: the record and its cookie mirror carry the facts of the card */
  await openHome(page);
  await page.locator(`[data-control="home.open.${BETA}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${BETA}`));
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
  const cookies = await page.context().cookies();
  const recent = cookies.find((cookie) => cookie.name === 'ts-recent');
  expect(recent?.path).toBe('/decks');
  expect(decodeURIComponent(recent?.value ?? '')).toContain(BETA);
  /* the server's HTML carries the row with beta's card, and the store's cards after it */
  html = await (await page.request.get('/decks')).text();
  const rowAt = html.indexOf('data-control="home.recent"');
  const cardAt = html.indexOf(`data-control="home.recent.${BETA}"`);
  const listAt = html.indexOf('data-control="home.cards"');
  expect(rowAt).toBeGreaterThan(0);
  expect(cardAt).toBeGreaterThan(rowAt);
  expect(html).toContain('Opened on this device');
  /* the list is in the same document on the file store; on a slow store the frames stand in */
  expect(listAt > rowAt || html.includes('data-control="home.pending"')).toBe(true);
  /* the row is not hidden until mounted: the cookie gave the server the opened order */
  expect(html).not.toMatch(/class="ts-recent"[^>]*data-pending/);
  /* on the page the row's card opens the editor, and the store's card of beta is there too */
  await openHome(page);
  await expect(page.locator(`[data-control="home.recent.${BETA}"]`)).toBeVisible();
  await expect(page.locator(`[data-control="home.card.${BETA}"]`)).toBeVisible();
  await page.locator(`[data-control="home.recent.open.${BETA}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${BETA}`));
});

test('the Blank card opens /new', async ({ page }) => {
  await openHome(page);
  await page.locator('[data-control="home.blank"]').click();
  await expect(page).toHaveURL(/\/new$/);
});

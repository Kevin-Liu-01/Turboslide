import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The hygiene items of the Google Slides parity round two (gslides-parity SPEC-2 8.6, 0.28 to
// 0.30, 0.61; MILESTONES-2 B6 item 6): Help > Help Turboslide improve opens the repository's
// issue page in a new tab; the first write from /new can be undone and the address stays on the
// saved deck; Edit > Select all with the filmstrip focused selects every card and Edit > Cut
// removes the selected slides with no snackbar; Edit > Select none clears a block selection. The
// spec works on a scratch copy of decks/fixture under the server's decks folder
// (TURBOSLIDE_E2E_DECKS_DIR, the tmp overlay's, SPEC-2 0.43) and removes it afterwards; the
// github.com request is answered by a route so no network is needed.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = process.env['TURBOSLIDE_E2E_DECKS_DIR'] ?? join(ROOT, 'decks');
const DECK = 'e2e-hygiene';
const DECK_DIR = join(DECKS, DECK);
const ISSUES = 'https://github.com/Kevin-Liu-01/Turboslide/issues/new';

/** A scratch copy of decks/fixture/gslides (27 slides, so Select all has cards to select) with its twins. */
function seedDeck(): void {
  const fixture = join(ROOT, 'decks', 'fixture', 'gslides');
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(fixture, 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  if (existsSync(join(fixture, 'assets')))
    cpSync(join(fixture, 'assets'), join(DECK_DIR, 'assets'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(fixture, 'deck.json'), 'utf8')) as { id: string };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDecks(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  // the drafts /new saved during the run
  for (const id of createdDrafts) rmSync(join(DECKS, id), { recursive: true, force: true });
}

const createdDrafts: string[] = [];

async function studioReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function openEditor(page: Page, slideId?: string): Promise<void> {
  await page.goto(`/edit/${DECK}`);
  await studioReady(page);
  if (slideId !== undefined) {
    await invoke(page, 'view.goto', { slideId });
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
  }
  await expect(page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first()).toBeVisible();
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

type State = { revision: number; serverRevision: number; pending: number; blockId: string | null };

async function state(page: Page): Promise<State> {
  return page.evaluate(() => window.turboslide!.studio.describe().state as unknown as State);
}

/** The editor's pending writes have all reached the server and the title row says so. */
async function allChangesSaved(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const s = window.turboslide!.studio.describe().state as {
      pending?: number;
      revision?: number;
      serverRevision?: number;
    };
    return s.pending === 0 && s.revision === s.serverRevision;
  });
  await expect(page.locator('[data-control="deck.saveState"]')).toContainText(/All changes saved/, {
    timeout: 30_000,
  });
}

const card = (page: Page, id: string) => page.locator(`.ts-filmstrip .ts-card[data-id="${id}"]`);
const menuItem = (page: Page, id: string) => page.locator(`[data-menu-item="${id}"]`).first();
const control = (page: Page, id: string) => page.locator(`[data-control="${id}"]`);

async function rows(page: Page): Promise<{ id: string }[]> {
  return invoke<{ id: string }[]>(page, 'slide.list');
}

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  removeDecks();
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

test('Help > Help Turboslide improve opens the repository’s issue page in a new tab (SPEC-2 0.28)', async ({
  page,
  context,
}) => {
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>issues</title>' }),
  );
  await openEditor(page);
  await control(page, 'menubar.help').click();
  const row = menuItem(page, 'help.improve');
  await expect(row).toBeVisible();
  await expect(row).toHaveText(/Help Turboslide improve/);
  const [popup] = await Promise.all([context.waitForEvent('page'), row.click()]);
  await popup.waitForLoadState();
  expect(popup.url().split('#')[0]).toBe(ISSUES);
  // the editor stays where it was
  expect(page.url()).toContain(`/edit/${DECK}`);
  await popup.close();
});

test('the first write from /new can be undone and the address stays on the saved deck (SPEC-2 0.29)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/new');
  await studioReady(page);
  expect(page.url()).toMatch(/\/new/);
  await expect(page.locator('[data-control="deck.saveState"]')).toContainText(/Not saved yet/);
  /* the Title slide's empty heading takes the first write */
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  await expect(heading).toBeVisible();
  const box = await heading.boundingBox();
  await page.mouse.click(box!.x + 8, box!.y + box!.height / 2);
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.type('Undo probe', { delay: 20 });
  await page.keyboard.press('Escape');
  /* the deck is created and the address moves without a route change */
  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .toMatch(/\/edit\/untitled-\d{8}-[a-z0-9]{4}/);
  const deckId = /\/edit\/(untitled-\d{8}-[a-z0-9]{4})/.exec(page.url())![1]!;
  createdDrafts.push(deckId);
  await allChangesSaved(page);
  const saved = await state(page);
  expect(saved.revision).toBeGreaterThanOrEqual(1);
  /* Undo is enabled: the draft's history carries the first write */
  await expect(control(page, 'toolbar.undo')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('.ts-stagewrap.ts-editor').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => state(page).then((s) => s.revision), { timeout: 30_000 })
    .toBeGreaterThan(saved.revision);
  await allChangesSaved(page);
  const got = await invoke<{ slide: { heading?: string } }>(page, 'slide.get', {
    slideId: 'title',
  });
  expect(got.slide.heading ?? '').toBe('');
  expect(page.url()).toContain(`/edit/${deckId}`);
  /* the saved deck stays: a reload lands on it with the empty heading */
  await page.reload();
  await studioReady(page);
  expect(page.url()).toContain(`/edit/${deckId}`);
  const after = await invoke<{ slide: { heading?: string } }>(page, 'slide.get', {
    slideId: 'title',
  });
  expect(after.slide.heading ?? '').toBe('');
});

test('Edit > Select all with the filmstrip focused selects every card, and Edit > Cut removes the selected slides with no snackbar (SPEC-2 0.30)', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, 'breaks');
  await allChangesSaved(page);
  const before = (await rows(page)).map((row) => row.id);
  expect(before.length).toBeGreaterThan(2);
  /* a click on a card gives the filmstrip focus; the menu bar takes it, and Edit still acts on the cards */
  await card(page, 'breaks').click();
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'breaks');
  await control(page, 'menubar.edit').click();
  await expect(menuItem(page, 'edit.selectAll')).not.toHaveAttribute('aria-disabled', 'true');
  await menuItem(page, 'edit.selectAll').click();
  await expect
    .poll(() => page.locator('.ts-filmstrip .ts-card[aria-selected="true"]').count(), {
      timeout: 10_000,
    })
    .toBe(before.length);
  /* two cards selected, then Cut from the menu bar: both go, no snackbar */
  await card(page, before[1]!).click();
  await card(page, before[2]!).click({ modifiers: ['Shift'] });
  await expect(page.locator('.ts-filmstrip .ts-card[aria-selected="true"]')).toHaveCount(2);
  await control(page, 'menubar.edit').click();
  await menuItem(page, 'edit.cut').click();
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before.filter((id) => id !== before[1] && id !== before[2]));
  await expect(page.locator('[data-control="snackbar"]')).not.toContainText('Slide deleted');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/^turboslide:v1:.*"kind":"slides"/);
  await allChangesSaved(page);
  /* Undo stays on Cmd+Z and in the Edit menu: both slides come back */
  await control(page, 'menubar.edit').click();
  await expect(menuItem(page, 'edit.undo')).not.toHaveAttribute('aria-disabled', 'true');
  await menuItem(page, 'edit.undo').click();
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before);
});

test('Edit > Select none clears a block selection (SPEC-2 0.61)', async ({ page }) => {
  await openEditor(page, 'breaks');
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
  await heading.click();
  await expect.poll(() => state(page).then((s) => s.blockId)).toBe('h');
  await control(page, 'menubar.edit').click();
  const row = menuItem(page, 'edit.selectNone');
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute('aria-disabled', 'true');
  await row.click();
  await expect.poll(() => state(page).then((s) => s.blockId)).toBeNull();
  await expect(page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]')).toHaveCount(0);
});

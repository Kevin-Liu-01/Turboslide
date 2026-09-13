import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// B4 acceptance of the Google Slides parity round (gslides-parity SPEC 14.3, filmstrip.spec):
// the cards of SPEC 4.1 with the current ring and the skipped state, Shift and Cmd multi-select,
// drag to reorder as one slide.move, Google's right-click menu in the order of SPEC 4.2 with Skip
// and Unskip, Delete with the snackbar and Undo, and the layout list from Apply layout.
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-film with four content slides
// and removes it afterwards. It runs against the dev server the builder starts on its own port:
// TURBOSLIDE_E2E_BASE (default http://localhost:4321, the shared playwright.config.ts base); the
// integrator owns playwright.config.ts.

const BASE = process.env['TURBOSLIDE_E2E_BASE'] ?? 'http://localhost:4321';
test.use({ baseURL: BASE });

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-film';
const DECK_DIR = join(ROOT, 'decks', DECK);

const CARD_ORDER = [
  'Cut',
  'Copy',
  'Paste',
  'New slide',
  'Duplicate slide',
  'Delete',
  'Skip slide',
  'Change background',
  'Apply layout',
  'Change theme',
  'Transition',
  'Move slide',
  'Comment',
];

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(join(DECK_DIR, 'slides'), { recursive: true });
  const fixture = join(ROOT, 'decks', 'fixture');
  cpSync(join(fixture, 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const content = JSON.parse(
    readFileSync(join(fixture, 'slides', 'content-rule.json'), 'utf8'),
  ) as {
    id: string;
    slots: { left: { id: string; text?: string }[] };
  };
  for (const id of ['second', 'third']) {
    const copy = { ...content, id };
    const heading = copy.slots.left[0];
    if (heading) heading.text = `Slide ${id}`;
    writeFileSync(join(DECK_DIR, 'slides', `${id}.json`), `${JSON.stringify(copy, null, 2)}\n`);
  }
  const manifest = JSON.parse(readFileSync(join(fixture, 'deck.json'), 'utf8')) as {
    id: string;
    sections: { slideIds: string[] }[];
  };
  manifest.id = DECK;
  manifest.sections[0]!.slideIds = ['title', 'content-rule', 'second', 'third'];
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-film`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await expect(page.locator('.ts-filmstrip .ts-card[data-id="title"]')).toBeVisible();
}

async function order(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const rows = (await window.turboslide!.studio.invoke('slide.list')) as { id: string }[];
    return rows.map((row) => row.id);
  });
}

async function skipped(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const rows = (await window.turboslide!.studio.invoke('slide.list')) as {
      id: string;
      skip?: boolean;
    }[];
    return rows.filter((row) => row.skip).map((row) => row.id);
  });
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const state = window.turboslide!.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return state.pending === 0 && state.revision === state.serverRevision;
  });
}

const card = (page: Page, id: string) => page.locator(`.ts-filmstrip .ts-card[data-id="${id}"]`);
const menu = (page: Page) => page.locator('[role="menu"][aria-label="Slide menu"]');

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  removeDeck();
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

test.describe('the filmstrip (SPEC 4.1, 4.2)', () => {
  test('cards, the current ring, multi-select, the right-click order, skip and unskip', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    /* one card per slide, numbered, the current one ringed, no title under the card */
    await expect(page.locator('.ts-filmstrip .ts-card:not(.is-empty)')).toHaveCount(4);
    await expect(card(page, 'title')).toHaveClass(/is-current/);
    await expect(card(page, 'title').locator('.ts-card-n')).toHaveText('1');
    await expect(page.locator('.ts-filmstrip .pt-orow-name')).toHaveCount(0);
    await expect(page.locator('.ts-filmstrip .pt-filter')).toHaveCount(0);
    /* Shift click extends the range, the shell's current card follows a plain click */
    await card(page, 'content-rule').click();
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'content-rule');
    await card(page, 'third').click({ modifiers: ['Shift'] });
    await expect(page.locator('.ts-filmstrip .ts-card[aria-selected="true"]')).toHaveCount(3);
    await card(page, 'second').click({ modifiers: ['ControlOrMeta'] });
    await expect(page.locator('.ts-filmstrip .ts-card[aria-selected="true"]')).toHaveCount(2);
    /* the right-click menu in the order of SPEC 4.2, at the pointer, the first row focused */
    await card(page, 'content-rule').click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    const labels = await menu(page)
      .locator(':scope > .ts-menu-group > [role^="menuitem"] .ts-menu-label')
      .allTextContents();
    expect(labels).toEqual(CARD_ORDER);
    await expect(menu(page).locator('[role="separator"]')).toHaveCount(4);
    await expect(menu(page).locator('[data-menu-item="slide.transition"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(menu(page).locator('[data-menu-item="insert.comment"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(menu(page).locator('[data-menu-item="edit.cut"]')).toBeFocused();
    /* Esc returns focus to the card */
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(card(page, 'content-rule')).toBeFocused();
    /* Skip slide on the two selected cards: both dim, slide.list reports the flag, the label flips */
    await card(page, 'content-rule').click({ button: 'right' });
    await menu(page).locator('[data-menu-item="slide.skipSlide"]').click();
    await expect.poll(() => skipped(page), { timeout: 20_000 }).toEqual(['content-rule', 'third']);
    await expect(card(page, 'content-rule')).toHaveClass(/is-skipped/);
    await expect(card(page, 'content-rule')).toHaveAttribute('aria-label', 'Slide 2, skipped');
    await expect(card(page, 'content-rule').locator('.ts-card-skip')).toBeVisible();
    await card(page, 'content-rule').click({ button: 'right' });
    await expect(
      menu(page).locator('[data-menu-item="slide.skipSlide"] .ts-menu-label'),
    ).toHaveText('Unskip slide');
    await menu(page).locator('[data-menu-item="slide.skipSlide"]').click();
    await expect.poll(() => skipped(page), { timeout: 20_000 }).toEqual([]);
    await expect(card(page, 'content-rule')).not.toHaveClass(/is-skipped/);
    /* Change background is one row on every slide kind (SPEC-2 0.74, 11.6): it opens the Background
       dialog with Color, Image and Add to theme on a content slide and on the Title slide alike */
    for (const id of ['content-rule', 'title']) {
      await card(page, id).click({ button: 'right' });
      const row = menu(page).locator('[data-menu-item="slide.changeBackground"]');
      await expect(row).not.toHaveAttribute('aria-disabled', 'true');
      await expect(row.locator('.ts-menu-label')).toHaveText('Change background');
      await row.click();
      const dialog = page.getByRole('dialog', { name: 'Background' });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-control="dialog.background.color.plate"]')).toBeVisible();
      await expect(dialog.locator('[data-control="dialog.background.addToTheme"]')).toBeVisible();
      await expect(dialog.locator('[data-control="dialog.background.done"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  });

  test('drag reorders as one slide.move, Delete shows the snackbar and Undo brings the slide back', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await settled(page);
    const before = await order(page);
    expect(before).toEqual(['title', 'content-rule', 'second', 'third']);
    /* drag the third card above the second: one slide.move after content-rule */
    const from = await card(page, 'third').boundingBox();
    const to = await card(page, 'second').boundingBox();
    expect(from && to).toBeTruthy();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 6, { steps: 8 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 4, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(() => order(page), { timeout: 20_000 })
      .toEqual(['title', 'content-rule', 'third', 'second']);
    await settled(page);
    const log = (await page.evaluate(() => window.turboslide!.studio.invoke('version.list'))) as {
      mutations: { op: string; slideId?: string; after?: string }[];
    }[];
    const last = log[log.length - 1];
    expect(last?.mutations).toHaveLength(1);
    expect(last?.mutations[0]).toMatchObject({
      op: 'slide.move',
      slideId: 'third',
      after: 'content-rule',
    });
    /* Delete from the keyboard: the snackbar names the slide and Undo restores it */
    await card(page, 'second').click();
    await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'second');
    await card(page, 'second').press('Delete');
    await expect
      .poll(() => order(page), { timeout: 20_000 })
      .toEqual(['title', 'content-rule', 'third']);
    await expect(page.locator('body')).toContainText(/Slide deleted/);
    const undoButton = page.locator('[data-control="snackbar.action"]');
    if (await undoButton.count()) {
      await undoButton.click();
    } else {
      await page.locator('body').press('ControlOrMeta+z');
    }
    await expect
      .poll(() => order(page), { timeout: 20_000 })
      .toEqual(['title', 'content-rule', 'third', 'second']);
  });

  test('Apply layout lists the 21 layouts with the current one checked, and a pick is one slide.applyLayout', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await settled(page);
    await card(page, 'third').click({ button: 'right' });
    const apply = menu(page).locator('[data-menu-item="slide.applyLayout"]');
    await apply.hover();
    const radios = page.locator('[role="menuitemradio"][data-layout]');
    await expect(radios).toHaveCount(21);
    await expect(radios.first()).toHaveAttribute('data-layout', 'title');
    await expect(page.locator('.ts-layout-rule')).toHaveText('GT layouts');
    await expect(page.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
    await page.locator('[role="menuitemradio"][data-layout="big-number"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const rows = (await window.turboslide!.studio.invoke('slide.list')) as {
              id: string;
              template?: string;
            }[];
            return rows.find((row) => row.id === 'third')?.template;
          }),
        { timeout: 20_000 },
      )
      .toBe('big-number');
    await expect(menu(page)).toHaveCount(0);
  });
});

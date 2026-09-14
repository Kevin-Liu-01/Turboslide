import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// MILESTONES B6 acceptance, present.spec.ts (gslides-parity SPEC 9.2, 9.3, 14.3): the presenting
// keys of Google's table on the audience surface (/deck/:id?present=1), the black and white
// slides, the laser pointer, the toolbar with its slide list and Options menu, the reading keys
// inert while presenting; Presenter view at /present/:id with the unskipped slides, the notes and
// their text size, the timer, the disabled Audience tools tab; and the two windows in sync over
// BroadcastChannel in both directions, including view.goto through the window API of either
// window. The spec works on a scratch copy of decks/fixture/gslides (27 slides, one skipped,
// notes on two, no assets) under decks/e2e-present and removes it afterwards.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-present';
const DECK_DIR = join(ROOT, 'decks', DECK);

/**
 * The fixture's slides in order minus the ones that carry `skip: true` (`skipped`), read from the
 * fixture so every count here follows its total (gslides-parity SPEC-2 0.42, 11.2).
 */
const PLAY = playOf(join(ROOT, 'decks', 'fixture', 'gslides'));

function playOf(dir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
    sections: { slideIds: string[] }[];
  };
  return manifest.sections
    .flatMap((section) => section.slideIds)
    .filter((id) => {
      const slide = JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8')) as {
        skip?: boolean;
      };
      return slide.skip !== true;
    });
}

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'gslides', 'slides'), join(DECK_DIR, 'slides'), {
    recursive: true,
  });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'gslides', 'deck.json'), 'utf8'),
  ) as { id: string };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), {
    recursive: true,
    force: true,
    /* the thumbnail worker may still be writing a frame into the folder */
    maxRetries: 5,
    retryDelay: 100,
  });
}

async function openAudience(page: Page): Promise<void> {
  await page.goto(`/deck/${DECK}?present=1`);
  const viewer = page.locator('.pt-viewer:not(.ts-skeleton)');
  await expect(viewer).toHaveAttribute('data-settled', '');
  await expect(viewer).toHaveClass(/is-present/);
  await expect(page.locator('.ts-slideshow')).toBeAttached();
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
}

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  removeDeck();
});

test.beforeEach(async ({ page }) => {
  // the deck opens dark by default (SPEC 2.1): start every run from a clean store
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('the presenting keys, the blank slides, the laser and the toolbar on the audience surface', async ({
  page,
}) => {
  await openAudience(page);
  const show = page.locator('.ts-slideshow');
  const viewer = page.locator('.pt-viewer:not(.ts-skeleton)');
  const body = page.locator('body');
  const total = Number(await show.getAttribute('data-total'));
  expect(total).toBeGreaterThan(3);
  await expect(page.locator('[data-control="present.counter"]')).toHaveText(`1 of ${total}`);

  // Right, Space, Page down and Enter advance; Backspace and Page up go back; Home and End jump
  const visited = [String(await show.getAttribute('data-slide-id'))];
  for (let i = 1; i < total; i += 1) {
    await body.press('ArrowRight');
    await expect(show).toHaveAttribute('data-index', String(i));
    visited.push(String(await show.getAttribute('data-slide-id')));
  }
  expect(new Set(visited).size).toBe(total);
  await body.press('ArrowRight');
  await expect(show).toHaveAttribute('data-index', String(total - 1));
  await body.press('Home');
  await expect(show).toHaveAttribute('data-index', '0');
  await body.press(' ');
  await expect(show).toHaveAttribute('data-index', '1');
  await body.press('PageDown');
  await expect(show).toHaveAttribute('data-index', '2');
  await body.press('Backspace');
  await expect(show).toHaveAttribute('data-index', '1');
  await body.press('PageUp');
  await expect(show).toHaveAttribute('data-index', '0');
  await body.press('Enter');
  await expect(show).toHaveAttribute('data-index', '1');
  await body.press('End');
  await expect(show).toHaveAttribute('data-index', String(total - 1));
  await expect(page.locator('[data-control="present.counter"]')).toHaveText(`${total} of ${total}`);

  // a number then Enter; a number past the end says so and stays
  await body.press('2');
  await expect(page.locator('.pt-toast')).toHaveText('Slide 2, press Enter');
  await body.press('Enter');
  await expect(show).toHaveAttribute('data-index', '1');
  await body.press('9');
  await body.press('9');
  await body.press('Enter');
  await expect(page.locator('.pt-toast')).toHaveText('No slide 99');
  await expect(show).toHaveAttribute('data-index', '1');

  // a click anywhere on the slide advances, the left half included (R04 A2)
  await page.locator('.pt-sheet-stage > .sheet').click({ position: { x: 24, y: 24 } });
  await expect(show).toHaveAttribute('data-index', '2');

  // B or . a black slide, W or , a white one; any key or a click returns and does nothing else
  const blank = page.locator('.ts-present-blank');
  await body.press('b');
  await expect(blank).toHaveAttribute('data-blank', 'black');
  await body.press('ArrowRight');
  await expect(blank).toBeHidden();
  await expect(show).toHaveAttribute('data-index', '2');
  await body.press('.');
  await expect(blank).toHaveAttribute('data-blank', 'black');
  await body.press('x');
  await expect(blank).toBeHidden();
  await body.press('w');
  await expect(blank).toHaveAttribute('data-blank', 'white');
  await blank.click();
  await expect(blank).toBeHidden();
  await body.press(',');
  await expect(blank).toHaveAttribute('data-blank', 'white');
  await body.press('Escape');
  await expect(blank).toBeHidden();
  await expect(viewer).toHaveClass(/is-present/);

  // L toggles the laser pointer, an ink dot that follows the pointer
  await body.press('l');
  await expect(show).toHaveAttribute('data-laser', 'true');
  const laser = page.locator('.ts-present-laser');
  await expect(laser).toBeAttached();
  await page.mouse.move(600, 400);
  await expect(laser).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 600, 400)');
  const state = await page.evaluate(() => window.turboslide!.studio.describe().state);
  expect(state.present).toBe(true);
  expect(state.laser).toBe(true);
  expect(state.blank).toBeNull();
  await body.press('l');
  await expect(laser).toBeHidden();

  // A is inert with the snackbar once per show; the reading keys are inert while presenting
  await body.press('a');
  await expect(page.locator('[data-control="snackbar"]')).toHaveText(
    /Audience tools are not available in Turboslide/,
  );
  await body.press('g');
  await expect(viewer).toHaveAttribute('data-mode', 'slide');
  await body.press('d');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(viewer).toHaveClass(/is-present/);

  // the toolbar appears when the pointer moves to the bottom left
  const bar = page.locator('.ts-present-bar');
  const size = page.viewportSize();
  await page.mouse.move(60, (size?.height ?? 900) - 30);
  await expect(bar).toHaveClass(/is-shown/);
  await page.locator('[data-control="present.next"]').click();
  await expect(show).toHaveAttribute('data-index', '3');
  await page.locator('[data-control="present.previous"]').click();
  await expect(show).toHaveAttribute('data-index', '2');

  // the slide number opens the list of slides; a pick jumps
  await page.locator('[data-control="present.counter"]').click();
  const list = page.getByRole('listbox', { name: 'Slides' });
  await expect(list).toBeVisible();
  const options = list.getByRole('option');
  await expect(options).toHaveCount(total);
  expect(
    await options.evaluateAll((els) => els.map((el) => el.getAttribute('data-slide-id'))),
  ).toEqual(visited);
  await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
  await options.nth(total - 1).click();
  await expect(list).toBeHidden();
  await expect(show).toHaveAttribute('data-index', String(total - 1));

  // the Options menu in Google's order, its stubs disabled with the stub sentence
  await page.locator('[data-control="present.options"]').click();
  const menu = page.getByRole('menu', { name: 'Options' });
  await expect(menu).toBeVisible();
  const labels = await menu
    .locator('[data-menu-item] .ts-menu-label')
    .evaluateAll((els) => els.map((el) => el.textContent.trim()));
  expect(labels).toEqual([
    'Open speaker notes',
    'Auto-play',
    'Turn on the laser pointer',
    'Enter full screen',
    'Turn on the pen',
    'More',
    'Exit',
  ]);
  await expect(menu.locator('[data-menu-item="present.options.autoPlay"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await menu.locator('[data-menu-item="present.options.laser"]').click();
  await expect(menu).toBeHidden();
  await expect(show).toHaveAttribute('data-laser', 'true');
  await expect(viewer).toHaveClass(/is-present/);
  await page.locator('[data-control="present.options"]').click();
  await expect(menu.locator('[data-menu-item="present.options.laser"] .ts-menu-label')).toHaveText(
    'Turn off the laser pointer',
  );
  await menu.locator('[data-menu-item="present.options.laser"]').click();
  await expect(show).not.toHaveAttribute('data-laser', 'true');

  // More > Keyboard shortcuts shows the presenting group; Esc closes it and keeps presenting
  await page.locator('[data-control="present.options"]').click();
  await menu.locator('[data-menu-item="present.options.more"]').click();
  const more = page.getByRole('menu', { name: 'More' });
  await expect(more).toBeVisible();
  await expect(more.locator('[data-menu-item="present.options.more.pdf"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await more.locator('[data-menu-item="present.options.more.shortcuts"]').click();
  const card = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('row').filter({ hasText: 'Stop presenting' })).toBeVisible();
  await expect(card.getByRole('row').filter({ hasText: 'Show a blank black slide' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(viewer).toHaveClass(/is-present/);

  // Esc with nothing open stops presenting; the chrome returns
  await body.press('Escape');
  await expect(viewer).not.toHaveClass(/is-present/);
  await expect(show).toBeHidden();
  await expect(page.locator('.pt-toolbar')).toBeVisible();
});

test('Presenter view lists the unskipped slides with their notes and syncs with the slideshow window', async ({
  page,
  context,
}) => {
  await openAudience(page);
  const show = page.locator('.ts-slideshow');

  // the console in a second window of the same browser: BroadcastChannel reaches it
  const console = await context.newPage();
  await console.goto(`/present/${DECK}`);
  const root = console.locator('.ts-presenter:not(.ts-skeleton)');
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute('data-total', String(PLAY.length));
  const counter = console.locator('[data-control="presenter.counter"]');
  await expect(counter.locator('b')).toHaveText(`1 of ${PLAY.length}`);
  await expect(console.locator('[data-control="presenter.connection"]')).toHaveAttribute(
    'data-connected',
    'true',
  );

  // the slide list: every unskipped slide in order, the skipped one absent
  await counter.click();
  const list = console.getByRole('listbox', { name: 'Slides' });
  await expect(list).toBeVisible();
  const options = list.getByRole('option');
  await expect(options).toHaveCount(PLAY.length);
  expect(
    await options.evaluateAll((els) => els.map((el) => el.getAttribute('data-slide-id'))),
  ).toEqual(PLAY);
  await console.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(counter).toBeFocused();

  // the notes of the title slide, and the text size buttons between 14 and 28 px
  const notes = console.locator('[data-control="presenter.notesText"]');
  await expect(notes).toContainText('The title slide carries speaker notes');
  await expect(notes).toHaveCSS('font-size', '16px');
  await console.locator('[data-control="presenter.notesLarger"]').click();
  await expect(notes).toHaveCSS('font-size', '18px');
  await expect(console.locator('[data-control="presenter.notesSize"]')).toHaveText('18 px');
  await console.locator('[data-control="presenter.notesSmaller"]').click();
  await expect(notes).toHaveCSS('font-size', '16px');

  // the timer counts up, pauses and resets
  const elapsed = console.locator('[data-control="presenter.elapsed"]');
  await expect(elapsed).not.toHaveText('0:00');
  const pause = console.locator('[data-control="presenter.pause"]');
  await pause.click();
  await expect(pause).toHaveText('Resume');
  const held = await elapsed.textContent();
  await console.waitForTimeout(1300);
  expect(await elapsed.textContent()).toBe(held);
  await console.locator('[data-control="presenter.reset"]').click();
  await expect(elapsed).toHaveText('0:00');
  await pause.click();
  await expect(pause).toHaveText('Pause');

  // the Audience tools tab is present and disabled
  const audience = console.locator('[data-control="presenter.tab.audience"]');
  await expect(audience).toHaveAttribute('aria-disabled', 'true');
  await expect(audience).toHaveAttribute('data-tip', 'Audience tools');

  // Next in the console drives the slideshow window through the play list; the skipped slide never shows
  const seen: string[] = [String(await show.getAttribute('data-slide-id'))];
  for (let i = 1; i < PLAY.length; i += 1) {
    await console.locator('[data-control="presenter.next"]').click();
    await expect(root).toHaveAttribute('data-index', String(i));
    await expect(show).toHaveAttribute('data-slide-id', PLAY[i] ?? '');
    seen.push(PLAY[i] ?? '');
  }
  expect(seen).toEqual(PLAY);
  expect(seen).not.toContain('skipped');
  await expect(notes).toHaveText('No speaker notes for this slide');
  await expect(console.locator('[data-control="presenter.next"]')).toBeDisabled();

  // the audience's keys drive the console, and the console's arrows drive the audience
  await page.locator('body').press('Home');
  await expect(root).toHaveAttribute('data-index', '0');
  await page.locator('body').press('ArrowRight');
  await expect(root).toHaveAttribute('data-index', '1');
  await console.locator('body').press('ArrowRight');
  await expect(show).toHaveAttribute('data-slide-id', 'table');
  await expect(counter.locator('b')).toHaveText(`3 of ${PLAY.length}`);

  // view.goto through the window API of either window moves both
  await page.evaluate(() => window.turboslide!.studio.invoke('view.goto', { slideId: 'links' }));
  await expect(root).toHaveAttribute('data-index', '4');
  await console.evaluate(() => window.turboslide!.studio.invoke('view.goto', { slideId: 'title' }));
  await expect(show).toHaveAttribute('data-slide-id', 'title');
  const described = await console.evaluate(() => window.turboslide!.studio.describe());
  expect(described.owner).toBe('presenter');
  expect(described.actions).toEqual(['view.goto', 'view.present']);
  expect((described.state as { connected: boolean }).connected).toBe(true);

  // S in the show opens Presenter view in another window
  const popupOpened = context.waitForEvent('page');
  await page.locator('body').press('s');
  const popup = await popupOpened;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).pathname).toBe(`/present/${DECK}`);
  await popup.close();

  // leaving the show tells the console; view.present from the console starts it again and ends it
  await page.locator('body').press('Escape');
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).not.toHaveClass(/is-present/);
  await expect(console.locator('[data-control="presenter.connection"]')).toHaveAttribute(
    'data-connected',
    'false',
  );
  await page.evaluate(() => window.turboslide!.studio.invoke('view.present', { on: true }));
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveClass(/is-present/);
  await expect(console.locator('[data-control="presenter.connection"]')).toHaveAttribute(
    'data-connected',
    'true',
  );
  await console.evaluate(() => window.turboslide!.studio.invoke('view.present', { on: false }));
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).not.toHaveClass(/is-present/);

  // closing the console leaves the show running
  await page.evaluate(() => window.turboslide!.studio.invoke('view.present', { on: true }));
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveClass(/is-present/);
  await console.close();
  await page.waitForTimeout(300);
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveClass(/is-present/);
});

test('?screen=1 on the presenter address opens the audience form', async ({ page }) => {
  await page.goto(`/present/${DECK}?screen=1`);
  await expect(page).toHaveURL(new RegExp(`/deck/${DECK}\\?present=1$`));
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveClass(/is-present/);
});

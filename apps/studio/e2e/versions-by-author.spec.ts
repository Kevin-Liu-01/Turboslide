import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// Version history by author (gslides-parity SPEC-3 0.44, 0.45, 5.7, 16.3
// `versions-by-author.spec.ts`; research 08 section 6): two browser contexts with two labels edit
// different slides; the panel shows one 15 minute window with two marks; Show changes hatches each
// slide's blocks with its author's chip and underlines the inserted run; Only named hides both;
// Make a copy at the earlier record opens a deck at that document; the two delete rows are present
// and disabled with their clause.
//
// The focus round (docs/FOCUS.md 3.1, 3.2): Show changes is a parked row (`advanced: true`) and the
// two delete rows are Later stubs, so the panel draws them only while Tools > Advanced tools is
// on; the owner's page turns the switch on before the panel opens and the rest of the row reads as
// before. The two checkboxes are driven through their label rows, the click a person makes: the
// input is visually hidden (VersionsPanel.css, 1 by 1 px under the drawn box), so a click aimed at
// the input meets the box and never lands (check step 26, `locator.check: Test ended`, every
// cycle of the round).
//
// PLAYWRIGHT_BASE_URL=http://localhost:4335 node_modules/.bin/playwright test apps/studio/e2e/versions-by-author.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SOURCE = 'gt-brand';
const COPY = `e2e-versions-${Date.now().toString(36)}`;
const SLIDE_A = 'thesis';
const SLIDE_B = 'title';
const CLAUSE = 'Named versions are kept; older records thin out after 30 days';

type Version = { n: number; revision: number; author: { name: string; principalId?: string } };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function openDeck(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function goTo(page: Page, slideId: string): Promise<void> {
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const s = window.turboslide!.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
    };
    return s.pending === 0 && s.revision === s.serverRevision;
  });
}

/* the copy is restricted to the context that made it (docs/FOCUS.md rank 1, ruling 2), so the
   copying context mints one editor link and the two labels below join through it, each with its
   own identity and the editor role (comments.spec.ts's pattern; b6.md R9) */
let editLink = '';

async function scratchDeck(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDeck(page, `/edit/${SOURCE}`);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Versions walk',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, `/edit/${COPY}`);
  const access = await page.evaluate(
    () => (window.turboslide!.studio.describe().state as { access?: { revision?: number } }).access,
  );
  const link = await invoke<{ url: string }>(page, 'share.createLink', {
    id: COPY,
    role: 'editor',
    label: 'Edit link',
    baseRevision: access?.revision ?? 0,
  });
  editLink = link.url;
  await context.close();
}

/** A context of its own identity holding the editor role on the copy, through the owner's link. */
async function editorContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(editLink);
  await page.waitForURL((url) => url.pathname === `/edit/${COPY}`);
  await page.close();
  return context;
}

/**
 * Types a word at the end of the slide's heading run and leaves the caret. The session opens on
 * a double click (AMENDMENTS.md A1); a slide field rendered as one element (a title slide's
 * heading, a statement slide's big text) carries `data-block` and `data-run` on the same element,
 * so the selector takes that form beside the slot block's descendant run (b6 FR3).
 */
async function typeInHeading(
  page: Page,
  slideId: string,
  block: string,
  word: string,
): Promise<void> {
  await goTo(page, slideId);
  await page
    .locator(
      `.ts-stagewrap.ts-editor [data-block="${block}"][data-run], .ts-stagewrap.ts-editor [data-block="${block}"] [data-run]`,
    )
    .first()
    .dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(word, { delay: 30 });
  await page.keyboard.press('Escape');
  await settled(page);
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('two labels editing two slides make one window with two marks; Show changes hatches with the author chip and underlines the run; Only named; Make a copy at a version; the delete rows are disabled with the clause', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await scratchDeck(browser);
  const a = await editorContext(browser);
  const b = await editorContext(browser);
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await openDeck(pageA, `/edit/${COPY}`);
  await openDeck(pageB, `/edit/${COPY}`);
  const before = (await invoke<Version[]>(pageA, 'version.list')).length;
  await typeInHeading(pageA, SLIDE_A, 'big', ' alpha');
  await typeInHeading(pageB, SLIDE_B, 'heading', ' beta');
  await expect
    .poll(async () => (await invoke<Version[]>(pageA, 'version.list')).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(before + 2);
  const log = await invoke<Version[]>(pageA, 'version.list');
  const authors = new Set(log.slice(before).map((v) => v.author.principalId ?? v.author.name));
  expect(
    authors.size,
    'two browsers are two principals (SPEC-3 0.17): the route derives the author from the cookie (B2 day 4, B3 day 1)',
  ).toBe(2);

  /* the parked rows of the panel (Show changes, the delete rows) need the switch */
  await setAdvancedTools(pageA, true);

  /* the panel: one window with two marks */
  await pageA.locator('[data-control="menubar.file"]').click();
  await pageA.locator('[data-menu-item="file.versionHistory"]').hover();
  await pageA.locator('[data-menu-item="file.versionHistory.see"]').click();
  const panel = pageA.locator('[data-control="panel.versionHistory"]');
  await expect(panel).toBeVisible();
  const windowRow = panel.locator('[data-control^="versionHistory.window."]').first();
  await expect(windowRow).toBeVisible();
  await expect(windowRow.locator('.ts-version-marks .ts-chip')).toHaveCount(2);
  await windowRow.click();
  const rows = panel.locator('.ts-versions-list.is-window .ts-version');
  await expect(rows).toHaveCount(2);
  const marks = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-author')));
  expect(new Set(marks).size).toBe(2);

  /* Show changes on B's record hatches the title slide's heading with B's chip and underlines the inserted run */
  const showChanges = panel.locator('[data-control="versionHistory.showChanges"]');
  await panel.locator('[data-control="versionHistory.showChanges.row"]').click();
  await expect(showChanges).toBeChecked();
  const newest = log[log.length - 1]!;
  await panel.locator(`[data-control="versionHistory.${newest.n}.pick"]`).click();
  await goTo(pageA, SLIDE_B);
  await expect(pageA.locator('[data-control="versions.change"]').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageA.locator('.ts-change-chip .ts-chip').first()).toBeVisible();
  await expect(pageA.locator('[data-control="versions.changeRun"]').first()).toBeVisible();

  /* Only named hides both unnamed windows */
  const namedOnly = panel.locator('[data-control="versionHistory.namedOnly"]');
  const namedOnlyRow = panel.locator('.ts-versions-named', { has: namedOnly });
  await namedOnlyRow.click();
  await expect(namedOnly).toBeChecked();
  await expect(panel.locator('[data-control^="versionHistory.window."]')).toHaveCount(0);
  await expect(panel.locator('.ts-version')).toHaveCount(0);
  await namedOnlyRow.click();
  await expect(namedOnly).not.toBeChecked();

  /* the delete rows are present and disabled with their clause */
  const earlier = log[before]!;
  await panel.locator(`[data-control="versionHistory.${earlier.n}.more"]`).click();
  const more = pageA.locator('#ts-menu-version-more');
  const deleteOlder = more.locator('[data-menu-item="file.versionHistory.deleteOlder"]');
  await expect(deleteOlder).toHaveAttribute('aria-disabled', 'true');
  await expect(deleteOlder).toHaveAttribute('data-tip', 'Delete this and older versions');
  await deleteOlder.hover();
  await expect(pageA.locator('#pt-tip')).toContainText(CLAUSE);
  await expect(
    more.locator('[data-menu-item="file.versionHistory.deleteHistory"]'),
  ).toHaveAttribute('aria-disabled', 'true');

  /* Make a copy at the earlier record opens a deck at that document */
  const [popup] = await Promise.all([
    pageA.context().waitForEvent('page'),
    (async () => {
      await more.locator('[data-menu-item="version.copy"]').click();
      await pageA.locator('[data-control="dialog.makeCopy.ok"]').click();
    })(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/\/edit\//);
  const copyId = decodeURIComponent(new URL(popup.url()).pathname.split('/').pop() ?? '');
  await popup.waitForFunction(() => Boolean(window.turboslide?.studio));
  const copied = await popup.evaluate(
    (slideId) =>
      window.turboslide!.studio.invoke('slide.get', { slideId }) as Promise<{
        slide: { heading?: string };
      }>,
    SLIDE_B,
  );
  expect(copied.slide.heading ?? '').not.toContain(' beta');
  rmSync(join(ROOT, 'decks', copyId), { recursive: true, force: true });
  await popup.close();
  await b.close();
  await a.close();
});

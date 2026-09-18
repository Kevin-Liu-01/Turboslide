import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// B4 acceptance of the Google Slides parity round (gslides-parity SPEC 14.3, filmstrip.spec):
// the cards of SPEC 4.1 with the current ring and the skipped state, Shift and Cmd multi-select,
// drag to reorder as one slide.move, Google's right-click menu in the order of SPEC 4.2 with Skip
// and Unskip, Delete with the snackbar and Undo, and the layout list from Apply layout.
//
// Round four (gslides-parity SPEC-4 0.30, 0.41, 3.2; MILESTONES-4 B4 item 7): the cards are clone
// first and capture never, so a typed heading shows on its card within 50 ms of the local commit
// and no /api/render request leaves the editor's page for the filmstrip; one observer over the
// list decides which cards hold a clone.
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-film with four content slides
// and removes it afterwards. It runs against the dev server the builder starts on its own port:
// TURBOSLIDE_E2E_BASE, else PLAYWRIGHT_BASE_URL (the base playwright.config.ts gives every other
// spec, SPEC-2 0.43), else http://localhost:4321; the integrator owns playwright.config.ts.

const BASE =
  process.env['TURBOSLIDE_E2E_BASE'] ??
  process.env['PLAYWRIGHT_BASE_URL'] ??
  'http://localhost:4321';
test.use({ baseURL: BASE });

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-film';
const DECK_DIR = join(ROOT, 'decks', DECK);

/* the card menu of the default view (docs/FOCUS.md 3.4 parks Change theme and Transition) */
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
  'Move slide',
  'Comment',
];
/* the same menu behind Tools > Advanced tools: SPEC 4.2's order with the two parked rows back */
const CARD_ORDER_ADVANCED = [
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
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), {
    recursive: true,
    force: true,
    /* the thumbnail worker may still be writing a frame into the folder */
    maxRetries: 5,
    retryDelay: 100,
  });
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
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
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
    /* the registry is re-installed when an owner element changes; a poll that lands in that
       moment reads false instead of failing the wait with a TypeError */
    if (typeof window.turboslide?.studio?.describe !== 'function') return false;
    const state = window.turboslide.studio.describe().state as {
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
    await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
      'data-active',
      'content-rule',
    );
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
    /* the two parked rows are absent, not disabled (docs/FOCUS.md 3.1) */
    await expect(menu(page).locator('[data-menu-item="slide.changeTheme"]')).toHaveCount(0);
    await expect(menu(page).locator('[data-menu-item="slide.transition"]')).toHaveCount(0);
    /* Comment on a thumbnail anchors a comment to that slide (SPEC-3 5.3, 13.1; the row was Later
       in round two and is enabled in Editing mode with the comment capability) */
    await expect(menu(page).locator('[data-menu-item="insert.comment"]')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(menu(page).locator('[data-menu-item="edit.cut"]')).toBeFocused();
    /* Esc returns focus to the card */
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(card(page, 'content-rule')).toBeFocused();
    /* behind Tools > Advanced tools the menu is SPEC 4.2's whole order, Transition disabled with
       its stub sentence (docs/FOCUS.md 3.1: hidden while off, present while on) */
    await setAdvancedTools(page, true);
    await card(page, 'content-rule').click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    expect(
      await menu(page)
        .locator(':scope > .ts-menu-group > [role^="menuitem"] .ts-menu-label')
        .allTextContents(),
    ).toEqual(CARD_ORDER_ADVANCED);
    await expect(menu(page).locator('[data-menu-item="slide.transition"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await setAdvancedTools(page, false);
    await card(page, 'content-rule').focus();
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
    await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
      'data-active',
      'second',
    );
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

test.describe('the clone first filmstrip (SPEC-4 0.30, 0.41)', () => {
  test('a typed heading is on its card within 50 ms of the commit, and the filmstrip asks the render route for nothing', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const renders: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/render/')) renders.push(request.url());
    });
    await openEditor(page);
    await settled(page);
    /* every card is a clone first frame: no capture is asked for and none is shown */
    const thumbs = page.locator('.ts-filmstrip .ts-card .ts-thumb');
    await expect(thumbs).toHaveCount(4);
    for (const capture of await thumbs.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-capture')),
    ))
      expect(capture).toBe('never');
    await expect(page.locator('.ts-filmstrip .ts-thumb-img')).toHaveCount(0);
    /* the cards near the list hold a clone (all four here), the frame and the number stay on every card */
    await expect(page.locator('.ts-filmstrip .ts-card[data-near]')).toHaveCount(4);
    await expect(page.locator('.ts-filmstrip .ts-card [data-thumb="clone"]')).toHaveCount(4);
    /* type into the heading of the current slide and stamp the reducer, the clone and the save in the page */
    await card(page, 'content-rule').click();
    await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
      'data-active',
      'content-rule',
    );
    const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
    const box = await run.boundingBox();
    expect(box).not.toBeNull();
    /* the session opens on a double click (AMENDMENTS.md A1; one click selects the block) */
    await page.mouse.dblclick(box!.x + 8, box!.y + 8);
    await expect(run).toHaveAttribute('contenteditable', 'true');
    const from = await page.evaluate(
      () => window.turboslide!.studio.describe().state.revision as number,
    );
    const TEXT = 'Filmstrip clone row';
    await page.evaluate(
      ([revision, text]) => {
        const w = {
          from: revision,
          text,
          lastKey: null as number | null,
          commitAt: null as number | null,
          cloneAt: null as number | null,
          savedAt: null as number | null,
          renderer: null as number | null,
        };
        (window as unknown as { __tsFilm: typeof w }).__tsFilm = w;
        window.addEventListener('keyup', () => (w.lastKey = performance.now()), { capture: true });
        const tick = () => {
          const now = performance.now();
          let s: { revision?: number; serverRevision?: number; pending?: number };
          try {
            s = window.turboslide!.studio.describe().state as typeof s;
          } catch {
            return;
          }
          const card = document.querySelector('.ts-filmstrip .ts-card.is-current .pt-slide');
          if (w.cloneAt === null && card && (card.textContent ?? '').includes(text))
            w.cloneAt = now;
          if (w.commitAt === null && (s.revision ?? 0) > w.from) w.commitAt = now;
          if (
            w.savedAt === null &&
            (s.revision ?? 0) > w.from &&
            (s.serverRevision ?? 0) >= (s.revision ?? 0) &&
            s.pending === 0
          )
            w.savedAt = now;
        };
        setInterval(tick, 4);
      },
      [from, TEXT] as const,
    );
    await page.keyboard.press('End');
    await page.keyboard.type(` ${TEXT}`);
    await page.waitForFunction(
      () => {
        const w = (window as unknown as { __tsFilm: { savedAt: number | null } }).__tsFilm;
        return w.savedAt !== null;
      },
      null,
      { timeout: 60_000 },
    );
    const w = await page.evaluate(
      () =>
        (
          window as unknown as {
            __tsFilm: {
              lastKey: number | null;
              commitAt: number | null;
              cloneAt: number | null;
              savedAt: number | null;
            };
          }
        ).__tsFilm,
    );
    expect(w.cloneAt).not.toBeNull();
    expect(w.commitAt).not.toBeNull();
    /* the clone carries the text at the reducer, before the room answers: within 50 ms of the commit stamp */
    expect(w.cloneAt! - w.commitAt!).toBeLessThanOrEqual(50);
    console.log(
      `filmstrip clone: last keyup ${Math.round(w.lastKey ?? 0)} ms, clone ${Math.round(w.cloneAt ?? 0)} ms, revision moved ${Math.round(w.commitAt ?? 0)} ms, saved ${Math.round(w.savedAt ?? 0)} ms (page clock)`,
    );
    await expect(card(page, 'content-rule').locator('.pt-slide')).toContainText(TEXT);
    /* nothing from this page asked the render route for a picture */
    expect(renders).toEqual([]);
  });
});

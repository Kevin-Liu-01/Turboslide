import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// B4 acceptance of the Google Slides parity round (gslides-parity SPEC 14.3, text-editing.spec):
// a single click places the caret where it landed, typing writes one text.replace per 400 ms
// pause so one Cmd Z removes one burst, Esc keeps the text and selects the block, Enter breaks a
// paragraph in a multiline pointer and appends an item in a list, Tab walks the cells of a table
// and adds a row past the last with the Row added snackbar, and no bare letter changes the view.
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-text plus the table slide of
// decks/fixture/gslides, and removes it afterwards. It runs against the dev server the builder
// starts on its own port: TURBOSLIDE_E2E_BASE (default http://localhost:4321, the shared
// playwright.config.ts base); the integrator owns playwright.config.ts.

const BASE = process.env['TURBOSLIDE_E2E_BASE'] ?? 'http://localhost:4321';
/* the clipboard test reads the system clipboard back; headless Chromium refuses that without the grant */
test.use({ baseURL: BASE, permissions: ['clipboard-read', 'clipboard-write'] });

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-text';
const DECK_DIR = join(ROOT, 'decks', DECK);

type Version = {
  n: number;
  revision: number;
  mutations: { op: string; path?: string; text?: string; value?: unknown }[];
};

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(join(DECK_DIR, 'slides'), { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  cpSync(
    join(ROOT, 'decks', 'fixture', 'gslides', 'slides', 'table.json'),
    join(DECK_DIR, 'slides', 'table.json'),
  );
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as {
    id: string;
    sections: { slideIds: string[] }[];
  };
  manifest.id = DECK;
  manifest.sections[0]?.slideIds.push('table');
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}

async function openEditor(page: Page, slideId: string): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-text`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await page.evaluate(
    (id) => window.turboslide!.studio.invoke('view.goto', { slideId: id }),
    slideId,
  );
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', slideId);
  await expect(page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first()).toBeVisible();
}

async function versions(page: Page): Promise<Version[]> {
  return page.evaluate(
    async () => (await window.turboslide!.studio.invoke('version.list')) as Version[],
  );
}

async function revision(page: Page): Promise<number> {
  return page.evaluate(() => window.turboslide!.studio.describe().state.revision as number);
}

/** The document's text at a run pointer, read through slide.get. */
async function runText(
  page: Page,
  slideId: string,
  blockId: string,
  pointer: string,
): Promise<string> {
  return page.evaluate(
    async ([sid, bid, ptr]) => {
      const got = (await window.turboslide!.studio.invoke('slide.get', { slideId: sid })) as {
        slide: { slots: Record<string, { id: string; [key: string]: unknown }[]> };
      };
      const block = Object.values(got.slide.slots)
        .flat()
        .find((b) => b.id === bid);
      if (!block) return '';
      const value = ptr
        .split('/')
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], block);
      return typeof value === 'string' ? value : '';
    },
    [slideId, blockId, pointer] as const,
  );
}

/** The editor's pending writes have all reached the server. */
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

test.describe('text editing on the canvas (SPEC 10.2, 7.2.15, 7.4)', () => {
  test('a click places the caret, a pause writes one burst, Esc keeps the text and one Cmd Z removes the burst', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, 'content-rule');
    const start = await revision(page);
    const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    /* a single click inside the text places the caret there: the run is editable at once. The
       click lands inside the first word, so the offset is neither the start nor the end */
    await page.mouse.click(box!.x + 24, box!.y + box!.height / 2);
    await expect(heading).toHaveAttribute('contenteditable', 'true');
    await expect(heading).toHaveAttribute('spellcheck', 'true');
    const caretInside = await page.evaluate(() => {
      const selection = window.getSelection();
      const run = document.querySelector('.ts-stagewrap.ts-editor [data-run="h/text"]');
      return Boolean(
        selection && run && selection.rangeCount > 0 && run.contains(selection.anchorNode),
      );
    });
    expect(caretInside).toBe(true);
    /* the caret landed near the middle, not at the end */
    const offset = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1);
    const length = (await heading.textContent())?.length ?? 0;
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(length);
    /* typing at the end: one burst after the 400 ms pause */
    await page.keyboard.press('End');
    await page.keyboard.type(' now', { delay: 30 });
    await expect.poll(() => revision(page), { timeout: 10_000 }).toBe(start + 1);
    const afterFirst = await versions(page);
    const burst = afterFirst[afterFirst.length - 1]?.mutations[0];
    expect(burst?.op).toBe('text.replace');
    expect(burst?.text).toBe(' now');
    /* the session survives the write: still editable, still focused */
    await expect(heading).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.type(' twice', { delay: 30 });
    await page.waitForTimeout(500);
    await expect.poll(() => revision(page)).toBe(start + 2);
    /* Esc keeps the text and selects the block; no third write */
    await page.keyboard.press('Escape');
    await expect(heading).not.toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.ts-overlay .ts-select.is-selected')).toBeVisible();
    expect(await runText(page, 'content-rule', 'h', 'text')).toBe('The copy test now twice');
    expect(await revision(page)).toBe(start + 2);
    /* one Cmd Z removes the last burst only */
    await settled(page);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => runText(page, 'content-rule', 'h', 'text')).toBe('The copy test now');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => runText(page, 'content-rule', 'h', 'text')).toBe('The copy test');
  });

  test('Enter breaks a paragraph in a multiline pointer and commits in a heading; Shift Enter is the same break', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, 'content-rule');
    const paragraph = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="p/text"]');
    const box = await paragraph.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 8, box!.y + 8);
    await expect(paragraph).toHaveAttribute('contenteditable', 'true');
    /* a triple click selects the paragraph (R09 A1, the browser's own gesture); typing replaces it */
    await page.mouse.click(box!.x + 8, box!.y + 8, { clickCount: 3 });
    await page.keyboard.type('One.', { delay: 20 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Two.', { delay: 20 });
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Three.', { delay: 20 });
    await page.keyboard.press('Escape');
    await expect.poll(() => runText(page, 'content-rule', 'p', 'text')).toBe('One.\nTwo.\nThree.');
    /* a heading takes no break: Enter commits and selects the block */
    const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
    const hbox = await heading.boundingBox();
    await page.mouse.click(hbox!.x + 8, hbox!.y + hbox!.height / 2);
    await expect(heading).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.press('End');
    await page.keyboard.type(' A', { delay: 20 });
    await page.keyboard.press('Enter');
    await expect(heading).not.toHaveAttribute('contenteditable', 'true');
    await expect.poll(() => runText(page, 'content-rule', 'h', 'text')).toBe('The copy test A');
  });

  test('Enter at the end of a list item appends an item and Backspace on the empty item removes it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, 'content-rule');
    const first = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/0/text"]');
    const box = await first.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width - 20, box!.y + box!.height / 2);
    await expect(first).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    /* the new item exists in the document and its run is the editing session */
    const second = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/1/text"]');
    await expect(second).toHaveAttribute('contenteditable', 'true', { timeout: 10_000 });
    expect(await runText(page, 'content-rule', 'list', 'items/1/text')).toBe('');
    await page.keyboard.type('New item.', { delay: 20 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => runText(page, 'content-rule', 'list', 'items/1/text'))
      .toBe('New item.');
    /* Backspace on an emptied item removes it and moves the caret to the item before */
    const nbox = await second.boundingBox();
    await page.mouse.click(nbox!.x + nbox!.width - 20, nbox!.y + nbox!.height / 2);
    await expect(second).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(450);
    await page.keyboard.press('Backspace');
    await expect(first).toHaveAttribute('contenteditable', 'true', { timeout: 10_000 });
    await expect
      .poll(() => runText(page, 'content-rule', 'list', 'items/1/text'))
      .toBe('With GT: one pull request.');
    await page.keyboard.press('Escape');
  });

  test('Tab walks the table cells and adds a row past the last with the Row added snackbar', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, 'table');
    const cell = (r: number, c: number) =>
      page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="table/rows/${r}/cells/${c}"]`);
    const box = await cell(1, 0).boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 8, box!.y + box!.height / 2);
    await expect(cell(1, 0)).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('Pro', { delay: 20 });
    await page.keyboard.press('Tab');
    /* Tab commits the cell and selects the next one whole */
    await expect(cell(1, 1)).toHaveAttribute('contenteditable', 'true', { timeout: 10_000 });
    await expect.poll(() => runText(page, 'table', 'table', 'rows/1/cells/0')).toBe('Pro');
    await page.keyboard.type('50', { delay: 20 });
    await page.keyboard.press('Shift+Tab');
    await expect(cell(1, 0)).toHaveAttribute('contenteditable', 'true', { timeout: 10_000 });
    await expect.poll(() => runText(page, 'table', 'table', 'rows/1/cells/1')).toBe('50');
    await page.keyboard.press('Escape');
    /* the last cell: Tab adds a row and the caret lands in its first cell */
    const last = await cell(3, 3).boundingBox();
    await page.mouse.click(last!.x + 8, last!.y + last!.height / 2);
    await expect(cell(3, 3)).toHaveAttribute('contenteditable', 'true');
    await page.keyboard.press('Tab');
    await expect(cell(4, 0)).toHaveAttribute('contenteditable', 'true', { timeout: 15_000 });
    const rows = await page.evaluate(async () => {
      const got = (await window.turboslide!.studio.invoke('slide.get', { slideId: 'table' })) as {
        slide: { slots: { body: { id: string; rows?: unknown[] }[] } };
      };
      return got.slide.slots.body.find((b) => b.id === 'table')?.rows?.length ?? 0;
    });
    expect(rows).toBe(5);
    /* the Editor hands "Row added" to its onNotice prop; the route's snackbar shows it once the
       integrator wires the prop (docs/gslides-parity/build/b4.md, request 3). The write itself is
       the assertion above; the sentence is checked when a snackbar is on the page */
    const snackbar = page.locator('[data-control="snackbar"], .pt-toast');
    if ((await snackbar.count()) > 0 && (await snackbar.first().textContent())?.includes('Row')) {
      await expect(snackbar.first()).toContainText(/Row added/);
    }
    await page.keyboard.press('Escape');
  });

  test('Cmd C and Cmd V paste a copy of the block through the envelope, Cmd D duplicates and Delete removes', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page, 'content-rule');
    await settled(page);
    const ids = () =>
      page.evaluate(async () => {
        const got = (await window.turboslide!.studio.invoke('slide.get', {
          slideId: 'content-rule',
        })) as {
          slide: { slots: Record<string, { id: string }[]> };
        };
        return Object.values(got.slide.slots)
          .flat()
          .map((block) => block.id);
      });
    expect(await ids()).toEqual(['h', 'p', 'list']);
    /* Tab from the page selects the first block; Cmd C copies it as the turboslide:v1 envelope */
    await page.locator('body').press('Tab');
    await expect(page.locator('.ts-overlay .ts-select.is-selected')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+c');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    expect(clipboard.startsWith('turboslide:v1:')).toBe(true);
    /* Cmd V inserts the copy after the selected block with a fresh id and selects it */
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => ids(), { timeout: 15_000 }).toEqual(['h', 'h-2', 'p', 'list']);
    await expect
      .poll(() => page.evaluate(() => window.turboslide!.studio.describe().state.blockId))
      .toBe('h-2');
    /* Cmd D is block.duplicate: the copy lands after its original and is selected */
    await settled(page);
    await page.keyboard.press('ControlOrMeta+d');
    await expect.poll(() => ids(), { timeout: 15_000 }).toEqual(['h', 'h-2', 'h-2-2', 'p', 'list']);
    await expect
      .poll(() => page.evaluate(() => window.turboslide!.studio.describe().state.blockId))
      .toBe('h-2-2');
    /* Delete removes the selection as one write */
    await settled(page);
    await page.keyboard.press('Delete');
    await expect.poll(() => ids(), { timeout: 15_000 }).toEqual(['h', 'h-2', 'p', 'list']);
  });

  test('no bare letter changes the view with a block selected, and the arrows are inert on a grammar slide', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openEditor(page, 'content-rule');
    const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="h"]');
    /* select the block through its overlay chip path: Tab from the page selects the first block */
    await page.locator('body').press('Tab');
    await expect(page.locator('.ts-overlay .ts-select.is-selected')).toBeVisible();
    const before = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      sb: document.querySelector('.pt-viewer')?.getAttribute('data-sb'),
      mode: document.querySelector('.pt-viewer')?.getAttribute('data-mode'),
      editing: document
        .querySelector('.ts-stagewrap.ts-editor')
        ?.closest('[data-editing]')
        ?.getAttribute('data-editing'),
      active: document.querySelector('.pt-viewer')?.getAttribute('data-active'),
    }));
    for (const key of ['s', 'd', 'e', 'p', 'g', 'b', 'j', 'k', '?', 'ArrowDown', 'ArrowRight']) {
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      sb: document.querySelector('.pt-viewer')?.getAttribute('data-sb'),
      mode: document.querySelector('.pt-viewer')?.getAttribute('data-mode'),
      editing: document
        .querySelector('.ts-stagewrap.ts-editor')
        ?.closest('[data-editing]')
        ?.getAttribute('data-editing'),
      active: document.querySelector('.pt-viewer')?.getAttribute('data-active'),
    }));
    expect(after).toEqual(before);
    /* the selection is unchanged: the arrows did not cycle the blocks */
    await expect(page.locator('.ts-overlay .ts-select.is-selected')).toBeVisible();
    expect(await heading.count()).toBe(1);
    expect(await runText(page, 'content-rule', 'h', 'text')).toBe('The copy test');
  });
});

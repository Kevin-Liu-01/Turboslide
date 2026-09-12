import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The ten tasks of the sales user (gslides-parity SPEC 11.2, the Here column; SPEC 14.3
// ten-tasks.spec): each task is driven the way the table describes it and the spec counts the
// pointer presses and the key presses beyond typing with its own counters, then asserts the
// count against the table. The counters are the convention of R11 C2: a click, a right click, a
// drop and a drag are one pointer press each; a chord is one key press; typing a word is not
// counted. The spec works on a scratch copy of decks/fixture/gslides (seven slides: a table, a
// numbered list, links, a skipped slide, notes) under decks/e2e-tasks, seeds the objects a task
// needs through the window API (a picture block for the logo swap, a Big number slide) before the
// task starts, and removes the deck, the copy task 2 makes and their caches afterwards. The counts
// are written to .turboslide/ten-tasks.json for the verifier (SPEC 14.6).

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = join(ROOT, 'decks');
const DECK = 'e2e-tasks';
const DECK_DIR = join(DECKS, DECK);
const COUNTS_FILE = join(ROOT, '.turboslide', 'ten-tasks.json');

/** The Here column of SPEC 11.2: the most presses a task may take. */
const BUDGET = {
  1: { clicks: 1, keys: 0 },
  2: { clicks: 3, keys: 1 },
  /* the triple click into the title, Esc; Cmd+Shift+H, Tab to the second field, Replace all */
  3: { clicks: 4, keys: 3 },
  4: { clicks: 1, keys: 0 },
  /* Ctrl+M, Cmd+D, Delete, one drag */
  5: { clicks: 1, keys: 3 },
  6: { clicks: 5, keys: 0 },
  /* the first cell, Tab through the cells; the big number, Cmd+A */
  7: { clicks: 2, keys: 21 },
  8: { clicks: 1, keys: 0 },
  9: { clicks: 2, keys: 0 },
  /* Share, Copy link; then File > Download > PDF Document, Download */
  10: { clicks: 6, keys: 0 },
} as const;

type Counter = { clicks: number; keys: number };
const counts: Record<string, Counter & { budget: Counter }> = {};

/** The spec's own counters over Playwright's presses. */
function counter(page: Page) {
  const c: Counter = { clicks: 0, keys: 0 };
  return {
    c,
    click: async (target: Locator, options?: Parameters<Locator['click']>[0]) => {
      c.clicks += 1;
      await target.click(options);
    },
    clickAt: async (x: number, y: number, options?: { clickCount?: number }) => {
      c.clicks += options?.clickCount ?? 1;
      await page.mouse.click(x, y, options);
    },
    press: async (key: string, target?: Locator) => {
      c.keys += 1;
      if (target) await target.press(key);
      else await page.keyboard.press(key);
    },
    type: (text: string) => page.keyboard.type(text, { delay: 15 }),
    drag: async (from: Locator, to: Locator, offsetY: number) => {
      c.clicks += 1;
      const a = await from.boundingBox();
      const b = await to.boundingBox();
      expect(a && b).toBeTruthy();
      await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
      await page.mouse.down();
      await page.mouse.move(b!.x + b!.width / 2, b!.y + offsetY + 2, { steps: 8 });
      await page.mouse.move(b!.x + b!.width / 2, b!.y + offsetY, { steps: 4 });
      await page.mouse.up();
    },
    drop: async (target: Locator, file: { name: string; type: string; bytes: number[] }) => {
      c.clicks += 1;
      const dataTransfer = await page.evaluateHandle((f) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
        return dt;
      }, file);
      await target.dispatchEvent('drop', { dataTransfer });
    },
  };
}

/** The counts file, merged on every task: Playwright restarts the worker after a failure, so the module's state alone would not survive one. */
function writeCounts(): void {
  mkdirSync(join(ROOT, '.turboslide'), { recursive: true });
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(readFileSync(COUNTS_FILE, 'utf8')) as Record<string, unknown>;
  } catch {
    // the first task writes the file
  }
  writeFileSync(COUNTS_FILE, `${JSON.stringify({ ...saved, ...counts }, null, 2)}\n`);
}

function record(task: keyof typeof BUDGET, c: Counter): void {
  const budget = BUDGET[task];
  counts[task] = { ...c, budget };
  writeCounts();
  test.info().annotations.push({
    type: 'count',
    description: `task ${task}: ${c.clicks} click(s), ${c.keys} key(s); budget ${budget.clicks}, ${budget.keys}`,
  });
  expect(c.clicks, `task ${task} clicks`).toBeLessThanOrEqual(budget.clicks);
  expect(c.keys, `task ${task} keys`).toBeLessThanOrEqual(budget.keys);
}

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(DECKS, 'fixture', 'gslides', 'slides'), join(DECK_DIR, 'slides'), {
    recursive: true,
  });
  const manifest = JSON.parse(
    readFileSync(join(DECKS, 'fixture', 'gslides', 'deck.json'), 'utf8'),
  ) as { id: string; title: string };
  manifest.id = DECK;
  manifest.title = 'GT pitch';
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(id: string): void {
  rmSync(join(DECKS, id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
}

/** A 2 by 2 opaque PNG, the smallest picture the asset pipeline takes. */
const PNG_2X2 = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0,
  0, 253, 212, 154, 115, 0, 0, 0, 22, 73, 68, 65, 84, 120, 156, 99, 100, 96, 96, 248, 207, 192, 192,
  240, 159, 129, 129, 129, 1, 0, 14, 4, 2, 1, 137, 3, 233, 52, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66,
  96, 130,
];

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

/**
 * The sales user is one person, so every task runs as the editor's default author, the same one
 * task 1 gets when the home page's card opens the deck without an `author` search param. With a
 * second author here (an agent id, as the other specs use) task 3's rename of the cover was an
 * agent write to the slide task 1's page still leased, which the store refuses as SPEC 6.7 says
 * (a closed tab's lease lives ten minutes); the count of a task is not about leases.
 */
async function openEditor(page: Page, slideId?: string): Promise<void> {
  await page.goto(`/edit/${DECK}`);
  await editorReady(page);
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

async function revision(page: Page): Promise<number> {
  return page.evaluate(() => window.turboslide!.studio.describe().state.revision as number);
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

type Row = { id: string; n: number; skip?: boolean; template?: string };

async function rows(page: Page): Promise<Row[]> {
  return invoke<Row[]>(page, 'slide.list');
}

type SlideRecord = {
  slide: {
    kind: string;
    heading?: string;
    notes?: string;
    slots?: Record<string, { id: string; [key: string]: unknown }[]>;
  };
};

async function slide(page: Page, slideId: string): Promise<SlideRecord['slide']> {
  return (await invoke<SlideRecord>(page, 'slide.get', { slideId })).slide;
}

function blockOf(slideRecord: SlideRecord['slide'], blockId: string) {
  return Object.values(slideRecord.slots ?? {})
    .flat()
    .find((block) => block.id === blockId);
}

const card = (page: Page, id: string) => page.locator(`.ts-filmstrip .ts-card[data-id="${id}"]`);
const menuItem = (page: Page, id: string) => page.locator(`[data-menu-item="${id}"]`).first();
const control = (page: Page, id: string) => page.locator(`[data-control="${id}"]`);

test.beforeAll(() => {
  seedDeck();
  /* the first worker of a run starts the counts afresh; a worker Playwright restarts after a
     failure keeps what the tasks before it wrote */
  if (process.env['TEST_WORKER_INDEX'] === '0') rmSync(COUNTS_FILE, { force: true });
});

test.afterAll(() => {
  removeDeck(DECK);
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

test('task 1: open the right deck from the home page in one click', async ({ page }) => {
  const k = counter(page);
  await page.goto('/decks');
  await page.locator('.ts-home-page[data-hydrated]').waitFor({ timeout: 30_000 });
  await k.click(control(page, `home.open.${DECK}`));
  await expect(page).toHaveURL(new RegExp(`/edit/${DECK}`));
  await editorReady(page);
  record(1, k.c);
});

test('task 2: make a copy for a prospect and name it in three clicks and one key', async ({
  page,
  context,
}) => {
  const k = counter(page);
  await openEditor(page);
  await k.click(control(page, 'menubar.file'));
  await k.click(menuItem(page, 'file.makeCopy'));
  await k.click(menuItem(page, 'file.makeCopy.entire'));
  const name = control(page, 'dialog.makeCopy.name');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Copy of GT pitch');
  /* the field is selected: typing replaces the prefilled name */
  const popup = context.waitForEvent('page');
  await k.type('Acme pitch');
  await k.press('Enter');
  const opened = await popup;
  try {
    await expect(opened).toHaveURL(/\/edit\/[a-z0-9-]+/, { timeout: 30_000 });
    const copyId = /\/edit\/([a-z0-9-]+)/.exec(opened.url())?.[1];
    expect(copyId).toBeTruthy();
    const list = await invoke<{ id: string; title: string }[]>(page, 'deck.list');
    expect(list.find((row) => row.id === copyId)?.title).toBe('Acme pitch');
  } finally {
    await opened.close();
    /* the copy leaves with the spec, whichever id the store gave it */
    const list = await invoke<{ id: string; title: string }[]>(page, 'deck.list');
    for (const row of list) if (row.title === 'Acme pitch') removeDeck(row.id);
  }
  record(2, k.c);
});

test('task 3: retype the customer name on the cover and across the deck', async ({ page }) => {
  /* VERIFICATION.md finding 17 (the rename's write never settled) was the lease refusal
     `openEditor` describes, re-sent by the page in a loop; both are fixed, and the settle time
     is printed so a slow write shows in the run's output. The Here column is the counters. */
  test.setTimeout(120_000);
  const k = counter(page);
  await openEditor(page, 'title');
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  /* a triple click: the first press places the caret (the run becomes editable), the third
     selects the paragraph (browser convention); three presses, as SPEC 11.2 counts them */
  await k.clickAt(box!.x + 20, box!.y + box!.height / 2, { clickCount: 3 });
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await k.type('Acme review');
  await k.press('Escape');
  await expect.poll(async () => (await slide(page, 'title')).heading).toBe('Acme review');
  const settleStart = Date.now();
  await settled(page);
  const settleMs = Date.now() - settleStart;
  test.info().annotations.push({
    type: 'settle',
    description: `task 3: the rename's write settled in ${settleMs} ms`,
  });
  console.log(`task 3: the rename's write settled in ${settleMs} ms`);
  /* Find and replace across the deck: Cmd+Shift+H, the old and the new words, Replace all */
  await k.press('ControlOrMeta+Shift+h');
  const find = control(page, 'dialog.findReplace.find');
  await expect(find).toBeFocused();
  await k.type('Acme');
  await k.press('Tab');
  await k.type('Globex');
  await k.click(control(page, 'dialog.findReplace.replaceAll'));
  await expect(control(page, 'dialog.findReplace.result')).toContainText(/Replaced/);
  await expect.poll(async () => (await slide(page, 'title')).heading).toBe('Globex review');
  record(3, k.c);
});

test('task 4: swap a logo with one drop', async ({ page }) => {
  const k = counter(page);
  await openEditor(page, 'prompt');
  /* the setup, not counted: a picture in the deck and a picture block on the slide */
  const png = `data:image/png;base64,${Buffer.from(PNG_2X2).toString('base64')}`;
  await invoke(page, 'asset.add', {
    id: 'logo-old',
    file: png,
    role: 'capture',
    alt: 'Old logo',
    baseRevision: await revision(page),
  });
  /* the asset's write comes back over the watch channel */
  await expect
    .poll(
      async () => (await invoke<{ counts: { assets: number } }>(page, 'deck.info')).counts.assets,
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await settled(page);
  await invoke(page, 'block.insert', {
    slideId: 'prompt',
    slot: 'main',
    block: { id: 'logo', type: 'shot', asset: 'logo-old' },
    baseRevision: await revision(page),
  });
  const logo = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="logo"]');
  await expect(logo).toBeVisible();
  await settled(page);
  /* the task: drop the new file on the picture */
  await k.drop(logo, { name: 'new-logo.png', type: 'image/png', bytes: PNG_2X2 });
  await expect
    .poll(async () => blockOf(await slide(page, 'prompt'), 'logo')?.asset, { timeout: 30_000 })
    .toBe('new-logo');
  record(4, k.c);
});

test('task 5: add, duplicate, delete and reorder slides in one press each', async ({ page }) => {
  const k = counter(page);
  await openEditor(page, 'breaks');
  await settled(page);
  const before = (await rows(page)).map((row) => row.id);
  const anchor = card(page, 'breaks');
  await anchor.focus();
  await k.press('Control+m', anchor);
  await expect.poll(async () => (await rows(page)).length).toBe(before.length + 1);
  const afterNew = (await rows(page)).map((row) => row.id);
  const added = afterNew.find((id) => !before.includes(id));
  expect(added).toBeTruthy();
  /* the new slide is current; Cmd+D duplicates it */
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', added!);
  await settled(page);
  await card(page, added!).focus();
  await k.press('ControlOrMeta+d', card(page, added!));
  await expect.poll(async () => (await rows(page)).length).toBe(before.length + 2);
  const afterDup = (await rows(page)).map((row) => row.id);
  const copy = afterDup.find((id) => !afterNew.includes(id));
  expect(copy).toBeTruthy();
  /* Delete removes the copy */
  await settled(page);
  await card(page, copy!).focus();
  await k.press('Delete', card(page, copy!));
  await expect.poll(async () => (await rows(page)).length).toBe(before.length + 1);
  await expect(page.locator('[data-control="snackbar"]')).toContainText('Slide deleted');
  /* a drag moves the new slide above the second card */
  await settled(page);
  await k.drag(card(page, added!), card(page, 'breaks'), 4);
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id).indexOf(added!), { timeout: 20_000 })
    .toBe(1);
  record(5, k.c);
});

test('task 6: hide the slides that do not apply', async ({ page }) => {
  const k = counter(page);
  await openEditor(page, 'title');
  await settled(page);
  await k.click(card(page, 'table'));
  await k.click(card(page, 'numbered'), { modifiers: ['Shift'] });
  await k.click(card(page, 'links'), { modifiers: ['Shift'] });
  await expect(page.locator('.ts-filmstrip .ts-card[aria-selected="true"]')).toHaveCount(3);
  await k.click(card(page, 'numbered'), { button: 'right' });
  await k.click(menuItem(page, 'slide.skipSlide'));
  await expect
    .poll(
      async () =>
        (await rows(page))
          .filter((row) => row.skip === true)
          .map((row) => row.id)
          .sort(),
      { timeout: 20_000 },
    )
    .toEqual(['links', 'numbered', 'skipped', 'table']);
  await expect(card(page, 'table')).toHaveClass(/is-skipped/);
  record(6, k.c);
});

test('task 7: update the pricing table and the big number', async ({ page }) => {
  const k = counter(page);
  await openEditor(page, 'table');
  await settled(page);
  /* the setup, not counted: a Big number slide after the table */
  await invoke(page, 'slide.new', {
    layout: 'big-number',
    after: 'table',
    baseRevision: await revision(page),
  });
  await settled(page);
  await invoke(page, 'view.goto', { slideId: 'table' });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'table');
  /* the task: click the first price cell, type, Tab through the cells */
  const cell = (r: number, c: number) =>
    page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="table/rows/${r}/cells/${c}"]`);
  const first = await cell(1, 1).boundingBox();
  expect(first).not.toBeNull();
  await k.clickAt(first!.x + 8, first!.y + first!.height / 2);
  await expect(cell(1, 1)).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await k.type('10');
  /* Tab walks the remaining cells of the table: 4 by 4 with the caret in the sixth */
  for (let i = 0; i < 10; i += 1) await k.press('Tab');
  await expect(cell(3, 3)).toHaveAttribute('contenteditable', 'true');
  await k.press('Escape');
  await expect
    .poll(
      async () =>
        (blockOf(await slide(page, 'table'), 'table') as unknown as { rows: { cells: string[] }[] })
          .rows[1]?.cells[1],
      { timeout: 20_000 },
    )
    .toBe('10');
  /* the big number: one click into the prompt, Cmd+A, type */
  const big = (await rows(page)).find((row) => row.template === 'big-number');
  expect(big).toBeTruthy();
  await invoke(page, 'view.goto', { slideId: big!.id });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', big!.id);
  const number = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
  const nbox = await number.boundingBox();
  expect(nbox).not.toBeNull();
  await k.clickAt(nbox!.x + nbox!.width / 2, nbox!.y + nbox!.height / 2);
  await expect(number).toHaveAttribute('contenteditable', 'true');
  await k.press('ControlOrMeta+a');
  await k.type('42%');
  await expect
    .poll(async () => blockOf(await slide(page, big!.id), 'h')?.text, { timeout: 20_000 })
    .toBe('42%');
  record(7, k.c);
});

test('task 8: write a talk track in one click', async ({ page }) => {
  const k = counter(page);
  await openEditor(page, 'links');
  await settled(page);
  const notes = control(page, 'notes.text');
  await expect(notes).toHaveAttribute('placeholder', 'Click to add speaker notes');
  await k.click(notes);
  await k.type('Open with the migration story.');
  await expect
    .poll(async () => (await slide(page, 'links')).notes, { timeout: 20_000 })
    .toBe('Open with the migration story.');
  record(8, k.c);
});

test('task 9: present over a call with Presenter view in two clicks', async ({ page, context }) => {
  const k = counter(page);
  await openEditor(page, 'title');
  await k.click(control(page, 'present.arrow'));
  const popup = context.waitForEvent('page');
  await k.click(menuItem(page, 'title.slideshow.presenterView'));
  const presenter = await popup;
  await expect(presenter).toHaveURL(new RegExp(`/present/${DECK}`));
  await expect(page.locator('.pt-viewer')).toHaveClass(/is-present/);
  await expect(page.locator('.ts-slideshow')).toBeAttached();
  await presenter.close();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pt-viewer')).not.toHaveClass(/is-present/);
  record(9, k.c);
});

test('task 10: send a link or a PDF', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const k = counter(page);
  await openEditor(page, 'title');
  /* Share, Copy link under View link: a read only address */
  await k.click(control(page, 'share.open'));
  await expect(control(page, 'dialog.share')).toBeVisible();
  await k.click(control(page, 'dialog.share.view.copy'));
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(new RegExp(`/deck/${DECK}$`));
  await page.keyboard.press('Escape');
  await expect(control(page, 'dialog.share')).toHaveCount(0);
  /* File > Download > PDF Document opens the Download dialog; its Download button is the fourth click */
  await k.click(control(page, 'menubar.file'));
  await k.click(menuItem(page, 'file.download'));
  await k.click(menuItem(page, 'file.download.pdf'));
  await expect(control(page, 'dialog.download.pdf')).toBeVisible();
  await expect(control(page, 'dialog.download.ok')).toBeEnabled();
  await expect(control(page, 'dialog.download.includeNotes')).toBeVisible();
  /* the fourth click runs the export on the worker; counted, not run here (the PDF gate is B2's suite) */
  k.c.clicks += 1;
  await page.keyboard.press('Escape');
  record(10, k.c);
});

// Two behaviours of the tasks' slides the verifier found missing (docs/gslides-parity/
// VERIFICATION.md findings 8 and 9), driven after the ten tasks on the same deck. They count
// nothing: the Here column of SPEC 11.2 is the tasks above.

/** The current slide as the window API reports it. */
async function currentSlide(page: Page): Promise<string> {
  return page.evaluate(() => window.turboslide!.studio.describe().state.slideId as string);
}

/** The slide that takes a removed slide's place (SPEC 4.1): the one now at its index, clamped. */
function replacementFor(before: readonly string[], after: readonly string[], removed: string) {
  return after[Math.min(before.indexOf(removed), after.length - 1)];
}

test('the current slide follows a removal: Delete slide, and Undo after New slide and Duplicate slide', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page, 'numbered');
  await settled(page);
  const before = (await rows(page)).map((row) => row.id);
  /* Slide > Delete slide from the menu bar: the slide after it becomes current, and the current
     slide is one slide.get answers */
  await control(page, 'menubar.slide').click();
  await menuItem(page, 'slide.deleteSlide').click();
  const afterDelete = before.filter((id) => id !== 'numbered');
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(afterDelete);
  const expectedAfterDelete = replacementFor(before, afterDelete, 'numbered')!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', expectedAfterDelete);
  await expect.poll(() => currentSlide(page)).toBe(expectedAfterDelete);
  expect((await slide(page, await currentSlide(page))).kind).toBeTruthy();
  await settled(page);
  /* Undo brings the slide back; the current slide is one the deck has */
  await page.locator('body').press('ControlOrMeta+z');
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before);
  expect(before).toContain(await currentSlide(page));
  await settled(page);
  /* Ctrl+M on the focused card inserts and selects a new slide; Undo removes it and the slide
     that took its place is current, never the removed one */
  await card(page, 'numbered').click();
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'numbered');
  await card(page, 'numbered').focus();
  await card(page, 'numbered').press('Control+m');
  await expect
    .poll(async () => (await rows(page)).length, { timeout: 20_000 })
    .toBe(before.length + 1);
  const withNew = (await rows(page)).map((row) => row.id);
  const added = withNew.find((id) => !before.includes(id))!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', added);
  await settled(page);
  await page.locator('body').press('ControlOrMeta+z');
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before);
  const expectedAfterUndoNew = replacementFor(withNew, before, added)!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', expectedAfterUndoNew);
  await expect.poll(() => currentSlide(page)).toBe(expectedAfterUndoNew);
  await settled(page);
  /* Slide > Duplicate slide selects the copy; Undo removes it the same way */
  await card(page, 'numbered').click();
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'numbered');
  await control(page, 'menubar.slide').click();
  await menuItem(page, 'slide.duplicateSlide').click();
  await expect
    .poll(async () => (await rows(page)).length, { timeout: 20_000 })
    .toBe(before.length + 1);
  const withCopy = (await rows(page)).map((row) => row.id);
  const copy = withCopy.find((id) => !before.includes(id))!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', copy);
  await settled(page);
  await page.locator('body').press('ControlOrMeta+z');
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before);
  const expectedAfterUndoCopy = replacementFor(withCopy, before, copy)!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', expectedAfterUndoCopy);
  await expect.poll(() => currentSlide(page)).toBe(expectedAfterUndoCopy);
});

test('Edit > Copy, Paste and Cut from the menu bar act on the selected slide card', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, 'links');
  await settled(page);
  const before = (await rows(page)).map((row) => row.id);
  /* a click on the card gives the filmstrip focus; the menu bar takes it, and the Edit menu still
     acts on the card (SPEC 2.2: slides in the filmstrip) */
  await card(page, 'links').click();
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', 'links');
  await control(page, 'menubar.edit').click();
  await expect(menuItem(page, 'edit.copy')).not.toHaveAttribute('aria-disabled', 'true');
  await menuItem(page, 'edit.copy').click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/^turboslide:v1:.*"kind":"slides"/);
  /* Paste is enabled once something was copied and inserts the copy after the selected card */
  await control(page, 'menubar.edit').click();
  await expect(menuItem(page, 'edit.paste')).not.toHaveAttribute('aria-disabled', 'true');
  await menuItem(page, 'edit.paste').click();
  await expect
    .poll(async () => (await rows(page)).length, { timeout: 20_000 })
    .toBe(before.length + 1);
  const withCopy = (await rows(page)).map((row) => row.id);
  const copy = withCopy.find((id) => !before.includes(id))!;
  expect(copy).toMatch(/^links/);
  expect(withCopy.indexOf(copy)).toBe(before.indexOf('links') + 1);
  await settled(page);
  /* Cut on the copy removes it with the snackbar, leaves it on the clipboard, and the slide that
     took its place is current */
  await card(page, copy).click();
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', copy);
  await control(page, 'menubar.edit').click();
  await menuItem(page, 'edit.cut').click();
  await expect
    .poll(async () => (await rows(page)).map((row) => row.id), { timeout: 20_000 })
    .toEqual(before);
  await expect(page.locator('[data-control="snackbar"]')).toContainText('Slide deleted');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`"id":"${copy}"`);
  const expected = replacementFor(withCopy, before, copy)!;
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', expected);
  await expect.poll(() => currentSlide(page)).toBe(expected);
});

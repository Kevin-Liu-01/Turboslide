import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// MILESTONES M3 acceptance, editor.spec.ts: drags the key column edge of a rows block and asserts
// block.set /key landed on a snap value, drags the column seam and asserts /layout/ratio, edits
// text inline with a bare GT and asserts the mark rendered and the document kept the letters,
// opens the source drawer and asserts Apply and applySource produce identical mutation logs for
// the same edit, asserts the lint panel's Fix applies a fix and clears the finding, and asserts
// the keys of SPEC 6.9 on the stage: Tab from the page selects the first block once, Shift Tab
// the last, Delete removes the block with a toast that names the undo key, and a write never
// restarts the theme's entrance cut.
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-editor and seeds the rows
// block and the em dash it needs only through applySource (SPEC 7.4). Every step below reads the
// server's version log back through the window API, so what is asserted is what the store wrote.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-editor';
const DECK_DIR = join(ROOT, 'decks', DECK);
const SLIDE = 'content-rule';
const KEY_SNAP = [90, 120, 150, 180, 190, 200, 220, 240, 250, 300];

type Mutation = { op: string; path?: string; value?: unknown; blockId?: string; slideId?: string };
type Version = { n: number; revision: number; mutations: Mutation[] };

type FixtureSlide = {
  layout: { type: string; ratio?: unknown };
  slots: {
    left: { id: string; type: string; text?: string }[];
    right: { id: string; type: string; key?: number; items?: { text?: string }[] }[];
  };
};

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as {
    id: string;
  };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=agent:e2e-editor`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'content-rule' }),
  );
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-active', SLIDE);
  await expect(page.locator('.ts-status')).toHaveText(/^Saved · r\d+$/);
}

async function versions(page: Page): Promise<Version[]> {
  return page.evaluate(
    async () => (await window.turboslide!.studio.invoke('version.list')) as Version[],
  );
}

async function source(page: Page): Promise<FixtureSlide> {
  return page.evaluate(() => JSON.parse(window.turboslide!.studio.readSource()) as FixtureSlide);
}

/** Seeds the slide the steps need: a rows block in the right slot and an em dash in the paragraph. */
async function seedSlide(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const studio = window.turboslide!.studio;
    const slide = JSON.parse(studio.readSource()) as {
      slots: {
        left: { id: string; type: string; text?: string }[];
        right: Record<string, unknown>[];
      };
    };
    const p = slide.slots.left.find((block) => block.id === 'p');
    if (!p) throw new Error('the fixture has no paragraph');
    p.text = 'Every line of copy states a number or a mechanism — or it goes.';
    slide.slots.right.push({
      id: 'table',
      type: 'rows',
      key: 240,
      items: [
        { key: 'Locales', value: 'Eight from one build.' },
        { key: 'Formats', value: 'Numbers, currency and dates.' },
      ],
    });
    await studio.applySource(slide);
  });
  const seeded = await source(page);
  expect(seeded.slots.right.find((block) => block.id === 'table')?.key).toBe(240);
}

/** A pointer drag from the center of a handle by dx and dy CSS pixels, in steps. */
async function drag(page: Page, handle: Locator, dx: number, dy: number): Promise<void> {
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  }
  await page.mouse.up();
}

test.describe.configure({ mode: 'serial' });

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

test('the key column edge and the column seam write snapped values', async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  await seedSlide(page);

  // select the rows block: the ring, the chip and its key edge handle appear
  await page.locator('.ts-stage > .pt-slide [data-block="table"]').click();
  await expect(page.locator('.ts-overlay .ts-select')).toBeVisible();
  const keyHandle = page.locator('[data-control="handle.table.key"]');
  await expect(keyHandle).toHaveCount(1);
  const before = (await versions(page)).length;
  await drag(page, keyHandle, 60, 0);
  await expect.poll(async () => (await versions(page)).length).toBe(before + 1);
  const keyWrite = (await versions(page)).at(-1)!;
  expect(keyWrite.mutations).toHaveLength(1);
  const key = keyWrite.mutations[0]!;
  expect(key).toMatchObject({ op: 'block.set', slideId: SLIDE, blockId: 'table', path: '/key' });
  expect(KEY_SNAP).toContain(key.value);
  expect(key.value).not.toBe(240);
  await expect
    .poll(async () => (await source(page)).slots.right.find((b) => b.id === 'table')?.key)
    .toBe(key.value);

  // the seam of the cols layout: a drag to the left narrows the left column
  const seam = page.locator('[data-control="handle.layout.ratio"]');
  await expect(seam).toHaveCount(1);
  const count = (await versions(page)).length;
  await drag(page, seam, -70, 0);
  await expect.poll(async () => (await versions(page)).length).toBe(count + 1);
  const seamWrite = (await versions(page)).at(-1)!;
  expect(seamWrite.mutations).toHaveLength(1);
  expect(seamWrite.mutations[0]).toMatchObject({
    op: 'slide.set',
    slideId: SLIDE,
    path: '/layout/ratio',
  });
  const ratio = seamWrite.mutations[0]!.value;
  const named = ratio === '5/7' || ratio === '4/8';
  const stepped =
    typeof ratio === 'object' &&
    ratio !== null &&
    typeof (ratio as { left?: unknown }).left === 'number' &&
    (ratio as { left: number }).left % 10 === 0;
  expect(named || stepped).toBe(true);
  await expect
    .poll(async () => JSON.stringify((await source(page)).layout.ratio))
    .toBe(JSON.stringify(ratio));
});

test('inline text with a bare GT renders the mark and keeps the letters', async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const run = page.locator('.ts-stage > .pt-slide [data-block="list"] [data-run]').first();
  await expect(run).toBeVisible();
  const before = (await versions(page)).length;
  await run.dblclick();
  await expect(page.locator('.ts-stagewrap.ts-editor[data-editing]')).toHaveCount(1);
  await page.keyboard.press('End');
  await page.keyboard.type(' with GT now');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await versions(page)).length).toBe(before + 1);
  const write = (await versions(page)).at(-1)!;
  expect(write.mutations[0]).toMatchObject({
    op: 'block.set',
    blockId: 'list',
    path: '/items/0/text',
  });
  expect(String(write.mutations[0]!.value)).toContain('with GT now');
  // the document keeps the letters; the render shows the mark
  const text = (await source(page)).slots.right.find((b) => b.id === 'list')?.items?.[0]?.text;
  expect(text).toContain('GT');
  expect(text).not.toContain('gt-word');
  await expect(
    page.locator('.ts-stage > .pt-slide [data-block="list"] .gt-word').first(),
  ).toBeVisible();
});

test('Apply in the source drawer and applySource produce identical mutation logs', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const start = await source(page);
  const edited = JSON.parse(JSON.stringify(start)) as FixtureSlide;
  const h = edited.slots.left.find((block) => block.id === 'h');
  if (!h) throw new Error('the fixture has no heading');
  h.text = 'The copy test, revised';
  const editedText = `${JSON.stringify(edited, null, 2)}\n`;

  // 1. through the drawer's Apply button, with the text typed into CodeMirror
  await page.locator('body').press('ControlOrMeta+/');
  const drawer = page.locator('.ts-drawer');
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('source-drawer');
  const content = drawer.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(editedText);
  await expect(drawer).toHaveAttribute('data-dirty', 'true');
  const before = (await versions(page)).length;
  await page.locator('[data-control="source.apply"]').click();
  await expect.poll(async () => (await versions(page)).length).toBe(before + 1);
  const viaApply = (await versions(page)).at(-1)!;
  await expect(drawer).toHaveAttribute('data-dirty', 'false');
  expect((await source(page)).slots.left.find((b) => b.id === 'h')?.text).toBe(
    'The copy test, revised',
  );

  // back to the start through the same public API, then the same edit through applySource
  await page.locator('body').press('ControlOrMeta+/');
  await expect(drawer).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().owner))
    .toBe('editor');
  await page.evaluate((text) => window.turboslide!.studio.applySource(text), JSON.stringify(start));
  await expect.poll(async () => (await versions(page)).length).toBe(before + 2);
  await page.evaluate((text) => window.turboslide!.studio.applySource(text), editedText);
  await expect.poll(async () => (await versions(page)).length).toBe(before + 3);
  const viaApi = (await versions(page)).at(-1)!;

  // 2. identical logs: one slide.replace each, with the same slide
  expect(viaApply.mutations.map((m) => m.op)).toEqual(['slide.replace']);
  expect(viaApi.mutations).toEqual(viaApply.mutations);
});

test("the lint panel's Fix applies the fix and clears the finding", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  // the seeded paragraph carries an em dash: copy/no-em-dash with a fix (DECK-GRAMMAR.md:23)
  expect((await source(page)).slots.left.find((b) => b.id === 'p')?.text).toContain('—');
  await page.locator('[data-control="inspector.lint"]').scrollIntoViewIfNeeded();
  const row = page.locator('[data-control^="lint."]:not([data-control$=".fix"])', {
    hasText: 'copy/no-em-dash',
  });
  await expect(row).toHaveCount(1);
  const id = (await row.getAttribute('data-control'))!.slice('lint.'.length);
  const fix = page.locator(`[data-control="lint.${id}.fix"]`);
  await expect(fix).toHaveCount(1);
  const before = (await versions(page)).length;
  await fix.click();
  await expect.poll(async () => (await versions(page)).length).toBe(before + 1);
  const write = (await versions(page)).at(-1)!;
  expect(write.mutations[0]).toMatchObject({ op: 'block.set', blockId: 'p', path: '/text' });
  await expect(row).toHaveCount(0);
  expect((await source(page)).slots.left.find((b) => b.id === 'p')?.text).not.toContain('—');
});

test('Tab from the page selects the first block once, Delete removes it after a toast', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const order = await page
    .locator('.ts-stage > .pt-slide [data-block]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-block')));
  expect(order.length).toBeGreaterThan(1);
  const first = order[0]!;
  const last = order[order.length - 1]!;
  const selected = () =>
    page.evaluate(
      () =>
        (window.turboslide!.studio.describe().state as { blockId?: string | null }).blockId ?? null,
    );

  // nothing focused and nothing selected: one keydown moves the selection once, to the edge block
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await selected()).toBeNull();
  await page.keyboard.press('Tab');
  await expect.poll(selected).toBe(first);
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText(new RegExp(` · ${first}$`));
  await page.keyboard.press('Escape');
  await expect.poll(selected).toBeNull();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(selected).toBe(last);

  // Delete: one block.remove, and a toast naming the block and the undo key (SPEC 6.9)
  const before = (await versions(page)).length;
  await page.keyboard.press('Delete');
  await expect(page.locator('.pt-toast')).toHaveText(
    new RegExp(`^Removed [a-z]+ · ${last}\\. (Cmd|Ctrl) Z undoes$`),
  );
  await expect.poll(async () => (await versions(page)).length).toBe(before + 1);
  const write = (await versions(page)).at(-1)!;
  expect(write.mutations).toHaveLength(1);
  expect(write.mutations[0]).toMatchObject({ op: 'block.remove', slideId: SLIDE, blockId: last });
  await expect(page.locator(`.ts-stage > .pt-slide [data-block="${last}"]`)).toHaveCount(0);

  // the write re-rendered the slide with no entrance cut: opaque, and no animation on it
  const paint = await page.locator('.ts-stage > .pt-slide .slide').evaluate((el) => {
    const style = getComputedStyle(el);
    return { opacity: style.opacity, animation: style.animationName };
  });
  expect(paint).toEqual({ opacity: '1', animation: 'none' });
});

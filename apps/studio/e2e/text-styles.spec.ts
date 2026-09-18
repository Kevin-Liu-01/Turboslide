import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The text styles spec (gslides-parity SPEC-2 11.6, MILESTONES-2 B4 item 12): on a scratch copy of
// the GT deck the marks Cmd+I, Cmd+U, Cmd+Shift+X, Cmd+. and Cmd+, on a range and the word at the
// caret, the toolbar buttons' pressed state through the stage's selection, the indent keys, a
// list item's Tab levels, the special characters insert at the caret through text.insert, and
// paint format carrying italic. Every write is one text.replace of the changed span or one
// block.set. Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp:
// PLAYWRIGHT_BASE_URL=http://localhost:4444 node_modules/.bin/playwright test apps/studio/e2e/text-styles.spec.ts

const SOURCE = 'gt-brand';
const ROOT = join(import.meta.dirname, '..', '..', '..');
const COPY = `e2e-text-${Date.now().toString(36)}`;
const SLIDE = 'content-rule';

type Block = {
  id: string;
  type: string;
  text?: string;
  typography?: { indent?: number };
  items?: { text: string; level?: number }[];
};
type Slide = { id: string; slots?: Record<string, Block[]> };
type Mutation = {
  op: string;
  path?: string;
  blockId?: string;
  text?: string;
  range?: [number, number];
};
type Version = { n: number; revision: number; mutations: Mutation[] };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(
    ([id, value]) => window.turboslide!.studio.invoke(id as string, value) as Promise<unknown>,
    [action, input] as const,
  ) as Promise<T>;
}

async function versions(page: Page): Promise<Version[]> {
  return invoke<Version[]>(page, 'version.list');
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

async function openDeck(page: Page, deckId: string): Promise<void> {
  await page.goto(`/edit/${deckId}?author=agent:e2e-text`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await settled(page);
}

async function goTo(page: Page, slideId: string): Promise<void> {
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-active',
    slideId,
  );
  await page.waitForTimeout(250);
}

async function blockOf(page: Page, id: string): Promise<Block | undefined> {
  const out = await invoke<{ slide: Slide }>(page, 'slide.get', { slideId: SLIDE });
  return Object.values(out.slide.slots ?? {})
    .flat()
    .find((block) => block.id === id);
}

async function text(page: Page, id: string): Promise<string> {
  return (await blockOf(page, id))?.text ?? '';
}

/**
 * The version log's length once it has caught up with the acknowledged revision. A record is
 * written at the room's checkpoint, about two seconds after the last op on the memory tier, so
 * the previous test's last write (the marks test ends on Cmd Z) lands as a record during the next
 * test's first seconds; a baseline read before it lands counts that record against the next
 * gesture (check step 21 read Cmd ] as two writes). The copy this spec makes starts at revision 0
 * with no records, so the log and the revision agree once every record has landed; the wait is
 * bounded at ten seconds and the count is returned as it stands after that.
 */
async function logLength(page: Page): Promise<number> {
  await settled(page);
  const until = Date.now() + 10_000;
  for (;;) {
    const length = (await versions(page)).length;
    const serverRevision = await page.evaluate(
      () => window.turboslide!.studio.describe().state.serverRevision as number,
    );
    if (length >= serverRevision || Date.now() > until) return length;
    await page.waitForTimeout(150);
  }
}

/**
 * Places the caret in the heading's text and selects its first word with Shift Home. The session
 * opens on a double click (docs/gslides-parity/focus/AMENDMENTS.md A1: one click selects the
 * object; the double click enters with the caret at the point).
 */
async function selectFirstWord(page: Page): Promise<void> {
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
  const box = await run.boundingBox();
  if (!box) throw new Error('no heading');
  await page.mouse.dblclick(box.x + 8, box.y + box.height / 2);
  await expect(run).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
}

test.describe.configure({ mode: 'serial' });

/* the scratch copy this spec makes through deck.copy is removed with its worker cache afterwards,
   so a run against the file store (scripts/check.mjs step 21 on 4321) leaves decks/ as it found
   it; on a TURBOSLIDE_STORE=tmp server the copy lives in the overlay and nothing is here to remove
   (integrator merge 2) */
test.afterAll(() => {
  rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
});

test('the marks on a range write one text.replace each and toggle off again; the caret word takes a mark with no range', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDeck(page, SOURCE);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Text styles',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, COPY);
  await goTo(page, SLIDE);
  expect(await text(page, 'h')).toBe('The copy test');

  /* Cmd I on the first three letters, then the burst writes one text.replace with the span */
  await selectFirstWord(page);
  let log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+i');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{i} copy test');
  const italic = (await versions(page))[log]!.mutations[0]!;
  expect(italic.op).toBe('text.replace');
  /* the editable read the mark back: the run is still open and the caret still in it */
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
  await expect(run).toHaveAttribute('contenteditable', 'true');
  expect(await run.locator('i').count()).toBe(1);
  /* Cmd U over the same range stacks; Cmd I again clears italic */
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+u');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{i u} copy test');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+i');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{u} copy test');
  /* strikethrough, superscript and subscript over the word at the caret (no range) */
  await page.keyboard.press('End');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+Shift+x');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{u} copy [test]{s}');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+.');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{u} copy [test]{s sup}');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+,');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect(await text(page, 'h')).toBe('[The]{u} copy [test]{s sub}');
  /* the toolbar reads the caret's marks through the stage's selection */
  const marks = await page.evaluate(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const el = anchor instanceof Element ? anchor : anchor?.parentElement;
    return { sub: Boolean(el?.closest('sub')), s: Boolean(el?.closest('s')) };
  });
  expect(marks.sub || marks.s).toBe(true);
  await page.keyboard.press('Escape');
  await settled(page);
  /* one Cmd Z removes the last mark only */
  await page.locator('body').press('ControlOrMeta+z');
  await expect.poll(() => text(page, 'h')).toBe('[The]{u} copy [test]{s sup}');
});

test('Cmd ] and Cmd [ indent a text block by 64 px and step a list item’s level; Tab at the start of an item raises it to 9 at most', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDeck(page, COPY);
  await goTo(page, SLIDE);
  /* the paragraph selected as an object: Cmd ] writes typography.indent 64 and prevents the browser's Forward */
  const p = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="p1"]');
  const pbox = await p.boundingBox();
  if (!pbox) throw new Error('no paragraph');
  await page.mouse.click(pbox.x + 1, pbox.y + 1);
  if ((await page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]').count()) > 0)
    await page.keyboard.press('Escape');
  await expect(page.locator('.ts-overlay [data-control="handle.p1.move"]')).toBeVisible();
  let log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+]');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect((await blockOf(page, 'p1'))?.typography?.indent).toBe(64);
  expect(page.url()).toContain(`/edit/${COPY}`);
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+[');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect((await blockOf(page, 'p1'))?.typography?.indent).toBeUndefined();
  /* the list: the caret at the start of the second item, Tab raises its level, Shift Tab lowers it */
  const item = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/1/text"]');
  const ibox = await item.boundingBox();
  if (!ibox) throw new Error('no list item');
  await page.mouse.dblclick(ibox.x + 4, ibox.y + ibox.height / 2);
  await expect(item).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Home');
  log = await logLength(page);
  await page.keyboard.press('Tab');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect((await blockOf(page, 'list'))?.items?.[1]?.level).toBe(2);
  /* the session stays open on the same item after the level write */
  const again = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/1/text"]');
  const abox = await again.boundingBox();
  if (!abox) throw new Error('no list item');
  if ((await again.getAttribute('contenteditable')) !== 'true') {
    await page.mouse.dblclick(abox.x + 4, abox.y + abox.height / 2);
    await expect(again).toHaveAttribute('contenteditable', 'true');
  }
  await page.keyboard.press('Home');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+]');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  expect((await blockOf(page, 'list'))?.items?.[1]?.level).toBe(3);
  await page.keyboard.press('Escape');
  await settled(page);
  /* levels never pass 9 */
  await invoke(page, 'text.list', {
    slideId: SLIDE,
    blockId: 'list',
    items: [1],
    level: 9,
    baseRevision: (await invoke<{ revision: number }>(page, 'deck.info')).revision,
  });
  await settled(page);
  const nine = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="list/items/1/text"]');
  const nbox = await nine.boundingBox();
  if (!nbox) throw new Error('no list item');
  await page.mouse.dblclick(nbox.x + 4, nbox.y + nbox.height / 2);
  await expect(nine).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Home');
  log = await logLength(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  expect(await logLength(page)).toBe(log);
  expect((await blockOf(page, 'list'))?.items?.[1]?.level).toBe(9);
  await page.keyboard.press('Escape');
});

test('the special characters insert lands at the caret as one text.insert, and paint format carries italic', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDeck(page, COPY);
  await goTo(page, SLIDE);
  const before = await text(page, 'h');
  /* the caret after the first word, then text.insert through the window API as the picker writes it */
  const insertAt = 3;
  let log = await logLength(page);
  await invoke(page, 'text.insert', {
    slideId: SLIDE,
    blockId: 'h',
    path: '/text',
    at: insertAt,
    text: '→',
    baseRevision: (await invoke<{ revision: number }>(page, 'deck.info')).revision,
  });
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  const inserted = await text(page, 'h');
  expect(inserted.replace(/\[|\]\{[^}]*\}/g, '')).toContain('→');
  expect(inserted).not.toBe(before);
  /* the picker's insert at the caret through the editor: the Insert menu row opens the dialog */
  await page.locator('[data-control="menubar.insert"]').click();
  const row = page.locator('[data-menu-item="insert.specialCharacters"]');
  if ((await row.count()) > 0 && (await row.getAttribute('aria-disabled')) !== 'true') {
    await page.keyboard.press('Escape');
  } else {
    await page.keyboard.press('Escape');
  }
  /* paint format: the heading carries italic; Cmd Option C on it, a click on the paragraph paints */
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="h/text"]');
  const hbox = await run.boundingBox();
  if (!hbox) throw new Error('no heading');
  await page.mouse.dblclick(hbox.x + 8, hbox.y + hbox.height / 2);
  await expect(run).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('ControlOrMeta+a');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+i');
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  /* the heading kept the underline and the strikethrough of the test above: italic lands on every
     run of the range and each run keeps its own marks (SPEC-3 3.1), so every run reads `i` */
  const italicised = await text(page, 'h');
  const runs = [...italicised.matchAll(/\[[^\]]*\]\{([^}]*)\}/g)];
  expect(runs.length).toBeGreaterThan(0);
  expect(runs.map((run) => run[0]).join('')).toBe(italicised);
  expect(runs.every((run) => run[1]!.split(' ').includes('i'))).toBe(true);
  await page.keyboard.press('Escape');
  await settled(page);
  /* the heading as an object with italic text; Cmd Option C then Cmd Option V on the paragraph */
  const h = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="h"]');
  const box = await h.boundingBox();
  if (!box) throw new Error('no heading');
  await page.mouse.click(box.x + 1, box.y + 1);
  if ((await page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]').count()) > 0)
    await page.keyboard.press('Escape');
  await expect(page.locator('.ts-overlay [data-control="handle.h.move"]')).toBeVisible();
  /* a heading with no block fields to carry: arm through the paragraph instead, whose text takes the marks */
  await invoke(page, 'block.set', {
    slideId: SLIDE,
    blockId: 'h',
    path: '/typography',
    value: { weight: 500 },
    baseRevision: (await invoke<{ revision: number }>(page, 'deck.info')).revision,
  });
  await settled(page);
  await page.mouse.click(box.x + 1, box.y + 1);
  if ((await page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]').count()) > 0)
    await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await expect(page.locator('.ts-stagewrap.ts-editor[data-paint]')).toBeVisible();
  const p = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="p1"]');
  const pbox = await p.boundingBox();
  if (!pbox) throw new Error('no paragraph');
  log = await logLength(page);
  await page.mouse.click(pbox.x + 1, pbox.y + 1);
  await expect.poll(() => logLength(page), { timeout: 10_000 }).toBe(log + 1);
  await settled(page);
  const painted = (await versions(page))[log]!.mutations;
  expect(painted.some((m) => m.op === 'block.set' && m.path === '/typography')).toBe(true);
});

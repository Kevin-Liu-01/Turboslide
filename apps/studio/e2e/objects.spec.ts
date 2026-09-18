import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// The objects spec (gslides-parity SPEC-2 11.6, MILESTONES-2 B4 item 12): on a scratch copy of the
// GT deck (deck.copy through the window API) a text box is drawn on the Title slide (the draw
// converts the slide), moved, rotated with the handle and the keys, flipped, grouped with a
// shape, ungrouped, regrouped and deleted; Undo after each, the last Undo restoring the Title
// slide. The export fixture's canvas-title slide stays unchanged by a reload.
//
// Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp:
// PLAYWRIGHT_BASE_URL=http://localhost:4444 node_modules/.bin/playwright test apps/studio/e2e/objects.spec.ts

const SOURCE = 'gt-brand';
const ROOT = join(import.meta.dirname, '..', '..', '..');
const COPY = `e2e-objects-${Date.now().toString(36)}`;
const SLIDE = 'title';

type Pos = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotate?: number;
  flip?: string;
  group?: string;
};
type Block = { id: string; type: string; pos?: Pos; text?: string; shape?: string };
type Slide = {
  id: string;
  kind: string;
  layout?: { type: string };
  slots?: Record<string, Block[]>;
};
type Mutation = { op: string; path?: string; blockId?: string; value?: unknown };
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

async function slideGet(page: Page, slideId: string): Promise<Slide> {
  return (await invoke<{ slide: Slide }>(page, 'slide.get', { slideId })).slide;
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
  await page.goto(`/edit/${deckId}?author=agent:e2e-objects`);
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

async function stageScale(page: Page): Promise<number> {
  const box = await page.locator('.ts-stagewrap.ts-editor .ts-stage').boundingBox();
  if (!box) throw new Error('no stage');
  return box.width / 1600;
}

async function drag(
  page: Page,
  from: Locator | { x: number; y: number },
  dx: number,
  dy: number,
  modifiers: string[] = [],
): Promise<void> {
  let x: number;
  let y: number;
  if ('boundingBox' in from) {
    const box = await from.boundingBox();
    if (!box) throw new Error('no box to drag');
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else {
    x = from.x;
    y = from.y;
  }
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1)
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

async function logLength(page: Page): Promise<number> {
  return (await versions(page)).length;
}

async function expectOneWrite(page: Page, before: number): Promise<Version> {
  await expect.poll(() => logLength(page), { timeout: 30_000 }).toBe(before + 1);
  await settled(page);
  const log = await versions(page);
  return log[before]!;
}

async function undo(page: Page): Promise<void> {
  const before = await logLength(page);
  await page.locator('body').press('ControlOrMeta+z');
  await expect.poll(() => logLength(page), { timeout: 30_000 }).toBe(before + 1);
  await settled(page);
}

function objects(slide: Slide): Block[] {
  return slide.slots?.['main'] ?? [];
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

test('a text box drawn on the Title slide converts it; move, rotate, flip, group, ungroup, regroup, delete, each one write undone back to the Title slide', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await openDeck(page, SOURCE);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Objects',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, COPY);
  await goTo(page, SLIDE);
  const k = await stageScale(page);
  const stage = page.locator('.ts-stagewrap.ts-editor .ts-stage');
  const sheet = await stage.boundingBox();
  if (!sheet) throw new Error('no sheet');
  const at = (x: number, y: number) => ({ x: sheet.x + x * k, y: sheet.y + y * k });
  const original = await slideGet(page, SLIDE);
  expect(original.kind).toBe('title');

  /* the draw: Insert > Text box, a drag on the sheet; the slide converts and the box lands */
  let log = await logLength(page);
  await page.locator('[data-control="menubar.insert"]').click();
  await page.locator('[data-menu-item="insert.textBox"]').click();
  await drag(page, at(1000, 200), 400 * k, 80 * k);
  const drawn = await expectOneWrite(page, log);
  expect(drawn.mutations[0]?.op).toBe('slide.replace');
  expect(drawn.mutations[1]?.op).toBe('block.insert');
  await page.keyboard.press('Escape');
  await settled(page);
  let slide = await slideGet(page, SLIDE);
  expect(slide.kind).toBe('content');
  const textBox = objects(slide).find((b) => b.type === 'text');
  expect(textBox).toBeDefined();
  expect(textBox!.pos!.w).toBeGreaterThanOrEqual(392);
  const textId = textBox!.id;
  const select = async (id: string) => {
    const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"]`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`no ${id}`);
    await page.mouse.click(box.x + 2, box.y + 2);
    const editable = page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]');
    if ((await editable.count()) > 0) await page.keyboard.press('Escape');
    const move = page.locator(`.ts-overlay [data-control="handle.${id}.move"]`);
    if ((await move.count()) === 0) {
      /* a rotated object's axis aligned bounds start outside it, so the corner press landed on
         the slide (VERIFICATION-2 finding 28): the centre of the bounds is inside at any angle */
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      if ((await editable.count()) > 0) await page.keyboard.press('Escape');
    }
    await expect(move).toBeVisible();
  };

  /* the move */
  await select(textId);
  log = await logLength(page);
  await drag(
    page,
    page.locator(`.ts-overlay [data-control="handle.${textId}.move"]`),
    -200 * k,
    100 * k,
  );
  const moved = await expectOneWrite(page, log);
  expect(moved.mutations.every((m) => m.op === 'block.set' && m.path === '/pos')).toBe(true);
  const movedPos = objects(await slideGet(page, SLIDE)).find((b) => b.id === textId)!.pos!;
  expect(movedPos.x).toBeLessThan(textBox!.pos!.x);

  /* the rotation by the handle with Shift (15 degree steps) */
  await select(textId);
  const ring = page.locator(`.ts-overlay [data-control="handle.${textId}.rotate"]`);
  const ringBox = await ring.boundingBox();
  const selBox = await page.locator('.ts-overlay .ts-select.is-selected').first().boundingBox();
  if (!ringBox || !selBox) throw new Error('no ring');
  const centre = { x: selBox.x + selBox.width / 2, y: selBox.y + selBox.height / 2 };
  const radius = centre.y - (ringBox.y + ringBox.height / 2);
  const rad = (32 * Math.PI) / 180;
  const ringCentre = { x: ringBox.x + ringBox.width / 2, y: ringBox.y + ringBox.height / 2 };
  log = await logLength(page);
  await drag(
    page,
    ringCentre,
    centre.x + radius * Math.sin(rad) - ringCentre.x,
    centre.y - radius * Math.cos(rad) - ringCentre.y,
    ['Shift'],
  );
  await expectOneWrite(page, log);
  expect(objects(await slideGet(page, SLIDE)).find((b) => b.id === textId)!.pos!.rotate).toBe(30);

  /* the rotation by the keys: Option Right adds 15, Option Shift Left takes one */
  await select(textId);
  log = await logLength(page);
  await page.keyboard.press('Alt+ArrowRight');
  await expectOneWrite(page, log);
  expect(objects(await slideGet(page, SLIDE)).find((b) => b.id === textId)!.pos!.rotate).toBe(45);
  log = await logLength(page);
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  /* the angle chip shows on the key press and stays 600 ms (SPEC-2 6.1 row 12, 0.86): it is read
     before the write's round trip through the room settles, which takes longer than the chip */
  await expect(page.locator('.ts-overlay .ts-readout')).toHaveText('44°');
  await expectOneWrite(page, log);
  expect(objects(await slideGet(page, SLIDE)).find((b) => b.id === textId)!.pos!.rotate).toBe(44);

  /* Arrange > Rotate, Group, Ungroup and Regroup and their chords are parked (docs/FOCUS.md 3.2;
     a parked row's chord matches nothing while the switch is off): the rest of this walk runs
     behind Tools > Advanced tools */
  await setAdvancedTools(page, true);
  /* the flip through Arrange > Rotate > Flip horizontally */
  await select(textId);
  log = await logLength(page);
  await page.locator('[data-control="menubar.arrange"]').click();
  await page.locator('[data-menu-item="arrange.rotate"]').click();
  await page.locator('[data-menu-item="arrange.rotate.flipHorizontally"]').click();
  await expectOneWrite(page, log);
  expect(objects(await slideGet(page, SLIDE)).find((b) => b.id === textId)!.pos!.flip).toBe('h');

  /* a shape drawn beside it, then Cmd Option G groups the two, Cmd Option Shift G ungroups, Regroup */
  await page.keyboard.press('Escape');
  log = await logLength(page);
  await page.locator('[data-control="menubar.insert"]').click();
  await page.locator('[data-menu-item="insert.shape"]').click();
  await page.locator('[data-menu-item="insert.shape.shapes"]').click();
  /* the rectangle: the Shapes submenu's named row, or the gallery plate's tile where the switch
     draws the plate instead (docs/FOCUS.md section 4, the `altEffect`; b1 R31). The core walk
     takes the same two routes in this order (scripts/probes/core-walk/areas/shapes.mjs) */
  await page
    .locator(
      '[data-menu-item="insert.shape.shapes.rectangle"], [data-control="insert.shape.shapes.pick.rect"]',
    )
    .first()
    .click();
  await drag(page, at(1000, 500), 200 * k, 120 * k);
  await expectOneWrite(page, log);
  await settled(page);
  slide = await slideGet(page, SLIDE);
  const shape = objects(slide).find((b) => b.type === 'shape');
  expect(shape).toBeDefined();
  await select(shape!.id);
  const textEl = page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${textId}"]`);
  const tbox = await textEl.boundingBox();
  if (!tbox) throw new Error('no text box');
  await page.keyboard.down('Shift');
  await page.mouse.click(tbox.x + 2, tbox.y + 2);
  await page.keyboard.up('Shift');
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('2 objects');
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+Alt+g');
  const grouped = await expectOneWrite(page, log);
  expect(grouped.mutations.every((m) => m.op === 'block.set' && m.path === '/pos/group')).toBe(
    true,
  );
  slide = await slideGet(page, SLIDE);
  const tag = objects(slide).find((b) => b.id === textId)!.pos!.group;
  expect(tag).toBeTruthy();
  expect(objects(slide).find((b) => b.id === shape!.id)!.pos!.group).toBe(tag);
  /* a click on a member selects the group */
  await page.keyboard.press('Escape');
  await select(shape!.id);
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('Group');
  await expect(page.locator('.ts-overlay .ts-group[role="group"]')).toBeVisible();
  log = await logLength(page);
  await page.keyboard.press('ControlOrMeta+Alt+Shift+g');
  await expectOneWrite(page, log);
  slide = await slideGet(page, SLIDE);
  expect(objects(slide).every((b) => b.pos?.group === undefined)).toBe(true);
  /* Regroup from the Arrange menu */
  await select(shape!.id);
  log = await logLength(page);
  await page.locator('[data-control="menubar.arrange"]').click();
  await page.locator('[data-menu-item="arrange.regroup"]').click();
  await expectOneWrite(page, log);
  slide = await slideGet(page, SLIDE);
  expect(objects(slide).find((b) => b.id === textId)!.pos!.group).toBeTruthy();

  /* Delete removes the group in one write */
  await page.keyboard.press('Escape');
  await select(shape!.id);
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('Group');
  log = await logLength(page);
  await page.keyboard.press('Delete');
  const removed = await expectOneWrite(page, log);
  expect(removed.mutations.filter((m) => m.op === 'block.remove')).toHaveLength(2);
  await expect(page.locator('[data-control="snackbar"]')).toContainText(/deleted/);

  /* Undo everything: the last undo restores the Title slide byte for byte */
  const writes = (await versions(page)).length;
  for (let i = 0; i < writes; i += 1) await undo(page);
  const restored = await slideGet(page, SLIDE);
  expect(restored).toEqual(original);
  expect(restored.kind).toBe('title');
});

test('the export fixture’s canvas-title slide is unchanged by a reload', async ({ page }) => {
  await openDeck(page, 'fixture');
  const rows = await invoke<{ id: string }[]>(page, 'slide.list');
  if (!rows.some((row) => row.id === 'canvas-title')) {
    await page.goto('/edit/gslides?author=agent:e2e-objects');
  }
  const deck = rows.some((row) => row.id === 'canvas-title') ? 'fixture' : 'gslides';
  await openDeck(page, deck);
  const list = await invoke<{ id: string }[]>(page, 'slide.list');
  test.skip(
    !list.some((row) => row.id === 'canvas-title'),
    'no canvas-title slide in the tmp store',
  );
  const before = await slideGet(page, 'canvas-title');
  await goTo(page, 'canvas-title');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.turboslide?.studio));
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  const after = await slideGet(page, 'canvas-title');
  expect(after).toEqual(before);
});

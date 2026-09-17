import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { setAdvancedTools } from './advanced-tools';

// The canvas walk (gslides-parity SPEC-2 11.8, MILESTONES-2 B4 item 12; Kevin's directive of
// 2026-09-12: "we must, must must be able to drag and move around ANYTHING"). On a scratch copy of
// the GT deck (deck.copy through the window API, so the committed deck is never written), one
// slide of every kind: the Title slide, the Main point, a Section header whose photograph is a
// material asset, a Caption, the Closing and one content slide per grammar layout type the deck
// holds (cols and split; the GT deck has no center, left-mid or stack slide). On each, one object
// is dragged 40 px right and 24 px down, resized 80 px wider from the east handle, rotated 15
// degrees with the handle and Shift, sent backward and brought to front. After every gesture the
// server's version log grew by exactly one write, and the first write on each slide is a
// slide.update whose first mutation is the slide.replace of the conversion followed by the
// gesture's pos mutations; Cmd Z once restores the slide's kind and bytes. Every untouched slide
// is read back and compared with the committed file. The pos of every converted slide is
// recorded at .turboslide/canvas-walk/<slideId>.json for B1's canvas.test.ts. Steps 5 and 6 (the
// shader's live bounds, the rulers, the guides, zoom to 1600, pan) run when the route wires the
// stage's props and B2's renderer draws the picture object, and say so when they cannot yet.
//
// Runs against the builder's own dev server with TURBOSLIDE_STORE=tmp (AGENTS.md dev server
// rules): PLAYWRIGHT_BASE_URL=http://localhost:4444 node_modules/.bin/playwright test
// apps/studio/e2e/canvas.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SOURCE = 'gt-brand';
const RECORDINGS = join(ROOT, '.turboslide', 'canvas-walk');
const COPY = `e2e-canvas-${Date.now().toString(36)}`;

type Pos = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotate?: number;
  group?: string;
};
type Block = { id: string; type: string; pos?: Pos };
type Slide = {
  id: string;
  kind: string;
  layout?: { type: string };
  slots?: Record<string, Block[]>;
  template?: string;
  grammar?: { kind: string };
};
type Mutation = {
  op: string;
  slideId?: string;
  blockId?: string;
  path?: string;
  value?: unknown;
  slide?: Slide;
  mutations?: Mutation[];
};
type Version = { n: number; revision: number; mutations: Mutation[] };
type Row = { id: string; kind: string };

/** The slides the walk touches: one of every kind and one per content layout type the deck holds. */
const WALK: { id: string; object: string; kind: string }[] = [
  { id: 'title', object: 'heading', kind: 'title' },
  { id: 'thesis', object: 'big', kind: 'statement' },
  { id: 'opener-prototemplate', object: 'picture', kind: 'opener' },
  { id: 'mood-earth', object: 'h', kind: 'mood' },
  { id: 'closing', object: 'h', kind: 'closing' },
  { id: 'agent-api', object: 'rows', kind: 'content' },
  { id: 'books-and-templates', object: 'h', kind: 'content' },
];

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
  const out = await invoke<{ slide: Slide }>(page, 'slide.get', { slideId });
  return out.slide;
}

/** The editor's confirmed revision: pending writes have reached the server. */
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
  await page.goto(`/edit/${deckId}?author=agent:e2e-canvas`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await settled(page);
  fontsRestored = (await restoreThemeFonts(page)) || fontsRestored;
}

/** Whether a run re-declared the theme's fonts over a dev only face; written into the recordings. */
let fontsRestored = false;

/**
 * Dev only: the TanStack devtools panel declares an Inter face of its own after the theme's, and
 * the last face declared wins, so the dev stage measured text in the devtools' Inter (the
 * statement's big line came out 7 px narrower than the CLI's). Production has no devtools. The
 * theme's faces are declared once more, last, so the walk measures the font the present document
 * uses; the recording says when this happened (b4.md, request 6).
 */
async function restoreThemeFonts(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const own: string[] = [];
    let foreign = false;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        if (/node_modules/.test(rule.style.getPropertyValue('src'))) foreign = true;
        else own.push(rule.cssText);
      }
    }
    if (!foreign || own.length === 0) return false;
    const style = document.createElement('style');
    style.dataset['e2e'] = 'theme-fonts';
    style.textContent = own.join('\n');
    document.head.appendChild(style);
    await Promise.all([
      document.fonts.load('400 16px Inter'),
      document.fonts.load('500 72px Inter'),
      document.fonts.load('500 88px Inter'),
    ]);
    await document.fonts.ready;
    return true;
  });
}

async function goTo(page: Page, slideId: string): Promise<void> {
  await invoke(page, 'view.goto', { slideId });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute(
    'data-active',
    slideId,
  );
  await expect(
    page.locator(`.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"]`),
  ).toBeVisible();
  /* the stage measured its boxes once the fonts settled */
  await page.waitForTimeout(250);
}

/** The stage scale: CSS pixels per sheet pixel. */
async function stageScale(page: Page): Promise<number> {
  const box = await page.locator('.ts-stagewrap.ts-editor .ts-stage').boundingBox();
  if (!box) throw new Error('no stage');
  return box.width / 1600;
}

/** A pointer drag from the centre of a locator by dx and dy CSS pixels, in steps, with optional modifiers held. */
async function drag(
  page: Page,
  from: Locator | { x: number; y: number },
  dx: number,
  dy: number,
  modifiers: string[] = [],
): Promise<void> {
  let x: number;
  let y: number;
  if ('x' in from && typeof from.x === 'number' && !('boundingBox' in from)) {
    x = from.x;
    y = from.y;
  } else {
    const box = await (from as Locator).boundingBox();
    if (!box) throw new Error('no box to drag');
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  }
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  }
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

/**
 * A point of the sheet where the pointer resolves to the object (`elementFromPoint` inside its
 * `[data-block]` or `[data-free]` element), or null: the axis aligned box of a rotated object
 * starts outside it, and a covering photograph's box reaches into the chrome above the stage, so
 * a press on the box's corner landed on the title row and the chords that followed moved the
 * slide instead of the object (Cmd Down on the title row is Move slide down). The candidates are
 * a grid over the box clipped to the sheet, the corners first.
 */
async function pointOn(page: Page, objectId: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    if (!sheet || !el) return null;
    const s = sheet.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const left = Math.max(b.left, s.left) + 2;
    const top = Math.max(b.top, s.top) + 2;
    const right = Math.min(b.right, s.right) - 2;
    const bottom = Math.min(b.bottom, s.bottom) - 2;
    if (right <= left || bottom <= top) return null;
    const steps = 8;
    const candidates: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i += 1)
      for (let j = 0; j <= steps; j += 1)
        candidates.push({
          x: left + ((right - left) * i) / steps,
          y: top + ((bottom - top) * j) / steps,
        });
    for (const point of candidates) {
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hit) continue;
      const owner = hit.closest('[data-block], [data-free]');
      if (
        owner !== null &&
        (owner.getAttribute('data-block') === id || owner.getAttribute('data-free') === id)
      )
        return point;
    }
    return null;
  }, objectId);
}

/** Selects an object through the stage: a press on a point of the sheet that resolves to it; the chip names the selection. */
async function selectObject(page: Page, slideId: string, objectId: string): Promise<void> {
  /* a click on the frame of the object: the overlay's frame edges take the pointer once it is
     selected, so the first click lands on the object's element (a point inside the sheet where
     the object answers the pointer, else its top left corner) and the stage resolves it */
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${objectId}"]`).first();
  const count = await el.count();
  if (count > 0) {
    const point = await pointOn(page, objectId);
    const box = await el.boundingBox();
    if (point) await page.mouse.click(point.x, point.y);
    else if (box) {
      /* the picture kinds hide the slide's own image and paint it as the backdrop, so a press on
         the slide outside the plate resolves to the photograph */
      await page.mouse.click(box.x + 2, box.y + 2);
    }
  } else if (objectId === 'picture') {
    const slide = page.locator(
      `.ts-stagewrap.ts-editor .pt-slide[data-slide-id="${slideId}"] .slide`,
    );
    const box = await slide.boundingBox();
    if (!box) throw new Error('no slide box');
    await page.mouse.click(box.x + box.width - 40, box.y + 40);
  } else {
    throw new Error(`no element for ${objectId}`);
  }
  /* an object whose interior is the caret surface may have opened its text: Esc selects the object */
  const editable = page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]');
  if ((await editable.count()) > 0) await page.keyboard.press('Escape');
  const move = page.locator(`.ts-overlay [data-control="handle.${objectId}.move"]`);
  if (count > 0 && (await move.count()) === 0) {
    /* a rotated object's axis aligned bounds start outside it, so the corner press landed on the
       slide: the centre of the bounds is inside the object at any angle */
    const box = await el.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if ((await editable.count()) > 0) await page.keyboard.press('Escape');
  }
  await expect(move).toBeVisible();
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
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

test.beforeAll(() => {
  mkdirSync(RECORDINGS, { recursive: true });
});

test('the canvas walk: one slide of every kind, one write per gesture, the conversion in the first write, one undo restores the kind', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await openDeck(page, SOURCE);
  const sourceInfo = await invoke<{ revision: number }>(page, 'deck.info');
  const copied = await invoke<{ deckId: string }>(page, 'deck.copy', {
    id: SOURCE,
    name: 'Canvas walk',
    newId: COPY,
    baseRevision: sourceInfo.revision,
  });
  expect(copied.deckId).toBe(COPY);
  await openDeck(page, COPY);
  const rows = await invoke<Row[]>(page, 'slide.list');
  const walked = new Set<string>();

  for (const step of WALK) {
    if (!rows.some((row) => row.id === step.id)) continue;
    walked.add(step.id);
    await goTo(page, step.id);
    /* CSS pixels per sheet pixel at this step: the stage refits when a panel or a card opens
       beside it, and a scale read once before the walk made the pointer's 40 by 24 land short of
       or past the snap tolerance on a later slide */
    const k = await stageScale(page);
    const before = await slideGet(page, step.id);
    expect(before.kind).toBe(step.kind);
    const committed = JSON.parse(
      readFileSync(join(ROOT, 'decks', SOURCE, 'slides', `${step.id}.json`), 'utf8'),
    ) as Slide;
    const logBefore = (await versions(page)).length;

    // 1. the drag: 40 px right and 24 px down in sheet pixels
    await selectObject(page, step.id, step.object);
    const chip = page.locator(`.ts-overlay [data-control="handle.${step.object}.move"]`);
    await drag(page, chip, 40 * k, 24 * k);
    await expect
      .poll(async () => (await versions(page)).length, { timeout: 30_000 })
      .toBe(logBefore + 1);
    await settled(page);
    const first = (await versions(page))[logBefore];
    expect(first).toBeDefined();
    const write = first!.mutations;
    /* the conversion travels first in one slide.update, then the gesture's pos writes (1.6) */
    expect(write[0]?.op).toBe('slide.replace');
    expect(write[0]?.slideId).toBe(step.id);
    const converted = write[0]?.slide;
    expect(converted?.kind).toBe('content');
    expect(converted?.layout?.type).toBe('freeform');
    expect(converted?.grammar?.kind).toBe(step.kind);
    expect(write.slice(1).every((m) => m.op === 'block.set' && m.path === '/pos')).toBe(true);
    expect(write.some((m) => m.op === 'block.set' && m.blockId === step.object)).toBe(true);
    const after = await slideGet(page, step.id);
    expect(after.kind).toBe('content');
    expect(after.layout?.type).toBe('freeform');
    expect(typeof after.template).toBe('string');
    const objects = after.slots?.['main'] ?? [];
    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((block) => block.pos !== undefined)).toBe(true);
    const beforePos = converted?.slots?.['main']?.find((b) => b.id === step.object)?.pos;
    const afterPos = objects.find((b) => b.id === step.object)?.pos;
    expect(beforePos).toBeDefined();
    expect(afterPos).toBeDefined();
    /* the drag landed within the snap distance of 40 by 24 (a snap line may take a pixel or six) */
    expect(Math.abs(afterPos!.x - beforePos!.x - 40)).toBeLessThanOrEqual(8);
    expect(Math.abs(afterPos!.y - beforePos!.y - 24)).toBeLessThanOrEqual(8);

    // 4. the recording for B1's canvas.test.ts: the pos the conversion wrote, before the drag
    const recording = {
      deck: SOURCE,
      slideId: step.id,
      template: after.template,
      source: 'apps/studio/e2e/canvas.spec.ts (Chromium, the editor, hidden 1x sheet)',
      fontsRestored,
      objects: Object.fromEntries(
        (converted?.slots?.['main'] ?? []).map((block) => [block.id, block.pos]),
      ),
    };
    writeFileSync(join(RECORDINGS, `${step.id}.json`), `${JSON.stringify(recording, null, 2)}\n`);

    // 2. one undo restores the kind and the bytes
    await page.locator('body').press('ControlOrMeta+z');
    await expect
      .poll(async () => (await slideGet(page, step.id)).kind, { timeout: 30_000 })
      .toBe(step.kind);
    await settled(page);
    const restored = await slideGet(page, step.id);
    expect(canonical(restored)).toBe(canonical(before));
    expect(canonical(restored)).toBe(canonical(committed));
    /* and redo brings the canvas back */
    await page.locator('body').press('ControlOrMeta+Shift+z');
    await expect
      .poll(async () => (await slideGet(page, step.id)).kind, { timeout: 30_000 })
      .toBe('content');
    await settled(page);
    const logAfterUndo = (await versions(page)).length;
    expect(logAfterUndo).toBe(logBefore + 3);

    // the resize: 80 px wider from the east handle
    await selectObject(page, step.id, step.object);
    const east = page.locator(`.ts-overlay [data-control="handle.${step.object}.resize.e"]`);
    await expect(east).toBeVisible();
    const stackAtResize = (await slideGet(page, step.id)).slots?.['main'] ?? [];
    const resizing = stackAtResize.find((b) => b.id === step.object);
    const widthBefore = resizing?.pos?.w;
    /* a member of a group resizes with the group (SPEC-2 0.102): the east handle widens the
       union by 80 and every member scales by the union's factor, so a member grows by its share */
    const groupId = resizing?.pos?.group;
    const members =
      groupId === undefined
        ? []
        : stackAtResize.filter((b) => b.pos?.group === groupId && b.pos !== undefined);
    const unionWidth =
      members.length > 1
        ? Math.max(...members.map((b) => b.pos!.x + b.pos!.w)) -
          Math.min(...members.map((b) => b.pos!.x))
        : (widthBefore ?? 0);
    const expectedGrowth =
      members.length > 1 && widthBefore !== undefined ? (80 * widthBefore) / unionWidth : 80;
    /* the scale again: the conversion and the selection can open a card or a panel beside the
       stage, which refits it between the drag and the resize */
    const kResize = await stageScale(page);
    await drag(page, east, 80 * kResize, 0);
    await expect
      .poll(async () => (await versions(page)).length, { timeout: 30_000 })
      .toBe(logAfterUndo + 1);
    await settled(page);
    const resized = (await versions(page))[logAfterUndo]!.mutations;
    expect(resized.every((m) => m.op === 'block.set')).toBe(true);
    const widthAfter = (await slideGet(page, step.id)).slots?.['main']?.find(
      (b) => b.id === step.object,
    )?.pos?.w;
    expect(widthAfter).toBeDefined();
    expect(Math.abs(widthAfter! - widthBefore! - expectedGrowth)).toBeLessThanOrEqual(8);

    // the rotation: 15 degrees with the handle and Shift
    await selectObject(page, step.id, step.object);
    const ring = page.locator(`.ts-overlay [data-control="handle.${step.object}.rotate"]`);
    await expect(ring).toBeVisible();
    const ringBox = await ring.boundingBox();
    const objectBox = await page
      .locator(`.ts-overlay .ts-select.is-selected`)
      .first()
      .boundingBox();
    if (!ringBox || !objectBox) throw new Error('no ring');
    const centre = { x: objectBox.x + objectBox.width / 2, y: objectBox.y + objectBox.height / 2 };
    const radius = centre.y - (ringBox.y + ringBox.height / 2);
    const rad = (17 * Math.PI) / 180;
    const target = { x: centre.x + radius * Math.sin(rad), y: centre.y - radius * Math.cos(rad) };
    const ringCentre = { x: ringBox.x + ringBox.width / 2, y: ringBox.y + ringBox.height / 2 };
    await drag(page, ringCentre, target.x - ringCentre.x, target.y - ringCentre.y, ['Shift']);
    await expect
      .poll(async () => (await versions(page)).length, { timeout: 30_000 })
      .toBe(logAfterUndo + 2);
    await settled(page);
    const rotated = (await slideGet(page, step.id)).slots?.['main']?.find(
      (b) => b.id === step.object,
    )?.pos;
    expect(rotated?.rotate).toBe(15);

    // the order: send backward, then bring to front (on a canvas one stack per slide)
    await selectObject(page, step.id, step.object);
    const stackBefore = (await slideGet(page, step.id)).slots?.['main'] ?? [];
    const zBefore = stackBefore.find((b) => b.id === step.object)?.pos?.z ?? 0;
    const lowest = Math.min(...stackBefore.map((b) => b.pos?.z ?? 0));
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    if (zBefore > lowest) {
      await expect
        .poll(async () => (await versions(page)).length, { timeout: 30_000 })
        .toBe(logAfterUndo + 3);
      await settled(page);
      const zAfter =
        (await slideGet(page, step.id)).slots?.['main']?.find((b) => b.id === step.object)?.pos
          ?.z ?? 0;
      expect(zAfter).toBeLessThan(zBefore);
    }
    const logBeforeFront = (await versions(page)).length;
    const stackMid = (await slideGet(page, step.id)).slots?.['main'] ?? [];
    const zMid = stackMid.find((b) => b.id === step.object)?.pos?.z ?? 0;
    const highest = Math.max(...stackMid.map((b) => b.pos?.z ?? 0));
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp');
    if (zMid < highest) {
      await expect
        .poll(async () => (await versions(page)).length, { timeout: 30_000 })
        .toBe(logBeforeFront + 1);
      await settled(page);
      const stackAfter = (await slideGet(page, step.id)).slots?.['main'] ?? [];
      const top = Math.max(...stackAfter.map((b) => b.pos?.z ?? 0));
      expect(stackAfter.find((b) => b.id === step.object)?.pos?.z).toBe(top);
    } else {
      /* one object, or one already on top: Bring to front is the CLI's no write (reorderZ) */
      await page.waitForTimeout(400);
      await settled(page);
      expect((await versions(page)).length).toBe(logBeforeFront);
    }
    await page.keyboard.press('Escape');
  }

  // 3. every slide the walk did not touch is byte identical with the committed file
  const files = readdirSync(join(ROOT, 'decks', SOURCE, 'slides')).filter((f) =>
    f.endsWith('.json'),
  );
  let compared = 0;
  for (const file of files) {
    const id = file.slice(0, -'.json'.length);
    if (walked.has(id) || !rows.some((row) => row.id === id)) continue;
    const committed = JSON.parse(
      readFileSync(join(ROOT, 'decks', SOURCE, 'slides', file), 'utf8'),
    ) as Slide;
    const live = await slideGet(page, id);
    expect(canonical(live), `slide ${id} is untouched`).toBe(canonical(committed));
    compared += 1;
  }
  expect(compared).toBeGreaterThan(50);

  // 7. the copy validates and no finding above severity 2 on the converted slides
  const validated = await invoke<{ ok?: boolean; issues?: unknown[]; valid?: boolean }>(
    page,
    'validate.run',
    {},
  );
  expect(
    validated.ok ??
      validated.valid ??
      (Array.isArray(validated.issues) && validated.issues.length === 0),
  ).toBe(true);
  const linted = await invoke<{ slideId: string; severity: number; rule: string }[]>(
    page,
    'lint.run',
    {},
  );
  const severe = linted.filter((f) => walked.has(f.slideId) && f.severity > 2);
  expect(severe).toEqual([]);
});

test('step 5: the photograph is dragged, resized, cropped and sent to back, and the shader re-mounts at its box', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDeck(page, COPY);
  const slideId = 'opener-prototemplate';
  await goTo(page, slideId);
  const rows = await invoke<Row[]>(page, 'slide.list');
  if (!rows.some((row) => row.id === slideId)) test.skip(true, 'the copy has no Section header');
  const k = await stageScale(page);
  const before = await slideGet(page, slideId);
  expect(before.layout?.type).toBe('freeform');
  /* the photograph past the right and bottom edges: one drag of 60 by 40 */
  await selectObject(page, slideId, 'picture');
  const logBefore = (await versions(page)).length;
  await drag(
    page,
    page.locator('.ts-overlay [data-control="handle.picture.move"]'),
    60 * k,
    40 * k,
    ['Meta'],
  );
  await expect
    .poll(async () => (await versions(page)).length, { timeout: 30_000 })
    .toBe(logBefore + 1);
  await settled(page);
  const moved = (await slideGet(page, slideId)).slots?.['main']?.find(
    (b) => b.id === 'picture',
  )?.pos;
  expect(moved).toBeDefined();
  expect(moved!.x + moved!.w).toBeGreaterThan(1600);
  const linted = await invoke<{ slideId: string; severity: number; rule: string }[]>(
    page,
    'lint.run',
    {},
  );
  const offSheet = linted.filter((f) => f.slideId === slideId && f.rule === 'freeform/off-sheet');
  expect(offSheet.length).toBeGreaterThan(0);
  expect(offSheet.every((f) => f.severity === 2)).toBe(true);
  /* crop mode: a double click, one handle, Enter; one write of the trim */
  await selectObject(page, slideId, 'picture');
  const wrapper = page.locator('.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"]');
  const wrapperBox = await wrapper.boundingBox();
  if (!wrapperBox) throw new Error('no picture wrapper');
  await page.mouse.dblclick(wrapperBox.x + wrapperBox.width - 30, wrapperBox.y + 30);
  await expect(page.locator('.ts-overlay [data-control="handle.picture.crop.w"]')).toBeVisible();
  await expect(page.locator('.ts-overlay .ts-select-chip.is-crop')).toHaveText(
    'Drag the handles to crop. Press Enter to finish',
  );
  const logBeforeCrop = (await versions(page)).length;
  await drag(page, page.locator('.ts-overlay [data-control="handle.picture.crop.w"]'), 160 * k, 0);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await versions(page)).length, { timeout: 30_000 })
    .toBe(logBeforeCrop + 1);
  await settled(page);
  const cropped = (await slideGet(page, slideId)).slots?.['main']?.find(
    (b) => b.id === 'picture',
  ) as (Block & { trim?: { left: number } }) | undefined;
  expect(cropped?.trim?.left).toBeGreaterThan(0);
  /* a text box inserted over it, then Send to back keeps the photograph at the bottom */
  const logBeforeInsert = (await versions(page)).length;
  await page.locator('[data-control="menubar.insert"]').click();
  await page.locator('[data-menu-item="insert.textBox"]').click();
  const sheet = page.locator('.ts-stagewrap.ts-editor .ts-stage');
  const sheetBox = await sheet.boundingBox();
  if (!sheetBox) throw new Error('no sheet');
  await page.mouse.click(sheetBox.x + 900 * k, sheetBox.y + 200 * k);
  await expect
    .poll(async () => (await versions(page)).length, { timeout: 30_000 })
    .toBe(logBeforeInsert + 1);
  await page.keyboard.press('Escape');
  await settled(page);
  await selectObject(page, slideId, 'picture');
  const stackBefore = (await slideGet(page, slideId)).slots?.['main'] ?? [];
  const logBeforeBack = (await versions(page)).length;
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown');
  await page.waitForTimeout(600);
  await settled(page);
  const stackAfter = (await slideGet(page, slideId)).slots?.['main'] ?? [];
  const lowest = Math.min(...stackAfter.map((b) => b.pos?.z ?? 0));
  expect(stackAfter.find((b) => b.id === 'picture')?.pos?.z).toBe(lowest);
  expect((await versions(page)).length).toBeLessThanOrEqual(logBeforeBack + 1);
  expect(stackBefore.length).toBe(stackAfter.length);
  /* the shader's live canvas at the object's box (0.105): needs B2's picture renderer */
  const live = page.locator(
    '.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"] .ts-material-live',
  );
  if ((await live.count()) === 0) {
    test.info().annotations.push({
      type: 'pending',
      description:
        'the picture object renders through B2 (packages/render blocks/picture.ts, merge 2); the .ts-material-live bounds check waits on it',
    });
  } else {
    const liveBox = await live.boundingBox();
    const box = await wrapper.boundingBox();
    expect(Math.abs((liveBox?.width ?? 0) - (box?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((liveBox?.height ?? 0) - (box?.height ?? 0))).toBeLessThanOrEqual(1);
  }
});

test('step 6: rulers, guides, zoom to 1600 and pan', async ({ page }) => {
  test.setTimeout(300_000);
  await openDeck(page, COPY);
  await goTo(page, 'title');
  /* Show ruler and the Guides rows are parked (docs/FOCUS.md 3.2): the step runs behind Tools >
     Advanced tools, never in the default view */
  await setAdvancedTools(page, true);
  /* View > Show ruler draws two rulers whose numerals count 14 and 8 */
  await page.locator('[data-control="menubar.view"]').click();
  await page.locator('[data-menu-item="view.showRuler"]').click();
  const rulers = page.locator('.ts-overlay .ts-ruler');
  const wired = (await rulers.count()) === 2;
  if (!wired) {
    test.info().annotations.push({
      type: 'pending',
      description:
        'View > Show ruler reaches the stage once the route passes showRuler, showGuides, guides and onGuides to the Editor (integrator merge 2, b4.md request 2)',
    });
  } else {
    await expect(rulers.first().locator('.ts-ruler-numeral')).toHaveCount(14);
    await expect(rulers.nth(1).locator('.ts-ruler-numeral')).toHaveCount(8);
  }
  /* Add vertical guide writes deck.guides with 800 */
  const infoBefore = await invoke<{ revision: number; guides?: { x: number[]; y: number[] } }>(
    page,
    'deck.info',
  );
  await page.locator('[data-control="menubar.view"]').click();
  await page.locator('[data-menu-item="view.guides"]').click();
  await page.locator('[data-menu-item="view.guides.addVertical"]').click();
  await expect
    .poll(
      async () => (await invoke<{ guides?: { x: number[] } }>(page, 'deck.info')).guides?.x ?? [],
      {
        timeout: 30_000,
      },
    )
    .toEqual([800]);
  await settled(page);
  if (wired) {
    await page.locator('[data-control="menubar.view"]').click();
    await page.locator('[data-menu-item="view.guides"]').click();
    await page.locator('[data-menu-item="view.guides.show"]').click();
    const guide = page.locator('.ts-overlay [data-control="guide.x.800"]');
    await expect(guide).toBeVisible();
    const k = await stageScale(page);
    await drag(page, guide, 120 * k, 0);
    await expect
      .poll(
        async () => (await invoke<{ guides?: { x: number[] } }>(page, 'deck.info')).guides?.x ?? [],
        {
          timeout: 30_000,
        },
      )
      .toEqual([920]);
    await page.locator('.ts-overlay [data-control="guide.x.920"]').click({ button: 'right' });
    await page.locator('[data-menu-item="view.guides.delete"]').click();
    await expect
      .poll(
        async () => (await invoke<{ guides?: { x: number[] } }>(page, 'deck.info')).guides ?? null,
        {
          timeout: 30_000,
        },
      )
      .toBeNull();
  } else {
    await invoke(page, 'deck.guides', { clear: true, baseRevision: infoBefore.revision + 1 });
  }
  /* Cmd+plus steps the Zoom box to the next ladder value; 1600 typed scales the sheet to 25600 px */
  const zoomValue = page.locator('[data-control="view.zoom.value"]');
  await page.locator('body').press('ControlOrMeta+=');
  await expect.poll(() => zoomValue.inputValue()).toMatch(/^(100|125|150)%?$/);
  await zoomValue.fill('1600');
  await zoomValue.press('Enter');
  await expect
    .poll(
      async () =>
        (await page.locator('.ts-stagewrap.ts-editor .pt-sheet-stage > .sheet').boundingBox())
          ?.width ?? 0,
    )
    .toBeGreaterThan(25000);
  const scroller = page.locator('.ts-stagewrap.ts-editor .pt-sheet-stage');
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  /* Space+drag scrolls the stage */
  const scrollBefore = await scroller.evaluate((el) => el.scrollLeft);
  await page.keyboard.press('Escape');
  const stageBox = await scroller.boundingBox();
  if (!stageBox) throw new Error('no stage');
  await page.keyboard.down('Space');
  await drag(
    page,
    { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2 },
    -200,
    0,
  );
  await page.keyboard.up('Space');
  const scrollAfter = await scroller.evaluate((el) => el.scrollLeft);
  expect(scrollAfter).not.toBe(scrollBefore);
  /* a wheel with ctrlKey over the sheet changes the zoom and not the page's */
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
  const zoomBeforeWheel = await zoomValue.inputValue();
  await page.mouse.wheel(0, 200);
  await page.evaluate(() => {
    const el = document.querySelector('.ts-stagewrap.ts-editor');
    el?.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: 200,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 400,
      }),
    );
  });
  await page.waitForTimeout(300);
  const zoomAfterWheel = await zoomValue.inputValue();
  if (zoomAfterWheel === zoomBeforeWheel) {
    test.info().annotations.push({
      type: 'pending',
      description:
        'the pinch reaches view.zoom once the route passes onZoom to the Editor (integrator merge 2, b4.md request 2)',
    });
  }
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  /* Fit restores */
  await zoomValue.fill('fit');
  await zoomValue.press('Enter');
  await expect.poll(() => zoomValue.inputValue()).toMatch(/^Fit$/i);
});

test('step 8: the fresh Title slide’s empty heading drags before anything is typed; the workspace marquee, deselect and menu; the covering photograph’s menu', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto('/new?author=agent:e2e-canvas');
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer:not(.ts-skeleton)')).toHaveAttribute('data-settled', '');
  await page.waitForTimeout(400);
  const k = await stageScale(page);
  const heading = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="heading"]');
  await expect(heading).toBeVisible();
  const hbox = await heading.boundingBox();
  if (!hbox) throw new Error('no heading');
  /* select the empty heading by its frame: a click at its top left corner, then Esc from any caret */
  await page.mouse.click(hbox.x + 1, hbox.y + 1);
  if ((await page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]').count()) > 0)
    await page.keyboard.press('Escape');
  const chip = page.locator('.ts-overlay [data-control="handle.heading.move"]');
  await expect(chip).toBeVisible();
  await drag(page, chip, 40 * k, 24 * k);
  await page.waitForTimeout(500);
  await settled(page);
  const described = await page.evaluate(() => window.turboslide!.studio.describe());
  const deckId =
    (described as { deckId?: string }).deckId ?? (described.state as { deckId?: string }).deckId;
  const active = await page.locator('.pt-viewer:not(.ts-skeleton)').getAttribute('data-active');
  const slide = await slideGet(page, active ?? 'title');
  expect(slide.kind).toBe('content');
  const headingPos = slide.slots?.['main']?.find((b) => b.id === 'heading')?.pos;
  expect(headingPos).toBeDefined();
  expect(headingPos!.h).toBeGreaterThanOrEqual(40);
  const validated = await invoke<{ ok?: boolean; valid?: boolean; issues?: unknown[] }>(
    page,
    'validate.run',
    {},
  );
  expect(
    validated.ok ??
      validated.valid ??
      (Array.isArray(validated.issues) && validated.issues.length === 0),
  ).toBe(true);
  void deckId;

  /* a Section header of the walk's copy whose photograph still covers the sheet: the first nudge of
     a plate block converts it; then a press on the workspace starts a marquee that selects the
     plate group, a click there deselects, a right-click there opens the empty canvas menu, and the
     photograph's menu ends with Change background and Guides once the shell reads coversSheet */
  await openDeck(page, COPY);
  await goTo(page, 'opener-blog');
  await selectObject(page, 'opener-blog', 'h');
  const logBefore = (await versions(page)).length;
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await versions(page)).length, { timeout: 30_000 })
    .toBe(logBefore + 1);
  await settled(page);
  expect((await slideGet(page, 'opener-blog')).kind).toBe('content');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const stage = page.locator('.ts-stagewrap.ts-editor');
  const sbox = await stage.boundingBox();
  const sheet = await page
    .locator('.ts-stagewrap.ts-editor .pt-sheet-stage > .sheet')
    .boundingBox();
  if (!sbox || !sheet) throw new Error('no stage');
  /* the workspace: the strip between the stage's left edge and the sheet */
  const workspaceX = sbox.x + Math.max(4, (sheet.x - sbox.x) / 2);
  const plate = await page
    .locator('.ts-stagewrap.ts-editor .pt-slide .free[data-free="plate"]')
    .boundingBox();
  if (!plate) throw new Error('no plate');
  await drag(
    page,
    { x: workspaceX, y: plate.y - 10 },
    plate.x + plate.width / 2 - workspaceX,
    plate.height / 2 + 10,
  );
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveText('Group');
  await page.mouse.click(workspaceX, sbox.y + 20);
  await expect(page.locator('.ts-overlay .ts-select-chip')).toHaveCount(0);
  /* the Guides row of the canvas and picture menus is parked (docs/FOCUS.md 3.4): the two menus are
     read behind Tools > Advanced tools */
  await setAdvancedTools(page, true);
  await page.mouse.click(workspaceX, sbox.y + 20, { button: 'right' });
  const menu = page.locator('#ts-menu-canvas');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-menu-item="view.guides"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  /* the photograph's menu: the image rows, then Change background and Guides (0.100) */
  const picture = page.locator('.ts-stagewrap.ts-editor .pt-slide .free[data-free="picture"]');
  const pbox = await picture.boundingBox();
  if (!pbox) throw new Error('no picture');
  await page.mouse.click(pbox.x + pbox.width - 60, pbox.y + 60, { button: 'right' });
  await expect(menu).toBeVisible();
  const items = await menu
    .locator('[data-menu-item]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-menu-item')));
  expect(items).toContain('format.image.cropImage');
  if (items.includes('slide.changeBackground')) {
    expect(items[items.length - 2]).toBe('slide.changeBackground');
    expect(items[items.length - 1]).toBe('view.guides');
  } else {
    test.info().annotations.push({
      type: 'pending',
      description:
        "the covering picture's Change background and Guides rows appear once the route passes the stage's coversSheet fact to the shell (integrator merge 2, b4.md request 2)",
    });
  }
  await page.keyboard.press('Escape');
});

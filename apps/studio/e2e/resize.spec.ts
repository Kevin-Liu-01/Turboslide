import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * One browser context for the serial chain (the focus round, b6's FR-1; VERIFICATION.md C2-F23,
 * b3 R23). Playwright's `page` fixture gives every test a fresh context with no cookie of the
 * one before, so on a tmp store server the second test's first request was admitted as the
 * localhost agent and its own cookie's requests were then denied `not_found` (the copied deck
 * belongs to the principal that copied it) and floored to viewer at the stream's recheck: the
 * tab redrew in Viewing mode, `.ts-stagewrap.ts-editor .ts-stage` left the page and the 50
 * percent test hung in `stageScale` to its 600 s timeout, three passes running. Every test of
 * the file now shares the context that copied the deck; the bodies still take `{ page }`.
 */
let sharedContext: BrowserContext;
let sharedPage: Page;
const test = base.extend<{ page: Page }>({
  page: async ({}, use) => {
    await use(sharedPage);
  },
});
test.beforeAll(async ({ browser }) => {
  sharedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  sharedPage = await sharedContext.newPage();
});

// The resize handles (gslides-parity SPEC-5-amendments A4; build-4/hotfix-3.md section 2). On a
// scratch copy of the GT deck (deck.copy through the window API) a blank canvas slide gets a
// rectangle, a picture, a text box with autofit grow and a group of two rectangles, inserted
// through the window API the way the Insert menu writes them. At zoom 50, 100 and 200 percent
// every one of the eight handles of every object is dragged by a known sheet delta with Cmd held
// (the snaps off, so the arithmetic is exact) and after each drag the committed `pos` is the box
// the one resize model gives (the opposite edge or corner held, a picture's corner keeping its
// ratio, a group scaling every member about the union), the content took the box (the shape's
// svg, the picture's frame, the text's paragraph width with its font size unchanged), the size
// readout while the pointer was down named the box that landed, the box did not move between the
// last pointer move and the release, and the Format options Width and Height fields read the box.
// One undo restores the box before the last drag. The rectangle rotated 30 degrees keeps its
// anchored corner on the sheet and lands its dragged corner under the pointer; Shift keeps a
// text box's ratio and Alt keeps the centre.
//
// Runs against a dev server with TURBOSLIDE_STORE=tmp (AGENTS.md dev server rules):
// PLAYWRIGHT_BASE_URL=http://localhost:4348 node_modules/.bin/playwright test apps/studio/e2e/resize.spec.ts

const SOURCE = 'gt-brand';
const ROOT = join(import.meta.dirname, '..', '..', '..');
const COPY = `e2e-resize-${Date.now().toString(36)}`;
const SLIDE = 'resize-canvas';
/** A stored capture of the GT deck the picture object shows (deck.json assets). */
const PICTURE_ASSET = 'gh-gt';
const LONG_TEXT =
  'Resize handles keep the opposite edge anchored while the pointer moves the dragged edge. The text reflows in the new width and keeps its size.';
const MIN_SIDE = 16;

type Dir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const DIRS: Dir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
type Pos = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotate?: number;
  group?: string;
};
type Box = { x: number; y: number; w: number; h: number };
type Block = { id: string; type: string; pos?: Pos; autofit?: string };
type Slide = {
  id: string;
  kind: string;
  layout?: { type: string };
  slots?: Record<string, Block[]>;
};
type Version = { n: number; revision: number; mutations: { op: string }[] };

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

/** A mutating action through the window API: the strict contract wants the tab's revision as the base. */
async function act<T>(page: Page, action: string, input: Record<string, unknown>): Promise<T> {
  const base = await revision(page);
  return invoke<T>(page, action, { ...input, baseRevision: base });
}

async function slideGet(page: Page, slideId: string): Promise<Slide> {
  return (await invoke<{ slide: Slide }>(page, 'slide.get', { slideId })).slide;
}

/**
 * Nothing in flight and the reported revision at the server's. The room's own `sync.pending` is
 * the in-flight count; the controller's `pending` adds the retained ops (admitted by the server,
 * checkpointed there, waiting for the stream's checkpoint frame), and on the blob tier under
 * fluid compute that frame can take minutes to reach the tab (build-4/hotfix-3.md section 3;
 * hotfix 2 cause A3), so a retained op does not hold this wait. The box a drag committed is read
 * from the admitted form the acknowledgement carried, which is what every assertion checks.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    if (typeof window.turboslide?.studio.describe !== 'function') return false;
    const state = window.turboslide.studio.describe().state as {
      revision?: number;
      serverRevision?: number;
      pending?: number;
      sync?: { pending?: number } | null;
    };
    const inFlight = state.sync?.pending ?? state.pending;
    return inFlight === 0 && state.revision === state.serverRevision;
  });
}

async function revision(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.turboslide!.studio.describe().state as { revision: number }).revision,
  );
}

/** One write landed: the reported revision moved past `before` and the tab is settled. */
async function landed(page: Page, before: number): Promise<void> {
  await expect.poll(() => revision(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await settled(page);
}

async function openDeck(page: Page, deckId: string): Promise<void> {
  await page.goto(`/edit/${deckId}?author=agent:e2e-resize`);
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

async function posOf(page: Page, id: string): Promise<Pos> {
  const slide = await slideGet(page, SLIDE);
  const block = (slide.slots?.['main'] ?? []).find((b) => b.id === id);
  if (!block?.pos) throw new Error(`no pos on ${id}`);
  return block.pos;
}

async function blockOf(page: Page, id: string): Promise<Block> {
  const slide = await slideGet(page, SLIDE);
  const block = (slide.slots?.['main'] ?? []).find((b) => b.id === id);
  if (!block) throw new Error(`no block ${id}`);
  return block;
}

/** The sheet scale: the stage's client width over 1600. */
async function stageScale(page: Page): Promise<number> {
  const box = await page.locator('.ts-stagewrap.ts-editor .ts-stage').boundingBox();
  if (!box) throw new Error('no stage');
  return box.width / 1600;
}

/** The stage's client box, so a sheet point maps to the viewport. */
async function stageBox(page: Page): Promise<{ x: number; y: number; width: number }> {
  const box = await page.locator('.ts-stagewrap.ts-editor .ts-stage').boundingBox();
  if (!box) throw new Error('no stage');
  return box;
}

/** The sheet point of a handle: the corner or the edge midpoint it stands on. */
function handlePoint(box: Box, dir: Dir): { x: number; y: number } {
  return {
    x: dir.includes('w') ? box.x : dir.includes('e') ? box.x + box.w : box.x + box.w / 2,
    y: dir.includes('n') ? box.y : dir.includes('s') ? box.y + box.h : box.y + box.h / 2,
  };
}

/**
 * Zooms the stage with a sheet point kept under the stage centre: the dragged handle's own point,
 * so at 200 percent the far handle of a wide object is in view and not under the filmstrip.
 */
async function zoomAt(page: Page, zoom: number, pos: Pos, dir?: Dir): Promise<void> {
  const centre =
    dir === undefined ? { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 } : handlePoint(pos, dir);
  await invoke(page, 'view.zoom', { zoom, center: centre });
  await expect
    .poll(async () => Math.round((await stageScale(page)) * 100) / 100, { timeout: 10_000 })
    .toBe(zoom);
  await page.waitForTimeout(150);
}

/** Selects an object: a click inside it, Escape out of a caret, until its move chip is up. */
async function select(page: Page, id: string): Promise<void> {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"]`);
  const move = page.locator(`.ts-overlay [data-control="handle.${id}.move"]`);
  for (let attempt = 0; attempt < 3 && (await move.count()) === 0; attempt += 1) {
    const box = await el.boundingBox();
    if (!box) throw new Error(`no ${id} on the stage`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const editable = page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]');
    if ((await editable.count()) > 0) await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect(move).toBeVisible();
}

type DragResult = {
  readout: string | null;
  /** the `.free` wrapper's box in sheet px at the last pointer move, before the release */
  preview: Box;
};

/**
 * Drags one resize handle by a sheet delta: the pointer travels the delta times the sheet scale
 * in eight steps; Cmd is held from the first move so no snap line or grid moves the edge (the
 * arithmetic is then exact); `Shift` and `Alt` are held from the press. Reads the size readout
 * and the wrapper's box before the release.
 */
async function dragHandle(
  page: Page,
  id: string,
  dir: Dir,
  delta: { dx: number; dy: number },
  mods: { shift?: boolean; alt?: boolean } = {},
): Promise<DragResult> {
  const handle = page.locator(`.ts-overlay [data-control="handle.${id}.resize.${dir}"]`);
  await expect(handle).toBeVisible();
  const k = await stageScale(page);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no ${dir} handle on ${id}`);
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  /* the element under the press and the overlay's boxes at that moment, so a press that lands
     beside the handle names what took it */
  const probe = await page.evaluate(
    ([x, y, blockId]) => {
      const el = document.elementFromPoint(x, y);
      const rectOf = (node: Element | null) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      };
      return {
        top: el
          ? `${el.tagName.toLowerCase()} ${el.getAttribute('data-control') ?? el.className}`
          : 'nothing',
        chip: rectOf(document.querySelector('.ts-overlay .ts-select-chip')),
        ring: rectOf(document.querySelector('.ts-overlay .ts-select.is-selected')),
        overlay: rectOf(document.querySelector('.ts-overlay')),
        strips: Array.from(document.querySelectorAll('.ts-overlay .ts-frame-edge')).map(rectOf),
        stage: rectOf(document.querySelector('.ts-stagewrap.ts-editor .ts-stage')),
        section: rectOf(document.querySelector('.ts-stagewrap.ts-editor .pt-slide .slide')),
        inner: rectOf(document.querySelector('.ts-stagewrap.ts-editor .pt-slide .slide > .in')),
        layer: rectOf(document.querySelector('.ts-stagewrap.ts-editor .pt-slide .freeform-sheet')),
        wrapper: rectOf(
          document.querySelector(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${blockId}"]`),
        ),
        scroller: (() => {
          const stage = document.querySelector('.ts-stagewrap.ts-editor .pt-sheet-stage');
          return stage ? [stage.scrollLeft, stage.scrollTop] : null;
        })(),
      };
    },
    [from.x, from.y, id] as const,
  );
  if (mods.shift) await page.keyboard.down('Shift');
  if (mods.alt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Meta');
  const steps = 8;
  let active: string | null = null;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + (delta.dx * k * i) / steps, from.y + (delta.dy * k * i) / steps);
    if (i === 2)
      active = await page
        .locator('.ts-overlay')
        .first()
        .getAttribute('data-active-handle')
        .catch(() => null);
  }
  /* the press landed on the handle (cause R7: a chip drawn from stale boxes took it), and the
     stage armed its resize */
  expect(probe.top, `${id} ${dir} press on ${probe.top}; ${JSON.stringify(probe)}`).toContain(
    `handle.${id}.resize.${dir}`,
  );
  expect(active).toBe(`free-resize:${id}:${dir}`);
  await page.waitForTimeout(60);
  const chip = page.locator('.ts-overlay .ts-readout');
  const readout =
    (await chip.count()) > 0
      ? await chip
          .first()
          .textContent({ timeout: 2000 })
          .catch(() => null)
      : null;
  const stage = await stageBox(page);
  /* the wrapper's box once the draft of the last move is drawn: the sheet re-renders the slide
     for a draft while the overlay's readout updates first, and under load the sheet's frame can
     come later than a fixed pause (a production run read the previous box 60 ms after the last
     move while the readout already named the new size); two equal reads 40 ms apart, within
     1.5 s, is the drawn box */
  const wrapperLocator = page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"]`);
  let wrapper = await wrapperLocator.boundingBox();
  const settleStart = Date.now();
  while (Date.now() - settleStart < 1500) {
    await page.waitForTimeout(40);
    const again = await wrapperLocator.boundingBox();
    if (
      wrapper &&
      again &&
      Math.abs(again.x - wrapper.x) < 0.5 &&
      Math.abs(again.y - wrapper.y) < 0.5 &&
      Math.abs(again.width - wrapper.width) < 0.5 &&
      Math.abs(again.height - wrapper.height) < 0.5
    )
      break;
    wrapper = again;
  }
  if (!wrapper) throw new Error(`no ${id} wrapper while the drag is down`);
  const preview = {
    x: (wrapper.x - stage.x) / k,
    y: (wrapper.y - stage.y) / k,
    w: wrapper.width / k,
    h: wrapper.height / k,
  };
  await page.mouse.up();
  await page.keyboard.up('Meta');
  if (mods.alt) await page.keyboard.up('Alt');
  if (mods.shift) await page.keyboard.up('Shift');
  return { readout, preview };
}

/**
 * The box the model gives for an unrotated object (schema/canvas.ts resizeBox): the dragged
 * edges move by the delta, the others hold, no side under 16; with `aspect` a corner keeps the
 * ratio from the dominant relative delta and an edge scales the other side from its own; with
 * `alt` the opposite edges mirror and the centre stays.
 */
function expectedBox(
  dir: Dir,
  delta: { dx: number; dy: number },
  box: Box,
  options: { aspect?: boolean; alt?: boolean } = {},
): Box {
  const hasW = dir.includes('w');
  const hasE = dir.includes('e');
  const hasN = dir.includes('n');
  const hasS = dir.includes('s');
  let left = box.x;
  let right = box.x + box.w;
  let top = box.y;
  let bottom = box.y + box.h;
  const movesX = (hasE || hasW) && delta.dx !== 0;
  const movesY = (hasN || hasS) && delta.dy !== 0;
  if (hasW) left += delta.dx;
  if (hasE) right += delta.dx;
  if (hasN) top += delta.dy;
  if (hasS) bottom += delta.dy;
  const aspect = options.aspect === true;
  const ratio = box.w / box.h;
  const leadX = !aspect
    ? movesX
    : movesX && movesY
      ? Math.abs(delta.dx) / box.w >= Math.abs(delta.dy) / box.h
      : movesX || ((hasE || hasW) && !movesY);
  const leadY = !aspect ? movesY : !leadX;
  if (leadX && right - left < MIN_SIDE) {
    if (hasW) left = right - MIN_SIDE;
    else right = left + MIN_SIDE;
  }
  if (leadY && bottom - top < MIN_SIDE) {
    if (hasN) top = bottom - MIN_SIDE;
    else bottom = top + MIN_SIDE;
  }
  if (aspect) {
    if (leadX) {
      const nextH = Math.max(MIN_SIDE, (right - left) / ratio);
      if (hasN) top = bottom - nextH;
      else bottom = top + nextH;
    } else {
      const nextW = Math.max(MIN_SIDE, (bottom - top) * ratio);
      if (hasW) left = right - nextW;
      else right = left + nextW;
    }
  }
  if (options.alt) {
    const w = Math.max(MIN_SIDE, Math.round(box.w + 2 * (right - left - box.w)));
    const h = Math.max(MIN_SIDE, Math.round(box.h + 2 * (bottom - top - box.h)));
    return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
  }
  const w = Math.max(MIN_SIDE, Math.round(right - left));
  const h = Math.max(MIN_SIDE, Math.round(bottom - top));
  return { x: hasW ? right - w : left, y: hasN ? bottom - h : top, w, h };
}

/** The delta per handle: the east and south grow, the west and north shrink, so eight drags net to nothing. */
function deltaFor(dir: Dir, size: { w: number; h: number }): { dx: number; dy: number } {
  const dx = Math.round(size.w * 0.18);
  const dy = Math.round(size.h * 0.18);
  return {
    dx: dir.includes('e') || dir.includes('w') ? dx : 0,
    dy: dir.includes('n') || dir.includes('s') ? dy : 0,
  };
}

/** The four corners of a box rotated about its centre, top left first and clockwise. */
function corners(box: Box, rotation: number): { x: number; y: number }[] {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return [
    [-box.w / 2, -box.h / 2],
    [box.w / 2, -box.h / 2],
    [box.w / 2, box.h / 2],
    [-box.w / 2, box.h / 2],
  ].map(([lx, ly]) => ({
    x: cx + (lx ?? 0) * cos - (ly ?? 0) * sin,
    y: cy + (lx ?? 0) * sin + (ly ?? 0) * cos,
  }));
}

function sameBox(actual: Box, expected: Box, tolerance = 0.51): void {
  expect(Math.abs(actual.x - expected.x), `x ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(
    tolerance,
  );
  expect(Math.abs(actual.y - expected.y), `y ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(
    tolerance,
  );
  expect(Math.abs(actual.w - expected.w), `w ${actual.w} vs ${expected.w}`).toBeLessThanOrEqual(
    tolerance,
  );
  expect(Math.abs(actual.h - expected.h), `h ${actual.h} vs ${expected.h}`).toBeLessThanOrEqual(
    tolerance,
  );
}

/** The content's box against the wrapper's, in sheet px: the inner element the resize scales. */
async function contentBox(page: Page, id: string, selector: string): Promise<Box> {
  const k = await stageScale(page);
  const stage = await stageBox(page);
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"] ${selector}`);
  const box = await el.first().boundingBox();
  if (!box) throw new Error(`no ${selector} in ${id}`);
  return {
    x: (box.x - stage.x) / k,
    y: (box.y - stage.y) / k,
    w: box.width / k,
    h: box.height / k,
  };
}

async function fontSizeOf(page: Page, id: string): Promise<number> {
  return page.evaluate((blockId) => {
    const el = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide .free[data-free="${blockId}"] p.text`,
    );
    return el ? Number.parseFloat(getComputedStyle(el).fontSize) : Number.NaN;
  }, id);
}

/**
 * Opens Format options when it is closed: the toolbar's button with an object selected, else
 * the Format menu's row. Escape closes the panel (EditorShell, as Google's sidebar), which is
 * what left the reproducer's rows without the fields (build-4/hotfix-3.md cause R6), so a caller
 * that pressed Escape reopens it before it reads the fields.
 */
async function openFormatOptions(page: Page): Promise<void> {
  if ((await page.locator('[data-control="panel.formatOptions"]').count()) > 0) return;
  const toolbarButton = page.locator('[data-control="toolbar.formatOptions"]');
  if ((await toolbarButton.count()) > 0) await toolbarButton.click();
  else {
    await page.locator('[data-control="menubar.format"]').click();
    await page.locator('[data-menu-item="format.formatOptions"]').click();
  }
  await expect(page.locator('[data-control="panel.formatOptions"]')).toBeVisible();
}

async function inspectorSize(page: Page): Promise<{ w: number; h: number } | null> {
  await openFormatOptions(page);
  const width = page.locator('[data-control="formatOptions.size.width"]');
  if ((await width.count()) === 0) return null;
  const w = Number(await width.inputValue());
  const h = Number(await page.locator('[data-control="formatOptions.size.height"]').inputValue());
  return { w, h };
}

async function insertObject(page: Page, block: Record<string, unknown>, pos: Pos): Promise<void> {
  const slide = await slideGet(page, SLIDE);
  const stack = slide.slots?.['main'] ?? [];
  const last = stack[stack.length - 1]?.id;
  const z = Math.max(0, ...stack.map((b) => b.pos?.z ?? 0)) + 1;
  const before = await revision(page);
  await act(page, 'block.insert', {
    slideId: SLIDE,
    slot: 'main',
    ...(last ? { after: last } : {}),
    block: { ...block, pos: { ...pos, z } },
  });
  await landed(page, before);
}

/* the objects sit in the left two thirds of the sheet: at 200 percent the scroller can then keep
   any handle under the stage centre, clear of the filmstrip and the open Format options panel */
const OBJECTS = {
  shape: { id: 'rs-rect', pos: { x: 120, y: 120, w: 240, h: 150 } },
  picture: { id: 'rs-picture', pos: { x: 460, y: 120, w: 240, h: 160 } },
  text: { id: 'rs-text', pos: { x: 800, y: 120, w: 260, h: 140 } },
  groupA: { id: 'rs-ga', pos: { x: 120, y: 480, w: 120, h: 140 } },
  groupB: { id: 'rs-gb', pos: { x: 260, y: 480, w: 130, h: 140 } },
} as const;

/** The kinds a diagnostic run limits itself to (RESIZE_KINDS=shape,text); every kind otherwise. */
const ONLY_KINDS = process.env['RESIZE_KINDS']?.split(',').filter(Boolean) ?? null;

let canvasReady = false;

/** The scratch deck with its canvas slide and objects, made once per run by whichever test runs first. */
async function ensureCanvas(page: Page): Promise<void> {
  if (canvasReady) return;
  await openDeck(page, SOURCE);
  const info = await invoke<{ revision: number }>(page, 'deck.info');
  await invoke(page, 'deck.copy', {
    id: SOURCE,
    name: 'Resize',
    newId: COPY,
    baseRevision: info.revision,
  });
  await openDeck(page, COPY);
  let before = await revision(page);
  await act(page, 'slide.new', { layout: 'blank', id: SLIDE });
  await landed(page, before);
  await goTo(page, SLIDE);
  const slide = await slideGet(page, SLIDE);
  if (slide.layout?.type !== 'freeform') {
    before = await revision(page);
    await act(page, 'slide.setLayout', { slideId: SLIDE, layout: { type: 'freeform' } });
    await landed(page, before);
  }
  await insertObject(
    page,
    { id: OBJECTS.shape.id, type: 'shape', shape: 'rectangle', stroke: 'hair', fill: 'plate' },
    OBJECTS.shape.pos,
  );
  await insertObject(
    page,
    { id: OBJECTS.picture.id, type: 'picture', asset: PICTURE_ASSET },
    OBJECTS.picture.pos,
  );
  await insertObject(
    page,
    { id: OBJECTS.text.id, type: 'text', text: LONG_TEXT, autofit: 'grow' },
    OBJECTS.text.pos,
  );
  await insertObject(
    page,
    { id: OBJECTS.groupA.id, type: 'shape', shape: 'rectangle', stroke: 'hair', fill: 'plate' },
    OBJECTS.groupA.pos,
  );
  await insertObject(
    page,
    { id: OBJECTS.groupB.id, type: 'shape', shape: 'rectangle', stroke: 'hair' },
    OBJECTS.groupB.pos,
  );
  before = await revision(page);
  await act(page, 'block.group', {
    slideId: SLIDE,
    blockIds: [OBJECTS.groupA.id, OBJECTS.groupB.id],
  });
  await landed(page, before);
  canvasReady = true;
}

/**
 * Puts every object back at its starting box: eight drags net to about zero and the undo takes
 * one back, so without this the objects drift across the zoom tests and a click at one's centre
 * can land on another.
 */
async function resetObjects(page: Page): Promise<void> {
  for (const object of Object.values(OBJECTS)) {
    const now = await posOf(page, object.id);
    const before = await revision(page);
    await act(page, 'block.set', {
      slideId: SLIDE,
      blockId: object.id,
      path: '/pos',
      value: { ...now, ...object.pos },
    });
    await landed(page, before);
  }
}

test.describe.configure({ mode: 'serial' });

/**
 * The copy is removed through the product first (`deck.trash`, then `deck.remove` with the
 * tab's revision), so a tmp store server keeps nothing of it either (the file's old `afterAll`
 * removed the repository's `decks/<copy>` alone and left 25 copies in `$TMPDIR/turboslide/decks`
 * across the round, b6.md cycle 2 fix round); the repository path and the worker cache are then
 * removed as before, and the shared context is closed.
 */
test.afterAll(async () => {
  test.setTimeout(120_000);
  try {
    if (canvasReady) {
      await sharedPage.goto(`/edit/${COPY}?author=agent:e2e-resize`);
      await sharedPage.waitForFunction(() => Boolean(window.turboslide?.studio), null, {
        timeout: 60_000,
      });
      const info = await invoke<{ revision: number }>(sharedPage, 'deck.info');
      await invoke(sharedPage, 'deck.trash', { id: COPY, baseRevision: info.revision });
      const again = await invoke<{ revision: number }>(sharedPage, 'deck.info').catch(() => info);
      await invoke(sharedPage, 'deck.remove', {
        id: COPY,
        baseRevision: again.revision,
        confirm: true,
      });
      await expect
        .poll(
          async () => (await sharedPage.request.get(`/edit/${COPY}`, { maxRedirects: 0 })).status(),
          { timeout: 20_000, intervals: [2000] },
        )
        .toBe(404);
    }
  } finally {
    rmSync(join(ROOT, 'decks', COPY), { recursive: true, force: true });
    rmSync(join(ROOT, '.turboslide', 'worker', 'cache', COPY), { recursive: true, force: true });
    await sharedContext.close().catch(() => undefined);
  }
});

test('the canvas with a rectangle, a picture, a text box and a group is set up', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await ensureCanvas(page);
  const slide = await slideGet(page, SLIDE);
  const ids = (slide.slots?.['main'] ?? []).map((b) => b.id);
  for (const key of Object.values(OBJECTS)) expect(ids).toContain(key.id);
  expect((await posOf(page, OBJECTS.groupA.id)).group).toBeDefined();
  /* the rendered geometry against pos: the wrapper of every object sits at its pos on the stage */
  await zoomAt(page, 1, OBJECTS.shape.pos);
  await select(page, OBJECTS.shape.id);
  const geometry = await page.evaluate((shapeId) => {
    const box = (node: Element | null) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100);
    };
    const q = (sel: string) => document.querySelector(sel);
    return {
      stage: box(q('.ts-stagewrap.ts-editor .ts-stage')),
      slide: box(q('.ts-stagewrap.ts-editor .pt-slide')),
      section: box(q('.ts-stagewrap.ts-editor .pt-slide .slide')),
      inner: box(q('.ts-stagewrap.ts-editor .pt-slide .slide > .in')),
      freeform: box(q('.ts-stagewrap.ts-editor .pt-slide .freeform')),
      wrapper: box(q(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${shapeId}"]`)),
      overlay: box(q('.ts-overlay')),
      ring: box(q('.ts-overlay .ts-select.is-selected')),
      nw: box(q(`.ts-overlay [data-control="handle.${shapeId}.resize.nw"]`)),
      chip: box(q('.ts-overlay .ts-select-chip')),
      slideStyle: (
        q('.ts-stagewrap.ts-editor .pt-slide .slide') as HTMLElement | null
      )?.getAttribute('class'),
      inStyle: getComputedStyle(q('.ts-stagewrap.ts-editor .pt-slide .slide > .in')!).paddingTop,
      sectionPadding: getComputedStyle(q('.ts-stagewrap.ts-editor .pt-slide .slide')!).paddingTop,
      sectionTop: getComputedStyle(q('.ts-stagewrap.ts-editor .pt-slide .slide')!).top,
    };
  }, OBJECTS.shape.id);
  /* the ring the overlay draws from the measured boxes is the wrapper the renderer placed at pos
     (cause R7: the slide change cut left the boxes 6 px low) */
  expect(geometry.ring).toEqual(geometry.wrapper);
  expect(geometry.nw).toEqual([
    (geometry.wrapper?.[0] ?? 0) - 5.5,
    (geometry.wrapper?.[1] ?? 0) - 5.5,
    11,
    11,
  ]);
});

for (const zoom of [0.5, 1, 2]) {
  test(`at ${zoom * 100} percent every handle of the rectangle, the picture and the text box lands the model's box, scales the content and matches the readout and the inspector`, async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await ensureCanvas(page);
    await openDeck(page, COPY);
    await goTo(page, SLIDE);
    await resetObjects(page);
    const t0 = Date.now();
    /* Format options open, so Width and Height are on the page while the drags run */
    await select(page, OBJECTS.shape.id);
    await openFormatOptions(page);
    expect(await inspectorSize(page), 'the Format options size fields exist').not.toBeNull();
    const kinds = [
      { key: 'shape', content: 'svg.shape', aspect: false },
      { key: 'picture', content: '.picture', aspect: true },
      { key: 'text', content: 'p.text', aspect: false },
    ] as const;
    for (const kind of kinds) {
      if (ONLY_KINDS !== null && !ONLY_KINDS.includes(kind.key)) continue;
      const id = OBJECTS[kind.key].id;
      let lastBefore: Pos | null = null;
      for (const dir of DIRS) {
        const before = await posOf(page, id);
        await zoomAt(page, zoom, before, dir);
        await select(page, id);
        const delta = deltaFor(dir, before);
        const corner =
          (dir.includes('e') || dir.includes('w')) && (dir.includes('n') || dir.includes('s'));
        const expected = expectedBox(dir, delta, before, { aspect: kind.aspect && corner });
        const rev = await revision(page);
        const result = await dragHandle(page, id, dir, delta);
        await landed(page, rev);
        const after = await posOf(page, id);
        console.log(
          `[resize] z${zoom} ${kind.key} ${dir} ${Date.now() - t0} ms: ${JSON.stringify(after)} readout ${result.readout}`,
        );
        sameBox(after, expected);
        expect(after.rotate ?? 0).toBe(0);
        /* nothing jumped at the release: the box under the pointer is the box that landed */
        sameBox(result.preview, after, 1);
        expect(result.readout, `${kind.key} ${dir} readout`).toBe(
          `${Math.round(expected.w)} × ${Math.round(expected.h)}`,
        );
        /* the content took the box */
        const content = await contentBox(page, id, kind.content);
        if (kind.key === 'text') {
          expect(Math.abs(content.w - after.w)).toBeLessThanOrEqual(1);
          expect(await fontSizeOf(page, id)).toBe(22);
          expect((await blockOf(page, id)).autofit).toBe('none');
        } else {
          sameBox(content, after, 1);
        }
        const fields = await inspectorSize(page);
        if (fields !== null) {
          expect(fields.w, `${kind.key} ${dir} inspector width`).toBe(Math.round(after.w));
          expect(fields.h, `${kind.key} ${dir} inspector height`).toBe(Math.round(after.h));
        }
        lastBefore = before;
      }
      /* one undo restores the box before the last drag */
      if (lastBefore !== null) {
        const rev = await revision(page);
        await page.locator('body').press('ControlOrMeta+z');
        await landed(page, rev);
        sameBox(await posOf(page, id), lastBefore);
      }
    }
    expect(await inspectorSize(page), 'the Format options size fields exist').not.toBeNull();
  });

  test(`at ${zoom * 100} percent every handle of the group scales both members about the union`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    if (ONLY_KINDS !== null && !ONLY_KINDS.includes('group')) test.skip();
    await ensureCanvas(page);
    await openDeck(page, COPY);
    await goTo(page, SLIDE);
    await resetObjects(page);
    const a = OBJECTS.groupA.id;
    const b = OBJECTS.groupB.id;
    for (const dir of DIRS) {
      const posA = await posOf(page, a);
      const posB = await posOf(page, b);
      const union = {
        x: Math.min(posA.x, posB.x),
        y: Math.min(posA.y, posB.y),
        w: Math.max(posA.x + posA.w, posB.x + posB.w) - Math.min(posA.x, posB.x),
        h: Math.max(posA.y + posA.h, posB.y + posB.h) - Math.min(posA.y, posB.y),
      };
      await zoomAt(page, zoom, { ...union }, dir);
      await select(page, a);
      const delta = deltaFor(dir, union);
      const expected = expectedBox(dir, delta, union);
      const rev = await revision(page);
      const result = await dragHandle(page, a, dir, delta);
      await landed(page, rev);
      expect(result.readout, `group ${dir} readout`).toBe(
        `${Math.round(expected.w)} × ${Math.round(expected.h)}`,
      );
      const kx = expected.w / union.w;
      const ky = expected.h / union.h;
      for (const [id, was] of [
        [a, posA],
        [b, posB],
      ] as const) {
        const now = await posOf(page, id);
        sameBox(
          now,
          {
            x: expected.x + (was.x - union.x) * kx,
            y: expected.y + (was.y - union.y) * ky,
            w: was.w * kx,
            h: was.h * ky,
          },
          0.51,
        );
        expect(now.group).toBe(was.group);
      }
    }
  });
}

test('a rotated rectangle keeps its anchored corner on the sheet and lands the dragged corner under the pointer; Shift keeps a text box’s ratio and Alt keeps the centre', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await ensureCanvas(page);
  await openDeck(page, COPY);
  await goTo(page, SLIDE);
  await resetObjects(page);
  const id = OBJECTS.shape.id;
  let rev = await revision(page);
  await act(page, 'block.rotate', { slideId: SLIDE, blockIds: [id], to: 30 });
  await landed(page, rev);
  const CORNER: Record<string, [number, number]> = {
    nw: [0, 2],
    ne: [1, 3],
    se: [2, 0],
    sw: [3, 1],
  };
  for (const dir of DIRS) {
    const before = await posOf(page, id);
    expect(before.rotate).toBe(30);
    await zoomAt(page, 1, before);
    await select(page, id);
    const delta = deltaFor(dir, before);
    const was = corners(before, 30);
    rev = await revision(page);
    const result = await dragHandle(page, id, dir, delta);
    await landed(page, rev);
    const after = await posOf(page, id);
    expect(after.rotate).toBe(30);
    const now = corners(after, 30);
    const pair = CORNER[dir];
    if (pair !== undefined) {
      const [dragged, anchored] = pair;
      expect(
        Math.hypot(now[anchored]!.x - was[anchored]!.x, now[anchored]!.y - was[anchored]!.y),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.hypot(
          now[dragged]!.x - (was[dragged]!.x + delta.dx),
          now[dragged]!.y - (was[dragged]!.y + delta.dy),
        ),
      ).toBeLessThanOrEqual(1);
    } else {
      /* a side handle: the opposite edge's two corners stay */
      const held = dir === 'n' ? [2, 3] : dir === 's' ? [0, 1] : dir === 'e' ? [0, 3] : [1, 2];
      for (const index of held)
        expect(
          Math.hypot(now[index]!.x - was[index]!.x, now[index]!.y - was[index]!.y),
        ).toBeLessThanOrEqual(1);
    }
    expect(result.readout).toBe(`${Math.round(after.w)} × ${Math.round(after.h)}`);
    /* the wrapper's client box is the rotated box's axis aligned bounds: no jump at the release */
    const xs = now.map((c) => c.x);
    const ys = now.map((c) => c.y);
    const bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    sameBox(result.preview, bounds, 1.5);
  }
  rev = await revision(page);
  await act(page, 'block.rotate', { slideId: SLIDE, blockIds: [id], to: 0 });
  await landed(page, rev);

  /* Shift on the text box's corner keeps its ratio */
  const text = OBJECTS.text.id;
  const textBefore = await posOf(page, text);
  await zoomAt(page, 1, textBefore);
  await select(page, text);
  rev = await revision(page);
  await dragHandle(page, text, 'se', { dx: 60, dy: 0 }, { shift: true });
  await landed(page, rev);
  sameBox(
    await posOf(page, text),
    expectedBox('se', { dx: 60, dy: 0 }, textBefore, { aspect: true }),
  );

  /* Alt on the rectangle's east handle keeps the centre */
  const shapeBefore = await posOf(page, id);
  await zoomAt(page, 1, shapeBefore);
  await select(page, id);
  rev = await revision(page);
  await dragHandle(page, id, 'e', { dx: 40, dy: 0 }, { alt: true });
  await landed(page, rev);
  const centred = await posOf(page, id);
  sameBox(centred, expectedBox('e', { dx: 40, dy: 0 }, shapeBefore, { alt: true }));
  expect(centred.x + centred.w / 2).toBeCloseTo(shapeBefore.x + shapeBefore.w / 2, 0);

  /* every write of this spec was one version; the last two undo in one step each */
  const log = await invoke<Version[]>(page, 'version.list');
  expect(log.length).toBeGreaterThan(0);
  rev = await revision(page);
  await page.locator('body').press('ControlOrMeta+z');
  await landed(page, rev);
  sameBox(await posOf(page, id), shapeBefore);
});

// The editor depth round's preview drive (docs/editor-depth-evidence/README.md). One Playwright page
// at 1440 by 900 walks a deployed studio: the sidebar head and density, a deck created from the GT
// template, the Insert menu's primitives, the freeform switch, a drag with guides landing as one
// mutation, a resize, an align, palette and custom colors with the lint mark, typography, a drag
// across columns on a grammar slide, three tooltips, the synchronous PPTX export from the menu, the
// bundle download and upload, and the present view. Every step is recorded as pass or fail with its
// numbers in smoke-table.md and drive.json; the screenshots are small JPEGs.
//
//   VERCEL_OIDC_TOKEN=... node scripts/editor-depth-drive.mjs <url> [--out docs/editor-depth-evidence]
//
// A preview sits behind Vercel Authentication, so the page sends the project's development token in
// the Trusted Sources header when VERCEL_OIDC_TOKEN is in the environment (docs/hosting.md section
// 7); the value is never printed. Only the integrator and the verifier run this against a preview.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const BASE = (argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4321').replace(/\/$/, '');
const outIndex = argv.indexOf('--out');
const OUT = resolve(outIndex >= 0 ? argv[outIndex + 1] : 'docs/editor-depth-evidence');
mkdirSync(OUT, { recursive: true });

const oidc = process.env.VERCEL_OIDC_TOKEN;
const headers = oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {};

const rows = [];
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const record = (name, ok, numbers, extra = {}) => {
  rows.push({ name, ok, numbers });
  log.steps.push({ name, ok, numbers, ...extra });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${numbers}`);
};

/** DRIVE_SKIP=export,bundle skips the steps whose name carries a word, for a local dry run */
const SKIP = (process.env.DRIVE_SKIP ?? '')
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);

/** DRIVE_STOP_AFTER=<word> ends the run after the first step whose name carries the word */
const STOP_AFTER = process.env.DRIVE_STOP_AFTER ?? '';
let stopped = false;

async function step(name, fn) {
  const t0 = Date.now();
  if (stopped) {
    record(name, true, 'not run (DRIVE_STOP_AFTER)');
    return { ok: true, skipped: true };
  }
  if (STOP_AFTER && name.includes(STOP_AFTER)) stopped = true;
  if (SKIP.some((word) => name.includes(word))) {
    record(name, true, 'skipped (DRIVE_SKIP)');
    return { ok: true, skipped: true };
  }
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    record(name, result?.ok !== false, `${result?.numbers ?? ''} (${ms} ms)`.trim(), result?.extra);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    const file = await shot('failed').catch(() => null);
    record(name, false, `${message} (${Date.now() - t0} ms)`, { file });
    return { ok: false, error: message };
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: headers,
  acceptDownloads: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

let shotIndex = 0;
async function shot(name) {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, '0')}-${name}-1440x900.jpg`;
  await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 55 });
  return file;
}

/** waits for an element's entrance (the chrome's pt-fade-in over --pt-dur-fast) to finish before a shot */
async function settled(locator, timeout = 2000) {
  await locator
    .evaluate(
      (el) =>
        Promise.all(
          [el, ...el.querySelectorAll('*')]
            .flatMap((node) => node.getAnimations())
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
      null,
      { timeout },
    )
    .catch(() => {});
  await page.waitForTimeout(50);
}

/** a deck name no earlier run of the drive can have left in the shared store */
function stampedName(base) {
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
  return `${base} ${stamp}`;
}

const studio = {
  async wait(timeout = 90_000) {
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout });
    await page
      .locator('.ts-status')
      .filter({ hasText: /Saved · r\d+/ })
      .first()
      .waitFor({ timeout });
  },
  state: () => page.evaluate(() => window.turboslide.studio.describe().state),
  rev: async () => (await studio.state()).revision,
  source: () => page.evaluate(() => JSON.parse(window.turboslide.studio.readSource())),
  invoke: (action, input) =>
    page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]),
  async goto(slideId) {
    await studio.invoke('view.goto', { slideId });
    await page
      .locator('.pt-viewer')
      .and(page.locator(`[data-active="${slideId}"]`))
      .waitFor();
    await page.waitForTimeout(400);
  },
  /** waits until the document moved past `from` and the server holds that revision */
  async settle(from, timeout = 120_000) {
    await page.waitForFunction(
      (r) => {
        const s = window.turboslide.studio.describe().state;
        return s.revision > r && s.serverRevision >= s.revision && s.pending === 0;
      },
      from,
      { timeout },
    );
    return studio.rev();
  },
};

/* the editor's own sheet (Editor.tsx `ts-stagewrap ts-editor`): the sidebar's live clones are
   .pt-slide elements under the route's .ts-editor root too */
const STAGE = '.ts-stagewrap.ts-editor .pt-slide';
const sheet = () => page.locator(STAGE).first();
const blockEl = (id) => page.locator(`${STAGE} [data-block="${id}"]`).first();
const freeEl = (id) => page.locator(`${STAGE} .free[data-free="${id}"]`).first();
const control = (id) => page.locator(`[data-control="${id}"]`).first();

/** clicks a control until its target appears: a click on the server's HTML before hydration is lost */
async function openWith(buttonId, targetId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    await control(buttonId).click();
    const shown = await control(targetId)
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (shown) return;
  }
  throw new Error(`${targetId} did not appear after clicking ${buttonId} ${tries} times`);
}

/** picks a value on an inspector Seg (the hidden native select mirror plus the visible buttons) */
async function pickSeg(controlId, value) {
  const native = control(controlId);
  await native.waitFor({ state: 'attached', timeout: 15_000 });
  const tag = await native.evaluate((el) => el.tagName);
  if (tag === 'SELECT') {
    const mirror = await native.evaluate((el) => el.classList.contains('ts-native-mirror'));
    if (!mirror) {
      await native.selectOption(value);
      return;
    }
    const button = native
      .locator('xpath=..')
      .locator('button')
      .filter({ hasText: new RegExp(`^${value}$`) })
      .first();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    return;
  }
  await native.selectOption(value);
}

/** selects a block by a pointer press at its center and confirms it through the window API */
async function select(locator, id, { shift = false, tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    const box = await locator.boundingBox();
    if (!box) {
      await page.waitForTimeout(300);
      continue;
    }
    /* a press near the top left corner: on a freeform slide a later block can cover the center;
       the pause keeps two presses from reading as a double click, which starts inline editing */
    const px = box.x + Math.min(10, box.width / 2);
    const py = box.y + Math.min(6, box.height / 2);
    await page.waitForTimeout(600);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(px, py);
    if (shift) await page.keyboard.up('Shift');
    const picked = await page
      .waitForFunction(
        (want) => {
          const state = window.turboslide.studio.describe().state;
          return want.shift
            ? document.querySelectorAll('.ts-overlay .ts-select.is-selected').length >= 2
            : state.blockId === want.id;
        },
        { id, shift },
        { timeout: 1500 },
      )
      .then(() => true)
      .catch(() => false);
    if (picked) return;
    if (!shift) {
      /* the inspector's Block list is the other way to select a block another one covers: it is
         drawn while nothing is selected, one row per block */
      await page.keyboard.press('Escape');
      const row = control(`inspector.block.${id}`);
      const listed = await row
        .waitFor({ state: 'visible', timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (listed) {
        await row.click();
        const viaRow = await page
          .waitForFunction(
            (want) => window.turboslide.studio.describe().state.blockId === want,
            id,
            {
              timeout: 1500,
            },
          )
          .then(() => true)
          .catch(() => false);
        if (viaRow) return;
      }
    }
  }
  const seen = await page.evaluate(() => ({
    blockId: window.turboslide.studio.describe().state.blockId,
    rings: [...document.querySelectorAll('.ts-overlay .ts-select')].map((e) => e.className),
    editing: document.querySelector('.ts-stagewrap.ts-editor')?.hasAttribute('data-editing'),
  }));
  throw new Error(`block ${id} did not select after ${tries} presses (${JSON.stringify(seen)})`);
}

/** the block whose element is under a block's press point (a later block can cover an earlier one) */
async function blockUnderPress(locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  return page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.closest('[data-free]')?.getAttribute('data-free') ?? null,
    [box.x + Math.min(10, box.width / 2), box.y + Math.min(6, box.height / 2)],
  );
}

async function typeInto(controlId, value) {
  const field = control(controlId);
  await field.scrollIntoViewIfNeeded();
  await field.fill(String(value));
  await field.press('Enter');
}

async function drag(fromBox, dx, dy, { steps = 10, midway } = {}) {
  const x = fromBox.x + fromBox.width / 2;
  const y = fromBox.y + fromBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  let mid = null;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    if (i === steps && midway) mid = await midway();
  }
  await page.mouse.up();
  return mid;
}

const findBlock = (slide, type, not = []) =>
  Object.values(slide.slots ?? {})
    .flat()
    .find((b) => b.type === type && !not.includes(b.id));

// 1. The viewer: the head reads Turboslide and the list opens in thumbnail density
let created = null;
await step('viewer head reads Turboslide, list in thumbnail density', async () => {
  const t0 = Date.now();
  await page.goto(`${BASE}/deck/gt-brand`);
  await page.locator('.pt-viewer[data-settled]').waitFor({ timeout: 60_000 });
  const settled = Date.now() - t0;
  const head = (await page.locator('.pt-sb-head b').first().textContent())?.trim();
  const cards = await page.locator('.pt-thumb-frame.is-card').count();
  const density = await page.locator('.pt-viewer').getAttribute('data-density');
  const deckSlot = page.locator('.pt-bar-deck');
  const brand = (await deckSlot.count()) > 0 ? ((await deckSlot.first().textContent()) ?? '') : '';
  const file = await shot('viewer-turboslide-thumbs');
  return {
    ok: head === 'Turboslide' && density === 'thumbs' && cards > 0,
    numbers: `head "${head}", density ${density}, ${cards} thumbnail cards, settled ${settled} ms, status slot "${brand.trim().slice(0, 40)}"`,
    extra: { file },
  };
});

// 2. Create a deck from the GT template
await step('create a deck from the GT template on /decks', async () => {
  await page.goto(`${BASE}/decks`);
  await openWith('decks.new', 'decks.name');
  await control('decks.name').fill(stampedName('Editor depth'));
  await control('decks.from.gt-brand').check({ force: true });
  const t0 = Date.now();
  await control('decks.create').click();
  const outcome = await Promise.race([
    page.waitForURL(/\/edit\//, { timeout: 300_000 }).then(() => 'opened'),
    page
      .locator('.ts-decks-error')
      .first()
      .waitFor({ state: 'visible', timeout: 300_000 })
      .then(() => 'error'),
  ]);
  if (outcome === 'error') {
    const text = (await page.locator('.ts-decks-error').first().textContent()) ?? '';
    throw new Error(`create refused: ${text.trim().slice(0, 160)}`);
  }
  const ms = Date.now() - t0;
  created = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
  await studio.wait();
  const total = await page.locator('.pt-viewer').getAttribute('data-total');
  const file = await shot('created-deck-editor');
  return {
    ok: Boolean(created) && Number(total) > 0,
    numbers: `deck ${created}, ${total} slides, created in ${ms} ms`,
    extra: { file, deckId: created },
  };
});
if (!created) {
  console.error('no deck was created; stopping');
  process.exit(2);
}

// 3. The editor on content-rule
const SLIDE = 'content-rule';
await step('open the editor on content-rule', async () => {
  await page.goto(`${BASE}/edit/${encodeURIComponent(created)}?edit=1`);
  await studio.wait();
  await studio.goto(SLIDE);
  const src = await studio.source();
  const rev = await studio.rev();
  return {
    ok: src.id === SLIDE,
    numbers: `layout ${src.layout?.type}, r${rev}, ${Object.values(src.slots).flat().length} blocks`,
  };
});

// 4. Insert a box, a shape and a text primitive from the Insert menu
const inserted = {};
for (const [type, controlId, label] of [
  ['box', 'insert.block:box', 'Box'],
  ['shape', 'insert.block.shape.rectangle', 'Rectangle'],
  ['text', 'insert.block:text', 'Text box'],
]) {
  await step(`insert a ${type} primitive from the Insert menu`, async () => {
    const before = await studio.source();
    const r0 = await studio.rev();
    await control('insert.open').click();
    await control('insert.menu').waitFor({ timeout: 10_000 });
    /* the card fades in over --pt-dur-fast: a shot before the animation ends shows its text
       without the plate (the round's first evidence 03 was taken that way) */
    if (type === 'box') {
      await settled(control('insert.menu'));
      await shot('insert-menu-open');
    }
    let entry = control(controlId);
    if ((await entry.count()) === 0) {
      entry = control('insert.menu')
        .locator('button')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .first();
    }
    await entry.click();
    const r1 = await studio.settle(r0);
    if (
      await control('insert.menu')
        .isVisible()
        .catch(() => false)
    )
      await page.keyboard.press('Escape');
    const after = await studio.source();
    const ids = new Set(
      Object.values(before.slots)
        .flat()
        .map((b) => b.id),
    );
    const fresh = Object.values(after.slots)
      .flat()
      .find((b) => b.type === type && !ids.has(b.id));
    inserted[type] = fresh?.id;
    return {
      ok: Boolean(fresh) && r1 === r0 + 1,
      numbers: `block ${fresh?.id} (${fresh?.type}${fresh?.kind ? ' ' + fresh.kind : ''}), r${r0} to r${r1}`,
    };
  });
}
await shot('primitives-inserted');

// 5. Switch the slide to freeform
await step('switch the slide to the freeform layout', async () => {
  const r0 = await studio.rev();
  await pickSeg('slide.layout.type', 'freeform');
  const r1 = await studio.settle(r0);
  const src = await studio.source();
  const blocks = src.slots.main ?? [];
  const positioned = blocks.filter((b) => b.pos).length;
  const free = await page.locator(`${STAGE} .free[data-free]`).count();
  const file = await shot('freeform-layout');
  return {
    ok:
      src.layout?.type === 'freeform' &&
      positioned === blocks.length &&
      blocks.length > 0 &&
      r1 === r0 + 1,
    numbers: `layout ${src.layout?.type}, ${positioned}/${blocks.length} blocks positioned, ${free} .free wrappers, r${r0} to r${r1}`,
    extra: { file },
  };
});

const posOf = async (id) => (await studio.source()).slots.main.find((b) => b.id === id)?.pos;
const current = await studio.source();
const boxId = inserted.box ?? findBlock(current, 'box')?.id;
const textId = inserted.text ?? findBlock(current, 'text')?.id;

// 6. Drag a block to the left rail: guides show, one mutation lands, the position is snapped
await step('drag a block, guides show, one snapped mutation', async () => {
  const before = await posOf(boxId);
  const scale = (await sheet().boundingBox()).width / 1600;
  await select(freeEl(boxId), boxId);
  const handle = control(`handle.${boxId}.move`);
  await handle.waitFor({ timeout: 10_000 });
  const hb = await handle.boundingBox();
  const targetX = 56 + 3; // the left rail at 56 with a 3 px miss for the snap to close
  const targetY = 96 + 3; // the content top at 96, the same 3 px miss
  const dx = (targetX - before.x) * scale;
  const dy = (targetY - before.y) * scale;
  const r0 = await studio.rev();
  let guides = 0;
  let file = null;
  await drag(hb, dx, dy, {
    midway: async () => {
      await page.waitForTimeout(80);
      guides = await page.locator('.ts-guide').count();
      file = await shot('drag-with-guides');
    },
  });
  const r1 = await studio.settle(r0);
  const after = await posOf(boxId);
  const snapped = after.x === 56 && (after.y === 96 || after.y % 8 === 0);
  return {
    ok: r1 === r0 + 1 && guides > 0 && snapped && (after.x !== before.x || after.y !== before.y),
    numbers: `pos ${before.x},${before.y} to ${after.x},${after.y} (rail 56, content top 96, grid 8), ${guides} guides at the drop point, r${r0} to r${r1}`,
    extra: { file, before, after },
  };
});

// 7. Resize from the south east handle
await step('resize a block from a corner handle', async () => {
  const before = await posOf(boxId);
  await select(freeEl(boxId), boxId);
  const handle = control(`handle.${boxId}.resize.se`);
  await handle.waitFor({ timeout: 10_000 });
  const r0 = await studio.rev();
  await drag(await handle.boundingBox(), 37, 29);
  const r1 = await studio.settle(r0);
  const after = await posOf(boxId);
  const grid = after.w % 8 === 0 && after.h % 8 === 0;
  return {
    ok: r1 === r0 + 1 && (after.w !== before.w || after.h !== before.h),
    numbers: `size ${before.w}x${before.h} to ${after.w}x${after.h} (${grid ? 'both on the 8 px grid' : 'an edge on a guide'}), r${r0} to r${r1}`,
  };
});

// 8. Align two blocks on the left edge
await step('align two blocks on an edge', async () => {
  /* the partner: a block whose own element is under its press point (the moved box covers some) */
  const others = (await studio.source()).slots.main.map((b) => b.id).filter((id) => id !== boxId);
  let partner = null;
  for (const id of others) {
    if ((await blockUnderPress(freeEl(id))) === id) {
      partner = id;
      break;
    }
  }
  if (!partner) throw new Error('no uncovered partner block');
  const a0 = await posOf(boxId);
  const b0 = await posOf(partner);
  /* pick an edge the two blocks do not share yet, so the write is not a no-op */
  const edge =
    a0.x !== b0.x
      ? 'left'
      : a0.x + a0.w !== b0.x + b0.w
        ? 'right'
        : a0.y !== b0.y
          ? 'top'
          : 'bottom';
  await select(freeEl(boxId), boxId);
  await select(freeEl(partner), partner, { shift: true });
  const rings = await page.locator('.ts-overlay .ts-select.is-selected').count();
  const r0 = await studio.rev();
  await control(`arrange.align.${edge}`).click();
  const r1 = await studio.settle(r0);
  const a = await posOf(boxId);
  const b = await posOf(partner);
  const same =
    edge === 'left'
      ? a.x === b.x
      : edge === 'right'
        ? a.x + a.w === b.x + b.w
        : edge === 'top'
          ? a.y === b.y
          : a.y + a.h === b.y + b.h;
  const file = await shot('align');
  return {
    ok: rings >= 2 && same && r1 === r0 + 1,
    numbers: `${rings} selected, align ${edge}: ${boxId} ${a0.x},${a0.y} ${a0.w}x${a0.h} and ${partner} ${b0.x},${b0.y} ${b0.w}x${b0.h} to ${a.x},${a.y} and ${b.x},${b.y}, r${r0} to r${r1}`,
    extra: { file },
  };
});

// 9. Colors: a palette token, then a custom hex with the lint mark
await step('palette color then custom color with the off-palette lint mark', async () => {
  await page.keyboard.press('Escape');
  await select(freeEl(boxId), boxId);
  const r0 = await studio.rev();
  await control(`block.${boxId}.fill.green`).scrollIntoViewIfNeeded();
  await control(`block.${boxId}.fill.green`).click();
  const r1 = await studio.settle(r0);
  const token = (await studio.source()).slots.main.find((b) => b.id === boxId).fill;
  const marksBefore = await page.locator('.ts-lint-mark').count();
  await typeInto(`block.${boxId}.fill.hex`, '#ff6600');
  const r2 = await studio.settle(r1);
  const hex = (await studio.source()).slots.main.find((b) => b.id === boxId).fill;
  await page.waitForTimeout(600);
  const marksAfter = await page.locator('.ts-lint-mark').count();
  const lint = await studio.invoke('lint.run', { slideIds: [SLIDE], layers: 'static' });
  const findings = Array.isArray(lint) ? lint : (lint.findings ?? []);
  const off = findings.filter((f) => f.rule === 'color/off-palette').length;
  const file = await shot('color-off-palette');
  return {
    ok: token === 'green' && hex === '#ff6600' && marksAfter > marksBefore && r2 === r1 + 1,
    numbers: `fill green (r${r1}) then ${hex} (r${r2}), lint marks ${marksBefore} to ${marksAfter}, color/off-palette findings ${off}`,
    extra: { file },
  };
});

// 10. Typography: size, weight and alignment on the text primitive
await step('typography size, weight (cap mark) and alignment', async () => {
  await select(freeEl(textId), textId);
  const r0 = await studio.rev();
  await typeInto(`block.${textId}.typography.size`, 28);
  const r1 = await studio.settle(r0);
  await typeInto(`block.${textId}.typography.weight`, 700);
  const r2 = await studio.settle(r1);
  await page.waitForTimeout(400);
  const capMark = await page
    .locator(
      `[data-control="block.${textId}.typography"] .ts-lint-mark, [data-control="block.${textId}.typography.weight"] ~ .ts-lint-mark`,
    )
    .count();
  await pickSeg(`block.${textId}.typography.align`, 'center');
  const r3 = await studio.settle(r2);
  const typo = (await studio.source()).slots.main.find((b) => b.id === textId).typography;
  const lint = await studio.invoke('lint.run', { slideIds: [SLIDE], layers: 'static' });
  const findings = Array.isArray(lint) ? lint : (lint.findings ?? []);
  const cap = findings.filter((f) => f.rule === 'type/weight-cap').length;
  const file = await shot('typography');
  return {
    /* the inspector's cap mark is the lint rendered at the control; the server count is reported
       too, and can lag on a host whose instance has not proven the newest write yet */
    ok:
      typo?.size === 28 &&
      typo?.weight === 700 &&
      typo?.align === 'center' &&
      (capMark > 0 || cap > 0),
    numbers: `typography ${JSON.stringify(typo)}, weight-cap marks ${capMark}, type/weight-cap findings ${cap}, r${r0} to r${r3}`,
    extra: { file },
  };
});

// 11. Drag a block into the other column on a grammar slide
await step('drag a block into the other column on a cols slide', async () => {
  const list = await studio.invoke('slide.list', {});
  const ids = (Array.isArray(list) ? list : (list.slides ?? [])).map((s) => s.id ?? s.slideId ?? s);
  let target = null;
  for (const id of ids) {
    if (id === SLIDE) continue;
    const got = await studio.invoke('slide.get', { slideId: id });
    const s = got.slide ?? got;
    if (
      s.kind === 'content' &&
      s.layout?.type === 'cols' &&
      (s.slots.left?.length ?? 0) > 0 &&
      (s.slots.right?.length ?? 0) > 0
    ) {
      target = s;
      break;
    }
  }
  if (!target) throw new Error('no cols slide with blocks in both columns');
  await studio.goto(target.id);
  const moving = target.slots.left[0].id;
  const rightId = target.slots.right[0].id;
  await select(blockEl(moving), moving);
  const handle = control(`handle.${moving}.move`);
  await handle.waitFor({ timeout: 10_000 });
  const hb = await handle.boundingBox();
  const rb = await blockEl(rightId).boundingBox();
  const r0 = await studio.rev();
  let dropSeen = 0;
  let file = null;
  await drag(
    hb,
    rb.x + rb.width / 2 - (hb.x + hb.width / 2),
    rb.y + rb.height * 0.8 - (hb.y + hb.height / 2),
    {
      steps: 14,
      midway: async () => {
        await page.waitForTimeout(80);
        dropSeen = await page.locator('.ts-drop-slot, .ts-drop.is-active').count();
        file = await shot('grammar-drag-across-columns');
      },
    },
  );
  const r1 = await studio.settle(r0);
  const after = await studio.invoke('slide.get', { slideId: target.id });
  const s = after.slide ?? after;
  const inRight = (s.slots.right ?? []).some((b) => b.id === moving);
  return {
    ok: inRight && r1 === r0 + 1,
    numbers: `slide ${target.id}: ${moving} left to right (${dropSeen} drop indicators while dragging), r${r0} to r${r1}`,
    extra: { file },
  };
});

// 12. Tooltips on three controls
await step('tooltips on three controls', async () => {
  await studio.goto(SLIDE);
  const texts = [];
  let file = null;
  for (const id of ['insert.open', 'export.open', 'sidebar.density.outline']) {
    await page.mouse.move(5, 5);
    await page.waitForTimeout(150);
    const el = control(id);
    await el.hover();
    await page.locator('#pt-tip').waitFor({ state: 'visible', timeout: 5_000 });
    const text = ((await page.locator('#pt-tip').textContent()) ?? '').replace(/\s+/g, ' ').trim();
    texts.push(`${id}: "${text.slice(0, 90)}"`);
    if (id === 'insert.open') file = await shot('tooltip');
  }
  await page.mouse.move(5, 5);
  return {
    ok: texts.length === 3 && texts.every((t) => t.length > 12),
    numbers: texts.join(' | '),
    extra: { file },
  };
});

// 13. Export the deck as perfect PPTX from the menu (synchronous on the host)
await step('export perfect PPTX from the Export menu (sync)', async () => {
  await control('export.open').click();
  await control('export.menu').waitFor({ timeout: 10_000 });
  await control('export.theme.light').click();
  const t0 = Date.now();
  /* no response body reads here: awaiting a server function's body while the export streams held
     the page on previews 7 and 8 and the card never registered; the report card is the evidence */
  await control('export.pptx').click();
  await control('export.report').waitFor({ timeout: 420_000 });
  const ms = Date.now() - t0;
  const card = ((await control('export.report').textContent()) ?? '').replace(/\s+/g, ' ').trim();
  const files = await control('export.report')
    .locator('.ts-report-file')
    .allTextContents()
    .catch(() => []);
  const file = await shot('export-report-card');
  return {
    ok: /perfect/i.test(card) && !/failed/i.test(card),
    numbers: `report after ${ms} ms: "${card.slice(0, 160)}", files ${files.join(', ')}`,
    extra: { file, files, card },
  };
});

// 14. Download the deck bundle from the Export menu, then upload it back as a new deck
let bundlePath = null;
await step('download the deck bundle from the Export menu', async () => {
  if (
    !(await control('export.menu')
      .isVisible()
      .catch(() => false))
  )
    await control('export.open').click();
  await control('export.bundle').waitFor({ timeout: 10_000 });
  const t0 = Date.now();
  const waiting = page.waitForEvent('download', { timeout: 180_000 });
  await control('export.bundle').click();
  const download = await waiting;
  bundlePath = join(OUT, '..', '..', '.turboslide', `${created}.bundle.zip`);
  mkdirSync(join(OUT, '..', '..', '.turboslide'), { recursive: true });
  await download.saveAs(bundlePath);
  const { statSync } = await import('node:fs');
  const bytes = statSync(bundlePath).size;
  await page.keyboard.press('Escape');
  return {
    ok: bytes > 1000,
    numbers: `${download.suggestedFilename()}, ${bytes} bytes in ${Date.now() - t0} ms`,
    extra: { bytes },
  };
});

let uploadedId = null;
await step('upload the bundle back on /decks as a new deck', async () => {
  if (!bundlePath) throw new Error('no bundle to upload');
  await page.goto(`${BASE}/decks`);
  await openWith('decks.upload', 'decks.bundle-file');
  await control('decks.bundle-file').setInputFiles(bundlePath);
  const t0 = Date.now();
  await control('decks.bundle-submit').click();
  const outcome = await Promise.race([
    page.waitForURL(/\/edit\//, { timeout: 300_000 }).then(() => 'opened'),
    control('decks.upload-error')
      .waitFor({ state: 'visible', timeout: 300_000 })
      .then(() => 'error'),
  ]);
  const ms = Date.now() - t0;
  if (outcome === 'error') {
    const text = (await control('decks.upload-error').textContent()) ?? '';
    return { ok: false, numbers: `route refused after ${ms} ms: ${text.trim().slice(0, 160)}` };
  }
  uploadedId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
  await studio.wait();
  const total = await page.locator('.pt-viewer').getAttribute('data-total');
  const file = await shot('uploaded-bundle-editor');
  return {
    ok: uploadedId !== created && Number(total) > 0,
    numbers: `deck ${uploadedId}, ${total} slides, ${ms} ms`,
    extra: { file, uploadedId },
  };
});

// 15. A small deck for the raw upload path when the big one is over the function's body cap
let smallId = null;
await step('create a blank deck, download and upload its bundle', async () => {
  await page.goto(`${BASE}/decks`);
  await openWith('decks.new', 'decks.name');
  /* stamped like row 2: the shared store keeps every earlier run's deck, and a fixed name was
     refused with "exists already; pick another name" (the round's row 15 failure) */
  await control('decks.name').fill(stampedName('Bundle round trip'));
  await control('decks.from.blank').check({ force: true });
  await control('decks.create').click();
  const created = await Promise.race([
    page.waitForURL(/\/edit\//, { timeout: 120_000 }).then(() => 'opened'),
    page
      .locator('.ts-decks-error')
      .first()
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => 'error'),
  ]);
  if (created === 'error') {
    const text = (await page.locator('.ts-decks-error').first().textContent()) ?? '';
    throw new Error(`create refused: ${text.trim().slice(0, 160)}`);
  }
  smallId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
  await studio.wait();
  await control('export.open').click();
  const waiting = page.waitForEvent('download', { timeout: 120_000 });
  await control('export.bundle').click();
  const download = await waiting;
  const path = join(OUT, '..', '..', '.turboslide', `${smallId}.bundle.zip`);
  await download.saveAs(path);
  const { statSync } = await import('node:fs');
  const bytes = statSync(path).size;
  await page.goto(`${BASE}/decks`);
  await openWith('decks.upload', 'decks.bundle-file');
  await control('decks.bundle-file').setInputFiles(path);
  const t0 = Date.now();
  await control('decks.bundle-submit').click();
  const outcome = await Promise.race([
    page.waitForURL(/\/edit\//, { timeout: 120_000 }).then(() => 'opened'),
    control('decks.upload-error')
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => 'error'),
  ]);
  if (outcome === 'error') {
    const text = (await control('decks.upload-error').textContent()) ?? '';
    return { ok: false, numbers: `${bytes} byte bundle refused: ${text.trim().slice(0, 160)}` };
  }
  const copy = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
  return {
    ok: copy !== smallId,
    numbers: `${smallId} (${bytes} bytes) uploaded back as ${copy} in ${Date.now() - t0} ms`,
    extra: { smallId, copy },
  };
});

// 16. The present view
await step('open /deck/<id>?present=1', async () => {
  await page.goto(`${BASE}/deck/${encodeURIComponent(created)}?present=1`);
  await page.locator('.pt-viewer.is-present').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  const file = await shot('present');
  const active = await page.locator('.pt-viewer').getAttribute('data-active');
  return { ok: true, numbers: `present mode on ${active}`, extra: { file } };
});

log.pageErrors = pageErrors;
log.deckId = created;
log.uploadedId = uploadedId;
log.smallId = smallId;
log.bundlePath = bundlePath;
log.finishedAt = new Date().toISOString();
writeFileSync(join(OUT, 'drive.json'), JSON.stringify(log, null, 2));
const table = [
  '| Step | Result | Numbers |',
  '| --- | --- | --- |',
  ...rows.map(
    (r) => `| ${r.name} | ${r.ok ? 'pass' : 'fail'} | ${r.numbers.replace(/\|/g, '/')} |`,
  ),
].join('\n');
writeFileSync(join(OUT, 'smoke-table.md'), `${table}\n`);
console.log(table);
console.log(`page errors: ${pageErrors.length}`);
await browser.close();
process.exit(rows.every((r) => r.ok) ? 0 : 1);

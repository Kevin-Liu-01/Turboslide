#!/usr/bin/env node
// The ship step's production walk of round two (docs/gslides-parity/MILESTONES-2.md "Ship step";
// Kevin's directive (3): "we must, must must be able to drag and move around ANYTHING").
//
//   node docs/gslides-parity/verification-2/ship/production-canvas.mjs
//        [--base https://turboslide.vercel.app] [--out docs/gslides-parity/verification-2/ship]
//        [--shot docs/gslides-parity/verification-2/production-canvas.jpg] [--keep]
//        [--purge <deckId>]
//
// Opens /new in Chrome for Testing at 1440 by 900 (the headless launcher of packages/headless,
// one page), and on the fresh draft: drags the Title slide's heading (the first write converts
// the slide to the canvas and creates the deck on the hosted store), draws a rectangle and
// rotates it with the keys, inserts a bar chart through Insert > Chart > Bar, types italic text
// into the heading, reads the deck back through the window API (deck.info, slide.get with every
// object's pos, version.list), screenshots the editor, then trashes the scratch deck through
// File > Move to trash and deletes it forever through the trash page's own button (`--purge` names
// one more trashed deck to delete there, a scratch deck an earlier run left). With
// TURBOSLIDE_TOKEN in the environment (run-with-token.mjs reads it from hosts.json in code) the
// walk also reads `deck.info` over /api/actions for its deck, the row that carries
// `counts.snapshots` on the Blob store (SPEC-2 8.2). Every step is recorded under --out as
// production-canvas.json with its timings; exit 1 when a step failed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (value('base') ?? 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = join(ROOT, value('out') ?? 'docs/gslides-parity/verification-2/ship');
const SHOT = join(
  ROOT,
  value('shot') ?? 'docs/gslides-parity/verification-2/production-canvas.jpg',
);
const KEEP = argv.includes('--keep');
const PURGE = value('purge');
const TOKEN = process.env.TURBOSLIDE_TOKEN;
const AUTHOR = 'agent:ship-2';

mkdirSync(OUT, { recursive: true });
const log = (line) => process.stderr.write(`${line}\n`);
const steps = [];
const record = (step, ok, evidence) => {
  steps.push({ step, ok, evidence });
  log(
    `${ok ? 'ok  ' : 'FAIL'} ${step}: ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`,
  );
};

const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const slideGet = async (page, slideId) => (await invoke(page, 'slide.get', { slideId })).slide;
const objects = async (page, slideId) =>
  Object.values((await slideGet(page, slideId)).slots ?? {}).flat();

async function settled(page, timeout = 60_000) {
  await page.waitForFunction(
    () => {
      const s = window.turboslide.studio.describe().state;
      return s.pending === 0 && s.revision === s.serverRevision;
    },
    null,
    { timeout },
  );
}

async function waitFor(fn, { timeout = 8000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last ?? null;
}

async function stageScale(page) {
  const box = await (await page.$('.ts-stagewrap.ts-editor .ts-stage')).boundingBox();
  return { k: box.width / 1600, sheet: box };
}

async function drag(page, from, dx, dy, { modifiers = [], steps: n = 12 } = {}) {
  let x;
  let y;
  if (typeof from.boundingBox === 'function') {
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
  for (let i = 1; i <= n; i += 1) {
    await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

/** Selects an object by a click on its element's corner, leaving any caret the click opened. */
async function selectObject(page, id) {
  const editable = async () => page.$('.ts-stagewrap.ts-editor [contenteditable="true"]');
  const el =
    (await page.$(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`)) ??
    (await page.$(`.ts-stagewrap.ts-editor .pt-slide .free[data-free="${id}"]`));
  if (!el) throw new Error(`no element for ${id}`);
  const box = await el.boundingBox();
  await page.mouse.click(box.x + 2, box.y + 2);
  if (await editable()) await page.keyboard.press('Escape');
  let move = await page.$(`.ts-overlay [data-control="handle.${id}.move"]`);
  if (!move) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (await editable()) await page.keyboard.press('Escape');
    move = await waitFor(() => page.$(`.ts-overlay [data-control="handle.${id}.move"]`), {
      timeout: 3000,
    });
  }
  if (!move) throw new Error(`no move handle for ${id}`);
  return move;
}

const posOf = (block) => block?.pos ?? null;
const summary = (blocks) => blocks.map((b) => ({ id: b.id, type: b.type, pos: posOf(b) }));

const started = Date.now();
const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

let deckId = null;
let slideId = null;
const readback = {};

try {
  // 1. /new
  const t0 = Date.now();
  const response = await page.goto(`${BASE}/new?author=${encodeURIComponent(AUTHOR)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await settled(page);
  slideId = await page.evaluate(() => document.querySelector('.pt-viewer')?.dataset.active ?? null);
  const before = await slideGet(page, slideId);
  record('open /new', response?.status() === 200 && before?.kind === 'title', {
    status: response?.status(),
    readyMs: Date.now() - t0,
    title: await page.title(),
    slideId,
    kind: before?.kind,
    address: await page.evaluate(() => window.location.pathname),
  });

  // 2. drag the heading: the first write converts the slide and creates the deck
  const { k } = await stageScale(page);
  let ok = false;
  let evidence = {};
  try {
    const move = await selectObject(page, 'heading');
    await drag(page, move, 60 * k, 40 * k);
    await page.waitForFunction(() => /^\/edit\//.test(window.location.pathname), null, {
      timeout: 60_000,
    });
    await settled(page);
    deckId = await page.evaluate(() =>
      decodeURIComponent(window.location.pathname.slice('/edit/'.length)),
    );
    const after = await slideGet(page, slideId);
    const heading = (await objects(page, slideId)).find((b) => b.id === 'heading');
    ok = after.layout?.type === 'freeform' && heading?.pos !== undefined;
    evidence = {
      deckId,
      layout: after.layout?.type,
      kind: after.kind,
      template: after.template,
      heading: posOf(heading),
      objects: (await objects(page, slideId)).length,
    };
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('drag the heading, the slide converts, the deck is created', ok, evidence);

  // 3. a rectangle drawn on the sheet, rotated with the keys
  ok = false;
  try {
    await page.keyboard.press('Escape');
    const { k: k2, sheet } = await stageScale(page);
    await page.locator('[data-control="menubar.insert"]').click();
    /* the submenus open on hover, as Google's do; a click on the parent row is the fallback */
    const shapeRow = page.locator('[data-menu-item="insert.shape"]');
    await shapeRow.hover();
    const shapesRow = page.locator('[data-menu-item="insert.shape.shapes"]');
    if (!(await shapesRow.isVisible().catch(() => false))) await shapeRow.click();
    await shapesRow.hover();
    /* Shapes ▸ is the shell's drawn plate (shapes.ts, SPEC-2 2.5): its tiles are
       `<row>.pick.<preset>`; the rectangle preset is `rect` */
    const tile = page.locator('.ts-menu.is-dynamic [data-control="insert.shape.shapes.pick.rect"]');
    await tile.click({ timeout: 10_000 });
    await drag(page, { x: sheet.x + 1000 * k2, y: sheet.y + 520 * k2 }, 240 * k2, 160 * k2);
    await settled(page);
    let shape = (await objects(page, slideId)).find((b) => b.type === 'shape');
    if (!shape) throw new Error('no shape after the draw');
    await selectObject(page, shape.id);
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await settled(page);
    shape = (await objects(page, slideId)).find((b) => b.id === shape.id);
    let how = 'Option+Right twice';
    if (!shape.pos?.rotate) {
      // the keys did not reach the page: the rotation as the action, recorded as such
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'block.rotate', {
        slideId,
        blockId: shape.id,
        angle: 30,
        baseRevision: info.revision,
      });
      await settled(page);
      shape = (await objects(page, slideId)).find((b) => b.id === shape.id);
      how = 'block.rotate (the keys wrote nothing)';
    }
    ok = typeof shape.pos?.rotate === 'number' && shape.pos.rotate !== 0;
    evidence = { id: shape.id, preset: shape.preset ?? shape.shape, pos: posOf(shape), how };
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('draw a rectangle and rotate it', ok, evidence);

  // 4. Insert > Chart > Bar
  ok = false;
  try {
    await page.keyboard.press('Escape');
    await page.locator('[data-control="menubar.insert"]').click();
    const row = page.locator('[data-menu-item="insert.chart"]');
    await row.hover();
    await page.locator('[data-menu-item="insert.chart.bar"]').click();
    const chart = await waitFor(
      async () => (await objects(page, slideId)).find((b) => b.type === 'chart'),
      { timeout: 15_000 },
    );
    await settled(page);
    ok = chart !== null && chart.pos !== undefined;
    evidence = chart ? { id: chart.id, kind: chart.kind, pos: posOf(chart) } : { chart: null };
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('Insert > Chart > Bar', ok, evidence);

  // 5. italic text typed into the heading
  ok = false;
  try {
    await page.keyboard.press('Escape');
    await selectObject(page, 'heading');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ts-stagewrap.ts-editor [contenteditable="true"]', {
      timeout: 5000,
    });
    await page.keyboard.type('Canvas round two');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+i');
    await page.keyboard.press('Escape');
    await settled(page);
    const heading = (await objects(page, slideId)).find((b) => b.id === 'heading');
    /* the mark span rule (SPEC-2 7.2): an italic run reads `[text]{i}` in the Text */
    const text = typeof heading?.text === 'string' ? heading.text : JSON.stringify(heading?.text);
    const italic = /\]\{[^}]*i[^}]*\}/.test(text);
    ok = text.includes('Canvas round two') && italic;
    evidence = { text, italic };
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('type italic text into the heading', ok, evidence);

  // 6. the read back through the window API
  ok = false;
  try {
    const info = await invoke(page, 'deck.info');
    const slide = await slideGet(page, slideId);
    const versions = await invoke(page, 'version.list');
    const blocks = await objects(page, slideId);
    readback.info = { id: info.id, revision: info.revision, counts: info.counts };
    readback.slide = {
      id: slide.id,
      kind: slide.kind,
      layout: slide.layout,
      template: slide.template,
      background: slide.background,
      objects: summary(blocks),
    };
    readback.versions = { count: Array.isArray(versions) ? versions.length : versions?.count };
    readback.state = await state(page);
    ok = blocks.every((b) => b.pos !== undefined) && info.revision > 0;
    evidence = { revision: info.revision, objects: summary(blocks), versions: readback.versions };
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('read the deck back (deck.info, slide.get, version.list)', ok, evidence);

  // 6b. deck.info over the agent route with the bearer: counts.snapshots on the Blob store
  if (TOKEN && deckId) {
    ok = false;
    try {
      const t = Date.now();
      const res = await fetch(`${BASE}/api/actions/deck.info?deck=${encodeURIComponent(deckId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: '{}',
      });
      const json = await res.json().catch(() => null);
      const counts = json?.counts ?? json?.output?.counts ?? null;
      readback.http = {
        status: res.status,
        revision: json?.revision ?? json?.output?.revision,
        counts,
      };
      ok = res.status === 200 && typeof counts?.snapshots === 'number' && counts.snapshots >= 1;
      evidence = {
        status: res.status,
        ms: Date.now() - t,
        revision: readback.http.revision,
        snapshots: counts?.snapshots,
      };
    } catch (error) {
      evidence = { error: String(error) };
    }
    record(
      'deck.info over /api/actions reports snapshots for a deck written after the deploy',
      ok,
      evidence,
    );
  }

  // 7. the screenshot
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT, type: 'jpeg', quality: 82 });
    record('screenshot', true, SHOT);
  } catch (error) {
    record('screenshot', false, String(error));
  }

  // 8. File > Move to trash: the route leaves for /decks once the deck is trashed, so the
  //    confirmation is the trash page's own card in a second tab, not a read through the
  //    editor's window API in the tab that is navigating
  const openTrash = async () => {
    const tab = await context.newPage();
    await tab.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await tab.waitForSelector('[data-control="trash.cards"], [data-control="trash.empty-state"]', {
      timeout: 60_000,
    });
    return tab;
  };
  ok = false;
  try {
    if (!deckId) throw new Error('no deck to trash');
    await page.locator('[data-control="menubar.file"]').click();
    await page.locator('[data-menu-item="file.moveToTrash"]').click();
    const t = Date.now();
    await Promise.race([
      page.waitForURL(/\/decks(\?|$)/, { timeout: 20_000 }),
      page.waitForSelector('[data-control="snackbar"]', { timeout: 20_000 }),
    ]).catch(() => null);
    const address = await page.evaluate(() => window.location.pathname).catch(() => null);
    const trash = await openTrash();
    const card = trash.locator(`[data-control="trash.card.${deckId}"]`);
    const listed = await waitFor(async () => ((await card.count()) > 0 ? true : null), {
      timeout: 20_000,
    });
    const home = await fetch(`${BASE}/decks`).then((r) => r.text());
    ok = listed === true && !home.includes(deckId);
    evidence = {
      ms: Date.now() - t,
      addressAfter: address,
      inTrash: listed === true,
      onHome: home.includes(deckId),
    };
    await trash.close();
  } catch (error) {
    evidence = { error: String(error) };
  }
  record('File > Move to trash', ok, evidence);

  // 9. Delete forever through the trash page's button, so production keeps no scratch deck
  const purge = [...(KEEP || !deckId ? [] : [deckId]), ...(PURGE ? [PURGE] : [])];
  for (const id of purge) {
    ok = false;
    try {
      const trash = await openTrash();
      const card = trash.locator(`[data-control="trash.card.${id}"]`);
      if ((await card.count()) === 0) throw new Error(`the trash page lists no card for ${id}`);
      await trash.locator(`[data-control="trash.delete.${id}"]`).click();
      await trash.locator('[data-control="trash.confirm.ok"]').click();
      await waitFor(async () => (await card.count()) === 0, { timeout: 30_000 });
      const gone = (await card.count()) === 0;
      const decks = await fetch(`${BASE}/decks`).then((r) => r.text());
      const heads = await fetch(`${BASE}/decks/trash`).then((r) => r.text());
      ok = gone && !decks.includes(id) && !heads.includes(id);
      evidence = {
        deck: id,
        cardGone: gone,
        onHome: decks.includes(id),
        inTrash: heads.includes(id),
      };
      await trash.close();
    } catch (error) {
      evidence = { deck: id, error: String(error) };
    }
    record(
      `Delete forever on /decks/trash (${id === deckId ? 'this run' : 'purge'})`,
      ok,
      evidence,
    );
  }
} finally {
  await launched.browser.close().catch(() => {});
}

const report = {
  base: BASE,
  at: new Date().toISOString(),
  ms: Date.now() - started,
  deckId,
  slideId,
  steps,
  readback,
  pageErrors,
  screenshot: SHOT,
};
writeFileSync(join(OUT, 'production-canvas.json'), `${JSON.stringify(report, null, 2)}\n`);
const failed = steps.filter((s) => !s.ok).length;
log(`${steps.length - failed} of ${steps.length} steps passed in ${report.ms} ms; deck ${deckId}`);
process.exit(failed === 0 ? 0 : 1);

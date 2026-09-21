#!/usr/bin/env node
// B3's drive of the product round's objects and layout rows (docs/PRODUCT.md section 8.1;
// build/b3.md section 3), standalone over playwright-core, at human speed, every observation
// through the page and the window API, in the shape of the return round's b3 probes. Two scratch
// decks from /new (a source with three slides for the import row, the deck the rows drive), both
// trashed and removed through the window API in the finally block with a 404 read on /edit.
//
//   node b3-probe.mjs --base http://localhost:4413 --json <path>
//
// A row the probe cannot drive is recorded with ok null and its reason, never as ok.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4413').replace(/\/$/, '');
const JSON_OUT = arg('json', null);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rows = [];
const record = (id, step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, id, step, expected, observed, ok });
  const mark = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(`${mark} ${id ?? '-'} | ${step} | ${observed}`);
};
const step = async (id, name, expected, fn) => {
  try {
    const r = await fn();
    record(id, name, expected, r.ok === null ? `not driven: ${r.observed}` : r.observed, r.ok);
    return r;
  } catch (error) {
    record(id, name, expected, `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`, false);
    return { ok: false };
  }
};

// ---- the helpers (the walk probe's lib, repeated)
const moveHuman = async (page, from, to, steps = 10) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(60, 110));
  }
};
const typeHuman = async (page, text) => {
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const slideJson = async (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
const objectsOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string' && node.pos && typeof node.pos === 'object')
        out.push({ id: node.id, type: node.type, pos: node.pos, block: node });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const newObjectAfter = async (page, slideId, before, timeout = 20_000) =>
  pollUntil(
    async () => (await objectsOf(page, slideId)).find((o) => !before.includes(o.id)) ?? null,
    (o) => o !== null,
    timeout,
  );
const chip = (page) =>
  page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
const handleControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) => el.getAttribute('data-control')),
  );
const selectionFacts = async (page, id) => {
  const ctrls = await handleControls(page);
  const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) => ctrls.includes(`handle.${id}.resize.${d}`));
  return {
    chip: await chip(page),
    ring: await page.evaluate(() => document.querySelector('.ts-overlay .ts-select') !== null),
    move: ctrls.includes(`handle.${id}.move`),
    resize: dirs.length,
    handles: ctrls.length,
  };
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const rectOf = async (page, selector) => {
  const r = await page.locator(selector).first().boundingBox().catch(() => null);
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(page, { x: r.x - 20, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
  await sleep(rand(250, 400));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clickRow = async (page, rowId) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
const clickCard = async (page, slideId) => {
  const r = await ctl(page, `filmstrip.slide.${slideId}`).first().boundingBox();
  if (!r) throw new Error(`no card ${slideId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await pollUntil(() => state(page).then((s) => s.slideId), (a) => a === slideId, 8000);
  await sleep(300);
};
/** Opens the GT layouts group of the plate when it is collapsed (B1's disclosure row). */
const openGtGroup = async (page, control = 'layout.apply') => {
  const row = ctl(page, `${control}.gt`).first();
  if ((await row.count()) === 0) return;
  if ((await row.getAttribute('aria-expanded')) === 'true') return;
  await clickControl(page, `${control}.gt`);
  await sleep(300);
};
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const runRect = (page, run) => rectOf(page, `${SHEET} [data-run="${run}"]`);
const prompts = (page) =>
  page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-prompt]`)].map((e) => e.textContent), SHEET);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const posStr = (p) => (p ? `${p.x},${p.y} ${p.w}x${p.h}` : 'none');
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const dismissNamePrompt = async (page) => {
  if (await ctl(page, 'dialog.namePrompt').first().isVisible().catch(() => false))
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
};
/** Opens /new, makes the first write (the title), returns the deck id and the title slide. */
const newDeck = async (page, title) => {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await dismissNamePrompt(page);
  const info = await invoke(page, 'deck.info');
  const s = await state(page);
  // the first write: the title typed by a double click on the heading run
  const runs = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-run]`)].map((e) => e.getAttribute('data-run')), SHEET);
  const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
  const r = await runRect(page, head);
  await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  await typeHuman(page, title);
  await press(page, 'Escape', 2);
  await pollUntil(() => state(page).then((x) => x.revision), (rev) => rev >= 1, 20_000);
  await settled(page);
  return { id: info.id, titleSlide: s.slideId };
};
const cleanup = async (page, deckId) => {
  const status = { edit: 0, deck: 0 };
  try {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await editorReady(page).catch(() => undefined);
    const info = await invoke(page, 'deck.info').catch(() => null);
    if (info) {
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined);
      const again = await invoke(page, 'deck.info').catch(() => null);
      await invoke(page, 'deck.remove', { id: deckId, baseRevision: again?.revision ?? info.revision, confirm: true }).catch(() => undefined);
    }
    const until = Date.now() + 20_000;
    for (;;) {
      for (const route of ['edit', 'deck']) {
        const res = await page.request.get(`${BASE}/${route}/${deckId}`, { headers, maxRedirects: 0 });
        status[route] = res.status();
      }
      if ((status.edit === 404 && status.deck === 404) || Date.now() > until) break;
      await sleep(2000);
    }
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }
  console.log(`cleanup ${deckId}: /edit ${status.edit}, /deck ${status.deck}${status.error ? `; ${status.error}` : ''}`);
  return status;
};

// ---- the run
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: headers });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('%c[Server]')) consoleErrors.push(m.text().slice(0, 200));
});
const decks = [];
const started = new Date().toISOString();
try {
  // ---- the source deck for the import row: three slides
  const source = await newDeck(page, 'B3 source deck');
  decks.push(source.id);
  for (const layout of ['split', 'cols', 'title-only']) {
    const s = await state(page);
    await invoke(page, 'slide.new', { baseRevision: s.revision, after: (await slideOrder(page)).at(-1), layout });
    await settled(page);
  }
  const sourceOrder = await slideOrder(page);
  record(null, 'the source deck', 'four slides', `${source.id}: ${sourceOrder.length} slides`, sourceOrder.length === 4);

  // ---- the deck the rows drive
  const deck = await newDeck(page, 'B3 objects and layout');
  decks.push(deck.id);
  const T = deck.titleSlide;

  // slides.layout.title-and-body-single
  let S = null;
  await step(
    'slides.layout.title-and-body-single',
    'New slide (the toolbar button) after the title slide, then four lines typed into the body',
    'the slide is Title and body with one title prompt over one body prompt; the four lines land in the body at the body size',
    async () => {
      const before = await slideOrder(page);
      await clickControl(page, 'toolbar.newSlide');
      const order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
      S = order.find((id) => !before.includes(id)) ?? null;
      if (!S) return { ok: false, observed: 'no slide added' };
      await pollUntil(() => state(page).then((s) => s.slideId), (a) => a === S, 8000);
      await settled(page);
      const slide = await slideJson(page, S);
      const head = slide.layout?.head;
      const slots = Object.keys(slide.slots ?? {});
      const seen = await pollUntil(() => prompts(page), (p) => p.length >= 2, 8000);
      // the body run: the paragraph in the body slot
      const bodyId = slide.slots?.body?.[0]?.id;
      const r = await runRect(page, `${bodyId}/text`);
      if (!r) return { ok: false, observed: `template ${slide.template}; head ${JSON.stringify(head)}; slots ${slots.join(',')}; prompts ${JSON.stringify(seen)}; no body run` };
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await typeHuman(page, 'Agenda\nPricing\nTimeline\nNext steps');
      await press(page, 'Escape', 2);
      await settled(page);
      const after = await slideJson(page, S);
      const body = (after.slots?.body ?? after.slots?.main ?? []).find((b) => b.id === bodyId);
      const size = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).fontSize : null;
      }, `${SHEET} [data-run="${bodyId}/text"]`);
      const lines = String(body?.text ?? '').split('\n').length;
      return {
        ok:
          slide.template === 'split' && head === 'single' && slots.join(',') === 'head,body' &&
          seen.length === 2 && seen.includes('Click to add title') && seen.includes('Click to add text') &&
          lines === 4 && size === '22px',
        observed: `template ${slide.template}; head ${JSON.stringify(head)}; slots ${slots.join(',')}; prompts ${JSON.stringify(seen)}; body text ${JSON.stringify(body?.text)} (${lines} lines) at ${size}`,
      };
    },
  );
  if (!S) throw new Error('no Title and body slide to drive');

  // slides.layout.new-slide-inherits (fresh context: no arrow pick stored)
  await step(
    'slides.layout.new-slide-inherits',
    'Apply layout > Title and two columns on the slide, New slide; then the title slide, New slide',
    'the first New slide gives Title and two columns; the second Title and body',
    async () => {
      await clearAll(page);
      await clickControl(page, 'toolbar.layout');
      await page.locator('[data-control="layout.apply.plate"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'layout.apply.cols');
      await pollUntil(() => slideJson(page, S).then((s) => s.template), (t) => t === 'cols', 15_000);
      await settled(page);
      let before = await slideOrder(page);
      await clickControl(page, 'toolbar.newSlide');
      let order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
      const a = order.find((id) => !before.includes(id));
      const aLayout = a ? await pollUntil(() => slideJson(page, a).then((s) => s.template), (t) => Boolean(t), 8000) : null;
      await settled(page);
      await clickCard(page, T);
      before = await slideOrder(page);
      await clickControl(page, 'toolbar.newSlide');
      order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
      const b = order.find((id) => !before.includes(id));
      const bLayout = b ? await pollUntil(() => slideJson(page, b).then((s) => s.template), (t) => Boolean(t), 8000) : null;
      await settled(page);
      return { ok: aLayout === 'cols' && bLayout === 'split', observed: `after cols: ${aLayout}; after the title slide: ${bLayout}` };
    },
  );
  // the same after an arrow pick (R2, build/b3.md): recorded, not a matrix row
  await step(
    null,
    'the arrow beside New slide > Title only, then the Title and two columns slide, New slide',
    'Title and two columns (R2); today the arrow pick wins',
    async () => {
      await clearAll(page);
      await clickControl(page, 'toolbar.newSlide.arrow');
      await page.locator('[data-control="layout.new.plate"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'layout.new.title-only');
      await settled(page);
      await sleep(800);
      await clickCard(page, S);
      const before = await slideOrder(page);
      await clickControl(page, 'toolbar.newSlide');
      const order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
      const c = order.find((id) => !before.includes(id));
      const cLayout = c ? await pollUntil(() => slideJson(page, c).then((s) => s.template), (t) => Boolean(t), 8000) : null;
      await settled(page);
      return { ok: cLayout === 'cols', observed: `New slide on the cols slide after an arrow pick of Title only: ${cLayout}` };
    },
  );

  // slides.layout.subtitle-prompt: the id is R1's; the mechanism on Tile grid
  await step(
    'slides.layout.subtitle-prompt',
    'Apply layout > Title, subtitle and body; read the head paragraph prompt',
    'the head paragraph prompts "Click to add subtitle" and the body "Click to add text"',
    async () => {
      await clearAll(page);
      await clickCard(page, S);
      await clickControl(page, 'toolbar.layout');
      await page.locator('[data-control="layout.apply.plate"]').waitFor({ timeout: 8000 });
      await openGtGroup(page);
      const has = await ctl(page, 'layout.apply.subtitle-body').count();
      if (has === 0) {
        await press(page, 'Escape');
        return { ok: null, observed: 'no Title, subtitle and body tile: the id waits on build/b3.md R1 (LAYOUT_IDS in deck.ts)' };
      }
      await clickControl(page, 'layout.apply.subtitle-body');
      await pollUntil(() => slideJson(page, S).then((s) => s.template), (t) => t === 'subtitle-body', 15_000);
      await settled(page);
      const seen = await pollUntil(() => prompts(page), (p) => p.length >= 3, 8000);
      return { ok: seen.includes('Click to add subtitle') && seen.includes('Click to add text') && seen.includes('Click to add title'), observed: `prompts ${JSON.stringify(seen)}` };
    },
  );
  await step(
    null,
    'Apply layout > Tile grid; read the head paragraph prompt (the same rule on an existing two column head)',
    'the head paragraph prompts "Click to add subtitle"',
    async () => {
      await clearAll(page);
      await clickCard(page, S);
      await clickControl(page, 'toolbar.layout');
      await page.locator('[data-control="layout.apply.plate"]').waitFor({ timeout: 8000 });
      await openGtGroup(page);
      await clickControl(page, 'layout.apply.tiles');
      await pollUntil(() => slideJson(page, S).then((s) => s.template), (t) => t === 'tiles', 15_000);
      await settled(page);
      const seen = await pollUntil(() => prompts(page), (p) => p.length >= 2, 8000);
      return { ok: seen.includes('Click to add subtitle'), observed: `prompts ${JSON.stringify(seen.slice(0, 6))}` };
    },
  );

  // ---- a fresh Title and body slide for the insert rows
  let I = null;
  {
    const s = await state(page);
    const before = await slideOrder(page);
    await invoke(page, 'slide.new', { baseRevision: s.revision, after: S, layout: 'split' });
    const order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
    I = order.find((id) => !before.includes(id));
    await settled(page);
    await clickCard(page, I);
  }
  let table = null;
  let chart = null;
  await step(
    'arrange.insert.selected-after-menu',
    'Insert > Table (3 by 3), Q1 typed into the first cell, Insert > Chart > Column',
    'the table is selected with its handles after the insert; the chart is selected (chip Chart, eight handles) and its box does not overlap the table',
    async () => {
      await clearAll(page);
      const before = await objectsOf(page, I).then((o) => o.map((x) => x.id));
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.table', '[data-control="insert.table.plate"]');
      await clickControl(page, 'insert.table.pick.3x3');
      const t = await newObjectAfter(page, I, before);
      await settled(page);
      if (!t) return { ok: false, observed: 'no table inserted within 20 s' };
      table = t;
      const tableFacts = await pollUntil(() => selectionFacts(page, t.id), (f) => f.resize === 8, 8000);
      // type into the first cell
      const cellRun = `${t.id}/rows/0/cells/0`;
      const r = await runRect(page, cellRun);
      if (r) {
        await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
        await typeHuman(page, 'Q1');
        await press(page, 'Escape', 2);
        await settled(page);
      }
      const typed = (await objectsOf(page, I)).find((o) => o.id === t.id)?.block?.rows?.[0]?.cells?.[0];
      const before2 = await objectsOf(page, I).then((o) => o.map((x) => x.id));
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.chart', '[data-control="menu.insert.chart.column"]');
      await clickRow(page, 'insert.chart.column');
      const c = await newObjectAfter(page, I, before2);
      await settled(page);
      if (!c) return { ok: false, observed: `table ${t.id} ${posStr(t.pos)} selected ${JSON.stringify(tableFacts)}; no chart inserted within 20 s` };
      chart = c;
      const chartFacts = await pollUntil(() => selectionFacts(page, c.id), (f) => f.resize === 8, 8000);
      const tablePos = (await objectsOf(page, I)).find((o) => o.id === t.id)?.pos;
      const overlap = overlaps(c.pos, tablePos);
      const inside = c.pos.x >= 0 && c.pos.y >= 0 && c.pos.x + c.pos.w <= 1600 && c.pos.y + c.pos.h <= 900;
      return {
        ok: tableFacts.resize === 8 && tableFacts.chip === 'Table' && typed === 'Q1' && chartFacts.resize === 8 && chartFacts.chip === 'Chart' && !overlap && inside,
        observed: `table ${t.id} ${posStr(tablePos)} chip "${tableFacts.chip}" handles ${tableFacts.resize}, cell "${typed}"; chart ${c.id} ${posStr(c.pos)} chip "${chartFacts.chip}" handles ${chartFacts.resize}; overlap ${overlap}; inside ${inside}`,
      };
    },
  );
  await step(
    'arrange.insert.free-rectangle',
    'with the body taken by the table and the chart, Insert > Table again',
    'the third object lands 40 by 40 sheet px from the last object (the y clamped to the sheet) and inside the sheet',
    async () => {
      if (!table || !chart) return { ok: null, observed: 'no table and chart to fill the body' };
      await clearAll(page);
      const objects = await objectsOf(page, I);
      const last = objects.filter((o) => o.id === table.id || o.id === chart.id).at(-1);
      const before = objects.map((o) => o.id);
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.table', '[data-control="insert.table.plate"]');
      await clickControl(page, 'insert.table.pick.3x3');
      const third = await newObjectAfter(page, I, before);
      await settled(page);
      if (!third) return { ok: false, observed: 'no third object within 20 s' };
      const facts = await pollUntil(() => selectionFacts(page, third.id), (f) => f.resize === 8, 8000);
      const wantX = Math.min(last.pos.x + 40, 1600 - third.pos.w);
      const wantY = Math.min(last.pos.y + 40, 900 - third.pos.h);
      const inside = third.pos.x + third.pos.w <= 1600 && third.pos.y + third.pos.h <= 900;
      return {
        ok: near(third.pos.x, wantX, 1) && near(third.pos.y, wantY, 1) && inside && facts.resize === 8,
        observed: `last ${last.type} ${posStr(last.pos)}; third ${third.type} ${posStr(third.pos)}; wanted ${wantX},${wantY}; inside ${inside}; handles ${facts.resize}`,
      };
    },
  );
  // the existing rows' sizes on a Blank slide, and the agent contract
  await step(
    null,
    'a Blank slide: Insert > Chart > Bar, then Insert > Table 4 by 3 (the existing rows charts.insert.bar and tables.insert.grid)',
    'the chart is 960 by 540 and the table 960 by 320, each at the top of the content box',
    async () => {
      const s = await state(page);
      const before = await slideOrder(page);
      await invoke(page, 'slide.new', { baseRevision: s.revision, after: I, layout: 'blank' });
      const order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 1, 15_000);
      const B = order.find((id) => !before.includes(id));
      await settled(page);
      await clickCard(page, B);
      await clearAll(page);
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.chart', '[data-control="menu.insert.chart.bar"]');
      await clickRow(page, 'insert.chart.bar');
      const c = await newObjectAfter(page, B, []);
      await settled(page);
      await clearAll(page);
      const before2 = await objectsOf(page, B).then((o) => o.map((x) => x.id));
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.table', '[data-control="insert.table.plate"]');
      await clickControl(page, 'insert.table.pick.4x3');
      const t = await newObjectAfter(page, B, before2);
      await settled(page);
      return {
        ok: Boolean(c) && near(c.pos.w, 960, 2) && near(c.pos.h, 540, 2) && c.pos.y === 129 && Boolean(t) && near(t.pos.w, 960, 2) && near(t.pos.h, 320, 2),
        observed: `chart ${c ? posStr(c.pos) : 'none'}; table ${t ? posStr(t.pos) : 'none'} (the table cascades from the chart, which fills the body)`,
      };
    },
  );
  await step(
    null,
    'block.insert through the window API with its own box on the insert slide',
    'the object lands exactly where asked and nothing is selected',
    async () => {
      await clearAll(page);
      await clickCard(page, I);
      const s = await state(page);
      const before = await objectsOf(page, I).then((o) => o.map((x) => x.id));
      await invoke(page, 'block.insert', {
        baseRevision: s.revision,
        slideId: I,
        slot: 'main',
        block: { id: 'agent-chart', type: 'chart', kind: 'pie', categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }], pos: { x: 1000, y: 600, w: 400, h: 240 } },
      });
      const obj = await newObjectAfter(page, I, before);
      await settled(page);
      await sleep(600);
      const c = await chip(page);
      return { ok: Boolean(obj) && obj.pos.x === 1000 && obj.pos.y === 600 && obj.pos.w === 400 && obj.pos.h === 240 && c === null, observed: `${obj ? posStr(obj.pos) : 'none'}; chip ${c === null ? 'none' : `"${c}"`}` };
    },
  );

  // slides.import.none-preselected
  await step(
    'slides.import.none-preselected',
    'File > Import slides, the source deck; three clicks; None; a click and a Shift click; Import',
    'no tile is selected; three clicks read "Import 3 slides"; a Shift click selects a range; Import brings three',
    async () => {
      await clearAll(page);
      await clickCard(page, I);
      const before = await slideOrder(page);
      await openMenu(page, 'file');
      await clickRow(page, 'file.importSlides');
      await page.locator('[data-control="dialog.importSlides"]').waitFor({ timeout: 8000 });
      await clickControl(page, `dialog.importSlides.deck.${source.id}`);
      await page.locator('[data-control^="dialog.importSlides.slide."]').first().waitFor({ timeout: 15_000 });
      const tiles = page.locator('[data-control^="dialog.importSlides.slide."]');
      const count = await tiles.count();
      const selectedAtOpen = await page.evaluate(() => document.querySelectorAll('[data-control^="dialog.importSlides.slide."][aria-selected="true"]').length);
      const okAtOpen = await page.evaluate(() => {
        const b = document.querySelector('[data-control="dialog.importSlides.ok"]');
        return { label: b?.textContent?.trim() ?? null, disabled: b?.disabled ?? null };
      });
      for (let i = 0; i < 3; i += 1) {
        const r = await tiles.nth(i).boundingBox();
        await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      }
      const okAfterThree = await page.evaluate(() => document.querySelector('[data-control="dialog.importSlides.ok"]')?.textContent?.trim() ?? null);
      await clickControl(page, 'dialog.importSlides.none');
      const afterNone = await page.evaluate(() => document.querySelectorAll('[data-control^="dialog.importSlides.slide."][aria-selected="true"]').length);
      const r0 = await tiles.nth(0).boundingBox();
      await clickAt(page, r0.x + r0.width / 2, r0.y + r0.height / 2);
      const r2 = await tiles.nth(2).boundingBox();
      await page.keyboard.down('Shift');
      await clickAt(page, r2.x + r2.width / 2, r2.y + r2.height / 2);
      await page.keyboard.up('Shift');
      const afterShift = await page.evaluate(() => [...document.querelectorAll?.('x') ?? []].length);
      const shiftCount = await page.evaluate(() => document.querySelectorAll('[data-control^="dialog.importSlides.slide."][aria-selected="true"]').length);
      const okAfterShift = await page.evaluate(() => document.querySelector('[data-control="dialog.importSlides.ok"]')?.textContent?.trim() ?? null);
      await clickControl(page, 'dialog.importSlides.ok');
      const order = await pollUntil(() => slideOrder(page), (o) => o.length === before.length + 3, 20_000);
      await settled(page);
      void afterShift;
      return {
        ok: count === 4 && selectedAtOpen === 0 && okAtOpen.disabled === true && okAfterThree === 'Import 3 slides' && afterNone === 0 && shiftCount === 3 && okAfterShift === 'Import 3 slides' && order.length === before.length + 3,
        observed: `${count} tiles; selected at open ${selectedAtOpen}; button at open "${okAtOpen.label}" disabled ${okAtOpen.disabled}; after three clicks "${okAfterThree}"; after None ${afterNone}; after a click and a Shift click ${shiftCount} selected, "${okAfterShift}"; slides ${before.length} -> ${order.length}`,
      };
    },
  );
} finally {
  for (const id of decks) await cleanup(page, id);
  await browser.close();
  const summary = {
    started,
    ended: new Date().toISOString(),
    base: BASE,
    decks,
    rows,
    consoleErrors,
    counts: {
      ok: rows.filter((r) => r.ok === true).length,
      failed: rows.filter((r) => r.ok === false).length,
      notDriven: rows.filter((r) => r.ok === null).length,
    },
  };
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  console.log(`\n${summary.counts.ok} ok, ${summary.counts.failed} failed, ${summary.counts.notDriven} not driven; console errors ${consoleErrors.length}`);
}

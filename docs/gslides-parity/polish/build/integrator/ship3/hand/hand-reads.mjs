#!/usr/bin/env node
// The ship step's third attempt: the integrator's hand reads on the memory tier of the rows the
// local gate's walk read red on the cut third run (slides.delete.two-selected-key-undo,
// logos.tailor.find-customer-logo, assist.tailor.dialog-one-undo, shaders.panel.kit-colours),
// the versions.window-mark-column driver fix, and the name plate's placeholder (item 63), the way
// a seller drives them (the mouse in steps, 40 to 90 ms per key, a pause to read a snackbar or a
// dialog line before the next click), a picture after every action worth judging, on scratch
// decks from /new that the finally block trashes and removes. Reads nothing from the repository
// but playwright-core. Usage:
//   node hand-reads.mjs --base http://localhost:4448 --shots <dir> --json <path> [--only h1,h4]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-live/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4448').replace(/\/$/, '');
const SHOTS = arg('shots', path.dirname(new URL(import.meta.url).pathname));
const JSON_OUT = arg('json', path.join(SHOTS, 'hand-reads.json'));
const ONLY = arg('only', null)?.split(',') ?? null;
const OIDC = /vercel\.app/.test(BASE) ? process.env.VERCEL_OIDC_TOKEN : undefined;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const decks = [];
const record = (name, expected, observed, ok, shot, ms) => {
  const row = { n: rows.length + 1, name, expected, observed: String(observed), ok, shot, ms };
  rows.push(row);
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(2)} ${name}\n      expected: ${expected}\n      observed: ${row.observed}${shot ? `\n      shot: ${shot}` : ''}`,
  );
  return row;
};

// ---------------------------------------------------------------------------------------------
// human speed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(60, 110));
  }
};
const moveHuman = async (page, from, to, steps = 8) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
  await sleep(rand(160, 260));
};
const shiftClickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
  await sleep(rand(200, 320));
};

// ---------------------------------------------------------------------------------------------
// the product

const ctl = (page, control) => page.locator(`[data-control="${control}"]`).first();
const rectOf = async (page, selector) => {
  const r = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
};
const clickControl = async (page, control) => {
  const el = ctl(page, control);
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const visible = (page, control) =>
  ctl(page, control)
    .isVisible()
    .catch(() => false);
const textOf = (page, control) =>
  page.evaluate(
    (c) => document.querySelector(`[data-control="${c}"]`)?.textContent?.trim() ?? null,
    control,
  );
const waitControl = (page, control, timeout = 8000) => ctl(page, control).waitFor({ timeout });
const waitGone = async (page, control, timeout = 8000) => {
  await ctl(page, control)
    .waitFor({ state: 'hidden', timeout })
    .catch(() => undefined);
  return !(await visible(page, control));
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
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const slideJson = (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
const objectsOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      if (
        typeof node.id === 'string' &&
        typeof node.type === 'string' &&
        node.pos &&
        typeof node.pos === 'object'
      )
        out.push({ id: node.id, type: node.type, pos: node.pos, block: node });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
const cards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((el) => ({
      id:
        el.getAttribute('data-id') ??
        el.getAttribute('data-control').replace('filmstrip.slide.', ''),
      selected: el.getAttribute('aria-selected') === 'true',
      current: el.getAttribute('aria-current') === 'true',
      skipped: el.hasAttribute('data-skip'),
    })),
  );
const cardCenter = async (page, slideId) => {
  await ctl(page, `filmstrip.slide.${slideId}`)
    .scrollIntoViewIfNeeded({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(120);
  const r = await rectOf(page, `[data-control="filmstrip.slide.${slideId}"]`);
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
};
const clickCard = async (page, slideId) => {
  const c = await cardCenter(page, slideId);
  if (!c) throw new Error(`no filmstrip card ${slideId}`);
  await clickAt(page, c.x, c.y);
  await pollUntil(cards.bind(null, page), (l) => l.find((x) => x.id === slideId)?.current, 3000);
  return c;
};
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
        .map((e) => e.textContent?.trim() ?? '')
        .find((x) => x !== '') ?? null,
  );
const menuRoot = (id) => `#ts-menu-${id}, [data-menu="${id}"], [id^="ts-menu-${id}"]`;
const openMenu = async (page, id) => {
  const r = await rectOf(page, `[data-control="menubar.${id}"]`);
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  await page
    .locator(`${menuRoot(id)} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 6000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const closeMenus = async (page) => {
  await press(page, 'Escape');
  if ((await page.locator('[id^="ts-menu-"]:visible, .ts-context-menu:visible').count()) > 0)
    await press(page, 'Escape');
};
const hoverRow = async (page, rowId, childControl) => {
  const r = await rectOf(page, `[data-control="menu.${rowId}"]`);
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.h / 2 },
    { x: r.x + r.w / 2, y: r.y + r.h / 2 },
    6,
  );
  await sleep(rand(250, 400));
  const child = `[data-control="menu.${childControl}"], [data-control="${childControl}"]`;
  const shown = await page
    .locator(child)
    .first()
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    await sleep(rand(300, 450));
    await page.locator(child).first().waitFor({ timeout: 4000 });
  }
};
const clickRow = async (page, rowId) => {
  const r = await rectOf(page, `[data-control="menu.${rowId}"]`);
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
};
const menuPath = async (page, menuId, ...rowIds) => {
  await openMenu(page, menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1) await hoverRow(page, rowIds[i], rowIds[i + 1]);
  await clickRow(page, rowIds[rowIds.length - 1]);
};
const rowPresent = async (page, menuId, rowId) => {
  await openMenu(page, menuId);
  const there = await visible(page, `menu.${rowId}`);
  await closeMenus(page);
  return there;
};
const advancedOn = async (page) => (await state(page)).settings?.advancedTools === true;
/** Tools > Advanced tools on when the row named is not in the default view; answers whether it switched. */
const reachRow = async (page, menuId, rowId) => {
  if (await rowPresent(page, menuId, rowId)) return { present: true, switched: false };
  await menuPath(page, 'tools', 'tools.advancedTools');
  await pollUntil(
    () => advancedOn(page),
    (x) => x === true,
    8000,
  );
  await sleep(400);
  return { present: await rowPresent(page, menuId, rowId), switched: true };
};
const advancedBack = async (page) => {
  if (!(await advancedOn(page))) return;
  await menuPath(page, 'tools', 'tools.advancedTools');
  await pollUntil(
    () => advancedOn(page),
    (x) => x === false,
    8000,
  );
};
const newSlide = async (page, after, layout = 'blank') => {
  const before = await slideOrder(page);
  const s = await state(page);
  await invoke(page, 'slide.new', {
    baseRevision: s.revision,
    ...(after ? { after } : {}),
    layout,
  });
  const order = await pollUntil(
    () => slideOrder(page),
    (o) => o.length === before.length + 1,
    20_000,
  );
  await settled(page);
  return order.find((x) => !before.includes(x)) ?? null;
};
const placeBlock = async (page, slideId, block, slot = 'main') => {
  const before = (await objectsOf(page, slideId)).map((o) => o.id);
  const s = await state(page);
  await invoke(page, 'block.insert', { baseRevision: s.revision, slideId, slot, block });
  const obj = await pollUntil(
    () => objectsOf(page, slideId),
    (l) => l.some((o) => !before.includes(o.id)),
    15_000,
  ).then((l) => l.find((o) => o.id === block.id) ?? l.find((o) => !before.includes(o.id)) ?? null);
  await settled(page);
  return obj;
};
const assetOf = async (page, id) => {
  if (!id) return null;
  const s = await state(page).catch(() => null);
  const assets = s?.assets ?? {};
  return Array.isArray(assets) ? (assets.find((a) => a.id === id) ?? null) : (assets[id] ?? null);
};

// ---------------------------------------------------------------------------------------------
// the decks

const newDeck = async (page) => {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  /* the first write makes the deck and moves the address to /edit/<id> (apps/studio/e2e/core/lib.ts
     newDeck): the heading run typed over at a human pace; the first form of this script waited for
     the address with no write and timed out on the ship step's third attempt */
  const run = await page.evaluate(() => {
    const runs = [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? '');
    return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
  });
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await sleep(200);
  await page.keyboard.press('Meta+a');
  await typeHuman(page, 'Hand reads');
  await sleep(250);
  await page.keyboard.press('Escape');
  await page.waitForURL((u) => /\/edit\//.test(u.pathname), { timeout: 60_000 });
  await editorReady(page);
  const id = page.url().split('/edit/')[1]?.split(/[?#]/)[0];
  decks.push({ id, trashed: false, removed: false, status: null });
  return id;
};
const teardown = async (page, id) => {
  const entry = decks.find((d) => d.id === id);
  try {
    await page.goto(`${BASE}/edit/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await editorReady(page).catch(() => undefined);
    const info = await invoke(page, 'deck.info').catch(() => null);
    if (info) {
      await invoke(page, 'deck.trash', { id, baseRevision: info.revision }).catch(() => undefined);
      if (entry) entry.trashed = true;
      const t = await invoke(page, 'deck.info').catch(() => null);
      await invoke(page, 'deck.remove', {
        id,
        baseRevision: t?.revision ?? info.revision,
        confirm: true,
      }).catch(() => undefined);
      if (entry) entry.removed = true;
    }
  } catch {
    /* the status probe below tells the truth */
  }
  const res = await page
    .context()
    .request.get(`${BASE}/edit/${id}`, { maxRedirects: 0 })
    .catch(() => null);
  if (entry) entry.status = res ? res.status() : null;
};

let shotN = 0;
const shot = async (page, name, clip) => {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page
    .screenshot({ path: path.join(SHOTS, file), ...(clip ? { clip } : {}) })
    .catch(() => undefined);
  return file;
};
const want = (key) => ONLY === null || ONLY.includes(key);

// ---------------------------------------------------------------------------------------------
// the reads

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  extraHTTPHeaders: headers,
});
const page = await context.newPage();
context.on('page', (p) => p.close().catch(() => undefined));
const startedAt = new Date().toISOString();
let deckA = null;
let deckB = null;

try {
  // ---- H1 slides.delete.two-selected-key-undo, then H2 the version history window by hand
  if (want('h1') || want('h2')) {
    deckA = await newDeck(page);
    let last = (await slideOrder(page)).at(-1) ?? null;
    for (let i = 0; i < 3; i += 1) last = (await newSlide(page, last, 'blank')) ?? last;
    await settled(page);
    if (want('h1')) {
      const t0 = Date.now();
      let s = null;
      try {
        const before = await slideOrder(page);
        await clickCard(page, before[1]);
        const c = await cardCenter(page, before[2]);
        await shiftClickAt(page, c.x, c.y);
        await sleep(500);
        const sel = (await cards(page)).filter((x) => x.selected).map((x) => x.id);
        s = await shot(page, 'h1-two-selected');
        await press(page, 'Delete');
        const tDel = Date.now();
        const gone = await pollUntil(
          () => slideOrder(page),
          (o) => o.length === before.length - 2,
          10_000,
        );
        const goneMs = Date.now() - tDel;
        const snack = await pollUntil(
          () => snackbar(page),
          (x) => x !== null,
          5000,
        );
        await sleep(rand(700, 1000));
        s = await shot(page, 'h1-after-delete-snackbar');
        const undoThere = await visible(page, 'snackbar.action');
        if (undoThere) await clickControl(page, 'snackbar.action');
        const tUndo = Date.now();
        const back = await pollUntil(
          () => slideOrder(page),
          (o) => o.length === before.length,
          20_000,
        );
        const backMs = Date.now() - tUndo;
        let late = null;
        if (back.length !== before.length) {
          late = await pollUntil(
            () => slideOrder(page),
            (o) => o.length === before.length,
            15_000,
          );
        }
        s = await shot(page, 'h1-after-undo');
        await settled(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await editorReady(page);
        const order = await slideOrder(page);
        const ok =
          sel.length === 2 &&
          gone.length === before.length - 2 &&
          same(back, before) &&
          same(order, before);
        record(
          'h1 slides.delete.two-selected-key-undo',
          'two cards selected, Delete: both leave; the snackbar Undo: both return in the old order; the same order after a reload',
          `selected ${sel.join(', ')}; ${before.length} -> ${gone.length} (${goneMs} ms; snackbar "${snack ?? 'none'}", Undo ${undoThere}) -> ${back.length} ${backMs} ms after Undo${same(back, before) ? ', the old order' : `, order ${back.join(', ')}`}${late ? `; a later read (15 s more) ${late.length}` : ''}; after reload ${same(order, before) ? 'the same order' : order.join(', ')}`,
          ok,
          s,
          Date.now() - t0,
        );
      } catch (error) {
        record(
          'h1 slides.delete.two-selected-key-undo',
          'both leave, both return',
          `error: ${String(error).split('\n')[0]}`,
          false,
          s,
          Date.now() - t0,
        );
      }
    }
    if (want('h2')) {
      const t0 = Date.now();
      let s = null;
      try {
        await press(page, 'Escape', 2);
        await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
        await waitControl(page, 'panel.versionHistory', 8000);
        await sleep(rand(800, 1200));
        const facts = await page.evaluate(() => {
          const panel = document.querySelector('[data-control="panel.versionHistory"]');
          const pr = panel?.getBoundingClientRect();
          const windows = [...document.querySelectorAll('[data-control^="versionHistory.window."]')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => ({
              control: el.getAttribute('data-control'),
              expanded: el.getAttribute('aria-expanded'),
            }));
          const list = document.querySelector('.ts-versions-list.is-window');
          const lr = list?.getBoundingClientRect();
          const cs = list ? getComputedStyle(list) : null;
          const marks = list
            ? [
                ...list.querySelectorAll(
                  '.ts-presence-chip, .ts-version-mark, [data-control$=".pick"] .ts-chip',
                ),
              ]
                .slice(0, 3)
                .map((el) => Math.round((el.getBoundingClientRect().left - pr.left) * 10) / 10)
            : [];
          return {
            panelWidth: pr ? Math.round(pr.width) : null,
            windows,
            listShown: Boolean(list && lr && lr.height > 0),
            rule: lr && pr ? Math.round((lr.left - pr.left) * 10) / 10 : null,
            border: cs ? `${cs.borderLeftWidth} ${cs.borderLeftColor}` : null,
            marginLeft: cs?.marginLeft ?? null,
            marks,
          };
        });
        const panelRect = await rectOf(page, '[data-control="panel.versionHistory"]');
        s = await shot(
          page,
          'h2-version-history-window',
          panelRect
            ? {
                x: Math.max(0, panelRect.x - 8),
                y: panelRect.y,
                width: Math.min(panelRect.w + 16, 1440 - panelRect.x + 8),
                height: Math.min(panelRect.h, 900 - panelRect.y),
              }
            : undefined,
        );
        if (await visible(page, 'panel.versionHistory.close'))
          await clickControl(page, 'panel.versionHistory.close');
        else await press(page, 'Escape');
        const first = facts.windows[0] ?? null;
        record(
          'h2 versions.window-mark-column by hand (the driver fix)',
          "the newest window row is open on its own (aria-expanded true) and its list is drawn with one rule 25 px inside the panel (B5's hairline: margin 24 px plus the 1 px border)",
          `panel ${facts.panelWidth} px; ${facts.windows.length} window row(s), the first ${first ? `${first.control} aria-expanded ${first.expanded}` : 'none'}; list drawn ${facts.listShown}, its edge at x ${facts.rule ?? 'none'} (${facts.border ?? 'no list'}, margin-left ${facts.marginLeft ?? 'none'}); marks at x ${facts.marks.join(', ') || 'none'}`,
          first !== null && first.expanded === 'true' && facts.listShown,
          s,
          Date.now() - t0,
        );
      } catch (error) {
        record(
          'h2 versions.window-mark-column by hand',
          'the newest window open on its own',
          `error: ${String(error).split('\n')[0]}`,
          false,
          s,
          Date.now() - t0,
        );
      }
    }
  }

  // ---- H3 the name plate on a fresh browser
  if (want('h3')) {
    const t0 = Date.now();
    let s = null;
    const fresh = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      extraHTTPHeaders: headers,
    });
    const fp = await fresh.newPage();
    let freshDeck = null;
    try {
      /* the first write makes the deck (newDeck above, which records it for the teardown); the
         inline wait for the address with no write timed out at the ship step's third attempt */
      freshDeck = await newDeck(fp);
      await clickControl(fp, 'share.open');
      const shown = await ctl(fp, 'dialog.namePrompt')
        .waitFor({ timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      const facts = shown
        ? await fp.evaluate(() => {
            const prompt = document.querySelector('[data-control="dialog.namePrompt"]');
            const field = document.querySelector('[data-control="dialog.namePrompt.name"]');
            const row = prompt?.closest('.ts-title-row');
            const pr = prompt?.getBoundingClientRect();
            const rr = row?.getBoundingClientRect();
            return {
              value: field?.value ?? null,
              placeholder: field?.getAttribute('placeholder') ?? null,
              label: prompt?.getAttribute('aria-label') ?? null,
              plate: prompt?.classList.contains('ts-title-name-plate') ?? false,
              inTitleRow: Boolean(
                row && pr && rr && pr.top >= rr.top - 1 && pr.bottom <= rr.bottom + 1,
              ),
              height: pr ? Math.round(pr.height) : null,
            };
          })
        : null;
      const rowRect = await rectOf(fp, '.ts-title-row');
      s = await shot(
        fp,
        'h3-name-plate-2x',
        rowRect ? { x: 0, y: rowRect.y, width: 1440, height: rowRect.h } : undefined,
      );
      if (await visible(fp, 'dialog.namePrompt.skip'))
        await clickControl(fp, 'dialog.namePrompt.skip');
      else if (await visible(fp, 'dialog.namePrompt.close'))
        await clickControl(fp, 'dialog.namePrompt.close');
      await press(fp, 'Escape');
      record(
        'h3 share.name-prompt.empty-field by hand (the plate)',
        'Share on a fresh browser: the prompt is the title row plate, its field empty with the placeholder "Your name" and the question as the group\'s label',
        shown
          ? `plate ${facts.plate} in the title row ${facts.inTitleRow} (${facts.height} px); value "${facts.value}", placeholder "${facts.placeholder}", label "${facts.label}"`
          : 'no dialog.namePrompt within 4 s of Share',
        shown &&
          facts.value === '' &&
          facts.placeholder === 'Your name' &&
          facts.plate &&
          facts.inTitleRow,
        s,
        Date.now() - t0,
      );
    } catch (error) {
      record(
        'h3 share.name-prompt.empty-field by hand',
        'the placeholder Your name',
        `error: ${String(error).split('\n')[0]}`,
        false,
        s,
        Date.now() - t0,
      );
    } finally {
      if (freshDeck) await teardown(fp, freshDeck).catch(() => undefined);
      await fresh.close().catch(() => undefined);
    }
  }

  // ---- H4 assist.tailor.dialog-one-undo, H5 logos.tailor.find-customer-logo, H6 shaders.panel.kit-colours
  if (want('h4') || want('h5') || want('h6')) {
    deckB = await newDeck(page);
    const S = (await slideOrder(page))[0];
    if (want('h4')) {
      const t0 = Date.now();
      let s = null;
      try {
        const a = await newSlide(page, S, 'blank');
        const p = await newSlide(page, a, 'blank');
        await placeBlock(page, a, {
          id: 'acme-one',
          type: 'text',
          text: 'Acme renews in the third quarter',
          pos: { x: 160, y: 200, w: 900, h: 120 },
        });
        await placeBlock(page, p, {
          id: 'acme-two',
          type: 'text',
          text: 'Pricing for Acme, internal',
          pos: { x: 160, y: 200, w: 900, h: 120 },
        });
        const deckFacts = async () => {
          const ids = await slideOrder(page);
          let acme = 0;
          let acmeSlides = 0;
          let globex = 0;
          for (const id of ids) {
            const json = JSON.stringify(await slideJson(page, id), (key, value) =>
              ['id', 'type', 'asset', 'assets', 'pos', 'ext', 'link', 'name', 'alt'].includes(key)
                ? undefined
                : value,
            );
            acme += (json.match(/acme/gi) ?? []).length;
            if (/acme/i.test(json)) acmeSlides += 1;
            globex += (json.match(/globex/gi) ?? []).length;
          }
          const skipped = (await cards(page)).find((c) => c.id === p)?.skipped ?? null;
          return { acme, acmeSlides, globex, skipped };
        };
        await clickCard(page, a);
        await press(page, 'Escape', 2);
        const before = await deckFacts();
        const r = await reachRow(page, 'tools', 'tools.tailor');
        if (!r.present) throw new Error('no Tools > Tailor for a customer row');
        await menuPath(page, 'tools', 'tools.tailor');
        await waitControl(page, 'dialog.tailor', 8000);
        await clickControl(page, 'dialog.tailor.from');
        await typeHuman(page, 'Acme');
        await clickControl(page, 'dialog.tailor.to');
        await typeHuman(page, 'Globex');
        const count = await pollUntil(
          () => textOf(page, 'dialog.tailor.count'),
          (x) => /\d+ places? on \d+ slides?/.test(x ?? ''),
          6000,
        );
        const skipBox = `dialog.tailor.skip.${p}`;
        const hasSkip = await visible(page, skipBox);
        if (hasSkip) await clickControl(page, skipBox);
        await sleep(rand(600, 900));
        s = await shot(page, 'h4-tailor-dialog');
        const revBefore = (await state(page)).revision;
        await clickControl(page, 'dialog.tailor.apply');
        const tApply = Date.now();
        const snack = await pollUntil(
          () => snackbar(page),
          (x) => x !== null,
          6000,
        );
        const undoThere = await visible(page, 'snackbar.action');
        const after = await pollUntil(
          deckFacts,
          (f) => f.acme === 0 && f.globex >= before.acme,
          15_000,
        );
        await settled(page);
        const revRead1 = (await state(page)).revision;
        const revAfter = await pollUntil(
          async () => (await state(page)).revision,
          (v) => v > revBefore,
          6000,
          200,
        );
        const revMs = Date.now() - tApply;
        await sleep(rand(1500, 2200));
        s = await shot(page, 'h4-after-apply');
        await press(page, 'Escape', 3);
        await press(page, 'Meta+z');
        const tUndo = Date.now();
        const restored = await pollUntil(
          deckFacts,
          (f) => f.acme === before.acme && f.skipped === before.skipped,
          15_000,
        );
        const undoMs = Date.now() - tUndo;
        await settled(page);
        const revUndo = await pollUntil(
          async () => (await state(page)).revision,
          (v) => v > revAfter,
          15_000,
          200,
        );
        s = await shot(page, 'h4-after-undo');
        await advancedBack(page).catch(() => undefined);
        const ok =
          new RegExp(`^${before.acme} places? on ${before.acmeSlides} slides?$`).test(
            (count ?? '').trim(),
          ) &&
          hasSkip &&
          after.acme === 0 &&
          after.globex === before.acme &&
          after.skipped === true &&
          revAfter === revBefore + 1 &&
          undoThere &&
          restored.acme === before.acme &&
          restored.skipped === before.skipped;
        record(
          'h4 assist.tailor.dialog-one-undo',
          'the count reads every Acme; Apply renames every Acme to Globex and skips the pricing slide in one revision; the snackbar carries Undo; one Cmd+Z restores both',
          `count "${count ?? 'none'}" (Acme ${before.acme} on ${before.acmeSlides} slides); skip box ${hasSkip}; Acme ${before.acme} -> ${after.acme} -> ${restored.acme}; Globex ${before.globex} -> ${after.globex} -> ${restored.globex}; pricing skipped ${before.skipped} -> ${after.skipped} -> ${restored.skipped}; revision ${revBefore} -> ${revRead1} at the facts' read, ${revAfter} ${revMs} ms after Apply -> ${revUndo} after Cmd+Z (restored in ${undoMs} ms); snackbar "${snack ?? 'none'}" with Undo ${undoThere}`,
          ok,
          s,
          Date.now() - t0,
        );
      } catch (error) {
        await press(page, 'Escape', 3).catch(() => undefined);
        record(
          'h4 assist.tailor.dialog-one-undo',
          'one revision, one undo',
          `error: ${String(error).split('\n')[0]}`,
          false,
          s,
          Date.now() - t0,
        );
      }
    }
    if (want('h5')) {
      const t0 = Date.now();
      let s = null;
      try {
        const L = await newSlide(page, (await slideOrder(page)).at(-1), 'blank');
        const url = await page.evaluate(() => {
          const c = document.createElement('canvas');
          c.width = 120;
          c.height = 80;
          const g = c.getContext('2d');
          g.fillStyle = '#111';
          g.fillRect(0, 0, 120, 80);
          g.fillStyle = '#fff';
          g.font = 'bold 28px sans-serif';
          g.fillText('ACME', 14, 50);
          return c.toDataURL('image/png');
        });
        let sA = await settled(page);
        const asset = await invoke(page, 'asset.add', {
          id: 'acme-logo-asset',
          url,
          role: 'logo',
          alt: 'Acme logo',
          baseRevision: sA.revision,
        }).catch((e) => ({ error: String(e).split('\n')[0] }));
        await settled(page);
        const assetId = asset?.id ?? asset?.asset?.id ?? 'acme-logo-asset';
        await placeBlock(page, L, {
          id: 'acme-logo',
          type: 'shot',
          asset: assetId,
          alt: 'Acme logo',
          pos: { x: 1200, y: 600, w: 240, h: 160 },
        });
        await placeBlock(page, L, {
          id: 'acme-text',
          type: 'text',
          text: 'Prepared for Acme',
          pos: { x: 80, y: 760, w: 600, h: 60 },
        });
        const kitBefore = (await invoke(page, 'deck.info').catch(() => null))?.brand?.mark ?? null;
        await clickCard(page, L);
        await press(page, 'Escape', 2);
        const r = await reachRow(page, 'tools', 'tools.tailor');
        if (!r.present) throw new Error('no Tools > Tailor for a customer row');
        await menuPath(page, 'tools', 'tools.tailor');
        await waitControl(page, 'dialog.tailor', 8000);
        await clickControl(page, 'dialog.tailor.from');
        await typeHuman(page, 'Acme');
        await clickControl(page, 'dialog.tailor.to');
        await typeHuman(page, 'Figma');
        const found = await pollUntil(
          () => visible(page, 'dialog.tailor.logo.find'),
          (x) => x,
          8000,
        );
        if (!found) throw new Error('no Find the Figma logo button within 8 s');
        const label = await textOf(page, 'dialog.tailor.logo.find');
        await clickControl(page, 'dialog.tailor.logo.find');
        const tFind = Date.now();
        const stored = await pollUntil(
          async () =>
            (await textOf(page, 'dialog.tailor.logo.stored')) ??
            (await textOf(page, 'dialog.tailor.error')),
          (x) => x !== null && x.trim() !== '',
          30_000,
        );
        const findMs = Date.now() - tFind;
        const shown = await page.evaluate(() =>
          Boolean(
            document
              .querySelector('[data-control="dialog.tailor.logo.found"]')
              ?.querySelector('img, svg, canvas'),
          ),
        );
        await sleep(rand(1200, 1800));
        s = await shot(page, 'h5-logo-found');
        await settled(page);
        const rev0 = (await state(page)).revision;
        await clickControl(page, 'dialog.tailor.apply');
        const tApply = Date.now();
        await waitGone(page, 'dialog.tailor', 20_000);
        const objsAfter = await pollUntil(
          () => objectsOf(page, L),
          (l) =>
            (l.find((o) => o.id === 'acme-text')?.block?.text ?? null) === 'Prepared for Figma',
          15_000,
        );
        await settled(page);
        const revRead1 = (await state(page)).revision;
        const rev1 = await pollUntil(
          async () => (await state(page)).revision,
          (v) => v > rev0,
          6000,
          200,
        );
        const revMs = Date.now() - tApply;
        const pic = objsAfter.find((o) => o.id === 'acme-logo') ?? null;
        const swapped = pic !== null && pic.block.asset !== assetId;
        const text = objsAfter.find((o) => o.id === 'acme-text')?.block?.text ?? null;
        const kitAfter = (await invoke(page, 'deck.info').catch(() => null))?.brand?.mark ?? null;
        await sleep(rand(1200, 1800));
        s = await shot(page, 'h5-after-apply');
        await press(page, 'Escape', 3);
        await press(page, 'Meta+z');
        const tUndo = Date.now();
        const objs2 = await pollUntil(
          () => objectsOf(page, L),
          (l) =>
            l.find((o) => o.id === 'acme-logo')?.block?.asset === assetId &&
            l.find((o) => o.id === 'acme-text')?.block?.text === 'Prepared for Acme',
          15_000,
        );
        const undoMs = Date.now() - tUndo;
        await settled(page);
        const rev2 = (await state(page)).revision;
        const restored =
          objs2.find((o) => o.id === 'acme-logo')?.block?.asset === assetId &&
          objs2.find((o) => o.id === 'acme-text')?.block?.text === 'Prepared for Acme';
        const kitUndo = (await invoke(page, 'deck.info').catch(() => null))?.brand?.mark ?? null;
        s = await shot(page, 'h5-after-undo');
        await advancedBack(page).catch(() => undefined);
        const ok =
          /Figma/.test(label ?? '') &&
          shown &&
          stored !== null &&
          swapped &&
          text === 'Prepared for Figma' &&
          rev1 === rev0 + 1 &&
          restored &&
          kitAfter === kitBefore &&
          kitUndo === kitBefore;
        record(
          'h5 logos.tailor.find-customer-logo',
          "Find the Figma logo draws the mark; Apply swaps the Acme picture and renames the text in one revision; one Cmd+Z restores both; the kit's mark is unchanged",
          `asset ${asset?.error ? `add error "${asset.error}"` : assetId}; button "${label ?? 'none'}", mark drawn ${shown}, stored "${stored ?? 'none'}" ${findMs} ms after the click; Apply: picture asset ${assetId} -> ${pic?.block?.asset ?? 'none'} (swapped ${swapped}), text "${text}", revision ${rev0} -> ${revRead1} at the objects' read, ${rev1} ${revMs} ms after Apply; Cmd+Z: restored ${restored} in ${undoMs} ms, revision ${rev2}; the kit's mark ${JSON.stringify(kitBefore)} -> ${JSON.stringify(kitAfter)} -> ${JSON.stringify(kitUndo)}`,
          ok,
          s,
          Date.now() - t0,
        );
      } catch (error) {
        await press(page, 'Escape', 3).catch(() => undefined);
        record(
          'h5 logos.tailor.find-customer-logo',
          'one revision, one undo, the kit unchanged',
          `error: ${String(error).split('\n')[0]}`,
          false,
          s,
          Date.now() - t0,
        );
      }
    }
    if (want('h6')) {
      const t0 = Date.now();
      let s = null;
      try {
        await clickCard(page, S);
        await press(page, 'Escape', 2);
        const r = await reachRow(page, 'insert', 'insert.shader');
        if (!r.present) throw new Error('no Insert > Shader row');
        await menuPath(page, 'insert', 'insert.shader');
        await waitControl(page, 'dialog.shader', 8000);
        await sleep(rand(600, 900));
        const tile = await page.evaluate(() => {
          const sel =
            '[data-control^="dialog.shader.tile."], [data-control^="dialog.shader.card."], [data-control^="dialog.shader.pick."]';
          const all = [...document.querySelectorAll(sel)].filter(
            (e) => e.getClientRects().length > 0,
          );
          const top = all.filter((e) => e.parentElement?.closest(sel) === null);
          const liquid =
            top.find((e) => /liquid metal/i.test(e.textContent ?? '')) ?? top[0] ?? null;
          return liquid
            ? {
                control: liquid.getAttribute('data-control'),
                title: (liquid.textContent ?? '').trim().slice(0, 40),
              }
            : null;
        });
        if (!tile) throw new Error('no tile in the shader gallery');
        const before = (await objectsOf(page, S)).map((o) => o.id);
        await clickControl(page, tile.control);
        const tIns = Date.now();
        const block = await pollUntil(
          () => objectsOf(page, S),
          (l) => l.some((o) => o.type === 'material' && !before.includes(o.id)),
          20_000,
        ).then((l) => l.find((o) => o.type === 'material' && !before.includes(o.id)) ?? null);
        const insMs = Date.now() - tIns;
        await waitGone(page, 'dialog.shader', 8000);
        await settled(page);
        if (!block)
          throw new Error(`a click on ${tile.title} inserted no shader block within 20 s`);
        const id = block.id;
        /* the first capture: the block's asset within 8 s of the insert */
        const firstAsset = await pollUntil(
          async () => (await objectsOf(page, S)).find((o) => o.id === id)?.block?.asset ?? null,
          (x) => x !== null,
          10_000,
          200,
        );
        const firstMs = Date.now() - tIns;
        await sleep(rand(800, 1200));
        s = await shot(page, 'h6-shader-inserted');
        /* select it on the sheet and open Format options > Shader */
        const b = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${id}"]`);
        if (!b) throw new Error('the shader block is not on the sheet');
        await clickAt(page, b.x + b.w / 2, b.y + b.h / 2);
        const selectedHandle = await ctl(page, `handle.${id}.move`)
          .waitFor({ timeout: 4000 })
          .then(() => true)
          .catch(() => false);
        if (!(await visible(page, 'panel.formatOptions'))) {
          if (await visible(page, 'toolbar.formatOptions'))
            await clickControl(page, 'toolbar.formatOptions');
          else {
            await clickControl(page, 'toolbar.more');
            await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
            await clickControl(page, 'toolbar.more.toolbar.formatOptions');
          }
          await waitControl(page, 'panel.formatOptions', 8000);
        }
        const expanded = await page.evaluate(
          () =>
            document
              .querySelector('[data-section="shader"] > [data-control="formatOptions.shader"]')
              ?.getAttribute('aria-expanded') ?? null,
        );
        if (expanded === 'false')
          await page
            .locator('[data-section="shader"] > [data-control="formatOptions.shader"]')
            .first()
            .click();
        await sleep(400);
        const swatches = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="formatOptions.shader.color."]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) =>
              (e.getAttribute('data-control') ?? '').replace('formatOptions.shader.color.', ''),
            ),
        );
        const roles = ['text', 'background', 'caption', 'hint', 'primary', 'accent'].filter(
          (role) => swatches.some((x) => x === role || x.startsWith(`${role}.`)),
        );
        const rendered = await page.evaluate(
          () =>
            document.querySelector('.ts-stagewrap.ts-editor')?.getAttribute('data-theme') ?? null,
        );
        const appearance = rendered === 'light' || rendered === 'dark' ? rendered : 'dark';
        const revP = (await state(page)).revision;
        await clickControl(page, 'formatOptions.shader.color.primary');
        const revQ = await pollUntil(
          async () => (await state(page)).revision,
          (v) => v > revP,
          6000,
          100,
        );
        await settled(page);
        await sleep(rand(800, 1200));
        s = await shot(page, 'h6-primary-swatch');
        const block0 = (await objectsOf(page, S)).find((o) => o.id === id)?.block ?? null;
        const asset0 = await assetOf(page, block0?.asset);
        const key0 = asset0?.source?.frameKey ?? null;
        /* the kit write a seller makes in the Brand kit panel; here through the window API, the same write */
        const sW = await settled(page);
        const tW = Date.now();
        let refusal = null;
        await invoke(page, 'brand.set', {
          path: `/colors/${appearance}/primary`,
          value: '#0b3d91',
          baseRevision: sW.revision,
        }).catch((e) => {
          refusal = String(e).split('\n')[0];
        });
        const recaptured = await pollUntil(
          async () => {
            const bl = (await objectsOf(page, S)).find((o) => o.id === id)?.block ?? null;
            const a = await assetOf(page, bl?.asset);
            return {
              asset: bl?.asset ?? null,
              key: a?.source?.frameKey ?? null,
              backend: a?.source?.backend ?? null,
            };
          },
          (x) => x.key !== null && x.key !== key0,
          20_000,
          200,
        );
        const reMs = Date.now() - tW;
        const decoded =
          recaptured.asset && recaptured.asset !== (block0?.asset ?? null)
            ? await pollUntil(
                () =>
                  page.evaluate(
                    ([blockId, a]) => {
                      const img = document.querySelector(
                        `.ts-stagewrap.ts-editor [data-block="${blockId}"] img`,
                      );
                      return (
                        img !== null &&
                        img.complete &&
                        img.naturalWidth > 0 &&
                        (img.currentSrc ?? img.src ?? '').includes(a)
                      );
                    },
                    [id, recaptured.asset],
                  ),
                (x) => x === true,
                8000,
                200,
              )
            : false;
        const decodedMs = Date.now() - tW;
        s = await shot(page, 'h6-after-kit-write');
        await press(page, 'Escape', 2);
        await advancedBack(page).catch(() => undefined);
        const ok =
          roles.length === 6 &&
          selectedHandle &&
          recaptured.key !== null &&
          recaptured.key !== key0 &&
          reMs <= 5000;
        record(
          'h6 shaders.panel.kit-colours',
          "six kit swatches in the Shader section; the shader is on the kit's Primary; the kit's primary colour written: the frame is re captured within 5 s with a new frameKey",
          `${tile.title} inserted in ${insMs} ms (first frame asset ${firstAsset ?? 'none'} at ${firstMs} ms); selected with handles ${selectedHandle}; swatches ${swatches.join(', ')} (${roles.length} of six roles); the sheet renders ${appearance}; the Primary swatch clicked (revision ${revP} -> ${revQ}); brand.set /colors/${appearance}/primary ${refusal ? `refused: ${refusal}` : 'ok'}; frame ${key0 ?? 'none'} -> ${recaptured.key ?? 'none'} (${recaptured.backend ?? 'no backend'}) ${reMs} ms after the write; the new picture decoded on the sheet ${decoded} at ${decodedMs} ms`,
          ok,
          s,
          Date.now() - t0,
        );
      } catch (error) {
        await press(page, 'Escape', 3).catch(() => undefined);
        record(
          'h6 shaders.panel.kit-colours',
          'a re capture within 5 s',
          `error: ${String(error).split('\n')[0]}`,
          false,
          s,
          Date.now() - t0,
        );
      }
    }
  }
} finally {
  for (const d of decks) if (d.id) await teardown(page, d.id).catch(() => undefined);
  await browser.close().catch(() => undefined);
  const out = {
    base: BASE,
    startedAt,
    endedAt: new Date().toISOString(),
    rows,
    decks,
    passed: rows.filter((r) => r.ok === true).length,
    failed: rows.filter((r) => r.ok === false).length,
  };
  writeFileSync(JSON_OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `\n${out.passed} ok, ${out.failed} failed; decks ${decks.map((d) => `${d.id} (trashed ${d.trashed}, removed ${d.removed}, /edit ${d.status})`).join('; ')}`,
  );
}

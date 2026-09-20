// Shared helpers of the feature gaps audit (docs/gslides-parity/product/audit-gaps.md). Imports
// nothing from the repository but playwright-core (from the repository root's node_modules).
// Human speed: the mouse moves in steps, keys land 40 to 90 ms apart, double clicks are the
// browser's own, drags hold the pointer from down through the moves to up. Every scratch deck is
// created from /new and trashed and deleted forever in the caller's finally block (cleanupDeck).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
export const { chromium, request } = require('playwright-core');

export const BASE = 'https://turboslide.vercel.app';
export const EVIDENCE = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/product/audit-gaps';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** The run's table and its writer. */
export function makeTable(name) {
  const rows = [];
  let shotIndex = 0;
  const started = Date.now();
  mkdirSync(EVIDENCE, { recursive: true });
  const record = (step, expected, observed, ok, extra = {}) => {
    const row = {
      n: rows.length + 1,
      step,
      expected,
      observed: typeof observed === 'string' ? observed : JSON.stringify(observed),
      ok,
      ...extra,
    };
    rows.push(row);
    const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
    console.log(`${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed.slice(0, 900)}`);
    return row;
  };
  const step = async (label, expected, fn) => {
    try {
      const r = await fn();
      return record(label, expected, r.observed, r.ok, r.extra ?? {});
    } catch (error) {
      return record(label, expected, `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`, false);
    }
  };
  const skip = (label, expected, why) => record(label, expected, `not driven: ${why}`, null);
  const shotName = (slug) => {
    shotIndex += 1;
    return path.join(EVIDENCE, `${name}-${String(shotIndex).padStart(2, '0')}-${slug}.png`);
  };
  const finish = (extra = {}) => {
    const out = {
      name,
      base: BASE,
      startedAt: new Date(started).toISOString(),
      seconds: Math.round((Date.now() - started) / 1000),
      ok: rows.filter((r) => r.ok === true).length,
      failed: rows.filter((r) => r.ok === false).length,
      notDriven: rows.filter((r) => r.ok === null).length,
      ...extra,
      rows,
    };
    writeFileSync(path.join(EVIDENCE, `${name}.json`), JSON.stringify(out, null, 2));
    console.log(`\n${name}: ${out.ok} ok, ${out.failed} failed, ${out.notDriven} not driven, ${out.seconds} s`);
    return out;
  };
  return { rows, record, step, skip, shotName, finish };
}

/** A headless Chromium at the given viewport with the clipboard permissions the paste rows need. */
export async function launch({ width = 1440, height = 900, headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  return { browser, context, page, consoleErrors };
}

/** Binds the human speed helpers and the product readers to one page. */
export function bind(page, table) {
  const t = { page, table };
  t.step = table.step;
  t.skip = table.skip;
  t.record = table.record;
  t.sleep = sleep;
  t.typeHuman = async (text) => {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await sleep(rand(40, 90));
    }
  };
  t.press = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
      await page.keyboard.press(key);
      await sleep(rand(50, 90));
    }
  };
  t.moveHuman = async (from, to, steps = 12) => {
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps;
      await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
      await sleep(rand(14, 26));
    }
  };
  t.clickAt = async (x, y, opts = {}) => {
    await t.moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
    await sleep(rand(40, 90));
    await page.mouse.click(x, y, opts);
    await sleep(rand(120, 220));
  };
  t.dblclickAt = async (x, y) => {
    await t.moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
    await sleep(rand(40, 90));
    await page.mouse.dblclick(x, y);
    await sleep(rand(160, 260));
  };
  t.rightClickAt = async (x, y) => {
    await t.moveHuman({ x: x - 30, y: y - 20 }, { x, y }, 6);
    await sleep(rand(40, 90));
    await page.mouse.click(x, y, { button: 'right' });
    await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
    await sleep(rand(200, 350));
    return t.has('.ts-context-menu');
  };
  t.clickContextRow = async (rowId) => {
    const r = await t.rectOf(`.ts-context-menu [data-control="menu.${rowId}"]`);
    if (!r) throw new Error(`no context row ${rowId}`);
    await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
  };
  t.drag = async (from, to, { steps = 14, during } = {}) => {
    await t.moveHuman({ x: from.x - 30, y: from.y - 20 }, from, 6);
    await sleep(rand(60, 120));
    await page.mouse.down();
    await sleep(rand(60, 110));
    await t.moveHuman(from, to, steps);
    await sleep(rand(80, 140));
    const mid = during ? await during() : undefined;
    await page.mouse.up();
    await sleep(rand(120, 200));
    return mid;
  };

  // ---- the product
  t.invoke = (action, input = {}) =>
    page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
  t.state = () => page.evaluate(() => window.turboslide.studio.describe().state);
  t.editorReady = async () => {
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
    await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  };
  t.pollUntil = async (read, test, timeout = 15_000, every = 150) => {
    const until = Date.now() + timeout;
    for (;;) {
      const v = await read();
      if (test(v)) return v;
      if (Date.now() > until) return v;
      await sleep(every);
    }
  };
  t.settled = async (timeout = 20_000) =>
    t.pollUntil(t.state, (s) => (s.sync?.pending ?? s.pending ?? 0) === 0, timeout);
  t.waitRevision = (want, timeout = 25_000) =>
    t.pollUntil(t.state, (s) => s.revision >= want, timeout).then((s) => s.revision);
  t.has = (selector) => page.evaluate((sel) => document.querySelector(sel) !== null, selector);
  t.visible = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el !== null && el.getClientRects().length > 0;
    }, selector);
  t.count = (selector) => page.locator(selector).count();
  t.textOf = (selector) =>
    page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector);
  t.attr = (selector, name) =>
    page.evaluate(([sel, n]) => document.querySelector(sel)?.getAttribute(n) ?? null, [selector, name]);
  t.rectOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, selector);
  t.center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  t.ctl = (control) => `[data-control="${control}"]`;
  t.clickControl = async (control) => {
    const r = await t.rectOf(t.ctl(control));
    if (!r) throw new Error(`no control ${control}`);
    await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
  };
  t.saveWords = () => t.textOf(t.ctl('deck.saveState'));
  t.snackbar = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
          .filter((el) => el.closest('.ts-overlay') === null && el.textContent?.trim())
          .map((el) => el.textContent?.trim() ?? '')
          .join(' | ') || null,
    );
  t.snackbarWithin = (ms = 4000) => t.pollUntil(t.snackbar, (s) => s !== null, ms, 150);
  t.chip = () => t.textOf('.ts-overlay .ts-select-chip');
  t.editing = () => t.has('.ts-stagewrap.ts-editor[data-editing]');
  t.activeDesc = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return 'none';
      return `${a.tagName.toLowerCase()}${a.getAttribute('contenteditable') === 'true' ? '[contenteditable]' : ''}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.getAttribute('data-run') ? `[run ${a.getAttribute('data-run')}]` : ''}`;
    });
  t.handleControls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
    );

  // ---- menus
  t.openMenu = async (menuId) => {
    await t.clickControl(`menubar.${menuId}`);
    await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
    await sleep(rand(200, 350));
  };
  t.closeMenus = async () => {
    await t.press('Escape', 2);
    await sleep(150);
  };
  t.rowsUnder = (rootSelector) =>
    page.evaluate(
      (root) =>
        [...document.querySelectorAll(`${root} [data-control^="menu."]`)]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            id: el.getAttribute('data-control').replace(/^menu\./, ''),
            label: el.textContent?.trim() ?? '',
            disabled: el.getAttribute('aria-disabled') === 'true',
            checked: el.getAttribute('aria-checked'),
            title: el.getAttribute('title') ?? el.getAttribute('aria-description') ?? null,
          })),
      rootSelector,
    );
  t.menuRows = (menuId) => t.rowsUnder(`#ts-menu-${menuId}`);
  t.contextRows = () => t.rowsUnder('.ts-context-menu');
  t.hoverRow = async (rowId, waitFor) => {
    const r = await t.rectOf(t.ctl(`menu.${rowId}`));
    if (!r) throw new Error(`no row ${rowId}`);
    await t.moveHuman({ x: r.x - 20, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
    await sleep(rand(300, 450));
    if (waitFor) {
      try {
        await page.locator(waitFor).first().waitFor({ timeout: 6000 });
      } catch {
        // a click on a submenu row opens it too, the last try a person makes
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
        await page.locator(waitFor).first().waitFor({ timeout: 4000 });
      }
    }
  };
  t.clickRow = async (rowId) => {
    const r = await t.rectOf(t.ctl(`menu.${rowId}`));
    if (!r) throw new Error(`no row ${rowId}`);
    await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
  };
  t.menuPath = async (menuId, ...rowIds) => {
    await t.openMenu(menuId);
    for (let i = 0; i < rowIds.length - 1; i += 1) {
      await t.hoverRow(rowIds[i], `${t.ctl(`menu.${rowIds[i + 1]}`)}, ${t.ctl(rowIds[i + 1])}`);
    }
    const last = rowIds[rowIds.length - 1];
    if (await t.has(t.ctl(`menu.${last}`))) await t.clickRow(last);
    else await t.clickControl(last);
    await sleep(rand(250, 400));
  };
  /** Reads a row's tooltip sentence by hovering it (the tooltip plate), then Escape. */
  t.rowTooltip = async (rowId) => {
    const r = await t.rectOf(t.ctl(`menu.${rowId}`));
    if (!r) return null;
    await t.moveHuman({ x: r.x - 20, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
    await sleep(900);
    return page.evaluate(
      () =>
        [...document.querySelectorAll('[role="tooltip"], .ts-tooltip, .ts-tip')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.textContent?.trim() ?? '')
          .join(' | ') || null,
    );
  };
  t.advancedOn = async () => (await t.state()).settings?.advancedTools === true;
  t.setAdvanced = async (on) => {
    if ((await t.advancedOn()) === on) return true;
    await t.closeMenus();
    await t.menuPath('tools', 'tools.advancedTools');
    const got = await t.pollUntil(t.advancedOn, (x) => x === on, 8000);
    return got === on;
  };

  // ---- the sheet and the objects
  const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
  t.SHEET = SHEET;
  t.sheetRect = () => t.rectOf(SHEET);
  t.sheetPoint = async (sx, sy) => {
    const sheet = await t.sheetRect();
    if (!sheet) throw new Error('no sheet on the stage');
    const kk = sheet.w / 1600;
    return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
  };
  t.slideJson = (slideId) => t.invoke('slide.get', { slideId }).then((g) => g.slide ?? g);
  t.objectsOf = async (slideId) => {
    const slide = await t.slideJson(slideId);
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
  /**
   * The first object that was not there before, of `type` when given. A grammar slide converts to
   * a canvas at the first object insert and its own blocks (the mark, the heading, the lead) gain a
   * `pos` then, so without a type the converted grammar blocks are skipped.
   */
  const GRAMMAR_TYPES = ['mark', 'heading', 'lead', 'paragraph', 'plate'];
  t.newObjectAfter = async (slideId, beforeIds, timeout = 20_000, type = null) => {
    const pick = (o) =>
      o.find((x) => !beforeIds.includes(x.id) && (type ? x.type === type : !GRAMMAR_TYPES.includes(x.type))) ?? null;
    const objs = await t.pollUntil(() => t.objectsOf(slideId), (o) => pick(o) !== null, timeout);
    return pick(objs);
  };
  /** The slide ids in deck order, from deck.info's sections. */
  t.slideIds = async () => {
    const info = await t.invoke('deck.info');
    return (info.sections ?? []).flatMap((s) => (s.slides ?? []).map((x) => x.id ?? x));
  };
  /** Opens the show from the title row's Slideshow button and waits for it. */
  t.openShow = async () => {
    await t.clickControl('present.open');
    await page.waitForSelector('.ts-slideshow, [data-control="present.toolbar"], [data-control="present.laserDot"], [data-control="present.blank"]', { timeout: 15_000 }).catch(() => undefined);
    await sleep(1200);
    return t.has('.ts-slideshow, [data-control="present.toolbar"], [data-control="present.blank"]');
  };
  t.runs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) => el.getAttribute('data-run')),
    );
  t.runInfo = (run) =>
    page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
      const rect = el.getBoundingClientRect();
      return {
        text: clone.textContent ?? '',
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        editable: el.getAttribute('contenteditable') === 'true',
        font: parseFloat(getComputedStyle(el).fontSize),
      };
    }, run);
  t.boxOf = (id) =>
    page.evaluate((blockId) => {
      const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`);
      if (!inner) return null;
      const free = inner.closest('.free') ?? inner;
      const f = free.getBoundingClientRect();
      const i = inner.getBoundingClientRect();
      const img = inner.tagName.toLowerCase() === 'img' ? inner : inner.querySelector('img');
      const ir = img ? img.getBoundingClientRect() : null;
      return {
        free: { x: f.x, y: f.y, w: f.width, h: f.height },
        inner: { x: i.x, y: i.y, w: i.width, h: i.height },
        img: ir ? { w: ir.width, h: ir.height, opacity: getComputedStyle(img).opacity, filter: getComputedStyle(img).filter } : null,
      };
    }, id);
  /** One click selects (A1 rule 1); Escape ends a session a click landed in. */
  t.selectObject = async (id) => {
    const b = await t.boxOf(id);
    if (!b) return null;
    let c = b.inner.w > 4 && b.inner.h > 4 ? t.center(b.inner) : t.center(b.free);
    await t.clickAt(c.x, c.y);
    let ctrls = await t.handleControls();
    if (!ctrls.includes(`handle.${id}.move`)) {
      c = { x: b.free.x + 4, y: b.free.y + 4 };
      await t.clickAt(c.x, c.y);
      ctrls = await t.handleControls();
    }
    if (ctrls.includes(`handle.${id}.move`) && (await t.editing())) {
      await t.press('Escape');
      await sleep(200);
      ctrls = await t.handleControls();
    }
    return ctrls.includes(`handle.${id}.move`) ? ctrls : null;
  };
  t.openRun = async (run) => {
    const info = await t.runInfo(run);
    if (!info) throw new Error(`no run ${run}`);
    await t.dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    return t.editing();
  };
  /** Insert > <rows> then a click on the sheet at a sheet point; the new object (type text gets typed into). */
  t.insertByTool = async (slideId, rows, at, { text = 'Text' } = {}) => {
    const before = (await t.objectsOf(slideId)).map((o) => o.id);
    await t.openMenu('insert');
    for (let i = 0; i < rows.length - 1; i += 1)
      await t.hoverRow(rows[i], `${t.ctl(`menu.${rows[i + 1]}`)}, ${t.ctl(rows[i + 1])}`);
    const last = rows[rows.length - 1];
    if (await t.has(t.ctl(`menu.${last}`))) await t.clickRow(last);
    else await t.clickControl(last);
    await sleep(400);
    const p = await t.sheetPoint(at.x, at.y);
    await t.clickAt(p.x, p.y);
    const obj = await t.newObjectAfter(slideId, before, 20_000, rows[rows.length - 1] === 'insert.textBox' ? 'text' : null);
    await sleep(300);
    if (obj && obj.type === 'text' && text !== null && (await t.editing())) {
      await t.typeHuman(text);
      await sleep(300);
    }
    return obj;
  };
  t.shot = async (slug, opts = {}) => {
    const file = table.shotName(slug);
    await page.screenshot({ path: file, ...opts });
    return path.basename(file);
  };
  t.closeDialogs = async () => {
    await t.press('Escape', 2);
    await sleep(200);
  };
  t.dismissNamePrompt = async () => {
    if (await t.visible(t.ctl('dialog.namePrompt')))
      await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
  };
  return t;
}

/**
 * A scratch deck from /new: the title run double clicked, a title typed, the first write moves the
 * address to /edit/<id>. Returns { id, titleSlide, headRun, bodyRun }.
 */
export async function newDeck(t, title = 'Pipeline review: Acme Q3 2026') {
  const { page } = t;
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await t.editorReady();
  const info = await t.invoke('deck.info');
  const s = await t.state();
  const runs = await t.runs();
  const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
  const body = runs.find((r) => r !== head) ?? null;
  await t.dismissNamePrompt();
  const on = await t.openRun(head);
  if (!on) throw new Error('the title session did not open on a double click');
  await t.typeHuman(title.slice(0, 8));
  await t.waitRevision(1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  await t.typeHuman(title.slice(8));
  await sleep(300);
  await t.press('Escape', 2);
  await t.settled();
  await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 15_000).catch(() => undefined);
  await t.dismissNamePrompt();
  const after = await t.invoke('deck.info');
  const id = /\/edit\/([^/#?]+)/.exec(page.url())?.[1] ?? after.id ?? info.id;
  return { id, titleSlide: s.slideId, headRun: head, bodyRun: body, draftId: info.id };
}

/** File > Move to trash, Delete forever on /decks/trash, then 404 on /deck/<id> and /edit/<id>. */
export async function cleanupDeck(t, deckId, context) {
  const { page, table } = t;
  if (!deckId) return;
  let trashed = false;
  try {
    if (context) await context.setOffline(false).catch(() => undefined);
    for (const p of context ? context.pages() : []) if (p !== page) await p.close().catch(() => undefined);
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
    await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);
    await t.settled();
    await t.closeDialogs();
    await t.dismissNamePrompt();
    await t.clickControl('menubar.file');
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await t.clickControl('menu.file.moveToTrash');
    await page.waitForURL(/\/decks$/, { timeout: 20_000 });
    table.record('File > Move to trash', 'the deck moves to the trash and the page returns to /decks', page.url().replace(BASE, ''), true);
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    const card = page.locator(`[data-control="trash.card.${deckId}"]`);
    await card.waitFor({ timeout: 30_000 });
    await t.clickControl(`trash.delete.${deckId}`);
    await t.clickControl('trash.confirm.ok');
    await card.waitFor({ state: 'detached', timeout: 30_000 });
    table.record('Delete forever', 'the card leaves the trash', deckId, true);
    trashed = true;
  } catch (error) {
    table.record('the product trash path', 'File > Move to trash then Delete forever', `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the actions API`, false);
  }
  if (!trashed) {
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await t.editorReady().catch(() => undefined);
      const info = await t.invoke('deck.info').catch(() => null);
      if (info) {
        await t.invoke('deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined);
        const i2 = await t.invoke('deck.info').catch(() => null);
        await t.invoke('deck.remove', { id: deckId, baseRevision: i2?.revision ?? info.revision, confirm: true }).catch(() => undefined);
      }
    } catch {
      // the 404 probe below tells the truth
    }
  }
  let status = 0;
  let statusEdit = 0;
  const until = Date.now() + 25_000;
  for (;;) {
    status = (await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 })).status();
    statusEdit = (await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })).status();
    if ((status === 404 && statusEdit === 404) || Date.now() > until) break;
    await sleep(2000);
  }
  table.record('the scratch deck answers 404', `GET /deck/${deckId} and /edit/${deckId} are 404 within 25 s`, `/deck ${status}; /edit ${statusEdit}`, status === 404 && statusEdit === 404);
}

/** A 480 by 300 PNG (two tone blocks) written by hand: the picture rows' file. */
export function pngFixture() {
  const { deflateSync } = require('node:zlib');
  const w = 480;
  const h = 300;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const dark = (Math.floor(x / 60) + Math.floor(y / 60)) % 2 === 0;
      raw[o] = dark ? 20 : 235;
      raw[o + 1] = dark ? 20 : 235;
      raw[o + 2] = dark ? 20 : 230;
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

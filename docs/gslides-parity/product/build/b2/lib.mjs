// B2's scratch drivers for the product round: a compact port of the walk probe's helpers
// (scripts/probes/editor-walk-probe.mjs) over playwright-core from the repository root. Human
// speed, the window API for setup writes, the page for every observation.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
export const { chromium } = require('playwright-core');

export const BASE = process.env.B2_BASE ?? 'http://localhost:4412';
export const OUT =
  process.env.B2_OUT ?? '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/product/build/b2/out';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

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
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));
  return { browser, context, page, consoleErrors };
}

export function bind(page, name) {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  let shotIndex = 0;
  const t = { page, rows };
  t.record = (step, expected, observed, ok) => {
    const row = {
      n: rows.length + 1,
      step,
      expected,
      observed: typeof observed === 'string' ? observed : JSON.stringify(observed),
      ok,
    };
    rows.push(row);
    const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
    console.log(
      `${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed.slice(0, 1200)}`,
    );
    return row;
  };
  t.step = async (label, expected, fn) => {
    try {
      const r = await fn();
      return t.record(label, expected, r.observed, r.ok);
    } catch (error) {
      return t.record(
        label,
        expected,
        `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        false,
      );
    }
  };
  t.finish = () => {
    const out = {
      name,
      base: BASE,
      ok: rows.filter((r) => r.ok === true).length,
      failed: rows.filter((r) => r.ok === false).length,
      rows,
    };
    writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(out, null, 2));
    console.log(`\n${name}: ${out.ok} ok, ${out.failed} failed`);
    return out;
  };
  t.shot = async (slug) => {
    shotIndex += 1;
    const file = path.join(OUT, `${name}-${String(shotIndex).padStart(2, '0')}-${slug}.png`);
    await page.screenshot({ path: file });
    return file;
  };
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
  t.invoke = (action, input = {}) =>
    page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
  t.state = () => page.evaluate(() => window.turboslide.studio.describe().state);
  t.editorReady = async () => {
    await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
    await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  };
  t.settled = async (timeout = 20_000) => {
    const until = Date.now() + timeout;
    for (;;) {
      const s = await t.state();
      if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
      if (Date.now() > until) return s;
      await sleep(150);
    }
  };
  t.waitRevision = async (want, timeout = 25_000) => {
    const until = Date.now() + timeout;
    for (;;) {
      const s = await t.state();
      if (s.revision >= want) return s.revision;
      if (Date.now() > until) return s.revision;
      await sleep(150);
    }
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
  t.slideJson = async (slideId) => t.invoke('slide.get', { slideId }).then((g) => g.slide ?? g);
  t.objectsOf = async (slideId) => {
    const slide = await t.slideJson(slideId);
    const out = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
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
  t.blocksOf = async (slideId) => {
    const slide = await t.slideJson(slideId);
    const out = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (typeof node.id === 'string' && typeof node.type === 'string') out.push(node);
        for (const v of Object.values(node)) walk(v);
      }
    };
    walk(slide);
    return out;
  };
  t.blockOf = async (slideId, id) => (await t.objectsOf(slideId)).find((o) => o.id === id) ?? null;
  t.slideOrder = async () => {
    const list = await t.invoke('slide.list', {});
    const arr = list.slides ?? list.items ?? list;
    return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
  };
  t.activeSlide = async () => (await t.state()).slideId;
  t.gotoSlide = async (slideId) => {
    const card = page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first();
    const r = await card.boundingBox().catch(() => null);
    if (r) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    else await t.invoke('view.goto', { slideId }).catch(() => undefined);
    await t.pollUntil(
      () => t.activeSlide(),
      (a) => a === slideId,
      8000,
    );
    await page
      .waitForSelector(`.pt-viewer[data-active="${slideId}"]`, { timeout: 5000 })
      .catch(() => undefined);
    await sleep(400);
  };
  t.setupSlide = async (after = null, layout = 'blank') => {
    const before = await t.slideOrder();
    const s = await t.state();
    await t.invoke('slide.new', { baseRevision: s.revision, ...(after ? { after } : {}), layout });
    const order = await t.pollUntil(t.slideOrder, (o) => o.length === before.length + 1, 20_000);
    const id = order.find((x) => !before.includes(x)) ?? null;
    await t.settled();
    return id;
  };
  t.newObjectAfter = async (slideId, before, timeout = 20_000) => {
    const objs = await t.pollUntil(
      () => t.objectsOf(slideId),
      (o) => o.some((x) => !before.includes(x.id)),
      timeout,
    );
    return objs.find((x) => !before.includes(x.id)) ?? null;
  };
  t.objectIds = async (slideId) => (await t.objectsOf(slideId)).map((o) => o.id);
  t.placeBlock = async (slideId, block, slot = 'main') => {
    const before = await t.objectIds(slideId);
    const s = await t.state();
    await t.invoke('block.insert', { baseRevision: s.revision, slideId, slot, block });
    const obj = await t.newObjectAfter(slideId, before);
    await t.settled();
    return obj;
  };
  t.setBlock = async (slideId, blockId, path, value) => {
    const s = await t.state();
    await t.invoke('block.set', { baseRevision: s.revision, slideId, blockId, path, value });
    await t.waitRevision(s.revision + 1, 15_000);
    await t.settled();
  };
  t.pngDataUrl = (w = 96, h = 64, a = '#1b1b1b', b = '#e8e8e8') =>
    page.evaluate(
      ([pw, ph, ca, cb]) => {
        const c = document.createElement('canvas');
        c.width = pw;
        c.height = ph;
        const g = c.getContext('2d');
        g.fillStyle = ca;
        g.fillRect(0, 0, pw, ph);
        g.fillStyle = cb;
        g.fillRect(pw / 8, ph / 5, (pw * 3) / 4, (ph * 3) / 5);
        return c.toDataURL('image/png');
      },
      [w, h, a, b],
    );
  t.pngBuffer = async (w = 120, h = 80, a = '#204080', b = '#e0e8ff') => {
    const url = await t.pngDataUrl(w, h, a, b);
    return Buffer.from(url.split(',')[1], 'base64');
  };
  t.placePicture = async (slideId, pos, id = `shot-b2-${Date.now().toString(36)}`) => {
    const png = await t.pngDataUrl(96, 64);
    const s = await t.state();
    const asset = await t.invoke('asset.add', {
      id: `${id}-asset`,
      url: png,
      role: 'capture',
      alt: 'b2 picture',
      baseRevision: s.revision,
    });
    await t.settled();
    const s2 = await t.state();
    const before = await t.objectIds(slideId);
    await t.invoke('block.insert', {
      slideId,
      slot: 'main',
      block: { id, type: 'shot', asset: asset.id, pos },
      baseRevision: Math.max(s2.revision, asset.revision ?? 0),
    });
    const obj = await t.newObjectAfter(slideId, before, 20_000);
    await t.settled();
    return obj;
  };
  t.kOf = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      return sheet ? sheet.getBoundingClientRect().width / 1600 : 0;
    });
  t.sheetRect = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      if (!sheet) return null;
      const r = sheet.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
  t.sheetPoint = async (sx, sy) => {
    const r = await t.sheetRect();
    const k = r.w / 1600;
    return { x: r.x + sx * k, y: r.y + sy * k };
  };
  t.rectOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, selector);
  t.center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  t.chip = () =>
    page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
  t.editing = () =>
    page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
  t.runInfo = (run) =>
    page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
      const rect = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].map((c) => Math.round(c.top))).size;
      return {
        text: clone.textContent ?? '',
        html: el.innerHTML,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        editable: el.getAttribute('contenteditable') === 'true',
        lines,
        font: parseFloat(getComputedStyle(el).fontSize),
      };
    }, run);
  t.runs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
        el.getAttribute('data-run'),
      ),
    );
  t.runsOfBlock = async (blockId) => (await t.runs()).filter((r) => r.startsWith(`${blockId}/`));
  t.selectionText = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  t.boxOf = (id) =>
    page.evaluate((blockId) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      if (!inner) return null;
      const free = inner.closest('.free') ?? inner;
      const f = free.getBoundingClientRect();
      const i = inner.getBoundingClientRect();
      return {
        free: { x: f.x, y: f.y, w: f.width, h: f.height },
        inner: { x: i.x, y: i.y, w: i.width, h: i.height },
      };
    }, id);
  t.handleControls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
    );
  t.ctl = (control) => page.locator(`[data-control="${control}"]`);
  t.clickControl = async (control) => {
    const el = t.ctl(control).first();
    await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
    const r = await el.boundingBox();
    if (!r) throw new Error(`no control ${control}`);
    await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
  };
  t.has = (selector) =>
    page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
  t.visible = (control) => t.has(`[data-control="${control}"]`);
  t.openMenu = async (id) => {
    await t.clickControl(`menubar.${id}`);
    await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
    await sleep(rand(150, 300));
  };
  t.hoverRow = async (rowId, waitFor) => {
    const row = t.ctl(`menu.${rowId}`).first();
    const r = await row.boundingBox();
    if (!r) throw new Error(`no menu row ${rowId}`);
    await t.moveHuman(
      { x: r.x - 20, y: r.y + r.height / 2 },
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      6,
    );
    await sleep(rand(250, 400));
    if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
  };
  t.clickRow = async (rowId) => {
    const row = t.ctl(`menu.${rowId}`).first();
    const r = await row.boundingBox();
    if (!r) throw new Error(`no menu row ${rowId}`);
    await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
  };
  t.clearAll = async () => {
    await t.press('Escape', 3);
    await sleep(150);
  };
  t.selectObject = async (id) => {
    const b = await t.boxOf(id);
    if (!b) return null;
    const c = b.inner.w > 4 && b.inner.h > 4 ? t.center(b.inner) : t.center(b.free);
    await t.clickAt(c.x, c.y);
    let ctrls = await t.handleControls();
    if (!ctrls.includes(`handle.${id}.move`)) {
      await t.clickAt(b.free.x + 4, b.free.y + 4);
      ctrls = await t.handleControls();
    }
    if (await t.editing()) {
      await t.press('Escape');
      await sleep(200);
      ctrls = await t.handleControls();
    }
    return ctrls.includes(`handle.${id}.move`) ? ctrls : null;
  };
  t.openRun = async (run) => {
    const info = await t.runInfo(run);
    if (!info) throw new Error(`no run ${run} on the stage`);
    await t.dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    return t.editing();
  };
  t.snackbar = () =>
    page.evaluate(() => document.querySelector('.ts-snackbar.is-on')?.textContent?.trim() ?? null);
  t.rightClickAt = async (x, y) => {
    await t.moveHuman({ x: x - 30, y: y - 20 }, { x, y }, 6);
    await page.mouse.click(x, y, { button: 'right' });
    await sleep(rand(200, 350));
  };
  t.contextRows = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ts-context-menu [data-control^="menu."], .ts-context-menu [data-control^="context."]',
        ),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-control')),
    );
  t.newDeck = async () => {
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
    const info = await t.invoke('deck.info');
    const s = await t.state();
    const allRuns = await t.runs();
    const head = allRuns.find((x) => /heading/.test(x)) ?? allRuns[0] ?? null;
    if (await t.visible('dialog.namePrompt'))
      await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
    await t.openRun(head);
    await t.typeHuman('B2 product round');
    await sleep(300);
    await t.press('Escape');
    await t.waitRevision(1, 30_000);
    await t.settled();
    await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
    if (await t.visible('dialog.namePrompt'))
      await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
    return { id: info.id, titleSlide: s.slideId, head };
  };
  t.uploadThrough = async (open, name = 'logo.png', buffer = null, mimeType = 'image/png') => {
    const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
    await open();
    const fc = await chooser;
    await fc.setFiles({ name, mimeType, buffer: buffer ?? (await t.pngBuffer(120, 80)) });
    return Date.now();
  };
  return t;
}

#!/usr/bin/env node
// The pictures and backgrounds audit on production (gslides-parity focus round, 2026-09-15).
// Drives the picture and background features of the deck editor the way a person does, at human
// speed, against https://turboslide.vercel.app, and writes one row per interaction to a JSON
// table. Imports playwright-core from the repo root and nothing else from the repository.
//
//   node audit-images.mjs --base https://turboslide.vercel.app --json <path> --shots <dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const JSON_OUT = arg('json', null);
const SHOTS = arg('shots', null);
const WORK = arg('work', path.dirname(new URL(import.meta.url).pathname));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
mkdirSync(WORK, { recursive: true });

const URL_EXTERNAL = 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
const URL_A = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
const URL_B = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/500px-Python-logo-notext.svg.png';
const URL_BG = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/960px-Fronalpstock_big.jpg';

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const startedAt = Date.now();
const consoleErrors = [];
let shotIndex = 0;
/**
 * One row: feature, interaction, result (works, broken, flaky, not driven), evidence. The
 * severity, need and why are judged when the note is written; the script records only facts.
 */
const record = (feature, interaction, result, evidence, extra = {}) => {
  const row = {
    n: rows.length + 1,
    feature,
    interaction,
    result,
    evidence: String(evidence),
    consoleErrorsAt: consoleErrors.length,
    ...extra,
  };
  rows.push(row);
  console.log(`[${result}] ${row.n} ${feature} :: ${interaction}\n      ${row.evidence}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * Runs an interaction up to three times: works on the first pass, flaky when a later try passes,
 * broken when all three fail. `reset` puts the editor back between tries.
 */
const attempt = async (feature, interaction, fn, { reset, tries = 3 } = {}) => {
  const log = [];
  for (let i = 1; i <= tries; i += 1) {
    let r;
    try {
      r = await fn(i);
    } catch (error) {
      r = { ok: false, evidence: `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` };
    }
    log.push(`try ${i}: ${r.evidence}`);
    if (r.ok) {
      record(feature, interaction, i === 1 ? 'works' : 'flaky', log.join(' | '), r.extra ?? {});
      return r;
    }
    if (i < tries && reset) await reset().catch(() => undefined);
  }
  record(feature, interaction, 'broken', log.join(' | '));
  return { ok: false };
};
const notDriven = (feature, interaction, why) =>
  record(feature, interaction, 'not driven', `not driven: ${why}`);

// ---------------------------------------------------------------------------------------------
// human speed

const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const MOD_KEY = { shift: 'Shift', alt: 'Alt' };
const drag = async (page, from, to, { mods = [], steps = 14, during } = {}) => {
  const cur = { x: from.x - 30, y: from.y - 20 };
  await moveHuman(page, cur, from, 6);
  await sleep(rand(60, 120));
  for (const m of mods) await page.keyboard.down(MOD_KEY[m]);
  await page.mouse.down();
  await sleep(rand(60, 110));
  await moveHuman(page, from, to, steps);
  await sleep(rand(80, 140));
  const mid = during ? await during() : undefined;
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(MOD_KEY[m]);
  await sleep(rand(120, 200));
  return mid;
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

// ---------------------------------------------------------------------------------------------
// the product

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
/** Every block of a slide with an id and a type; pos when present. */
const blocksOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string' && !('slots' in node))
        out.push({ id: node.id, type: node.type, pos: node.pos ?? null, block: node });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
const blockOf = async (page, slideId, id) =>
  (await blocksOf(page, slideId)).find((o) => o.id === id) ?? null;
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const kOf = (page) =>
  page.evaluate((sel) => {
    const sheet = document.querySelector(sel);
    return sheet ? sheet.getBoundingClientRect().width / 1600 : 0;
  }, SHEET);
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const readout = (page) =>
  page.evaluate(() => document.querySelector('.ts-readout')?.textContent ?? null);
const chip = (page) =>
  page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
const guidesCount = (page) =>
  page.evaluate(() => document.querySelectorAll('.ts-guide, .ts-guides line').length);
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.ts-snackbar, .pt-toast, [role="status"]')]
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean)
        .join(' | ') || null,
  );
/** The free box of an object, its content root and the picture inside it. */
const boxOf = (page, id) =>
  page.evaluate(
    ([blockId, sheetSel]) => {
      const inner = document.querySelector(`${sheetSel} [data-block="${blockId}"]`);
      if (!inner) return null;
      const free = inner.closest('.free') ?? inner;
      const f = free.getBoundingClientRect();
      const i = inner.getBoundingClientRect();
      const img = inner.tagName.toLowerCase() === 'img' ? inner : inner.querySelector('img');
      const ir = img ? img.getBoundingClientRect() : null;
      const dither = inner.querySelector('canvas.picture-dither');
      const cs = img ? getComputedStyle(img) : null;
      return {
        free: { x: f.x, y: f.y, w: f.width, h: f.height },
        inner: { x: i.x, y: i.y, w: i.width, h: i.height },
        img: ir
          ? {
              x: ir.x,
              y: ir.y,
              w: ir.width,
              h: ir.height,
              natural: `${img.naturalWidth}x${img.naturalHeight}`,
              complete: img.complete,
              opacity: cs?.opacity,
              filter: cs?.filter,
              src: (img.getAttribute('src') ?? '').slice(0, 60),
            }
          : null,
        cropFrame: Boolean(inner.querySelector('.shot-crop') || inner.matches('.shot-crop')),
        dither: dither ? { hidden: dither.hidden, w: dither.width, h: dither.height } : null,
        tag: inner.tagName.toLowerCase(),
        cls: typeof inner.className === 'string' ? inner.className : '',
      };
    },
    [id, SHEET],
  );
const handleControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const handleRect = (page, control) => rectOf(page, `.ts-overlay [data-control="${control}"]`);
const fmt = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const posStr = (p) =>
  p
    ? `${fmt(p.x)},${fmt(p.y)} ${fmt(p.w)}x${fmt(p.h)}${p.rotate ? ` r${fmt(p.rotate)}` : ''}`
    : 'none';
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// menus and controls
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const menuRoot = (id) => `#ts-menu-${id}`;
const openMenu = async (page, id) => {
  const bar = ctl(page, `menubar.${id}`);
  const r = await bar.boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(menuRoot(id)).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const row = ctl(page, `menu.${rowId}`);
  const r = await row.boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(page, { x: r.x - 20, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
  await sleep(rand(250, 400));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clickRow = async (page, rowId) => {
  const row = ctl(page, `menu.${rowId}`);
  const r = await row.boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const has = (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const rowState = (page, rowId) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-control="menu.${id}"]`);
    if (!el) return 'absent';
    return el.getAttribute('aria-disabled') === 'true' || el.disabled ? 'disabled' : 'enabled';
  }, rowId);
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};

// ---------------------------------------------------------------------------------------------
// the browser

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
} catch (error) {
  console.log(`clipboard permissions: ${error instanceof Error ? error.message : String(error)}`);
}
const page = await context.newPage();
/** The network facts a row may cite: failed requests and non 2xx responses, with the body head. */
const net = [];
page.on('requestfailed', (req) => net.push(`failed ${req.method()} ${req.url().slice(0, 140)} :: ${req.failure()?.errorText ?? '?'}`));
page.on('response', async (res) => {
  const url = res.url();
  const status = res.status();
  const server = /\/_serverFn\//.test(url);
  if (status < 400 && !server) return;
  let body = '';
  try {
    body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    body = '(no body)';
  }
  if (server && status < 400 && !/error|Error|refused|limit|allowlist|not in/.test(body)) return;
  net.push(`${status} ${res.request().method()} ${url.replace(BASE, '').slice(0, 120)} :: ${body}`);
});
const netSince = (mark) => net.slice(mark).slice(0, 6).join(' || ') || 'no failed requests';
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});
context.on('page', (p) => p.close().catch(() => undefined));
const shot = async (name) => {
  if (!SHOTS) return null;
  shotIndex += 1;
  const file = path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file }).catch(() => undefined);
  return file;
};

// two PNG files drawn in the page, so the upload, the drop and the paste have real files
const PNG_A = path.join(WORK, 'audit-picture-a.png');
const PNG_B = path.join(WORK, 'audit-picture-b.png');
const drawPng = async (w, h, fill, mark) => {
  const dataUrl = await page.evaluate(
    ([W, H, f, m]) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = f;
      g.fillRect(0, 0, W, H);
      g.fillStyle = m;
      g.fillRect(0, 0, W / 2, H / 2);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(W * 0.75, H * 0.75, Math.min(W, H) / 5, 0, Math.PI * 2);
      g.fill();
      return c.toDataURL('image/png');
    },
    [w, h, fill, mark],
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

let deckId = '';
let SLIDE = '';
let build = null;
try {
  await page.goto('about:blank');
  writeFileSync(PNG_A, await drawPng(640, 400, '#1d4ed8', '#f59e0b'));
  writeFileSync(PNG_B, await drawPng(500, 500, '#15803d', '#e11d48'));

  // ---- 1. the fresh deck and a second slide
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  build = await page.evaluate(() => {
    const d = window.turboslide.studio.describe();
    return { version: d.version ?? d.build ?? null, keys: Object.keys(d.state ?? {}) };
  });
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  record('setup', 'open /new', /^untitled-/.test(deckId) ? 'works' : 'broken', `deck ${deckId}; state keys ${build.keys.join(',')}`);

  const firstOrder = await slideOrder(page);
  await clickControl(page, 'toolbar.newSlide');
  const order = await pollUntil(() => slideOrder(page), (o) => o.length > firstOrder.length, 20_000);
  SLIDE = order.find((id) => !firstOrder.includes(id)) ?? order[order.length - 1];
  await pollUntil(() => state(page), (s) => s.slideId === SLIDE, 8000);
  await settled(page);
  await sleep(500);
  record('setup', 'New slide from the toolbar', SLIDE && SLIDE !== firstOrder[0] ? 'works' : 'broken', `slides ${order.length}; working slide ${SLIDE}; active ${(await state(page)).slideId}`);
  let k = await kOf(page);
  const sheetPoint = async (sx, sy) => {
    const sheet = await rectOf(page, SHEET);
    const kk = sheet.w / 1600;
    return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
  };
  const newBlockAfter = async (before, timeout = 30_000, types = ['shot', 'picture']) => {
    const objs = await pollUntil(
      () => blocksOf(page, SLIDE),
      (o) => o.some((x) => !before.includes(x.id) && types.includes(x.type)),
      timeout,
    );
    return objs.find((x) => !before.includes(x.id) && types.includes(x.type)) ?? null;
  };
  const ids = async () => (await blocksOf(page, SLIDE)).map((o) => o.id);
  const describeBlock = async (b) => {
    if (!b) return 'no block';
    const box = await boxOf(page, b.id);
    return `${b.type} ${b.id} asset ${b.block.asset ?? '?'} pos ${posStr(b.pos)}; on sheet ${box ? `box ${fmt(box.free.w)}x${fmt(box.free.h)} css, img ${box.img ? `${fmt(box.img.w)}x${fmt(box.img.h)} natural ${box.img.natural} complete ${box.img.complete}` : 'none'}` : 'not rendered'}`;
  };
  const selectObject = async (id) => {
    let b = await boxOf(page, id);
    if (!b) return null;
    let c = b.inner.w > 4 && b.inner.h > 4 ? center(b.inner) : center(b.free);
    await clickAt(page, c.x, c.y);
    let ctrls = await handleControls(page);
    if (!ctrls.includes(`handle.${id}.move`)) {
      await press(page, 'Escape');
      await sleep(200);
      c = center(b.free);
      await clickAt(page, c.x, c.y);
      ctrls = await handleControls(page);
    }
    if (!ctrls.includes(`handle.${id}.move`)) {
      b = await boxOf(page, id);
      c = { x: b.free.x + 4, y: b.free.y + 4 };
      await clickAt(page, c.x, c.y);
      await sleep(200);
      ctrls = await handleControls(page);
    }
    return ctrls.includes(`handle.${id}.move`) ? ctrls : null;
  };
  const deleteObject = async (id) => {
    const sel = await selectObject(id);
    if (!sel) return false;
    await press(page, 'Delete');
    const gone = await pollUntil(() => blockOf(page, SLIDE, id), (b) => b === null, 10_000);
    await settled(page);
    return gone === null;
  };
  const waitPos = (id, test, timeout = 12_000) =>
    pollUntil(() => blockOf(page, SLIDE, id), (b) => b && b.pos && test(b.pos, b), timeout);

  // ---- 2. insert a picture by every path
  let byUrl = null;
  const insertByUrl = async (url) => {
    const before = await ids();
    const mark = net.length;
    await openMenu(page, 'insert');
    await hoverRow(page, 'insert.image', '[data-control="menu.insert.image.byUrl"]');
    await clickRow(page, 'insert.image.byUrl');
    await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.imageByUrl.url');
    await typeHuman(page, url);
    await sleep(800);
    const preview = await page.evaluate(() => {
      const img = document.querySelector('[data-control="dialog.imageByUrl"] img');
      return img ? `${img.naturalWidth}x${img.naturalHeight}` : 'no preview';
    });
    const t0 = Date.now();
    await clickControl(page, 'dialog.imageByUrl.ok');
    const obj = await newBlockAfter(before, 40_000);
    const err = await page.evaluate(() => document.querySelector('[data-control="dialog.imageByUrl"] [role="alert"]')?.textContent ?? null);
    const dialogOpen = await has(page, '[data-control="dialog.imageByUrl"]');
    if (dialogOpen) await closeMenus(page);
    await settled(page);
    return {
      ok: Boolean(obj) && !dialogOpen,
      obj,
      evidence: `preview in the dialog ${preview}; ${Date.now() - t0} ms; ${await describeBlock(obj)}; dialog still open ${dialogOpen}${err ? `; dialog said "${err}"` : ''}; network ${netSince(mark)}`,
    };
  };
  await attempt('Insert picture', 'Insert > Image > By URL with an https PNG on a host outside the capture allowlist (raw.githubusercontent.com), then Insert', () => insertByUrl(URL_EXTERNAL), { reset: () => closeMenus(page) });
  await attempt('Insert picture', 'Insert > Image > By URL with an https PNG on an allowlisted host (upload.wikimedia.org), then Insert', async () => {
    const r = await insertByUrl(URL_A);
    if (r.ok) byUrl = r.obj;
    return r;
  }, { reset: () => closeMenus(page) });
  await shot('after-insert-by-url');

  let uploaded = null;
  await attempt('Insert picture', 'Insert > Image > Upload from computer, a PNG through the file chooser', async () => {
    const before = await ids();
    const mark = net.length;
    await openMenu(page, 'insert');
    await hoverRow(page, 'insert.image', '[data-control="menu.insert.image.upload"]');
    const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await clickRow(page, 'insert.image.upload');
    const chooser = await chooserP;
    if (!chooser) return { ok: false, evidence: 'no file chooser opened within 8 s' };
    const t0 = Date.now();
    await chooser.setFiles(PNG_A);
    const obj = await newBlockAfter(before, 45_000);
    await settled(page);
    uploaded = obj;
    return { ok: Boolean(obj), evidence: `file chooser opened (multiple ${chooser.isMultiple()}); ${Date.now() - t0} ms; ${await describeBlock(obj)}; snackbar ${await snackbar(page)}; network ${netSince(mark)}` };
  }, { reset: () => closeMenus(page) });

  let dropped = null;
  await attempt('Insert picture', 'drag a PNG file from the desktop and drop it on the slide (a DataTransfer built in the page, dispatched as dragover and drop at a point)', async () => {
    await clearAll(page);
    const before = await ids();
    const b64 = readFileSync(PNG_B).toString('base64');
    const dt = await page.evaluateHandle(async (data) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const file = new File([blob], 'dropped-logo.png', { type: 'image/png' });
      const t = new DataTransfer();
      t.items.add(file);
      return t;
    }, b64);
    const at = await sheetPoint(1000, 560);
    await page.mouse.move(at.x - 60, at.y - 40);
    await page.dispatchEvent(SHEET, 'dragenter', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    await page.dispatchEvent(SHEET, 'dragover', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    await sleep(200);
    const mark = net.length;
    await page.dispatchEvent(SHEET, 'drop', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    const obj = await newBlockAfter(before, 45_000);
    await settled(page);
    dropped = obj;
    return { ok: Boolean(obj), evidence: `dropped at sheet 1000,560; ${await describeBlock(obj)}; snackbar ${await snackbar(page)}; network ${netSince(mark)}` };
  });

  let pasted = null;
  await attempt('Insert picture', 'copy a PNG to the clipboard and press Cmd V on the slide', async (i) => {
    await clearAll(page);
    const before = await ids();
    const b64 = readFileSync(PNG_A).toString('base64');
    const wrote = await page.evaluate(async (data) => {
      try {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return 'clipboard.write ok';
      } catch (e) {
        return `clipboard.write failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }, b64);
    // a click on the sheet's empty ground so the stage owns the paste
    const at = await sheetPoint(1400, 860);
    await clickAt(page, at.x, at.y);
    await clearAll(page);
    let how = `${wrote}; `;
    const mark = net.length;
    await page.keyboard.press(i === 1 ? 'Meta+V' : 'Control+V');
    how += i === 1 ? 'Meta+V' : 'Control+V';
    let obj = await newBlockAfter(before, 12_000);
    if (!obj && i === 3) {
      // the same paste event a browser sends, with the file on it
      const dt = await page.evaluateHandle(async (data) => {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
        const t = new DataTransfer();
        t.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
        return t;
      }, b64);
      await page.evaluate((t) => {
        const ev = new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true });
        document.body.dispatchEvent(ev);
      }, dt);
      how += '; then a synthetic paste event with the file';
      obj = await newBlockAfter(before, 20_000);
    }
    await settled(page);
    pasted = obj;
    return { ok: Boolean(obj), evidence: `${how}; ${await describeBlock(obj)}; snackbar ${await snackbar(page)}; network ${netSince(mark)}` };
  });

  await attempt('Insert picture', 'the toolbar Image button opens the image sources', async () => {
    await clearAll(page);
    await clickControl(page, 'toolbar.insertImage');
    const rows = await pollUntil(
      () => page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.insert.image."]')].map((el) => (el.textContent ?? '').trim()).filter(Boolean)),
      (r) => r.length > 0,
      5000,
    );
    await closeMenus(page);
    return { ok: rows.length > 0, evidence: `rows ${rows.join(', ') || 'none'}` };
  });
  await shot('after-inserts');

  // the subject of the battery: the uploaded PNG (a 640 by 400 file), else the first picture there is
  let all = (await blocksOf(page, SLIDE)).filter((b) => b.type === 'shot' || b.type === 'picture');
  if (all.length === 0) {
    // the battery still needs a picture: the same asset.add and block.insert the dialog dispatches
    const before = await ids();
    const mark = net.length;
    let how = '';
    try {
      const dataUrl = `data:image/png;base64,${readFileSync(PNG_A).toString('base64')}`;
      const s = await state(page);
      const asset = await invoke(page, 'asset.add', { url: dataUrl, role: 'capture', alt: 'audit picture', baseRevision: s.revision });
      const s2 = await state(page);
      await invoke(page, 'block.insert', { slideId: SLIDE, slot: 'main', block: { id: 'shot-audit', type: 'shot', asset: asset.id, pos: { x: 560, y: 300, w: 480, h: 300 } }, baseRevision: Math.max(s2.revision, asset.revision ?? 0) });
      how = `asset ${asset.id} revision ${asset.revision ?? '?'}`;
    } catch (e) {
      how = `failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    }
    const obj = await newBlockAfter(before, 30_000);
    await settled(page);
    record('setup', 'every UI insert path failed: the picture is placed through the window API (asset.add with a data URL, block.insert)', obj ? 'works' : 'broken', `${how}; ${await describeBlock(obj)}; network ${netSince(mark)}`);
    all = (await blocksOf(page, SLIDE)).filter((b) => b.type === 'shot' || b.type === 'picture');
  }
  const subject = uploaded ?? byUrl ?? dropped ?? pasted ?? all[0] ?? null;
  for (const extra of all) {
    if (subject && extra.id === subject.id) continue;
    const ok = await deleteObject(extra.id);
    record('Delete picture', `select the ${extra.type} ${extra.id} and press Delete`, ok ? 'works' : 'broken', ok ? 'the block left the slide' : `the block is still on the slide: ${posStr((await blockOf(page, SLIDE, extra.id))?.pos)}`);
  }
  if (!subject) throw new Error('no picture object to drive; every insert path failed');
  const ID = subject.id;
  await clearAll(page);
  // a known place for the battery, room on every side
  {
    const s = await state(page);
    await invoke(page, 'block.set', { slideId: SLIDE, blockId: ID, path: '/pos', value: { x: 560, y: 300, w: 480, h: 300 }, baseRevision: s.revision }).catch(() => undefined);
    await waitPos(ID, (p) => p.x === 560 && p.y === 300);
    await settled(page);
  }
  k = await kOf(page);
  const startBox = await boxOf(page, ID);
  record('setup', 'the subject placed at 560,300 480x300 through the window API', startBox ? 'works' : 'broken', `${await describeBlock(await blockOf(page, SLIDE, ID))}; k ${fmt(k)}; frame past the box: ${startBox ? `${fmt(startBox.inner.h - startBox.free.h)} css px tall, ${fmt(startBox.inner.w - startBox.free.w)} wide` : '?'}`);

  await attempt('Select picture', 'click the picture: the chip, the eight handles and the ring', async () => {
    const ctrls = await selectObject(ID);
    const c = await chip(page);
    const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) => ctrls?.includes(`handle.${ID}.resize.${d}`));
    const tail = await page.evaluate(() => [...document.querySelectorAll('[data-control="toolbar.tail"] [data-control^="toolbar."]')].map((el) => el.getAttribute('data-control')).filter((c) => c !== 'toolbar.tail').join(','));
    return { ok: Boolean(ctrls) && dirs.length === 8 && ctrls.includes(`handle.${ID}.rotate`), evidence: `chip "${c}"; handles ${dirs.join(',')}${ctrls?.includes(`handle.${ID}.rotate`) ? ',rotate' : ''}; toolbar tail ${tail || 'none'}` };
  });
  await shot('selected');

  // ---- 3. move, guides, snapping, nudges
  await attempt('Move picture', 'drag the picture by its frame edge 120 by 80 sheet px', async () => {
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
    const from = edge ? { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 } : center(await handleRect(page, `handle.${ID}.move`));
    const to = { x: from.x + 120 * k, y: from.y + 80 * k };
    const mid = await drag(page, from, to, { during: async () => ({ readout: await readout(page), guides: await guidesCount(page) }) });
    const after = await waitPos(ID, (p) => p.x !== before.pos.x || p.y !== before.pos.y);
    await settled(page);
    const ro = await readout(page);
    const dx = after.pos.x - before.pos.x;
    const dy = after.pos.y - before.pos.y;
    return { ok: near(dx, 120, 12) && near(dy, 80, 12) && ro === null, evidence: `moved ${fmt(dx)},${fmt(dy)}; readout during ${mid.readout ?? 'none'}, after ${ro ?? 'none'}; guides during ${mid.guides}; pos ${posStr(before.pos)} -> ${posStr(after.pos)}` };
  }, { reset: () => clearAll(page) });

  await attempt('Alignment guides', 'drag the picture so its centre comes within 3 px of the slide centre: a guide shows and the centre snaps to 800', async () => {
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
    const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
    const cx = before.pos.x + before.pos.w / 2;
    const targetDx = 800 + 3 - cx;
    const to = { x: from.x + targetDx * k, y: from.y };
    const mid = await drag(page, from, to, { steps: 20, during: async () => ({ guides: await guidesCount(page), axes: await page.evaluate(() => [...document.querySelectorAll('.ts-guide')].map((g) => g.getAttribute('data-axis')).join(',')) }) });
    const after = await waitPos(ID, (p) => p.x !== before.pos.x);
    await settled(page);
    const centreAfter = after.pos.x + after.pos.w / 2;
    return { ok: mid.guides > 0 && near(centreAfter, 800, 0.5), evidence: `guides during ${mid.guides} (${mid.axes}); centre ${fmt(cx)} -> ${fmt(centreAfter)} (aimed at 803); pos ${posStr(after.pos)}` };
  }, { reset: () => clearAll(page) });
  await shot('snap-centre');

  await attempt('Alignment guides', 'drag the picture so its left edge comes within 3 px of the title box left edge: a guide shows and the edge snaps', async () => {
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const others = (await blocksOf(page, SLIDE)).filter((b) => b.id !== ID && b.pos && b.pos.w > 40);
    const other = others[0];
    if (!other) return { ok: false, evidence: 'no other positioned object to snap to' };
    const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
    const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
    const targetDx = other.pos.x + 3 - before.pos.x;
    const to = { x: from.x + targetDx * k, y: from.y };
    const mid = await drag(page, from, to, { steps: 20, during: async () => ({ guides: await guidesCount(page) }) });
    const after = await waitPos(ID, (p) => p.x !== before.pos.x);
    await settled(page);
    return { ok: mid.guides > 0 && near(after.pos.x, other.pos.x, 0.5), evidence: `other ${other.type} ${other.id} at x ${fmt(other.pos.x)}; guides during ${mid.guides}; x ${fmt(before.pos.x)} -> ${fmt(after.pos.x)} (aimed at ${fmt(other.pos.x + 3)})` };
  }, { reset: () => clearAll(page) });

  await attempt('Nudge picture', 'ArrowRight moves 1 px, Shift ArrowRight 10 px, ArrowDown 1 px', async () => {
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    await press(page, 'ArrowRight');
    const a = await waitPos(ID, (p) => p.x !== before.pos.x, 6000);
    await press(page, 'Shift+ArrowRight');
    const b = await waitPos(ID, (p) => p.x !== a.pos.x, 6000);
    await press(page, 'ArrowDown');
    const c = await waitPos(ID, (p) => p.y !== before.pos.y, 6000);
    await settled(page);
    return { ok: near(a.pos.x - before.pos.x, 1, 0.01) && near(b.pos.x - a.pos.x, 10, 0.01) && near(c.pos.y - before.pos.y, 1, 0.01), evidence: `x ${fmt(before.pos.x)} -> ${fmt(a.pos.x)} -> ${fmt(b.pos.x)}; y ${fmt(before.pos.y)} -> ${fmt(c.pos.y)}` };
  }, { reset: () => clearAll(page) });

  // back to the known place
  {
    await clearAll(page);
    const s = await state(page);
    await invoke(page, 'block.set', { slideId: SLIDE, blockId: ID, path: '/pos', value: { x: 560, y: 300, w: 480, h: 300 }, baseRevision: s.revision }).catch(() => undefined);
    await waitPos(ID, (p) => p.x === 560 && p.y === 300);
    await settled(page);
  }

  // ---- 4. resize by every handle, plain and with Shift, undone after each
  const expectResize = (pos, dir, dx, dy) => {
    let { x, y, w, h } = pos;
    if (dir.includes('e')) w += dx;
    if (dir.includes('w')) {
      x += dx;
      w -= dx;
    }
    if (dir.includes('s')) h += dy;
    if (dir.includes('n')) {
      y += dy;
      h -= dy;
    }
    return { x, y, w, h };
  };
  const undoToolbar = async (id, wantPos) => {
    await clickControl(page, 'toolbar.undo');
    const back = await waitPos(id, (p) => p.x === wantPos.x && p.y === wantPos.y && p.w === wantPos.w && p.h === wantPos.h, 12_000);
    await settled(page);
    return back && back.pos.x === wantPos.x && back.pos.w === wantPos.w && back.pos.h === wantPos.h && back.pos.y === wantPos.y;
  };
  const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  let contentOff = [];
  for (const mod of [null, 'shift']) {
    for (const dir of DIRS) {
      const sign = { x: dir.includes('w') ? -1 : 1, y: dir.includes('n') ? -1 : 1 };
      const dxS = dir.includes('e') || dir.includes('w') ? 90 * sign.x : 0;
      const dyS = dir.includes('n') || dir.includes('s') ? 60 * sign.y : 0;
      await attempt('Resize picture', `drag the ${dir} handle by ${dxS},${dyS} sheet px${mod ? ' with Shift held' : ''}, then Undo from the toolbar`, async () => {
        await clearAll(page);
        const ctrls = await selectObject(ID);
        if (!ctrls) return { ok: false, evidence: 'could not select the picture' };
        const before = await blockOf(page, SLIDE, ID);
        const hr = await handleRect(page, `handle.${ID}.resize.${dir}`);
        if (!hr) return { ok: false, evidence: `no handle handle.${ID}.resize.${dir}` };
        const from = center(hr);
        const to = { x: from.x + dxS * k, y: from.y + dyS * k };
        const chipBefore = await chip(page);
        const mid = await drag(page, from, to, { mods: mod ? [mod] : [], during: async () => ({ readout: await readout(page), box: await boxOf(page, ID) }) });
        const after = await waitPos(ID, (p) => p.w !== before.pos.w || p.h !== before.pos.h || p.x !== before.pos.x || p.y !== before.pos.y);
        await settled(page);
        const roAfter = await readout(page);
        const box = await boxOf(page, ID);
        const exp = expectResize(before.pos, dir, dxS, dyS);
        let geometryOk;
        let geometry;
        if (!mod) {
          geometryOk = near(after.pos.x, exp.x, 12) && near(after.pos.y, exp.y, 12) && near(after.pos.w, exp.w, 12) && near(after.pos.h, exp.h, 12);
          geometry = `expected ${posStr(exp)}`;
        } else {
          const r0 = before.pos.w / before.pos.h;
          const r1 = after.pos.w / after.pos.h;
          const changed = after.pos.w !== before.pos.w || after.pos.h !== before.pos.h;
          geometryOk = changed && Math.abs(r1 - r0) / r0 < 0.03;
          geometry = `aspect ${fmt(r0)} -> ${fmt(r1)}`;
        }
        // the content against the box: the img rect against the free box (W7 measures the frame past the box)
        const contentOk = box?.img ? near(box.img.w, box.free.w, 3) && near(box.img.h, box.free.h, 3) : false;
        const content = box?.img ? `img ${fmt(box.img.w)}x${fmt(box.img.h)} in box ${fmt(box.free.w)}x${fmt(box.free.h)} css (frame ${fmt(box.inner.w)}x${fmt(box.inner.h)})` : 'no img';
        if (!contentOk) contentOff.push(`${dir}${mod ? '+shift' : ''}: ${content}`);
        const readoutDuringOk = /^\d+ × \d+$/.test(mid.readout ?? '');
        const undone = await undoToolbar(ID, before.pos);
        if (dir === 'se' && !mod) await shot('after-resize-se');
        return {
          ok: geometryOk && readoutDuringOk && roAfter === null && undone,
          evidence: `pos ${posStr(before.pos)} -> ${posStr(after.pos)} (${geometry}${geometryOk ? '' : ', off'}); ${content}${contentOk ? '' : ' (content did not fill the box)'}; readout during ${mid.readout ?? 'none'}, after ${roAfter ?? 'none'}; chip "${chipBefore}" -> "${await chip(page)}"; undo restored ${undone}`,
        };
      }, { reset: async () => { await clearAll(page); const s = await state(page); await invoke(page, 'block.set', { slideId: SLIDE, blockId: ID, path: '/pos', value: { x: 560, y: 300, w: 480, h: 300 }, baseRevision: s.revision }).catch(() => undefined); await waitPos(ID, (p) => p.x === 560 && p.w === 480); } });
    }
  }
  record('Resize picture', 'the picture content against its box across the 16 resizes', contentOff.length === 0 ? 'works' : 'broken', contentOff.length === 0 ? 'the img filled the box within 3 css px after every resize' : `${contentOff.length} of 16 off: ${contentOff.slice(0, 3).join('; ')}`);

  await attempt('Resize picture', 'drag the se handle with Alt held: the box grows from its centre', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const hr = await handleRect(page, `handle.${ID}.resize.se`);
    const from = center(hr);
    const to = { x: from.x + 60 * k, y: from.y + 40 * k };
    await drag(page, from, to, { mods: ['alt'] });
    const after = await waitPos(ID, (p) => p.w !== before.pos.w);
    await settled(page);
    const cxB = before.pos.x + before.pos.w / 2;
    const cxA = after.pos.x + after.pos.w / 2;
    const undone = await undoToolbar(ID, before.pos);
    return { ok: near(cxA, cxB, 6) && after.pos.w > before.pos.w && undone, evidence: `pos ${posStr(before.pos)} -> ${posStr(after.pos)}; centre x ${fmt(cxB)} -> ${fmt(cxA)}; undo restored ${undone}` };
  }, { reset: () => clearAll(page) });

  // ---- 5. rotate
  await attempt('Rotate picture', 'drag the rotation ring about 35 degrees clockwise, then Undo', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const ring = await handleRect(page, `handle.${ID}.rotate`);
    const box = await boxOf(page, ID);
    if (!ring || !box) return { ok: false, evidence: 'no ring or box' };
    const c = center(box.free);
    const r0 = center(ring);
    const R = Math.hypot(r0.x - c.x, r0.y - c.y);
    const a0 = Math.atan2(r0.y - c.y, r0.x - c.x);
    const a1 = a0 + (35 * Math.PI) / 180;
    const to = { x: c.x + R * Math.cos(a1), y: c.y + R * Math.sin(a1) };
    const mid = await drag(page, r0, to, { steps: 18, during: async () => ({ readout: await readout(page) }) });
    const after = await waitPos(ID, (p) => (p.rotate ?? 0) !== (before.pos.rotate ?? 0));
    await settled(page);
    const ro = await pollUntil(() => readout(page), (r) => r === null, 3000);
    const angle = after.pos.rotate ?? 0;
    await shot('rotated');
    await clickControl(page, 'toolbar.undo');
    const back = await waitPos(ID, (p) => (p.rotate ?? 0) === (before.pos.rotate ?? 0));
    await settled(page);
    return { ok: near(angle, 35, 6) && ro === null && Boolean(back), evidence: `rotate ${before.pos.rotate ?? 0} -> ${fmt(angle)}; readout during ${mid.readout ?? 'none'}, after ${ro ?? 'none'}; undo restored ${Boolean(back)}` };
  }, { reset: () => clearAll(page) });

  // ---- 6. crop
  const cropFacts = () =>
    page.evaluate(() => {
      const frame = document.querySelector('.ts-overlay .ts-crop-frame');
      const full = document.querySelector('.ts-overlay .ts-crop-full');
      const r = frame?.getBoundingClientRect();
      const f = full?.getBoundingClientRect();
      return {
        on: Boolean(frame),
        frame: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        full: f ? { x: f.x, y: f.y, w: f.width, h: f.height } : null,
        handles: [...document.querySelectorAll('.ts-overlay [data-control*=".crop."]')].map((el) => el.getAttribute('data-control')),
        chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
        stageCrop: Boolean(document.querySelector('.ts-stagewrap[data-crop], .ts-editor[data-crop]')),
      };
    });
  await attempt('Crop picture', 'double click the picture: crop mode with the dimmed full picture, the frame and eight crop handles', async () => {
    await clearAll(page);
    await selectObject(ID);
    const box = await boxOf(page, ID);
    const c = center(box.free);
    await dblclickAt(page, c.x, c.y);
    const f = await pollUntil(cropFacts, (x) => x.on, 6000);
    return { ok: f.on && f.handles.length === 8, evidence: `crop frame ${f.on}; handles ${f.handles.length} (${f.handles.slice(0, 2).join(',')}...); chip "${f.chip}"; frame ${f.frame ? `${fmt(f.frame.w)}x${fmt(f.frame.h)}` : 'none'}, full ${f.full ? `${fmt(f.full.w)}x${fmt(f.full.h)}` : 'none'}` };
  }, { reset: () => clearAll(page) });
  await shot('crop-mode');

  let cropBefore = await blockOf(page, SLIDE, ID);
  await attempt('Crop picture', 'drag the east crop edge 100 sheet px to the left: the frame narrows by 100', async () => {
    let f = await cropFacts();
    if (!f.on) {
      await selectObject(ID);
      const box = await boxOf(page, ID);
      await dblclickAt(page, center(box.free).x, center(box.free).y);
      f = await pollUntil(cropFacts, (x) => x.on, 6000);
    }
    const hr = await handleRect(page, `handle.${ID}.crop.e`);
    if (!hr) return { ok: false, evidence: `no crop handle e; on ${f.on}` };
    const from = center(hr);
    const to = { x: from.x - 100 * k, y: from.y };
    const mid = await drag(page, from, to, { during: async () => cropFacts() });
    const after = await cropFacts();
    const dw = (f.frame.w - after.frame.w) / k;
    return { ok: after.on && near(dw, 100, 6), evidence: `frame w ${fmt(f.frame.w / k)} -> ${fmt(after.frame.w / k)} sheet px (delta ${fmt(dw)}); during ${mid.frame ? fmt(mid.frame.w / k) : 'none'}; full stays ${fmt(after.full.w / k)}x${fmt(after.full.h / k)}` };
  });
  await attempt('Crop picture', 'drag the south crop edge 60 sheet px up: the frame shortens by 60', async () => {
    const f = await cropFacts();
    if (!f.on) return { ok: false, evidence: 'not in crop mode' };
    const hr = await handleRect(page, `handle.${ID}.crop.s`);
    if (!hr) return { ok: false, evidence: 'no crop handle s' };
    const from = center(hr);
    const to = { x: from.x, y: from.y - 60 * k };
    await drag(page, from, to);
    const after = await cropFacts();
    const dh = (f.frame.h - after.frame.h) / k;
    return { ok: after.on && near(dh, 60, 6), evidence: `frame h ${fmt(f.frame.h / k)} -> ${fmt(after.frame.h / k)} sheet px (delta ${fmt(dh)})` };
  });
  await shot('crop-dragged');
  let cropApplied = null;
  await attempt('Crop picture', 'press Enter: the crop applies (trim written, the box shrinks, the picture shows the kept part)', async () => {
    const f = await cropFacts();
    await press(page, 'Enter');
    const after = await waitPos(ID, (p, b) => b.block.trim !== undefined || p.w !== cropBefore.pos.w);
    await settled(page);
    const off = await pollUntil(cropFacts, (x) => !x.on, 4000);
    const box = await boxOf(page, ID);
    cropApplied = after;
    return { ok: Boolean(after?.block.trim) && !off.on && Boolean(box?.cropFrame), evidence: `crop mode on before ${f.on}; trim ${JSON.stringify(after?.block.trim ?? null)}; pos ${posStr(cropBefore.pos)} -> ${posStr(after?.pos)}; crop frame on the sheet ${box?.cropFrame}; img ${box?.img ? `${fmt(box.img.w)}x${fmt(box.img.h)} in ${fmt(box.free.w)}x${fmt(box.free.h)}` : 'none'}; crop mode after ${off.on}` };
  });
  await shot('crop-applied');
  await attempt('Crop picture', 'Undo from the toolbar: the trim leaves and the box returns', async () => {
    await clickControl(page, 'toolbar.undo');
    const back = await waitPos(ID, (p, b) => b.block.trim === undefined && p.w === cropBefore.pos.w && p.h === cropBefore.pos.h);
    await settled(page);
    return { ok: Boolean(back), evidence: `trim ${JSON.stringify(back?.block.trim ?? null)}; pos ${posStr(back?.pos)} (before the crop ${posStr(cropBefore.pos)})` };
  });
  await attempt('Crop picture', 'Redo from the toolbar: the crop returns', async () => {
    await clickControl(page, 'toolbar.redo');
    const again = await waitPos(ID, (p, b) => b.block.trim !== undefined);
    await settled(page);
    return { ok: Boolean(again?.block.trim), evidence: `trim ${JSON.stringify(again?.block.trim ?? null)}; pos ${posStr(again?.pos)}` };
  });
  await attempt('Crop picture', 'Format > Image > Crop image enters crop mode; Escape leaves it', async () => {
    await clearAll(page);
    await selectObject(ID);
    await openMenu(page, 'format');
    await hoverRow(page, 'format.image', '[data-control="menu.format.image.cropImage"]');
    const st = await rowState(page, 'format.image.cropImage');
    await clickRow(page, 'format.image.cropImage');
    const on = await pollUntil(cropFacts, (x) => x.on, 6000);
    const before = await blockOf(page, SLIDE, ID);
    await press(page, 'Escape');
    const off = await pollUntil(cropFacts, (x) => !x.on, 4000);
    await settled(page);
    const after = await blockOf(page, SLIDE, ID);
    return { ok: st === 'enabled' && on.on && !off.on, evidence: `row ${st}; crop mode ${on.on} then after Escape ${off.on}; trim unchanged ${JSON.stringify(before?.block.trim) === JSON.stringify(after?.block.trim)}` };
  }, { reset: () => clearAll(page) });
  await attempt('Crop picture', 'the toolbar Crop image button enters crop mode; a west edge drag then Escape: what Escape does with the change', async () => {
    await clearAll(page);
    await selectObject(ID);
    await clickControl(page, 'toolbar.cropImage');
    const on = await pollUntil(cropFacts, (x) => x.on, 6000);
    if (!on.on) return { ok: false, evidence: 'crop mode did not open from the toolbar button' };
    const before = await blockOf(page, SLIDE, ID);
    const hr = await handleRect(page, `handle.${ID}.crop.w`);
    const from = center(hr);
    await drag(page, from, { x: from.x + 40 * k, y: from.y });
    await press(page, 'Escape');
    await sleep(1500);
    await settled(page);
    const after = await blockOf(page, SLIDE, ID);
    const off = await cropFacts();
    const changed = JSON.stringify(before?.block.trim) !== JSON.stringify(after?.block.trim);
    return { ok: on.on && !off.on, evidence: `crop mode from the toolbar ${on.on}; after Escape ${off.on}; trim ${JSON.stringify(before?.block.trim)} -> ${JSON.stringify(after?.block.trim)} (Escape ${changed ? 'committed the edge drag' : 'discarded the edge drag'}); pos ${posStr(before?.pos)} -> ${posStr(after?.pos)}` };
  }, { reset: () => clearAll(page) });

  // ---- 7. Format options: transparency, brightness, dither, recolor; reset
  const openFormatOptions = async () => {
    if (await has(page, '[data-control="panel.formatOptions"]')) return true;
    await clickControl(page, 'toolbar.imageOptions').catch(async () => {
      await openMenu(page, 'format');
      await clickRow(page, 'format.formatOptions');
    });
    await page.locator('[data-control="panel.formatOptions"]').waitFor({ timeout: 8000 });
    return true;
  };
  const openSection = async (id) => {
    const head = page.locator(`[data-control="formatOptions.${id}"]`).first();
    if (!(await head.isVisible().catch(() => false))) return false;
    const section = page.locator(`[data-section="${id}"]`).first();
    const closed = await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => true);
    if (closed) {
      const r = await head.boundingBox();
      await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await sleep(300);
    }
    return true;
  };
  await attempt('Format options', 'the toolbar Image options button opens the panel with Picture, Adjustments and Dither sections', async () => {
    await clearAll(page);
    await selectObject(ID);
    await openFormatOptions();
    const sections = await page.evaluate(() => [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map((el) => el.getAttribute('data-section')));
    const recolor = await page.evaluate(() => Boolean(document.querySelector('[data-control="formatOptions.adjustments.recolor"]')));
    const reflection = await page.evaluate(() => Boolean(document.querySelector('[data-control="formatOptions.adjustments.reflection"]')));
    return { ok: sections.includes('picture') && sections.includes('adjustments'), evidence: `sections ${sections.join(',')}; recolor control present ${recolor}; reflection control present ${reflection}`, extra: { recolor, reflection } };
  }, { reset: () => clearAll(page) });
  await shot('format-options');
  const hasRecolor = rows.find((r) => r.recolor !== undefined)?.recolor ?? false;

  const setSlider = async (control, fraction) => {
    const sel = `[data-control="${control}.slider"]`;
    const r = await rectOf(page, sel);
    if (!r) throw new Error(`no slider ${control}`);
    const range = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return { min: Number(el.min), max: Number(el.max), value: Number(el.value) };
    }, sel);
    const pad = 8;
    const x0 = r.x + pad + ((range.value - range.min) / (range.max - range.min)) * (r.w - 2 * pad);
    const x1 = r.x + pad + fraction * (r.w - 2 * pad);
    const y = r.y + r.h / 2;
    await drag(page, { x: x0, y }, { x: x1, y }, { steps: 10 });
    await sleep(300);
    return page.evaluate((s) => Number(document.querySelector(s)?.value), sel);
  };
  await attempt('Format options', 'drag the Transparency slider to about 40 percent: the picture fades on the slide and adjust.transparency is written', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    const v = await setSlider('formatOptions.adjustments.transparency', 0.4);
    const after = await waitPos(ID, (p, b) => b.block.adjust?.transparency !== undefined, 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    const t = after?.block.adjust?.transparency;
    return { ok: typeof t === 'number' && t > 0.25 && t < 0.55 && box?.img && Math.abs(Number(box.img.opacity) - (1 - t)) < 0.05, evidence: `slider value ${v}; adjust ${JSON.stringify(after?.block.adjust ?? null)}; img opacity on the sheet ${box?.img?.opacity}` };
  }, { reset: () => clearAll(page) });
  await shot('transparency');
  await attempt('Format options', 'drag the Brightness slider to about 70 percent: adjust.brightness is written and the picture filter changes', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    const v = await setSlider('formatOptions.adjustments.brightness', 0.7);
    const after = await waitPos(ID, (p, b) => b.block.adjust?.brightness !== undefined, 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: typeof after?.block.adjust?.brightness === 'number' && after.block.adjust.brightness > 0, evidence: `slider value ${v}; adjust ${JSON.stringify(after?.block.adjust ?? null)}; img filter ${box?.img?.filter}` };
  }, { reset: () => clearAll(page) });
  if (hasRecolor) {
    await attempt('Format options', 'pick a Recolor preset', async () => {
      await selectObject(ID);
      await openFormatOptions();
      await openSection('adjustments');
      await page.selectOption('[data-control="formatOptions.adjustments.recolor"]', { index: 1 });
      const after = await waitPos(ID, (p, b) => b.block.adjust?.recolor !== undefined, 10_000);
      return { ok: Boolean(after?.block.adjust?.recolor), evidence: `adjust ${JSON.stringify(after?.block.adjust ?? null)}` };
    });
  } else {
    notDriven('Format options', 'Recolor a picture', 'production has no Recolor control; the Adjustments section carries Transparency, Brightness and Contrast');
  }
  await attempt('Format options', 'Adjustments > Reset clears the transparency and brightness', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    await clickControl(page, 'formatOptions.adjustments.reset');
    const after = await waitPos(ID, (p, b) => b.block.adjust === undefined || (b.block.adjust.transparency === undefined && b.block.adjust.brightness === undefined), 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: Boolean(after) && (after.block.adjust === undefined || after.block.adjust.transparency === undefined), evidence: `adjust ${JSON.stringify(after?.block.adjust ?? null)}; img opacity ${box?.img?.opacity}` };
  }, { reset: () => clearAll(page) });

  await attempt('Dither', 'the toolbar Dither button screens the picture: block.dither written and a dither canvas drawn over the picture', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    await clickControl(page, 'toolbar.dither');
    const after = await waitPos(ID, (p, b) => b.block.dither !== undefined, 15_000);
    await settled(page);
    const box = await pollUntil(() => boxOf(page, ID), (b) => b?.dither && !b.dither.hidden, 15_000);
    const pressed = await page.evaluate(() => document.querySelector('[data-control="toolbar.dither"]')?.getAttribute('aria-pressed'));
    return { ok: Boolean(after?.block.dither) && Boolean(box?.dither) && !box.dither.hidden, evidence: `dither before ${JSON.stringify(before?.block.dither ?? null)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 120)}; canvas ${box?.dither ? `${box.dither.w}x${box.dither.h} hidden ${box.dither.hidden}` : 'none'}; button aria-pressed ${pressed}` };
  }, { reset: () => clearAll(page) });
  await shot('dither-on');
  await attempt('Dither', 'Format options > Dither: switch the preset to Neutral', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('dither');
    const before = await blockOf(page, SLIDE, ID);
    const present = await has(page, '[data-control="formatOptions.dither.preset.neutral"]');
    if (!present) return { ok: false, evidence: 'no Neutral preset chip in the Dither section' };
    await clickControl(page, 'formatOptions.dither.preset.neutral');
    const after = await waitPos(ID, (p, b) => JSON.stringify(b.block.dither) !== JSON.stringify(before?.block.dither), 10_000);
    await settled(page);
    return { ok: Boolean(after) && JSON.stringify(after.block.dither) !== JSON.stringify(before?.block.dither), evidence: `dither ${JSON.stringify(before?.block.dither ?? null).slice(0, 80)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 80)}` };
  }, { reset: () => clearAll(page) });
  await attempt('Dither', 'the toolbar Dither button again turns the screen off', async () => {
    await clearAll(page);
    await selectObject(ID);
    await clickControl(page, 'toolbar.dither');
    const after = await waitPos(ID, (p, b) => b.block.dither === undefined, 15_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: Boolean(after) && after.block.dither === undefined && (!box?.dither || box.dither.hidden), evidence: `dither ${JSON.stringify(after?.block.dither ?? null)}; canvas ${box?.dither ? `hidden ${box.dither.hidden}` : 'none'}` };
  }, { reset: () => clearAll(page) });

  // ---- 8. reset image (the crop stands from the redo)
  await attempt('Reset image', 'Format > Image > Reset image removes the crop', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    await openMenu(page, 'format');
    await hoverRow(page, 'format.image', '[data-control="menu.format.image.resetImage"]');
    const st = await rowState(page, 'format.image.resetImage');
    if (st !== 'enabled') {
      await closeMenus(page);
      return { ok: false, evidence: `row ${st} with trim ${JSON.stringify(before?.block.trim ?? null)}` };
    }
    await clickRow(page, 'format.image.resetImage');
    const after = await waitPos(ID, (p, b) => b.block.trim === undefined, 12_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: Boolean(after) && after.block.trim === undefined, evidence: `row ${st}; trim ${JSON.stringify(before?.block.trim ?? null)} -> ${JSON.stringify(after?.block.trim ?? null)}; pos ${posStr(before?.pos)} -> ${posStr(after?.pos)}; crop frame on the sheet ${box?.cropFrame}` };
  }, { reset: () => closeMenus(page) });

  // ---- 9. replace image
  await attempt('Replace image', 'right click the picture > Replace image > By URL, a second https PNG, then Replace: the asset changes and the box stays', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const box = await boxOf(page, ID);
    const c = center(box.free);
    await moveHuman(page, { x: c.x - 30, y: c.y - 20 }, c, 6);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.locator('.ts-context-menu').waitFor({ timeout: 6000 });
    const items = await page.evaluate(() => [...document.querySelectorAll('.ts-context-menu [data-control^="menu."]')].map((el) => el.getAttribute('data-control')));
    await hoverRow(page, 'format.image.replaceImage', '[data-control="menu.format.image.replaceImage.byUrl"]');
    await clickRow(page, 'format.image.replaceImage.byUrl');
    await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
    const label = await page.evaluate(() => document.querySelector('[data-control="dialog.imageByUrl.ok"]')?.textContent ?? '');
    await clickControl(page, 'dialog.imageByUrl.url');
    await typeHuman(page, URL_B);
    await sleep(600);
    await clickControl(page, 'dialog.imageByUrl.ok');
    const after = await waitPos(ID, (p, b) => b.block.asset !== before.block.asset, 40_000);
    await settled(page);
    const dialogOpen = await has(page, '[data-control="dialog.imageByUrl"]');
    if (dialogOpen) await closeMenus(page);
    const boxAfter = await pollUntil(() => boxOf(page, ID), (b) => b?.img?.complete && b.img.natural !== box?.img?.natural, 15_000);
    return { ok: Boolean(after) && after.block.asset !== before.block.asset && posStr(after.pos) === posStr(before.pos) && !dialogOpen, evidence: `context rows ${items.length} (${items.filter((i) => i.includes('image')).join(',')}); button "${label}"; asset ${before.block.asset} -> ${after?.block.asset}; pos ${posStr(before.pos)} -> ${posStr(after?.pos)}; img natural ${box?.img?.natural} -> ${boxAfter?.img?.natural}` };
  }, { reset: () => closeMenus(page) });
  await shot('replaced-by-url');
  await attempt('Replace image', 'the toolbar Replace image button > Upload from computer, a PNG through the file chooser', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    await clickControl(page, 'toolbar.replaceImage');
    await page.locator('[data-control="menu.format.image.replaceImage.upload"]').waitFor({ timeout: 6000 });
    const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await clickRow(page, 'format.image.replaceImage.upload');
    const chooser = await chooserP;
    if (!chooser) return { ok: false, evidence: 'no file chooser opened' };
    await chooser.setFiles(PNG_B);
    const after = await waitPos(ID, (p, b) => b.block.asset !== before.block.asset, 40_000);
    await settled(page);
    return { ok: Boolean(after) && after.block.asset !== before.block.asset && posStr(after.pos) === posStr(before.pos), evidence: `asset ${before.block.asset} -> ${after?.block.asset}; pos ${posStr(before.pos)} -> ${posStr(after?.pos)}; snackbar ${await snackbar(page)}` };
  }, { reset: () => closeMenus(page) });

  // ---- 10. the slide background
  const bgFacts = () =>
    page.evaluate((sheetSel) => {
      const sheet = document.querySelector(sheetSel);
      const bg = sheet?.querySelector('.slide-bg');
      const picture = sheet?.querySelector('[data-block="picture"]');
      const pr = picture?.getBoundingClientRect();
      const sr = sheet?.getBoundingClientRect();
      const img = picture?.querySelector('img');
      return {
        bg: bg ? getComputedStyle(bg).backgroundColor : null,
        bgStyle: bg?.getAttribute('style') ?? null,
        picture: pr && sr ? `${Math.round(pr.width)}x${Math.round(pr.height)} at ${Math.round(pr.x - sr.x)},${Math.round(pr.y - sr.y)} of sheet ${Math.round(sr.width)}x${Math.round(sr.height)}` : null,
        pictureImg: img ? `${img.naturalWidth}x${img.naturalHeight} complete ${img.complete}` : null,
        dither: picture?.querySelector('canvas.picture-dither') ? 'canvas' : 'none',
      };
    }, SHEET);
  const swatchesOf = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="dialog.background.color."]')]
        .map((el) => ({ control: el.getAttribute('data-control'), bg: getComputedStyle(el).backgroundColor, pressed: el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') }))
        .filter((s) => !/\.(none|hex)$/.test(s.control)),
    );
  let chosenSwatch = null;
  await attempt('Slide background', 'Slide > Change background, pick a colour, Done: the slide takes the colour', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const swatches = await swatchesOf();
    const before = await bgFacts();
    const pick = swatches.find((s) => s.bg !== before.bg && !/rgba\(0, 0, 0, 0\)/.test(s.bg) && s.pressed !== 'true') ?? swatches[1] ?? swatches[0];
    if (!pick) return { ok: false, evidence: `no colour swatches; dialog controls ${await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog.background."]')].map((e) => e.getAttribute('data-control')).join(','))}` };
    chosenSwatch = pick;
    await clickControl(page, pick.control);
    await sleep(400);
    const preview = await bgFacts();
    await clickControl(page, 'dialog.background.done');
    await page.locator('[data-control="dialog.background"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
    const slide = await pollUntil(() => slideJson(page, SLIDE), (s) => s.background !== undefined, 15_000);
    await settled(page);
    const after = await bgFacts();
    return { ok: Boolean(slide.background) && after.bg !== null && after.bg === pick.bg, evidence: `swatches ${swatches.length}; picked ${pick.control} (${pick.bg}); preview while open ${preview.bg}; slide.background ${JSON.stringify(slide.background ?? null)}; .slide-bg after ${after.bg} (${after.bgStyle})` };
  }, { reset: () => closeMenus(page) });
  await shot('background-colour');

  await attempt('Slide background', 'the toolbar Background button opens the same dialog', async () => {
    await clearAll(page);
    await clickControl(page, 'toolbar.background');
    const open = await has(page, '[data-control="dialog.background"]');
    await closeMenus(page);
    return { ok: open, evidence: `dialog.background visible ${open}` };
  });

  await attempt('Slide background', 'Change background > Choose image > By URL, an https PNG: a picture object covers the slide at the bottom of the stack', async () => {
    await clearAll(page);
    const before = await ids();
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.background.choose.byUrl');
    await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.imageByUrl.url');
    await typeHuman(page, URL_BG);
    await sleep(600);
    await clickControl(page, 'dialog.imageByUrl.ok');
    const obj = await newBlockAfter(before, 40_000, ['picture']);
    await settled(page);
    const dialogs = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog."][role="dialog"], .ts-dialog[data-control]')].map((e) => e.getAttribute('data-control')).join(','));
    await closeMenus(page);
    const facts = await pollUntil(bgFacts, (f) => f.pictureImg && /complete true/.test(f.pictureImg), 15_000);
    const order = (await blocksOf(page, SLIDE)).map((b) => b.id);
    return { ok: Boolean(obj) && obj.type === 'picture' && Boolean(facts.picture) && order.indexOf('picture') < order.indexOf(ID), evidence: `${await describeBlock(obj)}; on the sheet ${facts.picture}; img ${facts.pictureImg}; stack order ${order.join(' < ')}; dialogs open after ${dialogs || 'none'}` };
  }, { reset: () => closeMenus(page) });
  await shot('background-picture');

  await attempt('Slide background', 'Change background > Dither toggle: the covering picture takes the two tone screen', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const row = await has(page, '[data-control="dialog.background.ditherRow"]');
    const before = await blockOf(page, SLIDE, 'picture');
    const toggle = page.locator('[data-control="dialog.background.dither"]').first();
    const r = await toggle.boundingBox();
    if (!r) {
      await closeMenus(page);
      return { ok: false, evidence: `no dither toggle; dither row present ${row}` };
    }
    await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    const after = await pollUntil(() => blockOf(page, SLIDE, 'picture'), (b) => b && JSON.stringify(b.block.dither) !== JSON.stringify(before?.block.dither), 15_000);
    await settled(page);
    const facts = await pollUntil(bgFacts, (f) => f.dither === 'canvas', 15_000);
    await clickControl(page, 'dialog.background.done').catch(() => undefined);
    await closeMenus(page);
    return { ok: Boolean(after?.block.dither) && facts.dither === 'canvas', evidence: `dither ${JSON.stringify(before?.block.dither ?? null)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 100)}; canvas on the sheet ${facts.dither}` };
  }, { reset: () => closeMenus(page) });
  await shot('background-dither');

  await attempt('Slide background', 'Change background > Remove picture: the covering picture leaves', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const present = await has(page, '[data-control="dialog.background.removePicture"]');
    if (!present) {
      await closeMenus(page);
      return { ok: false, evidence: 'no Remove picture control in the dialog' };
    }
    await clickControl(page, 'dialog.background.removePicture');
    const gone = await pollUntil(() => blockOf(page, SLIDE, 'picture'), (b) => b === null, 15_000);
    await settled(page);
    await clickControl(page, 'dialog.background.done').catch(() => undefined);
    await closeMenus(page);
    const facts = await bgFacts();
    return { ok: gone === null && facts.picture === null, evidence: `picture block after ${gone ? 'still there' : 'gone'}; on the sheet ${facts.picture ?? 'none'}; colour still ${facts.bg}` };
  }, { reset: () => closeMenus(page) });

  await attempt('Slide background', 'Change background > Reset to theme, Done: the colour leaves and the theme ground returns', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.background.reset');
    await sleep(300);
    await clickControl(page, 'dialog.background.done');
    const slide = await pollUntil(() => slideJson(page, SLIDE), (s) => s.background === undefined, 15_000);
    await settled(page);
    const facts = await bgFacts();
    return { ok: slide.background === undefined && facts.bg === null, evidence: `slide.background ${JSON.stringify(slide.background ?? null)}; .slide-bg ${facts.bg ?? 'none'}` };
  }, { reset: () => closeMenus(page) });

  await attempt('Slide background', 'Change background > Choose image > Upload from computer through the file chooser, then Remove picture', async () => {
    await clearAll(page);
    const before = await ids();
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await clickControl(page, 'dialog.background.choose.upload');
    const chooser = await chooserP;
    if (!chooser) {
      await closeMenus(page);
      return { ok: false, evidence: 'no file chooser opened' };
    }
    await chooser.setFiles(PNG_A);
    const obj = await newBlockAfter(before, 40_000, ['picture']);
    await settled(page);
    const facts = await pollUntil(bgFacts, (f) => f.picture !== null, 15_000);
    let removed = 'not tried';
    if (obj) {
      if (!(await has(page, '[data-control="dialog.background"]'))) {
        await openMenu(page, 'slide');
        await clickRow(page, 'slide.changeBackground');
        await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
      }
      await clickControl(page, 'dialog.background.removePicture').catch(() => undefined);
      const gone = await pollUntil(() => blockOf(page, SLIDE, 'picture'), (b) => b === null, 15_000);
      removed = gone === null ? 'removed' : 'still there';
    }
    await clickControl(page, 'dialog.background.done').catch(() => undefined);
    await closeMenus(page);
    return { ok: Boolean(obj) && obj.type === 'picture' && removed === 'removed', evidence: `${await describeBlock(obj)}; on the sheet ${facts.picture}; then ${removed}` };
  }, { reset: () => closeMenus(page) });

  // a colour back on the slide for the present and PDF checks
  await attempt('Slide background', 'colour again for the present and PDF checks (Change background, the same swatch, Done)', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const swatches = await swatchesOf();
    const pick = chosenSwatch ?? swatches[1];
    await clickControl(page, pick.control);
    await clickControl(page, 'dialog.background.done');
    const slide = await pollUntil(() => slideJson(page, SLIDE), (s) => s.background !== undefined, 15_000);
    await settled(page);
    return { ok: Boolean(slide.background), evidence: `slide.background ${JSON.stringify(slide.background ?? null)}` };
  }, { reset: () => closeMenus(page) });

  // ---- 11. present mode
  await attempt('Present', 'Slideshow from the title row: the slide shows the picture and the background colour', async () => {
    await clearAll(page);
    await clickControl(page, 'present.open');
    const facts = await pollUntil(
      () =>
        page.evaluate((slideId) => {
          const s = window.turboslide.studio.describe().state;
          const show = document.querySelector('[data-control="present.show"]');
          const root = show ?? document;
          const slide = root.querySelector(`[data-slide="${slideId}"]`) ?? root.querySelector('.pt-slide:not(.is-leaving)');
          const imgs = slide ? [...slide.querySelectorAll('img')].map((i) => `${i.naturalWidth}x${i.naturalHeight}/${i.complete}`) : [];
          const bg = slide?.querySelector('.slide-bg');
          const r = slide?.getBoundingClientRect();
          return { present: s.present ?? null, show: Boolean(show), slide: Boolean(slide), imgs, bg: bg ? getComputedStyle(bg).backgroundColor : null, size: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null, url: location.pathname };
        }, SLIDE),
      (f) => f.show && f.slide && f.imgs.some((i) => /\/true$/.test(i) && !/^0x0/.test(i)),
      15_000,
    );
    await sleep(600);
    const file = await shot('present');
    await press(page, 'Escape');
    const off = await pollUntil(() => page.evaluate(() => Boolean(document.querySelector('[data-control="present.show"]'))), (v) => v === false, 8000);
    return { ok: facts.show && facts.slide && facts.imgs.some((i) => /\/true$/.test(i) && !/^0x0/.test(i)) && facts.bg !== null && off === false, evidence: `present ${facts.present}; show ${facts.show} at ${facts.url}; slide ${facts.size}; imgs ${facts.imgs.join(',') || 'none'}; background ${facts.bg}; after Escape present view ${off}; shot ${file ? path.basename(file) : 'none'}` };
  }, { reset: () => clearAll(page) });

  // ---- 12. the PDF
  await attempt('PDF export', 'File > Download > PDF Document, Download: a PDF with one page per slide that carries the picture', async () => {
    await clearAll(page);
    await openMenu(page, 'file');
    await hoverRow(page, 'file.download', '[data-control="menu.file.download.pdf"]');
    await clickRow(page, 'file.download.pdf');
    await page.locator('[data-control="dialog.download.pdf"]').waitFor({ timeout: 8000 });
    const dlP = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    const t0 = Date.now();
    await clickControl(page, 'dialog.download.ok');
    const ready = await page.locator('[data-control="dialog.download.ready"]').waitFor({ timeout: 120_000 }).then(() => true).catch(() => false);
    const readyText = await page.evaluate(() => document.querySelector('[data-control="dialog.download.ready"]')?.textContent ?? document.querySelector('[data-control="dialog.download.progress"]')?.textContent ?? null);
    const dl = await dlP;
    let file = null;
    if (dl) {
      const p = await dl.path().catch(() => null);
      if (p) {
        const bytes = readFileSync(p);
        const text = bytes.toString('latin1');
        const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        const images = (text.match(/\/Subtype\s*\/Image/g) ?? []).length;
        const out = path.join(WORK, 'audit-export.pdf');
        writeFileSync(out, bytes);
        file = { name: dl.suggestedFilename(), bytes: bytes.length, head: text.slice(0, 8), pages, images, saved: out };
      }
    }
    const slides = (await slideOrder(page)).length;
    if (await has(page, '[data-control="dialog.download.done"]')) await clickControl(page, 'dialog.download.done');
    await closeMenus(page);
    return { ok: Boolean(file) && file.head.startsWith('%PDF') && file.pages === slides && file.images > 0, evidence: `${Date.now() - t0} ms; ready ${ready} ("${(readyText ?? '').slice(0, 80)}"); download ${file ? `${file.name} ${file.bytes} bytes head ${file.head.trim()} pages ${file.pages} of ${slides} slides, image objects ${file.images}` : 'none'}`, extra: file ? { pdf: file.saved } : {} };
  }, { reset: () => closeMenus(page) });
  await shot('end');
} catch (error) {
  record('the audit ran to completion', 'no exception outside a step', 'broken', error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
  // ---- File > Move to trash, Delete forever, and a 404 for the deck
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(() => state(page), (s) => s.sync?.connected === true, 30_000);
      await settled(page);
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('cleanup', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      let seen = false;
      for (let round = 1; round <= 4 && !seen; round += 1) {
        await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
        await sleep(2500);
        seen = await has(page, `[data-control="trash.card.${deckId}"]`);
        if (!seen) await sleep(8000);
      }
      if (!seen) throw new Error('the trash card did not appear in four looks over 40 s');
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('cleanup', 'Delete forever on /decks/trash', 'works', deckId);
      trashed = true;
    } catch (error) {
      record('cleanup', 'File > Move to trash then Delete forever', 'broken', `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the actions API`);
    }
    if (!trashed) {
      try {
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info) {
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined);
          const t = await invoke(page, 'deck.info').catch(() => null);
          await invoke(page, 'deck.remove', { id: deckId, baseRevision: t?.revision ?? info.revision, confirm: true }).catch(() => undefined);
        }
      } catch {
        // the 404 probe below tells the truth
      }
    }
    try {
      let status = 0;
      let status2 = 0;
      const until = Date.now() + 30_000;
      for (;;) {
        const res = await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 });
        status = res.status();
        const res2 = await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 });
        status2 = res2.status();
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record('cleanup', `GET /edit/${deckId} and /deck/${deckId} answer 404`, status === 404 ? 'works' : 'broken', `/edit ${status}, /deck ${status2}`);
    } catch (error) {
      record('cleanup', 'the scratch deck answers 404', 'broken', `probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await browser.close().catch(() => undefined);
  const summary = {
    base: BASE,
    build,
    deckId,
    slide: SLIDE,
    startedAt: new Date(startedAt).toISOString(),
    ms: Date.now() - startedAt,
    rows: rows.length,
    works: rows.filter((r) => r.result === 'works').length,
    flaky: rows.filter((r) => r.result === 'flaky').length,
    broken: rows.filter((r) => r.result === 'broken').length,
    notDriven: rows.filter((r) => r.result === 'not driven').length,
    consoleErrors,
    net,
    table: rows,
  };
  if (JSON_OUT) {
    mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  }
  console.log(`\naudit-images: ${rows.length} rows, ${summary.works} works, ${summary.flaky} flaky, ${summary.broken} broken, ${summary.notDriven} not driven, ${consoleErrors.length} console errors, ${Math.round(summary.ms / 1000)} s against ${BASE}; deck ${deckId}`);
}

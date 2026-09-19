#!/usr/bin/env node
// Run 3 of the pictures and backgrounds audit on production: the retests (gslides-parity focus round, 2026-09-15).
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

const URL_EXTERNAL =
  'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
const URL_GT = 'https://generaltranslation.com/api/og-home';
const URL_A =
  'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
const URL_B =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/500px-Python-logo-notext.svg.png';
const URL_BG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/960px-Fronalpstock_big.jpg';

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
      r = {
        ok: false,
        evidence: `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      };
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
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
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
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
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
page.on('requestfailed', (req) =>
  net.push(
    `failed ${req.method()} ${req.url().slice(0, 140)} :: ${req.failure()?.errorText ?? '?'}`,
  ),
);
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
  record(
    'setup',
    'open /new',
    /^untitled-/.test(deckId) ? 'works' : 'broken',
    `deck ${deckId}; state keys ${build.keys.join(',')}`,
  );

  // ---- 1b. a second slide, the click repeated until the slide list grows
  const firstOrder = await slideOrder(page);
  let order = firstOrder;
  for (let i = 0; i < 3 && order.length <= firstOrder.length; i += 1) {
    await clearAll(page);
    await clickControl(page, 'toolbar.newSlide');
    order = await pollUntil(
      () => slideOrder(page),
      (o) => o.length > firstOrder.length,
      15_000,
    );
  }
  SLIDE = order.find((id) => !firstOrder.includes(id)) ?? order[order.length - 1];
  await pollUntil(
    () => state(page),
    (s) => s.slideId === SLIDE,
    8000,
  );
  await settled(page);
  const connected = await pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    30_000,
  );
  await sleep(500);
  record(
    'setup',
    'New slide from the toolbar, then the room connected',
    SLIDE && SLIDE !== firstOrder[0] && connected.sync?.connected === true ? 'works' : 'broken',
    `slides ${order.length}; working slide ${SLIDE}; active ${(await state(page)).slideId}; sync ${JSON.stringify(connected.sync ?? null)}`,
  );
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
      await press(page, 'Escape');
      await sleep(200);
      b = await boxOf(page, id);
      c = { x: b.free.x + 6, y: b.free.y + 6 };
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
    const gone = await pollUntil(
      () => blockOf(page, SLIDE, id),
      (b) => b === null,
      10_000,
    );
    await settled(page);
    return gone === null;
  };
  const waitPos = (id, test, timeout = 12_000) =>
    pollUntil(
      () => blockOf(page, SLIDE, id),
      (b) => b && b.pos && test(b.pos, b),
      timeout,
    );

  // the sync facts a row cites: the document revision the page holds, the server revision and the room
  const syncFacts = () =>
    page.evaluate(() => {
      const d = window.turboslide.studio.describe();
      const s = d.state;
      return `revision ${s.revision}, serverRevision ${s.serverRevision}, pending ${s.pending}, sync ${JSON.stringify(s.sync ?? null)}, document.deck.revision ${d.document?.deck?.revision ?? '?'}`;
    });
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
    const sync = await syncFacts();
    const t0 = Date.now();
    await clickControl(page, 'dialog.imageByUrl.ok');
    const obj = await newBlockAfter(before, 40_000);
    const err = await page.evaluate(
      () =>
        document.querySelector('[data-control="dialog.imageByUrl"] [role="alert"]')?.textContent ??
        null,
    );
    const dialogOpen = await has(page, '[data-control="dialog.imageByUrl"]');
    if (dialogOpen) await closeMenus(page);
    await settled(page);
    return {
      ok: Boolean(obj) && !dialogOpen,
      obj,
      evidence: `preview in the dialog ${preview}; before: ${sync}; ${Date.now() - t0} ms; ${await describeBlock(obj)}; dialog still open ${dialogOpen}${err ? `; dialog said "${err}"` : ''}; after: ${await syncFacts()}; network ${netSince(mark)}`,
    };
  };

  /** The refused write modal ("A change was not applied"): its text, then Dismiss, then the save state. */
  const refusedModal = async () => {
    const facts = await page.evaluate(() => {
      const heads = [
        ...document.querySelectorAll('h1, h2, h3, [role="heading"], .ts-dialog-title'),
      ].map((h) => (h.textContent ?? '').trim());
      const modal = heads.find((t) => /change was not applied/i.test(t)) ?? null;
      const dismiss = [...document.querySelectorAll('button')].find((b) =>
        /^dismiss$/i.test((b.textContent ?? '').trim()),
      );
      const save =
        document.querySelector(
          '[data-control="deck.saveState"], .ts-save-state, .ts-title-row [role="status"]',
        )?.textContent ??
        [...document.querySelectorAll('.ts-titlerow *, header *')]
          .map((e) => e.textContent ?? '')
          .find((t) => /save|saving|retrying|saved/i.test(t)) ??
        null;
      return { modal, dismiss: Boolean(dismiss), save: save ? save.trim().slice(0, 60) : null };
    });
    return facts;
  };
  const dismissRefused = async () => {
    const before = await refusedModal();
    if (!before.dismiss) return { ...before, dismissed: false };
    const btn = page.locator('button', { hasText: /^Dismiss$/ }).first();
    const r = await btn.boundingBox();
    if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    await sleep(1500);
    const after = await refusedModal();
    return {
      ...before,
      dismissed: !after.modal,
      saveAfter: after.save,
      syncAfter: await syncFacts(),
    };
  };

  // ---- K. the horizontal centre snap with no competing edge: a small picture low on the slide
  let all = (await blocksOf(page, SLIDE)).filter(
    (b) => (b.type === 'shot' || b.type === 'picture') && b.pos,
  );
  if (all.length === 0) {
    const before = await ids();
    try {
      const dataUrl = `data:image/png;base64,${readFileSync(PNG_A).toString('base64')}`;
      const s0 = await state(page);
      const asset = await invoke(page, 'asset.add', {
        url: dataUrl,
        role: 'capture',
        alt: 'audit picture',
        baseRevision: s0.revision,
      });
      const s2 = await state(page);
      await invoke(page, 'block.insert', {
        slideId: SLIDE,
        slot: 'main',
        block: {
          id: 'shot-audit',
          type: 'shot',
          asset: asset.id,
          pos: { x: 200, y: 700, w: 200, h: 125 },
        },
        baseRevision: Math.max(s2.revision, asset.revision ?? 0),
      });
    } catch (e) {
      record(
        'setup',
        'a small picture through the window API',
        'broken',
        e instanceof Error ? e.message.slice(0, 200) : String(e),
      );
    }
    await newBlockAfter(before, 30_000);
    await settled(page);
    all = (await blocksOf(page, SLIDE)).filter(
      (b) => (b.type === 'shot' || b.type === 'picture') && b.pos,
    );
  }
  const ID = all[0]?.id;
  if (!ID) throw new Error('no picture to drive');
  const place = async (x, y) => {
    await clearAll(page);
    const s0 = await state(page);
    await invoke(page, 'block.set', {
      slideId: SLIDE,
      blockId: ID,
      path: '/pos',
      value: { x, y, w: 200, h: 125 },
      baseRevision: s0.revision,
    }).catch(() => undefined);
    await waitPos(ID, (p) => p.x === x && p.y === y);
    await settled(page);
    await sleep(1200);
  };
  await place(200, 700);
  k = await kOf(page);
  await attempt(
    'Alignment guides',
    'drag a 200 px wide picture low on the slide so its centre comes within 3 px of the slide centre, no other edge near: a guide shows and the centre snaps to 800',
    async () => {
      await place(200, 700);
      const sel = await selectObject(ID);
      if (!sel) return { ok: false, evidence: `could not select ${ID}` };
      const before = await blockOf(page, SLIDE, ID);
      const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
      if (!edge) return { ok: false, evidence: 'no frame edge' };
      const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
      const cx = before.pos.x + before.pos.w / 2;
      const to = { x: from.x + (800 + 3 - cx) * k, y: from.y };
      const mid = await drag(page, from, to, {
        steps: 24,
        during: async () => ({
          guides: await guidesCount(page),
          axes: await page.evaluate(() =>
            [...document.querySelectorAll('.ts-guide')]
              .map(
                (g) =>
                  `${g.getAttribute('data-axis')}@${Math.round(g.getBoundingClientRect().x)},${Math.round(g.getBoundingClientRect().y)}`,
              )
              .join(','),
          ),
        }),
      });
      const after = await waitPos(ID, (p) => p.x !== before.pos.x);
      await settled(page);
      const centreAfter = after.pos.x + after.pos.w / 2;
      const sheet = await rectOf(page, SHEET);
      return {
        ok: mid.guides > 0 && near(centreAfter, 800, 0.5),
        evidence: `guides during ${mid.guides} (${mid.axes}; sheet centre at css x ${fmt(sheet.x + sheet.w / 2)}); centre ${fmt(cx)} -> ${fmt(centreAfter)} (aimed at 803); pos ${posStr(before.pos)} -> ${posStr(after.pos)}`,
      };
    },
    { reset: () => place(200, 700) },
  );
  await shot('snap-centre-x');
  await attempt(
    'Alignment guides',
    'the same drag aimed 1 px right of the slide centre',
    async () => {
      await place(200, 700);
      const sel = await selectObject(ID);
      if (!sel) return { ok: false, evidence: `could not select ${ID}` };
      const before = await blockOf(page, SLIDE, ID);
      const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
      const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
      const cx = before.pos.x + before.pos.w / 2;
      const to = { x: from.x + (800 + 1 - cx) * k, y: from.y };
      const mid = await drag(page, from, to, {
        steps: 24,
        during: async () => ({
          guides: await guidesCount(page),
          axes: await page.evaluate(() =>
            [...document.querySelectorAll('.ts-guide')]
              .map((g) => g.getAttribute('data-axis'))
              .join(','),
          ),
        }),
      });
      const after = await waitPos(ID, (p) => p.x !== before.pos.x);
      await settled(page);
      const centreAfter = after.pos.x + after.pos.w / 2;
      return {
        ok: mid.guides > 0 && near(centreAfter, 800, 0.5),
        evidence: `guides during ${mid.guides} (${mid.axes}); centre ${fmt(cx)} -> ${fmt(centreAfter)} (aimed at 801); pos ${posStr(after.pos)}`,
      };
    },
    { reset: () => place(200, 700) },
  );
  await shot('end');
} catch (error) {
  record(
    'the audit ran to completion',
    'no exception outside a step',
    'broken',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
} finally {
  // ---- File > Move to trash, Delete forever, and a 404 for the deck
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(
        () => state(page),
        (s) => s.sync?.connected === true,
        30_000,
      );
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
      record(
        'cleanup',
        'File > Move to trash then Delete forever',
        'broken',
        `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the actions API`,
      );
    }
    if (!trashed) {
      try {
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info) {
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
          const t = await invoke(page, 'deck.info').catch(() => null);
          await invoke(page, 'deck.remove', {
            id: deckId,
            baseRevision: t?.revision ?? info.revision,
            confirm: true,
          }).catch(() => undefined);
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
      record(
        'cleanup',
        `GET /edit/${deckId} and /deck/${deckId} answer 404`,
        status === 404 ? 'works' : 'broken',
        `/edit ${status}, /deck ${status2}`,
      );
    } catch (error) {
      record(
        'cleanup',
        'the scratch deck answers 404',
        'broken',
        `probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
  console.log(
    `\naudit-images: ${rows.length} rows, ${summary.works} works, ${summary.flaky} flaky, ${summary.broken} broken, ${summary.notDriven} not driven, ${consoleErrors.length} console errors, ${Math.round(summary.ms / 1000)} s against ${BASE}; deck ${deckId}`,
  );
}

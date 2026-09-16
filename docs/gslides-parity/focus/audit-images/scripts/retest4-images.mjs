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

const URL_EXTERNAL = 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
const URL_GT = 'https://generaltranslation.com/api/og-home';
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

  // ---- 0. the first action on the fresh draft: a picture through the file chooser
  {
    const mark = net.length;
    const sync0 = await page.evaluate(() => JSON.stringify(window.turboslide.studio.describe().state.sync ?? null));
    let how = '';
    try {
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.image', '[data-control="menu.insert.image.upload"]');
      const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
      await clickRow(page, 'insert.image.upload');
      const chooser = await chooserP;
      if (!chooser) how = 'no file chooser opened';
      else {
        await chooser.setFiles(PNG_A);
        let said = null;
        let landed = null;
        const until = Date.now() + 30_000;
        while (Date.now() < until) {
          const sb = await snackbar(page);
          if (sb && !said) said = sb;
          const slide = await slideJson(page, (await state(page)).slideId);
          landed = JSON.stringify(slide).includes('"shot"') ? 'a shot block is on the slide' : null;
          if (landed) break;
          await sleep(500);
        }
        how = `${landed ?? 'no picture block within 30 s'}; snackbar ${said}`;
      }
    } catch (e) {
      how = `error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
    }
    await closeMenus(page);
    record('Insert picture', 'on the fresh /new draft, before any other change, Insert > Image > Upload from computer with a PNG', /a shot block/.test(how) ? 'works' : 'broken', `sync before ${sync0}; ${how}; network ${netSince(mark)}; after ${await page.evaluate(() => JSON.stringify(window.turboslide.studio.describe().state.sync ?? null))}`);
  }

  // ---- 1b. a second slide, the click repeated until the slide list grows
  const firstOrder = await slideOrder(page);
  let order = firstOrder;
  for (let i = 0; i < 3 && order.length <= firstOrder.length; i += 1) {
    await clearAll(page);
    await clickControl(page, 'toolbar.newSlide');
    order = await pollUntil(() => slideOrder(page), (o) => o.length > firstOrder.length, 15_000);
  }
  SLIDE = order.find((id) => !firstOrder.includes(id)) ?? order[order.length - 1];
  await pollUntil(() => state(page), (s) => s.slideId === SLIDE, 8000);
  await settled(page);
  const connected = await pollUntil(() => state(page), (s) => s.sync?.connected === true, 30_000);
  await sleep(500);
  record('setup', 'New slide from the toolbar, then the room connected', SLIDE && SLIDE !== firstOrder[0] && connected.sync?.connected === true ? 'works' : 'broken', `slides ${order.length}; working slide ${SLIDE}; active ${(await state(page)).slideId}; sync ${JSON.stringify(connected.sync ?? null)}`);
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
    const gone = await pollUntil(() => blockOf(page, SLIDE, id), (b) => b === null, 10_000);
    await settled(page);
    return gone === null;
  };
  const waitPos = (id, test, timeout = 12_000) =>
    pollUntil(() => blockOf(page, SLIDE, id), (b) => b && b.pos && test(b.pos, b), timeout);


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
    const err = await page.evaluate(() => document.querySelector('[data-control="dialog.imageByUrl"] [role="alert"]')?.textContent ?? null);
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
      const heads = [...document.querySelectorAll('h1, h2, h3, [role="heading"], .ts-dialog-title')].map((h) => (h.textContent ?? '').trim());
      const modal = heads.find((t) => /change was not applied/i.test(t)) ?? null;
      const dismiss = [...document.querySelectorAll('button')].find((b) => /^dismiss$/i.test((b.textContent ?? '').trim()));
      const save = document.querySelector('[data-control="deck.saveState"], .ts-save-state, .ts-title-row [role="status"]')?.textContent ?? [...document.querySelectorAll('.ts-titlerow *, header *')].map((e) => e.textContent ?? '').find((t) => /save|saving|retrying|saved/i.test(t)) ?? null;
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
    return { ...before, dismissed: !after.modal, saveAfter: after.save, syncAfter: await syncFacts() };
  };

  // ---- A. the upload paths again, with the sync facts before and after every try
  let uploaded = null;
  await attempt('Insert picture', 'Insert > Image > Upload from computer, a PNG through the file chooser (with the sync facts)', async () => {
    await clearAll(page);
    const before = await ids();
    const mark = net.length;
    const sync0 = await syncFacts();
    await openMenu(page, 'insert');
    await hoverRow(page, 'insert.image', '[data-control="menu.insert.image.upload"]');
    const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await clickRow(page, 'insert.image.upload');
    const chooser = await chooserP;
    if (!chooser) return { ok: false, evidence: `no file chooser opened within 8 s; before: ${sync0}` };
    const t0 = Date.now();
    await chooser.setFiles(PNG_A);
    // the snackbar, watched for 45 s (it dismisses itself)
    let said = null;
    let obj = null;
    const until = Date.now() + 45_000;
    while (Date.now() < until) {
      const s = await snackbar(page);
      if (s && !said) said = s;
      obj = (await blocksOf(page, SLIDE)).find((x) => !before.includes(x.id) && (x.type === 'shot' || x.type === 'picture')) ?? null;
      if (obj) break;
      await sleep(500);
    }
    await settled(page);
    uploaded = obj;
    return { ok: Boolean(obj), evidence: `before: ${sync0}; ${Date.now() - t0} ms; ${await describeBlock(obj)}; snackbar ${said}; after: ${await syncFacts()}; network ${netSince(mark)}` };
  }, { reset: () => closeMenus(page) });

  let byUrl = null;
  let dropped = null;
  await attempt('Insert picture', 'drag a PNG file from the desktop and drop it on the slide (a DataTransfer built in the page, dispatched as dragover and drop at a point), with the sync facts', async () => {
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
    const sync0 = await syncFacts();
    const mark = net.length;
    await page.mouse.move(at.x - 60, at.y - 40);
    await page.dispatchEvent(SHEET, 'dragenter', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    await page.dispatchEvent(SHEET, 'dragover', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    await sleep(200);
    await page.dispatchEvent(SHEET, 'drop', { dataTransfer: dt, clientX: at.x, clientY: at.y });
    let said = null;
    let obj = null;
    const until = Date.now() + 45_000;
    while (Date.now() < until) {
      const s = await snackbar(page);
      if (s && !said) said = s;
      obj = (await blocksOf(page, SLIDE)).find((x) => !before.includes(x.id) && (x.type === 'shot' || x.type === 'picture')) ?? null;
      if (obj) break;
      await sleep(500);
    }
    await settled(page);
    dropped = obj;
    return { ok: Boolean(obj), evidence: `before: ${sync0}; dropped at sheet 1000,560; ${await describeBlock(obj)}; snackbar ${said}; after: ${await syncFacts()}; network ${netSince(mark)}` };
  });

  let pasted = null;
  await attempt('Insert picture', 'copy a PNG to the clipboard and press Cmd V on the slide, with the sync facts', async (i) => {
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
    const at = await sheetPoint(1400, 860);
    await clickAt(page, at.x, at.y);
    await clearAll(page);
    const sync0 = await syncFacts();
    const mark = net.length;
    let how = `${wrote}; `;
    await page.keyboard.press(i === 1 ? 'Meta+V' : 'Control+V');
    how += i === 1 ? 'Meta+V' : 'Control+V';
    let said = null;
    let obj = null;
    let until = Date.now() + 25_000;
    while (Date.now() < until) {
      const s = await snackbar(page);
      if (s && !said) said = s;
      obj = (await blocksOf(page, SLIDE)).find((x) => !before.includes(x.id) && (x.type === 'shot' || x.type === 'picture')) ?? null;
      if (obj) break;
      await sleep(500);
    }
    if (!obj && i === 3) {
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
      until = Date.now() + 25_000;
      while (Date.now() < until) {
        const s = await snackbar(page);
        if (s && !said) said = s;
        obj = (await blocksOf(page, SLIDE)).find((x) => !before.includes(x.id) && (x.type === 'shot' || x.type === 'picture')) ?? null;
        if (obj) break;
        await sleep(500);
      }
    }
    await settled(page);
    pasted = obj;
    return { ok: Boolean(obj), evidence: `before: ${sync0}; ${how}; ${await describeBlock(obj)}; snackbar ${said}; after: ${await syncFacts()}; network ${netSince(mark)}` };
  });

  // ---- B. the subject (a UI picture when one landed, else the window API)
  let all = (await blocksOf(page, SLIDE)).filter((b) => b.type === 'shot' || b.type === 'picture');
  if (all.length === 0) {
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
    record('setup', 'every UI insert path failed: the picture is placed through the window API (asset.add with a data URL, block.insert)', obj ? 'works' : 'broken', `${how}; ${await describeBlock(obj)}; network ${netSince(mark)}; ${await syncFacts()}`);
    all = (await blocksOf(page, SLIDE)).filter((b) => b.type === 'shot' || b.type === 'picture');
  }
  const subject = uploaded ?? byUrl ?? dropped ?? pasted ?? all[0] ?? null;
  // the inserted pictures land on the same spot: spread them so a click names one picture
  let cell = 0;
  for (const b of all) {
    const s = await state(page);
    const x = 120 + (cell % 3) * 500;
    const y = 120 + Math.floor(cell / 3) * 380;
    cell += 1;
    await invoke(page, 'block.set', { slideId: SLIDE, blockId: b.id, path: '/pos', value: { x, y, w: 400, h: 250 }, baseRevision: s.revision }).catch(() => undefined);
    await waitPos(b.id, (p) => p.x === x && p.y === y, 8000);
    await settled(page);
  }
  for (const extra of all) {
    if (subject && extra.id === subject.id) continue;
    const sel = await selectObject(extra.id);
    if (!sel) {
      const s = await state(page);
      await invoke(page, 'block.remove', { slideId: SLIDE, blockId: extra.id, baseRevision: s.revision }).catch(() => undefined);
      await pollUntil(() => blockOf(page, SLIDE, extra.id), (b) => b === null, 10_000);
      record('Delete picture', `select the ${extra.type} ${extra.id} and press Delete`, 'not driven', `a click did not select ${extra.id} (handles ${(await handleControls(page)).join(',') || 'none'}); removed through the window API instead`);
      continue;
    }
    await press(page, 'Delete');
    const gone = await pollUntil(() => blockOf(page, SLIDE, extra.id), (b) => b === null, 10_000);
    await settled(page);
    record('Delete picture', `select the ${extra.type} ${extra.id} and press Delete`, gone === null ? 'works' : 'broken', gone === null ? 'the block left the slide' : `the block is still on the slide: ${posStr(gone.pos)}`);
  }
  if (!subject) throw new Error('no picture object to drive; every insert path failed');
  const ID = subject.id;
  const placeSubject = async (x = 560, y = 300) => {
    await clearAll(page);
    const s = await state(page);
    await invoke(page, 'block.set', { slideId: SLIDE, blockId: ID, path: '/pos', value: { x, y, w: 480, h: 300 }, baseRevision: s.revision }).catch(() => undefined);
    await waitPos(ID, (p) => p.x === x && p.y === y);
    await settled(page);
    await sleep(1200);
  };
  await placeSubject(200, 300);
  k = await kOf(page);
  record('setup', `the subject ${ID} placed at 200,300 480x300 through the window API`, 'works', `${await describeBlock(await blockOf(page, SLIDE, ID))}; k ${fmt(k)}`);

  // ---- C. the centre snap from a far start
  await attempt('Alignment guides', 'drag the picture from x 200 so its centre comes within 3 px of the slide centre: a guide shows and the centre snaps to 800', async () => {
    await placeSubject(200, 300);
    const sel = await selectObject(ID);
    if (!sel) return { ok: false, evidence: `could not select ${ID}: handles ${(await handleControls(page)).join(',') || 'none'}` };
    const before = await blockOf(page, SLIDE, ID);
    const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
    if (!edge) return { ok: false, evidence: 'no frame edge on the overlay' };
    const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
    const cx = before.pos.x + before.pos.w / 2;
    const to = { x: from.x + (800 + 3 - cx) * k, y: from.y };
    const mid = await drag(page, from, to, { steps: 24, during: async () => ({ guides: await guidesCount(page), axes: await page.evaluate(() => [...document.querySelectorAll('.ts-guide')].map((g) => `${g.getAttribute('data-axis')}@${Math.round(g.getBoundingClientRect().x)}`).join(',')) }) });
    const after = await waitPos(ID, (p) => p.x !== before.pos.x);
    await settled(page);
    const centreAfter = after.pos.x + after.pos.w / 2;
    const sheet = await rectOf(page, SHEET);
    return { ok: mid.guides > 0 && near(centreAfter, 800, 0.5), evidence: `guides during ${mid.guides} (${mid.axes}; sheet centre at css x ${fmt(sheet.x + sheet.w / 2)}); centre ${fmt(cx)} -> ${fmt(centreAfter)} (aimed at 803); pos ${posStr(after.pos)}` };
  }, { reset: () => placeSubject(200, 300) });
  await attempt('Alignment guides', 'drag the picture so its centre comes within 3 px of the slide vertical centre (y 450): a guide shows and the centre snaps', async () => {
    await placeSubject(200, 200);
    const sel = await selectObject(ID);
    if (!sel) return { ok: false, evidence: `could not select ${ID}: handles ${(await handleControls(page)).join(',') || 'none'}` };
    const before = await blockOf(page, SLIDE, ID);
    const edge = await rectOf(page, '.ts-overlay .ts-frame-edge[data-side="n"]');
    if (!edge) return { ok: false, evidence: 'no frame edge on the overlay' };
    const from = { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
    const cy = before.pos.y + before.pos.h / 2;
    const to = { x: from.x, y: from.y + (450 + 3 - cy) * k };
    const mid = await drag(page, from, to, { steps: 24, during: async () => ({ guides: await guidesCount(page), axes: await page.evaluate(() => [...document.querySelectorAll('.ts-guide')].map((g) => g.getAttribute('data-axis')).join(',')) }) });
    const after = await waitPos(ID, (p) => p.y !== before.pos.y);
    await settled(page);
    const centreAfter = after.pos.y + after.pos.h / 2;
    return { ok: mid.guides > 0 && near(centreAfter, 450, 0.5), evidence: `guides during ${mid.guides} (${mid.axes}); centre y ${fmt(cy)} -> ${fmt(centreAfter)} (aimed at 453); pos ${posStr(after.pos)}` };
  }, { reset: () => placeSubject(200, 200) });
  await placeSubject(560, 300);

  // ---- D. the Format options sliders, scrolled into view, with a keyboard fallback
  const openFormatOptions = async () => {
    if (await has(page, '[data-control="panel.formatOptions"]')) return true;
    const tail = await page.evaluate(() => document.querySelector('[data-control="toolbar.tail"]')?.getAttribute('data-tail') ?? 'none');
    if (await has(page, '[data-control="toolbar.imageOptions"]')) await clickControl(page, 'toolbar.imageOptions');
    else if (await has(page, '[data-control="toolbar.formatOptions"]')) await clickControl(page, 'toolbar.formatOptions');
    else {
      await openMenu(page, 'format');
      await clickRow(page, 'format.formatOptions');
    }
    await page.locator('[data-control="panel.formatOptions"]').waitFor({ timeout: 8000 }).catch(() => {
      throw new Error(`the Format options panel did not open (toolbar tail ${tail})`);
    });
    return true;
  };
  const openSection = async (id) => {
    const head = page.locator(`[data-control="formatOptions.${id}"]`).first();
    if (!(await head.isVisible().catch(() => false))) return false;
    const section = page.locator(`[data-section="${id}"]`).first();
    const closed = await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => true);
    if (closed) {
      await head.scrollIntoViewIfNeeded();
      const r = await head.boundingBox();
      await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await sleep(300);
    }
    return true;
  };
  const setSlider = async (control, fraction) => {
    const sel = `[data-control="${control}.slider"]`;
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded();
    await sleep(200);
    const r = await rectOf(page, sel);
    if (!r) throw new Error(`no slider ${control}`);
    const range = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return { min: Number(el.min), max: Number(el.max), value: Number(el.value), disabled: el.disabled };
    }, sel);
    const pad = 8;
    const x0 = r.x + pad + ((range.value - range.min) / (range.max - range.min)) * (r.w - 2 * pad);
    const x1 = r.x + pad + fraction * (r.w - 2 * pad);
    const y = r.y + r.h / 2;
    await drag(page, { x: x0, y }, { x: x1, y }, { steps: 10 });
    await sleep(300);
    let value = await page.evaluate((s) => Number(document.querySelector(s)?.value), sel);
    let how = `mouse drag on the track from ${fmt(x0)} to ${fmt(x1)} (rect ${fmt(r.x)},${fmt(r.y)} ${fmt(r.w)}x${fmt(r.h)}, disabled ${range.disabled}) -> value ${value}`;
    if (value === range.value) {
      // the keyboard: focus the slider, step with the arrows, leave with Tab
      await loc.focus();
      const steps = Math.round(fraction * (range.max - range.min) / 1);
      await press(page, 'ArrowRight', Math.min(steps, 60));
      await press(page, 'Tab');
      await sleep(300);
      value = await page.evaluate((s) => Number(document.querySelector(s)?.value), sel);
      how += `; then ${Math.min(steps, 60)} ArrowRight and Tab -> value ${value}`;
    }
    return { value, how };
  };
  await attempt('Format options', 'set the Transparency slider to about 40 percent: the picture fades on the slide and adjust.transparency is written', async () => {
    await clearAll(page);
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    const v = await setSlider('formatOptions.adjustments.transparency', 0.4);
    const after = await waitPos(ID, (p, b) => b.block.adjust?.transparency !== undefined, 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    const t = after?.block.adjust?.transparency;
    return { ok: typeof t === 'number' && t > 0.25 && t < 0.65 && box?.img && Math.abs(Number(box.img.opacity) - (1 - t)) < 0.05, evidence: `${v.how}; adjust ${JSON.stringify(after?.block.adjust ?? null)}; img opacity on the sheet ${box?.img?.opacity}` };
  }, { reset: () => clearAll(page) });
  await shot('transparency');
  await attempt('Format options', 'set the Brightness slider to about 70 percent: adjust.brightness is written and the picture filter changes', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    const v = await setSlider('formatOptions.adjustments.brightness', 0.7);
    const after = await waitPos(ID, (p, b) => b.block.adjust?.brightness !== undefined, 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: typeof after?.block.adjust?.brightness === 'number' && after.block.adjust.brightness > 0, evidence: `${v.how}; adjust ${JSON.stringify(after?.block.adjust ?? null)}; img filter ${box?.img?.filter}` };
  }, { reset: () => clearAll(page) });
  await attempt('Format options', 'Adjustments > Reset clears the transparency and brightness', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('adjustments');
    const before = await blockOf(page, SLIDE, ID);
    await page.locator('[data-control="formatOptions.adjustments.reset"]').first().scrollIntoViewIfNeeded();
    await clickControl(page, 'formatOptions.adjustments.reset');
    const after = await waitPos(ID, (p, b) => b.block.adjust === undefined || (b.block.adjust.transparency === undefined && b.block.adjust.brightness === undefined), 10_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: Boolean(after) && (after.block.adjust === undefined || after.block.adjust.transparency === undefined), evidence: `adjust ${JSON.stringify(before?.block.adjust ?? null)} -> ${JSON.stringify(after?.block.adjust ?? null)}; img opacity ${box?.img?.opacity}` };
  }, { reset: () => clearAll(page) });

  // ---- E. dither, with the snackbar, the console and the network watched
  const ditherTry = async (how) => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const mark = net.length;
    const errs = consoleErrors.length;
    const sync0 = await syncFacts();
    if (how === 'toolbar') await clickControl(page, 'toolbar.dither');
    else {
      await openMenu(page, 'format');
      await hoverRow(page, 'format.image', '[data-control="menu.format.image.dither"]');
      const st = await rowState(page, 'format.image.dither');
      if (st !== 'enabled') {
        await closeMenus(page);
        return { ok: false, evidence: `menu row ${st}` };
      }
      await clickRow(page, 'format.image.dither');
    }
    let said = null;
    let after = null;
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      const s = await snackbar(page);
      if (s && !said) said = s;
      after = await blockOf(page, SLIDE, ID);
      if (after?.block.dither !== undefined) break;
      await sleep(400);
    }
    await settled(page);
    const box = await boxOf(page, ID);
    const pressed = await page.evaluate(() => document.querySelector('[data-control="toolbar.dither"]')?.getAttribute('aria-pressed'));
    return { ok: Boolean(after?.block.dither) && Boolean(box?.dither) && !box.dither.hidden, evidence: `before: ${sync0}; dither ${JSON.stringify(before?.block.dither ?? null)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 120)}; canvas ${box?.dither ? `${box.dither.w}x${box.dither.h} hidden ${box.dither.hidden}` : 'none'}; button aria-pressed ${pressed}; snackbar ${said}; console errors ${consoleErrors.slice(errs).join(' | ') || 'none'}; network ${netSince(mark)}` };
  };
  await attempt('Dither', 'the toolbar Dither button screens the picture: block.dither written and a dither canvas drawn over the picture', () => ditherTry('toolbar'), { reset: () => clearAll(page) });
  await attempt('Dither', 'Format > Image > Dither screens the picture', () => ditherTry('menu'), { reset: () => closeMenus(page) });
  await shot('dither');
  await attempt('Dither', 'the same write through the window API (picture.dither with the Photograph preset): the field lands and the canvas draws', async () => {
    const before = await blockOf(page, SLIDE, ID);
    if (before?.block.dither) return { ok: true, evidence: `dither already on: ${JSON.stringify(before.block.dither).slice(0, 100)}` };
    const s = await state(page);
    let how;
    try {
      const out = await invoke(page, 'picture.dither', { slideId: SLIDE, blockId: ID, dither: { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 }, baseRevision: s.revision });
      how = `picture.dither answered keys ${Object.keys(out ?? {}).join(',')}`;
    } catch (e) {
      how = `picture.dither failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    }
    const after = await waitPos(ID, (p, b) => b.block.dither !== undefined, 15_000);
    const box = await pollUntil(() => boxOf(page, ID), (b) => b?.dither && !b.dither.hidden, 15_000);
    return { ok: Boolean(after?.block.dither) && Boolean(box?.dither), evidence: `${how}; dither ${JSON.stringify(after?.block.dither ?? null).slice(0, 100)}; canvas ${box?.dither ? `${box.dither.w}x${box.dither.h} hidden ${box.dither.hidden}` : 'none'}` };
  });
  await shot('dither-api');
  await attempt('Dither', 'Format options > Dither: switch the preset to Neutral', async () => {
    await selectObject(ID);
    await openFormatOptions();
    await openSection('dither');
    const before = await blockOf(page, SLIDE, ID);
    const present = await has(page, '[data-control="formatOptions.dither.preset.neutral"]');
    if (!present) return { ok: false, evidence: `no Neutral preset chip in the Dither section; controls ${await page.evaluate(() => [...document.querySelectorAll('[data-control^="formatOptions.dither."]')].map((e) => e.getAttribute('data-control')).join(','))}` };
    await page.locator('[data-control="formatOptions.dither.preset.neutral"]').first().scrollIntoViewIfNeeded();
    await clickControl(page, 'formatOptions.dither.preset.neutral');
    const after = await waitPos(ID, (p, b) => JSON.stringify(b.block.dither) !== JSON.stringify(before?.block.dither), 10_000);
    await settled(page);
    return { ok: Boolean(after) && JSON.stringify(after.block.dither) !== JSON.stringify(before?.block.dither), evidence: `dither ${JSON.stringify(before?.block.dither ?? null).slice(0, 80)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 80)}` };
  }, { reset: () => clearAll(page) });
  await attempt('Dither', 'the toolbar Dither button turns the screen off', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    if (!before?.block.dither) return { ok: false, evidence: 'dither was not on, nothing to turn off' };
    await clickControl(page, 'toolbar.dither');
    const after = await waitPos(ID, (p, b) => b.block.dither === undefined, 15_000);
    await settled(page);
    const box = await boxOf(page, ID);
    return { ok: Boolean(after) && after.block.dither === undefined && (!box?.dither || box.dither.hidden), evidence: `dither ${JSON.stringify(before.block.dither).slice(0, 60)} -> ${JSON.stringify(after?.block.dither ?? null)}; canvas ${box?.dither ? `hidden ${box.dither.hidden}` : 'none'}` };
  }, { reset: () => clearAll(page) });

  // ---- F. replace image with an allowlisted own-domain URL and by upload, with the sync facts
  await attempt('Replace image', 'right click the picture > Replace image > By URL with a PNG on the company domain, then Replace: the asset changes and the box stays', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    const box = await boxOf(page, ID);
    const c = center(box.free);
    await moveHuman(page, { x: c.x - 30, y: c.y - 20 }, c, 6);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.locator('.ts-context-menu').waitFor({ timeout: 6000 });
    await hoverRow(page, 'format.image.replaceImage', '[data-control="menu.format.image.replaceImage.byUrl"]');
    await clickRow(page, 'format.image.replaceImage.byUrl');
    await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.imageByUrl.url');
    await typeHuman(page, URL_GT);
    await sleep(600);
    const mark = net.length;
    const sync0 = await syncFacts();
    await clickControl(page, 'dialog.imageByUrl.ok');
    const after = await waitPos(ID, (p, b) => b.block.asset !== before.block.asset, 40_000);
    const err = await page.evaluate(() => document.querySelector('[data-control="dialog.imageByUrl"] [role="alert"]')?.textContent ?? null);
    await settled(page);
    const dialogOpen = await has(page, '[data-control="dialog.imageByUrl"]');
    if (dialogOpen) await closeMenus(page);
    const boxAfter = await pollUntil(() => boxOf(page, ID), (b) => b?.img?.complete && b.img.natural !== box?.img?.natural, 15_000);
    return { ok: Boolean(after) && after.block.asset !== before.block.asset && posStr(after.pos) === posStr(before.pos) && !dialogOpen, evidence: `before: ${sync0}; asset ${before.block.asset} -> ${after?.block.asset}; pos ${posStr(before.pos)} -> ${posStr(after?.pos)}; img natural ${box?.img?.natural} -> ${boxAfter?.img?.natural}; dialog still open ${dialogOpen}${err ? `; dialog said "${err}"` : ''}; network ${netSince(mark)}` };
  }, { reset: () => closeMenus(page) });
  await shot('replaced-by-url');
  await attempt('Replace image', 'the toolbar Replace image button > Upload from computer, a PNG through the file chooser, with the sync facts', async () => {
    await clearAll(page);
    await selectObject(ID);
    const before = await blockOf(page, SLIDE, ID);
    await clickControl(page, 'toolbar.replaceImage');
    await page.locator('[data-control="menu.format.image.replaceImage.upload"]').waitFor({ timeout: 6000 });
    const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    const mark = net.length;
    const sync0 = await syncFacts();
    await clickRow(page, 'format.image.replaceImage.upload');
    const chooser = await chooserP;
    if (!chooser) return { ok: false, evidence: 'no file chooser opened' };
    await chooser.setFiles(PNG_B);
    let said = null;
    let after = null;
    const until = Date.now() + 45_000;
    while (Date.now() < until) {
      const s = await snackbar(page);
      if (s && !said) said = s;
      after = await blockOf(page, SLIDE, ID);
      if (after && after.block.asset !== before.block.asset) break;
      await sleep(500);
    }
    await settled(page);
    return { ok: Boolean(after) && after.block.asset !== before.block.asset && posStr(after.pos) === posStr(before.pos), evidence: `before: ${sync0}; asset ${before.block.asset} -> ${after?.block.asset}; pos ${posStr(before.pos)} -> ${posStr(after?.pos)}; snackbar ${said}; after: ${await syncFacts()}; network ${netSince(mark)}` };
  }, { reset: () => closeMenus(page) });

  // ---- G. the background picture by URL (own domain), its dither, Remove picture
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
        picture: pr && sr ? `${Math.round(pr.width)}x${Math.round(pr.height)} at ${Math.round(pr.x - sr.x)},${Math.round(pr.y - sr.y)} of sheet ${Math.round(sr.width)}x${Math.round(sr.height)}` : null,
        pictureImg: img ? `${img.naturalWidth}x${img.naturalHeight} complete ${img.complete}` : null,
        dither: picture?.querySelector('canvas.picture-dither') ? 'canvas' : 'none',
      };
    }, SHEET);
  {
    await attempt('Slide background', 'Change background > Choose image > Upload from computer (the file chooser): a picture object covers the slide at the bottom of the stack', async () => {
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
      const mark = net.length;
      const sync0 = await syncFacts();
      await chooser.setFiles(PNG_A);
      const obj = await newBlockAfter(before, 45_000, ['picture']);
      await settled(page);
      await clickControl(page, 'dialog.background.done').catch(() => undefined);
      await closeMenus(page);
      const facts = await pollUntil(bgFacts, (f) => f.picture !== null, 15_000);
      return { ok: Boolean(obj) && obj.type === 'picture', evidence: `before: ${sync0}; ${await describeBlock(obj)}; on the sheet ${facts.picture}; network ${netSince(mark)}` };
    }, { reset: () => closeMenus(page) });
  }
  await shot('background-picture');
  await attempt('Slide background', 'Change background > Dither toggle: the covering picture takes the two tone screen', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const before = await blockOf(page, SLIDE, 'picture');
    const toggle = page.locator('[data-control="dialog.background.dither"]').first();
    const r = await toggle.boundingBox();
    const controls = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog.background."]')].map((e) => e.getAttribute('data-control')).join(','));
    if (!r) {
      await closeMenus(page);
      return { ok: false, evidence: `no dither toggle; dialog controls ${controls}` };
    }
    const mark = net.length;
    await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    const after = await pollUntil(() => blockOf(page, SLIDE, 'picture'), (b) => b && JSON.stringify(b.block.dither) !== JSON.stringify(before?.block.dither), 15_000);
    await settled(page);
    const facts = await pollUntil(bgFacts, (f) => f.dither === 'canvas', 15_000);
    const said = await snackbar(page);
    await clickControl(page, 'dialog.background.done').catch(() => undefined);
    await closeMenus(page);
    return { ok: Boolean(after?.block.dither) && facts.dither === 'canvas', evidence: `covering picture ${before ? before.id : 'none'}; dither ${JSON.stringify(before?.block.dither ?? null)} -> ${JSON.stringify(after?.block.dither ?? null).slice(0, 100)}; canvas on the sheet ${facts.dither}; snackbar ${said}; dialog controls ${controls}; network ${netSince(mark)}` };
  }, { reset: () => closeMenus(page) });
  await shot('background-dither');
  await attempt('Slide background', 'Change background > Remove picture: the covering picture leaves', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const present = await has(page, '[data-control="dialog.background.removePicture"]');
    if (!present) {
      const controls = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog.background."]')].map((e) => e.getAttribute('data-control')).join(','));
      await closeMenus(page);
      return { ok: false, evidence: `no Remove picture control; covering picture ${(await blockOf(page, SLIDE, 'picture')) ? 'present' : 'absent'}; dialog controls ${controls}` };
    }
    await clickControl(page, 'dialog.background.removePicture');
    const gone = await pollUntil(() => blockOf(page, SLIDE, 'picture'), (b) => b === null, 15_000);
    await settled(page);
    await clickControl(page, 'dialog.background.done').catch(() => undefined);
    await closeMenus(page);
    const facts = await bgFacts();
    return { ok: gone === null && facts.picture === null, evidence: `picture block after ${gone ? 'still there' : 'gone'}; on the sheet ${facts.picture ?? 'none'}` };
  }, { reset: () => closeMenus(page) });

  // a colour for the present check
  await attempt('Slide background', 'Change background, a colour swatch, Done (for the present check)', async () => {
    await clearAll(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    const swatches = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog.background.color."]')].map((el) => el.getAttribute('data-control')).filter((c) => !/\.(none|hex)$/.test(c)));
    const pick = swatches.find((c) => /\.ink$/.test(c)) ?? swatches[1];
    await clickControl(page, pick);
    await clickControl(page, 'dialog.background.done');
    const slide = await pollUntil(() => slideJson(page, SLIDE), (s) => s.background !== undefined, 15_000);
    await settled(page);
    return { ok: Boolean(slide.background), evidence: `picked ${pick}; slide.background ${JSON.stringify(slide.background ?? null)}; .slide-bg ${(await bgFacts()).bg}` };
  }, { reset: () => closeMenus(page) });

  // ---- H. present mode, the whole document searched for the picture and the ground
  await attempt('Present', 'Slideshow from the title row: the slide shows the picture and the background colour', async () => {
    await clearAll(page);
    const editorImgs = await page.evaluate(() => document.querySelectorAll('img').length);
    await clickControl(page, 'present.open');
    const facts = await pollUntil(
      () =>
        page.evaluate(() => {
          const s = window.turboslide.studio.describe().state;
          const show = document.querySelector('[data-control="present.show"]');
          const root = show ?? document.body;
          const imgs = [...root.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 50).map((i) => `${i.naturalWidth}x${i.naturalHeight}/${i.complete}/${Math.round(i.getBoundingClientRect().width)}px`);
          const bg = root.querySelector('.slide-bg');
          const slide = root.querySelector('[data-slide]');
          const cls = show ? show.className : null;
          return { present: s.present ?? null, show: Boolean(show), cls, slideAttr: slide?.getAttribute('data-slide') ?? null, imgs, bg: bg ? getComputedStyle(bg).backgroundColor : null, url: location.pathname, editing: Boolean(document.querySelector('.ts-stagewrap.ts-editor')) };
        }),
      (f) => f.show && f.imgs.some((i) => /\/true\//.test(i) && !/^0x0/.test(i)),
      15_000,
    );
    await sleep(600);
    const file = await shot('present');
    await press(page, 'Escape');
    const off = await pollUntil(() => page.evaluate(() => Boolean(document.querySelector('[data-control="present.show"]'))), (v) => v === false, 8000);
    return { ok: facts.show && facts.imgs.some((i) => /\/true\//.test(i) && !/^0x0/.test(i)) && off === false, evidence: `editor imgs before ${editorImgs}; present ${facts.present}; show ${facts.show} (${facts.cls}) at ${facts.url}; data-slide ${facts.slideAttr}; imgs in the present root ${facts.imgs.join(',') || 'none'}; .slide-bg ${facts.bg}; after Escape present view ${off}; shot ${file ? path.basename(file) : 'none'}` };
  }, { reset: () => clearAll(page) });
  // ---- I. the two By URL paths last: a refused write leaves a modal that blocks the editor
  await attempt('Insert picture', 'Insert > Image > By URL with an https PNG on the company domain (generaltranslation.com, allowlisted), then Insert', async () => {
    const r = await insertByUrl(URL_GT);
    const modal = await dismissRefused();
    return { ...r, evidence: `${r.evidence}; refused write modal ${JSON.stringify(modal)}` };
  }, { reset: () => closeMenus(page) });


  await shot('after-url-insert');
  await attempt('Slide background', 'Change background > Choose image > By URL with a PNG on the company domain: a picture object covers the slide at the bottom of the stack', async () => {
    await clearAll(page);
    const before = await ids();
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.changeBackground');
    await page.locator('[data-control="dialog.background"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.background.choose.byUrl');
    await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'dialog.imageByUrl.url');
    await typeHuman(page, URL_GT);
    await sleep(600);
    const mark = net.length;
    await clickControl(page, 'dialog.imageByUrl.ok');
    const obj = await newBlockAfter(before, 40_000, ['picture']);
    const err = await page.evaluate(() => document.querySelector('[data-control="dialog.imageByUrl"] [role="alert"]')?.textContent ?? null);
    await settled(page);
    const dialogs = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog."][role="dialog"], .ts-dialog[data-control]')].map((e) => e.getAttribute('data-control')).join(','));
    await closeMenus(page);
    const facts = await pollUntil(bgFacts, (f) => f.pictureImg && /complete true/.test(f.pictureImg), 15_000);
    const order = (await blocksOf(page, SLIDE)).map((b) => b.id);
    const modal = await dismissRefused();
    return { ok: Boolean(obj) && obj.type === 'picture' && Boolean(facts.picture) && order.indexOf('picture') < order.indexOf(ID), evidence: `${await describeBlock(obj)}; on the sheet ${facts.picture}; img ${facts.pictureImg}; stack order ${order.join(' < ')}; dialogs open after ${dialogs || 'none'}${err ? `; dialog said "${err}"` : ''}; network ${netSince(mark)}; refused write modal ${JSON.stringify(modal)}` };
  }, { reset: () => closeMenus(page) });

  await shot('after-url-background');
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

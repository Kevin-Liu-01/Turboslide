#!/usr/bin/env node
// The B1 fix round 3 drive of the polish round (ship-2.md; B5's R19: Paint format on the title
// placeholder) the way a seller does (the probe's pace: the mouse in steps, 40 to 90 ms per key),
// screenshots after every action worth judging, on one scratch deck from /new that the finally
// block trashes and removes. Reads nothing from the repository but playwright-core. Usage:
//   node drive3.mjs --base <origin> --tag before|after --shots <dir> --json <path>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-live/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4441').replace(/\/$/, '');
const SHOTS = arg(
  'shots',
  '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/build/b1/fix3',
);
const JSON_OUT = arg('json', path.join(SHOTS, 'run.json'));
const ONLY = arg('only', null);
const [VW, VH] = arg('viewport', '1440x900').split('x').map(Number);
const OTHER = VW === 1280 ? { width: 1440, height: 900 } : { width: 1280, height: 800 };
const OIDC = /vercel\.app/.test(BASE) ? process.env.VERCEL_OIDC_TOKEN : undefined;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const consoleErrors = [];
let shotN = 0;
const record = (name, expected, observed, ok, shot, ms) => {
  const row = { n: rows.length + 1, name, expected, observed: String(observed), ok, shot, ms };
  rows.push(row);
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(3)} ${name}\n       expected: ${expected}\n       observed: ${row.observed}${shot ? `\n       shot: ${shot}` : ''}`,
  );
  return row;
};

// ---------------------------------------------------------------------------------------------
// human speed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
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
const drag = async (page, from, to, { steps = 14, during } = {}) => {
  await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 6);
  await sleep(rand(60, 120));
  await page.mouse.down();
  await sleep(rand(60, 110));
  await moveHuman(page, from, to, steps);
  await sleep(rand(80, 140));
  const mid = during ? await during() : undefined;
  await page.mouse.up();
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

const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
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
    const s = await state(page).catch(() => null);
    if (s && (s.sync?.pending ?? s.pending ?? 0) === 0) return s;
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
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const visible = (page, control) => has(page, `[data-control="${control}"]`);
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
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
  await page
    .locator(`#ts-menu-${id} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(250, 400));
  if (!waitFor) return;
  try {
    await page.locator(waitFor).first().waitFor({ timeout: 6000 });
  } catch (error) {
    await moveHuman(
      page,
      { x: r.x + 6, y: r.y + r.height / 2 },
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      6,
    );
    await sleep(rand(300, 450));
    if (
      await page
        .locator(waitFor)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(rand(300, 450));
    await page
      .locator(waitFor)
      .first()
      .waitFor({ timeout: 4000 })
      .catch(() => {
        throw error;
      });
  }
};
const clickRow = async (page, rowId) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
/** Opens a menubar menu, hovers the parents, and leaves the last submenu open (no click). */
const menuOpenTo = async (page, menuId, ...rowIds) => {
  await openMenu(page, menuId);
  for (let i = 0; i < rowIds.length; i += 1) {
    const child = rowIds[i + 1] ? `[data-control="menu.${rowIds[i + 1]}"]` : null;
    await hoverRow(page, rowIds[i], child);
  }
};
const menuPath = async (page, menuId, ...rowIds) => {
  await openMenu(page, menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1)
    await hoverRow(
      page,
      rowIds[i],
      `[data-control="menu.${rowIds[i + 1]}"], [data-control="${rowIds[i + 1]}"]`,
    );
  const last = rowIds[rowIds.length - 1];
  if (await has(page, `[data-control="menu.${last}"]`)) await clickRow(page, last);
  else await clickControl(page, last);
  await sleep(rand(250, 400));
};
const menusOpen = (page) =>
  page.locator('[id^="ts-menu-"]:visible, .ts-context-menu:visible').count();
const closeMenus = async (page) => {
  for (let i = 0; i < 3 && (await menusOpen(page)) > 0; i += 1) {
    await press(page, 'Escape');
    await sleep(150);
  }
};
const tailControl = async (page, control) => {
  if (await visible(page, control)) {
    await clickControl(page, control);
    return control;
  }
  await clickControl(page, 'toolbar.more');
  await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
  await clickControl(page, `toolbar.more.${control}`);
  return `toolbar.more.${control}`;
};
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const selectionText = (page) => page.evaluate(() => window.getSelection()?.toString() ?? '');
const runs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
const runInfo = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    const rect = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((c) => Math.round(c.top))).size;
    const cs = getComputedStyle(el);
    return {
      text: (clone.textContent ?? '').replace(/ /g, ' '),
      prompt: el.querySelector('[data-prompt]')?.textContent ?? null,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      editable: el.getAttribute('contenteditable') === 'true',
      lines,
      font: parseFloat(cs.fontSize),
      family: cs.fontFamily.split(',')[0],
      weight: cs.fontWeight,
      align: cs.textAlign,
      lineHeight: cs.lineHeight,
      html: el.innerHTML.slice(0, 400),
    };
  }, run);
const wordRect = (page, run, index) =>
  page.evaluate(
    ([r, n]) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      const words = [];
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('[data-prompt]')) continue;
        const text = node.textContent ?? '';
        const re = /\S+/g;
        let m;
        while ((m = re.exec(text)))
          words.push({ node, start: m.index, end: m.index + m[0].length, word: m[0] });
      }
      const w = words[n];
      if (!w) return null;
      const range = document.createRange();
      range.setStart(w.node, w.start);
      range.setEnd(w.node, w.end);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, word: w.word };
    },
    [run, index],
  );
const marksOf = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return [];
    return [...el.querySelectorAll('b, strong, i, em, u, s, [data-mark], a, span[style]')].map(
      (m) => ({
        tag: m.tagName.toLowerCase(),
        mark: m.getAttribute('data-mark'),
        text: m.textContent ?? '',
        style: (m.getAttribute('style') ?? '').slice(0, 80),
        href: m.getAttribute('href') ?? m.getAttribute('data-href') ?? null,
      }),
    );
  }, run);
const blockOfRun = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    const block = el?.closest('[data-block]');
    return (
      block?.getAttribute('data-block') ??
      el?.getAttribute('data-block') ??
      el?.closest('.free')?.querySelector('[data-block]')?.getAttribute('data-block') ??
      null
    );
  }, run);
const runsOfBlock = (page, blockId) =>
  page.evaluate((id) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    const box = inner?.closest('.free') ?? inner;
    if (!box) return [];
    const own = box.matches('[data-run]') ? [box.getAttribute('data-run')] : [];
    return [
      ...own,
      ...[...box.querySelectorAll('[data-run]')].map((el) => el.getAttribute('data-run')),
    ];
  }, blockId);
const handleControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const selectionFacts = async (page, id) => {
  const ctrls = await handleControls(page);
  const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) =>
    ctrls.includes(`handle.${id}.resize.${d}`),
  );
  const facts = await page.evaluate(() => {
    const a = document.activeElement;
    const editable =
      a instanceof HTMLElement &&
      (a.isContentEditable || a.getAttribute('contenteditable') === 'true');
    const sel = window.getSelection();
    const caret =
      editable &&
      sel !== null &&
      sel.rangeCount > 0 &&
      a.contains(sel.getRangeAt(0).startContainer) &&
      a.closest('.ts-stagewrap.ts-editor .pt-slide') !== null;
    const ring = document.querySelector('.ts-overlay .ts-select');
    const rr = ring?.getBoundingClientRect();
    return {
      ring: ring !== null,
      ringRect: rr ? { x: rr.x, y: rr.y, w: rr.width, h: rr.height } : null,
      chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
      editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      caret,
      readout: document.querySelector('.ts-readout')?.textContent ?? null,
    };
  });
  return {
    ...facts,
    resize: dirs.length,
    rotate: ctrls.some((c) => /\.rotate$/.test(c)),
    selected: ctrls.includes(`handle.${id}.move`),
    handles: ctrls,
  };
};
const describeSel = (f) =>
  `selected ${f.selected}; resize handles ${f.resize}; rotate ${f.rotate}; ring ${f.ring}; chip ${f.chip === null ? 'none' : `"${f.chip}"`}; session ${f.editing}; caret ${f.caret}`;
const sheetPoint = async (page, sx, sy) => {
  const sheet = await rectOf(page, SHEET);
  if (!sheet) throw new Error('no sheet on the stage');
  const kk = sheet.w / 1600;
  return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
};
const slideJson = async (page, slideId) =>
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
const blockJson = async (page, slideId, id) =>
  JSON.stringify((await objectsOf(page, slideId)).find((o) => o.id === id)?.block ?? null);
const newObjectAfter = async (page, slideId, before, timeout = 20_000) => {
  const objs = await pollUntil(
    () => objectsOf(page, slideId),
    (o) => o.some((x) => !before.includes(x.id)),
    timeout,
  );
  return objs.find((x) => !before.includes(x.id)) ?? null;
};
const activeSlide = async (page) => (await state(page)).slideId;
const clickCard = async (page, slideId) => {
  const loc = page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await loc.boundingBox();
  if (!r) throw new Error(`no card ${slideId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await pollUntil(
    () => activeSlide(page),
    (a) => a === slideId,
    5000,
  );
  await page
    .waitForSelector(`.pt-viewer[data-active="${slideId}"]`, { timeout: 5000 })
    .catch(() => undefined);
  await sleep(400);
};
const dismissPrompts = async (page) => {
  const close = page
    .locator('[data-control="dialog.namePrompt.close"], [data-control="dialog.namePrompt.skip"]')
    .first();
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 2000 }).catch(() => undefined);
    await sleep(250);
    return true;
  }
  return false;
};
const toolbarPressed = (page, control) =>
  page.evaluate((c) => {
    const el = document.querySelector(`[data-control="${c}"]`);
    return el
      ? `${el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? (el.classList.contains('is-on') ? 'is-on' : 'off')}`
      : 'absent';
  }, control);
const tailControls = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control="toolbar.tail"] [data-control], .ts-toolbar [data-control^="toolbar."]',
      ),
    ]
      .map((el) => el.getAttribute('data-control'))
      .filter((c, i, a) => a.indexOf(c) === i),
  );

// ---------------------------------------------------------------------------------------------
// the walk

const shot = async (page, name, { clip = null, scale = 'css' } = {}) => {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page
    .screenshot({ path: path.join(SHOTS, file), scale, ...(clip ? { clip } : {}) })
    .catch((e) => console.log(`       shot failed: ${e.message.split('\n')[0]}`));
  return file;
};
/** A 2x clip around a rect, grown by `pad` css px. */
const clipShot = async (page, name, rect, pad = 36) => {
  if (!rect) return null;
  const vp = page.viewportSize();
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const w = Math.min(vp.width - x, rect.w + 2 * pad);
  const h = Math.min(vp.height - y, rect.h + 2 * pad);
  return shot(page, name, { clip: { x, y, width: w, height: h }, scale: 'device' });
};
const ringRect = (page) => rectOf(page, '.ts-overlay .ts-select');

const hooks = { before: null };
const stepBase = async (page, name, expected, fn) => {
  const started = Date.now();
  try {
    await dismissPrompts(page);
    if (hooks.before) await hooks.before().catch(() => undefined);
    const r = await fn();
    const s = r.shot ?? null;
    record(
      name,
      expected,
      r.ok === null ? `not driven: ${r.observed}` : r.observed,
      r.ok,
      s,
      Date.now() - started,
    );
    if (r.ok === false) await closeMenus(page).catch(() => undefined);
    return r;
  } catch (error) {
    const file = await shot(page, `${name}-failed`);
    record(
      name,
      expected,
      `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      false,
      file,
      Date.now() - started,
    );
    await closeMenus(page).catch(() => undefined);
    await press(page, 'Escape', 2).catch(() => undefined);
    return { ok: false, observed: 'error' };
  }
};

// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// The fix round 3 drive of B1's finding (ship-2.md; B5's R19; the row text.tail.heading-takes-list-
// indent's Paint format half): the title placeholder selected by one click, Paint format from the
// toolbar, the button read, the brush applied to a text block on the next slide, Cmd+Z, Escape.
// --tag before|after names the pictures; the same steps run on the unfixed preview first and on the
// fixed preview after.

const TAG = arg('tag', 'after');
const nm = (s) => `${TAG}-${s}`;
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
        .filter((el) => el.closest('.ts-overlay') === null && el.textContent?.trim())
        .map((el) => el.textContent?.trim() ?? '')
        .join(' | ') || null,
  );
const paintButton = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-control="toolbar.paintFormat"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      pressed: el.getAttribute('aria-pressed'),
      disabled: el.getAttribute('aria-disabled'),
      on: el.classList.contains('is-on'),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  });
const stagePaint = (page) =>
  page.evaluate(
    () => document.querySelector('.ts-stagewrap.ts-editor')?.hasAttribute('data-paint') ?? false,
  );
const headRect = (page) => rectOf(page, '[data-control="toolbar.head"]');
const clickTitle = async (page) => {
  const runsNow = await runs(page);
  const head = runsNow.find((r) => /heading/.test(r)) ?? runsNow[0];
  const info = await runInfo(page, head);
  if (!info) throw new Error('no heading run');
  await clickAt(page, info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
  await sleep(250);
  return head;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  extraHTTPHeaders: headers,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});

const deck = { id: '', titleSlide: '', blank: '' };
const facts = {};
const step = async (page, name, expected, fn) => {
  if (ONLY !== null && name !== 'new-deck' && !ONLY.split(',').includes(name))
    return { ok: null, observed: 'skipped' };
  return stepBase(page, name, expected, fn);
};
const write = async (page, action, input = {}) => {
  const s = await state(page);
  return invoke(page, action, { ...input, baseRevision: s.revision });
};
const objectIds = async (page, slideId) => (await objectsOf(page, slideId)).map((o) => o.id);
const placeBlock = async (page, slideId, block, slot = 'main') => {
  const before = await objectIds(page, slideId);
  await write(page, 'block.insert', { slideId, slot, block });
  const obj = await newObjectAfter(page, slideId, before);
  await settled(page);
  return obj;
};
const slideOrder = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((el) =>
      el.getAttribute('data-control').slice('filmstrip.slide.'.length),
    ),
  );
const setupSlide = async (page, layout = 'blank') => {
  const before = await slideOrder(page);
  await write(page, 'slide.new', { layout });
  const order = await pollUntil(
    () => slideOrder(page),
    (o) => o.length === before.length + 1,
    20_000,
  );
  const id = order.find((x) => !before.includes(x)) ?? null;
  await settled(page);
  return id;
};
const clearAll = async (page) => {
  await press(page, 'Escape', 2);
  const sheet = await rectOf(page, SHEET);
  if (sheet) await clickAt(page, sheet.x + sheet.w - 6, sheet.y + sheet.h - 6);
  await sleep(200);
};
const typographyOf = async (page, slideId, id) => {
  const obj = (await objectsOf(page, slideId)).find((o) => o.id === id);
  return obj?.block?.typography ?? null;
};

try {
  await step(
    page,
    'new-deck',
    'open /new; the editor is ready on the cover; a blank slide with a 20 px text box added through the window API; back on the cover',
    async () => {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      const info = await invoke(page, 'deck.info');
      deck.id = info.id;
      deck.titleSlide = (await state(page)).slideId;
      await dismissPrompts(page);
      await sleep(500);
      deck.blank = await setupSlide(page, 'blank');
      await placeBlock(page, deck.blank, {
        id: 'fx-agenda',
        type: 'text',
        text: 'Agenda for the quarter',
        typography: { size: 20 },
        pos: { x: 200, y: 200, w: 900, h: 120 },
      });
      await clickCard(page, deck.titleSlide);
      const file = await shot(page, nm('01-cover'));
      return {
        ok: Boolean(deck.id && deck.blank),
        observed: `deck ${deck.id}; cover ${deck.titleSlide}; blank slide ${deck.blank} with fx-agenda at 20 px`,
        shot: file,
      };
    },
  );
  if (!deck.id || !deck.blank) throw new Error('no deck');

  // ---- the title placeholder selected by one click: the tail draws Paint format enabled
  await step(
    page,
    'title-select',
    'one click on the title placeholder: the heading is selected with its ring and chip, no session; Paint format on the toolbar reads enabled and not pressed',
    async () => {
      await clearAll(page);
      await clickTitle(page);
      const sel = await selectionFacts(page, 'heading');
      const button = await paintButton(page);
      const head = await headRect(page);
      const file = await clipShot(
        page,
        nm('02-title-selected-head-2x'),
        head ? { x: head.x, y: head.y, w: head.w, h: head.h } : null,
        12,
      );
      const file2 = await shot(page, nm('03-title-selected'));
      facts.titleSelect = { sel: describeSel(sel), button };
      return {
        ok:
          sel.ring &&
          !sel.editing &&
          button !== null &&
          button.disabled !== 'true' &&
          button.pressed !== 'true',
        observed: `${describeSel(sel)}; Paint format ${button === null ? 'absent' : `aria-disabled ${button.disabled}, aria-pressed ${button.pressed}, is-on ${button.on}`}; ${file2}`,
        shot: file,
      };
    },
  );

  // ---- Paint format from the toolbar: the brush arms and the button says so
  await step(
    page,
    'paint-arm',
    'Paint format clicked with the title placeholder selected: the brush arms (the stage carries data-paint), the button reads aria-pressed true with the pressed ground, no snackbar',
    async () => {
      await clearAll(page);
      await clickTitle(page);
      await clickControl(page, 'toolbar.paintFormat');
      await sleep(400);
      const button = await paintButton(page);
      const armed = await stagePaint(page);
      const snack = await snackbar(page);
      const head = await headRect(page);
      const file = await clipShot(
        page,
        nm('04-paint-armed-head-2x'),
        head ? { x: head.x, y: head.y, w: head.w, h: head.h } : null,
        12,
      );
      const file2 = await shot(page, nm('05-paint-armed'));
      facts.paintArm = { button, armed, snack };
      return {
        ok: armed && button !== null && button.pressed === 'true' && button.on && snack === null,
        observed: `stage data-paint ${armed}; button aria-pressed ${button?.pressed}, is-on ${button?.on}; snackbar ${snack === null ? 'none' : `"${snack}"`}; ${file2}`,
        shot: file,
      };
    },
  );

  // ---- the brush on the next slide's text box: the cover's look lands, Cmd+Z takes it back
  await step(
    page,
    'paint-apply',
    "the blank slide's card clicked with the brush armed, then the 20 px text box: the box takes the cover heading's size and weight in one write; Cmd+Z takes it back",
    async () => {
      const armedBefore = await stagePaint(page);
      const before = await typographyOf(page, deck.blank, 'fx-agenda');
      await clickCard(page, deck.blank);
      const armedOnCard = await stagePaint(page);
      const obj = (await objectsOf(page, deck.blank)).find((o) => o.id === 'fx-agenda');
      if (!obj) throw new Error('no fx-agenda');
      const p = await sheetPoint(page, obj.pos.x + obj.pos.w / 2, obj.pos.y + obj.pos.h / 2);
      await clickAt(page, p.x, p.y);
      const after = await pollUntil(
        () => typographyOf(page, deck.blank, 'fx-agenda'),
        (t) => t !== null && t.size !== before?.size,
        8000,
      );
      await settled(page);
      const armedAfter = await stagePaint(page);
      const button = await paintButton(page);
      const file = await shot(page, nm('06-painted'));
      await clearAll(page);
      await press(page, 'Meta+z');
      await settled(page);
      const undone = await pollUntil(
        () => typographyOf(page, deck.blank, 'fx-agenda'),
        (t) => JSON.stringify(t) === JSON.stringify(before),
        8000,
      );
      facts.paintApply = { before, after, undone, armedBefore, armedOnCard, armedAfter };
      const painted = after !== null && after.size === 88 && typeof after.weight === 'number';
      return {
        ok:
          armedBefore &&
          armedOnCard &&
          painted &&
          !armedAfter &&
          button?.pressed !== 'true' &&
          JSON.stringify(undone) === JSON.stringify(before),
        observed: `brush armed before the card ${armedBefore}, on the card ${armedOnCard}; fx-agenda ${JSON.stringify(before)} -> ${JSON.stringify(after)}; brush after the paint ${armedAfter}, button aria-pressed ${button?.pressed}; after Cmd+Z ${JSON.stringify(undone)}`,
        shot: file,
      };
    },
  );

  // ---- Escape disarms and the button follows
  await step(
    page,
    'paint-escape',
    'back on the cover, the title selected and Paint format clicked, then Escape: the brush disarms and the button reads not pressed',
    async () => {
      await clickCard(page, deck.titleSlide);
      await clearAll(page);
      await clickTitle(page);
      await clickControl(page, 'toolbar.paintFormat');
      await sleep(400);
      const armed = await paintButton(page);
      const stageArmed = await stagePaint(page);
      await press(page, 'Escape');
      await sleep(300);
      const button = await paintButton(page);
      const stageAfter = await stagePaint(page);
      const head = await headRect(page);
      const file = await clipShot(
        page,
        nm('07-paint-escaped-head-2x'),
        head ? { x: head.x, y: head.y, w: head.w, h: head.h } : null,
        12,
      );
      facts.paintEscape = { armed, stageArmed, button, stageAfter };
      return {
        ok:
          stageArmed &&
          armed?.pressed === 'true' &&
          !stageAfter &&
          button?.pressed === 'false' &&
          !button?.on,
        observed: `armed: stage ${stageArmed}, button aria-pressed ${armed?.pressed}; after Escape: stage ${stageAfter}, button aria-pressed ${button?.pressed}, is-on ${button?.on}`,
        shot: file,
      };
    },
  );
} finally {
  const summary = {
    started: new Date().toISOString(),
    base: BASE,
    tag: TAG,
    deck: deck.id,
    rows,
    consoleErrors,
    facts,
  };
  writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  try {
    if (deck.id) {
      /* the teardown: deck.trash then deck.remove take { id, baseRevision } (and confirm), the shape
         scripts/probes/editor-walk-probe.mjs 3343 uses; the fix round 2 drive named deckId and its
         silent catch hid the refusal */
      const info = await invoke(page, 'deck.info').catch(() => null);
      if (info)
        await invoke(page, 'deck.trash', { id: deck.id, baseRevision: info.revision }).catch((e) =>
          console.log(`trash: ${String(e).slice(0, 160)}`),
        );
      const again = await invoke(page, 'deck.info').catch(() => null);
      if (again)
        await invoke(page, 'deck.remove', {
          id: deck.id,
          baseRevision: again.revision,
          confirm: true,
        }).catch((e) => console.log(`remove: ${String(e).slice(0, 160)}`));
      const status = await page.request
        .get(`${BASE}/edit/${deck.id}`, { headers })
        .then((r) => r.status())
        .catch(() => 'unreachable');
      console.log(`teardown: /edit/${deck.id} answers ${status}`);
    }
  } catch {}
  await browser.close();
  const failed = rows.filter((r) => r.ok === false).length;
  console.log(
    `\n${rows.length} steps, ${failed} failed, ${rows.filter((r) => r.ok === null).length} not driven; console errors ${consoleErrors.length}; deck ${deck.id}`,
  );
}

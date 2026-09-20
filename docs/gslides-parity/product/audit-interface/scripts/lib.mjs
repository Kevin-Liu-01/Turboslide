// Shared helpers of the interface craft audit (docs/gslides-parity/product/audit-interface.md).
// Imports nothing from the repository but playwright-core (resolved from the repository root).
// Every gesture is at human speed: the mouse moves in steps, keys land 40 to 90 ms apart, double
// clicks are the browser's own, drags hold the pointer through a move stream.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
export const { chromium } = require('playwright-core');

export const BASE = 'https://turboslide.vercel.app';
export const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/product/audit-interface';
export const SCRATCH =
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/product/interface';
mkdirSync(OUT, { recursive: true });
mkdirSync(SCRATCH, { recursive: true });

// ---------------------------------------------------------------------------------------------
// human speed

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
export const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
};
export const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const MOD_KEY = { shift: 'Shift', alt: 'Alt' };
export const drag = async (page, from, to, { mods = [], steps = 14, during } = {}) => {
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
export const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
};
export const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
export const hoverAt = async (page, x, y, settle = 200) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(settle);
};

// ---------------------------------------------------------------------------------------------
// the browser

/**
 * A context at a size and in an appearance: the boot script reads `gt-theme` (light or dark,
 * default dark) and the editor chrome reads `ts-chrome-appearance` (light, dark or match).
 */
export const STORAGE_FILE = `${SCRATCH}/storage-state.json`;
export const newContext = async (browser, { width = 1440, height = 900, theme = 'light', storageState = null } = {}) => {
  // the anonymous principal lives in the browser's cookies and storage: a context that must edit
  // a deck another context created loads that context's saved storage state
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
      localStorage.setItem('ts-chrome-appearance', t);
    } catch {
      /* private mode */
    }
  }, theme);
  return context;
};

export const attachConsole = (page, sink) => {
  page.on('pageerror', (e) => sink.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console: ${m.text().slice(0, 200)}`);
  });
};

// ---------------------------------------------------------------------------------------------
// the product

export const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
export const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
export const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
export const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
export const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
export const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
export const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
export const rectOfControl = (page, control) => rectOf(page, `[data-control="${control}"]`);
export const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
export const openMenu = async (page, id) => {
  const r = await rectOfControl(page, `menubar.${id}`);
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
export const hoverRow = async (page, rowId, waitFor) => {
  const r = await rectOfControl(page, `menu.${rowId}`);
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(page, { x: r.x - 20, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
  await sleep(rand(300, 450));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
export const clickRow = async (page, rowId) => {
  const r = await rectOfControl(page, `menu.${rowId}`);
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
};
export const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
export const menuPath = async (page, menuId, ...rowIds) => {
  await openMenu(page, menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1) {
    await hoverRow(page, rowIds[i], `[data-control="menu.${rowIds[i + 1]}"], [data-control="${rowIds[i + 1]}"]`);
  }
  const last = rowIds[rowIds.length - 1];
  if (await has(page, `[data-control="menu.${last}"]`)) await clickRow(page, last);
  else await clickControl(page, last);
  await sleep(rand(250, 400));
};
export const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
export const surfaceState = (page) =>
  page
    .evaluate(() => {
      const visible = (el) => el.getClientRects().length > 0;
      return {
        menus: [...document.querySelectorAll('[id^="ts-menu-"], .ts-context-menu')].filter(visible)
          .length,
        dialogs: [...document.querySelectorAll('.ts-dialog-scrim [role="dialog"]')].filter(visible)
          .length,
        popovers: [
          ...document.querySelectorAll('.ts-picker, [data-control$=".plate"], .ts-popover, .ts-tb-swatches, .ts-layout-plate'),
        ].filter(visible).length,
        panel: document.querySelector('.pt-viewer.is-editor[data-rpanel]')?.getAttribute('data-rpanel') ?? null,
        editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      };
    })
    .catch(() => ({ menus: 0, dialogs: 0, popovers: 0, panel: null, editing: false }));
export const surfaceClear = async (page) => {
  let s = await surfaceState(page);
  for (let i = 0; i < 3 && (s.menus > 0 || s.popovers > 0); i += 1) {
    await press(page, 'Escape');
    await sleep(150);
    s = await surfaceState(page);
  }
  for (let i = 0; i < 3 && s.dialogs > 0; i += 1) {
    const closer = page
      .locator(
        '.ts-dialog-scrim [role="dialog"] [data-control$=".done"], .ts-dialog-scrim [role="dialog"] [data-control$=".close"], .ts-dialog-scrim [role="dialog"] [data-control$=".cancel"], .ts-dialog-scrim [role="dialog"] .ts-dialog-x',
      )
      .last();
    if ((await closer.count()) > 0) await closer.click({ timeout: 2000 }).catch(() => undefined);
    else await press(page, 'Escape');
    await sleep(200);
    s = await surfaceState(page);
  }
  if (s.editing) {
    await press(page, 'Escape', 2);
    await sleep(150);
  }
  return surfaceState(page);
};
/** Closes the two prompts the product raises on its own (the name prompt, the recovered writes plate). */
export const dismissPrompts = async (page) => {
  const seen = await page
    .evaluate(() => {
      const visible = (sel) => {
        const el = document.querySelector(sel);
        return el !== null && el.getClientRects().length > 0;
      };
      return {
        namePrompt: visible('[data-control="dialog.namePrompt"]'),
        persisted: visible('[data-control="sync.persisted"]'),
      };
    })
    .catch(() => ({ namePrompt: false, persisted: false }));
  if (seen.namePrompt) {
    const close = page.locator('[data-control="dialog.namePrompt.close"]').first();
    if ((await close.count()) > 0) await close.click({ timeout: 2000 }).catch(() => undefined);
    else await press(page, 'Escape');
    await sleep(200);
  }
  if (seen.persisted) {
    await page
      .locator('[data-control="sync.persisted.apply"]')
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await sleep(300);
  }
  return seen;
};

// ---------------------------------------------------------------------------------------------
// the sheet and the objects

export const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
export const sheetPoint = async (page, sx, sy) => {
  const sheet = await rectOf(page, SHEET);
  if (!sheet) throw new Error('no sheet on the stage');
  const kk = sheet.w / 1600;
  return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
};
export const activeSlide = async (page) => (await state(page)).slideId;
export const slideJson = async (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
export const objectsOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string' && node.pos && typeof node.pos === 'object')
        out.push({ id: node.id, type: node.type, pos: node.pos });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
export const runs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) => el.getAttribute('data-run')),
  );
export const boxOf = (page, id) =>
  page.evaluate((blockId) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`);
    if (!inner) return null;
    const free = inner.closest('.free') ?? inner;
    const f = free.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    return { free: { x: f.x, y: f.y, w: f.width, h: f.height }, inner: { x: i.x, y: i.y, w: i.width, h: i.height } };
  }, id);
export const handleControls = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) => el.getAttribute('data-control')));
export const readout = (page) => page.evaluate(() => document.querySelector('.ts-readout')?.textContent ?? null);
export const chip = (page) => page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
/** The first object of a slide that was not there before, or null after `timeout`. */
export const newObjectAfter = async (page, slideId, before, timeout = 20_000, want = null) => {
  // a slide that becomes a canvas on its first insert gives its placeholders a pos in the same
  // write, so "not in before" alone can name a placeholder; the wanted type picks the object
  const fresh = (o) => !before.includes(o.id) && (want === null || o.type === want);
  const objs = await pollUntil(
    () => objectsOf(page, slideId),
    (o) => o.some(fresh),
    timeout,
  );
  const hits = objs.filter(fresh);
  return hits.length > 0 ? hits[hits.length - 1] : null;
};
/** Arms a tool through the Insert menu rows, then clicks the sheet at a sheet point or drags. */
export const insertByTool = async (page, slideId, rows, at, dragTo = null, want = null) => {
  const before = (await objectsOf(page, slideId)).map((o) => o.id);
  await surfaceClear(page);
  await openMenu(page, 'insert');
  for (let i = 0; i < rows.length - 1; i += 1) {
    const next = rows[i + 1];
    await hoverRow(page, rows[i], `[data-control="menu.${next}"], [data-control="${next}"]`);
  }
  const last = rows[rows.length - 1];
  if (await has(page, `[data-control="menu.${last}"]`)) await clickRow(page, last);
  else await clickControl(page, last);
  await sleep(400);
  const p = await sheetPoint(page, at.x, at.y);
  if (dragTo) {
    const q = await sheetPoint(page, dragTo.x, dragTo.y);
    await drag(page, p, q);
  } else await clickAt(page, p.x, p.y);
  const obj = await newObjectAfter(page, slideId, before, 20_000, want);
  await sleep(300);
  return obj;
};
/** One click on an object (A1 rule 1), at its centre; the selection facts 250 ms later. */
export const clickSelect = async (page, id) => {
  const b = await boxOf(page, id);
  if (!b) throw new Error(`no object ${id} on the stage`);
  const c = b.inner.w > 4 && b.inner.h > 4 ? center(b.inner) : center(b.free);
  await clickAt(page, c.x, c.y);
  await sleep(250);
  const ctrls = await handleControls(page);
  return { ctrls, chip: await chip(page), ring: await has(page, '.ts-overlay .ts-select') };
};

// ---------------------------------------------------------------------------------------------
// reading the interface: computed styles, effective colours, contrast

/** sRGB channel to linear light. */
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
export const hex = ([r, g, b]) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * Reads one element: its box, the computed values that name its grammar (height, padding,
 * border, radius, font, colours, outline, transition, cursor), its text colour composited over
 * the effective ground under it and the two contrast ratios the audit judges (text on ground,
 * border on ground). Runs in the page; `sel` is a selector or an element handle.
 */
export const PROBE_FN = `(sel, pseudo) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return null;
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    if (!top) return bottom;
    const a = top.a;
    return {
      r: top.r * a + bottom.r * (1 - a),
      g: top.g * a + bottom.g * (1 - a),
      b: top.b * a + bottom.b * (1 - a),
      a: 1,
    };
  };
  const paper = parse(getComputedStyle(document.documentElement).getPropertyValue('--pt-paper').trim().replace(/^#([0-9a-f]{6})$/i, (m, h) => 'rgb(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ')')) || { r: 255, g: 255, b: 255, a: 1 };
  // the ground under an element: the backgrounds from the root down, composited in order
  const chain = [];
  for (let n = el; n; n = n.parentElement) chain.unshift(n);
  let ground = { ...paper };
  for (const n of chain) {
    const bg = parse(getComputedStyle(n).backgroundColor);
    if (bg && bg.a > 0) ground = over(bg, ground);
  }
  const cs = getComputedStyle(el, pseudo || null);
  const own = parse(cs.backgroundColor);
  const groundUnderText = own && own.a > 0 ? ground : ground;
  const color = parse(cs.color);
  const border = parse(cs.borderTopColor);
  const outline = parse(cs.outlineColor);
  const groundBelowEl = (() => {
    let g = { ...paper };
    for (const n of chain.slice(0, -1)) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) g = over(bg, g);
    }
    return g;
  })();
  const rgb = (c) => (c ? [c.r, c.g, c.b] : null);
  const r = el.getBoundingClientRect();
  const svg = el.querySelector && el.querySelector('svg');
  const sr = svg ? svg.getBoundingClientRect() : null;
  return {
    tag: el.tagName.toLowerCase(),
    control: el.getAttribute('data-control'),
    cls: typeof el.className === 'string' ? el.className : '',
    text: (el.textContent || '').trim().slice(0, 80),
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    height: cs.height,
    width: cs.width,
    padding: cs.padding,
    margin: cs.margin,
    gap: cs.gap,
    border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
    borderWidths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '),
    radius: cs.borderRadius,
    font: cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontWeight + ' ' + cs.fontFamily.split(',')[0],
    fontSize: parseFloat(cs.fontSize),
    fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing,
    color: cs.color,
    background: cs.backgroundColor,
    outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor + ' offset ' + cs.outlineOffset,
    transition: cs.transitionProperty + ' ' + cs.transitionDuration,
    animation: cs.animationName + ' ' + cs.animationDuration,
    cursor: cs.cursor,
    opacity: cs.opacity,
    textOverflow: cs.textOverflow,
    whiteSpace: cs.whiteSpace,
    svg: sr ? { w: sr.width, h: sr.height } : null,
    ground: rgb(groundUnderText),
    groundBelow: rgb(groundBelowEl),
    colorRgb: color ? rgb(over(color, groundUnderText)) : null,
    borderRgb: border && border.a > 0 ? rgb(over(border, groundBelowEl)) : null,
    outlineRgb: outline && outline.a > 0 ? rgb(over(outline, groundBelowEl)) : null,
    ownBgRgb: own && own.a > 0 ? rgb(over(own, groundBelowEl)) : null,
    disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true,
    pressed: el.getAttribute('aria-pressed'),
    title: el.getAttribute('title'),
    tip: el.getAttribute('data-tip'),
    ariaLabel: el.getAttribute('aria-label'),
    focusVisible: el.matches(':focus-visible'),
    hover: el.matches(':hover'),
  };
}`;
export const probe = async (page, sel, pseudo = null) => {
  const facts = await page.evaluate(`(${PROBE_FN})(${JSON.stringify(sel)}, ${JSON.stringify(pseudo)})`);
  return decorate(facts);
};
export const probeAll = async (page, sel, limit = 40) => {
  const list = await page.evaluate(
    `((s, n, fn) => [...document.querySelectorAll(s)].slice(0, n).map((el) => fn(el)))(${JSON.stringify(sel)}, ${limit}, ${PROBE_FN})`,
  );
  return list.map(decorate);
};
const decorate = (f) => {
  if (!f) return f;
  if (f.colorRgb && f.ground) f.textContrast = contrast(f.colorRgb, f.ground);
  if (f.borderRgb && f.groundBelow) f.borderContrast = contrast(f.borderRgb, f.groundBelow);
  if (f.outlineRgb && f.groundBelow) f.outlineContrast = contrast(f.outlineRgb, f.groundBelow);
  if (f.ownBgRgb && f.groundBelow) f.groundContrast = contrast(f.ownBgRgb, f.groundBelow);
  if (f.colorRgb) f.colorHex = hex(f.colorRgb);
  if (f.ground) f.groundHex = hex(f.ground);
  if (f.borderRgb) f.borderHex = hex(f.borderRgb);
  return f;
};

/** The tokens of the page as the browser resolved them. */
export const tokens = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--pt-paper', '--pt-ink', '--pt-ink-2', '--pt-titanium', '--pt-hair', '--pt-hair-soft', '--pt-plate', '--pt-edge',
      '--pt-select', '--pt-guide', '--pt-radius', '--pt-title-h', '--pt-menu-h', '--pt-tool-h', '--pt-status-h',
      '--pt-panel-w', '--pt-sb-w', '--pt-menu-w', '--pt-ctl-h', '--pt-dur-fast', '--pt-dur-enter',
    ];
    const out = { theme: document.documentElement.getAttribute('data-theme') };
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    return out;
  });

// ---------------------------------------------------------------------------------------------
// pictures

export const shot = async (page, name, clip = null) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) }).catch((e) => console.log(`shot ${name} failed: ${e.message}`));
  return file;
};
export const shotBytes = (page, clip = null) => page.screenshot(clip ? { clip } : {});
/** A pad around a box, clamped to the viewport. */
export const pad = (r, p, vw, vh) => ({
  x: Math.max(0, r.x - p),
  y: Math.max(0, r.y - p),
  width: Math.min(vw - Math.max(0, r.x - p), r.w + 2 * p),
  height: Math.min(vh - Math.max(0, r.y - p), r.h + 2 * p),
});

/** A PNG (8 bit RGB or RGBA, non interlaced) as `{ width, height, at(x, y) }`. zlib only. */
export const decodePng = (buf) => {
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colorType = data[9];
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    cur.copy(px, y * stride);
    prev = cur;
  }
  return {
    width,
    height,
    at: (x, y) => {
      const i = (Math.round(y) * width + Math.round(x)) * channels;
      return [px[i], px[i + 1], px[i + 2]];
    },
  };
};

// ---------------------------------------------------------------------------------------------
// the table

export class Table {
  constructor(file) {
    this.file = file;
    this.rows = [];
    this.startedAt = new Date().toISOString();
  }
  add(surface, what, observed, extra = {}) {
    const row = { n: this.rows.length + 1, surface, what, observed, ...extra };
    this.rows.push(row);
    console.log(`${String(row.n).padStart(3)} [${surface}] ${what}: ${typeof observed === 'string' ? observed : JSON.stringify(observed).slice(0, 300)}`);
    return row;
  }
  save(extra = {}) {
    writeFileSync(this.file, JSON.stringify({ startedAt: this.startedAt, finishedAt: new Date().toISOString(), ...extra, rows: this.rows }, null, 2));
  }
}

/** Runs a step; a failure is a row, never the end of the run. */
export const step = async (table, surface, what, fn) => {
  try {
    const r = await fn();
    if (r !== undefined) table.add(surface, what, r);
    return r;
  } catch (error) {
    table.add(surface, what, `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`, { error: true });
    return null;
  }
};

// ---------------------------------------------------------------------------------------------
// the scratch deck

/** Creates a deck from /new with a typed title; returns its id once the address has moved. */
export const createDeck = async (page, title = 'Interface audit') => {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await dismissPrompts(page);
  const all = await runs(page);
  const head = all.find((r) => /heading/.test(r)) ?? all[0];
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`).first();
  const r = await el.boundingBox();
  await dblclickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await sleep(300);
  await typeHuman(page, title);
  await press(page, 'Escape', 2);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  const info = await invoke(page, 'deck.info');
  return info.id;
};

/** File > Move to trash, Delete forever on /decks/trash, then a 404 probe. Never throws. */
export const destroyDeck = async (page, deckId, log = console.log) => {
  if (!deckId) return { trashed: false, status: null };
  let trashed = false;
  try {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await pollUntil(() => state(page), (s) => s.sync?.connected === true, 30_000);
    await settled(page);
    await dismissPrompts(page);
    await clickControl(page, 'menubar.file');
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'menu.file.moveToTrash');
    await page.waitForURL(/\/decks$/, { timeout: 20_000 });
    log(`trash: ${deckId} moved to the trash`);
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    const card = page.locator(`[data-control="trash.card.${deckId}"]`);
    await card.waitFor({ timeout: 30_000 });
    await clickControl(page, `trash.delete.${deckId}`);
    await clickControl(page, 'trash.confirm.ok');
    await card.waitFor({ state: 'detached', timeout: 30_000 });
    log(`trash: ${deckId} deleted forever`);
    trashed = true;
  } catch (error) {
    log(`trash: the product path failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); falling back to the actions API`);
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
      /* the 404 probe below tells the truth */
    }
  }
  let status = 0;
  const until = Date.now() + 20_000;
  for (;;) {
    const res = await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 }).catch(() => null);
    status = res ? res.status() : 0;
    if (status === 404 || Date.now() > until) break;
    await sleep(2000);
  }
  log(`trash: GET /deck/${deckId} answers ${status}`);
  return { trashed, status };
};

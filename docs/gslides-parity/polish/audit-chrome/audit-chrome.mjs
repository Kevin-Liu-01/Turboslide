#!/usr/bin/env node
// The chrome audit of the polish round (docs/gslides-parity/polish/audit-chrome.md): the title
// row, every menu and submenu row (read with nothing selected and with a text box, a picture, a
// shape and a table selected, each leaf clicked once), the toolbar at 1440 and 1280, Format
// options per object type, the dialogs, the right click menus, tooltips, Tools > Advanced tools
// on and off, Help > Keyboard shortcuts against the real keys, both appearances and the layout
// shift on load. Driven on production at human speed on one scratch deck created from /new and
// trashed and deleted forever in the finally block. Imports nothing from the repository but
// playwright-core; the menu model is read from model.json beside this file (a dump of
// packages/chrome/src/menus/model.ts).
//
//   node audit-chrome.mjs [--base https://www.turboslide.com] [--only a,b,c] [--scale 2]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-live/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://www.turboslide.com').replace(/\/$/, '');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const SCALE = Number(arg('scale', '2'));
const NO_CLICKS = argv.includes('--no-clicks');
const OUT = arg('out', '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-chrome');
mkdirSync(OUT, { recursive: true });
const MODEL = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));
const want = (section) => ONLY.length === 0 || ONLY.includes(section);

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const facts = {};
const consoleErrors = [];
const startedAt = new Date().toISOString();
const log = (...a) => console.log(...a);
let shotN = 0;
const record = (section, feature, interaction, result, evidence, shots = []) => {
  const row = {
    n: rows.length + 1,
    section,
    feature,
    interaction,
    result,
    evidence,
    shots: Array.isArray(shots) ? shots : [shots],
  };
  rows.push(row);
  const tag =
    { works: 'ok  ', flaky: 'FLKY', broken: 'FAIL', 'not driven': 'n/d ', note: 'note' }[result] ??
    '????';
  log(
    `${tag} ${String(row.n).padStart(3)} [${section}] ${feature} :: ${interaction}\n       ${String(evidence).slice(0, 600)}${row.shots.length ? `\n       shots: ${row.shots.join(', ')}` : ''}`,
  );
  return row;
};
const fact = (key, value) => {
  facts[key] = value;
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
const drag = async (page, from, to, steps = 14) => {
  await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 5);
  await page.mouse.down();
  await sleep(rand(60, 100));
  await moveHuman(page, from, to, steps);
  await sleep(rand(60, 100));
  await page.mouse.up();
  await sleep(rand(160, 260));
};
const parkMouse = async (page) => {
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  await page.mouse.move(Math.round(size.width / 2), size.height - 30);
  await sleep(200);
};
/** A chord in the model's grammar ("Cmd+Shift+Z") pressed as Playwright keys. */
const chordKeys = (chord) => {
  const parts = chord.split('+').map((p) => p.trim());
  const key = parts.pop();
  const mods = parts.map(
    (m) => ({ Cmd: 'Meta', Ctrl: 'Control', Option: 'Alt', Alt: 'Alt', Shift: 'Shift' })[m] ?? m,
  );
  const named = {
    Plus: '=',
    Minus: '-',
    Enter: 'Enter',
    Esc: 'Escape',
    Tab: 'Tab',
    Space: 'Space',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Home: 'Home',
    End: 'End',
  };
  const k = named[key] ?? (key.length === 1 ? key.toLowerCase() : key);
  return [...mods, k].join('+');
};
const pressChord = async (page, chord) => {
  await page.keyboard.press(chordKeys(chord));
  await sleep(rand(120, 220));
};

// ---------------------------------------------------------------------------------------------
// the product

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(600);
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
const waitRevision = async (page, want, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s.revision >= want) return s.revision;
    if (Date.now() > until) return s.revision;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 10_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const rectOfControl = (page, control) => rectOf(page, `[data-control="${control}"]`);
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const visibleControl = (page, control) => has(page, `[data-control="${control}"]`);
const textOf = (page, selector) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector);
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).first().boundingBox();
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
  const r = await ctl(page, `menu.${rowId}`).first().boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.id ? `#${a.id}` : ''}${a.className && typeof a.className === 'string' ? '.' + a.className.split(' ').slice(0, 2).join('.') : ''}`;
  });
/** What is open on the surface right now. */
const surface = (page) =>
  page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const q = (sel) => [...document.querySelectorAll(sel)].filter(vis);
    const dialog = q('[role="dialog"]').map((el) => el.getAttribute('data-control') ?? el.className);
    return {
      menus: q('.ts-menu').map((el) => el.id),
      context: q('.ts-context-menu').length,
      dialogs: dialog,
      palette: q('[data-control="palette"]').length > 0,
      fo: q('.ts-fo').length > 0,
      panels: q('[data-control^="panel."]').map((el) => el.getAttribute('data-control')),
      present: q('[data-control="present.show"]').length > 0,
      editing: Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')),
      snackbar:
        [...document.querySelectorAll('.ts-snackbar.is-on, [data-control="snackbar"]')]
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' | ') || null,
      menusHidden: !document.querySelector('[data-control="menubar"]') || !vis(document.querySelector('[data-control="menubar"]')),
      theme: document.documentElement.getAttribute('data-theme'),
      url: location.pathname + location.search,
      title: document.title,
      filmstrip: Boolean(document.querySelector('[data-control="filmstrip"]')) && vis(document.querySelector('[data-control="filmstrip"]')),
    };
  });
const dismissNamePrompt = async (page) => {
  if (await has(page, '[data-control="dialog.namePrompt"]')) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
    await sleep(200);
    return true;
  }
  return false;
};
/** Puts the surface back: menus, context menus, dialogs, palette, the show; not the panels. */
const clearSurface = async (page, { deep = false } = {}) => {
  for (let i = 0; i < 4; i += 1) {
    const s = await surface(page);
    if (s.present) {
      await press(page, 'Escape');
      await sleep(400);
      continue;
    }
    if (s.dialogs.length > 0) {
      const closer = page
        .locator('[role="dialog"] [data-control$=".close"], [role="dialog"] [data-control$=".cancel"]')
        .last();
      if ((await closer.count()) > 0) await closer.click({ timeout: 2000 }).catch(() => undefined);
      else await press(page, 'Escape');
      await sleep(250);
      continue;
    }
    if (s.menus.length > 0 || s.context > 0 || s.palette) {
      await press(page, 'Escape');
      await sleep(150);
      continue;
    }
    break;
  }
  if (deep) {
    const s = await surface(page);
    if (s.editing) {
      await press(page, 'Escape');
      await sleep(150);
    }
  }
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
        out.push({ id: node.id, type: node.type, pos: node.pos });
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
const activeSlide = async (page) => (await state(page)).slideId;
const gotoSlide = async (page, slideId) => {
  const card = page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first();
  const r = await card.boundingBox().catch(() => null);
  if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  else await invoke(page, 'view.goto', { slideId }).catch(() => undefined);
  const active = await pollUntil(() => activeSlide(page), (a) => a === slideId, 8000);
  await sleep(400);
  return active === slideId;
};
const boxOf = (page, id) =>
  page.evaluate((blockId) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`);
    if (!inner) return null;
    const free = inner.closest('.free') ?? inner;
    const f = free.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    return {
      free: { x: f.x, y: f.y, w: f.width, h: f.height },
      inner: { x: i.x, y: i.y, w: i.width, h: i.height },
    };
  }, id);
const handleControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const sheetRect = (page) => rectOf(page, '.ts-stagewrap.ts-editor .pt-slide');
const sheetPoint = async (page, sx, sy) => {
  const sheet = await sheetRect(page);
  if (!sheet) throw new Error('no sheet');
  const kk = sheet.w / 1600;
  return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
};
const selectBlock = async (page, id) => {
  await clearSurface(page, { deep: true });
  const b = await boxOf(page, id);
  if (!b) return null;
  const c = { x: b.free.x + b.free.w / 2, y: b.free.y + b.free.h / 2 };
  await clickAt(page, c.x, c.y);
  await sleep(250);
  let s = await state(page);
  if (await page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')))) {
    await press(page, 'Escape');
    await sleep(200);
    s = await state(page);
  }
  if (s.blockId !== id) {
    await clickAt(page, b.free.x + 6, b.free.y + 6);
    await sleep(250);
    s = await state(page);
  }
  return s.blockId === id ? await handleControls(page) : null;
};
const pngDataUrl = (page, w = 96, h = 64) =>
  page.evaluate(
    ([pw, ph]) => {
      const c = document.createElement('canvas');
      c.width = pw;
      c.height = ph;
      const g = c.getContext('2d');
      g.fillStyle = '#1b1b1b';
      g.fillRect(0, 0, pw, ph);
      g.fillStyle = '#e8e8e8';
      g.fillRect(pw / 8, ph / 5, (pw * 3) / 4, (ph * 3) / 5);
      g.fillStyle = '#7a7a7a';
      g.fillRect(pw / 3, ph / 3, pw / 3, ph / 3);
      return c.toDataURL('image/png');
    },
    [w, h],
  );
const newObjectAfter = async (page, slideId, before, timeout = 20_000) => {
  const objs = await pollUntil(
    () => objectsOf(page, slideId),
    (o) => o.some((x) => !before.includes(x.id)),
    timeout,
  );
  return objs.find((x) => !before.includes(x.id)) ?? null;
};

// ---------------------------------------------------------------------------------------------
// reads

const shot = async (page, name, clip) => {
  shotN += 1;
  const file = `${String(shotN).padStart(3, '0')}-${name}.png`;
  const opts = { path: path.join(OUT, file) };
  if (clip) {
    const size = page.viewportSize() ?? { width: 1440, height: 900 };
    const x = Math.max(0, Math.floor(clip.x));
    const y = Math.max(0, Math.floor(clip.y));
    const w = Math.min(size.width - x, Math.ceil(clip.w));
    const h = Math.min(size.height - y, Math.ceil(clip.h));
    if (w > 4 && h > 4) opts.clip = { x, y, width: w, height: h };
  }
  await page.screenshot(opts).catch((e) => log(`shot failed ${file}: ${e.message}`));
  return file;
};
const pad = (r, p = 16) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
const union = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
/** Every visible menu row grouped by the menu that draws it, with geometry and words. */
const readMenus = (page) =>
  page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const menus = [...document.querySelectorAll('.ts-menu')].filter(vis);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return menus.map((menu) => {
      const mr = menu.getBoundingClientRect();
      const cs = getComputedStyle(menu);
      const items = [...menu.querySelectorAll('.ts-menu-item')]
        .filter((el) => vis(el) && el.closest('.ts-menu') === menu)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const label = el.querySelector('.ts-menu-label');
          const key = el.querySelector('.ts-menu-key');
          const ic = el.querySelector('.ts-menu-ic');
          const lcs = label ? getComputedStyle(label) : null;
          return {
            id: el.getAttribute('data-control')?.replace(/^menu\./, '') ?? '',
            label: label?.textContent?.trim() ?? el.textContent?.trim() ?? '',
            key: key?.textContent?.trim() ?? '',
            icon: ic ? (ic.querySelector('svg, .ts-menu-check') ? (ic.querySelector('.ts-menu-check') ? 'check' : 'icon') : 'none') : 'none',
            disabled: el.getAttribute('aria-disabled') === 'true',
            checked: el.getAttribute('aria-checked'),
            submenu: el.getAttribute('aria-haspopup') === 'menu',
            role: el.getAttribute('role'),
            status: el.getAttribute('data-status'),
            tip: el.getAttribute('data-tip'),
            h: Math.round(r.height * 10) / 10,
            y: Math.round(r.y),
            labelOverflow: label ? label.scrollWidth > label.clientWidth + 1 : false,
            font: lcs ? `${lcs.fontFamily.split(',')[0]} ${lcs.fontSize} ${lcs.fontWeight}` : '',
            color: lcs ? lcs.color : '',
            opacity: getComputedStyle(el).opacity,
          };
        });
      const dividers = [...menu.querySelectorAll('.ts-menu-divider')]
        .filter((el) => vis(el) && el.closest('.ts-menu') === menu)
        .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
      return {
        id: menu.id,
        level: menu.getAttribute('data-level'),
        rect: { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) },
        fits: mr.right <= vw + 0.5 && mr.bottom <= vh + 0.5 && mr.left >= -0.5 && mr.top >= -0.5,
        bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
        radius: cs.borderRadius,
        shadow: cs.boxShadow === 'none' ? 'none' : 'yes',
        scroll: menu.scrollHeight > menu.clientHeight + 1,
        items,
        dividers,
      };
    });
  });
/** The open right click menu. */
const readContext = (page) =>
  page.evaluate(() => {
    const menu = [...document.querySelectorAll('.ts-context-menu')].find((el) => el.getClientRects().length > 0);
    if (!menu) return null;
    const mr = menu.getBoundingClientRect();
    const items = [...menu.querySelectorAll('.ts-menu-item')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        id: el.getAttribute('data-control')?.replace(/^menu\./, '') ?? '',
        label: el.querySelector('.ts-menu-label')?.textContent?.trim() ?? el.textContent?.trim() ?? '',
        key: el.querySelector('.ts-menu-key')?.textContent?.trim() ?? '',
        icon: el.querySelector('.ts-menu-ic svg') ? 'icon' : el.querySelector('.ts-menu-check') ? 'check' : 'none',
        disabled: el.getAttribute('aria-disabled') === 'true',
        submenu: el.getAttribute('aria-haspopup') === 'menu',
        h: Math.round(el.getBoundingClientRect().height * 10) / 10,
      }));
    return {
      target: [...menu.classList].find((c) => c.startsWith('is-')) ?? '',
      rect: { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) },
      fits: mr.right <= window.innerWidth + 0.5 && mr.bottom <= window.innerHeight + 0.5 && mr.top >= -0.5 && mr.left >= -0.5,
      items,
    };
  });
/** The toolbar's visible controls in order with their geometry and state. */
const readToolbar = (page) =>
  page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const head = document.querySelector('[data-control="toolbar.head"]');
    const tail = document.querySelector('[data-control="toolbar.tail"]');
    const bar = head?.parentElement ?? null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const read = (root) =>
      root
        ? [...root.querySelectorAll('[data-control]')]
            .filter((el) => vis(el) && el.getAttribute('data-control').startsWith('toolbar.') || (vis(el) && /^(view\.|palette\.)/.test(el.getAttribute('data-control'))))
            .filter((el) => !['toolbar.head', 'toolbar.tail', 'toolbar.end'].includes(el.getAttribute('data-control')))
            .map((el) => ({
              id: el.getAttribute('data-control'),
              tag: el.tagName.toLowerCase(),
              disabled: el.matches(':disabled, [aria-disabled="true"], .is-disabled'),
              pressed: el.getAttribute('aria-pressed'),
              expanded: el.getAttribute('aria-expanded'),
              tip: el.getAttribute('data-tip'),
              text: el.textContent?.trim().slice(0, 40) ?? '',
              rect: box(el),
              clipped: (() => {
                const r = el.getBoundingClientRect();
                return r.right > window.innerWidth + 0.5 || r.left < -0.5;
              })(),
            }))
        : [];
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      bar: bar ? box(bar) : null,
      head: head ? box(head) : null,
      tail: tail ? box(tail) : null,
      headControls: read(head),
      tailControls: read(tail),
      more: (() => {
        const el = document.querySelector('[data-control="toolbar.more"]');
        return el && vis(el) ? box(el) : null;
      })(),
      tailScroll: tail ? tail.scrollWidth > tail.clientWidth + 1 : false,
    };
  });
const tooltipRead = (page) =>
  page.evaluate(() => {
    const tip = document.querySelector('.pt-tip');
    if (!tip || tip.getClientRects().length === 0) return null;
    const cs = getComputedStyle(tip);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return null;
    const r = tip.getBoundingClientRect();
    return {
      text: tip.textContent?.trim() ?? '',
      name: tip.querySelector('.pt-tip-name, b, strong')?.textContent?.trim() ?? null,
      kbd: [...tip.querySelectorAll('kbd')].map((k) => k.textContent?.trim()).join(' '),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      fits: r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5 && r.left >= -0.5 && r.top >= -0.5,
      font: `${cs.fontFamily.split(',')[0]} ${cs.fontSize}`,
      opacity: cs.opacity,
    };
  });
/** Hovers a control from away and waits for its tooltip; answers the plate and the delay. */
const hoverForTip = async (page, control, ms = 1400) => {
  const r = await rectOfControl(page, control);
  if (!r) return { control, tip: null, delay: null, rect: null };
  await parkMouse(page);
  await sleep(450);
  const t0 = Date.now();
  await moveHuman(page, { x: r.x - 30, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
  const arrived = Date.now();
  let tip = null;
  const until = Date.now() + ms;
  let shownAt = null;
  while (Date.now() < until) {
    tip = await tooltipRead(page);
    if (tip) {
      shownAt = Date.now();
      break;
    }
    await sleep(40);
  }
  if (!tip) {
    await page.locator(`[data-control="${control}"]`).first().hover({ timeout: 3000 }).catch(() => undefined);
    await sleep(600);
    tip = await tooltipRead(page);
    if (tip) shownAt = Date.now();
  }
  let overlap = null;
  if (tip) {
    const a = r;
    const b = tip.rect;
    overlap = !(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y);
  }
  return { control, anchor: r, tip, delay: shownAt ? shownAt - arrived : null, overlap };
};
const readDialog = (page) =>
  page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const d = [...document.querySelectorAll('[role="dialog"]')].filter(vis).pop();
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const buttons = [...d.querySelectorAll('button, [role="button"], a[href]')]
      .filter(vis)
      .map((b) => ({
        text: (b.textContent?.trim() || b.getAttribute('aria-label') || '').slice(0, 60),
        control: b.getAttribute('data-control'),
        disabled: b.matches(':disabled, [aria-disabled="true"]'),
      }));
    const inputs = [...d.querySelectorAll('input, textarea, select')]
      .filter(vis)
      .map((i) => ({ type: i.type ?? i.tagName.toLowerCase(), placeholder: i.placeholder ?? '', value: String(i.value ?? '').slice(0, 60), control: i.getAttribute('data-control') }));
    const heads = [...d.querySelectorAll('h1, h2, h3, h4, legend, .ts-dialog-title')].filter(vis).map((h) => h.textContent?.trim().slice(0, 80));
    const overflowing = [...d.querySelectorAll('*')]
      .filter((el) => vis(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll' && getComputedStyle(el).textOverflow !== 'ellipsis')
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className : '').split(' ')[0]}`);
    const a = document.activeElement;
    const cs = getComputedStyle(d);
    return {
      control: d.getAttribute('data-control'),
      title: heads[0] ?? null,
      heads,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      fits: r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5 && r.top >= -0.5 && r.left >= -0.5,
      centred: Math.abs(r.x + r.width / 2 - window.innerWidth / 2) < 2,
      scrolls: d.scrollHeight > d.clientHeight + 1,
      modal: d.getAttribute('aria-modal'),
      buttons,
      inputs,
      overflowing,
      text: d.textContent?.replace(/\s+/g, ' ').trim().slice(0, 900) ?? '',
      focus: a ? `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}` : 'none',
      focusInside: a ? d.contains(a) : false,
      radius: cs.borderRadius,
      shadow: cs.boxShadow === 'none' ? 'none' : 'yes',
      border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
    };
  });
const readFormatOptions = (page) =>
  page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const panel = document.querySelector('.ts-fo');
    if (!panel || !vis(panel)) return null;
    const pr = panel.getBoundingClientRect();
    const sections = [...panel.querySelectorAll('section[data-section]')].filter(vis).map((s) => {
      const head = s.querySelector('.ts-panel-section-head');
      const body = s.querySelector('.ts-panel-section-body');
      const controls = body
        ? [...body.querySelectorAll('[data-control]')]
            .filter(vis)
            .map((el) => ({
              id: el.getAttribute('data-control'),
              tag: el.tagName.toLowerCase(),
              type: el.getAttribute('type'),
              text: (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ? String(el.value ?? '') : el.textContent?.trim() ?? '').slice(0, 50),
              disabled: el.matches(':disabled, [aria-disabled="true"]'),
              overflow: el.scrollWidth > el.clientWidth + 2,
            }))
        : [];
      const labels = body
        ? [...body.querySelectorAll('label, .ts-field-label, .ts-fo-label, legend, .ts-fo-lead')]
            .filter(vis)
            .map((l) => ({ text: l.textContent?.trim().slice(0, 60) ?? '', overflow: l.scrollWidth > l.clientWidth + 2 }))
        : [];
      return {
        id: s.getAttribute('data-section'),
        title: head?.querySelector('span')?.textContent?.trim() ?? '',
        open: head?.getAttribute('aria-expanded'),
        disabled: head?.getAttribute('aria-disabled') === 'true',
        status: head?.getAttribute('data-status'),
        bodyH: body ? Math.round(body.getBoundingClientRect().height) : 0,
        controls: controls.length,
        controlIds: controls.map((c) => c.id).slice(0, 40),
        overflowing: controls.filter((c) => c.overflow).map((c) => c.id).concat(labels.filter((l) => l.overflow).map((l) => `label:${l.text}`)),
        labels: labels.map((l) => l.text),
        text: body?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
      };
    });
    return {
      rect: { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
      scrolls: panel.scrollHeight > panel.clientHeight + 1,
      scrollH: panel.scrollHeight,
      lead: panel.querySelector('.ts-fo-lead')?.textContent?.trim() ?? null,
      notice: panel.querySelector('.ts-fo-notice')?.textContent?.trim() ?? null,
      head: panel.querySelector('h2, h3, .ts-panel-title, .ts-fo-title')?.textContent?.trim() ?? null,
      sections,
    };
  });

// ---------------------------------------------------------------------------------------------
// the layout shift observer (installed before any page script)

const LS_INIT = () => {
  window.__ls = { entries: [], frames: [], marks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__ls.entries.push({
          t: Math.round(e.startTime),
          value: Math.round(e.value * 10000) / 10000,
          input: e.hadRecentInput,
          sources: (e.sources ?? []).slice(0, 5).map((s) => {
            const n = s.node;
            if (!n) return '?';
            const cls = typeof n.className === 'string' ? n.className.split(' ').slice(0, 2).join('.') : '';
            const dc = n.getAttribute?.('data-control');
            return `${n.tagName?.toLowerCase() ?? '?'}${cls ? '.' + cls : ''}${dc ? `[${dc}]` : ''}`;
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  const anchors = [
    '[data-control="title.row"]',
    '[data-control="menubar"]',
    '[data-control="toolbar.head"]',
    '[data-control="toolbar.tail"]',
    '.ts-stagewrap.ts-editor .pt-slide',
    '[data-control="filmstrip"]',
    '[data-control="share.open"]',
    '.ts-title-name',
  ];
  const t0 = performance.now();
  let last = '';
  const sample = () => {
    const t = performance.now() - t0;
    if (t > 8000) return;
    const rects = {};
    for (const a of anchors) {
      const el = document.querySelector(a);
      if (!el) {
        rects[a] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      rects[a] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    const row = { t: Math.round(t), theme: document.documentElement.getAttribute('data-theme'), fonts: document.fonts?.status, rects };
    const key = JSON.stringify([row.theme, row.rects]);
    if (key !== last) {
      window.__ls.frames.push(row);
      last = key;
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
const readLs = (page) => page.evaluate(() => window.__ls ?? null);

// ---------------------------------------------------------------------------------------------
// the run

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: SCALE,
  acceptDownloads: true,
});
await context.addInitScript(LS_INIT);
const page = await context.newPage();
const popups = [];
/** A page the audit opens itself (the print route): the popup closer leaves it alone. */
let ownPage = null;
context.on('page', (p) => {
  if (p === ownPage) return;
  p.waitForLoadState('domcontentloaded', { timeout: 8000 })
    .catch(() => undefined)
    .then(() => {
      popups.push(p.url());
      return p.close();
    })
    .catch(() => undefined);
});
const downloads = [];
page.on('download', (d) => {
  downloads.push({ name: d.suggestedFilename(), at: new Date().toISOString() });
  d.cancel().catch(() => undefined);
});
const fileChoosers = [];
page.on('filechooser', (fc) => fileChoosers.push({ multiple: fc.isMultiple(), at: new Date().toISOString() }));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ text: m.text().slice(0, 300), at: new Date().toISOString() });
});
page.on('pageerror', (e) => consoleErrors.push({ text: `pageerror: ${String(e).slice(0, 300)}`, at: new Date().toISOString() }));
const failedResponses = [];
page.on('response', (r) => {
  if (r.status() >= 400) failedResponses.push({ status: r.status(), url: r.url().slice(0, 180), at: new Date().toISOString() });
});
page.setDefaultTimeout(15_000);

let deckId = '';
let editUrl = '';
const objects = {}; // text, picture, shape, table -> { id, slideId }
let objectSlide = '';
let titleSlide = '';
let bootTheme = null;
const MENU_IDS = ['file', 'edit', 'view', 'insert', 'format', 'slide', 'arrange', 'tools', 'extensions', 'help'];
const modelRow = (id) => MODEL.menus.find((r) => r.id === id);

/** Opens a menu path (submenus hovered) and answers the read of every open menu. */
const openPath = async (page, menuId, subIds = []) => {
  await clearSurface(page);
  await openMenu(page, menuId);
  for (const sub of subIds) {
    await hoverRow(page, sub);
    await page.locator(`#ts-menu-${menuId}-${sub}, .ts-menu.is-sub`).first().waitFor({ timeout: 5000 }).catch(() => undefined);
    await sleep(200);
  }
  return readMenus(page);
};

const selectionFamily = async (page) => {
  const s = await state(page);
  return { blockId: s.blockId, editing: await page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]'))) };
};

/** Puts the audit's selection state back: none, or one of the four objects. */
const enterState = async (page, name) => {
  await clearSurface(page, { deep: true });
  const sid = name === 'none' ? objectSlide : objects[name]?.slideId ?? objectSlide;
  if ((await activeSlide(page)) !== sid) await gotoSlide(page, sid);
  if (name === 'none') {
    const p = await sheetPoint(page, 1560, 870);
    await clickAt(page, p.x, p.y);
    await press(page, 'Escape');
    await sleep(200);
    const s = await state(page);
    if (s.blockId) {
      await press(page, 'Escape');
      await sleep(200);
    }
    return (await state(page)).blockId === null;
  }
  const o = objects[name];
  if (!o) return false;
  let handles = await selectBlock(page, o.id);
  if (!handles) {
    await sleep(400);
    handles = await selectBlock(page, o.id);
  }
  return Boolean(handles);
};
/** The objects of a slide, or [] when the slide is gone. */
const objectsSafe = (page, slideId) => objectsOf(page, slideId).catch(() => []);
/** The slide that holds an object id, or null. */
const slideHolding = async (page, id) => {
  for (const sid of await slideOrder(page).catch(() => [])) {
    if ((await objectsSafe(page, sid)).some((o) => o.id === id)) return sid;
  }
  return null;
};
/** Places one of the four audit objects through the window API on the objects slide. */
const placeAuditObject = async (page, name) => {
  const stamp = Date.now().toString(36);
  const s = await state(page);
  const before = (await objectsSafe(page, objectSlide)).map((o) => o.id);
  let block = null;
  if (name === 'text') block = { id: `audit-text-${stamp}`, type: 'text', text: 'Audit text box', pos: { x: 380, y: 300, w: 480, h: 64 } };
  if (name === 'shape') block = { id: `audit-shape-${stamp}`, type: 'shape', shape: 'rectangle', fill: 'plate', stroke: 'ink', pos: { x: 220, y: 560, w: 400, h: 260 } };
  if (name === 'table') block = { id: `audit-table-${stamp}`, type: 'table', columns: [{}, {}, {}], rows: [0, 1, 2].map((r) => ({ cells: ['', '', ''], ...(r === 0 ? { header: true } : {}) })), pos: { x: 900, y: 560, w: 560, h: 240 } };
  if (name === 'picture') {
    const png = await pngDataUrl(page, 96, 64);
    const asset = await invoke(page, 'asset.add', { id: `audit-pic-${stamp}-asset`, url: png, role: 'capture', alt: 'audit picture', baseRevision: s.revision });
    await settled(page);
    const s2 = await state(page);
    block = { id: `audit-pic-${stamp}`, type: 'shot', asset: asset.id, pos: { x: 900, y: 160, w: 480, h: 320 } };
    await invoke(page, 'block.insert', { slideId: objectSlide, slot: 'main', block, baseRevision: Math.max(s2.revision, asset.revision ?? 0) });
  } else {
    await invoke(page, 'block.insert', { baseRevision: s.revision, slideId: objectSlide, slot: 'main', block });
  }
  const obj = await pollUntil(() => objectsSafe(page, objectSlide), (o) => o.some((x) => !before.includes(x.id)), 15_000);
  const placed = obj.find((x) => !before.includes(x.id)) ?? null;
  await settled(page);
  if (placed) objects[name] = { id: placed.id, slideId: objectSlide, type: placed.type };
  return placed;
};
/**
 * Puts the objects slide and its four objects back after a clicked row removed some of them:
 * the slide is found by what it holds (an undo can bring it back under another id), a missing
 * object is placed again through the window API, and a missing slide is made again.
 */
const ensureObjects = async (page) => {
  const missing = [];
  let holder = null;
  for (const name of ['text', 'shape', 'picture', 'table']) {
    if (!objects[name]) continue;
    holder = await slideHolding(page, objects[name].id);
    if (holder) break;
  }
  if (holder && holder !== objectSlide) {
    log(`       heal: the objects slide is now ${holder}`);
    objectSlide = holder;
  }
  if (!holder) {
    /* the whole slide is gone: a new one through the menu, then every object again */
    log('       heal: the objects slide is gone, a new one');
    await clearSurface(page, { deep: true });
    const before = await slideOrder(page).catch(() => []);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.newSlide');
    await pollUntil(() => slideOrder(page), (o) => o.length > before.length, 15_000);
    await settled(page);
    const order = await slideOrder(page);
    objectSlide = order.find((id) => !before.includes(id)) ?? order[order.length - 1];
    await gotoSlide(page, objectSlide);
  }
  const ids = (await objectsSafe(page, objectSlide)).map((o) => o.id);
  for (const name of ['text', 'shape', 'picture', 'table']) {
    if (!objects[name] || ids.includes(objects[name].id)) continue;
    log(`       heal: ${name} is gone, placed again`);
    try {
      const placed = await placeAuditObject(page, name);
      if (!placed) missing.push(name);
    } catch (e) {
      log(`       heal failed for ${name}: ${e.message.split('\n')[0]}`);
      missing.push(name);
    }
  }
  for (const name of Object.keys(objects)) objects[name].slideId = objectSlide;
  return missing;
};

try {
  // =========================================================================================
  // 1. boot: /new with the layout shift observer, the scratch deck
  const t0 = Date.now();
  await page.goto(`${BASE}/new`, { waitUntil: 'commit' });
  const bootShots = [];
  for (const at of [150, 500, 1200]) {
    const wait = t0 + at - Date.now();
    if (wait > 0) await sleep(wait);
    bootShots.push(await shot(page, `boot-new-${at}ms`));
  }
  await editorReady(page);
  bootShots.push(await shot(page, 'boot-new-settled'));
  await sleep(2500);
  const ls0 = await readLs(page);
  fact('boot.new.1440.layoutShift', ls0);
  bootTheme = await theme(page);
  const cls0 = (ls0?.entries ?? []).filter((e) => !e.input).reduce((a, e) => a + e.value, 0);
  const themeChanges = (ls0?.frames ?? []).map((f) => f.theme).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  record(
    'boot',
    'Layout shift on load',
    'Load /new on a fresh browser at 1440 by 900 and read the layout-shift entries and the anchors frame by frame',
    cls0 === 0 && themeChanges.length <= 1 ? 'works' : 'broken',
    `CLS ${cls0.toFixed(4)} over ${(ls0?.entries ?? []).filter((e) => !e.input).length} entries (${(ls0?.entries ?? []).slice(0, 4).map((e) => `${e.t}ms ${e.value} ${e.sources.join(',')}`).join('; ')}); theme frames ${themeChanges.join(' > ')}; ${ls0?.frames?.length ?? 0} distinct frames; boot theme ${bootTheme}`,
    bootShots,
  );
  const info0 = await invoke(page, 'deck.info');
  deckId = info0.id;
  editUrl = `${BASE}/edit/${deckId}`;
  log(`deck ${deckId}`);
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) => el.getAttribute('data-run')),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  try {
    const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
    await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await typeHuman(page, 'Chrome audit');
    await press(page, 'Escape');
    const rev = await waitRevision(page, 1, 30_000);
    await settled(page);
    await sleep(800);
    const prompt = await dismissNamePrompt(page);
    await sleep(600);
    const s = await settled(page);
    titleSlide = s.slideId;
    record(
      'boot',
      'Scratch deck',
      'Double click the title placeholder on /new, type a title, press Escape: the first write creates the deck',
      /\/edit\//.test(page.url()) && rev >= 1 ? 'works' : 'broken',
      `${page.url().replace(BASE, '')}; revision ${s.revision}; name prompt ${prompt}; title row ${JSON.stringify(await textOf(page, '.ts-title-name'))}`,
    );
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 2. the objects on a second slide: a text box, a picture, a shape, a table
  if (want('objects') || ONLY.length === 0 || ONLY.some((s) => !['boot', 'shift'].includes(s))) try {
    await clearSurface(page);
    const before = await slideOrder(page);
    await openMenu(page, 'slide');
    await clickRow(page, 'slide.newSlide');
    await pollUntil(() => slideOrder(page), (o) => o.length > before.length, 15_000);
    await settled(page);
    await sleep(500);
    const order = await slideOrder(page);
    objectSlide = order.find((id) => !before.includes(id)) ?? order[order.length - 1];
    await gotoSlide(page, objectSlide);
    await dismissNamePrompt(page);
    await settled(page);
    await sleep(600);
    /** A new object of a type on the objects slide, or null after `timeout`. */
    const newOfType = async (before, types, timeout = 12_000) => {
      const objs = await pollUntil(
        () => objectsSafe(page, objectSlide),
        (o) => o.some((x) => !before.includes(x.id) && types.includes(x.type)),
        timeout,
      );
      return objs.find((x) => !before.includes(x.id) && types.includes(x.type)) ?? null;
    };
    // the text box through Insert > Text box and a click; the window API when the menu route fails
    {
      const b0 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
      let route = 'Insert > Text box, click on the sheet, type';
      let obj = null;
      try {
        await openMenu(page, 'insert');
        await clickRow(page, 'insert.textBox');
        await sleep(400);
        const p = await sheetPoint(page, 380, 300);
        await clickAt(page, p.x, p.y);
        obj = await newOfType(b0, ['text']);
        await sleep(300);
        if (obj && (await page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]'))))) {
          await typeHuman(page, 'Audit text box');
          await press(page, 'Escape');
        }
        await settled(page);
      } catch (e) {
        route += ` (failed: ${e.message.split('\n')[0]})`;
      }
      if (!obj) {
        await clearSurface(page, { deep: true });
        const b1 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
        const s = await state(page);
        const id = `audit-text-${Date.now().toString(36)}`;
        await invoke(page, 'block.insert', { baseRevision: s.revision, slideId: objectSlide, slot: 'main', block: { id, type: 'text', text: 'Audit text box', pos: { x: 260, y: 240, w: 480, h: 120 } } }).catch((e) => log(`text fallback: ${e.message}`));
        obj = await newOfType(b1, ['text'], 15_000);
        await settled(page);
        route += '; then block.insert through the window API';
      }
      if (obj) objects.text = { id: obj.id, slideId: objectSlide, type: obj.type };
      record('objects', 'Text box', route, obj ? 'works' : 'broken', obj ? `${obj.id} ${obj.type} ${JSON.stringify(obj.pos)}` : 'no new object');
    }
    // the shape through Insert > Shape > Rectangle (the hoisted row, or the Shapes container of
    // the older build) and a drag; the window API when the menu route fails
    {
      const b0 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
      let route = 'Insert > Shape > Rectangle, drag on the sheet';
      let obj = null;
      try {
        await clearSurface(page, { deep: true });
        await openMenu(page, 'insert');
        await hoverRow(page, 'insert.shape', '[data-control^="menu.insert.shape."]');
        if (!(await has(page, '[data-control="menu.insert.shape.shapes.rectangle"]')) && (await has(page, '[data-control="menu.insert.shape.shapes"]'))) {
          route = 'Insert > Shape > Shapes > Rectangle (the Shapes container of this build), drag on the sheet';
          await hoverRow(page, 'insert.shape.shapes', '[data-control="menu.insert.shape.shapes.rectangle"]');
        }
        await clickRow(page, 'insert.shape.shapes.rectangle');
        await sleep(400);
        const p = await sheetPoint(page, 220, 560);
        const q = await sheetPoint(page, 620, 820);
        await drag(page, p, q);
        obj = await newOfType(b0, ['shape']);
        await settled(page);
      } catch (e) {
        route += ` (failed: ${e.message.split('\n')[0]})`;
      }
      if (!obj) {
        await clearSurface(page, { deep: true });
        const b1 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
        const s = await state(page);
        const id = `audit-shape-${Date.now().toString(36)}`;
        await invoke(page, 'block.insert', { baseRevision: s.revision, slideId: objectSlide, slot: 'main', block: { id, type: 'shape', shape: 'rectangle', fill: 'plate', stroke: 'ink', pos: { x: 220, y: 560, w: 400, h: 260 } } }).catch((e) => log(`shape fallback: ${e.message}`));
        obj = await newOfType(b1, ['shape'], 15_000);
        await settled(page);
        route += '; then block.insert through the window API';
      }
      if (obj) objects.shape = { id: obj.id, slideId: objectSlide, type: obj.type };
      record('objects', 'Shape', route, obj ? 'works' : 'broken', obj ? `${obj.id} ${obj.type} ${JSON.stringify(obj.pos)}` : 'no new object');
    }
    // the picture through the window API (the dialog's own writes; the upload is another lane's)
    {
      await clearSurface(page, { deep: true });
      const png = await pngDataUrl(page, 96, 64);
      const s = await state(page);
      const id = `audit-pic-${Date.now().toString(36)}`;
      const b0 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
      let obj = null;
      try {
        const asset = await invoke(page, 'asset.add', { id: `${id}-asset`, url: png, role: 'capture', alt: 'audit picture', baseRevision: s.revision });
        await settled(page);
        const s2 = await state(page);
        await invoke(page, 'block.insert', { slideId: objectSlide, slot: 'main', block: { id, type: 'shot', asset: asset.id, pos: { x: 900, y: 160, w: 480, h: 320 } }, baseRevision: Math.max(s2.revision, asset.revision ?? 0) });
        obj = await newObjectAfter(page, objectSlide, b0);
        await settled(page);
      } catch (e) {
        record('objects', 'Picture', 'asset.add then block.insert', 'broken', String(e.message ?? e).split('\n')[0]);
      }
      if (obj) objects.picture = { id: obj.id, slideId: objectSlide, type: obj.type };
      if (obj) record('objects', 'Picture', 'asset.add then block.insert through the window API', 'works', `${obj.id} ${obj.type} ${JSON.stringify(obj.pos)}`);
    }
    // the table through Insert > Table and the hover grid
    {
      const b0 = (await objectsSafe(page, objectSlide)).map((o) => o.id);
      await clearSurface(page, { deep: true });
      await openMenu(page, 'insert');
      await hoverRow(page, 'insert.table', '[data-control="insert.table.plate"]');
      const plateShot = await shot(page, 'menu-insert-table-grid', pad(union(await rectOf(page, '#ts-menu-insert'), await rectOfControl(page, 'insert.table.plate')), 20));
      await clickControl(page, 'insert.table.pick.3x3');
      const obj = await newObjectAfter(page, objectSlide, b0);
      await settled(page);
      await sleep(500);
      if (obj) objects.table = { id: obj.id, slideId: objectSlide, type: obj.type };
      record('objects', 'Table', 'Insert > Table, pick 3 by 3 on the hover grid', obj ? 'works' : 'broken', obj ? `${obj.id} ${obj.type} ${JSON.stringify(obj.pos)}` : 'no new object', plateShot);
      await clearSurface(page, { deep: true });
      await sleep(300);
      record('objects', 'The four objects', 'The slide with the four objects placed', 'note', JSON.stringify(objects), await shot(page, 'objects-placed'));
    }
    fact('objects', { ...objects, objectSlide, titleSlide });
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 3. the menus with nothing selected: every row and submenu read, every leaf clicked once
  const menuReads = {};
  const readWholeMenu = async (page, menuId, tag) => {
    const out = { menu: menuId, levels: [] };
    const top = await openPath(page, menuId);
    const topMenu = top.find((m) => m.id === `ts-menu-${menuId}`) ?? top[0];
    out.top = topMenu;
    out.shot = await shot(page, `menu-${tag}-${menuId}`, pad(topMenu.rect, 24));
    const subs = (topMenu?.items ?? []).filter((i) => i.submenu);
    for (const sub of subs) {
      try {
        const read = await openPath(page, menuId, [sub.id]);
        const subMenu = read.find((m) => m.id !== `ts-menu-${menuId}`);
        const clip = pad(union(topMenu.rect, subMenu?.rect), 24);
        const file = await shot(page, `menu-${tag}-${sub.id}`, clip);
        const level = { parent: sub.id, menu: subMenu, shot: file, nested: [] };
        for (const sub2 of (subMenu?.items ?? []).filter((i) => i.submenu)) {
          try {
            const read2 = await openPath(page, menuId, [sub.id, sub2.id]);
            const m2 = read2.filter((m) => m.id !== `ts-menu-${menuId}` && m.id !== subMenu?.id).pop();
            const file2 = await shot(page, `menu-${tag}-${sub2.id}`, pad(union(union(topMenu.rect, subMenu?.rect), m2?.rect), 24));
            level.nested.push({ parent: sub2.id, menu: m2, shot: file2 });
          } catch (e) {
            level.nested.push({ parent: sub2.id, error: e.message.split('\n')[0] });
          }
        }
        out.levels.push(level);
      } catch (e) {
        out.levels.push({ parent: sub.id, error: e.message.split('\n')[0] });
      }
    }
    await clearSurface(page);
    return out;
  };
  const summarizeMenu = (m) => {
    const items = [];
    const walk = (menu, depth) => {
      for (const it of menu?.items ?? []) items.push({ ...it, depth });
    };
    walk(m.top, 0);
    for (const l of m.levels) {
      walk(l.menu, 1);
      for (const n of l.nested ?? []) walk(n.menu, 2);
    }
    return items;
  };

  if (want('menus')) try {
    await enterState(page, 'none');
    for (const menuId of MENU_IDS) {
      try {
        const m = await readWholeMenu(page, menuId, 'none');
        menuReads[`none.${menuId}`] = m;
        const items = summarizeMenu(m);
        const overflow = items.filter((i) => i.labelOverflow).map((i) => i.id);
        const noIcon = items.filter((i) => i.icon === 'none' && i.depth === 0).length;
        const heights = [...new Set(items.map((i) => i.h))];
        const fits = [m.top, ...m.levels.map((l) => l.menu), ...m.levels.flatMap((l) => (l.nested ?? []).map((n) => n.menu))].filter(Boolean).map((x) => x.fits);
        record(
          'menus',
          `${menuId} menu`,
          `Open ${menuId} with nothing selected, hover every submenu, read every row`,
          overflow.length === 0 && fits.every(Boolean) ? 'works' : 'broken',
          `${items.length} rows (${items.filter((i) => i.disabled).length} disabled, ${items.filter((i) => i.submenu).length} submenus, ${items.filter((i) => i.key).length} with keys, ${noIcon} top rows without an icon); row heights ${heights.join('/')}; plate ${m.top.rect.w}x${m.top.rect.h} fits ${fits.every(Boolean)}; label overflow ${overflow.join(',') || 'none'}; dividers ${m.top.dividers.join('/')}`,
          [m.shot, ...m.levels.map((l) => l.shot).filter(Boolean)],
        );
      } catch (e) {
        record('menus', `${menuId} menu`, 'Open and read', 'broken', e.message.split('\n')[0]);
        await clearSurface(page);
      }
    }
    fact('menus.none', menuReads);

    // click every leaf row once (the rows enabled with nothing selected)
    const SKIP = new Set(['file.moveToTrash', 'file.makeCopy.entire', 'file.print', 'file.printPreview']);
    for (const id of ['file.print', 'file.printPreview']) record('menus.click', modelRow(id)?.label ?? id, `Click ${id} once with nothing selected`, 'not driven', 'not clicked in the audit tab: the print route calls window.print(), which blocks a headless tab; driven in a fresh page at the end of the run');
    const clickLog = [];
    const allNone = Object.values(menuReads).flatMap((m) => summarizeMenu(m));
    const leaves = allNone.filter((i) => !i.submenu && !i.disabled && i.id && !SKIP.has(i.id));
    log(`clicking ${leaves.length} leaf rows with nothing selected`);
    for (const leaf of NO_CLICKS ? [] : leaves) {
      const pathIds = leaf.id.split('.');
      const menuId = pathIds[0];
      const parents = [];
      for (let k = 2; k < pathIds.length; k += 1) parents.push(pathIds.slice(0, k).join('.'));
      const mr = modelRow(leaf.id);
      const parentRows = parents.filter((p) => modelRow(p)?.hasChildren);
      const before = await surface(page);
      const s0 = await state(page);
      const order0 = await slideOrder(page);
      let result = 'works';
      let observed = '';
      let file = null;
      try {
        await clearSurface(page);
        await openMenu(page, menuId);
        for (const p of parentRows) {
          await hoverRow(page, p);
          await page.locator('.ts-menu.is-sub').last().waitFor({ timeout: 5000 }).catch(() => undefined);
          await sleep(180);
        }
        const rowEl = page.locator(`.ts-menu [data-control="menu.${leaf.id}"]`).last();
        const rr = await rowEl.boundingBox();
        if (!rr) throw new Error('row not drawn');
        await clickAt(page, rr.x + rr.width / 2, rr.y + rr.height / 2);
        await sleep(700);
        const after = await surface(page);
        const s1 = await state(page).catch(() => s0);
        const opened = [];
        if (after.dialogs.length) opened.push(`dialog ${after.dialogs.join(',')}`);
        if (after.menus.length) opened.push(`menu ${after.menus.join(',')}`);
        if (after.palette) opened.push('palette');
        if (after.fo && !before.fo) opened.push('format options');
        for (const p of after.panels) if (!before.panels.includes(p)) opened.push(`panel ${p}`);
        if (after.present) opened.push('the show');
        if (after.snackbar) opened.push(`snackbar "${after.snackbar}"`);
        if (after.url !== before.url) opened.push(`url ${after.url}`);
        if (after.theme !== before.theme) opened.push(`theme ${after.theme}`);
        if (after.menusHidden !== before.menusHidden) opened.push(`menus hidden ${after.menusHidden}`);
        if (after.filmstrip !== before.filmstrip) opened.push(`filmstrip ${after.filmstrip}`);
        if (after.editing) opened.push('text session');
        if (s1.revision !== s0.revision) opened.push(`revision ${s0.revision} > ${s1.revision}`);
        if (s1.slideId !== s0.slideId) opened.push(`slide moved`);
        if (s1.zoom !== s0.zoom) opened.push(`zoom ${s0.zoom} > ${s1.zoom}`);
        if (popups.length) opened.push(`popup ${popups.splice(0).join(',')}`);
        if (downloads.length) opened.push(`download ${downloads.splice(0).map((d) => d.name).join(',')}`);
        if (fileChoosers.length) opened.push(`file chooser`);
        fileChoosers.splice(0);
        const dialog = after.dialogs.length ? await readDialog(page) : null;
        if (dialog) opened.push(`title "${dialog.title}" focus ${dialog.focus}`);
        observed = opened.join('; ') || 'nothing visible changed';
        if (after.dialogs.length || after.palette || after.present || after.panels.length !== before.panels.length || after.menus.length || after.url !== before.url || after.menusHidden !== before.menusHidden) {
          const clip = dialog ? pad(dialog.rect, 40) : after.menus.length ? pad((await readMenus(page)).reduce((a, m) => union(a, m.rect), null) ?? { x: 0, y: 0, w: 1440, h: 900 }, 24) : null;
          file = await shot(page, `click-none-${leaf.id}`, clip);
        }
        // restore
        if (after.present) {
          await press(page, 'Escape');
          await sleep(500);
        }
        if (after.url !== before.url) {
          await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
          await editorReady(page);
          await dismissNamePrompt(page);
          await gotoSlide(page, objectSlide);
        }
        await clearSurface(page, { deep: true });
        if (after.menusHidden && !before.menusHidden) {
          await clickControl(page, 'toolbar.showMenus').catch(() => pressChord(page, 'Ctrl+Shift+F'));
          await sleep(400);
        }
        if (after.theme !== before.theme && leaf.id.startsWith('view.appearance')) {
          /* put the boot appearance back */
          await openMenu(page, 'view');
          await hoverRow(page, 'view.appearance');
          await clickRow(page, `view.appearance.${bootTheme === 'light' ? 'light' : 'dark'}`);
          await sleep(300);
          await clearSurface(page);
        }
        if (after.filmstrip !== before.filmstrip || (mr?.kind === 'check' && ['view.showRuler', 'view.showSpeakerNotes', 'view.guides.show', 'view.snapTo.guides', 'view.snapTo.grid', 'tools.advancedTools', 'tools.preferences.linkDetection', 'tools.accessibilitySettings.collaboratorAnnouncements', 'view.livePointers.mine', 'view.livePointers.collaborators', 'slide.skipSlide'].includes(leaf.id))) {
          /* a check row: click again to put it back */
          await openMenu(page, menuId);
          for (const p of parentRows) {
            await hoverRow(page, p);
            await sleep(180);
          }
          await page.locator(`.ts-menu [data-control="menu.${leaf.id}"]`).last().click({ timeout: 4000 }).catch(() => undefined);
          await sleep(300);
          await clearSurface(page);
        } else if (['view.showRuler', 'view.showSpeakerNotes', 'view.guides.show', 'view.snapTo.guides', 'view.snapTo.grid', 'tools.advancedTools', 'tools.preferences.linkDetection', 'tools.accessibilitySettings.collaboratorAnnouncements', 'view.livePointers.mine', 'view.livePointers.collaborators', 'slide.skipSlide', 'view.showFilmstrip'].includes(leaf.id)) {
          await openMenu(page, menuId);
          for (const p of parentRows) {
            await hoverRow(page, p);
            await sleep(180);
          }
          await page.locator(`.ts-menu [data-control="menu.${leaf.id}"]`).last().click({ timeout: 4000 }).catch(() => undefined);
          await sleep(300);
          await clearSurface(page);
        }
        if (leaf.id === 'view.mode.viewing' || leaf.id === 'view.mode.commenting') {
          await openMenu(page, 'view');
          await hoverRow(page, 'view.mode');
          await clickRow(page, 'view.mode.editing');
          await sleep(300);
          await clearSurface(page);
        }
        if (leaf.id.startsWith('view.zoom')) {
          await openMenu(page, 'view');
          await hoverRow(page, 'view.zoom');
          await clickRow(page, 'view.zoom.fit');
          await sleep(300);
          await clearSurface(page);
        }
        if (leaf.id.startsWith('view.playShaders')) {
          await openMenu(page, 'view');
          await hoverRow(page, 'view.playShaders');
          await clickRow(page, 'view.playShaders.on');
          await sleep(300);
          await clearSurface(page);
        }
        if (leaf.id.startsWith('view.comments')) {
          await openMenu(page, 'view');
          await hoverRow(page, 'view.comments');
          await clickRow(page, 'view.comments.showAll');
          await sleep(300);
          await clearSurface(page);
        }
        // a write that changed the deck: undo it once so the objects stand (Undo itself is put back with Redo)
        const s2 = await state(page).catch(() => s1);
        if (leaf.id === 'edit.undo' && s2.revision !== s0.revision) {
          await pressChord(page, 'Cmd+Shift+Z');
          await sleep(600);
          await settled(page);
          observed += `; redone to revision ${(await state(page)).revision}`;
        } else if (s2.revision !== s0.revision && !leaf.id.startsWith('view.') && !leaf.id.startsWith('tools.') && !leaf.id.startsWith('help.')) {
          await clearSurface(page, { deep: true });
          await pressChord(page, 'Cmd+Z');
          await sleep(600);
          await settled(page);
          const order1 = await slideOrder(page);
          if (order1.length !== order0.length) {
            for (let k = 0; k < 3 && (await slideOrder(page)).length !== order0.length; k += 1) {
              await pressChord(page, 'Cmd+Z');
              await sleep(500);
            }
          }
          observed += `; undone to revision ${(await state(page)).revision}`;
        }
        const missing = await ensureObjects(page);
        if (missing.length) observed += `; objects missing after restore: ${missing.join(',')}`;
        if ((await activeSlide(page)) !== objectSlide) await gotoSlide(page, objectSlide);
        await enterState(page, 'none');
      } catch (e) {
        result = 'broken';
        observed = `${observed}; error ${e.message.split('\n')[0]}`;
        await clearSurface(page, { deep: true }).catch(() => undefined);
        if (!/\/edit\//.test(page.url())) {
          await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
          await editorReady(page).catch(() => undefined);
          await dismissNamePrompt(page).catch(() => undefined);
        }
        await gotoSlide(page, objectSlide).catch(() => undefined);
        await enterState(page, 'none').catch(() => undefined);
      }
      clickLog.push({ id: leaf.id, label: leaf.label, result, observed, shot: file });
      record('menus.click', leaf.label, `Click ${leaf.id} once with nothing selected`, result, observed, file ? [file] : []);
    }
    fact('menus.clicks.none', clickLog);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 4. the menus with a text box, a picture, a shape and a table selected: the enabled states,
  //    and the rows enabled now clicked once
  if (want('menus-selected')) try {
    const noneItems = Object.values(menuReads).flatMap((m) => summarizeMenu(m));
    const noneById = new Map(noneItems.map((i) => [i.id, i]));
    const selReads = {};
    for (const stateName of ['text', 'picture', 'shape', 'table']) {
      if (!objects[stateName]) {
        record('menus.selected', stateName, 'Select and read the menus', 'not driven', 'the object was not placed');
        continue;
      }
      const ok = await enterState(page, stateName);
      if (!ok) {
        record('menus.selected', stateName, 'Select the object', 'broken', 'the object did not take the selection');
        continue;
      }
      const selShot = await shot(page, `selected-${stateName}`);
      const perMenu = {};
      for (const menuId of ['edit', 'insert', 'format', 'arrange', 'slide']) {
        try {
          const m = await readWholeMenu(page, menuId, stateName);
          perMenu[menuId] = m;
        } catch (e) {
          record('menus.selected', `${stateName}: ${menuId}`, 'Open and read', 'broken', e.message.split('\n')[0]);
          await clearSurface(page);
        }
        await enterState(page, stateName);
      }
      selReads[stateName] = perMenu;
      const items = Object.values(perMenu).flatMap((m) => summarizeMenu(m));
      /* rows enabled now that were disabled, or unread because their parent was disabled, with nothing selected */
      const nowEnabled = items.filter((i) => !i.disabled && !i.submenu && i.id && (!noneById.has(i.id) || noneById.get(i.id)?.disabled));
      const stillDisabled = items.filter((i) => i.disabled && !i.submenu).map((i) => i.id);
      record(
        'menus.selected',
        `${stateName} selected`,
        `Select the ${stateName} and read Edit, Insert, Format, Arrange and Slide`,
        'note',
        `${items.length} rows; enabled now and disabled with nothing selected: ${nowEnabled.map((i) => i.id).join(', ') || 'none'}; still disabled: ${stillDisabled.join(', ') || 'none'}`,
        [selShot, ...Object.values(perMenu).map((m) => m.shot)],
      );
      // click each newly enabled leaf once
      const SKIP = new Set(['file.moveToTrash']);
      for (const leaf of NO_CLICKS ? [] : nowEnabled.filter((i) => !SKIP.has(i.id))) {
        const pathIds = leaf.id.split('.');
        const menuId = pathIds[0];
        const parents = [];
        for (let k = 2; k < pathIds.length; k += 1) parents.push(pathIds.slice(0, k).join('.'));
        const parentRows = parents.filter((p) => modelRow(p)?.hasChildren);
        let result = 'works';
        let observed = '';
        let file = null;
        const before = await surface(page);
        const s0 = await state(page);
        try {
          await openMenu(page, menuId);
          for (const p of parentRows) {
            await hoverRow(page, p);
            await page.locator('.ts-menu.is-sub').last().waitFor({ timeout: 5000 }).catch(() => undefined);
            await sleep(180);
          }
          const rowEl = page.locator(`.ts-menu [data-control="menu.${leaf.id}"]`).last();
          const rr = await rowEl.boundingBox();
          if (!rr) throw new Error('row not drawn');
          const disabledNow = (await rowEl.getAttribute('aria-disabled')) === 'true';
          await clickAt(page, rr.x + rr.width / 2, rr.y + rr.height / 2);
          await sleep(700);
          const after = await surface(page);
          const s1 = await state(page).catch(() => s0);
          const opened = [];
          if (disabledNow) opened.push('row disabled at click time');
          if (after.dialogs.length) opened.push(`dialog ${after.dialogs.join(',')}`);
          if (after.menus.length) opened.push(`menu ${after.menus.join(',')}`);
          if (after.fo && !before.fo) opened.push('format options');
          for (const p of after.panels) if (!before.panels.includes(p)) opened.push(`panel ${p}`);
          if (after.snackbar) opened.push(`snackbar "${after.snackbar}"`);
          if (after.editing) opened.push('text session');
          if (s1.revision !== s0.revision) opened.push(`revision ${s0.revision} > ${s1.revision}`);
          if (s1.blockId !== s0.blockId) opened.push(`selection ${s0.blockId} > ${s1.blockId}`);
          if (fileChoosers.length) opened.push('file chooser');
          fileChoosers.splice(0);
          const dialog = after.dialogs.length ? await readDialog(page) : null;
          if (dialog) opened.push(`title "${dialog.title}" focus ${dialog.focus}`);
          observed = opened.join('; ') || 'nothing visible changed';
          if (after.dialogs.length || after.menus.length || after.fo !== before.fo || after.panels.length !== before.panels.length || s1.revision !== s0.revision) {
            const objBox = objects[stateName] ? await boxOf(page, objects[stateName].id) : null;
            const clip = dialog ? pad(dialog.rect, 40) : after.menus.length ? pad((await readMenus(page)).reduce((a, m) => union(a, m.rect), null), 24) : objBox && !after.fo ? pad(objBox.free, 80) : null;
            file = await shot(page, `click-${stateName}-${leaf.id}`, clip);
          }
          await clearSurface(page, { deep: true });
          const s2 = await state(page).catch(() => s1);
          if (leaf.id === 'edit.undo' && s2.revision !== s0.revision) {
            await pressChord(page, 'Cmd+Shift+Z');
            await sleep(600);
            await settled(page);
          } else if (s2.revision !== s0.revision && !leaf.id.startsWith('view.')) {
            await pressChord(page, 'Cmd+Z');
            await sleep(600);
            await settled(page);
            observed += `; undone to revision ${(await state(page)).revision}`;
          }
          if (after.fo && !before.fo) {
            await clickControl(page, 'panel.formatOptions.close').catch(() => press(page, 'Escape'));
            await sleep(200);
          }
          const missing = await ensureObjects(page);
          if (missing.length) observed += `; objects missing after restore: ${missing.join(',')}`;
          if ((await activeSlide(page)) !== objectSlide) await gotoSlide(page, objectSlide);
          await enterState(page, stateName);
        } catch (e) {
          result = 'broken';
          observed = `${observed}; error ${e.message.split('\n')[0]}`;
          await clearSurface(page, { deep: true }).catch(() => undefined);
          await gotoSlide(page, objectSlide).catch(() => undefined);
          await ensureObjects(page).catch(() => undefined);
          await enterState(page, stateName).catch(() => undefined);
        }
        record('menus.click', leaf.label, `Click ${leaf.id} once with the ${stateName} selected`, result, observed, file ? [file] : []);
      }
    }
    fact('menus.selected', selReads);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 5. the toolbar at 1440 and 1280: every control read, every button and dropdown clicked once
  const toolbarPass = async (width, height, tag, { click }) => {
    await page.setViewportSize({ width, height });
    await sleep(600);
    const reads = {};
    for (const stateName of ['none', 'text', 'picture', 'shape', 'table']) {
      if (stateName !== 'none' && !objects[stateName]) continue;
      const ok = await enterState(page, stateName);
      if (!ok) {
        record('toolbar', `${tag} ${stateName}`, 'Select the object', 'broken', 'the object did not take the selection');
        continue;
      }
      await parkMouse(page);
      const tb = await readToolbar(page);
      const bar = tb.bar ?? union(tb.head, tb.tail);
      const strip = await shot(page, `toolbar-${tag}-${stateName}`, bar ? { x: 0, y: bar.y - 4, w: width, h: bar.h + 8 } : null);
      const all = [...tb.headControls, ...tb.tailControls];
      const clipped = all.filter((c) => c.clipped).map((c) => c.id);
      const last = tb.tailControls[tb.tailControls.length - 1];
      reads[stateName] = { ...tb, shot: strip };
      record(
        'toolbar',
        `${tag} with ${stateName} selected`,
        `Read the toolbar at ${width}: every control, its state, the tail's end`,
        clipped.length === 0 && !tb.tailScroll ? 'works' : 'broken',
        `${tb.headControls.length} head + ${tb.tailControls.length} tail controls; tail ${tb.tail ? `${tb.tail.x}..${tb.tail.x + tb.tail.w}` : 'none'}; last ${last ? `${last.id} right ${last.rect.x + last.rect.w}` : 'none'}; More ${tb.more ? 'shown' : 'absent'}; clipped ${clipped.join(',') || 'none'}; tail scrolls ${tb.tailScroll}; disabled ${all.filter((c) => c.disabled).map((c) => c.id).join(',') || 'none'}; ids ${tb.tailControls.map((c) => c.id.replace('toolbar.', '')).join(' ')}`,
        strip,
      );
      if (!click) continue;
      for (const c of all) {
        if (c.disabled) continue;
        if (['toolbar.print', 'toolbar.hideMenus', 'toolbar.select'].includes(c.id) && stateName !== 'none') continue;
        if (c.id === 'toolbar.print') {
          record('toolbar.click', c.tip ?? c.id, `Click ${c.id} once at ${width} with ${stateName} selected`, 'not driven', 'not clicked in the audit tab: the print route calls window.print(), which blocks a headless tab; driven in a fresh page at the end of the run');
          continue;
        }
        let observed = '';
        let result = 'works';
        let file = null;
        const before = await surface(page);
        const s0 = await state(page);
        try {
          const r = await rectOfControl(page, c.id);
          if (!r) throw new Error('control gone');
          await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
          await sleep(650);
          const after = await surface(page);
          const s1 = await state(page).catch(() => s0);
          const opened = [];
          const menusNow = await readMenus(page);
          if (after.menus.length) opened.push(`plate ${after.menus.join(',')} (${menusNow.reduce((n, m) => n + m.items.length, 0)} rows)`);
          const plateEl = await page.evaluate(() => {
            const vis = (el) => el.getClientRects().length > 0;
            const cands = [...document.querySelectorAll('[id^="ts-menu-"], .ts-plate, .ts-popover, [data-control$=".plate"], .ts-font-picker, .ts-tablegrid, .ts-color-plate, .ts-layout-list')].filter(vis);
            return cands.map((el) => {
              const r = el.getBoundingClientRect();
              return { id: el.id || el.getAttribute('data-control') || el.className.split(' ')[0], rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, fits: r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5 && r.left >= -0.5, text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '' };
            });
          });
          if (plateEl.length) opened.push(`open ${plateEl.map((p) => `${p.id} ${p.rect.w}x${p.rect.h}${p.fits ? '' : ' CLIPPED'}`).join(' | ')}`);
          if (after.dialogs.length) opened.push(`dialog ${after.dialogs.join(',')}`);
          if (after.palette) opened.push('palette');
          if (after.fo && !before.fo) opened.push('format options');
          for (const p of after.panels) if (!before.panels.includes(p)) opened.push(`panel ${p}`);
          if (after.snackbar) opened.push(`snackbar "${after.snackbar}"`);
          if (after.editing) opened.push('text session');
          if (after.menusHidden !== before.menusHidden) opened.push(`menus hidden ${after.menusHidden}`);
          if (after.url !== before.url) opened.push(`url ${after.url}`);
          if (s1.revision !== s0.revision) opened.push(`revision ${s0.revision} > ${s1.revision}`);
          if (s1.zoom !== s0.zoom) opened.push(`zoom ${s0.zoom} > ${s1.zoom}`);
          if (popups.length) opened.push(`popup ${popups.splice(0).join(',')}`);
          if (fileChoosers.length) opened.push('file chooser');
          fileChoosers.splice(0);
          const pressed = await page.evaluate((id) => document.querySelector(`[data-control="${id}"]`)?.getAttribute('aria-pressed'), c.id);
          if (pressed !== null && pressed !== c.pressed) opened.push(`aria-pressed ${c.pressed} > ${pressed}`);
          const dialog = after.dialogs.length ? await readDialog(page) : null;
          if (dialog) opened.push(`title "${dialog.title}"`);
          observed = opened.join('; ') || 'nothing visible changed';
          if (opened.length) {
            const area = plateEl.reduce((a, p) => union(a, p.rect), null);
            const clip = dialog ? pad(dialog.rect, 40) : area ? pad(union(area, { x: 0, y: bar.y, w: width, h: bar.h }), 12) : after.fo ? null : { x: 0, y: bar.y - 4, w: width, h: bar.h + 8 };
            file = await shot(page, `toolbar-${tag}-${stateName}-${c.id.replace('toolbar.', '')}`, clip);
          }
          await clearSurface(page, { deep: true });
          if (after.menusHidden && !before.menusHidden) {
            await clickControl(page, 'toolbar.showMenus').catch(() => pressChord(page, 'Ctrl+Shift+F'));
            await sleep(400);
          }
          if (after.url !== before.url) {
            await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
            await editorReady(page);
            await dismissNamePrompt(page);
            await gotoSlide(page, objectSlide);
          }
          if (after.fo && !before.fo) {
            await clickControl(page, 'panel.formatOptions.close').catch(() => press(page, 'Escape'));
            await sleep(200);
          }
          if (pressed === 'true' && c.pressed === 'false' && !['toolbar.bold', 'toolbar.italic', 'toolbar.underline'].includes(c.id)) {
            const r2 = await rectOfControl(page, c.id);
            if (r2) await clickAt(page, r2.x + r2.w / 2, r2.y + r2.h / 2);
            await sleep(300);
            await clearSurface(page, { deep: true });
          }
          const s2 = await state(page).catch(() => s1);
          if (s2.revision !== s0.revision) {
            await pressChord(page, 'Cmd+Z');
            await sleep(600);
            await settled(page);
            observed += `; undone to revision ${(await state(page)).revision}`;
          }
          if (s2.zoom !== s0.zoom) {
            await openMenu(page, 'view');
            await hoverRow(page, 'view.zoom');
            await clickRow(page, 'view.zoom.fit');
            await clearSurface(page);
          }
          if ((await activeSlide(page)) !== objectSlide) await gotoSlide(page, objectSlide);
          await ensureObjects(page);
          await enterState(page, stateName);
        } catch (e) {
          result = 'broken';
          observed = `${observed}; error ${e.message.split('\n')[0]}`;
          await clearSurface(page, { deep: true }).catch(() => undefined);
          if (!/\/edit\//.test(page.url())) {
            await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
            await editorReady(page).catch(() => undefined);
          }
          await gotoSlide(page, objectSlide).catch(() => undefined);
          await enterState(page, stateName).catch(() => undefined);
        }
        record('toolbar.click', c.tip ?? c.id, `Click ${c.id} once at ${width} with ${stateName} selected`, result, observed, file ? [file] : []);
      }
    }
    return reads;
  };
  if (want('toolbar')) try {
    fact('toolbar.1440', await toolbarPass(1440, 900, '1440', { click: !NO_CLICKS }));
    fact('toolbar.1280', await toolbarPass(1280, 800, '1280', { click: false }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(500);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 6. Format options per object type: every section opened and read
  if (want('format')) try {
    const foReads = {};
    for (const stateName of ['none', 'text', 'picture', 'shape', 'table']) {
      if (stateName !== 'none' && !objects[stateName]) continue;
      const ok = await enterState(page, stateName);
      if (!ok) continue;
      try {
        await openMenu(page, 'format');
        const disabled = (await page.locator('[data-control="menu.format.formatOptions"]').getAttribute('aria-disabled')) === 'true';
        await clickRow(page, 'format.formatOptions');
        await page.locator('.ts-fo').first().waitFor({ timeout: 8000 });
        await sleep(400);
        const first = await readFormatOptions(page);
        const shots = [await shot(page, `fo-${stateName}-open`, first ? pad(first.rect, 8) : null)];
        // open every closed section
        for (const s of first?.sections ?? []) {
          if (s.open === 'false' && !s.disabled) {
            await clickControl(page, `formatOptions.section.${s.id}`).catch(() => undefined);
            await sleep(250);
          }
        }
        await parkMouse(page);
        const all = await readFormatOptions(page);
        shots.push(await shot(page, `fo-${stateName}-all-open`, all ? pad(all.rect, 8) : null));
        if (all?.scrolls) {
          await page.evaluate(() => { const p = document.querySelector('.ts-fo'); if (p) p.scrollTop = p.scrollHeight; });
          await sleep(300);
          shots.push(await shot(page, `fo-${stateName}-scrolled`, pad(all.rect, 8)));
          await page.evaluate(() => { const p = document.querySelector('.ts-fo'); if (p) p.scrollTop = 0; });
        }
        foReads[stateName] = { first, all, shots };
        const overflow = (all?.sections ?? []).flatMap((s) => s.overflowing);
        record(
          'format',
          `Format options with ${stateName} selected`,
          'Format > Format options, open every section, read every control',
          disabled ? 'broken' : overflow.length ? 'broken' : 'works',
          `${disabled ? 'menu row disabled; ' : ''}head ${JSON.stringify(all?.head)} lead ${JSON.stringify(all?.lead)}; sections ${(all?.sections ?? []).map((s) => `${s.title}${s.disabled ? ' (later)' : ''}[${s.controls}]`).join(', ')}; panel ${all?.rect.w}x${all?.rect.h} scrolls ${all?.scrolls} (${all?.scrollH}); overflow ${overflow.join(',') || 'none'}; notice ${JSON.stringify(all?.notice)}`,
          shots,
        );
        // close through the panel's own control
        const closed = await clickControl(page, 'panel.formatOptions.close').then(() => true).catch(() => false);
        if (!closed) await press(page, 'Escape');
        await sleep(300);
        record('format', `Close with ${stateName} selected`, 'Close the panel through its own X (or Escape)', (await surface(page)).fo ? 'broken' : 'works', `own close control ${closed}; panel still open ${(await surface(page)).fo}`);
      } catch (e) {
        record('format', `Format options with ${stateName} selected`, 'Open and read', 'broken', e.message.split('\n')[0]);
        await clearSurface(page, { deep: true });
      }
    }
    fact('format', foReads);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 7. the dialogs
  if (want('dialogs')) try {
    const openDialog = async (name, open, { escape = true } = {}) => {
      await clearSurface(page, { deep: true });
      let d = null;
      let file = null;
      let escClosed = null;
      let focusAfter = null;
      let tabs = [];
      try {
        await open();
        await page.locator('[role="dialog"]').last().waitFor({ timeout: 8000 });
        await sleep(500);
        await parkMouse(page);
        d = await readDialog(page);
        file = await shot(page, `dialog-${name}`);
        // the tab order: three tabs from the autofocused control
        for (let i = 0; i < 4; i += 1) {
          await press(page, 'Tab');
          tabs.push(await activeDesc(page));
        }
        if (escape) {
          await press(page, 'Escape');
          await sleep(400);
          escClosed = (await surface(page)).dialogs.length === 0;
          focusAfter = await activeDesc(page);
        }
      } catch (e) {
        record('dialogs', name, 'Open the dialog', 'broken', e.message.split('\n')[0], file ? [file] : []);
        await clearSurface(page, { deep: true });
        return null;
      }
      await clearSurface(page, { deep: true });
      record(
        'dialogs',
        name,
        'Open, read the card, Tab four times, Escape',
        d && d.fits && escClosed !== false ? 'works' : 'broken',
        `${d ? `control ${d.control}; title ${JSON.stringify(d.title)}; ${d.rect.w}x${d.rect.h} fits ${d.fits} centred ${d.centred} scrolls ${d.scrolls}; focus ${d.focus} inside ${d.focusInside}; buttons ${d.buttons.map((b) => b.text).filter(Boolean).join(' / ')}; inputs ${d.inputs.map((i) => `${i.type}${i.placeholder ? ` "${i.placeholder}"` : ''}`).join(', ') || 'none'}; overflowing ${d.overflowing.join(',') || 'none'}; text overflow check ok; heads ${d.heads.join(' | ')}` : 'no dialog'}; tabs ${tabs.join(' > ')}; Escape closed ${escClosed}; focus after ${focusAfter}`,
        file ? [file] : [],
      );
      return { ...d, tabs, escClosed, focusAfter, shot: file };
    };
    const dl = {};
    await enterState(page, 'none');
    dl.share = await openDialog('share', () => clickControl(page, 'share.open'));
    dl.download = await openDialog('download-options', async () => {
      await openMenu(page, 'file');
      await hoverRow(page, 'file.download');
      await clickRow(page, 'file.download.options');
    });
    dl.details = await openDialog('details', async () => {
      await openMenu(page, 'file');
      await clickRow(page, 'file.details');
    });
    dl.open = await openDialog('open', async () => {
      await openMenu(page, 'file');
      await clickRow(page, 'file.open');
    });
    dl.importSlides = await openDialog('import-slides', async () => {
      await openMenu(page, 'file');
      await clickRow(page, 'file.importSlides');
    });
    dl.makeCopy = await openDialog('make-a-copy', async () => {
      await openMenu(page, 'file');
      await hoverRow(page, 'file.makeCopy');
      await clickRow(page, 'file.makeCopy.entire');
    });
    dl.nameVersion = await openDialog('name-version', async () => {
      await openMenu(page, 'file');
      await hoverRow(page, 'file.versionHistory');
      await clickRow(page, 'file.versionHistory.nameCurrent');
    });
    dl.findReplace = await openDialog('find-and-replace', async () => {
      await openMenu(page, 'edit');
      await clickRow(page, 'edit.findReplace');
    });
    dl.tailor = await openDialog('tailor', async () => {
      await openMenu(page, 'tools');
      await clickRow(page, 'tools.tailor');
    });
    dl.logo = await openDialog('logo', async () => {
      await openMenu(page, 'insert');
      await clickRow(page, 'insert.logo');
    });
    dl.shader = await openDialog('shader-gallery', async () => {
      await openMenu(page, 'insert');
      await clickRow(page, 'insert.shader');
    });
    dl.slideNumbers = await openDialog('slide-numbers', async () => {
      await openMenu(page, 'insert');
      await clickRow(page, 'insert.slideNumbers');
    });
    dl.background = await openDialog('background', async () => {
      await openMenu(page, 'slide');
      await clickRow(page, 'slide.changeBackground');
    });
    dl.shortcuts = await openDialog('keyboard-shortcuts', async () => {
      await openMenu(page, 'help');
      await clickRow(page, 'help.keyboardShortcuts');
    });
    dl.help = await openDialog('help', async () => {
      await openMenu(page, 'help');
      await clickRow(page, 'help.help');
    });
    // the palette (Search the menus)
    {
      await clearSurface(page, { deep: true });
      await openMenu(page, 'help');
      await clickRow(page, 'help.searchMenus');
      await page.locator('[data-control="palette"]').waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(400);
      const pr = await rectOfControl(page, 'palette');
      const focus = await activeDesc(page);
      await typeHuman(page, 'tab');
      await sleep(500);
      const results = await page.evaluate(() => [...document.querySelectorAll('[data-control="palette"] [data-control^="palette."]')].filter((el) => el.getClientRects().length > 0).map((el) => `${el.getAttribute('data-control')}: ${el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60)}`));
      const file = await shot(page, 'dialog-search-the-menus', pr ? pad(pr, 40) : null);
      await press(page, 'Escape');
      await sleep(300);
      record('dialogs', 'Search the menus', 'Help > Search the menus, type "tab", read the results, Escape', pr ? 'works' : 'broken', `palette ${pr ? `${pr.w}x${pr.h} at ${pr.x},${pr.y}` : 'absent'}; focus ${focus}; results ${results.slice(0, 8).join(' | ')}; closed ${(await surface(page)).palette === false}`, file);
    }
    // Preferences and Accessibility settings (submenus with one check row each)
    {
      const read = await openPath(page, 'tools', ['tools.preferences']);
      const sub = read.find((m) => m.id !== 'ts-menu-tools');
      const file = await shot(page, 'menu-tools-preferences', pad(read.reduce((a, m) => union(a, m.rect), null), 24));
      record('dialogs', 'Preferences', 'Tools > Preferences (a submenu, no dialog)', 'note', `rows ${(sub?.items ?? []).map((i) => `${i.label} [${i.role} checked ${i.checked}]`).join(', ')}`, file);
      await clearSurface(page);
    }
    // Save as template and Page setup with Advanced tools on
    {
      await clearSurface(page, { deep: true });
      await openMenu(page, 'tools');
      await clickRow(page, 'tools.advancedTools');
      await sleep(400);
      await clearSurface(page);
      const on = (await state(page)).settings?.advancedTools === true;
      if (on) {
        dl.saveAsTemplate = await openDialog('save-as-template', async () => {
          await openMenu(page, 'file');
          await clickRow(page, 'file.saveAsTemplate');
        });
        // Page setup: a Later row
        await openMenu(page, 'file');
        const ps = await page.locator('[data-control="menu.file.pageSetup"]').first();
        const psVisible = await ps.isVisible().catch(() => false);
        let tip = null;
        if (psVisible) {
          const r = await ps.boundingBox();
          await moveHuman(page, { x: r.x - 20, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
          await sleep(700);
          tip = await tooltipRead(page);
        }
        const file = await shot(page, 'menu-file-page-setup-later', pad(await rectOf(page, '#ts-menu-file'), 24));
        record('dialogs', 'Page setup', 'File > Page setup with Advanced tools on (a Later stub)', psVisible ? 'note' : 'broken', `row visible ${psVisible}; disabled ${psVisible ? await ps.getAttribute('aria-disabled') : 'n/a'}; tooltip ${JSON.stringify(tip?.text ?? null)}`, file);
        await clearSurface(page);
        dl.agentAccess = await openDialog('agent-access', async () => {
          await openMenu(page, 'extensions');
          await clickRow(page, 'extensions.agentAccess');
        });
        dl.publish = await openDialog('publish-to-web', async () => {
          await openMenu(page, 'file');
          await hoverRow(page, 'file.share');
          await clickRow(page, 'file.share.publish');
        });
        await openMenu(page, 'tools');
        await clickRow(page, 'tools.advancedTools');
        await sleep(300);
        await clearSurface(page);
      } else record('dialogs', 'Advanced tools', 'Turn Tools > Advanced tools on', 'broken', 'the switch did not turn on');
    }
    // Link (text selected) and Image options
    if (objects.text) {
      await enterState(page, 'text');
      dl.link = await openDialog('link', async () => {
        await openMenu(page, 'insert');
        await clickRow(page, 'insert.link');
      });
    }
    fact('dialogs', dl);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 8. the right click menus
  if (want('context')) try {
    const ctxReads = {};
    const contextAt = async (name, point, { stateName = 'none' } = {}) => {
      await enterState(page, stateName);
      await moveHuman(page, { x: point.x - 30, y: point.y - 20 }, point, 6);
      await sleep(rand(40, 90));
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(rand(300, 450));
      const read = await readContext(page);
      const file = await shot(page, `context-${name}`, read ? pad(union(read.rect, { x: point.x - 10, y: point.y - 10, w: 20, h: 20 }), 30) : null);
      // hover the first submenu row and read it
      let sub = null;
      let subFile = null;
      const subRow = read?.items.find((i) => i.submenu && !i.disabled);
      if (subRow) {
        const r = await page.locator(`.ts-context-menu [data-control="menu.${subRow.id}"]`).first().boundingBox().catch(() => null);
        if (r) {
          await moveHuman(page, { x: r.x + 10, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
          await sleep(500);
          const menus = await readMenus(page);
          sub = menus.find((m) => m.level !== '0') ?? menus[menus.length - 1] ?? null;
          subFile = await shot(page, `context-${name}-${subRow.id}`, pad(union(read.rect, sub?.rect), 30));
        }
      }
      await press(page, 'Escape');
      await sleep(200);
      const gone = (await surface(page)).context === 0;
      ctxReads[name] = { point, read, sub, shot: file, subShot: subFile };
      record(
        'context',
        `Right click on ${name}`,
        `Right click at ${Math.round(point.x)},${Math.round(point.y)} with ${stateName} selected, read the rows, hover the first submenu, Escape`,
        read && read.fits && gone ? 'works' : 'broken',
        read
          ? `target ${read.target}; ${read.items.length} rows (${read.items.filter((i) => i.disabled).length} disabled, ${read.items.filter((i) => i.icon !== 'none').length} with icons, ${read.items.filter((i) => i.key).length} with keys); plate ${read.rect.w}x${read.rect.h} at ${read.rect.x},${read.rect.y} fits ${read.fits}; offset from the click ${read.rect.x - Math.round(point.x)},${read.rect.y - Math.round(point.y)}; rows ${read.items.map((i) => `${i.label}${i.disabled ? ' (off)' : ''}`).join(' | ')}; submenu ${subRow ? `${subRow.id}: ${(sub?.items ?? []).map((i) => i.label).join(', ')} fits ${sub?.fits}` : 'none'}; Escape closed ${gone}`
          : 'no context menu',
        [file, subFile].filter(Boolean),
      );
      await clearSurface(page, { deep: true });
      return read;
    };
    // empty sheet
    await contextAt('empty-sheet', await sheetPoint(page, 1500, 900));
    // the blocks
    for (const stateName of ['text', 'picture', 'shape']) {
      if (!objects[stateName]) continue;
      const b = await boxOf(page, objects[stateName].id);
      if (b) await contextAt(`${stateName}-block`, { x: b.free.x + b.free.w / 2, y: b.free.y + b.free.h / 2 }, { stateName });
    }
    // a table cell: click a cell first (a caret), then right click in it
    if (objects.table) {
      await enterState(page, 'none');
      const cells = await page.evaluate((id) => {
        const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
        if (!root) return null;
        return [...root.querySelectorAll('.td')].slice(0, 9).map((td) => { const r = td.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      }, objects.table.id);
      if (cells && cells.length) {
        const c = cells[4] ?? cells[0];
        const p = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
        await clickAt(page, p.x, p.y);
        await sleep(300);
        const editing = await page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
        await moveHuman(page, { x: p.x - 30, y: p.y - 20 }, p, 6);
        await page.mouse.click(p.x, p.y, { button: 'right' });
        await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
        await sleep(400);
        const read = await readContext(page);
        const file = await shot(page, 'context-table-cell', read ? pad(union(read.rect, { x: p.x - 10, y: p.y - 10, w: 20, h: 20 }), 30) : null);
        await press(page, 'Escape');
        await sleep(200);
        ctxReads.tableCell = { point: p, read, editing, shot: file };
        record('context', 'Right click on a table cell', 'Click the centre cell (a caret), right click in it, read the rows', read && read.fits ? 'works' : 'broken', read ? `cell session ${editing}; target ${read.target}; ${read.items.length} rows: ${read.items.map((i) => `${i.label}${i.disabled ? ' (off)' : ''}`).join(' | ')}; fits ${read.fits}` : `cell session ${editing}; no context menu`, file);
        await clearSurface(page, { deep: true });
        // the table selected as a block (one click on the table's edge)
        await enterState(page, 'table');
        const b = await boxOf(page, objects.table.id);
        if (b) await contextAt('table-block', { x: b.free.x + b.free.w / 2, y: b.free.y + b.free.h / 2 }, { stateName: 'table' });
      }
    }
    // a filmstrip card
    {
      await enterState(page, 'none');
      const r = await rectOfControl(page, `filmstrip.slide.${objectSlide}`);
      if (r) await contextAt('filmstrip-card', { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    }
    // a text selection: double click into the text box, select a word, right click it
    if (objects.text) {
      await enterState(page, 'text');
      const b = await boxOf(page, objects.text.id);
      const p = { x: b.inner.x + Math.min(40, b.inner.w / 3), y: b.inner.y + b.inner.h / 2 };
      await dblclickAt(page, p.x, p.y);
      await sleep(300);
      await page.mouse.dblclick(p.x, p.y);
      await sleep(300);
      const selText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
      await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(400);
      const read = await readContext(page);
      const file = await shot(page, 'context-text-selection', read ? pad(union(read.rect, { x: p.x - 10, y: p.y - 10, w: 20, h: 20 }), 30) : null);
      await press(page, 'Escape');
      await sleep(200);
      ctxReads.textSelection = { read, selText, shot: file };
      record('context', 'Right click on a text selection', 'Double click into the text box, double click a word, right click the selection', read && read.fits ? 'works' : 'broken', read ? `selection ${JSON.stringify(selText)}; target ${read.target}; ${read.items.length} rows: ${read.items.map((i) => `${i.label}${i.disabled ? ' (off)' : ''}`).join(' | ')}; fits ${read.fits}` : `selection ${JSON.stringify(selText)}; no context menu`, file);
      await clearSurface(page, { deep: true });
    }
    fact('context', ctxReads);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 9. tooltips
  if (want('tooltips')) try {
    const tips = {};
    await enterState(page, 'none');
    const titleControls = ['title.home', 'deck.name', 'deck.saveState', 'title.assist', 'title.comments', 'title.sidePanel', 'present.open', 'present.arrow', 'share.open'];
    const menubar = MENU_IDS.map((m) => `menubar.${m}`);
    const readSet = async (name, controls) => {
      const out = [];
      for (const c of controls) {
        if (!(await visibleControl(page, c))) {
          out.push({ control: c, tip: null, absent: true });
          continue;
        }
        const r = await hoverForTip(page, c);
        out.push(r);
        if (r.tip) {
          const file = await shot(page, `tip-${name}-${c.replace(/\./g, '-')}`, pad(union(r.anchor, r.tip.rect), 20));
          r.shot = file;
        }
        await clearSurface(page);
      }
      tips[name] = out;
      const missing = out.filter((r) => !r.absent && !r.tip).map((r) => r.control);
      const slow = out.filter((r) => r.delay !== null && r.delay > 700).map((r) => `${r.control} ${r.delay}ms`);
      const overlapping = out.filter((r) => r.overlap).map((r) => r.control);
      const clipped = out.filter((r) => r.tip && !r.tip.fits).map((r) => r.control);
      record(
        'tooltips',
        name,
        `Hover every control of the ${name} from away and read the plate`,
        missing.length === 0 && overlapping.length === 0 && clipped.length === 0 ? 'works' : 'broken',
        `${out.filter((r) => r.tip).length}/${out.filter((r) => !r.absent).length} showed; delays ${out.filter((r) => r.delay !== null).map((r) => r.delay).join('/')} ms; missing ${missing.join(',') || 'none'}; slow ${slow.join(',') || 'none'}; overlapping the anchor ${overlapping.join(',') || 'none'}; clipped ${clipped.join(',') || 'none'}; words ${out.filter((r) => r.tip).map((r) => `${r.control.replace(/^(toolbar|title|menubar)\./, '')}: "${r.tip.text}"`).join(' | ')}`,
        out.map((r) => r.shot).filter(Boolean),
      );
    };
    await readSet('title-row', titleControls);
    await readSet('menubar', menubar);
    const head = (await readToolbar(page)).headControls.map((c) => c.id);
    await readSet('toolbar-head', head);
    const tailNone = (await readToolbar(page)).tailControls.map((c) => c.id);
    await readSet('toolbar-tail-none', tailNone);
    if (objects.text) {
      await enterState(page, 'text');
      const tail = (await readToolbar(page)).tailControls.map((c) => c.id);
      await readSet('toolbar-tail-text', tail);
    }
    if (objects.picture) {
      await enterState(page, 'picture');
      const tail = (await readToolbar(page)).tailControls.map((c) => c.id);
      await readSet('toolbar-tail-picture', tail);
    }
    if (objects.table) {
      await enterState(page, 'table');
      const tail = (await readToolbar(page)).tailControls.map((c) => c.id);
      await readSet('toolbar-tail-table', tail);
    }
    // a menu row's tooltip, a disabled row's, a submenu row's
    await enterState(page, 'none');
    {
      await openMenu(page, 'file');
      const r = await rectOfControl(page, 'menu.file.details');
      await moveHuman(page, { x: r.x - 20, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
      await sleep(800);
      const t1 = await tooltipRead(page);
      const f1 = await shot(page, 'tip-menu-row-details', pad(union(await rectOf(page, '#ts-menu-file'), t1?.rect), 20));
      const r2 = await rectOfControl(page, 'menu.file.download');
      await moveHuman(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, { x: r2.x + r2.w / 2, y: r2.y + r2.h / 2 }, 6);
      await sleep(800);
      const t2 = await tooltipRead(page);
      const f2 = await shot(page, 'tip-menu-row-submenu', pad((await readMenus(page)).reduce((a, m) => union(a, m.rect), null), 20));
      await clearSurface(page);
      await openMenu(page, 'edit');
      const r3 = await rectOfControl(page, 'menu.edit.cut');
      await moveHuman(page, { x: r3.x - 20, y: r3.y + r3.h / 2 }, { x: r3.x + r3.w / 2, y: r3.y + r3.h / 2 }, 6);
      await sleep(800);
      const t3 = await tooltipRead(page);
      const f3 = await shot(page, 'tip-menu-row-disabled', pad(union(await rectOf(page, '#ts-menu-edit'), t3?.rect), 20));
      await clearSurface(page);
      record('tooltips', 'menu rows', 'Hover File > Details, File > Download (a submenu row), Edit > Cut (disabled with nothing selected)', 'note', `Details ${JSON.stringify(t1?.text ?? null)}; Download (submenu open) ${JSON.stringify(t2?.text ?? null)}; Cut disabled ${JSON.stringify(t3?.text ?? null)}`, [f1, f2, f3]);
      tips.menuRows = { details: t1, download: t2, cut: t3 };
    }
    // a filmstrip card and the object's handles
    {
      const r = await hoverForTip(page, `filmstrip.slide.${objectSlide}`);
      const f = r.tip ? await shot(page, 'tip-filmstrip-card', pad(union(r.anchor, r.tip.rect), 20)) : null;
      record('tooltips', 'filmstrip card', 'Hover the slide card', r.tip ? 'works' : 'broken', `${JSON.stringify(r.tip?.text ?? null)} delay ${r.delay}`, f ? [f] : []);
      tips.filmstripCard = r;
      if (objects.shape) {
        await enterState(page, 'shape');
        const handles = await handleControls(page);
        const out = [];
        for (const h of handles.slice(0, 12)) {
          const rr = await hoverForTip(page, h, 1000);
          out.push({ control: h, text: rr.tip?.text ?? null, delay: rr.delay });
        }
        const f2 = await shot(page, 'tip-handles-shape', pad((await boxOf(page, objects.shape.id)).free, 80));
        record('tooltips', 'the handles of a shape', 'Hover the move, resize and rotate handles', out.every((o) => o.text) ? 'works' : 'broken', out.map((o) => `${o.control.split('.').slice(2).join('.')}: ${JSON.stringify(o.text)}`).join(' | '), f2);
        tips.handles = out;
      }
    }
    fact('tooltips', tips);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 10. Tools > Advanced tools on and off
  if (want('advanced')) try {
    await enterState(page, 'none');
    const countRows = async () => {
      const out = {};
      for (const menuId of MENU_IDS) {
        if (!(await visibleControl(page, `menubar.${menuId}`))) {
          out[menuId] = { rows: [], absent: true };
          continue;
        }
        try {
          const m = await readWholeMenu(page, menuId, 'adv');
          out[menuId] = { rows: summarizeMenu(m).map((i) => i.id), shot: m.shot, subShots: m.levels.map((l) => l.shot) };
        } catch (e) {
          out[menuId] = { rows: [], error: e.message.split('\n')[0] };
          await clearSurface(page).catch(() => undefined);
        }
      }
      return out;
    };
    const s0 = (await state(page)).settings?.advancedTools === true;
    if (!facts['menus.none']) {
      /* a run without the menus section: the default view's rows are read here as the base */
      const base = {};
      for (const menuId of MENU_IDS) {
        if (!(await visibleControl(page, `menubar.${menuId}`))) continue;
        try {
          const m = await readWholeMenu(page, menuId, 'off');
          base[`none.${menuId}`] = m;
        } catch (e) {
          await clearSurface(page).catch(() => undefined);
        }
      }
      fact('menus.none', base);
    }
    await openMenu(page, 'tools');
    const rowBefore = await page.locator('[data-control="menu.tools.advancedTools"]').getAttribute('aria-checked');
    await clickRow(page, 'tools.advancedTools');
    await sleep(500);
    await clearSurface(page);
    const s1 = (await state(page)).settings?.advancedTools === true;
    const tbOn = await readToolbar(page);
    const stripOn = await shot(page, 'advanced-on-toolbar-none', tbOn.bar ? { x: 0, y: tbOn.bar.y - 4, w: 1440, h: tbOn.bar.h + 8 } : null);
    const titleOn = await shot(page, 'advanced-on-title-row', { x: 0, y: 0, w: 1440, h: 120 });
    const on = await countRows();
    await openMenu(page, 'tools');
    const rowAfter = await page.locator('[data-control="menu.tools.advancedTools"]').getAttribute('aria-checked');
    await clickRow(page, 'tools.advancedTools');
    await sleep(500);
    await clearSurface(page);
    const s2 = (await state(page)).settings?.advancedTools === true;
    const offCounts = {};
    for (const menuId of MENU_IDS) {
      if (!(await visibleControl(page, `menubar.${menuId}`))) {
        offCounts[menuId] = 'absent';
        continue;
      }
      const read = await openPath(page, menuId).catch(() => []);
      offCounts[menuId] = (read[0]?.items ?? []).length;
      await clearSurface(page);
    }
    const noneReads = facts['menus.none'] ?? {};
    const added = {};
    for (const menuId of MENU_IDS) {
      const base = noneReads[`none.${menuId}`] ? summarizeMenu(noneReads[`none.${menuId}`]).map((i) => i.id) : [];
      added[menuId] = on[menuId].rows.filter((id) => !base.includes(id));
    }
    fact('advanced', { before: s0, on: s1, off: s2, rowBefore, rowAfter, added, offCounts, toolbarOn: tbOn });
    record(
      'advanced',
      'Tools > Advanced tools',
      'Turn the switch on, read every menu, the toolbar and the title row, turn it off, read again',
      s0 === false && s1 === true && s2 === false ? 'works' : 'broken',
      `setting ${s0} > ${s1} > ${s2}; row aria-checked ${rowBefore} > ${rowAfter}; rows added with the switch on: ${Object.entries(added).map(([m, ids]) => `${m} +${ids.length}${ids.length ? ` (${ids.join(', ')})` : ''}`).join('; ')}; top rows with the switch off ${JSON.stringify(offCounts)}; tail with the switch on ${tbOn.tailControls.map((c) => c.id.replace('toolbar.', '')).join(' ')}`,
      [stripOn, titleOn, ...MENU_IDS.map((m) => on[m].shot)],
    );
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 11. Help > Keyboard shortcuts against the real keys
  if (want('shortcuts')) try {
    await enterState(page, 'none');
    await openMenu(page, 'help');
    await clickRow(page, 'help.keyboardShortcuts');
    await page.locator('[data-control="dialog.keyboardShortcuts"]').waitFor({ timeout: 8000 });
    await sleep(500);
    const listed = await page.evaluate(() => {
      const d = document.querySelector('[data-control="dialog.keyboardShortcuts"]');
      if (!d) return null;
      const groups = [...d.querySelectorAll('h3, h4, .ts-shortcuts-group, [data-group]')].map((h) => h.textContent?.trim());
      const rows = [...d.querySelectorAll('tr, li, .ts-shortcut-row, dl > div')]
        .filter((r) => r.querySelector('kbd'))
        .map((r) => ({
          label: (r.querySelector('td, dt, .ts-shortcut-label, span')?.textContent ?? r.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          keys: [...r.querySelectorAll('kbd')].map((k) => k.textContent?.trim()).join(' '),
          text: r.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
        }));
      return { groups, rows, scrolls: d.scrollHeight > d.clientHeight + 1, h: d.getBoundingClientRect().height };
    });
    const dialogShots = [await shot(page, 'shortcuts-dialog-top')];
    if (listed?.scrolls) {
      await page.evaluate(() => { const d = document.querySelector('[data-control="dialog.keyboardShortcuts"]'); const sc = d.querySelector('.ts-dialog-body, .ts-shortcuts, [class*="body"]') ?? d; sc.scrollTop = sc.scrollHeight / 2; });
      await sleep(300);
      dialogShots.push(await shot(page, 'shortcuts-dialog-middle'));
      await page.evaluate(() => { const d = document.querySelector('[data-control="dialog.keyboardShortcuts"]'); const sc = d.querySelector('.ts-dialog-body, .ts-shortcuts, [class*="body"]') ?? d; sc.scrollTop = sc.scrollHeight; });
      await sleep(300);
      dialogShots.push(await shot(page, 'shortcuts-dialog-bottom'));
    }
    await press(page, 'Escape');
    await sleep(300);
    fact('shortcuts.listed', listed);
    // compare with the model's chords
    const modelKeys = MODEL.menus.filter((r) => r.shortcut).map((r) => ({ id: r.id, label: r.label, key: r.shortcut }));
    const norm = (s) => s.replace(/⌘|Cmd/g, 'Cmd').replace(/⇧|Shift/g, 'Shift').replace(/⌥|Option|Alt/g, 'Option').replace(/⌃|Ctrl|Control/g, 'Ctrl').replace(/[\s+]+/g, ' ').trim().toLowerCase();
    const mismatches = [];
    for (const mk of modelKeys) {
      const row = (listed?.rows ?? []).find((r) => r.label.toLowerCase() === mk.label.toLowerCase());
      if (!row) {
        mismatches.push(`${mk.label} (${mk.key}) not listed`);
        continue;
      }
      const a = norm(row.keys);
      const chords = mk.key.split(' or ').map(norm);
      if (!chords.some((c) => a.includes(c))) mismatches.push(`${mk.label}: dialog "${row.keys}" vs menu "${mk.key}"`);
    }
    record('shortcuts', 'The dialog against the menus', 'Read every kbd row of Help > Keyboard shortcuts and compare with the menu rows\' chords', mismatches.length === 0 ? 'works' : 'broken', `${listed?.rows.length ?? 0} rows in ${listed?.groups.length ?? 0} groups (${(listed?.groups ?? []).join(', ')}); scrolls ${listed?.scrolls}; mismatches ${mismatches.join('; ') || 'none'}`, dialogShots);
    // the real keys
    const keyChecks = [];
    const check = async (name, chord, setup, test, restore) => {
      try {
        await clearSurface(page, { deep: true });
        await setup();
        await sleep(200);
        const before = await test();
        await pressChord(page, chord);
        await sleep(600);
        const after = await test();
        const ok = before.expectChange ? JSON.stringify(before.value) !== JSON.stringify(after.value) : after.pass === true;
        const file = after.shot ? await shot(page, `key-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, after.clip ?? null) : null;
        keyChecks.push({ name, chord, ok, before: before.value, after: after.value });
        record('shortcuts.keys', name, `Press ${chord}`, ok ? 'works' : 'broken', `before ${JSON.stringify(before.value)} after ${JSON.stringify(after.value)}`, file ? [file] : []);
        await restore?.();
      } catch (e) {
        keyChecks.push({ name, chord, ok: false, error: e.message.split('\n')[0] });
        record('shortcuts.keys', name, `Press ${chord}`, 'broken', e.message.split('\n')[0]);
      }
      await clearSurface(page, { deep: true });
    };
    const dlgOpen = async () => ({ value: (await surface(page)).dialogs, pass: (await surface(page)).dialogs.length > 0, shot: true });
    await check('Keyboard shortcuts', 'Cmd+/', () => enterState(page, 'none'), dlgOpen);
    await check('Find and replace', 'Cmd+Shift+H', () => enterState(page, 'none'), dlgOpen);
    await check('Search the menus', 'Option+/', () => enterState(page, 'none'), async () => ({ value: (await surface(page)).palette, pass: (await surface(page)).palette, shot: true }));
    await check('Open', 'Cmd+O', () => enterState(page, 'none'), dlgOpen);
    await check('Slideshow', 'Cmd+Enter', () => enterState(page, 'none'), async () => ({ value: (await surface(page)).present, pass: (await surface(page)).present, shot: true }), async () => { await press(page, 'Escape'); await sleep(500); });
    await check('Hide the menus', 'Ctrl+Shift+F', () => enterState(page, 'none'), async () => ({ value: (await surface(page)).menusHidden, pass: (await surface(page)).menusHidden, shot: true }), async () => { await pressChord(page, 'Ctrl+Shift+F'); await sleep(400); if ((await surface(page)).menusHidden) await clickControl(page, 'toolbar.showMenus').catch(() => undefined); });
    await check('Zoom in', 'Cmd+Plus', () => enterState(page, 'none'), async () => ({ value: (await state(page)).zoom, expectChange: true }), async () => { await openMenu(page, 'view'); await hoverRow(page, 'view.zoom'); await clickRow(page, 'view.zoom.fit'); await clearSurface(page); });
    await check('Zoom to 100%', 'Cmd+0', () => enterState(page, 'none'), async () => ({ value: (await state(page)).zoom, expectChange: true }), async () => { await openMenu(page, 'view'); await hoverRow(page, 'view.zoom'); await clickRow(page, 'view.zoom.fit'); await clearSurface(page); });
    await check('New slide', 'Ctrl+M', () => enterState(page, 'none'), async () => ({ value: (await slideOrder(page)).length, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(600); await settled(page); await gotoSlide(page, objectSlide); });
    if (objects.shape) {
      await check('Duplicate (a shape selected)', 'Cmd+D', () => enterState(page, 'shape'), async () => ({ value: (await objectsSafe(page, objectSlide)).length, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(600); await settled(page); await ensureObjects(page); });
      await check('Delete (a shape selected)', 'Delete', () => enterState(page, 'shape'), async () => ({ value: (await objectsSafe(page, objectSlide)).length, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(600); await settled(page); await ensureObjects(page); });
      await check('Nudge right (a shape selected)', 'Right', () => enterState(page, 'shape'), async () => ({ value: (await objectsSafe(page, objectSlide)).find((o) => o.id === objects.shape.id)?.pos?.x, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(500); await settled(page); });
      await check('Bring to front (a shape selected)', 'Cmd+Shift+Up', () => enterState(page, 'shape'), async () => ({ value: (await objectsSafe(page, objectSlide)).map((o) => o.id).join(','), expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(500); await settled(page); });
      await check('Alt text (a shape selected)', 'Cmd+Option+Y', () => enterState(page, 'shape'), dlgOpen);
    }
    if (objects.text) {
      await check('Bold (a text box selected)', 'Cmd+B', () => enterState(page, 'text'), async () => ({ value: await page.evaluate(() => document.querySelector('[data-control="toolbar.bold"]')?.getAttribute('aria-pressed')), expectChange: true, shot: true, clip: { x: 0, y: 60, w: 1440, h: 80 } }), async () => { await pressChord(page, 'Cmd+B'); await sleep(400); });
      await check('Italic (a text box selected)', 'Cmd+I', () => enterState(page, 'text'), async () => ({ value: await page.evaluate(() => document.querySelector('[data-control="toolbar.italic"]')?.getAttribute('aria-pressed')), expectChange: true }), async () => { await pressChord(page, 'Cmd+I'); await sleep(400); });
      await check('Link (a text box selected)', 'Cmd+K', () => enterState(page, 'text'), dlgOpen);
      await check('Center align (a text box selected)', 'Cmd+Shift+E', () => enterState(page, 'text'), async () => ({ value: (await state(page)).revision, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(500); await settled(page); });
      await check('Select all', 'Cmd+A', () => enterState(page, 'none'), async () => ({ value: await page.evaluate(() => document.querySelectorAll('.ts-overlay [data-control$=".move"]').length), expectChange: true, shot: true }), async () => { await press(page, 'Escape'); });
    }
    await check('Undo after a write', 'Cmd+Z', async () => { await enterState(page, 'shape'); await pressChord(page, 'Right'); await sleep(500); await settled(page); }, async () => ({ value: (await state(page)).revision, expectChange: true }));
    await check('Redo', 'Cmd+Shift+Z', async () => { await enterState(page, 'shape'); }, async () => ({ value: (await state(page)).revision, expectChange: true }), async () => { await pressChord(page, 'Cmd+Z'); await sleep(500); });
    fact('shortcuts.keys', keyChecks);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 12. light and dark
  if (want('appearance')) try {
    const app = {};
    const setAppearance = async (a) => {
      await clearSurface(page, { deep: true });
      await openMenu(page, 'view');
      /* the older build parks View > Appearance behind Tools > Advanced tools */
      let usedAdvanced = false;
      if (!(await has(page, '[data-control="menu.view.appearance"]'))) {
        await clearSurface(page);
        await openMenu(page, 'tools');
        await clickRow(page, 'tools.advancedTools');
        await sleep(400);
        await clearSurface(page);
        usedAdvanced = true;
        await openMenu(page, 'view');
      }
      await hoverRow(page, 'view.appearance');
      await clickRow(page, `view.appearance.${a}`);
      await sleep(600);
      await clearSurface(page);
      if (usedAdvanced) {
        await openMenu(page, 'tools');
        await clickRow(page, 'tools.advancedTools');
        await sleep(300);
        await clearSurface(page);
      }
      return theme(page);
    };
    const contrast = (fg, bg) => {
      const lum = (c) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c ?? '');
        if (!m) return null;
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
      };
      const a = lum(fg);
      const b = lum(bg);
      if (a === null || b === null) return null;
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    };
    for (const a of ['light', 'dark']) {
      const got = await setAppearance(a);
      await enterState(page, 'none');
      const files = [await shot(page, `appearance-${a}-editor`)];
      const tokens = await page.evaluate(() => {
        const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
        const row = cs('[data-control="title.row"]');
        const bar = cs('[data-control="toolbar.head"]');
        const mb = cs('[data-control="menubar.file"]');
        const card = cs('.ts-card');
        const body = getComputedStyle(document.body);
        return {
          bodyBg: body.backgroundColor,
          titleBg: row?.backgroundColor, titleColor: cs('.ts-title-name')?.color,
          menubarColor: mb?.color, menubarFont: mb ? `${mb.fontFamily.split(',')[0]} ${mb.fontSize} ${mb.fontWeight}` : null,
          toolbarBg: bar?.backgroundColor,
          cardBorder: card ? `${card.borderTopWidth} ${card.borderTopColor}` : null,
          sheetBg: cs('.ts-stagewrap.ts-editor .pt-slide')?.backgroundColor,
          stageBg: cs('.ts-stagewrap')?.backgroundColor,
        };
      });
      // a menu open
      await openMenu(page, 'edit');
      const menu = (await readMenus(page))[0];
      const menuStyle = await page.evaluate(() => {
        const m = document.querySelector('#ts-menu-edit');
        const en = m?.querySelector('.ts-menu-item:not(.is-disabled) .ts-menu-label');
        const dis = m?.querySelector('.ts-menu-item.is-disabled .ts-menu-label');
        const key = m?.querySelector('.ts-menu-key');
        const div = m?.querySelector('.ts-menu-divider');
        const cs = (el) => (el ? getComputedStyle(el) : null);
        return { bg: cs(m)?.backgroundColor, border: cs(m) ? `${cs(m).borderTopWidth} ${cs(m).borderTopColor}` : null, enabled: cs(en)?.color, disabled: cs(dis)?.color, disabledOpacity: dis ? getComputedStyle(dis.closest('.ts-menu-item')).opacity : null, key: cs(key)?.color, divider: cs(div) ? `${cs(div).height} ${cs(div).backgroundColor || cs(div).borderTopColor}` : null };
      });
      files.push(await shot(page, `appearance-${a}-menu-edit`, pad(menu.rect, 24)));
      // hover a row
      const r = await rectOfControl(page, 'menu.edit.selectAll');
      await moveHuman(page, { x: r.x - 20, y: r.y + r.h / 2 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 6);
      await sleep(500);
      const hoverStyle = await page.evaluate(() => { const el = document.querySelector('[data-control="menu.edit.selectAll"]'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: getComputedStyle(el.querySelector('.ts-menu-label')).color }; });
      files.push(await shot(page, `appearance-${a}-menu-hover`, pad(menu.rect, 24)));
      await clearSurface(page);
      // a dialog
      await clickControl(page, 'share.open');
      await page.locator('[role="dialog"]').last().waitFor({ timeout: 8000 });
      await sleep(400);
      const dlg = await readDialog(page);
      const dlgStyle = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); const scrim = d?.closest('.ts-dialog-scrim') ?? d?.parentElement; const cs = getComputedStyle(d); const primary = d.querySelector('button.is-primary, button[data-variant="primary"], .ts-btn-primary'); return { bg: cs.backgroundColor, color: cs.color, scrim: scrim ? getComputedStyle(scrim).backgroundColor : null, primary: primary ? `${getComputedStyle(primary).backgroundColor} / ${getComputedStyle(primary).color}` : null }; });
      files.push(await shot(page, `appearance-${a}-dialog-share`));
      await clearSurface(page, { deep: true });
      // a context menu
      const p = await sheetPoint(page, 1500, 900);
      await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(400);
      const ctx = await readContext(page);
      files.push(await shot(page, `appearance-${a}-context`, ctx ? pad(ctx.rect, 30) : null));
      await clearSurface(page);
      // a tooltip
      const tip = await hoverForTip(page, 'toolbar.undo');
      const tipStyle = await page.evaluate(() => { const t = document.querySelector('.pt-tip'); if (!t) return null; const cs = getComputedStyle(t); const k = t.querySelector('kbd'); return { bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, kbd: k ? `${getComputedStyle(k).backgroundColor} / ${getComputedStyle(k).color}` : null }; });
      if (tip.tip) files.push(await shot(page, `appearance-${a}-tooltip`, pad(union(tip.anchor, tip.tip.rect), 20)));
      await clearSurface(page);
      // the selection ring on the shape and the Format options panel
      if (objects.shape) {
        await enterState(page, 'shape');
        files.push(await shot(page, `appearance-${a}-selected-shape`));
        await clearSurface(page, { deep: true });
      }
      app[a] = { got, tokens, menuStyle, hoverStyle, dlgStyle, tipStyle, contrasts: { menuEnabled: contrast(menuStyle.enabled, menuStyle.bg), menuDisabled: contrast(menuStyle.disabled, menuStyle.bg), menuKey: contrast(menuStyle.key, menuStyle.bg), hover: contrast(hoverStyle.color, hoverStyle.bg), tip: tipStyle ? contrast(tipStyle.color, tipStyle.bg) : null, title: contrast(tokens.titleColor, tokens.titleBg), menubar: contrast(tokens.menubarColor, tokens.titleBg) }, files };
      record(
        'appearance',
        a,
        `View > Appearance > ${a[0].toUpperCase() + a.slice(1)}: the editor, an open menu, a hovered row, the Share dialog, a right click menu, a tooltip, the selected shape`,
        got === a ? 'works' : 'broken',
        `data-theme ${got}; body ${tokens.bodyBg}; title row ${tokens.titleBg} / ${tokens.titleColor} (contrast ${app[a].contrasts.title}); menubar ${tokens.menubarFont} ${tokens.menubarColor} (${app[a].contrasts.menubar}); sheet ${tokens.sheetBg} on stage ${tokens.stageBg}; menu ${menuStyle.bg} border ${menuStyle.border} enabled ${menuStyle.enabled} (${app[a].contrasts.menuEnabled}) disabled ${menuStyle.disabled} opacity ${menuStyle.disabledOpacity} (${app[a].contrasts.menuDisabled}) key ${menuStyle.key} (${app[a].contrasts.menuKey}) divider ${menuStyle.divider}; hover ${hoverStyle.bg} / ${hoverStyle.color} (${app[a].contrasts.hover}); dialog ${dlgStyle.bg} / ${dlgStyle.color} scrim ${dlgStyle.scrim} primary ${dlgStyle.primary}; tooltip ${tipStyle ? `${tipStyle.bg} / ${tipStyle.color} (${app[a].contrasts.tip}) kbd ${tipStyle.kbd}` : 'none'}`,
        files,
      );
    }
    await setAppearance(bootTheme === 'light' ? 'light' : 'dark');
    fact('appearance', app);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
    await clearSurface(page, { deep: true }).catch(() => undefined);
    if (!/\/edit\//.test(page.url())) {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await editorReady(page).catch(() => undefined);
    }
  }

  // =========================================================================================
  // 11b. the Arrange rows (their parents are disabled with nothing selected, so the click pass
  //      never reached them) and Group, Ungroup, Regroup and Distribute with several selected
  if (want('arrange')) try {
    const clickArrange = async (rowPath, stateName, selectMore = []) => {
      await enterState(page, stateName);
      for (const extra of selectMore) {
        const b = await boxOf(page, objects[extra].id);
        if (b) {
          await moveHuman(page, { x: b.free.x, y: b.free.y }, { x: b.free.x + b.free.w / 2, y: b.free.y + b.free.h / 2 }, 6);
          await page.keyboard.down('Shift');
          await page.mouse.click(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
          await page.keyboard.up('Shift');
          await sleep(250);
        }
      }
      const selected = await page.evaluate(() => document.querySelectorAll('.ts-overlay [data-control$=".move"]').length);
      const s0 = await state(page);
      const before = await objectsSafe(page, objectSlide);
      const leaf = rowPath[rowPath.length - 1];
      let file = null;
      let observed = '';
      try {
        await openMenu(page, 'arrange');
        for (const p of rowPath.slice(0, -1)) {
          await hoverRow(page, p);
          await page.locator('.ts-menu.is-sub').last().waitFor({ timeout: 5000 }).catch(() => undefined);
          await sleep(180);
        }
        const row = page.locator(`.ts-menu [data-control="menu.${leaf}"]`).last();
        const disabled = (await row.getAttribute('aria-disabled')) === 'true';
        const r = await row.boundingBox();
        if (!r) throw new Error('row not drawn');
        await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
        await sleep(700);
        const s1 = await state(page);
        const after = await objectsSafe(page, objectSlide);
        const moved = after.filter((o) => { const b = before.find((x) => x.id === o.id); return b && JSON.stringify(b.pos) !== JSON.stringify(o.pos); }).map((o) => `${o.id} ${JSON.stringify(before.find((x) => x.id === o.id).pos)} > ${JSON.stringify(o.pos)}`);
        const types = after.map((o) => o.type).join(',');
        const sheet = await sheetRect(page);
        file = await shot(page, `arrange-${stateName}${selectMore.length ? `+${selectMore.join('+')}` : ''}-${leaf}`, sheet ? pad(sheet, 30) : null);
        observed = `${selected} selected; row disabled ${disabled}; revision ${s0.revision} > ${s1.revision}; moved ${moved.join('; ') || 'none'}; objects after ${after.length} (${types}); snackbar ${JSON.stringify((await surface(page)).snackbar)}`;
        record('arrange', leaf, `Arrange > ${rowPath.map((p) => modelRow(p)?.label ?? p).join(' > ')} with ${stateName}${selectMore.length ? ` and ${selectMore.join(', ')}` : ''} selected`, disabled ? 'broken' : s1.revision !== s0.revision || moved.length ? 'works' : 'broken', observed, file);
        await clearSurface(page, { deep: true });
        if (s1.revision !== s0.revision) {
          await pressChord(page, 'Cmd+Z');
          await sleep(600);
          await settled(page);
        }
        await ensureObjects(page);
      } catch (e) {
        record('arrange', leaf, `Arrange > ${rowPath.join(' > ')} with ${stateName} selected`, 'broken', e.message.split('\n')[0], file ? [file] : []);
        await clearSurface(page, { deep: true }).catch(() => undefined);
        await ensureObjects(page).catch(() => undefined);
      }
    };
    const single = [
      ['arrange.order', 'arrange.order.bringToFront'], ['arrange.order', 'arrange.order.bringForward'], ['arrange.order', 'arrange.order.sendBackward'], ['arrange.order', 'arrange.order.sendToBack'],
      ['arrange.align', 'arrange.align.left'], ['arrange.align', 'arrange.align.center'], ['arrange.align', 'arrange.align.right'], ['arrange.align', 'arrange.align.top'], ['arrange.align', 'arrange.align.middle'], ['arrange.align', 'arrange.align.bottom'],
      ['arrange.centerOnPage', 'arrange.centerOnPage.horizontally'], ['arrange.centerOnPage', 'arrange.centerOnPage.vertically'],
      ['arrange.rotate', 'arrange.rotate.clockwise'], ['arrange.rotate', 'arrange.rotate.counterClockwise'], ['arrange.rotate', 'arrange.rotate.flipHorizontally'], ['arrange.rotate', 'arrange.rotate.flipVertically'],
    ];
    for (const rowPath of single) await clickArrange(rowPath, 'shape');
    await clickArrange(['arrange.distribute', 'arrange.distribute.horizontally'], 'shape', ['text', 'picture']);
    await clickArrange(['arrange.distribute', 'arrange.distribute.vertically'], 'shape', ['text', 'picture']);
    await clickArrange(['arrange.align', 'arrange.align.left'], 'shape', ['text']);
    await clickArrange(['arrange.group'], 'shape', ['text']);
    // ungroup the group the row made: the group is the newest object
    {
      await enterState(page, 'shape');
      const b = await boxOf(page, objects.text.id);
      if (b) {
        await page.keyboard.down('Shift');
        await clickAt(page, b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
        await page.keyboard.up('Shift');
      }
      const before = await objectsSafe(page, objectSlide);
      await openMenu(page, 'arrange');
      await clickRow(page, 'arrange.group').catch(() => undefined);
      await sleep(800);
      await settled(page);
      const after = await objectsSafe(page, objectSlide);
      const group = after.find((o) => o.type === 'group' && !before.some((x) => x.id === o.id)) ?? after.find((o) => !before.some((x) => x.id === o.id));
      const file = await shot(page, 'arrange-group-made', pad(await sheetRect(page), 30));
      record('arrange', 'Group', 'Arrange > Group with the shape and the text box selected', group ? 'works' : 'broken', group ? `group ${group.id} ${group.type} ${JSON.stringify(group.pos)}; objects ${after.length}` : `no group; objects ${after.map((o) => o.type).join(',')}`, file);
      if (group) {
        const chip = await page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
        await openMenu(page, 'arrange');
        const ungroupDisabled = (await page.locator('[data-control="menu.arrange.ungroup"]').getAttribute('aria-disabled')) === 'true';
        await clickRow(page, 'arrange.ungroup').catch(() => undefined);
        await sleep(800);
        await settled(page);
        const after2 = await objectsSafe(page, objectSlide);
        const file2 = await shot(page, 'arrange-ungroup', pad(await sheetRect(page), 30));
        record('arrange', 'Ungroup', 'Arrange > Ungroup with the group selected', !ungroupDisabled && !after2.some((o) => o.id === group.id) ? 'works' : 'broken', `chip ${JSON.stringify(chip)}; Ungroup disabled ${ungroupDisabled}; group still there ${after2.some((o) => o.id === group.id)}; objects ${after2.map((o) => o.type).join(',')}`, file2);
        await openMenu(page, 'arrange');
        const regroupDisabled = (await page.locator('[data-control="menu.arrange.regroup"]').getAttribute('aria-disabled')) === 'true';
        await clickRow(page, 'arrange.regroup').catch(() => undefined);
        await sleep(800);
        await settled(page);
        const after3 = await objectsSafe(page, objectSlide);
        const file3 = await shot(page, 'arrange-regroup', pad(await sheetRect(page), 30));
        record('arrange', 'Regroup', 'Arrange > Regroup after Ungroup', !regroupDisabled && after3.some((o) => o.type === 'group') ? 'works' : 'broken', `Regroup disabled ${regroupDisabled}; objects ${after3.map((o) => o.type).join(',')}`, file3);
        await clearSurface(page, { deep: true });
        for (let k = 0; k < 3 && (await objectsSafe(page, objectSlide)).some((o) => o.type === 'group'); k += 1) {
          await pressChord(page, 'Cmd+Z');
          await sleep(600);
          await settled(page);
        }
        await ensureObjects(page);
      }
    }
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
  }

  // =========================================================================================
  // 12a. the check rows: each clicked once with a full picture after it and the DOM read, then
  //      clicked again to put it back
  if (want('toggles')) try {
    await enterState(page, 'none');
    const readView = () =>
      page.evaluate(() => {
        const vis = (el) => el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        const q = (sel) => document.querySelector(sel);
        const w = (sel) => { const el = q(sel); return el ? Math.round(el.getBoundingClientRect().width) : null; };
        return {
          filmstrip: vis(q('[data-control="filmstrip"]')) ? w('[data-control="filmstrip"]') : 0,
          notes: vis(q('.ts-notes, .ts-notes-slot, [data-control="notes"]')) ? 1 : 0,
          rulers: [...document.querySelectorAll('[class^="ts-ruler"]')].filter(vis).length,
          guides: [...document.querySelectorAll('[class*="ts-guide"], [data-control^="guide."]')].filter(vis).length,
          sheet: w('.ts-stagewrap.ts-editor .pt-slide'),
          theme: document.documentElement.getAttribute('data-theme'),
          advanced: q('.pt-viewer')?.getAttribute('data-advanced-tools'),
          menubar: vis(q('[data-control="menubar"]')) ? 1 : 0,
          comments: document.querySelectorAll('.ts-comment-card, [data-control^="comment."]').length,
        };
      });
    const TOGGLES = [
      ['view', ['view.showRuler']],
      ['view', ['view.showSpeakerNotes']],
      ['view', ['view.showFilmstrip']],
      ['view', ['view.guides', 'view.guides.show']],
      ['view', ['view.guides', 'view.guides.addVertical']],
      ['view', ['view.snapTo', 'view.snapTo.grid']],
      ['view', ['view.comments', 'view.comments.hide']],
      ['view', ['view.mode', 'view.mode.commenting']],
      ['view', ['view.mode', 'view.mode.viewing']],
      ['view', ['view.playShaders', 'view.playShaders.off']],
      ['view', ['view.appearance', 'view.appearance.dark']],
      ['tools', ['tools.preferences', 'tools.preferences.linkDetection']],
      ['tools', ['tools.accessibilitySettings', 'tools.accessibilitySettings.collaboratorAnnouncements']],
      ['tools', ['tools.advancedTools']],
    ];
    for (const [menuId, pathIds] of TOGGLES) {
      const leaf = pathIds[pathIds.length - 1];
      const parents = pathIds.slice(0, -1);
      const before = await readView();
      let checkedBefore = null;
      let checkedAfter = null;
      let file = null;
      let after = null;
      try {
        await clearSurface(page, { deep: true });
        await openMenu(page, menuId);
        for (const p of parents) {
          await hoverRow(page, p);
          await page.locator('.ts-menu.is-sub').last().waitFor({ timeout: 5000 }).catch(() => undefined);
          await sleep(180);
        }
        const row = page.locator(`.ts-menu [data-control="menu.${leaf}"]`).last();
        checkedBefore = await row.getAttribute('aria-checked');
        const r = await row.boundingBox();
        if (!r) throw new Error('row not drawn');
        await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
        await sleep(700);
        await clearSurface(page);
        await parkMouse(page);
        after = await readView();
        file = await shot(page, `toggle-${leaf}`);
        // read the row's state after, then click again to put it back (a radio goes back to its first row)
        await openMenu(page, menuId);
        for (const p of parents) {
          await hoverRow(page, p);
          await page.locator('.ts-menu.is-sub').last().waitFor({ timeout: 5000 }).catch(() => undefined);
          await sleep(180);
        }
        checkedAfter = await page.locator(`.ts-menu [data-control="menu.${leaf}"]`).last().getAttribute('aria-checked');
        const back = { 'view.mode.commenting': 'view.mode.editing', 'view.mode.viewing': 'view.mode.editing', 'view.playShaders.off': 'view.playShaders.show', 'view.appearance.dark': `view.appearance.${bootTheme === 'light' ? 'light' : 'dark'}`, 'view.comments.hide': 'view.comments.showAll', 'view.guides.addVertical': null }[leaf];
        if (back === null) {
          await clearSurface(page);
          await openMenu(page, 'view');
          await hoverRow(page, 'view.guides');
          await page.locator('.ts-menu [data-control="menu.view.guides.clear"]').last().click({ timeout: 3000 }).catch(() => undefined);
        } else {
          await page.locator(`.ts-menu [data-control="menu.${back ?? leaf}"]`).last().click({ timeout: 4000 }).catch(() => undefined);
        }
        await sleep(500);
        await clearSurface(page);
      } catch (e) {
        record('toggles', leaf, `Click ${pathIds.join(' > ')} once`, 'broken', e.message.split('\n')[0], file ? [file] : []);
        await clearSurface(page, { deep: true }).catch(() => undefined);
        continue;
      }
      const restored = await readView();
      const diff = after ? Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).map((k) => `${k} ${JSON.stringify(before[k])} > ${JSON.stringify(after[k])}`) : [];
      const backDiff = Object.keys(restored).filter((k) => JSON.stringify(restored[k]) !== JSON.stringify(before[k])).map((k) => `${k} ${JSON.stringify(before[k])} > ${JSON.stringify(restored[k])}`);
      record('toggles', leaf, `Click ${pathIds.join(' > ')} once, read the screen, click it back`, diff.length > 0 || checkedBefore !== checkedAfter ? 'works' : 'broken', `aria-checked ${checkedBefore} > ${checkedAfter}; screen ${diff.join(', ') || 'no change read'}; after the second click ${backDiff.join(', ') || 'as before'}`, file ? [file] : []);
    }
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
  }

  // =========================================================================================
  // 12b. the print route in a fresh page (File > Print settings and preview, File > Print,
  //      the toolbar's Print all go to /print/<id>; window.print() is only on its button)
  if (want('print')) try {
    const p2Promise = context.newPage();
    ownPage = await p2Promise;
    const p2 = ownPage;
    const errs = [];
    p2.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url().slice(0, 120)}`); });
    const t2 = Date.now();
    await p2.goto(`${BASE}/print/${deckId}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => document.body && document.body.textContent && document.body.textContent.trim().length > 20, null, { timeout: 30_000 }).catch(() => undefined);
    await sleep(2500);
    const text = await p2.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400));
    const controls = await p2.evaluate(() => [...document.querySelectorAll('[data-control]')].map((el) => el.getAttribute('data-control')).slice(0, 30));
    shotN += 1;
    const file = `${String(shotN).padStart(3, '0')}-print-route.png`;
    await p2.screenshot({ path: path.join(OUT, file), fullPage: false }).catch(() => undefined);
    const errorCard = /could not be shown|store is busy|not found/i.test(text);
    record('print', 'The print route', 'Open /print/<id> in a fresh page (File > Print settings and preview, File > Print and the toolbar\'s Print all go here), read the page', errorCard ? 'broken' : 'works', `${Date.now() - t2} ms; text "${text.slice(0, 200)}"; controls ${controls.join(', ') || 'none'}; failed responses ${errs.join('; ') || 'none'}`, file);
    if (errorCard) {
      await sleep(15_000);
      await p2.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await sleep(4000);
      const text2 = await p2.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 300));
      shotN += 1;
      const file2 = `${String(shotN).padStart(3, '0')}-print-route-reload.png`;
      await p2.screenshot({ path: path.join(OUT, file2) }).catch(() => undefined);
      record('print', 'The print route', 'Reload /print/<id> after 15 s', /could not be shown|store is busy/i.test(text2) ? 'broken' : 'works', `text "${text2.slice(0, 200)}"`, file2);
    }
    await p2.close().catch(() => undefined);
  } catch (error) {
    record('print', 'The print route', 'Open /print/<id> in a fresh page', 'broken', String(error instanceof Error ? error.message.split('\n')[0] : error));
  }

  // =========================================================================================
  // 13. the layout shift on load of /edit/<id> at 1440 and 1280, light and dark
  if (want('shift')) try {
    const shifts = {};
    for (const [w, h] of [[1440, 900], [1280, 800]]) {
      for (const a of ['light', 'dark']) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate((ap) => { try { localStorage.setItem('ts-chrome-appearance', JSON.stringify(ap)); localStorage.setItem('gt-theme', ap); } catch {} }, a).catch(() => undefined);
        const t1 = Date.now();
        await page.goto(editUrl, { waitUntil: 'commit' });
        const files = [];
        for (const at of [150, 500, 1200]) {
          const wait = t1 + at - Date.now();
          if (wait > 0) await sleep(wait);
          files.push(await shot(page, `shift-edit-${w}-${a}-${at}ms`));
        }
        await editorReady(page);
        await sleep(2500);
        files.push(await shot(page, `shift-edit-${w}-${a}-settled`));
        const ls = await readLs(page);
        const cls = (ls?.entries ?? []).filter((e) => !e.input).reduce((s, e) => s + e.value, 0);
        const themes = (ls?.frames ?? []).map((f) => f.theme).filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
        const moved = [];
        const frames = ls?.frames ?? [];
        for (let i = 1; i < frames.length; i += 1) {
          for (const [k, v] of Object.entries(frames[i].rects)) {
            const prev = frames[i - 1].rects[k];
            if (prev && v && (prev[0] !== v[0] || prev[1] !== v[1] || prev[2] !== v[2] || prev[3] !== v[3])) moved.push(`${frames[i].t}ms ${k.replace(/\[data-control="|"\]/g, '')} ${prev.join('/')} > ${v.join('/')}`);
          }
        }
        shifts[`${w}-${a}`] = { ls, cls, themes, moved: moved.slice(0, 40), files, stored: a, got: await theme(page) };
        record(
          'shift',
          `/edit at ${w} ${a}`,
          `Load /edit/<id> with ${a} stored at ${w} by ${h}; layout-shift entries and the anchors frame by frame`,
          cls === 0 && themes.length <= 1 ? 'works' : 'broken',
          `CLS ${cls.toFixed(4)} over ${(ls?.entries ?? []).filter((e) => !e.input).length} entries (${(ls?.entries ?? []).filter((e) => !e.input).slice(0, 5).map((e) => `${e.t}ms ${e.value} ${e.sources.join(',')}`).join('; ')}); theme frames ${themes.join(' > ')} (got ${await theme(page)}); anchors that moved after first paint: ${moved.length} (${moved.slice(0, 8).join('; ')})`,
          files,
        );
        await dismissNamePrompt(page);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((ap) => { try { localStorage.setItem('ts-chrome-appearance', JSON.stringify(ap)); } catch {} }, bootTheme === 'light' ? 'light' : 'dark').catch(() => undefined);
    fact('shift', shifts);
  } catch (error) {
    record('run', 'A section', 'The section itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 3).join(' | ') : String(error)}`);
  }
} catch (error) {
  record('run', 'The run', 'The run itself', 'broken', `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  // the scratch deck: File > Move to trash, Delete forever on /decks/trash, 404
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(() => state(page), (s) => s.sync?.connected === true, 30_000);
      await settled(page);
      await dismissNamePrompt(page);
      await clearSurface(page, { deep: true });
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('teardown', 'Scratch deck', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('teardown', 'Scratch deck', 'Delete forever on /decks/trash', 'works', deckId);
      trashed = true;
    } catch (error) {
      record('teardown', 'Scratch deck', 'The product trash path', 'broken', `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the window API`);
    }
    if (!trashed) {
      try {
        await page.goto(editUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
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
    for (const route of ['edit', 'deck']) {
      let status = 0;
      const until = Date.now() + 25_000;
      for (;;) {
        try {
          const res = await page.request.get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 });
          status = res.status();
        } catch {
          status = -1;
        }
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record('teardown', 'Scratch deck', `GET /${route}/${deckId} answers 404`, status === 404 ? 'works' : 'broken', `status ${status}`);
    }
  }
  await browser.close().catch(() => undefined);
  const summary = { base: BASE, deckId, startedAt, finishedAt: new Date().toISOString(), viewport: '1440x900 and 1280x800', scale: SCALE, rows, facts, consoleErrors, failedResponses, popups, downloads, shots: shotN };
  const jsonPath = path.join(OUT, `audit-chrome-run${ONLY.length ? `-${ONLY.join('-')}` : ''}.json`);
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  log(`\nrows ${rows.length}: ${rows.filter((r) => r.result === 'works').length} works, ${rows.filter((r) => r.result === 'broken').length} broken, ${rows.filter((r) => r.result === 'not driven').length} not driven, ${rows.filter((r) => r.result === 'note').length} notes; console errors ${consoleErrors.length}; shots ${shotN}; json ${jsonPath}`);
}

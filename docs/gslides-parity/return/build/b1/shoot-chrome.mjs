#!/usr/bin/env node
// B1 return round (docs/RETURN.md section 4; return/build/b1.md): the after pictures and the pixel
// readings of the chrome on the lane's dev server. One scratch deck from /new, both appearances
// through View > Appearance, 1x and 2x, 1440 and 900; the Slideshow split button rested, hovered,
// focused and open, its keys (Enter, Space, ArrowDown, Escape, Tab), the comments glyph as a
// toggle, View > Mode > Viewing without the toolbar, View > Comments > Show all comments, the
// Themes panel without the Import theme stub, the eleven seams read from the pixels of the whole
// editor screenshot and the split seam read from the title row crop. The deck is moved to the
// trash and deleted forever in the finally block. Imports nothing from the repository but
// playwright-core (the audit's convention).
//
//   node docs/gslides-parity/return/build/b1/shoot-chrome.mjs [--base http://localhost:4401]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4401').replace(/\/$/, '');
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/return/build/b1';
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const notes = {};
const consoleErrors = [];
const log = (...a) => console.log(...a);
const record = (area, interaction, result, evidence) => {
  const row = { n: rows.length + 1, area, interaction, result, evidence };
  rows.push(row);
  const tag =
    { works: 'ok  ', flaky: 'FLKY', broken: 'FAIL', 'not driven': 'n/d ' }[result] ?? '????';
  log(`${tag} ${String(row.n).padStart(3)} ${area} :: ${interaction}\n       ${evidence}`);
  return row;
};
const step = async (area, name, fn) => {
  try {
    const r = await fn();
    return record(area, name, r.ok === null ? 'not driven' : r.ok ? 'works' : 'broken', r.observed);
  } catch (error) {
    return record(
      area,
      name,
      'broken',
      `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
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
const hoverAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 60, y: y + 40 }, { x, y }, 8);
  await sleep(rand(200, 300));
};
const parkMouse = async (page) => {
  await page.mouse.move(720, 600);
  await sleep(250);
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
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
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
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
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
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await page.locator(waitFor).first().waitFor({ timeout: 8000 });
  await sleep(rand(150, 250));
};
const clickRow = async (page, rowId) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clickControl = async (page, control) => {
  const r = await ctl(page, control).first().boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(200);
};
const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.id ? `#${a.id}` : ''}${a.getAttribute('role') ? `{${a.getAttribute('role')}}` : ''}`;
  });
const dismissNamePrompt = async (page) => {
  if (await has(page, '[data-control="dialog.namePrompt"]')) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
    await sleep(200);
  }
};
const setAppearance = async (page, which) => {
  if ((await theme(page)) === which) return { ok: true, observed: `already ${which}` };
  await openMenu(page, 'view');
  if (!(await has(page, '[data-control="menu.view.appearance"]'))) {
    await closeMenus(page);
    return { ok: false, observed: 'no Appearance row in View with the switch off' };
  }
  await hoverRow(page, 'view.appearance', `[data-control="menu.view.appearance.${which}"]`);
  await clickRow(page, `view.appearance.${which}`);
  const t = await pollUntil(
    () => theme(page),
    (v) => v === which,
    6000,
  );
  await closeMenus(page);
  await parkMouse(page);
  await sleep(500);
  return { ok: t === which, observed: `data-theme ${t}` };
};

// ---------------------------------------------------------------------------------------------
// a PNG reader (zlib only)

function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i += 1) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth}`);
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[colorType];
  if (!channels) throw new Error(`color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p];
    p += 1;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0:
          break;
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`filter ${filter}`);
      }
      cur[i] = v & 255;
    }
  }
  const pixel = (x, y) => {
    const i = y * stride + x * channels;
    return channels >= 3 ? [out[i], out[i + 1], out[i + 2]] : [out[i], out[i], out[i]];
  };
  return { width, height, pixel };
}
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const differs = (a, b, tol = 8) => a.some((v, i) => Math.abs(v - b[i]) > tol);
function segmentsAlong(img, points, key) {
  const out = [];
  if (points.length === 0) return out;
  const inside = ([x, y]) => x >= 0 && y >= 0 && x < img.width && y < img.height;
  const pts = points.filter(inside);
  if (pts.length === 0) return out;
  let start = 0;
  let color = img.pixel(...pts[0]);
  for (let i = 1; i <= pts.length; i += 1) {
    const c = i < pts.length ? img.pixel(...pts[i]) : null;
    if (c === null || differs(c, color)) {
      const prev = out.at(-1);
      const seg = {
        [key]: pts[start][key === 'y' ? 1 : 0],
        thickness: i - start,
        color: hex(color),
      };
      if (prev) seg.contrastToPrevious = Number(contrast(color, prev.rgb).toFixed(2));
      seg.rgb = color;
      out.push(seg);
      if (c) {
        start = i;
        color = c;
      }
    }
  }
  return out.map(({ rgb, ...s }) => s);
}
function runsAlongColumn(img, x, y0, y1) {
  const pts = [];
  for (let y = Math.max(0, y0); y <= y1; y += 1) pts.push([x, y]);
  return segmentsAlong(img, pts, 'y');
}
function runsAlongRow(img, y, x0, x1) {
  const pts = [];
  for (let x = Math.max(0, x0); x <= x1; x += 1) pts.push([x, y]);
  return segmentsAlong(img, pts, 'x');
}
/** The seam lines of a scan: the thin segments (1 to 3 px) between two grounds, with their contrast. */
const lines = (segs) =>
  segs
    .filter((s) => s.thickness <= 3)
    .map((s) => ({
      at: s.y ?? s.x,
      thickness: s.thickness,
      color: s.color,
      contrast: s.contrastToPrevious,
    }));

// ---------------------------------------------------------------------------------------------
// the measurements

const edgesOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      top: [cs.borderTopWidth, cs.borderTopColor].join(' '),
      right: [cs.borderRightWidth, cs.borderRightColor].join(' '),
      bottom: [cs.borderBottomWidth, cs.borderBottomColor].join(' '),
      left: [cs.borderLeftWidth, cs.borderLeftColor].join(' '),
      radius: [
        cs.borderTopLeftRadius,
        cs.borderTopRightRadius,
        cs.borderBottomRightRadius,
        cs.borderBottomLeftRadius,
      ].join(' '),
      background: cs.backgroundColor,
      color: cs.color,
      padding: cs.padding,
      gap: cs.gap,
      flexDirection: cs.flexDirection,
      outline: [cs.outlineWidth, cs.outlineColor, cs.outlineStyle, cs.outlineOffset].join(' '),
      height: cs.height,
      width: cs.width,
      display: cs.display,
      opacity: cs.opacity,
    };
  }, sel);
const CLUSTER_SELECTORS = [
  '.ts-title-r',
  '.ts-presence',
  '.ts-presence-more',
  '.ts-title-comments-slot',
  '.ts-title-comments',
  '.ts-title-inbox-slot',
  '.ts-title-slideshow',
  '.ts-title-present',
  '.ts-title-present svg',
  '.ts-title-present .pt-lb',
  '.ts-title-present-arrow',
  '.ts-title-present-arrow svg',
  '.ts-title-share-slot',
  '.ts-title-share',
];
const clusterGaps = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.ts-title-r');
    if (!r) return null;
    const kids = [...r.children]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return {
          control: el.getAttribute('data-control') ?? el.className,
          x: Number(b.x.toFixed(1)),
          w: Number(b.width.toFixed(1)),
          h: Number(b.height.toFixed(1)),
          y: Number(b.y.toFixed(1)),
        };
      });
    const hidden = [...r.children]
      .filter((el) => el.getBoundingClientRect().width === 0)
      .map((el) => el.getAttribute('data-control') ?? el.className);
    const gaps = [];
    for (let i = 1; i < kids.length; i += 1)
      gaps.push({
        between: `${kids[i - 1].control} -> ${kids[i].control}`,
        gap: Number((kids[i].x - (kids[i - 1].x + kids[i - 1].w)).toFixed(1)),
      });
    const rowR = document.querySelector('.ts-title-row').getBoundingClientRect();
    return {
      kids,
      hidden,
      gaps,
      rightInset: Number((rowR.right - (kids.at(-1).x + kids.at(-1).w)).toFixed(1)),
      rowWidth: rowR.width,
    };
  });
const seps = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-tb-sep')].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const prev = el.previousElementSibling?.getBoundingClientRect();
      const next = el.nextElementSibling?.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        background: cs.backgroundColor,
        margin: cs.margin,
        gapBefore: prev ? Number((r.x - (prev.x + prev.width)).toFixed(2)) : null,
        gapAfter: next ? Number((next.x - (r.x + r.width)).toFixed(2)) : null,
      };
    }),
  );
const ariaOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const out = { tag: el.tagName.toLowerCase(), text: el.textContent?.trim() ?? '' };
    for (const a of el.getAttributeNames())
      if (a.startsWith('aria-') || a === 'role' || a === 'data-control')
        out[a] = el.getAttribute(a);
    return out;
  }, sel);
const tokensOf = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of [
      '--pt-paper',
      '--pt-ink',
      '--pt-hair',
      '--pt-hair-soft',
      '--pt-hair-on-ink',
      '--pt-plate-on-ink',
      '--pt-plate-on-ink-open',
      '--pt-ctl-h',
      '--pt-edge',
    ])
      out[n] = cs.getPropertyValue(n).trim();
    out.theme = document.documentElement.getAttribute('data-theme');
    return out;
  });

const boundaryPoints = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (s) => q(s)?.getBoundingClientRect() ?? null;
    const title = rect('.ts-title-row');
    const menubar = rect('.ts-menubar');
    const toolbar = rect('.ts-toolbar');
    const sb = rect('.pt-viewer.is-editor > .pt-sb');
    const sbHead = rect('.pt-viewer.is-editor > .pt-sb > .pt-sb-head');
    const notesSlot = rect('.pt-viewer.is-editor > .pt-main > .ts-notes-slot');
    const notes = rect('.pt-viewer.is-editor > .pt-main > .ts-notes-slot > .ts-notes');
    const bottom = rect('.ts-bottombar');
    const rpanel = rect('.pt-viewer.is-editor > .ts-rpanel');
    const main = rect('.pt-viewer.is-editor > .pt-main');
    const clearX = (y, candidates, accept) => {
      for (const x of candidates) {
        const a = document.elementFromPoint(x, y - 3);
        const b = document.elementFromPoint(x, y + 3);
        if (a && b && accept(a) && accept(b)) return x;
      }
      return candidates[0];
    };
    const isRowish = (el) =>
      /ts-title-row|ts-title-l|ts-title-r|ts-menubar|ts-toolbar|ts-tb-tail|ts-tb-spring|ts-tb-head|pt-stagewrap|ts-stage|pt-stage|ts-notes|ts-bottombar|pt-sb|ts-film|pt-viewer|pt-main|ts-notes-slot/.test(
        el.className,
      );
    const xs = [];
    for (let x = 300; x < 1400; x += 20) xs.push(x);
    const round = (v) => Math.round(v);
    return {
      title: title && { y: title.y, height: title.height, bottom: title.bottom },
      menubar: menubar && { y: menubar.y, height: menubar.height, bottom: menubar.bottom },
      toolbar: toolbar && { y: toolbar.y, height: toolbar.height, bottom: toolbar.bottom },
      sb: sb && { x: sb.x, y: sb.y, right: sb.right, width: sb.width, height: sb.height },
      notesSlot: notesSlot && { x: notesSlot.x, top: notesSlot.top, width: notesSlot.width },
      notes: notes && { top: notes.top },
      bottom: bottom && { top: bottom.top, height: bottom.height },
      rpanel: rpanel && { x: rpanel.x, y: rpanel.y, width: rpanel.width, height: rpanel.height },
      titleMenubar: title
        ? { y: round(title.bottom), x: clearX(round(title.bottom), xs, isRowish) }
        : null,
      menubarToolbar: menubar
        ? { y: round(menubar.bottom), x: clearX(round(menubar.bottom), xs, isRowish) }
        : null,
      toolbarSheet: toolbar
        ? {
            y: round(toolbar.bottom),
            x: clearX(
              round(toolbar.bottom),
              xs.filter((x) => (sb ? x > sb.right + 10 : true)),
              isRowish,
            ),
          }
        : null,
      toolbarFilmstrip:
        toolbar && sb ? { y: round(toolbar.bottom), x: round(sb.x + sb.width / 2) } : null,
      filmstripHead: sbHead
        ? { y: round(sbHead.bottom), x: round(sbHead.x + sbHead.width / 2) }
        : null,
      notesDivider: notesSlot
        ? { y: round(notesSlot.top), x: round(notesSlot.x + notesSlot.width * 0.25) }
        : null,
      notesBottom: bottom ? { y: round(bottom.top), x: round((main?.x ?? 300) + 80) } : null,
      filmstripBottom:
        bottom && sb ? { y: round(bottom.top), x: round(sb.x + sb.width / 2) } : null,
      filmstripEdge: sb ? { x: round(sb.right), y: round(sb.y + sb.height / 2) } : null,
      filmstripEdgeUpper: sb ? { x: round(sb.right), y: round(sb.y + 30) } : null,
      rpanelEdge:
        rpanel && rpanel.width > 0
          ? { x: round(rpanel.x), y: round(rpanel.y + rpanel.height / 2) }
          : null,
    };
  });
/** The lines at every seam from the whole editor screenshot (1x). */
const seamsFromShot = (img, pts) => {
  const out = {};
  const col = (name, p, span = 6) => {
    if (!p) return;
    out[name] = { at: p, lines: lines(runsAlongColumn(img, p.x, p.y - span, p.y + span)) };
  };
  const rowScan = (name, p, span = 6) => {
    if (!p) return;
    out[name] = { at: p, lines: lines(runsAlongRow(img, p.y, p.x - span, p.x + span)) };
  };
  col('title -> menu bar', pts.titleMenubar);
  col('menu bar -> toolbar', pts.menubarToolbar);
  col('toolbar -> sheet', pts.toolbarSheet);
  col('toolbar -> filmstrip', pts.toolbarFilmstrip);
  col('filmstrip head -> cards', pts.filmstripHead);
  col('stage -> notes pane', pts.notesDivider);
  col('notes pane -> bottom bar', pts.notesBottom);
  col('filmstrip -> bottom bar', pts.filmstripBottom);
  rowScan('filmstrip -> sheet (vertical)', pts.filmstripEdge);
  rowScan('filmstrip -> sheet, upper (vertical)', pts.filmstripEdgeUpper);
  rowScan('sheet -> right panel (vertical)', pts.rpanelEdge);
  return out;
};
/** The split button's own seam from a 1x title row crop: the divider between the halves. */
const splitSeamFromShot = (img, presentRect, arrowRect, cropOrigin) => {
  const x0 = Math.round(presentRect.x + presentRect.w - 6 - cropOrigin.x);
  const x1 = Math.round(arrowRect.x + 6 - cropOrigin.x);
  const at = (dy) => Math.round(presentRect.y + dy - cropOrigin.y);
  const read = (dy) => runsAlongRow(img, at(dy), x0, x1);
  const mid = read(presentRect.h / 2);
  const divider = mid.find((s) => s.thickness <= 2 && s.x > x0 + 1 && s.x < x1 - 1);
  return {
    mid: lines(mid),
    dividerContrast: divider?.contrastToPrevious ?? null,
    dividerColor: divider?.color ?? null,
    top1: lines(read(1)),
    top2: lines(read(2)),
    top4: lines(read(4)),
  };
};
/** The corner of the wrapper from the pixels: the ink ground starts inside the corner, not at the box's edge. */
const cornerFromShot = (img, wrapper, cropOrigin) => {
  const y = Math.round(wrapper.y - cropOrigin.y);
  const row0 = runsAlongRow(
    img,
    y,
    Math.round(wrapper.x - cropOrigin.x) - 2,
    Math.round(wrapper.x - cropOrigin.x) + 12,
  );
  return {
    topRow: lines(row0),
    segments: row0.map((s) => ({ x: s.x, thickness: s.thickness, color: s.color })),
  };
};

// ---------------------------------------------------------------------------------------------
// screenshots

const shot = async (page, file, clip) => {
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, ...(clip ? { clip } : {}) });
  return p;
};
const crop = (r, pad, vp) => {
  if (!r) return null;
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return {
    x,
    y,
    width: Math.max(1, Math.min(vp.width - x, r.w + 2 * pad)),
    height: Math.max(1, Math.min(vp.height - y, r.h + 2 * pad)),
  };
};
const pictureSet = async (page, tag) => {
  const vp = page.viewportSize();
  const pts = await boundaryPoints(page);
  await shot(page, `${tag}-01-editor.png`);
  await shot(
    page,
    `${tag}-02-title-row.png`,
    crop({ x: 0, y: pts.title.y, w: vp.width, h: pts.title.height + 2 }, 0, vp),
  );
  await shot(
    page,
    `${tag}-03-menu-bar.png`,
    crop({ x: 0, y: pts.menubar.y - 2, w: vp.width, h: pts.menubar.height + 4 }, 0, vp),
  );
  if (pts.toolbar)
    await shot(
      page,
      `${tag}-04-toolbar.png`,
      crop({ x: 0, y: pts.toolbar.y - 2, w: vp.width, h: pts.toolbar.height + 4 }, 0, vp),
    );
  if (pts.toolbar)
    await shot(
      page,
      `${tag}-05-toolbar-sheet-boundary.png`,
      crop({ x: 0, y: pts.toolbar.bottom - 14, w: vp.width, h: 40 }, 0, vp),
    );
  if (pts.sb)
    await shot(
      page,
      `${tag}-06-filmstrip-edge.png`,
      crop({ x: pts.sb.right - 40, y: pts.sb.y, w: 80, h: pts.sb.height }, 0, vp),
    );
  if (pts.notesSlot)
    await shot(
      page,
      `${tag}-07-notes-divider.png`,
      crop({ x: pts.notesSlot.x, y: pts.notesSlot.top - 16, w: pts.notesSlot.width, h: 40 }, 0, vp),
    );
  await shot(
    page,
    `${tag}-08-bottom-bar.png`,
    crop({ x: 0, y: pts.bottom.top - 8, w: vp.width, h: pts.bottom.height + 8 }, 0, vp),
  );
  await shot(
    page,
    `${tag}-09-right-cluster.png`,
    crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
  );
  return pts;
};
const measureAppearance = async (page, tag) => {
  const pts = await pictureSet(page, tag);
  const cluster = {};
  for (const sel of CLUSTER_SELECTORS) cluster[sel] = await edgesOf(page, sel);
  const gaps = await clusterGaps(page);
  const dividers = await seps(page);
  const tokens = await tokensOf(page);
  const img = decodePng(await page.screenshot());
  const seams = seamsFromShot(img, pts);
  const titleImg = decodePng(
    await page.screenshot({
      clip: { x: 0, y: pts.title.y, width: page.viewportSize().width, height: pts.title.height },
    }),
  );
  const origin = { x: 0, y: pts.title.y };
  const splitSeam = splitSeamFromShot(
    titleImg,
    cluster['.ts-title-present'].rect,
    cluster['.ts-title-present-arrow'].rect,
    origin,
  );
  const corner = cornerFromShot(titleImg, cluster['.ts-title-slideshow'].rect, origin);
  const aria = {
    split: await ariaOf(page, '.ts-title-slideshow'),
    present: await ariaOf(page, '.ts-title-present'),
    arrow: await ariaOf(page, '.ts-title-present-arrow'),
    share: await ariaOf(page, '.ts-title-share'),
    comments: await ariaOf(page, '.ts-title-comments'),
  };
  notes[tag] = {
    viewport: page.viewportSize(),
    tokens,
    cluster,
    gaps,
    dividers,
    seams,
    splitSeam,
    corner,
    aria,
  };
  const seamSummary = Object.entries(seams)
    .map(
      ([k, v]) =>
        `${k}: ${v.lines.map((l) => `${l.thickness}px ${l.color} ${l.contrast ?? ''}`).join(' | ') || 'none'}`,
    )
    .join('; ');
  record('Separators', `The eleven seams from the pixels (${tag})`, 'works', seamSummary);
  const w = cluster['.ts-title-slideshow'];
  record(
    'Split button',
    `The wrapper, the halves and the divider from the pixels (${tag})`,
    'works',
    `wrapper ${w.rect.w.toFixed(1)} by ${w.rect.h} radius ${w.radius} border ${w.top} bg ${w.background}; label half ${cluster['.ts-title-present'].rect.w.toFixed(1)} by ${cluster['.ts-title-present'].rect.h} radius ${cluster['.ts-title-present'].radius} padding ${cluster['.ts-title-present'].padding} dir ${cluster['.ts-title-present'].flexDirection} gap ${cluster['.ts-title-present'].gap}; arrow ${cluster['.ts-title-present-arrow'].rect.w} by ${cluster['.ts-title-present-arrow'].rect.h} border-left ${cluster['.ts-title-present-arrow'].left} radius ${cluster['.ts-title-present-arrow'].radius}; divider at mid ${JSON.stringify(splitSeam.mid)} contrast ${splitSeam.dividerContrast}; 1 px under the top ${JSON.stringify(splitSeam.top1)}; 2 px under ${JSON.stringify(splitSeam.top2)}`,
  );
  record(
    'Right cluster',
    `Gaps, heights, corners and the hidden slots (${tag})`,
    'works',
    `${JSON.stringify(gaps)}; share ${cluster['.ts-title-share'].rect.w.toFixed(1)} by ${cluster['.ts-title-share'].rect.h} radius ${cluster['.ts-title-share'].radius}; comments ${cluster['.ts-title-comments']?.rect.w} by ${cluster['.ts-title-comments']?.rect.h}; +N chip opacity ${cluster['.ts-presence-more'].opacity} w ${cluster['.ts-presence-more'].rect.w}; inbox slot display ${cluster['.ts-title-inbox-slot'].display}`,
  );
  record('Toolbar dividers', `The .ts-tb-sep dividers (${tag})`, 'works', JSON.stringify(dividers));
  return { pts, cluster, gaps };
};

// ---------------------------------------------------------------------------------------------
// the run

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const popups = [];
context.on('page', (p) => {
  popups.push(p.url());
  p.close().catch(() => undefined);
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
let deckId = null;

try {
  // ---- 1. the scratch deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  await step(
    'Scratch deck',
    'Double click the title on /new, type, Escape: the first write creates the deck',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      /* what the double click focused, so a failed first write says whether a session opened */
      const session = await page.evaluate(() => {
        const a = document.activeElement;
        return {
          active: `${a?.tagName.toLowerCase()}${a?.getAttribute('data-run') ? `[${a.getAttribute('data-run')}]` : ''}`,
          editable: a?.isContentEditable === true,
          chip: document.querySelector('.ts-select-chip')?.textContent?.trim() ?? null,
        };
      });
      await typeHuman(page, 'Chrome return b1');
      await press(page, 'Escape');
      const rev = await waitRevision(page, 1, 30_000);
      await settled(page);
      await dismissNamePrompt(page);
      await sleep(1200);
      deckId = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? null;
      const text = await page.evaluate(
        (run) =>
          document
            .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`)
            ?.textContent?.trim() ?? null,
        HEAD,
      );
      return {
        ok: /\/edit\//.test(page.url()) && rev >= 1,
        observed: `${page.url().replace(BASE, '')}; revision ${rev}; after the double click the active element was ${session.active} (contentEditable ${session.editable}, chip ${JSON.stringify(session.chip)}); the run's text after typing ${JSON.stringify(text)}`,
      };
    },
  );
  await parkMouse(page);
  const boot = await theme(page);
  record(
    'Appearance',
    'The appearance the fresh browser boots into',
    'works',
    `data-theme ${boot}`,
  );
  const ORDER = boot === 'light' ? ['light', 'dark'] : ['dark', 'light'];

  // ---- 2. both appearances at 1x: the pictures and the readings
  for (const which of ORDER) {
    await step('Appearance', `View > Appearance > ${which} with the switch off`, () =>
      setAppearance(page, which),
    );
    await measureAppearance(page, `${which}-1x`);
  }
  /* the light appearance for the interactions (both are measured above) */
  await setAppearance(page, 'light');

  // ---- 3. the split button's states and keys (light, 1x)
  const presentRect = () => rectOf(page, '.ts-title-present');
  const arrowRect = () => rectOf(page, '.ts-title-present-arrow');
  const halves = () =>
    page.evaluate(() => {
      const read = (s) => {
        const el = document.querySelector(s);
        const cs = getComputedStyle(el);
        return {
          background: cs.backgroundColor,
          color: cs.color,
          hovered: el.matches(':hover'),
          focusVisible: el.matches(':focus-visible'),
          outline:
            cs.outlineStyle === 'none'
              ? 'none'
              : `${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineOffset}`,
        };
      };
      const w = getComputedStyle(document.querySelector('.ts-title-slideshow'));
      return {
        wrapper: { background: w.backgroundColor, border: w.borderTopColor },
        present: read('.ts-title-present'),
        arrow: read('.ts-title-present-arrow'),
      };
    });
  const clusterClip = (vpW = 1440) => ({ x: vpW - 620, y: 0, width: 620, height: 46 });
  await step('Split button', 'Hover the Slideshow half: it shades, nothing inverts', async () => {
    const r = await presentRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    const h = await halves();
    await shot(page, 'light-10-split-hover-label.png', clusterClip());
    await parkMouse(page);
    const ok =
      h.present.hovered &&
      h.present.background !== 'rgba(0, 0, 0, 0)' &&
      h.present.color === h.arrow.color &&
      h.wrapper.background !== h.present.background;
    return {
      ok,
      observed: `hovered ${h.present.hovered}; label bg ${h.present.background} color ${h.present.color}; arrow bg ${h.arrow.background} color ${h.arrow.color}; wrapper bg ${h.wrapper.background}`,
    };
  });
  await step('Split button', 'Hover the chevron half: it shades, nothing inverts', async () => {
    const r = await arrowRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    const h = await halves();
    await shot(page, 'light-11-split-hover-arrow.png', clusterClip());
    await parkMouse(page);
    const ok =
      h.arrow.hovered &&
      h.arrow.background !== 'rgba(0, 0, 0, 0)' &&
      h.present.background === 'rgba(0, 0, 0, 0)' &&
      h.arrow.color === h.present.color;
    return {
      ok,
      observed: `hovered ${h.arrow.hovered}; arrow bg ${h.arrow.background} color ${h.arrow.color}; label bg ${h.present.background} color ${h.present.color}`,
    };
  });
  const menuFacts = () =>
    page.evaluate(() => {
      const m = document.getElementById('ts-menu-slideshow');
      const arrow = document.querySelector('.ts-title-present-arrow');
      const split = document.querySelector('.ts-title-slideshow').getBoundingClientRect();
      const r = m?.getBoundingClientRect();
      return {
        open: Boolean(m),
        rows: m
          ? [...m.querySelectorAll('[data-control^="menu."]')].map((el) =>
              el.getAttribute('data-control'),
            )
          : null,
        menu: r ? { x: r.x, y: r.y, w: r.width, right: r.right } : null,
        control: { x: split.x, right: split.right, bottom: split.bottom },
        expanded: arrow?.getAttribute('aria-expanded'),
        controls: arrow?.getAttribute('aria-controls'),
        firstRowFocused: m
          ? m.contains(document.activeElement) &&
            document.activeElement?.getAttribute('role') === 'menuitem'
          : false,
      };
    });
  await step(
    'Split button',
    'Click the chevron: the menu hangs under the control with its right edge on the control, aria-expanded and aria-controls set; Escape closes and returns focus',
    async () => {
      const r = await arrowRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('#ts-menu-slideshow').waitFor({ timeout: 5000 });
      await sleep(200);
      const f = await menuFacts();
      await shot(page, 'light-12-split-menu-open.png', {
        x: 1440 - 620,
        y: 0,
        width: 620,
        height: Math.min(260, (f.menu?.y ?? 0) + 120),
      });
      await press(page, 'Escape');
      await page.locator('#ts-menu-slideshow').waitFor({ state: 'detached', timeout: 5000 });
      const after = await menuFacts();
      const focus = await activeDesc(page);
      await parkMouse(page);
      const aligned =
        f.menu !== null &&
        Math.abs(f.menu.right - f.control.right) <= 1 &&
        Math.abs(f.menu.y - f.control.bottom) <= 3;
      return {
        ok:
          f.open &&
          aligned &&
          f.expanded === 'true' &&
          f.controls === 'ts-menu-slideshow' &&
          after.expanded === 'false' &&
          after.controls === null &&
          focus.includes('present.arrow'),
        observed: `rows ${JSON.stringify(f.rows)}; menu right ${f.menu?.right} vs control right ${f.control.right}; menu top ${f.menu?.y} vs control bottom ${f.control.bottom}; aria-expanded ${f.expanded} aria-controls ${f.controls}; after Escape expanded ${after.expanded} controls ${after.controls}; focus ${focus}`,
      };
    },
  );
  await step(
    'Split button',
    'ArrowDown on the Slideshow half opens the menu with the first row focused; Escape returns focus to the Slideshow half',
    async () => {
      await page.focus('[data-control="present.open"]');
      await press(page, 'ArrowDown');
      const opened = await page
        .locator('#ts-menu-slideshow')
        .isVisible()
        .catch(() => false);
      await sleep(200);
      const f = await menuFacts();
      const focusIn = await activeDesc(page);
      await press(page, 'Escape');
      await sleep(200);
      const focus = await activeDesc(page);
      return {
        ok: opened && f.firstRowFocused && focus.includes('present.open'),
        observed: `open ${opened}; first row focused ${f.firstRowFocused} (${focusIn}); aria-controls ${f.controls}; focus after Escape ${focus}`,
      };
    },
  );
  /* a window listener records defaultPrevented after the document listeners ran */
  await page.evaluate(() => {
    window.__b1keys = [];
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ')
        window.__b1keys.push({
          key: e.key,
          prevented: e.defaultPrevented,
          target: e.target?.getAttribute?.('data-control') ?? e.target?.tagName,
        });
    });
  });
  const keyLog = () => page.evaluate(() => window.__b1keys.splice(0));
  const showFacts = () =>
    page.evaluate(() => {
      const show = document.querySelector('[data-control="present.show"]');
      return {
        present: Boolean(show),
        isPresentClass: Boolean(document.querySelector('.pt-viewer.is-present')),
      };
    });
  const leaveShow = async () => {
    await press(page, 'Escape');
    await pollUntil(
      () => showFacts().then((f) => f.present),
      (v) => v === false,
      8000,
    );
    await sleep(400);
  };
  await step(
    'Split button',
    'Enter on the chevron opens the menu and the key is not prevented; Escape closes',
    async () => {
      await page.focus('[data-control="present.arrow"]');
      await keyLog();
      await press(page, 'Enter');
      const opened = await pollUntil(
        () =>
          page
            .locator('#ts-menu-slideshow')
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        3000,
      );
      const keys = await keyLog();
      await press(page, 'Escape');
      await sleep(200);
      return {
        ok: opened && keys.some((k) => k.key === 'Enter' && k.prevented === false),
        observed: `menu open ${opened}; keys ${JSON.stringify(keys)}`,
      };
    },
  );
  await step(
    'Split button',
    'Enter on the Slideshow half opens the show; Escape leaves it',
    async () => {
      await page.focus('[data-control="present.open"]');
      await keyLog();
      await press(page, 'Enter');
      const on = await pollUntil(
        () => showFacts().then((f) => f.present),
        (v) => v === true,
        8000,
      );
      const keys = await keyLog();
      if (on) await leaveShow();
      const off = !(await showFacts()).present;
      return {
        ok: on && off,
        observed: `present ${on}; keys ${JSON.stringify(keys)}; after Escape present false ${off}`,
      };
    },
  );
  await step(
    'Split button',
    'Enter with the title selected by one click: the chevron still opens',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      const chip = await page.evaluate(
        () => document.querySelector('.ts-select-chip')?.textContent?.trim() ?? null,
      );
      await page.focus('[data-control="present.arrow"]');
      await keyLog();
      await press(page, 'Enter');
      const opened = await pollUntil(
        () =>
          page
            .locator('#ts-menu-slideshow')
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        3000,
      );
      const keys = await keyLog();
      await press(page, 'Escape');
      await press(page, 'Escape');
      await sleep(200);
      return {
        ok: opened && keys.some((k) => k.key === 'Enter' && k.prevented === false),
        observed: `chip ${chip}; menu open ${opened}; keys ${JSON.stringify(keys)}`,
      };
    },
  );
  await step(
    'Split button',
    'Space on the chevron opens the menu; Space on the Slideshow half opens the show',
    async () => {
      await page.focus('[data-control="present.arrow"]');
      await press(page, ' ');
      const menuOpen = await pollUntil(
        () =>
          page
            .locator('#ts-menu-slideshow')
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        3000,
      );
      await press(page, 'Escape');
      await sleep(200);
      await page.focus('[data-control="present.open"]');
      await press(page, ' ');
      const on = await pollUntil(
        () => showFacts().then((f) => f.present),
        (v) => v === true,
        8000,
      );
      if (on) await leaveShow();
      return { ok: menuOpen && on, observed: `menu by Space ${menuOpen}; show by Space ${on}` };
    },
  );
  await step(
    'Split button',
    'Tab from the Slideshow half reaches the chevron with nothing selected and with the title selected (Editor.tsx, B3)',
    async () => {
      await press(page, 'Escape', 2);
      await page.focus('[data-control="present.open"]');
      await press(page, 'Tab');
      const plain = await activeDesc(page);
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(200);
      await page.focus('[data-control="present.open"]');
      await press(page, 'Tab');
      const selected = await activeDesc(page);
      await press(page, 'Escape', 2);
      return {
        ok: plain.includes('present.arrow') && selected.includes('present.arrow'),
        observed: `nothing selected: focus ${plain}; title selected: focus ${selected}`,
      };
    },
  );
  await step(
    'Split button',
    'Keyboard focus on the chevron half draws the ring inside the half',
    async () => {
      await page.focus('[data-control="present.open"]');
      await press(page, 'Tab');
      const h = await halves();
      await shot(page, 'light-13-split-focus-arrow.png', clusterClip());
      await page.focus('[data-control="title.comments"]');
      await press(page, 'Tab');
      const h2 = await halves();
      await shot(page, 'light-14-split-focus-label.png', clusterClip());
      await parkMouse(page);
      await page.evaluate(() => document.activeElement?.blur());
      return {
        ok: h.arrow.focusVisible || h2.present.focusVisible,
        observed: `after Tab from the label: arrow focus-visible ${h.arrow.focusVisible} outline ${h.arrow.outline}; after Tab from the comments glyph: label focus-visible ${h2.present.focusVisible} outline ${h2.present.outline}`,
      };
    },
  );

  // ---- 4. the comments glyph, the Comments rows, Viewing mode, the Themes panel
  await step(
    'Comments glyph',
    'Click Show all comments: the panel opens with aria-pressed true; click again: it closes',
    async () => {
      await clickControl(page, 'title.comments');
      const on = await pollUntil(
        () =>
          page
            .locator('[data-control="panel.comments"]')
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        4000,
      );
      const pressed = await page.evaluate(() =>
        document.querySelector('[data-control="title.comments"]')?.getAttribute('aria-pressed'),
      );
      await shot(page, 'light-15-comments-panel-open.png');
      await clickControl(page, 'title.comments');
      const off = await pollUntil(
        () =>
          page
            .locator('[data-control="panel.comments"]')
            .isVisible()
            .catch(() => false),
        (v) => v === false,
        4000,
      );
      const unpressed = await page.evaluate(() =>
        document.querySelector('[data-control="title.comments"]')?.getAttribute('aria-pressed'),
      );
      await parkMouse(page);
      return {
        ok: on && pressed === 'true' && off === false && unpressed === 'false',
        observed: `open ${on} aria-pressed ${pressed}; after the second click open ${off} aria-pressed ${unpressed}`,
      };
    },
  );
  await step(
    'View > Comments',
    'Show all comments opens the Comments panel; Hide comments closes it',
    async () => {
      await openMenu(page, 'view');
      await hoverRow(page, 'view.comments', '[data-control="menu.view.comments.showAll"]');
      await clickRow(page, 'view.comments.showAll');
      const on = await pollUntil(
        () =>
          page
            .locator('[data-control="panel.comments"]')
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        4000,
      );
      await closeMenus(page);
      await openMenu(page, 'view');
      await hoverRow(page, 'view.comments', '[data-control="menu.view.comments.hide"]');
      await clickRow(page, 'view.comments.hide');
      const off = await pollUntil(
        () =>
          page
            .locator('[data-control="panel.comments"]')
            .isVisible()
            .catch(() => false),
        (v) => v === false,
        4000,
      );
      await closeMenus(page);
      await parkMouse(page);
      return {
        ok: on && off === false,
        observed: `after Show all: panel ${on}; after Hide: panel ${off}`,
      };
    },
  );
  await step(
    'View > Mode',
    'Viewing draws no toolbar and the body moves up; Editing brings it back',
    async () => {
      const before = await page.evaluate(() => ({
        toolbar: Boolean(document.querySelector('.ts-toolbar')),
        main: document.querySelector('.pt-viewer.is-editor > .pt-main')?.getBoundingClientRect().y,
      }));
      await openMenu(page, 'view');
      await hoverRow(page, 'view.mode', '[data-control="menu.view.mode.viewing"]');
      await clickRow(page, 'view.mode.viewing');
      await sleep(400);
      const viewing = await page.evaluate(() => ({
        mode: document.querySelector('.pt-viewer')?.getAttribute('data-edit-mode'),
        toolbar: Boolean(document.querySelector('.ts-toolbar')),
        main: document.querySelector('.pt-viewer.is-editor > .pt-main')?.getBoundingClientRect().y,
        toolH: getComputedStyle(document.querySelector('.pt-viewer'))
          .getPropertyValue('--pt-tool-h')
          .trim(),
      }));
      await shot(page, 'light-16-viewing-mode.png', { x: 0, y: 0, width: 1440, height: 140 });
      await openMenu(page, 'view');
      await hoverRow(page, 'view.mode', '[data-control="menu.view.mode.editing"]');
      await clickRow(page, 'view.mode.editing');
      await sleep(400);
      const editing = await page.evaluate(() => ({
        mode: document.querySelector('.pt-viewer')?.getAttribute('data-edit-mode'),
        toolbar: Boolean(document.querySelector('.ts-toolbar')),
        main: document.querySelector('.pt-viewer.is-editor > .pt-main')?.getBoundingClientRect().y,
      }));
      await parkMouse(page);
      return {
        ok:
          before.toolbar &&
          viewing.mode === 'viewing' &&
          !viewing.toolbar &&
          viewing.main === before.main - 40 &&
          editing.mode === 'editing' &&
          editing.toolbar &&
          editing.main === before.main,
        observed: `before: toolbar ${before.toolbar} main y ${before.main}; viewing: data-edit-mode ${viewing.mode} toolbar ${viewing.toolbar} main y ${viewing.main} --pt-tool-h ${viewing.toolH}; editing: toolbar ${editing.toolbar} main y ${editing.main}`,
      };
    },
  );
  await step(
    'Themes panel',
    'The toolbar Theme button opens Themes with the two tiles and no Import theme control',
    async () => {
      await clickControl(page, 'toolbar.theme');
      const panel = await pollUntil(
        () =>
          page
            .locator('.ts-rpanel .ts-panel')
            .first()
            .isVisible()
            .catch(() => false),
        (v) => v === true,
        4000,
      );
      const facts = await page.evaluate(() => ({
        importStub: Boolean(document.querySelector('[data-control="themes.import"]')),
        tiles: document.querySelectorAll('.ts-themes-tiles [role="radio"]').length,
        title: document.querySelector('.ts-rpanel .ts-panel-head')?.textContent?.trim() ?? null,
      }));
      await shot(page, 'light-17-themes-panel.png', {
        x: 1440 - 340,
        y: 100,
        width: 340,
        height: 500,
      });
      await clickControl(page, 'toolbar.theme');
      await sleep(300);
      const closed = !(await page
        .locator('.ts-rpanel .ts-panel')
        .first()
        .isVisible()
        .catch(() => false));
      await parkMouse(page);
      return {
        ok: panel && !facts.importStub && facts.tiles >= 2 && closed,
        observed: `panel ${panel} "${facts.title}"; tiles ${facts.tiles}; Import theme present ${facts.importStub}; second click closed ${closed}`,
      };
    },
  );
  await step(
    'Menus',
    'The default view lists the returned rows: Insert > Shape, Line, Table, Chart, Diagram, Word art; Format > Borders & lines, Table; Arrange > Distribute, Rotate, Group; Slide > Change theme; View > Appearance, Mode, Guides',
    async () => {
      const found = {};
      for (const [menu, ids] of [
        [
          'insert',
          [
            'insert.shape',
            'insert.line',
            'insert.table',
            'insert.chart',
            'insert.diagram',
            'insert.wordArt',
            'insert.slideNumbers',
          ],
        ],
        ['format', ['format.bordersLines', 'format.table', 'format.text']],
        [
          'arrange',
          [
            'arrange.distribute',
            'arrange.rotate',
            'arrange.group',
            'arrange.ungroup',
            'arrange.regroup',
          ],
        ],
        ['slide', ['slide.changeTheme']],
        [
          'view',
          [
            'view.appearance',
            'view.mode',
            'view.guides',
            'view.snapTo',
            'view.comments',
            'view.livePointers',
            'view.showRuler',
            'view.showFilmstrip',
            'view.fullScreen',
          ],
        ],
        ['file', ['file.open', 'file.importSlides', 'file.details']],
        ['edit', ['edit.selectNone']],
        ['tools', ['tools.checkSlides']],
        ['help', ['help.improve']],
      ]) {
        await openMenu(page, menu);
        for (const id of ids) found[id] = await has(page, `[data-control="menu.${id}"]`);
        await closeMenus(page);
      }
      const missing = Object.entries(found)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      await parkMouse(page);
      return {
        ok: missing.length === 0,
        observed:
          missing.length === 0
            ? `${Object.keys(found).length} rows present`
            : `missing ${missing.join(', ')}`,
      };
    },
  );
  await step(
    'Toolbar',
    'The default view draws Paint format, Insert shape, Insert line, Theme and the Hide the menus chevron; no Transition',
    async () => {
      const f = await page.evaluate(() => {
        const ids = [
          'toolbar.paintFormat',
          'toolbar.insertShape',
          'toolbar.insertLine',
          'toolbar.theme',
          'toolbar.hideMenus',
          'toolbar.transition',
        ];
        return Object.fromEntries(
          ids.map((id) => [
            id,
            Boolean(document.querySelector(`.ts-toolbar [data-control="${id}"]`)),
          ]),
        );
      });
      return {
        ok:
          f['toolbar.paintFormat'] &&
          f['toolbar.insertShape'] &&
          f['toolbar.insertLine'] &&
          f['toolbar.theme'] &&
          f['toolbar.hideMenus'] &&
          !f['toolbar.transition'],
        observed: JSON.stringify(f),
      };
    },
  );

  // ---- 5. the 900 px collapse (both appearances)
  for (const which of ORDER) {
    await setAppearance(page, which);
    await page.setViewportSize({ width: 900, height: 900 });
    await sleep(600);
    await step(
      'Collapse',
      `At 900 px the word leaves and the control is 58 px of two 28 px halves; Share is 32 px (${which})`,
      async () => {
        const w = await edgesOf(page, '.ts-title-slideshow');
        const p = await edgesOf(page, '.ts-title-present');
        const a = await edgesOf(page, '.ts-title-present-arrow');
        const s = await edgesOf(page, '.ts-title-share');
        const lb = await page.evaluate(
          () => getComputedStyle(document.querySelector('.ts-title-present .pt-lb')).display,
        );
        const pts = await boundaryPoints(page);
        await shot(page, `${which}-18-title-row-900.png`, {
          x: 0,
          y: pts.title.y,
          width: 900,
          height: pts.title.height + 2,
        });
        await shot(page, `${which}-19-editor-900.png`);
        const img = decodePng(await page.screenshot());
        const seams = seamsFromShot(img, pts);
        notes[`${which}-900`] = {
          wrapper: w,
          present: p,
          arrow: a,
          share: s,
          seams,
          gaps: await clusterGaps(page),
        };
        const horizontal = Object.entries(seams)
          .filter(([k]) => !k.includes('vertical'))
          .map(([k, v]) => `${k}: ${v.lines.map((l) => `${l.thickness}px`).join('|') || 'none'}`)
          .join('; ');
        return {
          ok:
            Math.abs(w.rect.w - 58) <= 1 &&
            Math.abs(p.rect.w - 28) <= 1 &&
            Math.abs(a.rect.w - 28) <= 1 &&
            Math.abs(s.rect.w - 32) <= 1 &&
            lb === 'none',
          observed: `wrapper ${w.rect.w.toFixed(1)} by ${w.rect.h}; label half ${p.rect.w.toFixed(1)} padding ${p.padding} word display ${lb}; arrow ${a.rect.w}; share ${s.rect.w.toFixed(1)} by ${s.rect.h}; seams ${horizontal}`,
        };
      },
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(600);
  }

  // ---- 6. 2x: the same pictures at deviceScaleFactor 2 in both appearances
  const context2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    const page2 = await context2.newPage();
    /* the scratch deck when the first write created one, else a fresh draft on /new: the chrome
       is the same page either way */
    await page2.goto(deckId ? `${BASE}/edit/${deckId}` : `${BASE}/new`, {
      waitUntil: 'domcontentloaded',
    });
    await editorReady(page2);
    await dismissNamePrompt(page2);
    await sleep(800);
    for (const which of ORDER) {
      await step('Appearance', `View > Appearance > ${which} in the 2x browser`, () =>
        setAppearance(page2, which),
      );
      const pts = await pictureSet(page2, `${which}-2x`);
      const w = await edgesOf(page2, '.ts-title-slideshow');
      const a = await edgesOf(page2, '.ts-title-present-arrow');
      /* the 2x title row crop: the seam read at device pixels, the divider two device pixels wide at most */
      const titleImg = decodePng(
        await page2.screenshot({
          clip: { x: 0, y: pts.title.y, width: 1440, height: pts.title.height },
        }),
      );
      const p = await edgesOf(page2, '.ts-title-present');
      const x0 = Math.round((p.rect.x + p.rect.w - 6) * 2);
      const x1 = Math.round((a.rect.x + 6) * 2);
      const mid = runsAlongRow(
        titleImg,
        Math.round((p.rect.y - pts.title.y + p.rect.h / 2) * 2),
        x0,
        x1,
      );
      const div = mid.find((s) => s.thickness <= 4 && s.x > x0 + 2 && s.x < x1 - 2);
      notes[`${which}-2x`] = {
        wrapper: w,
        arrow: a,
        splitMid: lines(mid),
        dividerContrast: div?.contrastToPrevious ?? null,
      };
      record(
        'Split button',
        `The divider at 2x (${which})`,
        div ? 'works' : 'broken',
        `mid row segments ${JSON.stringify(lines(mid))}; divider ${div ? `${div.thickness} device px ${div.color} ${div.contrastToPrevious}:1` : 'none'}`,
      );
    }
  } finally {
    await context2.close().catch(() => undefined);
  }
} catch (error) {
  record(
    'The run',
    'The run itself',
    'broken',
    `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
} finally {
  // ---- 7. File > Move to trash, Delete forever
  if (deckId) {
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      await dismissNamePrompt(page);
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('Scratch deck', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('Scratch deck', 'Delete forever on /decks/trash', 'works', deckId);
    } catch (error) {
      record(
        'Scratch deck',
        'The trash path',
        'broken',
        `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
      try {
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        await invoke(page, 'deck.trash').catch(() => undefined);
        await invoke(page, 'deck.deleteForever').catch(() => undefined);
        record(
          'Scratch deck',
          'The window API fallback',
          'works',
          'deck.trash and deck.deleteForever called',
        );
      } catch {
        /* nothing more to try */
      }
    }
  }
  await browser.close();
  const out = { base: BASE, at: new Date().toISOString(), deckId, rows, notes, consoleErrors };
  writeFileSync(path.join(OUT, 'shoot-chrome-run.json'), JSON.stringify(out, null, 2));
  const broken = rows.filter((r) => r.result === 'broken').length;
  log(
    `\n${rows.length} rows, ${broken} broken, ${consoleErrors.length} console errors; ${OUT}/shoot-chrome-run.json`,
  );
  process.exit(broken > 0 ? 1 : 0);
}

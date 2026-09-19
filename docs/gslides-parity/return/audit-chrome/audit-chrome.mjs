#!/usr/bin/env node
// The chrome rows audit of the return round (docs/gslides-parity/return/audit-chrome.md): the
// separators between and inside the editor's rows, the title row's right cluster and the Slideshow
// split button, measured on production at 1440 by 900 in the light and the dark appearance at 1x
// and 2x, at human speed, on one scratch deck created from /new and trashed and deleted forever in
// the finally block. Imports nothing from the repository but playwright-core.
//
//   node audit-chrome.mjs [--base https://turboslide.vercel.app]
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
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/return/audit-chrome';
const CHROME = path.join(OUT, 'chrome');
mkdirSync(OUT, { recursive: true });
mkdirSync(CHROME, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const notes = {};
const consoleErrors = [];
const startedAt = new Date().toISOString();
const log = (...a) => console.log(...a);
/**
 * One row of the audit: `feature`, `interaction`, `result` (works, flaky, broken, not driven),
 * `evidence`, `tries` (each attempt's observation). A failed interaction is tried three times.
 */
const record = (feature, interaction, result, evidence, tries = []) => {
  const row = { n: rows.length + 1, feature, interaction, result, evidence, tries };
  rows.push(row);
  const tag =
    { works: 'ok  ', flaky: 'FLKY', broken: 'FAIL', 'not driven': 'n/d ' }[result] ?? '????';
  log(`${tag} ${String(row.n).padStart(3)} ${feature} :: ${interaction}\n       ${evidence}`);
  return row;
};
/**
 * Drives `fn` up to three times. `fn` answers `{ ok, observed }`; the row is works when the first
 * try passes, flaky when a later one does, broken when none does. `reset` runs between tries.
 */
const interaction = async (feature, name, fn, { reset } = {}) => {
  const tries = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let r;
    try {
      r = await fn(attempt);
    } catch (error) {
      r = {
        ok: false,
        observed: `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      };
    }
    tries.push({ attempt, ok: r.ok, observed: String(r.observed) });
    if (r.ok === true) {
      return record(
        feature,
        name,
        attempt === 1 ? 'works' : 'flaky',
        tries.map((t) => `try ${t.attempt}: ${t.observed}`).join(' | '),
        tries,
      );
    }
    if (r.ok === null) {
      return record(feature, name, 'not driven', `not driven: ${r.observed}`, tries);
    }
    if (reset) await reset().catch(() => undefined);
  }
  return record(
    feature,
    name,
    'broken',
    tries.map((t) => `try ${t.attempt}: ${t.observed}`).join(' | '),
    tries,
  );
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
  await sleep(rand(160, 260));
};
const parkMouse = async (page) => {
  await page.mouse.move(720, 600);
  await sleep(200);
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
  await sleep(rand(250, 400));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clickRow = async (page, rowId) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
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
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.id ? `#${a.id}` : ''}`;
  });
const dismissNamePrompt = async (page) => {
  if (await has(page, '[data-control="dialog.namePrompt"]')) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
    await sleep(200);
  }
};

// ---------------------------------------------------------------------------------------------
// a PNG reader (zlib only): the line thickness and the contrast are read from the screenshots

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
/**
 * The dark runs along a column of the image between y0 and y1 at x: each run is `{ y, thickness,
 * color, paper, contrast }` against the paper pixel just above it. Reads a vertical line's
 * doubling (thickness 2) and a missing line (no run) from the screenshot itself.
 */
/**
 * The colour segments along a list of pixels: each segment is a run of pixels within tolerance of
 * its first pixel, with its start, its thickness in pixels, its colour and its contrast against the
 * segment before it. A 1 px hairline between two grounds reads as a segment of thickness 1; two
 * hairlines drawn by two rows read as thickness 2 (or two adjacent thin segments); a missing line
 * reads as one long segment.
 */
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

// ---------------------------------------------------------------------------------------------
// the measurements

/** The computed edges of one element: each side's width and colour, the corners, the box. */
const edgesOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel: s,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      top: [cs.borderTopWidth, cs.borderTopColor, cs.borderTopStyle].join(' '),
      right: [cs.borderRightWidth, cs.borderRightColor, cs.borderRightStyle].join(' '),
      bottom: [cs.borderBottomWidth, cs.borderBottomColor, cs.borderBottomStyle].join(' '),
      left: [cs.borderLeftWidth, cs.borderLeftColor, cs.borderLeftStyle].join(' '),
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
      boxSizing: cs.boxSizing,
      height: cs.height,
      width: cs.width,
      display: cs.display,
    };
  }, sel);

const ROW_SELECTORS = [
  '.ts-title-row',
  '.ts-menubar',
  '.ts-toolbar',
  '.pt-viewer.is-editor > .pt-sb',
  '.pt-viewer.is-editor > .pt-sb > .pt-sb-head',
  '.pt-viewer.is-editor > .pt-sb .ts-film',
  '.pt-viewer.is-editor > .pt-main',
  '.pt-viewer.is-editor > .pt-main > .pt-stagewrap',
  '.pt-viewer.is-editor > .pt-main > .ts-notes-slot',
  '.pt-viewer.is-editor > .pt-main > .ts-notes-slot > .ts-notes',
  '.ts-notes-handle',
  '.ts-bottombar',
  '.pt-viewer.is-editor > .ts-rpanel',
  '.ts-panel',
  '.ts-panel-head',
];
const CLUSTER_SELECTORS = [
  '.ts-title-r',
  '.ts-presence',
  '.ts-presence-rule',
  '.ts-presence-more',
  '.ts-presence-me',
  '.ts-title-comments-slot',
  '.ts-title-comments',
  '.ts-title-inbox-slot',
  '.ts-title-inbox',
  '.ts-title-slideshow',
  '.ts-title-present',
  '.ts-title-present svg',
  '.ts-title-present .pt-lb',
  '.ts-title-present-arrow',
  '.ts-title-present-arrow svg',
  '.ts-title-share-slot',
  '.ts-title-share',
  '.ts-title-share svg',
  '.ts-title-showmenus',
  '.ts-title-l',
  '.ts-title-home',
  '.ts-title-name',
  '.ts-title-save',
  '.ts-title-clock',
];
const tokensOf = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--pt-paper',
      '--pt-ink',
      '--pt-ink-2',
      '--pt-titanium',
      '--pt-hair',
      '--pt-hair-soft',
      '--pt-plate',
      '--pt-edge',
      '--pt-radius',
      '--pt-title-h',
      '--pt-menu-h',
      '--pt-tool-h',
      '--pt-status-h',
      '--pt-notes-h',
      '--pt-sb-w',
      '--pt-presence-w',
      '--pt-inbox-w',
    ];
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    out.theme = document.documentElement.getAttribute('data-theme');
    out.appearanceStored = (() => {
      try {
        return localStorage.getItem('ts-chrome-appearance');
      } catch {
        return null;
      }
    })();
    return out;
  });
const ariaOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const names = [
      'role',
      'aria-label',
      'aria-haspopup',
      'aria-expanded',
      'aria-controls',
      'aria-pressed',
      'data-control',
      'data-menu-item',
      'type',
      'tabindex',
      'data-tip',
    ];
    const out = { tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim() };
    for (const n of names) if (el.hasAttribute(n)) out[n] = el.getAttribute(n);
    return out;
  }, sel);
const measure = async (page, label) => {
  const rowsM = {};
  for (const sel of ROW_SELECTORS) rowsM[sel] = await edgesOf(page, sel);
  const cluster = {};
  for (const sel of CLUSTER_SELECTORS) cluster[sel] = await edgesOf(page, sel);
  const seps = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.ts-tb-sep')];
    return all.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const prev = el.previousElementSibling?.getBoundingClientRect();
      const next = el.nextElementSibling?.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        background: cs.backgroundColor,
        margin: cs.margin,
        prevControl:
          el.previousElementSibling?.getAttribute('data-control') ??
          el.previousElementSibling?.className ??
          null,
        nextControl:
          el.nextElementSibling?.getAttribute('data-control') ??
          el.nextElementSibling?.className ??
          null,
        gapBefore: prev ? Number((r.x - (prev.x + prev.width)).toFixed(2)) : null,
        gapAfter: next ? Number((next.x - (r.x + r.width)).toFixed(2)) : null,
      };
    });
  });
  const clusterGaps = await page.evaluate(() => {
    const r = document.querySelector('.ts-title-r');
    if (!r) return null;
    const kids = [...r.children].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        control: el.getAttribute('data-control') ?? el.className,
        x: Number(b.x.toFixed(1)),
        w: Number(b.width.toFixed(1)),
        h: Number(b.height.toFixed(1)),
        y: Number(b.y.toFixed(1)),
      };
    });
    const gaps = [];
    for (let i = 1; i < kids.length; i += 1)
      gaps.push({
        between: `${kids[i - 1].control} -> ${kids[i].control}`,
        gap: Number((kids[i].x - (kids[i - 1].x + kids[i - 1].w)).toFixed(1)),
      });
    const rowR = document.querySelector('.ts-title-row').getBoundingClientRect();
    return {
      kids,
      gaps,
      rightInset: Number((rowR.right - (kids.at(-1).x + kids.at(-1).w)).toFixed(1)),
      rowWidth: rowR.width,
    };
  });
  const aria = {
    split: await ariaOf(page, '.ts-title-slideshow'),
    present: await ariaOf(page, '.ts-title-present'),
    arrow: await ariaOf(page, '.ts-title-present-arrow'),
    share: await ariaOf(page, '.ts-title-share'),
    comments: await ariaOf(page, '.ts-title-comments'),
    inbox: await ariaOf(page, '.ts-title-inbox'),
    save: await ariaOf(page, '.ts-title-save'),
    presenceMe: await ariaOf(page, '.ts-presence-me'),
  };
  const tokens = await tokensOf(page);
  notes[label] = {
    rows: rowsM,
    cluster,
    seps,
    clusterGaps,
    aria,
    tokens,
    viewport: page.viewportSize(),
  };
  return notes[label];
};

/** The boundary points: an x on each horizontal seam where nothing but the rows sits. */
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
    /* an x where the point above and below the seam is the row itself (no control) */
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
    return {
      title,
      menubar,
      toolbar,
      sb,
      sbHead,
      notesSlot,
      notes,
      bottom,
      rpanel,
      main,
      titleMenubar: title
        ? { y: Math.round(title.bottom), x: clearX(Math.round(title.bottom), xs, isRowish) }
        : null,
      menubarToolbar: menubar
        ? { y: Math.round(menubar.bottom), x: clearX(Math.round(menubar.bottom), xs, isRowish) }
        : null,
      toolbarSheet: toolbar
        ? {
            y: Math.round(toolbar.bottom),
            x: clearX(
              Math.round(toolbar.bottom),
              xs.filter((x) => (sb ? x > sb.right + 10 : true)),
              isRowish,
            ),
          }
        : null,
      toolbarFilmstrip:
        toolbar && sb
          ? { y: Math.round(toolbar.bottom), x: Math.round(sb.x + sb.width / 2) }
          : null,
      filmstripHead: sbHead
        ? { y: Math.round(sbHead.bottom), x: Math.round(sbHead.x + sbHead.width / 2) }
        : null,
      notesDivider: notesSlot
        ? { y: Math.round(notesSlot.top), x: Math.round(notesSlot.x + notesSlot.width * 0.25) }
        : null,
      notesBottom: bottom
        ? { y: Math.round(bottom.top), x: Math.round((main?.x ?? 300) + 80) }
        : null,
      filmstripBottom:
        bottom && sb ? { y: Math.round(bottom.top), x: Math.round(sb.x + sb.width / 2) } : null,
      filmstripEdge: sb ? { x: Math.round(sb.right), y: Math.round(sb.y + sb.height / 2) } : null,
      filmstripEdgeUpper: sb ? { x: Math.round(sb.right), y: Math.round(sb.y + 30) } : null,
      rpanelEdge:
        rpanel && rpanel.width > 0
          ? { x: Math.round(rpanel.x), y: Math.round(rpanel.y + rpanel.height / 2) }
          : null,
    };
  });

/** Reads the lines at every seam from the whole editor screenshot (1x only). */
const seamsFromShot = (img, pts, scale = 1) => {
  const out = {};
  const col = (name, p, span = 6) => {
    if (!p) return;
    out[name] = {
      at: p,
      runs: runsAlongColumn(
        img,
        Math.round(p.x * scale),
        Math.round((p.y - span) * scale),
        Math.round((p.y + span) * scale),
      ).map((r) => ({ ...r, y: r.y / scale, thickness: r.thickness / scale })),
    };
  };
  const rowScan = (name, p, span = 6) => {
    if (!p) return;
    out[name] = {
      at: p,
      runs: runsAlongRow(
        img,
        Math.round(p.y * scale),
        Math.round((p.x - span) * scale),
        Math.round((p.x + span) * scale),
      ).map((r) => ({ ...r, x: r.x / scale, thickness: r.thickness / scale })),
    };
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

/** The split button's own seam, read from a 1x title row crop: the divider between the halves. */
const splitSeamFromShot = (img, presentRect, arrowRect, cropOrigin) => {
  const x0 = Math.round(presentRect.x + presentRect.w - 6 - cropOrigin.x);
  const x1 = Math.round(arrowRect.x + 6 - cropOrigin.x);
  const at = (dy) => Math.round(presentRect.y + dy - cropOrigin.y);
  /* mid height, and 1 and 2 px under the top edge, where an 8 px corner on each half leaves a notch */
  return {
    mid: runsAlongRow(img, at(presentRect.h / 2), x0, x1),
    top1: runsAlongRow(img, at(1), x0, x1),
    top2: runsAlongRow(img, at(2), x0, x1),
    top4: runsAlongRow(img, at(4), x0, x1),
  };
};

// ---------------------------------------------------------------------------------------------
// screenshots

const shot = async (page, file, clip) => {
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, ...(clip ? { clip } : {}) });
  return p;
};
const crop = (r, pad = 0, bounds = { w: 1440, h: 900 }) => {
  if (!r) return null;
  const bw = bounds.w ?? bounds.width;
  const bh = bounds.h ?? bounds.height;
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return {
    x,
    y,
    width: Math.max(1, Math.min(bw - x, r.w + 2 * pad)),
    height: Math.max(1, Math.min(bh - y, r.h + 2 * pad)),
  };
};
/** The eight pictures of one appearance and scale. */
const pictureSet = async (page, tag) => {
  const vp = page.viewportSize();
  const pts = await boundaryPoints(page);
  const files = {};
  files.editor = await shot(page, `${tag}-01-editor.png`);
  files.titleRow = await shot(
    page,
    `${tag}-02-title-row.png`,
    crop({ x: 0, y: pts.title.y, w: vp.width, h: pts.title.height + 2 }, 0, vp),
  );
  files.menubar = await shot(
    page,
    `${tag}-03-menu-bar.png`,
    crop({ x: 0, y: pts.menubar.y - 2, w: vp.width, h: pts.menubar.height + 4 }, 0, vp),
  );
  files.toolbar = await shot(
    page,
    `${tag}-04-toolbar.png`,
    crop({ x: 0, y: pts.toolbar.y - 2, w: vp.width, h: pts.toolbar.height + 4 }, 0, vp),
  );
  files.toolbarSheet = await shot(
    page,
    `${tag}-05-toolbar-sheet-boundary.png`,
    crop({ x: 0, y: pts.toolbar.bottom - 14, w: vp.width, h: 40 }, 0, vp),
  );
  if (pts.sb)
    files.filmstripEdge = await shot(
      page,
      `${tag}-06-filmstrip-edge.png`,
      crop({ x: pts.sb.right - 40, y: pts.sb.y, w: 80, h: pts.sb.height }, 0, vp),
    );
  if (pts.notesSlot)
    files.notesDivider = await shot(
      page,
      `${tag}-07-notes-divider.png`,
      crop({ x: pts.notesSlot.x, y: pts.notesSlot.top - 16, w: pts.notesSlot.width, h: 40 }, 0, vp),
    );
  files.bottomBar = await shot(
    page,
    `${tag}-08-bottom-bar.png`,
    crop({ x: 0, y: pts.bottom.top - 8, w: vp.width, h: pts.bottom.height + 8 }, 0, vp),
  );
  files.cluster = await shot(
    page,
    `${tag}-09-right-cluster.png`,
    crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
  );
  return { files, pts };
};

// ---------------------------------------------------------------------------------------------
// the proposed rules, injected for the after pictures (no source edit)

const PROPOSED_CSS = `
/* (a) the Slideshow split button as one control: one outline and one ground on the wrapper, the
   halves transparent inside it, one inner divider in a hairline read against ink, the corner on
   the outer corners only */
.ts-title-slideshow {
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--pt-ink);
  border-radius: 8px;
  background: var(--pt-ink);
  color: var(--pt-paper);
  overflow: hidden;
}
.ts-title-slideshow > .pt-ib.is-solid {
  box-sizing: border-box;
  height: 30px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  flex-direction: row;
  gap: 6px;
  transition: background-color var(--pt-dur-fast) var(--pt-ease-out);
}
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present { padding: 0 10px 0 12px; }
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present-arrow {
  width: 28px;
  padding: 0;
  justify-content: center;
  border-left: 1px solid var(--pt-hair-on-ink, color-mix(in srgb, var(--pt-paper) 26%, transparent));
}
.ts-title-slideshow > .pt-ib.is-solid svg { width: 12px; height: 12px; }
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present-arrow svg { width: 14px; height: 14px; }
.ts-title-slideshow > .pt-ib.is-solid:hover {
  background: color-mix(in srgb, var(--pt-paper) 16%, transparent);
  color: inherit;
}
.ts-title-slideshow > .pt-ib.is-solid:focus-visible {
  outline: 1px solid var(--pt-paper);
  outline-offset: -3px;
}
.ts-title-slideshow > .pt-ib.is-solid.ts-title-present-arrow[aria-expanded='true'] {
  background: color-mix(in srgb, var(--pt-paper) 24%, transparent);
}
@media (max-width: 900px) {
  .ts-title-slideshow > .pt-ib.is-solid.ts-title-present { padding: 0 8px; }
}
/* (c) the rhythm: Share takes the pair's corner so the two controls read as one family */
.ts-title-share { border-radius: 8px; }
/* (b) the separators law: the notes pane draws its divider once (the slot drew a second line) */
.pt-viewer.is-editor > .pt-main > .ts-notes-slot { border-top: 0; }
`;

// ---------------------------------------------------------------------------------------------
// the run

const browser = await chromium.launch({ headless: true });
const contextA = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await contextA.newPage();
const popups = [];
contextA.on('page', (p) => {
  /* the URL is read once the popup has navigated (it opens on about:blank), then it is closed */
  p.waitForLoadState('domcontentloaded', { timeout: 8000 })
    .catch(() => undefined)
    .then(() => {
      popups.push(p.url());
      return p.close();
    })
    .catch(() => undefined);
});
const wireConsole = (pg, tag) => {
  pg.on('console', (m) => {
    if (m.type() === 'error')
      consoleErrors.push({ tag, text: m.text().slice(0, 300), at: new Date().toISOString() });
  });
  pg.on('pageerror', (e) =>
    consoleErrors.push({
      tag,
      text: `pageerror: ${String(e).slice(0, 300)}`,
      at: new Date().toISOString(),
    }),
  );
};
wireConsole(page, 'A');

let deckId = '';
const shots = {};
try {
  // ---- 1. the scratch deck from /new
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  log(`deck ${deckId}`);
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  await interaction(
    'Scratch deck',
    'Double click the title placeholder on /new, type a title, press Escape: the first write creates the deck',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await typeHuman(page, 'Chrome rows audit');
      await press(page, 'Escape');
      const rev = await waitRevision(page, 1, 30_000);
      await settled(page);
      await dismissNamePrompt(page);
      await sleep(1500);
      const s = await settled(page);
      const deckTitle = (await invoke(page, 'deck.info')).title;
      const heading = await page.evaluate(
        (run) =>
          document
            .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`)
            ?.textContent?.trim() ?? null,
        HEAD,
      );
      const rowName = await page.evaluate(
        () => document.querySelector('.ts-title-name')?.textContent?.trim() ?? null,
      );
      return {
        ok: /\/edit\//.test(page.url()) && rev >= 1,
        observed: `${page.url().replace(BASE, '')}; revision ${s.revision}; deck.info title ${JSON.stringify(deckTitle)}; heading run ${JSON.stringify(heading)}; title row ${JSON.stringify(rowName)}`,
      };
    },
  );
  await parkMouse(page);
  await sleep(1200);

  const initialTheme = await theme(page);
  record(
    'Appearance',
    'Read the appearance production boots into on a fresh browser',
    'works',
    `data-theme="${initialTheme}"; ts-chrome-appearance ${JSON.stringify((await tokensOf(page)).appearanceStored)}`,
  );
  /* the boot appearance comes first, the other one after the switch is on (View > Appearance is parked) */
  const BOOT = initialTheme === 'light' ? 'light' : 'dark';
  const OTHER = BOOT === 'light' ? 'dark' : 'light';
  const LIGHT_TAG = `${BOOT}-1x`;

  // ---- 2. the boot appearance at 1x: pictures and measurements
  const setLight = await pictureSet(page, LIGHT_TAG);
  shots[LIGHT_TAG] = setLight.files;
  const mLight = await measure(page, LIGHT_TAG);
  const imgLight = decodePng(await page.screenshot());
  notes[`${LIGHT_TAG}-seams`] = seamsFromShot(imgLight, setLight.pts);
  {
    const crop0 = { x: 0, y: setLight.pts.title.y };
    const titleImg = decodePng(
      await page.screenshot({
        clip: { x: 0, y: setLight.pts.title.y, width: 1440, height: setLight.pts.title.height },
      }),
    );
    notes[`${LIGHT_TAG}-split-seam`] = splitSeamFromShot(
      titleImg,
      mLight.cluster['.ts-title-present'].rect,
      mLight.cluster['.ts-title-present-arrow'].rect,
      crop0,
    );
  }
  record(
    'Separators',
    'Read every seam of the chrome rows from the whole editor screenshot in the light appearance',
    'works',
    JSON.stringify(notes[`${LIGHT_TAG}-seams`]).slice(0, 1200),
  );
  record(
    'Split button',
    'Read the geometry and the computed edges of the Slideshow split button, rested, light appearance',
    'works',
    JSON.stringify({
      present: mLight.cluster['.ts-title-present'],
      arrow: mLight.cluster['.ts-title-present-arrow'],
      seam: notes[`${LIGHT_TAG}-split-seam`],
    }).slice(0, 1600),
  );
  record(
    'Right cluster',
    'Read the right cluster children, gaps and heights at 1440, light appearance',
    'works',
    JSON.stringify(mLight.clusterGaps).slice(0, 1200),
  );
  record(
    'Toolbar dividers',
    'Read the toolbar group dividers (.ts-tb-sep): height, colour, margins and the gaps to their neighbours',
    'works',
    JSON.stringify(mLight.seps).slice(0, 1200),
  );

  // ---- 3. the split button interactions (light)
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
          border: cs.borderColor,
          hovered: el.matches(':hover'),
        };
      };
      return { present: read('.ts-title-present'), arrow: read('.ts-title-present-arrow') };
    });
  await interaction('Split button', 'Hover the Slideshow half and read both halves', async () => {
    const r = await presentRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    const h = await halves();
    shots.hoverLabel = await shot(
      page,
      `${BOOT}-10-split-hover-label.png`,
      crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
    );
    await parkMouse(page);
    return {
      ok: h.present.hovered,
      observed: `hovered ${h.present.hovered}; Slideshow half bg ${h.present.background} color ${h.present.color} border ${h.present.border}; arrow half bg ${h.arrow.background} color ${h.arrow.color}`,
    };
  });
  await interaction('Split button', 'Hover the chevron half and read both halves', async () => {
    const r = await arrowRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    const h = await halves();
    shots.hoverArrow = await shot(
      page,
      `${BOOT}-11-split-hover-arrow.png`,
      crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
    );
    await parkMouse(page);
    return {
      ok: h.arrow.hovered,
      observed: `hovered ${h.arrow.hovered}; arrow half bg ${h.arrow.background} color ${h.arrow.color} border ${h.arrow.border}; Slideshow half bg ${h.present.background} color ${h.present.color}`,
    };
  });
  const menuRows = () =>
    page.evaluate(() => {
      const m = document.getElementById('ts-menu-slideshow');
      if (!m) return null;
      return [...m.querySelectorAll('[data-control^="menu."]')].map(
        (el) =>
          `${el.getAttribute('data-control')}${el.classList.contains('is-disabled') ? ' (disabled)' : ''}`,
      );
    });
  await interaction(
    'Split button',
    'Click the chevron half: the Presentation options menu opens under it, aria-expanded true; Escape closes it and focus returns to the chevron',
    async () => {
      const r = await arrowRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('#ts-menu-slideshow').waitFor({ timeout: 5000 });
      const listed = await menuRows();
      const expanded = await page.evaluate(() =>
        document.querySelector('.ts-title-present-arrow')?.getAttribute('aria-expanded'),
      );
      const menuRect = await rectOf(page, '#ts-menu-slideshow');
      shots.menuOpen = await shot(
        page,
        `${BOOT}-12-split-menu-open.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: Math.min(260, menuRect.y + menuRect.h + 8) }),
      );
      await press(page, 'Escape');
      await page.locator('#ts-menu-slideshow').waitFor({ state: 'detached', timeout: 5000 });
      const after = await page.evaluate(() =>
        document.querySelector('.ts-title-present-arrow')?.getAttribute('aria-expanded'),
      );
      const focus = await activeDesc(page);
      await parkMouse(page);
      return {
        ok: listed !== null && expanded === 'true' && after === 'false',
        observed: `rows ${JSON.stringify(listed)}; aria-expanded while open ${expanded}, after Escape ${after}; menu at x ${Math.round(menuRect.x)} y ${Math.round(menuRect.y)} w ${Math.round(menuRect.w)}; arrow at x ${Math.round(r.x)} w ${Math.round(r.w)}; focus after Escape ${focus}`,
      };
    },
    { reset: () => closeMenus(page) },
  );

  /* the show's facts from the DOM, the way audit-present read them (state has no `present` key) */
  const showFacts = () =>
    page.evaluate(() => {
      const show = document.querySelector('[data-control="present.show"]');
      return {
        present: Boolean(show),
        index: show ? Number(show.getAttribute('data-index')) : null,
        total: show ? Number(show.getAttribute('data-total')) : null,
        counter:
          document.querySelector('[data-control="present.counter"]')?.textContent?.trim() ?? '',
        fullscreen: document.fullscreenElement !== null,
        isPresentClass: Boolean(document.querySelector('.pt-viewer.is-present')),
      };
    });
  const presentOn = () =>
    pollUntil(
      () => showFacts().then((f) => f.present),
      (v) => v === true,
      8000,
    );
  const presentOff = () =>
    pollUntil(
      () => showFacts().then((f) => f.present),
      (v) => v === false,
      8000,
    );
  const leaveShow = async () => {
    await press(page, 'Escape');
    await presentOff();
    await sleep(500);
  };
  await interaction(
    'Slideshow',
    'Click the Slideshow half: the show opens from the current slide; Escape leaves it',
    async () => {
      const r = await presentRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const on = await presentOn();
      const f = await showFacts();
      await leaveShow();
      const off = !(await showFacts()).present;
      return {
        ok: on && off,
        observed: `present ${on}; index ${f.index} of ${f.total}; counter "${f.counter}"; fullscreen ${f.fullscreen}; after Escape present false ${off}`,
      };
    },
    { reset: () => leaveShow().catch(() => undefined) },
  );

  await interaction(
    'Slideshow',
    'Chevron > Start from beginning: the show opens on slide 1',
    async () => {
      const r = await arrowRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('#ts-menu-slideshow').waitFor({ timeout: 5000 });
      if (!(await has(page, '[data-control="menu.title.slideshow.startFromBeginning"]'))) {
        await closeMenus(page);
        return { ok: null, observed: 'the row is not in the menu' };
      }
      await clickRow(page, 'title.slideshow.startFromBeginning');
      const on = await presentOn();
      const s = await state(page);
      await leaveShow();
      return {
        ok: on,
        observed: `present ${on}; slideId ${s.slideId}; index ${s.slideIndex ?? '?'}; after Escape present ${(await state(page)).present}`,
      };
    },
    {
      reset: async () => {
        await closeMenus(page);
        await leaveShow().catch(() => undefined);
      },
    },
  );

  await interaction(
    'Presenter view',
    'Chevron > Presenter view: a second window opens on /present/<id>',
    async () => {
      popups.length = 0;
      const r = await arrowRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('#ts-menu-slideshow').waitFor({ timeout: 5000 });
      if (!(await has(page, '[data-control="menu.title.slideshow.presenterView"]'))) {
        await closeMenus(page);
        return { ok: null, observed: 'the row is not in the menu' };
      }
      await clickRow(page, 'title.slideshow.presenterView');
      await pollUntil(
        () => Promise.resolve(popups.length),
        (n) => n > 0,
        10_000,
      );
      const on = (await state(page)).present === true;
      await sleep(800);
      await leaveShow().catch(() => undefined);
      return {
        ok: popups.length > 0,
        observed: `popups ${JSON.stringify(popups.map((u) => u.replace(BASE, '')))}; audience present ${on}; after Escape present ${(await state(page)).present}`,
      };
    },
    {
      reset: async () => {
        await closeMenus(page);
        await leaveShow().catch(() => undefined);
      },
    },
  );

  // keyboard on the two halves
  await interaction(
    'Split button',
    'Focus the chevron half from the keyboard (Tab from the Slideshow half), press Enter: the menu opens; Escape closes it',
    async () => {
      popups.length = 0;
      await page.locator('.ts-title-present').focus();
      await press(page, 'Tab');
      const focused = await activeDesc(page);
      /* the key in two halves, so the menu's state after the key down and after the key up is read */
      await page.keyboard.down('Enter');
      await sleep(120);
      const afterDown = {
        open: await has(page, '#ts-menu-slideshow'),
        focus: await activeDesc(page),
        show: (await showFacts()).present,
      };
      await page.keyboard.up('Enter');
      await sleep(400);
      const open = await has(page, '#ts-menu-slideshow');
      const focusInMenu = await activeDesc(page);
      const show = await showFacts();
      shots.focusArrow = await shot(
        page,
        `${BOOT}-13-split-focus-arrow-menu.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: 200 }),
      );
      await press(page, 'Escape');
      await page
        .locator('#ts-menu-slideshow')
        .waitFor({ state: 'detached', timeout: 5000 })
        .catch(() => undefined);
      if (show.present) await leaveShow();
      await sleep(600);
      return {
        ok: focused.includes('present.arrow') && open,
        observed: `focus before Enter ${focused}; after key down: menu ${afterDown.open}, focus ${afterDown.focus}, show ${afterDown.show}; after key up: menu ${open}, focus ${focusInMenu}, show ${show.present}; popups ${JSON.stringify(popups.map((u) => u.replace(BASE, '')))}; focus after Escape ${await activeDesc(page)}`,
      };
    },
    { reset: () => closeMenus(page) },
  );
  await interaction(
    'Split button',
    'Focus the chevron half, press Space: the menu opens',
    async () => {
      await page.locator('.ts-title-present-arrow').focus();
      await press(page, ' ');
      const open = await has(page, '#ts-menu-slideshow');
      await press(page, 'Escape');
      await page
        .locator('#ts-menu-slideshow')
        .waitFor({ state: 'detached', timeout: 5000 })
        .catch(() => undefined);
      return { ok: open, observed: `menu open ${open}` };
    },
    { reset: () => closeMenus(page) },
  );
  await interaction(
    'Split button',
    'Focus the Slideshow half, press ArrowDown: does the menu open (the split button pattern)',
    async () => {
      await page.locator('.ts-title-present').focus();
      const before = await activeDesc(page);
      await press(page, 'ArrowDown');
      await sleep(300);
      const open = await has(page, '#ts-menu-slideshow');
      const present = (await state(page)).present === true;
      if (open) await press(page, 'Escape');
      if (present) await leaveShow();
      return {
        ok: open,
        observed: `focus ${before}; menu open after ArrowDown ${open}; present ${present}`,
      };
    },
  );
  await interaction(
    'Split button',
    'Focus the Slideshow half, press Enter: the show opens; Escape leaves it',
    async () => {
      await page.locator('.ts-title-present').focus();
      const focusRing = await page.evaluate(() => {
        const el = document.querySelector('.ts-title-present');
        const cs = getComputedStyle(el);
        return {
          focusVisible: el.matches(':focus-visible'),
          outline: `${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineStyle} offset ${cs.outlineOffset}`,
        };
      });
      shots.focusLabel = await shot(
        page,
        `${BOOT}-14-split-focus-label.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
      );
      await press(page, 'Enter');
      const on = await presentOn();
      await leaveShow();
      return {
        ok: on,
        observed: `focus-visible ${focusRing.focusVisible} outline ${focusRing.outline}; present ${on}; after Escape present ${(await state(page)).present}`,
      };
    },
    { reset: () => leaveShow().catch(() => undefined) },
  );
  await interaction(
    'Split button',
    'Focus the Slideshow half, press Space: the show opens; Escape leaves it',
    async () => {
      await page.locator('.ts-title-present').focus();
      await press(page, ' ');
      const on = await presentOn();
      await leaveShow();
      return {
        ok: on,
        observed: `present ${on}; after Escape present ${(await state(page)).present}`,
      };
    },
    { reset: () => leaveShow().catch(() => undefined) },
  );

  // ---- 4. Share, the save words, the comments glyph, the presence chips
  await interaction(
    'Share',
    'Click Share in the title row: the Share dialog opens; Escape closes it',
    async () => {
      const r = await rectOf(page, '.ts-title-share');
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('[data-control="dialog.share"]').waitFor({ timeout: 8000 });
      const title = await page.evaluate(
        () =>
          document
            .querySelector(
              '[data-control="dialog.share"] h1, [data-control="dialog.share"] h2, [data-control="dialog.share"] [role="heading"]',
            )
            ?.textContent?.trim() ?? null,
      );
      shots.share = await shot(page, `${BOOT}-15-share-dialog.png`);
      await press(page, 'Escape');
      const gone = await page
        .locator('[data-control="dialog.share"]')
        .waitFor({ state: 'detached', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      await parkMouse(page);
      return {
        ok: gone,
        observed: `dialog title ${JSON.stringify(title)}; closed on Escape ${gone}`,
      };
    },
    { reset: () => closeMenus(page) },
  );
  await interaction('Share', 'Hover Share and read its edge', async () => {
    const r = await rectOf(page, '.ts-title-share');
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    const e = await edgesOf(page, '.ts-title-share');
    await parkMouse(page);
    return { ok: true, observed: `hover border ${e.top} bg ${e.background} color ${e.color}` };
  });
  await interaction(
    'Save words',
    'Read the save words and the Last edit clock after the write',
    async () => {
      const words = await page.evaluate(() => ({
        text: document.querySelector('.ts-title-save-live')?.textContent ?? null,
        state: document.querySelector('.ts-title-save')?.getAttribute('data-state'),
        clock: document.querySelector('.ts-title-clock')?.getAttribute('aria-label'),
      }));
      return { ok: words.text !== null, observed: JSON.stringify(words) };
    },
  );
  await interaction(
    'Comments glyph',
    'Click Show all comments in the title row: the Comments panel opens; click again closes it',
    async () => {
      if (!(await has(page, '.ts-title-comments')))
        return { ok: null, observed: 'no comments glyph in the row' };
      await clickControl(page, 'title.comments');
      const pressed = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-comments')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'true',
        6000,
      );
      const panel = await page.evaluate(
        () => document.querySelector('.ts-panel-title')?.textContent?.trim() ?? null,
      );
      const panelEdges = await edgesOf(page, '.ts-panel');
      shots.commentsPanel = await shot(page, `${BOOT}-16-comments-panel-open.png`);
      const rp = await boundaryPoints(page);
      const img = decodePng(await page.screenshot());
      notes['light-1x-rpanel-seam'] = seamsFromShot(img, rp);
      await clickControl(page, 'title.comments');
      const after = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-comments')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'false',
        4000,
      );
      let closedBy = 'second click';
      if (after !== 'false') {
        /* the second click did not close it: the panel's own X, then the bottom bar chevron */
        if (await has(page, '.ts-panel-x')) {
          await clickControl(page, 'panel.close').catch(async () => {
            const r = await rectOf(page, '.ts-panel-x');
            await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
          });
          closedBy = 'the panel X';
        }
      }
      const finallyPressed = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-comments')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'false',
        4000,
      );
      await parkMouse(page);
      return {
        ok: pressed === 'true' && after === 'false',
        observed: `aria-pressed ${pressed}; panel "${panel}"; panel left edge ${panelEdges?.left}; after second click ${after}; closed by ${closedBy}: aria-pressed ${finallyPressed}; right panel seam ${JSON.stringify(notes['light-1x-rpanel-seam']['sheet -> right panel (vertical)'])}`,
      };
    },
    { reset: () => press(page, 'Escape', 2) },
  );
  await interaction(
    'Presence chips',
    'Read the presence slot: chips, the +N chip, the rule and the own chip while alone',
    async () => {
      const p = await page.evaluate(() => {
        const slot = document.querySelector('.ts-presence');
        return {
          present: Boolean(slot),
          width: slot?.getBoundingClientRect().width,
          chips: document.querySelectorAll('[data-control^="presence.chip."]').length,
          emptySlots: document.querySelectorAll('.ts-presence-slot.is-empty').length,
          more: document.querySelector('.ts-presence-more')?.className,
          rule: document.querySelector('.ts-presence-rule')
            ? getComputedStyle(document.querySelector('.ts-presence-rule')).backgroundColor
            : null,
          me: document.querySelector('.ts-presence-me')
            ? {
                control: document.querySelector('.ts-presence-me').getAttribute('data-control'),
                label: document.querySelector('.ts-presence-me').getAttribute('aria-label'),
              }
            : null,
        };
      });
      return { ok: p.present, observed: JSON.stringify(p) };
    },
  );

  // ---- 5. Tools > Advanced tools, the inbox plate, View > Appearance > Dark
  await interaction(
    'Advanced tools',
    'Tools > Advanced tools: the row checks and the parked title row plate appears',
    async () => {
      await openMenu(page, 'tools');
      if (!(await has(page, '[data-control="menu.tools.advancedTools"]'))) {
        await closeMenus(page);
        return { ok: null, observed: 'no Advanced tools row in Tools' };
      }
      await clickRow(page, 'tools.advancedTools');
      await sleep(400);
      const inbox = await pollUntil(
        () => has(page, '.ts-title-inbox'),
        (v) => v === true,
        6000,
      );
      await closeMenus(page);
      await parkMouse(page);
      return {
        ok: inbox,
        observed: `inbox plate present ${inbox}; setting stored ${await page.evaluate(() => {
          try {
            return localStorage.getItem('ts-editor-settings');
          } catch {
            return null;
          }
        })}`,
      };
    },
    { reset: () => closeMenus(page) },
  );
  const mAdvanced = await measure(page, `${LIGHT_TAG}-advanced`);
  shots.advancedCluster = await shot(
    page,
    `${BOOT}-17-right-cluster-advanced.png`,
    crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
  );
  record(
    'Right cluster',
    'Read the right cluster with the switch on (the inbox plate drawn)',
    'works',
    JSON.stringify({
      gaps: mAdvanced.clusterGaps,
      inbox: mAdvanced.cluster['.ts-title-inbox'],
      aria: mAdvanced.aria.inbox,
    }).slice(0, 1400),
  );
  await interaction(
    'Inbox plate',
    'Click the inbox plate: the Notifications panel opens; click again closes it',
    async () => {
      await clickControl(page, 'title.inbox');
      const on = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-inbox')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'true',
        6000,
      );
      const panel = await page.evaluate(
        () => document.querySelector('.ts-panel-title')?.textContent?.trim() ?? null,
      );
      await clickControl(page, 'title.inbox');
      const off = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-inbox')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'false',
        4000,
      );
      let closedBy = 'second click';
      if (off !== 'false') {
        const r = await rectOf(page, '.ts-panel-x');
        if (r) {
          await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
          closedBy = 'the panel X';
        }
      }
      const finallyPressed = await pollUntil(
        () =>
          page.evaluate(() =>
            document.querySelector('.ts-title-inbox')?.getAttribute('aria-pressed'),
          ),
        (v) => v === 'false',
        4000,
      );
      await parkMouse(page);
      return {
        ok: on === 'true' && off === 'false',
        observed: `aria-pressed ${on}; panel "${panel}"; after second click ${off}; closed by ${closedBy}: aria-pressed ${finallyPressed}`,
      };
    },
    { reset: () => press(page, 'Escape', 2) },
  );

  const setAppearance = async (which) => {
    await openMenu(page, 'view');
    if (!(await has(page, '[data-control="menu.view.appearance"]'))) {
      await closeMenus(page);
      return { ok: null, observed: 'no Appearance row in View' };
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
    return {
      ok: t === which,
      observed: `data-theme ${t}; stored ${await page.evaluate(() => {
        try {
          return localStorage.getItem('ts-chrome-appearance');
        } catch {
          return null;
        }
      })}`,
    };
  };
  await interaction(
    'Appearance',
    `View > Appearance > ${OTHER === 'dark' ? 'Dark' : 'Light'} (with the switch on): the chrome changes appearance`,
    () => setAppearance(OTHER),
    { reset: () => closeMenus(page) },
  );

  // ---- 6. the other appearance at 1x
  const darkTag = `${OTHER}-1x`;
  const setDark = await pictureSet(page, darkTag);
  shots[darkTag] = setDark.files;
  const mDark = await measure(page, darkTag);
  const imgDark = decodePng(await page.screenshot());
  notes[`${darkTag}-seams`] = seamsFromShot(imgDark, setDark.pts);
  {
    const titleImg = decodePng(
      await page.screenshot({
        clip: { x: 0, y: setDark.pts.title.y, width: 1440, height: setDark.pts.title.height },
      }),
    );
    notes[`${darkTag}-split-seam`] = splitSeamFromShot(
      titleImg,
      mDark.cluster['.ts-title-present'].rect,
      mDark.cluster['.ts-title-present-arrow'].rect,
      { x: 0, y: setDark.pts.title.y },
    );
  }
  record(
    'Separators',
    `Read every seam of the chrome rows from the whole editor screenshot in the ${OTHER} appearance`,
    'works',
    JSON.stringify(notes[`${darkTag}-seams`]).slice(0, 1200),
  );
  record(
    'Split button',
    `Read the geometry and the computed edges of the Slideshow split button, rested, ${OTHER} appearance`,
    'works',
    JSON.stringify({
      present: mDark.cluster['.ts-title-present'],
      arrow: mDark.cluster['.ts-title-present-arrow'],
      seam: notes[`${darkTag}-split-seam`],
    }).slice(0, 1600),
  );
  await interaction(
    'Split button',
    `Hover the Slideshow half in the ${OTHER} appearance and read both halves`,
    async () => {
      const r = await presentRect();
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const h = await halves();
      shots.hoverLabelDark = await shot(
        page,
        `${OTHER}-10-split-hover-label.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
      );
      await parkMouse(page);
      return {
        ok: h.present.hovered,
        observed: `Slideshow half bg ${h.present.background} color ${h.present.color}; arrow half bg ${h.arrow.background} color ${h.arrow.color}`,
      };
    },
  );
  await interaction(
    'Split button',
    `Hover the chevron half in the ${OTHER} appearance and read both halves`,
    async () => {
      const r = await arrowRect();
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const h = await halves();
      shots.hoverArrowOther = await shot(
        page,
        `${OTHER}-11-split-hover-arrow.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: 46 }),
      );
      await parkMouse(page);
      return {
        ok: h.arrow.hovered,
        observed: `arrow half bg ${h.arrow.background} color ${h.arrow.color}; Slideshow half bg ${h.present.background} color ${h.present.color}`,
      };
    },
  );
  await interaction(
    'Split button',
    `Click the chevron half in the ${OTHER} appearance: the menu opens; Escape closes it`,
    async () => {
      const r = await arrowRect();
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('#ts-menu-slideshow').waitFor({ timeout: 5000 });
      const menuRect = await rectOf(page, '#ts-menu-slideshow');
      shots.menuOpenOther = await shot(
        page,
        `${OTHER}-12-split-menu-open.png`,
        crop({ x: 1440 - 620, y: 0, w: 620, h: Math.min(260, menuRect.y + menuRect.h + 8) }),
      );
      await press(page, 'Escape');
      await page.locator('#ts-menu-slideshow').waitFor({ state: 'detached', timeout: 5000 });
      await parkMouse(page);
      return {
        ok: true,
        observed: `menu at x ${Math.round(menuRect.x)} y ${Math.round(menuRect.y)} w ${Math.round(menuRect.w)}`,
      };
    },
    { reset: () => closeMenus(page) },
  );

  // ---- 7. the after pictures: the proposed rules injected, the other appearance then the boot one
  const injected = await page.addStyleTag({ content: PROPOSED_CSS });
  await sleep(300);
  const afterSet = async (tag) => {
    const vp = page.viewportSize();
    const pts = await boundaryPoints(page);
    const out = {};
    out.titleRow = path.join(CHROME, `after-${tag}-title-row.png`);
    await page.screenshot({
      path: out.titleRow,
      clip: crop({ x: 0, y: pts.title.y, w: vp.width, h: pts.title.height + 2 }, 0, vp),
    });
    out.cluster = path.join(CHROME, `after-${tag}-right-cluster.png`);
    await page.screenshot({
      path: out.cluster,
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    out.toolbarSheet = path.join(CHROME, `after-${tag}-toolbar-sheet-boundary.png`);
    await page.screenshot({
      path: out.toolbarSheet,
      clip: crop({ x: 0, y: pts.toolbar.bottom - 14, w: vp.width, h: 40 }, 0, vp),
    });
    if (pts.notesSlot) {
      out.notesDivider = path.join(CHROME, `after-${tag}-notes-divider.png`);
      await page.screenshot({
        path: out.notesDivider,
        clip: crop(
          { x: pts.notesSlot.x, y: pts.notesSlot.top - 16, w: pts.notesSlot.width, h: 40 },
          0,
          vp,
        ),
      });
    }
    const r = await presentRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    out.hoverLabel = path.join(CHROME, `after-${tag}-split-hover-label.png`);
    await page.screenshot({
      path: out.hoverLabel,
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    const a = await arrowRect();
    await hoverAt(page, a.x + a.w / 2, a.y + a.h / 2);
    out.hoverArrow = path.join(CHROME, `after-${tag}-split-hover-arrow.png`);
    await page.screenshot({
      path: out.hoverArrow,
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    await parkMouse(page);
    await page.locator('.ts-title-present-arrow').focus();
    out.focusArrow = path.join(CHROME, `after-${tag}-split-focus-arrow.png`);
    await page.screenshot({
      path: out.focusArrow,
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    await page.evaluate(() => document.activeElement?.blur());
    const m = await measure(page, `after-${tag}`);
    const img = decodePng(await page.screenshot());
    notes[`after-${tag}-seams`] = seamsFromShot(img, pts);
    const titleImg = decodePng(
      await page.screenshot({
        clip: { x: 0, y: pts.title.y, width: vp.width, height: pts.title.height },
      }),
    );
    notes[`after-${tag}-split-seam`] = splitSeamFromShot(
      titleImg,
      m.cluster['.ts-title-present'].rect,
      m.cluster['.ts-title-present-arrow'].rect,
      { x: 0, y: pts.title.y },
    );
    return out;
  };
  shots.afterOther = await afterSet(OTHER);
  record(
    'After pictures',
    `Inject the proposed rules on the ${OTHER} appearance and screenshot the title row, the split button states and the two boundaries`,
    'works',
    `${JSON.stringify(Object.values(shots.afterOther).map((p) => path.relative(OUT, p)))}; split seam ${JSON.stringify(notes[`after-${OTHER}-split-seam`])}; notes seam ${JSON.stringify(notes[`after-${OTHER}-seams`]['stage -> notes pane'])}`,
  );
  await interaction(
    'Appearance',
    `View > Appearance > ${BOOT === 'dark' ? 'Dark' : 'Light'}: back to the boot appearance`,
    () => setAppearance(BOOT),
    { reset: () => closeMenus(page) },
  );
  shots.afterBoot = await afterSet(BOOT);
  record(
    'After pictures',
    `Screenshot the same set on the ${BOOT} appearance with the rules injected`,
    'works',
    `${JSON.stringify(Object.values(shots.afterBoot).map((p) => path.relative(OUT, p)))}; split seam ${JSON.stringify(notes[`after-${BOOT}-split-seam`])}; notes seam ${JSON.stringify(notes[`after-${BOOT}-seams`]['stage -> notes pane'])}`,
  );
  // the before pictures in the chrome folder are the rested crops without the injected rules
  await page.evaluate((el) => el.remove(), injected);
  await sleep(300);
  const beforeSet = async (tag) => {
    const vp = page.viewportSize();
    const pts = await boundaryPoints(page);
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-title-row.png`),
      clip: crop({ x: 0, y: pts.title.y, w: vp.width, h: pts.title.height + 2 }, 0, vp),
    });
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-right-cluster.png`),
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-toolbar-sheet-boundary.png`),
      clip: crop({ x: 0, y: pts.toolbar.bottom - 14, w: vp.width, h: 40 }, 0, vp),
    });
    if (pts.notesSlot)
      await page.screenshot({
        path: path.join(CHROME, `before-${tag}-notes-divider.png`),
        clip: crop(
          { x: pts.notesSlot.x, y: pts.notesSlot.top - 16, w: pts.notesSlot.width, h: 40 },
          0,
          vp,
        ),
      });
    const r = await presentRect();
    await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-split-hover-label.png`),
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    const a = await arrowRect();
    await hoverAt(page, a.x + a.w / 2, a.y + a.h / 2);
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-split-hover-arrow.png`),
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    await parkMouse(page);
    await page.locator('.ts-title-present-arrow').focus();
    await page.screenshot({
      path: path.join(CHROME, `before-${tag}-split-focus-arrow.png`),
      clip: crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
    });
    await page.evaluate(() => document.activeElement?.blur());
  };
  await beforeSet(BOOT);
  await interaction(
    'Appearance',
    `View > Appearance > ${OTHER === 'dark' ? 'Dark' : 'Light'} again, for the ${OTHER} before pictures`,
    () => setAppearance(OTHER),
    { reset: () => closeMenus(page) },
  );
  await beforeSet(OTHER);

  // ---- 8. the 900 px collapse (the other appearance, then the boot one)
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(900);
  const m900other = await measure(page, `${OTHER}-900`);
  {
    const pts = await boundaryPoints(page);
    shots.title900other = await shot(
      page,
      `${OTHER}-18-title-row-900.png`,
      crop({ x: 0, y: pts.title.y, w: 900, h: pts.title.height + 2 }, 0, { w: 900, h: 900 }),
    );
    shots.editor900other = await shot(page, `${OTHER}-19-editor-900.png`);
  }
  record(
    'Right cluster',
    `Resize the window to 900 px wide (${OTHER}): the labels leave, the widths of the cluster`,
    'works',
    JSON.stringify({
      gaps: m900other.clusterGaps,
      present: m900other.cluster['.ts-title-present']?.rect,
      arrow: m900other.cluster['.ts-title-present-arrow']?.rect,
      share: m900other.cluster['.ts-title-share']?.rect,
      labelShown: await page.evaluate(
        () => getComputedStyle(document.querySelector('.ts-title-present .pt-lb')).display,
      ),
      saveWordsShown: await page.evaluate(
        () => getComputedStyle(document.querySelector('.ts-title-save-words')).display,
      ),
    }).slice(0, 1400),
  );
  await interaction(
    'Appearance',
    `View > Appearance > ${BOOT === 'dark' ? 'Dark' : 'Light'} at 900 px`,
    () => setAppearance(BOOT),
    { reset: () => closeMenus(page) },
  );
  const m900boot = await measure(page, `${BOOT}-900`);
  {
    const pts = await boundaryPoints(page);
    shots.title900boot = await shot(
      page,
      `${BOOT}-18-title-row-900.png`,
      crop({ x: 0, y: pts.title.y, w: 900, h: pts.title.height + 2 }, 0, { w: 900, h: 900 }),
    );
    shots.editor900boot = await shot(page, `${BOOT}-19-editor-900.png`);
    const img = decodePng(await page.screenshot());
    notes[`${BOOT}-900-seams`] = seamsFromShot(img, pts);
  }
  record(
    'Right cluster',
    `Read the cluster at 900 px (${BOOT}) and the seams at that width`,
    'works',
    JSON.stringify({ gaps: m900boot.clusterGaps, seams: notes[`${BOOT}-900-seams`] }).slice(
      0,
      1400,
    ),
  );
  const injected900 = await page.addStyleTag({ content: PROPOSED_CSS });
  await sleep(300);
  {
    const pts = await boundaryPoints(page);
    await page.screenshot({
      path: path.join(CHROME, `after-${BOOT}-900-title-row.png`),
      clip: crop({ x: 0, y: pts.title.y, w: 900, h: pts.title.height + 2 }, 0, { w: 900, h: 900 }),
    });
    const m = await measure(page, `after-${BOOT}-900`);
    record(
      'After pictures',
      `The proposed rules at 900 px (${BOOT})`,
      'works',
      JSON.stringify({
        present: m.cluster['.ts-title-present']?.rect,
        arrow: m.cluster['.ts-title-present-arrow']?.rect,
        gaps: m.clusterGaps?.gaps,
      }).slice(0, 800),
    );
  }
  await page.evaluate((el) => el.remove(), injected900);
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(600);

  // ---- 9. the 2x pictures in a second context: the same menus driven again
  /* the same browser identity as context A (its cookies and storage), so the deck opens for its
     owner and not for a stranger; the switch and the appearance travel with it */
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState: await contextA.storageState(),
  });
  const pageB = await contextB.newPage();
  wireConsole(pageB, 'B');
  contextB.on('page', (p) => p.close().catch(() => undefined));
  try {
    await pageB.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady(pageB);
    await dismissNamePrompt(pageB);
    await pollUntil(
      () => state(pageB),
      (s) => s.sync?.connected === true,
      20_000,
    );
    await parkMouse(pageB);
    await sleep(800);
    const tB = await theme(pageB);
    const setB = await pictureSet(pageB, `${tB}-2x`);
    shots[`${tB}-2x`] = setB.files;
    await measure(pageB, `${tB}-2x`);
    record(
      'Pictures',
      `The 2x picture set in the ${tB} appearance on a second browser context`,
      'works',
      JSON.stringify(Object.values(setB.files).map((p) => path.relative(OUT, p))),
    );
    const pageBRef = pageB;
    const openMenuB = (id) => openMenu(pageBRef, id);
    await interaction(
      'Advanced tools',
      'Tools > Advanced tools on a second browser context (the switch is per browser)',
      async () => {
        await openMenuB('tools');
        await clickRow(pageBRef, 'tools.advancedTools');
        const inbox = await pollUntil(
          () => has(pageBRef, '.ts-title-inbox'),
          (v) => v === true,
          6000,
        );
        await closeMenus(pageBRef);
        await parkMouse(pageBRef);
        return { ok: inbox, observed: `inbox plate present ${inbox}` };
      },
      { reset: () => closeMenus(pageBRef) },
    );
    const otherB = tB === 'dark' ? 'light' : 'dark';
    await interaction(
      'Appearance',
      `View > Appearance > ${otherB === 'dark' ? 'Dark' : 'Light'} on the second context`,
      async () => {
        await openMenuB('view');
        await hoverRow(
          pageBRef,
          'view.appearance',
          `[data-control="menu.view.appearance.${otherB}"]`,
        );
        await clickRow(pageBRef, `view.appearance.${otherB}`);
        const t = await pollUntil(
          () => theme(pageBRef),
          (v) => v === otherB,
          6000,
        );
        await closeMenus(pageBRef);
        await parkMouse(pageBRef);
        await sleep(500);
        return { ok: t === otherB, observed: `data-theme ${t}` };
      },
      { reset: () => closeMenus(pageBRef) },
    );
    const setB2 = await pictureSet(pageB, `${otherB}-2x`);
    shots[`${otherB}-2x`] = setB2.files;
    await measure(pageB, `${otherB}-2x`);
    record(
      'Pictures',
      `The 2x picture set in the ${otherB} appearance`,
      'works',
      JSON.stringify(Object.values(setB2.files).map((p) => path.relative(OUT, p))),
    );
    // the 2x split seam read from the crop, at three heights
    for (const [tag, set] of [
      [`${tB}-2x`, setB],
      [`${otherB}-2x`, setB2],
    ]) {
      const m = notes[tag];
      const pts = set.pts;
      if (tag !== `${otherB}-2x`) {
        /* the boot appearance crop is taken again now that the appearance changed: use the stored one */
        continue;
      }
      const titleImg = decodePng(
        await pageB.screenshot({
          clip: { x: 0, y: pts.title.y, width: 1440, height: pts.title.height },
        }),
      );
      const pr = m.cluster['.ts-title-present'].rect;
      const ar = m.cluster['.ts-title-present-arrow'].rect;
      const x0 = Math.round((pr.x + pr.w - 6) * 2);
      const x1 = Math.round((ar.x + 6) * 2);
      notes[`${tag}-split-seam`] = {
        mid: runsAlongRow(titleImg, Math.round((pr.y + pr.h / 2 - pts.title.y) * 2), x0, x1),
        top2: runsAlongRow(titleImg, Math.round((pr.y + 2 - pts.title.y) * 2), x0, x1),
        top1: runsAlongRow(titleImg, Math.round((pr.y + 1 - pts.title.y) * 2) + 1, x0, x1),
      };
      record(
        'Split button',
        `Read the divider between the halves from the 2x ${otherB} crop at mid height and 1 to 2 px under the top edge`,
        'works',
        JSON.stringify(notes[`${tag}-split-seam`]),
      );
    }
  } finally {
    await contextB.close().catch(() => undefined);
  }
} catch (error) {
  record(
    'The run',
    'The run itself',
    'broken',
    `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
} finally {
  // ---- 10. File > Move to trash, Delete forever, 404
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
      trashed = true;
    } catch (error) {
      record(
        'Scratch deck',
        'The product trash path',
        'broken',
        `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the window API`,
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
    for (const route of ['edit', 'deck']) {
      let status = 0;
      const until = Date.now() + 25_000;
      for (;;) {
        try {
          const res = await page.request.get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 });
          status = res.status();
        } catch (e) {
          status = -1;
        }
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record(
        'Scratch deck',
        `GET /${route}/${deckId} answers 404`,
        status === 404 ? 'works' : 'broken',
        `status ${status}`,
      );
    }
  }
  await browser.close().catch(() => undefined);
  const summary = {
    base: BASE,
    deckId,
    startedAt,
    finishedAt: new Date().toISOString(),
    rows,
    notes,
    consoleErrors,
    shots,
    proposedCss: PROPOSED_CSS,
  };
  const jsonPath = path.join(OUT, 'audit-chrome-run.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  log(
    `\nrows ${rows.length}: ${rows.filter((r) => r.result === 'works').length} works, ${rows.filter((r) => r.result === 'flaky').length} flaky, ${rows.filter((r) => r.result === 'broken').length} broken, ${rows.filter((r) => r.result === 'not driven').length} not driven; console errors ${consoleErrors.length}; json ${jsonPath}`,
  );
}

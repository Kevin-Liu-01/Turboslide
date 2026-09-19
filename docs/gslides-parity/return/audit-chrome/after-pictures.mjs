#!/usr/bin/env node
// The before and after pictures of the chrome rows audit (docs/gslides-parity/return/audit-chrome.md
// section on the spec): the same title row, right cluster, split button states, toolbar boundary and
// notes divider, first as production draws them, then with the proposed rules injected through
// page.addStyleTag (no source edit), in both appearances at 1440 and at 900, on one scratch deck
// created from /new and trashed and deleted forever in the finally block. Imports nothing from the
// repository but playwright-core.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/return/audit-chrome';
const CHROME = path.join(OUT, 'chrome');
mkdirSync(CHROME, { recursive: true });

const rows = [];
const notes = {};
const consoleErrors = [];
const log = (...a) => console.log(...a);
const record = (feature, interaction, result, evidence) => {
  const row = { n: rows.length + 1, feature, interaction, result, evidence };
  rows.push(row);
  log(
    `${{ works: 'ok  ', broken: 'FAIL', 'not driven': 'n/d ' }[result] ?? '????'} ${String(row.n).padStart(3)} ${feature} :: ${interaction}\n       ${evidence}`,
  );
};
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
const clickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
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
const dismissNamePrompt = async (page) => {
  if (await has(page, '[data-control="dialog.namePrompt"]')) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
    await sleep(200);
  }
};

// ---- a PNG reader (zlib only), as in audit-chrome.mjs
function decodePng(buf) {
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
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
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => {
      const i = y * stride + x * channels;
      return [out[i], out[i + 1], out[i + 2]];
    },
  };
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
function segmentsAlong(img, pts, key) {
  const out = [];
  const ok = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < img.width && y < img.height);
  if (ok.length === 0) return out;
  let start = 0;
  let color = img.pixel(...ok[0]);
  for (let i = 1; i <= ok.length; i += 1) {
    const c = i < ok.length ? img.pixel(...ok[i]) : null;
    if (c === null || differs(c, color)) {
      const prev = out.at(-1);
      const seg = {
        [key]: ok[start][key === 'y' ? 1 : 0],
        thickness: i - start,
        color: hex(color),
        rgb: color,
      };
      if (prev) seg.contrastToPrevious = Number(contrast(color, prev.rgb).toFixed(2));
      out.push(seg);
      if (c) {
        start = i;
        color = c;
      }
    }
  }
  return out.map(({ rgb, ...s }) => s);
}
const runsAlongColumn = (img, x, y0, y1) => {
  const pts = [];
  for (let y = Math.max(0, y0); y <= y1; y += 1) pts.push([x, y]);
  return segmentsAlong(img, pts, 'y');
};
const runsAlongRow = (img, y, x0, x1) => {
  const pts = [];
  for (let x = Math.max(0, x0); x <= x1; x += 1) pts.push([x, y]);
  return segmentsAlong(img, pts, 'x');
};

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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
context.on('page', (p) => p.close().catch(() => undefined));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

let deckId = '';
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  deckId = (await invoke(page, 'deck.info')).id;
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  const r0 = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
  await dblclickAt(page, r0.x + r0.w / 2, r0.y + r0.h / 2);
  await typeHuman(page, 'Chrome rows after pictures');
  await press(page, 'Escape');
  await waitRevision(page, 1, 30_000);
  await settled(page);
  await dismissNamePrompt(page);
  /* nothing selected, so the pictures show the rested chrome */
  await press(page, 'Escape', 2);
  await parkMouse(page);
  await sleep(1000);
  record('Scratch deck', 'Create the deck from /new', 'works', `${page.url().replace(BASE, '')}`);

  const BOOT = (await theme(page)) === 'light' ? 'light' : 'dark';
  const OTHER = BOOT === 'light' ? 'dark' : 'light';
  /* the switch, so View > Appearance is reachable */
  await openMenu(page, 'tools');
  await clickRow(page, 'tools.advancedTools');
  await closeMenus(page);
  await parkMouse(page);
  const setAppearance = async (which) => {
    await openMenu(page, 'view');
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
    return t;
  };

  const presentRect = () => rectOf(page, '.ts-title-present');
  const arrowRect = () => rectOf(page, '.ts-title-present-arrow');
  const clip = (x, y, w, h) => ({ x: Math.max(0, x), y: Math.max(0, y), width: w, height: h });
  const splitEdges = () =>
    page.evaluate(() => {
      const read = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          radius: [
            cs.borderTopLeftRadius,
            cs.borderTopRightRadius,
            cs.borderBottomRightRadius,
            cs.borderBottomLeftRadius,
          ].join(' '),
          left: `${cs.borderLeftWidth} ${cs.borderLeftColor}`,
          background: cs.backgroundColor,
          color: cs.color,
          padding: cs.padding,
          flexDirection: cs.flexDirection,
        };
      };
      return {
        wrapper: read('.ts-title-slideshow'),
        present: read('.ts-title-present'),
        arrow: read('.ts-title-present-arrow'),
        share: read('.ts-title-share'),
      };
    });
  /**
   * The picture set of one state: the title row, the right cluster, the label hover, the arrow
   * hover, the arrow focus, the open menu, the toolbar boundary and the notes divider, plus the
   * split seam and the notes seam read from the pixels.
   */
  const pictures = async (prefix, width) => {
    const vw = width;
    const title = await rectOf(page, '.ts-title-row');
    const toolbar = await rectOf(page, '.ts-toolbar');
    const notesSlot = await rectOf(page, '.pt-viewer.is-editor > .pt-main > .ts-notes-slot');
    const files = [];
    const take = async (name, c) => {
      const p = path.join(CHROME, `${prefix}-${name}.png`);
      await page.screenshot({ path: p, clip: c });
      files.push(path.relative(OUT, p));
      return p;
    };
    const clusterClip = clip(vw - 620, title.y, 620, title.h + 2);
    await take('title-row', clip(0, title.y, vw, title.h + 2));
    await take('right-cluster', clusterClip);
    await take('toolbar-sheet-boundary', clip(0, toolbar.y + toolbar.h - 14, vw, 40));
    if (notesSlot && notesSlot.h > 0)
      await take('notes-divider', clip(notesSlot.x, notesSlot.y - 16, notesSlot.w, 40));
    const pr = await presentRect();
    await hoverAt(page, pr.x + pr.w / 2, pr.y + pr.h / 2);
    await take('split-hover-label', clusterClip);
    const ar = await arrowRect();
    await hoverAt(page, ar.x + ar.w / 2, ar.y + ar.h / 2);
    await take('split-hover-arrow', clusterClip);
    await parkMouse(page);
    await page.locator('.ts-title-present-arrow').focus();
    await take('split-focus-arrow', clusterClip);
    await page.evaluate(() => document.activeElement?.blur());
    await clickAt(page, ar.x + ar.w / 2, ar.y + ar.h / 2);
    await page
      .locator('#ts-menu-slideshow')
      .waitFor({ timeout: 5000 })
      .catch(() => undefined);
    const menuRect = await rectOf(page, '#ts-menu-slideshow');
    await take(
      'split-menu-open',
      clip(
        vw - 620,
        title.y,
        620,
        menuRect ? Math.min(260, menuRect.y + menuRect.h + 8) : title.h + 2,
      ),
    );
    await press(page, 'Escape');
    await page
      .locator('#ts-menu-slideshow')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => undefined);
    await page.evaluate(() => document.activeElement?.blur());
    await parkMouse(page);
    await sleep(300);
    /* the pixels: the split seam at mid height and near the top edge, the notes seam */
    const edges = await splitEdges();
    const img = decodePng(await page.screenshot());
    const p = edges.present.rect;
    const a = edges.arrow.rect;
    const x0 = Math.round(p.x + p.w - 6);
    const x1 = Math.round(a.x + 6);
    const seam = {
      mid: runsAlongRow(img, Math.round(p.y + p.h / 2), x0, x1),
      top1: runsAlongRow(img, Math.round(p.y + 1), x0, x1),
      top2: runsAlongRow(img, Math.round(p.y + 2), x0, x1),
    };
    const notesSeam =
      notesSlot && notesSlot.h > 0
        ? runsAlongColumn(
            img,
            Math.round(notesSlot.x + notesSlot.w * 0.25),
            Math.round(notesSlot.y - 6),
            Math.round(notesSlot.y + 6),
          )
        : null;
    const toolbarSeam = runsAlongColumn(
      img,
      700,
      Math.round(toolbar.y + toolbar.h - 6),
      Math.round(toolbar.y + toolbar.h + 6),
    );
    notes[prefix] = { edges, seam, notesSeam, toolbarSeam, files };
    record(
      'Pictures',
      `${prefix}: the set`,
      'works',
      `${files.length} files; split seam mid ${JSON.stringify(seam.mid)}; top1 ${JSON.stringify(seam.top1)}; notes seam ${JSON.stringify(notesSeam)}; wrapper ${JSON.stringify(edges.wrapper)}; arrow left ${edges.arrow?.left}; share radius ${edges.share?.radius}`,
    );
  };

  /* boot appearance: before, then after */
  await pictures(`before-${BOOT}`, 1440);
  let tag = await page.addStyleTag({ content: PROPOSED_CSS });
  await sleep(300);
  await pictures(`after-${BOOT}`, 1440);
  await page.evaluate((el) => el.remove(), tag);
  await sleep(300);
  /* the other appearance */
  const t2 = await setAppearance(OTHER);
  record(
    'Appearance',
    `View > Appearance > ${OTHER}`,
    t2 === OTHER ? 'works' : 'broken',
    `data-theme ${t2}`,
  );
  await pictures(`before-${OTHER}`, 1440);
  tag = await page.addStyleTag({ content: PROPOSED_CSS });
  await sleep(300);
  await pictures(`after-${OTHER}`, 1440);
  /* 900 px in the other appearance, after then before */
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(900);
  await pictures(`after-${OTHER}-900`, 900);
  await page.evaluate((el) => el.remove(), tag);
  await sleep(300);
  await pictures(`before-${OTHER}-900`, 900);
  /* 900 px in the boot appearance */
  const t3 = await setAppearance(BOOT);
  record(
    'Appearance',
    `View > Appearance > ${BOOT} at 900`,
    t3 === BOOT ? 'works' : 'broken',
    `data-theme ${t3}`,
  );
  await pictures(`before-${BOOT}-900`, 900);
  tag = await page.addStyleTag({ content: PROPOSED_CSS });
  await sleep(300);
  await pictures(`after-${BOOT}-900`, 900);
  await page.evaluate((el) => el.remove(), tag);
  await page.setViewportSize({ width: 1440, height: 900 });
} catch (error) {
  record(
    'The run',
    'The run itself',
    'broken',
    `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
} finally {
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
          status = (
            await page.request.get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 })
          ).status();
        } catch {
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
  writeFileSync(
    path.join(OUT, 'after-pictures-run.json'),
    JSON.stringify(
      { base: BASE, deckId, rows, notes, consoleErrors, proposedCss: PROPOSED_CSS },
      null,
      2,
    ),
  );
  log(`\nrows ${rows.length}; console errors ${consoleErrors.length}`);
}

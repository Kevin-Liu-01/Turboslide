#!/usr/bin/env node
// The integrator's chrome pictures of the return round (docs/RETURN.md section 4; the integrator's
// prompt: "the title row and the boundaries in both appearances at 1440"): one scratch deck from
// /new on the base, both appearances through View > Appearance, the whole editor, the title row,
// the right cluster and the five row boundaries shot at 1x, with the pixel readings of RETURN.md
// 4.4 beside them (the eleven seams through the core walk's `seamsFromShot`, the split button's
// divider through `splitSeamFromShot`, the cluster's gaps from the DOM). The deck is moved to the
// trash and deleted forever at the end. Off localhost the requests carry VERCEL_OIDC_TOKEN as
// x-vercel-trusted-oidc-idp-token (a preview sits behind Vercel Authentication); the token is
// read from the environment and never printed.
//
//   VERCEL_OIDC_TOKEN=... node docs/gslides-parity/return/build/integrator/shoot-integrator.mjs --base <origin> [--out <dir>] [--tag <name>]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  boundaryPoints,
  contrast,
  decodePng,
  seamsFromShot,
  splitSeamFromShot,
} from '../../../../../scripts/probes/core-walk/toolkit.mjs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4408').replace(/\/$/, '');
const OUT = arg(
  'out',
  '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/return/build/integrator',
);
const TAG = arg('tag', /localhost|127\.0\.0\.1/.test(BASE) ? 'local' : 'preview');
mkdirSync(OUT, { recursive: true });
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = !LOCAL && OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const rows = [];
const notes = {};
const consoleErrors = [];
const log = (line) => process.stdout.write(`${line}\n`);
const record = (area, interaction, result, evidence) => {
  const row = { n: rows.length + 1, area, interaction, result, evidence };
  rows.push(row);
  const tag = { works: 'ok  ', broken: 'FAIL', 'not driven': 'n/d ' }[result] ?? '????';
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

// ---- human speed
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
const parkMouse = async (page) => {
  await page.mouse.move(720, 600);
  await sleep(250);
};

// ---- the product
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

// ---- the readings
const edgesOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      radius: cs.borderRadius,
      border: cs.borderTop,
      left: cs.borderLeft,
      background: cs.backgroundColor,
      opacity: cs.opacity,
      display: cs.display,
    };
  }, sel);
const CLUSTER_SELECTORS = [
  '.ts-title-r',
  '.ts-presence',
  '.ts-presence-more',
  '.ts-title-comments-slot',
  '.ts-title-inbox-slot',
  '.ts-title-slideshow',
  '.ts-title-present',
  '.ts-title-present-arrow',
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
    };
  });
const crop = (box, pad, vp) => {
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  return {
    x,
    y,
    width: Math.min(vp.width - x, Math.ceil(box.w + pad * 2)),
    height: Math.min(vp.height - y, Math.ceil(box.h + pad * 2)),
  };
};
const shot = async (page, name, clip) => {
  const file = path.join(OUT, `${TAG}-${name}`);
  /* a seam whose box read empty on this page (a built deployment's layout, a closed pane) is
     recorded rather than thrown: the run's other pictures stand */
  if (clip && (clip.width <= 0 || clip.height <= 0)) {
    record('Pictures', `${name} skipped`, 'not driven', `empty crop ${JSON.stringify(clip)}`);
    return null;
  }
  await page.screenshot(clip ? { path: file, clip } : { path: file });
  return file;
};
const pictureSet = async (page, tag) => {
  const vp = page.viewportSize();
  const raw = await boundaryPoints(page);
  notes[`${tag}-points`] = raw;
  /* the toolkit's boxes are {x, y, w, h}; the crops below read the edges */
  const box = (b) =>
    b && b.w > 0 && b.h > 0
      ? { ...b, width: b.w, height: b.h, top: b.y, bottom: b.y + b.h, right: b.x + b.w }
      : null;
  const pts = {
    ...raw,
    title: box(raw.title) ?? {
      x: 0,
      y: 0,
      w: vp.width,
      h: 44,
      width: vp.width,
      height: 44,
      top: 0,
      bottom: 44,
      right: vp.width,
    },
    menubar: box(raw.menubar),
    toolbar: box(raw.toolbar),
    sb: box(raw.sb),
    notesSlot: box(raw.notesSlot),
    bottom: box(raw.bottom) ?? {
      x: 0,
      y: vp.height - 32,
      w: vp.width,
      h: 32,
      width: vp.width,
      height: 32,
      top: vp.height - 32,
      bottom: vp.height,
      right: vp.width,
    },
  };
  await shot(page, `${tag}-01-editor.png`);
  await shot(
    page,
    `${tag}-02-title-row.png`,
    crop({ x: 0, y: pts.title.y, w: vp.width, h: pts.title.height + 2 }, 0, vp),
  );
  await shot(
    page,
    `${tag}-03-right-cluster.png`,
    crop({ x: vp.width - 620, y: pts.title.y, w: 620, h: pts.title.height + 2 }, 0, vp),
  );
  if (pts.menubar)
    await shot(
      page,
      `${tag}-04-menu-bar.png`,
      crop({ x: 0, y: pts.menubar.y - 2, w: vp.width, h: pts.menubar.height + 4 }, 0, vp),
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
  return { pts, raw };
};
const measureAppearance = async (page, tag) => {
  const { pts, raw } = await pictureSet(page, tag);
  const cluster = {};
  for (const sel of CLUSTER_SELECTORS) cluster[sel] = await edgesOf(page, sel);
  const gaps = await clusterGaps(page);
  const img = decodePng(await page.screenshot());
  const seams = seamsFromShot(img, raw);
  const titleImg = decodePng(
    await page.screenshot({
      clip: { x: 0, y: pts.title.y, width: page.viewportSize().width, height: pts.title.height },
    }),
  );
  const splitSeam = splitSeamFromShot(
    titleImg,
    cluster['.ts-title-present'].rect,
    cluster['.ts-title-present-arrow'].rect,
    { x: 0, y: pts.title.y },
  );
  // The seams are judged the way the chrome area judges them (chrome.separators.once): a run 1 to
  // 4 px thick that reads at 1.2:1 or more against the pixels before it is a hairline; a seam
  // holds exactly one 1 px hairline, and the menu bar to toolbar seam holds none.
  const judged = {};
  for (const [name, seam] of Object.entries(seams)) {
    const thin = seam.runs.filter((r) => r.thickness >= 1 && r.thickness <= 4);
    const hairline = thin.filter((r) => (r.contrastToPrevious ?? 1) >= 1.2);
    const wantNone = name === 'menu bar -> toolbar';
    judged[name] = {
      thin: thin.map((r) => `${r.color}x${r.thickness}`).join(' ') || 'none',
      ok: wantNone ? hairline.length === 0 : hairline.length === 1 && hairline[0].thickness === 1,
    };
  }
  // The split button's divider: one run up to 3 px thick at mid height, read against the
  // wrapper's ground at 1.7:1 or more (chrome.split.one-box).
  const rgbOf = (css) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ground =
    rgbOf(cluster['.ts-title-slideshow']?.background) ??
    hexToRgb(splitSeam.mid[0]?.color ?? '#000000');
  const thinMid = splitSeam.mid.filter((r) => r.thickness <= 3);
  const divider = thinMid.length === 1 ? thinMid[0] : null;
  const dividerContrast = divider
    ? Number(contrast(hexToRgb(divider.color), ground).toFixed(2))
    : null;
  notes[tag] = {
    viewport: page.viewportSize(),
    cluster,
    gaps,
    seams: judged,
    splitSeam: { ...splitSeam, divider, dividerContrast },
  };
  const seamSummary = Object.entries(judged)
    .map(([k, v]) => `${k}: ${v.thin}`)
    .join('; ');
  // Nine seams are on the page without the Comments panel (the sheet to right panel seam) and
  // without a filmstrip head; the core walk's chrome.separators.once row opens the panel and
  // reads ten or more. Here every seam present must hold.
  const once = Object.keys(judged).length >= 9 && Object.values(judged).every((v) => v.ok);
  record(
    'Separators',
    `The seams from the pixels (${tag})`,
    once ? 'works' : 'broken',
    `${Object.keys(judged).length} seams; ${seamSummary}`,
  );
  const w = cluster['.ts-title-slideshow'];
  record(
    'Split button',
    `The wrapper, the halves and the divider from the pixels (${tag})`,
    w && divider !== null && divider.thickness === 1 && (dividerContrast ?? 0) >= 1.7
      ? 'works'
      : 'broken',
    `wrapper ${w?.rect.w.toFixed(1)} by ${w?.rect.h} radius ${w?.radius} border ${w?.border}; label half ${cluster['.ts-title-present']?.rect.w.toFixed(1)} by ${cluster['.ts-title-present']?.rect.h} radius ${cluster['.ts-title-present']?.radius}; arrow ${cluster['.ts-title-present-arrow']?.rect.w} by ${cluster['.ts-title-present-arrow']?.rect.h} border-left ${cluster['.ts-title-present-arrow']?.left}; divider at mid ${splitSeam.mid.map((r) => `${r.color}x${r.thickness}`).join(' ')} contrast ${dividerContrast}; 1 px under the top ${splitSeam.top1.map((r) => `${r.color}x${r.thickness}`).join(' ')}; 2 px under ${splitSeam.top2.map((r) => `${r.color}x${r.thickness}`).join(' ')}`,
  );
  record(
    'Right cluster',
    `Gaps, heights, corners and the hidden slots (${tag})`,
    gaps && gaps.gaps.every((g) => g.gap === 8) && gaps.rightInset === 12 ? 'works' : 'broken',
    `${JSON.stringify(gaps)}; share ${cluster['.ts-title-share']?.rect.w.toFixed(1)} by ${cluster['.ts-title-share']?.rect.h} radius ${cluster['.ts-title-share']?.radius}; +N chip opacity ${cluster['.ts-presence-more']?.opacity} w ${cluster['.ts-presence-more']?.rect.w}; inbox slot display ${cluster['.ts-title-inbox-slot']?.display}`,
  );
};

// ---- the run
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  extraHTTPHeaders,
});
const page = await context.newPage();
context.on('page', (p) => p.close().catch(() => undefined));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
let deckId = null;
const startedAt = new Date().toISOString();

try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  await step('Scratch deck', 'Double click the title on /new, type, Escape', async () => {
    const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
    await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await typeHuman(page, 'Return round chrome');
    await press(page, 'Escape');
    const rev = await waitRevision(page, 1, 30_000);
    await settled(page);
    await dismissNamePrompt(page);
    await sleep(1200);
    deckId = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? null;
    return {
      ok: /\/edit\//.test(page.url()) && rev >= 1,
      observed: `${page.url().replace(BASE, '')}; revision ${rev}`,
    };
  });
  await parkMouse(page);
  const boot = await theme(page);
  record(
    'Appearance',
    'The appearance the fresh browser boots into',
    'works',
    `data-theme ${boot}`,
  );
  const ORDER = boot === 'light' ? ['light', 'dark'] : ['dark', 'light'];
  for (const which of ORDER) {
    await step('Appearance', `View > Appearance > ${which}`, () => setAppearance(page, which));
    await measureAppearance(page, `${which}-1440`);
  }
} catch (error) {
  record(
    'Run',
    'the run stopped',
    'broken',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  if (deckId) {
    try {
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
        /* deck.trash then deck.remove with confirm (the window API's delete forever; there is no
           deck.deleteForever action) at the revision the trash left */
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info && !info.trashed)
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
        const after = await invoke(page, 'deck.info').catch(() => info);
        await invoke(page, 'deck.remove', {
          id: deckId,
          confirm: true,
          baseRevision: after?.revision ?? info?.revision ?? 0,
        }).catch(() => undefined);
        record(
          'Scratch deck',
          'The window API fallback',
          'works',
          'deck.trash and deck.remove (confirm) called',
        );
      } catch {
        record('Scratch deck', 'The window API fallback', 'broken', 'the fallback failed too');
      }
    }
    const gone = await page.request
      .get(`${BASE}/edit/${deckId}`, { headers: extraHTTPHeaders })
      .then((r) => r.status())
      .catch(() => null);
    record(
      'Scratch deck',
      'GET /edit/<id> after the delete',
      gone === 404 ? 'works' : 'broken',
      `status ${gone}`,
    );
  }
  await browser.close();
  const out = path.join(OUT, `shoot-integrator-run-${TAG}.json`);
  writeFileSync(
    out,
    `${JSON.stringify({ base: BASE.replace(/https?:\/\//, ''), startedAt, endedAt: new Date().toISOString(), deckId, rows, notes, consoleErrors }, null, 2)}\n`,
  );
  const broken = rows.filter((r) => r.result === 'broken').length;
  log(`\nshoot-integrator: ${rows.length} rows, ${broken} broken; ${out}`);
  process.exit(broken === 0 ? 0 : 1);
}

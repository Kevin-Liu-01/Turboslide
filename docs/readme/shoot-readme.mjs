// Shoots the fifteen README pictures under docs/readme from a running Turboslide (a dev server, the
// preview or production) through the product's own controls, every one in the default view (Tools >
// Advanced tools off), at 1440 by 900 and a device scale of 2 (2880 by 1800 JPEGs, the size the
// originals of 2026-09-13 had and the size scripts/build-home-assets.ts reads for the /home page).
// The scratch deck is created from /new, written through the editor, and moved to the trash, deleted
// forever and checked for a 404 at the end; the GT brand deck is only read (the show, Presenter view,
// the viewer). Playwright runs only while the caller holds .turboslide/e2e.lock; a run against a
// deployment needs no lock. Exit 1 when a picture could not be taken; the run says which.
//
//   node docs/readme/shoot-readme.mjs --base http://localhost:4365 [--out <dir>] [--only 02,05] [--headed]
//
// `--out` defaults to docs/readme; point it at a scratch folder to look before replacing the
// committed pictures. After a replace, the /home page's copies and shots.json are rebuilt by
// `node scripts/build-home-assets.ts` (the integrator's script). On a preview the run sends
// VERCEL_OIDC_TOKEN as x-vercel-trusted-oidc-idp-token, never printed.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4365').replace(
  /\/$/,
  '',
);
const OUT = path.resolve(arg('out', path.join(import.meta.dirname, '.')));
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const HEADED = argv.includes('--headed');
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
mkdirSync(OUT, { recursive: true });

/** The pictures, in the order they are taken; `name` is the file stem under docs/readme. */
const SHOTS = [
  ['01', '01-new-presentation', 'the fresh Untitled presentation, dark'],
  ['02', '02-file-menu', 'File > Download in the default view'],
  ['03', '03-insert-menu', 'Insert > Image in the default view'],
  ['04', '04-layout-grid', 'the layout grid from the toolbar'],
  ['05', '05-filmstrip-menu', 'the filmstrip card menu, Duplicate slide hovered'],
  ['06', '06-canvas-rotation', 'a picture rotated by its handle, mid drag'],
  ['07', '07-canvas-snap-guides', 'a picture dragged into centre alignment, mid drag'],
  ['08', '08-format-options', 'Format options on a picture'],
  ['09', '09-download-dialog', 'the Download dialog, More options open'],
  ['10', '10-decks-home', '/decks in the card view'],
  ['11', '11-presenter-console', 'Presenter view with a show connected'],
  ['12', '12-slideshow-dither', 'the show on The Blue Marble slide with the toolbar'],
  ['13', '13-editor-light', 'typed text on a Title and body slide, light appearance'],
  ['14', '14-book-view', 'the viewer in book view'],
  ['15', '15-grid-view', 'the viewer in grid view'],
];
const wanted = (n) => ONLY.length === 0 || ONLY.includes(n);

// ---------------------------------------------------------------------------------------------
// human speed and the product, after scripts/probes/editor-walk-probe.mjs

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
/** A drag with the pointer held at the far point while `during` runs (the shot is taken there). */
const drag = async (page, from, to, during) => {
  await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 6);
  await sleep(rand(60, 120));
  await page.mouse.down();
  await sleep(rand(60, 110));
  await moveHuman(page, from, to, 14);
  await sleep(rand(300, 400));
  if (during) await during();
  await page.mouse.up();
  await sleep(rand(120, 200));
};
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
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** The visible element of a control; a collapsed toolbar tail keeps hidden twins of its controls. */
const ctl = (page, control) =>
  page.locator(`[data-control="${control}"]`).filter({ visible: true });
const clickControl = async (page, control) => {
  const r = await ctl(page, control).first().boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const hoverControl = async (page, control) => {
  const r = await ctl(page, control).first().boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(250, 400));
};
const openMenu = async (page, id) => {
  await clickControl(page, `menubar.${id}`);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  await hoverControl(page, `menu.${rowId}`);
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
/** Every block of a slide with an id and a type (and its position box when it has one). */
const objectsOf = async (page, slideId) => {
  const g = await invoke(page, 'slide.get', { slideId });
  const slide = g.slide ?? g;
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      /* a layout's own picture carries no position box; the stage still draws it as [data-block] */
      if (typeof node.id === 'string' && typeof node.type === 'string')
        out.push({ id: node.id, type: node.type, pos: node.pos });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
const sheetRect = (page) => rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
const blockRect = (page, id) =>
  page.evaluate((blockId) => {
    const inner = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
    );
    if (!inner) return null;
    const r = (inner.closest('.free') ?? inner).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
/** Clicks the first text run of the current slide and types; Escape commits. */
const typeIntoRun = async (page, index, text) => {
  const runs = page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]');
  const r = await runs.nth(index).boundingBox();
  if (!r) throw new Error(`no run ${index}`);
  await clickAt(page, r.x + Math.min(40, r.width / 2), r.y + r.height / 2);
  await sleep(300);
  await typeHuman(page, text);
  await sleep(200);
  await press(page, 'Escape');
  await sleep(300);
};
/** Goes to a slide by its filmstrip card and waits until the stage shows it. */
const gotoSlide = async (page, slideId) => {
  await clickControl(page, `filmstrip.slide.${slideId}`);
  await pollUntil(
    () => state(page),
    (s) => s.slideId === slideId,
    8000,
  );
  await page
    .locator(
      '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run], .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]',
    )
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
  await sleep(400);
};
/** The slide ids in deck order. */
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
/** New slide with a layout through the toolbar arrow and the plate; answers the new slide's id. */
const newSlideWithLayout = async (page, layoutId) => {
  const before = await slideOrder(page);
  await clickControl(page, 'toolbar.newSlide.arrow');
  await page.locator('[data-control="layout.new.plate"]').waitFor({ timeout: 8000 });
  await sleep(300);
  const tile = page.locator(`[data-control="layout.new.plate"] [data-layout="${layoutId}"]`);
  const r = await tile.first().boundingBox();
  if (!r) throw new Error(`no layout tile ${layoutId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  const after = await pollUntil(
    () => slideOrder(page),
    (ids) => ids.length > before.length,
    15_000,
  );
  await settled(page);
  const added = after.find((id) => !before.includes(id));
  if (!added) throw new Error(`no new slide after the ${layoutId} tile`);
  return added;
};

// ---------------------------------------------------------------------------------------------
// the run

const results = [];
const took = (n, name, ok, note = '') => {
  results.push({ n, name, ok, note });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n} ${name}${note ? `  (${note})` : ''}`);
};
const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  extraHTTPHeaders,
  colorScheme: 'dark',
});
const page = await context.newPage();
const shoot = (name) =>
  page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90 });
const attempt = async (n, name, fn) => {
  if (!wanted(n)) return;
  try {
    await fn();
    await shoot(name);
    took(n, name, true);
  } catch (error) {
    took(n, name, false, error instanceof Error ? error.message.split('\n')[0] : String(error));
  }
  await clearAll(page).catch(() => undefined);
};

let deckId = '';
try {
  // ---- the editor on the scratch deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await sleep(800);
  await attempt('01', '01-new-presentation', async () => {});

  // the first write: the deck's name, so the deck exists in the store
  await clickControl(page, 'deck.name');
  await sleep(300);
  await page.keyboard.press('Meta+A');
  await typeHuman(page, 'Northwind renewal');
  await press(page, 'Enter');
  await pollUntil(
    () => state(page),
    (s) => s.revision >= 1,
    25_000,
  );
  await page.waitForURL(/\/edit\//, { timeout: 20_000 }).catch(() => undefined);
  await settled(page);
  deckId = (await invoke(page, 'deck.info')).id;
  console.log(`scratch deck ${deckId}`);

  await attempt('02', '02-file-menu', async () => {
    await openMenu(page, 'file');
    await hoverRow(page, 'file.download', '[data-control="menu.file.download.pdf"]');
    await sleep(300);
  });
  await attempt('03', '03-insert-menu', async () => {
    await openMenu(page, 'insert');
    await hoverRow(page, 'insert.image', '[data-control="menu.insert.image.upload"]');
    await sleep(300);
  });
  await attempt('04', '04-layout-grid', async () => {
    await clickControl(page, 'toolbar.layout');
    await page.locator('[data-control="layout.apply.plate"]').waitFor({ timeout: 8000 });
    const tiles = page.locator('[data-control="layout.apply.plate"] [data-layout]');
    const last = tiles.nth((await tiles.count()) - 1);
    const r = await last.boundingBox();
    if (r)
      await moveHuman(
        page,
        { x: r.x - 20, y: r.y - 10 },
        { x: r.x + r.width / 2, y: r.y + r.height / 2 },
        8,
      );
    await sleep(1100);
  });

  // two more slides: a Title and body (typed later, the light shot) and a Section header (the picture)
  const splitSlide = await newSlideWithLayout(page, 'split');
  await gotoSlide(page, splitSlide);
  await typeIntoRun(page, 0, 'Northwind renewal, Q4');
  await typeIntoRun(
    page,
    1,
    'Three seats added, the same terms, the pilot numbers on the next slide.',
  );
  await settled(page);
  const openerSlide = await newSlideWithLayout(page, 'opener');
  await gotoSlide(page, openerSlide);

  await attempt('05', '05-filmstrip-menu', async () => {
    const card = await ctl(page, `filmstrip.slide.${splitSlide}`).first().boundingBox();
    if (!card) throw new Error('no filmstrip card');
    await clickAt(page, card.x + card.width / 2, card.y + card.height / 2, { button: 'right' });
    await page.locator('[data-control="menu.slide.duplicateSlide"]').waitFor({ timeout: 8000 });
    await hoverControl(page, 'menu.slide.duplicateSlide');
    await sleep(1100);
  });

  // the picture of the Section header slide: the layout's own picture covers the sheet under the
  // plate; a click on it selects it like any picture, and the handles' ids name its block
  const handleControls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
    );
  /** The selected object's box on screen, from its nw and se handles. */
  const selectionRect = async () => {
    const controls = await handleControls();
    const nw = controls.find((c) => c.endsWith('.nw'));
    const se = controls.find((c) => c.endsWith('.se'));
    if (!nw || !se) throw new Error(`no corner handles among ${controls.join(', ')}`);
    const a = center(await rectOf(page, `.ts-overlay [data-control="${nw}"]`));
    const b = center(await rectOf(page, `.ts-overlay [data-control="${se}"]`));
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };
  let lastRect = null;
  const selectPicture = async () => {
    await clearAll(page);
    const sheet = await sheetRect(page);
    const at = lastRect
      ? center(lastRect)
      : { x: sheet.x + sheet.w * 0.72, y: sheet.y + sheet.h * 0.3 };
    await clickAt(page, at.x, at.y);
    await page.locator('.ts-overlay [data-control$=".rotate"]').first().waitFor({ timeout: 8000 });
    lastRect = await selectionRect();
    return lastRect;
  };
  const handleRect = async (dir) => {
    const control = (await handleControls()).find((c) => c.endsWith(`.${dir}`));
    if (!control) throw new Error(`no ${dir} handle`);
    return rectOf(page, `.ts-overlay [data-control="${control}"]`);
  };

  // the layout's starter picture fills the sheet; a corner drag makes it a picture a person can
  // rotate and align, the same handle drag a seller makes on a screenshot
  {
    await selectPicture();
    const se = await handleRect('se');
    const sheet = await sheetRect(page);
    await drag(page, center(se), { x: sheet.x + sheet.w * 0.58, y: sheet.y + sheet.h * 0.64 });
    await settled(page);
    await clearAll(page);
    lastRect = { x: sheet.x, y: sheet.y, w: sheet.w * 0.58, h: sheet.h * 0.64 };
  }

  await attempt('06', '06-canvas-rotation', async () => {
    const r = await selectPicture();
    const ring = await handleRect('rotate');
    const c = center(ring);
    const pivot = center(r);
    /* a 35 degree turn about the centre: the handle moves along an arc */
    const radius = Math.hypot(c.x - pivot.x, c.y - pivot.y);
    const a0 = Math.atan2(c.y - pivot.y, c.x - pivot.x);
    const a1 = a0 + (35 * Math.PI) / 180;
    const to = { x: pivot.x + radius * Math.cos(a1), y: pivot.y + radius * Math.sin(a1) };
    await drag(page, c, to, () => shoot('06-canvas-rotation'));
  });
  if (wanted('06')) {
    /* the rotation is undone so the next picture starts from the resized picture */
    await pollUntil(
      () => state(page),
      (s) => (s.sync?.pending ?? 0) === 0,
      10_000,
    );
    await press(page, 'Meta+z');
    await settled(page);
  }

  await attempt('07', '07-canvas-snap-guides', async () => {
    const r = await selectPicture();
    const sheet = await sheetRect(page);
    /* a picture moves by its frame edge (a drag inside it pans the crop): from the top edge, to
       the point that puts the picture's centre on the sheet's vertical centre line, a little lower,
       so the centre guide appears */
    const from = { x: r.x + r.w * 0.3, y: r.y + 1 };
    const delta = sheet.x + sheet.w / 2 - (r.x + r.w / 2);
    const to = { x: from.x + delta, y: from.y + 24 };
    await drag(page, from, to, () => shoot('07-canvas-snap-guides'));
  });
  if (wanted('07')) {
    await pollUntil(
      () => state(page),
      (s) => (s.sync?.pending ?? 0) === 0,
      10_000,
    );
    await press(page, 'Meta+z');
    await settled(page);
  }

  await attempt('08', '08-format-options', async () => {
    await selectPicture();
    if ((await ctl(page, 'toolbar.formatOptions').count()) > 0) {
      await clickControl(page, 'toolbar.formatOptions');
    } else {
      await openMenu(page, 'format');
      await clickControl(page, 'menu.format.formatOptions');
    }
    await sleep(1200);
  });

  await attempt('09', '09-download-dialog', async () => {
    await openMenu(page, 'file');
    await hoverRow(page, 'file.download', '[data-control="menu.file.download.pptx"]');
    await clickControl(page, 'menu.file.download.pptx');
    await page.locator('[data-control="dialog.download.mode.flatten"]').waitFor({ timeout: 8000 });
    const more = page.locator('[data-control="dialog.download.more"] summary');
    if (await more.count()) {
      const r = await more.first().boundingBox();
      if (r) await clickAt(page, r.x + 12, r.y + r.height / 2);
    }
    await sleep(500);
  });

  // ---- the light appearance on the Title and body slide
  await attempt('13', '13-editor-light', async () => {
    const info = await invoke(page, 'deck.info');
    await invoke(page, 'deck.set', {
      path: '/defaults/appearance',
      value: 'light',
      baseRevision: info.revision,
    });
    await settled(page);
    await page.goto(`${BASE}/edit/${deckId}#s/${splitSlide}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await sleep(800);
    await gotoSlide(page, splitSlide);
    /* the text tail on the toolbar: the caret in the body run */
    const runs = page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]');
    const r = await runs.nth(1).boundingBox();
    if (r) await clickAt(page, r.x + r.width - 8, r.y + r.height / 2);
    await sleep(500);
  });

  // ---- the home page
  await attempt('10', '10-decks-home', async () => {
    await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await page.locator('[data-control="home.cards"] li').first().waitFor({ timeout: 30_000 });
    await sleep(1500);
    await page.mouse.move(8, 8);
  });

  // ---- Presenter view with a show connected, in a second page of the same browser
  await attempt('11', '11-presenter-console', async () => {
    await page.goto(`${BASE}/present/gt-brand`, { waitUntil: 'domcontentloaded' });
    const show = await context.newPage();
    await show.goto(`${BASE}/deck/gt-brand?present=1`, { waitUntil: 'domcontentloaded' });
    await show.waitForSelector('.pt-viewer[data-settled], .pt-slide', { timeout: 60_000 });
    await page
      .locator('[data-connected="true"]')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    await sleep(1200);
    await page.mouse.move(8, 8);
    await page.bringToFront();
    await sleep(300);
    const shotted = shoot('11-presenter-console');
    await shotted;
    await show.close();
  });

  // ---- the show on The Blue Marble slide (slide 6 of the GT deck) with the toolbar
  await attempt('12', '12-slideshow-dither', async () => {
    await page.goto(`${BASE}/deck/gt-brand?present=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pt-viewer[data-settled], .pt-slide', { timeout: 60_000 });
    await sleep(800);
    await page.mouse.move(700, 450);
    await typeHuman(page, '6');
    await press(page, 'Enter');
    await sleep(900);
    await moveHuman(page, { x: 700, y: 450 }, { x: 60, y: 870 }, 12);
    await page
      .locator('[data-control="present.toolbar"]')
      .first()
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    /* off the buttons, so no tooltip sits in the picture; the toolbar stays for two seconds */
    await moveHuman(page, { x: 60, y: 870 }, { x: 420, y: 800 }, 6);
    await sleep(500);
  });

  // ---- the viewer
  await attempt('14', '14-book-view', async () => {
    await page.goto(`${BASE}/deck/gt-brand?mode=book`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pt-viewer[data-settled], .pt-slide', { timeout: 60_000 });
    await sleep(1500);
    await page.mouse.move(8, 8);
  });
  await attempt('15', '15-grid-view', async () => {
    await page.goto(`${BASE}/deck/gt-brand?mode=grid`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pt-viewer[data-settled], .pt-slide', { timeout: 60_000 });
    await sleep(1500);
    await page.mouse.move(8, 8);
  });
} catch (error) {
  took(
    '--',
    'the run',
    false,
    error instanceof Error ? error.message.split('\n')[0] : String(error),
  );
} finally {
  // ---- File > Move to trash, Delete forever, and a 404 for the scratch deck
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
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      trashed = true;
      console.log(`trashed and deleted ${deckId} through the product`);
    } catch (error) {
      console.log(
        `the product trash path failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the actions API`,
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
        // the 404 check below reports what happened
      }
    }
    let status = 0;
    const until = Date.now() + 20_000;
    for (;;) {
      const res = await page.request.get(`${BASE}/edit/${deckId}`, {
        headers: extraHTTPHeaders,
        maxRedirects: 0,
      });
      status = res.status();
      if (status === 404 || Date.now() > until) break;
      await sleep(2000);
    }
    took('--', `GET /edit/${deckId}`, status === 404, `status ${status}`);
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `${results.length - failed.length} of ${results.length} steps ok; pictures under ${OUT}`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

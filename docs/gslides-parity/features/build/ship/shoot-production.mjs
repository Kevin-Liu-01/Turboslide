// The ship step's pictures of the features round, ship one, on a deployment (docs/FEATURES.md
// 7.2: the new surfaces on production at 1440 in both appearances): the Insert menu with its Logo
// row, the Logo dialog with Figma found, the mark inserted beside the brand's mark on the title
// slide, Replace image > Logo on the picture's right click menu, Tailor's Find the logo button, a
// table with the caret placed by one click, a selected chart with its Edit data bar and the Chart
// data grid, the Font dropdown and More fonts with the added families. Adapted from the
// integrator's build/integrator/shoot.mjs (the dev server's pictures at 1440 and 1280 as PNG): one
// size, JPEG files named for the production table, the Vercel Authentication header from
// VERCEL_OIDC_TOKEN when the base is a preview. One scratch deck is created from /new and trashed
// and deleted forever through the window API in the finally block, the 404 read back, so nothing
// of this run stays on the shared Blob store.
//
//   node docs/gslides-parity/features/build/ship/shoot-production.mjs --base <origin> [--out <dir>]
//     [--prefix production-features-one]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  boxOf,
  chromium,
  clickAt,
  clickControl,
  ctl,
  dblclickAt,
  dismissPrompts,
  editorReady,
  invoke,
  menuPath,
  objectsOf,
  openMenu,
  pollUntil,
  press,
  rectOfControl,
  runs,
  settled,
  sleep,
  state,
  typeHuman,
} from '../../../product/audit-interface/scripts/lib.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = arg('out', path.resolve('docs/gslides-parity/focus/verification'));
const PREFIX = arg('prefix', 'production-features-one');
mkdirSync(OUT, { recursive: true });
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const SIZE = { w: 1440, h: 900 };
const THEMES = ['light', 'dark'];
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';

const record = {
  base: BASE,
  startedAt: new Date().toISOString(),
  deck: null,
  shots: [],
  steps: [],
};
const log = (name, observed) => {
  record.steps.push({ name, observed, at: new Date().toISOString() });
  console.log(`${new Date().toISOString().slice(11, 19)} ${name}: ${observed}`);
};

const shot = async (page, name, clip = null) => {
  const file = `${PREFIX}-${name}.jpg`;
  await page
    .screenshot({
      path: path.join(OUT, file),
      type: 'jpeg',
      quality: 88,
      ...(clip ? { clip } : {}),
    })
    .then(() => {
      record.shots.push(file);
      log(`shot ${file}`, clip ? `clip ${clip.width} by ${clip.height}` : `${SIZE.w} by ${SIZE.h}`);
    })
    .catch((e) => log(`shot ${file}`, `failed: ${e.message.split('\n')[0]}`));
};

/** A surface that fails records its sentence and lets the next surface run. */
const attempt = async (page, name, run) => {
  try {
    await run();
  } catch (e) {
    log(name, `failed: ${e.message.split('\n')[0]}`);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
  }
};

/**
 * A context at 1440 by 900 in one appearance, with the deployment's header when set. The
 * anonymous principal lives in the browser's cookies and storage, so a context that reopens the
 * deck the first one created loads that context's saved storage state (the lib's rule): on an
 * enforce deployment a fresh principal never reaches the editor of another principal's draft.
 */
const newContext = async (browser, theme, storageState = null) => {
  const context = await browser.newContext({
    viewport: { width: SIZE.w, height: SIZE.h },
    deviceScaleFactor: 1,
    extraHTTPHeaders,
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

/** Creates a deck from /new with a typed title; the id once the address has moved. */
const createDeck = async (page, title) => {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await dismissPrompts(page);
  const all = await runs(page);
  const head = all.find((r) => /heading/.test(r)) ?? all[0];
  const el = page.locator(`${SHEET} [data-run="${head}"]`).first();
  const r = await el.boundingBox();
  await dblclickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await sleep(300);
  await typeHuman(page, title);
  await press(page, 'Escape', 2);
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  await settled(page);
  const info = await invoke(page, 'deck.info');
  return info.id ?? info.deckId ?? (await state(page)).deckId;
};

/** Trashes and deletes the deck forever through the window API; the 404 read back. */
const destroyDeck = async (page, deckId) => {
  if (!deckId) return 'no deck';
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await settled(page);
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
  let after = 0;
  for (let i = 0; i < 20 && after !== 404; i += 1) {
    after = await page.evaluate(async (id) => (await fetch(`/edit/${id}`)).status, deckId);
    if (after !== 404) await sleep(500);
  }
  return `deleted; /edit answers ${after}`;
};

const selectTitle = async (page) => {
  await press(page, 'Escape', 2);
  const all = await runs(page);
  const head = all.find((r) => /heading/.test(r)) ?? all[0];
  const el = page.locator(`${SHEET} [data-run="${head}"]`).first();
  const r = await el.boundingBox();
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await sleep(350);
};

const openPanel = async (page) => {
  if (await ctl(page, 'panel.formatOptions').count()) return;
  await clickControl(page, 'toolbar.formatOptions');
  await ctl(page, 'panel.formatOptions').waitFor({ timeout: 8000 });
  await sleep(500);
};

const panelClip = () => ({ x: SIZE.w - 336, y: 72, width: 336, height: SIZE.h - 72 });

const typedTable = (id, columns, rows, pos) => ({
  id,
  type: 'table',
  columns: Array.from({ length: columns }, () => ({})),
  rows: Array.from({ length: rows }, (_, r) => ({
    cells: Array.from({ length: columns }, (_, c) => (r === 0 ? `Q${c + 1}` : `${r * 12}.${c}`)),
    ...(r === 0 ? { header: true } : {}),
  })),
  pos,
});

const browser = await chromium.launch({ headless: true });
let deckId = null;
let tableSlide = null;
let storage = null;
try {
  for (const theme of THEMES) {
    const context = await newContext(browser, theme, storage);
    const page = await context.newPage();
    if (!deckId) {
      deckId = await createDeck(page, 'Q3 enterprise renewal pitch');
      record.deck = deckId;
      log('draft on /new', `id ${deckId}`);
      storage = await context.storageState();
    } else {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
    }
    await dismissPrompts(page);
    await sleep(400);
    const titleSlide = (await state(page)).slideId;
    log(
      `appearance ${theme}`,
      `data-theme ${await page.evaluate(() => document.documentElement.getAttribute('data-theme'))}`,
    );

    // 1. the Insert menu with its Logo row under Image
    await attempt(page, 'insert menu', async () => {
      await openMenu(page, 'insert');
      await sleep(300);
      await shot(page, `insert-menu-1440-${theme}`);
      await press(page, 'Escape', 2);
    });

    // 2. the Logo dialog with Figma found, inserted once on the title slide (the light pass)
    await attempt(page, 'logo dialog', async () => {
      await menuPath(page, 'insert', 'insert.logo');
      await ctl(page, 'dialog.logo').waitFor({ timeout: 8000 });
      await sleep(300);
      await typeHuman(page, 'figma');
      await page
        .locator('[data-control="dialog.logo.groups"][data-query="figma"]:not([data-searching])')
        .waitFor({ timeout: 20_000 });
      await sleep(400);
      await shot(page, `logo-dialog-1440-${theme}`);
      if (theme === 'light') {
        await press(page, 'Enter');
        await page
          .locator('[data-control="dialog.logo"]')
          .waitFor({ state: 'detached', timeout: 30_000 });
        await settled(page);
        await sleep(600);
        await shot(page, `logo-inserted-1440-${theme}`);
      } else {
        await press(page, 'Escape');
      }
      await sleep(200);
    });

    // 3. Replace image > Logo on the inserted picture's right click menu
    await attempt(page, 'replace image menu', async () => {
      await press(page, 'Escape', 2);
      const objects = await objectsOf(page, titleSlide);
      const picture = objects.find((o) => o.type === 'picture' || o.type === 'shot');
      if (!picture) throw new Error('no picture on the title slide');
      const boxes = await boxOf(page, picture.id);
      if (!boxes) throw new Error(`no drawn box for ${picture.id}`);
      const box = { x: boxes.free.x, y: boxes.free.y, width: boxes.free.w, height: boxes.free.h };
      await clickAt(page, box.x + box.width / 2, box.y + box.height / 2);
      await sleep(300);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page
        .locator('[data-control="menu.format.image.replaceImage"]')
        .waitFor({ timeout: 6000 });
      const row = await rectOfControl(page, 'menu.format.image.replaceImage');
      await page.mouse.move(row.x + row.w / 2, row.y + row.h / 2, { steps: 6 });
      await page
        .locator('[data-control="menu.format.image.replaceImage.logo"]')
        .waitFor({ timeout: 6000 });
      await sleep(300);
      await shot(page, `replace-image-logo-1440-${theme}`);
      await press(page, 'Escape', 2);
    });

    // 4. Tailor with Find the Figma logo
    await attempt(page, 'tailor', async () => {
      await menuPath(page, 'tools', 'tools.tailor');
      await ctl(page, 'dialog.tailor').waitFor({ timeout: 8000 });
      await clickControl(page, 'dialog.tailor.to');
      await typeHuman(page, 'Figma');
      await ctl(page, 'dialog.tailor.logo.find')
        .waitFor({ timeout: 12_000 })
        .catch(() => undefined);
      await sleep(400);
      await shot(page, `tailor-find-logo-1440-${theme}`);
      await press(page, 'Escape', 2);
    });

    // 5. a table: one click places the caret
    await attempt(page, 'table', async () => {
      await press(page, 'Escape', 2);
      if (!tableSlide) {
        const s = await state(page);
        const listIds = async () => (await invoke(page, 'slide.list')).map((row) => row.id);
        const before = await listIds();
        await invoke(page, 'slide.new', {
          baseRevision: s.revision,
          after: titleSlide,
          layout: 'blank',
        });
        const order = await pollUntil(listIds, (o) => o.length === before.length + 1, 30_000);
        await settled(page);
        tableSlide = order.find((id) => !before.includes(id)) ?? (await state(page)).slideId;
        const s2 = await state(page);
        await invoke(page, 'block.insert', {
          baseRevision: s2.revision,
          slideId: tableSlide,
          slot: 'main',
          block: typedTable('renewal', 4, 4, { x: 120, y: 160, w: 1000, h: 300 }),
        });
        await settled(page);
      }
      await invoke(page, 'view.goto', { slideId: tableSlide }).catch(() => undefined);
      await sleep(600);
      await page
        .locator(`${SHEET} [data-block="renewal"] .td`)
        .first()
        .waitFor({ timeout: 15_000 });
      const cell = await page
        .locator(`${SHEET} [data-block="renewal"] .tr`)
        .nth(1)
        .locator('.td')
        .nth(1)
        .boundingBox();
      await clickAt(page, cell.x + cell.width / 2, cell.y + cell.height / 2);
      await sleep(500);
      const editing = await page.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor [data-editing]') !== null,
      );
      log(`table caret ${theme}`, `a cell is editing after one click: ${editing}`);
      await shot(page, `table-caret-1440-${theme}`);
      await press(page, 'Escape', 2);
    });

    // 6. a chart selected with Edit data under it, then the Chart data grid
    await attempt(page, 'chart', async () => {
      await press(page, 'Escape', 2);
      await invoke(page, 'view.goto', { slideId: tableSlide ?? titleSlide }).catch(() => undefined);
      await sleep(400);
      const existing = await page.locator(`${SHEET} svg.chart, ${SHEET} svg[data-chart]`).count();
      if (existing === 0) {
        await menuPath(page, 'insert', 'insert.chart', 'insert.chart.bar');
        await page
          .locator(`${SHEET} svg.chart, ${SHEET} svg[data-chart]`)
          .first()
          .waitFor({ timeout: 20_000 });
        await settled(page);
      } else {
        const chart = await page
          .locator(`${SHEET} svg.chart, ${SHEET} svg[data-chart]`)
          .first()
          .boundingBox();
        await clickAt(page, chart.x + chart.width / 2, chart.y + chart.height / 2);
      }
      await ctl(page, 'bar.chart.editData').waitFor({ timeout: 8000 });
      await sleep(400);
      await shot(page, `chart-edit-data-1440-${theme}`);
      await clickControl(page, 'bar.chart.editData');
      await ctl(page, 'panel.formatOptions').waitFor({ timeout: 8000 });
      await ctl(page, 'formatOptions.chart.cell.1.1')
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await sleep(500);
      await shot(page, `chart-grid-1440-${theme}`, panelClip());
      await press(page, 'Escape', 2);
    });

    // 7. the Font dropdown, then More fonts with the added families
    await attempt(page, 'fonts', async () => {
      await invoke(page, 'view.goto', { slideId: titleSlide }).catch(() => undefined);
      await sleep(400);
      /* the cover's heading takes the kit's face (its Font control is disabled), so the dropdown
         opens from a text block placed on the table slide */
      await invoke(page, 'view.goto', { slideId: tableSlide ?? titleSlide }).catch(() => undefined);
      await sleep(400);
      const s = await state(page);
      const slideId = tableSlide ?? titleSlide;
      const had = (await objectsOf(page, slideId)).map((o) => o.id);
      if (!had.includes('fonts-text')) {
        await invoke(page, 'block.insert', {
          baseRevision: s.revision,
          slideId,
          slot: 'main',
          block: {
            id: 'fonts-text',
            type: 'paragraph',
            text: 'Renewal terms and the rollout plan',
            pos: { x: 120, y: 520, w: 800, h: 60 },
          },
        });
        await settled(page);
      }
      await press(page, 'Escape', 2);
      const b = await boxOf(page, 'fonts-text');
      if (!b) throw new Error('no drawn box for the text block');
      await clickAt(page, b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await sleep(350);
      const openFont = async () => {
        if (await ctl(page, 'toolbar.font').count()) await clickControl(page, 'toolbar.font');
        else {
          await clickControl(page, 'toolbar.more');
          await ctl(page, 'toolbar.more.toolbar.font').waitFor({ timeout: 4000 });
          await clickControl(page, 'toolbar.more.toolbar.font');
        }
        await ctl(page, 'toolbar.font.plate').waitFor({ timeout: 8000 });
        await page
          .locator('[data-control="toolbar.font.list"][data-rows]')
          .waitFor({ timeout: 20_000 });
        await sleep(300);
      };
      await openFont();
      await sleep(300);
      await shot(page, `font-dropdown-1440-${theme}`);
      await ctl(page, 'toolbar.font.more').first().scrollIntoViewIfNeeded();
      await clickControl(page, 'toolbar.font.more');
      await ctl(page, 'dialog.moreFonts').waitFor({ timeout: 8000 });
      await ctl(page, 'dialog.moreFonts.row.geist')
        .first()
        .scrollIntoViewIfNeeded({ timeout: 4000 })
        .catch(() => undefined);
      await sleep(400);
      await shot(page, `more-fonts-1440-${theme}`);
      await press(page, 'Escape', 2);
    });

    await context.close();
  }
} finally {
  const context = await newContext(browser, 'light', storage);
  const page = await context.newPage();
  const gone = await destroyDeck(page, deckId).catch((e) => `destroy failed: ${e.message}`);
  log(`scratch deck ${deckId ?? 'none'}`, gone);
  record.teardown = gone;
  await context.close();
  await browser.close();
  writeFileSync(path.join(OUT, `${PREFIX}-views.json`), `${JSON.stringify(record, null, 2)}\n`);
}

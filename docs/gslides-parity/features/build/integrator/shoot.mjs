// The integrator's pictures of the features round, ship one (docs/FEATURES.md section 6: "the
// pictures of every new surface in both appearances at 1440 and 1280"): the Insert menu with its
// Logo row, the Logo dialog with Figma found, Tailor's Find the logo button, the Tabular figures
// row of Format options, a table with the caret placed by one click and the Table section leading
// the panel, a selected chart with its Edit data button and the Chart data grid with its remove
// controls, the Font dropdown with its Recent group and More fonts with the v4.1 licence link. The
// helpers are the interface audit's (product/audit-interface/scripts/lib.mjs). One scratch deck is
// created from /new and trashed and deleted forever through the window API in the finally block,
// the 404 read back.
//
//   node docs/gslides-parity/features/build/integrator/shoot.mjs --base http://localhost:4418 [--out <dir>]
//
// Against the checkout's dev server the caller holds .turboslide/e2e.lock; the server carries
// TURBOSLIDE_LOGO_UPSTREAM=fixture so the dialog's search answers the ten mark fixture.
import { mkdirSync } from 'node:fs';
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
  newContext,
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
const BASE = arg('base', 'http://localhost:4418').replace(/\/$/, '');
const OUT = arg('out', path.dirname(new URL(import.meta.url).pathname));
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
];
const THEMES = ['light', 'dark'];
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';

const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

const shot = async (page, name, clip = null) => {
  const file = path.join(OUT, `${name}.png`);
  await page
    .screenshot({ path: file, ...(clip ? { clip } : {}) })
    .then(() => log(`shot ${path.basename(file)}`))
    .catch((e) => log(`shot ${name} failed: ${e.message}`));
};

/** A step that fails records its sentence and lets the next surface run. */
const attempt = async (name, run) => {
  try {
    await run();
  } catch (e) {
    log(`${name}: ${e.message.split('\n')[0]}`);
    await run.page?.keyboard.press('Escape').catch(() => undefined);
  }
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
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
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
  for (let i = 0; i < 10 && after !== 404; i += 1) {
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

const panelClip = (w, h) => ({ x: w - 336, y: 72, width: 336, height: h - 72 });

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
let keeper = null;
let tableSlide = null;
try {
  for (const { w, h } of SIZES) {
    for (const theme of THEMES) {
      const tag = `${theme}-${w}`;
      const context = await newContext(browser, { width: w, height: h, theme });
      const page = await context.newPage();
      if (!deckId) {
        deckId = await createDeck(page, 'Q3 enterprise renewal pitch');
        keeper = { theme };
      } else {
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
        await editorReady(page);
        await settled(page);
      }
      await dismissPrompts(page);
      await sleep(400);
      const titleSlide = (await state(page)).slideId;

      // 1. the Insert menu with its Logo row under Image
      await attempt('insert menu', async () => {
        await openMenu(page, 'insert');
        await sleep(300);
        await shot(page, `insert-menu-${tag}`);
        await press(page, 'Escape', 2);
      });

      // 2. the Logo dialog with Figma found (and inserted once, so a picture stands for Replace image)
      await attempt('logo dialog', async () => {
        await menuPath(page, 'insert', 'insert.logo');
        await ctl(page, 'dialog.logo').waitFor({ timeout: 8000 });
        await sleep(300);
        await typeHuman(page, 'figma');
        await page
          .locator('[data-control="dialog.logo.groups"][data-query="figma"]:not([data-searching])')
          .waitFor({ timeout: 10_000 });
        await sleep(400);
        await shot(page, `logo-dialog-${tag}`);
        if (tag === 'light-1440') {
          await press(page, 'Enter');
          await page
            .locator('[data-control="dialog.logo"]')
            .waitFor({ state: 'detached', timeout: 15_000 });
          await settled(page);
          await sleep(400);
          await shot(page, `logo-inserted-${tag}`);
        } else {
          await press(page, 'Escape');
        }
        await sleep(200);
      });

      // 3. Replace image > Logo on the inserted picture's right click menu
      await attempt('replace image menu', async () => {
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
        await shot(page, `replace-image-logo-${tag}`);
        await press(page, 'Escape', 2);
      });

      // 4. Tailor with Find the Figma logo
      await attempt('tailor', async () => {
        await menuPath(page, 'tools', 'tools.tailor');
        await ctl(page, 'dialog.tailor').waitFor({ timeout: 8000 });
        await clickControl(page, 'dialog.tailor.to');
        await typeHuman(page, 'Figma');
        await ctl(page, 'dialog.tailor.logo.find')
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await sleep(400);
        await shot(page, `tailor-find-logo-${tag}`);
        await press(page, 'Escape', 2);
      });

      // 5. Format options on the title with the Tabular figures row in view
      await attempt('tabular figures', async () => {
        await selectTitle(page);
        await openPanel(page);
        const row = ctl(page, 'formatOptions.typography.numerals').first();
        await row.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
        await sleep(400);
        await shot(page, `format-options-tabular-${tag}`, panelClip(w, h));
        await press(page, 'Escape', 2);
      });

      // 6. a table: one click places the caret; the Table section leads the panel
      await attempt('table', async () => {
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
          const order = await pollUntil(listIds, (o) => o.length === before.length + 1, 20_000);
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
          .waitFor({ timeout: 10_000 });
        const cell = await page
          .locator(`${SHEET} [data-block="renewal"] .tr`)
          .nth(1)
          .locator('.td')
          .nth(1)
          .boundingBox();
        await clickAt(page, cell.x + cell.width / 2, cell.y + cell.height / 2);
        await sleep(500);
        await shot(page, `table-caret-${tag}`);
        await openPanel(page);
        await sleep(300);
        await shot(page, `table-format-options-${tag}`, panelClip(w, h));
        await press(page, 'Escape', 2);
      });

      // 7. a chart selected with Edit data under it, then the Chart data grid
      await attempt('chart', async () => {
        await press(page, 'Escape', 2);
        await invoke(page, 'view.goto', { slideId: tableSlide ?? titleSlide }).catch(
          () => undefined,
        );
        await sleep(400);
        const existing = await page.locator(`${SHEET} svg.chart, ${SHEET} svg[data-chart]`).count();
        if (existing === 0) {
          await menuPath(page, 'insert', 'insert.chart', 'insert.chart.bar');
          await page
            .locator(`${SHEET} svg.chart, ${SHEET} svg[data-chart]`)
            .first()
            .waitFor({ timeout: 15_000 });
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
        await shot(page, `chart-edit-data-${tag}`);
        await clickControl(page, 'bar.chart.editData');
        await ctl(page, 'panel.formatOptions').waitFor({ timeout: 8000 });
        await ctl(page, 'formatOptions.chart.cell.1.1')
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await sleep(500);
        await shot(page, `chart-grid-${tag}`, panelClip(w, h));
        await press(page, 'Escape', 2);
      });

      // 8. the Font dropdown with its Recent group, then More fonts with the v4.1 link
      await attempt('fonts', async () => {
        await invoke(page, 'view.goto', { slideId: titleSlide }).catch(() => undefined);
        await sleep(400);
        await selectTitle(page);
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
            .waitFor({ timeout: 15_000 });
          await sleep(300);
        };
        await openFont();
        if ((await ctl(page, 'toolbar.font.group.recent').count()) === 0) {
          await ctl(page, 'toolbar.font.row.geist').first().scrollIntoViewIfNeeded();
          await clickControl(page, 'toolbar.font.row.geist');
          await settled(page);
          await sleep(400);
          await selectTitle(page);
          await openFont();
        }
        await sleep(300);
        await shot(page, `font-dropdown-${tag}`);
        await ctl(page, 'toolbar.font.more').first().scrollIntoViewIfNeeded();
        await clickControl(page, 'toolbar.font.more');
        await ctl(page, 'dialog.moreFonts').waitFor({ timeout: 8000 });
        await ctl(page, 'dialog.moreFonts.row.geist')
          .first()
          .scrollIntoViewIfNeeded({ timeout: 4000 })
          .catch(() => undefined);
        await sleep(400);
        await shot(page, `more-fonts-${tag}`);
        await press(page, 'Escape', 2);
      });

      await context.close();
    }
  }
} finally {
  const context = await newContext(browser, {
    width: 1440,
    height: 900,
    theme: keeper?.theme ?? 'light',
  });
  const page = await context.newPage();
  log(
    `scratch deck ${deckId ?? 'none'}: ${await destroyDeck(page, deckId).catch((e) => `destroy failed: ${e.message}`)}`,
  );
  await context.close();
  await browser.close();
}

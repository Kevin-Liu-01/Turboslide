// The after pictures of B1's items (docs/PRODUCT.md section 3; the note b1.md): every chrome
// surface the interface audit shot, driven on this lane's dev server at 1440 by 900 and 1280 by
// 800 in both appearances, at human speed, on one scratch deck created from /new and trashed and
// deleted forever in the finally block. The helpers are the interface audit's (audit-interface/
// scripts/lib.mjs: the human paced input, the menu helpers, the readiness waits); only the base,
// the deck lifecycle and the output folder are this script's. The before pictures are the audit's
// production pictures, copied beside these by b1.md's table.
//
//   node docs/gslides-parity/product/build/b1/shoot.mjs --base http://localhost:4411 [--out <dir>] [--prefix after]
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  chromium,
  clickAt,
  clickControl,
  clickSelect,
  dblclickAt,
  dismissPrompts,
  editorReady,
  hoverAt,
  invoke,
  newContext,
  objectsOf,
  openMenu,
  pollUntil,
  press,
  rectOf,
  rectOfControl,
  runs,
  settled,
  sleep,
  state,
  typeHuman,
} from '../../audit-interface/scripts/lib.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4411').replace(/\/$/, '');
const OUT = arg('out', path.dirname(new URL(import.meta.url).pathname));
const PREFIX = arg('prefix', 'after');
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
];
const THEMES = ['light', 'dark'];

const shot = async (page, name, clip = null) => {
  const file = path.join(OUT, `${PREFIX}-${name}.png`);
  await page
    .screenshot({ path: file, ...(clip ? { clip } : {}) })
    .catch((e) => console.log(`shot ${name} failed: ${e.message}`));
  console.log(`shot ${path.basename(file)}`);
};

/** Creates a deck from /new with a typed title; the id once the address has moved. */
const createDeck = async (page, title) => {
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
  return info.id ?? info.deckId ?? (await state(page)).deckId;
};

/** File > Move to trash, then Delete forever on /decks/trash; a 404 on /edit afterwards. */
const destroyDeck = async (page, deckId) => {
  if (!deckId) return 'no deck';
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    30_000,
  );
  await settled(page);
  await dismissPrompts(page);
  await clickControl(page, 'menubar.file');
  await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
  await clickControl(page, 'menu.file.moveToTrash');
  await page.waitForURL(/\/decks$/, { timeout: 20_000 });
  await sleep(600);
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await page.locator(`[data-control="trash.delete.${deckId}"]`).waitFor({ timeout: 15_000 });
  await clickControl(page, `trash.delete.${deckId}`);
  await page.locator('[data-control="trash.confirm.ok"]').waitFor({ timeout: 8000 });
  await clickControl(page, 'trash.confirm.ok');
  await sleep(1200);
  const res = await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  return `deleted; /edit answers ${res?.status()}`;
};

const browser = await chromium.launch({ headless: true });
let deckId = null;
let keeper = null;
try {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      const tag = `${size.w}-${theme}`;
      const context = await newContext(browser, { width: size.w, height: size.h, theme });
      const page = await context.newPage();
      const V = { w: size.w, h: size.h };

      // ---- the pages
      await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      await shot(page, `${tag}-home`);
      await page.goto(`${BASE}/no-such-page-${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await sleep(500);
      await shot(page, `${tag}-notfound`);
      await page.goto(`${BASE}/deck/no-such-deck-${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-access', { timeout: 30_000 });
      await sleep(800);
      await shot(page, `${tag}-access`);

      // ---- the editor on the scratch deck (created once, in the first context)
      if (!deckId) {
        deckId = await createDeck(page, 'Q3 enterprise renewal pitch');
        keeper = { size, theme };
        await context.storageState({ path: path.join(OUT, '.storage-state.json') });
      } else {
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
        await editorReady(page);
        await settled(page);
      }
      await dismissPrompts(page);
      await sleep(300);
      await shot(page, `${tag}-editor`);
      await shot(page, `${tag}-title-row`, { x: 0, y: 0, width: V.w, height: 44 });

      // the hover ground on an enabled button and on a menu title
      const undo = await rectOfControl(page, 'toolbar.undo');
      if (undo) {
        await hoverAt(page, undo.x + undo.w / 2, undo.y + undo.h / 2, 250);
        await shot(page, `${tag}-toolbar-hover`, { x: 0, y: 72, width: 560, height: 40 });
      }
      const view = await rectOfControl(page, 'menubar.view');
      if (view) {
        await hoverAt(page, view.x + view.w / 2, view.y + view.h / 2, 250);
        await shot(page, `${tag}-menubar-hover`, { x: 0, y: 44, width: 560, height: 28 });
      }
      // a tooltip in the frame weight
      const newSlide = await rectOfControl(page, 'toolbar.newSlide');
      if (newSlide) {
        await hoverAt(page, newSlide.x + newSlide.w / 2, newSlide.y + newSlide.h / 2, 600);
        await shot(page, `${tag}-tooltip-new-slide`, { x: 0, y: 72, width: 560, height: 140 });
      }
      await page.mouse.move(700, 500);
      // the File menu: the plate fits its labels, the frame weight, no mnemonics
      await openMenu(page, 'file');
      await sleep(400);
      await shot(page, `${tag}-menu-file`, { x: 0, y: 44, width: 560, height: 480 });
      await press(page, 'Escape');
      await sleep(200);
      // the text tail: one click on the title
      const all = await runs(page);
      const head = all.find((r) => /heading/.test(r)) ?? all[0];
      const headBox = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`);
      if (headBox) {
        await clickAt(page, headBox.x + headBox.w / 2, headBox.y + headBox.h / 2);
        await sleep(400);
        await shot(page, `${tag}-toolbar-tail-text`, { x: 0, y: 72, width: V.w, height: 40 });
        await press(page, 'Escape', 2);
      }
      // a second slide: the filmstrip's one ring
      await clickControl(page, 'toolbar.newSlide');
      await sleep(900);
      await settled(page);
      await shot(page, `${tag}-filmstrip`, { x: 0, y: 112, width: 256, height: 320 });
      // the table tail: a table slide, the table selected, the fold at this width
      const s = await state(page);
      const tableSlide = await invoke(page, 'slide.new', { after: s.slideId, layout: 'table' })
        .then((r) => r.slideId ?? r.id ?? null)
        .catch(() => null);
      if (tableSlide) {
        await sleep(900);
        await settled(page);
        const objs = await objectsOf(page, tableSlide);
        const table = objs.find((o) => o.type === 'table');
        if (table) {
          await clickSelect(page, table.id);
          await sleep(400);
          await shot(page, `${tag}-toolbar-tail-table`, { x: 0, y: 72, width: V.w, height: 40 });
          // the More menu of the fold, when the bar folded anything
          const more = await rectOfControl(page, 'toolbar.more');
          if (more) {
            await clickAt(page, more.x + more.w / 2, more.y + more.h / 2);
            await sleep(400);
            await shot(page, `${tag}-toolbar-more`, {
              x: Math.max(0, more.x - 320),
              y: 72,
              width: 640,
              height: 420,
            });
            await press(page, 'Escape');
          }
          await press(page, 'Escape', 2);
        }
      }
      // the layout plate: four columns at 1280 and up, the GT group, the caption row
      const layoutBtn = await rectOfControl(page, 'toolbar.layout');
      if (layoutBtn) {
        await clickAt(page, layoutBtn.x + layoutBtn.w / 2, layoutBtn.y + layoutBtn.h / 2);
        await page
          .locator('.ts-layout-plate')
          .waitFor({ timeout: 8000 })
          .catch(() => undefined);
        await sleep(400);
        const tile = await rectOf(page, '.ts-layout-tile[data-layout="title"]');
        if (tile) await hoverAt(page, tile.x + tile.w / 2, tile.y + tile.h / 2, 300);
        await shot(page, `${tag}-plate-layout`);
        await press(page, 'Escape', 2);
      }
      // the Share dialog: the name prompt on the first Share, then the first stage, then More
      await clickControl(page, 'share.open');
      await sleep(600);
      const prompt = await rectOfControl(page, 'dialog.namePrompt');
      if (prompt) {
        await shot(page, `${tag}-dialog-name-prompt`);
        await clickControl(page, 'dialog.namePrompt.skip');
        await sleep(400);
      }
      await page
        .locator('[data-control="dialog.share"]')
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await sleep(500);
      await shot(page, `${tag}-dialog-share`);
      const moreRow = await rectOfControl(page, 'dialog.share.more');
      if (moreRow) {
        await clickAt(page, moreRow.x + moreRow.w / 2, moreRow.y + moreRow.h / 2);
        await sleep(400);
        await shot(page, `${tag}-dialog-share-more`);
      }
      await press(page, 'Escape');
      await sleep(300);
      // the empty Comments panel and the Version history panel
      await clickControl(page, 'title.comments');
      await sleep(500);
      await shot(page, `${tag}-panel-comments-empty`, {
        x: V.w - 336,
        y: 112,
        width: 336,
        height: 300,
      });
      await clickControl(page, 'deck.lastEdit');
      await sleep(600);
      await shot(page, `${tag}-panel-version-history`, {
        x: V.w - 336,
        y: 112,
        width: 336,
        height: 420,
      });
      await clickControl(page, 'title.sidePanel');
      await sleep(300);
      // the ? key opens the shortcuts
      await page.mouse.click(700, 500);
      await page.keyboard.press('Shift+/');
      await sleep(600);
      await shot(page, `${tag}-key-question`);
      await press(page, 'Escape');
      await sleep(300);
      // the show: the bar on entry
      await clickControl(page, 'present.open');
      await sleep(700);
      await shot(page, `${tag}-show-entry`);
      await sleep(3600);
      await shot(page, `${tag}-show-after-3s`);
      await press(page, 'Escape');
      await sleep(400);

      // ---- /decks with the scratch deck's card
      await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      await sleep(1500);
      await shot(page, `${tag}-decks`);
      await context.close();
    }
  }
  // ---- the trash page with the scratch deck in it, then the deletion, in the first context's state
  const context = await newContext(browser, {
    width: keeper.size.w,
    height: keeper.size.h,
    theme: keeper.theme,
    storageState: path.join(OUT, '.storage-state.json'),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await settled(page);
  await dismissPrompts(page);
  await clickControl(page, 'menubar.file');
  await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
  await clickControl(page, 'menu.file.moveToTrash');
  await page.waitForURL(/\/decks$/, { timeout: 20_000 });
  await sleep(800);
  await shot(page, `${keeper.size.w}-${keeper.theme}-decks-after-trash-snackbar`);
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await sleep(1200);
  await shot(page, `${keeper.size.w}-${keeper.theme}-trash`);
  await clickControl(page, `trash.delete.${deckId}`);
  await page.locator('[data-control="trash.confirm.ok"]').waitFor({ timeout: 8000 });
  await sleep(400);
  await shot(page, `${keeper.size.w}-${keeper.theme}-trash-confirm`);
  await clickControl(page, 'trash.confirm.ok');
  await sleep(1500);
  const res = await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  console.log(`deleted ${deckId}; /edit answers ${res?.status()}`);
  deckId = null;
  await context.close();
} finally {
  if (deckId) {
    const context = await newContext(browser, {
      width: 1440,
      height: 900,
      theme: 'light',
      storageState: path.join(OUT, '.storage-state.json'),
    });
    const page = await context.newPage();
    console.log(await destroyDeck(page, deckId).catch((e) => `destroy failed: ${e.message}`));
    await context.close();
  }
  await browser.close();
}

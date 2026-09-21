// The integrator's chrome pictures of the product round (docs/PRODUCT.md section 3; the note
// integrator.md): the title row and the field boundaries in both appearances at 1440 by 900, at
// human speed, on one scratch deck created from /new and trashed and deleted forever in the finally
// block. The helpers are the interface audit's (audit-interface/scripts/lib.mjs); B1's
// build/b1/shoot.mjs shoots every surface, this script the two the merge records: the title row
// with the Assist entry and the side panel toggle, and the boundaries (the Share dialog's first
// stage with its select and its read only field, the Format options panel's fields) of 3.1.
//
//   node docs/gslides-parity/product/build/integrator/shoot.mjs --base http://localhost:4418 [--out <dir>]
//
// Against the checkout's dev server the run holds .turboslide/e2e.lock (the caller takes it);
// against a deployment it needs no lock and no OIDC header (a preview would need one; this script
// sends none, so it runs against a checkout server or production).
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  chromium,
  clickAt,
  clickControl,
  dblclickAt,
  dismissPrompts,
  editorReady,
  newContext,
  pollUntil,
  press,
  rectOfControl,
  runs,
  settled,
  sleep,
  state,
  typeHuman,
  invoke,
} from '../../audit-interface/scripts/lib.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4418').replace(/\/$/, '');
const OUT = arg('out', path.dirname(new URL(import.meta.url).pathname));
mkdirSync(OUT, { recursive: true });

const W = 1440;
const H = 900;
const THEMES = ['light', 'dark'];

const shot = async (page, name, clip = null) => {
  const file = path.join(OUT, `${name}.png`);
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
  for (const theme of THEMES) {
    const context = await newContext(browser, { width: W, height: H, theme });
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
    await sleep(500);
    // the title row: the mark, the name, the save words, the presence slot, Assist, the comments
    // glyph, the side panel toggle, the Slideshow split button and Share
    await shot(page, `title-row-${theme}`, { x: 0, y: 0, width: W, height: 44 });
    // the boundaries: the Share dialog's first stage (the select, the role select, the read only
    // address field with Copy link, the checkbox) with the select focused
    await clickControl(page, 'share.open');
    await page
      .locator('[data-control="dialog.namePrompt.skip"]')
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await page
      .locator('[data-control="dialog.share"]')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    await sleep(400);
    await page
      .locator('[data-control="dialog.share.mode"]')
      .focus()
      .catch(() => undefined);
    await sleep(300);
    await shot(page, `boundaries-share-${theme}`);
    await press(page, 'Escape');
    await sleep(300);
    // the Format options panel on the title: the fields with their boundary and one focused
    const all = await runs(page);
    const head = all.find((r) => /heading/.test(r)) ?? all[0];
    const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`).first();
    const r = await el.boundingBox();
    if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    await sleep(300);
    await clickControl(page, 'toolbar.formatOptions').catch(() => undefined);
    await page
      .locator('[data-control="panel.formatOptions"]')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    await sleep(500);
    const field = await rectOfControl(page, 'formatOptions.size.width');
    if (field) await clickAt(page, field.x + field.w / 2, field.y + field.h / 2);
    await sleep(300);
    await shot(page, `boundaries-format-options-${theme}`, {
      x: W - 336,
      y: 72,
      width: 336,
      height: 640,
    });
    await press(page, 'Escape');
    await context.close();
  }
} finally {
  const context = await newContext(browser, {
    width: W,
    height: H,
    theme: keeper?.theme ?? 'light',
  });
  const page = await context.newPage();
  console.log(
    `scratch deck ${deckId ?? 'none'}: ${await destroyDeck(page, deckId).catch((e) => `destroy failed: ${e.message}`)}`,
  );
  await context.close();
  await browser.close();
}

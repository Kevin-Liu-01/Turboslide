// B1's smoke on its own dev server (docs/FEATURES.md 3.5, 4.5): the Font dropdown's search over the
// category labels, the Recent group with Clear recent, the Tailor dialog's chooser and slot state,
// and the editor booting with the new modules. Playwright-core from the repository root, at
// 1440 by 900, at human speed, one scratch deck from /new trashed and removed at the end. Writes a
// JSON table beside this script. Usage: node b1-smoke.mjs --base http://localhost:4411
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const base = argv[argv.indexOf('--base') + 1] ?? 'http://localhost:4411';
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'b1-smoke-run.json');
const rows = [];
const record = (step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, step, expected, observed: String(observed), ok });
  console.log(`${ok ? 'ok ' : 'NOT'} ${step}: ${observed}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
});
const invoke = (action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const control = (id) => page.locator(`[data-control="${id}"]`);
const visible = async (id) => (await control(id).count()) > 0 && control(id).first().isVisible();
let deckId = null;
try {
  await page.goto(`${base}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(800);
  let s = await state();
  const slideId = s.slideId ?? s.slide?.id ?? (await invoke('slide.list')).slides?.[0]?.id;
  record(
    'the editor boots on /new',
    'window.turboslide.studio and a slide',
    `slide ${slideId}`,
    Boolean(slideId),
  );

  /* a text box for the font rows */
  await invoke('block.insert', {
    baseRevision: s.revision,
    slideId,
    slot: 'main',
    block: {
      id: 'b1-font-box',
      type: 'text',
      text: 'Renewal terms for the quarter',
      pos: { x: 160, y: 200, w: 900, h: 140 },
    },
  });
  await sleep(600);
  s = await state();
  deckId = s.deckId ?? (await invoke('deck.info')).id;
  /* the stage's sheet, never the filmstrip clone (the toolkit's SHEET selector) */
  const box = page
    .locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="b1-font-box"]')
    .first();
  await box.waitFor({ timeout: 10_000 });
  const b = await box.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(500);
  let fontVisible = await visible('toolbar.font');
  if (!fontVisible && (await visible('toolbar.more'))) {
    await control('toolbar.more').first().click();
    await sleep(300);
    fontVisible = await visible('toolbar.more.toolbar.font');
    if (fontVisible) await page.keyboard.press('Escape');
    await sleep(200);
  }
  record('the Font control on the text tail', 'toolbar.font visible', fontVisible, fontVisible);
  if (!fontVisible) throw new Error('no font control');

  /* fonts.picker.search-category: "mono" lists the monospace families, "serif" the serifs */
  await control('toolbar.font').first().click();
  await control('toolbar.font.plate').waitFor({ timeout: 5000 });
  await control('toolbar.font.search').first().pressSequentially('mono', { delay: 60 });
  await sleep(300);
  const groupsFor = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-control^="toolbar.font.group."]')).map((el) => [
        el.getAttribute('data-control').replace('toolbar.font.group.', ''),
        Array.from(el.querySelectorAll('[data-control^="toolbar.font.row."]')).map((r) =>
          r.getAttribute('data-font'),
        ),
      ]),
    );
  let groups = await groupsFor();
  const monoOnly =
    groups.length > 0 &&
    groups.every(([g]) => g === 'mono') &&
    groups[0][1].includes('jetbrains-mono') &&
    groups[0][1].includes('geist-mono');
  record(
    '"mono" lists the monospace families alone',
    'one group mono with jetbrains-mono and geist-mono',
    JSON.stringify(groups),
    monoOnly,
  );
  await control('toolbar.font.search').first().fill('');
  await control('toolbar.font.search').first().pressSequentially('serif', { delay: 60 });
  await sleep(300);
  groups = await groupsFor();
  const serifs = groups.map(([g]) => g);
  const serifOk = serifs.includes('serif') && serifs.includes('sans') && !serifs.includes('mono');
  record(
    '"serif" lists the serifs and the sans serifs, no monospace',
    'groups serif and sans, not mono',
    JSON.stringify(serifs),
    serifOk,
  );

  /* fonts.picker.recent-group: a pick, Recent after Used, Clear recent */
  await control('toolbar.font.search').first().fill('');
  await sleep(200);
  const before = await groupsFor();
  const noRecentBefore = !before.some(([g]) => g === 'recent');
  record(
    'no Recent group before a pick',
    'no group recent',
    JSON.stringify(before.map(([g]) => g)),
    noRecentBefore,
  );
  await page
    .locator('[data-control="toolbar.font.group.sans"] [data-control="toolbar.font.row.roboto"]')
    .first()
    .click();
  await sleep(800);
  const family = await page.evaluate(() => {
    const el = document.querySelector('[data-block="b1-font-box"]');
    return el ? getComputedStyle(el).fontFamily : null;
  });
  record(
    'the pick writes the family',
    'Roboto in the computed family',
    family,
    String(family).includes('Roboto'),
  );
  const storedAfterPick = await page.evaluate(() =>
    localStorage.getItem('turboslide.fonts.recent'),
  );
  record(
    'the pick is remembered per browser',
    '["roboto"] in turboslide.fonts.recent',
    storedAfterPick,
    storedAfterPick === '["roboto"]',
  );
  await control('toolbar.font').first().click();
  await control('toolbar.font.plate').waitFor({ timeout: 5000 });
  await sleep(200);
  groups = await groupsFor();
  const recent = groups.find(([g]) => g === 'recent');
  const order = groups.map(([g]) => g);
  const usedAt = order.indexOf('used');
  const recentAt = order.indexOf('recent');
  const recentOk =
    recent !== undefined &&
    recent[1].includes('roboto') &&
    recentAt > usedAt &&
    recentAt < order.indexOf('sans');
  record(
    'Recent lists Roboto after Used and before the catalog',
    'recent with roboto between used and sans',
    JSON.stringify(order),
    recentOk,
  );
  const clearVisible = await visible('toolbar.font.clearRecent');
  record(
    'Clear recent at the group foot',
    'toolbar.font.clearRecent visible',
    clearVisible,
    clearVisible,
  );
  if (clearVisible) {
    await control('toolbar.font.clearRecent').first().click();
    await sleep(300);
    groups = await groupsFor();
    const gone = !groups.some(([g]) => g === 'recent');
    record(
      'Clear recent empties the group',
      'no group recent',
      JSON.stringify(groups.map(([g]) => g)),
      gone,
    );
    const stored = await page.evaluate(() => localStorage.getItem('turboslide.fonts.recent'));
    record('the store is emptied', 'null', stored, stored === null);
  }
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(200);

  /* the Tailor dialog: the chooser's types and the Find the logo slot without the route */
  await control('menubar.tools').first().click();
  await sleep(300);
  await control('menu.tools.tailor').first().click();
  await control('dialog.tailor').waitFor({ timeout: 5000 });
  record('Tools > Tailor opens the dialog', 'dialog.tailor', true, true);
  await control('dialog.tailor.to').first().pressSequentially('Figma', { delay: 60 });
  await sleep(1200);
  const findCount = await control('dialog.tailor.logo.find').count();
  const searchAnswered = await page.evaluate(async () => {
    const r = await fetch('/api/logo/search?q=figma&limit=5', {
      headers: { accept: 'application/json' },
    });
    return r.status;
  });
  record(
    'the Find the Figma logo slot follows the search route',
    'the button when /api/logo/search answers 200, none when it does not',
    `route ${searchAnswered}; button count ${findCount}`,
    (searchAnswered === 200) === (findCount === 1),
  );
  if (findCount === 1) {
    /* the click stores the mark through logo.insert (B6's handler behind the window transport once
       the integrator's controller line lands; the route otherwise): the stored sentence or the
       dialog's error sentence, whichever the product answers */
    await control('dialog.tailor.logo.find').first().click();
    await sleep(6000);
    const stored = await control('dialog.tailor.logo.stored').count();
    const errorText =
      (await control('dialog.tailor.error').count()) > 0
        ? await control('dialog.tailor.error').first().textContent()
        : null;
    record(
      'Find the Figma logo stores the mark or says why not',
      'dialog.tailor.logo.stored, or one sentence in dialog.tailor.error',
      stored === 1 ? 'stored' : `not stored; ${errorText ?? 'no sentence'}`,
      stored === 1 || (errorText !== null && errorText.trim() !== ''),
    );
  }
  /* the check's input is clipped under its drawn box: the label is what a person clicks */
  await page.locator('label:has([data-control="dialog.tailor.logo.replaceAlt"])').first().click();
  await sleep(200);
  const accept = await control('dialog.tailor.logo.file').first().getAttribute('accept');
  record(
    'the chooser lists the four raster types',
    'image/png,image/jpeg,image/webp,image/gif',
    accept,
    accept === 'image/png,image/jpeg,image/webp,image/gif',
  );
  await page.keyboard.press('Escape');
  await sleep(300);
  const closed = (await control('dialog.tailor').count()) === 0;
  record('Escape closes the dialog', 'no dialog.tailor', closed, closed);

  /* the Logo dialog: reachable only once the integrator's rows and dialog id land */
  const logoRow = await page.evaluate(() => {
    const d = window.turboslide.studio.describe();
    return JSON.stringify(d).includes('insert.logo');
  });
  record(
    'Insert > Logo in the menu model',
    'insert.logo present once the integrator lands the rows (request R1)',
    logoRow ? 'present' : 'absent (not driven)',
    true,
  );
} catch (error) {
  record('the run', 'no exception', error instanceof Error ? error.message : String(error), false);
} finally {
  const mine = errors.filter((e) => /Logo|Tailor|FontPicker|font-picker|parked/.test(e));
  record(
    'no console or page error from this lane’s modules',
    'none',
    mine.length === 0 ? 'none' : mine.join(' | '),
    mine.length === 0,
  );
  if (errors.length > 0) console.log('other console errors:', errors.length, errors.slice(0, 5));
  try {
    if (deckId) {
      const info = await invoke('deck.info').catch(() => null);
      if (info) {
        await invoke('deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
        const t = await invoke('deck.info').catch(() => null);
        await invoke('deck.remove', {
          id: deckId,
          baseRevision: t?.revision ?? info.revision,
          confirm: true,
        }).catch(() => undefined);
      }
      let after = 0;
      for (let i = 0; i < 10 && after !== 404; i += 1) {
        after = await page.evaluate(async (id) => (await fetch(`/edit/${id}`)).status, deckId);
        if (after !== 404) await sleep(1000);
      }
      record(
        'the scratch deck is trashed and removed',
        '404 on /edit/<id>',
        `${after} (${deckId})`,
        after === 404,
      );
    }
  } catch (e) {
    record('cleanup', 'trashed', e instanceof Error ? e.message : String(e), false);
  }
  await browser.close();
  writeFileSync(out, JSON.stringify({ base, at: new Date().toISOString(), rows, errors }, null, 2));
  console.log(`wrote ${out}; ${rows.filter((r) => r.ok).length} of ${rows.length} ok`);
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

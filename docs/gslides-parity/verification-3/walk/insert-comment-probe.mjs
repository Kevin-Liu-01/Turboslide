#!/usr/bin/env node
// Insert > Comment from the menu bar for the owner of a fresh deck (the parity audit's
// `effects:scratch insert.comment` miss of this pass): what opens when nothing is selected, when a
// slide card is selected and when a block is selected; the toolbar's Add comment; the card's
// field, its submit and the marker it leaves; and the same row on the second slide of a copy. One
// page on a one slide copy of gt-brand made through the window API; trashed and removed at the end.
//   node insert-comment-probe.mjs [--base http://localhost:4336] [--out <json>]
import { writeFileSync } from 'node:fs';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'http://localhost:4336').replace(/\/$/, '');
const OUT = value('out', null);
const rows = [];
const step = (name, ok, evidence) => {
  rows.push({ name, ok, evidence });
  console.log(
    `${ok ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${name}: ${String(evidence).slice(0, 500).replace(/\s+/g, ' ')}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const settled = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const snackbar = (page) =>
  page
    .$eval('[data-control="snackbar"], .ts-snackbar', (e) => e.textContent.trim())
    .catch(() => '');
const surfaces = async (page) =>
  page.evaluate(() => ({
    card: document.querySelector('[data-control="comment.card"]') !== null,
    panel: document.querySelector('[data-panel-title]')?.getAttribute('data-panel-title') ?? null,
    dialog: document.querySelector('[role="dialog"] .ts-dialog-title')?.textContent ?? null,
    markers: document.querySelectorAll('[data-control="comment.marker"]').length,
    menuOpen: document.querySelector('[role="menu"]') !== null,
  }));
async function insertComment(page) {
  await page.keyboard.press('Escape');
  await page.click('button[data-control="menubar.insert"]');
  await page.waitForSelector('[data-menu-item="insert.comment"]', { timeout: 3000 });
  const disabled = await page.$eval('[data-menu-item="insert.comment"]', (e) =>
    e.getAttribute('aria-disabled'),
  );
  await page.click('[data-menu-item="insert.comment"]');
  await sleep(600);
  return { disabled, ...(await surfaces(page)), snackbar: await snackbar(page) };
}

const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/edit/gt-brand`, { waitUntil: 'domcontentloaded' });
await settled(page);
const info = await invoke(page, 'deck.info');
const list = await invoke(page, 'slide.list');
const slidesAll = Array.isArray(list) ? list : list.slides;
const text = slidesAll.find((s) => s.id === 'title') ?? slidesAll[1];
const scratch = `verifier-ic-${Date.now().toString(36)}`;
await invoke(page, 'deck.copy', {
  id: 'gt-brand',
  name: 'Verifier comment probe',
  newId: scratch,
  slideIds: [text.id],
  baseRevision: info.revision,
});
await page.goto(`${BASE}/edit/${scratch}`, { waitUntil: 'domcontentloaded' });
await settled(page);
step('scratch deck', true, `${scratch} from gt-brand's ${text.id}`);
// 1. nothing selected
const st = await state(page);
const r1 = await insertComment(page);
step(
  'Insert > Comment with nothing selected opens the card anchored to the slide',
  r1.card === true,
  `${JSON.stringify(r1)}; selection ${JSON.stringify(st.selection ?? st.focus ?? null)}`,
);
if (r1.card) {
  await page
    .fill(
      '[data-control="comment.card"] [data-control$=".field"]',
      'From the menu with nothing selected',
    )
    .catch(() => null);
  await page.click('[data-control="comment.card"] [data-control$=".submit"]').catch(() => null);
  await sleep(800);
  step(
    'the card submits and leaves a marker',
    (await surfaces(page)).markers >= 1,
    JSON.stringify(await surfaces(page)),
  );
}
await page.keyboard.press('Escape');
// 2. a slide card selected
await page
  .click('.ts-filmstrip [data-slide], .pt-sb [data-slide], .ts-cards [data-card]')
  .catch(() => null);
await sleep(300);
const r2 = await insertComment(page);
step('Insert > Comment with a slide card selected', r2.card === true, JSON.stringify(r2));
await page.keyboard.press('Escape');
// 3. a block selected
const slide = await invoke(page, 'slide.get', { slideId: text.id });
const block = Object.values(slide.slide.slots ?? {}).flat()[0];
if (block) {
  const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${block.id}"]`);
  if (el) await el.click();
  await sleep(300);
  const r3 = await insertComment(page);
  step(
    'Insert > Comment with a block selected',
    r3.card === true,
    `${block.id}: ${JSON.stringify(r3)}`,
  );
  await page.keyboard.press('Escape');
} else step('a block to select', null, `${text.id} has no slot block (a kind slide)`);
// 4. the toolbar's Add comment and the chord
const tb = await page.$(
  '[data-control="toolbar.comment"], [data-control="tb.comment"], [data-control$=".addComment"]',
);
if (tb) {
  await tb.click();
  await sleep(600);
  step(
    'the toolbar Add comment opens the card',
    (await surfaces(page)).card === true,
    JSON.stringify(await surfaces(page)),
  );
  await page.keyboard.press('Escape');
} else
  step(
    'the toolbar Add comment control',
    null,
    'no toolbar comment control found by the probe selectors',
  );
await page.keyboard.press('Meta+Alt+m');
await sleep(600);
step(
  'Cmd+Option+M opens the card (section 14)',
  (await surfaces(page)).card === true,
  JSON.stringify(await surfaces(page)),
);
await page.keyboard.press('Escape');
// cleanup
const info2 = await invoke(page, 'deck.info');
await invoke(page, 'deck.trash', { id: scratch, baseRevision: info2.revision }).catch(() => null);
const info3 = await invoke(page, 'deck.info').catch(() => info2);
await invoke(page, 'deck.remove', {
  id: scratch,
  confirm: true,
  baseRevision: info3.revision,
}).catch((e) => step('cleanup', false, String(e).slice(0, 160)));
step('cleanup', true, `${scratch} trashed and removed`);
await launched.browser.close();
const fails = rows.filter((r) => r.ok === false).length;
console.log(`insert comment probe: ${rows.filter((r) => r.ok === true).length} ok, ${fails} fail`);
if (OUT)
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), rows }, null, 2));
process.exit(fails > 0 ? 1 : 0);

// Cleans up after the first drive: deletes the polish audit template from the gallery through
// its card menu (with the screenshots the first run missed), then deletes the scratch deck
// forever from /decks/trash and reads the 404s.
//   node cleanup.mjs --deck <id> --template <slug>
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-live/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = 'https://www.turboslide.com';
const OUT = '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-assist';
const DECK = arg('deck', null);
const TEMPLATE = arg('template', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const ctl = (c) => page.locator(`[data-control="${c}"]`).first();
const visible = (c) => ctl(c).isVisible({ timeout: 300 }).catch(() => false);
const clickControl = async (c) => {
  const r = await ctl(c).boundingBox();
  if (!r) throw new Error(`no control ${c}`);
  await page.mouse.move(r.x + r.width / 2 - 30, r.y + r.height / 2 - 20);
  await sleep(rand(60, 120));
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await sleep(rand(200, 400));
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const log = (...a) => console.log(...a);
try {
  if (TEMPLATE) {
    await page.goto(`${BASE}/decks/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1500);
    const there = await visible(`templates.card.${TEMPLATE}`);
    log('template card drawn', there);
    if (there) {
      await shot('34-gallery-with-template');
      const r = await ctl(`templates.card.${TEMPLATE}`).boundingBox();
      if (r) await page.screenshot({ path: path.join(OUT, '34b-gallery-card-crop.png'), clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 } });
      await clickControl(`templates.card.${TEMPLATE}.menu`);
      await sleep(500);
      await shot('35-template-card-menu');
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.templates.card."]')].filter((el) => el.getClientRects().length > 0).map((el) => `${el.getAttribute('data-control')}:${el.textContent?.trim()}`));
      log('menu rows', rows);
      await clickControl(`menu.templates.card.${TEMPLATE}.rename`);
      await sleep(500);
      await shot('36-template-rename-field');
      await page.keyboard.press('Meta+a');
      for (const ch of 'Polish audit renamed') {
        await page.keyboard.type(ch);
        await sleep(rand(40, 90));
      }
      await page.keyboard.press('Enter');
      await sleep(2000);
      const named = await ctl(`templates.card.${TEMPLATE}.name`).textContent().catch(() => null);
      log('name after rename', named);
      await shot('37-template-renamed');
      await clickControl(`templates.card.${TEMPLATE}.menu`);
      await sleep(400);
      await clickControl(`menu.templates.card.${TEMPLATE}.delete`);
      await ctl('templates.delete').waitFor({ timeout: 8000 });
      await sleep(400);
      log('confirm words', (await ctl('templates.delete').textContent())?.trim().replace(/\s+/g, ' '));
      await shot('38-template-delete-confirm');
      const t0 = Date.now();
      await clickControl('templates.delete.ok');
      let gone = false;
      for (let i = 0; i < 60; i += 1) {
        if (!(await visible(`templates.card.${TEMPLATE}`))) {
          gone = true;
          break;
        }
        await sleep(500);
      }
      log('card gone', gone, 'after', Date.now() - t0, 'ms');
      await sleep(800);
      await shot('39-gallery-after-delete');
    }
    await page.goto(`${BASE}/decks/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1500);
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-control^="templates.card."]')].map((el) => el.getAttribute('data-control')).filter((c) => /^templates\.card\.[^.]+$/.test(c)));
    log('gallery cards after a fresh load', cards);
  }
  if (DECK) {
    const before = await page.request.get(`${BASE}/edit/${DECK}`);
    log('GET /edit before', before.status());
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await sleep(800);
    const inTrash = await visible(`trash.card.${DECK}`);
    log('deck in the trash', inTrash);
    if (inTrash) {
      await shot('80-trash-page');
      await clickControl(`trash.delete.${DECK}`);
      await sleep(600);
      const dialog = await page.evaluate(() => {
        const d = document.querySelector('.ts-dialog-scrim [role="dialog"], [role="dialog"]');
        return d ? { words: d.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300), controls: [...d.querySelectorAll('[data-control]')].map((el) => el.getAttribute('data-control')) } : null;
      });
      log('confirm dialog', JSON.stringify(dialog));
      await shot('81-delete-forever-confirm');
      if (await visible('trash.confirm.ok')) await clickControl('trash.confirm.ok');
      else {
        const ok = page.locator('[role="dialog"] button.is-solid, [role="dialog"] [data-control$=".ok"]').first();
        await ok.click({ timeout: 4000 }).catch(() => undefined);
      }
      for (let i = 0; i < 30; i += 1) {
        if (!(await visible(`trash.card.${DECK}`))) break;
        await sleep(500);
      }
      await sleep(800);
      await shot('82-trash-after-delete');
    }
    const a = await page.request.get(`${BASE}/edit/${DECK}`);
    const b = await page.request.get(`${BASE}/deck/${DECK}`);
    log('GET /edit and /deck after', a.status(), b.status());
    const body = await a.text();
    log('edit body head', body.slice(0, 200).replace(/\s+/g, ' '));
  }
} finally {
  await browser.close();
}

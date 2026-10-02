// Creates one deck through /new on production, shoots the editor's brand surfaces at two
// viewports in both themes, and writes the deck id first so the removal can run whatever happens.
import { createRequire } from 'node:module';
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const OUT = '/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-surfaces';
const BASE = 'https://www.turboslide.com';
const IDFILE = `${OUT}/raw/deck-id.txt`;
const LOG = `${OUT}/raw/editor-log.jsonl`;
const log = (o) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const views = [ { w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' } ];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await chromium.launch();

async function settle(page) {
  await page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
async function shot(page, name, v, theme) {
  const file = `${name}-${v.tag}-${theme}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  log({ shot: file, url: page.url() });
}
async function tryStep(label, fn) {
  try { await fn(); } catch (e) { log({ step: label, error: String(e).split('\n')[0].slice(0, 240) }); }
}
const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(400); };

// 1. the deck
let deckId = existsSync(IDFILE) ? readFileSync(IDFILE, 'utf8').trim() : '';
let storage;
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('gt-theme', 'light'); } catch {} });
  const page = await ctx.newPage();
  if (!deckId) {
    const t0 = Date.now();
    await page.goto(`${BASE}/new`, { waitUntil: 'load', timeout: 90000 });
    await settle(page);
    log({ draftSettledMs: Date.now() - t0 });
    await page.screenshot({ path: `${OUT}/new-draft-1440-light.png` });
    // the first write creates the deck (routes/new.tsx): one new slide
    await page.locator('.ts-stage, .pt-stage, main').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+m');
    await page.waitForFunction(() => location.pathname.startsWith('/edit/'), null, { timeout: 90000 });
    deckId = decodeURIComponent(/\/edit\/([^/?#]+)/.exec(await page.evaluate(() => location.pathname))[1]);
    writeFileSync(IDFILE, deckId + '\n');
    log({ created: deckId, ms: Date.now() - t0 });
    log({ settledMs: Date.now() - t0 });
  }
  storage = await ctx.storageState();
  await ctx.close();
}
console.log('deck', deckId);

for (const theme of ['light', 'dark']) {
  for (const v of views) {
    if (only && !only.includes(`${v.tag}-${theme}`)) continue;
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, colorScheme: theme, storageState: storage, isMobile: v.w < 768, hasTouch: v.w < 768 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    const t0 = Date.now();
    await tryStep(`editor ${v.tag} ${theme}`, async () => {
      await page.goto(`${BASE}/edit/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90000 });
      await settle(page);
      log({ open: `${v.tag}-${theme}`, ms: Date.now() - t0 });
      await shot(page, 'editor', v, theme);
    });
    for (const m of ['file', 'insert', 'help']) {
      await tryStep(`menu ${m}`, async () => {
        await page.locator(`[data-control="menubar.${m}"]`).first().click({ timeout: 8000 });
        await page.waitForTimeout(700);
        await shot(page, `menu-${m}`, v, theme);
        await esc(page);
      });
    }
    await tryStep('share', async () => {
      await page.locator('[data-control="share.open"]').first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, 'dialog-share', v, theme);
      await esc(page);
    });
    await tryStep('account', async () => {
      const chip = page.locator('[data-control="title.account"], [data-control="title.presence.me"]').first();
      await chip.click({ timeout: 8000 });
      await page.waitForTimeout(700);
      await shot(page, 'menu-account', v, theme);
      const rows = await page.locator('[role="menuitem"]').allInnerTexts();
      log({ accountRows: rows });
      const change = page.locator('[data-control="menu.title.account.changeName"]').first();
      if (await change.count()) {
        await change.click({ timeout: 5000 });
        await page.waitForTimeout(900);
        await shot(page, 'dialog-name', v, theme);
      }
      await esc(page);
    });
    await tryStep('versions', async () => {
      const words = page.locator('[data-control="deck.lastEdit.words"]').first();
      if (await words.count()) await words.click({ timeout: 8000 });
      else {
        await page.locator('[data-control="menubar.file"]').first().click();
        await page.locator('[data-control="menu.file.versionHistory"]').first().hover();
        await page.locator('[data-control="menu.file.versionHistory.see"]').first().click({ timeout: 5000 });
      }
      await page.waitForTimeout(2000);
      await shot(page, 'panel-versions', v, theme);
      await esc(page);
    });
    await tryStep('themes', async () => {
      await page.locator('[data-control="toolbar.theme"]').first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, 'panel-themes', v, theme);
      await esc(page);
    });
    await tryStep('shortcuts', async () => {
      await page.keyboard.press('Control+/');
      await page.waitForTimeout(1000);
      await shot(page, 'dialog-shortcuts', v, theme);
      await esc(page);
    });
    await tryStep('snackbar', async () => {
      await page.keyboard.press('Control+m');
      await page.waitForTimeout(1500);
      const thumbs = page.locator('.ts-filmstrip [data-slide-id], [data-control^="filmstrip.slide"]');
      log({ thumbs: await thumbs.count() });
      await page.keyboard.press('Delete');
      await page.waitForTimeout(800);
      const snack = page.locator('[data-control="snackbar"]');
      if (await snack.count()) await shot(page, 'snackbar', v, theme);
      else log({ snackbar: 'not drawn after Ctrl+M then Delete' });
    });
    await tryStep('present', async () => {
      const p2 = await ctx.newPage();
      await p2.goto(`${BASE}/present/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90000 });
      await p2.evaluate(() => document.fonts.ready);
      await p2.waitForTimeout(3000);
      await shot(p2, 'present', v, theme);
      await p2.mouse.move(v.w / 2, v.h - 20);
      await p2.waitForTimeout(800);
      await shot(p2, 'present-bar', v, theme);
      await p2.close();
    });
    await tryStep('view', async () => {
      const p3 = await ctx.newPage();
      await p3.goto(`${BASE}/deck/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90000 });
      await p3.evaluate(() => document.fonts.ready);
      await p3.waitForTimeout(3000);
      await shot(p3, 'view', v, theme);
      await p3.close();
    });
    await tryStep('access', async () => {
      const p4 = await ctx.newPage();
      const r = await p4.goto(`${BASE}/edit/brand-audit-no-such-deck-0001`, { waitUntil: 'load', timeout: 90000 });
      await p4.evaluate(() => document.fonts.ready);
      await p4.waitForTimeout(2500);
      log({ access: r?.status() });
      await shot(p4, 'access', v, theme);
      await p4.close();
    });
    if (v.tag === '1440' && theme === 'light') {
      await tryStep('deck html', async () => {
        const r = await ctx.request.get(`${BASE}/deck/${encodeURIComponent(deckId)}`);
        writeFileSync(`${OUT}/raw/deck-view.html`, await r.text());
        log({ deckHtml: r.status() });
      });
    }
    await ctx.close();
  }
}
await b.close();
console.log('done');

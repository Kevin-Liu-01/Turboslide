// The surfaces the first editor run missed: the shortcuts dialog (Cmd+/ on this platform), the
// Change name and Change avatar dialogs, the snackbar after a filmstrip delete, the right-click
// menu, plus DOM reads, all on the /new draft, which writes nothing until an edit.
import { createRequire } from 'node:module';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const OUT = '/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-surfaces';
const BASE = 'https://www.turboslide.com';
const deckId = readFileSync(`${OUT}/raw/deck-id.txt`, 'utf8').trim();
const LOG = `${OUT}/raw/extra-log.jsonl`;
const log = (o) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const views = [ { w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' } ];
const b = await chromium.launch();
async function settle(page) {
  await page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
async function shot(page, name, v, theme) { const file = `${name}-${v.tag}-${theme}.png`; await page.screenshot({ path: `${OUT}/${file}` }); log({ shot: file }); }
async function tryStep(label, fn) { try { await fn(); } catch (e) { log({ step: label, error: String(e).split('\n')[0].slice(0, 240) }); } }
const esc = async (page) => { for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(350); } };
for (const theme of ['light', 'dark']) {
  for (const v of views) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, colorScheme: theme, isMobile: v.w < 768, hasTouch: v.w < 768 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    await tryStep('open', async () => { await page.goto(`${BASE}/new`, { waitUntil: 'load', timeout: 90000 }); await settle(page); });
    if (v.tag === '1440' && theme === 'light') {
      await tryStep('dom', async () => {
        const facts = await page.evaluate(() => {
          const pick = (sel) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { sel, radius: s.borderRadius, bg: s.backgroundColor, color: s.color, font: s.fontFamily.split(',')[0], size: s.fontSize, weight: s.fontWeight, x: Math.round(r.x), w: Math.round(r.width) }; };
          const controls = [...document.querySelectorAll('.ts-title-row [data-control], .ts-toolbar [data-control], [data-control^="toolbar."]')].map((e) => e.getAttribute('data-control'));
          return { controls: [...new Set(controls)], present: pick('[data-control="present.open"]'), presentSplit: pick('[data-control="present.split"]'), share: pick('[data-control="share.open"]'), assist: pick('[data-control="title.assist"]'), name: pick('[data-control="deck.name"]'), body: pick('body'), docWidth: document.documentElement.scrollWidth };
        });
        writeFileSync(`${OUT}/raw/editor-dom-1440-light.json`, JSON.stringify(facts, null, 1));
      });
    }
    if (v.tag === '390') {
      await tryStep('overflow', async () => {
        const o = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, row: (() => { const r = document.querySelector('[data-control="title.row"]'); return r ? { scrollWidth: r.scrollWidth, clientWidth: r.clientWidth } : null; })(), name: (() => { const n = document.querySelector('[data-control="deck.name"]'); return n ? Math.round(n.getBoundingClientRect().width) : null; })(), share: (() => { const n = document.querySelector('[data-control="share.open"]'); return n ? Math.round(n.getBoundingClientRect().right) : null; })() }));
        log({ overflow390: theme, ...o });
      });
    }
    await tryStep('shortcuts', async () => { await page.keyboard.press('Meta+/'); await page.waitForTimeout(1200); await shot(page, 'dialog-shortcuts', v, theme); await esc(page); });
    for (const which of ['changeName', 'changeAvatar']) {
      await tryStep(which, async () => {
        await page.locator('[data-control="title.account"], [data-control="title.presence.me"]').first().click({ timeout: 8000 });
        await page.waitForTimeout(600);
        await page.locator(`[data-control="account.${which}"]`).first().click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        await shot(page, `dialog-${which === 'changeName' ? 'name' : 'avatar'}`, v, theme);
        await esc(page);
      });
    }
    await tryStep('context', async () => {
      const thumb = page.locator('[data-control^="filmstrip.slide."]').nth(0);
      await thumb.click({ button: 'right', timeout: 8000 });
      await page.waitForTimeout(800);
      await shot(page, 'menu-context', v, theme);
      await esc(page);
    });
    await tryStep('snackbar', async () => {
      await page.keyboard.press('Meta+s');
      await page.locator('[data-control="snackbar"]').first().waitFor({ state: 'visible', timeout: 6000 });
      await page.waitForTimeout(400);
      log({ snackText: await page.locator('[data-control="snackbar"]').first().innerText() });
      await shot(page, 'snackbar', v, theme);
    });
    await tryStep('nowrite', async () => { log({ path: await page.evaluate(() => location.pathname) }); });
    await ctx.close();
  }
}
await b.close();
console.log('done');

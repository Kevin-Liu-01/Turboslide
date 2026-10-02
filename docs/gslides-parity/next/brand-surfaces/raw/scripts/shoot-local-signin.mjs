// The Sign in dialog on the local dev server (port 4491, SQLite accounts file in the overlay):
// production has no sign in method, so the dialog is only reachable here. Opens /new, which writes nothing.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const OUT = '/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-surfaces';
const LOG = `${OUT}/raw/local-signin-log.jsonl`;
const log = (o) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const b = await chromium.launch();
for (const theme of ['light', 'dark']) for (const v of [{ w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' }]) {
  const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, colorScheme: theme, isMobile: v.w < 768, hasTouch: v.w < 768 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  try {
    await page.goto('http://localhost:4491/new', { waitUntil: 'load', timeout: 180000 });
    await page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 180000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.locator('[data-control="title.account"], [data-control="title.presence.me"]').first().click({ timeout: 10000 });
    await page.waitForTimeout(600);
    log({ rows: await page.locator('[data-control^="account."]').evaluateAll((els) => els.map((e) => e.getAttribute('data-control'))) });
    await page.locator('[data-control="account.signIn"]').first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/local-dialog-signin-${v.tag}-${theme}.png` });
    log({ shot: `local-dialog-signin-${v.tag}-${theme}.png`, text: (await page.locator('[role="dialog"]').first().innerText()).slice(0, 600) });
  } catch (e) { log({ tag: v.tag, theme, error: String(e).split('\n')[0].slice(0, 240) }); }
  await ctx.close();
}
await b.close();
console.log('done');

// Shoots read-only production pages at two viewports in both themes.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const OUT = '/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/brand-surfaces';
const BASE = 'https://www.turboslide.com';
const routes = (process.argv[2] ?? 'home:/home,decks:/decks,notfound:/this-page-does-not-exist').split(',').map((s) => s.split(':'));
const views = [ { w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' } ];
const log = [];
const b = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const v of views) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, colorScheme: theme, isMobile: v.w < 768, hasTouch: v.w < 768 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    for (const [name, path] of routes) {
      const t0 = Date.now();
      let status = 0;
      try {
        const r = await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
        status = r?.status() ?? 0;
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1500);
        const file = `${name}-${v.tag}-${theme}.png`;
        await page.screenshot({ path: `${OUT}/${file}` });
        if (process.env.FULL) await page.screenshot({ path: `${OUT}/${name}-${v.tag}-${theme}-full.png`, fullPage: true });
        log.push({ name, path, w: v.w, theme, status, ms: Date.now() - t0, file, at: new Date().toISOString(), url: page.url() });
      } catch (e) {
        log.push({ name, path, w: v.w, theme, status, error: String(e).slice(0, 200), at: new Date().toISOString() });
      }
    }
    await ctx.close();
  }
}
await b.close();
writeFileSync(`${OUT}/raw/static-log-${Date.now()}.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.map((l) => [l.name, l.w, l.theme, l.status, l.ms, l.error ?? ''])));

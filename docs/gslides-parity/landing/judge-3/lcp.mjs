import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch();
const out = [];
for (const d of ['a', 'b', 'c']) for (const W of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W === 390 ? 844 : 900 } });
  await ctx.addInitScript(() => {
    window.__lcp = []; window.__cls = 0;
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__lcp.push({ t: Math.round(e.startTime), el: (e.element?.tagName || '') + '.' + (e.element?.className || '').toString().slice(0, 24), size: e.size }))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await ctx.newPage();
  await page.goto(`file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-${d}/index.html`);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => ({ lcp: window.__lcp.at(-1), cls: +window.__cls.toFixed(5), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0) }));
  out.push({ d, W, ...r });
  await ctx.close();
}
console.log(JSON.stringify(out));
await browser.close();

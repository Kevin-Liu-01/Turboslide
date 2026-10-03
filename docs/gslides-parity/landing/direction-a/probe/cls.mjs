import { createRequire } from 'module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => {
    window.__ls = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ls.push({ t: Math.round(e.startTime), v: e.value, src: (e.sources || []).map(s => { const n = s.node; return (n && (n.id || (n.className && n.className.baseVal === undefined ? n.className : n.nodeName))) + ' ' + JSON.stringify([s.previousRect.y, s.currentRect.y, s.previousRect.height, s.currentRect.height, s.previousRect.x, s.currentRect.x]); }) }); }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html');
  await page.waitForTimeout(7000);
  console.log(w, JSON.stringify(await page.evaluate(() => window.__ls), null, 1));
  await page.close();
}
await browser.close();

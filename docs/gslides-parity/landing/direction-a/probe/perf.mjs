import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const URL = 'file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-a/index.html';
const browser = await chromium.launch();
const rows = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (let run = 0; run < 3; run++) {
    const load = execSync('sysctl -n vm.loadavg').toString().trim();
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window); window.__rafs = 0; window.requestAnimationFrame = (f) => { window.__rafs++; return raf(f); };
      window.__perf = { lcp: 0, lcpEl: '', cls: 0, long: [], fcp: 0 };
      new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpEl = (e.element && (e.element.id || e.element.className || e.element.tagName)) || ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(URL, { waitUntil: 'load' });
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const atLoad = await m();
    await page.waitForTimeout(6500); // the hero sequence ends at about 5.4 s
    const atIntro = await m();
    // idle: the page's own rAF calls and main thread over 2 s with nothing touched
    const r0 = await page.evaluate(() => window.__rafs);
    await page.waitForTimeout(2000);
    const raf = (await page.evaluate(() => window.__rafs)) - r0;
    const atIdle = await m();
    const perf = await page.evaluate(() => ({ ...window.__perf, nav: performance.getEntriesByType('navigation')[0].loadEventEnd }));
    const anim = await page.evaluate(() => document.getAnimations().length);
    rows.push({ w, h, run, load, fcp: Math.round(perf.fcp), lcp: Math.round(perf.lcp), lcpEl: perf.lcpEl, cls: perf.cls, longTasks: perf.long, loadEvent: Math.round(perf.nav),
      taskAtLoadMs: Math.round(atLoad.TaskDuration * 1000), scriptAtLoadMs: Math.round(atLoad.ScriptDuration * 1000),
      taskFirstScreenMs: Math.round(atIntro.TaskDuration * 1000), scriptFirstScreenMs: Math.round(atIntro.ScriptDuration * 1000), layoutMs: Math.round(atIntro.LayoutDuration * 1000), styleMs: Math.round(atIntro.RecalcStyleDuration * 1000),
      idleTaskMsOver2s: Math.round((atIdle.TaskDuration - atIntro.TaskDuration) * 1000), animationsLeft: anim, rafCallsIn2s: raf });
    // the develop's frame cost: draw the mood field at the end tone ten times
    if (run === 0) {
      const cost = await page.evaluate(async () => { const D = window.__dirA.Dither; await D.load(); const cv = document.querySelector('.mood-cv'); const t0 = performance.now(); for (let i = 0; i < 10; i++) D.draw(cv, (i + 1) / 10); return { perFrameMs: (performance.now() - t0) / 10, cells: cv.width * cv.height, cols: cv.width, rows: cv.height }; });
      rows[rows.length - 1].ditherFrame = cost;
    }
    await ctx.close();
  }
}
console.log(JSON.stringify(rows, null, 1));
await browser.close();

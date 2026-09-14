// Measures turboslide.vercel.app with Playwright over CDP: navigation timing, paint entries,
// LCP, long animation frames, resource bytes by type, cache headers of hashed assets and
// thumbnails. Read only: it visits pages that write nothing (/new writes on first edit only).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'https://turboslide.vercel.app';
const PAGES = ['/new', '/decks', '/deck/gt-brand', '/edit/gt-brand', '/home'];
const RUNS = 2;

const OBSERVER = `
window.__perf = { lcp: [], loaf: [], cls: 0, inp: [] };
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp.push({ t: e.startTime, size: e.size, el: e.element ? e.element.tagName + '.' + (e.element.className||'').toString().slice(0,40) : null, url: e.url || null }); }).observe({ type: 'largest-contentful-paint', buffered: true });
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration), scripts: (e.scripts||[]).slice(0,3).map(s => (s.sourceURL||'').split('/').pop() + ':' + s.invokerType + ':' + Math.round(s.duration)) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
`;

async function measure(browser, path, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(OBSERVER);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const responses = [];
  page.on('response', (r) => {
    const h = r.headers();
    responses.push({
      url: r.url(),
      status: r.status(),
      type: r.request().resourceType(),
      cc: h['cache-control'] ?? null,
      xcache: h['x-vercel-cache'] ?? null,
      enc: h['content-encoding'] ?? null,
      len: h['content-length'] ? Number(h['content-length']) : null,
      ct: (h['content-type'] ?? '').split(';')[0],
    });
  });
  const t0 = Date.now();
  const nav = await page.goto(BASE + path, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const wall = Date.now() - t0;
  const timing = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]),
    );
    const res = performance.getEntriesByType('resource');
    const byType = {};
    for (const r of res) {
      const k = r.initiatorType;
      byType[k] ??= { n: 0, transfer: 0, decoded: 0 };
      byType[k].n += 1;
      byType[k].transfer += r.transferSize || 0;
      byType[k].decoded += r.decodedBodySize || 0;
    }
    const perf = window.__perf || {};
    return {
      ttfb: Math.round(n.responseStart),
      responseEnd: Math.round(n.responseEnd),
      domInteractive: Math.round(n.domInteractive),
      dcl: Math.round(n.domContentLoadedEventEnd),
      load: Math.round(n.loadEventEnd),
      transferSizeHtml: n.transferSize,
      encodedHtml: n.encodedBodySize,
      decodedHtml: n.decodedBodySize,
      protocol: n.nextHopProtocol,
      paints,
      lcp: perf.lcp?.length ? perf.lcp[perf.lcp.length - 1] : null,
      loaf: perf.loaf ?? [],
      cls: Number((perf.cls ?? 0).toFixed(4)),
      resources: res.length,
      byType,
    };
  });
  const metrics = await cdp.send('Performance.getMetrics');
  const pick = (name) => metrics.metrics.find((m) => m.name === name)?.value;
  const cdpMetrics = {
    scriptDurationMs: Math.round((pick('ScriptDuration') ?? 0) * 1000),
    layoutDurationMs: Math.round((pick('LayoutDuration') ?? 0) * 1000),
    recalcStyleMs: Math.round((pick('RecalcStyleDuration') ?? 0) * 1000),
    taskDurationMs: Math.round((pick('TaskDuration') ?? 0) * 1000),
    jsHeapUsedMb: Math.round((pick('JSHeapUsedSize') ?? 0) / 1e6),
    nodes: pick('Nodes'),
    layoutCount: pick('LayoutCount'),
  };
  const html = {
    status: nav?.status(),
    headers: nav
      ? {
          cc: nav.headers()['cache-control'],
          xcache: nav.headers()['x-vercel-cache'],
          server: nav.headers()['server'],
        }
      : null,
  };
  const editorReady =
    path.startsWith('/edit') || path === '/new'
      ? await page.evaluate(() => typeof window.turboslide !== 'undefined').catch(() => null)
      : null;
  await context.close();
  return { path, run, wall, html, timing, cdpMetrics, editorReady, responses };
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const out = [];
for (let run = 1; run <= RUNS; run += 1) {
  for (const path of PAGES) {
    try {
      const r = await measure(browser, path, run);
      out.push(r);
      const t = r.timing;
      console.log(
        `${path} run${run}: status ${r.html.status} ttfb ${t.ttfb} fcp ${t.paints['first-contentful-paint'] ?? '-'} lcp ${t.lcp ? Math.round(t.lcp.t) : '-'} dcl ${t.dcl} load ${t.load} wall ${r.wall} res ${t.resources} loaf ${t.loaf.length} cls ${t.cls} script ${r.cdpMetrics.scriptDurationMs}ms heap ${r.cdpMetrics.jsHeapUsedMb}MB proto ${t.protocol} xcache ${r.html.headers?.xcache}`,
      );
    } catch (error) {
      console.log(`${path} run${run}: failed ${error.message}`);
      out.push({ path, run, error: error.message });
    }
  }
}
await browser.close();
writeFileSync(
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/perf-measure.json',
  JSON.stringify(out, null, 2),
);
console.log('written');

#!/usr/bin/env node
// Five cold loads of /home on production at 1440x900 with a person's user agent: LCP, FCP, the
// final headers, JavaScript bytes (encoded and decoded), CSS, fonts, images, total bytes, requests,
// CLS, main thread script, each run with its uptime line. Prints the medians.
//   node perf.mjs [runs] [base] [width] [height]
import { createRequire } from 'node:module';
import { appendFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const CHROME =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const RUNS = Number(process.argv[2] ?? 5);
const BASE = process.argv[3] ?? 'https://www.turboslide.com';
const W = Number(process.argv[4] ?? 1440);
const H = Number(process.argv[5] ?? 900);
const OUT = new URL('./', import.meta.url).pathname;
const TAG = `${W}${process.env.DPR ? '-dpr' + process.env.DPR : ''}`;
const uptime = () => execSync('uptime').toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `(() => {
  const ts = { lcp: null, cls: 0 };
  window.__ts = ts;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { const el = e.element; ts.lcp = { t: Math.round(e.startTime), size: e.size, el: el ? el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') : null, url: e.url || null }; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) ts.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
})();`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const probe = await browser.newContext();
const UA = (await (await probe.newPage()).evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
await probe.close();

const rows = [];
for (let i = 0; i < RUNS; i++) {
  const up = uptime();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR ?? 1), userAgent: UA, colorScheme: 'light' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId) ?? {}; Object.assign(r, { url: e.response.url, type: e.type, status: e.response.status, mime: e.response.mimeType, cache: e.response.headers['x-vercel-cache'] ?? e.response.headers['X-Vercel-Cache'] ?? null }); reqs.set(e.requestId, r); });
  cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId) ?? {}; r.decoded = (r.decoded ?? 0) + e.dataLength; reqs.set(e.requestId, r); });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId) ?? {}; r.encoded = e.encodedDataLength; r.done = true; reqs.set(e.requestId, r); });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId) ?? {}; r.failed = e.errorText; reqs.set(e.requestId, r); });
  const t0 = Date.now();
  await page.goto(`${BASE}/home`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('main', { timeout: 30000 });
  await page.waitForTimeout(3000); // let LCP settle and late requests finish
  const facts = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
    const ts = window.__ts;
    const hyd = document.querySelector('[data-hydrated]') ? true : false;
    return {
      finalHeaders: nav.finalResponseHeadersStart ? Math.round(nav.finalResponseHeadersStart) : Math.round(nav.responseStart),
      ttfb: Math.round(nav.responseStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      fcp: paint['first-contentful-paint'] ?? null,
      lcp: ts.lcp,
      cls: +ts.cls.toFixed(4),
      hydrated: hyd,
      docHeight: document.documentElement.scrollHeight,
    };
  });
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const list = [...reqs.values()].filter((r) => r.url && !r.url.startsWith('data:'));
  const kind = (r) => (r.type === 'Script' ? 'js' : r.type === 'Stylesheet' ? 'css' : r.type === 'Font' ? 'font' : r.type === 'Image' ? 'img' : r.type === 'Document' ? 'doc' : 'other');
  const by = {};
  for (const r of list) { const k = kind(r); by[k] ??= { n: 0, encoded: 0, decoded: 0, files: [] }; by[k].n++; by[k].encoded += r.encoded ?? 0; by[k].decoded += r.decoded ?? 0; by[k].files.push(`${new URL(r.url).pathname} ${r.encoded ?? '?'}/${r.decoded ?? '?'}`); }
  const total = { requests: list.length, encoded: list.reduce((a, r) => a + (r.encoded ?? 0), 0), decoded: list.reduce((a, r) => a + (r.decoded ?? 0), 0) };
  const row = { run: i + 1, at: new Date(t0).toISOString(), uptime: up, ...facts, scriptMs: Math.round(m.ScriptDuration * 1000), taskMs: Math.round(m.TaskDuration * 1000), total, by };
  rows.push(row);
  appendFileSync(`${OUT}perf-${W}${process.env.DPR ? '-dpr' + process.env.DPR : ''}.jsonl`, JSON.stringify(row) + '\n');
  console.log(`run ${i + 1} lcp ${row.lcp?.t} fcp ${row.fcp} hdr ${row.finalHeaders} js ${by.js?.encoded}/${by.js?.decoded} total ${total.encoded} req ${total.requests} script ${row.scriptMs} | ${up}`);
  await ctx.close();
  await sleep(2000);
}
await browser.close();
const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const worst = (xs) => Math.max(...xs.filter((x) => x != null));
const pick = { finalHeaders: (r) => r.finalHeaders, fcp: (r) => r.fcp, lcp: (r) => r.lcp?.t, load: (r) => r.load, jsEncoded: (r) => r.by.js?.encoded, jsDecoded: (r) => r.by.js?.decoded, jsFiles: (r) => r.by.js?.n, cssDecoded: (r) => r.by.css?.decoded, fontEncoded: (r) => r.by.font?.encoded, imgEncoded: (r) => r.by.img?.encoded, docEncoded: (r) => r.by.doc?.encoded, totalEncoded: (r) => r.total.encoded, totalDecoded: (r) => r.total.decoded, requests: (r) => r.total.requests, cls: (r) => r.cls, scriptMs: (r) => r.scriptMs };
const summary = Object.fromEntries(Object.entries(pick).map(([k, f]) => [k, { median: med(rows.map(f)), worst: worst(rows.map(f)) }]));
summary.lcpElement = rows.map((r) => r.lcp?.el + ' ' + (r.lcp?.url ?? ''));
summary.loads = rows.map((r) => r.uptime.split('load averages: ')[1]);
writeFileSync(`${OUT}perf-${W}${process.env.DPR ? '-dpr' + process.env.DPR : ''}-summary.json`, JSON.stringify({ base: BASE, viewport: `${W}x${H}`, ua: UA, runs: RUNS, summary, files: rows[0].by }, null, 2));
console.log(JSON.stringify(summary, null, 2));

#!/usr/bin/env node
// The performance auditor's production probe (docs/gslides-parity/next/audit-performance.md).
// Read only except the scratch decks it creates (ids in state/ids.json, removed by cleanup.mjs).
//   node perf-audit.mjs <phase> [runs]
// phases: setup, routes, transitions, filmstrip, present, export, gslides
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');

const DIR = new URL('.', import.meta.url).pathname;
const STATE = `${DIR}state`;
mkdirSync(STATE, { recursive: true });
const BASE = 'https://www.turboslide.com';
const CHROME =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FLAGS = ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'];
const phase = process.argv[2];
const RUNS = Number(process.argv[3] ?? 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uptime = () => execSync('uptime').toString().trim();
const now = () => new Date().toISOString();
const log = (...a) => console.log(now().slice(11, 19), ...a);
const out = (name, obj) => {
  appendFileSync(`${STATE}/${name}${process.env.PERSON_UA === '1' ? '-person' : ''}.jsonl`, `${JSON.stringify({ at: now(), uptime: uptime(), ...obj })}\n`);
};
const ids = () => (existsSync(`${STATE}/ids.json`) ? JSON.parse(readFileSync(`${STATE}/ids.json`, 'utf8')) : {});
const saveIds = (patch) => writeFileSync(`${STATE}/ids.json`, JSON.stringify({ ...ids(), ...patch }, null, 2));
const STORAGE = `${STATE}/storage.json`;

const INIT = `(() => {
  const ts = { lcp: null, cls: 0, loaf: [], events: [], firstDom: {}, studioAt: null, settledAt: null, hydratedAt: null, caretAt: null, down: null, armed: null, key: null };
  window.__ts = ts;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { const el = e.element; ts.lcp = { t: e.startTime, size: e.size, el: el ? el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') : null, url: e.url || null }; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) ts.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) ts.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) ts.events.push({ n: e.name, t: Math.round(e.startTime), d: e.duration, ps: Math.round(e.processingStart - e.startTime), pe: Math.round(e.processingEnd - e.startTime) }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  const want = ['.ts-title-row', '.ts-home-page', '.pt-viewer', '.ts-presenter', '.ts-filmstrip .ts-card', '.ts-filmstrip .ts-card .pt-slide', 'main', '.ts-slideshow'];
  const check = () => {
    const now = performance.now();
    for (const s of want) if (!(s in ts.firstDom) && document.querySelector(s)) ts.firstDom[s] = now;
    try { if (ts.studioAt === null && window.turboslide && window.turboslide.studio) ts.studioAt = now; } catch {}
    if (ts.settledAt === null && document.querySelector('.pt-viewer[data-settled]')) ts.settledAt = now;
    if (ts.hydratedAt === null && document.querySelector('[data-hydrated]')) ts.hydratedAt = now;
    if (ts.caretAt === null) { const a = document.activeElement; if (a && a.isContentEditable && a.closest && a.closest('.ts-stagewrap')) ts.caretAt = now; }
    const a = ts.armed;
    if (a && a.appear === null) { let ok = false; try { ok = Boolean(a.pred()); } catch {} if (ok) { a.appear = now; requestAnimationFrame(() => { a.frame = performance.now(); }); } }
  };
  const mo = new MutationObserver(check);
  const start = () => { try { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-settled', 'data-hydrated', 'class', 'contenteditable'] }); } catch {} };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  setInterval(check, 4);
  document.addEventListener('focusin', check, true);
  window.addEventListener('pointerdown', () => { ts.down = performance.now(); }, { capture: true });
  window.__tsArm = (src) => { ts.armed = { pred: new Function('return (' + src + ')()'), appear: null, frame: null }; ts.down = null; };
  window.__tsArmed = () => ts.armed && ts.armed.appear !== null ? { down: ts.down, appear: ts.armed.appear, frame: ts.armed.frame } : null;
  // keystroke probe: keydown timeStamp, the first DOM text change after it, the frame after that
  window.__tsKeyArm = () => { ts.key = { down: null, mut: null, frame: null }; };
  document.addEventListener('keydown', (e) => { if (ts.key && ts.key.down === null) ts.key.down = e.timeStamp; }, true);
  const kmo = new MutationObserver(() => { const k = ts.key; if (k && k.down !== null && k.mut === null) { k.mut = performance.now(); requestAnimationFrame(() => { k.raf = performance.now(); setTimeout(() => { k.frame = performance.now(); }, 0); }); } });
  const kstart = () => { try { kmo.observe(document.documentElement, { characterData: true, childList: true, subtree: true }); } catch {} };
  if (document.documentElement) kstart(); else document.addEventListener('DOMContentLoaded', kstart);
})();`;

const READY = {
  edit: `() => { try { return Boolean(window.turboslide && window.turboslide.studio) && Boolean(document.querySelector('.pt-viewer[data-settled]')); } catch { return false; } }`,
  decks: `() => Boolean(document.querySelector('.ts-home-page[data-hydrated]'))`,
  home: `() => document.readyState === 'complete' && Boolean(document.querySelector('main'))`,
  present: `() => { const p = document.querySelector('.ts-presenter:not(.ts-skeleton) .ts-presenter-frame.is-current'); if (!p || !p.querySelector('.pt-slide')) return false; for (const i of p.querySelectorAll('img')) if (!i.complete || i.naturalWidth === 0) return false; return true; }`,
};
const fn = (src) => new Function(`return (${src})()`);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: FLAGS });
// PERSON_UA=1: the user agent a person's Chrome sends (HeadlessChrome is a bot to isbot, and
// TanStack's stream renderer waits for allReady on a bot, so the headless agent measures the bot path)
const PERSON = process.env.PERSON_UA === '1';
let PERSON_UA = null;
if (PERSON) {
  const c = await browser.newContext();
  const p = await c.newPage();
  PERSON_UA = (await p.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await c.close();
}

async function newContext({ storage = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(storage && existsSync(STORAGE) ? { storageState: STORAGE } : {}),
    acceptDownloads: true,
    ...(PERSON_UA ? { userAgent: PERSON_UA } : {}),
  });
  await context.addInitScript(INIT);
  return context;
}

/** Request accounting through the protocol: every request's encoded bytes, type and timing. */
function track(page) {
  const list = [];
  page.on('requestfinished', async (req) => {
    try {
      const s = await req.sizes();
      const resp = await req.response();
      const t = req.timing();
      list.push({ url: req.url(), type: req.resourceType(), method: req.method(), status: resp ? resp.status() : null, body: s.responseBodySize, headers: s.responseHeadersSize, start: t.startTime, ttfb: t.responseStart, end: t.responseEnd, cache: resp ? resp.headers()['x-vercel-cache'] ?? null : null, fromCache: resp ? await resp.request().redirectedFrom() !== null : null });
    } catch {}
  });
  page.on('requestfailed', (req) => list.push({ url: req.url(), type: req.resourceType(), failed: req.failure()?.errorText ?? 'failed' }));
  return list;
}

async function cdpOpen(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  return cdp;
}
async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { scriptMs: Math.round(m.ScriptDuration * 1000), taskMs: Math.round(m.TaskDuration * 1000), layoutMs: Math.round(m.LayoutDuration * 1000), styleMs: Math.round(m.RecalcStyleDuration * 1000), heapMb: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes };
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name));
    const css = res.filter((r) => /\.css(\?|$)/.test(r.name));
    const fonts = res.filter((r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.name));
    const imgs = res.filter((r) => r.initiatorType === 'img' || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(r.name));
    const api = res.filter((r) => /\/_serverFn\/|\/api\//.test(r.name));
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
    const ts = window.__ts || {};
    const sum = (xs, k) => xs.reduce((a, r) => a + (r[k] || 0), 0);
    return {
      ttfb: nav ? nav.responseStart : null,
      finalHeaders: nav && nav.finalResponseHeadersStart ? nav.finalResponseHeadersStart : null,
      interim: nav && nav.firstInterimResponseStart ? nav.firstInterimResponseStart : null,
      reqStart: nav ? nav.requestStart : null,
      connect: nav ? nav.connectEnd - nav.connectStart : null,
      dns: nav ? nav.domainLookupEnd - nav.domainLookupStart : null,
      serverTiming: nav && nav.serverTiming ? nav.serverTiming.map((x) => `${x.name};${x.duration};${x.description}`) : [],
      serverWait: nav ? (nav.finalResponseHeadersStart || nav.responseStart) - nav.requestStart : null,
      docEnd: nav ? nav.responseEnd : null,
      docTransfer: nav ? nav.transferSize : null,
      docDecoded: nav ? nav.decodedBodySize : null,
      dcl: nav ? nav.domContentLoadedEventEnd : null,
      load: nav ? nav.loadEventEnd : null,
      fcp: paint['first-contentful-paint'] ?? null,
      lcp: ts.lcp ? ts.lcp.t : null,
      lcpEl: ts.lcp ? ts.lcp.el : null,
      lcpUrl: ts.lcp ? ts.lcp.url : null,
      cls: ts.cls,
      loafMax: ts.loaf && ts.loaf.length ? Math.max(...ts.loaf.map((l) => l.d)) : 0,
      loafBlocking: ts.loaf ? ts.loaf.reduce((a, l) => a + l.b, 0) : 0,
      jsCount: js.length,
      jsTransfer: sum(js, 'transferSize'),
      jsDecoded: sum(js, 'decodedBodySize'),
      js: js.map((r) => ({ n: r.name.replace(location.origin, ''), d: r.decodedBodySize, t: r.transferSize, s: Math.round(r.startTime), e: Math.round(r.responseEnd) })),
      cssCount: css.length,
      cssDecoded: sum(css, 'decodedBodySize'),
      cssTransfer: sum(css, 'transferSize'),
      fonts: fonts.map((r) => ({ n: r.name.replace(location.origin, ''), t: r.transferSize, d: r.decodedBodySize, s: Math.round(r.startTime), e: Math.round(r.responseEnd) })),
      imgCount: imgs.length,
      imgDecoded: sum(imgs, 'decodedBodySize'),
      api: api.map((r) => ({ n: r.name.replace(location.origin, '').slice(0, 120), s: Math.round(r.startTime), rs: Math.round(r.responseStart), e: Math.round(r.responseEnd), t: r.transferSize })),
      resCount: res.length,
      firstDom: ts.firstDom,
      studioAt: ts.studioAt,
      settledAt: ts.settledAt,
      hydratedAt: ts.hydratedAt,
      caretAt: ts.caretAt,
      events: ts.events,
      key: ts.key,
      cards: document.querySelectorAll('.ts-filmstrip .ts-card').length,
      homeCards: document.querySelectorAll('[data-control^="home.open."]').length,
    };
  });
}

function docHeaders(resp) {
  if (!resp) return null;
  const h = resp.headers();
  return { status: resp.status(), cache: h['x-vercel-cache'] ?? null, id: h['x-vercel-id'] ?? null, age: h.age ?? null, cc: h['cache-control'] ?? null, st: h['server-timing'] ?? null, enc: h['content-encoding'] ?? null };
}

/** One route load: navigation, the ready landmark, a settle, the facts. */
async function load(context, url, ready, { settle = 3000, extra } = {}) {
  const page = await context.newPage();
  const reqs = track(page);
  const cdp = await cdpOpen(page).catch(() => null);
  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  let readyOk = true;
  try {
    await page.waitForFunction(fn(ready), null, { timeout: 120_000, polling: 50 });
  } catch {
    readyOk = false;
  }
  const readyAt = await page.evaluate(() => performance.now()).catch(() => null);
  const wallReady = Date.now() - t0;
  const extraOut = extra && readyOk ? await extra(page).catch((e) => ({ error: String(e).split('\n')[0] })) : null;
  await sleep(settle);
  const facts = await pageFacts(page);
  if (!readyOk || (resp && resp.status() >= 400)) {
    facts.pageText = await page.evaluate(() => (document.querySelector('main') || document.body || {}).innerText?.slice(0, 600) ?? null).catch(() => null);
  }
  const cdpOut = cdp ? await cdpMetrics(cdp).catch(() => null) : null;
  const totalBody = reqs.reduce((a, r) => a + Math.max(0, r.body || 0), 0);
  const byType = {};
  for (const r of reqs) {
    byType[r.type] ??= { n: 0, bytes: 0 };
    byType[r.type].n += 1;
    byType[r.type].bytes += Math.max(0, r.body || 0);
  }
  return { page, reqs, sample: { url: url.replace(BASE, ''), readyOk, readyPoll: readyAt, wallReady, doc: docHeaders(resp), requests: reqs.length, bodyBytes: totalBody, byType, failed: reqs.filter((r) => r.failed).map((r) => `${r.url.slice(0, 100)} ${r.failed}`), facts, cdp: cdpOut, extra: extraOut } };
}

/** Caret then first keystroke on the editor (A1 click model: a double click opens the text). */
async function caretAndKey(page) {
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first();
  await run.waitFor({ timeout: 30_000 });
  const box = await run.boundingBox();
  const clickAt = await page.evaluate(() => performance.now());
  await page.mouse.dblclick(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  await page.waitForFunction(() => window.__ts.caretAt !== null, null, { timeout: 15_000, polling: 10 });
  const caretAt = await page.evaluate(() => window.__ts.caretAt);
  await page.keyboard.press('End');
  await sleep(300);
  await page.evaluate(() => window.__tsKeyArm());
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__ts.key && window.__ts.key.frame != null, null, { timeout: 10_000, polling: 10 }).catch(() => undefined);
  await sleep(400);
  const k = await page.evaluate(() => ({ key: window.__ts.key, ev: window.__ts.events.filter((e) => e.n === 'keydown' || e.n === 'keypress' || e.n === 'keyup' || e.n === 'beforeinput' || e.n === 'input').slice(-6) }));
  await page.keyboard.press('Backspace');
  await sleep(200);
  await page.keyboard.press('Escape');
  return { clickAt, caretAt, clickToCaret: caretAt - clickAt, keyToMut: k.key && k.key.mut != null ? k.key.mut - k.key.down : null, keyToRaf: k.key && k.key.raf != null ? k.key.raf - k.key.down : null, keyToFrame: k.key && k.key.frame != null ? k.key.frame - k.key.down : null, eventTiming: k.ev };
}

async function setup() {
  const context = await newContext({ storage: false });
  const page = await context.newPage();
  // deck A: /new, a typed title creates it
  await page.goto(`${BASE}/new`, { waitUntil: 'commit' });
  await page.waitForFunction(fn(READY.edit), null, { timeout: 120_000 });
  await sleep(800);
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first();
  await run.waitFor({ timeout: 30_000 });
  const box = await run.boundingBox();
  await page.mouse.dblclick(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  await page.waitForFunction(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]')), null, { timeout: 15_000 });
  await page.keyboard.type('Perf audit scratch', { delay: 30 });
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  const a = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
  saveIds({ a });
  log('deck A', a);
  await page.keyboard.press('Escape');
  await sleep(3000);
  await context.storageState({ path: STORAGE });
  // deck B: the template gallery's GT brand deck (85 slides)
  await page.goto(`${BASE}/decks/templates`, { waitUntil: 'commit' });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-hydrated]')), null, { timeout: 120_000 });
  await sleep(1000);
  const controls = await page.evaluate(() => [...document.querySelectorAll('[data-control^="templates.card."]')].map((e) => ({ c: e.getAttribute('data-control'), t: (e.textContent || '').slice(0, 80) })));
  writeFileSync(`${STATE}/templates.json`, JSON.stringify(controls, null, 2));
  const gt = controls.find((c) => c.c.endsWith('.open') && /General Translation|gt-brand/i.test(c.t)) ?? controls.find((c) => c.c.endsWith('.open') && /gt-brand/.test(c.c));
  if (!gt) {
    log('no GT template card', JSON.stringify(controls).slice(0, 400));
  } else {
    const t0 = Date.now();
    await page.locator(`[data-control="${gt.c}"]`).first().click();
    await page.waitForURL(/\/edit\//, { timeout: 180_000 });
    const b = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
    saveIds({ b });
    await page.waitForFunction(fn(READY.edit), null, { timeout: 180_000 });
    const createMs = Date.now() - t0;
    log('deck B', b, 'created and ready in', createMs, 'ms');
    out('setup', { b, createFromTemplateMs: createMs, slides: await page.evaluate(() => document.querySelectorAll('.ts-filmstrip .ts-card').length) });
  }
  await sleep(2000);
  await context.storageState({ path: STORAGE });
  await context.close();
}

async function routes() {
  const { a } = ids();
  const list = [
    ['/home', READY.home, null],
    ['/decks', READY.decks, null],
    [`/edit/${encodeURIComponent(a)}`, READY.edit, caretAndKey],
  ];
  for (let run = 0; run < RUNS; run += 1) {
    for (const [route, ready, extra] of list) {
      const context = await newContext();
      for (const kind of ['cold', 'warm']) {
        try {
          const { page, sample } = await load(context, `${BASE}${route}`, ready, { extra: kind === 'cold' || extra ? extra : null });
          out('routes', { run, kind, ...sample });
          log('routes', run, kind, route.slice(0, 30), 'ttfb', Math.round(sample.facts.ttfb), 'fcp', Math.round(sample.facts.fcp ?? -1), 'lcp', Math.round(sample.facts.lcp ?? -1), 'ready', Math.round(sample.readyPoll), 'js', sample.facts.jsTransfer, sample.facts.jsDecoded, 'reqs', sample.requests, sample.extra ? `caret ${Math.round(sample.extra.caretAt ?? -1)} key ${sample.extra.keyToFrame}` : '');
          await page.close();
        } catch (e) {
          log('routes error', route, String(e).split('\n')[0]);
          out('routes', { run, kind, route, error: String(e).split('\n')[0] });
        }
      }
      await context.close();
    }
  }
}

async function transitions() {
  const { a } = ids();
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/decks`, { waitUntil: 'commit' });
  await page.waitForFunction(fn(READY.decks), null, { timeout: 120_000 });
  await sleep(1500);
  const editPred = `() => location.pathname.startsWith(${JSON.stringify(`/edit/${a}`)}) && (${READY.edit})()`;
  const decksPred = `() => location.pathname === '/decks' && (${READY.decks})()`;
  for (let run = 0; run < RUNS; run += 1) {
    try {
      const card = page.locator(`[data-control="home.open.${a}"]`).first();
      await card.waitFor({ timeout: 30_000 });
      await card.hover();
      await sleep(200);
      await page.evaluate(() => { window.__tsDoc = true; });
      await page.evaluate((src) => window.__tsArm(src), editPred);
      const w0 = Date.now();
      await card.click();
      await page.waitForFunction(fn(editPred), null, { timeout: 120_000, polling: 20 });
      const same1 = await page.evaluate(() => Boolean(window.__tsDoc));
      const m1 = same1 ? await page.evaluate(() => window.__tsArmed()) : null;
      const toEdit = { wall: Date.now() - w0, inPage: m1 && m1.down !== null ? m1.appear - m1.down : null, paint: m1 && m1.down !== null && m1.frame ? m1.frame - m1.down : null, sameDocument: same1 };
      await sleep(1500);
      const home = page.locator('[data-control="title.home"]').first();
      await page.evaluate(() => { window.__tsDoc = true; });
      await page.evaluate((src) => window.__tsArm(src), decksPred);
      const w1 = Date.now();
      await home.click();
      await page.waitForFunction(fn(decksPred), null, { timeout: 120_000, polling: 20 });
      const same2 = await page.evaluate(() => Boolean(window.__tsDoc));
      const m2 = same2 ? await page.evaluate(() => window.__tsArmed()) : null;
      const toDecks = { wall: Date.now() - w1, inPage: m2 && m2.down !== null ? m2.appear - m2.down : null, paint: m2 && m2.down !== null && m2.frame ? m2.frame - m2.down : null, sameDocument: same2 };
      out('transitions', { run, toEdit, toDecks });
      log('transitions', run, JSON.stringify({ toEdit, toDecks }));
      await sleep(1500);
    } catch (e) {
      log('transitions error', String(e).split('\n')[0]);
      out('transitions', { run, error: String(e).split('\n')[0] });
      await page.goto(`${BASE}/decks`, { waitUntil: 'commit' });
      await page.waitForFunction(fn(READY.decks), null, { timeout: 120_000 }).catch(() => undefined);
      await sleep(1500);
    }
  }
  await context.close();
}

/** Visible filmstrip cards all hold a clone with every picture decoded. */
const FILLED = `() => {
  const list = document.querySelector('.ts-filmstrip');
  if (!list) return false;
  const box = list.getBoundingClientRect();
  const cards = [...list.querySelectorAll('.ts-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > box.top && r.top < box.bottom && r.height > 0; });
  if (cards.length === 0) return false;
  for (const c of cards) {
    if (!c.querySelector('.pt-slide')) return false;
    for (const img of c.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) return false;
  }
  window.__tsVisibleCards = cards.length;
  return true;
}`;

async function filmstrip() {
  const { b } = ids();
  for (let run = 0; run < RUNS; run += 1) {
    const context = await newContext();
    try {
      const { page, sample } = await load(context, `${BASE}/edit/${encodeURIComponent(b)}`, READY.edit, {
        settle: 1500,
        extra: async (p) => {
          await p.waitForFunction(fn(FILLED), null, { timeout: 120_000, polling: 20 });
          const filledAt = await p.evaluate(() => performance.now());
          const visible = await p.evaluate(() => window.__tsVisibleCards);
          // a jump to the middle of the list, then the visible cards filled again
          const t = await p.evaluate(() => { const l = document.querySelector('.ts-filmstrip'); const s = l.closest('[class*="scroll"]') || l; const target = l.scrollHeight > l.clientHeight ? l : (l.parentElement || l); target.scrollTop = target.scrollHeight / 2; return performance.now(); });
          await sleep(30);
          await p.waitForFunction(fn(FILLED), null, { timeout: 60_000, polling: 20 });
          const refill = (await p.evaluate(() => performance.now())) - t;
          return { filledAt, visible, refillMs: refill };
        },
      });
      out('filmstrip', { run, ...sample });
      log('filmstrip', run, 'ready', Math.round(sample.readyPoll), 'filled', JSON.stringify(sample.extra), 'cards', sample.facts.cards, 'js', sample.facts.jsDecoded, 'lcp', Math.round(sample.facts.lcp ?? -1));
      await page.close();
    } catch (e) {
      log('filmstrip error', String(e).split('\n')[0]);
      out('filmstrip', { run, error: String(e).split('\n')[0] });
    }
    await context.close();
  }
}

const SHOWN = `() => { const v = document.querySelector('.ts-slideshow .pt-viewer.is-present') || document.querySelector('.pt-viewer.is-present'); if (!v) return false; for (const img of v.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) return false; return true; }`;

async function present() {
  const { a, b } = ids();
  // in the editor: the Slideshow button to the first slide painted with its pictures
  for (const [name, id] of [['b', b], ['a', a]]) {
    const context = await newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/edit/${encodeURIComponent(id)}`, { waitUntil: 'commit' });
    await page.waitForFunction(fn(READY.edit), null, { timeout: 120_000 });
    await sleep(2000);
    for (let run = 0; run < RUNS; run += 1) {
      try {
        const btn = page.locator('[data-control="present.open"]').first();
        await page.evaluate((src) => window.__tsArm(src), SHOWN);
        await btn.click();
        await page.waitForFunction(() => window.__tsArmed() !== null, null, { timeout: 60_000, polling: 10 });
        const m = await page.evaluate(() => window.__tsArmed());
        out('present', { deck: name, how: 'editor slideshow', run, ms: m.appear - m.down, paint: m.frame ? m.frame - m.down : null });
        log('present slideshow', name, run, Math.round(m.appear - m.down));
        await page.keyboard.press('Escape');
        await sleep(1200);
      } catch (e) {
        log('present error', String(e).split('\n')[0]);
        out('present', { deck: name, run, error: String(e).split('\n')[0] });
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(1000);
      }
    }
    await context.close();
  }
  await presentDoc();
}

/** /decks with a person's agent: the shell, then the first store card and the first twelve with their pictures. */
async function decksCards() {
  const cardsIn = (n) => `() => { const cards = [...document.querySelectorAll('[data-control^="home.open."] img')]; if (cards.length < ${n}) return false; return cards.slice(0, ${n}).every((i) => i.complete && i.naturalWidth > 0); }`;
  for (let run = 0; run < RUNS; run += 1) {
    const context = await newContext();
    try {
      const { page, sample } = await load(context, `${BASE}/decks`, READY.decks, {
        settle: 500,
        extra: async (p) => {
          await p.waitForFunction(fn(cardsIn(1)), null, { timeout: 60_000, polling: 20 });
          const first = await p.evaluate(() => performance.now());
          await p.waitForFunction(fn(cardsIn(12)), null, { timeout: 60_000, polling: 20 });
          const twelve = await p.evaluate(() => performance.now());
          const preloads = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/_serverFn/')).length);
          return { firstCard: first, twelveCards: twelve, serverFnAfter: preloads };
        },
      });
      out('deckscards', { run, ...sample });
      log('deckscards', run, 'fcp', Math.round(sample.facts.fcp ?? -1), 'hydrated', Math.round(sample.readyPoll), 'cards', JSON.stringify(sample.extra), 'final', Math.round(sample.facts.finalHeaders ?? -1));
      await page.close();
    } catch (e) {
      out('deckscards', { run, error: String(e).split('\n')[0] });
      log('deckscards error', String(e).split('\n')[0]);
    }
    await context.close();
  }
}

async function presentDoc() {
  const { b } = ids();
  // the presenter route as a document, cold
  for (let run = 0; run < RUNS; run += 1) {
    const context = await newContext();
    try {
      const { page, sample } = await load(context, `${BASE}/present/${encodeURIComponent(b)}`, READY.present, { settle: 1500 });
      out('present', { deck: 'b', how: '/present document', run, ...sample });
      log('present doc', run, 'ttfb', Math.round(sample.facts.ttfb), 'lcp', Math.round(sample.facts.lcp ?? -1), 'ready', Math.round(sample.readyPoll), 'ok', sample.readyOk, 'js', sample.facts.jsDecoded);
      await page.close();
    } catch (e) {
      out('present', { deck: 'b', how: '/present document', run, error: String(e).split('\n')[0] });
    }
    await context.close();
  }
}

async function exportPdf() {
  const { a, b } = ids();
  for (const [name, id, n] of [['a', a, RUNS], ['b', b, Math.min(2, RUNS)]]) {
    const context = await newContext();
    const page = await context.newPage();
    const reqs = track(page);
    await page.goto(`${BASE}/edit/${encodeURIComponent(id)}`, { waitUntil: 'commit' });
    await page.waitForFunction(fn(READY.edit), null, { timeout: 120_000 });
    await sleep(2000);
    for (let run = 0; run < n; run += 1) {
      const before = reqs.length;
      const dl = page.waitForEvent('download', { timeout: 900_000 }).catch(() => null);
      const t0 = Date.now();
      try {
        const theme = await page.evaluate(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
        const report = await page.evaluate((th) => window.turboslide.studio.invoke('export.run', { format: 'pdf', theme: th }).then((r) => ({ ok: true, pages: r && r.pages ? r.pages.length : null, keys: Object.keys(r || {}).slice(0, 12) }), (e) => ({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 300) })), theme);
        const invokeMs = Date.now() - t0;
        const d = await Promise.race([dl, sleep(120_000).then(() => null)]);
        const dlMs = d ? Date.now() - t0 : null;
        let bytes = null;
        if (d) {
          const p = await d.path().catch(() => null);
          if (p) bytes = readFileSync(p).length;
        }
        const calls = reqs.slice(before).filter((r) => /\/api\/|_serverFn/.test(r.url || '')).map((r) => ({ u: (r.url || '').replace(BASE, '').slice(0, 90), status: r.status, ms: r.end != null && r.end > 0 ? Math.round(r.end) : null, ttfb: r.ttfb != null ? Math.round(r.ttfb) : null, body: r.body }));
        out('export', { deck: name, run, theme, invokeMs, dlMs, bytes, report, calls });
        log('export', name, run, 'invoke', invokeMs, 'download', dlMs, 'bytes', bytes, JSON.stringify(report).slice(0, 160));
      } catch (e) {
        out('export', { deck: name, run, error: String(e).split('\n')[0] });
        log('export error', String(e).split('\n')[0]);
      }
      await sleep(2000);
    }
    await context.close();
  }
}

async function gslides() {
  const ID = '1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc';
  const ready = `() => { const f = document.querySelectorAll('.punch-filmstrip-thumbnail'); const c = document.querySelector('#workspace, .punch-viewer-content, .sketchy-page-content-container'); return document.readyState !== 'loading' && f.length > 0 && Boolean(c); }`;
  for (let run = 0; run < RUNS; run += 1) {
    const context = await newContext({ storage: false });
    try {
      const { page, sample } = await load(context, `https://docs.google.com/presentation/d/${ID}/edit`, ready, { settle: 3000 });
      const dom = await page.evaluate(() => ({ title: document.title, thumbs: document.querySelectorAll('.punch-filmstrip-thumbnail').length, signin: Boolean(document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]')) }));
      out('gslides', { run, ...sample, dom });
      log('gslides', run, 'ttfb', Math.round(sample.facts.ttfb), 'fcp', Math.round(sample.facts.fcp ?? -1), 'lcp', Math.round(sample.facts.lcp ?? -1), 'ready', sample.readyOk ? Math.round(sample.readyPoll) : 'timeout', 'js', sample.facts.jsTransfer, sample.facts.jsDecoded, 'reqs', sample.requests, JSON.stringify(dom));
      // warm: the second load in the same context
      const second = await load(context, `https://docs.google.com/presentation/d/${ID}/edit`, ready, { settle: 2000 });
      out('gslides', { run, kind: 'warm', ...second.sample });
      log('gslides warm', run, 'ttfb', Math.round(second.sample.facts.ttfb), 'lcp', Math.round(second.sample.facts.lcp ?? -1), 'ready', second.sample.readyOk ? Math.round(second.sample.readyPoll) : 'timeout');
      await page.close();
      await second.page.close();
    } catch (e) {
      out('gslides', { run, error: String(e).split('\n')[0] });
      log('gslides error', String(e).split('\n')[0]);
    }
    await context.close();
  }
  // present: the presentation's own present address, cold
  for (let run = 0; run < RUNS; run += 1) {
    const context = await newContext({ storage: false });
    try {
      const { page, sample } = await load(context, `https://docs.google.com/presentation/d/${ID}/present`, `() => Boolean(document.querySelector('.punch-viewer-content, .punch-present-iframe, svg'))`, { settle: 2000 });
      out('gslides-present', { run, ...sample });
      log('gslides present', run, 'ttfb', Math.round(sample.facts.ttfb), 'fcp', Math.round(sample.facts.fcp ?? -1), 'lcp', Math.round(sample.facts.lcp ?? -1), 'ready', sample.readyOk ? Math.round(sample.readyPoll) : 'timeout', 'url', page.url().slice(0, 100));
      await page.close();
    } catch (e) {
      out('gslides-present', { run, error: String(e).split('\n')[0] });
    }
    await context.close();
  }
}

log('phase', phase, 'runs', RUNS, uptime());
try {
  if (phase === 'setup') await setup();
  else if (phase === 'routes') await routes();
  else if (phase === 'transitions') await transitions();
  else if (phase === 'filmstrip') await filmstrip();
  else if (phase === 'present') await present();
  else if (phase === 'presentdoc') await presentDoc();
  else if (phase === 'deckscards') await decksCards();
  else if (phase === 'export') await exportPdf();
  else if (phase === 'gslides') await gslides();
  else throw new Error(`unknown phase ${phase}`);
} catch (e) {
  log('phase failed', String(e.stack || e).slice(0, 600));
}
await browser.close();
log('done', phase, uptime());

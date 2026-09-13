#!/usr/bin/env node
// The performance budget check of round four (docs/gslides-parity/design-4/performance-plan.md:
// the budgets are its section 8, the check's design its section 9). Proposed home:
// scripts/perf-budget.mjs; this copy under design-4 is the design, with its runs recorded in the
// plan. It drives one Chrome for Testing page at a time through playwright-core from the
// repository's node_modules, measures the routes, the transitions, the filmstrip, the idle network
// and the twin cache of a running studio, compares every number with the budget of the chosen
// profile and exits 1 when one is over (or, for a floor, under). Read only unless --write.
//
//   node scripts/perf-budget.mjs --base http://localhost:4321 --profile local --write
//   node scripts/perf-budget.mjs --base https://<preview>.vercel.app --profile deployment
//   node scripts/perf-budget.mjs --base <origin> --only routes,transitions --runs 1 --report
//
// Options: --base <origin> (required); --profile local|deployment (the budget table; local is the
// production build of apps/studio served on this machine with TURBOSLIDE_STORE=tmp, deployment is
// a Vercel preview or production reached from the check machine); --deck <id> (gt-brand);
// --runs <n> (3; cold and warm samples per route, medians compared); --only <checks> (routes,
// transitions, filmstrip, idle, twins, write); --idle-seconds <n> (60); --write (the write path
// on /new: a scratch deck is created and left in place, so pass it only against a tmp store or a
// preview you own; the deck id is printed); --json <file> (the raw numbers); --report (print the
// table and exit 0 whatever the result, for a baseline run); --chrome <path> (else
// TURBOSLIDE_CHROME, else the chromium-1217 build AGENTS.md names, else playwright-core's default).
//
// A preview deployment sits behind Vercel Authentication: with VERCEL_OIDC_TOKEN in the environment
// (vercel env pull) every request carries it as the Trusted Sources header, the way
// scripts/hosted-smoke.mjs does; the token is never printed. The browser takes the GPU flags
// AGENTS.md "Chromium" names per platform (ANGLE on Metal on macOS, SwiftShader on Linux).
//
// Definitions (the baseline's, research-4/04 section 1.2): TTFB is responseStart of the document
// request from Playwright's request timing; FCP and LCP are the paint and LCP entries; "ready" is
// the first moment the route's landmark holds, stamped in the page by a MutationObserver plus a 4 ms
// poll; a transition is pointerdown to the landmark in page for a same-document navigation and wall
// clock for a document navigation; filmstrip frames are requestAnimationFrame timestamps while the
// wheel fires 18 times at 80 ms gaps over .ts-film; idle calls are /_serverFn/ responses and
// /api/events/ requests per minute on an open editor; twins are the deck's asset pictures
// re-fetched on a second visit of /deck; the write path's stamps (last keyup, local commit, the
// current card's clone carrying the text, the saved revision) are taken in the page at 4 ms.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/perf-budget.mjs sits one level under the root; this design copy sits three levels down
const ROOT = [resolve(HERE, '..'), resolve(HERE, '../../..')].find((dir) =>
  existsSync(resolve(dir, 'pnpm-workspace.yaml')),
);
if (!ROOT) throw new Error('perf-budget: cannot find the repository root');
const require = createRequire(resolve(ROOT, 'package.json'));
const { chromium } = require('playwright-core');

const CHROME_1217 =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/** AGENTS.md "Chromium": the GPU flags per platform, so shader materials render as they do for a person. */
const CHROME_FLAGS =
  process.platform === 'darwin'
    ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** The Trusted Sources header for a protected preview (scripts/hosted-smoke.mjs); empty otherwise. */
const TRUSTED_HEADERS = process.env.VERCEL_OIDC_TOKEN
  ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
  : {};

// ---------------------------------------------------------------------------------------------
// Budgets: the ceilings a run must stay under, per profile (performance-plan.md section 8). A
// missing key means the metric is reported and not asserted. Units are milliseconds unless the
// key says bytes, count, fps or ratio. `steadyFpsMin` is a floor, every other key a ceiling.

const BUDGETS = {
  local: {
    routes: {
      '/home': {
        cold: { ttfb: 60, lcp: 400, ready: 400, jsDecoded: 600_000 },
        warm: { ttfb: 40, lcp: 200, ready: 200, jsDecoded: 600_000 },
      },
      '/': {
        cold: { ttfb: 60, lcp: 450, ready: 450, jsDecoded: 2_000_000 },
        warm: { ttfb: 40, lcp: 250, ready: 250, jsDecoded: 2_000_000 },
      },
      '/new': {
        cold: { ttfb: 60, fcp: 250, lcp: 450, ready: 450, jsDecoded: 2_000_000 },
        warm: { ttfb: 40, fcp: 150, lcp: 250, ready: 250, jsDecoded: 2_000_000 },
      },
      '/decks': {
        cold: { ttfb: 150, lcp: 500, ready: 500, jsDecoded: 600_000 },
        warm: { ttfb: 100, lcp: 300, ready: 300, jsDecoded: 600_000 },
      },
      '/decks/trash': {
        cold: { ttfb: 150, lcp: 500, ready: 500, jsDecoded: 600_000 },
        warm: { ttfb: 100, lcp: 300, ready: 300, jsDecoded: 600_000 },
      },
      '/deck': {
        cold: { ttfb: 250, lcp: 500, ready: 600, jsDecoded: 1_000_000, nodes: 1500 },
        warm: { ttfb: 150, lcp: 300, ready: 400, jsDecoded: 1_000_000, nodes: 1500 },
      },
      '/edit': {
        cold: { ttfb: 60, fcp: 250, lcp: 700, ready: 700, jsDecoded: 2_000_000, nodes: 1500 },
        warm: { ttfb: 40, fcp: 150, lcp: 450, ready: 450, jsDecoded: 2_000_000, nodes: 1500 },
      },
      '/present': {
        cold: { ttfb: 60, lcp: 500, ready: 500, jsDecoded: 1_200_000 },
        warm: { ttfb: 40, lcp: 300, ready: 300, jsDecoded: 1_200_000 },
      },
      '*': {
        cold: { largestJs: 600_000, loafMax: 150, cls: 0.05 },
        warm: { largestJs: 600_000, loafMax: 150, cls: 0.05 },
      },
    },
    transitions: {
      'decks->edit': 300,
      'edit->decks': 300,
      'trash->decks': 300,
      'home->new': 300,
      back: 100,
      slideChange: 50,
      slideshow: 50,
      layoutGrid: 50,
    },
    filmstrip: { steadyP95: 20, steadyMax: 50, firstPassMax: 100, nodes: 1500, steadyFpsMin: 50 },
    idle: { serverFnPerMinute: 4, eventsPerMinute: 2 },
    twins: { refetched: 0 },
    write: {
      textKeyToCommit: 450,
      textKeyToSaved: 600,
      cloneAfterCommit: 50,
      newSlidePaint: 16,
      newSlideSaved: 250,
      captureAfterSaved: 2_000,
      homeCard: 1_500,
    },
  },
  deployment: {
    routes: {
      '/home': {
        cold: { ttfb: 150, lcp: 800, ready: 800, jsDecoded: 600_000 },
        warm: { ttfb: 100, lcp: 400, ready: 400, jsDecoded: 600_000 },
      },
      '/': {
        cold: { ttfb: 200, lcp: 700, ready: 700, jsDecoded: 2_000_000 },
        warm: { ttfb: 150, lcp: 400, ready: 400, jsDecoded: 2_000_000 },
      },
      '/new': {
        cold: { ttfb: 200, fcp: 400, lcp: 700, ready: 700, jsDecoded: 2_000_000 },
        warm: { ttfb: 150, fcp: 250, lcp: 400, ready: 400, jsDecoded: 2_000_000 },
      },
      '/decks': {
        cold: { ttfb: 400, lcp: 1_000, ready: 1_000, jsDecoded: 600_000 },
        warm: { ttfb: 300, lcp: 600, ready: 600, jsDecoded: 600_000 },
      },
      '/decks/trash': {
        cold: { ttfb: 400, lcp: 1_000, ready: 1_000, jsDecoded: 600_000 },
        warm: { ttfb: 300, lcp: 600, ready: 600, jsDecoded: 600_000 },
      },
      '/deck': {
        cold: { ttfb: 500, lcp: 600, ready: 800, jsDecoded: 1_000_000, nodes: 1500 },
        warm: { ttfb: 400, lcp: 400, ready: 600, jsDecoded: 1_000_000, nodes: 1500 },
      },
      '/edit': {
        cold: { ttfb: 200, fcp: 400, lcp: 1_200, ready: 1_200, jsDecoded: 2_000_000, nodes: 1500 },
        warm: { ttfb: 150, fcp: 250, lcp: 700, ready: 700, jsDecoded: 2_000_000, nodes: 1500 },
      },
      '/present': {
        cold: { ttfb: 200, lcp: 800, ready: 800, jsDecoded: 1_200_000 },
        warm: { ttfb: 150, lcp: 500, ready: 500, jsDecoded: 1_200_000 },
      },
      '*': {
        cold: { largestJs: 600_000, loafMax: 150, cls: 0.05 },
        warm: { largestJs: 600_000, loafMax: 150, cls: 0.05 },
      },
    },
    transitions: {
      'decks->edit': 500,
      'edit->decks': 400,
      'trash->decks': 400,
      'home->new': 300,
      back: 100,
      slideChange: 50,
      slideshow: 50,
      layoutGrid: 50,
    },
    filmstrip: { steadyP95: 20, steadyMax: 50, firstPassMax: 100, nodes: 1500, steadyFpsMin: 50 },
    idle: { serverFnPerMinute: 4, eventsPerMinute: 2 },
    twins: { refetched: 0 },
    // the capture after a save is reported, not asserted, on a deployment: a cold instance renders in seconds
    write: {
      textKeyToCommit: 450,
      textKeyToSaved: 1_000,
      cloneAfterCommit: 50,
      newSlidePaint: 16,
      newSlideSaved: 500,
      captureAfterSaved: null,
      homeCard: 2_500,
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const out = {
    base: null,
    profile: 'deployment',
    deck: 'gt-brand',
    runs: 3,
    only: null,
    idleSeconds: 60,
    write: false,
    json: null,
    report: false,
    chrome: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--base') out.base = next();
    else if (arg === '--profile') out.profile = next();
    else if (arg === '--deck') out.deck = next();
    else if (arg === '--runs') out.runs = Number(next());
    else if (arg === '--only') out.only = new Set(next().split(','));
    else if (arg === '--idle-seconds') out.idleSeconds = Number(next());
    else if (arg === '--write') out.write = true;
    else if (arg === '--json') out.json = next();
    else if (arg === '--report') out.report = true;
    else if (arg === '--chrome') out.chrome = next();
    else throw new Error(`perf-budget: unknown argument ${arg}`);
  }
  if (!out.base) throw new Error('perf-budget: --base <origin> is required');
  if (!(out.profile in BUDGETS))
    throw new Error(`perf-budget: --profile must be one of ${Object.keys(BUDGETS).join(', ')}`);
  out.base = out.base.replace(/\/$/, '');
  return out;
}

const args = parseArgs(process.argv.slice(2));
const budget = BUDGETS[args.profile];
const wants = (check) => args.only === null || args.only.has(check);

function chromePath() {
  const candidates = [args.chrome, process.env.TURBOSLIDE_CHROME, CHROME_1217].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return chromium.executablePath();
}

// ---------------------------------------------------------------------------------------------
// The page-side recorder: LCP, CLS, long animation frames, the first appearance of every
// landmark, the studio handle, a pointerdown stamp and an armed predicate for transitions.

const INIT = `(() => {
  const ts = { lcp: null, cls: 0, loaf: [], firstDom: {}, studioAt: null, settledAt: null, hydratedAt: null, down: null, armed: null };
  window.__ts = ts;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = e.element;
        ts.lcp = { t: e.startTime, size: e.size, el: el ? el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') : null, url: e.url || null };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) ts.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) ts.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(e.blockingDuration), s: (e.scripts || []).slice(0, 2).map((s) => (s.sourceURL || '').split('/').pop() + ':' + Math.round(s.duration)) });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  const want = ['.ts-title-row', '.ts-home-page', '.ts-trash-page', '.pt-viewer', '.ts-presenter', '.ts-filmstrip .ts-card', '.ts-hm-card', '.ts-home', 'main'];
  const check = () => {
    const now = performance.now();
    for (const s of want) if (!(s in ts.firstDom) && document.querySelector(s)) ts.firstDom[s] = now;
    try { if (ts.studioAt === null && window.turboslide && window.turboslide.studio) ts.studioAt = now; } catch {}
    if (ts.settledAt === null && document.querySelector('.pt-viewer[data-settled]')) ts.settledAt = now;
    if (ts.hydratedAt === null && document.querySelector('[data-hydrated]')) ts.hydratedAt = now;
    const a = ts.armed;
    if (a && a.appear === null) {
      let ok = false;
      try { ok = Boolean(a.pred()); } catch {}
      if (ok) { a.appear = now; requestAnimationFrame(() => { a.frame = performance.now(); }); }
    }
  };
  const mo = new MutationObserver(check);
  const start = () => { try { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-settled', 'data-hydrated', 'data-slide-id', 'class'] }); } catch {} };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  setInterval(check, 4);
  window.addEventListener('pointerdown', () => { ts.down = performance.now(); }, { capture: true });
  window.__tsArm = (src) => { ts.armed = { pred: new Function('return (' + src + ')()'), appear: null, frame: null, down: null }; ts.down = null; };
  window.__tsArmed = () => ts.armed && ts.armed.appear !== null ? { down: ts.down, appear: ts.armed.appear, frame: ts.armed.frame } : null;
  // the write probe (the write check): from a revision, stamp the local commit, the current card's
  // clone carrying the typed text, and the saved revision, at 4 ms, in the page
  window.__tsWrite = null;
  window.__tsWriteProbe = (from, text) => {
    const w = { from, text, lastKey: null, commitAt: null, cloneAt: null, savedAt: null, timer: 0 };
    window.__tsWrite = w;
    const tick = () => {
      const now = performance.now();
      let s;
      try { s = window.turboslide.studio.describe().state; } catch { return; }
      if (w.commitAt === null && s.revision > from) w.commitAt = now;
      if (w.commitAt !== null && w.cloneAt === null && text) {
        const card = document.querySelector('.ts-filmstrip .ts-card.is-current .pt-slide');
        if (card && (card.textContent || '').includes(text)) w.cloneAt = now;
      }
      if (w.savedAt === null && s.revision > from && s.serverRevision >= s.revision && s.pending === 0) w.savedAt = now;
      if (w.savedAt !== null && (w.cloneAt !== null || !text)) clearInterval(w.timer);
    };
    w.timer = setInterval(tick, 4);
    return true;
  };
  document.addEventListener('keyup', () => { if (window.__tsWrite) window.__tsWrite.lastKey = performance.now(); }, true);
})();`;

/** The landmark predicate of a route, as source for the page. */
function landmark(route) {
  if (route === '/' || route === '/new' || route.startsWith('/edit')) {
    return `() => { try { return Boolean(window.turboslide?.studio) && document.querySelector('.pt-viewer[data-settled]'); } catch { return false; } }`;
  }
  if (route.startsWith('/present'))
    return `() => { try { return Boolean(window.turboslide?.studio) && document.querySelector('.ts-presenter'); } catch { return false; } }`;
  if (route.startsWith('/deck/'))
    return `() => Boolean(document.querySelector('.pt-viewer[data-settled]'))`;
  if (route === '/decks')
    return `() => Boolean(document.querySelector('.ts-home-page[data-hydrated]'))`;
  if (route === '/decks/trash')
    return `() => Boolean(document.querySelector('.ts-trash-page[data-hydrated]'))`;
  if (route === '/home')
    return `() => document.readyState === 'complete' && Boolean(document.querySelector('.ts-home-page, main'))`;
  return `() => document.readyState === 'complete'`;
}

/** The landmark predicate of a destination, for a same-document transition: the address must have moved there too. */
function landmarkAt(route) {
  const at =
    route.startsWith('/edit/') || route.startsWith('/deck/') || route.startsWith('/present/')
      ? `location.pathname.startsWith(${JSON.stringify(route)})`
      : `location.pathname === ${JSON.stringify(route)}`;
  return `() => ${at} && (${landmark(route)})()`;
}

/** The budget key of a route: the family for the parametrized routes. */
function family(route) {
  if (route.startsWith('/edit/')) return '/edit';
  if (route.startsWith('/deck/')) return '/deck';
  if (route.startsWith('/present/')) return '/present';
  return route;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function median(xs) {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return null;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// ---------------------------------------------------------------------------------------------
// Results and assertions

const results = {
  startedAt: new Date().toISOString(),
  base: args.base,
  profile: args.profile,
  deck: args.deck,
  platform: process.platform,
  chromeFlags: CHROME_FLAGS,
  trustedHeader: Object.keys(TRUSTED_HEADERS).length > 0,
  routes: [],
  transitions: [],
  filmstrip: null,
  idle: null,
  twins: null,
  write: null,
};
const rows = [];
let failures = 0;

function shown(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (unit === 'bytes') return `${(value / 1024).toFixed(0)} KB`;
  if (unit === 'count' || unit === 'fps') return String(Math.round(value));
  if (unit === 'ratio') return value.toFixed(4);
  return `${Math.round(value)} ms`;
}

/**
 * Records one metric against its limit; a null limit reports without asserting. A ceiling fails
 * above the limit, a floor (`options.floor`, the fps row) fails below it or when the value is
 * missing.
 */
function assert(check, name, value, limit, unit = 'ms', options = {}) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const asserted = typeof limit === 'number';
  const floor = options.floor === true;
  const ok = !asserted || (has && (floor ? value >= limit : value <= limit));
  if (asserted && !ok) failures += 1;
  rows.push({
    check,
    name,
    value: has ? value : null,
    limit: asserted ? limit : null,
    kind: floor ? 'floor' : 'ceiling',
    ok,
    unit,
  });
  const cap = asserted ? `  ${floor ? 'floor' : 'budget'} ${shown(limit, unit)}` : '';
  console.log(
    `${asserted ? (ok ? 'ok  ' : 'FAIL') : 'info'} ${check.padEnd(11)} ${name.padEnd(60)} ${shown(value, unit).padStart(10)}${cap}`,
  );
}

// ---------------------------------------------------------------------------------------------
// The browser

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: CHROME_FLAGS,
});

async function newContext() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(Object.keys(TRUSTED_HEADERS).length > 0 ? { extraHTTPHeaders: TRUSTED_HEADERS } : {}),
  });
  await context.addInitScript(INIT);
  return context;
}

function trackResponses(page) {
  const list = [];
  page.on('response', (response) => {
    try {
      const request = response.request();
      list.push({
        url: request.url(),
        method: request.method(),
        status: response.status(),
        type: request.resourceType(),
        at: Date.now(),
        headers: response.headers(),
      });
    } catch {
      // the page navigated away
    }
  });
  return list;
}

async function waitLandmark(page, route, timeout = 120_000) {
  await page.waitForFunction(new Function(`return (${landmark(route)})()`), null, { timeout });
}

async function readyAt(page, route) {
  return page.evaluate((r) => {
    const ts = window.__ts;
    if (!ts) return null;
    if (r === '/' || r === '/new' || r.startsWith('/edit'))
      return ts.studioAt !== null && ts.settledAt !== null
        ? Math.max(ts.studioAt, ts.settledAt)
        : null;
    if (r.startsWith('/present'))
      return ts.studioAt !== null && ts.firstDom['.ts-presenter'] !== undefined
        ? Math.max(ts.studioAt, ts.firstDom['.ts-presenter'])
        : null;
    if (r.startsWith('/deck/')) return ts.settledAt;
    if (r === '/decks' || r === '/decks/trash') return ts.hydratedAt;
    return ts.firstDom['main'] ?? ts.firstDom['.ts-home-page'] ?? null;
  }, route);
}

async function pageMetrics(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const pick = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return { nodes: pick.Nodes, heapUsed: pick.JSHeapUsedSize, layoutCount: pick.LayoutCount };
}

async function resources(page) {
  return page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    const paint = Object.fromEntries(
      performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]),
    );
    const largest = js.reduce(
      (best, r) => (r.decodedBodySize > (best?.decodedBodySize ?? -1) ? r : best),
      null,
    );
    const ts = window.__ts ?? {};
    return {
      fcp: paint['first-contentful-paint'] ?? null,
      lcp: ts.lcp ? ts.lcp.t : null,
      lcpEl: ts.lcp ? ts.lcp.el : null,
      cls: ts.cls ?? null,
      loafMax: ts.loaf && ts.loaf.length ? Math.max(...ts.loaf.map((l) => l.d)) : 0,
      loaf: ts.loaf ?? [],
      jsCount: js.length,
      jsDecoded: js.reduce((a, r) => a + (r.decodedBodySize || 0), 0),
      jsTransfer: js.reduce((a, r) => a + (r.transferSize || 0), 0),
      largestJs: largest ? largest.decodedBodySize : null,
      largestJsName: largest ? largest.name.split('/').pop() : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Check 1: route loads, cold then warm, N runs, medians against the budget

async function routeLoads() {
  const routes = [
    '/',
    '/home',
    '/new',
    '/decks',
    '/decks/trash',
    `/deck/${args.deck}`,
    `/edit/${args.deck}`,
    `/present/${args.deck}`,
  ];
  for (const route of routes) {
    const samples = { cold: [], warm: [] };
    let absent = false;
    for (let run = 0; run < args.runs && !absent; run += 1) {
      const context = await newContext();
      for (const kind of ['cold', 'warm']) {
        const page = await context.newPage();
        const t0 = Date.now();
        const response = await page.goto(`${args.base}${route}`, {
          waitUntil: 'commit',
          timeout: 120_000,
        });
        const status = response ? response.status() : null;
        if (status === 404 && route === '/home') {
          absent = true;
          await page.close();
          break;
        }
        const timing = response ? response.request().timing() : null;
        let error = null;
        try {
          await waitLandmark(page, route);
        } catch (e) {
          error = String(e).split('\n')[0];
        }
        const wall = Date.now() - t0;
        await sleep(1200);
        const res = await resources(page);
        const ready = await readyAt(page, route);
        const metrics = await pageMetrics(page);
        samples[kind].push({
          ttfb: timing ? timing.responseStart : null,
          ready: ready ?? (error ? null : wall),
          wall,
          error,
          status,
          ...res,
          ...metrics,
          finalUrl: page.url(),
        });
        await page.close();
      }
      await context.close();
    }
    if (absent) {
      results.routes.push({ route, absent: true });
      console.log(
        `info routes      ${route.padEnd(60)}     absent (404): the page is not built yet`,
      );
      continue;
    }
    const fam = family(route);
    for (const kind of ['cold', 'warm']) {
      const list = samples[kind];
      const med = (key) => median(list.map((s) => s[key]));
      const row = {
        route,
        kind,
        n: list.length,
        ttfb: med('ttfb'),
        fcp: med('fcp'),
        lcp: med('lcp'),
        ready: med('ready'),
        jsDecoded: med('jsDecoded'),
        jsTransfer: med('jsTransfer'),
        jsCount: med('jsCount'),
        largestJs: med('largestJs'),
        largestJsName: list[0]?.largestJsName ?? null,
        loafMax: med('loafMax'),
        cls: med('cls'),
        nodes: med('nodes'),
        errors: list.map((s) => s.error).filter(Boolean),
        lcpEl: list[0]?.lcpEl ?? null,
      };
      results.routes.push({ ...row, samples: list });
      const b = { ...(budget.routes['*']?.[kind] ?? {}), ...(budget.routes[fam]?.[kind] ?? {}) };
      const label = (m) => `${route} ${kind} ${m}`;
      assert('routes', label('ttfb'), row.ttfb, b.ttfb);
      assert('routes', label('fcp'), row.fcp, b.fcp);
      assert('routes', label('lcp'), row.lcp, b.lcp);
      assert('routes', label('ready'), row.ready, b.ready);
      assert('routes', label('js decoded'), row.jsDecoded, b.jsDecoded, 'bytes');
      assert(
        'routes',
        label(`largest js (${row.largestJsName ?? '?'})`),
        row.largestJs,
        b.largestJs,
        'bytes',
      );
      assert('routes', label('longest animation frame'), row.loafMax, b.loafMax);
      assert('routes', label('cls'), row.cls, b.cls, 'ratio');
      assert('routes', label('dom nodes'), row.nodes, b.nodes, 'count');
      for (const e of row.errors) console.log(`     routes      ${route} ${kind}: ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Check 2: transitions in one warm context

async function armAndClick(page, locator, predSource) {
  await page.evaluate((src) => window.__tsArm(src), predSource);
  await locator.click();
  await page.waitForFunction(() => window.__tsArmed() !== null, null, { timeout: 60_000 });
  const marks = await page.evaluate(() => window.__tsArmed());
  const down = await page.evaluate(() => window.__ts.down);
  return {
    down,
    appear: marks.appear,
    frame: marks.frame,
    ms: down === null ? null : marks.appear - down,
    paintMs: down === null ? null : marks.frame - down,
  };
}

/** A click on a link that may or may not keep the document: in page when it does, wall clock when it does not. */
async function clickToRoute(page, locator, route) {
  await page.evaluate(() => {
    window.__tsDoc = true;
  });
  const t0 = Date.now();
  await page.evaluate((src) => window.__tsArm(src), landmarkAt(route));
  await locator.click();
  await waitLandmark(page, route);
  const same = await page.evaluate(() => Boolean(window.__tsDoc)).catch(() => false);
  const marks = same ? await page.evaluate(() => window.__tsArmed()) : null;
  const down = same ? await page.evaluate(() => window.__ts.down) : null;
  if (marks && down !== null) return { ms: marks.appear - down, how: 'in page' };
  return { ms: Date.now() - t0, how: same ? 'wall' : 'wall, document navigation' };
}

async function transitions() {
  const context = await newContext();
  const page = await context.newPage();
  const record = (name, ms, how, extra = {}) => {
    results.transitions.push({ name, ms, how, ...extra });
    assert('transitions', `${name} (${how})`, ms, budget.transitions[name]);
  };
  const deck = args.deck;
  // /decks primed (the JS cache warm), then the card to the editor: intent preload on hover first
  await page.goto(`${args.base}/decks`, { waitUntil: 'commit' });
  await waitLandmark(page, '/decks');
  await sleep(800);
  const card = page.locator(`[data-control="home.open.${deck}"]`).first();
  if ((await card.count()) === 0) {
    console.log(
      `info transitions  no card for ${deck} on /decks: the decks->edit and back transitions are skipped`,
    );
  } else {
    await card.hover();
    await sleep(150);
    const t = await armAndClick(page, card, landmarkAt(`/edit/${deck}`));
    record('decks->edit', t.ms, 'in page');
    await sleep(1500);
    // history back to the list: the loader data is reused
    const t0 = Date.now();
    await page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
    await waitLandmark(page, '/decks');
    record('back', Date.now() - t0, 'wall');
    await sleep(500);
    // the editor again, then the title row mark back to the list
    await card.hover();
    await sleep(150);
    await armAndClick(page, card, landmarkAt(`/edit/${deck}`));
    await sleep(1500);
    const home = page.locator('[data-control="title.home"]').first();
    if ((await home.count()) > 0) {
      const back = await clickToRoute(page, home, '/decks');
      record('edit->decks', back.ms, back.how);
      await sleep(500);
    }
  }
  // the trash to the list
  await page.goto(`${args.base}/decks/trash`, { waitUntil: 'commit' });
  await waitLandmark(page, '/decks/trash');
  await sleep(500);
  const toDecks = page.locator('a[href="/decks"]').first();
  if ((await toDecks.count()) > 0) {
    const t = await clickToRoute(page, toDecks, '/decks');
    record('trash->decks', t.ms, t.how);
  }
  // the home page to a new presentation, once the page exists
  const homeResponse = await page.goto(`${args.base}/home`, { waitUntil: 'commit' });
  if (homeResponse && homeResponse.status() === 200) {
    await waitLandmark(page, '/home');
    await sleep(500);
    const toNew = page.locator('a[href="/new"]').first();
    if ((await toNew.count()) > 0) {
      await toNew.hover();
      await sleep(150);
      const t = await clickToRoute(page, toNew, '/new');
      record('home->new', t.ms, t.how);
    }
  } else {
    console.log('info transitions  /home is absent: the home->new transition is skipped');
  }
  // in-page surfaces on the editor: a slide change from the filmstrip, the Slideshow, the Layout grid
  await page.goto(`${args.base}/edit/${deck}`, { waitUntil: 'commit' });
  await waitLandmark(page, `/edit/${deck}`);
  await sleep(1500);
  const third = page.locator('.ts-filmstrip .ts-card:not(.is-empty)').nth(2);
  if ((await third.count()) > 0) {
    const id = await third.getAttribute('data-id');
    if (id) {
      const t = await armAndClick(
        page,
        third,
        `() => { const cur = document.querySelector('.ts-filmstrip .ts-card.is-current'); return cur && cur.getAttribute('data-id') === ${JSON.stringify(id)} && document.querySelector('.ts-stagewrap [data-slide-id=${JSON.stringify(id)}], .pt-viewer [data-slide-id=${JSON.stringify(id)}]') !== null; }`,
      );
      record('slideChange', t.paintMs ?? t.ms, 'in page, painted frame', { slideId: id });
      await sleep(500);
    }
  }
  const present = page.locator('[data-control="present.open"]').first();
  if ((await present.count()) > 0) {
    const t = await armAndClick(
      page,
      present,
      `() => document.querySelector('.ts-slideshow') && document.querySelector('.pt-viewer.is-present')`,
    );
    record('slideshow', t.paintMs ?? t.ms, 'in page, painted frame');
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  const layout = page.locator('[data-control="toolbar.layout"]').first();
  if ((await layout.count()) > 0) {
    const t = await armAndClick(
      page,
      layout,
      `() => { const el = document.querySelector('[data-control="layout.apply.plate"]'); return el && el.getClientRects().length > 0; }`,
    );
    record('layoutGrid', t.paintMs ?? t.ms, 'in page, painted frame');
    await page.keyboard.press('Escape');
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 3: the filmstrip scroll, three passes on the editor

async function filmstrip() {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${args.base}/edit/${args.deck}`, { waitUntil: 'commit' });
  await waitLandmark(page, `/edit/${args.deck}`);
  await sleep(2000);
  const film = page.locator('.ts-film').first();
  const box = await film.boundingBox();
  if (!box) {
    console.log('info filmstrip   no .ts-film on the editor: skipped');
    await context.close();
    return;
  }
  const passes = [];
  for (const [i, dir] of [1, -1, 1].entries()) {
    await page.evaluate(() => {
      window.__frames = [];
      const tick = (t) => {
        window.__frames.push(t);
        if (window.__recording) requestAnimationFrame(tick);
      };
      window.__recording = true;
      requestAnimationFrame(tick);
    });
    for (let k = 0; k < 18; k += 1) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 320 * dir);
      await sleep(80);
    }
    await sleep(200);
    const frames = await page.evaluate(() => {
      window.__recording = false;
      return window.__frames;
    });
    const deltas = frames.slice(1).map((t, j) => t - frames[j]);
    const span = frames.length > 1 ? frames[frames.length - 1] - frames[0] : 0;
    const pass = {
      pass: i + 1,
      direction: dir > 0 ? 'down' : 'up',
      frames: frames.length,
      fps: span > 0 ? (frames.length - 1) / (span / 1000) : null,
      median: median(deltas),
      p95: percentile(deltas, 95),
      max: deltas.length ? Math.max(...deltas) : null,
      over33: deltas.filter((d) => d > 33.4).length,
      over50: deltas.filter((d) => d > 50).length,
    };
    passes.push(pass);
    await sleep(700);
  }
  const nodes = (await pageMetrics(page)).nodes;
  const cards = await page.locator('.ts-filmstrip .ts-card').count();
  results.filmstrip = { passes, nodes, cards };
  assert('filmstrip', 'first pass longest frame', passes[0]?.max, budget.filmstrip.firstPassMax);
  assert(
    'filmstrip',
    'steady passes p95 frame',
    Math.max(passes[1]?.p95 ?? 0, passes[2]?.p95 ?? 0),
    budget.filmstrip.steadyP95,
  );
  assert(
    'filmstrip',
    'steady passes longest frame',
    Math.max(passes[1]?.max ?? 0, passes[2]?.max ?? 0),
    budget.filmstrip.steadyMax,
  );
  assert(
    'filmstrip',
    'steady passes fps',
    Math.min(passes[1]?.fps ?? 0, passes[2]?.fps ?? 0),
    budget.filmstrip.steadyFpsMin,
    'fps',
    { floor: true },
  );
  assert('filmstrip', `dom nodes with ${cards} cards`, nodes, budget.filmstrip.nodes, 'count');
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 4: the idle editor's network per minute: server function calls and event stream connections

async function idle() {
  const context = await newContext();
  const page = await context.newPage();
  const responses = trackResponses(page);
  await page.goto(`${args.base}/edit/${args.deck}`, { waitUntil: 'commit' });
  await waitLandmark(page, `/edit/${args.deck}`);
  await sleep(5000);
  const start = responses.length;
  const t0 = Date.now();
  await sleep(args.idleSeconds * 1000);
  const window_ = responses.slice(start).filter((r) => r.at - t0 >= 0);
  const fn = window_.filter((r) => r.url.includes('/_serverFn/'));
  const events = window_.filter((r) => r.url.includes('/api/events/'));
  const perMinute = (fn.length / args.idleSeconds) * 60;
  const eventsPerMinute = (events.length / args.idleSeconds) * 60;
  results.idle = {
    seconds: args.idleSeconds,
    serverFn: fn.length,
    perMinute,
    events: events.length,
    eventsPerMinute,
    other: window_.length - fn.length - events.length,
  };
  assert(
    'idle',
    `server function calls per minute (${args.idleSeconds} s window)`,
    perMinute,
    budget.idle.serverFnPerMinute,
    'count',
  );
  assert(
    'idle',
    `event stream connections per minute (${args.idleSeconds} s window)`,
    eventsPerMinute,
    budget.idle.eventsPerMinute,
    'count',
  );
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 5: the deck's twins on a second visit of /deck

async function twins() {
  const context = await newContext();
  const page = await context.newPage();
  const route = `/deck/${args.deck}`;
  for (const visit of [1, 2]) {
    await page.goto(`${args.base}${route}`, { waitUntil: 'commit' });
    await waitLandmark(page, route);
    await sleep(2500);
    if (visit === 1) continue;
    const list = await page.evaluate(
      (deck) =>
        performance
          .getEntriesByType('resource')
          .filter((r) => r.name.includes(`/decks/${deck}/assets/`))
          .map((r) => ({
            name: r.name.split('/').pop(),
            transfer: r.transferSize,
            decoded: r.decodedBodySize,
          })),
      args.deck,
    );
    const refetched = list.filter((r) => r.transfer > 0);
    results.twins = { total: list.length, refetched: refetched.length, list };
    assert(
      'twins',
      `twins re-fetched on the second visit (of ${list.length})`,
      refetched.length,
      budget.twins.refetched,
      'count',
    );
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 6 (--write): the write path on /new; leaves a scratch deck behind

async function writePath() {
  const context = await newContext();
  const page = await context.newPage();
  const responses = trackResponses(page);
  await page.goto(`${args.base}/new`, { waitUntil: 'commit' });
  await waitLandmark(page, '/new');
  await sleep(800);
  const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
  const probed = async () => {
    await page.waitForFunction(() => window.__tsWrite && window.__tsWrite.savedAt !== null, null, {
      timeout: 120_000,
    });
    // the clone stamp may land a frame after the save on a very fast machine
    await sleep(120);
    return page.evaluate(() => {
      const w = window.__tsWrite;
      clearInterval(w.timer);
      return { lastKey: w.lastKey, commitAt: w.commitAt, cloneAt: w.cloneAt, savedAt: w.savedAt };
    });
  };
  // the first heading run: click into it, type, wait for the local commit and the saved write
  const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first();
  await run.waitFor({ timeout: 30_000 });
  const box = await run.boundingBox();
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  await page.waitForFunction(
    () => Boolean(document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]')),
    null,
    { timeout: 15_000 },
  );
  const r0 = (await state()).revision;
  const TEXT = 'Perf budget heading';
  await page.evaluate((input) => window.__tsWriteProbe(input.from, input.text), {
    from: r0,
    text: TEXT,
  });
  await page.keyboard.type(TEXT, { delay: 30 });
  const w1 = await probed();
  await page.waitForURL(/\/edit\//, { timeout: 60_000 }).catch(() => undefined);
  const deckId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '');
  const text = {
    keyToCommit: w1.lastKey === null ? null : w1.commitAt - w1.lastKey,
    keyToSaved: w1.lastKey === null ? null : w1.savedAt - w1.lastKey,
    cloneAfterCommit: w1.cloneAt === null || w1.commitAt === null ? null : w1.cloneAt - w1.commitAt,
  };
  await page.keyboard.press('Escape');
  await sleep(600);
  // New slide from the toolbar: the card's painted frame and the saved write
  const n = await page.locator('.ts-filmstrip .ts-card:not(.is-empty)').count();
  const r1 = (await state()).revision;
  await page.evaluate((from) => window.__tsWriteProbe(from, ''), r1);
  // the button itself; its split wrapper (toolbar.newSlide.split) comes first in DOM order
  let newSlide = page.locator('[data-control="toolbar.newSlide"]').first();
  if ((await newSlide.count()) === 0)
    newSlide = page.locator('[data-control^="toolbar.newSlide"]').first();
  const t = await armAndClick(
    page,
    newSlide,
    `() => document.querySelectorAll('.ts-filmstrip .ts-card:not(.is-empty)').length > ${n}`,
  );
  const w2 = await probed();
  const slide = { paint: t.paintMs, saved: t.down === null ? null : w2.savedAt - t.down };
  // the capture of the edited slide after the save: the render route's thumbnail at the saved
  // revision, timed from this process (a function render, or a CDN hit when one exists)
  const st = await state();
  const theme = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
  );
  const captureUrl = `${args.base}/api/render/${encodeURIComponent(st.slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&w=320&r=${st.revision}`;
  const c0 = Date.now();
  let capture = { ms: null, status: null, cached: null, cdn: null };
  try {
    const response = await context.request.get(captureUrl, { timeout: 120_000 });
    const headers = response.headers();
    capture = {
      ms: Date.now() - c0,
      status: response.status(),
      cached: headers['x-turboslide-cached'] ?? null,
      cdn: headers['x-vercel-cache'] ?? null,
    };
  } catch (error) {
    capture.error = String(error).split('\n')[0];
  }
  // the home card of the scratch deck on the next /decks visit: the card's thumbnail response time
  await page.goto(`${args.base}/decks`, { waitUntil: 'commit' });
  await waitLandmark(page, '/decks');
  let homeCard = null;
  const cardImg = page.locator(`[data-control="home.open.${deckId}"] img`).first();
  if ((await cardImg.count()) > 0) {
    await page
      .waitForFunction(
        (id) => {
          const img = document.querySelector(`[data-control="home.open.${id}"] img`);
          return Boolean(img && img.complete && img.naturalWidth > 0);
        },
        deckId,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
    homeCard = await page.evaluate((id) => {
      const entry = performance
        .getEntriesByType('resource')
        .find((r) => r.name.includes('/api/render/') && r.name.includes(`deck=${id}`));
      return entry ? entry.responseEnd - entry.startTime : null;
    }, deckId);
  }
  const renders = responses
    .filter((r) => r.url.includes('/api/render/'))
    .map((r) => ({ status: r.status, cache: r.headers['x-vercel-cache'] ?? null }));
  results.write = { deckId, text, slide, capture, homeCard, renders };
  assert(
    'write',
    'text burst: last keyup to local commit',
    text.keyToCommit,
    budget.write.textKeyToCommit,
  );
  assert(
    'write',
    'text burst: last keyup to saved revision',
    text.keyToSaved,
    budget.write.textKeyToSaved,
  );
  assert(
    'write',
    'text burst: current card clone carries the text after the commit',
    text.cloneAfterCommit,
    budget.write.cloneAfterCommit,
  );
  assert(
    'write',
    'new slide: pointerdown to painted card',
    slide.paint,
    budget.write.newSlidePaint,
  );
  assert(
    'write',
    'new slide: pointerdown to saved revision',
    slide.saved,
    budget.write.newSlideSaved,
  );
  assert(
    'write',
    `capture of the edited slide after the save (status ${capture.status ?? '?'}, cached ${capture.cached ?? '?'})`,
    capture.ms,
    budget.write.captureAfterSaved,
  );
  assert(
    'write',
    'home card of the scratch deck on the next /decks visit',
    homeCard,
    budget.write.homeCard,
  );
  console.log(
    `info write        scratch deck ${deckId} was created on ${args.base} and is left in place`,
  );
  await context.close();
}

// ---------------------------------------------------------------------------------------------

try {
  if (wants('routes')) await routeLoads();
  if (wants('transitions')) await transitions();
  if (wants('filmstrip')) await filmstrip();
  if (wants('idle')) await idle();
  if (wants('twins')) await twins();
  if (wants('write') && args.write) await writePath();
} finally {
  await browser.close();
}

results.finishedAt = new Date().toISOString();
results.rows = rows;
results.failures = failures;
if (args.json) {
  mkdirSync(dirname(resolve(args.json)), { recursive: true });
  writeFileSync(resolve(args.json), JSON.stringify(results, null, 2));
  console.log(`perf-budget: wrote ${resolve(args.json)}`);
}
const asserted = rows.filter((r) => r.limit !== null).length;
console.log(
  `perf-budget: ${asserted - failures} of ${asserted} budgets met on ${args.base} (${args.profile})`,
);
process.exit(failures > 0 && !args.report ? 1 : 0);

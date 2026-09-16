#!/usr/bin/env node
// The performance budget check of round four (docs/gslides-parity/SPEC-4.md section 4: the
// budgets are 4.1 to 4.7 and the check is 4.8; the design is
// docs/gslides-parity/design-4/performance-plan.md sections 8 and 9 with the copy beside it, moved
// here by the integrator on day 0 with the root lookup, the stream pattern of 4.4 and the rows of
// 4.7: image bytes per route, the icon set's CDN hits, the cold first byte of /new and /decks,
// the LCP element of /home, and the reserved field INP row). It is check step 31
// (scripts/check.mjs, `needs: 'node-server'`): the node-server build served on 4321 with the tmp
// store, never the dev server and never `vite preview`. It drives one Chrome for Testing page at a
// time through playwright-core from the repository's node_modules, measures the routes, the
// transitions, the filmstrip, the idle network, the twin cache and the CDN answers of a running
// studio, compares every number with the budget of the chosen profile and exits 1 when one is over
// (or, for a floor, under). Read only unless --write.
//
// The `local` ceilings are set for Kevin's machine. In CI (`CI` set) scripts/check.mjs adds
// --report until two CI runs agree; the integrator then records the runner's scaling factor here
// and removes the flag. Scaling factor: not yet recorded (no CI run of step 31 has happened).
//
// Merge 2 of round four (build-4/integrator.md; the verifier's day 0 requests 1, 3 and 4 in
// build-4/verifier.md and B4's R14 in build-4/b4.md), four metric changes recorded here:
//   - DOM nodes: the `dom nodes` rows read CDP `Performance.getMetrics` `Nodes` after
//     `HeapProfiler.collectGarbage`, so a windowed filmstrip is measured as the DOM it holds and
//     not as the collector's backlog of detached clones (B4 measured 7,221 against a live DOM of
//     1,860 to 2,040 before the GC); the live element count (`document.querySelectorAll('*')`) is
//     recorded beside it as `elements`.
//   - The local commit (SPEC-4 4.6 row 1): `commitAt` is the first tick where the studio's
//     `describe().state.pending` rises above zero or its revision moves, which is the reducer's
//     write queued in the page; before, it read `revision > from`, which on round three moves when
//     `POST /api/decks/<id>/ops` answers (the network, not the reducer). The acknowledgement is
//     recorded as `ackAt`.
//   - Saved on the memory channel: `TURBOSLIDE_STORE=tmp` runs the memory realtime channel, whose
//     checkpoint lands on a fixed two second cadence, so 4.6's local ceilings for "saved" (600 and
//     250 ms) cannot be met by construction on the node-server build the check measures. On the
//     `local` profile "saved" is the server's acknowledgement (`revision > from`, the ops answer
//     with the record durable on the tmp store) and the row's name says so; the checkpoint
//     (`serverRevision >= revision && pending === 0`) is still recorded as `checkpointAt` and
//     stays the "saved" stamp of the `deployment` profile, where the blob channel's checkpoint is
//     the durable write. Decided by the integrator with B4's report (b4.md section 1.7).
//   - Twins: a 304 revalidation (transferSize about 300 bytes of headers, no body) is not a
//     re-fetch; the row counts entries that carried a body over the wire and reports the
//     revalidations beside them. Fixer round of round four (VERIFICATION-4 finding 13): Chrome
//     reports a 304's encodedBodySize and decodedBodySize as the cached body's sizes, not zero, so
//     the earlier rule ("transferSize and decodedBodySize both above zero") counted every
//     revalidation as a download (18 of 36 on the preview); an entry is a re-fetch when its
//     transferSize reaches its encodedBodySize (the body rode on the wire) or, when the browser
//     reports no encoded size, when transferSize exceeds REVALIDATION_MAX_BYTES; encodedBodySize
//     is recorded per entry. The second visit goes through about:blank first: a navigation to the
//     document's own URL is a reload in Chromium, and the row measures a second visit.
//
//   node scripts/perf-budget.mjs --base http://localhost:4321 --profile local --write
//   node scripts/perf-budget.mjs --base https://<preview>.vercel.app --profile deployment
//   node scripts/perf-budget.mjs --base <origin> --only routes,transitions --runs 1 --report
//
// Options: --base <origin> (required); --profile local|deployment (the budget table; local is the
// production build of apps/studio served on this machine with TURBOSLIDE_STORE=tmp, deployment is
// a Vercel preview or production reached from the check machine); --deck <id> (gt-brand);
// --runs <n> (3; cold and warm samples per route, medians compared); --only <checks> (routes,
// transitions, filmstrip, idle, twins, cdn, vitals, write); --idle-seconds <n> (60); --write (the write path
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
// clock for a document navigation (`home->new`: the pointer rests on the link for HOME_HOVER_MS
// first, so the page's Speculation Rules prerender of /new (SPEC-4 0.42, moderate eagerness, 200 ms
// of hover) has started; the row reads the new document's `activationStart` and says whether the
// navigation activated a prerendered document or loaded a plain one); filmstrip frames are requestAnimationFrame timestamps while the
// wheel fires 18 times at 80 ms gaps over .ts-film; idle calls are /_serverFn/ responses and
// stream connections (/api/decks/<id>/stream, SPEC-4 4.4) per minute on an open editor; twins are
// the deck's asset pictures re-fetched on a second visit of /deck; image bytes are the Resource
// Timing image entries' decodedBodySize (the transferSize reported beside it) that finished before
// the ready mark and, on /home, after a full scroll (SPEC-4 0.28); the CDN rows request each icon
// path, the card and /home twice and read x-vercel-cache on the second answer (4.1's last row); the
// LCP element row reads the LCP entry's element and URL (0.47); the write path's stamps (last
// keyup, local commit, the current card's clone carrying the text, the saved revision) are taken
// in the page at 4 ms.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/** A 304 carries headers alone; a transferSize under this with no body size reported is a revalidation. */
const REVALIDATION_MAX_BYTES = 2_000;
/** The rest on the New presentation link before the click: past the 200 ms the moderate eagerness rule needs, the time a person reads a button. */
const HOME_HOVER_MS = 1_000;
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/perf-budget.mjs sits one level under the repository root
const ROOT = resolve(HERE, '..');
if (!existsSync(resolve(ROOT, 'pnpm-workspace.yaml')))
  throw new Error('perf-budget: cannot find the repository root');
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
// Budgets: the ceilings a run must stay under, per profile (SPEC-4 section 4; performance-plan.md
// section 8). A missing key means the metric is reported and not asserted. Units are milliseconds
// unless the key says bytes, count, fps or ratio. `steadyFpsMin` is a floor, every other key a
// ceiling; `lcpElement` and `cdn.hit` are flags. The image rows (SPEC-4 0.28, 4.1) read the
// decoded bytes; the cold first byte of /new and /decks on a fresh instance (4.1: 1,200 ms on a
// deployment) is reported this round and gated from round five, so it has no key; `cdn` is null
// where no CDN answers (the local profile, "not measured locally").

const BUDGETS = {
  local: {
    routes: {
      '/home': {
        cold: {
          ttfb: 60,
          lcp: 400,
          ready: 400,
          jsDecoded: 600_000,
          imagesBeforeReady: 500_000,
          imagesAfterScroll: 2_000_000,
          lcpElement: true,
        },
        warm: {
          ttfb: 40,
          lcp: 200,
          ready: 200,
          jsDecoded: 600_000,
          imagesBeforeReady: 500_000,
          imagesAfterScroll: 2_000_000,
          lcpElement: true,
        },
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
        cold: { ttfb: 150, lcp: 500, ready: 500, jsDecoded: 600_000, images: 1_500_000 },
        warm: { ttfb: 100, lcp: 300, ready: 300, jsDecoded: 600_000, images: 1_500_000 },
      },
      /* round five (gslides-parity SPEC-5 4.3, 7.6, 16.6): the gallery reads the files page's numbers, the two static help pages the product page's */
      '/decks/templates': {
        cold: { ttfb: 150, lcp: 500, ready: 500, jsDecoded: 600_000, images: 1_500_000 },
        warm: { ttfb: 100, lcp: 300, ready: 300, jsDecoded: 600_000, images: 1_500_000 },
      },
      '/help/training': {
        cold: { ttfb: 60, lcp: 400, ready: 400, jsDecoded: 600_000 },
        warm: { ttfb: 40, lcp: 200, ready: 200, jsDecoded: 600_000 },
      },
      '/help/updates': {
        cold: { ttfb: 60, lcp: 400, ready: 400, jsDecoded: 600_000 },
        warm: { ttfb: 40, lcp: 200, ready: 200, jsDecoded: 600_000 },
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
    cdn: null,
    /* the field INP ceiling is the deployment profile's (SPEC-5 11); nothing local posts a sample */
    vitals: { inp: null },
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
        cold: {
          ttfb: 150,
          lcp: 800,
          ready: 800,
          jsDecoded: 600_000,
          imagesBeforeReady: 500_000,
          imagesAfterScroll: 2_000_000,
          lcpElement: true,
        },
        warm: {
          ttfb: 100,
          lcp: 400,
          ready: 400,
          jsDecoded: 600_000,
          imagesBeforeReady: 500_000,
          imagesAfterScroll: 2_000_000,
          lcpElement: true,
        },
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
        cold: { ttfb: 400, lcp: 1_000, ready: 1_000, jsDecoded: 600_000, images: 1_500_000 },
        warm: { ttfb: 300, lcp: 600, ready: 600, jsDecoded: 600_000, images: 1_500_000 },
      },
      /* round five (SPEC-5 16.6): the gallery and the two help pages on the deployment */
      '/decks/templates': {
        cold: { ttfb: 400, lcp: 1_000, ready: 1_000, jsDecoded: 600_000, images: 1_500_000 },
        warm: { ttfb: 300, lcp: 600, ready: 600, jsDecoded: 600_000, images: 1_500_000 },
      },
      '/help/training': {
        cold: { ttfb: 150, lcp: 700, ready: 700, jsDecoded: 600_000 },
        warm: { ttfb: 100, lcp: 400, ready: 400, jsDecoded: 600_000 },
      },
      '/help/updates': {
        cold: { ttfb: 150, lcp: 700, ready: 700, jsDecoded: 600_000 },
        warm: { ttfb: 100, lcp: 400, ready: 400, jsDecoded: 600_000 },
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
    cdn: { hit: true },
    vitals: { inp: 200 },
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
  // ackMeansSaved: on the local profile the acknowledgement is the saved stamp (the memory
  // channel's checkpoint cadence; the header's merge 2 note); the checkpoint is recorded either way
  window.__tsWriteProbe = (from, text, ackMeansSaved) => {
    const w = { from, text, lastKey: null, commitAt: null, ackAt: null, cloneAt: null, savedAt: null, checkpointAt: null, timer: 0 };
    window.__tsWrite = w;
    const tick = () => {
      const now = performance.now();
      let s;
      try { s = window.turboslide.studio.describe().state; } catch { return; }
      // the reducer's write is queued in the page (pending rises) or already acknowledged
      if (w.commitAt === null && (s.pending > 0 || s.revision > from)) w.commitAt = now;
      if (w.ackAt === null && s.revision > from) w.ackAt = now;
      if (w.commitAt !== null && w.cloneAt === null && text) {
        const card = document.querySelector('.ts-filmstrip .ts-card.is-current .pt-slide');
        if (card && (card.textContent || '').includes(text)) w.cloneAt = now;
      }
      if (w.checkpointAt === null && s.revision > from && s.serverRevision >= s.revision && s.pending === 0) w.checkpointAt = now;
      if (w.savedAt === null) {
        if (ackMeansSaved && w.ackAt !== null) w.savedAt = w.ackAt;
        else if (!ackMeansSaved && w.checkpointAt !== null) w.savedAt = w.checkpointAt;
      }
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
    return `() => document.readyState === 'complete' && Boolean(document.querySelector('main'))`;
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
  cdn: null,
  vitals: null,
  write: null,
};
const rows = [];
let failures = 0;

function shown(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (unit === 'bytes') return `${(value / 1024).toFixed(0)} KB`;
  if (unit === 'count' || unit === 'fps') return String(Math.round(value));
  if (unit === 'ratio') return value.toFixed(4);
  if (unit === 'flag') return value ? 'yes' : 'no';
  return `${Math.round(value)} ms`;
}

/**
 * Records a yes or no row (SPEC-4 0.47: the LCP element of /home, the CDN hit on an icon path).
 * Asserted when `asserted` is true, else reported like a null limit.
 */
function assertFlag(check, name, ok, asserted) {
  const pass = !asserted || ok === true;
  if (!pass) failures += 1;
  rows.push({
    check,
    name,
    value: ok ? 1 : 0,
    limit: asserted ? 1 : null,
    kind: 'flag',
    ok: pass,
    unit: 'flag',
  });
  console.log(
    `${asserted ? (pass ? 'ok  ' : 'FAIL') : 'info'} ${check.padEnd(11)} ${name.padEnd(60)} ${shown(ok ? 1 : 0, 'flag').padStart(10)}${asserted ? '  expected yes' : ''}`,
  );
}

/** SPEC-4 2.3, 0.47: the LCP element of /home is the plate's text or the twin. The recorder gives the element as TAG.firstClass and the entry's URL when it has one. */
function lcpIsPlateOrTwin(el, url) {
  if (typeof url === 'string' && /\/brand\//.test(url)) return true;
  return typeof el === 'string' && /^(?:H1|H2|P|SPAN|A|STRONG|EM)(?:\.|$)/.test(el);
}

/** The bytes of the image entries that finished before `until` (every entry when null): decoded, with the transfer beside it. */
function imageBytes(images, until) {
  const list = (images ?? []).filter((r) => until === null || r.end <= until);
  return {
    decoded: list.reduce((a, r) => a + r.decoded, 0),
    transfer: list.reduce((a, r) => a + r.transfer, 0),
    count: list.length,
  };
}

// The image entries of the page (SPEC-4 0.28): an <img>, a CSS background or any resource with an
// image extension or the thumbnail route, with the bytes Resource Timing exposes for same origin
// answers (a cross origin image without Timing-Allow-Origin reports zero and is counted as such).
const IMAGE_ENTRIES = `(() => {
  const IMAGE_RE = /\\.(?:png|jpe?g|webp|gif|avif|svg|ico)(?:\\?|$)/i;
  return performance
    .getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'img' || IMAGE_RE.test(r.name) || r.name.includes('/api/render/'))
    .map((r) => ({ name: r.name.replace(location.origin, ''), initiator: r.initiatorType, transfer: r.transferSize || 0, decoded: r.decodedBodySize || 0, end: r.responseEnd }));
})()`;

/** Scrolls the page to its end in viewport steps and waits for the lazy images to land (SPEC-4 0.28: the bytes after a full scroll). */
async function fullScroll(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, window.innerHeight - 80);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await wait(120);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      if ([...document.images].every((img) => img.complete)) break;
      await wait(100);
    }
    await wait(300);
  });
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
    return ts.firstDom['main'] ?? null;
  }, route);
}

/**
 * The page's DOM and heap facts: CDP `Nodes` after a garbage collection (detached nodes the
 * collector has not reached yet are not the page's DOM; B4's R14, the header's merge 2 note) and
 * the live element count beside it.
 */
async function pageMetrics(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {
    // no heap profiler on this target: the count below is the collector's view
  }
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const pick = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  const elements = await page
    .evaluate(() => document.querySelectorAll('*').length)
    .catch(() => null);
  return {
    nodes: pick.Nodes,
    elements,
    heapUsed: pick.JSHeapUsedSize,
    layoutCount: pick.LayoutCount,
  };
}

async function resources(page) {
  const images = await page.evaluate(IMAGE_ENTRIES);
  const summary = await page.evaluate(() => {
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
      lcpUrl: ts.lcp ? ts.lcp.url : null,
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
  return { ...summary, images };
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
    /* round five (gslides-parity SPEC-5 4.3, 7.6, 16.6): the gallery and the two help pages */
    '/decks/templates',
    '/help/training',
    '/help/updates',
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
        // SPEC-4 0.28: the image bytes before the ready mark, every image at the sample, and on
        // /home the bytes after a full scroll; /decks reports how many cards the list held
        const before = imageBytes(res.images, ready);
        const all = imageBytes(res.images, null);
        let afterScroll = null;
        if (route === '/home') {
          await fullScroll(page);
          afterScroll = imageBytes(await page.evaluate(IMAGE_ENTRIES), null);
        }
        const cards =
          route === '/decks' ? await page.locator('[data-control^="home.open."]').count() : null;
        const { images, ...rest } = res;
        samples[kind].push({
          ttfb: timing ? timing.responseStart : null,
          ready: ready ?? (error ? null : wall),
          wall,
          error,
          status,
          ...rest,
          ...metrics,
          imagesBeforeReady: before.decoded,
          imagesBeforeReadyTransfer: before.transfer,
          imagesAll: all.decoded,
          imagesTransfer: all.transfer,
          imagesCount: all.count,
          imagesAfterScroll: afterScroll ? afterScroll.decoded : null,
          imagesAfterScrollCount: afterScroll ? afterScroll.count : null,
          images,
          cards,
          lcpOk: lcpIsPlateOrTwin(res.lcpEl, res.lcpUrl),
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
        elements: med('elements'),
        imagesBeforeReady: med('imagesBeforeReady'),
        imagesAll: med('imagesAll'),
        imagesTransfer: med('imagesTransfer'),
        imagesCount: med('imagesCount'),
        imagesAfterScroll: med('imagesAfterScroll'),
        cards: list[0]?.cards ?? null,
        errors: list.map((s) => s.error).filter(Boolean),
        lcpEl: list[0]?.lcpEl ?? null,
        lcpUrl: list[0]?.lcpUrl ?? null,
        lcpOk: list.length > 0 && list.every((s) => s.lcpOk === true),
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
      assert(
        'routes',
        label(`dom nodes (after GC; ${row.elements ?? '?'} live elements)`),
        row.nodes,
        b.nodes,
        'count',
      );
      // SPEC-4 4.7: the image bytes per route, the LCP element of /home, the cold first byte
      if (fam === '/home') {
        assert(
          'routes',
          label('images before ready (decoded)'),
          row.imagesBeforeReady,
          b.imagesBeforeReady,
          'bytes',
        );
        assert(
          'routes',
          label('images after a full scroll (decoded)'),
          row.imagesAfterScroll,
          b.imagesAfterScroll,
          'bytes',
        );
        assertFlag(
          'routes',
          label(`lcp element is the plate text or the twin (${row.lcpEl ?? '?'})`),
          row.lcpOk,
          b.lcpElement === true,
        );
      } else if (fam === '/decks') {
        assert(
          'routes',
          label(`images with ${row.cards ?? '?'} cards (decoded)`),
          row.imagesAll,
          b.images,
          'bytes',
        );
      } else {
        assert(
          'routes',
          label('images before ready (decoded)'),
          row.imagesBeforeReady,
          null,
          'bytes',
        );
      }
      if ((route === '/new' || route === '/decks') && kind === 'cold') {
        const worst = Math.max(...list.map((s) => s.ttfb ?? 0));
        // gslides-parity SPEC-5 16.7 (SPEC-4 4.1, 7): the 1,200 ms cold first byte row gates on the
        // deployment profile; the node-server build reports it (a fresh instance is not forced there)
        const firstByteLimit = args.profile === 'deployment' ? 1200 : null;
        assert(
          'routes',
          label(
            firstByteLimit === null
              ? 'first byte, worst cold sample (a fresh instance is not forced; reported)'
              : 'first byte, worst cold sample (the fresh instance gate)',
          ),
          worst > 0 ? worst : null,
          firstByteLimit,
        );
      }
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
      // the rules of SPEC-4 0.42 prerender /new once the pointer has rested on the link for 200 ms
      // (moderate eagerness); the row rests for HOME_HOVER_MS, clicks, and reads whether the new
      // document was the prerendered one (activationStart above 0 on its navigation entry)
      await toNew.hover();
      await sleep(HOME_HOVER_MS);
      const t = await clickToRoute(page, toNew, '/new');
      const activation = await page
        .evaluate(() => {
          const [nav] = performance.getEntriesByType('navigation');
          return nav && 'activationStart' in nav ? nav.activationStart : null;
        })
        .catch(() => null);
      const prerendered = typeof activation === 'number' && activation > 0;
      const how = t.how.startsWith('wall')
        ? `${t.how}, ${prerendered ? 'prerender activated' : 'no prerender activation'}`
        : t.how;
      record('home->new', t.ms, how, { activationStart: activation, hoverMs: HOME_HOVER_MS });
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
  const { nodes, elements } = await pageMetrics(page);
  const cards = await page.locator('.ts-filmstrip .ts-card').count();
  results.filmstrip = { passes, nodes, elements, cards };
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
  assert(
    'filmstrip',
    `dom nodes with ${cards} cards (after GC; ${elements ?? '?'} live elements)`,
    nodes,
    budget.filmstrip.nodes,
    'count',
  );
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 4: the idle editor's network per minute: server function calls and stream connections
// (the round three per deck stream, GET /api/decks/:id/stream; SPEC-4 4.4)

const STREAM_PATTERN = /\/api\/decks\/[^/?]+\/stream/;

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
  const events = window_.filter((r) => STREAM_PATTERN.test(r.url));
  const perMinute = (fn.length / args.idleSeconds) * 60;
  const eventsPerMinute = (events.length / args.idleSeconds) * 60;
  results.idle = {
    seconds: args.idleSeconds,
    serverFn: fn.length,
    perMinute,
    events: events.length,
    eventsPerMinute,
    pattern: STREAM_PATTERN.source,
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
    `stream connections per minute (/api/decks/*/stream, ${args.idleSeconds} s window)`,
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
    /* a navigation to the document's own URL is a reload in Chromium; the second visit leaves first */
    if (visit === 2) await page.goto('about:blank');
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
            initiator: r.initiatorType,
            transfer: r.transferSize,
            encoded: r.encodedBodySize,
            decoded: r.decodedBodySize,
          })),
      args.deck,
    );
    // a body came over the wire when the bytes transferred reach the encoded body (Chrome reports
    // a 304's body sizes as the cached body's, so the decoded size alone says nothing); a 304 is a
    // revalidation, reported; transferSize 0 is the cache
    const overWire = (r) =>
      r.transfer > 0 &&
      (r.encoded > 0 ? r.transfer >= r.encoded : r.transfer > REVALIDATION_MAX_BYTES);
    const refetched = list.filter((r) => overWire(r));
    const revalidated = list.filter((r) => r.transfer > 0 && !overWire(r));
    results.twins = {
      total: list.length,
      refetched: refetched.length,
      revalidated: revalidated.length,
      list,
    };
    assert(
      'twins',
      `twins re-fetched on the second visit (of ${list.length}; ${revalidated.length} revalidated with a 304)`,
      refetched.length,
      budget.twins.refetched,
      'count',
    );
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 6: the icon set, the card and /home from the CDN (SPEC-4 0.47, 4.1's last row): each path
// requested twice; the second answer must be a 200 with x-vercel-cache HIT on a deployment (the
// static layer answers before the function, R02 section 1 measured function 404s today). Reported
// where the profile has no CDN.

const CDN_PATHS = [
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/icons/icon-512.png',
  '/og/turboslide.png',
  '/home',
];

async function cdnHits() {
  const context = await newContext();
  const asserted = budget.cdn !== null && budget.cdn.hit === true;
  const list = [];
  for (const path of CDN_PATHS) {
    const get = () =>
      context.request
        .get(`${args.base}${path}`, { timeout: 60_000, maxRedirects: 0 })
        .catch(() => null);
    const first = await get();
    await sleep(300);
    const second = await get();
    const headers = second ? second.headers() : {};
    const body = second ? await second.body().catch(() => null) : null;
    const entry = {
      path,
      status: [first ? first.status() : null, second ? second.status() : null],
      cache: headers['x-vercel-cache'] ?? null,
      cacheControl: headers['cache-control'] ?? null,
      type: headers['content-type'] ?? null,
      bytes: body ? body.length : null,
    };
    list.push(entry);
    const ok = entry.status[1] === 200 && entry.cache === 'HIT';
    assertFlag(
      'cdn',
      `${path} second request is a CDN hit (status ${entry.status[1] ?? '?'}, x-vercel-cache ${entry.cache ?? 'none'})`,
      ok,
      asserted,
    );
  }
  results.cdn = list;
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// Check 7: field INP (SPEC-4 4.7): the row is reserved with the endpoint name and no ceiling; the
// collection through web-vitals/attribution posted to /api/vitals is round five's.

async function vitals() {
  /* round five (gslides-parity SPEC-5 11): the endpoint's report, the p75 per route family; the
     row asserts against the ceiling where at least one sample of the /edit family exists and
     reports the count otherwise (a fresh deployment has none) */
  results.vitals = { endpoint: '/api/vitals', collected: false, report: null };
  let report = null;
  try {
    const response = await fetch(`${args.base}/api/vitals?report=1`, {
      headers: process.env.VERCEL_OIDC_TOKEN
        ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
        : {},
    });
    if (response.ok) report = await response.json();
  } catch {
    report = null;
  }
  results.vitals.report = report;
  results.vitals.collected = report !== null && report.samples > 0;
  const inp = report?.routes?.['/edit']?.INP ?? null;
  const ceiling = budget.vitals?.inp ?? null;
  assert(
    'vitals',
    `field INP p75 on /edit from /api/vitals (${inp === null ? 'no samples yet' : `${inp.count} sample(s)`})`,
    inp === null ? null : inp.p75,
    inp === null ? null : ceiling,
  );
}

// ---------------------------------------------------------------------------------------------
// Check 8 (--write): the write path on /new; leaves a scratch deck behind

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
      return {
        lastKey: w.lastKey,
        commitAt: w.commitAt,
        ackAt: w.ackAt,
        cloneAt: w.cloneAt,
        savedAt: w.savedAt,
        checkpointAt: w.checkpointAt,
      };
    });
  };
  // the local profile measures the tmp store's memory channel, whose checkpoint is a two second
  // cadence: "saved" is the acknowledgement there and the checkpoint on a deployment (the header)
  const ackMeansSaved = args.profile === 'local';
  const savedLabel = ackMeansSaved
    ? 'saved revision (acknowledged; memory channel)'
    : 'saved revision';
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
  await page.evaluate((input) => window.__tsWriteProbe(input.from, input.text, input.ack), {
    from: r0,
    text: TEXT,
    ack: ackMeansSaved,
  });
  await page.keyboard.type(TEXT, { delay: 30 });
  const w1 = await probed();
  await page.waitForURL(/\/edit\//, { timeout: 60_000 }).catch(() => undefined);
  const deckId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '');
  const since = (stamp) => (w1.lastKey === null || stamp === null ? null : stamp - w1.lastKey);
  const text = {
    keyToCommit: since(w1.commitAt),
    keyToAck: since(w1.ackAt),
    keyToSaved: since(w1.savedAt),
    keyToCheckpoint: since(w1.checkpointAt),
    cloneAfterCommit: w1.cloneAt === null || w1.commitAt === null ? null : w1.cloneAt - w1.commitAt,
  };
  await page.keyboard.press('Escape');
  await sleep(600);
  // New slide from the toolbar: the card's painted frame and the saved write
  const n = await page.locator('.ts-filmstrip .ts-card:not(.is-empty)').count();
  const r1 = (await state()).revision;
  await page.evaluate((input) => window.__tsWriteProbe(input.from, '', input.ack), {
    from: r1,
    ack: ackMeansSaved,
  });
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
  const slide = {
    paint: t.paintMs,
    saved: t.down === null ? null : w2.savedAt - t.down,
    ack: t.down === null || w2.ackAt === null ? null : w2.ackAt - t.down,
    checkpoint: t.down === null || w2.checkpointAt === null ? null : w2.checkpointAt - t.down,
  };
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
  results.write = { deckId, ackMeansSaved, text, slide, capture, homeCard, renders };
  assert(
    'write',
    'text burst: last keyup to local commit',
    text.keyToCommit,
    budget.write.textKeyToCommit,
  );
  assert(
    'write',
    `text burst: last keyup to ${savedLabel}`,
    text.keyToSaved,
    budget.write.textKeyToSaved,
  );
  // the other stamp, reported: the checkpoint on the local profile, the acknowledgement on a deployment
  assert(
    'write',
    ackMeansSaved
      ? 'text burst: last keyup to checkpoint (reported; the memory channel cadence)'
      : 'text burst: last keyup to acknowledgement (reported)',
    ackMeansSaved ? text.keyToCheckpoint : text.keyToAck,
    null,
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
    `new slide: pointerdown to ${savedLabel}`,
    slide.saved,
    budget.write.newSlideSaved,
  );
  assert(
    'write',
    ackMeansSaved
      ? 'new slide: pointerdown to checkpoint (reported; the memory channel cadence)'
      : 'new slide: pointerdown to acknowledgement (reported)',
    ackMeansSaved ? slide.checkpoint : slide.ack,
    null,
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
  if (wants('cdn')) await cdnHits();
  if (wants('vitals')) await vitals();
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

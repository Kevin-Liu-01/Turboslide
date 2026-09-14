#!/usr/bin/env node
// Round four verifier, day 0: the R04 measurements perf-budget.mjs does not take (research-4/04
// sections 4 to 8). One Chrome for Testing page at a time, playwright-core from the repository.
//   node harness.mjs routes   --base <origin> --runs 3 --out <file>
//   node harness.mjs extras   --base <origin> --out <file>      (format options, layout grid, presenter popup)
//   node harness.mjs editor   --base <origin> --out <file>      (a scratch deck from /new; prints its id)
//   node harness.mjs material --base <origin> --out <file>
//   node harness.mjs idle     --base <origin> --seconds 60 --out <file>
//   node harness.mjs cleanup  --base <origin> --ids a,b --out <file>
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FLAGS = ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'];

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const BASE = (opt('--base', 'https://turboslide.vercel.app') ?? '').replace(/\/$/, '');
const RUNS = Number(opt('--runs', '3'));
const OUT = opt('--out', null);
const DECK = opt('--deck', 'gt-brand');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r0 = (x) => (typeof x === 'number' ? Math.round(x) : x);

const INIT = `(() => {
  const ts = { lcp: null, cls: 0, loaf: [], firstDom: {}, studioAt: null, settledAt: null, hydratedAt: null, down: null, up: null, upFrame: null, armed: null };
  window.__ts = ts;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { const el = e.element; ts.lcp = { t: e.startTime, size: e.size, el: el ? el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') : null, url: e.url || null }; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) ts.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) ts.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
  const want = ['.ts-title-row', '.ts-home-page', '.ts-trash-page', '.pt-viewer', '.ts-presenter', '.ts-filmstrip .ts-card', '.ts-stagewrap canvas', '[data-recipe]', '.ts-thumb[data-thumb="static"]', 'main'];
  const check = () => {
    const now = performance.now();
    for (const s of want) if (!(s in ts.firstDom) && document.querySelector(s)) ts.firstDom[s] = now;
    try { if (ts.studioAt === null && window.turboslide && window.turboslide.studio) ts.studioAt = now; } catch {}
    if (ts.settledAt === null && document.querySelector('.pt-viewer[data-settled]')) ts.settledAt = now;
    if (ts.hydratedAt === null && document.querySelector('[data-hydrated]')) ts.hydratedAt = now;
    const a = ts.armed;
    if (a && a.appear === null) { let ok = false; try { ok = Boolean(a.pred()); } catch {} if (ok) { a.appear = now; requestAnimationFrame(() => { a.frame = performance.now(); }); } }
  };
  const mo = new MutationObserver(check);
  const start = () => { try { mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-settled', 'data-hydrated', 'data-slide-id', 'data-thumb', 'class', 'src'] }); } catch {} };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  setInterval(check, 4);
  window.addEventListener('pointerdown', () => { ts.down = performance.now(); }, { capture: true });
  window.addEventListener('pointerup', () => { ts.up = performance.now(); requestAnimationFrame(() => { ts.upFrame = performance.now(); }); }, { capture: true });
  window.__tsArm = (src) => { ts.armed = { pred: new Function('return (' + src + ')()'), appear: null, frame: null }; ts.down = null; };
  window.__tsArmed = () => ts.armed && ts.armed.appear !== null ? { down: ts.down, appear: ts.armed.appear, frame: ts.armed.frame } : null;
  window.__tsWrite = null;
  window.__tsWriteProbe = (from, text) => {
    const w = { from, text, lastKey: null, commitAt: null, cloneAt: null, ackAt: null, savedAt: null, revAfter: null, timer: 0 };
    window.__tsWrite = w;
    const tick = () => {
      const now = performance.now();
      let s; try { s = window.turboslide.studio.describe().state; } catch { return; }
      if (w.commitAt === null && s.revision > from) w.commitAt = now;
      if (w.commitAt !== null && w.cloneAt === null && text) { const card = document.querySelector('.ts-filmstrip .ts-card.is-current .pt-slide'); if (card && (card.textContent || '').includes(text)) w.cloneAt = now; }
      const sp = s.sync ? s.sync.pending : s.pending;
      if (w.ackAt === null && s.revision > from && sp === 0 && s.pending === 0) { w.ackAt = now; w.revAfter = s.revision; }
      if (w.savedAt === null && s.revision > from && s.serverRevision >= s.revision && s.pending === 0) { w.savedAt = now; w.revAfter = s.revision; }
      if (w.savedAt !== null && (w.cloneAt !== null || !text)) clearInterval(w.timer);
    };
    w.timer = setInterval(tick, 4);
    return true;
  };
  document.addEventListener('keyup', () => { if (window.__tsWrite) window.__tsWrite.lastKey = performance.now(); }, true);
  window.__frames = []; window.__recording = false;
  window.__tsRecord = (on) => { window.__recording = on; if (on) { window.__frames = []; const tick = (t) => { window.__frames.push(t); if (window.__recording) requestAnimationFrame(tick); }; requestAnimationFrame(tick); } return window.__frames; };
})();`;

const landmark = (route) => {
  if (route === '/' || route === '/new' || route.startsWith('/edit'))
    return `() => { try { return Boolean(window.turboslide?.studio) && document.querySelector('.pt-viewer[data-settled]'); } catch { return false; } }`;
  if (route.startsWith('/present'))
    return `() => { try { return Boolean(window.turboslide?.studio) && document.querySelector('.ts-presenter'); } catch { return false; } }`;
  if (route.startsWith('/deck/'))
    return `() => Boolean(document.querySelector('.pt-viewer[data-settled]'))`;
  if (route === '/decks')
    return `() => Boolean(document.querySelector('.ts-home-page[data-hydrated]'))`;
  if (route === '/decks/trash')
    return `() => Boolean(document.querySelector('.ts-trash-page[data-hydrated]'))`;
  return `() => document.readyState === 'complete'`;
};
const landmarkAt = (route) => {
  const at = /^\/(edit|deck|present)\//.test(route)
    ? `location.pathname.startsWith(${JSON.stringify(route)})`
    : `location.pathname === ${JSON.stringify(route)}`;
  return `() => ${at} && (${landmark(route)})()`;
};
const waitLandmark = (page, route, timeout = 120_000) =>
  page.waitForFunction(new Function(`return (${landmark(route)})()`), null, { timeout });

const readyAt = (page, route) =>
  page.evaluate((r) => {
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

const routeDomKey = (route) => {
  if (route === '/' || route === '/new' || route.startsWith('/edit')) return '.ts-title-row';
  if (route.startsWith('/present')) return '.ts-presenter';
  if (route.startsWith('/deck/')) return '.pt-viewer';
  if (route === '/decks') return '.ts-home-page';
  if (route === '/decks/trash') return '.ts-trash-page';
  return 'main';
};

async function pageMetrics(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const pick = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return {
    nodes: pick.Nodes,
    heapUsedMb: Math.round(pick.JSHeapUsedSize / 1e5) / 10,
    listeners: pick.JSEventListeners,
  };
}

const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);

function track(page) {
  const list = [];
  page.on('response', async (response) => {
    try {
      const request = response.request();
      const url = request.url();
      let timing = null;
      try {
        timing = request.timing();
      } catch {}
      list.push({
        url,
        short: url.replace(BASE, '').split('?')[0].slice(0, 90),
        method: request.method(),
        status: response.status(),
        type: request.resourceType(),
        at: Date.now(),
        cache: response.headers()['x-vercel-cache'] ?? null,
        ms:
          timing && timing.responseEnd > 0 && timing.requestStart >= 0
            ? Math.round(timing.responseEnd - timing.requestStart)
            : null,
      });
    } catch {}
  });
  return list;
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: FLAGS });
const newContext = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INIT);
  return context;
};
const out = { cmd, base: BASE, startedAt: new Date().toISOString() };

// ---------------------------------------------------------------------------------------------
async function routes() {
  const list = [
    '/',
    '/new',
    '/decks',
    '/decks/trash',
    `/deck/${DECK}`,
    `/edit/${DECK}`,
    `/present/${DECK}`,
  ];
  out.routes = [];
  for (const route of list) {
    const samples = { cold: [], warm: [] };
    for (let run = 0; run < RUNS; run += 1) {
      const context = await newContext();
      for (const kind of ['cold', 'warm']) {
        const page = await context.newPage();
        const responses = track(page);
        const t0 = Date.now();
        const response = await page.goto(`${BASE}${route}`, {
          waitUntil: 'commit',
          timeout: 120_000,
        });
        let timing = null;
        try {
          timing = response.request().timing();
        } catch {}
        let error = null;
        try {
          await waitLandmark(page, route);
        } catch (e) {
          error = String(e).split('\n')[0];
        }
        const readyWall = Date.now() - t0;
        await sleep(1200);
        const ready = await readyAt(page, route);
        const doc = response
          ? {
              status: response.status(),
              cache: response.headers()['x-vercel-cache'] ?? null,
              id: response.headers()['x-vercel-id'] ?? null,
              age: response.headers()['age'] ?? null,
            }
          : null;
        const res = await page.evaluate((key) => {
          const res = performance.getEntriesByType('resource');
          const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
          const css = res.filter((r) => /\.css(\?|$)/.test(r.name));
          const fonts = res.filter((r) => /\.woff2(\?|$)/.test(r.name));
          const imgs = res.filter(
            (r) => r.initiatorType === 'img' || /\.(png|jpg|jpeg|webp|avif)(\?|$)/.test(r.name),
          );
          const paint = Object.fromEntries(
            performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]),
          );
          const nav = performance.getEntriesByType('navigation')[0];
          const ts = window.__ts;
          const sum = (xs, k) => xs.reduce((a, r) => a + (r[k] || 0), 0);
          return {
            fcp: paint['first-contentful-paint'] ?? null,
            lcp: ts.lcp ? ts.lcp.t : null,
            lcpEl: ts.lcp ? ts.lcp.el : null,
            lcpUrl: ts.lcp ? (ts.lcp.url || '').split('/').pop() : null,
            cls: ts.cls,
            loafMax: ts.loaf.length ? Math.max(...ts.loaf.map((l) => l.d)) : 0,
            routeDom: ts.firstDom[key] ?? null,
            studioAt: ts.studioAt,
            settledAt: ts.settledAt,
            hydratedAt: ts.hydratedAt,
            firstStaticThumb: ts.firstDom['.ts-thumb[data-thumb="static"]'] ?? null,
            jsFiles: js.length,
            jsDecoded: sum(js, 'decodedBodySize'),
            jsWire: sum(js, 'transferSize'),
            cssDecoded: sum(css, 'decodedBodySize'),
            fontWire: sum(fonts, 'transferSize'),
            imgCount: imgs.length,
            imgWire: sum(imgs, 'transferSize'),
            resources: res.length,
            htmlEncoded: nav ? nav.encodedBodySize : null,
            htmlDecoded: nav ? nav.decodedBodySize : null,
            protocol: nav ? nav.nextHopProtocol : null,
          };
        }, routeDomKey(route));
        const metrics = await pageMetrics(page);
        const readyMs = ready ?? (error ? null : readyWall);
        const untilReady =
          readyMs === null ? null : responses.filter((r) => r.at - t0 <= readyMs + 20).length;
        const serverFn = responses.filter((r) => r.url.includes('/_serverFn/')).length;
        const renders = responses.filter((r) => r.url.includes('/api/render/'));
        samples[kind].push({
          ttfb: timing ? timing.responseStart : null,
          ready: readyMs,
          readyWall,
          error,
          doc,
          ...res,
          ...metrics,
          requestsUntilReady: untilReady,
          requestsTotal: responses.length,
          serverFnCalls: serverFn,
          renderRequests: renders.length,
          renderHits: renders.filter((r) => r.cache === 'HIT').length,
          finalUrl: page.url(),
        });
        await page.close();
      }
      await context.close();
    }
    for (const kind of ['cold', 'warm']) {
      const s = samples[kind];
      const med = (k) => median(s.map((x) => x[k]));
      const range = (k) => {
        const xs = s.map((x) => x[k]).filter((v) => typeof v === 'number');
        return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
      };
      const row = {
        route,
        kind,
        n: s.length,
        ttfb: med('ttfb'),
        ttfbRange: range('ttfb'),
        fcp: med('fcp'),
        lcp: med('lcp'),
        lcpRange: range('lcp'),
        lcpEl: s[0]?.lcpEl,
        lcpUrl: s[0]?.lcpUrl,
        routeDom: med('routeDom'),
        studioAt: med('studioAt'),
        settledAt: med('settledAt'),
        hydratedAt: med('hydratedAt'),
        ready: med('ready'),
        readyRange: range('ready'),
        firstStaticThumb: med('firstStaticThumb'),
        jsFiles: med('jsFiles'),
        jsDecoded: med('jsDecoded'),
        jsWire: med('jsWire'),
        cssDecoded: med('cssDecoded'),
        fontWire: med('fontWire'),
        imgCount: med('imgCount'),
        imgWire: med('imgWire'),
        htmlEncoded: med('htmlEncoded'),
        htmlDecoded: med('htmlDecoded'),
        requestsUntilReady: med('requestsUntilReady'),
        requestsUntilReadyRange: range('requestsUntilReady'),
        requestsTotal: med('requestsTotal'),
        serverFnCalls: med('serverFnCalls'),
        renderRequests: med('renderRequests'),
        renderHits: med('renderHits'),
        nodes: med('nodes'),
        heapUsedMb: med('heapUsedMb'),
        loafMax: med('loafMax'),
        cls: med('cls'),
        docCache: s.map((x) => x.doc?.cache),
        docIds: s.map((x) => x.doc?.id),
        protocol: s[0]?.protocol,
        errors: s.map((x) => x.error).filter(Boolean),
        samples: s,
      };
      out.routes.push(row);
      console.log(
        `${route.padEnd(18)} ${kind.padEnd(4)} ttfb ${r0(row.ttfb)} fcp ${r0(row.fcp)} lcp ${r0(row.lcp)} dom ${r0(row.routeDom)} ready ${r0(row.ready)} js ${row.jsFiles}/${Math.round(row.jsDecoded / 1024)}KB wire ${Math.round(row.jsWire / 1024)}KB req ${row.requestsUntilReady} (${row.requestsTotal}) nodes ${row.nodes} lcpEl ${row.lcpEl}${row.errors.length ? ' ERR ' + row.errors[0] : ''}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
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

async function extras() {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/edit/${DECK}`, { waitUntil: 'commit' });
  await waitLandmark(page, `/edit/${DECK}`);
  await sleep(2000);
  out.extras = {};
  // the tmp store's hosting banner (edit.$deckId.tsx HostingBanner, no dismiss control) is fixed
  // over the toolbar's Layout button on a local preview; hidden for the pointer steps and recorded
  if ((await page.locator('.ts-banner[data-state="hosting"]').count()) > 0) {
    await page.addStyleTag({
      content: '.ts-banner[data-state="hosting"]{display:none !important}',
    });
    out.extras.hostingBannerHidden = true;
    await sleep(200);
  }
  // Format options: the Format menu, then the item, then the panel painted (nothing selected)
  {
    const trigger = page.locator('[data-control="menubar.format"]').first();
    const tMenu = await armAndClick(
      page,
      trigger,
      `() => { const el = document.querySelector('[data-control="menu.format.formatOptions"]'); return el && el.getClientRects().length > 0; }`,
    );
    const item = page.locator('[data-control="menu.format.formatOptions"]').first();
    const tPanel = await armAndClick(
      page,
      item,
      `() => { const el = document.querySelector('[data-control^="formatOptions."], .ts-panel-section'); return el && el.getClientRects().length > 0; }`,
    );
    out.extras.formatOptions = {
      menuOpenMs: tMenu.ms,
      menuPaintMs: tMenu.paintMs,
      panelMs: tPanel.ms,
      panelPaintMs: tPanel.paintMs,
    };
    console.log(
      'format options: menu',
      r0(tMenu.paintMs),
      'panel',
      r0(tPanel.ms),
      'painted',
      r0(tPanel.paintMs),
    );
    await page.keyboard.press('Escape');
    await sleep(400);
  }
  // Layout grid, three samples
  {
    const samples = [];
    const closePlate = async () => {
      const plate = page.locator('[data-control="layout.apply.plate"]');
      const how = [];
      for (let k = 0; k < 4 && (await plate.count()) > 0; k += 1) {
        if (k === 0) {
          await page.keyboard.press('Escape');
          how.push('Escape');
        } else if (k === 1) {
          await page.locator('[data-control="toolbar.layout"]').first().dispatchEvent('click');
          how.push('toggle click (dispatched)');
        } else {
          const st = await page.locator('.ts-stagewrap').first().boundingBox();
          if (st) {
            await page.mouse.click(st.x + st.width / 2, st.y + 10);
            how.push('stage click');
          }
        }
        await sleep(300);
      }
      return { closed: (await plate.count()) === 0, how };
    };
    out.extras.layoutGrid = samples;
    for (let i = 0; i < 3; i += 1) {
      const c = await closePlate();
      if (!c.closed) {
        samples.push({ error: 'plate would not close', how: c.how });
        break;
      }
      const layout = page.locator('[data-control="toolbar.layout"]').first();
      const t = await armAndClick(
        page,
        layout,
        `() => { const el = document.querySelector('[data-control="layout.apply.plate"]'); return el && el.getClientRects().length > 0; }`,
      );
      samples.push({ ms: t.ms, paintMs: t.paintMs, closedBy: c.how });
      await sleep(400);
    }
    out.extras.layoutClose = await closePlate();
    out.extras.layoutGrid = samples;
    console.log('layout grid:', samples.map((s) => `${r0(s.ms)}/${r0(s.paintMs)}`).join(' '));
  }
  // Slideshow in tab, then Esc back
  {
    const present = page.locator('[data-control="present.open"]').first();
    const t = await armAndClick(
      page,
      present,
      `() => document.querySelector('.ts-slideshow') && document.querySelector('.pt-viewer.is-present')`,
    );
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.pt-viewer.is-present'), null, {
      timeout: 10_000,
    });
    const back = (await page.evaluate(() => performance.now())) - t0;
    out.extras.slideshow = { ms: t.ms, paintMs: t.paintMs, escBackMs: back };
    console.log('slideshow:', r0(t.ms), 'painted', r0(t.paintMs), 'esc back', r0(back));
    await sleep(500);
  }
  // Presenter view: the arrow menu, then the popup window
  {
    const arrow = page.locator('[data-control="present.arrow"]').first();
    await arrow.click();
    const item = page.locator('[data-control="menu.title.slideshow.presenterView"]').first();
    await item.waitFor({ timeout: 10_000 });
    const t0 = Date.now();
    const popupPromise = context.waitForEvent('page', { timeout: 60_000 });
    await item.click();
    const popup = await popupPromise;
    const tOpen = Date.now() - t0;
    await popup.waitForFunction(() => Boolean(document.querySelector('.ts-presenter')), null, {
      timeout: 60_000,
    });
    const tPresenter = Date.now() - t0;
    await popup
      .waitForFunction(
        () => {
          try {
            return Boolean(window.turboslide?.studio);
          } catch {
            return false;
          }
        },
        null,
        { timeout: 60_000 },
      )
      .catch(() => undefined);
    const tStudio = Date.now() - t0;
    await sleep(1500);
    const pop = await popup.evaluate(() => ({
      url: location.pathname,
      lcp: window.__ts?.lcp?.t ?? null,
      lcpEl: window.__ts?.lcp?.el ?? null,
      presenter: window.__ts?.firstDom['.ts-presenter'] ?? null,
      studio: window.__ts?.studioAt ?? null,
    }));
    out.extras.presenterPopup = {
      openMs: tOpen,
      presenterMs: tPresenter,
      studioMs: tStudio,
      popup: pop,
    };
    console.log(
      'presenter popup:',
      pop.url,
      'open',
      tOpen,
      'presenter',
      tPresenter,
      'studio',
      tStudio,
      'popup lcp',
      r0(pop.lcp),
    );
    await popup.close();
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------
async function probed(page, timeout = 60_000) {
  await page
    .waitForFunction(
      () =>
        window.__tsWrite && (window.__tsWrite.savedAt !== null || window.__tsWrite.ackAt !== null),
      null,
      { timeout },
    )
    .catch(() => undefined);
  // give the checkpoint a chance to land after the ack
  await page
    .waitForFunction(() => window.__tsWrite && window.__tsWrite.savedAt !== null, null, {
      timeout: 20_000,
    })
    .catch(() => undefined);
  await sleep(120);
  return page.evaluate(() => {
    const w = window.__tsWrite;
    clearInterval(w.timer);
    return {
      lastKey: w.lastKey,
      commitAt: w.commitAt,
      cloneAt: w.cloneAt,
      ackAt: w.ackAt,
      savedAt: w.savedAt,
      revAfter: w.revAfter,
    };
  });
}

/** Waits for the current card's static thumbnail to show a src newer than `before`; stamps in page. */
async function thumbAfter(page, before, timeout = 45_000) {
  return page.evaluate(
    async ({ before, timeout }) => {
      const t0 = performance.now();
      return new Promise((resolve) => {
        const tick = () => {
          const card = document.querySelector('.ts-filmstrip .ts-card.is-current');
          const img = card ? card.querySelector('.ts-thumb[data-thumb="static"] img') : null;
          const src = img ? img.currentSrc || img.src : null;
          if (img && src && src !== before && img.complete && img.naturalWidth > 0) {
            resolve({ at: performance.now(), src: src.replace(location.origin, '') });
            return;
          }
          if (performance.now() - t0 > timeout) {
            resolve({
              at: null,
              src: src ? src.replace(location.origin, '') : null,
              timedOut: true,
            });
            return;
          }
          setTimeout(tick, 16);
        };
        tick();
      });
    },
    { before, timeout },
  );
}
const currentThumbSrc = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('.ts-filmstrip .ts-card.is-current');
    const img = card ? card.querySelector('.ts-thumb img') : null;
    return img ? img.currentSrc || img.src : null;
  });

async function enterHeading(page) {
  const run = page
    .locator(
      '.ts-stagewrap.ts-editor .pt-slide .ts-card-frame, .ts-stagewrap.ts-editor .pt-slide [data-run]',
    )
    .first();
  const box = await run.boundingBox();
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  await page.waitForFunction(
    () => Boolean(document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]')),
    null,
    { timeout: 15_000 },
  );
}

async function editor() {
  const context = await newContext();
  const page = await context.newPage();
  const responses = track(page);
  const t0 = Date.now();
  await page.goto(`${BASE}/new`, { waitUntil: 'commit' });
  await waitLandmark(page, '/new');
  await sleep(800);
  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-block]')].map((el) =>
      el.getAttribute('data-block'),
    ),
  );
  const st0 = await state(page);
  out.editor = {
    blocks,
    tier: st0.sync?.tier,
    transport: st0.sync?.transport,
    textEdits: [],
    drags: [],
  };
  console.log('blocks', blocks, 'tier', st0.sync?.tier, st0.sync?.transport);
  // 1. the first text edit: creates the deck
  {
    const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first();
    await run.waitFor({ timeout: 30_000 });
    const box = await run.boundingBox();
    await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
    await page.waitForFunction(
      () => Boolean(document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]')),
      null,
      { timeout: 15_000 },
    );
    const from = (await state(page)).revision;
    const thumbBefore = await currentThumbSrc(page);
    const TEXT = 'Baseline heading';
    await page.evaluate((i) => window.__tsWriteProbe(i.from, i.text), { from, text: TEXT });
    const before = responses.length;
    await page.keyboard.type(TEXT, { delay: 30 });
    const w = await probed(page);
    await page.waitForURL(/\/edit\//, { timeout: 60_000 }).catch(() => undefined);
    const thumb = await thumbAfter(page, thumbBefore);
    const calls = responses
      .slice(before)
      .filter((r) => r.url.includes('/_serverFn/') || r.url.includes('/api/decks/'))
      .map((r) => ({ short: r.short, status: r.status, ms: r.ms }));
    const renders = responses
      .slice(before)
      .filter((r) => r.url.includes('/api/render/'))
      .map((r) => ({
        status: r.status,
        cache: r.cache,
        ms: r.ms,
        q: r.url.split('?')[1]?.slice(0, 60),
      }));
    const e = {
      label: 'first edit (creates the deck)',
      text: TEXT,
      from,
      ...w,
      keyToCommit: w.commitAt - w.lastKey,
      keyToAck: w.ackAt === null ? null : w.ackAt - w.lastKey,
      keyToSaved: w.savedAt === null ? null : w.savedAt - w.lastKey,
      cloneAfterCommit: w.cloneAt === null ? null : w.cloneAt - w.commitAt,
      thumbAfterSaved: thumb.at === null ? null : thumb.at - (w.savedAt ?? w.ackAt),
      thumbSrc: thumb.src,
      thumbTimedOut: thumb.timedOut ?? false,
      calls,
      renders,
    };
    out.editor.textEdits.push(e);
    console.log(
      'edit 1: key->commit',
      r0(e.keyToCommit),
      'key->ack',
      r0(e.keyToAck),
      'key->saved',
      r0(e.keyToSaved),
      'clone',
      r0(e.cloneAfterCommit),
      'thumb',
      r0(e.thumbAfterSaved),
      'calls',
      calls.map((c) => `${c.short.split('/').pop()}:${c.status}:${c.ms}`).join(' '),
    );
    await page.keyboard.press('Escape');
    await sleep(800);
  }
  const deckId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '');
  out.editor.deckId = deckId;
  console.log('deck', deckId);
  // 2. steady state text edits, three samples
  for (let i = 2; i <= 4; i += 1) {
    const run = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]').first();
    const box = await run.boundingBox();
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    await page.waitForFunction(
      () => Boolean(document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]')),
      null,
      { timeout: 15_000 },
    );
    await page.keyboard.press('End');
    const from = (await state(page)).revision;
    const thumbBefore = await currentThumbSrc(page);
    const TEXT = ` edit${i}`;
    await page.evaluate((i) => window.__tsWriteProbe(i.from, i.text), { from, text: TEXT.trim() });
    const before = responses.length;
    await page.keyboard.type(TEXT, { delay: 30 });
    const w = await probed(page);
    const thumb = await thumbAfter(page, thumbBefore);
    const calls = responses
      .slice(before)
      .filter((r) => r.url.includes('/_serverFn/') || r.url.includes('/api/decks/'))
      .map((r) => ({ short: r.short, status: r.status, ms: r.ms }));
    const renders = responses
      .slice(before)
      .filter((r) => r.url.includes('/api/render/'))
      .map((r) => ({
        status: r.status,
        cache: r.cache,
        ms: r.ms,
        q: r.url.split('?')[1]?.slice(0, 60),
      }));
    const e = {
      label: `text edit ${i}`,
      text: TEXT.trim(),
      from,
      ...w,
      keyToCommit: w.commitAt - w.lastKey,
      keyToAck: w.ackAt === null ? null : w.ackAt - w.lastKey,
      keyToSaved: w.savedAt === null ? null : w.savedAt - w.lastKey,
      cloneAfterCommit: w.cloneAt === null ? null : w.cloneAt - w.commitAt,
      thumbAfterSaved: thumb.at === null ? null : thumb.at - (w.savedAt ?? w.ackAt),
      thumbSrc: thumb.src,
      thumbTimedOut: thumb.timedOut ?? false,
      calls,
      renders,
    };
    out.editor.textEdits.push(e);
    console.log(
      `edit ${i}: key->commit`,
      r0(e.keyToCommit),
      'key->ack',
      r0(e.keyToAck),
      'key->saved',
      r0(e.keyToSaved),
      'clone',
      r0(e.cloneAfterCommit),
      'thumb',
      r0(e.thumbAfterSaved),
      'calls',
      calls.map((c) => `${c.short.split('/').pop()}:${c.status}:${c.ms}`).join(' '),
    );
    await page.keyboard.press('Escape');
    await sleep(800);
  }
  // 3. drags: select the heading, drag by the move handle, 24 moves; four drags then a resize
  {
    const id = blocks.find((b) => /^h|heading|title/.test(b)) ?? blocks[0];
    const select = async () => {
      const point = await page.evaluate((id) => {
        const sheet = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
        if (!sheet || !el) return null;
        const s = sheet.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const left = Math.max(b.left, s.left) + 2,
          top = Math.max(b.top, s.top) + 2,
          right = Math.min(b.right, s.right) - 2,
          bottom = Math.min(b.bottom, s.bottom) - 2;
        for (let i = 0; i <= 8; i += 1)
          for (let j = 0; j <= 8; j += 1) {
            const x = left + ((right - left) * i) / 8,
              y = top + ((bottom - top) * j) / 8;
            const hit = document.elementFromPoint(x, y);
            const owner = hit && hit.closest('[data-block], [data-free]');
            if (
              owner &&
              (owner.getAttribute('data-block') === id || owner.getAttribute('data-free') === id)
            )
              return { x, y };
          }
        return null;
      }, id);
      if (point) await page.mouse.click(point.x, point.y);
      const editable = page.locator('.ts-stagewrap.ts-editor [contenteditable="true"]');
      if ((await editable.count()) > 0) await page.keyboard.press('Escape');
      const move = page.locator(`.ts-overlay [data-control="handle.${id}.move"]`);
      if ((await move.count()) === 0) {
        const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`).first();
        const box = await el.boundingBox();
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        if ((await editable.count()) > 0) await page.keyboard.press('Escape');
      }
      await move.waitFor({ state: 'visible', timeout: 10_000 });
      return move;
    };
    const dragBy = async (locator, dx, dy, steps, label) => {
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      const from = (await state(page)).revision;
      const layoutBefore = await page.evaluate(
        () =>
          document
            .querySelector('.ts-stagewrap.ts-editor .pt-slide')
            ?.getAttribute('data-layout') ??
          document.querySelector('.ts-stagewrap.ts-editor .pt-slide')?.className ??
          null,
      );
      await page.evaluate((f) => window.__tsWriteProbe(f, ''), from);
      await page.evaluate(() => window.__tsRecord(true));
      const before = responses.length;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i += 1)
        await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
      await page.mouse.up();
      const w = await probed(page);
      const frames = await page.evaluate(() => window.__tsRecord(false));
      const marks = await page.evaluate(() => ({
        down: window.__ts.down,
        up: window.__ts.up,
        upFrame: window.__ts.upFrame,
      }));
      const deltas = frames.slice(1).map((t, j) => t - frames[j]);
      const dragFrames = frames.filter((t) => t >= marks.down && t <= marks.up).length;
      const span = marks.up - marks.down;
      const layoutAfter = await page.evaluate(
        () =>
          document
            .querySelector('.ts-stagewrap.ts-editor .pt-slide')
            ?.getAttribute('data-layout') ??
          document.querySelector('.ts-stagewrap.ts-editor .pt-slide')?.className ??
          null,
      );
      const calls = responses
        .slice(before)
        .filter((r) => r.url.includes('/_serverFn/') || r.url.includes('/api/decks/'))
        .map((r) => ({ short: r.short, status: r.status, ms: r.ms }));
      const d = {
        label,
        dx,
        dy,
        steps,
        from,
        dragMs: span,
        framesDuringDrag: dragFrames,
        fps: span > 0 ? Math.round((dragFrames / span) * 1000) : null,
        longestFrame: deltas.length ? Math.max(...deltas) : null,
        dropToPainted: marks.upFrame - marks.up,
        dropToCommit: w.commitAt === null ? null : w.commitAt - marks.up,
        dropToAck: w.ackAt === null ? null : w.ackAt - marks.up,
        dropToSaved: w.savedAt === null ? null : w.savedAt - marks.up,
        downToSaved: w.savedAt === null ? null : w.savedAt - marks.down,
        layoutBefore,
        layoutAfter,
        calls,
      };
      out.editor.drags.push(d);
      console.log(
        `${label}: drag ${r0(span)} ms, ${dragFrames} frames (${d.fps} fps, longest ${r0(d.longestFrame)}), drop->painted ${r0(d.dropToPainted)}, drop->commit ${r0(d.dropToCommit)}, drop->ack ${r0(d.dropToAck)}, drop->saved ${r0(d.dropToSaved)}`,
      );
    };
    for (let i = 1; i <= 4; i += 1) {
      const move = await select();
      await dragBy(move, i % 2 ? 120 : -120, i % 2 ? 60 : -60, 24, `drag ${i} (${id})`);
      await sleep(700);
    }
    await select();
    const east = page
      .locator(
        `.ts-overlay [data-control="handle.${id}.resize.se"], .ts-overlay [data-control="handle.${id}.resize.e"]`,
      )
      .first();
    if ((await east.count()) > 0) {
      await dragBy(east, 80, 40, 16, `resize (${id})`);
      await sleep(700);
    }
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  // 4. New slide from the toolbar
  {
    const n = await page.locator('.ts-filmstrip .ts-card:not(.is-empty)').count();
    const from = (await state(page)).revision;
    await page.evaluate((f) => window.__tsWriteProbe(f, ''), from);
    let btn = page.locator('[data-control="toolbar.newSlide"]').first();
    if ((await btn.count()) === 0) btn = page.locator('[data-control^="toolbar.newSlide"]').first();
    const before = responses.length;
    const t = await armAndClick(
      page,
      btn,
      `() => document.querySelectorAll('.ts-filmstrip .ts-card:not(.is-empty)').length > ${n}`,
    );
    const w = await probed(page);
    const thumb = await thumbAfter(page, null);
    const calls = responses
      .slice(before)
      .filter((r) => r.url.includes('/_serverFn/') || r.url.includes('/api/decks/'))
      .map((r) => ({ short: r.short, status: r.status, ms: r.ms }));
    out.editor.newSlide = {
      cardAppear: t.ms,
      cardPainted: t.paintMs,
      commit: w.commitAt - t.down,
      ack: w.ackAt === null ? null : w.ackAt - t.down,
      saved: w.savedAt === null ? null : w.savedAt - t.down,
      thumbAfterSaved: thumb.at === null ? null : thumb.at - (w.savedAt ?? w.ackAt),
      thumbSrc: thumb.src,
      calls,
    };
    console.log(
      'new slide: card',
      r0(t.ms),
      'painted',
      r0(t.paintMs),
      'commit',
      r0(out.editor.newSlide.commit),
      'ack',
      r0(out.editor.newSlide.ack),
      'saved',
      r0(out.editor.newSlide.saved),
      'thumb',
      r0(out.editor.newSlide.thumbAfterSaved),
    );
    await sleep(800);
  }
  // 5. Duplicate slide from the Slide menu
  {
    const n = await page.locator('.ts-filmstrip .ts-card:not(.is-empty)').count();
    await page.locator('[data-control="menubar.slide"]').first().click();
    const item = page.locator('[data-control="menu.slide.duplicateSlide"]').first();
    await item.waitFor({ timeout: 10_000 });
    const from = (await state(page)).revision;
    await page.evaluate((f) => window.__tsWriteProbe(f, ''), from);
    const before = responses.length;
    const t = await armAndClick(
      page,
      item,
      `() => document.querySelectorAll('.ts-filmstrip .ts-card:not(.is-empty)').length > ${n}`,
    );
    const w = await probed(page);
    const thumb = await thumbAfter(page, null);
    const calls = responses
      .slice(before)
      .filter((r) => r.url.includes('/_serverFn/') || r.url.includes('/api/decks/'))
      .map((r) => ({ short: r.short, status: r.status, ms: r.ms }));
    out.editor.duplicate = {
      cardAppear: t.ms,
      cardPainted: t.paintMs,
      commit: w.commitAt - t.down,
      ack: w.ackAt === null ? null : w.ackAt - t.down,
      saved: w.savedAt === null ? null : w.savedAt - t.down,
      thumbAfterSaved: thumb.at === null ? null : thumb.at - (w.savedAt ?? w.ackAt),
      thumbSrc: thumb.src,
      calls,
    };
    console.log(
      'duplicate: card',
      r0(t.ms),
      'painted',
      r0(t.paintMs),
      'commit',
      r0(out.editor.duplicate.commit),
      'ack',
      r0(out.editor.duplicate.ack),
      'saved',
      r0(out.editor.duplicate.saved),
      'thumb',
      r0(out.editor.duplicate.thumbAfterSaved),
    );
    await sleep(800);
  }
  // 6. the session's network, then the title row mark to /decks (a document load?) and the card back
  const sessionMs = Date.now() - t0;
  const fn = responses.filter((r) => r.url.includes('/_serverFn/'));
  const byName = {};
  for (const r of fn) {
    const k = (r.url.match(/_serverFn\/([^/?]+)/) ?? [])[1] ?? r.short;
    byName[k] = (byName[k] ?? 0) + 1;
  }
  out.editor.session = {
    ms: sessionMs,
    requests: responses.length,
    serverFn: fn.length,
    serverFnByName: byName,
    ops: responses.filter((r) => /\/api\/decks\/[^/]+\/ops/.test(r.url)).length,
    stream: responses.filter((r) => /\/api\/decks\/[^/]+\/stream/.test(r.url)).length,
    presence: responses.filter((r) => /\/api\/decks\/[^/]+\/presence/.test(r.url)).length,
    renders: responses
      .filter((r) => r.url.includes('/api/render/'))
      .map((r) => ({ status: r.status, cache: r.cache, ms: r.ms })),
  };
  console.log(
    'session',
    out.editor.session.ms,
    'ms; requests',
    out.editor.session.requests,
    'serverFn',
    out.editor.session.serverFn,
    'ops',
    out.editor.session.ops,
    'stream',
    out.editor.session.stream,
    'renders',
    out.editor.session.renders.length,
  );
  {
    const home = page.locator('[data-control="title.home"]').first();
    await page.evaluate(() => {
      window.__tsDoc = true;
    });
    const tw = Date.now();
    await page.evaluate((src) => window.__tsArm(src), landmarkAt('/decks'));
    const before = responses.length;
    await home.click();
    await waitLandmark(page, '/decks');
    const same = await page.evaluate(() => Boolean(window.__tsDoc)).catch(() => false);
    const marks = same ? await page.evaluate(() => window.__tsArmed()) : null;
    const down = same ? await page.evaluate(() => window.__ts.down) : null;
    await sleep(1500);
    const cardImg = await page.evaluate((id) => {
      const img = document.querySelector(`[data-control="home.open.${id}"] img`);
      if (!img) return null;
      const e = performance
        .getEntriesByType('resource')
        .find((r) => r.name.includes('/api/render/') && r.name.includes(`deck=${id}`));
      return {
        complete: img.complete,
        natural: img.naturalWidth,
        ms: e ? e.responseEnd - e.startTime : null,
        wire: e ? e.transferSize : null,
      };
    }, deckId);
    out.editor.editToDecks = {
      ms: marks && down !== null ? marks.appear - down : Date.now() - tw,
      how: marks && down !== null ? 'in page' : 'wall, document navigation',
      sameDocument: same,
      homeCard: cardImg,
      cards: await page.locator('.ts-hm-card, .ts-row').count(),
      calls: responses.slice(before).filter((r) => r.url.includes('/_serverFn/')).length,
    };
    console.log(
      'edit->decks:',
      r0(out.editor.editToDecks.ms),
      out.editor.editToDecks.how,
      'cards',
      out.editor.editToDecks.cards,
      'home card',
      JSON.stringify(cardImg),
    );
    // the card to the editor: intent preload on hover first
    const card = page.locator(`[data-control="home.open.${deckId}"]`).first();
    if ((await card.count()) > 0) {
      await card.hover();
      await sleep(150);
      const t = await armAndClick(page, card, landmarkAt(`/edit/${deckId}`));
      out.editor.decksToEdit = { ms: t.ms, how: 'in page' };
      console.log('decks->edit (scratch):', r0(t.ms));
      await sleep(1000);
      const tb = Date.now();
      await page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
      await waitLandmark(page, '/decks');
      out.editor.back = { ms: Date.now() - tb, how: 'wall' };
      console.log('back:', out.editor.back.ms);
    }
  }
  await context.close();
  console.log(`SCRATCH_DECK ${deckId}`);
}

// ---------------------------------------------------------------------------------------------
async function material() {
  const context = await newContext();
  out.material = {};
  {
    const page = await context.newPage();
    await page.goto(`${BASE}/edit/${DECK}`, { waitUntil: 'commit' });
    await waitLandmark(page, `/edit/${DECK}`);
    await sleep(1500);
    const r = await page.evaluate(async (slideId) => {
      const t0 = performance.now();
      window.turboslide.studio.invoke('view.goto', { slideId }).catch(() => undefined);
      return new Promise((resolve) => {
        let canvasAt = null,
          frameAt = null,
          firstSize = null;
        const tick = () => {
          const c = document.querySelector('.ts-stagewrap canvas');
          const now = performance.now();
          if (c && canvasAt === null) {
            canvasAt = now - t0;
            firstSize = [c.width, c.height];
            requestAnimationFrame(() => {
              frameAt = performance.now() - t0;
            });
          }
          if (c && c.width > 300) {
            resolve({ canvasAt, frameAt, firstSize, sizedAt: now - t0, w: c.width, h: c.height });
            return;
          }
          if (now - t0 > 30_000) {
            resolve({ canvasAt, frameAt, firstSize, sizedAt: null, timedOut: true });
            return;
          }
          setTimeout(tick, 4);
        };
        tick();
      });
    }, 'opener-blog');
    out.material.gotoInEditor = r;
    console.log(
      'view.goto opener-blog: canvas',
      r0(r.canvasAt),
      'frame',
      r0(r.frameAt),
      'first size',
      JSON.stringify(r.firstSize),
      'sized',
      r0(r.sizedAt),
      r.w,
      'x',
      r.h,
    );
    await page.close();
  }
  for (const route of [`/edit/${DECK}#s/opener-blog`, `/deck/${DECK}#s/opener-blog`]) {
    const page = await context.newPage();
    const plain = route.split('#')[0];
    const t0 = Date.now();
    await page.goto(`${BASE}${route}`, { waitUntil: 'commit' });
    await waitLandmark(page, plain);
    await page
      .waitForFunction(() => Boolean(document.querySelector('.ts-stagewrap canvas')), null, {
        timeout: 15_000,
      })
      .catch(() => undefined);
    await sleep(1500);
    const r = await page.evaluate(() => ({
      studio: window.__ts.studioAt,
      recipe: window.__ts.firstDom['[data-recipe]'] ?? null,
      settled: window.__ts.settledAt,
      canvas: window.__ts.firstDom['.ts-stagewrap canvas'] ?? null,
      lcp: window.__ts.lcp?.t ?? null,
      lcpEl: window.__ts.lcp?.el ?? null,
      slide:
        document
          .querySelector('.ts-stagewrap .pt-slide, .pt-viewer .pt-slide')
          ?.getAttribute('data-slide-id') ?? null,
      hash: location.hash,
    }));
    out.material[route] = { ...r, wall: Date.now() - t0 };
    console.log(route, JSON.stringify(r));
    await page.close();
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------
async function idle() {
  const seconds = Number(opt('--seconds', '60'));
  const context = await newContext();
  const page = await context.newPage();
  const responses = track(page);
  const streams = [];
  page.on('request', (req) => {
    if (/\/api\/decks\/[^/]+\/stream/.test(req.url()))
      streams.push({ at: Date.now(), url: req.url().replace(BASE, '').slice(0, 80) });
  });
  await page.goto(`${BASE}/edit/${DECK}`, { waitUntil: 'commit' });
  await waitLandmark(page, `/edit/${DECK}`);
  await sleep(5000);
  const start = responses.length;
  const sStart = streams.length;
  const m0 = await pageMetrics(page);
  const t0 = Date.now();
  await sleep(seconds * 1000);
  const win = responses.slice(start).filter((r) => r.at - t0 >= 0);
  const cat = (re) => win.filter((r) => re.test(r.url));
  const fn = cat(/\/_serverFn\//);
  const byName = {};
  for (const r of fn) {
    const k = (r.url.match(/_serverFn\/([^/?]+)/) ?? [])[1] ?? r.short;
    byName[k] = (byName[k] ?? 0) + 1;
  }
  const m1 = await pageMetrics(page);
  out.idle = {
    seconds,
    serverFn: fn.length,
    serverFnPerMinute: (fn.length / seconds) * 60,
    serverFnByName: byName,
    streamRequests: streams.length - sStart,
    streamPerMinute: ((streams.length - sStart) / seconds) * 60,
    streamResponses: cat(/\/api\/decks\/[^/]+\/stream/).length,
    presence: cat(/\/api\/decks\/[^/]+\/presence/).length,
    ops: cat(/\/api\/decks\/[^/]+\/ops/).length,
    renders: cat(/\/api\/render\//).length,
    other: win.length - fn.length - cat(/\/api\/decks\//).length - cat(/\/api\/render\//).length,
    total: win.length,
    metricsAtStart: m0,
    metricsAtEnd: m1,
  };
  console.log(JSON.stringify(out.idle));
  await context.close();
}

// ---------------------------------------------------------------------------------------------
async function cleanup() {
  const ids = (opt('--ids', '') ?? '').split(',').filter(Boolean);
  const context = await newContext();
  const page = await context.newPage();
  out.cleanup = [];
  for (const id of ids) {
    const row = { id };
    await page.goto(`${BASE}/decks`, { waitUntil: 'commit' });
    await waitLandmark(page, '/decks');
    await sleep(800);
    const more = page.locator(`[data-control="home.more.${id}"]`).first();
    if ((await more.count()) > 0) {
      await more.click();
      const item = page.locator('[data-control="menu.home.card.trash"]').first();
      await item.waitFor({ timeout: 10_000 });
      const t = await armAndClick(
        page,
        item,
        `() => { const c = document.querySelector('[data-control="home.card.${id}"]'); return !c || c.getClientRects().length === 0 || c.hidden; }`,
      );
      row.moveToTrashMs = t.ms;
      await sleep(1500);
    } else row.moveToTrash = 'card absent on /decks';
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'commit' });
    await waitLandmark(page, '/decks/trash');
    await sleep(800);
    const del = page.locator(`[data-control="trash.delete.${id}"]`).first();
    if ((await del.count()) > 0) {
      await del.click();
      const ok = page.locator('[data-control="trash.confirm.ok"]').first();
      await ok.waitFor({ timeout: 10_000 });
      const t = await armAndClick(
        page,
        ok,
        `() => !document.querySelector('[data-control="trash.card.${id}"]')`,
      );
      row.deleteForeverMs = t.ms;
      await sleep(1500);
      row.stillInTrash = (await page.locator(`[data-control="trash.card.${id}"]`).count()) > 0;
    } else row.deleteForever = 'card absent on /decks/trash';
    const probe = await context.request.get(`${BASE}/deck/${encodeURIComponent(id)}`);
    row.probeStatus = probe.status();
    out.cleanup.push(row);
    console.log(JSON.stringify(row));
  }
  await context.close();
}

try {
  if (cmd === 'routes') await routes();
  else if (cmd === 'extras') await extras();
  else if (cmd === 'editor') await editor();
  else if (cmd === 'material') await material();
  else if (cmd === 'idle') await idle();
  else if (cmd === 'cleanup') await cleanup();
  else throw new Error(`unknown command ${cmd}`);
} catch (error) {
  out.error = String(error && error.stack ? error.stack : error);
  console.error(out.error);
} finally {
  await browser.close();
}
out.finishedAt = new Date().toISOString();
if (OUT) {
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`wrote ${OUT}`);
}

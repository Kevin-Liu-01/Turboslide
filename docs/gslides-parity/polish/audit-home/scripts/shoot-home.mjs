// The home page audit shoot (polish round, auditor "home"): production /home at 1440 by 900,
// 1280 by 800 and 390 by 844, dark and light, device scale factor 2, reduced motion off (the
// page animates nothing), a human paced scroll, a full page shot (css scale), the fold, one
// crop per section, the copy as innerText, the measured boxes, paddings and type sizes, the
// load numbers (first byte, LCP entries, CLS entries, long animation frames, bytes by kind
// before and after the scroll). Nothing is written to the product; no deck is created here
// (the drive script does that separately).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '/Users/kevinliu/repos/Turboslide-live/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE ?? 'https://www.turboslide.com';
const OUT =
  process.env.OUT ?? '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-home';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 390, h: 844 },
];
const THEMES = ['dark', 'light'];

const SECTIONS = [
  ['nav', 'header.ts-product-nav'],
  ['hero', 'section.ts-product-hero'],
  ['credit', 'p.ts-product-credit'],
  ['editor', 'section[aria-labelledby="ts-product-h-editor"]'],
  ['cards', 'section[aria-labelledby="ts-product-h-features"]'],
  ['numbers', 'section.ts-product-numbers-band'],
  ['dithers', 'section[aria-labelledby="ts-product-h-dither"]'],
  ['speed', 'section[aria-labelledby="ts-product-h-fast"]'],
  ['agents', 'section#agents'],
  ['compare', 'section[aria-labelledby="ts-product-h-compare"]'],
  ['footer', 'footer.ts-product-footer'],
];

const OBSERVERS = `
  window.__lcp = []; window.__cls = []; window.__loaf = [];
  const tag = (n) => n ? (n.tagName + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').join('.') : '') + (n.getAttribute && n.getAttribute('data-shot') ? '[' + n.getAttribute('data-shot') + ']' : '')) : '';
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), size: e.size, el: tag(e.element), url: e.url || '' }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).map((s) => tag(s.node)).slice(0, 4) }); }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
`;

function resourcesByKind() {
  const kinds = {};
  for (const r of performance.getEntriesByType('resource')) {
    const url = new URL(r.name);
    const ext = (url.pathname.split('.').pop() || '').toLowerCase();
    const kind = /^(js|mjs)$/.test(ext)
      ? 'js'
      : /^(css)$/.test(ext)
        ? 'css'
        : /^(woff2|woff|ttf)$/.test(ext)
          ? 'font'
          : /^(png|jpg|jpeg|webp|avif|svg|gif|ico)$/.test(ext)
            ? 'image'
            : r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest'
              ? 'fetch'
              : 'other';
    const k = (kinds[kind] ??= { count: 0, transfer: 0, decoded: 0, files: [] });
    k.count += 1;
    k.transfer += r.transferSize || 0;
    k.decoded += r.decodedBodySize || 0;
    k.files.push({
      path: url.pathname.slice(0, 90),
      transfer: r.transferSize || 0,
      decoded: r.decodedBodySize || 0,
      start: Math.round(r.startTime),
      end: Math.round(r.responseEnd),
    });
  }
  return kinds;
}

function measurePage(sections) {
  const cs = (el, props) => {
    const s = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = s.getPropertyValue(p);
    return o;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top + scrollY),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const out = { page: { height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, innerWidth, scrollWidthOverflow: document.documentElement.scrollWidth > innerWidth }, sections: [] };
  for (const [name, sel] of sections) {
    const el = document.querySelector(sel);
    if (!el) {
      out.sections.push({ name, missing: true });
      continue;
    }
    const entry = { name, box: box(el), style: cs(el, ['padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'border-bottom-width', 'border-top-width', 'background-color']) };
    const head = el.querySelector('.ts-product-band-head');
    if (head) entry.bandHead = { box: box(head), style: cs(head, ['margin-bottom', 'gap', 'grid-template-columns']) };
    const h = el.querySelector('h1, h2');
    if (h) entry.heading = { text: h.textContent.trim(), box: box(h), style: cs(h, ['font-size', 'line-height', 'font-weight', 'letter-spacing', 'font-family']) };
    const lead = el.querySelector('.ts-product-lead');
    if (lead) {
      const fs = parseFloat(getComputedStyle(lead).fontSize);
      entry.lead = { text: lead.textContent.trim().slice(0, 80), box: box(lead), style: cs(lead, ['font-size', 'line-height', 'color']), approxCharsPerLine: Math.round(box(lead).width / (fs * 0.48)), words: lead.textContent.trim().split(/\s+/).length };
    }
    const h3s = [...el.querySelectorAll('h3')];
    if (h3s.length) entry.h3 = { count: h3s.length, style: cs(h3s[0], ['font-size', 'line-height', 'font-weight']), first: h3s[0].textContent.trim() };
    const body = el.querySelector('.ts-product-card-copy, .ts-product-row-body, .ts-product-agent-sentence, .ts-product-claims p, td');
    if (body) {
      const fs = parseFloat(getComputedStyle(body).fontSize);
      entry.body = { box: box(body), style: cs(body, ['font-size', 'line-height', 'color']), approxCharsPerLine: Math.round(box(body).width / (fs * 0.48)) };
    }
    const text = el.innerText || '';
    entry.words = text.trim().split(/\s+/).filter(Boolean).length;
    entry.imgs = [...el.querySelectorAll('img')].map((i) => ({ shot: i.getAttribute('data-shot'), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), natural: i.naturalWidth + 'x' + i.naturalHeight, current: (i.currentSrc || '').split('/').pop(), complete: i.complete, visible: i.getBoundingClientRect().width > 0 }));
    entry.svgs = el.querySelectorAll('svg').length;
    out.sections.push(entry);
  }
  // the ladder as rendered
  const ladder = {};
  for (const [k, sel] of [['h1', '.ts-product-h1'], ['hero-sentence', '.ts-product-hero-sentence'], ['h2', '.ts-product-h2'], ['h3', '.ts-product-h3'], ['lead', '.ts-product-band-head .ts-product-lead'], ['body', '.ts-product-card-copy'], ['small', '.ts-product-number-line'], ['source', '.ts-product-source'], ['figure', '.ts-product-figure'], ['caption', '.ts-product-caption'], ['cmd', '.ts-product-cmd'], ['table-td', '.ts-product-table td'], ['foot-link', '.ts-product-foot-link'], ['cta', '.ts-product-cta .pt-ib'], ['nav-link', '.ts-product-nav-link']]) {
    const el = document.querySelector(sel);
    if (el) ladder[k] = { ...cs(el, ['font-size', 'line-height', 'font-weight', 'letter-spacing', 'color']), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) };
  }
  out.ladder = ladder;
  // gaps between consecutive sections (bottom of one to top of the next)
  const boxes = out.sections.filter((s) => !s.missing).map((s) => ({ name: s.name, top: s.box.top, bottom: s.box.top + s.box.height }));
  out.gaps = boxes.slice(1).map((b, i) => ({ from: boxes[i].name, to: b.name, gap: b.top - boxes[i].bottom }));
  // the hero plate
  const plate = document.querySelector('.ts-product-plate');
  if (plate) out.plate = { box: box(plate), style: cs(plate, ['padding', 'width', 'left', 'bottom', 'border-width', 'background-color']) };
  const cta = document.querySelector('.ts-product-cta');
  if (cta) out.cta = { box: box(cta), buttons: [...cta.querySelectorAll('.pt-ib')].map((b) => ({ text: b.textContent.trim(), ...box(b) })) };
  const grid = document.querySelector('.ts-product-grid');
  if (grid) out.cards = [...grid.querySelectorAll('.ts-product-card')].map((c) => ({ id: c.getAttribute('data-card'), ...box(c), words: (c.querySelector('.ts-product-card-copy')?.textContent || '').trim().split(/\s+/).length, figH: Math.round(c.querySelector('.ts-product-card-fig')?.getBoundingClientRect().height || 0) }));
  const numbers = document.querySelector('.ts-product-numbers');
  if (numbers) out.numbers = [...numbers.querySelectorAll('.ts-product-number')].map((c) => ({ id: c.getAttribute('data-figure'), ...box(c), figure: c.querySelector('.ts-product-figure')?.textContent.trim(), figureWidth: Math.round(c.querySelector('.ts-product-figure')?.getBoundingClientRect().width || 0), sourceLines: Math.round((c.querySelector('.ts-product-source')?.getBoundingClientRect().height || 0) / 18) }));
  const rows = document.querySelector('.ts-product-rows');
  if (rows) out.speedRows = [...rows.querySelectorAll('.ts-product-row')].map((r) => ({ id: r.getAttribute('data-row'), ...box(r), bodyWords: (r.querySelector('.ts-product-row-body')?.textContent || '').trim().split(/\s+/).length }));
  const table = document.querySelector('.ts-product-table');
  if (table) out.table = { ...box(table), scrollBox: box(document.querySelector('.ts-product-table-scroll')), rows: table.querySelectorAll('tbody tr').length, cols: [...table.querySelectorAll('thead th')].map((t) => Math.round(t.getBoundingClientRect().width)) };
  out.fonts = { inter500_20: document.fonts.check('500 20px Inter'), inter400_15: document.fonts.check('400 15px Inter'), loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight).slice(0, 8) };
  out.theme = document.documentElement.getAttribute('data-theme');
  out.themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
  out.title = document.title;
  out.ink = getComputedStyle(document.documentElement).getPropertyValue('--pt-ink').trim();
  out.hydrated = document.querySelector('main.ts-product')?.hasAttribute('data-hydrated');
  return out;
}

async function humanScroll(page, step = 640, pause = 220) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < height - vh; y += step) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(pause);
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
}

const browser = await chromium.launch({ headless: true });
const record = {};
try {
  for (const theme of THEMES) {
    for (const { w, h } of VIEWPORTS) {
      const key = `${theme}-${w}`;
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 2,
        isMobile: w < 760,
        hasTouch: w < 760,
        colorScheme: theme,
      });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('gt-theme', t);
        } catch {}
      }, theme);
      await context.addInitScript(OBSERVERS);
      const page = await context.newPage();
      const t0 = Date.now();
      const response = await page.goto(`${BASE}/home`, { waitUntil: 'load' });
      const loadMs = Date.now() - t0;
      await page.waitForSelector('main.ts-product[data-hydrated]', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize, decoded: n.decodedBodySize } : null;
      });
      const before = await page.evaluate(resourcesByKind);
      const lcpBefore = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, loaf: window.__loaf }));
      await page.screenshot({ path: join(OUT, `${key}-01-fold.png`) });
      await humanScroll(page);
      await page.waitForTimeout(500);
      const after = await page.evaluate(resourcesByKind);
      const perf = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, clsTotal: +window.__cls.reduce((a, e) => a + e.v, 0).toFixed(4), loaf: window.__loaf }));
      const measure = await page.evaluate(measurePage, SECTIONS);
      await page.screenshot({ path: join(OUT, `${key}-00-full.png`), fullPage: true, scale: 'css' });
      for (const [name, sel] of SECTIONS) {
        const loc = page.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        try {
          await loc.scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
          await loc.screenshot({ path: join(OUT, `${key}-10-${name}.png`) });
        } catch (error) {
          console.log(`crop ${key} ${name} failed: ${error.message.split('\n')[0]}`);
        }
      }
      if (theme === 'dark' && w === 1440) {
        const copy = await page.evaluate((sections) => sections.map(([name, sel]) => `## ${name}\n\n${(document.querySelector(sel)?.innerText || '').trim()}`).join('\n\n'), SECTIONS);
        writeFileSync(join(OUT, 'copy-as-rendered.txt'), copy);
        const alts = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => `${i.getAttribute('data-shot')}: ${i.alt}`).join('\n'));
        writeFileSync(join(OUT, 'alt-text.txt'), alts);
      }
      record[key] = { status: response?.status(), loadMs, nav, perfBeforeScroll: lcpBefore, perf, bytes: { before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { count: v.count, transfer: v.transfer, decoded: v.decoded }])), after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { count: v.count, transfer: v.transfer, decoded: v.decoded }])) }, jsFiles: after.js?.files ?? [], imageFiles: after.image?.files ?? [], measure };
      console.log(`${key}: status ${response?.status()} load ${loadMs} ms, ttfb ${nav?.ttfb}, page ${measure.page.height} px, overflow ${measure.page.scrollWidthOverflow}, LCP ${JSON.stringify(perf.lcp.at(-1))}, CLS ${perf.clsTotal}, js ${after.js?.decoded ?? 0} B decoded, images after scroll ${after.image?.transfer ?? 0} B`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'shoot-record.json'), JSON.stringify(record, null, 2));
console.log('done');

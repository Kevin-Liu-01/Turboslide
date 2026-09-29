// The home page shoot of the polish round's B7 lane (docs/POLISH.md section 3): /home on a
// running studio at 1440 by 900, 1280 by 800 and 390 by 844, dark and light, device scale
// factor 2, a human paced scroll, the full page (css scale), the fold, one crop per top level
// block of `main.ts-product` (the navigation, every section, the footer), the copy as innerText,
// the measured boxes and the load numbers (first byte, LCP entries, layout shift entries, long
// animation frames, bytes by kind before and after the scroll). Nothing is written to the
// product; no deck is created. The caller holds .turboslide/e2e.lock (AGENTS.md dev server rules).
//
//   BASE=http://localhost:4447 OUT=docs/gslides-parity/polish/build/b7/after node docs/gslides-parity/polish/build/b7/scripts/shoot-home.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE ?? 'http://localhost:4447').replace(/\/$/, '');
const OUT = resolve(process.env.OUT ?? 'docs/gslides-parity/polish/build/b7/after');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 390, h: 844 },
];
const THEMES = ['dark', 'light'];

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
    const kind = /^(js|mjs|ts|tsx)$/.test(ext)
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

/** The top level blocks of the page, named by data-band or the tag, in document order. */
function blocksOf() {
  const main = document.querySelector('main.ts-product');
  if (!main) return [];
  const out = [];
  let index = 0;
  for (const el of main.children) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.tagName === 'SCRIPT') continue;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) continue;
    const name =
      el.getAttribute('data-band') ??
      (el.tagName === 'HEADER'
        ? 'nav'
        : el.tagName === 'FOOTER'
          ? 'footer'
          : el.tagName === 'SECTION'
            ? el.className.includes('hero')
              ? 'hero'
              : `section-${index}`
            : `${el.tagName.toLowerCase()}-${index}`);
    el.setAttribute('data-shoot-block', name);
    out.push(name);
    index += 1;
  }
  return out;
}

function measurePage() {
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
  const out = {
    page: {
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      innerWidth,
      scrollWidthOverflow: document.documentElement.scrollWidth > innerWidth,
    },
    blocks: [],
  };
  for (const el of document.querySelectorAll('[data-shoot-block]')) {
    const entry = {
      name: el.getAttribute('data-shoot-block'),
      box: box(el),
      style: cs(el, ['padding-top', 'padding-bottom', 'border-bottom-width', 'border-top-width']),
    };
    const h = el.querySelector('h1, h2');
    if (h)
      entry.heading = {
        text: h.textContent.trim(),
        box: box(h),
        style: cs(h, ['font-size', 'line-height', 'font-weight', 'letter-spacing']),
      };
    const lead = el.querySelector('.ts-product-lead');
    if (lead)
      entry.lead = {
        text: lead.textContent.trim().slice(0, 80),
        box: box(lead),
        style: cs(lead, ['font-size', 'line-height', 'color', 'max-width']),
      };
    if (h && lead) entry.headingToLead = box(lead).top - (box(h).top + box(h).height);
    const two = el.querySelector('.ts-product-two');
    if (two) entry.two = { style: cs(two, ['grid-template-columns', 'gap', 'align-items']) };
    const fig = el.querySelector('figure');
    if (fig)
      entry.figure = { box: box(fig), style: cs(fig, ['border-top-width', 'border-top-color']) };
    entry.words = (el.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    entry.imgs = [...el.querySelectorAll('img')].map((i) => ({
      shot: i.getAttribute('data-shot'),
      w: Math.round(i.getBoundingClientRect().width),
      h: Math.round(i.getBoundingClientRect().height),
      natural: i.naturalWidth + 'x' + i.naturalHeight,
      current: (i.currentSrc || '').split('/').pop(),
      complete: i.complete,
      loading: i.getAttribute('loading'),
      visible: i.getBoundingClientRect().width > 0,
    }));
    entry.svgs = [...el.querySelectorAll('svg[role="img"]')].map((s) => ({
      label: s.getAttribute('aria-label'),
      w: Math.round(s.getBoundingClientRect().width),
      h: Math.round(s.getBoundingClientRect().height),
      bytes: s.outerHTML.length,
    }));
    out.blocks.push(entry);
  }
  const boxes = out.blocks.map((b) => ({
    name: b.name,
    top: b.box.top,
    bottom: b.box.top + b.box.height,
  }));
  out.gaps = boxes
    .slice(1)
    .map((b, i) => ({ from: boxes[i].name, to: b.name, gap: b.top - boxes[i].bottom }));
  const cta = document.querySelector('.ts-product-cta');
  if (cta)
    out.cta = {
      box: box(cta),
      buttons: [...cta.querySelectorAll('a, button')].map((b) => ({
        text: b.textContent.trim(),
        ...box(b),
      })),
    };
  const ladder = {};
  for (const [k, sel] of [
    ['h1', 'main h1'],
    ['h2', 'main h2'],
    ['lead', '.ts-product-lead'],
    ['cmd', '.ts-product-cmd'],
    ['small', '.ts-product-small'],
    ['foot-link', '.ts-product-foot-link'],
    ['cta', '.ts-product-cta .pt-ib'],
    ['nav-link', '.ts-product-nav-link'],
  ]) {
    const el = document.querySelector(sel);
    if (el)
      ladder[k] = {
        ...cs(el, [
          'font-size',
          'line-height',
          'font-weight',
          'letter-spacing',
          'color',
          'font-family',
        ]),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      };
  }
  out.ladder = ladder;
  out.fonts = {
    inter500_20: document.fonts.check('500 20px Inter'),
    inter400_15: document.fonts.check('400 15px Inter'),
  };
  out.theme = document.documentElement.getAttribute('data-theme');
  out.themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
  out.title = document.title;
  out.hydrated = document.querySelector('main.ts-product')?.hasAttribute('data-hydrated');
  out.pressed = [...document.querySelectorAll('[data-control^="home.theme."]')].map(
    (b) => `${b.getAttribute('data-control')}=${b.getAttribute('aria-pressed')}`,
  );
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
      await page.waitForSelector('main.ts-product[data-hydrated]', { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return n
          ? {
              ttfb: Math.round(n.responseStart),
              domContentLoaded: Math.round(n.domContentLoadedEventEnd),
              load: Math.round(n.loadEventEnd),
              transfer: n.transferSize,
              decoded: n.decodedBodySize,
            }
          : null;
      });
      const before = await page.evaluate(resourcesByKind);
      const perfBefore = await page.evaluate(() => ({
        lcp: window.__lcp,
        cls: window.__cls,
        loaf: window.__loaf,
      }));
      await page.screenshot({ path: join(OUT, `${key}-01-fold.png`) });
      await humanScroll(page);
      await page.waitForTimeout(500);
      const after = await page.evaluate(resourcesByKind);
      const perf = await page.evaluate(() => ({
        lcp: window.__lcp,
        cls: window.__cls,
        clsTotal: +window.__cls.reduce((a, e) => a + e.v, 0).toFixed(4),
        loaf: window.__loaf,
      }));
      const blocks = await page.evaluate(blocksOf);
      const measure = await page.evaluate(measurePage);
      await page.screenshot({
        path: join(OUT, `${key}-00-full.png`),
        fullPage: true,
        scale: 'css',
      });
      for (const name of blocks) {
        const loc = page.locator(`[data-shoot-block="${name}"]`).first();
        try {
          await loc.scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
          await loc.screenshot({ path: join(OUT, `${key}-10-${name}.png`) });
        } catch (error) {
          console.log(`crop ${key} ${name} failed: ${error.message.split('\n')[0]}`);
        }
      }
      if (theme === 'dark' && w === 1440) {
        const copy = await page.evaluate(() =>
          [...document.querySelectorAll('[data-shoot-block]')]
            .map(
              (el) => `## ${el.getAttribute('data-shoot-block')}\n\n${(el.innerText || '').trim()}`,
            )
            .join('\n\n'),
        );
        writeFileSync(join(OUT, 'copy-as-rendered.txt'), copy);
        const alts = await page.evaluate(() =>
          [...document.querySelectorAll('img, svg[role="img"]')]
            .map(
              (i) =>
                `${i.getAttribute('data-shot') ?? i.tagName.toLowerCase()}: ${i.getAttribute('alt') ?? i.getAttribute('aria-label') ?? ''}`,
            )
            .join('\n'),
        );
        writeFileSync(join(OUT, 'alt-text.txt'), alts);
      }
      record[key] = {
        status: response?.status(),
        loadMs,
        nav,
        perfBeforeScroll: perfBefore,
        perf,
        bytes: {
          before: Object.fromEntries(
            Object.entries(before).map(([k, v]) => [
              k,
              { count: v.count, transfer: v.transfer, decoded: v.decoded },
            ]),
          ),
          after: Object.fromEntries(
            Object.entries(after).map(([k, v]) => [
              k,
              { count: v.count, transfer: v.transfer, decoded: v.decoded },
            ]),
          ),
        },
        imageFiles: after.image?.files ?? [],
        measure,
      };
      console.log(
        `${key}: status ${response?.status()} load ${loadMs} ms, ttfb ${nav?.ttfb}, page ${measure.page.height} px, overflow ${measure.page.scrollWidthOverflow}, LCP ${JSON.stringify(perf.lcp.at(-1))}, CLS ${perf.clsTotal}, images before scroll ${before.image?.transfer ?? 0} B, after ${after.image?.transfer ?? 0} B, blocks ${blocks.join(',')}`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'shoot-record.json'), JSON.stringify(record, null, 2));
console.log('done');

// Judge 3 audit: one short browser run per direction and size.
// usage: node audit.mjs <a|b|c> <1440|390> [light|dark] [reduce]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');

const [dir, size = '1440', theme = 'light', rm = ''] = process.argv.slice(2);
const W = Number(size), H = W === 390 ? 844 : 900;
const url = `file:///Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-${dir}/index.html`;
const load = () => execSync('uptime').toString().trim().split('averages:')[1];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, colorScheme: theme,
  reducedMotion: rm === 'reduce' ? 'reduce' : 'no-preference',
  hasTouch: W === 390, isMobile: W === 390,
});
await ctx.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__raf = 0;
  window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); };
});
const page = await ctx.newPage();
const errs = [], reqs = [];
page.on('pageerror', e => errs.push('pageerror ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) reqs.push(r.url()); });
const out = { dir, W, theme, rm, loadStart: load() };
await page.goto(url);
await page.waitForTimeout(rm === 'reduce' ? 600 : 6500);

out.text = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    words: t.split(/\s+/).filter(Boolean).length,
    emDash: (t.match(/—/g) || []).length,
    enDash: (t.match(/–/g) || []).length,
    bang: (t.match(/!/g) || []).length,
    bangCtx: [...t.matchAll(/.{0,30}!.{0,10}/g)].map(m => m[0]).slice(0, 5),
    realtime: /realtime/i.test(t),
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().replace(/\s+/g, ' ')),
    h2: [...document.querySelectorAll('h2')].map(h => h.textContent.trim().replace(/\s+/g, ' ')),
    headingPeriod: [...document.querySelectorAll('h1,h2,h3')].filter(h => /\.\s*$/.test(h.textContent.trim())).map(h => h.textContent.trim()),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    viewportMeta: document.querySelector('meta[name=viewport]')?.content,
    userSelectBody: getComputedStyle(document.body).userSelect,
    title: document.title,
    lang: document.documentElement.lang,
  };
});

out.fonts = await page.evaluate(() => {
  const mono = [], other = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
    const ff = cs.fontFamily;
    if (/mono|Menlo|Consolas/i.test(ff.split(',')[0])) {
      // find the nearest opaque background
      let p = el, bg = '';
      while (p) { const b = getComputedStyle(p).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && !b.endsWith(', 0)')) { bg = b; break; } p = p.parentElement; }
      mono.push(bg);
    } else if (!/^"?Inter/i.test(ff)) other.add(ff.slice(0, 60));
  }
  const monoBgs = {}; mono.forEach(b => monoBgs[b] = (monoBgs[b] || 0) + 1);
  return { monoBgs, nonInter: [...other] };
});

// colours at rest: chromatic colours in use
out.colours = await page.evaluate(() => {
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; };
  const sat = ({ r, g, b }) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const found = {};
  for (const el of document.querySelectorAll('body *')) {
    const rr = el.getBoundingClientRect(); if (!rr.width || !rr.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    for (const p of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'fill', 'stroke']) {
      const v = cs[p]; const c = v && parse(v); if (!c || c.a === 0) continue;
      if (p === 'color' && !el.textContent.trim()) continue;
      if (p.startsWith('border') && parseFloat(cs.borderTopWidth) === 0) continue;
      if (p === 'outlineColor' && cs.outlineStyle === 'none') continue;
      if ((p === 'fill' || p === 'stroke') && !(el instanceof SVGElement)) continue;
      if (sat(c) > 0.25 && Math.max(c.r, c.g, c.b) > 40) {
        const k = `rgb(${c.r},${c.g},${c.b}) ${p}`;
        (found[k] ||= []).push((el.className?.baseVal ?? el.className ?? el.tagName).toString().slice(0, 40) || el.tagName);
      }
    }
  }
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, { n: v.length, ex: [...new Set(v)].slice(0, 4) }]));
});

// contrast of text against its nearest opaque background (alpha blended)
out.contrast = await page.evaluate(() => {
  const parse = s => { const m = s && s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = el => {
    const stack = []; let p = el;
    while (p) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } if (getComputedStyle(p).backgroundImage !== 'none' && p !== el) {} p = p.parentElement; }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor); if (bodyBg && bodyBg.a === 1) base = bodyBg;
    for (let i = stack.length - 1; i >= 0; i--) base = stack[i].a >= 1 ? stack[i] : blend(stack[i], base);
    return base;
  };
  const low = [];
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('canvas')) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const bg = bgOf(el); const fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), wt = +cs.fontWeight; const large = px >= 24 || (px >= 18.66 && wt >= 700);
    n++;
    if (cr < (large ? 3 : 4.5)) low.push({ t: el.textContent.trim().slice(0, 40), cr: +cr.toFixed(2), px, cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 30), inSlide: !!el.closest('[class*=slide],[class*=sheet],[class*=sl-],[data-deck],.thumb') });
  }
  low.sort((a, b) => a.cr - b.cr);
  return { checked: n, below: low.length, belowOutsideSlides: low.filter(l => !l.inSlide).length, worst: low.slice(0, 14) };
});

// accessible names
out.names = await page.evaluate(() => {
  const nameless = [];
  for (const el of document.querySelectorAll('button, a[href], [role=button], [role=slider], input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || (el.labels && el.labels[0]?.textContent) || '').trim();
    if (!name) nameless.push(el.outerHTML.slice(0, 100));
  }
  const canvases = [...document.querySelectorAll('canvas')].map(c => ({ hidden: c.getAttribute('aria-hidden'), role: c.getAttribute('role'), label: c.getAttribute('aria-label') || (c.closest('[aria-label]')?.getAttribute('aria-label') || '').slice(0, 40) }));
  const imgs = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
  const live = [...document.querySelectorAll('[aria-live],[role=status],[role=log],[role=alert]')].map(e => (e.getAttribute('aria-live') || e.getAttribute('role')) + ':' + (e.className || e.id).toString().slice(0, 30));
  return { nameless: nameless.slice(0, 8), namelessN: nameless.length, canvases, imgsNoAlt: imgs, live };
});

// keyboard: tab order with visible focus
await page.evaluate(() => window.scrollTo(0, 0));
await page.mouse.click(2, H - 2).catch(() => {});
await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
const tabs = [];
for (let i = 0; i < 45; i++) {
  await page.keyboard.press('Tab');
  const t = await page.evaluate(() => {
    const el = document.activeElement; if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    let ringAfter = false;
    for (const pse of ['::before', '::after']) { const p = getComputedStyle(el, pse); if (p.content !== 'none' && (p.outlineStyle !== 'none' || (p.boxShadow && p.boxShadow !== 'none') || p.borderTopStyle !== 'none')) ringAfter = true; }
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 34), ring: ring || ringAfter, outline: cs.outlineColor + ' ' + cs.outlineWidth, inView: r.top >= -5 && r.bottom <= innerHeight + 5, w: Math.round(r.width), h: Math.round(r.height) };
  });
  tabs.push(t);
}
out.tabs = tabs;
out.tabNoRing = tabs.filter(t => t && !t.ring).map(t => t.tag + ':' + t.name);

// idle cost and animations at the top, then after a native scroll to the bottom
out.rafTop = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 2000)); return { perSec: (window.__raf - a) / 2, anims: document.getAnimations().filter(x => x.playState === 'running').length }; });
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(rm === 'reduce' ? 120 : 260); }
await page.waitForTimeout(1500);
out.afterScroll = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 2000)); return { perSec: (window.__raf - a) / 2, running: document.getAnimations().filter(x => x.playState === 'running').map(x => (x.animationName || x.transitionProperty || x.constructor.name) + ':' + (x.effect?.target?.className?.toString?.() || '').slice(0, 24)).slice(0, 8), total: document.getAnimations().length }; });
out.height = total;
out.overflowX = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
if (W === 390) {
  out.smallTargets = await page.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input, [role=slider]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) + ` ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).slice(0, 12));
}
out.errs = errs; out.netRequests = reqs; out.loadEnd = load();
console.log(JSON.stringify(out, null, 1));
await browser.close();

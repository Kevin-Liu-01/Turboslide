// Motion capture harness: screencast frames with swap timestamps, CDP animation starts with
// their declared timing, main thread time per phase, bytes by type, LCP and CLS.
// usage: node capture.mjs <job.json>   (job: { key, url, viewport?, phases: [...], reduced?: bool })
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');

const SCRATCH = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/frames';
const RAW = '/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/motion/raw';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const reduced = !!job.reduced;
const tag = job.key + (reduced ? '-reduced' : '');
const outDir = path.join(SCRATCH, tag);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const vp = job.viewport ?? { width: 1440, height: 900 };
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({
  viewport: vp,
  deviceScaleFactor: 1,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
  colorScheme: job.colorScheme ?? 'light',
  locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
});
await context.addInitScript(() => {
  window.__m = { lcp: null, cls: 0, raf: 0, ctx: [], longtasks: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const el = e.element;
        window.__m.lcp = { t: Math.round(e.startTime), size: e.size, url: e.url || '', el: el ? (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) : '' };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  } catch {}
  window.__m.anims = [];
  const seen = new WeakSet();
  const desc = (t) => { if (!t) return ''; const el = t.element || t; if (!el || !el.tagName) return ''; let d = el.tagName.toLowerCase(); if (el.id) d += '#' + el.id; const c = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''; if (c) d += '.' + c.trim().split(/\s+/).slice(0, 2).join('.'); if (t.pseudoElement) d += t.pseudoElement; return d.slice(0, 90); };
  const skip = ['offset', 'computedOffset', 'easing', 'composite'];
  const sample = () => {
    try {
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue; seen.add(a);
        if (window.__m.anims.length > 4000) return;
        const e = a.effect; const tim = e ? e.getTiming() : {}; const kf = e && e.getKeyframes ? e.getKeyframes() : [];
        const clean = (k) => k ? Object.fromEntries(Object.entries(k).filter(([x]) => !skip.includes(x))) : {};
        window.__m.anims.push({ wall: Date.now(), type: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '', target: desc(e && e.target ? (e.pseudoElement ? { element: e.target, pseudoElement: e.pseudoElement } : e.target) : null), duration: typeof tim.duration === 'number' ? Math.round(tim.duration) : String(tim.duration), delay: Math.round(tim.delay || 0), iterations: tim.iterations, easing: tim.easing, kfEasing: kf.map((k) => k.easing).find((x) => x && x !== 'linear') || '', props: [...new Set(kf.flatMap((k) => Object.keys(clean(k))))].join('+'), from: JSON.stringify(clean(kf[0])).slice(0, 160), to: JSON.stringify(clean(kf[kf.length - 1])).slice(0, 160), timeline: a.timeline && a.timeline.constructor ? a.timeline.constructor.name : '' });
      }
    } catch {}
  };
  setInterval(sample, 40);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__m.raf++; return raf(cb); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = gc.call(this, type, ...rest);
    if (c && !this.__seen) { this.__seen = 1; window.__m.ctx.push(type); }
    return c;
  };
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Network.enable');
await cdp.send('Animation.enable');

// network bytes
const reqs = new Map();
cdp.on('Network.responseReceived', (e) => { reqs.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, status: e.response.status, bytes: 0, phase: currentPhase }); });
cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.streamed = (r.streamed || 0) + e.encodedDataLength; });

// animations
let currentPhase = 'pre';
const anims = [];
const resolving = [];
cdp.on('Animation.animationStarted', (e) => {
  const a = e.animation;
  const rec = { wall: Date.now(), phase: currentPhase, type: a.type, name: a.name, playbackRate: a.playbackRate, duration: a.source?.duration, delay: a.source?.delay, endDelay: a.source?.endDelay, iterations: a.source?.iterations, easing: a.source?.easing, direction: a.source?.direction, fill: a.source?.fill, kf: a.source?.keyframesRule?.keyframes?.map((k) => [k.offset, k.easing]) };
  anims.push(rec);
  if (false) {
    resolving.push((async () => {
      try {
        const { remoteObject } = await cdp.send('Animation.resolveAnimation', { animationId: a.id });
        const { result } = await cdp.send('Runtime.callFunctionOn', {
          objectId: remoteObject.objectId,
          returnByValue: true,
          functionDeclaration: `function(){ try { const t = this.effect && this.effect.target; const kf = this.effect && this.effect.getKeyframes ? this.effect.getKeyframes() : []; const props = [...new Set(kf.flatMap(k => Object.keys(k).filter(x => !['offset','computedOffset','easing','composite'].includes(x))))]; const desc = t ? (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : ''; const tim = this.effect.getTiming(); return { target: desc.slice(0,80), props, kfEasing: kf.map(k=>k.easing).filter(x=>x && x!=='linear').slice(0,2), timingEasing: tim.easing, transitionProperty: this.transitionProperty || '', animationName: this.animationName || '', from: kf[0] ? JSON.stringify(Object.fromEntries(Object.entries(kf[0]).filter(([k])=>!['offset','computedOffset','easing','composite'].includes(k)))).slice(0,140) : '', to: kf.length ? JSON.stringify(Object.fromEntries(Object.entries(kf[kf.length-1]).filter(([k])=>!['offset','computedOffset','easing','composite'].includes(k)))).slice(0,140) : '' }; } catch (err) { return { err: String(err) }; } }`,
        });
        Object.assign(rec, result.value || {});
      } catch {}
    })());
  }
});

// screencast
let frames = [];
let frameN = 0;
let capturing = false;
cdp.on('Page.screencastFrame', async (e) => {
  try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch {}
  if (!capturing) return;
  const file = path.join(outDir, `${currentPhase}-${String(frameN++).padStart(4, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(e.data, 'base64'));
  frames.push({ phase: currentPhase, t: Math.round(e.metadata.timestamp * 1000), file, scrollY: e.metadata.scrollOffsetY });
});
async function startCast() { capturing = true; await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 }); }
async function stopCast() { await cdp.send('Page.stopScreencast'); capturing = false; }
async function metrics() { const { metrics: m } = await cdp.send('Performance.getMetrics'); return Object.fromEntries(m.map((x) => [x.name, x.value])); }

if (job.rate) await cdp.send('Animation.setPlaybackRate', { playbackRate: job.rate });
const phases = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const ph of job.phases) {
  currentPhase = ph.name;
  const m0 = await metrics();
  let trigger;
  await startCast();
  await sleep(150);
  if (ph.kind === 'load') {
    trigger = Date.now();
    try { await page.goto(job.url, { waitUntil: 'commit', timeout: 45000 }); } catch (err) { console.error('goto', String(err)); }
    await sleep(ph.duration ?? 4000);
  } else if (ph.kind === 'scroll') {
    const y = ph.selector ? await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; return Math.max(0, el.getBoundingClientRect().top + window.scrollY - (window.innerHeight * 0.15)); }, ph.selector) : ph.y;
    if (y === null) console.error('no selector', ph.selector);
    trigger = Date.now();
    await page.evaluate((yy) => window.scrollTo({ top: yy ?? 0, behavior: 'instant' }), y);
    await sleep(ph.duration ?? 3000);
  } else if (ph.kind === 'steps') {
    // native scroll in wheel steps (what a person does), recorded throughout
    trigger = Date.now();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    for (let i = 0; i < (ph.steps ?? 10); i++) { await page.mouse.wheel(0, ph.dy ?? 200); await sleep(ph.gap ?? 120); }
    await sleep(ph.duration ?? 1500);
  } else if (ph.kind === 'hover') {
    const box = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ph.selector);
    await sleep(400);
    frames = frames.filter((f) => f.phase !== ph.name);
    trigger = Date.now();
    if (box) await page.mouse.move(box.x, box.y, { steps: 2 }); else console.error('no hover target', ph.selector);
    await sleep(ph.duration ?? 1500);
    if (ph.leave) { ph.leaveAt = Date.now() - trigger; await page.mouse.move(5, vp.height - 5, { steps: 2 }); await sleep(ph.leaveDuration ?? 1000); }
  } else if (ph.kind === 'click') {
    trigger = Date.now();
    try { await page.click(ph.selector, { timeout: 3000 }); } catch (err) { console.error('click', String(err)); }
    await sleep(ph.duration ?? 2000);
  } else if (ph.kind === 'idle') {
    trigger = Date.now();
    await sleep(ph.duration ?? 3000);
  } else if (ph.kind === 'eval') {
    trigger = Date.now();
    await page.evaluate(ph.js);
    await sleep(ph.duration ?? 2000);
  }
  await stopCast();
  const m1 = await metrics();
  const secs = (Date.now() - trigger) / 1000;
  const d = (k) => Math.round(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000);
  const rafNow = await page.evaluate(() => window.__m.raf).catch(() => null);
  const lcpNow = await page.evaluate(() => window.__m.lcp).catch(() => null);
  phases.push({ name: ph.name, kind: ph.kind, trigger, secs: +secs.toFixed(2), leaveAt: ph.leaveAt, mainThreadMs: { task: d('TaskDuration'), script: d('ScriptDuration'), layout: d('LayoutDuration'), style: d('RecalcStyleDuration') }, rafTotal: rafNow, lcpAtEnd: lcpNow, frames: frames.filter((f) => f.phase === ph.name).length });
}
await Promise.allSettled(resolving);
const page_ = await page.evaluate(() => {
  const vids = [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || v.src || '').slice(0, 160), sources: [...v.querySelectorAll('source')].map((s) => [s.type, (s.src || '').slice(-80)]), poster: (v.poster || '').slice(-100), autoplay: v.autoplay, loop: v.loop, muted: v.muted, playsInline: v.playsInline, preload: v.preload, w: v.videoWidth, h: v.videoHeight, cssW: Math.round(v.getBoundingClientRect().width), dur: v.duration, paused: v.paused }));
  const canv = [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height), cls: (typeof c.className === 'string' ? c.className : '').slice(0, 60) }));
  return { title: document.title, m: { ...window.__m, anims: undefined }, sampled: window.__m.anims, vids: vids.slice(0, 30), canv: canv.slice(0, 20), scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, bodyScrollBehavior: getComputedStyle(document.body).scrollBehavior, docH: document.documentElement.scrollHeight, lenis: !!(window.lenis || document.documentElement.classList.contains('lenis')), locomotive: !!document.querySelector('[data-scroll-container]'), fonts: [...new Set([...document.fonts].map((f) => f.family))].slice(0, 12) };
}).catch((err) => ({ err: String(err) }));
const bytes = {};
for (const r of reqs.values()) { const k = r.type; bytes[k] = bytes[k] || { n: 0, kb: 0 }; bytes[k].n++; bytes[k].kb += Math.max(r.bytes || 0, r.streamed || 0) / 1024; }
for (const k of Object.keys(bytes)) bytes[k].kb = Math.round(bytes[k].kb);
const media = [...reqs.values()].filter((r) => /video|media|mp4|webm|m3u8|mov/i.test(r.mime + r.type + r.url)).map((r) => ({ url: r.url.slice(0, 160), mime: r.mime, kb: Math.round(Math.max(r.bytes || 0, r.streamed || 0) / 1024), status: r.status })).slice(0, 30);
const bigJs = [...reqs.values()].filter((r) => r.type === 'Script').sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 8).map((r) => ({ url: r.url.slice(0, 140), kb: Math.round((r.bytes || 0) / 1024) }));
const report = { key: job.key, url: job.url, reduced, date: new Date().toISOString(), viewport: vp, phases, page: page_, bytes, media, bigJs, anims: anims.map((a) => ({ ...a, phaseRelMs: null })), frames: frames.map(({ phase, t, file, scrollY }) => ({ phase, t, file, scrollY })) };
// relative time of each animation start to its phase trigger
for (const a of report.anims) { const p = phases.find((x) => x.name === a.phase); if (p) a.phaseRelMs = a.wall - p.trigger; }
report.sampled = (page_.sampled || []).map((a) => { let ph = phases[0]; for (const p of phases) if (a.wall >= p.trigger) ph = p; return { ...a, phase: ph?.name, phaseRelMs: ph ? a.wall - ph.trigger : null }; });
if (report.page) delete report.page.sampled;
report.rate = job.rate || 1;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
// a compact copy without frame paths for the repo
const compact = { ...report, frames: undefined, frameCount: frames.length };
fs.writeFileSync(path.join(RAW, `${tag}.json`), JSON.stringify(compact, null, 1));
console.log(tag, 'frames', frames.length, 'anims', anims.length, 'lcp', JSON.stringify(page_.m?.lcp), 'cls', page_.m?.cls?.toFixed?.(3), 'phases', JSON.stringify(phases.map((p) => [p.name, p.frames, p.mainThreadMs.task, p.rafTotal])));
await browser.close();

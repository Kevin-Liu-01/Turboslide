// Diagnostic: one load of /edit/gt-brand on production, 60 s, which landmarks appear and what the network does.
import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.argv[2] ?? 'https://turboslide.vercel.app';
const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pending = new Map();
const log = [];
page.on('request', (r) => pending.set(r, Date.now()));
page.on('response', async (res) => {
  const req = res.request();
  const t = pending.get(req);
  pending.delete(req);
  const u = req.url().replace(BASE, '');
  if (u.includes('/_serverFn/') || u.includes('/api/') || res.status() >= 400)
    log.push({
      t: t ? Date.now() - t0 : null,
      ms: t ? Date.now() - t : null,
      status: res.status(),
      url: u.split('?')[0].slice(0, 100),
    });
});
page.on('requestfailed', (r) => {
  pending.delete(r);
  log.push({
    t: Date.now() - t0,
    failed: r.failure()?.errorText,
    url: r.url().replace(BASE, '').split('?')[0].slice(0, 100),
  });
});
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    log.push({ t: Date.now() - t0, console: m.type(), text: m.text().slice(0, 200) });
});
page.on('pageerror', (e) => log.push({ t: Date.now() - t0, pageerror: String(e).slice(0, 200) }));
const t0 = Date.now();
await page.goto(`${BASE}/edit/gt-brand`, { waitUntil: 'commit' });
const marks = {};
const deadline = t0 + 60_000;
while (Date.now() < deadline) {
  const s = await page
    .evaluate(() => ({
      title: Boolean(document.querySelector('.ts-title-row')),
      viewer: Boolean(document.querySelector('.pt-viewer')),
      skeleton: Boolean(document.querySelector('.ts-skeleton')),
      settled: Boolean(document.querySelector('.pt-viewer[data-settled]')),
      studio: (() => {
        try {
          return Boolean(window.turboslide?.studio);
        } catch {
          return false;
        }
      })(),
      cards: document.querySelectorAll('.ts-filmstrip .ts-card').length,
      banner: [...document.querySelectorAll('.ts-banner')].map(
        (b) => b.getAttribute('data-state') + ':' + (b.textContent || '').slice(0, 80),
      ),
      status: document.querySelector('.ts-status')?.textContent?.slice(0, 60) ?? null,
      body: document.body ? document.body.innerText.slice(0, 200).replace(/\s+/g, ' ') : null,
    }))
    .catch(() => null);
  if (s)
    for (const [k, v] of Object.entries(s))
      if (marks[k] === undefined || JSON.stringify(marks[k].v) !== JSON.stringify(v))
        marks[k] = { t: Date.now() - t0, v };
  if (s && s.studio && s.settled) break;
  await new Promise((r) => setTimeout(r, 250));
}
console.log('elapsed', Date.now() - t0, 'ms');
console.log('landmarks', JSON.stringify(marks, null, 1));
console.log(
  'pending now',
  [...pending.keys()].map((r) => ({
    since: Date.now() - pending.get(r),
    url: r.url().replace(BASE, '').split('?')[0].slice(0, 100),
  })),
);
console.log('log', JSON.stringify(log, null, 0));
await context.close();
await browser.close();

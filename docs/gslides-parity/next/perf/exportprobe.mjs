// The PDF export timed through the editor's own action (export.run, the File > Download > PDF path),
// with every request it makes logged as it answers, and a hard deadline per run.
//   node exportprobe.mjs <a|b> <runs> [deadlineSeconds]
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const DIR = new URL('.', import.meta.url).pathname;
const ids = JSON.parse(readFileSync(`${DIR}state/ids.json`, 'utf8'));
const [which = 'a', runsArg = '1', deadlineArg = '300'] = process.argv.slice(2);
const deck = ids[which];
const RUNS = Number(runsArg);
const DEADLINE = Number(deadlineArg) * 1000;
const BASE = 'https://www.turboslide.com';
const CHROME = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const probe = await browser.newContext();
const ua = (await (await probe.newPage()).evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
await probe.close();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: `${DIR}state/storage.json`, acceptDownloads: true, userAgent: ua });
const page = await context.newPage();
let t0 = 0;
const calls = [];
page.on('response', async (r) => {
  const u = r.url().replace(BASE, '');
  if (!/_serverFn|\/api\/|blob\.vercel-storage/.test(u)) return;
  const at = Date.now() - t0;
  const req = r.request();
  const timing = req.timing();
  let size = null;
  try { size = (await req.sizes()).responseBodySize; } catch {}
  const row = { at, status: r.status(), method: req.method(), u: u.slice(0, 110), wait: Math.round(timing.responseStart), size };
  calls.push(row);
  if (t0 > 0) log('  resp', JSON.stringify(row));
});
await page.goto(`${BASE}/edit/${encodeURIComponent(deck)}`, { waitUntil: 'commit' });
await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio) && Boolean(document.querySelector('.pt-viewer[data-settled]')), null, { timeout: 120_000 });
await sleep(2500);
for (let run = 0; run < RUNS; run += 1) {
  calls.length = 0;
  const theme = await page.evaluate(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  const dl = page.waitForEvent('download', { timeout: DEADLINE }).catch(() => null);
  t0 = Date.now();
  log('run', run, 'deck', which, 'theme', theme, 'uptime', execSync('uptime').toString().trim());
  const inv = page.evaluate((th) => window.turboslide.studio.invoke('export.run', { format: 'pdf', theme: [th] }).then((r) => ({ ok: true, keys: Object.keys(r || {}).slice(0, 10), pages: r?.pages?.length ?? r?.slides ?? null, ms: r?.ms ?? null }), (e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 300) })), theme);
  const result = await Promise.race([inv.then((v) => ({ v, at: Date.now() - t0 })), sleep(DEADLINE).then(() => ({ v: { ok: false, error: `no answer within ${DEADLINE / 1000} s` }, at: Date.now() - t0 }))]);
  const d = await Promise.race([dl, sleep(15_000).then(() => null)]);
  const dlAt = d ? Date.now() - t0 : null;
  let bytes = null;
  if (d) { try { bytes = statSync(await d.path()).size; } catch {} }
  const progress = await page.evaluate(() => (document.querySelector('[data-control*="export"], .ts-export-card, [role="status"]')?.textContent ?? '').slice(0, 200)).catch(() => null);
  const row = { at: new Date().toISOString(), deck: which, run, theme, invokeMs: result.at, result: result.v, downloadMs: dlAt, bytes, calls: [...calls], progress, uptime: execSync('uptime').toString().trim() };
  appendFileSync(`${DIR}state/export.jsonl`, `${JSON.stringify(row)}\n`);
  log('done run', run, 'invoke', result.at, 'download', dlAt, 'bytes', bytes, JSON.stringify(result.v).slice(0, 200));
  await sleep(3000);
}
await browser.close();
log('exit');

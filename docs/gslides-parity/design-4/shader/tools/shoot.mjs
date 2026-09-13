// Screenshots of the mockups with Chrome for Testing: /home at 1440 (full page, dark and light), at 390, and the
// social image at 1200 by 630. file:// with --allow-file-access-from-files so the page reads the repository's
// tokens.css, inter.css and the README screenshots by relative path.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const { geometry, markShapes } = await import('./mark.mjs');
const EXE = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const DIR = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader';
// fill the OG mark
{
  const og = readFileSync(`${DIR}/og.html`, 'utf8').replace('{{MARK192}}', markShapes(geometry(192), 1));
  writeFileSync(`${DIR}/og.html`, og);
}
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
async function shot(file, out, { width, height, theme, fullPage = true, dsf = 1, live = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, reducedMotion: 'reduce' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('requestfailed', (r) => console.log('[failed]', r.url().slice(-80)));
  await page.goto(`file://${DIR}/${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { await Promise.all(Array.from(document.images).map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))); });
  if (live) await page.click('#ts-live');
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ path: `${DIR}/previews/${out}`, fullPage, type: 'png' });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(out, buf.length, 'bytes', 'page height', h);
  await ctx.close();
}
await shot('home.html', 'home.png', { width: 1440, height: 900, theme: 'dark' });
await shot('home.html', 'home-light.png', { width: 1440, height: 900, theme: 'light' });
await shot('home.html', 'home-live.png', { width: 1440, height: 900, theme: 'dark', fullPage: false, live: true });
await shot('home.html', 'home-390.png', { width: 390, height: 844, theme: 'dark' });
await shot('og.html', 'og.png', { width: 1200, height: 630, theme: 'dark', fullPage: false });
await browser.close();

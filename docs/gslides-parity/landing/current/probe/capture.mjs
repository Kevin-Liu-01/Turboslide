#!/usr/bin/env node
// Captures /home full page at 1440x900 and 390x844 in both appearances, writes JPEGs under 400 KB.
//   node capture.mjs <base> <label>
import { createRequire } from 'node:module';
import { writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const CHROME =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.argv[2] ?? 'https://www.turboslide.com';
const LABEL = process.argv[3] ?? 'prod';
const OUT = new URL('../pictures/', import.meta.url).pathname;
const LIMIT = 400 * 1024;
const sizes = (process.env.SIZES ?? '1440x900,390x844').split(',');
const themes = (process.env.THEMES ?? 'light,dark').split(',');

async function fit(buf, path, { maxWidth } = {}) {
  let width = maxWidth;
  const meta = await sharp(buf).metadata();
  width = Math.min(width ?? meta.width, meta.width);
  for (let q = 80; ; ) {
    let img = sharp(buf);
    if (width < meta.width) img = img.resize({ width });
    // jpeg height limit 65535
    const out = await img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (out.length <= LIMIT) {
      writeFileSync(path, out);
      return { path, bytes: out.length, q, width };
    }
    if (q > 50) q -= 10;
    else width = Math.round(width * 0.85);
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const probe = await browser.newContext();
const ua = (await (await probe.newPage()).evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
await probe.close();
const results = [];
for (const size of sizes) {
  const [w, h] = size.split('x').map(Number);
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme, userAgent: ua, reducedMotion: 'no-preference' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('gt-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('main', { timeout: 30000 });
    await page.waitForTimeout(1500);
    // scroll through to trigger lazy images, then back to top
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += h) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(250); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    const first = await page.screenshot({ type: 'png' });
    const full = await page.screenshot({ type: 'png', fullPage: true });
    const tag = `${LABEL}-${w}-${theme}`;
    const a = await fit(first, `${OUT}${tag}-first.jpg`);
    const b = await fit(full, `${OUT}${tag}-full.jpg`, { maxWidth: w > 800 ? 1200 : w });
    const meta = await sharp(full).metadata();
    const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    results.push({ tag, dataTheme, fullHeight: meta.height, first: a, full: b });
    console.log(JSON.stringify(results.at(-1)));
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}${LABEL}-capture.json`, JSON.stringify({ at: new Date().toISOString(), uptime: execSync('uptime').toString().trim(), base: BASE, results }, null, 2));

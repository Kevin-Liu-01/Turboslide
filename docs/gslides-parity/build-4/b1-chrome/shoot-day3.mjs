// B1 days 2 and 3: the chrome record on 4341 for build-4/b1.md (MILESTONES-4 B1; SPEC-4 0.15, 0.50,
// 1.10). The Not found page with the notfound twin behind the mark in both appearances; the print
// bar's 20 px mark at 1x and 2x with its colour count (the raster edge check of 0.50 in Chromium);
// the editor and presenter skeletons with the curtain picture (the loader's server function is
// held so the pending component stays); the twins and the card as served (status, type, bytes).
// Run from the repository root: node docs/gslides-parity/build-4/b1-chrome/shoot-day3.mjs [base] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const sharp = createRequire('/Users/kevinliu/repos/Turboslide/package.json')('sharp');

const [base = 'http://localhost:4341', outDir = 'docs/gslides-parity/build-4/b1-chrome'] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function coloursOf(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const set = new Set();
  for (let i = 0; i < data.length; i += 4) set.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return { count: set.size, width: info.width, height: info.height, sample: [...set].slice(0, 6) };
}

async function context(theme, scale) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: scale,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
    } catch {}
  }, theme);
  return ctx;
}

/* 1. the served twins and the card */
{
  const ctx = await context('dark', 1);
  const page = await ctx.newPage();
  for (const path of [
    '/brand/hero-dark.png',
    '/brand/hero-light.png',
    '/brand/figure-dark.png',
    '/brand/figure-light.png',
    '/brand/notfound-dark.png',
    '/brand/notfound-light.png',
    '/brand/og-screen-dark.png',
    '/brand/og-screen-light.png',
    '/og/turboslide.png',
    '/brand-manifest.json',
  ]) {
    const response = await page.request.get(`${base}${path}`);
    const body = await response.body();
    console.log(
      `GET ${path} ${response.status()} ${response.headers()['content-type']} ${body.length} bytes`,
    );
  }
  await ctx.close();
}

/* 2. Not found with the twin, both appearances at 2x */
for (const theme of ['dark', 'light']) {
  const ctx = await context(theme, 2);
  const page = await ctx.newPage();
  const response = await page.goto(`${base}/no-such-page`);
  await page.waitForSelector('.ts-notfound .ts-mark');
  await page.waitForTimeout(500);
  const facts = await page.evaluate(() => {
    const fig = document.querySelector('.ts-empty-fig');
    const style = fig ? getComputedStyle(fig) : null;
    return {
      dataTheme: document.documentElement.getAttribute('data-theme'),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      figureImage: style?.backgroundImage,
      figureSize: style ? `${style.width} by ${style.height}` : null,
      about: document.querySelector('[data-control="notfound.about"]')?.getAttribute('href'),
      buttons: [...document.querySelectorAll('.ts-notfound-actions [data-tip]')].map(
        (el) => el.tagName,
      ),
    };
  });
  console.log('no-such-page', theme, response?.status(), JSON.stringify(facts));
  await page.screenshot({
    path: join(outDir, `notfound-${theme}.png`),
    clip: { x: 0, y: 0, width: 1440, height: 520 },
  });
  await ctx.close();
}

/* 3. the print bar mark at 1x and 2x (SPEC-4 0.50) */
for (const theme of ['dark', 'light']) {
  for (const scale of [1, 2]) {
    const ctx = await context(theme, scale);
    const page = await ctx.newPage();
    const response = await page.goto(`${base}/print/gt-brand`);
    await page.waitForSelector('.ts-print-title .ts-mark');
    await page.waitForTimeout(600);
    const box = await page.locator('.ts-print-title .ts-mark').boundingBox();
    const shot = await page.screenshot({ clip: box });
    const colours = await coloursOf(shot);
    console.log(
      `print bar mark ${theme} ${scale}x: ${response?.status()} box ${box.width} by ${box.height} css px, raster ${colours.width} by ${colours.height}, ${colours.count} colours ${JSON.stringify(colours.sample)}`,
    );
    await sharp(shot)
      .resize(colours.width * 8, colours.height * 8, { kernel: 'nearest' })
      .png()
      .toFile(join(outDir, `print-bar-mark-8x-${theme}-${scale}x.png`));
    if (scale === 1) {
      const bar = await page.locator('.ts-print-bar').boundingBox();
      await page.screenshot({
        path: join(outDir, `print-bar-${theme}.png`),
        clip: { x: 0, y: bar.y, width: 900, height: bar.height },
      });
    }
    await ctx.close();
  }
}

/* 4. the skeletons with the curtain (SPEC-4 0.15): hold the server functions so the pending component stays */
for (const [route, selector, name] of [
  ['/edit/gt-brand', '.ts-skeleton .ts-curtain', 'skeleton-curtain-editor'],
  ['/present/gt-brand', '.ts-skeleton .ts-curtain', 'skeleton-curtain-presenter'],
]) {
  for (const theme of ['dark', 'light']) {
    const ctx = await context(theme, 1);
    const page = await ctx.newPage();
    await page.route('**/_serverFn/**', (r) => new Promise(() => void r));
    await page.route('**/_server/**', (r) => new Promise(() => void r));
    const response = await page
      .goto(`${base}${route}`, { waitUntil: 'commit' })
      .catch((e) => ({ status: () => `nav: ${e.message.slice(0, 60)}` }));
    let found = null;
    try {
      await page.waitForSelector(selector, { timeout: 8000 });
      found = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          image: s.backgroundImage,
          size: s.backgroundSize,
          rendering: s.imageRendering,
          box: `${Math.round(r.width)} by ${Math.round(r.height)}`,
        };
      }, selector);
    } catch (e) {
      found = { error: e.message.slice(0, 80) };
    }
    console.log(`${route} ${theme}: ${response?.status()} ${JSON.stringify(found)}`);
    await page.screenshot({
      path: join(outDir, `${name}-${theme}.png`),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await ctx.close();
  }
}

await browser.close();

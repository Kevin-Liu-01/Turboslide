#!/usr/bin/env node
// Detail crops and DOM readings of /home: the nav and the capture's title row side by side, the
// numbers row, the hero picture at 390, the controls and links, word count, element sizes.
//   node details.mjs <base> <label>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const CHROME = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.argv[2];
const LABEL = process.argv[3];
const OUT = new URL('../pictures/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const facts = { at: new Date().toISOString(), uptime: execSync('uptime').toString().trim(), base: BASE };
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('gt-theme', 'light'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/home`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('main', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += h) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(150); }
  await page.evaluate(() => window.scrollTo(0, 0));
  facts[w] = await page.evaluate(() => {
    const main = document.querySelector('main');
    const txt = main.innerText.replace(/\s+/g, ' ').trim();
    const shot = document.querySelector('.ts-product-hero-shot img:not([style*="none"])') ;
    const imgs = [...document.querySelectorAll('main img')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => ({ src: i.currentSrc.replace(location.origin, ''), shown: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), natural: i.naturalWidth + 'x' + i.naturalHeight }));
    const h1 = document.querySelector('h1');
    const cs = getComputedStyle(h1);
    const bands = [...document.querySelectorAll('main > header, main > section, main > div, main > footer')].map((el) => ({ cls: el.className.split(' ')[0], band: el.getAttribute('data-band') || el.getAttribute('data-strip') || '', top: Math.round(el.getBoundingClientRect().top + scrollY), h: Math.round(el.getBoundingClientRect().height) })).filter((b) => b.h > 0);
    const controls = [...document.querySelectorAll('main [data-control]')].map((el) => `${el.getAttribute('data-control')} ${el.tagName.toLowerCase()} ${el.getAttribute('href') ?? ''} "${(el.textContent || '').trim().slice(0, 40)}"`);
    return { words: txt.split(' ').filter((w) => /[A-Za-z0-9]/.test(w)).length, height: document.documentElement.scrollHeight, h1: { size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, family: cs.fontFamily.slice(0, 40) }, imgs, bands, controls, signIn: Boolean(document.querySelector('[data-control="home.nav.signIn"]')), animations: document.getAnimations().length, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
  });
  if (w === 1440) {
    const nav = await page.locator('header').first().screenshot();
    writeFileSync(`${OUT}${LABEL}-1440-nav.png`, await sharp(nav).resize({ width: 1440 }).png({ palette: true }).toBuffer());
    const numbers = page.locator('[data-strip="numbers"]');
    if (await numbers.count()) {
      const buf = await numbers.screenshot();
      writeFileSync(`${OUT}${LABEL}-1440-numbers.png`, await sharp(buf).resize({ width: 1440 }).png({ palette: true }).toBuffer());
    }
    // the capture's title row beside the live nav: the page's mark against the picture's mark
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const shot = page.locator('.ts-product-hero-shot');
    const sb = await shot.boundingBox();
    const full = await page.screenshot({ clip: { x: sb.x, y: sb.y, width: Math.min(560, sb.width), height: 90 } });
    writeFileSync(`${OUT}${LABEL}-1440-hero-titlerow.png`, await sharp(full).png({ palette: true }).toBuffer());
  } else {
    const shot = page.locator('.ts-product-hero-shot');
    await shot.scrollIntoViewIfNeeded();
    const buf = await shot.screenshot();
    writeFileSync(`${OUT}${LABEL}-390-hero-picture.png`, await sharp(buf).png({ palette: true }).toBuffer());
  }
  await ctx.close();
}
await browser.close();
writeFileSync(new URL(`./details-${LABEL}.json`, import.meta.url).pathname, JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 1).slice(0, 6000));

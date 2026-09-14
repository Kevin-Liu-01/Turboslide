// B1 day 1: the Not found page and the editor's title row in both appearances on 4341, for
// build-4/b1.md (the chrome checks of MILESTONES-4 B1's port row).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const [base = 'http://localhost:4341', outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
    } catch {}
  }, theme);
  const response = await page.goto(`${base}/no-such-page`);
  console.log('no-such-page', theme, response?.status());
  await page.waitForSelector('.ts-notfound .ts-mark');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(outDir, `notfound-${theme}.png`),
    clip: { x: 0, y: 0, width: 1440, height: 520 },
  });
  const facts = await page.evaluate(() => ({
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    dataTheme: document.documentElement.getAttribute('data-theme'),
    title: document.querySelector('h1')?.textContent,
    markCells: document.querySelector('.ts-notfound .ts-mark')?.getAttribute('data-cells'),
    buttons: [...document.querySelectorAll('.ts-notfound-actions [data-tip]')].map(
      (el) => `${el.textContent} -> ${el.getAttribute('href')}`,
    ),
    figureLabel: document.querySelector('.ts-empty-fig')?.getAttribute('aria-label'),
  }));
  console.log(JSON.stringify(facts));
  await page.goto(`${base}/new?author=agent:b1-chrome`);
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]');
  await page.waitForSelector('.ts-title-row .ts-title-home .ts-mark');
  await page.waitForTimeout(600);
  const row = await page.locator('.ts-title-row').boundingBox();
  await page.screenshot({
    path: join(outDir, `title-row-${theme}.png`),
    clip: { x: 0, y: row.y, width: 720, height: row.height },
  });
  const mark = await page.evaluate(() => {
    const el = document.querySelector('.ts-title-row .ts-title-home .ts-mark');
    const r = el.getBoundingClientRect();
    const link = el.closest('a');
    return {
      width: r.width,
      height: r.height,
      tag: link?.tagName,
      href: link?.getAttribute('href'),
      control: link?.getAttribute('data-control'),
      tip: link?.getAttribute('data-tip'),
      label: link?.getAttribute('aria-label'),
    };
  });
  console.log('title row mark', theme, JSON.stringify(mark));
  await page.screenshot({
    path: join(outDir, `title-row-mark-8x-${theme}.png`),
    clip: { x: 0, y: row.y, width: 64, height: row.height },
  });
  await context.close();
}
await browser.close();

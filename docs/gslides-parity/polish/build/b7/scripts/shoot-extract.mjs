// Screenshots of the served /home at 1440 and 390, light and dark, full page and the fold.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:4451';
const OUT = process.env.OUT ?? 'docs/gslides-parity/polish/build/b7/extract';
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
const THEMES = ['light', 'dark'];
const browser = await chromium.launch({ headless: true });
for (const theme of THEMES) {
  for (const { w, h } of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      isMobile: w < 760,
      hasTouch: w < 760,
      colorScheme: theme,
    });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('gt-theme', t);
      } catch {}
    }, theme);
    const page = await context.newPage();
    await page.goto(`${BASE}/home`, { waitUntil: 'load' });
    await page.waitForSelector('main.ts-product[data-hydrated]', { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${theme}-${w}-fold.png` });
    await page.screenshot({ path: `${OUT}/${theme}-${w}-full.png`, fullPage: true });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${theme}-${w}: page height ${height}`);
    await context.close();
  }
}
await browser.close();

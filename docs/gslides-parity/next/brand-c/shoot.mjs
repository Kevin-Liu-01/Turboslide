// Renders the direction C mockups and the favicon tiles with Playwright (playwright-core from the worktree's
// node_modules), file:// pages, no server. Usage: node shoot.mjs [page ...] [--favicons]
// Pages: home, decks, editor, signin, marks. Each is shot at 1440 by 900 and 390 by 844 in both themes, at device
// scale factor 1, into shots/<page>-<width>-<theme>.png.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const pages = args.filter((a) => !a.startsWith('--'));
const sizes = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
const browser = await chromium.launch();
try {
  if (args.includes('--favicons')) {
    for (const [file, size, out] of [
      ['favicon-16.svg', 16, 'favicon-16.png'],
      ['favicon-32.svg', 32, 'favicon-32.png'],
      ['apple-touch-icon-180.svg', 180, 'apple-touch-icon-180.png'],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1, colorScheme: 'light' });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(join(here, 'marks', file)).href);
      await page.screenshot({ path: join(here, 'marks', out), clip: { x: 0, y: 0, width: size, height: size } });
      await ctx.close();
      console.log('marks/' + out);
    }
  }
  for (const name of pages) {
    for (const { w, h } of sizes) {
      for (const theme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(pathToFileURL(join(here, 'mock', `${name}.html`)).href + `?theme=${theme}`);
        await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 20000 });
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const out = join(here, 'shots', `${name}-${w}-${theme}.png`);
        await page.screenshot({ path: out });
        console.log(`shots/${name}-${w}-${theme}.png${overflow ? ' HORIZONTAL OVERFLOW' : ''}${errors.length ? ' ERRORS ' + errors.join(' | ') : ''}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

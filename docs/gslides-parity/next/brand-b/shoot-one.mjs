// Renders one file:// page to PNG: node shoot-one.mjs <html> <png> <width> <height> [light|dark] [full]
// The theme is passed as ?theme= and read by the page. Playwright from the worktree's node_modules.
import { chromium } from '/Users/kevinliu/repos/Turboslide-next/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [html, png, w, h, theme = 'light', full] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve(html)).href + `?theme=${theme}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: png, fullPage: full === 'full' });
await browser.close();
console.log(png);

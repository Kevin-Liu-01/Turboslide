// B1 day 3: the editor skeleton's curtain (gslides-parity SPEC-4 0.15) on 4341 after the 16:9 fit,
// for build-4/b1.md. The loader's server functions are held so the pending component stays.
// Run from the repository root: node docs/gslides-parity/build-4/b1-chrome/shoot-curtain.mjs
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4341';
const outDir = 'docs/gslides-parity/build-4/b1-chrome';
const browser = await chromium.launch({ headless: true });
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  await page.route('**/_serverFn/**', (r) => new Promise(() => void r));
  await page.route('**/_server/**', (r) => new Promise(() => void r));
  await page.goto(`${base}/edit/gt-brand`, { waitUntil: 'commit' }).catch(() => null);
  await page.waitForSelector('.ts-skeleton .ts-curtain-host > .ts-curtain', { timeout: 8000 });
  const facts = await page.evaluate(() => {
    const host = document.querySelector('.ts-skeleton .ts-curtain-host');
    const el = host.querySelector('.ts-curtain');
    const h = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      host: `${Math.round(h.width)} by ${Math.round(h.height)}`,
      curtain: `${Math.round(r.width)} by ${Math.round(r.height)}`,
      left: r.left - h.left,
      top: r.top - h.top,
      image: getComputedStyle(el).backgroundImage.split('/').pop(),
    };
  });
  console.log(`/edit/gt-brand ${theme}: ${JSON.stringify(facts)}`);
  await page.screenshot({
    path: `${outDir}/skeleton-curtain-editor-${theme}.png`,
    clip: { x: 0, y: 0, width: 1440, height: 900 },
  });
  await ctx.close();
}
await browser.close();

// B1 day 3: a debug read of the skeleton's curtain boxes on 4341 (not a record; kept for the notes).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route('**/_serverFn/**', (r) => new Promise(() => void r));
await page.route('**/_server/**', (r) => new Promise(() => void r));
await page.goto('http://localhost:4341/edit/gt-brand', { waitUntil: 'commit' }).catch(() => null);
await page.waitForSelector('.ts-skeleton .ts-curtain', { state: 'attached', timeout: 8000 });
await page.waitForTimeout(500);
const facts = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      position: s.position,
      container: s.containerType,
      width: s.width,
      height: s.height,
      display: s.display,
      aspect: s.aspectRatio,
    };
  };
  return {
    stagewrap: read('.ts-skeleton .ts-skeleton-stagewrap'),
    host: read('.ts-skeleton .ts-curtain-host'),
    curtain: read('.ts-skeleton .ts-curtain'),
    main: read('.ts-skeleton .ts-skeleton-main'),
    sheets: [...document.styleSheets]
      .map((s) => (s.href ?? 'inline').split('/').slice(-2).join('/'))
      .filter((h) => /brand|styles|Editor|Viewer/.test(h)),
  };
});
console.log(JSON.stringify(facts, null, 1));
await browser.close();

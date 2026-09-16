import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto('https://turboslide.vercel.app/new', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    const r = sheet.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left > r.right - 160 && b.right <= r.right + 2 && b.top > r.bottom - 60 && b.bottom <= r.bottom + 2 && b.width < 160) {
        out.push({ tag: el.tagName, cls: (el.getAttribute('class') ?? '').slice(0, 60), text: (el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 30), attrs: [...el.attributes].filter((a) => /data-/.test(a.name)).map((a) => `${a.name}=${a.value}`).join(' ').slice(0, 80), after: getComputedStyle(el, '::after').content, before: getComputedStyle(el, '::before').content });
      }
    }
    return out.slice(0, 12);
  });
  console.log(JSON.stringify(found, null, 1));
} finally {
  await browser.close();
}

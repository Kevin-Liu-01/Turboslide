import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = 'https://turboslide.vercel.app';
const mine = ['untitled-20260916-80o0','untitled-20260916-pjlr','untitled-20260916-qmbx','untitled-20260916-m7ki','untitled-20260916-yvia','untitled-20260916-xpin','untitled-20260916-mc56','untitled-20260916-w0i4','untitled-20260916-y0k7'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  for (const id of mine) {
    const d = (await page.request.get(`${BASE}/deck/${id}`, { maxRedirects: 0 })).status();
    const e = (await page.request.get(`${BASE}/edit/${id}`, { maxRedirects: 0 })).status();
    console.log(`${id}: /deck ${d}, /edit ${e}`);
  }
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(4000);
  const trash = await page.evaluate(() => [...document.querySelectorAll('[data-control^="trash.card."]')].map((el) => el.getAttribute('data-control').replace('trash.card.', '')));
  console.log(`trash now holds: ${trash.join(', ')}`);
  console.log(`mine still in the trash: ${trash.filter((t) => mine.includes(t)).join(', ') || 'none'}`);
  await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(4000);
  const decks = await page.evaluate(() => [...document.querySelectorAll('[data-control^="home.open."]')].map((el) => el.getAttribute('data-control').replace('home.open.', '')));
  console.log(`mine still on /decks: ${decks.filter((t) => mine.includes(t)).join(', ') || 'none'}`);
} finally {
  await browser.close();
}

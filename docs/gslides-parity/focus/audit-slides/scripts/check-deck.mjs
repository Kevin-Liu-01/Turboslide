import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = 'https://turboslide.vercel.app';
const id = process.argv[2];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  for (const route of ['deck', 'edit', 'present']) {
    const res = await page.request.get(`${BASE}/${route}/${id}`, { maxRedirects: 0 });
    console.log(`${route}: ${res.status()}`);
  }
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30000 })
    .catch(() => console.log('trash page not hydrated in 30 s'));
  await page.waitForTimeout(3000);
  const trash = await page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="trash.card."]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
  console.log(`trash cards: ${JSON.stringify(trash)}`);
  await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30000 })
    .catch(() => console.log('decks page not hydrated in 30 s'));
  await page.waitForTimeout(3000);
  const decks = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control^="deck.card."], [data-control^="decks.card."], a[href^="/edit/"]',
      ),
    ].map((el) => el.getAttribute('data-control') ?? el.getAttribute('href')),
  );
  console.log(
    `deck cards: ${JSON.stringify(decks.filter((d) => d && d.includes('untitled-2026091')))}`,
  );
  await page.goto(`${BASE}/edit/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log(
    `edit page text: ${await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))}`,
  );
} finally {
  await browser.close();
}

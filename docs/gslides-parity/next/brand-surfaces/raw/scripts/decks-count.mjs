import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://www.turboslide.com/decks', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(3000);
const facts = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-control^="home.card."]')];
  const ids = new Set(cards.map((c) => c.getAttribute('data-control')));
  const titles = [...document.querySelectorAll('[data-control^="home.card."]')].map((c) => c.innerText.split('\n')[0]);
  const counts = {}; for (const t of titles) counts[t] = (counts[t] ?? 0) + 1;
  return { at: new Date().toISOString(), cards: cards.length, distinct: ids.size, titles: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15) };
});
console.log(JSON.stringify(facts));
await b.close();

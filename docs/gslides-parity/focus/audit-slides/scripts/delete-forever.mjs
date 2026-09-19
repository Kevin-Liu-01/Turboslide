// Delete forever, on /decks/trash, the decks named on the command line; waits up to 120 s for each
// card (the trash list of production took longer than 30 s to show a card today).
import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = 'https://turboslide.vercel.app';
const ids = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const id of ids) {
    const t0 = Date.now();
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60_000 })
      .catch(() => console.log(`${id}: trash page not hydrated in 60 s`));
    const card = page.locator(`[data-control="trash.card.${id}"]`);
    const seen = await card
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    console.log(
      `${id}: card ${seen ? 'shown' : 'not shown'} after ${Math.round((Date.now() - t0) / 1000)} s`,
    );
    if (!seen) {
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="trash.card."]')].map((el) =>
          el.getAttribute('data-control'),
        ),
      );
      console.log(`${id}: trash holds ${JSON.stringify(cards)}`);
      continue;
    }
    await page.locator(`[data-control="trash.delete.${id}"]`).click();
    await page.locator('[data-control="trash.confirm.ok"]').click();
    const gone = await card
      .waitFor({ state: 'detached', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`${id}: card detached ${gone}`);
    let statuses = '';
    const until = Date.now() + 30_000;
    for (;;) {
      const d = (await page.request.get(`${BASE}/deck/${id}`, { maxRedirects: 0 })).status();
      const e = (await page.request.get(`${BASE}/edit/${id}`, { maxRedirects: 0 })).status();
      statuses = `/deck ${d}, /edit ${e}`;
      if ((d === 404 && e === 404) || Date.now() > until) break;
      await sleep(2000);
    }
    console.log(`${id}: ${statuses}`);
  }
} finally {
  await browser.close();
}

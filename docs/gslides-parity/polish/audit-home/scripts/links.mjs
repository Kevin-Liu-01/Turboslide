// Every href on production /home, fetched once (GET, no body read) and recorded with its status.
import { writeFileSync } from 'node:fs';

import { chromium } from '/Users/kevinliu/repos/Turboslide-live/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE ?? 'https://www.turboslide.com';
const OUT =
  process.env.OUT ?? '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-home';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/home`, { waitUntil: 'load' });
await page.waitForSelector('main.ts-product[data-hydrated]');
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href]')].map((a) => ({
    control: a.getAttribute('data-control'),
    text: a.textContent.trim().slice(0, 60),
    href: a.href,
    target: a.getAttribute('target'),
    tip: a.getAttribute('data-tip') ? 'yes' : 'no',
  })),
);
await browser.close();

const seen = new Map();
for (const link of links) {
  if (seen.has(link.href)) continue;
  let status = 'n/a';
  let finalUrl = '';
  try {
    if (link.href.startsWith('#') || link.href.includes('/home#')) {
      status = 'anchor';
    } else {
      const res = await fetch(link.href, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) turboslide-home-audit' },
      });
      status = res.status;
      finalUrl = res.url !== link.href ? res.url : '';
      await res.arrayBuffer();
    }
  } catch (error) {
    status = `error ${error.message}`;
  }
  seen.set(link.href, { ...link, status, finalUrl });
  console.log(`${status}\t${link.control}\t${link.href}${finalUrl ? ' -> ' + finalUrl : ''}`);
}
writeFileSync(`${OUT}/links.json`, JSON.stringify([...seen.values()], null, 2));
console.log(`${links.length} anchors, ${seen.size} distinct`);

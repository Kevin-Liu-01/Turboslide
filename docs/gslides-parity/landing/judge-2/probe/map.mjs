// One short run per direction: where each band starts, where the two hero actions are,
// what text the first two screens hold, and a copy check (em dash, exclamation mark).
import { openPage, load, wait, OUT } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const d = process.argv[2];
const width = Number(process.argv[3] || 1440);
const height = width < 600 ? 844 : 900;
const t0 = Date.now();
const l0 = load();
const { browser, page, errors, requests } = await openPage({ d, width, height });
await wait(1500);
const res = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
  const heads = [...document.querySelectorAll('h1,h2')].map((h) => ({ tag: h.tagName, text: h.textContent.replace(/\s+/g, ' ').trim(), ...r(h) }));
  const ctas = [...document.querySelectorAll('a,button')].filter((a) => /New Presentation|Open the Example Deck/i.test(a.textContent)).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), ...r(a) }));
  const body = document.body.innerText;
  const nav = document.querySelector('header, nav');
  const navPos = nav ? getComputedStyle(nav).position : null;
  return {
    title: document.title,
    height: document.documentElement.scrollHeight,
    heads, ctas, navPos,
    emDash: (body.match(/—/g) || []).length,
    enDash: (body.match(/–/g) || []).length,
    bang: [...body.matchAll(/[^\s]{0,20}!/g)].map((m) => m[0]).slice(0, 10),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    anims: document.getAnimations().length,
  };
});
await browser.close();
const out = { d, width, load: [l0, load()], ms: Date.now() - t0, errors, requests, ...res };
writeFileSync(`${OUT}/map-${d}-${width}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ d, width, load: out.load, ms: out.ms, height: out.height, errors: errors.length, requests: requests.length }));

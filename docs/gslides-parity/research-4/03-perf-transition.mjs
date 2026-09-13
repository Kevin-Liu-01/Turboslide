// Times a client-side route transition on production with and without intent preload, and the
// editor's readiness and thumbnail pipeline. Read only.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const EXE =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'https://turboslide.vercel.app';
const out = {};

const browser = await chromium.launch({ executablePath: EXE, headless: true });

async function editorRun(label, { hover }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const renders = [];
  const fns = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/render')) renders.push({ u: u.replace(BASE, ''), s: r.status(), cc: r.headers()['cache-control'], x: r.headers()['x-vercel-cache'], t: Date.now() });
    if (u.includes('_serverFn')) fns.push({ u: u.split('?')[0].split('/').pop(), s: r.status(), t: Date.now() });
  });
  const t0 = Date.now();
  await page.goto(BASE + '/edit/gt-brand', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const tDcl = Date.now() - t0;
  await page.waitForFunction(() => typeof window.turboslide !== 'undefined', null, { timeout: 60_000 }).catch(() => {});
  const tApi = Date.now() - t0;
  await page.waitForSelector('.ts-filmstrip .ts-card', { timeout: 60_000 }).catch(() => {});
  const tCards = Date.now() - t0;
  const cards = await page.locator('.ts-filmstrip .ts-card').count();
  const firstThumb = await page
    .waitForSelector('.ts-filmstrip .ts-thumb[data-thumb="static"]', { timeout: 30_000 })
    .then(() => Date.now() - t0)
    .catch(() => null);
  await page.waitForTimeout(8000);
  const thumbStates = await page.evaluate(() => {
    const s = { static: 0, clone: 0, plate: 0 };
    for (const el of document.querySelectorAll('.ts-filmstrip .ts-thumb')) s[el.getAttribute('data-thumb')] = (s[el.getAttribute('data-thumb')] || 0) + 1;
    return s;
  });
  const domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const filmstripNodes = await page.evaluate(() => document.querySelector('.ts-filmstrip')?.getElementsByTagName('*').length ?? null);
  // the client-side transition: the mark in the title row links to /decks
  const link = page.locator('a[href="/decks"]').first();
  const hasLink = (await link.count()) > 0;
  let transition = null;
  if (hasLink) {
    if (hover) {
      await link.hover();
      await page.waitForTimeout(6000);
    }
    const fnBefore = fns.length;
    const tClick = Date.now();
    await link.click();
    await page.waitForSelector('.ts-home, main', { timeout: 60_000 }).catch(() => {});
    await page.waitForFunction(() => location.pathname === '/decks' && document.querySelectorAll('a[href^="/edit/"], a[href^="/deck/"]').length > 0, null, { timeout: 60_000 }).catch(() => {});
    transition = { ms: Date.now() - tClick, hover, serverFnCallsDuring: fns.length - fnBefore, fnsAfterHover: fns.slice(fnBefore) };
  }
  await context.close();
  return { label, tDcl, tApi, tCards, cards, firstThumb, thumbStates, domNodes, filmstripNodes, renders: renders.length, renderSample: renders.slice(0, 3), fns: fns.map((f) => f.u), transition };
}

out.editorNoHover = await editorRun('no hover', { hover: false });
console.log(JSON.stringify(out.editorNoHover, null, 1));
out.editorHover = await editorRun('hover preload', { hover: true });
console.log(JSON.stringify(out.editorHover, null, 1));

// the viewer to editor transition (a rep opens a deck from the list)
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '/decks', { waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector('a[href^="/edit/"], a[href^="/deck/"]', { timeout: 60_000 }).catch(() => {});
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/edit/"], a[href^="/deck/"]')).slice(0, 6).map((a) => a.getAttribute('href')));
  const target = page.locator('a[href^="/deck/gt-brand"], a[href^="/edit/gt-brand"]').first();
  let deckOpen = null;
  if ((await target.count()) > 0) {
    const href = await target.getAttribute('href');
    const t = Date.now();
    await target.click();
    await page.waitForFunction((h) => location.pathname.startsWith(h.split('?')[0]), href, { timeout: 60_000 }).catch(() => {});
    await page.waitForSelector('.ts-sheet, .sheet, .ts-stagewrap', { timeout: 60_000 }).catch(() => {});
    deckOpen = { href, ms: Date.now() - t };
  }
  out.listToDeck = { links, deckOpen };
  console.log(JSON.stringify(out.listToDeck));
  await context.close();
}

await browser.close();
writeFileSync('/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/perf-transition.json', JSON.stringify(out, null, 2));
console.log('written');

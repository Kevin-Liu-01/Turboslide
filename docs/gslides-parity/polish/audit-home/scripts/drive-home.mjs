// The human paced drive of production /home (polish round, auditor "home"): the mouse moved in
// steps, a pause after every action, a screenshot after every action worth judging. At 1440 by
// 900 dark: hover every navigation link and the hero buttons (the tooltip), press Light then
// Dark (the swap and the editor pair), click For agents (the anchor jump), click Start from a
// template (the gallery page), Open the GT Deck (the viewer), New Presentation (/new; no edit is
// made so no deck is created; if the address moves to /edit/<id> the id is recorded for the
// teardown), the footer lockup (back to the top). At 390 by 844 dark: the navigation row, the
// hero plate, the comparison table's sideways scroll, the numbers strip. Every step's timing is
// recorded. Teardown: any deck the drive created is trashed and removed through the actions API
// by the wrapper (never printed).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '/Users/kevinliu/repos/Turboslide-live/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE ?? 'https://www.turboslide.com';
const OUT =
  process.env.OUT ?? '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-home';

const steps = [];
const created = [];
let shotIndex = 20;
async function shot(page, name) {
  const file = `${page.__key}-${String(shotIndex++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  return file;
}
function log(page, name, detail) {
  steps.push({ key: page.__key, name, ...detail });
  console.log(`${page.__key} ${name}: ${JSON.stringify(detail)}`);
}

async function moveTo(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 18 });
  await page.waitForTimeout(120);
  return { x, y };
}

async function hover(page, selector, name) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  await moveTo(page, loc);
  await page.waitForTimeout(700);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.pt-tip:not([hidden])');
    return t ? { text: t.textContent.trim().slice(0, 120), visible: t.getBoundingClientRect().width > 0 } : null;
  });
  const file = await shot(page, `hover-${name}`);
  log(page, `hover ${name}`, { tip, file });
}

async function clickAndWait(page, selector, name, expectPath) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  await moveTo(page, loc);
  const t0 = Date.now();
  await loc.click({ delay: 60 });
  let waited = 'no wait';
  if (expectPath) {
    try {
      await page.waitForURL((u) => u.pathname.startsWith(expectPath), { timeout: 15000 });
      waited = `url ${page.url()}`;
    } catch (error) {
      waited = `url timeout, at ${page.url()}`;
    }
  }
  await page.waitForTimeout(900);
  const ms = Date.now() - t0;
  const file = await shot(page, `click-${name}`);
  log(page, `click ${name}`, { ms, waited, url: page.url(), file });
  return page.url();
}

const browser = await chromium.launch({ headless: true });
try {
  // ---- 1440 dark
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('gt-theme', 'dark');
      } catch {}
    });
    const page = await context.newPage();
    page.__key = 'drive-1440-dark';
    await page.goto(`${BASE}/home`, { waitUntil: 'load' });
    await page.waitForSelector('main.ts-product[data-hydrated]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await hover(page, '[data-control="home.nav.decks"]', 'nav-decks');
    await hover(page, '[data-control="home.nav.docs"]', 'nav-docs');
    await hover(page, '[data-control="home.nav.agents"]', 'nav-agents');
    await hover(page, '[data-control="home.nav.github"]', 'nav-github');
    await hover(page, '[data-control="home.theme.light"]', 'theme-light');
    await hover(page, '[data-control="home.nav.new"]', 'nav-new');
    await hover(page, '[data-control="home.hero.new"]', 'hero-new');
    await hover(page, '[data-control="home.hero.templates"]', 'hero-templates');
    await hover(page, '[data-control="home.hero.deck"]', 'hero-deck');
    await hover(page, '[data-control="home.hero.github"]', 'hero-github');
    await hover(page, '[data-control="home.nav.lockup"]', 'nav-lockup');
    // the appearance swap
    {
      const loc = page.locator('[data-control="home.theme.light"]');
      await moveTo(page, loc);
      const t0 = Date.now();
      await loc.click({ delay: 60 });
      await page.waitForTimeout(400);
      const state = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        stored: localStorage.getItem('gt-theme'),
        themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
        lightPressed: document.querySelector('[data-control="home.theme.light"]')?.getAttribute('aria-pressed'),
        darkPressed: document.querySelector('[data-control="home.theme.dark"]')?.getAttribute('aria-pressed'),
        darkShotVisible: (document.querySelector('img[data-shot="01-new-presentation"]')?.getBoundingClientRect().width ?? 0) > 0,
        lightShotVisible: (document.querySelector('img[data-shot="13-editor-light"]')?.getBoundingClientRect().width ?? 0) > 0,
        heroTwin: getComputedStyle(document.querySelector('.ts-product-hero-twin')).backgroundImage.slice(0, 60),
      }));
      const file = await shot(page, 'theme-light-pressed');
      log(page, 'press Light', { ms: Date.now() - t0, state, file });
      // scroll to the editor pair in light
      await page.locator('figure[data-picture="editor"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      const lightPair = await page.evaluate(() => {
        const img = document.querySelector('img[data-shot="13-editor-light"]');
        return { complete: img?.complete, natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null, current: (img?.currentSrc || '').split('/').pop() };
      });
      const file2 = await shot(page, 'theme-light-editor-pair');
      log(page, 'editor pair in light', { lightPair, file: file2 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(300);
      const dark = page.locator('[data-control="home.theme.dark"]');
      await moveTo(page, dark);
      await dark.click({ delay: 60 });
      await page.waitForTimeout(400);
      const file3 = await shot(page, 'theme-dark-pressed');
      log(page, 'press Dark', { theme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')), file: file3 });
    }
    // For agents anchor
    {
      const loc = page.locator('[data-control="home.nav.agents"]');
      await moveTo(page, loc);
      const y0 = await page.evaluate(() => scrollY);
      await loc.click({ delay: 60 });
      await page.waitForTimeout(700);
      const y1 = await page.evaluate(() => scrollY);
      const anchorTop = await page.evaluate(() => Math.round(document.querySelector('#agents').getBoundingClientRect().top));
      const file = await shot(page, 'anchor-agents');
      log(page, 'click For agents', { from: y0, to: y1, url: page.url(), agentsTopInViewport: anchorTop, file });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(300);
    }
    // Start from a template
    await clickAndWait(page, '[data-control="home.hero.templates"]', 'templates', '/decks/templates');
    await page.goBack({ waitUntil: 'load' });
    await page.waitForSelector('main.ts-product', { timeout: 15000 });
    await page.waitForTimeout(600);
    log(page, 'back from templates', { url: page.url(), file: await shot(page, 'back-from-templates') });
    // Open the GT Deck
    await clickAndWait(page, '[data-control="home.hero.deck"]', 'gt-deck', '/deck/gt-brand');
    await page.waitForTimeout(1500);
    log(page, 'viewer settled', { url: page.url(), file: await shot(page, 'gt-deck-settled') });
    await page.goBack({ waitUntil: 'load' });
    await page.waitForSelector('main.ts-product', { timeout: 15000 });
    await page.waitForTimeout(600);
    log(page, 'back from deck', { url: page.url(), file: await shot(page, 'back-from-deck') });
    // New Presentation: a document navigation to /new; no edit is made
    {
      const loc = page.locator('[data-control="home.hero.new"]');
      await moveTo(page, loc);
      const t0 = Date.now();
      await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => null), loc.click({ delay: 60 })]);
      try {
        await page.waitForSelector('.ts-studio, [data-skeleton], .ts-title-row, [data-control="title.home"]', { timeout: 15000 });
      } catch {}
      await page.waitForTimeout(1500);
      const ms = Date.now() - t0;
      const url = page.url();
      const editId = /\/edit\/([^/?#]+)/.exec(url)?.[1];
      if (editId) created.push(editId);
      const state = await page.evaluate(() => ({ title: document.title, studio: !!document.querySelector('.ts-studio'), skeleton: document.querySelector('[data-skeleton]')?.getAttribute('data-skeleton') ?? null, notSaved: document.body.innerText.includes('Not saved yet') }));
      const file = await shot(page, 'new-presentation');
      log(page, 'click New Presentation', { ms, url, editId: editId ?? null, state, file });
      await page.goto(`${BASE}/home`, { waitUntil: 'load' });
      await page.waitForSelector('main.ts-product[data-hydrated]');
      await page.waitForTimeout(500);
    }
    // the footer lockup back to top
    {
      const loc = page.locator('[data-control="home.foot.lockup"]');
      await loc.scrollIntoViewIfNeeded();
      await moveTo(page, loc);
      await page.waitForTimeout(500);
      const file0 = await shot(page, 'footer-hover-lockup');
      await loc.click({ delay: 60 });
      await page.waitForTimeout(600);
      const y = await page.evaluate(() => scrollY);
      const file = await shot(page, 'footer-lockup-clicked');
      log(page, 'click footer lockup', { scrollY: y, url: page.url(), files: [file0, file] });
    }
    // keyboard: tab through the nav, focus rings
    {
      await page.evaluate(() => scrollTo(0, 0));
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-control'));
      const file = await shot(page, 'tab-focus');
      log(page, 'tab x3', { focused, file });
    }
    await context.close();
  }
  // ---- 390 dark
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('gt-theme', 'dark');
      } catch {}
    });
    const page = await context.newPage();
    page.__key = 'drive-390-dark';
    await page.goto(`${BASE}/home`, { waitUntil: 'load' });
    await page.waitForSelector('main.ts-product[data-hydrated]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const navState = await page.evaluate(() => {
      const row = document.querySelector('.ts-product-nav-row');
      const items = [...row.querySelectorAll('a, button, span[role="group"]')].map((e) => ({ control: e.getAttribute('data-control'), w: Math.round(e.getBoundingClientRect().width), visible: e.getBoundingClientRect().width > 0 }));
      return { rowWidth: Math.round(row.getBoundingClientRect().width), items, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    log(page, 'nav at 390', { navState, file: await shot(page, 'nav') });
    const plate = await page.evaluate(() => {
      const p = document.querySelector('.ts-product-plate');
      const r = p.getBoundingClientRect();
      const h1 = document.querySelector('.ts-product-h1').getBoundingClientRect();
      const s = document.querySelector('.ts-product-hero-sentence').getBoundingClientRect();
      const cta = document.querySelector('.ts-product-cta').getBoundingClientRect();
      const facts = document.querySelector('.ts-product-hero-facts').getBoundingClientRect();
      const hero = document.querySelector('.ts-product-hero').getBoundingClientRect();
      return { hero: { h: Math.round(hero.height) }, plate: { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }, h1: { h: Math.round(h1.height), size: getComputedStyle(document.querySelector('.ts-product-h1')).fontSize }, sentence: { lines: Math.round(s.height / (parseFloat(getComputedStyle(document.querySelector('.ts-product-hero-sentence')).lineHeight))), h: Math.round(s.height) }, cta: { h: Math.round(cta.height), rows: Math.round(cta.height / 40) }, facts: { h: Math.round(facts.height) }, plateBelowFold: r.top + r.height > innerHeight, twinVisibleAbovePlate: Math.round(r.top) };
    });
    log(page, 'hero plate at 390', { plate, file: await shot(page, 'hero') });
    // scroll the page in swipes
    for (const [i, sel] of [['numbers', '.ts-product-numbers'], ['cards', '.ts-product-grid'], ['pipe', '.ts-product-pipe'], ['specimens', '.ts-product-specimens'], ['speed', '.ts-product-rows'], ['agents', '.ts-product-agents'], ['table', '.ts-product-table-scroll'], ['footer', '.ts-product-foot']].entries()) {
      const loc = page.locator(sel[1]).first();
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const info = await page.evaluate((s) => {
        const el = document.querySelector(s);
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), scrollW: el.scrollWidth, clientW: el.clientWidth, sideways: el.scrollWidth > el.clientWidth + 1 };
      }, sel[1]);
      log(page, `390 ${sel[0]}`, { info, file: await shot(page, `section-${sel[0]}`) });
    }
    // the table scrolls sideways: drag it
    {
      const loc = page.locator('.ts-product-table-scroll');
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      await page.mouse.move(box.x + 300, box.y + 120, { steps: 5 });
      await page.mouse.down();
      await page.mouse.move(box.x + 60, box.y + 120, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      const left = await page.evaluate(() => document.querySelector('.ts-product-table-scroll').scrollLeft);
      await page.evaluate(() => (document.querySelector('.ts-product-table-scroll').scrollLeft = 200));
      await page.waitForTimeout(300);
      log(page, 'table drag', { scrollLeftAfterDrag: left, file: await shot(page, 'table-scrolled') });
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, 'drive-record.json'), JSON.stringify({ steps, created }, null, 2));
  if (created.length) console.log(`CREATED DECKS TO TEAR DOWN: ${created.join(', ')}`);
  console.log('done');
}

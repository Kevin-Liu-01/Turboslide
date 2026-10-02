// Clutter inventory: opens /new (no write unless --tails), /decks and /home at 1440x900 in both
// themes, shoots them, and reads every visible data-control, interactive element, chrome text and
// tooltip, plus the menu bar's level 0 rows. With --tails (local only) it inserts a shape, a line,
// a picture and a table through the studio API and reads the toolbar per selection.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:4492');
const TAG = opt('--tag', 'local');
const OUT = opt('--out', '/Users/kevinliu/repos/Turboslide-next/docs/gslides-parity/next/clutter');
const DATA = opt('--data', '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/clutter');
const TAILS = args.includes('--tails');
const PAGES = (opt('--pages', 'new,decks,home')).split(',');
mkdirSync(OUT, { recursive: true });
const EXEC = '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = { base: BASE, tag: TAG, startedAt: new Date().toISOString(), pages: {} };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const REGIONS = [
  ['titleRow', '.ts-titlerow, [data-control="titlerow"], header'],
  ['menubar', '[data-control="menubar"]'],
  ['toolbar', '[data-control="toolbar"]'],
  ['rpanel', '.ts-rpanel'],
  ['filmstrip', '[data-control="filmstrip"], .ts-sidebar, aside'],
  ['notes', '.ts-notes-slot'],
  ['stage', '.pt-stagewrap, [data-editor-main]'],
  ['snackbar', '.ts-snackbar, [role="status"], [role="alert"]'],
  ['dialog', '[role="dialog"]'],
];

async function inventory(page) {
  return page.evaluate((regions) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      let p = el;
      while (p) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') return false; p = p.parentElement; }
      return true;
    };
    const SLIDE = '.ts-sheet .pt-slide, .pt-slide [data-block], .ts-thumb, .ts-card-frame';
    const regionOf = (el) => { for (const [name, sel] of regions) if (el.closest(sel)) return name; return 'other'; };
    const label = (el) => (el.getAttribute('aria-label') || el.querySelector?.('.ts-menu-label, .pt-lb')?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const controls = [...document.querySelectorAll('[data-control]')].filter(vis).filter((el) => !el.closest('.pt-slide [data-block]')).map((el) => ({
      id: el.getAttribute('data-control'), tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), label: label(el), tip: el.getAttribute('data-tip'), disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true, region: regionOf(el), interactive: el.matches('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], [role="menuitemcheckbox"], [role="menuitemradio"], [tabindex="0"]'),
      x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], [tabindex="0"]')].filter(vis).filter((el) => !el.closest(SLIDE)).map((el) => ({ id: el.getAttribute('data-control') || el.closest('[data-control]')?.getAttribute('data-control') || null, own: el.hasAttribute('data-control'), tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), label: label(el), tip: el.getAttribute('data-tip'), region: regionOf(el), disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true, y: Math.round(el.getBoundingClientRect().y), x: Math.round(el.getBoundingClientRect().x) }));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const text = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; if (!el || el.closest('script, style, noscript') || el.closest(SLIDE)) continue;
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t || !vis(el)) continue;
      text.push({ t: t.slice(0, 160), region: regionOf(el), ctl: el.closest('[data-control]')?.getAttribute('data-control') ?? null });
    }
    const tips = [...document.querySelectorAll('[data-tip]')].filter(vis).filter((el) => !el.closest(SLIDE)).map((el) => ({ id: el.getAttribute('data-control') || el.closest('[data-control]')?.getAttribute('data-control'), tip: el.getAttribute('data-tip') }));
    const live = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')].filter(vis).map((el) => ({ id: el.getAttribute('data-control'), cls: el.className?.toString?.().slice(0, 80), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) }));
    const root = document.documentElement;
    return { url: location.href, title: document.title, theme: root.getAttribute('data-theme'), rootAttrs: [...root.attributes].map((a) => `${a.name}=${a.value.slice(0, 40)}`), controls, interactive, text, tips, live };
  }, REGIONS);
}

async function menus(page) {
  const out = {};
  const ids = await page.$$eval('[data-control^="menubar."]', (els) => els.map((el) => el.getAttribute('data-control')));
  for (const id of ids) {
    try {
      await page.keyboard.press('Escape');
      await page.click(`[data-control="${id}"]`);
      await page.waitForSelector('[role="menu"][data-level="0"]', { timeout: 8000 });
      await page.waitForTimeout(250);
      out[id] = await page.$$eval('[role="menu"][data-level="0"] > .ts-menu-group > [data-menu-item]', (els) => els.map((el) => ({ id: el.getAttribute('data-menu-item'), label: el.querySelector('.ts-menu-label')?.textContent?.replace(/\s+/g, ' ').trim() ?? el.textContent.trim().slice(0, 60), disabled: el.getAttribute('aria-disabled') === 'true', sub: el.getAttribute('aria-haspopup') === 'menu' || el.getAttribute('aria-haspopup') === 'true', status: el.getAttribute('data-status'), tip: el.getAttribute('data-tip') })));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
    } catch (e) { out[id] = { error: String(e).slice(0, 200) }; }
  }
  await page.keyboard.press('Escape');
  return out;
}

async function ready(page) {
  await page.waitForFunction(() => { try { return Boolean(window.turboslide?.studio); } catch { return false; } }, null, { timeout: 240_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 120_000 }).catch(() => null);
}

const invoke = (page, action, input) => page.evaluate(([id, value]) => window.turboslide.studio.invoke(id, value), [action, input]);
const stateOf = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const toolbarIds = (page) => page.$$eval('[data-control="toolbar"] [data-control]', (els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((el) => el.getAttribute('data-control') + (el.getAttribute('aria-disabled') === 'true' ? ' [disabled]' : '')));

async function tails(page) {
  const out = {};
  out.default = await toolbarIds(page);
  const st = await stateOf(page);
  const created = await invoke(page, 'slide.new', { layout: 'split', after: st.slideId, baseRevision: st.revision }).catch((e) => ({ error: String(e) }));
  if (created?.error) { out.error = created.error; return out; }
  await page.waitForTimeout(2500);
  const list = await invoke(page, 'slide.list');
  const slideId = list[list.findIndex((r) => r.id === st.slideId) + 1]?.id;
  await invoke(page, 'view.goto', { slideId });
  await page.waitForTimeout(1500);
  const slide = (await invoke(page, 'slide.get', { slideId })).slide;
  const blocks = Object.entries(slide.slots ?? {}).flatMap(([slot, l]) => l.map((b) => ({ slot, ...b })));
  const textBlock = blocks.find((b) => ['paragraph', 'text', 'box'].includes(b.type)) ?? blocks.find((b) => b.type === 'heading');
  const slot = textBlock?.slot ?? Object.keys(slide.slots ?? {})[0] ?? 'main';
  const assets = Object.keys((await invoke(page, 'deck.info')).assets ?? {});
  const inserts = [
    { id: 'clutter-shape', type: 'shape', shape: 'rectangle', text: 'Shape text' },
    { id: 'clutter-shot', type: 'shot', asset: assets[0] ?? 'opener-brand' },
    { id: 'clutter-table', type: 'table', columns: [{}, {}], rows: [{ cells: ['A', 'B'] }, { cells: ['1', '2'] }] },
  ];
  for (const block of inserts) {
    const s = await stateOf(page);
    const r = await invoke(page, 'block.insert', { slideId, slot, block, baseRevision: s.revision }).catch((e) => ({ error: String(e) }));
    if (r?.error) out[`insert.${block.type}`] = r.error.slice(0, 200);
    await page.waitForTimeout(1500);
  }
  const clickBlock = async (id, inset) => {
    const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${id}"]`);
    if (!el) return null;
    const box = await el.boundingBox();
    await page.mouse.click(box.x + Math.min(inset, box.width / 2), box.y + Math.min(inset, box.height / 2));
    await page.waitForTimeout(400);
    if (await page.$('.ts-stagewrap [contenteditable="true"]')) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    return (await stateOf(page)).blockId ?? null;
  };
  if (textBlock) { out.textSelected = await clickBlock(textBlock.id, 12); out.text = await toolbarIds(page); await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  out.shapeSelected = await clickBlock('clutter-shape', 2); out.shape = await toolbarIds(page); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  out.imageSelected = await clickBlock('clutter-shot', 2); out.image = await toolbarIds(page);
  await page.screenshot({ path: `${OUT}/editor-image-selected-light-${TAG}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const cell = await page.$('.ts-stagewrap .pt-slide [data-run="clutter-table/rows/0/cells/0"]');
  if (cell) {
    const box = await cell.boundingBox();
    await page.mouse.click(box.x + 8, box.y + box.height / 2); await page.waitForTimeout(300);
    await page.mouse.dblclick(box.x + 8, box.y + box.height / 2); await page.waitForTimeout(600);
    out.tableSelected = (await stateOf(page)).blockId; out.table = await toolbarIds(page);
    await page.screenshot({ path: `${OUT}/editor-table-cell-light-${TAG}.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  } else out.table = 'no cell found';
  return out;
}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  await context.addInitScript((t) => { try { localStorage.setItem('ts-chrome-appearance', t); localStorage.setItem('gt-theme', t); } catch {} }, theme);
  const page = await context.newPage();
  for (const name of PAGES) {
    const path = name === 'new' ? '/new' : `/${name}`;
    const key = `${name}-${theme}`;
    try {
      log('open', BASE + path, theme);
      const t0 = Date.now();
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 240_000 });
      if (name === 'new') await ready(page); else await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => null);
      await page.waitForTimeout(3000);
      const loadMs = Date.now() - t0;
      await page.screenshot({ path: `${OUT}/${name === 'new' ? 'editor-default' : name}-${theme}-${TAG}.png` });
      const inv = await inventory(page);
      result.pages[key] = { loadMs, ...inv };
      if (theme === 'light' && name === 'new') {
        result.pages[key].menus = await menus(page);
        const st = await stateOf(page).catch(() => null);
        result.pages[key].state = st ? { deckId: st.deckId ?? st.deck ?? null, revision: st.revision, keys: Object.keys(st) } : null;
        result.pages[key].pathAfter = await page.evaluate(() => location.pathname);
        if (TAILS) result.pages[key].tails = await tails(page).catch((e) => ({ error: String(e).slice(0, 300) }));
        result.pages[key].pathAfterTails = await page.evaluate(() => location.pathname);
      }
      if (name === 'new') result.pages[key].pathEnd = await page.evaluate(() => location.pathname);
      log('done', key, loadMs, 'ms', inv.controls.length, 'controls');
    } catch (e) { result.pages[key] = { error: String(e).slice(0, 400) }; log('error', key, String(e).slice(0, 200)); }
  }
  await context.close();
}
await browser.close();
result.endedAt = new Date().toISOString();
writeFileSync(`${DATA}/inventory-${TAG}.json`, JSON.stringify(result, null, 1));
log('wrote', `${DATA}/inventory-${TAG}.json`);

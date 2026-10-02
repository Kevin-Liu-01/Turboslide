// B3a day 0 (docs/NEXT.md 4.1.3 item 19): the seven side panels and the eight right click menus
// at 1440 by 900 in both themes, with their controls and words counted, and the More overflow of
// the shape and table tails. Local dev server only: it makes one scratch deck through the product
// and removes it by id at the end (deck.trash, deck.remove).
//   node docs/gslides-parity/round1/build/b3a/day0.mjs --base http://localhost:4505 --out <dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:4505');
const OUT = opt('--out', new URL('.', import.meta.url).pathname + 'day0');
const SHOTS = args.includes('--no-shots') ? false : true;
mkdirSync(OUT, { recursive: true });
const load = () => Number(execSync('sysctl -n vm.loadavg').toString().replace(/[{}]/g, '').trim().split(/\s+/)[0]);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
if (load() >= 24) { console.error(`load ${load()}: not starting (the load rule)`); process.exit(3); }
const result = { base: BASE, startedAt: new Date().toISOString(), loadAtStart: load(), themes: {} };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const invoke = (id, input) => page.evaluate(([a, b]) => window.turboslide.studio.invoke(a, b), [id, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const ctl = (id) => page.locator(`[data-control="${id}"]`).first();
async function waitEditor() {
  await page.waitForFunction(() => { try { return Boolean(window.turboslide?.studio); } catch { return false; } }, null, { timeout: 180_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 120_000 }).catch(() => null);
}
async function settled() {
  for (let i = 0; i < 100; i += 1) {
    const s = await state();
    const words = await page.locator('[data-control="deck.saveState"]').textContent().catch(() => null);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0 && (words === null || /All changes saved|Not saved yet/.test(words))) return s;
    await page.waitForTimeout(200);
  }
  return state();
}
async function escapeAll() { for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); } }
async function menuPath(menuId, ...rowIds) {
  await escapeAll();
  await menuPathKeep(menuId, ...rowIds);
}
/** The same path with the selection kept: no Escape first (Escape clears the selection). */
async function menuPathKeep(menuId, ...rowIds) {
  await ctl(`menubar.${menuId}`).click();
  await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  for (let i = 0; i < rowIds.length - 1; i += 1) {
    await ctl(`menu.${rowIds[i]}`).hover();
    await page.locator(`[data-control="menu.${rowIds[i + 1]}"]`).first().waitFor({ timeout: 6000 });
  }
  await ctl(`menu.${rowIds[rowIds.length - 1]}`).click();
  await page.waitForTimeout(400);
}
/** The facts of one surface: visible data-control ids, interactive elements, text words. */
async function facts(rootSelector) {
  return page.evaluate((root) => {
    const el = document.querySelector(root);
    if (!el) return null;
    const vis = (n) => { const r = n.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(n); return s.visibility !== 'hidden' && s.display !== 'none'; };
    const controls = [...el.querySelectorAll('[data-control]')].filter(vis).map((n) => n.getAttribute('data-control'));
    const interactive = [...el.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], [role="slider"]')].filter(vis);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const p = n.parentElement; if (!p || !vis(p) || p.closest('.pt-slide')) continue; const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) texts.push(t); }
    const tips = [...el.querySelectorAll('[data-tip]')].filter(vis).map((n) => n.getAttribute('data-tip'));
    const words = texts.join(' ').split(/\s+/).filter(Boolean).length;
    const heading = el.querySelector('h1, h2, h3, [role="heading"], .ts-panel-title, .ts-rpanel-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return { heading, controls: controls.length, interactive: interactive.length, words, tipWords: tips.join(' ').split(/\s+/).filter(Boolean).length, ids: controls, texts };
  }, rootSelector);
}
async function shot(name) { if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72 }); }

// ------------------------------------------------------------------------------- the scratch deck
log('open /new');
await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
await waitEditor();
const id = `b3a-day0-${Date.now().toString(36)}`;
const made = await page.request.post(`${BASE}/api/actions/deck.create`, { data: { name: 'B3a day 0', id, from: 'blank' } });
result.deck = { id, create: made.status() };
log('deck.create', made.status(), id);
if (made.status() !== 200) { console.error(await made.text()); await browser.close(); process.exit(2); }
try {
  await page.goto(`${BASE}/edit/${id}`, { waitUntil: 'domcontentloaded' });
  await waitEditor();
  await settled();
  let s = await state();
  /* a second slide for the objects; the first keeps the template's title slide */
  await invoke('slide.new', { after: s.slideId, layout: 'blank', baseRevision: s.revision });
  await settled();
  const list = await invoke('slide.list');
  const slides = (Array.isArray(list) ? list : list.slides ?? list.items ?? []).map((x) => (typeof x === 'string' ? x : x.id));
  const objects = slides[1];
  await invoke('view.goto', { slideId: objects }).catch(() => undefined);
  await page.waitForTimeout(800);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 96; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 96, 64); g.fillStyle = '#e8e8e8'; g.fillRect(12, 12, 72, 40); return c.toDataURL('image/png'); });
  s = await state();
  const asset = await invoke('asset.add', { id: 'b3a-shot-asset', url: png, role: 'capture', alt: 'day 0 picture', baseRevision: s.revision });
  await settled();
  const blocks = [
    { id: 'b3a-text', type: 'text', text: 'A text box for the day 0 read', pos: { x: 80, y: 60, w: 620, h: 90 } },
    { id: 'b3a-shape', type: 'shape', shape: 'rectangle', text: 'Shape', pos: { x: 80, y: 200, w: 300, h: 160 } },
    { id: 'b3a-line', type: 'shape', shape: 'line', pos: { x: 440, y: 260, w: 260, h: 4 } },
    { id: 'b3a-shot', type: 'shot', asset: asset.id ?? 'b3a-shot-asset', pos: { x: 80, y: 420, w: 240, h: 160 } },
    { id: 'b3a-table', type: 'table', columns: [{}, {}, {}], rows: [{ cells: ['A', 'B', 'C'], header: true }, { cells: ['1', '2', '3'] }], pos: { x: 800, y: 60, w: 700, h: 200 } },
  ];
  for (const block of blocks) {
    s = await state();
    await invoke('block.insert', { slideId: objects, slot: 'main', block, baseRevision: Math.max(s.revision, asset.revision ?? 0) }).catch((e) => log('insert', block.id, String(e).slice(0, 160)));
    await settled();
  }
  const blockEl = (bid) => page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${bid}"]`).first();
  async function selectBlock(bid) {
    await escapeAll();
    await blockEl(bid).click({ position: { x: 6, y: 6 } }).catch(() => blockEl(bid).click());
    await page.waitForTimeout(300);
    if (await page.locator('.ts-stagewrap.ts-editor[data-editing]').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  }
  async function contextRead(name, open) {
    await escapeAll();
    try {
      await open();
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 });
      await page.waitForTimeout(250);
      const rows = await page.$$eval('.ts-context-menu [data-menu-item]', (els) => els.filter((e) => e.getClientRects().length > 0 && !e.closest('[data-level]:not([data-level="0"])')).map((e) => ({ id: e.getAttribute('data-menu-item'), label: (e.querySelector('.ts-menu-label')?.textContent ?? e.textContent ?? '').replace(/\s+/g, ' ').trim(), disabled: e.getAttribute('aria-disabled') === 'true' })));
      const f = await facts('.ts-context-menu');
      return { rows: rows.length, disabled: rows.filter((r) => r.disabled).length, words: f?.words ?? 0, list: rows };
    } catch (e) {
      return { error: String(e).slice(0, 200) };
    } finally {
      await shot(`context-${name}-${THEME}`);
      await escapeAll();
    }
  }
  async function panelRead(name, open) {
    await escapeAll();
    try {
      await open();
      await page.waitForTimeout(900);
      const f = await facts('.ts-rpanel');
      await shot(`panel-${name}-${THEME}`);
      return f === null ? { error: 'no .ts-rpanel' } : { heading: f.heading, controls: f.controls, interactive: f.interactive, words: f.words, tipWords: f.tipWords, ids: f.ids, texts: f.texts };
    } catch (e) {
      return { error: String(e).slice(0, 200) };
    }
  }
  async function closePanel() {
    const open = await page.locator('.ts-rpanel [data-control]').count();
    if (open > 0) await ctl('title.sidePanel').click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
  async function tailRead(bid, cell) {
    await escapeAll();
    if (cell) {
      const run = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${bid}/rows/1/cells/0"]`).first();
      await selectBlock(bid);
      await run.click().catch(() => undefined);
      await page.waitForTimeout(300);
      await run.dblclick().catch(() => undefined);
    } else await selectBlock(bid);
    await page.waitForTimeout(700);
    const tail = await page.evaluate(() => {
      const bar = document.querySelector('[data-control="toolbar"]') ?? document.querySelector('.ts-toolbar');
      if (!bar) return null;
      const slots = [...bar.querySelectorAll('[data-slot]')];
      return { drawn: slots.filter((n) => n.getAttribute('aria-hidden') !== 'true').map((n) => n.getAttribute('data-slot')), folded: slots.filter((n) => n.getAttribute('aria-hidden') === 'true').map((n) => n.getAttribute('data-slot')), more: bar.querySelector('[data-control="toolbar.more"]')?.getAttribute('data-count') ?? null };
    });
    await shot(`tail-${cell ? 'cell' : bid.replace('b3a-', '')}-${THEME}`);
    await escapeAll();
    return tail;
  }

  let THEME = 'light';
  for (THEME of ['light', 'dark']) {
    log('theme', THEME, 'load', load());
    await menuPath('view', 'view.appearance', `view.appearance.${THEME}`).catch((e) => log('appearance', String(e).slice(0, 120)));
    await page.waitForTimeout(600);
    const out = { panels: {}, context: {}, tails: {}, theme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')) };
    await invoke('view.goto', { slideId: objects }).catch(() => undefined);
    await page.waitForTimeout(500);
    /* the panels */
    out.panels.formatOptions = await panelRead('format-options', async () => { await selectBlock('b3a-text'); await menuPathKeep('format', 'format.formatOptions'); });
    await closePanel();
    out.panels.brandKit = await panelRead('brand-kit', () => menuPath('slide', 'slide.changeTheme'));
    await closePanel();
    out.panels.comments = await panelRead('comments', () => ctl('title.comments').click());
    await closePanel();
    out.panels.versionHistory = await panelRead('version-history', () => menuPath('file', 'file.versionHistory', 'file.versionHistory.see'));
    await closePanel();
    out.panels.assist = await panelRead('assist', () => ctl('title.assist').click());
    await closePanel();
    out.panels.checkSlides = await panelRead('check-slides', () => menuPath('tools', 'tools.checkSlides'));
    await closePanel();
    out.panels.diagram = await panelRead('diagram', () => menuPath('insert', 'insert.diagram'));
    await closePanel();
    /* the right click menus */
    out.context.card = await contextRead('card', () => page.locator('.ts-card[data-id]').nth(1).click({ button: 'right' }));
    out.context.emptySlide = await contextRead('empty-slide', async () => {
      const sheet = await page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)').first().boundingBox();
      await page.mouse.click(sheet.x + sheet.width - 30, sheet.y + sheet.height - 30, { button: 'right' });
    });
    out.context.text = await contextRead('text', async () => { await selectBlock('b3a-text'); await blockEl('b3a-text').click({ button: 'right', position: { x: 6, y: 6 } }); });
    out.context.picture = await contextRead('picture', async () => { await selectBlock('b3a-shot'); await blockEl('b3a-shot').click({ button: 'right' }); });
    out.context.shape = await contextRead('shape', async () => { await selectBlock('b3a-shape'); await blockEl('b3a-shape').click({ button: 'right', position: { x: 6, y: 6 } }); });
    out.context.line = await contextRead('line', async () => { await selectBlock('b3a-line'); await blockEl('b3a-line').click({ button: 'right' }); });
    out.context.table = await contextRead('table', async () => {
      await selectBlock('b3a-table');
      const box = await blockEl('b3a-table').boundingBox();
      await page.mouse.click(box.x + 2, box.y + 2, { button: 'right' });
    });
    out.context.cell = await contextRead('cell', async () => {
      await selectBlock('b3a-table');
      await page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="b3a-table/rows/1/cells/1"]').first().click({ button: 'right' });
    });
    /* the tails' More overflow */
    out.tails.shape = await tailRead('b3a-shape', false);
    out.tails.cell = await tailRead('b3a-table', true);
    result.themes[THEME] = out;
  }
  await menuPath('view', 'view.appearance', 'view.appearance.light').catch(() => undefined);
} finally {
  /* remove the scratch deck by id */
  try {
    const info = await page.request.post(`${BASE}/api/actions/deck.info?deck=${id}`, { data: {} });
    const rev = (await info.json()).revision;
    const t = await page.request.post(`${BASE}/api/actions/deck.trash`, { data: { id, baseRevision: rev } });
    const info2 = await page.request.post(`${BASE}/api/actions/deck.info?deck=${id}`, { data: {} });
    const rev2 = (await info2.json().catch(() => ({}))).revision ?? rev;
    const r = await page.request.post(`${BASE}/api/actions/deck.remove`, { data: { id, confirm: true, baseRevision: rev2 } });
    const gone = await page.request.post(`${BASE}/api/actions/deck.info?deck=${id}`, { data: {} });
    result.cleanup = { trash: t.status(), remove: r.status(), infoAfter: gone.status() };
  } catch (e) {
    result.cleanup = { error: String(e).slice(0, 200) };
  }
  result.endedAt = new Date().toISOString();
  result.loadAtEnd = load();
  writeFileSync(`${OUT}/day0.json`, JSON.stringify(result, null, 1));
  log('cleanup', JSON.stringify(result.cleanup), 'load', result.loadAtEnd);
  await browser.close();
}

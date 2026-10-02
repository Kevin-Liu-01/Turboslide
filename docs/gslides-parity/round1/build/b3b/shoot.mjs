// Lane B3b's pictures of the editor chrome, before and after each push (docs/NEXT.md 4.1.3 items
// 13 to 18): one deck made from /new by its first write on a local dev server, then at 1440 by
// 900 and 390 by 844 in the light and the dark chrome, with the deck's own appearance light
// (the case of audit-brand-surfaces rank 5): the title row on the fresh draft and after the
// first write, the editor, the Share dialog, Version history, the presenter view, the /deck view
// and the palette. The deck is trashed and deleted forever by its id at the end.
//
//   node docs/gslides-parity/round1/build/b3b/shoot.mjs <base> <label> [surface,...]
//
// The run refuses to start at a one minute load average of 24 or more (the round's load rule).
import { createRequire } from 'node:module';
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';

const require = createRequire('/Users/kevinliu/repos/Turboslide-next/package.json');
const { chromium } = require('playwright-core');

const [base = 'http://localhost:4506', label = 'before', onlyArg = ''] = process.argv.slice(2);
const only = onlyArg === '' ? null : new Set(onlyArg.split(','));
const want = (surface) => only === null || only.has(surface);
const OUT = new URL('./', import.meta.url).pathname;
const LOG = `/Users/kevinliu/repos/Turboslide-next/.turboslide/round1/b3b/shoot-${label}.jsonl`;
mkdirSync('/Users/kevinliu/repos/Turboslide-next/.turboslide/round1/b3b', { recursive: true });
const log = (o) =>
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), load: loadavg()[0], ...o }) + '\n');

if (loadavg()[0] >= 24) {
  console.error(`load ${loadavg()[0].toFixed(2)}: not started`);
  process.exit(2);
}
log({ start: label, base });

const views = [
  { w: 1440, h: 900, tag: '1440' },
  { w: 390, h: 844, tag: '390' },
];
const browser = await chromium.launch();

async function settle(page) {
  await page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}
async function shot(page, name, v, theme, clip) {
  const file = `${label}-${name}-${v.tag}-${theme}.png`;
  await page.screenshot({ path: `${OUT}${file}`, ...(clip ? { clip } : {}) });
  log({ shot: file });
}
async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    log({ step: name, error: String(error).split('\n')[0].slice(0, 300) });
    console.error(name, String(error).split('\n')[0]);
  }
}
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
const esc = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};
const themed = (theme) => (t) => {
  try {
    localStorage.setItem('gt-theme', t);
    localStorage.setItem('ts-chrome-appearance', t);
  } catch {}
};

// the warm up visit: the dependency optimizer's first load reload happens here, not in a shot
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/new`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await settle(page).catch(() => undefined);
  await ctx.close();
}

// the deck: the first write on /new, the light appearance set through the window API
let deckId = '';
let storage;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(themed('light'), 'light');
  const page = await ctx.newPage();
  await page.goto(`${base}/new`, { waitUntil: 'load', timeout: 90_000 });
  await settle(page);
  for (const v of views) {
    if (!want('draft')) break;
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.waitForTimeout(600);
    await shot(page, 'draft', v, 'light', { x: 0, y: 0, width: v.w, height: 120 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  await page.locator('.ts-stage, .pt-stage, main').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+m');
  await page.waitForFunction(() => location.pathname.startsWith('/edit/'), null, { timeout: 90_000 });
  deckId = decodeURIComponent(/\/edit\/([^/?#]+)/.exec(new URL(page.url()).pathname)[1]);
  log({ created: deckId });
  /* the title row within 5 s after the deck's first write in its editor (the first on /new made
     the deck): the name plate and the deck name */
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(2000);
  if (want('firstwrite')) await shot(page, 'firstwrite', views[0], 'light', { x: 0, y: 0, width: 1440, height: 120 });
  const facts = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    return { name: r('[data-control="deck.name"]')?.width, plate: Boolean(document.querySelector('.ts-title-name-plate')) };
  });
  log({ firstwrite: facts });
  const info = await invoke(page, 'deck.info');
  await invoke(page, 'deck.set', { baseRevision: info.revision, path: '/defaults/appearance', value: 'light' }).catch((e) => log({ setAppearance: String(e) }));
  await page.waitForTimeout(1000);
  storage = await ctx.storageState();
  await ctx.close();
}
console.log('deck', deckId);

for (const theme of ['light', 'dark']) {
  for (const v of views) {
    const ctx = await browser.newContext({
      viewport: { width: v.w, height: v.h },
      colorScheme: theme,
      storageState: storage,
      isMobile: v.w < 768,
      hasTouch: v.w < 768,
    });
    await ctx.addInitScript(themed(theme), theme);
    const page = await ctx.newPage();
    await step(`editor ${v.tag} ${theme}`, async () => {
      await page.goto(`${base}/edit/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90_000 });
      await settle(page);
      if (want('editor')) await shot(page, 'editor', v, theme);
      if (want('titlerow')) await shot(page, 'titlerow', v, theme, { x: 0, y: 0, width: v.w, height: 120 });
      const facts = await page.evaluate(() => {
        const r = (s) => {
          const b = document.querySelector(s)?.getBoundingClientRect();
          return b ? { x: Math.round(b.x), w: Math.round(b.width), r: Math.round(b.right) } : null;
        };
        return {
          row: r('[data-control="title.row"]'),
          scrollW: document.querySelector('[data-control="title.row"]')?.scrollWidth,
          name: r('[data-control="deck.name"]'),
          slideshow: r('[data-control="present.split"]'),
          share: r('[data-control="share.open"]'),
          more: r('[data-control="title.more"]'),
        };
      });
      log({ titlerow: `${v.tag}-${theme}`, facts });
    });
    if (want('more'))
      await step('more', async () => {
        const more = page.locator('[data-control="title.more"]');
        if ((await more.count()) === 0 || !(await more.isVisible())) return;
        await more.click({ timeout: 5000 });
        await page.waitForTimeout(600);
        await shot(page, 'more', v, theme);
        await esc(page);
      });
    if (want('select'))
      await step('select', async () => {
        /* a text box placed once (setup) and selected by a click: the ring, the chip, the handles */
        const has = await page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap .pt-slide [data-block="b3b-box"]')));
        if (!has) {
          const st = await page.evaluate(() => window.turboslide.studio.describe().state);
          await invoke(page, 'block.insert', {
            baseRevision: st.revision,
            slideId: st.slideId,
            slot: 'main',
            block: { id: 'b3b-box', type: 'text', text: 'A selected box', pos: { x: 160, y: 160, w: 640, h: 90 } },
          }).catch((e) => log({ insert: String(e).slice(0, 200) }));
          await page.waitForTimeout(1200);
        }
        await page.locator('.ts-stagewrap .pt-slide [data-block="b3b-box"]').first().click({ timeout: 8000 });
        await page.waitForTimeout(500);
        await shot(page, 'select', v, theme);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      });
    if (want('menus'))
      await step('menus', async () => {
        const key = page.locator('[data-control="toolbar.menus"]');
        if ((await key.count()) === 0 || !(await key.isVisible())) return;
        await key.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        await page.locator('#ts-menu-menus [data-menu-item="menus.insert"]').first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
        await shot(page, 'menus', v, theme);
        await esc(page);
      });
    if (want('share'))
      await step('share', async () => {
        await page.locator('[data-control="share.open"]').first().click({ timeout: 8000 });
        const skip = page.locator('[data-control="dialog.namePrompt.skip"]');
        if (await skip.waitFor({ timeout: 1500 }).then(() => true).catch(() => false)) await skip.click().catch(() => {});
        await page.locator('[data-control="dialog.share"]').waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1200);
        await shot(page, 'share', v, theme);
        await esc(page);
      });
    if (want('versions'))
      await step('versions', async () => {
        await page.keyboard.press('Meta+Alt+Shift+KeyH');
        await page.locator('.ts-versions, [data-control="panel.versions"]').first().waitFor({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, 'versions', v, theme);
        await esc(page);
      });
    if (want('palette') && v.w >= 1024)
      await step('palette', async () => {
        await page.locator('[data-control="menubar.help"]').first().click({ timeout: 5000 });
        await page.locator('[data-control="menu.help.searchMenus"]').first().click({ timeout: 5000 });
        await page.waitForTimeout(800);
        await page.keyboard.type('assist', { delay: 40 });
        await page.waitForTimeout(800);
        await shot(page, 'palette', v, theme);
        await esc(page);
      });
    if (want('present'))
      await step('present', async () => {
        const p2 = await ctx.newPage();
        await p2.goto(`${base}/present/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90_000 });
        await p2.evaluate(() => document.fonts.ready);
        await p2.waitForTimeout(3000);
        await shot(p2, 'present', v, theme);
        await p2.close();
      });
    if (want('view'))
      await step('view', async () => {
        const p3 = await ctx.newPage();
        await p3.goto(`${base}/deck/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90_000 });
        await p3.evaluate(() => document.fonts.ready);
        await p3.waitForTimeout(3000);
        await shot(p3, 'view', v, theme);
        await p3.close();
      });
    await ctx.close();
  }
}

// the teardown by id: trash then delete forever through the window API
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storage });
  const page = await ctx.newPage();
  await step('teardown', async () => {
    await page.goto(`${base}/edit/${encodeURIComponent(deckId)}`, { waitUntil: 'load', timeout: 90_000 });
    await settle(page);
    let info = await invoke(page, 'deck.info');
    const trashed = await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
    const rev = trashed?.revision ?? info.revision;
    const removed = await page.evaluate(
      async ([id, r]) => {
        const res = await fetch(`/api/actions/deck.remove?deck=${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, confirm: true, baseRevision: r }),
        });
        return res.status;
      },
      [deckId, rev],
    );
    const after = await page.evaluate(async (id) => (await fetch(`/edit/${encodeURIComponent(id)}`)).status, deckId);
    log({ teardown: deckId, removed, after });
    console.log('teardown', deckId, 'remove', removed, 'edit after', after);
  });
  await ctx.close();
}
await browser.close();
log({ end: label });

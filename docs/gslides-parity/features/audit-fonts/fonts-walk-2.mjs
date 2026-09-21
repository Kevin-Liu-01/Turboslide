// The second fonts walk on production: the Format > Text submenu rows (menu.format.text.*), a
// digits column typed into the body run (proportional digits in the sheet face), a 2x zoom of the
// disabled Font control, then File > Move to trash, Delete forever and the 404s.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = 'https://turboslide.vercel.app';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/features/audit-fonts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const rows = [];
const record = (step, expected, observed, ok) => { rows.push({ n: rows.length + 1, step, expected, observed: String(observed), ok }); console.log(`${ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d '} ${rows.length} ${step}\n       expected: ${expected}\n       observed: ${String(observed).slice(0, 1200)}`); };
const step = async (name, expected, fn) => { try { const r = await fn(); record(name, expected, r.observed, r.ok); return r; } catch (e) { record(name, expected, `error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, null); return { ok: null }; } };
const typeHuman = async (page, text) => { for (const ch of text) { await page.keyboard.type(ch); await sleep(rand(40, 90)); } };
const press = async (page, key, times = 1) => { for (let i = 0; i < times; i += 1) { await page.keyboard.press(key); await sleep(rand(50, 90)); } };
const moveHuman = async (page, from, to, steps = 12) => { for (let i = 1; i <= steps; i += 1) { const t = i / steps; await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t); await sleep(rand(14, 26)); } };
const clickAt = async (page, x, y) => { await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6); await sleep(rand(40, 90)); await page.mouse.click(x, y); await sleep(rand(120, 220)); };
const dblclickAt = async (page, x, y) => { await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6); await sleep(rand(40, 90)); await page.mouse.dblclick(x, y); await sleep(rand(160, 260)); };
const hoverAt = async (page, x, y) => { await moveHuman(page, { x: x - 60, y: y + 30 }, { x, y }, 8); await sleep(800); };
const ctl = (page, c) => page.locator(`[data-control="${c}"]`);
const clickControl = async (page, c) => { const el = ctl(page, c).first(); await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined); const r = await el.boundingBox(); if (!r) throw new Error(`no control ${c}`); await clickAt(page, r.x + r.width / 2, r.y + r.height / 2); };
const invoke = (page, a, i = {}) => page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [a, i]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => { await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 }); await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 }); };
const settled = async (page, timeout = 20_000) => { const until = Date.now() + timeout; for (;;) { const s = await state(page); if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s; if (Date.now() > until) return s; await sleep(150); } };
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const runBox = async (page, re) => { const all = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run]'); const n = await all.count(); for (let i = 0; i < n; i += 1) { const name = await all.nth(i).getAttribute('data-run'); if (re.test(name ?? '')) return { box: await all.nth(i).boundingBox(), run: name }; } return { box: null, run: null }; };
const shot = (page, name, clip) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
let deckId = '';
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  deckId = (await invoke(page, 'deck.info')).id;
  record('the draft opened', 'an untitled id', deckId, /^untitled-/.test(deckId));

  await step('a digits column in the body run', 'proportional digits: the rows 1111 and 0000 end at different x', async () => {
    const head = await runBox(page, /heading/);
    await clickAt(page, head.box.x + head.box.width / 2, head.box.y + head.box.height / 2);
    await dblclickAt(page, head.box.x + head.box.width / 2, head.box.y + head.box.height / 2);
    await press(page, `${MOD}+a`);
    await typeHuman(page, 'Pipeline by quarter');
    await press(page, 'Escape');
    await sleep(300);
    const lead = await runBox(page, /lead|body|sub/);
    if (!lead.box) return { ok: null, observed: 'no body run' };
    await clickAt(page, lead.box.x + 20, lead.box.y + lead.box.height / 2);
    await dblclickAt(page, lead.box.x + 20, lead.box.y + lead.box.height / 2);
    await press(page, `${MOD}+a`);
    await typeHuman(page, '1111 pipeline');
    await press(page, 'Shift+Enter');
    await typeHuman(page, '0000 pipeline');
    await press(page, 'Shift+Enter');
    await typeHuman(page, '$1,111,000 booked');
    await press(page, 'Shift+Enter');
    await typeHuman(page, '$8,000,000 booked');
    await sleep(400);
    await settled(page);
    const nb = (await runBox(page, /lead|body|sub/)).box;
    const cs = await page.evaluate(() => { const el = [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].find((e) => /lead|body|sub/.test(e.getAttribute('data-run') ?? '')); const s = getComputedStyle(el); return { fontSize: s.fontSize, fontWeight: s.fontWeight, fontFeatureSettings: s.fontFeatureSettings, fontVariantNumeric: s.fontVariantNumeric, run: el.getAttribute('data-run') }; });
    await shot(page, 'body-digits-proportional-2x', nb ? { x: Math.max(0, nb.x - 8), y: Math.max(0, nb.y - 8), width: Math.min(1440 - nb.x + 8, Math.max(420, nb.width + 16)), height: Math.min(900 - nb.y + 8, nb.height + 16) } : undefined);
    return { ok: cs.fontVariantNumeric === 'normal' && cs.fontFeatureSettings === 'normal', observed: JSON.stringify(cs) };
  });

  await step('the disabled Font control at 2x', 'a zoom of the text tail around Font', async () => {
    const head = await runBox(page, /heading/);
    await press(page, 'Escape');
    await sleep(200);
    await clickAt(page, head.box.x + 12, head.box.y + head.box.height / 2);
    await sleep(400);
    const b = await ctl(page, 'toolbar.font').first().boundingBox();
    if (!b) return { ok: null, observed: 'no control' };
    await shot(page, 'toolbar-font-disabled-2x', { x: Math.max(0, b.x - 120), y: b.y - 20, width: 420, height: 72 });
    return { ok: true, observed: JSON.stringify(b) };
  });

  await step('Format > Text submenu rows', 'the rows of the Text submenu on production, and whether a Font row exists', async () => {
    await clickControl(page, 'menubar.format');
    await page.locator('#ts-menu-format').waitFor({ timeout: 8000 });
    const trig = page.locator('[data-control="menu.format.text"]').first();
    const tb = await trig.boundingBox();
    if (tb) await hoverAt(page, tb.x + tb.width / 2, tb.y + tb.height / 2);
    await sleep(600);
    const items = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.format.text"]')].filter((e) => e.getClientRects().length > 0).map((e) => `${e.getAttribute('data-control')}: ${e.textContent?.trim().slice(0, 40)}${e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled') ? ' (disabled)' : ''}`));
    await shot(page, 'format-text-submenu', { x: 0, y: 40, width: 900, height: 520 });
    await press(page, 'Escape');
    await sleep(200);
    if ((await page.locator('[id^="ts-menu-"]:visible').count()) > 0) await press(page, 'Escape');
    return { ok: items.length > 0, observed: JSON.stringify({ items, fontRow: items.some((i) => /font/i.test(i)) }) };
  });
} finally {
  let trashed = false;
  if (deckId) {
    await step('File > Move to trash', '/decks and the card not listed', async () => {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page); await settled(page); await press(page, 'Escape', 2);
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 }).catch(() => undefined);
      const listed = await page.locator(`[data-control="home.card.${deckId}"]`).first().isVisible().catch(() => false);
      trashed = true;
      return { ok: /\/decks/.test(page.url()) && !listed, observed: `${page.url()}; card listed ${listed}` };
    });
    if (!trashed) { try { await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined); await editorReady(page).catch(() => undefined); const info = await invoke(page, 'deck.info').catch(() => null); if (info) await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined); } catch {} }
    await step('Delete forever, then GET /edit and /deck', 'both 404', async () => {
      let how = 'the trash page';
      try {
        await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', { timeout: 30_000 });
        const card = page.locator(`[data-control="trash.card.${deckId}"]`);
        await card.waitFor({ timeout: 30_000 });
        await clickControl(page, `trash.delete.${deckId}`);
        await clickControl(page, 'trash.confirm.ok');
        await card.waitFor({ state: 'detached', timeout: 30_000 });
      } catch (error) {
        how = `the trash page failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); the actions API`;
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info) { await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined); const again = await invoke(page, 'deck.info').catch(() => null); await invoke(page, 'deck.remove', { id: deckId, baseRevision: again?.revision ?? info.revision, confirm: true }).catch(() => undefined); }
      }
      const status = {}; const until = Date.now() + 20_000;
      for (;;) { for (const p of ['edit', 'deck']) { status[p] = (await context.request.get(`${BASE}/${p}/${deckId}`)).status(); } if (status.edit === 404 && status.deck === 404) break; if (Date.now() > until) break; await sleep(1000); }
      return { ok: status.edit === 404 && status.deck === 404, observed: `${how}; /edit ${status.edit}, /deck ${status.deck}` };
    });
  }
  writeFileSync(path.join(OUT, 'walk-2.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), deckId, rows }, null, 2));
  await browser.close();
  console.log(`\n${rows.length} steps, ${rows.filter((r) => r.ok === false).length} failed; deck ${deckId}`);
}

#!/usr/bin/env node
// Deletes forever a scratch deck left on production, and diagnoses asset.add on a fresh scratch
// deck (file data URL and url data URL through the window API, with the server responses), then
// trashes and deletes that deck too.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = 'https://turboslide.vercel.app';
const LEFT = process.argv[2] ?? null;
const PNG = process.argv[3] ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const responses = [];
page.on('response', async (res) => {
  const url = res.url();
  if (!/\/_server|\/api\/|_serverFn|createServerFn/.test(url)) return;
  let body = '';
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    body = '(no body)';
  }
  responses.push(`${res.status()} ${url.replace(BASE, '').slice(0, 120)} :: ${body.replace(/\s+/g, ' ')}`);
});
const invoke = (action, input = {}) => page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async () => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const status = async (id) => {
  const a = await page.request.get(`${BASE}/edit/${id}`, { maxRedirects: 0 });
  const b = await page.request.get(`${BASE}/deck/${id}`, { maxRedirects: 0 });
  return `/edit ${a.status()}, /deck ${b.status()}`;
};
const deleteForever = async (id) => {
  for (let round = 1; round <= 3; round += 1) {
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 }).catch(() => undefined);
    await sleep(3000);
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-control^="trash.card."]')].map((el) => el.getAttribute('data-control')));
    console.log(`trash round ${round}: cards ${cards.join(',') || 'none'}; page text ${(await page.evaluate(() => document.querySelector('.ts-home-page')?.textContent ?? '')).replace(/\s+/g, ' ').slice(0, 200)}`);
    if (cards.includes(`trash.card.${id}`)) {
      await page.locator(`[data-control="trash.delete.${id}"]`).click();
      await page.locator('[data-control="trash.confirm.ok"]').click();
      await page.locator(`[data-control="trash.card.${id}"]`).waitFor({ state: 'detached', timeout: 30_000 });
      console.log(`deleted forever ${id}`);
      return true;
    }
    await sleep(10_000);
  }
  return false;
};
try {
  if (LEFT) {
    console.log(`left deck ${LEFT}: ${await status(LEFT)}`);
    // is it in the trash?
    let done = await deleteForever(LEFT);
    if (!done) {
      // open it and use the actions API
      await page.goto(`${BASE}/edit/${LEFT}`, { waitUntil: 'domcontentloaded' });
      const ready = await editorReady().then(() => true).catch(() => false);
      console.log(`opened /edit/${LEFT}: editor ready ${ready}; url ${page.url()}`);
      if (ready) {
        const info = await invoke('deck.info').catch((e) => ({ error: String(e) }));
        console.log(`deck.info ${JSON.stringify(info).slice(0, 300)}`);
        const t = await invoke('deck.trash', { id: LEFT, baseRevision: info.revision }).catch((e) => ({ error: String(e).slice(0, 200) }));
        console.log(`deck.trash ${JSON.stringify(t).slice(0, 200)}`);
        const r = await invoke('deck.remove', { id: LEFT, baseRevision: t?.revision ?? info.revision, confirm: true }).catch((e) => ({ error: String(e).slice(0, 200) }));
        console.log(`deck.remove ${JSON.stringify(r).slice(0, 200)}`);
      }
      done = await deleteForever(LEFT);
    }
    for (let i = 0; i < 10; i += 1) {
      const s = await status(LEFT);
      console.log(`left deck ${LEFT} after: ${s}`);
      if (/\/edit 404/.test(s)) break;
      await sleep(3000);
    }
  }
  if (PNG) {
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    const info = await invoke('deck.info');
    const deckId = info.id;
    console.log(`diagnostic deck ${deckId}`);
    const dataUrl = `data:image/png;base64,${readFileSync(PNG).toString('base64')}`;
    const slideId = (await state()).slideId;
    // 1. asset.add with url: data URL (what the walk did)
    for (const variant of ['url', 'file']) {
      responses.length = 0;
      const s0 = await state();
      const t0 = Date.now();
      const out = await page.evaluate(
        async ([v, d, rev]) => {
          try {
            const r = await window.turboslide.studio.invoke('asset.add', {
              ...(v === 'url' ? { url: d } : { file: d, id: `diag-${v}` }),
              role: 'capture',
              alt: `diag ${v}`,
              baseRevision: rev,
            });
            return { ok: true, out: JSON.stringify(r).slice(0, 300) };
          } catch (e) {
            return { ok: false, err: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) };
          }
        },
        [variant, dataUrl, s0.revision],
      );
      const ms = Date.now() - t0;
      const s1 = await state();
      const assets = await page.evaluate(() => Object.keys(window.turboslide.studio.describe().document?.deck?.assets ?? {}).join(','));
      console.log(`asset.add ${variant}: ${ms} ms; ${JSON.stringify(out)}; revision ${s0.revision} -> ${s1.revision}; pending ${JSON.stringify(s1.sync ?? s1.pending)}; assets ${assets}`);
      console.log(`  responses: ${responses.join('\n    ') || 'none captured'}`);
      // the asset landing over the next 20 s
      let landed = null;
      for (let i = 0; i < 20; i += 1) {
        const slide = await invoke('deck.info').catch(() => null);
        const st = await state();
        if (st.revision > s0.revision) {
          landed = `revision ${st.revision} after ${(i + 1) * 1000} ms; deck.info revision ${slide?.revision}`;
          break;
        }
        await sleep(1000);
      }
      console.log(`  landed: ${landed ?? 'the revision did not move in 20 s'}`);
    }
    // the slide's blocks
    const slide = await invoke('slide.get', { slideId }).then((g) => g.slide ?? g);
    console.log(`slide ${slideId} json head ${JSON.stringify(slide).slice(0, 200)}`);
    // trash and delete
    await page.locator('[data-control="menubar.file"]').click();
    await page.locator('[data-control="menu.file.moveToTrash"]').click();
    await page.waitForURL(/\/decks$/, { timeout: 20_000 }).catch(() => undefined);
    console.log(`after Move to trash: ${page.url().replace(BASE, '')}`);
    const done = await deleteForever(deckId);
    for (let i = 0; i < 10; i += 1) {
      const s = await status(deckId);
      console.log(`diagnostic deck ${deckId} after: ${s} (deleted ${done})`);
      if (/\/edit 404/.test(s)) break;
      await sleep(3000);
    }
  }
} finally {
  await browser.close();
}

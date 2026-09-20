// Verbose destroy of one scratch deck: screenshots and prints each step so a failed trash path
// can be read. node destroy-debug.mjs <deckId>
import path from 'node:path';
import { BASE, SCRATCH, chromium, clickControl, dismissPrompts, editorReady, invoke, newContext, pollUntil, press, settled, sleep, state, surfaceState } from './lib.mjs';

const id = process.argv[2];
const browser = await chromium.launch({ headless: true });
const context = await newContext(browser, { width: 1440, height: 900, theme: 'light' });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
const shot = (n) => page.screenshot({ path: path.join(SCRATCH, `destroy-${n}.png`) }).catch(() => undefined);
try {
  const res = await page.goto(`${BASE}/edit/${id}`, { waitUntil: 'domcontentloaded' });
  console.log('edit status', res?.status());
  await editorReady(page);
  const s = await pollUntil(() => state(page), (x) => x.sync?.connected === true, 30_000);
  console.log('connected', s.sync?.connected, 'revision', s.revision, 'pending', s.sync?.pending);
  await settled(page);
  console.log('prompts', JSON.stringify(await dismissPrompts(page)));
  console.log('surface', JSON.stringify(await surfaceState(page)));
  const banner = await page.evaluate(() => document.querySelector('.ts-shell-banner')?.textContent ?? null);
  console.log('banner', banner);
  await shot('before-file');
  await clickControl(page, 'menubar.file');
  await sleep(600);
  await shot('file-open');
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ts-menu-file [data-control]')].map((e) => e.getAttribute('data-control') + (e.classList.contains('is-disabled') ? ' (disabled)' : '')));
  console.log('file rows', rows.join(', '));
  if (rows.some((r) => r.startsWith('menu.file.moveToTrash'))) {
    await clickControl(page, 'menu.file.moveToTrash');
    await page.waitForURL(/\/decks$/, { timeout: 20_000 }).catch((e) => console.log('no /decks after trash:', e.message.split('\n')[0]));
    console.log('after trash url', page.url());
  } else {
    await press(page, 'Escape');
    const info = await invoke(page, 'deck.info').catch((e) => ({ error: String(e) }));
    console.log('deck.info', JSON.stringify(info).slice(0, 300));
    const t = await invoke(page, 'deck.trash', { id, baseRevision: info.revision }).catch((e) => ({ error: String(e).slice(0, 300) }));
    console.log('deck.trash', JSON.stringify(t).slice(0, 300));
  }
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await sleep(1000);
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-control^="trash.card."]')].map((e) => e.getAttribute('data-control')));
  console.log('trash cards', cards.length, cards.filter((c) => c.includes(id)));
  if (cards.some((c) => c.includes(id))) {
    await clickControl(page, `trash.delete.${id}`);
    await sleep(500);
    await shot('confirm');
    await clickControl(page, 'trash.confirm.ok');
    await page.locator(`[data-control="trash.card.${id}"]`).waitFor({ state: 'detached', timeout: 30_000 });
    console.log('deleted forever');
  }
  let status = 0;
  for (let i = 0; i < 10; i += 1) {
    const r = await page.request.get(`${BASE}/edit/${id}`, { maxRedirects: 0 });
    status = r.status();
    if (status === 404) break;
    await sleep(2000);
  }
  console.log('GET /edit status', status, 'GET /deck status', (await page.request.get(`${BASE}/deck/${id}`, { maxRedirects: 0 })).status());
} catch (e) {
  console.log('failed:', e.message.split('\n')[0]);
  await shot('failed');
} finally {
  await browser.close();
}

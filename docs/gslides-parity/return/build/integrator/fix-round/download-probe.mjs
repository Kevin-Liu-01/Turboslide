// The fixer's hand probe of the four page downloads (File > Download > PNG image, JPEG image,
// Turboslide bundle, and Web page behind Tools > Advanced tools) on one base: records the
// download event (name, address kind, bytes, magic), the page's address after it and the
// snackbar, then trashes and deletes the deck forever. The OIDC header goes on a preview only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const BASE = process.argv[2];
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ...(OIDC && !/localhost/.test(BASE)
    ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } }
    : {}),
  acceptDownloads: true,
});
const page = await context.newPage();
const events = [];
const t0 = Date.now();
const at = () => `+${Date.now() - t0}ms`;
context.on('page', (p) =>
  events.push(`${at()} popup ${p.url().replace(/\?.*$/, '?…').slice(0, 100)}`),
);
page.on('console', (m) => {
  if (m.type() === 'error') events.push(`${at()} console error ${m.text().slice(0, 140)}`);
});
let deckId = null;
const results = [];
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  const s0 = await state(page);
  await invoke(page, 'deck.set', {
    baseRevision: s0.revision,
    path: '/title',
    value: 'Download probe',
  });
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? null;
  console.log('deck', deckId);
  await sleep(1500);
  const rows = [
    'file.download.png',
    'file.download.jpg',
    'file.download.zip',
    'file.download.html',
  ];
  for (const row of rows) {
    events.length = 0;
    if (row === 'file.download.html') {
      await page.locator('[data-control="menubar.tools"]').click();
      await page.locator('[data-control="menu.tools.advancedTools"]').click();
      await sleep(400);
    }
    await page.locator('[data-control="menubar.file"]').click();
    await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
    await page.locator('[data-control="menu.file.download"]').hover();
    await page.locator(`[data-control="menu.${row}"]`).waitFor({ timeout: 8000 });
    const t = Date.now();
    const waiting = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await page.locator(`[data-control="menu.${row}"]`).click();
    const d = await waiting;
    let line;
    if (d) {
      const path = await d.path().catch(() => null);
      const bytes = path ? readFileSync(path) : Buffer.alloc(0);
      line = `${row}: download in ${Date.now() - t} ms; name ${d.suggestedFilename()}; address ${d.url().slice(0, 5)}…; ${bytes.length} B; magic ${JSON.stringify(bytes.subarray(0, 4).toString('latin1'))}`;
    } else line = `${row}: no download within 60 s`;
    await sleep(1200);
    const snack = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar')]
        .map((e) => e.textContent)
        .join(' | '),
    );
    line += `; page ${page.url().includes(`/edit/${deckId}`) ? 'still the editor' : `LEFT to ${page.url().slice(0, 80)}`}; snackbar ${JSON.stringify(snack.slice(0, 120))}`;
    if (events.length) line += `; events ${events.join(' / ')}`;
    console.log(line);
    results.push(line);
    if (row === 'file.download.html') {
      await page.locator('[data-control="menubar.tools"]').click();
      await page.locator('[data-control="menu.tools.advancedTools"]').click();
    }
  }
} catch (error) {
  console.log('probe error', error instanceof Error ? error.message.slice(0, 300) : String(error));
} finally {
  if (deckId) {
    const info = await invoke(page, 'deck.info').catch(() => null);
    if (info)
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch((e) =>
        console.log('trash failed', String(e).slice(0, 120)),
      );
    const after = await invoke(page, 'deck.info').catch(() => info);
    await invoke(page, 'deck.remove', {
      id: deckId,
      confirm: true,
      baseRevision: after?.revision ?? 0,
    }).catch((e) => console.log('remove failed', String(e).slice(0, 120)));
    const gone = await page.request
      .get(`${BASE}/edit/${deckId}`)
      .then((r) => r.status())
      .catch(() => 'unread');
    console.log('cleanup done for', deckId, '; /edit answers', gone);
  }
  await browser.close();
}

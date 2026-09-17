// B7 fix round, F12 reproduction: Restore from /decks/trash, then a fresh /decks load at once,
// the way core/decks.spec.ts's decks.trash.lists-after-restore does. Logs the timing of the
// restore server function against the /decks navigation and whether the first /decks response
// lists the deck. Runs against a deployment (the OIDC header from the environment) or a dev
// server. Never prints a token or a cookie. The scratch deck is trashed and deleted forever at
// the end through the product.
//   node docs/gslides-parity/focus/build/b7-restore-listing.mjs --base <origin> [--cycles 3]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:4369');
const CYCLES = Number(arg('--cycles', '3'));
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const t0 = Date.now();
const log = (line) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${line}`);

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();

async function waitEditor(page) {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await page.locator('.pt-viewer:not(.ts-skeleton)').first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector('.pt-viewer:not(.ts-skeleton)')?.hasAttribute('data-settled'),
    null,
    { timeout: 60_000 },
  );
}

async function state(page) {
  return page.evaluate(() => window.turboslide.studio.describe().state);
}

async function settled(page, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await state(page);
    const words = await ctl(page, 'deck.saveState')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await page.waitForTimeout(150);
  }
  return state(page);
}

async function newDeck(page, title) {
  await page.goto(`${BASE}/new`);
  await waitEditor(page);
  const info = await page.evaluate(() => window.turboslide.studio.invoke('deck.info'));
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  const run = runs.find((r) => /heading/.test(r)) ?? runs[0];
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(title, { delay: 40 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.turboslide.studio.describe().state.revision >= 1, null, {
    timeout: 30_000,
  });
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  if (
    await ctl(page, 'dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  ) {
    await page.keyboard.press('Escape');
  }
  return info.id;
}

async function trashFromEditor(page, id) {
  await page.goto(`${BASE}/edit/${id}`);
  await waitEditor(page);
  await settled(page);
  await page.keyboard.press('Escape');
  await ctl(page, 'menubar.file').click();
  await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
  await ctl(page, 'menu.file.moveToTrash').click();
  await page.waitForURL(/\/decks/, { timeout: 20_000 });
}

async function gotoTrash(page) {
  await page.goto(`${BASE}/decks/trash`);
  await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
    timeout: 30_000,
  });
}

/** The deck's row in a /decks or /decks/trash HTML response: listed, trashed or absent. */
async function listingSays(page, path, id) {
  const started = Date.now();
  const res = await page.request.get(`${BASE}${path}`, { headers: extraHTTPHeaders });
  const text = await res.text();
  const at =
    text.indexOf(`home.card.${id}`) >= 0
      ? text.indexOf(`home.card.${id}`)
      : text.indexOf(`trash.card.${id}`);
  const idAt = text.indexOf(`"${id}"`);
  const near = idAt >= 0 ? text.slice(idAt, idAt + 600) : '';
  const trashed = /trashedAt/.test(near);
  return {
    ms: Date.now() - started,
    status: res.status(),
    card: at >= 0,
    inData: idAt >= 0,
    trashedNearId: trashed,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
const page = await context.newPage();
let clickAt = 0;
page.on('response', (res) => {
  const req = res.request();
  if (req.method() !== 'POST' || !req.url().includes('/_serverFn/')) return;
  const body = req.postData() ?? '';
  const tail = req.url().split('/_serverFn/')[1]?.slice(0, 40) ?? req.url();
  const deckIdMatch = /"deckId":"([^"]+)"/.exec(body);
  const since = clickAt === 0 ? '' : ` (${Date.now() - clickAt} ms after the click)`;
  log(`serverFn ${res.status()} ${tail} deckId=${deckIdMatch?.[1] ?? '?'}${since}`);
});

let deck = '';
try {
  deck = await newDeck(page, 'B7 restore listing repro');
  log(`deck ${deck} created`);
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    log(`--- cycle ${cycle}`);
    await trashFromEditor(page, deck);
    log('trashed from the editor, on /decks');
    await gotoTrash(page);
    await ctl(page, `trash.card.${deck}`).waitFor({ timeout: 10_000 });
    log('trash lists the deck');
    clickAt = Date.now();
    await ctl(page, `trash.restore.${deck}`).click();
    log('Restore clicked');
    // the spec's next step: a fresh /decks load at once
    const navStart = Date.now();
    await page.goto(`${BASE}/decks`);
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    log(`/decks loaded and hydrated in ${Date.now() - navStart} ms`);
    const first = await ctl(page, `home.card.${deck}`).count();
    log(`home.card in the DOM right after hydration: ${first > 0}`);
    let seen = first > 0;
    const until = Date.now() + 5000;
    while (!seen && Date.now() < until) {
      await page.waitForTimeout(200);
      seen = (await ctl(page, `home.card.${deck}`).count()) > 0;
    }
    log(`home.card within 5 s: ${seen}`);
    // the server's view over the next seconds, without the page
    for (let i = 0; i < 4; i += 1) {
      const decks = await listingSays(page, '/decks', deck);
      const trash = await listingSays(page, '/decks/trash', deck);
      log(
        `probe ${i}: /decks card=${decks.card} inData=${decks.inData} trashedNear=${decks.trashedNearId} (${decks.ms} ms); /decks/trash card=${trash.card} (${trash.ms} ms)`,
      );
      if (decks.card) break;
      await page.waitForTimeout(1000);
    }
    clickAt = 0;
  }
} finally {
  // teardown through the product: trash from the editor, Delete forever on the trash page
  if (deck !== '') {
    try {
      const status = (
        await page.request.get(`${BASE}/edit/${deck}`, {
          headers: extraHTTPHeaders,
          maxRedirects: 0,
        })
      ).status();
      if (status !== 404) {
        await trashFromEditor(page, deck).catch(() => undefined);
        await gotoTrash(page);
        await ctl(page, `trash.card.${deck}`).waitFor({ timeout: 30_000 });
        await ctl(page, `trash.delete.${deck}`).click();
        await ctl(page, 'trash.confirm.ok').click();
        await ctl(page, `trash.card.${deck}`).waitFor({ state: 'detached', timeout: 30_000 });
        const after = (
          await page.request.get(`${BASE}/edit/${deck}`, {
            headers: extraHTTPHeaders,
            maxRedirects: 0,
          })
        ).status();
        log(`teardown: /edit/${deck} -> ${after}`);
      }
    } catch (error) {
      log(
        `teardown failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  await context.close();
  await browser.close();
}

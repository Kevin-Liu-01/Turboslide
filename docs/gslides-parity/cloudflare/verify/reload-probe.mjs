// The verifier's reload probe (realtime round, pass 4): one person types three words into a new
// deck's heading at a person's pace and reloads 400 ms after the third with the text session open
// (the hand drive's reload section, one tab), then reads the heading after the reload. Every ops
// POST and its answer, the stream's hello and the persisted pending ops are recorded, so the words
// lost on the blob tier can be placed. The deck is made from /new and trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/reload-probe.mjs --base http://localhost:4479 [--wait 400] [--escape]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4479').replace(/\/$/, '');
const WAIT = Number(arg('wait', '400'));
const ESCAPE = argv.includes('--escape');
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const t0 = Date.now();
const at = () => Date.now() - t0;
const log = (...a) => console.log(String(at()).padStart(6), ...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 1440, height: 900 },
  ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
});
const page = await ctx.newPage();
page.on('request', (r) => {
  if (/\/ops(\?|$)/.test(r.url())) {
    let body = '';
    try {
      const j = JSON.parse(r.postData() ?? '{}');
      body = JSON.stringify({
        base: j.base,
        entries: (j.entries ?? []).map((e) => ({
          opId: e.opId,
          m: (e.mutations ?? []).map(
            (m) =>
              `${m.op}${m.at !== undefined ? '@' + m.at : ''}${m.insert !== undefined ? ':' + JSON.stringify(m.insert) : ''}`,
          ),
        })),
      });
    } catch {}
    log('POST ops', body.slice(0, 400));
  }
});
page.on('response', async (r) => {
  if (/\/ops(\?|$)/.test(r.url())) {
    const t = await r.text().catch(() => '');
    log('ops answer', r.status(), t.replace(/"snapshot":\{.*?\}\}/, '"snapshot":…').slice(0, 400));
  }
});
page.on('requestfailed', (r) => {
  if (/\/ops(\?|$)|\/stream/.test(r.url()))
    log('request failed', r.url().replace(BASE, '').slice(0, 80), r.failure()?.errorText);
});
const settled = () =>
  page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 60_000 });
const heading = () =>
  page.evaluate(() => {
    const d = window.turboslide?.studio?.describe?.();
    const s = d?.state ?? {};
    const el = document.querySelector(
      '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
    );
    return {
      text: el?.textContent ?? null,
      revision: s.revision ?? null,
      pending: s.sync?.pending ?? s.pending ?? null,
      tier: s.sync?.tier ?? null,
    };
  });
let deckId = null;
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await settled();
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')
      ?.getAttribute('data-run'),
  );
  const box = page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first();
  await box.dblclick();
  await sleep(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Reload probe', { delay: 60 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = await page.evaluate(() =>
    window.turboslide.studio.invoke('deck.info', {}).then((i) => i.id),
  );
  log('deck', deckId);
  await sleep(2500);
  log('before', JSON.stringify(await heading()));
  await box.dblclick();
  await sleep(200);
  await page.keyboard.press('End');
  for (const w of [' ra1', ' ra2', ' ra3']) {
    await page.keyboard.type(w, { delay: 90 });
    log('typed', JSON.stringify(w));
    await sleep(WAIT);
  }
  if (ESCAPE) await page.keyboard.press('Escape');
  const pend = await page.evaluate(async () => {
    try {
      const dbs = (await indexedDB.databases?.()) ?? [];
      return dbs.map((d) => d.name);
    } catch (e) {
      return String(e);
    }
  });
  log('before reload', JSON.stringify(await heading()), 'idb', JSON.stringify(pend));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await settled();
  log('after reload, editor ready', JSON.stringify(await heading()));
  let prev = 0;
  for (const ms of [500, 2000, 5000, 10000]) {
    await sleep(ms - prev);
    prev = ms;
    log(`after reload +${ms}`, JSON.stringify(await heading()));
  }
} catch (e) {
  log('error', String(e?.stack ?? e).slice(0, 600));
} finally {
  if (deckId) {
    try {
      const info = await page.evaluate(() => window.turboslide.studio.invoke('deck.info', {}));
      await page.evaluate(
        (r) =>
          window.turboslide.studio.invoke('deck.trash', { id: r.id, baseRevision: r.revision }),
        info,
      );
      const t = await page
        .evaluate(() => window.turboslide.studio.invoke('deck.info', {}))
        .catch(() => info);
      await page.evaluate(
        (r) =>
          window.turboslide.studio.invoke('deck.remove', {
            id: r.id,
            confirm: true,
            baseRevision: r.revision,
          }),
        t,
      );
      const gone = await page.request.get(`/edit/${deckId}`, { maxRedirects: 0 });
      log('teardown', deckId, gone.status());
    } catch (e) {
      log('teardown error', String(e).slice(0, 200));
    }
  }
  await browser.close();
}

// The verifier's probe of the version records' authors (build/integrator.md finding 3: the Version
// history lists no record by its author after a sign in): one anonymous person on a scratch deck from
// /new types the title and a word, waits past the checkpoint, and reads `version.list` through the
// window API and the HTTP actions route; prints each record's revision, author kind, name, principal
// id prefix and origin client, and the tab's own principal and client ids. The deck is trashed and
// removed by its id.
//   node docs/gslides-parity/cloudflare/verify/version-authors.mjs --base http://localhost:4479
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const BASE = argv[argv.indexOf('--base') + 1] ?? 'http://localhost:4479';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const invoke = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const out = {};
let deckId = null;
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Version authors', { delay: 50 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(page, 'deck.info')).id;
  await sleep(1000);
  const st = await page.evaluate(() => window.turboslide.studio.describe().state);
  out.tab = {
    clientId: (st.presence?.clientId ?? st.sync?.clientId ?? '').slice(0, 8),
    principal: (
      st.identity?.principalId ??
      st.account?.principalId ??
      st.presence?.principalId ??
      ''
    ).slice(0, 14),
    tier: st.sync?.tier,
  };
  // a second write through the room: a word at the end of the title, then the checkpoint's idle
  const box = await page
    .locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`)
    .first()
    .boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(200);
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type(' more', { delay: 60 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await sleep(5000);
  let list;
  try {
    list = await invoke(page, 'version.list', {});
  } catch (error) {
    list = { error: String(error).slice(0, 200) };
  }
  const rows = Array.isArray(list) ? list : (list.versions ?? list.items ?? []);
  out.windowApi = rows.slice(0, 8).map((v) => ({
    revision: v.revision,
    kind: v.author?.kind ?? null,
    name: v.author?.name ?? null,
    principal: (v.author?.principalId ?? '').slice(0, 14) || null,
    origin: v.origin?.clientId ? v.origin.clientId.slice(0, 8) : null,
    note: v.note ?? null,
  }));
  if (list.error) out.windowApiError = list.error;
} catch (error) {
  out.error = String(error?.stack ?? error).slice(0, 800);
} finally {
  if (deckId) {
    try {
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const t = await invoke(page, 'deck.info').catch(() => info);
      await invoke(page, 'deck.remove', { id: deckId, confirm: true, baseRevision: t.revision });
      out.teardown = (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status;
    } catch (error) {
      out.teardownError = String(error).slice(0, 200);
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

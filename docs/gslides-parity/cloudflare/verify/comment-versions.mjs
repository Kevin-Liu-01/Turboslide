// The verifier's probe of what a comment writes into the version log (the hand drive's Version
// history on the do tier showed a row "You · named · current" with no changes after a comment): one
// anonymous person on a scratch deck from /new adds a slide comment through the window API and reads
// `version.list` before and after the checkpoint's idle; prints each row's revision, author kind,
// mutation count and note. The deck is trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/comment-versions.mjs --base http://localhost:4479
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
const rows = async () => {
  const list = await invoke(page, 'version.list', {});
  const arr = Array.isArray(list) ? list : (list.versions ?? []);
  return arr.map(
    (v) => `${v.revision}:${v.author?.kind ?? '?'}:${(v.mutations ?? []).length}:${v.note ?? ''}`,
  );
};
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
  await page.keyboard.type('Comment versions', { delay: 50 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(page, 'deck.info')).id;
  await sleep(4000);
  out.tier =
    (await page.evaluate(() => window.turboslide.studio.describe().state.sync?.tier)) ?? null;
  out.before = await rows();
  const slideId = await page.evaluate(() => window.turboslide.studio.describe().state.slideId);
  await invoke(page, 'comment.add', {
    anchor: { kind: 'slide', slideId },
    body: { text: 'A comment', mentions: [] },
  });
  await sleep(5000);
  out.after = await rows();
} catch (error) {
  out.error = String(error?.stack ?? error).slice(0, 600);
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
  console.log(JSON.stringify(out));
  await browser.close();
}

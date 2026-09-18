// The integrator, cycle 3 (b7 C3-R6, VERIFICATION C2-F21): the payload Slide > Duplicate slide
// dispatches with two cards selected, read from the wire (the ops POST bodies) and from the tab.
//   [VERCEL_OIDC_TOKEN=...] node dup-menu-probe.mjs --base <origin> [--rounds 2]
import { createRequire } from 'node:module';

const require = createRequire(
  '/Users/kevinliu/repos/Turboslide/scripts/probes/editor-walk-probe.mjs',
);
const { chromium } = require('playwright-core');

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4388').replace(/\/$/, '');
const ROUNDS = Number(arg('rounds', '2'));
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
});
const page = await context.newPage();
const posts = [];
page.on('request', (r) => {
  if (r.method() === 'POST' && /\/api\/decks\/[^/]+\/ops/.test(r.url())) {
    let body = null;
    try {
      body = JSON.parse(r.postData() ?? 'null');
    } catch {
      body = null;
    }
    const ops = (body?.ops ?? []).map((o) => ({
      opId: o.opId ?? o.id,
      base: o.baseRevision ?? o.base,
      mutations: (o.mutations ?? []).map((m) =>
        m.op === 'slide.insert' ? `${m.op}(${m.slide?.id} after ${m.after ?? 'start'})` : m.op,
      ),
    }));
    posts.push({ at: Date.now(), ops, raw: body && Object.keys(body) });
  }
});
page.on('response', async (r) => {
  const req = r.request();
  if (req.method() === 'POST' && /\/api\/decks\/[^/]+\/ops/.test(r.url())) {
    let text = '';
    try {
      text = (await r.text()).slice(0, 400);
    } catch {
      text = '';
    }
    log(`ops POST answered ${r.status()} ${text.replace(/\s+/g, ' ')}`);
  }
});
page.on('console', (m) => {
  if (m.type() === 'error') log(`console error ${m.text().replace(/\s+/g, ' ').slice(0, 300)}`);
});
page.on('pageerror', (e) => log(`pageerror ${String(e).slice(0, 300)}`));

const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
const order = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((el) => ({
      id:
        el.getAttribute('data-id') ??
        el.getAttribute('data-control').replace('filmstrip.slide.', ''),
      selected: el.getAttribute('aria-selected') === 'true',
    })),
  );
const saveWords = () =>
  page.evaluate(
    () => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? '',
  );
async function waitEditor() {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForFunction(
    () => document.querySelector('.pt-viewer:not(.ts-skeleton)')?.hasAttribute('data-settled'),
    null,
    { timeout: 60_000 },
  );
}
async function settled(timeout = 30_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state();
    if ((s.sync?.pending ?? s.pending ?? 0) === 0 && s.revision === s.serverRevision) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
}
const center = async (selector) => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// the deck, through the product's first write (the title), then three slides through the window API
await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
await waitEditor();
const info = await invoke('deck.info');
const run = await page.evaluate(() =>
  [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')]
    .map((el) => el.getAttribute('data-run') ?? '')
    .find((r) => /heading/.test(r)),
);
await page
  .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
  .first()
  .dblclick();
await sleep(200);
await page.keyboard.press('Meta+a');
await page.keyboard.type('Duplicate probe', { delay: 30 });
await page.keyboard.press('Escape');
await page.waitForURL(/\/edit\//, { timeout: 60_000 });
await settled();
const deckId = info.id;
log(`deck ${deckId} at ${page.url().replace(BASE, '')}`);
for (let i = 0; i < 3; i += 1) {
  const s = await state();
  await invoke('slide.new', { layout: 'split', after: s.slideId, baseRevision: s.revision });
  await settled();
}
let cards = await order();
log(`slides ${cards.length}: ${cards.map((c) => c.id).join(',')}`);

const results = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  const before = await order();
  const a = before[1].id;
  const b = before[2].id;
  // click card a, then Shift click card b (the walk's selectTwo)
  const ca = await center(`[data-control="filmstrip.slide.${a}"]`);
  await page.mouse.click(ca.x, ca.y);
  await sleep(400);
  const cb = await center(`[data-control="filmstrip.slide.${b}"]`);
  await page.keyboard.down('Shift');
  await page.mouse.click(cb.x, cb.y);
  await page.keyboard.up('Shift');
  await sleep(300);
  const selected = (await order()).filter((c) => c.selected).map((c) => c.id);
  const s0 = await state();
  const postsBefore = posts.length;
  const words0 = await saveWords();
  // Slide > Duplicate slide
  const bar = await center('[data-control="menubar.slide"]');
  await page.mouse.click(bar.x, bar.y);
  await page
    .locator('[data-control="menu.slide.duplicateSlide"]')
    .first()
    .waitFor({ timeout: 8000 });
  await sleep(250);
  const selectedAtMenu = (await order()).filter((c) => c.selected).map((c) => c.id);
  const row = await center('[data-control="menu.slide.duplicateSlide"]');
  await page.mouse.click(row.x, row.y);
  const t0 = Date.now();
  let after = await order();
  while (after.length < before.length + 2 && Date.now() - t0 < 20_000) {
    await sleep(200);
    after = await order();
  }
  const s1 = await settled(20_000);
  const newPosts = posts.slice(postsBefore);
  const result = {
    round,
    selected,
    selectedAtMenu,
    revisionBefore: { revision: s0.revision, serverRevision: s0.serverRevision, words: words0 },
    count: `${before.length} -> ${after.length} (${Date.now() - t0} ms)`,
    newIds: after.map((c) => c.id).filter((id) => !before.some((c) => c.id === id)),
    revisionAfter: {
      revision: s1.revision,
      serverRevision: s1.serverRevision,
      words: await saveWords(),
    },
    posts: newPosts.map((p) => p.ops),
  };
  results.push(result);
  log(JSON.stringify(result));
  await sleep(1500);
}

// cleanup: trash and delete forever through the window API, then the 404s
const infoEnd = await invoke('deck.info');
await invoke('deck.trash', { id: deckId, baseRevision: infoEnd.revision }).catch((e) =>
  log(`trash: ${e}`),
);
await sleep(500);
const infoTrashed = await invoke('deck.info').catch(() => infoEnd);
await invoke('deck.remove', {
  id: deckId,
  baseRevision: infoTrashed.revision,
  confirm: true,
}).catch((e) => log(`remove: ${e}`));
await sleep(1000);
for (const path of [`/edit/${deckId}`, `/deck/${deckId}`]) {
  const res = await context.request.get(`${BASE}${path}`, { maxRedirects: 0 }).catch(() => null);
  log(`${path} ${res ? res.status() : 'no answer'}`);
}
await browser.close();
console.log(JSON.stringify({ base: BASE, deckId, results }, null, 2));

// R1's two instance reading of a reload between the append and the checkpoint (audit-sync.md 2.3
// item 5; docs/REALTIME.md 3.8 row 6): A types five characters in under a second on the first node
// server, and B reloads on the second server at once, before the checkpointer's 2 s idle timer
// has written the run to the store; B's document after the reload must carry every character (the
// store's document plus the stream's tail, room.ts `syncLive`), three rounds. Then the two
// documents are compared at the live revision once the checkpoint lands.
//   node docs/gslides-parity/realtime/build/r1/reload-drive.mjs [--a <origin>] [--b <origin>]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};
const BASE_A = arg('a', 'http://localhost:4471');
const BASE_B = arg('b', 'http://localhost:4481');
const OUT = dirname(fileURLToPath(import.meta.url));
const facts = { startedAt: new Date().toISOString(), baseA: BASE_A, baseB: BASE_B, load: loadavg(), rounds: [] };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const ms = (from) => Math.round(performance.now() - from);
const sleep = (t) => new Promise((r) => setTimeout(r, t));

async function post(base, action, deckId, body) {
  const response = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 200) };
  }
  return { status: response.status, json };
}
const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) => page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, { timeout: 90_000 });
  await page.locator('.pt-viewer:not(.ts-skeleton)[data-settled]').first().waitFor({ timeout: 60_000 });
}
async function poll(fn, timeout = 30_000, every = 100) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return null;
}
const runEl = (page, run) => page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
const runsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')].map((el) => ({ run: el.getAttribute('data-run') ?? '', text: el.textContent ?? '' })),
  );
const runText = async (page, run) => (await runsOf(page)).find((r) => r.run === run)?.text ?? null;
async function dismissPrompt(page) {
  const prompt = ctl(page, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0) await ctl(page, 'dialog.namePrompt.close').click({ timeout: 2000 }).catch(() => undefined);
    else await ctl(page, 'dialog.namePrompt.skip').click({ timeout: 2000 }).catch(() => undefined);
  }
}
const sync = async (page) => {
  const s = await invoke(page, 'sync.status');
  return { tier: s.tier, connected: s.connected, seq: s.seq, revision: s.revision, pending: s.pending, retained: s.retained };
};
function withPort(url, base) {
  const u = new URL(url);
  const b = new URL(base);
  u.protocol = b.protocol;
  u.host = b.host;
  return u.toString();
}
/** The slide document through the window API, for the byte comparison. */
const slideJson = (page, slideId) => invoke(page, 'slide.get', { slideId }).then((got) => JSON.stringify(got.slide));

const browser = await chromium.launch({ headless: true });
const mk = (baseURL) => browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const A = await (await mk(BASE_A)).newPage();
const B = await (await mk(BASE_B)).newPage();
let deckId = null;

try {
  await A.goto('/new');
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  const subtitle = runs0.find((r) => r.run !== heading)?.run ?? heading;
  await runEl(A, heading).dblclick();
  await A.waitForTimeout(150);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Reload drive', { delay: 60 });
  await A.keyboard.press('Escape');
  await poll(async () => ((await state(A)).revision >= 1 ? true : null), 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await dismissPrompt(A);
  await poll(async () => ((await sync(A)).connected ? true : null), 45_000);
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', { id: deckId, mode: 'link', role: 'editor', baseRevision: share.record?.revision ?? 0 });
  await B.goto(withPort(opened.url, BASE_B));
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  await dismissPrompt(B);
  await poll(async () => ((await sync(B)).connected ? true : null), 45_000);
  const slideId = (await state(A)).slideId;
  say('tiers', { A: await sync(A), B: await sync(B), slideId });

  let expected = (await runText(A, subtitle)) ?? '';
  await runEl(A, subtitle).dblclick();
  await A.waitForTimeout(150);
  await A.keyboard.press('Meta+a');
  expected = '';
  for (let round = 1; round <= 3; round += 1) {
    const chars = `${'abcde'[round - 1]}${round}xyz`;
    expected += chars;
    const t0 = performance.now();
    // five characters in about 300 ms, well inside the checkpointer's 2 s idle window
    await A.keyboard.type(chars, { delay: 40 });
    // the ops of this burst are acknowledged (nothing pending) before B reloads, so the entries
    // are in the stream and not yet in a record
    const acked = await poll(async () => ((await sync(A)).pending === 0 ? await sync(A) : null), 5000, 20);
    const infoBefore = await post(BASE_B, 'deck.info', deckId, {});
    const tReload = performance.now();
    await B.reload();
    await waitEditor(B);
    await dismissPrompt(B);
    const read = await poll(async () => (((await runText(B, subtitle)) ?? '') === expected ? { at: ms(tReload), text: await runText(B, subtitle) } : null), 10_000, 40);
    const bSync = await poll(async () => ((await sync(B)).connected ? await sync(B) : null), 30_000);
    facts.rounds.push({
      round,
      typed: chars,
      expected,
      typedMs: ms(t0),
      ackedSeq: acked?.seq ?? null,
      storeRevisionAtReload: infoBefore.json?.revision ?? null,
      storeRecordsAtReload: infoBefore.json?.counts?.records ?? null,
      bReadAfterReloadMs: read?.at ?? null,
      bText: read?.text ?? (await runText(B, subtitle)),
      bSyncAfter: bSync,
      load: loadavg(),
    });
    console.log('round', JSON.stringify(facts.rounds[facts.rounds.length - 1]));
    await sleep(300);
  }
  await A.keyboard.press('Escape');
  // the checkpoint lands within 2 s idle; the two documents compared at the live revision
  await sleep(3000);
  const [a, b] = await Promise.all([slideJson(A, slideId), slideJson(B, slideId)]);
  const infoA = await post(BASE_A, 'deck.info', deckId, {});
  const infoB = await post(BASE_B, 'deck.info', deckId, {});
  say('after', { documentsEqual: a === b, aText: await runText(A, subtitle), bText: await runText(B, subtitle), A: await sync(A), B: await sync(B), revisions: { A: infoA.json?.revision, B: infoB.json?.revision }, records: infoA.json?.counts?.records });
  say('pass', { everyReloadRead: facts.rounds.every((r) => r.bReadAfterReloadMs !== null && r.bReadAfterReloadMs <= 3000), documentsEqual: a === b });
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'r1-reload-A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'r1-reload-B-error.png') }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  if (deckId) {
    const info = await post(BASE_A, 'deck.info', deckId, {});
    let rev = info.json?.revision;
    const trash = await post(BASE_A, 'deck.trash', deckId, { id: deckId, baseRevision: rev });
    const info2 = await post(BASE_A, 'deck.info', deckId, {});
    rev = info2.json?.revision ?? rev;
    const remove = await post(BASE_A, 'deck.remove', deckId, { id: deckId, confirm: true, baseRevision: rev });
    const gone = await fetch(`${BASE_B}/edit/${deckId}`, { redirect: 'manual' });
    say('teardown', { trash: trash.status, remove: remove.status, editStatusAfter: gone.status });
  }
  facts.loadAtEnd = loadavg();
  facts.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'reload-facts.json'), JSON.stringify(facts, null, 2));
}

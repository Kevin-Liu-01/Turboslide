// R1's hand drive of the hand off and the hand back (docs/REALTIME.md 3.8) on the two process
// run: A on the first node server and B on the second, both on one deck over the redis tier; the
// `realtime` flag is set off on the lane's Redis database by hand (`SET flag:realtime off`), the
// pages are read until both report the blob tier and a word of A's reaches B over it, then the
// flag is deleted and the same is read back on the redis tier. The server logs are read for the
// hand off lines. Nothing here prints a secret; the agent surface is the localhost one.
//   node docs/gslides-parity/realtime/build/r1/handoff-drive.mjs [--a <origin>] [--b <origin>] [--redis-db 1]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
const REDIS_DB = arg('redis-db', '1');
const LOGS = arg('logs', '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r1/logs');
const OUT = dirname(fileURLToPath(import.meta.url));

const facts = { startedAt: new Date().toISOString(), baseA: BASE_A, baseB: BASE_B, load: loadavg(), steps: [] };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const ms = (from) => Math.round(performance.now() - from);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const redis = (...args) =>
  execSync(`docker exec turboslide-redis redis-cli -n ${REDIS_DB} ${args.join(' ')}`, { encoding: 'utf8' }).trim();

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
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
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
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')].map((el) => ({
      run: el.getAttribute('data-run') ?? '',
      text: el.textContent ?? '',
    })),
  );
const runText = async (page, run) => (await runsOf(page)).find((r) => r.run === run)?.text ?? null;
async function dismissPrompt(page) {
  const prompt = ctl(page, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0) await ctl(page, 'dialog.namePrompt.close').click({ timeout: 2000 }).catch(() => undefined);
    else await ctl(page, 'dialog.namePrompt.skip').click({ timeout: 2000 }).catch(() => undefined);
  }
}
async function typeWord(page, run, word) {
  await runEl(page, run).dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
  await page.keyboard.type(word, { delay: 60 });
  await page.keyboard.press('Escape');
}
const sync = async (page) => {
  const s = await invoke(page, 'sync.status');
  return { tier: s.tier, connected: s.connected, seq: s.seq, revision: s.revision, pending: s.pending };
};
function withPort(url, base) {
  const u = new URL(url);
  const b = new URL(base);
  u.protocol = b.protocol;
  u.host = b.host;
  return u.toString();
}
function logLines(port, pattern) {
  try {
    return readFileSync(join(LOGS, `server-${port}.log`), 'utf8')
      .split('\n')
      .filter((line) => pattern.test(line))
      .slice(-6);
  } catch {
    return [];
  }
}

const browser = await chromium.launch({ headless: true });
const mk = (baseURL) => browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const A = await (await mk(BASE_A)).newPage();
const B = await (await mk(BASE_B)).newPage();
let deckId = null;

/** A types a word; B reads it; the time from the last keystroke to B's DOM. */
async function exchange(label, run) {
  const word = ` ${label}`;
  const t0 = performance.now();
  await typeWord(A, run, word);
  const seen = await poll(async () => (((await runText(B, run)) ?? '').includes(label) ? ms(t0) : null), 15_000, 40);
  const step = { label, aToBMs: seen, A: await sync(A), B: await sync(B) };
  facts.steps.push(step);
  console.log('exchange', JSON.stringify(step));
  return step;
}

try {
  say('flag.before', redis('GET', 'flag:realtime'));
  await A.goto('/new');
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  await runEl(A, heading).dblclick();
  await A.waitForTimeout(150);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Hand off drive', { delay: 60 });
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
  say('tiers.start', { A: await sync(A), B: await sync(B) });
  await exchange('redis-1', heading);

  // ---- the hand off: the flag set off by hand on the database
  const tOff = performance.now();
  redis('SET', 'flag:realtime', 'off');
  say('flag.set', redis('GET', 'flag:realtime'));
  const handedOff = await poll(
    async () => {
      const [a, b] = await Promise.all([sync(A), sync(B)]);
      return a.tier === 'blob' && b.tier === 'blob' && a.connected && b.connected ? { at: ms(tOff), A: a, B: b } : null;
    },
    60_000,
    200,
  );
  say('handoff', handedOff ?? { at: null, A: await sync(A), B: await sync(B) });
  say('handoff.logs', { 4471: logLines('4471', /handed off|handed back|redis\.unavailable/), 4481: logLines('4481', /handed off|handed back|redis\.unavailable/) });
  await sleep(1500);
  await exchange('blob-1', heading);
  await exchange('blob-2', heading);

  // ---- the hand back: the flag deleted
  const tOn = performance.now();
  redis('DEL', 'flag:realtime');
  const handedBack = await poll(
    async () => {
      const [a, b] = await Promise.all([sync(A), sync(B)]);
      return a.tier === 'redis' && b.tier === 'redis' && a.connected && b.connected ? { at: ms(tOn), A: a, B: b } : null;
    },
    60_000,
    200,
  );
  say('handback', handedBack ?? { at: null, A: await sync(A), B: await sync(B) });
  say('handback.logs', { 4471: logLines('4471', /handed off|handed back/), 4481: logLines('4481', /handed off|handed back/) });
  await sleep(1500);
  await exchange('redis-2', heading);
  await exchange('redis-3', heading);
  say('final.texts', { A: await runText(A, heading), B: await runText(B, heading) });
  const infoA = await post(BASE_A, 'deck.info', deckId, {});
  const infoB = await post(BASE_B, 'deck.info', deckId, {});
  say('final.revisions', { A: infoA.json?.revision, B: infoB.json?.revision, records: infoA.json?.counts?.records });
  say('pass', {
    handedOffMs: handedOff?.at ?? null,
    handedBackMs: handedBack?.at ?? null,
    everyWordReachedB: facts.steps.every((s) => s.aToBMs !== null),
    documentsAgree: (await runText(A, heading)) === (await runText(B, heading)),
  });
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'r1-handoff-A-error.png') }).catch(() => {});
} finally {
  redis('DEL', 'flag:realtime');
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
  writeFileSync(join(OUT, 'handoff-facts.json'), JSON.stringify(facts, null, 2));
}

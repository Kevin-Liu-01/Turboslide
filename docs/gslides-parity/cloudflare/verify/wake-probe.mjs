// The verifier's probe of the object after a wake (docs/CLOUDFLARE.md 3.4 item 7; the hand drive's
// ticket refresh was refused with "ticket refused: deck" after an idle of eight minutes): one person
// on a scratch deck from /new types a word, the tab idles `--idle` seconds with its socket open and
// nothing else touching the object (no bearer read, no second tab), then types a word; the tab's
// sync status (head, covered) is read 3 s, 10 s and 30 s after, then the object's counters (wakes,
// checkpoints) under the room bearer, which is a fetch and so names the deck to the object; covered
// is read again after it. Nothing is judged. The deck is trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/wake-probe.mjs --base http://localhost:4479 --room-host 127.0.0.1:8799 --idle 120
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4479');
const HOST = arg('room-host', '127.0.0.1:8799');
const IDLE = Number(arg('idle', '120'));
const BEARER = process.env.TURBOSLIDE_ROOM_BEARER ?? '';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const invoke = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const out = { base: BASE, idleSeconds: IDLE, startedAt: new Date().toISOString(), reads: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let deckId = null;
const status = async (label) => {
  const s = await invoke(page, 'sync.status');
  const r = {
    label,
    at: new Date().toISOString(),
    seq: s.seq,
    covered: s.covered ?? null,
    revision: s.revision,
    connected: s.connected,
  };
  out.reads.push(r);
  console.log(JSON.stringify(r));
};
const typeAtEnd = async (word) => {
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  const el = page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first();
  const box = await el.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(200);
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type(word, { delay: 80 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
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
  await page.keyboard.type('Wake probe', { delay: 50 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(page, 'deck.info')).id;
  out.deckId = deckId;
  for (let i = 0; i < 100 && (await invoke(page, 'sync.status')).connected !== true; i += 1)
    await sleep(100);
  await typeAtEnd(' one');
  await sleep(4000);
  await status('4 s after the first word');
  await sleep(IDLE * 1000);
  await status(`after ${IDLE} s idle`);
  await typeAtEnd(' two');
  await sleep(3000);
  await status('3 s after the word after the idle');
  await sleep(7000);
  await status('10 s after');
  await sleep(20000);
  await status('30 s after');
  if (BEARER) {
    const r = await fetch(`http://${HOST}/rooms/${encodeURIComponent(deckId)}/counters`, {
      headers: { authorization: `Bearer ${BEARER}` },
    });
    const j = await r.json();
    out.counters = {
      total: j.total,
      sinceWake: j.sinceWake,
      head: j.head,
      covered: j.covered,
      revision: j.revision,
      alarmAt: j.alarmAt,
    };
    console.log(JSON.stringify(out.counters));
    await sleep(15000);
    await status('15 s after the counters read (a fetch to the object)');
  }
} catch (error) {
  out.error = String(error?.stack ?? error).slice(0, 800);
  console.log(out.error);
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
  console.log(JSON.stringify({ teardown: out.teardown, teardownError: out.teardownError }));
  await browser.close();
}

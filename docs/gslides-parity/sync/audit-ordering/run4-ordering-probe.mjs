#!/usr/bin/env node
// The ordering probe, run 3 (docs/gslides-parity/sync/audit-ordering.md): the same block from
// two editors, with every ops POST body recorded (the op, the path, the offset, the removed and
// inserted lengths), so the lost writes of run 2 phase 2 and phase 3 are read off the wire. Three
// parts: (a) both sessions open while both type within 200 ms, two rounds, 12 s of wire after
// each; (b) each side types its token and presses Escape at once, two rounds; (c) A offline with
// its session closed, B types three tokens, A opens the run, types one, closes it offline, then
// A comes back. Same person in two browsers (B has A's cookies). Imports playwright-core alone.
//
//   node ordering-probe-3.mjs --base https://turboslide.vercel.app --out <dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = arg('out', '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/sync/audit-ordering');
const PREFIX = arg('prefix', 'run4');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const now = () => Date.now();
const T0 = now();
const rel = (t) => Math.round(t - T0);
const log = (line) => console.log(`[${String(rel(now())).padStart(6)} ms] ${line}`);

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const pollUntil = async (read, test, timeout = 15_000, every = 100) => {
  const until = now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (now() > until) return v;
    await sleep(every);
  }
};
const connected = (page, timeout = 45_000) =>
  pollUntil(() => state(page), (s) => s.sync?.connected === true, timeout);
const settled = (page, timeout = 30_000) =>
  pollUntil(() => state(page), (s) => (s.sync?.pending ?? s.pending ?? 0) === 0 && (s.sync?.retained ?? 0) === 0, timeout);
const waitRevision = (page, want, timeout = 20_000) =>
  pollUntil(() => state(page).then((s) => s.revision), (r) => r >= want, timeout, 60);
const dismissPrompt = async (page) => {
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await page.locator('[data-control="dialog.namePrompt.close"]').first().click({ timeout: 2000 }).catch(() => undefined);
    await sleep(200);
  }
  const persisted = page.locator('[data-control="sync.persisted"]');
  if (await persisted.isVisible().catch(() => false)) {
    await page.locator('[data-control="sync.persisted.apply"]').first().click({ timeout: 2000 }).catch(() => undefined);
    await sleep(200);
  }
};
let RUN = '.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]';
let SLIDE = 'title';
const runText = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  }, RUN);
const headingOf = (page) =>
  invoke(page, 'slide.get', { slideId: SLIDE }).then((g) => String(SLIDE === 'title' ? g.slide.heading ?? '' : JSON.stringify(g.slide).match(/"text":"([^"]*)"/)?.[1] ?? '').replace(/\u00a0/g, ' '), () => null);
const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
const openRun = async (page) => {
  const el = page.locator(RUN);
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 120, y + 80);
  await page.mouse.move(x, y, { steps: 12 });
  await sleep(rand(60, 120));
  await page.mouse.dblclick(x, y);
  const ok = await pollUntil(() => el.getAttribute('contenteditable'), (v) => v === 'true', 4000, 50);
  await page.keyboard.press(END_OF_TEXT);
  await page.keyboard.press('End');
  return ok === 'true';
};
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${PREFIX}-${name}.png`) }).catch(() => undefined);
const saveWords = (page) => page.evaluate(() => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null);
const staleWords = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.ts-snackbar, .pt-toast, [data-control="snackbar"], .ts-reject, [data-control^="reject"]')]
        .map((el) => el.textContent ?? '')
        .filter((t) => /stale|not accepted|refused|reload and rebase|changed in the Blob|No block|was not applied|is outside a text/i.test(t))
        .join(' | ') || null,
  );
const brief = (s) => ({ revision: s.revision, serverRevision: s.serverRevision, seq: s.sync?.seq, pending: s.sync?.pending, retained: s.sync?.retained, connected: s.sync?.connected, offline: s.sync?.offline, streamDown: s.sync?.streamDown });
const countIn = (text, token) => (text ?? '').split(token).length - 1;

/** The wire with the bodies: every mutation's op, path, offset and lengths (never the text itself beyond 24 chars). */
const wireOf = (page, name, sink) => {
  page.on('request', (request) => {
    if (!/\/api\/decks\/[^/]+\/ops$/.test(request.url()) || request.method() !== 'POST') return;
    let mutations = null;
    let base = null;
    let opIds = null;
    try {
      const parsed = JSON.parse(request.postData() ?? '{}');
      base = parsed.base?.seq ?? null;
      opIds = parsed.entries?.map((e) => e.opId.split(':')[1]) ?? null;
      mutations = (parsed.entries ?? []).flatMap((e) =>
        (e.mutations ?? []).map((m) =>
          m.op === 'text.splice'
            ? { op: m.op, path: m.path, at: m.at, remove: m.remove, insert: String(m.insert).slice(0, 24), insertLength: String(m.insert).length }
            : m.op === 'block.set'
              ? { op: m.op, path: m.path, valueLength: JSON.stringify(m.value ?? null).length, valueHead: JSON.stringify(m.value ?? null).slice(0, 40) }
              : { op: m.op, path: m.path ?? null },
        ),
      );
    } catch {
      // not json
    }
    const row = { who: name, at: rel(now()), base, opIds, mutations, status: null, ms: null, revision: null };
    sink.push(row);
    request
      .response()
      .then(async (response) => {
        if (!response) {
          row.status = 'no response';
          return;
        }
        row.status = response.status();
        row.ms = rel(now()) - row.at;
        row.revision = response.headers()['x-turboslide-revision'] ?? null;
        if (row.status >= 400) row.body = (await response.text().catch(() => '')).slice(0, 240);
        else {
          const body = await response.json().catch(() => null);
          if (body) {
            row.admitted = body.entries?.map((e) => e.seq) ?? null;
            row.rejected = body.rejected ?? null;
            row.between = body.between?.map((e) => ({ seq: e.seq, clientId: e.clientId.slice(0, 8), mutations: (e.mutations ?? []).map((m) => m.op === 'text.splice' ? `splice@${m.at}-${m.remove}+${m.insert.length}` : m.op) })) ?? null;
          }
        }
      })
      .catch((error) => {
        row.status = `failed: ${String(error).slice(0, 60)}`;
      });
  });
  page.on('response', (response) => {
    if (!/\/api\/decks\/[^/]+\/stream/.test(response.url())) return;
    sink.push({ who: name, at: rel(now()), stream: true, status: response.status() });
  });
};

const report = { run: PREFIX, base: BASE, startedAt: new Date().toISOString(), phases: {}, wire: [], anomalies: [], console: [] };
const anomaly = (kind, detail) => {
  report.anomalies.push({ kind, ...detail });
  log(`ANOMALY ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
};
const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
let ctxB = null;
let B = null;
const attach = (name, page) => {
  page.on('pageerror', (e) => report.console.push({ who: name, at: rel(now()), error: String(e).slice(0, 300) }));
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !/upgrade-insecure-requests|ERR_INTERNET_DISCONNECTED/.test(m.text()))
      report.console.push({ who: name, at: rel(now()), [m.type()]: m.text().slice(0, 300) });
  });
  wireOf(page, name, report.wire);
};
attach('A', A);
let deckId = '';
const wireSince = (at) => report.wire.filter((w) => w.at >= at && !w.stream);

try {
  log('phase 0: A opens /new');
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  deckId = (await invoke(A, 'deck.info')).id;
  log(`deck ${deckId}`);
  await openRun(A);
  await typeHuman(A, 'Sync audit four');
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  await connected(A);
  await waitRevision(A, 1);
  await dismissPrompt(A);
  await settled(A);
  ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: await ctxA.storageState() });
  B = await ctxB.newPage();
  attach('B', B);
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  await connected(B);
  await dismissPrompt(B);
  report.phases.create = { deckId, a: brief(await state(A)), b: brief(await state(B)), heading: await headingOf(A) };
  log(`created and joined: ${JSON.stringify(report.phases.create)}`);

  // the paragraph of a Title and body slide: the text.splice path, not a slide field
  log('phase 0: a Title and body slide for the paragraph run');
  const s0 = await state(A);
  const beforeOrder = (await invoke(A, 'slide.list', {}));
  const beforeIds = (beforeOrder.slides ?? beforeOrder.items ?? beforeOrder).map((x) => x.id ?? x);
  await invoke(A, 'slide.new', { baseRevision: s0.revision, after: 'title', layout: 'split' });
  const orderAfter = await pollUntil(async () => { const l = await invoke(A, 'slide.list', {}); return (l.slides ?? l.items ?? l).map((x) => x.id ?? x); }, (o) => o.length === beforeIds.length + 1, 20_000);
  SLIDE = orderAfter.find((x) => !beforeIds.includes(x));
  await settled(A);
  await pollUntil(async () => { const l = await invoke(B, 'slide.list', {}); return (l.slides ?? l.items ?? l).map((x) => x.id ?? x); }, (o) => o.includes(SLIDE), 20_000);
  for (const page of [A, B]) {
    const card = page.locator(`[data-control="filmstrip.slide.${SLIDE}"]`).first();
    const r = await card.boundingBox().catch(() => null);
    if (r) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    else await invoke(page, 'view.goto', { slideId: SLIDE }).catch(() => undefined);
    await pollUntil(() => state(page), (st) => st.slideId === SLIDE, 8000);
    await sleep(500);
  }
  const runs = await A.evaluate(() => [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')].map((el) => el.getAttribute('data-run')));
  const body = runs.find((r) => !/^heading\//.test(r)) ?? runs[0];
  RUN = `.ts-stagewrap.ts-editor .pt-slide [data-run="${body}"]`;
  report.phases.slide = { slide: SLIDE, runs, run: body };
  log(`slide ${SLIDE} runs ${JSON.stringify(runs)} using ${body}`);

  // (a) both sessions open, two rounds, the wire for 12 s after each
  log('part a: both sessions open');
  const openRounds = [];
  await openRun(A);
  await openRun(B);
  for (let k = 1; k <= 2; k += 1) {
    const ta = ` pa${k}`;
    const tb = ` pb${k}`;
    const from = rel(now());
    await Promise.all([
      typeHuman(A, ta),
      (async () => {
        await sleep(rand(0, 150));
        await typeHuman(B, tb);
      })(),
    ]);
    const typedAt = rel(now());
    const samples = [];
    const until = now() + 12_000;
    while (now() < until) {
      const [a, b, sa, sb] = await Promise.all([runText(A), runText(B), state(A), state(B)]);
      const row = { at: rel(now()), a, b, ra: sa.serverRevision, rb: sb.serverRevision, pa: sa.sync?.pending, pb: sb.sync?.pending };
      const last = samples[samples.length - 1];
      if (!last || last.a !== row.a || last.b !== row.b || last.ra !== row.ra || last.rb !== row.rb) samples.push(row);
      await sleep(250);
    }
    const a = await runText(A);
    const b = await runText(B);
    openRounds.push({
      round: k,
      typedAt,
      windowMs: typedAt - from,
      a,
      b,
      equal: a === b,
      aHas: { own: countIn(a, ta), other: countIn(a, tb) },
      bHas: { own: countIn(b, tb), other: countIn(b, ta) },
      posts: wireSince(from).length,
      wire: wireSince(from),
      samples,
      stale: { a: await staleWords(A), b: await staleWords(B) },
    });
    log(`part a round ${k}: a "${a?.slice(-40)}" b "${b?.slice(-40)}" equal ${a === b} posts ${wireSince(from).length}`);
  }
  await shot(A, 'a-open-a');
  await shot(B, 'a-open-b');
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await dismissPrompt(A);
  await dismissPrompt(B);
  await sleep(4000);
  const afterA = await headingOf(A);
  const afterB = await headingOf(B);
  report.phases.open = { rounds: openRounds, afterEscape: { a: afterA, b: afterB, equal: afterA === afterB, a2: brief(await state(A)), b2: brief(await state(B)) } };
  log(`part a after Escape: a "${afterA}" b "${afterB}"`);
  for (const r of openRounds) {
    if (!r.equal) anomaly('open-sessions-diverge', { round: r.round, a: r.a, b: r.b, posts: r.posts });
    if (r.aHas.other === 0 || r.bHas.other === 0) anomaly('open-sessions-lost-other', { round: r.round, aHas: r.aHas, bHas: r.bHas });
  }
  for (const t of [' pa1', ' pa2', ' pb1', ' pb2']) if (countIn(afterA, t) !== 1) anomaly('open-sessions-lost-after-escape', { token: t, inA: countIn(afterA, t), inB: countIn(afterB, t) });

  // (b) type and Escape at once, two rounds
  log('part b: type then Escape at once');
  const closedRounds = [];
  for (let k = 1; k <= 2; k += 1) {
    const ta = ` qa${k}`;
    const tb = ` qb${k}`;
    const from = rel(now());
    await Promise.all([
      (async () => {
        await openRun(A);
        await typeHuman(A, ta);
        await A.keyboard.press('Escape');
      })(),
      (async () => {
        await sleep(rand(0, 150));
        await openRun(B);
        await typeHuman(B, tb);
        await B.keyboard.press('Escape');
      })(),
    ]);
    await dismissPrompt(A);
    await dismissPrompt(B);
    const typedAt = rel(now());
    const both = await pollUntil(
      async () => ({ a: await headingOf(A), b: await headingOf(B) }),
      (r) => r.a !== null && r.a === r.b && r.a.includes(ta) && r.a.includes(tb),
      15_000,
      200,
    );
    closedRounds.push({
      round: k,
      convergedMs: rel(now()) - typedAt,
      a: both.a,
      b: both.b,
      equal: both.a === both.b,
      aHas: { own: countIn(both.a, ta), other: countIn(both.a, tb) },
      bHas: { own: countIn(both.b, tb), other: countIn(both.b, ta) },
      posts: wireSince(from).length,
      wire: wireSince(from),
      stale: { a: await staleWords(A), b: await staleWords(B) },
      a2: brief(await state(A)),
      b2: brief(await state(B)),
    });
    log(`part b round ${k}: ${JSON.stringify({ ...closedRounds[k - 1], wire: undefined }).slice(0, 400)}`);
    await sleep(3000);
  }
  report.phases.closed = { rounds: closedRounds };
  for (const r of closedRounds) {
    if (!r.equal) anomaly('closed-sessions-diverge', { round: r.round, a: r.a, b: r.b });
    if (r.aHas.other !== 1 || r.bHas.other !== 1 || r.aHas.own !== 1 || r.bHas.own !== 1) anomaly('closed-sessions-lost-or-doubled', { round: r.round, aHas: r.aHas, bHas: r.bHas });
  }
  await shot(A, 'b-closed-a');
  await shot(B, 'b-closed-b');

  // (c) A offline with its session closed; B types with its session open; A opens, types, closes offline; A back
  log('part c: A offline, sessions closed on A');
  const before = await headingOf(A);
  await openRun(B);
  const offlineAt = now();
  await ctxA.setOffline(true);
  const bTyping = (async () => {
    for (let k = 1; k <= 3; k += 1) {
      await typeHuman(B, ` ob${k}`);
      await sleep(2500);
    }
    await B.keyboard.press('Escape');
    await dismissPrompt(B);
  })();
  const aTyping = (async () => {
    await sleep(3000);
    await openRun(A);
    await typeHuman(A, ' oa1');
    await A.keyboard.press('Escape');
    await dismissPrompt(A);
  })();
  await Promise.all([bTyping, aTyping]);
  const remaining = 20_000 - (now() - offlineAt);
  if (remaining > 0) await sleep(remaining);
  const aBeforeOnline = { ...brief(await state(A)), words: await saveWords(A), heading: await headingOf(A) };
  const bBeforeOnline = { ...brief(await state(B)), heading: await headingOf(B) };
  await ctxA.setOffline(false);
  const onlineAt = now();
  const aSettled = await pollUntil(() => state(A), (s) => (s.sync?.pending ?? 0) === 0 && s.sync?.connected === true, 45_000, 100);
  const converged = await pollUntil(
    async () => ({ a: await headingOf(A), b: await headingOf(B) }),
    (r) => r.a !== null && r.a === r.b,
    30_000,
    200,
  );
  const tokens = [' ob1', ' ob2', ' ob3', ' oa1'];
  report.phases.offline = {
    before,
    aBeforeOnline,
    bBeforeOnline,
    aSettledMs: now() - onlineAt,
    aSettled: brief(aSettled),
    converged: converged.a === converged.b,
    a: converged.a,
    b: converged.b,
    lostInA: tokens.filter((t) => countIn(converged.a, t) === 0),
    lostInB: tokens.filter((t) => countIn(converged.b, t) === 0),
    wire: wireSince(rel(offlineAt)),
    stale: { a: await staleWords(A), b: await staleWords(B) },
    a2: brief(await state(A)),
    b2: brief(await state(B)),
  };
  log(`part c: ${JSON.stringify({ ...report.phases.offline, wire: undefined }).slice(0, 700)}`);
  if (!report.phases.offline.converged) anomaly('offline-diverge', { a: converged.a, b: converged.b });
  if (report.phases.offline.lostInA.length || report.phases.offline.lostInB.length) anomaly('offline-lost', { lostInA: report.phases.offline.lostInA, lostInB: report.phases.offline.lostInB });
  await shot(A, 'c-offline-a');
  await shot(B, 'c-offline-b');
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`ERROR ${report.error.slice(0, 400)}`);
} finally {
  report.finishedAt = new Date().toISOString();
  report.seconds = Math.round((now() - T0) / 1000);
  if (deckId) {
    report.teardown = {};
    try {
      await ctxA.setOffline(false).catch(() => undefined);
      await B?.close().catch(() => undefined);
      await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(A);
      await connected(A);
      await dismissPrompt(A);
      await A.locator('[data-control="menubar.file"]').click({ timeout: 8000 });
      await A.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await A.locator('[data-control="menu.file.moveToTrash"]').click({ timeout: 8000 });
      await A.waitForURL(/\/decks$/, { timeout: 20_000 });
      report.teardown.trashed = true;
      await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = A.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await A.locator(`[data-control="trash.delete.${deckId}"]`).click({ timeout: 8000 });
      await A.locator('[data-control="trash.confirm.ok"]').click({ timeout: 8000 });
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      report.teardown.deletedForever = true;
    } catch (error) {
      report.teardown.productPathError = error instanceof Error ? error.message : String(error);
      try {
        await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await editorReady(A).catch(() => undefined);
        const info = await invoke(A, 'deck.info').catch(() => null);
        if (info) {
          await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined);
          const t = await invoke(A, 'deck.info').catch(() => null);
          await invoke(A, 'deck.remove', { id: deckId, baseRevision: t?.revision ?? info.revision, confirm: true }).catch(() => undefined);
          report.teardown.fallback = true;
        }
      } catch {
        // the 404 probe below tells the truth
      }
    }
    let status = 0;
    const until = now() + 30_000;
    for (;;) {
      const res = await A.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 }).catch(() => null);
      status = res ? res.status() : 0;
      if (status === 404 || now() > until) break;
      await sleep(2000);
    }
    report.teardown.deckStatus = status;
    report.teardown.gone = status === 404;
    log(`teardown: ${JSON.stringify(report.teardown)}`);
  }
  await browser.close().catch(() => undefined);
  writeFileSync(path.join(OUT, `${PREFIX}-ordering-run.json`), JSON.stringify({ ...report, deckId }, null, 2));
  log(`written ${path.join(OUT, `${PREFIX}-ordering-run.json`)}; anomalies ${report.anomalies.length}`);
}

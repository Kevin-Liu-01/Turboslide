#!/usr/bin/env node
// The ordering probe of the sync audit (docs/gslides-parity/sync/audit-ordering.md). Two headless
// browsers (two contexts, two anonymous principals) on one scratch deck made from /new on
// production, at human speed: 30 edits from A at one per 3 s with the arrival order and the
// latency in B; edits to the same block from A and B within 200 ms; A offline for 20 s while B
// edits, then A back; both reloaded and the two documents diffed through the window API the
// editor's loader fed (slide.get for every slide). Imports playwright-core alone.
//
//   node ordering-probe.mjs --base https://turboslide.vercel.app --out <dir> [--edits 30]
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
const EDITS = Number(arg('edits', '30'));
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const now = () => Date.now();
const T0 = now();
const rel = (t) => Math.round(t - T0);
const log = (line) => console.log(`[${String(rel(now())).padStart(6)} ms] ${line}`);
const stats = (values) => {
  if (values.length === 0) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: s[Math.floor(s.length / 2)],
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    max: s[s.length - 1],
    min: s[0],
  };
};

// ---------------------------------------------------------------------------------------------
// the product, through its own window API and DOM (the probe toolkit's selectors)

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
  pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    timeout,
  );
const settled = (page, timeout = 30_000) =>
  pollUntil(
    () => state(page),
    (s) => (s.sync?.pending ?? s.pending ?? 0) === 0 && (s.sync?.retained ?? 0) === 0,
    timeout,
  );
const waitRevision = (page, want, timeout = 20_000) =>
  pollUntil(
    () => state(page).then((s) => s.revision),
    (r) => r >= want,
    timeout,
    60,
  );
const dismissPrompt = async (page) => {
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await page
      .locator('[data-control="dialog.namePrompt.close"]')
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await sleep(200);
  }
  const persisted = page.locator('[data-control="sync.persisted"]');
  if (await persisted.isVisible().catch(() => false)) {
    await page
      .locator('[data-control="sync.persisted.apply"]')
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await sleep(200);
  }
};
const RUN = '.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]';
const runText = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  }, RUN);
const headingOf = (page) =>
  invoke(page, 'slide.get', { slideId: 'title' }).then(
    (g) => String(g.slide.heading ?? '').replace(/\u00a0/g, ' '),
    () => null,
  );
const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
/** Moves the mouse in steps, then double clicks the browser's own way and puts the caret at the end. */
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
  const ok = await pollUntil(
    () => el.getAttribute('contenteditable'),
    (v) => v === 'true',
    4000,
    50,
  );
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
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined);
const saveWords = (page) =>
  page.evaluate(
    () => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
  );
const staleWords = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.ts-snackbar, .pt-toast, [data-control="snackbar"]')]
        .map((el) => el.textContent ?? '')
        .filter((t) =>
          /stale|not accepted|refused|reload and rebase|changed in the Blob|No block|was not applied/i.test(
            t,
          ),
        )
        .join(' | ') || null,
  );
/** The document as the editor holds it: every slide through slide.get, the deck facts through deck.info. */
const readDocument = async (page) => {
  const info = await invoke(page, 'deck.info');
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  const ids = (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
  const slides = {};
  for (const id of ids) slides[id] = (await invoke(page, 'slide.get', { slideId: id })).slide;
  const s = await state(page);
  return {
    id: info.id,
    title: info.title ?? info.name,
    revision: s.revision,
    serverRevision: s.serverRevision,
    seq: s.sync?.seq,
    pending: s.sync?.pending ?? s.pending,
    retained: s.sync?.retained,
    order: ids,
    slides,
  };
};

// the wire: every ops POST of a page, with its timing and the answer's headers
const wireOf = (page, name, sink) => {
  page.on('request', (request) => {
    if (!/\/api\/decks\/[^/]+\/ops$/.test(request.url()) || request.method() !== 'POST') return;
    const body = request.postData();
    let entries = null;
    let base = null;
    try {
      const parsed = JSON.parse(body ?? '{}');
      entries = parsed.entries?.length ?? null;
      base = parsed.base?.seq ?? null;
    } catch {
      // not json
    }
    const row = {
      who: name,
      at: rel(now()),
      entries,
      base,
      status: null,
      ms: null,
      revision: null,
      vercelId: null,
    };
    sink.push(row);
    request
      .response()
      .then(async (response) => {
        if (!response) return;
        row.status = response.status();
        row.ms = rel(now()) - row.at;
        row.revision = response.headers()['x-turboslide-revision'] ?? null;
        row.vercelId = response.headers()['x-vercel-id'] ?? null;
        row.retryAfter = response.headers()['retry-after'] ?? null;
        if (row.status >= 400) {
          row.body = (await response.text().catch(() => '')).slice(0, 200);
        }
      })
      .catch(() => undefined);
  });
  page.on('response', (response) => {
    if (!/\/api\/decks\/[^/]+\/stream/.test(response.url())) return;
    sink.push({
      who: name,
      at: rel(now()),
      stream: true,
      status: response.status(),
      vercelId: response.headers()['x-vercel-id'] ?? null,
    });
  });
};

// ---------------------------------------------------------------------------------------------
// the run

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  phases: {},
  wire: [],
  anomalies: [],
  console: [],
};
const anomaly = (kind, detail) => {
  report.anomalies.push({ kind, ...detail });
  log(`ANOMALY ${kind}: ${JSON.stringify(detail)}`);
};
const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
for (const [name, page] of [
  ['A', A],
  ['B', B],
]) {
  page.on('pageerror', (e) =>
    report.console.push({ who: name, at: rel(now()), error: String(e).slice(0, 300) }),
  );
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      report.console.push({ who: name, at: rel(now()), [m.type()]: m.text().slice(0, 300) });
  });
  wireOf(page, name, report.wire);
}
let deckId = '';
let samplerStop = false;

try {
  // phase 0: the deck
  log('phase 0: A opens /new');
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  deckId = (await invoke(A, 'deck.info')).id;
  log(`deck ${deckId}`);
  await openRun(A);
  await typeHuman(A, 'Sync audit');
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  const first = await connected(A);
  await waitRevision(A, 1);
  await dismissPrompt(A);
  const s0 = await settled(A);
  report.phases.create = {
    url: A.url().replace(BASE, ''),
    tier: first.sync?.tier,
    revision: s0.revision,
    serverRevision: s0.serverRevision,
    clientId: s0.presence?.clientId ?? null,
  };
  log(`created: ${JSON.stringify(report.phases.create)}`);

  log('phase 0: B opens the deck');
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  const bFirst = await connected(B);
  await dismissPrompt(B);
  report.phases.join = {
    revision: bFirst.revision,
    serverRevision: bFirst.serverRevision,
    seq: bFirst.sync?.seq,
    clientId: bFirst.presence?.clientId ?? null,
    others: bFirst.presence?.others?.length ?? null,
    heading: await headingOf(B),
  };
  log(`B joined: ${JSON.stringify(report.phases.join)}`);
  await shot(A, '00-a-created');
  await shot(B, '00-b-joined');

  // phase 1: 30 edits from A at one per 3 s; the arrival order and the latency in B
  log(`phase 1: ${EDITS} edits from A, one per 3 s`);
  const tokens = [];
  const seenInB = new Map(); // token -> { at, revision }
  const bSamples = [];
  const sampler = (async () => {
    let lastText = null;
    let lastRev = null;
    while (!samplerStop) {
      const t = now();
      const [text, s] = await Promise.all([
        runText(B).catch(() => null),
        state(B).catch(() => null),
      ]);
      const rev = s?.serverRevision ?? null;
      if (text !== lastText || rev !== lastRev) {
        bSamples.push({
          at: rel(t),
          revision: s?.revision ?? null,
          serverRevision: rev,
          seq: s?.sync?.seq ?? null,
          text,
        });
        if (text !== null)
          for (const token of tokens)
            if (!seenInB.has(token.text) && text.includes(token.text))
              seenInB.set(token.text, { at: rel(t), revision: rev, seq: s?.sync?.seq ?? null });
        lastText = text;
        lastRev = rev;
      }
      const spent = now() - t;
      await sleep(Math.max(20, 100 - spent));
    }
  })();
  await openRun(A);
  for (let i = 1; i <= EDITS; i += 1) {
    const started = now();
    const text = ` a${String(i).padStart(2, '0')}`;
    await typeHuman(A, text);
    const typedAt = now();
    tokens.push({ text, i, typedAt: rel(typedAt) });
    // the acknowledgement: A's pending back to 0
    const acked = await pollUntil(
      () => state(A),
      (s) => (s.sync?.pending ?? 0) === 0,
      6000,
      50,
    );
    tokens[tokens.length - 1].ackAt = rel(now());
    tokens[tokens.length - 1].ackMs = now() - typedAt;
    tokens[tokens.length - 1].revision = acked.revision;
    tokens[tokens.length - 1].serverRevision = acked.serverRevision;
    tokens[tokens.length - 1].pendingAtAck = acked.sync?.pending ?? null;
    const wait = 3000 - (now() - started);
    if (wait > 0) await sleep(wait);
  }
  await A.keyboard.press('Escape');
  await dismissPrompt(A);
  // let B catch up
  await pollUntil(
    () => Promise.resolve(seenInB.size),
    (n) => n >= tokens.length,
    20_000,
    200,
  );
  await sleep(2000);
  samplerStop = true;
  await sampler;
  const aText = await headingOf(A);
  const bText = await headingOf(B);
  const latencies = tokens.map((t) => {
    const seen = seenInB.get(t.text);
    return {
      token: t.text,
      typedAt: t.typedAt,
      ackMs: t.ackMs,
      revision: t.revision,
      seenAt: seen?.at ?? null,
      latencyMs: seen ? seen.at - t.typedAt : null,
      seenRevision: seen?.revision ?? null,
    };
  });
  const arrivalOrder = [...seenInB.entries()]
    .sort((x, y) => x[1].at - y[1].at)
    .map(([token]) => token);
  const expectedOrder = tokens.map((t) => t.text);
  const inOrder = arrivalOrder.join('') === expectedOrder.filter((t) => seenInB.has(t)).join('');
  const lost = tokens.filter((t) => !seenInB.has(t.text)).map((t) => t.text);
  const dup = (text, token) => text.split(token).length - 1 > 1;
  const duplicates = tokens.filter((t) => aText && dup(aText, t.text)).map((t) => t.text);
  const over3s = latencies.filter((l) => l.latencyMs !== null && l.latencyMs > 3000);
  const sA = await state(A);
  const sB = await state(B);
  report.phases.serial = {
    tokens: latencies,
    latency: stats(latencies.filter((l) => l.latencyMs !== null).map((l) => l.latencyMs)),
    ack: stats(tokens.map((t) => t.ackMs)),
    arrivalOrder,
    inOrder,
    lost,
    duplicatesInA: duplicates,
    over3s: over3s.map((l) => ({ token: l.token, latencyMs: l.latencyMs })),
    aText,
    bText,
    equal: aText === bText,
    a: {
      revision: sA.revision,
      serverRevision: sA.serverRevision,
      seq: sA.sync?.seq,
      pending: sA.sync?.pending,
      retained: sA.sync?.retained,
    },
    b: {
      revision: sB.revision,
      serverRevision: sB.serverRevision,
      seq: sB.sync?.seq,
      pending: sB.sync?.pending,
      retained: sB.sync?.retained,
    },
    bSamples,
    saveWords: { a: await saveWords(A), b: await saveWords(B) },
    stale: { a: await staleWords(A), b: await staleWords(B) },
  };
  log(
    `phase 1: latency ${JSON.stringify(report.phases.serial.latency)}, ack ${JSON.stringify(report.phases.serial.ack)}, inOrder ${inOrder}, lost ${lost.length}, equal ${aText === bText}`,
  );
  if (!inOrder) anomaly('reorder', { arrivalOrder });
  if (lost.length > 0) anomaly('lost-write', { lost, aText, bText });
  if (duplicates.length > 0) anomaly('duplicate', { duplicates });
  if (over3s.length > 0) anomaly('latency-over-3s', { count: over3s.length, tokens: over3s });
  if (aText !== bText) anomaly('divergence-after-serial', { aText, bText });
  await shot(A, '01-a-after-serial');
  await shot(B, '01-b-after-serial');

  // phase 2: edits to the same block from A and B within 200 ms
  log('phase 2: concurrent edits to the same block');
  const concurrent = [];
  await openRun(A);
  await openRun(B);
  for (let k = 1; k <= 3; k += 1) {
    const ta = ` xa${k}`;
    const tb = ` xb${k}`;
    const startedAt = now();
    await Promise.all([
      typeHuman(A, ta),
      (async () => {
        await sleep(rand(0, 150));
        await typeHuman(B, tb);
      })(),
    ]);
    const typedAt = now();
    const sa = await pollUntil(
      () => state(A),
      (s) => (s.sync?.pending ?? 0) === 0,
      8000,
      50,
    );
    const sb = await pollUntil(
      () => state(B),
      (s) => (s.sync?.pending ?? 0) === 0,
      8000,
      50,
    );
    // convergence: both texts equal within 10 s
    const both = await pollUntil(
      async () => ({ a: await runText(A), b: await runText(B) }),
      (r) => r.a !== null && r.a === r.b,
      10_000,
      100,
    );
    concurrent.push({
      round: k,
      windowMs: typedAt - startedAt,
      convergedMs: now() - typedAt,
      a: {
        text: both.a,
        revision: sa.revision,
        serverRevision: sa.serverRevision,
        pending: sa.sync?.pending,
        stale: await staleWords(A),
      },
      b: {
        text: both.b,
        revision: sb.revision,
        serverRevision: sb.serverRevision,
        pending: sb.sync?.pending,
        stale: await staleWords(B),
      },
      equal: both.a === both.b,
      aHasBoth: Boolean(both.a && both.a.includes(ta) && both.a.includes(tb)),
      bHasBoth: Boolean(both.b && both.b.includes(ta) && both.b.includes(tb)),
      orderInA: both.a ? (both.a.indexOf(ta) < both.a.indexOf(tb) ? 'a then b' : 'b then a') : null,
      orderInB: both.b ? (both.b.indexOf(ta) < both.b.indexOf(tb) ? 'a then b' : 'b then a') : null,
    });
    log(`phase 2 round ${k}: ${JSON.stringify(concurrent[concurrent.length - 1])}`);
    await sleep(3000);
  }
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await dismissPrompt(A);
  await dismissPrompt(B);
  await sleep(3000);
  const c2a = await headingOf(A);
  const c2b = await headingOf(B);
  report.phases.concurrent = {
    rounds: concurrent,
    aText: c2a,
    bText: c2b,
    equal: c2a === c2b,
    a: await state(A).then((s) => ({
      revision: s.revision,
      serverRevision: s.serverRevision,
      pending: s.sync?.pending,
      retained: s.sync?.retained,
    })),
    b: await state(B).then((s) => ({
      revision: s.revision,
      serverRevision: s.serverRevision,
      pending: s.sync?.pending,
      retained: s.sync?.retained,
    })),
  };
  for (const r of concurrent) {
    if (!r.equal) anomaly('divergence-concurrent', { round: r.round, a: r.a.text, b: r.b.text });
    if (!r.aHasBoth || !r.bHasBoth)
      anomaly('lost-write-concurrent', { round: r.round, a: r.a.text, b: r.b.text });
    if (r.a.stale || r.b.stale)
      anomaly('stale-words-concurrent', { round: r.round, a: r.a.stale, b: r.b.stale });
  }
  if (c2a !== c2b) anomaly('divergence-after-concurrent', { aText: c2a, bText: c2b });
  await shot(A, '02-a-after-concurrent');
  await shot(B, '02-b-after-concurrent');

  // phase 3: A offline 20 s while B edits, A types offline, then A back
  log('phase 3: A offline for 20 s');
  await openRun(B);
  await openRun(A);
  const offlineAt = now();
  await ctxA.setOffline(true);
  const bTokens = [];
  const aOffline = [];
  const bTyping = (async () => {
    for (let k = 1; k <= 5; k += 1) {
      const t = ` b${k}`;
      await typeHuman(B, t);
      bTokens.push({ text: t, at: rel(now()) });
      await sleep(2500);
    }
  })();
  const aTyping = (async () => {
    await sleep(4000);
    for (let k = 1; k <= 2; k += 1) {
      const t = ` o${k}`;
      await typeHuman(A, t);
      aOffline.push({
        text: t,
        at: rel(now()),
        state: await state(A).then((s) => ({
          pending: s.sync?.pending,
          offline: s.sync?.offline,
          streamDown: s.sync?.streamDown,
          connected: s.sync?.connected,
        })),
      });
      await sleep(5000);
    }
  })();
  await Promise.all([bTyping, aTyping]);
  const remaining = 20_000 - (now() - offlineAt);
  if (remaining > 0) await sleep(remaining);
  const aBeforeOnline = await state(A);
  const aWordsOffline = await saveWords(A);
  await shot(A, '03-a-offline');
  await ctxA.setOffline(false);
  const onlineAt = now();
  log('phase 3: A back online');
  const aSettled = await pollUntil(
    () => state(A),
    (s) => (s.sync?.pending ?? 0) === 0 && s.sync?.connected === true,
    45_000,
    100,
  );
  const aSettledMs = now() - onlineAt;
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await dismissPrompt(A);
  await dismissPrompt(B);
  const converged = await pollUntil(
    async () => ({ a: await headingOf(A), b: await headingOf(B) }),
    (r) => r.a !== null && r.a === r.b,
    30_000,
    200,
  );
  const convergedMs = now() - onlineAt;
  const s3a = await state(A);
  const s3b = await state(B);
  const allTokens = [...bTokens.map((t) => t.text), ...aOffline.map((t) => t.text)];
  report.phases.offline = {
    offlineMs: onlineAt - offlineAt,
    bTokens,
    aOffline,
    aBeforeOnline: {
      pending: aBeforeOnline.sync?.pending,
      offline: aBeforeOnline.sync?.offline,
      streamDown: aBeforeOnline.sync?.streamDown,
      connected: aBeforeOnline.sync?.connected,
      revision: aBeforeOnline.revision,
      words: aWordsOffline,
    },
    aSettledMs,
    aSettled: {
      pending: aSettled.sync?.pending,
      connected: aSettled.sync?.connected,
      revision: aSettled.revision,
      serverRevision: aSettled.serverRevision,
    },
    convergedMs,
    converged: converged.a === converged.b,
    aText: converged.a,
    bText: converged.b,
    lostInA: allTokens.filter((t) => !(converged.a ?? '').includes(t)),
    lostInB: allTokens.filter((t) => !(converged.b ?? '').includes(t)),
    duplicatesInA: allTokens.filter((t) => (converged.a ?? '').split(t).length - 1 > 1),
    duplicatesInB: allTokens.filter((t) => (converged.b ?? '').split(t).length - 1 > 1),
    a: {
      revision: s3a.revision,
      serverRevision: s3a.serverRevision,
      seq: s3a.sync?.seq,
      pending: s3a.sync?.pending,
      retained: s3a.sync?.retained,
    },
    b: {
      revision: s3b.revision,
      serverRevision: s3b.serverRevision,
      seq: s3b.sync?.seq,
      pending: s3b.sync?.pending,
      retained: s3b.sync?.retained,
    },
    saveWords: { a: await saveWords(A), b: await saveWords(B) },
    stale: { a: await staleWords(A), b: await staleWords(B) },
  };
  log(
    `phase 3: ${JSON.stringify({ ...report.phases.offline, bTokens: undefined, aOffline: undefined })}`,
  );
  if (!report.phases.offline.converged)
    anomaly('divergence-after-offline', { aText: converged.a, bText: converged.b });
  if (report.phases.offline.lostInA.length || report.phases.offline.lostInB.length)
    anomaly('lost-write-offline', {
      lostInA: report.phases.offline.lostInA,
      lostInB: report.phases.offline.lostInB,
    });
  if (report.phases.offline.duplicatesInA.length || report.phases.offline.duplicatesInB.length)
    anomaly('duplicate-offline', {
      a: report.phases.offline.duplicatesInA,
      b: report.phases.offline.duplicatesInB,
    });
  await shot(A, '03-a-after-offline');
  await shot(B, '03-b-after-offline');

  // phase 4: both reloaded, the two documents diffed
  log('phase 4: both reload');
  const serverBefore = { a: s3a.serverRevision, b: s3b.serverRevision };
  const reload = async (page) => {
    const t = now();
    await page.goto('about:blank');
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await connected(page);
    await dismissPrompt(page);
    await settled(page, 15_000);
    return now() - t;
  };
  const [msA, msB] = await Promise.all([reload(A), reload(B)]);
  const docA = await readDocument(A);
  const docB = await readDocument(B);
  const canon = (d) => JSON.stringify({ title: d.title, order: d.order, slides: d.slides });
  const same = canon(docA) === canon(docB);
  const expectedHeading = converged.a;
  report.phases.reload = {
    reloadMs: { a: msA, b: msB },
    a: {
      ...docA,
      slides: undefined,
      heading: String(docA.slides.title?.heading ?? '').replace(/\u00a0/g, ' '),
    },
    b: {
      ...docB,
      slides: undefined,
      heading: String(docB.slides.title?.heading ?? '').replace(/\u00a0/g, ' '),
    },
    same,
    sameRevision: docA.revision === docB.revision,
    staleAgainstLive: {
      a: docA.revision < serverBefore.a,
      b: docB.revision < serverBefore.b,
      liveBefore: serverBefore,
    },
    headingMatchesLive: {
      a: String(docA.slides.title?.heading ?? '').replace(/\u00a0/g, ' ') === expectedHeading,
      b: String(docB.slides.title?.heading ?? '').replace(/\u00a0/g, ' ') === expectedHeading,
    },
  };
  writeFileSync(path.join(OUT, 'reload-a.json'), JSON.stringify(docA, null, 2));
  writeFileSync(path.join(OUT, 'reload-b.json'), JSON.stringify(docB, null, 2));
  log(`phase 4: ${JSON.stringify(report.phases.reload)}`);
  if (!same) anomaly('reload-diverged', { a: report.phases.reload.a, b: report.phases.reload.b });
  if (report.phases.reload.staleAgainstLive.a || report.phases.reload.staleAgainstLive.b)
    anomaly('stale-reload', report.phases.reload.staleAgainstLive);
  await shot(A, '04-a-reloaded');
  await shot(B, '04-b-reloaded');
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`ERROR ${report.error}`);
} finally {
  samplerStop = true;
  report.finishedAt = new Date().toISOString();
  report.seconds = Math.round((now() - T0) / 1000);
  if (deckId) {
    report.teardown = {};
    try {
      await ctxA.setOffline(false).catch(() => undefined);
      await B.close().catch(() => undefined);
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
        await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(
          () => undefined,
        );
        await editorReady(A).catch(() => undefined);
        const info = await invoke(A, 'deck.info').catch(() => null);
        if (info) {
          await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
          const t = await invoke(A, 'deck.info').catch(() => null);
          await invoke(A, 'deck.remove', {
            id: deckId,
            baseRevision: t?.revision ?? info.revision,
            confirm: true,
          }).catch(() => undefined);
          report.teardown.fallback = true;
        }
      } catch {
        // the 404 probe below tells the truth
      }
    }
    let status = 0;
    const until = now() + 30_000;
    for (;;) {
      const res = await A.request
        .get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 })
        .catch(() => null);
      status = res ? res.status() : 0;
      if (status === 404 || now() > until) break;
      await sleep(2000);
    }
    report.teardown.deckStatus = status;
    report.teardown.gone = status === 404;
    log(`teardown: ${JSON.stringify(report.teardown)}`);
  }
  await browser.close().catch(() => undefined);
  writeFileSync(
    path.join(OUT, 'ordering-run.json'),
    JSON.stringify({ ...report, deckId }, null, 2),
  );
  log(`written ${path.join(OUT, 'ordering-run.json')}; anomalies ${report.anomalies.length}`);
}

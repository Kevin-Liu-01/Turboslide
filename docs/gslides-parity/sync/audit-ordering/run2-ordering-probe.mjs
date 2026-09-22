#!/usr/bin/env node
// The ordering probe, run 2 (docs/gslides-parity/sync/audit-ordering.md). Run 1 showed a second
// anonymous principal lands on the viewer floor on production (authorize.ts shadowStanding), whose
// stream carries no ops, so this run gives B the first browser's cookies (the same person in a
// second browser, as the round five stress probe did) and keeps a third browser C as the stranger
// to record what a viewer sees. Two editors on one scratch deck at human speed: 30 edits from A at
// one per 3 s with the arrival order and the latency in B; edits to the same block from A and B
// within 200 ms; A offline 20 s while B edits; both reloaded and the documents diffed through the
// window API (slide.get for every slide). Imports playwright-core alone.
//
//   node ordering-probe-2.mjs --base https://turboslide.vercel.app --out <dir> [--edits 30]
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
const PREFIX = arg('prefix', 'run2');
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
/** The mode facts of a page: an editor stage or a viewer, the role the state carries. */
const modeOf = (page) =>
  page.evaluate(() => {
    const s = window.turboslide?.studio?.describe?.().state ?? {};
    return {
      editorStage: document.querySelector('.ts-stagewrap.ts-editor') !== null,
      role: s.access?.role ?? s.role ?? null,
      mode: s.mode ?? null,
      saveWords:
        document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
      viewOnly: [...document.querySelectorAll('button, [role="button"], span')].some((el) =>
        /^View only$/.test(el.textContent?.trim() ?? ''),
      ),
    };
  });
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
  page.screenshot({ path: path.join(OUT, `${PREFIX}-${name}.png`) }).catch(() => undefined);
const saveWords = (page) =>
  page.evaluate(
    () => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
  );
const staleWords = (page) =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          '.ts-snackbar, .pt-toast, [data-control="snackbar"], .ts-reject, [data-control^="reject"]',
        ),
      ]
        .map((el) => el.textContent ?? '')
        .filter((t) =>
          /stale|not accepted|refused|reload and rebase|changed in the Blob|No block|was not applied|is outside a text/i.test(
            t,
          ),
        )
        .join(' | ') || null,
  );
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
const brief = (s) => ({
  revision: s.revision,
  serverRevision: s.serverRevision,
  seq: s.sync?.seq,
  pending: s.sync?.pending,
  retained: s.sync?.retained,
  connected: s.sync?.connected,
  offline: s.sync?.offline,
  streamDown: s.sync?.streamDown,
});

const wireOf = (page, name, sink) => {
  page.on('request', (request) => {
    if (!/\/api\/decks\/[^/]+\/ops$/.test(request.url()) || request.method() !== 'POST') return;
    let entries = null;
    let base = null;
    try {
      const parsed = JSON.parse(request.postData() ?? '{}');
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
        if (!response) {
          row.status = 'no response';
          row.ms = rel(now()) - row.at;
          return;
        }
        row.status = response.status();
        row.ms = rel(now()) - row.at;
        row.revision = response.headers()['x-turboslide-revision'] ?? null;
        row.vercelId = response.headers()['x-vercel-id'] ?? null;
        row.retryAfter = response.headers()['retry-after'] ?? null;
        if (row.status >= 400) row.body = (await response.text().catch(() => '')).slice(0, 240);
        else {
          const body = await response.json().catch(() => null);
          if (body) {
            row.admitted = body.entries?.map((e) => e.seq) ?? null;
            row.rejected = body.rejected?.length ?? null;
            row.between = body.between?.length ?? null;
          }
        }
      })
      .catch((error) => {
        row.status = `failed: ${String(error).slice(0, 80)}`;
        row.ms = rel(now()) - row.at;
      });
  });
  page.on('response', (response) => {
    if (!/\/api\/decks\/[^/]+\/stream/.test(response.url())) return;
    sink.push({
      who: name,
      at: rel(now()),
      stream: true,
      status: response.status(),
      vercelId: response.headers()['x-vercel-id'] ?? null,
      retryAfter: response.headers()['retry-after'] ?? null,
    });
  });
  page.on('requestfailed', (request) => {
    if (!/\/api\/decks\//.test(request.url())) return;
    sink.push({
      who: name,
      at: rel(now()),
      failed: request.url().replace(BASE, ''),
      reason: request.failure()?.errorText ?? null,
    });
  });
};

const report = {
  run: PREFIX,
  base: BASE,
  startedAt: new Date().toISOString(),
  phases: {},
  wire: [],
  anomalies: [],
  console: [],
};
const anomaly = (kind, detail) => {
  report.anomalies.push({ kind, ...detail });
  log(`ANOMALY ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
};
const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
let ctxB = null;
let B = null;
let ctxC = null;
let C = null;
const attach = (name, page) => {
  page.on('pageerror', (e) =>
    report.console.push({ who: name, at: rel(now()), error: String(e).slice(0, 300) }),
  );
  page.on('console', (m) => {
    if (
      (m.type() === 'error' || m.type() === 'warning') &&
      !/upgrade-insecure-requests/.test(m.text())
    )
      report.console.push({ who: name, at: rel(now()), [m.type()]: m.text().slice(0, 300) });
  });
  wireOf(page, name, report.wire);
};
attach('A', A);
let deckId = '';
let samplerStop = false;

try {
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
    ...brief(s0),
    clientId: s0.presence?.clientId ?? null,
    mode: await modeOf(A),
  };
  log(`created: ${JSON.stringify(report.phases.create)}`);

  // B: the same person in a second browser (A's cookies), an editor; C: a stranger, the viewer floor
  ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: await ctxA.storageState(),
  });
  B = await ctxB.newPage();
  attach('B', B);
  ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  C = await ctxC.newPage();
  attach('C', C);
  log('phase 0: B (same person) and C (a stranger) open the deck');
  await Promise.all([
    B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }),
    C.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }),
  ]);
  await Promise.all([editorReady(B), editorReady(C)]);
  const [bFirst, cFirst] = await Promise.all([connected(B), connected(C)]);
  await dismissPrompt(B);
  await dismissPrompt(C);
  report.phases.join = {
    b: {
      ...brief(bFirst),
      clientId: bFirst.presence?.clientId ?? null,
      others: bFirst.presence?.others?.length ?? null,
      heading: await headingOf(B),
      mode: await modeOf(B),
    },
    c: {
      ...brief(cFirst),
      clientId: cFirst.presence?.clientId ?? null,
      others: cFirst.presence?.others?.length ?? null,
      heading: await headingOf(C),
      mode: await modeOf(C),
    },
  };
  log(`joined: ${JSON.stringify(report.phases.join)}`);
  await shot(A, '00-a-created');
  await shot(B, '00-b-joined');
  await shot(C, '00-c-joined');

  // phase 1: 30 edits from A at one per 3 s; the arrival order and the latency in B (and C's view)
  log(`phase 1: ${EDITS} edits from A, one per 3 s`);
  const tokens = [];
  const seenInB = new Map();
  const seenInC = new Map();
  const bSamples = [];
  const sampler = (async () => {
    let last = '';
    let tick = 0;
    while (!samplerStop) {
      const t = now();
      tick += 1;
      const [bText, bs, bDoc] = await Promise.all([
        runText(B).catch(() => null),
        state(B).catch(() => null),
        tick % 5 === 0 ? headingOf(B).catch(() => null) : Promise.resolve(undefined),
      ]);
      const cRow =
        tick % 10 === 0
          ? await Promise.all([headingOf(C).catch(() => null), state(C).catch(() => null)])
          : null;
      const key = `${bText}|${bs?.serverRevision}|${bs?.sync?.seq}`;
      if (key !== last) {
        bSamples.push({
          at: rel(t),
          revision: bs?.revision ?? null,
          serverRevision: bs?.serverRevision ?? null,
          seq: bs?.sync?.seq ?? null,
          pending: bs?.sync?.pending ?? null,
          text: bText,
        });
        last = key;
      }
      const shown = bText ?? bDoc ?? null;
      if (shown !== null)
        for (const token of tokens)
          if (!seenInB.has(token.text) && shown.includes(token.text))
            seenInB.set(token.text, {
              at: rel(t),
              revision: bs?.serverRevision ?? null,
              seq: bs?.sync?.seq ?? null,
            });
      if (cRow && cRow[0] !== null)
        for (const token of tokens)
          if (!seenInC.has(token.text) && cRow[0].includes(token.text))
            seenInC.set(token.text, {
              at: rel(t),
              revision: cRow[1]?.serverRevision ?? null,
              seq: cRow[1]?.sync?.seq ?? null,
            });
      const spent = now() - t;
      await sleep(Math.max(20, 100 - spent));
    }
  })();
  await openRun(A);
  for (let i = 1; i <= EDITS; i += 1) {
    const started = now();
    const before = (await state(A)).revision;
    const text = ` a${String(i).padStart(2, '0')}`;
    await typeHuman(A, text);
    const typedAt = now();
    const revision = await waitRevision(A, before + 1, 8000);
    const acked = await state(A);
    tokens.push({
      text,
      i,
      typedAt: rel(typedAt),
      ackMs: now() - typedAt,
      revisionBefore: before,
      revision,
      pendingAtAck: acked.sync?.pending ?? null,
    });
    const wait = 3000 - (now() - started);
    if (wait > 0) await sleep(wait);
  }
  await A.keyboard.press('Escape');
  await dismissPrompt(A);
  await pollUntil(
    () => Promise.resolve(seenInB.size),
    (n) => n >= tokens.length,
    20_000,
    200,
  );
  await sleep(3000);
  samplerStop = true;
  await sampler;
  const aText = await headingOf(A);
  const bText = await headingOf(B);
  const cText = await headingOf(C);
  const latencies = tokens.map((t) => {
    const seen = seenInB.get(t.text);
    const seenC = seenInC.get(t.text);
    return {
      token: t.text,
      typedAt: t.typedAt,
      ackMs: t.ackMs,
      revision: t.revision,
      seenAt: seen?.at ?? null,
      latencyMs: seen ? seen.at - t.typedAt : null,
      seenRevision: seen?.revision ?? null,
      seenSeq: seen?.seq ?? null,
      seenInCMs: seenC ? seenC.at - t.typedAt : null,
    };
  });
  const arrivalOrder = [...seenInB.entries()]
    .sort((x, y) => x[1].at - y[1].at)
    .map(([token]) => token);
  const expectedOrder = tokens.map((t) => t.text).filter((t) => seenInB.has(t));
  const inOrder = arrivalOrder.join('') === expectedOrder.join('');
  const lost = tokens.filter((t) => !seenInB.has(t.text)).map((t) => t.text);
  const countIn = (text, token) => (text ?? '').split(token).length - 1;
  const duplicates = tokens
    .filter((t) => countIn(aText, t.text) > 1 || countIn(bText, t.text) > 1)
    .map((t) => t.text);
  const over3s = latencies.filter((l) => l.latencyMs !== null && l.latencyMs > 3000);
  const sA = await state(A);
  const sB = await state(B);
  const sC = await state(C);
  report.phases.serial = {
    tokens: latencies,
    latency: stats(latencies.filter((l) => l.latencyMs !== null).map((l) => l.latencyMs)),
    ack: stats(tokens.map((t) => t.ackMs)),
    arrivalOrder,
    inOrder,
    lost,
    duplicates,
    over3s: over3s.map((l) => ({ token: l.token, latencyMs: l.latencyMs })),
    aText,
    bText,
    cText,
    equalAB: aText === bText,
    a: brief(sA),
    b: brief(sB),
    c: { ...brief(sC), mode: await modeOf(C), seenTokens: seenInC.size },
    bSamples,
    saveWords: { a: await saveWords(A), b: await saveWords(B), c: await saveWords(C) },
    stale: { a: await staleWords(A), b: await staleWords(B) },
  };
  log(
    `phase 1: latency ${JSON.stringify(report.phases.serial.latency)}, ack ${JSON.stringify(report.phases.serial.ack)}, inOrder ${inOrder}, lost ${lost.length}, equalAB ${aText === bText}, C saw ${seenInC.size} tokens, C heading "${cText}" at revision ${sC.revision}`,
  );
  if (!inOrder) anomaly('reorder', { arrivalOrder });
  if (lost.length > 0) anomaly('lost-write', { lost, aText, bText });
  if (duplicates.length > 0) anomaly('duplicate', { duplicates });
  if (over3s.length > 0) anomaly('latency-over-3s', { count: over3s.length, tokens: over3s });
  if (aText !== bText) anomaly('divergence-after-serial', { aText, bText });
  if (cText !== aText) anomaly('viewer-stale', { cText, aText, cState: report.phases.serial.c });
  await shot(A, '01-a-after-serial');
  await shot(B, '01-b-after-serial');
  await shot(C, '01-c-after-serial');

  // phase 2: edits to the same block from A and B within 200 ms
  log('phase 2: concurrent edits to the same block');
  const concurrent = [];
  await openRun(A);
  await openRun(B);
  for (let k = 1; k <= 3; k += 1) {
    const ta = ` xa${k}`;
    const tb = ` xb${k}`;
    const startedAt = now();
    const ra = (await state(A)).revision;
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
      (s) => (s.sync?.pending ?? 0) === 0 && s.revision >= ra + 1,
      10_000,
      50,
    );
    const sb = await pollUntil(
      () => state(B),
      (s) => (s.sync?.pending ?? 0) === 0 && s.revision >= ra + 1,
      10_000,
      50,
    );
    const both = await pollUntil(
      async () => ({ a: await runText(A), b: await runText(B) }),
      (r) => r.a !== null && r.a === r.b && r.a.includes(ta) && r.a.includes(tb),
      12_000,
      100,
    );
    const row = {
      round: k,
      windowMs: typedAt - startedAt,
      convergedMs: now() - typedAt,
      a: { text: both.a, ...brief(sa), stale: await staleWords(A) },
      b: { text: both.b, ...brief(sb), stale: await staleWords(B) },
      equal: both.a === both.b,
      aHasBoth: Boolean(both.a && both.a.includes(ta) && both.a.includes(tb)),
      bHasBoth: Boolean(both.b && both.b.includes(ta) && both.b.includes(tb)),
      orderInA:
        both.a && both.a.includes(ta) && both.a.includes(tb)
          ? both.a.indexOf(ta) < both.a.indexOf(tb)
            ? 'a then b'
            : 'b then a'
          : null,
      orderInB:
        both.b && both.b.includes(ta) && both.b.includes(tb)
          ? both.b.indexOf(ta) < both.b.indexOf(tb)
            ? 'a then b'
            : 'b then a'
          : null,
    };
    concurrent.push(row);
    log(`phase 2 round ${k}: ${JSON.stringify(row).slice(0, 500)}`);
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
    a: brief(await state(A)),
    b: brief(await state(B)),
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
        state: brief(await state(A)),
        words: await saveWords(A),
      });
      await sleep(5000);
    }
  })();
  await Promise.all([bTyping, aTyping]);
  const remaining = 20_000 - (now() - offlineAt);
  if (remaining > 0) await sleep(remaining);
  const aBeforeOnline = { ...brief(await state(A)), words: await saveWords(A) };
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
    aBeforeOnline,
    aSettledMs,
    aSettled: brief(aSettled),
    convergedMs,
    converged: converged.a === converged.b,
    aText: converged.a,
    bText: converged.b,
    lostInA: allTokens.filter((t) => !(converged.a ?? '').includes(t)),
    lostInB: allTokens.filter((t) => !(converged.b ?? '').includes(t)),
    duplicatesInA: allTokens.filter((t) => countIn(converged.a, t) > 1),
    duplicatesInB: allTokens.filter((t) => countIn(converged.b, t) > 1),
    orderA: allTokens
      .map((t) => [t, (converged.a ?? '').indexOf(t)])
      .sort((x, y) => x[1] - y[1])
      .map((r) => r[0]),
    a: brief(s3a),
    b: brief(s3b),
    saveWords: { a: await saveWords(A), b: await saveWords(B) },
    stale: { a: await staleWords(A), b: await staleWords(B) },
  };
  log(
    `phase 3: ${JSON.stringify({ ...report.phases.offline, bTokens: undefined, aOffline: undefined }).slice(0, 900)}`,
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

  // phase 4: A, B and C reloaded, the documents diffed
  log('phase 4: A, B and C reload');
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
  const [msA, msB, msC] = await Promise.all([reload(A), reload(B), reload(C)]);
  const [docA, docB, docC] = await Promise.all([readDocument(A), readDocument(B), readDocument(C)]);
  const canon = (d) => JSON.stringify({ title: d.title, order: d.order, slides: d.slides });
  const headingOfDoc = (d) => String(d.slides.title?.heading ?? '').replace(/\u00a0/g, ' ');
  report.phases.reload = {
    reloadMs: { a: msA, b: msB, c: msC },
    a: { ...docA, slides: undefined, heading: headingOfDoc(docA) },
    b: { ...docB, slides: undefined, heading: headingOfDoc(docB) },
    c: { ...docC, slides: undefined, heading: headingOfDoc(docC), mode: await modeOf(C) },
    sameAB: canon(docA) === canon(docB),
    sameAC: canon(docA) === canon(docC),
    sameRevision: docA.revision === docB.revision && docB.revision === docC.revision,
    staleAgainstLive: {
      a: docA.revision < serverBefore.a,
      b: docB.revision < serverBefore.b,
      liveBefore: serverBefore,
    },
    headingMatchesLive: {
      a: headingOfDoc(docA) === converged.a,
      b: headingOfDoc(docB) === converged.a,
      c: headingOfDoc(docC) === converged.a,
    },
  };
  writeFileSync(path.join(OUT, `${PREFIX}-reload-a.json`), JSON.stringify(docA, null, 2));
  writeFileSync(path.join(OUT, `${PREFIX}-reload-b.json`), JSON.stringify(docB, null, 2));
  writeFileSync(path.join(OUT, `${PREFIX}-reload-c.json`), JSON.stringify(docC, null, 2));
  log(`phase 4: ${JSON.stringify(report.phases.reload).slice(0, 900)}`);
  if (!report.phases.reload.sameAB)
    anomaly('reload-diverged', { a: report.phases.reload.a, b: report.phases.reload.b });
  if (report.phases.reload.staleAgainstLive.a || report.phases.reload.staleAgainstLive.b)
    anomaly('stale-reload', report.phases.reload.staleAgainstLive);
  await shot(A, '04-a-reloaded');
  await shot(B, '04-b-reloaded');
  await shot(C, '04-c-reloaded');
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`ERROR ${report.error.slice(0, 400)}`);
} finally {
  samplerStop = true;
  report.finishedAt = new Date().toISOString();
  report.seconds = Math.round((now() - T0) / 1000);
  if (deckId) {
    report.teardown = {};
    try {
      await ctxA.setOffline(false).catch(() => undefined);
      await B?.close().catch(() => undefined);
      await C?.close().catch(() => undefined);
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
    path.join(OUT, `${PREFIX}-ordering-run.json`),
    JSON.stringify({ ...report, deckId }, null, 2),
  );
  log(
    `written ${path.join(OUT, `${PREFIX}-ordering-run.json`)}; anomalies ${report.anomalies.length}`,
  );
}

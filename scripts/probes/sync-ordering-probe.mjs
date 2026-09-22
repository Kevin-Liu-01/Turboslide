#!/usr/bin/env node
// The ordering probe (docs/SYNC.md 6.1; audit-ordering item 8): the ordering audit's run 2, run 3
// and run 4 probes (docs/gslides-parity/sync/audit-ordering/run{2,3,4}-ordering-probe.mjs) folded
// into one script, with the tier's bounds and every number written to one JSON. Two browsers of one
// person at human speed (A on /new, B with A's cookies on /edit/<id>, the audit's run 2), a third
// browser C as a stranger on the viewer floor (the deck's general access set to Anyone with the
// link, Viewer through the window API before C opens, the setup of the row `sync.viewer.live-updates`),
// on one scratch deck trashed and deleted forever in the finally block. The phases, each a section
// of the audit and each named by the matrix row it measures:
//
//   serial        30 edits from A one per 3 s; the arrival order and the latency in B and in C
//                 (sync.serial.order-and-latency, sync.viewer.live-updates; run 2 phase 1)
//   title-open    both sessions open on the title, both type within 200 ms, two rounds, the wire
//                 for 12 s after each, then Escape (sync.title.concurrent-both-kept; run 3 part a)
//   title-closed  type and Escape at once on the title, two rounds (run 3 part b)
//   title-offline A offline 20 s with its session closed, B types three words, A opens, types one,
//                 closes offline, A back (sync.title.offline-both-kept; run 3 part c)
//   block-open    the same three parts on a body block placed by block.insert, the text.splice
//                 path (sync.block.concurrent-same-offset-order; run 4 part a)
//   block-closed  (run 4 part b)
//   block-offline (sync.block.offline-replay-converges; run 4 part c)
//   reload        A, B and C reload in parallel and the documents are diffed through the window
//                 API (sync.reload.same-document; run 2 phase 4)
//
// The wire records every ops POST of A and B with its body's shape (the op, the path, the offset,
// the removed and inserted lengths; never the text beyond 24 characters, never a header or a
// cookie) and its answer (the status, the admitted seqs, the `between`, the revision header). The
// anomalies of the audit's vocabulary (lost-write, reorder, duplicate, latency-over-bound,
// divergence, viewer-stale, open-sessions-diverge, repair-splice, offline-lost) are counted, so a
// run's JSON reads beside the audit's runs. The bounds are the tier's (`--tier memory|blob`,
// docs/SYNC.md 6.1: a word within 1 s on the memory tier and 5 s on the blob tier; 5 s for the
// concurrent title; 3 s for the block on the memory tier and 5 s on the blob tier, the serial
// row's split, since the blob tier's propagation read 1.3 s mean and 2.9 s max on the verifier's
// pass 1; 10 s after a reconnect, 5 s for a reload). The tier is read from the page
// (`describe().state.sync.tier`) and the JSON says when the flag and the page differ.
//
// C joins the way a customer does (the verifier's pass 1 F9): `share.setGeneralAccess` in link
// mode answers the link's `/s/<token>` URL once, C opens it as a navigation (the route writes the
// grant on C's principal and redirects to `/deck/<id>`), then opens `/edit/<id>` on the viewer
// floor. Under enforce the plain `/edit/<id>` never admits a stranger, so the `--tier blob` run
// of pass 1 ended at its access phase. The token is never logged or written to the JSON.
//
//   node scripts/probes/sync-ordering-probe.mjs --base <origin> --out <dir> --tier memory|blob
//     [--phases serial,title-open,...] [--edits 30] [--prefix <name>] [--shots]
//
// On the preview VERCEL_OIDC_TOKEN is sent as x-vercel-trusted-oidc-idp-token; on production and
// localhost nothing. Exit 1 when an anomaly was recorded, 2 on a usage error; the JSON is written
// either way. Imports playwright-core alone, the way the walk probe does.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

// ---------------------------------------------------------------------------------------------
// arguments and bounds

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
const OUT = arg('out', null);
const TIER = arg('tier', null);
const EDITS = Number(arg('edits', '30'));
const PREFIX = arg('prefix', `ordering-${new Date().toISOString().slice(0, 10)}`);
const SHOTS = flag('shots');
const ALL_PHASES = [
  'serial',
  'title-open',
  'title-closed',
  'title-offline',
  'block-open',
  'block-closed',
  'block-offline',
  'reload',
];
const PHASES = (arg('phases', ALL_PHASES.join(',')) ?? '').split(',').map((s) => s.trim());
if (
  !BASE ||
  !OUT ||
  (TIER !== 'memory' && TIER !== 'blob') ||
  PHASES.some((p) => !ALL_PHASES.includes(p))
) {
  console.error(
    'usage: node scripts/probes/sync-ordering-probe.mjs --base <origin> --out <dir> --tier memory|blob [--phases a,b] [--edits 30] [--prefix <name>] [--shots]',
  );
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

/** The bounds of docs/SYNC.md 6.1 by tier, in ms. */
export const BOUNDS = Object.freeze({
  memory: {
    serialWord: 1000,
    viewerWord: 5000,
    titleConcurrent: 5000,
    blockConcurrent: 3000,
    reconnect: 10_000,
    reload: 5000,
  },
  blob: {
    serialWord: 5000,
    viewerWord: 5000,
    titleConcurrent: 5000,
    blockConcurrent: 5000,
    reconnect: 10_000,
    reload: 5000,
  },
});
const bound = BOUNDS[TIER];

/** The path of a `/s/<token>` URL as an answer carries it (whatever its origin), or null. */
export function shareLinkPath(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const u = new URL(url, 'http://turboslide.invalid');
    return u.pathname.startsWith('/s/') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}
/** A page's path for the JSON: the share token and the deck id never written. */
export function pathForLedger(url, deckId) {
  try {
    const p = new URL(url).pathname;
    return p.startsWith('/s/') ? '/s/<token>' : p.replace(deckId, '<id>');
  } catch {
    return '(no url)';
  }
}

// ---------------------------------------------------------------------------------------------
// helpers (the audit probes')

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
const countIn = (text, token) => (text ?? '').split(token).length - 1;

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
    const close = page.locator('[data-control="dialog.namePrompt.close"]');
    if ((await close.count()) > 0)
      await close
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
    else
      await page
        .locator('[data-control="dialog.namePrompt.skip"]')
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
const runSel = (run) => `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`;
const runText = (page, run) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
  }, runSel(run));
const firstSlide = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s)[0];
};
const headingOf = async (page) => {
  const id = await firstSlide(page);
  const got = await invoke(page, 'slide.get', { slideId: id });
  return String(got.slide?.heading ?? '').replace(/\u00a0/g, ' ');
};
const blockTextOf = async (page, slideId, blockId) => {
  const got = await invoke(page, 'slide.get', { slideId });
  const find = (node) => {
    if (Array.isArray(node)) {
      for (const x of node) {
        const r = find(x);
        if (r !== null) return r;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      if (node.id === blockId && typeof node.text === 'string') return node.text;
      for (const v of Object.values(node)) {
        const r = find(v);
        if (r !== null) return r;
      }
    }
    return null;
  };
  return (find(got.slide) ?? '').replace(/\u00a0/g, ' ').replace(/<[^>]+>/g, '');
};
const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
const openRun = async (page, run, where = 'end') => {
  const el = page.locator(runSel(run));
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
  if (where === 'end') {
    await page.keyboard.press(END_OF_TEXT);
    await page.keyboard.press('End');
  } else {
    await page.keyboard.press('Home');
  }
  return ok === 'true';
};
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const shot = (page, name) =>
  SHOTS
    ? page.screenshot({ path: path.join(OUT, `${PREFIX}-${name}.png`) }).catch(() => undefined)
    : Promise.resolve();
const saveWords = (page) =>
  page.evaluate(
    () => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
  );
const staleWords = (page) =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          '.ts-snackbar, .pt-toast, [data-control="snackbar"], .ts-conflict, .ts-reject',
        ),
      ]
        .map((el) => el.textContent ?? '')
        .filter((t) =>
          /stale|not accepted|refused|reload and rebase|No block|No slide|was not applied|is outside a text/i.test(
            t,
          ),
        )
        .join(' | ') || null,
  );
const brief = (s) => ({
  revision: s.revision,
  serverRevision: s.serverRevision,
  seq: s.sync?.seq,
  pending: s.sync?.pending,
  retained: s.sync?.retained,
  connected: s.sync?.connected,
  offline: s.sync?.offline,
  streamDown: s.sync?.streamDown,
  role: s.access?.role ?? null,
});
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
    title: info.title,
    revision: s.revision,
    serverRevision: s.serverRevision,
    order: ids,
    slides,
  };
};

/** The wire with the bodies' shapes: the op, the path, the offset and the lengths, never the text beyond 24 characters. */
const wireOf = (page, name, sink) => {
  page.on('request', (request) => {
    if (!/\/api\/decks\/[^/?]+\/ops(\?|$)/.test(request.url()) || request.method() !== 'POST')
      return;
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
            ? {
                op: m.op,
                path: m.path,
                blockId: m.blockId,
                at: m.at,
                remove: m.remove,
                insert: String(m.insert).slice(0, 24),
                insertLength: String(m.insert).length,
              }
            : m.op === 'slide.set' || m.op === 'block.set' || m.op === 'deck.set'
              ? { op: m.op, path: m.path, valueLength: JSON.stringify(m.value ?? null).length }
              : { op: m.op, path: m.path ?? null },
        ),
      );
    } catch {
      // not json
    }
    const row = {
      who: name,
      at: rel(now()),
      base,
      opIds,
      mutations,
      status: null,
      ms: null,
      revision: null,
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
        if (row.status >= 400) row.body = (await response.text().catch(() => '')).slice(0, 240);
        else {
          const body = await response.json().catch(() => null);
          if (body) {
            row.admitted = body.entries?.map((e) => e.seq) ?? null;
            row.rejected = body.rejected?.length ?? null;
            row.between =
              body.between?.map((e) => ({
                seq: e.seq,
                mutations: (e.mutations ?? []).map((m) =>
                  m.op === 'text.splice'
                    ? `splice@${m.at}-${m.remove}+${String(m.insert).length}`
                    : m.op,
                ),
              })) ?? null;
          }
        }
      })
      .catch((error) => {
        row.status = `failed: ${String(error).slice(0, 80)}`;
        row.ms = rel(now()) - row.at;
      });
  });
  page.on('response', (response) => {
    if (!/\/api\/decks\/[^/?]+\/stream/.test(response.url())) return;
    sink.push({ who: name, at: rel(now()), stream: true, status: response.status() });
  });
  page.on('requestfailed', (request) => {
    if (!/\/api\/decks\//.test(request.url())) return;
    sink.push({
      who: name,
      at: rel(now()),
      failed: request.url().replace(BASE, '').replace(/\?.*$/, ''),
      reason: request.failure()?.errorText ?? null,
    });
  });
};

// ---------------------------------------------------------------------------------------------
// the report

const report = {
  probe: 'sync-ordering-probe',
  prefix: PREFIX,
  base: BASE,
  tierFlag: TIER,
  bounds: bound,
  phasesAsked: PHASES,
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
const wireSince = (at) => report.wire.filter((w) => w.at >= at && !w.stream && !w.failed);
const repairSplices = (rows) =>
  rows.filter((w) => (w.mutations ?? []).some((m) => m.op === 'text.splice' && (m.remove ?? 0) > 0))
    .length;

const browser = await chromium.launch({ headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders });
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
      !/upgrade-insecure-requests|ERR_INTERNET_DISCONNECTED/.test(m.text())
    )
      report.console.push({ who: name, at: rel(now()), [m.type()]: m.text().slice(0, 300) });
  });
  wireOf(page, name, report.wire);
};
attach('A', A);
let deckId = '';
let HEADING = 'heading/text';
let SLIDE = '';
let BLOCK_RUN = null;
const BLOCK_ID = 'ordering-block';

/**
 * A two person exchange on a run: `open` rounds with both sessions open (the wire read for 12 s
 * after each), `closed` rounds of type and Escape at once, an offline part; the audit's run 3 and
 * run 4 shapes. `readText` reads the committed value through the window API, `run` the stage run.
 */
async function exchange(label, run, readText, concurrentBound, offsetZero) {
  const out = {};
  const tag = label === 'title' ? 'p' : 'k';
  if (PHASES.includes(`${label}-open`)) {
    log(`${label}-open: both sessions open, two rounds`);
    const rounds = [];
    await openRun(A, run, offsetZero ? 'home' : 'end');
    await openRun(B, run, offsetZero ? 'home' : 'end');
    for (let k = 1; k <= 2; k += 1) {
      const ta = offsetZero ? `${tag}a${k}` : ` ${tag}a${k}`;
      const tb = offsetZero ? `${tag}b${k}` : ` ${tag}b${k}`;
      const from = rel(now());
      if (offsetZero) {
        await A.keyboard.press('Home');
        await B.keyboard.press('Home');
      }
      await Promise.all([
        typeHuman(A, ta),
        (async () => {
          await sleep(rand(0, 150));
          await typeHuman(B, tb);
        })(),
      ]);
      const typedAt = rel(now());
      const both = await pollUntil(
        async () => ({ a: await runText(A, run), b: await runText(B, run) }),
        (r) => r.a !== null && r.a === r.b && r.a.includes(ta) && r.a.includes(tb),
        concurrentBound,
        100,
      );
      const convergedMs = rel(now()) - typedAt;
      const samples = [];
      const until = now() + 12_000;
      while (now() < until) {
        const [a, b, sa, sb] = await Promise.all([
          runText(A, run),
          runText(B, run),
          state(A),
          state(B),
        ]);
        const row = {
          at: rel(now()),
          a,
          b,
          ra: sa.serverRevision,
          rb: sb.serverRevision,
          pa: sa.sync?.pending,
          pb: sb.sync?.pending,
        };
        const last = samples[samples.length - 1];
        if (
          !last ||
          last.a !== row.a ||
          last.b !== row.b ||
          last.ra !== row.ra ||
          last.rb !== row.rb
        )
          samples.push(row);
        await sleep(250);
      }
      const a = await runText(A, run);
      const b = await runText(B, run);
      const wire = wireSince(from);
      rounds.push({
        round: k,
        windowMs: typedAt - from,
        convergedWithinBound:
          both.a !== null && both.a === both.b && both.a.includes(ta) && both.a.includes(tb),
        convergedMs,
        a,
        b,
        equal: a === b,
        aHas: { own: countIn(a, ta), other: countIn(a, tb) },
        bHas: { own: countIn(b, tb), other: countIn(b, ta) },
        orderInA:
          a && a.includes(ta) && a.includes(tb)
            ? a.indexOf(ta) < a.indexOf(tb)
              ? 'a then b'
              : 'b then a'
            : null,
        orderInB:
          b && b.includes(ta) && b.includes(tb)
            ? b.indexOf(ta) < b.indexOf(tb)
              ? 'a then b'
              : 'b then a'
            : null,
        posts: wire.length,
        repairSplices: repairSplices(wire),
        wire,
        samples,
        stale: { a: await staleWords(A), b: await staleWords(B) },
      });
      log(
        `${label}-open round ${k}: a "${a?.slice(-40)}" b "${b?.slice(-40)}" equal ${a === b} in ${convergedMs} ms, posts ${wire.length}, repair splices ${repairSplices(wire)}`,
      );
    }
    await shot(A, `${label}-open-a`);
    await shot(B, `${label}-open-b`);
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
    await dismissPrompt(A);
    await dismissPrompt(B);
    await sleep(4000);
    const afterA = await readText(A);
    const afterB = await readText(B);
    out.open = {
      rounds,
      afterEscape: {
        a: afterA,
        b: afterB,
        equal: afterA === afterB,
        a2: brief(await state(A)),
        b2: brief(await state(B)),
      },
    };
    for (const r of rounds) {
      if (!r.equal || !r.convergedWithinBound)
        anomaly(`${label}-open-sessions-diverge`, {
          round: r.round,
          a: r.a,
          b: r.b,
          convergedMs: r.convergedMs,
          bound: concurrentBound,
        });
      if (r.aHas.other === 0 || r.bHas.other === 0)
        anomaly(`${label}-open-sessions-lost-other`, {
          round: r.round,
          aHas: r.aHas,
          bHas: r.bHas,
        });
      if (r.orderInA && r.orderInB && r.orderInA !== r.orderInB)
        anomaly(`${label}-open-order-differs`, {
          round: r.round,
          orderInA: r.orderInA,
          orderInB: r.orderInB,
        });
      if (r.repairSplices > 0)
        anomaly(`${label}-repair-splice`, { round: r.round, repairSplices: r.repairSplices });
    }
    for (let k = 1; k <= 2; k += 1)
      for (const t of [`${tag}a${k}`, `${tag}b${k}`])
        if (countIn(afterA, t) !== 1 || countIn(afterB, t) !== 1)
          anomaly(`${label}-lost-after-escape`, {
            token: t,
            inA: countIn(afterA, t),
            inB: countIn(afterB, t),
          });
  }
  if (PHASES.includes(`${label}-closed`)) {
    log(`${label}-closed: type then Escape at once, two rounds`);
    const rounds = [];
    for (let k = 1; k <= 2; k += 1) {
      const ta = ` q${tag}a${k}`;
      const tb = ` q${tag}b${k}`;
      const from = rel(now());
      await Promise.all([
        (async () => {
          await openRun(A, run);
          await typeHuman(A, ta);
          await A.keyboard.press('Escape');
        })(),
        (async () => {
          await sleep(rand(0, 150));
          await openRun(B, run);
          await typeHuman(B, tb);
          await B.keyboard.press('Escape');
        })(),
      ]);
      await dismissPrompt(A);
      await dismissPrompt(B);
      const typedAt = rel(now());
      const both = await pollUntil(
        async () => ({ a: await readText(A), b: await readText(B) }),
        (r) => r.a !== null && r.a === r.b && r.a.includes(ta) && r.a.includes(tb),
        15_000,
        200,
      );
      const wire = wireSince(from);
      const loser = wire.filter((w) => typeof w.ms === 'number').map((w) => w.ms);
      rounds.push({
        round: k,
        convergedMs: rel(now()) - typedAt,
        a: both.a,
        b: both.b,
        equal: both.a === both.b,
        aHas: { own: countIn(both.a, ta), other: countIn(both.a, tb) },
        bHas: { own: countIn(both.b, tb), other: countIn(both.b, ta) },
        posts: wire.length,
        postMs: stats(loser),
        wire,
        stale: { a: await staleWords(A), b: await staleWords(B) },
        a2: brief(await state(A)),
        b2: brief(await state(B)),
      });
      log(
        `${label}-closed round ${k}: ${JSON.stringify({ ...rounds[k - 1], wire: undefined }).slice(0, 400)}`,
      );
      await sleep(3000);
    }
    out.closed = { rounds };
    for (const r of rounds) {
      if (!r.equal) anomaly(`${label}-closed-sessions-diverge`, { round: r.round, a: r.a, b: r.b });
      if (r.aHas.other !== 1 || r.bHas.other !== 1 || r.aHas.own !== 1 || r.bHas.own !== 1)
        anomaly(`${label}-closed-lost-or-doubled`, { round: r.round, aHas: r.aHas, bHas: r.bHas });
    }
    await shot(A, `${label}-closed-a`);
    await shot(B, `${label}-closed-b`);
  }
  if (PHASES.includes(`${label}-offline`)) {
    log(`${label}-offline: A offline 20 s with its session closed`);
    const before = await readText(A);
    await openRun(B, run);
    const offlineAt = now();
    await ctxA.setOffline(true);
    const ob = [` o${tag}b1`, ` o${tag}b2`, ` o${tag}b3`];
    const oa = ` o${tag}a1`;
    const bTyping = (async () => {
      for (const t of ob) {
        await typeHuman(B, t);
        await sleep(2500);
      }
      await B.keyboard.press('Escape');
      await dismissPrompt(B);
    })();
    const aTyping = (async () => {
      await sleep(3000);
      await openRun(A, run);
      await typeHuman(A, oa);
      await A.keyboard.press('Escape');
      await dismissPrompt(A);
    })();
    await Promise.all([bTyping, aTyping]);
    const remaining = 20_000 - (now() - offlineAt);
    if (remaining > 0) await sleep(remaining);
    const aBeforeOnline = {
      ...brief(await state(A)),
      words: await saveWords(A),
      text: await readText(A),
    };
    const bBeforeOnline = { ...brief(await state(B)), text: await readText(B) };
    const firstAttempt = wireSince(rel(offlineAt)).find(
      (w) => w.who === 'A' && (w.mutations ?? []).some((m) => m.op === 'text.splice'),
    );
    await ctxA.setOffline(false);
    const onlineAt = now();
    const aSettled = await pollUntil(
      () => state(A),
      (s) => (s.sync?.pending ?? 0) === 0 && s.sync?.connected === true,
      45_000,
      100,
    );
    const aSettledMs = now() - onlineAt;
    const tokens = [...ob, oa];
    const converged = await pollUntil(
      async () => ({ a: await readText(A), b: await readText(B) }),
      (r) => r.a !== null && r.a === r.b && tokens.every((t) => countIn(r.a, t) === 1),
      bound.reconnect,
      200,
    );
    const convergedMs = now() - onlineAt;
    const admitted = wireSince(rel(onlineAt)).filter(
      (w) =>
        w.who === 'A' &&
        w.status === 200 &&
        (w.mutations ?? []).some((m) => m.op === 'text.splice'),
    );
    const firstAt = firstAttempt?.mutations.find((m) => m.op === 'text.splice')?.at ?? null;
    const resentAt =
      admitted[admitted.length - 1]?.mutations.find((m) => m.op === 'text.splice')?.at ?? null;
    out.offline = {
      before,
      aBeforeOnline,
      bBeforeOnline,
      aSettledMs,
      aSettled: brief(aSettled),
      convergedMs,
      convergedWithinBound:
        converged.a !== null &&
        converged.a === converged.b &&
        tokens.every((t) => countIn(converged.a, t) === 1),
      a: converged.a,
      b: converged.b,
      lostInA: tokens.filter((t) => countIn(converged.a, t) === 0),
      lostInB: tokens.filter((t) => countIn(converged.b, t) === 0),
      duplicatesInA: tokens.filter((t) => countIn(converged.a, t) > 1),
      duplicatesInB: tokens.filter((t) => countIn(converged.b, t) > 1),
      resend: {
        firstAt,
        resentAt,
        shifted: firstAt !== null && resentAt !== null ? resentAt > firstAt : null,
      },
      wire: wireSince(rel(offlineAt)),
      stale: { a: await staleWords(A), b: await staleWords(B) },
      a2: brief(await state(A)),
      b2: brief(await state(B)),
    };
    log(
      `${label}-offline: ${JSON.stringify({ ...out.offline, wire: undefined, aBeforeOnline: undefined, bBeforeOnline: undefined }).slice(0, 700)}`,
    );
    if (!out.offline.convergedWithinBound)
      anomaly(`${label}-offline-diverge-or-late`, {
        a: converged.a,
        b: converged.b,
        convergedMs,
        bound: bound.reconnect,
      });
    if (out.offline.lostInA.length || out.offline.lostInB.length)
      anomaly(`${label}-offline-lost`, {
        lostInA: out.offline.lostInA,
        lostInB: out.offline.lostInB,
      });
    if (out.offline.duplicatesInA.length || out.offline.duplicatesInB.length)
      anomaly(`${label}-offline-duplicate`, {
        a: out.offline.duplicatesInA,
        b: out.offline.duplicatesInB,
      });
    await shot(A, `${label}-offline-a`);
    await shot(B, `${label}-offline-b`);
  }
  return out;
}

try {
  log('create: A opens /new');
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  deckId = (await invoke(A, 'deck.info')).id;
  log(`deck ${deckId}`);
  const heads = await A.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run')),
  );
  HEADING = heads.find((r) => /heading/.test(r)) ?? heads[0];
  await openRun(A, HEADING);
  await typeHuman(A, 'Ordering probe');
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  const first = await connected(A);
  await waitRevision(A, 1);
  await dismissPrompt(A);
  const s0 = await settled(A);
  SLIDE = await firstSlide(A);
  report.tier = first.sync?.tier ?? null;
  if (report.tier !== TIER)
    report.tierNote = `the page reads tier ${report.tier}; the bounds are the --tier ${TIER} flag's`;
  report.phases.create = {
    deckId,
    tier: report.tier,
    ...brief(s0),
    clientId: s0.presence?.clientId ?? null,
  };
  log(`created: ${JSON.stringify(report.phases.create)}`);

  /* the viewer's setup: Anyone with the link, Viewer, before C opens (sync.viewer.live-updates);
     the answer's /s/ URL is what C exchanges (the module comment), held in memory alone */
  const access = await invoke(A, 'share.get', { id: deckId }).catch(() => null);
  let linkPath = null;
  const setAccess = access
    ? await invoke(A, 'share.setGeneralAccess', {
        id: deckId,
        mode: 'link',
        role: 'viewer',
        baseRevision: access.record?.revision ?? 0,
      }).then(
        (answer) => {
          linkPath = shareLinkPath(answer?.url);
          return 'set';
        },
        (e) => `failed: ${String(e).slice(0, 120)}`,
      )
    : 'share.get failed';
  report.phases.access = {
    generalAccess: setAccess,
    link:
      linkPath === null
        ? 'no /s/ URL in the answer: C opens the plain /edit/<id>'
        : 'the /s/ URL of the answer, exchanged by C as a navigation before /edit/<id> (the token is not recorded)',
  };

  ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders,
    storageState: await ctxA.storageState(),
  });
  B = await ctxB.newPage();
  attach('B', B);
  ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders });
  C = await ctxC.newPage();
  attach('C', C);
  log('join: B (the same person) and C (a stranger) open the deck');
  const joinC = async () => {
    if (linkPath !== null) {
      await C.goto(`${BASE}${linkPath}`, { waitUntil: 'domcontentloaded' });
      await C.waitForURL(/\/(deck|edit)\//, { timeout: 30_000 }).catch(() => undefined);
      report.phases.access.landed = pathForLedger(C.url(), deckId);
    }
    await C.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  };
  await Promise.all([B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }), joinC()]);
  await Promise.all([editorReady(B), editorReady(C)]);
  const [bFirst, cFirst] = await Promise.all([connected(B), connected(C)]);
  await dismissPrompt(B);
  await dismissPrompt(C);
  report.phases.join = {
    b: {
      ...brief(bFirst),
      clientId: bFirst.presence?.clientId ?? null,
      heading: await headingOf(B),
    },
    c: {
      ...brief(cFirst),
      clientId: cFirst.presence?.clientId ?? null,
      heading: await headingOf(C),
      editorStage: await C.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor') !== null,
      ),
    },
  };
  log(`joined: ${JSON.stringify(report.phases.join)}`);
  await shot(A, '00-a-created');
  await shot(B, '00-b-joined');
  await shot(C, '00-c-joined');

  // serial: EDITS words from A one per 3 s; the arrival order and the latency in B and in C
  if (PHASES.includes('serial')) {
    log(`serial: ${EDITS} edits from A, one per 3 s`);
    const tokens = [];
    const seenInB = new Map();
    const seenInC = new Map();
    const bSamples = [];
    let stop = false;
    const sampler = (async () => {
      let last = '';
      let tick = 0;
      while (!stop) {
        const t = now();
        tick += 1;
        const [bText, bs] = await Promise.all([
          runText(B, HEADING).catch(() => null),
          state(B).catch(() => null),
        ]);
        const cText = tick % 5 === 0 ? await headingOf(C).catch(() => null) : null;
        const key = `${bText}|${bs?.serverRevision}|${bs?.sync?.seq}`;
        if (key !== last) {
          bSamples.push({
            at: rel(t),
            revision: bs?.revision ?? null,
            serverRevision: bs?.serverRevision ?? null,
            seq: bs?.sync?.seq ?? null,
            text: bText,
          });
          last = key;
        }
        if (bText !== null)
          for (const token of tokens)
            if (!seenInB.has(token.text) && bText.includes(token.text))
              seenInB.set(token.text, rel(t));
        if (cText !== null)
          for (const token of tokens)
            if (!seenInC.has(token.text) && cText.includes(token.text))
              seenInC.set(token.text, rel(t));
        await sleep(Math.max(20, 100 - (now() - t)));
      }
    })();
    const from = rel(now());
    await openRun(A, HEADING);
    for (let i = 1; i <= EDITS; i += 1) {
      const started = now();
      const before = (await state(A)).revision;
      const text = ` a${String(i).padStart(2, '0')}`;
      await typeHuman(A, text);
      const typedAt = now();
      /* the token is registered for the samplers before the revision poll (the verifier's pass 1
         F13): the revision is the checkpoint's and moves seconds after the op reached B on the
         memory tier, so a token registered after the poll measured the poll's cadence (about
         2.2 s on every word) and not the word's arrival (191 ms mean on the same server) */
      const token = {
        text,
        i,
        typedAt: rel(typedAt),
        ackMs: null,
        revisionBefore: before,
        revision: before,
      };
      tokens.push(token);
      const revision = await waitRevision(A, before + 1, 10_000);
      token.ackMs = now() - typedAt;
      token.revision = revision;
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
    await pollUntil(
      () => Promise.resolve(seenInC.size),
      (n) => n >= tokens.length,
      bound.viewerWord,
      200,
    );
    await sleep(2000);
    stop = true;
    await sampler;
    const [aText, bText, cText] = await Promise.all([headingOf(A), headingOf(B), headingOf(C)]);
    const latencies = tokens.map((t) => ({
      token: t.text,
      typedAt: t.typedAt,
      ackMs: t.ackMs,
      revision: t.revision,
      latencyMs: seenInB.has(t.text) ? seenInB.get(t.text) - t.typedAt : null,
      viewerMs: seenInC.has(t.text) ? seenInC.get(t.text) - t.typedAt : null,
    }));
    const arrival = [...seenInB.entries()].sort((x, y) => x[1] - y[1]).map(([t]) => t);
    const expected = tokens.map((t) => t.text).filter((t) => seenInB.has(t));
    const inOrder = arrival.join('') === expected.join('');
    const lost = tokens.filter((t) => !seenInB.has(t.text)).map((t) => t.text);
    const duplicates = tokens
      .filter((t) => countIn(aText, t.text) > 1 || countIn(bText, t.text) > 1)
      .map((t) => t.text);
    const late = latencies.filter((l) => l.latencyMs === null || l.latencyMs > bound.serialWord);
    const viewerLate = latencies.filter(
      (l) => l.viewerMs === null || l.viewerMs > bound.viewerWord,
    );
    const posts = wireSince(from).filter((w) => w.who === 'A');
    const notNext = posts.filter(
      (w) =>
        w.status !== 200 || w.base === null || !(w.admitted ?? []).every((s) => s === w.base + 1),
    );
    report.phases.serial = {
      tokens: latencies,
      latency: stats(latencies.filter((l) => l.latencyMs !== null).map((l) => l.latencyMs)),
      viewerLatency: stats(latencies.filter((l) => l.viewerMs !== null).map((l) => l.viewerMs)),
      ack: stats(tokens.map((t) => t.ackMs)),
      postMs: stats(posts.filter((w) => typeof w.ms === 'number').map((w) => w.ms)),
      posts: posts.length,
      postsNotAtNextRevision: notNext.length,
      arrivalOrder: arrival,
      inOrder,
      lost,
      duplicates,
      lateInB: late.map((l) => ({ token: l.token, latencyMs: l.latencyMs })),
      lateInC: viewerLate.map((l) => ({ token: l.token, viewerMs: l.viewerMs })),
      aText,
      bText,
      cText,
      equalAB: aText === bText,
      equalAC: aText === cText,
      a: brief(await state(A)),
      b: brief(await state(B)),
      c: { ...brief(await state(C)), seenTokens: seenInC.size },
      bSamples,
      saveWords: { a: await saveWords(A), b: await saveWords(B) },
      stale: { a: await staleWords(A), b: await staleWords(B) },
    };
    log(
      `serial: latency ${JSON.stringify(report.phases.serial.latency)}, viewer ${JSON.stringify(report.phases.serial.viewerLatency)}, ack ${JSON.stringify(report.phases.serial.ack)}, inOrder ${inOrder}, lost ${lost.length}, late ${late.length}, C saw ${seenInC.size}`,
    );
    if (!inOrder) anomaly('reorder', { arrival });
    if (lost.length > 0) anomaly('lost-write', { lost, aText, bText });
    if (duplicates.length > 0) anomaly('duplicate', { duplicates });
    if (late.length > 0)
      anomaly('latency-over-bound', {
        bound: bound.serialWord,
        count: late.length,
        tokens: late.slice(0, 10),
      });
    if (aText !== bText) anomaly('divergence-after-serial', { aText, bText });
    if (viewerLate.length > 0)
      anomaly('viewer-stale', {
        bound: bound.viewerWord,
        count: viewerLate.length,
        cText,
        aText,
        c: report.phases.serial.c,
      });
    if (notNext.length > 0)
      anomaly('post-not-at-next-revision', { count: notNext.length, first: notNext.slice(0, 3) });
    await shot(A, '01-a-after-serial');
    await shot(B, '01-b-after-serial');
    await shot(C, '01-c-after-serial');
  }

  // the title slide's field (run 3)
  if (PHASES.some((p) => p.startsWith('title-'))) {
    report.phases.title = await exchange('title', HEADING, headingOf, bound.titleConcurrent, false);
    const ops = new Set(report.wire.flatMap((w) => (w.mutations ?? []).map((m) => m.op)));
    report.phases.title.travelledAs = ops.has('text.splice')
      ? 'text.splice'
      : ops.has('slide.set')
        ? 'slide.set'
        : [...ops].join(',');
  }

  // a body block, the text.splice path (run 4), placed by block.insert as the row's setup
  if (PHASES.some((p) => p.startsWith('block-'))) {
    log('block: a body block placed by block.insert');
    const s = await state(A);
    await invoke(A, 'block.insert', {
      baseRevision: s.revision,
      slideId: SLIDE,
      slot: 'main',
      block: { id: BLOCK_ID, type: 'text', text: 'end', pos: { x: 160, y: 520, w: 1280, h: 160 } },
    });
    await settled(A);
    await pollUntil(
      () =>
        B.evaluate(
          (id) =>
            document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`) !==
            null,
          BLOCK_ID,
        ),
      (v) => v === true,
      15_000,
    );
    BLOCK_RUN = await A.evaluate((id) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
      );
      const box = inner?.closest('.free') ?? inner;
      if (!box) return null;
      const own = box.matches('[data-run]') ? box.getAttribute('data-run') : null;
      return own ?? box.querySelector('[data-run]')?.getAttribute('data-run') ?? null;
    }, BLOCK_ID);
    report.phases.block = {
      run: BLOCK_RUN,
      ...(await exchange(
        'block',
        BLOCK_RUN,
        (p) => blockTextOf(p, SLIDE, BLOCK_ID),
        bound.blockConcurrent,
        true,
      )),
    };
  }

  // reload: A, B and C in parallel, the documents diffed
  if (PHASES.includes('reload')) {
    log('reload: A, B and C reload');
    await Promise.all([settled(A), settled(B)]);
    const live = Math.max((await state(A)).serverRevision, (await state(B)).serverRevision);
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
    const [docA, docB, docC] = await Promise.all([
      readDocument(A),
      readDocument(B),
      readDocument(C),
    ]);
    const canon = (d) => JSON.stringify({ title: d.title, order: d.order, slides: d.slides });
    report.phases.reload = {
      reloadMs: { a: msA, b: msB, c: msC },
      bound: bound.reload,
      withinBound: [msA, msB, msC].every((ms) => ms <= bound.reload),
      live,
      a: { ...docA, slides: undefined },
      b: { ...docB, slides: undefined },
      c: { ...docC, slides: undefined },
      sameAB: canon(docA) === canon(docB),
      sameAC: canon(docA) === canon(docC),
      sameRevision: docA.revision === docB.revision && docB.revision === docC.revision,
      atLive: docA.revision >= live,
    };
    writeFileSync(path.join(OUT, `${PREFIX}-reload-a.json`), JSON.stringify(docA, null, 2));
    writeFileSync(path.join(OUT, `${PREFIX}-reload-b.json`), JSON.stringify(docB, null, 2));
    writeFileSync(path.join(OUT, `${PREFIX}-reload-c.json`), JSON.stringify(docC, null, 2));
    log(`reload: ${JSON.stringify(report.phases.reload).slice(0, 600)}`);
    if (!report.phases.reload.sameAB || !report.phases.reload.sameAC)
      anomaly('reload-diverged', {
        a: report.phases.reload.a,
        b: report.phases.reload.b,
        c: report.phases.reload.c,
      });
    if (!report.phases.reload.sameRevision || !report.phases.reload.atLive)
      anomaly('reload-revision', { live, a: docA.revision, b: docB.revision, c: docC.revision });
    if (!report.phases.reload.withinBound)
      anomaly('reload-over-bound', {
        reloadMs: report.phases.reload.reloadMs,
        bound: bound.reload,
      });
    await shot(A, '04-a-reloaded');
    await shot(B, '04-b-reloaded');
    await shot(C, '04-c-reloaded');
  }
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
      await C?.close().catch(() => undefined);
      await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(A);
      await connected(A);
      await dismissPrompt(A);
      await A.keyboard.press('Escape');
      await A.locator('[data-control="menubar.file"]').click({ timeout: 8000 });
      await A.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await A.locator('[data-control="menu.file.moveToTrash"]').click({ timeout: 8000 });
      await A.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
      report.teardown.trashed = true;
      await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
        timeout: 30_000,
      });
      const card = A.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await A.locator(`[data-control="trash.delete.${deckId}"]`).click({ timeout: 8000 });
      await A.locator('[data-control="trash.confirm.ok"]').click({ timeout: 8000 });
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      report.teardown.deletedForever = true;
    } catch (error) {
      report.teardown.productPathError =
        error instanceof Error ? error.message.slice(0, 200) : String(error);
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
        .get(`${BASE}/edit/${deckId}`, { headers: extraHTTPHeaders, maxRedirects: 0 })
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
  const file = path.join(OUT, `${PREFIX}-ordering-run.json`);
  writeFileSync(file, JSON.stringify({ ...report, deckId }, null, 2));
  log(
    `written ${file}; anomalies ${report.anomalies.length}${report.error ? '; the run ended on an error' : ''}`,
  );
  process.exit(report.anomalies.length > 0 || report.error ? 1 : 0);
}

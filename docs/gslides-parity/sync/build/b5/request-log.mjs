// B5's hand written request log for the sync and costs round (docs/SYNC.md 6.1, the rows
// cost.show.calls, cost.editor-hidden.calls, cost.editor-idle.calls; 6.3: "with a hand written
// request log before" B4's cost probe lands). One process, one mode, against a dev server of this
// checkout (the memory tier, the tmp store), recording every request the page makes with its
// route and summing them per route per minute over the window, in the shape of
// docs/gslides-parity/sync/audit-costs/measure.mjs. Imports nothing but playwright-core. Runs only
// while the caller holds .turboslide/e2e.lock.
//
//   node request-log.mjs --base http://localhost:4415 --mode show|idle|hidden|agent [--minutes 3] --out <dir>
//
// show    /deck/gt-brand?present=1 left alone for the window: the row wants no function request
// idle    /edit/<scratch> visible and alone for the window
// hidden  /edit/<scratch> behind a second tab for the window; the session list is read at 15 s
// agent   the attach rule and the drive: no session on /deck, /present and /embed without
//         agent=1, a session with it, deck_goto_slide over /mcp reaches the page, a hidden tab
//         detaches after 10 s and the drive is refused, a shown tab re-attaches; the hidden half
//         needs --headed 1 (a covered headless tab reads visible)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? '1'] : []))
    .filter((x) => x.length),
);
const BASE = (args.base ?? 'http://localhost:4415').replace(/\/$/, '');
const MODE = args.mode ?? 'show';
const MINUTES = Number(args.minutes ?? 3);
const OUT = args.out ?? '.';
const HEADED = args.headed === '1' || args.headed === 'true';
const SEED = 'gt-brand';
const VIEWPORT = { width: 1440, height: 900 };
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), MODE, ...a);
const host = new URL(BASE).host;

// ------------------------------------------------------------------------------------------------
// the network log

/** The route of a request, and whether it is a function request on a deployment. */
function routeOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { route: 'other', fn: false };
  }
  if (u.host !== host) return { route: `third party ${u.host}`, fn: false };
  const p = u.pathname;
  let m;
  if ((m = /^\/api\/decks\/[^/]+\/(stream|ops|presence)$/.exec(p)))
    return { route: `/api/decks/<id>/${m[1]}`, fn: true };
  if (p.startsWith('/_serverFn/')) return { route: `/_serverFn/${p.slice(11, 19)}…`, fn: true };
  if (p.startsWith('/api/render/')) return { route: '/api/render/<slide>', fn: true };
  if (p.startsWith('/api/x/csp/')) return { route: '/api/x/csp/report', fn: true };
  if (p.startsWith('/api/')) return { route: p.replace(/[a-z0-9]{8,}/g, '<x>'), fn: true };
  if (/^\/(edit|deck|present|embed|print)\/[^/]+/.test(p))
    return { route: `/${p.split('/')[1]}/<id> (document)`, fn: true };
  if (p === '/new' || p === '/decks' || p === '/home' || p === '/decks/trash')
    return { route: `${p} (document)`, fn: true };
  if (/^\/decks\/[^/]+\/assets\//.test(p))
    return { route: '/decks/<id>/assets/* (twins)', fn: false };
  if (p.startsWith('/fonts/')) return { route: '/fonts/* (static)', fn: false };
  if (
    p.startsWith('/@') ||
    p.startsWith('/node_modules/') ||
    p.startsWith('/src/') ||
    p.startsWith('/packages/') ||
    p.startsWith('/apps/') ||
    /\.(ts|tsx|mjs|js|css|map|woff2?)$/.test(p)
  )
    return { route: 'dev modules and assets (static on a deployment)', fn: false };
  if (p.startsWith('/icons/') || p.startsWith('/brand/') || p.startsWith('/home/'))
    return { route: `${p.split('/')[1]}/* (static)`, fn: false };
  return { route: p, fn: false };
}

function attachLog(page, records, tag) {
  page.on('request', (request) => {
    const { route, fn } = routeOf(request.url());
    records.push({
      t: Date.now(),
      tag,
      url: request.url().replace(/\?.*$/, (q) => (q.length > 80 ? `${q.slice(0, 80)}…` : q)),
      method: request.method(),
      type: request.resourceType(),
      route,
      fn,
      status: null,
      _req: request,
    });
  });
  page.on('response', (response) => {
    const row = records.find((r) => r._req === response.request());
    if (row) row.status = response.status();
  });
  page.on('requestfailed', (request) => {
    const row = records.find((r) => r._req === request);
    if (row) row.failed = request.failure()?.errorText ?? 'failed';
  });
}

function summarize(records, t0, t1) {
  const minutes = Math.max(1 / 60, (t1 - t0) / 60_000);
  const inWindow = records.filter((r) => r.t >= t0 && r.t < t1);
  const byRoute = {};
  for (const r of inWindow) {
    byRoute[r.route] ??= { requests: 0, fn: r.fn, statuses: {}, methods: {} };
    const b = byRoute[r.route];
    b.requests += 1;
    const s = r.status ?? (r.failed ? 'failed' : 'pending');
    b.statuses[s] = (b.statuses[s] ?? 0) + 1;
    b.methods[r.method] = (b.methods[r.method] ?? 0) + 1;
  }
  const rows = Object.entries(byRoute)
    .map(([route, b]) => ({ route, ...b, perMinute: Number((b.requests / minutes).toFixed(2)) }))
    .sort((a, b) => b.requests - a.requests);
  const fnRequests = inWindow.filter((r) => r.fn).length;
  const polls = inWindow.filter((r) => r.fn && /_serverFn/.test(r.route) && r.pollGuess).length;
  return {
    windowMs: t1 - t0,
    minutes: Number(minutes.toFixed(2)),
    requests: inWindow.length,
    functionRequests: fnRequests,
    functionRequestsPerMinute: Number((fnRequests / minutes).toFixed(2)),
    polls,
    rows,
  };
}

/**
 * Which server function a /_serverFn/ request is. The dev server names the export in the URL's
 * base64url segment (`{"file":"/src/server/sessions.ts...","export":"pollFn_..."}`); a deployment
 * names it by a hash, so the body is read as the fallback: the poll's carries `timeoutMs`, the
 * attach's `owner` and `deckId`, the answer's `commandId`, the detach's one 36 character `id`.
 */
function serverFnOf(url, data) {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (m) {
    try {
      const named = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      const exp = String(named.export ?? '');
      if (/^pollFn/.test(exp)) return 'pollStudioSession';
      if (/^attachFn/.test(exp)) return 'attachStudioSession';
      if (/^answerFn/.test(exp)) return 'answerStudioSession';
      if (/^detachFn/.test(exp)) return 'detachStudioSession';
      if (exp) return exp.replace(/_.*$/, '');
    } catch {
      // a deployment's hashed id: read the body
    }
  }
  if (/timeoutMs/.test(data)) return 'pollStudioSession';
  if (/owner/.test(data) && /deckId/.test(data) && /actions/.test(data))
    return 'attachStudioSession';
  if (/commandId/.test(data)) return 'answerStudioSession';
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(data) &&
    data.length < 200
  )
    return 'detachStudioSession';
  return 'other';
}

function markPolls(records) {
  for (const r of records) {
    if (!/_serverFn/.test(r.url)) continue;
    let data = '';
    try {
      data = r._req?.postData() ?? '';
    } catch {
      data = '';
    }
    r.serverFn = serverFnOf(r.url, data);
    r.pollGuess = r.serverFn === 'pollStudioSession';
  }
}

/** The function requests of a window with their offsets, so the cadence can be read from the file. */
function functionRequestsIn(records, t0, t1) {
  return records
    .filter((r) => r.t >= t0 && r.t < t1 && r.fn)
    .map((r) => ({ at: r.t - t0, route: r.route, serverFn: r.serverFn ?? null, status: r.status }));
}

// ------------------------------------------------------------------------------------------------
// the product

const studioReady = (page) =>
  page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
const settled = (page) => page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);

/**
 * The deck's sessions in the agent manifest, matched by owner and attach time when given: a page
 * Playwright closes cannot land its detach (the fetch dies with the page, as before this round),
 * so a session of an earlier step lingers until the 45 s sweep and must not be counted.
 */
let sampleSession = null;
async function sessionsOf(deckId, match = {}) {
  const res = await fetch(`${BASE}/api/agent?deck=${encodeURIComponent(deckId)}`);
  const manifest = await res.json();
  const rows = (manifest.sessions ?? []).filter((s) => s.deckId === deckId);
  if (rows[0] && !sampleSession) sampleSession = { ...rows[0], id: '<uuid>' };
  return rows.filter(
    (s) =>
      (match.owner === undefined || s.owner === match.owner) &&
      (match.since === undefined || Date.parse(s.lastSeenAt ?? 0) >= match.since - 500),
  );
}

/**
 * The browser's own hide is not reproducible under Playwright (a covered tab, a popup, a
 * minimized window and a tab created in the same window over CDP all read `visible`, headed and
 * headless, 2026-09-21): the page is kept visible by the driver. `--synthetic-hide 1` then drives
 * the product's own path instead, the way the browser would: the `visibilityState` getter answers
 * `hidden` and a `visibilitychange` event fires; the timers and the network stay real. A run that
 * used it says so in its file and is never the row's pass (SYNC.md 6.1: "not driven with the
 * reason when visibilityState does not read hidden").
 */
const SYNTHETIC = args['synthetic-hide'] === '1' || args['synthetic-hide'] === 'true';
async function hide(page, cover) {
  await cover.bringToFront();
  await sleep(500);
  let visibility = await page.evaluate(() => document.visibilityState);
  if (visibility === 'hidden') return { visibility, method: 'browser' };
  if (!SYNTHETIC) return { visibility, method: 'none' };
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  visibility = await page.evaluate(() => document.visibilityState);
  return { visibility, method: 'synthetic' };
}
async function show(page, method) {
  if (method === 'synthetic') {
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  await page.bringToFront();
}

/**
 * The drive is `deck_goto_slide` over MCP (`view.goto` runs on the window and mcp transports
 * only, schema/actions.ts): one MCP session bound to the deck at initialize, which lists the tool
 * while a studio page is attached (routes/mcp.ts). The SDK is the CLI's dependency.
 */
async function mcpClient(deckId) {
  const cli = new URL(
    '../../../../../apps/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/',
    import.meta.url,
  );
  const { Client } = await import(new URL('client/index.js', cli).href);
  const { StreamableHTTPClientTransport } = await import(
    new URL('client/streamableHttp.js', cli).href
  );
  const url = new URL(`/mcp?deck=${encodeURIComponent(deckId)}&author=agent:b5-request-log`, BASE);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: 'b5-request-log', version: '0.0.0' });
  await client.connect(transport);
  return { client, transport };
}

async function gotoOverMcp(client, slideId) {
  const t = Date.now();
  try {
    const result = await client.callTool({ name: 'deck_goto_slide', arguments: { slideId } });
    const text = (result.content ?? []).map((c) => c.text ?? '').join(' ');
    return {
      ok: !result.isError,
      ms: Date.now() - t,
      slideId: result.structuredContent?.slideId ?? null,
      text: text.slice(0, 200),
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - t, error: String(error?.message ?? error).slice(0, 300) };
  }
}

async function freshDeck(page) {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await studioReady(page);
  await settled(page);
  const s = await state(page);
  log('scratch deck', s.deckId, 'revision', s.revision);
  return s.deckId;
}

// ------------------------------------------------------------------------------------------------
// the modes

async function measureWindow(page, records, label) {
  const t0 = Date.now();
  log(`${label}: window open, ${MINUTES} min`);
  const samples = [];
  const end = t0 + MINUTES * 60_000;
  while (Date.now() < end) {
    await sleep(Math.min(15_000, end - Date.now()));
    const fnSoFar = records.filter((r) => r.t >= t0 && r.fn).length;
    samples.push({ at: Date.now() - t0, functionRequests: fnSoFar });
    log(`${label}: +${Math.round((Date.now() - t0) / 1000)} s, ${fnSoFar} function requests`);
  }
  const t1 = Date.now();
  markPolls(records);
  return {
    t0,
    t1,
    samples,
    summary: summarize(records, t0, t1),
    functionRequests: functionRequestsIn(records, t0, t1),
  };
}

async function modeShow(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const records = [];
  attachLog(page, records, 'show');
  await page.goto(`${BASE}/deck/${SEED}?present=1`, { waitUntil: 'domcontentloaded' });
  await studioReady(page);
  await page.waitForSelector('.pt-viewer.is-present', { timeout: 30_000 }).catch(() => undefined);
  await sleep(5_000);
  const present = await page.evaluate(() =>
    Boolean(document.querySelector('.pt-viewer.is-present')),
  );
  const win = await measureWindow(page, records, 'show');
  const sessions = await sessionsOf(SEED);
  await page.screenshot({ path: join(OUT, 'show-end.png') });
  await context.close();
  return {
    row: 'cost.show.calls',
    ceiling: { functionRequestsPerMinute: 0 },
    present,
    sessionsAtEnd: sessions.length,
    ...win,
    pass: win.summary.functionRequests === 0 && sessions.length === 0,
  };
}

async function modeIdle(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const records = [];
  attachLog(page, records, 'idle');
  const deckId = await freshDeck(page);
  await sleep(5_000);
  const win = await measureWindow(page, records, 'idle');
  const sessions = await sessionsOf(deckId);
  const visibility = await page.evaluate(() => document.visibilityState);
  await page.screenshot({ path: join(OUT, 'idle-end.png') });
  await context.close();
  const polls = records.filter(
    (r) => r.t >= win.t0 && r.t < win.t1 && r.serverFn === 'pollStudioSession',
  ).length;
  return {
    row: 'cost.editor-idle.calls',
    ceiling: { functionRequestsPerMinute: 12 },
    deckId,
    visibility,
    sessionsAtEnd: sessions.length,
    pollsInWindow: polls,
    pollsPerMinute: Number((polls / win.summary.minutes).toFixed(2)),
    ...win,
    pass: win.summary.functionRequestsPerMinute <= 12,
  };
}

async function modeHidden(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const records = [];
  attachLog(page, records, 'hidden');
  const tOpen = Date.now();
  const deckId = await freshDeck(page);
  await sleep(5_000);
  const before = await sessionsOf(deckId, { owner: 'editor', since: tOpen });
  const cover = await context.newPage();
  await cover.goto('about:blank');
  const hidden = await hide(page, cover);
  log(
    'editor tab visibilityState after the cover came to the front:',
    hidden.visibility,
    'by',
    hidden.method,
  );
  if (hidden.visibility !== 'hidden') {
    await context.close();
    return {
      row: 'cost.editor-hidden.calls',
      ceiling: { functionRequestsPerMinute: 8, polls: 0 },
      deckId,
      driven: false,
      reason: `document.visibilityState read ${hidden.visibility} with a second page in front (SYNC.md 6.1: not driven with the reason); --synthetic-hide 1 drives the product's path`,
    };
  }
  const t0 = Date.now();
  await sleep(15_000);
  const at15 = await sessionsOf(deckId, { owner: 'editor', since: tOpen });
  log(`sessions on the deck: ${before.length} before the hide, ${at15.length} at 15 s hidden`);
  const samples = [];
  const end = t0 + MINUTES * 60_000;
  while (Date.now() < end) {
    await sleep(Math.min(15_000, end - Date.now()));
    const fnSoFar = records.filter((r) => r.t >= t0 && r.fn).length;
    samples.push({ at: Date.now() - t0, functionRequests: fnSoFar });
    log(`hidden: +${Math.round((Date.now() - t0) / 1000)} s, ${fnSoFar} function requests`);
  }
  const t1 = Date.now();
  markPolls(records);
  const summary = summarize(records, t0, t1);
  const polls = records.filter(
    (r) => r.t >= t0 && r.t < t1 && r.serverFn === 'pollStudioSession',
  ).length;
  const detaches = records.filter((r) => r.t >= t0 && r.serverFn === 'detachStudioSession');
  const atEnd = await sessionsOf(deckId, { owner: 'editor', since: tOpen });
  await show(page, hidden.method);
  await sleep(3_000);
  const afterShow = await sessionsOf(deckId, { owner: 'editor', since: tOpen });
  markPolls(records);
  const reattach = records.filter((r) => r.t >= t1 && r.serverFn === 'attachStudioSession').length;
  await page.screenshot({ path: join(OUT, 'hidden-end.png') });
  await context.close();
  const counted = summary.functionRequestsPerMinute <= 8 && polls === 0;
  return {
    row: 'cost.editor-hidden.calls',
    ceiling: { functionRequestsPerMinute: 8, polls: 0 },
    deckId,
    hide: hidden,
    driven: hidden.method === 'browser',
    reason:
      hidden.method === 'browser'
        ? undefined
        : "the browser's own hide is not reproducible under Playwright (every covered tab reads visible); the counts below come from a synthetic visibilitychange and are evidence of the product's path, not the row's pass",
    sessions: {
      beforeHide: before.length,
      at15sHidden: at15.length,
      atEnd: atEnd.length,
      afterShow: afterShow.length,
    },
    detachAtMs: detaches.length ? detaches[0].t - t0 : null,
    reattachesAfterShow: reattach,
    pollsInWindow: polls,
    t0,
    t1,
    samples,
    summary,
    functionRequests: functionRequestsIn(records, t0, t1),
    sampleSession,
    underCeiling: counted,
    pass: hidden.method === 'browser' ? counted : null,
  };
}

async function modeAgent(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const out = { row: 'the attach rule and the drive (SYNC.md 3.10, open question 3)', steps: [] };
  const step = (name, facts) => {
    out.steps.push({ name, ...facts });
    log(name, JSON.stringify(facts));
  };
  /* 1. the four addresses without the flag attach nothing */
  for (const path of [
    `/deck/${SEED}`,
    `/deck/${SEED}?present=1`,
    `/present/${SEED}`,
    `/embed/${SEED}`,
  ]) {
    const tStep = Date.now();
    const page = await context.newPage();
    const records = [];
    attachLog(page, records, path);
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await studioReady(page);
    await sleep(6_000);
    markPolls(records);
    const sessions = await sessionsOf(SEED, { since: tStep });
    const attaches = records.filter((r) => r.serverFn === 'attachStudioSession').length;
    const polls = records.filter((r) => r.serverFn === 'pollStudioSession').length;
    step(`no session without agent=1: ${path}`, {
      sessions: sessions.length,
      attaches,
      polls,
      pass: sessions.length === 0 && attaches === 0 && polls === 0,
    });
    await page.close();
  }
  /* 2. /present and /embed with the flag attach as presenter and viewer */
  for (const [path, owner] of [
    [`/present/${SEED}?agent=1`, 'presenter'],
    [`/embed/${SEED}?agent=1`, 'viewer'],
  ]) {
    const tStep = Date.now();
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await studioReady(page);
    let sessions = [];
    for (let i = 0; i < 20 && sessions.length === 0; i += 1) {
      await sleep(250);
      sessions = await sessionsOf(SEED, { owner, since: tStep });
    }
    step(`a session with agent=1: ${path}`, {
      sessions: sessions.length,
      owner: sessions[0]?.owner ?? null,
      pass: sessions.length === 1 && sessions[0]?.owner === owner,
    });
    await page.close();
  }
  /* the sessions of the closed pages linger until the registry's 45 s sweep (their detach died
     with the page); the deck must be clean before the drive, else `attached()` picks a dead page */
  const tSweep = Date.now();
  while ((await sessionsOf(SEED)).length > 0 && Date.now() - tSweep < 60_000) await sleep(1_000);
  step('the closed pages are swept before the drive', {
    waitedMs: Date.now() - tSweep,
    left: (await sessionsOf(SEED)).length,
    pass: (await sessionsOf(SEED)).length === 0,
  });
  /* 3. /deck?agent=1: the session, the drive over MCP, the quick pace, the hidden detach */
  const path = `/deck/${SEED}?agent=1`;
  const tDeck = Date.now();
  const page = await context.newPage();
  const records = [];
  attachLog(page, records, 'deck agent');
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await studioReady(page);
  let sessions = [];
  const tAttach = Date.now();
  for (let i = 0; i < 40 && sessions.length === 0; i += 1) {
    await sleep(250);
    sessions = await sessionsOf(SEED, { owner: 'viewer', since: tDeck });
  }
  step('a session with agent=1: /deck', {
    sessions: sessions.length,
    owner: sessions[0]?.owner ?? null,
    withinMs: Date.now() - tAttach,
    pass: sessions.length === 1 && sessions[0]?.owner === 'viewer',
  });
  const mcp = await mcpClient(SEED);
  const { tools } = await mcp.client.listTools();
  step('deck_goto_slide is listed while the page is attached', {
    listed: tools.some((t) => t.name === 'deck_goto_slide'),
    pass: tools.some((t) => t.name === 'deck_goto_slide'),
  });
  const first = await gotoOverMcp(mcp.client, 'thesis');
  const active1 = await page.evaluate(() =>
    document.querySelector('.pt-viewer')?.getAttribute('data-active'),
  );
  step('deck_goto_slide reaches the page (the idle pace: up to one 20 s pause)', {
    ...first,
    active: active1,
    pass: first.ok && active1 === 'thesis' && first.ms < 25_000,
  });
  const second = await gotoOverMcp(mcp.client, 'why');
  const active2 = await page.evaluate(() =>
    document.querySelector('.pt-viewer')?.getAttribute('data-active'),
  );
  step('a second deck_goto_slide inside the quick window', {
    ...second,
    active: active2,
    pass: second.ok && active2 === 'why' && second.ms < 3_000,
  });
  /* hidden: detached after 10 s, the drive answers 404 */
  const cover = await context.newPage();
  await cover.goto('about:blank');
  const hidden = await hide(page, cover);
  const visibility = hidden.visibility;
  out.hide = hidden;
  if (visibility === 'hidden') {
    const tHide = Date.now();
    await sleep(8_000);
    const at8 = await sessionsOf(SEED, { owner: 'viewer', since: tDeck });
    await sleep(4_500);
    const at12 = await sessionsOf(SEED, { owner: 'viewer', since: tDeck });
    markPolls(records);
    const detach = records.find((r) => r.t >= tHide && r.serverFn === 'detachStudioSession');
    const refused = await gotoOverMcp(mcp.client, 'title');
    step('hidden: the session stays at 8 s, is gone by 12 s, and the drive is refused at once', {
      at8s: at8.length,
      at12s: at12.length,
      detachAtMs: detach ? detach.t - tHide : null,
      refused: { ok: refused.ok, ms: refused.ms, text: refused.text ?? refused.error ?? null },
      pass: at8.length === 1 && at12.length === 0 && !refused.ok && refused.ms < 2_000,
    });
    const pollsHidden = records.filter(
      (r) => r.t >= tHide && r.serverFn === 'pollStudioSession',
    ).length;
    step('hidden: no poll left the tab', { polls: pollsHidden, pass: pollsHidden === 0 });
    await show(page, hidden.method);
    let back = [];
    const tShow = Date.now();
    for (let i = 0; i < 40 && back.length === 0; i += 1) {
      await sleep(250);
      back = await sessionsOf(SEED, { owner: 'viewer', since: tDeck });
    }
    step('shown again: the same session id is back', {
      sessions: back.length,
      sameId: back[0]?.id === sessions[0]?.id,
      withinMs: Date.now() - tShow,
      pass: back.length === 1 && back[0]?.id === sessions[0]?.id,
    });
    const third = await gotoOverMcp(mcp.client, 'title');
    const active3 = await page.evaluate(() =>
      document.querySelector('.pt-viewer')?.getAttribute('data-active'),
    );
    step('shown again: the drive reaches the page', {
      ...third,
      active: active3,
      pass: third.ok && active3 === 'title',
    });
  } else {
    step('hidden half not driven', {
      reason: `document.visibilityState read ${visibility} with a second page in front; --synthetic-hide 1 drives the product's path`,
      pass: false,
    });
  }
  await mcp.client.close().catch(() => undefined);
  await context.close();
  out.sampleSession = sampleSession;
  out.hiddenHalfSynthetic = out.hide?.method === 'synthetic';
  out.pass = out.steps.every((s) => s.pass !== false);
  return out;
}

// ------------------------------------------------------------------------------------------------

const browser = await chromium.launch({ headless: !HEADED });
try {
  const result =
    MODE === 'show'
      ? await modeShow(browser)
      : MODE === 'idle'
        ? await modeIdle(browser)
        : MODE === 'hidden'
          ? await modeHidden(browser)
          : await modeAgent(browser);
  const file = join(OUT, `${MODE}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      { base: BASE, mode: MODE, at: new Date().toISOString(), headed: HEADED, ...result },
      null,
      2,
    ),
  );
  log('wrote', file, 'pass', result.pass);
  process.exitCode = result.pass === false ? 1 : 0;
} finally {
  await browser.close();
}

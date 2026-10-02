// The verifier drive of the realtime round and its Cloudflare phase (docs/REALTIME.md 5.1 R5, 5.4;
// docs/CLOUDFLARE.md 5.1, the verifier's hand rows on the `do` tier), moved here from
// docs/gslides-parity/realtime/verify/verify.mjs and generalised from
// docs/gslides-parity/realtime/people-drive/drive.mjs: two anonymous browsers on one scratch deck,
// A on one origin and B on another when two are given (the two process run of CLOUDFLARE.md 5.4
// over one tmp overlay with one Worker between them, or two instances of a deployment), both on
// slide 1, reading what each sees of the other at every step of REALTIME.md section 2 with a
// timestamp per step, a picture per step and the facts in one JSON, then the deck removed by its
// id. The drive judges nothing: it records what happened and the verifier reads the pictures and
// the numbers against the rows' bounds; a step that could not be driven is recorded with its reason.
//
//   node docs/gslides-parity/cloudflare/verify/verify.mjs --base <originA> [--base-b <originB>]
//     [--room-host <host>] [--out <dir>] [--headed] [--type-delay 70]
//
// The do run (CLOUDFLARE.md section 2): `sync.status` is read on both origins for the instance, the
// tier and the object's colo (`colo`, R1's field, "unnamed" until it lands); the Worker named by
// `--room-host` or TURBOSLIDE_ROOM_HOST answers `GET /health` once before the drive (the setup row
// `setup.worker.health`'s facts: the status, the time, `realtime`, `commit`, `appOrigin`) and, when
// TURBOSLIDE_ROOM_BEARER is in the environment (a wrapper sets it; nothing here prints it),
// `GET /rooms/<id>/counters` and `GET /db/counters` before and after the drive, so the object's
// request units, rows written and the D1 rows the whole drive cost are in the facts (the cost rows
// of 2.2 read the same counters over an editor hour); a step `two instances` types five words from
// each browser into two blocks through the two origins and records the two slide documents, the
// revisions, `sync.seq`, `sync.covered` and `sync.colo` of both tabs (the setup row
// `setup.do.two-instances`'s facts; `covered` and `colo` are R2's fields, recorded as absent until
// they land). The page's own requests to the room host (the socket opens, the HTTP belt) are
// counted per page beside the presence, ops and stream requests.
//
// The bearer for a deployment's teardown reaches this process as TURBOSLIDE_BEARER or
// TURBOSLIDE_TOKEN, set by a wrapper that reads ~/.config/turboslide/hosts.json (nothing here
// prints it); the OIDC token of a preview as VERCEL_OIDC_TOKEN, sent as
// x-vercel-trusted-oidc-idp-token. On a localhost base the agent surface is open and the teardown
// goes through A's window API when no bearer is set. Playwright is the worktree's playwright-core,
// resolved from the repository's package.json the way the probes resolve it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE_A = (arg('base', process.env.PLAYWRIGHT_BASE_URL) ?? '').replace(/\/$/, '');
const BASE_B = (arg('base-b', BASE_A) ?? BASE_A).replace(/\/$/, '');
if (!BASE_A) {
  console.error(
    'usage: node docs/gslides-parity/cloudflare/verify/verify.mjs --base <originA> [--base-b <originB>] [--room-host <host>] [--out <dir>] [--headed] [--type-delay 70]',
  );
  process.exit(2);
}
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  arg('out', join(HERE, `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)),
);
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = Number(arg('type-delay', '70'));
const HEADED = argv.includes('--headed');
const LOCAL = (b) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(b);
const TOKEN = process.env.TURBOSLIDE_BEARER ?? process.env.TURBOSLIDE_TOKEN ?? '';
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
/* the do tier's Worker (docs/CLOUDFLARE.md 2.3): the host from the flag or the environment, http on a
   checkout, the room bearer from the environment alone and never printed */
const ROOM_HOST = arg('room-host', process.env.TURBOSLIDE_ROOM_HOST ?? null) ?? null;
const ROOM_INSECURE =
  process.env.TURBOSLIDE_ROOM_INSECURE === '1' ||
  /^(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(ROOM_HOST ?? '');
const ROOM_BEARER = process.env.TURBOSLIDE_ROOM_BEARER ?? '';

const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  twoOrigins: BASE_A !== BASE_B,
  roomHost: ROOM_HOST,
  roomBearer: ROOM_BEARER === '' ? 'none' : 'TURBOSLIDE_ROOM_BEARER',
  out: OUT,
  steps: [],
};
const t0 = performance.now();
const ms = (from) => Math.round(performance.now() - from);
const sinceStart = () => Math.round(performance.now() - t0);
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
/** One step's record: its name, when it started and ended since the drive began, what was read. */
const step = (name, record) => {
  const row = { name, at: sinceStart(), ...record };
  facts.steps.push(row);
  console.log(
    `step ${facts.steps.length} ${name} (${row.at} ms): ${JSON.stringify(record).slice(0, 400)}`,
  );
  return row;
};
const sleep = (n) => new Promise((r) => setTimeout(r, n));

async function post(base, action, deckId, body) {
  const headers = { 'content-type': 'application/json', ...extraHTTPHeaders };
  if (TOKEN !== '') headers.authorization = `Bearer ${TOKEN}`;
  const response = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers,
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

/** One GET on the Worker (`/health` without a bearer, the counters under the room bearer); the body, the status and the time, or the reason. */
async function readWorker(path, { bearer = false } = {}) {
  if (ROOM_HOST === null)
    return { where: 'no-host', reason: 'no room host (--room-host or TURBOSLIDE_ROOM_HOST)' };
  if (bearer && ROOM_BEARER === '')
    return {
      where: 'no-bearer',
      reason: 'no room bearer (TURBOSLIDE_ROOM_BEARER in the environment)',
    };
  const url = `${ROOM_INSECURE ? 'http' : 'https'}://${ROOM_HOST}${path}`;
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: bearer ? { authorization: `Bearer ${ROOM_BEARER}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { text: text.slice(0, 200) };
    }
    return {
      where: response.status === 200 ? 'present' : 'refused',
      status: response.status,
      ms: ms(started),
      body: json,
    };
  } catch (error) {
    return {
      where: 'unreachable',
      ms: ms(started),
      reason: String(error?.message ?? error).slice(0, 160),
    };
  }
}
/** The counters of the deck's object and of the D1 routes, in one read. */
const readCounters = async (deckId) => ({
  at: sinceStart(),
  room: await readWorker(`/rooms/${encodeURIComponent(deckId)}/counters`, { bearer: true }),
  db: await readWorker('/db/counters', { bearer: true }),
});

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 90_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
}
async function poll(fn, timeout = 30_000, every = 50) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return null;
}
async function connected(page) {
  return poll(async () => ((await state(page)).sync?.connected ? true : null), 45_000, 150);
}
async function dismissPrompt(page) {
  for (const id of ['dialog.namePrompt.close', 'dialog.namePrompt.skip', 'sync.persisted.apply']) {
    const el = ctl(page, id);
    if (await el.isVisible().catch(() => false))
      await el.click({ timeout: 2000 }).catch(() => undefined);
  }
}
/** The runs of the shown slide: data-run keys with their text, prompts removed. */
const runsOf = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[data-prompt]').forEach((x) => x.remove());
      return {
        run: el.getAttribute('data-run') ?? '',
        text: (clone.textContent ?? '').replace(/ /g, ' '),
      };
    }),
  );
const runText = async (page, run) => (await runsOf(page)).find((r) => r.run === run)?.text ?? null;
const runEl = (page, run) =>
  page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
/** The remote presence drawings of a page for one client (the hooks of build/r2.md and build/r3.md). */
const drawingsOf = (page, clientId) =>
  page.evaluate((id) => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
    };
    const caret = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
    const drag = document.querySelector(`.ts-remote-drag[data-client="${id}"]`);
    const pointer = document.querySelector(`.ts-remote-pointer-group[data-client="${id}"]`);
    return {
      caret: caret
        ? {
            offset: caret.getAttribute('data-offset'),
            kept: caret.getAttribute('data-kept'),
            dim: caret.classList.contains('is-dim'),
            box: r(caret),
          }
        : null,
      outlines: [...document.querySelectorAll(`.ts-remote-outline[data-client="${id}"]`)].map(
        (el) => ({
          block:
            el.getAttribute('data-block') ??
            el.closest('[data-block]')?.getAttribute('data-block') ??
            null,
          inside: el.getAttribute('data-inside'),
          box: r(el),
        }),
      ),
      flags: [...document.querySelectorAll(`.ts-flag[data-client="${id}"]`)].map((el) => ({
        text: (el.textContent ?? '').trim(),
        state: el.getAttribute('data-state'),
        box: r(el),
      })),
      drag: drag
        ? {
            block: drag.getAttribute('data-block'),
            state: drag.getAttribute('data-state'),
            box: r(drag),
          }
        : null,
      pointer: pointer ? r(pointer) : null,
      chip: document.querySelector(`[data-control="presence.chip.${id}"]`) !== null,
      following:
        document.querySelector('[data-control="presence.following"]')?.textContent?.trim() ?? null,
      cardMarks: [...document.querySelectorAll('.ts-card-marks')].map((el) => ({
        count: el.getAttribute('data-count'),
        card:
          el.closest('[data-control^="filmstrip.slide."]')?.getAttribute('data-control') ?? null,
        box: r(el),
      })),
    };
  }, clientId);
/** Samples a page every `every` ms while `until` has not resolved; the first time each kind appeared and the rows. */
function sampler(page, clientId, every = 40) {
  const rows = [];
  const first = {};
  const started = performance.now();
  let stop = false;
  const run = (async () => {
    while (!stop) {
      const t = performance.now();
      const d = await drawingsOf(page, clientId).catch(() => null);
      if (d) {
        const at = ms(started);
        for (const kind of ['caret', 'drag', 'pointer'])
          if (d[kind] && first[kind] === undefined) first[kind] = at;
        if (d.outlines.length > 0 && first.outline === undefined) first.outline = at;
        if (d.flags.length > 0 && first.flag === undefined) first.flag = at;
        if (d.chip && first.chip === undefined) first.chip = at;
        rows.push({
          at,
          caret: d.caret?.offset ?? (d.caret ? d.caret.box[0] : null),
          outlines: d.outlines.map((o) => o.block),
          flags: d.flags.map((f) => `${f.text}${f.state ? ` [${f.state}]` : ''}`),
          drag: d.drag?.box ?? null,
          pointer: d.pointer,
          chip: d.chip,
        });
      }
      const wait = every - (performance.now() - t);
      if (wait > 0) await sleep(wait);
    }
  })();
  return {
    started,
    first,
    rows,
    async stop() {
      stop = true;
      await run;
      return { first, rows };
    },
  };
}
async function shot(page, name, clip) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) }).catch(() => undefined);
  return `${name}.png`;
}
async function stageClip(page) {
  const box = await page
    .locator('.ts-stagewrap.ts-editor')
    .first()
    .boundingBox()
    .catch(() => null);
  if (!box) return undefined;
  const vp = page.viewportSize();
  return {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 56),
    width: Math.min(vp.width - Math.max(0, box.x - 8), box.width + 16),
    height: Math.min(vp.height - Math.max(0, box.y - 56), box.height + 64),
  };
}
/** Opens an inline session on a run by double click and puts the caret at the end. */
async function openRun(page, run) {
  const el = runEl(page, run);
  await el.waitFor({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await el.dblclick();
  await sleep(150);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.press('End');
}
const typeHuman = (page, text) => page.keyboard.type(text, { delay: TYPE_DELAY });
/** The instance, the tier and the object's colo an origin's `sync.status` names (the colo is R1's field on the do tier). */
async function statusOf(base, deckId) {
  if (!LOCAL(base) && TOKEN === '')
    return { instance: 'no bearer', tier: 'unread', colo: 'unread' };
  const r = await post(base, 'sync.status', deckId, {}).catch((e) => ({
    status: 0,
    json: { error: String(e) },
  }));
  const colo = r.json?.room?.colo ?? r.json?.colo ?? null;
  return {
    instance: r.json?.storeCalls?.instance ?? `status ${r.status}`,
    tier: r.json?.tier ?? 'unnamed',
    transport: r.json?.transport ?? 'unnamed',
    colo: typeof colo === 'string' && colo !== '' ? colo : 'unnamed',
  };
}
const instanceOf = async (base, deckId) => (await statusOf(base, deckId)).instance;

const browser = await chromium.launch({ headless: !HEADED });
const mk = (baseURL) =>
  browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    extraHTTPHeaders,
  });
const ctxA = await mk(BASE_A);
const A = await ctxA.newPage();
let ctxB = null;
let B = null;
let deckId = null;
let aId = null;
let bId = null;

/* the presence POSTs, the ops POSTs and the stream opens of each page with the x-vercel-id region */
const net = {
  A: { presence: 0, ops: 0, streams: 0, room: 0, sockets: 0, regions: new Set() },
  B: { presence: 0, ops: 0, streams: 0, room: 0, sockets: 0, regions: new Set() },
};
const isRoomHost = (url) => {
  if (ROOM_HOST === null) return false;
  try {
    return new URL(url).host === ROOM_HOST;
  } catch {
    return false;
  }
};
const watch = (who, page) => {
  page.on('response', (response) => {
    const url = response.url();
    const id = response.headers()['x-vercel-id'];
    if (id) net[who].regions.add(id.split('::')[0]);
    if (isRoomHost(url)) net[who].room += 1;
    else if (/\/api\/decks\/[^/]+\/presence/.test(url)) net[who].presence += 1;
    else if (/\/api\/decks\/[^/]+\/ops/.test(url)) net[who].ops += 1;
    else if (/\/api\/decks\/[^/]+\/stream/.test(url)) net[who].streams += 1;
  });
  /* the do tier (docs/CLOUDFLARE.md 3.6.3): one WebSocket per open to the room host */
  page.on('websocket', (ws) => {
    if (isRoomHost(ws.url())) net[who].sockets += 1;
  });
};
watch('A', A);

/** B joins through the editor link on B's origin; returns when B's editor is ready and connected. */
async function joinB(linkPath) {
  ctxB = await mk(BASE_B);
  B = await ctxB.newPage();
  watch('B', B);
  const tJoin = performance.now();
  await B.goto(`${BASE_B}${linkPath}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  const ready = ms(tJoin);
  await connected(B);
  await dismissPrompt(B);
  bId = (await state(B)).presence?.clientId ?? null;
  return { tJoin, ready };
}
async function leaveB() {
  if (B && !B.isClosed()) {
    B.once('dialog', (d) => void d.accept().catch(() => undefined));
    await B.goto('about:blank', { timeout: 10_000 }).catch(() => undefined);
  }
  await ctxB?.close().catch(() => undefined);
  ctxB = null;
  B = null;
}

try {
  // ---- A makes the deck from /new and gives it a title; the editor link is minted
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  say(
    'build',
    await A.evaluate(
      () =>
        document.querySelector('meta[name="turboslide-build"]')?.content ??
        document.documentElement.dataset.build ??
        null,
    ),
  );
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  await openRun(A, heading);
  await page_select_all(A);
  await typeHuman(A, 'Realtime verify');
  await A.keyboard.press('Escape');
  await poll(async () => ((await state(A)).revision >= 1 ? true : null), 30_000, 100);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await connected(A);
  await dismissPrompt(A);
  aId = (await state(A)).presence?.clientId ?? null;
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkPath = (() => {
    try {
      const u = new URL(opened.url ?? '', 'http://turboslide.invalid');
      return u.pathname.startsWith('/s/') ? `${u.pathname}${u.search}` : null;
    } catch {
      return null;
    }
  })();
  say('share.link', linkPath === null ? null : '/s/<token>');
  say('tier', (await state(A)).sync?.tier ?? null);
  say('instances.before', {
    a: await statusOf(BASE_A, deckId),
    b: await statusOf(BASE_B, deckId),
  });
  /* the do tier's Worker (docs/CLOUDFLARE.md 2.3): the health once, the counters before the drive */
  say('worker.health', await readWorker('/health'));
  say('counters.before', await readCounters(deckId));
  /* the body block the typing rows share and two blocks for the selection row, as setup writes */
  const slideId = (await state(A)).slideId;
  const place = async (id, text, pos) => {
    const s = await state(A);
    await invoke(A, 'block.insert', {
      baseRevision: s.revision,
      slideId,
      slot: 'main',
      block: { id, type: 'text', text, pos },
    });
    await poll(
      async () => (((await state(A)).sync?.pending ?? 0) === 0 ? true : null),
      20_000,
      100,
    );
  };
  await place('vf-body', 'start', { x: 160, y: 520, w: 1280, h: 160 });
  await place('vf-x', 'Block X', { x: 160, y: 360, w: 600, h: 120 });
  await place('vf-y', 'Block Y', { x: 840, y: 360, w: 600, h: 120 });
  const bodyRun = (
    await A.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide [data-block="vf-body"] [data-run], .ts-stagewrap.ts-editor .pt-slide [data-block="vf-body"][data-run]',
        ),
      ].map((el) => el.getAttribute('data-run')),
    )
  )[0];
  say('runs', { heading, bodyRun });

  // ---- step 1: the join (realtime.join.chip-within-1s)
  {
    const { ready } = await joinB(linkPath);
    const tReady = performance.now();
    const chipInA = await poll(
      async () => ((await drawingsOf(A, bId)).chip ? ms(tReady) : null),
      20_000,
      40,
    );
    const chipInB = await poll(
      async () => ((await drawingsOf(B, aId)).chip ? ms(tReady) : null),
      20_000,
      40,
    );
    step('join', {
      bEditorReadyMs: ready,
      aSeesBChipMs: chipInA,
      bSeesAChipMs: chipInB,
      aId,
      bId,
      instances: { a: await statusOf(BASE_A, deckId), b: await statusOf(BASE_B, deckId) },
      shot: await shot(A, '01-a-after-join'),
    });
    await B.keyboard.press('Escape');
  }

  // ---- step 2: the keystrokes (realtime.keystroke.within-300ms)
  {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const typedAt = [];
    const seen = new Map();
    let stop = false;
    const watcher = (async () => {
      while (!stop) {
        const text = await runText(B, bodyRun).catch(() => null);
        const at = performance.now();
        if (text !== null)
          for (const l of letters) if (!seen.has(l) && text.includes(l)) seen.set(l, at);
        await sleep(30);
      }
    })();
    await openRun(A, bodyRun);
    for (const l of letters) {
      const started = performance.now();
      await A.keyboard.type(l);
      typedAt.push(performance.now());
      const wait = 1000 - (performance.now() - started);
      if (wait > 0) await sleep(wait);
    }
    await A.keyboard.press('Escape');
    await sleep(3000);
    stop = true;
    await watcher;
    step('keystroke', {
      arrivalsMs: letters.map((l, i) => ({
        letter: l,
        ms: seen.has(l) ? Math.round(seen.get(l) - typedAt[i]) : null,
      })),
      aText: await runText(A, bodyRun),
      bText: await runText(B, bodyRun),
      shot: await shot(B, '02-b-after-keystrokes', await stageClip(B)),
    });
  }

  // ---- step 2b: the two instance case (setup.do.two-instances, docs/CLOUDFLARE.md 2.3): five
  // words from each browser into two blocks through the two origins; the two slide documents, the
  // revisions and the tabs' sync facts after
  {
    const xRun = (
      await A.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide [data-block="vf-x"] [data-run], .ts-stagewrap.ts-editor .pt-slide [data-block="vf-x"][data-run]',
          ),
        ].map((el) => el.getAttribute('data-run')),
      )
    )[0];
    const yRun = (
      await B.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide [data-block="vf-y"] [data-run], .ts-stagewrap.ts-editor .pt-slide [data-block="vf-y"][data-run]',
          ),
        ].map((el) => el.getAttribute('data-run')),
      )
    )[0];
    if (!xRun || !yRun) {
      step('two instances', {
        notDriven: `the two blocks' runs were not found (x ${xRun}, y ${yRun})`,
      });
    } else {
      const wordsA = [' a1', ' a2', ' a3', ' a4', ' a5'];
      const wordsB = [' b1', ' b2', ' b3', ' b4', ' b5'];
      let lastKey = 0;
      const typing = async (page, run, words, gap) => {
        await openRun(page, run);
        for (const w of words) {
          await typeHuman(page, w);
          lastKey = Math.max(lastKey, performance.now());
          await sleep(gap);
        }
        await page.keyboard.press('Escape');
      };
      await Promise.all([typing(A, xRun, wordsA, 500), typing(B, yRun, wordsB, 600)]);
      const convergedMs = await poll(
        async () => {
          const [ax, ay, bx, by] = await Promise.all([
            runText(A, xRun),
            runText(A, yRun),
            runText(B, xRun),
            runText(B, yRun),
          ]);
          const has = (t, words) => words.every((w) => (t ?? '').split(w).length === 2);
          return has(ax, wordsA) && has(bx, wordsA) && has(ay, wordsB) && has(by, wordsB)
            ? ms(lastKey)
            : null;
        },
        10_000,
        40,
      );
      await poll(
        async () => {
          const [sa, sb] = await Promise.all([state(A), state(B)]);
          return (sa.sync?.pending ?? 0) + (sa.sync?.retained ?? 0) === 0 &&
            (sb.sync?.pending ?? 0) + (sb.sync?.retained ?? 0) === 0
            ? true
            : null;
        },
        20_000,
        100,
      );
      const [sa, sb] = await Promise.all([state(A), state(B)]);
      const [docA, docB] = await Promise.all([
        invoke(A, 'slide.get', { slideId }).catch((e) => ({ error: String(e).slice(0, 120) })),
        invoke(B, 'slide.get', { slideId }).catch((e) => ({ error: String(e).slice(0, 120) })),
      ]);
      const canon = (v) => JSON.stringify(v);
      step('two instances', {
        instances: { a: await statusOf(BASE_A, deckId), b: await statusOf(BASE_B, deckId) },
        convergedMsAfterLastKey: convergedMs,
        revisions: {
          a: sa.revision,
          b: sb.revision,
          serverA: sa.serverRevision,
          serverB: sb.serverRevision,
        },
        sync: {
          a: {
            seq: sa.sync?.seq ?? null,
            covered: sa.sync?.covered ?? 'absent',
            colo: sa.sync?.room?.colo ?? sa.sync?.colo ?? 'absent',
            object: sa.sync?.room?.object ?? 'absent',
            tier: sa.sync?.tier ?? null,
            transport: sa.sync?.transport ?? null,
          },
          b: {
            seq: sb.sync?.seq ?? null,
            covered: sb.sync?.covered ?? 'absent',
            colo: sb.sync?.room?.colo ?? sb.sync?.colo ?? 'absent',
            object: sb.sync?.room?.object ?? 'absent',
            tier: sb.sync?.tier ?? null,
            transport: sb.sync?.transport ?? null,
          },
        },
        slideByteEqual: canon(docA) === canon(docB),
        texts: {
          ax: await runText(A, xRun),
          ay: await runText(A, yRun),
          bx: await runText(B, xRun),
          by: await runText(B, yRun),
        },
        shots: [
          await shot(A, '02b-a-two-instances', await stageClip(A)),
          await shot(B, '02b-b-two-instances', await stageClip(B)),
        ],
      });
    }
  }

  // ---- step 3: the caret while B types in a block A has open (realtime.caret.within-300ms)
  {
    await openRun(A, bodyRun);
    await openRun(B, bodyRun);
    const s = sampler(A, bId, 30);
    const typedAt = [];
    for (let i = 0; i < 10; i += 1) {
      const started = performance.now();
      await B.keyboard.type(String.fromCharCode(97 + i));
      typedAt.push(ms(s.started));
      const wait = 700 - (performance.now() - started);
      if (wait > 0) await sleep(wait);
    }
    await sleep(1200);
    const mid = await shot(A, '03-a-b-caret-while-typing', await stageClip(A));
    const { first, rows } = await s.stop();
    const moves = typedAt.slice(1).map((t, i) => {
      const before = [...rows].reverse().find((r) => r.at <= t);
      const moved = rows.find(
        (r) => r.at >= t && r.caret !== null && r.caret !== (before?.caret ?? null),
      );
      return { keystroke: i + 2, ms: moved ? moved.at - t : null };
    });
    step('caret', {
      firstCaretMs: first.caret === undefined ? null : first.caret - typedAt[0],
      firstFlagMs: first.flag === undefined ? null : first.flag - typedAt[0],
      movesMs: moves,
      samples: rows.length,
      shot: mid,
    });
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
  }

  // ---- step 4: both type in one block, the carets after the merge (realtime.caret.offset-after-merge), three rounds
  for (let round = 1; round <= 3; round += 1) {
    const wa = ` ma${round}`;
    const wb = ` mb${round}`;
    await openRun(A, bodyRun);
    await openRun(B, bodyRun);
    await Promise.all([
      typeHuman(A, wa),
      (async () => {
        await sleep(100);
        await typeHuman(B, wb);
      })(),
    ]);
    await poll(
      async () => {
        const [a, b] = await Promise.all([runText(A, bodyRun), runText(B, bodyRun)]);
        return [a, b].every((t) => t && t.includes(wa) && t.includes(wb)) ? true : null;
      },
      5000,
      50,
    );
    await sleep(400);
    const [inA, inB, textA, textB] = await Promise.all([
      drawingsOf(A, bId),
      drawingsOf(B, aId),
      runText(A, bodyRun),
      runText(B, bodyRun),
    ]);
    const endOf = (text, word) => {
      const i = (text ?? '').indexOf(word);
      return i < 0 ? null : i + word.length;
    };
    const shots = [
      await shot(A, `04-r${round}-a-both-in-block`, await stageClip(A)),
      await shot(B, `04-r${round}-b-both-in-block`, await stageClip(B)),
    ];
    await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
    await sleep(300);
    step(`caret merge round ${round}`, {
      aDrawsBAt: inA.caret?.offset ?? null,
      bWordEndsAt: endOf(textA, wb),
      bDrawsAAt: inB.caret?.offset ?? null,
      aWordEndsAt: endOf(textB, wa),
      textA,
      textB,
      afterEscape: { a: (await drawingsOf(A, bId)).caret, b: (await drawingsOf(B, aId)).caret },
      shots,
    });
  }

  // ---- step 5: the selection outline (realtime.selection.outline-within-300ms), eight clicks
  {
    const s = sampler(A, bId, 30);
    const clicks = [];
    for (let i = 0; i < 8; i += 1) {
      const block = i % 2 === 0 ? 'vf-x' : 'vf-y';
      await B.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${block}"]`).first().click();
      await sleep(120);
      if (
        await B.evaluate(
          () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
        )
      )
        await B.keyboard.press('Escape');
      clicks.push({ block, at: ms(s.started) });
      await sleep(900);
    }
    await sleep(800);
    const mid = await shot(A, '05-a-b-outline', await stageClip(A));
    const { rows } = await s.stop();
    step('selection outline', {
      arrivalsMs: clicks.map((c) => {
        const seen = rows.find((r) => r.at >= c.at && r.outlines.includes(c.block));
        return { block: c.block, ms: seen ? seen.at - c.at : null };
      }),
      shot: mid,
    });
    /* a block both hold: A selects Y while B holds it */
    await A.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="vf-y"]').first().click();
    await sleep(120);
    if (
      await A.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      )
    )
      await A.keyboard.press('Escape');
    const inside = await poll(
      async () => (await drawingsOf(A, bId)).outlines.find((o) => o.block === 'vf-y') ?? null,
      2000,
      50,
    );
    step('selection both hold', {
      outlineForBOnY: inside,
      shot: await shot(A, '05-a-both-hold-y', await stageClip(A)),
    });
    await A.keyboard.press('Escape');
  }

  // ---- step 6: B drags the body block while A holds it selected (realtime.block.drag-live)
  {
    await A.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="vf-body"]').first().click();
    await sleep(120);
    if (
      await A.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      )
    )
      await A.keyboard.press('Escape');
    const before =
      JSON.stringify((await invoke(A, 'slide.get', { slideId })).slide ?? {}).match(
        /"id":"vf-body"[^}]*"pos":(\{[^}]*\})/,
      )?.[1] ?? null;
    const el = B.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="vf-body"]').first();
    await el.click();
    await sleep(120);
    if (
      await B.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      )
    )
      await B.keyboard.press('Escape');
    const box = await el.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const s = sampler(A, bId, 30);
    await B.mouse.move(cx, cy);
    await B.mouse.down();
    const dragStart = ms(s.started);
    for (let i = 1; i <= 12; i += 1) {
      await B.mouse.move(cx + (160 * i) / 12, cy);
      await sleep(50);
    }
    const mid = [
      await shot(A, '06-a-while-b-drags', await stageClip(A)),
      await shot(B, '06-b-dragging', await stageClip(B)),
    ];
    await sleep(300);
    await B.mouse.up();
    const released = ms(s.started);
    const landed = await poll(
      async () => {
        const pos =
          JSON.stringify((await invoke(A, 'slide.get', { slideId })).slide ?? {}).match(
            /"id":"vf-body"[^}]*"pos":(\{[^}]*\})/,
          )?.[1] ?? null;
        return pos !== null && pos !== before ? ms(s.started) - released : null;
      },
      5000,
      40,
    );
    await sleep(400);
    const { rows } = await s.stop();
    const during = rows.filter((r) => r.at >= dragStart && r.at <= released);
    step('drag live', {
      ghostPositions: [...new Set(during.filter((r) => r.drag).map((r) => r.drag[0]))].length,
      movingFlag: during.some((r) => r.flags.some((f) => /moving/.test(f))),
      samplesDuringDrag: during.length,
      dragMs: released - dragStart,
      aDocumentMovedMsAfterRelease: landed,
      shots: [...mid, await shot(A, '06-a-after-release', await stageClip(A))],
    });
    await A.keyboard.press('Escape');
  }

  // ---- step 7: two typers in the title (realtime.title.two-typers), three rounds
  for (let round = 1; round <= 3; round += 1) {
    const pair1 = [` ta${round}`, ` tb${round}`];
    const pair2 = [` ua${round}`, ` ub${round}`];
    const seenA = new Map();
    const seenB = new Map();
    const typedEnd = new Map();
    let stop = false;
    const watcher = (async () => {
      while (!stop) {
        const [a, b] = await Promise.all([
          runText(A, heading).catch(() => null),
          runText(B, heading).catch(() => null),
        ]);
        const at = performance.now();
        for (const w of [...pair1, ...pair2]) {
          if (a && a.includes(w) && !seenA.has(w)) seenA.set(w, at);
          if (b && b.includes(w) && !seenB.has(w)) seenB.set(w, at);
        }
        await sleep(30);
      }
    })();
    const typeWord = async (p, w) => {
      await typeHuman(p, w);
      typedEnd.set(w, performance.now());
    };
    await openRun(A, heading);
    await openRun(B, heading);
    await Promise.all([
      typeWord(A, pair1[0]),
      (async () => {
        await sleep(100);
        await typeWord(B, pair1[1]);
      })(),
    ]);
    await sleep(700);
    await Promise.all([
      typeWord(A, pair2[0]),
      (async () => {
        await sleep(100);
        await typeWord(B, pair2[1]);
      })(),
    ]);
    await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
    const escapeAt = performance.now();
    const both = await poll(
      async () => {
        const [a, b] = await Promise.all([runText(A, heading), runText(B, heading)]);
        return [...pair1, ...pair2].every(
          (w) => a && b && a.split(w).length === 2 && b.split(w).length === 2,
        )
          ? ms(escapeAt)
          : null;
      },
      5000,
      30,
    );
    stop = true;
    await watcher;
    step(`two typers round ${round}`, {
      bothWordsInBothMsAfterEscape: both,
      bWordsInAMsAfterKeystrokes: [pair1[1], pair2[1]].map((w) => ({
        word: w.trim(),
        ms: seenA.has(w) ? Math.round(seenA.get(w) - typedEnd.get(w)) : null,
      })),
      aWordsInBMsAfterKeystrokes: [pair1[0], pair2[0]].map((w) => ({
        word: w.trim(),
        ms: seenB.has(w) ? Math.round(seenB.get(w) - typedEnd.get(w)) : null,
      })),
      textA: await runText(A, heading),
      textB: await runText(B, heading),
      shots: [
        await shot(A, `07-r${round}-a-title`, await stageClip(A)),
        await shot(B, `07-r${round}-b-title`, await stageClip(B)),
      ],
    });
  }

  // ---- step 8: the pointer (realtime.pointer.second-browser), through the View menu when it is in the default view
  {
    const settingOf = async (p, key) => ((await state(p)).settings ?? {})[key] === true;
    const menuRow = async (p, row) => {
      await ctl(p, 'menubar.view').click();
      await p.locator('#ts-menu-view').waitFor({ timeout: 8000 });
      const parent = ctl(p, 'menu.view.livePointers');
      if ((await parent.count()) === 0) {
        await p.keyboard.press('Escape');
        return false;
      }
      await parent.hover();
      await sleep(300);
      const target = ctl(p, `menu.${row}`);
      if ((await target.count()) === 0) {
        await p.keyboard.press('Escape');
        await p.keyboard.press('Escape');
        return false;
      }
      await target.click();
      await sleep(200);
      return true;
    };
    const othersId = (await A.evaluate(
      () => document.querySelector('[data-control="menu.view.livePointers.others"]') !== null,
    ))
      ? 'view.livePointers.others'
      : 'view.livePointers.collaborators';
    const mineOn =
      (await settingOf(B, 'pointerMine')) || (await menuRow(B, 'view.livePointers.mine'));
    const othersOn =
      (await settingOf(A, 'pointerOthers')) ||
      (await menuRow(A, othersId)) ||
      (await menuRow(
        A,
        othersId === 'view.livePointers.others'
          ? 'view.livePointers.collaborators'
          : 'view.livePointers.others',
      ));
    if (!mineOn || !othersOn)
      step('pointer', {
        notDriven: `the View rows are not in the default view (Show my pointer reachable ${mineOn}, Show collaborator pointers reachable ${othersOn})`,
      });
    else {
      const sheet = await B.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
        .first()
        .boundingBox();
      const s = sampler(A, bId, 30);
      const moveAt = ms(s.started);
      for (let i = 0; i < 10; i += 1) {
        await B.mouse.move(
          sheet.x + sheet.width * (0.3 + i * 0.04),
          sheet.y + sheet.height * (0.4 + i * 0.03),
        );
        await sleep(100);
      }
      await sleep(800);
      const mid = await shot(A, '08-a-b-pointer', await stageClip(A));
      const { first, rows } = await s.stop();
      step('pointer', {
        drawnMsAfterFirstMove: first.pointer === undefined ? null : first.pointer - moveAt,
        positions: new Set(rows.filter((r) => r.pointer).map((r) => r.pointer.join(','))).size,
        flags: rows.find((r) => r.pointer)?.flags ?? [],
        shot: mid,
      });
    }
  }

  // ---- step 9: B on slide 2, the card chip in A's filmstrip (realtime.card.chip-painted), read in the pixels
  {
    const s0 = await state(A);
    const order = await invoke(A, 'slide.list', {});
    const ids = (Array.isArray(order) ? order : (order.slides ?? order.items ?? [])).map((x) =>
      typeof x === 'string' ? x : x.id,
    );
    let second = ids.find((id) => id !== slideId) ?? null;
    if (second === null) {
      await invoke(A, 'slide.new', { layout: 'split', after: slideId, baseRevision: s0.revision });
      await poll(
        async () => (((await state(A)).sync?.pending ?? 0) === 0 ? true : null),
        20_000,
        100,
      );
      const again = await invoke(A, 'slide.list', {});
      second =
        (Array.isArray(again) ? again : (again.slides ?? again.items ?? []))
          .map((x) => (typeof x === 'string' ? x : x.id))
          .find((id) => id !== slideId) ?? null;
    }
    await poll(
      async () =>
        (await B.locator(`[data-control="filmstrip.slide.${second}"]`).count()) > 0 ? true : null,
      15_000,
      100,
    );
    const tClick = performance.now();
    await B.locator(`[data-control="filmstrip.slide.${second}"]`).first().click();
    const marksSel = `[data-control="filmstrip.slide.${second}"] .ts-card-marks[data-count]`;
    const domMs = await poll(
      async () => ((await A.locator(marksSel).count()) > 0 ? ms(tClick) : null),
      10_000,
      40,
    );
    let pixels = null;
    if (domMs !== null) {
      const box = await A.locator(marksSel).first().boundingBox();
      const clip = {
        x: Math.max(0, box.x - 2),
        y: Math.max(0, box.y - 2),
        width: box.width + 4,
        height: box.height + 4,
      };
      const drawn = await A.screenshot({ clip });
      const style = await A.addStyleTag({
        content: '.ts-card-marks { visibility: hidden !important; }',
      });
      await sleep(120);
      const hidden = await A.screenshot({ clip });
      await style.evaluate((el) => el.remove());
      pixels = { bytesEqual: Buffer.compare(drawn, hidden) === 0, clip };
      writeFileSync(join(OUT, '09-a-card-marks-drawn.png'), drawn);
      writeFileSync(join(OUT, '09-a-card-marks-hidden.png'), hidden);
    }
    step('card chip', {
      marksInDomMsAfterClick: domMs,
      pixels,
      shot: await shot(A, '09-a-filmstrip'),
    });
    await A.locator(`[data-control="filmstrip.slide.${slideId}"]`)
      .first()
      .click()
      .catch(() => undefined);
  }

  // ---- step 10: Follow (realtime.follow.for-everyone)
  {
    await A.keyboard.press('Escape');
    const more = ctl(A, 'presence.more');
    const takesPointer = await more
      .evaluate(
        (el) =>
          !el.classList.contains('is-empty') &&
          getComputedStyle(el).pointerEvents !== 'none' &&
          getComputedStyle(el).opacity !== '0',
      )
      .catch(() => false);
    if (takesPointer) await more.click().catch(() => undefined);
    else await A.keyboard.press('Shift+Tab');
    const rosterOpen = await A.locator('#ts-menu-roster')
      .first()
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    const row = rosterOpen
      ? await A.locator(`[data-control="presence.roster.${bId}"]`)
          .first()
          .evaluate((el) => ({
            item: el.getAttribute('data-menu-item'),
            act: el.querySelector('.ts-roster-act')?.textContent?.trim() ?? null,
          }))
          .catch(() => null)
      : null;
    const rosterShot = await shot(A, '10-a-roster');
    if (!row || row.item !== 'title.presence.follow') {
      await A.keyboard.press('Escape');
      step('follow', {
        notDriven: `Follow is not offered in the default view (B's roster row ${JSON.stringify(row)}; Advanced tools ${((await state(A)).settings ?? {}).advancedTools === true})`,
        shot: rosterShot,
      });
    } else {
      await A.locator(`[data-control="presence.roster.${bId}"]`).first().click();
      const plate = await poll(async () => (await drawingsOf(A, bId)).following, 5000, 50);
      const slidesB = await B.evaluate(() =>
        [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((e) =>
          e.getAttribute('data-control'),
        ),
      );
      const target = slidesB.find((c) => !c.endsWith(`.${slideId}`)) ?? slidesB[0];
      const tClick = performance.now();
      await B.locator(`[data-control="${target}"]`).first().click();
      const followedMs = await poll(
        async () => (`filmstrip.slide.${(await state(A)).slideId}` === target ? ms(tClick) : null),
        5000,
        40,
      );
      const plateShot = await shot(A, '10-a-following');
      /* the own click ends it */
      await A.locator(`[data-control="filmstrip.slide.${slideId}"]`).first().click();
      const endedByClick = await poll(
        async () => (((await state(A)).presence?.following ?? null) === null ? true : null),
        3000,
        50,
      );
      step('follow', {
        plate,
        followedMsAfterBClick: followedMs,
        endedByOwnClick: endedByClick === true,
        shots: [rosterShot, plateShot],
      });
    }
  }

  // ---- step 11: B stops; the caret dims; B leaves (realtime.caret.dims-and-leaves)
  {
    await openRun(B, bodyRun);
    await typeHuman(B, ' z');
    const caretAt = await poll(
      async () => ((await drawingsOf(A, bId)).caret ? performance.now() : null),
      5000,
      50,
    );
    const dimMs =
      caretAt === null
        ? null
        : await poll(
            async () => ((await drawingsOf(A, bId)).caret?.dim ? ms(caretAt) : null),
            40_000,
            500,
          );
    const dimShot = await shot(A, '11-a-b-caret-dim', await stageClip(A));
    const before = await drawingsOf(A, bId);
    const leftAt = performance.now();
    await leaveB();
    const goneMs = await poll(
      async () => {
        const d = await drawingsOf(A, bId);
        return d.caret === null && d.outlines.length === 0 && d.flags.length === 0 && !d.chip
          ? ms(leftAt)
          : null;
      },
      10_000,
      50,
    );
    step('dims and leaves', {
      caretDimMsAfterStill: dimMs,
      beforeLeave: {
        caret: before.caret !== null,
        outlines: before.outlines.length,
        flags: before.flags.length,
        chip: before.chip,
      },
      everythingGoneMsAfterLeave: goneMs,
      shots: [dimShot, await shot(A, '12-a-after-b-left', await stageClip(A))],
    });
  }
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => undefined);
  if (B) await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => undefined);
} finally {
  await leaveB().catch(() => undefined);
  if (deckId) say('counters.after', await readCounters(deckId));
  if (deckId) {
    /* the teardown by id: the bearer on a deployment, A's window API on a checkout without one */
    if (TOKEN !== '' || !LOCAL(BASE_A)) {
      const info = await post(BASE_A, 'deck.info', deckId, {});
      let rev = info.json?.revision;
      const trash = await post(BASE_A, 'deck.trash', deckId, { id: deckId, baseRevision: rev });
      const info2 = await post(BASE_A, 'deck.info', deckId, {});
      rev = info2.json?.revision ?? rev;
      const remove = await post(BASE_A, 'deck.remove', deckId, {
        id: deckId,
        confirm: true,
        baseRevision: rev,
      });
      say('teardown', { info: info.status, trash: trash.status, remove: remove.status });
    } else {
      try {
        const info = await invoke(A, 'deck.info');
        await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
        const again = await invoke(A, 'deck.info').catch(() => info);
        await invoke(A, 'deck.remove', {
          id: deckId,
          baseRevision: again.revision ?? info.revision,
          confirm: true,
        }).catch(() => undefined);
        say('teardown', 'through the window API');
      } catch (error) {
        say('teardown', `failed: ${String(error).slice(0, 200)}`);
      }
    }
    const gone = await fetch(`${BASE_A}/edit/${deckId}`, {
      redirect: 'manual',
      headers: extraHTTPHeaders,
    }).catch(() => ({ status: 0 }));
    say('teardown.editStatus', gone.status);
  }
  await browser.close().catch(() => undefined);
  facts.network = Object.fromEntries(
    Object.entries(net).map(([who, n]) => [who, { ...n, regions: [...n.regions] }]),
  );
  facts.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
  console.log(`facts: ${join(OUT, 'facts.json')} (${facts.steps.length} steps)`);
}

/** Select all in the open session (the title's placeholder is replaced). */
async function page_select_all(page) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
}

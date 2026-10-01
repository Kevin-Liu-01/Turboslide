// R1's hand drive of its rows (docs/REALTIME.md section 2, the rows whose lanes name R1) on the
// two process local run of 5.4 item 1: A's browser context on the first node server (4471) and
// B's on the second (4481), both over one tmp overlay and one Redis database, so every request of
// A and B is answered by a different process. Runs until R5's core/realtime.spec.ts drives the
// same rows; the readings and the pictures land beside this file. The agent surface of both
// servers is the localhost one (TURBOSLIDE_LOCAL_OPEN), so no bearer is needed or printed.
//   node docs/gslides-parity/realtime/build/r1/drive.mjs [--a http://localhost:4471] [--b http://localhost:4481] [--rows a,b,c]
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const ROWS = new Set((arg('rows', '') || '').split(',').filter(Boolean));
const wants = (row) => ROWS.size === 0 || ROWS.has(row);
const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 70;
const REDIS_DB = arg('redis-db', '1');

const facts = { startedAt: new Date().toISOString(), baseA: BASE_A, baseB: BASE_B, load: loadavg() };
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

/** `INFO commandstats` of the lane's database, summed over commands (the cost row's reading). */
function redisCommandStats() {
  try {
    const out = execSync(`docker exec turboslide-redis redis-cli -n ${REDIS_DB} INFO commandstats`, {
      encoding: 'utf8',
    });
    const rows = {};
    let total = 0;
    for (const line of out.split('\n')) {
      const m = /^cmdstat_([a-z|]+):calls=(\d+)/i.exec(line.trim());
      if (!m) continue;
      rows[m[1]] = Number(m[2]);
      total += Number(m[2]);
    }
    return { total, rows };
  } catch (error) {
    return { total: null, error: error instanceof Error ? error.message : String(error) };
  }
}

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
async function connected(page, timeout = 45_000) {
  return poll(async () => ((await state(page)).sync?.connected ? true : null), timeout, 100);
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

const runsOf = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => ({ run: el.getAttribute('data-run') ?? '', text: el.textContent ?? '' })),
  );
const runText = async (page, run) => {
  const rows = await runsOf(page);
  return rows.find((r) => r.run === run)?.text ?? null;
};
const runEl = (page, run) =>
  page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();

const remoteDrawings = (page) =>
  page.evaluate(() => {
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].map((el) => ({
        client: el.getAttribute('data-client'),
        text: el.textContent?.trim() ?? '',
        box: (() => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
        })(),
      }));
    return {
      carets: pick('.ts-remote-caret'),
      flags: pick('.ts-flag'),
      outlines: pick('.ts-remote-outline'),
      pointers: pick('.ts-remote-pointer-group'),
      chips: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
      snackbar: document.querySelector('[data-control="snackbar"]')?.textContent?.trim() ?? '',
    };
  });

async function shot(page, name, clip) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return `${name}.png`;
}
async function stageClip(page) {
  const box = await page.locator('.ts-stagewrap.ts-editor').first().boundingBox();
  if (!box) return undefined;
  const vp = page.viewportSize();
  return {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 56),
    width: Math.min(vp.width - Math.max(0, box.x - 8), box.width + 16),
    height: Math.min(vp.height - Math.max(0, box.y - 56), box.height + 64),
  };
}

async function dismissPrompt(page) {
  const prompt = ctl(page, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0)
      await ctl(page, 'dialog.namePrompt.close')
        .click({ timeout: 2000 })
        .catch(() => undefined);
    else
      await ctl(page, 'dialog.namePrompt.skip')
        .click({ timeout: 2000 })
        .catch(() => undefined);
  }
}

/** Opens an inline session on a run and types without closing it. */
async function beginTyping(page, run, text, { replace = true, startDelay = 0, delay = TYPE_DELAY } = {}) {
  if (startDelay > 0) await page.waitForTimeout(startDelay);
  await runEl(page, run).dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press(replace ? 'Meta+a' : 'End');
  await page.keyboard.type(text, { delay });
}
async function openSession(page, run) {
  await runEl(page, run).dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
}

/** Samples a reader at `every` ms until `predicate` reads true; the first moment it did, or null. */
async function firstMoment(fn, timeout, every = 40) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    if (await fn()) return ms(t0);
    await sleep(every);
  }
  return null;
}

function withPort(url, base) {
  const u = new URL(url);
  const b = new URL(base);
  u.protocol = b.protocol;
  u.host = b.host;
  return u.toString();
}

const browser = await chromium.launch({ headless: true });
const mk = (baseURL) =>
  browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
const ctxA = await mk(BASE_A);
const ctxB = await mk(BASE_B);
const A = await ctxA.newPage();
let B = await ctxB.newPage();

/* the ops POSTs on the wire, the way core/sync.spec.ts reads them: the body's op, path, offset
   and lengths (never the text beyond 24 characters, never a header or a cookie), the answer's
   status, admitted seqs and rejected op ids; one list per page, cleared per round */
const wire = { A: [], B: [] };
function watchOps(page, who) {
  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'POST' || !/\/api\/decks\/[^/]+\/ops/.test(request.url())) return;
    let sent = null;
    try {
      const body = JSON.parse(request.postData() ?? 'null');
      sent = {
        base: body?.base?.seq ?? null,
        entries: (body?.entries ?? []).map((e) => ({
          opId: e.opId?.slice(-6),
          mutations: (e.mutations ?? []).map((m) => ({
            op: m.op,
            path: m.path,
            ...(m.at !== undefined ? { at: m.at } : {}),
            ...(m.remove !== undefined ? { remove: m.remove } : {}),
            ...(m.insert !== undefined ? { insert: String(m.insert).slice(0, 24) } : {}),
            ...(m.value !== undefined ? { value: String(m.value).slice(0, 24) } : {}),
          })),
        })),
      };
    } catch {
      sent = { unreadable: true };
    }
    let answer = null;
    try {
      const json = await response.json();
      answer = {
        status: response.status(),
        seqs: (json.entries ?? []).map((e) => e.seq),
        rejected: json.rejected ?? [],
        between: (json.between ?? []).length,
        ...(json.error !== undefined ? { error: json.error } : {}),
      };
    } catch {
      answer = { status: response.status() };
    }
    wire[who].push({ at: Math.round(performance.now()), sent, answer });
  });
}
watchOps(A, 'A');
const watchB = () => watchOps(B, 'B');
watchB();
let deckId = null;
const rows = {};
const row = (id, reading) => {
  rows[id] = reading;
  say(`row.${id}`, reading);
};
const statsBefore = redisCommandStats();

try {
  // ---- A creates the deck from /new and gives it a title
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  const subtitle = runs0.find((r) => r.run !== heading)?.run ?? null;
  say('runs.chosen', { heading, subtitle, all: runs0.map((r) => r.run) });
  await beginTyping(A, heading, 'Realtime round drive');
  await A.keyboard.press('Escape');
  await poll(async () => ((await state(A)).revision >= 1 ? true : null), 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await dismissPrompt(A);
  await connected(A);
  const syncA = await invoke(A, 'sync.status');
  say('A.sync', { tier: syncA.tier, transport: syncA.transport, connected: syncA.connected });
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision ?? 0,
  });
  const linkUrl = opened.url ? withPort(opened.url, BASE_B) : null;
  say('share.link', linkUrl ? linkUrl.replace(/\/s\/.*$/, '/s/<token>') : null);

  // ---- realtime.share-link.every-instance: a fresh browser on the other origin opens the link
  //      within a second of its mint and reads the editor
  if (wants('share-link')) {
    const readings = [];
    for (let i = 0; i < 5; i += 1) {
      const current = await invoke(A, 'share.get', { id: deckId });
      const minted = await invoke(A, 'share.createLink', {
        id: deckId,
        role: 'editor',
        baseRevision: current.record?.revision ?? current.revision ?? 0,
      });
      const url = minted.url ? withPort(minted.url, i % 2 === 0 ? BASE_B : BASE_A) : null;
      if (!url) {
        readings.push({ round: i + 1, error: 'no url', body: minted });
        continue;
      }
      const ctx = await mk(i % 2 === 0 ? BASE_B : BASE_A);
      const page = await ctx.newPage();
      const t0 = performance.now();
      await sleep(Math.max(0, 200 - ms(t0)));
      const response = await page.goto(url, { waitUntil: 'commit' }).catch(() => null);
      const landed = await page
        .waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      const ready = landed
        ? await waitEditor(page)
            .then(() => true)
            .catch(() => false)
        : false;
      readings.push({
        round: i + 1,
        origin: new URL(url).port,
        status: response?.status() ?? null,
        openedMsAfterMint: ms(t0),
        landedOnEditor: landed,
        editorReady: ready,
        finalPath: new URL(page.url()).pathname.replace(deckId, '<id>').replace(/\/s\/.*/, '/s/<token>'),
      });
      await ctx.close();
    }
    row('realtime.share-link.every-instance', {
      rounds: readings,
      pass: readings.every((r) => r.landedOnEditor && r.editorReady),
      load: loadavg(),
    });
  }

  // ---- realtime.join.chip-within-1s: B opens the link on the other origin; the chips, three of three
  const joins = [];
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) {
      await B.context().close().catch(() => undefined);
      const fresh = await mk(BASE_B);
      B = await fresh.newPage();
      watchB();
    }
    const aSelf = (await state(A)).presence?.self?.clientId ?? null;
    const chipsBefore = (await remoteDrawings(A)).chips;
    const tJoin = performance.now();
    await B.goto(linkUrl ?? `/edit/${deckId}`);
    await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
    await waitEditor(B);
    const tReady = performance.now();
    const bReadyMs = ms(tJoin);
    // B's own chip, by B's client id, in A's title row (never A's own chip, which is there before
    // the join), and A's chip by A's client id in B's; each timed from B's editor being ready
    const bSelf = await poll(async () => (await state(B)).presence?.self?.clientId ?? null, 10_000, 50);
    const aSees = await firstMoment(async () => {
      const d = await remoteDrawings(A);
      const s = await state(A);
      return (
        bSelf !== null &&
        d.chips.includes(`presence.chip.${bSelf}`) &&
        (s.presence?.others ?? []).some((o) => o.clientId === bSelf)
      );
    }, 15_000);
    const aSeesAfterReady = aSees === null ? null : Math.max(0, Math.round(aSees - (performance.now() - tReady - aSees) * 0));
    const bSees = await firstMoment(async () => {
      const d = await remoteDrawings(B);
      const s = await state(B);
      return (
        aSelf !== null &&
        d.chips.includes(`presence.chip.${aSelf}`) &&
        (s.presence?.others ?? []).some((o) => o.clientId === aSelf)
      );
    }, 15_000);
    joins.push({
      round: i + 1,
      bEditorReadyMs: bReadyMs,
      aSeesBChipAfterReadyMs: aSeesAfterReady,
      bSeesAChipAfterReadyMs: bSees === null ? null : bSees + (aSees ?? 0),
      chipsInABefore: chipsBefore.length,
      note: 'A polled first for B chip by client id, then B for A chip (its time includes A wait)',
    });
    await dismissPrompt(B);
    await connected(B);
  }
  const syncB = await invoke(B, 'sync.status');
  say('B.sync', { tier: syncB.tier, transport: syncB.transport, connected: syncB.connected });
  row('realtime.join.chip-within-1s', {
    rounds: joins,
    pass: joins.every((j) => j.aSeesBChipAfterReadyMs !== null && j.aSeesBChipAfterReadyMs <= 1000 && j.bSeesAChipAfterReadyMs !== null && j.bSeesAChipAfterReadyMs <= 1000),
    origins: { A: new URL(BASE_A).port, B: new URL(BASE_B).port },
    load: loadavg(),
  });
  say('shot.join.A', await shot(A, 'r1-01-a-after-join'));
  say('shot.join.B', await shot(B, 'r1-01-b-after-join'));

  // ---- realtime.keystroke.within-300ms: A types ten characters into the subtitle one per second
  if (wants('keystroke') && subtitle) {
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
    const chars = 'ABCDEFGHIJ'.split('');
    await runEl(A, subtitle).dblclick();
    await A.waitForTimeout(150);
    await A.keyboard.press('Meta+a');
    const timings = [];
    for (const [i, ch] of chars.entries()) {
      const t0 = performance.now();
      await A.keyboard.type(ch);
      const want = chars.slice(0, i + 1).join('');
      const seen = await firstMoment(async () => {
        const text = (await runText(B, subtitle)) ?? '';
        return text.endsWith(want) || text === want;
      }, 3000, 30);
      timings.push({ char: ch, inBMs: seen });
      await sleep(Math.max(0, 1000 - ms(t0)));
    }
    await A.keyboard.press('Escape');
    const finalB = await poll(async () => {
      const t = (await runText(B, subtitle)) ?? '';
      return t === chars.join('') ? t : null;
    }, 5000, 50);
    const over = timings.filter((t) => t.inBMs === null || t.inBMs > 300);
    row('realtime.keystroke.within-300ms', {
      timings,
      finalInB: finalB ?? (await runText(B, subtitle)),
      maxMs: Math.max(...timings.map((t) => t.inBMs ?? 9999)),
      meanMs: Math.round(timings.reduce((s, t) => s + (t.inBMs ?? 3000), 0) / timings.length),
      overBound: over.length,
      pass: over.length === 0 && finalB === chars.join(''),
      load: loadavg(),
    });
    say('shot.keystroke.B', await shot(B, 'r1-02-b-after-a-typed', await stageClip(B)));
  }

  // ---- realtime.caret.within-300ms: B types in the subtitle; A draws B's caret and moves it.
  //      Two variants: A holds the same block open (the row's wording, "a block A has open") and A
  //      holds nothing open, so the channel's half (R1) reads apart from the drawing's (R2).
  if (wants('caret') && subtitle) {
    const variants = [];
    for (const open of [false, true]) {
      await A.keyboard.press('Escape');
      await B.keyboard.press('Escape');
      await A.mouse.click(20, 500);
      await sleep(300);
      if (open) {
        await openSession(A, subtitle);
        await sleep(300);
      }
      const before = await remoteDrawings(A);
      await runEl(B, subtitle).dblclick();
      await B.waitForTimeout(150);
      await B.keyboard.press('End');
      const moves = [];
      let lastBox = before.carets[0]?.box ?? null;
      const stateClocks = [];
      for (let i = 0; i < 10; i += 1) {
        const t0 = performance.now();
        const bSelf = (await state(B)).presence?.self?.clientId ?? null;
        await B.keyboard.type('k');
        const seen = await firstMoment(async () => {
          const d = await remoteDrawings(A);
          const box = d.carets[0]?.box ?? null;
          if (!box) return false;
          if (lastBox === null || box[0] !== lastBox[0] || box[1] !== lastBox[1]) {
            lastBox = box;
            return true;
          }
          return false;
        }, 2000, 30);
        // the channel's half: the frame itself reached A (the other's caret offset in A's state)
        const other = ((await state(A)).presence?.others ?? []).find((o) => o.clientId === bSelf);
        stateClocks.push(other?.selection?.caret ?? null);
        moves.push({ keystroke: i + 1, caretMovedInAMs: seen, box: lastBox });
        if (i === 2)
          say(`shot.caret.A.${open ? 'open' : 'closed'}`, await shot(A, `r1-03-a-sees-b-caret-${open ? 'open' : 'closed'}`, await stageClip(A)));
        await sleep(Math.max(0, 500 - ms(t0)));
      }
      const flags = (await remoteDrawings(A)).flags.map((f) => f.text);
      await B.keyboard.press('Escape');
      await A.keyboard.press('Escape');
      const over = moves.filter((m) => m.caretMovedInAMs === null || m.caretMovedInAMs > 300);
      variants.push({
        aHoldsBlockOpen: open,
        moves,
        caretOffsetsInAState: stateClocks.map((c) => c?.offset ?? c?.range ?? null),
        flagsInA: flags,
        overBound: over.length,
        pass: over.length === 0 && flags.length > 0,
      });
    }
    row('realtime.caret.within-300ms', { variants, pass: variants.every((v) => v.pass), load: loadavg() });
  }

  // ---- realtime.selection.outline-within-300ms: B clicks blocks; A draws and moves the outline
  if (wants('selection') && subtitle) {
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
    await A.mouse.click(20, 500);
    await sleep(400);
    const headingBlock = heading.split('/')[0];
    const leadBlock = subtitle.split('/')[0];
    const bSelf = (await state(B)).presence?.self?.clientId ?? null;
    const travel = [];
    let lastBox = null;
    const targets = [leadBlock, headingBlock, leadBlock, headingBlock, leadBlock, headingBlock, leadBlock, headingBlock];
    for (const [i, target] of targets.entries()) {
      const run = target === leadBlock ? subtitle : heading;
      await sleep(600);
      const t0 = performance.now();
      await runEl(B, run).click();
      const seen = await firstMoment(async () => {
        const d = await remoteDrawings(A);
        const box = d.outlines[0]?.box ?? null;
        if (!box) return false;
        if (lastBox === null || box[1] !== lastBox[1]) {
          lastBox = box;
          return true;
        }
        return false;
      }, 3000, 30);
      const s = await state(A);
      const other = (s.presence?.others ?? []).find((o) => o.clientId === bSelf);
      travel.push({ round: i + 1, target, outlineInAMs: seen, aStateBlockIds: other?.selection?.blockIds ?? null, box: lastBox });
      if (i === 0) say('shot.selection.A', await shot(A, 'r1-04-a-sees-b-outline', await stageClip(A)));
    }
    const over = travel.filter((t) => t.outlineInAMs === null || t.outlineInAMs > 300);
    row('realtime.selection.outline-within-300ms', { rounds: travel, overBound: over.length, pass: over.length === 0, load: loadavg() });
  }

  // ---- realtime.title.two-typers: both type a word each into the title within 200 ms, then
  //      append a word each, three rounds. Every word is typed at the end of the text (the row's
  //      "type a word each"); a select all in both tabs within 200 ms would be a replacement of
  //      the other's letters as they arrive, which the transform rightly honours (the first run
  //      of this drive read "bravo" alone that way).
  if (wants('title')) {
    const results = [];
    for (const [round, wordA, wordB] of [
      [1, ' alpha', ' bravo'],
      [2, ' charlie', ' delta'],
      [3, ' echo', ' foxtrot'],
    ]) {
      await A.keyboard.press('Escape');
      await B.keyboard.press('Escape');
      await sleep(1200);
      wire.A.length = 0;
      wire.B.length = 0;
      const t0 = performance.now();
      const seenOther = { aSawB: null, bSawA: null };
      const done = { a: null, b: null };
      const watcher = (async () => {
        while (performance.now() - t0 < 8000 && (seenOther.aSawB === null || seenOther.bSawA === null)) {
          const [a, b] = await Promise.all([runText(A, heading), runText(B, heading)]);
          if (seenOther.aSawB === null && (a ?? '').includes(wordB.trim())) seenOther.aSawB = ms(t0);
          if (seenOther.bSawA === null && (b ?? '').includes(wordA.trim())) seenOther.bSawA = ms(t0);
          await sleep(40);
        }
      })();
      await Promise.all([
        beginTyping(A, heading, wordA, { replace: false }).then(() => {
          done.a = ms(t0);
        }),
        beginTyping(B, heading, wordB, { replace: false, startDelay: 150 }).then(() => {
          done.b = ms(t0);
        }),
      ]);
      const tEsc = performance.now();
      await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
      const converged = await poll(async () => {
        const [a, b] = await Promise.all([runText(A, heading), runText(B, heading)]);
        const both = (t) => t !== null && t.includes(wordA.trim()) && t.includes(wordB.trim());
        return both(a) && both(b) && a === b ? { at: ms(tEsc), text: a } : null;
      }, 10_000, 40);
      await watcher;
      results.push({
        round,
        wordA,
        wordB,
        convergedAfterEscapeMs: converged?.at ?? null,
        text: converged?.text ?? { a: await runText(A, heading), b: await runText(B, heading) },
        // the other's whole word in the DOM, timed from the typist's last keystroke
        aSawBWordAfterBLastKeyMs: seenOther.aSawB === null || done.b === null ? null : seenOther.aSawB - done.b,
        bSawAWordAfterALastKeyMs: seenOther.bSawA === null || done.a === null ? null : seenOther.bSawA - done.a,
        typingDoneMs: done,
        wire: { A: [...wire.A], B: [...wire.B] },
      });
      if (round === 1) {
        say('shot.title.A', await shot(A, 'r1-05-a-two-typers', await stageClip(A)));
        say('shot.title.B', await shot(B, 'r1-05-b-two-typers', await stageClip(B)));
      }
    }
    row('realtime.title.two-typers', {
      rounds: results,
      pass: results.every(
        (r) =>
          r.convergedAfterEscapeMs !== null &&
          r.convergedAfterEscapeMs <= 500 &&
          r.aSawBWordAfterBLastKeyMs !== null &&
          r.aSawBWordAfterBLastKeyMs <= 500 &&
          r.bSawAWordAfterALastKeyMs !== null &&
          r.bSawAWordAfterALastKeyMs <= 500,
      ),
      load: loadavg(),
    });
  }

  // ---- realtime.agent.write-announced: a bearer write through the other origin while A's tab is open
  if (wants('agent')) {
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
    await sleep(800);
    const infoNow = await post(BASE_B, 'deck.info', deckId, {});
    const headingBlock = heading.split('/')[0];
    const slideNow = (await state(A)).slideId;
    const t0 = performance.now();
    // the cover's heading is a slide field until the slide converts to a canvas (then a block):
    // `slide.set /heading` writes the field, `block.set` the block; the first form that the
    // document takes is the write (the first run's `block.set` alone answered "No block heading")
    let written = await post(BASE_B, 'slide.update', deckId, {
      slideId: slideNow,
      baseRevision: infoNow.json?.revision ?? 0,
      mutations: [{ op: 'slide.set', slideId: slideNow, path: '/heading', value: 'Written by the agent' }],
    });
    if (written.status !== 200) {
      written = await post(BASE_B, 'block.set', deckId, {
        slideId: slideNow,
        blockId: headingBlock,
        path: '/text',
        value: 'Written by the agent',
        baseRevision: infoNow.json?.revision ?? 0,
      });
    }
    say('agent.write', { status: written.status, ms: ms(t0), base: infoNow.json?.revision ?? null, body: written.status === 200 ? { revision: written.json?.revision } : written.json });
    const textInA = await firstMoment(async () => ((await runText(A, heading)) ?? '').includes('Written by the agent'), 5000, 30);
    const banner = await firstMoment(async () => (await remoteDrawings(A)).snackbar.length > 0, 5000, 30);
    const snackbar = (await remoteDrawings(A)).snackbar;
    say('shot.agent.A', await shot(A, 'r1-06-a-agent-banner'));
    await A.mouse.click(20, 500);
    await A.keyboard.press('Meta+z');
    await sleep(1200);
    const afterUndo = await runText(A, heading);
    let versions = null;
    try {
      const list = await invoke(A, 'version.list', {});
      versions = (list.versions ?? list).slice?.(-3)?.map((v) => ({ n: v.n, author: v.author, revision: v.revision })) ?? list;
    } catch (error) {
      versions = { error: error instanceof Error ? error.message : String(error) };
    }
    row('realtime.agent.write-announced', {
      writeStatus: written.status,
      writeMs: ms(t0),
      textInAMs: textInA,
      bannerInAMs: banner,
      snackbar,
      headingAfterUndo: afterUndo,
      agentWriteKeptAfterUndo: (afterUndo ?? '').includes('Written by the agent'),
      versions,
      pass: written.status === 200 && banner !== null && banner <= 1000 && (afterUndo ?? '').includes('Written by the agent'),
      load: loadavg(),
    });
  }

  // ---- realtime.departed-guest.name-stable: B names itself, comments and leaves; A reloads three times
  if (wants('guest')) {
    await A.keyboard.press('Escape');
    const named = await invoke(B, 'account.setName', { name: 'Maya Guest' });
    say('guest.setName', named);
    const bPrincipal = (await state(B)).presence?.self?.principalId ?? null;
    const headingBlock = heading.split('/')[0];
    const slideId = (await state(B)).slideId;
    let listed = null;
    try {
      listed = await invoke(B, 'comment.list', {});
    } catch {
      listed = null;
    }
    const commentsRevision = listed?.revision ?? 0;
    let added = null;
    try {
      added = await invoke(B, 'comment.add', {
        anchor: { kind: 'block', slideId, blockId: headingBlock },
        body: { text: 'A guest was here', mentions: [] },
        baseRevision: commentsRevision,
      });
    } catch (error) {
      added = { error: error instanceof Error ? error.message : String(error) };
    }
    say('guest.comment', { bPrincipal, added: added?.thread?.id ?? added });
    await sleep(800);
    await B.context().close().catch(() => undefined);
    B = null;
    const reloads = [];
    for (let i = 0; i < 3; i += 1) {
      const t0 = performance.now();
      await A.reload();
      await waitEditor(A);
      await dismissPrompt(A);
      const slot = A.locator('[data-control="title.comments.slot"] button').first();
      if ((await slot.count()) > 0) await slot.click();
      else await ctl(A, 'title.comments').click();
      await ctl(A, 'panel.comments').waitFor({ timeout: 8000 });
      const read = await poll(async () => {
        const text = await A.evaluate((principal) => {
          const rows = [...document.querySelectorAll('[data-control^="panel.comments.thread."]')];
          const mine = rows.find((r) => principal === null || r.querySelector(`.ts-chip[data-principal="${principal}"]`) !== null) ?? rows[0];
          return mine ? mine.textContent?.replace(/\s+/g, ' ').trim() : null;
        }, bPrincipal);
        return text && /Maya Guest/.test(text) ? { at: ms(t0), text } : null;
      }, 6000, 50);
      const sync = await invoke(A, 'sync.status');
      reloads.push({ reload: i + 1, readMs: read?.at ?? null, rowText: read?.text ?? null, guestWord: /guest/i.test(read?.text ?? ''), instance: new URL(BASE_A).port, tier: sync.tier });
      if (i === 0) say('shot.guest.A', await shot(A, 'r1-07-a-departed-guest-row'));
      await A.keyboard.press('Escape');
    }
    row('realtime.departed-guest.name-stable', {
      reloads,
      pass: reloads.every((r) => r.readMs !== null && r.readMs <= 3000 && r.guestWord),
      load: loadavg(),
    });
  }
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'r1-A-error.png') }).catch(() => {});
  if (B) await B.screenshot({ path: join(OUT, 'r1-B-error.png') }).catch(() => {});
} finally {
  const statsAfter = redisCommandStats();
  facts.redis = {
    before: statsBefore.total,
    after: statsAfter.total,
    commandsDuringDrive: statsBefore.total !== null && statsAfter.total !== null ? statsAfter.total - statsBefore.total : null,
    byCommand: statsAfter.rows
      ? Object.fromEntries(Object.entries(statsAfter.rows).map(([k, v]) => [k, v - (statsBefore.rows?.[k] ?? 0)]).filter(([, v]) => v > 0))
      : null,
  };
  say('redis', facts.redis);
  await browser.close().catch(() => {});
  if (deckId) {
    const info = await post(BASE_A, 'deck.info', deckId, {});
    let rev = info.json?.revision;
    const trash = await post(BASE_A, 'deck.trash', deckId, { id: deckId, baseRevision: rev });
    const info2 = await post(BASE_B, 'deck.info', deckId, {});
    rev = info2.json?.revision ?? rev;
    const remove = await post(BASE_B, 'deck.remove', deckId, { id: deckId, confirm: true, baseRevision: rev });
    const gone = await fetch(`${BASE_A}/edit/${deckId}`, { redirect: 'manual' });
    say('teardown', { trash: trash.status, remove: remove.status, editStatusAfter: gone.status });
  }
  facts.rows = rows;
  facts.loadAtEnd = loadavg();
  facts.finishedAt = new Date().toISOString();
  const suffix = ROWS.size === 0 ? '' : `-${[...ROWS].join('-')}`;
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  writeFileSync(join(OUT, `facts${suffix}-${stamp}.json`), JSON.stringify(facts, null, 2));
}

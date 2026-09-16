#!/usr/bin/env node
// The sync stress probe (gslides-parity SPEC-5-amendments A3 item 7; B7). Google Slides is the
// reference: a single user never sees a revision conflict, no keystroke is lost, the saved state
// is confirmed within about a second, and two tabs converge on one document. The probe drives
// the product's own UI with headless Chromium and asserts, in order:
//
//   1. fifty rapid edits in one tab, each acknowledged at exactly the next revision with no stale
//      message anywhere and no lost character, then one fast burst that lands whole;
//   2. two tabs of the same person alternating edits, both converging to one document and one
//      revision, with the propagation time of every edit recorded;
//   3. the presence rows exactly right in both tabs: the two tabs are one person (the second
//      context shares the first's cookies), so under A3 item 5's self filter by client id and by
//      principal id neither lists the other and neither draws a chip, an outline, a caret or a
//      flag, and each roster is one self row; then another person in a third context is exactly
//      one other in the first tab and sees the two tabs as two others, and leaves cleanly (on the
//      blob tier through the shared roster of A8 row 4);
//   4. a reload in the middle of a burst, after which nothing typed is lost (the pending mirror
//      replays from IndexedDB where the write had not left the tab);
//   5. a five second offline window, after which the pending ops replay and both tabs converge;
//   6. the final convergence of both tabs (revision, server revision, document text).
//
// Every number (acknowledgement latency per edit, propagation latency per round, the time to
// converge after the offline window, the stale message count, the lost character count) is
// printed and written to --json. Against BASE (main at d5a1be5) the failures are the baseline
// A3 item 1 to 6 are built against, not a blocker; from B7's day 3 the probe is check step 37 on
// the node-server build and the hosted smoke runs it against the preview with two contexts.
//
//   node scripts/probes/sync-stress-probe.mjs [--base http://localhost:4358] [--json <path>]
//                                             [--edits 50] [--rounds 10] [--quick]
//
// VERCEL_OIDC_TOKEN, when set, rides as x-vercel-trusted-oidc-idp-token. The caller holds
// .turboslide/e2e.lock. The deck is trashed and deleted forever in a finally block. Exit 1 when a
// step fails. A step the probe cannot drive is recorded as not driven, never as passed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

// ---------------------------------------------------------------------------------------------
// arguments

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = arg('base', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4358').replace(
  /\/$/,
  '',
);
const JSON_OUT = arg('json', null);
const QUICK = flag('quick');
const EDITS = Number(arg('edits', QUICK ? '12' : '50'));
const ROUNDS = Number(arg('rounds', QUICK ? '4' : '10'));
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const numbers = {};
let failures = 0;
let notDriven = 0;
const startedAt = Date.now();
const record = (step, expected, observed, ok) => {
  const row = { n: rows.length + 1, step, expected, observed: String(observed), ok };
  rows.push(row);
  if (ok === false) failures += 1;
  if (ok === null) notDriven += 1;
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed}`,
  );
};
const step = async (name, expected, fn) => {
  try {
    const r = await fn();
    record(name, expected, r.observed, r.ok);
    return r;
  } catch (error) {
    record(
      name,
      expected,
      `error: ${error instanceof Error ? error.message : String(error)}`,
      false,
    );
    return { ok: false, observed: 'error' };
  }
};
const skip = (name, expected, why) => record(name, expected, `not driven: ${why}`, null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (values) => {
  if (values.length === 0) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    mean: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted[sorted.length - 1],
  };
};

// ---------------------------------------------------------------------------------------------
// the product

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const pollUntil = async (read, test, timeout = 15_000, every = 100) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
/** Nothing pending or retained on this tab. */
const settled = (page, timeout = 30_000) =>
  pollUntil(
    () => state(page),
    (s) => (s.sync?.pending ?? s.pending ?? 0) === 0 && (s.sync?.retained ?? 0) === 0,
    timeout,
  );
const connected = (page, timeout = 45_000) =>
  pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    timeout,
  );
/** The revision the tab reports (describe().state.revision; the number a base check compares against). */
const revisionOf = async (page) => (await state(page)).revision;
const waitRevision = (page, want, timeout = 15_000) =>
  pollUntil(
    () => revisionOf(page),
    (r) => r >= want,
    timeout,
    60,
  );
/**
 * The title's heading as the document holds it. A no break space reads as a space: the editable
 * writes one at a run's end so the browser keeps the trailing space, and the two are one word
 * boundary to a reader (a missing space is still a lost character).
 */
const titleText = (page) =>
  invoke(page, 'slide.get', { slideId: 'title' }).then(
    (g) => String(g.slide.heading ?? '').replace(/\u00a0/g, ' '),
    () => '',
  );
/** The words a refused write puts on the state, the snackbar, a toast or the chip (A3 item 8). */
const STALE = /is stale|baseRevision|changed in the Blob store|reload and rebase|not accepted/i;
const staleWords = async (page) => {
  const s = await state(page);
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-snackbar.is-on, .pt-toast.is-on, .ts-status')]
      .map((el) => el.textContent ?? '')
      .join(' | '),
  );
  const hits = [s.error ?? '', shown].filter((text) => STALE.test(String(text)));
  return hits.length === 0 ? null : hits.join(' ; ');
};
/** The remote presence drawn in a tab: what a person sees of others. */
const remotePresence = (page) =>
  page.evaluate(() => ({
    chips: document.querySelectorAll('[data-control^="presence.chip."]').length,
    count: document.querySelector('[data-control="title.presence"]')?.getAttribute('data-count'),
    outlines: document.querySelectorAll('.ts-remote-outline').length,
    carets: document.querySelectorAll('.ts-remote-caret').length,
    pointers: document.querySelectorAll('.ts-remote-pointer-group').length,
    flags: document.querySelectorAll('.ts-flag').length,
  }));
/** The roster menu's rows and self rows; null when the menu cannot be opened. */
const rosterRows = async (page) => {
  const more = page.locator('[data-control="presence.more"]');
  if ((await more.count()) === 0) return null;
  await more.click();
  await page.locator('#ts-menu-roster').waitFor({ timeout: 5000 });
  const out = await page.evaluate(() => {
    const menu = document.getElementById('ts-menu-roster');
    const all = menu ? [...menu.querySelectorAll('[data-control^="presence.roster."]')] : [];
    return { total: all.length, self: all.filter((el) => el.classList.contains('is-self')).length };
  });
  await page.keyboard.press('Escape');
  await page.locator('#ts-menu-roster').waitFor({ state: 'detached', timeout: 5000 });
  return out;
};
const others = (page) =>
  invoke(page, 'presence.list', {}).then(
    (list) => list.others ?? [],
    () => [],
  );
const ownClientId = async (page) => (await state(page)).presence?.clientId ?? null;
/** The save words of the title row and the revision words a status chip shows, when the page draws them. */
const saveWords = (page) =>
  page.evaluate(() => {
    const save = document.querySelector('[data-control="deck.saveState"]');
    const chip = document.querySelector('[data-control="edit.status"]');
    return {
      words: save?.textContent?.trim() ?? null,
      state: save?.getAttribute('data-state') ?? null,
      chip: chip?.textContent?.trim() ?? null,
      chipRevision: chip ? Number(/r(\d+)/.exec(chip.textContent ?? '')?.[1] ?? NaN) : null,
    };
  });
/** The chord that moves the caret to the end of the whole text (End alone stops at the visual line). */
const END_OF_TEXT = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';
/** Opens the inline session on the title run with the browser's double click, caret at the end of the text. */
const openTitle = async (page) => {
  const el = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]');
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await pollUntil(
    () => el.getAttribute('contenteditable'),
    (v) => v === 'true',
    3000,
    50,
  );
  await page.keyboard.press(END_OF_TEXT);
  await page.keyboard.press('End');
  return el;
};
/** The tokens typed so far, in order; a verdict on a document text: whole, misplaced or lost. */
const typedTokens = [];
const verdict = (text, expected) => {
  if (text === expected) return 'whole';
  const lost = typedTokens.filter((token) => !text.includes(token));
  if (lost.length === 0)
    return `every token present but out of order (${text.length} of ${expected.length} chars)`;
  return `LOST ${lost.length} token(s): ${lost
    .slice(0, 6)
    .map((t) => JSON.stringify(t))
    .join(' ')}`;
};
const closeTitle = async (page) => {
  await page.keyboard.press('Escape');
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false))
    await page
      .locator('[data-control="dialog.namePrompt.close"]')
      .click()
      .catch(() => undefined);
};
/** Waits until a tab's document title contains a token. */
const sees = (page, token, timeout = 15_000) =>
  pollUntil(
    () => titleText(page),
    (t) => t.includes(token),
    timeout,
    80,
  );
const consistent = async (page) => {
  const s = await state(page);
  return {
    revision: s.revision,
    serverRevision: s.serverRevision,
    document: s.documentRevision ?? s.sync?.revision,
    pending: s.sync?.pending ?? s.pending ?? 0,
    retained: s.sync?.retained ?? 0,
    tier: s.sync?.tier,
  };
};

// ---------------------------------------------------------------------------------------------
// the run

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
const A = await context.newPage();
A.on('pageerror', (error) => console.log(`page error (A): ${String(error).slice(0, 200)}`));
let B = null;
let shared = null;
let deckId = '';
let tier = 'memory';
let expectedTitle = '';

try {
  // 0. the deck: /new, the title, the first write
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  deckId = (await invoke(A, 'deck.info')).id;
  await openTitle(A);
  await A.keyboard.type('Q4 review', { delay: 25 });
  expectedTitle = 'Q4 review';
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  const first = await connected(A);
  tier = first.sync?.tier ?? 'memory';
  numbers.tier = tier;
  numbers.deckId = deckId;
  await waitRevision(A, 1);
  await step(
    'the first write created the deck and attached the room',
    '/edit/<id>, connected, revision 1',
    async () => {
      const s = await settled(A);
      return {
        ok: /\/edit\//.test(A.url()) && s.sync?.connected === true && s.revision === 1,
        observed: `${A.url().replace(BASE, '')}, connected ${s.sync?.connected}, revision ${s.revision}, tier ${tier}`,
      };
    },
  );

  // 1. fifty rapid edits, each its own write, each acknowledged at exactly the next revision
  const ackMs = [];
  let exact = 0;
  let stale = [];
  let overshoot = 0;
  let revision = await revisionOf(A);
  for (let i = 1; i <= EDITS; i += 1) {
    const token = ` e${i}`;
    await A.keyboard.type(token, { delay: 20 });
    expectedTitle += token;
    typedTokens.push(token);
    const typedAt = Date.now();
    const want = revision + 1;
    const got = await waitRevision(A, want, 10_000);
    ackMs.push(Date.now() - typedAt);
    if (got === want) exact += 1;
    else if (got > want) overshoot += 1;
    const words = await staleWords(A);
    if (words !== null) stale.push(`edit ${i}: ${words}`);
    revision = got;
    // past the 100 ms typing burst, so the next token is its own write
    await sleep(Math.max(0, 450 - (Date.now() - typedAt)));
  }
  await closeTitle(A);
  const afterEdits = await settled(A);
  const titleAfterEdits = await titleText(A);
  numbers.edits = {
    count: EDITS,
    exactNextRevision: exact,
    overshoot,
    stale: stale.length,
    ackMs: stats(ackMs),
    finalRevision: afterEdits.revision,
    serverRevision: afterEdits.serverRevision,
  };
  await step(
    `${EDITS} rapid edits were each acknowledged at exactly the next revision (A3 item 1, 4)`,
    `${EDITS} of ${EDITS} exact, revision ${1 + EDITS}`,
    async () => ({
      ok: exact === EDITS && afterEdits.revision === 1 + EDITS,
      observed: `${exact} exact, ${overshoot} overshot, revision ${afterEdits.revision}, ack ms ${JSON.stringify(stats(ackMs))}`,
    }),
  );
  await step(
    'no stale message in the state, the snackbar, a toast or the chip across the edits (A3 item 8)',
    'none',
    async () => ({
      ok: stale.length === 0,
      observed: stale.length === 0 ? 'none' : stale.slice(0, 3).join(' | '),
    }),
  );
  await step(
    'no character was lost across the edits',
    JSON.stringify(expectedTitle.slice(-24)),
    async () => ({
      ok: titleAfterEdits === expectedTitle,
      observed:
        titleAfterEdits === expectedTitle
          ? 'the document holds every token'
          : JSON.stringify(titleAfterEdits.slice(-40)),
    }),
  );
  await step(
    'the revision the tab reports equals the server revision and nothing is pending',
    'equal, 0 pending',
    async () => {
      const c = await consistent(A);
      return {
        ok: c.revision === c.serverRevision && c.pending === 0 && c.retained === 0,
        observed: JSON.stringify(c),
      };
    },
  );
  await step(
    'the save words read saved and the revision words, when drawn, never sit behind the server (A3 item 4)',
    'All changes saved; a chip revision equal to the server revision or no chip',
    async () => {
      const words = await saveWords(A);
      const c = await consistent(A);
      numbers.saveWords = { ...words, serverRevision: c.serverRevision };
      const chipOk =
        words.chip === null ||
        (Number.isFinite(words.chipRevision) && words.chipRevision === c.serverRevision);
      return {
        ok: words.state === 'saved' && chipOk,
        observed: JSON.stringify(numbers.saveWords),
      };
    },
  );

  // 1b. one fast burst: forty characters at 20 ms, no pauses; the burst lands whole
  await openTitle(A);
  const burst = ' burst-' + 'abcdefghijklmnopqrstuvwxyz0123456'.slice(0, 33);
  const burstFrom = await revisionOf(A);
  const burstAt = Date.now();
  await A.keyboard.type(burst, { delay: 20 });
  expectedTitle += burst;
  typedTokens.push(burst);
  await closeTitle(A);
  const afterBurst = await settled(A);
  const burstMs = Date.now() - burstAt;
  const titleAfterBurst = await titleText(A);
  numbers.burst = { chars: burst.length, ms: burstMs, revisions: afterBurst.revision - burstFrom };
  await step(
    'a fast burst of 40 characters landed whole and settled',
    'every character, pending 0',
    async () => ({
      ok: titleAfterBurst === expectedTitle && (afterBurst.sync?.pending ?? 0) === 0,
      observed: `${afterBurst.revision - burstFrom} write(s) in ${burstMs} ms, pending ${afterBurst.sync?.pending}, ${verdict(titleAfterBurst, expectedTitle)}`,
    }),
  );

  // 2. two tabs of the same person alternating edits
  shared = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders,
    storageState: await context.storageState(),
  });
  B = await shared.newPage();
  B.on('pageerror', (error) => console.log(`page error (B): ${String(error).slice(0, 200)}`));
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  await connected(B);
  await sleep(800);
  const propagateMs = [];
  let missed = 0;
  let staleTwoTabs = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const [page, who] of [
      [A, 'a'],
      [B, 'b'],
    ]) {
      const other = page === A ? B : A;
      await openTitle(page);
      const token = ` ${who}${round}`;
      await page.keyboard.type(token, { delay: 20 });
      expectedTitle += token;
      typedTokens.push(token);
      const typedAt = Date.now();
      await closeTitle(page);
      await settled(page, 15_000);
      const seen = await sees(other, token, 15_000);
      const ms = Date.now() - typedAt;
      if (seen.includes(token)) propagateMs.push(ms);
      else missed += 1;
      const words = (await staleWords(page)) ?? (await staleWords(other));
      if (words !== null) staleTwoTabs.push(`round ${round} ${who}: ${words}`);
    }
  }
  await settled(A, 15_000);
  await settled(B, 15_000);
  const cA = await consistent(A);
  const cB = await consistent(B);
  const tA = await titleText(A);
  const tB = await titleText(B);
  numbers.twoTabs = {
    rounds: ROUNDS,
    propagateMs: stats(propagateMs),
    missed,
    stale: staleTwoTabs.length,
    a: cA,
    b: cB,
    equalText: tA === tB,
    expectedText: tA === expectedTitle,
  };
  await step(
    `two tabs alternating ${ROUNDS} rounds converged to one document (A3 item 3)`,
    'same text in both tabs, every token present',
    async () => ({
      ok: tA === tB && tA === expectedTitle && missed === 0,
      observed: `${missed} propagation miss(es), propagate ms ${JSON.stringify(stats(propagateMs))}, texts ${tA === tB ? 'equal' : 'DIFFER'}, A ${verdict(tA, expectedTitle)}`,
    }),
  );
  await step(
    'two tabs converged to one revision',
    'A revision = B revision = server revision',
    async () => ({
      ok:
        cA.revision === cB.revision &&
        cA.revision === cA.serverRevision &&
        cB.revision === cB.serverRevision &&
        cA.pending === 0 &&
        cB.pending === 0,
      observed: `A ${JSON.stringify(cA)}, B ${JSON.stringify(cB)}`,
    }),
  );
  await step('no stale message in either tab while alternating', 'none', async () => ({
    ok: staleTwoTabs.length === 0,
    observed: staleTwoTabs.length === 0 ? 'none' : staleTwoTabs.slice(0, 3).join(' | '),
  }));

  // 3. presence exactly right in both tabs (A3 item 5): one person, two tabs, so the self filter
  // by client id and by principal id leaves neither tab anyone to draw
  const selfA = await ownClientId(A);
  const selfB = await ownClientId(B);
  const principalA = (await state(A)).presence?.self?.principalId ?? null;
  const principalB = (await state(B)).presence?.self?.principalId ?? null;
  // give a presence round trip time to settle on both instances before the read
  await sleep(1200);
  const presence = await pollUntil(
    async () => ({
      a: await others(A),
      b: await others(B),
      domA: await remotePresence(A),
      domB: await remotePresence(B),
    }),
    (v) => v.a.length === 0 && v.b.length === 0 && v.domA.chips === 0 && v.domB.chips === 0,
    20_000,
    250,
  );
  const rosterA = await rosterRows(A).catch(() => null);
  const rosterB = await rosterRows(B).catch(() => null);
  numbers.presence = {
    a: presence.a.map((p) => `${p.clientId.slice(0, 8)}:${p.principalId?.slice(0, 12)}`),
    b: presence.b.map((p) => `${p.clientId.slice(0, 8)}:${p.principalId?.slice(0, 12)}`),
    selfA,
    selfB,
    samePrincipal: principalA !== null && principalA === principalB,
    domA: presence.domA,
    domB: presence.domB,
    rosterA,
    rosterB,
  };
  const noSelf =
    presence.a.every((p) => p.clientId !== selfA) && presence.b.every((p) => p.clientId !== selfB);
  const nobodyDrawn =
    presence.domA.chips === 0 &&
    presence.domB.chips === 0 &&
    presence.domA.outlines === 0 &&
    presence.domB.outlines === 0 &&
    presence.domA.carets === 0 &&
    presence.domB.carets === 0 &&
    presence.domA.flags === 0 &&
    presence.domB.flags === 0;
  await step(
    'neither tab lists itself as a collaborator (A3 item 5)',
    'no self row among the others in either tab',
    async () => ({ ok: noSelf, observed: JSON.stringify(numbers.presence) }),
  );
  await step(
    'one person in two tabs sees nobody: the self filter by principal id on every surface (A3 item 5)',
    'A others = [], B others = [], no chip, outline, caret or flag in either tab',
    async () => ({
      ok: presence.a.length === 0 && presence.b.length === 0 && nobodyDrawn,
      observed: JSON.stringify(numbers.presence),
    }),
  );
  if (rosterA === null || rosterB === null) {
    skip(
      'the roster menu shows one row, the self row, in each tab',
      '1 row, 1 self',
      'the roster menu control was not found',
    );
  } else {
    await step(
      'the roster menu shows one row, the self row, in each tab',
      '1 row, 1 self',
      async () => ({
        ok: rosterA.total === 1 && rosterA.self === 1 && rosterB.total === 1 && rosterB.self === 1,
        observed: `A ${JSON.stringify(rosterA)}, B ${JSON.stringify(rosterB)}`,
      }),
    );
  }

  // 3b. another person (a third context with its own cookies): the rows are exactly right across
  // people and, on the blob tier, across instances (A8 row 4, the shared roster): A lists that
  // person once, that person lists A's two tabs, and A forgets the person once they left
  const stranger = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders,
  });
  const C = await stranger.newPage();
  C.on('pageerror', (error) => console.log(`page error (C): ${String(error).slice(0, 200)}`));
  await C.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(C);
  await connected(C);
  const selfC = await ownClientId(C);
  // the person's own row arrives with the echo of their first presence post
  const principalC = await pollUntil(
    async () => (await state(C)).presence?.self?.principalId ?? null,
    (id) => id !== null,
    10_000,
    200,
  );
  const withStranger = await pollUntil(
    async () => ({ a: await others(A), c: await others(C), domA: await remotePresence(A) }),
    (v) => v.a.length === 1 && v.a[0]?.clientId === selfC && v.c.length === 2 && v.domA.chips === 1,
    tier === 'blob' ? 30_000 : 20_000,
    250,
  );
  numbers.stranger = {
    selfC,
    differentPrincipal: principalC !== null && principalC !== principalA,
    a: withStranger.a.map((p) => `${p.clientId.slice(0, 8)}:${p.principalId?.slice(0, 12)}`),
    c: withStranger.c.map((p) => `${p.clientId.slice(0, 8)}:${p.principalId?.slice(0, 12)}`),
    domA: withStranger.domA,
  };
  await step(
    'another person is exactly one other in A, and A’s two tabs are two others for them (A3 item 5; A8 row 4)',
    'A others = [C], C others = [A, B], one chip in A',
    async () => ({
      ok:
        principalC !== principalA &&
        withStranger.a.length === 1 &&
        withStranger.a[0]?.clientId === selfC &&
        withStranger.c.length === 2 &&
        withStranger.c.every((p) => p.clientId === selfA || p.clientId === selfB) &&
        withStranger.domA.chips === 1,
      observed: JSON.stringify(numbers.stranger),
    }),
  );
  await C.close({ runBeforeUnload: true }).catch(() => undefined);
  await stranger.close();
  const leftAt = Date.now();
  const afterLeft = await pollUntil(
    async () => ({ a: await others(A), domA: await remotePresence(A) }),
    (v) => v.a.length === 0 && v.domA.chips === 0,
    tier === 'blob' ? 30_000 : 20_000,
    250,
  );
  numbers.stranger.forgotMs = Date.now() - leftAt;
  await step(
    'A forgets the person once they left (A8 row 4: the leave reaches every instance)',
    'A others = [], no chip',
    async () => ({
      ok: afterLeft.a.length === 0 && afterLeft.domA.chips === 0,
      observed: `others ${afterLeft.a.length}, chips ${afterLeft.domA.chips}, ${numbers.stranger.forgotMs} ms`,
    }),
  );

  // 4. a reload in the middle of a burst (A3 item 7): nothing typed is lost
  await openTitle(A);
  const mid = ' reload-' + '0123456789abcdefghijklmnop';
  await A.keyboard.type(mid, { delay: 15 });
  expectedTitle += mid;
  typedTokens.push(mid);
  // the reload leaves at once: the last keystrokes sit inside the editable's 100 ms typing burst
  // or in the room's pending queue, which is the case the pending mirror exists for
  const reloadAt = Date.now();
  const beforeReload = await state(A).catch(() => null);
  const pendingAtReload = beforeReload?.sync?.pending ?? beforeReload?.pending ?? 'unread';
  const clientBeforeReload = beforeReload?.presence?.clientId ?? selfA;
  await A.reload({ waitUntil: 'domcontentloaded' });
  await editorReady(A);
  await connected(A);
  // the pending mirror's offer, when the burst had not left the tab
  const plate = A.locator('[data-control="sync.persisted"]');
  let replayed = 'nothing to replay';
  if (await plate.isVisible({ timeout: 4000 }).catch(() => false)) {
    const text = await plate.textContent();
    await A.locator('[data-control="sync.persisted.apply"]').click();
    replayed = `applied the mirror: ${(text ?? '').trim()}`;
  }
  const afterReload = await pollUntil(
    () => titleText(A),
    (t) => t === expectedTitle,
    15_000,
    100,
  );
  await settled(A, 15_000);
  const reloadMs = Date.now() - reloadAt;
  const seenByB = await sees(B, mid, 15_000);
  numbers.reload = {
    pendingAtReload,
    replayed,
    ms: reloadMs,
    complete: afterReload === expectedTitle,
    bSees: seenByB.includes(mid),
  };
  await step(
    'a reload in the middle of a burst lost nothing (A3 item 7)',
    'the document holds the whole burst after the reload',
    async () => ({
      ok: afterReload === expectedTitle && seenByB.includes(mid),
      observed: `pending at reload ${pendingAtReload}, ${replayed}, ${verdict(afterReload, expectedTitle)}, B ${seenByB.includes(mid) ? 'converged' : 'did not converge'}, ${reloadMs} ms`,
    }),
  );
  await step(
    'after the reload the tab keeps its client id and draws nobody (A3 item 5)',
    'the same client id as before the reload; A others = [], no ghost of an earlier id',
    async () => {
      const selfA2 = await pollUntil(
        () => ownClientId(A),
        (id) => id !== null,
        10_000,
        200,
      );
      await sleep(1000);
      const v = await pollUntil(
        async () => ({ a: await others(A), dom: await remotePresence(A) }),
        (x) => x.a.length === 0 && x.dom.chips === 0,
        10_000,
        250,
      );
      numbers.reload.clientKept = selfA2 === clientBeforeReload;
      return {
        ok:
          selfA2 === clientBeforeReload &&
          v.a.length === 0 &&
          v.dom.chips === 0 &&
          v.dom.outlines === 0 &&
          v.dom.carets === 0,
        observed: `client ${clientBeforeReload?.slice(0, 8)} then ${selfA2?.slice(0, 8)} (${selfA2 === clientBeforeReload ? 'kept' : 'CHANGED'}), others ${JSON.stringify(v.a.map((p) => p.clientId.slice(0, 8)))}, dom ${JSON.stringify(v.dom)}`,
      };
    },
  );

  // 5. a five second offline window (A3 item 7): the pending mirror replays and converges
  await openTitle(A);
  await context.setOffline(true);
  const offlineAt = Date.now();
  const offlineToken = ' offline-';
  await A.keyboard.type(offlineToken, { delay: 40 });
  let offlineTyped = offlineToken;
  while (Date.now() - offlineAt < 5000) {
    const ch = String.fromCharCode(97 + (offlineTyped.length % 26));
    await A.keyboard.type(ch, { delay: 0 });
    offlineTyped += ch;
    await sleep(180);
  }
  expectedTitle += offlineTyped;
  typedTokens.push(offlineTyped);
  const duringOffline = await state(A);
  await closeTitle(A);
  await context.setOffline(false);
  const onlineAt = Date.now();
  const afterOffline = await pollUntil(
    () => state(A),
    (s) =>
      (s.sync?.pending ?? 0) === 0 &&
      s.sync?.connected === true &&
      (s.sync?.offline ?? false) === false,
    40_000,
    150,
  );
  const convergeMs = Date.now() - onlineAt;
  const titleAfterOffline = await pollUntil(
    () => titleText(A),
    (t) => t === expectedTitle,
    10_000,
    100,
  );
  const bAfterOffline = await sees(B, offlineTyped, 20_000);
  const staleOffline = await staleWords(A);
  numbers.offline = {
    typed: offlineTyped.length,
    pendingWhileOffline: duringOffline.sync?.pending ?? duringOffline.pending,
    connectedWhileOffline: duringOffline.sync?.connected,
    offlineWordWhileOffline: duringOffline.sync?.offline ?? null,
    saveWordsWhileOffline: (await saveWords(A).catch(() => null))?.state ?? null,
    convergeMs,
    complete: titleAfterOffline === expectedTitle,
    bSees: bAfterOffline.includes(offlineTyped),
    stale: staleOffline,
  };
  await step(
    'a five second offline window replayed every pending op and converged (A3 item 7)',
    'pending 0 after reconnect, every character in both tabs, no stale message',
    async () => ({
      ok:
        (afterOffline.sync?.pending ?? 1) === 0 &&
        titleAfterOffline === expectedTitle &&
        bAfterOffline.includes(offlineTyped) &&
        staleOffline === null,
      observed: `${offlineTyped.length} chars typed offline (pending ${duringOffline.sync?.pending}, connected ${duringOffline.sync?.connected}), converged in ${convergeMs} ms, pending ${afterOffline.sync?.pending}, ${verdict(titleAfterOffline, expectedTitle)}, B ${bAfterOffline.includes(offlineTyped) ? 'converged' : 'did not converge'}${staleOffline ? `, stale: ${staleOffline}` : ''}`,
    }),
  );

  // 6. the final convergence
  await settled(A, 15_000);
  await settled(B, 15_000);
  const fA = await consistent(A);
  const fB = await consistent(B);
  const ftA = await titleText(A);
  const ftB = await titleText(B);
  numbers.final = {
    a: fA,
    b: fB,
    equalText: ftA === ftB,
    complete: ftA === expectedTitle,
    titleLength: ftA.length,
    rebased: {
      a: (await state(A)).sync?.rebased ?? null,
      b: (await state(B)).sync?.rebased ?? null,
    },
  };
  await step(
    'both tabs end on one document and one revision (A3 item 3)',
    'equal revisions, equal text, nothing pending',
    async () => ({
      ok:
        fA.revision === fB.revision &&
        fA.revision === fA.serverRevision &&
        fB.revision === fB.serverRevision &&
        ftA === ftB &&
        ftA === expectedTitle &&
        fA.pending === 0 &&
        fB.pending === 0,
      observed: `A ${JSON.stringify(fA)}, B ${JSON.stringify(fB)}, text ${ftA === ftB ? 'equal' : 'DIFFER'}, A ${verdict(ftA, expectedTitle)} (${ftA.length} chars)`,
    }),
  );
} catch (error) {
  record(
    'the probe ran to completion',
    'no exception',
    error instanceof Error ? `${error.message}` : String(error),
    false,
  );
} finally {
  // the deck leaves the store: close B, bring A to the head, File > Move to trash, Delete forever
  try {
    if (B) await B.close({ runBeforeUnload: true }).catch(() => undefined);
    if (shared) await shared.close().catch(() => undefined);
    if (deckId) {
      await context.setOffline(false).catch(() => undefined);
      await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(A);
      await connected(A);
      await settled(A, 15_000);
      await A.locator('[data-control="menubar.file"]').click();
      await A.locator('[data-control="menu.file.moveToTrash"]').click();
      await A.waitForURL(/\/decks$/, { timeout: 20_000 });
      await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = A.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await A.locator(`[data-control="trash.delete.${deckId}"]`).click();
      await A.locator('[data-control="trash.confirm.ok"]').click();
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record(
        'the deck was trashed and deleted forever',
        'File > Move to trash, Delete forever',
        deckId,
        true,
      );
      deckId = '';
    }
  } catch (error) {
    record(
      'the deck was trashed and deleted forever',
      'File > Move to trash, Delete forever',
      `cleanup failed: ${error instanceof Error ? error.message : String(error)}; deck ${deckId} may remain`,
      false,
    );
    if (deckId) {
      try {
        const info = await invoke(A, 'deck.info').catch(() => null);
        if (info) {
          await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
          const t = await invoke(A, 'deck.info').catch(() => null);
          await invoke(A, 'deck.remove', {
            id: deckId,
            confirm: true,
            baseRevision: t?.revision ?? 0,
          }).catch(() => undefined);
        }
      } catch {
        // nothing more to do
      }
    }
  }
  await browser.close();
  const summary = {
    base: BASE,
    startedAt: new Date(startedAt).toISOString(),
    seconds: Math.round((Date.now() - startedAt) / 1000),
    steps: rows.length,
    ok: rows.filter((r) => r.ok === true).length,
    failed: failures,
    notDriven,
    numbers,
    rows,
  };
  if (JSON_OUT) {
    mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  }
  console.log(`\nnumbers: ${JSON.stringify(numbers)}`);
  console.log(
    `\nsync-stress-probe: ${rows.length} steps, ${summary.ok} ok, ${failures} failed, ${notDriven} not driven, ${summary.seconds} s against ${BASE}${JSON_OUT ? `; table ${JSON_OUT}` : ''}`,
  );
}
process.exit(failures === 0 ? 0 : 1);

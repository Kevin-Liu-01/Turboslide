// R3's two browser drive of the realtime round (docs/REALTIME.md 2, 5.1 lane R3; build/r3.md):
// two anonymous people on one deck made from /new on R3's dev server (the memory tier), A the
// owner and B an editor admitted by the link `share.setGeneralAccess` opened. It reads the rows
// `realtime.follow.for-everyone` (Follow in the default view for both, the stage within 1 s, the
// plate, the six end triggers), `realtime.card.chip-painted` (B's chip on A's card 2 in the DOM and
// in the pixels) and R3's reading of `realtime.agent.write-announced` (a checkout agent's write
// through POST /api/actions with x-turboslide-author, the banner in A's tab, Cmd+Z leaving it).
// Pictures and facts land under --out; the deck lives in the tmp store of R3's server and is
// trashed and removed by id at the end. No bearer is needed on a localhost server with
// TURBOSLIDE_LOCAL_OPEN=1 (a request with no cookie and no authorization header is the checkout
// agent, server/actions.ts isCheckoutAgent). Run from the repository root:
//   node docs/gslides-parity/realtime/build/r3/drive.mjs --base http://localhost:4473 \
//     --out docs/gslides-parity/realtime/build/r3/after --appearance light
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = '/Users/kevinliu/repos/Turboslide-realtime';
const { chromium } = require(`${ROOT}/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright`);
const sharp = require(`${ROOT}/node_modules/sharp`);

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4473');
const APPEARANCE = arg('appearance', 'light');
/* --advanced turns Tools > Advanced tools on in both browsers through the shell's stored settings
   (editor-shell.ts SETTINGS_STORAGE), for a run on a tree where `title.presence.follow` still
   carries `advanced: true` (the integrator's request 1 in build/r3.md); the run of record is
   without it */
const ADVANCED = argv.includes('--advanced');
const OUT = arg('out', `${ROOT}/docs/gslides-parity/realtime/build/r3/run`);
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 60;

const facts = { startedAt: new Date().toISOString(), base: BASE, appearance: APPEARANCE, advancedTools: ADVANCED, rows: {} };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const row = (id, reading) => {
  facts.rows[id] = { ...(facts.rows[id] ?? {}), ...reading };
  console.log(`row ${id}: ${JSON.stringify(reading)}`);
};
const ms = (from) => Math.round(performance.now() - from);
const load = () => {
  try {
    return require('node:os').loadavg().map((n) => Math.round(n * 100) / 100);
  } catch {
    return null;
  }
};

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i ?? {}), [action, input]);

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
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}

const runsOf = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => ({ run: el.getAttribute('data-run') ?? '', text: el.textContent ?? '' })),
  );
const runEl = (page, run) =>
  page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();

async function shot(page, name, clip) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return `${name}.png`;
}

async function typeInto(page, run, text, { replace = true } = {}) {
  await runEl(page, run).dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press(replace ? 'Meta+a' : 'End');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.keyboard.press('Escape');
}

async function slideOrder(page) {
  const list = await invoke(page, 'slide.list', {});
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
}

async function clickCard(page, slideId) {
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await poll(async () => (await state(page)).slideId === slideId, 8000);
}

async function ownClientId(page) {
  await poll(async () => /^[0-9a-f]{32}$/.test((await state(page)).presence?.clientId ?? ''), 15_000);
  return (await state(page)).presence.clientId;
}

const following = async (page) => (await state(page)).presence?.following ?? null;

/** Opens the roster from the people button (or the chip while the button takes no pointer) and answers the row of `clientId`. */
async function openRoster(page, clientId) {
  const more = ctl(page, 'presence.more');
  const takesPointer = await more
    .evaluate(
      (el) =>
        !el.classList.contains('is-empty') &&
        getComputedStyle(el).pointerEvents !== 'none' &&
        getComputedStyle(el).opacity !== '0',
    )
    .catch(() => false);
  if (takesPointer) await more.click({ timeout: 5000 });
  else await ctl(page, `presence.chip.${clientId}`).click();
  const rowEl = page.locator(`[data-control="presence.roster.${clientId}"]`).first();
  await rowEl.waitFor({ timeout: 5000 }).catch(() => undefined);
  const shown = await rowEl.isVisible().catch(() => false);
  return {
    row: rowEl,
    shown,
    item: shown ? await rowEl.getAttribute('data-menu-item') : null,
    text: shown ? ((await rowEl.textContent()) ?? '').trim() : '',
    act: shown ? ((await rowEl.locator('.ts-roster-act').textContent().catch(() => '')) ?? '').trim() : '',
  };
}

/** Follows `clientId` from the roster; answers the roster reading and whether the follow took. */
async function followFromRoster(page, clientId, shotName) {
  const r = await openRoster(page, clientId);
  if (shotName) await shot(page, shotName);
  const offered = r.item === 'title.presence.follow' || /^Follow$/.test(r.act);
  if (r.shown && offered) await r.row.click();
  else await page.keyboard.press('Escape');
  const took = offered
    ? Boolean(await poll(async () => (await following(page)) === clientId, 3000))
    : false;
  return { ...r, offered, took };
}

const plateText = (page) =>
  page
    .locator('[data-control="presence.following"]')
    .first()
    .textContent()
    .catch(() => null);

/** The card's marks box and the pixel difference between the marks drawn and the marks hidden. */
async function cardChipPixels(page, slideId, name) {
  const box = await page.evaluate((id) => {
    const card = document.querySelector(`[data-control="filmstrip.slide.${id}"]`);
    const marks = card?.querySelector('.ts-card-marks');
    if (!card || !marks) return null;
    const r = marks.getBoundingClientRect();
    const f = card.querySelector('.ts-card-frame')?.getBoundingClientRect() ?? r;
    return {
      marks: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      frame: [Math.round(f.left), Math.round(f.top), Math.round(f.width), Math.round(f.height)],
      count: marks.getAttribute('data-count'),
      zIndex: getComputedStyle(marks).zIndex,
      thumbIsolation: (() => {
        const t = card.querySelector('.ts-thumb');
        return t ? getComputedStyle(t).isolation : null;
      })(),
    };
  }, slideId);
  if (!box) return { box: null };
  const clip = { x: box.marks[0] - 2, y: box.marks[1] - 2, width: box.marks[2] + 4, height: box.marks[3] + 4 };
  const drawn = await page.screenshot({ clip });
  const style = await page.addStyleTag({ content: '.ts-card-marks { visibility: hidden !important }' });
  await page.waitForTimeout(120);
  const hidden = await page.screenshot({ clip });
  await style.evaluate((el) => el.remove());
  await page.waitForTimeout(120);
  const a = await sharp(drawn).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(hidden).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let differing = 0;
  const n = Math.min(a.data.length, b.data.length) / 4;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (
      Math.abs(a.data[o] - b.data[o]) > 8 ||
      Math.abs(a.data[o + 1] - b.data[o + 1]) > 8 ||
      Math.abs(a.data[o + 2] - b.data[o + 2]) > 8
    )
      differing += 1;
  }
  writeFileSync(join(OUT, `${name}-marks-drawn.png`), drawn);
  writeFileSync(join(OUT, `${name}-marks-hidden.png`), hidden);
  const corner = {
    x: Math.max(0, box.frame[0] + box.frame[2] - 90),
    y: Math.max(0, box.frame[1] - 4),
    width: 96,
    height: 40,
  };
  await shot(page, `${name}-card-corner`, corner);
  const scaled = await sharp(await page.screenshot({ clip: corner })).resize({ width: 96 * 4, kernel: 'nearest' }).png().toBuffer();
  writeFileSync(join(OUT, `${name}-card-corner-4x.png`), scaled);
  return { box, differing, pixels: n };
}

async function postAsAgent(action, deckId, body, runId) {
  const t0 = performance.now();
  const response = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-turboslide-author': `agent:${runId}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 300) };
  }
  return { status: response.status, json, tookMs: ms(t0) };
}

const browser = await chromium.launch({ headless: true });

/* the dev server's first load: Vite's dependency optimizer discovers the editor's imports on the
   first page and reloads the page over its HMR socket once the pre bundle is rebuilt; a context
   whose socket is answered by nobody keeps the half built graph ("Cannot read properties of null
   (reading 'useContext')" on the error page). One throwaway page with the socket open warms the
   server before the two measured contexts open theirs with the socket mocked */
{
  const warm = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  const page = await warm.newPage();
  const t0 = performance.now();
  let ready = false;
  for (let attempt = 0; attempt < 3 && !ready; attempt += 1) {
    await page.goto('/new', { waitUntil: 'load', timeout: 120_000 }).catch(() => undefined);
    ready = await page
      .waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
        timeout: 60_000,
      })
      .then(() => true)
      .catch(() => false);
  }
  say('warm', { ready, ms: ms(t0) });
  await warm.close();
}

const mk = () =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: APPEARANCE === 'dark' ? 'dark' : 'light',
  });
const ctxA = await mk();
const ctxB = await mk();
for (const ctx of [ctxA, ctxB]) {
  await ctx.addInitScript(
    ([theme, advanced]) => {
      try {
        localStorage.setItem('gt-theme', theme);
        if (advanced) localStorage.setItem('ts-editor-settings', JSON.stringify({ advancedTools: true }));
      } catch {
        /* a private window */
      }
    },
    [APPEARANCE === 'dark' ? 'dark' : 'light', ADVANCED],
  );
  /* the dev server's HMR socket answered by nobody (core/lib.ts quietDevServer): another lane's save never reloads the page mid run */
  await ctx.routeWebSocket('**', () => undefined);
}
const A = await ctxA.newPage();
let B = await ctxB.newPage();
let deckId = null;
say('load.start', load());

try {
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  await typeInto(A, heading, 'R3 follow drive');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  const prompt = ctl(A, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(A, 'dialog.namePrompt.close').count()) > 0) await ctl(A, 'dialog.namePrompt.close').click();
    else await ctl(A, 'dialog.namePrompt.skip').click();
  }
  while ((await slideOrder(A)).length < 3) {
    const before = (await slideOrder(A)).length;
    await ctl(A, 'toolbar.newSlide').click();
    await poll(async () => (await slideOrder(A)).length === before + 1, 20_000);
  }
  const slides = await slideOrder(A);
  say('slides', slides);
  await clickCard(A, slides[0]);
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const link = opened.url ?? `/edit/${deckId}`;
  say('share.link', link.replace(/\/s\/.*$/, '/s/<token>'));

  /* B joins by the link */
  const tJoin = performance.now();
  await B.goto(link);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  const bId = await ownClientId(B);
  const aId = await ownClientId(A);
  await poll(async () => ((await state(A)).presence?.others ?? []).some((o) => o.clientId === bId), 30_000);
  say('join.chipInAMs', ms(tJoin));
  const bAccess = (await state(B)).access ?? null;
  say('B.access', { role: bAccess?.role ?? null, via: bAccess?.via ?? null, capabilities: bAccess?.capabilities ?? null });
  say('A.access', { role: (await state(A)).access?.role ?? null, capabilities: (await state(A)).access?.capabilities ?? null });
  say('A.settings.advancedTools', (await state(A)).settings?.advancedTools ?? null);
  await shot(A, '01-a-after-join');

  /* realtime.card.chip-painted: B on slide 2, A's card 2 */
  const tCard = performance.now();
  await clickCard(B, slides[1]);
  const marksSeen = await poll(
    () =>
      A.evaluate((id) => {
        const el = document.querySelector(`[data-control="filmstrip.slide.${id}"] .ts-card-marks`);
        return el !== null && Number(el.getAttribute('data-count') ?? '0') >= 1;
      }, slides[1]),
    5000,
  );
  const cardMs = ms(tCard);
  await A.waitForTimeout(400);
  const pixels = await cardChipPixels(A, slides[1], '02-a');
  row('realtime.card.chip-painted', {
    domWithinMs: marksSeen ? cardMs : null,
    pixelsDiffering: pixels.differing ?? null,
    marksBox: pixels.box?.marks ?? null,
    zIndex: pixels.box?.zIndex ?? null,
    thumbIsolation: pixels.box?.thumbIsolation ?? null,
    pass: Boolean(marksSeen) && cardMs <= 2000 && (pixels.differing ?? 0) >= 40,
  });
  await clickCard(B, slides[0]);

  /* realtime.follow.for-everyone: A (the owner) follows B */
  const first = await followFromRoster(A, bId, '03-a-roster-for-b');
  if (!first.took) await A.keyboard.press('Escape').catch(() => undefined);
  const fol = { ownerOffersFollow: first.offered, ownerRow: { item: first.item, text: first.text, act: first.act } };
  if (first.took) {
    fol.plate = await plateText(A);
    await shot(A, '04-a-following-plate');
    const t0 = performance.now();
    await clickCard(B, slides[2]);
    const moved = await poll(async () => (await state(A)).slideId === slides[2], 3000);
    fol.stageWithinMs = moved ? ms(t0) : null;
    await shot(A, '05-a-after-follow-move');

    const ends = {};
    /* 1 the own click: a card */
    await clickCard(A, slides[0]);
    ends.ownClick = Boolean(await poll(async () => (await following(A)) === null, 2000));
    await clickCard(B, slides[1]);
    await A.waitForTimeout(1200);
    ends.ownClickStays = (await state(A)).slideId === slides[0];
    /* 1b the own move by the keyboard: ArrowDown on the current card */
    if ((await followFromRoster(A, bId)).took) {
      await poll(async () => (await state(A)).slideId === slides[1], 3000);
      await ctl(A, `filmstrip.slide.${slides[1]}`).focus();
      await A.keyboard.press('ArrowDown');
      ends.ownKey = Boolean(await poll(async () => (await following(A)) === null, 2000));
      ends.ownKeySlide = (await state(A)).slideId;
    } else ends.ownKey = 'refollow refused';
    /* 2 the own edit */
    if ((await followFromRoster(A, bId)).took) {
      await poll(async () => (await state(A)).slideId === slides[1], 3000);
      const runs = await runsOf(A);
      const run = runs.find((r) => /heading/.test(r.run))?.run ?? runs[0]?.run;
      if (run) await typeInto(A, run, 'Edited by A');
      ends.ownEdit = Boolean(await poll(async () => (await following(A)) === null, 2000));
    } else ends.ownEdit = 'refollow refused';
    /* 3 the own comment */
    if ((await followFromRoster(A, bId)).took) {
      const cur = (await state(A)).slideId;
      const out = await invoke(A, 'comment.add', {
        anchor: { kind: 'slide', slideId: cur },
        body: { text: 'R3 comment', mentions: [] },
      }).catch((e) => ({ error: String(e) }));
      ends.ownCommentAnswer = out && out.error ? out.error : 'ok';
      ends.ownComment = Boolean(await poll(async () => (await following(A)) === null, 2000));
      await A.keyboard.press('Escape').catch(() => undefined);
    } else ends.ownComment = 'refollow refused';
    /* 4 Slideshow */
    if ((await followFromRoster(A, bId)).took) {
      await ctl(A, 'present.open').click();
      ends.slideshow = Boolean(await poll(async () => (await following(A)) === null, 3000));
      await A.waitForTimeout(400);
      await A.keyboard.press('Escape');
      await poll(async () => (await state(A)).view?.present === false || (await state(A)).present === false, 5000);
      await waitEditor(A);
    } else ends.slideshow = 'refollow refused';
    /* 5 Version history */
    if ((await followFromRoster(A, bId)).took) {
      const clock = ctl(A, 'deck.lastEdit');
      if ((await clock.count()) > 0) await clock.click();
      else await A.keyboard.press('Meta+Alt+Shift+h');
      const panel = await poll(
        () => A.evaluate(() => document.documentElement.getAttribute('data-rpanel') ?? document.querySelector('[data-rpanel]')?.getAttribute('data-rpanel') ?? null),
        3000,
      );
      ends.versionHistoryPanel = panel;
      ends.versionHistory = Boolean(await poll(async () => (await following(A)) === null, 2000));
      await shot(A, '06-a-version-history-ended-follow');
      await A.keyboard.press('Escape').catch(() => undefined);
    } else ends.versionHistory = 'refollow refused';
    fol.ends = ends;
  }

  /* B, admitted by the link, follows A */
  const byLink = await followFromRoster(B, aId, '07-b-roster-for-a');
  fol.linkEditorOffersFollow = byLink.offered;
  fol.linkRow = { item: byLink.item, text: byLink.text, act: byLink.act };
  if (byLink.took) {
    fol.linkPlate = await plateText(B);
    const t0 = performance.now();
    await clickCard(A, slides[2]);
    const moved = await poll(async () => (await state(B)).slideId === slides[2], 3000);
    fol.linkStageWithinMs = moved ? ms(t0) : null;
    await shot(B, '08-b-following-plate');
    await B.locator('.ts-stagewrap.ts-editor').click({ position: { x: 30, y: 30 } });
    await poll(async () => (await following(B)) === null, 2000);
  } else await B.keyboard.press('Escape').catch(() => undefined);

  /* 6 the followed person leaves */
  if ((await followFromRoster(A, bId)).took) {
    const t0 = performance.now();
    await ctxB.close();
    const ended = await poll(async () => (await following(A)) === null, 5000, 50);
    fol.leaveEndsWithinMs = ended ? ms(t0) : null;
    fol.chipGoneWithinMs = (await poll(async () => !((await state(A)).presence?.others ?? []).some((o) => o.clientId === bId), 5000, 50)) ? ms(t0) : null;
  } else {
    fol.leaveEndsWithinMs = 'refollow refused';
    await ctxB.close();
  }
  const sixEnds = fol.ends ?? {};
  fol.pass =
    fol.ownerOffersFollow === true &&
    fol.linkEditorOffersFollow === true &&
    typeof fol.stageWithinMs === 'number' && fol.stageWithinMs <= 1000 &&
    typeof fol.linkStageWithinMs === 'number' && fol.linkStageWithinMs <= 1000 &&
    /Following/.test(fol.plate ?? '') && /Stop/.test(fol.plate ?? '') &&
    sixEnds.ownClick === true && sixEnds.ownKey === true && sixEnds.ownEdit === true &&
    sixEnds.ownComment === true && sixEnds.slideshow === true && sixEnds.versionHistory === true &&
    typeof fol.leaveEndsWithinMs === 'number' && fol.leaveEndsWithinMs <= 2000;
  row('realtime.follow.for-everyone', fol);

  /* realtime.agent.write-announced, R3's reading on the memory tier: the checkout agent's write */
  await clickCard(A, slides[0]);
  const runsA = await runsOf(A);
  const lead = runsA.find((r) => /lead|subtitle|body/.test(r.run) && !/heading/.test(r.run))?.run ?? null;
  const headRun = runsA.find((r) => /heading/.test(r.run))?.run ?? runsA[0]?.run;
  await typeInto(A, headRun, 'R3 follow drive');
  await poll(async () => (await state(A)).pending === 0, 10_000);
  if (lead) await typeInto(A, lead, 'Own words by A');
  await poll(async () => (await state(A)).pending === 0, 10_000);
  const headBefore = (await runsOf(A)).find((r) => r.run === headRun)?.text ?? null;
  const baseRevision = (await state(A)).revision;
  const answer = await postAsAgent(
    'text.replaceAll',
    deckId,
    { find: 'R3 follow drive', replace: 'Agent wrote this', baseRevision },
    'r3-drive',
  );
  const tBanner = performance.now();
  const banner = await poll(
    () =>
      A.evaluate(() => {
        const el = document.querySelector('[data-control="snackbar"].is-on .ts-snackbar-text');
        const text = el?.textContent ?? '';
        return /changed|tailored/.test(text) ? text : null;
      }),
    3000,
  );
  const bannerMs = banner ? ms(tBanner) : null;
  await shot(A, '09-a-agent-banner');
  const headAfter = await poll(async () => {
    const t = (await runsOf(A)).find((r) => r.run === headRun)?.text ?? null;
    return t && /Agent wrote this/.test(t) ? t : null;
  }, 3000);
  await A.keyboard.press('Meta+z');
  await A.waitForTimeout(600);
  const afterUndo = await runsOf(A);
  const headAfterUndo = afterUndo.find((r) => r.run === headRun)?.text ?? null;
  const leadAfterUndo = lead ? (afterUndo.find((r) => r.run === lead)?.text ?? null) : null;
  await shot(A, '10-a-after-cmd-z');
  row('realtime.agent.write-announced', {
    post: { status: answer.status, tookMs: answer.tookMs, replaced: answer.json?.count ?? answer.json?.replaced ?? answer.json?.error ?? null },
    bannerWithinMs: bannerMs,
    banner,
    headBefore,
    headAfter,
    headAfterUndo,
    leadAfterUndo,
    cmdZLeftAgentText: headAfterUndo !== null && /Agent wrote this/.test(headAfterUndo),
    cmdZTookOwnEdit: lead ? leadAfterUndo !== null && !/Own words by A/.test(leadAfterUndo) : null,
    pass: answer.status === 200 && bannerMs !== null && bannerMs <= 1000 && headAfterUndo !== null && /Agent wrote this/.test(headAfterUndo),
  });
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  say('load.end', load());
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info', {});
      const trash = await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch((e) => ({ error: String(e) }));
      const info2 = await invoke(A, 'deck.info', {}).catch(() => info);
      const remove = await invoke(A, 'deck.remove', { id: deckId, confirm: true, baseRevision: info2.revision ?? info.revision }).catch((e) => ({ error: String(e) }));
      say('teardown', { trash: trash?.error ?? 'ok', remove: remove?.error ?? 'ok' });
    } catch (error) {
      say('teardown.error', String(error));
    }
  }
  await browser.close().catch(() => {});
  facts.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
}

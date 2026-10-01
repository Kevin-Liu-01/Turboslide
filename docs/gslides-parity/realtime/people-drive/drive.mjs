// The realtime round's people drive (docs/gslides-parity/realtime/audit-people.md): two anonymous
// browsers on one scratch deck on production, both on slide 1, reading what each sees of the
// other while they type, select, move and add, then the deck removed by its id through the bearer.
// The bearer reaches this process as the environment variable TURBOSLIDE_BEARER, set by a wrapper
// that reads ~/.config/turboslide/hosts.json; nothing here prints it. Run from the repo root:
//   TURBOSLIDE_BEARER=... node docs/gslides-parity/realtime/people-drive/drive.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/kevinliu/repos/Turboslide-realtime/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright',
);

const BASE = 'https://www.turboslide.com';
const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 70;
const TOKEN = process.env.TURBOSLIDE_BEARER ?? '';
if (TOKEN.length === 0) throw new Error('TURBOSLIDE_BEARER is not set');

const facts = { startedAt: new Date().toISOString(), base: BASE };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const ms = (from) => Math.round(performance.now() - from);

async function post(action, deckId, body) {
  const response = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
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

async function poll(fn, timeout = 30_000, every = 100) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}

/** The runs of the shown slide: data-run keys with their text. */
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

/** The remote presence drawings of the overlay with the client they belong to. */
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
        classes: el.className,
      }));
    return {
      carets: pick('.ts-remote-caret'),
      flags: pick('.ts-flag'),
      outlines: pick('.ts-remote-outline'),
      pointers: pick('.ts-remote-pointer-group'),
      following: document.querySelector('[data-control="presence.following"]')?.textContent ?? null,
      chips: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
      cardMarks: [...document.querySelectorAll('.ts-card-marks')].map((el) => ({
        count: el.getAttribute('data-count'),
        label: el.getAttribute('aria-label'),
        card: el.closest('[data-control^="filmstrip.slide."]')?.getAttribute('data-control') ?? null,
        box: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(),
      })),
    };
  });

/** Samples both pages every `every` ms for `duration` ms; returns the rows with the first moment each drawing kind appeared. */
async function sampleBoth(A, B, duration, every = 150) {
  const t0 = performance.now();
  const rows = [];
  const first = { A: {}, B: {} };
  while (performance.now() - t0 < duration) {
    const [a, b] = await Promise.all([remoteDrawings(A), remoteDrawings(B)]);
    const at = ms(t0);
    for (const [who, d] of [
      ['A', a],
      ['B', b],
    ]) {
      for (const kind of ['carets', 'flags', 'outlines', 'pointers']) {
        if (d[kind].length > 0 && first[who][kind] === undefined) first[who][kind] = at;
      }
    }
    rows.push({ at, A: summary(a), B: summary(b) });
    await new Promise((r) => setTimeout(r, every));
  }
  return { first, rows };
}
const summary = (d) => ({
  carets: d.carets.length,
  flags: d.flags.map((f) => f.text),
  outlines: d.outlines.length,
  pointers: d.pointers.length,
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

/** Opens an inline session on a run and types without closing it. */
async function beginTyping(page, run, text, { replace = true, startDelay = 0 } = {}) {
  if (startDelay > 0) await page.waitForTimeout(startDelay);
  await runEl(page, run).dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press(replace ? 'Meta+a' : 'End');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
}

const browser = await chromium.launch({ headless: true });
const mk = () =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
const ctxA = await mk();
const ctxB = await mk();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let deckId = null;

/* the presence POSTs and the stream opens each page made, with the region prefix of x-vercel-id
   (the instance lottery of fluid compute: a POST lands on any instance, a stream holds one) */
const net = { A: { presence: [], ops: [], streams: [] }, B: { presence: [], ops: [], streams: [] } };
for (const [who, page] of [
  ['A', A],
  ['B', B],
]) {
  page.on('response', (response) => {
    const url = response.url();
    const id = response.headers()['x-vercel-id'] ?? null;
    const row = { at: Math.round(performance.now()), status: response.status(), vercelId: id };
    if (/\/api\/decks\/[^/]+\/presence/.test(url)) net[who].presence.push(row);
    else if (/\/api\/decks\/[^/]+\/ops/.test(url)) net[who].ops.push(row);
    else if (/\/api\/decks\/[^/]+\/stream/.test(url)) net[who].streams.push(row);
  });
}

try {
  // ---- A creates the deck from /new and gives it a title (revision 1)
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  say('build', await A.evaluate(() => document.querySelector('meta[name="turboslide-build"]')?.content ?? document.documentElement.dataset.build ?? null));
  const runs0 = await runsOf(A);
  say('slide1.runs', runs0);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  const subtitle = runs0.find((r) => r.run !== heading)?.run ?? null;
  say('runs.chosen', { heading, subtitle });
  await beginTyping(A, heading, 'Realtime drive');
  await A.keyboard.press('Escape');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  const prompt = ctl(A, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(A, 'dialog.namePrompt.close').count()) > 0) await ctl(A, 'dialog.namePrompt.close').click();
    else await ctl(A, 'dialog.namePrompt.skip').click();
  }
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url;
  say('share.link', linkUrl ? linkUrl.replace(/\/s\/.*$/, '/s/<token>') : null);
  const sA = await state(A);
  say('A.self', { clientId: sA.sync?.clientId ?? null, presence: sA.presence?.self ?? null });

  // ---- B joins: the joiner's chip, timed from B's navigation
  const tJoin = performance.now();
  await B.goto(linkUrl ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  const tBReady = ms(tJoin);
  const chipInA = await poll(
    async () => {
      const s = await state(A);
      const chips = await A.evaluate(() => document.querySelectorAll('[data-control^="presence.chip."]').length);
      return (s.presence?.others?.length ?? 0) >= 1 && chips >= 1 ? { at: ms(tJoin) } : null;
    },
    60_000,
    100,
  );
  const chipInB = await poll(
    async () => {
      const s = await state(B);
      const chips = await B.evaluate(() => document.querySelectorAll('[data-control^="presence.chip."]').length);
      return (s.presence?.others?.length ?? 0) >= 1 && chips >= 1 ? { at: ms(tJoin) } : null;
    },
    60_000,
    100,
  );
  say('join', { bEditorReadyMs: tBReady, aSeesBChipMs: chipInA?.at ?? null, bSeesAChipMs: chipInB?.at ?? null });
  const sB = await state(B);
  say('B.self', { clientId: sB.sync?.clientId ?? null, presence: sB.presence?.self ?? null, access: sB.access?.via ?? null });
  say('shot.join.A', await shot(A, '01-a-after-join'));
  await B.keyboard.press('Escape');
  const promptB = ctl(B, 'dialog.namePrompt');
  if (await promptB.isVisible().catch(() => false)) {
    if ((await ctl(B, 'dialog.namePrompt.close').count()) > 0) await ctl(B, 'dialog.namePrompt.close').click();
    else await ctl(B, 'dialog.namePrompt.skip').click();
  }

  // ---- Step 1: A types in the title while B types in the subtitle
  const t1 = performance.now();
  const typing1 = Promise.all([
    beginTyping(A, heading, 'Quarterly review'),
    beginTyping(B, subtitle, 'Prepared by the field team', { startDelay: 100 }),
  ]);
  const samples1 = await sampleBoth(A, B, 2600);
  say('shot.step1.A.mid', await shot(A, '02-a-typing-title-while-b-subtitle', await stageClip(A)));
  say('shot.step1.B.mid', await shot(B, '02-b-typing-subtitle-while-a-title', await stageClip(B)));
  await typing1;
  const tEsc1 = performance.now();
  await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
  const merged1 = await poll(
    async () => {
      const [aSub, bHead] = await Promise.all([runText(A, subtitle), runText(B, heading)]);
      const ok = /Prepared by the field team/.test(aSub ?? '') && /Quarterly review/.test(bHead ?? '');
      return ok ? { at: ms(tEsc1), aSub, bHead } : null;
    },
    20_000,
    100,
  );
  say('step1', {
    firstSeen: samples1.first,
    samples: samples1.rows.filter((_, i) => i % 3 === 0),
    mergedAfterEscapeMs: merged1?.at ?? null,
    aSeesSubtitle: merged1?.aSub ?? (await runText(A, subtitle)),
    bSeesHeading: merged1?.bHead ?? (await runText(B, heading)),
    elapsedMs: ms(t1),
  });
  say('shot.step1.A.after', await shot(A, '03-a-after-step1', await stageClip(A)));

  // ---- Step 2: both in the title, two rounds
  for (const [round, wordA, wordB, replace] of [
    [1, 'alpha', 'bravo', true],
    [2, ' charlie', ' delta', false],
  ]) {
    await A.waitForTimeout(1500);
    const before = await runText(A, heading);
    const t2 = performance.now();
    const typing = Promise.all([
      beginTyping(A, heading, wordA, { replace }),
      beginTyping(B, heading, wordB, { replace, startDelay: 150 }),
    ]);
    const samples = await sampleBoth(A, B, 3600, 200);
    say(`shot.step2.r${round}.A.mid`, await shot(A, `04-r${round}-a-both-in-title`, await stageClip(A)));
    say(`shot.step2.r${round}.B.mid`, await shot(B, `04-r${round}-b-both-in-title`, await stageClip(B)));
    await typing;
    const tEsc = performance.now();
    await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
    const settledTexts = await poll(
      async () => {
        const [a, b] = await Promise.all([runText(A, heading), runText(B, heading)]);
        const both = (t) => t !== null && t.includes(wordA.trim()) && t.includes(wordB.trim());
        return both(a) && both(b) && a === b ? { at: ms(tEsc), a, b } : null;
      },
      20_000,
      100,
    );
    const [aFinal, bFinal] = await Promise.all([runText(A, heading), runText(B, heading)]);
    say(`step2.round${round}`, {
      before,
      firstSeen: samples.first,
      samples: samples.rows.filter((_, i) => i % 3 === 0),
      convergedMs: settledTexts?.at ?? null,
      aFinal,
      bFinal,
      bothWordsInA: aFinal?.includes(wordA.trim()) && aFinal?.includes(wordB.trim()),
      bothWordsInB: bFinal?.includes(wordA.trim()) && bFinal?.includes(wordB.trim()),
      elapsedMs: ms(t2),
    });
    say(`shot.step2.r${round}.A.after`, await shot(A, `05-r${round}-a-after`, await stageClip(A)));
    say(`shot.step2.r${round}.B.after`, await shot(B, `05-r${round}-b-after`, await stageClip(B)));
  }

  // ---- the selection's travel time: B selects the subtitle block, A's state reads it
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  await A.mouse.click(20, 500);
  await A.waitForTimeout(500);
  const bSelf = (await state(B)).presence?.self?.clientId ?? null;
  const headingBlock = heading.split('/')[0];
  const leadBlock = subtitle.split('/')[0];
  const travel = [];
  for (const [i, target] of [leadBlock, headingBlock, leadBlock, headingBlock].entries()) {
    const run = target === leadBlock ? subtitle : heading;
    await B.waitForTimeout(1500);
    const tSel = performance.now();
    await runEl(B, run).click();
    const seen = await poll(
      async () => {
        const s = await state(A);
        const other = (s.presence?.others ?? []).find((o) => o.clientId === bSelf);
        const ids = other?.selection?.blockIds ?? [];
        return ids.includes(target) && ids.length === 1 ? { at: ms(tSel) } : null;
      },
      30_000,
      100,
    );
    const outline = await poll(
      async () => {
        const d = await remoteDrawings(A);
        const box = d.outlines[0]?.box ?? null;
        return box ? { at: ms(tSel), box } : null;
      },
      1_500,
      100,
    );
    travel.push({ round: i + 1, target, aStateSawSelectionMs: seen?.at ?? null, aOutlineBox: outline?.box ?? null });
  }
  say('selection.travel', { bClientId: bSelf, rounds: travel });
  say('shot.selection.A', await shot(A, '06-a-after-b-selected-subtitle', await stageClip(A)));

  // ---- Step 3: A selects the subtitle block while B drags it
  const blockId = subtitle.split('/')[0];
  await runEl(A, subtitle).click();
  await A.waitForTimeout(300);
  const boxA0 = await runEl(A, subtitle).boundingBox();
  const boxB0 = await runEl(B, subtitle).boundingBox();
  const t3 = performance.now();
  const drag = (async () => {
    const cx = boxB0.x + boxB0.width / 2;
    const cy = boxB0.y + boxB0.height / 2;
    await B.mouse.move(cx, cy);
    await B.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await B.mouse.move(cx + (160 * i) / 12, cy + (40 * i) / 12);
      await B.waitForTimeout(40);
    }
    await B.waitForTimeout(300);
  })();
  const samples3 = await sampleBoth(A, B, 700, 100);
  say('shot.step3.B.mid', await shot(B, '07-b-dragging-while-a-selected', await stageClip(B)));
  say('shot.step3.A.mid', await shot(A, '07-a-selected-while-b-drags', await stageClip(A)));
  await drag;
  await B.mouse.up();
  const tUp = performance.now();
  const moved = await poll(
    async () => {
      const box = await runEl(A, subtitle).boundingBox();
      return box && Math.abs(box.x - boxA0.x) > 20 ? { at: ms(tUp), dx: Math.round(box.x - boxA0.x) } : null;
    },
    20_000,
    100,
  );
  say('step3', {
    blockId,
    bInBMovedPx: await runEl(B, subtitle).boundingBox().then((b) => (b ? Math.round(b.x - boxB0.x) : null)),
    aSawMoveMs: moved?.at ?? null,
    aSawMoveDx: moved?.dx ?? null,
    firstSeen: samples3.first,
    drawingsDuringDrag: samples3.rows,
    elapsedMs: ms(t3),
  });
  say('shot.step3.A.after', await shot(A, '08-a-after-b-moved', await stageClip(A)));
  say('shot.step3.B.after', await shot(B, '08-b-after-move', await stageClip(B)));

  // ---- Step 4: B adds a slide while A is on slide 1
  await A.keyboard.press('Escape');
  await B.keyboard.press('Escape');
  const cardsA0 = await A.evaluate(() => document.querySelectorAll('[data-control^="filmstrip.slide."]').length);
  const activeA0 = (await state(A)).slideId;
  const t4 = performance.now();
  await ctl(B, 'toolbar.newSlide.split').click();
  await B.waitForTimeout(400);
  const plate = B.locator('[data-control="layout.new.plate"]').first();
  if (await plate.isVisible().catch(() => false)) {
    /* the + button opened the layout plate: pick Title and body as a seller would */
    const items = await plate.evaluate((el) =>
      [...el.querySelectorAll('[data-control]')].map((e) => ({
        control: e.getAttribute('data-control'),
        text: e.textContent?.trim().slice(0, 40),
      })),
    );
    say('step4.plateItems', items.slice(0, 16));
    await plate.locator('[data-control="layout.new.split"]').first().click();
  }
  const added = await poll(
    async () => {
      const n = await A.evaluate(() => document.querySelectorAll('[data-control^="filmstrip.slide."]').length);
      return n > cardsA0 ? { at: ms(t4), cards: n } : null;
    },
    20_000,
    100,
  );
  const sB4 = await state(B);
  const sA4 = await state(A);
  say('step4', {
    cardsBefore: cardsA0,
    aSawNewCardMs: added?.at ?? null,
    aActiveBefore: activeA0,
    aActiveAfter: sA4.slideId,
    bActiveAfter: sB4.slideId,
    aRevision: sA4.revision,
    bRevision: sB4.revision,
    aCardMarks: (await remoteDrawings(A)).cardMarks,
    bCardMarks: (await remoteDrawings(B)).cardMarks,
  });
  const bChipOnCardInA = await poll(
    async () => {
      const d = await remoteDrawings(A);
      return d.cardMarks.length > 0 ? { at: ms(t4), marks: d.cardMarks } : null;
    },
    30_000,
    150,
  );
  say('step4.cardMarkInA', bChipOnCardInA ?? null);
  say('shot.step4.A', await shot(A, '09-a-after-b-added-slide'));
  say('shot.step4.A.filmstrip', await shot(A, '09-a-filmstrip-card-marks', { x: 0, y: 110, width: 260, height: 300 }));
  say('shot.step4.B', await shot(B, '09-b-after-adding-slide'));

  // ---- Step 5: A follows B
  const tipFollow = await A.evaluate(() => {
    const chip = document.querySelector('[data-control^="presence.chip."]');
    return chip ? { menuItem: chip.getAttribute('data-menu-item'), label: chip.getAttribute('aria-label') } : null;
  });
  say('follow.chipDefaultView', tipFollow);
  // Advanced tools on, so the parked Follow row is drawn
  await A.keyboard.press('Escape');
  await ctl(A, 'menubar.tools').click();
  const advRow = A.locator('[data-control="menu.tools.advancedTools"]').first();
  await advRow.waitFor({ timeout: 8000 });
  if ((await advRow.getAttribute('aria-checked')) !== 'true') await advRow.click();
  else await A.keyboard.press('Escape');
  await A.waitForTimeout(400);
  await ctl(A, 'presence.more').click();
  await A.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
  await A.waitForTimeout(300);
  const rosterRows = await A.evaluate(() =>
    [...document.querySelectorAll('#ts-menu-roster [role^="menuitem"]')].map((r) => ({
      control: r.getAttribute('data-control'),
      item: r.getAttribute('data-menu-item'),
      text: r.textContent?.trim().slice(0, 80),
    })),
  );
  say('follow.rosterRows', rosterRows);
  say('shot.follow.roster', await shot(A, '10-a-roster-advanced'));
  const followRow = A.locator('#ts-menu-roster [data-menu-item="title.presence.follow"]').first();
  const followOffered = (await followRow.count()) > 0;
  if (followOffered) {
    await followRow.click();
  } else {
    const anyRow = A.locator('#ts-menu-roster [data-menu-item="title.presence.goTo"]').first();
    if ((await anyRow.count()) > 0) await anyRow.click();
  }
  await A.waitForTimeout(600);
  const followingA = (await state(A)).presence?.following ?? null;
  say('follow.afterClick', { offered: followOffered, following: followingA, plate: (await remoteDrawings(A)).following });
  say('shot.follow.plate', await shot(A, '11-a-following-plate'));
  // B moves back to slide 1 then to slide 2 again; A should move with it
  const slidesB = await B.evaluate(() => [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((e) => e.getAttribute('data-control')));
  say('follow.slidesB', slidesB);
  await B.keyboard.press('Escape');
  await B.locator(`[data-control="${slidesB[0]}"]`).first().click();
  const bActiveMid = await poll(async () => { const s = await state(B); return s.slideId === 'title' ? s.slideId : null; }, 5000, 50);
  const aAfterBack = await poll(async () => { const s = await state(A); return s.slideId === 'title' ? { at: 0 } : null; }, 20_000, 100);
  say('follow.bBackToSlide1', { bActive: bActiveMid, aFollowedBack: aAfterBack !== null && aAfterBack !== undefined, aActive: (await state(A)).slideId });
  await B.waitForTimeout(1200);
  const t5 = performance.now();
  await B.locator(`[data-control="${slidesB[1] ?? slidesB[0]}"]`).first().click();
  const bTarget = await poll(async () => {
    const s = await state(B);
    return s.slideId !== bActiveMid ? s.slideId : null;
  }, 5000, 50);
  const followed = await poll(
    async () => {
      const s = await state(A);
      return bTarget && s.slideId === bTarget ? { at: ms(t5) } : null;
    },
    30_000,
    100,
  );
  say('follow.move', { bFrom: bActiveMid, bTo: bTarget, aFollowedMs: followed?.at ?? null, aActive: (await state(A)).slideId, aFollowing: (await state(A)).presence?.following ?? null });
  say('shot.follow.A.after', await shot(A, '12-a-after-follow-move'));
  // a click on A's stage stops it
  await A.mouse.click(20, 500);
  await A.waitForTimeout(500);
  say('follow.afterOwnClick', { following: (await state(A)).presence?.following ?? null, plate: (await remoteDrawings(A)).following });
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  if (deckId) {
    const info = await post('deck.info', deckId, {});
    say('teardown.info', { status: info.status, revision: info.json?.revision ?? null });
    let rev = info.json?.revision;
    const trash = await post('deck.trash', deckId, { id: deckId, baseRevision: rev });
    say('teardown.trash', { status: trash.status, revision: trash.json?.revision ?? null, error: trash.json?.error ?? null });
    const info2 = await post('deck.info', deckId, {});
    rev = info2.json?.revision ?? rev;
    const remove = await post('deck.remove', deckId, { id: deckId, confirm: true, baseRevision: rev });
    say('teardown.remove', { status: remove.status, body: remove.json });
    const gone = await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' });
    say('teardown.editStatus', gone.status);
  }
  facts.network = {
    A: { presencePosts: net.A.presence.length, opsPosts: net.A.ops.length, streams: net.A.streams.length, regions: [...new Set(net.A.presence.map((r) => (r.vercelId ?? '').split('::')[0]))], presence: net.A.presence },
    B: { presencePosts: net.B.presence.length, opsPosts: net.B.ops.length, streams: net.B.streams.length, regions: [...new Set(net.B.presence.map((r) => (r.vercelId ?? '').split('::')[0]))], presence: net.B.presence },
  };
  console.log(`network: A ${net.A.presence.length} presence, ${net.A.ops.length} ops, ${net.A.streams.length} streams; B ${net.B.presence.length} presence, ${net.B.ops.length} ops, ${net.B.streams.length} streams`);
  facts.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
}

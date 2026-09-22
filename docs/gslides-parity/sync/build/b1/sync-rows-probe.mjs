// B1's two browser drive of the four sync rows on the dev server (docs/SYNC.md 6.1), at human
// pace, before B4's core/sync.spec.ts lands: sync.serial.order-and-latency,
// sync.block.concurrent-same-offset-order, sync.structural.concurrent, sync.viewer.live-updates.
// A and B are two browsers with one person's cookies; C is a fresh context. Every observation is
// through the page (the window API, the DOM, the network); the numbers go to JSON.
//   BASE=http://localhost:4411 node sync-rows-probe.mjs --out <file.json> [--words 30] [--gap 3000]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = process.env.BASE ?? 'http://localhost:4411';
const OUT = flag('out', 'sync-rows.json');
const WORDS = Number(flag('words', '30'));
const GAP_MS = Number(flag('gap', '3000'));
const TYPE_DELAY = 60;
const HEADED = args.includes('--headed');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const log = (line) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`);

// ---------------------------------------------------------------------------------------------
// the page helpers (apps/studio/e2e/core/lib.ts, in the shapes the specs use)

async function waitEditor(page) {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
}
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([id, value]) => window.turboslide.studio.invoke(id, value), [action, input]);
async function settled(page, timeout = 20_000) {
  const until = now() + timeout;
  let s = await state(page);
  while (now() < until) {
    s = await state(page);
    const words = await page
      .locator('[data-control="deck.saveState"]')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await sleep(150);
  }
  return s;
}
async function waitRevision(page, want, timeout = 30_000) {
  const until = now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s.revision >= want || now() > until) return s.revision;
    await sleep(150);
  }
}
const runSelector = (run) =>
  `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`;
async function headingRun(page) {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
}
async function runsOfBlock(page, blockId) {
  return page.evaluate((id) => {
    const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
    const box = inner?.closest('.free') ?? inner;
    if (!box) return [];
    const own = box.matches('[data-run]') ? [box.getAttribute('data-run') ?? ''] : [];
    return [
      ...own,
      ...[...box.querySelectorAll('[data-run]')].map((el) => el.getAttribute('data-run') ?? ''),
    ];
  }, blockId);
}
const runText = (page, run) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, runSelector(run));
async function typeInto(page, run, text) {
  const el = page.locator(runSelector(run)).first();
  await el.dblclick();
  await sleep(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await sleep(250);
  await page.keyboard.press('Escape');
}
async function slideOrder(page) {
  const list = await invoke(page, 'slide.list', {});
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
}
async function slideJson(page, slideId) {
  const got = await invoke(page, 'slide.get', { slideId });
  return got.slide ?? got;
}
async function clickCard(page, slideId) {
  await page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first().click();
  const until = now() + 8000;
  while (now() < until && (await state(page)).slideId !== slideId) await sleep(100);
  await sleep(300);
}
async function openEditor(page, deckId) {
  await page.goto(`${BASE}/edit/${deckId}`);
  await waitEditor(page);
}
async function selectBlock(page, blockId) {
  await page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first().click();
  await sleep(200);
  const editing = await page.evaluate(() =>
    Boolean(
      document.querySelector('.ts-editor .is-editing, .ts-editor [contenteditable="true"]:focus'),
    ),
  );
  if (editing) {
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await page.waitForSelector(`.ts-overlay [data-control="handle.${blockId}.move"]`, {
    state: 'attached',
    timeout: 5000,
  });
}
async function dragHandle(page, blockId, dx, dy) {
  const handle = page.locator(`.ts-overlay [data-control="handle.${blockId}.move"]`).first();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no move handle for ${blockId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await sleep(25);
  }
  await page.mouse.up();
}

/** Records every ops POST of a page: the body's base and the answer's entries. */
function wire(page, name, sink) {
  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'POST' || !/\/api\/decks\/[^/]+\/ops$/.test(request.url())) return;
    let body = null;
    let answer = null;
    try {
      body = JSON.parse(request.postData() ?? 'null');
    } catch {}
    try {
      answer = await response.json();
    } catch {}
    sink.push({
      t: now(),
      who: name,
      status: response.status(),
      base: body?.base?.seq ?? null,
      ops: (body?.entries ?? []).flatMap((e) =>
        (e.mutations ?? []).map((m) => ({
          op: m.op,
          path: m.path,
          at: m.at,
          remove: m.remove,
          insert: m.insert,
          blockId: m.blockId,
        })),
      ),
      entrySeqs: (answer?.entries ?? []).map((e) => e.seq),
      revision: answer?.revision ?? null,
      rejected: answer?.rejected ?? [],
    });
  });
}

/** Samples a run's text on a page every `everyMs` until stopped; answers the timeline. */
function sampler(page, run, everyMs = 100) {
  const samples = [];
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      const text = await runText(page, run).catch(() => null);
      const last = samples[samples.length - 1];
      if (last === undefined || last.text !== text) samples.push({ t: now(), text });
      await sleep(everyMs);
    }
  })();
  return {
    samples,
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

function firstSeen(samples, word, after = 0) {
  for (const s of samples)
    if (s.t >= after && typeof s.text === 'string' && s.text.includes(word)) return s.t;
  return null;
}

// ---------------------------------------------------------------------------------------------

const report = { base: BASE, startedAt: new Date().toISOString(), rows: {}, wire: [], notes: [] };
const browser = await chromium.launch({ headless: !HEADED });
const ctxOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const aCtx = await browser.newContext(ctxOptions);
const a = await aCtx.newPage();
let deckId = null;
try {
  // A makes the deck from /new
  await a.goto(`${BASE}/new`);
  await waitEditor(a);
  const info = await invoke(a, 'deck.info');
  deckId = info.id;
  log(`deck ${deckId}`);
  wire(a, 'A', report.wire);
  const heading = await headingRun(a);
  await typeInto(a, heading, 'Sync rows probe');
  await waitRevision(a, 1);
  await a.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(a);
  for (const id of ['dialog.namePrompt.close', 'dialog.namePrompt.skip']) {
    const ctl = a.locator(`[data-control="${id}"]`).first();
    if (await ctl.isVisible().catch(() => false)) await ctl.click().catch(() => undefined);
  }
  const titleSlide = (await state(a)).slideId;
  // a second slide with a paragraph block, for the block rows
  const before = await slideOrder(a);
  await a.locator('[data-control="toolbar.newSlide"]').first().click();
  let after = before;
  for (let i = 0; i < 100 && after.length === before.length; i += 1) {
    await sleep(200);
    after = await slideOrder(a);
  }
  const bodySlide = after.find((x) => !before.includes(x));
  await settled(a);
  let s = await state(a);
  await invoke(a, 'block.insert', {
    baseRevision: s.revision,
    slideId: bodySlide,
    slot: 'main',
    block: { id: 'p-sync', type: 'paragraph', text: 'Body text of the sync probe.' },
  });
  await settled(a);
  // the viewer's access: Anyone with the link, Viewer (docs/SYNC.md 6.1 setup)
  s = await state(a);
  const access = await invoke(a, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'viewer',
    baseRevision: s.access?.revision ?? 0,
  }).catch((error) => ({ error: String(error) }));
  report.notes.push({ access: access?.error ?? access?.record?.generalAccess ?? access });

  // B: the same person in a second browser
  const bCtx = await browser.newContext({ ...ctxOptions, storageState: await aCtx.storageState() });
  const b = await bCtx.newPage();
  wire(b, 'B', report.wire);
  await openEditor(b, deckId);
  // C: a stranger; the list first so its principal exists (share.spec.ts stranger rule)
  const cCtx = await browser.newContext(ctxOptions);
  const c = await cCtx.newPage();
  await c.goto(`${BASE}/decks`);
  await c.waitForLoadState('domcontentloaded');
  await openEditor(c, deckId);
  const cState = await state(c);
  report.notes.push({ cRole: cState.access, cSync: cState.sync, bSync: (await state(b)).sync });
  log(`C role ${JSON.stringify(cState.access)}`);

  // ------------------------------------------------------------------------------------------
  // sync.serial.order-and-latency and sync.viewer.live-updates
  await clickCard(a, titleSlide);
  await clickCard(b, titleSlide);
  await clickCard(c, titleSlide).catch(() => undefined);
  const hA = await headingRun(a);
  const hB = await headingRun(b);
  const hC = await headingRun(c);
  const sB = sampler(b, hB);
  const sC = sampler(c, hC);
  const typed = [];
  await a.locator(runSelector(hA)).first().dblclick();
  await sleep(200);
  await a.keyboard.press('End');
  const serialStart = now();
  for (let i = 1; i <= WORDS; i += 1) {
    const word = `w${String(i).padStart(2, '0')}`;
    await a.keyboard.type(` ${word}`, { delay: TYPE_DELAY });
    typed.push({ word, t: now() });
    await sleep(GAP_MS);
  }
  await a.keyboard.press('Escape');
  await settled(a);
  await sleep(1500);
  await sB.stop();
  await sC.stop();
  const bFinal = await runText(b, hB);
  const cFinal = await runText(c, hC);
  const aFinal = await runText(a, hA);
  const serialWire = report.wire.filter((row) => row.who === 'A' && row.t >= serialStart - 500);
  const orderOf = (text) => (text ?? '').match(/w\d\d/g) ?? [];
  const latencies = typed.map(({ word, t }) => ({
    word,
    b: firstSeen(sB.samples, word) === null ? null : firstSeen(sB.samples, word) - t,
    c: firstSeen(sC.samples, word) === null ? null : firstSeen(sC.samples, word) - t,
  }));
  const nextRevision = serialWire.map((row) => ({
    base: row.base,
    seqs: row.entrySeqs,
    atNext: row.entrySeqs.every((seq) => seq === (row.base ?? -2) + 1),
  }));
  report.rows['sync.serial.order-and-latency'] = {
    words: WORDS,
    gapMs: GAP_MS,
    aFinal,
    bFinal,
    bOrderMatches: JSON.stringify(orderOf(bFinal)) === JSON.stringify(typed.map((x) => x.word)),
    bDoubled: orderOf(bFinal).length !== new Set(orderOf(bFinal)).size,
    latencies,
    bMaxMs: Math.max(...latencies.map((l) => l.b ?? Number.POSITIVE_INFINITY)),
    bLost: latencies.filter((l) => l.b === null).map((l) => l.word),
    posts: nextRevision.length,
    postsAtNextSeq: nextRevision.filter((r) => r.atNext).length,
    postsNotAtNext: nextRevision.filter((r) => !r.atNext),
  };
  report.rows['sync.viewer.live-updates'] = {
    role: cState.access?.role ?? null,
    cFinal,
    first3WithinMs: latencies.slice(0, 3).map((l) => l.c),
    cLost: latencies.filter((l) => l.c === null).map((l) => l.word),
    cMaxMs: Math.max(...latencies.map((l) => l.c ?? Number.POSITIVE_INFINITY)),
    cRevision: (await state(c)).revision,
    aRevision: (await state(a)).revision,
  };
  log(
    `serial: B max ${report.rows['sync.serial.order-and-latency'].bMaxMs} ms, lost ${report.rows['sync.serial.order-and-latency'].bLost.length}; C max ${report.rows['sync.viewer.live-updates'].cMaxMs} ms`,
  );

  // ------------------------------------------------------------------------------------------
  // sync.block.concurrent-same-offset-order: three rounds
  await clickCard(a, bodySlide);
  await clickCard(b, bodySlide);
  const rounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const runA = (await runsOfBlock(a, 'p-sync'))[0];
    const runB = (await runsOfBlock(b, 'p-sync'))[0];
    const wireStart = now();
    const open = async (page, run) => {
      await page.locator(runSelector(run)).first().dblclick();
      await sleep(200);
      await page.keyboard.press('Home');
    };
    await open(a, runA);
    await open(b, runB);
    const wa = `pa${round} `;
    const wb = `pb${round} `;
    const t0 = now();
    await Promise.all([
      a.keyboard.type(wa, { delay: TYPE_DELAY }),
      (async () => {
        await sleep(120);
        await b.keyboard.type(wb, { delay: TYPE_DELAY });
      })(),
    ]);
    const typedAt = now();
    await sleep(400);
    await a.keyboard.press('Escape');
    await b.keyboard.press('Escape');
    // both browsers show the two words in one order within 3 s
    let agreeAt = null;
    let textA = null;
    let textB = null;
    const until = typedAt + 3000;
    while (now() < until) {
      textA = await runText(a, runA);
      textB = await runText(b, runB);
      if (
        textA !== null &&
        textA === textB &&
        textA.includes(wa.trim()) &&
        textA.includes(wb.trim())
      ) {
        agreeAt = now() - typedAt;
        break;
      }
      await sleep(100);
    }
    await sleep(1200);
    const textA2 = await runText(a, runA);
    const textB2 = await runText(b, runB);
    const posts = report.wire.filter((row) => row.t >= wireStart);
    const repairs = posts.flatMap((row) =>
      row.ops
        .filter((m) => m.op === 'text.splice' && (m.remove ?? 0) > 0)
        .map((m) => ({ who: row.who, ...m })),
    );
    rounds.push({
      round,
      agreeWithinMs: agreeAt,
      textA,
      textB,
      textA2,
      textB2,
      sameAfter: textA2 === textB2,
      posts: posts.length,
      repairs,
      wire: posts.map((p) => ({ who: p.who, base: p.base, seqs: p.entrySeqs, ops: p.ops })),
    });
    log(`block round ${round}: agree ${agreeAt} ms, repairs ${repairs.length}, A "${textA2}"`);
    await settled(a);
    await settled(b);
  }
  report.rows['sync.block.concurrent-same-offset-order'] = { rounds };

  // ------------------------------------------------------------------------------------------
  // sync.structural.concurrent
  s = await state(a);
  await invoke(a, 'slide.setLayout', {
    slideId: bodySlide,
    layout: { type: 'freeform' },
    baseRevision: s.revision,
  });
  await settled(a);
  await settled(b);
  await sleep(800);
  const posBefore =
    (await slideJson(a, bodySlide)).slots?.main?.find((x) => x.id === 'p-sync')?.pos ?? null;
  await selectBlock(a, 'p-sync');
  await selectBlock(b, 'p-sync');
  const dragStart = now();
  await Promise.all([
    dragHandle(a, 'p-sync', 160, 0),
    (async () => {
      await sleep(100);
      await dragHandle(b, 'p-sync', -160, 40);
    })(),
  ]);
  const dragged = now();
  let onePosAt = null;
  let posA = null;
  let posB = null;
  const untilPos = dragged + 3000;
  while (now() < untilPos) {
    posA = (await slideJson(a, bodySlide)).slots?.main?.find((x) => x.id === 'p-sync')?.pos ?? null;
    posB = (await slideJson(b, bodySlide)).slots?.main?.find((x) => x.id === 'p-sync')?.pos ?? null;
    if (
      posA &&
      posB &&
      JSON.stringify(posA) === JSON.stringify(posB) &&
      JSON.stringify(posA) !== JSON.stringify(posBefore)
    ) {
      onePosAt = now() - dragged;
      break;
    }
    await sleep(100);
  }
  await settled(a);
  await settled(b);
  const posA2 =
    (await slideJson(a, bodySlide)).slots?.main?.find((x) => x.id === 'p-sync')?.pos ?? null;
  const posB2 =
    (await slideJson(b, bodySlide)).slots?.main?.find((x) => x.id === 'p-sync')?.pos ?? null;
  const dragWire = report.wire
    .filter((row) => row.t >= dragStart)
    .map((p) => ({
      who: p.who,
      base: p.base,
      seqs: p.entrySeqs,
      ops: p.ops.map((m) => `${m.op} ${m.path ?? ''}`),
    }));
  // A moves the block while B deletes its slide within 200 ms
  await selectBlock(a, 'p-sync');
  const sb = await state(b);
  const deleteStart = now();
  const [, removed] = await Promise.all([
    dragHandle(a, 'p-sync', 0, 120),
    (async () => {
      await sleep(100);
      // B deletes the slide through Slide > Delete slide (the product's path); the window API
      // is the fallback when the menu does not open in time
      try {
        await b.locator('[data-control="menubar.slide"]').first().click({ timeout: 2000 });
        await b.locator('#ts-menu-slide').waitFor({ timeout: 3000 });
        await b.locator('[data-control="menu.slide.deleteSlide"]').first().click({ timeout: 2000 });
        return { ok: true, via: 'menu' };
      } catch (error) {
        return invoke(b, 'slide.remove', { slideId: bodySlide, baseRevision: sb.revision }).then(
          () => ({ ok: true, via: 'api', menuError: String(error).slice(0, 120) }),
          (error2) => ({ ok: false, via: 'api', error: String(error2).slice(0, 200) }),
        );
      }
    })(),
  ]);
  let goneAt = null;
  const untilGone = deleteStart + 5000;
  while (now() < untilGone) {
    const [oa, ob] = await Promise.all([slideOrder(a), slideOrder(b)]);
    if (!oa.includes(bodySlide) && !ob.includes(bodySlide)) {
      goneAt = now() - deleteStart;
      break;
    }
    await sleep(150);
  }
  await sleep(800);
  const cardA = await a
    .locator('.ts-conflict')
    .first()
    .textContent()
    .catch(() => null);
  const cardB = await b
    .locator('.ts-conflict')
    .first()
    .textContent()
    .catch(() => null);
  const deleteWire = report.wire
    .filter((row) => row.t >= deleteStart)
    .map((p) => ({
      who: p.who,
      status: p.status,
      base: p.base,
      seqs: p.entrySeqs,
      ops: p.ops.map((m) => `${m.op} ${m.path ?? ''}`),
      rejected: p.rejected,
    }));
  report.rows['sync.structural.concurrent'] = {
    twoDrags: {
      posBefore,
      onePositionWithinMs: onePosAt,
      posA,
      posB,
      posA2,
      posB2,
      sameAfterSettle: JSON.stringify(posA2) === JSON.stringify(posB2),
      wire: dragWire,
    },
    moveAgainstDelete: {
      removed,
      bothGoneWithinMs: goneAt,
      orderA: await slideOrder(a),
      orderB: await slideOrder(b),
      rejectCardA: cardA,
      rejectCardB: cardB,
      wire: deleteWire,
    },
  };
  log(
    `structural: one position in ${onePosAt} ms (same after settle ${JSON.stringify(posA2) === JSON.stringify(posB2)}); slide gone in ${goneAt} ms; cardA ${JSON.stringify(cardA)}`,
  );

  report.final = { a: await state(a), b: await state(b), c: await state(c) };
  await bCtx.close();
  await cCtx.close();
} catch (error) {
  report.error = String(error?.stack ?? error);
  log(`error: ${report.error.split('\n')[0]}`);
} finally {
  // teardown: the scratch deck is trashed and removed through the product's actions
  if (deckId !== null) {
    try {
      const s = await state(a);
      await invoke(a, 'deck.trash', { id: deckId, baseRevision: s.revision }).catch(
        () => undefined,
      );
      const after = await state(a).catch(() => s);
      await invoke(a, 'deck.remove', {
        id: deckId,
        confirm: true,
        baseRevision: after.revision,
      }).catch(() => undefined);
      const status = await a
        .evaluate(
          async (url) => (await fetch(url, { method: 'GET' })).status,
          `${BASE}/edit/${deckId}`,
        )
        .catch(() => null);
      report.teardown = { deckId, editStatus: status };
    } catch (error) {
      report.teardown = { deckId, error: String(error) };
    }
  }
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  log(`wrote ${OUT}`);
}

// R2's two browser drive of the realtime round (docs/REALTIME.md 5.4 item 1; realtime/build/r2.md):
// A on the origin `--a`, B on the origin `--b` (one node or vite server for the memory tier, two
// node servers over one store and one Redis database for the two process run), both anonymous,
// on one scratch deck A makes from /new, both on slide 1. Reads R2's rows in the DOM of the other
// browser: `realtime.caret.offset-after-merge`, the outline inside the own ring (defect 5),
// `realtime.block.drag-live`, `realtime.pointer.second-browser`, `realtime.caret.dims-and-leaves`,
// `realtime.reload.loses-nothing`, `realtime.reconnect.loses-nothing`. Localhost only: the window
// API is open under TURBOSLIDE_LOCAL_OPEN=1 so no bearer is needed, and the deck is trashed and
// removed by its id at the end. Writes facts.json and the pictures under `--out`.
//   node docs/gslides-parity/realtime/build/r2/drive.mjs --a http://localhost:4472 \
//     --b http://localhost:4482 --out docs/gslides-parity/realtime/build/r2/redis --label redis
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  chromium,
} = require('/Users/kevinliu/repos/Turboslide-realtime/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const BASE_A = arg('a', 'http://localhost:4472');
const BASE_B = arg('b', BASE_A);
const LABEL = arg('label', 'memory');
const OUT = resolve(arg('out', `docs/gslides-parity/realtime/build/r2/${LABEL}`));
const ONLY = arg('only', '')
  .split(',')
  .filter((s) => s !== '');
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 70;

const facts = { startedAt: new Date().toISOString(), baseA: BASE_A, baseB: BASE_B, label: LABEL };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const ms = (from) => Math.round(performance.now() - from);
const wants = (row) => ONLY.length === 0 || ONLY.includes(row);
const sleep = (t) => new Promise((r) => setTimeout(r, t));

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
const blockEl = (page, blockId) =>
  page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${blockId}"]`)
    .first();

/** The remote presence drawings of the overlay with the client they belong to. */
const remoteDrawings = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].map((el) => ({
        client: el.getAttribute('data-client'),
        text: el.textContent?.trim() ?? '',
        box: rect(el),
        classes: el.className,
        offset: el.getAttribute('data-offset'),
        kept: el.getAttribute('data-kept'),
        inside: el.getAttribute('data-inside'),
        block: el.getAttribute('data-block'),
        state: el.getAttribute('data-state'),
        transform: el.style.transform || null,
        style: {
          left: el.style.left,
          top: el.style.top,
          width: el.style.width,
          height: el.style.height,
        },
      }));
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    return {
      sheet: sheet ? rect(sheet) : null,
      carets: pick('.ts-remote-caret'),
      flags: pick('.ts-flag'),
      outlines: pick('.ts-remote-outline:not(.ts-remote-drag)'),
      ghosts: pick('.ts-remote-drag'),
      pointers: pick('.ts-remote-pointer-group'),
      chips: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
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

/** Opens an inline session on a run and types without closing it. */
async function beginTyping(page, run, text, { replace = true, startDelay = 0 } = {}) {
  if (startDelay > 0) await sleep(startDelay);
  await runEl(page, run).dblclick();
  await sleep(150);
  /* Meta+ArrowDown is the end of the text; End is the end of the visual line, which on a wrapped
     heading left the caret mid text (run 3 of the memory tier) */
  await page.keyboard.press(replace ? 'Meta+a' : 'Meta+ArrowDown');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
}

const clientIdOf = async (page) => {
  const s = await state(page);
  return s.presence?.clientId ?? s.sync?.clientId ?? null;
};

const browser = await chromium.launch({ headless: true });
const mk = (baseURL) =>
  browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
const ctxA = await mk(BASE_A);
let ctxB = await mk(BASE_B);
const A = await ctxA.newPage();
let B = await ctxB.newPage();

/**
 * The sockets each page opens (the Cloudflare phase, docs/CLOUDFLARE.md 3.6.3): on the `do` tier
 * the room client's transport is one WebSocket per open to the deck's Durable Object, and
 * Playwright reports its URL and its frames (not the subprotocols or the close code). The drive
 * counts the frames by kind, keeps the hello's tier and the object's `room` frame, and writes the
 * rows under `transport.sockets`; on the SSE tiers the lists stay empty. The tab token and the
 * retire list are cut from the URL before it is written.
 */
const sockets = { A: [], B: [] };
const watchSockets = (page, who) => {
  page.on('websocket', (ws) => {
    // the room's sockets alone: vite's HMR socket on a dev server is not the transport's
    if (!/\/rooms\//.test(ws.url())) return;
    const row = {
      url: ws
        .url()
        .replace(/tab=[0-9a-f]+/, 'tab=<token>')
        .replace(/retire=[^&]*/, 'retire=<ids>'),
      openedAt: new Date().toISOString(),
      sent: 0,
      received: 0,
      pings: 0,
      pongs: 0,
      ops: 0,
      presence: 0,
      leave: 0,
      ticket: 0,
      join: 0,
      acks: 0,
      opEvents: 0,
      presenceEvents: 0,
      hello: null,
      room: null,
      resend: 0,
      reauth: 0,
      closed: false,
    };
    sockets[who].push(row);
    const parse = (payload) => {
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    };
    ws.on('framesent', (frame) => {
      row.sent += 1;
      if (frame.payload === 'ping') {
        row.pings += 1;
        return;
      }
      const j = parse(frame.payload);
      if (j === null) return;
      if (j.t === 'ops') row.ops += 1;
      else if (j.t === 'presence') row.presence += 1;
      else if (j.t === 'leave') row.leave += 1;
      else if (j.t === 'ticket') row.ticket += 1;
      else if (j.t === 'join') row.join += 1;
    });
    ws.on('framereceived', (frame) => {
      row.received += 1;
      if (frame.payload === 'pong') {
        row.pongs += 1;
        return;
      }
      const j = parse(frame.payload);
      if (j === null) return;
      if (j.t === 'ack') row.acks += 1;
      else if (j.t === 'room')
        row.room = { colo: j.colo, object: j.object, idleMs: j.idleMs, maxMs: j.maxMs };
      else if (j.t === 'reauth') row.reauth += 1;
      else if (j.type === 'hello')
        row.hello = { tier: j.tier, seq: j.seq, covered: j.covered, at: new Date().toISOString() };
      else if (j.type === 'op') row.opEvents += 1;
      else if (j.type === 'presence') row.presenceEvents += 1;
      else if (j.type === 'resend') row.resend += 1;
    });
    ws.on('close', () => {
      row.closed = true;
      row.closedAt = new Date().toISOString();
    });
  });
};
watchSockets(A, 'A');
watchSockets(B, 'B');
let deckId = null;
let linkB = null;
let heading = null;
let subtitle = null;
let subtitleBlock = null;
let aId = null;
let bId = null;

const instanceOf = async (page) => {
  try {
    const s = await invoke(page, 'sync.status', {});
    return s?.instance ?? s?.storeCalls?.instance ?? null;
  } catch {
    return null;
  }
};

async function joinB(page) {
  await page.goto(linkB);
  await page.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(page);
  await page.mouse.click(20, 500);
  const id = await poll(async () => await clientIdOf(page), 10_000, 100);
  return id;
}

/** The ids as they stand now: a stream reopened after a cut mints a new client id (room-client.ts hello). */
async function refreshIds() {
  aId = (await clientIdOf(A)) ?? aId;
  if (B) bId = (await clientIdOf(B)) ?? bId;
}

/** The page's own caret as a plain offset inside a run (the selection's start against the run's start). */
const ownCaret = (page, run) =>
  page.evaluate((key) => {
    const el = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${key}"]`,
    );
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return [...pre.toString()].length;
  }, run);

/** Reads B's caret as A draws it: the transformed offset and the kept flag. */
const caretIn = async (page, client) => {
  const d = await remoteDrawings(page);
  const caret = d.carets.find((c) => c.client === client);
  return caret
    ? { offset: Number(caret.offset), kept: caret.kept === 'true', box: caret.box }
    : null;
};

try {
  // ---- A creates the deck from /new and gives it a title (revision 1)
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  subtitle = runs0.find((r) => r.run !== heading)?.run ?? null;
  subtitleBlock = subtitle ? subtitle.split('/')[0] : null;
  say('runs.chosen', { heading, subtitle, subtitleBlock });
  await beginTyping(A, heading, 'Realtime drive');
  await A.keyboard.press('Escape');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  const prompt = ctl(A, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(A, 'dialog.namePrompt.close').count()) > 0)
      await ctl(A, 'dialog.namePrompt.close').click();
    else await ctl(A, 'dialog.namePrompt.skip').click();
  }
  /* the do tier (the Cloudflare phase): the /new page's payload carries no room ticket, since the
     deck did not exist when it was served, and the ticket route refuses a first mint without a
     client id (build/r2.md R2-C3), so A reloads once now that the deck exists and the editor
     loader mints the ticket into the page; B's join below is a full navigation and gets its own */
  if (LABEL === 'do') {
    await A.reload();
    await waitEditor(A);
    await A.mouse.click(20, 500);
    say('A.reloadedForTicket', true);
  }
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url;
  linkB = linkUrl ? linkUrl.replace(/^https?:\/\/[^/]+/, BASE_B) : `${BASE_B}/edit/${deckId}`;
  say('share.link', linkB.replace(/\/s\/.*$/, '/s/<token>'));
  aId = await clientIdOf(A);
  say('A.instance', await instanceOf(A));

  // ---- B joins on its origin
  const tJoin = performance.now();
  bId = await joinB(B);
  say('B.instance', await instanceOf(B));
  say('join.ms', ms(tJoin));
  const chipInA = await poll(async () => (await remoteDrawings(A)).chips.length > 0, 10_000, 100);
  say('join.chipInA', { present: Boolean(chipInA), ms: ms(tJoin), aId, bId });
  await A.mouse.click(20, 500);

  // ---- realtime.caret.offset-after-merge: three rounds, both type into the heading
  if (wants('caret')) {
    await refreshIds();
    /* every round appends at the end (End, then the word): a select all by both inside 150 ms
       replaces the other's letters on a tier this fast, which is the drive's race and not a row */
    const rounds = [
      { a: ' alpha', b: ' bravo', replace: false },
      { a: ' charlie', b: ' delta', replace: false },
      { a: ' echo', b: ' foxtrot', replace: false },
    ];
    const readings = [];
    for (const [i, round] of rounds.entries()) {
      const t0 = performance.now();
      const typeA = beginTyping(A, heading, round.a, { replace: round.replace });
      const typeB = beginTyping(B, heading, round.b, { replace: round.replace, startDelay: 150 });
      // the first moment each browser draws the other's caret, from the typing's start
      let firstBInA = null;
      let firstAInB = null;
      const watch = (async () => {
        while (performance.now() - t0 < 2500 && (firstBInA === null || firstAInB === null)) {
          const [inA, inB] = await Promise.all([caretIn(A, bId), caretIn(B, aId)]);
          if (inA && firstBInA === null) firstBInA = ms(t0);
          if (inB && firstAInB === null) firstAInB = ms(t0);
          await sleep(40);
        }
      })();
      await Promise.all([typeA, typeB]);
      await watch;
      // the words have landed on both sides: the caret the other draws sits after the owner's word
      await sleep(900);
      const textA = (await runText(A, heading)) ?? '';
      const textB = (await runText(B, heading)) ?? '';
      const bInA = await caretIn(A, bId);
      const aInB = await caretIn(B, aId);
      const ownA = await ownCaret(A, heading);
      const ownB = await ownCaret(B, heading);
      const wordB = round.b.trim();
      const wordA = round.a.trim();
      const wantBInA = textA.indexOf(wordB) >= 0 ? textA.indexOf(wordB) + wordB.length : null;
      const wantAInB = textB.indexOf(wordA) >= 0 ? textB.indexOf(wordA) + wordA.length : null;
      const reading = {
        round: i + 1,
        textA,
        textB,
        converged: textA === textB,
        bothWords: textA.includes(wordA) && textA.includes(wordB),
        bInA,
        aInB,
        ownA,
        ownB,
        wantBInA,
        wantAInB,
        okBInA: bInA !== null && bInA.offset === wantBInA && bInA.offset > 0,
        okAInB: aInB !== null && aInB.offset === wantAInB && aInB.offset > 0,
        firstBInAms: firstBInA,
        firstAInBms: firstAInB,
      };
      readings.push(reading);
      say(`caret.round${i + 1}`, reading);
      say(`shot.caret.r${i + 1}.A`, await shot(A, `01-caret-r${i + 1}-a`, await stageClip(A)));
      say(`shot.caret.r${i + 1}.B`, await shot(B, `01-caret-r${i + 1}-b`, await stageClip(B)));
      await A.keyboard.press('Escape');
      await B.keyboard.press('Escape');
      await poll(
        async () => {
          const [ta, tb] = await Promise.all([runText(A, heading), runText(B, heading)]);
          return ta === tb && (await state(A)).pending === 0 && (await state(B)).pending === 0;
        },
        10_000,
        100,
      );
    }
    say('realtime.caret.offset-after-merge', {
      pass: readings.every((r) => r.okBInA && r.okAInB && r.bothWords && r.converged),
      rounds: readings.map((r) => ({
        round: r.round,
        okBInA: r.okBInA,
        okAInB: r.okAInB,
        bothWords: r.bothWords,
        converged: r.converged,
      })),
    });
  }

  // ---- the outline inside the own ring (defect 5): both select the subtitle block
  if (wants('inside') && subtitleBlock) {
    await refreshIds();
    await A.mouse.click(20, 500);
    await B.mouse.click(20, 500);
    await blockEl(A, subtitleBlock).click();
    await sleep(200);
    await blockEl(B, subtitleBlock).click();
    const t0 = performance.now();
    const inside = await poll(
      async () => {
        const d = await remoteDrawings(A);
        const row = d.outlines.find((o) => o.client === bId && o.block === subtitleBlock);
        return row && row.inside === 'true' ? row : null;
      },
      5000,
      40,
    );
    const blockBox = await blockEl(A, subtitleBlock).boundingBox();
    say('inside.outline', {
      ms: inside ? ms(t0) : null,
      outline: inside ?? null,
      blockBox: blockBox
        ? [
            Math.round(blockBox.x),
            Math.round(blockBox.y),
            Math.round(blockBox.width),
            Math.round(blockBox.height),
          ]
        : null,
      insetOk:
        inside && blockBox
          ? Math.abs(inside.box[0] - (blockBox.x + 2)) <= 2 &&
            Math.abs(inside.box[1] - (blockBox.y + 2)) <= 2 &&
            Math.abs(inside.box[2] - (blockBox.width - 4)) <= 3
          : false,
    });
    say('shot.inside.A', await shot(A, '02-inside-a', await stageClip(A)));
    say('shot.inside.B', await shot(B, '02-inside-b', await stageClip(B)));
  }

  // ---- realtime.block.drag-live: A keeps the subtitle selected while B drags it 160 px
  if (wants('drag') && subtitleBlock) {
    await refreshIds();
    const before = await blockEl(A, subtitleBlock).boundingBox();
    const handle = B.locator(`.ts-overlay [data-control="handle.${subtitleBlock}.move"]`).first();
    const hb = (await handle.count()) > 0 ? await handle.boundingBox() : null;
    const target = hb ?? (await blockEl(B, subtitleBlock).boundingBox());
    const cx = target.x + (hb ? target.width / 2 : 12);
    const cy = target.y + (hb ? target.height / 2 : 12);
    const seenGhost = [];
    let releaseAt = null;
    const drag = (async () => {
      await B.mouse.move(cx, cy);
      await B.mouse.down();
      for (let i = 1; i <= 16; i += 1) {
        await B.mouse.move(cx + (160 * i) / 16, cy + (40 * i) / 16);
        await sleep(70);
      }
      await sleep(150);
      releaseAt = performance.now();
      await B.mouse.up();
    })();
    const t0 = performance.now();
    const sample = (async () => {
      while (releaseAt === null) {
        const d = await remoteDrawings(A);
        const ghost = d.ghosts.find((g) => g.client === bId);
        const flag = d.flags.find((f) => f.client === bId && f.state === 'moving');
        seenGhost.push({
          at: ms(t0),
          ghost: ghost
            ? { left: ghost.style.left, top: ghost.style.top, text: flag?.text ?? null }
            : null,
        });
        await sleep(80);
      }
    })();
    await sleep(600);
    say('shot.drag.mid.A', await shot(A, '03-drag-mid-a', await stageClip(A)));
    say('shot.drag.mid.B', await shot(B, '03-drag-mid-b', await stageClip(B)));
    await drag;
    await sample;
    const moved = await poll(
      async () => {
        const now = await blockEl(A, subtitleBlock).boundingBox();
        return now && before && Math.abs(now.x - before.x) > 40 ? now : null;
      },
      8000,
      25,
    );
    const movedMs = moved ? ms(releaseAt) : null;
    const ghostGone = await poll(
      async () => (await remoteDrawings(A)).ghosts.every((g) => g.client !== bId),
      5000,
      40,
    );
    const ghostGoneMs = ghostGone ? ms(releaseAt) : null;
    const positions = [...new Set(seenGhost.filter((s) => s.ghost).map((s) => s.ghost.left))];
    const movingWord = seenGhost.some((s) => s.ghost && /moving/.test(s.ghost.text ?? ''));
    say('realtime.block.drag-live', {
      ghostFrames: seenGhost.filter((s) => s.ghost).length,
      samples: seenGhost.length,
      distinctGhostPositions: positions.length,
      movingWord,
      firstGhostMs: seenGhost.find((s) => s.ghost)?.at ?? null,
      blockMovedAfterReleaseMs: movedMs,
      ghostGoneAfterReleaseMs: ghostGoneMs,
      selectionKept: await A.locator(
        `.ts-overlay [data-control="handle.${subtitleBlock}.move"]`,
      ).count(),
      pass: positions.length >= 3 && movingWord && movedMs !== null && movedMs <= 300,
    });
    say('shot.drag.after.A', await shot(A, '03-drag-after-a', await stageClip(A)));
    say('shot.drag.after.B', await shot(B, '03-drag-after-b', await stageClip(B)));
  }

  // ---- realtime.pointer.second-browser: B shows its pointer; A draws it; A hides collaborators' pointers
  if (wants('pointer')) {
    await refreshIds();
    await A.mouse.click(20, 500);
    await B.mouse.click(20, 500);
    let pointerOn = null;
    try {
      pointerOn = await invoke(B, 'presence.pointer', { on: true });
    } catch (error) {
      pointerOn = { error: String(error).slice(0, 160) };
    }
    say('pointer.on', pointerOn);
    const sheetB = await B.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox();
    const sheetA = (await remoteDrawings(A)).sheet;
    const points = [
      [0.25, 0.3],
      [0.5, 0.5],
      [0.75, 0.7],
    ];
    const readings = [];
    for (const [fx, fy] of points) {
      const x = sheetB.x + sheetB.width * fx;
      const y = sheetB.y + sheetB.height * fy;
      const t0 = performance.now();
      await B.mouse.move(x, y, { steps: 4 });
      const want = { x: Math.round(1600 * fx), y: Math.round(900 * fy) };
      const drawn = await poll(
        async () => {
          const d = await remoteDrawings(A);
          const p = d.pointers.find((row) => row.client === bId);
          if (!p || !p.transform) return null;
          const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(p.transform);
          if (!m) return null;
          const k = d.sheet[2] / 1600;
          const at = { x: Math.round(Number(m[1]) / k), y: Math.round(Number(m[2]) / k) };
          return Math.abs(at.x - want.x) <= 12 && Math.abs(at.y - want.y) <= 12
            ? { at, flag: d.flags.find((f) => f.client === bId)?.text ?? null }
            : null;
        },
        3000,
        25,
      );
      readings.push({ want, drawn: drawn ?? null, ms: drawn ? ms(t0) : null });
    }
    say('pointer.readings', readings);
    say('shot.pointer.A', await shot(A, '04-pointer-a', await stageClip(A)));
    // A hides the collaborators' pointers through View > Live pointers (R3's row ids)
    let hidden = null;
    try {
      /* the two View rows are parked (model.ts; R3 asks the integrator to unpark them): Tools >
         Advanced tools shows them, as the walk's view area reaches them */
      const advanced = () =>
        A.evaluate(
          () => document.querySelector('.pt-viewer')?.hasAttribute('data-advanced-tools') === true,
        );
      if (!(await advanced())) {
        await A.keyboard.press('Escape');
        await ctl(A, 'menubar.tools').click();
        await A.locator('[data-menu-item="tools.advancedTools"]').waitFor({ timeout: 4000 });
        await A.locator('[data-menu-item="tools.advancedTools"]').click();
        await poll(advanced, 4000, 50);
        await A.keyboard.press('Escape');
      }
      await ctl(A, 'menubar.view').click();
      await A.locator('#ts-menu-view').waitFor({ timeout: 4000 });
      await ctl(A, 'menu.view.livePointers').hover();
      /* the second row's id is `others` since the integrator's seam of 2026-10-01 (REALTIME.md
         5.2; build/r3.md request 2); `collaborators` is the id of a build from before it */
      await sleep(300);
      const othersId =
        (await ctl(A, 'menu.view.livePointers.others').count()) > 0
          ? 'menu.view.livePointers.others'
          : 'menu.view.livePointers.collaborators';
      await ctl(A, othersId).waitFor({ timeout: 4000 });
      await ctl(A, othersId).click();
      await sleep(250);
      await B.mouse.move(sheetB.x + sheetB.width * 0.4, sheetB.y + sheetB.height * 0.4, {
        steps: 3,
      });
      const gone = await poll(
        async () => (await remoteDrawings(A)).pointers.every((p) => p.client !== bId),
        3000,
        40,
      );
      hidden = { driven: true, gone: Boolean(gone) };
      await A.keyboard.press('Escape');
    } catch (error) {
      hidden = { driven: false, reason: String(error).slice(0, 200) };
      await A.keyboard.press('Escape').catch(() => undefined);
    }
    say('pointer.hiddenInA', hidden);
    say('realtime.pointer.second-browser', {
      drawn: readings.every((r) => r.drawn !== null),
      within300: readings.every((r) => r.ms !== null && r.ms <= 300),
      flagNamesB: readings.every((r) => r.drawn?.flag),
      hidden,
      sheetA,
      pass: readings.every((r) => r.drawn !== null && r.ms <= 300) && hidden?.gone === true,
    });
    try {
      await invoke(B, 'presence.pointer', { on: false });
    } catch {
      /* the switch stays on; the leave takes it */
    }
  }

  // ---- realtime.reload.loses-nothing: five words each into two blocks, A reloads after its third
  if (wants('reload') && subtitle) {
    await refreshIds();
    await A.mouse.click(20, 500);
    await B.mouse.click(20, 500);
    const wordsA = ['one', 'two', 'three', 'four', 'five'];
    const wordsB = ['uno', 'dos', 'tres', 'cuatro', 'cinco'];
    let lastKeyA = null;
    const typeA = (async () => {
      await beginTyping(A, heading, wordsA.slice(0, 3).join(' ') + ' ');
      await A.keyboard.press('Escape');
      /* the words are saved before the reload: a reload inside the flush is the persisted queue's
         path (SPEC-3 0.7), which asks before it applies */
      await poll(async () => (await state(A)).pending === 0, 10_000, 50);
      await A.reload();
      await waitEditor(A);
      await A.mouse.click(20, 500);
      await beginTyping(A, heading, wordsA.slice(3).join(' '), { replace: false });
      lastKeyA = performance.now();
      await A.keyboard.press('Escape');
    })();
    const typeB = (async () => {
      await beginTyping(B, subtitle, wordsB.join(' '));
      await B.keyboard.press('Escape');
    })();
    await Promise.all([typeA, typeB]);
    const converged = await poll(
      async () => {
        const [ra, rb, sa, sb] = await Promise.all([runsOf(A), runsOf(B), state(A), state(B)]);
        const ha = ra.find((r) => r.run === heading)?.text ?? '';
        const hb = rb.find((r) => r.run === heading)?.text ?? '';
        const sta = ra.find((r) => r.run === subtitle)?.text ?? '';
        const stb = rb.find((r) => r.run === subtitle)?.text ?? '';
        const all =
          wordsA.every((w) => ha.includes(w) && hb.includes(w)) &&
          wordsB.every((w) => sta.includes(w) && stb.includes(w));
        return all &&
          ha === hb &&
          sta === stb &&
          sa.pending === 0 &&
          sb.pending === 0 &&
          sa.revision === sb.revision
          ? { ha, hb, sta, stb, revA: sa.revision, revB: sb.revision }
          : null;
      },
      15_000,
      50,
    );
    say('realtime.reload.loses-nothing', {
      msAfterLastKeystroke: converged ? ms(lastKeyA) : null,
      converged: converged ?? null,
      pass: converged !== null && ms(lastKeyA) <= 3000 + 1500,
    });
    say('shot.reload.A', await shot(A, '06-reload-a', await stageClip(A)));
    say('shot.reload.B', await shot(B, '06-reload-b', await stageClip(B)));
  }

  // ---- realtime.reconnect.loses-nothing: B offline 20 s while both type; B back
  if (wants('reconnect') && subtitle) {
    await refreshIds();
    await A.mouse.click(20, 500);
    await B.mouse.click(20, 500);
    const infoBefore = await invoke(A, 'deck.info');
    const wordsA = ['red', 'green', 'blue'];
    const wordsB = ['rojo', 'verde', 'azul'];
    await ctxB.setOffline(true);
    const tOff = performance.now();
    const typeA = (async () => {
      await beginTyping(A, heading, ' ' + wordsA.join(' '), { replace: false });
      await A.keyboard.press('Escape');
    })();
    const typeB = (async () => {
      await beginTyping(B, subtitle, ' ' + wordsB.join(' '), { replace: false });
      await B.keyboard.press('Escape');
    })();
    await Promise.all([typeA, typeB]);
    const offlineWord = await poll(
      async () => (await state(B)).sync?.offline === true || (await state(B)).pending > 0,
      5000,
      100,
    );
    await sleep(Math.max(0, 20_000 - ms(tOff)));
    await ctxB.setOffline(false);
    const tOn = performance.now();
    const converged = await poll(
      async () => {
        const [ra, rb, sa, sb] = await Promise.all([runsOf(A), runsOf(B), state(A), state(B)]);
        const ha = ra.find((r) => r.run === heading)?.text ?? '';
        const hb = rb.find((r) => r.run === heading)?.text ?? '';
        const sta = ra.find((r) => r.run === subtitle)?.text ?? '';
        const stb = rb.find((r) => r.run === subtitle)?.text ?? '';
        const all =
          wordsA.every((w) => ha.includes(w) && hb.includes(w)) &&
          wordsB.every((w) => sta.includes(w) && stb.includes(w));
        const doubled =
          wordsB.some((w) => sta.split(w).length > 2) || wordsA.some((w) => ha.split(w).length > 2);
        return all && !doubled && ha === hb && sta === stb && sa.pending === 0 && sb.pending === 0
          ? { ha, hb, sta, stb, revA: sa.revision, revB: sb.revision }
          : null;
      },
      20_000,
      50,
    );
    const infoAfter = await invoke(A, 'deck.info');
    say('realtime.reconnect.loses-nothing', {
      offlineNoticed: Boolean(offlineWord),
      msAfterReconnect: converged ? ms(tOn) : null,
      converged: converged ?? null,
      recordsBefore: infoBefore?.counts?.records ?? infoBefore?.revision ?? null,
      recordsAfter: infoAfter?.counts?.records ?? infoAfter?.revision ?? null,
      pass: converged !== null && ms(tOn) <= 3000 + 1500,
    });
    say('shot.reconnect.A', await shot(A, '07-reconnect-a', await stageClip(A)));
    say('shot.reconnect.B', await shot(B, '07-reconnect-b', await stageClip(B)));
  }

  // ---- realtime.caret.dims-and-leaves: B opens a caret and stays still 30 s, then closes its tab
  if (wants('dim')) {
    await refreshIds();
    await A.mouse.click(20, 500);
    await runEl(B, heading).dblclick();
    await sleep(200);
    await B.keyboard.press('End');
    await B.keyboard.type(' z', { delay: TYPE_DELAY });
    await B.keyboard.press('Backspace');
    await B.keyboard.press('Backspace');
    const t0 = performance.now();
    const drawn = await poll(async () => await caretIn(A, bId), 5000, 50);
    say('dim.caretDrawnMs', drawn ? ms(t0) : null);
    const dim = await poll(
      async () => {
        const d = await remoteDrawings(A);
        const c = d.carets.find((row) => row.client === bId);
        return c && /is-dim/.test(c.classes) ? ms(t0) : null;
      },
      40_000,
      250,
    );
    say('dim.caretDimMs', dim ?? null);
    say('shot.dim.A', await shot(A, '05-dim-a', await stageClip(A)));
    const tClose = performance.now();
    await ctxB.close();
    const gone = await poll(
      async () => {
        const d = await remoteDrawings(A);
        const any =
          d.carets.some((c) => c.client === bId) ||
          d.outlines.some((o) => o.client === bId) ||
          d.flags.some((f) => f.client === bId) ||
          d.chips.length > 0;
        return any ? null : ms(tClose);
      },
      10_000,
      50,
    );
    say('dim.leftMs', gone ?? null);
    say('realtime.caret.dims-and-leaves', {
      dimMs: dim ?? null,
      leftMs: gone ?? null,
      pass: dim !== null && dim >= 29_000 && dim <= 36_000 && gone !== null && gone <= 2000,
    });
    say('shot.left.A', await shot(A, '05-left-a', await stageClip(A)));
    B = null;
  }
} catch (error) {
  say('error', { message: String(error?.stack ?? error).slice(0, 2000) });
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  if (B) await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  // ---- the scratch deck leaves by its id: trash, then remove forever
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info');
      await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const trashed = await invoke(A, 'deck.info').catch(() => info);
      await invoke(A, 'deck.remove', { id: deckId, confirm: true, baseRevision: trashed.revision });
      const gone = await fetch(`${BASE_A}/edit/${deckId}`, { redirect: 'manual' });
      say('teardown', { id: deckId, editStatus: gone.status });
    } catch (error) {
      say('teardown.error', String(error).slice(0, 300));
    }
  }
  // the wire each page used (the do tier's sockets; empty lists on the SSE tiers) and the client's own word
  say('transport.sockets', sockets);
  try {
    say('transport.status.A', (await state(A)).sync ?? null);
  } catch {
    say('transport.status.A', null);
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
  await browser.close();
}

// The verifier's hand drive of the people surfaces on the do tier (docs/CLOUDFLARE.md 2.1, 5.5; the
// realtime round's pass 1, 2026-10-02): two anonymous people at human speed, A on `--a` and B on
// `--b` (the two process run: two node servers over one tmp overlay, one Worker between them), a
// third context C for the access revocation. Every section records what each person saw, with a
// timestamp per reading, a picture where the surface is visual and the facts in one JSON; nothing is
// judged here: the verifier reads the numbers and the pictures against the rows' bounds. A section
// that fails records its error and the drive goes on. The deck is made from /new by A and trashed
// and removed by its id at the end.
//
//   node docs/gslides-parity/cloudflare/verify/hand.mjs --a http://localhost:4479 --b http://localhost:4489 \
//     --out <dir> [--width 1440] [--appearance light|dark] [--sections a,b,c] [--room-host 127.0.0.1:8799]
//
// Sections (default: every one but `ticket`, `title`, `image` and `share`): join, keystroke, caret,
// merge, title, image, outline, drag, pointer, card, follow, agent, reload, offline, dims, share,
// revoke, ticket. `title`, `image` and `share` are pass 3's (the two typers in the cover title, a
// picture inserted and replaced by upload, the Share dialog's general link across a reload). `ticket` holds both tabs open for
// `--ticket-wait` seconds (default 630, past the 600 s ticket and its refresh at 480 s) and reads the
// sockets' frames. The Worker's /health and, with TURBOSLIDE_ROOM_BEARER in the environment (a
// wrapper sets it; nothing here prints it), the object's counters are read before and after.
// Playwright is the worktree's playwright-core, resolved from the repository's package.json.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const BASE_A = arg('a', 'http://localhost:4479').replace(/\/$/, '');
const BASE_B = arg('b', BASE_A).replace(/\/$/, '');
/* the viewer of the revocation section: on B's origin by default, `--c` names another (the origin that wrote the record) */
const BASE_C = arg('c', BASE_B).replace(/\/$/, '');
const WIDTH = Number(arg('width', '1440'));
const HEIGHT = WIDTH >= 1440 ? 900 : 800;
const APPEARANCE = arg('appearance', 'light') === 'dark' ? 'dark' : 'light';
const OUT = resolve(arg('out', `hand-${WIDTH}-${APPEARANCE}`));
const ALL =
  'join,keystroke,caret,merge,outline,drag,pointer,card,follow,agent,reload,offline,dims,revoke';
const SECTIONS = new Set(arg('sections', ALL).split(','));
const TICKET_WAIT_S = Number(arg('ticket-wait', '630'));
/* how long the revocation section waits for C's socket to close or C to leave (pass 2: wrangler dev's alarms fire about 10 s late) */
const REVOKE_WAIT_MS = Number(arg('revoke-wait', '25')) * 1000;
const ROOM_HOST = arg('room-host', process.env.TURBOSLIDE_ROOM_HOST ?? '127.0.0.1:8799');
const ROOM_BEARER = process.env.TURBOSLIDE_ROOM_BEARER ?? '';
const ROOM_HTTP = /^(127\.0\.0\.1|localhost)/.test(ROOM_HOST)
  ? `http://${ROOM_HOST}`
  : `https://${ROOM_HOST}`;
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
mkdirSync(OUT, { recursive: true });

const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  width: WIDTH,
  appearance: APPEARANCE,
  sections: [...SECTIONS],
  pictures: [],
};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)?.slice(0, 600)}`);
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const HUMAN = 90; // ms between keys inside a word, a person's pace

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
async function poll(fn, timeout = 30_000, every = 40) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return last;
}
const connected = async (page) => Boolean((await state(page)).sync?.connected);
const clientIdOf = async (page) => {
  const s = await state(page);
  return s.presence?.clientId ?? s.sync?.clientId ?? null;
};
async function syncOf(page) {
  try {
    const st = await invoke(page, 'sync.status');
    return {
      tier: st.tier,
      transport: st.transport,
      connected: st.connected,
      seq: st.seq,
      covered: st.covered,
      revision: st.revision,
      colo: st.colo ?? null,
      room: st.room ?? null,
      instance: st.storeCalls?.instance ?? null,
    };
  } catch (error) {
    return { error: String(error).slice(0, 200) };
  }
}
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list');
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
};
const slideJson = async (page, slideId) => {
  const got = await invoke(page, 'slide.get', { slideId });
  return got?.slide ?? got;
};
async function quiet(page, timeout = 8000) {
  await poll(
    async () => {
      const s = (await state(page)).sync;
      return s ? (s.pending ?? 0) === 0 && (s.inflight ?? 0) === 0 : true;
    },
    timeout,
    100,
  );
}
/* the run of a placed text block: the block's `.free` box holds its runs (lib.ts runsOfBlock) */
const runIdOf = (page, blockId) =>
  page.evaluate((a) => {
    const el = (() => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${a}"]`,
      );
      const box = inner?.closest('.free') ?? inner;
      if (!box) return null;
      return box.matches('[data-run]') ? box : box.querySelector('[data-run]');
    })();
    return el?.getAttribute('data-run') ?? null;
  }, blockId);
async function blockRun(page, blockId) {
  const id = await poll(() => runIdOf(page, blockId), 15_000, 100);
  return page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${id}"]`)
    .first();
}
const isEditing = (page) =>
  page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null);
const blockEl = (page, blockId) =>
  page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${blockId}"]`)
    .first();
async function openRunEnd(page, blockId) {
  const el = await blockRun(page, blockId);
  const box = await el.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 120, y + 80);
  await page.mouse.move(x, y, { steps: 8 });
  await sleep(80);
  await page.mouse.dblclick(x, y);
  await poll(() => isEditing(page), 5000, 50);
  await sleep(150);
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('End');
}
async function typeWord(page, word) {
  for (const ch of word) {
    await page.keyboard.type(ch);
    await sleep(HUMAN);
  }
}
async function escapeAll(page) {
  await page.keyboard.press('Escape');
  await sleep(100);
  await page.keyboard.press('Escape');
  await sleep(100);
}
const runText = (page, blockId) =>
  page.evaluate((a) => {
    const el = (() => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${a}"]`,
      );
      const box = inner?.closest('.free') ?? inner;
      if (!box) return null;
      return box.matches('[data-run]') ? box : box.querySelector('[data-run]');
    })();
    return el?.textContent ?? null;
  }, blockId);
async function shot(page, name, clip) {
  await page.waitForTimeout(350);
  const path = join(OUT, `${name}.png`);
  const buffer = await page.screenshot({ path, ...(clip ? { clip } : {}) });
  facts.pictures.push(`${name}.png`);
  return buffer;
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
const pad = (box, m, vp) => ({
  x: Math.max(0, box.x - m),
  y: Math.max(0, box.y - m),
  width: Math.min(vp.width - Math.max(0, box.x - m), box.width + 2 * m),
  height: Math.min(vp.height - Math.max(0, box.y - m), box.height + 2 * m),
});

/* the in page sampler: one rAF loop per name, recording the reading and Date.now() whenever the
   reading changes; read back with `samples(page, name)` */
async function startSampler(page, name, kind, arg1) {
  await page.evaluate(
    ([n, k, a]) => {
      const w = window;
      w.__samples ??= {};
      w.__stop ??= {};
      const out = (w.__samples[n] = []);
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      };
      const read = () => {
        if (k === 'run') {
          const el = (() => {
            const inner = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${a}"]`,
            );
            const box = inner?.closest('.free') ?? inner;
            if (!box) return null;
            return box.matches('[data-run]') ? box : box.querySelector('[data-run]');
          })();
          return el?.textContent ?? null;
        }
        if (k === 'caret') {
          const el = document.querySelector(`.ts-remote-caret[data-client="${a}"]`);
          return el
            ? JSON.stringify({
                box: rect(el),
                offset: el.getAttribute('data-offset'),
                dim: el.classList.contains('is-dim'),
              })
            : null;
        }
        if (k === 'outline') {
          const els = [
            ...document.querySelectorAll(
              `.ts-remote-outline:not(.ts-remote-drag)[data-client="${a}"]`,
            ),
          ];
          return els.length
            ? JSON.stringify(
                els.map((el) => [el.getAttribute('data-block'), el.getAttribute('data-inside')]),
              )
            : null;
        }
        if (k === 'pointer') {
          const el = document.querySelector(`.ts-remote-pointer-group[data-client="${a}"]`);
          return el ? JSON.stringify(rect(el)) : null;
        }
        if (k === 'drag') {
          const el = document.querySelector(`.ts-remote-drag[data-client="${a}"]`);
          return el
            ? JSON.stringify({ box: rect(el), state: el.getAttribute('data-state') })
            : null;
        }
        if (k === 'block') {
          return JSON.stringify(
            rect(
              document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${a}"]`,
              ),
            ),
          );
        }
        if (k === 'chip') {
          return document.querySelector(`[data-control="presence.chip.${a}"]`) ? 'chip' : null;
        }
        if (k === 'slide') {
          return w.turboslide?.studio?.describe?.().state?.slideId ?? null;
        }
        if (k === 'following') {
          return w.turboslide?.studio?.describe?.().state?.presence?.following ?? null;
        }
        return null;
      };
      let last;
      let run = true;
      w.__stop[n] = () => {
        run = false;
      };
      const loop = () => {
        if (!run) return;
        let v;
        try {
          v = read();
        } catch {
          v = 'error';
        }
        if (v !== last) {
          out.push({ at: Date.now(), v });
          last = v;
        }
        requestAnimationFrame(loop);
      };
      loop();
    },
    [name, kind, arg1],
  );
}
async function samples(page, name, stop = true) {
  return page.evaluate(
    ([n, s]) => {
      if (s) window.__stop?.[n]?.();
      return window.__samples?.[n] ?? [];
    },
    [name, stop],
  );
}
const firstAfter = (list, at, pred) => list.find((x) => x.at >= at && pred(x.v));

/* the socket log: every frame the page sends (its `t` word, or `ping`) and every close, by time */
const wsLogScript = () => {
  const Orig = window.WebSocket;
  window.__ws = { opens: [], sent: [], closes: [], recv: 0 };
  class Logged extends Orig {
    constructor(url, protocols) {
      super(url, protocols);
      const u = String(url).replace(/\?.*$/, '');
      window.__ws.opens.push({ at: Date.now(), url: u });
      this.addEventListener('close', (e) =>
        window.__ws.closes.push({
          at: Date.now(),
          url: u,
          code: e.code,
          reason: String(e.reason).slice(0, 80),
        }),
      );
      this.addEventListener('message', () => {
        window.__ws.recv += 1;
      });
    }
    send(data) {
      let t = 'other';
      if (data === 'ping') t = 'ping';
      else {
        try {
          t = JSON.parse(data).t ?? 'json';
        } catch {}
      }
      if (/\/rooms\//.test(this.url)) window.__ws.sent.push({ at: Date.now(), t });
      return super.send(data);
    }
  }
  window.WebSocket = Logged;
};
const wsLog = (page) => page.evaluate(() => window.__ws ?? null);

async function readWorker(path) {
  try {
    const r = await fetch(`${ROOM_HTTP}${path}`, {
      headers: ROOM_BEARER ? { authorization: `Bearer ${ROOM_BEARER}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    try {
      return { status: r.status, body: JSON.parse(text) };
    } catch {
      return { status: r.status, body: text.slice(0, 200) };
    }
  } catch (error) {
    return { error: String(error).slice(0, 200) };
  }
}

const browser = await chromium.launch({ headless: true });
const mk = async (baseURL) => {
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: APPEARANCE,
    ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
  });
  await ctx.addInitScript((value) => {
    try {
      localStorage.setItem('ts-chrome-appearance', value);
      localStorage.setItem('gt-theme', value);
    } catch {}
  }, APPEARANCE);
  await ctx.addInitScript(wsLogScript);
  return ctx;
};
const ctxA = await mk(BASE_A);
const ctxB = await mk(BASE_B);
let A = await ctxA.newPage();
let B = await ctxB.newPage();
let deckId = null;
let linkPath = null;
let aId = null;
let bId = null;
let ctxC = null;

async function section(name, fn) {
  if (!SECTIONS.has(name)) return;
  const t0 = Date.now();
  console.log(`== ${name} ${new Date().toISOString()}`);
  try {
    await fn();
  } catch (error) {
    say(`${name}.error`, String(error?.stack ?? error).slice(0, 1500));
    await A.screenshot({ path: join(OUT, `${name}-error-a.png`) }).catch(() => {});
    await B.screenshot({ path: join(OUT, `${name}-error-b.png`) }).catch(() => {});
    await escapeAll(A).catch(() => {});
    await escapeAll(B).catch(() => {});
  }
  say(`${name}.seconds`, Math.round((Date.now() - t0) / 100) / 10);
}
async function openRoster(page, clientId) {
  const more = ctl(page, 'presence.more');
  const takes = await more
    .evaluate(
      (el) =>
        !el.classList.contains('is-empty') &&
        getComputedStyle(el).pointerEvents !== 'none' &&
        getComputedStyle(el).opacity !== '0',
    )
    .catch(() => false);
  if (takes) await more.click({ timeout: 5000 });
  else await ctl(page, `presence.chip.${clientId}`).click({ timeout: 5000 });
  const row = page.locator(`[data-control="presence.roster.${clientId}"]`).first();
  await row.waitFor({ timeout: 5000 }).catch(() => undefined);
  const shown = await row.isVisible().catch(() => false);
  return {
    row,
    shown,
    item: shown ? await row.getAttribute('data-menu-item') : null,
    text: shown ? ((await row.textContent()) ?? '').trim() : '',
  };
}
async function follow(page, clientId) {
  const r = await openRoster(page, clientId);
  if (r.shown && r.item === 'title.presence.follow') {
    await r.row.click();
    const on = await poll(async () => (await state(page)).presence?.following === clientId, 4000);
    return { offered: true, on: Boolean(on), text: r.text };
  }
  await page.keyboard.press('Escape');
  return { offered: false, on: false, item: r.item, text: r.text };
}
const followingOf = async (page) => (await state(page)).presence?.following ?? null;
async function clickCard(page, slideId) {
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await poll(async () => (await state(page)).slideId === slideId, 8000);
}
async function joinB(page) {
  const t0 = Date.now();
  await page.goto(linkPath);
  await page.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(page);
  const ready = Date.now();
  await poll(() => connected(page), 20_000, 50);
  return { ready, connectedAt: Date.now(), navMs: ready - t0 };
}

try {
  say('worker.health.before', await readWorker('/health'));
  // ---- the deck: A makes it from /new, three slides, two body blocks, the editor link
  await A.goto('/new');
  await waitEditor(A);
  const heading = await A.evaluate(() => {
    const runs = [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ];
    return runs[0]?.getAttribute('data-run') ?? null;
  });
  await A.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${heading}"]`)
    .first()
    .dblclick();
  await sleep(150);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Hand drive', { delay: HUMAN });
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await escapeAll(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  await poll(() => connected(A), 30_000, 100);
  const s1 = (await slideOrder(A))[0];
  for (const [id, text, y] of [
    ['hand-a', 'A writes here', 420],
    ['hand-b', 'B writes here', 620],
    ['hand-agent', 'Before the agent', 820],
  ]) {
    const st = await state(A);
    await invoke(A, 'block.insert', {
      baseRevision: st.revision,
      slideId: s1,
      slot: 'main',
      block: { id, type: 'text', text, pos: { x: 160, y, w: 1280, h: 140 } },
    });
    await quiet(A);
  }
  while ((await slideOrder(A)).length < 3) {
    const order = await slideOrder(A);
    const st = await state(A);
    await invoke(A, 'slide.new', {
      layout: 'split',
      after: order[order.length - 1],
      baseRevision: st.revision,
    });
    await quiet(A);
  }
  const slides = await slideOrder(A);
  await clickCard(A, slides[0]);
  say('slides', slides);
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  linkPath = opened.url
    ? opened.url.replace(/^https?:\/\/[^/]+/, BASE_B)
    : `${BASE_B}/edit/${deckId}`;
  const j0 = await joinB(B);
  aId = await clientIdOf(A);
  bId = await poll(() => clientIdOf(B), 10_000, 100);
  say('setup', {
    clients: { a: aId, b: bId },
    syncA: await syncOf(A),
    syncB: await syncOf(B),
    drawnTheme: {
      a: await A.evaluate(() => document.documentElement.dataset.theme ?? null),
      b: await B.evaluate(() => document.documentElement.dataset.theme ?? null),
    },
    bJoin: j0,
  });
  await shot(A, '00-a-after-setup');

  // ---- the join chip within 1 s, three of three, the instances and the colo named
  await section('join', async () => {
    const rounds = [];
    for (let round = 1; round <= 3; round += 1) {
      if (round > 1) {
        await B.close();
        await poll(
          async () => !(await A.locator(`[data-control="presence.chip.${bId}"]`).count()),
          6000,
          50,
        );
        B = await ctxB.newPage();
      }
      await startSampler(A, `joinA${round}`, 'chip', '__any__');
      const j = await joinB(B);
      const bNow = await clientIdOf(B);
      bId = bNow;
      const chipInA = await poll(
        async () =>
          (await A.locator(`[data-control="presence.chip.${bNow}"]`).count()) > 0
            ? Date.now()
            : null,
        5000,
        20,
      );
      const chipInB = await poll(
        async () =>
          (await B.locator(`[data-control="presence.chip.${aId}"]`).count()) > 0
            ? Date.now()
            : null,
        5000,
        20,
      );
      rounds.push({
        round,
        bReadyAt: j.ready,
        navMs: j.navMs,
        bChipInAms: chipInA ? chipInA - j.ready : null,
        aChipInBms: chipInB ? chipInB - j.ready : null,
        syncA: await syncOf(A),
        syncB: await syncOf(B),
      });
      await samples(A, `joinA${round}`);
    }
    say('join.rounds', rounds);
    await escapeAll(A);
    const chipBox = await ctl(A, `presence.chip.${bId}`).boundingBox();
    const vp = A.viewportSize();
    await shot(
      A,
      '01-join-title-row-a',
      chipBox
        ? {
            x: 0,
            y: 0,
            width: vp.width,
            height: Math.min(vp.height, chipBox.y + chipBox.height + 16),
          }
        : undefined,
    );
    await shot(B, '01-join-title-row-b', { x: 0, y: 0, width: vp.width, height: 64 });
  });

  // ---- the keystroke: A types ten characters one per second into its block; B's DOM by time
  await section('keystroke', async () => {
    await startSampler(B, 'ks', 'run', 'hand-a');
    await openRunEnd(A, 'hand-a');
    const chars = ' abcdefghi'.split('');
    const pressed = [];
    for (const ch of chars) {
      pressed.push({ ch, at: Date.now() });
      await A.keyboard.type(ch);
      await sleep(1000);
    }
    await sleep(800);
    const list = await samples(B, 'ks');
    const base = 'A writes here';
    let typed = base;
    const readings = pressed.map((p) => {
      typed += p.ch;
      const hit = firstAfter(list, p.at, (v) => (v ?? '').replace(/ /g, ' ').startsWith(typed));
      return { ch: p.ch, ms: hit ? hit.at - p.at : null };
    });
    const finalB = (await runText(B, 'hand-a'))?.replace(/ /g, ' ');
    const finalA = (await runText(A, 'hand-a'))?.replace(/ /g, ' ');
    say('keystroke', { readings, finalA, finalB, load: null });
  });

  // ---- the caret: B types in the block A has open; A draws B's caret, every keystroke by time
  await section('caret', async () => {
    await startSampler(A, 'caretA', 'caret', bId);
    await openRunEnd(B, 'hand-a');
    const pressed = [];
    for (const ch of ' jklmnopqr'.split('')) {
      pressed.push({ ch, at: Date.now() });
      await B.keyboard.type(ch);
      await sleep(1000);
    }
    await sleep(600);
    const list = await samples(A, 'caretA');
    const readings = pressed.map((p, i) => {
      const before = [...list].reverse().find((x) => x.at < p.at)?.v ?? null;
      const hit = firstAfter(list, p.at, (v) => v !== null && v !== before);
      return {
        ch: p.ch,
        ms: hit ? hit.at - p.at : null,
        offset: hit ? JSON.parse(hit.v).offset : null,
        i,
      };
    });
    const hue = await A.evaluate((id) => {
      const caret = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
      const chip = document.querySelector(`[data-control="presence.chip.${id}"]`);
      const flag = document.querySelector(`.ts-flag`);
      const col = (el, p) => (el ? getComputedStyle(el)[p] : null);
      return {
        caret: col(caret, 'backgroundColor'),
        caretHue: caret ? getComputedStyle(caret).getPropertyValue('--ts-hue') : null,
        chipHue: chip
          ? getComputedStyle(chip).getPropertyValue('--ts-hue') ||
            getComputedStyle(chip).getPropertyValue('--pt-hue')
          : null,
        flagText: flag?.textContent ?? null,
      };
    }, bId);
    const textB = (await runText(B, 'hand-a'))?.replace(/ /g, ' ');
    say('caret', { readings, hue, textB, drawnLength: textB?.length });
    await shot(A, '02-caret-a', await stageClip(A));
  });

  // ---- the caret's offset after a merge: both type in one block, three rounds
  await section('merge', async () => {
    const rounds = [];
    for (let round = 1; round <= 3; round += 1) {
      await escapeAll(A);
      await escapeAll(B);
      await openRunEnd(A, 'hand-b');
      await openRunEnd(B, 'hand-b');
      await Promise.all([typeWord(A, ` al${round}`), typeWord(B, ` br${round}`)]);
      await sleep(900);
      const read = async (page, otherId) =>
        page.evaluate((id) => {
          const el = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
          const a = 'hand-b';
          const run = (() => {
            const inner = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${a}"]`,
            );
            const box = inner?.closest('.free') ?? inner;
            if (!box) return null;
            return box.matches('[data-run]') ? box : box.querySelector('[data-run]');
          })();
          return {
            offset: el?.getAttribute('data-offset') ?? null,
            kept: el?.getAttribute('data-kept') ?? null,
            text: run?.textContent ?? null,
          };
        }, otherId);
      const inA = await read(A, bId);
      const inB = await read(B, aId);
      const text = (inA.text ?? '').replace(/ /g, ' ');
      const endOf = (w) => {
        const i = text.indexOf(w);
        return i < 0 ? null : i + w.length;
      };
      rounds.push({
        round,
        text,
        bCaretInA: inA.offset,
        bWordEnd: endOf(` br${round}`),
        aCaretInB: inB.offset,
        aWordEnd: endOf(` al${round}`),
        textB: (inB.text ?? '').replace(/ /g, ' '),
      });
      if (round === 1) {
        await shot(A, '03-merge-a', await stageClip(A));
        await shot(B, '03-merge-b', await stageClip(B));
      }
      await A.keyboard.press('Escape');
      await B.keyboard.press('Escape');
      await sleep(400);
    }
    say('merge.rounds', rounds);
  });

  // ---- two people type into the cover title at once, three rounds (pass 3: the run rule's client
  // half and the wrapped title's conversion, realtime.title.two-typers by hand); the heading wraps
  // in round 2 or 3 at both widths, so each tab's Escape may convert the cover to a freeform slide
  await section('title', async () => {
    const headingRunOf = (page) =>
      page.evaluate(() => {
        const runs = [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
          ),
        ];
        const ids = runs.map((el) => el.getAttribute('data-run') ?? '');
        /* the heading's run, as the spec's headingRun reads it (lib.ts): the run whose id names the heading */
        return ids.find((r) => /heading/.test(r)) ?? ids[0] ?? null;
      });
    let coverId = null;
    const headingOf = async (page) => {
      const first = coverId ?? (await slideOrder(page))[0];
      const slide = await slideJson(page, first);
      if (slide?.kind === 'title') return String(slide.heading ?? '').replace(/ /g, ' ');
      const id = slide?.grammar?.slots?.main?.[1] ?? 'heading';
      const block = (slide?.slots?.main ?? []).find((b) => b.id === id);
      return String(block?.text ?? '').replace(/ /g, ' ');
    };
    const editingNow = (page) => isEditing(page);
    async function openHeadingEnd(page) {
      await escapeAll(page);
      const run = await poll(() => headingRunOf(page), 10_000, 100);
      const el = page
        .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
        .first();
      const box = await el.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x - 120, y + 80);
      await page.mouse.move(x, y, { steps: 12 });
      await sleep(80);
      await page.mouse.dblclick(x, y);
      if (!(await poll(() => editingNow(page), 5000, 50))) {
        await page.keyboard.press('Escape');
        await el.dblclick();
        await poll(() => editingNow(page), 5000, 50);
      }
      await page.keyboard.press('Meta+ArrowDown');
      await page.keyboard.press('End');
    }
    const count = (text, w) => text.split(w).length - 1;
    /* a cover of its own at the deck's end, so no placed block lies over its heading (the setup's
       hand-a block sits over slide 1's heading and took the double click in the first drives) */
    {
      const order = await slideOrder(A);
      const st = await state(A);
      await invoke(A, 'slide.new', {
        layout: 'title',
        after: order[order.length - 1],
        baseRevision: st.revision,
      });
      await quiet(A);
      const after = await slideOrder(A);
      coverId = after.find((id) => !order.includes(id)) ?? null;
      await poll(async () => (await slideOrder(B)).includes(coverId), 8000, 100);
      const cover = await slideJson(A, coverId);
      await clickCard(A, coverId);
      await clickCard(B, coverId);
      const st2 = await state(A);
      const run = await headingRunOf(A);
      await A.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
        .first()
        .dblclick();
      await sleep(150);
      await A.keyboard.press('Meta+a');
      await A.keyboard.type('Two typers', { delay: HUMAN });
      await A.keyboard.press('Escape');
      await escapeAll(A);
      await quiet(A);
      say('title.cover', { id: coverId, kind: cover?.kind ?? null, run, revision: st2.revision });
    }
    const rounds = [];
    for (let round = 1; round <= 3; round += 1) {
      const pair1 = [` ta${round}`, ` tb${round}`];
      const pair2 = [` ua${round}`, ` ub${round}`];
      await openHeadingEnd(A);
      await openHeadingEnd(B);
      const delay = Math.floor(Math.random() * 150);
      await Promise.all([typeWord(A, pair1[0]), sleep(delay).then(() => typeWord(B, pair1[1]))]);
      await sleep(700);
      await Promise.all([typeWord(A, pair2[0]), sleep(delay).then(() => typeWord(B, pair2[1]))]);
      await Promise.all([A.keyboard.press('Escape'), B.keyboard.press('Escape')]);
      const escapeAt = Date.now();
      const four = [...pair1, ...pair2];
      const settled = await poll(
        async () => {
          const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
          return four.every((w) => count(a, w) === 1 && count(b, w) === 1) ? Date.now() : null;
        },
        3000,
        40,
      );
      await Promise.all([quiet(A), quiet(B)]);
      const [a, b] = await Promise.all([headingOf(A), headingOf(B)]);
      const kinds = await Promise.all(
        [A, B].map(
          async (p) => (await slideJson(p, coverId ?? (await slideOrder(p))[0]))?.kind ?? null,
        ),
      );
      rounds.push({
        round,
        delayB: delay,
        bothMsAfterEscape: settled ? settled - escapeAt : null,
        a,
        b,
        equal: a === b,
        lost: four.filter((w) => count(a, w) !== 1 || count(b, w) !== 1),
        slideKind: { a: kinds[0], b: kinds[1] },
      });
      if (round >= 2) {
        await shot(A, `02-title-round${round}-a`, await stageClip(A));
        await shot(B, `02-title-round${round}-b`, await stageClip(B));
      }
      await escapeAll(A);
      await escapeAll(B);
    }
    say('title.rounds', rounds);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
  });

  // ---- a picture inserted and replaced by upload on A, read on B (pass 3: pictures on the do
  // tier, images.insert.upload and images.replace.upload by hand)
  await section('image', async () => {
    const png = (r, g, b) =>
      sharp({ create: { width: 240, height: 160, channels: 3, background: { r, g, b } } })
        .png()
        .toBuffer();
    const picturesOf = async (page, slideId) => {
      const slide = await slideJson(page, slideId);
      const out = [];
      const walk = (node) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
          if ((node.type === 'shot' || node.type === 'picture') && node.id)
            out.push({ id: node.id, asset: node.asset ?? node.src ?? null });
          for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
        }
      };
      walk(slide);
      return out;
    };
    const refusal = (page) =>
      page.evaluate(() => /was not added|Try again/.test(document.body.innerText));
    const target = slides[2];
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, target);
    await clickCard(B, target);
    const before = (await picturesOf(A, target)).length;
    const chooser = A.waitForEvent('filechooser', { timeout: 10_000 });
    await ctl(A, 'menubar.insert').click();
    await A.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    await ctl(A, 'menu.insert.image').hover();
    await A.locator('[data-control="menu.insert.image.upload"]').first().waitFor({ timeout: 6000 });
    await sleep(250);
    await ctl(A, 'menu.insert.image.upload').click();
    const fc = await chooser;
    await fc.setFiles({
      name: 'hand-a.png',
      mimeType: 'image/png',
      buffer: await png(200, 40, 40),
    });
    const setAt = Date.now();
    const inA = await poll(
      async () => ((await picturesOf(A, target)).length > before ? Date.now() : null),
      15_000,
      50,
    );
    const inB = await poll(
      async () => ((await picturesOf(B, target)).length > before ? Date.now() : null),
      15_000,
      50,
    );
    const pics = await picturesOf(A, target);
    const placed = pics[pics.length - 1] ?? null;
    const refusedInsert = await refusal(A);
    await sleep(600);
    await shot(A, '04-image-inserted-a', await stageClip(A));
    await shot(B, '04-image-inserted-b', await stageClip(B));
    let replace = null;
    if (placed) {
      await A.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${placed.id}"]`)
        .first()
        .click();
      await A.locator(`.ts-overlay [data-control="handle.${placed.id}.move"]`)
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => undefined);
      const chooser2 = A.waitForEvent('filechooser', { timeout: 10_000 });
      await ctl(A, 'toolbar.replaceImage').click();
      const row = A.locator('[data-control="menu.format.image.replaceImage.upload"]').first();
      if (await row.isVisible().catch(() => false)) await row.click();
      const fc2 = await chooser2;
      await fc2.setFiles({
        name: 'hand-a2.png',
        mimeType: 'image/png',
        buffer: await png(40, 40, 200),
      });
      const t2 = Date.now();
      const changed = (page) =>
        poll(
          async () =>
            (await picturesOf(page, target)).find((p) => p.id === placed.id)?.asset !== placed.asset
              ? Date.now()
              : null,
          15_000,
          50,
        );
      const [rA, rB] = await Promise.all([changed(A), changed(B)]);
      replace = {
        inAMs: rA ? rA - t2 : null,
        inBMs: rB ? rB - t2 : null,
        refused: await refusal(A),
      };
      await sleep(600);
      await shot(A, '04-image-replaced-a', await stageClip(A));
      await shot(B, '04-image-replaced-b', await stageClip(B));
    }
    say('image', {
      slide: target,
      insertInAMs: inA ? inA - setAt : null,
      insertInBMs: inB ? inB - setAt : null,
      refusedInsert,
      placed,
      replace,
      syncA: await syncOf(A),
    });
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
  });

  // ---- the selection outline: B clicks blocks, A draws the outline; both hold one block
  await section('outline', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await startSampler(A, 'outA', 'outline', bId);
    const moves = [];
    for (const blockId of [
      'hand-a',
      'hand-b',
      'hand-agent',
      'hand-a',
      'hand-b',
      'hand-agent',
      'hand-a',
      'hand-b',
    ]) {
      const at = Date.now();
      await blockEl(B, blockId).click();
      await sleep(150);
      if (await isEditing(B)) await B.keyboard.press('Escape');
      moves.push({ blockId, at });
      await sleep(1100);
    }
    const list = await samples(A, 'outA');
    const readings = moves.map((m) => {
      const hit = firstAfter(list, m.at, (v) => (v ?? '').includes(`"${m.blockId}"`));
      return { blockId: m.blockId, ms: hit ? hit.at - m.at : null };
    });
    // both hold one block: A selects hand-b, B holds hand-b already
    await blockEl(A, 'hand-b').click();
    await sleep(200);
    if (await isEditing(A)) await A.keyboard.press('Escape');
    await sleep(700);
    const both = await A.evaluate((id) => {
      const el = document.querySelector(
        `.ts-remote-outline:not(.ts-remote-drag)[data-client="${id}"][data-block="hand-b"]`,
      );
      const ring = document.querySelector(
        '.ts-stagewrap .ts-selection, .ts-stagewrap [data-control^="handle."]',
      );
      const r = (e) =>
        e
          ? (({ left, top, width, height }) => [
              Math.round(left),
              Math.round(top),
              Math.round(width),
              Math.round(height),
            ])(e.getBoundingClientRect())
          : null;
      return {
        outline: r(el),
        inside: el?.getAttribute('data-inside') ?? null,
        insideClass: el?.classList.contains('is-inside') ?? null,
        block: r(document.querySelector('.ts-stagewrap.ts-editor [data-block="hand-b"]')),
      };
    }, bId);
    say('outline', { readings, bothHold: both });
    const box = await blockEl(A, 'hand-b').boundingBox();
    if (box) await shot(A, '04-outline-inside-ring-a', pad(box, 40, A.viewportSize()));
    const boxB = await blockEl(B, 'hand-b').boundingBox();
    if (boxB) await shot(B, '04-outline-inside-ring-b', pad(boxB, 40, B.viewportSize()));
  });

  // ---- the drag ghost: B drags a block 160 px; A sees the box follow with "moving"
  await section('drag', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await blockEl(A, 'hand-a')
      .click()
      .catch(() => {});
    await sleep(150);
    if (await isEditing(A)) await A.keyboard.press('Escape');
    await startSampler(A, 'dragA', 'drag', bId);
    await startSampler(A, 'blockA', 'block', 'hand-agent');
    const el = blockEl(B, 'hand-agent');
    await el.click();
    await sleep(200);
    if (await isEditing(B)) await B.keyboard.press('Escape');
    const box = await el.boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await B.mouse.move(sx, sy);
    await B.mouse.down();
    const downAt = Date.now();
    let mid = null;
    for (let i = 1; i <= 20; i += 1) {
      await B.mouse.move(sx + i * 8, sy, { steps: 1 });
      await sleep(80);
      if (i === 12) {
        mid = await A.evaluate((id) => {
          const g = document.querySelector(`.ts-remote-drag[data-client="${id}"]`);
          const flags = [...document.querySelectorAll('.ts-flag')].map((f) => ({
            text: f.textContent,
            state: f.getAttribute('data-state'),
          }));
          return { ghost: Boolean(g), state: g?.getAttribute('data-state') ?? null, flags };
        }, bId);
        await shot(A, '05-drag-ghost-a', await stageClip(A));
      }
    }
    await B.mouse.up();
    const upAt = Date.now();
    await sleep(1500);
    const drag = await samples(A, 'dragA');
    const blk = await samples(A, 'blockA');
    const ghostSteps = drag.filter((x) => x.v !== null && x.at >= downAt && x.at <= upAt).length;
    const firstGhost = firstAfter(drag, downAt, (v) => v !== null);
    const moved = blk.length > 1 ? blk[blk.length - 1] : null;
    say('drag', {
      mid,
      ghostPositions: ghostSteps,
      firstGhostMs: firstGhost ? firstGhost.at - downAt : null,
      blockMovedInAms: moved ? moved.at - upAt : null,
      blockA: blk.map((x) => ({ dt: x.at - upAt, v: x.v })).slice(-3),
      blockB: await blockEl(B, 'hand-agent').boundingBox(),
      ghostAfterRelease: drag.at(-1)?.v ?? null,
    });
    await shot(A, '05-drag-after-release-a', await stageClip(A));
  });

  // ---- the live pointer: View > Live pointers in the default view, drawn in A, hidden with the switch off
  await section('pointer', async () => {
    await escapeAll(A);
    await escapeAll(B);
    const menuRow = async (page, id) => {
      await ctl(page, 'menubar.view').click();
      await page.locator('#ts-menu-view').waitFor({ timeout: 8000 });
      const parent = ctl(page, 'menu.view.livePointers');
      if ((await parent.count()) === 0) {
        await page.keyboard.press('Escape');
        return { present: false };
      }
      await parent.hover();
      await sleep(300);
      const row = ctl(page, `menu.${id}`);
      const present = (await row.count()) > 0;
      const checked = present ? await row.getAttribute('aria-checked') : null;
      if (present) await row.click();
      else await page.keyboard.press('Escape');
      await sleep(300);
      await page.keyboard.press('Escape').catch(() => {});
      return { present, checkedBefore: checked };
    };
    const mine = await menuRow(B, 'view.livePointers.mine');
    await sleep(400);
    const settingsB = (await state(B)).settings ?? {};
    const settingsA = (await state(A)).settings ?? {};
    await shot(B, '06-view-menu-b').catch(() => {});
    await startSampler(A, 'ptrA', 'pointer', bId);
    const sheet = await B.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
      .first()
      .boundingBox();
    const moves = [];
    for (let i = 0; i < 10; i += 1) {
      const at = Date.now();
      await B.mouse.move(
        sheet.x + sheet.width * (0.3 + i * 0.04),
        sheet.y + sheet.height * (0.4 + i * 0.03),
      );
      moves.push(at);
      await sleep(250);
    }
    await sleep(500);
    const list = await samples(A, 'ptrA');
    const readings = moves.map((at, i) => {
      const before = [...list].reverse().find((x) => x.at < at)?.v ?? null;
      const hit = firstAfter(list, at, (v) => v !== null && v !== before);
      return { i, ms: hit ? hit.at - at : null };
    });
    await shot(A, '06-pointer-a', await stageClip(A));
    const others = await menuRow(A, 'view.livePointers.others');
    await sleep(300);
    for (let i = 0; i < 6; i += 1) {
      await B.mouse.move(sheet.x + sheet.width * (0.6 - i * 0.03), sheet.y + sheet.height * 0.5);
      await sleep(150);
    }
    await sleep(1200);
    const hidden =
      (await A.locator(`.ts-remote-pointer-group[data-client="${bId}"]`).count()) === 0;
    const back = await menuRow(A, 'view.livePointers.others');
    say('pointer', {
      mineRow: mine,
      othersRow: others,
      othersBack: back,
      settingsB: { pointerMine: settingsB.pointerMine ?? null },
      settingsA: { pointerOthers: settingsA.pointerOthers ?? null },
      readings,
      hiddenWithOthersOff: hidden,
    });
  });

  // ---- the card chip: B on slide 2, A's card 2 shows B's 16 px chip, read in the pixels
  await section('card', async () => {
    await escapeAll(A);
    await escapeAll(B);
    const at = Date.now();
    await clickCard(B, slides[1]);
    const card = ctl(A, `filmstrip.slide.${slides[1]}`);
    const drawn = await poll(
      async () =>
        (await card
          .locator('.ts-card-marks')
          .evaluate((el) => Number(el.getAttribute('data-count') ?? '0') > 0)
          .catch(() => false))
          ? Date.now()
          : null,
      6000,
      30,
    );
    const marks = await card
      .locator('.ts-card-marks')
      .first()
      .boundingBox()
      .catch(() => null);
    const cardBox = await card.boundingBox();
    const buffer = await shot(
      A,
      '07-card-chip-a',
      cardBox ? pad(cardBox, 12, A.viewportSize()) : undefined,
    );
    let pixels = null;
    if (marks && cardBox && buffer) {
      const clip = pad(cardBox, 12, A.viewportSize());
      const left = Math.round(marks.x - clip.x);
      const top = Math.round(marks.y - clip.y);
      const w = Math.max(1, Math.round(marks.width));
      const h = Math.max(1, Math.round(marks.height));
      const { data, info } = await sharp(buffer)
        .extract({ left, top, width: w, height: h })
        .raw()
        .toBuffer({ resolveWithObject: true });
      let coloured = 0;
      let dark = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min > 40) coloured += 1;
        if (max < 90) dark += 1;
      }
      pixels = { box: [left, top, w, h], total: w * h, coloured, dark };
    }
    say('card', { drawnMs: drawn ? drawn - at : null, marks, pixels });
    await clickCard(B, slides[0]);
  });

  // ---- Follow by link: B (an editor by the link) follows A, the plate, the six ends
  await section('follow', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
    const ends = [];
    const f1 = await follow(B, aId);
    await sleep(300);
    const plate = await ctl(B, 'presence.following')
      .evaluate((el) => ({
        text: (el.textContent ?? '').trim(),
        stop: Boolean(el.querySelector('[data-control="presence.following.stop"]')),
      }))
      .catch(() => null);
    await shot(B, '08-following-plate-b');
    const t0 = Date.now();
    await clickCard(A, slides[2]);
    const followed = await poll(
      async () => ((await state(B)).slideId === slides[2] ? Date.now() : null),
      5000,
      20,
    );
    await shot(B, '08-following-moved-b');
    const end = async (what, act) => {
      const re = await follow(B, aId);
      await sleep(300);
      await act();
      const gone = await poll(async () => (await followingOf(B)) === null, 3000, 50);
      ends.push({ what, refollowed: re.on, ended: Boolean(gone) });
      await escapeAll(B);
    };
    // 1. B's own click on another card
    ends.push({
      what: "B's own click (first follow)",
      refollowed: f1.on,
      ended: Boolean(
        await (async () => {
          await clickCard(B, slides[1]);
          return poll(async () => (await followingOf(B)) === null, 3000, 50);
        })(),
      ),
    });
    await escapeAll(B);
    // 2. B's own edit
    await end("B's own edit", async () => {
      await openRunEnd(B, 'hand-b').catch(async () => {
        await clickCard(B, slides[0]);
      });
      await typeWord(B, ' e');
      await B.keyboard.press('Escape');
    });
    // 3. B's comment through the shortcut and the card
    await end("B's comment", async () => {
      await B.keyboard.press('Meta+Alt+m');
      const opened = await ctl(B, 'comment.card')
        .waitFor({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        await ctl(B, 'comment.card.new.field').click({ timeout: 5000 });
        await B.keyboard.type('B comments while following', { delay: 40 });
        await ctl(B, 'comment.card.new.submit').click({ timeout: 5000 });
        await sleep(400);
      } else {
        ends.push({
          what: 'comment card',
          note: 'Meta+Alt+m opened no card; comment.add through the window API',
        });
        await invoke(B, 'comment.add', {
          anchor: { kind: 'slide', slideId: (await state(B)).slideId },
          body: { text: 'B comments while following', mentions: [] },
        });
      }
    });
    // 4. B's Slideshow
    await end("B's Slideshow", async () => {
      const button = ctl(B, 'title.slideshow');
      if ((await button.count()) > 0) await button.click();
      else await invoke(B, 'view.present', { on: true });
      await sleep(900);
      await B.keyboard.press('Escape');
      await sleep(500);
    });
    // 5. B's Version history
    await end("B's Version history", async () => {
      const lastEdit = B.locator('[data-menu-item="title.lastEdit"]').first();
      const clicked = await lastEdit
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await ctl(B, 'menubar.file').click();
        await ctl(B, 'menu.file.versionHistory').hover();
        await ctl(B, 'menu.file.versionHistory.see').click();
      }
      await sleep(700);
      await shot(B, '08-version-history-b');
      await B.keyboard.press('Escape');
    });
    // 6. the followed person's leave
    const re6 = await follow(B, aId);
    await sleep(300);
    const leftAt = Date.now();
    await A.close();
    const leaveEnded = await poll(
      async () => ((await followingOf(B)) === null ? Date.now() : null),
      6000,
      50,
    );
    ends.push({
      what: "A's leave",
      refollowed: re6.on,
      ended: Boolean(leaveEnded),
      ms: leaveEnded ? leaveEnded - leftAt : null,
    });
    A = await ctxA.newPage();
    await A.goto(`/edit/${deckId}`);
    await waitEditor(A);
    await poll(() => connected(A), 20_000, 100);
    aId = await clientIdOf(A);
    // and the other direction: the owner follows the link editor
    await escapeAll(B);
    await clickCard(B, slides[0]);
    const fa = await follow(A, bId);
    const t1 = Date.now();
    await clickCard(B, slides[1]);
    const followedA = await poll(
      async () => ((await state(A)).slideId === slides[1] ? Date.now() : null),
      5000,
      20,
    );
    await clickCard(A, slides[0]);
    say('follow', {
      bFollowsA: f1,
      plate,
      followedMs: followed ? followed - t0 : null,
      ends,
      aFollowsB: fa,
      aFollowedMs: followedA ? followedA - t1 : null,
    });
  });

  // ---- the agent write through the Vercel actions route on the other instance
  await section('agent', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
    await escapeAll(A);
    await clickCard(A, slides[0]);
    await openRunEnd(A, 'hand-a');
    await typeWord(A, ' own');
    await A.keyboard.press('Escape');
    await quiet(A);
    const before = (await state(A)).revision;
    const written = Date.now();
    const res = await fetch(`${BASE_B}/api/actions/block.set?deck=${encodeURIComponent(deckId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-turboslide-author': 'agent:verifier-hand' },
      body: JSON.stringify({
        slideId: slides[0],
        blockId: 'hand-agent',
        path: '/text',
        value: 'Written by the agent',
        baseRevision: before,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const answered = res.status;
    const answerMs = Date.now() - written;
    const banner = await poll(
      async () => {
        const t =
          (await ctl(A, 'snackbar')
            .textContent()
            .catch(() => '')) ?? '';
        return /changed/.test(t) ? { at: Date.now(), text: t.trim() } : null;
      },
      10_000,
      30,
    );
    const textAt = await poll(
      async () =>
        JSON.stringify(await slideJson(A, slides[0])).includes('Written by the agent')
          ? Date.now()
          : null,
      5000,
      30,
    );
    await shot(A, '09-agent-banner-a');
    await A.keyboard.press('Escape');
    await A.locator('.ts-stagewrap.ts-editor').click({ position: { x: 30, y: 30 } });
    await A.keyboard.press('Meta+z');
    await sleep(1500);
    const after = JSON.stringify(await slideJson(A, slides[0]));
    let versions = null;
    try {
      const v = await invoke(A, 'version.list', { id: deckId });
      const list = Array.isArray(v) ? v : (v.versions ?? []);
      versions = list.slice(0, 6).map((x) => ({
        revision: x.revision,
        kind: x.author?.kind,
        name: x.author?.name,
        note: x.note,
      }));
    } catch (error) {
      versions = String(error).slice(0, 200);
    }
    say('agent', {
      status: answered,
      answerMs,
      bannerMs: banner ? banner.at - written : null,
      bannerText: banner?.text ?? null,
      textInAms: textAt ? textAt - written : null,
      afterUndoAgentTextStays: after.includes('Written by the agent'),
      afterUndoOwnWordStays: after.includes(' own'),
      versions,
    });
  });

  // ---- a reload between words: both type five words, A reloads after its third
  await section('reload', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
    await escapeAll(A);
    await escapeAll(B);
    const wa = [' ra1', ' ra2', ' ra3', ' ra4', ' ra5'];
    const wb = [' rb1', ' rb2', ' rb3', ' rb4', ' rb5'];
    await openRunEnd(A, 'hand-a');
    await openRunEnd(B, 'hand-b');
    const typeB = (async () => {
      for (const w of wb) {
        await typeWord(B, w);
        await sleep(400);
      }
    })();
    for (let i = 0; i < 5; i += 1) {
      await typeWord(A, wa[i]);
      await sleep(400);
      if (i === 2) {
        await A.reload();
        await waitEditor(A);
        await poll(() => connected(A), 20_000, 100);
        await openRunEnd(A, 'hand-a');
      }
    }
    const lastKey = Date.now();
    await typeB;
    const equalAt = await poll(
      async () => {
        const [a, b] = await Promise.all([slideJson(A, slides[0]), slideJson(B, slides[0])]);
        const sa = JSON.stringify(a);
        const sb = JSON.stringify(b);
        return sa === sb && [...wa, ...wb].every((w) => sa.split(w).length === 2)
          ? Date.now()
          : null;
      },
      10_000,
      100,
    );
    const textA = (await runText(A, 'hand-a'))?.replace(/ /g, ' ');
    const textB = (await runText(B, 'hand-b'))?.replace(/ /g, ' ');
    say('reload', {
      equalMsAfterLastKey: equalAt ? equalAt - lastKey : null,
      textA,
      textB,
      syncA: await syncOf(A),
    });
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
  });

  // ---- 20 s offline between words
  await section('offline', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
    await escapeAll(A);
    await escapeAll(B);
    await openRunEnd(A, 'hand-a');
    await openRunEnd(B, 'hand-b');
    await typeWord(A, ' oa1');
    await typeWord(B, ' ob1');
    await sleep(500);
    await ctxA.setOffline(true);
    const offAt = Date.now();
    await typeWord(A, ' oa2');
    await typeWord(B, ' ob2');
    await sleep(4000);
    await typeWord(A, ' oa3');
    await typeWord(B, ' ob3');
    const whileOff = {
      connected: (await state(A)).sync?.connected ?? null,
      plate: await ctl(A, 'title.saveState')
        .textContent()
        .catch(() => null),
    };
    await sleep(Math.max(0, 20_000 - (Date.now() - offAt)));
    await ctxA.setOffline(false);
    const onAt = Date.now();
    await typeWord(A, ' oa4');
    const words = [' oa1', ' oa2', ' oa3', ' oa4', ' ob1', ' ob2', ' ob3'];
    const allAt = await poll(
      async () => {
        const [a, b] = await Promise.all([slideJson(A, slides[0]), slideJson(B, slides[0])]);
        const sa = JSON.stringify(a);
        const sb = JSON.stringify(b);
        return sa === sb && words.every((w) => sa.split(w).length === 2) ? Date.now() : null;
      },
      15_000,
      100,
    );
    let records = null;
    try {
      const info = await invoke(A, 'deck.info');
      records = { revision: info.revision };
    } catch {}
    say('offline', {
      offlineSeconds: Math.round((onAt - offAt) / 100) / 10,
      whileOff,
      everyWordBothMsAfterReconnect: allAt ? allAt - onAt : null,
      textA: (await runText(A, 'hand-a'))?.replace(/ /g, ' '),
      textB: (await runText(B, 'hand-b'))?.replace(/ /g, ' '),
      ws: (await wsLog(A))?.closes.slice(-3),
      records,
    });
    await A.keyboard.press('Escape');
    await B.keyboard.press('Escape');
  });

  // ---- the caret dims after 30 s still, and B's marks leave within 2 s of its close
  await section('dims', async () => {
    await escapeAll(A);
    await escapeAll(B);
    await clickCard(A, slides[0]);
    await clickCard(B, slides[0]);
    await escapeAll(A);
    await escapeAll(B);
    await openRunEnd(B, 'hand-b');
    await typeWord(B, ' d');
    const still = Date.now();
    const dim = await poll(
      async () =>
        (await A.evaluate(
          (id) =>
            document
              .querySelector(`.ts-remote-caret[data-client="${id}"]`)
              ?.classList.contains('is-dim') ?? false,
          bId,
        ))
          ? Date.now()
          : null,
      40_000,
      250,
    );
    await shot(A, '10-caret-dimmed-a', await stageClip(A));
    const leftAt = Date.now();
    await B.close();
    const gone = await poll(
      async () => {
        const n = await A.evaluate(
          (id) =>
            document.querySelectorAll(`[data-client="${id}"], [data-control="presence.chip.${id}"]`)
              .length,
          bId,
        );
        return n === 0 ? Date.now() : null;
      },
      10_000,
      50,
    );
    say('dims', { dimMs: dim ? dim - still : null, goneMs: gone ? gone - leftAt : null });
    B = await ctxB.newPage();
    await joinB(B);
    bId = await clientIdOf(B);
  });

  // ---- the Share dialog keeps the general link it minted across a reload, and Copy link keeps it
  // (pass 3: R4 fix 2, rememberGeneral in Share.tsx; share.dialog.grant-email-line's address half)
  await section('share', async () => {
    const openShare = async (page) => {
      await escapeAll(page);
      await ctl(page, 'share.open').click();
      const skip = ctl(page, 'dialog.namePrompt.skip');
      if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
      await ctl(page, 'dialog.share').waitFor({ timeout: 10_000 });
      await poll(
        async () =>
          (await page.locator('[data-control="dialog.share.loading"]').count()) === 0 &&
          (await page.locator('[data-control="dialog.share"] [aria-busy="true"]').count()) === 0,
        10_000,
        100,
      );
    };
    const idle = (page) =>
      poll(
        async () =>
          (await page.locator('[data-control="dialog.share"] [aria-busy="true"]').count()) === 0,
        10_000,
        100,
      );
    const addressOf = (page) =>
      ctl(page, 'dialog.share.address')
        .inputValue({ timeout: 2000 })
        .catch(() => null);
    const closeShare = async (page) => {
      const done = ctl(page, 'dialog.share.done');
      if (await done.isVisible().catch(() => false)) await done.click();
      else await page.keyboard.press('Escape');
      await sleep(300);
    };
    await openShare(A);
    const mode = ctl(A, 'dialog.share.mode');
    const modeBefore = await mode.inputValue().catch(() => null);
    if (modeBefore === 'link') {
      await mode.selectOption('restricted');
      await idle(A);
    }
    await mode.selectOption('link');
    await idle(A);
    /* the field reads the deck's own edit address until the mode change's write answers; the
       minted general link is the tokenized /s/ address that replaces it */
    const minted = await poll(async () => {
      const v = await addressOf(A);
      return v && /^https?:\/\/[^/]+\/s\//.test(v) ? v : null;
    }, 10_000);
    await shot(A, '12-share-minted-a');
    await closeShare(A);
    await quiet(A);
    await A.reload();
    await waitEditor(A);
    await poll(() => connected(A), 20_000, 100);
    await openShare(A);
    const afterReload = await poll(async () => {
      const v = await addressOf(A);
      return v && /^https?:\/\/[^/]+\/s\//.test(v) ? v : null;
    }, 8000);
    const afterReloadField = await addressOf(A);
    await shot(A, '12-share-after-reload-a');
    await ctl(A, 'dialog.share.copy')
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await idle(A);
    await sleep(500);
    const afterCopy = await addressOf(A);
    await closeShare(A);
    /* the minted address opens the editor in a fresh context on B's origin */
    let opens = null;
    if (minted) {
      const ctxD = await mk(BASE_B);
      const D = await ctxD.newPage();
      try {
        await D.goto(minted.replace(/^https?:\/\/[^/]+/, BASE_B));
        await D.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
        await waitEditor(D);
        opens = { url: D.url().replace(/[?#].*$/, ''), role: (await state(D)).role ?? null };
      } catch (error) {
        opens = { error: String(error).slice(0, 200) };
      } finally {
        await ctxD.close().catch(() => {});
      }
    }
    /* a link carries its grant in the path: the facts keep a digest and the path's first segment, never the link */
    const shape = (v) =>
      v
        ? {
            route: v.replace(/^https?:\/\/[^/]+/, '').split('/')[1] ?? null,
            digest: createHash('sha256').update(v).digest('hex').slice(0, 12),
          }
        : null;
    say('share', {
      modeBefore,
      minted: shape(minted),
      afterReload: shape(afterReload),
      afterReloadField: shape(afterReloadField),
      afterCopy: shape(afterCopy),
      sameAfterReload: Boolean(minted) && minted === afterReload,
      sameAfterCopy: Boolean(minted) && minted === afterCopy,
      opens,
    });
    aId = await clientIdOf(A);
  });

  // ---- the access revocation: C a viewer by the link, then Restricted, C's socket within the grace
  await section('revoke', async () => {
    const share2 = await invoke(A, 'share.get', { id: deckId });
    const viewLink = await invoke(A, 'share.setGeneralAccess', {
      id: deckId,
      mode: 'link',
      role: 'viewer',
      baseRevision: share2.record?.revision ?? share2.revision,
    });
    ctxC = await mk(BASE_C);
    const C = await ctxC.newPage();
    /* a live general link keeps its token when only its role changes (share.setGeneralAccess
       answers no url then), so C opens the link the setup minted, now a viewer link */
    const url = viewLink.url
      ? viewLink.url.replace(/^https?:\/\/[^/]+/, BASE_C)
      : linkPath
        ? linkPath.replace(/^https?:\/\/[^/]+/, BASE_C)
        : `${BASE_C}/edit/${deckId}`;
    say(
      'revoke.viewerUrlKind',
      viewLink.url ? 'a new link' : linkPath ? 'the setup link, role viewer' : 'no link',
    );
    await C.goto(url);
    await C.waitForURL(new RegExp(`/(edit|deck)/${deckId}`), { timeout: 30_000 });
    await waitEditor(C).catch(() => {});
    const cConnected = await poll(() => connected(C).catch(() => false), 20_000, 100);
    const cRole =
      (await state(C).catch(() => ({}))).role ??
      (await state(C).catch(() => ({}))).access?.role ??
      null;
    const share3 = await invoke(A, 'share.get', { id: deckId });
    const revokedAt = Date.now();
    await invoke(A, 'share.setGeneralAccess', {
      id: deckId,
      mode: 'restricted',
      baseRevision: share3.record?.revision ?? share3.revision,
    });
    const answeredMs = Date.now() - revokedAt;
    /* the socket's close, or the tab leaving the deck for the You need access page (a navigation
       resets the page's socket log, so the page's own words are read beside it) */
    let leftAt = null;
    const closed = await poll(
      async () => {
        const log = await wsLog(C).catch(() => null);
        const c = log?.closes.find((x) => x.at >= revokedAt);
        if (leftAt === null) {
          const text = await C.locator('body')
            .innerText({ timeout: 500 })
            .catch(() => '');
          if (/You need access/.test(text)) leftAt = Date.now();
        }
        return c ?? (leftAt !== null ? { at: leftAt, code: 'left for You need access' } : null);
      },
      REVOKE_WAIT_MS,
      100,
    );
    await sleep(1500);
    const after = await state(C).catch((e) => ({ error: String(e).slice(0, 120) }));
    const log = await wsLog(C).catch(() => null);
    await shot(C, '11-revoked-c');
    const reloadAt = Date.now();
    const reloaded = await C.goto(`/edit/${deckId}`).catch((e) => ({
      status: () => String(e).slice(0, 80),
    }));
    await sleep(2500);
    const landed = {
      status: typeof reloaded?.status === 'function' ? reloaded.status() : null,
      url: C.url().replace(/\?.*$/, ''),
      title: await C.title().catch(() => null),
      editor: await C.evaluate(() => Boolean(window.turboslide?.studio)).catch(() => false),
      role: await C.evaluate(
        () => window.turboslide?.studio?.describe?.().state?.role ?? null,
      ).catch(() => null),
      text: (
        await C.locator('body')
          .innerText()
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      ms: Date.now() - reloadAt,
    };
    await shot(C, '11-revoked-c-reload');
    say('revoke.reload', landed);
    say('revoke', {
      cConnected: Boolean(cConnected),
      cRole,
      answeredMs,
      closeMsAfterRevoke: closed ? closed.at - revokedAt : null,
      close: closed,
      cAfter: {
        connected: after.sync?.connected ?? null,
        url: C.url().replace(/\?.*$/, ''),
        error: after.error ?? null,
      },
      sentAfter: log?.sent
        .filter((x) => x.at >= revokedAt)
        .map((x) => `${x.t}@${x.at - revokedAt}`)
        .slice(0, 12),
      opensAfter: log?.opens.filter((x) => x.at >= revokedAt).length ?? null,
    });
    await C.close();
    // A and B keep the deck for the rest: the link back to editor for B
    const share4 = await invoke(A, 'share.get', { id: deckId });
    await invoke(A, 'share.setGeneralAccess', {
      id: deckId,
      mode: 'link',
      role: 'editor',
      baseRevision: share4.record?.revision ?? share4.revision,
    });
  });

  // ---- the ticket refresh across a 10 minute wait
  await section('ticket', async () => {
    await escapeAll(A);
    await escapeAll(B);
    const start = Date.now();
    const opensA0 = (await wsLog(A)).opens.length;
    const opensB0 = (await wsLog(B)).opens.length;
    const marks = [];
    while (Date.now() - start < TICKET_WAIT_S * 1000) {
      await sleep(30_000);
      marks.push({
        s: Math.round((Date.now() - start) / 1000),
        a: (await state(A)).sync?.connected ?? null,
        b: (await state(B)).sync?.connected ?? null,
      });
    }
    await openRunEnd(B, 'hand-b');
    const at = Date.now();
    await startSampler(A, 'tkA', 'run', 'hand-b');
    await typeWord(B, ' late');
    const seen = await poll(
      async () => (((await runText(A, 'hand-b')) ?? '').includes('late') ? Date.now() : null),
      5000,
      20,
    );
    await B.keyboard.press('Escape');
    const la = await wsLog(A);
    const lb = await wsLog(B);
    const tickets = (log) =>
      log.sent
        .filter((x) => x.t === 'ticket' && x.at >= start)
        .map((x) => Math.round((x.at - start) / 1000));
    say('ticket', {
      waitedSeconds: Math.round((at - start) / 1000),
      marks: marks.filter((m, i) => i % 4 === 0 || m.a !== true || m.b !== true),
      ticketFramesA: tickets(la),
      ticketFramesB: tickets(lb),
      reopensA: la.opens.length - opensA0,
      reopensB: lb.opens.length - opensB0,
      closesA: la.closes
        .filter((c) => c.at >= start)
        .map((c) => ({ s: Math.round((c.at - start) / 1000), code: c.code, reason: c.reason })),
      closesB: lb.closes
        .filter((c) => c.at >= start)
        .map((c) => ({ s: Math.round((c.at - start) / 1000), code: c.code, reason: c.reason })),
      wordInAmsAfterWait: seen ? seen - at : null,
    });
  });

  say('sync.end', { a: await syncOf(A), b: await syncOf(B) });
  if (ROOM_BEARER && deckId) say('object.counters', await readWorker(`/rooms/${deckId}/counters`));
} catch (error) {
  say('error', String(error?.stack ?? error).slice(0, 2000));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await ctxB.close().catch(() => {});
  if (ctxC) await ctxC.close().catch(() => {});
  if (deckId) {
    try {
      if (A.isClosed()) {
        A = await ctxA.newPage();
        await A.goto(`/edit/${deckId}`);
        await waitEditor(A);
      }
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
  say('worker.health.after', await readWorker('/health'));
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close();
}

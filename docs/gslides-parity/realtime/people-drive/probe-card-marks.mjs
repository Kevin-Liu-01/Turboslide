// The realtime round's people drive (docs/gslides-parity/realtime/audit-people.md): two anonymous
// browsers on one scratch deck on production, both on slide 1, reading what each sees of the
// other while they type, select, move and add, then the deck removed by its id through the bearer.
// The bearer reaches this process as the environment variable TURBOSLIDE_BEARER, set by a wrapper
// that reads ~/.config/turboslide/hosts.json; nothing here prints it. Run from the repo root:
//   TURBOSLIDE_BEARER=... node docs/gslides-parity/realtime/people-drive/probe-card-marks.mjs
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
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  await beginTyping(A, heading, 'Card mark probe');
  await A.keyboard.press('Escape');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  const prompt = ctl(A, 'dialog.namePrompt');
  if (await prompt.isVisible().catch(() => false)) {
    if ((await ctl(A, 'dialog.namePrompt.close').count()) > 0) await ctl(A, 'dialog.namePrompt.close').click();
    else await ctl(A, 'dialog.namePrompt.skip').click();
  }
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', { id: deckId, mode: 'link', role: 'editor', baseRevision: share.record?.revision ?? share.revision });
  await B.goto(opened.url ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 60_000, 100);
  await A.waitForTimeout(1500);
  const marks = await A.evaluate(() => {
    const el = document.querySelector('.ts-card-marks');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const chip = el.querySelector('.ts-chip');
    const ccs = chip ? getComputedStyle(chip) : null;
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const frame = el.closest('.ts-card-frame');
    const thumb = frame?.querySelector('.ts-thumb');
    return {
      marks: { box: r(el), display: cs.display, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex, count: el.getAttribute('data-count'), html: el.outerHTML.slice(0, 600) },
      chip: chip ? { box: r(chip), display: ccs.display, opacity: ccs.opacity, visibility: ccs.visibility, width: ccs.width, height: ccs.height, border: ccs.border, background: ccs.backgroundColor, classes: chip.className } : null,
      frame: frame ? { box: r(frame), overflow: getComputedStyle(frame).overflow, children: [...frame.children].map((c) => c.className) } : null,
      thumb: thumb ? { box: r(thumb), zIndex: getComputedStyle(thumb).zIndex, position: getComputedStyle(thumb).position } : null,
      topAtChip: (() => { const b = el.getBoundingClientRect(); const e = document.elementFromPoint(b.right - 8, b.top + 8); return e ? { tag: e.tagName, cls: String(e.className).slice(0, 80) } : null; })(),
    };
  });
  say('cardMarks.A', marks);
  const frameBox = marks?.frame?.box;
  if (frameBox) {
    await A.screenshot({ path: join(OUT, 'probe-a-card-corner.png'), clip: { x: frameBox[0] + frameBox[2] - 90, y: frameBox[1] - 4, width: 96, height: 40 } });
    say('shot.probe', 'probe-a-card-corner.png');
  }
  say('thumb.zIndexed', await A.evaluate(() => {
    const thumb = document.querySelector('.ts-card-frame .ts-thumb');
    if (!thumb) return null;
    const rows = [];
    for (const el of [thumb, ...thumb.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      if (cs.zIndex !== 'auto' || cs.transform !== 'none' || cs.isolation !== 'auto')
        rows.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), position: cs.position, zIndex: cs.zIndex, transform: cs.transform.slice(0, 40), isolation: cs.isolation });
      if (rows.length > 12) break;
    }
    return rows;
  }));
  const corner = async (name) => {
    const fb = await A.evaluate(() => { const f = document.querySelector('.ts-card-frame'); const b = f.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    await A.screenshot({ path: join(OUT, name), clip: { x: fb[0] + fb[2] - 90, y: fb[1] - 4, width: 96, height: 40 } });
    return name;
  };
  await A.addStyleTag({ content: '.ts-card-marks { z-index: 1 }' });
  await A.waitForTimeout(300);
  say('shot.probe.marksZ1', await corner('probe-a-card-corner-marks-z1.png'));
  await A.addStyleTag({ content: '.ts-card-marks { z-index: auto } .ts-thumb { isolation: isolate }' });
  await A.waitForTimeout(300);
  say('shot.probe.thumbIsolated', await corner('probe-a-card-corner-thumb-isolated.png'));
  const ctxC = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, colorScheme: 'light' });
  const C = await ctxC.newPage();
  await C.goto(opened.url ?? `/edit/${deckId}`);
  await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(C);
  await poll(async () => ((await state(C)).presence?.others?.length ?? 0) >= 2, 60_000, 100);
  await C.waitForTimeout(1500);
  const fb = await C.evaluate(() => { const f = document.querySelector('.ts-card-frame'); const b = f.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  await C.screenshot({ path: join(OUT, 'probe-c-card-corner-3x.png'), clip: { x: fb[0] + fb[2] - 90, y: fb[1] - 4, width: 96, height: 40 } });
  say('cardMarks.C', await C.evaluate(() => [...document.querySelectorAll('.ts-card-marks')].map((el) => ({ count: el.getAttribute('data-count'), label: el.getAttribute('aria-label'), chips: el.querySelectorAll('.ts-chip').length }))));
  await ctxC.close();
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

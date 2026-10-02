// R2 fix round: the verifier's undo-probe3 with instrumentation. vite dev serves the controller's
// source, so the route below adds `window.__h = history` after the history is made (nothing in
// the tree is edited); the probe then reads the stack length and the labels after every step,
// the keydown's target and whether a handler took it.
//   node undo-instr.mjs --base http://127.0.0.1:4472
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://127.0.0.1:4472');
const ONLY = arg('only', 'rotate');
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
await ctx.route(/\/src\/editor\/controller\.tsx/, async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  const before = body.length;
  body = body.replace(
    /(const history = createEditHistory\(\);)/,
    '$1 window.__hs = (window.__hs || 0) + 1; const __hid = window.__hs; window.__h = history; window.__hlog = window.__hlog || []; const __push = history.push; history.push = (e) => { const r = __push(e); window.__hlog.push({ h: __hid, kind: "push", at: Date.now(), id: r.id, label: e.label, ops: e.mutations.map((m) => m.op + ":" + (m.path ?? "") + ":" + JSON.stringify(m.value ?? null).slice(0, 80)).slice(0, 4), inv: e.inverse.map((m) => m.op + ":" + (m.path ?? "") + ":" + JSON.stringify(m.value ?? null).slice(0, 80)).slice(0, 4) }); return r; }; const __undo = history.undo; history.undo = () => { const r = __undo(); window.__hlog.push({ h: __hid, kind: "undo", at: Date.now(), id: r?.id ?? null, label: r?.label ?? null, depth: history.entries().length }); return r; }; const __redo = history.redo; history.redo = () => { const r = __redo(); window.__hlog.push({ h: __hid, kind: "redo", at: Date.now(), id: r?.id ?? null, label: r?.label ?? null }); return r; };',
  );
  if (body.length === before) console.log('controller hook NOT installed');
  await route.fulfill({ response, body });
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    console.log('console', m.type(), m.text().slice(0, 300));
});
await page.addInitScript(() => {
  window.__keys = [];
  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target;
      window.__keys.push({
        at: Date.now(),
        key: e.key,
        target: t
          ? `${t.tagName?.toLowerCase()}${t.getAttribute?.('data-control') ? `[${t.getAttribute('data-control')}]` : ''}.${typeof t.className === 'string' ? t.className.split(' ')[0] : ''}`
          : null,
      });
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const last = window.__keys[window.__keys.length - 1];
    if (last) last.prevented = e.defaultPrevented;
  });
});
const invoke = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const state = (p) => p.evaluate(() => window.turboslide.studio.describe().state);
let deckId = null;
const hist = () =>
  page.evaluate(() => ({
    entries: window.__h ? window.__h.entries().map((e) => `${e.id}:${e.label}`) : null,
    canUndo: window.__h?.canUndo(),
    canRedo: window.__h?.canRedo(),
  }));
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Undo probe', { delay: 50 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(page, 'deck.info')).id;
  console.log('deck', deckId);
  const slideId = (await invoke(page, 'deck.info')).sections[0].slides[0].id;
  const st = await state(page);
  await invoke(page, 'block.insert', {
    baseRevision: st.revision,
    slideId,
    slot: 'main',
    block: {
      id: 'undo-target',
      type: 'text',
      text: 'Undo target',
      pos: { x: 200, y: 560, w: 480, h: 120 },
    },
  });
  await sleep(1500);
  const posOf = async () => {
    const got = await invoke(page, 'slide.get', { slideId });
    const slide = got.slide ?? got;
    const b = Object.values(slide.slots ?? {})
      .flat()
      .find((x) => x && x.id === 'undo-target');
    return b?.pos
      ? `${b.pos.x},${b.pos.y} ${b.pos.w}x${b.pos.h} r${b.pos.rotate ?? b.rotate ?? 0}`
      : null;
  };
  const el = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="undo-target"]').first();
  const snack = () =>
    page
      .locator('[data-control="snackbar"]')
      .first()
      .textContent({ timeout: 300 })
      .catch(() => null);
  const select = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await el.click();
    await sleep(200);
    if (
      await page.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
      )
    )
      await page.keyboard.press('Escape');
  };
  const drag = async (want, dx, dy) => {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((x) =>
        x.getAttribute('data-control'),
      ),
    );
    const id = ids.find((x) => want.test(x));
    const box = await page.locator(`.ts-overlay [data-control="${id}"]`).first().boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(sx + (dx * i) / 12, sy + (dy * i) / 12);
      await sleep(30);
    }
    await page.mouse.up();
    return id;
  };
  const mark = async (label) => {
    await page.evaluate(
      (l) => window.__hlog.push({ kind: 'mark', label: l, at: Date.now() }),
      label,
    );
    console.log(label, await posOf(), ((await snack()) ?? '').slice(0, 80));
  };
  for (const [name, want, dx, dy] of [
    ['resize', /\.se$/, 60, 40],
    ['rotate', /rotate/, 40, -40],
  ]) {
    await select();
    await mark(`${name} start`);
    await page.keyboard.press('ArrowDown');
    await sleep(1000);
    await mark(`${name} after nudge`);
    await drag(want, dx, dy);
    await sleep(600);
    await mark(`${name} after gesture`);
    await page.keyboard.press('Meta+z');
    await sleep(1200);
    await mark(`${name} after z1`);
    await page.keyboard.press('Meta+z');
    await sleep(1200);
    await mark(`${name} after z2`);
  }
  console.log('keys', JSON.stringify(await page.evaluate(() => window.__keys)));
  for (const row of await page.evaluate(() => window.__hlog)) console.log(JSON.stringify(row));
} catch (error) {
  console.log('error', String(error?.stack ?? error).slice(0, 1500));
} finally {
  if (deckId) {
    try {
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const t = await invoke(page, 'deck.info').catch(() => info);
      await invoke(page, 'deck.remove', { id: deckId, confirm: true, baseRevision: t.revision });
      console.log(
        'teardown',
        (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status,
      );
    } catch (error) {
      console.log('teardownError', String(error).slice(0, 200));
    }
  }
  await browser.close();
}

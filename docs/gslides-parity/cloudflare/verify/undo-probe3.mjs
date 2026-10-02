// The verifier's third probe of the undo rows (a resize by a handle and a rotation by the ring, then Cmd+Z, with the focused element after it) red on the realtime round's tree (build/integrator.md finding
// 22): one person on a scratch deck from /new, a placed text block, and two gestures (a nudge by the
// arrow key and a resize by the south east handle), each undone twice: once within 300 ms of the
// gesture and once after a 5 s wait, past the checkpoint's 2 s idle. Records the block's box after
// the gesture and after Cmd+Z, the snackbar's sentence and the room's covered seq around the wait;
// judges nothing. The deck is trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/undo-probe.mjs --base http://localhost:4479 --out <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4479');
const OUT = resolve(arg('out', 'undo-probe'));
mkdirSync(OUT, { recursive: true });
const facts = { startedAt: new Date().toISOString(), base: BASE, trials: [] };
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const invoke = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const state = (p) => p.evaluate(() => window.turboslide.studio.describe().state);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let deckId = null;
const posOf = async (slideId) => {
  const got = await invoke(page, 'slide.get', { slideId });
  const slide = got.slide ?? got;
  const all = Object.values(slide.slots ?? {}).flat();
  const b = all.find((x) => x && x.id === 'undo-target');
  return b?.pos
    ? `${b.pos.x},${b.pos.y} ${b.pos.w}x${b.pos.h} r${b.pos.rotate ?? b.rotate ?? b.pos.r ?? 0}`
    : null;
};
const snackbar = () =>
  page
    .locator('[data-control="snackbar"]')
    .first()
    .textContent({ timeout: 300 })
    .catch(() => null);
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
  facts.deckId = deckId;
  const slideId =
    (await invoke(page, 'slide.list')).slides?.[0]?.id ??
    (await invoke(page, 'deck.info')).sections[0].slides[0].id;
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
  const el = page.locator('.ts-stagewrap.ts-editor .pt-slide [data-block="undo-target"]').first();
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
  const handles = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
    );
  const dragHandle = async (want, dx, dy) => {
    const ids = await handles();
    const id = ids.find((x) => want.test(x));
    const box = id
      ? await page.locator(`.ts-overlay [data-control="${id}"]`).first().boundingBox()
      : null;
    if (!box) return { id: id ?? null, ids };
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(sx + (dx * i) / 12, sy + (dy * i) / 12);
      await sleep(30);
    }
    await page.mouse.up();
    return { id, ids: ids.length };
  };
  const trial = async (name, want, dx, dy, waitMs) => {
    await select();
    const before = await posOf(slideId);
    const handle = await dragHandle(want, dx, dy);
    await sleep(600);
    const after = await posOf(slideId);
    if (waitMs > 0) await sleep(waitMs);
    const zAt = Date.now();
    await page.keyboard.press('Meta+z');
    const reads = [];
    for (const at of [300, 1000, 3000]) {
      await sleep(Math.max(0, zAt + at - Date.now()));
      reads.push({
        at,
        pos: await posOf(slideId),
        snackbar: ((await snackbar()) ?? '').trim().slice(0, 80),
      });
    }
    const focus = await page.evaluate(() => {
      const e = document.activeElement;
      return e
        ? `${e.tagName.toLowerCase()}${e.getAttribute('data-control') ? '[' + e.getAttribute('data-control') + ']' : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}`
        : null;
    });
    const t = {
      name,
      handle,
      waitMs,
      before,
      after,
      reads,
      restored: reads.find((r) => r.pos === before)?.at ?? null,
      focusAfter: focus,
    };
    facts.trials.push(t);
    console.log(JSON.stringify(t));
  };
  const nudgeThen = async (name, want, dx, dy) => {
    await select();
    const start = await posOf(slideId);
    await page.keyboard.press('ArrowDown');
    await sleep(1000);
    const afterNudge = await posOf(slideId);
    await dragHandle(want, dx, dy);
    await sleep(600);
    const afterGesture = await posOf(slideId);
    await page.keyboard.press('Meta+z');
    await sleep(1200);
    const afterUndo1 = await posOf(slideId);
    await page.keyboard.press('Meta+z');
    await sleep(1200);
    const afterUndo2 = await posOf(slideId);
    const t = {
      name,
      start,
      afterNudge,
      afterGesture,
      afterUndo1,
      afterUndo2,
      undo1TookGesture: afterUndo1 === afterNudge,
      undo2TookNudge: afterUndo2 === start,
    };
    facts.trials.push(t);
    console.log(JSON.stringify(t));
  };
  await nudgeThen('a nudge, then a resize by the se handle, then two Cmd+Z', /\.se$/, 60, 40);
  await nudgeThen('a nudge, then a rotation by the ring, then two Cmd+Z', /rotate/, 40, -40);
} catch (error) {
  facts.error = String(error?.stack ?? error).slice(0, 1500);
  console.log(facts.error);
} finally {
  if (deckId) {
    try {
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const t = await invoke(page, 'deck.info').catch(() => info);
      await invoke(page, 'deck.remove', { id: deckId, confirm: true, baseRevision: t.revision });
      facts.teardown = (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status;
    } catch (error) {
      facts.teardownError = String(error).slice(0, 200);
    }
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close();
}

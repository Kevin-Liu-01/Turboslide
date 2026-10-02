// The verifier's second probe of the undo rows (two nudges, two undos, one redo, the toolbar's Undo and Redo states read after each step) red on the realtime round's tree (build/integrator.md finding
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
  return b?.pos ? `${b.pos.x},${b.pos.y} ${b.pos.w}x${b.pos.h}` : null;
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
  const read = async (label) => {
    const st = await state(page);
    const redo = await page
      .locator('[data-control="toolbar.redo"]')
      .first()
      .getAttribute('aria-disabled')
      .catch(() => null);
    const undoBtn = await page
      .locator('[data-control="toolbar.undo"]')
      .first()
      .getAttribute('aria-disabled')
      .catch(() => null);
    const r = {
      label,
      pos: await posOf(slideId),
      undoDisabled: undoBtn,
      redoDisabled: redo,
      external: st.external ?? null,
      seq: st.sync?.seq ?? null,
      revision: st.revision,
      serverRevision: st.serverRevision ?? null,
      snackbar: ((await snackbar()) ?? '').trim().slice(0, 80),
    };
    facts.trials.push(r);
    console.log(JSON.stringify(r));
  };
  await select();
  await read('start');
  await page.keyboard.press('ArrowRight');
  await sleep(1500);
  await read('after nudge 1');
  await page.keyboard.press('ArrowRight');
  await sleep(1500);
  await read('after nudge 2');
  await page.keyboard.press('Meta+z');
  await sleep(1500);
  await read('after undo 1');
  await page.keyboard.press('Meta+z');
  await sleep(1500);
  await read('after undo 2');
  await page.keyboard.press('Meta+Shift+z');
  await sleep(1500);
  await read('after redo 1');
  await sleep(4000);
  await read('4 s later');
  const count = async () => {
    const got = await invoke(page, 'slide.get', { slideId });
    const sl = got.slide ?? got;
    return Object.values(sl.slots ?? {})
      .flat()
      .filter(Boolean).length;
  };
  await select();
  const n0 = await count();
  await page.keyboard.press('Meta+d');
  await sleep(1500);
  const n1 = await count();
  await page.keyboard.press('Meta+z');
  await sleep(1500);
  const n2 = await count();
  const redoAfterUndo = await page
    .locator('[data-control="toolbar.redo"]')
    .first()
    .getAttribute('aria-disabled')
    .catch(() => null);
  await page.keyboard.press('Meta+Shift+z');
  await sleep(1500);
  const n3 = await count();
  const dup = {
    label: 'duplicate',
    blocks: [n0, n1, n2, n3],
    redoDisabledAfterUndo: redoAfterUndo,
  };
  facts.trials.push(dup);
  console.log(JSON.stringify(dup));
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

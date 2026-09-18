// B7 cycle 2, F-versions reproduction with a long mixed history: a fresh deck, typed bursts on
// the title (text records coalesced by the checkpointer), new slides, a duplicate, a delete with
// undo, text boxes on a canvas slide, then a named version, then Restore of version 1 from the
// panel; reads the panel notice, the snackbar, describe().state.error, the version list and the
// document, then Cmd+Z. Nothing else runs on the server while it does (no edits under the run).
//   node docs/gslides-parity/focus/build/b7-restore-history.mjs --base http://localhost:4377 [--rounds 6] [--which last|first]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:4377');
const ROUNDS = Number(arg('--rounds', '6'));
const WHICH = arg('--which', 'last');
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const t0 = Date.now();
const log = (line) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${line}`);
const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();

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
  await page.waitForFunction(
    () => document.querySelector('.pt-viewer:not(.ts-skeleton)')?.hasAttribute('data-settled'),
    null,
    { timeout: 60_000 },
  );
}
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

async function settled(page, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0 && s.revision === s.serverRevision) return s;
    await page.waitForTimeout(150);
  }
  return state(page);
}

async function runOf(page, pattern) {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => pattern.test(r)) ?? runs[0];
}

async function typeIntoRun(page, pattern, text) {
  const run = await runOf(page, pattern);
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
  await page.keyboard.type(text, { delay: 25 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

async function newDeck(page, title) {
  await page.goto(`${BASE}/new`);
  await waitEditor(page);
  const info = await invoke(page, 'deck.info');
  await typeIntoRun(page, /heading/, title);
  await page.waitForFunction(() => window.turboslide.studio.describe().state.revision >= 1, null, {
    timeout: 30_000,
  });
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  if (
    await ctl(page, 'dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  )
    await page.keyboard.press('Escape');
  return info.id;
}

const slideJson = async (page, slideId) =>
  JSON.stringify(await invoke(page, 'slide.get', { slideId }));
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror ${e.message.slice(0, 300)}`));
let deck = '';
try {
  deck = await newDeck(page, 'B7 restore history');
  let s = await settled(page);
  const title = s.slideId;
  log(`deck ${deck} at revision ${s.revision}; title slide ${title}`);
  for (let round = 0; round < ROUNDS; round += 1) {
    // a typed burst on the title (text records), then Escape
    await typeIntoRun(page, /heading/, ` r${round}`);
    await settled(page);
    // a new slide from the toolbar path through the window API, a text box on it, a move
    s = await settled(page);
    const made = await invoke(page, 'slide.new', {
      baseRevision: s.revision,
      layout: 'one-column',
      after: title,
    });
    const newId = made?.slide?.id ?? made?.slideId ?? made?.id;
    s = await settled(page);
    if (newId) {
      await invoke(page, 'block.insert', {
        baseRevision: s.revision,
        slideId: newId,
        slot: 'main',
        block: {
          id: `box-${round}`,
          type: 'text',
          text: `Box ${round}`,
          pos: { x: 100, y: 500, w: 400, h: 80 },
        },
      }).catch((error) => log(`block.insert on ${newId}: ${error.message.slice(0, 120)}`));
      s = await settled(page);
      await invoke(page, 'block.set', {
        baseRevision: s.revision,
        slideId: newId,
        blockId: `box-${round}`,
        path: '/pos',
        value: { x: 140, y: 520, w: 400, h: 80 },
      }).catch((error) => log(`block.set on ${newId}: ${error.message.slice(0, 120)}`));
      s = await settled(page);
    }
    if (round % 2 === 1 && newId) {
      // a delete and its undo through the keys (the slides area's shape)
      await invoke(page, 'slide.remove', { baseRevision: s.revision, slideId: newId });
      s = await settled(page);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Meta+z');
      s = await settled(page);
    }
    log(`round ${round}: revision ${s.revision}, slides ${(await slideOrder(page)).length}`);
  }
  s = await settled(page);
  const before = await slideJson(page, title);
  const order = await slideOrder(page);
  const versions = await invoke(page, 'version.list');
  log(`history: ${versions.length} records, revision ${s.revision}`);

  // name the current version through the panel, as the walk does
  await page.keyboard.press('Escape');
  await ctl(page, 'menubar.file').click();
  await page.locator('#ts-menu-file').waitFor({ timeout: 8000 });
  await ctl(page, 'menu.file.versionHistory').hover();
  await page
    .locator('[data-control="menu.file.versionHistory.see"]')
    .first()
    .waitFor({ timeout: 6000 });
  await ctl(page, 'menu.file.versionHistory.see').click();
  await ctl(page, 'panel.versionHistory').waitFor({ timeout: 8000 });
  await ctl(page, 'versionHistory.nameCurrent').click();
  await ctl(page, 'versionHistory.nameCurrent.field').click();
  await page.keyboard.type('Before the customer copy', { delay: 20 });
  await page.keyboard.press('Enter');
  await settled(page);
  log(
    `named: snackbar ${JSON.stringify(
      await ctl(page, 'snackbar')
        .textContent()
        .catch(() => ''),
    )}`,
  );
  for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
    await w.click().catch(() => undefined);
  await page.waitForTimeout(300);
  const restores = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control^="versionHistory."][data-control$=".restore"], [data-control^="version.restore."]',
      ),
    ]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute('data-control')),
  );
  log(
    `${restores.length} restore controls; first ${restores[0]}, last ${restores[restores.length - 1]}`,
  );
  const target = WHICH === 'first' ? restores[0] : restores[restores.length - 1];
  s = await state(page);
  log(
    `before the click: revision ${s.revision} server ${s.serverRevision} pending ${s.sync?.pending ?? s.pending}`,
  );
  const started = Date.now();
  await ctl(page, target).click();
  let changed = false;
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    if (
      (await slideJson(page, title)) !== before ||
      (await slideOrder(page)).length !== order.length
    ) {
      changed = true;
      break;
    }
    await page.waitForTimeout(200);
  }
  const elapsed = Date.now() - started;
  s = await state(page);
  const snack = await ctl(page, 'snackbar')
    .textContent()
    .catch(() => '');
  const notices = await page
    .locator('.ts-versions-notice')
    .allTextContents()
    .catch(() => []);
  log(
    `restore ${target}: changed ${changed} in ${elapsed} ms; slides ${order.length} -> ${(await slideOrder(page)).length}; revision ${s.revision} server ${s.serverRevision} pending ${s.sync?.pending ?? s.pending}; error ${JSON.stringify(s.error ?? null)}; snackbar ${JSON.stringify(snack)}; notices ${JSON.stringify(notices)}`,
  );
  const after = await invoke(page, 'version.list');
  log(
    `version.list after: ${after.length} records; last ${JSON.stringify(after[after.length - 1]?.mutations?.map((m) => m.op))}`,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+z');
  await settled(page);
  log(
    `after Cmd+Z: title equals before ${(await slideJson(page, title)) === before}; slides ${(await slideOrder(page)).length}; revision ${(await state(page)).revision}`,
  );
  if (consoleErrors.length > 0) log(`page errors: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
} catch (error) {
  log(`FAILED: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  if (deck) {
    try {
      const s = await state(page).catch(() => null);
      await invoke(page, 'deck.trash', { deckId: deck, baseRevision: s?.revision }).catch(
        () => undefined,
      );
      await invoke(page, 'deck.remove', { deckId: deck }).catch(() => undefined);
      log(`deck ${deck} trashed and removed`);
    } catch {
      // best effort
    }
  }
  await browser.close();
}

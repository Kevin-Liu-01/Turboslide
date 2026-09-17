// B7 fix round, F22 reproduction: chained window API writes, each based on the previous answer's
// revision (the pattern of gslides-actions.spec.ts's `write` helper), on the memory tier while a
// second tab keeps typing on the same deck. The typing resets the checkpointer's 2 s idle timer,
// so the checkpoint fires at its 10 s hard limit; the first tab's acknowledgement then arrives
// after the controller's ACK_WAIT_MS cap and the answer carries the floor `base + 1`, which the
// next write's checkBase refuses as stale. Prints every answer with the page's reported revision.
//   node docs/gslides-parity/focus/build/b7-chained-writes.mjs --base http://localhost:4369 [--writes 4] [--typing on|off]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:4369');
const WRITES = Number(arg('--writes', '4'));
const TYPING = arg('--typing', 'on') === 'on';
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

async function newDeck(page, title) {
  await page.goto(`${BASE}/new`);
  await waitEditor(page);
  const info = await invoke(page, 'deck.info');
  const run = await runOf(page, /heading/);
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(title, { delay: 40 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
const page = await context.newPage();
let typist = null;
let typing = false;
let deck = '';
const results = [];
try {
  deck = await newDeck(page, 'B7 chained writes repro');
  log(`deck ${deck} created; page revision ${(await state(page)).revision}`);
  if (TYPING) {
    typist = await context.newPage();
    await typist.goto(`${BASE}/edit/${deck}`);
    await waitEditor(typist);
    const run = await runOf(typist, /lead|body|heading/);
    const el = typist
      .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
      .first();
    await el.dblclick();
    await typist.waitForTimeout(200);
    await typist.keyboard.press('End');
    typing = true;
    void (async () => {
      let n = 0;
      while (typing) {
        await typist.keyboard.type('x', { delay: 0 }).catch(() => undefined);
        n += 1;
        await typist.waitForTimeout(300);
      }
      log(`typist stopped after ${n} keystrokes`);
    })();
    await page.waitForTimeout(1500);
    log('second tab typing every 300 ms');
  }
  await page.reload();
  await waitEditor(page);
  await settled(page);
  let revision = (await state(page)).revision;
  const slideId = (await state(page)).slideId;
  log(`chained writes start at revision ${revision} on slide ${slideId}`);
  for (let i = 0; i < WRITES; i += 1) {
    const started = Date.now();
    const s0 = await state(page);
    try {
      const out = await invoke(page, 'block.insert', {
        slideId,
        slot: 'main',
        block: {
          id: `sq${i}`,
          type: 'shape',
          shape: 'rectangle',
          pos: { x: 100 + i * 250, y: 560, w: 200, h: 140 },
        },
        baseRevision: revision,
      });
      const s1 = await state(page);
      const row = {
        n: i,
        base: revision,
        answer: out.revision,
        reportedBefore: s0.revision,
        reportedAfter: s1.revision,
        serverAfter: s1.serverRevision,
        ms: Date.now() - started,
      };
      results.push(row);
      log(
        `write ${i}: base ${row.base} -> answer ${row.answer} in ${row.ms} ms; page reports ${row.reportedAfter} (server ${row.serverAfter})`,
      );
      revision = out.revision;
    } catch (error) {
      const s1 = await state(page);
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      results.push({
        n: i,
        base: revision,
        error: message,
        reportedAfter: s1.revision,
        ms: Date.now() - started,
      });
      log(
        `write ${i}: base ${revision} REFUSED after ${Date.now() - started} ms: ${message} (page reports ${s1.revision})`,
      );
      break;
    }
  }
} finally {
  typing = false;
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (typist) await typist.keyboard.press('Escape').catch(() => undefined);
  if (deck !== '') {
    try {
      await settled(page, 15_000);
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deck, baseRevision: info.revision });
      await invoke(page, 'deck.remove', { id: deck, confirm: true, baseRevision: info.revision });
      log(`teardown: ${deck} trashed and removed`);
    } catch (error) {
      log(
        `teardown failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ base: BASE, typing: TYPING, results }, null, 2));
}

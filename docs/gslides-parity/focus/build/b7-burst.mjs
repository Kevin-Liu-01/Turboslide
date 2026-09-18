// B7 cycle 3, the burst probe (VERIFICATION C2-F24 and C2-F27): a scripted burst of window API
// writes plus asset.add calls against one deck on one origin, every call timed and bounded, so a
// stall of the acknowledgements is read from the wire (which call, how long, what the tab's state
// said) instead of from a walk's shots. The deck is made on /new through the product's first
// write (the title), a second tab of the same deck adds a stream and its presence (the walk's
// shape), and the run trashes and deletes the deck forever at the end and asserts the 404s.
//   VERCEL_OIDC_TOKEN=... node docs/gslides-parity/focus/build/b7-burst.mjs --base <origin> [--writes 60] [--assets 5]
//       [--second-tab on|off] [--bound 60000] [--out burst.json]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:4387').replace(/\/$/, '');
const WRITES = Number(arg('--writes', '60'));
const ASSETS = Number(arg('--assets', '5'));
const SECOND_TAB = arg('--second-tab', 'on') === 'on';
const BOUND_MS = Number(arg('--bound', '60000'));
const OUT = arg('--out', null);
/** Delete forever a deck an earlier run left in the trash, then exit. */
const CLEANUP = arg('--cleanup', null);
/** Fresh contexts loading /edit/gt-brand in a loop beside the burst: the load the sweep and the layout shift audit put on the deployment during the two stalled runs (C2.3). */
const COMPANIONS = Number(arg('--companions', '0'));
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const t0 = Date.now();
const stamp = () => new Date().toISOString();
const log = (line) => console.log(`${String(Date.now() - t0).padStart(7)} ms  ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rows = [];
const consoleLines = [];

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
const saveWords = (page) =>
  page.evaluate(() => document.querySelector('.ts-status')?.textContent?.trim() ?? '');
const invokeRaw = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

/** One bounded, timed window API call; a call past the bound is recorded and the run goes on. */
async function timed(page, label, action, input) {
  const before = await state(page).catch(() => null);
  const started = Date.now();
  let ok = true;
  let error = null;
  let output = null;
  try {
    output = await Promise.race([
      invokeRaw(page, action, input),
      sleep(BOUND_MS).then(() => {
        throw new Error(`no answer within ${BOUND_MS} ms`);
      }),
    ]);
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  }
  const ms = Date.now() - started;
  const after = await state(page).catch(() => null);
  const words = await saveWords(page).catch(() => '');
  const row = {
    at: stamp(),
    label,
    action,
    ms,
    ok,
    error,
    before: before && {
      revision: before.revision,
      server: before.serverRevision,
      pending: before.sync?.pending ?? before.pending,
    },
    after: after && {
      revision: after.revision,
      server: after.serverRevision,
      pending: after.sync?.pending ?? after.pending,
      connected: after.sync?.connected,
      transport: after.sync?.transport,
      error: after.error ?? null,
      rejects: Array.isArray(after.rejects) ? after.rejects.length : undefined,
    },
    words,
  };
  rows.push(row);
  log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(22)} ${String(ms).padStart(6)} ms  r ${row.before?.revision ?? '?'} -> ${row.after?.revision ?? '?'} (server ${row.after?.server ?? '?'}, pending ${row.after?.pending ?? '?'})  "${words}"${error ? `  ${error}` : ''}`,
  );
  return { ok, output, after };
}

async function settled(page, timeout = 30_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0 && s.revision === s.serverRevision) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
}

async function runOf(page, pattern) {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => pattern.test(r)) ?? runs[0];
}

/** /new, the title typed and committed: the product's first write creates the deck. */
async function newDeck(page, title) {
  await page.goto(`${BASE}/new`);
  await waitEditor(page);
  const info = await invokeRaw(page, 'deck.info');
  const run = await runOf(page, /heading/);
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(title, { delay: 30 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  await page.waitForFunction(
    () => window.turboslide?.studio?.describe().state.sync?.connected === true,
    null,
    { timeout: 60_000 },
  );
  await settled(page, 30_000);
  return info.id;
}

/** A PNG of the page's own making, distinct per call so the asset store never sees the same bytes twice. */
const pngDataUrl = (page, n) =>
  page.evaluate((k) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${(k * 47) % 360} 60% 50%)`;
    ctx.fillRect(0, 0, 160, 100);
    ctx.fillStyle = '#111';
    ctx.font = '24px sans-serif';
    ctx.fillText(`burst ${k}`, 12, 60);
    return canvas.toDataURL('image/png');
  }, n);

/** Trash (when not trashed yet) and delete forever one deck through the window API on its editor. */
async function cleanupDeck(context, deckId) {
  const page = await context.newPage();
  await page.goto(`${BASE}/edit/${deckId}`);
  await waitEditor(page);
  const info = await invokeRaw(page, 'deck.info').catch(() => null);
  if (info && !info.trashedAt) {
    await invokeRaw(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch((e) =>
      log(`trash: ${e.message}`),
    );
  }
  const t = await invokeRaw(page, 'deck.info').catch(() => null);
  await invokeRaw(page, 'deck.remove', {
    id: deckId,
    confirm: true,
    baseRevision: t?.revision ?? 0,
  }).catch((e) => log(`remove: ${e.message}`));
  const codes = {};
  for (const path of [`/edit/${deckId}`, `/deck/${deckId}`]) {
    const response = await context.request
      .get(`${BASE}${path}`, { maxRedirects: 0 })
      .catch(() => null);
    codes[path] = response ? response.status() : 'no answer';
  }
  await page.close();
  return codes;
}

/** One companion: fresh contexts opening /edit/gt-brand (the seed deck, 400 odd revisions and its thumbnails) until told to stop. */
async function companion(browser, n, stop) {
  let loads = 0;
  while (!stop.stopped) {
    const context = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width: 1200 + n * 60, height: 800 },
    });
    const page = await context.newPage();
    const started = Date.now();
    try {
      await page.goto(`${BASE}/edit/gt-brand`, { timeout: 90_000 });
      await waitEditor(page);
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1500);
      loads += 1;
      log(`companion ${n}: /edit/gt-brand load ${loads} in ${Date.now() - started} ms`);
    } catch (error) {
      log(
        `companion ${n}: load failed after ${Date.now() - started} ms: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
    await context.close().catch(() => undefined);
  }
  return loads;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1400, height: 900 },
  });
  if (CLEANUP !== null) {
    const codes = await cleanupDeck(context, CLEANUP);
    log(`cleanup ${CLEANUP}: ${JSON.stringify(codes)}`);
    await browser.close();
    process.exit(codes[`/edit/${CLEANUP}`] === 404 && codes[`/deck/${CLEANUP}`] === 404 ? 0 : 1);
  }
  const stop = { stopped: false };
  const companions = [];
  for (let n = 1; n <= COMPANIONS; n += 1) companions.push(companion(browser, n, stop));
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      consoleLines.push(`${stamp()} ${m.type()} ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleLines.push(`${stamp()} pageerror ${e.message}`));
  let deckId = null;
  let second = null;
  const summary = {
    base: BASE,
    startedAt: stamp(),
    writes: WRITES,
    assets: ASSETS,
    secondTab: SECOND_TAB,
    companions: COMPANIONS,
  };
  try {
    deckId = await newDeck(page, `Burst ${new Date().toISOString().slice(11, 19)}`);
    summary.deckId = deckId;
    log(`deck ${deckId} at ${page.url()}`);
    if (SECOND_TAB) {
      second = await context.newPage();
      await second.goto(`${BASE}/edit/${deckId}`);
      await waitEditor(second);
      log('second tab open on the deck');
    }
    let slideId = (await state(page)).slideId;
    let box = null;
    const assetEvery = ASSETS > 0 ? Math.max(1, Math.floor(WRITES / ASSETS)) : Infinity;
    let assetsDone = 0;
    for (let i = 1; i <= WRITES; i += 1) {
      const kind = i % 3;
      const s = await state(page);
      if (kind === 1) {
        const r = await timed(page, `write ${i} slide.new`, 'slide.new', {
          baseRevision: s.revision,
          layout: 'blank',
          after: slideId,
        });
        // slideNew answers { slide, revision, outline } (apps/cli/src/store-actions.ts)
        const id =
          r.output && typeof r.output === 'object' ? (r.output.slide?.id ?? r.output.id) : null;
        if (typeof id === 'string') slideId = id;
        box = null;
      } else if (kind === 2) {
        const id = `burst-${i}-${Date.now().toString(36)}`;
        const r = await timed(page, `write ${i} block.insert`, 'block.insert', {
          slideId,
          slot: 'main',
          block: { id, type: 'text', text: `Burst ${i}`, pos: { x: 200, y: 200, w: 500, h: 120 } },
          baseRevision: s.revision,
        });
        if (r.ok) box = id;
      } else {
        if (box === null) {
          const id = `burst-${i}-${Date.now().toString(36)}`;
          const r = await timed(page, `write ${i} block.insert`, 'block.insert', {
            slideId,
            slot: 'main',
            block: {
              id,
              type: 'text',
              text: `Burst ${i}`,
              pos: { x: 200, y: 200, w: 500, h: 120 },
            },
            baseRevision: s.revision,
          });
          if (r.ok) box = id;
        } else {
          await timed(page, `write ${i} block.set`, 'block.set', {
            slideId,
            blockId: box,
            path: '/pos/x',
            value: 200 + (i % 7) * 40,
            baseRevision: s.revision,
          });
        }
      }
      if (assetsDone < ASSETS && i % assetEvery === 0) {
        assetsDone += 1;
        const url = await pngDataUrl(page, i);
        const s2 = await state(page);
        // a window API caller names its asset: without an id every data URL picture is named
        // assets/capture.png and a second one with other bytes is refused (the first run of this
        // script); the editor's drop path passes assetIdFor(file.name)
        const r = await timed(page, `asset ${assetsDone} asset.add`, 'asset.add', {
          id: `burst-${assetsDone}-${Date.now().toString(36)}`,
          url,
          role: 'capture',
          alt: `burst picture ${assetsDone}`,
          baseRevision: s2.revision,
        });
        if (r.ok && r.output && typeof r.output.id === 'string') {
          const s3 = await state(page);
          await timed(page, `asset ${assetsDone} block.insert`, 'block.insert', {
            slideId,
            slot: 'main',
            block: {
              id: `shot-${assetsDone}-${Date.now().toString(36)}`,
              type: 'shot',
              asset: r.output.id,
              pos: { x: 900, y: 200 + assetsDone * 60, w: 240, h: 150 },
            },
            baseRevision: Math.max(s3.revision, r.output.revision ?? 0),
          });
        }
      }
    }
    // C2-F21's memory tier row `slides.duplicate.two-selected-menu`: Slide > Duplicate slide with two
    // cards selected is one `slide.duplicate` write with two slide ids (the menu plan) and made one
    // copy on the memory tier where the blob tier made two; the same write through the window API
    // reads the mechanism (two inserts in one write through admitOps)
    {
      const info = await invokeRaw(page, 'deck.info');
      const order = info.sections.flatMap((section) => section.slides.map((slide) => slide.id));
      const pair = order.slice(0, 2);
      const s = await state(page);
      const r = await timed(page, 'duplicate two slides', 'slide.duplicate', {
        slideIds: pair,
        baseRevision: s.revision,
      });
      await settled(page, 20_000);
      const after = await invokeRaw(page, 'deck.info');
      const count = after.sections.flatMap((section) => section.slides).length;
      const made =
        r.ok && r.output && Array.isArray(r.output.slides) ? r.output.slides.length : null;
      summary.duplicate = { before: order.length, after: count, answered: made, pair };
      log(
        `duplicate of ${pair.join(', ')}: slides ${order.length} -> ${count}, the action answered ${made} slides`,
      );
    }
    const end = await settled(page, 60_000);
    summary.tabAtEnd = {
      revision: end.revision,
      server: end.serverRevision,
      pending: end.sync?.pending ?? end.pending,
      connected: end.sync?.connected,
      words: await saveWords(page),
    };
    log(
      `tab at the end: revision ${end.revision}, server ${end.serverRevision}, pending ${summary.tabAtEnd.pending}, "${summary.tabAtEnd.words}"`,
    );
    // the store's truth, read from a fresh page
    const fresh = await context.newPage();
    await fresh.goto(`${BASE}/edit/${deckId}`);
    await waitEditor(fresh);
    const info = await invokeRaw(fresh, 'deck.info');
    summary.storeAtEnd = {
      revision: info.revision,
      slides: info.counts?.slides ?? info.slides ?? null,
    };
    log(`store at the end: revision ${info.revision}`);
    await fresh.close();
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    log(`ERROR ${summary.error}`);
  } finally {
    if (deckId !== null) {
      try {
        if (second) await second.close().catch(() => undefined);
        // the base is the tab's reported revision (SPEC-3 3.10): deck.info reads the mirror
        // inside its sync window and lagged the tab by one on the second preview run
        const base = async () => (await state(page).catch(() => null))?.revision ?? 0;
        await Promise.race([
          invokeRaw(page, 'deck.trash', { id: deckId, baseRevision: await base() }),
          sleep(BOUND_MS),
        ]).catch((e) => log(`trash: ${e.message}`));
        await settled(page, 10_000).catch(() => undefined);
        await Promise.race([
          invokeRaw(page, 'deck.remove', { id: deckId, confirm: true, baseRevision: await base() }),
          sleep(BOUND_MS),
        ]).catch((e) => log(`remove: ${e.message}`));
        const codes = {};
        for (const path of [`/edit/${deckId}`, `/deck/${deckId}`]) {
          const response = await context.request
            .get(`${BASE}${path}`, { maxRedirects: 0 })
            .catch(() => null);
          codes[path] = response ? response.status() : 'no answer';
        }
        summary.cleanup = codes;
        log(`cleanup: ${JSON.stringify(codes)}`);
      } catch (error) {
        log(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    stop.stopped = true;
    summary.companionLoads = await Promise.all(companions).catch(() => null);
    await browser.close();
  }
  const failed = rows.filter((r) => !r.ok);
  const slowest = [...rows]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
    .map((r) => `${r.label} ${r.ms} ms`);
  summary.endedAt = stamp();
  summary.calls = rows.length;
  summary.failed = failed.length;
  summary.slowest = slowest;
  summary.consoleLines = consoleLines.length;
  log(`calls ${rows.length}, failed ${failed.length}; slowest: ${slowest.join('; ')}`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ summary, rows, consoleLines }, null, 2));
  process.exit(failed.length > 0 || summary.error ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

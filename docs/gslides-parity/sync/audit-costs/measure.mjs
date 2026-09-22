// The cost audit's network measurement against production (docs/gslides-parity/sync/audit-costs).
// One process, one mode, one scratch deck made from /new through the product at human speed and
// trashed and deleted forever in the finally block. Every request the page makes is recorded
// (fetch, the streamed fetch of the room stream, documents, scripts, styles, fonts, images) with
// its route, status, the CDN's cache word and the response body size, then summed per route per
// minute over the measurement window. Imports nothing but playwright-core.
//
//   node measure.mjs --mode idle|edit|show|loads|export --minutes 3 --out <json> --shots <dir>
//
// idle    an editor tab left alone for the window
// edit    an editor tab with one edit every 5 s for the window
// show    /deck/<id>?present=1 (the show) left alone for the window
// loads   one load each of /home, /decks and /deck/<id>, each recorded until the network rests
// export  File > Download > PDF once, recorded from the click to the download
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : []))
    .filter((x) => x.length),
);
const MODE = args.mode ?? 'idle';
const MINUTES = Number(args.minutes ?? 3);
const OUT = args.out ?? `./out-${MODE}.json`;
const SHOTS = args.shots ?? './shots';
const BASE = 'https://turboslide.vercel.app';
const VIEWPORT = { width: 1440, height: 900 };
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), MODE, ...a);

// ------------------------------------------------------------------------------------------------
// human speed (the probes' rules: keys 40 to 90 ms apart, the mouse in steps)

const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(50, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await page
    .locator(`#ts-menu-${id} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const row = ctl(page, `menu.${rowId}`);
  const r = await row.boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(250, 400));
  const ok = await page
    .locator(waitFor)
    .first()
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(rand(300, 450));
    await page.locator(waitFor).first().waitFor({ timeout: 4000 });
  }
};

// ------------------------------------------------------------------------------------------------
// the product

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const waitRevision = async (page, want, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s.revision >= want) return s.revision;
    if (Date.now() > until) return s.revision;
    await sleep(150);
  }
};
const runs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
const runRect = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, run);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const openRun = async (page, run) => {
  const r = await runRect(page, run);
  if (!r) throw new Error(`no run ${run}`);
  await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  return editing(page);
};
const closeNamePrompt = async (page) => {
  if (
    await ctl(page, 'dialog.namePrompt')
      .first()
      .isVisible()
      .catch(() => false)
  )
    await clickControl(page, 'dialog.namePrompt.close').catch(() => undefined);
};

// ------------------------------------------------------------------------------------------------
// the network log

function routeOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'other';
  }
  if (u.hostname.endsWith('.blob.vercel-storage.com')) return 'blob public host';
  if (u.hostname !== 'turboslide.vercel.app') return `third party ${u.hostname}`;
  const p = u.pathname;
  let m;
  if ((m = /^\/api\/decks\/[^/]+\/(stream|ops|presence)$/.exec(p)))
    return `/api/decks/<id>/${m[1]}`;
  if (p.startsWith('/_serverFn/')) return `/_serverFn/${p.slice(11, 19)}…`;
  if (p.startsWith('/api/render/')) return '/api/render/<slide>';
  if (p.startsWith('/api/export/')) return '/api/export/<id>';
  if (p.startsWith('/api/download/')) return '/api/download/<token>';
  if (p.startsWith('/api/x/csp/')) return '/api/x/csp/report';
  if (p.startsWith('/api/')) return p.replace(/[a-z0-9]{8,}/g, '<x>');
  if (/^\/decks\/[^/]+\/assets\//.test(p)) return '/decks/<id>/assets/*';
  if (p.startsWith('/assets/')) return '/assets/* (static)';
  if (p.startsWith('/home/') || p.startsWith('/brand/') || p.startsWith('/icons/'))
    return `${p.split('/')[1]}/* (static)`;
  if (/^\/(edit|deck|present|embed|print)\/[^/]+/.test(p))
    return `/${p.split('/')[1]}/<id> (document)`;
  if (p === '/new' || p === '/decks' || p === '/home' || p === '/decks/trash')
    return `${p} (document)`;
  return p;
}

function attachLog(page, records) {
  page.on('request', (request) => {
    records.push({
      t: Date.now(),
      url: request.url(),
      method: request.method(),
      type: request.resourceType(),
      route: routeOf(request.url()),
      status: null,
      cache: null,
      cacheControl: null,
      bytes: null,
      pending: true,
      _req: request,
    });
  });
  page.on('response', (response) => {
    const row = records.find((r) => r._req === response.request());
    if (!row) return;
    row.status = response.status();
    row.cache = response.headers()['x-vercel-cache'] ?? null;
    row.cacheControl = response.headers()['cache-control'] ?? null;
    const cl = response.headers()['content-length'];
    if (cl !== undefined) row.bytes = Number(cl);
  });
  page.on('requestfinished', async (request) => {
    const row = records.find((r) => r._req === request);
    if (!row) return;
    row.pending = false;
    row.tEnd = Date.now();
    try {
      const sizes = await request.sizes();
      if (row.bytes === null) row.bytes = sizes.responseBodySize;
      row.headersBytes = sizes.responseHeadersSize;
    } catch {
      // the request left before its sizes were read
    }
  });
  page.on('requestfailed', (request) => {
    const row = records.find((r) => r._req === request);
    if (!row) return;
    row.pending = false;
    row.tEnd = Date.now();
    row.failed = request.failure()?.errorText ?? 'failed';
  });
}

function summarize(records, t0, t1) {
  const minutes = Math.max(1 / 60, (t1 - t0) / 60_000);
  const inWindow = records.filter((r) => r.t >= t0 && r.t < t1);
  const byRoute = {};
  for (const r of inWindow) {
    const k = r.route;
    byRoute[k] ??= {
      requests: 0,
      bytes: 0,
      statuses: {},
      cache: {},
      methods: {},
      types: {},
      pending: 0,
    };
    const b = byRoute[k];
    b.requests += 1;
    b.bytes += r.bytes ?? 0;
    b.statuses[r.status ?? (r.failed ? 'failed' : 'pending')] =
      (b.statuses[r.status ?? (r.failed ? 'failed' : 'pending')] ?? 0) + 1;
    if (r.cache) b.cache[r.cache] = (b.cache[r.cache] ?? 0) + 1;
    b.methods[r.method] = (b.methods[r.method] ?? 0) + 1;
    b.types[r.type] = (b.types[r.type] ?? 0) + 1;
    if (r.pending) b.pending += 1;
  }
  const rows = Object.entries(byRoute)
    .map(([route, b]) => ({ route, ...b, perMinute: Number((b.requests / minutes).toFixed(2)) }))
    .sort((a, b) => b.requests - a.requests);
  return {
    windowMs: t1 - t0,
    minutes: Number(minutes.toFixed(2)),
    requests: inWindow.length,
    rows,
  };
}

const strip = (records) =>
  records.map(({ _req, ...r }) => ({
    ...r,
    url: r.url.replace(/\?.*$/, (q) => (q.length > 80 ? q.slice(0, 80) + '…' : q)),
  }));

// ------------------------------------------------------------------------------------------------
// the scratch deck

async function freshDeck(page) {
  const TITLE = 'Cost audit scratch, Q3 2026';
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  const s = await state(page);
  const all = await runs(page);
  const head = all.find((x) => /heading/.test(x)) ?? all[0] ?? null;
  if (!head) throw new Error(`${info.id}: no run to type the title into`);
  await closeNamePrompt(page);
  await openRun(page, head);
  await typeHuman(page, TITLE);
  await sleep(300);
  await press(page, 'Escape');
  const revision = await waitRevision(page, 1, 45_000);
  await page.waitForURL(/\/edit\//, { timeout: 45_000 }).catch(() => undefined);
  await closeNamePrompt(page);
  await settled(page);
  const body = all.find((x) => x !== head) ?? null;
  return { id: info.id, titleSlide: s.slideId, head, body, revision, url: page.url() };
}

async function cleanup(page, deckId, note) {
  const result = { trashed: 'not tried', removed: 'not tried', edit: null, deck: null };
  try {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await settled(page);
    await press(page, 'Escape', 2);
    await clickControl(page, 'menubar.file');
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await clickControl(page, 'menu.file.moveToTrash');
    await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
    result.trashed = 'File > Move to trash';
  } catch (error) {
    result.trashed = `the menu failed (${String(error).split('\n')[0]}); the window API`;
    try {
      await page
        .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
      await editorReady(page).catch(() => undefined);
      const info = await invoke(page, 'deck.info').catch(() => null);
      if (info)
        await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
    } catch {
      // the 404 row below tells the truth
    }
  }
  try {
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
      timeout: 30_000,
    });
    const card = page.locator(`[data-control="trash.card.${deckId}"]`);
    await card.waitFor({ timeout: 30_000 });
    await clickControl(page, `trash.delete.${deckId}`);
    await clickControl(page, 'trash.confirm.ok');
    await card.waitFor({ state: 'detached', timeout: 30_000 });
    result.removed = 'Delete forever on /decks/trash';
  } catch (error) {
    result.removed = `the trash page failed (${String(error).split('\n')[0]}); the window API`;
    await page
      .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await editorReady(page).catch(() => undefined);
    const info = await invoke(page, 'deck.info').catch(() => null);
    if (info) {
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
        () => undefined,
      );
      const again = await invoke(page, 'deck.info').catch(() => null);
      await invoke(page, 'deck.remove', {
        id: deckId,
        baseRevision: again?.revision ?? info.revision,
        confirm: true,
      }).catch(() => undefined);
    }
  }
  const until = Date.now() + 30_000;
  for (;;) {
    for (const route of ['edit', 'deck']) {
      const res = await page.request
        .get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 })
        .catch(() => null);
      result[route] = res ? res.status() : 'no answer';
    }
    if ((result.edit === 404 && result.deck === 404) || Date.now() > until) break;
    await sleep(2000);
  }
  log('cleanup', note ?? '', JSON.stringify(result));
  return result;
}

// ------------------------------------------------------------------------------------------------
// the modes

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
  const page = await context.newPage();
  const records = [];
  attachLog(page, records);
  const out = {
    mode: MODE,
    base: BASE,
    viewport: VIEWPORT,
    startedAt: new Date().toISOString(),
    phases: {},
  };
  let deck = null;
  try {
    const tSetup0 = Date.now();
    deck = await freshDeck(page);
    out.deck = deck;
    out.phases.setup = {
      ...summarize(records, tSetup0, Date.now()),
      note: 'from /new to the deck at /edit with its title written',
    };
    log('deck', deck.id, 'revision', deck.revision, 'at', deck.url);

    if (MODE === 'idle' || MODE === 'edit') {
      await sleep(5000);
      const t0 = Date.now();
      await page.screenshot({ path: join(SHOTS, `${MODE}-start.png`) });
      if (MODE === 'idle') {
        await sleep(MINUTES * 60_000);
      } else {
        const target = deck.body ?? deck.head;
        let n = 0;
        const end = t0 + MINUTES * 60_000;
        while (Date.now() < end) {
          const tick = Date.now();
          try {
            await openRun(page, target);
            await typeHuman(page, n % 2 === 0 ? 'ok ' : 'go ');
            await press(page, 'Escape');
            n += 1;
          } catch (error) {
            log('edit failed', String(error).split('\n')[0]);
          }
          const wait = 5000 - (Date.now() - tick);
          if (wait > 0) await sleep(Math.min(wait, Math.max(0, end - Date.now())));
        }
        out.edits = n;
        out.revisionAfter = (await state(page)).revision;
      }
      const t1 = Date.now();
      await page.screenshot({ path: join(SHOTS, `${MODE}-end.png`) });
      out.phases.window = { ...summarize(records, t0, t1), note: `${MODE} for ${MINUTES} minutes` };
      out.saveState = await page.evaluate(
        () =>
          document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
      );
    }

    if (MODE === 'show') {
      const tLoad0 = Date.now();
      await page.goto(`${BASE}/deck/${deck.id}?present=1`, { waitUntil: 'load' });
      await sleep(8000);
      out.phases.showLoad = {
        ...summarize(records, tLoad0, Date.now()),
        note: 'the show load, /deck/<id>?present=1, until 8 s after load',
      };
      const t0 = Date.now();
      await page.screenshot({ path: join(SHOTS, 'show-start.png') });
      await sleep(MINUTES * 60_000);
      const t1 = Date.now();
      await page.screenshot({ path: join(SHOTS, 'show-end.png') });
      out.phases.window = {
        ...summarize(records, t0, t1),
        note: `the show left alone for ${MINUTES} minutes`,
      };
    }

    if (MODE === 'loads') {
      for (const [name, path, waitFor] of [
        ['home', '/home', null],
        ['decks', '/decks', '.ts-home-page[data-hydrated]'],
        ['deck', `/deck/${deck.id}`, null],
      ]) {
        const t0 = Date.now();
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
        if (waitFor)
          await page.waitForSelector(waitFor, { timeout: 30_000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
        await sleep(6000);
        const t1 = Date.now();
        await page.screenshot({ path: join(SHOTS, `load-${name}.png`) });
        out.phases[`load ${name}`] = {
          ...summarize(records, t0, t1),
          note: `one load of ${path}, recorded until the network rested plus 6 s`,
        };
      }
    }

    if (MODE === 'export') {
      await page.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      await press(page, 'Escape', 2);
      const t0 = Date.now();
      const download = page.waitForEvent('download', { timeout: 240_000 }).catch(() => null);
      await openMenu(page, 'file');
      await hoverRow(page, 'file.download', '[data-control="menu.file.download.pdf"]');
      await clickControl(page, 'menu.file.download.pdf');
      const dl = await download;
      const t1 = Date.now();
      out.download = dl
        ? { name: dl.suggestedFilename(), url: dl.url().replace(/\?.*$/, '?…') }
        : null;
      if (dl) await dl.cancel().catch(() => undefined);
      await sleep(4000);
      await page.screenshot({ path: join(SHOTS, 'export-end.png') });
      out.phases.export = {
        ...summarize(records, t0, Date.now()),
        note: 'File > Download > PDF, from the click to the download plus 4 s',
        downloadMs: dl ? t1 - t0 : null,
      };
      out.saveState = await page.evaluate(
        () =>
          document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
      );
      out.snackbar = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-snackbar, .pt-toast')]
          .map((el) => el.textContent?.trim())
          .filter(Boolean),
      );
    }
  } catch (error) {
    out.error = String(error && error.stack ? error.stack : error)
      .split('\n')
      .slice(0, 4)
      .join(' | ');
    log('error', out.error);
    await page.screenshot({ path: join(SHOTS, `${MODE}-error.png`) }).catch(() => undefined);
  } finally {
    if (deck) {
      const tC = Date.now();
      out.cleanup = await cleanup(page, deck.id, MODE).catch((error) => ({ error: String(error) }));
      out.phases.cleanup = {
        ...summarize(records, tC, Date.now()),
        note: 'File > Move to trash, Delete forever on /decks/trash, the 404 checks',
      };
    }
    out.requests = strip(records);
    out.endedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    log('wrote', OUT, 'requests', records.length);
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

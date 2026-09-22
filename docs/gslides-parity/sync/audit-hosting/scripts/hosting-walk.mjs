#!/usr/bin/env node
// The hosting audit's production walk (read only against the platform; the one deck it makes is
// trashed and deleted forever in the finally block). Imports nothing from the repository but
// playwright-core (resolved from the repository root's node_modules). Headless Chromium, 1440 by
// 900, human speed: the mouse moves in steps, 40 to 90 ms per key, a real double click.
//
// What it measures for the hosting plan:
//   1. the root redirect and the first bytes of /new (status, x-vercel-id, cache state)
//   2. a deck created from /new by typing a title (the store write path)
//   3. one open editor tab idle for 60 s: every request by origin and path family, so the cost
//      of one open tab on Fluid compute and on Blob is a measured number and not a guess
//   4. /decks (the footer, the listing), the store host the browser reads twins from
//   5. File > Move to trash, Delete forever on /decks/trash, 404 on /edit and /deck
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const OUT =
  process.argv[2] ?? '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/sync/audit-hosting';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const moveHuman = async (page, from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(8, 22));
  }
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
const clickControl = async (page, control) => {
  const el = page.locator(`[data-control="${control}"]`).first();
  await el.waitFor({ timeout: 15_000 });
  const r = await el.boundingBox();
  if (!r) throw new Error(`no box for ${control}`);
  const to = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await moveHuman(page, { x: to.x - 60, y: to.y + 30 }, to, 8);
  await sleep(rand(40, 90));
  await page.mouse.click(to.x, to.y);
  await sleep(rand(120, 220));
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
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
    return { x: b.x, y: b.y, w: b.width, h: b.height, text: el.textContent ?? '' };
  }, run);
const revision = (page) =>
  page.evaluate(() => window.turboslide.studio.describe().state?.revision ?? null);

// ---- the request ledger
function family(url, method) {
  const u = new URL(url);
  if (u.hostname.endsWith('.blob.vercel-storage.com'))
    return `blob ${u.hostname.split('.')[1]} ${method}`;
  if (u.hostname !== 'turboslide.vercel.app') return `other ${u.hostname}`;
  const p = u.pathname;
  if (/^\/api\/decks\/[^/]+\/stream/.test(p)) return 'function /api/decks/:id/stream';
  if (/^\/api\/decks\/[^/]+\/ops/.test(p)) return `function /api/decks/:id/ops ${method}`;
  if (/^\/api\/decks\/[^/]+\/presence/.test(p)) return `function /api/decks/:id/presence ${method}`;
  if (p.startsWith('/_serverFn/')) return `function /_serverFn ${method}`;
  if (p.startsWith('/api/render/')) return 'function /api/render';
  if (p.startsWith('/api/')) return `function ${p.split('/').slice(0, 3).join('/')} ${method}`;
  if (p.startsWith('/assets/')) return 'static /assets (chunks)';
  if (/^\/decks\/[^/]+\/assets\//.test(p)) return 'twins /decks/:id/assets';
  if (p.startsWith('/fonts/')) return 'static /fonts';
  if (
    /^\/(icons|brand|og)\//.test(p) ||
    /^\/(favicon\.ico|icon\.svg|manifest\.webmanifest)$/.test(p)
  )
    return 'static icons';
  return `page ${p.replace(/\/[^/]+$/, '/:x')}`;
}

const ledger = [];
let phase = 'boot';
const consoleErrors = [];
const steps = [];
const record = (name, expected, observed, ok) => {
  steps.push({ name, expected, observed, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${observed}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('response', (res) => {
  const req = res.request();
  const headers = res.headers();
  ledger.push({
    t: Date.now(),
    phase,
    family: family(req.url(), req.method()),
    method: req.method(),
    status: res.status(),
    vercelId: headers['x-vercel-id'] ?? null,
    cache: headers['x-vercel-cache'] ?? null,
    type: req.resourceType(),
  });
});
page.on('requestfailed', (req) => {
  ledger.push({
    t: Date.now(),
    phase,
    family: family(req.url(), req.method()),
    method: req.method(),
    status: 0,
    failure: req.failure()?.errorText ?? 'failed',
  });
});

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

let deckId = '';
let removed = false;
const TITLE = 'Hosting audit scratch deck, 2026-09-20';
try {
  // ---- 1. the root redirect
  phase = 'root';
  const first = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const chain = [];
  let r = first?.request();
  while (r) {
    const rr = r.redirectedFrom();
    if (!rr) break;
    chain.unshift({ url: rr.url(), status: (await rr.response())?.status() ?? null });
    r = rr;
  }
  record(
    'GET / redirects to /new',
    'a 307 and the editor shell',
    `${chain.map((c) => `${c.status} ${c.url.replace(BASE, '')}`).join(' -> ') || 'no redirect'} -> ${page.url().replace(BASE, '')}`,
    /\/new$/.test(page.url()),
  );
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  record('the draft opened', 'an untitled draft id', deckId, /^untitled-/.test(deckId));
  await shot('01-new-draft');

  // ---- 2. the title, so the deck is created in the store
  phase = 'create';
  const all = await runs(page);
  const HEAD = all.find((x) => /heading/.test(x)) ?? all[0];
  const rect = await runRect(page, HEAD);
  await dblclickAt(page, rect.x + rect.w / 2, rect.y + rect.h / 2);
  await typeHuman(page, TITLE);
  await sleep(500);
  await page.keyboard.press('Escape');
  const until = Date.now() + 30_000;
  let rev = null;
  while (Date.now() < until) {
    rev = await revision(page).catch(() => null);
    if (rev !== null && rev >= 1 && /\/edit\//.test(page.url())) break;
    await sleep(300);
  }
  if (await page.locator('[data-control="dialog.namePrompt"]').count())
    await clickControl(page, 'dialog.namePrompt.close').catch(() => undefined);
  record(
    'Escape commits the title and creates the deck',
    'the address moves to /edit/<id>, revision 1 or more',
    `${page.url().replace(BASE, '')}; revision ${rev}`,
    /\/edit\//.test(page.url()) && rev !== null && rev >= 1,
  );
  await shot('02-created');

  // ---- 3. one idle tab for 60 s
  phase = 'idle';
  const idleStart = Date.now();
  await sleep(60_000);
  const idle = ledger.filter((e) => e.phase === 'idle' && e.t >= idleStart);
  const byFamily = {};
  for (const e of idle) {
    const k = `${e.family} ${e.status}`;
    byFamily[k] = (byFamily[k] ?? 0) + 1;
  }
  const functionHits = idle.filter((e) => e.family.startsWith('function')).length;
  const blobHits = idle.filter((e) => e.family.startsWith('blob')).length;
  record(
    '60 s idle in the editor',
    'the pulse on a budget: few function calls, no Blob calls from the browser',
    `${idle.length} responses: ${functionHits} function, ${blobHits} blob; ${JSON.stringify(byFamily)}`,
    true,
  );
  await shot('03-idle-60s');

  // ---- 4. /decks
  phase = 'decks';
  await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
    .catch(() => undefined);
  await sleep(2500);
  const listed = (await page.locator(`[data-control="home.card.${deckId}"]`).count()) > 0;
  const footer = await page
    .locator('.ts-home-tail')
    .innerText()
    .catch(() => '');
  const twinHosts = [
    ...new Set(
      ledger.filter((e) => e.phase === 'decks' && e.family.startsWith('blob')).map((e) => e.family),
    ),
  ];
  record(
    '/decks lists the new deck',
    'the card is listed (the folder listing lags the store by up to a minute)',
    `card listed ${listed}; footer "${footer.replace(/\s+/g, ' ').trim()}"; blob families ${twinHosts.join(', ') || 'none'}`,
    true,
  );
  await shot('04-decks');

  // ---- 5. File > Move to trash
  phase = 'trash';
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await clickControl(page, 'menubar.file');
  await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
  await clickControl(page, 'menu.file.moveToTrash');
  await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
  await page
    .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
    .catch(() => undefined);
  const stillListed = (await page.locator(`[data-control="home.card.${deckId}"]`).count()) > 0;
  record(
    'File > Move to trash',
    'the address moves to /decks and the deck is not listed',
    `${page.url().replace(BASE, '')}; card listed ${stillListed}`,
    /\/decks/.test(page.url()) && !stillListed,
  );
  await shot('05-after-trash');

  // ---- 6. Delete forever
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
    timeout: 30_000,
  });
  const card = page.locator(`[data-control="trash.card.${deckId}"]`);
  await card.waitFor({ timeout: 30_000 });
  await shot('06-trash-page');
  await clickControl(page, `trash.delete.${deckId}`);
  await clickControl(page, 'trash.confirm.ok');
  await card.waitFor({ state: 'detached', timeout: 30_000 });
  removed = true;
  const status = { edit: 0, deck: 0 };
  const deadline = Date.now() + 20_000;
  for (;;) {
    for (const route of ['edit', 'deck']) {
      const res = await page.request.get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 });
      status[route] = res.status();
    }
    if ((status.edit === 404 && status.deck === 404) || Date.now() > deadline) break;
    await sleep(1000);
  }
  record(
    'Delete forever, then GET /edit/<id> and /deck/<id>',
    'both answer 404 within 20 s',
    `edit ${status.edit}, deck ${status.deck}`,
    status.edit === 404 && status.deck === 404,
  );
  await shot('07-trash-after-delete');
} catch (error) {
  record(
    'the walk threw',
    'no throw',
    error instanceof Error ? error.message.split('\n')[0] : String(error),
    false,
  );
  await shot('99-error').catch(() => undefined);
} finally {
  if (deckId && !removed) {
    // the actions API through the window, the fallback of the core walk's finally block
    try {
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
      const res = await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 });
      record(
        'fallback cleanup through the actions API',
        '404 on /deck/<id>',
        `deck ${res.status()}`,
        res.status() === 404,
      );
    } catch (error) {
      record(
        'fallback cleanup',
        'the deck removed',
        error instanceof Error ? error.message.split('\n')[0] : String(error),
        false,
      );
    }
  }
  const idle = ledger.filter((e) => e.phase === 'idle');
  const summary = {
    base: BASE,
    at: new Date().toISOString(),
    deckId,
    removed,
    steps,
    consoleErrors: consoleErrors.slice(0, 20),
    firstResponses: ledger.filter((e) => e.phase === 'root').slice(0, 12),
    idle: {
      seconds: 60,
      responses: idle.length,
      byFamilyAndStatus: idle.reduce((acc, e) => {
        const k = `${e.family} ${e.status}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    },
    allByFamily: ledger.reduce((acc, e) => {
      const k = `${e.phase} | ${e.family} ${e.status}`;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    regions: [
      ...new Set(
        ledger.map((e) => (e.vercelId ?? '').split('::').slice(0, 2).join('::')).filter(Boolean),
      ),
    ],
  };
  writeFileSync(join(OUT, 'hosting-walk.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await browser.close();
  console.log(
    `\n${steps.filter((s) => s.ok).length}/${steps.length} steps ok; deck ${deckId || 'none'} removed ${removed}`,
  );
}

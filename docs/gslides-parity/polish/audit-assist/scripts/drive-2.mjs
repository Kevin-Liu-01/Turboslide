// The polish round's audit drive for the area "Tools: Tailor, the Assist panel, the agent
// surface, the templates and the inbox behind Advanced tools, the appearance setting and
// Preferences". Drives production at human speed on one scratch deck made from /new, takes a
// screenshot after every action worth judging, records every reading in rows.json, and trashes
// and deletes the deck forever in the finally block. The bearer arrives in TURBOSLIDE_TOKEN from
// the wrapper and is never printed. Imports nothing from the repository but playwright-core.
//
//   node with-tokens.mjs -- node audit-drive.mjs [--base <origin>] [--out <dir>]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide-live/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://www.turboslide.com').replace(/\/$/, '');
const OUT = arg(
  'out',
  '/Users/kevinliu/repos/Turboslide-live/docs/gslides-parity/polish/audit-assist',
);
mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.TURBOSLIDE_TOKEN ?? null;
const STAMP = Date.now().toString(36).slice(-4);

// ---------------------------------------------------------------------------------------------
// the table
const rows = [];
const startedAt = Date.now();
const record = (step, expected, observed, ok, extra = {}) => {
  const row = {
    n: rows.length + 1,
    step,
    expected,
    observed: String(observed),
    ok,
    at: Math.round((Date.now() - startedAt) / 100) / 10,
    ...extra,
  };
  rows.push(row);
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed.slice(0, 700)}`,
  );
};
const step = async (name, expected, fn) => {
  try {
    const r = await fn();
    record(name, expected, r.observed, r.ok, r.extra ?? {});
    return r;
  } catch (error) {
    record(
      name,
      expected,
      `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      false,
    );
    await recover();
    return { ok: false, observed: 'error' };
  }
};

// ---------------------------------------------------------------------------------------------
// human speed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const typeHuman = async (text) => {
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(60, 110));
  }
};
const moveHuman = async (from, to, steps = 10) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (x, y, opts = {}) => {
  await moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
};
const dblclickAt = async (x, y) => {
  await moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(200, 320));
};
const hoverAt = async (x, y) => {
  await moveHuman({ x: x - 30, y: y - 20 }, { x, y }, 6);
  await sleep(rand(500, 700));
};

// ---------------------------------------------------------------------------------------------
// the product
const invoke = (action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (p = page) => {
  await p.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await p.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state();
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const waitRevision = async (want, timeout = 25_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state();
    if (s.revision >= want) return s.revision;
    if (Date.now() > until) return s.revision;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const ctl = (control, p = page) => p.locator(`[data-control="${control}"]`);
const has = (selector, p = page) =>
  p
    .locator(selector)
    .first()
    .isVisible({ timeout: 300 })
    .catch(() => false);
const visible = (control, p = page) => has(`[data-control="${control}"]`, p);
const textOf = (control, p = page) =>
  ctl(control, p)
    .first()
    .textContent({ timeout: 1500 })
    .then((t) => t?.trim().replace(/\s+/g, ' ') ?? null)
    .catch(() => null);
const valueOf = (control, p = page) =>
  ctl(control, p)
    .first()
    .inputValue({ timeout: 1500 })
    .catch(() => null);
const attr = (selector, name, p = page) =>
  p
    .locator(selector)
    .first()
    .getAttribute(name, { timeout: 1500 })
    .catch(() => null);
const rectOf = async (selector, p = page) =>
  p
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
const clickControl = async (control, p = page) => {
  const el = ctl(control, p).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
};
const hoverControl = async (control) => {
  const r = await ctl(control).first().boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await hoverAt(r.x + r.width / 2, r.y + r.height / 2);
};
const menuRoot = (id) => `#ts-menu-${id}`;
const openMenu = async (id) => {
  const r = await ctl(`menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(menuRoot(id)).waitFor({ timeout: 8000 });
  await page
    .locator(`${menuRoot(id)} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const hoverRow = async (rowId, waitFor) => {
  const r = await ctl(`menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman({ x: r.x - 20, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
  await sleep(rand(250, 400));
  if (!waitFor) return;
  try {
    await page.locator(waitFor).first().waitFor({ timeout: 6000 });
  } catch (error) {
    await moveHuman({ x: r.x + 6, y: r.y + r.height / 2 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 6);
    await sleep(rand(300, 450));
    if (await page.locator(waitFor).first().isVisible().catch(() => false)) return;
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(rand(300, 450));
    await page
      .locator(waitFor)
      .first()
      .waitFor({ timeout: 4000 })
      .catch(() => {
        throw error;
      });
  }
};
const clickRow = async (rowId) => {
  const r = await ctl(`menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
};
/** menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection') */
const menuPath = async (menuId, ...rowIds) => {
  await closeAll();
  await openMenu(menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1)
    await hoverRow(rowIds[i], `[data-control="menu.${rowIds[i + 1]}"]`);
  await clickRow(rowIds[rowIds.length - 1]);
  await sleep(rand(250, 400));
};
const menuRows = (menuId) =>
  page.evaluate(
    (root) =>
      [...document.querySelectorAll(`${root} [data-control^="menu."]`)]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          id: el.getAttribute('data-control').replace(/^menu\./, ''),
          label: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) ?? '',
          disabled: el.getAttribute('aria-disabled') === 'true',
          checked: el.getAttribute('aria-checked'),
        })),
    menuRoot(menuId),
  );
const closeMenus = async () => {
  await press('Escape');
  await sleep(150);
  if ((await page.locator('[id^="ts-menu-"]:visible, .ts-context-menu:visible').count()) > 0) {
    await press('Escape');
    await sleep(150);
  }
};
const closeAll = async () => {
  if ((await page.locator('[id^="ts-menu-"]:visible, .ts-context-menu:visible').count()) > 0)
    await closeMenus();
  if (await has('.ts-dialog-scrim [role="dialog"]')) {
    await press('Escape');
    await sleep(200);
  }
};
const recover = async () => {
  await closeAll().catch(() => undefined);
  await press('Escape', 2).catch(() => undefined);
};
const clearAll = async () => {
  await press('Escape', 3);
  await sleep(200);
};
const controlsUnder = (prefix, p = page) =>
  p.evaluate(
    (pre) =>
      [...document.querySelectorAll(`[data-control^="${pre}"]`)]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-control'),
            label: (el.getAttribute('aria-label') ?? el.textContent ?? '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 80),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          };
        }),
    prefix,
  );
const runs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        run: el.getAttribute('data-run'),
        text: el.textContent?.trim() ?? '',
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      };
    }),
  );
const openRun = async (run) => {
  const list = await runs();
  const info = list.find((x) => x.run === run);
  if (!info) throw new Error(`no run ${run} on the stage`);
  await dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
  await sleep(250);
};
const snackbar = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-control="snackbar"]');
    if (!el || el.getClientRects().length === 0 || (el.textContent ?? '').trim() === '') return null;
    const action = el.querySelector('[data-control="snackbar.action"]');
    return {
      text: el.textContent?.trim().replace(/\s+/g, ' ') ?? '',
      action: action?.textContent?.trim() ?? null,
    };
  });
const snackbarWithin = (ms = 6000) => pollUntil(snackbar, (s) => s !== null, ms, 150);
const shot = async (name, p = page, opts = {}) => {
  const file = path.join(OUT, `${name}.png`);
  await p.screenshot({ path: file, ...opts });
  return `${name}.png`;
};
const advancedOn = async () => (await state()).settings?.advancedTools === true;
const setAdvanced = async (on) => {
  if ((await advancedOn()) === on) return true;
  await menuPath('tools', 'tools.advancedTools');
  const got = await pollUntil(advancedOn, (x) => x === on, 8000).catch(() => null);
  return got === on;
};
const slideOrder = async () => (await invoke('slide.list')).map((s) => s.id ?? s.slideId ?? s);
const slideJson = async (id) => {
  const got = await invoke('slide.get', { slideId: id });
  return got.slide ?? got;
};
const deckFacts = async () => {
  const ids = await slideOrder();
  let acme = 0;
  let globex = 0;
  const skipped = [];
  for (const id of ids) {
    const json = JSON.stringify(await slideJson(id), (k, v) =>
      ['id', 'type', 'asset', 'assets', 'pos', 'ext', 'link', 'name', 'alt'].includes(k)
        ? undefined
        : v,
    );
    acme += (json.match(/acme/gi) ?? []).length;
    globex += (json.match(/globex/gi) ?? []).length;
    const s = await slideJson(id);
    if (s.skip === true) skipped.push(id);
  }
  const info = await invoke('deck.info');
  return { acme, globex, skipped, title: info.title, revision: info.revision };
};
const httpAction = async (action, input, { author = null, deck = deckId } = {}) => {
  if (!TOKEN) return { noBearer: true, status: 0, body: null };
  const headers = {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    ...(author ? { 'x-turboslide-author': author } : {}),
  };
  const started = Date.now();
  const res = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deck)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body, ms: Date.now() - started };
};
const theme = () =>
  page.evaluate(() => ({
    root: document.documentElement.getAttribute('data-theme'),
    viewer: document.querySelector('.pt-viewer')?.getAttribute('data-theme') ?? null,
    stage:
      document.querySelector('.ts-stagewrap.ts-editor [data-theme]')?.getAttribute('data-theme') ??
      null,
  }));
const finderRows = async (phrase) => {
  await clearAll();
  await clickControl('toolbar.search');
  await ctl('palette.query').waitFor({ timeout: 8000 });
  await typeHuman(phrase);
  await sleep(600);
  const rowsRead = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control="palette"] [data-control^="palette."], [data-control^="finder."]',
      ),
    ]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        id: el.getAttribute('data-control'),
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '',
      }))
      .filter((c) => !['palette.query', 'palette.icon', 'palette'].includes(c.id)),
  );
  const empty = await page.evaluate(
    () => document.querySelector('[data-control="palette"] .pt-search-empty')?.textContent?.trim() ?? null,
  );
  return { rows: rowsRead, empty };
};

// ---------------------------------------------------------------------------------------------
// the run
const consoleErrors = [];
const popups = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
context.on('page', (p) => {
  popups.push(p);
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
let deckId = null;
let titleSlide = null;
let slideTwo = null;
let slideThree = null;
let templateId = null;
let linkId = null;
let viewUrl = null;
const facts = {};
const TITLE = 'Acme pricing review, Q3 2026';
const LONG =
  'Our renewal proposal covers the three regions your team asked about, adds the two new products at the volume price, keeps the services desk on the same terms, moves the review to each quarter, and holds the price for the first two years of the agreement so budgeting stays simple for your finance team at Acme.';

const closePanel = async () => {
  if (await visible('panel.assist.close')) await clickControl('panel.assist.close');
  else if (await visible('panel.assist')) await press('Escape');
  await sleep(200);
};
const panelState = async () => ({
  open: await visible('panel.assist'),
  firstLine: await textOf('panel.assist.firstLine'),
  slide: await textOf('panel.assist.slide'),
  starters: await controlsUnder('panel.assist.starter.'),
  off: await textOf('panel.assist.off'),
  viewer: await textOf('panel.assist.viewer'),
  error: await textOf('panel.assist.error'),
  busy: await textOf('panel.assist.busy'),
  sentence: await page.evaluate(() =>
    [...document.querySelectorAll('[data-control="panel.assist.sentence"]')].map((el) =>
      el.textContent?.trim(),
    ),
  ),
  cards: await page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="panel.assist.card."]')]
      .filter((el) => /^panel\.assist\.card\.[^.]+$/.test(el.getAttribute('data-control') ?? ''))
      .map((el) => el.textContent?.trim().slice(0, 200)),
  ),
  prompt: await valueOf('panel.assist.prompt'),
  promptDisabled: await attr('[data-control="panel.assist.prompt"]', 'disabled'),
  sendDisabled: await attr('[data-control="panel.assist.send"]', 'disabled'),
});

/** The snackbar sequence over `ms`: every distinct text with the time it first read. */
const snackbarLog = async (ms) => {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await snackbar();
    if (s && !seen.some((x) => x.text === s.text)) seen.push({ ...s, at: Date.now() - t0 });
    await sleep(120);
  }
  return seen;
};
const runMarkup = async (slideId) => {
  const s = await slideJson(slideId);
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(s.blocks ?? s);
  return texts.filter((t) => /example\.(com|org)|renewal|contract|Acme|Globex/.test(t));
};
const stageTexts = () => page.evaluate(() => [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) => el.textContent?.trim().slice(0, 80)));

try {
  await step('open /new and type the title', 'the editor is ready, revision 1, /edit/<id>', async () => {
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    const info = await invoke('deck.info');
    deckId = info.id;
    titleSlide = (await state()).slideId;
    if (await has('[data-control="dialog.namePrompt"]')) await clickControl('dialog.namePrompt.close').catch(() => undefined);
    const list = await runs();
    const head = list.find((x) => /heading/.test(x.run)) ?? list[0];
    await openRun(head.run);
    await typeHuman(TITLE);
    await press('Escape');
    const rev = await waitRevision(1, 30_000);
    await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
    await settled();
    return { ok: rev >= 1, observed: `deck ${deckId}, revision ${rev}` };
  });
  await step('second and third slides', 'slide 2 with the paragraph; slide 3 Pricing for Acme', async () => {
    await clickControl('toolbar.newSlide');
    await pollUntil(state, (s) => s.slideId !== titleSlide, 10_000);
    await sleep(600);
    slideTwo = (await state()).slideId;
    let list = await runs();
    let head = list.find((x) => /heading/.test(x.run)) ?? null;
    const body = list.find((x) => x !== head) ?? null;
    if (head) {
      await openRun(head.run);
      await typeHuman('What Acme gets');
      await press('Escape');
      await sleep(300);
    }
    await openRun(body.run);
    await typeHuman(LONG);
    await press('Escape');
    await settled();
    await clickControl('toolbar.newSlide');
    await pollUntil(state, (s) => s.slideId !== slideTwo, 10_000);
    await sleep(600);
    slideThree = (await state()).slideId;
    list = await runs();
    head = list.find((x) => /heading/.test(x.run)) ?? list[0];
    await openRun(head.run);
    await typeHuman('Pricing for Acme, internal');
    await press('Escape');
    await settled();
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await sleep(400);
    const f = await deckFacts();
    return { ok: f.acme >= 3, observed: `slides ${slideTwo}, ${slideThree}; Acme ${f.acme}` };
  });

  // ---- 1. the outside write's snackbar: timing and words
  await step('POST text.replaceAll with the bearer: the snackbar sequence over 12 s', 'one snackbar naming the change with Undo within 10 s', async () => {
    const s = await settled();
    const http = await httpAction('text.replaceAll', { find: 'renewal', replace: 'contract', baseRevision: s.revision }, { author: `agent:polish-audit-${STAMP}` });
    if (http.noBearer) return { ok: null, observed: 'not driven: no bearer' };
    const t0 = Date.now();
    const seq = await snackbarLog(12_000);
    const first = seq[0];
    await shot('90-outside-write-after-12s');
    const written = JSON.stringify(await slideJson(slideTwo)).includes('contract');
    return { ok: http.status < 300 && first !== undefined && /undo/i.test(first.action ?? ''), observed: `HTTP ${http.status} in ${http.ms} ms; snackbars ${JSON.stringify(seq)}; written ${written}; ${Date.now() - t0} ms watched` };
  });
  await step('the outside write: Undo from the snackbar', 'Undo reverts the agent write', async () => {
    const s = await settled();
    const http = await httpAction('text.replaceAll', { find: 'contract', replace: 'renewal', baseRevision: s.revision }, { author: `agent:polish-audit-${STAMP}` });
    const snack = await pollUntil(snackbar, (x) => x !== null && /undo/i.test(x.action ?? ''), 12_000);
    const at = Date.now();
    await shot('91-outside-write-snackbar');
    if (!snack) return { ok: false, observed: `HTTP ${http.status}; no snackbar with Undo in 12 s` };
    await clickControl('snackbar.action');
    const reverted = await pollUntil(async () => JSON.stringify(await slideJson(slideTwo)), (j) => j.includes('contract') && !j.includes('renewal'), 15_000);
    await shot('92-outside-write-undone');
    return { ok: reverted.includes('contract'), observed: `snackbar "${snack.text}" action "${snack.action}"; after Undo the text holds contract again ${reverted.includes('contract')} (the agent's renewal reverted)` };
  });
  await step('POST deck.tailor with the bearer: the snackbar', 'the snackbar names the tailor with Undo', async () => {
    const s = await settled();
    await invoke('text.replaceAll', { find: 'contract', replace: 'renewal', baseRevision: s.revision }).catch(() => undefined);
    await settled();
    const s2 = await settled();
    const before = await deckFacts();
    const http = await httpAction('deck.tailor', { replacements: [{ from: 'Acme', to: 'Globex' }], skip: [slideThree], baseRevision: s2.revision }, { author: `agent:polish-audit-${STAMP}` });
    const seq = await snackbarLog(10_000);
    await shot('93-agent-tailor-snackbar');
    const after = await deckFacts();
    const s3 = await settled();
    await invoke('deck.tailor', { replacements: [{ from: 'Globex', to: 'Acme' }], baseRevision: s3.revision }).catch(() => undefined);
    const s4 = await settled();
    await invoke('slide.skip', { slideIds: [slideThree], skip: false, baseRevision: s4.revision }).catch(() => undefined);
    await settled();
    const restored = await deckFacts();
    return { ok: http.status < 300 && after.acme === 0 && seq.length > 0 && /undo/i.test(seq[0]?.action ?? ''), observed: `HTTP ${http.status} in ${http.ms} ms; snackbars ${JSON.stringify(seq)}; Acme ${before.acme} -> ${after.acme} -> ${restored.acme}; skipped ${JSON.stringify(after.skipped)} -> ${JSON.stringify(restored.skipped)}; title "${after.title}" -> "${restored.title}"` };
  });

  // ---- 2. Tailor: the dialog's state after Apply, sampled
  await step('Tools > Tailor: Apply, the dialog sampled every 300 ms until it closes', 'the dialog closes at once, or shows its busy state without a false count', async () => {
    await clearAll();
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await menuPath('tools', 'tools.tailor');
    await ctl('dialog.tailor').waitFor({ timeout: 8000 });
    await hoverControl('dialog.tailor.apply');
    const tipDisabled = await page.evaluate(() => document.querySelector('#pt-tip, .pt-tip')?.textContent?.trim() ?? null);
    await clickControl('dialog.tailor.from');
    await typeHuman('Acme');
    await clickControl('dialog.tailor.to');
    await typeHuman('Globex');
    await clickControl(`dialog.tailor.skip.${slideThree}`);
    await sleep(300);
    const before = await deckFacts();
    const t0 = Date.now();
    await clickControl('dialog.tailor.apply');
    const samples = [];
    let n = 0;
    while (Date.now() - t0 < 15_000) {
      const open = await visible('dialog.tailor');
      if (!open) break;
      const hints = await page.evaluate(() => [...document.querySelectorAll('[data-control="dialog.tailor"] .ts-dialog-hint')].filter((el) => el.getClientRects().length > 0).map((el) => el.textContent?.trim()));
      const label = await textOf('dialog.tailor.apply');
      samples.push({ at: Date.now() - t0, hints, label });
      if (n < 3) await shot(`94-tailor-apply-sample-${n}`);
      n += 1;
      await sleep(300);
    }
    const closedAt = Date.now() - t0;
    const seq = await snackbarLog(4000);
    await shot('95-tailor-after-apply');
    const after = await deckFacts();
    await clearAll();
    await press('Meta+z');
    const restored = await pollUntil(deckFacts, (f) => f.acme === before.acme && !f.skipped.includes(slideThree), 15_000);
    await settled();
    return { ok: samples.every((s) => !s.hints.some((h) => /Not found/.test(h))), observed: `disabled Apply tooltip "${tipDisabled}"; dialog open for ${closedAt} ms after Apply; samples ${JSON.stringify(samples.slice(0, 6))}; snackbars ${JSON.stringify(seq)}; Acme ${before.acme} -> ${after.acme} -> ${restored.acme}; title "${after.title}" -> "${restored.title}"` };
  });

  // ---- 3. the Ask row, then Enter in the box
  await step('Search the menus with a phrase that matches nothing; Enter; click the box; Enter', 'the panel with the phrase; the ask sends; the deployment sentence comes back', async () => {
    const phrase = 'zebra stripes on the cover';
    const r = await finderRows(phrase);
    await press('Enter');
    const open = await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(500);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? document.activeElement?.tagName ?? null);
    const tip = await page.evaluate(() => { const t = document.querySelector('#pt-tip, .pt-tip'); return t && t.getClientRects().length > 0 ? t.textContent?.trim() : null; });
    await shot('96-ask-row-panel-focus');
    await clickControl('panel.assist.prompt');
    await press('Enter');
    const t0 = Date.now();
    const ps = await pollUntil(panelState, (p) => p.off !== null || p.error !== null || p.sentence.length > 0 || p.cards.length > 0, 25_000);
    const ms = Date.now() - t0;
    await shot('97-ask-row-answer');
    await closePanel();
    return { ok: open && ps.off !== null ? null : false, observed: `ask row ${r.rows.some((x) => /assist\.ask/.test(x.id))}; panel open ${open}; focus after Enter on ${focused}; tooltip on screen "${tip}"; after Enter in the box: ${ms} ms, off "${ps.off}", sentence ${JSON.stringify(ps.sentence)}, error "${ps.error}"` };
  });
  await step('Search the menus, Escape: what stays on screen', 'no tooltip stays after the palette closes', async () => {
    await clearAll();
    await clickControl('toolbar.search');
    await ctl('palette.query').waitFor({ timeout: 8000 });
    await typeHuman('hide');
    await sleep(400);
    await press('Escape');
    await sleep(800);
    const tip = await page.evaluate(() => { const t = document.querySelector('#pt-tip, .pt-tip'); return t && t.getClientRects().length > 0 ? t.textContent?.trim() : null; });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? null);
    await shot('98-after-palette-escape');
    await page.mouse.move(700, 600);
    await sleep(500);
    const tipAfterMove = await page.evaluate(() => { const t = document.querySelector('#pt-tip, .pt-tip'); return t && t.getClientRects().length > 0 ? t.textContent?.trim() : null; });
    return { ok: tip === null, observed: `tooltip after Escape "${tip}" (focus on ${focused}); after the pointer moves "${tipAfterMove}"` };
  });

  // ---- 4. Link detection, key by key
  await step('Tools > Preferences > Link detection off; type an address in the body', 'no link is made while the setting is off; the paragraph stays', async () => {
    await clearAll();
    await menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
    await sleep(400);
    const setting = (await state()).settings?.linkDetection;
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await sleep(300);
    const list = await runs();
    const body = list.find((x) => /finance team/.test(x.text)) ?? list.find((x) => !/heading/.test(x.run));
    const before = await stageTexts();
    await dblclickAt(body.rect.x + 60, body.rect.y + body.rect.h / 2);
    await sleep(300);
    await shot('99-link-off-after-dblclick');
    const sel1 = await page.evaluate(() => window.getSelection()?.toString().slice(0, 40) ?? '');
    await press('End');
    await sleep(200);
    const sel2 = await page.evaluate(() => window.getSelection()?.toString().slice(0, 40) ?? '');
    await press('Enter');
    await sleep(200);
    await shot('100-link-off-after-enter');
    const afterEnter = await stageTexts();
    await typeHuman('See www.example.com for the terms ');
    await shot('101-link-off-typed');
    await press('Escape');
    await settled();
    const markup = await runMarkup(slideTwo);
    const stage = await stageTexts();
    const link = markup.some((t) => /\[www\.example\.com\]\(|\]\(https?:\/\/www\.example\.com/.test(t));
    const kept = stage.some((t) => /finance team/.test(t));
    return { ok: setting === false && !link && kept, observed: `setting ${setting}; selection after the double click "${sel1}", after End "${sel2}"; stage before ${JSON.stringify(before)}; after Enter ${JSON.stringify(afterEnter)}; after typing ${JSON.stringify(stage)}; markup ${JSON.stringify(markup).slice(0, 400)}; link made ${link}; paragraph kept ${kept}` };
  });
  await step('Link detection on; type another address', 'the address becomes a link', async () => {
    await menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
    await sleep(400);
    const setting = (await state()).settings?.linkDetection;
    const list = await runs();
    const body = list.find((x) => /example\.com/.test(x.text)) ?? list.find((x) => !/heading/.test(x.run));
    await dblclickAt(body.rect.x + 60, body.rect.y + body.rect.h / 2);
    await press('End');
    await press('Enter');
    await typeHuman('Then www.example.org for the prices ');
    await press('Escape');
    await settled();
    const markup = await runMarkup(slideTwo);
    await shot('102-link-on-typed');
    const link = markup.some((t) => /\[www\.example\.org\]\(|\]\(https?:\/\/www\.example\.org/.test(t));
    return { ok: setting === true && link, observed: `setting ${setting}; markup ${JSON.stringify(markup).slice(0, 400)}; link made ${link}` };
  });

  // ---- 5. the viewer
  await step('a view link: the assistant for a viewer', 'the panel disabled with the sentence', async () => {
    const rec = await invoke('share.get', { id: deckId }).catch(() => null);
    const recRev = rec?.record?.revision ?? rec?.revision ?? 0;
    const link = await invoke('share.createLink', { id: deckId, role: 'viewer', label: 'polish audit', baseRevision: recRev }).catch((e) => ({ error: String(e).slice(0, 200) }));
    linkId = link?.link?.id ?? null;
    viewUrl = link?.url ?? null;
    if (!viewUrl) return { ok: null, observed: `no view link (record revision ${recRev}): ${JSON.stringify(link).slice(0, 200)}` };
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const visitor = await other.newPage();
    try {
      await visitor.goto(viewUrl, { waitUntil: 'domcontentloaded' });
      await visitor.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 30_000 }).catch(() => undefined);
      await visitor.waitForSelector('.pt-viewer', { timeout: 30_000 });
      await sleep(2000);
      if (await has('[data-control="dialog.namePrompt"]', visitor)) await clickControl('dialog.namePrompt.close', visitor).catch(() => undefined);
      await shot('103-viewer-editor', visitor);
      const entry = await visible('title.assist', visitor);
      const menubar = await visitor.evaluate(() => [...document.querySelectorAll('[data-control^="menubar."]')].map((el) => el.textContent?.trim()));
      let sentence = null;
      if (entry) {
        await clickControl('title.assist', visitor);
        await sleep(600);
        sentence = await visitor.locator('[data-control="panel.assist.viewer"], [data-control="panel.assist"]').first().textContent({ timeout: 6000 }).catch(() => null);
      } else {
        await visitor.keyboard.press('Meta+j');
        await sleep(800);
        sentence = await visitor.locator('[data-control="panel.assist.viewer"], [data-control="panel.assist"]').first().textContent({ timeout: 3000 }).catch(() => null);
      }
      await shot('104-viewer-assist', visitor);
      return { ok: /Commenters and editors/.test(sentence ?? '') ? true : null, observed: `address ${visitor.url().replace(BASE, '')}; Assist entry drawn ${entry}; menubar ${JSON.stringify(menubar)}; panel words "${(sentence ?? 'none').trim().slice(0, 160)}"` };
    } finally {
      await other.close().catch(() => undefined);
    }
  });

  // ---- 6. Save as template on production, measured; rename and delete from the card
  await step('File > Save as template on production, measured', 'the dialog closes with a snackbar; the gallery lists the card', async () => {
    await clearAll();
    await setAdvanced(true);
    await menuPath('file', 'file.saveAsTemplate');
    await ctl('dialog.saveAsTemplate').waitFor({ timeout: 8000 });
    const t0 = Date.now();
    const enabledAt = await pollUntil(() => attr('[data-control="dialog.saveAsTemplate.save"]', 'disabled'), (d) => d === null, 10_000).then(() => Date.now() - t0);
    await clickControl('dialog.saveAsTemplate.name');
    await press('Meta+a');
    await typeHuman(`Polish audit ${STAMP}`);
    const t1 = Date.now();
    await clickControl('dialog.saveAsTemplate.save');
    const samples = [];
    while (Date.now() - t1 < 40_000) {
      const open = await visible('dialog.saveAsTemplate');
      const label = await textOf('dialog.saveAsTemplate.save');
      const disabled = await attr('[data-control="dialog.saveAsTemplate.save"]', 'disabled');
      const err = await textOf('dialog.saveAsTemplate.error');
      samples.push({ at: Date.now() - t1, open, label, disabled: disabled !== null, err });
      if (!open) break;
      await sleep(500);
    }
    const seq = await snackbarLog(3000);
    await shot('105-save-template-result');
    const list = await invoke('template.list').catch(() => null);
    const mine = (list?.templates ?? []).find((t) => /polish-audit/.test(t.id));
    templateId = mine?.id ?? `polish-audit-${STAMP.toLowerCase()}`;
    return { ok: samples[samples.length - 1]?.open === false && seq.length > 0, observed: `Save enabled after ${enabledAt} ms; after the click: ${JSON.stringify(samples.filter((s, i) => i % 4 === 0 || !s.open).slice(0, 8))}; snackbars ${JSON.stringify(seq)}; template.list lists ${mine ? mine.id : 'no polish audit template'} right after` };
  });
  await step('the gallery: the card, Rename, Delete, each measured', 'the card within seconds; the rename and the delete take effect', async () => {
    await page.goto(`${BASE}/decks/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    let t0 = Date.now();
    let card = false;
    for (let i = 0; i < 6 && !card; i += 1) {
      await sleep(1200);
      card = await visible(`templates.card.${templateId}`);
      if (!card) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
      }
    }
    const cardAfter = Date.now() - t0;
    await shot('106-gallery-with-template');
    if (!card) return { ok: false, observed: `no card for ${templateId} after ${cardAfter} ms and reloads` };
    const r = await rectOf(`[data-control="templates.card.${templateId}"]`);
    if (r) await shot('106b-gallery-card-crop', page, { clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 } });
    await clickControl(`templates.card.${templateId}.menu`);
    await sleep(500);
    await shot('107-template-card-menu');
    await clickControl(`menu.templates.card.${templateId}.rename`);
    await sleep(400);
    await shot('108-template-rename-field');
    const field = await visible(`templates.card.${templateId}.rename.field`);
    await press('Meta+a');
    await typeHuman('Polish audit renamed');
    t0 = Date.now();
    await press('Enter');
    const renamed = await pollUntil(() => textOf(`templates.card.${templateId}.name`), (n) => /renamed/.test(n ?? ''), 20_000);
    const renameMs = Date.now() - t0;
    await shot('109-template-renamed');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1200);
    const renamedAfterReload = await textOf(`templates.card.${templateId}.name`);
    await clickControl(`templates.card.${templateId}.menu`);
    await sleep(400);
    await clickControl(`menu.templates.card.${templateId}.delete`);
    await ctl('templates.delete').waitFor({ timeout: 8000 });
    await sleep(400);
    await shot('110-template-delete-confirm');
    t0 = Date.now();
    await clickControl('templates.delete.ok');
    let gone = false;
    let dialogErr = null;
    for (let i = 0; i < 40 && !gone; i += 1) {
      await sleep(500);
      gone = !(await visible(`templates.card.${templateId}`));
      dialogErr = await page.evaluate(() => document.querySelector('[data-control="templates.delete"] [role="alert"], [data-control="templates.delete"] .ts-dialog-error')?.textContent?.trim() ?? null);
    }
    const deleteMs = Date.now() - t0;
    await shot('111-gallery-after-delete');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1500);
    const stillListed = await visible(`templates.card.${templateId}`);
    const snack = await page.evaluate(() => document.querySelector('[data-control="snackbar"]')?.textContent?.trim() ?? null);
    if (gone && !stillListed) templateId = null;
    return { ok: card && /renamed/.test(renamed ?? '') && gone && !stillListed, observed: `card drawn after ${cardAfter} ms; rename field ${field}; name after Enter "${renamed}" in ${renameMs} ms, after a reload "${renamedAfterReload}"; delete: card gone ${gone} after ${deleteMs} ms (dialog error "${dialogErr}"), still listed after a reload ${stillListed}; snackbar "${snack}"` };
  });
} catch (error) {
  record('the drive ran to completion', 'no exception outside a step', error instanceof Error ? (error.stack ?? error.message) : String(error), false);
} finally {
  try {
    if (templateId && TOKEN) {
      const del = await httpAction('template.delete', { id: templateId, confirm: true }, { deck: 'gt-brand' }).catch((e) => ({ status: 0, body: String(e) }));
      record('template.delete over HTTP with the bearer (the safety net)', 'removed', `${del.status} ${JSON.stringify(del.body).slice(0, 120)}`, del.status < 300);
    }
    if (deckId) {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady();
      await settled();
      if (linkId) {
        const rec = await invoke('share.get', { id: deckId }).catch(() => null);
        await invoke('share.revokeLink', { id: deckId, linkId, baseRevision: rec?.record?.revision ?? 0 }).catch(() => undefined);
      }
      await setAdvanced(false).catch(() => undefined);
      await openMenu('file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickRow('file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('File > Move to trash', '/decks', page.url().replace(BASE, ''), true);
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      await sleep(500);
      await clickControl(`trash.delete.${deckId}`);
      await sleep(500);
      await shot('112-delete-forever-confirm');
      await clickControl('trash.confirm.ok');
      await pollUntil(() => visible(`trash.card.${deckId}`), (x) => !x, 15_000);
      await sleep(1500);
      const res = await page.request.get(`${BASE}/edit/${deckId}`);
      const res2 = await page.request.get(`${BASE}/deck/${deckId}`);
      record('Delete forever, then GET /edit/<id> and /deck/<id>', '404 and 404', `${res.status()} and ${res2.status()}`, res.status() === 404 && res2.status() === 404);
    }
  } catch (error) {
    record('cleanup', 'the deck trashed and deleted forever', `error: ${error instanceof Error ? error.message : String(error)}`, false);
  }
  await browser.close();
  writeFileSync(path.join(OUT, 'rows-2.json'), JSON.stringify({ base: BASE, deck: deckId, startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), rows, facts, consoleErrors: [...new Set(consoleErrors)] }, null, 2));
  console.log(`\n${rows.length} rows: ${rows.filter((r) => r.ok === true).length} ok, ${rows.filter((r) => r.ok === false).length} failed, ${rows.filter((r) => r.ok === null).length} not driven; ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

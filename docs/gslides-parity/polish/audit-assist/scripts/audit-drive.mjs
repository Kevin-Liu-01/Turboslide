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
    if (!el || el.getClientRects().length === 0) return null;
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

try {
  // ---- A. the scratch deck
  await step('open /new and type the title', 'the editor is ready, revision 1, /edit/<id>', async () => {
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    const info = await invoke('deck.info');
    deckId = info.id;
    const s = await state();
    titleSlide = s.slideId;
    if (await has('[data-control="dialog.namePrompt"]'))
      await clickControl('dialog.namePrompt.close').catch(() => undefined);
    const list = await runs();
    const head = list.find((x) => /heading/.test(x.run)) ?? list[0];
    if (!head) return { ok: false, observed: 'no run on the stage' };
    await openRun(head.run);
    await typeHuman(TITLE);
    await sleep(300);
    await press('Escape');
    const rev = await waitRevision(1, 30_000);
    await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
    await settled();
    return {
      ok: rev >= 1 && /\/edit\//.test(page.url()),
      observed: `deck ${deckId}, revision ${rev}, ${page.url().replace(BASE, '')}`,
    };
  });

  await step('second slide with a title and a long body naming Acme', 'slide 2 holds the paragraph', async () => {
    await clickControl('toolbar.newSlide');
    await pollUntil(state, (s) => s.slideId !== titleSlide, 10_000);
    await sleep(600);
    slideTwo = (await state()).slideId;
    const list = await runs();
    const head = list.find((x) => /heading/.test(x.run)) ?? null;
    const body = list.find((x) => x !== head) ?? null;
    if (head) {
      await openRun(head.run);
      await typeHuman('What Acme gets');
      await press('Escape');
      await sleep(300);
    }
    if (!body) return { ok: false, observed: `runs ${list.map((x) => x.run).join(', ')}; no body run` };
    await openRun(body.run);
    await typeHuman(LONG);
    await sleep(300);
    await press('Escape');
    await settled();
    const json = JSON.stringify(await slideJson(slideTwo));
    return { ok: json.includes('finance team at Acme'), observed: `slide ${slideTwo}; paragraph stored ${json.includes('finance team at Acme')}` };
  });

  await step('third slide: Pricing for Acme, internal', 'slide 3 holds the title', async () => {
    await clickControl('toolbar.newSlide');
    await pollUntil(state, (s) => s.slideId !== slideTwo, 10_000);
    await sleep(600);
    slideThree = (await state()).slideId;
    const list = await runs();
    const head = list.find((x) => /heading/.test(x.run)) ?? list[0];
    await openRun(head.run);
    await typeHuman('Pricing for Acme, internal');
    await press('Escape');
    await settled();
    const json = JSON.stringify(await slideJson(slideThree));
    await clickControl(`filmstrip.slide.${slideTwo}`).catch(() => undefined);
    await sleep(400);
    return { ok: json.includes('Pricing for Acme'), observed: `slide ${slideThree}; stored ${json.includes('Pricing for Acme')}` };
  });

  // ---- B. the Assist entry and the panel
  await step('read the title row at 1440', 'Assist between the presence chips and the comments glyph', async () => {
    await clearAll();
    const title = await controlsUnder('title.');
    const share = await controlsUnder('share.open');
    facts.titleRow = [...title, ...share];
    await shot('01-title-row-1440');
    const r = await rectOf('[data-control="title.row"]');
    await shot('01b-title-row-right-1440', page, { clip: { x: r.x + r.width - 720, y: r.y, width: 720, height: r.height + 4 } });
    const x = (id) => title.find((c) => c.id === id)?.x ?? null;
    const order = { presence: x('title.presence'), assist: x('title.assist'), comments: x('title.comments'), sidePanel: x('title.sidePanel'), present: x('title.present') };
    const assist = title.find((c) => c.id === 'title.assist');
    return {
      ok: assist !== undefined && order.presence !== null && order.presence < order.assist && order.assist < order.comments,
      observed: `controls ${title.map((c) => `${c.id.replace('title.', '')}@${c.x}(${c.w}x${c.h})`).join(' ')}; assist label "${assist?.label ?? 'none'}"`,
    };
  });

  await step('Cmd+J opens the panel', 'the panel with the first line, the slide label and three starters', async () => {
    await clearAll();
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await sleep(300);
    await press('Meta+j');
    const open = await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(400);
    const ps = await panelState();
    facts.panel = ps;
    const panelRect = await rectOf('[data-control="panel.assist"]');
    const noteRect = await rectOf('[data-control="panel.assist.firstLine"]');
    await shot('02-panel-cmd-j');
    if (panelRect) await shot('02b-panel-crop', page, { clip: { x: panelRect.x - 2, y: panelRect.y - 2, width: panelRect.width + 4, height: Math.min(panelRect.height + 4, 900 - panelRect.y) } });
    return {
      ok: open && ps.starters.length === 3,
      observed: `open ${open}; panel ${panelRect ? `${Math.round(panelRect.width)}x${Math.round(panelRect.height)}` : 'none'}; first line ${noteRect ? Math.round(noteRect.height) : 0} px tall: "${ps.firstLine}"; slide "${ps.slide}"; starters ${ps.starters.map((s) => `"${s.label}"`).join(', ')}; prompt placeholder "${await attr('[data-control="panel.assist.prompt"]', 'placeholder')}"; send disabled ${ps.sendDisabled !== null}`,
    };
  });

  await step('hover a starter and the Send button for their tooltips', 'a tooltip with the name, a sentence and the key', async () => {
    await hoverControl('panel.assist.starter.shorter');
    const tip1 = await page.evaluate(() => document.querySelector('#pt-tip, .pt-tip, [role="tooltip"]')?.textContent?.trim() ?? null);
    await shot('03-starter-tooltip');
    await hoverControl('panel.assist.send');
    const tip2 = await page.evaluate(() => document.querySelector('#pt-tip, .pt-tip, [role="tooltip"]')?.textContent?.trim() ?? null);
    return { ok: tip1 !== null, observed: `starter tooltip "${tip1}"; send tooltip "${tip2}"` };
  });

  await step('Make it shorter on production', 'a card within 20 s, or the sentence the deployment gives', async () => {
    const t0 = Date.now();
    await clickControl('panel.assist.starter.shorter');
    const busyAt = await pollUntil(() => visible('panel.assist.busy'), (x) => x, 3000).catch(() => false);
    await shot('04-shorter-asking');
    const ps = await pollUntil(panelState, (p) => p.off !== null || p.error !== null || p.sentence.length > 0 || p.cards.length > 0, 25_000);
    const ms = Date.now() - t0;
    await sleep(300);
    await shot('05-shorter-answer');
    facts.shorter = { ...ps, ms };
    return {
      ok: ps.cards.length > 0 ? true : null,
      observed: `${ms} ms; busy shown ${busyAt}; off "${ps.off}"; error "${ps.error}"; sentence ${JSON.stringify(ps.sentence)}; cards ${ps.cards.length}; starters left ${ps.starters.length}; prompt present ${ps.prompt !== null}`,
    };
  });

  await step('the panel after the answer: can the seller still ask', 'the starters and the composer remain', async () => {
    const ps = await panelState();
    const still = ps.starters.length === 3 && ps.prompt !== null;
    if (!still) {
      await closePanel();
      await press('Meta+j');
      await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
      await sleep(300);
    }
    const after = await panelState();
    await shot('06-panel-reopened');
    return {
      ok: still,
      observed: `starters ${ps.starters.length}, composer ${ps.prompt !== null}, off "${ps.off}"; after close and reopen: starters ${after.starters.length}, composer ${after.prompt !== null}, off "${after.off}"`,
    };
  });

  await step('type "add a video" and Enter', 'the fallback sentence, no card, no write', async () => {
    const rev = (await state()).revision;
    const box = ctl('panel.assist.prompt').first();
    if (!(await box.isVisible().catch(() => false))) return { ok: null, observed: 'no composer on the panel' };
    await clickControl('panel.assist.prompt');
    await typeHuman('add a video');
    await shot('07-free-ask-typed');
    await press('Enter');
    const ps = await pollUntil(panelState, (p) => p.off !== null || p.error !== null || p.sentence.length > 0 || p.cards.length > 0, 25_000);
    await sleep(300);
    await shot('08-free-ask-answer');
    const rev2 = (await state()).revision;
    return {
      ok: ps.cards.length === 0 && rev2 === rev ? (ps.sentence.length > 0 ? true : null) : false,
      observed: `off "${ps.off}"; error "${ps.error}"; sentence ${JSON.stringify(ps.sentence)}; cards ${ps.cards.length}; revision ${rev} -> ${rev2}; ask rows ${await page.locator('[data-control="panel.assist.ask"]').count()}`,
    };
  });

  await step('Write speaker notes', 'a card or the sentence', async () => {
    let ps = await panelState();
    if (ps.starters.length === 0 || ps.off !== null) {
      await closePanel();
      await press('Meta+j');
      await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
      await sleep(300);
    }
    if (!(await visible('panel.assist.starter.notes'))) return { ok: null, observed: 'no notes starter drawn' };
    await clickControl('panel.assist.starter.notes');
    ps = await pollUntil(panelState, (p) => p.off !== null || p.error !== null || p.sentence.length > 0 || p.cards.length > 0, 25_000);
    await shot('09-notes-answer');
    return { ok: ps.cards.length > 0 ? true : null, observed: `off "${ps.off}"; error "${ps.error}"; sentence ${JSON.stringify(ps.sentence)}; cards ${ps.cards.length}` };
  });

  await step('the Tailor starter opens the dialog', 'Tools > Tailor for a customer as a dialog, the From field focused', async () => {
    await closePanel();
    await press('Meta+j');
    await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(300);
    if (!(await visible('panel.assist.starter.tailor'))) return { ok: null, observed: 'no tailor starter drawn' };
    await clickControl('panel.assist.starter.tailor');
    const open = await pollUntil(() => visible('dialog.tailor'), (x) => x, 6000);
    await sleep(400);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? null);
    const panelStill = await visible('panel.assist');
    await shot('10-tailor-from-starter');
    await press('Escape');
    await sleep(300);
    await closePanel();
    return { ok: open, observed: `dialog open ${open}; focused ${focused}; panel still open behind ${panelStill}` };
  });

  await step('Tools menu read', 'Tailor, Assist and Check slides beside each other', async () => {
    await clearAll();
    await openMenu('tools');
    const list = await menuRows('tools');
    facts.toolsMenu = list;
    await shot('11-tools-menu');
    await closeMenus();
    return { ok: list.some((r) => r.id === 'tools.tailor') && list.some((r) => r.id === 'tools.assist'), observed: list.map((r) => `${r.id}${r.disabled ? '(disabled)' : ''}${r.checked ? `[${r.checked}]` : ''}:"${r.label}"`).join('; ') };
  });

  await step('Tools > Assist opens the panel', 'the panel opens', async () => {
    await menuPath('tools', 'tools.assist');
    const open = await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    const pressed = await attr('[data-control="title.assist"]', 'aria-pressed');
    await closePanel();
    return { ok: open, observed: `open ${open}; title button aria-pressed ${pressed}` };
  });

  // ---- C. Tailor
  await step('Tools > Tailor: the empty dialog', 'the lead, Replace, With, Logo, Slides to skip, Apply disabled', async () => {
    await clearAll();
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await menuPath('tools', 'tools.tailor');
    await ctl('dialog.tailor').waitFor({ timeout: 8000 });
    await sleep(400);
    const dialog = await rectOf('[data-control="dialog.tailor"]');
    const words = await textOf('dialog.tailor');
    const applyDisabled = await attr('[data-control="dialog.tailor.apply"]', 'disabled');
    const everyDisabled = await attr('[data-control="dialog.tailor.logo.everySlide"]', 'disabled');
    const skipRows = await controlsUnder('dialog.tailor.skip.');
    await shot('12-tailor-empty');
    await hoverControl('dialog.tailor.apply');
    const tip = await page.evaluate(() => document.querySelector('#pt-tip, .pt-tip, [role="tooltip"]')?.textContent?.trim() ?? null);
    await shot('13-tailor-apply-tooltip');
    facts.tailorEmpty = { words, applyDisabled, everyDisabled, skipRows: skipRows.map((r) => r.label) };
    return {
      ok: applyDisabled !== null,
      observed: `dialog ${dialog ? `${Math.round(dialog.width)}x${Math.round(dialog.height)}` : 'none'}; Apply disabled ${applyDisabled !== null} tooltip "${tip}"; Use this logo on every slide disabled ${everyDisabled !== null}; skip rows ${skipRows.map((r) => `"${r.label}"`).join(', ')}; words "${(words ?? '').slice(0, 400)}"`,
    };
  });

  await step('type Acme in Replace', 'the count reads 4 places on 3 slides, once', async () => {
    await clickControl('dialog.tailor.from');
    await typeHuman('Acme');
    await sleep(400);
    const count = await textOf('dialog.tailor.count');
    const hints = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control="dialog.tailor"] .ts-dialog-hint')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.textContent?.trim() ?? ''),
    );
    const before = await deckFacts();
    facts.tailorBefore = before;
    await shot('14-tailor-count');
    const dup = hints.filter((h) => /places? on/.test(h)).length;
    return {
      ok: dup === 1 && /places? on/.test(count ?? ''),
      observed: `count control "${count}"; hints ${JSON.stringify(hints)} (the count drawn ${dup} times); deck: Acme ${before.acme} on the slides' text, title "${before.title}"`,
    };
  });

  await step('type Globex in With, tick the pricing slide, Apply', 'one write, the snackbar with Undo, every Acme reads Globex, the slide skipped', async () => {
    await clickControl('dialog.tailor.to');
    await typeHuman('Globex');
    await sleep(600);
    const found = await visible('dialog.tailor.logo.found');
    const skipBox = `dialog.tailor.skip.${slideThree}`;
    if (await visible(skipBox)) await clickControl(skipBox);
    await sleep(200);
    await shot('15-tailor-filled');
    const revBefore = (await state()).revision;
    await clickControl('dialog.tailor.apply');
    const snack = await snackbarWithin(8000);
    await shot('16-tailor-applied');
    const after = await pollUntil(deckFacts, (f) => f.acme === 0, 15_000);
    await settled();
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((el) => ({ id: el.getAttribute('data-control').replace('filmstrip.slide.', ''), skipped: el.hasAttribute('data-skip') })));
    const gone = await pollUntil(() => visible('dialog.tailor'), (x) => !x, 4000);
    facts.tailorAfter = after;
    return {
      ok: after.acme === 0 && after.globex === facts.tailorBefore.acme && after.skipped.includes(slideThree) && snack !== null && /undo/i.test(snack?.action ?? '') && after.revision === revBefore + 1,
      observed: `Find the logo slot ${found}; snackbar ${snack ? `"${snack.text}" action "${snack.action}"` : 'none'}; Acme ${facts.tailorBefore.acme} -> ${after.acme}; Globex -> ${after.globex}; skipped ${JSON.stringify(after.skipped)} (cards ${cards.filter((c) => c.skipped).map((c) => c.id).join(',') || 'none'}); revision ${revBefore} -> ${after.revision}; deck title "${after.title}"; dialog closed ${gone === false}`,
    };
  });

  await step('Cmd+Z after Tailor', 'one undo restores every Acme and unskips the slide', async () => {
    await clearAll();
    await press('Meta+z');
    const restored = await pollUntil(deckFacts, (f) => f.acme === facts.tailorBefore.acme && !f.skipped.includes(slideThree), 15_000);
    await settled();
    await sleep(500);
    await shot('17-tailor-undone');
    return { ok: restored.acme === facts.tailorBefore.acme && !restored.skipped.includes(slideThree), observed: `Acme ${restored.acme}; Globex ${restored.globex}; skipped ${JSON.stringify(restored.skipped)}; revision ${restored.revision}; title "${restored.title}"` };
  });

  await step('Tailor with To = Figma: the Find the logo slot', 'a Find the Figma logo button with the mark pair', async () => {
    await clearAll();
    await menuPath('tools', 'tools.tailor');
    await ctl('dialog.tailor').waitFor({ timeout: 8000 });
    await clickControl('dialog.tailor.from');
    await typeHuman('Acme');
    await clickControl('dialog.tailor.to');
    await typeHuman('Figma');
    const found = await pollUntil(() => visible('dialog.tailor.logo.found'), (x) => x, 6000).catch(() => false);
    await sleep(500);
    const label = await textOf('dialog.tailor.logo.find');
    await shot('18-tailor-find-logo');
    await clickControl('dialog.tailor.logo.replaceAlt');
    await sleep(300);
    await shot('19-tailor-replace-alt-file');
    const fileInput = await visible('dialog.tailor.logo.file');
    await press('Escape');
    await sleep(300);
    return { ok: found, observed: `Find slot drawn ${found}; button "${label}"; the file chooser after the tick ${fileInput}` };
  });

  // ---- D. the agent surface from the editor: an outside write, deck.tailor and assist.propose over HTTP
  await step('POST text.replaceAll with the bearer while the editor is open', 'the snackbar names the change with Undo within 10 s; Undo reverts', async () => {
    await clearAll();
    await clickControl(`filmstrip.slide.${slideTwo}`);
    const s = await settled();
    const http = await httpAction('text.replaceAll', { find: 'renewal', replace: 'contract', baseRevision: s.revision }, { author: `agent:polish-audit-${STAMP}` });
    if (http.noBearer) return { ok: null, observed: 'not driven: no bearer in the environment' };
    const t0 = Date.now();
    const snack = await snackbarWithin(10_000);
    const landed = Date.now() - t0;
    await shot('20-outside-write-snackbar');
    const written = await pollUntil(async () => JSON.stringify(await slideJson(slideTwo)), (j) => j.includes('contract'), 15_000);
    let reverted = null;
    if (snack?.action && /undo/i.test(snack.action)) {
      await clickControl('snackbar.action');
      reverted = await pollUntil(async () => JSON.stringify(await slideJson(slideTwo)), (j) => j.includes('renewal') && !j.includes('contract'), 15_000).then((j) => j.includes('renewal'));
      await shot('21-outside-write-undone');
    } else {
      const s2 = await settled();
      await invoke('text.replaceAll', { find: 'contract', replace: 'renewal', baseRevision: s2.revision }).catch(() => undefined);
    }
    const chip = await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor [data-control^="chip."]')?.textContent?.trim() ?? null);
    return { ok: http.status < 300 && snack !== null && /undo/i.test(snack?.action ?? '') && reverted === true, observed: `HTTP ${http.status} in ${http.ms} ms; snackbar ${snack ? `"${snack.text}" action "${snack.action}"` : 'none'} after ${landed} ms; written ${written.includes('contract')}; reverted ${reverted}; chip "${chip}"` };
  });

  await step('POST deck.tailor with the bearer', 'one revision, the snackbar with Undo', async () => {
    const s = await settled();
    const before = await deckFacts();
    const http = await httpAction('deck.tailor', { replacements: [{ from: 'Acme', to: 'Globex' }], skip: [slideThree], baseRevision: s.revision }, { author: `agent:polish-audit-${STAMP}` });
    if (http.noBearer) return { ok: null, observed: 'not driven: no bearer' };
    const snack = await snackbarWithin(10_000);
    await shot('22-agent-tailor-snackbar');
    const after = await pollUntil(deckFacts, (f) => f.acme === 0, 15_000);
    let restored = null;
    if (snack?.action && /undo/i.test(snack.action) && (await visible('snackbar.action'))) {
      await clickControl('snackbar.action');
      restored = await pollUntil(deckFacts, (f) => f.acme === before.acme && !f.skipped.includes(slideThree), 15_000);
    } else {
      const s2 = await settled();
      await invoke('text.replaceAll', { find: 'Globex', replace: 'Acme', baseRevision: s2.revision }).catch(() => undefined);
      if (after.skipped.includes(slideThree)) {
        const s3 = await settled();
        await invoke('slide.skip', { slideIds: [slideThree], skip: false, baseRevision: s3.revision }).catch(() => undefined);
      }
      restored = await pollUntil(deckFacts, (f) => f.acme === before.acme, 15_000);
    }
    await settled();
    return { ok: http.status < 300 && after.acme === 0 && after.skipped.includes(slideThree) && snack !== null && /undo/i.test(snack?.action ?? ''), observed: `HTTP ${http.status} in ${http.ms} ms body ${JSON.stringify(http.body).slice(0, 160)}; snackbar ${snack ? `"${snack.text}" action "${snack.action}"` : 'none'}; Acme ${before.acme} -> ${after.acme} -> ${restored?.acme}; skipped after ${JSON.stringify(after.skipped)} -> ${JSON.stringify(restored?.skipped)}; revision ${s.revision} -> ${after.revision} -> ${restored?.revision}` };
  });

  await step('POST assist.propose with the bearer', 'a card, or the deployment sentence as one refusal shape', async () => {
    const s = await settled();
    const http = await httpAction('assist.propose', { intent: 'shorter', prompt: '', slideIds: [slideTwo], baseRevision: s.revision });
    if (http.noBearer) return { ok: null, observed: 'not driven: no bearer' };
    facts.assistHttp = http;
    return { ok: http.status < 300 ? true : null, observed: `HTTP ${http.status} in ${http.ms} ms; body ${JSON.stringify(http.body).slice(0, 300)}` };
  });

  // ---- E. Search the menus
  for (const [phrase, expect] of [
    ['hide slide', 'Skip slide first'],
    ['rename the customer', 'Find and replace and Tailor for a customer'],
    ['logo', 'Replace image among the rows'],
    ['speaker notes', 'the notes rows and the assistant'],
  ]) {
    await step(`Search the menus: "${phrase}"`, expect, async () => {
      const r = await finderRows(phrase);
      await shot(`23-finder-${phrase.replace(/\s+/g, '-')}`);
      await press('Escape');
      await sleep(300);
      return { ok: r.rows.length > 0, observed: `${r.rows.length} rows: ${r.rows.slice(0, 8).map((x) => `${x.id}:"${x.text}"`).join(' | ')}${r.empty ? `; empty "${r.empty}"` : ''}` };
    });
  }

  await step('Search the menus with a phrase that matches nothing, Enter', 'the Ask the assistant row; Enter opens the panel with the phrase in the box', async () => {
    const phrase = 'zebra stripes on the cover';
    const r = await finderRows(phrase);
    await shot('24-finder-ask-row');
    const ask = r.rows.find((x) => /finder\.assist\.ask$/.test(x.id)) ?? null;
    await press('Enter');
    const open = await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(400);
    const prompt = await valueOf('panel.assist.prompt');
    await shot('25-ask-row-panel');
    let answer = null;
    if (open && prompt) {
      await press('Enter');
      answer = await pollUntil(panelState, (p) => p.off !== null || p.error !== null || p.sentence.length > 0 || p.cards.length > 0, 25_000);
      await shot('26-ask-row-answer');
    }
    await closePanel();
    return { ok: ask !== null && open && (prompt ?? '').includes(phrase), observed: `rows ${r.rows.map((x) => `${x.id}:"${x.text}"`).join(' | ') || `none, empty "${r.empty}"`}; panel open ${open}; prompt "${prompt}"; after Enter: off "${answer?.off}", sentence ${JSON.stringify(answer?.sentence ?? null)}, error "${answer?.error}"` };
  });

  // ---- F. Advanced tools: the templates and the inbox
  await step('Tools > Advanced tools on', 'the title row draws the bell; the Tools menu grows', async () => {
    await clearAll();
    const on = await setAdvanced(true);
    await sleep(500);
    const bell = await visible('title.inbox');
    await shot('27-title-row-advanced');
    await openMenu('tools');
    const list = await menuRows('tools');
    await shot('28-tools-menu-advanced');
    await closeMenus();
    return { ok: on && bell, observed: `switch on ${on}; bell drawn ${bell}; Tools rows ${list.map((r) => r.id).join(', ')}` };
  });

  await step('File > New submenu with the switch on', 'Presentation and From template gallery', async () => {
    await openMenu('file');
    await hoverRow('file.new', '[data-control="menu.file.new.templateGallery"]');
    const list = await menuRows('file');
    await shot('29-file-new-submenu');
    const before = context.pages().length;
    await clickRow('file.new.templateGallery');
    await sleep(2500);
    const pagesAfter = context.pages();
    let where = page.url();
    let galleryPage = page;
    if (pagesAfter.length > before) {
      galleryPage = pagesAfter[pagesAfter.length - 1];
      await galleryPage.waitForLoadState('domcontentloaded').catch(() => undefined);
      where = `new tab ${galleryPage.url()}`;
    }
    await galleryPage.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 }).catch(() => undefined);
    await sleep(800);
    await galleryPage.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
    await shot('30-template-gallery', galleryPage);
    const cards = await controlsUnder('templates.card.', galleryPage);
    const words = await galleryPage.evaluate(() => document.querySelector('[data-control="templates.page"]')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) ?? null);
    facts.gallery = { cards, words };
    if (galleryPage !== page) await galleryPage.close().catch(() => undefined);
    else {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady();
      await settled();
    }
    return { ok: cards.length > 0, observed: `submenu ${list.filter((r) => r.id.startsWith('file.new')).map((r) => r.id).join(', ')}; opened in ${where.replace(BASE, '')}; cards ${cards.filter((c) => /^templates\.card\.[^.]+$/.test(c.id)).map((c) => c.id).join(', ')}; words "${(words ?? '').slice(0, 300)}"` };
  });

  await step('File > Save as template', 'the dialog with the name prefilled, a sentence, the cover; Save lists it in the gallery', async () => {
    if (!(await advancedOn())) await setAdvanced(true);
    await menuPath('file', 'file.saveAsTemplate');
    await ctl('dialog.saveAsTemplate').waitFor({ timeout: 8000 });
    await sleep(600);
    const name = await valueOf('dialog.saveAsTemplate.name');
    const words = await textOf('dialog.saveAsTemplate');
    await shot('31-save-as-template');
    await clickControl('dialog.saveAsTemplate.name');
    await press('Meta+a');
    await typeHuman(`Polish audit ${STAMP}`);
    await clickControl('dialog.saveAsTemplate.sentence');
    await typeHuman('A scratch template the polish audit made and deletes');
    await shot('32-save-as-template-filled');
    const t0 = Date.now();
    await clickControl('dialog.saveAsTemplate.save');
    const snack = await snackbarWithin(15_000);
    const ms = Date.now() - t0;
    await shot('33-save-template-snackbar');
    const list = await invoke('template.list').catch(() => null);
    const mine = (list?.templates ?? []).find((t) => /polish-audit/.test(t.id));
    templateId = mine?.id ?? null;
    return { ok: templateId !== null && snack !== null, observed: `prefilled name "${name}"; lead "${(words ?? '').slice(0, 120)}"; Save answered in ${ms} ms; snackbar ${snack ? `"${snack.text}" action "${snack.action}"` : 'none'}; template.list has ${templateId ?? 'no polish audit template'} (${(list?.templates ?? []).length} templates: ${(list?.templates ?? []).map((t) => t.id).join(', ')})` };
  });

  await step('the gallery lists the saved template; rename it and delete it from the card menu', 'the card under Your organisation; Rename in place; Delete after a confirm', async () => {
    await page.goto(`${BASE}/decks/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1200);
    await shot('34-gallery-with-template');
    if (!templateId) return { ok: null, observed: 'no template was saved' };
    const card = await visible(`templates.card.${templateId}`);
    const cardRect = await rectOf(`[data-control="templates.card.${templateId}"]`);
    if (cardRect) await shot('34b-gallery-card-crop', page, { clip: { x: Math.max(0, cardRect.x - 8), y: Math.max(0, cardRect.y - 8), width: cardRect.width + 16, height: cardRect.height + 16 } });
    await clickControl(`templates.card.${templateId}.menu`);
    await sleep(500);
    await shot('35-template-card-menu');
    const rowsMenu = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.templates.card."]')].filter((el) => el.getClientRects().length > 0).map((el) => el.textContent?.trim()));
    await clickControl(`menu.templates.card.${templateId}.rename`);
    await sleep(500);
    await shot('36-template-rename-field');
    await press('Meta+a');
    await typeHuman(`Polish audit ${STAMP} renamed`);
    await press('Enter');
    await sleep(1500);
    const named = await textOf(`templates.card.${templateId}.name`);
    await shot('37-template-renamed');
    await clickControl(`templates.card.${templateId}.menu`);
    await sleep(400);
    await clickControl(`menu.templates.card.${templateId}.delete`);
    await ctl('templates.delete').waitFor({ timeout: 8000 });
    await sleep(400);
    const confirmWords = await textOf('templates.delete');
    await shot('38-template-delete-confirm');
    await clickControl('templates.delete.ok');
    const gone = await pollUntil(() => visible(`templates.card.${templateId}`), (x) => !x, 15_000);
    await sleep(800);
    await shot('39-gallery-after-delete');
    if (gone === false) templateId = null;
    return { ok: card && gone === false, observed: `card drawn ${card}; menu rows ${JSON.stringify(rowsMenu)}; name after rename "${named}"; confirm "${(confirmWords ?? '').slice(0, 200)}"; card gone ${gone === false}` };
  });

  await step('back in the editor: the bell opens Notifications', 'Nothing new, Mark all read, a settings link; a second click closes it', async () => {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    await settled();
    if (!(await advancedOn())) await setAdvanced(true);
    await sleep(500);
    if (!(await visible('title.inbox'))) return { ok: false, observed: 'no bell with the switch on' };
    await clickControl('title.inbox');
    const open = await pollUntil(() => visible('panel.inbox'), (x) => x, 5000);
    await sleep(400);
    const words = await textOf('panel.inbox');
    const markAll = await attr('[data-control="panel.inbox.markAllRead"]', 'disabled');
    const pressed = await attr('[data-control="title.inbox"]', 'aria-pressed');
    await shot('40-inbox-panel');
    await clickControl('title.inbox');
    const closed = await pollUntil(() => visible('panel.inbox'), (x) => !x, 4000);
    const pressedAfter = await attr('[data-control="title.inbox"]', 'aria-pressed');
    await shot('41-inbox-closed');
    return { ok: open && /Nothing new/.test(words ?? '') && closed === false && pressed === 'true', observed: `open ${open} (aria-pressed ${pressed}); words "${(words ?? '').slice(0, 120)}"; Mark all read disabled ${markAll !== null}; closed on the second click ${closed === false} (aria-pressed ${pressedAfter})` };
  });

  await step('Notification settings: None, Save, reopen, reload', 'the reopened dialog and the reloaded page read None', async () => {
    const level = () =>
      page.evaluate(() => {
        const boxes = [...document.querySelectorAll('[data-control^="dialog.notificationSettings.level."]')];
        const checked = boxes.find((el) => (el.matches('input') ? el.checked : el.getAttribute('aria-checked') === 'true' || el.querySelector('input')?.checked));
        return checked?.getAttribute('data-control')?.replace('dialog.notificationSettings.level.', '') ?? null;
      });
    await clickControl('title.inbox');
    await pollUntil(() => visible('panel.inbox'), (x) => x, 5000);
    await clickControl('panel.inbox.settings');
    await ctl('dialog.notificationSettings').waitFor({ timeout: 8000 });
    await sleep(400);
    const before = await level();
    const words = await textOf('dialog.notificationSettings');
    await shot('42-notification-settings');
    await clickControl('dialog.notificationSettings.level.none');
    await sleep(200);
    const picked = await level();
    const t0 = Date.now();
    await clickControl('dialog.notificationSettings.save');
    const closed = await pollUntil(() => visible('dialog.notificationSettings'), (x) => !x, 8000);
    const ms = Date.now() - t0;
    const err = await textOf('dialog.notificationSettings.error');
    await shot('43-notification-settings-saved');
    await settled();
    await menuPath('tools', 'tools.notificationSettings');
    await ctl('dialog.notificationSettings').waitFor({ timeout: 8000 });
    await sleep(300);
    const reopened = await level();
    await shot('44-notification-settings-reopened');
    await press('Escape');
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    await settled();
    if (!(await advancedOn())) await setAdvanced(true);
    await menuPath('tools', 'tools.notificationSettings');
    await ctl('dialog.notificationSettings').waitFor({ timeout: 8000 });
    await sleep(300);
    const afterReload = await level();
    await shot('45-notification-settings-after-reload');
    await press('Escape');
    await sleep(300);
    return { ok: picked === 'none' && closed === false && reopened === 'none' && afterReload === 'none', observed: `words "${(words ?? '').slice(0, 200)}"; level ${before} -> picked ${picked}; Save closed ${closed === false} in ${ms} ms${err ? ` error "${err}"` : ''}; reopened ${reopened}; after a reload ${afterReload}` };
  });

  await step('Extensions > Agent access', 'the MCP and API addresses, push and pull, the token sentence', async () => {
    await clearAll();
    await openMenu('extensions').catch(() => undefined);
    const list = await menuRows('extensions').catch(() => []);
    await shot('46-extensions-menu');
    if (!list.some((r) => r.id === 'extensions.agentAccess')) {
      await closeMenus();
      return { ok: null, observed: `no Agent access row; rows ${list.map((r) => r.id).join(', ')}` };
    }
    await clickRow('extensions.agentAccess');
    await ctl('dialog.agentAccess').waitFor({ timeout: 8000 });
    await sleep(400);
    const words = await textOf('dialog.agentAccess');
    const values = await page.evaluate(() => [...document.querySelectorAll('[data-control^="dialog.agentAccess."]')].filter((el) => el.tagName === 'CODE').map((el) => el.textContent?.trim()));
    await shot('47-agent-access');
    await press('Escape');
    facts.agentAccess = values;
    return { ok: values.length === 4, observed: `values ${JSON.stringify(values)}; words "${(words ?? '').slice(0, 300)}"` };
  });

  await step('Tools > Advanced > Run an action', 'the palette of actions by name', async () => {
    await clearAll();
    await openMenu('tools');
    await hoverRow('tools.advanced', '[data-control="menu.tools.advanced.runAction"]');
    await shot('48-tools-advanced-submenu');
    await clickRow('tools.advanced.runAction');
    await sleep(800);
    const rowsP = await page.evaluate(() => [...document.querySelectorAll('[data-control^="palette."]')].filter((el) => el.getClientRects().length > 0).length);
    const firstRows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="palette."]')].filter((el) => el.getClientRects().length > 0).slice(1, 5).map((el) => el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80)));
    await shot('49-run-an-action');
    await press('Escape');
    await sleep(300);
    return { ok: rowsP > 1, observed: `${rowsP} palette rows; first ${JSON.stringify(firstRows)}` };
  });

  await step('Tools > Advanced tools off', 'the default view is back', async () => {
    const off = await setAdvanced(false);
    await sleep(300);
    return { ok: off, observed: `off ${off}; bell drawn ${await visible('title.inbox')}` };
  });

  // ---- G. Preferences and the appearance
  await step('Tools > Preferences submenu and Link detection', 'one row, Link detection, checked; off stops a typed address becoming a link', async () => {
    await clearAll();
    await openMenu('tools');
    await hoverRow('tools.preferences', '[data-control="menu.tools.preferences.linkDetection"]');
    const list = await menuRows('tools');
    await shot('50-preferences-submenu');
    await clickRow('tools.preferences.linkDetection');
    await sleep(400);
    const setting = (await state()).settings?.linkDetection;
    await clickControl(`filmstrip.slide.${slideTwo}`);
    const list2 = await runs();
    const body = list2.find((x) => !/heading/.test(x.run)) ?? null;
    if (!body) return { ok: null, observed: 'no body run to type into' };
    await openRun(body.run);
    await press('End');
    await press('Enter');
    await typeHuman('See www.example.com for the terms');
    await press('Escape');
    await settled();
    const jsonOff = JSON.stringify(await slideJson(slideTwo));
    const linkOff = /\[www\.example\.com\]\(|"link"|https?:\/\/www\.example\.com/.test(jsonOff);
    await shot('51-link-detection-off-typed');
    await menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
    await sleep(300);
    const setting2 = (await state()).settings?.linkDetection;
    await openRun(body.run);
    await press('End');
    await press('Enter');
    await typeHuman('Then www.example.org for the prices');
    await press('Escape');
    await settled();
    const jsonOn = JSON.stringify(await slideJson(slideTwo));
    const linkOn = /\[www\.example\.org\]\(|https?:\/\/www\.example\.org/.test(jsonOn);
    await shot('52-link-detection-on-typed');
    return { ok: setting === false && setting2 === true && linkOff === false && linkOn === true, observed: `rows ${list.filter((r) => r.id.startsWith('tools.preferences')).map((r) => `${r.id}[${r.checked}]`).join(', ')}; after the click linkDetection ${setting}; typed address became a link with it off ${linkOff}; back on ${setting2}; became a link with it on ${linkOn}` };
  });

  await step('View > Appearance: Dark, then the panel and the dialog in dark', 'the chrome turns dark; the panel and Tailor read on ink', async () => {
    await clearAll();
    await openMenu('view');
    await hoverRow('view.appearance', '[data-control="menu.view.appearance.dark"]');
    const list = await menuRows('view');
    await shot('53-view-appearance-submenu');
    await clickRow('view.appearance.dark');
    await sleep(800);
    const dark = await theme();
    await shot('54-appearance-dark');
    await press('Meta+j');
    await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(400);
    await shot('55-assist-dark');
    await closePanel();
    await menuPath('tools', 'tools.tailor');
    await ctl('dialog.tailor').waitFor({ timeout: 8000 });
    await clickControl('dialog.tailor.from');
    await typeHuman('Acme');
    await sleep(400);
    await shot('56-tailor-dark');
    await press('Escape');
    await sleep(300);
    await openMenu('view');
    await hoverRow('view.appearance', '[data-control="menu.view.appearance.light"]');
    await clickRow('view.appearance.light');
    await sleep(800);
    const light = await theme();
    await shot('57-appearance-light');
    await openMenu('view');
    await hoverRow('view.appearance', '[data-control="menu.view.appearance.match"]');
    await clickRow('view.appearance.match');
    await sleep(600);
    const match = await theme();
    return { ok: dark.root === 'dark' && light.root === 'light', observed: `rows ${list.filter((r) => r.id.startsWith('view.appearance')).map((r) => `${r.id}[${r.checked}]`).join(', ')}; dark ${JSON.stringify(dark)}; light ${JSON.stringify(light)}; match ${JSON.stringify(match)}` };
  });

  await step('Slide > Change theme: the Brand kit panel and its Appearance section', 'the panel with the appearance tiles', async () => {
    await clearAll();
    await menuPath('slide', 'slide.changeTheme');
    await sleep(800);
    const panel = await page.evaluate(() => {
      const el = document.querySelector('.ts-panel, [data-control^="panel."]');
      return el ? { id: el.getAttribute('data-control'), words: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 400) } : null;
    });
    const controls = await page.evaluate(() => [...document.querySelectorAll('[data-control^="brand."], [data-control^="panel.brand"], [data-control^="themes."]')].filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-control')).slice(0, 40));
    await shot('58-brand-kit-panel');
    const darkTile = controls.find((c) => /appearance.*dark|dark/.test(c));
    if (darkTile) {
      await clickControl(darkTile);
      await sleep(800);
      await shot('59-brand-kit-dark');
      const t = await theme();
      const lightTile = controls.find((c) => /appearance.*light|light/.test(c));
      if (lightTile) {
        await clickControl(lightTile);
        await sleep(800);
      }
      facts.brandKitTheme = t;
    }
    await press('Escape');
    return { ok: panel !== null, observed: `panel ${JSON.stringify(panel)}; controls ${controls.join(', ')}; after the dark tile ${JSON.stringify(facts.brandKitTheme ?? null)}` };
  });

  // ---- H. a viewer's panel
  await step('a view link: the assistant for a viewer', 'the panel disabled with the sentence', async () => {
    const s = await settled();
    const link = await invoke('share.createLink', { id: deckId, role: 'viewer', label: 'polish audit', baseRevision: s.revision }).catch((e) => ({ error: String(e) }));
    linkId = link?.linkId ?? link?.id ?? link?.link?.id ?? null;
    viewUrl = link?.url ?? link?.link?.url ?? null;
    if (!viewUrl) return { ok: null, observed: `no view link: ${JSON.stringify(link).slice(0, 200)}` };
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const visitor = await other.newPage();
    try {
      await visitor.goto(viewUrl, { waitUntil: 'domcontentloaded' });
      await visitor.waitForURL((u) => !u.pathname.startsWith('/s/'), { timeout: 30_000 }).catch(() => undefined);
      await visitor.waitForSelector('.pt-viewer', { timeout: 30_000 });
      await sleep(1500);
      if (await has('[data-control="dialog.namePrompt"]', visitor)) await clickControl('dialog.namePrompt.close', visitor).catch(() => undefined);
      await shot('60-viewer-editor', visitor);
      const entry = await visible('title.assist', visitor);
      const tools = await visitor.locator('[data-control="menubar.tools"]').count();
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
      await shot('61-viewer-assist', visitor);
      return { ok: /Commenters and editors/.test(sentence ?? '') ? true : null, observed: `address ${visitor.url().replace(BASE, '')}; Assist entry drawn ${entry}; Tools menu ${tools}; panel words "${(sentence ?? 'none').trim().slice(0, 160)}"` };
    } finally {
      await other.close().catch(() => undefined);
    }
  });

  // ---- I. the 1280 pass
  await step('1280 by 800: the title row and the panel', 'the Assist word stays; the panel keeps its width', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(800);
    await clearAll();
    const title = await controlsUnder('title.');
    await shot('70-title-row-1280');
    await press('Meta+j');
    await pollUntil(() => visible('panel.assist'), (x) => x, 6000);
    await sleep(400);
    const panelRect = await rectOf('[data-control="panel.assist"]');
    const sheet = await rectOf('.ts-stagewrap.ts-editor .pt-slide');
    await shot('71-panel-1280');
    await closePanel();
    return { ok: title.some((c) => c.id === 'title.assist'), observed: `title controls ${title.map((c) => `${c.id.replace('title.', '')}@${c.x}(${c.w})`).join(' ')}; panel ${panelRect ? `${Math.round(panelRect.width)}x${Math.round(panelRect.height)}` : 'none'}; sheet ${sheet ? `${Math.round(sheet.width)}x${Math.round(sheet.height)}` : 'none'}` };
  });

  await step('1280 by 800: Tailor, the gallery and the inbox', 'each fits without a horizontal scroll', async () => {
    await menuPath('tools', 'tools.tailor');
    await ctl('dialog.tailor').waitFor({ timeout: 8000 });
    await clickControl('dialog.tailor.from');
    await typeHuman('Acme');
    await sleep(400);
    const d = await rectOf('[data-control="dialog.tailor"]');
    await shot('72-tailor-1280');
    await press('Escape');
    await sleep(300);
    await setAdvanced(true);
    await clickControl('title.inbox');
    await pollUntil(() => visible('panel.inbox'), (x) => x, 5000);
    await sleep(400);
    await shot('73-inbox-1280');
    await clickControl('title.inbox');
    await setAdvanced(false);
    await page.goto(`${BASE}/decks/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-control="templates.page"]', { timeout: 30_000 });
    await sleep(1200);
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await shot('74-gallery-1280');
    await page.setViewportSize({ width: 1440, height: 900 });
    return { ok: (d?.width ?? 0) > 0 && scrollX <= 0, observed: `Tailor ${d ? `${Math.round(d.width)}x${Math.round(d.height)}` : 'none'}; gallery horizontal overflow ${scrollX} px` };
  });
} catch (error) {
  record('the drive ran to completion', 'no exception outside a step', error instanceof Error ? (error.stack ?? error.message) : String(error), false);
} finally {
  // ---- the cleanup: the link, the template, then File > Move to trash, Delete forever, 404
  try {
    if (deckId) {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady();
      await settled();
      if (linkId) {
        const s = await settled();
        await invoke('share.revokeLink', { id: deckId, linkId, baseRevision: s.revision }).catch(() => undefined);
      }
      if (templateId) {
        await invoke('template.delete', { id: templateId, confirm: true }).catch(() => undefined);
      }
      const list = await invoke('template.list').catch(() => null);
      record('templates left on the deployment', 'none of this run', (list?.templates ?? []).map((t) => t.id).join(', '), !(list?.templates ?? []).some((t) => /polish-audit/.test(t.id)));
      await openMenu('file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickRow('file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('File > Move to trash', 'the deck moves to the trash and the page returns to /decks', page.url().replace(BASE, ''), true);
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      await clickControl(`trash.delete.${deckId}`);
      await clickControl('trash.confirm.ok');
      await pollUntil(() => visible(`trash.card.${deckId}`), (x) => !x, 15_000);
      const res = await page.request.get(`${BASE}/edit/${deckId}`);
      const res2 = await page.request.get(`${BASE}/deck/${deckId}`);
      record('Delete forever, then GET /edit/<id> and /deck/<id>', '404 and 404', `${res.status()} and ${res2.status()}`, res.status() === 404 && res2.status() === 404);
    }
  } catch (error) {
    record('cleanup', 'the deck trashed and deleted forever', `error: ${error instanceof Error ? error.message : String(error)}`, false);
    if (deckId && TOKEN) {
      const t = await httpAction('deck.trash', { id: deckId, baseRevision: 0 }).catch(() => null);
      record('cleanup through the actions API', 'deck.trash accepted', `${t?.status} ${JSON.stringify(t?.body).slice(0, 120)}`, t?.status < 300);
    }
  }
  await browser.close();
  writeFileSync(
    path.join(OUT, 'rows.json'),
    JSON.stringify({ base: BASE, deck: deckId, startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), viewport: '1440x900 at 2x, then 1280x800 at 2x', rows, facts, consoleErrors: [...new Set(consoleErrors)] }, null, 2),
  );
  console.log(`\n${rows.length} rows: ${rows.filter((r) => r.ok === true).length} ok, ${rows.filter((r) => r.ok === false).length} failed, ${rows.filter((r) => r.ok === null).length} not driven; ${Math.round((Date.now() - startedAt) / 1000)} s; console errors ${[...new Set(consoleErrors)].length}`);
}

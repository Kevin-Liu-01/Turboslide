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

const editing = () => page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const runMarkup = async (slideId) => {
  const s = await slideJson(slideId);
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(s.blocks ?? s);
  return texts.filter((t) => /example|renewal|Acme/.test(t));
};
/** Opens a session on the run by a double click on its first word and reports the state. */
const openSession = async (matcher) => {
  const list = await runs();
  const run = list.find((x) => matcher.test(x.text)) ?? null;
  if (!run) return { opened: false, reason: `no run matching ${matcher}` };
  await dblclickAt(run.rect.x + 24, run.rect.y + run.rect.h / 2);
  await sleep(400);
  const open = await editing();
  const sel = await page.evaluate(() => window.getSelection()?.toString().slice(0, 30) ?? '');
  return { opened: open, selection: sel, run: run.run };
};

try {
  await step('open /new, the title, a second slide with a body paragraph', 'ready', async () => {
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await editorReady();
    deckId = (await invoke('deck.info')).id;
    titleSlide = (await state()).slideId;
    if (await has('[data-control="dialog.namePrompt"]')) await clickControl('dialog.namePrompt.close').catch(() => undefined);
    const list = await runs();
    const head = list.find((x) => /heading/.test(x.run)) ?? list[0];
    await openRun(head.run);
    await typeHuman(TITLE);
    await press('Escape');
    await waitRevision(1, 30_000);
    await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
    await settled();
    await clickControl('toolbar.newSlide');
    await pollUntil(state, (s) => s.slideId !== titleSlide, 10_000);
    await sleep(600);
    slideTwo = (await state()).slideId;
    const l2 = await runs();
    facts.slideTwoRuns = l2.map((r) => ({ run: r.run, text: r.text.slice(0, 40), y: Math.round(r.rect.y), h: Math.round(r.rect.h) }));
    const h2 = l2.find((x) => /heading/.test(x.run)) ?? null;
    const body = l2.find((x) => x !== h2 && /Click to add text|body|paragraph/i.test(`${x.text} ${x.run}`)) ?? l2.find((x) => x !== h2);
    if (h2) {
      await openRun(h2.run);
      await typeHuman('What Acme gets');
      await press('Escape');
      await sleep(300);
    }
    await openRun(body.run);
    await typeHuman('The renewal covers three regions for Acme.');
    await press('Escape');
    await settled();
    return { ok: true, observed: `deck ${deckId}; slide 2 ${slideTwo}; runs ${JSON.stringify(facts.slideTwoRuns)}; body run ${body.run}` };
  });

  await step('Link detection off: open the body session (verified), End, space, type an address and a space', 'no link while the setting is off', async () => {
    await clearAll();
    await menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
    await sleep(400);
    const setting = (await state()).settings?.linkDetection;
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await sleep(300);
    const s = await openSession(/renewal covers/);
    await shot('120-link-off-session');
    if (!s.opened) return { ok: null, observed: `setting ${setting}; no session opened by the double click: ${JSON.stringify(s)}` };
    await press('End');
    await typeHuman(' See www.example.com now ');
    await sleep(600);
    await shot('121-link-off-typed');
    const stillOpen = await editing();
    await press('Escape');
    await settled();
    const markup = await runMarkup(slideTwo);
    const link = markup.some((t) => /\[www\.example\.com\]\(/.test(t));
    return { ok: setting === false && !link, observed: `setting ${setting}; session ${JSON.stringify(s)}; still open after typing ${stillOpen}; markup ${JSON.stringify(markup)}; link made ${link}` };
  });
  await step('Link detection on: the same typing with another address', 'the address becomes a link', async () => {
    await menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
    await sleep(400);
    const setting = (await state()).settings?.linkDetection;
    await clickControl(`filmstrip.slide.${slideTwo}`);
    await sleep(300);
    const s = await openSession(/renewal covers/);
    if (!s.opened) return { ok: null, observed: `setting ${setting}; no session: ${JSON.stringify(s)}` };
    await press('End');
    await typeHuman(' Then www.example.net today ');
    await sleep(600);
    await shot('122-link-on-typed');
    await press('Escape');
    await settled();
    const markup = await runMarkup(slideTwo);
    const link = markup.some((t) => /\[www\.example\.net\]\(/.test(t));
    return { ok: setting === true && link, observed: `setting ${setting}; session ${JSON.stringify(s)}; markup ${JSON.stringify(markup)}; link made ${link}` };
  });

  await step('a view link: the assistant for a viewer', 'the panel disabled with the sentence', async () => {
    const rec = await invoke('share.get', { id: deckId }).catch(() => null);
    const recRev = rec?.record?.revision ?? 0;
    let link = null;
    for (let i = 0; i < 3 && !link?.url; i += 1) {
      link = await invoke('share.createLink', { id: deckId, role: 'viewer', label: 'polish audit', baseRevision: recRev }).catch((e) => ({ error: String(e).slice(0, 200) }));
      if (!link?.url) await sleep(20_000);
    }
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
      await shot('123-viewer-editor', visitor);
      const entry = await visible('title.assist', visitor);
      const menubar = await visitor.evaluate(() => [...document.querySelectorAll('[data-control^="menubar."]')].map((el) => el.textContent?.trim()));
      const tools = await visitor.evaluate(() => Boolean(document.querySelector('[data-control="menubar.tools"]')));
      let sentence = null;
      let byKey = null;
      if (entry) {
        await clickControl('title.assist', visitor);
        await sleep(600);
        sentence = await visitor.locator('[data-control="panel.assist.viewer"], [data-control="panel.assist"]').first().textContent({ timeout: 6000 }).catch(() => null);
      } else {
        await visitor.keyboard.press('Meta+j');
        await sleep(800);
        byKey = await visitor.locator('[data-control="panel.assist"]').first().isVisible().catch(() => false);
        sentence = await visitor.locator('[data-control="panel.assist.viewer"], [data-control="panel.assist"]').first().textContent({ timeout: 3000 }).catch(() => null);
      }
      await shot('124-viewer-assist', visitor);
      return { ok: /Commenters and editors/.test(sentence ?? '') ? true : null, observed: `address ${visitor.url().replace(BASE, '').slice(0, 60)}; Assist entry drawn ${entry}; Tools menu ${tools}; menubar ${JSON.stringify(menubar)}; Cmd+J opened a panel ${byKey}; panel words "${(sentence ?? 'none').trim().slice(0, 160)}"` };
    } finally {
      await other.close().catch(() => undefined);
    }
  });
} catch (error) {
  record('the drive ran to completion', 'no exception outside a step', error instanceof Error ? (error.stack ?? error.message) : String(error), false);
} finally {
  try {
    if (deckId) {
      if (linkId) {
        const rec = await invoke('share.get', { id: deckId }).catch(() => null);
        await invoke('share.revokeLink', { id: deckId, linkId, baseRevision: rec?.record?.revision ?? 0 }).catch(() => undefined);
      }
      await clearAll();
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
      await clickControl('trash.confirm.ok');
      await pollUntil(() => visible(`trash.card.${deckId}`), (x) => !x, 15_000);
      await sleep(1500);
      const res = await page.request.get(`${BASE}/edit/${deckId}`);
      const res2 = await page.request.get(`${BASE}/deck/${deckId}`);
      record('Delete forever, then GET /edit/<id> and /deck/<id>', '404 and 404', `${res.status()} and ${res2.status()}`, res.status() === 404 && res2.status() === 404);
    }
  } catch (error) {
    record('cleanup', 'the deck trashed and deleted forever', `error: ${error instanceof Error ? error.message : String(error)}; deck ${deckId} needs the HTTP cleanup`, false);
  }
  await browser.close();
  writeFileSync(path.join(OUT, 'rows-3.json'), JSON.stringify({ base: BASE, deck: deckId, startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), rows, facts, consoleErrors: [...new Set(consoleErrors)] }, null, 2));
  console.log(`\n${rows.length} rows: ${rows.filter((r) => r.ok === true).length} ok, ${rows.filter((r) => r.ok === false).length} failed, ${rows.filter((r) => r.ok === null).length} not driven; ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

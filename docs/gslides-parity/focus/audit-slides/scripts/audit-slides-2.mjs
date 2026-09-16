#!/usr/bin/env node
// The focus audit of "Slides, layouts and the filmstrip" on production (2026-09-15). Drives the
// product the way a person does, at human speed, on a scratch deck made from /new, and records one
// row per interaction: feature, interaction, result (works, broken, flaky, not driven), evidence
// read from the DOM and window.turboslide.studio, a screenshot path. A failed first attempt is
// repeated up to three more times before the row reads broken (every attempt failed) or flaky
// (some passed). The deck is trashed through File > Move to trash and Delete forever in a finally
// block, then probed for a 404. Imports nothing but playwright-core.
//   node audit-slides.mjs <json out>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const SHOTS = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus/audit-slides';
const OUT =
  process.argv[2] ??
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/focus/slides/run-2.json';
const SHOT_START = Number(process.argv[3] ?? 60);
mkdirSync(SHOTS, { recursive: true });
mkdirSync(path.dirname(OUT), { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const consoleErrors = [];
const started = Date.now();
let deckId = '';
let version = null;
let shotN = SHOT_START;
const save = () =>
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        base: BASE,
        deckId,
        version,
        startedAt: new Date(started).toISOString(),
        ms: Date.now() - started,
        rows,
        consoleErrors,
      },
      null,
      2,
    ),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * One interaction. `fn(attempt)` returns { ok, evidence, shot?, notDriven? }. A failed first
 * attempt repeats up to three more times: every attempt failed reads broken, a later pass reads
 * flaky. `tries: 1` for a row that only observes.
 */
async function row(feature, interaction, fn, { tries = 4 } = {}) {
  const attempts = [];
  const errBefore = consoleErrors.length;
  let result = 'broken';
  let shotPath = null;
  for (let i = 0; i < tries; i += 1) {
    let r;
    try {
      r = await fn(i);
    } catch (error) {
      r = { ok: false, evidence: `error: ${error instanceof Error ? error.message : String(error)}` };
    }
    attempts.push(r);
    if (r.shot) shotPath = r.shot;
    if (r.notDriven) {
      result = 'not driven';
      break;
    }
    if (r.ok) {
      result = i === 0 ? 'works' : 'flaky';
      break;
    }
    if (i < tries - 1) await sleep(800);
  }
  const errs = consoleErrors.slice(errBefore);
  const entry = {
    n: rows.length + 1,
    feature,
    interaction,
    result,
    attempts: attempts.length,
    evidence:
      attempts.length > 1
        ? attempts.map((a, i) => `attempt ${i + 1}: ${a.evidence}`).join(' | ')
        : attempts[0]?.evidence ?? '',
    shot: shotPath,
    consoleErrors: errs,
  };
  rows.push(entry);
  save();
  const tag =
    result === 'works' ? 'ok  ' : result === 'broken' ? 'FAIL' : result === 'flaky' ? 'FLKY' : 'n/d ';
  console.log(`${tag} ${String(entry.n).padStart(3)} ${feature} :: ${interaction}\n       ${entry.evidence}`);
  return entry;
}

// ---------------------------------------------------------------------------------------------
// human speed

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
const MODS = { Shift: 'Shift', Meta: 'Meta', Alt: 'Alt', Control: 'Control' };
/** A click with the modifiers held on the keyboard from before the press to after the release. */
const clickAt = async (page, x, y, opts = {}) => {
  const { modifiers = [], ...rest } = opts;
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  for (const m of modifiers) await page.keyboard.down(MODS[m]);
  await sleep(rand(30, 60));
  await page.mouse.click(x, y, rest);
  await sleep(rand(30, 60));
  for (const m of modifiers) await page.keyboard.up(MODS[m]);
  await sleep(rand(120, 220));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(160, 260));
};
/** A real drag of a card: press, a small wiggle so dragstart fires, travel, pause, release. */
const dragCard = async (page, from, to) => {
  await moveHuman(page, { x: from.x - 30, y: from.y }, from, 6);
  await page.mouse.down();
  await sleep(150);
  await moveHuman(page, from, { x: from.x + 4, y: from.y - 10 }, 4);
  await moveHuman(page, { x: from.x + 4, y: from.y - 10 }, to, 16);
  await sleep(300);
  await page.mouse.up();
  await sleep(rand(150, 250));
};

// ---------------------------------------------------------------------------------------------
// the product

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
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
const settled = async (page, timeout = 20_000) =>
  pollUntil(() => state(page), (s) => (s.sync?.pending ?? s.pending ?? 0) === 0, timeout);
const connected = (page) =>
  pollUntil(() => state(page), (s) => s.sync?.connected === true, 45_000);
const activeSlide = async (page) => (await state(page)).slideId;
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const slideJson = (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
const layoutFacts = (s) =>
  `${s.kind ?? '?'}/${s.template ?? '-'}/${s.layout?.type ?? (typeof s.layout === 'string' ? s.layout : '-')}`;
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const ctl = (page, control) => page.locator(`[data-control="${control}"]`).first();
const clickControl = async (page, control, opts = {}) => {
  const el = ctl(page, control);
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2, opts);
};
const clickIn = async (page, root, control) => {
  let el = page.locator(`${root} [data-control="${control}"]`).first();
  await el.waitFor({ timeout: 4000 }).catch(() => undefined);
  if (!(await el.isVisible().catch(() => false))) {
    el = page.locator(`[data-control="${control}"]`).first();
    await el.waitFor({ timeout: 4000 });
  }
  const r = await el.boundingBox();
  if (!r) throw new Error(`no ${control} in ${root}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const hoverIn = async (page, root, control, waitFor) => {
  let el = page.locator(`${root} [data-control="${control}"]`).first();
  await el.waitFor({ timeout: 4000 }).catch(() => undefined);
  if (!(await el.isVisible().catch(() => false))) {
    el = page.locator(`[data-control="${control}"]`).first();
    await el.waitFor({ timeout: 4000 });
  }
  const r = await el.boundingBox();
  if (!r) throw new Error(`no ${control} in ${root}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(300, 450));
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const rowState = (page, root, control) =>
  page.evaluate(
    ([r, c]) => {
      const el =
        document.querySelector(`${r} [data-control="${c}"]`) ??
        document.querySelector(`[data-control="${c}"]`);
      if (!el) return { present: false };
      return {
        present: true,
        disabled: el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'),
        label: (el.querySelector('.ts-menu-label')?.textContent ?? el.textContent ?? '').trim(),
      };
    },
    [root, control],
  );
const menuRoot = (id) => `#ts-menu-${id}`;
const openMenu = async (page, id) => {
  await clickControl(page, `menubar.${id}`);
  await page.locator(menuRoot(id)).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const CTX = '.ts-context-menu.is-filmstripCard';
const cardSel = (id) => `[data-control="filmstrip.slide.${id}"]`;
const cardRect = async (page, id) => {
  await page
    .locator(cardSel(id))
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  await sleep(120);
  return rectOf(page, cardSel(id));
};
const clickCard = async (page, id, opts = {}) => {
  const r = await cardRect(page, id);
  if (!r) throw new Error(`no card ${id}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2, opts);
};
const openCardMenu = async (page, id) => {
  const r = await cardRect(page, id);
  if (!r) throw new Error(`no card ${id}`);
  await moveHuman(page, { x: r.x - 20, y: r.y }, center(r), 6);
  await sleep(rand(60, 120));
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
  await page.locator(CTX).waitFor({ timeout: 6000 });
  await sleep(rand(150, 300));
};
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.getAttribute('contenteditable') === 'true' ? '[contenteditable]' : ''}`;
  });

// the readers of the surfaces this audit covers
const cards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-film .ts-card[data-id]')].map((el) => ({
      id: el.getAttribute('data-id'),
      n: (el.querySelector('.ts-card-n')?.textContent ?? '').trim(),
      current: el.classList.contains('is-current'),
      selected: el.classList.contains('is-selected'),
      skipped: el.classList.contains('is-skipped'),
      skipAttr: el.hasAttribute('data-skip'),
      glyph: Boolean(el.querySelector('.ts-card-skip')),
      ariaSelected: el.getAttribute('aria-selected'),
      focused: document.activeElement === el,
    })),
  );
const cardsBrief = (list) =>
  list
    .map(
      (c) =>
        `${c.n}:${c.id}${c.current ? '*' : ''}${c.selected ? '+' : ''}${c.skipped ? '~' : ''}${c.focused ? '@' : ''}`,
    )
    .join(' ');
const counter = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-control="view.count"]');
    return el
      ? { text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(), label: el.getAttribute('aria-label') }
      : null;
  });
const hashOf = (page) => page.evaluate(() => window.location.hash);
const stageFacts = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) return null;
    return {
      runs: [...sheet.querySelectorAll('[data-run]')].map((el) => el.getAttribute('data-run')),
      prompts: [...sheet.querySelectorAll('[data-prompt]')].map((el) =>
        (el.getAttribute('data-prompt') || el.textContent || '').replace(/\s+/g, ' ').trim(),
      ),
      blocks: sheet.querySelectorAll('[data-block]').length,
      text: (sheet.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  });
const snackbar = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.ts-snackbar.is-on');
    return el
      ? {
          text: (el.querySelector('.ts-snackbar-text')?.textContent ?? el.textContent ?? '').trim(),
          action: el.querySelector('[data-control="snackbar.action"]')?.textContent?.trim() ?? null,
        }
      : null;
  });
const notesFacts = (page) =>
  page.evaluate(() => {
    const pane = document.querySelector('[data-control="notes"]');
    const field = document.querySelector('[data-control="notes.text"]');
    return {
      present: Boolean(pane),
      height: pane ? pane.style.height : null,
      box: pane ? Math.round(pane.getBoundingClientRect().height) : null,
      hidden: pane ? pane.classList.contains('is-hidden') : null,
      value: field ? field.value : null,
      placeholder: field ? field.placeholder : null,
      focused: field ? document.activeElement === field : false,
    };
  });
const gridFacts = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('.pt-grid');
    const film = document.querySelector('.ts-filmstrip');
    const stage = document.querySelector('.ts-stagewrap.ts-editor');
    return {
      grid: Boolean(grid),
      tiles: grid ? grid.querySelectorAll('.pt-thumb').length : 0,
      tileIds: grid ? [...grid.querySelectorAll('.pt-thumb')].map((t) => t.getAttribute('data-id')) : [],
      activeTile: grid ? grid.querySelector('.pt-thumb.is-active')?.getAttribute('data-id') ?? null : null,
      selectedTiles: grid ? grid.querySelectorAll('.pt-thumb.is-selected').length : 0,
      skippedTiles: grid ? grid.querySelectorAll('.pt-thumb.is-skipped').length : 0,
      filmHidden: film
        ? film.classList.contains('is-hidden') || film.getAttribute('aria-hidden') === 'true'
        : null,
      filmWidth: film ? Math.round(film.getBoundingClientRect().width) : null,
      stageShown: stage ? stage.getBoundingClientRect().width > 0 : false,
      gridPressed: document.querySelector('[data-control="view.gridView"]')?.getAttribute('aria-pressed'),
      filmPressed: document
        .querySelector('[data-control="view.filmstripView"]')
        ?.getAttribute('aria-pressed'),
    };
  });
const plateTiles = (page, root) =>
  page.evaluate((r) => {
    const plate = document.querySelector(r);
    if (!plate) return null;
    return [...plate.querySelectorAll('[data-layout]')].map((el) => ({
      id: el.getAttribute('data-layout'),
      label: (el.querySelector('.ts-layout-name')?.textContent ?? el.textContent ?? '').trim(),
      current: el.classList.contains('is-current') || el.getAttribute('aria-checked') === 'true',
      missing: el.classList.contains('is-missing'),
    }));
  }, root);
const runRect = (page, run) =>
  rectOf(page, `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`);
const runText = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    return clone.textContent ?? '';
  }, run);
const closeNamePrompt = async (page) => {
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => undefined);
    await sleep(200);
  }
};
/** Clicks the workspace beside the sheet so the canvas, not a card, holds the focus. */
const focusWorkspace = async (page) => {
  await clearAll(page);
  const wrap = await rectOf(page, '.ts-stagewrap.ts-editor');
  const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
  if (wrap && sheet) await clickAt(page, Math.max(wrap.x + 12, sheet.x - 24), sheet.y + sheet.h / 2);
  await sleep(200);
};
/** Focuses a card by clicking it, the way a person does; answers whether the card took focus. */
const focusCard = async (page, id) => {
  await clickCard(page, id);
  await pollUntil(() => activeSlide(page), (a) => a === id, 8000);
  await sleep(300);
  return page.evaluate((sid) => document.activeElement?.getAttribute('data-id') === sid, id);
};
const waitOrder = (page, test, timeout = 20_000) => pollUntil(() => slideOrder(page), test, timeout);

// ---------------------------------------------------------------------------------------------
// the run: the modifier click rows of the filmstrip (run 1 drove them without the keys held)

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('dialog', (d) => d.dismiss().catch(() => undefined));
context.on('page', (p) => p.close().catch(() => undefined));
const shot = async (name) => {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => undefined);
  return `audit-slides/${file}`;
};
/** The theme's slide number in the sheet footer ("01 / 06"), read from the active sheet's text. */
const footerCounter = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    if (!sheet) return null;
    const m = (sheet.textContent ?? '').match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    return m ? { text: m[0].replace(/\s+/g, ' '), n: Number(m[1]), total: Number(m[2]) } : null;
  });

const TITLE = 'title';
const HEAD = 'heading/text';

try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  version = await page.evaluate(() => window.turboslide.studio.describe().version ?? null);
  deckId = (await invoke(page, 'deck.info')).id;
  // the title, so the deck exists, then five slides so the ranges have room
  const r = await runRect(page, HEAD);
  await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  await typeHuman(page, 'Q3 pipeline review for Acme');
  await press(page, 'Escape');
  await pollUntil(() => state(page), (v) => v.revision >= 1, 30_000);
  await settled(page, 30_000);
  await closeNamePrompt(page);
  await connected(page);
  for (let i = 0; i < 5; i += 1) {
    const before = await slideOrder(page);
    await clearAll(page);
    await clickControl(page, 'toolbar.newSlide');
    await waitOrder(page, (o) => o.length === before.length + 1);
    await settled(page);
  }
  console.log(`deck ${deckId} with ${(await slideOrder(page)).length} slides`);

  await row('Filmstrip selection', 'Shift click the fourth card with the second current, then Cmd click the first, then a plain click (Shift and Cmd held on the keyboard)', async () => {
    const order = await slideOrder(page);
    await clearAll(page);
    await clickCard(page, order[1]);
    await pollUntil(() => activeSlide(page), (a) => a === order[1], 8000);
    await clickCard(page, order[3], { modifiers: ['Shift'] });
    await sleep(400);
    const shifted = await cards(page);
    const sh = await shot('filmstrip-shift-select');
    await clickCard(page, order[0], { modifiers: ['Meta'] });
    await sleep(400);
    const meta = await cards(page);
    await clickCard(page, order[0]);
    await sleep(300);
    const single = await cards(page);
    const sel = (cs) => cs.filter((c) => c.selected).map((c) => c.id);
    return {
      ok: sel(shifted).join() === order.slice(1, 4).join() && sel(meta).join() === order.slice(0, 4).join() && sel(single).join() === order[0],
      evidence: `after Shift click ${cardsBrief(shifted)}; after Cmd click ${cardsBrief(meta)}; after a plain click ${cardsBrief(single)}; active ${await activeSlide(page)} (* current, + selected, @ focused)`,
      shot: sh,
    };
  });

  await row('Filmstrip selection', 'Cmd click a second card, then Cmd click it again to drop it from the selection', async () => {
    const order = await slideOrder(page);
    await clearAll(page);
    await clickCard(page, order[0]);
    await pollUntil(() => activeSlide(page), (a) => a === order[0], 8000);
    await clickCard(page, order[2], { modifiers: ['Meta'] });
    await sleep(400);
    const added = await cards(page);
    await clickCard(page, order[2], { modifiers: ['Meta'] });
    await sleep(400);
    const dropped = await cards(page);
    const sel = (cs) => cs.filter((c) => c.selected).map((c) => c.id);
    return {
      ok: sel(added).join() === [order[0], order[2]].join() && sel(dropped).join() === order[0],
      evidence: `after Cmd click ${cardsBrief(added)}; after Cmd click again ${cardsBrief(dropped)}`,
    };
  });

  await row('Delete slide', 'Select two cards with Shift click, press Delete, then Undo from the snackbar', async () => {
    const before = await slideOrder(page);
    const a = before[before.length - 2];
    const b = before[before.length - 1];
    await clearAll(page);
    await clickCard(page, a);
    await pollUntil(() => activeSlide(page), (x) => x === a, 8000);
    await clickCard(page, b, { modifiers: ['Shift'] });
    await sleep(400);
    const cs = await cards(page);
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('ts-card'));
    await press(page, 'Delete');
    const sb = await pollUntil(() => snackbar(page), (v) => v !== null && v.action !== null, 4000);
    const sh = await shot('delete-two-snackbar');
    const mid = await waitOrder(page, (o) => o.length === before.length - 2, 12_000);
    if (!sb || sb.action === null) return { ok: false, evidence: `selected ${cardsBrief(cs)}; ${before.length} -> ${mid.length}; snackbar ${JSON.stringify(sb)}`, shot: sh };
    await clickControl(page, 'snackbar.action');
    const after = await waitOrder(page, (o) => o.length === before.length);
    await settled(page);
    return {
      ok: mid.length === before.length - 2 && after.join(',') === before.join(','),
      evidence: `selected ${cardsBrief(cs)}; focused card ${focused}; ${before.length} -> ${mid.length} (snackbar "${sb.text}" [${sb.action}]) -> ${after.length}; order restored ${after.join(',') === before.join(',')}`,
      shot: sh,
    };
  });

  await row('Duplicate slide', 'Select two cards with Shift click and press Cmd+D', async () => {
    const before = await slideOrder(page);
    const a = before[1];
    const b = before[2];
    await clearAll(page);
    await clickCard(page, a);
    await pollUntil(() => activeSlide(page), (x) => x === a, 8000);
    await clickCard(page, b, { modifiers: ['Shift'] });
    await sleep(400);
    const cs = await cards(page);
    await press(page, 'Meta+d');
    const after = await waitOrder(page, (o) => o.length === before.length + 2, 15_000);
    await settled(page);
    const added = after.filter((id) => !before.includes(id));
    await press(page, 'Meta+z');
    const undone = await waitOrder(page, (o) => o.length === before.length, 15_000);
    await settled(page);
    return {
      ok: after.length === before.length + 2 && undone.join(',') === before.join(','),
      evidence: `selected ${cardsBrief(cs)}; ${before.length} -> ${after.length}; copies ${added.join(',')} at ${added.map((id) => after.indexOf(id)).join(',')}; undo -> ${undone.length} (restored ${undone.join(',') === before.join(',')})`,
    };
  });

  await row('Reorder slides', 'Select two cards with Shift click and drag them above the first card', async () => {
    const before = await slideOrder(page);
    const a = before[2];
    const b = before[3];
    await clearAll(page);
    await clickCard(page, a);
    await pollUntil(() => activeSlide(page), (x) => x === a, 8000);
    await clickCard(page, b, { modifiers: ['Shift'] });
    await sleep(400);
    const cs = await cards(page);
    const from = center(await cardRect(page, b));
    const to = await cardRect(page, before[0]);
    await dragCard(page, from, { x: to.x + to.w / 2, y: to.y + 6 });
    const after = await waitOrder(page, (o) => o[0] === a && o[1] === b, 12_000);
    await settled(page);
    const sh = await shot('reorder-two-drag');
    if (after[0] === a) {
      await press(page, 'Meta+z');
      await waitOrder(page, (o) => o.join(',') === before.join(','), 12_000);
      await settled(page);
    }
    return { ok: after[0] === a && after[1] === b, evidence: `selected ${cardsBrief(cs)}; ${before.join(',')} -> ${after.join(',')}`, shot: sh };
  });

  await row('Skip slide', 'Select two cards with Shift click, right click, Skip slide; both fade; the snackbar counts them', async () => {
    const before = await slideOrder(page);
    const a = before[before.length - 2];
    const b = before[before.length - 1];
    await clearAll(page);
    await clickCard(page, a);
    await pollUntil(() => activeSlide(page), (x) => x === a, 8000);
    await clickCard(page, b, { modifiers: ['Shift'] });
    await sleep(400);
    await openCardMenu(page, b);
    await clickIn(page, CTX, 'menu.slide.skipSlide');
    const sa = await pollUntil(() => slideJson(page, a), (s) => s.skip === true, 15_000);
    const sb2 = await slideJson(page, b);
    const sb = await snackbar(page);
    await sleep(400);
    const cs = await cards(page);
    const sh = await shot('skip-two');
    await openCardMenu(page, b);
    const label = await rowState(page, CTX, 'menu.slide.skipSlide');
    await clickIn(page, CTX, 'menu.slide.skipSlide');
    const back = await pollUntil(() => slideJson(page, a), (s) => s.skip !== true, 15_000);
    await settled(page);
    return {
      ok: sa.skip === true && sb2.skip === true && cs.filter((c) => c.skipped).length === 2 && back.skip !== true,
      evidence: `skip ${a} ${sa.skip}, ${b} ${sb2.skip}; cards ${cardsBrief(cs)}; snackbar ${JSON.stringify(sb)}; row then "${label.label}"; after Unskip ${back.skip}`,
      shot: sh,
    };
  });

  await row('Grid view', 'In the grid, Shift click a second tile then Delete removes both; Undo restores them', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await clickControl(page, 'view.gridView');
    await pollUntil(() => gridFacts(page), (g) => g.grid && g.tiles === before.length, 8000);
    const a = before[before.length - 2];
    const b = before[before.length - 1];
    const ra = await rectOf(page, `.pt-grid .pt-thumb[data-id="${a}"]`);
    const rb = await rectOf(page, `.pt-grid .pt-thumb[data-id="${b}"]`);
    await clickAt(page, ra.x + ra.w / 2, ra.y + ra.h / 2);
    await sleep(300);
    await clickAt(page, rb.x + rb.w / 2, rb.y + rb.h / 2, { modifiers: ['Shift'] });
    await sleep(400);
    const g = await gridFacts(page);
    const sh = await shot('grid-shift-select');
    await press(page, 'Delete');
    const sb = await pollUntil(() => snackbar(page), (v) => v !== null, 4000);
    const mid = await waitOrder(page, (o) => o.length === before.length - 2, 12_000);
    let after = mid;
    if (mid.length !== before.length) {
      if (sb?.action) await clickControl(page, 'snackbar.action');
      else {
        await press(page, 'Meta+z');
        if (mid.length === before.length - 2) await press(page, 'Meta+z');
      }
      after = await waitOrder(page, (o) => o.length === before.length, 15_000);
      await settled(page);
    }
    await clickControl(page, 'view.filmstripView');
    await pollUntil(() => gridFacts(page), (gg) => !gg.grid, 8000);
    return {
      ok: g.selectedTiles === 2 && mid.length === before.length - 2 && after.join(',') === before.join(','),
      evidence: `selected tiles ${g.selectedTiles}; ${before.length} -> Delete ${mid.length} (snackbar ${JSON.stringify(sb)}) -> ${after.length}; restored ${after.join(',') === before.join(',')}`,
      shot: sh,
    };
  });
  await row('Slide counter', 'The sheet footer counter follows a card click, a New slide and a Delete', async () => {
    const order = await slideOrder(page);
    await clearAll(page);
    await clickCard(page, order[2]);
    await pollUntil(() => activeSlide(page), (a) => a === order[2], 8000);
    await sleep(500);
    const c0 = await footerCounter(page);
    const cs = await cards(page);
    await clickControl(page, 'toolbar.newSlide');
    const mid = await waitOrder(page, (o) => o.length === order.length + 1);
    await sleep(600);
    const c1 = await footerCounter(page);
    const added = mid.find((id) => !order.includes(id));
    await focusCard(page, added);
    await press(page, 'Delete');
    await waitOrder(page, (o) => o.length === order.length);
    await sleep(800);
    const c2 = await footerCounter(page);
    await settled(page);
    return {
      ok: c0?.n === 3 && c0?.total === order.length && c1?.n === 4 && c1?.total === order.length + 1 && c2?.total === order.length,
      evidence: `on card 3 footer ${JSON.stringify(c0)} (cards ${cs.map((c) => c.n).join(',')}); after New slide ${JSON.stringify(c1)}; after Delete ${JSON.stringify(c2)}; toolbar view.count ${await has(page, '[data-control="view.count"]')}`,
    };
  });
} catch (error) {
  rows.push({ n: rows.length + 1, feature: 'the run', interaction: 'ran to completion', result: 'broken', attempts: 1, evidence: `exception outside a row: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`, shot: null, consoleErrors: [] });
  save();
} finally {
  if (deckId && /^untitled-/.test(deckId)) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await connected(page);
      await settled(page);
      await clearAll(page);
      await openMenu(page, 'file');
      await clickIn(page, menuRoot('file'), 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      trashed = true;
      rows.push({ n: rows.length + 1, feature: 'cleanup', interaction: 'File > Move to trash, then Delete forever on /decks/trash (run 2)', result: 'works', attempts: 1, evidence: `deck ${deckId} left the trash`, shot: null, consoleErrors: [] });
    } catch (error) {
      rows.push({ n: rows.length + 1, feature: 'cleanup', interaction: 'File > Move to trash, then Delete forever on /decks/trash (run 2)', result: 'broken', attempts: 1, evidence: `failed: ${error instanceof Error ? error.message : String(error)}`, shot: null, consoleErrors: [] });
    }
    if (!trashed) {
      try {
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await editorReady(page).catch(() => undefined);
        const info = await invoke(page, 'deck.info').catch(() => null);
        if (info) {
          await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(() => undefined);
          const t = await invoke(page, 'deck.info').catch(() => null);
          await invoke(page, 'deck.remove', { id: deckId, baseRevision: t?.revision ?? info.revision, confirm: true }).catch(() => undefined);
        }
      } catch {
        // the 404 probe tells the truth
      }
    }
    let statusDeck = 0;
    let statusEdit = 0;
    const until = Date.now() + 25_000;
    for (;;) {
      statusDeck = (await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 })).status();
      statusEdit = (await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })).status();
      if ((statusDeck === 404 && statusEdit === 404) || Date.now() > until) break;
      await sleep(2000);
    }
    rows.push({ n: rows.length + 1, feature: 'cleanup', interaction: 'GET /deck/<id> and /edit/<id> after the delete (run 2)', result: statusDeck === 404 && statusEdit === 404 ? 'works' : 'broken', attempts: 1, evidence: `/deck ${statusDeck}, /edit ${statusEdit}`, shot: null, consoleErrors: [] });
  }
  save();
  await browser.close().catch(() => undefined);
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  console.log(`\naudit-slides run 2: ${rows.length} rows ${JSON.stringify(counts)}, ${consoleErrors.length} console errors, ${Math.round((Date.now() - started) / 1000)} s; deck ${deckId}; table ${OUT}`);
}

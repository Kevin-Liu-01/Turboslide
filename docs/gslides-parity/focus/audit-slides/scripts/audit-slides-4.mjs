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
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/focus/slides/run-4.json';
const SHOT_START = Number(process.argv[3] ?? 120);
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
      r = {
        ok: false,
        evidence: `error: ${error instanceof Error ? error.message : String(error)}`,
      };
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
        : (attempts[0]?.evidence ?? ''),
    shot: shotPath,
    consoleErrors: errs,
  };
  rows.push(entry);
  save();
  const tag =
    result === 'works'
      ? 'ok  '
      : result === 'broken'
        ? 'FAIL'
        : result === 'flaky'
          ? 'FLKY'
          : 'n/d ';
  console.log(
    `${tag} ${String(entry.n).padStart(3)} ${feature} :: ${interaction}\n       ${entry.evidence}`,
  );
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
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
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
  pollUntil(
    () => state(page),
    (s) => (s.sync?.pending ?? s.pending ?? 0) === 0,
    timeout,
  );
const connected = (page) =>
  pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    45_000,
  );
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
      ? {
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          label: el.getAttribute('aria-label'),
        }
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
      tileIds: grid
        ? [...grid.querySelectorAll('.pt-thumb')].map((t) => t.getAttribute('data-id'))
        : [],
      activeTile: grid
        ? (grid.querySelector('.pt-thumb.is-active')?.getAttribute('data-id') ?? null)
        : null,
      selectedTiles: grid ? grid.querySelectorAll('.pt-thumb.is-selected').length : 0,
      skippedTiles: grid ? grid.querySelectorAll('.pt-thumb.is-skipped').length : 0,
      filmHidden: film
        ? film.classList.contains('is-hidden') || film.getAttribute('aria-hidden') === 'true'
        : null,
      filmWidth: film ? Math.round(film.getBoundingClientRect().width) : null,
      stageShown: stage ? stage.getBoundingClientRect().width > 0 : false,
      gridPressed: document
        .querySelector('[data-control="view.gridView"]')
        ?.getAttribute('aria-pressed'),
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
  if (wrap && sheet)
    await clickAt(page, Math.max(wrap.x + 12, sheet.x - 24), sheet.y + sheet.h / 2);
  await sleep(200);
};
/** Focuses a card by clicking it, the way a person does; answers whether the card took focus. */
const focusCard = async (page, id) => {
  await clickCard(page, id);
  await pollUntil(
    () => activeSlide(page),
    (a) => a === id,
    8000,
  );
  await sleep(300);
  return page.evaluate((sid) => document.activeElement?.getAttribute('data-id') === sid, id);
};
const waitOrder = (page, test, timeout = 20_000) =>
  pollUntil(() => slideOrder(page), test, timeout);

// ---------------------------------------------------------------------------------------------
// the run: does Apply layout carry a layout's own empty placeholders and sample content into the
// next layout (run 3 rows 4 to 22)? Three fresh slides per case, the way a seller meets it.

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('dialog', (d) => d.dismiss().catch(() => undefined));
context.on('page', (p) => p.close().catch(() => undefined));
const shot = async (name, clip) => {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page
    .screenshot({ path: path.join(SHOTS, file), ...(clip ? { clip } : {}) })
    .catch(() => undefined);
  return `audit-slides/${file}`;
};
const stageClip = async () => {
  const r = await rectOf(page, '.ts-stagewrap.ts-editor');
  return r
    ? { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.w + 8, height: r.h + 8 }
    : undefined;
};
const TITLE = 'title';
const HEAD = 'heading/text';
const APPLY = '[data-control="layout.apply.plate"]';
const openLayoutPlate = async () => {
  await clearAll(page);
  if (await has(page, '[data-control="toolbar.layout"]'))
    await clickControl(page, 'toolbar.layout');
  else {
    await clickControl(page, 'toolbar.more');
    await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
    await clickControl(page, 'toolbar.more.toolbar.layout');
  }
  await page
    .locator(APPLY)
    .waitFor({ timeout: 8000 })
    .catch(() => undefined);
};
/** A fresh Title and body slide after the current one; answers its id. */
const freshSlide = async () => {
  const before = await slideOrder(page);
  await clearAll(page);
  await clickControl(page, 'toolbar.newSlide');
  const after = await waitOrder(page, (o) => o.length === before.length + 1);
  const id = after.find((x) => !before.includes(x));
  await pollUntil(
    () => activeSlide(page),
    (a) => a === id,
    8000,
  );
  await settled(page);
  return id;
};
/** Applies a layout to the current slide through the toolbar picker; answers the slide facts and the snackbar read at once. */
const applyTo = async (slideId, layout) => {
  const before = await slideJson(page, slideId);
  await openLayoutPlate();
  await clickIn(page, APPLY, `layout.apply.${layout}`);
  const sb = await pollUntil(
    () => snackbar(page),
    (v) => v !== null,
    1500,
  );
  const after = await pollUntil(
    () => slideJson(page, slideId),
    (s) => JSON.stringify(s) !== JSON.stringify(before),
    15_000,
  );
  await sleep(500);
  await settled(page);
  const st = await stageFacts(page);
  return {
    facts: layoutFacts(after),
    blocks: st?.blocks,
    runs: st?.runs ?? [],
    prompts: st?.prompts ?? [],
    text: st?.text ?? '',
    snackbar: sb,
  };
};

try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  version = await page.evaluate(() => window.turboslide.studio.describe().version ?? null);
  deckId = (await invoke(page, 'deck.info')).id;
  const r0 = await runRect(page, HEAD);
  await dblclickAt(page, r0.x + r0.w / 2, r0.y + r0.h / 2);
  await typeHuman(page, 'Q3 pipeline review for Acme');
  await press(page, 'Escape');
  await pollUntil(
    () => state(page),
    (v) => v.revision >= 1,
    30_000,
  );
  await settled(page, 30_000);
  await closeNamePrompt(page);
  await connected(page);
  console.log(`deck ${deckId}`);

  for (let trial = 1; trial <= 3; trial += 1) {
    await row(
      'Apply layout',
      `Trial ${trial}: on a fresh empty Title and body slide apply Section header, then Title and body again; count the blocks left on the slide`,
      async () => {
        const id = await freshSlide();
        const start = await stageFacts(page);
        const a = await applyTo(id, 'opener');
        const b = await applyTo(id, 'split');
        const sh = await shot(`carry-picture-${trial}`, await stageClip());
        const extra = (b.blocks ?? 0) - (start?.blocks ?? 0);
        return {
          ok: extra === 0 && b.runs.join(',') === (start?.runs ?? []).join(','),
          evidence: `fresh slide ${id}: ${start?.blocks} blocks, runs ${start?.runs.join(',')} -> Section header ${a.facts}, ${a.blocks} blocks -> Title and body ${b.facts}, ${b.blocks} blocks (${extra} more than the fresh slide), runs ${b.runs.join(',')}; snackbars ${JSON.stringify(a.snackbar)} / ${JSON.stringify(b.snackbar)}`,
          shot: sh,
        };
      },
      { tries: 1 },
    );
  }

  for (let trial = 1; trial <= 3; trial += 1) {
    await row(
      'Apply layout',
      `Trial ${trial}: on a fresh empty Title and body slide apply Ruled statement list, then Title and table; do the empty list rows stay`,
      async () => {
        const id = await freshSlide();
        const a = await applyTo(id, 'plain');
        const b = await applyTo(id, 'table');
        const sh = await shot(`carry-list-${trial}`, await stageClip());
        const carried = b.runs.filter((r) => /^list\//.test(r)).length;
        return {
          ok: carried === 0,
          evidence: `fresh slide ${id} -> Ruled statement list ${a.facts}, runs ${a.runs.join(',')} -> Title and table ${b.facts}, ${b.blocks} blocks, runs ${b.runs.join(',')}; list runs carried into the table layout ${carried}; snackbars ${JSON.stringify(a.snackbar)} / ${JSON.stringify(b.snackbar)}`,
          shot: sh,
        };
      },
      { tries: 1 },
    );
  }

  for (let trial = 1; trial <= 3; trial += 1) {
    await row(
      'Apply layout',
      `Trial ${trial}: type a title on a fresh slide, apply Main point, then Title and body; the title must come back and nothing else`,
      async () => {
        const id = await freshSlide();
        const rh = await runRect(page, 'h/text');
        await dblclickAt(page, rh.x + rh.w / 2, rh.y + rh.h / 2);
        await typeHuman(page, 'Agenda for today');
        await press(page, 'Escape');
        await settled(page);
        const typed = await stageFacts(page);
        const a = await applyTo(id, 'statement');
        const b = await applyTo(id, 'split');
        const sh = await shot(`carry-typed-${trial}`, await stageClip());
        const sj = await slideJson(page, id);
        const text = JSON.stringify(sj);
        return {
          ok:
            b.runs.join(',') === 'h/text,p1/text,p2/text' &&
            text.includes('Agenda for today') &&
            b.blocks === typed?.blocks,
          evidence: `typed slide ${typed?.blocks} blocks, text "${typed?.text.slice(0, 60)}" -> Main point ${a.facts}, runs ${a.runs.join(',')}, text "${a.text.slice(0, 60)}", snackbar ${JSON.stringify(a.snackbar)} -> Title and body ${b.facts}, ${b.blocks} blocks, runs ${b.runs.join(',')}, text "${b.text.slice(0, 80)}", title kept ${text.includes('Agenda for today')}, snackbar ${JSON.stringify(b.snackbar)}`,
          shot: sh,
        };
      },
      { tries: 1 },
    );
  }

  for (let trial = 1; trial <= 3; trial += 1) {
    await row(
      'Apply layout',
      `Trial ${trial}: apply Title slide to a fresh empty Title and body slide and read the snackbar at once`,
      async () => {
        const id = await freshSlide();
        const a = await applyTo(id, 'title');
        return {
          ok: a.snackbar === null,
          evidence: `fresh empty slide ${id} -> Title slide ${a.facts}, runs ${a.runs.join(',')}, ${a.blocks} blocks; snackbar ${JSON.stringify(a.snackbar)}`,
        };
      },
      { tries: 1 },
    );
  }

  await row(
    'Apply layout',
    'Undo after a layout change on a typed slide brings the previous layout and text back',
    async () => {
      const id = await freshSlide();
      const rh = await runRect(page, 'h/text');
      await dblclickAt(page, rh.x + rh.w / 2, rh.y + rh.h / 2);
      await typeHuman(page, 'Pricing options');
      await press(page, 'Escape');
      await settled(page);
      const before = await slideJson(page, id);
      const a = await applyTo(id, 'cols');
      await focusWorkspace(page);
      await press(page, 'Meta+z');
      const undone = await pollUntil(
        () => slideJson(page, id),
        (s) => layoutFacts(s) === layoutFacts(before),
        15_000,
      );
      await settled(page);
      return {
        ok:
          /cols/.test(a.facts) &&
          layoutFacts(undone) === layoutFacts(before) &&
          JSON.stringify(undone).includes('Pricing options'),
        evidence: `${layoutFacts(before)} -> ${a.facts} (text "${a.text.slice(0, 50)}") -> undo ${layoutFacts(undone)}, title kept ${JSON.stringify(undone).includes('Pricing options')}`,
      };
    },
  );
  await shot('end-run-4');
} catch (error) {
  rows.push({
    n: rows.length + 1,
    feature: 'the run',
    interaction: 'ran to completion',
    result: 'broken',
    attempts: 1,
    evidence: `exception outside a row: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    shot: null,
    consoleErrors: [],
  });
  save();
} finally {
  // ---- cleanup: File > Move to trash, Delete forever, a 404 on the deck
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
      rows.push({
        n: rows.length + 1,
        feature: 'cleanup',
        interaction: 'File > Move to trash, then Delete forever on /decks/trash',
        result: 'works',
        attempts: 1,
        evidence: `deck ${deckId} left the trash`,
        shot: null,
        consoleErrors: [],
      });
    } catch (error) {
      rows.push({
        n: rows.length + 1,
        feature: 'cleanup',
        interaction: 'File > Move to trash, then Delete forever on /decks/trash',
        result: 'broken',
        attempts: 1,
        evidence: `failed: ${error instanceof Error ? error.message : String(error)}; falling back to the actions API`,
        shot: null,
        consoleErrors: [],
      });
    }
    if (!trashed) {
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
          const t = await invoke(page, 'deck.info').catch(() => null);
          await invoke(page, 'deck.remove', {
            id: deckId,
            baseRevision: t?.revision ?? info.revision,
            confirm: true,
          }).catch(() => undefined);
        }
      } catch {
        // the 404 probe below tells the truth
      }
    }
    try {
      let statusDeck = 0;
      let statusEdit = 0;
      const until = Date.now() + 25_000;
      for (;;) {
        statusDeck = (
          await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 })
        ).status();
        statusEdit = (
          await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })
        ).status();
        if ((statusDeck === 404 && statusEdit === 404) || Date.now() > until) break;
        await sleep(2000);
      }
      rows.push({
        n: rows.length + 1,
        feature: 'cleanup',
        interaction: 'GET /deck/<id> and /edit/<id> after the delete',
        result: statusDeck === 404 && statusEdit === 404 ? 'works' : 'broken',
        attempts: 1,
        evidence: `/deck ${statusDeck}, /edit ${statusEdit}`,
        shot: null,
        consoleErrors: [],
      });
    } catch (error) {
      rows.push({
        n: rows.length + 1,
        feature: 'cleanup',
        interaction: 'GET /deck/<id> after the delete',
        result: 'broken',
        attempts: 1,
        evidence: `probe failed: ${error instanceof Error ? error.message : String(error)}`,
        shot: null,
        consoleErrors: [],
      });
    }
  }
  save();
  await browser.close().catch(() => undefined);
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  console.log(
    `\naudit-slides: ${rows.length} rows ${JSON.stringify(counts)}, ${consoleErrors.length} console errors, ${Math.round((Date.now() - started) / 1000)} s; deck ${deckId}; table ${OUT}`,
  );
}

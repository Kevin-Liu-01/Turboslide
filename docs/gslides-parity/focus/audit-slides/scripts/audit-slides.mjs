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
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/focus/slides/run.json';
mkdirSync(SHOTS, { recursive: true });
mkdirSync(path.dirname(OUT), { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const consoleErrors = [];
const started = Date.now();
let deckId = '';
let version = null;
let shotN = 0;
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
// the run

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: false,
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
let contentSlide = ''; // the slide the 21 layouts are applied to

try {
  // ---- 0. the slide the seller lands on
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  version = await page.evaluate(() => {
    const d = window.turboslide.studio.describe();
    return d.version ?? d.build ?? null;
  });
  deckId = (await invoke(page, 'deck.info')).id;

  await row(
    'New slide template',
    'Open /new and look at the slide the deck opens on, the filmstrip, the counter, the notes pane and the address',
    async () => {
      const order = await slideOrder(page);
      const st = await stageFacts(page);
      const cs = await cards(page);
      const ct = await counter(page);
      const nt = await notesFacts(page);
      const s = await state(page);
      const title = await page.evaluate(
        () =>
          document.querySelector(
            '[data-control="title.name"], .ts-title-name, input[aria-label*="itle"]',
          )?.value ?? document.title,
      );
      const sh = await shot('new-landing');
      const ok =
        order.length === 1 &&
        st !== null &&
        st.runs.includes(HEAD) &&
        st.prompts.length >= 1 &&
        cs.length === 1 &&
        cs[0].current;
      return {
        ok,
        evidence: `deck ${deckId}; slides ${order.join(',')}; runs ${st?.runs.join(',')}; prompts "${st?.prompts.join('" / "')}"; cards ${cardsBrief(cs)}; counter ${JSON.stringify(ct)}; notes ${nt.present ? `present, height ${nt.height}, placeholder "${nt.placeholder}"` : 'absent'}; hash "${await hashOf(page)}"; url ${page.url().replace(BASE, '')}; connected ${s.sync?.connected}; title "${title}"; version ${version}`,
        shot: sh,
      };
    },
    { tries: 1 },
  );

  await row(
    'New slide template',
    'Double click the title placeholder and type a title with spaces, then Escape',
    async () => {
      const r = await runRect(page, HEAD);
      if (!r) return { ok: false, evidence: 'no heading run' };
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const editing = await page.evaluate(() =>
        document
          .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]')
          ?.getAttribute('contenteditable'),
      );
      await typeHuman(page, 'Q3 pipeline review for Acme');
      await sleep(600);
      await press(page, 'Escape');
      const s = await pollUntil(
        () => state(page),
        (v) => v.revision >= 1,
        30_000,
      );
      await settled(page, 30_000);
      await closeNamePrompt(page);
      const text = await runText(page, HEAD);
      const stored = (await slideJson(page, TITLE)).heading ?? '';
      return {
        ok:
          editing === 'true' &&
          text === 'Q3 pipeline review for Acme' &&
          /\/edit\//.test(page.url()) &&
          String(stored).includes('Q3 pipeline review for Acme'),
        evidence: `contenteditable ${editing}; shown "${text}"; stored "${stored}"; revision ${s.revision}; url ${page.url().replace(BASE, '')}; hash "${await hashOf(page)}"`,
      };
    },
    { tries: 2 },
  );
  await connected(page);

  // ---- 1. New slide
  await row('New slide', 'Click New slide in the toolbar', async () => {
    const before = await slideOrder(page);
    const cur = await activeSlide(page);
    await clearAll(page);
    await clickControl(page, 'toolbar.newSlide');
    const after = await waitOrder(page, (o) => o.length === before.length + 1);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === added,
      8000,
    );
    await sleep(400);
    const st = await stageFacts(page);
    const sj = added ? await slideJson(page, added) : {};
    await settled(page);
    if (!contentSlide && added) contentSlide = added;
    const sh = await shot('new-slide-toolbar');
    return {
      ok:
        after.length === before.length + 1 &&
        active === added &&
        after.indexOf(added) === before.indexOf(cur) + 1,
      evidence: `current ${cur}; ${before.length} -> ${after.length}; new ${added} at index ${after.indexOf(added)}; active ${active}; layout ${layoutFacts(sj)}; prompts "${st?.prompts.join('" / "')}"; runs ${st?.runs.join(',')}; counter ${JSON.stringify(await counter(page))}`,
      shot: sh,
    };
  });

  await row(
    'New slide',
    'Click the arrow beside New slide (New slide with layout) and pick Title and two columns',
    async () => {
      const before = await slideOrder(page);
      await clearAll(page);
      await clickControl(page, 'toolbar.newSlide.arrow');
      const plate = '[data-control="layout.new.plate"]';
      await page
        .locator(plate)
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      const shown = await has(page, plate);
      const tiles = (await plateTiles(page, plate)) ?? [];
      const sh = await shot('new-slide-arrow-plate');
      if (!shown)
        return { ok: false, evidence: 'the New slide with layout plate did not open', shot: sh };
      await clickIn(page, plate, 'layout.new.cols');
      const after = await waitOrder(page, (o) => o.length === before.length + 1);
      const added = after.find((id) => !before.includes(id)) ?? '';
      const active = await pollUntil(
        () => activeSlide(page),
        (a) => a === added,
        8000,
      );
      await sleep(400);
      const sj = added ? await slideJson(page, added) : {};
      const st = await stageFacts(page);
      const gone = !(await has(page, plate));
      await settled(page);
      return {
        ok:
          shown &&
          tiles.length >= 21 &&
          after.length === before.length + 1 &&
          active === added &&
          /cols/.test(layoutFacts(sj)) &&
          gone,
        evidence: `plate shown ${shown}, tiles ${tiles.length}, missing ${
          tiles
            .filter((t) => t.missing)
            .map((t) => t.id)
            .join(',') || 'none'
        }; ${before.length} -> ${after.length}; new ${added}; active ${active}; layout ${layoutFacts(sj)}; prompts "${st?.prompts.join('" / "')}"; plate closed after the pick ${gone}`,
        shot: sh,
      };
    },
  );

  await row('New slide', 'Slide menu > New slide', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await openMenu(page, 'slide');
    const rs = await rowState(page, menuRoot('slide'), 'menu.slide.newSlide');
    await clickIn(page, menuRoot('slide'), 'menu.slide.newSlide');
    const after = await waitOrder(page, (o) => o.length === before.length + 1);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === added,
      8000,
    );
    const sj = added ? await slideJson(page, added) : {};
    await settled(page);
    return {
      ok: after.length === before.length + 1 && active === added,
      evidence: `row ${JSON.stringify(rs)}; ${before.length} -> ${after.length}; new ${added}; active ${active}; layout ${layoutFacts(sj)}`,
    };
  });

  await row(
    'New slide',
    'Press Ctrl+M with a filmstrip card focused (Google prints Ctrl+M on every platform)',
    async () => {
      const before = await slideOrder(page);
      const focused = await focusCard(page, before[before.length - 1]);
      await press(page, 'Control+m');
      const after = await waitOrder(page, (o) => o.length === before.length + 1, 15_000);
      const added = after.find((id) => !before.includes(id)) ?? '';
      const active = await pollUntil(
        () => activeSlide(page),
        (a) => a === added,
        8000,
      );
      await settled(page);
      return {
        ok: focused && after.length === before.length + 1 && active === added,
        evidence: `card focused ${focused}; ${before.length} -> ${after.length}; new ${added}; active ${active}`,
      };
    },
  );

  await row('New slide', 'Press Ctrl+M with the canvas focused and nothing selected', async () => {
    const before = await slideOrder(page);
    await focusWorkspace(page);
    const focus = await activeDesc(page);
    await press(page, 'Control+m');
    const after = await waitOrder(page, (o) => o.length === before.length + 1, 15_000);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === added,
      8000,
    );
    await settled(page);
    return {
      ok: after.length === before.length + 1 && active === added,
      evidence: `focus before ${focus}; ${before.length} -> ${after.length}; new ${added}; active ${active}`,
    };
  });

  await row(
    'New slide',
    'Press Cmd+M with a filmstrip card focused (the Mac chord the brief names; the product binds Ctrl+M)',
    async () => {
      const before = await slideOrder(page);
      const focused = await focusCard(page, before[before.length - 1]);
      await press(page, 'Meta+m');
      const after = await waitOrder(page, (o) => o.length === before.length + 1, 6000);
      const sb = await snackbar(page);
      await settled(page);
      return {
        ok: after.length === before.length + 1,
        evidence: `card focused ${focused}; ${before.length} -> ${after.length} after 6 s; snackbar ${JSON.stringify(sb)}`,
      };
    },
    { tries: 2 },
  );

  await row('New slide', 'Right click a filmstrip card and pick New slide', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await openCardMenu(page, before[0]);
    const items = await page.evaluate(
      (c) =>
        [...document.querySelectorAll(`${c} [data-control^="menu."]`)].map((el) =>
          el.getAttribute('data-control').replace(/^menu\./, ''),
        ),
      CTX,
    );
    const sh = await shot('filmstrip-context-menu');
    await clickIn(page, CTX, 'menu.slide.newSlide');
    const after = await waitOrder(page, (o) => o.length === before.length + 1);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === added,
      8000,
    );
    await settled(page);
    return {
      ok: after.length === before.length + 1 && after.indexOf(added) === 1 && active === added,
      evidence: `menu rows ${items.join(',')}; ${before.length} -> ${after.length}; new ${added} at index ${after.indexOf(added)} (after the clicked first card); active ${active}`,
      shot: sh,
    };
  });

  await row('New slide', 'Undo a New slide with Cmd+Z (a card focused)', async () => {
    const before = await slideOrder(page);
    const focused = await focusCard(page, before[before.length - 1]);
    await press(page, 'Control+m');
    const mid = await waitOrder(page, (o) => o.length === before.length + 1);
    await settled(page);
    await press(page, 'Meta+z');
    const after = await waitOrder(page, (o) => o.length === before.length);
    await settled(page);
    return {
      ok: focused && mid.length === before.length + 1 && after.join(',') === before.join(','),
      evidence: `focused ${focused}; ${before.length} -> ${mid.length} -> ${after.length}; order restored ${after.join(',') === before.join(',')}; focus after ${await activeDesc(page)}`,
    };
  });

  // ---- 2. Duplicate
  await row('Duplicate slide', 'Right click the title card and pick Duplicate slide', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await openCardMenu(page, TITLE);
    await clickIn(page, CTX, 'menu.slide.duplicateSlide');
    const after = await waitOrder(page, (o) => o.length === before.length + 1);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const copy = added ? await slideJson(page, added) : {};
    const src = await slideJson(page, TITLE);
    await settled(page);
    return {
      ok:
        after.length === before.length + 1 &&
        after.indexOf(added) === 1 &&
        copy.heading === src.heading,
      evidence: `${before.length} -> ${after.length}; copy ${added} at index ${after.indexOf(added)}; copy heading "${copy.heading}" vs source "${src.heading}"; active ${await activeSlide(page)}`,
    };
  });

  await row('Duplicate slide', 'Slide menu > Duplicate slide', async () => {
    const before = await slideOrder(page);
    const cur = await activeSlide(page);
    await clearAll(page);
    await openMenu(page, 'slide');
    const rs = await rowState(page, menuRoot('slide'), 'menu.slide.duplicateSlide');
    await clickIn(page, menuRoot('slide'), 'menu.slide.duplicateSlide');
    const after = await waitOrder(page, (o) => o.length === before.length + 1);
    const added = after.find((id) => !before.includes(id)) ?? '';
    await settled(page);
    return {
      ok: after.length === before.length + 1 && after.indexOf(added) === before.indexOf(cur) + 1,
      evidence: `row ${JSON.stringify(rs)}; current ${cur}; ${before.length} -> ${after.length}; copy ${added} at index ${after.indexOf(added)}`,
    };
  });

  await row('Duplicate slide', 'Press Cmd+D with a filmstrip card focused', async () => {
    const before = await slideOrder(page);
    const target = before[1];
    const focused = await focusCard(page, target);
    await press(page, 'Meta+d');
    const after = await waitOrder(page, (o) => o.length === before.length + 1, 15_000);
    const added = after.find((id) => !before.includes(id)) ?? '';
    const sb = await snackbar(page);
    await settled(page);
    return {
      ok:
        focused &&
        after.length === before.length + 1 &&
        after.indexOf(added) === before.indexOf(target) + 1,
      evidence: `focused ${focused}; ${before.length} -> ${after.length}; copy ${added} at index ${after.indexOf(added)}; snackbar ${JSON.stringify(sb)}`,
    };
  });

  await row('Duplicate slide', 'Undo a duplicate with the toolbar Undo button', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await openCardMenu(page, before[0]);
    await clickIn(page, CTX, 'menu.slide.duplicateSlide');
    const mid = await waitOrder(page, (o) => o.length === before.length + 1);
    await settled(page);
    await clickControl(page, 'toolbar.undo');
    const after = await waitOrder(page, (o) => o.length === before.length);
    await settled(page);
    return {
      ok: mid.length === before.length + 1 && after.join(',') === before.join(','),
      evidence: `${before.length} -> ${mid.length} -> ${after.length}; order restored ${after.join(',') === before.join(',')}`,
    };
  });

  await row(
    'Duplicate slide',
    'Undo a duplicate with Cmd+Z, then Redo with Cmd+Shift+Z',
    async () => {
      const before = await slideOrder(page);
      const focused = await focusCard(page, before[1]);
      await press(page, 'Meta+d');
      const mid = await waitOrder(page, (o) => o.length === before.length + 1);
      await settled(page);
      await press(page, 'Meta+z');
      const undone = await waitOrder(page, (o) => o.length === before.length);
      await settled(page);
      await press(page, 'Meta+Shift+z');
      const redone = await waitOrder(page, (o) => o.length === before.length + 1);
      await settled(page);
      // leave the deck as it was
      await press(page, 'Meta+z');
      const after = await waitOrder(page, (o) => o.length === before.length);
      await settled(page);
      return {
        ok:
          focused &&
          mid.length === before.length + 1 &&
          undone.join(',') === before.join(',') &&
          redone.length === before.length + 1 &&
          after.join(',') === before.join(','),
        evidence: `focused ${focused}; ${before.length} -> ${mid.length} -> undo ${undone.length} -> redo ${redone.length} -> undo ${after.length}`,
      };
    },
  );

  // ---- 3. Delete
  await row('Delete slide', 'Press Delete with a filmstrip card focused', async () => {
    const before = await slideOrder(page);
    const target = before[before.length - 1];
    const focused = await focusCard(page, target);
    await press(page, 'Delete');
    const after = await waitOrder(page, (o) => o.length === before.length - 1);
    const sb = await pollUntil(
      () => snackbar(page),
      (v) => v !== null,
      4000,
    );
    const sh = await shot('delete-snackbar');
    await settled(page);
    return {
      ok:
        focused &&
        after.length === before.length - 1 &&
        !after.includes(target) &&
        sb !== null &&
        /deleted/i.test(sb.text) &&
        sb.action === 'Undo',
      evidence: `focused ${focused}; ${before.length} -> ${after.length}; removed ${target} gone ${!after.includes(target)}; snackbar ${JSON.stringify(sb)}; active ${await activeSlide(page)}; focus ${await activeDesc(page)}`,
      shot: sh,
    };
  });

  await row('Delete slide', 'Undo a delete with the snackbar Undo button', async () => {
    const before = await slideOrder(page);
    const target = before[before.length - 1];
    const head = (await slideJson(page, target)).heading;
    await focusCard(page, target);
    await press(page, 'Delete');
    const mid = await waitOrder(page, (o) => o.length === before.length - 1);
    const sb = await pollUntil(
      () => snackbar(page),
      (v) => v !== null && v.action !== null,
      4000,
    );
    if (!sb || sb.action === null)
      return {
        ok: false,
        evidence: `no Undo on the snackbar: ${JSON.stringify(sb)}; ${before.length} -> ${mid.length}`,
      };
    await clickControl(page, 'snackbar.action');
    const after = await waitOrder(page, (o) => o.length === before.length);
    await settled(page);
    const back = after.includes(target) ? (await slideJson(page, target)).heading : undefined;
    return {
      ok: mid.length === before.length - 1 && after.join(',') === before.join(',') && back === head,
      evidence: `${before.length} -> ${mid.length} -> ${after.length}; snackbar "${sb.text}" [${sb.action}]; ${target} back at index ${after.indexOf(target)} (was ${before.indexOf(target)}); heading kept ${back === head}`,
    };
  });

  await row('Delete slide', 'Right click a card and pick Delete', async () => {
    const before = await slideOrder(page);
    const target = before[before.length - 1];
    await clearAll(page);
    await openCardMenu(page, target);
    const rs = await rowState(page, CTX, 'menu.edit.delete');
    await clickIn(page, CTX, 'menu.edit.delete');
    const after = await waitOrder(page, (o) => o.length === before.length - 1);
    const sb = await pollUntil(
      () => snackbar(page),
      (v) => v !== null,
      4000,
    );
    await settled(page);
    return {
      ok: after.length === before.length - 1 && !after.includes(target),
      evidence: `row ${JSON.stringify(rs)}; ${before.length} -> ${after.length}; ${target} gone ${!after.includes(target)}; snackbar ${JSON.stringify(sb)}`,
    };
  });

  await row('Delete slide', 'Undo a delete with Cmd+Z', async () => {
    const before = await slideOrder(page);
    const target = before[before.length - 1];
    await clearAll(page);
    await openCardMenu(page, target);
    await clickIn(page, CTX, 'menu.edit.delete');
    const mid = await waitOrder(page, (o) => o.length === before.length - 1);
    await settled(page);
    await press(page, 'Meta+z');
    const after = await waitOrder(page, (o) => o.length === before.length);
    await settled(page);
    return {
      ok: mid.length === before.length - 1 && after.join(',') === before.join(','),
      evidence: `${before.length} -> ${mid.length} -> ${after.length}; order restored ${after.join(',') === before.join(',')}; focus before Cmd+Z ${await activeDesc(page)}`,
    };
  });

  await row(
    'Delete slide',
    'Slide menu > Delete slide, then the toolbar Undo, then Redo from the Edit menu',
    async () => {
      const before = await slideOrder(page);
      const target = before[before.length - 1];
      await clickCard(page, target);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === target,
        8000,
      );
      await clearAll(page);
      await openMenu(page, 'slide');
      const rs = await rowState(page, menuRoot('slide'), 'menu.slide.deleteSlide');
      await clickIn(page, menuRoot('slide'), 'menu.slide.deleteSlide');
      const mid = await waitOrder(page, (o) => o.length === before.length - 1);
      await settled(page);
      await clickControl(page, 'toolbar.undo');
      const undone = await waitOrder(page, (o) => o.length === before.length);
      await settled(page);
      await openMenu(page, 'edit');
      const redoRow = await rowState(page, menuRoot('edit'), 'menu.edit.redo');
      await clickIn(page, menuRoot('edit'), 'menu.edit.redo');
      const redone = await waitOrder(page, (o) => o.length === before.length - 1);
      await settled(page);
      return {
        ok:
          mid.length === before.length - 1 &&
          !mid.includes(target) &&
          undone.join(',') === before.join(',') &&
          redone.length === before.length - 1,
        evidence: `row ${JSON.stringify(rs)}; ${before.length} -> ${mid.length} -> undo ${undone.length} (restored ${undone.join(',') === before.join(',')}) -> redo ${JSON.stringify(redoRow)} ${redone.length}`,
      };
    },
  );

  // ---- 4. selection
  await row('Filmstrip selection', 'Click the second card', async () => {
    const order = await slideOrder(page);
    await clearAll(page);
    await clickCard(page, order[1]);
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === order[1],
      8000,
    );
    await sleep(500);
    const cs = await cards(page);
    const ct = await counter(page);
    const h = await hashOf(page);
    const st = await stageFacts(page);
    const sj = await slideJson(page, order[1]);
    return {
      ok:
        active === order[1] &&
        cs
          .filter((c) => c.current)
          .map((c) => c.id)
          .join() === order[1] &&
        cs.filter((c) => c.selected).length === 1 &&
        h === `#s/${encodeURIComponent(order[1])}`,
      evidence: `active ${active}; cards ${cardsBrief(cs)} (* current, + selected, @ focused); counter ${JSON.stringify(ct)}; hash "${h}"; stage layout ${layoutFacts(sj)} text "${st?.text.slice(0, 60)}"`,
    };
  });

  await row(
    'Filmstrip selection',
    'Shift click the fourth card, then Cmd click the first',
    async () => {
      const order = await slideOrder(page);
      if (order.length < 4) return { ok: false, evidence: `only ${order.length} slides` };
      await clickCard(page, order[1]);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === order[1],
        8000,
      );
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
        ok:
          sel(shifted).join() === order.slice(1, 4).join() &&
          sel(meta).join() === order.slice(0, 4).join() &&
          sel(single).join() === order[0],
        evidence: `after Shift click ${cardsBrief(shifted)}; after Cmd click ${cardsBrief(meta)}; after a plain click ${cardsBrief(single)}; active ${await activeSlide(page)}`,
        shot: sh,
      };
    },
  );

  await row(
    'Filmstrip selection',
    'Arrow down and arrow up with a card focused, then Shift+Down to extend',
    async () => {
      const order = await slideOrder(page);
      const focused = await focusCard(page, order[0]);
      await press(page, 'ArrowDown');
      const down = await pollUntil(
        () => activeSlide(page),
        (a) => a === order[1],
        6000,
      );
      const focusDown = await activeDesc(page);
      await press(page, 'ArrowUp');
      const up = await pollUntil(
        () => activeSlide(page),
        (a) => a === order[0],
        6000,
      );
      await press(page, 'Shift+ArrowDown');
      await sleep(500);
      const ext = await cards(page);
      await press(page, 'Shift+ArrowDown');
      await sleep(500);
      const ext2 = await cards(page);
      const sel = (cs) => cs.filter((c) => c.selected).map((c) => c.id);
      await clickCard(page, order[0]);
      return {
        ok:
          focused &&
          down === order[1] &&
          up === order[0] &&
          sel(ext).join() === order.slice(0, 2).join() &&
          sel(ext2).join() === order.slice(0, 3).join(),
        evidence: `focused ${focused}; Down -> ${down} (focus ${focusDown}); Up -> ${up}; Shift+Down ${cardsBrief(ext)}; Shift+Down again ${cardsBrief(ext2)}`,
      };
    },
  );

  await row(
    'Delete slide',
    'Select two cards with Shift click, press Delete, then Undo from the snackbar',
    async () => {
      const before = await slideOrder(page);
      if (before.length < 4) return { ok: false, evidence: `only ${before.length} slides` };
      const a = before[before.length - 2];
      const b = before[before.length - 1];
      await clickCard(page, a);
      await pollUntil(
        () => activeSlide(page),
        (x) => x === a,
        8000,
      );
      await clickCard(page, b, { modifiers: ['Shift'] });
      await sleep(400);
      const focused = await page.evaluate(() =>
        document.activeElement?.classList.contains('ts-card'),
      );
      await press(page, 'Delete');
      const mid = await waitOrder(page, (o) => o.length === before.length - 2);
      const sb = await pollUntil(
        () => snackbar(page),
        (v) => v !== null && v.action !== null,
        4000,
      );
      if (!sb || sb.action === null)
        return {
          ok: false,
          evidence: `${before.length} -> ${mid.length}; snackbar ${JSON.stringify(sb)}`,
        };
      await clickControl(page, 'snackbar.action');
      const after = await waitOrder(page, (o) => o.length === before.length);
      await settled(page);
      return {
        ok: mid.length === before.length - 2 && after.join(',') === before.join(','),
        evidence: `focused card ${focused}; ${before.length} -> ${mid.length} (snackbar "${sb.text}") -> ${after.length}; order restored ${after.join(',') === before.join(',')}`,
      };
    },
  );

  // ---- 5. reorder
  await row('Reorder slides', 'Drag the second filmstrip card above the first', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    const a = await cardRect(page, before[1]);
    const b = await cardRect(page, before[0]);
    if (!a || !b) return { ok: false, evidence: 'no card rects' };
    await dragCard(page, center(a), { x: b.x + b.w / 2, y: b.y + 6 });
    const after = await waitOrder(page, (o) => o[0] === before[1], 12_000);
    await settled(page);
    const sh = await shot('reorder-after-drag');
    return {
      ok: after[0] === before[1] && after[1] === before[0] && after.length === before.length,
      evidence: `${before.join(',')} -> ${after.join(',')}; cards ${cardsBrief(await cards(page))}`,
      shot: sh,
    };
  });

  await row('Reorder slides', 'Drag the first filmstrip card below the third', async () => {
    const before = await slideOrder(page);
    if (before.length < 3) return { ok: false, evidence: 'fewer than three slides' };
    await clearAll(page);
    const a = await cardRect(page, before[0]);
    const b = await cardRect(page, before[2]);
    if (!a || !b) return { ok: false, evidence: 'no card rects' };
    await dragCard(page, center(a), { x: b.x + b.w / 2, y: b.y + b.h - 6 });
    const after = await waitOrder(page, (o) => o[2] === before[0], 12_000);
    await settled(page);
    return {
      ok: after[2] === before[0] && after[0] === before[1] && after[1] === before[2],
      evidence: `${before.join(',')} -> ${after.join(',')}`,
    };
  });

  await row('Reorder slides', 'Press Cmd+Down then Cmd+Up with a card focused', async () => {
    const before = await slideOrder(page);
    const target = before[1];
    const focused = await focusCard(page, target);
    await press(page, 'Meta+ArrowDown');
    const down = await waitOrder(page, (o) => o.indexOf(target) === 2, 12_000);
    await settled(page);
    const focusMid = await activeDesc(page);
    await press(page, 'Meta+ArrowUp');
    const up = await waitOrder(page, (o) => o.indexOf(target) === 1, 12_000);
    await settled(page);
    return {
      ok: focused && down.indexOf(target) === 2 && up.join(',') === before.join(','),
      evidence: `focused ${focused}; ${before.join(',')} -> Cmd+Down ${down.join(',')} (focus ${focusMid}) -> Cmd+Up ${up.join(',')}`,
    };
  });

  await row(
    'Reorder slides',
    'Slide menu > Move slide > Move slide to end, then Cmd+Z',
    async () => {
      const before = await slideOrder(page);
      const target = before[1];
      await clickCard(page, target);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === target,
        8000,
      );
      await clearAll(page);
      await openMenu(page, 'slide');
      await hoverIn(
        page,
        menuRoot('slide'),
        'menu.slide.moveSlide',
        '[data-control="menu.slide.moveSlide.toEnd"]',
      );
      const rs = await rowState(page, 'body', 'menu.slide.moveSlide.toEnd');
      await clickControl(page, 'menu.slide.moveSlide.toEnd');
      const moved = await waitOrder(page, (o) => o[o.length - 1] === target, 12_000);
      await settled(page);
      await press(page, 'Meta+z');
      const after = await waitOrder(page, (o) => o.join(',') === before.join(','), 12_000);
      await settled(page);
      return {
        ok: moved[moved.length - 1] === target && after.join(',') === before.join(','),
        evidence: `row ${JSON.stringify(rs)}; ${before.join(',')} -> ${moved.join(',')} -> undo ${after.join(',')}`,
      };
    },
  );

  await row('Reorder slides', 'Undo a drag reorder with Cmd+Z', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    const a = await cardRect(page, before[1]);
    const b = await cardRect(page, before[0]);
    if (!a || !b) return { ok: false, evidence: 'no card rects' };
    await dragCard(page, center(a), { x: b.x + b.w / 2, y: b.y + 6 });
    const mid = await waitOrder(page, (o) => o[0] === before[1], 12_000);
    await settled(page);
    await press(page, 'Meta+z');
    const after = await waitOrder(page, (o) => o.join(',') === before.join(','), 12_000);
    await settled(page);
    return {
      ok: mid[0] === before[1] && after.join(',') === before.join(','),
      evidence: `${before.join(',')} -> ${mid.join(',')} -> undo ${after.join(',')}; focus at Cmd+Z ${await activeDesc(page)}`,
    };
  });

  // ---- 6. the layout picker
  /** Opens the toolbar's Layout plate (through More when the tail folded it); answers the route. */
  const openLayoutPlate = async () => {
    await clearAll(page);
    let via = 'toolbar.layout';
    if (await has(page, '[data-control="toolbar.layout"]'))
      await clickControl(page, 'toolbar.layout');
    else {
      await clickControl(page, 'toolbar.more');
      await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
      await clickControl(page, 'toolbar.more.toolbar.layout');
      via = 'toolbar.more.toolbar.layout';
    }
    await page
      .locator('[data-control="layout.apply.plate"]')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    return via;
  };
  const APPLY = '[data-control="layout.apply.plate"]';
  if (!contentSlide) contentSlide = (await slideOrder(page)).find((id) => id !== TITLE) ?? TITLE;

  await row(
    'Layout picker',
    'Click Layout in the toolbar; the picker opens ringing the current layout; Escape closes it',
    async () => {
      await clickCard(page, contentSlide);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === contentSlide,
        8000,
      );
      const via = await openLayoutPlate();
      const shown = await has(page, APPLY);
      const tiles = (await plateTiles(page, APPLY)) ?? [];
      const sj = await slideJson(page, contentSlide);
      const sh = await shot('layout-picker-open');
      await press(page, 'Escape');
      await sleep(400);
      const gone = !(await has(page, APPLY));
      if (!gone) await closeMenus(page);
      return {
        ok: shown && tiles.length === 21 && tiles.filter((t) => t.current).length === 1 && gone,
        evidence: `via ${via}; shown ${shown}; tiles ${tiles.length} [${tiles.map((t) => t.id).join(',')}]; ringed ${
          tiles
            .filter((t) => t.current)
            .map((t) => t.id)
            .join(',') || 'none'
        } (slide ${layoutFacts(sj)}); missing ${
          tiles
            .filter((t) => t.missing)
            .map((t) => t.id)
            .join(',') || 'none'
        }; gone after Escape ${gone}`,
        shot: sh,
      };
    },
  );

  // every layout, applied to the content slide through the toolbar picker
  let previous = null;
  const firstTiles = await (async () => {
    await openLayoutPlate();
    const t = (await plateTiles(page, APPLY)) ?? [];
    await press(page, 'Escape');
    await sleep(300);
    return t;
  })();
  for (const tile of firstTiles) {
    await row(
      'Apply layout',
      `Apply the layout "${tile.label}" (${tile.id}) from the toolbar picker to slide ${contentSlide}`,
      async () => {
        await clickCard(page, contentSlide);
        await pollUntil(
          () => activeSlide(page),
          (a) => a === contentSlide,
          8000,
        );
        const before = await slideJson(page, contentSlide);
        await openLayoutPlate();
        const tiles = (await plateTiles(page, APPLY)) ?? [];
        const ringed =
          tiles
            .filter((t) => t.current)
            .map((t) => t.id)
            .join(',') || 'none';
        const ringNote = previous
          ? `; picker rings ${ringed} after the previous apply of ${previous}`
          : '';
        const me = tiles.find((t) => t.id === tile.id);
        if (!me) {
          await press(page, 'Escape');
          return {
            ok: false,
            evidence: `no tile ${tile.id} among ${tiles.map((t) => t.id).join(',')}`,
          };
        }
        if (me.missing) {
          await press(page, 'Escape');
          await sleep(300);
          return {
            ok: false,
            notDriven: true,
            evidence: `the tile reads "Add a picture first" (is-missing); a click opens the file picker, so it was not clicked${ringNote}`,
          };
        }
        await clickIn(page, APPLY, `layout.apply.${tile.id}`);
        const changed = await pollUntil(
          () => slideJson(page, contentSlide),
          (s) =>
            JSON.stringify(s) !== JSON.stringify(before) || layoutFacts(before).includes(tile.id),
          15_000,
        );
        await sleep(600);
        await settled(page);
        const st = await stageFacts(page);
        const sb = await snackbar(page);
        const gone = !(await has(page, APPLY));
        const sh = await shot(`layout-${tile.id}`, await stageClip());
        previous = tile.id;
        const facts = layoutFacts(changed);
        const matches = facts.includes(tile.id) || (tile.id === 'blank' && /freeform/.test(facts));
        return {
          ok: gone && (matches || JSON.stringify(changed) !== JSON.stringify(before)),
          evidence: `slide ${layoutFacts(before)} -> ${facts}${matches ? '' : ' (id not in the facts)'}; runs ${st?.runs.join(',') || 'none'}; prompts "${st?.prompts.join('" / "')}"; blocks ${st?.blocks}; snackbar ${JSON.stringify(sb)}; plate closed ${gone}${ringNote}`,
          shot: sh,
        };
      },
      { tries: 2 },
    );
  }
  await row(
    'Apply layout',
    'Reopen the picker after the last apply and read which tile is ringed',
    async () => {
      await openLayoutPlate();
      const tiles = (await plateTiles(page, APPLY)) ?? [];
      const ringed =
        tiles
          .filter((t) => t.current)
          .map((t) => t.id)
          .join(',') || 'none';
      await press(page, 'Escape');
      await sleep(300);
      return { ok: ringed === previous, evidence: `ringed ${ringed}; last applied ${previous}` };
    },
    { tries: 1 },
  );

  await row('Apply layout', 'Right click a card > Apply layout > Title and body', async () => {
    await clearAll(page);
    await openCardMenu(page, contentSlide);
    await hoverIn(page, CTX, 'menu.slide.applyLayout');
    await sleep(300);
    const asRows = await has(page, `${CTX} [data-control="menu.slide.applyLayout.split"]`);
    const asTiles = await has(page, `[data-control="layout.apply.split"]`);
    const sh = await shot('context-apply-layout');
    const before = await slideJson(page, contentSlide);
    if (asRows) await clickIn(page, CTX, 'menu.slide.applyLayout.split');
    else if (asTiles) await clickControl(page, 'layout.apply.split');
    else {
      await closeMenus(page);
      return {
        ok: false,
        evidence: 'the Apply layout submenu showed neither rows nor tiles',
        shot: sh,
      };
    }
    const after = await pollUntil(
      () => slideJson(page, contentSlide),
      (s) => /split/.test(layoutFacts(s)),
      15_000,
    );
    await settled(page);
    const gone = !(await has(page, CTX));
    return {
      ok: /split/.test(layoutFacts(after)) && gone,
      evidence: `submenu as ${asRows ? 'rows' : asTiles ? 'tiles' : 'nothing'}; ${layoutFacts(before)} -> ${layoutFacts(after)}; menu closed ${gone}`,
      shot: sh,
    };
  });

  await row(
    'Apply layout',
    'Slide menu > Apply layout > Title and two columns, then Cmd+Z',
    async () => {
      await clearAll(page);
      const before = await slideJson(page, contentSlide);
      await openMenu(page, 'slide');
      await hoverIn(page, menuRoot('slide'), 'menu.slide.applyLayout');
      await sleep(400);
      const asTiles = await has(page, '[data-control="layout.apply.cols"]');
      const asRows = await has(page, '[data-control="menu.slide.applyLayout.cols"]');
      const sh = await shot('menu-apply-layout');
      if (asTiles) await clickControl(page, 'layout.apply.cols');
      else if (asRows) await clickControl(page, 'menu.slide.applyLayout.cols');
      else {
        await closeMenus(page);
        return {
          ok: false,
          evidence: 'the Apply layout submenu showed neither tiles nor rows',
          shot: sh,
        };
      }
      const after = await pollUntil(
        () => slideJson(page, contentSlide),
        (s) => /cols/.test(layoutFacts(s)),
        15_000,
      );
      await settled(page);
      await focusWorkspace(page);
      await press(page, 'Meta+z');
      const undone = await pollUntil(
        () => slideJson(page, contentSlide),
        (s) => layoutFacts(s) === layoutFacts(before),
        15_000,
      );
      await settled(page);
      return {
        ok: /cols/.test(layoutFacts(after)) && layoutFacts(undone) === layoutFacts(before),
        evidence: `submenu as ${asTiles ? 'tiles' : 'rows'}; ${layoutFacts(before)} -> ${layoutFacts(after)} -> undo ${layoutFacts(undone)}`,
        shot: sh,
      };
    },
  );

  // ---- 7. skip slide
  await row(
    'Skip slide',
    'Right click a card > Skip slide; the card fades with the eye glyph; the row then reads Unskip slide',
    async () => {
      const order = await slideOrder(page);
      const target = order[order.length - 1];
      await clearAll(page);
      await openCardMenu(page, target);
      const rs = await rowState(page, CTX, 'menu.slide.skipSlide');
      await clickIn(page, CTX, 'menu.slide.skipSlide');
      const sj = await pollUntil(
        () => slideJson(page, target),
        (s) => s.skip === true,
        15_000,
      );
      await sleep(400);
      const cs = (await cards(page)).find((c) => c.id === target);
      const sh = await shot('skip-slide');
      await openCardMenu(page, target);
      const rs2 = await rowState(page, CTX, 'menu.slide.skipSlide');
      await closeMenus(page);
      await settled(page);
      return {
        ok:
          sj.skip === true &&
          cs?.skipped === true &&
          cs?.glyph === true &&
          /unskip/i.test(rs2.label ?? ''),
        evidence: `row before "${rs.label}"; slide.skip ${sj.skip}; card ${JSON.stringify(cs)}; row after "${rs2.label}"; counter ${JSON.stringify(await counter(page))}`,
        shot: sh,
      };
    },
  );

  await row('Skip slide', 'Slide menu > Unskip slide on the skipped slide', async () => {
    const order = await slideOrder(page);
    const target = order[order.length - 1];
    await clickCard(page, target);
    await pollUntil(
      () => activeSlide(page),
      (a) => a === target,
      8000,
    );
    await clearAll(page);
    const before = await slideJson(page, target);
    await openMenu(page, 'slide');
    const rs = await rowState(page, menuRoot('slide'), 'menu.slide.skipSlide');
    await clickIn(page, menuRoot('slide'), 'menu.slide.skipSlide');
    const sj = await pollUntil(
      () => slideJson(page, target),
      (s) => s.skip !== before.skip,
      15_000,
    );
    await sleep(400);
    const cs = (await cards(page)).find((c) => c.id === target);
    await settled(page);
    return {
      ok: before.skip === true && sj.skip !== true && cs?.skipped === false,
      evidence: `row "${rs.label}"; skip ${before.skip} -> ${sj.skip}; card skipped ${cs?.skipped}, glyph ${cs?.glyph}`,
    };
  });

  // ---- 8. the grid view
  await row(
    'Grid view',
    'Click Grid view in the bottom bar; every slide is a tile; Filmstrip view brings the canvas back',
    async () => {
      const order = await slideOrder(page);
      await clearAll(page);
      // skip the last slide so the grid shows the skip glyph too
      await openCardMenu(page, order[order.length - 1]);
      await clickIn(page, CTX, 'menu.slide.skipSlide');
      await pollUntil(
        () => slideJson(page, order[order.length - 1]),
        (s) => s.skip === true,
        15_000,
      );
      await settled(page);
      if (!(await has(page, '[data-control="view.gridView"]')))
        return { ok: false, notDriven: true, evidence: 'no Grid view button in the bottom bar' };
      await clickControl(page, 'view.gridView');
      const on = await pollUntil(
        () => gridFacts(page),
        (g) => g.grid && g.tiles === order.length,
        8000,
      );
      const sh = await shot('grid-view');
      await clickControl(page, 'view.filmstripView');
      const off = await pollUntil(
        () => gridFacts(page),
        (g) => !g.grid,
        8000,
      );
      await sleep(400);
      // unskip again
      await openCardMenu(page, order[order.length - 1]);
      await clickIn(page, CTX, 'menu.slide.skipSlide');
      await pollUntil(
        () => slideJson(page, order[order.length - 1]),
        (s) => s.skip !== true,
        15_000,
      );
      await settled(page);
      return {
        ok:
          on.grid &&
          on.tiles === order.length &&
          on.tileIds.join(',') === order.join(',') &&
          on.skippedTiles === 1 &&
          !off.grid &&
          off.stageShown,
        evidence: `grid on: ${JSON.stringify({ tiles: on.tiles, order: on.tileIds.join(',') === order.join(','), active: on.activeTile, skipped: on.skippedTiles, filmHidden: on.filmHidden, filmWidth: on.filmWidth, gridPressed: on.gridPressed })}; back: ${JSON.stringify({ grid: off.grid, stage: off.stageShown, filmWidth: off.filmWidth, filmPressed: off.filmPressed })}`,
        shot: sh,
      };
    },
  );

  await row(
    'Grid view',
    'In the grid, click a tile to select it and double click it to open that slide',
    async () => {
      const order = await slideOrder(page);
      const target = order[Math.min(2, order.length - 1)];
      await clearAll(page);
      await clickControl(page, 'view.gridView');
      await pollUntil(
        () => gridFacts(page),
        (g) => g.grid && g.tiles === order.length,
        8000,
      );
      const tile = `.pt-grid .pt-thumb[data-id="${target}"]`;
      const r = await rectOf(page, tile);
      if (!r) {
        await clickControl(page, 'view.filmstripView');
        return { ok: false, evidence: `no tile ${target}` };
      }
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(400);
      const picked = await gridFacts(page);
      const activeAfterClick = await activeSlide(page);
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const back = await pollUntil(
        () => gridFacts(page),
        (g) => !g.grid,
        8000,
      );
      const active = await pollUntil(
        () => activeSlide(page),
        (a) => a === target,
        8000,
      );
      await sleep(300);
      return {
        ok:
          (picked.activeTile === target || picked.selectedTiles >= 1) &&
          !back.grid &&
          active === target,
        evidence: `after click: active tile ${picked.activeTile}, selected ${picked.selectedTiles}, state ${activeAfterClick}; after double click: grid ${back.grid}, active ${active}, counter ${JSON.stringify(await counter(page))}`,
      };
    },
  );

  await row('Grid view', 'View menu > Grid view toggles the grid on, and again off', async () => {
    const order = await slideOrder(page);
    await clearAll(page);
    await openMenu(page, 'view');
    const rs = await rowState(page, menuRoot('view'), 'menu.view.gridView');
    await clickIn(page, menuRoot('view'), 'menu.view.gridView');
    const on = await pollUntil(
      () => gridFacts(page),
      (g) => g.grid && g.tiles === order.length,
      8000,
    );
    await openMenu(page, 'view');
    const checked = await page.evaluate(() =>
      document
        .querySelector('#ts-menu-view [data-control="menu.view.gridView"]')
        ?.getAttribute('aria-checked'),
    );
    await clickIn(page, menuRoot('view'), 'menu.view.gridView');
    const off = await pollUntil(
      () => gridFacts(page),
      (g) => !g.grid,
      8000,
    );
    return {
      ok: rs.present && on.grid && checked === 'true' && !off.grid,
      evidence: `row ${JSON.stringify(rs)}; on ${on.grid} (${on.tiles} tiles); checked while on ${checked}; off ${!off.grid}`,
    };
  });

  await row(
    'Grid view',
    'Double click a filmstrip card opens the grid; the bottom bar Filmstrip view returns',
    async () => {
      const order = await slideOrder(page);
      await clearAll(page);
      const r = await cardRect(page, order[0]);
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      const on = await pollUntil(
        () => gridFacts(page),
        (g) => g.grid,
        6000,
      );
      await press(page, 'Escape');
      await sleep(400);
      const afterEsc = await gridFacts(page);
      if (afterEsc.grid) await clickControl(page, 'view.filmstripView');
      const off = await pollUntil(
        () => gridFacts(page),
        (g) => !g.grid,
        8000,
      );
      return {
        ok: on.grid && !off.grid,
        evidence: `grid after the double click ${on.grid}; after Escape ${afterEsc.grid ? 'still on' : 'closed'}; back ${!off.grid}`,
      };
    },
  );

  await row('Grid view', 'Drag a grid tile to a new place', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    await clickControl(page, 'view.gridView');
    await pollUntil(
      () => gridFacts(page),
      (g) => g.grid && g.tiles === before.length,
      8000,
    );
    const a = await rectOf(page, `.pt-grid .pt-thumb[data-id="${before[1]}"]`);
    const b = await rectOf(page, `.pt-grid .pt-thumb[data-id="${before[0]}"]`);
    if (!a || !b) {
      await clickControl(page, 'view.filmstripView');
      return { ok: false, evidence: 'no tiles' };
    }
    await dragCard(page, center(a), { x: b.x + 8, y: b.y + b.h / 2 });
    const after = await waitOrder(page, (o) => o[0] === before[1], 12_000);
    await settled(page);
    const sh = await shot('grid-drag');
    await clickControl(page, 'view.filmstripView');
    await pollUntil(
      () => gridFacts(page),
      (g) => !g.grid,
      8000,
    );
    if (after[0] === before[1]) {
      await focusWorkspace(page);
      await press(page, 'Meta+z');
      await waitOrder(page, (o) => o.join(',') === before.join(','), 12_000);
      await settled(page);
    }
    return {
      ok: after[0] === before[1] && after[1] === before[0],
      evidence: `${before.join(',')} -> ${after.join(',')}`,
      shot: sh,
    };
  });

  // ---- 9. speaker notes
  const NOTES = 'Open with the Q3 number, then pause for questions.';
  await row(
    'Speaker notes',
    'Click the notes field and type a talk track with spaces; the slide keeps it',
    async () => {
      const order = await slideOrder(page);
      await clickCard(page, order[1]);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === order[1],
        8000,
      );
      await clearAll(page);
      const nf = await notesFacts(page);
      if (!nf.present) return { ok: false, evidence: 'no notes pane' };
      if (nf.hidden) return { ok: false, evidence: `notes pane hidden (${nf.height})` };
      const r = await rectOf(page, '[data-control="notes.text"]');
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await typeHuman(page, NOTES);
      const typed = (await notesFacts(page)).value;
      await sleep(700);
      const stored = await pollUntil(
        () => slideJson(page, order[1]),
        (s) => (s.notes ?? '') === NOTES,
        15_000,
      );
      await settled(page);
      const sh = await shot('notes-typed');
      return {
        ok: typed === NOTES && (stored.notes ?? '') === NOTES,
        evidence: `placeholder "${nf.placeholder}"; height ${nf.height}; field after typing "${typed}"; stored notes "${stored.notes ?? ''}"; revision ${(await state(page)).revision}`,
        shot: sh,
      };
    },
    { tries: 2 },
  );

  await row(
    'Speaker notes',
    'Switch to another slide and back; each slide shows its own notes',
    async () => {
      const order = await slideOrder(page);
      await press(page, 'Escape');
      await clickCard(page, order[0]);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === order[0],
        8000,
      );
      await sleep(500);
      const other = (await notesFacts(page)).value;
      await clickCard(page, order[1]);
      await pollUntil(
        () => activeSlide(page),
        (a) => a === order[1],
        8000,
      );
      await sleep(500);
      const back = (await notesFacts(page)).value;
      return {
        ok: other === '' && back === NOTES,
        evidence: `slide 1 field "${other}"; slide 2 field "${back}"`,
      };
    },
  );

  await row(
    'Speaker notes',
    'Drag the notes handle up to make the pane taller, double click it, drag it back',
    async () => {
      const before = await notesFacts(page);
      const h = await rectOf(page, '[data-control="notes.handle"]');
      if (!h) return { ok: false, evidence: 'no notes handle' };
      const from = center(h);
      await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 6);
      await page.mouse.down();
      await sleep(100);
      await moveHuman(page, from, { x: from.x, y: from.y - 120 }, 14);
      await sleep(150);
      await page.mouse.up();
      await sleep(400);
      const taller = await notesFacts(page);
      const h2 = await rectOf(page, '[data-control="notes.handle"]');
      await dblclickAt(page, h2.x + h2.w / 2, h2.y + h2.h / 2);
      await sleep(400);
      const toggled = await notesFacts(page);
      const h3 = await rectOf(page, '[data-control="notes.handle"]');
      if (toggled.hidden || toggled.box === 0) {
        await dblclickAt(page, h3.x + h3.w / 2, h3.y + h3.h / 2);
        await sleep(400);
      }
      const restored = await notesFacts(page);
      const sh = await shot('notes-resized');
      return {
        ok:
          parseInt(taller.height, 10) > parseInt(before.height, 10) + 60 &&
          toggled.height !== taller.height &&
          restored.value === NOTES,
        evidence: `height ${before.height} -> drag ${taller.height} (box ${taller.box}) -> double click ${toggled.height} (hidden ${toggled.hidden}) -> ${restored.height}; value kept "${restored.value}"`,
        shot: sh,
      };
    },
  );

  await row('Speaker notes', 'Reload the deck; the notes are still there', async () => {
    const order = await slideOrder(page);
    const rev = (await settled(page)).revision;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await connected(page);
    await clickCard(page, order[1]);
    await pollUntil(
      () => activeSlide(page),
      (a) => a === order[1],
      8000,
    );
    await sleep(600);
    const nf = await notesFacts(page);
    const sj = await slideJson(page, order[1]);
    return {
      ok: nf.value === NOTES && (sj.notes ?? '') === NOTES,
      evidence: `revision before ${rev}, after ${(await state(page)).revision}; field "${nf.value}"; stored "${sj.notes ?? ''}"; height ${nf.height}`,
    };
  });

  // ---- 10. the counter and the address hash
  await row(
    'Slide counter',
    'The counter reads the slide number; clicking it opens a field; a number and Enter go there',
    async () => {
      const order = await slideOrder(page);
      await clickCard(page, order[2] ?? order[order.length - 1]);
      const at = order[2] ?? order[order.length - 1];
      await pollUntil(
        () => activeSlide(page),
        (a) => a === at,
        8000,
      );
      await sleep(300);
      const ct = await counter(page);
      if (!ct)
        return { ok: false, notDriven: true, evidence: 'no view.count control on the toolbar' };
      await clickControl(page, 'view.count');
      const field = await has(page, '[data-control="view.goto"]');
      await typeHuman(page, '1');
      await press(page, 'Enter');
      const active = await pollUntil(
        () => activeSlide(page),
        (a) => a === order[0],
        8000,
      );
      await sleep(300);
      const ct2 = await counter(page);
      return {
        ok: /3/.test(ct.text) && field && active === order[0] && /1/.test(ct2?.text ?? ''),
        evidence: `on slide 3 counter ${JSON.stringify(ct)}; field opened ${field}; after "1" Enter active ${active}, counter ${JSON.stringify(ct2)}`,
      };
    },
  );

  await row(
    'Address hash',
    'The address carries the slide; a reload with the hash and the numeric form land on that slide',
    async () => {
      const order = await slideOrder(page);
      await clickCard(page, order[2] ?? order[1]);
      const at = order[2] ?? order[1];
      await pollUntil(
        () => activeSlide(page),
        (a) => a === at,
        8000,
      );
      await sleep(300);
      const h = await hashOf(page);
      const url = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await connected(page);
      const landed = await pollUntil(
        () => activeSlide(page),
        (a) => a === at,
        8000,
      );
      await page.goto(`${BASE}/edit/${deckId}#2`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await connected(page);
      const numeric = await pollUntil(
        () => activeSlide(page),
        (a) => a === order[1],
        8000,
      );
      await sleep(300);
      const rewritten = await hashOf(page);
      return {
        ok: h === `#s/${encodeURIComponent(at)}` && landed === at && numeric === order[1],
        evidence: `after clicking card 3 hash "${h}" (${url.replace(BASE, '')}); reload lands on ${landed}; /edit/<id>#2 lands on ${numeric} (order[1] ${order[1]}); hash then "${rewritten}"`,
      };
    },
  );

  await row('Slide counter', 'The counter follows New slide and Delete', async () => {
    const before = await slideOrder(page);
    await clearAll(page);
    const c0 = await counter(page);
    await clickControl(page, 'toolbar.newSlide');
    const mid = await waitOrder(page, (o) => o.length === before.length + 1);
    await sleep(500);
    const c1 = await counter(page);
    const added = mid.find((id) => !before.includes(id));
    await focusCard(page, added);
    await press(page, 'Delete');
    await waitOrder(page, (o) => o.length === before.length);
    await sleep(500);
    const c2 = await counter(page);
    await settled(page);
    return {
      ok:
        c1 !== null &&
        /\b0?(\d+)\b/.test(c1.text) &&
        (c1.label ?? '').includes(`of ${mid.length}`) &&
        (c2?.label ?? '').includes(`of ${before.length}`),
      evidence: `before ${JSON.stringify(c0)}; after New slide ${JSON.stringify(c1)}; after Delete ${JSON.stringify(c2)}`,
    };
  });

  await shot('end');
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

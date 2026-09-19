// The "Present, share and collaborate" audit against production. Human speed, headless Chromium,
// 1440 by 900. One scratch deck from /new, trashed and deleted forever in the finally block.
// Imports nothing but playwright-core from the repository root.
//
//   node audit-present.mjs [--base https://turboslide.vercel.app]
//
// Run 2: the Share dialog on production is the round one form (View link, Present link, Edit link,
// each with Copy link), so the sharing rows follow those three addresses; the role controls are
// recorded as not driven when the dialog has none.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('file:///Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/focus/audit-present';
const JSON_OUT = path.join(HERE, 'audit-present.json');
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const startedAt = Date.now();
/** result: works | broken | flaky | not driven */
const record = (feature, interaction, result, evidence, extra = {}) => {
  const row = {
    n: rows.length + 1,
    feature,
    interaction,
    result,
    evidence: String(evidence),
    ...extra,
  };
  rows.push(row);
  const tag =
    { works: 'ok  ', broken: 'FAIL', flaky: 'FLKY', 'not driven': 'n/d ' }[result] ?? '????';
  console.log(
    `${tag} ${String(row.n).padStart(2)} ${feature} :: ${interaction}\n       ${row.evidence}`,
  );
  return row;
};
/**
 * Drives one interaction up to three times. `fn` returns { ok, evidence } or { skip: why }. A pass
 * on the first try is "works"; a pass after a failure is "flaky"; three failures are "broken".
 */
const attempt = async (feature, interaction, fn, { tries = 3 } = {}) => {
  const seen = [];
  for (let t = 1; t <= tries; t += 1) {
    try {
      const r = await fn(t);
      if (r.skip) return record(feature, interaction, 'not driven', r.skip, { tries: t });
      seen.push(`try ${t}: ${r.evidence}`);
      if (r.ok)
        return record(
          feature,
          interaction,
          t === 1 ? 'works' : 'flaky',
          t === 1 ? r.evidence : seen.join(' | '),
          { tries: t },
        );
    } catch (error) {
      seen.push(
        `try ${t}: error ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  }
  return record(feature, interaction, 'broken', seen.join(' | '), { tries });
};
const skip = (feature, interaction, why) => record(feature, interaction, 'not driven', why);

// ---------------------------------------------------------------------------------------------
// human speed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
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

// ---------------------------------------------------------------------------------------------
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
    const s = await state(page).catch(() => ({}));
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
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
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  const r = await el.boundingBox({ timeout: 8000 });
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const textOf = (page, selector) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector);
const menuRoot = (id) => `#ts-menu-${id}`;
const openMenu = async (page, id) => {
  const bar = ctl(page, `menubar.${id}`);
  const r = await bar.boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(menuRoot(id)).waitFor({ timeout: 8000 });
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
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clickRow = async (page, rowId) => clickControl(page, `menu.${rowId}`);
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
const runs = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run')),
  );
const runInfo = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${r}"]`,
    );
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    const rect = el.getBoundingClientRect();
    return {
      text: clone.textContent ?? '',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  }, run);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const headRunOf = async (page) => {
  const all = await runs(page);
  return all.find((r) => /heading/.test(r)) ?? all[0] ?? null;
};
const headingText = async (page) => {
  const head = await headRunOf(page);
  return head ? ((await runInfo(page, head))?.text ?? null) : null;
};
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.ts-snackbar, .pt-toast, [role="status"]')]
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' | ') || null,
  );
const answerNamePrompt = async (page, name) => {
  if (!(await has(page, '[data-control="dialog.namePrompt"]'))) return false;
  await clickControl(page, 'dialog.namePrompt.name');
  await typeHuman(page, name);
  await press(page, 'Enter');
  await sleep(500);
  if (await has(page, '[data-control="dialog.namePrompt"]'))
    await clickControl(page, 'dialog.namePrompt.continue').catch(() => undefined);
  await sleep(300);
  return true;
};
/** Sets the owner tab's title back to `text` after another browser wrote into it. */
const resetTitle = async (page, headRun, text) => {
  const rr = (await runInfo(page, headRun))?.rect;
  if (!rr) return;
  await dblclickAt(page, rr.x + rr.w / 2, rr.y + rr.h / 2);
  await page.keyboard.press('Meta+a');
  await typeHuman(page, text);
  await press(page, 'Escape');
  await settled(page);
  await sleep(500);
};
const showFacts = (page) =>
  page.evaluate(() => {
    const show = document.querySelector('[data-control="present.show"]');
    const counter =
      document.querySelector('[data-control="present.counter"]')?.textContent?.trim() ?? '';
    return {
      present: Boolean(show),
      index: show ? Number(show.getAttribute('data-index')) : null,
      total: show ? Number(show.getAttribute('data-total')) : null,
      laser: show?.getAttribute('data-laser') === 'true',
      dot: Boolean(document.querySelector('[data-control="present.laserDot"]')),
      counter,
      fullscreen: document.fullscreenElement !== null,
    };
  });
const waitIndex = (page, index, timeout = 5000) =>
  pollUntil(
    () => showFacts(page),
    (f) => f.index === index,
    timeout,
  );
const editModeOf = (page) =>
  page.evaluate(
    () => document.querySelector('[data-edit-mode]')?.getAttribute('data-edit-mode') ?? null,
  );
const roleOf = (page) =>
  page
    .evaluate(() => window.turboslide?.studio?.describe?.().state?.access?.role ?? null)
    .catch(() => null);

// ---------------------------------------------------------------------------------------------
// contexts

const browser = await chromium.launch({ headless: true });
const consoleErrors = { A: [], B0: [], B: [], C: [], P: [], E: [] };
const apiResponses = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => consoleErrors[tag].push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors[tag].push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!/\/api\/(share|actions|comments)\//.test(url)) return;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    apiResponses.push({
      tag,
      at: Date.now(),
      url: url.replace(BASE, ''),
      status: res.status(),
      body,
    });
  });
};
const newContext = async (tag) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  watch(page, tag);
  return { context, page };
};
const A = await newContext('A');
await A.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = A.page;
const shot = async (p, name) => {
  await p.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => undefined);
};
const others = [];
const closeOthers = async () => {
  for (const o of others.splice(0)) await o.context.close().catch(() => undefined);
};
const apiSince = (n, pattern) =>
  apiResponses
    .slice(n)
    .filter((r) => pattern.test(r.url))
    .map(
      (r) =>
        `${r.url} ${r.status}${r.body && r.body.error ? ` ${JSON.stringify(r.body).slice(0, 120)}` : ''}`,
    );

let deckId = '';
let headRun = null;
const TITLE = 'Pipeline review: Acme, Q3 2026';
const NOTES = 'Open with the renewal date and the two new logos.';

try {
  // ---- 1. the scratch deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  headRun = await headRunOf(page);
  {
    const r = (await runInfo(page, headRun)).rect;
    await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await typeHuman(page, TITLE);
    await press(page, 'Escape');
    await pollUntil(
      () => state(page),
      (s) => s.revision >= 1,
      30_000,
    );
    await settled(page);
    const named = await answerNamePrompt(page, 'Owner tab');
    record(
      'Scratch deck',
      'Open /new, type a title, Escape',
      /\/edit\//.test(page.url()) && (await headingText(page)) === TITLE ? 'works' : 'broken',
      `${deckId}; ${page.url().replace(BASE, '')}; title "${await headingText(page)}"; name prompt ${named ? 'answered "Owner tab"' : 'not shown'}`,
    );
  }
  const addSlide = async () => {
    const before = (await slideOrder(page)).length;
    await clearAll(page);
    await press(page, 'Control+M');
    let after = await pollUntil(
      async () => (await slideOrder(page)).length,
      (n) => n > before,
      4000,
    );
    let via = 'Ctrl+M';
    if (after <= before) {
      via = 'toolbar New slide';
      const split = page.locator('[data-control="toolbar.newSlide.split"] button').first();
      const r = await split.boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      after = await pollUntil(
        async () => (await slideOrder(page)).length,
        (n) => n > before,
        6000,
      );
    }
    await clearAll(page);
    await settled(page);
    return { ok: after > before, via, before, after };
  };
  {
    const a = await addSlide();
    const b = await addSlide();
    record(
      'Scratch deck',
      'Add two slides (Ctrl+M)',
      a.ok && b.ok ? 'works' : 'broken',
      `slides ${a.before} -> ${a.after} (${a.via}) -> ${b.after} (${b.via})`,
    );
  }
  const order = await slideOrder(page);
  {
    const card = page.locator(`[data-control="filmstrip.slide.${order[0]}"]`).first();
    const r = await card.boundingBox();
    if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    await pollUntil(
      () => state(page),
      (s) => s.slideId === order[0],
      6000,
    );
    let notesShown = await has(page, '[data-control="notes.text"]');
    if (!notesShown) {
      await openMenu(page, 'view');
      await clickRow(page, 'view.showSpeakerNotes').catch(() => undefined);
      await sleep(400);
      notesShown = await has(page, '[data-control="notes.text"]');
    }
    let stored = null;
    if (notesShown) {
      await clickControl(page, 'notes.text');
      await typeHuman(page, NOTES);
      await sleep(400);
      await press(page, 'Escape');
      await clearAll(page);
      await settled(page);
      await sleep(800);
      const slide = await invoke(page, 'slide.get', { slideId: order[0] }).then(
        (g) => g.slide ?? g,
      );
      stored = JSON.stringify(slide).includes(NOTES);
    }
    record(
      'Speaker notes',
      'Type a note under slide 1',
      notesShown && stored ? 'works' : notesShown ? 'broken' : 'not driven',
      notesShown
        ? `notes pane shown; stored in the slide ${stored}`
        : 'no notes pane on the page and View > Show speaker notes did not show one',
    );
  }

  // ---- 2. Slideshow from the toolbar and its keys
  const startShow = async () => {
    await clearAll(page);
    await invoke(page, 'view.goto', { slideId: order[0] });
    await sleep(400);
    await clickControl(page, 'present.open');
    return pollUntil(
      () => showFacts(page),
      (f) => f.present,
      10_000,
    );
  };
  const stopShow = async () => {
    await press(page, 'Escape');
    await pollUntil(
      () => showFacts(page),
      (f) => !f.present,
      8000,
    );
    await sleep(300);
  };
  await attempt('Slideshow', 'Click Slideshow in the title row', async () => {
    const on = await startShow();
    await sleep(600);
    const f = await showFacts(page);
    await shot(page, '01-slideshow-open');
    return {
      ok: on.present && f.index === 0 && f.total === 3,
      evidence: `present ${f.present}; index ${f.index} of ${f.total}; counter "${f.counter}"; fullscreen ${f.fullscreen}`,
    };
  });
  const keyStep = (feature, interaction, key, from, to) =>
    attempt(feature, interaction, async () => {
      if (!(await showFacts(page)).present) await startShow();
      if ((await showFacts(page)).index !== from) {
        await press(page, 'Home');
        await waitIndex(page, 0);
        for (let i = 0; i < from; i += 1) {
          await press(page, 'ArrowRight');
          await waitIndex(page, i + 1);
        }
      }
      const before = await showFacts(page);
      await press(page, key);
      const after = await waitIndex(page, to);
      return {
        ok: before.index === from && after.index === to,
        evidence: `index ${before.index} -> ${after.index}; counter "${after.counter}"`,
      };
    });
  await keyStep('Slideshow keys', 'ArrowRight advances', 'ArrowRight', 0, 1);
  await keyStep('Slideshow keys', 'ArrowLeft goes back', 'ArrowLeft', 1, 0);
  await keyStep('Slideshow keys', 'Space advances', 'Space', 0, 1);
  await attempt('Slideshow keys', 'Type 3 then Enter jumps to slide 3', async () => {
    if (!(await showFacts(page)).present) await startShow();
    await press(page, 'Home');
    await waitIndex(page, 0);
    await press(page, '3');
    const toast = await snackbar(page);
    await sleep(200);
    await press(page, 'Enter');
    const f = await waitIndex(page, 2);
    return {
      ok: f.index === 2,
      evidence: `after "3" snackbar ${JSON.stringify(toast)}; index ${f.index}; counter "${f.counter}"`,
    };
  });
  await keyStep('Slideshow keys', 'Home goes to the first slide', 'Home', 2, 0);
  await keyStep('Slideshow keys', 'End goes to the last slide', 'End', 0, 2);
  await attempt('Slideshow', 'A click on the slide advances', async () => {
    if (!(await showFacts(page)).present) await startShow();
    await press(page, 'Home');
    await waitIndex(page, 0);
    const sheet = await rectOf(page, '.pt-slide:not(.is-leaving)');
    const x = sheet ? sheet.x + sheet.w * 0.6 : 900;
    const y = sheet ? sheet.y + sheet.h * 0.4 : 380;
    await clickAt(page, x, y);
    const f = await waitIndex(page, 1);
    return {
      ok: f.index === 1,
      evidence: `click at ${Math.round(x)},${Math.round(y)}; index 0 -> ${f.index}; counter "${f.counter}"`,
    };
  });
  await attempt('Slideshow', 'The slide counter reads n of total', async () => {
    if (!(await showFacts(page)).present) await startShow();
    await press(page, 'Home');
    await waitIndex(page, 0);
    await moveHuman(page, { x: 400, y: 600 }, { x: 120, y: 860 }, 10);
    await sleep(400);
    const c1 = await showFacts(page);
    await press(page, 'ArrowRight');
    await waitIndex(page, 1);
    await moveHuman(page, { x: 130, y: 850 }, { x: 120, y: 860 }, 4);
    await sleep(300);
    const c2 = await showFacts(page);
    const visible = await has(page, '[data-control="present.counter"]');
    return {
      ok: /1\s*(of|\/)\s*3/.test(c1.counter) && /2\s*(of|\/)\s*3/.test(c2.counter),
      evidence: `counter "${c1.counter}" then "${c2.counter}"; toolbar visible ${visible}`,
    };
  });
  await attempt('Slideshow', 'L toggles the laser pointer', async () => {
    if (!(await showFacts(page)).present) await startShow();
    await press(page, 'l');
    await moveHuman(page, { x: 600, y: 400 }, { x: 760, y: 470 }, 8);
    await sleep(300);
    const on = await showFacts(page);
    const dot = await rectOf(page, '[data-control="present.laserDot"]');
    await shot(page, '02-slideshow-laser');
    await press(page, 'l');
    await sleep(300);
    const off = await showFacts(page);
    return {
      ok: on.laser && on.dot && !off.laser,
      evidence: `after L laser ${on.laser}, dot ${on.dot}${dot ? ` at ${Math.round(dot.x)},${Math.round(dot.y)}` : ''}; after L again laser ${off.laser}`,
    };
  });
  {
    if (!(await showFacts(page)).present) await startShow();
    await moveHuman(page, { x: 400, y: 600 }, { x: 120, y: 860 }, 10);
    await sleep(400);
    let evidence = 'no Options button';
    let penState = null;
    if (await has(page, '[data-control="present.options"]')) {
      await clickControl(page, 'present.options');
      await sleep(400);
      penState = await page.evaluate(() => {
        const row = document.querySelector('[data-control="menu.present.options.pen"]');
        if (!row) return null;
        return {
          text: row.textContent?.trim() ?? '',
          disabled: row.getAttribute('aria-disabled') ?? row.getAttribute('disabled') ?? 'none',
        };
      });
      const rowsShown = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.present.options"]')].map((el) =>
          el.getAttribute('data-control'),
        ),
      );
      evidence = `Options rows ${rowsShown.join(', ')}; pen row ${JSON.stringify(penState)}`;
      await shot(page, '02b-slideshow-options');
      await press(page, 'Escape');
      await sleep(300);
    }
    if (penState && penState.disabled !== 'none' && penState.disabled !== 'false')
      skip(
        'Slideshow',
        'Draw with the pen',
        `the Options menu lists Pen as a disabled row (${evidence})`,
      );
    else if (penState) {
      await attempt('Slideshow', 'Draw with the pen', async () => {
        await moveHuman(page, { x: 400, y: 600 }, { x: 120, y: 860 }, 10);
        await sleep(300);
        await clickControl(page, 'present.options');
        await sleep(300);
        await clickControl(page, 'menu.present.options.pen');
        await sleep(400);
        const armed = await page.evaluate(
          () => document.querySelector('[data-control="present.show"]')?.className ?? '',
        );
        return {
          ok: /pen|ink|draw/i.test(armed),
          evidence: `show classes "${armed}"; ${evidence}`,
        };
      });
    } else
      skip('Slideshow', 'Draw with the pen', `no pen row in the show's Options menu (${evidence})`);
  }
  await attempt('Slideshow', 'Escape leaves the show', async () => {
    if (!(await showFacts(page)).present) await startShow();
    await press(page, 'Escape');
    const f = await pollUntil(
      () => showFacts(page),
      (x) => !x.present,
      8000,
    );
    const s = await state(page);
    return {
      ok: !f.present,
      evidence: `present ${f.present}; editor slide ${order.indexOf(s.slideId) + 1}; fullscreen ${f.fullscreen}`,
    };
  });
  await attempt('Slideshow', 'Cmd+Enter starts the show', async () => {
    await clearAll(page);
    await invoke(page, 'view.goto', { slideId: order[1] });
    await sleep(400);
    const bar = await rectOf(page, '[data-control="menubar"]');
    if (bar) await clickAt(page, bar.x + bar.w - 30, bar.y + bar.h / 2);
    await sleep(200);
    await press(page, 'Escape');
    await press(page, 'Meta+Enter');
    const f = await pollUntil(
      () => showFacts(page),
      (x) => x.present,
      8000,
    );
    const evidence = `present ${f.present}; index ${f.index} (the editor stood on slide 2, so index 1 means the show opens on the current slide)`;
    if (f.present) await stopShow();
    return { ok: f.present && f.index === 1, evidence };
  });

  // ---- 3. Presenter view
  await attempt(
    'Presenter view',
    'Slideshow arrow > Presenter view opens a second window with notes, next slide and timer',
    async () => {
      await clearAll(page);
      await invoke(page, 'view.goto', { slideId: order[0] });
      await sleep(400);
      await clickControl(page, 'present.arrow');
      await page
        .locator('[data-control="menu.title.slideshow.presenterView"]')
        .waitFor({ timeout: 6000 });
      const popupPromise = A.context.waitForEvent('page', { timeout: 15_000 });
      await clickControl(page, 'menu.title.slideshow.presenterView');
      const popup = await popupPromise;
      watch(popup, 'P');
      await popup.waitForLoadState('domcontentloaded');
      await popup.locator('[data-control="presenter"]').waitFor({ timeout: 30_000 });
      await sleep(1500);
      const show = await pollUntil(
        () => showFacts(page),
        (f) => f.present,
        8000,
      );
      const facts = async () =>
        popup.evaluate(() => {
          const root = document.querySelector('[data-control="presenter"]');
          return {
            url: location.pathname,
            index: root ? Number(root.getAttribute('data-index')) : null,
            total: root ? Number(root.getAttribute('data-total')) : null,
            counter:
              document.querySelector('[data-control="presenter.counter"]')?.textContent?.trim() ??
              '',
            notes:
              document.querySelector('[data-control="presenter.notesText"]')?.textContent?.trim() ??
              '',
            elapsed:
              document.querySelector('[data-control="presenter.elapsed"]')?.textContent?.trim() ??
              '',
            connection:
              document
                .querySelector('[data-control="presenter.connection"]')
                ?.textContent?.trim() ?? '',
            frames: document.querySelectorAll('.pt-slide').length,
            nextLabelled: /next slide/i.test(document.body.textContent ?? ''),
          };
        });
      const f1 = await facts();
      await sleep(2500);
      const f2 = await facts();
      await shot(popup, '03-presenter-window');
      await shot(page, '03-audience-window');
      await popup.bringToFront();
      await popup.keyboard.press('ArrowRight');
      const aud = await waitIndex(page, 1, 6000);
      const f3 = await facts();
      await page.bringToFront();
      await press(page, 'ArrowRight');
      const f4 = await pollUntil(facts, (x) => x.index === 2, 6000);
      const pages = A.context.pages().length;
      const ok =
        show.present &&
        f1.url === `/present/${deckId}` &&
        f1.notes.includes(NOTES) &&
        f1.elapsed !== f2.elapsed &&
        aud.index === 1 &&
        f3.index === 1 &&
        f4.index === 2 &&
        pages === 2;
      const evidence = `popup ${f1.url}; pages ${pages}; audience present ${show.present}; presenter index ${f1.index} of ${f1.total}, counter "${f1.counter}"; notes "${f1.notes.slice(0, 60)}"; timer "${f1.elapsed}" -> "${f2.elapsed}" after 2.5 s; connection "${f1.connection}"; frames ${f1.frames}, next labelled ${f1.nextLabelled}; presenter ArrowRight -> audience index ${aud.index}, presenter ${f3.index}; audience ArrowRight -> presenter ${f4.index}`;
      await popup.close().catch(() => undefined);
      await stopShow();
      return { ok, evidence };
    },
  );
  await attempt('Presenter view', 'S in the show opens Presenter view', async () => {
    await startShow();
    const popupPromise = A.context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await press(page, 's');
    const popup = await popupPromise;
    let url = 'none';
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
      url = new URL(popup.url()).pathname;
      await popup.close().catch(() => undefined);
    }
    await stopShow();
    return { ok: url === `/present/${deckId}`, evidence: `popup ${url}` };
  });

  // ---- 4. a stranger and the new deck, before anything is shared
  {
    const B0 = await newContext('B0');
    others.push(B0);
    const res = await B0.page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    const status = res?.status() ?? 0;
    await sleep(2500);
    const accessPage = await has(B0.page, '[data-control="access.page"]');
    let evidence = `GET /edit/${deckId} status ${status}; You need access page ${accessPage}`;
    if (!accessPage) {
      await editorReady(B0.page).catch(() => undefined);
      const mode = await editModeOf(B0.page);
      const role = await roleOf(B0.page);
      const rev0 = (await state(page)).revision;
      const head2 = await headRunOf(B0.page);
      const r = head2 ? (await runInfo(B0.page, head2))?.rect : null;
      let t0 = Date.now();
      if (r) {
        await dblclickAt(B0.page, r.x + r.w / 2, r.y + r.h / 2);
        await B0.page.keyboard.press('End');
        await typeHuman(B0.page, ' STRANGER');
        await press(B0.page, 'Escape');
        t0 = Date.now();
        await answerNamePrompt(B0.page, 'Stranger');
      }
      const seen = await pollUntil(
        () => headingText(page),
        (t) => (t ?? '').includes('STRANGER'),
        30_000,
      );
      const ms = Date.now() - t0;
      const rev1 = (await state(page)).revision;
      evidence += `; the editor opened with data-edit-mode ${mode}, role ${role}; the stranger typed " STRANGER" into the title: owner tab title "${seen}" after ${ms} ms, revision ${rev0} -> ${rev1}`;
      await shot(B0.page, '04-stranger-edit-restricted');
      if ((seen ?? '').includes('STRANGER')) await resetTitle(page, headRun, TITLE);
    }
    record(
      'Restricted deck',
      'A second browser with no link opens /edit/<id> of the new deck',
      accessPage ? 'works' : 'broken',
      evidence,
    );
    await B0.context.close();
    others.pop();
  }

  // ---- 5. the Share dialog
  const shareOpen = async () => {
    await clearAll(page);
    await clickControl(page, 'share.open');
    await page.locator('[data-control="dialog.share"]').waitFor({ timeout: 10_000 });
    await sleep(500);
  };
  const shareClose = async () => {
    if (await has(page, '[data-control="dialog.share"]')) {
      await press(page, 'Escape');
      await sleep(400);
    }
  };
  const shareFacts = () =>
    page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const opts = (el) =>
        el ? [...el.options].map((o) => `${o.value}:${o.textContent?.trim()}`) : [];
      const rowText = (id) =>
        q(`[data-control="dialog.share.${id}"]`)?.textContent?.trim().replace(/\s+/g, ' ') ?? null;
      return {
        title: q('[data-control="dialog.share"] h2')?.textContent?.trim() ?? '',
        legacy: Boolean(q('[data-control="dialog.share.view"]')),
        legacyRows: ['view', 'present', 'edit'].map((id) => `${id}: ${rowText(id)}`),
        general: Boolean(q('[data-control="dialog.share.general"]')),
        mode: q('[data-control="dialog.share.mode"]')?.value ?? null,
        modeOptions: opts(q('[data-control="dialog.share.mode"]')),
        linkRole: q('[data-control="dialog.share.linkRole"]')?.value ?? null,
        roleOptions: opts(q('[data-control="dialog.share.linkRole"]')),
        inviteRole: Boolean(q('[data-control="dialog.share.inviteRole"]')),
        people: Boolean(q('[data-control="dialog.share.people"]')),
        copyLinkFooter: Boolean(q('[data-control="dialog.share.copyLink"]')),
        stop: Boolean(q('[data-control="dialog.share.stop"]')),
        footer:
          q(
            '.ts-share-footer-sentence, [data-control="dialog.share.footer"]',
          )?.textContent?.trim() ?? '',
        buttons: [...document.querySelectorAll('[data-control="dialog.share"] button')]
          .map((b) => b.textContent?.trim() || b.getAttribute('aria-label') || '')
          .filter(Boolean),
      };
    });
  let share = null;
  await attempt('Share dialog', 'Click Share in the title row', async () => {
    await shareOpen();
    share = await shareFacts();
    await shot(page, '05-share-dialog');
    return {
      ok: share.legacy || share.general,
      evidence: `title "${share.title}"; form ${share.legacy ? 'three address links' : share.general ? 'General access record' : 'unknown'}; rows ${JSON.stringify(share.legacyRows)}; General access select ${share.mode ?? 'absent'}; invite role select ${share.inviteRole}; people list ${share.people}; Stop sharing ${share.stop}; buttons ${JSON.stringify(share.buttons)}; footer "${share.footer}"`,
    };
  });
  if (share && !share.inviteRole && share.linkRole === null) {
    skip(
      'Share dialog',
      'Set a role (Viewer, Commenter, Editor) on a person or on the link',
      `the dialog on production has no role control: it lists ${share.legacyRows.join('; ')}`,
    );
    skip(
      'Share dialog',
      'General access: Restricted or Anyone with the link',
      'the dialog on production has no General access select; the three addresses are always open (see the stranger row)',
    );
  }
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  const copyRow = async (id, expected) => {
    if (!(await has(page, '[data-control="dialog.share"]'))) await shareOpen();
    await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => undefined);
    await clickControl(page, `dialog.share.${id}.copy`);
    await sleep(700);
    const clip = await clipboard();
    const toast = await snackbar(page);
    return {
      ok: clip === expected,
      evidence: `clipboard "${clip}"; snackbar ${JSON.stringify(toast)}`,
    };
  };
  let viewLink = `${BASE}/deck/${deckId}`;
  let editLink = `${BASE}/edit/${deckId}`;
  let presentLink = `${BASE}/deck/${deckId}?present=1`;
  if (share?.legacy) {
    await attempt('Share dialog', 'Copy link on the View link row', () =>
      copyRow('view', viewLink),
    );
    await attempt('Share dialog', 'Copy link on the Present link row', () =>
      copyRow('present', presentLink),
    );
    await attempt('Share dialog', 'Copy link on the Edit link row', () =>
      copyRow('edit', editLink),
    );
  } else if (share?.general) {
    await attempt('Share dialog', 'Copy link (footer)', async () => {
      if (!(await has(page, '[data-control="dialog.share"]'))) await shareOpen();
      await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => undefined);
      await clickControl(page, 'dialog.share.copyLink');
      await sleep(700);
      const clip = await clipboard();
      return {
        ok: clip === viewLink,
        evidence: `clipboard "${clip}"; snackbar ${JSON.stringify(await snackbar(page))}`,
      };
    });
  }
  await attempt('Share dialog', 'Escape closes the dialog', async () => {
    if (!(await has(page, '[data-control="dialog.share"]'))) await shareOpen();
    await press(page, 'Escape');
    await sleep(400);
    const gone = !(await has(page, '[data-control="dialog.share"]'));
    return { ok: gone, evidence: `dialog gone ${gone}` };
  });
  await attempt('Share dialog', 'File > Share > Copy link', async () => {
    await clearAll(page);
    await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => undefined);
    await openMenu(page, 'file');
    await hoverRow(page, 'file.share', '[data-control="menu.file.share.copyLink"]');
    await clickRow(page, 'file.share.copyLink');
    await sleep(700);
    const clip = await clipboard();
    return {
      ok: clip === viewLink,
      evidence: `clipboard "${clip}"; snackbar ${JSON.stringify(await snackbar(page))}`,
    };
  });

  // ---- 6. the View link and the Present link in a second browser
  const B = await newContext('B');
  others.push(B);
  await attempt('View link', 'A second browser opens the View link', async () => {
    await B.page.goto(viewLink, { waitUntil: 'domcontentloaded' });
    await B.page.waitForSelector('.pt-viewer', { timeout: 30_000 }).catch(() => undefined);
    await sleep(2000);
    const landed = new URL(B.page.url()).pathname + new URL(B.page.url()).search;
    const f = await B.page.evaluate(() => ({
      viewer: Boolean(document.querySelector('.pt-viewer')),
      editor: Boolean(document.querySelector('.ts-editor')),
      toolbar: Boolean(document.querySelector('[data-control="toolbar"]')),
      menubar: Boolean(document.querySelector('[data-control="menubar"]')),
      title: document.title,
      text: (document.body.textContent ?? '').includes('Pipeline review'),
      editable: document.querySelectorAll('[contenteditable="true"]').length,
    }));
    await shot(B.page, '06-view-link-landing');
    return {
      ok: landed === `/deck/${deckId}` && f.viewer && !f.editor && !f.toolbar && f.text,
      evidence: `landed ${landed}; viewer ${f.viewer}, editor chrome ${f.editor}, toolbar ${f.toolbar}, menubar ${f.menubar}; contenteditable fields ${f.editable}; title "${f.title}"; deck text shown ${f.text}`,
    };
  });
  await attempt('View link', 'The Present link opens as a show', async () => {
    await B.page.goto(presentLink, { waitUntil: 'domcontentloaded' });
    await B.page.waitForSelector('.pt-viewer', { timeout: 30_000 }).catch(() => undefined);
    const f = await pollUntil(
      () => showFacts(B.page),
      (x) => x.present,
      15_000,
    );
    await shot(B.page, '07-present-link');
    await B.page.keyboard.press('ArrowRight');
    const f2 = await waitIndex(B.page, 1, 5000);
    return {
      ok: f.present && f.index === 0 && f2.index === 1,
      evidence: `show ${f.present}; index ${f.index} of ${f.total}; ArrowRight -> ${f2.index}`,
    };
  });
  await attempt(
    'View link',
    'The viewer changes the address to /edit/<id>: read only?',
    async (t) => {
      await B.page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      if (await has(B.page, '[data-control="access.page"]'))
        return { ok: true, evidence: 'the editor address answers the You need access page' };
      await editorReady(B.page);
      const mode = await editModeOf(B.page);
      const role = await roleOf(B.page);
      const rev0 = (await state(page)).revision;
      const head2 = await headRunOf(B.page);
      const r = head2 ? (await runInfo(B.page, head2))?.rect : null;
      let ed = null;
      const marker = ` V${t}`;
      if (r) {
        await dblclickAt(B.page, r.x + r.w / 2, r.y + r.h / 2);
        ed = await editing(B.page);
        await B.page.keyboard.press('End');
        await typeHuman(B.page, marker);
        await press(B.page, 'Escape');
        await answerNamePrompt(B.page, 'Viewer tab');
      }
      const seen = await pollUntil(
        () => headingText(page),
        (x) => (x ?? '').includes(marker.trim()),
        20_000,
      );
      const rev1 = (await state(page)).revision;
      const toolbar = await B.page.evaluate(() =>
        Boolean(document.querySelector('[data-control="toolbar"]')),
      );
      await shot(B.page, '08-viewer-on-edit-address');
      const leaked = (seen ?? '').includes(marker.trim());
      if (leaked) await resetTitle(page, headRun, TITLE);
      return {
        ok: !leaked && !ed && rev1 === rev0,
        evidence: `data-edit-mode ${mode}; role ${role}; toolbar ${toolbar}; double click opened a text session ${ed}; owner title after the viewer typed "${marker}": "${seen}"; owner revision ${rev0} -> ${rev1}`,
      };
    },
  );

  // ---- 7. the Edit link in a third browser: edits and presence
  const C = await newContext('C');
  others.push(C);
  let cHead = null;
  await attempt('Edit link', 'A third browser opens the Edit link', async () => {
    await C.page.goto(editLink, { waitUntil: 'domcontentloaded' });
    await editorReady(C.page);
    const landed = new URL(C.page.url()).pathname;
    const mode = await editModeOf(C.page);
    const role = await roleOf(C.page);
    cHead = await headRunOf(C.page);
    return {
      ok: landed === `/edit/${deckId}` && mode === 'editing' && cHead !== null,
      evidence: `landed ${landed}; data-edit-mode ${mode}; role ${role}; heading run ${cHead}`,
    };
  });
  await attempt(
    'Collaboration',
    'An edit in the third browser reaches the owner within a few seconds',
    async (t) => {
      const word = ` +C${t}`;
      const r = cHead ? (await runInfo(C.page, cHead))?.rect : null;
      if (!r) return { ok: false, evidence: 'no heading run in the third browser' };
      await dblclickAt(C.page, r.x + r.w / 2, r.y + r.h / 2);
      await C.page.keyboard.press('End');
      await typeHuman(C.page, word);
      await press(C.page, 'Escape');
      const t0 = Date.now();
      await answerNamePrompt(C.page, 'Editor tab');
      const seen = await pollUntil(
        () => headingText(page),
        (x) => (x ?? '').includes(word.trim()),
        30_000,
      );
      const ms = Date.now() - t0;
      await shot(C.page, '09-editor-third-browser');
      return {
        ok: (seen ?? '').includes(word.trim()),
        evidence: `typed "${word}" in C; owner title "${seen}" after ${ms} ms`,
      };
    },
  );
  await attempt(
    'Collaboration',
    'An edit by the owner reaches the third browser within a few seconds',
    async (t) => {
      const word = ` +A${t}`;
      const r = (await runInfo(page, headRun))?.rect;
      if (!r) return { ok: false, evidence: 'no heading run in the owner tab' };
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.keyboard.press('End');
      await typeHuman(page, word);
      await press(page, 'Escape');
      const t0 = Date.now();
      const seen = await pollUntil(
        () => headingText(C.page),
        (x) => (x ?? '').includes(word.trim()),
        30_000,
      );
      const ms = Date.now() - t0;
      return {
        ok: (seen ?? '').includes(word.trim()),
        evidence: `typed "${word}" in A; third browser title "${seen}" after ${ms} ms`,
      };
    },
  );
  await attempt('Collaboration', 'Presence chips show the other person in both tabs', async () => {
    const chips = (p) =>
      p.evaluate(() =>
        [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) => ({
          label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
          me: el.classList.contains('ts-presence-me') || Boolean(el.closest('.ts-presence-me')),
        })),
      );
    const a = await pollUntil(
      () => chips(page),
      (x) => x.length >= 1,
      15_000,
    );
    const c = await pollUntil(
      () => chips(C.page),
      (x) => x.length >= 1,
      15_000,
    );
    const countA = await textOf(page, '.ts-presence-count');
    const slotA = await textOf(page, '[data-control="title.presence"]');
    await shot(page, '10-presence-owner-tab');
    return {
      ok: a.length >= 1 && c.length >= 1,
      evidence: `owner tab chips ${JSON.stringify(a)} count "${countA}" slot text "${slotA}"; third browser chips ${JSON.stringify(c)}`,
    };
  });
  await attempt(
    'Collaboration',
    'A slide added in the third browser appears in the owner filmstrip',
    async () => {
      const before = (await slideOrder(page)).length;
      await clearAll(C.page);
      await press(C.page, 'Control+M');
      const t0 = Date.now();
      const after = await pollUntil(
        async () => (await slideOrder(page)).length,
        (n) => n > before,
        30_000,
      );
      const ms = Date.now() - t0;
      const cards = await page.evaluate(
        () => document.querySelectorAll('[data-control^="filmstrip.slide."]').length,
      );
      return {
        ok: after > before,
        evidence: `owner slides ${before} -> ${after} after ${ms} ms; filmstrip cards ${cards}`,
      };
    },
  );

  // ---- 8. comments
  const cardFacts = (p) =>
    p.evaluate(() => {
      const card = document.querySelector('[data-control="comment.card"]');
      return {
        card: Boolean(card),
        newField: Boolean(document.querySelector('[data-control="comment.card.new.field"]')),
        first:
          document
            .querySelector('[data-control="comment.card.first"]')
            ?.textContent?.trim()
            .slice(0, 80) ?? '',
        replies: document.querySelectorAll('[data-control^="comment.card.reply."]').length,
        resolveLabel:
          document
            .querySelector('[data-control="comment.card.resolve"]')
            ?.getAttribute('aria-label') ?? null,
        markers: document.querySelectorAll('[data-control="comment.marker"]').length,
        text: card?.textContent?.trim().slice(0, 160) ?? '',
      };
    });
  const panelFacts = () =>
    page.evaluate(() => ({
      tabs: [...document.querySelectorAll('[data-control^="panel.comments.tab."]')].map(
        (el) => `${el.getAttribute('data-control').split('.').pop()}:${el.textContent?.trim()}`,
      ),
      threads: document.querySelectorAll('[data-control^="panel.comments.thread."]').length,
      reopen: document.querySelectorAll('[data-control^="panel.comments.reopen."]').length,
      text:
        document
          .querySelector('[data-control="panel.comments.list"]')
          ?.textContent?.trim()
          .slice(0, 200) ?? '',
    }));
  const openCommentsPanel = async () => {
    if (await has(page, '[data-control="panel.comments"]')) return;
    await clickControl(page, 'title.comments');
    await page.locator('[data-control="panel.comments"]').waitFor({ timeout: 8000 });
    await sleep(500);
  };
  const closePanel = async () => {
    if (await has(page, '[data-control="panel.comments"]')) {
      await clickControl(page, 'panel.comments.close').catch(() => press(page, 'Escape'));
      await sleep(300);
    }
  };
  let commented = false;
  await attempt('Comments', 'Select the title block and add a comment (Cmd+Option+M)', async () => {
    await clearAll(page);
    await invoke(page, 'view.goto', { slideId: order[0] });
    await sleep(400);
    const r = (await runInfo(page, headRun))?.rect;
    await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    if (await editing(page)) await press(page, 'Escape');
    await sleep(200);
    const chip = await textOf(page, '.ts-overlay .ts-select-chip');
    const n0 = apiResponses.length;
    await press(page, 'Meta+Alt+m');
    let via = 'Cmd+Option+M';
    let f = await pollUntil(
      () => cardFacts(page),
      (x) => x.newField,
      3000,
    );
    if (!f.newField) {
      via = 'toolbar Insert comment';
      await clickControl(page, 'toolbar.insertComment');
      f = await pollUntil(
        () => cardFacts(page),
        (x) => x.newField,
        5000,
      );
    }
    if (!f.newField)
      return {
        ok: false,
        evidence: `chip "${chip}"; no comment card after ${via}; snackbar ${JSON.stringify(await snackbar(page))}`,
      };
    await shot(page, '11-comment-card-new');
    await clickControl(page, 'comment.card.new.field');
    await typeHuman(page, 'Swap the logo before the call');
    await sleep(200);
    await clickControl(page, 'comment.card.new.submit');
    const after = await pollUntil(
      () => cardFacts(page),
      (x) => x.markers >= 1,
      20_000,
    );
    const toast = await snackbar(page);
    await settled(page);
    await openCommentsPanel();
    const panel = await panelFacts();
    await shot(page, '12-comment-after-submit');
    await closePanel();
    commented = after.markers >= 1 || panel.threads >= 1;
    return {
      ok: after.markers >= 1 && panel.threads >= 1,
      evidence: `chip "${chip}"; card via ${via}; markers after submit ${after.markers}; card open ${after.card}; snackbar ${JSON.stringify(toast)}; comments panel threads ${panel.threads}, tabs ${panel.tabs.join(', ')}, list "${panel.text.slice(0, 100)}"; comment API ${JSON.stringify(apiSince(n0, /comments|actions/))}`,
    };
  });
  await attempt('Comments', 'Open the thread from its marker and reply', async () => {
    if (!commented) return { skip: 'no comment was created in the previous row' };
    await clearAll(page);
    const m = await rectOf(page, '[data-control="comment.marker"]');
    if (!m) return { ok: false, evidence: 'no marker' };
    await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
    let f = await pollUntil(
      () => cardFacts(page),
      (x) => x.card && x.first !== '',
      6000,
    );
    if (!(await has(page, '[data-control="comment.card.reply"]')))
      return { ok: false, evidence: `card ${f.card}; first "${f.first}"; no Reply control` };
    await clickControl(page, 'comment.card.reply');
    await page.locator('[data-control="comment.card.replyBox.field"]').waitFor({ timeout: 5000 });
    await typeHuman(page, 'Done, the new logo is on slide 2');
    await clickControl(page, 'comment.card.replyBox.submit');
    f = await pollUntil(
      () => cardFacts(page),
      (x) => x.replies >= 1,
      15_000,
    );
    await settled(page);
    await shot(page, '13-comment-reply');
    return {
      ok: f.replies >= 1,
      evidence: `first "${f.first}"; replies ${f.replies}; card text "${f.text.slice(0, 120)}"`,
    };
  });
  await attempt('Comments', 'The comment reaches the third browser', async () => {
    if (!commented) return { skip: 'no comment was created' };
    const n = await pollUntil(
      () =>
        C.page.evaluate(() => document.querySelectorAll('[data-control="comment.marker"]').length),
      (x) => x >= 1,
      20_000,
    );
    return { ok: n >= 1, evidence: `markers in the third browser ${n}` };
  });
  await attempt('Comments', 'Resolve the thread', async () => {
    if (!commented) return { skip: 'no comment was created' };
    let f = await cardFacts(page);
    if (!f.card) {
      const m = await rectOf(page, '[data-control="comment.marker"]');
      if (!m) return { ok: false, evidence: 'no marker and no card' };
      await clickAt(page, m.x + m.w / 2, m.y + m.h / 2);
      f = await pollUntil(
        () => cardFacts(page),
        (x) => x.card,
        6000,
      );
    }
    const label = f.resolveLabel;
    await clickControl(page, 'comment.card.resolve');
    await sleep(1500);
    await settled(page);
    const after = await cardFacts(page);
    await clearAll(page);
    await openCommentsPanel();
    const panel = await panelFacts();
    await shot(page, '14-comment-resolved-panel');
    await closePanel();
    return {
      ok:
        label !== null &&
        after.markers === 0 &&
        (panel.reopen >= 1 || /resolved/i.test(panel.text)),
      evidence: `resolve button "${label}"; markers after ${after.markers}; panel tabs ${panel.tabs.join(', ')}; threads ${panel.threads}, reopen buttons ${panel.reopen}; list "${panel.text.slice(0, 120)}"`,
    };
  });

  // ---- 9. version history
  const versionsOpen = async () => {
    await clearAll(page);
    if (await has(page, '[data-control="panel.versionHistory"]')) return 'already open';
    if (await has(page, '[data-control="deck.lastEdit"]')) {
      await clickControl(page, 'deck.lastEdit');
      if (
        await page
          .locator('[data-control="panel.versionHistory"]')
          .waitFor({ timeout: 6000 })
          .then(() => true)
          .catch(() => false)
      )
        return 'Last edit';
    }
    await openMenu(page, 'file');
    await hoverRow(page, 'file.versionHistory', '[data-control="menu.file.versionHistory.see"]');
    await clickRow(page, 'file.versionHistory.see');
    await page.locator('[data-control="panel.versionHistory"]').waitFor({ timeout: 8000 });
    return 'File > Version history > See version history';
  };
  const versionFacts = () =>
    page.evaluate(() => ({
      windows: document.querySelectorAll('[data-control^="versionHistory.window."]').length,
      picks: document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]')
        .length,
      restores: [
        ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".restore"]'),
      ].map((el) => el.getAttribute('data-control')),
      named: [
        ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".name"]'),
      ]
        .map((el) => el.textContent?.trim())
        .filter(Boolean),
      changes: document.querySelectorAll(
        '[data-control="versions.change"], [data-control="versions.changeRun"]',
      ).length,
      text:
        document
          .querySelector('[data-control="panel.versionHistory"]')
          ?.textContent?.trim()
          .slice(0, 200) ?? '',
    }));
  const expandAll = async () => {
    const f = await versionFacts();
    if (f.picks > 0) return;
    const windows = page.locator('[data-control^="versionHistory.window."]');
    const n = await windows.count();
    for (let i = 0; i < n; i += 1) {
      const r = await windows.nth(i).boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await sleep(400);
    }
  };
  await attempt('Version history', 'Open Version history from Last edit', async () => {
    const via = await versionsOpen();
    await sleep(800);
    const f = await versionFacts();
    await shot(page, '15-version-history');
    return {
      ok: f.windows >= 1 || f.picks >= 1,
      evidence: `opened via ${via}; windows ${f.windows}; picks ${f.picks}; text "${f.text.slice(0, 140)}"`,
    };
  });
  await attempt('Version history', 'Expand a window and pick a version', async () => {
    await versionsOpen();
    await expandAll();
    const f1 = await versionFacts();
    const pick = page.locator('[data-control^="versionHistory."][data-control$=".pick"]').last();
    const pr = await pick.boundingBox();
    if (!pr) return { ok: false, evidence: `picks ${f1.picks}; no pick button` };
    await clickAt(page, pr.x + pr.width / 2, pr.y + pr.height / 2);
    await sleep(1500);
    const picked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-selected="true"]')].find((x) =>
        x.closest('[data-control="panel.versionHistory"]'),
      );
      return el
        ? (el.getAttribute('data-control') ??
            el.closest('[data-control^="versionHistory."]')?.getAttribute('data-control') ??
            'selected')
        : null;
    });
    const showChanges = await page.evaluate(
      () => document.querySelector('[data-control="versionHistory.showChanges"]')?.checked ?? null,
    );
    const f2 = await versionFacts();
    await shot(page, '16-version-picked');
    return {
      ok: picked !== null,
      evidence: `picks ${f1.picks}, restores ${f1.restores.length}; picked ${picked}; Show changes ${showChanges}; change marks ${f2.changes}`,
    };
  });
  await attempt('Version history', 'Name current version', async () => {
    await versionsOpen();
    if (!(await has(page, '[data-control="versionHistory.nameCurrent"]')))
      return { ok: false, evidence: 'no Name current version control' };
    await clickControl(page, 'versionHistory.nameCurrent');
    await page
      .locator('[data-control="versionHistory.nameCurrent.field"]')
      .waitFor({ timeout: 5000 });
    await typeHuman(page, 'Before the call');
    await press(page, 'Enter');
    await sleep(1000);
    await expandAll();
    const f = await pollUntil(
      versionFacts,
      (x) => x.named.some((n) => /Before the call/.test(n)),
      10_000,
    );
    const toast = await snackbar(page);
    return {
      ok: f.named.some((n) => /Before the call/.test(n)),
      evidence: `named rows ${JSON.stringify(f.named)}; snackbar ${JSON.stringify(toast)}`,
    };
  });
  const snapshot = async () => ({
    title: await headingText(page),
    slides: (await slideOrder(page)).length,
    rev: (await state(page)).revision,
  });
  const restoreRow = (interaction, pickIndex) =>
    attempt('Version history', interaction, async () => {
      await versionsOpen();
      await expandAll();
      const f = await versionFacts();
      if (f.restores.length === 0) return { ok: false, evidence: 'no Restore control' };
      const control =
        pickIndex === 'oldest'
          ? f.restores[f.restores.length - 1]
          : f.restores[Math.min(1, f.restores.length - 1)];
      const before = await snapshot();
      const target = ctl(page, control).first();
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      const rr = await target.boundingBox();
      if (!rr) return { ok: false, evidence: `restore control ${control} has no box` };
      await clickAt(page, rr.x + rr.width / 2, rr.y + rr.height / 2);
      await sleep(1500);
      const after = await pollUntil(snapshot, (x) => x.rev > before.rev, 15_000);
      const toast = await snackbar(page);
      await shot(
        page,
        pickIndex === 'oldest' ? '17b-version-restore-oldest' : '17-version-restore-previous',
      );
      const changed = after.title !== before.title || after.slides !== before.slides;
      return {
        ok: after.rev > before.rev && changed,
        evidence: `restore control ${control} of ${f.restores.length}; title "${before.title}" -> "${after.title}"; slides ${before.slides} -> ${after.slides}; revision ${before.rev} -> ${after.rev}; snackbar ${JSON.stringify(toast)}`,
      };
    });
  const restoreA = await restoreRow('Restore the previous version', 'previous');
  const restoreB = await restoreRow('Restore the oldest version', 'oldest');
  if (
    restoreA.result === 'works' ||
    restoreA.result === 'flaky' ||
    restoreB.result === 'works' ||
    restoreB.result === 'flaky'
  ) {
    await attempt('Version history', 'Cmd+Z undoes the restore', async () => {
      const before = await snapshot();
      await clearAll(page);
      const bar = await rectOf(page, '[data-control="menubar"]');
      if (bar) await clickAt(page, bar.x + bar.w - 30, bar.y + bar.h / 2);
      await press(page, 'Escape');
      await press(page, 'Meta+z');
      const after = await pollUntil(snapshot, (x) => x.rev > before.rev, 10_000);
      return {
        ok:
          after.rev > before.rev &&
          (after.title !== before.title || after.slides !== before.slides),
        evidence: `title "${before.title}" -> "${after.title}"; slides ${before.slides} -> ${after.slides}; revision ${before.rev} -> ${after.rev}`,
      };
    });
  } else
    skip(
      'Version history',
      'Cmd+Z undoes the restore',
      'no restore succeeded, so there was nothing to undo',
    );
  if (await has(page, '[data-control="panel.versionHistory"]')) {
    await clickControl(page, 'panel.versionHistory.close').catch(() => press(page, 'Escape'));
    await sleep(300);
  }

  // ---- 10. rename and the second tab
  await attempt(
    'Rename',
    'Click the deck name, type a new name, Enter; the third browser shows it',
    async (t) => {
      const NAME = `Acme renewal deck ${t}`;
      await clearAll(page);
      await clickControl(page, 'deck.name');
      await page.locator('input[data-control="deck.name"]').waitFor({ timeout: 5000 });
      await page.keyboard.press('Meta+a');
      await typeHuman(page, NAME);
      await press(page, 'Enter');
      const t0 = Date.now();
      const own = await pollUntil(
        () => textOf(page, 'button[data-control="deck.name"]'),
        (x) => x === NAME,
        10_000,
      );
      const theirs = await pollUntil(
        () => textOf(C.page, 'button[data-control="deck.name"]'),
        (x) => x === NAME,
        30_000,
      );
      const ms = Date.now() - t0;
      const theirTitle = await C.page.title();
      await shot(C.page, '18-rename-third-browser');
      return {
        ok: own === NAME && theirs === NAME,
        evidence: `owner name "${own}"; third browser name "${theirs}" after ${ms} ms; its document.title "${theirTitle}"`,
      };
    },
  );

  // ---- 11. You need access
  await attempt(
    'You need access',
    'Open the editor address of a deck that does not exist',
    async () => {
      const res = await B.page.goto(`${BASE}/edit/untitled-20260915-zzzz`, {
        waitUntil: 'domcontentloaded',
      });
      await sleep(2000);
      const f = await B.page.evaluate(() => ({
        page: Boolean(document.querySelector('[data-control="access.page"]')),
        title: document.querySelector('.ts-access-title, h1')?.textContent?.trim() ?? '',
        sentence:
          document
            .querySelector('[data-control="access.sentence"]')
            ?.textContent?.trim()
            .slice(0, 160) ?? '',
        form: Boolean(document.querySelector('[data-control="access.form"]')),
        role: [...(document.querySelector('[data-control="access.role"]')?.options ?? [])].map(
          (o) => o.textContent?.trim(),
        ),
        request:
          document.querySelector('[data-control="access.request"]')?.textContent?.trim() ?? '',
        signIn: Boolean(document.querySelector('[data-control="access.signIn"]')),
      }));
      await shot(B.page, '19-you-need-access');
      return {
        ok: (res?.status() ?? 0) === 404 && f.page && /You need access/.test(f.title),
        evidence: `status ${res?.status()}; page ${f.page}; title "${f.title}"; sentence "${f.sentence}"; request form ${f.form} with roles ${JSON.stringify(f.role)}, button "${f.request}"; sign in section ${f.signIn}`,
      };
    },
  );
  await attempt(
    'You need access',
    'Open the viewer address of a deck that does not exist',
    async () => {
      const res = await B.page.goto(`${BASE}/deck/untitled-20260915-zzzz`, {
        waitUntil: 'domcontentloaded',
      });
      await sleep(1500);
      const f = await B.page.evaluate(() => ({
        page: Boolean(document.querySelector('[data-control="access.page"]')),
        title: document.querySelector('.ts-access-title, h1')?.textContent?.trim() ?? '',
      }));
      return {
        ok: (res?.status() ?? 0) === 404 && f.page,
        evidence: `status ${res?.status()}; page ${f.page}; title "${f.title}"`,
      };
    },
  );
  await attempt('You need access', 'Request access on the page', async () => {
    await B.page.goto(`${BASE}/edit/untitled-20260915-zzzz`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    if (!(await has(B.page, '[data-control="access.request"]')))
      return { ok: false, evidence: 'no Request access button' };
    if (await has(B.page, '[data-control="access.email"]')) {
      await clickControl(B.page, 'access.email');
      await typeHuman(B.page, 'audit@example.com');
    }
    await clickControl(B.page, 'access.request');
    const answer = await pollUntil(
      () => textOf(B.page, '[data-control="access.answer"]'),
      (x) => Boolean(x),
      10_000,
    );
    await shot(B.page, '20-request-access');
    return { ok: Boolean(answer), evidence: `answer "${answer}"` };
  });
  if (share && !share.stop)
    skip(
      'Share dialog',
      'Stop sharing revokes the link',
      'the dialog on production has no Stop sharing control; the three addresses cannot be revoked short of the trash',
    );
} catch (error) {
  record(
    'The audit ran to completion',
    'no exception outside a step',
    'broken',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
} finally {
  await closeOthers();
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(
        () => state(page),
        (s) => s.sync?.connected === true,
        30_000,
      );
      await settled(page);
      await clearAll(page);
      await openMenu(page, 'file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickRow(page, 'file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('Teardown', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      await shot(page, '21-trash-after-delete');
      record('Teardown', 'Delete forever on /decks/trash', 'works', `${deckId} left the trash`);
      trashed = true;
    } catch (error) {
      record(
        'Teardown',
        'File > Move to trash, Delete forever',
        'broken',
        `failed: ${error instanceof Error ? error.message : String(error)}; falling back to the actions API`,
      );
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
    for (const route of ['edit', 'deck']) {
      let status = 0;
      const until = Date.now() + 20_000;
      for (;;) {
        const res = await page.request
          .get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 })
          .catch(() => null);
        status = res?.status() ?? 0;
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record(
        'Teardown',
        `GET /${route}/${deckId} after the delete`,
        status === 404 ? 'works' : 'broken',
        `status ${status}`,
      );
    }
  }
  await browser.close().catch(() => undefined);
  const summary = {
    base: BASE,
    deckId,
    startedAt: new Date(startedAt).toISOString(),
    ms: Date.now() - startedAt,
    rows,
    consoleErrors,
    apiResponses: apiResponses.map((r) => ({
      tag: r.tag,
      url: r.url,
      status: r.status,
      keys: r.body && typeof r.body === 'object' ? Object.keys(r.body) : typeof r.body,
      error: r.body?.error ?? undefined,
    })),
  };
  writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
  console.log(
    `\naudit-present: ${rows.length} rows ${JSON.stringify(counts)}, ${Math.round(summary.ms / 1000)} s, deck ${deckId}; console errors ${JSON.stringify(Object.fromEntries(Object.entries(consoleErrors).map(([k, v]) => [k, v.length])))}; table ${JSON_OUT}`,
  );
}

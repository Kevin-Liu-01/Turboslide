#!/usr/bin/env node
// B3's hand drive of the features round rows on its own dev server (docs/FEATURES.md 2.2; the
// note build/b3.md section 3), standalone over playwright-core at human speed, every observation
// through the page and the window API, in the shape of the product round's b3 probe. One scratch
// deck from /new, trashed and removed through the window API in the finally block with a 404 read.
//
//   node docs/gslides-parity/features/build/b3/b3-probe.mjs --base http://localhost:4413 --json <path> [--only <names>]
//
// A row the probe cannot drive is recorded with ok null and its reason, never as ok.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4413').replace(/\/$/, '');
const JSON_OUT = arg('json', null);
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const headers = {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rows = [];
const record = (id, step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, id, step, expected, observed, ok });
  const mark = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(`${mark} ${id ?? '-'} | ${step} | ${observed}`);
};
const step = async (id, name, expected, fn) => {
  if (ONLY.length > 0 && id !== null && !ONLY.some((o) => id.startsWith(o))) return { ok: null };
  try {
    const r = await fn();
    record(id, name, expected, r.ok === null ? `not driven: ${r.observed}` : r.observed, r.ok);
    return r;
  } catch (error) {
    record(
      id,
      name,
      expected,
      `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      false,
    );
    return { ok: false };
  }
};

const moveHuman = async (page, from, to, steps = 10) => {
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
const drag = async (page, from, to, { steps = 14, mods = [] } = {}) => {
  await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 6);
  await sleep(rand(60, 120));
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.down();
  await sleep(rand(60, 110));
  await moveHuman(page, from, to, steps);
  await sleep(rand(80, 140));
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
  await sleep(rand(120, 200));
};
const press = async (page, key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(60, 110));
  }
};
const typeHuman = async (page, text) => {
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
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
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const slideJson = async (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
const objectsOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string' && node.pos)
        out.push({ id: node.id, type: node.type, pos: node.pos, block: node });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide.slots ?? slide);
  return out;
};
const blockOf = async (page, slideId, id) =>
  (await objectsOf(page, slideId)).find((o) => o.id === id) ?? null;
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const chip = (page) =>
  page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const sessionCell = (page) =>
  page.evaluate(() => {
    const el = document.activeElement?.closest?.('[data-run]');
    const run = el?.getAttribute('data-run') ?? null;
    const m = run ? /\/rows\/(\d+)\/cells\/(\d+)$/.exec(run) : null;
    return m ? { row: Number(m[1]), column: Number(m[2]), run } : null;
  });
const caretOffsets = (page) =>
  page.evaluate(() => {
    const sel = window.getSelection();
    const el = document.activeElement;
    if (!sel || !el || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return {
      start: pre.toString().length,
      collapsed: r.collapsed,
      length: el.textContent?.length ?? 0,
    };
  });
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const rectOf = async (page, selector) => {
  const r = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
const clickCard = async (page, slideId) => {
  const r = await ctl(page, `filmstrip.slide.${slideId}`).first().boundingBox();
  if (!r) throw new Error(`no card ${slideId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await pollUntil(
    () => state(page).then((s) => s.slideId),
    (a) => a === slideId,
    8000,
  );
  await sleep(300);
};
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const runRect = (page, run) => rectOf(page, `${SHEET} [data-run="${run}"]`);
const cellRun = (id, r, c) => `${id}/rows/${r}/cells/${c}`;
const cellPoint = async (page, id, r, c) => {
  const rc = await runRect(page, cellRun(id, r, c));
  if (!rc) throw new Error(`no cell ${r},${c} of ${id}`);
  return { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 };
};
const dismissNamePrompt = async (page) => {
  if (
    await ctl(page, 'dialog.namePrompt')
      .first()
      .isVisible()
      .catch(() => false)
  )
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
};
const newDeck = async (page, title) => {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await dismissNamePrompt(page);
  const info = await invoke(page, 'deck.info');
  const s = await state(page);
  const runs = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [data-run]`)].map((e) => e.getAttribute('data-run')),
    SHEET,
  );
  const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
  const r = await runRect(page, head);
  await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
  await typeHuman(page, title);
  await press(page, 'Escape', 2);
  await pollUntil(
    () => state(page).then((x) => x.revision),
    (rev) => rev >= 1,
    20_000,
  );
  await settled(page);
  return { id: info.id, titleSlide: s.slideId };
};
const setupSlide = async (page, after) => {
  const before = await slideOrder(page);
  const s = await state(page);
  await invoke(page, 'slide.new', { baseRevision: s.revision, after, layout: 'blank' });
  const order = await pollUntil(
    () => slideOrder(page),
    (o) => o.length === before.length + 1,
    20_000,
  );
  await settled(page);
  return order.find((x) => !before.includes(x)) ?? null;
};
const placeBlock = async (page, slideId, block) => {
  const before = (await objectsOf(page, slideId)).map((o) => o.id);
  const s = await state(page);
  await invoke(page, 'block.insert', { baseRevision: s.revision, slideId, slot: 'main', block });
  const obj = await pollUntil(
    async () => (await objectsOf(page, slideId)).find((o) => !before.includes(o.id)) ?? null,
    (o) => o !== null,
    20_000,
  );
  await settled(page);
  return obj;
};
const cleanup = async (page, deckId) => {
  const status = { edit: 0, deck: 0 };
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
    const until = Date.now() + 20_000;
    for (;;) {
      for (const route of ['edit', 'deck']) {
        const res = await page.request.get(`${BASE}/${route}/${deckId}`, {
          headers,
          maxRedirects: 0,
        });
        status[route] = res.status();
      }
      if ((status.edit === 404 && status.deck === 404) || Date.now() > until) break;
      await sleep(2000);
    }
  } catch {
    /* recorded below */
  }
  return status;
};
const typedTable = (id, columns, rowsN, pos) => ({
  id,
  type: 'table',
  columns: Array.from({ length: columns }, () => ({})),
  rows: Array.from({ length: rowsN }, (_, r) => ({
    cells: Array.from({ length: columns }, (_, c) => (r === 0 ? `H${c}` : `R${r}C${c}`)),
    ...(r === 0 ? { header: true } : {}),
  })),
  pos,
});

// ---- the drive
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: headers,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
let deck = null;
const start = Date.now();
try {
  deck = await newDeck(page, 'B3 features probe');
  const S = await setupSlide(page, deck.titleSlide);
  await clickCard(page, S);
  await clearAll(page);
  const T = 'pt';
  await placeBlock(page, S, typedTable(T, 4, 3, { x: 80, y: 120, w: 900, h: 240 }));
  const textOf = async (r, c) => (await blockOf(page, S, T))?.block?.rows?.[r]?.cells?.[c] ?? null;

  await step(
    'debug.bold-range',
    'select the table, a range over the header row, Cmd+B; watch state',
    'the write is acknowledged and the revision bumps',
    async () => {
      await clearAll(page);
      const p = await cellPoint(page, T, 1, 1);
      await clickAt(page, p.x, p.y);
      await sleep(300);
      await press(page, 'Escape');
      await sleep(200);
      const a = await cellPoint(page, T, 0, 0);
      const b = await cellPoint(page, T, 0, 3);
      await drag(page, a, b, { steps: 12 });
      await sleep(300);
      const ring = await page.evaluate(
        () =>
          document
            .querySelector('.ts-overlay .ts-select.is-cells')
            ?.getAttribute('data-cell-range') ?? null,
      );
      const s0 = await state(page);
      await press(page, 'Meta+b');
      const samples = [];
      for (let i = 0; i < 12; i += 1) {
        await sleep(500);
        const s = await state(page);
        samples.push(
          `${(i + 1) * 0.5}s rev ${s.revision} pending ${s.sync?.pending ?? s.pending} rejects ${JSON.stringify(s.rejects ?? s.sync?.rejects ?? null)}`,
        );
      }
      const cells = [
        await textOf(0, 0),
        await textOf(0, 1),
        await textOf(0, 2),
        await textOf(0, 3),
      ];
      const snack = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-snackbar, .pt-toast')]
          .map((e) => e.textContent)
          .join(' | '),
      );
      const words = await page.evaluate(
        () => document.querySelector('[data-control="deck.saveState"]')?.textContent ?? null,
      );
      return {
        ok: cells.every((c) => /^\*.*\*$/.test(c ?? '')),
        observed: `ring ${ring}; rev0 ${s0.revision}; ${samples.join('; ')}; cells ${JSON.stringify(cells)}; snackbar "${snack}"; save words "${words}"; console ${consoleErrors.slice(-3).join(' || ')}`,
      };
    },
  );

  await step(
    'debug.colour-range',
    'a range over the header row; the tail Text color, green',
    'every cell gets the colour',
    async () => {
      await clearAll(page);
      const p = await cellPoint(page, T, 1, 1);
      await clickAt(page, p.x, p.y);
      await sleep(300);
      await press(page, 'Escape');
      await sleep(200);
      const a = await cellPoint(page, T, 0, 0);
      const b = await cellPoint(page, T, 0, 3);
      await drag(page, a, b, { steps: 12 });
      await sleep(300);
      const tail = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      await clickControl(page, 'toolbar.textColor');
      await sleep(400);
      const swatches = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="toolbar.textColor."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      const pick =
        swatches.find((c) => /\.green$/.test(c)) ??
        swatches.find((c) => !/plate|menu|none|hex$|kit\./.test(c));
      if (pick) await clickControl(page, pick);
      await sleep(800);
      await settled(page);
      const s = await state(page);
      const cells = [
        await textOf(0, 0),
        await textOf(0, 1),
        await textOf(0, 2),
        await textOf(0, 3),
      ];
      const snack = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-snackbar, .pt-toast')]
          .map((e) => e.textContent)
          .join(' | '),
      );
      return {
        ok: cells.every((c) => /c:/.test(c ?? '')),
        observed: `tail ${tail.join(',')}; pick ${pick}; rev ${s.revision} pending ${s.sync?.pending ?? s.pending}; cells ${JSON.stringify(cells)}; snackbar "${snack}"; console ${consoleErrors.slice(-3).join(' || ')}`,
      };
    },
  );

  await step(
    'debug.arrows',
    'open cell 1,1 by one click; End, Right; Down; Home, Left; Up',
    'the session crosses cells at the edges',
    async () => {
      await clearAll(page);
      const p = await cellPoint(page, T, 1, 1);
      await clickAt(page, p.x, p.y);
      await sleep(300);
      const facts = [];
      const move = async (keys) => {
        for (const key of keys) await press(page, key);
        await sleep(400);
        const where = await sessionCell(page);
        const caret = await caretOffsets(page);
        facts.push(
          `${keys.join('+')} -> ${where ? `${where.row},${where.column}` : 'no cell'} caret ${caret ? `${caret.start}/${caret.length}` : 'none'}`,
        );
        return where;
      };
      const r1 = await move(['End', 'ArrowRight']);
      const r2 = await move(['ArrowDown']);
      const r3 = await move(['Home', 'ArrowLeft']);
      const r4 = await move(['ArrowUp']);
      await press(page, 'Escape');
      return {
        ok:
          r1?.row === 1 &&
          r1?.column === 2 &&
          r2?.row === 2 &&
          r2?.column === 2 &&
          r3?.row === 2 &&
          r3?.column === 1 &&
          r4?.row === 1 &&
          r4?.column === 1,
        observed: facts.join('; '),
      };
    },
  );

  await step(
    'debug.shift-arrows',
    'open cell 1,1; Home; Shift+Right; Shift+Down',
    'a range over 4 cells',
    async () => {
      await clearAll(page);
      const p = await cellPoint(page, T, 1, 1);
      await clickAt(page, p.x, p.y);
      await sleep(300);
      await press(page, 'Home');
      await press(page, 'Shift+ArrowRight');
      await sleep(300);
      const ring1 = await page.evaluate(
        () =>
          document
            .querySelector('.ts-overlay .ts-select.is-cells')
            ?.getAttribute('data-cell-range') ?? null,
      );
      await press(page, 'Shift+ArrowDown');
      await sleep(400);
      const ring2 = await page.evaluate(
        () =>
          document
            .querySelector('.ts-overlay .ts-select.is-cells')
            ?.getAttribute('data-cell-range') ?? null,
      );
      await clearAll(page);
      return {
        ok: ring2 === '1,1:2,2',
        observed: `after Shift+Right ${ring1}; after Shift+Down ${ring2}`,
      };
    },
  );
} finally {
  const status = deck ? await cleanup(page, deck.id) : null;
  console.log(`cleanup ${JSON.stringify(status)}; ${Math.round((Date.now() - start) / 1000)} s`);
  if (JSON_OUT)
    writeFileSync(
      JSON_OUT,
      JSON.stringify(
        { base: BASE, deck: deck?.id ?? null, cleanup: status, rows, consoleErrors },
        null,
        2,
      ),
    );
  await browser.close();
}

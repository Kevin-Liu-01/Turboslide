// B2 text and slides smoke against a dev server (docs/FOCUS.md section 5 ranks 2, 4, 8, 10, 11,
// 12, 13, 31 and the 5.1 rows of text and slides): the lane's own driver, not the probe of 6.1,
// kept beside docs/gslides-parity/focus/build/b2.md so the drivers lane can lift its steps. It
// drives the product's own controls with headless Chromium at 1440 by 900 at human speed on a
// scratch deck from /new, trashed and deleted forever afterwards; a step it cannot drive is "not
// driven", never ok. Runs only under .turboslide/e2e.lock. Usage:
//   node docs/gslides-parity/focus/build/b2-smoke.mjs --base http://localhost:4362 [--json out.json]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4362').replace(/\/$/, '');
const JSON_OUT = arg('json', null);
const ONLY = arg('only', null);

const rows = [];
let failures = 0;
const record = (id, step, expected, observed, ok) => {
  const row = { n: rows.length + 1, id, step, expected, observed: String(observed), ok };
  rows.push(row);
  if (ok === false) failures += 1;
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(2)} [${id}] ${step}\n       expected: ${expected}\n       observed: ${row.observed}`,
  );
};
const step = async (id, name, expected, fn) => {
  if (ONLY && !id.startsWith(ONLY)) return { ok: null };
  try {
    const r = await fn();
    record(id, name, expected, r.observed, r.ok);
    return r;
  } catch (error) {
    record(
      id,
      name,
      expected,
      `error: ${error instanceof Error ? error.message : String(error)}`,
      false,
    );
    return { ok: false };
  }
};

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
    await sleep(rand(60, 100));
  }
};
const moveHuman = async (page, from, to, steps = 8) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(12, 24));
  }
};
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(140, 240));
};
const dblclickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.dblclick(x, y);
  await sleep(rand(180, 280));
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
    if ((s.sync?.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 12_000, every = 150) => {
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
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const activeSlide = async (page) => (await state(page)).slideId;
const blocksOf = (slide) => {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string') out.push(node);
      for (const v of Object.values(node)) walk(v);
    }
  };
  if (slide.kind === 'content') walk(slide.slots);
  else if (slide.plate) walk(slide.plate.blocks);
  return out;
};
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
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
const clickRow = async (page, rowId) => {
  const r = await ctl(page, `menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
const sheetPoint = async (page, sx, sy) => {
  const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
  const kk = sheet.w / 1600;
  return { x: sheet.x + sx * kk, y: sheet.y + sy * kk, k: kk };
};
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('contenteditable') === 'true' ? '[contenteditable]' : ''}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.getAttribute('data-run') ? `[run ${a.getAttribute('data-run')}]` : ''}`;
  });
/** The client rect of the nth space separated word inside a run element. */
const wordRect = (page, run, index) =>
  page.evaluate(
    ([r, n]) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      const words = [];
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('[data-prompt]')) continue;
        const text = node.textContent ?? '';
        const re = /\S+/g;
        let m;
        while ((m = re.exec(text)))
          words.push({ node, start: m.index, end: m.index + m[0].length, word: m[0] });
      }
      const w = words[n];
      if (!w) return null;
      const range = document.createRange();
      range.setStart(w.node, w.start);
      range.setEnd(w.node, w.end);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, word: w.word };
    },
    [run, index],
  );
const runInfo = (page, run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const free = el.closest('.free');
    const box = free ? free.getBoundingClientRect() : null;
    return {
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      box: box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null,
      editable: el.getAttribute('contenteditable') === 'true',
      links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      text: el.textContent ?? '',
    };
  }, run);
/** A filmstrip card's client rect after scrolling it into view (the strip scrolls past a dozen cards). */
const cardRect = async (page, slideId) => {
  const card = page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first();
  await card.scrollIntoViewIfNeeded();
  await sleep(200);
  const b = await card.boundingBox();
  if (!b) throw new Error(`no card for ${slideId}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const snackbar = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-control="snackbar"], .ts-snackbar');
    if (!el) return null;
    const text = (
      el.querySelector('.ts-snackbar-text')?.textContent ??
      el.textContent ??
      ''
    ).trim();
    return text === '' ? null : text;
  });
const selectionText = (page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

/** Inserts a text box by Insert > Text box and one click on the sheet; returns the new block id. */
const insertTextBoxAt = async (page, slideId, sx, sy) => {
  const before = blocksOf(await slideJson(page, slideId)).map((b) => b.id);
  await openMenu(page, 'insert');
  await clickRow(page, 'insert.textBox');
  await sleep(300);
  const p = await sheetPoint(page, sx, sy);
  await clickAt(page, p.x, p.y);
  const slide = await pollUntil(
    () => slideJson(page, slideId),
    (s) => blocksOf(s).some((b) => !before.includes(b.id) && b.type === 'text'),
    15_000,
  );
  const block = blocksOf(slide).find((b) => !before.includes(b.id) && b.type === 'text');
  if (!block) {
    const diag = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const d = window.turboslide.studio.describe().state;
        return {
          under: el ? `${el.tagName.toLowerCase()}.${el.className}` : 'none',
          tool: d.tool,
          blockId: d.blockId,
          editing: Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')),
          plates: [...document.querySelectorAll('[data-control$=".plate"]')].map((p) =>
            p.getAttribute('data-control'),
          ),
          sync: d.sync,
        };
      },
      [p.x, p.y],
    );
    throw new Error(`no text box landed at sheet ${sx},${sy}: ${JSON.stringify(diag)}`);
  }
  await page
    .waitForSelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-run="${block.id}/text"][contenteditable="true"]`,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  return block.id;
};
const textOf = async (page, slideId, blockId) => {
  const slide = await slideJson(page, slideId);
  const block = blocksOf(slide).find((b) => b.id === blockId);
  return block
    ? { text: block.text, type: block.type, pos: block.pos, marker: block.marker, block }
    : null;
};
/** Ends any session and clears the selection. */
const clearAll = async (page) => {
  await press(page, 'Escape', 3);
  await sleep(200);
};
/** Selects a text object by a single click on its run and waits for the chip. */
const selectBlock = async (page, blockId) => {
  await clearAll(page);
  const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${blockId}/text"]`);
  if (!r) throw new Error(`no run for ${blockId}`);
  await clickAt(page, r.x + 6, r.y + 6);
  await pollUntil(
    () => state(page),
    (s) => s.blockId === blockId || s.selection?.blockId === blockId,
    4000,
  );
  /* one click on a text box enters its text, as in Google Slides; Escape leaves the box selected */
  if (await editing(page)) {
    await press(page, 'Escape');
    await pollUntil(
      () => editing(page),
      (e) => e === false,
      3000,
    );
  }
};
const rejects = async (page) => {
  const s = await state(page);
  return {
    pending: s.sync?.pending ?? 0,
    rejects: s.sync?.rejects ?? s.rejects?.length ?? 0,
    error: s.sync?.error ?? null,
  };
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
let deckId = '';
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  const titleSlide = await activeSlide(page);
  const runsNow = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runsNow.find((r) => /heading/.test(r)) ?? runsNow[0];

  // ---- the first write: the title
  await step(
    'decks.new.first-write',
    'double click the title, type, Escape',
    'the typed title is stored and the address moves to /edit',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await typeHuman(page, 'Q3 pipeline review for Acme');
      await press(page, 'Escape');
      await settled(page);
      const slide = await slideJson(page, titleSlide);
      return {
        ok: slide.heading === 'Q3 pipeline review for Acme' && /\/edit\//.test(page.url()),
        observed: `${slide.heading}; ${page.url().replace(BASE, '')}`,
      };
    },
  );

  // ---- a Blank slide for the text boxes: every click lands on the empty sheet
  await clickControl(page, 'toolbar.newSlide');
  await pollUntil(
    () => slideOrder(page),
    (o) => o.length === 2,
    10_000,
  );
  await sleep(700);
  const S2 = (await slideOrder(page))[1];
  await pollUntil(
    () => activeSlide(page),
    (a) => a === S2,
    8000,
  );
  {
    await clickControl(page, 'toolbar.layout');
    await page.waitForSelector('[data-control="layout.apply.plate"]', { timeout: 6000 });
    await sleep(250);
    const tile = page.locator('[data-control="layout.apply.plate"] [data-layout="blank"]').first();
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    await pollUntil(
      () => slideJson(page, S2),
      (s) => s.template === 'blank',
      10_000,
    );
    await settled(page);
  }

  const applyLayoutById = async (layout) => {
    const slideId = await activeSlide(page);
    await clickControl(page, 'toolbar.layout');
    await page.waitForSelector('[data-control="layout.apply.plate"]', { timeout: 6000 });
    await sleep(250);
    const tile = page
      .locator(`[data-control="layout.apply.plate"] [data-layout="${layout}"]`)
      .first();
    await tile.scrollIntoViewIfNeeded();
    await sleep(150);
    await tile.click();
    await pollUntil(
      () => slideJson(page, slideId),
      (s) => s.template === layout,
      10_000,
    );
    await sleep(500);
    await settled(page);
    const now = await slideJson(page, slideId);
    if (now.template !== layout)
      throw new Error(`the ${layout} layout did not apply (template ${now.template})`);
  };
  /** A fresh Blank slide: New slide, the move to it, then Blank, so every click lands on empty sheet. */
  const freshBlank = async () => {
    const before = await slideOrder(page);
    await clickControl(page, 'toolbar.newSlide');
    const after = await pollUntil(
      () => slideOrder(page),
      (o) => o.length === before.length + 1,
      10_000,
    );
    const fresh = after.find((id) => !before.includes(id));
    if (!fresh) throw new Error('New slide added nothing');
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === fresh,
      12_000,
    );
    if (active !== fresh)
      throw new Error(`the new slide ${fresh} did not become current (active ${active})`);
    await sleep(400);
    await applyLayoutById('blank');
    return fresh;
  };
  /** A fresh Title and body slide: New slide, then the split layout applied so the starting point is known. */
  const freshSplit = async () => {
    const before = await slideOrder(page);
    await clickControl(page, 'toolbar.newSlide');
    const after = await pollUntil(
      () => slideOrder(page),
      (o) => o.length === before.length + 1,
      10_000,
    );
    const fresh = after.find((id) => !before.includes(id));
    if (!fresh) throw new Error('New slide added nothing');
    /* the shell moves to the new slide once its write is acknowledged (about two seconds on the
       memory tier): wait for it, else the picks land on the old slide */
    const active = await pollUntil(
      () => activeSlide(page),
      (a) => a === fresh,
      12_000,
    );
    if (active !== fresh)
      throw new Error(`the new slide ${fresh} did not become current (active ${active})`);
    await sleep(400);
    await applyLayoutById('split');
    return fresh;
  };
  // ---- text.italic.toolbar-word (rank 10)
  let box1 = null;
  await step(
    'text.italic.toolbar-word',
    'double click a word, click Italic on the toolbar',
    'the word alone is italic and the session stays open',
    async () => {
      box1 = await insertTextBoxAt(page, S2, 320, 560);
      await typeHuman(page, 'Renewal terms apply');
      await press(page, 'Escape');
      await settled(page);
      const w = await wordRect(page, `${box1}/text`, 1);
      await dblclickAt(page, w.x + w.w / 2, w.y + w.h / 2);
      const selected = await selectionText(page);
      await clickControl(page, 'toolbar.italic');
      await sleep(700);
      const t = await textOf(page, S2, box1);
      const still = await editing(page);
      const active = await activeDesc(page);
      return {
        ok: t?.text === 'Renewal [terms]{i} apply' && still,
        observed: `selected "${selected}"; text ${JSON.stringify(t?.text)}; editing ${still}; focus ${active}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.context.text-selection
  await step(
    'text.context.text-selection',
    'right click a selected word; Italic from the menu',
    'the textSelection menu lists Italic and marks the word alone',
    async () => {
      const w = await wordRect(page, `${box1}/text`, 2);
      await dblclickAt(page, w.x + w.w / 2, w.y + w.h / 2);
      await sleep(200);
      await page.mouse.click(w.x + w.w / 2, w.y + w.h / 2, { button: 'right' });
      await sleep(500);
      const menu = await page.evaluate(() => {
        const m = document.querySelector('.ts-context-menu');
        return m
          ? {
              cls: m.className,
              rows: [...m.querySelectorAll('[data-control]')].map((r) =>
                r.getAttribute('data-control'),
              ),
            }
          : null;
      });
      if (!menu)
        return {
          ok: false,
          observed: 'no context menu opened (the browser menu kept the right click)',
        };
      const italic = menu.rows.find((r) => /format\.text\.italic/.test(r));
      if (!italic) return { ok: false, observed: `menu ${menu.cls}; rows ${menu.rows.join(',')}` };
      await clickControl(page, italic);
      await sleep(700);
      const t = await textOf(page, S2, box1);
      return {
        ok: t?.text === 'Renewal [terms]{i} [apply]{i}',
        observed: `menu ${menu.cls}; text ${JSON.stringify(t?.text)}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.link.cmd-k-enter (rank 2)
  await step(
    'text.link.cmd-k-enter',
    'double click a word, Cmd+K, type a URL, Enter',
    'the word carries the link and no URL text lands',
    async () => {
      const w = await wordRect(page, `${box1}/text`, 0);
      await dblclickAt(page, w.x + w.w / 2, w.y + w.h / 2);
      await page.keyboard.press('Meta+k');
      await page.waitForSelector('[data-control="run.link.href"]', { timeout: 5000 });
      await sleep(200);
      await typeHuman(page, 'https://example.com/acme');
      await press(page, 'Enter');
      await sleep(700);
      const t = await textOf(page, S2, box1);
      const info = await runInfo(page, `${box1}/text`);
      return {
        ok:
          t?.text === '[Renewal](https://example.com/acme) [terms]{i} [apply]{i}' &&
          !/https/.test(info?.text ?? ''),
        observed: `text ${JSON.stringify(t?.text)}; shown "${info?.text}"; hrefs ${JSON.stringify(info?.links)}; editing ${await editing(page)}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.link.toolbar-button
  await step(
    'text.link.toolbar-button',
    'double click a word, click Insert link on the toolbar, type, Enter',
    'the word carries the link',
    async () => {
      const w = await wordRect(page, `${box1}/text`, 1);
      await dblclickAt(page, w.x + w.w / 2, w.y + w.h / 2);
      await clickControl(page, 'toolbar.insertLink');
      await page.waitForSelector('[data-control="run.link.href"]', { timeout: 5000 });
      await sleep(200);
      await typeHuman(page, 'example.com/terms');
      await press(page, 'Enter');
      await sleep(700);
      const t = await textOf(page, S2, box1);
      return {
        ok: (t?.text ?? '').includes('[terms](https://example.com/terms){i}'),
        observed: `text ${JSON.stringify(t?.text)}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.color.swatch-on-word (rank 12)
  await step(
    'text.color.swatch-on-word',
    'double click a word, open Text color, pick a swatch',
    'the word takes the colour',
    async () => {
      const w = await wordRect(page, `${box1}/text`, 2);
      await dblclickAt(page, w.x + w.w / 2, w.y + w.h / 2);
      await clickControl(page, 'toolbar.textColor');
      await sleep(400);
      const plate = await page.evaluate(() => {
        const p = document.querySelector('[data-control="toolbar.textColor.plate"]');
        if (!p) return null;
        const buttons = [...p.querySelectorAll('button')].map((b) => ({
          control: b.getAttribute('data-control'),
          label: b.getAttribute('aria-label') ?? b.textContent,
        }));
        return { buttons };
      });
      if (!plate) return { ok: false, observed: `no plate; editing ${await editing(page)}` };
      const swatch =
        plate.buttons.find(
          (b) => b.control && /plate\./.test(b.control) && !/none|reset/i.test(b.label ?? ''),
        ) ??
        plate.buttons[1] ??
        plate.buttons[0];
      if (!swatch?.control)
        return {
          ok: false,
          observed: `plate buttons ${JSON.stringify(plate.buttons).slice(0, 200)}`,
        };
      await clickControl(page, swatch.control);
      await sleep(700);
      const t = await textOf(page, S2, box1);
      const colored = /\[apply\]\{[^}]*\bc:/.test(t?.text ?? '') || t?.block?.color !== undefined;
      return { ok: colored, observed: `swatch ${swatch.control}; text ${JSON.stringify(t?.text)}` };
    },
  );
  await clearAll(page);

  // ---- text.autofit.textbox-grow (rank 11)
  await step(
    'text.autofit.textbox-grow',
    'type a long paragraph into a text box',
    'the box grows; no text overflows the frame',
    async () => {
      const S7 = await freshBlank();
      const box = await insertTextBoxAt(page, S7, 300, 200);
      const before = (await textOf(page, S2, box))?.pos;
      const words =
        'Onboarding for the Acme rollout covers three regional sites, the shared glossary, the review cadence and the quarterly budget check with finance and legal.';
      await typeHuman(page, words);
      await sleep(500);
      const mid = await textOf(page, S7, box);
      await press(page, 'Escape');
      await settled(page);
      const after = await textOf(page, S7, box);
      const info = await runInfo(page, `${box}/text`);
      const k = (await sheetPoint(page, 0, 0)).k;
      const contentH = info ? info.rect.h / k : 0;
      const boxBottom = info?.box ? info.box.y + info.box.h : 0;
      const runBottom = info ? info.rect.y + info.rect.h : 0;
      const fits = after?.pos && runBottom <= boxBottom + 2;
      return {
        ok: Boolean(fits) && (after?.pos?.h ?? 0) > (before?.h ?? 0),
        observed: `pos.h ${before?.h} -> mid ${mid?.pos?.h} -> ${after?.pos?.h}; content ${Math.round(contentH)} sheet px; run bottom ${Math.round(runBottom)} vs box bottom ${Math.round(boxBottom)} css px; autofit ${after?.block?.autofit}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.textbox.burst-reliability (rank 13)
  await step(
    'text.textbox.burst-reliability',
    'insert three text boxes in a row and type into each without pauses',
    'no refused write, no doubled word',
    async () => {
      const typed = ['Onboarding', 'Renewal', 'Expansion'];
      const ids = [];
      const S8 = await freshBlank();
      for (let i = 0; i < 3; i += 1) {
        const id = await insertTextBoxAt(page, S8, 200, 120 + i * 260);
        ids.push(id);
        await page.keyboard.type(typed[i], { delay: 12 });
        await sleep(60);
      }
      await sleep(800);
      await press(page, 'Escape');
      const s = await settled(page, 25_000);
      const texts = [];
      for (const id of ids) texts.push((await textOf(page, S8, id))?.text ?? null);
      const dialog = await page.evaluate(
        () =>
          document.querySelector('[role="alertdialog"], .ts-reject, [data-control="reject.card"]')
            ?.textContent ?? null,
      );
      const save = await page.evaluate(
        () => document.querySelector('[data-control="title.saveState"]')?.textContent ?? null,
      );
      const ok =
        texts.every((t, i) => t === typed[i]) &&
        (s.sync?.rejects ?? 0) === 0 &&
        !/retrying/i.test(save ?? '');
      return {
        ok,
        observed: `texts ${JSON.stringify(texts)}; sync ${JSON.stringify(s.sync)}; save "${save}"; dialog ${dialog ? dialog.slice(0, 120) : 'none'}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.list.chords
  await step(
    'text.list.chords',
    'select a text box, Cmd+Shift+8; select another, Cmd+Shift+7',
    'a bulleted list, then a numbered list',
    async () => {
      const S9 = await freshBlank();
      const boxA = await insertTextBoxAt(page, S9, 300, 200);
      await typeHuman(page, 'Agenda');
      await press(page, 'Escape');
      await settled(page);
      await selectBlock(page, boxA);
      await page.keyboard.press('Meta+Shift+8');
      await sleep(700);
      const a = await textOf(page, S9, boxA);
      const snackA = await snackbar(page);
      const boxB = await insertTextBoxAt(page, S9, 300, 560);
      await typeHuman(page, 'Steps');
      await press(page, 'Escape');
      await settled(page);
      await selectBlock(page, boxB);
      await page.keyboard.press('Meta+Shift+7');
      await sleep(700);
      const b = await textOf(page, S9, boxB);
      const snackB = await snackbar(page);
      return {
        ok:
          a?.type === 'plain' &&
          a?.marker === 'bullet' &&
          b?.type === 'plain' &&
          b?.marker === 'number',
        observed: `A after 8: ${a?.type}/${a?.marker} (${snackA}); B after 7: ${b?.type}/${b?.marker} (${snackB})`,
      };
    },
  );
  await clearAll(page);

  // ---- text.list.bulleted-toolbar / numbered-toolbar (rank 9, the surface lane's fix in the tree)
  await step(
    'text.list.bulleted-toolbar',
    'select a fresh text box, click the toolbar Bulleted list button',
    'the box becomes a bulleted list',
    async () => {
      const S10 = await freshBlank();
      const box = await insertTextBoxAt(page, S10, 300, 300);
      await typeHuman(page, 'Agenda item');
      await press(page, 'Escape');
      await settled(page);
      await selectBlock(page, box);
      await clickControl(page, 'toolbar.bulletedList');
      await sleep(800);
      const t = await textOf(page, S10, box);
      return {
        ok: t?.type === 'plain' && t?.marker === 'bullet',
        observed: `${t?.type}/${t?.marker}`,
      };
    },
  );
  await clearAll(page);

  // ---- text.format-menu.text-fitting and text.format-options.panel
  await step(
    'text.format-menu.text-fitting',
    'right click a text box; Text fitting',
    'the row is listed and opens Format options',
    async () => {
      const S11 = await freshBlank();
      const fitBox = await insertTextBoxAt(page, S11, 300, 300);
      await typeHuman(page, 'Fitting');
      await press(page, 'Escape');
      await settled(page);
      await clearAll(page);
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${fitBox}/text"]`);
      const readRows = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.ts-context-menu [data-control]')].map((el) =>
            el.getAttribute('data-control'),
          ),
        );
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
      await sleep(500);
      const rowsUnselected = await readRows();
      await press(page, 'Escape');
      await sleep(200);
      await selectBlock(page, fitBox);
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
      await sleep(500);
      const rowsSelected = await readRows();
      const rows = rowsSelected.length > 0 ? rowsSelected : rowsUnselected;
      const note = `unselected ${rowsUnselected.length} rows, selected ${rowsSelected.length} rows`;
      if (rowsSelected.length === 0 && rowsUnselected.length > 0) {
        await press(page, 'Escape');
        await sleep(200);
        await clearAll(page);
        await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
        await sleep(500);
      }
      const row = rows.find((x) => /format\.textFitting/.test(x));
      if (!row) return { ok: false, observed: `rows ${rows.join(',')}; ${note}` };
      await clickControl(page, row);
      await sleep(600);
      const panel = await page.evaluate(
        () =>
          document
            .querySelector(
              '[data-control="panel.formatOptions"], .ts-panel[data-panel="formatOptions"], [data-control^="panel"]',
            )
            ?.getAttribute('data-control') ?? null,
      );
      return { ok: panel !== null && rowsSelected.length > 0, observed: `${note}; panel ${panel}` };
    },
  );
  await clearAll(page);
  await step(
    'text.format-options.panel',
    'Format > Format options with a text box selected',
    'the panel opens with its text sections',
    async () => {
      const S12 = await freshBlank();
      const panelBox = await insertTextBoxAt(page, S12, 300, 300);
      await typeHuman(page, 'Options');
      await press(page, 'Escape');
      await settled(page);
      await selectBlock(page, panelBox);
      await openMenu(page, 'format');
      await clickRow(page, 'format.formatOptions');
      await sleep(600);
      const panel = await page.evaluate(() => {
        const p = document.querySelector('[data-control^="panel"]');
        return p
          ? { control: p.getAttribute('data-control'), text: (p.textContent ?? '').slice(0, 160) }
          : null;
      });
      return {
        ok: panel !== null && /text|Text/.test(panel.text),
        observed: JSON.stringify(panel),
      };
    },
  );
  await clearAll(page);
  await press(page, 'Escape', 2);

  // ---- arrange.keys.backspace-empty-selection (rank 4)
  await step(
    'arrange.keys.backspace-empty-selection',
    'click the empty canvas, press Backspace then Delete',
    'nothing selected: no slide leaves',
    async () => {
      const before = await slideOrder(page);
      const p = await sheetPoint(page, 1560, 860);
      await clickAt(page, p.x, p.y);
      await sleep(200);
      const active = await activeDesc(page);
      await press(page, 'Backspace');
      await sleep(500);
      await press(page, 'Delete');
      await sleep(600);
      const after = await slideOrder(page);
      return {
        ok: after.length === before.length,
        observed: `slides ${before.length} -> ${after.length}; focus ${active}`,
      };
    },
  );

  // ---- slides.layout.fresh-slide-two-picks-no-carry (rank 8) and snackbar (rank 31)
  await step(
    'slides.layout.fresh-slide-two-picks-no-carry',
    'fresh Title and body: Section header then Title and body; Ruled statement list then Title and table',
    "only the second layout's placeholders remain",
    async () => {
      const fresh = await freshSplit();
      const madeTypes = blocksOf(await slideJson(page, fresh)).map((x) => x.type);
      await applyLayoutById('opener');
      await applyLayoutById('split');
      const aTypes = blocksOf(await slideJson(page, fresh)).map((x) => x.type);
      const fresh2 = await freshSplit();
      await applyLayoutById('plain');
      await applyLayoutById('table');
      const bTypes = blocksOf(await slideJson(page, fresh2)).map((x) => x.type);
      const ok =
        aTypes.join(',') === madeTypes.join(',') &&
        !aTypes.includes('shot') &&
        !bTypes.includes('plain') &&
        bTypes.includes('table');
      return {
        ok,
        observed: `A: ${madeTypes.join(',')} -> ${aTypes.join(',')}; B: ${bTypes.join(',')}`,
      };
    },
  );
  await step(
    'slides.layout.snackbar-counts-typed-only',
    'apply Title slide to a fresh Title and body and read the snackbar',
    'no dropped block warning',
    async () => {
      const fresh = await freshSplit();
      await sleep(5500);
      await clickControl(page, 'toolbar.layout');
      await page.waitForSelector('[data-control="layout.apply.plate"]', { timeout: 6000 });
      await sleep(250);
      await page
        .locator('[data-control="layout.apply.plate"] [data-layout="title"]')
        .first()
        .click();
      const text = await pollUntil(
        () => snackbar(page),
        (t) => t !== null,
        5000,
      );
      const slide = await slideJson(page, fresh);
      return {
        ok: slide.template === 'title' && (text === null || !/did not fit/.test(text)),
        observed: `template ${slide.template}; snackbar ${JSON.stringify(text)} (a pick with nothing dropped raises no count)`,
      };
    },
  );

  // ---- slides.reorder.cmd-shift-up-down and menu up/down/beginning
  await step(
    'slides.reorder.cmd-shift-up-down',
    'focus a card, Cmd+Shift+Down then Cmd+Shift+Up',
    'the card moves to the end, then to the beginning',
    async () => {
      const order = await slideOrder(page);
      const target = order[1];
      const card = await cardRect(page, target);
      await clickAt(page, card.x + card.w / 2, card.y + card.h / 2);
      await sleep(300);
      await page.keyboard.press('Meta+Shift+ArrowDown');
      await sleep(800);
      const afterDown = await slideOrder(page);
      await page.keyboard.press('Meta+Shift+ArrowUp');
      await sleep(800);
      const afterUp = await slideOrder(page);
      return {
        ok: afterDown[afterDown.length - 1] === target && afterUp[0] === target,
        observed: `down: ${afterDown.indexOf(target)} of ${afterDown.length}; up: ${afterUp.indexOf(target)}`,
      };
    },
  );
  await step(
    'slides.reorder.menu-up-down-beginning',
    'Slide > Move slide > up, down, to beginning',
    'each moves the current card',
    async () => {
      const order = await slideOrder(page);
      const target = order[0];
      const card = await cardRect(page, target);
      await clickAt(page, card.x + card.w / 2, card.y + card.h / 2);
      await sleep(300);
      const move = async (row) => {
        await openMenu(page, 'slide');
        await hoverRow(page, 'slide.moveSlide', `[data-control="menu.${row}"]`);
        await clickRow(page, row);
        await sleep(800);
        return (await slideOrder(page)).indexOf(target);
      };
      const down = await move('slide.moveSlide.down');
      const up = await move('slide.moveSlide.up');
      const end = await move('slide.moveSlide.toEnd');
      const begin = await move('slide.moveSlide.toBeginning');
      return {
        ok: down === 1 && up === 0 && end === order.length - 1 && begin === 0,
        observed: `down ${down}, up ${up}, end ${end}, beginning ${begin}`,
      };
    },
  );

  // ---- slides.notes.view-menu-toggle
  await step(
    'slides.notes.view-menu-toggle',
    'View > Show speaker notes twice',
    'the notes pane hides, then shows',
    async () => {
      const shown0 = await page.evaluate(() => {
        const n = document.querySelector('.ts-notes');
        return n
          ? !n.classList.contains('is-hidden') && n.getBoundingClientRect().height > 4
          : false;
      });
      await openMenu(page, 'view');
      await clickRow(page, 'view.showSpeakerNotes');
      await sleep(600);
      const shown1 = await page.evaluate(() => {
        const n = document.querySelector('.ts-notes');
        return n
          ? !n.classList.contains('is-hidden') && n.getBoundingClientRect().height > 4
          : false;
      });
      await openMenu(page, 'view');
      await clickRow(page, 'view.showSpeakerNotes');
      await sleep(600);
      const shown2 = await page.evaluate(() => {
        const n = document.querySelector('.ts-notes');
        return n
          ? !n.classList.contains('is-hidden') && n.getBoundingClientRect().height > 4
          : false;
      });
      return { ok: shown0 && !shown1 && shown2, observed: `${shown0} -> ${shown1} -> ${shown2}` };
    },
  );

  // ---- slides.context.empty-canvas
  await step(
    'slides.context.empty-canvas',
    'right click the empty sheet; New slide from it',
    'the eight rows are listed and a slide is added',
    async () => {
      await clearAll(page);
      const p = await sheetPoint(page, 1500, 40);
      await page.mouse.click(p.x, p.y, { button: 'right' });
      await sleep(500);
      const menu = await page.evaluate(() => {
        const m = document.querySelector('.ts-context-menu');
        return m
          ? {
              cls: m.className,
              rows: [
                ...m.querySelectorAll(
                  '[role="menuitem"], [data-control^="context."], [data-control^="menu."]',
                ),
              ]
                .map((r) => (r.textContent ?? '').trim().split('\n')[0])
                .filter(Boolean),
            }
          : null;
      });
      if (!menu) return { ok: false, observed: 'no menu' };
      const before = (await slideOrder(page)).length;
      const row = page.locator('.ts-context-menu [data-control*="slide.newSlide"]').first();
      const r = await row.boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await sleep(900);
      const after = (await slideOrder(page)).length;
      const wanted = [
        'Paste',
        'New slide',
        'Duplicate slide',
        'Delete slide',
        'Skip slide',
        'Change background',
        'Apply layout',
        'Comment',
      ];
      const missing = wanted.filter((w) => !menu.rows.some((x) => x.startsWith(w)));
      return {
        ok: missing.length === 0 && after === before + 1,
        observed: `${menu.cls}; rows ${menu.rows.join(' | ')}; missing ${missing.join(',') || 'none'}; slides ${before} -> ${after}`,
      };
    },
  );

  // ---- slides.clipboard.copy-paste-card (within one deck; the two tab case is core/slides.spec.ts)
  await step(
    'slides.clipboard.copy-paste-card',
    'right click a card > Copy, right click another card > Paste',
    'the slide lands after the second card with its text',
    async () => {
      await clearAll(page);
      const order = await slideOrder(page);
      const source = order[0];
      const target = order[order.length - 1];
      const sourceSlide = await slideJson(page, source);
      const sourceTexts =
        JSON.stringify(blocksOf(sourceSlide).map((b) => [b.type, b.text ?? ''])) +
        JSON.stringify(sourceSlide.heading ?? '');
      const a = await cardRect(page, source);
      await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2, { button: 'right' });
      await sleep(500);
      const copyRow = page.locator('.ts-context-menu [data-control*="edit.copy"]').first();
      const cr = await copyRow.boundingBox();
      if (!cr) return { ok: false, observed: 'no Copy row on the card menu' };
      await clickAt(page, cr.x + cr.width / 2, cr.y + cr.height / 2);
      await page
        .locator('.ts-context-menu')
        .first()
        .waitFor({ state: 'detached', timeout: 5000 })
        .catch(() => undefined);
      await sleep(500);
      const b = await cardRect(page, target);
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2, { button: 'right' });
      let pasteRow = page.locator('.ts-context-menu [data-control*="edit.paste"]').first();
      let pr = await pasteRow.boundingBox({ timeout: 4000 }).catch(() => null);
      if (!pr) {
        /* one retry: the first menu's close and the card's focus move can swallow a right click that follows at once */
        await press(page, 'Escape');
        await sleep(400);
        await page.mouse.move(b.x + b.w / 2 - 20, b.y + b.h / 2 - 10);
        await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2, { button: 'right' });
        pasteRow = page.locator('.ts-context-menu [data-control*="edit.paste"]').first();
        pr = await pasteRow.boundingBox({ timeout: 4000 }).catch(() => null);
      }
      if (!pr) return { ok: false, observed: 'no Paste row on the card menu' };
      await clickAt(page, pr.x + pr.width / 2, pr.y + pr.height / 2);
      await pollUntil(
        () => slideOrder(page),
        (o) => o.length > order.length,
        10_000,
      );
      await sleep(1500);
      await settled(page);
      const after = await slideOrder(page);
      const addedAll = after.filter((id) => !order.includes(id));
      const added = addedAll[0];
      const landedAfter = added !== undefined && after.indexOf(added) === after.indexOf(target) + 1;
      const addedSlide = added ? await slideJson(page, added) : null;
      const text =
        addedSlide !== null &&
        JSON.stringify(blocksOf(addedSlide).map((b) => [b.type, b.text ?? ''])) +
          JSON.stringify(addedSlide.heading ?? '') ===
          sourceTexts;
      const activeBefore = order.indexOf(await activeSlide(page));
      return {
        ok: landedAfter && text,
        observed: `slides ${order.length} -> ${after.length}; added ${added} at ${added ? after.indexOf(added) : -1} (target at ${after.indexOf(target)}); content copied ${text}; added all ${addedAll.join(',')}; source card ${source} (index 0), active before ${activeBefore}`,
      };
    },
  );

  // ---- text.textbox.toolbar-button
  await step(
    'text.textbox.toolbar-button',
    'the toolbar Text box button, then a click on the sheet, type',
    'a box that takes typing',
    async () => {
      const slideId = await activeSlide(page);
      const before = blocksOf(await slideJson(page, slideId)).map((b) => b.id);
      await clickControl(page, 'toolbar.textBox');
      await sleep(300);
      const p = await sheetPoint(page, 1380, 820);
      await clickAt(page, p.x, p.y);
      await pollUntil(
        () => slideJson(page, slideId),
        (s) => blocksOf(s).some((b) => !before.includes(b.id)),
        10_000,
      );
      await sleep(400);
      await typeHuman(page, 'From the button');
      await press(page, 'Escape');
      await settled(page);
      const block = blocksOf(await slideJson(page, slideId)).find((b) => !before.includes(b.id));
      return {
        ok: block?.text === 'From the button',
        observed: `${block?.type} ${JSON.stringify(block?.text)}`,
      };
    },
  );

  // ---- text.clipboard.paste-without-formatting
  await step(
    'text.clipboard.paste-without-formatting',
    'copy a bold word from one box, Cmd+Shift+V into another',
    'plain text lands, no marks',
    async () => {
      const slideId = await activeSlide(page);
      const a = await insertTextBoxAt(page, slideId, 300, 700);
      await typeHuman(page, 'Bold word');
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Meta+b');
      await sleep(300);
      await page.keyboard.press('Meta+c');
      await press(page, 'Escape');
      await settled(page);
      const source = await textOf(page, slideId, a);
      const b = await insertTextBoxAt(page, slideId, 900, 760);
      await page.keyboard.press('Meta+Shift+v');
      await sleep(600);
      let route = 'Cmd+Shift+V';
      let dest = await textOf(page, slideId, b);
      const domNow = await runInfo(page, `${b}/text`);
      if ((domNow?.text ?? '') === '') {
        /* the chord pasted nothing: does a plain Cmd+V paste here, so the clipboard holds the text? */
        await page.keyboard.press('Meta+v');
        await sleep(600);
        const plain = await runInfo(page, `${b}/text`);
        route = `Cmd+Shift+V pasted nothing in headless Chromium; plain Cmd+V then pasted ${JSON.stringify(plain?.text ?? '')}`;
      }
      await press(page, 'Escape');
      await settled(page);
      dest = await textOf(page, slideId, b);
      return {
        ok:
          dest?.text === 'Bold word' &&
          /\*Bold word\*/.test(source?.text ?? '') &&
          route === 'Cmd+Shift+V',
        observed: `source ${JSON.stringify(source?.text)}; dest ${JSON.stringify(dest?.text)}; route ${route}`,
      };
    },
  );

  // ---- text.layout-runs.type (a table cell and the big number)
  await step(
    'text.layout-runs.type',
    'type into a table cell of Title and table and the number of Big number, reload, read back',
    'each reads back',
    async () => {
      const tableSlide = await freshSplit();
      await applyLayoutById('table');
      const cellRun = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')]
          .map((el) => el.getAttribute('data-run'))
          .find((r) => /cells\/1$/.test(r)),
      );
      if (!cellRun) return { ok: false, observed: 'no table cell run' };
      const cr = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${cellRun}"]`);
      await dblclickAt(page, cr.x + cr.w / 2, cr.y + cr.h / 2);
      await typeHuman(page, '42');
      await press(page, 'Escape');
      await settled(page);
      const bigSlide = await freshSplit();
      await applyLayoutById('big-number');
      const bigRun = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')]
          .map((el) => el.getAttribute('data-run'))
          .find((r) => /big|heading|^h\//.test(r)),
      );
      const br = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${bigRun}"]`);
      await dblclickAt(page, br.x + br.w / 2, br.y + br.h / 2);
      await typeHuman(page, '3.2M');
      await press(page, 'Escape');
      await settled(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await editorReady(page);
      const t = await slideJson(page, tableSlide);
      const bg = await slideJson(page, bigSlide);
      const cellText = JSON.stringify(t).includes('"42"');
      const bigText = JSON.stringify(bg).includes('3.2M');
      return {
        ok: cellText && bigText,
        observed: `cell 42 ${cellText}; big 3.2M ${bigText} (${bigRun})`,
      };
    },
  );
} catch (error) {
  record(
    'probe',
    'no exception outside a step',
    '',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    false,
  );
} finally {
  if (deckId) {
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      const res = await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 });
      record(
        'teardown',
        'File > Move to trash, Delete forever, GET 404',
        '404',
        `status ${res.status()}`,
        res.status() === 404,
      );
    } catch (error) {
      record(
        'teardown',
        'the trash path',
        '',
        `failed: ${error instanceof Error ? error.message : String(error)}`,
        false,
      );
    }
  }
  await browser.close();
  const summary = {
    base: BASE,
    deckId,
    ok: rows.filter((r) => r.ok === true).length,
    failed: failures,
    notDriven: rows.filter((r) => r.ok === null).length,
    consoleErrors: consoleErrors.slice(0, 10),
    rows,
  };
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
  console.log(
    `\n${summary.ok} ok, ${summary.failed} failed, ${summary.notDriven} not driven; console errors ${consoleErrors.length}`,
  );
  process.exit(failures > 0 ? 1 : 0);
}

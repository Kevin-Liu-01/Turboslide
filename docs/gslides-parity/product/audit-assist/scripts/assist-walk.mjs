// The assist audit walk against production (the auditor of "AI assist for sellers on an agent
// native editor"). Drives the product the way a seller does, at human speed, on one scratch deck
// made from /new, and records what a seller meets today where an assistant would sit: the title
// row and the toolbar (no entry point), Search the menus with seller phrasings, Check slides (the
// one suggestion surface), the Agent access dialog and Run an action (the raw agent surface), an
// agent write arriving from outside (the banner, the undo, the version row, the lease), the layout
// picker (the brand layouts an outline would land on), and the reads an assist would send as the
// deck's context (deck.info, export.text, slide.get). The deck is trashed and deleted forever in
// the finally block and its 404 is read. Imports nothing from the repository but playwright-core.
//
//   node assist-walk.mjs [--base https://turboslide.vercel.app] [--out <evidence dir>]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = arg('out', '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/product/audit-assist');
mkdirSync(OUT, { recursive: true });

// the bearer for the one write that arrives from outside; read, never printed or written
let token = null;
try {
  const hosts = JSON.parse(
    readFileSync(path.join(homedir(), '.config/turboslide/hosts.json'), 'utf8'),
  ).hosts;
  token = hosts[BASE]?.token ?? null;
} catch {
  token = null;
}

// ---------------------------------------------------------------------------------------------
// the table
const rows = [];
const startedAt = Date.now();
const record = (step, expected, observed, ok, extra = {}) => {
  const row = { n: rows.length + 1, step, expected, observed: String(observed), ok, ...extra };
  rows.push(row);
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed.slice(0, 600)}`,
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
      `error: ${error instanceof Error ? error.message : String(error)}`,
      false,
    );
    return { ok: false, observed: 'error' };
  }
};

// ---------------------------------------------------------------------------------------------
// human speed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const typeHuman = async (page, text) => {
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (page, key) => {
  await page.keyboard.press(key);
  await sleep(rand(60, 110));
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
  await sleep(rand(200, 320));
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
    const s = await state(page);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const waitRevision = async (page, want, timeout = 25_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
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
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible({ timeout: 300 })
    .catch(() => false);
const rectOf = async (page, selector) => {
  const r = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
  return r;
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const openMenu = async (page, id) => {
  await clickControl(page, `menubar.${id}`);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 300));
};
const hoverRow = async (page, rowId, waitFor) => {
  const r = await ctl(page, `menu.${rowId}`).first().boundingBox();
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
const menuRows = (page, menuId) =>
  page.evaluate(
    (root) =>
      [...document.querySelectorAll(`${root} [data-control^="menu."]`)]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          id: el.getAttribute('data-control').replace(/^menu\./, ''),
          label: el.textContent?.trim() ?? '',
          disabled: el.getAttribute('aria-disabled') === 'true',
        })),
    `#ts-menu-${menuId}`,
  );
const controlsUnder = (page, prefix) =>
  page.evaluate(
    (p) =>
      [...document.querySelectorAll(`[data-control^="${p}"]`)]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          id: el.getAttribute('data-control'),
          label: (
            el.getAttribute('aria-label') ??
            el.getAttribute('data-tip') ??
            el.textContent ??
            ''
          )
            .trim()
            .slice(0, 80),
        })),
    prefix,
  );
/** The runs on the stage: data-run id, its rect and text. */
const runs = (page) =>
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
const stageText = (page) =>
  page.evaluate(
    () => document.querySelector('.ts-stagewrap.ts-editor .pt-slide')?.textContent?.trim() ?? '',
  );
const snackbar = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
        .filter((el) => el.closest('.ts-overlay') === null && el.textContent?.trim())
        .map((el) => el.textContent?.trim() ?? '')
        .join(' | ') || null,
  );
const banner = (page) =>
  page.evaluate(
    () => document.querySelector('.ts-banner[data-state="external"]')?.textContent?.trim() ?? null,
  );
const shot = async (page, name) => {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  return file;
};
const openRun = async (page, run) => {
  const list = await runs(page);
  const info = list.find((x) => x.run === run);
  if (!info) throw new Error(`no run ${run} on the stage`);
  await dblclickAt(page, info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
  await sleep(250);
};
const paletteRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-control^="palette."]')]
      .filter(
        (el) =>
          el.getClientRects().length > 0 && el.getAttribute('data-control') !== 'palette.query',
      )
      .map((el) => ({
        id: el.getAttribute('data-control'),
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '',
      })),
  );
const paletteCount = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('[data-control="palette"]');
    const empty = document.querySelector('.pt-search-empty')?.textContent?.trim() ?? null;
    const count = card
      ? (card.textContent?.match(/(\d+ results?|Nothing matches)/)?.[0] ?? null)
      : null;
    return { count, empty };
  });

// ---------------------------------------------------------------------------------------------
// the walk
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
let deckId = null;
let titleSlide = null;
let secondSlide = null;
const facts = {};
const TITLE = 'Acme pricing review, Q3 2026';
const BULLETS = [
  'Pricing per seat, billed yearly',
  'Onboarding in two weeks',
  'Support in twelve languages',
];
const NOTE = 'Ask about their renewal date before the pricing slide.';

try {
  // ---- 1. a scratch deck from /new with its title
  await step(
    'open /new and type the title',
    'the editor is ready; the title is written; the address is /edit/<id>',
    async () => {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      const info = await invoke(page, 'deck.info');
      deckId = info.id;
      const s = await state(page);
      titleSlide = s.slideId;
      if (await has(page, '[data-control="dialog.namePrompt"]'))
        await clickControl(page, 'dialog.namePrompt.close').catch(() => undefined);
      const list = await runs(page);
      const head = list.find((x) => /heading/.test(x.run)) ?? list[0];
      if (!head) return { ok: false, observed: 'no run on the stage' };
      await openRun(page, head.run);
      await typeHuman(page, TITLE);
      await sleep(300);
      await press(page, 'Escape');
      const rev = await waitRevision(page, 1, 30_000);
      await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
      await settled(page);
      const text = await stageText(page);
      return {
        ok: rev >= 1 && /\/edit\//.test(page.url()) && text.includes('Acme'),
        observed: `deck ${deckId}, revision ${rev}, ${page.url().replace(BASE, '')}, stage reads "${text.slice(0, 60)}"`,
      };
    },
  );

  // ---- 2. where an assistant would sit: the title row and the toolbar
  await step(
    'read the title row and the toolbar for an assistant entry point',
    'no control named Ask, Assist, Gemini or AI',
    async () => {
      const title = await controlsUnder(page, 'title.');
      const toolbar = await controlsUnder(page, 'toolbar.');
      const menubar = await controlsUnder(page, 'menubar.');
      const words = /ask|assist|gemini|\bai\b|help me/i;
      const hits = [...title, ...toolbar, ...menubar].filter(
        (c) => words.test(c.label) || words.test(c.id),
      );
      facts.titleRow = title;
      facts.toolbar = toolbar;
      facts.menubar = menubar.map((c) => c.id);
      await shot(page, '01-editor-title-row-no-assist.png');
      return {
        ok: hits.length === 0,
        observed: `title row ${title.length} controls (${title.map((c) => c.id.replace('title.', '')).join(', ')}); toolbar ${toolbar.length}; menubar ${menubar.map((c) => c.id.replace('menubar.', '')).join(' ')}; assistant words: ${hits.length === 0 ? 'none' : hits.map((h) => h.id).join(', ')}`,
      };
    },
  );

  // ---- 3. a second slide with three lines in the body, and a speaker note
  await step(
    'New slide from the toolbar, three lines typed in the body',
    'a second slide whose body holds three paragraphs',
    async () => {
      const before = (await invoke(page, 'slide.list')).length ?? null;
      await clickControl(page, 'toolbar.newSlide');
      await pollUntil(
        () => state(page),
        (s) => s.slideId !== titleSlide,
        10_000,
      );
      await sleep(600);
      const s = await state(page);
      secondSlide = s.slideId;
      const list = await runs(page);
      const head = list.find((x) => /heading/.test(x.run)) ?? null;
      const body = list.find((x) => x !== head) ?? null;
      if (head) {
        await openRun(page, head.run);
        await typeHuman(page, 'What Acme gets');
        await press(page, 'Escape');
        await sleep(300);
      }
      if (!body)
        return {
          ok: false,
          observed: `slide ${secondSlide}: runs ${list.map((x) => x.run).join(', ')}; no body run`,
        };
      await openRun(page, body.run);
      await typeHuman(page, BULLETS.join('\n'));
      await sleep(300);
      await press(page, 'Escape');
      await settled(page);
      const got = await invoke(page, 'slide.get', { slideId: secondSlide });
      const slide = got.slide ?? got;
      const json = JSON.stringify(slide);
      const paragraphs = BULLETS.filter((b) => json.includes(b)).length;
      facts.secondSlide = {
        id: secondSlide,
        kind: slide.kind,
        layout: slide.layout,
        blocks: JSON.stringify(slide).length,
      };
      await shot(page, '02-second-slide-three-lines.png');
      return {
        ok: paragraphs === 3,
        observed: `slide ${secondSlide} (${slide.kind}, layout ${JSON.stringify(slide.layout).slice(0, 40)}): ${paragraphs} of 3 lines found in the document; slides ${before} before`,
      };
    },
  );

  await step(
    'type a speaker note under the slide',
    'slide.notes carries the sentence',
    async () => {
      const r = await rectOf(page, '[data-control="notes.text"]');
      if (!r) return { ok: false, observed: 'no notes pane' };
      await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await typeHuman(page, NOTE);
      await sleep(300);
      // leave the field the way a person does: click the workspace beside the sheet
      await clickAt(page, 1400, 500);
      await settled(page);
      const got = await pollUntil(
        () =>
          invoke(page, 'slide.get', { slideId: secondSlide }).then(
            (g) => (g.slide ?? g).notes ?? null,
          ),
        (n) => n !== null && n.includes('renewal'),
        8000,
      );
      return {
        ok: typeof got === 'string' && got.includes('renewal'),
        observed: `notes: ${JSON.stringify(got)}`,
      };
    },
  );

  // ---- 4. Search the menus with a seller's words
  const PHRASES = [
    ['find and replace', 'Find and replace'],
    ['rename the customer', 'Find and replace'],
    ['change the customer name', 'Find and replace'],
    ['bigger text', 'Font size or Increase font size'],
    ['font size', 'Increase or decrease font size'],
    ['speaker notes', 'Show speaker notes'],
    ['talk track', 'Show speaker notes'],
    ['logo', 'Replace image'],
    ['replace image', 'Replace image'],
    ['translate', 'nothing today'],
    ['agenda', 'nothing today'],
    ['summarize', 'nothing today'],
    ['shorter', 'nothing today'],
    ['align', 'Align'],
    ['pdf', 'PDF Document'],
    ['send a pdf', 'PDF Document'],
    ['duplicate', 'Duplicate slide'],
    ['hide slide', 'Skip slide'],
    ['skip slide', 'Skip slide'],
    ['delete slide', 'Delete slide'],
    ['assistant', 'nothing today'],
    ['help me write', 'nothing today'],
  ];
  facts.search = [];
  const SHOT_PHRASES = new Set(['rename the customer', 'bigger text', 'translate', 'hide slide']);
  for (const [phrase, expect] of PHRASES) {
    await step(`Search the menus: "${phrase}"`, `rows for ${expect}`, async () => {
      await clickControl(page, 'toolbar.search');
      await page.locator('[data-control="palette.query"]').waitFor({ timeout: 8000 });
      await typeHuman(page, phrase);
      await sleep(500);
      const list = await paletteRows(page);
      const count = await paletteCount(page);
      let file = null;
      if (SHOT_PHRASES.has(phrase))
        file = await shot(page, `03-search-${phrase.replace(/\s+/g, '-')}.png`);
      await press(page, 'Escape');
      await page
        .locator('[data-control="palette.query"]')
        .waitFor({ state: 'detached', timeout: 4000 })
        .catch(() => undefined);
      const rowsText = list.map((r) => r.text).join(' || ');
      facts.search.push({
        phrase,
        expect,
        rows: list.length,
        ids: list.map((r) => r.id),
        texts: list.map((r) => r.text),
        count,
        file,
      });
      return {
        ok: null,
        observed: `${count.count ?? count.empty ?? `${list.length} rows`}: ${rowsText.slice(0, 400) || 'no rows'}`,
        extra: { rows: list.length },
      };
    });
  }

  // ---- 5. Check slides, the one suggestion surface
  await step(
    'Tools > Check slides on slide two',
    'the panel lists suggestions with Fix where one exists',
    async () => {
      await openMenu(page, 'tools');
      const toolsRows = await menuRows(page, 'tools');
      facts.toolsMenu = toolsRows.map((r) => r.id);
      await clickRow(page, 'tools.checkSlides');
      await page.locator('[data-control="panel.checkSlides"]').waitFor({ timeout: 8000 });
      await sleep(800);
      const suggestions = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="suggestion."]')].map((el) => ({
          id: el.getAttribute('data-control'),
          text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) ?? '',
          fix: el.querySelector('button[aria-label^="Fix"]') !== null,
        })),
      );
      const head = await page.evaluate(
        () =>
          document
            .querySelector('[data-control="panel.checkSlides"] .ts-panel-head')
            ?.textContent?.trim() ?? '',
      );
      const empty = await page.evaluate(
        () =>
          document
            .querySelector('[data-control="panel.checkSlides"] .ts-lint-empty')
            ?.textContent?.trim() ?? null,
      );
      facts.checkSlides = { head, suggestions, empty };
      await shot(page, '04-check-slides-panel.png');
      // close the panel through its X
      const x = page.locator('[data-control="panel.checkSlides"] .ts-panel-head button').last();
      const r = await x.boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      return {
        ok: true,
        observed: `panel "${head}"; ${suggestions.length} suggestions (${suggestions.filter((s) => s.fix).length} with Fix): ${suggestions
          .map((s) => s.text)
          .join(' || ')
          .slice(0, 400)}${empty ? `; empty: ${empty}` : ''}`,
      };
    },
  );

  // ---- 6. the raw agent surface: Extensions > Agent access and Run an action, behind the switch
  await step(
    'Extensions with the switch off, then Tools > Advanced tools on',
    'Extensions is not drawn; after the switch it is',
    async () => {
      const before = (await controlsUnder(page, 'menubar.')).map((c) =>
        c.id.replace('menubar.', ''),
      );
      await openMenu(page, 'tools');
      const checkedBefore = await ctl(page, 'menu.tools.advancedTools')
        .first()
        .getAttribute('aria-checked');
      await clickRow(page, 'tools.advancedTools');
      await sleep(500);
      await press(page, 'Escape');
      const after = (await controlsUnder(page, 'menubar.')).map((c) =>
        c.id.replace('menubar.', ''),
      );
      return {
        ok: !before.includes('extensions') && after.includes('extensions'),
        observed: `switch was ${checkedBefore}; menubar before: ${before.join(' ')}; after: ${after.join(' ')}`,
      };
    },
  );

  await step(
    'Extensions > Agent access',
    'the dialog with the MCP and API addresses and the token sentence',
    async () => {
      await openMenu(page, 'extensions');
      const extRows = await menuRows(page, 'extensions');
      await clickRow(page, 'extensions.agentAccess');
      await page.locator('[data-control="dialog.agentAccess.mcp"]').waitFor({ timeout: 8000 });
      await sleep(400);
      const text = await page.evaluate(
        () =>
          document.querySelector('[role="dialog"]')?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
      );
      facts.agentAccess = { rows: extRows.map((r) => r.label), text };
      await shot(page, '05-agent-access-dialog.png');
      await press(page, 'Escape');
      await sleep(300);
      return {
        ok: /token/i.test(text),
        observed: `Extensions rows: ${extRows.map((r) => r.label).join(', ')}; dialog: ${text.slice(0, 500)}`,
      };
    },
  );

  await step(
    'Tools > Advanced > Run an action…',
    'the full palette with every action by name',
    async () => {
      await openMenu(page, 'tools');
      await hoverRow(page, 'tools.advanced', '[data-control="menu.tools.advanced.runAction"]');
      await clickRow(page, 'tools.advanced.runAction');
      await page.locator('[data-control="palette.query"]').waitFor({ timeout: 8000 });
      await sleep(400);
      const placeholder = await page.evaluate(
        () =>
          document.querySelector('[data-control="palette.query"]')?.getAttribute('placeholder') ??
          null,
      );
      const count0 = await paletteCount(page);
      await typeHuman(page, '>replace');
      await sleep(500);
      const list = await paletteRows(page);
      const count1 = await paletteCount(page);
      facts.runAction = { placeholder, count0, count1, rows: list.map((r) => r.text) };
      await shot(page, '06-run-an-action-palette.png');
      await press(page, 'Escape');
      await page
        .locator('[data-control="palette.query"]')
        .waitFor({ state: 'detached', timeout: 4000 })
        .catch(() => undefined);
      return {
        ok: list.length > 0,
        observed: `placeholder "${placeholder}"; open: ${count0.count}; ">replace": ${count1.count}: ${list
          .map((r) => r.text)
          .join(' || ')
          .slice(0, 400)}`,
      };
    },
  );

  await step(
    'Tools > Advanced tools off again',
    'the switch reads false and Extensions leaves the bar',
    async () => {
      await openMenu(page, 'tools');
      await clickRow(page, 'tools.advancedTools');
      await sleep(400);
      await press(page, 'Escape');
      const after = (await controlsUnder(page, 'menubar.')).map((c) =>
        c.id.replace('menubar.', ''),
      );
      return { ok: !after.includes('extensions'), observed: `menubar: ${after.join(' ')}` };
    },
  );

  // ---- 7. an assistant write arriving from outside, over the HTTP transport
  await step(
    'go back to the title slide and read the revision',
    'the title slide is current',
    async () => {
      const card = page.locator(`[data-control="filmstrip.slide.${titleSlide}"]`).first();
      const r = await card.boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      await pollUntil(
        () => state(page),
        (s) => s.slideId === titleSlide,
        8000,
      );
      await settled(page);
      const s = await state(page);
      facts.beforeAgentWrite = { revision: s.revision, text: await stageText(page) };
      return {
        ok: s.slideId === titleSlide,
        observed: `slide ${s.slideId}, revision ${s.revision}, stage "${facts.beforeAgentWrite.text.slice(0, 60)}"`,
      };
    },
  );

  await step(
    'POST /api/actions/text.replaceAll as agent:assist-probe (Acme to Globex) while the editor holds the slide',
    'a 409 with the lease holder, or the write lands',
    async () => {
      if (!token)
        return { ok: null, observed: 'not driven: no bearer for production in hosts.json' };
      const info = await invoke(page, 'deck.info');
      const post = async (force) => {
        const res = await fetch(
          `${BASE}/api/actions/text.replaceAll?deck=${encodeURIComponent(deckId)}${force ? '&force=1' : ''}`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              'x-turboslide-author': 'agent:assist-probe',
            },
            body: JSON.stringify({ find: 'Acme', replace: 'Globex', baseRevision: info.revision }),
          },
        );
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body };
      };
      const first = await post(false);
      const describe = (r) => {
        if (!r.body) return `${r.status}`;
        if (r.body.error)
          return `${r.status} ${r.body.error.name}: ${String(r.body.error.message).slice(0, 160)}${r.body.error.holder ? `; holder ${JSON.stringify(r.body.error.holder).slice(0, 120)}` : ''}`;
        return `${r.status} replacements ${r.body.replacements}, slides ${JSON.stringify(r.body.slideIds)}, revision ${r.body.revision}`;
      };
      facts.agentWrite = { first: { status: first.status, summary: describe(first) } };
      let landed = first.status === 200 ? first : null;
      if (first.status === 409) {
        await sleep(800);
        const forced = await post(true);
        facts.agentWrite.forced = { status: forced.status, summary: describe(forced) };
        landed = forced.status === 200 ? forced : null;
      }
      return {
        ok: landed !== null,
        observed: `first: ${describe(first)}${facts.agentWrite.forced ? `; with force=1: ${facts.agentWrite.forced.summary}` : ''}`,
      };
    },
  );

  await step(
    'read the editor after the outside write',
    'the stage reads Globex within 10 s; the banner or the snackbar names the author',
    async () => {
      const text = await pollUntil(
        () => stageText(page),
        (t) => t.includes('Globex'),
        12_000,
        300,
      );
      const b = await banner(page);
      const sb = await snackbar(page);
      const s = await state(page);
      facts.afterAgentWrite = { text, banner: b, snackbar: sb, revision: s.revision };
      await shot(page, '07-after-agent-write.png');
      return {
        ok: text.includes('Globex'),
        observed: `stage "${text.slice(0, 60)}"; revision ${s.revision}; banner: ${b ?? 'none'}; snackbar: ${sb ?? 'none'}`,
      };
    },
  );

  await step(
    'Cmd+Z after the outside write',
    'whether the seller can undo the assistant write with one undo',
    async () => {
      await clickAt(page, 1400, 500); // the workspace beside the sheet, so the stage has the focus
      await sleep(200);
      const canUndo = await page.evaluate(
        () => window.turboslide?.studio?.describe?.().state?.history?.canUndo ?? null,
      );
      await press(page, 'Meta+z');
      await sleep(1500);
      const text = await stageText(page);
      const sb = await snackbar(page);
      const s = await state(page);
      facts.undoAfterAgentWrite = { canUndo, text, snackbar: sb, revision: s.revision };
      await shot(page, '08-undo-after-agent-write.png');
      return {
        ok: null,
        observed: `canUndo before ${canUndo}; after Cmd+Z the stage reads "${text.slice(0, 60)}" (revision ${s.revision}); snackbar: ${sb ?? 'none'}`,
      };
    },
  );

  await step(
    'File > Version history > See version history',
    'the agent write is a row with the Agent mark',
    async () => {
      await openMenu(page, 'file');
      await hoverRow(page, 'file.versionHistory', '[data-control="menu.file.versionHistory.see"]');
      await clickRow(page, 'file.versionHistory.see');
      await page.locator('[data-control="panel.versionHistory"]').waitFor({ timeout: 8000 });
      await sleep(1200);
      const entries = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="panel.versionHistory"] [data-author]')].map(
          (el) => ({
            author: el.getAttribute('data-author'),
            text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160) ?? '',
            agentMark:
              el.querySelector('[data-trust="agent"], .is-agent, [class*="agent"]') !== null,
            label: el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? null,
          }),
        ),
      );
      const text = await page.evaluate(
        () =>
          document
            .querySelector('[data-control="panel.versionHistory"]')
            ?.textContent?.trim()
            .replace(/\s+/g, ' ')
            .slice(0, 600) ?? '',
      );
      facts.versionHistory = { entries, text };
      await shot(page, '09-version-history-agent-row.png');
      const x = page.locator('[data-control="panel.versionHistory"] .ts-panel-head button').last();
      const r = await x.boundingBox();
      if (r) await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
      const agentRows = entries.filter(
        (e) => /agent/i.test(e.text) || /agent/i.test(e.label ?? '') || e.agentMark,
      );
      return {
        ok: entries.length > 0,
        observed: `${entries.length} rows; agent rows ${agentRows.length}: ${agentRows
          .map((e) => `${e.label ?? ''} ${e.text}`)
          .join(' || ')
          .slice(0, 300)}; panel: ${text.slice(0, 300)}`,
      };
    },
  );

  // ---- 8. the brand layouts an outline would land on
  await step('the New slide arrow: the layout picker', 'the layouts by name', async () => {
    await clickControl(page, 'toolbar.newSlide.arrow');
    await page.locator('[data-control^="layout."]').first().waitFor({ timeout: 8000 });
    await sleep(500);
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="layout."]')]
        .filter(
          (el) => el.getClientRects().length > 0 && el.getAttribute('data-control') !== 'layout',
        )
        .map((el) => ({
          id: el.getAttribute('data-control').replace('layout.', ''),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60),
        })),
    );
    facts.layouts = tiles;
    await shot(page, '10-layout-picker.png');
    await press(page, 'Escape');
    await sleep(300);
    return {
      ok: tiles.length > 0,
      observed: `${tiles.length} layouts: ${tiles.map((t) => t.label || t.id).join(', ')}`,
    };
  });

  // ---- 9. the reads an assist would send as the deck's context
  await step(
    'the context reads: deck.info, export.text, slide.get',
    'sizes of what a server would send to a model',
    async () => {
      const info = await invoke(page, 'deck.info');
      const text = await invoke(page, 'export.text', { slideIds: 'all', includeNotes: true });
      const slide = await invoke(page, 'slide.get', { slideId: secondSlide });
      const list = await invoke(page, 'slide.list');
      facts.context = {
        deckInfoChars: JSON.stringify(info).length,
        outline: info.sections,
        exportText: text.text,
        exportTextBytes: text.bytes,
        exportTextSlides: text.slides,
        slideGetChars: JSON.stringify(slide).length,
        slideListChars: JSON.stringify(list).length,
        slideCount: Array.isArray(list) ? list.length : null,
      };
      return {
        ok: typeof text.text === 'string' && text.text.includes('renewal'),
        observed: `deck.info ${facts.context.deckInfoChars} chars; export.text ${text.bytes} bytes over ${text.slides} slides (notes included: ${text.text.includes('renewal')}); slide.get ${facts.context.slideGetChars} chars; slide.list ${facts.context.slideListChars} chars`,
      };
    },
  );
} catch (error) {
  record(
    'the walk',
    'no exception outside a step',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    false,
  );
} finally {
  // ---- 10. File > Move to trash, Delete forever, and a 404 for the deck
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
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record(
        'File > Move to trash',
        'the deck moves to the trash and the page returns to /decks',
        page.url().replace(BASE, ''),
        true,
      );
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('Delete forever', 'the card leaves the trash', deckId, true);
      trashed = true;
    } catch (error) {
      record(
        'the product trash path',
        'File > Move to trash then Delete forever',
        `failed: ${error instanceof Error ? error.message : String(error)}; falling back to the actions API`,
        false,
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
    try {
      let status = 0;
      const until = Date.now() + 20_000;
      for (;;) {
        const res = await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 });
        status = res.status();
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record(
        'the scratch deck answers 404',
        `GET /edit/${deckId} is 404 within 20 s`,
        `status ${status}`,
        status === 404,
      );
      const deck = await page.request.get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 });
      record(
        'the scratch deck answers 404 on /deck',
        `GET /deck/${deckId} is 404`,
        `status ${deck.status()}`,
        deck.status() === 404,
      );
    } catch (error) {
      record(
        'the scratch deck answers 404',
        `GET /edit/${deckId} is 404`,
        `probe failed: ${error instanceof Error ? error.message : String(error)}`,
        false,
      );
    }
  }
  await browser.close().catch(() => undefined);
  const summary = {
    base: BASE,
    deckId,
    startedAt: new Date(startedAt).toISOString(),
    ms: Date.now() - startedAt,
    steps: rows.length,
    passed: rows.filter((r) => r.ok === true).length,
    failed: rows.filter((r) => r.ok === false).length,
    notDriven: rows.filter((r) => r.ok === null).length,
    consoleErrors,
    facts,
    rows,
  };
  writeFileSync(path.join(OUT, 'walk.json'), JSON.stringify(summary, null, 2));
  console.log(
    `\nassist-walk: ${rows.length} steps, ${summary.passed} ok, ${summary.failed} failed, ${summary.notDriven} recorded, ${consoleErrors.length} console errors, ${Math.round(summary.ms / 1000)} s against ${BASE}; deck ${deckId}`,
  );
  process.exit(summary.failed === 0 ? 0 : 1);
}

#!/usr/bin/env node
// The synthesizer's drive of 2026-09-18 on production (https://turboslide.vercel.app, 1d3ba31), the
// four checks the two judgments of docs/RETURN.md asked for and the audits had not driven:
//   1. the Box primitive through Tools > Advanced > Run an action (the palette's Insert group with
//      the switch on): is the entry listed, what lands, what the seller can do with it;
//   2. the mechanism behind Enter doing nothing on the Slideshow split button (audit-chrome rows 16
//      and 19) and Tab not reaching the chevron (row 16): the key's defaultPrevented read from a
//      window listener, with and without a selected object;
//   3. the web page download twice on one deck with the download event, its url, its failure text
//      and the network answer read (audit-surface row 29: try 1 "download.saveAs: canceled");
//   4. the PDF and the Editable text PowerPoint with a table cell typed and closed by Escape (no
//      Tab), so the cell text the export carries is the text the cell holds (audit-objects rows 83
//      and 85 checked strings the Tab defect had replaced).
// Headless Chromium, 1440 by 900, human speed (mouse moves in steps, 40 to 90 ms per key, real double
// clicks), one scratch deck from /new, trashed and deleted forever in the finally block, 404 read on
// /edit and /deck. Imports nothing from the repository but playwright-core. Writes its JSON, log and
// pictures beside itself. No token, cookie or secret is read or printed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const RUN = process.env.RUN_TAG ?? 'run1';
const OUT = HERE;
mkdirSync(OUT, { recursive: true });

const rows = [];
const logLines = [];
const log = (...a) => {
  const line = a
    .join(' ')
    .replace(/\/api\/download\/[A-Za-z0-9_\-.=]+/g, '/api/download/<redacted token>')
    .replace(/\beyJ[A-Za-z0-9_\-.=]+/g, '<redacted token>');
  logLines.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};
const record = (id, interaction, result, observed, extra = {}) => {
  rows.push({ n: rows.length + 1, id, interaction, result, observed, ...extra });
  log(`[${rows.length}] ${id}: ${result} :: ${observed}`);
};
const attempt = async (id, interaction, fn) => {
  try {
    const out = await fn();
    record(id, interaction, out.result, out.observed, out.extra ?? {});
    return out;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    record(id, interaction, 'not driven', `the step threw: ${message}`);
    return { result: 'not driven', observed: message };
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
const parkMouse = async (page) => {
  await page.mouse.move(720, 600);
  await sleep(200);
};

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(600);
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
const waitRevision = async (page, want, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s.revision >= want) return s.revision;
    if (Date.now() > until) return s.revision;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 10_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const ctl = (page, control) => page.locator(`[data-control="${control}"]`);
const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
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
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const closeMenus = async (page) => {
  await press(page, 'Escape', 2);
  await sleep(150);
};
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}${a.id ? `#${a.id}` : ''}`;
  });
const dismissNamePrompt = async (page) => {
  if (await has(page, '[data-control="dialog.namePrompt"]')) {
    await clickControl(page, 'dialog.namePrompt.close').catch(() => press(page, 'Escape'));
    await sleep(200);
  }
};
const snackbar = (page) =>
  page.evaluate(
    () =>
      document.querySelector('[data-control="snackbar"], .ts-snackbar, [role="status"].ts-snack')
        ?.textContent ?? null,
  );
const shot = async (page, name, clip) => {
  const file = path.join(OUT, `${RUN}-${name}.png`);
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) }).catch(() => undefined);
  return path.basename(file);
};
const selectionFacts = (page) =>
  page.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    return {
      chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
      selection: s.selection ?? null,
      editing: document.querySelector('.ts-stagewrap.ts-editor [contenteditable="true"]') !== null,
    };
  });
const currentSlideId = async (page) => (await state(page)).slideId ?? (await state(page)).slide?.id;
const slideBlocks = async (page) => {
  const s = await state(page);
  const id = s.slideId ?? s.slide?.id;
  const slide = await invoke(page, 'slide.get', { slideId: id });
  return { id, slide };
};
const blockList = (slide) => {
  const out = [];
  const seen = new Set();
  const visit = (b) => {
    if (!b || typeof b !== 'object' || seen.has(b)) return;
    seen.add(b);
    if (Array.isArray(b)) {
      b.forEach(visit);
      return;
    }
    if (typeof b.id === 'string' && typeof b.type === 'string') out.push(b);
    for (const v of Object.values(b)) if (v && typeof v === 'object') visit(v);
  };
  visit(slide);
  return out;
};
/* the blocks the stage draws, from the DOM: the truth when slide.get's shape is not the one expected */
const stageBlocks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor [data-block]')].map((el) => ({
      id: el.getAttribute('data-block'),
      type: el.getAttribute('data-type'),
    })),
  );

// ---------------------------------------------------------------------------------------------

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
const responses = [];
page.on('response', (r) => {
  const u = r.url();
  if (/download|build|\.html|api\/x\.|blob\.vercel/.test(u))
    responses.push({ url: u.replace(/token=[^&]+/g, 'token=<redacted>').slice(0, 200), status: r.status(), at: Date.now() });
});

let deckId = '';
try {
  // ---- 1. the scratch deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  deckId = (await invoke(page, 'deck.info')).id;
  log(`deck ${deckId}`);
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
  const HEAD = runs.find((r) => /heading/.test(r)) ?? runs[0];
  await attempt('deck.create', 'Double click the title on /new, type a title, Escape', async () => {
    const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
    await dblclickAt(page, r.x + r.w / 2, r.y + r.h / 2);
    await typeHuman(page, 'Return drive');
    await press(page, 'Escape');
    const rev = await waitRevision(page, 1, 30_000);
    await settled(page);
    await dismissNamePrompt(page);
    await sleep(1200);
    return {
      result: /\/edit\//.test(page.url()) && rev >= 1 ? 'works' : 'broken',
      observed: `${page.url().replace(BASE, '')}; revision ${rev}; appearance ${await page.evaluate(() => document.documentElement.getAttribute('data-theme'))}`,
    };
  });
  await press(page, 'Escape');
  await parkMouse(page);

  // ---- 2. the Enter and Tab mechanisms on the split button, before the switch (nothing selected)
  await page.evaluate(() => {
    window.__keys = [];
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      window.__keys.push({
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        target: t && t.getAttribute ? t.getAttribute('data-control') ?? t.tagName : String(t),
      });
    });
  });
  const keysTaken = () =>
    page.evaluate(() => {
      const k = window.__keys.slice();
      window.__keys = [];
      return k;
    });
  const menuOpen = () => has(page, '#ts-menu-slideshow');
  const showOpen = () => has(page, '[data-control="present.show"]');
  await press(page, 'Escape', 2);
  await attempt(
    'chrome.split.enter-chevron.mechanism',
    'Nothing selected; focus the chevron by script; press Enter; read defaultPrevented on the window and whether the menu opened',
    async () => {
      await page.evaluate(() => document.querySelector('[data-control="present.arrow"]').focus());
      await sleep(200);
      const before = await activeDesc(page);
      await keysTaken();
      await press(page, 'Enter');
      await sleep(400);
      const keys = await keysTaken();
      const open = await menuOpen();
      const enter = keys.find((k) => k.key === 'Enter');
      if (open) await press(page, 'Escape');
      return {
        result: enter ? 'works' : 'not driven',
        observed: `focus ${before}; Enter defaultPrevented ${enter?.defaultPrevented} on target ${enter?.target}; menu opened ${open}; selection ${JSON.stringify((await selectionFacts(page)).chip)}`,
      };
    },
  );
  await attempt(
    'chrome.split.enter-label.mechanism',
    'Nothing selected; focus the Slideshow half by script; press Enter; read defaultPrevented and whether the show opened',
    async () => {
      await page.evaluate(() => document.querySelector('[data-control="present.open"]').focus());
      await sleep(200);
      await keysTaken();
      await press(page, 'Enter');
      await sleep(600);
      const keys = await keysTaken();
      const open = await showOpen();
      const enter = keys.find((k) => k.key === 'Enter');
      if (open) await press(page, 'Escape');
      await sleep(300);
      return {
        result: enter ? 'works' : 'not driven',
        observed: `Enter defaultPrevented ${enter?.defaultPrevented} on target ${enter?.target}; show opened ${open}`,
      };
    },
  );
  await attempt(
    'chrome.split.space-chevron.control',
    'The control reading: focus the chevron, press Space; defaultPrevented and the menu',
    async () => {
      await page.evaluate(() => document.querySelector('[data-control="present.arrow"]').focus());
      await sleep(200);
      await keysTaken();
      await press(page, ' ');
      await sleep(400);
      const keys = await keysTaken();
      const open = await menuOpen();
      const sp = keys.find((k) => k.key === ' ');
      if (open) await press(page, 'Escape');
      return {
        result: 'works',
        observed: `Space defaultPrevented ${sp?.defaultPrevented}; menu opened ${open}`,
      };
    },
  );
  await attempt(
    'chrome.split.tab-order.nothing-selected',
    'Nothing selected; focus the Slideshow half; press Tab; read the focused element',
    async () => {
      await press(page, 'Escape', 2);
      await page.evaluate(() => document.querySelector('[data-control="present.open"]').focus());
      await sleep(200);
      const sel = await selectionFacts(page);
      await keysTaken();
      await press(page, 'Tab');
      await sleep(300);
      const keys = await keysTaken();
      const after = await activeDesc(page);
      const tab = keys.find((k) => k.key === 'Tab');
      return {
        result: after.includes('present.arrow') ? 'works' : 'broken',
        observed: `selection before ${JSON.stringify(sel.chip)}; Tab defaultPrevented ${tab?.defaultPrevented}; focus after ${after}`,
      };
    },
  );
  await attempt(
    'chrome.split.tab-order.object-selected',
    'One click on the title (selected, no session); focus the Slideshow half by script; press Tab; read the focused element and the selection',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      const sel = await selectionFacts(page);
      await page.evaluate(() => document.querySelector('[data-control="present.open"]').focus());
      await sleep(200);
      await keysTaken();
      await press(page, 'Tab');
      await sleep(300);
      const keys = await keysTaken();
      const after = await activeDesc(page);
      const selAfter = await selectionFacts(page);
      const tab = keys.find((k) => k.key === 'Tab');
      await press(page, 'Escape', 2);
      return {
        result: after.includes('present.arrow') ? 'works' : 'broken',
        observed: `selection before chip ${JSON.stringify(sel.chip)} editing ${sel.editing}; Tab defaultPrevented ${tab?.defaultPrevented}; focus after ${after}; selection after chip ${JSON.stringify(selAfter.chip)}`,
      };
    },
  );
  await attempt(
    'chrome.split.enter-chevron.object-selected',
    'With the title selected by one click, focus the chevron by script, press Enter: defaultPrevented, the menu, and whether a text session opened on the title (A1 rule 4)',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      await page.evaluate(() => document.querySelector('[data-control="present.arrow"]').focus());
      await sleep(200);
      await keysTaken();
      await press(page, 'Enter');
      await sleep(500);
      const keys = await keysTaken();
      const open = await menuOpen();
      const sel = await selectionFacts(page);
      const enter = keys.find((k) => k.key === 'Enter');
      if (open) await press(page, 'Escape');
      await press(page, 'Escape', 2);
      return {
        result: 'works',
        observed: `Enter defaultPrevented ${enter?.defaultPrevented} on ${enter?.target}; menu opened ${open}; title session opened ${sel.editing}; chip ${JSON.stringify(sel.chip)}`,
      };
    },
  );
  await parkMouse(page);

  // ---- 3. the switch on
  await attempt('surface.advanced.on', 'Tools > Advanced tools on', async () => {
    await openMenu(page, 'tools');
    await clickRow(page, 'tools.advancedTools');
    await sleep(400);
    await closeMenus(page);
    const s = await state(page);
    return {
      result: s.settings?.advancedTools === true ? 'works' : 'broken',
      observed: `settings.advancedTools ${s.settings?.advancedTools}`,
    };
  });

  // ---- 4. the Box primitive through Tools > Advanced > Run an action
  await attempt('slides.new.toolbar', 'Toolbar New slide, so the Box lands on a content slide', async () => {
    const before = (await state(page)).revision;
    await clickControl(page, 'toolbar.newSlide');
    const rev = await waitRevision(page, before + 1, 20_000);
    await settled(page);
    const { slide } = await slideBlocks(page);
    return {
      result: rev > before ? 'works' : 'broken',
      observed: `revision ${before} -> ${rev}; slide kind ${slide?.kind} layout ${JSON.stringify(slide?.layout?.type ?? slide?.layout)}`,
    };
  });
  let boxId = null;
  await attempt(
    'boxes.palette.listed',
    'Tools > Advanced > Run an action opens the palette; read the Insert group; type box; read the rows',
    async () => {
      await openMenu(page, 'tools');
      await hoverRow(page, 'tools.advanced', '[data-control="menu.tools.advanced.runAction"]');
      await clickRow(page, 'tools.advanced.runAction');
      await page.locator('[data-control="palette"]').waitFor({ timeout: 8000 });
      await sleep(400);
      const all = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="palette"] [role="option"]')].map((el) => ({
          control: el.getAttribute('data-control'),
          text: el.textContent?.trim().slice(0, 80),
        })),
      );
      const inserts = all.filter((e) => /palette\.insert:/.test(e.control ?? ''));
      await typeHuman(page, 'box');
      await sleep(500);
      const filtered = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="palette"] [role="option"]')].map((el) => ({
          control: el.getAttribute('data-control'),
          text: el.textContent?.trim().slice(0, 80),
        })),
      );
      const pic = await shot(page, 'box-01-palette');
      const listed = filtered.some((e) => e.control === 'palette.insert:block:box');
      return {
        result: listed ? 'works' : 'broken',
        observed: `${all.length} rows before typing, ${inserts.length} Insert rows: ${inserts
          .slice(0, 12)
          .map((e) => e.control?.replace('palette.', ''))
          .join(', ')}${inserts.length > 12 ? ' ...' : ''}; after typing box ${filtered.length} rows: ${filtered.map((e) => `${e.control?.replace('palette.', '')} "${e.text}"`).join(' | ')}; Box listed ${listed}; ${pic}`,
        extra: { inserts, filtered },
      };
    },
  );
  await attempt('boxes.palette.insert', 'Click the Box row; read what lands', async () => {
    const before = (await state(page)).revision;
    const { slide: s0 } = await slideBlocks(page);
    const stage0 = new Set((await stageBlocks(page)).map((b) => b.id));
    const ids0 = new Set(blockList(s0).map((b) => b.id));
    const row = page.locator('[data-control="palette.insert:block:box"]').first();
    if (!(await row.isVisible().catch(() => false))) {
      await press(page, 'Escape');
      return { result: 'not driven', observed: 'no Box row in the palette' };
    }
    const r = await row.boundingBox();
    await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
    const rev = await waitRevision(page, before + 1, 20_000);
    await settled(page);
    await sleep(600);
    const { slide } = await slideBlocks(page);
    const freshStage = (await stageBlocks(page)).filter((b) => !stage0.has(b.id));
    const fresh = blockList(slide).filter((b) => !ids0.has(b.id));
    const box =
      fresh.find((b) => b.type === 'box') ??
      blockList(slide).find((b) => b.id === freshStage.find((f) => f.type === 'box')?.id) ??
      fresh[0] ??
      null;
    boxId = box?.id ?? freshStage.find((f) => f.type === 'box')?.id ?? freshStage[0]?.id ?? null;
    const dom = boxId
      ? await page.evaluate((id) => {
          const el = document.querySelector(`.ts-stagewrap.ts-editor [data-block="${id}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            type: el.getAttribute('data-type'),
            w: Math.round(r.width),
            h: Math.round(r.height),
            background: cs.backgroundColor,
            border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
            radius: cs.borderTopLeftRadius,
            padding: cs.paddingTop,
            text: el.textContent?.trim().slice(0, 60),
            runs: [...el.querySelectorAll('[data-run]')].map((x) => x.getAttribute('data-run')),
          };
        }, boxId)
      : null;
    const pic = await shot(page, 'box-02-inserted');
    const paletteStillOpen = await has(page, '[data-control="palette"]');
    if (paletteStillOpen) await press(page, 'Escape');
    return {
      result: boxId ? 'works' : 'broken',
      observed: `revision ${before} -> ${rev}; new blocks in slide.get ${fresh.length}: ${fresh.map((b) => `${b.type} ${b.id}`).join(', ')}; new blocks on the stage ${freshStage.length}: ${freshStage.map((b) => `${b.type} ${b.id}`).join(', ')}; slide.get keys ${Object.keys(slide ?? {}).join(',')}; box fields ${JSON.stringify(box ? { fill: box.fill, stroke: box.stroke, strokeWidth: box.strokeWidth, radius: box.radius, padding: box.padding, height: box.height, text: box.text, pos: box.pos } : null)}; drawn ${JSON.stringify(dom)}; palette still open ${paletteStillOpen}; ${pic}`,
      extra: { box },
    };
  });
  await attempt(
    'boxes.select.tail.context',
    'One click on the box: the chip, the handles, the toolbar tail; right click: the rows',
    async () => {
      if (!boxId) return { result: 'not driven', observed: 'no box landed' };
      await press(page, 'Escape', 2);
      const r = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${boxId}"]`);
      if (!r) return { result: 'not driven', observed: 'the box has no element on the stage' };
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(400);
      const sel = await selectionFacts(page);
      const handles = await page.evaluate(
        () => document.querySelectorAll('.ts-overlay [aria-label*="Resize"]').length,
      );
      const tail = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => c && !/^toolbar\.(search|newSlide|undo|redo|print|zoom|paintFormat)/.test(c)),
      );
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
      await sleep(500);
      const menuRows = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menu"] [data-control^="menu."]')].map((el) =>
          el.getAttribute('data-control')?.replace('menu.', ''),
        ),
      );
      const pic = await shot(page, 'box-03-selected-context');
      await press(page, 'Escape');
      return {
        result: sel.chip !== null ? 'works' : 'broken',
        observed: `chip ${JSON.stringify(sel.chip)}; session ${sel.editing}; resize handles ${handles}; tail ${tail.join(', ')}; right click rows (${menuRows.length}) ${menuRows.join(', ')}; ${pic}`,
      };
    },
  );
  await attempt(
    'boxes.text.enter-type',
    'With the box selected press Enter, type a label, Escape; read block.text and the drawn text',
    async () => {
      if (!boxId) return { result: 'not driven', observed: 'no box landed' };
      await press(page, 'Escape', 2);
      const r = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${boxId}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      const before = (await state(page)).revision;
      await press(page, 'Enter');
      await sleep(400);
      const opened = (await selectionFacts(page)).editing;
      await typeHuman(page, 'Box label');
      await press(page, 'Escape');
      const rev = await waitRevision(page, before + 1, 15_000);
      await settled(page);
      const { slide } = await slideBlocks(page);
      const box = blockList(slide).find((b) => b.id === boxId);
      const drawn = await page.evaluate(
        (id) =>
          document.querySelector(`.ts-stagewrap.ts-editor [data-block="${id}"]`)?.textContent?.trim() ??
          null,
        boxId,
      );
      const pic = await shot(page, 'box-04-label');
      return {
        result: opened && /Box label/.test(String(box?.text ?? drawn)) ? 'works' : 'broken',
        observed: `session opened on Enter ${opened}; revision ${before} -> ${rev}; block.text ${JSON.stringify(box?.text)}; drawn ${JSON.stringify(drawn)}; ${pic}`,
      };
    },
  );
  await attempt(
    'boxes.format-options.sections',
    'Format > Format options on the selected box: the sections and the fields for fill, stroke, radius, padding',
    async () => {
      if (!boxId) return { result: 'not driven', observed: 'no box landed' };
      await press(page, 'Escape', 2);
      const r = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${boxId}"]`);
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      await openMenu(page, 'format');
      await clickRow(page, 'format.formatOptions');
      await sleep(800);
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-rpanel [data-control^="formatOptions."]')]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => c && c.split('.').length <= 3),
      );
      const fields = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-rpanel [data-control^="formatOptions."]')]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => c && /fill|stroke|border|radius|padding|corner/i.test(c)),
      );
      const pic = await shot(page, 'box-05-format-options');
      await press(page, 'Escape');
      return {
        result: sections.length > 0 ? 'works' : 'broken',
        observed: `sections ${[...new Set(sections)].join(', ')}; fill, stroke, radius or padding fields ${fields.length ? fields.join(', ') : 'none'}; ${pic}`,
      };
    },
  );
  await attempt(
    'boxes.insert-menu.row',
    'Insert menu with the switch on: is there a Box row',
    async () => {
      await openMenu(page, 'insert');
      const rowsNow = await page.evaluate(() =>
        [...document.querySelectorAll('#ts-menu-insert [data-control^="menu.insert."]')].map((el) =>
          el.getAttribute('data-control')?.replace('menu.', ''),
        ),
      );
      await closeMenus(page);
      return {
        result: 'works',
        observed: `${rowsNow.length} rows: ${rowsNow.join(', ')}; a box row ${rowsNow.some((r) => /box/i.test(r))}`,
      };
    },
  );
  await parkMouse(page);

  // ---- 5. the table with a cell typed and closed by Escape, then the PDF and the PowerPoint
  await attempt('slides.new.toolbar-2', 'Toolbar New slide for the table', async () => {
    const before = (await state(page)).revision;
    await press(page, 'Escape', 2);
    await clickControl(page, 'toolbar.newSlide');
    const rev = await waitRevision(page, before + 1, 20_000);
    await settled(page);
    return { result: rev > before ? 'works' : 'broken', observed: `revision ${before} -> ${rev}` };
  });
  let tableId = null;
  await attempt('tables.insert.grid', 'Insert > Table, 3 by 2 from the grid', async () => {
    const before = (await state(page)).revision;
    const { slide: s0 } = await slideBlocks(page);
    const stage0 = new Set((await stageBlocks(page)).map((b) => b.id));
    const ids0 = new Set(blockList(s0).map((b) => b.id));
    await openMenu(page, 'insert');
    await hoverRow(page, 'insert.table', '[data-control="insert.table.grid"]');
    const cell = await ctl(page, 'insert.table.pick.3x2').boundingBox();
    await moveHuman(page, { x: cell.x - 30, y: cell.y - 20 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 }, 8);
    await sleep(300);
    const words = await page.evaluate(
      () => document.querySelector('[data-control="insert.table.size"]')?.textContent ?? null,
    );
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
    const rev = await waitRevision(page, before + 1, 20_000);
    await settled(page);
    await sleep(500);
    const { slide } = await slideBlocks(page);
    const freshStage = (await stageBlocks(page)).filter((b) => !stage0.has(b.id) && b.type === 'table');
    const fresh = blockList(slide).filter((b) => !ids0.has(b.id) && b.type === 'table');
    tableId = fresh[0]?.id ?? freshStage[0]?.id ?? null;
    const runsNow = await page.evaluate(
      (id) => [...document.querySelectorAll(`.ts-stagewrap.ts-editor [data-run^="${id}/rows/"]`)].length,
      tableId ?? 'none',
    );
    return {
      result: tableId ? 'works' : 'broken',
      observed: `size words ${JSON.stringify(words)}; revision ${before} -> ${rev}; table ${tableId} columns ${fresh[0]?.columns?.length} rows ${fresh[0]?.rows?.length}; cell runs on the stage ${runsNow}; stage blocks ${JSON.stringify(freshStage)}`,
    };
  });
  await attempt(
    'tables.cell.type-escape',
    'Double click cell 1,1, type Q1 revenue, Escape; double click cell 2,1, type 12 000, Escape; read the cells',
    async () => {
      if (!tableId) return { result: 'not driven', observed: 'no table' };
      await press(page, 'Escape', 2);
      const typeCell = async (r, c, text) => {
        const rect = await rectOf(page, `.ts-stagewrap.ts-editor [data-run="${tableId}/rows/${r}/cells/${c}"]`);
        if (!rect) throw new Error(`no run for cell ${r},${c}`);
        await dblclickAt(page, rect.x + rect.w / 2, rect.y + rect.h / 2);
        await sleep(300);
        const opened = (await selectionFacts(page)).editing;
        await typeHuman(page, text);
        await press(page, 'Escape');
        await sleep(400);
        return opened;
      };
      const before = (await state(page)).revision;
      const o1 = await typeCell(0, 0, 'Q1 revenue');
      const o2 = await typeCell(1, 0, '12 000');
      await press(page, 'Escape');
      await waitRevision(page, before + 1, 15_000);
      await settled(page);
      await sleep(800);
      const { slide } = await slideBlocks(page);
      const table = blockList(slide).find((b) => b.id === tableId);
      const cells = (table?.rows ?? []).map((row) =>
        (row.cells ?? []).map((cell) => JSON.stringify(cell).slice(0, 60)),
      );
      const drawn = await page.evaluate(
        (id) =>
          [...document.querySelectorAll(`.ts-stagewrap.ts-editor [data-run^="${id}/rows/"]`)].map(
            (el) => el.textContent?.trim(),
          ),
        tableId,
      );
      const pic = await shot(page, 'table-01-typed');
      const ok = drawn.some((t) => /Q1 revenue/.test(t)) && drawn.some((t) => /12 000/.test(t));
      return {
        result: ok ? 'works' : 'broken',
        observed: `sessions ${o1}, ${o2}; drawn cells ${JSON.stringify(drawn)}; stored ${JSON.stringify(cells).slice(0, 300)}; ${pic}`,
      };
    },
  );
  const download = async (start, timeout = 60_000) => {
    const t = Date.now();
    const waiting = page.waitForEvent('download', { timeout });
    waiting.catch(() => undefined);
    await start();
    const d = await waiting;
    const rawUrl = d.url();
    const redact = (v) =>
      String(v)
        .replace(/token=[^&]+/g, 'token=<redacted>')
        .replace(/\/api\/download\/[A-Za-z0-9_\-.=]+/g, '/api/download/<redacted token>')
        .replace(/\beyJ[A-Za-z0-9_\-.=]+/g, '<redacted token>');
    const url = redact(rawUrl);
    let failure = null;
    let file = null;
    let bytes = 0;
    let probe = null;
    const suggested = d.suggestedFilename();
    const name = /\.(html|pdf|pptx|zip)$/.test(suggested) ? suggested : `<no extension, ${suggested.length} chars>`;
    try {
      failure = await d.failure();
      if (failure === null) {
        const p = await d.path();
        file = path.join(OUT, `${RUN}-${/\.(html|pdf|pptx|zip)$/.test(suggested) ? suggested : 'download.bin'}`);
        writeFileSync(file, readFileSync(p));
        bytes = readFileSync(file).length;
      } else if (/\/api\/download\//.test(rawUrl)) {
        /* the route's own answer to the same signed url, read once after the browser's cancelled attempt */
        try {
          const res = await page.request.get(rawUrl, { maxRedirects: 0, timeout: 30_000 });
          const body = (await res.text().catch(() => '')).slice(0, 240);
          probe = { status: res.status(), contentType: res.headers()['content-type'] ?? null, body: redact(body) };
        } catch (error) {
          probe = { error: redact(error instanceof Error ? error.message.split('\n')[0] : String(error)) };
        }
      }
    } catch (error) {
      failure = redact(error instanceof Error ? error.message.split('\n')[0] : String(error));
    }
    return { ms: Date.now() - t, name, url, failure, file, bytes, probe };
  };
  await attempt('tables.export.pdf.cell-text', 'File > Download > PDF; pdftotext; the two cell strings', async () => {
    await press(page, 'Escape', 2);
    await openMenu(page, 'file');
    await hoverRow(page, 'file.download', '[data-control="menu.file.download.pdf"]');
    await clickRow(page, 'file.download.pdf');
    await ctl(page, 'dialog.download.pdf').waitFor({ timeout: 8000 });
    await sleep(400);
    const d = await download(() => clickControl(page, 'dialog.download.ok'), 90_000);
    let text = '';
    if (d.file) text = execFileSync('pdftotext', [d.file, '-']).toString();
    const pages = d.file ? (readFileSync(d.file).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : 0;
    await pollUntil(
      () => has(page, '[data-control="dialog.download.pdf"]'),
      (v) => v === false,
      15_000,
    );
    await press(page, 'Escape');
    return {
      result: d.failure === null && /Q1 revenue/.test(text) && /12 000/.test(text) ? 'works' : 'broken',
      observed: `${d.ms} ms; ${d.name} ${d.bytes} B; failure ${JSON.stringify(d.failure)}; pages ${pages}; "Q1 revenue" ${/Q1 revenue/.test(text)}; "12 000" ${/12 000/.test(text)}; "Box label" ${/Box label/.test(text)}; "Return drive" ${/Return drive/.test(text)}`,
    };
  });
  await attempt(
    'tables.export.pptx-editable.cell-text',
    'File > Download > PowerPoint, Editable text; the a:tbl and the two cell strings',
    async () => {
      await press(page, 'Escape', 2);
      await openMenu(page, 'file');
      await hoverRow(page, 'file.download', '[data-control="menu.file.download.pptx"]');
      await clickRow(page, 'file.download.pptx');
      await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
      await sleep(300);
      await clickControl(page, 'dialog.download.mode.native');
      await sleep(300);
      const d = await download(() => clickControl(page, 'dialog.download.ok'), 120_000);
      let xml = '';
      if (d.file) {
        const list = execFileSync('unzip', ['-Z1', d.file]).toString().split('\n');
        const slides = list.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
        xml = slides.map((n) => execFileSync('unzip', ['-p', d.file, n]).toString()).join('\n');
      }
      const gridCols = [...xml.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]));
      await pollUntil(
        () => has(page, '[data-control="dialog.download.pptx"]'),
        (v) => v === false,
        15_000,
      );
      await press(page, 'Escape');
      return {
        result:
          d.failure === null && /<a:tbl>/.test(xml) && /Q1 revenue/.test(xml) && /12 000/.test(xml)
            ? 'works'
            : 'broken',
        observed: `${d.ms} ms; ${d.name} ${d.bytes} B; failure ${JSON.stringify(d.failure)}; a:tbl ${(xml.match(/<a:tbl>/g) ?? []).length}; gridCol EMU ${gridCols.join(', ')} (px ${gridCols.map((v) => Math.round(v / 9525)).join(', ')}); "Q1 revenue" ${/Q1 revenue/.test(xml)}; "12 000" ${/12 000/.test(xml)}; "Box label" ${/Box label/.test(xml)}`,
      };
    },
  );

  // ---- 6. the web page download, twice
  for (const n of [1, 2]) {
    await attempt(
      `export.html.web-page.try-${n}`,
      'File > Download > Web page; the download event, its url, its failure, the network answers, the snackbar',
      async () => {
        await press(page, 'Escape', 2);
        responses.length = 0;
        await openMenu(page, 'file');
        await hoverRow(page, 'file.download', '[data-control="menu.file.download.html"]');
        const t0 = Date.now();
        const d = await download(() => clickRow(page, 'file.download.html'), 90_000);
        await sleep(1500);
        const snack = await snackbar(page);
        let title = null;
        let hasHeading = false;
        if (d.file) {
          const html = readFileSync(d.file, 'utf8');
          title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null;
          hasHeading = /Return drive/.test(html);
        }
        const net = responses
          .filter((r) => r.at >= t0)
          .map((r) => `${r.status} ${r.url}`)
          .slice(0, 8);
        return {
          result: d.failure === null && d.bytes > 0 ? 'works' : 'broken',
          observed: `${d.ms} ms; ${d.name} ${d.bytes} B; url ${d.url.slice(0, 120)}; failure ${JSON.stringify(d.failure)}; route probe after the cancel ${JSON.stringify(d.probe)}; title ${JSON.stringify(title)}; heading in file ${hasHeading}; snackbar ${JSON.stringify(snack)}; network ${JSON.stringify(net)}`,
        };
      },
    );
    await sleep(3000);
  }
  await shot(page, 'end-editor');
} catch (error) {
  record('drive', 'the drive', 'broken', `stopped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
} finally {
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await pollUntil(() => state(page), (s) => s.sync?.connected === true, 30_000);
      await settled(page);
      await dismissNamePrompt(page);
      await clickControl(page, 'menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl(page, 'menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record('deck.trash', 'File > Move to trash', 'works', page.url().replace(BASE, ''));
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(page, `trash.delete.${deckId}`);
      await clickControl(page, 'trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('deck.delete-forever', 'Delete forever on /decks/trash', 'works', deckId);
      trashed = true;
    } catch (error) {
      record('deck.trash', 'The product trash path', 'broken', `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}; falling back to the window API`);
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
        // the 404 probe below tells the truth
      }
    }
    for (const route of ['edit', 'deck']) {
      let status = 0;
      const until = Date.now() + 25_000;
      for (;;) {
        try {
          const res = await page.request.get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 });
          status = res.status();
        } catch {
          status = -1;
        }
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record(`deck.404.${route}`, `GET /${route}/${deckId} answers 404`, status === 404 ? 'works' : 'broken', `status ${status}`);
    }
  }
  writeFileSync(
    path.join(OUT, `${RUN}-return-drive.json`),
    JSON.stringify({ base: BASE, deckId, at: new Date().toISOString(), rows, consoleErrors }, null, 2),
  );
  writeFileSync(path.join(OUT, `${RUN}-return-drive.log`), logLines.join('\n'));
  await browser.close();
  log(`console errors ${consoleErrors.length}`);
}

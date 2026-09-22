#!/usr/bin/env node
// The shader library audit walk (docs/gslides-parity/features/audit-shaders.md). Drives production
// the way a seller does, at human speed, on a scratch deck from /new, and records what happened:
// the Insert menu with and without Advanced tools, the Insert material dialog, the material block
// on the sheet (its label, its live canvas, whether it animates), the Format options panel's
// Material section at 1440 and 1280, Capture frame through the hosted job, the Background dialog's
// Material row, the slideshow, reduced motion, the frame cadence with a shader mounted, the
// canvases left behind on a slide change, the PDF and PowerPoint exports, and the material catalog
// the window API lists. Imports nothing but playwright-core from the repository root. The deck is
// moved to the trash and deleted forever in a finally block, then /deck/<id> and /edit/<id> are
// read for a 404.
//
//   node walk.mjs [--base https://turboslide.vercel.app]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/features/audit-shaders';
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// the table

const rows = [];
const record = (step, expected, observed, ok) => {
  const row = { n: rows.length + 1, step, expected, observed: String(observed), ok };
  rows.push(row);
  const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
  console.log(
    `${tag} ${String(row.n).padStart(3)} ${step}\n       expected: ${expected}\n       observed: ${row.observed}`,
  );
};
const step = async (name, expected, fn) => {
  try {
    const r = await fn();
    record(name, expected, r.observed, r.ok);
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
// human speed (the probe's pace: editor-walk-probe.mjs)

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
const drag = async (page, from, to, { steps = 14, during } = {}) => {
  const cur = { x: from.x - 30, y: from.y - 20 };
  await moveHuman(page, cur, from, 6);
  await sleep(rand(60, 120));
  await page.mouse.down();
  await sleep(rand(60, 110));
  await moveHuman(page, from, to, steps);
  await sleep(rand(80, 140));
  const mid = during ? await during() : undefined;
  await page.mouse.up();
  await sleep(rand(120, 200));
  return mid;
};
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
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
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const activeSlide = async (page) => (await state(page)).slideId;
const slideJson = async (page, slideId) =>
  invoke(page, 'slide.get', { slideId }).then((g) => g.slide ?? g);
const objectsOf = async (page, slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      if (
        typeof node.id === 'string' &&
        typeof node.type === 'string' &&
        node.pos &&
        typeof node.pos === 'object'
      )
        out.push({ id: node.id, type: node.type, pos: node.pos, block: node });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
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
const menuRoot = (id) => `#ts-menu-${id}`;
const openMenu = async (page, id) => {
  const bar = ctl(page, `menubar.${id}`);
  const r = await bar.boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(menuRoot(id)).waitFor({ timeout: 8000 });
  await page
    .locator(`${menuRoot(id)} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const clickControl = async (page, control) => {
  const el = ctl(page, control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const has = (page, selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const closeMenus = async (page) => {
  await press(page, 'Escape');
  await sleep(150);
  if ((await page.locator('[id^="ts-menu-"]:visible, .ts-context-menu:visible').count()) > 0) {
    await press(page, 'Escape');
    await sleep(150);
  }
};
const menuRows = (page, id) =>
  page.evaluate(
    (root) =>
      [...document.querySelectorAll(`${root} [data-control^="menu."]`)].map((el) =>
        el.getAttribute('data-control').replace(/^menu\./, ''),
      ),
    menuRoot(id),
  );
const advancedOn = async (page) => (await state(page)).settings?.advancedTools === true;
const setAdvanced = async (page, on) => {
  if ((await advancedOn(page)) === on) return true;
  await openMenu(page, 'tools');
  await clickControl(page, 'menu.tools.advancedTools');
  await pollUntil(
    () => advancedOn(page),
    (x) => x === on,
    8000,
  );
  await closeMenus(page);
  return (await advancedOn(page)) === on;
};
/** The canvases in the stage and elsewhere, with their sizes and WebGL kind. */
const canvasFacts = (page) =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('canvas')];
    return all.map((c) => {
      const r = c.getBoundingClientRect();
      const inStage = Boolean(c.closest('.ts-stagewrap'));
      const inFilm = Boolean(
        c.closest('.ts-filmstrip, [class*="filmstrip"], [class*="Filmstrip"]'),
      );
      return {
        w: c.width,
        h: c.height,
        cssW: Math.round(r.width),
        cssH: Math.round(r.height),
        inStage,
        inFilm,
        parent: c.parentElement?.className ?? '',
      };
    });
  });
/** requestAnimationFrame cadence and long tasks over `ms`. */
const cadence = (page, ms) =>
  page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        let frames = 0;
        let longTasks = 0;
        let longMs = 0;
        let observer = null;
        try {
          observer = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              longTasks += 1;
              longMs += e.duration;
            }
          });
          observer.observe({ type: 'longtask', buffered: false });
        } catch {
          observer = null;
        }
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start < dur) requestAnimationFrame(tick);
          else {
            observer?.disconnect();
            resolve({
              fps: Math.round((frames * 1000) / dur),
              longTasks,
              longMs: Math.round(longMs),
              observed: observer !== null,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

// ---------------------------------------------------------------------------------------------
// the walk

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
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
const shot = async (name, opts = {}) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).catch(() => undefined);
};

let deckId = '';
const started = Date.now();
try {
  // ---- 1. the fresh deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  record('the draft opened', 'an untitled draft id', deckId, /^untitled-/.test(deckId));
  await pollUntil(
    () => state(page),
    (s) => s.sync?.connected === true,
    30_000,
  );
  await settled(page);
  const titleSlide = await activeSlide(page);

  // ---- 3. Insert menu without Advanced tools
  await step('Insert menu with Advanced tools off', 'no Material row', async () => {
    await setAdvanced(page, false);
    await openMenu(page, 'insert');
    const ids = await menuRows(page, 'insert');
    await shot('s01-insert-menu-default');
    await closeMenus(page);
    return { ok: !ids.includes('insert.material'), observed: `rows: ${ids.join(', ')}` };
  });

  // ---- 4. Advanced tools on, Insert > Material
  await step(
    'Tools > Advanced tools on, then Insert menu',
    'a Material row at the foot of Insert',
    async () => {
      const on = await setAdvanced(page, true);
      await openMenu(page, 'insert');
      const ids = await menuRows(page, 'insert');
      await shot('s02-insert-menu-advanced');
      const row = ctl(page, 'menu.insert.material');
      const label = (await row.textContent().catch(() => '')) ?? '';
      return {
        ok: on && ids.includes('insert.material'),
        observed: `advanced ${on}; row present ${ids.includes('insert.material')}; row text "${label.trim()}"; ${ids.length} rows`,
      };
    },
  );

  let materialBlockId = null;
  await step(
    'Insert > Material opens a dialog of names',
    'the Insert material dialog: a list of catalog rows with preset counts and no thumbnails',
    async () => {
      await clickControl(page, 'menu.insert.material');
      await page.locator('[data-control="dialog.insertMaterial"]').waitFor({ timeout: 8000 });
      await sleep(400);
      const facts = await page.evaluate(() => {
        const d = document.querySelector('[data-control="dialog.insertMaterial"]');
        const rows = [...d.querySelectorAll('[data-control^="dialog.insertMaterial.pick."]')];
        return {
          title: d.querySelector('h2, h1, [class*="title"]')?.textContent?.trim() ?? '',
          lead: d.querySelector('p')?.textContent?.trim() ?? '',
          rows: rows.map((r) => r.textContent.trim().replace(/\s+/g, ' ')),
          images: d.querySelectorAll('img, canvas, svg').length,
          search: d.querySelectorAll('input[type="search"], input[type="text"]').length,
        };
      });
      await shot('s03-insert-material-dialog');
      return {
        ok: facts.rows.length > 0,
        observed: `title "${facts.title}"; lead "${facts.lead}"; ${facts.rows.length} rows; ${facts.images} pictures or canvases; ${facts.search} search fields; rows: ${facts.rows.join(' | ')}`,
      };
    },
  );

  await step(
    'pick Liquid metal',
    'a material block on the slide, its recipe with the first preset',
    async () => {
      const before = (await objectsOf(page, titleSlide)).map((o) => o.id);
      const t0 = Date.now();
      await clickControl(page, 'dialog.insertMaterial.pick.paper:liquid-metal');
      const objs = await pollUntil(
        () => objectsOf(page, titleSlide),
        (o) => o.some((x) => !before.includes(x.id) && x.type === 'material'),
        20_000,
      );
      const block = objs.find((x) => !before.includes(x.id) && x.type === 'material') ?? null;
      const others = objs
        .filter((x) => !before.includes(x.id) && x.type !== 'material')
        .map((x) => `${x.id} ${x.type}`);
      materialBlockId = block?.id ?? null;
      const tBlock = Date.now() - t0;
      await page
        .locator('.ts-stagewrap.ts-editor [data-recipe] canvas')
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(() => undefined);
      const tCanvas = Date.now() - t0;
      await settled(page);
      await sleep(1200);
      return {
        ok: block !== null,
        observed: block
          ? `${block.id} ${block.type} pos ${JSON.stringify(block.pos)} recipe ${JSON.stringify({ materialId: block.block.materialId, preset: block.block.preset, uniforms: block.block.uniforms, anchor: block.block.anchor, asset: block.block.asset })}; the block in the document after ${tBlock} ms, its canvas on the stage after ${tCanvas} ms; other objects that gained a pos: ${others.join(', ') || 'none'}`
          : 'no new material object',
      };
    },
  );

  // ---- the catalog through the window API (after the first write, so the deck is in the store)
  await step('material.list on production', 'the catalog entries with availability', async () => {
    const list = await invoke(page, 'material.list', {});
    const avail = list.filter((e) => e.available).map((e) => e.id);
    const un = list.filter((e) => !e.available).map((e) => e.id);
    const uniforms = Object.fromEntries(
      list.filter((e) => e.available).map((e) => [e.id, e.uniforms.length]),
    );
    writeFileSync(path.join(OUT, 'material-list.json'), JSON.stringify(list, null, 2));
    return {
      ok: list.length > 0,
      observed: `${list.length} entries; available ${avail.length}: ${avail.join(', ')}; unavailable ${un.length}: ${un.join(', ')}; uniforms per entry ${JSON.stringify(uniforms)}`,
    };
  });

  await step(
    'the material block on the sheet',
    'the frozen frame; today the plate ground with a titanium label and a live canvas over it',
    async () => {
      const facts = await page.evaluate(() => {
        const fig = document.querySelector('.ts-stagewrap.ts-editor [data-recipe]');
        if (!fig) return null;
        const label = fig.querySelector('.material-label')?.textContent ?? null;
        const canvas = fig.querySelector('canvas');
        const img = fig.querySelector('img');
        return {
          label,
          canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
          img: Boolean(img),
          live: fig.getAttribute('data-live'),
        };
      });
      await shot('s04-material-block-inserted');
      const card = page.locator(`[data-control="filmstrip.slide.${titleSlide}"]`).first();
      await card
        .screenshot({ path: path.join(OUT, 's04c-filmstrip-card.png') })
        .catch(() => undefined);
      const cardFacts = await card
        .evaluate((el) => ({
          canvases: el.querySelectorAll('canvas').length,
          labels: [...el.querySelectorAll('.material-label')].map((l) => l.textContent),
        }))
        .catch(() => null);
      facts.card = cardFacts;
      return {
        ok: facts !== null,
        observed: facts
          ? `label "${facts.label}"; canvas ${JSON.stringify(facts.canvas)}; img ${facts.img}; data-live ${facts.live}; filmstrip card ${JSON.stringify(facts.card)}`
          : 'no [data-recipe] root in the stage',
      };
    },
  );

  await step(
    'the live canvas animates in the editor',
    'two screenshots of the block 900 ms apart differ',
    async () => {
      const r = await rectOf(page, '.ts-stagewrap.ts-editor [data-recipe] .material');
      if (!r) return { ok: null, observed: 'not driven: no .material box' };
      const clip = {
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
      };
      const a = await page.screenshot({ clip, type: 'png' });
      await sleep(900);
      const b = await page.screenshot({ clip, type: 'png' });
      writeFileSync(path.join(OUT, 's04a-block-frame-a.png'), a);
      writeFileSync(path.join(OUT, 's04b-block-frame-b.png'), b);
      return {
        ok: !a.equals(b),
        observed: `frames differ ${!a.equals(b)}; block box ${Math.round(r.w)} by ${Math.round(r.h)} css px`,
      };
    },
  );

  await step(
    'frame cadence with one shader mounted',
    'rAF near 60 per second, few long tasks',
    async () => {
      const c = await cadence(page, 3000);
      const canvases = await canvasFacts(page);
      return {
        ok: c.fps >= 50,
        observed: `${c.fps} rAF per second over 3 s; long tasks ${c.longTasks} (${c.longMs} ms)${c.observed ? '' : ', longtask observer unavailable'}; canvases on the page ${canvases.length}: ${canvases.map((k) => `${k.w}x${k.h}${k.inStage ? ' stage' : ''}${k.inFilm ? ' filmstrip' : ''}`).join(', ')}`,
      };
    },
  );

  await step(
    'select the material block and read the toolbar',
    'the block selected by one click; the toolbar tail for a material',
    async () => {
      const r = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${materialBlockId}"]`);
      if (!r) return { ok: false, observed: 'no [data-block] for the material' };
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(400);
      const chip = await page.evaluate(
        () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
      );
      const tail = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="toolbar."]')]
          .map((el) => el.getAttribute('data-control'))
          .filter((id) => !id.startsWith('toolbar.font') && !id.startsWith('toolbar.textColor'))
          .join(', '),
      );
      const handles = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label*=": Resize "]')].map((el) =>
          el.getAttribute('aria-label'),
        ),
      );
      await shot('s05-material-selected');
      return {
        ok: chip !== null,
        observed: `chip "${chip}"; handles ${handles.length}: ${handles.slice(0, 2).join(', ')}; toolbar controls: ${tail.slice(0, 600)}`,
      };
    },
  );

  await step(
    'drag the material block by 120 by 80 sheet px',
    'pos.x and pos.y move by about 120 and 80',
    async () => {
      const before = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      const k = sheet.w / 1600;
      const r = await rectOf(page, `.ts-stagewrap.ts-editor [data-block="${materialBlockId}"]`);
      const from = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      await drag(page, from, { x: from.x + 120 * k, y: from.y + 80 * k });
      await settled(page);
      const after = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      const dx = after.pos.x - before.pos.x;
      const dy = after.pos.y - before.pos.y;
      return {
        ok: Math.abs(dx - 120) <= 6 && Math.abs(dy - 80) <= 6,
        observed: `moved ${Math.round(dx)} by ${Math.round(dy)}; before ${JSON.stringify(before.pos)} after ${JSON.stringify(after.pos)}`,
      };
    },
  );

  await step(
    'resize the material block by its south east handle',
    'the box grows and the canvas follows',
    async () => {
      const before = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      const handle = page.locator('[aria-label$=": Resize se"]').first();
      const hr = await handle.boundingBox().catch(() => null);
      if (!hr) return { ok: null, observed: 'not driven: no Resize se handle' };
      const from = { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2 };
      const sheet = await rectOf(page, '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      const k = sheet.w / 1600;
      await drag(page, from, { x: from.x + 100 * k, y: from.y + 60 * k });
      await settled(page);
      await sleep(600);
      const after = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      const canvas = await page.evaluate(() => {
        const c = document.querySelector('.ts-stagewrap.ts-editor [data-recipe] canvas');
        return c
          ? { w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width) }
          : null;
      });
      await shot('s05b-material-resized');
      return {
        ok: after.pos.w > before.pos.w,
        observed: `before ${before.pos.w}x${before.pos.h} after ${after.pos.w}x${after.pos.h}; canvas ${JSON.stringify(canvas)}`,
      };
    },
  );

  // ---- 5. Format options, the Material section
  let materialControls = [];
  await step(
    'Format > Format options with the material selected',
    'the panel with a Material section: material, preset, the uniform rows, anchor, two-tone, plate, Capture frame',
    async () => {
      await openMenu(page, 'format');
      await clickControl(page, 'menu.format.formatOptions');
      await sleep(800);
      const base = `block.${materialBlockId}`;
      await page
        .locator(`[data-control="${base}.materialId"]`)
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      const facts = await page.evaluate((b) => {
        const els = [...document.querySelectorAll(`[data-control^="${b}."]`)];
        const rows = els.map((el) => ({
          id: el.getAttribute('data-control').slice(b.length + 1),
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? '',
          value: el.value ?? el.textContent?.trim().slice(0, 30) ?? '',
        }));
        const section = document.querySelector('.ts-material');
        const r = section?.getBoundingClientRect();
        const panel = section?.closest('[class*="panel"], aside, [role="region"]');
        const pr = panel?.getBoundingClientRect();
        const sliders = document.querySelectorAll('.ts-material input[type="range"]').length;
        const numbers = document.querySelectorAll('.ts-material input[type="number"]').length;
        const texts = document.querySelectorAll('.ts-material input[type="text"]').length;
        const colorInputs = document.querySelectorAll('.ts-material input[type="color"]').length;
        const selects = document.querySelectorAll('.ts-material select').length;
        const headings = [
          ...document.querySelectorAll(
            '[data-control^="formatOptions."], .ts-insp-section-title, button[aria-expanded]',
          ),
        ]
          .map((el) => el.textContent?.trim().slice(0, 40))
          .filter(Boolean);
        return {
          rows,
          sectionHeight: r ? Math.round(r.height) : null,
          sectionTop: r ? Math.round(r.top) : null,
          panelHeight: pr ? Math.round(pr.height) : null,
          sliders,
          numbers,
          texts,
          colorInputs,
          selects,
          headings: headings.slice(0, 30),
        };
      }, base);
      materialControls = facts.rows;
      await shot('s06-format-options-material-1440');
      const sec = page.locator('.ts-material').first();
      if (await sec.isVisible().catch(() => false)) {
        await sec.scrollIntoViewIfNeeded().catch(() => undefined);
        await sleep(300);
        await sec
          .screenshot({ path: path.join(OUT, 's06b-material-section-1440.png') })
          .catch(() => undefined);
      }
      return {
        ok: facts.rows.length > 0,
        observed: `${facts.rows.length} controls; section ${facts.sectionHeight} px tall at top ${facts.sectionTop} in a panel ${facts.panelHeight} px; sliders ${facts.sliders}, number fields ${facts.numbers}, text fields ${facts.texts}, color inputs ${facts.colorInputs}, selects ${facts.selects}; section headings ${facts.headings.join(' | ')}; controls: ${facts.rows.map((r) => `${r.id}(${r.tag}${r.type ? ':' + r.type : ''}=${String(r.value).slice(0, 16)})`).join(', ')}`,
      };
    },
  );

  await step(
    'type a uniform value and read the canvas',
    'Repetition 3 to 6 writes /uniforms and the live shader changes',
    async () => {
      const base = `block.${materialBlockId}`;
      const field = ctl(page, `${base}.uniforms.u_repetition`).first();
      if (!(await field.isVisible().catch(() => false)))
        return { ok: null, observed: 'not driven: no u_repetition field' };
      const r = await rectOf(page, '.ts-stagewrap.ts-editor [data-recipe] .material');
      const clip = {
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
      };
      const before = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      await field.scrollIntoViewIfNeeded().catch(() => undefined);
      const fr = await field.boundingBox();
      await clickAt(page, fr.x + fr.width / 2, fr.y + fr.height / 2);
      await press(page, 'Meta+a');
      await typeHuman(page, '6');
      await press(page, 'Tab');
      await settled(page);
      await sleep(1200);
      const after = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      await shot('s06c-after-uniform-edit');
      return {
        ok: after.block.uniforms?.u_repetition === 6,
        observed: `uniforms before ${JSON.stringify(before.block.uniforms)} after ${JSON.stringify(after.block.uniforms)}; revision ${(await state(page)).revision}`,
      };
    },
  );

  await step(
    'change the preset from the Preset select',
    'Chrome (Paper default) writes /preset and drops nothing else',
    async () => {
      const base = `block.${materialBlockId}`;
      const sel = ctl(page, `${base}.preset`).first();
      if (!(await sel.isVisible().catch(() => false)))
        return { ok: null, observed: 'not driven: no preset select' };
      const options = await sel.evaluate((el) =>
        [...el.options].map((o) => `${o.value}:${o.textContent}`),
      );
      await sel.selectOption('chrome');
      await settled(page);
      await sleep(1000);
      const after = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
      await shot('s06d-after-preset-chrome');
      return {
        ok: after.block.preset === 'chrome',
        observed: `options ${options.join(' | ')}; preset after ${after.block.preset}; uniforms ${JSON.stringify(after.block.uniforms)}`,
      };
    },
  );

  await step(
    'the Material section at 1280 by 800',
    'the section fits the panel without clipping',
    async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await sleep(900);
      const facts = await page.evaluate(() => {
        const section = document.querySelector('.ts-material');
        const r = section?.getBoundingClientRect();
        const fields = [
          ...document.querySelectorAll('.ts-material input, .ts-material select'),
        ].map((el) => {
          const b = el.getBoundingClientRect();
          return { right: Math.round(b.right), w: Math.round(b.width) };
        });
        return {
          height: r ? Math.round(r.height) : null,
          right: r ? Math.round(r.right) : null,
          overflow: fields.filter((f) => f.right > window.innerWidth).length,
          fieldWidths: [...new Set(fields.map((f) => f.w))],
        };
      });
      await shot('s07-format-options-material-1280');
      await page.setViewportSize({ width: 1440, height: 900 });
      await sleep(600);
      return {
        ok: facts.overflow === 0,
        observed: `section ${facts.height} px tall, right edge ${facts.right}; ${facts.overflow} fields past the viewport; field widths ${facts.fieldWidths.join(', ')}`,
      };
    },
  );

  // ---- 6. Capture frame through the hosted job
  await step(
    'Capture frame runs the hosted material.capture',
    'a frozen frame asset set as the block frame within 90 s',
    async () => {
      const base = `block.${materialBlockId}`;
      const btn = ctl(page, `${base}.capture`).first();
      if (!(await btn.isVisible().catch(() => false)))
        return { ok: null, observed: 'not driven: no Capture frame button' };
      const t0 = Date.now();
      await btn.scrollIntoViewIfNeeded().catch(() => undefined);
      const br = await btn.boundingBox();
      await clickAt(page, br.x + br.width / 2, br.y + br.height / 2);
      const result = await pollUntil(
        async () => {
          const b = (await objectsOf(page, titleSlide)).find((o) => o.id === materialBlockId);
          const label = await btn.textContent().catch(() => '');
          const err = await page.evaluate(
            () => document.querySelector('.ts-material-note[role="alert"]')?.textContent ?? null,
          );
          return { asset: b?.block.asset ?? null, label: (label ?? '').trim(), err };
        },
        (v) => v.asset !== null || v.err !== null,
        90_000,
        1000,
      );
      await sleep(1500);
      const facts = await page.evaluate(() => {
        const fig = document.querySelector('.ts-stagewrap.ts-editor [data-recipe]');
        const img = fig?.querySelector('img');
        return {
          img: img
            ? {
                src: (img.currentSrc || img.src).slice(0, 120),
                w: img.naturalWidth,
                h: img.naturalHeight,
              }
            : null,
          label: fig?.querySelector('.material-label')?.textContent ?? null,
          canvas: Boolean(fig?.querySelector('canvas')),
        };
      });
      await shot('s08-after-capture');
      return {
        ok: result.asset !== null,
        observed: `${Date.now() - t0} ms; asset ${result.asset}; button "${result.label}"; error ${result.err}; frame ${JSON.stringify(facts)}`,
      };
    },
  );

  // ---- 7. Slide > Change background, the Material row
  await step(
    'Slide > Change background, the Material row',
    'a Choose list of the catalog and a Place button; Dither toggle beside',
    async () => {
      await press(page, 'Escape', 2);
      await openMenu(page, 'slide');
      await clickControl(page, 'menu.slide.changeBackground');
      await page
        .locator('[data-control="dialog.background.material.choose"]')
        .waitFor({ timeout: 8000 });
      await sleep(400);
      await shot('s09-background-dialog');
      await clickControl(page, 'dialog.background.material.choose');
      await sleep(500);
      const facts = await page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll('[data-control^="dialog.background.material."]'),
        ].map(
          (el) =>
            `${el.getAttribute('data-control').replace('dialog.background.material.', '')}="${el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
        );
        const pics = document.querySelectorAll(
          '[data-control^="dialog.background.material."] img, [data-control^="dialog.background.material."] canvas',
        ).length;
        return { rows, pics };
      });
      await shot('s09b-background-material-list');
      return {
        ok: facts.rows.length > 2,
        observed: `${facts.rows.length} material controls, ${facts.pics} previews; ${facts.rows.slice(0, 40).join(', ')}`,
      };
    },
  );

  await step(
    'Place a gem smoke background',
    'slide.setBackgroundMaterial captures a frame server side and places a covering picture at the back',
    async () => {
      const pick = page
        .locator('[data-control="dialog.background.material.paper:gem-smoke.brand-blue"]')
        .first();
      if (!(await pick.isVisible().catch(() => false)))
        return { ok: null, observed: 'not driven: no gem smoke row' };
      await pick.scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(200);
      const pr = await pick.boundingBox();
      await clickAt(page, pr.x + pr.width / 2, pr.y + pr.height / 2);
      await sleep(600);
      const chooseText = await ctl(page, 'dialog.background.material.choose')
        .first()
        .textContent()
        .catch(() => null);
      const t0 = Date.now();
      const place = ctl(page, 'dialog.background.material.place').first();
      await place.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      await place.scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(200);
      const plr = await place.boundingBox().catch(() => null);
      const placeDisabled = await place.isDisabled().catch(() => null);
      await shot('s09c-background-material-chosen');
      if (!plr) {
        const controls = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="dialog.background."]')]
            .map((el) => el.getAttribute('data-control'))
            .filter((id) => !id.includes('material.paper'))
            .join(', '),
        );
        return {
          ok: false,
          observed: `no visible Place button after choosing; Choose reads "${chooseText}"; dialog controls: ${controls}`,
        };
      }
      if (placeDisabled)
        return {
          ok: false,
          observed: `Place is disabled after choosing; Choose reads "${chooseText}"`,
        };
      const before = (await objectsOf(page, titleSlide)).map((o) => o.id);
      await clickAt(page, plr.x + plr.width / 2, plr.y + plr.height / 2);
      const objs = await pollUntil(
        () => objectsOf(page, titleSlide),
        (o) => o.some((x) => !before.includes(x.id)),
        90_000,
        1000,
      );
      const placed = objs.find((x) => !before.includes(x.id)) ?? null;
      await sleep(1500);
      const err = await page.evaluate(
        () => document.querySelector('[role="alert"]')?.textContent ?? null,
      );
      await shot('s10-background-material-placed');
      return {
        ok: placed !== null,
        observed: `${Date.now() - t0} ms; placed ${placed ? `${placed.id} ${placed.type} pos ${JSON.stringify(placed.pos)} asset ${placed.block.asset} dither ${JSON.stringify(placed.block.dither)}` : 'nothing'}; alert ${err}`,
      };
    },
  );

  await step(
    'close the dialog and read the stage',
    'the background frame under the material block; canvases on the page',
    async () => {
      if (await has(page, '[data-control="dialog.background.done"]'))
        await clickControl(page, 'dialog.background.done');
      else await press(page, 'Escape');
      await sleep(800);
      const canvases = await canvasFacts(page);
      const recipes = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-stagewrap.ts-editor [data-recipe]')].map(
          (el) =>
            `${el.tagName.toLowerCase()} ${el.getAttribute('data-block') ?? ''} ${el.getAttribute('data-recipe').slice(0, 60)}`,
        ),
      );
      await shot('s11-stage-two-materials');
      return {
        ok: true,
        observed: `${recipes.length} recipe roots: ${recipes.join(' | ')}; canvases ${canvases.length}: ${canvases.map((k) => `${k.w}x${k.h}${k.inStage ? ' stage' : ''}`).join(', ')}`,
      };
    },
  );

  // ---- 8. off screen: a new slide, then back
  let secondSlide = null;
  await step(
    'New slide, then the canvases left behind',
    'the shader of the title slide is disposed when the stage shows another slide',
    async () => {
      await openMenu(page, 'slide');
      await clickControl(page, 'menu.slide.newSlide');
      await sleep(1500);
      await settled(page);
      secondSlide = await activeSlide(page);
      const canvases = await canvasFacts(page);
      const c = await cadence(page, 2000);
      return {
        ok: secondSlide !== titleSlide,
        observed: `active ${secondSlide}; canvases ${canvases.length}: ${canvases.map((k) => `${k.w}x${k.h}${k.inStage ? ' stage' : ''}${k.inFilm ? ' film' : ''}`).join(', ')}; ${c.fps} rAF per second with no shader in view`,
      };
    },
  );

  // ---- 9. the slideshow
  await step(
    'the slideshow on the title slide',
    'the show; whether a shader plays or the frozen frame stands',
    async () => {
      await invoke(page, 'view.goto', { slideId: titleSlide }).catch(() => undefined);
      await sleep(800);
      await clickControl(page, 'present.open');
      await sleep(2500);
      const facts = await page.evaluate(() => {
        const present = document.querySelector(
          '.ts-present, [data-present], .ts-slideshow, [class*="present"]',
        );
        const canvases = [...document.querySelectorAll('canvas')].map(
          (c) => `${c.width}x${c.height}`,
        );
        const recipes = document.querySelectorAll('[data-recipe]').length;
        const labels = [...document.querySelectorAll('.material-label')].map((l) => l.textContent);
        return {
          present: Boolean(present),
          url: location.pathname,
          canvases,
          recipes,
          labels,
          fullscreen: Boolean(document.fullscreenElement),
        };
      });
      const r = await rectOf(page, '[data-recipe] .material, [data-recipe]');
      let differ = null;
      if (r && r.w > 10) {
        const clip = {
          x: Math.max(0, r.x),
          y: Math.max(0, r.y),
          width: Math.max(1, Math.min(r.w, 1440 - r.x)),
          height: Math.max(1, Math.min(r.h, 900 - r.y)),
        };
        const a = await page.screenshot({ clip, type: 'png' });
        await sleep(900);
        const b = await page.screenshot({ clip, type: 'png' });
        differ = !a.equals(b);
      }
      await shot('s12-slideshow');
      await press(page, 'Escape');
      await sleep(800);
      return {
        ok: facts.recipes > 0,
        observed: `path ${facts.url}; present root ${facts.present}; ${facts.recipes} recipe roots; canvases ${facts.canvases.join(', ') || 'none'}; labels ${facts.labels.join(' | ')}; frames differ ${differ}`,
      };
    },
  );

  // ---- 10. the exports through the window API
  const downloadUrls = [];
  page.on('download', (d) => downloadUrls.push(d.url()));
  for (const [format, extra] of [
    ['pdf', {}],
    ['pptx', { mode: 'flatten' }],
  ]) {
    await step(
      `export.run ${format} with a material block and a material background`,
      'a report; what the material became',
      async () => {
        downloadUrls.length = 0;
        const t0 = Date.now();
        const result = await Promise.race([
          page.evaluate(
            async ([f, e]) => {
              const report = await window.turboslide.studio.invoke('export.run', {
                format: f,
                ...e,
              });
              return JSON.stringify(report ?? null).slice(0, 1500);
            },
            [format, extra],
          ),
          sleep(150_000).then(() => 'timeout after 150 s'),
        ]);
        await pollUntil(
          () => Promise.resolve(downloadUrls.length),
          (n) => n > 0,
          20_000,
          200,
        );
        let saved = 'no download';
        if (downloadUrls[0]) {
          const res = await page.request.get(downloadUrls[0]).catch(() => null);
          if (res) {
            const body = await res.body();
            const file = path.join(OUT, `export-${format}.${format}`);
            writeFileSync(file, body);
            saved = `${res.status()} ${body.length} bytes saved`;
          }
        }
        if (await has(page, '[data-control="export.report.close"]'))
          await clickControl(page, 'export.report.close');
        writeFileSync(path.join(OUT, `export-${format}-report.json`), String(result));
        return {
          ok: !String(result).startsWith('timeout'),
          observed: `${Date.now() - t0} ms; download ${saved}; ${String(result).slice(0, 600)}`,
        };
      },
    );
  }

  // ---- 11. reduced motion in a second context
  await step(
    'the editor under prefers-reduced-motion: reduce',
    'whether the material canvas still animates',
    async () => {
      const ctx2 = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      });
      const p2 = await ctx2.newPage();
      try {
        await p2.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
        await editorReady(p2);
        await invoke(p2, 'view.goto', { slideId: titleSlide }).catch(() => undefined);
        await p2
          .locator('.ts-stagewrap.ts-editor [data-recipe] canvas')
          .first()
          .waitFor({ timeout: 20_000 })
          .catch(() => undefined);
        await sleep(2500);
        const r = await rectOf(p2, '.ts-stagewrap.ts-editor [data-recipe] .material');
        if (!r) return { ok: null, observed: 'not driven: no .material box in the second context' };
        const clip = {
          x: Math.max(0, r.x),
          y: Math.max(0, r.y),
          width: Math.max(1, r.w),
          height: Math.max(1, r.h),
        };
        const a = await p2.screenshot({ clip, type: 'png' });
        await sleep(900);
        const b = await p2.screenshot({ clip, type: 'png' });
        const reduced = await p2.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        const canvases = await p2.evaluate(() => document.querySelectorAll('canvas').length);
        await p2.screenshot({ path: path.join(OUT, 's13-reduced-motion-editor.png') });
        return {
          ok: true,
          observed: `reduced motion ${reduced}; canvases ${canvases}; frames differ ${!a.equals(b)} (the shader ${!a.equals(b) ? 'still plays' : 'does not play'})`,
        };
      } finally {
        await ctx2.close();
      }
    },
  );

  // ---- 12. the viewer route
  await step('the shared viewer /deck/<id>', 'the frozen frames; no live canvas', async () => {
    const p3 = await context.newPage();
    try {
      await p3.goto(`${BASE}/deck/${deckId}`, { waitUntil: 'domcontentloaded' });
      await sleep(4000);
      const facts = await p3.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        recipes: document.querySelectorAll('[data-recipe]').length,
        labels: [...document.querySelectorAll('.material-label')].map((l) => l.textContent),
        imgs: [...document.querySelectorAll('[data-recipe] img, .material img')].map(
          (i) => `${i.naturalWidth}x${i.naturalHeight}`,
        ),
      }));
      await p3.screenshot({ path: path.join(OUT, 's14-viewer.png') });
      return { ok: true, observed: JSON.stringify(facts) };
    } finally {
      await p3.close();
    }
  });

  record(
    'console errors during the walk',
    'none',
    `${consoleErrors.length}${consoleErrors.length ? `: ${[...new Set(consoleErrors)].slice(0, 4).join(' || ')}` : ''}`,
    consoleErrors.length === 0 ? true : null,
  );
} catch (error) {
  record(
    'the walk ran to completion',
    'no exception outside a step',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    false,
  );
} finally {
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
      await press(page, 'Escape', 2);
      await openMenu(page, 'file');
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
    for (const route of ['deck', 'edit']) {
      let status = 0;
      const until = Date.now() + 25_000;
      for (;;) {
        const res = await page.request
          .get(`${BASE}/${route}/${deckId}`, { maxRedirects: 0 })
          .catch(() => null);
        status = res ? res.status() : -1;
        if (status === 404 || Date.now() > until) break;
        await sleep(2000);
      }
      record(
        `the scratch deck answers 404 on /${route}`,
        `GET /${route}/${deckId} is 404 within 25 s`,
        `status ${status}`,
        status === 404,
      );
    }
  }
  writeFileSync(
    path.join(OUT, 'walk.json'),
    JSON.stringify(
      {
        base: BASE,
        deckId,
        startedAt: new Date(started).toISOString(),
        ms: Date.now() - started,
        rows,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(
    `\n${rows.filter((r) => r.ok === true).length} ok, ${rows.filter((r) => r.ok === false).length} failed, ${rows.filter((r) => r.ok === null).length} not driven, ${Math.round((Date.now() - started) / 1000)} s`,
  );
}

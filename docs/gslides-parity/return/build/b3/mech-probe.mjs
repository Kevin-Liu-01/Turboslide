// b3 return round: the mechanism probe. Drives, on a dev server, the gestures RETURN.md section 6
// gives B3: the guide drag (fast and slow), the grid snap effect, Tab from the Slideshow half
// with a selection, the connector drawn between two shapes and its end re-dragged to a third, the
// draw readout, the fresh shape's look on both appearances, and the label entry by Enter and by
// double click. Standalone over playwright-core; every observation through the page and the
// window API. Usage: node mech-probe.mjs --base http://localhost:4403 [--only a,b] [--json out]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:4403');
const ONLY = arg('only', null)?.split(',') ?? null;
const JSON_OUT = arg('json', null);
const HEADED = argv.includes('--headed');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const log = (...a) => console.log(...a);

const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
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
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
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
  walk(slide);
  return out;
};
const blockOf = async (page, slideId, id) =>
  (await objectsOf(page, slideId)).find((o) => o.id === id) ?? null;
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const kOf = async (page) => ((await rectOf(page, SHEET))?.w ?? 0) / 1600;
const sheetPoint = async (page, sx, sy) => {
  const r = await rectOf(page, SHEET);
  const k = r.w / 1600;
  return { x: r.x + sx * k, y: r.y + sy * k };
};
const readout = (page) =>
  page.evaluate(() => document.querySelector('.ts-readout')?.textContent ?? null);
const guideReadout = (page) =>
  page.evaluate(() => document.querySelector('.ts-guide-readout')?.textContent ?? null);
const chip = (page) =>
  page.evaluate(() => document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null);
const editing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const handleControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-overlay [data-control^="handle."]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const handleRect = (page, control) => rectOf(page, `.ts-overlay [data-control="${control}"]`);
const activeDesc = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a
      ? `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}`
      : 'none';
  });
const guidesShown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-deck-guide[data-control]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const moveHuman = async (page, from, to, steps = 12, pause = [14, 26]) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    if (pause) await sleep(pause[0] + Math.random() * (pause[1] - pause[0]));
  }
};
const clickAt = async (page, x, y, opts = {}) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(60);
  await page.mouse.click(x, y, opts);
  await sleep(180);
};
const drag = async (page, from, to, { steps = 14, during, hold = 80, mods = [] } = {}) => {
  await moveHuman(page, { x: from.x - 30, y: from.y - 20 }, from, 6);
  await sleep(80);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.down();
  await sleep(hold);
  await moveHuman(page, from, to, steps);
  await sleep(100);
  const mid = during ? await during() : undefined;
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
  await sleep(160);
  return mid;
};
const ctl = (page, c) => page.locator(`[data-control="${c}"]`).first();
const openMenu = async (page, id) => {
  const r = await ctl(page, `menubar.${id}`).boundingBox();
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 6000 });
  await sleep(200);
};
const hoverRow = async (page, id, waitFor) => {
  const r = await ctl(page, `menu.${id}`).boundingBox();
  await moveHuman(
    page,
    { x: r.x + 6, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(350);
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const clickRow = async (page, id) => {
  const r = await ctl(page, `menu.${id}`).boundingBox();
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await sleep(250);
};
const menuPath = async (page, menuId, ...ids) => {
  await openMenu(page, menuId);
  for (let i = 0; i < ids.length - 1; i += 1)
    await hoverRow(page, ids[i], `[data-control="menu.${ids[i + 1]}"]`);
  await clickRow(page, ids[ids.length - 1]);
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(150);
};
const closeMenus = async (page) => {
  for (let i = 0; i < 2; i += 1) {
    if (await page.locator('[role="menu"]').count()) {
      await page.keyboard.press('Escape');
      await sleep(120);
    }
  }
};
const settingOn = async (page, name, want) => {
  let s = await state(page);
  const cur = s.settings?.[name];
  if (Boolean(cur) === want) return `${name} already ${want}`;
  const path = {
    showGuides: ['view', 'view.guides', 'view.guides.show'],
    snapGuides: ['view', 'view.snapTo', 'view.snapTo.guides'],
    snapGrid: ['view', 'view.snapTo', 'view.snapTo.grid'],
    advancedTools: ['tools', 'tools.advancedTools'],
  }[name];
  await menuPath(page, ...path);
  s = await pollUntil(
    () => state(page),
    (x) => Boolean(x.settings?.[name]) === want,
    5000,
  );
  return `${name} -> ${s.settings?.[name]}`;
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
const gotoSlide = async (page, slideId) => {
  const r = await ctl(page, `filmstrip.slide.${slideId}`)
    .boundingBox()
    .catch(() => null);
  if (r) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  else await invoke(page, 'view.goto', { slideId });
  await pollUntil(
    async () => (await state(page)).slideId,
    (a) => a === slideId,
    8000,
  );
  await sleep(400);
};
const placeBlock = async (page, slideId, block) => {
  const before = (await objectsOf(page, slideId)).map((o) => o.id);
  const s = await state(page);
  await invoke(page, 'block.insert', { baseRevision: s.revision, slideId, slot: 'main', block });
  const objs = await pollUntil(
    () => objectsOf(page, slideId),
    (o) => o.some((x) => !before.includes(x.id)),
    15_000,
  );
  await settled(page);
  return objs.find((x) => !before.includes(x.id)) ?? null;
};
const clearAll = async (page) => {
  await closeMenus(page);
  await page.keyboard.press('Escape');
  await sleep(80);
  await page.keyboard.press('Escape');
  await sleep(120);
};
const boxOf = (page, id) =>
  page.evaluate((blockId) => {
    const inner = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
    );
    if (!inner) return null;
    const free = inner.closest('.free') ?? inner;
    const f = free.getBoundingClientRect();
    return { x: f.x, y: f.y, w: f.width, h: f.height };
  }, id);
const selectObject = async (page, id) => {
  const b = await boxOf(page, id);
  if (!b) return null;
  const c = center(b);
  await clickAt(page, c.x, c.y);
  let ctrls = await handleControls(page);
  if (!ctrls.includes(`handle.${id}.move`)) {
    await clickAt(page, b.x + 3, b.y + 3);
    ctrls = await handleControls(page);
  }
  if (await editing(page)) {
    await page.keyboard.press('Escape');
    await sleep(150);
    ctrls = await handleControls(page);
  }
  return ctrls.includes(`handle.${id}.move`) ? ctrls : null;
};
const pathFacts = (page, id) =>
  page.evaluate((blockId) => {
    const inner = document.querySelector(
      `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
    );
    const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
    const path = svg?.querySelector('path, ellipse, rect, circle, line');
    if (!svg || !path) return null;
    const cs = getComputedStyle(path);
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    let ground = null;
    for (let node = sheet; node && ground === null; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(bg))
        ground = bg;
    }
    return {
      tag: path.tagName.toLowerCase(),
      fill: cs.fill,
      stroke: cs.stroke,
      strokeWidth: cs.strokeWidth,
      ground,
      d: path.getAttribute('d') ?? '',
    };
  }, id);
const luminance = (colour) => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(colour ?? '');
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  const lin = (c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
};

async function step(name, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try {
    const r = await fn();
    rows.push({ name, ok: r.ok, observed: r.observed, ms: Date.now() - t0 });
    log(`${r.ok ? 'PASS' : 'FAIL'} ${name}: ${r.observed}`);
  } catch (e) {
    rows.push({
      name,
      ok: false,
      observed: `threw: ${String(e).slice(0, 300)}`,
      ms: Date.now() - t0,
    });
    log(`FAIL ${name}: threw ${String(e).slice(0, 300)}`);
  }
}

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});
let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  // the deck's first write: a double click on the title, a name, Escape (the audits' route)
  const title = await rectOf(page, `${SHEET} [data-run]`);
  await page.mouse.dblclick(title.x + title.w / 2, title.y + title.h / 2);
  await sleep(300);
  await page.keyboard.type('b3 mechanism probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await settled(page);
  const info = await invoke(page, 'deck.info');
  deckId = info.id;
  const titleSlide = (await slideOrder(page))[0];
  log(`deck ${deckId}; title slide ${titleSlide}; theme ${(await state(page)).theme}`);

  // ---- guides: the fast and the slow drag (arrange.guides.drag)
  const S1 = await setupSlide(page, titleSlide);
  await gotoSlide(page, S1);
  await step('guides.setup', async () => {
    const on = await settingOn(page, 'showGuides', true);
    const s = await state(page);
    await invoke(page, 'deck.guides', {
      baseRevision: s.revision,
      add: [
        { axis: 'x', at: 400 },
        { axis: 'x', at: 800 },
        { axis: 'y', at: 450 },
      ],
    });
    await settled(page);
    const shown = await pollUntil(
      () => guidesShown(page),
      (g) => g.includes('guide.x.800'),
      8000,
    );
    const info2 = await invoke(page, 'deck.info');
    return {
      ok: shown.includes('guide.x.800'),
      observed: `${on}; shown ${shown.join(',')}; deck.info guides ${JSON.stringify(info2.guides ?? null)}`,
    };
  });
  const dragGuide = async (fromAt, toAt, { hold, steps, pause }) => {
    const r =
      (await handleRect(page, `guide.x.${fromAt}`).catch(() => null)) ??
      (await rectOf(page, `.ts-deck-guide[data-control="guide.x.${fromAt}"]`));
    if (!r) return { ok: false, observed: `no guide element guide.x.${fromAt}` };
    const from = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const to = await sheetPoint(page, toAt, 450);
    const target = { x: to.x, y: from.y };
    const under = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.getAttribute('data-control') ??
        document.elementFromPoint(x, y)?.className ??
        null,
      [from.x, from.y],
    );
    await page.mouse.move(from.x, from.y);
    await sleep(40);
    await page.mouse.down();
    if (hold) await sleep(hold);
    await moveHuman(page, from, target, steps, pause);
    const during = await guideReadout(page);
    await page.mouse.up();
    await sleep(200);
    await settled(page);
    const shown = await pollUntil(
      () => guidesShown(page),
      (g) => g.includes(`guide.x.${toAt}`),
      4000,
    );
    const info2 = await invoke(page, 'deck.info');
    const words = await page.evaluate(
      () => document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
    );
    const snack = await page.evaluate(
      () =>
        document.querySelector('[role="status"], .ts-snackbar, .ts-snack')?.textContent?.trim() ??
        null,
    );
    return {
      ok: shown.includes(`guide.x.${toAt}`) && !shown.includes(`guide.x.${fromAt}`),
      observed: `under press ${under}; readout during "${during}"; guides after ${shown.join(',')}; deck.info ${JSON.stringify(info2.guides ?? null)}; save "${words}"; status "${snack}"`,
    };
  };
  await step('guides.drag.fast', () => dragGuide(800, 600, { hold: 0, steps: 14, pause: null }));
  await step('guides.drag.fast.back', () =>
    dragGuide(600, 800, { hold: 0, steps: 14, pause: null }),
  );
  await step('guides.drag.slow', () =>
    dragGuide(800, 600, { hold: 300, steps: 20, pause: [30, 50] }),
  );
  await step('guides.drag.slow.back', () =>
    dragGuide(600, 800, { hold: 300, steps: 20, pause: [30, 50] }),
  );
  await step('guides.drag.fast.2', () => dragGuide(800, 600, { hold: 0, steps: 14, pause: null }));
  await step('guides.drag.fast.2.back', () =>
    dragGuide(600, 800, { hold: 0, steps: 14, pause: null }),
  );
  await step('guides.cleanup', async () => {
    const s = await state(page);
    await invoke(page, 'deck.guides', { baseRevision: s.revision, clear: true });
    await settled(page);
    const off = await settingOn(page, 'showGuides', false);
    return { ok: true, observed: off };
  });

  // ---- the grid snap effect (arrange.snap.grid-effect)
  const S2 = await setupSlide(page, S1);
  await gotoSlide(page, S2);
  let rectId = null;
  await step('grid.effect', async () => {
    const obj = await placeBlock(page, S2, {
      id: 'grid-box',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos: { x: 200, y: 300, w: 240, h: 160, z: 1 },
    });
    rectId = obj?.id ?? null;
    if (!rectId) return { ok: false, observed: 'no rectangle placed' };
    const a = await settingOn(page, 'snapGuides', false);
    const b = await settingOn(page, 'snapGrid', true);
    const k = await kOf(page);
    const facts = [a, b];
    const dragBy = async (dx) => {
      await clearAll(page);
      await selectObject(page, rectId);
      const bx = await boxOf(page, rectId);
      const from = { x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 };
      const before = (await blockOf(page, S2, rectId)).pos;
      await drag(page, from, { x: from.x + dx * k, y: from.y });
      const after = await pollUntil(
        async () => (await blockOf(page, S2, rectId)).pos,
        (p) => p.x !== before.x,
        8000,
      );
      await settled(page);
      return { before: before.x, after: after.x };
    };
    const on = await dragBy(36); // aimed 236, 4 px off the 8 px grid
    facts.push(`grid on: ${on.before} -> ${on.after} (aimed ${on.before + 36})`);
    await page.keyboard.press('Meta+z');
    await settled(page);
    const c = await settingOn(page, 'snapGrid', false);
    facts.push(c);
    const off = await dragBy(36);
    facts.push(`grid off: ${off.before} -> ${off.after} (aimed ${off.before + 36})`);
    await page.keyboard.press('Meta+z');
    await settled(page);
    await settingOn(page, 'snapGuides', true);
    return { ok: on.after === 240 && off.after === 236, observed: facts.join('; ') };
  });

  // ---- Tab from the Slideshow half with a selection (chrome.split.tab-order)
  await step('tab.from-slideshow', async () => {
    await gotoSlide(page, titleSlide);
    await clearAll(page);
    const title = await rectOf(page, `${SHEET} [data-run]`);
    await clickAt(page, title.x + title.w / 2, title.y + title.h / 2);
    const chipBefore = await chip(page);
    await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
    const focusBefore = await activeDesc(page);
    const prevented = await page.evaluate(() =>
      new Promise((resolve) => {
        const h = (e) => {
          if (e.key === 'Tab') {
            window.removeEventListener('keydown', h, true);
            setTimeout(() => resolve(e.defaultPrevented), 0);
          }
        };
        window.addEventListener('keydown', h, true);
        setTimeout(() => resolve('no key seen'), 3000);
      }).then((v) => v),
    );
    await sleep(50);
    await page.keyboard.press('Tab');
    const wasPrevented = await prevented;
    await sleep(150);
    const focusAfter = await activeDesc(page);
    const chipAfter = await chip(page);
    // nothing selected: Tab from the half
    await clearAll(page);
    await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
    await page.keyboard.press('Tab');
    await sleep(150);
    const focusNone = await activeDesc(page);
    return {
      ok:
        focusAfter.includes('present.arrow') &&
        chipAfter === chipBefore &&
        focusNone.includes('present.arrow'),
      observed: `with "${chipBefore}" selected: focus ${focusBefore} -> ${focusAfter}, chip -> "${chipAfter}", Tab defaultPrevented ${wasPrevented}; nothing selected: focus -> ${focusNone}`,
    };
  });

  // ---- connectors: draw between A and B, move B, re-end to C (lines.connector.elbow, .re-end)
  const S3 = await setupSlide(page, S2);
  await gotoSlide(page, S3);
  let A = null,
    B = null,
    C = null,
    conn = null;
  await step('connector.setup', async () => {
    A = await placeBlock(page, S3, {
      id: 'box-a',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos: { x: 200, y: 300, w: 240, h: 160, z: 1 },
    });
    B = await placeBlock(page, S3, {
      id: 'box-b',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos: { x: 900, y: 300, w: 240, h: 160, z: 2 },
    });
    C = await placeBlock(page, S3, {
      id: 'box-c',
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos: { x: 900, y: 620, w: 240, h: 160, z: 3 },
    });
    const sw = await settingOn(page, 'advancedTools', true);
    return { ok: Boolean(A && B && C), observed: `A ${A?.id} B ${B?.id} C ${C?.id}; ${sw}` };
  });
  await step('connector.elbow.draw', async () => {
    await clearAll(page);
    const before = (await objectsOf(page, S3)).map((o) => o.id);
    await menuPath(page, 'insert', 'insert.line', 'insert.line.elbowConnector');
    const from = await sheetPoint(page, 440, 380);
    const to = await sheetPoint(page, 900, 380);
    const sites = await drag(page, from, to, {
      during: () =>
        page.evaluate(
          () => document.querySelectorAll('.ts-overlay .ts-site, .ts-overlay [data-site]').length,
        ),
    });
    const objs = await pollUntil(
      () => objectsOf(page, S3),
      (o) => o.some((x) => !before.includes(x.id)),
      12_000,
    );
    conn = objs.find((x) => !before.includes(x.id)) ?? null;
    await page.keyboard.press('Escape');
    await settled(page);
    const connect = conn?.block.connect ?? null;
    return {
      ok: Boolean(conn) && connect?.start?.block === A.id && connect?.end?.block === B.id,
      observed: conn
        ? `${conn.block.shape} ${conn.id} ${JSON.stringify(conn.pos)} connect ${JSON.stringify(connect)}; site rings during ${sites}`
        : 'nothing inserted',
    };
  });
  await step('connector.follows-moved-shape', async () => {
    if (!conn) return { ok: false, observed: 'no connector' };
    await clearAll(page);
    await selectObject(page, B.id);
    const bx = await boxOf(page, B.id);
    const k = await kOf(page);
    const from = { x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 };
    const before = (await blockOf(page, S3, conn.id)).pos;
    await drag(page, from, { x: from.x, y: from.y + 150 * k });
    const after = await pollUntil(
      async () => (await blockOf(page, S3, conn.id)).pos,
      (p) => JSON.stringify(p) !== JSON.stringify(before),
      8000,
    );
    await settled(page);
    const bPos = (await blockOf(page, S3, B.id)).pos;
    await page.keyboard.press('Meta+z');
    await settled(page);
    return {
      ok: after.h > before.h + 100,
      observed: `B y 300 -> ${bPos.y}; connector ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    };
  });
  await step('connector.re-end', async () => {
    if (!conn) return { ok: false, observed: 'no connector' };
    await clearAll(page);
    let ctrls = await selectObject(page, conn.id);
    if (!ctrls) {
      // a 1 px tall box: Tab cycles to it
      await clickAt(page, ...Object.values(await sheetPoint(page, 100, 100)));
      for (let i = 0; i < 6 && !(ctrls ?? []).includes(`handle.${conn.id}.end`); i += 1) {
        await page.keyboard.press('Tab');
        await sleep(200);
        ctrls = await handleControls(page);
      }
    }
    const endCtl = `handle.${conn.id}.end`;
    const h = await handleRect(page, endCtl);
    if (!h)
      return {
        ok: false,
        observed: `no end handle; handles ${(ctrls ?? []).join(',')}; chip ${await chip(page)}`,
      };
    const from = center(h);
    const to = await sheetPoint(page, 900, 700); // C's left site
    const rings = await drag(page, from, to, {
      during: () =>
        page.evaluate(
          () =>
            document.querySelectorAll('.ts-overlay .ts-site, .ts-overlay [class*="site"]').length,
        ),
    });
    const after = await pollUntil(
      async () => (await blockOf(page, S3, conn.id)).block,
      (b) => b.connect?.end?.block === C.id,
      8000,
    );
    await settled(page);
    // move C; the connector follows
    await clearAll(page);
    await selectObject(page, C.id);
    const cx = await boxOf(page, C.id);
    const k = await kOf(page);
    const posBefore = (await blockOf(page, S3, conn.id)).pos;
    await drag(
      page,
      { x: cx.x + cx.w / 2, y: cx.y + cx.h / 2 },
      { x: cx.x + cx.w / 2 + 120 * k, y: cx.y + cx.h / 2 },
    );
    const posAfter = await pollUntil(
      async () => (await blockOf(page, S3, conn.id)).pos,
      (p) => JSON.stringify(p) !== JSON.stringify(posBefore),
      8000,
    );
    await settled(page);
    return {
      ok:
        after.connect?.end?.block === C.id &&
        JSON.stringify(posAfter) !== JSON.stringify(posBefore),
      observed: `site rings during ${rings}; connect after ${JSON.stringify(after.connect)}; pos ${JSON.stringify(posBefore)} -> ${JSON.stringify(posAfter)} after C moved 120`,
    };
  });

  // ---- the draw readout, the light look, Enter and the double click (shapes.*)
  const S4 = await setupSlide(page, S3);
  await gotoSlide(page, S4);
  let drawn = null;
  await step('shape.draw.readout', async () => {
    await clearAll(page);
    const before = (await objectsOf(page, S4)).map((o) => o.id);
    await menuPath(
      page,
      'insert',
      'insert.shape',
      'insert.shape.shapes',
      'insert.shape.shapes.rectangle',
    );
    const from = await sheetPoint(page, 300, 300);
    const to = await sheetPoint(page, 620, 500);
    const mid = await drag(page, from, to, {
      during: async () => ({
        readout: await readout(page),
        marquee: await page.evaluate(() =>
          Boolean(document.querySelector('.ts-marquee, [data-marquee]')),
        ),
      }),
    });
    const objs = await pollUntil(
      () => objectsOf(page, S4),
      (o) => o.some((x) => !before.includes(x.id)),
      12_000,
    );
    drawn = objs.find((x) => !before.includes(x.id)) ?? null;
    await page.keyboard.press('Escape');
    await settled(page);
    const after = await readout(page);
    return {
      ok: Boolean(drawn) && /^\d+ × \d+$/.test(mid.readout ?? '') && after === null,
      observed: `readout during "${mid.readout}" (marquee ${mid.marquee}); after ${after}; drawn ${drawn ? `${drawn.id} ${JSON.stringify(drawn.pos)}` : 'nothing'}`,
    };
  });
  await step('shape.look.both-appearances', async () => {
    if (!drawn) return { ok: false, observed: 'no shape' };
    const visibleOn = async () => {
      const f = await pathFacts(page, drawn.id);
      if (!f) return { ok: false, why: 'no svg' };
      const g = luminance(f.ground),
        fi = luminance(f.fill),
        st = luminance(f.stroke);
      const w = parseFloat(f.strokeWidth) || 0;
      const fillSeen = fi !== null && g !== null && Math.abs(fi - g) > 0.12;
      const strokeSeen = st !== null && g !== null && Math.abs(st - g) > 0.2 && w >= 1;
      return {
        ok: fillSeen || strokeSeen,
        why: `fill ${f.fill} stroke ${f.stroke} ${f.strokeWidth} on ${f.ground}: fill seen ${fillSeen}, stroke seen ${strokeSeen}`,
      };
    };
    const start = (await state(page)).theme;
    const first = await visibleOn();
    let s = await state(page);
    const other = start === 'dark' ? 'light' : 'dark';
    await invoke(page, 'deck.set', {
      baseRevision: s.revision,
      path: '/defaults/appearance',
      value: other,
    });
    await pollUntil(
      () => state(page),
      (x) => x.theme === other,
      10_000,
    );
    await sleep(400);
    const second = await visibleOn();
    s = await state(page);
    await invoke(page, 'deck.set', {
      baseRevision: s.revision,
      path: '/defaults/appearance',
      value: start,
    });
    await pollUntil(
      () => state(page),
      (x) => x.theme === start,
      10_000,
    );
    await settled(page);
    return {
      ok: first.ok && second.ok,
      observed: `${start}: ${first.why} | ${other}: ${second.why}`,
    };
  });
  await step('shape.label.enter', async () => {
    if (!drawn) return { ok: false, observed: 'no shape' };
    await clearAll(page);
    await selectObject(page, drawn.id);
    await page.keyboard.press('Enter');
    await sleep(300);
    const on = await editing(page);
    await page.keyboard.type('Label', { delay: 40 });
    await page.keyboard.press('Escape');
    await settled(page);
    const b = await pollUntil(
      async () => (await blockOf(page, S4, drawn.id)).block,
      (x) => x.text === 'Label',
      8000,
    );
    return {
      ok: on && b.text === 'Label',
      observed: `session by Enter ${on}; block.text "${b.text}"`,
    };
  });
  await step('shape.label.double-click', async () => {
    if (!drawn) return { ok: false, observed: 'no shape' };
    await clearAll(page);
    const bx = await boxOf(page, drawn.id);
    await page.mouse.dblclick(bx.x + bx.w / 2, bx.y + bx.h / 2);
    await sleep(300);
    const on = await editing(page);
    const caret = await page.evaluate(() => {
      const s = window.getSelection();
      return s
        ? `${s.anchorOffset}/${s.anchorNode?.textContent?.length ?? 'n'} collapsed ${s.isCollapsed}`
        : 'none';
    });
    await page.keyboard.press('End');
    await page.keyboard.type('2', { delay: 40 });
    await page.keyboard.press('Escape');
    await settled(page);
    const b = await pollUntil(
      async () => (await blockOf(page, S4, drawn.id)).block,
      (x) => x.text === 'Label2',
      8000,
    );
    return {
      ok: on && b.text === 'Label2',
      observed: `session by double click ${on}; caret ${caret}; block.text "${b.text}"`,
    };
  });
} finally {
  if (deckId) {
    try {
      const s = await state(page).catch(() => null);
      if (s) {
        await invoke(page, 'deck.trash', { id: deckId, baseRevision: s.revision }).catch((e) =>
          log(`trash: ${String(e).slice(0, 120)}`),
        );
        const s2 = await state(page).catch(() => s);
        await invoke(page, 'deck.remove', {
          id: deckId,
          confirm: true,
          baseRevision: s2.revision,
        }).catch((e) => log(`remove: ${String(e).slice(0, 120)}`));
      }
      const r = await page
        .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
        .catch(() => null);
      log(`cleanup: /edit/${deckId} -> ${r?.status() ?? 'no response'}`);
    } catch (e) {
      log(`cleanup failed: ${String(e).slice(0, 200)}`);
    }
  }
  await browser.close();
  const out = { base: BASE, deck: deckId, at: new Date().toISOString(), rows, consoleErrors };
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  const failed = rows.filter((r) => !r.ok).length;
  log(`\n${rows.length - failed} passed, ${failed} failed; console errors ${consoleErrors.length}`);
  process.exit(failed ? 1 : 0);
}

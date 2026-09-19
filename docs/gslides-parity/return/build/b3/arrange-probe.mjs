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
  await sleep(150);
  for (let i = 0; i < 2 && (await page.locator('[role="menu"]').count()); i += 1) {
    await page.keyboard.press('Escape');
    await sleep(120);
  }
};
const closeMenus = async (page) => {
  for (let i = 0; i < 4 && (await page.locator('[role="menu"]').count()); i += 1) {
    await page.keyboard.press('Escape');
    await sleep(150);
  }
  await pollUntil(
    () => page.locator('[role="menu"]').count(),
    (n) => n === 0,
    2000,
    100,
  );
  await sleep(120);
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

// b3: the arrange rows RETURN.md 2.12 returns and the two lines rows no audit drove, with their
// undo, a reload, the show and the PDF (this file's head is mech-probe.mjs's helper block).
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
const shiftClickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 40, y: y - 25 }, { x, y }, 6);
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
  await sleep(220);
};
const selectMany = async (page, ids) => {
  await clearAll(page);
  for (const [i, id] of ids.entries()) {
    const b = await boxOf(page, id);
    const c = center(b);
    if (i === 0) await clickAt(page, c.x, c.y);
    else await shiftClickAt(page, c.x, c.y);
  }
  if (await editing(page)) {
    await page.keyboard.press('Escape');
    await sleep(150);
  }
  let c = await chip(page);
  const want = ids.length === 1 ? null : `${ids.length} objects`;
  if (want !== null && c !== want && !/Group/.test(c ?? '')) {
    // a click that closed a late menu selected nothing: once more from a clear stage
    await clearAll(page);
    for (const [i, id] of ids.entries()) {
      const b = await boxOf(page, id);
      const p = center(b);
      if (i === 0) await clickAt(page, p.x, p.y);
      else await shiftClickAt(page, p.x, p.y);
    }
    c = await chip(page);
  }
  return c;
};
const rowState = async (page, menuId, ...path) => {
  await openMenu(page, menuId);
  for (let i = 0; i < path.length - 1; i += 1)
    await hoverRow(page, path[i], `[data-control="menu.${path[i + 1]}"]`).catch(() => undefined);
  const facts = await page.evaluate(
    (id) => {
      const el = document.querySelector(`[data-control="menu.${id}"]`);
      return el
        ? { present: true, disabled: el.getAttribute('aria-disabled') === 'true' }
        : { present: false, disabled: null };
    },
    path[path.length - 1],
  );
  await closeMenus(page);
  return facts;
};
const rightClickAt = async (page, x, y) => {
  await moveHuman(page, { x: x - 30, y: y - 20 }, { x, y }, 6);
  await sleep(60);
  await page.mouse.click(x, y, { button: 'right' });
  await page.locator('.ts-context-menu').first().waitFor({ timeout: 5000 });
  await sleep(200);
};
const contextRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-context-menu [data-control^="menu."]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute('data-control').slice(5)),
  );
const clickContextRow = async (page, id) => {
  const r = await page
    .locator(`.ts-context-menu [data-control="menu.${id}"]`)
    .first()
    .boundingBox();
  if (!r) throw new Error(`no context row ${id}`);
  await clickAt(page, r.x + r.width / 2, r.y + r.height / 2);
};
const hoverContextRow = async (page, id, waitFor) => {
  const r = await page
    .locator(`.ts-context-menu [data-control="menu.${id}"]`)
    .first()
    .boundingBox();
  if (!r) throw new Error(`no context row ${id}`);
  await moveHuman(
    page,
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(350);
  if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
};
const undo = async (page) => {
  await page.keyboard.press('Meta+z');
  await sleep(400);
  await settled(page);
};
const posOf = async (page, S, id) => (await blockOf(page, S, id))?.pos ?? null;
const gapsEven = (a, b, c, axis) => {
  const s = [a, b, c].sort((p, q) => p[axis] - q[axis]);
  const size = axis === 'x' ? 'w' : 'h';
  const g1 = s[1][axis] - (s[0][axis] + s[0][size]);
  const g2 = s[2][axis] - (s[1][axis] + s[1][size]);
  return { even: Math.abs(g1 - g2) <= 1, g1, g2 };
};

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('%c[Server]'))
    consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
});
let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  const title = await rectOf(page, `${SHEET} [data-run]`);
  await page.mouse.dblclick(title.x + title.w / 2, title.y + title.h / 2);
  await sleep(300);
  await page.keyboard.type('b3 arrange probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await settled(page);
  deckId = (await invoke(page, 'deck.info')).id;
  const titleSlide = (await slideOrder(page))[0];
  const S = await setupSlide(page, titleSlide);
  await gotoSlide(page, S);
  const A = 'box-a',
    B = 'box-b',
    C = 'box-c',
    L = 'line-1',
    N = 'note-1';
  await step('setup', async () => {
    const shape = (id, x, y, z) => ({
      id,
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      text: '',
      pos: { x, y, w: 240, h: 160, z },
    });
    const a = await placeBlock(page, S, shape(A, 200, 200, 1));
    const b = await placeBlock(page, S, shape(B, 600, 500, 2));
    const c = await placeBlock(page, S, shape(C, 1100, 300, 3));
    const l = await placeBlock(page, S, {
      id: L,
      type: 'shape',
      shape: 'line',
      orientation: 'horizontal',
      pos: { x: 200, y: 760, w: 500, h: 2, z: 4 },
    });
    const n = await placeBlock(page, S, {
      id: N,
      type: 'text',
      text: 'Note',
      pos: { x: 900, y: 720, w: 300, h: 64, z: 5 },
    });
    const dist = await rowState(page, 'arrange', 'arrange.distribute');
    let sw = 'the Arrange rows are in the default view; the switch stays off';
    if (!dist.present) sw = await settingOn(page, 'advancedTools', true);
    return {
      ok: Boolean(a && b && c && l && n),
      observed: `objects ${[a, b, c, l, n].map((o) => o?.id).join(',')}; Distribute present with the switch off ${dist.present}; ${sw}`,
    };
  });
  const start = {
    a: await posOf(page, S, A),
    b: await posOf(page, S, B),
    c: await posOf(page, S, C),
  };
  await step('arrange.distribute.horizontal', async () => {
    const ch = await selectMany(page, [A, B, C]);
    await menuPath(page, 'arrange', 'arrange.distribute', 'arrange.distribute.horizontally');
    const after = await pollUntil(
      async () => ({
        a: await posOf(page, S, A),
        b: await posOf(page, S, B),
        c: await posOf(page, S, C),
      }),
      (p) => p.b.x !== start.b.x || p.a.x !== start.a.x || p.c.x !== start.c.x,
      8000,
    );
    const g = gapsEven(after.a, after.b, after.c, 'x');
    await clearAll(page);
    await undo(page);
    const back = {
      a: await posOf(page, S, A),
      b: await posOf(page, S, B),
      c: await posOf(page, S, C),
    };
    return {
      ok: g.even && JSON.stringify(back) === JSON.stringify(start),
      observed: `chip "${ch}"; x ${start.a.x},${start.b.x},${start.c.x} -> ${after.a.x},${after.b.x},${after.c.x}; gaps ${g.g1},${g.g2}; undo restored ${JSON.stringify(back) === JSON.stringify(start)}`,
    };
  });
  await step('arrange.distribute.vertical', async () => {
    await selectMany(page, [A, B, C]);
    await menuPath(page, 'arrange', 'arrange.distribute', 'arrange.distribute.vertically');
    const after = await pollUntil(
      async () => ({
        a: await posOf(page, S, A),
        b: await posOf(page, S, B),
        c: await posOf(page, S, C),
      }),
      (p) => p.b.y !== start.b.y || p.a.y !== start.a.y || p.c.y !== start.c.y,
      8000,
    );
    const g = gapsEven(after.a, after.b, after.c, 'y');
    await clearAll(page);
    await undo(page);
    const back = {
      a: await posOf(page, S, A),
      b: await posOf(page, S, B),
      c: await posOf(page, S, C),
    };
    return {
      ok: g.even && JSON.stringify(back) === JSON.stringify(start),
      observed: `y ${start.a.y},${start.b.y},${start.c.y} -> ${after.a.y},${after.b.y},${after.c.y}; gaps ${g.g1},${g.g2}; undo restored ${JSON.stringify(back) === JSON.stringify(start)}`,
    };
  });
  await step('arrange.distribute.needs-three', async () => {
    const ch = await selectMany(page, [A, B]);
    const two = await rowState(page, 'arrange', 'arrange.distribute');
    const ch3 = await selectMany(page, [A, B, C]);
    const three = await rowState(page, 'arrange', 'arrange.distribute');
    return {
      ok: two.present && two.disabled === true && three.disabled === false,
      observed: `two selected (chip "${ch}"): Distribute disabled ${two.disabled}; three selected (chip "${ch3}"): disabled ${three.disabled}`,
    };
  });
  await step('arrange.rotate.quarter-turns', async () => {
    await selectMany(page, [A]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.clockwise');
    const cw = await pollUntil(
      () => posOf(page, S, A),
      (p) => (p.rotate ?? 0) !== 0,
      8000,
    );
    await clearAll(page);
    await undo(page);
    const back1 = await posOf(page, S, A);
    await selectMany(page, [A]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.counterClockwise');
    const ccw = await pollUntil(
      () => posOf(page, S, A),
      (p) => (p.rotate ?? 0) !== 0,
      8000,
    );
    await clearAll(page);
    await undo(page);
    const back2 = await posOf(page, S, A);
    return {
      ok:
        cw.rotate === 90 &&
        !(back1.rotate ?? 0) &&
        [270, -90].includes(ccw.rotate) &&
        !(back2.rotate ?? 0),
      observed: `clockwise -> ${cw.rotate}, undo ${back1.rotate ?? 0}; counter -> ${ccw.rotate}, undo ${back2.rotate ?? 0}`,
    };
  });
  await step('arrange.rotate.flips-menu', async () => {
    await selectMany(page, [A]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.flipHorizontally');
    const h = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.flip !== undefined,
      8000,
    );
    await clearAll(page);
    await undo(page);
    const back1 = await posOf(page, S, A);
    await selectMany(page, [A]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.flipVertically');
    const v = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.flip !== undefined,
      8000,
    );
    await clearAll(page);
    await undo(page);
    const back2 = await posOf(page, S, A);
    return {
      ok: h.flip === 'h' && back1.flip === undefined && v.flip === 'v' && back2.flip === undefined,
      observed: `flip h -> ${h.flip}, undo ${back1.flip}; flip v -> ${v.flip}, undo ${back2.flip}`,
    };
  });
  await step('arrange.group.chords', async () => {
    const ch0 = await selectMany(page, [A, B]);
    await page.keyboard.press('Meta+Alt+g');
    const grouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group !== undefined,
      8000,
    );
    const ch1 = await chip(page);
    await page.keyboard.press('ArrowRight');
    await sleep(200);
    await page.keyboard.press('ArrowRight');
    await sleep(300);
    const moved = await pollUntil(
      async () => ({ a: await posOf(page, S, A), b: await posOf(page, S, B) }),
      (p) => p.a.x === start.a.x + 2 && p.b.x === start.b.x + 2,
      8000,
    );
    await page.keyboard.press('Meta+Alt+Shift+g');
    const ungrouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group === undefined,
      8000,
    );
    await clearAll(page);
    let back = null;
    for (let i = 0; i < 6; i += 1) {
      await undo(page);
      back = { a: await posOf(page, S, A), b: await posOf(page, S, B) };
      if (JSON.stringify(back) === JSON.stringify({ a: start.a, b: start.b })) break;
    }
    const restored = JSON.stringify(back) === JSON.stringify({ a: start.a, b: start.b });
    return {
      ok:
        grouped.group !== undefined &&
        /Group/.test(ch1 ?? '') &&
        moved.a.x === start.a.x + 2 &&
        moved.b.x === start.b.x + 2 &&
        ungrouped.group === undefined &&
        restored,
      observed: `chip "${ch0}" -> Cmd+Option+G chip "${ch1}" group ${grouped.group}; Right twice x ${start.a.x},${start.b.x} -> ${moved.a.x},${moved.b.x}; Cmd+Option+Shift+G group ${ungrouped.group}; undos restored ${restored}`,
    };
  });
  await step('arrange.group.menu-regroup', async () => {
    await selectMany(page, [A, B]);
    const before = await rowState(page, 'arrange', 'arrange.group');
    const regroupBefore = await rowState(page, 'arrange', 'arrange.regroup');
    await selectMany(page, [A, B]);
    await menuPath(page, 'arrange', 'arrange.group');
    const grouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group !== undefined,
      8000,
    );
    const ungroupRow = await rowState(page, 'arrange', 'arrange.ungroup');
    await menuPath(page, 'arrange', 'arrange.ungroup');
    const ungrouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group === undefined,
      8000,
    );
    const regroupAfter = await rowState(page, 'arrange', 'arrange.regroup');
    await menuPath(page, 'arrange', 'arrange.regroup');
    const regrouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group !== undefined,
      8000,
    );
    await clearAll(page);
    const n0 = (await objectsOf(page, S)).length;
    let back = await posOf(page, S, A);
    let undos = 0;
    while (undos < 3 && (back.group !== undefined || undos === 0)) {
      await undo(page);
      undos += 1;
      back = await posOf(page, S, A);
      if (back.group === undefined && undos >= 1) break;
    }
    const n1 = (await objectsOf(page, S)).length;
    return {
      ok:
        before.disabled === false &&
        n0 === n1 &&
        grouped.group !== undefined &&
        ungroupRow.disabled === false &&
        ungrouped.group === undefined &&
        regroupAfter.disabled === false &&
        regrouped.group !== undefined &&
        back.group === undefined,
      observed: `Group enabled ${!before.disabled}, Regroup before ${regroupBefore.disabled ? 'disabled' : 'enabled (an earlier ungroup left its memory)'}; Group -> ${grouped.group}; Ungroup enabled ${!ungroupRow.disabled} -> ${ungrouped.group}; Regroup enabled after ${!regroupAfter.disabled} -> ${regrouped.group}; ${undos} undo(s) -> ${back.group}; objects ${n0} -> ${n1}`,
    };
  });
  await step('arrange.group.context-rows', async () => {
    await selectMany(page, [A, B]);
    const a = center(await boxOf(page, A));
    await rightClickAt(page, a.x, a.y);
    const rows1 = await contextRows(page);
    if (!rows1.includes('arrange.group')) {
      await page.keyboard.press('Escape');
      return { ok: false, observed: `two selected: rows ${rows1.join(',')} (no arrange.group)` };
    }
    await clickContextRow(page, 'arrange.group');
    const grouped = await pollUntil(
      () => posOf(page, S, A),
      (p) => p.group !== undefined,
      8000,
    );
    const ch = await chip(page);
    await rightClickAt(page, a.x, a.y);
    const rows2 = await contextRows(page);
    let ungrouped = null;
    if (rows2.includes('arrange.ungroup')) {
      await clickContextRow(page, 'arrange.ungroup');
      ungrouped = await pollUntil(
        () => posOf(page, S, A),
        (p) => p.group === undefined,
        8000,
      );
    } else await page.keyboard.press('Escape');
    await clearAll(page);
    await undo(page);
    await undo(page);
    return {
      ok:
        grouped.group !== undefined &&
        /Group/.test(ch ?? '') &&
        ungrouped !== null &&
        ungrouped.group === undefined,
      observed: `two selected: Group listed true -> group ${grouped.group}, chip "${ch}"; group right click: Ungroup listed ${rows2.includes('arrange.ungroup')} -> ${ungrouped?.group}`,
    };
  });
  await step('arrange.context.rotate-distribute', async () => {
    const facts = [];
    let ok = true;
    for (const id of [A, N, L]) {
      await selectMany(page, [id]);
      const b = await boxOf(page, id);
      const c = center(b);
      await rightClickAt(page, c.x, c.y);
      const rows = await contextRows(page);
      if (!rows.includes('arrange.rotate')) {
        await page.keyboard.press('Escape');
        facts.push(`${id}: no Rotate row (${rows.slice(0, 6).join(',')})`);
        ok = false;
        continue;
      }
      await hoverContextRow(
        page,
        'arrange.rotate',
        '[data-control="menu.arrange.rotate.clockwise"]',
      );
      await clickContextRow(page, 'arrange.rotate.clockwise');
      const r = await pollUntil(
        () => posOf(page, S, id),
        (p) => (p.rotate ?? 0) !== 0,
        8000,
      );
      await clearAll(page);
      await undo(page);
      const back = await posOf(page, S, id);
      const good = r.rotate === 90 && !(back.rotate ?? 0);
      ok = ok && good;
      facts.push(`${id}: rotate -> ${r.rotate}, undo ${back.rotate ?? 0}`);
    }
    await selectMany(page, [A, B, C]);
    const a = center(await boxOf(page, A));
    await rightClickAt(page, a.x, a.y);
    const rows = await contextRows(page);
    if (rows.includes('arrange.distribute')) {
      await hoverContextRow(
        page,
        'arrange.distribute',
        '[data-control="menu.arrange.distribute.horizontally"]',
      );
      await clickContextRow(page, 'arrange.distribute.horizontally');
      const after = await pollUntil(
        async () => ({
          a: await posOf(page, S, A),
          b: await posOf(page, S, B),
          c: await posOf(page, S, C),
        }),
        (p) => p.b.x !== start.b.x || p.a.x !== start.a.x || p.c.x !== start.c.x,
        8000,
      );
      const g = gapsEven(after.a, after.b, after.c, 'x');
      ok = ok && g.even;
      facts.push(`three selected: Distribute > Horizontally gaps ${g.g1},${g.g2}`);
      await clearAll(page);
      await undo(page);
    } else {
      await page.keyboard.press('Escape');
      ok = false;
      facts.push('three selected: no Distribute row');
    }
    return { ok, observed: facts.join('; ') };
  });
  await step('lines.tail.line-start-end-menu', async () => {
    await selectMany(page, [L]);
    const ch = await chip(page);
    await menuPath(
      page,
      'format',
      'format.bordersLines',
      'format.bordersLines.lineStart',
      'format.bordersLines.lineStart.fillArrow',
    );
    const b1 = await pollUntil(
      async () => (await blockOf(page, S, L))?.block,
      (b) => b?.lineStart === 'fillArrow',
      8000,
    );
    const svg1 = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const svg = el?.tagName === 'svg' ? el : el?.querySelector('svg');
      return {
        start: svg?.getAttribute('data-start'),
        end: svg?.getAttribute('data-end'),
        heads: svg?.querySelectorAll('.line-end, polygon').length ?? 0,
      };
    }, L);
    await clearAll(page);
    await undo(page);
    const back1 = (await blockOf(page, S, L)).block;
    await selectMany(page, [L]);
    await menuPath(
      page,
      'format',
      'format.bordersLines',
      'format.bordersLines.lineEnd',
      'format.bordersLines.lineEnd.none',
    );
    const b2 = await pollUntil(
      async () => (await blockOf(page, S, L))?.block,
      (b) => b?.lineEnd !== undefined,
      6000,
    );
    const svg2 = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const svg = el?.tagName === 'svg' ? el : el?.querySelector('svg');
      return {
        start: svg?.getAttribute('data-start'),
        end: svg?.getAttribute('data-end'),
        heads: svg?.querySelectorAll('.line-end, polygon').length ?? 0,
      };
    }, L);
    await clearAll(page);
    await undo(page);
    const back2 = (await blockOf(page, S, L)).block;
    return {
      ok:
        b1.lineStart === 'fillArrow' &&
        svg1.start === 'fillArrow' &&
        svg1.heads === 1 &&
        back1.lineStart === undefined &&
        b2.lineEnd === 'none' &&
        svg2.end === 'none' &&
        back2.lineEnd === undefined,
      observed: `chip "${ch}"; Line start > Arrow: block ${b1.lineStart}, svg ${JSON.stringify(svg1)}, undo ${back1.lineStart}; Line end > None: block ${b2.lineEnd}, svg ${JSON.stringify(svg2)}, undo ${back2.lineEnd}`,
    };
  });
  await step('arrange.reload-show-pdf', async () => {
    await selectMany(page, [A]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.clockwise');
    await pollUntil(
      () => posOf(page, S, A),
      (p) => p.rotate === 90,
      8000,
    );
    await selectMany(page, [B]);
    await menuPath(page, 'arrange', 'arrange.rotate', 'arrange.rotate.flipHorizontally');
    await pollUntil(
      () => posOf(page, S, B),
      (p) => p.flip === 'h',
      8000,
    );
    await selectMany(page, [B, C]);
    await menuPath(page, 'arrange', 'arrange.group');
    await pollUntil(
      () => posOf(page, S, C),
      (p) => p.group !== undefined,
      8000,
    );
    await settled(page);
    await page.goto(`${BASE}/edit/${deckId}#s/${S}`, { waitUntil: 'domcontentloaded' });
    await editorReady(page);
    await settled(page);
    const a = await posOf(page, S, A),
      b = await posOf(page, S, B),
      c = await posOf(page, S, C);
    const kept =
      a?.rotate === 90 && b?.flip === 'h' && b?.group !== undefined && b?.group === c?.group;
    await gotoSlide(page, S);
    await clearAll(page);
    const open = await ctl(page, 'present.open').boundingBox();
    await clickAt(page, open.x + open.width / 2, open.y + open.height / 2);
    await page.locator('[data-control="present.show"]').waitFor({ timeout: 10_000 });
    await sleep(800);
    const shown = await page.evaluate((id) => {
      const el = [...document.querySelectorAll(`[data-block="${id}"]`)].find(
        (e) =>
          e.getClientRects().length > 0 &&
          !e.closest('.ts-stagewrap.ts-editor') &&
          !e.closest('.ts-filmstrip, .ts-sidebar'),
      );
      const free = el?.closest('.free') ?? el;
      const cs = free ? getComputedStyle(free) : null;
      return {
        found: Boolean(el),
        transform: cs?.transform ?? null,
        rotateVar:
          free?.style.getPropertyValue('--rotate') || free?.getAttribute('data-rotate') || null,
      };
    }, A);
    await page.keyboard.press('Escape');
    await sleep(500);
    const closed = (await page.locator('[data-control="present.show"]').count()) === 0;
    await menuPath(page, 'file', 'file.download', 'file.download.pdf');
    await ctl(page, 'dialog.download.pdf').waitFor({ timeout: 8000 });
    const t0 = Date.now();
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 40_000 }),
      ctl(page, 'dialog.download.ok').click(),
    ]);
    const path = await dl.path();
    const bytes = (await import('node:fs')).readFileSync(path);
    const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const slides = (await slideOrder(page)).length;
    await page.keyboard.press('Escape');
    return {
      ok:
        kept &&
        shown.found &&
        closed &&
        bytes.subarray(0, 5).toString('latin1') === '%PDF-' &&
        pages === slides,
      observed: `after reload: A rotate ${a?.rotate}, B flip ${b?.flip}, group B ${b?.group} C ${c?.group}; show: A drawn ${shown.found}, transform ${shown.transform}; Escape closed ${closed}; PDF ${bytes.length} B in ${Date.now() - t0} ms, ${pages} pages for ${slides} slides`,
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

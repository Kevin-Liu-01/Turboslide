// b3: the guide drag mechanism, narrowed. (a) the move through the window API alone; (b) a fast
// drag of the vertical guide pressed away from the horizontal guide's crossing; (c) a press at the
// crossing with a capture listener naming the pointerdown target and the readout's axis; (d) the
// same with no horizontal guide. Usage: node guide-probe.mjs --base http://localhost:4403
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:4403');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
const sheetPoint = async (page, sx, sy) => {
  const r = await rectOf(page, SHEET);
  const k = r.w / 1600;
  return { x: r.x + sx * k, y: r.y + sy * k };
};
const guidesShown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-deck-guide[data-control]')].map((el) =>
      el.getAttribute('data-control'),
    ),
  );
const readoutFacts = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.ts-guide-readout');
    return el ? { text: el.textContent, left: el.style.left, top: el.style.top } : null;
  });
const slideOrder = async (page) => {
  const list = await invoke(page, 'slide.list', {});
  const arr = list.slides ?? list.items ?? list;
  return (Array.isArray(arr) ? arr : []).map((s) => s.id ?? s);
};
const setGuides = async (page, set) => {
  const s = await state(page);
  await invoke(page, 'deck.guides', { baseRevision: s.revision, set });
  await settled(page);
  return guidesShown(page);
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
const menuToggle = async (page, path) => {
  const bar = await page.locator(`[data-control="menubar.${path[0]}"]`).boundingBox();
  await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.locator(`#ts-menu-${path[0]}`).waitFor({ timeout: 6000 });
  for (let i = 1; i < path.length - 1; i += 1) {
    const r = await page.locator(`[data-control="menu.${path[i]}"]`).first().boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page
      .locator(`[data-control="menu.${path[i + 1]}"]`)
      .first()
      .waitFor({ timeout: 6000 });
  }
  const last = await page
    .locator(`[data-control="menu.${path[path.length - 1]}"]`)
    .first()
    .boundingBox();
  await page.mouse.click(last.x + last.width / 2, last.y + last.height / 2);
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(150);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
let deckId = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  const title = await rectOf(page, `${SHEET} [data-run]`);
  await page.mouse.dblclick(title.x + title.w / 2, title.y + title.h / 2);
  await sleep(300);
  await page.keyboard.type('b3 guide probe', { delay: 30 });
  await page.keyboard.press('Escape');
  await settled(page);
  deckId = (await invoke(page, 'deck.info')).id;
  const titleSlide = (await slideOrder(page))[0];
  const S = await setupSlide(page, titleSlide);
  const card = await page.locator(`[data-control="filmstrip.slide.${S}"]`).boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await sleep(500);
  await menuToggle(page, ['view', 'view.guides', 'view.guides.show']);
  log('showGuides', (await state(page)).settings?.showGuides);

  // a capture listener in the page names every pointerdown target and the guide handlers' calls
  await page.evaluate(() => {
    window.__b3 = [];
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target;
        window.__b3.push(
          `down on ${t?.getAttribute?.('data-control') ?? t?.className ?? t?.tagName}`,
        );
      },
      true,
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        const t = e.target;
        window.__b3.push(
          `up on ${t?.getAttribute?.('data-control') ?? t?.className ?? t?.tagName}`,
        );
      },
      true,
    );
  });
  const events = () =>
    page.evaluate(() => {
      const v = window.__b3.slice();
      window.__b3 = [];
      return v;
    });

  // (a) the write alone
  log('shown', await setGuides(page, { x: [400, 800], y: [450] }));
  let s = await state(page);
  const r1 = await invoke(page, 'deck.guides', {
    baseRevision: s.revision,
    move: [{ axis: 'x', from: 800, to: 600 }],
  }).catch((e) => `error ${String(e).slice(0, 200)}`);
  await settled(page);
  log('(a) API move 800->600:', JSON.stringify(r1).slice(0, 160), 'shown', await guidesShown(page));
  log('shown reset', await setGuides(page, { x: [400, 800], y: [450] }));

  const fastDrag = async (label, fromAt, pressY, toAt) => {
    const k = (await rectOf(page, SHEET)).w / 1600;
    const el = await rectOf(page, `.ts-deck-guide[data-control="guide.x.${fromAt}"]`);
    const from = { x: el.x + el.w / 2, y: (await sheetPoint(page, 0, pressY)).y };
    const to = { x: (await sheetPoint(page, toAt, 0)).x, y: from.y };
    const under = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-control') ?? null,
      [from.x, from.y],
    );
    await page.mouse.move(from.x, from.y);
    await sleep(40);
    await page.mouse.down();
    for (let i = 1; i <= 14; i += 1)
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y);
    const during = await readoutFacts(page);
    const stillShown = await guidesShown(page);
    await page.mouse.up();
    await sleep(250);
    await settled(page);
    const shown = await pollUntil(
      () => guidesShown(page),
      (g) => g.includes(`guide.x.${toAt}`),
      3000,
    );
    const info = await invoke(page, 'deck.info');
    log(
      `(${label}) press at sheet y ${pressY} under ${under}; k ${k.toFixed(3)}; readout during ${JSON.stringify(during)}; guides during ${stillShown.join(',')}; after ${shown.join(',')}; deck.info ${JSON.stringify(info.guides ?? null)}`,
    );
    log('    events:', (await events()).join(' | '));
    return shown.includes(`guide.x.${toAt}`);
  };
  // (b) pressed at sheet y 200, away from the y guide at 450
  await fastDrag('b away from crossing', 800, 200, 600);
  log('shown reset', await setGuides(page, { x: [400, 800], y: [450] }));
  // (c) pressed at the crossing
  await fastDrag('c at crossing', 800, 450, 600);
  // (d) no horizontal guide, pressed at the centre
  log('shown reset', await setGuides(page, { x: [400, 800], y: [] }));
  await fastDrag('d no y guide, centre', 800, 450, 600);
  log('shown reset', await setGuides(page, { x: [800], y: [] }));
  await fastDrag('e one guide, centre', 800, 450, 600);
} finally {
  if (deckId) {
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
  }
  await browser.close();
}

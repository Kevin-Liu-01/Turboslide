// R3 fix round 3: does the tab's document and the server's agree after the walk's text box
// narrowing and grow back (gestures.resize.text-reflows)? Walk A's restore and Cmd+Z brought back
// a g-text 280 wide where the tab had drawn it 475 wide before the restore (build/r3.md "Realtime
// round, fix round 3"). One deck, one blank slide, the twelve word box, the e handle dragged by
// -200 then +200 in 12 steps each, then the box read in this tab and in a second browser.
//   node resize-sync.mjs --base http://localhost:4473 [--rounds 3]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const arg = (n, f) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : f;
};
const BASE = arg('base', 'http://localhost:4473');
const ROUNDS = Number(arg('rounds', '3'));
/* the tmp store's folder of the server under test: the store's own document, as the restore reads it */
const OVERLAY = arg(
  'overlay',
  '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r3fix3/overlay',
);
const storeWidth = (deck, slideId) => {
  try {
    const slide = JSON.parse(
      readFileSync(`${OVERLAY}/decks/${deck}/slides/${slideId}.json`, 'utf8'),
    );
    const text = JSON.stringify(slide);
    const m = /"id":"g-text","pos":\{[^}]*"w":(\d+(?:\.\d+)?)/.exec(text);
    return m ? Number(m[1]) : `no g-text (${text.length} bytes)`;
  } catch (error) {
    return `unread: ${String(error).slice(0, 80)}`;
  }
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const invokeOn = (p, a, i) =>
  p.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
const invoke = (a, i) => invokeOn(page, a, i);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const pollUntil = async (read, test, timeout = 15_000, every = 150) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const settled = () => pollUntil(state, (s) => (s.sync?.pending ?? s.pending ?? 0) === 0, 30_000);
const posOn = async (p, slideId) => {
  const got = await invokeOn(p, 'slide.get', { slideId });
  const slide = got.slide ?? got;
  const find = (node) => {
    if (Array.isArray(node)) {
      for (const n of node) {
        const f = find(n);
        if (f) return f;
      }
    } else if (node && typeof node === 'object') {
      if (node.id === 'g-text') return node;
      for (const v of Object.values(node)) {
        const f = find(v);
        if (f) return f;
      }
    }
    return null;
  };
  return find(slide)?.pos ?? null;
};
const drag = async (dx) => {
  const block = page.locator('.ts-stagewrap.ts-editor [data-block="g-text"]').first();
  const b = await block.boundingBox();
  await page.keyboard.press('Escape');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(300);
  const h = await page.locator('[data-control="handle.g-text.resize.e"]').first().boundingBox();
  if (!h) throw new Error('no e handle');
  const k = await page.evaluate(() => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    return sheet ? sheet.getBoundingClientRect().width / 1600 : 0;
  });
  const sx = h.x + h.width / 2;
  const sy = h.y + h.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(sx + (dx * k * i) / 12, sy);
    await sleep(30);
  }
  await page.mouse.up();
  await sleep(400);
  await settled();
};
let deckId = null;
try {
  await page.goto('/new');
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 120_000 });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 90_000 });
  const run = await page.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]')
      ?.getAttribute('data-run'),
  );
  await page.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Resize sync probe', { delay: 40 });
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 60_000 });
  deckId = (await invoke('deck.info')).id;
  let st = await settled();
  const first = (await invoke('deck.info')).sections[0].slides[0].id;
  const made = await invoke('slide.new', {
    layout: 'blank',
    after: first,
    baseRevision: st.revision,
  });
  const slideId = made.slide?.id ?? made.slideId ?? made.id;
  st = await settled();
  await invoke('block.insert', {
    baseRevision: st.revision,
    slideId,
    slot: 'main',
    block: {
      id: 'g-text',
      type: 'text',
      text: 'Twelve short words sit on one line until the box is narrowed enough',
      pos: { x: 80, y: 400, w: 480, h: 64 },
    },
  });
  await settled();
  await page.locator(`[data-control="filmstrip.slide.${slideId}"]`).first().click();
  await sleep(800);
  console.log('deck', deckId, 'slide', slideId);
  for (let r = 1; r <= ROUNDS; r += 1) {
    await drag(-200);
    const narrowed = await posOn(page, slideId);
    await drag(200);
    const grown = await posOn(page, slideId);
    /* the checkpoint (2 s idle) and its frame */
    await sleep(4000);
    const other = await browser.newContext({
      baseURL: BASE,
      viewport: { width: 1280, height: 800 },
    });
    const p2 = await other.newPage();
    await p2.goto(`/edit/${deckId}`);
    await p2.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 120_000 });
    await p2.locator('.pt-viewer[data-settled]').first().waitFor({ timeout: 90_000 });
    const second = await posOn(p2, slideId);
    await other.close();
    const tab = await posOn(page, slideId);
    console.log(
      JSON.stringify({
        round: r,
        narrowed: narrowed?.w,
        grown: grown?.w,
        tabAfter: tab?.w,
        secondBrowser: second?.w,
        store: storeWidth(deckId, slideId),
        agree: tab?.w === second?.w,
        revision: (await state()).revision,
      }),
    );
  }
} catch (error) {
  console.log('error', String(error?.stack ?? error).slice(0, 1500));
} finally {
  if (deckId) {
    const removeById = async (action, extra) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const info = await invoke('deck.info');
        try {
          return await invoke(action, { id: deckId, ...extra, baseRevision: info.revision });
        } catch (error) {
          if (!/stale/.test(String(error)) || attempt === 5) throw error;
          await sleep(1000);
        }
      }
      return null;
    };
    try {
      await removeById('deck.trash', {});
      await removeById('deck.remove', { confirm: true });
      console.log(
        'teardown',
        (await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' })).status,
      );
    } catch (error) {
      console.log('teardownError', deckId, String(error).slice(0, 200));
    }
  }
  await browser.close();
}

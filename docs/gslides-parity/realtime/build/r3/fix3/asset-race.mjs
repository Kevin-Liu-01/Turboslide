// R3 fix round 3, evidence for R1: on the memory tier an edit the room admitted and has not yet
// checkpointed is lost from the store when a server side store write (asset.add) lands before the
// checkpoint. Walk B's store records read 538 (g-text narrowed, ops 1106 to 1106), 539 (asset.set,
// no ops), 540 (ops from 1109): the grow back of seq 1107 never reached a record, while the tab
// kept it. This probe makes the same order on a fresh deck: a block.set through the window API not
// awaited, an asset.add at once, then the tab's document against the store's slide files.
//   node asset-race.mjs --base http://localhost:4473 [--rounds 3] [--overlay <tmp store folder>]
import { existsSync, readFileSync } from 'node:fs';
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
const OVERLAY = arg(
  'overlay',
  '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r3fix3/overlay',
);
const sleep = (t) => new Promise((r) => setTimeout(r, t));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const invoke = (a, i) =>
  page.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y ?? {}), [a, i]);
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
const widthIn = (slide) => {
  const m = /"id":"race-text","pos":\{[^}]*"w":(\d+(?:\.\d+)?)/.exec(JSON.stringify(slide));
  return m ? Number(m[1]) : null;
};
const storeWidth = (deckId, slideId) => {
  const file = `${OVERLAY}/decks/${deckId}/slides/${slideId}.json`;
  if (!existsSync(file)) return 'no file';
  return widthIn(JSON.parse(readFileSync(file, 'utf8')));
};
const png = () =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 60%, 50%)`;
    g.fillRect(0, 0, 96, 64);
    return canvas.toDataURL('image/png');
  });
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
  await page.keyboard.type('Asset race probe', { delay: 40 });
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
    block: { id: 'race-text', type: 'text', text: 'Race', pos: { x: 80, y: 400, w: 480, h: 64 } },
  });
  await settled();
  await sleep(3000);
  console.log('deck', deckId, 'slide', slideId);
  for (let r = 1; r <= ROUNDS; r += 1) {
    const w = 300 + r * 20;
    const url = await png();
    st = await state();
    /* the edit through the room, its answer not awaited (it waits for the checkpoint), then the
       server side write at once, on the revision the page reports */
    const asset = await page.evaluate(
      ([s, rev, width, dataUrl, round]) => {
        const api = window.turboslide.studio;
        void api
          .invoke('block.set', {
            slideId: s,
            blockId: 'race-text',
            path: '/pos',
            value: { x: 80, y: 400, w: width, h: 64, z: 1 },
            baseRevision: rev,
          })
          .catch(() => undefined);
        return api
          .invoke('asset.add', {
            id: `race-asset-${round}`,
            url: dataUrl,
            role: 'capture',
            alt: 'race',
            baseRevision: rev,
          })
          .then(
            (a) => ({ ok: true, revision: a.revision ?? null }),
            (e) => ({ ok: false, error: String(e).slice(0, 200) }),
          );
      },
      [slideId, st.revision, w, url, r],
    );
    await settled();
    await sleep(5000);
    const got = await invoke('slide.get', { slideId });
    const tab = widthIn(got.slide ?? got);
    const store = storeWidth(deckId, slideId);
    console.log(
      JSON.stringify({
        round: r,
        wrote: w,
        asset,
        tab,
        store,
        agree: tab === store,
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

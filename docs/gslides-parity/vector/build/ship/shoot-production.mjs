// The ship step's pictures of the vector round on a deployment (docs/VECTOR.md 6.2: the new
// surfaces on production at 1440 in both appearances): the Insert menu with its icons, Insert >
// Shape with its seven rows, the four glyph grids (Shapes, Arrows, Callouts, Equation) open from
// the menu bar, an svg pasted as markup (Figma's form, with its prolog) then selected at 400
// percent, and Format > Image with the picture selected (Crop image disabled with its sentence).
// Adapted from the integrator's pictures script of this round (build/integrator/, PNG at 2x on
// the previews): one size, JPEG files named for the production table, the Vercel Authentication
// header from VERCEL_OIDC_TOKEN when the base is a preview. One scratch deck per appearance is
// made from /new by typing the title and trashed and deleted forever through the product before
// the appearance's context closes, the 404 read back, so nothing of this run stays on the shared
// Blob store. Nothing here prints a token.
//
//   node docs/gslides-parity/vector/build/ship/shoot-production.mjs --base <origin> [--out <dir>]
//     [--prefix production-vector] [--only light|dark]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const require = createRequire(resolve(ROOT, 'packages/headless/package.json'));
const { chromium } = require('playwright-core');
const CHROME =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const BASE = (flag('--base') ?? 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = resolve(flag('--out') ?? resolve(ROOT, 'docs/gslides-parity/focus/verification'));
const PREFIX = flag('--prefix') ?? 'production-vector';
const ONLY = flag('--only');
mkdirSync(OUT, { recursive: true });
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const MARK_SVG = readFileSync(resolve(ROOT, 'apps/studio/e2e/fixtures/mark.svg'), 'utf8');
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const record = {
  base: BASE,
  startedAt: new Date().toISOString(),
  decks: {},
  shots: [],
  readings: [],
};
const note = (line) => {
  record.readings.push(line);
  log(line);
};

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: true,
});

const shot = async (page, name, opts = {}) => {
  const file = `${PREFIX}-${name}.jpg`;
  await page.screenshot({ path: resolve(OUT, file), type: 'jpeg', quality: 88, ...opts });
  record.shots.push(file);
  log(`wrote ${file}`);
};
const ctl = (page, id) => page.locator(`[data-control="${id}"]`);
const at = async (locator) => {
  const r = await locator.first().boundingBox();
  if (!r) throw new Error(`nothing at ${locator}`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
let last = { x: 0, y: 0 };
const moveTo = async (page, p, steps = 6) => {
  await page.mouse.move(p.x, p.y, { steps });
  last = p;
};
const click = async (page, locator) => {
  const p = await at(locator);
  await moveTo(page, { x: p.x, y: last.y }, 4);
  await moveTo(page, p);
  await page.mouse.click(p.x, p.y);
  last = p;
  await sleep(250);
};
const hover = async (page, locator) => {
  const p = await at(locator);
  await moveTo(page, { x: p.x, y: last.y }, 4);
  await moveTo(page, p);
  await sleep(400);
};
const openMenu = async (page, id) => {
  await click(page, ctl(page, `menubar.${id}`));
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(250);
  const first = await page.locator(`#ts-menu-${id} [data-control^="menu."]`).first().boundingBox();
  if (first) await moveTo(page, { x: last.x, y: first.y + first.height / 2 }, 4);
};
const escape = async (page, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press('Escape');
    await sleep(120);
  }
};
const invoke = (page, action, input) =>
  page.evaluate(([id, value]) => window.turboslide.studio.invoke(id, value), [action, input]);
const stateOf = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await stateOf(page);
    const words = await page
      .locator('[data-control="deck.saveState"]')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await sleep(150);
  }
  return stateOf(page);
};
const waitEditor = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
  await sleep(500);
};
const iconsOf = (page, menuSelector) =>
  page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(`${sel} [data-menu-item]`)];
    return rows.map((row) => {
      const svg = row.querySelector('.ts-menu-ic svg');
      return `${row.getAttribute('data-menu-item')}:${svg ? 'icon' : 'none'}`;
    });
  }, menuSelector);
const statusOf = async (context, path) => {
  const r = await context.request.get(`${BASE}${path}`, { maxRedirects: 0 }).catch(() => null);
  return r ? r.status() : 0;
};

/** A surface that fails records its sentence and lets the next surface run. */
const attempt = async (page, name, run) => {
  try {
    await run();
  } catch (error) {
    note(
      `${name}: FAILED ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
    process.exitCode = 1;
    await escape(page, 3).catch(() => undefined);
  }
};

const teardown = async (page, context, deckId) => {
  if (!deckId) return;
  let gone = false;
  try {
    await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    await waitEditor(page);
    await page.keyboard.press('Escape');
    await ctl(page, 'menubar.file').click();
    await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
    await ctl(page, 'menu.file.moveToTrash').click();
    await page.waitForURL(/\/decks/, { timeout: 20_000 });
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
      timeout: 30_000,
    });
    const card = ctl(page, `trash.card.${deckId}`);
    await card.waitFor({ timeout: 30_000 });
    await ctl(page, `trash.delete.${deckId}`).click();
    await ctl(page, 'trash.confirm.ok').click();
    await card.waitFor({ state: 'detached', timeout: 30_000 });
    for (let i = 0; i < 10 && !gone; i += 1) {
      if ((await statusOf(context, `/edit/${deckId}`)) === 404) gone = true;
      else await sleep(1000);
    }
  } catch (error) {
    log(
      `teardown through the product: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
  if (!gone) {
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await waitEditor(page);
      const info = await invoke(page, 'deck.info');
      await invoke(page, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
        () => undefined,
      );
      const again = await invoke(page, 'deck.info').catch(() => info);
      await invoke(page, 'deck.remove', {
        id: deckId,
        baseRevision: again.revision,
        confirm: true,
      });
    } catch (error) {
      log(
        `teardown through the action: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
    for (let i = 0; i < 20 && !gone; i += 1) {
      if ((await statusOf(context, `/edit/${deckId}`)) === 404) gone = true;
      else await sleep(2000);
    }
  }
  note(`teardown ${deckId}: /edit answers ${gone ? '404' : 'NOT 404'}`);
  record.decks[deckId] = gone ? 'deleted; /edit answers 404' : 'NOT deleted';
  if (!gone) process.exitCode = 1;
};

try {
  for (const theme of ['light', 'dark']) {
    if (ONLY !== null && ONLY !== theme) continue;
    last = { x: 0, y: 0 };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme,
      extraHTTPHeaders,
    });
    await context.addInitScript(
      ([settings, t]) => {
        localStorage.setItem('ts-editor-settings', JSON.stringify(settings));
        localStorage.setItem('gt-theme', t);
        localStorage.setItem('ts-chrome-appearance', t);
      },
      [{ advancedTools: false, appearance: theme }, theme],
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    let deckId = null;
    try {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await waitEditor(page);
      const isDark = await page.evaluate(
        () =>
          document.documentElement.getAttribute('data-theme') === 'dark' ||
          document.documentElement.classList.contains('dark'),
      );
      if (isDark !== (theme === 'dark')) {
        await openMenu(page, 'view');
        await hover(page, ctl(page, 'menu.view.appearance'));
        await click(page, ctl(page, `menu.view.appearance.${theme}`)).catch(() => undefined);
        await escape(page, 2);
        await sleep(300);
      }
      const runs = await page.evaluate(
        (sheet) =>
          [...document.querySelectorAll(`${sheet} [data-run]`)].map(
            (el) => el.getAttribute('data-run') ?? '',
          ),
        SHEET,
      );
      const run = runs.find((r) => /heading/.test(r)) ?? runs[0];
      const el = page.locator(`${SHEET} [data-run="${run}"]`).first();
      await el.dblclick();
      await sleep(200);
      await page.keyboard.press('Meta+a');
      await page.keyboard.type('Vector round production pictures', { delay: 60 });
      await sleep(250);
      await page.keyboard.press('Escape');
      await page.waitForURL(/\/edit\//, { timeout: 30_000 });
      await settled(page);
      deckId = (await invoke(page, 'deck.info')).id;
      record.decks[deckId] = 'made';
      note(
        `${theme}: deck ${deckId} made from /new; data-theme ${await page.evaluate(() => document.documentElement.getAttribute('data-theme'))}`,
      );
      if (
        await ctl(page, 'dialog.namePrompt')
          .isVisible()
          .catch(() => false)
      ) {
        if ((await ctl(page, 'dialog.namePrompt.close').count()) > 0)
          await ctl(page, 'dialog.namePrompt.close')
            .click()
            .catch(() => undefined);
        else
          await ctl(page, 'dialog.namePrompt.skip')
            .click()
            .catch(() => undefined);
        await sleep(300);
      }
      await page.keyboard.press('Escape');
      await sleep(200);

      /* 1. the Insert menu with its icons */
      await attempt(page, `${theme} insert menu`, async () => {
        await openMenu(page, 'insert');
        await sleep(300);
        await shot(page, `insert-menu-1440-${theme}`);
        const icons = await iconsOf(page, '#ts-menu-insert');
        note(`${theme}: Insert rows ${icons.join(' ')}`);
        /* 2. Insert > Shape, the seven rows */
        await hover(page, ctl(page, 'menu.insert.shape'));
        await page
          .locator('[data-control^="menu.insert.shape."]')
          .first()
          .waitFor({ timeout: 6000 });
        await sleep(300);
        await shot(page, `insert-shape-1440-${theme}`);
        const shapeRows = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="menu.insert.shape."]')].map((e) =>
            e.getAttribute('data-control').replace(/^menu\./, ''),
          ),
        );
        note(`${theme}: Insert > Shape rows ${shapeRows.join(', ')}`);
        /* 3. the four plates */
        for (const row of ['gallery', 'arrows', 'callouts', 'equation']) {
          await hover(page, ctl(page, `menu.insert.shape.${row}`));
          await page
            .locator(`[data-control="insert.shape.${row}.grid"]`)
            .waitFor({ timeout: 6000 });
          await sleep(350);
          await shot(page, `grid-${row === 'gallery' ? 'shapes' : row}-1440-${theme}`);
          const tiles = await page.locator(`[data-control^="insert.shape.${row}.pick."]`).count();
          const ds = await page.evaluate(
            (r) =>
              [
                ...document.querySelectorAll(`[data-control^="insert.shape.${r}.pick."] svg path`),
              ].map((p) => p.getAttribute('d')),
            row,
          );
          note(`${theme}: ${row} plate ${tiles} tiles, ${new Set(ds).size} distinct glyphs`);
        }
        await escape(page, 3);
      });

      /* 4. an svg pasted as markup (the prolog form), selected, then at 400 percent */
      await attempt(page, `${theme} svg paste`, async () => {
        await escape(page, 2);
        const before = await page.locator(`${SHEET} img[src$=".svg"]`).count();
        await page.evaluate((markup) => {
          const dt = new DataTransfer();
          dt.setData('text/plain', markup);
          const target = document.querySelector('.ts-stagewrap.ts-editor');
          target.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
          );
        }, MARK_SVG);
        const t0 = Date.now();
        await page.waitForFunction(
          ([sheet, n]) => document.querySelectorAll(`${sheet} img[src$=".svg"]`).length > n,
          [SHEET, before],
          { timeout: 20_000 },
        );
        const landed = Date.now() - t0;
        await settled(page);
        const img = page.locator(`${SHEET} img[src$=".svg"]`).last();
        const src = await img.getAttribute('src');
        const fit = await img.evaluate((e) => getComputedStyle(e).objectFit);
        note(`${theme}: svg pasted in ${landed} ms, src ${src}, object-fit ${fit}`);
        await page.keyboard.press('Escape');
        await sleep(200);
        const box = await img.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(600);
        const cropDisabled = await ctl(page, 'toolbar.cropImage')
          .first()
          .getAttribute('aria-disabled')
          .catch(() => null);
        note(`${theme}: picture selected; toolbar Crop aria-disabled ${cropDisabled}`);
        await shot(page, `svg-selected-1440-${theme}`);
        /* Format > Image with the picture selected: the icons and the disabled Crop row */
        await openMenu(page, 'format');
        await hover(page, ctl(page, 'menu.format.image'));
        await page
          .locator('[data-control="menu.format.image.cropImage"]')
          .waitFor({ timeout: 6000 });
        await sleep(300);
        await hover(page, ctl(page, 'menu.format.image.cropImage'));
        await sleep(700);
        await shot(page, `format-image-svg-1440-${theme}`);
        const cropRow = await page.evaluate(() => {
          const row = document.querySelector('[data-control="menu.format.image.cropImage"]');
          return row ? `${row.getAttribute('aria-disabled')}` : 'no row';
        });
        const tip = await page
          .locator('.ts-tooltip, [role="tooltip"]')
          .first()
          .textContent()
          .catch(() => null);
        note(
          `${theme}: Format > Image > Crop image aria-disabled ${cropRow}; tooltip ${JSON.stringify(tip)}`,
        );
        note(`${theme}: Format rows ${(await iconsOf(page, '#ts-menu-format')).join(' ')}`);
        await escape(page, 3);
        /* the zoom to 400 percent, the picture kept selected */
        await invoke(page, 'view.zoom', { zoom: 4 });
        await sleep(900);
        const zoomed = page.locator(`${SHEET} img[src$=".svg"]`).last();
        await zoomed.scrollIntoViewIfNeeded().catch(() => undefined);
        const zbox = await zoomed.boundingBox();
        if (zbox) {
          await page.mouse.click(
            Math.min(1430, Math.max(10, zbox.x + zbox.width / 2)),
            Math.min(890, Math.max(10, zbox.y + zbox.height / 2)),
          );
          await sleep(500);
        }
        const current = await zoomed.evaluate((e) => ({
          src: e.currentSrc,
          w: e.getBoundingClientRect().width,
          natural: e.naturalWidth,
        }));
        const pngs = await page.evaluate(
          () =>
            performance.getEntriesByType('resource').filter((r) => /\/assets\/.*\.png/.test(r.name))
              .length,
        );
        note(
          `${theme}: at 400 percent the picture draws ${current.src.split('/').pop()} at ${Math.round(current.w)} css px (natural ${current.natural}); PNG asset requests ${pngs}`,
        );
        await shot(page, `svg-selected-400-1440-${theme}`);
        await invoke(page, 'view.zoom', { zoom: 1 }).catch(() => undefined);
        await sleep(400);
      });
    } catch (error) {
      note(
        `${theme}: FAILED ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
      await shot(page, `failure-1440-${theme}`).catch(() => undefined);
      process.exitCode = 1;
    } finally {
      await teardown(page, context, deckId);
      await context.close();
    }
  }
} finally {
  await browser.close();
  record.endedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, `${PREFIX}-views.json`), `${JSON.stringify(record, null, 2)}\n`);
  log(`record written to ${resolve(OUT, `${PREFIX}-views.json`)}`);
}

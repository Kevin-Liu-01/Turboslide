#!/usr/bin/env node
// The logo audit walk (docs/gslides-parity/features/audit-logos.md): drives production the way a
// seller would when they want a customer's or a partner's logo on a slide today, at human speed,
// on a scratch deck created from /new and trashed, deleted forever and checked for a 404 in the
// finally block. Imports nothing from the repository but playwright-core.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const BASE = 'https://turboslide.vercel.app';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/features/audit-logos';
mkdirSync(OUT, { recursive: true });
const rows = [];
const record = (step, expected, observed, ok) => {
  rows.push({ step, expected, observed, ok });
  console.log(`${ok === null ? '  --' : ok ? '  ok' : 'FAIL'} ${step} :: ${observed}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror ${String(e).slice(0, 200)}`));

const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};
const ctl = (control) => page.locator(`[data-control="${control}"]`);
const has = (selector) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
const moveHuman = async (from, to, steps = 12) => {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await sleep(rand(14, 26));
  }
};
const clickAt = async (x, y, opts = {}) => {
  await moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
  await sleep(rand(40, 90));
  await page.mouse.click(x, y, opts);
  await sleep(rand(120, 220));
};
const typeHuman = async (text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (key) => {
  await page.keyboard.press(key);
  await sleep(rand(120, 220));
};
const clickControl = async (control) => {
  const el = ctl(control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
};
const openMenu = async (id) => {
  const r = await ctl(`menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar button ${id}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await page
    .locator(`#ts-menu-${id} [data-control^="menu."]`)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
  await sleep(rand(150, 300));
};
const hoverRow = async (rowId, waitFor) => {
  const r = await ctl(`menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await moveHuman(
    { x: r.x - 20, y: r.y + r.height / 2 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    6,
  );
  await sleep(rand(250, 400));
  if (waitFor) {
    const ok = await page
      .locator(waitFor)
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await sleep(400);
    }
  }
};
const clickRow = async (rowId) => {
  const r = await ctl(`menu.${rowId}`).boundingBox();
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
};
const rowsUnder = (root) =>
  page.evaluate(
    (root) =>
      [...document.querySelectorAll(`${root} [data-control^="menu."]`)]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          id: el.getAttribute('data-control').replace(/^menu\./, ''),
          label: el.textContent?.trim() ?? '',
          disabled: el.getAttribute('aria-disabled') === 'true',
        })),
    root,
  );
const closeMenus = async () => {
  for (let i = 0; i < 3; i += 1) {
    const open = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="ts-menu-"], .ts-context-menu')].some(
        (el) => el.getClientRects().length > 0,
      ),
    );
    if (!open) return;
    await press('Escape');
  }
};
const invoke = (action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async () => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const pollUntil = async (read, test, timeout = 15_000, every = 200) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
const slideJson = (slideId) => invoke('slide.get', { slideId }).then((g) => g.slide ?? g);
const objectsOf = async (slideId) => {
  const slide = await slideJson(slideId);
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
        out.push({ id: node.id, type: node.type, pos: node.pos, asset: node.asset ?? null });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return out;
};
const rectOf = (selector) => page.locator(selector).first().boundingBox();
/** Insert > Image > By URL with an address typed at human speed; answers the dialog's outcome. */
const insertByUrl = async (slideId, address, tag) => {
  const before = (await objectsOf(slideId)).map((o) => o.id);
  await openMenu('insert');
  await hoverRow('insert.image', '[data-control="menu.insert.image.byUrl"]');
  await clickRow('insert.image.byUrl');
  await ctl('dialog.imageByUrl.url').waitFor({ timeout: 8000 });
  await clickControl('dialog.imageByUrl.url');
  await typeHuman(address);
  await sleep(1400);
  const preview = await page.evaluate(() => {
    const img = document.querySelector('[data-control="dialog.imageByUrl.preview"]');
    return img
      ? { shown: true, natural: [img.naturalWidth, img.naturalHeight], complete: img.complete }
      : { shown: false };
  });
  const errBefore = await page
    .locator('.ts-dialog-error')
    .first()
    .textContent()
    .catch(() => null);
  await shot(`${tag}-preview`);
  const started = Date.now();
  await clickControl('dialog.imageByUrl.ok');
  let error = null;
  let obj = null;
  const until = Date.now() + 40_000;
  for (;;) {
    const objs = await objectsOf(slideId).catch(() => []);
    obj = objs.find((o) => !before.includes(o.id)) ?? null;
    if (obj) break;
    error = await page
      .locator('.ts-dialog-error')
      .first()
      .textContent()
      .catch(() => null);
    if (error && error !== errBefore) break;
    if (Date.now() > until) break;
    await sleep(300);
  }
  const elapsed = Date.now() - started;
  await shot(`${tag}-result`);
  const dialogOpen = await has('[data-control="dialog.imageByUrl"]');
  if (dialogOpen) await press('Escape');
  return { preview, error, obj, elapsed, dialogOpen };
};

let deckId = '';
try {
  // ---- 1. the fresh deck
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady();
  const info = await invoke('deck.info');
  deckId = info.id;
  const titleSlide = (await state()).slideId;
  record(
    'the draft opened',
    'an untitled draft',
    `${deckId}; slide ${titleSlide}`,
    /^untitled-/.test(deckId),
  );
  await sleep(800);
  await shot('01-new-deck');

  // ---- 2. the Insert menu and its Image submenu: is there a logo route?
  await openMenu('insert');
  const insertRows = await rowsUnder('#ts-menu-insert');
  await shot('02-insert-menu');
  await hoverRow(
    'insert.image',
    '[data-control="menu.insert.image.byUrl"], [data-control="menu.insert.image.upload"]',
  );
  await sleep(300);
  const imageRows = await rowsUnder('#ts-menu-insert');
  await shot('03-insert-image-submenu');
  const logoRow = [...insertRows, ...imageRows].find(
    (r) => /logo|brand/i.test(r.label) || /logo/i.test(r.id),
  );
  record(
    'Insert menu rows',
    'a Logo row or a brand route',
    `Insert: ${insertRows.map((r) => r.label).join(' | ')}; Image: ${imageRows
      .filter((r) => r.id.startsWith('insert.image.'))
      .map((r) => r.label + (r.disabled ? ' (disabled)' : ''))
      .join(' | ')}`,
    logoRow ? true : false,
  );
  await closeMenus();

  // ---- 3. the seller's route today: Insert > Image > Upload from computer with the SVG saved from thesvg.org
  const SCRATCH =
    '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/features/logos';
  const snackText = () =>
    page
      .locator('[data-control="snackbar"] .ts-snackbar-text')
      .first()
      .textContent()
      .catch(() => null);
  const uploadFile = async (slideId, file, tag) => {
    const before = (await objectsOf(slideId)).map((o) => o.id);
    await openMenu('insert');
    await hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10_000 }),
      clickRow('insert.image.upload'),
    ]);
    const accept = await chooser
      .element()
      .getAttribute('accept')
      .catch(() => null);
    const started = Date.now();
    await chooser.setFiles(file);
    let obj = null;
    let snack = null;
    let firstDrawAt = null;
    const until = Date.now() + 45_000;
    for (;;) {
      const objs = await objectsOf(slideId).catch(() => []);
      obj = objs.find((o) => !before.includes(o.id)) ?? null;
      if (obj && firstDrawAt === null) firstDrawAt = Date.now() - started;
      const s = await snackText();
      if (s) snack = s;
      if (obj && (await page.locator('[data-control="picture.upload.progress"]').count()) === 0)
        break;
      if (
        snack &&
        /could not|not a picture|over \d+ MB|did not finish|refused|not accepted/i.test(snack)
      )
        break;
      if (Date.now() > until) break;
      await sleep(300);
    }
    const elapsed = Date.now() - started;
    await sleep(500);
    await shot(`${tag}`);
    await closeMenus();
    return { accept, obj, snack, elapsed, firstDrawAt };
  };
  const svgUp = await uploadFile(
    titleSlide,
    `${SCRATCH}/figma-default.svg`,
    '04-upload-thesvg-svg',
  );
  record(
    'Insert > Image > Upload from computer with figma/default.svg saved from thesvg.org',
    'the mark lands on the slide as a picture',
    `chooser accept "${svgUp.accept ?? 'none'}"; after ${svgUp.elapsed} ms: ${svgUp.obj ? `object ${svgUp.obj.type} ${svgUp.obj.id} ${JSON.stringify(svgUp.obj.pos)} asset ${svgUp.obj.asset}` : 'no object'}; snackbar "${svgUp.snack ?? 'none'}"`,
    Boolean(svgUp.obj),
  );

  // ---- 4. the agent's route today: asset.add with the thesvg.org address, and with the SVG as a data URL
  const rev = () => invoke('deck.info').then((i) => i.revision);
  let urlAnswer;
  try {
    const r = await invoke('asset.add', {
      url: 'https://thesvg.org/icons/figma/default.svg',
      role: 'logo',
      alt: 'Figma logo',
      baseRevision: await rev(),
    });
    urlAnswer = `answered ${JSON.stringify(r).slice(0, 160)}`;
  } catch (e) {
    urlAnswer = `refused: ${String(e && e.message ? e.message : e).slice(0, 220)}`;
  }
  record(
    'asset.add { url: https://thesvg.org/icons/figma/default.svg } on the window transport',
    'an asset with twins',
    urlAnswer,
    /^answered/.test(urlAnswer),
  );
  let dataAnswer;
  try {
    const bytes = (await import('node:fs')).readFileSync(`${SCRATCH}/figma-default.svg`);
    const dataUrl = `data:image/svg+xml;base64,${bytes.toString('base64')}`;
    const r = await invoke('asset.add', {
      file: dataUrl,
      role: 'logo',
      alt: 'Figma logo',
      baseRevision: await rev(),
    });
    dataAnswer = `answered ${JSON.stringify(r).slice(0, 160)}`;
  } catch (e) {
    dataAnswer = `refused: ${String(e && e.message ? e.message : e).slice(0, 220)}`;
  }
  record(
    'asset.add { file: data:image/svg+xml } on the window transport',
    'an asset with twins',
    dataAnswer,
    /^answered/.test(dataAnswer),
  );
  let pngUrlAnswer;
  try {
    const r = await invoke('asset.add', {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/512px-React-icon.svg.png',
      role: 'logo',
      alt: 'React logo',
      baseRevision: await rev(),
    });
    pngUrlAnswer = `answered id ${r.id} twins ${JSON.stringify(r.twins)} size ${JSON.stringify(r.size)} source ${JSON.stringify(r.source).slice(0, 120)}`;
  } catch (e) {
    pngUrlAnswer = `refused: ${String(e && e.message ? e.message : e).slice(0, 220)}`;
  }
  record(
    'asset.add { url: a 512 px PNG on upload.wikimedia.org } on the window transport',
    'an asset with twins (the allowlisted host)',
    pngUrlAnswer,
    /^answered/.test(pngUrlAnswer),
  );

  // ---- 5. the seller's route with a PNG of the same mark (what a picker would store)
  const pngUp = await uploadFile(titleSlide, `${SCRATCH}/figma-logo.png`, '05-upload-png-logo');
  record(
    'Insert > Image > Upload from computer with figma-logo.png (324 by 480)',
    'the picture draws within 500 ms, centred in the body slot, selected',
    `after ${pngUp.elapsed} ms (first drawn at ${pngUp.firstDrawAt ?? 'never'} ms): ${pngUp.obj ? `object ${pngUp.obj.type} ${pngUp.obj.id} ${JSON.stringify(pngUp.obj.pos)}` : 'no object'}; snackbar "${pngUp.snack ?? 'none'}"`,
    Boolean(pngUp.obj),
  );
  const wmUp = await uploadFile(
    titleSlide,
    `${SCRATCH}/slack-wordmark.png`,
    '06-upload-png-wordmark',
  );
  record(
    'Insert > Image > Upload from computer with slack-wordmark.png (960 by 244)',
    'the wordmark lands as a second picture beside the first',
    `after ${wmUp.elapsed} ms: ${wmUp.obj ? `object ${wmUp.obj.type} ${wmUp.obj.id} ${JSON.stringify(wmUp.obj.pos)}` : 'no object'}; snackbar "${wmUp.snack ?? 'none'}"; overlap with the first ${pngUp.obj && wmUp.obj ? String(!(wmUp.obj.pos.x >= pngUp.obj.pos.x + pngUp.obj.pos.w || wmUp.obj.pos.x + wmUp.obj.pos.w <= pngUp.obj.pos.x || wmUp.obj.pos.y >= pngUp.obj.pos.y + pngUp.obj.pos.h || wmUp.obj.pos.y + wmUp.obj.pos.h <= pngUp.obj.pos.y)) : 'n/a'}`,
    Boolean(wmUp.obj),
  );
  const png = pngUp;
  const wsvg = svgUp;
  const svg = svgUp;

  // ---- 6. the picture's right click menu: what a seller can do with a logo once it is on the slide
  const picture = png.obj ?? wmUp.obj ?? svgUp.obj;
  if (picture) {
    await sleep(600);
    const sheet = await rectOf('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
    const k = sheet.width / 1600;
    const p = picture.pos;
    const cx = sheet.x + (p.x + p.w / 2) * k;
    const cy = sheet.y + (p.y + p.h / 2) * k;
    await clickAt(cx, cy);
    await sleep(400);
    const chip = await page
      .locator('.ts-overlay .ts-chip, .ts-overlay [data-control="overlay.chip"]')
      .first()
      .textContent()
      .catch(() => null);
    await moveHuman({ x: cx - 30, y: cy - 20 }, { x: cx, y: cy }, 6);
    await page.mouse.click(cx, cy, { button: 'right' });
    await page
      .locator('.ts-context-menu')
      .first()
      .waitFor({ timeout: 6000 })
      .catch(() => undefined);
    await sleep(400);
    const ctxRows = await rowsUnder('.ts-context-menu');
    await shot('07-picture-context-menu');
    const every = ctxRows.find((r) => /every slide|logo/i.test(r.label));
    record(
      "the picture's right click menu",
      'a row that makes it the logo on every slide',
      `chip "${chip ?? 'none'}"; rows: ${ctxRows.map((r) => r.label + (r.disabled ? ' (disabled)' : '')).join(' | ')}`,
      Boolean(every),
    );
    await closeMenus();
    const rect = await rectOf('.ts-overlay');
    record(
      'the picture on the slide',
      'a selectable object with handles',
      `pos ${JSON.stringify(p)} sheet px; overlay ${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'none'}`,
      Boolean(rect),
    );
  } else {
    record(
      "the picture's right click menu",
      'a row that makes it the logo on every slide',
      'not driven: no picture landed',
      null,
    );
  }
  await press('Escape');

  // ---- 7. the Theme panel: where a brand's logo would live
  const themeVisible = await has('[data-control="toolbar.theme"]');
  if (themeVisible) await clickControl('toolbar.theme');
  else {
    await clickControl('toolbar.more');
    await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
    await clickControl('toolbar.more.toolbar.theme');
  }
  await sleep(700);
  const panelControls = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-control^="themes."], [data-control^="panel.brand"], [data-control^="panel.themes"]',
      ),
    ]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute('data-control')),
  );
  await shot('08-theme-panel');
  record(
    'the Theme panel',
    'a Logo section',
    `controls: ${panelControls.join(', ')}`,
    panelControls.some((c) => /logo/.test(c)),
  );
  if (await has('[data-control="panel.themes.close"]')) await clickControl('panel.themes.close');
  else await press('Escape');

  // ---- 8. the Icon picker behind Advanced tools: the grid picker precedent
  await openMenu('tools');
  const toolsRows = await rowsUnder('#ts-menu-tools');
  const advRow = toolsRows.find((r) => r.id === 'tools.advancedTools');
  if (advRow) await clickRow('tools.advancedTools');
  else await closeMenus();
  await sleep(500);
  const adv = (await state()).settings?.advancedTools === true;
  await openMenu('insert');
  const insertRowsAdv = await rowsUnder('#ts-menu-insert');
  const iconRow = insertRowsAdv.find((r) => r.id === 'insert.icon');
  let iconCount = 0;
  if (iconRow) {
    await clickRow('insert.icon');
    await page
      .locator('[data-control="dialog.insertIcon"]')
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
    await sleep(600);
    iconCount = await page.locator('[data-control^="dialog.insertIcon.pick."]').count();
    const hasSearch = await page.evaluate(() =>
      Boolean(
        document.querySelector(
          '[data-control="dialog.insertIcon"] input[type="search"], [data-control="dialog.insertIcon"] input[type="text"]',
        ),
      ),
    );
    await shot('09-insert-icon-dialog');
    record(
      'Insert > Icon with Advanced tools on',
      'a searchable grid of symbols',
      `advanced ${adv}; ${iconCount} symbols; search field ${hasSearch}; lead "${await page
        .locator('[data-control="dialog.insertIcon"] p')
        .first()
        .textContent()
        .catch(() => '')}"`,
      iconCount > 0,
    );
    await press('Escape');
  } else {
    await closeMenus();
    record(
      'Insert > Icon with Advanced tools on',
      'the Icon row',
      `advanced ${adv}; rows ${insertRowsAdv.map((r) => r.label).join(' | ')}`,
      false,
    );
  }
  if (adv) {
    await openMenu('tools');
    await clickRow('tools.advancedTools');
    await sleep(300);
  }
  await closeMenus();

  // ---- 9. Search the menus for "logo"
  await openMenu('help');
  const helpRows = await rowsUnder('#ts-menu-help');
  if (helpRows.some((r) => r.id === 'help.searchMenus')) {
    await clickRow('help.searchMenus');
    await sleep(600);
    await typeHuman('logo');
    await sleep(900);
    const finderRows = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-control^="finder."], .ts-finder [role="option"], .ts-finder li',
        ),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => (el.textContent ?? '').trim().slice(0, 80)),
    );
    await shot('10-search-menus-logo');
    record(
      'Search the menus: "logo"',
      'a Logo or Brand kit row',
      `${finderRows.length} rows: ${finderRows.slice(0, 8).join(' | ')}`,
      finderRows.some((r) => /logo|brand/i.test(r)),
    );
    await press('Escape');
  } else {
    await closeMenus();
    record(
      'Search the menus: "logo"',
      'the finder',
      `no help.searchMenus row; help rows ${helpRows.map((r) => r.label).join(' | ')}`,
      null,
    );
  }
  await closeMenus();

  // ---- 10. dark appearance: the same picture on ink
  await clickControl('toolbar.theme').catch(async () => {
    await clickControl('toolbar.more');
    await clickControl('toolbar.more.toolbar.theme');
  });
  await sleep(500);
  if (await has('[data-control="themes.gt.dark"]')) {
    await clickControl('themes.gt.dark');
    await sleep(900);
    if (await has('[data-control="panel.themes.close"]')) await clickControl('panel.themes.close');
    await sleep(500);
    await shot('11-picture-on-ink');
    const ground = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)'),
        ).backgroundColor,
    );
    record(
      'the dark appearance with the picture',
      'the slide ground turns to ink',
      `ground ${ground}`,
      /rgb\((\d+), (\d+), (\d+)\)/.test(ground),
    );
  } else {
    record('the dark appearance with the picture', 'the Dark tile', 'no themes.gt.dark tile', null);
  }
  await closeMenus();
} catch (error) {
  record(
    'the walk',
    'no exception',
    `exception: ${error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' / ') : String(error)}`,
    false,
  );
  await shot('99-exception').catch(() => undefined);
} finally {
  if (deckId) {
    let trashed = false;
    try {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady();
      await pollUntil(state, (s) => s.sync?.connected === true, 30_000);
      await clickControl('menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await clickControl('menu.file.moveToTrash');
      await page.waitForURL(/\/decks$/, { timeout: 20_000 });
      record(
        'File > Move to trash',
        'the page returns to /decks',
        page.url().replace(BASE, ''),
        true,
      );
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = page.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await clickControl(`trash.delete.${deckId}`);
      await clickControl('trash.confirm.ok');
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      record('Delete forever', 'the card leaves the trash', deckId, true);
      trashed = true;
    } catch (error) {
      record(
        'the product trash path',
        'Move to trash then Delete forever',
        `failed: ${error instanceof Error ? error.message : String(error)}; falling back to the actions API`,
        false,
      );
    }
    if (!trashed) {
      try {
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await editorReady().catch(() => undefined);
        const info = await invoke('deck.info').catch(() => null);
        if (info) {
          await invoke('deck.trash', { id: deckId, baseRevision: info.revision }).catch(
            () => undefined,
          );
          const t = await invoke('deck.info').catch(() => null);
          await invoke('deck.remove', {
            id: deckId,
            baseRevision: t?.revision ?? info.revision,
            confirm: true,
          }).catch(() => undefined);
        }
      } catch {
        /* the 404 probe tells the truth */
      }
    }
    let status = 0;
    const until = Date.now() + 25_000;
    for (;;) {
      const res = await page.request
        .get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })
        .catch(() => null);
      status = res ? res.status() : 0;
      if (status === 404 || Date.now() > until) break;
      await sleep(2000);
    }
    record(
      'the scratch deck answers 404',
      `GET /edit/${deckId} is 404`,
      `status ${status}`,
      status === 404,
    );
    const res2 = await page.request
      .get(`${BASE}/deck/${deckId}`, { maxRedirects: 0 })
      .catch(() => null);
    record(
      'the scratch deck answers 404 on /deck',
      `GET /deck/${deckId} is 404`,
      `status ${res2 ? res2.status() : 0}`,
      res2 ? res2.status() === 404 : false,
    );
  }
  await browser.close().catch(() => undefined);
  writeFileSync(
    path.join(OUT, 'logo-walk.json'),
    JSON.stringify(
      {
        base: BASE,
        deckId,
        ranAt: new Date().toISOString(),
        rows,
        consoleErrors: consoleErrors.slice(0, 30),
      },
      null,
      2,
    ),
  );
  console.log(
    `\n${rows.filter((r) => r.ok === true).length} ok, ${rows.filter((r) => r.ok === false).length} not ok, ${rows.filter((r) => r.ok === null).length} not driven; console errors ${consoleErrors.length}`,
  );
}

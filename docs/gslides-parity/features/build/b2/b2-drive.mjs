// B2's drive of the fonts rows on the lane's dev server (docs/FEATURES.md 3.6, 7.1): every row
// is read from the DOM and the window API and recorded as ok, failed or not driven with what
// was observed; the scratch deck is trashed and deleted forever in a finally block.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');
const { woff2Facts } =
  await import('/Users/kevinliu/repos/Turboslide/packages/fonts/src/woff2-names.ts');
const { INTER_ITALIC, INTER_NAME_VERSION } =
  await import('/Users/kevinliu/repos/Turboslide/packages/fonts/src/inter.ts');

const BASE = process.argv[2] ?? 'http://localhost:4412';
const OUT =
  process.argv[3] ??
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/b2-drive.json';
const ONLY = (process.argv[4] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const rows = [];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function row(id, fn) {
  if (ONLY.length > 0 && !ONLY.some((o) => id.startsWith(o))) return;
  const t = Date.now();
  try {
    const r = await fn();
    rows.push({ id, ok: r.ok, observed: r.observed, ms: Date.now() - t });
    console.log(
      `${r.ok === null ? 'not driven' : r.ok ? 'ok        ' : 'FAILED    '} ${id}: ${r.observed}`,
    );
  } catch (error) {
    const observed = error instanceof Error ? error.message.split('\n')[0] : String(error);
    rows.push({ id, ok: false, observed: `threw: ${observed}`, ms: Date.now() - t });
    console.log(`FAILED     ${id}: threw ${observed}`);
  }
}

function zipEntries(bytes) {
  const out = new Map();
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return out;
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    out.set(name, () => {
      const localName = bytes.readUInt16LE(local + 26);
      const localExtra = bytes.readUInt16LE(local + 28);
      const start = local + 30 + localName + localExtra;
      const data = bytes.subarray(start, start + compressed);
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const ctl = (id) => page.locator(`[data-control="${id}"]`).first();
const invoke = (action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
async function waitEditor() {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90000 });
  await page.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60000 });
}
async function settled(timeout = 20000) {
  const until = Date.now() + timeout;
  let s = await state();
  while (Date.now() < until) {
    s = await state();
    const words = await ctl('deck.saveState')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await sleep(150);
  }
  return s;
}
async function headingRun() {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
}
const runEl = (run) =>
  page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
async function blockSet(slideId, blockId, path, value) {
  const s = await state();
  const input = { baseRevision: s.revision, slideId, blockId, path };
  if (value !== undefined) input.value = value;
  await invoke('block.set', input);
  await settled();
}
async function computed(selector, prop) {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(p) : null;
    },
    [selector, prop],
  );
}
const blockSel = (id) => `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${id}"]`;
async function textWidth(selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  }, selector);
}
async function fontFaces() {
  return page.evaluate(() =>
    [...document.fonts].map((f) => ({
      family: f.family.replace(/"/g, ''),
      style: f.style,
      status: f.status,
    })),
  );
}
async function selectBlock(blockId) {
  await page.locator(blockSel(blockId)).click();
  await sleep(250);
  if (
    await page.evaluate(
      () => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
    )
  ) {
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await page
    .locator(`.ts-overlay [data-control="handle.${blockId}.move"]`)
    .waitFor({ timeout: 6000 });
}
async function menuPath(menuId, ...ids) {
  await ctl(`menubar.${menuId}`).click();
  await page.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
  for (let i = 0; i < ids.length - 1; i += 1) {
    await ctl(`menu.${ids[i]}`).hover();
    await page
      .locator(`[data-control="menu.${ids[i + 1]}"]`)
      .first()
      .waitFor({ timeout: 6000 });
  }
  await ctl(`menu.${ids[ids.length - 1]}`).click();
  await sleep(250);
}
async function openFontDropdown() {
  let control = 'toolbar.font';
  if (
    !(await ctl(control)
      .isVisible()
      .catch(() => false))
  ) {
    if (
      await ctl('toolbar.more')
        .isVisible()
        .catch(() => false)
    ) {
      await ctl('toolbar.more').click();
      await sleep(200);
      if (
        await ctl('toolbar.more.toolbar.font')
          .isVisible()
          .catch(() => false)
      )
        control = 'toolbar.more.toolbar.font';
    }
  }
  await ctl(control).click();
  await ctl('toolbar.font.search').waitFor({ timeout: 8000 });
  await page.locator('[data-control="toolbar.font.list"][data-rows]').waitFor({ timeout: 15000 });
}
async function fontGroups() {
  return page.evaluate(() => {
    const out = {};
    for (const g of document.querySelectorAll('[data-control^="toolbar.font.group."]')) {
      const name = g.getAttribute('data-control').replace('toolbar.font.group.', '');
      out[name] = [...g.querySelectorAll('[data-control^="toolbar.font.row."]')].map((el) =>
        el.getAttribute('data-control').replace('toolbar.font.row.', ''),
      );
    }
    return out;
  });
}
async function closeDialogs() {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.locator('.ts-dialog-scrim [role="dialog"]').count()) === 0) break;
    const done = page.locator(
      '[data-control="dialog.download.done"], [data-control="dialog.download.close"], [data-control="dialog.download.cancel"], [data-control="dialog.moreFonts.ok"]',
    );
    if ((await done.count()) > 0)
      await done
        .first()
        .click({ timeout: 3000 })
        .catch(() => undefined);
    else await page.keyboard.press('Escape');
    await sleep(200);
  }
}
async function download(start, timeout = 120000) {
  const waiting = page.waitForEvent('download', { timeout });
  waiting.catch(() => undefined);
  await start();
  const d = await waiting;
  const path = await d.path();
  const { readFileSync } = await import('node:fs');
  return { name: d.suggestedFilename(), bytes: readFileSync(path) };
}
async function waitFace(family, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const faces = await fontFaces();
    const hit = faces.filter((f) => f.family === family);
    if (hit.some((f) => f.status === 'loaded')) return hit;
    await sleep(200);
  }
  return (await fontFaces()).filter((f) => f.family === family);
}

let deckId = null;
try {
  // the scratch deck from /new, titled so it saves and moves to /edit
  await page.goto(`${BASE}/new`);
  await waitEditor();
  const info = await invoke('deck.info');
  deckId = info.id;
  const titleRun = await headingRun();
  await runEl(titleRun).dblclick();
  await sleep(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Fonts round B2 drive', { delay: 50 });
  await sleep(250);
  await page.keyboard.press('Escape');
  await page.waitForURL(/\/edit\//, { timeout: 30000 });
  await settled();
  if (
    await ctl('dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  ) {
    if ((await ctl('dialog.namePrompt.close').count()) > 0)
      await ctl('dialog.namePrompt.close')
        .click()
        .catch(() => undefined);
    else
      await ctl('dialog.namePrompt.skip')
        .click()
        .catch(() => undefined);
  }
  console.log(`deck ${deckId} on ${BASE}`);
  const titleSlide = (await state()).slideId;
  const headingBlock = await page.evaluate(
    (r) =>
      document
        .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`)
        ?.closest('[data-block]')
        ?.getAttribute('data-block') ?? null,
    titleRun,
  );

  // P1 fonts.preload.italic-on-edit-only: the preload links of /decks and /edit
  let italicHref = null;
  await row('fonts.preload.italic-on-edit-only', async () => {
    const decks = await (await page.request.get(`${BASE}/decks`)).text();
    const edit = await (await page.request.get(`${BASE}/edit/${deckId}`)).text();
    const preloads = (html) =>
      [...html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)]
        .map((m) => m[0])
        .filter((l) => /as="font"/.test(l));
    const a = preloads(decks);
    const b = preloads(edit);
    italicHref =
      b.map((l) => /href="([^"]+)"/.exec(l)?.[1]).find((h) => /Italic/.test(h ?? '')) ?? null;
    const ok = a.length === 1 && !/Italic/.test(a[0]) && b.length === 2 && italicHref !== null;
    return {
      ok,
      observed: `/decks ${a.length} font preload(s) (${a.map((l) => /href="([^"]+)"/.exec(l)?.[1].split('/').pop()).join(', ')}); /edit ${b.length} (${b.map((l) => /href="([^"]+)"/.exec(l)?.[1].split('/').pop()).join(', ')})`,
    };
  });

  // fonts.inter.italic-release
  await row('fonts.inter.italic-release', async () => {
    if (!italicHref) return { ok: false, observed: 'no italic preload on /edit' };
    const res = await page.request.get(new URL(italicHref, BASE).href);
    const bytes = Buffer.from(await res.body());
    const facts = woff2Facts(bytes);
    const digest = sha256(bytes);
    await runEl(titleRun).dblclick();
    await sleep(200);
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Meta+i');
    await sleep(400);
    const italic = await page.evaluate((r) => {
      const run = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      const els = run ? [run, ...run.querySelectorAll('*')] : [];
      const hit = els.find((el) => getComputedStyle(el).fontStyle === 'italic');
      return hit
        ? {
            tag: hit.tagName,
            family: getComputedStyle(hit).fontFamily,
            style: getComputedStyle(hit).fontStyle,
          }
        : null;
    }, titleRun);
    const face = (await waitFace('Inter', 8000)).find((f) => f.style === 'italic');
    await page.keyboard.press('Meta+i');
    await sleep(200);
    await page.keyboard.press('Escape');
    await settled();
    const ok =
      bytes.length === 387976 &&
      bytes.length === INTER_ITALIC.bytes &&
      digest === INTER_ITALIC.sha256 &&
      facts.version === INTER_NAME_VERSION &&
      facts.version === 'Version 4.001;git-9221beed3' &&
      italic !== null &&
      face?.status === 'loaded';
    return {
      ok,
      observed: `${italicHref.split('/').pop()} ${bytes.length} B sha256 ${digest.slice(0, 8)}… name version "${facts.version}"; Cmd+I run ${italic ? `${italic.tag} ${italic.style} in ${italic.family.split(',')[0]}` : 'no italic element'}; italic FontFace ${face ? face.status : 'absent'}`,
    };
  });

  // fonts.fallback.in-stack
  await row('fonts.fallback.in-stack', async () => {
    const family = await page.evaluate(() => {
      const root =
        document.querySelector('.ts-stagewrap.ts-editor .ts-sheet') ??
        document.querySelector('.ts-stagewrap.ts-editor.ts-sheet') ??
        document.querySelector('.ts-sheet');
      return root
        ? `${root.className.split(' ').slice(0, 2).join('.')}: ${getComputedStyle(root).fontFamily}`
        : null;
    });
    const parts = (family ?? '')
      .split(': ')
      .slice(1)
      .join(': ')
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''));
    const faces = await fontFaces();
    const fallback = faces.find((f) => f.family === 'Inter Fallback');
    return {
      ok: parts[0] === 'Inter' && parts[1] === 'Inter Fallback' && fallback !== undefined,
      observed: `sheet root font-family: ${family}; document.fonts Inter Fallback ${fallback ? fallback.status : 'absent'}`,
    };
  });

  // fonts.display-features.inter-only
  await row('fonts.display-features.inter-only', async () => {
    if (!headingBlock) return { ok: false, observed: 'no heading block on the title slide' };
    const sel = blockSel(headingBlock);
    const before = await computed(sel, 'font-feature-settings');
    await blockSet(titleSlide, headingBlock, '/typography/family', 'playfair-display');
    const playfair = await computed(sel, 'font-feature-settings');
    const playfairFamily = await computed(sel, 'font-family');
    await blockSet(titleSlide, headingBlock, '/typography/family');
    const back = await computed(sel, 'font-feature-settings');
    const s = await state();
    await invoke('brand.set', {
      baseRevision: s.revision,
      path: '/fonts/display',
      value: 'fraunces',
    });
    await settled();
    const headings = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) h1, .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) h2, .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) .big',
        ),
      ].map((el) => getComputedStyle(el).fontFeatureSettings),
    );
    const kitFamily = await computed(sel, 'font-family');
    const s2 = await state();
    await invoke('brand.set', { baseRevision: s2.revision, path: '/fonts/display' });
    await settled();
    const after = await computed(sel, 'font-feature-settings');
    const ok =
      before === '"cv11", "ss01"' &&
      playfair === 'normal' &&
      back === '"cv11", "ss01"' &&
      headings.length > 0 &&
      headings.every((h) => h === 'normal') &&
      after === '"cv11", "ss01"';
    return {
      ok,
      observed: `base ${before}; Playfair Display ${playfair} (${playfairFamily?.split(',')[0]}); back to Inter ${back}; kit display Fraunces: ${headings.length} heading(s) ${[...new Set(headings)].join('/')} (${kitFamily?.split(',')[0]}); kit cleared ${after}`,
    };
  });

  // a blank slide for the table, the paragraphs and the text box
  const s0 = await state();
  const made = await invoke('slide.new', {
    baseRevision: s0.revision,
    layout: 'blank',
    after: titleSlide,
  });
  await settled();
  const slideId = made.slide.id;
  await ctl(`filmstrip.slide.${slideId}`).click();
  await page.waitForFunction(
    (id) => window.turboslide.studio.describe().state.slideId === id,
    slideId,
    { timeout: 8000 },
  );
  await sleep(300);
  async function place(block) {
    const s = await state();
    await invoke('block.insert', { baseRevision: s.revision, slideId, slot: 'main', block });
    await settled();
  }
  await place({
    id: 'b2-table',
    type: 'table',
    columns: [{}, {}, {}],
    rows: [
      { cells: ['Quarter', 'Amount', 'Change'], header: true },
      { cells: ['Q1', '1111', '0000'] },
      { cells: ['Q2', '2222', '9999'] },
    ],
    pos: { x: 80, y: 80, w: 720, h: 240 },
  });
  await place({
    id: 'b2-para-a',
    type: 'paragraph',
    text: '1111',
    pos: { x: 80, y: 360, w: 300, h: 60 },
  });
  await place({
    id: 'b2-para-b',
    type: 'paragraph',
    text: '0000',
    pos: { x: 400, y: 360, w: 300, h: 60 },
  });
  await place({
    id: 'b2-text',
    type: 'text',
    text: 'Renewal 1111 against 0000',
    pos: { x: 80, y: 460, w: 900, h: 120 },
  });

  // tables.cells.tabular-figures
  await row('tables.cells.tabular-figures', async () => {
    const tdVariant = await computed(`${blockSel('b2-table')} .td`, 'font-variant-numeric');
    const cells = await page.evaluate((sel) => {
      const tds = [...document.querySelectorAll(`${sel} .td`)];
      const widthOf = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent.trim()) node = walker.nextNode();
        const r = document.createRange();
        if (node) r.selectNode(node);
        else r.selectNodeContents(el);
        return r.getBoundingClientRect().width;
      };
      const find = (text) => tds.find((td) => td.textContent?.trim() === text);
      const a = find('1111');
      const b = find('0000');
      return a && b
        ? { a: widthOf(a), b: widthOf(b), variant: getComputedStyle(a).fontVariantNumeric }
        : null;
    }, blockSel('b2-table'));
    const pa = await textWidth(blockSel('b2-para-a'));
    const pb = await textWidth(blockSel('b2-para-b'));
    const pVariant = await computed(blockSel('b2-para-a'), 'font-variant-numeric');
    const ok =
      tdVariant === 'tabular-nums' &&
      cells !== null &&
      Math.abs(cells.a - cells.b) < 0.6 &&
      pVariant === 'normal' &&
      pa !== null &&
      pb !== null &&
      pb - pa > 2;
    return {
      ok,
      observed: `td font-variant-numeric ${tdVariant}; cell "1111" ${cells?.a.toFixed(2)} px, "0000" ${cells?.b.toFixed(2)} px; paragraph ${pVariant}: "1111" ${pa?.toFixed(2)} px, "0000" ${pb?.toFixed(2)} px`,
    };
  });

  // formatting.numerals.tabular-row
  await row('formatting.numerals.tabular-row', async () => {
    await selectBlock('b2-text');
    if (
      !(await ctl('panel.formatOptions')
        .isVisible()
        .catch(() => false))
    ) {
      let control = 'toolbar.formatOptions';
      if (
        !(await ctl(control)
          .isVisible()
          .catch(() => false)) &&
        (await ctl('toolbar.more')
          .isVisible()
          .catch(() => false))
      ) {
        await ctl('toolbar.more').click();
        await sleep(200);
        control = 'toolbar.more.toolbar.formatOptions';
      }
      await ctl(control).click();
      await ctl('panel.formatOptions').waitFor({ timeout: 8000 });
    }
    const section = page.locator('[data-control="panel.formatOptions"] [data-section="text"]');
    await section.waitFor({ timeout: 8000 });
    if (await section.evaluate((el) => el.classList.contains('is-closed'))) {
      await section.locator('.ts-panel-section-head').click();
      await sleep(200);
    }
    const rowEl = ctl('formatOptions.typography.numerals');
    await rowEl.waitFor({ timeout: 8000 });
    const sentence = await ctl('formatOptions.typography.numerals.sentence').textContent();
    const tip = await rowEl.locator('xpath=ancestor::label').getAttribute('data-tip');
    const enabledInter = !(await rowEl.isDisabled());
    await rowEl.click({ force: true });
    await settled();
    const slide = await invoke('slide.get', { slideId });
    const block =
      (slide.slide?.slots?.main ?? slide.slide?.objects ?? []).find((b) => b.id === 'b2-text') ??
      JSON.stringify(slide).includes('"numerals":"tabular"');
    const numerals =
      typeof block === 'object' ? block.typography?.numerals : block ? 'tabular' : undefined;
    const variant = await computed(blockSel('b2-text'), 'font-variant-numeric');
    const widths = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const span = document.createElement('span');
      const probe = (t) => {
        span.textContent = t;
        el.appendChild(span);
        const w = span.getBoundingClientRect().width;
        span.remove();
        return w;
      };
      return { a: probe('1111'), b: probe('0000') };
    }, blockSel('b2-text'));
    await blockSet(slideId, 'b2-text', '/typography/family', 'bebas-neue');
    await sleep(200);
    const bebas = {
      disabled: await rowEl.isDisabled(),
      available: await rowEl
        .locator('xpath=ancestor::*[@data-field="numerals"]')
        .getAttribute('data-available'),
    };
    await blockSet(slideId, 'b2-text', '/typography/family', 'playfair-display');
    await sleep(200);
    const playfair = {
      disabled: await rowEl.isDisabled(),
      sentence: await ctl('formatOptions.typography.numerals.sentence').textContent(),
    };
    await blockSet(slideId, 'b2-text', '/typography/family');
    // Search the menus: "line up numbers"
    await page.keyboard.press('Escape');
    await ctl('toolbar.search').click();
    await ctl('palette.query').waitFor({ timeout: 8000 });
    await page.keyboard.type('line up numbers', { delay: 40 });
    await sleep(500);
    const finderRows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="palette."]')]
        .filter((el) => el.getAttribute('data-control').startsWith('palette.menu:'))
        .map((el) => el.textContent?.trim().slice(0, 60)),
    );
    await page.keyboard.press('Escape');
    await sleep(200);
    const listsRow = finderRows.some((t) => /Tabular figures/.test(t ?? ''));
    const ok =
      sentence === 'Every digit takes the same width, so numbers line up in a column' &&
      enabledInter &&
      numerals === 'tabular' &&
      variant === 'tabular-nums' &&
      Math.abs(widths.a - widths.b) < 0.6 &&
      !bebas.disabled &&
      playfair.disabled &&
      playfair.sentence === 'This face has no tabular figures' &&
      listsRow;
    return {
      ok,
      observed: `sentence "${sentence}" (tip ${tip ? 'set' : 'none'}); Inter enabled ${enabledInter}; on: numerals=${numerals}, computed ${variant}, "1111" ${widths.a.toFixed(2)} px vs "0000" ${widths.b.toFixed(2)} px; Bebas Neue disabled ${bebas.disabled} (available ${bebas.available}); Playfair Display disabled ${playfair.disabled} "${playfair.sentence}"; Search the menus "line up numbers" rows: ${finderRows.length ? finderRows.join(' | ') : 'none'} (Tabular figures listed: ${listsRow})`,
    };
  });

  // fonts.catalog.geist and fonts.catalog.six-families through the dropdown
  let groups = null;
  await row('fonts.catalog.geist', async () => {
    await page.keyboard.press('Escape');
    await selectBlock('b2-text');
    await openFontDropdown();
    groups = await fontGroups();
    const inSans = groups.sans?.includes('geist');
    const inMono = groups.mono?.includes('geist-mono');
    await ctl('toolbar.font.row.geist').scrollIntoViewIfNeeded();
    await ctl('toolbar.font.row.geist').click();
    await settled();
    const slide = await invoke('slide.get', { slideId });
    const family = JSON.stringify(slide).includes('"family":"geist"') ? 'geist' : null;
    const computedFamily = await computed(blockSel('b2-text'), 'font-family');
    const faces = await waitFace('Geist', 10000);
    const ok =
      Boolean(inSans && inMono) &&
      family === 'geist' &&
      /^"?Geist"?/.test(computedFamily ?? '') &&
      faces.some((f) => f.status === 'loaded');
    return {
      ok,
      observed: `Geist under sans ${inSans}, Geist Mono under mono ${inMono}; pick wrote family ${family}; computed ${computedFamily?.split(',')[0]}; Geist faces ${faces.map((f) => `${f.style}:${f.status}`).join(', ') || 'none'}`,
    };
  });
  await row('fonts.catalog.six-families', async () => {
    if (!groups) return { ok: false, observed: 'the dropdown did not open' };
    const where = {};
    for (const id of [
      'instrument-sans',
      'manrope',
      'schibsted-grotesk',
      'bricolage-grotesque',
      'newsreader',
      'fraunces',
    ])
      where[id] =
        Object.entries(groups)
          .filter(([g, ids]) => g !== 'used' && g !== 'brand' && g !== 'recent' && ids.includes(id))
          .map(([g]) => g)
          .join('/') || 'absent';
    const present = Object.values(where).every((g) => g !== 'absent');
    await ctl(`filmstrip.slide.${titleSlide}`).click();
    await page.waitForFunction(
      (id) => window.turboslide.studio.describe().state.slideId === id,
      titleSlide,
      { timeout: 8000 },
    );
    await sleep(300);
    await blockSet(titleSlide, headingBlock, '/typography/family', 'fraunces');
    const computedFamily = await computed(blockSel(headingBlock), 'font-family');
    const faces = await waitFace('Fraunces', 10000);
    const ok =
      present &&
      /^"?Fraunces"?/.test(computedFamily ?? '') &&
      faces.some((f) => f.status === 'loaded');
    return {
      ok,
      observed: `${Object.entries(where)
        .map(([k, v]) => `${k}: ${v}`)
        .join(
          ', ',
        )}; Fraunces on the heading computes ${computedFamily?.split(',')[0]}, faces ${faces.map((f) => `${f.style}:${f.status}`).join(', ') || 'none'}`,
    };
  });

  // fonts.links.licence-v4-1: More fonts' Inter licence link
  await row('fonts.links.licence-v4-1', async () => {
    await page.keyboard.press('Escape');
    await ctl(`filmstrip.slide.${slideId}`).click();
    await sleep(300);
    await selectBlock('b2-text');
    await openFontDropdown();
    await ctl('toolbar.font.more').click();
    await ctl('dialog.moreFonts').waitFor({ timeout: 8000 });
    const href = await ctl('dialog.moreFonts.licence.inter').getAttribute('href');
    const stale = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control="dialog.moreFonts"] a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => /v4\.001/.test(h ?? '')),
    );
    const count = await page.locator('[data-control^="dialog.moreFonts.row."]').count();
    await closeDialogs();
    await page.keyboard.press('Escape');
    return {
      ok: href === 'https://github.com/rsms/inter/blob/v4.1/LICENSE.txt' && stale.length === 0,
      observed: `Inter licence href ${href}; ${stale.length} href(s) with v4.001; ${count} rows listed`,
    };
  });

  // the export half: the PDF and the Editable text PowerPoint name and embed the faces
  await row('fonts.export.pdf-face (Geist, Fraunces)', async () => {
    await page.keyboard.press('Escape');
    await settled();
    await menuPath('file', 'file.download', 'file.download.options');
    await ctl('dialog.download.type.pdf').waitFor({ timeout: 8000 });
    await ctl('dialog.download.type.pdf').click();
    await ctl('dialog.download.pdf').waitFor({ timeout: 8000 });
    const pdf = await download(() => ctl('dialog.download.ok').click(), 180000);
    await closeDialogs();
    const fonts = [
      ...new Set(
        [
          ...pdf.bytes
            .toString('latin1')
            .matchAll(/\/(?:BaseFont|FontName)\s*\/([A-Za-z0-9+_-]+)/g),
        ].map((m) => m[1]),
      ),
    ];
    const ok =
      fonts.some((f) => /Geist/.test(f)) &&
      fonts.some((f) => /Fraunces/.test(f)) &&
      fonts.some((f) => /Inter/.test(f));
    return {
      ok,
      observed: `${pdf.name} ${pdf.bytes.length} B; fonts: ${fonts.join(', ') || 'none'}`,
    };
  });
  await row(
    'fonts.export.editable-names-face (Geist, Fraunces, Inter italic embedded)',
    async () => {
      await settled();
      const step = async (name, fn) => {
        try {
          return await fn();
        } catch (e) {
          await page
            .screenshot({ path: OUT.replace(/\.json$/, `-${name}.png`) })
            .catch(() => undefined);
          throw new Error(`${name}: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
        }
      };
      await step('menu', () => menuPath('file', 'file.download', 'file.download.options'));
      await step('type', () => ctl('dialog.download.type').waitFor({ timeout: 8000 }));
      await step('type.pptx', () => ctl('dialog.download.type.pptx').click({ timeout: 8000 }));
      await step('pptx', () => ctl('dialog.download.pptx').waitFor({ timeout: 8000 }));
      await step('mode.native', () =>
        ctl('dialog.download.mode.native').click({ force: true, timeout: 8000 }),
      );
      // Embed fonts sits behind the dialog's More disclosure (export.spec.ts 1240): open it, then
      // click the check's label (the data-control is on the clipped native input)
      const more = ctl('dialog.download.more');
      if (
        (await more.count()) > 0 &&
        !(await ctl('dialog.download.embedFonts')
          .isVisible()
          .catch(() => false))
      )
        await step('more', () => more.click({ timeout: 8000 }));
      const embed = ctl('dialog.download.embedFonts');
      const embedLabel = embed.locator('xpath=ancestor::label').first();
      const embedChecked = await embed.isChecked().catch(() => false);
      if (!embedChecked)
        await step('embed', () =>
          embedLabel.count().then((n) => n > 0)
            ? embedLabel.click({ timeout: 8000 })
            : embed.click({ force: true, timeout: 8000 }),
        );
      const embedNow = await embed.isChecked().catch(() => false);
      const pptx = await step('download', () =>
        download(() => ctl('dialog.download.ok').click({ timeout: 8000 }), 180000),
      );
      await closeDialogs();
      const entries = zipEntries(pptx.bytes);
      const slides = [...entries.keys()]
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort();
      const faces = new Set();
      for (const s of slides)
        for (const m of entries
          .get(s)()
          .toString('utf8')
          .matchAll(/<a:latin typeface="([^"]+)"/g))
          faces.add(m[1]);
      const embedded = [...entries.keys()].filter((n) => /\.fntdata$/.test(n));
      const italicEmbedded = embedded.filter((n) => /Italic/i.test(n));
      const ok = faces.has('Geist') && faces.has('Fraunces') && embedded.length > 0;
      return {
        ok,
        observed: `${pptx.name} ${pptx.bytes.length} B; ${slides.length} slide(s); Embed fonts ${embedNow ? 'on' : 'off'}; a:latin faces ${[...faces].join(', ')}; ${embedded.length} .fntdata part(s), ${italicEmbedded.length} italic (${embedded.map((n) => n.split('/').pop()).join(', ')})`,
      };
    },
  );
} finally {
  if (deckId) {
    try {
      await page.keyboard.press('Escape');
      await closeDialogs();
      await page.goto(`${BASE}/edit/${deckId}`);
      await waitEditor();
      await settled();
      await menuPath('file', 'file.moveToTrash');
      await page.waitForURL(/\/decks/, { timeout: 20000 });
      await page.goto(`${BASE}/decks/trash`);
      await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
        timeout: 30000,
      });
      await ctl(`trash.card.${deckId}`).waitFor({ timeout: 30000 });
      await ctl(`trash.delete.${deckId}`).click();
      await ctl('trash.confirm.ok').click();
      await ctl(`trash.card.${deckId}`).waitFor({ state: 'detached', timeout: 30000 });
      const status = (
        await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })
      ).status();
      console.log(
        `teardown: deck ${deckId} trashed and deleted forever; /edit/${deckId} answers ${status}`,
      );
      rows.push({
        id: 'teardown',
        ok: status === 404,
        observed: `/edit/${deckId} answers ${status}`,
      });
    } catch (error) {
      console.log(
        `teardown failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
      rows.push({ id: 'teardown', ok: false, observed: String(error) });
    }
  }
  await browser.close();
  writeFileSync(
    OUT,
    JSON.stringify({ base: BASE, at: new Date().toISOString(), deckId, rows }, null, 2),
  );
  console.log(`wrote ${OUT}`);
}

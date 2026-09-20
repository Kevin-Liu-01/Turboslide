// A focused pass over the dialogs, the colour plate, the Bold pressed state and the ? key, on its
// own scratch deck, in both appearances at 1440 by 900 and once at 1280 by 800 (the dialog against
// the shorter window). Fixes the reader of editor.mjs whose comma joined selectors matched the
// dialog root. The deck is trashed and deleted forever in the finally block.
//   node dialogs.mjs
import path from 'node:path';
import {
  BASE, PROBE_FN, SCRATCH, SHEET, Table, boxOf, chromium, clickAt, clickControl, clickSelect, createDeck, destroyDeck,
  dblclickAt, dismissPrompts, editorReady, has, insertByTool, menuPath, newContext, objectsOf, pad, press, probe, probeAll,
  rectOf, rectOfControl, runs, settled, shot, sleep, state, step, surfaceClear, typeHuman,
} from './lib.mjs';

const table = new Table(path.join(SCRATCH, 'dialogs-run.json'));
const browser = await chromium.launch({ headless: true });
const STORAGE = `${SCRATCH}/dialogs-storage.json`;
let deckId = null;
let textId = null;

const ROOT = '.ts-dialog-scrim [role="dialog"]';
const dialogFacts = async (page, tag, name, open, S) => {
  await surfaceClear(page);
  await dismissPrompts(page);
  await open();
  await page.locator(ROOT).first().waitFor({ timeout: 10_000 });
  await sleep(600);
  const d = await probe(page, ROOT);
  const title = await probe(page, `${ROOT} .ts-dialog-title`);
  const lead = await probe(page, `${ROOT} .ts-dialog-lead`);
  const x = await probe(page, `${ROOT} .ts-dialog-x`);
  const actions = await probeAll(page, `${ROOT} .ts-dialog-actions button, ${ROOT} .ts-dialog-actions .pt-ib`, 6);
  const label = await probe(page, `${ROOT} .ts-dialog-field-label`);
  const input = await probe(page, `${ROOT} input:not([type="checkbox"]):not([type="radio"]), ${ROOT} select`);
  const check = await probe(page, `${ROOT} .ts-dialog-check-box, ${ROOT} .ts-dialog-radio-dot`);
  const facts = await page.evaluate((s) => {
    const root = document.querySelector(s);
    const vis = (e) => e.getClientRects().length > 0;
    const tip = document.getElementById('pt-tip');
    const tipShown = tip !== null && !tip.hidden && vis(tip);
    const tipBox = tipShown ? tip.getBoundingClientRect() : null;
    const rootBox = root.getBoundingClientRect();
    return {
      inputs: root.querySelectorAll('input, select, textarea').length,
      controls: [...root.querySelectorAll('[data-control]')].filter(vis).map((e) => e.getAttribute('data-control')).slice(0, 50),
      scrollRegions: [...root.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => `${e.className.toString().split(' ')[0]} ${e.clientHeight}/${e.scrollHeight}`),
      focusIn: root.contains(document.activeElement),
      active: document.activeElement?.getAttribute('data-control') ?? document.activeElement?.tagName,
      tipOnOpen: tipShown ? { name: tip.querySelector('.pt-tip-name')?.textContent, overDialog: tipBox.bottom > rootBox.top && tipBox.top < rootBox.bottom } : null,
      fits: rootBox.bottom <= window.innerHeight && rootBox.top >= 0,
      text: root.textContent.trim().replace(/\s+/g, ' ').slice(0, 200),
    };
  }, ROOT);
  await S(`dialog-${name}`);
  await press(page, 'Escape');
  await sleep(350);
  const escapeCloses = !(await has(page, ROOT));
  if (!escapeCloses) await surfaceClear(page);
  await open();
  await page.locator(ROOT).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await sleep(400);
  const box = await rectOf(page, ROOT);
  let outsideCloses = null;
  if (box) {
    await clickAt(page, Math.max(24, box.x - 40), Math.max(80, box.y + 40));
    await sleep(350);
    outsideCloses = !(await has(page, ROOT));
  }
  if (!outsideCloses) await surfaceClear(page);
  return {
    dialog: d ? { w: Math.round(d.box.w), h: Math.round(d.box.h), top: Math.round(d.box.y), border: d.borderHex, borderContrast: d.borderContrast, radius: d.radius, pad: d.padding, animation: d.animation } : null,
    title: title ? { text: title.text, font: title.font, letterSpacing: title.letterSpacing } : null,
    lead: lead ? { text: lead.text.slice(0, 120), font: lead.font, color: lead.colorHex, contrast: lead.textContrast } : null,
    x: x ? { size: `${Math.round(x.box.w)}x${Math.round(x.box.h)}`, tip: x.tip, title: x.title, ariaLabel: x.ariaLabel, icon: x.svg } : null,
    actions: actions.map((a) => ({ text: a.text, solid: /is-solid/.test(a.cls), textStyle: /is-text/.test(a.cls), h: a.height, radius: a.radius, border: a.borderHex, borderContrast: a.borderContrast, ctl: a.control })),
    label: label ? { text: label.text, font: label.font, color: label.colorHex, contrast: label.textContrast } : null,
    input: input ? { h: input.height, border: input.borderHex, borderContrast: input.borderContrast, radius: input.radius, font: input.font } : null,
    check: check ? { size: `${check.box.w}x${check.box.h}`, border: check.borderHex, borderContrast: check.borderContrast } : null,
    ...facts, escapeCloses, outsideCloses,
  };
};

try {
  for (const run of [{ w: 1440, h: 900, theme: 'light' }, { w: 1440, h: 900, theme: 'dark' }, { w: 1280, h: 800, theme: 'light' }]) {
    const tag = `${run.w}-${run.theme}`;
    const context = await newContext(browser, { width: run.w, height: run.h, theme: run.theme, storageState: deckId ? STORAGE : null });
    const page = await context.newPage();
    const S = (name, clip = null) => shot(page, `${tag}-${name}`, clip);
    const V = { w: run.w, h: run.h };
    if (!deckId) {
      deckId = await createDeck(page, 'Interface audit dialogs');
      await context.storageState({ path: STORAGE });
      const slide = (await state(page)).slideId;
      const text = await insertByTool(page, slide, ['insert.textBox'], { x: 1200, y: 760 }, null, 'text');
      if (text) { textId = text.id; if (await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null)) await typeHuman(page, 'Pricing note'); await press(page, 'Escape', 2); await settled(page); }
      table.add('setup', 'deck and text box', { deckId, textId });
    } else {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      await dismissPrompts(page);
    }
    const D = (name, open) => step(table, 'dialogs', `${tag} ${name}`, () => dialogFacts(page, tag, name, open, S));
    await D('share', () => clickControl(page, 'share.open'));
    await D('download', () => menuPath(page, 'file', 'file.download', 'file.download.pdf'));
    await D('details', () => menuPath(page, 'file', 'file.details'));
    await D('slide-numbers', () => menuPath(page, 'insert', 'insert.slideNumbers'));
    await D('shortcuts', () => menuPath(page, 'help', 'help.keyboardShortcuts'));
    await D('help', () => menuPath(page, 'help', 'help.help'));
    await D('image-by-url-or-open', () => menuPath(page, 'file', 'file.open'));

    await step(table, 'keys', `${tag} the ? key and Cmd+/`, async () => {
      await surfaceClear(page);
      const stage = await rectOf(page, '.pt-stagewrap');
      await clickAt(page, stage.x + 12, stage.y + stage.h - 12);
      await press(page, 'Escape');
      await page.keyboard.press('Shift+Slash');
      await sleep(1200);
      const after = await page.evaluate(() => ({ dialog: document.querySelector('.ts-dialog-scrim [role="dialog"] .ts-dialog-title')?.textContent ?? null, help: document.querySelector('.pt-help-card') !== null, snackbar: document.querySelector('.ts-snackbar.is-on, .pt-toast.is-on')?.textContent?.trim() ?? null }));
      await S('key-question');
      await press(page, 'Escape', 2);
      await sleep(400);
      await page.keyboard.press('Meta+Slash');
      await sleep(1200);
      const after2 = await page.evaluate(() => ({ dialog: document.querySelector('.ts-dialog-scrim [role="dialog"] .ts-dialog-title')?.textContent ?? null, snackbar: document.querySelector('.ts-snackbar.is-on, .pt-toast.is-on')?.textContent?.trim() ?? null }));
      await press(page, 'Escape', 2);
      const snackLife = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 12_000) { const on = await page.evaluate(() => document.querySelector('.ts-snackbar.is-on') !== null); if (!on) return Date.now() - t0; await sleep(300); } return 'over 12 s'; })();
      return { questionKey: after, cmdSlash: after2, snackbarStillOnAfterMs: snackLife };
    });

    if (textId) {
      await step(table, 'tails', `${tag} Bold pressed state and the colour plate`, async () => {
        await surfaceClear(page);
        const b = await boxOf(page, textId);
        await dblclickAt(page, b.inner.x + 12, b.inner.y + b.inner.h / 2);
        await sleep(400);
        await page.keyboard.press('Meta+A');
        await sleep(200);
        const before = await probe(page, '[data-control="toolbar.bold"]');
        await page.keyboard.press('Meta+B');
        await sleep(600);
        const on = await probe(page, '[data-control="toolbar.bold"]');
        const strong = await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-block] b, .ts-stagewrap.ts-editor .pt-slide [data-block] strong, .ts-stagewrap.ts-editor .pt-slide [data-block] [data-mark]') !== null);
        await S('toolbar-bold-on', { x: 0, y: 72, width: 900, height: 40 });
        const r = await rectOfControl(page, 'toolbar.bold');
        await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
        await sleep(500);
        const afterClick = await probe(page, '[data-control="toolbar.bold"]');
        const strong2 = await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-block] b, .ts-stagewrap.ts-editor .pt-slide [data-block] strong') !== null);
        // the colour plate
        const tc = await rectOfControl(page, 'toolbar.textColor');
        await clickAt(page, tc.x + tc.w / 2, tc.y + tc.h / 2);
        await sleep(600);
        const plate = await page.evaluate(() => {
          const fixed = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); return (cs.position === 'fixed' || cs.position === 'absolute') && e.getClientRects().length > 0 && e.getBoundingClientRect().top > 100 && e.getBoundingClientRect().top < 400 && e.getBoundingClientRect().width > 80 && e.closest('.ts-toolbar') === null && e.closest('.pt-stagewrap') === null && !e.closest('.pt-sb'); });
          const p = fixed.find((e) => e.querySelector('button, [role="option"], [data-control]')) ?? fixed[0];
          if (!p) return null;
          const r = p.getBoundingClientRect();
          const tiles = [...p.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width < 48);
          const cs = getComputedStyle(p);
          return { cls: p.className.toString().slice(0, 80), w: Math.round(r.width), h: Math.round(r.height), border: cs.borderTopColor, radius: cs.borderRadius, tiles: tiles.length, tile: tiles[0] ? `${Math.round(tiles[0].getBoundingClientRect().width)}x${Math.round(tiles[0].getBoundingClientRect().height)}` : null, tileLabel: tiles[0]?.getAttribute('aria-label') ?? tiles[0]?.getAttribute('title') ?? tiles[0]?.getAttribute('data-tip') ?? null, hasHex: p.querySelector('input') !== null, text: p.textContent.trim().slice(0, 100), controls: [...p.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')).slice(0, 8) };
        });
        if (plate) await S('toolbar-color-plate', { x: Math.max(0, tc.x - 60), y: 72, width: 420, height: Math.min(V.h - 72, plate.h + 80) });
        await press(page, 'Escape', 3);
        return { beforePressed: before?.pressed, afterCmdB: { pressed: on?.pressed, color: on?.colorHex, border: on?.borderHex, ownBg: on?.ownBgRgb, strong }, afterClick: { pressed: afterClick?.pressed, strong: strong2 }, plate };
      });
    }
    await context.close();
    table.save({ deckId, textId });
  }
} finally {
  const context = await newContext(browser, { width: 1440, height: 900, theme: 'light', storageState: deckId ? STORAGE : null });
  const page = await context.newPage();
  const result = await destroyDeck(page, deckId, (m) => table.add('trash', m, ''));
  table.add('trash', 'the scratch deck', result);
  await context.close();
  await browser.close();
  table.save({ deckId, textId });
  console.log(`\n${table.rows.length} rows; table ${table.file}`);
}

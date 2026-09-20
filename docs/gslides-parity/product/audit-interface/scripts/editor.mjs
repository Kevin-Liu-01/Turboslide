// The editor of the interface craft audit: one scratch deck from /new, driven at 1440 by 900 in
// both appearances (the full pass) and at 1280 by 800 in both appearances (the toolbar, the tails,
// the panel, the plates and the dialogs against the smaller window). Every step reads the DOM and
// the computed styles; the pictures land under OUT; the table under SCRATCH. The deck is trashed
// and deleted forever in a finally block.
//   node editor.mjs [--only 1440-light,1280-light]
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  BASE, PROBE_FN, SCRATCH, SHEET, STORAGE_FILE, Table, attachConsole, boxOf, chip, chromium, clickAt, clickControl, clickSelect,
  closeMenus, createDeck, dblclickAt, destroyDeck, dismissPrompts, drag, editorReady, handleControls, has, hoverAt,
  hoverRow, insertByTool, invoke, menuPath, newContext, newObjectAfter, objectsOf, openMenu, pad, pollUntil, press,
  probe, probeAll, readout, rectOf, rectOfControl, runs, settled, sheetPoint, shot, sleep, state, step,
  surfaceClear, typeHuman,
} from './lib.mjs';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const only = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const DESTROY = argv.includes('--destroy');
const STATE_FILE = path.join(SCRATCH, 'editor-state.json');
const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : null);
const saveState = (st) => writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
const table = new Table(path.join(SCRATCH, `editor-run-${only ? only.join('_') : 'all'}.json`));
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });

const RUNS = [
  { w: 1440, h: 900, theme: 'light', full: true },
  { w: 1440, h: 900, theme: 'dark', full: true },
  { w: 1280, h: 800, theme: 'light', full: false },
  { w: 1280, h: 800, theme: 'dark', full: false },
].filter((r) => !only || only.includes(`${r.w}-${r.theme}`));

// ---------------------------------------------------------------------------------------------
// a tiny PNG for the picture (zlib and a CRC table, nothing else)

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
const pngDataUrl = (w, h) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x += 1) { const i = y * (w * 3 + 1) + 1 + x * 3; const on = ((x >> 3) + (y >> 3)) % 2 === 0; raw[i] = on ? 40 : 200; raw[i + 1] = on ? 40 : 200; raw[i + 2] = on ? 40 : 200; } }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
};

// ---------------------------------------------------------------------------------------------
// readers

const summarize = (f) => f ? { text: f.text, box: `${Math.round(f.box.w)}x${Math.round(f.box.h)} at ${Math.round(f.box.x)},${Math.round(f.box.y)}`, h: f.height, pad: f.padding, radius: f.radius, font: f.font, color: f.colorHex, ground: f.groundHex, textContrast: f.textContrast, border: f.border, borderHex: f.borderHex, borderContrast: f.borderContrast, outline: f.outline, transition: f.transition, animation: f.animation, cursor: f.cursor, svg: f.svg, tip: f.tip, title: f.title, disabled: f.disabled, pressed: f.pressed } : null;

const toolbarFacts = (page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.ts-toolbar');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const vis = (el) => el.getClientRects().length > 0;
    // leaf controls only: the head, the tail, the slots and the split wrappers carry data-control too
    const ctrls = [...bar.querySelectorAll('[data-control]')].filter(vis).filter((el) => el.querySelector('[data-control]') === null).map((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const s = el.querySelector('svg');
      return { id: el.getAttribute('data-control'), x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true, pressed: el.getAttribute('aria-pressed'), text: (el.textContent || '').trim().slice(0, 18), font: cs.fontSize, color: cs.color, radius: cs.borderRadius, tip: el.getAttribute('data-tip'), title: el.getAttribute('title'), svg: s ? Math.round(s.getBoundingClientRect().width) : null };
    });
    const sorted = [...ctrls].sort((a, b) => a.x - b.x);
    const gaps = [];
    for (let i = 1; i < sorted.length; i += 1) gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w));
    return { bar: { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }, scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, overflow: bar.scrollWidth > bar.clientWidth + 1, clipped: sorted.filter((c) => c.right > r.right + 0.5).map((c) => c.id), more: document.querySelector('[data-control="toolbar.more"]') !== null, seps: [...bar.querySelectorAll('.ts-tb-sep')].map((s) => { const b = s.getBoundingClientRect(); return { x: Math.round(b.x), h: Math.round(b.height) }; }), gaps: [...new Set(gaps)].sort((a, b) => a - b), heights: [...new Set(sorted.map((c) => c.h))], widths: sorted.map((c) => `${c.id.replace('toolbar.', '')}:${c.w}`), count: sorted.length, ctrls: sorted };
  });

const menuFacts = (page, id) =>
  page.evaluate((menuId) => {
    const root = document.querySelector(`#ts-menu-${menuId}`);
    if (!root) return null;
    const r = root.getBoundingClientRect();
    const items = [...root.querySelectorAll('.ts-menu-item')].filter((el) => el.getClientRects().length > 0);
    return {
      w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), viewportH: window.innerHeight, overflowsViewport: r.bottom > window.innerHeight, scrolls: root.scrollHeight > root.clientHeight + 1,
      rows: items.length, disabled: items.filter((i) => i.classList.contains('is-disabled') || i.getAttribute('aria-disabled') === 'true').length,
      withIcon: items.filter((i) => i.querySelector('.ts-menu-ic svg')).length, withKey: items.filter((i) => i.querySelector('.ts-menu-key')?.textContent?.trim()).length,
      submenus: items.filter((i) => i.querySelector('.ts-menu-sub')).length, dividers: root.querySelectorAll('.ts-menu-divider').length,
      rowH: [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().height)))], labels: items.slice(0, 40).map((i) => i.querySelector('.ts-menu-label')?.textContent?.trim() ?? i.textContent.trim().slice(0, 30)),
    };
  }, id);

const focusNext = async (page) => {
  await press(page, 'Tab');
  return page.evaluate(`(${PROBE_FN})(document.activeElement)`);
};
const tooltipOn = async (page, control) => {
  const r = await rectOfControl(page, control);
  if (!r) return { shown: false, why: `no control ${control}` };
  await page.mouse.move(r.x - 70, r.y + r.h / 2);
  await sleep(250);
  const t0 = Date.now();
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  let shown = false;
  let at = 0;
  for (let i = 0; i < 50; i += 1) {
    await sleep(20);
    shown = await page.evaluate(() => { const t = document.getElementById('pt-tip'); return t !== null && !t.hidden && t.getClientRects().length > 0; });
    if (shown) { at = Date.now() - t0; break; }
  }
  if (!shown) return { shown, afterMs: null };
  const f = await page.evaluate(() => { const t = document.getElementById('pt-tip'); const r = t.getBoundingClientRect(); return { name: t.querySelector('.pt-tip-name')?.textContent ?? null, key: t.querySelector('.pt-tip-key')?.textContent ?? null, doc: t.querySelector('.pt-tip-doc')?.textContent ?? null, box: { x: r.x, y: r.y, w: r.width, h: r.height }, keyRadius: t.querySelector('.pt-tip-key') ? getComputedStyle(t.querySelector('.pt-tip-key')).borderRadius : null }; });
  const tip = await probe(page, '#pt-tip');
  return { shown, afterMs: at, ...f, gapFromControl: Math.round(f.box.y - (r.y + r.h)), font: tip.font, border: tip.borderHex, borderContrast: tip.borderContrast, docColor: (await probe(page, '#pt-tip .pt-tip-doc'))?.colorHex, docContrast: (await probe(page, '#pt-tip .pt-tip-doc'))?.textContrast };
};
const dialogFacts = async (page, tag, name, open, S) => {
  await surfaceClear(page);
  await dismissPrompts(page);
  await open();
  const sel = '.ts-dialog-scrim [role="dialog"], .ts-dialog';
  await page.locator(sel).first().waitFor({ timeout: 10_000 });
  await sleep(500);
  const d = await probe(page, sel);
  const title = await probe(page, `${sel} .ts-dialog-title, ${sel} h2`);
  const lead = await probe(page, `${sel} .ts-dialog-lead`);
  const x = await probe(page, `${sel} .ts-dialog-x`);
  const actions = await probeAll(page, `${sel} .ts-dialog-actions .pt-ib, ${sel} .ts-dialog-actions button`, 6);
  const fields = await page.evaluate((s) => { const root = document.querySelector(s); return { inputs: root.querySelectorAll('input, select, textarea').length, labels: root.querySelectorAll('.ts-dialog-field-label').length, checks: root.querySelectorAll('.ts-dialog-check, .ts-dialog-radio').length, controls: [...root.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')).slice(0, 60), scrolls: [...root.querySelectorAll('*')].some((e) => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)), text: root.textContent.trim().replace(/\s+/g, ' ').slice(0, 400), focusIn: root.contains(document.activeElement), active: document.activeElement?.getAttribute('data-control') ?? document.activeElement?.tagName }; }, sel);
  const label = await probe(page, `${sel} .ts-dialog-field-label`);
  const input = await probe(page, `${sel} input[type="text"], ${sel} input[type="url"], ${sel} input[type="search"], ${sel} select`);
  await S(`dialog-${name}`);
  // Escape
  await press(page, 'Escape');
  await sleep(350);
  const escapeCloses = !(await has(page, sel));
  if (!escapeCloses) await surfaceClear(page);
  // click outside
  await open();
  await page.locator(sel).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await sleep(400);
  const box = await rectOf(page, sel);
  let outsideCloses = null;
  if (box) {
    const px = box.x > 60 ? box.x - 30 : box.x + box.w + 30;
    await clickAt(page, px, Math.max(60, box.y + 40));
    await sleep(350);
    outsideCloses = !(await has(page, sel));
  }
  if (!outsideCloses) await surfaceClear(page);
  return {
    dialog: d ? { w: Math.round(d.box.w), h: Math.round(d.box.h), top: Math.round(d.box.y), border: d.borderHex, borderContrast: d.borderContrast, radius: d.radius, font: d.font, animation: d.animation } : null,
    title: title ? { text: title.text, font: title.font } : null, lead: lead?.text ?? null, x: x ? { size: `${Math.round(x.box.w)}x${Math.round(x.box.h)}`, tip: x.tip, title: x.title, ariaLabel: x.ariaLabel } : null,
    actions: actions.map((a) => ({ text: a.text, solid: /is-solid/.test(a.cls), textStyle: /is-text/.test(a.cls), h: a.height, radius: a.radius, border: a.borderHex, borderContrast: a.borderContrast })),
    label: label ? { font: label.font, color: label.colorHex, contrast: label.textContrast } : null, input: input ? { h: input.height, border: input.borderHex, borderContrast: input.borderContrast, radius: input.radius } : null,
    ...fields, escapeCloses, outsideCloses,
  };
};
const panelFacts = async (page) =>
  page.evaluate(() => {
    const p = document.querySelector('.ts-rpanel .ts-panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const body = p.querySelector('.ts-panel-body');
    const heads = [...p.querySelectorAll('.ts-panel-section-head')].map((h) => ({ text: h.textContent.trim().slice(0, 40), h: Math.round(h.getBoundingClientRect().height), closed: h.closest('.ts-panel-section')?.classList.contains('is-closed') ?? null, disabled: h.classList.contains('is-disabled') }));
    return { w: Math.round(r.width), h: Math.round(r.height), headH: Math.round(p.querySelector('.ts-panel-head')?.getBoundingClientRect().height ?? 0), title: p.querySelector('.ts-panel-title')?.textContent?.trim(), count: p.querySelector('.ts-panel-count')?.textContent?.trim() ?? null, sections: heads, bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : null, bodyScrollClass: body?.className, empty: p.querySelector('.ts-panel-empty')?.textContent?.trim() ?? null, notice: p.querySelector('.ts-fo-notice')?.textContent?.trim() ?? null, fields: p.querySelectorAll('input, select, textarea').length, rows: p.querySelectorAll('.ts-insp-row').length, controls: [...p.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')).slice(0, 50) };
  });
const contextFacts = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('.ts-context-menu');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const items = [...m.querySelectorAll('.ts-menu-item')].filter((el) => el.getClientRects().length > 0);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), fits: r.bottom <= window.innerHeight && r.right <= window.innerWidth, rows: items.length, disabled: items.filter((i) => i.classList.contains('is-disabled')).length, withIcon: items.filter((i) => i.querySelector('.ts-menu-ic svg')).length, labels: items.map((i) => i.querySelector('.ts-menu-label')?.textContent?.trim() ?? '').slice(0, 30) };
  });

// ---------------------------------------------------------------------------------------------
// the run

const saved = loadState();
let deckId = saved?.deckId ?? null;
const objects = saved?.objects ?? { text: null, shape: null, line: null, picture: null, table: null, chart: null, slide2: null, slide3: null, slide4: null, slide1: null };
if (saved) console.log(`state: deck ${deckId}, objects ${JSON.stringify(objects)}`);
try {
  for (const run of RUNS) {
    const tag = `${run.w}-${run.theme}`;
    const context = await newContext(browser, { width: run.w, height: run.h, theme: run.theme, storageState: deckId && existsSync(STORAGE_FILE) ? STORAGE_FILE : null });
    const page = await context.newPage();
    attachConsole(page, consoleErrors);
    context.on('page', (p) => p.close().catch(() => undefined));
    page.on('crash', () => console.log('       the page crashed'));
    page.on('close', () => console.log('       the page closed'));
    const gone = () => page.isClosed() || !browser.isConnected();
    try {
    const S = (name, clip = null) => shot(page, `${tag}-${name}`, clip);
    const P = (surface, what, sel) => step(table, surface, `${tag} ${what}`, async () => summarize(await probe(page, sel)));
    const V = { w: run.w, h: run.h };
    const clipOf = async (sel, p = 8) => { const r = await rectOf(page, sel); return r ? pad(r, p, V.w, V.h) : null; };

    // ---- the deck
    if (gone()) throw new Error('the page is gone');
    if (!deckId) {
      await step(table, 'editor', `${tag} the scratch deck`, async () => {
        deckId = await createDeck(page, 'Interface audit');
        objects.slide1 = (await state(page)).slideId;
        await context.storageState({ path: STORAGE_FILE });
        saveState({ deckId, objects });
        return { deckId, slide1: objects.slide1, address: page.url().replace(BASE, '') };
      });
    } else {
      await step(table, 'editor', `${tag} the editor skeleton on /edit`, async () => {
        const t0 = Date.now();
        await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'commit' });
        let sk = null;
        for (let i = 0; i < 80; i += 1) { sk = await page.evaluate(() => { const s = document.querySelector('.ts-skeleton'); return s ? { at: performance.now(), rows: s.querySelectorAll('*').length } : null; }).catch(() => null); if (sk) break; if (await page.evaluate(() => Boolean(window.turboslide?.studio)).catch(() => false)) break; await sleep(25); }
        const skAt = Date.now() - t0;
        if (sk) await S('edit-skeleton');
        await editorReady(page);
        await settled(page);
        await dismissPrompts(page);
        return { skeleton: Boolean(sk), skeletonAtMs: skAt, readyMs: Date.now() - t0, theme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')) };
      });
    }
    await step(table, 'editor', `${tag} the frame`, async () => {
      const tk = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); const pick = (n) => cs.getPropertyValue(n).trim(); return { theme: document.documentElement.getAttribute('data-theme'), appearance: localStorage.getItem('ts-chrome-appearance'), paper: pick('--pt-paper'), ink: pick('--pt-ink'), titanium: pick('--pt-titanium'), hair: pick('--pt-hair'), select: pick('--pt-select') }; });
      const rows = {};
      for (const [k, sel] of Object.entries({ title: '.ts-title-row', menubar: '.ts-menubar', toolbar: '.ts-toolbar', filmstrip: '.pt-sb', stage: '.pt-stagewrap', notes: '.ts-notes', bottom: '.ts-bottombar' })) { const r = await rectOf(page, sel); rows[k] = r ? `${Math.round(r.w)}x${Math.round(r.h)} at ${Math.round(r.x)},${Math.round(r.y)}` : null; }
      await S('editor');
      return { ...tk, rows, sheet: await rectOf(page, SHEET) };
    });

    // ---- the title row
    if (gone()) throw new Error('the page is gone');
    await P('title', 'row', '.ts-title-row');
    await P('title', 'home mark link', '[data-control="title.home"]');
    await P('title', 'deck name', '[data-control="deck.name"]');
    await P('title', 'save words', '[data-control="deck.saveState"]');
    await P('title', 'clock', '.ts-title-clock');
    await P('title', 'comments toggle', '[data-control="title.comments.slot"] .pt-ib');
    await P('title', 'slideshow split', '[data-control="present.split"]');
    await P('title', 'slideshow label half', '[data-control="present.open"]');
    await P('title', 'slideshow arrow half', '[data-control="present.arrow"]');
    await P('title', 'share', '[data-control="share.open"]');
    await P('title', 'presence own chip', '.ts-title-r [data-control^="title.presence"] , .ts-presence-slot .ts-chip, .ts-presence-slot button');
    await step(table, 'title', `${tag} the right cluster geometry`, async () => page.evaluate(() => [...document.querySelectorAll('.ts-title-r > *')].filter((e) => e.getClientRects().length > 0).map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className.split(' ')[0] || e.tagName, ctl: e.getAttribute('data-control'), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(e).borderRadius, empty: r.width > 0 && e.textContent.trim() === '' && !e.querySelector('svg') }; })));
    await step(table, 'title', `${tag} hover states of the right cluster`, async () => {
      const out = {};
      for (const c of ['deck.name', 'share.open', 'present.open', 'present.arrow']) {
        const r = await rectOfControl(page, c);
        if (!r) { out[c] = 'absent'; continue; }
        await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 260);
        const f = await probe(page, `[data-control="${c}"]`);
        out[c] = { hover: f.hover, border: f.borderHex, borderContrast: f.borderContrast, color: f.colorHex, ownBg: f.ownBgRgb, cursor: f.cursor };
        if (c === 'share.open' || c === 'present.open') await S(`title-hover-${c.replace('.', '-')}`, pad(r, 20, V.w, V.h));
      }
      return out;
    });
    await step(table, 'title', `${tag} tooltip on Share and the split button`, async () => ({ share: await tooltipOn(page, 'share.open'), slideshow: await tooltipOn(page, 'present.open'), arrow: await tooltipOn(page, 'present.arrow'), name: await tooltipOn(page, 'deck.name'), save: await tooltipOn(page, 'deck.saveState') }));
    await step(table, 'title', `${tag} keyboard focus through the title row`, async () => {
      const r = await rectOfControl(page, 'title.home');
      await page.mouse.move(10, V.h - 10);
      await page.evaluate(() => document.querySelector('[data-control="title.home"]')?.focus());
      const seq = [];
      for (let i = 0; i < 8; i += 1) { const f = await focusNext(page); if (!f) break; seq.push({ on: f.control ?? f.cls.split(' ')[0], fv: f.focusVisible, outline: f.outline.replace(/rgb\([^)]*\)/, (m) => m), inRow: f.box.y < 44 }); if (f.box.y > 44) break; }
      const shareR = await rectOfControl(page, 'share.open');
      if (shareR) await S('title-focus', pad({ x: shareR.x - 420, y: 0, w: 420 + shareR.w + 20, h: 44 }, 4, V.w, V.h));
      return seq;
    });
    await step(table, 'title', `${tag} a long deck name (truncation)`, async () => {
      const r = await rectOfControl(page, 'deck.name');
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      const field = await probe(page, '.ts-title-field');
      if (!field) return 'the rename field did not open';
      await page.keyboard.press('Meta+A');
      await typeHuman(page, 'Q3 enterprise renewal pitch for the EMEA team, revision four with pricing');
      await press(page, 'Enter');
      await sleep(600);
      await settled(page);
      const name = await probe(page, '[data-control="deck.name"]');
      const save = await probe(page, '[data-control="deck.saveState"]');
      const tab = await page.title();
      await S('title-long-name', pad({ x: 0, y: 0, w: Math.min(V.w, 760), h: 44 }, 0, V.w, V.h));
      const clipped = await page.evaluate(() => { const el = document.querySelector('[data-control="deck.name"]'); return el ? el.scrollWidth > el.clientWidth + 1 : null; });
      return { fieldW: field.box.w, fieldFont: field.font, nameW: Math.round(name.box.w), maxWidth: name ? await page.evaluate(() => getComputedStyle(document.querySelector('[data-control="deck.name"]')).maxWidth) : null, ellipsis: name.textOverflow, clipped, save: save?.text, tabTitle: tab.slice(0, 90) };
    });
    await step(table, 'title', `${tag} rename back`, async () => {
      const r = await rectOfControl(page, 'deck.name');
      await clickAt(page, r.x + 20, r.y + r.h / 2);
      await sleep(300);
      await page.keyboard.press('Meta+A');
      await typeHuman(page, 'Interface audit');
      await press(page, 'Enter');
      await settled(page);
      return (await probe(page, '[data-control="deck.name"]'))?.text;
    });

    // ---- the menu bar and the menus
    if (gone()) throw new Error('the page is gone');
    await P('menubar', 'row', '.ts-menubar');
    await P('menubar', 'title button', '[data-control="menubar.file"]');
    await step(table, 'menubar', `${tag} the titles`, async () => page.evaluate(() => [...document.querySelectorAll('.ts-menubar-title')].map((t) => t.textContent.trim())));
    await step(table, 'menubar', `${tag} hover a title`, async () => {
      const r = await rectOfControl(page, 'menubar.view');
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 260);
      const f = await probe(page, '[data-control="menubar.view"]');
      await S('menubar-hover', pad({ x: 0, y: 44, w: 520, h: 28 }, 0, V.w, V.h));
      return { hover: f.hover, ownBg: f.ownBgRgb, groundContrast: f.groundContrast, color: f.colorHex, cursor: f.cursor, gapsBetweenTitles: await page.evaluate(() => { const ts = [...document.querySelectorAll('.ts-menubar-title')]; const g = []; for (let i = 1; i < ts.length; i += 1) g.push(Math.round(ts[i].getBoundingClientRect().x - ts[i - 1].getBoundingClientRect().right)); return [...new Set(g)]; }) };
    });
    for (const id of ['file', 'edit', 'view', 'insert', 'format', 'slide', 'arrange', 'tools', 'help']) {
      await step(table, 'menus', `${tag} the ${id} menu`, async () => {
        const errs = consoleErrors.length;
        await surfaceClear(page);
        await openMenu(page, id);
        const f = await menuFacts(page, id);
        if (run.full && ['file', 'format', 'view', 'insert'].includes(id)) await S(`menu-${id}`, pad({ x: 0, y: 44, w: Math.min(V.w, 640), h: Math.min(V.h - 44, (f?.h ?? 400) + 80) }, 0, V.w, V.h));
        const plate = await probe(page, `#ts-menu-${id}`);
        const key = await probe(page, `#ts-menu-${id} .ts-menu-key`);
        const icon = await probe(page, `#ts-menu-${id} .ts-menu-ic svg`);
        const sub = await probe(page, `#ts-menu-${id} .ts-menu-sub svg`);
        const disabledRow = await probe(page, `#ts-menu-${id} .ts-menu-item.is-disabled .ts-menu-label`);
        await closeMenus(page);
        const still = await has(page, `#ts-menu-${id}`);
        return { ...f, plateFont: plate?.font, plateBorder: plate?.borderHex, plateBorderContrast: plate?.borderContrast, plateAnimation: plate?.animation, key: key ? { font: key.font, color: key.colorHex, contrast: key.textContrast } : null, iconPx: icon?.box.w, subChevronPx: sub?.box.w, disabledRow: disabledRow ? { text: disabledRow.text, color: disabledRow.colorHex, contrast: disabledRow.textContrast } : null, escapeCloses: !still, newConsoleErrors: consoleErrors.length - errs };
      });
    }
    await step(table, 'menus', `${tag} a row hover and a submenu (Format > Align & indent)`, async () => {
      await openMenu(page, 'format');
      const rowSel = '#ts-menu-format .ts-menu-item';
      const r0 = await rectOf(page, rowSel);
      await hoverAt(page, r0.x + r0.w / 2, r0.y + r0.h / 2, 250);
      const hovered = await probe(page, `${rowSel}:hover`);
      const ids = await page.evaluate(() => [...document.querySelectorAll('#ts-menu-format [data-control^="menu."]')].map((e) => e.getAttribute('data-control').replace(/^menu\./, '')));
      const alignId = ids.find((i) => /align/i.test(i)) ?? ids.find((i) => /text$/.test(i));
      let sub = null;
      if (alignId) {
        const t0 = Date.now();
        await hoverRow(page, alignId, `[id^="ts-menu-"][id$="${alignId.split('.').pop()}"], .ts-menu.is-sub, [role="menu"]:not(#ts-menu-format)`).catch(() => undefined);
        sub = await page.evaluate(() => { const menus = [...document.querySelectorAll('.ts-menu')].filter((m) => m.getClientRects().length > 0); const s = menus[menus.length - 1]; if (!s || menus.length < 2) return { open: false, count: menus.length }; const r = s.getBoundingClientRect(); const parent = menus[0].getBoundingClientRect(); return { open: true, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), overlapWithParent: Math.round(parent.right - r.x), rows: s.querySelectorAll('.ts-menu-item').length }; });
        sub.openAfterMs = Date.now() - t0;
        await S('menu-format-submenu', pad({ x: 0, y: 44, w: Math.min(V.w, 760), h: Math.min(V.h - 44, 640) }, 0, V.w, V.h));
      }
      await closeMenus(page);
      return { hovered: hovered ? { ownBg: hovered.ownBgRgb, groundContrast: hovered.groundContrast, color: hovered.colorHex } : null, alignId, sub };
    });
    await step(table, 'menus', `${tag} the disabled rows of Edit`, async () => {
      await openMenu(page, 'edit');
      const rows = await page.evaluate(() => [...document.querySelectorAll('#ts-menu-edit .ts-menu-item')].map((i) => ({ label: i.querySelector('.ts-menu-label')?.textContent?.trim(), disabled: i.classList.contains('is-disabled'), ariaDisabled: i.getAttribute('aria-disabled'), cursor: getComputedStyle(i).cursor, title: i.getAttribute('title'), tip: i.getAttribute('data-tip') })).slice(0, 12));
      const d = await probe(page, '#ts-menu-edit .ts-menu-item.is-disabled');
      await closeMenus(page);
      return { rows, disabledColor: d?.colorHex, disabledContrast: d?.textContrast };
    });
    await step(table, 'menus', `${tag} View > Appearance`, async () => {
      await openMenu(page, 'view');
      await hoverRow(page, 'view.appearance', '[data-control="menu.view.appearance.light"]');
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.view.appearance."]')].map((e) => ({ id: e.getAttribute('data-control'), checked: e.getAttribute('aria-checked') ?? (e.querySelector('.ts-menu-check') ? 'check' : null), role: e.getAttribute('role') })));
      await S('menu-view-appearance', pad({ x: 0, y: 44, w: Math.min(V.w, 700), h: Math.min(V.h - 44, 620) }, 0, V.w, V.h));
      const other = run.theme === 'light' ? 'dark' : 'light';
      await clickControl(page, `menu.view.appearance.${other}`);
      await sleep(600);
      const switched = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await S('editor-other-appearance');
      await surfaceClear(page);
      await openMenu(page, 'view');
      await hoverRow(page, 'view.appearance', `[data-control="menu.view.appearance.${run.theme}"]`);
      await clickControl(page, `menu.view.appearance.${run.theme}`);
      await sleep(500);
      const back = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      return { rows, switchedTo: switched, back, transitionOnRoot: await page.evaluate(() => getComputedStyle(document.body).transitionDuration) };
    });

    // ---- the toolbar, default tail
    if (gone()) throw new Error('the page is gone');
    await step(table, 'toolbar', `${tag} default tail`, async () => {
      await surfaceClear(page);
      await press(page, 'Escape', 2);
      const f = await toolbarFacts(page);
      await S('toolbar-default', pad({ x: 0, y: 72, w: V.w, h: 40 }, 0, V.w, V.h));
      return f;
    });
    await P('toolbar', 'search pill', '[data-control="toolbar.search"]');
    await P('toolbar', 'new slide button', '[data-control="toolbar.newSlide"]');
    await P('toolbar', 'undo (disabled at start)', '[data-control="toolbar.undo"]');
    await P('toolbar', 'zoom field', '.ts-tb-zoom-field');
    await P('toolbar', 'zoom box', '.ts-tb-zoom');
    await P('toolbar', 'text button (Background)', '[data-control="toolbar.background"]');
    await P('toolbar', 'layout button', '[data-control="toolbar.layout"]');
    await P('toolbar', 'separator', '.ts-tb-sep');
    await P('toolbar', 'text box glyph', '.ts-tb-glyph');
    await step(table, 'toolbar', `${tag} hover, pressed and disabled states`, async () => {
      const out = {};
      for (const c of ['toolbar.newSlide', 'toolbar.undo', 'toolbar.select', 'toolbar.background', 'toolbar.zoom']) {
        const r = await rectOfControl(page, c) ?? (c === 'toolbar.zoom' ? await rectOf(page, '.ts-tb-zoom') : null);
        if (!r) { out[c] = 'absent'; continue; }
        await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 260);
        const f = await probe(page, `[data-control="${c}"]`) ?? await probe(page, '.ts-tb-zoom');
        out[c] = { hover: f.hover, border: f.borderHex, borderContrast: f.borderContrast, color: f.colorHex, textContrast: f.textContrast, ownBg: f.ownBgRgb, cursor: f.cursor, disabled: f.disabled, pressed: f.pressed };
        if (c === 'toolbar.newSlide' || c === 'toolbar.undo') await S(`toolbar-hover-${c.split('.')[1]}`, pad(r, 16, V.w, V.h));
      }
      return out;
    });
    await step(table, 'toolbar', `${tag} tooltips (New slide, Undo, Zoom, Select, Insert image)`, async () => ({ newSlide: await tooltipOn(page, 'toolbar.newSlide'), undo: await tooltipOn(page, 'toolbar.undo'), select: await tooltipOn(page, 'toolbar.select'), image: await tooltipOn(page, 'toolbar.insertImage'), paint: await tooltipOn(page, 'toolbar.paintFormat') }));
    await step(table, 'toolbar', `${tag} keyboard focus ring on toolbar buttons`, async () => {
      await page.evaluate(() => document.querySelector('[data-control="toolbar.search"]')?.focus());
      const seq = [];
      for (let i = 0; i < 6; i += 1) { const f = await focusNext(page); if (!f) break; seq.push({ on: f.control ?? f.cls.split(' ')[0], fv: f.focusVisible, outline: f.outline }); }
      const r = await rectOfControl(page, 'toolbar.newSlide');
      if (r) await S('toolbar-focus', pad({ x: 0, y: 72, w: 520, h: 40 }, 0, V.w, V.h));
      await press(page, 'Escape');
      return seq;
    });
    await step(table, 'toolbar', `${tag} the zoom dropdown and the New slide arrow`, async () => {
      const z = await rectOf(page, '.ts-tb-zoom-arrow');
      await clickAt(page, z.x + z.w / 2, z.y + z.h / 2);
      await sleep(400);
      const zoomMenu = await page.evaluate(() => { const m = [...document.querySelectorAll('.ts-menu')].find((x) => x.getClientRects().length > 0); return m ? { rows: [...m.querySelectorAll('.ts-menu-item')].map((i) => i.textContent.trim()).slice(0, 12), w: Math.round(m.getBoundingClientRect().width) } : null; });
      await S('toolbar-zoom-menu', pad({ x: 0, y: 72, w: 700, h: Math.min(V.h - 72, 420) }, 0, V.w, V.h));
      await closeMenus(page);
      const a = await rectOf(page, '.ts-tb-split-arrow');
      let layoutMenu = null;
      if (a) { await clickAt(page, a.x + a.w / 2, a.y + a.h / 2); await sleep(500); layoutMenu = await page.evaluate(() => { const p = document.querySelector('.ts-layout-plate'); const m = [...document.querySelectorAll('.ts-menu')].find((x) => x.getClientRects().length > 0); return { plate: p ? Math.round(p.getBoundingClientRect().width) : null, menuRows: m ? m.querySelectorAll('.ts-menu-item').length : null, tiles: document.querySelectorAll('.ts-layout-tile').length }; }); await S('toolbar-newslide-arrow', pad({ x: 0, y: 72, w: 720, h: Math.min(V.h - 72, 720) }, 0, V.w, V.h)); await closeMenus(page); }
      return { zoomMenu, layoutMenu };
    });

    // ---- the filmstrip
    if (gone()) throw new Error('the page is gone');
    await P('filmstrip', 'column', '.pt-sb');
    await P('filmstrip', 'card', '.ts-card');
    await P('filmstrip', 'card frame (current)', '.ts-card.is-current .ts-card-frame');
    await P('filmstrip', 'card number', '.ts-card .ts-card-n');
    await step(table, 'filmstrip', `${tag} New slide from the toolbar (a second card)`, async () => {
      const before = (await invoke(page, 'slide.list', {})).slides?.length ?? null;
      if (!objects.slide2) {
        await clickControl(page, 'toolbar.newSlide');
        await pollUntil(() => state(page), (s) => s.slideId !== objects.slide1, 10_000);
        await settled(page);
        objects.slide2 = (await state(page)).slideId;
      }
      const cards = await page.evaluate(() => [...document.querySelectorAll('.ts-card')].map((c) => { const r = c.getBoundingClientRect(); const fr = c.querySelector('.ts-card-frame').getBoundingClientRect(); const cs = getComputedStyle(c.querySelector('.ts-card-frame')); return { id: c.getAttribute('data-control'), current: c.classList.contains('is-current'), selected: c.classList.contains('is-selected'), y: Math.round(r.y), h: Math.round(r.height), frame: `${Math.round(fr.width)}x${Math.round(fr.height)}`, border: cs.borderColor, outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' offset ' + cs.outlineOffset }; }));
      const gap = cards.length > 1 ? cards[1].y - (cards[0].y + cards[0].h) : null;
      await S('filmstrip', await clipOf('.pt-sb', 0));
      return { before, slide2: objects.slide2, cards, gapBetweenCards: gap };
    });
    await step(table, 'filmstrip', `${tag} hover a non current card and its number`, async () => {
      const r = await rectOf(page, `.ts-card:not(.is-current) .ts-card-frame`);
      if (!r) return 'no non current card';
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 300);
      const f = await probe(page, '.ts-card:not(.is-current) .ts-card-frame');
      const n = await probe(page, '.ts-card:not(.is-current) .ts-card-n');
      await S('filmstrip-hover', pad(r, 20, V.w, V.h));
      return { border: f.borderHex, borderContrast: f.borderContrast, transition: f.transition, number: { font: n.font, color: n.colorHex, contrast: n.textContrast }, cursor: f.cursor };
    });
    await step(table, 'filmstrip', `${tag} right click a card`, async () => {
      const r = await rectOf(page, `.ts-card:not(.is-current) .ts-card-frame`);
      await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(300);
      const f = await contextFacts(page);
      await S('context-filmstrip', f ? pad({ x: f.x - 8, y: f.y - 8, w: f.w + 16, h: f.h + 16 }, 8, V.w, V.h) : null);
      await closeMenus(page);
      return f;
    });
    await step(table, 'filmstrip', `${tag} drag card 2 above card 1 (the drop line)`, async () => {
      const cards = await page.evaluate(() => [...document.querySelectorAll('.ts-card .ts-card-frame')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
      if (cards.length < 2) return 'one card';
      const from = { x: cards[1].x + cards[1].w / 2, y: cards[1].y + cards[1].h / 2 };
      const to = { x: cards[0].x + cards[0].w / 2, y: cards[0].y + 6 };
      const mid = await drag(page, from, to, { steps: 16, during: async () => { const d = await page.evaluate(() => { const c = document.querySelector('.ts-card[data-drop]'); const g = document.querySelector('.ts-card.is-dragging'); return { drop: c?.getAttribute('data-drop') ?? null, draggingOpacity: g ? getComputedStyle(g).opacity : null, ghost: document.querySelector('.ts-card-ghost, .ts-drag-ghost') !== null }; }); await shot(page, `${tag}-filmstrip-drag`, pad({ x: cards[0].x - 40, y: cards[0].y - 24, w: cards[0].w + 60, h: cards[0].h * 2 + 60 }, 0, V.w, V.h)); return d; } });
      await sleep(600);
      await settled(page);
      const order = (await invoke(page, 'slide.list', {})).slides?.map((s) => s.id);
      // put the order back so slide 1 stays the title slide
      if (order && order[0] !== objects.slide1) { await press(page, 'Meta+z'); await sleep(500); await settled(page); }
      return { during: mid, orderAfter: order, restored: (await invoke(page, 'slide.list', {})).slides?.map((s) => s.id) };
    });

    // ---- the sheet, the overlay
    if (gone()) throw new Error('the page is gone');
    await step(table, 'overlay', `${tag} select the title placeholder (ring, handles, chip)`, async () => {
      await clickControl(page, `filmstrip.slide.${objects.slide1}`);
      await pollUntil(() => state(page), (s) => s.slideId === objects.slide1, 8000);
      await sleep(400);
      const all = await runs(page);
      const head = all.find((r) => /heading/.test(r)) ?? all[0];
      const el = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`);
      await clickAt(page, el.x + el.w / 2, el.y + el.h / 2);
      await sleep(300);
      const ctrls = await handleControls(page);
      const ring = await probe(page, '.ts-overlay .ts-select');
      const handle = await probe(page, '.ts-overlay .ts-handle[data-kind="free-resize"]', '::before');
      const handleBox = await probe(page, '.ts-overlay .ts-handle[data-kind="free-resize"]');
      const rot = await probe(page, '.ts-overlay .ts-handle[data-kind="free-rotate"]', '::before');
      const rotBox = await probe(page, '.ts-overlay .ts-handle[data-kind="free-rotate"]');
      const c = await probe(page, '.ts-overlay .ts-select-chip');
      const sheet = await rectOf(page, SHEET);
      await S('overlay-selected', pad(sheet, 24, V.w, V.h));
      return { handles: ctrls.length, ring: ring ? { border: ring.border, color: ring.borderHex, contrast: ring.borderContrast } : null, handle: handle ? { drawn: `${Math.round(handle.box.w)}x${Math.round(handle.box.h)}`, hit: `${Math.round(handleBox.box.w)}x${Math.round(handleBox.box.h)}`, border: handle.borderHex, bg: handle.background, cursor: handleBox.cursor, ariaLabel: handleBox.ariaLabel } : null, rotate: rot ? { drawn: `${Math.round(rot.box.w)}x${Math.round(rot.box.h)}`, hit: `${Math.round(rotBox.box.w)}x${Math.round(rotBox.box.h)}`, radius: rot.radius, ariaLabel: rotBox.ariaLabel } : null, chip: c ? { text: c.text, h: c.height, font: c.font, bg: c.ownBgRgb, color: c.colorHex, contrast: c.textContrast, cursor: c.cursor, radius: c.radius } : null };
    });
    await step(table, 'overlay', `${tag} the hover outline over the body placeholder`, async () => {
      const all = await runs(page);
      const body = all.find((r) => !/heading/.test(r));
      const el = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${body}"]`);
      if (!el) return 'no body run';
      await hoverAt(page, el.x + el.w / 2, el.y + el.h / 2, 300);
      const h = await probe(page, '.ts-overlay .ts-hover');
      return h ? { border: h.border, animation: h.animation, box: `${Math.round(h.box.w)}x${Math.round(h.box.h)}` } : 'no hover outline';
    });
    await step(table, 'overlay', `${tag} resize by the se handle: the readout during the drag`, async () => {
      const ctrls = await handleControls(page);
      const se = ctrls.find((c) => /resize\.se$/.test(c));
      if (!se) return 'no se handle';
      const hr = await rectOf(page, `.ts-overlay [data-control="${se}"]`);
      const from = { x: hr.x + hr.w / 2, y: hr.y + hr.h / 2 };
      const to = { x: from.x - 120, y: from.y - 40 };
      const facts = await drag(page, from, to, { during: async () => { const ro = await probe(page, '.ts-readout'); const sheet = await rectOf(page, SHEET); await shot(page, `${tag}-overlay-resize-readout`, pad(sheet, 24, V.w, V.h)); return ro ? { text: ro.text, h: ro.height, font: ro.font, bg: ro.ownBgRgb, color: ro.colorHex, contrast: ro.textContrast, x: Math.round(ro.box.x), y: Math.round(ro.box.y) } : 'no readout during the drag'; } });
      await sleep(400);
      const after = await readout(page);
      await press(page, 'Meta+z');
      await sleep(500);
      await settled(page);
      return { during: facts, afterRelease: after };
    });
    await step(table, 'overlay', `${tag} the sheet on the plate ground`, async () => {
      const stage = await probe(page, '.pt-stagewrap');
      const sheet = await probe(page, SHEET);
      return { stageBg: stage.ownBgRgb, stageGroundContrast: stage.groundContrast, sheetBg: sheet?.ownBgRgb, sheetBorder: sheet?.border, sheetShadow: await page.evaluate((s) => getComputedStyle(document.querySelector(s)).boxShadow, SHEET), sheetBox: sheet ? `${Math.round(sheet.box.w)}x${Math.round(sheet.box.h)}` : null, margins: sheet && stage ? { left: Math.round(sheet.box.x - stage.box.x), top: Math.round(sheet.box.y - stage.box.y), right: Math.round(stage.box.x + stage.box.w - sheet.box.x - sheet.box.w), bottom: Math.round(stage.box.y + stage.box.h - sheet.box.y - sheet.box.h) } : null };
    });

    // ---- the objects and the tails
    if (gone()) throw new Error('the page is gone');
    const goto = async (slideId) => { await surfaceClear(page); await clickControl(page, `filmstrip.slide.${slideId}`); await pollUntil(() => state(page), (s) => s.slideId === slideId, 8000); await sleep(400); };
    const park = async (slideId, id, pos) => { for (let a = 0; a < 2; a += 1) { const s = await state(page); try { await invoke(page, 'block.set', { baseRevision: s.revision, slideId, blockId: id, path: '/pos', value: pos }); await settled(page); return; } catch (e) { if (a === 1) throw e; await settled(page); } } };
    const selectAndTail = async (kind, id, slideId, expectControl) => {
      await goto(slideId);
      let sel = await clickSelect(page, id).catch(() => null);
      if (!sel || !sel.ctrls.some((c) => c.startsWith(`handle.${id}.`))) { await press(page, 'Escape', 2); await sleep(200); const b = await boxOf(page, id); if (b) { await clickAt(page, b.free.x + 4, b.free.y + 4); await sleep(250); sel = { ctrls: await handleControls(page), chip: await chip(page), ring: await has(page, '.ts-overlay .ts-select') }; } }
      if (await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null)) { await press(page, 'Escape'); await sleep(200); }
      await sleep(300);
      const tb = await toolbarFacts(page);
      await S(`toolbar-tail-${kind}`, pad({ x: 0, y: 72, w: V.w, h: 40 }, 0, V.w, V.h));
      const sheet = await rectOf(page, SHEET);
      if (run.full) await S(`object-${kind}-selected`, pad(sheet, 24, V.w, V.h));
      return { selected: sel?.ctrls.some((c) => c.startsWith(`handle.${id}.`)) ?? false, chip: sel?.chip, tail: expectControl ? tb.ctrls.some((c) => c.id === expectControl) : null, toolbar: tb };
    };
    if (run.full && !objects.text) {
      await step(table, 'objects', `${tag} insert a text box, a rectangle, a line, a picture (slide 2)`, async () => {
        await goto(objects.slide2);
        const text = await insertByTool(page, objects.slide2, ['insert.textBox'], { x: 1200, y: 760 }, null, 'text');
        if (text) { objects.text = text.id; if (await page.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null)) { await typeHuman(page, 'Pricing note'); } await press(page, 'Escape', 2); await settled(page); await park(objects.slide2, text.id, { x: 80, y: 600, w: 400, h: 100 }); }
        const shape = await insertByTool(page, objects.slide2, ['insert.shape', 'insert.shape.shapes', 'insert.shape.shapes.rectangle'], { x: 700, y: 760 }, null, 'shape');
        if (shape) { objects.shape = shape.id; await press(page, 'Escape', 2); await settled(page); await park(objects.slide2, shape.id, { x: 560, y: 600, w: 300, h: 160 }); }
        const line = await insertByTool(page, objects.slide2, ['insert.line', 'insert.line.line'], { x: 960, y: 620 }, { x: 1300, y: 720 }, null);
        if (line && line.id !== objects.shape) { objects.line = line.id; await press(page, 'Escape', 2); await settled(page); }
        // the picture through the window API (the walk's own setup write): asset.add then block.insert
        const s0 = await state(page);
        const asset = await invoke(page, 'asset.add', { id: `shot-audit-${Date.now().toString(36)}-asset`, url: pngDataUrl(96, 64), role: 'capture', alt: 'audit picture', baseRevision: s0.revision });
        await settled(page);
        const s1 = await state(page);
        const before = (await objectsOf(page, objects.slide2)).map((o) => o.id);
        const picId = `shot-audit-${Date.now().toString(36)}`;
        await invoke(page, 'block.insert', { slideId: objects.slide2, slot: 'main', block: { id: picId, type: 'shot', asset: asset.id, pos: { x: 1160, y: 80, w: 320, h: 200 } }, baseRevision: Math.max(s1.revision, asset.revision ?? 0) });
        const pic = await newObjectAfter(page, objects.slide2, before, 20_000, 'shot');
        await settled(page);
        if (pic) objects.picture = pic.id;
        return { text: objects.text, shape: objects.shape, line: objects.line, picture: objects.picture, objects: (await objectsOf(page, objects.slide2)).map((o) => `${o.type}:${o.id}@${Math.round(o.pos.x)},${Math.round(o.pos.y)} ${Math.round(o.pos.w)}x${Math.round(o.pos.h)}`) };
      });
      await step(table, 'objects', `${tag} insert a table (slide 3) and a chart (slide 4)`, async () => {
        await clickControl(page, 'toolbar.newSlide');
        await pollUntil(() => state(page), (s) => s.slideId !== objects.slide2, 10_000);
        await settled(page);
        objects.slide3 = (await state(page)).slideId;
        await openMenu(page, 'insert');
        await hoverRow(page, 'insert.table', '[data-control$=".pick.3x3"], [data-control$="pick.3x3"]').catch(() => undefined);
        const pick = await page.evaluate(() => [...document.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')).find((c) => /pick\.3x3$/.test(c)) ?? null);
        let tableId = null;
        if (pick) {
          const before = (await objectsOf(page, objects.slide3)).map((o) => o.id);
          await clickControl(page, pick);
          await sleep(500);
          let obj = await newObjectAfter(page, objects.slide3, before, 4000, 'table');
          if (!obj) { const p = await sheetPoint(page, 800, 500); await clickAt(page, p.x, p.y); obj = await newObjectAfter(page, objects.slide3, before, 15_000, 'table'); }
          tableId = obj?.id ?? null;
          await press(page, 'Escape', 2);
          await settled(page);
        }
        objects.table = tableId;
        await clickControl(page, 'toolbar.newSlide');
        await pollUntil(() => state(page), (s) => s.slideId !== objects.slide3, 10_000);
        await settled(page);
        objects.slide4 = (await state(page)).slideId;
        const before4 = (await objectsOf(page, objects.slide4)).map((o) => o.id);
        await openMenu(page, 'insert');
        await hoverRow(page, 'insert.chart', '[data-control="menu.insert.chart.bar"]');
        await clickRowSafe(page, 'insert.chart.bar');
        await sleep(600);
        let chartObj = await newObjectAfter(page, objects.slide4, before4, 5000, 'chart');
        if (!chartObj) { const p = await sheetPoint(page, 800, 500); await clickAt(page, p.x, p.y); chartObj = await newObjectAfter(page, objects.slide4, before4, 15_000, 'chart'); }
        objects.chart = chartObj?.id ?? null;
        await press(page, 'Escape', 2);
        await settled(page);
        return { pick, table: objects.table, chart: objects.chart, slide3: objects.slide3, slide4: objects.slide4 };
      });
    }
    for (const [kind, id, slideId, expect] of [
      ['text', objects.text, objects.slide2, 'toolbar.bold'],
      ['shape', objects.shape, objects.slide2, 'toolbar.fillColor'],
      ['line', objects.line, objects.slide2, 'toolbar.lineColor'],
      ['picture', objects.picture, objects.slide2, 'toolbar.cropImage'],
      ['table', objects.table, objects.slide3, 'toolbar.borderColor'],
      ['chart', objects.chart, objects.slide4, 'toolbar.chartType'],
    ]) {
      if (!id) { table.add('tails', `${tag} the ${kind} tail`, 'not driven: the object was not inserted'); continue; }
      await step(table, 'tails', `${tag} the ${kind} tail`, async () => {
        const f = await selectAndTail(kind, id, slideId, expect);
        const disabled = f.toolbar.ctrls.filter((c) => c.disabled).map((c) => c.id);
        return { selected: f.selected, chip: f.chip, expected: f.tail, count: f.toolbar.count, overflow: f.toolbar.overflow, clipped: f.toolbar.clipped, more: f.toolbar.more, gaps: f.toolbar.gaps, heights: f.toolbar.heights, disabled, widths: f.toolbar.widths, lastRight: f.toolbar.ctrls[f.toolbar.ctrls.length - 1]?.right, barRight: f.toolbar.bar.right, seps: f.toolbar.seps.length };
      });
    }
    if (objects.text) {
      await step(table, 'tails', `${tag} the text tail's controls up close`, async () => {
        await goto(objects.slide2);
        await clickSelect(page, objects.text);
        await sleep(300);
        const font = await probe(page, '[data-control="toolbar.font"]');
        const size = await probe(page, '.ts-tb-size-field');
        const step1 = await probe(page, '.ts-tb-size-step');
        const bold = await probe(page, '[data-control="toolbar.bold"]');
        const color = await probe(page, '[data-control="toolbar.textColor"]');
        const align = await probe(page, '[data-control="toolbar.align"]');
        const fontTip = await tooltipOn(page, 'toolbar.font');
        // pressed: enter the session and press Cmd+B
        const b = await boxOf(page, objects.text);
        await dblclickAt(page, b.inner.x + b.inner.w / 2, b.inner.y + b.inner.h / 2);
        await sleep(300);
        await page.keyboard.press('Meta+A');
        await page.keyboard.press('Meta+B');
        await sleep(400);
        const boldOn = await probe(page, '[data-control="toolbar.bold"]');
        await S('toolbar-tail-text-bold-pressed', pad({ x: 0, y: 72, w: V.w, h: 40 }, 0, V.w, V.h));
        await page.keyboard.press('Meta+B');
        await sleep(200);
        await press(page, 'Escape', 2);
        await settled(page);
        return { font: font ? { text: font.text, w: Math.round(font.box.w), disabled: font.disabled, color: font.colorHex, contrast: font.textContrast, cursor: font.cursor, tip: fontTip } : 'absent', size: size ? { w: size.box.w, h: size.height, border: size.borderHex, borderContrast: size.borderContrast, font: size.font, value: await page.evaluate(() => document.querySelector('.ts-tb-size-field')?.value) } : null, sizeStepW: step1?.box.w, bold: bold ? { pressed: bold.pressed, color: bold.colorHex, border: bold.borderHex } : null, boldOn: boldOn ? { pressed: boldOn.pressed, color: boldOn.colorHex, border: boldOn.borderHex, borderContrast: boldOn.borderContrast, ownBg: boldOn.ownBgRgb } : null, colorSwatch: color ? { w: color.box.w, svg: color.svg } : null, align: align ? { w: align.box.w } : null };
      });
      await step(table, 'tails', `${tag} the text colour plate`, async () => {
        await clickSelect(page, objects.text);
        await sleep(200);
        const r = await rectOfControl(page, 'toolbar.textColor');
        if (!r) return 'no text colour control';
        await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
        await sleep(400);
        const plate = await probe(page, '.ts-tb-swatches, .ts-picker');
        const swatch = await probe(page, '.ts-tb-swatch, .ts-picker-tile');
        const facts = await page.evaluate(() => { const p = document.querySelector('.ts-tb-swatches, .ts-picker'); if (!p) return null; return { swatches: p.querySelectorAll('.ts-tb-swatch, .ts-picker-tile').length, hasHex: p.querySelector('input') !== null, hasCustom: /custom|\+/i.test(p.textContent), text: p.textContent.trim().slice(0, 120) }; });
        if (plate) await S('toolbar-color-plate', pad(plate.box, 24, V.w, V.h));
        await press(page, 'Escape');
        await sleep(200);
        return { plate: plate ? { w: plate.box.w, border: plate.borderHex, borderContrast: plate.borderContrast } : null, swatch: swatch ? { size: `${swatch.box.w}x${swatch.box.h}`, border: swatch.borderHex, tip: swatch.tip, title: swatch.title, ariaLabel: swatch.ariaLabel } : null, ...facts };
      });
    }

    // ---- the Format options panel
    if (gone()) throw new Error('the page is gone');
    await step(table, 'panel', `${tag} Format options for the text box`, async () => {
      if (objects.text) { await goto(objects.slide2); await clickSelect(page, objects.text); await sleep(200); }
      if (await has(page, '[data-control="toolbar.formatOptions"]')) await clickControl(page, 'toolbar.formatOptions'); else await menuPath(page, 'format', 'format.formatOptions');
      await page.locator('.ts-rpanel .ts-panel').waitFor({ timeout: 8000 });
      await sleep(500);
      const f = await panelFacts(page);
      const head = await probe(page, '.ts-rpanel .ts-panel-head');
      const title = await probe(page, '.ts-rpanel .ts-panel-title');
      const x = await probe(page, '.ts-rpanel .ts-panel-x');
      const secHead = await probe(page, '.ts-rpanel .ts-panel-section-head');
      const label = await probe(page, '.ts-rpanel .ts-fo-field-label, .ts-rpanel .ts-insp-label');
      const input = await probe(page, '.ts-rpanel .ts-fo-field input, .ts-rpanel .ts-insp-field input');
      const rowLabel = await probe(page, '.ts-rpanel .ts-insp-label-text');
      const panelLeft = await probe(page, '.ts-rpanel .ts-panel');
      await S('panel-format-options-text');
      return { ...f, head: head ? { h: head.height, border: head.border } : null, title: title ? { text: title.text, font: title.font } : null, x: x ? { size: `${x.box.w}x${x.box.h}`, tip: x.tip, ariaLabel: x.ariaLabel } : null, sectionHead: secHead ? { text: secHead.text, h: secHead.height, font: secHead.font, chevron: secHead.svg } : null, label: label ? { font: label.font, color: label.colorHex, contrast: label.textContrast } : null, rowLabel: rowLabel ? { font: rowLabel.font, color: rowLabel.colorHex, contrast: rowLabel.textContrast } : null, input: input ? { h: input.height, border: input.borderHex, borderContrast: input.borderContrast, font: input.font } : null, panelBorder: panelLeft?.borderWidths, panelBorderHex: panelLeft?.borderHex };
    });
    await step(table, 'panel', `${tag} a section closes and the body scrolls`, async () => {
      const heads = await probeAll(page, '.ts-rpanel .ts-panel-section-head', 8);
      if (heads.length === 0) return 'no sections';
      const h = heads[0];
      await clickAt(page, h.box.x + 40, h.box.y + h.box.h / 2);
      await sleep(400);
      const after = await panelFacts(page);
      await clickAt(page, h.box.x + 40, h.box.y + h.box.h / 2);
      await sleep(300);
      const body = await page.evaluate(() => { const b = document.querySelector('.ts-rpanel .ts-panel-body'); return b ? { scrollH: b.scrollHeight, clientH: b.clientHeight, overflowY: getComputedStyle(b).overflowY, scrollClass: b.className } : null; });
      return { firstClosedAfterClick: after?.sections?.[0]?.closed, body, chevronTransition: await page.evaluate(() => { const c = document.querySelector('.ts-rpanel .ts-panel-chev'); return c ? getComputedStyle(c).transition : null; }) };
    });
    for (const [kind, id, slideId] of [['shape', objects.shape, objects.slide2], ['picture', objects.picture, objects.slide2], ['table', objects.table, objects.slide3], ['chart', objects.chart, objects.slide4]]) {
      if (!id || !run.full) continue;
      await step(table, 'panel', `${tag} Format options for the ${kind}`, async () => {
        await goto(slideId);
        await clickSelect(page, id);
        await sleep(500);
        if (!(await has(page, '.ts-rpanel .ts-panel'))) { if (await has(page, '[data-control="toolbar.formatOptions"]')) await clickControl(page, 'toolbar.formatOptions'); else await menuPath(page, 'format', 'format.formatOptions'); await sleep(500); }
        const f = await panelFacts(page);
        await S(`panel-format-options-${kind}`, await clipOf('.ts-rpanel', 0));
        return { title: f?.title, sections: f?.sections, notice: f?.notice, rows: f?.rows, fields: f?.fields, scrolls: f?.bodyScrolls };
      });
    }
    await step(table, 'panel', `${tag} nothing selected: the panel's empty sentence`, async () => {
      await goto(objects.slide2 ?? objects.slide1);
      const stage = await rectOf(page, '.pt-stagewrap');
      await clickAt(page, stage.x + 12, stage.y + stage.h - 12);
      await sleep(400);
      const f = await panelFacts(page);
      await S('panel-format-options-empty', await clipOf('.ts-rpanel', 0));
      return { title: f?.title, empty: f?.empty, notice: f?.notice, sections: f?.sections?.map((s) => `${s.text}${s.disabled ? ' (disabled)' : ''}`) };
    });
    await step(table, 'panel', `${tag} close the panel by its X`, async () => { await clickControl(page, 'panel.close').catch(async () => { const x = await rectOf(page, '.ts-rpanel .ts-panel-x'); await clickAt(page, x.x + x.w / 2, x.y + x.h / 2); }); await sleep(400); return { open: await has(page, '.ts-rpanel .ts-panel') }; });

    // ---- the other panels
    if (gone()) throw new Error('the page is gone');
    await step(table, 'panel', `${tag} Themes panel`, async () => {
      await menuPath(page, 'slide', 'slide.changeTheme');
      await page.locator('.ts-rpanel .ts-panel').waitFor({ timeout: 8000 });
      await sleep(600);
      const f = await panelFacts(page);
      const tile = await probe(page, '.ts-themes-tile');
      const frame = await probe(page, '.ts-themes-frame');
      const name = await probe(page, '.ts-themes-name');
      const head = await probe(page, '.ts-themes-head');
      const tiles = await page.evaluate(() => document.querySelectorAll('.ts-themes-tile').length);
      const importBtn = await probe(page, '.ts-rpanel .pt-ib.is-disabled, .ts-rpanel button:disabled');
      await S('panel-themes', await clipOf('.ts-rpanel', 0));
      const x = await rectOf(page, '.ts-rpanel .ts-panel-x');
      if (x) await clickAt(page, x.x + x.w / 2, x.y + x.h / 2);
      return { title: f?.title, tiles, tile: tile ? { w: tile.box.w, h: tile.box.h } : null, frame: frame ? { size: `${Math.round(frame.box.w)}x${Math.round(frame.box.h)}`, border: frame.borderHex, outline: frame.outline } : null, name: name ? { text: name.text, font: name.font, color: name.colorHex, contrast: name.textContrast } : null, groupHead: head ? { text: head.text, font: head.font, contrast: head.textContrast } : null, importButton: importBtn ? { text: importBtn.text, color: importBtn.colorHex, contrast: importBtn.textContrast } : null, empty: f?.empty };
    });
    await step(table, 'panel', `${tag} Comments panel (empty)`, async () => {
      const r = await rectOf(page, '[data-control="title.comments.slot"] .pt-ib');
      if (!r) return 'no comments toggle in the title row';
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await page.locator('.ts-rpanel .ts-panel').waitFor({ timeout: 8000 });
      await sleep(500);
      const f = await panelFacts(page);
      const toggle = await probe(page, '[data-control="title.comments.slot"] .pt-ib');
      const empty = await probe(page, '.ts-rpanel .ts-panel-empty, .ts-rpanel .ts-comments-empty');
      const body = await page.evaluate(() => document.querySelector('.ts-rpanel .ts-panel-body')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300));
      await S('panel-comments-empty', await clipOf('.ts-rpanel', 0));
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      return { title: f?.title, count: f?.count, empty: empty ? { text: empty.text, font: empty.font, color: empty.colorHex, contrast: empty.textContrast } : null, body, togglePressed: toggle?.pressed, toggleBorder: toggle?.borderHex, controls: f?.controls, closedByToggle: !(await has(page, '.ts-rpanel .ts-panel')) };
    });
    await step(table, 'panel', `${tag} Version history panel`, async () => {
      await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
      await page.locator('.ts-rpanel .ts-panel').waitFor({ timeout: 8000 });
      await sleep(800);
      const f = await panelFacts(page);
      const row = await probe(page, '.ts-version');
      const meta = await probe(page, '.ts-version-meta');
      const note = await probe(page, '.ts-version-note');
      const named = await probe(page, '.ts-versions-named');
      const field = await probe(page, '.ts-versions-note');
      const restore = await probe(page, '.ts-version .pt-ib');
      const body = await page.evaluate(() => document.querySelector('.ts-rpanel .ts-panel-body')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300));
      const rows = await page.evaluate(() => document.querySelectorAll('.ts-version').length);
      await S('panel-version-history', await clipOf('.ts-rpanel', 0));
      const x = await rectOf(page, '.ts-rpanel .ts-panel-x');
      if (x) await clickAt(page, x.x + x.w / 2, x.y + x.h / 2);
      return { title: f?.title, rows, row: row ? { h: row.height } : null, note: note ? { text: note.text, font: note.font, contrast: note.textContrast } : null, meta: meta ? { text: meta.text, font: meta.font, color: meta.colorHex, contrast: meta.textContrast } : null, named: named?.text, field: field ? { radius: field.radius, h: field.height, placeholder: await page.evaluate(() => document.querySelector('.ts-versions-note')?.placeholder) } : null, restore: restore ? { text: restore.text, h: restore.height } : null, body, empty: f?.empty };
    });

    // ---- the layout picker
    if (gone()) throw new Error('the page is gone');
    await step(table, 'plates', `${tag} the Layout picker`, async () => {
      await goto(objects.slide1);
      await clickControl(page, 'toolbar.layout');
      await page.locator('.ts-layout-plate, .ts-layout-grid').first().waitFor({ timeout: 8000 });
      await sleep(600);
      const plate = await probe(page, '.ts-layout-plate');
      const grid = await probe(page, '.ts-layout-grid');
      const tile = await probe(page, '.ts-layout-tile');
      const frame = await probe(page, '.ts-layout-frame');
      const name = await probe(page, '.ts-layout-name');
      const rule = await probe(page, '.ts-layout-rule');
      const head = await probe(page, '.ts-layout-plate-head');
      const facts = await page.evaluate(() => { const p = document.querySelector('.ts-layout-plate'); const tiles = [...document.querySelectorAll('.ts-layout-tile')]; return { tiles: tiles.length, current: tiles.findIndex((t) => t.classList.contains('is-current')), fits: p ? p.getBoundingClientRect().bottom <= window.innerHeight : null, scrolls: p ? p.scrollHeight > p.clientHeight + 1 : null, plateBottom: p ? Math.round(p.getBoundingClientRect().bottom) : null, headText: document.querySelector('.ts-layout-plate-head')?.textContent?.trim(), missing: document.querySelectorAll('.ts-layout-missing').length }; });
      const t2 = await rectOf(page, '.ts-layout-tile:nth-child(2) .ts-layout-frame');
      if (t2) await hoverAt(page, t2.x + t2.w / 2, t2.y + t2.h / 2, 300);
      const hovered = t2 ? await probe(page, '.ts-layout-tile:nth-child(2) .ts-layout-frame') : null;
      if (plate) await S('plate-layout', pad(plate.box, 16, V.w, V.h));
      await press(page, 'Escape');
      await sleep(200);
      return { ...facts, plate: plate ? { w: Math.round(plate.box.w), h: Math.round(plate.box.h), border: plate.borderHex, pad: plate.padding } : null, gridW: grid?.box.w, tile: tile ? `${tile.box.w}x${Math.round(tile.box.h)}` : null, frame: frame ? { size: `${frame.box.w}x${frame.box.h}`, border: frame.borderHex, borderContrast: frame.borderContrast } : null, name: name ? { text: name.text, font: name.font, color: name.colorHex, contrast: name.textContrast } : null, rule: rule ? { text: rule.text, font: rule.font, contrast: rule.textContrast } : null, head: head ? { font: head.font, contrast: head.textContrast } : null, hoveredBorder: hovered?.borderHex, closedByEscape: !(await has(page, '.ts-layout-plate')) };
    });

    // ---- the dialogs
    if (gone()) throw new Error('the page is gone');
    const D = (name, open) => step(table, 'dialogs', `${tag} ${name}`, () => dialogFacts(page, tag, name, open, S));
    await D('share', () => clickControl(page, 'share.open'));
    await D('download', () => menuPath(page, 'file', 'file.download', 'file.download.pdf'));
    await D('details', () => menuPath(page, 'file', 'file.details'));
    await D('slide-numbers', () => menuPath(page, 'insert', 'insert.slideNumbers'));
    await D('shortcuts', () => menuPath(page, 'help', 'help.keyboardShortcuts'));
    if (run.full) await D('help', () => menuPath(page, 'help', 'help.help'));
    await step(table, 'dialogs', `${tag} the Share dialog's body up close`, async () => {
      await surfaceClear(page);
      await clickControl(page, 'share.open');
      await page.locator('[data-control="dialog.share"]').waitFor({ timeout: 8000 });
      await sleep(700);
      const facts = await page.evaluate(() => { const root = document.querySelector('[data-control="dialog.share"]'); const vis = (e) => e.getClientRects().length > 0; const ctrls = [...root.querySelectorAll('[data-control]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-control').replace('dialog.share.', ''), h: Math.round(r.height), w: Math.round(r.width), tag: e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 40) }; }); const heights = [...new Set(ctrls.filter((c) => /button|select|input/.test(c.tag)).map((c) => c.h))]; return { controls: ctrls.slice(0, 40), controlHeights: heights, text: root.textContent.trim().replace(/\s+/g, ' ').slice(0, 600) }; });
      const emails = await probe(page, '[data-control="dialog.share.emails"]');
      const role = await probe(page, '[data-control="dialog.share.inviteRole"]');
      const send = await probe(page, '[data-control="dialog.share.send"]');
      const done = await probe(page, '[data-control="dialog.share.done"]');
      const copy = await probe(page, '[data-control$=".copy"]');
      const footer = await probe(page, '[data-control="dialog.share.footer"]');
      const general = await probe(page, '[data-control="dialog.share.general"]');
      await surfaceClear(page);
      return { ...facts, emails: emails ? { h: emails.height, border: emails.borderHex, borderContrast: emails.borderContrast, placeholder: await page.evaluate(() => document.querySelector('[data-control="dialog.share.emails"]')?.placeholder ?? null) } : null, role: role ? { h: role.height, tag: role.tag } : null, send: send ? { text: send.text, solid: /is-solid/.test(send.cls), h: send.height, disabled: send.disabled } : null, done: done ? { text: done.text, solid: /is-solid/.test(done.cls), h: done.height } : null, copy: copy ? { text: copy.text, h: copy.height } : null, footer: footer ? { text: footer.text, font: footer.font, contrast: footer.textContrast } : null, general: general ? { text: general.text.slice(0, 120) } : null };
    });

    // ---- the notes pane and the bottom bar
    if (gone()) throw new Error('the page is gone');
    await P('notes', 'pane', '.ts-notes');
    await P('notes', 'field', '.ts-notes-field');
    await P('notes', 'placeholder', '.ts-notes-field::placeholder');
    await P('notes', 'handle', '.ts-notes-handle');
    await step(table, 'notes', `${tag} type a note and the handle hover`, async () => {
      const r = await rectOf(page, '.ts-notes-field');
      if (!r) return 'no notes field';
      const ph = await page.evaluate(() => document.querySelector('.ts-notes-field')?.placeholder ?? null);
      await clickAt(page, r.x + 60, r.y + r.h / 2);
      await typeHuman(page, 'Open with the renewal number.');
      await sleep(600);
      await settled(page);
      const focused = await probe(page, '.ts-notes-field');
      const h = await rectOf(page, '.ts-notes-handle');
      await hoverAt(page, h.x + h.w / 2, h.y + h.h / 2, 300);
      const handle = await probe(page, '.ts-notes-handle');
      await S('notes', pad({ x: r.x - 8, y: r.y - 24, w: r.w + 16, h: r.h + 32 }, 0, V.w, V.h));
      await clickAt(page, r.x + 60, r.y + r.h / 2);
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');
      await sleep(400);
      await press(page, 'Escape');
      return { placeholder: ph, fieldOutlineWhileFocused: focused.outline, fieldFocusVisible: focused.focusVisible, handle: { size: `${h.w}x${h.h}`, color: handle.colorHex, cursor: handle.cursor, tip: handle.tip, title: handle.title, ariaLabel: handle.ariaLabel }, paneH: (await rectOf(page, '.ts-notes'))?.h };
    });
    await P('bottom', 'bar', '.ts-bottombar');
    await step(table, 'bottom', `${tag} the bottom bar's buttons`, async () => {
      const btns = await probeAll(page, '.ts-bottombar .pt-ib, .ts-bottombar button', 8);
      const tips = {};
      for (const b of btns) if (b.control) tips[b.control] = await tooltipOn(page, b.control);
      await S('bottom-bar', pad({ x: 0, y: V.h - 32, w: V.w, h: 32 }, 0, V.w, V.h));
      return btns.map((b) => ({ ctl: b.control, size: `${b.box.w}x${b.box.h}`, svg: b.svg, tip: b.tip, title: b.title, ariaLabel: b.ariaLabel, color: b.colorHex, contrast: b.textContrast, pressed: b.pressed, tooltip: b.control ? tips[b.control] : null }));
    });

    // ---- right click menus on the sheet and on an object
    if (gone()) throw new Error('the page is gone');
    await step(table, 'context', `${tag} right click the empty sheet`, async () => {
      await goto(objects.slide1);
      const p = await sheetPoint(page, 1500, 860);
      await page.mouse.move(p.x - 20, p.y - 10);
      await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(300);
      const f = await contextFacts(page);
      if (f) await S('context-sheet', pad({ x: f.x - 8, y: f.y - 8, w: f.w + 16, h: f.h + 16 }, 8, V.w, V.h));
      await closeMenus(page);
      return f;
    });
    await step(table, 'context', `${tag} right click the text box`, async () => {
      if (!objects.text) return 'no text box';
      await goto(objects.slide2);
      const b = await boxOf(page, objects.text);
      await page.mouse.move(b.inner.x + 10, b.inner.y + 10);
      await page.mouse.click(b.inner.x + b.inner.w / 2, b.inner.y + b.inner.h / 2, { button: 'right' });
      await page.locator('.ts-context-menu').first().waitFor({ timeout: 6000 }).catch(() => undefined);
      await sleep(300);
      const f = await contextFacts(page);
      if (f) await S('context-object', pad({ x: f.x - 8, y: f.y - 8, w: f.w + 16, h: f.h + 16 }, 8, V.w, V.h));
      await closeMenus(page);
      return f;
    });

    // ---- the help card and the shortcuts key
    if (gone()) throw new Error('the page is gone');
    if (run.full) {
      await step(table, 'help', `${tag} the ? key`, async () => {
        await goto(objects.slide1);
        const stage = await rectOf(page, '.pt-stagewrap');
        await clickAt(page, stage.x + 12, stage.y + stage.h - 12);
        await press(page, 'Escape');
        await page.keyboard.press('Shift+Slash');
        await sleep(600);
        const help = await probe(page, '.pt-help-card');
        const dialog = await probe(page, '.ts-dialog-scrim [role="dialog"]');
        const title = await probe(page, '.pt-help-card h3, .ts-dialog-title');
        if (help || dialog) await S('help-card');
        await press(page, 'Escape');
        await sleep(300);
        return { helpCard: help ? { w: Math.round(help.box.w), h: Math.round(help.box.h), border: help.borderHex, pad: help.padding, font: help.font } : null, dialog: dialog ? { w: Math.round(dialog.box.w) } : null, title: title?.text, titleFont: title?.font, closed: !(await has(page, '.pt-help-card')) && !(await has(page, '.ts-dialog-scrim')) };
      });
    }

    // ---- the slideshow in place and the presenter view
    if (gone()) throw new Error('the page is gone');
    if (run.full) {
      await step(table, 'show', `${tag} Slideshow from the title row`, async () => {
        await goto(objects.slide1);
        await clickControl(page, 'present.open');
        await sleep(1200);
        const facts = await page.evaluate(() => { const s = document.querySelector('.ts-slideshow'); const root = document.querySelector('.pt-viewer'); const vis = (e) => e.getClientRects().length > 0; return { show: s !== null, present: root?.classList.contains('is-present'), controls: s ? [...s.querySelectorAll('[data-control]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-control'), size: `${Math.round(r.width)}x${Math.round(r.height)}`, text: e.textContent.trim().slice(0, 20), tip: e.getAttribute('data-tip') }; }) : [], classes: s ? [...new Set([...s.querySelectorAll('*')].map((e) => e.className.toString().split(' ')[0]).filter(Boolean))].slice(0, 40) : [], stageBg: getComputedStyle(document.querySelector('.pt-stagewrap')).backgroundColor, fullscreen: document.fullscreenElement !== null }; });
        await S('slideshow');
        await page.mouse.move(V.w / 2, V.h - 30);
        await sleep(700);
        const barShown = await page.evaluate(() => { const b = document.querySelector('.ts-slideshow .ts-present-bar, .ts-slideshow [class*="bar"]'); return b ? { cls: b.className, opacity: getComputedStyle(b).opacity, h: Math.round(b.getBoundingClientRect().height) } : null; });
        await S('slideshow-bar-hover');
        const bar = await probe(page, '.ts-slideshow .ts-present-bar, .ts-slideshow [class*="bar"]');
        const barBtn = await probe(page, '.ts-slideshow .ts-present-bar .pt-ib, .ts-slideshow button');
        await press(page, 'Escape');
        await sleep(800);
        return { ...facts, barShown, bar: bar ? { bg: bar.background, border: bar.border, radius: bar.radius, h: bar.height } : null, barBtn: barBtn ? { size: `${barBtn.box.w}x${barBtn.box.h}`, color: barBtn.colorHex, contrast: barBtn.textContrast, tip: barBtn.tip, title: barBtn.title } : null, backInEditor: await has(page, '.ts-menubar') };
      });
      await step(table, 'show', `${tag} the presenter view /present/<id>`, async () => {
        const t0 = Date.now();
        await page.goto(`${BASE}/present/${deckId}`, { waitUntil: 'commit' });
        let sk = null;
        for (let i = 0; i < 60; i += 1) { sk = await page.evaluate(() => document.querySelector('.ts-skeleton') !== null).catch(() => false); if (sk) break; if (await page.evaluate(() => document.querySelector('.ts-presenter:not(.ts-skeleton)') !== null).catch(() => false)) break; await sleep(30); }
        if (sk) await S('presenter-skeleton');
        await page.waitForSelector('.ts-presenter:not(.ts-skeleton), [data-control^="presenter"]', { timeout: 30_000 }).catch(() => undefined);
        await sleep(1500);
        await S('presenter');
        const facts = await page.evaluate(() => { const vis = (e) => e.getClientRects().length > 0; const ctrls = [...document.querySelectorAll('[data-control]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { id: e.getAttribute('data-control'), size: `${Math.round(r.width)}x${Math.round(r.height)}`, text: e.textContent.trim().slice(0, 24), font: cs.fontSize, tip: e.getAttribute('data-tip') }; }); const texts = [...document.querySelectorAll('h1,h2,h3,p,span,b,time')].filter(vis).map((e) => ({ tag: e.tagName.toLowerCase(), cls: e.className.toString().split(' ')[0], text: e.textContent.trim().slice(0, 40), font: getComputedStyle(e).fontSize + '/' + getComputedStyle(e).fontWeight, color: getComputedStyle(e).color })).slice(0, 40); return { title: document.title, root: document.querySelector('.ts-presenter')?.className ?? document.body.firstElementChild?.className, controls: ctrls.slice(0, 40), texts, bodyBg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') }; });
        const btn = await probe(page, '.ts-presenter .pt-ib, .ts-presenter button');
        const tabs = await probeAll(page, '.ts-presenter-tabs button, .ts-presenter-tabs .pt-ib, [role="tab"]', 6);
        const notes = await probe(page, '.ts-presenter-notes, [data-control="presenter.notes"], .ts-presenter [class*="notes"]');
        const clock = await probe(page, '.ts-presenter [class*="clock"], .ts-presenter time');
        return { ...facts, skeleton: sk, readyMs: Date.now() - t0, button: btn ? { size: `${btn.box.w}x${btn.box.h}`, contrast: btn.textContrast } : null, tabs: tabs.map((t) => ({ text: t.text, pressed: t.pressed, selected: t.ariaLabel, font: t.font })), notes: notes ? { font: notes.font, color: notes.colorHex, contrast: notes.textContrast, text: notes.text.slice(0, 60) } : null, clock: clock ? { font: clock.font, text: clock.text } : null };
      });
      await step(table, 'show', `${tag} the viewer /deck/<id>`, async () => {
        await page.goto(`${BASE}/deck/${deckId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pt-viewer[data-settled], .pt-toolbar', { timeout: 60_000 }).catch(() => undefined);
        await sleep(1200);
        await S('viewer');
        const bar = await probe(page, '.pt-toolbar');
        const ctrls = await page.evaluate(() => [...document.querySelectorAll('.pt-toolbar [data-control], .pt-toolbar .pt-ib')].filter((e) => e.getClientRects().length > 0).map((e) => ({ id: e.getAttribute('data-control') ?? e.className.split(' ').slice(-1)[0], text: e.textContent.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height), radius: getComputedStyle(e).borderRadius })));
        return { barH: bar?.height, ctrls };
      });
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
      await dismissPrompts(page);
    }

    // ---- motion and durations in one read
    if (gone()) throw new Error('the page is gone');
    await step(table, 'motion', `${tag} the transitions the chrome declares`, async () =>
      page.evaluate(() => {
        const read = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return `${cs.transitionProperty} ${cs.transitionDuration}${cs.animationName !== 'none' ? `; anim ${cs.animationName} ${cs.animationDuration}` : ''}`; };
        return { button: read('.ts-toolbar .pt-ib'), cardFrame: read('.ts-card-frame'), filmstrip: read('.pt-sb'), menubarTitle: read('.ts-menubar-title'), titleName: read('[data-control="deck.name"]'), stage: read('.pt-stagewrap'), slide: read('.pt-slide'), notesHandle: read('.ts-notes-handle'), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }));

    } catch (error) {
      table.add('run', `${tag} ended early`, `${error instanceof Error ? error.message.split('\n')[0] : String(error)}; page closed ${page.isClosed()}, browser connected ${browser.isConnected()}`, { error: true });
    }
    saveState({ deckId, objects });
    table.save({ deckId, objects, consoleErrors: [...new Set(consoleErrors)] });
    await context.close().catch(() => undefined);
  }
} finally {
  saveState({ deckId, objects });
  if (DESTROY) {
    const b2 = browser.isConnected() ? browser : await chromium.launch({ headless: true });
    const context = await newContext(b2, { width: 1440, height: 900, theme: 'light', storageState: existsSync(STORAGE_FILE) ? STORAGE_FILE : null });
    const page = await context.newPage();
    const result = await destroyDeck(page, deckId, (m) => table.add('trash', m, '', {}));
    table.add('trash', 'the scratch deck', result);
    await context.close();
    if (b2 !== browser) await b2.close();
  }
  if (browser.isConnected()) await browser.close();
  table.save({ deckId, objects, consoleErrors: [...new Set(consoleErrors)] });
  console.log(`\n${table.rows.length} rows; ${new Set(consoleErrors).size} distinct console errors; table ${table.file}`);
}

async function clickRowSafe(page, rowId) {
  const r = await rectOfControl(page, `menu.${rowId}`);
  if (!r) throw new Error(`no menu row ${rowId}`);
  await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
}

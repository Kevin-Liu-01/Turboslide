// The present, keys and small screen rows of the feature gaps audit: presenter view with notes,
// the laser and the pen, the show without the network, Google's editor chords, the editor and
// the viewer at 375 by 812, 768 by 1024 and 1280 by 800. One scratch deck from /new, trashed and
// deleted forever in the finally block.
//   node gaps-present.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, EVIDENCE, bind, chromium, cleanupDeck, launch, makeTable, newDeck, sleep } from './lib.mjs';

const table = makeTable('present');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
const extraBrowsers = [];
try {
  deck = await newDeck(t, 'Acme QBR: pipeline and renewal');
  table.record('a scratch deck from /new', 'the address moves to /edit/<id>', `${deck.id}; ${page.url().replace(BASE, '')}`, /\/edit\//.test(page.url()));
  const X = deck.titleSlide;
  await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);

  // ---- 1. notes and a second slide
  await t.step('Type a speaker note; New slide from the toolbar and a title on it', 'the note is stored; two slides', async () => {
    const field = await t.rectOf('[data-control="notes.text"]');
    await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
    await t.typeHuman('Open with the renewal date and the two new logos.');
    await t.press('Tab');
    await t.settled();
    const notes = (await t.slideJson(X)).notes ?? null;
    await t.clickControl('toolbar.newSlide');
    await t.settled();
    await sleep(800);
    const order = await t.slideIds();
    const second = order.find((id) => id !== X);
    const runs = await t.runs();
    if (runs[0]) { await t.openRun(runs[0]); await t.typeHuman('Pipeline by region'); await t.press('Escape', 2); await t.settled(); }
    return { ok: Boolean(notes) && order.length === 2, observed: `notes "${notes}"; slides ${order.join(',')}; second ${second}`, extra: { second } };
  });
  const card1 = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
  if (card1) await t.clickAt(card1.x + card1.w / 2, card1.y + card1.h / 2);
  await sleep(500);

  // ---- 2. Presenter view
  let presenter = null;
  await t.step('Slideshow arrow > Presenter view: the second window', 'a window with the notes, the next slide and a timer; the show in the first window', async () => {
    const arrow = await t.rectOf('[data-control="present.arrow"]');
    if (!arrow) return { ok: false, observed: 'no Slideshow arrow (present.arrow)' };
    await t.clickAt(arrow.x + arrow.w / 2, arrow.y + arrow.h / 2);
    await page.locator('[data-control="menu.title.slideshow.presenterView"]').waitFor({ timeout: 8000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.title.slideshow."]')].filter((el) => el.getClientRects().length > 0).map((el) => `${el.getAttribute('data-control').replace('menu.', '')}${el.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''}`));
    const shot0 = await t.shot('slideshow-arrow-menu');
    const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 15_000 }).catch(() => null), t.clickRow('title.slideshow.presenterView')]);
    if (!popup) return { ok: false, observed: `no second window; rows ${rows.join(',')}` };
    presenter = popup;
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForSelector('[data-control="presenter"]', { timeout: 30_000 });
    await sleep(3000);
    const facts = await popup.evaluate(() => ({
      url: location.pathname,
      counter: document.querySelector('[data-control="presenter.counter"]')?.textContent?.trim(),
      notes: document.querySelector('[data-control="presenter.notesText"]')?.textContent?.trim()?.slice(0, 120),
      elapsed: document.querySelector('[data-control="presenter.elapsed"]')?.textContent?.trim(),
      connection: document.querySelector('[data-control="presenter.connection"]')?.textContent?.trim(),
      frames: document.querySelectorAll('.ts-presenter iframe, .ts-presenter .pt-slide, .ts-presenter [data-slide]').length,
      controls: [...document.querySelectorAll('[data-control^="presenter."]')].map((el) => el.getAttribute('data-control')).filter((c, i, a) => a.indexOf(c) === i).join(','),
    }));
    const audience = await page.evaluate(() => ({ show: document.querySelector('.ts-slideshow') !== null || document.querySelector('[data-control="present.toolbar"]') !== null, url: location.pathname + location.search }));
    const f1 = table.shotName('presenter-console');
    await popup.screenshot({ path: f1 });
    const shot = await t.shot('audience-window');
    await popup.evaluate(() => document.querySelector('[data-control="presenter.next"]')?.click());
    await sleep(1200);
    const after = await t.state();
    return { ok: Boolean(facts.notes) && /renewal/.test(facts.notes), observed: `rows ${rows.join(',')}; presenter ${JSON.stringify(facts)}; audience ${JSON.stringify(audience)}; after Next in the console: editor slide ${after.slideId}; ${shot0}; ${path.basename(f1)}; ${shot}` };
  });
  if (presenter) await presenter.close().catch(() => undefined);
  await t.press('Escape');
  await sleep(600);

  // ---- 3. the show: laser, the pen, the options
  await t.step('Slideshow: L toggles the laser; the Options menu lists the pen', 'the laser dot draws; the pen row is a stub', async () => {
    await t.openShow();
    await page.mouse.move(700, 450);
    await t.press('l');
    await sleep(400);
    const laser = await t.has('[data-control="present.laserDot"]');
    const shot = await t.shot('show-laser');
    await t.press('l');
    await page.mouse.move(60, 880);
    await sleep(600);
    await page.mouse.move(80, 870);
    await sleep(600);
    const opts = await t.rectOf('[data-control="present.options"]');
    let rows = null;
    if (opts) {
      await t.clickAt(opts.x + opts.w / 2, opts.y + opts.h / 2);
      await sleep(600);
      rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.present.options"]')].filter((el) => el.getClientRects().length > 0).map((el) => ({ id: el.getAttribute('data-control').replace('menu.', ''), text: el.textContent?.trim(), disabled: el.getAttribute('aria-disabled') })));
    }
    const shot2 = await t.shot('show-options-menu');
    await t.press('Escape');
    await sleep(300);
    const stillShow = await t.has('.ts-slideshow, [data-control="present.toolbar"]');
    return { ok: laser, observed: `laser dot ${laser}; options ${JSON.stringify(rows)}; show still open after Escape on the menu ${stillShow}; ${shot}; ${shot2}` };
  });

  // ---- 4. the show without the network
  await t.step('Offline in the show: ArrowRight, ArrowLeft, a digit and Enter with the network off', 'the show keeps working after load without the network', async () => {
    if (!(await t.has('.ts-slideshow, [data-control="present.toolbar"], [data-control="present.blank"]'))) await t.openShow();
    await context.setOffline(true);
    await sleep(500);
    const s0 = await t.state();
    await t.press('ArrowRight');
    await sleep(700);
    const s1 = await t.state();
    await t.press('ArrowLeft');
    await sleep(700);
    const s2 = await t.state();
    const shot = await t.shot('show-offline');
    const snack = await t.snackbar();
    const words = await page.evaluate(() => document.body.textContent?.match(/offline|Offline|reconnect|Reconnecting|connection/g)?.slice(0, 5) ?? null);
    await context.setOffline(false);
    await sleep(1500);
    return { ok: s1.slideId !== s0.slideId && s2.slideId === s0.slideId, observed: `slide ${s0.slideId} -> ${s1.slideId} -> ${s2.slideId}; snackbar "${snack}"; words on the page ${JSON.stringify(words)}; ${shot}` };
  });
  await t.step('Reload the editor with the network off', 'what the page shows without the network', async () => {
    await t.press('Escape');
    await sleep(500);
    await context.setOffline(true);
    const res = await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch((e) => ({ error: String(e).split('\n')[0] }));
    await sleep(1500);
    const body = await page.evaluate(() => document.body?.textContent?.replace(/\s+/g, ' ').slice(0, 200)).catch((e) => `unreadable: ${String(e).split('\n')[0]}`);
    const shot = await t.shot('editor-reload-offline').catch(() => 'no shot');
    await context.setOffline(false);
    await page.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
    await t.settled();
    return { ok: true, observed: `reload ${res && res.error ? res.error : `status ${typeof res?.status === 'function' ? res.status() : 'n/a'}`}; body "${body}"; ${shot}` };
  });

  // ---- 5. Google's editor chords
  await t.step('Ctrl+M adds a slide; Cmd+D duplicates the selected card', 'both chords work as Google binds them', async () => {
    const before = (await t.slideIds()).length;
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await t.press('Control+m');
    await t.settled();
    await sleep(600);
    const afterM = (await t.slideIds()).length;
    const card2 = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    await t.clickAt(card2.x + card2.w / 2, card2.y + card2.h / 2);
    await t.press('Meta+d');
    await t.settled();
    await sleep(600);
    const afterD = (await t.slideIds()).length;
    return { ok: afterM === before + 1 && afterD === afterM + 1, observed: `slides ${before} -> ${afterM} after Ctrl+M -> ${afterD} after Cmd+D` };
  });
  await t.step('Cmd+Shift+H, Cmd+/, Alt+/, Cmd+Option+Shift+S, Cmd+Option+M', 'Find and replace, the shortcuts dialog, Search the menus, the notes focus, the comment card', async () => {
    const out = {};
    await t.press('Meta+Shift+h'); await sleep(600);
    out.findReplace = await t.visible('[data-control="dialog.findReplace.find"]');
    await t.closeDialogs();
    await t.press('Meta+Slash'); await sleep(600);
    out.shortcuts = await t.visible('[data-control="dialog.keyboardShortcuts"]');
    await t.closeDialogs();
    await t.press('Alt+Slash'); await sleep(600);
    out.searchMenus = await page.evaluate(() => { const el = document.querySelector('[data-control="finder"], [data-control="palette"], [data-control^="finder."], .ts-finder, .ts-palette, [role="combobox"][aria-label*="menus" i]'); return el ? (el.getAttribute('data-control') ?? el.className) : null; });
    await t.closeDialogs();
    await t.press('Meta+Alt+Shift+s'); await sleep(500);
    out.notesFocus = await t.activeDesc();
    await t.press('Escape');
    const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
    await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
    await sleep(400);
    await t.press('Meta+Alt+m'); await sleep(800);
    out.commentCard = await page.evaluate(() => [...document.querySelectorAll('[data-control$=".field"]')].some((el) => el.getClientRects().length > 0));
    const shot = await t.shot('chords');
    await t.closeDialogs();
    return { ok: out.findReplace && out.shortcuts && out.commentCard, observed: `${JSON.stringify(out)}; ${shot}` };
  });

  // ---- 6. small screens: the viewer and the editor at 375 by 812 and 768 by 1024; the editor at 1280 by 800
  const smallScreen = async (label, width, height, mobile) => {
    const b2 = await chromium.launch({ headless: true });
    extraBrowsers.push(b2);
    const ctx = await b2.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
    const p2 = await ctx.newPage();
    const readFacts = () => p2.evaluate(() => {
      const se = document.scrollingElement;
      const vis = (sel) => { const el = document.querySelector(sel); return el !== null && el.getClientRects().length > 0; };
      const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
      return {
        path: location.pathname,
        innerWidth: innerWidth,
        scrollWidth: se?.scrollWidth,
        horizontalOverflow: (se?.scrollWidth ?? 0) > innerWidth + 1,
        menubar: vis('[data-control="menubar.file"]'),
        toolbar: rect('[data-control="toolbar.newSlide"]'),
        filmstrip: vis('[data-control="filmstrip"]'),
        sheet: rect('.pt-slide'),
        notes: vis('[data-control="notes.text"]'),
        slideshow: vis('[data-control="present.open"]'),
        share: vis('[data-control="title.share"]'),
        more: vis('[data-control="toolbar.more"]'),
        moreCount: document.querySelectorAll('#ts-menu-toolbar-more [data-control]').length,
        viewerControls: [...document.querySelectorAll('[data-control^="viewer."], [data-control^="present."]')].map((el) => el.getAttribute('data-control')).filter((c, i, a) => a.indexOf(c) === i).slice(0, 12).join(','),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
        smallestTap: Math.min(...[...document.querySelectorAll('button')].filter((el) => el.getClientRects().length > 0).map((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height))),
      };
    });
    const out = {};
    await p2.goto(`${BASE}/deck/${deck.id}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('.pt-slide', { timeout: 30_000 }).catch(() => undefined);
    await sleep(2500);
    out.viewer = await readFacts();
    const f1 = table.shotName(`${label}-viewer`);
    await p2.screenshot({ path: f1 });
    if (mobile) {
      const s = await p2.evaluate(() => { const el = document.querySelector('.pt-slide'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (s) { await p2.touchscreen.tap(s.x, s.y); await sleep(900); }
      out.viewerAfterTap = await p2.evaluate(() => ({ counter: document.querySelector('[data-control="present.counter"], .counter')?.textContent?.trim() ?? null, path: location.pathname + location.search }));
    }
    await p2.goto(`${BASE}/edit/${deck.id}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 }).catch(() => undefined);
    await p2.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 }).catch(() => undefined);
    await sleep(2500);
    out.editor = await readFacts();
    const f2 = table.shotName(`${label}-editor`);
    await p2.screenshot({ path: f2 });
    if (!mobile && width === 1280) {
      // a text box selected: how many text controls the tail folds into More
      const head = await p2.evaluate(() => { const el = document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (head) { await p2.mouse.click(head.x, head.y); await sleep(500); await p2.keyboard.press('Escape'); await sleep(300); }
      out.tailAt1280 = await p2.evaluate(() => ({ visible: [...document.querySelectorAll('[data-control^="toolbar."]')].filter((el) => el.getClientRects().length > 0).length, more: document.querySelector('[data-control="toolbar.more"]') !== null, chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null }));
      const f3 = table.shotName(`${label}-editor-text-tail`);
      await p2.screenshot({ path: f3 });
      out.shot3 = path.basename(f3);
    }
    if (mobile) {
      const head = await p2.evaluate(() => { const el = document.querySelector('.ts-stagewrap.ts-editor .pt-slide [data-run]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (head) { await p2.touchscreen.tap(head.x, head.y); await sleep(600); }
      out.editorAfterTap = await p2.evaluate(() => ({ chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null, editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null, handles: document.querySelectorAll('.ts-overlay [data-control^="handle."]').length }));
      const f3 = table.shotName(`${label}-editor-tap`);
      await p2.screenshot({ path: f3 });
      out.shot3 = path.basename(f3);
    }
    await ctx.close();
    await b2.close();
    return { out, shots: [path.basename(f1), path.basename(f2)] };
  };
  await t.step('The viewer and the editor at 375 by 812 (a phone)', 'no horizontal overflow; the viewer pages by a tap; the editor is usable or says it is for larger screens', async () => {
    const { out, shots } = await smallScreen('phone-375', 375, 812, true);
    return { ok: !out.viewer.horizontalOverflow && !out.editor.horizontalOverflow, observed: `${JSON.stringify(out)}; ${shots.join('; ')}` };
  });
  await t.step('The viewer and the editor at 768 by 1024 (a tablet)', 'no horizontal overflow; the editor draws its rows', async () => {
    const { out, shots } = await smallScreen('tablet-768', 768, 1024, true);
    return { ok: !out.viewer.horizontalOverflow && !out.editor.horizontalOverflow, observed: `${JSON.stringify(out)}; ${shots.join('; ')}` };
  });
  await t.step('The editor at 1280 by 800 (a laptop)', 'the toolbar fits or folds into More; no horizontal overflow', async () => {
    const { out, shots } = await smallScreen('laptop-1280', 1280, 800, false);
    return { ok: !out.editor.horizontalOverflow, observed: `${JSON.stringify(out)}; ${shots.join('; ')}` };
  });

  table.record('console errors of the run', 'recorded', `${consoleErrors.length}: ${consoleErrors.slice(0, 6).join(' || ')}`, true);
} finally {
  for (const b of extraBrowsers) await b.close().catch(() => undefined);
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(path.join(EVIDENCE, 'present-console.json'), JSON.stringify(consoleErrors, null, 2));
  process.exitCode = out.failed > 0 ? 1 : 0;
}

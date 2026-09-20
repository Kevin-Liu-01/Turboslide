// The pages of the interface craft audit: /home, /decks, /decks/trash, /new (the skeleton and
// the first paint), the Not found page and the You need access page, at 1440 by 900 and 1280 by
// 800 in both appearances. Reads the grammar of every control (height, radius, type, colours,
// contrast), drives hover, focus and tooltip states, and keeps pictures under OUT.
//   node pages.mjs
import path from 'node:path';
import {
  BASE, PROBE_FN, SCRATCH, Table, attachConsole, chromium, clickAt, hoverAt, newContext, pad, press,
  probe, probeAll, rectOf, shot, sleep, step, tokens,
} from './lib.mjs';

const table = new Table(path.join(SCRATCH, 'pages-run.json'));
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });

const SIZES = [
  { w: 1440, h: 900, tag: '1440' },
  { w: 1280, h: 800, tag: '1280' },
];
const THEMES = ['light', 'dark'];

const summarize = (f) =>
  f
    ? {
        text: f.text, box: `${Math.round(f.box.w)}x${Math.round(f.box.h)} at ${Math.round(f.box.x)},${Math.round(f.box.y)}`, h: f.height, pad: f.padding, radius: f.radius,
        font: f.font, color: f.colorHex, ground: f.groundHex, textContrast: f.textContrast, border: f.border, borderHex: f.borderHex,
        borderContrast: f.borderContrast, outline: f.outline, transition: f.transition, cursor: f.cursor, svg: f.svg, tip: f.tip, title: f.title,
      }
    : null;

for (const size of SIZES) {
  for (const theme of THEMES) {
    const tag = `${size.tag}-${theme}`;
    const context = await newContext(browser, { width: size.w, height: size.h, theme });
    const page = await context.newPage();
    attachConsole(page, consoleErrors);
    const S = (name, clip = null) => shot(page, `${tag}-${name}`, clip);
    const P = async (surface, what, sel) => step(table, surface, `${tag} ${what}`, async () => summarize(await probe(page, sel)));

    // ---- /home
    await step(table, 'home', `${tag} load`, async () => {
      const t0 = Date.now();
      await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-product', { timeout: 30_000 });
      await sleep(600);
      const tk = await tokens(page);
      await S('home');
      return { ms: Date.now() - t0, theme: tk.theme, paper: tk['--pt-paper'], ink: tk['--pt-ink'], titanium: tk['--pt-titanium'] };
    });
    await P('home', 'nav lockup', '.ts-product-lockup');
    await P('home', 'nav link button', '.ts-product-nav-links .pt-ib');
    await step(table, 'home', `${tag} appearance group`, async () => {
      const btns = await probeAll(page, '.ts-product-appearance .pt-ib', 4);
      return btns.map((b) => ({ text: b.text, pressed: b.pressed, box: `${Math.round(b.box.w)}x${Math.round(b.box.h)}`, border: b.borderHex, borderContrast: b.borderContrast, color: b.colorHex, textContrast: b.textContrast, tip: b.tip }));
    });
    await P('home', 'h1', '.ts-product-h1');
    await P('home', 'hero cta solid', '.ts-product-cta .pt-ib.is-solid');
    await P('home', 'hero cta plain', '.ts-product-cta .pt-ib:not(.is-solid)');
    await P('home', 'hero facts', '.ts-product-hero-facts');
    await P('home', 'source line', '.ts-product-source');
    await P('home', 'caption', '.ts-product-caption');
    await step(table, 'home', `${tag} hover the plain cta`, async () => {
      const r = await rectOf(page, '.ts-product-cta .pt-ib:not(.is-solid)');
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 250);
      const f = await probe(page, '.ts-product-cta .pt-ib:not(.is-solid)');
      await S('home-cta-hover', pad(r, 24, size.w, size.h));
      return { hover: f.hover, border: f.borderHex, borderContrast: f.borderContrast, color: f.colorHex, ground: f.ownBgRgb };
    });
    await step(table, 'home', `${tag} hover the solid cta`, async () => {
      const r = await rectOf(page, '.ts-product-cta .pt-ib.is-solid');
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 250);
      const f = await probe(page, '.ts-product-cta .pt-ib.is-solid');
      await S('home-cta-solid-hover', pad(r, 24, size.w, size.h));
      return { hover: f.hover, border: f.borderHex, color: f.colorHex, ownBg: f.ownBgRgb, textContrast: f.textContrast };
    });
    await step(table, 'home', `${tag} tooltip on a nav button (delay)`, async () => {
      const r = await rectOf(page, '.ts-product-nav-links .pt-ib[data-tip]');
      if (!r) return 'no data-tip control in the nav';
      await page.mouse.move(r.x - 60, r.y + r.h / 2);
      await sleep(200);
      const t0 = Date.now();
      await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
      let shown = false;
      let at = 0;
      for (let i = 0; i < 40; i += 1) {
        await sleep(25);
        shown = await page.evaluate(() => { const t = document.getElementById('pt-tip'); return t !== null && !t.hidden && t.getClientRects().length > 0; });
        if (shown) { at = Date.now() - t0; break; }
      }
      const tip = shown ? await probe(page, '#pt-tip') : null;
      const name = shown ? await page.evaluate(() => document.querySelector('#pt-tip .pt-tip-name')?.textContent ?? null) : null;
      const doc = shown ? await page.evaluate(() => document.querySelector('#pt-tip .pt-tip-doc')?.textContent ?? null) : null;
      const key = shown ? await page.evaluate(() => document.querySelector('#pt-tip .pt-tip-key')?.textContent ?? null) : null;
      if (shown) await S('home-tooltip', pad({ x: r.x, y: r.y, w: r.w, h: r.h + 60 }, 40, size.w, size.h));
      return { shown, afterMs: at, name, key, doc, font: tip?.font, border: tip?.borderHex, borderContrast: tip?.borderContrast, radius: tip?.radius };
    });
    await step(table, 'home', `${tag} keyboard focus ring`, async () => {
      await page.mouse.move(size.w - 10, size.h - 10);
      await page.evaluate(() => document.body.focus());
      await press(page, 'Tab', 3);
      const f = await page.evaluate(`(${PROBE_FN})(document.activeElement)`);
      const r = f?.box;
      if (r) await S('home-focus', pad(r, 20, size.w, size.h));
      return f ? { on: f.control ?? f.cls, focusVisible: f.focusVisible, outline: f.outline, outlineContrast: f.outlineContrast } : 'no active element';
    });
    await step(table, 'home', `${tag} type ladder and titanium text`, async () => {
      const facts = {};
      for (const [k, sel] of Object.entries({ h2: '.ts-product-h2', h3: '.ts-product-h3', lead: '.ts-product-lead', body: '.ts-product-card-copy', small: '.ts-product-number-line', credit: '.ts-product-credit', figure: '.ts-product-figure' })) {
        const f = await probe(page, sel);
        facts[k] = f ? { font: f.font, color: f.colorHex, contrast: f.textContrast } : null;
      }
      return facts;
    });
    await step(table, 'home', `${tag} page scroll and band rhythm`, async () => {
      const facts = await page.evaluate(() => {
        const bands = [...document.querySelectorAll('.ts-product-band')].map((b) => { const cs = getComputedStyle(b); return cs.paddingTop + '/' + cs.paddingBottom; });
        return { scrollHeight: document.documentElement.scrollHeight, bands: [...new Set(bands)], nav: getComputedStyle(document.querySelector('.ts-product-nav')).height };
      });
      await page.evaluate(() => window.scrollTo(0, 1400));
      await sleep(300);
      await S('home-scrolled');
      await page.evaluate(() => window.scrollTo(0, 0));
      return facts;
    });

    // ---- /decks
    await step(table, 'decks', `${tag} load (the frames while the list streams)`, async () => {
      const t0 = Date.now();
      await page.goto(`${BASE}/decks`, { waitUntil: 'commit' });
      await page.waitForSelector('.ts-home-page', { timeout: 30_000 }).catch(() => undefined);
      const pendingAt = Date.now() - t0;
      const pending = await page.evaluate(() => ({ frames: document.querySelectorAll('.ts-hm-card-frame').length, hydrated: document.querySelector('.ts-home-page')?.hasAttribute('data-hydrated') ?? false, pendingBand: document.querySelector('.ts-recent[data-pending]') !== null }));
      await S('decks-loading');
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelectorAll('.ts-hm-card:not(.ts-hm-card-frame)').length > 0 || document.querySelector('.ts-home-empty-figure'), null, { timeout: 30_000 }).catch(() => undefined);
      await sleep(800);
      await S('decks');
      const cards = await page.evaluate(() => document.querySelectorAll('.ts-hm-card:not(.ts-hm-card-frame)').length);
      return { firstPaintMs: pendingAt, ...pending, cards, readyMs: Date.now() - t0 };
    });
    await P('decks', 'app bar', '.ts-appbar');
    await P('decks', 'search field', '.ts-appbar-search input');
    await P('decks', 'search placeholder', '.ts-appbar-search input::placeholder');
    await P('decks', 'lockup word', '.ts-brand-lockup-word');
    await P('decks', 'strip heading', '.ts-strip h2');
    await P('decks', 'template gallery link', '.ts-strip-gallery');
    await P('decks', 'template plate', '.ts-template-plate');
    await P('decks', 'template label', '.ts-template-label');
    await P('decks', 'recent heading', '.ts-recent h2');
    await P('decks', 'recent lead', '.ts-recent-lead');
    await P('decks', 'view seg button', '.ts-seg .pt-ib');
    await P('decks', 'sort select', '.ts-sort select');
    await P('decks', 'card', '.ts-hm-card:not(.ts-hm-card-frame)');
    await P('decks', 'card title', '.ts-hm-card:not(.ts-hm-card-frame) .ts-hm-card-title');
    await P('decks', 'card when', '.ts-hm-card:not(.ts-hm-card-frame) .ts-hm-card-when');
    await P('decks', 'card more button', '.ts-hm-card:not(.ts-hm-card-frame) .ts-hm-card-more');
    await step(table, 'decks', `${tag} card hover and the more button`, async () => {
      const r = await rectOf(page, '.ts-hm-card:not(.ts-hm-card-frame)');
      if (!r) return 'no card';
      await hoverAt(page, r.x + r.w / 2, r.y + r.h / 3, 250);
      const card = await probe(page, '.ts-hm-card:not(.ts-hm-card-frame):hover');
      const more = await probe(page, '.ts-hm-card:not(.ts-hm-card-frame):hover .ts-hm-card-more');
      await S('decks-card-hover', pad(r, 16, size.w, size.h));
      return { cardBorder: card?.borderHex, cardBorderContrast: card?.borderContrast, moreOpacity: more?.opacity, moreVisible: more ? more.box.w > 0 : null, cursor: card?.cursor };
    });
    await step(table, 'decks', `${tag} card menu`, async () => {
      const r = await rectOf(page, '.ts-hm-card:not(.ts-hm-card-frame) .ts-hm-card-more');
      if (!r) return 'no more button';
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(300);
      const rows = await probeAll(page, '.ts-menu .ts-menu-item', 12);
      const menu = await probe(page, '.ts-menu');
      await S('decks-card-menu', menu ? pad(menu.box, 24, size.w, size.h) : null);
      await press(page, 'Escape');
      return { menu: menu ? { w: menu.box.w, radius: menu.radius, border: menu.borderHex, borderContrast: menu.borderContrast, font: menu.font } : null, rows: rows.map((x) => ({ text: x.text, h: x.height, color: x.colorHex, contrast: x.textContrast, disabled: x.disabled })) };
    });
    await step(table, 'decks', `${tag} search with no match (empty state)`, async () => {
      const r = await rectOf(page, '.ts-appbar-search input');
      await clickAt(page, r.x + 80, r.y + r.h / 2);
      await page.keyboard.type('zqxjkvw no such deck', { delay: 55 });
      await sleep(700);
      const empty = await probe(page, '.ts-home-empty-figure, .ts-empty');
      const title = await probe(page, '.ts-empty-title');
      const sentence = await probe(page, '.ts-empty-sentence');
      const action = await probe(page, '.ts-empty-action .pt-ib');
      await S('decks-search-empty');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');
      await sleep(400);
      return { shown: Boolean(empty), title: title?.text, titleFont: title?.font, sentence: sentence?.text, sentenceColor: sentence?.colorHex, sentenceContrast: sentence?.textContrast, action: action?.text };
    });
    await step(table, 'decks', `${tag} list view`, async () => {
      const segs = await probeAll(page, '.ts-seg .pt-ib', 2);
      const list = segs.find((s) => /list/i.test(s.tip ?? s.title ?? s.ariaLabel ?? '')) ?? segs[1];
      if (!list) return 'no list toggle';
      await clickAt(page, list.box.x + list.box.w / 2, list.box.y + list.box.h / 2);
      await sleep(500);
      const row = await probe(page, '.ts-rows tr:not(.ts-row-frame), .ts-row');
      const head = await probe(page, '.ts-rows th');
      await S('decks-list');
      const grid = segs.find((s) => s !== list);
      if (grid) await clickAt(page, grid.box.x + grid.box.w / 2, grid.box.y + grid.box.h / 2);
      await sleep(300);
      return { row: row ? { h: row.box.h, font: row.font } : 'no row', head: head ? { text: head.text, font: head.font, color: head.colorHex, contrast: head.textContrast } : null };
    });
    await step(table, 'decks', `${tag} keyboard focus ring on the search`, async () => {
      await page.evaluate(() => document.body.focus());
      await press(page, 'Tab', 3);
      const f = await page.evaluate(`(${PROBE_FN})(document.activeElement)`);
      return f ? { on: f.control ?? f.cls ?? f.tag, focusVisible: f.focusVisible, outline: f.outline, border: f.borderHex } : 'none';
    });

    // ---- /decks/trash
    await step(table, 'trash', `${tag} load`, async () => {
      await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('[data-control="trash.cards"], [data-control="trash.empty-state"]'), null, { timeout: 30_000 }).catch(() => undefined);
      await sleep(600);
      await S('trash');
      return await page.evaluate(() => ({ cards: document.querySelectorAll('.ts-trash-card').length, empty: document.querySelector('[data-control="trash.empty-state"]') !== null, headText: document.querySelector('.ts-trash-head')?.textContent?.trim().slice(0, 200) }));
    });
    await P('trash', 'head', '.ts-trash-head h1, .ts-trash-head h2');
    await P('trash', 'lead sentence', '.ts-trash-head p');
    await P('trash', 'back button', '[data-control="trash.back"]');
    await P('trash', 'empty trash button', '[data-control="trash.empty"]');
    await P('trash', 'restore button', '[data-control^="trash.restore."]');
    await P('trash', 'delete forever button', '[data-control^="trash.delete."]');
    await P('trash', 'empty state title', '[data-control="trash.empty-state"] .ts-empty-title');
    await step(table, 'trash', `${tag} the Empty trash confirm dialog`, async () => {
      const r = await rectOf(page, '[data-control="trash.empty"]');
      if (!r) return 'no Empty trash button';
      const disabled = await page.evaluate(() => document.querySelector('[data-control="trash.empty"]')?.disabled ?? false);
      if (disabled) return 'Empty trash is disabled (the trash is empty)';
      await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
      await sleep(400);
      const dialog = await probe(page, '[role="dialog"], .ts-dialog');
      const title = await probe(page, '[role="dialog"] h2, .ts-dialog-title');
      const ok = await probe(page, '[data-control="trash.confirm.ok"]');
      const cancel = await probe(page, '[data-control="trash.confirm.cancel"]');
      const body = await page.evaluate(() => document.querySelector('[role="dialog"], .ts-dialog')?.textContent?.trim().slice(0, 300));
      await S('trash-confirm');
      await press(page, 'Escape');
      await sleep(300);
      const gone = !(await page.evaluate(() => document.querySelector('[data-control="trash.confirm.ok"]') !== null));
      if (!gone) { const c = await rectOf(page, '[data-control="trash.confirm.cancel"]'); if (c) await clickAt(page, c.x + c.w / 2, c.y + c.h / 2); }
      return { dialog: dialog ? { w: dialog.box.w, border: dialog.borderHex, radius: dialog.radius } : null, title: title?.text, titleFont: title?.font, body, ok: ok ? { text: ok.text, solid: /is-solid/.test(ok.cls), radius: ok.radius, h: ok.height } : null, cancel: cancel ? { text: cancel.text, radius: cancel.radius } : null, escapeCloses: gone };
    });

    // ---- /new: the skeleton and the first paint
    await step(table, 'new', `${tag} the skeleton`, async () => {
      const t0 = Date.now();
      await page.goto(`${BASE}/new`, { waitUntil: 'commit' });
      let skeleton = null;
      for (let i = 0; i < 60; i += 1) {
        skeleton = await page.evaluate(() => { const s = document.querySelector('.ts-skeleton, [data-skeleton], .ts-editor-skeleton'); return s ? { cls: s.className, rows: s.querySelectorAll('*').length } : null; }).catch(() => null);
        if (skeleton || (await page.evaluate(() => Boolean(window.turboslide?.studio)).catch(() => false))) break;
        await sleep(30);
      }
      const atMs = Date.now() - t0;
      await S('new-skeleton');
      await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
      await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
      const readyMs = Date.now() - t0;
      await sleep(500);
      await S('new-editor');
      return { skeleton, skeletonAtMs: atMs, editorReadyMs: readyMs, address: page.url().replace(BASE, '') };
    });
    await step(table, 'new', `${tag} the placeholder prompts and the save words`, async () => {
      const prompts = await page.evaluate(() => [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-prompt]')].map((p) => p.getAttribute('data-prompt') ?? p.textContent));
      const save = await probe(page, '[data-control="deck.saveState"]');
      const name = await probe(page, '[data-control="deck.name"]');
      const prompt = await probe(page, '.ts-stagewrap.ts-editor .pt-slide [data-prompt]');
      return { prompts, save: save ? { text: save.text, font: save.font, color: save.colorHex, contrast: save.textContrast } : null, name: name ? { text: name.text, font: name.font } : null, promptColor: prompt ? { color: prompt.colorHex, contrast: prompt.textContrast, font: prompt.font } : null };
    });
    // leave /new without a write: nothing is created
    // ---- Not found and You need access
    await step(table, 'notfound', `${tag} /no-such-page`, async () => {
      const res = await page.goto(`${BASE}/no-such-page-${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-control="notfound"], .ts-access, .ts-empty', { timeout: 30_000 }).catch(() => undefined);
      await sleep(500);
      await S('notfound');
      const title = await probe(page, '.ts-empty-title, .ts-access-title');
      const sentence = await probe(page, '.ts-empty-sentence, .ts-access-sentence');
      const actions = await probeAll(page, '.ts-notfound-actions .pt-ib', 4);
      const fig = await probe(page, '.ts-empty-fig');
      const body = await probe(page, 'body');
      return { status: res?.status(), title: title?.text, titleFont: title?.font, sentence: sentence?.text, sentenceContrast: sentence?.textContrast, actions: actions.map((a) => ({ text: a.text, solid: /is-solid/.test(a.cls), h: a.height, radius: a.radius, border: a.borderHex, borderContrast: a.borderContrast })), fig: fig ? `${fig.box.w}x${fig.box.h} at ${Math.round(fig.box.x)},${Math.round(fig.box.y)}` : null, bodyBg: body?.background };
    });
    await step(table, 'access', `${tag} /deck/<missing> (You need access)`, async () => {
      const res = await page.goto(`${BASE}/deck/no-such-deck-${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ts-access, [data-control="notfound"]', { timeout: 30_000 }).catch(() => undefined);
      await sleep(500);
      await S('access');
      const title = await probe(page, '.ts-access-title');
      const sentence = await probe(page, '.ts-access-sentence');
      const field = await probe(page, '.ts-access-field select, .ts-access-field input');
      const label = await probe(page, '.ts-access-field');
      const btn = await probe(page, '.ts-access-actions .pt-ib');
      const signin = await probe(page, '.ts-access-signin-line');
      const card = await probe(page, '.ts-access');
      const controls = await page.evaluate(() => [...document.querySelectorAll('.ts-access [data-control]')].map((e) => e.getAttribute('data-control')));
      return { status: res?.status(), title: title?.text, titleFont: title?.font, sentence: sentence?.text, sentenceContrast: sentence?.textContrast, field: field ? { h: field.height, border: field.borderHex, borderContrast: field.borderContrast, radius: field.radius, font: field.font } : null, label: label ? { font: label.font, color: label.colorHex, contrast: label.textContrast } : null, button: btn ? { text: btn.text, solid: /is-solid/.test(btn.cls), h: btn.height, radius: btn.radius } : null, signin: signin?.text, card: card ? { w: card.box.w, top: card.box.y, pad: card.padding } : null, controls };
    });
    await step(table, 'access', `${tag} 1280 body scroll`, async () => page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })));

    await context.close();
    table.save({ consoleErrors });
  }
}

await browser.close();
table.save({ consoleErrors });
console.log(`\n${table.rows.length} rows; ${consoleErrors.length} console errors; table ${table.file}`);

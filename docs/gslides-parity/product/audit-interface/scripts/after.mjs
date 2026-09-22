// Before and after pictures for the ten highest value polish items: the production page as it is,
// then the same view with one CSS rule set injected (page.addStyleTag), so the proposal can be seen
// without a source change. One scratch deck from /new, trashed and deleted forever in the finally
// block; the pages outside the editor need no deck.
//   node after.mjs
import path from 'node:path';
import {
  BASE,
  OUT,
  SCRATCH,
  Table,
  chromium,
  clickAt,
  clickControl,
  createDeck,
  destroyDeck,
  dismissPrompts,
  editorReady,
  hoverAt,
  menuPath,
  newContext,
  openMenu,
  pad,
  press,
  rectOf,
  rectOfControl,
  runs,
  settled,
  shot,
  sleep,
  state,
  step,
  surfaceClear,
  typeHuman,
} from './lib.mjs';

const table = new Table(path.join(SCRATCH, 'after-run.json'));
const browser = await chromium.launch({ headless: true });
const V = { w: 1440, h: 900 };

/** The proposals as CSS, each the smallest rule set that shows the change. */
const CSS = {
  // 1. titanium text on light chrome to 4.7:1 (the save words, the menu keys, the filmstrip numbers,
  //    the field labels, the empty sentences); the dark value stays
  titanium: `:root:not([data-theme='dark']) { --pt-titanium: #6f747d; }`,
  // 2. a field's boundary at 3:1: one token for every ruled input (the zoom field, the size field,
  //    the dialog inputs, the search field, the access form)
  fields: `:root { --pt-field: rgba(7, 7, 7, 0.42); } :root[data-theme='dark'] { --pt-field: rgba(242, 242, 240, 0.44); }
    .ts-tb-size-field, .ts-tb-zoom:hover, .ts-tb-zoom:focus-within, .ts-dialog input[type='text'], .ts-dialog input[type='url'], .ts-dialog input[type='search'], .ts-dialog input[type='number'], .ts-dialog select, .ts-dialog textarea,
    .ts-share-emails, .ts-share-message, .ts-share-role, .ts-share-mode, .ts-share-expiry, .ts-fo-field input, .ts-fo-alt textarea, .ts-appbar-search input, .ts-access-field select, .ts-access-field input, .ts-access-field textarea, .ts-versions-note, .ts-notes-field:focus-visible { border-color: var(--pt-field); }`,
  // 3. a hover that reads: the plate ground under the hairline on every shell button
  hover: `.pt-ib:hover:not(.is-solid):not(.is-disabled), .ts-title-home:hover, .ts-dialog-x:hover, .ts-panel-x:hover { background: var(--pt-plate); }
    :root { --pt-plate: rgba(7, 7, 7, 0.06); } :root[data-theme='dark'] { --pt-plate: rgba(242, 242, 240, 0.08); }`,
  // 4. one corner in chrome: the title row's Slideshow and Share take the shell corner (6 px) that
  //    the search pill, the segmented control and the key chip already draw
  corner: `.ts-title-slideshow, .ts-title-r [data-control='share.open'], .pt-ib.is-solid, .ts-access-actions .pt-ib { border-radius: var(--pt-radius); }`,
  // 5. the trash page: one control height (32) and the destructive action told apart by its glyph
  //    weight, not by a second height
  trash: `.ts-trash-card-actions .pt-ib { height: 32px; } .ts-trash-card-actions [data-control^='trash.delete.'] { color: var(--pt-ink); }`,
  // 6. no tooltip while a menu or a dialog is open (the focused row and the focused default action
  //    draw their plate over the menu and over the dialog's edge)
  tipQuiet: `body:has(.ts-menu, .ts-context-menu, .ts-dialog-scrim, [role='dialog']) #pt-tip { display: none !important; }`,
  // 7. the confirm dialog on /decks in the editor's dialog grammar: an 18 px title, the sentence in
  //    the lead, 24 px of padding
  confirm: `.ts-home [role='dialog'] h2, .ts-home .ts-dialog-title { font-size: 18px; line-height: 1.25; }`,
  // 8. menu rows: one icon column policy (the column leaves where fewer than half the rows have a glyph)
  menuIcons: `.ts-menu-item { grid-template-columns: minmax(0, 1fr) auto; } .ts-menu-ic { display: none; }`,
  // 9. the hover ground of a menu title and a menu row at a readable tint
  plate: `:root { --pt-plate: rgba(7, 7, 7, 0.07); } :root[data-theme='dark'] { --pt-plate: rgba(242, 242, 240, 0.1); }`,
  // 10. the disabled Font control reads as a value, not a dead button: the family name in ink-2
  font: `[data-control='toolbar.font'] { color: var(--pt-ink-2) !important; } [data-control='toolbar.font'] .pt-lb::after { content: ' Inter'; }`,
  // 11. one focus ring rule: the 1 px ink outline inset on every control, dialogs included
  focus: `.ts-dialog-x:focus-visible, .ts-dialog-btn:focus-visible, .ts-dialog-tab:focus-visible, .ts-dialog-mode:focus-visible, .ts-hm-card-open:focus-visible, .ts-hm-card-title:focus-visible, .ts-strip-gallery:focus-visible { outline-offset: -1px; }`,
};

let deckId = null;
try {
  for (const theme of ['light', 'dark']) {
    const context = await newContext(browser, { width: V.w, height: V.h, theme });
    const page = await context.newPage();
    const pair = async (name, prepare, css, clip) => {
      await step(table, 'after', `${theme} ${name}`, async () => {
        await prepare();
        const c = typeof clip === 'function' ? await clip() : clip;
        await shot(page, `before-${theme}-${name}`, c);
        const handle = await page.addStyleTag({ content: css });
        await sleep(250);
        await shot(page, `after-${theme}-${name}`, c);
        await handle.evaluate((el) => el.remove());
        return `before-${theme}-${name}.png, after-${theme}-${name}.png`;
      });
    };

    // ---- the pages
    await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await sleep(800);
    await pair('decks-search-field', async () => {}, CSS.fields, {
      x: 420,
      y: 16,
      width: 760,
      height: 72,
    });
    await pair(
      'decks-card-menu-tooltip',
      async () => {
        const r = await rectOf(page, '.ts-hm-card:not(.ts-hm-card-frame) .ts-hm-card-more');
        await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
        await sleep(700);
      },
      CSS.tipQuiet + CSS.menuIcons,
      async () => {
        const m = await rectOf(page, '.ts-menu');
        return pad({ x: m.x - 60, y: m.y - 60, w: m.w + 120, h: m.h + 120 }, 0, V.w, V.h);
      },
    );
    await press(page, 'Escape');
    await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
    await sleep(800);
    await pair('trash-buttons', async () => {}, CSS.trash + CSS.hover, {
      x: 184,
      y: 90,
      width: 1080,
      height: 340,
    });
    await pair(
      'trash-confirm',
      async () => {
        const r = await rectOfControl(page, 'trash.empty');
        await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
        await sleep(700);
      },
      CSS.tipQuiet + CSS.confirm,
      { x: 440, y: 330, width: 600, height: 280 },
    );
    await press(page, 'Escape');
    await page.goto(`${BASE}/deck/no-such-deck-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ts-access', { timeout: 30_000 });
    await sleep(500);
    await pair('access-form', async () => {}, CSS.fields + CSS.corner, {
      x: 480,
      y: 90,
      width: 480,
      height: 380,
    });

    // ---- the editor
    if (!deckId) {
      deckId = await createDeck(page, 'Interface audit pictures');
      await context.storageState({ path: `${SCRATCH}/after-storage.json` });
    } else {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await editorReady(page);
      await settled(page);
    }
    await dismissPrompts(page);
    const titleClip = { x: 0, y: 0, width: V.w, height: 44 };
    await pair(
      'title-row-titanium',
      async () => {
        await page.mouse.move(700, 500);
      },
      CSS.titanium,
      titleClip,
    );
    await pair('title-row-corner', async () => {}, CSS.corner, {
      x: 940,
      y: 0,
      width: 500,
      height: 44,
    });
    await pair(
      'toolbar-hover',
      async () => {
        const r = await rectOfControl(page, 'toolbar.newSlide');
        await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 300);
      },
      CSS.hover,
      { x: 0, y: 72, width: 520, height: 40 },
    );
    await pair(
      'menubar-hover',
      async () => {
        const r = await rectOfControl(page, 'menubar.view');
        await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 300);
      },
      CSS.plate,
      { x: 0, y: 44, width: 520, height: 28 },
    );
    await pair(
      'file-menu',
      async () => {
        await surfaceClear(page);
        await openMenu(page, 'file');
        await sleep(400);
      },
      CSS.titanium + CSS.menuIcons + CSS.plate,
      { x: 0, y: 44, width: 560, height: 440 },
    );
    await press(page, 'Escape', 2);
    await pair(
      'filmstrip-numbers',
      async () => {
        await clickControl(page, 'toolbar.newSlide');
        await sleep(800);
        await settled(page);
      },
      CSS.titanium,
      { x: 0, y: 112, width: 256, height: 300 },
    );
    await pair(
      'zoom-and-size-fields',
      async () => {
        const all = await runs(page);
        const head = all.find((r) => /heading/.test(r)) ?? all[0];
        const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`);
        if (r) {
          await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
          await sleep(400);
        }
        const z = await rectOf(page, '.ts-tb-zoom');
        if (z) await hoverAt(page, z.x + z.w / 2, z.y + z.h / 2, 300);
      },
      CSS.fields + CSS.font,
      { x: 0, y: 72, width: 900, height: 40 },
    );
    await press(page, 'Escape', 2);
    await pair(
      'share-dialog-fields',
      async () => {
        await surfaceClear(page);
        await clickControl(page, 'share.open');
        await page.locator('[data-control="dialog.share"]').waitFor({ timeout: 8000 });
        await sleep(600);
      },
      CSS.fields + CSS.titanium + CSS.tipQuiet + CSS.focus,
      async () => {
        const d = await rectOf(page, '.ts-dialog-scrim [role="dialog"], .ts-dialog');
        return d ? pad(d, 24, V.w, V.h) : null;
      },
    );
    await surfaceClear(page);
    await pair(
      'format-options-labels',
      async () => {
        await surfaceClear(page);
        const all = await runs(page);
        const head = all.find((r) => /heading/.test(r)) ?? all[0];
        const r = await rectOf(page, `.ts-stagewrap.ts-editor .pt-slide [data-run="${head}"]`);
        if (r) {
          await clickAt(page, r.x + r.w / 2, r.y + r.h / 2);
          await sleep(300);
        }
        await menuPath(page, 'format', 'format.formatOptions');
        await page.locator('.ts-rpanel .ts-panel').waitFor({ timeout: 8000 });
        await sleep(600);
      },
      CSS.titanium + CSS.fields,
      { x: V.w - 320, y: 112, width: 320, height: 520 },
    );
    await context.close();
    table.save({ deckId });
  }
} finally {
  const context = await newContext(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    storageState: deckId ? `${SCRATCH}/after-storage.json` : null,
  });
  const page = await context.newPage();
  const result = await destroyDeck(page, deckId, (m) => table.add('trash', m, ''));
  table.add('trash', 'the scratch deck', result);
  await context.close();
  await browser.close();
  table.save({ deckId });
  console.log(`\n${table.rows.length} rows; table ${table.file}`);
}

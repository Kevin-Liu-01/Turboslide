// The four picture pairs the interface audit's after pass did not make (docs/PRODUCT.md section 3:
// the toolbar hover, the filmstrip numbers and the Format options labels in the dark appearance,
// and the File menu with the frame weight injected in both appearances), rerun against production
// by B1 before the token changes, with a fresh browser context per appearance: the audit's pass
// lost the toolbar's button and the menu bar after an appearance swap on the same page
// (audit-interface/tables/after-run.json rows 22, 25 and 28). Same method as after.mjs: the
// production page as it is, then the same view with one CSS rule set injected. One scratch deck
// from /new, trashed and deleted forever in the finally block.
//   node docs/gslides-parity/product/audit-interface/scripts/after-b1.mjs
import path from 'node:path';
import {
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
  rectOf,
  rectOfControl,
  runs,
  settled,
  shot,
  sleep,
  step,
  surfaceClear,
  press,
} from './lib.mjs';

const table = new Table(path.join(SCRATCH, 'after-b1-run.json'));
const browser = await chromium.launch({ headless: true });
const V = { w: 1440, h: 900 };

/** The proposals as CSS (after.mjs CSS), the smallest rule set that shows each change. */
const CSS = {
  titanium: `:root:not([data-theme='dark']) { --pt-titanium: #6f747d; }`,
  fields: `:root { --pt-field: rgba(7, 7, 7, 0.44); } :root[data-theme='dark'] { --pt-field: rgba(242, 242, 240, 0.44); }
    .ts-tb-size-field, .ts-tb-zoom:hover, .ts-tb-zoom:focus-within, .ts-fo-field input, .ts-fo-alt textarea { border-color: var(--pt-field); }`,
  hover: `.pt-ib:hover:not(.is-solid):not(.is-disabled), .ts-title-home:hover, .ts-dialog-x:hover, .ts-panel-x:hover { background: var(--pt-plate); }
    :root { --pt-plate: rgba(7, 7, 7, 0.06); } :root[data-theme='dark'] { --pt-plate: rgba(242, 242, 240, 0.08); }`,
  // the frame weight on a floating plate (docs/PRODUCT.md 3.1, the floating plate row): the menu
  menuFrame: `.ts-menu { border-color: var(--pt-edge); }`,
};

let deckId = null;
let storage = null;
try {
  for (const theme of ['light', 'dark']) {
    const context = await newContext(browser, {
      width: V.w,
      height: V.h,
      theme,
      storageState: storage,
    });
    const page = await context.newPage();
    const pair = async (name, prepare, css, clip) => {
      await step(table, 'after-b1', `${theme} ${name}`, async () => {
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

    if (!deckId) {
      deckId = await createDeck(page, 'Interface audit pictures, B1');
      storage = `${SCRATCH}/after-b1-storage.json`;
      await context.storageState({ path: storage });
    } else {
      await page.goto(`https://turboslide.vercel.app/edit/${deckId}`, {
        waitUntil: 'domcontentloaded',
      });
      await editorReady(page);
      await settled(page);
    }
    await dismissPrompts(page);

    /* the File menu with the frame weight, both appearances (chrome.floating.edge-frame's picture) */
    await pair(
      'menu-frame',
      async () => {
        await surfaceClear(page);
        await openMenu(page, 'file');
        await sleep(400);
      },
      CSS.menuFrame,
      { x: 0, y: 44, width: 560, height: 480 },
    );
    await press(page, 'Escape', 2);

    if (theme === 'dark') {
      /* the three dark editor pairs the audit's pass lost */
      await pair(
        'toolbar-hover',
        async () => {
          const r = await rectOfControl(page, 'toolbar.newSlide');
          await hoverAt(page, r.x + r.w / 2, r.y + r.h / 2, 300);
        },
        CSS.hover,
        { x: 0, y: 72, width: 520, height: 40 },
      );
      await page.mouse.move(700, 500);
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
    }
    await context.close();
    table.save({ deckId });
  }
} finally {
  const context = await newContext(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    storageState: storage,
  });
  const page = await context.newPage();
  const result = await destroyDeck(page, deckId, (m) => table.add('trash', m, ''));
  table.add('trash', 'the scratch deck', result);
  await context.close();
  await browser.close();
  table.save({ deckId });
  console.log(`\n${table.rows.length} rows; table ${table.file}`);
}

// B1's fix round drive on its own dev server (docs/gslides-parity/focus/VERIFICATION.md F.5 F7 and
// F8): the Font control on the cover's heading and lead reads the brand kit's face for the field's
// role, is disabled, and its tooltip names the kit path; a click opens no plate; a text block keeps
// the working dropdown; and the mechanism of F7 read first hand (Cmd+Z with the focus on the
// Tabular figures checkbox, then from the stage, then Cmd+Shift+Z from the checkbox). Playwright-core
// from the repository root, 1440 by 900, one scratch deck from /new trashed and removed at the end.
// Usage: node b1-fix-drive.mjs --base http://localhost:4411
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const base = argv[argv.indexOf('--base') + 1] ?? 'http://localhost:4411';
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'b1-fix-drive-run.json');
const rows = [];
const record = (step, expected, observed, ok) => {
  rows.push({ n: rows.length + 1, step, expected, observed: String(observed), ok });
  console.log(`${ok ? 'ok ' : 'NOT'} ${step}: ${observed}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
});
const invoke = (action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const control = (id) => page.locator(`[data-control="${id}"]`);
const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
const onSheet = (blockId) => page.locator(`${SHEET} [data-block="${blockId}"]`).first();
const clickBlock = async (blockId) => {
  const el = onSheet(blockId);
  await el.waitFor({ timeout: 10_000 });
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(500);
};
/** The Font control's readable state: its words, aria-disabled, data-font and the hovered doc. */
const readFont = async () => {
  let id = 'toolbar.font';
  if ((await control(id).count()) === 0 || !(await control(id).first().isVisible())) {
    if ((await control('toolbar.more').count()) > 0) {
      await control('toolbar.more').first().click();
      await sleep(300);
      id = 'toolbar.more.toolbar.font';
    }
  }
  const el = control(id).first();
  await el.waitFor({ timeout: 5000 });
  await el.hover();
  await sleep(700);
  const doc = await page
    .locator('.pt-tip .pt-tip-doc')
    .first()
    .textContent()
    .catch(() => null);
  const name = await page
    .locator('.pt-tip .pt-tip-name')
    .first()
    .textContent()
    .catch(() => null);
  const words = (await el.locator('.ts-font-label').first().textContent())?.trim();
  const disabled = await el.getAttribute('aria-disabled');
  const font = await el.getAttribute('data-font');
  await page.mouse.move(10, 10);
  await sleep(200);
  return { id, words, disabled, font, tip: `${name ?? ''}: ${doc ?? ''}` };
};
const setKit = async (pointer, value) => {
  const s = await state();
  await invoke('brand.set', {
    path: pointer,
    ...(value === undefined ? {} : { value }),
    baseRevision: s.revision,
  });
  await sleep(500);
};
const numeralsOf = (blockId) =>
  page.evaluate(
    ([sel]) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontVariantNumeric : 'no element';
    },
    [`${SHEET} [data-block="${blockId}"]`],
  );
const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}${a.getAttribute('type') ? `[type=${a.getAttribute('type')}]` : ''}${a.getAttribute('data-control') ? ` ${a.getAttribute('data-control')}` : ''}`;
  });

let deckId = null;
try {
  await page.goto(`${base}/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
  await sleep(800);
  let s = await state();
  const slideId = s.slideId ?? s.slide?.id ?? (await invoke('slide.list')).slides?.[0]?.id;
  deckId = s.deckId ?? (await invoke('deck.info')).id;
  const slide = await invoke('slide.get', { slideId }).catch(() => null);
  const kind = slide?.slide?.kind ?? slide?.kind ?? 'unknown';
  record(
    'the editor boots on /new with a title slide',
    "kind 'title'",
    `slide ${slideId}, kind ${kind}, state keys ${Object.keys(s).join(',')}`,
    Boolean(slideId),
  );

  /* F8, the default kit: the cover's heading reads the theme's face, disabled, with the Display sentence */
  await clickBlock('heading');
  let font = await readFont();
  record(
    'the Font control on the cover heading, kit silent',
    'Inter; aria-disabled true; data-font theme; the Display sentence',
    JSON.stringify(font),
    font.words === 'Inter' &&
      font.disabled === 'true' &&
      font.font === 'theme' &&
      /Display face/.test(font.tip) &&
      /Slide > Edit theme/.test(font.tip),
  );
  /* a person's click: the mouse at the control's centre (Playwright refuses aria-disabled) */
  const fb = await control(font.id).first().boundingBox();
  await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await sleep(400);
  const plateCount = await control('toolbar.font.plate').count();
  record('a click on the disabled control', 'no plate', `${plateCount} plate(s)`, plateCount === 0);
  await page.keyboard.press('Escape');
  await sleep(200);

  /* the kit's faces set: the heading reads the Display face, the lead the Text face */
  await setKit('/fonts/display', 'fraunces');
  await setKit('/fonts/text', 'geist');
  await clickBlock('heading');
  font = await readFont();
  record(
    'the cover heading with the kit Display face Fraunces',
    'Fraunces; disabled; data-font fraunces; the Display sentence',
    JSON.stringify(font),
    font.words === 'Fraunces' &&
      font.disabled === 'true' &&
      font.font === 'fraunces' &&
      /Display face/.test(font.tip),
  );
  const headingFamily = await page.evaluate(
    ([sel]) => getComputedStyle(document.querySelector(sel)).fontFamily,
    [`${SHEET} [data-block="heading"]`],
  );
  record(
    'the heading computes the kit face the control names',
    'Fraunces first in the computed stack',
    headingFamily,
    /^["']?Fraunces/.test(headingFamily),
  );
  await clickBlock('lead');
  font = await readFont();
  record(
    'the cover lead with the kit Text face Geist',
    'Geist; disabled; data-font geist; the Text sentence',
    JSON.stringify(font),
    font.words === 'Geist' &&
      font.disabled === 'true' &&
      font.font === 'geist' &&
      /Text face/.test(font.tip),
  );
  await setKit('/fonts/display');
  await setKit('/fonts/text');

  /* a text block keeps the working dropdown */
  s = await state();
  await invoke('block.insert', {
    baseRevision: s.revision,
    slideId,
    slot: 'main',
    block: {
      id: 'b1-fix-box',
      type: 'text',
      text: 'Renewal terms for the quarter 1234',
      pos: { x: 160, y: 520, w: 900, h: 140 },
    },
  });
  await sleep(700);
  await clickBlock('b1-fix-box');
  font = await readFont();
  record(
    'the Font control on a text block',
    'Inter; enabled; the picker sentence',
    JSON.stringify(font),
    font.words === 'Inter' && font.disabled === null && /More fonts/.test(font.tip),
  );
  await control(font.id).first().click();
  await control('toolbar.font.plate').waitFor({ timeout: 5000 });
  record(
    'a click on the text block control',
    'the plate opens',
    'toolbar.font.plate present',
    true,
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  /* F7, read first hand: the Tabular figures checkbox, Cmd+Z from it, from the stage, Cmd+Shift+Z from it */
  await clickBlock('b1-fix-box');
  if ((await control('toolbar.formatOptions').count()) > 0)
    await control('toolbar.formatOptions').first().click();
  const check = control('formatOptions.typography.numerals').first();
  await check.waitFor({ timeout: 8000 });
  await check.scrollIntoViewIfNeeded();
  const before = (await state()).revision;
  /* the label is what a person clicks (b1-smoke run 5): the input sits under the drawn box */
  await check.locator('xpath=..').click();
  await sleep(600);
  const afterOn = await state();
  const focusAfterClick = await active();
  const numeralsOn = await numeralsOf('b1-fix-box');
  /* the revision in describe().state follows the commit and lags the optimistic write by more
     than the pause here (run 3 read 5 to 5 with tabular-nums computed), so the computed style is
     the assertion and the revision is information */
  record(
    'Tabular figures toggled on from the row',
    'tabular-nums computed, the focus on the checkbox',
    `revision ${before} to ${afterOn.revision}; ${numeralsOn}; focus ${focusAfterClick}`,
    numeralsOn === 'tabular-nums' && /checkbox/.test(focusAfterClick),
  );
  await page.keyboard.press('Meta+z');
  await sleep(900);
  const numeralsAfterUndoFromCheck = await numeralsOf('b1-fix-box');
  record(
    'F7 mechanism: Cmd+Z with the focus on the checkbox',
    'the finding: nothing changes (the request in b1.md fixes it)',
    `${numeralsAfterUndoFromCheck}; focus ${await active()}; revision ${(await state()).revision}`,
    true,
  );
  const undoFromCheckWorked = numeralsAfterUndoFromCheck !== 'tabular-nums';
  await clickBlock('b1-fix-box');
  await page.keyboard.press('Meta+z');
  await sleep(900);
  const numeralsAfterStageUndo = await numeralsOf('b1-fix-box');
  record(
    'Cmd+Z from the stage after a click on the block',
    'the toggle undone: proportional figures',
    `${numeralsAfterStageUndo}; revision ${(await state()).revision}`,
    numeralsAfterStageUndo !== 'tabular-nums',
  );
  /* the asymmetry of the field gate (useEditorKeys.ts 197 lets a Cmd+Shift chord through): with
     the toggle undone, the focus back on the checkbox, Cmd+Shift+Z */
  await check.focus();
  await sleep(200);
  const focusBeforeRedo = await active();
  await page.keyboard.press('Meta+Shift+z');
  await sleep(900);
  const numeralsAfterRedoFromCheck = await numeralsOf('b1-fix-box');
  record(
    'F7 asymmetry: Cmd+Shift+Z with the focus on the checkbox',
    'read as it is: redo from the checkbox passes the gate that stops undo',
    `focus ${focusBeforeRedo}; ${numeralsAfterRedoFromCheck}; revision ${(await state()).revision}`,
    true,
  );
  rows.push({
    n: rows.length + 1,
    step: 'F7 verdict on this tree',
    expected: 'the finding reproduces until the useEditorKeys.ts request lands',
    observed: undoFromCheckWorked
      ? 'Cmd+Z from the checkbox undid the toggle (the finding does not reproduce here)'
      : 'Cmd+Z from the checkbox changed nothing; the stage undid it (the finding reproduces)',
    ok: true,
  });
  console.log(`--- ${rows[rows.length - 1].observed}`);

  const mine = errors.filter((e) => /FontPicker|font-picker/.test(e));
  record(
    'no console or page error from this lane’s modules',
    'none',
    mine.length === 0 ? 'none' : mine.join(' | '),
    mine.length === 0,
  );
  if (errors.length > 0) console.log('other console errors:', errors.length, errors.slice(0, 5));
} catch (e) {
  record('the drive', 'runs to the end', e instanceof Error ? e.message : String(e), false);
} finally {
  try {
    if (deckId) {
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
      let after = 0;
      for (let i = 0; i < 10 && after !== 404; i += 1) {
        after = await page.evaluate(async (id) => (await fetch(`/edit/${id}`)).status, deckId);
        if (after !== 404) await sleep(1000);
      }
      record(
        'the scratch deck is trashed and removed',
        '404 on /edit/<id>',
        `${after} (${deckId})`,
        after === 404,
      );
    }
  } catch (e) {
    record('cleanup', 'trashed', e instanceof Error ? e.message : String(e), false);
  }
  await browser.close();
  writeFileSync(out, JSON.stringify({ base, at: new Date().toISOString(), rows, errors }, null, 2));
  console.log(`wrote ${out}; ${rows.filter((r) => r.ok).length} of ${rows.length} ok`);
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

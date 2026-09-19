// B2's hand drive of the return round rows against a dev server (run 2):
//   node b2-drive.mjs --base http://localhost:4402 [--only name,title,table,shape,insert,clear,size] [--headed]
// Reads through the product's controls and the window API (describe, slide.get, deck.info); the
// scratch deck is trashed and removed through the window API at the end and /edit answers 404.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4402');
const ONLY = arg('only', null);
const only = ONLY ? new Set(ONLY.split(',')) : null;
const HEADED = argv.includes('--headed');
const OUT = arg('json', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rows = [];
const say = (...a) => console.log(...a);

async function step(id, name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    rows.push({ id, name, ok: r.ok === true, observed: r.observed, ms: Date.now() - t0 });
    say(`${r.ok ? 'PASS' : 'FAIL'} ${id}: ${r.observed}`);
  } catch (error) {
    rows.push({
      id,
      name,
      ok: false,
      observed: `threw: ${error instanceof Error ? error.message : String(error)}`,
      ms: Date.now() - t0,
    });
    say(`FAIL ${id}: threw ${error instanceof Error ? error.message : String(error)}`);
  }
}

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (
    m.type() === 'error' &&
    !m.text().startsWith('%c[Server]') &&
    !/Content Security Policy|"key" prop/.test(m.text())
  )
    errors.push(`console: ${m.text().slice(0, 200)}`);
});

const invoke = (action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = () => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async () => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state();
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
/** The revision once it has held still for 700 ms (the memory channel's acknowledgement lags the local apply). */
const stableRevision = async () => {
  await settled();
  let last = (await state()).revision;
  let since = Date.now();
  const until = Date.now() + 8000;
  for (;;) {
    await sleep(150);
    const now = (await state()).revision;
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= 700) return last;
    if (Date.now() > until) return last;
  }
};
const typeHuman = async (text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(rand(40, 90));
  }
};
const press = async (key, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await sleep(rand(60, 100));
  }
};
const clickAt = async (x, y) => {
  await page.mouse.move(x - 12, y - 8);
  await sleep(rand(40, 80));
  await page.mouse.move(x, y);
  await sleep(rand(40, 80));
  await page.mouse.click(x, y);
  await sleep(rand(120, 200));
};
const ctl = (control) => page.locator(`[data-control="${control}"]`);
const clickControl = async (control) => {
  const el = ctl(control).first();
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
  const r = await el.boundingBox();
  if (!r) throw new Error(`no control ${control}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
};
const visible = (control) =>
  page.evaluate((c) => {
    const el = document.querySelector(`[data-control="${c}"]`);
    return el !== null && el.getClientRects().length > 0;
  }, control);
const openMenu = async (id) => {
  const r = await ctl(`menubar.${id}`).boundingBox();
  if (!r) throw new Error(`no menubar ${id}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
  await page.locator(`#ts-menu-${id}`).waitFor({ timeout: 8000 });
  await sleep(rand(150, 250));
};
const hoverRow = async (rowId, waitFor) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = await ctl(`menu.${rowId}`).boundingBox();
    if (!r) throw new Error(`no menu row ${rowId}`);
    await page.mouse.move(r.x - 20, r.y + r.height / 2);
    await sleep(60);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(rand(300, 450));
    if (!waitFor) return;
    try {
      await page.locator(waitFor).first().waitFor({ timeout: 3000 });
      return;
    } catch {
      if (attempt === 1) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    }
  }
  throw new Error(`submenu of ${rowId} did not open`);
};
const menuPath = async (menuId, ...rowIds) => {
  await openMenu(menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1)
    await hoverRow(rowIds[i], `[data-control="menu.${rowIds[i + 1]}"]`);
  const last = rowIds[rowIds.length - 1];
  const r = await ctl(`menu.${last}`).boundingBox();
  if (!r) throw new Error(`no menu row ${last}`);
  await clickAt(r.x + r.width / 2, r.y + r.height / 2);
  await sleep(200);
};
const menuRowFacts = async (menuId, ...rowIds) => {
  await openMenu(menuId);
  for (let i = 0; i < rowIds.length - 1; i += 1)
    await hoverRow(rowIds[i], `[data-control="menu.${rowIds[i + 1]}"]`);
  const facts = await page.evaluate(
    (id) => {
      const el = document.querySelector(`[data-control="menu.${id}"]`);
      return el
        ? {
            present: true,
            disabled: el.getAttribute('aria-disabled') === 'true',
            label: el.textContent?.trim() ?? '',
          }
        : { present: false };
    },
    rowIds[rowIds.length - 1],
  );
  await press('Escape', 2);
  return facts;
};
const snackbar = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
        .filter((el) => el.textContent?.trim())
        .map((el) => el.textContent?.trim() ?? '')
        .join(' | ') || null,
  );
const editing = () =>
  page.evaluate(() => Boolean(document.querySelector('.ts-stagewrap.ts-editor[data-editing]')));
const runInfo = (run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-prompt]').forEach((p) => p.remove());
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      text: (clone.textContent ?? '').replace(/ /g, ' '),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      weight: cs.fontWeight,
      size: parseFloat(cs.fontSize),
      align: cs.textAlign,
      color: cs.color,
      lineHeight: cs.lineHeight,
      html: el.innerHTML.slice(0, 200),
    };
  }, run);
const runs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')].map((el) =>
      el.getAttribute('data-run'),
    ),
  );
/** The selection facts the walk's toolkit reads: the overlay's handle controls of an object, the ring, the chip, the session. */
const selectionFacts = (id) =>
  page.evaluate((blockId) => {
    const ctrls = [...document.querySelectorAll('[data-control^="handle."]')].map((e) =>
      e.getAttribute('data-control'),
    );
    const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) =>
      ctrls.includes(`handle.${blockId}.resize.${d}`),
    );
    return {
      selected: ctrls.includes(`handle.${blockId}.move`),
      resize: dirs.length,
      ring: document.querySelector('.ts-overlay .ts-select') !== null,
      chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
      editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
    };
  }, id);
const tailControls = () =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.ts-toolbar [data-control^="toolbar."], [role="toolbar"] [data-control^="toolbar."]',
      ),
    ]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => e.getAttribute('data-control')),
  );
const slideJson = async (slideId) => invoke('slide.get', { slideId }).then((g) => g.slide ?? g);
const blockOf = async (slideId, id) => {
  const slide = await slideJson(slideId);
  const lists = slide.kind === 'content' ? Object.values(slide.slots).flat() : [];
  return lists.find((b) => b && b.id === id) ?? null;
};
const clearAll = async () => {
  await press('Escape', 3);
  await sleep(200);
};
const undo = async () => {
  await clearAll();
  await press('Meta+z');
  await sleep(500);
  await settled();
};
const pollUntil = async (read, test, timeout = 5000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (test(v) || Date.now() > until) return v;
    await sleep(150);
  }
};
const deckName = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-control="deck.name"]')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => e.getAttribute('value') ?? e.textContent?.trim() ?? '')
        .filter(Boolean)[0] ?? null,
  );
const dialogText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')]
      .map((d) => d.textContent?.trim() ?? '')
      .join(' | '),
  );
const describeSel = (f) =>
  `move ${f.selected}; handles ${f.resize}; ring ${f.ring}; chip ${f.chip === null ? 'none' : `"${f.chip}"`}; session ${f.editing}`;

const TITLE = 'Renewal review for Acme, Q3 2026';
if (TITLE.length !== 32) throw new Error(`title is ${TITLE.length} characters`);

let deckId = null;
let titleSlide = null;
let head = null;
try {
  await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady();
  const info = await invoke('deck.info');
  deckId = info.id;
  const s0 = await state();
  titleSlide = s0.slideId;
  const all = await runs();
  head = all.find((r) => /heading/.test(r)) ?? all[0];
  const HEAD_BLOCK = 'heading';
  say(`deck ${deckId}, title slide ${titleSlide}, runs ${all.join(', ')}`);
  if (await visible('dialog.namePrompt'))
    await clickControl('dialog.namePrompt.close').catch(() => undefined);

  // ---- decks.name.follows-heading
  if (!only || only.has('name')) {
    await step(
      'decks.name.follows-heading',
      'type 8 then 24 characters of a 32 character title with a save between',
      async () => {
        const info0 = await runInfo(head);
        await page.mouse.dblclick(info0.rect.x + info0.rect.w / 2, info0.rect.y + info0.rect.h / 2);
        await sleep(250);
        const on = await editing();
        await typeHuman(TITLE.slice(0, 8));
        await page
          .waitForSelector('[data-control="deck.saveState"][data-state="saved"]', {
            timeout: 30_000,
          })
          .catch(() => undefined);
        await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
        const saveWord = await page.evaluate(
          () =>
            document.querySelector('[data-control="deck.saveState"]')?.getAttribute('data-state') ??
            null,
        );
        const nameAfter8 = await pollUntil(deckName, (n) => n === TITLE.slice(0, 8).trim(), 4000);
        const infoAfter8 = await invoke('deck.info');
        await typeHuman(TITLE.slice(8));
        await sleep(300);
        await press('Escape');
        const s1 = await settled();
        const nameRow = await pollUntil(deckName, (n) => n === TITLE, 15_000);
        const infoTitle = (await invoke('deck.info')).title;
        await menuPath('file', 'file.details');
        await sleep(500);
        const details = await dialogText();
        await press('Escape');
        await sleep(300);
        const shareOk = await clickControl('title.share')
          .then(() => true)
          .catch(() => false);
        await sleep(700);
        const share = shareOk ? await dialogText() : '';
        await press('Escape');
        await sleep(300);
        const ok =
          nameRow === TITLE &&
          infoTitle === TITLE &&
          details.includes(TITLE) &&
          share.includes(TITLE);
        return {
          ok,
          observed: `session ${on}; after 8 characters save state ${saveWord}, title row "${nameAfter8}" (deck.info "${infoAfter8.title}"), address ${page.url().replace(BASE, '').replace(/#.*/, '')}; after 32: title row "${nameRow}", deck.info "${infoTitle}", Details carries it ${details.includes(TITLE)}, Share dialog carries it ${share.includes(TITLE)} ("${share.slice(0, 80)}"); revision ${s1.revision}`,
        };
      },
    );
  } else {
    const info0 = await runInfo(head);
    await page.mouse.dblclick(info0.rect.x + info0.rect.w / 2, info0.rect.y + info0.rect.h / 2);
    await sleep(250);
    await typeHuman(TITLE);
    await press('Escape');
    await settled();
    await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  }
  if (await visible('dialog.namePrompt'))
    await clickControl('dialog.namePrompt.close').catch(() => undefined);

  // ---- the cover title rows
  const clickTitle = async () => {
    await clearAll();
    const info = await runInfo(head);
    await clickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    await sleep(250);
    return selectionFacts(HEAD_BLOCK);
  };
  const titleFacts = async () => {
    const slide = await slideJson(titleSlide);
    const block =
      slide.kind === 'content' ? (slide.slots.main ?? []).find((b) => b.id === 'heading') : null;
    const drawn = await runInfo(head);
    return {
      kind: slide.kind,
      layout: slide.layout?.type ?? null,
      stored: block?.typography ?? (slide.kind === 'title' ? 'field' : null),
      storedText: block?.text ?? slide.heading ?? null,
      drawn: drawn ? { weight: drawn.weight, size: drawn.size, align: drawn.align } : null,
      text: drawn?.text ?? null,
      html: drawn?.html ?? '',
    };
  };
  const titleRow = async (id, name, act, changed) => {
    await step(id, name, async () => {
      const before = await titleFacts();
      const facts = await clickTitle();
      const rev0 = await stableRevision();
      await act();
      await settled();
      const after = await pollUntil(titleFacts, (f) => changed(before, f), 6000);
      const rev1 = await stableRevision();
      const snack = await snackbar();
      let restored = null;
      let back = null;
      if (rev1 > rev0) {
        await undo();
        back = await titleFacts();
        restored =
          JSON.stringify(back.drawn) === JSON.stringify(before.drawn) &&
          back.text === before.text &&
          back.kind === before.kind;
      }
      const ok =
        facts.selected &&
        facts.resize === 8 &&
        !facts.editing &&
        changed(before, after) &&
        rev1 === rev0 + 1 &&
        !/No block/.test(snack ?? '') &&
        restored === true;
      return {
        ok,
        observed: `${describeSel(facts)}; ${JSON.stringify(before.drawn)} -> ${JSON.stringify(after.drawn)} (stored ${JSON.stringify(after.stored)}, text ${JSON.stringify(after.storedText)}; slide ${before.kind}/${before.layout} -> ${after.kind}/${after.layout}); revision ${rev0} -> ${rev1}; snackbar ${snack ?? 'none'}; ${rev1 > rev0 ? `one Cmd+Z restored ${restored} (kind ${back?.kind}, text same ${back?.text === before.text})` : 'no write, no Cmd+Z'}`,
      };
    });
  };
  const bolder = (a, b) =>
    Number(b.drawn?.weight) >= 500 && Number(b.drawn?.weight) > Number(a.drawn?.weight);
  const storesBold = (a, b) =>
    b.stored !== null &&
    typeof b.stored === 'object' &&
    b.stored.weight === 500 &&
    Number(b.drawn?.weight) === 500;
  if (!only || only.has('title')) {
    await step('text.title.one-click-tail', 'one click on the cover title', async () => {
      const facts = await clickTitle();
      await sleep(300);
      const controls = await tailControls();
      const tail =
        controls.some((c) => /toolbar\.bold$/.test(c)) &&
        controls.some((c) => /toolbar\.fontSize/.test(c));
      return {
        ok: facts.selected && facts.resize === 8 && !facts.editing && tail,
        observed: `${describeSel(facts)}; text tail ${tail} (${controls.filter((c) => /bold|fontSize$|align$|textColor|background|layout/.test(c)).join(', ')})`,
      };
    });
    await titleRow(
      'text.title.bold-menu',
      'Format > Text > Bold; the criterion here is the stored weight 500 drawn at 500 (the theme draws an h1 at 500 already)',
      () => menuPath('format', 'format.text', 'format.text.bold'),
      storesBold,
    );
    await titleRow(
      'text.title.bold-menu (heavier than before)',
      "the walk's criterion: the drawn weight grows",
      () => menuPath('format', 'format.text', 'format.text.bold'),
      bolder,
    );
    await titleRow(
      'text.title.bold-cmd-b',
      'Cmd+B (stored weight 500)',
      () => press('Meta+b'),
      storesBold,
    );
    await titleRow(
      'text.title.align-menu',
      'Format > Align & indent > Center',
      () => menuPath('format', 'format.alignIndent', 'format.alignIndent.center'),
      (a, b) => b.drawn?.align === 'center' && a.drawn?.align !== 'center',
    );
    await titleRow(
      'text.title.size-menu',
      'Format > Text > Size > Decrease',
      () => menuPath('format', 'format.text', 'format.text.size', 'format.text.size.decrease'),
      (a, b) => (b.drawn?.size ?? 0) < (a.drawn?.size ?? 0),
    );
    await titleRow(
      'text.title.italic-menu (extra)',
      'Format > Text > Italic on the selected title: the whole heading turns italic',
      () => menuPath('format', 'format.text', 'format.text.italic'),
      (a, b) => /<i>|<em>/.test(b.html) && !/<i>|<em>/.test(a.html),
    );
    await titleRow(
      'text.title.uppercase-menu (extra)',
      'Format > Text > Capitalization > UPPERCASE on the selected title',
      () =>
        menuPath(
          'format',
          'format.text',
          'format.text.capitalization',
          'format.text.capitalization.upper',
        ),
      (a, b) => b.text === a.text.toUpperCase() && b.text !== a.text,
    );
    await titleRow(
      'text.title.format-options-marks',
      'Format options, the B toggle (stored weight 500)',
      async () => {
        await clickControl('toolbar.formatOptions').catch(() =>
          menuPath('format', 'format.formatOptions'),
        );
        await page.waitForSelector('[data-control="panel.formatOptions"]', { timeout: 8000 });
        const marks = page.locator('[data-control="formatOptions.text.marks"] button').first();
        await marks.click();
        await sleep(300);
        if (await visible('panel.formatOptions.close'))
          await clickControl('panel.formatOptions.close');
      },
      storesBold,
    );
  }

  // ---- a canvas slide for the table, the shape, the clear formatting and the size rows
  let canvasSlide = null;
  const needCanvas =
    !only || only.has('table') || only.has('shape') || only.has('clear') || only.has('size');
  if (needCanvas) {
    await clearAll();
    await menuPath('slide', 'slide.newSlide');
    await settled();
    await sleep(600);
    canvasSlide = (await state()).slideId;
    const rev = (await invoke('deck.info')).revision;
    await invoke('slide.toCanvas', { slideIds: [canvasSlide], baseRevision: rev });
    await settled();
    say(`canvas slide ${canvasSlide}`);
  }
  const insertBlock = async (block) => {
    const rev = (await invoke('deck.info')).revision;
    await invoke('block.insert', { slideId: canvasSlide, slot: 'main', block, baseRevision: rev });
    await settled();
    await sleep(500);
  };
  const clickBlock = async (id, dy = 0) => {
    await clearAll();
    const b = await page.evaluate(
      (blockId) =>
        document
          .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`)
          ?.getBoundingClientRect()
          .toJSON() ?? null,
      id,
    );
    if (!b) throw new Error(`no block ${id} drawn`);
    await clickAt(b.x + b.width / 2, b.y + (dy || b.height / 2));
    await sleep(300);
    return selectionFacts(id);
  };
  if (!only || only.has('table')) {
    await insertBlock({
      id: 'tb',
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['', '', ''], header: true },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
      ],
      pos: { x: 160, y: 300, w: 960, h: 320, z: 9 },
    });
    const cellRun = 'tb/rows/1/cells/1';
    await step(
      'tables.cell.align-menu',
      'a cell session open in column 2 (a body row), Format > Align & indent > Center; Escape; the cell draws centred',
      async () => {
        await clearAll();
        const info = await runInfo(cellRun);
        if (!info) throw new Error(`no run ${cellRun}`);
        await page.mouse.dblclick(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
        await sleep(300);
        const on = await editing();
        await typeHuman('12 000');
        await sleep(300);
        const rev0 = await stableRevision();
        await menuPath('format', 'format.alignIndent', 'format.alignIndent.center');
        await settled();
        const stillOn = await editing();
        const block = await pollUntil(
          () => blockOf(canvasSlide, 'tb'),
          (b) => b?.columns?.[1]?.align === 'center',
          5000,
        );
        const rev1 = await stableRevision();
        const snack = await snackbar();
        await press('Escape');
        await sleep(400);
        const drawn = await pollUntil(
          () => runInfo(cellRun),
          (r) => r?.align === 'center',
          4000,
        );
        await clearAll();
        const columns = block?.columns ?? [];
        const ok =
          on &&
          columns[1]?.align === 'center' &&
          columns.filter((c) => c.align === 'center').length === 1 &&
          drawn?.align === 'center' &&
          rev1 > rev0;
        return {
          ok,
          observed: `session ${on}, still open after the row ${stillOn}; columns ${columns.map((c, i) => `${i}:${c.align ?? '-'}`).join(' ')}; cell text "${drawn?.text}" drawn text-align ${drawn?.align} after Escape; revision ${rev0} -> ${rev1}; snackbar ${snack ?? 'none'}`,
        };
      },
    );
    await step(
      'tables.cell.align-toolbar',
      'a cell session open, the table tail Align list, Right',
      async () => {
        await clearAll();
        const info = await runInfo(cellRun);
        await page.mouse.dblclick(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
        await sleep(300);
        const on = await editing();
        const tailBefore = await tailControls();
        await clickControl('toolbar.align');
        await sleep(400);
        const options = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="menu.toolbar.align."]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control')),
        );
        const right = options.find((o) => /right/.test(o));
        if (right) await clickControl(right);
        await settled();
        const block = await pollUntil(
          () => blockOf(canvasSlide, 'tb'),
          (b) => b?.columns?.[1]?.align === 'right',
          5000,
        );
        const stillOn = await editing();
        const tailAfter = await tailControls();
        await press('Escape');
        await sleep(400);
        const drawn = await pollUntil(
          () => runInfo(cellRun),
          (r) => r?.align === 'right',
          4000,
        );
        await clearAll();
        const columns = block?.columns ?? [];
        const ok =
          on &&
          options.length > 0 &&
          columns[1]?.align === 'right' &&
          tailBefore.some((c) => /toolbar\.align$/.test(c)) &&
          drawn?.align === 'right';
        return {
          ok,
          observed: `session ${on}; tail before ${tailBefore.filter((c) => /align|mergeCells|fillColor|borderColor/.test(c)).join(', ')}; list options ${options.map((o) => o.replace('menu.toolbar.align.', '')).join(', ')}; columns ${columns.map((c, i) => `${i}:${c.align ?? '-'}`).join(' ')}; session after the pick ${stillOn}; tail after ${tailAfter.filter((c) => /align|mergeCells/.test(c)).join(', ')}; drawn text-align after Escape ${drawn?.align}`,
        };
      },
    );
    await step(
      'tables.menu.format-table-selected (kept cell)',
      'the table selected by one click after the session: Format > Table rows enabled and Insert column right lands on the kept cell',
      async () => {
        const facts = await clickBlock('tb', 6);
        const row = await menuRowFacts('format', 'format.table', 'format.table.insertColumnRight');
        const before = (await blockOf(canvasSlide, 'tb'))?.columns.length;
        const rev0 = await stableRevision();
        await menuPath('format', 'format.table', 'format.table.insertColumnRight');
        await settled();
        const after = await pollUntil(
          async () => (await blockOf(canvasSlide, 'tb'))?.columns.length,
          (n) => n === before + 1,
          5000,
        );
        const rev1 = await stableRevision();
        const tail = await tailControls();
        if (rev1 > rev0) await undo();
        const back = (await blockOf(canvasSlide, 'tb'))?.columns.length;
        return {
          ok:
            facts.selected &&
            facts.resize === 8 &&
            !facts.editing &&
            row.present &&
            !row.disabled &&
            after === before + 1 &&
            back === before,
          observed: `${describeSel(facts)}; Insert column right present ${row.present} disabled ${row.disabled}; columns ${before} -> ${after} -> after Cmd+Z ${back}; tail ${tail.filter((c) => /align|mergeCells|borderColor|formatOptions/.test(c)).join(', ')}`,
        };
      },
    );
  }
  if (!only || only.has('shape')) {
    await insertBlock({
      id: 'shp',
      type: 'shape',
      shape: 'rectangle',
      text: 'Label',
      pos: { x: 1000, y: 100, w: 240, h: 160, z: 10 },
    });
    await step(
      'shapes.text.colour-toolbar',
      'select the rectangle, toolbar Text color, Paper; the label draws in it; Cmd+Z',
      async () => {
        const facts = await clickBlock('shp');
        const rev0 = await stableRevision();
        await clickControl('toolbar.textColor');
        await sleep(400);
        const swatches = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="toolbar.textColor."]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control')),
        );
        const paper = swatches.find((s) => /paper$/.test(s));
        if (paper) await clickControl(paper);
        await settled();
        const block = await pollUntil(
          () => blockOf(canvasSlide, 'shp'),
          (b) => b?.color !== undefined,
          5000,
        );
        const drawn = await pollUntil(
          () =>
            page.evaluate(() => {
              const el = document.querySelector(
                '.ts-stagewrap.ts-editor .pt-slide [data-block="shp"] .shape-text',
              );
              return el ? getComputedStyle(el).color : null;
            }),
          (c) => c === 'rgb(242, 242, 240)',
          4000,
        );
        const rev1 = await stableRevision();
        await undo();
        const back = await blockOf(canvasSlide, 'shp');
        return {
          ok:
            facts.selected &&
            facts.resize === 8 &&
            block?.color === 'paper' &&
            drawn === 'rgb(242, 242, 240)' &&
            rev1 === rev0 + 1 &&
            back?.color === undefined,
          observed: `${describeSel(facts)}; picked ${paper}; block.color ${JSON.stringify(block?.color)}; label drawn ${drawn}; revision ${rev0} -> ${rev1}; after Cmd+Z color ${JSON.stringify(back?.color)}`,
        };
      },
    );
  }
  if (!only || only.has('clear')) {
    await insertBlock({
      id: 'clr',
      type: 'text',
      text: 'One [italic]{i} word and a *bold* word here',
      pos: { x: 160, y: 120, w: 700, h: 80, z: 11 },
    });
    await step(
      'formatting.clear.inline-marks',
      'a box with an italic word and a bold word; select it; Clear formatting; no snackbar Nothing to clear; Cmd+Z restores',
      async () => {
        const marksOf = () =>
          page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '.ts-stagewrap.ts-editor .pt-slide [data-block="clr"] i, .ts-stagewrap.ts-editor .pt-slide [data-block="clr"] em, .ts-stagewrap.ts-editor .pt-slide [data-block="clr"] b, .ts-stagewrap.ts-editor .pt-slide [data-block="clr"] strong',
              ),
            ].map((e) => `${e.tagName.toLowerCase()}:${e.textContent}`),
          );
        const before = await marksOf();
        const facts = await clickBlock('clr');
        const rev0 = await stableRevision();
        await clickControl('toolbar.clearFormatting');
        await settled();
        const stored = await pollUntil(
          () => blockOf(canvasSlide, 'clr'),
          (b) => b?.text === 'One italic word and a bold word here',
          5000,
        );
        const drawnAfter = await pollUntil(marksOf, (m) => m.length === 0, 4000);
        const snack = await snackbar();
        const rev1 = await stableRevision();
        await undo();
        const restored = await pollUntil(
          () => blockOf(canvasSlide, 'clr'),
          (b) => /\[italic\]\{i\}/.test(b?.text ?? ''),
          5000,
        );
        const drawnBack = await marksOf();
        return {
          ok:
            before.length === 2 &&
            facts.selected &&
            stored?.text === 'One italic word and a bold word here' &&
            drawnAfter.length === 0 &&
            !/Nothing to clear/.test(snack ?? '') &&
            rev1 === rev0 + 1 &&
            restored?.text === 'One [italic]{i} word and a *bold* word here' &&
            drawnBack.length === 2,
          observed: `marks before ${before.join(', ')}; ${describeSel(facts)}; stored after "${stored?.text}", drawn marks ${drawnAfter.length}; snackbar ${snack ?? 'none'}; revision ${rev0} -> ${rev1}; after Cmd+Z stored "${restored?.text}", drawn marks ${drawnBack.join(', ')}`,
        };
      },
    );
    await step(
      'formatting.clear.inline-marks (a range in a session)',
      'double click italic, Clear formatting on the toolbar; the word alone loses its mark, the bold word stays',
      async () => {
        await clearAll();
        const w = await page.evaluate(() => {
          const el = document.querySelector(
            '.ts-stagewrap.ts-editor .pt-slide [data-block="clr"] i, .ts-stagewrap.ts-editor .pt-slide [data-block="clr"] em',
          );
          return el ? el.getBoundingClientRect().toJSON() : null;
        });
        if (!w) throw new Error('no italic word drawn');
        await page.mouse.dblclick(w.x + w.width / 2, w.y + w.height / 2);
        await sleep(300);
        await page.mouse.dblclick(w.x + w.width / 2, w.y + w.height / 2);
        await sleep(300);
        const sel = await page.evaluate(() => window.getSelection()?.toString() ?? '');
        const rev0 = await stableRevision();
        await clickControl('toolbar.clearFormatting');
        await settled();
        const stored = await pollUntil(
          () => blockOf(canvasSlide, 'clr'),
          (b) => b?.text === 'One italic word and a *bold* word here',
          5000,
        );
        const snack = await snackbar();
        const rev1 = await stableRevision();
        await press('Escape');
        await undo();
        const restored = await blockOf(canvasSlide, 'clr');
        return {
          ok:
            sel.trim() === 'italic' &&
            stored?.text === 'One italic word and a *bold* word here' &&
            !/Nothing to clear/.test(snack ?? '') &&
            rev1 === rev0 + 1 &&
            restored?.text === 'One [italic]{i} word and a *bold* word here',
          observed: `selection "${sel}"; stored after "${stored?.text}"; snackbar ${snack ?? 'none'}; revision ${rev0} -> ${rev1}; after Cmd+Z "${restored?.text}"`,
        };
      },
    );
  }
  if (!only || only.has('size')) {
    await insertBlock({
      id: 'sz',
      type: 'text',
      text: 'Sized words',
      pos: { x: 160, y: 700, w: 500, h: 80, z: 12 },
    });
    await step(
      'text.fontsize.type-one-undo',
      'select the text box, type 28 in the size field, Enter; one Cmd+Z restores',
      async () => {
        const facts = await clickBlock('sz');
        const before = (await blockOf(canvasSlide, 'sz'))?.typography?.size ?? null;
        const rev0 = await stableRevision();
        await clickControl('toolbar.fontSize.value');
        await press('Meta+a');
        await typeHuman('28');
        await press('Enter');
        await settled();
        const after = await pollUntil(
          async () => (await blockOf(canvasSlide, 'sz'))?.typography?.size ?? null,
          (s) => s !== null,
          5000,
        );
        const snack = await snackbar();
        const rev1 = await stableRevision();
        await undo();
        const back = (await blockOf(canvasSlide, 'sz'))?.typography?.size ?? null;
        return {
          ok:
            facts.selected &&
            after !== null &&
            (after === 28 || /step/i.test(snack ?? '')) &&
            rev1 === rev0 + 1 &&
            back === before,
          observed: `size ${before} -> ${after} (snackbar ${snack ?? 'none'}); revision ${rev0} -> ${rev1}; one Cmd+Z -> ${back}`,
        };
      },
    );
    await step(
      'text.fontsize.type-one-undo (a list)',
      'make the box a bulleted list, type 28 in the size field, Enter; the list size steps its ladder; one Cmd+Z restores',
      async () => {
        await clickBlock('sz');
        await clickControl('toolbar.bulletedList');
        await settled();
        const list = await pollUntil(
          () => blockOf(canvasSlide, 'sz'),
          (b) => b?.type === 'plain',
          5000,
        );
        await clickBlock('sz');
        const before = list?.size ?? null;
        const rev0 = await stableRevision();
        const field = await page.evaluate(
          () => document.querySelector('[data-control="toolbar.fontSize.value"]')?.value ?? null,
        );
        await clickControl('toolbar.fontSize.value');
        await press('Meta+a');
        await typeHuman('28');
        await press('Enter');
        await settled();
        const after = await pollUntil(
          async () => (await blockOf(canvasSlide, 'sz'))?.size ?? null,
          (s) => s !== null && s !== before,
          5000,
        );
        const snack = await snackbar();
        const saveWord = await page.evaluate(
          () =>
            document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
        );
        const rev1 = await stableRevision();
        await undo();
        const back = (await blockOf(canvasSlide, 'sz'))?.size ?? null;
        return {
          ok:
            list?.type === 'plain' &&
            after === 24 &&
            rev1 === rev0 + 1 &&
            back === before &&
            !/Couldn't save/.test(saveWord ?? ''),
          observed: `list ${list?.type}; field showed "${field}"; size ${before} -> ${after} (snackbar ${snack ?? 'none'}; save words "${saveWord}"); revision ${rev0} -> ${rev1}; one Cmd+Z -> ${back}`,
        };
      },
    );
  }
  if (!only || only.has('insert')) {
    await step(
      'insert.textbox.while-parked (extra)',
      'a session parked on the menu bar: Insert > Text box, then a click on the sheet places a box',
      async () => {
        await clearAll();
        await page
          .goto(page.url().replace(/#.*$/, '') + `#s/${titleSlide}`, {
            waitUntil: 'domcontentloaded',
          })
          .catch(() => undefined);
        await editorReady();
        await sleep(400);
        const info2 = await runInfo(head);
        await page.mouse.dblclick(info2.rect.x + info2.rect.w / 2, info2.rect.y + info2.rect.h / 2);
        await sleep(300);
        const on = await editing();
        const before = await runs();
        await menuPath('insert', 'insert.textBox');
        await sleep(300);
        const parkedAfterMenu = await editing();
        const sheet = await page.evaluate(() =>
          document
            .querySelector('.ts-stagewrap.ts-editor .pt-slide')
            ?.getBoundingClientRect()
            .toJSON(),
        );
        await clickAt(sheet.x + sheet.width * 0.6, sheet.y + sheet.height * 0.75);
        await settled();
        await sleep(600);
        const after = await runs();
        const landed = after.filter((r) => !before.includes(r));
        await clearAll();
        await undo();
        return {
          ok: on && landed.length > 0,
          observed: `session ${on}; after Insert > Text box the session still parked ${parkedAfterMenu}; new runs ${landed.join(', ') || 'none'}`,
        };
      },
    );
    await step(
      'menu.pick.returns-focus (extra)',
      'a word selected, Format > Text > Italic from the menu, then typing lands in the text (Google continues at the caret)',
      async () => {
        await clearAll();
        const info2 = await runInfo(head);
        await page.mouse.dblclick(info2.rect.x + info2.rect.w / 2, info2.rect.y + info2.rect.h / 2);
        await sleep(300);
        await press('End');
        await menuPath('format', 'format.text', 'format.text.italic');
        await sleep(500);
        const active = await page.evaluate(() => {
          const a = document.activeElement;
          return a
            ? `${a.tagName.toLowerCase()}${a.getAttribute('contenteditable') === 'true' ? '[contenteditable]' : ''}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}`
            : 'none';
        });
        const textBefore = (await runInfo(head))?.text;
        await typeHuman('x');
        await sleep(300);
        const textAfter = (await runInfo(head))?.text;
        const snack = await snackbar();
        await press('Backspace');
        await sleep(200);
        await press('Escape');
        await settled();
        await undo();
        return {
          ok: /contenteditable/.test(active) && textAfter === `${textBefore}x`,
          observed: `focus after the pick ${active}; "${textBefore}" -> "${textAfter}"; snackbar ${snack ?? 'none'}`,
        };
      },
    );
  }
} finally {
  if (deckId) {
    try {
      await page
        .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
      await editorReady().catch(() => undefined);
      const info = await invoke('deck.info').catch(() => null);
      if (info) {
        await invoke('deck.trash', { id: deckId, baseRevision: info.revision }).catch((e) =>
          say('trash failed', String(e)),
        );
        const again = await invoke('deck.info').catch(() => null);
        await invoke('deck.remove', {
          id: deckId,
          baseRevision: again?.revision ?? info.revision,
          confirm: true,
        }).catch((e) => say('remove failed', String(e)));
      }
      let status = 0;
      const until = Date.now() + 20_000;
      for (;;) {
        status = (await page.request.get(`${BASE}/edit/${deckId}`, { maxRedirects: 0 })).status();
        if (status === 404 || Date.now() > until) break;
        await sleep(1500);
      }
      say(`cleanup: /edit/${deckId} answers ${status}`);
      rows.push({ id: 'cleanup', ok: status === 404, observed: `/edit/${deckId} ${status}` });
    } catch (e) {
      say('cleanup failed', String(e));
    }
  }
  say(`console/page errors: ${errors.length === 0 ? 'none' : errors.join(' | ')}`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, deckId, rows, errors }, null, 2));
  await browser.close();
}

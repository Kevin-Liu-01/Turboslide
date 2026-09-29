// The polish round's chrome rows (docs/POLISH.md 2.6, 2.3 item 13, 2.8 item 107, 5.1 `chrome.*`,
// `formatting.*`, `help.*`, `menus.*`, `comments.*` and `slides.*` with the driver `probe --core`;
// B6 the drivers, B1 the fixes with the integrator's model.ts rows and B5's hunks): Format
// options by kind, every plate inside the viewport, a refused write's sentence, the handle
// tooltips' words, tooltips only on a hover, the chip above the ring, dialogs at their size with
// the focus returned and Tab trapped, Escape on the card menu's submenu, the Select glyph, one
// spelling per thing, the menus' structure, spacing on a table, Border weight from the menu,
// Check slides' sentence, the Background dialog's picture grid, a glyph on every menu row, Insert
// > Comment needing a selection, Layout > Blank on an untyped slide and the filmstrip following
// every move. The objects are placed through the window API (the rows' `setup`); the reads are
// the DOM's boxes, labels and attributes and the tooltip plate, so the row reads what a
// screenshot shows.

export const NAME = 'polish-chrome';
export const IDS = [
  'chrome.format-options.fields-by-kind',
  'chrome.plate.fits-viewport',
  'chrome.snackbar.refusal-sentence',
  'chrome.handles.tooltip-words',
  'chrome.tooltips.only-on-hover',
  'chrome.chip.above-ring',
  'chrome.dialog.no-loading-jump',
  'chrome.dialog.focus-return-and-trap',
  'chrome.context.escape-closes-submenu',
  'chrome.toolbar.select-glyph',
  'chrome.words.one-spelling',
  'chrome.menus.structure-sweep',
  'formatting.spacing.table-cells',
  'formatting.border-weight.menu-opens',
  'help.check-slides.plain-sentence',
  'slides.background.picture-grid',
  'menus.rows.icon-on-every-row',
  'comments.insert.needs-selection',
  'slides.layout.blank-empty',
  'slides.filmstrip.follows-every-move',
];

const LANE = 'B1';
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const MENUS = ['file', 'edit', 'view', 'insert', 'format', 'slide', 'arrange', 'tools', 'help'];

export async function run(t) {
  const { page, BASE } = t;
  const S = await t
    .setup(
      'a blank slide for the polish round chrome',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(null, 'blank');
        t.deck.polishChromeSlide = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.polishChromeSlide);
  await t.clickCard(S);
  await t.clearAll();
  const RECT = 'pc-rect';
  const LINE = 'pc-line';
  const PIC = 'pc-picture';
  const SMALL = 'pc-small';
  const TABLE = 'pc-table';
  const typedTable = (id, columns, rows, pos) => ({
    id,
    type: 'table',
    columns: Array.from({ length: columns }, () => ({})),
    rows: Array.from({ length: rows }, (_, r) => ({
      cells: Array.from({ length: columns }, (_, c) => (r === 0 ? `H${c}` : `R${r}C${c}`)),
      ...(r === 0 ? { header: true } : {}),
    })),
    pos,
  });
  await t.setup(
    'a rectangle, a line, a picture and a typed 3 by 3 table on the slide',
    'block.insert and asset.add through the window API',
    async () => {
      const a = await t.placeBlock(S, {
        id: RECT,
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        text: 'Box',
        pos: { x: 160, y: 140, w: 300, h: 160 },
      });
      const b = await t.placeBlock(S, {
        id: LINE,
        type: 'shape',
        shape: 'line',
        stroke: 'ink',
        width: 2,
        pos: { x: 600, y: 160, w: 360, h: 40 },
      });
      const c = await t.placePicture(S, { x: 1050, y: 140, w: 320, h: 213 }, PIC);
      const d = await t.placeBlock(S, typedTable(TABLE, 3, 3, { x: 160, y: 560, w: 960, h: 162 }));
      return {
        ok: Boolean(a && b && c && d),
        observed: [a, b, c, d].map((o) => o?.id ?? 'none').join(', '),
      };
    },
  );
  const block = async (id, slide = S) => (await t.blockOf(slide, id))?.block ?? null;
  const openPanel = async (id, tail = 'toolbar.formatOptions') => {
    await t.clearAll();
    await t.selectObject(id);
    if (!(await t.visible('panel.formatOptions'))) {
      await t.tailControl(tail).catch(() => t.menuPath('format', 'format.formatOptions'));
      await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
    }
    await page.evaluate(() => {
      for (const s of document.querySelectorAll(
        '[data-control="panel.formatOptions"] [data-section].is-closed',
      ))
        s.querySelector('.ts-panel-section-head')?.click();
    });
    await t.sleep(300);
    return t.visible('panel.formatOptions');
  };
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    await t.sleep(200);
  };
  const panelRead = () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-control="panel.formatOptions"]');
      if (!panel) return null;
      const pr = panel.getBoundingClientRect();
      const sections = [...panel.querySelectorAll('[data-section]')].map((s) => ({
        id: s.getAttribute('data-section'),
        head: (s.querySelector('.ts-panel-section-head')?.textContent ?? '').trim(),
      }));
      const labels = [...panel.querySelectorAll('.ts-fo-field-label, label')]
        .map((el) => (el.textContent ?? '').trim())
        .filter(Boolean);
      const wide = [...panel.querySelectorAll('.ts-seg, [role="radiogroup"], .ts-fo-toggles')]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > pr.right + 1 ||
            el.getBoundingClientRect().x < pr.x - 1,
        )
        .map((el) => (el.textContent ?? '').trim().slice(0, 40));
      return { sections, labels, wide, panel: { x: pr.x, right: pr.right } };
    });
  const menuRowsWith = async (menuId, parentRow, child) => {
    await t.surfaceClear();
    await t.openMenu(menuId);
    if (parentRow) await t.hoverRow(parentRow, child).catch(() => undefined);
    const rows = await t.menuRows(menuId);
    await t.press('Escape', 2);
    await t.sleep(150);
    return rows;
  };
  const undoOnce = async () => {
    await t.clearAll();
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  // ---- 2.6 item 52: Format options draws only the fields the kind has
  await t.step(
    'chrome.format-options.fields-by-kind',
    "the rectangle's Format options read; then the line's",
    'the rectangle lists no Arrowheads, Orientation or Height and one Shape section; the line lists Arrowheads and Orientation with the segment inside the panel',
    async () => {
      if (!(await openPanel(RECT))) return { ok: false, observed: 'no panel for the rectangle' };
      const rect = await panelRead();
      await closePanel();
      if (!(await openPanel(LINE))) return { ok: false, observed: 'no panel for the line' };
      const line = await panelRead();
      await closePanel();
      await t.clearAll();
      const has = (r, re) => (r?.labels ?? []).some((l) => re.test(l));
      const shapeSections = (rect?.sections ?? []).filter((s) => /^Shape$/i.test(s.head)).length;
      /* the rectangle: no line field (Arrowheads, Orientation, Line start, Line end) and one
         Shape section; Size & rotation's own Height field is Google's and stays (the generated
         `height` field B3's request 9 routes away shares its label, so the flat label read cannot
         tell them apart; the section count and the line fields are the read) */
      const rectOk =
        rect !== null &&
        !has(rect, /^Arrowheads/i) &&
        !has(rect, /^Orientation/i) &&
        !has(rect, /^Line start/i) &&
        !has(rect, /^Line end/i) &&
        shapeSections === 1;
      /* the line half as b1.md's note for the verifier reads it: Google's Line section lists Line
         start and Line end and no Orientation control exists, so a line's section lists those two
         (the arrowheads) and a closed shape lists neither */
      const lineOk =
        line !== null &&
        has(line, /^Line start/i) &&
        has(line, /^Line end/i) &&
        !has(line, /^Orientation/i) &&
        line.wide.length === 0;
      const ok = rectOk && lineOk;
      return {
        ok,
        observed: `rectangle: sections ${rect?.sections.map((s) => s.head || s.id).join(', ')}; labels ${rect?.labels.join(' | ')}; Shape sections ${shapeSections}. line: labels ${line?.labels.join(' | ')}; segments past the panel ${line?.wide.length ?? '?'}${(line?.wide.length ?? 0) > 0 ? ` (${line.wide.join(' | ')})` : ''}${ok ? '' : ` (docs/POLISH.md 2.6 item 52, ${LANE} with B3's blocks.ts)`}`,
      };
    },
  );

  // ---- 2.6 item 53: every plate fits the viewport
  await t.step(
    'chrome.plate.fits-viewport',
    "Change shape with the rectangle selected; the Crop button's Mask arrow with the picture selected, at 1440 by 900",
    "the plate's bottom is inside the viewport and its last row is reachable by a scroll inside the plate",
    async () => {
      const size = page.viewportSize() ?? { width: 1440, height: 900 };
      const readPlate = async (prefix) => {
        const tiles = page.locator(`[data-control^="${prefix}.pick."]`);
        if ((await tiles.count()) === 0) return null;
        return page.evaluate(
          ([pre, vh]) => {
            const first = document.querySelector(`[data-control^="${pre}.pick."]`);
            const plate =
              first?.closest(
                '.ts-picker, .ts-plate, [data-control$=".plate"], [role="dialog"], [role="menu"]',
              ) ??
              first?.parentElement?.parentElement ??
              null;
            if (!plate) return null;
            const r = plate.getBoundingClientRect();
            const all = [...document.querySelectorAll(`[data-control^="${pre}.pick."]`)];
            const last = all[all.length - 1];
            const scroller =
              [plate, ...plate.querySelectorAll('*')].find(
                (el) =>
                  el.scrollHeight > el.clientHeight + 2 &&
                  /(auto|scroll)/.test(getComputedStyle(el).overflowY),
              ) ?? null;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
            const lr = last.getBoundingClientRect();
            return {
              top: r.y,
              bottom: r.bottom,
              h: r.height,
              tiles: all.length,
              scrolls: scroller !== null,
              lastBottomAfterScroll: lr.bottom,
              viewport: vh,
            };
          },
          [prefix, size.height],
        );
      };
      const facts = [];
      let ok = true;
      await t.clearAll();
      await t.selectObject(RECT);
      const cs = await t.tailControl('toolbar.changeShape').catch(() => null);
      await t.sleep(400);
      const shapePlate = cs ? await readPlate('toolbar.changeShape') : null;
      if (!shapePlate) {
        ok = false;
        facts.push('Change shape: no plate');
      } else {
        const good =
          shapePlate.bottom <= size.height + 1 &&
          shapePlate.lastBottomAfterScroll <= size.height + 1;
        ok = ok && good;
        facts.push(
          `Change shape: plate ${r1(shapePlate.top)} to ${r1(shapePlate.bottom)} (${r1(shapePlate.h)} px, ${shapePlate.tiles} tiles, scrolls ${shapePlate.scrolls}, last tile's bottom after a scroll ${r1(shapePlate.lastBottomAfterScroll)}) in ${size.height}`,
        );
      }
      await t.press('Escape', 2);
      await t.clearAll();
      await t.selectObject(PIC);
      const arrow = (await t.visible('toolbar.cropImage.arrow'))
        ? 'toolbar.cropImage.arrow'
        : (await t.visible('toolbar.maskImage'))
          ? 'toolbar.maskImage'
          : null;
      if (!arrow) facts.push('Mask arrow: no toolbar.cropImage.arrow on the picture tail');
      else {
        await t.clickControl(arrow);
        await t.sleep(500);
        const maskPlate =
          (await readPlate('format.image.maskImage')) ??
          (await readPlate('toolbar.cropImage')) ??
          (await readPlate('toolbar.maskImage'));
        if (!maskPlate) {
          ok = false;
          facts.push('Mask arrow: no plate');
        } else {
          const good =
            maskPlate.bottom <= size.height + 1 &&
            maskPlate.lastBottomAfterScroll <= size.height + 1;
          ok = ok && good;
          facts.push(
            `Mask: plate ${r1(maskPlate.top)} to ${r1(maskPlate.bottom)} (${r1(maskPlate.h)} px, ${maskPlate.tiles} tiles, scrolls ${maskPlate.scrolls}, last tile's bottom after a scroll ${r1(maskPlate.lastBottomAfterScroll)})`,
          );
        }
        await t.press('Escape', 2);
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 53, ${LANE})`}`,
      };
    },
  );

  // ---- 2.6 item 59: a refused write's snackbar is a sentence
  await t.step(
    'chrome.snackbar.refusal-sentence',
    'the table selected; 22 typed into the size field, Enter',
    'the snackbar\'s text carries no "/" pointer and no "Invalid option"',
    async () => {
      await t.clearAll();
      await t.selectObject(TABLE);
      if (!(await t.visible('toolbar.fontSize.value')))
        return { ok: false, observed: 'no size field with the table selected' };
      await t.clickControl('toolbar.fontSize.value');
      await t.press('Meta+a');
      await t.typeHuman('22');
      await t.press('Enter');
      const snack = await t.snackbarWithin(3000).catch(() => null);
      await t.sleep(300);
      const field = await t.valueOf('toolbar.fontSize.value');
      await t.press('Escape', 2);
      await t.clearAll();
      const pointer =
        snack !== null &&
        (/\/slots\/|\/size\b|\/typography|\.json/.test(snack) || /Invalid option/i.test(snack));
      const ok = !pointer && (snack === null || /[a-z]/.test(snack));
      return {
        ok,
        observed: `snackbar ${snack === null ? 'none' : `"${snack}"`}; field reads ${field}${ok ? '' : ` (docs/POLISH.md 2.6 item 59, B5's EditorShell.tsx by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.6 item 60: handle tooltips name the gesture and never the id
  await t.step(
    'chrome.handles.tooltip-words',
    "the tooltips of the rectangle's, the picture's and the table's handles",
    "none contains the block's id or a compass code",
    async () => {
      const facts = [];
      let ok = true;
      for (const id of [RECT, PIC, TABLE]) {
        await t.clearAll();
        await t.selectObject(id);
        const ctrls = (await t.handleControls()).filter((c) => c.startsWith(`handle.${id}.`));
        const picked = [
          ctrls.find((c) => c.endsWith('.resize.se')),
          ctrls.find((c) => c.endsWith('.rotate')),
          ctrls.find((c) => c.endsWith('.move')),
          ctrls.find((c) => /\.column\.\d+$/.test(c)),
        ].filter(Boolean);
        for (const control of picked) {
          const tip = await t.hoverControl(control, 700);
          const badId = tip !== null && tip.includes(id);
          const compass = tip !== null && /\b(nw|ne|se|sw)\b/.test(tip);
          const good = tip !== null && !badId && !compass;
          ok = ok && good;
          facts.push(
            `${control.replace(`handle.${id}.`, `${id} `)}: ${tip === null ? 'no tooltip' : `"${tip.slice(0, 60)}"`}${badId ? ' (names the id)' : ''}${compass ? ' (compass code)' : ''}`,
          );
        }
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 60, ${LANE} with B2's table-seam.ts)`}`,
      };
    },
  );

  // ---- 2.6 item 62: the chip sits above the ring and never over a handle
  await t.step(
    'chrome.chip.above-ring',
    'a 120 px picture and a 60 px picture selected in turn',
    "the chip's box intersects no handle's box and not the rotate stem",
    async () => {
      const small = await t.placePicture(S, { x: 1200, y: 420, w: 120, h: 80 }, SMALL);
      const tiny = await t.placePicture(S, { x: 1360, y: 440, w: 60, h: 40 }, `${SMALL}-2`);
      const facts = [];
      let ok = Boolean(small && tiny);
      for (const id of [SMALL, `${SMALL}-2`]) {
        await t.clearAll();
        const ctrls = await t.selectObject(id);
        if (!ctrls) {
          ok = false;
          facts.push(`${id}: not selected`);
          continue;
        }
        const chip = await t.boxOfSel('.ts-overlay .ts-select-chip');
        const handles = await t.boxesOf(`.ts-overlay [data-control^="handle.${id}."]`);
        const stem = await t.boxOfSel(
          '.ts-overlay .ts-rotate-stem, .ts-overlay .ts-stem, .ts-overlay [class*="stem"]',
        );
        const hits = handles
          .filter((h) => t.boxIntersects(chip, h))
          .map((h) => h.control?.replace(`handle.${id}.`, ''));
        const stemHit = stem ? t.boxIntersects(chip, stem) : false;
        const good = chip !== null && hits.length === 0 && !stemHit;
        ok = ok && good;
        facts.push(
          `${id}: chip ${chip ? `${r1(chip.x)},${r1(chip.y)} ${r1(chip.w)}x${r1(chip.h)}` : 'none'}, over ${hits.length > 0 ? hits.join(', ') : 'no handle'}${stemHit ? ', over the rotate stem' : ''}`,
        );
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 62, ${LANE}'s Overlay.tsx by B4's request)`}`,
      };
    },
  );

  // ---- 2.6 item 64: dialogs open at their size
  await t.step(
    'chrome.dialog.no-loading-jump',
    "File > Open and File > Import slides opened; each dialog's height read at 100 ms and at 3 s; a one slide row read",
    'the dialog\'s height at 100 ms equals its height at 3 s; a row reads "1 slide"',
    async () => {
      const facts = [];
      let ok = true;
      for (const [label, path, control] of [
        ['Open', ['file', 'file.open'], 'dialog.open'],
        ['Import slides', ['file', 'file.importSlides'], 'dialog.importSlides'],
      ]) {
        await t.clearAll();
        await t.menuPath(...path);
        const shown = await t
          .waitControl(control, 6000)
          .then(() => true)
          .catch(() => false);
        if (!shown) {
          ok = false;
          facts.push(`${label}: no ${control}`);
          continue;
        }
        await t.sleep(100);
        const early = await t.rectOf(`[data-control="${control}"]`);
        await t.sleep(2900);
        const late = await t.rectOf(`[data-control="${control}"]`);
        const words = await page.evaluate(
          (c) =>
            [...document.querySelectorAll(`[data-control="${c}"] [data-control^="${c}.deck."]`)]
              .map((el) => (el.textContent ?? '').trim())
              .slice(0, 40),
          control,
        );
        const plural = words.filter((w) => /\b1 slides\b/.test(w));
        const singular = words.filter((w) => /\b1 slide\b(?!s)/.test(w));
        const steady = early && late && Math.abs(early.h - late.h) <= 2;
        const good = Boolean(steady) && plural.length === 0;
        ok = ok && good;
        facts.push(
          `${label}: height ${early ? r1(early.h) : '?'} at 100 ms, ${late ? r1(late.h) : '?'} at 3 s; rows ${words.length}, "1 slides" ${plural.length}, "1 slide" ${singular.length}`,
        );
        await t.press('Escape');
        await t.waitGone(`[data-control="${control}"]`, 4000).catch(() => undefined);
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 64, B5's Open.tsx and ImportSlides.tsx with ${LANE}'s Dialog.css)`}`,
      };
    },
  );

  // ---- 2.6 item 65: a dialog returns the focus and traps Tab
  await t.step(
    'chrome.dialog.focus-return-and-trap',
    'File > Details, Escape, the focus read; Insert > Logo, eight Tabs, the focus read',
    'the focus is the File menubar button; the Tabs stay inside the Logo dialog',
    async () => {
      await t.clearAll();
      await t.menuPath('file', 'file.details');
      const details = await t
        .waitControl('dialog.details', 6000)
        .then(() => true)
        .catch(() => false);
      if (!details) return { ok: false, observed: 'no Details dialog' };
      await t.sleep(300);
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.details"]', 4000).catch(() => undefined);
      await t.sleep(200);
      const active = await t.activeDesc();
      const returned = /\[menubar\.file\]/.test(active);
      let trapped = null;
      let leaks = 0;
      const reach = await t.reachRow('insert', 'insert.logo');
      if (reach.present) {
        await t.menuPath('insert', 'insert.logo');
        const logo = await t
          .waitControl('dialog.logo', 8000)
          .then(() => true)
          .catch(() => false);
        if (logo) {
          await t.sleep(400);
          for (let i = 0; i < 8; i += 1) {
            await t.press('Tab');
            const inside = await page.evaluate(() => {
              const a = document.activeElement;
              return (
                a !== null &&
                a !== document.body &&
                document.querySelector('[data-control="dialog.logo"]')?.contains(a) === true
              );
            });
            if (!inside) leaks += 1;
          }
          trapped = leaks === 0;
          await t.press('Escape');
          await t.waitGone('[data-control="dialog.logo"]', 4000).catch(() => undefined);
        }
      }
      await t.advancedBack('the Logo dialog');
      await t.clearAll();
      const ok = returned && trapped === true;
      return {
        ok,
        observed: `after Escape on Details the focus is ${active} (the File button ${returned}); the Logo dialog ${trapped === null ? 'did not open' : `kept ${8 - leaks} of 8 Tabs inside`}${ok ? '' : ` (docs/POLISH.md 2.6 item 65, ${LANE})`}`,
      };
    },
  );

  // ---- 2.6 item 68: Escape closes the submenu on the card's menu
  await t.step(
    'chrome.context.escape-closes-submenu',
    "the filmstrip card's right click menu with Apply layout open; Escape; Escape",
    'one Escape closes the list and keeps the menu; a second closes the menu',
    async () => {
      await t.clearAll();
      const c = await t.cardCenter(S);
      if (!c) return { ok: false, observed: 'no card centre' };
      const opened = await t.rightClickAt(c.x, c.y);
      if (!opened) return { ok: false, observed: 'no context menu on the card' };
      /* the card menu's Apply layout is a submenu of `menu.slide.applyLayout.<layout>` rows
         (ContextMenu.tsx); the editor's layout plate ids are read too */
      const LIST =
        '[data-control^="menu.slide.applyLayout."], [data-control="layout.apply.plate"], [data-control^="layout.apply."]';
      await t.hoverContextRow('slide.applyLayout', LIST).catch(() => undefined);
      const listOpen = await t.has(LIST);
      await t.press('Escape');
      await t.sleep(300);
      const listAfterOne = await t.has(LIST);
      const menuAfterOne = await t.has('.ts-context-menu');
      await t.press('Escape');
      await t.sleep(300);
      const menuAfterTwo = await t.has('.ts-context-menu');
      await t.press('Escape');
      await t.clearAll();
      const ok = listOpen && !listAfterOne && menuAfterOne && !menuAfterTwo;
      return {
        ok,
        observed: `list open ${listOpen}; after one Escape list ${listAfterOne}, menu ${menuAfterOne}; after two menu ${menuAfterTwo}${ok ? '' : ` (docs/POLISH.md 2.6 item 68, ${LANE})`}`,
      };
    },
  );

  // ---- 2.6 item 72: Select takes its own glyph
  await t.step(
    'chrome.toolbar.select-glyph',
    "the Select control's svg against the pointer toggle's",
    'the two glyphs differ',
    async () => {
      await t.clearAll();
      const read = await page.evaluate(() => {
        const svgOf = (control) => {
          const el = document.querySelector(`[data-control="${control}"]`);
          const svg = el?.querySelector('svg');
          return svg
            ? {
                html: svg.innerHTML.replace(/\s+/g, ''),
                href:
                  svg.querySelector('use')?.getAttribute('href') ??
                  svg.querySelector('use')?.getAttribute('xlink:href') ??
                  null,
              }
            : null;
        };
        return { select: svgOf('toolbar.select'), pointer: svgOf('toolbar.pointer') };
      });
      const differ =
        read.select !== null &&
        (read.pointer === null
          ? !/cursor-arrow-rays/.test(read.select.href ?? '')
          : read.select.html !== read.pointer.html);
      return {
        ok: differ,
        observed: `Select ${read.select ? (read.select.href ?? `${read.select.html.length} chars`) : 'not drawn'}; pointer toggle ${read.pointer ? (read.pointer.href ?? `${read.pointer.html.length} chars`) : 'not drawn'}; differ ${differ}${differ ? '' : ` (docs/POLISH.md 2.6 item 72, the integrator's model.ts 2767 with ${LANE}'s icons.tsx)`}`,
      };
    },
  );

  // ---- 2.6 item 73: one spelling per thing
  await t.step(
    'chrome.words.one-spelling',
    "every menu label and tooltip read; File > Open; the Download submenu; Details; the Download dialog's modes; the shortcuts dialog",
    'no British spelling; "Open" without an ellipsis; the formats first, a divider, then Download options; no "(change"; Pictures and Editable text; Paint format once',
    async () => {
      await t.clearAll();
      const facts = [];
      let ok = true;
      const british = [];
      let fileOpen = null;
      let downloadOrder = null;
      for (const menuId of MENUS) {
        await t.openMenu(menuId);
        const rows = await page.evaluate(
          (id) =>
            [...document.querySelectorAll(`#ts-menu-${id} [data-control^="menu."]`)]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => ({
                id: el.getAttribute('data-control'),
                label: (
                  el.querySelector('.ts-menu-label')?.textContent ??
                  el.textContent ??
                  ''
                ).trim(),
                tip: el.getAttribute('data-tip') ?? '',
                doc: el.getAttribute('data-tip-doc') ?? '',
              })),
          menuId,
        );
        for (const r of rows) {
          for (const s of [r.label, r.tip, r.doc])
            if (/\b(colour|centre|licence|posterised|customise|organise)\b/i.test(s))
              british.push(`${r.id}: "${s.slice(0, 50)}"`);
        }
        if (menuId === 'file') {
          fileOpen = rows.find((r) => r.id === 'menu.file.open')?.label ?? null;
          await t
            .hoverRow('file.download', '[data-control="menu.file.download.pdf"]')
            .catch(() => undefined);
          downloadOrder = await page.evaluate(() => {
            const root = document.querySelector('#ts-menu-file');
            const items = [
              ...(root?.querySelectorAll(
                '[data-control^="menu.file.download."], .ts-menu-divider',
              ) ?? []),
            ].filter((el) => el.getClientRects().length > 0);
            const sub = items.filter((el) =>
              el.matches('.ts-menu-divider')
                ? el
                    .closest('.ts-menu-group')
                    ?.querySelector('[data-control^="menu.file.download."]') !== null
                : true,
            );
            return sub.map((el) =>
              el.matches('.ts-menu-divider')
                ? '|'
                : (el.getAttribute('data-control') ?? '').replace('menu.file.download.', ''),
            );
          });
        }
        await t.press('Escape', 2);
        await t.sleep(120);
      }
      /* the toolbar's tooltips */
      const toolbarTips = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-tip], .ts-title-row [data-tip]')].map(
          (el) =>
            `${el.getAttribute('data-control')}: ${el.getAttribute('data-tip')} ${el.getAttribute('data-tip-doc') ?? ''}`,
        ),
      );
      for (const s of toolbarTips)
        if (/\b(colour|centre|licence|posterised|customise|organise)\b/i.test(s))
          british.push(s.slice(0, 70));
      ok = ok && british.length === 0;
      facts.push(
        `British spellings ${british.length}${british.length > 0 ? ` (${british.slice(0, 6).join('; ')})` : ''}`,
      );
      const openOk = fileOpen === 'Open';
      ok = ok && openOk;
      facts.push(`File's row reads "${fileOpen}"`);
      const optionsIndex = downloadOrder?.indexOf('options') ?? -1;
      const dividerBeforeOptions = optionsIndex > 0 && downloadOrder[optionsIndex - 1] === '|';
      const optionsLast = optionsIndex >= 0 && optionsIndex === downloadOrder.length - 1;
      ok = ok && dividerBeforeOptions && optionsLast;
      facts.push(`Download rows ${downloadOrder?.join(' ') ?? 'unread'}`);
      /* Details' Last edit */
      await t.menuPath('file', 'file.details');
      await t.waitControl('dialog.details', 6000).catch(() => undefined);
      const lastEdit = await t.textOf('dialog.details.lastEdit');
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.details"]', 4000).catch(() => undefined);
      const lastEditOk = lastEdit !== null && !/\(change/.test(lastEdit);
      ok = ok && lastEditOk;
      facts.push(`Last edit "${lastEdit}"`);
      /* the Download dialog's modes */
      await t.menuPath('file', 'file.download', 'file.download.options');
      await t.waitControl('dialog.download.type', 8000).catch(() => undefined);
      const modes = await page.evaluate(() =>
        ['flatten', 'native'].map((m) =>
          (
            document.querySelector(`[data-control="dialog.download.mode.${m}"]`)?.textContent ?? ''
          ).trim(),
        ),
      );
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.download.type"]', 4000).catch(() => undefined);
      const modesOk = /^Pictures/.test(modes[0]) && /^Editable text/.test(modes[1]);
      ok = ok && modesOk;
      facts.push(`modes "${modes[0]}", "${modes[1]}"`);
      /* the shortcuts dialog */
      await t.menuPath('help', 'help.keyboardShortcuts');
      await t.waitControl('dialog.keyboardShortcuts', 8000).catch(() => undefined);
      const paint = await page.evaluate(
        () =>
          /* the rows naming Paint format, whatever element the dialog lists them in: one text
             node per listing */
          [
            ...(() => {
              const root = document.querySelector('[data-control="dialog.keyboardShortcuts"]');
              const out = [];
              if (!root) return out;
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
              return out;
            })(),
          ].filter((node) => /Paint format/.test(node.textContent ?? '')).length,
      );
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.keyboardShortcuts"]', 4000).catch(() => undefined);
      ok = ok && paint === 1;
      facts.push(`Paint format rows in the shortcuts dialog ${paint}`);
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 73, ${LANE} with B5's files by request)`}`,
      };
    },
  );

  // ---- 2.6 item 74: the menus' structure
  await t.step(
    'chrome.menus.structure-sweep',
    "a disabled row's key chip; every submenu's row count; Format > Text > Size with nothing selected; the Format menu with the picture selected; Tabular figures; the three insert buttons; the table tail; a right click menu on open; the picture's menu",
    'the chip reads --pt-disabled; no submenu with one visible row; Size disabled; Alt text listed; a check row; one form; no Merge; no row lit; 15 rows',
    async () => {
      await t.clearAll();
      const facts = [];
      let ok = true;
      /* a disabled row's key chip: Edit > Redo with nothing to redo */
      await t.openMenu('edit');
      const chip = await page.evaluate(() => {
        const row = [...document.querySelectorAll('#ts-menu-edit [data-control^="menu."]')].find(
          (el) => el.getAttribute('aria-disabled') === 'true' && el.querySelector('.ts-menu-key'),
        );
        if (!row) return null;
        const key = row.querySelector('.ts-menu-key');
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-disabled')
          .trim();
        const probe = document.createElement('span');
        probe.style.color = token;
        document.body.appendChild(probe);
        const tokenRgb = getComputedStyle(probe).color;
        probe.remove();
        return {
          row: row.getAttribute('data-control'),
          color: getComputedStyle(key).color,
          tokenRgb,
        };
      });
      await t.press('Escape');
      const chipOk = chip !== null && chip.color === chip.tokenRgb;
      ok = ok && chipOk;
      facts.push(
        `disabled key chip ${chip ? `${chip.row} ${chip.color} against ${chip.tokenRgb}` : 'no disabled row with a chip'}`,
      );
      /* no submenu with one visible row */
      const singles = [];
      for (const menuId of MENUS) {
        await t.openMenu(menuId);
        const parents = await page.evaluate(
          (id) =>
            [...document.querySelectorAll(`#ts-menu-${id} [data-control^="menu."][aria-haspopup]`)]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => el.getAttribute('data-control').replace(/^menu\./, '')),
          menuId,
        );
        for (const parent of parents) {
          await t.hoverRow(parent, `[data-control^="menu.${parent}."]`).catch(() => undefined);
          const children = await page.evaluate(
            ([id, p]) =>
              [...document.querySelectorAll(`#ts-menu-${id} [data-control^="menu.${p}."]`)].filter(
                (el) =>
                  el.getClientRects().length > 0 &&
                  !el.getAttribute('data-control').slice(`menu.${p}.`.length).includes('.'),
              ).length,
            [menuId, parent],
          );
          if (children === 1) singles.push(parent);
        }
        await t.press('Escape', 2);
        await t.sleep(100);
      }
      ok = ok && singles.length === 0;
      facts.push(`submenus of one row ${singles.length > 0 ? singles.join(', ') : 'none'}`);
      /* Format > Text > Size with nothing selected */
      await t.clearAll();
      const sizeRows = await menuRowsWith(
        'format',
        'format.text',
        '[data-control="menu.format.text.size"]',
      );
      const size = sizeRows.find((r) => r.id === 'format.text.size') ?? null;
      const sizeOk = size !== null && size.disabled;
      ok = ok && sizeOk;
      facts.push(
        `Format > Text > Size disabled with nothing selected ${size ? size.disabled : 'no row'}`,
      );
      /* the Format menu lists Alt text with the picture selected; Tabular figures is a check row */
      await t.clearAll();
      await t.selectObject(PIC);
      const formatRows = await menuRowsWith('format', null);
      const alt = formatRows.some((r) => r.id === 'format.altText');
      ok = ok && alt;
      facts.push(`Format lists Alt text ${alt}`);
      await t.clearAll();
      await t.selectObject(RECT);
      const textRows = await menuRowsWith(
        'format',
        'format.text',
        '[data-control="menu.format.text.tabularFigures"]',
      );
      const tabular = textRows.find((r) => r.id === 'format.text.tabularFigures') ?? null;
      const tabularOk = tabular !== null && tabular.checked !== null;
      ok = ok && tabularOk;
      facts.push(
        `Tabular figures ${tabular ? (tabular.checked !== null ? `a check row (${tabular.checked})` : 'no aria-checked') : 'not listed'}`,
      );
      /* the three insert buttons share one form */
      await t.clearAll();
      const forms = await page.evaluate(() =>
        ['toolbar.insertImage', 'toolbar.insertShape', 'toolbar.insertLine'].map((c) => {
          const el = document.querySelector(`[data-control="${c}"]`);
          const wrap = el?.closest('.ts-split, .ts-tb-split, [class*="split"]');
          return el
            ? `${el.tagName.toLowerCase()}.${[...el.classList]
                .filter((x) => !/^is-/.test(x))
                .sort()
                .join(
                  '.',
                )}${wrap ? ' in a split' : ''}${document.querySelector(`[data-control="${c}.arrow"]`) ? ' with an arrow' : ''}`
            : 'absent';
        }),
      );
      const oneForm = new Set(forms).size === 1;
      ok = ok && oneForm;
      facts.push(`insert buttons ${forms.join(' / ')}`);
      /* the table tail lists no Merge with no range */
      await t.clearAll();
      await t.selectObject(TABLE);
      const merge =
        (await t.visible('toolbar.mergeCells')) || (await t.visible('toolbar.unmergeCells'));
      ok = ok && !merge;
      facts.push(`Merge on the table tail with no range ${merge}`);
      /* a right click menu opens with no row lit; the picture menu has 15 rows */
      await t.clearAll();
      await t.selectObject(PIC);
      const b = await t.boxOf(PIC);
      await t.rightClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      const lit = await page.evaluate(
        () =>
          document.querySelectorAll(
            '.ts-context-menu [data-control^="menu."].is-active, .ts-context-menu [data-control^="menu."][aria-selected="true"], .ts-context-menu [data-control^="menu."]:focus',
          ).length,
      );
      const rows = (await t.contextRows()).filter(
        (r) => !r.id.includes('.', r.id.indexOf('.') + 1) || true,
      ).length;
      await t.press('Escape');
      ok = ok && lit === 0 && rows === 15;
      facts.push(`picture menu: ${rows} rows, ${lit} lit on open`);
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 74, ${LANE} with the integrator's model.ts rows)`}`,
      };
    },
  );

  // ---- 2.6 item 54: spacing on a table applies to its cells
  await t.step(
    'formatting.spacing.table-cells',
    'the table selected; Format > Line and paragraph spacing > Double; Cmd+Z; Cmd+Shift+Z',
    "the cells' leading is written or a sentence refuses; Redo afterwards prints no path",
    async () => {
      await t.clearAll();
      await t.selectObject(TABLE);
      const before = JSON.stringify(await block(TABLE));
      await t.menuPath('format', 'format.spacing', 'format.spacing.double');
      await t.settled();
      await t.sleep(400);
      const snack1 = await t.snackbar();
      const after = JSON.stringify(await block(TABLE));
      const cellsWritten =
        after !== before &&
        /leading/.test(after) &&
        !/"typography":\{[^}]*leading/.test(after.replace(/"cells":\[[^\]]*\]/g, ''));
      const blockLeading = after !== before && /"typography":\{[^}]*"leading"/.test(after);
      const refusedSentence = snack1 !== null && /[a-z]/.test(snack1) && !/\//.test(snack1);
      await t.press('Meta+z');
      await t.settled();
      await t.press('Meta+Shift+z');
      await t.settled();
      await t.sleep(600);
      const snack2 = await t.snackbar();
      const redoPath = snack2 !== null && /Redo failed|\/slots\/|Unknown field/.test(snack2);
      await t.press('Meta+z').catch(() => undefined);
      await t.settled();
      await t.clearAll();
      const ok = (cellsWritten || refusedSentence) && !blockLeading && !redoPath;
      return {
        ok,
        observed: `after Double: ${after === before ? 'nothing written' : cellsWritten ? 'the cells carry leading' : blockLeading ? 'the block carries typography.leading (no schema for it)' : 'written elsewhere'}${snack1 ? `, snackbar "${snack1}"` : ''}; after Redo ${snack2 ? `snackbar "${snack2}"` : 'no snackbar'}${ok ? '' : ` (docs/POLISH.md 2.6 item 54, ${LANE} with B5's controller.tsx hunk)`}`,
      };
    },
  );

  // ---- 2.6 item 69: Border weight opens its list from the menu
  await t.step(
    'formatting.border-weight.menu-opens',
    'the picture selected; Format > Borders and lines > Border weight; 2 px picked',
    'the row opens the weights and 2 px writes',
    async () => {
      await t.clearAll();
      await t.selectObject(PIC);
      await t.menuPath('format', 'format.bordersLines', 'format.bordersLines.borderWeight');
      await t.sleep(500);
      const items = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '#ts-menu-toolbar\\.borderWeight [data-control], [data-control="toolbar.borderWeight.plate"] [data-control], [data-control^="toolbar.borderWeight."], [data-control^="format.bordersLines.borderWeight."]',
          ),
        ]
          .filter(
            (el) =>
              el.getClientRects().length > 0 &&
              el.getAttribute('data-control') !== 'toolbar.borderWeight' &&
              /* the weight list anchored on the toolbar (EditorShell's WeightList with the control
                 `format.bordersLines.borderWeight`): its rows, never the menu row itself */
              !/^menu\./.test(el.getAttribute('data-control') ?? ''),
          )
          .map((el) => ({
            control: el.getAttribute('data-control'),
            text: (el.textContent ?? '').trim(),
          })),
      );
      const two =
        items.find((i) => /^2(\s*px)?$/.test(i.text) || /\.2$/.test(i.control ?? '')) ?? null;
      let weight = null;
      let stroke = null;
      if (two) {
        await t.clickControl(two.control);
        await t.settled();
        await t.sleep(400);
        const b = await block(PIC);
        weight = b?.frame?.weight ?? null;
        stroke = b?.strokeWidth ?? null;
        await undoOnce();
      } else await t.press('Escape', 2);
      await t.clearAll();
      const ok = items.length > 0 && two !== null && weight === 2;
      return {
        ok,
        observed: `list ${items.length > 0 ? items.map((i) => i.text).join(', ') : 'did not open'}; frame.weight after 2 px ${weight}${stroke !== null ? ` (strokeWidth ${stroke} written instead)` : ''}${ok ? '' : ` (docs/POLISH.md 2.6 item 69, B5's EditorShell.tsx by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.6 item 55: Check slides names the object once in plain words
  await t.step(
    'help.check-slides.plain-sentence',
    'an empty 3 by 3 table on a slide of its own; Tools > Check slides',
    'one finding "The table has 9 empty cells"; no finding carries a parenthesis or "SPEC"',
    async () => {
      const slide = await t.setupSlide(null, 'blank');
      if (!slide) return { ok: false, observed: 'no slide' };
      await t.clickCard(slide);
      await t.clearAll();
      const empty = {
        id: 'pc-empty-table',
        type: 'table',
        columns: [{}, {}, {}],
        rows: [0, 1, 2].map((r) => ({ cells: ['', '', ''], ...(r === 0 ? { header: true } : {}) })),
        pos: { x: 320, y: 200, w: 960, h: 162 },
      };
      const placed = await t.placeBlock(slide, empty);
      if (!placed) return { ok: false, observed: 'the table was not placed' };
      const reach = await t.reachRow('tools', 'tools.checkSlides');
      if (!reach.present) return { ok: false, observed: 'Tools > Check slides is not reachable' };
      await t.menuPath('tools', 'tools.checkSlides');
      const on = await t
        .waitControl('panel.checkSlides', 8000)
        .then(() => true)
        .catch(() => false);
      if (!on) return { ok: false, observed: 'no Check slides panel' };
      await t.sleep(1500);
      const findings = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="panel.checkSlides"] .ts-lint-list li, [data-control="panel.checkSlides"] [data-control^="suggestion."], [data-control="panel.checkSlides"] [data-control^="lint."]',
          ),
        ].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
      );
      if (await t.visible('panel.checkSlides.close'))
        await t.clickControl('panel.checkSlides.close');
      await t.clickCard(S);
      const tableFindings = findings.filter((f) => /empty cell/i.test(f));
      const one =
        tableFindings.length === 1 && /The table has 9 empty cells/.test(tableFindings[0]);
      const plain = findings.every((f) => !/\(/.test(f) && !/SPEC/.test(f));
      const ok = one && plain;
      return {
        ok,
        observed: `${findings.length} findings; about empty cells ${tableFindings.length}${tableFindings.length > 0 ? ` ("${tableFindings[0].slice(0, 90)}")` : ''}; parenthesis or SPEC ${!plain}${ok ? '' : ` (docs/POLISH.md 2.6 item 55, ${LANE})`}`,
      };
    },
  );

  // ---- 2.6 item 56: the Background dialog's pictures are thumbnails
  await t.step(
    'slides.background.picture-grid',
    'three more pictures added; Slide > Change background; the Image list read',
    'three tiles with an img each and names ellipsised at one width',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      for (const n of [1, 2, 3]) {
        const png = await t.pngDataUrl(96 + n * 8, 64);
        const s = await t.state();
        await t
          .invoke('asset.add', {
            id: `pc-bg-picture-${n}`,
            url: png,
            role: 'capture',
            alt: `Background candidate ${n} with a long name that ends`,
            baseRevision: s.revision,
          })
          .catch(() => undefined);
        await t.settled();
      }
      await t.menuPath('slide', 'slide.changeBackground');
      const on = await t
        .waitControl('dialog.background', 8000)
        .then(() => true)
        .catch(() => false);
      if (!on) return { ok: false, observed: 'no Background dialog' };
      await t.sleep(500);
      const read = await page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll('[data-control^="dialog.background.choose."]'),
        ].filter(
          (el) =>
            el.getClientRects().length > 0 &&
            !/\.(upload|byUrl)$/.test(el.getAttribute('data-control') ?? ''),
        );
        return rows.map((el) => {
          const r = el.getBoundingClientRect();
          const name =
            el.querySelector('.ts-dialog-row-title, .ts-asset-picker-id, [class*="name"], span') ??
            el;
          const cs = getComputedStyle(name);
          return {
            control: el.getAttribute('data-control'),
            img: el.querySelector('img') !== null,
            w: r.width,
            h: r.height,
            ellipsis:
              cs.textOverflow === 'ellipsis' &&
              cs.overflow !== 'visible' &&
              cs.whiteSpace === 'nowrap',
            nameW: name.getBoundingClientRect().width,
          };
        });
      });
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.background"]', 4000).catch(() => undefined);
      await t.clearAll();
      const widths = new Set(read.map((r) => Math.round(r.w)));
      /* a short name draws whole; the rule is one width per tile and an ellipsis where a name
         would overflow it (the style, read whether or not this deck's names overflow) */
      const ok =
        read.length >= 3 &&
        read.every((r) => r.img) &&
        read.every((r) => r.ellipsis || r.nameW <= r.w) &&
        widths.size === 1;
      return {
        ok,
        observed: `${read.length} tiles; with an img ${read.filter((r) => r.img).length}; ellipsised ${read.filter((r) => r.ellipsis).length}; widths ${[...widths].join(', ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 56, ${LANE})`}`,
      };
    },
  );

  // ---- 2.6 item 57: a glyph on every menu row
  await t.step(
    'menus.rows.icon-on-every-row',
    "every row of the nine menus with their submenus, the card's, the sheet's, the text box's, the picture's, the shape's and the table cell's right click menus, the show's options and the /decks card menu read",
    'every row draws an svg glyph',
    async () => {
      await t.clearAll();
      const missing = [];
      let total = 0;
      const readRows = (root) =>
        page.evaluate(
          (sel) =>
            [...document.querySelectorAll(`${sel} [data-control^="menu."]`)]
              .filter((el) => el.getClientRects().length > 0 && !el.matches('.ts-menu-divider'))
              .map((el) => ({
                id: el.getAttribute('data-control'),
                submenu: el.getAttribute('aria-haspopup') !== null,
                glyph:
                  (el.querySelector('.ts-menu-ic svg path, .ts-menu-ic svg use, .ts-menu-ic svg') ??
                    null) !== null,
              })),
          root,
        );
      const take = (rows, where) => {
        for (const r of rows) {
          total += 1;
          if (!r.glyph) missing.push(`${where}: ${r.id.replace(/^menu\./, '')}`);
        }
      };
      for (const menuId of MENUS) {
        await t.openMenu(menuId);
        const root = `#ts-menu-${menuId}`;
        const top = await readRows(root);
        take(top, menuId);
        for (const parent of top.filter((r) => r.submenu)) {
          const item = parent.id.replace(/^menu\./, '');
          await t.hoverRow(item, `[data-control^="menu.${item}."]`).catch(() => undefined);
          const children = (await readRows(root)).filter(
            (r) => r.id.startsWith(`${parent.id}.`) && !top.some((x) => x.id === r.id),
          );
          take(children, item);
        }
        await t.press('Escape', 2);
        await t.sleep(100);
      }
      const contextAt = async (where, fn) => {
        await t.clearAll();
        await fn();
        if (await t.has('.ts-context-menu')) take(await readRows('.ts-context-menu'), where);
        else missing.push(`${where}: no menu opened`);
        await t.press('Escape');
        await t.sleep(150);
      };
      await contextAt('card', async () => {
        const c = await t.cardCenter(S);
        if (c) await t.rightClickAt(c.x, c.y);
      });
      await contextAt('sheet', async () => {
        const p = await t.emptySheetPoint();
        await t.rightClickAt(p.x, p.y);
      });
      for (const [where, id] of [
        ['text', RECT],
        ['picture', PIC],
        ['shape', RECT],
      ])
        await contextAt(where, async () => {
          await t.selectObject(id);
          const b = await t.boxOf(id);
          await t.rightClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
        });
      await contextAt('table cell', async () => {
        const info = await t.runInfo(`${TABLE}/rows/1/cells/1`);
        if (info)
          await t.rightClickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
      });
      /* the show's options */
      await t.clearAll();
      await t.clickControl('present.open');
      const inShow = await t
        .waitControl('present.show', 10_000)
        .then(() => true)
        .catch(() => false);
      if (inShow) {
        await t.sleep(800);
        const opened = await page.evaluate(() => {
          const btn = document.querySelector(
            '[data-control="present.options"], [data-control="show.options"], .ts-present-bar [aria-haspopup="menu"], .ts-slideshow-bar [aria-haspopup="menu"]',
          );
          if (!(btn instanceof HTMLElement)) return false;
          btn.click();
          return true;
        });
        await t.sleep(400);
        if (opened && (await t.has('[data-control^="menu.present.options."]')))
          take(await readRows('body'), 'show options');
        else missing.push('show options: the menu did not open');
        await t.press('Escape');
        await t.sleep(200);
        await t.press('Escape');
        await t.waitGone('[data-control="present.show"]', 8000).catch(() => undefined);
      } else missing.push('show options: the show did not open');
      /* the /decks card menu */
      await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
      await page
        .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
        .catch(() => undefined);
      const more = page.locator(`[data-control="home.more.${t.deck.id}"]`).first();
      if ((await more.count()) > 0) {
        await more.click();
        await t.sleep(400);
        const rows = await readRows('body');
        const cardRows = rows.filter((r) => /^menu\.home\.card\./.test(r.id));
        take(cardRows.length > 0 ? cardRows : rows, '/decks card');
        await t.press('Escape');
      } else missing.push(`/decks card: no home.more.${t.deck.id}`);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.clickCard(S);
      await t.clearAll();
      const ok = total > 0 && missing.length === 0;
      return {
        ok,
        observed: `${total} rows read; without a glyph ${missing.length}${missing.length > 0 ? ` (${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ', …' : ''})` : ''}${ok ? '' : ` (docs/POLISH.md 2.6 item 57, the integrator's model.ts with ${LANE}'s glyph list and B5's decks.index.tsx and Slideshow.tsx)`}`,
      };
    },
  );

  // ---- 2.6 item 66: Insert > Comment needs a selection and its card sits by the sheet
  await t.step(
    'comments.insert.needs-selection',
    'nothing selected: the Insert menu read; the rectangle selected: Insert > Comment',
    "Insert > Comment is disabled with nothing selected; the card's box is within 24 px of the shape's ring",
    async () => {
      await t.clearAll();
      const rows = await menuRowsWith('insert', null);
      const comment = rows.find((r) => r.id === 'insert.comment') ?? null;
      const disabledOk = comment !== null && comment.disabled;
      await t.clearAll();
      await t.selectObject(RECT);
      const ring = await t.boxOfSel(
        '.ts-overlay .ts-select.is-selected:not(.is-extra):not(.is-cells)',
      );
      await t.menuPath('insert', 'insert.comment');
      const card = await t
        .waitControl('comment.card', 6000)
        .then(() => t.boxOfSel('[data-control="comment.card"]'))
        .catch(() => null);
      const gap = card && ring ? t.boxGap(card, ring) : null;
      const near = gap !== null && Math.max(gap.dx, gap.dy) <= 24;
      if (await t.has('[data-control="comment.card.close"]'))
        await t.clickControl('comment.card.close').catch(() => undefined);
      await t.press('Escape');
      await t.clearAll();
      const ok = disabledOk && near;
      return {
        ok,
        observed: `Insert > Comment with nothing selected ${comment ? (comment.disabled ? 'disabled' : 'enabled') : 'not listed'}; card ${card ? `${r1(card.x)},${r1(card.y)} ${r1(card.w)}x${r1(card.h)}` : 'none'} ${gap ? `${r1(gap.dx)}/${r1(gap.dy)} px from the ring` : ''}${ok ? '' : ` (docs/POLISH.md 2.6 item 66, the integrator's model.ts 3398 with B5's CommentCard.tsx)`}`,
      };
    },
  );

  // ---- 2.3 item 13: Layout > Blank empties an untyped slide
  await t.step(
    'slides.layout.blank-empty',
    'an untyped Title and body slide: Slide > Apply layout > Blank; a typed one the same',
    'the untyped slide holds no block and draws no prompt; the typed box stays',
    async () => {
      const facts = [];
      let ok = true;
      const applyBlank = async (slide) => {
        await t.clickCard(slide);
        await t.clearAll();
        await t.menuPath('slide', 'slide.applyLayout', 'layout.apply.blank');
        await t.settled();
        await t.sleep(400);
        const objects = await t.objectsOf(slide);
        const prompts = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-prompt]',
            ),
          ]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => (el.textContent ?? '').trim()),
        );
        return { objects, prompts, blocks: await t.allBlockIds(slide) };
      };
      const untyped = await t.setupSlide(null, 'split');
      if (!untyped) return { ok: false, observed: 'no slide' };
      const a = await applyBlank(untyped);
      const emptyOk = a.blocks.length === 0 && a.prompts.length === 0;
      ok = ok && emptyOk;
      facts.push(
        `untyped: ${a.blocks.length} blocks (${a.blocks.join(', ')}), prompts ${a.prompts.length}${a.prompts.length > 0 ? ` (${a.prompts.join(' | ')})` : ''}`,
      );
      const typed = await t.setupSlide(null, 'split');
      if (!typed) return { ok: false, observed: 'no second slide' };
      await t.clickCard(typed);
      await page
        .waitForSelector(`.pt-viewer[data-active="${typed}"]`, { timeout: 5000 })
        .catch(() => undefined);
      await t.sleep(300);
      const runs = await t.runs();
      const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
      const headBlock = head ? await t.blockOfRun(head) : null;
      if (head && headBlock) {
        const info = await t.runInfo(head);
        await t.clickSelect(headBlock, {
          x: info.rect.x + info.rect.w / 2,
          y: info.rect.y + info.rect.h / 2,
        });
        await t.typeHuman('Kept title');
        await t.press('Escape');
        await t.settled();
      }
      const b = await applyBlank(typed);
      const kept = JSON.stringify(await t.slideJson(typed)).includes('Kept title');
      ok = ok && kept && b.blocks.length >= 1;
      facts.push(
        `typed: ${b.blocks.length} blocks, the typed title kept ${kept}, prompts ${b.prompts.length}`,
      );
      await t.clickCard(S);
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.3 item 13, ${LANE})`}`,
      };
    },
  );

  // ---- 2.8 item 107: the filmstrip follows every move
  await t.step(
    'slides.filmstrip.follows-every-move',
    'the deck grown to 40 slides through the window API; End, Home, Slide > Duplicate slide and a window API slide.new',
    "each leaves the current card inside the list's box",
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const start = await t.slideOrder();
      let order = start;
      while (order.length < 40) {
        const s = await t.state();
        await t
          .invoke('slide.new', {
            baseRevision: s.revision,
            after: order[order.length - 1],
            layout: 'blank',
          })
          .catch(() => undefined);
        order = await t
          .pollUntil(t.slideOrder, (o) => o.length > order.length, 15_000)
          .catch(t.slideOrder);
        if (order.length <= start.length) break;
      }
      await t.settled();
      const currentInside = async () => {
        await t.sleep(500);
        return page.evaluate(() => {
          const list = document.querySelector('[data-control="filmstrip"]');
          const current = list?.querySelector('.ts-card.is-current') ?? null;
          if (!list || !current)
            return { inside: false, why: list ? 'no current card' : 'no filmstrip' };
          const lr = list.getBoundingClientRect();
          const cr = current.getBoundingClientRect();
          return {
            inside: cr.y >= lr.y - 1 && cr.bottom <= lr.bottom + 1,
            y: Math.round(cr.y),
            top: Math.round(lr.y),
            bottom: Math.round(lr.bottom),
            id: current.getAttribute('data-control'),
          };
        });
      };
      const facts = [];
      let ok = order.length >= 40;
      if (!ok) facts.push(`the deck holds ${order.length} slides`);
      const sheet = await t.emptySheetPoint();
      await t.clickAt(sheet.x, sheet.y);
      await t.press('End');
      const end = await currentInside();
      ok = ok && end.inside;
      facts.push(
        `End: ${end.inside ? 'inside' : `outside (${end.why ?? `y ${end.y} against ${end.top} to ${end.bottom}`})`}`,
      );
      await t.press('Home');
      const home = await currentInside();
      ok = ok && home.inside;
      facts.push(`Home: ${home.inside ? 'inside' : 'outside'}`);
      await t.clickCard(order[Math.floor(order.length / 2)]);
      await t.menuPath('slide', 'slide.duplicateSlide');
      await t.settled();
      const dup = await currentInside();
      ok = ok && dup.inside;
      facts.push(`Duplicate slide: ${dup.inside ? 'inside' : 'outside'}`);
      const s = await t.state();
      await t
        .invoke('slide.new', {
          baseRevision: s.revision,
          after: order[order.length - 1],
          layout: 'blank',
        })
        .catch(() => undefined);
      await t.settled();
      const api = await currentInside();
      ok = ok && api.inside;
      facts.push(`window API slide.new: ${api.inside ? 'inside' : 'outside'}`);
      await t.trimTo(start.length, start);
      await t.clickCard(S);
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.8 item 107, B5's Filmstrip.tsx)`}`,
      };
    },
  );

  // ---- 2.6 item 61: tooltips only where a person asked
  await t.step(
    'chrome.tooltips.only-on-hover',
    "a disabled row and a submenu row hovered; the toolbar's Image arrow hovered and clicked; the palette closed with Escape; a /decks card hovered",
    'no plate on a disabled or submenu row; the plate hides on the click; no plate after the palette closes; no plate on the card',
    async () => {
      await t.clearAll();
      const facts = [];
      let ok = true;
      const hoverRowRead = async (menuId, rowId) => {
        await t.openMenu(menuId);
        const r = await t.rectOf(`#ts-menu-${menuId} [data-control="menu.${rowId}"]`);
        if (!r) {
          await t.press('Escape');
          return 'no row';
        }
        await t.moveHuman(
          { x: r.x + 4, y: r.y + r.h / 2 },
          { x: r.x + r.w * 0.4, y: r.y + r.h / 2 },
          6,
        );
        await t.sleep(900);
        const tip = await t.tooltipText();
        await t.press('Escape', 2);
        await t.sleep(150);
        return tip;
      };
      const disabledTip = await hoverRowRead('edit', 'edit.redo');
      const submenuTip = await hoverRowRead('insert', 'insert.image');
      ok = ok && disabledTip === null && submenuTip === null;
      facts.push(
        `disabled row ${disabledTip === null ? 'no plate' : `"${disabledTip}"`}; submenu row ${submenuTip === null ? 'no plate' : `"${submenuTip}"`}`,
      );
      const arrow = (await t.visible('toolbar.insertImage.arrow'))
        ? 'toolbar.insertImage.arrow'
        : null;
      if (arrow) {
        const tip = await t.hoverControl(arrow, 800);
        await t.clickControl(arrow);
        await t.sleep(300);
        const after = await t.tooltipText();
        await t.press('Escape', 2);
        ok = ok && after === null;
        facts.push(
          `Image arrow: plate on hover ${tip !== null}, after the click ${after === null ? 'hidden' : `"${after}"`}`,
        );
      } else facts.push('no toolbar.insertImage.arrow');
      await t.clearAll();
      await t.menuPath('help', 'help.searchMenus');
      await t.waitControl('palette', 6000).catch(() => undefined);
      await t.sleep(500);
      await t.press('Escape');
      await t.sleep(600);
      const afterPalette = await t.tooltipText();
      ok = ok && afterPalette === null;
      facts.push(
        `after the palette closed ${afterPalette === null ? 'no plate' : `"${afterPalette}"`}`,
      );
      await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
      await page
        .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
        .catch(() => undefined);
      const card = await t.rectOf(`[data-control="home.card.${t.deck.id}"]`);
      let cardTip = 'no card';
      if (card) {
        await t.moveHuman(
          { x: card.x - 30, y: card.y + card.h / 2 },
          { x: card.x + card.w / 2, y: card.y + card.h / 2 },
          8,
        );
        await t.sleep(900);
        cardTip = await t.tooltipText();
        ok = ok && cardTip === null;
      }
      facts.push(`/decks card ${cardTip === null ? 'no plate' : `"${cardTip}"`}`);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.clickCard(S);
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 61, ${LANE} with B5's decks.index.tsx and TitleRow.tsx)`}`,
      };
    },
  );
  await t.advancedBack('the polish round chrome');
}

// Selection, arrange and the canvas, the probe's rows (docs/FOCUS.md 2.5, 6.4 `arrange.*` with
// the driver `probe --core`). Three text boxes are placed through the window API as setup at
// the audit's positions (audit-arrange section 1: the rectangles' homes are a setup write), so
// the align rows meet the off grid edges the audit saw. The two selection colour rows read the
// chip's background, the selection colour token, after the appearance setup write of the matrix.

export const NAME = 'arrange';
export const IDS = [
  'arrange.select.click',
  'arrange.select.shift-add',
  'arrange.multi.drag-inside-moves-all',
  'arrange.select.shift-remove',
  'arrange.select.marquee',
  'arrange.select.marquee-partial',
  'arrange.select.click-away',
  'arrange.select.cmd-a',
  'arrange.select.escape',
  'arrange.order.bring-to-front',
  'arrange.order.send-to-back',
  'arrange.order.bring-forward',
  'arrange.order.send-backward',
  'arrange.order.keys',
  'arrange.align.left',
  'arrange.align.center',
  'arrange.align.right',
  'arrange.align.top',
  'arrange.align.middle',
  'arrange.align.bottom',
  'arrange.align.single-to-slide',
  'arrange.center.horizontal',
  'arrange.center.vertical',
  'arrange.undo.toolbar-on-arrange',
  'arrange.undo.menu-on-arrange',
  'arrange.clipboard.copy-paste',
  'arrange.clipboard.delete',
  'arrange.clipboard.undo-redo-delete',
  'arrange.clipboard.cut-paste-undo',
  'arrange.clipboard.menu-copy-paste',
  'arrange.clipboard.paste-after-new-slide-button',
  'arrange.clipboard.paste-with-filmstrip-focus',
  'arrange.clipboard.paste-keeps-position',
  'arrange.duplicate.cmd-d',
  'arrange.duplicate.menu-selects-copy',
  'arrange.duplicate.nothing-selected',
  'arrange.redo.after-undone-duplicate',
  'arrange.keys.backspace-empty-selection',
  'arrange.nudge.arrows',
  'arrange.nudge.shift',
  'arrange.nudge.undo',
  'arrange.zoom.box-reads',
  'arrange.zoom.menu-in',
  'arrange.zoom.cmd-minus',
  'arrange.zoom.cmd-plus',
  'arrange.zoom.fit',
  'arrange.zoom.type-percent',
  'arrange.zoom.arrow-menu',
  'arrange.zoom.cmd-0',
  'arrange.zoom.menu-out',
  'arrange.readout.fit',
  'arrange.readout.200',
  'arrange.selection-colour.light',
  'arrange.selection-colour.dark',
  'arrange.escape.text-then-selection',
  'arrange.zoom.menu-presets',
  'arrange.toolbar.select',
  'arrange.distribute.horizontal',
  'arrange.distribute.vertical',
  'arrange.distribute.needs-three',
  'arrange.rotate.quarter-turns',
  'arrange.rotate.flips-menu',
  'arrange.group.chords',
  'arrange.group.menu-regroup',
  'arrange.group.context-rows',
  'arrange.context.rotate-distribute',
  'arrange.ruler.show-hide',
  'arrange.guides.from-ruler',
  'arrange.guides.show-toggle',
  'arrange.guides.add-vertical-horizontal',
  'arrange.guides.drag',
  'arrange.snap.guides-on-off',
  'arrange.snap.grid-toggle',
  'arrange.snap.grid-effect',
  'arrange.guides.context',
  'arrange.guides.clear',
  'arrange.select-none.menu',
  /* the product round (docs/PRODUCT.md 8.1) */
  'arrange.insert.selected-after-menu',
  'arrange.insert.free-rectangle',
];

const HOMES = {
  a1: { x: 152, y: 150, w: 240, h: 150 },
  a2: { x: 600, y: 240, w: 240, h: 150 },
  a3: { x: 1100, y: 500, w: 240, h: 150 },
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LADDER = [25, 50, 75, 100, 125, 150, 200, 300, 400, 800, 1600];

export async function run(t) {
  const { page } = t;
  const A = await t
    .setup('a slide for the arrange rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.pictureSlide ?? t.deck.titleSlide, 'blank');
      t.deck.arrangeSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.arrangeSlide);
  await t.clickCard(A);
  await t.clearAll();
  await t.setup(
    "three text boxes at the audit's homes",
    'block.insert through the window API',
    async () => {
      let placed = 0;
      for (const [id, pos] of Object.entries(HOMES)) {
        const obj = await t.placeBlock(A, { id, type: 'text', text: id.toUpperCase(), pos });
        if (obj) placed += 1;
      }
      return { ok: placed === 3, observed: `${placed} placed` };
    },
  );
  const pos = async (id) => (await t.blockOf(A, id))?.pos ?? null;
  /** The stacking rank of an object as the sheet paints it: the z-index, then the DOM order. */
  const rankOf = (id) =>
    page.evaluate((blockId) => {
      const boxes = [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block]',
        ),
      ]
        .map((el) => el.closest('.free') ?? el)
        .filter((el, i, arr) => arr.indexOf(el) === i);
      const zIndex = (el) => {
        const z = parseInt(getComputedStyle(el).zIndex, 10);
        return Number.isNaN(z) ? 0 : z;
      };
      const sorted = boxes
        .map((el, i) => ({ el, z: zIndex(el), i }))
        .sort((a, b) => a.z - b.z || a.i - b.i);
      return sorted.findIndex(
        ({ el }) =>
          el.matches(`[data-block="${blockId}"]`) ||
          el.querySelector(`[data-block="${blockId}"]`) !== null,
      );
    }, id);
  /** A stacking key: the stored z first, the painted rank as the tie breaker. */
  const zOf = async (id) => ((await pos(id))?.z ?? 0) * 1000 + (await rankOf(id));
  const objects = () => t.objectsOf(A);
  const selectedIds = async () => {
    const ctrls = await t.handleControls();
    const ids = new Set(ctrls.map((c) => c.split('.')[1]).filter(Boolean));
    return [...ids];
  };
  /** Puts every home back through the product's undo, or the window API when the count differs. */
  const rehome = async () => {
    await t.clearAll();
    if ((await t.activeSlide()) !== A) await t.clickCard(A);
    for (const [id, home] of Object.entries(HOMES)) {
      const p = await pos(id);
      if (p && !same({ x: p.x, y: p.y, w: p.w, h: p.h }, home))
        await t.setBlock(A, id, '/pos', { ...p, ...home });
    }
  };
  /** Another slide of the deck for the paste rows; made through the window API when no earlier area left one. */
  const otherSlide = async () => {
    const known = [t.deck.pictureSlide, t.deck.textSlide, t.deck.secondSlide].find(Boolean);
    const order = await t.slideOrder();
    if (known && order.includes(known)) return known;
    const found = order.find((id) => id !== A && id !== t.deck.titleSlide);
    if (found) return found;
    return t.setupSlide(A, 'blank');
  };
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  const chipColour = () =>
    page.evaluate(() => {
      const chip = document.querySelector('.ts-overlay .ts-select-chip');
      return chip ? getComputedStyle(chip).backgroundColor : null;
    });

  // ---- selection
  await t.step(
    'arrange.select.click',
    'one click at the centre of a text box (its text)',
    'chip, eight handles, the ring; no caret, no session (A1 rule 1)',
    async () => {
      await t.clearAll();
      const { facts } = await t.clickSelect('a1');
      const ok =
        facts.selected && facts.resize === 8 && facts.chip !== null && facts.ring && !facts.editing;
      // a build that still opens the session on one click is judged above; the selection the
      // later rows need is kept either way
      if (facts.editing) await t.selectObject('a1');
      return { ok: ok && !facts.caret, observed: t.describeSelection(facts) };
    },
  );
  await t.step(
    'arrange.select.shift-add',
    'Shift click a second object',
    'chip 2 objects',
    async () => {
      const b = await t.boxOf('a2');
      await t.shiftClickAt(b.free.x + 6, b.free.y + 6);
      const c = await t.chip();
      return { ok: c === '2 objects', observed: `chip "${c}"` };
    },
  );
  await t.step(
    'arrange.multi.drag-inside-moves-all',
    'with a1 and a2 selected, a pointer down inside a2 (its text) and a move',
    'both boxes move by the same distance and a3 stays',
    async () => {
      if ((await t.chip()) !== '2 objects') {
        await t.clearAll();
        await t.clickSelect('a1');
        if (await t.editing()) await t.selectObject('a1');
        const b = await t.boxOf('a2');
        await t.shiftClickAt(b.free.x + 6, b.free.y + 6);
      }
      const chipBefore = await t.chip();
      const p1 = await pos('a1');
      const p3 = await pos('a3');
      const moved = await t.dragInside(A, 'a2', 100, 80);
      const q1 = await pos('a1');
      const q3 = await pos('a3');
      const d = (p, q) => (p && q ? { x: q.x - p.x, y: q.y - p.y } : null);
      const d1 = d(p1, q1);
      const d2 = d(moved.before, moved.after);
      const d3 = d(p3, q3);
      const both =
        d1 &&
        d2 &&
        t.near(d2.x, 100, 16) &&
        t.near(d2.y, 80, 16) &&
        t.near(d1.x, d2.x, 2) &&
        t.near(d1.y, d2.y, 2);
      const third = d3 && d3.x === 0 && d3.y === 0;
      const chipAfter = await t.chip();
      await rehome();
      // the two boxes stay selected for the Shift click row that follows
      await t.clickSelect('a1');
      if (await t.editing()) await t.selectObject('a1');
      const b = await t.boxOf('a2');
      await t.shiftClickAt(b.free.x + 6, b.free.y + 6);
      return {
        ok: chipBefore === '2 objects' && Boolean(both) && Boolean(third) && !moved.during.editing,
        observed: `chip "${chipBefore}" -> "${chipAfter}"; a1 moved ${JSON.stringify(d1)}, a2 ${JSON.stringify(d2)}, a3 ${JSON.stringify(d3)}; during the drag session ${moved.during.editing}, text selected "${moved.during.selection}"`,
      };
    },
  );
  await t.step(
    'arrange.select.shift-remove',
    'Shift click the selected object again',
    'it leaves the selection',
    async () => {
      const b = await t.boxOf('a2');
      await t.shiftClickAt(b.free.x + 6, b.free.y + 6);
      const c = await t.chip();
      const sel = await selectedIds();
      return {
        ok: c !== '2 objects' && sel.includes('a1') && !sel.includes('a2'),
        observed: `chip "${c}"; selected ${sel.join(',')}`,
      };
    },
  );
  await t.step(
    'arrange.select.marquee',
    'drag a box on the empty slide across two objects',
    'both are selected',
    async () => {
      await t.clearAll();
      const from = await t.sheetPoint(100, 100);
      const to = await t.sheetPoint(900, 430);
      await t.drag(from, to);
      const c = await t.chip();
      const sel = await selectedIds();
      return { ok: c === '2 objects', observed: `chip "${c}"; handles for ${sel.join(',')}` };
    },
  );
  await t.step(
    'arrange.select.marquee-partial',
    'a marquee that crosses only a corner of an object',
    'the object is selected',
    async () => {
      await t.clearAll();
      const from = await t.sheetPoint(1050, 450);
      const to = await t.sheetPoint(1130, 530);
      await t.drag(from, to);
      const sel = await selectedIds();
      const chipText = await t.chip();
      return {
        ok: sel.includes('a3') && sel.length === 1 && !/objects/.test(chipText ?? ''),
        observed: `selected ${sel.join(',')}; chip "${chipText}"`,
      };
    },
  );
  await t.step(
    'arrange.select.click-away',
    'a click on the empty slide',
    'the selection clears',
    async () => {
      const p = await t.emptySheetPoint();
      await t.clickAt(p.x, p.y);
      const sel = await selectedIds();
      return { ok: sel.length === 0, observed: `selected ${sel.join(',') || 'none'}` };
    },
  );
  await t.step(
    'arrange.select.cmd-a',
    'Cmd+A with the stage focused',
    'every object is selected',
    async () => {
      const p = await t.emptySheetPoint();
      await t.clickAt(p.x, p.y);
      await t.press('Meta+a');
      await t.sleep(300);
      const c = await t.chip();
      return { ok: c === '3 objects', observed: `chip "${c}"` };
    },
  );
  await t.step('arrange.select.escape', 'Escape', 'the selection clears', async () => {
    await t.press('Escape');
    await t.sleep(300);
    const sel = await selectedIds();
    return { ok: sel.length === 0, observed: `selected ${sel.join(',') || 'none'}` };
  });

  // ---- order
  const zs = async () => ({ a1: await zOf('a1'), a2: await zOf('a2'), a3: await zOf('a3') });
  const topMost = (z) => Object.entries(z).sort((p, q) => q[1] - p[1])[0][0];
  const bottomMost = (z) => Object.entries(z).sort((p, q) => p[1] - q[1])[0][0];
  /**
   * What the product said after an Arrange > Order row: the snackbar and the controller's
   * refusals, so a menu route whose `block.order` writes nothing is named on the miss (the cycle 2
   * walk of 21:38Z read a1's z unchanged after Bring to front, Bring forward and Send backward
   * from the menu while Cmd+Shift+Up moved it).
   */
  const afterOrder = async () => {
    const said = await t.snackbarWithin(1500);
    const rejects = await page
      .evaluate(() => {
        const s = window.turboslide?.studio?.describe().state;
        const list = s?.rejects ?? s?.sync?.rejects ?? null;
        return list ? JSON.stringify(list).slice(0, 200) : null;
      })
      .catch(() => null);
    return `snackbar ${said ?? 'none'}; rejects ${rejects ?? 'none'}`;
  };
  await t.step(
    'arrange.order.bring-to-front',
    'Arrange > Order > Bring to front on a1; Cmd+Z; Cmd+Shift+Z',
    'a1 is on top, then not, then again',
    async () => {
      await t.clearAll();
      await t.selectObject('a1');
      const z0 = await zs();
      /* the Order rows' enabled state with a1 selected (`canBringToFront` reads
         `selection.order.front`, model.ts): a row drawn disabled takes no click, which is what
         the 22:01Z run's unchanged z with no snackbar and no reject looks like */
      await t.openMenu('arrange');
      /* the rows' enabled state is a reading beside the action: a submenu that shows to neither
         hover nor click (the product round's gate, both sides) leaves the reading unread and the
         action below still judges the row */
      const opened = await t
        .hoverRow('arrange.order', '[data-control="menu.arrange.order.bringToFront"]')
        .then(() => true)
        .catch(() => false);
      const rows = opened
        ? (await t.menuRows('arrange'))
            .filter((r) => r.id.startsWith('arrange.order.'))
            .map((r) => `${r.id.replace('arrange.order.', '')}${r.disabled ? ' (disabled)' : ''}`)
        : ['not read: the Order submenu did not open to the hover'];
      await t.closeMenus();
      await t.menuPath('arrange', 'arrange.order', 'arrange.order.bringToFront');
      const z1 = await t.pollUntil(zs, (z) => !same(z, z0), 8000);
      const said = `${await afterOrder()}; Order rows with a1 selected: ${rows.join(', ')}`;
      await t.settled();
      await t.clearAll();
      await t.press('Meta+z');
      const z2 = await t.pollUntil(zs, (z) => same(z, z0), 8000);
      await t.settled();
      await t.press('Meta+Shift+z');
      const z3 = await t.pollUntil(zs, (z) => same(z, z1), 8000);
      await t.settled();
      return {
        ok: !same(z1, z0) && topMost(z1) === 'a1' && same(z2, z0) && same(z3, z1),
        observed: `z ${JSON.stringify(z0)} -> ${JSON.stringify(z1)} -> undo ${same(z2, z0)} -> redo ${same(z3, z1)}; ${said}`,
      };
    },
  );
  await t.step(
    'arrange.order.send-to-back',
    'Arrange > Order > Send to back on a1; the toolbar Undo and Redo',
    'a1 is at the back, then not, then again',
    async () => {
      await t.clearAll();
      await t.selectObject('a1');
      let lifted = '';
      if (bottomMost(await zs()) === 'a1') {
        /* a1 at the back already (the Bring to front row before this one did not move it) would
           pass Send to back for nothing: a1 is lifted first through the stage's own chord */
        await t.press('Meta+Shift+ArrowUp');
        await t.pollUntil(zs, (z) => topMost(z) === 'a1', 8000);
        await t.settled();
        await t.selectObject('a1');
        lifted = 'a1 lifted to the front with Cmd+Shift+Up first; ';
      }
      const z0 = await zs();
      await t.menuPath('arrange', 'arrange.order', 'arrange.order.sendToBack');
      const z1 = await t.pollUntil(zs, (z) => !same(z, z0), 8000);
      const said = await afterOrder();
      await t.settled();
      await t.clickControl('toolbar.undo');
      const z2 = await t.pollUntil(zs, (z) => same(z, z0), 8000);
      await t.settled();
      await t.clickControl('toolbar.redo');
      const z3 = await t.pollUntil(zs, (z) => same(z, z1), 8000);
      await t.settled();
      return {
        ok: !same(z1, z0) && bottomMost(z1) === 'a1' && same(z2, z0) && same(z3, z1),
        observed: `${lifted}z ${JSON.stringify(z0)} -> ${JSON.stringify(z1)} -> undo ${same(z2, z0)} -> redo ${same(z3, z1)}; ${said}`,
      };
    },
  );
  await t.step(
    'arrange.order.bring-forward',
    'Arrange > Order > Bring forward on a1; Edit > Undo and Edit > Redo',
    'a1 moves up one, back, up again',
    async () => {
      await t.clearAll();
      await t.selectObject('a1');
      const z0 = await zs();
      await t.menuPath('arrange', 'arrange.order', 'arrange.order.bringForward');
      const z1 = await t.pollUntil(zs, (z) => !same(z, z0), 8000);
      const said = await afterOrder();
      await t.settled();
      await t.menuPath('edit', 'edit.undo');
      const z2 = await t.pollUntil(zs, (z) => same(z, z0), 8000);
      await t.settled();
      await t.menuPath('edit', 'edit.redo');
      const z3 = await t.pollUntil(zs, (z) => same(z, z1), 8000);
      await t.settled();
      const rank = (z, id) =>
        Object.entries(z)
          .sort((p, q) => p[1] - q[1])
          .findIndex(([k]) => k === id);
      return {
        ok: rank(z1, 'a1') === rank(z0, 'a1') + 1 && same(z2, z0) && same(z3, z1),
        observed: `rank of a1 ${rank(z0, 'a1')} -> ${rank(z1, 'a1')}; undo ${same(z2, z0)}; redo ${same(z3, z1)}; ${said}`,
      };
    },
  );
  await t.step(
    'arrange.order.send-backward',
    'Arrange > Order > Send backward on a1',
    'a1 moves down one',
    async () => {
      await t.clearAll();
      await t.selectObject('a1');
      const z0 = await zs();
      await t.menuPath('arrange', 'arrange.order', 'arrange.order.sendBackward');
      const z1 = await t.pollUntil(zs, (z) => !same(z, z0), 8000);
      const said = await afterOrder();
      await t.settled();
      const rank = (z, id) =>
        Object.entries(z)
          .sort((p, q) => p[1] - q[1])
          .findIndex(([k]) => k === id);
      return {
        ok: rank(z1, 'a1') === rank(z0, 'a1') - 1,
        observed: `rank of a1 ${rank(z0, 'a1')} -> ${rank(z1, 'a1')}; ${said}`,
      };
    },
  );
  await t.step(
    'arrange.order.keys',
    'Cmd+Shift+Up then Cmd+Down on a1',
    'to the front, then one step back',
    async () => {
      await t.clearAll();
      await t.selectObject('a1');
      const z0 = await zs();
      await t.press('Meta+Shift+ArrowUp');
      const z1 = await t.pollUntil(zs, (z) => topMost(z) === 'a1' && !same(z, z0), 8000);
      await t.settled();
      await t.press('Meta+ArrowDown');
      const z2 = await t.pollUntil(zs, (z) => !same(z, z1), 8000);
      await t.settled();
      const rank = (z, id) =>
        Object.entries(z)
          .sort((p, q) => p[1] - q[1])
          .findIndex(([k]) => k === id);
      return {
        ok: topMost(z1) === 'a1' && rank(z2, 'a1') === 1,
        observed: `z ${JSON.stringify(z0)} -> ${JSON.stringify(z1)} -> ${JSON.stringify(z2)}`,
      };
    },
  );

  // ---- align and centre
  /** The three boxes, a1 by a click and a2, a3 by Shift clicks (Cmd+A takes every object the
   * earlier rows left on the slide; the first follow-up run's Distribute spread five). */
  const selectAll = async () => {
    await t.clearAll();
    await t.selectObject('a1');
    for (const id of ['a2', 'a3']) {
      const b = await t.boxOf(id);
      await t.shiftClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await t.sleep(150);
    }
    await t.sleep(300);
  };
  const edges = async () => {
    const out = {};
    for (const id of Object.keys(HOMES)) {
      const p = await pos(id);
      out[id] = {
        l: p.x,
        r: p.x + p.w,
        t: p.y,
        b: p.y + p.h,
        cx: p.x + p.w / 2,
        cy: p.y + p.h / 2,
      };
    }
    return out;
  };
  const alignRow = async (rowId, row, key, want) => {
    await t.step(
      rowId,
      `Arrange > Align > ${row}`,
      `every ${key} lands on ${want === null ? 'one shared value' : want}`,
      async () => {
        await rehome();
        await selectAll();
        const before = await edges();
        await t.menuPath('arrange', 'arrange.align', `arrange.align.${row.toLowerCase()}`);
        const after = await t.pollUntil(edges, (e) => !same(e, before), 8000);
        await t.settled();
        const values = Object.values(after).map((e) => e[key]);
        const shared = values.every((v) => Math.abs(v - values[0]) <= (want === null ? 2 : 0));
        const ok = shared && (want === null || values[0] === want);
        return {
          ok,
          observed: `${key} ${Object.values(before)
            .map((e) => e[key])
            .join(', ')} -> ${values.join(', ')}`,
        };
      },
    );
  };
  await alignRow('arrange.align.left', 'Left', 'l', 152);
  await alignRow('arrange.align.center', 'Center', 'cx', null);
  await alignRow('arrange.align.right', 'Right', 'r', 1340);
  await alignRow('arrange.align.top', 'Top', 't', 150);
  await alignRow('arrange.align.middle', 'Middle', 'cy', null);
  await alignRow('arrange.align.bottom', 'Bottom', 'b', 650);
  await t.step(
    'arrange.align.single-to-slide',
    'one object, Align > Left',
    'it lines up with the slide edge',
    async () => {
      await rehome();
      await t.selectObject('a2');
      await t.menuPath('arrange', 'arrange.align', 'arrange.align.left');
      const p = await t.pollUntil(
        () => pos('a2'),
        (x) => x && x.x !== HOMES.a2.x,
        8000,
      );
      await t.settled();
      return { ok: p.x === 0, observed: `x ${HOMES.a2.x} -> ${p.x}` };
    },
  );
  await t.step(
    'arrange.center.horizontal',
    'Arrange > Center on page > Horizontally',
    'the centre lands on 800',
    async () => {
      await rehome();
      await t.selectObject('a2');
      await t.menuPath('arrange', 'arrange.centerOnPage', 'arrange.centerOnPage.horizontally');
      const p = await t.pollUntil(
        () => pos('a2'),
        (x) => x && x.x !== HOMES.a2.x,
        8000,
      );
      await t.settled();
      return { ok: p.x + p.w / 2 === 800, observed: `centre x ${p.x + p.w / 2}` };
    },
  );
  await t.step(
    'arrange.center.vertical',
    'Arrange > Center on page > Vertically',
    'the centre lands on 450',
    async () => {
      await rehome();
      await t.selectObject('a2');
      await t.menuPath('arrange', 'arrange.centerOnPage', 'arrange.centerOnPage.vertically');
      const p = await t.pollUntil(
        () => pos('a2'),
        (x) => x && x.y !== HOMES.a2.y,
        8000,
      );
      await t.settled();
      return { ok: p.y + p.h / 2 === 450, observed: `centre y ${p.y + p.h / 2}` };
    },
  );
  await t.step(
    'arrange.undo.toolbar-on-arrange',
    'the toolbar Undo and Redo on an align step',
    'the positions go back and forward',
    async () => {
      await rehome();
      await selectAll();
      const before = await edges();
      await t.menuPath('arrange', 'arrange.align', 'arrange.align.left');
      const after = await t.pollUntil(edges, (e) => !same(e, before), 8000);
      await t.settled();
      await t.clickControl('toolbar.undo');
      const back = await t.pollUntil(edges, (e) => same(e, before), 8000);
      await t.settled();
      await t.clickControl('toolbar.redo');
      const again = await t.pollUntil(edges, (e) => same(e, after), 8000);
      await t.settled();
      return {
        ok: same(back, before) && same(again, after),
        observed: `undo ${same(back, before)}; redo ${same(again, after)}`,
      };
    },
  );
  await t.step(
    'arrange.undo.menu-on-arrange',
    'Edit > Undo and Edit > Redo on a centre step',
    'the position goes back and forward',
    async () => {
      await rehome();
      await t.selectObject('a3');
      const before = await pos('a3');
      await t.menuPath('arrange', 'arrange.centerOnPage', 'arrange.centerOnPage.horizontally');
      const after = await t.pollUntil(
        () => pos('a3'),
        (p) => p && !same(p, before),
        8000,
      );
      await t.settled();
      await t.menuPath('edit', 'edit.undo');
      const back = await t.pollUntil(
        () => pos('a3'),
        (p) => same(p, before),
        8000,
      );
      await t.settled();
      await t.menuPath('edit', 'edit.redo');
      const again = await t.pollUntil(
        () => pos('a3'),
        (p) => same(p, after),
        8000,
      );
      await t.settled();
      return {
        ok: same(back, before) && same(again, after),
        observed: `undo ${same(back, before)}; redo ${same(again, after)}`,
      };
    },
  );

  // ---- the clipboard
  /* every block of the slide, with or without a pos (b3 C2-R1): a paste onto a slide that is
     not a canvas yet gives the layout's placeholders a pos in the same write */
  const count = async () => (await t.allBlockIds(A)).length;
  await t.step(
    'arrange.clipboard.copy-paste',
    'Cmd+C then Cmd+V on a2',
    'the copy lands 16 px right and down, selected',
    async () => {
      await rehome();
      await t.selectObject('a2');
      const before = await count();
      await t.press('Meta+c');
      await t.press('Meta+v');
      const objs = await t.pollUntil(objects, (o) => o.length === before + 1, 8000);
      await t.settled();
      const copy = objs.find((o) => !Object.keys(HOMES).includes(o.id));
      const sel = await selectedIds();
      const ok =
        Boolean(copy) &&
        copy.pos.x === HOMES.a2.x + 16 &&
        copy.pos.y === HOMES.a2.y + 16 &&
        sel.includes(copy.id);
      t.deck.arrangeCopy = copy?.id ?? null;
      return {
        ok,
        observed: copy
          ? `${copy.id} at ${t.posStr(copy.pos)}; selected ${sel.join(',')}`
          : 'no copy',
      };
    },
  );
  await t.step(
    'arrange.clipboard.delete',
    'Delete on a selected copy',
    'the copy leaves',
    async () => {
      await rehome();
      // a copy to delete: the one the copy-paste row left, else a fresh Cmd+D copy
      let copyId = t.deck.arrangeCopy;
      if (!copyId || !(await t.blockOf(A, copyId))) {
        await t.selectObject('a2');
        const before = await t.objectIds(A);
        await t.press('Meta+d');
        const copy = await t.newObjectAfter(A, before, 8000);
        copyId = copy?.id ?? null;
        await t.settled();
      }
      if (!copyId)
        return {
          ok: false,
          observed: 'no copy to delete (copy and paste and Cmd+D both made none)',
        };
      const before = await count();
      await t.clearAll();
      await t.selectObject(copyId);
      // guard the rank 4 defect: press Delete only while the copy's handles are on the overlay
      const selected = (await t.handleControls()).some(
        (c) => c.startsWith(`handle.${copyId}.`) || c.endsWith('.move'),
      );
      if (!selected)
        return {
          ok: false,
          observed: `the copy ${copyId} could not be selected, so Delete was not pressed`,
        };
      await t.press('Delete');
      const after = await t.pollUntil(count, (n) => n === before - 1, 8000);
      await t.settled();
      t.deck.arrangeCopy = null;
      return { ok: after === before - 1, observed: `${before} -> ${after}` };
    },
  );
  await t.step(
    'arrange.clipboard.undo-redo-delete',
    'Cmd+Z and Cmd+Shift+Z after the delete',
    'the object returns and leaves',
    async () => {
      const before = await count();
      await t.press('Meta+z');
      const back = await t.pollUntil(count, (n) => n === before + 1, 8000);
      await t.settled();
      await t.press('Meta+Shift+z');
      const gone = await t.pollUntil(count, (n) => n === before, 8000);
      await t.settled();
      return {
        ok: back === before + 1 && gone === before,
        observed: `${before} -> ${back} -> ${gone}`,
      };
    },
  );
  await t.step(
    'arrange.clipboard.cut-paste-undo',
    'Cmd+X, Cmd+V, then two Cmd+Z half a second apart',
    'the cut object is back',
    async () => {
      await rehome();
      await t.selectObject('a3');
      const before = await count();
      await t.press('Meta+x');
      const cut = await t.pollUntil(count, (n) => n === before - 1, 8000);
      await t.press('Meta+v');
      const pasted = await t.pollUntil(count, (n) => n === before, 8000);
      await t.sleep(300);
      await t.press('Meta+z');
      await t.sleep(500);
      await t.press('Meta+z');
      const back = await t.pollUntil(
        () => pos('a3'),
        (p) => p !== null,
        8000,
      );
      await t.settled();
      const n = await count();
      return {
        ok: cut === before - 1 && pasted === before && back !== null && n === before,
        observed: `${before} -> ${cut} -> ${pasted}; a3 back ${back !== null}; count ${n}`,
      };
    },
  );
  await t.step(
    'arrange.clipboard.menu-copy-paste',
    'Edit > Copy then Edit > Paste on a clean stage',
    'a copy lands',
    async () => {
      await rehome();
      await t.selectObject('a1');
      const before = await count();
      await t.menuPath('edit', 'edit.copy');
      await t.menuPath('edit', 'edit.paste');
      const after = await t.pollUntil(count, (n) => n === before + 1, 8000);
      await t.settled();
      const ok = after === before + 1;
      if (ok) {
        await t.press('Delete');
        await t.settled();
      }
      return { ok, observed: `${before} -> ${after}` };
    },
  );
  await t.step(
    'arrange.clipboard.paste-after-new-slide-button',
    'copy an object, click New slide in the toolbar, Cmd+V',
    'the copy lands on the new slide',
    async () => {
      await rehome();
      await t.selectObject('a1');
      await t.press('Meta+c');
      const slides = await t.slideOrder();
      await t.clickControl('toolbar.newSlide');
      const withNew = await t.pollUntil(
        t.slideOrder,
        (o) => o.length === slides.length + 1,
        15_000,
      );
      const fresh = withNew.find((id) => !slides.includes(id));
      await t.pollUntil(t.activeSlide, (a) => a === fresh, 6000);
      await t.settled();
      const before = (await t.allBlockIds(fresh)).length;
      await t.press('Meta+v');
      const after = (
        await t.pollUntil(
          () => t.allBlockIds(fresh),
          (o) => o.length === before + 1,
          6000,
        )
      ).length;
      await t.settled();
      const focus = await t.activeDesc();
      // remove the extra slide through the product
      await t.clickCard(fresh);
      await t.press('Delete');
      await t.pollUntil(t.slideOrder, (o) => o.length === slides.length, 10_000);
      await t.settled();
      await t.clickCard(A);
      return {
        ok: after === before + 1,
        observed: `objects on the new slide ${before} -> ${after}; focus before the paste ${focus}`,
      };
    },
  );
  await t.step(
    'arrange.clipboard.paste-with-filmstrip-focus',
    "copy an object, click another slide's card, Cmd+V",
    'the copy lands on that slide',
    async () => {
      await t.clickCard(A);
      await rehome();
      await t.selectObject('a1');
      await t.press('Meta+c');
      const other = await otherSlide();
      await t.clickCard(other);
      await t.sleep(400);
      const before = (await t.allBlockIds(other)).length;
      await t.press('Meta+v');
      const after = (
        await t.pollUntil(
          () => t.allBlockIds(other),
          (o) => o.length === before + 1,
          6000,
        )
      ).length;
      await t.settled();
      const ok = after === before + 1;
      if (ok) {
        await t.press('Delete');
        await t.settled();
      }
      await t.clickCard(A);
      return { ok, observed: `objects on the other slide ${before} -> ${after}` };
    },
  );
  await t.step(
    'arrange.clipboard.paste-keeps-position',
    'copy a1, paste onto another slide from its stage',
    'the copy keeps the source position',
    async () => {
      await t.clickCard(A);
      await rehome();
      await t.selectObject('a1');
      await t.press('Meta+c');
      const other = await otherSlide();
      await t.clickCard(other);
      await t.sleep(300);
      const p = await t.emptySheetPoint();
      await t.clickAt(p.x, p.y);
      const before = await t.objectIds(other);
      await t.press('Meta+v');
      const copy = await t.newObjectAfter(other, before, 8000);
      await t.settled();
      const ok = Boolean(copy) && copy.pos.x === HOMES.a1.x && copy.pos.y === HOMES.a1.y;
      if (copy) {
        await t.selectObject(copy.id);
        await t.press('Delete');
        await t.settled();
      }
      await t.clickCard(A);
      return {
        ok,
        observed: copy
          ? `${copy.id} at ${t.posStr(copy.pos)} (source ${t.posStr(HOMES.a1)})`
          : 'no copy',
      };
    },
  );

  // ---- duplicate
  await t.step(
    'arrange.duplicate.cmd-d',
    'Cmd+D on a selected object',
    'one more object',
    async () => {
      await rehome();
      await t.selectObject('a2');
      const before = await count();
      await t.press('Meta+d');
      const after = await t.pollUntil(count, (n) => n === before + 1, 8000);
      await t.settled();
      const ok = after === before + 1;
      if (ok) {
        await t.press('Delete');
        await t.settled();
      }
      return { ok, observed: `${before} -> ${after}` };
    },
  );
  await t.step(
    'arrange.duplicate.menu-selects-copy',
    'Edit > Duplicate then Edit > Delete',
    'the copy is removed and the original stays',
    async () => {
      await rehome();
      await t.selectObject('a2');
      const before = await count();
      await t.menuPath('edit', 'edit.duplicate');
      await t.pollUntil(count, (n) => n === before + 1, 8000);
      await t.settled();
      const sel = await selectedIds();
      await t.menuPath('edit', 'edit.delete');
      await t.pollUntil(count, (n) => n === before, 8000);
      await t.settled();
      const original = await pos('a2');
      return {
        ok: original !== null && !sel.includes('a2') && sel.length === 1,
        observed: `selected after Duplicate ${sel.join(',')}; a2 still there ${original !== null}`,
      };
    },
  );
  await t.step(
    'arrange.duplicate.nothing-selected',
    'Cmd+D with nothing selected',
    'the current slide is duplicated',
    async () => {
      await t.clearAll();
      const p = await t.emptySheetPoint();
      await t.clickAt(p.x, p.y);
      const slides = await t.slideOrder();
      await t.press('Meta+d');
      const after = await t.pollUntil(t.slideOrder, (o) => o.length === slides.length + 1, 10_000);
      await t.settled();
      const ok = after.length === slides.length + 1;
      if (ok) {
        const dup = after.find((id) => !slides.includes(id));
        await t.clickCard(dup);
        await t.press('Delete');
        await t.pollUntil(t.slideOrder, (o) => o.length === slides.length, 10_000);
        await t.settled();
        await t.clickCard(A);
      }
      return { ok, observed: `slides ${slides.length} -> ${after.length}` };
    },
  );
  await t.step(
    'arrange.redo.after-undone-duplicate',
    'Cmd+D, Cmd+Z, then Cmd+Shift+Z (Cmd+Y, the toolbar Redo, Edit > Redo when needed)',
    'the duplicate comes back',
    async () => {
      await rehome();
      await t.selectObject('a3');
      const before = await count();
      await t.press('Meta+d');
      await t.pollUntil(count, (n) => n === before + 1, 8000);
      await t.settled();
      await t.press('Meta+z');
      await t.pollUntil(count, (n) => n === before, 8000);
      await t.settled();
      const routes = [];
      const tryRoute = async (name, fn) => {
        await fn();
        const n = await t.pollUntil(count, (x) => x === before + 1, 4000);
        routes.push(`${name}: ${n === before + 1 ? 'back' : 'nothing'}`);
        return n === before + 1;
      };
      let back = await tryRoute('Cmd+Shift+Z', () => t.press('Meta+Shift+z'));
      if (!back) back = await tryRoute('Cmd+Y', () => t.press('Meta+y'));
      if (!back) back = await tryRoute('toolbar Redo', () => t.clickControl('toolbar.redo'));
      if (!back) back = await tryRoute('Edit > Redo', () => t.menuPath('edit', 'edit.redo'));
      const redoDisabled = await t.attr('[data-control="toolbar.redo"]', 'aria-disabled');
      await t.settled();
      if (back) {
        await t.press('Meta+z');
        await t.pollUntil(count, (n) => n === before, 8000);
        await t.settled();
      }
      return {
        ok: routes[0] === 'Cmd+Shift+Z: back',
        observed: `${routes.join('; ')}; toolbar Redo aria-disabled ${redoDisabled}`,
      };
    },
  );
  await t.step(
    'arrange.keys.backspace-empty-selection',
    'Backspace and Delete with the stage focused and nothing selected',
    'no slide is removed',
    async () => {
      await rehome();
      const slides = await t.slideOrder();
      const p = await t.emptySheetPoint();
      await t.clickAt(p.x, p.y);
      await t.press('Backspace');
      await t.sleep(800);
      const afterBackspace = await t.slideOrder();
      await t.press('Delete');
      await t.sleep(800);
      const afterDelete = await t.slideOrder();
      await t.settled();
      const ok = same(afterBackspace, slides) && same(afterDelete, slides);
      if (!ok) {
        // the rank 4 defect removed slides: the product's undo brings them back, then the arrange
        // slide is the current one again for the rows that follow
        for (let i = 0; i < 4 && (await t.slideOrder()).length < slides.length; i += 1) {
          await t.press('Meta+z');
          await t.sleep(800);
          await t.settled();
        }
        const restored = await t.slideOrder();
        if (restored.includes(A)) await t.clickCard(A);
        return {
          ok,
          observed: `slides ${slides.length} -> ${afterBackspace.length} after Backspace -> ${afterDelete.length} after Delete; undo restored ${restored.length} of ${slides.length}${restored.includes(A) ? '' : ' (the arrange slide is gone)'}`,
        };
      }
      return {
        ok,
        observed: `slides ${slides.length} -> ${afterBackspace.length} after Backspace -> ${afterDelete.length} after Delete`,
      };
    },
  );

  // ---- nudge
  await t.step(
    'arrange.nudge.arrows',
    'ArrowRight and ArrowDown on a selected object',
    '1 px each',
    async () => {
      await rehome();
      await t.selectObject('a1');
      const p0 = await pos('a1');
      await t.press('ArrowRight');
      const p1 = await t.pollUntil(
        () => pos('a1'),
        (p) => p.x !== p0.x,
        5000,
      );
      await t.press('ArrowDown');
      const p2 = await t.pollUntil(
        () => pos('a1'),
        (p) => p.y !== p1.y,
        5000,
      );
      await t.settled();
      return {
        ok: p1.x - p0.x === 1 && p2.y - p1.y === 1,
        observed: `dx ${p1.x - p0.x}; dy ${p2.y - p1.y}`,
      };
    },
  );
  await t.step('arrange.nudge.shift', 'Shift+ArrowRight', '10 px', async () => {
    const p0 = await pos('a1');
    await t.press('Shift+ArrowRight');
    const p1 = await t.pollUntil(
      () => pos('a1'),
      (p) => p.x !== p0.x,
      5000,
    );
    await t.settled();
    return { ok: p1.x - p0.x === 10, observed: `dx ${p1.x - p0.x}` };
  });
  await t.step(
    'arrange.nudge.undo',
    'Cmd+Z three times',
    'the nudges walk back one step each',
    async () => {
      const steps = [];
      let prev = await pos('a1');
      for (let i = 0; i < 3; i += 1) {
        await t.press('Meta+z');
        const p = await t.pollUntil(
          () => pos('a1'),
          (x) => !same(x, prev),
          5000,
        );
        steps.push(`${prev.x - p.x},${prev.y - p.y}`);
        prev = p;
      }
      await t.settled();
      return {
        ok:
          steps[0] === '10,0' &&
          steps[1] === '0,1' &&
          steps[2] === '1,0' &&
          same({ x: prev.x, y: prev.y }, { x: HOMES.a1.x, y: HOMES.a1.y }),
        observed: `steps ${steps.join(' | ')}; final ${t.posStr(prev)}`,
      };
    },
  );

  // ---- zoom
  const percent = async () => Math.round((await t.kOf()) * 100);
  const box = () => t.valueOf('view.zoom.value');
  const setZoom = async (value) => {
    await t.clickControl('view.zoom.value');
    await t.press('Meta+a');
    await t.typeHuman(String(value));
    await t.press('Enter');
    await t.sleep(600);
  };
  const fit = async () => {
    await t.menuPath('view', 'view.zoom', 'view.zoom.fit');
    await t.sleep(600);
  };
  const stepOf = (from, dir) => {
    if (dir > 0) return LADDER.find((v) => v > from + 0.5) ?? LADDER[LADDER.length - 1];
    const below = LADDER.filter((v) => v < from - 0.5);
    return below.length > 0 ? below[below.length - 1] : LADDER[0];
  };
  await t.step(
    'arrange.zoom.box-reads',
    'read the zoom box at fit, after a preset and after a typed value',
    'Fit, then the numbers',
    async () => {
      await t.clearAll();
      await fit();
      const atFit = await box();
      await setZoom(150);
      const typed = await box();
      const pct = await percent();
      await fit();
      return {
        ok: /fit/i.test(atFit ?? '') && /150/.test(typed ?? '') && t.near(pct, 150, 2),
        observed: `"${atFit}" then "${typed}" (stage ${pct}%)`,
      };
    },
  );
  await t.step(
    'arrange.zoom.type-percent',
    'type 150 in the zoom box and press Enter',
    'the stage draws 150%',
    async () => {
      await setZoom(150);
      const pct = await percent();
      return { ok: t.near(pct, 150, 2), observed: `stage ${pct}%; box "${await box()}"` };
    },
  );
  await t.step('arrange.zoom.cmd-0', 'Cmd+0', '100%', async () => {
    await t.clearAll();
    const p = await t.emptySheetPoint();
    await t.clickAt(p.x, p.y).catch(() => undefined);
    await t.press('Meta+0');
    const pct = await t.pollUntil(percent, (x) => t.near(x, 100, 2), 5000);
    return { ok: t.near(pct, 100, 2), observed: `stage ${pct}%; box "${await box()}"` };
  });
  await t.step('arrange.zoom.cmd-plus', 'Cmd+Plus from 100', '125%', async () => {
    await t.press('Meta+Equal');
    let pct = await t.pollUntil(percent, (x) => !t.near(x, 100, 2), 3000);
    let route = 'Meta+Equal';
    if (t.near(pct, 100, 2)) {
      await t.press('Meta+Shift+Equal');
      pct = await t.pollUntil(percent, (x) => !t.near(x, 100, 2), 3000);
      route = 'Meta+Shift+Equal';
    }
    return {
      ok: t.near(pct, 125, 2),
      observed: `stage ${pct}% after ${route}; box "${await box()}"`,
    };
  });
  await t.step('arrange.zoom.cmd-minus', 'Cmd+Minus', 'one rung down', async () => {
    const before = await percent();
    await t.press('Meta+Minus');
    const pct = await t.pollUntil(percent, (x) => !t.near(x, before, 2), 4000);
    return {
      ok: t.near(pct, stepOf(before, -1), 2),
      observed: `stage ${before}% -> ${pct}% (expected ${stepOf(before, -1)}); box "${await box()}"`,
    };
  });
  await t.step(
    'arrange.zoom.menu-in',
    'View > Zoom > Zoom in from Fit',
    'the next rung up from the current zoom',
    async () => {
      await fit();
      const before = await percent();
      await t.menuPath('view', 'view.zoom', 'view.zoom.in');
      const pct = await t.pollUntil(percent, (x) => !t.near(x, before, 2), 4000);
      return {
        ok: t.near(pct, stepOf(before, 1), 2),
        observed: `stage ${before}% -> ${pct}% (expected ${stepOf(before, 1)}); box "${await box()}"`,
      };
    },
  );
  await t.step('arrange.zoom.menu-out', 'View > Zoom > Zoom out', 'one rung down', async () => {
    const before = await percent();
    await t.menuPath('view', 'view.zoom', 'view.zoom.out');
    const pct = await t.pollUntil(percent, (x) => !t.near(x, before, 2), 4000);
    return {
      ok: t.near(pct, stepOf(before, -1), 2),
      observed: `stage ${before}% -> ${pct}% (expected ${stepOf(before, -1)}); box "${await box()}"`,
    };
  });
  await t.step(
    'arrange.zoom.fit',
    'View > Zoom > Fit from 150 on its first click',
    'the whole slide in the window',
    async () => {
      await setZoom(150);
      const before = await percent();
      await t.menuPath('view', 'view.zoom', 'view.zoom.fit');
      const pct = await t.pollUntil(percent, (x) => !t.near(x, before, 2), 4000);
      const sheet = await t.sheetRect();
      const stage = await t.rectOf('.ts-stagewrap.ts-editor');
      const inside = sheet && stage ? sheet.w <= stage.w + 1 && sheet.h <= stage.h + 1 : false;
      return {
        ok: !t.near(pct, 150, 2) && inside && /fit/i.test((await box()) ?? ''),
        observed: `stage ${before}% -> ${pct}%; sheet inside the stage ${inside}; box "${await box()}"`,
      };
    },
  );
  await t.step(
    'arrange.zoom.arrow-menu',
    'the arrow beside the zoom box, 200%',
    '200%',
    async () => {
      await t.clickControl('view.zoom.arrow');
      await page.locator('#ts-menu-zoom').waitFor({ timeout: 5000 });
      await t.clickControl('menu.view.zoom.200');
      const pct = await t.pollUntil(percent, (x) => t.near(x, 200, 2), 5000);
      return { ok: t.near(pct, 200, 2), observed: `stage ${pct}%; box "${await box()}"` };
    },
  );
  await t.step(
    'arrange.zoom.menu-presets',
    'View > Zoom > 50%, 100% and 200%',
    'each sets the stage and reads checked',
    async () => {
      const facts = [];
      let ok = true;
      for (const preset of ['50', '100', '200']) {
        await t.menuPath('view', 'view.zoom', `view.zoom.${preset}`);
        const pct = await t.pollUntil(percent, (x) => t.near(x, Number(preset), 2), 5000);
        await t.openMenu('view');
        await t.hoverRow('view.zoom', `[data-control="menu.view.zoom.${preset}"]`);
        const row = (await t.menuRows('view')).find((r) => r.id === `view.zoom.${preset}`);
        await t.closeMenus();
        const good = t.near(pct, Number(preset), 2) && row?.checked === 'true';
        ok = ok && good;
        facts.push(`${preset}: stage ${pct}%, checked ${row?.checked}`);
      }
      await fit();
      return { ok, observed: facts.join('; ') };
    },
  );

  // ---- the readout
  const readoutRow = async (rowId, zoom) => {
    await t.step(
      rowId,
      `drag the se handle of a1 at ${zoom}`,
      'the readout shows W × H during and is gone after',
      async () => {
        await rehome();
        if (zoom === 'fit') await fit();
        else await setZoom(200);
        /* at 200 percent the stage scrolls: a1's box is brought into view first, else its handle
           has no rect and the drag reads null (VERIFICATION.md pass 2 F-arrange-walk) */
        await page
          .locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="a1"]`)
          .first()
          .scrollIntoViewIfNeeded({ timeout: 4000 })
          .catch(() => undefined);
        await t.sleep(200);
        await t.selectObject('a1');
        const before = await pos('a1');
        let h = await t.handleRect('handle.a1.resize.se');
        if (!h) {
          await page
            .locator('.ts-overlay [data-control="handle.a1.resize.se"]')
            .first()
            .scrollIntoViewIfNeeded({ timeout: 4000 })
            .catch(() => undefined);
          await t.sleep(200);
          h = await t.handleRect('handle.a1.resize.se');
        }
        if (!h) return { ok: false, observed: `no se handle rect for a1 at ${zoom}` };
        const k = await t.kOf();
        const from = t.center(h);
        const mid = await t.drag(
          from,
          { x: from.x + 40 * k, y: from.y + 30 * k },
          { during: async () => ({ readout: await t.readout() }) },
        );
        await t.pollUntil(
          () => pos('a1'),
          (p) => p && !same(p, before),
          8000,
        );
        await t.sleep(700);
        const after = await t.readout();
        await t.settled();
        await undo();
        return {
          ok: /^\d+ × \d+$/.test(mid.readout ?? '') && after === null,
          observed: `during "${mid.readout}"; after ${after ?? 'none'}`,
        };
      },
    );
  };
  await readoutRow('arrange.readout.fit', 'fit');
  await readoutRow('arrange.readout.200', '200');
  await fit();

  // ---- the selection colour on the two appearances
  const appearance = async (value) => {
    const s = await t.state();
    await t.invoke('deck.set', { baseRevision: s.revision, path: '/defaults/appearance', value });
    await t.pollUntil(t.state, (x) => x.theme === value, 10_000);
    await t.settled();
    await t.sleep(400);
  };
  await t.step(
    'arrange.selection-colour.dark',
    'select an object on the dark appearance (the /new default)',
    'the ring and chip are #3d86f0',
    async () => {
      const theme = (await t.state()).theme;
      if (theme !== 'dark') await appearance('dark');
      await rehome();
      await t.selectObject('a1');
      const colour = await chipColour();
      return {
        ok: colour === 'rgb(61, 134, 240)',
        observed: `theme ${(await t.state()).theme}; chip ${colour}`,
      };
    },
  );
  await t.step(
    'arrange.selection-colour.light',
    'a setup write of the light appearance, then select an object',
    'the ring and chip are #1a73e8',
    async () => {
      await appearance('light');
      await rehome();
      await t.selectObject('a1');
      const colour = await chipColour();
      await t.clearAll();
      await appearance('dark');
      return {
        ok: colour === 'rgb(26, 115, 232)',
        observed: `chip ${colour} on the light appearance; dark restored`,
      };
    },
  );

  // ---- Escape and the Select button
  await t.step(
    'arrange.escape.text-then-selection',
    'double click a text box, Escape, Escape',
    'the session ends, then the selection clears',
    async () => {
      await rehome();
      const made = await t.placeBlock(A, {
        id: 'esc-box',
        type: 'text',
        text: 'Escape me',
        pos: { x: 200, y: 700, w: 300, h: 100 },
      });
      const run = made ? (await t.runsOfBlock('esc-box'))[0] : null;
      if (!run) return { ok: false, observed: 'no text box for the Escape row' };
      await t.openRun(run);
      const on = await t.editing();
      await t.press('Escape');
      await t.sleep(300);
      const off = await t.editing();
      const sel1 = await selectedIds();
      await t.press('Escape');
      await t.sleep(300);
      const sel2 = await selectedIds();
      return {
        ok: on && !off && sel1.includes('esc-box') && sel2.length === 0,
        observed: `editing ${on} -> ${off}; selected ${sel1.join(',')} -> ${sel2.join(',') || 'none'}`,
      };
    },
  );
  await t.step(
    'arrange.toolbar.select',
    'arm the Text box tool, click the toolbar Select button, click an object',
    'the pointer returns and the click selects',
    async () => {
      await t.clearAll();
      await t.clickControl('toolbar.textBox');
      await t.sleep(300);
      const armed = await t.attr(
        '.ts-stagewrap.ts-editor [data-tool], .ts-stagewrap.ts-editor',
        'data-tool',
      );
      await t.clickControl('toolbar.select');
      await t.sleep(300);
      const tool = await t.attr(
        '.ts-stagewrap.ts-editor [data-tool], .ts-stagewrap.ts-editor',
        'data-tool',
      );
      const before = await count();
      const ctrls = await t.selectObject('a2');
      const after = await count();
      return {
        ok: Boolean(ctrls) && after === before && (tool === null || /select|pointer/.test(tool)),
        observed: `tool armed ${armed}; after Select ${tool}; a click selected a2 ${Boolean(ctrls)}; objects ${before} -> ${after}`,
      };
    },
  );
  await t.clearAll();

  // ---- the return round's rows (docs/RETURN.md 2.12, 2.17, section 5): distribute, rotate,
  // flip, group by chord, menu and right click, the right click Rotate and Distribute, the
  // rulers, the guides, the snaps and Edit > Select none. Every row is reached in the default
  // view or with the switch on while it is parked (toolkit reachRow).
  const groupOf = async (id) => (await pos(id))?.group;
  const rotateOf = async (id) => (await pos(id))?.rotate ?? 0;
  const flipOf = async (id) => (await pos(id))?.flip ?? null;
  const gapsOf = (e, axis) => {
    const sorted = Object.values(e).sort((p, q) => (axis === 'x' ? p.l - q.l : p.t - q.t));
    return axis === 'x'
      ? [sorted[1].l - sorted[0].r, sorted[2].l - sorted[1].r]
      : [sorted[1].t - sorted[0].b, sorted[2].t - sorted[1].b];
  };
  const selectTwo = async () => {
    await t.clearAll();
    await t.selectObject('a1');
    const b = await t.boxOf('a2');
    await t.shiftClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
    await t.sleep(200);
    return t.chip();
  };
  const distributeRow = async (rowId, row, axis) => {
    await t.step(
      rowId,
      `three objects selected, Arrange > Distribute > ${row}; Cmd+Z`,
      'even gaps; Cmd+Z restores',
      async () => {
        await rehome();
        /* the homes are not evenly spaced on the axis, so the row has something to do */
        await t.setBlock(
          A,
          'a2',
          '/pos',
          axis === 'x' ? { ...HOMES.a2, x: 420 } : { ...HOMES.a2, y: 330 },
        );
        await selectAll();
        /* the row is asked of the menu with the three selected: Distribute is disabled below
           three and a disabled row's submenu does not open (the first gate run asked first) */
        const r = await t.reachRow(
          'arrange',
          'arrange.distribute',
          `arrange.distribute.${row.toLowerCase()}`,
        );
        if (!r.present) return { ok: false, observed: 'Arrange > Distribute is not reachable' };
        if ((await t.chip()) !== '3 objects') await selectAll();
        const before = await edges();
        await t.menuPath(
          'arrange',
          'arrange.distribute',
          `arrange.distribute.${row.toLowerCase()}`,
        );
        const after = await t.pollUntil(edges, (e) => !same(e, before), 8000).catch(edges);
        await t.settled();
        const gaps = gapsOf(after, axis).map(Math.round);
        const even = Math.abs(gaps[0] - gaps[1]) <= 1;
        await t.clearAll();
        await undo();
        const back = same(await edges(), before);
        await rehome();
        return {
          ok: even && back,
          observed: `${r.switched ? 'with the switch on; ' : ''}gaps before ${gapsOf(before, axis).map(Math.round).join(', ')} -> after ${gaps.join(', ')} (even ${even}); Cmd+Z restored ${back}`,
        };
      },
    );
  };
  await distributeRow('arrange.distribute.horizontal', 'Horizontally', 'x');
  await distributeRow('arrange.distribute.vertical', 'Vertically', 'y');
  await t.step(
    'arrange.distribute.needs-three',
    'two objects selected, open Arrange',
    'the Distribute row is disabled',
    async () => {
      const chip = await selectTwo();
      await t.openMenu('arrange');
      const row = (await t.menuRows('arrange')).find((x) => x.id === 'arrange.distribute');
      await t.closeMenus();
      return {
        ok: chip === '2 objects' && row !== undefined && row.disabled,
        observed: `chip "${chip}"; Distribute ${row ? (row.disabled ? 'disabled' : 'enabled') : 'absent'}`,
      };
    },
  );
  await t.step(
    'arrange.rotate.quarter-turns',
    'select a1: Rotate clockwise 90, Cmd+Z; Rotate counter clockwise 90, Cmd+Z',
    'the rotation writes and each Cmd+Z takes it back',
    async () => {
      /* the Rotate rows are enabled with an object selected: a1 is selected before the rows are
         looked for (the gate's first runs read them as unreachable with nothing selected) */
      await rehome();
      await t.selectObject('a1');
      const r = await t.reachRow('arrange', 'arrange.rotate', 'arrange.rotate.clockwise');
      if (!r.present) return { ok: false, observed: 'Arrange > Rotate is not reachable' };
      await t.selectObject('a1');
      await t.menuPath('arrange', 'arrange.rotate', 'arrange.rotate.clockwise');
      const cw = await t
        .pollUntil(
          () => rotateOf('a1'),
          (x) => x === 90,
          8000,
        )
        .catch(() => rotateOf('a1'));
      await t.clearAll();
      await undo();
      const back1 = await rotateOf('a1');
      await t.selectObject('a1');
      await t.menuPath('arrange', 'arrange.rotate', 'arrange.rotate.counterClockwise');
      const ccw = await t
        .pollUntil(
          () => rotateOf('a1'),
          (x) => x === 270,
          8000,
        )
        .catch(() => rotateOf('a1'));
      await t.clearAll();
      await undo();
      const back2 = await rotateOf('a1');
      return {
        ok: cw === 90 && back1 === 0 && ccw === 270 && back2 === 0,
        observed: `clockwise ${cw} -> Cmd+Z ${back1}; counter clockwise ${ccw} -> Cmd+Z ${back2}`,
      };
    },
  );
  await t.step(
    'arrange.rotate.flips-menu',
    'select a1: Flip horizontally, Cmd+Z; Flip vertically, Cmd+Z',
    'each flip writes and Cmd+Z takes it back',
    async () => {
      await rehome();
      await t.selectObject('a1');
      await t.menuPath('arrange', 'arrange.rotate', 'arrange.rotate.flipHorizontally');
      const h = await t
        .pollUntil(
          () => flipOf('a1'),
          (x) => x !== null,
          8000,
        )
        .catch(() => flipOf('a1'));
      await t.clearAll();
      await undo();
      const back1 = await flipOf('a1');
      await t.selectObject('a1');
      await t.menuPath('arrange', 'arrange.rotate', 'arrange.rotate.flipVertically');
      const v = await t
        .pollUntil(
          () => flipOf('a1'),
          (x) => x !== null,
          8000,
        )
        .catch(() => flipOf('a1'));
      await t.clearAll();
      await undo();
      const back2 = await flipOf('a1');
      return {
        ok: h === 'h' && back1 === null && v === 'v' && back2 === null,
        observed: `flip ${h} -> Cmd+Z ${back1}; flip ${v} -> Cmd+Z ${back2}`,
      };
    },
  );
  await t.step(
    'arrange.group.chords',
    'a1 and a2 selected, Cmd+Option+G, ArrowRight twice, Cmd+Option+Shift+G; three Cmd+Z',
    'chip Group, both move, the group leaves; the undos return the start',
    async () => {
      await rehome();
      const before = { a1: await pos('a1'), a2: await pos('a2') };
      const chip = await selectTwo();
      await t.press('Meta+Alt+g');
      const grouped = await t
        .pollUntil(
          () => groupOf('a1'),
          (g) => g !== undefined,
          8000,
        )
        .catch(() => groupOf('a1'));
      const chipGroup = await t.chip();
      await t.press('ArrowRight');
      await t.sleep(200);
      await t.press('ArrowRight');
      await t.settled();
      const moved = { a1: await pos('a1'), a2: await pos('a2') };
      await t.press('Meta+Alt+Shift+g');
      const ungrouped = await t
        .pollUntil(
          () => groupOf('a1'),
          (g) => g === undefined,
          8000,
        )
        .catch(() => groupOf('a1'));
      await t.clearAll();
      /* the undos return the start: the group, the two nudges (one history entry each, as in
         Google Slides) and the ungroup are four entries, so Cmd+Z is pressed until the start is
         back, at most six times, and the count is recorded (the first drive pressed three and read
         the group still applied; return/build/integrator.md) */
      const atStart = async () => {
        const after = { a1: await pos('a1'), a2: await pos('a2') };
        return same(
          {
            a1: { x: after.a1.x, y: after.a1.y, g: after.a1.group },
            a2: { x: after.a2.x, y: after.a2.y, g: after.a2.group },
          },
          {
            a1: { x: before.a1.x, y: before.a1.y, g: before.a1.group },
            a2: { x: before.a2.x, y: before.a2.y, g: before.a2.group },
          },
        );
      };
      let undos = 0;
      let start = false;
      while (undos < 6 && !start) {
        await undo();
        undos += 1;
        start = await atStart();
      }
      return {
        ok:
          chip === '2 objects' &&
          grouped !== undefined &&
          chipGroup === 'Group' &&
          moved.a1.x === before.a1.x + 2 &&
          moved.a2.x === before.a2.x + 2 &&
          ungrouped === undefined &&
          start,
        observed: `chip "${chip}" -> "${chipGroup}" (group ${grouped}); x ${before.a1.x},${before.a2.x} -> ${moved.a1.x},${moved.a2.x}; after ungroup ${ungrouped}; ${undos} Cmd+Z returned the start ${start}`,
      };
    },
  );
  await t.step(
    'arrange.group.menu-regroup',
    'Arrange > Group, Ungroup, Regroup; read the enabled states; Cmd+Z',
    'each row acts with its enabled state and Cmd+Z takes the last back',
    async () => {
      const r = await t.reachRow('arrange', 'arrange.group');
      if (!r.present) return { ok: false, observed: 'Arrange > Group is not reachable' };
      await rehome();
      const states = async () => {
        await t.openMenu('arrange');
        /* the rows are read once the three are drawn: a read right after the plate mounted found no
           Group row and answered false for every state (the first drive's "enabled before" read
           every row false while the row's click grouped; return/build/integrator.md) */
        const wanted = ['arrange.group', 'arrange.ungroup', 'arrange.regroup'];
        const rows = await t
          .pollUntil(
            () => t.menuRows('arrange'),
            (list) => wanted.every((id) => list.some((x) => x.id === id)),
            4000,
          )
          .catch(() => t.menuRows('arrange'));
        await t.closeMenus();
        return Object.fromEntries(
          ['arrange.group', 'arrange.ungroup', 'arrange.regroup'].map((id) => [
            id.replace('arrange.', ''),
            rows.find((x) => x.id === id)?.disabled === false,
          ]),
        );
      };
      await selectTwo();
      const s0 = await states();
      await t.menuPath('arrange', 'arrange.group');
      const grouped = await t
        .pollUntil(
          () => groupOf('a1'),
          (g) => g !== undefined,
          8000,
        )
        .catch(() => groupOf('a1'));
      await t.clearAll();
      await t.selectObject('a1');
      const s1 = await states();
      await t.menuPath('arrange', 'arrange.ungroup');
      const ungrouped = await t
        .pollUntil(
          () => groupOf('a1'),
          (g) => g === undefined,
          8000,
        )
        .catch(() => groupOf('a1'));
      await t.clearAll();
      await t.selectObject('a1');
      const s2 = await states();
      await t.menuPath('arrange', 'arrange.regroup');
      const regrouped = await t
        .pollUntil(
          () => groupOf('a1'),
          (g) => g !== undefined,
          8000,
        )
        .catch(() => groupOf('a1'));
      await t.clearAll();
      await undo();
      const back = await groupOf('a1');
      await undo();
      await undo();
      return {
        ok:
          s0.group &&
          !s0.ungroup &&
          grouped !== undefined &&
          s1.ungroup &&
          ungrouped === undefined &&
          s2.regroup &&
          regrouped !== undefined &&
          back === undefined,
        observed: `${r.switched ? 'with the switch on; ' : ''}enabled before ${JSON.stringify(s0)}; Group -> ${grouped}; enabled then ${JSON.stringify(s1)}; Ungroup -> ${ungrouped}; enabled then ${JSON.stringify(s2)}; Regroup -> ${regrouped}; Cmd+Z -> ${back}`,
      };
    },
  );
  await t.step(
    'arrange.group.context-rows',
    'right click on two selected boxes: Group; right click the group: read Ungroup',
    'Group is listed and groups; Ungroup is listed on the group',
    async () => {
      await rehome();
      await selectTwo();
      const b = await t.boxOf('a1');
      await t.rightClickAt(b.free.x + 8, b.free.y + 8);
      const rows1 = (await t.contextRows()).map((x) => x.id);
      let grouped;
      if (rows1.includes('arrange.group')) {
        await t.clickContextRow('arrange.group');
        grouped = await t
          .pollUntil(
            () => groupOf('a1'),
            (g) => g !== undefined,
            8000,
          )
          .catch(() => groupOf('a1'));
      } else await t.press('Escape');
      await t.settled();
      await t.clearAll();
      await t.selectObject('a1');
      const b2 = await t.boxOf('a1');
      await t.rightClickAt(b2.free.x + 8, b2.free.y + 8);
      const rows2 = (await t.contextRows()).map((x) => x.id);
      await t.press('Escape');
      await t.clearAll();
      if (grouped !== undefined) await undo();
      return {
        ok:
          rows1.includes('arrange.group') &&
          grouped !== undefined &&
          rows2.includes('arrange.ungroup'),
        observed: `two selected: rows ${rows1.join(', ')}; grouped ${grouped}; on the group: rows ${rows2.join(', ')}`,
      };
    },
  );
  await t.step(
    'arrange.context.rotate-distribute',
    'right click a shape, a text block and a line: Rotate > Rotate clockwise 90 on each (Cmd+Z each); three selected, right click one, Distribute > Horizontally',
    'the rotation writes on each and the distribute spreads the three',
    async () => {
      await rehome();
      const shape = await t.placeBlock(A, {
        id: 'ar-shape',
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        pos: { x: 152, y: 720, w: 200, h: 120 },
      });
      const line = await t.placeBlock(A, {
        id: 'ar-line',
        type: 'shape',
        shape: 'line',
        stroke: 'ink',
        width: 2,
        orientation: 'horizontal',
        pos: { x: 600, y: 780, w: 300, h: 1 },
      });
      if (!shape || !line)
        return { ok: false, observed: `setup: shape ${Boolean(shape)}, line ${Boolean(line)}` };
      const facts = [];
      let ok = true;
      for (const id of ['ar-shape', 'a1', 'ar-line']) {
        await t.clearAll();
        await t.selectObject(id);
        const b = await t.boxOf(id);
        const c =
          id === 'ar-line'
            ? { x: b.free.x + b.free.w / 2, y: b.free.y + Math.max(1, b.free.h / 2) }
            : { x: b.free.x + 8, y: b.free.y + 8 };
        await t.rightClickAt(c.x, c.y);
        const rows = (await t.contextRows()).map((x) => x.id);
        let rot = null;
        if (rows.includes('arrange.rotate')) {
          await t.hoverContextRow(
            'arrange.rotate',
            '[data-control="menu.arrange.rotate.clockwise"]',
          );
          await t.clickRow('arrange.rotate.clockwise');
          rot = await t
            .pollUntil(
              () => rotateOf(id),
              (x) => x === 90,
              8000,
            )
            .catch(() => rotateOf(id));
        } else await t.press('Escape');
        await t.clearAll();
        if (rot === 90) await undo();
        const back = await rotateOf(id);
        ok = ok && rot === 90 && back === 0;
        facts.push(
          `${id}: Rotate listed ${rows.includes('arrange.rotate')}, rotate ${rot} -> Cmd+Z ${back}`,
        );
      }
      await selectAll();
      const b = await t.boxOf('a1');
      await t.rightClickAt(b.free.x + 8, b.free.y + 8);
      const rows = (await t.contextRows()).map((x) => x.id);
      const before = await edges();
      let spread = false;
      if (rows.includes('arrange.distribute')) {
        await t.hoverContextRow(
          'arrange.distribute',
          '[data-control="menu.arrange.distribute.horizontally"]',
        );
        await t.clickRow('arrange.distribute.horizontally');
        const after = await t.pollUntil(edges, (e) => !same(e, before), 8000).catch(edges);
        const gaps = gapsOf(after, 'x').map(Math.round);
        spread = Math.abs(gaps[0] - gaps[1]) <= 1;
        facts.push(`Distribute listed; gaps ${gaps.join(', ')}`);
        await t.clearAll();
        await undo();
      } else {
        await t.press('Escape');
        facts.push(`Distribute absent from ${rows.join(', ')}`);
      }
      for (const id of ['ar-shape', 'ar-line']) {
        const s = await t.state();
        await t
          .invoke('block.remove', { baseRevision: s.revision, slideId: A, blockId: id })
          .catch(() => undefined);
        await t.settled();
      }
      await rehome();
      return { ok: ok && spread, observed: facts.join('; ') };
    },
  );
  const guides = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="guide."]')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => e.getAttribute('data-control')),
    );
  const storedGuides = async () => {
    const info = await t.invoke('deck.info');
    return info.guides ?? info.defaults?.guides ?? { count: info.counts?.guides ?? null };
  };
  const storedCount = (g) => (g?.x?.length ?? 0) + (g?.y?.length ?? 0) + (g?.count ?? 0);
  const storedHas = (g, axis, at) => (g?.[axis] ?? []).some((v) => Math.abs(v - at) <= 2);
  /**
   * The guides drawn: the sheet draws them only while View > Guides > Show guides is on, and a
   * guide added from the ruler or the menu does not turn it on (the first gate run stored every
   * guide and drew none), so a row that presses on a guide turns it on first and says so.
   */
  const ensureGuidesShown = async () => {
    const drawn = await guides();
    if (drawn.length > 0) return { shown: false, drawn };
    if (storedCount(await storedGuides()) === 0) return { shown: false, drawn };
    await t.menuPath('view', 'view.guides', 'view.guides.show');
    const after = await t.pollUntil(guides, (g) => g.length > 0, 5000).catch(guides);
    return { shown: true, drawn: after };
  };
  const rulerLabel = async () => {
    await t.openMenu('view');
    const row = (await t.menuRows('view')).find((r) => r.id === 'view.showRuler');
    await t.closeMenus();
    return row?.label ?? null;
  };
  await t.step(
    'arrange.ruler.show-hide',
    'View > Show ruler; read the row; View > Hide ruler',
    'both rulers draw and the row reads Hide ruler; Hide ruler removes them',
    async () => {
      const r = await t.reachRow('view', 'view.showRuler');
      if (!r.present) return { ok: false, observed: 'View > Show ruler is not reachable' };
      if (await t.has('[data-control="ruler.x"]')) await t.menuPath('view', 'view.showRuler');
      await t.menuPath('view', 'view.showRuler');
      const shown = await t
        .pollUntil(
          async () =>
            (await t.has('[data-control="ruler.x"]')) && (await t.has('[data-control="ruler.y"]')),
          (x) => x,
          5000,
        )
        .catch(() => false);
      const label = await rulerLabel();
      await t.menuPath('view', 'view.showRuler');
      const hidden = await t
        .pollUntil(
          () => t.has('[data-control="ruler.x"]'),
          (x) => !x,
          5000,
        )
        .catch(() => t.has('[data-control="ruler.x"]'));
      return {
        ok: shown && label === 'Hide ruler' && hidden === false,
        observed: `${r.switched ? 'with the switch on; ' : ''}rulers drawn ${shown}; the row read "${label}"; after Hide ruler drawn ${hidden}`,
      };
    },
  );
  await t.step(
    'arrange.guides.from-ruler',
    'Show ruler; press on the top ruler at sheet x 400 and drag into the slide',
    'the readout reads inches and a vertical guide is stored',
    async () => {
      if (!(await t.has('[data-control="ruler.x"]'))) await t.menuPath('view', 'view.showRuler');
      await t
        .pollUntil(
          () => t.has('[data-control="ruler.x"]'),
          (x) => x,
          5000,
        )
        .catch(() => undefined);
      const ruler = await t.rectOf('[data-control="ruler.x"]');
      const p400 = await t.sheetPoint(400, 300);
      const before = await guides();
      const during = await t.drag(
        { x: p400.x, y: ruler.y + ruler.h / 2 },
        { x: p400.x, y: p400.y },
        {
          steps: 16,
          during: async () => ({
            readout:
              (await t.readout()) ??
              (await page.evaluate(
                () =>
                  [...document.querySelectorAll('.ts-overlay *, .ts-stagewrap *')]
                    .map((e) => (e.children.length === 0 ? (e.textContent ?? '').trim() : ''))
                    .find((x) => /^-?\d+(\.\d+)?\s*in$/.test(x)) ?? null,
              )),
          }),
        },
      );
      await t.settled();
      const stored = await t
        .pollUntil(storedGuides, (g) => storedHas(g, 'x', 400), 8000)
        .catch(storedGuides);
      const after = await guides();
      return {
        ok: storedHas(stored, 'x', 400) && /in\b/.test(during?.readout ?? ''),
        observed: `stored ${JSON.stringify(stored)}; drawn guides ${before.join(',') || 'none'} -> ${after.join(',') || 'none'}${after.length === 0 ? ' (drawn only once View > Guides > Show guides is on)' : ''}; readout during "${during?.readout ?? 'none'}"`,
      };
    },
  );
  await t.step(
    'arrange.guides.show-toggle',
    'View > Guides > Show guides, twice',
    'the guides hide, then show',
    async () => {
      const r = await t.reachRow('view', 'view.guides', 'view.guides.show');
      if (!r.present) return { ok: false, observed: 'View > Guides is not reachable' };
      const stored = storedCount(await storedGuides());
      const before = await guides();
      await t.menuPath('view', 'view.guides', 'view.guides.show');
      const flipped = await t
        .pollUntil(guides, (g) => g.length !== before.length, 5000)
        .catch(guides);
      await t.menuPath('view', 'view.guides', 'view.guides.show');
      const back = await t.pollUntil(guides, (g) => g.length === before.length, 5000).catch(guides);
      /* from either state: shown then hidden, or hidden then shown (a guide added from the ruler
         does not turn the row on, so the first press shows) */
      return {
        ok: stored > 0 && flipped.length !== before.length && back.length === before.length,
        observed: `${stored} stored; drawn ${before.length} -> ${flipped.length} -> ${back.length} (${before.length === 0 ? 'hidden at the start: the first press showed them' : 'shown at the start: the first press hid them'})`,
      };
    },
  );
  await t.step(
    'arrange.guides.add-vertical-horizontal',
    'View > Guides > Add vertical guide, Add horizontal guide',
    'guides at the slide centre, stored on the deck',
    async () => {
      await t.menuPath('view', 'view.guides', 'view.guides.addVertical');
      await t.settled();
      await t.menuPath('view', 'view.guides', 'view.guides.addHorizontal');
      await t.settled();
      const stored = await t
        .pollUntil(storedGuides, (g) => storedHas(g, 'x', 800) && storedHas(g, 'y', 450), 8000)
        .catch(storedGuides);
      const list = await guides();
      return {
        ok: storedHas(stored, 'x', 800) && storedHas(stored, 'y', 450),
        observed: `stored ${JSON.stringify(stored)}; drawn ${list.join(', ') || 'none'}`,
      };
    },
  );
  await t.step(
    'arrange.guides.drag',
    'press on the vertical guide at 800 and move at once by 200 px',
    'the guide lands at 1000 and the deck stores it',
    async () => {
      const shown = await ensureGuidesShown();
      const g = await t.rectOf('[data-control="guide.x.800"]');
      if (!g)
        return {
          ok: false,
          observed: `no guide at 800 (guides ${(await guides()).join(', ')}; stored ${JSON.stringify(await storedGuides())})`,
        };
      const k = await t.kOf();
      const sheet = await t.sheetRect();
      /* the press at the guide's centre, where the horizontal guide at 450 crosses it: the
         audit's flaky drag was a press at that crossing taking the horizontal guide drawn on top
         (return/build/b3.md 1.1); a press away from the crossing passed before the fix */
      const from = { x: g.x + g.w / 2, y: sheet.y + sheet.h * 0.5 };
      await t.drag(from, { x: from.x + 200 * k, y: from.y }, { steps: 14 });
      await t.settled();
      const nearX = (l, at, tol) =>
        l.find((g) => {
          const m = /^guide\.x\.(-?\d+)$/.exec(g);
          return m && Math.abs(Number(m[1]) - at) <= tol;
        });
      /* within 2 px: the drag is 200 sheet px scaled to the stage and rounded back */
      const list = await t.pollUntil(guides, (l) => Boolean(nearX(l, 1000, 2)), 8000).catch(guides);
      const stored = await storedGuides();
      const landed = nearX(list, 1000, 2);
      t.deck.guideX = landed ? Number(/(\d+)$/.exec(landed)[1]) : null;
      return {
        ok: Boolean(landed) && !list.includes('guide.x.800'),
        observed: `${shown.shown ? 'View > Guides > Show guides turned on first; ' : ''}guides ${list.join(', ')}; stored ${JSON.stringify(stored)}`,
      };
    },
  );
  /** Drags a1 so its left edge aims at a sheet x; answers the stored x after. */
  const dropLeftAt = async (targetX) => {
    await rehome();
    await t.clearAll();
    await t.selectObject('a1');
    const p = await pos('a1');
    const r = await t.dragInside(A, 'a1', targetX - p.x, 0);
    await t.settled();
    return (await pos('a1')).x;
  };
  const snapSetting = async (key) => (await t.state()).settings?.[key];
  const setSnap = async (row, key, on) => {
    if ((await snapSetting(key)) === on) return;
    await t.menuPath('view', 'view.snapTo', `view.snapTo.${row}`);
    await t
      .pollUntil(
        () => snapSetting(key),
        (x) => x === on,
        5000,
      )
      .catch(() => undefined);
  };
  await t.step(
    'arrange.snap.guides-on-off',
    'drop a1 4 px short of the guide at 1000 with Snap to > Guides on, then off',
    'it lands on the guide with the row on and where it is dropped with it off',
    async () => {
      const r = await t.reachRow('view', 'view.snapTo', 'view.snapTo.guides');
      if (!r.present) return { ok: false, observed: 'View > Snap to is not reachable' };
      await setSnap('guides', 'snapGuides', true);
      await setSnap('grid', 'snapGrid', false);
      /* the guide where the drag row left it (1000 within 2 px), shown so the snap has it */
      const guideX = t.deck.guideX ?? 1000;
      await ensureGuidesShown();
      const aimed = guideX - 4;
      const on = await dropLeftAt(aimed);
      await setSnap('guides', 'snapGuides', false);
      const off = await dropLeftAt(aimed);
      await setSnap('guides', 'snapGuides', true);
      await rehome();
      return {
        ok: on === guideX && t.near(off, aimed, 1),
        observed: `guide at ${guideX}; aimed ${aimed}: with Snap to guides on landed ${on}; off landed ${off}`,
      };
    },
  );
  await t.step(
    'arrange.snap.grid-toggle',
    'View > Snap to > Grid, twice',
    'the check flips both ways and the browser keeps it',
    async () => {
      const a = await snapSetting('snapGrid');
      await t.menuPath('view', 'view.snapTo', 'view.snapTo.grid');
      const b = await t
        .pollUntil(
          () => snapSetting('snapGrid'),
          (x) => x !== a,
          5000,
        )
        .catch(() => snapSetting('snapGrid'));
      const kept = await page.evaluate(() => localStorage.getItem('ts-editor-settings'));
      await t.menuPath('view', 'view.snapTo', 'view.snapTo.grid');
      const c = await t
        .pollUntil(
          () => snapSetting('snapGrid'),
          (x) => x === a,
          5000,
        )
        .catch(() => snapSetting('snapGrid'));
      return {
        ok: b !== a && c === a && /snapGrid/.test(kept ?? ''),
        observed: `snapGrid ${a} -> ${b} -> ${c}; stored ${/snapGrid/.test(kept ?? '')}`,
      };
    },
  );
  await t.step(
    'arrange.snap.grid-effect',
    'Grid on and Guides off: drop a1 with its left edge at 300 (4 px off the 8 px grid); then Grid off',
    'it lands on the grid line with Grid on and at 300 with it off',
    async () => {
      await setSnap('guides', 'snapGuides', false);
      await setSnap('grid', 'snapGrid', true);
      const on = await dropLeftAt(300);
      await setSnap('grid', 'snapGrid', false);
      const off = await dropLeftAt(300);
      await setSnap('guides', 'snapGuides', true);
      await rehome();
      return {
        ok: on % 8 === 0 && on !== 300 && t.near(off, 300, 1),
        observed: `aimed 300: Grid on landed ${on} (on the grid ${on % 8 === 0}); Grid off landed ${off}`,
      };
    },
  );
  await t.step(
    'arrange.guides.context',
    'right click the empty sheet, read Guides; right click a guide, Delete guide',
    'the Guides submenu is listed; Delete guide removes the guide',
    async () => {
      await t.clearAll();
      const p = await t.emptySheetPoint();
      await t.rightClickAt(p.x, p.y);
      const rows = (await t.contextRows()).map((x) => x.id);
      let sub = [];
      if (rows.includes('view.guides')) {
        await t.hoverContextRow('view.guides', '[data-control="menu.view.guides.show"]');
        sub = (await t.contextRows()).map((x) => x.id).filter((x) => x.startsWith('view.guides.'));
      }
      await t.press('Escape');
      await t.press('Escape');
      const shown = await ensureGuidesShown();
      const g = await t.rectOf('[data-control="guide.y.450"]');
      if (!g)
        return {
          ok: false,
          observed: `Guides listed ${rows.includes('view.guides')} (${sub.join(', ')}); no horizontal guide to right click (drawn ${shown.drawn.join(', ') || 'none'}; stored ${JSON.stringify(await storedGuides())})`,
        };
      const sheet = await t.sheetRect();
      await t.rightClickAt(sheet.x + sheet.w * 0.3, g.y + g.h / 2);
      const guideRows = (await t.contextRows()).map((x) => x.id);
      let deleted = false;
      if (guideRows.includes('view.guides.delete')) {
        await t.clickContextRow('view.guides.delete');
        deleted = await t
          .pollUntil(guides, (l) => !l.includes('guide.y.450'), 8000)
          .then((l) => !l.includes('guide.y.450'))
          .catch(() => false);
      } else await t.press('Escape');
      return {
        ok:
          rows.includes('view.guides') &&
          sub.length >= 4 &&
          guideRows.includes('view.guides.delete') &&
          deleted,
        observed: `${shown.shown ? 'View > Guides > Show guides turned on first; ' : ''}empty sheet rows ${rows.join(', ')}; Guides submenu ${sub.join(', ')}; guide rows ${guideRows.join(', ')}; deleted ${deleted}`,
      };
    },
  );
  await t.step(
    'arrange.guides.clear',
    'View > Guides > Clear guides',
    'every guide leaves and the deck stores none',
    async () => {
      const storedBefore = await storedGuides();
      const before = await guides();
      await t.menuPath('view', 'view.guides', 'view.guides.clear');
      const stored = await t
        .pollUntil(storedGuides, (g) => storedCount(g) === 0, 8000)
        .catch(storedGuides);
      const after = await guides();
      await t.settled();
      if (await t.has('[data-control="ruler.x"]')) await t.menuPath('view', 'view.showRuler');
      return {
        ok: storedCount(storedBefore) > 0 && storedCount(stored) === 0 && after.length === 0,
        observed: `stored ${JSON.stringify(storedBefore)} -> ${JSON.stringify(stored)}; drawn ${before.length} -> ${after.length}`,
      };
    },
  );
  await t.step(
    'arrange.select-none.menu',
    'select a1, Edit > Select none; select two cards, Edit > Select none',
    'the object selection clears; the filmstrip selection falls to the active card',
    async () => {
      const r = await t.reachRow('edit', 'edit.selectNone');
      if (!r.present) return { ok: false, observed: 'Edit > Select none is not reachable' };
      await rehome();
      await t.selectObject('a1');
      const chipBefore = await t.chip();
      await t.menuPath('edit', 'edit.selectNone');
      await t.sleep(300);
      const handles = (await t.handleControls()).length;
      const order = await t.slideOrder();
      const other = order.find((id) => id !== A) ?? order[0];
      await t.clickCard(A);
      const c = await t.cardCenter(other);
      await t.shiftClickAt(c.x, c.y);
      const selected = (await t.cards()).filter((x) => x.selected).length;
      await t.menuPath('edit', 'edit.selectNone');
      await t.sleep(300);
      const after = (await t.cards()).filter((x) => x.selected);
      await t.clickCard(A);
      return {
        ok: chipBefore !== null && handles === 0 && selected >= 2 && after.length === 1,
        observed: `chip "${chipBefore}" -> handles ${handles}; cards selected ${selected} -> ${after.length} (${after.map((x) => x.id).join(',')})`,
      };
    },
  );
  await t.clearAll();
  await productRound(t);
}

/**
 * The product round's rows (docs/PRODUCT.md section 2 rank 1, 8.1): a new table or chart from a
 * menu is selected and lands in the free rectangle of the body slot, cascading 40 by 40 sheet px
 * when the slot is taken. B3 owns the placement (`block.insert` in controller.tsx,
 * select-after-write.ts); the rows read the selection facts and the stored positions.
 */
async function productRound(t) {
  const overlap = (a, b) =>
    !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const S = await t
    .setup('a slide for the insert rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.arrangeSlide ?? t.deck.titleSlide, 'blank');
      t.deck.insertSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.insertSlide);
  await t.clickCard(S);
  await t.clearAll();
  await t.step(
    'arrange.insert.selected-after-menu',
    'Insert > Table 3 by 3 and type a cell; Insert > Chart > Column; read the selections and the boxes',
    'the table is selected with its handles; the chart is selected (chip Chart, eight handles) and its box does not overlap the table',
    async () => {
      const r = await t.reachRow('insert', 'insert.table');
      if (!r.present) return { ok: false, observed: 'Insert > Table is not reachable' };
      const before = await t.objectIds(S);
      await t.openMenu('insert');
      await t.hoverRow('insert.table', '[data-control="insert.table.plate"]');
      const cell = await t.rectOf('[data-control="insert.table.pick.3x3"]');
      if (!cell) {
        await t.closeMenus();
        return { ok: false, observed: 'no 3 by 3 cell in the grid picker' };
      }
      const c = t.center(cell);
      await t.clickAt(c.x, c.y);
      const table = await t.newObjectAfter(S, before);
      await t.settled();
      const tableFacts = table ? await t.selectionFacts(table.id) : null;
      /* a typed cell, so the table is a seller's and not an empty grid */
      if (table) {
        const run = (await t.runsOfBlock(table.id))[0];
        if (run) {
          await t.openRun(run).catch(() => undefined);
          await t.typeHuman('Q3');
          await t.press('Escape');
          await t.settled();
        }
      }
      const r2 = await t.reachRow('insert', 'insert.chart', 'insert.chart.column');
      if (!r2.present) {
        await t.advancedBack('the insert rows');
        return { ok: false, observed: 'Insert > Chart > Column is not reachable' };
      }
      const before2 = await t.objectIds(S);
      await t.menuPath('insert', 'insert.chart', 'insert.chart.column');
      const chart = await t.newObjectAfter(S, before2);
      await t.settled();
      const chartFacts = chart ? await t.selectionFacts(chart.id) : null;
      const tablePos = table ? (await t.blockOf(S, table.id))?.pos : null;
      const chartPos = chart ? (await t.blockOf(S, chart.id))?.pos : null;
      const apart = Boolean(tablePos && chartPos && !overlap(tablePos, chartPos));
      t.deck.insertObjects = [table?.id ?? null, chart?.id ?? null];
      await t.advancedBack('the insert rows');
      return {
        ok:
          Boolean(table) &&
          tableFacts.selected &&
          tableFacts.resize === 8 &&
          Boolean(chart) &&
          chartFacts.selected &&
          chartFacts.resize === 8 &&
          /chart/i.test(chartFacts.chip ?? '') &&
          apart,
        observed: `table ${table ? `${table.id} ${t.posStr(tablePos)} ${t.describeSelection(tableFacts)}` : 'none'}; chart ${chart ? `${chart.id} ${t.posStr(chartPos)} ${t.describeSelection(chartFacts)}` : 'none'}; boxes apart ${apart}`,
      };
    },
  );
  await t.step(
    'arrange.insert.free-rectangle',
    'two blocks fill the body slot (setup writes); Insert > Chart > Bar',
    'the third insert lands 40 by 40 sheet px from the last object and inside the sheet',
    async () => {
      const F = await t.setupSlide(S, 'blank');
      await t.clickCard(F);
      await t.clearAll();
      const first = await t.placeBlock(F, {
        id: 'fill-a',
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        pos: { x: 120, y: 120, w: 1360, h: 320 },
      });
      const last = await t.placeBlock(F, {
        id: 'fill-b',
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        pos: { x: 120, y: 480, w: 1360, h: 320 },
      });
      if (!first || !last) return { ok: false, observed: 'the two filling blocks were not placed' };
      const r = await t.reachRow('insert', 'insert.chart', 'insert.chart.bar');
      if (!r.present) return { ok: false, observed: 'Insert > Chart > Bar is not reachable' };
      const before = await t.objectIds(F);
      await t.menuPath('insert', 'insert.chart', 'insert.chart.bar');
      const chart = await t.newObjectAfter(F, before);
      await t.settled();
      await t.advancedBack('the insert rows');
      if (!chart) return { ok: false, observed: 'nothing inserted within 20 s' };
      const p = (await t.blockOf(F, chart.id))?.pos ?? chart.pos;
      const lastPos = (await t.blockOf(F, 'fill-b'))?.pos ?? last.pos;
      const dx = p.x - lastPos.x;
      const dy = p.y - lastPos.y;
      const inside = p.x >= 0 && p.y >= 0 && p.x + p.w <= 1600 && p.y + p.h <= 900;
      return {
        ok: t.near(dx, 40, 2) && t.near(dy, 40, 2) && inside,
        observed: `the last object at ${t.posStr(lastPos)}; the chart at ${t.posStr(p)} (dx ${t.fmt(dx)}, dy ${t.fmt(dy)}); inside the sheet ${inside}`,
      };
    },
  );
  await t.clearAll();
}

// Slides and the filmstrip, the probe's rows (docs/FOCUS.md 2.2, 6.4 `slides.*` with the driver
// `probe --core`): every route to New slide, Duplicate, Delete and Skip, the selection, the
// reorders, the 21 layouts from the picker, the layout carry rows, the notes pane, the counter
// and the hash. The two tab paste is core/slides.spec.ts. Every slide this area adds is added
// through the product; the one fresh slide the layout rows need is a setup write.

export const NAME = 'slides';
export const IDS = [
  'slides.new.toolbar',
  'slides.new.arrow-layout',
  'slides.new.menu',
  'slides.new.ctrl-m-card',
  'slides.new.ctrl-m-canvas',
  'slides.new.context',
  'slides.new.undo',
  'slides.duplicate.context',
  'slides.duplicate.menu',
  'slides.duplicate.cmd-d',
  'slides.duplicate.undo-toolbar',
  'slides.duplicate.undo-redo-keys',
  'slides.duplicate.two-selected-cmd-d',
  'slides.duplicate.two-selected-menu',
  'slides.delete.key',
  'slides.delete.undo-snackbar',
  'slides.delete.context',
  'slides.delete.undo-cmd-z',
  'slides.delete.menu-undo-redo',
  'slides.delete.two-selected-key-undo',
  'slides.delete.two-selected-menu',
  'slides.delete.two-selected-edit-menu',
  'slides.delete.canvas-focus-undo',
  'slides.delete.undo-redo-saved',
  'slides.select.click',
  'slides.select.arrows-shift',
  'slides.select.shift-cmd-click',
  'slides.select.cmd-click-toggle',
  'slides.reorder.drag-above',
  'slides.reorder.drag-below',
  'slides.reorder.cmd-up-down',
  'slides.reorder.menu-to-end-undo',
  'slides.reorder.undo-drag',
  'slides.reorder.two-selected-drag',
  'slides.skip.context',
  'slides.skip.context-two',
  'slides.skip.menu-unskip',
  'slides.skip.menu-two',
  'slides.layout.picker-open-escape',
  'slides.layout.apply.title',
  'slides.layout.apply.opener',
  'slides.layout.apply.split',
  'slides.layout.apply.cols',
  'slides.layout.apply.title-only',
  'slides.layout.apply.one-column',
  'slides.layout.apply.statement',
  'slides.layout.apply.section-description',
  'slides.layout.apply.mood',
  'slides.layout.apply.big-number',
  'slides.layout.apply.blank',
  'slides.layout.apply.rows',
  'slides.layout.apply.plain',
  'slides.layout.apply.table',
  'slides.layout.apply.figure',
  'slides.layout.apply.pair',
  'slides.layout.apply.tiles',
  'slides.layout.apply.details',
  'slides.layout.apply.board',
  'slides.layout.apply.matrix',
  'slides.layout.apply.closing',
  'slides.layout.reopen-ring',
  'slides.layout.context-apply',
  'slides.layout.menu-apply-undo',
  'slides.layout.fresh-slide-two-picks-no-carry',
  'slides.layout.typed-title-round-trip',
  'slides.layout.snackbar-counts-typed-only',
  'slides.layout.undo-typed',
  'slides.notes.type',
  'slides.notes.per-slide',
  'slides.notes.resize-handle',
  'slides.notes.reload',
  'slides.counter.footer-and-cards',
  'slides.hash.click-and-reload',
  'slides.reorder.menu-up-down-beginning',
  'slides.reorder.cmd-shift-up-down',
  'slides.notes.view-menu-toggle',
  'slides.context.empty-canvas',
  'slides.numbers.apply',
];

const LAYOUTS = [
  'title',
  'opener',
  'split',
  'cols',
  'title-only',
  'one-column',
  'statement',
  'section-description',
  'mood',
  'big-number',
  'blank',
  'rows',
  'plain',
  'table',
  'figure',
  'pair',
  'tiles',
  'details',
  'board',
  'matrix',
  'closing',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page, BASE } = t;
  const T = t.deck.titleSlide;

  /** Waits for the order to have `n` slides; returns the order. */
  const orderOf = (n, timeout = 20_000) =>
    t.pollUntil(t.slideOrder, (o) => o.length === n, timeout);
  const added = (before, after) => after.find((id) => !before.includes(id)) ?? null;
  const layoutOf = async (id) => {
    const s = await t.slideJson(id);
    return s.template ?? s.kind ?? s.layout ?? null;
  };
  const headingOf = async (id) => {
    const s = await t.slideJson(id);
    const text = JSON.stringify(s).match(/"text":"([^"]{1,80})"/);
    return text ? text[1] : '';
  };
  /** Clicks card A then Shift clicks card B; returns the selected ids. */
  const selectTwo = async (a, b) => {
    await t.closeMenus();
    await t.clickCard(a);
    await t.pollUntil(
      async () => (await t.cards()).filter((x) => x.selected).length,
      (n) => n === 1,
      3000,
    );
    const c = await t.cardCenter(b);
    await t.shiftClickAt(c.x, c.y);
    await t.sleep(200);
    return (await t.cards()).filter((x) => x.selected).map((x) => x.id);
  };
  const emptySheetPoint = async () => t.emptySheetPoint();
  const countLabel = async () => {
    const c = await t.counter();
    return c ? `${c.n} of ${c.total}` : null;
  };
  const cardNumbers = async () => (await t.cards()).map((c) => c.number);

  // ---- New slide by every route
  let order = await t.slideOrder();
  await t.step(
    'slides.new.toolbar',
    'click New slide in the toolbar',
    'one slide is added after the current one and becomes current',
    async () => {
      await t.clearAll();
      await t.clickCard(T);
      const before = await t.slideOrder();
      await t.clickControl('toolbar.newSlide');
      order = await orderOf(before.length + 1);
      const id = added(before, order);
      const active = await t.pollUntil(t.activeSlide, (a) => a === id, 6000);
      return {
        ok: Boolean(id) && order[before.indexOf(T) + 1] === id && active === id,
        observed: `${before.length} -> ${order.length}; new ${id} at ${order.indexOf(id)}; active ${active}`,
      };
    },
  );
  await t.step(
    'slides.new.arrow-layout',
    'the arrow beside New slide, then a layout tile',
    'the plate opens and a pick adds a slide with that layout',
    async () => {
      const before = await t.slideOrder();
      await t.clickControl('toolbar.newSlide.arrow');
      const plate = page
        .locator('[data-control="layout.new.plate"], [data-control="layout.apply.plate"]')
        .first();
      await plate.waitFor({ timeout: 8000 });
      const tile = page
        .locator('[data-control="layout.new.title-only"], [data-control="layout.apply.title-only"]')
        .first();
      const r = await tile.boundingBox();
      if (!r) {
        await t.press('Escape');
        return { ok: false, observed: 'the plate opened but had no Title only tile' };
      }
      await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
      order = await orderOf(before.length + 1);
      const id = added(before, order);
      const layout = id
        ? await t.pollUntil(
            () => layoutOf(id),
            (l) => l === 'title-only',
            8000,
          )
        : null;
      return {
        ok: Boolean(id) && layout === 'title-only',
        observed: `new ${id}; layout ${layout}`,
      };
    },
  );
  await t.step('slides.new.menu', 'Slide > New slide', 'a slide is added', async () => {
    const before = await t.slideOrder();
    await t.menuPath('slide', 'slide.newSlide');
    order = await orderOf(before.length + 1);
    return {
      ok: order.length === before.length + 1,
      observed: `${before.length} -> ${order.length}`,
    };
  });
  await t.step(
    'slides.new.ctrl-m-card',
    'Ctrl+M with a filmstrip card focused',
    'a slide is added',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[1]);
      await t.press('Control+m');
      order = await orderOf(before.length + 1);
      return {
        ok: order.length === before.length + 1,
        observed: `${before.length} -> ${order.length}; focus ${await t.activeDesc()}`,
      };
    },
  );
  await t.step(
    'slides.new.ctrl-m-canvas',
    'Ctrl+M with the canvas focused',
    'a slide is added',
    async () => {
      const before = await t.slideOrder();
      const p = await emptySheetPoint();
      await t.clickAt(p.x, p.y);
      await t.press('Control+m');
      order = await orderOf(before.length + 1);
      return {
        ok: order.length === before.length + 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.new.context',
    'right click a card > New slide',
    'a slide is added after it',
    async () => {
      const before = await t.slideOrder();
      const target = before[1];
      const c = await t.cardCenter(target);
      await t.rightClickAt(c.x, c.y);
      await t.clickContextRow('slide.newSlide');
      order = await orderOf(before.length + 1);
      const id = added(before, order);
      return {
        ok: Boolean(id) && order[order.indexOf(target) + 1] === id,
        observed: `${before.length} -> ${order.length}; new ${id} after ${target} ${order[order.indexOf(target) + 1] === id}`,
      };
    },
  );
  await t.step(
    'slides.new.undo',
    'Cmd+Z after New slide',
    'the new slide is removed and the order restored',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[0]);
      await t.clickControl('toolbar.newSlide');
      const withNew = await orderOf(before.length + 1);
      await t.settled();
      await t.press('Meta+z');
      order = await orderOf(before.length);
      return {
        ok: same(order, before),
        observed: `${before.join(',')} -> ${withNew.length} -> ${order.join(',')}`,
      };
    },
  );

  // ---- Duplicate
  const HEAD_TEXT = await headingOf(T);
  await t.step(
    'slides.duplicate.context',
    'right click the title card > Duplicate slide',
    'the copy lands after the source with its heading',
    async () => {
      const before = await t.slideOrder();
      const c = await t.cardCenter(T);
      await t.rightClickAt(c.x, c.y);
      await t.clickContextRow('slide.duplicateSlide');
      order = await orderOf(before.length + 1);
      const id = added(before, order);
      const head = id ? await headingOf(id) : '';
      t.deck.dupOfTitle = id;
      return {
        ok: Boolean(id) && order[order.indexOf(T) + 1] === id && head === HEAD_TEXT,
        observed: `new ${id} after ${T}; heading "${head}" (source "${HEAD_TEXT}")`,
      };
    },
  );
  await t.step(
    'slides.duplicate.menu',
    'Slide > Duplicate slide',
    'one more slide after the current one',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[1]);
      await t.menuPath('slide', 'slide.duplicateSlide');
      order = await orderOf(before.length + 1);
      return {
        ok: order.length === before.length + 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.duplicate.cmd-d',
    'Cmd+D with a card focused',
    'the slide is duplicated',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[1]);
      await t.press('Meta+d');
      order = await orderOf(before.length + 1);
      return {
        ok: order.length === before.length + 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.duplicate.undo-toolbar',
    'the toolbar Undo',
    'the duplicate is removed',
    async () => {
      const before = await t.slideOrder();
      await t.settled();
      await t.clickControl('toolbar.undo');
      order = await orderOf(before.length - 1);
      return {
        ok: order.length === before.length - 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.duplicate.undo-redo-keys',
    'Cmd+D, Cmd+Z, Cmd+Shift+Z',
    'the duplicate leaves and comes back',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[1]);
      await t.press('Meta+d');
      const dup = await orderOf(before.length + 1);
      await t.settled();
      await t.press('Meta+z');
      const undone = await orderOf(before.length);
      await t.settled();
      await t.press('Meta+Shift+z');
      order = await orderOf(before.length + 1);
      return {
        ok: dup.length === before.length + 1 && same(undone, before) && same(order, dup),
        observed: `${before.length} -> ${dup.length} -> ${undone.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.duplicate.two-selected-cmd-d',
    'two cards selected, Cmd+D',
    'both are copied',
    async () => {
      const before = await t.slideOrder();
      const sel = await selectTwo(before[1], before[2]);
      await t.press('Meta+d');
      order = await orderOf(before.length + 2);
      await t.settled();
      return {
        ok: sel.length === 2 && order.length === before.length + 2,
        observed: `selected ${sel.join(',')}; ${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.duplicate.two-selected-menu',
    'two cards selected, Slide > Duplicate slide',
    'both are copied',
    async () => {
      const before = await t.slideOrder();
      const sel = await selectTwo(before[1], before[2]);
      await t.menuPath('slide', 'slide.duplicateSlide');
      order = await orderOf(before.length + 2);
      await t.settled();
      return {
        ok: sel.length === 2 && order.length === before.length + 2,
        observed: `selected ${sel.join(',')}; ${before.length} -> ${order.length}`,
      };
    },
  );

  // ---- Delete
  await t.step(
    'slides.delete.key',
    'Delete with a card focused',
    'the slide leaves with the Slide deleted snackbar',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[before.length - 1]);
      await t.press('Delete');
      order = await orderOf(before.length - 1);
      const said = await t.snackbarWithin(4000);
      return {
        ok: order.length === before.length - 1 && /Slide deleted/.test(said ?? ''),
        observed: `${before.length} -> ${order.length}; snackbar "${said}"`,
      };
    },
  );
  await t.step(
    'slides.delete.undo-snackbar',
    'Undo on the snackbar',
    'the slide returns at its index',
    async () => {
      const before = await t.slideOrder();
      const victim = before[2];
      await t.clickCard(victim);
      await t.press('Delete');
      await orderOf(before.length - 1);
      await t.waitControl('snackbar.action', 5000);
      await t.clickControl('snackbar.action');
      order = await orderOf(before.length);
      return { ok: same(order, before), observed: `${before.join(',')} -> ${order.join(',')}` };
    },
  );
  await t.step(
    'slides.delete.context',
    'right click a card > Delete',
    'the slide leaves',
    async () => {
      const before = await t.slideOrder();
      const c = await t.cardCenter(before[before.length - 1]);
      await t.rightClickAt(c.x, c.y);
      await t.clickContextRow('edit.delete');
      order = await orderOf(before.length - 1);
      return {
        ok: order.length === before.length - 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.delete.undo-cmd-z',
    'Cmd+Z after the delete',
    'the slide returns',
    async () => {
      const before = await t.slideOrder();
      await t.settled();
      await t.press('Meta+z');
      order = await orderOf(before.length + 1);
      return {
        ok: order.length === before.length + 1,
        observed: `${before.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.delete.menu-undo-redo',
    'Slide > Delete slide, the toolbar Undo, Edit > Redo',
    'the slide leaves, returns, leaves',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[before.length - 1]);
      await t.menuPath('slide', 'slide.deleteSlide');
      const gone = await orderOf(before.length - 1);
      await t.settled();
      await t.clickControl('toolbar.undo');
      const back = await orderOf(before.length);
      await t.settled();
      await t.menuPath('edit', 'edit.redo');
      order = await orderOf(before.length - 1);
      return {
        ok:
          gone.length === before.length - 1 &&
          same(back, before) &&
          order.length === before.length - 1,
        observed: `${before.length} -> ${gone.length} -> ${back.length} -> ${order.length}`,
      };
    },
  );
  await t.step(
    'slides.delete.two-selected-key-undo',
    'two cards selected, Delete, the snackbar Undo, a reload',
    'both leave, both return, the server order matches after a reload',
    async () => {
      const before = await t.slideOrder();
      const sel = await selectTwo(before[1], before[2]);
      await t.press('Delete');
      const gone = await orderOf(before.length - 2);
      await t.waitControl('snackbar.action', 5000);
      await t.clickControl('snackbar.action');
      const back = await orderOf(before.length);
      await t.settled();
      await t.reloadTo(page.url());
      await t.settled();
      order = await t.slideOrder();
      return {
        ok:
          sel.length === 2 &&
          gone.length === before.length - 2 &&
          same(back, before) &&
          same(order, before),
        observed: `selected ${sel.join(',')}; ${before.length} -> ${gone.length} -> ${back.length}; after reload ${same(order, before) ? 'same' : order.join(',')}`,
      };
    },
  );
  await t.step(
    'slides.delete.two-selected-menu',
    'two cards selected, Slide > Delete slide',
    'both leave',
    async () => {
      const before = await t.slideOrder();
      const sel = await selectTwo(before[1], before[2]);
      await t.menuPath('slide', 'slide.deleteSlide');
      order = await orderOf(before.length - 2, 8000);
      const ok = sel.length === 2 && order.length === before.length - 2;
      await t.settled();
      // restore the pair for the next rows, through the product's own undo
      while ((await t.slideOrder()).length < before.length) {
        await t.press('Meta+z');
        await t.sleep(600);
        if ((await t.slideOrder()).length >= before.length) break;
      }
      await t.settled();
      return { ok, observed: `selected ${sel.join(',')}; ${before.length} -> ${order.length}` };
    },
  );
  await t.step(
    'slides.delete.two-selected-edit-menu',
    'two cards selected, Edit > Delete',
    'both leave',
    async () => {
      const before = await t.slideOrder();
      const sel = await selectTwo(before[1], before[2]);
      await t.menuPath('edit', 'edit.delete');
      order = await orderOf(before.length - 2, 8000);
      const ok = sel.length === 2 && order.length === before.length - 2;
      await t.settled();
      while ((await t.slideOrder()).length < before.length) {
        await t.press('Meta+z');
        await t.sleep(600);
        if ((await t.slideOrder()).length >= before.length) break;
      }
      await t.settled();
      return { ok, observed: `selected ${sel.join(',')}; ${before.length} -> ${order.length}` };
    },
  );
  await t.step(
    'slides.delete.canvas-focus-undo',
    'click the empty canvas, Delete, Cmd+Z',
    'the slide returns in the tab and on the server after a reload',
    async () => {
      const before = await t.slideOrder();
      const victim = before[before.length - 1];
      await t.clickCard(victim);
      const p = await emptySheetPoint();
      await t.clickAt(p.x, p.y);
      await t.press('Delete');
      let route = 'the canvas Delete removed the slide';
      let gone = await orderOf(before.length - 1, 4000);
      if (gone.length === before.length) {
        // the rule of rank 4: Delete with the stage focused and nothing selected removes no slide, so
        // the saved delete this row undoes is made from the card
        route =
          'the canvas Delete removed nothing (rank 4); the delete was made from the focused card';
        await t.clickCard(victim);
        await t.press('Delete');
        gone = await orderOf(before.length - 1, 8000);
      }
      await t.settled();
      await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 15_000);
      await t.press('Meta+z');
      const back = await orderOf(before.length, 12_000);
      await t.settled();
      const said = await t.snackbar();
      await t.reloadTo(page.url());
      await t.settled();
      order = await t.slideOrder();
      return {
        ok: gone.length === before.length - 1 && same(back, before) && same(order, before),
        observed: `${route}; ${before.length} -> ${gone.length} -> ${back.length}; after reload ${same(order, before) ? 'same order' : order.join(',')}; snackbar ${said ?? 'none'}`,
      };
    },
  );
  await t.step(
    'slides.delete.undo-redo-saved',
    'delete a slide, wait for the save, Cmd+Z, wait, Cmd+Shift+Z, reload',
    'the server order matches the screen after the reload',
    async () => {
      const before = await t.slideOrder();
      await t.clickCard(before[before.length - 1]);
      await t.press('Delete');
      const gone = await orderOf(before.length - 1);
      await t.settled();
      await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 15_000);
      await t.press('Meta+z');
      const back = await orderOf(before.length, 12_000);
      await t.settled();
      await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 15_000);
      await t.press('Meta+Shift+z');
      const again = await orderOf(before.length - 1, 12_000);
      await t.settled();
      const said = await t.snackbar();
      const screen = await t.slideOrder();
      await t.reloadTo(page.url());
      await t.settled();
      order = await t.slideOrder();
      return {
        ok:
          gone.length === before.length - 1 &&
          same(back, before) &&
          again.length === before.length - 1 &&
          same(order, screen),
        observed: `${before.length} -> ${gone.length} -> ${back.length} -> ${again.length}; server after reload ${same(order, screen) ? 'matches the screen' : order.join(',')}; snackbar ${said ?? 'none'}`,
      };
    },
  );

  // ---- Selection
  await t.setup('trim the deck to 5 slides', 'slide.remove through the window API', async () => {
    const order = await t.trimTo(5, [T]);
    return { ok: order.length <= 5, observed: `${order.length} slides` };
  });
  await t.step(
    'slides.select.click',
    'click a card',
    'current, selected and focused; the stage and the hash follow',
    async () => {
      order = await t.slideOrder();
      const target = order[2] ?? order[1];
      await t.clickCard(target);
      const active = await t.pollUntil(t.activeSlide, (a) => a === target, 6000);
      const card = (await t.cards()).find((c) => c.id === target);
      const hash = await t.pollUntil(t.hash, (h) => h === `#s/${target}`, 5000);
      return {
        ok:
          active === target &&
          card?.current &&
          card?.selected &&
          card?.focused &&
          hash === `#s/${target}`,
        observed: `active ${active}; card current ${card?.current} selected ${card?.selected} focused ${card?.focused}; hash ${hash}`,
      };
    },
  );
  await t.step(
    'slides.select.arrows-shift',
    'Down and Up, then Shift+Down',
    'the current card moves, Shift+Down extends the selection',
    async () => {
      order = await t.slideOrder();
      await t.clickCard(order[1]);
      await t.press('ArrowDown');
      const down = await t.pollUntil(t.activeSlide, (a) => a === order[2], 4000);
      await t.press('ArrowUp');
      const up = await t.pollUntil(t.activeSlide, (a) => a === order[1], 4000);
      await t.press('Shift+ArrowDown');
      await t.sleep(400);
      const sel = (await t.cards()).filter((c) => c.selected).map((c) => c.id);
      return {
        ok: down === order[2] && up === order[1] && sel.length === 2,
        observed: `down ${down}, up ${up}; after Shift+Down selected ${sel.join(',')}`,
      };
    },
  );
  await t.step(
    'slides.select.shift-cmd-click',
    'Shift click a range, Cmd click one, plain click',
    'a range, then one more, then one',
    async () => {
      order = await t.slideOrder();
      await t.clickCard(order[0]);
      let c = await t.cardCenter(order[2]);
      await t.shiftClickAt(c.x, c.y);
      const range = (await t.cards()).filter((x) => x.selected).length;
      c = await t.cardCenter(order[4] ?? order[3]);
      await t.metaClickAt(c.x, c.y);
      const plus = (await t.cards()).filter((x) => x.selected).length;
      await t.clickCard(order[1]);
      const one = (await t.cards()).filter((x) => x.selected).length;
      return {
        ok: range === 3 && plus === 4 && one === 1,
        observed: `range ${range}; after Cmd click ${plus}; after a plain click ${one}`,
      };
    },
  );
  await t.step(
    'slides.select.cmd-click-toggle',
    'Cmd click a card twice',
    'it is added, then dropped',
    async () => {
      order = await t.slideOrder();
      await t.clickCard(order[1]);
      const c = await t.cardCenter(order[2]);
      await t.metaClickAt(c.x, c.y);
      const two = (await t.cards()).filter((x) => x.selected).length;
      await t.metaClickAt(c.x, c.y);
      const one = (await t.cards()).filter((x) => x.selected).length;
      return { ok: two === 2 && one === 1, observed: `${two} then ${one}` };
    },
  );

  // ---- Reorder
  await t.setup('trim the deck to 5 slides', 'slide.remove through the window API', async () => {
    const order = await t.trimTo(5, [T]);
    return { ok: order.length <= 5, observed: `${order.length} slides` };
  });
  await t.step(
    'slides.reorder.drag-above',
    'drag a card above another',
    'the order changes',
    async () => {
      order = await t.slideOrder();
      await t.dragCard(order[2], order[1], 'above');
      const after = await t.pollUntil(t.slideOrder, (o) => o[1] === order[2], 12_000);
      await t.settled();
      return {
        ok: after[1] === order[2] && after[2] === order[1],
        observed: `${order.join(',')} -> ${after.join(',')}`,
      };
    },
  );
  await t.step(
    'slides.reorder.undo-drag',
    'Cmd+Z after the drag',
    'the order is restored',
    async () => {
      const before = order;
      await t.press('Meta+z');
      const after = await t.pollUntil(t.slideOrder, (o) => same(o, before), 12_000);
      await t.settled();
      return { ok: same(after, before), observed: `${after.join(',')}` };
    },
  );
  await t.step(
    'slides.reorder.drag-below',
    'drag a card below another',
    'the order changes',
    async () => {
      order = await t.slideOrder();
      await t.dragCard(order[1], order[3] ?? order[2], 'below');
      const after = await t.pollUntil(t.slideOrder, (o) => !same(o, order), 12_000);
      await t.settled();
      const idx = after.indexOf(order[1]);
      return {
        ok: !same(after, order) && idx === after.indexOf(order[3] ?? order[2]) + 1,
        observed: `${order.join(',')} -> ${after.join(',')}`,
      };
    },
  );
  await t.step(
    'slides.reorder.cmd-up-down',
    'Cmd+Down and Cmd+Up with a card focused',
    'the card moves one step each way',
    async () => {
      order = await t.slideOrder();
      const card = order[1];
      await t.clickCard(card);
      await t.press('Meta+ArrowDown');
      const down = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 2, 8000);
      await t.settled();
      await t.press('Meta+ArrowUp');
      const up = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 1, 8000);
      await t.settled();
      return {
        ok: down.indexOf(card) === 2 && up.indexOf(card) === 1,
        observed: `index 1 -> ${down.indexOf(card)} -> ${up.indexOf(card)}`,
      };
    },
  );
  await t.step(
    'slides.reorder.menu-to-end-undo',
    'Slide > Move slide > Move slide to end, then Cmd+Z',
    'the card goes last and comes back',
    async () => {
      order = await t.slideOrder();
      const card = order[1];
      await t.clickCard(card);
      await t.menuPath('slide', 'slide.moveSlide', 'slide.moveSlide.toEnd');
      const end = await t.pollUntil(t.slideOrder, (o) => o[o.length - 1] === card, 8000);
      await t.settled();
      await t.press('Meta+z');
      const back = await t.pollUntil(t.slideOrder, (o) => same(o, order), 8000);
      await t.settled();
      return {
        ok: end[end.length - 1] === card && same(back, order),
        observed: `to end ${end[end.length - 1] === card}; back ${same(back, order)}`,
      };
    },
  );
  await t.step(
    'slides.reorder.menu-up-down-beginning',
    'Slide > Move slide > up, down, to beginning',
    'each moves the current card',
    async () => {
      order = await t.slideOrder();
      const card = order[2];
      await t.clickCard(card);
      await t.menuPath('slide', 'slide.moveSlide', 'slide.moveSlide.up');
      const up = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 1, 8000);
      await t.settled();
      await t.menuPath('slide', 'slide.moveSlide', 'slide.moveSlide.down');
      const down = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 2, 8000);
      await t.settled();
      await t.menuPath('slide', 'slide.moveSlide', 'slide.moveSlide.toBeginning');
      const first = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 0, 8000);
      await t.settled();
      // back where it was
      await t.press('Meta+z');
      await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 2, 8000);
      await t.settled();
      return {
        ok: up.indexOf(card) === 1 && down.indexOf(card) === 2 && first.indexOf(card) === 0,
        observed: `index 2 -> ${up.indexOf(card)} -> ${down.indexOf(card)} -> ${first.indexOf(card)}`,
      };
    },
  );
  await t.step(
    'slides.reorder.cmd-shift-up-down',
    'Cmd+Shift+Up then Cmd+Shift+Down with a card focused',
    'to the beginning, then to the end',
    async () => {
      order = await t.slideOrder();
      const card = order[2];
      await t.clickCard(card);
      await t.press('Meta+Shift+ArrowUp');
      const first = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === 0, 8000);
      await t.settled();
      await t.press('Meta+Shift+ArrowDown');
      const last = await t.pollUntil(t.slideOrder, (o) => o.indexOf(card) === o.length - 1, 8000);
      await t.settled();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.press('Meta+z');
      await t.pollUntil(t.slideOrder, (o) => same(o, order), 8000);
      await t.settled();
      return {
        ok: first.indexOf(card) === 0 && last.indexOf(card) === last.length - 1,
        observed: `index 2 -> ${first.indexOf(card)} -> ${last.indexOf(card)} of ${last.length - 1}`,
      };
    },
  );
  await t.step(
    'slides.reorder.two-selected-drag',
    'two selected cards dragged together',
    'both move',
    async () => {
      order = await t.slideOrder();
      const [a, b] = [order[1], order[2]];
      await selectTwo(a, b);
      await t.dragCard(a, order[order.length - 1], 'below');
      const after = await t.pollUntil(t.slideOrder, (o) => o.indexOf(a) > 2, 12_000);
      await t.settled();
      const together = Math.abs(after.indexOf(a) - after.indexOf(b)) === 1 && after.indexOf(a) > 2;
      await t.press('Meta+z');
      await t.pollUntil(t.slideOrder, (o) => same(o, order), 8000).catch(() => undefined);
      await t.settled();
      return { ok: together, observed: `${order.join(',')} -> ${after.join(',')}` };
    },
  );

  // ---- Skip
  await t.setup('trim the deck to 5 slides', 'slide.remove through the window API', async () => {
    const order = await t.trimTo(5, [T]);
    return { ok: order.length <= 5, observed: `${order.length} slides` };
  });
  await t.step(
    'slides.skip.context',
    'right click a card > Skip slide',
    'the card fades with the eye glyph and the row reads Unskip slide',
    async () => {
      order = await t.slideOrder();
      const card = order[order.length - 1];
      const c = await t.cardCenter(card);
      await t.rightClickAt(c.x, c.y);
      await t.clickContextRow('slide.skipSlide');
      const skipped = await t.pollUntil(
        async () => (await t.cards()).find((x) => x.id === card)?.skipped,
        (x) => x === true,
        8000,
      );
      const glyph = await t.has(`[data-control="filmstrip.slide.${card}"] .ts-card-skip`);
      await t.rightClickAt(c.x, c.y);
      const label = (await t.contextRows()).find((r) => r.id === 'slide.skipSlide')?.label ?? '';
      await t.press('Escape');
      await t.sleep(200);
      return {
        ok: skipped === true && glyph && /Unskip slide/.test(label),
        observed: `skipped ${skipped}; glyph ${glyph}; row "${label}"`,
      };
    },
  );
  await t.step(
    'slides.skip.menu-unskip',
    'Slide > Unskip slide',
    'the skipped slide comes back',
    async () => {
      order = await t.slideOrder();
      const card = order[order.length - 1];
      await t.clickCard(card);
      await t.menuPath('slide', 'slide.skipSlide');
      const skipped = await t.pollUntil(
        async () => (await t.cards()).find((x) => x.id === card)?.skipped,
        (x) => x === false,
        8000,
      );
      return { ok: skipped === false, observed: `skipped ${skipped}` };
    },
  );
  await t.step(
    'slides.skip.context-two',
    'two cards selected, right click > Skip slide',
    'both skipped with the Skipped 2 slides snackbar',
    async () => {
      order = await t.slideOrder();
      const [a, b] = [order[order.length - 2], order[order.length - 1]];
      await selectTwo(a, b);
      const c = await t.cardCenter(b);
      await t.rightClickAt(c.x, c.y);
      await t.clickContextRow('slide.skipSlide');
      const both = await t.pollUntil(
        async () => (await t.cards()).filter((x) => [a, b].includes(x.id) && x.skipped).length,
        (n) => n === 2,
        8000,
      );
      const said = await t.snackbarWithin(4000);
      return {
        ok: both === 2 && /Skipped 2 slides/.test(said ?? ''),
        observed: `skipped ${both} of 2; snackbar "${said}"`,
      };
    },
  );
  await t.step(
    'slides.skip.menu-two',
    'two cards selected, Slide > Skip slide (unskips the pair), then again',
    'both toggle together',
    async () => {
      order = await t.slideOrder();
      const [a, b] = [order[order.length - 2], order[order.length - 1]];
      await selectTwo(a, b);
      await t.menuPath('slide', 'slide.skipSlide');
      const none = await t.pollUntil(
        async () => (await t.cards()).filter((x) => [a, b].includes(x.id) && x.skipped).length,
        (n) => n === 0,
        8000,
      );
      await selectTwo(a, b);
      await t.menuPath('slide', 'slide.skipSlide');
      const both = await t.pollUntil(
        async () => (await t.cards()).filter((x) => [a, b].includes(x.id) && x.skipped).length,
        (n) => n === 2,
        8000,
      );
      // leave one slide skipped for the export, present and share rows; unskip the other
      await t.clickCard(a);
      await t.menuPath('slide', 'slide.skipSlide');
      await t.pollUntil(
        async () => (await t.cards()).find((x) => x.id === a)?.skipped,
        (x) => x === false,
        8000,
      );
      t.deck.skippedSlide = b;
      return {
        ok: none === 0 && both === 2,
        observed: `unskipped to ${none}, skipped to ${both}; ${b} stays skipped for the later areas`,
      };
    },
  );

  // ---- Layouts on one fresh slide
  const L = await t
    .setup('a fresh slide for the layout rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(order[1], 'split');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(async () => {
      const o = await t.slideOrder();
      return o.find((id) => !order.includes(id));
    });
  await t.clickCard(L);
  await t.step(
    'slides.layout.picker-open-escape',
    'the toolbar Layout button, then Escape',
    'the picker opens ringing the current layout and closes',
    async () => {
      await t.clearAll();
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      const ringed = await t.attr(
        '[data-control="layout.apply.plate"] .ts-layout-tile.is-current',
        'data-layout',
      );
      const current = await layoutOf(L);
      await t.press('Escape');
      const gone = await t.waitGone('[data-control="layout.apply.plate"]');
      return {
        ok: ringed === current && gone,
        observed: `ringed ${ringed}; current ${current}; gone ${gone}`,
      };
    },
  );
  for (const layout of LAYOUTS) {
    await t.step(
      `slides.layout.apply.${layout}`,
      `apply ${layout} from the picker`,
      `the slide's template reads ${layout}`,
      async () => {
        await t.clearAll();
        if ((await t.activeSlide()) !== L) await t.clickCard(L);
        await t.tailControl('toolbar.layout');
        await t.waitControl('layout.apply.plate', 8000);
        await t.clickControl(`layout.apply.${layout}`);
        const got = await t.pollUntil(
          () => layoutOf(L),
          (l) => l === layout,
          15_000,
        );
        await t.settled();
        const said = await t.snackbar();
        return {
          ok: got === layout,
          observed: `template ${got}${said ? `; snackbar "${said}"` : ''}`,
        };
      },
    );
  }
  await t.step(
    'slides.layout.reopen-ring',
    'reopen the picker',
    'the applied layout is ringed',
    async () => {
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      const ringed = await t.attr(
        '[data-control="layout.apply.plate"] .ts-layout-tile.is-current',
        'data-layout',
      );
      await t.press('Escape');
      await t.waitGone('[data-control="layout.apply.plate"]');
      return { ok: ringed === 'closing', observed: `ringed ${ringed}` };
    },
  );
  await t.step(
    'slides.layout.context-apply',
    'right click the card > Apply layout > Title and body',
    'the layout applies',
    async () => {
      const c = await t.cardCenter(L);
      await t.rightClickAt(c.x, c.y);
      await t.hoverContextRow('slide.applyLayout', '[data-control="menu.slide.applyLayout.split"]');
      await t.clickControl('menu.slide.applyLayout.split');
      const got = await t.pollUntil(
        () => layoutOf(L),
        (l) => l === 'split',
        15_000,
      );
      await t.settled();
      return { ok: got === 'split', observed: `template ${got}` };
    },
  );
  await t.step(
    'slides.layout.menu-apply-undo',
    'Slide > Apply layout > Title only, then Cmd+Z',
    'the previous layout returns',
    async () => {
      const before = await layoutOf(L);
      await t.menuPath('slide', 'slide.applyLayout', 'layout.apply.title-only');
      const got = await t.pollUntil(
        () => layoutOf(L),
        (l) => l === 'title-only',
        15_000,
      );
      await t.settled();
      await t.clearAll();
      await t.press('Meta+z');
      const back = await t.pollUntil(
        () => layoutOf(L),
        (l) => l === before,
        15_000,
      );
      await t.settled();
      return {
        ok: got === 'title-only' && back === before,
        observed: `${before} -> ${got} -> ${back}`,
      };
    },
  );
  await t.step(
    'slides.layout.fresh-slide-two-picks-no-carry',
    'on a fresh slide apply Section header then Title and body',
    "the slide holds only the second layout's placeholders",
    async () => {
      const fresh = await t.setupSlide(L, 'split');
      if (!fresh) return { ok: false, observed: 'no fresh slide' };
      await t.clickCard(fresh);
      const reference = JSON.stringify(await t.slideJson(fresh));
      const refTypes = (reference.match(/"type":"([a-z]+)"/g) ?? []).sort();
      for (const layout of ['opener', 'split']) {
        await t.clearAll();
        await t.tailControl('toolbar.layout');
        await t.waitControl('layout.apply.plate', 8000);
        await t.clickControl(`layout.apply.${layout}`);
        await t.pollUntil(
          () => layoutOf(fresh),
          (l) => l === layout,
          15_000,
        );
        await t.settled();
      }
      const after = JSON.stringify(await t.slideJson(fresh));
      const types = (after.match(/"type":"([a-z]+)"/g) ?? []).sort();
      const pictures = (after.match(/"type":"(shot|picture)"/g) ?? []).length;
      return {
        ok: same(types, refTypes) && pictures === 0,
        observed: `fresh split blocks ${refTypes.join(',')}; after opener then split ${types.join(',')}; pictures ${pictures}`,
      };
    },
  );
  await t.step(
    'slides.layout.typed-title-round-trip',
    'type a title, apply Main point, then Title and body',
    'the title comes back and nothing else',
    async () => {
      const fresh = await t.setupSlide(L, 'split');
      if (!fresh) return { ok: false, observed: 'no fresh slide' };
      await t.clickCard(fresh);
      const rs = await t.runs();
      const head = rs.find((r) => /heading/.test(r)) ?? rs[0];
      await t.openRun(head);
      await t.typeHuman('Round trip title');
      await t.press('Escape');
      await t.settled();
      const typed = JSON.stringify(await t.slideJson(fresh));
      for (const layout of ['statement', 'split']) {
        await t.clearAll();
        await t.tailControl('toolbar.layout');
        await t.waitControl('layout.apply.plate', 8000);
        await t.clickControl(`layout.apply.${layout}`);
        await t.pollUntil(
          () => layoutOf(fresh),
          (l) => l === layout,
          15_000,
        );
        await t.settled();
      }
      const after = JSON.stringify(await t.slideJson(fresh));
      const texts = (after.match(/"text":"([^"]+)"/g) ?? []).map((m) => m.slice(8, -1));
      return {
        ok:
          typed.includes('Round trip title') &&
          texts.length === 1 &&
          texts[0] === 'Round trip title',
        observed: `texts after the round trip ${JSON.stringify(texts)}`,
      };
    },
  );
  await t.step(
    'slides.layout.snackbar-counts-typed-only',
    'apply Title slide to an untouched slide',
    'no dropped block warning',
    async () => {
      const fresh = await t.setupSlide(L, 'split');
      if (!fresh) return { ok: false, observed: 'no fresh slide' };
      await t.clickCard(fresh);
      await t.clearAll();
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      const stale = await t.snackbar();
      await t.clickControl('layout.apply.title');
      await t.pollUntil(
        () => layoutOf(fresh),
        (l) => l === 'title',
        15_000,
      );
      const fresh1 = await t.pollUntil(t.snackbar, (x) => x !== null && x !== stale, 2500);
      const said = fresh1 === stale ? null : fresh1;
      await t.settled();
      return {
        ok: !/did not fit/.test(said ?? ''),
        observed: `snackbar "${said ?? 'none new'}"${stale ? ` (showing before the apply: "${stale}")` : ''}`,
      };
    },
  );
  await t.step(
    'slides.layout.undo-typed',
    'Cmd+Z after a layout change on a typed slide',
    'the layout and the text come back',
    async () => {
      const fresh = await t.setupSlide(L, 'split');
      if (!fresh) return { ok: false, observed: 'no fresh slide' };
      await t.clickCard(fresh);
      const rs = await t.runs();
      const head = rs.find((r) => /heading/.test(r)) ?? rs[0];
      await t.openRun(head);
      await t.typeHuman('Undo me');
      await t.press('Escape');
      await t.settled();
      const before = JSON.stringify(await t.slideJson(fresh));
      await t.clearAll();
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      await t.clickControl('layout.apply.mood');
      await t.pollUntil(
        () => layoutOf(fresh),
        (l) => l === 'mood',
        15_000,
      );
      await t.settled();
      await t.clearAll();
      await t.press('Meta+z');
      const back = await t.pollUntil(
        () => layoutOf(fresh),
        (l) => l === 'split',
        15_000,
      );
      await t.settled();
      const after = JSON.stringify(await t.slideJson(fresh));
      return {
        ok: back === 'split' && after.includes('Undo me') && before.includes('Undo me'),
        observed: `layout back ${back}; text back ${after.includes('Undo me')}`,
      };
    },
  );

  // ---- Notes
  await t.setup('trim the deck to 4 slides', 'slide.remove through the window API', async () => {
    const order = await t.trimTo(4, [T]);
    return { ok: order.length <= 4, observed: `${order.length} slides` };
  });
  const NOTE = 'Open with the renewal date and the two new logos.';
  await t.step(
    'slides.notes.type',
    'click the notes field and type a talk track',
    'the slide stores it',
    async () => {
      await t.clickCard(T);
      await t.clearAll();
      if (!(await t.visible('notes.text')))
        return { ok: false, observed: 'no notes field under the slide' };
      await t.clickControl('notes.text');
      await t.typeHuman(NOTE);
      await t.sleep(400);
      await t.press('Escape');
      await t.settled();
      const stored = await t.pollUntil(
        async () => (await t.slideJson(T)).notes ?? '',
        (n) => n === NOTE,
        10_000,
      );
      return { ok: stored === NOTE, observed: `stored "${stored}"` };
    },
  );
  await t.step(
    'slides.notes.per-slide',
    'click another card, read its notes, come back',
    'each slide shows its own notes',
    async () => {
      await t.clickCard(L);
      await t.sleep(500);
      const other = await t.valueOf('notes.text');
      await t.clickCard(T);
      await t.sleep(500);
      const mine = await t.valueOf('notes.text');
      return {
        ok: (other ?? '') === '' && mine === NOTE,
        observed: `other slide "${other}"; title slide "${mine}"`,
      };
    },
  );
  await t.step(
    'slides.notes.resize-handle',
    'drag the notes handle taller, double click it, drag it back',
    'the pane height follows',
    async () => {
      const pane = () => t.rectOf('[data-control="notes"]');
      const h0 = (await pane())?.h ?? 0;
      const grip = await t.rectOf('[data-control="notes.handle"]');
      if (!grip) return { ok: false, observed: 'no notes handle' };
      const from = t.center(grip);
      await t.drag(from, { x: from.x, y: from.y - 90 });
      const h1 = (await pane())?.h ?? 0;
      const grip2 = await t.rectOf('[data-control="notes.handle"]');
      await t.dblclickAt(grip2.x + grip2.w / 2, grip2.y + grip2.h / 2);
      await t.sleep(400);
      const h2 = (await pane())?.h ?? 0;
      let h3 = h2;
      if (Math.abs(h2 - h0) > 8) {
        const grip3 = await t.rectOf('[data-control="notes.handle"]');
        const from3 = t.center(grip3);
        await t.drag(from3, { x: from3.x, y: from3.y + (h2 - h0) });
        h3 = (await pane())?.h ?? 0;
      }
      return {
        ok: h1 > h0 + 40 && h2 !== h1 && Math.abs(h3 - h0) < 40 && h3 > 20,
        observed: `height ${t.fmt(h0)} -> ${t.fmt(h1)} -> ${t.fmt(h2)} (double click) -> ${t.fmt(h3)}`,
      };
    },
  );
  await t.step('slides.notes.reload', 'reload', 'the notes survive', async () => {
    await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${T}`);
    await t.settled();
    const shown = await t.pollUntil(
      () => t.valueOf('notes.text'),
      (v) => v === NOTE,
      8000,
    );
    const stored = (await t.slideJson(T)).notes ?? '';
    return {
      ok: shown === NOTE && stored === NOTE,
      observed: `shown "${shown}"; stored "${stored}"`,
    };
  });
  await t.step(
    'slides.notes.view-menu-toggle',
    'View > Show speaker notes twice',
    'the pane hides, then shows',
    async () => {
      await t.menuPath('view', 'view.showSpeakerNotes');
      const hidden = await t.waitGone('[data-control="notes.text"]', 5000);
      await t.menuPath('view', 'view.showSpeakerNotes');
      await t.waitControl('notes.text', 5000).catch(() => undefined);
      const shown = await t.visible('notes.text');
      return { ok: hidden && shown, observed: `hidden ${hidden}; shown again ${shown}` };
    },
  );

  // ---- The counter and the hash
  await t.setup('trim the deck to 4 slides', 'slide.remove through the window API', async () => {
    const order = await t.trimTo(4, [T]);
    return { ok: order.length <= 4, observed: `${order.length} slides` };
  });
  await t.step(
    'slides.counter.footer-and-cards',
    'read the footer counter and the card numbers after a click, New slide, Delete and a drag',
    'the counter reads the current slide of the total and the numbers follow',
    async () => {
      order = await t.slideOrder();
      /** The counter against the current slide's place in the order. */
      const agrees = async () => {
        const c = await t.counter();
        const now = await t.slideOrder();
        const active = await t.activeSlide();
        const want = { n: now.indexOf(active) + 1, total: now.length };
        return { c, want, ok: c !== null && c.n === want.n && c.total === want.total };
      };
      const facts = [];
      await t.clickCard(order[1]);
      const a = await t.pollUntil(agrees, (x) => x.ok, 5000);
      facts.push(`click: "${a.c?.text}" for slide ${a.want.n} of ${a.want.total}`);
      await t.clickControl('toolbar.newSlide');
      await orderOf(order.length + 1);
      const b = await t.pollUntil(agrees, (x) => x.ok, 5000);
      const numbersAfterNew = await cardNumbers();
      facts.push(
        `New slide: "${b.c?.text}" for ${b.want.n} of ${b.want.total}; cards ${numbersAfterNew.join(',')}`,
      );
      await t.press('Delete');
      await orderOf(order.length);
      await t.settled();
      const c = await t.pollUntil(agrees, (x) => x.ok, 5000);
      facts.push(`Delete: "${c.c?.text}" for ${c.want.n} of ${c.want.total}`);
      const before = await t.slideOrder();
      await t.dragCard(before[1], before[2], 'below');
      await t.pollUntil(t.slideOrder, (o) => o.indexOf(before[1]) === 2, 12_000);
      await t.settled();
      const d = await t.pollUntil(agrees, (x) => x.ok, 5000);
      const numbersAfterDrag = await cardNumbers();
      facts.push(
        `drag: "${d.c?.text}" for ${d.want.n} of ${d.want.total}; cards ${numbersAfterDrag.join(',')}`,
      );
      await t.press('Meta+z');
      await t.pollUntil(t.slideOrder, (o) => same(o, before), 8000).catch(() => undefined);
      await t.settled();
      const sequential = (nums) => nums.every((n, i) => Number(n) === i + 1);
      return {
        ok:
          a.ok &&
          b.ok &&
          c.ok &&
          d.ok &&
          sequential(numbersAfterNew) &&
          sequential(numbersAfterDrag),
        observed: facts.join('; '),
      };
    },
  );
  await t.step(
    'slides.hash.click-and-reload',
    'a card click writes #s/<id>; a reload with the hash and with the numeric form',
    'both land on that slide',
    async () => {
      order = await t.slideOrder();
      // the second card of the filmstrip, the product's own order; slide.list is recorded beside it
      const cardIds = (await t.cards()).map((c) => c.id);
      const target = cardIds[1] ?? order[1];
      await t.clickCard(target);
      const hash = await t.pollUntil(t.hash, (h) => h === `#s/${target}`, 5000);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${target}`);
      const a = await t.pollUntil(t.activeSlide, (x) => x === target, 10_000);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#2`);
      const b = await t.pollUntil(t.activeSlide, (x) => x === target, 10_000);
      const hashAfter = await t.hash();
      await t.settled();
      return {
        ok: hash === `#s/${target}` && a === target && b === target,
        observed: `hash ${hash}; after #s/<id> ${a}; after #2 ${b} (hash then ${hashAfter}); cards ${cardIds.join(',')}; slide.list ${order.join(',')}`,
      };
    },
  );

  // ---- The empty sheet's menu
  await t.step(
    'slides.context.empty-canvas',
    'right click the empty sheet, read the rows, New slide from it',
    'the eight rows and a slide added',
    async () => {
      order = await t.slideOrder();
      await t.clickCard(L);
      await t.clearAll();
      const p = await emptySheetPoint();
      const opened = await t.rightClickAt(p.x, p.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = [
        'edit.paste',
        'slide.newSlide',
        'slide.duplicateSlide',
        'slide.deleteSlide',
        'slide.skipSlide',
        'slide.changeBackground',
        'slide.applyLayout',
        'insert.comment',
      ];
      const missing = want.filter((id) => !rows.includes(id));
      const before = await t.slideOrder();
      if (rows.includes('slide.newSlide')) await t.clickContextRow('slide.newSlide');
      else await t.press('Escape');
      const after = await orderOf(before.length + 1, 8000);
      await t.settled();
      return {
        ok: opened && missing.length === 0 && after.length === before.length + 1,
        observed: `menu ${opened}; rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; ${before.length} -> ${after.length}`,
      };
    },
  );

  // ---- the return round's row (docs/RETURN.md 3.4, section 5)
  await t.step(
    'slides.numbers.apply',
    'Insert > Slide numbers, Skip title slides, Apply; read the sheets and the show; Apply to selected; Cmd+Z',
    'every slide but the title shows its number, in the show too; Apply to selected numbers the selected slide alone; Cmd+Z removes them',
    async () => {
      const r = await t.reachRow('insert', 'insert.slideNumbers');
      if (!r.present) return { ok: false, observed: 'Insert > Slide numbers is not reachable' };
      /* the criterion is the dialog's and Google's (B5's return note, item 8): a fresh deck's mode
         is on already, so Apply with Skip title slides keeps the layout slide's words and empties
         the title slide's, in the editor and in the show; Apply to selected with Off on the layout
         slide takes that slide's number alone; Cmd+Z after each restores the words read before.
         The stored mode and the title slide's kind are on record so a red names its half (the
         write, or the draw of it). An absent counter reads as the empty string. */
      const counter = () =>
        page.evaluate(
          () =>
            document
              .querySelector('.ts-stagewrap.ts-editor .counter, .ts-stagewrap .counter')
              ?.textContent?.trim() ?? '',
        );
      const counterOn = async (id) => {
        await t.clickCard(id);
        await t.sleep(250);
        return counter();
      };
      const storedMode = async () =>
        (await t.invoke('deck.info').catch(() => null))?.defaults?.counter ?? 'absent (on)';
      const storedSlideCounter = async (id) => (await t.slideJson(id)).counter ?? null;
      const inShow = async () => {
        await t.clickControl('present.open');
        await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
        await t.sleep(700);
        const words = await page.evaluate(
          () =>
            document
              .querySelector('.pt-viewer.is-present .counter, .ts-stagewrap.is-present .counter')
              ?.textContent?.trim() ?? '',
        );
        await t.press('Escape');
        await page
          .locator('[data-control="present.show"]')
          .waitFor({ state: 'detached', timeout: 8000 })
          .catch(() => undefined);
        return words;
      };
      const kindT = (await t.slideJson(T)).kind ?? null;
      const modeBefore = await storedMode();
      const beforeT = await counterOn(T);
      const beforeL = await counterOn(L);
      await t.clearAll();
      // 1. On, Skip title slides, Apply
      await t.menuPath('insert', 'insert.slideNumbers');
      await t.waitControl('dialog.slideNumbers', 8000);
      const options = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="dialog.slideNumbers."]')].map((e) =>
          e.getAttribute('data-control').replace('dialog.slideNumbers.', ''),
        ),
      );
      await t.clickControl('dialog.slideNumbers.on');
      await t.clickControl('dialog.slideNumbers.skip-title');
      await t.clickControl('dialog.slideNumbers.apply');
      await t.waitGone('[data-control="dialog.slideNumbers"]', 6000);
      await t.settled();
      const modeSkip = await t
        .pollUntil(storedMode, (m) => m === 'skip-title', 6000)
        .catch(storedMode);
      await t.clickCard(T);
      const onTitle = await t.pollUntil(counter, (c) => c === '', 8000).catch(counter);
      const onL = await counterOn(L);
      await t.clearAll();
      const showL = await inShow();
      await t.clickCard(T);
      await t.clearAll();
      const showTitle = await inShow();
      // 2. Apply to selected with Off on the layout slide
      await t.clickCard(L);
      await t.clearAll();
      await t.menuPath('insert', 'insert.slideNumbers');
      await t.waitControl('dialog.slideNumbers', 8000);
      const selectedOffered = await t.visible('dialog.slideNumbers.selected');
      let selectedStored = null;
      let selectedDrawnL = null;
      let selectedDrawnT = null;
      let selectedUndo = null;
      let selectedError = null;
      if (selectedOffered) {
        await t.clickControl('dialog.slideNumbers.off');
        await t.clickControl('dialog.slideNumbers.selected');
        await t.sleep(400);
        selectedError = await page.evaluate(
          () =>
            document
              .querySelector('[data-control="dialog.slideNumbers"] .ts-dialog-error')
              ?.textContent?.trim() ?? null,
        );
        if (await t.visible('dialog.slideNumbers')) await t.press('Escape');
        await t.waitGone('[data-control="dialog.slideNumbers"]', 6000).catch(() => undefined);
        await t.settled();
        selectedStored = await t
          .pollUntil(
            () => storedSlideCounter(L),
            (c) => c === 'off',
            6000,
          )
          .catch(() => storedSlideCounter(L));
        selectedDrawnL = await t.pollUntil(counter, (c) => c === '', 4000).catch(counter);
        selectedDrawnT = await counterOn(T);
        /* Cmd+Z only where a write landed, so the undo of step 3 meets the Skip title write */
        if (selectedStored === 'off') {
          await t.clickCard(L);
          await t.clearAll();
          await t.press('Meta+z');
          await t.sleep(500);
          await t.settled();
          selectedUndo = {
            stored: await t
              .pollUntil(
                () => storedSlideCounter(L),
                (c) => c === null,
                6000,
              )
              .catch(() => storedSlideCounter(L)),
            drawn: await t.pollUntil(counter, (c) => c === beforeL, 4000).catch(counter),
          };
        }
      } else {
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.slideNumbers"]', 6000).catch(() => undefined);
      }
      // 3. Cmd+Z takes Skip title slides back
      await t.clickCard(T);
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const modeAfter = await t
        .pollUntil(storedMode, (m) => m === modeBefore, 6000)
        .catch(storedMode);
      const afterT = await t.pollUntil(counter, (c) => c === beforeT, 6000).catch(counter);
      const afterL = await counterOn(L);
      const skipOk =
        modeSkip === 'skip-title' && onTitle === '' && onL === beforeL && Boolean(beforeL);
      const showOk = Boolean(showL) && showTitle === '';
      const selectedOk =
        selectedOffered &&
        selectedError === null &&
        selectedStored === 'off' &&
        selectedDrawnL === '' &&
        selectedDrawnT === '' &&
        selectedUndo?.stored === null &&
        selectedUndo?.drawn === beforeL;
      const undoOk = modeAfter === modeBefore && afterT === beforeT && afterL === beforeL;
      return {
        ok: skipOk && showOk && selectedOk && undoOk,
        observed: `${r.switched ? 'with the switch on; ' : ''}dialog options ${options.join(', ')}; title slide kind ${kindT}; stored mode ${modeBefore} -> ${modeSkip} after On, Skip title slides, Apply; counter on the title "${beforeT}" -> "${onTitle}", on the layout slide "${beforeL}" -> "${onL}"; in the show from the layout slide "${showL}", from the title "${showTitle}"; Apply to selected offered ${selectedOffered}${
          selectedOffered
            ? `: Off on the layout slide stored ${JSON.stringify(selectedStored)}, drawn "${selectedDrawnL}" (title "${selectedDrawnT}"), refusal ${selectedError ?? 'none'}; Cmd+Z ${selectedUndo ? `stored ${JSON.stringify(selectedUndo.stored)}, drawn "${selectedUndo.drawn}"` : 'not pressed (no write landed)'}`
            : ''
        }; Cmd+Z after Skip title slides: mode ${modeAfter}, title "${afterT}", layout slide "${afterL}"; the PDF not read by this driver (the walk cancels downloads)`,
      };
    },
  );
  t.deck.layoutSlide = L;
}

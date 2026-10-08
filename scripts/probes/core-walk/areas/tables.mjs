// Tables (docs/archive/rounds/RETURN.md 2.4, section 5 `tables.*` with the driver `probe --core`): the grid
// picker, the cell sessions and Tab, the Format > Table rows with a session and with the table
// selected by one click, the cell right click menu, the column widths after an insert, the seam
// handle, the cell alignment from the menu and the tail, the table's selection and resize, the
// tail's fill and border, the merge and the distribute rows, the light appearance, the show and
// the reload. The two export rows are core/export.spec.ts. Insert > Table is reached in the
// default view, or with Tools > Advanced tools on while the row is still parked (toolkit
// `reachSetup`), and the switch goes back at the end.

export const NAME = 'tables';
export const IDS = [
  'tables.insert.grid',
  'tables.cell.double-click-type',
  'tables.cell.tab-from-written',
  'tables.cell.tab-from-empty',
  'tables.cell.shift-tab',
  'tables.cell.tab-last-appends-row',
  'tables.menu.format-table-with-session',
  'tables.menu.format-table-selected',
  'tables.menu.format-table-rows',
  'tables.context.rows',
  'tables.context.insert-delete',
  'tables.column.insert-keeps-widths',
  'tables.column.resize-seam',
  'tables.cell.align-menu',
  'tables.cell.align-toolbar',
  'tables.select.resize',
  'tables.cell.fill-border-tail',
  'tables.cells.merge-unmerge',
  'tables.tail.merge-unmerge-buttons',
  'tables.distribute.rows-columns',
  'tables.light-appearance',
  'tables.present',
  'tables.reload',
  /* the features round, ship one (docs/archive/rounds/FEATURES.md 2.2, 2.3, 3.1 item 4): the table click model,
     the ranges, the appends, the arrows, the marks on a range, the Table section first, the P1
     handles, bar and prompts, and the tabular figures; driven by `featuresRound` below */
  'tables.cell.click-places-caret',
  'tables.cell.click-then-type',
  'tables.range.drag-from-selected',
  'tables.selected.typing-appends',
  'tables.cell.arrows-cross-cells',
  'tables.range.shift-arrows',
  'tables.range.bold-italic',
  'tables.range.size-color',
  'tables.panel.table-first',
  'tables.seam.row-drag',
  'tables.edge.add-row-column',
  'tables.heads.select-row-column',
  'tables.bar.row-column-buttons',
  'tables.command.keeps-caret',
  'tables.cells.tabular-figures',
  /* the objects round (docs/archive/rounds/OBJECTS.md section 3, 6.1): the table's ring with a cell open, the
     cell ring, the editor guide grid, the box from the rows, the rows that grow, the seams with a
     cell open, the header toggle from the row head and the Table section's words; driven by
     `objectsRound` below. `tables.show.rules-only` is core/export.spec.ts's */
  'tables.select.ring-with-cell-open',
  'tables.cell.ring-on-cell',
  'tables.cells.empty-grid-guides',
  'tables.light-appearance-guides',
  'tables.insert.box-fits-rows',
  'tables.rows.grow-with-text',
  'tables.resize.rows-share-extra',
  'tables.seam.visible-with-cell-open',
  'tables.heads.header-toggle',
  'tables.panel.section-words',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The selected table's own controls (the heads and the edge "+", docs/archive/rounds/OBJECTS.md 3.3 item 4) are
 * parked families on a ship (parked-controls.ts, read by the family for every table since the
 * objects round's merge), hidden while Tools > Advanced tools is off: when the selected table
 * draws no head the switch goes on, as the walk drives every parked row with it (docs/FOCUS.md
 * 3.1), the table is selected again and the area's end turns the switch off (`advancedBack`).
 * The integrator's gates read the three rows "not on this build" with the switch off after the
 * lines area had turned it back.
 */
async function tableControlsOn(t, page, id, reselect) {
  const drawn = () =>
    page.evaluate(
      (id) => document.querySelector(`.ts-overlay [data-control^="handle.${id}.head."]`) !== null,
      id,
    );
  if (await drawn()) return true;
  const on = await t.setAdvanced(true);
  if (on) t.deck.advanced = true;
  await t.sleep(300);
  await reselect();
  await t.sleep(300);
  return drawn();
}

export async function run(t) {
  const { page, BASE } = t;
  const S = await t
    .setup('a slide for the tables', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.lineSlide ?? t.deck.titleSlide, 'blank');
      t.deck.tableSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.tableSlide);
  await t.clickCard(S);
  await t.clearAll();
  await t.reachSetup('Insert > Table', 'insert', 'insert.table');

  /** The stored table block. */
  const block = async (id) => (await t.blockOf(S, id))?.block ?? null;
  const posOf = async (id) => (await t.blockOf(S, id))?.pos ?? null;
  const counts = async (id) => {
    const b = await block(id);
    return b ? { columns: b.columns.length, rows: b.rows.length } : null;
  };
  const cellText = async (id, r, c) => (await block(id))?.rows?.[r]?.cells?.[c] ?? null;
  const cellRun = (id, r, c) => `${id}/rows/${r}/cells/${c}`;
  /** The active session's cell, read from the contenteditable's data-run. */
  const sessionCell = () =>
    page.evaluate(() => {
      const el = document.activeElement?.closest?.('[data-run]');
      const run = el?.getAttribute('data-run') ?? null;
      const m = run ? /\/rows\/(\d+)\/cells\/(\d+)$/.exec(run) : null;
      return m ? { row: Number(m[1]), column: Number(m[2]), run } : null;
    });
  /** The drawn cell boxes of a table by row, with the table's own box. */
  const cellBoxes = (id) =>
    page.evaluate((blockId) => {
      const root = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      if (!root) return null;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      return {
        table: box(root),
        rows: [...root.querySelectorAll('.tr')].map((tr) =>
          [...tr.querySelectorAll('.td')].map(box),
        ),
      };
    }, id);
  /** The computed text align and colours of a cell. */
  const cellStyle = (id, r, c) =>
    page.evaluate(
      ([blockId, run]) => {
        const el = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] [data-run="${run}"]`,
        );
        if (!el) return null;
        const cs = getComputedStyle(el);
        const para = el.querySelector('.para') ?? el;
        /* the hairline the cell shows: its own border, else its row's, else the table's, the
           first side with a width above 0 (the default table draws its rules on the rows) */
        const sides = ['Top', 'Bottom', 'Left', 'Right'];
        const painted = (node) => {
          if (!node) return null;
          const c = getComputedStyle(node);
          for (const side of sides)
            if (parseFloat(c[`border${side}Width`]) > 0)
              return {
                color: c[`border${side}Color`],
                width: c[`border${side}Width`],
                style: c[`border${side}Style`],
                owner: node.className.split(' ')[0],
              };
          return null;
        };
        const hair = painted(el) ??
          painted(el.closest('.tr')) ??
          painted(el.closest('.table')) ?? {
            color: cs.borderTopColor,
            width: cs.borderTopWidth,
            style: cs.borderTopStyle,
            owner: 'none',
          };
        return {
          textAlign: cs.textAlign,
          color: getComputedStyle(para).color,
          background: cs.backgroundColor,
          borderColor: hair.color,
          borderWidth: hair.width,
          borderStyle: hair.style,
          borderOwner: hair.owner,
        };
      },
      [id, cellRun(id, r, c)],
    );
  const undo = async () => {
    /* Cmd+Z inside an open cell session is the field's own undo: the session ends first */
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(250);
    }
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  const TYPED = 'Q1 revenue';
  /** The cell that holds the typed text, wherever the inserts moved it; null when it is gone. */
  const textCell = async (id) => {
    const b = await block(id);
    for (const [r, row] of (b?.rows ?? []).entries())
      for (const [c, cell] of (row.cells ?? []).entries())
        if (typeof cell === 'string' && cell.includes(TYPED)) return { row: r, column: c };
    return null;
  };
  const textKept = async (id) => (await textCell(id)) !== null;
  /** A cell off the typed text's row (for Delete row) or column (for Delete column). */
  const cellOff = async (id, what) => {
    const at = (await textCell(id)) ?? { row: 1, column: 1 };
    const c = await counts(id);
    if (what === 'row') return [at.row === 0 ? Math.min(1, c.rows - 1) : 0, at.column];
    return [at.row, at.column === 0 ? Math.min(1, c.columns - 1) : 0];
  };
  /** Ends an open cell session so the sheet draws the store again (Editor.tsx freezes it). */
  const endSession = async () => {
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(250);
    }
    await t.settled();
  };
  /** Opens a cell's session by a double click (A1 rule 3); answers whether it is open. */
  const openCell = async (id, r, c) => {
    await t.clearAll();
    return t.openRun(cellRun(id, r, c));
  };
  /** Types into the open cell and closes with Escape; waits for the store to hold the text. */
  const typeClose = async (id, r, c, text) => {
    await t.typeHuman(text);
    await t.sleep(200);
    await t.press('Escape');
    await t.settled();
    return t
      .pollUntil(
        () => cellText(id, r, c),
        (x) => typeof x === 'string' && x.includes(text),
        8000,
      )
      .catch(() => cellText(id, r, c));
  };
  /** The rows of the open menubar Format > Table submenu, with their enabled state. */
  const formatTableRows = async () => {
    await t.surfaceClear();
    await t.openMenu('format');
    await t.hoverRow('format.table', '[data-control="menu.format.table.insertRowBelow"]');
    const rows = (await t.menuRows('format')).filter((r) => r.id.startsWith('format.table.'));
    return rows;
  };

  let T = null;
  await t.step(
    'tables.insert.grid',
    'Insert > Table, point at 4 by 3, click',
    'the size words read 4 x 3; a 960 wide table with a header row lands, its box the height of its three rows (163 at 20 px)',
    async () => {
      const before = await t.objectIds(S);
      await t.openMenu('insert');
      await t.hoverRow('insert.table', '[data-control="insert.table.plate"]');
      const plate = await t.rectOf('[data-control="insert.table.plate"]');
      const cell = await t.rectOf('[data-control="insert.table.pick.4x3"]');
      if (!cell) throw new Error('no 4x3 cell in the grid picker');
      await t.moveHuman({ x: plate.x + 4, y: plate.y + 4 }, t.center(cell), 8);
      await t.sleep(250);
      const words = await t.textOf('insert.table.plate');
      await t.clickAt(cell.x + cell.w / 2, cell.y + cell.h / 2);
      const obj = await t.newObjectAfter(S, before);
      await t.settled();
      T = obj?.id ?? null;
      const b = T ? await block(T) : null;
      return {
        ok:
          Boolean(obj) &&
          obj.type === 'table' &&
          /4\s*x\s*3/.test(words ?? '') &&
          t.near(obj.pos.w, 960, 2) &&
          /* the objects round (docs/archive/rounds/OBJECTS.md 3.3 item 3): the box fits its rows, 54 per row at 20 px
             with the rule under each and the hairline above (schema tableBoxHeight: 163 for three) */
          t.near(obj.pos.h, 163, 2) &&
          b?.columns?.length === 4 &&
          b?.rows?.length === 3 &&
          b?.rows?.[0]?.header === true,
        observed: obj
          ? `size words "${words}"; ${obj.type} ${obj.id} ${t.posStr(obj.pos)}; columns ${b?.columns?.length}, rows ${b?.rows?.length}, header ${b?.rows?.[0]?.header}`
          : `size words "${words}"; nothing inserted within 20 s`,
      };
    },
  );
  if (!T) throw new (await import('../toolkit.mjs')).SetupFailed('a table to drive');
  t.deck.table = T;

  await t.step(
    'tables.cell.double-click-type',
    'double click cell 1,1, type Q1 revenue, Escape',
    'the cell holds the text; chip Table',
    async () => {
      const on = await openCell(T, 1, 1);
      const held = await typeClose(T, 1, 1, 'Q1 revenue');
      await t.sleep(300);
      const chip = await t.chip();
      return {
        ok: on && held === 'Q1 revenue' && chip === 'Table',
        observed: `session ${on}; cell 1,1 "${held}"; chip "${chip}"`,
      };
    },
  );

  await t.step(
    'tables.cell.tab-from-written',
    'double click cell 2,0, type North, Tab, type South, Escape',
    'the session moves to cell 2,1 with its text selected and the typing lands there',
    async () => {
      const on = await openCell(T, 2, 0);
      await t.typeHuman('North');
      await t.sleep(200);
      await t.press('Tab');
      await t.sleep(600);
      const stillEditing = await t.editing();
      const where = await sessionCell();
      const selection = await t.selectionText();
      await t.typeHuman('South');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const a = await t
        .pollUntil(
          () => cellText(T, 2, 0),
          (x) => x === 'North',
          8000,
        )
        .catch(() => cellText(T, 2, 0));
      const b = await cellText(T, 2, 1);
      const first = await cellText(T, 0, 0);
      return {
        ok:
          on &&
          stillEditing &&
          where?.row === 2 &&
          where?.column === 1 &&
          a === 'North' &&
          b === 'South' &&
          first === '',
        observed: `session ${on}; after Tab editing ${stillEditing} in ${where ? `${where.row},${where.column}` : 'no cell'} (selection "${selection}"); cells 2,0 "${a}" 2,1 "${b}"; cell 0,0 "${first}"`,
      };
    },
  );

  await t.step(
    'tables.cell.tab-from-empty',
    'double click the empty cell 1,2, Tab at once, type East, Escape',
    'the text lands in cell 1,3',
    async () => {
      const on = await openCell(T, 1, 2);
      await t.press('Tab');
      await t.sleep(500);
      const where = await sessionCell();
      await t.typeHuman('East');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const landed = await t
        .pollUntil(
          () => cellText(T, 1, 3),
          (x) => x === 'East',
          8000,
        )
        .catch(() => cellText(T, 1, 3));
      return {
        ok: on && where?.row === 1 && where?.column === 3 && landed === 'East',
        observed: `session ${on}; after Tab ${where ? `${where.row},${where.column}` : 'no cell'}; cell 1,3 "${landed}"; cell 1,2 "${await cellText(T, 1, 2)}"`,
      };
    },
  );

  await t.step(
    'tables.cell.shift-tab',
    'double click cell 1,3, Shift+Tab, type West, Escape',
    'the session moves to cell 1,2 and the text lands there',
    async () => {
      const on = await openCell(T, 1, 3);
      await t.press('Shift+Tab');
      await t.sleep(500);
      const where = await sessionCell();
      await t.typeHuman('West');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const landed = await t
        .pollUntil(
          () => cellText(T, 1, 2),
          (x) => x === 'West',
          8000,
        )
        .catch(() => cellText(T, 1, 2));
      const kept = await cellText(T, 1, 3);
      return {
        ok: on && where?.row === 1 && where?.column === 2 && landed === 'West' && kept === 'East',
        observed: `session ${on}; after Shift+Tab ${where ? `${where.row},${where.column}` : 'no cell'}; cell 1,2 "${landed}"; cell 1,3 "${kept}"`,
      };
    },
  );

  await t.step(
    'tables.cell.tab-last-appends-row',
    'double click the last cell, Tab; then Undo on the notice',
    'a row is appended with the notice Row added; Undo takes it back',
    async () => {
      const c0 = await counts(T);
      const on = await openCell(T, c0.rows - 1, c0.columns - 1);
      await t.press('Tab');
      const c1 = await t
        .pollUntil(
          () => counts(T),
          (c) => c && c.rows === c0.rows + 1,
          8000,
        )
        .catch(() => counts(T));
      const notice = await t.snackbarWithin(4000).catch(() => null);
      await t.press('Escape');
      await t.sleep(200);
      let how = 'Cmd+Z';
      if (await t.visible('snackbar.action')) {
        await t.clickControl('snackbar.action');
        how = "the notice's Undo";
      } else await t.press('Meta+z');
      const c2 = await t
        .pollUntil(
          () => counts(T),
          (c) => c && c.rows === c0.rows,
          8000,
        )
        .catch(() => counts(T));
      await t.settled();
      return {
        ok:
          on && c1?.rows === c0.rows + 1 && /Row added/.test(notice ?? '') && c2?.rows === c0.rows,
        observed: `session ${on}; rows ${c0.rows} -> ${c1?.rows} (notice "${notice ?? 'none'}") -> ${c2?.rows} by ${how}`,
      };
    },
  );

  await t.step(
    'tables.menu.format-table-with-session',
    'with a cell session open, Format > Table > Insert row below',
    'the Format > Table rows are enabled and a row is added',
    async () => {
      const c0 = await counts(T);
      const on = await openCell(T, 1, 1);
      const rows = await formatTableRows();
      const enabled = rows.filter((r) => !r.disabled).map((r) => r.id.replace('format.table.', ''));
      const disabled = rows.filter((r) => r.disabled).map((r) => r.id.replace('format.table.', ''));
      if (rows.some((r) => r.id === 'format.table.insertRowBelow' && !r.disabled))
        await t.clickRow('format.table.insertRowBelow');
      else await t.closeMenus();
      const c1 = await t
        .pollUntil(
          () => counts(T),
          (c) => c && c.rows === c0.rows + 1,
          8000,
        )
        .catch(() => counts(T));
      await t.settled();
      const kept = await cellText(T, 1, 1);
      if (c1?.rows === c0.rows + 1) await undo();
      return {
        ok:
          on &&
          !disabled.includes('insertRowBelow') &&
          c1?.rows === c0.rows + 1 &&
          kept === 'Q1 revenue',
        observed: `session ${on}; enabled ${enabled.join(', ') || 'none'}; disabled ${disabled.join(', ') || 'none'}; rows ${c0.rows} -> ${c1?.rows}; cell 1,1 "${kept}"`,
      };
    },
  );

  await t.step(
    'tables.menu.format-table-selected',
    'one click on the table, Format > Table > Insert column right',
    'the rows are enabled with the table selected and a column is added',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(T);
      const selected = Boolean(ctrls) && !(await t.editing());
      const c0 = await counts(T);
      const rows = await formatTableRows();
      const disabled = rows.filter((r) => r.disabled).map((r) => r.id.replace('format.table.', ''));
      if (rows.some((r) => r.id === 'format.table.insertColumnRight' && !r.disabled))
        await t.clickRow('format.table.insertColumnRight');
      else await t.closeMenus();
      const c1 = await t
        .pollUntil(
          () => counts(T),
          (c) => c && c.columns === c0.columns + 1,
          8000,
        )
        .catch(() => counts(T));
      await t.settled();
      if (c1?.columns === c0.columns + 1) await undo();
      return {
        ok: selected && !disabled.includes('insertColumnRight') && c1?.columns === c0.columns + 1,
        observed: `table selected by one click ${selected} (chip "${await t.chip()}"); disabled ${disabled.join(', ') || 'none'}; columns ${c0.columns} -> ${c1?.columns}`,
      };
    },
  );

  await t.step(
    'tables.menu.format-table-rows',
    'with a cell session open: Insert row above, Insert column left, Delete row, Delete column, Distribute rows, Distribute columns, Delete table, each undone',
    'each changes the counts or the sizes and the typed text stays; Cmd+Z after each',
    async () => {
      const facts = [];
      let ok = true;
      const menuRow = async (rowId, want) => {
        const c0 = await counts(T);
        /* the session in a cell off the typed text's row or column for the deletes, in its cell
           for the inserts; the text is looked up where the inserts moved it */
        const at =
          rowId === 'deleteRow'
            ? await cellOff(T, 'row')
            : rowId === 'deleteColumn'
              ? await cellOff(T, 'column')
              : (({ row, column }) => [row, column])((await textCell(T)) ?? { row: 1, column: 1 });
        const on = await openCell(T, at[0], at[1]);
        await t.menuPath('format', 'format.table', `format.table.${rowId}`);
        const c1 = await t
          .pollUntil(
            () => counts(T),
            (c) => c && want(c0, c),
            8000,
          )
          .catch(() => counts(T));
        await t.settled();
        const kept = await textKept(T);
        const good = on && Boolean(c1) && want(c0, c1) && kept;
        ok = ok && good;
        facts.push(
          `${rowId} (session in ${at[0]},${at[1]}): session ${on}, ${c0.columns}x${c0.rows} -> ${c1?.columns}x${c1?.rows}, text kept ${kept}`,
        );
        if (c1 && want(c0, c1)) await undo();
        let back = await counts(T);
        if (!same(back, c0)) {
          ok = false;
          /* a second press, on record: with the session moved to the new cell, the first Cmd+Z
             after Escape left the counts on the first follow-up run */
          await undo();
          const second = await counts(T);
          facts.push(
            `undo left ${back?.columns}x${back?.rows} (a second Cmd+Z: ${second?.columns}x${second?.rows})`,
          );
          back = second;
        }
      };
      await menuRow('insertRowAbove', (a, b) => b.rows === a.rows + 1);
      await menuRow('insertColumnLeft', (a, b) => b.columns === a.columns + 1);
      await menuRow('deleteRow', (a, b) => b.rows === a.rows - 1);
      await menuRow('deleteColumn', (a, b) => b.columns === a.columns - 1);
      /* the distribute rows: a column width and a row height set through the window API first
         (a setup write), so there is something to equalise */
      const b0 = await block(T);
      await t.setBlock(S, T, '/columns/0/width', 400);
      await t.setBlock(S, T, '/rows/1/height', 150);
      const widths = (boxes) => boxes.rows[0].map((c) => Math.round(c.w));
      const heights = (boxes) => boxes.rows.map((r) => Math.round(r[0]?.h ?? 0));
      const spread = (list) => Math.max(...list) - Math.min(...list);
      await endSession();
      const uneven = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(widths(x)) > 20,
          6000,
        )
        .catch(() => cellBoxes(T));
      const on1 = await openCell(T, 1, 1);
      await t.menuPath('format', 'format.table', 'format.table.distributeColumns');
      await endSession();
      const afterColumns = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(widths(x)) <= 3,
          6000,
        )
        .catch(() => cellBoxes(T));
      const on2 = await openCell(T, 1, 1);
      await t.menuPath('format', 'format.table', 'format.table.distributeRows');
      await endSession();
      const afterRows = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(heights(x)) <= 3,
          6000,
        )
        .catch(() => cellBoxes(T));
      const even = spread(widths(afterColumns)) <= 3 && spread(heights(afterRows)) <= 3;
      facts.push(
        `distribute: widths ${widths(uneven).join(',')} -> ${widths(afterColumns).join(',')}; heights ${heights(uneven).join(',')} -> ${heights(afterRows).join(',')}; even ${even} (sessions ${on1} ${on2})`,
      );
      ok = ok && even;
      /* three undos: the two distributes and the row height; then the width */
      for (let i = 0; i < 4; i += 1) await undo();
      let restored = same(await block(T), b0);
      facts.push(`block restored after the undos ${restored}`);
      if (!restored) {
        /* the setup writes go back through the window API, so the rows after this one read the
           product's table and not this row's leftover width (the first run of this driver left a
           400 px column under tables.column.insert-keeps-widths) */
        await t.setBlock(S, T, '/columns', b0.columns);
        await t.setBlock(S, T, '/rows', b0.rows);
        restored = same(await block(T), b0);
        facts.push(`put back through the window API ${restored}`);
      }
      /* Delete table, then Cmd+Z */
      const on3 = await openCell(T, 1, 1);
      await t.menuPath('format', 'format.table', 'format.table.deleteTable');
      const gone = await t
        .pollUntil(
          async () => !(await t.objectIds(S)).includes(T),
          (x) => x,
          8000,
        )
        .catch(() => false);
      await t.settled();
      await undo();
      const back = await t
        .pollUntil(
          async () => (await t.objectIds(S)).includes(T),
          (x) => x,
          8000,
        )
        .catch(() => false);
      facts.push(`Delete table: session ${on3}, removed ${gone}, back after Cmd+Z ${back}`);
      ok = ok && on3 && gone && back;
      return { ok, observed: facts.join('; ') };
    },
  );

  await t.step(
    'tables.context.rows',
    'right click cell 1,1 with its session open',
    'the 17 rows of the default view are listed, the two merge rows and the Header row check among them',
    async () => {
      /* the two merge rows follow their own matrix row tables.cells.merge-unmerge, which carries
         `parks` (docs/archive/rounds/RETURN.md section 1 rule 2): the integration re-parked them while no cell
         range existed (build/integrator.md section 2 item 7) and the fix round returned them with
         the Editor's cell range (build/b5.md "Return round fix round"), so the default view's cell
         menu has 16 rows, 17 with the objects round's Header row check (docs/archive/rounds/OBJECTS.md 3.3 item 4);
         the switch is read for the record alone */
      const advanced = await t.advancedOn();
      const on = await openCell(T, 1, 1);
      const info = await t.runInfo(cellRun(T, 1, 1));
      const opened = await t.rightClickAt(
        info.rect.x + info.rect.w / 2,
        info.rect.y + info.rect.h / 2,
      );
      const rows = (await t.contextRows()).map((r) => `${r.id}${r.disabled ? ' (disabled)' : ''}`);
      await t.press('Escape');
      await t.sleep(200);
      const want = [
        'format.table.insertRowAbove',
        'format.table.insertRowBelow',
        'format.table.insertColumnLeft',
        'format.table.insertColumnRight',
        'format.table.deleteRow',
        'format.table.deleteColumn',
        'format.table.deleteTable',
        'format.table.headerRow',
        'format.table.distributeRows',
        'format.table.distributeColumns',
        'format.table.mergeCells',
        'format.table.unmergeCells',
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'insert.link',
        'format.formatOptions',
      ];
      const ids = rows.map((r) => r.split(' ')[0]);
      const missing = want.filter((id) => !ids.includes(id));
      return {
        ok: on && opened && rows.length === want.length && missing.length === 0,
        observed: `advanced ${advanced}; session ${on}; menu ${opened}; ${rows.length} rows (${want.length} wanted): ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}`,
      };
    },
  );

  /** Right clicks the open cell and picks a Format > Table row from the menu. */
  const contextTableRow = async (rowId, cell = [1, 1]) => {
    const info = await t.runInfo(cellRun(T, cell[0], cell[1]));
    await t.rightClickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    const rows = await t.contextRows();
    const row = rows.find((r) => r.id === `format.table.${rowId}`);
    if (!row || row.disabled) {
      await t.press('Escape');
      return false;
    }
    await t.clickContextRow(`format.table.${rowId}`);
    return true;
  };
  await t.step(
    'tables.context.insert-delete',
    'from the cell menu: Insert row below, Insert column right, Delete row, Delete column',
    'each changes the counts and the typed text stays',
    async () => {
      const facts = [];
      let ok = true;
      if (!(await textKept(T))) {
        /* an earlier row lost the typed text: put back through the window API (a setup write) */
        await t.setBlock(S, T, '/rows/1/cells/1', TYPED);
        facts.push('the typed text put back in cell 1,1 through the window API (a setup write)');
      }
      const step = async (rowId, want, cellOfRow) => {
        const c0 = await counts(T);
        const cell = await cellOfRow();
        const on = await openCell(T, cell[0], cell[1]);
        const picked = await contextTableRow(rowId, cell);
        const c1 = await t
          .pollUntil(
            () => counts(T),
            (c) => c && want(c0, c),
            8000,
          )
          .catch(() => counts(T));
        await t.settled();
        const kept = await textKept(T);
        const good = on && picked && Boolean(c1) && want(c0, c1) && kept;
        ok = ok && good;
        facts.push(
          `${rowId} (cell ${cell[0]},${cell[1]}): picked ${picked}, ${c0.columns}x${c0.rows} -> ${c1?.columns}x${c1?.rows}, text kept ${kept}`,
        );
      };
      const textAt = async () =>
        (({ row, column }) => [row, column])((await textCell(T)) ?? { row: 1, column: 1 });
      await step('insertRowBelow', (a, b) => b.rows === a.rows + 1, textAt);
      await step('insertColumnRight', (a, b) => b.columns === a.columns + 1, textAt);
      /* the deletes from a row and a column off the typed text, so it stays */
      await step(
        'deleteRow',
        (a, b) => b.rows === a.rows - 1,
        () => cellOff(T, 'row'),
      );
      await step(
        'deleteColumn',
        (a, b) => b.columns === a.columns - 1,
        () => cellOff(T, 'column'),
      );
      return { ok, observed: facts.join('; ') };
    },
  );

  await t.step(
    'tables.column.insert-keeps-widths',
    'Insert column right from the cell menu, read every drawn column',
    'every column is drawn at an equal share and no cell overlaps another',
    async () => {
      const c0 = await counts(T);
      await openCell(T, 1, 1);
      const picked = await contextTableRow('insertColumnRight');
      const c1 = await t
        .pollUntil(
          () => counts(T),
          (c) => c && c.columns === c0.columns + 1,
          8000,
        )
        .catch(() => counts(T));
      await t.settled();
      await t.clearAll();
      const boxes = await cellBoxes(T);
      const share = boxes.table.w / (c1?.columns ?? 1);
      const rowsFacts = boxes.rows.map((cells) => cells.map((c) => Math.round(c.w)).join(','));
      let equal = true;
      let overlap = false;
      for (const cells of boxes.rows) {
        for (let i = 0; i < cells.length; i += 1) {
          if (Math.abs(cells[i].w - share) > 4) equal = false;
          if (i > 0 && cells[i].x < cells[i - 1].x + cells[i - 1].w - 1) overlap = true;
        }
        if (cells.length !== (c1?.columns ?? 0)) equal = false;
      }
      const stored = (await block(T))?.columns?.map((c) => c.width ?? 'auto');
      await undo();
      return {
        ok: picked && c1?.columns === c0.columns + 1 && equal && !overlap,
        observed: `columns ${c0.columns} -> ${c1?.columns} (stored widths ${JSON.stringify(stored)}); table ${Math.round(boxes.table.w)} px, an equal share ${Math.round(share)}; drawn widths by row ${rowsFacts.join(' | ')}; equal ${equal}; overlap ${overlap}`,
      };
    },
  );

  await t.step(
    'tables.column.resize-seam',
    'select the table, drag the seam between columns 1 and 2 by 80 px',
    'the left column widens by 80, the right narrows, the readout shows the width; Undo',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(T);
      const seams = (ctrls ?? []).filter((c) =>
        new RegExp(`^handle\\.${T}\\.(column|seam|col)`).test(c),
      );
      if (seams.length === 0)
        return {
          ok: null,
          observed: `no column seam handle on the selected table (handles ${(ctrls ?? []).map((c) => c.replace(`handle.${T}.`, '')).join(', ')}); the fix of RETURN.md 2.4 item 5 has not landed on this build`,
        };
      const before = await cellBoxes(T);
      const seam = seams.find((c) => /[.-](0|1)$/.test(c)) ?? seams[0];
      const h = await t.handleRect(seam);
      const from = t.center(h);
      const k = await t.kOf();
      const during = await t.drag(
        from,
        { x: from.x + 80 * k, y: from.y },
        {
          steps: 12,
          during: async () => ({ readout: await t.readout() }),
        },
      );
      await t.settled();
      const after = await cellBoxes(T);
      const w0 = before.rows[0].map((c) => c.w / k);
      const w1 = after.rows[0].map((c) => c.w / k);
      const i = Number(/(\d+)$/.exec(seam)?.[1] ?? 0);
      const widened = t.near(w1[i] - w0[i], 80, 8);
      const narrowed = t.near(w0[i + 1] - w1[i + 1], 80, 8);
      await undo();
      const back = same(
        (await cellBoxes(T)).rows[0].map((c) => Math.round(c.w)),
        before.rows[0].map((c) => Math.round(c.w)),
      );
      return {
        ok: widened && narrowed && Boolean(during?.readout) && back,
        observed: `seam ${seam}; widths ${w0.map(Math.round).join(',')} -> ${w1.map(Math.round).join(',')}; readout during "${during?.readout ?? 'none'}"; undo restored ${back}`,
      };
    },
  );

  /* the caret's cell as stored: the polish round (docs/archive/rounds/POLISH.md 2.2 item 10, b2.md R5 and R10)
     writes a session's alignment to `cells[]` ({ row, column, align }) and leaves `columns[]` as
     it was; a column head's click keeps writing `columns[]` */
  const cellAlign = (b, row, column) =>
    b?.cells?.find((c) => c.row === row && c.column === column)?.align ?? '-';
  const columnAligns = (b) => b?.columns?.map((c) => c.align ?? '-') ?? [];

  await t.step(
    'tables.cell.align-menu',
    'with a cell session open in cell 2,2, Format > Align & indent > Center',
    "the caret's cell alone reads center in `cells[]`, `columns[]` unchanged, and the cell draws centred; Cmd+Z",
    async () => {
      const before = columnAligns(await block(T));
      const on = await openCell(T, 1, 1);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.center');
      await t.settled();
      const b = await t
        .pollUntil(
          () => block(T),
          (x) => cellAlign(x, 1, 1) === 'center',
          8000,
        )
        .catch(() => block(T));
      const aligns = columnAligns(b);
      const cellsCentred = (b?.cells ?? []).filter((c) => c.align === 'center').length;
      const own = cellAlign(b, 1, 1);
      await endSession();
      const style = await t
        .pollUntil(
          () => cellStyle(T, 1, 1),
          (x) => x?.textAlign === 'center',
          6000,
        )
        .catch(() => cellStyle(T, 1, 1));
      const other = await cellStyle(T, 1, 0);
      await t.clearAll();
      await undo();
      const after = cellAlign(await block(T), 1, 1);
      return {
        ok:
          on &&
          own === 'center' &&
          cellsCentred === 1 &&
          aligns.join(',') === before.join(',') &&
          style?.textAlign === 'center' &&
          other?.textAlign !== 'center' &&
          after !== 'center',
        observed: `session ${on}; cell 2,2 stored align ${own} (${cellsCentred} cell(s) centred); column aligns ${before.join(',')} -> ${aligns.join(',')}; cell 1,1 text-align ${style?.textAlign}, cell 1,0 ${other?.textAlign}; after Cmd+Z the cell reads ${after}`,
      };
    },
  );

  /** Opens a tail list and picks the option whose id or label matches; answers what was picked. */
  const pickTailOption = async (control, test) => {
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')),
    );
    await t.tailControl(control);
    await t.sleep(400);
    const options = await page.evaluate(
      (prior) =>
        [...document.querySelectorAll('[data-control]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => ({ id: e.getAttribute('data-control'), text: e.textContent?.trim() ?? '' }))
          .filter((o) => !prior.includes(o.id)),
      before,
    );
    const pick = options.find((o) => test(o.id, o.text));
    if (pick) await t.clickControl(pick.id);
    else await t.press('Escape');
    return { pick: pick?.id ?? null, options: options.map((o) => o.id) };
  };

  await t.step(
    'tables.cell.align-toolbar',
    "with a cell session open in cell 2,2, the table tail's Align list, Right",
    "the list opens on the table tail and Right writes the caret's cell in `cells[]`, `columns[]` unchanged",
    async () => {
      const before = columnAligns(await block(T));
      const on = await openCell(T, 1, 1);
      const tail = await t.visible('toolbar.align');
      const { pick, options } = tail
        ? await pickTailOption(
            'toolbar.align',
            (id, text) => /right$/i.test(id) || /^Right$/.test(text),
          )
        : { pick: null, options: [] };
      await t.settled();
      const b = await t
        .pollUntil(
          () => block(T),
          (x) => cellAlign(x, 1, 1) === 'right',
          8000,
        )
        .catch(() => block(T));
      const aligns = columnAligns(b);
      const own = cellAlign(b, 1, 1);
      const cellsRight = (b?.cells ?? []).filter((c) => c.align === 'right').length;
      const still = await t.editing();
      await t.clearAll();
      if (own === 'right') await undo();
      return {
        ok:
          on &&
          tail &&
          pick !== null &&
          own === 'right' &&
          cellsRight === 1 &&
          aligns.join(',') === before.join(','),
        observed: `session ${on}; Align on the tail ${tail}; list options ${options.join(', ') || 'none'}; picked ${pick}; cell 2,2 stored align ${own} (${cellsRight} cell(s) right); column aligns ${before.join(',')} -> ${aligns.join(',')}; session after ${still}`,
      };
    },
  );

  await t.step(
    'tables.select.resize',
    'one click on the table, drag the se handle by 80,40, Undo',
    'chip Table and eight handles; the table grows; Undo restores',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(T);
      const dirs = await t.resizeDirs(T);
      const chip = await t.chip();
      const before = await posOf(T);
      const se = await t.findHandle(T, 'resize.se');
      if (!se) return { ok: false, observed: `no se handle (handles ${(ctrls ?? []).join(',')})` };
      const k = await t.kOf();
      const from = t.center(await t.handleRect(se));
      await t.drag(from, { x: from.x + 80 * k, y: from.y + 40 * k });
      const after = await t
        .pollUntil(
          () => posOf(T),
          (p) => p && !same(p, before),
          8000,
        )
        .catch(() => posOf(T));
      await t.settled();
      await undo();
      const back = await posOf(T);
      return {
        ok:
          chip === 'Table' &&
          dirs.length === 8 &&
          t.near(after.w - before.w, 80, 8) &&
          t.near(after.h - before.h, 40, 8) &&
          same(back, before),
        observed: `chip "${chip}"; handles ${dirs.length}; ${t.posStr(before)} -> ${t.posStr(after)}; undo restored ${same(back, before)}`,
      };
    },
  );

  await t.step(
    'tables.cell.fill-border-tail',
    "with a cell session open, the tail's Fill color, Border color, Border weight and Border dash",
    'each writes the cell and it draws them',
    async () => {
      const facts = [];
      const on = await openCell(T, 1, 1);
      if (!on) return { ok: false, observed: 'no cell session' };
      const b0 = JSON.stringify(await block(T));
      const s0 = await cellStyle(T, 1, 1);
      /* the sheet's markup is frozen while a cell session is open (Editor.tsx keeps the session's
         html), so a write shows only once the session ends: Escape, then the drawn style */
      const endSession = async () => {
        if (await t.editing()) {
          await t.press('Escape');
          await t.sleep(250);
        }
        await t.settled();
      };
      /* fill */
      await t.tailControl('toolbar.fillColor');
      await t.waitControl('toolbar.fillColor.plate', 5000).catch(() => undefined);
      const fillPick = (await t.has('[data-control="toolbar.fillColor.amber"]'))
        ? 'toolbar.fillColor.amber'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.fillColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$/.test(c)) ?? null,
          );
      if (fillPick) await t.clickControl(fillPick);
      await endSession();
      const s1 = await t
        .pollUntil(
          () => cellStyle(T, 1, 1),
          (s) => s && s.background !== s0.background,
          6000,
        )
        .catch(() => cellStyle(T, 1, 1));
      facts.push(`fill ${fillPick}: ${s0?.background} -> ${s1?.background}`);
      /* border colour */
      if (!(await t.editing())) await openCell(T, 1, 1);
      await t.tailControl('toolbar.borderColor');
      await t.waitControl('toolbar.borderColor.plate', 5000).catch(() => undefined);
      const borderPick = (await t.has('[data-control="toolbar.borderColor.red"]'))
        ? 'toolbar.borderColor.red'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.borderColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$/.test(c)) ?? null,
          );
      if (borderPick) await t.clickControl(borderPick);
      await endSession();
      const s2 = await t
        .pollUntil(
          () => cellStyle(T, 1, 1),
          (s) => s && s.borderColor !== s1?.borderColor,
          6000,
        )
        .catch(() => cellStyle(T, 1, 1));
      facts.push(`border colour ${borderPick}: ${s1?.borderColor} -> ${s2?.borderColor}`);
      /* weight */
      if (!(await t.editing())) await openCell(T, 1, 1);
      const weight = await pickTailOption(
        'toolbar.borderWeight',
        (id, text) => /(^|[.-])2(px)?$/.test(id) || /^2(\s*px)?$/.test(text),
      );
      await endSession();
      const s3 = await t
        .pollUntil(
          () => cellStyle(T, 1, 1),
          (s) => s && s.borderWidth !== s2?.borderWidth,
          6000,
        )
        .catch(() => cellStyle(T, 1, 1));
      facts.push(
        `weight ${weight.pick ?? `none picked of ${weight.options.join(', ') || 'no options'}`}: ${s2?.borderWidth} -> ${s3?.borderWidth}`,
      );
      /* dash */
      if (!(await t.editing())) await openCell(T, 1, 1);
      const dash = await pickTailOption(
        'toolbar.borderDash',
        (id, text) => /dash(ed)?$/i.test(id) || /^Dash/.test(text),
      );
      await endSession();
      const s4 = await t
        .pollUntil(
          () => cellStyle(T, 1, 1),
          (s) => s && s.borderStyle !== s3?.borderStyle,
          6000,
        )
        .catch(() => cellStyle(T, 1, 1));
      facts.push(
        `dash ${dash.pick ?? `none picked of ${dash.options.join(', ') || 'no options'}`}: ${s3?.borderStyle} -> ${s4?.borderStyle}`,
      );
      const after = await block(T);
      const b1 = JSON.stringify(after);
      const written = b1 !== b0;
      const b0Parsed = JSON.parse(b0);
      const changed = Object.keys(after ?? {}).filter(
        (k) => JSON.stringify(after[k]) !== JSON.stringify(b0Parsed?.[k]),
      );
      await t.clearAll();
      for (let i = 0; i < 4; i += 1) await undo();
      const restored = JSON.stringify(await block(T)) === b0;
      facts.push(
        `block written ${written} (fields changed: ${changed.map((k) => `${k} ${JSON.stringify(after[k]).slice(0, 120)}`).join('; ') || 'none'}); restored after 4 undos ${restored}`,
      );
      if (!restored)
        for (const k of changed)
          await t.setBlock(S, T, `/${k}`, b0Parsed[k] ?? null).catch(() => undefined);
      return {
        ok:
          written &&
          s1?.background !== s0?.background &&
          s2?.borderColor !== s1?.borderColor &&
          s3?.borderWidth !== s2?.borderWidth &&
          s4?.borderStyle !== s3?.borderStyle,
        observed: facts.join('; '),
      };
    },
  );

  /**
   * A range of two cells (a cellRange): a cell session in 1,0, then Shift click on 1,1; when the
   * chip does not read a range a drag from cell 1,0 to 1,1 inside the open session is tried; the
   * route that made the range is recorded.
   */
  const selectRange = async () => {
    await openCell(T, 1, 0);
    const b = await t.runInfo(cellRun(T, 1, 1));
    await t.shiftClickAt(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    await t.sleep(300);
    let chip = await t.chip();
    let route = 'Shift click';
    const rangeRows = async () => {
      const info = await t.runInfo(cellRun(T, 1, 1));
      await t.rightClickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
      const rows = await t.contextRows();
      return rows;
    };
    let rows = await rangeRows();
    let merge = rows.find((r) => r.id === 'format.table.mergeCells');
    if (!merge || merge.disabled) {
      await t.press('Escape');
      await openCell(T, 1, 0);
      const a = await t.runInfo(cellRun(T, 1, 0));
      await t.drag(
        { x: a.rect.x + a.rect.w / 2, y: a.rect.y + a.rect.h / 2 },
        { x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 },
      );
      await t.sleep(300);
      chip = await t.chip();
      route = 'a drag across the cells';
      rows = await rangeRows();
      merge = rows.find((r) => r.id === 'format.table.mergeCells');
    }
    return { chip, route, rows, mergeEnabled: Boolean(merge) && !merge.disabled };
  };
  const spans = async () => (await block(T))?.spans ?? [];

  await t.step(
    'tables.cells.merge-unmerge',
    'select cells 1,0 to 1,1 as a range, right click > Merge cells, then Unmerge cells',
    'one span, then two cells again',
    async () => {
      const r = await selectRange();
      if (!r.mergeEnabled) {
        await t.press('Escape');
        return {
          ok: false,
          observed: `no range: chip "${r.chip}" after ${r.route}; Merge cells ${r.rows.find((x) => x.id === 'format.table.mergeCells')?.disabled === true ? 'disabled' : 'absent'} in the cell menu (rows ${r.rows.map((x) => x.id).join(', ')})`,
        };
      }
      await t.clickContextRow('format.table.mergeCells');
      const merged = await t.pollUntil(spans, (s) => s.length > 0, 8000).catch(() => spans());
      await t.settled();
      const info = await t.runInfo(cellRun(T, 1, 0));
      await t.rightClickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
      const rows = await t.contextRows();
      const unmerge = rows.find((x) => x.id === 'format.table.unmergeCells');
      let after = merged;
      if (unmerge && !unmerge.disabled) {
        await t.clickContextRow('format.table.unmergeCells');
        after = await t.pollUntil(spans, (s) => s.length === 0, 8000).catch(() => spans());
      } else await t.press('Escape');
      await t.settled();
      return {
        ok: merged.length === 1 && after.length === 0,
        observed: `range by ${r.route} (chip "${r.chip}"); spans after Merge ${JSON.stringify(merged)}; Unmerge ${unmerge ? (unmerge.disabled ? 'disabled' : 'picked') : 'absent'}; spans after ${JSON.stringify(after)}`,
      };
    },
  );

  await t.step(
    'tables.tail.merge-unmerge-buttons',
    "with two cells selected the tail's Merge cells, then Unmerge cells",
    'the buttons merge and restore the cells',
    async () => {
      const r = await selectRange();
      await t.press('Escape');
      await t.sleep(200);
      const mergeBtn = await t.visible('toolbar.mergeCells');
      const mergeDisabled = await t.attr('[data-control="toolbar.mergeCells"]', 'aria-disabled');
      if (!mergeBtn || mergeDisabled === 'true')
        return {
          ok: false,
          observed: `range by ${r.route} (chip "${r.chip}"); the tail's Merge cells ${mergeBtn ? 'disabled' : 'absent'}`,
        };
      await t.clickControl('toolbar.mergeCells');
      const merged = await t.pollUntil(spans, (s) => s.length > 0, 8000).catch(() => spans());
      await t.settled();
      const unmergeDisabled = await t.attr(
        '[data-control="toolbar.unmergeCells"]',
        'aria-disabled',
      );
      let after = merged;
      if (unmergeDisabled !== 'true' && (await t.visible('toolbar.unmergeCells'))) {
        await t.clickControl('toolbar.unmergeCells');
        after = await t.pollUntil(spans, (s) => s.length === 0, 8000).catch(() => spans());
      }
      await t.settled();
      return {
        ok: merged.length === 1 && after.length === 0,
        observed: `range by ${r.route}; spans after the Merge button ${JSON.stringify(merged)}; Unmerge ${unmergeDisabled === 'true' ? 'disabled' : 'clicked'}; spans after ${JSON.stringify(after)}`,
      };
    },
  );

  await t.step(
    'tables.distribute.rows-columns',
    'a row height and a column width changed (setup writes), then Distribute rows and Distribute columns from the cell menu',
    'the sizes equalise',
    async () => {
      await endSession();
      const b0 = await block(T);
      await t.setBlock(S, T, '/columns/0/width', 420);
      await t.setBlock(S, T, '/rows/1/height', 160);
      const widths = (boxes) => boxes.rows[0].map((c) => Math.round(c.w));
      const heights = (boxes) => boxes.rows.map((r) => Math.round(r[0]?.h ?? 0));
      const spread = (list) => Math.max(...list) - Math.min(...list);
      /* the sheet draws a write a moment after the store holds it: each read polls for the change
         it expects (the second run read the previous state at every step) */
      const before = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(widths(x)) > 20,
          6000,
        )
        .catch(() => cellBoxes(T));
      await openCell(T, 1, 1);
      const a = await contextTableRow('distributeColumns');
      await endSession();
      const mid = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(widths(x)) <= 3,
          6000,
        )
        .catch(() => cellBoxes(T));
      await openCell(T, 1, 1);
      const b = await contextTableRow('distributeRows');
      await endSession();
      const after = await t
        .pollUntil(
          () => cellBoxes(T),
          (x) => x && spread(heights(x)) <= 3,
          6000,
        )
        .catch(() => cellBoxes(T));
      /* the heights are judged on the stored rows as well as the drawn boxes: the default table
         draws its rows at their content height, so a stored height may not move the drawn row */
      const storedHeights = (await block(T))?.rows?.map((r) => r.height ?? 'auto') ?? [];
      const evenHeights = spread(heights(after)) <= 3 && new Set(storedHeights).size === 1;
      const even = spread(widths(after)) <= 3 && evenHeights;
      await t.clearAll();
      for (let i = 0; i < 4; i += 1) await undo();
      let restored = same(await block(T), b0);
      if (!restored) {
        /* the setup writes go back through the window API so the rows after read the product's table */
        await t.setBlock(S, T, '/columns', b0.columns);
        await t.setBlock(S, T, '/rows', b0.rows);
        restored = same(await block(T), b0);
      }
      return {
        ok: a && b && spread(widths(before)) > 20 && even,
        observed: `picked ${a} ${b}; widths ${widths(before).join(',')} -> ${widths(mid).join(',')}; drawn heights ${heights(before).join(',')} -> ${heights(after).join(',')} (stored ${storedHeights.join(',')}); even ${even}; block restored ${restored}`,
      };
    },
  );

  /** The show's table facts: the cells drawn, the typed text, any editable field. */
  const showFacts = () =>
    page.evaluate(() => {
      const show = document.querySelector('[data-control="present.show"]');
      const sheet =
        document.querySelector('.ts-stagewrap.is-present .pt-slide:not(.is-leaving)') ??
        document.querySelector('.pt-viewer.is-present .pt-slide:not(.is-leaving)');
      const table = sheet?.querySelector('.table');
      return {
        show: show !== null,
        cells: table ? table.querySelectorAll('.td').length : 0,
        text: table?.textContent ?? '',
        editable: sheet ? sheet.querySelectorAll('[contenteditable="true"]').length : -1,
      };
    });
  const openShow = async () => {
    await t.clearAll();
    await t.clickControl('present.open');
    await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
    await t.sleep(800);
  };
  const leaveShow = async () => {
    await t.press('Escape');
    await page
      .locator('[data-control="present.show"]')
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => undefined);
    await t.sleep(300);
  };

  await t.step(
    'tables.light-appearance',
    'Slide > Change theme, the light tile; read the table; then Slideshow',
    'the cell hairlines, the header fill and the text read on the light sheet (no cell text under 3:1); the show draws it the same',
    async () => {
      const got = await t.pickAppearance('light');
      await t.closeThemes();
      const ground = await t.sheetGround();
      const s = await cellStyle(T, 1, 1);
      const header = await cellStyle(T, 0, 0);
      const textContrast = t.contrastOf(s?.color, ground);
      const borderContrast = t.contrastOf(
        s?.borderColor,
        header?.background && header.background !== 'rgba(0, 0, 0, 0)' ? header.background : ground,
      );
      const boxes = await cellBoxes(T);
      await openShow();
      const show = await showFacts();
      await leaveShow();
      const back = await t.pickAppearance('dark');
      await t.closeThemes();
      return {
        ok:
          (got.deck === 'light' || got.theme === 'light') &&
          textContrast !== null &&
          textContrast >= 3 &&
          borderContrast !== null &&
          borderContrast > 1.1 &&
          show.show &&
          show.cells === boxes.rows.flat().length &&
          /Q1 revenue/.test(show.text) &&
          show.editable === 0,
        observed: `appearance ${JSON.stringify(got)}; ground ${ground}; cell text ${s?.color} (${textContrast}:1); cell border ${s?.borderColor} ${s?.borderWidth} (${borderContrast}:1 on ${header?.background}); header fill ${header?.background}; show: ${show.cells} cells, editable ${show.editable}, text has Q1 revenue ${/Q1 revenue/.test(show.text)}; back to ${JSON.stringify(back)}`,
      };
    },
  );

  await t.step(
    'tables.present',
    'Slideshow on the table slide',
    'the table draws with its cells and typed text and no editable field; Escape leaves',
    async () => {
      await t.clickCard(S);
      const boxes = await cellBoxes(T);
      await openShow();
      const show = await showFacts();
      await leaveShow();
      const gone = !(await t.has('[data-control="present.show"]'));
      return {
        ok:
          show.show &&
          show.cells === boxes.rows.flat().length &&
          /Q1 revenue/.test(show.text) &&
          show.editable === 0 &&
          gone,
        observed: `show ${show.show}; cells ${show.cells} of ${boxes.rows.flat().length}; text has Q1 revenue ${/Q1 revenue/.test(show.text)}; editable fields ${show.editable}; left on Escape ${gone}`,
      };
    },
  );

  await t.step(
    'tables.reload',
    'reload /edit/<id>#s/<table slide>',
    'the table and its text survive',
    async () => {
      const before = JSON.stringify(await block(T));
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.settled();
      const after = await t
        .pollUntil(
          async () => JSON.stringify(await block(T)),
          (x) => x !== 'null',
          10_000,
        )
        .catch(async () => JSON.stringify(await block(T)));
      const drawn = await cellBoxes(T);
      return {
        ok:
          before === after &&
          after.includes('Q1 revenue') &&
          Boolean(drawn) &&
          drawn.rows.length > 0,
        observed: `block the same ${before === after}; text kept ${after.includes('Q1 revenue')}; drawn rows ${drawn?.rows.length ?? 0}`,
      };
    },
  );
  await featuresRound(t, S, {
    block,
    posOf,
    counts,
    cellText,
    cellRun,
    sessionCell,
    cellBoxes,
    cellStyle,
    undo,
    openCell,
    endSession,
    pickTailOption,
  });
  await objectsRound(t, S, {
    cellRun,
    sessionCell,
    cellStyle,
    openCell,
    endSession,
  });
  await t.advancedBack('the tables rows');
}

/**
 * The features round, ship one (docs/archive/rounds/FEATURES.md 2.2 ranks 2, 4, 5, 8 and 13, 2.3 items 1 to 3, 7
 * and 9, 3.1 item 4; the rows `tables.cell.click-places-caret` to `tables.cells.tabular-figures`):
 * the table click model amended by FEATURES.md 2.1 (one click on a cell of an unselected table
 * places the caret; a drag from inside still moves it), the range gestures, the appends, the
 * arrows, the marks on a range, the Table section first, the P1 handles, bar and prompts, and the
 * tabular figures. Every table here is placed through the window API as a setup write (the
 * matrix's `setup` field) on two fresh slides, so each gesture meets a known table. A P1 control
 * that is not on the build reads not built with its id and B3's name (docs/archive/rounds/PRODUCT.md 8.1); a
 * gesture on a control that exists is judged as the product does it today.
 */
async function featuresRound(t, S, h) {
  const { page } = t;
  const LANE = 'B3';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** A typed table: the header cells H1.., the body cells R<r>C<c> (0 based, the matrix's numbering). */
  /* `size` names a rung of the table's own ladder (schema blocks/table.ts TABLE_SIZES, 20 down to
     15, 20 when absent): the typed 3 by 4 table sits at 18 so "the size step up" of
     tables.range.size-color has a rung above it, the ladder's top being the default (the
     integrator, ship one; build/b3.md R7) */
  const typedTable = (
    id,
    columns,
    rows,
    pos,
    { empty = false, header = true, size = undefined } = {},
  ) => ({
    id,
    type: 'table',
    columns: Array.from({ length: columns }, () => ({})),
    rows: Array.from({ length: rows }, (_, r) => ({
      cells: Array.from({ length: columns }, (_, c) =>
        empty ? '' : r === 0 ? `H${c}` : `R${r}C${c}`,
      ),
      ...(r === 0 && header && !empty ? { header: true } : {}),
    })),
    pos,
    ...(size !== undefined ? { size } : {}),
  });
  const S2 = await t
    .setup(
      'a second slide for the features round tables',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(S, 'blank');
        t.deck.tableSlide2 = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.tableSlide2);
  await t.clickCard(S2);
  await t.clearAll();
  const blockOn = async (slide, id) => (await t.blockOf(slide, id))?.block ?? null;
  /** The column and row counts of a table on the second slide (the area's `counts` reads its own slide). */
  const countsOf = async (id) => {
    const b = await blockOn(S2, id);
    return b ? { columns: b.columns.length, rows: b.rows.length } : null;
  };
  const posOn = async (slide, id) => (await t.blockOf(slide, id))?.pos ?? null;
  const textOn = async (slide, id, r, c) => {
    const cell = (await blockOn(slide, id))?.rows?.[r]?.cells?.[c];
    return typeof cell === 'string'
      ? cell
      : (cell?.text ?? (cell === undefined ? null : JSON.stringify(cell)));
  };
  /** The cell's run centre on the stage. */
  const cellPoint = async (id, r, c) => {
    const info = await t.runInfo(h.cellRun(id, r, c));
    if (!info) throw new Error(`no run for cell ${r},${c} of ${id}`);
    return { x: info.rect.x + info.rect.w / 2, y: info.rect.y + info.rect.h / 2 };
  };
  /** The range ring of the selected table (Editor.tsx `.ts-select.is-cells`), with the cells it covers. */
  const rangeRing = (id) =>
    page.evaluate((blockId) => {
      const ring = document.querySelector(
        '.ts-overlay .ts-select.is-cells, .ts-stagewrap .ts-select.is-cells',
      );
      if (!ring || ring.getClientRects().length === 0) return null;
      const r = ring.getBoundingClientRect();
      const root = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      const cells = [...(root?.querySelectorAll('.td') ?? [])].filter((td) => {
        const b = td.getBoundingClientRect();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        return cx >= r.x - 1 && cx <= r.right + 1 && cy >= r.y - 1 && cy <= r.bottom + 1;
      }).length;
      return {
        label: ring.getAttribute('data-cell-range'),
        cells,
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      };
    }, id);
  /** The refusal card of EditorRoot.tsx and the save words, read together. */
  const refusal = () =>
    page.evaluate(() => {
      const card = document.querySelector(
        '[data-control^="conflict."], .ts-conflict, .ts-reject-card',
      );
      const root =
        card?.closest('[role="dialog"], [role="alert"], .ts-conflict, .ts-chrome') ?? card;
      return {
        card: root?.textContent?.trim().slice(0, 160) ?? null,
        words:
          document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null,
      };
    });
  /** The drawn marks and style of a cell's run. */
  const runStyle = (id, r, c) =>
    page.evaluate(
      ([blockId, run]) => {
        const el = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] [data-run="${run}"]`,
        );
        if (!el) return null;
        const inner = el.querySelector('b, strong, i, em, [data-mark], span') ?? el;
        const cs = getComputedStyle(inner);
        /* the colour where the glyphs draw: the element around the run's first text, so a colour
           mark's span inside the paragraph is read and not the paragraph's own colour (the
           integrator, ship one; build/b3.md R7: the cells held [H0]{c:green} and the paragraph
           still computed the header's colour) */
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if ((node.textContent ?? '').trim() !== '') {
            textNode = node;
            break;
          }
        const glyphs = textNode?.parentElement ?? inner;
        const td = el.closest('.td');
        return {
          bold:
            el.querySelectorAll('b, strong, [data-mark="bold"], [data-mark="strong"]').length > 0 ||
            Number(cs.fontWeight) >= 600,
          italic:
            el.querySelectorAll('i, em, [data-mark="italic"], [data-mark="em"]').length > 0 ||
            cs.fontStyle === 'italic',
          size: parseFloat(getComputedStyle(glyphs).fontSize),
          color: getComputedStyle(glyphs).color,
          align: getComputedStyle(el).textAlign,
          numeric: td
            ? getComputedStyle(td).fontVariantNumeric
            : getComputedStyle(el).fontVariantNumeric,
          text: el.textContent?.trim() ?? '',
        };
      },
      [id, h.cellRun(id, r, c)],
    );
  /** The width of a run's text on the stage (a Range over its text), in px. */
  const textWidth = (id, r, c) =>
    page.evaluate(
      ([blockId, run]) => {
        const el = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] [data-run="${run}"]`,
        );
        if (!el) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().width;
      },
      [id, h.cellRun(id, r, c)],
    );
  const revision = async () => (await t.state()).revision;
  /** Cmd+Z from the stage, the session ended first, and the revision it left. */
  const undoOnce = async () => {
    await h.endSession();
    await t.clearAll();
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
    return revision();
  };
  /** A marquee over a table from the empty sheet around it; answers the selection facts. */
  const marquee = async (slide, id) => {
    await t.clearAll();
    const pos = await posOn(slide, id);
    const from = await t.sheetPoint(pos.x - 30, pos.y - 30);
    const to = await t.sheetPoint(pos.x + pos.w + 30, pos.y + pos.h + 30);
    await t.drag(from, to, { steps: 12 });
    await t.sleep(300);
    return t.selectionFacts(id);
  };
  /** Selects a table as an object with no cell open: one click, then Escape if a cell opened (FEATURES.md 2.1: Escape keeps the table). */
  const selectTable = async (id) => {
    const ctrls = await t.selectObject(id);
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(200);
    }
    return ctrls;
  };

  // ---- the click model (2.2 rank 2)
  const T1 = 'ft-click';
  const T2 = 'ft-drag';
  await t.setup(
    'two typed 3 by 3 tables for the click model',
    'block.insert through the window API',
    async () => {
      const a = await t.placeBlock(S2, typedTable(T1, 3, 3, { x: 80, y: 100, w: 600, h: 220 }));
      const b = await t.placeBlock(S2, typedTable(T2, 3, 3, { x: 860, y: 100, w: 600, h: 220 }));
      return { ok: Boolean(a) && Boolean(b), observed: `${a?.id ?? 'none'}, ${b?.id ?? 'none'}` };
    },
  );
  await t.step(
    'tables.cell.click-places-caret',
    'one click on cell 2,2 of an unselected table; a pointer down in a cell of another unselected table and a move of 80 by 40',
    'the first selects the table and places the caret in 2,2 within 300 ms; the second moves the table exactly and opens no cell',
    async () => {
      await t.clearAll();
      const p = await cellPoint(T1, 2, 2);
      await t.clickAt(p.x, p.y);
      await t.sleep(300);
      const facts = await t.selectionFacts(T1);
      const where = await h.sessionCell();
      const caret = facts.editing && where?.row === 2 && where?.column === 2;
      await t.clearAll();
      const before2 = await textOn(S2, T2, 1, 1);
      const from = await cellPoint(T2, 1, 1);
      const r = await t.dragInside(S2, T2, 80, 40, from);
      const openedDuring = r.during?.editing === true;
      const openAfter = await t.editing();
      const moved =
        r.before &&
        r.after &&
        /* the existing move gesture's snap (A1 rule 2) may land the table on a grid line; the
           tolerance is the other move rows' 8 sheet px and the delta is recorded */
        t.near(r.after.x - r.before.x, 80, 8) &&
        t.near(r.after.y - r.before.y, 40, 8);
      const kept = (await textOn(S2, T2, 1, 1)) === before2;
      await t.clearAll();
      return {
        ok:
          facts.selected &&
          facts.resize === 8 &&
          facts.chip === 'Table' &&
          caret &&
          moved &&
          !openedDuring &&
          !openAfter &&
          kept,
        observed: `the click: ${t.describeSelection(facts)}; session cell ${where ? `${where.row},${where.column}` : 'none'} (the caret in 2,2 ${caret}); the drag from cell 1,1 of the other table: ${t.posStr(r.before)} -> ${t.posStr(r.after)} (moved by 80,40 ${moved}), a cell open during ${openedDuring}, after ${openAfter}, cell 1,1 unchanged ${kept}${caret ? '' : `; the first click ${facts.editing ? 'opened a session elsewhere' : 'placed no caret'} (FEATURES.md 2.2 rank 2, ${LANE})`}`,
      };
    },
  );

  // ---- the typed 3 by 4 table of the next rows
  const T3 = 'ft-typed';
  await t.setup(
    'a typed 3 by 4 table for the caret, range and mark rows',
    'block.insert through the window API',
    async () => {
      const obj = await t.placeBlock(
        S2,
        typedTable(T3, 4, 3, { x: 80, y: 420, w: 900, h: 240 }, { size: 18 }),
      );
      return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
    },
  );

  await t.step(
    'tables.cell.click-then-type',
    'one click on cell 2,3 of the unselected typed table and the key x at human speed; Cmd+Z',
    'cell 2,3 reads "<text>x", cell 1,1 is unchanged; Cmd+Z restores 2,3 in one step',
    async () => {
      await t.clearAll();
      const before = await textOn(S2, T3, 2, 3);
      const first = await textOn(S2, T3, 1, 1);
      const rev0 = await revision();
      const p = await cellPoint(T3, 2, 3);
      await t.clickAt(p.x, p.y);
      await t.typeHuman('x');
      await t.sleep(200);
      const where = await h.sessionCell();
      await t.press('Escape');
      await t.settled();
      const after = await t
        .pollUntil(
          () => textOn(S2, T3, 2, 3),
          (x) => x === `${before}x`,
          8000,
        )
        .catch(() => textOn(S2, T3, 2, 3));
      const firstAfter = await textOn(S2, T3, 1, 1);
      const rev1 = await undoOnce();
      const restored = await t
        .pollUntil(
          () => textOn(S2, T3, 2, 3),
          (x) => x === before,
          8000,
        )
        .catch(() => textOn(S2, T3, 2, 3));
      return {
        ok: after === `${before}x` && firstAfter === first && restored === before,
        observed: `cell 2,3 "${before}" -> "${after}" (the key landed in ${where ? `${where.row},${where.column}` : 'no cell'}); cell 1,1 "${first}" -> "${firstAfter}"; revision ${rev0} -> ${rev1} after Cmd+Z, cell 2,3 "${restored}"${after === `${before}x` ? '' : ` (FEATURES.md 2.2 ranks 2 and 4, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.range.drag-from-selected',
    'on the selected table a pointer down in cell 1,1 and a move to cell 2,3; then a drag from the ring band by 80,40',
    'the range ring covers 6 cells and the table does not move; the band drag moves it exactly',
    async () => {
      await selectTable(T3);
      const before = await posOn(S2, T3);
      const a = await cellPoint(T3, 1, 1);
      const b = await cellPoint(T3, 2, 3);
      await t.drag(a, b, { steps: 12 });
      await t.sleep(300);
      const ring = await rangeRing(T3);
      const afterRange = await posOn(S2, T3);
      const stayed = same(before, afterRange);
      if (!stayed) await undoOnce();
      await t.press('Escape');
      await t.sleep(200);
      await selectTable(T3);
      const grip = await t.frameGrip(T3);
      let moved = false;
      let afterMove = null;
      if (grip) {
        const k = await t.kOf();
        await t.drag(grip, { x: grip.x + 80 * k, y: grip.y + 40 * k }, { steps: 14 });
        await t.settled();
        afterMove = await posOn(S2, T3);
        moved =
          afterMove &&
          t.near(afterMove.x - before.x, 80, 1.5) &&
          t.near(afterMove.y - before.y, 40, 1.5);
        if (afterMove && !same(afterMove, before)) await undoOnce();
      }
      await t.clearAll();
      return {
        ok: ring !== null && ring.cells === 6 && stayed && moved,
        observed: `range ring ${ring ? `"${ring.label}" over ${ring.cells} cells` : 'none'}; table ${t.posStr(before)} -> ${t.posStr(afterRange)} after the cell drag (unmoved ${stayed}); the band drag ${grip ? `${t.posStr(before)} -> ${t.posStr(afterMove)} (by 80,40 ${moved})` : 'found no frame band'}${ring ? '' : ` (FEATURES.md 2.2 rank 2, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.selected.typing-appends',
    'a marquee over the typed table, the key x; a click on cell 2,3, Escape, the key y; Cmd+Z twice',
    'x appends in the first cell, y appends in 2,3, each restored in one step',
    async () => {
      const first00 = await textOn(S2, T3, 0, 0);
      const first11 = await textOn(S2, T3, 1, 1);
      const c23 = await textOn(S2, T3, 2, 3);
      const facts = await marquee(S2, T3);
      await t.typeHuman('x');
      await t.sleep(300);
      const whereX = await h.sessionCell();
      const caretX = whereX
        ? await t.caretFacts(h.cellRun(T3, whereX.row, whereX.column)).catch(() => null)
        : null;
      await t.press('Escape');
      await t.settled();
      const x00 = await textOn(S2, T3, 0, 0);
      const x11 = await textOn(S2, T3, 1, 1);
      const appendedX = x00 === `${first00}x` || x11 === `${first11}x`;
      const replaced = x00 === 'x' || x11 === 'x';
      const p = await cellPoint(T3, 2, 3);
      await t.clickAt(p.x, p.y);
      await t.sleep(250);
      await t.press('Escape');
      await t.sleep(250);
      const stillSelected = (await t.selectionFacts(T3)).selected && !(await t.editing());
      await t.typeHuman('y');
      await t.sleep(300);
      const whereY = await h.sessionCell();
      await t.press('Escape');
      await t.settled();
      const y23 = await textOn(S2, T3, 2, 3);
      const appendedY = y23 === `${c23}y`;
      /* one Cmd+Z per write that landed (a write the key made whatever it did to the text); an
         undo past the row's own writes would take back the setup's table */
      if (y23 !== c23) await undoOnce();
      const y23back = await textOn(S2, T3, 2, 3);
      if (x00 !== first00 || x11 !== first11) await undoOnce();
      const x00back = await textOn(S2, T3, 0, 0);
      const x11back = await textOn(S2, T3, 1, 1);
      return {
        ok:
          facts.selected &&
          !facts.editing &&
          appendedX &&
          appendedY &&
          y23back === c23 &&
          x00back === first00 &&
          x11back === first11,
        observed: `marquee: ${t.describeSelection(facts)}; x opened ${whereX ? `${whereX.row},${whereX.column}` : 'no cell'} (caret ${caretX ? `${caretX.offset} of ${caretX.length}` : 'unread'}): cell 0,0 "${first00}" -> "${x00}", cell 1,1 "${first11}" -> "${x11}" (appended ${appendedX}, replaced ${replaced}); after the click, Escape: table selected with no cell ${stillSelected}; y opened ${whereY ? `${whereY.row},${whereY.column}` : 'no cell'}: cell 2,3 "${c23}" -> "${y23}"; after the two Cmd+Z: 2,3 "${y23back}", 0,0 "${x00back}", 1,1 "${x11back}"${appendedX ? '' : ` (FEATURES.md 2.2 rank 4, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.cell.arrows-cross-cells',
    'open cell 1,1; End, Right; Down; Home, Left; Up',
    'Right at the end opens 1,2 with the caret at its start; Down opens 2,2; Left at the start opens 2,1; Up opens 1,1',
    async () => {
      const on = await h.openCell(T3, 1, 1);
      if (!on) return { ok: false, observed: 'no cell session' };
      const facts = [];
      const move = async (keys, want) => {
        for (const key of keys) await t.press(key);
        await t.sleep(400);
        const where = await h.sessionCell();
        const editing = await t.editing();
        const caret = where
          ? await t.caretFacts(h.cellRun(T3, where.row, where.column)).catch(() => null)
          : null;
        const ok = editing && where?.row === want[0] && where?.column === want[1];
        facts.push(
          `${keys.join('+')} -> ${where ? `${where.row},${where.column}` : 'no cell'}${caret ? ` (caret ${caret.offset} of ${caret.length})` : ''} wanted ${want.join(',')}`,
        );
        return { ok, caret };
      };
      const right = await move(['End', 'ArrowRight'], [1, 2]);
      const atStart = right.caret ? right.caret.offset === 0 : false;
      const down = await move(['ArrowDown'], [2, 2]);
      const left = await move(['Home', 'ArrowLeft'], [2, 1]);
      const up = await move(['ArrowUp'], [1, 1]);
      await h.endSession();
      return {
        ok: right.ok && atStart && down.ok && left.ok && up.ok,
        observed: `${facts.join('; ')}; caret at the start after Right ${atStart}${right.ok ? '' : ` (FEATURES.md 2.2 rank 5, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.range.shift-arrows',
    'open cell 1,1; Home; Shift+Right, Shift+Down; Delete',
    'a range over 4 cells; Delete clears their texts in one step',
    async () => {
      const texts = async () => [
        await textOn(S2, T3, 1, 1),
        await textOn(S2, T3, 1, 2),
        await textOn(S2, T3, 2, 1),
        await textOn(S2, T3, 2, 2),
      ];
      const before = await texts();
      const others = [await textOn(S2, T3, 0, 0), await textOn(S2, T3, 2, 3)];
      const on = await h.openCell(T3, 1, 1);
      if (!on) return { ok: false, observed: 'no cell session' };
      await t.press('Home');
      await t.press('Shift+ArrowRight');
      await t.sleep(300);
      await t.press('Shift+ArrowDown');
      await t.sleep(400);
      const ring = await rangeRing(T3);
      const rev0 = await revision();
      await t.press('Delete');
      await t.settled();
      const after = await t.pollUntil(texts, (x) => x.every((c) => c === ''), 6000).catch(texts);
      const rev1 = await revision();
      const othersAfter = [await textOn(S2, T3, 0, 0), await textOn(S2, T3, 2, 3)];
      const cleared = after.every((c) => c === '') && same(others, othersAfter);
      let restored = null;
      if (cleared) {
        await undoOnce();
        restored = await texts();
      }
      await t.clearAll();
      return {
        ok: ring !== null && ring.cells === 4 && cleared && same(restored, before),
        observed: `range ring ${ring ? `"${ring.label}" over ${ring.cells} cells` : 'none'}; Delete: ${JSON.stringify(before)} -> ${JSON.stringify(after)} (revision ${rev0} -> ${rev1}); the cells outside ${same(others, othersAfter) ? 'kept' : 'changed'}; after Cmd+Z ${JSON.stringify(restored)}${ring ? '' : ` (FEATURES.md 2.2 rank 5, ${LANE})`}`,
      };
    },
  );

  /** A range over the header row of T3 by a drag from cell 0,0 to 0,3 on the selected table. */
  const headerRange = async () => {
    await selectTable(T3);
    const pos0 = await posOn(S2, T3);
    const a = await cellPoint(T3, 0, 0);
    const b = await cellPoint(T3, 0, 3);
    await t.drag(a, b, { steps: 12 });
    await t.sleep(300);
    const ring = await rangeRing(T3);
    /* on a build where the drag from inside a selected table still moves it (A1 rule 2 before
       FEATURES.md 2.2 rank 2), the move is taken back so the rows after meet the table in place */
    if (!same(pos0, await posOn(S2, T3))) {
      await undoOnce();
      await selectTable(T3);
    }
    return ring;
  };
  const headerStyles = async () => [0, 1, 2, 3].map((c) => runStyle(T3, 0, c));
  const headerRead = async () => Promise.all(await headerStyles());

  await t.step(
    'tables.range.bold-italic',
    'a range over the header row; Cmd+B; Cmd+Z; Cmd+I; Cmd+Z',
    'every cell of the range bolds in one commit with no refusal card and no "Couldn\'t save"; Cmd+Z removes the marks; the same for italic',
    async () => {
      const ring = await headerRange();
      const facts = [`range ${ring ? `"${ring.label}" over ${ring.cells} cells` : 'none'}`];
      let ok = ring !== null && ring.cells === 4;
      for (const [chord, mark] of [
        ['Meta+b', 'bold'],
        ['Meta+i', 'italic'],
      ]) {
        if (mark === 'italic') {
          const again = await headerRange();
          if (!again) facts.push('no range for Cmd+I');
        }
        const rev0 = await revision();
        await t.press(chord);
        await t.sleep(600);
        const cardWords = await refusal();
        const marked = await t
          .pollUntil(headerRead, (s) => s.every((x) => x?.[mark]), 6000)
          .catch(headerRead);
        await t.settled();
        const rev1 = await revision();
        const all = marked.every((x) => x?.[mark]);
        const some = marked.filter((x) => x?.[mark]).length;
        const words = await refusal();
        const clean =
          cardWords.card === null &&
          words.card === null &&
          !/Couldn't save|retrying/.test(`${cardWords.words} ${words.words}`);
        if (some > 0) await undoOnce();
        const undone = await headerRead();
        const cleared = undone.every((x) => !x?.[mark]);
        /* one commit: one Cmd+Z clears every cell (the revision moves with the ack on the memory tier, so it is recorded, never judged) */
        ok = ok && all && clean && cleared;
        facts.push(
          `${chord}: ${some} of 4 cells ${mark} (revision ${rev0} -> ${rev1}); refusal card ${cardWords.card ?? words.card ?? 'none'}; save words "${words.words}"; after Cmd+Z ${undone.filter((x) => x?.[mark]).length} still ${mark}`,
        );
        if (cardWords.card !== null || words.card !== null) {
          const dismiss = page
            .locator('[data-control="conflict.discard"], button:has-text("Dismiss")')
            .first();
          if ((await dismiss.count()) > 0)
            await dismiss.click({ timeout: 2000 }).catch(() => undefined);
        }
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (FEATURES.md 2.2 rank 8, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.range.size-color',
    'a range over the header row; the size step up; a text colour from the plate; Align right from the tail',
    'every cell of the range takes the size, the colour and the alignment',
    async () => {
      const ring = await headerRange();
      const before = await headerRead();
      const facts = [`range ${ring ? `"${ring.label}" over ${ring.cells} cells` : 'none'}`];
      let ok = ring !== null && ring.cells === 4;
      const sizeControl = (await t.visible('toolbar.fontSize.plus'))
        ? 'toolbar.fontSize.plus'
        : null;
      if (sizeControl) await t.tailControl(sizeControl);
      else facts.push('no toolbar.fontSize.plus on the tail');
      await t.settled();
      const sized = await t
        .pollUntil(headerRead, (s) => s.every((x, i) => x && x.size > (before[i]?.size ?? 0)), 6000)
        .catch(headerRead);
      const sizeOk = sized.every((x, i) => x && x.size > (before[i]?.size ?? 0));
      facts.push(
        `size ${before.map((x) => x?.size).join(',')} -> ${sized.map((x) => x?.size).join(',')}`,
      );
      /* the colour: the plate's first token swatch that is not the kit's, None or Custom */
      await headerRange();
      await t.tailControl('toolbar.textColor');
      await t.waitControl('toolbar.textColor.plate', 5000).catch(() => undefined);
      const swatch = await page.evaluate(
        () =>
          [...document.querySelectorAll('[data-control^="toolbar.textColor."]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control'))
            .find((c) => /\.(red|blue|amber|green)$/.test(c)) ??
          [...document.querySelectorAll('[data-control^="toolbar.textColor."]')]
            .map((e) => e.getAttribute('data-control'))
            .find((c) => !/plate|menu|none|hex$|kit\./.test(c)) ??
          null,
      );
      if (swatch) await t.clickControl(swatch);
      else await t.press('Escape');
      await t.settled();
      const coloured = await t
        .pollUntil(headerRead, (s) => s.every((x, i) => x && x.color !== before[i]?.color), 6000)
        .catch(headerRead);
      const colourOk = coloured.every((x, i) => x && x.color !== before[i]?.color);
      facts.push(
        `colour by ${swatch ?? 'no swatch'}: ${before.map((x) => x?.color).join(' ')} -> ${coloured.map((x) => x?.color).join(' ')}`,
      );
      await headerRange();
      const pick = await h.pickTailOption(
        'toolbar.align',
        (id, text) => /right$/i.test(id) || /^Right$/.test(text),
      );
      await t.settled();
      const aligned = await t
        .pollUntil(headerRead, (s) => s.every((x) => x?.align === 'right'), 6000)
        .catch(headerRead);
      const alignOk = aligned.every((x) => x?.align === 'right');
      facts.push(
        `Align right (${pick.pick ?? 'none picked'}): ${aligned.map((x) => x?.align).join(',')}`,
      );
      ok = ok && sizeOk && colourOk && alignOk;
      /* one Cmd+Z per write that landed, so the rows after meet the typed table and never a table
         the undo took back (the second smoke undid the setup's block.insert this way) */
      for (const wrote of [alignOk, colourOk, sizeOk]) if (wrote) await undoOnce();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (FEATURES.md 2.2 rank 8, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.panel.table-first',
    'select the table; Format options; read the first section; the Height field; Distribute rows',
    'the Table section leads at 900 px; one Height field reads the selected row; Distribute rows evens the heights in one step',
    async () => {
      await selectTable(T3);
      if (!(await t.visible('panel.formatOptions'))) {
        await t.tailControl('toolbar.formatOptions');
        await t.waitControl('panel.formatOptions', 8000);
      }
      await t.sleep(400);
      const facts = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.formatOptions"]');
        /* the panel's sections in DOM order (FormatOptions.tsx: section.ts-panel-section[data-section]) */
        const sections = [...(panel?.querySelectorAll('section[data-section]') ?? [])]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-section'));
        const table = document.querySelector('[data-control="formatOptions.table"]');
        const r = table?.getBoundingClientRect();
        const heights = [
          ...document.querySelectorAll('[data-control^="formatOptions.table.rowHeight."]'),
        ].length;
        const height = document.querySelector('[data-control="formatOptions.table.height"]');
        return {
          sections,
          tableTop: r ? Math.round(r.top) : null,
          tableVisible: Boolean(r && r.top >= 0 && r.top < window.innerHeight),
          heightFields: heights,
          oneHeight: height !== null,
          heightValue: height && 'value' in height ? String(height.value) : null,
          distribute:
            document.querySelector('[data-control="formatOptions.table.distributeRows"]') !== null,
        };
      });
      const first = facts.sections[0] === 'table';
      let evened = null;
      let rev = null;
      let distributeNote = '';
      if (facts.distribute) {
        /* the first row grown through the window API (a setup write), then Distribute rows; the
           panel is read again after the write and the selection, since the section re renders */
        try {
          await t.setBlock(S2, T3, '/rows/0/height', 140);
          await selectTable(T3);
          if (!(await t.visible('panel.formatOptions'))) {
            await t.tailControl('toolbar.formatOptions');
            await t.waitControl('panel.formatOptions', 8000);
          }
          await t.waitControl('formatOptions.table', 8000);
          const there = await t.visible('formatOptions.table.distributeRows');
          if (!there) {
            distributeNote = 'Distribute rows left the panel after the write and the selection';
          } else {
            await page
              .locator('[data-control="formatOptions.table.distributeRows"]')
              .first()
              .scrollIntoViewIfNeeded({ timeout: 4000 })
              .catch(() => undefined);
            const rev0 = await revision();
            await t.clickControl('formatOptions.table.distributeRows');
            await t.settled();
            rev = [rev0, await revision()];
            const rows = (await blockOn(S2, T3))?.rows ?? [];
            const hs = rows.map((r) => r.height);
            evened = hs.every((x) => x === hs[0]);
            distributeNote = `heights after Distribute rows ${JSON.stringify(hs)}`;
          }
        } catch (error) {
          distributeNote = `Distribute rows: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
        }
      }
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      return {
        ok:
          first &&
          facts.tableVisible &&
          facts.oneHeight &&
          facts.heightFields === 0 &&
          facts.distribute &&
          evened === true,
        observed: `sections in order ${facts.sections.join(', ')}; the Table section top ${facts.tableTop} px (in view ${facts.tableVisible}); one Height field ${facts.oneHeight}${facts.heightValue !== null ? ` reading "${facts.heightValue}"` : ''}, per row fields ${facts.heightFields}; Distribute rows ${facts.distribute}${evened !== null ? `, heights even after it ${evened} (revision ${rev[0]} -> ${rev[1]})` : ''}${distributeNote ? `; ${distributeNote}` : ''}${first && facts.oneHeight ? '' : ` (FEATURES.md 2.2 rank 13, ${LANE})`}`,
      };
    },
  );

  // ---- the P1 handles and the bar (2.3 items 1 to 3)
  await t.step(
    'tables.seam.row-drag',
    'select the table; drag the first inner row seam by 40 px; Cmd+Z; drag the seam under the last row at a quarter of its width',
    'the readout shows px and rows[0].height is written; Cmd+Z restores; the last seam writes rows[2].height and grows the table',
    async () => {
      const ctrls = (await selectTable(T3)) ?? [];
      const seams = ctrls.filter((c) => /^handle\.(table|ft-typed)\.row\.\d+$/.test(c));
      if (seams.length === 0)
        return t.notBuilt(
          'handle.table.row',
          LANE,
          `the selected table shows ${ctrls.filter((c) => /seam|column|row/.test(c)).length} seam handle(s) (${
            ctrls
              .filter((c) => /seam|column|row/.test(c))
              .map((c) => c.replace(/^handle\.[^.]+\./, ''))
              .join(', ') || 'none'
          }) and no row seam (P1, FEATURES.md 2.3 item 1)`,
        );
      const before = (await blockOn(S2, T3)).rows.map((r) => r.height ?? null);
      const pos0 = await posOn(S2, T3);
      const first = seams.find((c) => /\.0$/.test(c)) ?? seams[0];
      const h0 = t.center(await t.handleRect(first));
      const k = await t.kOf();
      const during = await t.drag(
        h0,
        { x: h0.x, y: h0.y + 40 * k },
        { steps: 12, during: async () => ({ readout: await t.readout() }) },
      );
      await t.settled();
      const after = (await blockOn(S2, T3)).rows.map((r) => r.height ?? null);
      const written = typeof after[0] === 'number' && (before[0] === null || after[0] > before[0]);
      await undoOnce();
      const back = (await blockOn(S2, T3)).rows.map((r) => r.height ?? null);
      await selectTable(T3);
      const last = (await t.handleControls())
        .filter((c) => /^handle\.(table|ft-typed)\.row\.\d+$/.test(c))
        .sort()
        .pop();
      let grew = false;
      let lastWritten = false;
      let lastObserved = 'no last seam';
      if (last) {
        /* the seam under the last row shares its centre with the s resize square (the table's
           own handle, which takes the press there as Google's bottom frame handle does), so the
           press lands at a quarter of the seam's width, clear of the sw square at the corner and
           the s square at the middle, and the fact is the last row's own height as well as the
           box (the verifier's pass 1 finding 3 on the objects round: the s square grows the box
           too, the extra shared across the rows, rows[].height unchanged; B5's fix round moved the
           "+" outside the ring, so no position along the edge is covered by it) */
        const rl = await t.handleRect(last);
        const hl = { x: rl.x + rl.w / 4, y: rl.y + rl.h / 2 };
        const index = Number(last.replace(/^.*\.row\./, ''));
        const rows0 = (await blockOn(S2, T3)).rows.map((r) => r.height ?? null);
        await t.drag(hl, { x: hl.x, y: hl.y + 40 * k }, { steps: 12 });
        await t.settled();
        const pos1 = await posOn(S2, T3);
        const rows1 = (await blockOn(S2, T3)).rows.map((r) => r.height ?? null);
        grew = Boolean(pos1 && pos1.h > pos0.h + 20);
        lastWritten =
          typeof rows1[index] === 'number' &&
          (rows0[index] === null || rows1[index] > rows0[index] + 20);
        lastObserved = `rows[${index}].height ${JSON.stringify(rows0[index])} -> ${JSON.stringify(rows1[index])}, pos.h ${pos0.h} -> ${pos1?.h}`;
        await undoOnce();
      }
      return {
        ok:
          written && /px/.test(during?.readout ?? '') && same(back, before) && grew && lastWritten,
        observed: `row seams ${seams.join(', ')}; readout during "${during?.readout ?? 'none'}"; heights ${JSON.stringify(before)} -> ${JSON.stringify(after)} -> Cmd+Z ${JSON.stringify(back)}; the last seam at a quarter of its width: ${lastObserved}, the table grew ${grew}`,
      };
    },
  );

  await t.step(
    'tables.edge.add-row-column',
    'hover the right edge of the selected table at the second seam, click the "+"; the same at the bottom edge; Cmd+Z each',
    'a column is inserted with the other widths held; a row is inserted; each is one Cmd+Z',
    async () => {
      await selectTable(T3);
      await tableControlsOn(t, page, T3, () => selectTable(T3));
      const boxes = await h.cellBoxes(T3);
      /* the pointer at the second seam of the right edge (the row's words), clear of the e square at
         the edge's middle; the "+" sits outside the ring since the objects round's fix round
         (TableOverlay.tsx ADD_GAP), so no position along the edge is covered by it, and the
         hover positions of the objects round hold */
      const right = boxes.rows[1][boxes.rows[1].length - 1];
      await page.mouse.move(right.x + right.w - 2, right.y + right.h);
      await t.sleep(500);
      /* the ids of docs/archive/rounds/OBJECTS.md 3.3 item 4 are the block's (`handle.<block>.add.column`); the
         declared family `handle.table.add.column` is read as well */
      const addColumnId = (await t.visible(`handle.${T3}.add.column`))
        ? `handle.${T3}.add.column`
        : 'handle.table.add.column';
      const addRowId = async () =>
        (await t.visible(`handle.${T3}.add.row`)) ? `handle.${T3}.add.row` : 'handle.table.add.row';
      const addColumn = await t.visible(addColumnId);
      if (!addColumn) {
        /* the first column seam of the bottom edge (a quarter along a four column table), clear of
           the s square at the edge's middle, which column 1's right edge is on a four column table */
        const bottom = boxes.rows[boxes.rows.length - 1][0];
        await page.mouse.move(bottom.x + bottom.w, bottom.y + bottom.h - 2);
        await t.sleep(500);
        if (!(await t.visible(await addRowId())))
          return t.notBuilt(
            'handle.table.add.column',
            LANE,
            'no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2)',
          );
      }
      const c0 = await countsOf(T3);
      const w0 = boxes.rows[0].map((c) => Math.round(c.w));
      await t.clickControl(addColumnId);
      const c1 = await t
        .pollUntil(
          () => countsOf(T3),
          (c) => c && c.columns === c0.columns + 1,
          8000,
        )
        .catch(() => countsOf(T3));
      await t.settled();
      const w1 = (await h.cellBoxes(T3)).rows[0].map((c) => Math.round(c.w));
      const held = w0.every((w) => w1.some((x) => Math.abs(x - w) <= 2));
      if (c1?.columns === c0.columns + 1) await undoOnce();
      const c2 = await countsOf(T3);
      await selectTable(T3);
      const b2 = await h.cellBoxes(T3);
      const bottom = b2.rows[b2.rows.length - 1][0];
      await page.mouse.move(bottom.x + bottom.w, bottom.y + bottom.h - 2);
      await t.sleep(500);
      const rowControl = await addRowId();
      const addRow = await t.visible(rowControl);
      let c3 = null;
      let c4 = null;
      if (addRow) {
        await t.clickControl(rowControl);
        c3 = await t
          .pollUntil(
            () => countsOf(T3),
            (c) => c && c.rows === c0.rows + 1,
            8000,
          )
          .catch(() => countsOf(T3));
        await undoOnce();
        c4 = await countsOf(T3);
      }
      return {
        ok:
          c1?.columns === c0.columns + 1 &&
          held &&
          c2?.columns === c0.columns &&
          c3?.rows === c0.rows + 1 &&
          c4?.rows === c0.rows,
        observed: `"+" on the right edge ${addColumn}: columns ${c0.columns} -> ${c1?.columns} (widths ${w0.join(',')} -> ${w1.join(',')}, held ${held}) -> Cmd+Z ${c2?.columns}; "+" on the bottom edge ${addRow}: rows ${c0.rows} -> ${c3?.rows ?? 'not clicked'} -> Cmd+Z ${c4?.rows ?? '-'}`,
      };
    },
  );

  await t.step(
    'tables.heads.select-row-column',
    'click the hover band above column 2, then the band left of row 2; Fill color from the tail',
    'the column, then the row, is selected as a range; the fill writes every cell of the selection',
    async () => {
      await selectTable(T3);
      await tableControlsOn(t, page, T3, () => selectTable(T3));
      const boxes = await h.cellBoxes(T3);
      const top = boxes.rows[0][2];
      await page.mouse.move(top.x + top.w / 2, top.y - 6);
      await t.sleep(500);
      /* the heads' ids are the block's (`handle.<block>.head.<axis>.<n>`, docs/archive/rounds/OBJECTS.md 3.3
         item 4) or the declared family's */
      const heads = await page.evaluate(
        (id) =>
          [
            ...document.querySelectorAll(
              `[data-control^="handle.table.head."], [data-control^="handle.${id}.head."]`,
            ),
          ]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control')),
        T3,
      );
      const headOf = (axis, n) =>
        heads.find((h) => h.endsWith(`.head.${axis}.${n}`)) ?? `handle.table.head.${axis}.${n}`;
      if (heads.length === 0)
        return t.notBuilt(
          'handle.table.head.column',
          LANE,
          'no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2)',
        );
      await t.clickControl(headOf('column', 2));
      await t.sleep(300);
      const column = await rangeRing(T3);
      const left = boxes.rows[2][0];
      await page.mouse.move(left.x - 6, left.y + left.h / 2);
      await t.sleep(500);
      await t.clickControl(headOf('row', 2));
      await t.sleep(300);
      const row = await rangeRing(T3);
      const s0 = await h.cellStyle(T3, 2, 0);
      await t.tailControl('toolbar.fillColor');
      await t.waitControl('toolbar.fillColor.plate', 5000).catch(() => undefined);
      const pick = (await t.has('[data-control="toolbar.fillColor.amber"]'))
        ? 'toolbar.fillColor.amber'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.fillColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$|menu|kit\./.test(c)) ?? null,
          );
      if (pick) await t.clickControl(pick);
      await t.settled();
      await t.clearAll();
      const filled = await Promise.all([0, 1, 2, 3].map((c) => h.cellStyle(T3, 2, c)));
      const every = filled.every((s) => s && s.background !== s0.background);
      if (every) await undoOnce();
      return {
        ok: column?.cells === 3 && row?.cells === 4 && every,
        observed: `heads ${heads.join(', ')}; column 2 as a range ${column ? `"${column.label}" over ${column.cells} cells` : 'none'}; row 2 ${row ? `"${row.label}" over ${row.cells} cells` : 'none'}; fill ${pick}: ${s0?.background} -> ${filled.map((s) => s?.background).join(' | ')}`,
      };
    },
  );

  await t.step(
    'tables.bar.row-column-buttons',
    'select the table; read the bar under it; Insert row below from it',
    'the bar lists the row and column buttons, Merge, Fill color, Border and Align; the insert adds a row and keeps the caret',
    async () => {
      await h.openCell(T3, 1, 1);
      const bar = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="bar.table."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control').replace('bar.table.', '')),
      );
      if (bar.length === 0) {
        await h.endSession();
        return t.notBuilt(
          'bar.table',
          LANE,
          'no bar under the selected table (P1, FEATURES.md 2.3 item 3)',
        );
      }
      const want = [
        'insertRowAbove',
        'insertRowBelow',
        'insertColumnLeft',
        'insertColumnRight',
        'deleteRow',
        'deleteColumn',
      ];
      const missing = want.filter((w) => !bar.includes(w));
      const extra = ['merge', 'fill', 'border', 'align'].filter(
        (w) => !bar.some((b) => new RegExp(w, 'i').test(b)),
      );
      const c0 = await countsOf(T3);
      await t.clickControl('bar.table.insertRowBelow');
      const c1 = await t
        .pollUntil(
          () => countsOf(T3),
          (c) => c && c.rows === c0.rows + 1,
          8000,
        )
        .catch(() => countsOf(T3));
      await t.sleep(300);
      const where = await h.sessionCell();
      const kept = (await t.editing()) && where?.row === 1 && where?.column === 1;
      if (c1?.rows === c0.rows + 1) await undoOnce();
      return {
        ok: missing.length === 0 && extra.length === 0 && c1?.rows === c0.rows + 1 && kept,
        observed: `bar ${bar.join(', ')}; missing ${missing.join(', ') || 'none'}; without ${extra.join(', ') || 'none'}; rows ${c0.rows} -> ${c1?.rows}; caret kept in 1,1 ${kept} (${where ? `${where.row},${where.column}` : 'no cell'})`,
      };
    },
  );

  await t.step(
    'tables.command.keeps-caret',
    'open cell 1,1; Insert row below from the right click menu; Align right from the tail; a range 1,1 to 1,2, Merge cells',
    'the caret stays in its cell after each command; the range stays a range after Merge',
    async () => {
      const c0 = await countsOf(T3);
      const alignBefore = (await runStyle(T3, 1, 1))?.align ?? null;
      const on = await h.openCell(T3, 1, 1);
      if (!on) return { ok: false, observed: 'no cell session' };
      const p = await cellPoint(T3, 1, 1);
      await t.rightClickAt(p.x, p.y);
      const rows = await t.contextRows();
      const insert = rows.find((r) => r.id === 'format.table.insertRowBelow');
      if (insert && !insert.disabled) await t.clickContextRow('format.table.insertRowBelow');
      else await t.press('Escape');
      await t.settled();
      await t.sleep(300);
      const afterInsert = { editing: await t.editing(), cell: await h.sessionCell() };
      const inserted = ((await countsOf(T3))?.rows ?? c0.rows) === c0.rows + 1;
      if (!afterInsert.editing) await h.openCell(T3, 1, 1);
      const pick = await h.pickTailOption(
        'toolbar.align',
        (id, text) => /right$/i.test(id) || /^Right$/.test(text),
      );
      await t.settled();
      await t.sleep(300);
      const afterAlign = { editing: await t.editing(), cell: await h.sessionCell() };
      const aligned = ((await runStyle(T3, 1, 1))?.align ?? null) !== alignBefore;
      if (!afterAlign.editing) await h.openCell(T3, 1, 1);
      const posBeforeRange = await posOn(S2, T3);
      const a = await cellPoint(T3, 1, 1);
      const b = await cellPoint(T3, 1, 2);
      await t.drag(a, b, { steps: 10 });
      await t.sleep(300);
      const ringBefore = await rangeRing(T3);
      const movedByDrag = !same(posBeforeRange, await posOn(S2, T3));
      if (movedByDrag) await undoOnce();
      await t.rightClickAt(b.x, b.y);
      const merge = (await t.contextRows()).find((r) => r.id === 'format.table.mergeCells');
      if (merge && !merge.disabled) await t.clickContextRow('format.table.mergeCells');
      else await t.press('Escape');
      await t.settled();
      await t.sleep(300);
      const spans = (await blockOn(S2, T3))?.spans ?? [];
      const ringAfter = await rangeRing(T3);
      const chip = await t.chip();
      const insertKept =
        afterInsert.editing && afterInsert.cell?.row === 1 && afterInsert.cell?.column === 1;
      const alignKept =
        afterAlign.editing && afterAlign.cell?.row === 1 && afterAlign.cell?.column === 1;
      const rangeKept = spans.length === 1 && ringAfter !== null;
      /* one Cmd+Z per write that landed */
      for (const wrote of [spans.length === 1, aligned, inserted]) if (wrote) await undoOnce();
      return {
        ok: insertKept && pick.pick !== null && alignKept && rangeKept,
        observed: `Insert row below: session ${afterInsert.editing} in ${afterInsert.cell ? `${afterInsert.cell.row},${afterInsert.cell.column}` : 'no cell'}; Align right (${pick.pick ?? 'none'}): session ${afterAlign.editing} in ${afterAlign.cell ? `${afterAlign.cell.row},${afterAlign.cell.column}` : 'no cell'}; range before Merge ${ringBefore ? `"${ringBefore.label}"` : 'none'}, spans after ${JSON.stringify(spans)}, range ring after ${ringAfter ? `"${ringAfter.label}"` : 'none'}, chip "${chip}"${insertKept && alignKept ? '' : ` (FEATURES.md 2.3 item 7, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.cells.tabular-figures',
    "read a cell's font-variant-numeric; type 1111 and 0000 into two cells and measure; read a paragraph",
    'the cell computes tabular-nums, the two widths match, the paragraph stays proportional',
    async () => {
      const style = await runStyle(T3, 2, 1);
      const typeOver = async (r, c, text) => {
        const on = await h.openCell(T3, r, c);
        if (!on) return false;
        await t.press('Meta+a');
        await t.typeHuman(text);
        await t.sleep(200);
        await t.press('Escape');
        await t.settled();
        return t
          .pollUntil(
            () => textOn(S2, T3, r, c),
            (x) => x === text,
            8000,
          )
          .then(() => true)
          .catch(() => false);
      };
      const ones = await typeOver(2, 1, '1111');
      const zeros = await typeOver(2, 2, '0000');
      await t.clearAll();
      const w1 = await textWidth(T3, 2, 1);
      const w0 = await textWidth(T3, 2, 2);
      /* a paragraph beside the table (a setup write), so running text is read on the same sheet */
      const paraBlock = await t
        .placeBlock(S2, {
          id: 'ft-para',
          type: 'text',
          text: '1111 against 0000 in running text',
          pos: { x: 1020, y: 440, w: 500, h: 60 },
        })
        .catch(() => null);
      const para = await page.evaluate(() => {
        const el = document.querySelector(
          '.ts-stagewrap.ts-editor .pt-slide [data-block="ft-para"]',
        );
        const run = el?.querySelector('[data-run]') ?? el;
        return run ? getComputedStyle(run).fontVariantNumeric : null;
      });
      void paraBlock;
      const tabular = /tabular-nums/.test(style?.numeric ?? '');
      const equal = w1 !== null && w0 !== null && Math.abs(w1 - w0) < 0.6;
      if (zeros) await undoOnce();
      if (ones) await undoOnce();
      return {
        ok: tabular && ones && zeros && equal && para !== null && !/tabular-nums/.test(para),
        observed: `cell font-variant-numeric "${style?.numeric}"; "1111" ${w1 === null ? 'unread' : `${Math.round(w1 * 100) / 100} px`}, "0000" ${w0 === null ? 'unread' : `${Math.round(w0 * 100) / 100} px`} (typed ${ones}, ${zeros}); a paragraph "${para}"${tabular ? '' : ' (FEATURES.md 3.1 item 4, B2)'}`,
      };
    },
  );

  // ---- the prompts (2.3 item 9)
  const S3 = await t
    .setup('a third slide for the empty table', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(S2, 'blank');
      t.deck.tableSlide3 = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.tableSlide3);
  await t.clickCard(S3);
  const T4 = 'ft-empty';
  await t.setup('an empty 5 by 6 table', 'block.insert through the window API', async () => {
    const obj = await t.placeBlock(
      S3,
      typedTable(T4, 6, 5, { x: 100, y: 120, w: 1400, h: 500 }, { empty: true }),
    );
    return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
  });
  /* tables.cells.prompt-hovered-only left with the polish round (docs/archive/rounds/POLISH.md 2.1 item 1): the
     editor draws no prompt in a table cell; its successor tables.cells.no-prompt is polish-tables.mjs's */
  await t.clickCard(S);
}

/**
 * The objects round (docs/archive/rounds/OBJECTS.md section 3, 6.1; the rows `tables.select.ring-with-cell-open`
 * to `tables.panel.section-words`): Kevin's screenshot answered. The one click state draws the
 * table's ring with the cell ring inside it (3.3 item 1), the empty cells read as a guide grid on
 * the editor's stage alone (item 2), the inserted table fits its rows and a row grows with its
 * text (item 3), the seams stay while a cell is open (item 5), the row head's menu carries Header
 * row (item 4) and the Table section reads the words of item 6. Every table is placed through the
 * window API as a setup write except the two of `tables.insert.box-fits-rows`, which the product's
 * grid places. A control that is not on the build reads not built with its id and the lane.
 */
async function objectsRound(t, S, h) {
  const { page } = t;
  const LANE = 'B2';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
  const boxStr = (b) => (b ? `${r1(b.x)},${r1(b.y)} ${r1(b.w)}x${r1(b.h)}` : 'none');
  const S4 = await t
    .setup(
      'a fourth slide for the objects round tables',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(t.deck.tableSlide3 ?? S, 'blank');
        t.deck.tableSlide4 = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.tableSlide4);
  await t.clickCard(S4);
  await t.clearAll();
  const blockOn = async (id) => (await t.blockOf(S4, id))?.block ?? null;
  const posOn = async (id) => (await t.blockOf(S4, id))?.pos ?? null;
  const revision = async () => (await t.state()).revision;
  const emptyTable = (id, columns, rows, pos) => ({
    id,
    type: 'table',
    columns: Array.from({ length: columns }, () => ({})),
    rows: Array.from({ length: rows }, (_, r) => ({
      cells: Array.from({ length: columns }, () => ''),
      ...(r === 0 ? { header: true } : {}),
    })),
    pos,
  });
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
  /** The cell's run centre on the stage (an empty cell's run is its zero width space line box). */
  const cellPoint = async (id, r, c) => {
    const info = await t.runInfo(h.cellRun(id, r, c));
    if (!info) throw new Error(`no run for cell ${r},${c} of ${id}`);
    return { x: info.rect.x + info.rect.w / 2, y: info.rect.y + info.rect.h / 2 };
  };
  /** The drawn rows' height of a table (the union of its row boxes, sheet px) from the frame facts. */
  const rowsHeight = (facts) => {
    const rows = facts?.cells?.rowBoxes ?? [];
    if (rows.length === 0) return null;
    const top = Math.min(...rows.map((b) => b.y));
    const bottom = Math.max(...rows.map((b) => b.y + b.h));
    return r1(bottom - top);
  };
  /** The overlay's facts around the selected table, in sheet px: the ring, the chip, the frame edges, the handles. */
  const overlayFacts = (id) =>
    page.evaluate(
      ([sel, blockId]) => {
        const sheet = document.querySelector(sel);
        if (!sheet) return null;
        const sr = sheet.getBoundingClientRect();
        const k = sr.width / 1600;
        const r1 = (n) => Math.round(n * 10) / 10;
        const box = (el) => {
          if (!el || el.getClientRects().length === 0) return null;
          const r = el.getBoundingClientRect();
          return {
            x: r1((r.x - sr.x) / k),
            y: r1((r.y - sr.y) / k),
            w: r1(r.width / k),
            h: r1(r.height / k),
          };
        };
        const ring = [...document.querySelectorAll('.ts-overlay .ts-select.is-selected')].find(
          (el) => !el.classList.contains('is-extra') && !el.classList.contains('is-cells'),
        );
        const chip = document.querySelector('.ts-overlay .ts-select-chip');
        const edges = [...document.querySelectorAll('.ts-overlay .ts-frame-edge')].map((el) => ({
          side: el.getAttribute('data-side'),
          box: box(el),
        }));
        const handles = {};
        for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
          handles[dir] = box(
            document.querySelector(`.ts-overlay [data-control="handle.${blockId}.resize.${dir}"]`),
          );
        return {
          table: box(sheet.querySelector(`.free[data-free="${blockId}"]`)),
          ring: box(ring),
          chip: chip ? { text: chip.textContent ?? '', box: box(chip) } : null,
          edges,
          handles,
          cellRing: box(document.querySelector('.ts-overlay .ts-cell-ring')),
          cellRings: document.querySelectorAll('.ts-overlay .ts-cell-ring').length,
          rangeRing: box(
            document.querySelector(
              '.ts-overlay .ts-select.is-cells, .ts-stagewrap .ts-select.is-cells',
            ),
          ),
          rangeRings: document.querySelectorAll(
            '.ts-overlay .ts-select.is-cells, .ts-stagewrap .ts-select.is-cells',
          ).length,
          editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
        };
      },
      [t.SHEET, id],
    );
  const centre = (b) => (b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null);
  const nearBox = (a, b, tol = 1) => t.compareFrame(a, b, { tolerance: tol }).ok;
  const undoOnce = async () => {
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(250);
    }
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  /**
   * The guide grid of a table (docs/archive/rounds/OBJECTS.md 3.3 item 2; B2's numbers in build/b2.md): an inset
   * box shadow on every `.td` but the last of its row (`rgba(...) -1px 0px 0px 0px inset` in the
   * deck's --hair, the sheet's ink for the deck's appearance; polish two P2-V1.4 finding 2),
   * never a border, on the editor's stage alone; the last cell, the filmstrip card, the show and
   * the print document read `none`. A border right or a `::after` guide is
   * read as well, so the row judges the guide whichever way a build draws it. `under` is the rule
   * under the last row (a border on the row or the root, or the root's inset shadow).
   */
  const guides = (id, scope = 'stage') =>
    page.evaluate(
      ([blockId, where, slideId]) => {
        const root =
          where === 'stage'
            ? document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`)
            : document.querySelector(
                `[data-control="filmstrip.slide.${slideId}"] [data-block="${blockId}"]`,
              );
        if (!root)
          return {
            found: false,
            image:
              where !== 'stage' &&
              document.querySelector(`[data-control="filmstrip.slide.${slideId}"] img`) !== null,
          };
        const shadowOf = (cs) => {
          const s = cs.boxShadow ?? 'none';
          if (s === 'none' || s === '') return null;
          const m = /rgba?\([^)]*\)/.exec(s);
          return { color: m ? m[0] : null, text: s };
        };
        const rows = [...root.querySelectorAll('.tr')];
        const seams = [];
        let lastDrawn = 0;
        for (const tr of rows) {
          const tds = [...tr.querySelectorAll('.td')];
          tds.forEach((td, i) => {
            const cs = getComputedStyle(td);
            const after = getComputedStyle(td, '::after');
            const border = parseFloat(cs.borderRightWidth) || 0;
            const guide =
              after.content !== 'none' && after.content !== '' ? parseFloat(after.width) || 0 : 0;
            const shadow = shadowOf(cs);
            const drawn = border > 0 || guide > 0 || shadow !== null;
            if (i === tds.length - 1) {
              if (drawn) lastDrawn += 1;
              return;
            }
            seams.push({
              width: border > 0 ? border : guide > 0 ? guide : shadow ? 1 : 0,
              color:
                border > 0
                  ? cs.borderRightColor
                  : guide > 0
                    ? after.backgroundColor || after.borderLeftColor
                    : (shadow?.color ?? null),
              how: border > 0 ? 'border' : guide > 0 ? 'after' : shadow ? 'shadow' : 'none',
            });
          });
        }
        const last = rows[rows.length - 1];
        const lastCs = last ? getComputedStyle(last) : null;
        const tableCs = getComputedStyle(root);
        const rootShadow = shadowOf(tableCs);
        const under =
          (lastCs && parseFloat(lastCs.borderBottomWidth)) ||
          parseFloat(tableCs.borderBottomWidth) ||
          (rootShadow ? 1 : 0);
        const underColor =
          lastCs && parseFloat(lastCs.borderBottomWidth) > 0
            ? lastCs.borderBottomColor
            : parseFloat(tableCs.borderBottomWidth) > 0
              ? tableCs.borderBottomColor
              : (rootShadow?.color ?? null);
        return {
          found: true,
          seams: seams.length,
          drawn: seams.filter((s) => s.width > 0).length,
          how: seams.find((s) => s.width > 0)?.how ?? 'none',
          color: seams.find((s) => s.width > 0)?.color ?? null,
          lastDrawn,
          under,
          underColor,
        };
      },
      [id, scope, S4],
    );
  /**
   * The contrast of a hairline with an alpha over the ground (B2's reading, build/b2.md: the
   * deck's --hair token is an rgba at 0.18 light and 0.22 dark, composited over the paper); an
   * opaque colour reads as the toolkit's contrast.
   */
  const hairContrast = (colour, ground) => {
    const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(colour ?? '');
    const g = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(ground ?? '');
    if (!m || !g) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const fg = [1, 2, 3].map((i) => Number(m[i]));
    const bg = [1, 2, 3].map((i) => Number(g[i]));
    const over = fg.map((v, i) => Math.round(a * v + (1 - a) * bg[i]));
    return t.contrastOf(`rgb(${over.join(', ')})`, `rgb(${bg.join(', ')})`);
  };

  // ---- the box from the rows (3.3 item 3)
  await t.reachSetup('Insert > Table', 'insert', 'insert.table');
  await t.step(
    'tables.insert.box-fits-rows',
    'Insert > Table, the 3 by 3 cell; then the 5 by 5 cell; Cmd+Z each',
    "each table's pos.h equals its rows' drawn height within 2 px (160 for three rows at 20 px, 267 for five) and the width is 960",
    async () => {
      const out = [];
      let ok = true;
      for (const pick of ['3x3', '5x5']) {
        await t.clearAll();
        const before = await t.objectIds(S4);
        await t.menuPath('insert', 'insert.table', `insert.table.pick.${pick}`);
        const obj = await t.newObjectAfter(S4, before, 15_000);
        await t.settled();
        if (!obj) {
          ok = false;
          out.push(`${pick}: nothing inserted within 15 s`);
          continue;
        }
        await t.press('Escape');
        await t.sleep(200);
        const facts = await t.frameFacts(obj.id);
        const drawn = rowsHeight(facts);
        const rows = facts?.cells?.rowBoxes?.length ?? 0;
        const fits = drawn !== null && t.near(obj.pos.h, drawn, 2) && t.near(obj.pos.w, 960, 1);
        ok = ok && fits;
        out.push(
          `${pick}: ${obj.type} ${obj.id} ${t.posStr(obj.pos)}, ${rows} rows drawn ${drawn} px high (fits ${fits})`,
        );
        await t.clearAll();
        await undoOnce();
      }
      return {
        ok,
        observed: `${out.join(' | ')}${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 3, ${LANE}; TOOL_SIZES.table by request)`}`,
      };
    },
  );

  // ---- the one click state (3.2, 3.3 item 1)
  const T5 = 'ob-empty';
  /* the tables of this section are placed at their rows' box, 163 for three rows at 20 px (54 a row
     with the rule and the hairline above, schema tableBoxHeight), so a resize up stops where it
     began and never grows the box to the floor (the integrator's walk: a table placed at 160 rose
     to 163 on the drag up) */
  await t.setup('an empty 3 by 3 table', 'block.insert through the window API', async () => {
    const obj = await t.placeBlock(S4, emptyTable(T5, 3, 3, { x: 320, y: 100, w: 960, h: 163 }));
    return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
  });
  await t.step(
    'tables.select.ring-with-cell-open',
    'one click on cell 1,1 of the empty table; a drag from the ring band by 80 by 40; Cmd+Z',
    'the selection ring is the table\'s box, the chip "Table" above it, the four frame edges on it, the eight handles on its corners; the drag moves the table by 80 by 40',
    async () => {
      await t.clearAll();
      const p = await cellPoint(T5, 1, 1);
      await t.clickAt(p.x, p.y);
      await t.sleep(300);
      const o = await overlayFacts(T5);
      const where = await h.sessionCell();
      const ringOnTable = o && nearBox(o.ring, o.table);
      const chipAbove =
        o?.chip !== null &&
        o?.chip?.text === 'Table' &&
        o.chip.box !== null &&
        o.ring !== null &&
        o.chip.box.y + o.chip.box.h <= o.ring.y + 4;
      const edgeOk = (side) => {
        const e = o?.edges?.find((x) => x.side === side)?.box ?? null;
        if (!e || !o.ring) return false;
        /* the strips are 8 CSS px wide and centred on the ring (Overlay.tsx FRAME_EDGE_PX), so the
           reading that matches the drawing is the strip's centre line (build/b5.md R9) */
        if (side === 'n') return t.near(e.y + e.h / 2, o.ring.y, 3) && t.near(e.x, o.ring.x, 8);
        if (side === 's') return t.near(e.y + e.h / 2, o.ring.y + o.ring.h, 3);
        if (side === 'w') return t.near(e.x + e.w / 2, o.ring.x, 3);
        return t.near(e.x + e.w / 2, o.ring.x + o.ring.w, 3);
      };
      const edges = ['n', 'e', 's', 'w'].filter(edgeOk);
      const cornerOk = (dir, x, y) => {
        const c = centre(o?.handles?.[dir] ?? null);
        return c !== null && t.near(c.x, x, 3) && t.near(c.y, y, 3);
      };
      const R = o?.ring ?? null;
      const corners = R
        ? [
            cornerOk('nw', R.x, R.y),
            cornerOk('ne', R.x + R.w, R.y),
            cornerOk('se', R.x + R.w, R.y + R.h),
            cornerOk('sw', R.x, R.y + R.h),
          ].filter(Boolean).length
        : 0;
      const handles = o ? Object.values(o.handles).filter(Boolean).length : 0;
      /* the move by the ring band (the n frame edge, a third of the way along) */
      const pos0 = await posOn(T5);
      const grip = await t.frameGrip(T5);
      let pos1 = null;
      if (grip) {
        const k = await t.kOf();
        /* the drag with the snap lines suppressed by Cmd during the move (Gestures.tsx freeGesture
           `suppress`, the product's rule): a plain drag at this position snaps the table's centre
           to the sheet's plate guide 3 px away (877 for 880; the integrator's reproduction on the
           objects round's tree), which is the product's snapping and not the move's arithmetic;
           the row proves the band moves the table by the pointer's travel */
        await t.moveHuman({ x: grip.x - 30, y: grip.y - 20 }, grip, 6);
        await t.sleep(80);
        await page.mouse.down();
        await t.sleep(100);
        await page.keyboard.down('Meta');
        await t.moveHuman(grip, { x: grip.x + 80 * k, y: grip.y + 40 * k }, 12);
        await t.sleep(120);
        await page.mouse.up();
        await page.keyboard.up('Meta');
        await t.sleep(200);
        await t.settled();
        pos1 = await t
          .pollUntil(
            () => posOn(T5),
            (q) => q && (q.x !== pos0.x || q.y !== pos0.y),
            6000,
          )
          .catch(() => posOn(T5));
      }
      const moved =
        pos0 && pos1 && t.near(pos1.x - pos0.x, 80, 1) && t.near(pos1.y - pos0.y, 40, 1);
      if (pos1 && !same(pos0, pos1)) await undoOnce();
      await t.clearAll();
      const ok =
        Boolean(ringOnTable) &&
        chipAbove &&
        edges.length === 4 &&
        handles === 8 &&
        corners === 4 &&
        Boolean(moved);
      return {
        ok,
        observed: `after the click: session cell ${where ? `${where.row},${where.column}` : 'none'}; table ${boxStr(o?.table)}, ring ${boxStr(o?.ring)} (on the table ${ringOnTable}); chip ${o?.chip ? `"${o.chip.text}" at ${boxStr(o.chip.box)}` : 'none'} (above the ring ${chipAbove}); frame edges on the ring ${edges.join(',') || 'none'}; handles ${handles}, on the corners ${corners}; the ring band drag ${grip ? `${t.posStr(pos0)} -> ${t.posStr(pos1)} (by 80,40 ${moved})` : 'no frame edge to grip'}${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 1, ${LANE} with B5)`}`,
      };
    },
  );

  await t.step(
    'tables.cell.ring-on-cell',
    'one click on cell 1,1; then a drag on the selected table from cell 1,1 to cell 2,2',
    "a cell ring on the cell's grid area (the full row height, the column's width) inside the table's ring; the range draws one ring on the union of the four cells",
    async () => {
      await t.clearAll();
      const p = await cellPoint(T5, 1, 1);
      await t.clickAt(p.x, p.y);
      await t.sleep(300);
      const o = await overlayFacts(T5);
      const f = await t.frameFacts(T5);
      const cell = f?.cells?.rows?.[1]?.[1] ?? null;
      const row = f?.cells?.rowBoxes?.[1] ?? null;
      const area = cell && row ? { x: cell.x, y: row.y, w: cell.w, h: row.h } : null;
      const cellRingOk = o?.cellRing !== null && area !== null && nearBox(o.cellRing, area);
      const insideRing =
        o?.cellRing && o.ring
          ? o.cellRing.x >= o.ring.x - 1 &&
            o.cellRing.y >= o.ring.y - 1 &&
            o.cellRing.x + o.cellRing.w <= o.ring.x + o.ring.w + 1 &&
            o.cellRing.y + o.cellRing.h <= o.ring.y + o.ring.h + 1
          : false;
      const q = await cellPoint(T5, 2, 2);
      await t.drag(p, q, { steps: 10 });
      await t.sleep(300);
      const o2 = await overlayFacts(T5);
      const f2 = await t.frameFacts(T5);
      const c22 = f2?.cells?.rows?.[2]?.[2] ?? null;
      const row2 = f2?.cells?.rowBoxes?.[2] ?? null;
      const union =
        cell && row && c22 && row2
          ? { x: cell.x, y: row.y, w: c22.x + c22.w - cell.x, h: row2.y + row2.h - row.y }
          : null;
      const rangeBox = o2?.rangeRing ?? o2?.cellRing ?? null;
      const rangeOk = union !== null && rangeBox !== null && nearBox(rangeBox, union);
      const oneRing = (o2?.rangeRings ?? 0) + (o2?.rangeRings > 0 ? 0 : (o2?.cellRings ?? 0)) === 1;
      const posAfter = await posOn(T5);
      await t.clearAll();
      const ok = cellRingOk && insideRing && rangeOk && oneRing;
      return {
        ok,
        observed: `cell 1,1 open: cell ring ${boxStr(o?.cellRing)} against the cell's grid area ${boxStr(area)} (${cellRingOk}), inside the table ring ${boxStr(o?.ring)} ${insideRing}; the range 1,1 to 2,2: ring ${boxStr(rangeBox)} against the union ${boxStr(union)} (${rangeOk}), rings drawn ${o2?.rangeRings ?? 0} range and ${o2?.cellRings ?? 0} cell; table ${t.posStr(posAfter)}${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 1, ${LANE} with B5)`}`,
      };
    },
  );

  // ---- the guide grid (3.3 item 2)
  await t.step(
    'tables.cells.empty-grid-guides',
    "read the empty table's inner column seams and the rule under its last row on the stage and on the filmstrip card",
    "a hairline on every inner seam of every row and under the last row, in the deck's --hair; the card draws none",
    async () => {
      await t.clearAll();
      const stage = await guides(T5, 'stage');
      const card = await guides(T5, 'card');
      const hair = await t.sheetVar('--hair');
      const every = stage.found && stage.seams > 0 && stage.drawn === stage.seams;
      const lastNone = stage.found && stage.lastDrawn === 0;
      const under = stage.found && stage.under > 0;
      const cardNone = !card.found || card.drawn === 0;
      const ok = every && lastNone && under && cardNone;
      return {
        ok,
        observed: `stage: ${stage.found ? `${stage.drawn} of ${stage.seams} inner seams drawn as a ${stage.how} (${stage.color ?? 'no colour'}), the last cells drawn ${stage.lastDrawn}, the rule under the last row ${stage.under} px (${stage.underColor})` : 'no table'}; the deck's --hair ${hair ?? 'unread'}; the filmstrip card: ${card.found ? `${card.drawn} seam(s) drawn` : card.image ? 'an image, no seams read' : 'no table markup'}${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 2, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.light-appearance-guides',
    'Slide > Change theme, the light tile; read the guides; the dark tile; read again',
    'the guide grid reads on both appearances with a contrast above 1.3 to the ground',
    async () => {
      await t.clearAll();
      const readings = [];
      for (const appearance of ['light', 'dark']) {
        const got = await t.pickAppearance(appearance);
        await t.closeThemes();
        await t.sleep(300);
        const g = await guides(T5, 'stage');
        const ground = await t.sheetGround();
        const contrast = g.color ? hairContrast(g.color, ground) : null;
        readings.push({
          appearance,
          got,
          drawn: g.drawn,
          seams: g.seams,
          color: g.color,
          ground,
          contrast,
        });
      }
      const ok = readings.every(
        (r) => r.drawn > 0 && r.drawn === r.seams && r.contrast !== null && r.contrast >= 1.3,
      );
      return {
        ok,
        observed:
          readings
            .map(
              (r) =>
                `${r.appearance} (${JSON.stringify(r.got)}): ${r.drawn} of ${r.seams} seams in ${r.color ?? 'no colour'} on ${r.ground} (${r.contrast === null ? 'no contrast' : `${r.contrast}:1`})`,
            )
            .join('; ') + (ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 2, ${LANE})`),
      };
    },
  );

  // ---- the rows and the box (3.3 item 3)
  const T6 = 'ob-typed';
  await t.setup(
    'a typed 3 by 3 table 960 wide',
    'block.insert through the window API',
    async () => {
      const obj = await t.placeBlock(S4, typedTable(T6, 3, 3, { x: 80, y: 420, w: 960, h: 163 }));
      return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
    },
  );
  const WORDS = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ');
  await t.step(
    'tables.rows.grow-with-text',
    'forty words typed into cell 1,1; Cmd+Z',
    "the row's drawn height grows, the rows below move down, pos.h is written up in the same commit and the ring meets the last rule; Cmd+Z restores both in one step",
    async () => {
      await t.clearAll();
      const f0 = await t.frameFacts(T6);
      const pos0 = await posOn(T6);
      const rev0 = await t.stableRevision();
      const on = await h.openCell(T6, 1, 1);
      if (!on) return { ok: false, observed: 'no cell session' };
      await t.press('End');
      /* typed inside the text burst's window (InlineText.tsx TEXT_BURST_MS 100: a pause past it
         flushes a burst as its own commit, so human speed typing of forty words lands three
         commits by design; the integrator's walk on the merged tree), so the words, the row's growth
         and pos.h travel in one commit and one Cmd+Z takes them back together */
      await page.keyboard.type(` ${WORDS}`, { delay: 25 });
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const text = await t
        .pollUntil(
          async () => (await blockOn(T6))?.rows?.[1]?.cells?.[1] ?? null,
          (x) => typeof x === 'string' && x.includes('word40'),
          10_000,
        )
        .catch(async () => (await blockOn(T6))?.rows?.[1]?.cells?.[1] ?? null);
      const rev1 = await t.stableRevision();
      const f1 = await t.frameFacts(T6);
      const pos1 = await posOn(T6);
      const lines = f1?.text?.lines ?? null;
      const rowGrew = (f1?.cells?.rowBoxes?.[1]?.h ?? 0) > (f0?.cells?.rowBoxes?.[1]?.h ?? 0) + 10;
      const below = (f1?.cells?.rowBoxes?.[2]?.y ?? 0) > (f0?.cells?.rowBoxes?.[2]?.y ?? 0) + 10;
      const drawn = rowsHeight(f1);
      const written = pos1 && pos0 && pos1.h > pos0.h && drawn !== null && pos1.h >= drawn - 2;
      await t.clearAll();
      await t.selectObject(T6);
      if (await t.editing()) {
        await t.press('Escape');
        await t.sleep(200);
      }
      const o = await overlayFacts(T6);
      const lastRule = f1?.cells?.rowBoxes
        ? Math.max(...f1.cells.rowBoxes.map((b) => b.y + b.h))
        : null;
      const ringMeets = o?.ring && lastRule !== null && t.near(o.ring.y + o.ring.h, lastRule, 2);
      /* the words landed in one burst commit when no keystroke paused past TEXT_BURST_MS (100 ms,
         InlineText.tsx); under the machine's load a pause splits them into two or more, each a
         commit that carries its words with pos.h (the integrator's walks: two commits with the
         check chain's Playwright beside them). One Cmd+Z per commit takes the words and the box
         back together, so the row reads that property over the commits it met and the count. */
      const commits = Math.max(1, rev1 - rev0);
      let back = null;
      let posBack = null;
      let undone = 0;
      for (; undone < commits; undone += 1) {
        await undoOnce();
        back = await blockOn(T6);
        posBack = await posOn(T6);
        if (back?.rows?.[1]?.cells?.[1] === 'R1C1') {
          undone += 1;
          break;
        }
      }
      const restored =
        back?.rows?.[1]?.cells?.[1] === 'R1C1' && posBack && t.near(posBack.h, pos0.h, 1);
      const oneCommit = commits === 1;
      const ok = rowGrew && below && Boolean(written) && Boolean(ringMeets) && restored;
      return {
        ok,
        observed: `typed ${typeof text === 'string' && text.includes('word40')}; the cell draws ${lines} line(s); row 1 ${r1(f0?.cells?.rowBoxes?.[1]?.h)} -> ${r1(f1?.cells?.rowBoxes?.[1]?.h)} px, row 2 from y ${r1(f0?.cells?.rowBoxes?.[2]?.y)} to ${r1(f1?.cells?.rowBoxes?.[2]?.y)}; pos.h ${pos0?.h} -> ${pos1?.h} against the rows' ${drawn} (written up ${written}); revision ${rev0} -> ${rev1} (${commits} commit(s), one ${oneCommit}, undone ${undone}); the ring's bottom ${r1(o?.ring ? o.ring.y + o.ring.h : null)} against the last rule ${lastRule} (${ringMeets}); Cmd+Z restored the text and the box together ${restored} (${t.posStr(posBack)})${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 3, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'tables.resize.rows-share-extra',
    "the se handle dragged down by 120, Cmd+Z; then dragged up by 200 past the rows' natural height, Cmd+Z",
    "the extra height is shared evenly across the rows; the table stops at the rows' natural height and the readout says that size",
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(T6);
      if (await t.editing()) {
        await t.press('Escape');
        await t.sleep(200);
      }
      if (!ctrls) return { ok: false, observed: 'the table was not selected' };
      const f0 = await t.frameFacts(T6);
      const h0 = (f0?.cells?.rowBoxes ?? []).map((b) => b.h);
      const down = await t.captureHandleDrag(
        `handle.${T6}.resize.se`,
        { x: 0, y: 120 },
        { id: T6 },
      );
      if (!down) return { ok: false, observed: 'no se handle on the table' };
      await t.settled();
      const f1 = await t.frameFacts(T6);
      const h1 = (f1?.cells?.rowBoxes ?? []).map((b) => b.h);
      const shares = h1.map((v, i) => r1(v - (h0[i] ?? 0)));
      const shared = shares.length === 3 && shares.every((d) => t.near(d, 40, 3));
      await undoOnce();
      await t.selectObject(T6);
      if (await t.editing()) {
        await t.press('Escape');
        await t.sleep(200);
      }
      const pos0 = await posOn(T6);
      const up = await t.captureHandleDrag(`handle.${T6}.resize.se`, { x: 0, y: -200 }, { id: T6 });
      await t.settled();
      const f2 = await t.frameFacts(T6);
      const pos2 = await posOn(T6);
      const natural = rowsHeight(f2);
      const floor = pos2 && natural !== null && t.near(pos2.h, natural, 2) && pos2.h <= pos0.h;
      const far = up ? t.frameAt(up, 'step12') : null;
      const readout = far?.readout ?? null;
      const said = readout && /× (\d+)/.exec(readout) ? Number(/× (\d+)/.exec(readout)[1]) : null;
      const readoutOk = said !== null && pos2 && t.near(said, pos2.h, 1);
      if (pos2 && !same(pos2, pos0)) await undoOnce();
      const ok = shared && Boolean(floor) && Boolean(readoutOk);
      return {
        ok,
        observed: `down by 120: rows ${h0.map(r1).join(', ')} -> ${h1.map(r1).join(', ')} (each +${shares.join(', +')}; even ${shared}); up by 200: pos.h ${pos0?.h} -> ${pos2?.h} against the rows' natural ${natural} (stopped at the floor ${floor}), the readout at the far point ${readout === null ? 'none' : `"${readout}"`} (says the floor ${readoutOk})${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 3, ${LANE})`}`,
      };
    },
  );

  // ---- the seams with a cell open (3.3 item 5)
  await t.step(
    'tables.seam.visible-with-cell-open',
    'one click on cell 1,1 (the caret placed); the first column seam dragged by 60; Cmd+Z',
    'the column seam handles are drawn with the cell open; the drag writes the widths and keeps the cell open with its caret',
    async () => {
      await t.clearAll();
      const p = await cellPoint(T6, 1, 1);
      await t.clickAt(p.x, p.y);
      await t.sleep(300);
      const open = await t.editing();
      const where = await h.sessionCell();
      const seams = (await t.handleControls()).filter((c) => c.startsWith(`handle.${T6}.column.`));
      if (seams.length === 0) {
        await h.endSession();
        return {
          ok: false,
          observed: `cell open ${open} (${where ? `${where.row},${where.column}` : 'no cell'}); no column seam handle with the cell open (docs/archive/rounds/OBJECTS.md 3.3 item 5, B1 for ${LANE})`,
        };
      }
      const first = seams.find((c) => c.endsWith('.0')) ?? seams[0];
      const before = (await blockOn(T6))?.columns ?? [];
      const hr = await t.handleRect(first);
      const k = await t.kOf();
      const from = t.center(hr);
      await t.drag(from, { x: from.x + 60 * k, y: from.y }, { steps: 12 });
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await blockOn(T6))?.columns ?? [],
          (c) => !same(c, before),
          8000,
        )
        .catch(async () => (await blockOn(T6))?.columns ?? []);
      const stillOpen = await t.editing();
      const whereAfter = await h.sessionCell();
      const written = !same(after, before) && typeof after[0]?.width === 'number';
      await h.endSession();
      if (written) await undoOnce();
      const ok =
        open &&
        seams.length > 0 &&
        written &&
        stillOpen &&
        whereAfter?.row === 1 &&
        whereAfter?.column === 1;
      return {
        ok,
        observed: `cell open ${open} (${where ? `${where.row},${where.column}` : 'no cell'}); seams ${seams.join(', ')}; columns ${JSON.stringify(before)} -> ${JSON.stringify(after)} (written ${written}); cell open after the drag ${stillOpen} (${whereAfter ? `${whereAfter.row},${whereAfter.column}` : 'no cell'})${ok ? '' : ` (docs/archive/rounds/OBJECTS.md 3.3 item 5, B1 for ${LANE})`}`,
      };
    },
  );

  // ---- the header toggle from the row head (3.3 item 4)
  await t.step(
    'tables.heads.header-toggle',
    "select the table; right click row 0's head; Header row; Cmd+Z",
    'the menu lists Header row checked; the click clears rows[0].header and the row draws at the body weight; Cmd+Z restores',
    async () => {
      await t.clearAll();
      await t.selectObject(T6);
      if (await t.editing()) {
        await t.press('Escape');
        await t.sleep(200);
      }
      await tableControlsOn(t, page, T6, async () => {
        await t.selectObject(T6);
        if (await t.editing()) {
          await t.press('Escape');
          await t.sleep(200);
        }
      });
      const f = await t.frameFacts(T6);
      const cell = f?.cells?.rows?.[0]?.[0] ?? null;
      if (cell) {
        const left = await t.sheetPoint(cell.x - 6, cell.y + cell.h / 2);
        await page.mouse.move(left.x, left.y);
        await t.sleep(500);
      }
      const heads = await page.evaluate(
        (id) =>
          [
            ...document.querySelectorAll(
              `[data-control^="handle.table.head.row."], [data-control^="handle.${id}.head.row."]`,
            ),
          ]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control')),
        T6,
      );
      const head = heads.find((c) => c.endsWith('.head.row.0')) ?? null;
      if (!head)
        return t.notBuilt(
          'handle.table.head.row',
          'B5',
          `no row head beside the selected table (docs/archive/rounds/OBJECTS.md 3.3 item 4)${heads.length > 0 ? `; heads ${heads.join(', ')}` : ''}`,
        );
      const hr = await t.rectOf(`[data-control="${head}"]`);
      await t.rightClickAt(hr.x + hr.w / 2, hr.y + hr.h / 2);
      /* the overlay's head menu (build/b5.md R7: `menu.format.table.headerRow`, a check row
         reading `aria-checked` from rows[0].header) is read by its control, wherever it is drawn */
      const menuRows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            id: el.getAttribute('data-control').replace(/^menu\./, ''),
            checked: el.getAttribute('aria-checked'),
            disabled: el.getAttribute('aria-disabled') === 'true',
          })),
      );
      const rows = menuRows.length > 0 ? menuRows : await t.contextRows();
      const row = rows.find((r) => r.id === 'format.table.headerRow') ?? null;
      const weight0 = (await h.cellStyle(T6, 0, 0)) ?? null;
      const w0 = await page.evaluate(
        ([id, run]) => {
          const el = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] [data-run="${run}"]`,
          );
          return el ? getComputedStyle(el.querySelector('.para') ?? el).fontWeight : null;
        },
        [T6, h.cellRun(T6, 0, 0)],
      );
      const body = await page.evaluate(
        ([id, run]) => {
          const el = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] [data-run="${run}"]`,
          );
          return el ? getComputedStyle(el.querySelector('.para') ?? el).fontWeight : null;
        },
        [T6, h.cellRun(T6, 1, 0)],
      );
      if (row) await t.clickControl('menu.format.table.headerRow');
      else await t.press('Escape');
      await t.settled();
      const header = await t
        .pollUntil(
          async () => (await blockOn(T6))?.rows?.[0]?.header ?? null,
          (x) => x !== true,
          6000,
        )
        .catch(async () => (await blockOn(T6))?.rows?.[0]?.header ?? null);
      const w1 = await page.evaluate(
        ([id, run]) => {
          const el = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] [data-run="${run}"]`,
          );
          return el ? getComputedStyle(el.querySelector('.para') ?? el).fontWeight : null;
        },
        [T6, h.cellRun(T6, 0, 0)],
      );
      const style1 = await h.cellStyle(T6, 0, 0);
      const cleared = header !== true;
      if (cleared) await undoOnce();
      const back = (await blockOn(T6))?.rows?.[0]?.header ?? null;
      const ok = row !== null && row.checked === 'true' && cleared && w1 === body && back === true;
      return {
        ok,
        observed: `head ${head}; the menu lists Header row ${row ? `(checked ${row.checked}, disabled ${row.disabled})` : 'not at all'} among ${rows.map((r) => r.id).join(', ')}; header ${true} -> ${header}; row 0 weight ${w0} -> ${w1} (the body's ${body}), hairline ${weight0?.borderWidth} ${weight0?.borderColor} -> ${style1?.borderWidth} ${style1?.borderColor}; Cmd+Z: header ${back}${ok ? '' : " (docs/archive/rounds/OBJECTS.md 3.3 item 4; format.table.headerRow is the integrator's row by B5's request)"}`,
      };
    },
  );

  // ---- the Table section's words (3.3 item 6)
  await t.step(
    'tables.panel.section-words',
    'select the table; open Format options; read the Table section',
    'Header row, Border, Rows (one Height, Distribute rows), Columns (Distribute columns), Cell (Fill, Border), Merge in that order, each property once, no generated table field below',
    async () => {
      /* the default view: the rows before turned the switch on for the table's parked controls
         (tableControlsOn), under which the generated table fields draw below the section and the
         row's "no generated field" reads false (preview 2, the integrator's walk) */
      if (t.deck.advanced) {
        const off = await t.setAdvanced(false);
        if (off) t.deck.advanced = false;
        await t.sleep(300);
      }
      await t.clearAll();
      await t.selectObject(T6);
      if (await t.editing()) {
        await t.press('Escape');
        await t.sleep(200);
      }
      if (!(await t.visible('panel.formatOptions'))) {
        await t.tailControl('toolbar.formatOptions');
        await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
      }
      await t.waitControl('formatOptions.table', 8000).catch(() => undefined);
      const facts = await page.evaluate((id) => {
        const panel = document.querySelector('[data-control="panel.formatOptions"]');
        const section = document.querySelector('[data-control="formatOptions.table"]');
        const visible = (el) => el.getClientRects().length > 0;
        const sections = [...(panel?.querySelectorAll('section[data-section]') ?? [])].map((s) =>
          s.getAttribute('data-section'),
        );
        const groups = [...(section?.querySelectorAll('[data-group]') ?? [])].map((g) =>
          g.getAttribute('data-group'),
        );
        const has = (c) =>
          section !== null && section.querySelector(`[data-control="${c}"]`) !== null;
        const count = (prefix) =>
          [...(section?.querySelectorAll(`[data-control^="${prefix}"]`) ?? [])].filter(visible)
            .length;
        const inGroup = (group, control) =>
          section?.querySelector(`[data-group="${group}"] [data-control="${control}"]`) !== null;
        const text = section?.textContent ?? '';
        const order = [
          'Header row',
          'Border',
          'Rows',
          'Height',
          'Distribute rows',
          'Columns',
          'Distribute columns',
          'Cell',
          'Fill',
          'Merge',
        ];
        let at = -1;
        const inOrder = order.every((w) => {
          const i = text.indexOf(w, at + 1);
          if (i < 0) return false;
          at = i;
          return true;
        });
        const generated = [
          ...(panel?.querySelectorAll(`[data-control^="block.${id}."]`) ?? []),
        ].filter(visible).length;
        return {
          sections,
          groups,
          headerRow: has('formatOptions.table.headerRow'),
          border:
            inGroup('border', 'formatOptions.table.border.weight') &&
            inGroup('border', 'formatOptions.table.border.dash'),
          height: count('formatOptions.table.height'),
          rowHeights: count('formatOptions.table.rowHeight.'),
          distributeRows: inGroup('rows', 'formatOptions.table.distributeRows'),
          distributeColumns: inGroup('columns', 'formatOptions.table.distributeColumns'),
          cellFill:
            section?.querySelector(
              '[data-group="cell"] [data-control*="fill"], [data-group="cell"] [data-control*="Fill"]',
            ) !== null,
          cellBorder: inGroup('cell', 'formatOptions.table.cell.border.weight'),
          merge: section?.querySelector('[data-group="merge"] [data-control*="erge"]') !== null,
          inOrder,
          generated,
          words: text.replace(/\s+/g, ' ').slice(0, 240),
        };
      }, T6);
      const groupsOk = same(facts.groups, ['border', 'rows', 'columns', 'cell', 'merge']);
      const ok =
        facts.sections[0] === 'table' &&
        facts.headerRow &&
        groupsOk &&
        facts.border &&
        facts.height === 1 &&
        facts.rowHeights === 0 &&
        facts.distributeRows &&
        facts.distributeColumns &&
        facts.cellFill &&
        facts.cellBorder &&
        facts.merge &&
        facts.inOrder &&
        facts.generated === 0;
      return {
        ok,
        observed: `sections ${facts.sections.join(', ')}; groups ${facts.groups.join(', ') || 'none'} (the order ${groupsOk}); Header row ${facts.headerRow}; Border ${facts.border}; Height fields ${facts.height}, per row ${facts.rowHeights}; Distribute rows ${facts.distributeRows}, Distribute columns ${facts.distributeColumns}; Cell fill ${facts.cellFill}, cell border ${facts.cellBorder}; Merge ${facts.merge}; the words in order ${facts.inOrder}; generated table fields below ${facts.generated}; reads "${facts.words}"${ok ? '' : ' (docs/archive/rounds/OBJECTS.md 3.3 item 6, B5)'}`,
      };
    },
  );
  await t.clickCard(S);
}

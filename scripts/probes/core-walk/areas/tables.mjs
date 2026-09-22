// Tables (docs/RETURN.md 2.4, section 5 `tables.*` with the driver `probe --core`): the grid
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
  /* the features round, ship one (docs/FEATURES.md 2.2, 2.3, 3.1 item 4): the table click model,
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
  'tables.cells.prompt-hovered-only',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    'the size words read 4 x 3; a 960 by 320 table with a header row lands',
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
          t.near(obj.pos.h, 320, 2) &&
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
    'the 16 rows of the default view are listed, the two merge rows among them',
    async () => {
      /* the two merge rows follow their own matrix row tables.cells.merge-unmerge, which carries
         `parks` (docs/RETURN.md section 1 rule 2): the integration re-parked them while no cell
         range existed (build/integrator.md section 2 item 7) and the fix round returned them with
         the Editor's cell range (build/b5.md "Return round fix round"), so the default view's cell
         menu has 16 rows; the switch is read for the record alone */
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

  await t.step(
    'tables.cell.align-menu',
    'with a cell session open in column 2, Format > Align & indent > Center',
    'column 2 alone reads center and the cell draws centred; Cmd+Z',
    async () => {
      const on = await openCell(T, 1, 1);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.center');
      await t.settled();
      const b = await t
        .pollUntil(
          () => block(T),
          (x) => x?.columns?.[1]?.align === 'center',
          8000,
        )
        .catch(() => block(T));
      const aligns = b?.columns?.map((c) => c.align ?? '-') ?? [];
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
      const after = (await block(T))?.columns?.map((c) => c.align ?? '-') ?? [];
      return {
        ok:
          on &&
          aligns[1] === 'center' &&
          aligns.filter((a) => a === 'center').length === 1 &&
          style?.textAlign === 'center' &&
          other?.textAlign !== 'center' &&
          after[1] !== 'center',
        observed: `session ${on}; column aligns ${aligns.join(',')}; cell 1,1 text-align ${style?.textAlign}, cell 1,0 ${other?.textAlign}; after Cmd+Z ${after.join(',')}`,
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
    "with a cell session open in column 2, the table tail's Align list, Right",
    "the list opens on the table tail and Right writes the caret's column",
    async () => {
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
          (x) => x?.columns?.[1]?.align === 'right',
          8000,
        )
        .catch(() => block(T));
      const aligns = b?.columns?.map((c) => c.align ?? '-') ?? [];
      const still = await t.editing();
      await t.clearAll();
      if (aligns[1] === 'right') await undo();
      return {
        ok:
          on &&
          tail &&
          pick !== null &&
          aligns[1] === 'right' &&
          aligns.filter((a) => a === 'right').length === 1,
        observed: `session ${on}; Align on the tail ${tail}; list options ${options.join(', ') || 'none'}; picked ${pick}; column aligns ${aligns.join(',')}; session after ${still}`,
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
  await t.advancedBack('the tables rows');
}

/**
 * The features round, ship one (docs/FEATURES.md 2.2 ranks 2, 4, 5, 8 and 13, 2.3 items 1 to 3, 7
 * and 9, 3.1 item 4; the rows `tables.cell.click-places-caret` to `tables.cells.tabular-figures`):
 * the table click model amended by FEATURES.md 2.1 (one click on a cell of an unselected table
 * places the caret; a drag from inside still moves it), the range gestures, the appends, the
 * arrows, the marks on a range, the Table section first, the P1 handles, bar and prompts, and the
 * tabular figures. Every table here is placed through the window API as a setup write (the
 * matrix's `setup` field) on two fresh slides, so each gesture meets a known table. A P1 control
 * that is not on the build reads not built with its id and B3's name (docs/PRODUCT.md 8.1); a
 * gesture on a control that exists is judged as the product does it today.
 */
async function featuresRound(t, S, h) {
  const { page } = t;
  const LANE = 'B3';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** A typed table: the header cells H1.., the body cells R<r>C<c> (0 based, the matrix's numbering). */
  const typedTable = (id, columns, rows, pos, { empty = false, header = true } = {}) => ({
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
        const td = el.closest('.td');
        return {
          bold:
            el.querySelectorAll('b, strong, [data-mark="bold"], [data-mark="strong"]').length > 0 ||
            Number(cs.fontWeight) >= 600,
          italic:
            el.querySelectorAll('i, em, [data-mark="italic"], [data-mark="em"]').length > 0 ||
            cs.fontStyle === 'italic',
          size: parseFloat(getComputedStyle(el).fontSize),
          color: cs.color,
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
      const obj = await t.placeBlock(S2, typedTable(T3, 4, 3, { x: 80, y: 420, w: 900, h: 240 }));
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
    'select the table; drag the first inner row seam by 40 px; Cmd+Z; drag the seam under the last row',
    'the readout shows px and rows[0].height is written; Cmd+Z restores; the last seam grows the table',
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
      if (last) {
        const hl = t.center(await t.handleRect(last));
        await t.drag(hl, { x: hl.x, y: hl.y + 40 * k }, { steps: 12 });
        await t.settled();
        const pos1 = await posOn(S2, T3);
        grew = pos1 && pos1.h > pos0.h + 20;
        await undoOnce();
      }
      return {
        ok: written && /px/.test(during?.readout ?? '') && same(back, before) && grew,
        observed: `row seams ${seams.join(', ')}; readout during "${during?.readout ?? 'none'}"; heights ${JSON.stringify(before)} -> ${JSON.stringify(after)} -> Cmd+Z ${JSON.stringify(back)}; the last seam grew the table ${grew}`,
      };
    },
  );

  await t.step(
    'tables.edge.add-row-column',
    'hover the right edge of the selected table at the second seam, click the "+"; the same at the bottom edge; Cmd+Z each',
    'a column is inserted with the other widths held; a row is inserted; each is one Cmd+Z',
    async () => {
      await selectTable(T3);
      const boxes = await h.cellBoxes(T3);
      const right = boxes.rows[1][boxes.rows[1].length - 1];
      await page.mouse.move(right.x + right.w - 2, right.y + right.h / 2);
      await t.sleep(500);
      const addColumn = await t.visible('handle.table.add.column');
      if (!addColumn) {
        const bottom = boxes.rows[boxes.rows.length - 1][1];
        await page.mouse.move(bottom.x + bottom.w / 2, bottom.y + bottom.h - 2);
        await t.sleep(500);
        if (!(await t.visible('handle.table.add.row')))
          return t.notBuilt(
            'handle.table.add.column',
            LANE,
            'no "+" on the right or the bottom edge of the selected table (P1, FEATURES.md 2.3 item 2)',
          );
      }
      const c0 = await countsOf(T3);
      const w0 = boxes.rows[0].map((c) => Math.round(c.w));
      await t.clickControl('handle.table.add.column');
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
      const bottom = b2.rows[b2.rows.length - 1][1];
      await page.mouse.move(bottom.x + bottom.w / 2, bottom.y + bottom.h - 2);
      await t.sleep(500);
      const addRow = await t.visible('handle.table.add.row');
      let c3 = null;
      let c4 = null;
      if (addRow) {
        await t.clickControl('handle.table.add.row');
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
      const boxes = await h.cellBoxes(T3);
      const top = boxes.rows[0][2];
      await page.mouse.move(top.x + top.w / 2, top.y - 6);
      await t.sleep(500);
      const heads = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="handle.table.head."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      if (heads.length === 0)
        return t.notBuilt(
          'handle.table.head.column',
          LANE,
          'no hover band above the columns of the selected table (P1, FEATURES.md 2.3 item 2)',
        );
      await t.clickControl('handle.table.head.column.2');
      await t.sleep(300);
      const column = await rangeRing(T3);
      const left = boxes.rows[2][0];
      await page.mouse.move(left.x - 6, left.y + left.h / 2);
      await t.sleep(500);
      await t.clickControl('handle.table.head.row.2');
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
  await t.step(
    'tables.cells.prompt-hovered-only',
    'read the prompts of the empty table with the pointer away; hover cell 2,2; read the filmstrip card',
    'no prompt until a cell is hovered, then one in that cell alone; the card draws no prompt rows',
    async () => {
      await t.clearAll();
      await page.mouse.move(20, 450);
      await t.sleep(400);
      const prompts = () =>
        page.evaluate((id) => {
          const root = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          const list = [...(root?.querySelectorAll('[data-prompt], .prompt') ?? [])].filter(
            (p) =>
              p.getClientRects().length > 0 &&
              getComputedStyle(p).visibility !== 'hidden' &&
              (p.textContent ?? '').trim().length > 0,
          );
          const byText = [...(root?.querySelectorAll('.td') ?? [])].filter((td) =>
            /Click to add text/.test(td.textContent ?? ''),
          ).length;
          return {
            count: Math.max(list.length, byText),
            cells: list.map((p) => p.closest('[data-run]')?.getAttribute('data-run') ?? '?'),
          };
        }, T4);
      const idle = await prompts();
      const p = await cellPoint(T4, 2, 2);
      await page.mouse.move(p.x, p.y);
      await t.sleep(500);
      const hovered = await prompts();
      const card = await page.evaluate((slideId) => {
        const card = document.querySelector(`[data-control="filmstrip.slide.${slideId}"]`);
        const text = card?.textContent ?? '';
        return {
          prompts: (text.match(/Click to add text/g) ?? []).length,
          kind: card?.querySelector('img')
            ? 'image'
            : card?.querySelector('.pt-slide, .ts-sheet')
              ? 'clone'
              : 'other',
        };
      }, S3);
      await page.mouse.move(20, 450);
      return {
        ok:
          idle.count === 0 &&
          hovered.count === 1 &&
          hovered.cells.every((c) => c.endsWith('/rows/2/cells/2')) &&
          card.prompts === 0,
        observed: `prompts with the pointer away ${idle.count}; hovering cell 2,2: ${hovered.count} (${hovered.cells.join(', ') || 'none'}); the filmstrip card (${card.kind}) draws ${card.prompts} prompt(s)${idle.count === 0 ? '' : ` (FEATURES.md 2.3 item 9, ${LANE})`}`,
      };
    },
  );
  await t.clickCard(S);
}

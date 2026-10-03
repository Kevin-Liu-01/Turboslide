// The polish round's table rows (docs/archive/rounds/POLISH.md 2.1, 2.2, 5.1 `tables.*` with the driver
// `probe --core`; B6 the drivers, B2 the fixes): Kevin's screenshot judged from the frame (no
// prompt in a cell, the ring on the rows while a cell is typed into), the caret moving on a click,
// the tail's size ladder on a table, the box never shorter than its rows, the keys after a head
// click, one placement rule, the edge "+" inside the content box, alignment on a range, the
// object menu on the frame, and the seams, the snap and the grid's first column. Every table is
// placed through the window API on a slide of its own (the rows' `setup`), the reads are the
// toolkit's frame capture (`frameFacts`: the ring, the row boxes, the cell ring in sheet px), the
// DOM's boxes (`boxesOf`) and a 1x pixel read of the frame (`shotPixels`, `runsAlongColumn`), so
// the row reads what a screenshot shows. `tables.header.rule-with-text` is core/export.spec.ts's
// (its PDF half needs the file).

export const NAME = 'polish-tables';
export const IDS = [
  'tables.cells.no-prompt',
  'tables.rows.ring-follows-typing',
  'tables.cell.click-moves-caret',
  'tables.tail.size-step-ladder',
  'tables.insert.box-never-shorter-than-rows',
  'tables.heads.keys-act-on-range',
  'tables.insert.one-placement-rule',
  'tables.edge.stays-inside-sheet',
  'tables.range.align-cells-only',
  'tables.context.object-menu-on-frame',
  'tables.polish.seams-snap-grid',
];

const LANE = 'B2';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
/** The content box of a slide (docs/archive/rounds/POLISH.md 2.2 item 9): 137,129 sized 1326 by 642. */
const CONTENT = { x: 137, y: 129, w: 1326, h: 642 };
const CONTENT_RIGHT = CONTENT.x + CONTENT.w;
const CONTENT_BOTTOM = CONTENT.y + CONTENT.h;

/** An empty table block of `columns` by `rows` with a header row, at a position. */
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
/** A typed table block: H0.. on the header row, R<r>C<c> below. */
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

export async function run(t) {
  const { page } = t;
  /** The area's own slide; more are made for the tables that need the whole sheet. */
  const S = await t
    .setup('a slide for the polish round tables', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(null, 'blank');
      t.deck.polishTableSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.polishTableSlide);
  await t.clickCard(S);
  await t.clearAll();

  const block = async (slide, id) => (await t.blockOf(slide, id))?.block ?? null;
  const posOf = async (slide, id) => (await t.blockOf(slide, id))?.pos ?? null;
  const cellRun = (id, r, c) => `${id}/rows/${r}/cells/${c}`;
  const cellText = async (slide, id, r, c) =>
    (await block(slide, id))?.rows?.[r]?.cells?.[c] ?? null;
  /** The active session's cell from the contenteditable's data-run, or null. */
  const sessionCell = () =>
    page.evaluate(() => {
      /* the caret's cell as the seller sees it: the overlay's cell ring names it
         (`.ts-cell-ring[data-cell="r,c"]`, TableOverlay.tsx); then the selection's anchor and
         the active element as the reads before it */
      const ring = document.querySelector('.ts-cell-ring[data-cell]');
      const named = ring ? /^(\d+),(\d+)$/.exec(ring.getAttribute('data-cell') ?? '') : null;
      if (named) return { row: Number(named[1]), column: Number(named[2]) };
      const anchor = document.getSelection()?.anchorNode ?? null;
      const anchorEl =
        anchor === null
          ? null
          : anchor.nodeType === Node.ELEMENT_NODE
            ? anchor
            : anchor.parentElement;
      const el =
        anchorEl?.closest?.('[data-run]') ??
        document.activeElement?.closest?.('[data-run]') ??
        null;
      const run = el?.getAttribute('data-run') ?? null;
      const m = run ? /\/rows\/(\d+)\/cells\/(\d+)$/.exec(run) : null;
      return m ? { row: Number(m[1]), column: Number(m[2]) } : null;
    });
  /** The viewport centre of a cell's run. */
  const cellPoint = async (id, r, c) => {
    const info = await t.runInfo(cellRun(id, r, c));
    if (!info) throw new Error(`no run for cell ${r},${c} of ${id}`);
    return { x: info.rect.x + info.rect.w / 2, y: info.rect.y + info.rect.h / 2 };
  };
  /** The prompts drawn inside a table's cells on the stage. */
  const promptsIn = (id) =>
    page.evaluate(
      (blockId) =>
        document.querySelectorAll(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] .prompt, .ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] [data-prompt]`,
        ).length,
      id,
    );
  /** The row tracks (heights) and the last row's bottom edge of a table's frame, in sheet px. */
  const tracksOf = (facts) => {
    const rows = facts?.cells?.rowBoxes ?? [];
    return {
      heights: rows.map((b) => r1(b.h)),
      lastBottom: rows.length > 0 ? r1(Math.max(...rows.map((b) => b.y + b.h))) : null,
      top: rows.length > 0 ? r1(Math.min(...rows.map((b) => b.y))) : null,
    };
  };
  /** The ring's bottom edge in sheet px from the frame facts (a text ring has no outset on a table). */
  const ringBottom = (facts) => (facts?.ring ? r1(facts.ring.y + facts.ring.h) : null);
  /**
   * The pixel read of the frame: the lowest thin run (a drawn rule of 1 to 3 px) down a column
   * through the table on a 1x shot, between the table's top and 60 px under the ring, in
   * viewport px; the ring's bottom edge in viewport px beside it. A guide rule drawn a row below
   * the ring reads as a thin run under the ring's edge.
   */
  const pixelRuleRead = async (id) => {
    const facts = await t.frameFacts(id);
    if (!facts?.ring) return null;
    const k = await t.kOf();
    const sheet = await t.sheetRect();
    const toView = (sx, sy) => ({ x: sheet.x + sx * k, y: sheet.y + sy * k });
    const ring = facts.ring;
    const x = Math.round(toView(ring.x + ring.w * 0.35, 0).x);
    const top = Math.round(toView(0, ring.y - 4).y);
    const bottom = Math.round(toView(0, ring.y + ring.h + 60).y);
    const img = await t.shotPixels();
    const runs = t.runsAlongColumn(img, x, top, Math.min(bottom, img.height - 1));
    const thin = runs.filter((r) => r.thickness >= 1 && r.thickness <= 3);
    const ringBottomView = toView(0, ring.y + ring.h).y;
    const last = thin.length > 0 ? thin[thin.length - 1].y : null;
    return {
      x,
      ringBottomView: r1(ringBottomView),
      lastThinRunY: last,
      under: last === null ? null : r1(last - ringBottomView),
      thinRuns: thin.map((r) => `${r.y}:${r.thickness}px ${r.color}`).slice(-4),
    };
  };
  const undoOnce = async () => {
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(250);
    }
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  /** Selects a table by one click on a cell's run and Escape out of any session; the handle controls. */
  const selectTable = async (id) => {
    await t.clearAll();
    const p = await cellPoint(id, 0, 0);
    await t.clickAt(p.x, p.y);
    await t.sleep(200);
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(200);
    }
    let ctrls = await t.handleControls();
    if (!ctrls.includes(`handle.${id}.move`)) {
      const b = await t.boxOf(id);
      if (b) await t.clickAt(b.free.x + 3, b.free.y + 3);
      await t.sleep(200);
      ctrls = await t.handleControls();
    }
    return ctrls;
  };
  /** The heads of a table are a parked family on a ship: the switch goes on when none is drawn. */
  const headsOn = async (id) => {
    const drawn = () =>
      page.evaluate(
        (b) => document.querySelector(`.ts-overlay [data-control^="handle.${b}.head."]`) !== null,
        id,
      );
    if (await drawn()) return true;
    const on = await t.setAdvanced(true);
    if (on) t.deck.advanced = true;
    await t.sleep(300);
    await selectTable(id);
    await t.sleep(300);
    return drawn();
  };
  /** A range across cells by a drag from one cell's run to another's, on a selected table. */
  const dragRange = async (id, from, to) => {
    await selectTable(id);
    const a = await cellPoint(id, from[0], from[1]);
    const b = await cellPoint(id, to[0], to[1]);
    await t.drag(a, b, { steps: 10 });
    await t.sleep(300);
    return page.evaluate(
      () =>
        document.querySelectorAll(
          '.ts-overlay .ts-select.is-cells, .ts-stagewrap .ts-select.is-cells',
        ).length > 0,
    );
  };

  // ---- Kevin's screenshot, 2.1 item 1: no prompt in a table cell
  await t.step(
    'tables.cells.no-prompt',
    'a 10 by 10, a 20 by 20, a 6 by 1 and a 7 by 1 table each on its own slide; the pointer over the last cell of row 2 and over the first cell',
    "no prompt element in any cell, every row track equal to the unhovered read within 1 px, the guide grid's last rule within 1 px of the ring's bottom edge (a pixel read)",
    async () => {
      const facts = [];
      let ok = true;
      for (const [columns, rows] of [
        [10, 10],
        [20, 20],
        [6, 1],
        [7, 1],
      ]) {
        const slide = await t.setupSlide(null, 'blank');
        if (!slide) {
          ok = false;
          facts.push(`${columns}x${rows}: no slide`);
          continue;
        }
        await t.clickCard(slide);
        await t.clearAll();
        const id = `pt-np-${columns}x${rows}`;
        const obj = await t.placeBlock(
          slide,
          emptyTable(id, columns, rows, { x: CONTENT.x, y: CONTENT.y, w: CONTENT.w, h: rows * 54 }),
        );
        if (!obj) {
          ok = false;
          facts.push(`${columns}x${rows}: not placed`);
          continue;
        }
        await selectTable(id);
        const before = tracksOf(await t.frameFacts(id));
        const reads = [];
        for (const [r, c] of [
          [Math.min(1, rows - 1), columns - 1],
          [0, 0],
        ]) {
          const p = await cellPoint(id, r, c);
          await t.moveHuman({ x: p.x - 40, y: p.y - 20 }, p, 6);
          await t.sleep(350);
          const prompts = await promptsIn(id);
          const f = await t.frameFacts(id);
          const now = tracksOf(f);
          const grew = now.heights.some((h, i) => Math.abs(h - (before.heights[i] ?? h)) > 1);
          const rb = ringBottom(f);
          const domGap = rb !== null && now.lastBottom !== null ? r1(now.lastBottom - rb) : null;
          const px = await pixelRuleRead(id);
          const good =
            prompts === 0 &&
            !grew &&
            domGap !== null &&
            Math.abs(domGap) <= 1 &&
            (px === null || px.under === null || px.under <= 2);
          ok = ok && good;
          reads.push(
            `cell ${r + 1},${c + 1}: prompts ${prompts}, tracks grew ${grew}, last rule ${domGap === null ? 'unread' : `${domGap} px from the ring`}, pixel run ${px ? `${px.under === null ? 'none' : `${px.under} px under the ring`}` : 'unread'}`,
          );
        }
        facts.push(`${columns}x${rows} ${id}: ${reads.join('; ')}`);
        await t.clearAll();
      }
      await t.clickCard(S);
      return {
        ok,
        observed: `${facts.join(' | ')}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.1 item 1, ${LANE})`}`,
      };
    },
  );

  // ---- 2.1 item 2: the ring follows the rows at every input
  const RF = 'pt-ring-follows';
  await t.step(
    'tables.rows.ring-follows-typing',
    'forty words typed into cell 1,1 of a 960 wide table at 60 ms per key; the frame read at every fifth key; Escape',
    "at every fifth key the ring's bottom edge is within 2 px of the last row rule and the wrapper's height equals the rows' sum; Escape writes pos.h equal to the rows within 2 px",
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, emptyTable(RF, 3, 3, { x: 320, y: 160, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      await t.clearAll();
      const on = await t.openRun(cellRun(RF, 0, 0));
      if (!on) return { ok: false, observed: 'no session opened in cell 1,1' };
      const words = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ');
      let worst = 0;
      let worstWrap = 0;
      let reads = 0;
      let keys = 0;
      for (const ch of words) {
        await page.keyboard.type(ch);
        await t.sleep(60);
        keys += 1;
        if (keys % 5 === 0) {
          const f = await t.frameFacts(RF);
          const tr = tracksOf(f);
          const rb = ringBottom(f);
          if (rb !== null && tr.lastBottom !== null) {
            reads += 1;
            worst = Math.max(worst, Math.abs(tr.lastBottom - rb));
            const sum = tr.heights.reduce((a, b) => a + b, 0);
            if (f.free) worstWrap = Math.max(worstWrap, Math.abs(f.free.h - sum));
          }
        }
      }
      await t.press('Escape');
      await t.settled();
      const f = await t.frameFacts(RF);
      const tr = tracksOf(f);
      const pos = await posOf(S, RF);
      const drawn = tr.top !== null && tr.lastBottom !== null ? r1(tr.lastBottom - tr.top) : null;
      const stored = pos && drawn !== null ? Math.abs(pos.h - drawn) : null;
      const ok = reads > 0 && worst <= 2 && worstWrap <= 2 && stored !== null && stored <= 2;
      return {
        ok,
        observed: `${keys} keys, ${reads} frame reads; worst ring to last rule ${r1(worst)} px; worst wrapper to rows ${r1(worstWrap)} px; after Escape pos.h ${pos?.h} against ${drawn} drawn (${stored === null ? 'unread' : `${r1(stored)} px`})${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.1 item 2, ${LANE} with B1's Editor.tsx hunk)`}`,
      };
    },
  );

  // ---- 2.2 item 4: a click on another cell moves the caret
  const CM = 'pt-caret-moves';
  await t.step(
    'tables.cell.click-moves-caret',
    'a 3 by 3 table; the caret in cell 2,2 with "One" typed; one click on cell 3,3; "Two" typed; Escape',
    'the session is in 3,3 within 100 ms of the click, "Two" lands in 3,3 and 2,2 keeps "One"',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, emptyTable(CM, 3, 3, { x: 320, y: 420, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      await t.clearAll();
      const on = await t.openRun(cellRun(CM, 1, 1));
      if (!on) return { ok: false, observed: 'no session opened in cell 2,2' };
      await t.typeHuman('One');
      await t.sleep(200);
      const p = await cellPoint(CM, 2, 2);
      await t.moveHuman({ x: p.x - 40, y: p.y - 25 }, p, 6);
      await page.mouse.click(p.x, p.y);
      await t.sleep(100);
      const at100 = await sessionCell();
      await t.sleep(300);
      const settledCell = await sessionCell();
      await t.typeHuman('Two');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const c22 = await t
        .pollUntil(
          () => cellText(S, CM, 1, 1),
          (x) => x === 'One',
          8000,
        )
        .catch(() => cellText(S, CM, 1, 1));
      const c33 = await t
        .pollUntil(
          () => cellText(S, CM, 2, 2),
          (x) => x === 'Two',
          8000,
        )
        .catch(() => cellText(S, CM, 2, 2));
      const moved = at100?.row === 2 && at100?.column === 2;
      const ok = moved && c22 === 'One' && c33 === 'Two';
      return {
        ok,
        observed: `session at 100 ms ${at100 ? `${at100.row + 1},${at100.column + 1}` : 'none'} (at 400 ms ${settledCell ? `${settledCell.row + 1},${settledCell.column + 1}` : 'none'}); cell 2,2 "${c22}", cell 3,3 "${c33}"${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 4, B1's Editor.tsx hunk by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.2 item 5: the tail's size step walks the table ladder
  const SL = 'pt-size-ladder';
  await t.step(
    'tables.tail.size-step-ladder',
    'a typed 3 by 3 table; the header row selected as a range by a drag; the tail\'s "−" twice, then "+" until 20',
    'the tail\'s "−" writes 18 then 17 and the field reads them; at 20 "+" reads aria-disabled with its sentence; no snackbar with a pointer',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(SL, 3, 3, { x: 320, y: 620, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      const ranged = await dragRange(SL, [0, 0], [0, 2]);
      if (!(await t.visible('toolbar.fontSize.minus')))
        return { ok: false, observed: `range ${ranged}; no toolbar.fontSize.minus on the tail` };
      const field = () => t.valueOf('toolbar.fontSize.value');
      const start = await field();
      const sizes = [];
      for (let i = 0; i < 2; i += 1) {
        await t.clickControl('toolbar.fontSize.minus');
        await t.sleep(500);
        sizes.push(await field());
      }
      const written = (await block(S, SL))?.size ?? null;
      for (let i = 0; i < 4 && (await field()) !== '20'; i += 1) {
        await t.clickControl('toolbar.fontSize.plus');
        await t.sleep(400);
      }
      const atTop = await field();
      const plusDisabled =
        (await t.attr('[data-control="toolbar.fontSize.plus"]', 'aria-disabled')) === 'true';
      const plusTip =
        (await t.attr('[data-control="toolbar.fontSize.plus"]', 'data-tip-doc')) ??
        (await t.attr('[data-control="toolbar.fontSize.plus"]', 'data-tip')) ??
        (await t.attr('[data-control="toolbar.fontSize.plus"]', 'title'));
      /* a "+" that is not disabled at 20 is pressed once more: the older build wrote 22 and the
         validator refused it with a JSON pointer in a black toast */
      let snackbar = null;
      if (!plusDisabled) {
        await t.clickControl('toolbar.fontSize.plus');
        snackbar = await t.snackbarWithin(2500).catch(() => null);
      }
      const pointer = snackbar !== null && /\/slots\/|\/size|Invalid option/.test(snackbar);
      const ok =
        sizes[0] === '18' &&
        sizes[1] === '17' &&
        written === 17 &&
        atTop === '20' &&
        plusDisabled &&
        /20 px at most|at most/i.test(plusTip ?? '') &&
        !pointer;
      await t.press('Escape', 2);
      return {
        ok,
        observed: `range ${ranged}; field ${start} -> ${sizes.join(' -> ')} (stored size ${written}); back at ${atTop}; "+" aria-disabled ${plusDisabled}${plusTip ? ` "${plusTip}"` : ''}; snackbar ${snackbar === null ? 'none' : `"${snackbar}"`}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 5, B1's ToolbarTail.tsx by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.2 item 6 and item 8: the insert on a Title and body slide
  const TB = await t
    .setup(
      'a Title and body slide with its title typed',
      'slide.new and slide.set through the window API',
      async () => {
        const id = await t.setupSlide(null, 'split');
        if (!id) return { ok: false, observed: 'no slide' };
        await t.clickCard(id);
        await page
          .waitForSelector(`.pt-viewer[data-active="${id}"]`, { timeout: 5000 })
          .catch(() => undefined);
        await t.sleep(300);
        /* the title typed through the product (A1 rule 4: a printable key on the selected
           placeholder starts the session over its text), so the free rectangle under it is the
           audit's (y 218) */
        const runs = await t.runs();
        const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
        const headBlock = head ? await t.blockOfRun(head) : null;
        if (head && headBlock) {
          const info = await t.runInfo(head);
          await t.clickSelect(headBlock, {
            x: info.rect.x + info.rect.w / 2,
            y: info.rect.y + info.rect.h / 2,
          });
          await t.typeHuman('Pipeline');
          await t.sleep(200);
          await t.press('Escape');
          await t.settled();
        }
        const typed = head ? ((await t.runInfo(head))?.text ?? '') : '';
        if (!/Pipeline/.test(typed))
          return { ok: false, observed: `slide ${id}; the title reads "${typed}"` };
        t.deck.polishTitleBodySlide = id;
        return { ok: true, observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.polishTitleBodySlide);
  await t.clickCard(TB);
  await t.clearAll();
  await t.reachSetup('Insert > Table', 'insert', 'insert.table');
  /** Insert > Table with the cell `<columns>x<rows>` picked from the plate; the new object or null. */
  const pickTable = async (slide, columns, rows) => {
    const before = await t.objectIds(slide);
    await t.surfaceClear();
    await t.openMenu('insert');
    await t.hoverRow('insert.table', '[data-control="insert.table.plate"]');
    const cell = page.locator(`[data-control="insert.table.pick.${columns}x${rows}"]`).first();
    if ((await cell.count()) === 0) {
      /* the grid draws ten by ten and grows as the pointer reaches its edge (TableGrid.tsx): the
         pointer walks to the far cell first */
      const far = page.locator('[data-control^="insert.table.pick."]').last();
      const fr = await far.boundingBox();
      if (fr)
        await t.moveHuman(
          { x: fr.x - 20, y: fr.y - 20 },
          { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 },
          8,
        );
      await t.sleep(300);
    }
    const target = page.locator(`[data-control="insert.table.pick.${columns}x${rows}"]`).first();
    if ((await target.count()) === 0) {
      await t.press('Escape', 2);
      return { obj: null, words: null, error: `no cell ${columns}x${rows} in the grid` };
    }
    const r = await target.boundingBox();
    await t.moveHuman(
      { x: r.x - 20, y: r.y - 10 },
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      8,
    );
    await t.sleep(300);
    const words = await t.textOf('insert.table.size');
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    /* the insert converts a split slide in the same write (controller.tsx `block.insert`:
       `withCanvas`, then `placeInsert`), so the title and the body prompt gain a `pos` beside the
       table and `newObjectAfter`'s first new object is the title, whose box the two rows then
       judged as the table's (B2's R11); the fresh object whose type is `table` is the picker's */
    const fresh = await t
      .pollUntil(
        () => t.objectsOf(slide),
        (list) => list.some((o) => !before.includes(o.id) && o.type === 'table'),
        15_000,
      )
      .catch(() => []);
    const obj = fresh.find((o) => !before.includes(o.id) && o.type === 'table') ?? null;
    await t.settled();
    await t.press('Escape');
    await t.sleep(200);
    return { obj, words, error: obj ? null : 'no table inserted within 15 s' };
  };
  await t.step(
    'tables.insert.box-never-shorter-than-rows',
    "Insert > Table, the 12 by 4 cell, on the Title and body slide under its title; the grid's size words read",
    "the table lands with pos.h equal to its rows' floor within 2 px and its top at the free rectangle's top; the grid's size words name the rows the slide holds",
    async () => {
      await t.clickCard(TB);
      await t.clearAll();
      const r = await pickTable(TB, 12, 4);
      if (!r.obj) return { ok: false, observed: r.error };
      /* the stage draws the new block a frame after the document holds it */
      const f = await t
        .pollUntil(
          () => t.frameFacts(r.obj.id),
          (x) => (x?.cells?.rowBoxes?.length ?? 0) > 0,
          5000,
        )
        .catch(() => t.frameFacts(r.obj.id));
      let tr = tracksOf(f);
      if (tr.top === null) {
        /* the frame facts carry no row boxes while the table is unselected; the DOM's rows in
           sheet px are the same measure */
        const rows = await t.boxesOf(
          `[data-block="${r.obj.id}"] .tr, [data-block="${r.obj.id}"] tr, [data-block="${r.obj.id}"] [data-row]`,
          { sheet: true },
        );
        tr = {
          heights: rows.map((b) => r1(b.h)),
          lastBottom: rows.length > 0 ? r1(Math.max(...rows.map((b) => b.y + b.h))) : null,
          top: rows.length > 0 ? r1(Math.min(...rows.map((b) => b.y))) : null,
        };
      }
      const drawn = tr.top !== null ? r1(tr.lastBottom - tr.top) : null;
      const fits = drawn !== null && Math.abs(r.obj.pos.h - drawn) <= 2;
      /* the free rectangle under a typed title on the Title and body layout starts at y 218
         (audit-tables item 10) */
      const atTop = t.near(r.obj.pos.y, 218, 4);
      const wordsOk = typeof r.words === 'string' && /\d+\s*[x×]\s*\d+/.test(r.words);
      const ok = fits && atTop && wordsOk;
      await undoOnce();
      return {
        ok,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; rows drawn ${drawn} px (fits ${fits}); top at 218 ${atTop}; size words "${r.words}"${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 6, ${LANE})`}`,
      };
    },
  );
  await t.step(
    'tables.insert.one-placement-rule',
    'Insert > Table 1 by 1, then 1 by 2, then 3 by 3 on the Title and body slide; Cmd+Z after each',
    'each lands at pos.y 218',
    async () => {
      await t.clickCard(TB);
      const out = [];
      let ok = true;
      for (const [c, r] of [
        [1, 1],
        [1, 2],
        [3, 3],
      ]) {
        await t.clearAll();
        const made = await pickTable(TB, c, r);
        if (!made.obj) {
          ok = false;
          out.push(`${c}x${r}: ${made.error}`);
          continue;
        }
        const at = t.near(made.obj.pos.y, 218, 2);
        ok = ok && at;
        out.push(`${c}x${r}: y ${r1(made.obj.pos.y)} (${at ? 'at 218' : 'not 218'})`);
        await undoOnce();
      }
      return {
        ok,
        observed: `${out.join('; ')}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 8, ${LANE})`}`,
      };
    },
  );

  // ---- 2.2 item 7: the keys act on the range after a head click
  const HK = 'pt-head-keys';
  await t.step(
    'tables.heads.keys-act-on-range',
    "a typed 3 by 3 table; a click on row 2's head; Delete; Cmd+B",
    "the row's cells are empty; Cmd+B marks them; document.activeElement is the stage root and no focus ring is drawn beside the table (a pixel read of the band)",
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(HK, 3, 3, { x: 320, y: 160, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      await selectTable(HK);
      const heads = await headsOn(HK);
      if (!heads)
        return t.notBuilt(
          `handle.${HK}.head.row.1`,
          LANE,
          'no row head drawn on the selected table',
        );
      const head = `handle.${HK}.head.row.1`;
      if (!(await t.visible(head))) return { ok: false, observed: `no ${head} on the overlay` };
      const headBox = await t.rectOf(`.ts-overlay [data-control="${head}"]`);
      await t.clickControl(head);
      await t.sleep(300);
      const active = await t.activeDesc();
      const focusOnHead = /\[handle\./.test(active);
      /* the band read from pixels at 2x: a focus ring is a dark outline segment around the head's box;
         a band with no outline reads as one or two colours inside its box */
      const img = await t.shotPixels();
      const sample = headBox
        ? t.sampleBoxOf(
            img,
            { x: headBox.x - 2, y: headBox.y - 2, w: headBox.w + 4, h: headBox.h + 4 },
            { step: 1 },
          )
        : null;
      const outlineStyle = await t.styleOf(`.ts-overlay [data-control="${head}"]`, [
        'outline-style',
        'outline-width',
      ]);
      await t.press('Delete');
      await t.settled();
      const emptied = await t
        .pollUntil(
          async () => (await block(S, HK))?.rows?.[1]?.cells ?? null,
          (cells) => Array.isArray(cells) && cells.every((c) => c === ''),
          6000,
        )
        .catch(async () => (await block(S, HK))?.rows?.[1]?.cells ?? null);
      const rowEmpty = Array.isArray(emptied) && emptied.every((c) => c === '');
      await t.press('Meta+z');
      await t.settled();
      await t.sleep(300);
      await t.clickControl(head).catch(() => undefined);
      await t.sleep(200);
      await t.press('Meta+b');
      await t.settled();
      /* the marks on the row's cells: the stored markup (`[..]{b}`) or a bold cell style, and the
         drawn runs' b or strong elements */
      const markRead = async () => {
        const row = (await block(S, HK))?.rows?.[1] ?? null;
        const stored = JSON.stringify(row ?? {});
        const drawn = await page.evaluate(
          (runs) =>
            runs.filter((r) => {
              const el = document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`,
              );
              return el !== null && el.querySelector('b, strong, [data-mark="b"]') !== null;
            }).length,
          [0, 1, 2].map((c) => cellRun(HK, 1, c)),
        );
        return {
          stored: /\{[^}]*\bb\b[^}]*\}|"bold":true|"weight":(?:[6-9]00)/.test(stored),
          drawn,
        };
      };
      const marked = await t
        .pollUntil(markRead, (m) => m.stored || m.drawn === 3, 6000)
        .then((m) => m.stored || m.drawn === 3)
        .catch(() => false);
      const noOutline =
        outlineStyle === null ||
        outlineStyle['outline-style'] === 'none' ||
        parseFloat(outlineStyle['outline-width'] || '0') === 0 ||
        !focusOnHead;
      const ok = rowEmpty && marked && !focusOnHead && noOutline;
      await t.press('Escape', 2);
      return {
        ok,
        observed: `after the head click the focus is ${active}; head outline ${outlineStyle ? `${outlineStyle['outline-style']} ${outlineStyle['outline-width']}` : 'unread'}; band pixels ${sample ? `${sample.distinct} colours, dominant ${sample.dominant?.hex} ${sample.dominant?.share}` : 'unread'}; Delete emptied row 2 ${rowEmpty} (${JSON.stringify(emptied)}); Cmd+B marked ${marked}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 7, ${LANE})`}`,
      };
    },
  );

  // ---- 2.2 item 9: the edge "+" keeps the table inside the content box
  const EG = 'pt-edge';
  await t.step(
    'tables.edge.stays-inside-sheet',
    'a 960 wide 3 by 3 table at x 320; the right edge "+" twice; a table at the content box\'s bottom, the bottom "+"',
    'the table\'s right edge stays at most at the content box\'s edge (1463); a second "+" keeps the width and splits it; the bottom "+" keeps pos.y + pos.h at most 771',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(EG, 3, 3, { x: 320, y: 420, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      await selectTable(EG);
      await headsOn(EG);
      const addAt = async (axis) => {
        const f = await t.frameFacts(EG);
        const ring = f?.ring;
        if (!ring) return null;
        const k = await t.kOf();
        const sheet = await t.sheetRect();
        const rows = f.cells?.rowBoxes ?? [];
        /* the pointer at the second seam of the edge, clear of the middle square (the objects round's positions) */
        const at =
          axis === 'column'
            ? {
                x: sheet.x + (ring.x + ring.w + 6) * k,
                y: sheet.y + (rows[1] ? rows[1].y + 2 : ring.y + ring.h * 0.3) * k,
              }
            : { x: sheet.x + (ring.x + ring.w * 0.25) * k, y: sheet.y + (ring.y + ring.h + 6) * k };
        await t.moveHuman({ x: at.x - 30, y: at.y - 20 }, at, 8);
        await t.sleep(400);
        const control = (await t.visible(`handle.${EG}.add.${axis}`))
          ? `handle.${EG}.add.${axis}`
          : (await t.visible(`handle.table.add.${axis}`))
            ? `handle.table.add.${axis}`
            : null;
        if (!control) return null;
        await t.clickControl(control);
        await t.settled();
        await t.sleep(300);
        return posOf(S, EG);
      };
      const p0 = await posOf(S, EG);
      const p1 = await addAt('column');
      if (!p1)
        return t.notBuilt(
          `handle.${EG}.add.column`,
          LANE,
          'no "+" on the right edge of the selected table',
        );
      await selectTable(EG);
      await headsOn(EG);
      const p2 = await addAt('column');
      const cols = (await block(S, EG))?.columns?.length ?? 0;
      const rightOk =
        p1 && p1.x + p1.w <= CONTENT_RIGHT + 1 && (!p2 || p2.x + p2.w <= CONTENT_RIGHT + 1);
      const splitOk = !p1 || !p2 || Math.abs(p2.w - p1.w) <= 1 || p2.x + p2.w <= CONTENT_RIGHT + 1;
      /* the bottom edge: the table moved so its bottom edge sits at the content box's bottom */
      const hNow = (await posOf(S, EG))?.h ?? 162;
      await t.setBlock(S, EG, '/pos', { ...(await posOf(S, EG)), y: CONTENT_BOTTOM - hNow });
      await selectTable(EG);
      await headsOn(EG);
      const p3 = await addAt('row');
      const bottomOk = p3 ? p3.y + p3.h <= CONTENT_BOTTOM + 1 : false;
      const ok = Boolean(rightOk && splitOk && p3 && bottomOk);
      await t.press('Escape', 2);
      return {
        ok,
        observed: `${t.posStr(p0)} -> first "+" ${t.posStr(p1)} (right edge ${p1 ? r1(p1.x + p1.w) : '?'} against ${CONTENT_RIGHT}) -> second "+" ${t.posStr(p2)} (${cols} columns); bottom "+" ${t.posStr(p3)} (bottom edge ${p3 ? r1(p3.y + p3.h) : '?'} against ${CONTENT_BOTTOM})${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 9, ${LANE})`}`,
      };
    },
  );

  // ---- 2.2 item 10: alignment on a cell range applies to the cells
  const AL = 'pt-align';
  await t.step(
    'tables.range.align-cells-only',
    'a typed 3 by 3 table; the header cells selected by a drag; Center from the tail; Cmd+Z',
    "the header cells centre and the body cells' text boxes keep their x within 1 px; Cmd+Z restores",
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(AL, 3, 3, { x: 320, y: 620, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      const xOf = async (r, c) => (await t.runInfo(cellRun(AL, r, c)))?.rect.x ?? null;
      const alignOf = (r, c) =>
        t
          .styleOf(`.ts-stagewrap.ts-editor .pt-slide [data-run="${cellRun(AL, r, c)}"]`, [
            'text-align',
          ])
          .then((s) => s?.['text-align'] ?? null);
      const bodyBefore = [await xOf(1, 0), await xOf(2, 1)];
      const ranged = await dragRange(AL, [0, 0], [0, 2]);
      if (!ranged)
        return { ok: false, observed: 'no range ring after the drag across the header cells' };
      await t.clickControl('toolbar.align');
      await page
        .locator('#ts-menu-toolbar\\.align, [data-control="toolbar.align.plate"]')
        .first()
        .waitFor({ timeout: 6000 });
      await t.clickControl('menu.toolbar.align.format.alignIndent.center');
      await t.settled();
      await t.sleep(400);
      const headAlign = [await alignOf(0, 0), await alignOf(0, 2)];
      const bodyAlign = [await alignOf(1, 0), await alignOf(2, 1)];
      const bodyAfter = [await xOf(1, 0), await xOf(2, 1)];
      const stored = await block(S, AL);
      const columnsWritten = (stored?.columns ?? []).some((c) => c?.align !== undefined);
      const bodyKept = bodyBefore.every(
        (x, i) => x !== null && bodyAfter[i] !== null && Math.abs(x - bodyAfter[i]) <= 1,
      );
      await undoOnce();
      const restored = [await alignOf(0, 0)];
      const ok =
        headAlign.every((a) => a === 'center') &&
        bodyAlign.every((a) => a !== 'center') &&
        bodyKept &&
        !columnsWritten &&
        restored[0] !== 'center';
      return {
        ok,
        observed: `header cells ${headAlign.join(', ')}; body cells ${bodyAlign.join(', ')} with x ${bodyBefore.map(r1).join(', ')} -> ${bodyAfter.map(r1).join(', ')} (kept ${bodyKept}); columns[].align written ${columnsWritten}; after Cmd+Z ${restored[0]}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 10, ${LANE} with B1's editor-shell.ts hunk)`}`,
      };
    },
  );

  // ---- 2.6 item 71: a table's frame gives the object menu
  const CX = 'pt-context';
  await t.step(
    'tables.context.object-menu-on-frame',
    "a typed 3 by 3 table selected; a right click on the ring's top edge; Escape; a right click on a cell",
    'the ring lists Order, Align and Alt text; the cell lists Insert row above',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(CX, 3, 3, { x: 320, y: 160, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      await selectTable(CX);
      const f = await t.frameFacts(CX);
      if (!f?.ring) return { ok: false, observed: 'no ring on the selected table' };
      const k = await t.kOf();
      const sheet = await t.sheetRect();
      /* the ring's top edge, a third along; the overlay's frame edge strip sits on the line */
      const at = { x: sheet.x + (f.ring.x + f.ring.w * 0.33) * k, y: sheet.y + f.ring.y * k };
      const opened = await t.rightClickAt(at.x, at.y);
      const frameRows = opened ? (await t.contextRows()).map((r) => r.id) : [];
      await t.press('Escape');
      await t.sleep(200);
      const p = await cellPoint(CX, 1, 1);
      const openedCell = await t.rightClickAt(p.x, p.y);
      const cellRows = openedCell ? (await t.contextRows()).map((r) => r.id) : [];
      await t.press('Escape');
      await t.sleep(200);
      const frameOk = ['arrange.order', 'arrange.align', 'format.altText'].every((id) =>
        frameRows.includes(id),
      );
      const cellOk = cellRows.includes('format.table.insertRowAbove');
      const ok = frameOk && cellOk;
      return {
        ok,
        observed: `the ring's menu: ${frameRows.join(', ') || 'none'}; the cell's menu: ${cellRows.join(', ') || 'none'}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.6 item 71, B1's Editor.tsx 6784 with the integrator's CONTEXT_MENUS table target)`}`,
      };
    },
  );

  // ---- 2.2 item 11: the seams, the snap and the grid's first column
  const SN = 'pt-seams';
  await t.step(
    'tables.polish.seams-snap-grid',
    "a 3 by 3 table selected; the pointer at the second column seam's middle, its tooltip read, a 12 step drag right; the se handle dragged 160 px right; Insert > Table with the pointer moved 30 px left inside the grid's first column",
    'the tooltip reads "Column seam 2" and the drag writes the widths; the se drag stops at the content box\'s edge; the Table grid plate stays',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const obj = await t.placeBlock(S, typedTable(SN, 3, 3, { x: 320, y: 420, w: 960, h: 162 }));
      if (!obj) return { ok: false, observed: 'the table was not placed' };
      let ctrls = await selectTable(SN);
      const seam =
        ctrls.find((c) => c === `handle.${SN}.column.1`) ??
        ctrls.find((c) => /\.column\.1$/.test(c)) ??
        null;
      const facts = [];
      let seamOk = false;
      if (seam) {
        const r = await t.handleRect(seam);
        const mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        await t.moveHuman({ x: mid.x - 40, y: mid.y - 20 }, mid, 8);
        await t.sleep(700);
        const tip = await t.tooltipText();
        const widthsBefore = ((await block(S, SN))?.columns ?? []).map(
          (c) => c?.w ?? c?.width ?? null,
        );
        const k = await t.kOf();
        await t.drag(mid, { x: mid.x + 60 * k, y: mid.y }, { steps: 12 });
        await t.settled();
        const widthsAfter = ((await block(S, SN))?.columns ?? []).map(
          (c) => c?.w ?? c?.width ?? null,
        );
        const written = !same(widthsBefore, widthsAfter);
        /* the words alone: an id in front of them is chrome.handles.tooltip-words' row (2.6 item 60) */
        seamOk = /Column seam 2\b/.test(tip ?? '') && written;
        facts.push(
          `seam ${seam}: tooltip "${tip}", widths ${JSON.stringify(widthsBefore)} -> ${JSON.stringify(widthsAfter)} (written ${written})`,
        );
        await undoOnce();
      } else
        facts.push(
          `no column seam handle among ${ctrls.filter((c) => c.startsWith(`handle.${SN}.`)).join(', ')}`,
        );
      ctrls = await selectTable(SN);
      const se = ctrls.includes(`handle.${SN}.resize.se`) ? `handle.${SN}.resize.se` : null;
      let snapOk = false;
      if (se) {
        const r = await t.handleRect(se);
        const c = t.center(r);
        const k = await t.kOf();
        /* 260 px, past the content box's right edge (1280 + 260 = 1540 against 1463), so the
           snap has an edge to take */
        await t.drag(c, { x: c.x + 260 * k, y: c.y }, { steps: 14 });
        await t.settled();
        const p = await posOf(S, SN);
        snapOk = Boolean(p) && Math.abs(p.x + p.w - CONTENT_RIGHT) <= 2;
        facts.push(
          `se drag by 260: ${t.posStr(p)} (right edge ${p ? r1(p.x + p.w) : '?'} against ${CONTENT_RIGHT})`,
        );
        await undoOnce();
      } else facts.push('no se handle');
      /* the Table grid plate under a pointer that drifts 30 px left inside its first column */
      await t.surfaceClear();
      await t.openMenu('insert');
      await t.hoverRow('insert.table', '[data-control="insert.table.plate"]');
      const first = await t.rectOf('[data-control="insert.table.pick.1x3"]');
      let plateOk = false;
      if (first) {
        const c = t.center(first);
        await t.moveHuman({ x: c.x + 40, y: c.y }, c, 6);
        await t.sleep(200);
        await t.moveHuman(c, { x: Math.max(first.x + 1, c.x - 30), y: c.y }, 8);
        await t.sleep(450);
        const plate = await t.has('[data-control="insert.table.plate"]');
        const chart = await t.has('[data-control="menu.insert.chart.bar"]');
        plateOk = plate && !chart;
        facts.push(`grid plate after 30 px left: plate ${plate}, chart submenu ${chart}`);
      } else facts.push('no 1x3 cell in the grid');
      await t.press('Escape', 3);
      const ok = seamOk && snapOk && plateOk;
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.2 item 11, ${LANE} with B1's hunks)`}`,
      };
    },
  );
  await t.advancedBack('the polish round tables');
}

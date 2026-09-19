// Lines, the minimal set (docs/FOCUS.md 2.6, section 4, 6.4 `lines.*` with the driver
// `probe --core`): Line and Arrow drawn by a drag from Insert > Line and from the toolbar Line
// button, the end handle, the line tail's colour, weight, dash and ends, and the right click
// menu with Line end > Arrow.

/**
 * The stored fields of a line's two ends: `line.set { start, end }` writes `lineStart` and
 * `lineEnd` on the block (b3.md 7.1); the walk reads either spelling so the row judges the
 * head, not the field's name.
 */
const START_FIELD = /"(?:lineStart|start)"/;
const END_FIELD = /"(?:lineEnd|end)"/;
const END_ARROW = /"(?:lineEnd|end)":\s*"[a-zA-Z]*[Aa]rrow/;

export const NAME = 'lines';
export const IDS = [
  'lines.insert.line-drag',
  'lines.insert.arrow-drag',
  'lines.end-handle',
  'lines.tail.colour-weight-dash-ends',
  'lines.context.line',
  'lines.connector.elbow',
  'lines.connector.curved',
  'lines.connector.re-end',
  'lines.insert.arrow-head',
  'lines.tail.line-start-end-menu',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page } = t;
  const S = await t
    .setup('a slide for the lines', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.shapeSlide ?? t.deck.titleSlide, 'blank');
      t.deck.lineSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.lineSlide);
  await t.clickCard(S);
  await t.clearAll();

  /** The line's svg facts on the stage: the line element, its ends and its stroke. */
  const lineFacts = (id) =>
    page.evaluate((blockId) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
      const el = svg?.querySelector('line, path, polyline');
      if (!svg || !el) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        stroke: cs.stroke,
        strokeWidth: cs.strokeWidth,
        dash: cs.strokeDasharray,
        markerEnd: el.getAttribute('marker-end') ?? cs.markerEnd ?? '',
        markerStart: el.getAttribute('marker-start') ?? cs.markerStart ?? '',
        markers: svg.querySelectorAll('marker').length,
        paths: svg.querySelectorAll('path, line, polygon').length,
      };
    }, id);
  const blockOf = async (id) => (await t.blockOf(S, id))?.block ?? null;

  let line = null;
  let arrow = null;
  await t.step(
    'lines.insert.line-drag',
    'Insert > Line > Line drawn by a drag, then the toolbar Line button the same way',
    'a line lands each time along the drag',
    async () => {
      const menu = await t.insertByTool(
        S,
        ['insert.line', 'insert.line.line'],
        { x: 200, y: 200 },
        { x: 600, y: 320 },
        { text: null },
      );
      await t.press('Escape');
      await t.settled();
      line = menu.obj;
      const before = await t.objectIds(S);
      let toolbar = null;
      if (await t.visible('toolbar.insertLine')) {
        await t.clickControl('toolbar.insertLine');
        await t.sleep(300);
        const p = await t.sheetPoint(200, 500);
        const q = await t.sheetPoint(600, 620);
        await t.drag(p, q);
        toolbar = await t.newObjectAfter(S, before, 12_000);
        await t.press('Escape');
        await t.settled();
      }
      const spans = (o) => o && t.near(o.pos.x, 200, 16) && t.near(o.pos.w, 400, 24);
      const ok =
        spans(line) &&
        spans(toolbar) &&
        (line.type === 'line' || /line/.test(JSON.stringify(line.block)));
      if (toolbar) {
        await t.selectObject(toolbar.id);
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok,
        observed: `menu: ${line ? `${line.type} ${line.id} ${t.posStr(line.pos)}` : `nothing (${menu.error})`}; toolbar: ${toolbar ? `${toolbar.type} ${toolbar.id} ${t.posStr(toolbar.pos)}` : 'nothing'}`,
      };
    },
  );
  await t.step(
    'lines.insert.arrow-drag',
    'Insert > Line > Arrow drawn by a drag',
    'the line ends in an arrow head',
    async () => {
      const r = await t.insertByTool(
        S,
        ['insert.line', 'insert.line.arrow'],
        { x: 800, y: 200 },
        { x: 1300, y: 320 },
        { text: null },
      );
      await t.press('Escape');
      await t.settled();
      arrow = r.obj;
      const facts = arrow ? await lineFacts(arrow.id) : null;
      const blk = arrow ? await blockOf(arrow.id) : null;
      const head =
        Boolean(facts) &&
        ((facts.markerEnd !== '' && facts.markerEnd !== 'none') ||
          facts.markers > 0 ||
          facts.paths > 1);
      const stored = blk ? /arrow/i.test(JSON.stringify(blk)) : false;
      return {
        ok: Boolean(arrow) && head && stored,
        observed: arrow
          ? `${arrow.id} ${t.posStr(arrow.pos)}; marker-end ${facts?.markerEnd}; markers ${facts?.markers}; drawn parts ${facts?.paths}; stored ${JSON.stringify(blk).slice(0, 120)}`
          : `nothing inserted: ${r.error}`,
      };
    },
  );
  if (!line) throw new (await import('../toolkit.mjs')).SetupFailed('a line to drive');
  const id = line.id;
  const pos = async () => (await t.blockOf(S, id))?.pos ?? null;
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  await t.step(
    'lines.end-handle',
    'drag the end handle of the line by 80 by 40 px',
    'the end moves and the start holds',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(id);
      const endCtl =
        ctrls?.find((c) => c === `handle.${id}.end`) ?? ctrls?.find((c) => c.endsWith('.end'));
      const startCtl =
        ctrls?.find((c) => c === `handle.${id}.start`) ?? ctrls?.find((c) => c.endsWith('.start'));
      if (!endCtl)
        return { ok: false, observed: `no end handle (handles ${ctrls?.join(',') ?? 'none'})` };
      const k = await t.kOf();
      const before = await pos();
      const startBefore = startCtl ? t.center(await t.handleRect(startCtl)) : null;
      const h = await t.handleRect(endCtl);
      const from = t.center(h);
      await t.drag(from, { x: from.x + 80 * k, y: from.y + 40 * k });
      const after = await t.pollUntil(pos, (p) => p && !same(p, before), 10_000);
      await t.settled();
      const startAfter = startCtl ? t.center(await t.handleRect(startCtl)) : null;
      const startHeld =
        startBefore && startAfter
          ? t.near(startBefore.x, startAfter.x, 3) && t.near(startBefore.y, startAfter.y, 3)
          : true;
      const grew = t.near(after.w - before.w, 80, 12) || t.near(after.h - before.h, 40, 12);
      await undo();
      return {
        ok: grew && startHeld,
        observed: `pos ${t.posStr(before)} -> ${t.posStr(after)}; start held ${startHeld}`,
      };
    },
  );
  await t.step(
    'lines.tail.colour-weight-dash-ends',
    "the line toolbar's Line color, Line weight, Line dash, Line start and Line end; Undo",
    'each applies and Undo takes them back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await lineFacts(id);
      const blk0 = JSON.stringify(await blockOf(id));
      const facts = [];
      let steps = 0;
      await t.tailControl('toolbar.lineColor');
      await t.waitControl('toolbar.lineColor.plate', 5000);
      await t.clickControl('toolbar.lineColor.red');
      await t.settled();
      const colour = await t.pollUntil(
        () => lineFacts(id),
        (f) => f && f.stroke !== before.stroke,
        8000,
      );
      facts.push(`colour ${before.stroke} -> ${colour.stroke}`);
      steps += 1;
      await t.selectObject(id);
      await t.tailControl('toolbar.lineWeight');
      /* the weight control is the tail's `list` kind: a Menu `#ts-menu-toolbar.lineWeight` with rows
         `toolbar.lineWeight.weight-<n>`, not an AnchoredPlate (b3 C2-R3) */
      await page
        .locator('[data-control^="toolbar.lineWeight.weight-"], #ts-menu-toolbar\\.lineWeight')
        .first()
        .waitFor({ timeout: 5000 });
      const weights = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control^="toolbar.lineWeight."], [data-control^="menu.toolbar.lineWeight."]',
          ),
        ]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => /weight-[\d.]+$/.test(c) || /\.\d+(\.\d+)?$/.test(c)),
      );
      const pick = weights.find((c) => /weight-2$|\.4$/.test(c)) ?? weights[weights.length - 1];
      if (pick) await t.clickControl(pick);
      await t.settled();
      const weight = await t.pollUntil(
        () => lineFacts(id),
        (f) => f && f.strokeWidth !== colour.strokeWidth,
        8000,
      );
      facts.push(`weight ${colour.strokeWidth} -> ${weight.strokeWidth} (${pick})`);
      steps += 1;
      await t.selectObject(id);
      await t.tailControl('toolbar.lineDash');
      await t.sleep(400);
      const dashes = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control*="lineDash.pick."], [data-control^="dash.pick."]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const dashPick =
        dashes.find((c) => /\.dash(ed)?$/i.test(c)) ?? dashes.find((c) => !/solid|none/i.test(c));
      if (dashPick) await t.clickControl(dashPick);
      await t.settled();
      const dash = await t.pollUntil(
        () => lineFacts(id),
        (f) => f && f.dash !== weight.dash,
        8000,
      );
      facts.push(`dash ${weight.dash} -> ${dash.dash} (${dashPick})`);
      steps += 1;
      await t.selectObject(id);
      await t.tailControl('toolbar.lineStart');
      await t.sleep(400);
      const starts = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control*="lineStart.pick."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const startPick =
        starts.find((c) => /openCircle|circle/i.test(c)) ?? starts.find((c) => !/none$/.test(c));
      if (startPick) await t.clickControl(startPick);
      await t.settled();
      const b1 = await t.pollUntil(
        async () => JSON.stringify(await blockOf(id)),
        (j) => START_FIELD.test(j),
        8000,
      );
      facts.push(`start ${START_FIELD.test(b1)} (${startPick})`);
      steps += 1;
      await t.selectObject(id);
      await t.tailControl('toolbar.lineEnd');
      await t.sleep(400);
      const ends = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control*="lineEnd.pick."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const endPick = ends.find((c) => /fillArrow/.test(c)) ?? ends.find((c) => /arrow/i.test(c));
      if (endPick) await t.clickControl(endPick);
      await t.settled();
      const b2 = await t.pollUntil(
        async () => JSON.stringify(await blockOf(id)),
        (j) => END_FIELD.test(j),
        8000,
      );
      const drawn = await lineFacts(id);
      facts.push(`end ${END_FIELD.test(b2)} (${endPick}); marker-end ${drawn?.markerEnd}`);
      steps += 1;
      await t.clearAll();
      for (let i = 0; i < steps; i += 1) await undo();
      const back = await lineFacts(id);
      const blkBack = JSON.stringify(await blockOf(id));
      facts.push(
        `after ${steps} undos stroke ${back.stroke} ${back.strokeWidth} dash ${back.dash}, block restored ${blkBack === blk0}`,
      );
      const ok =
        colour.stroke !== before.stroke &&
        weight.strokeWidth !== colour.strokeWidth &&
        dash.dash !== weight.dash &&
        START_FIELD.test(b1) &&
        END_FIELD.test(b2) &&
        blkBack === blk0;
      return { ok, observed: facts.join('; ') };
    },
  );
  await t.step(
    'lines.context.line',
    'right click the line, read the rows, Line end > Arrow from it',
    'the rows and the head',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const b = await t.boxOf(id);
      const c = t.center(b.free);
      await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = [
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'arrange.order',
        'arrange.centerOnPage',
        'arrange.align',
        'insert.link',
        'format.formatOptions',
        'format.bordersLines.lineStart',
        'format.bordersLines.lineEnd',
        'insert.comment',
      ];
      const missing = want.filter((r) => !rows.includes(r));
      let head = false;
      let picked = null;
      if (rows.includes('format.bordersLines.lineEnd')) {
        await t.hoverContextRow('format.bordersLines.lineEnd');
        /* the Line end submenu's picks are waited for (the gate walk of 22:16Z read "picked null"
           400 ms after the hover) */
        await page
          .locator(
            '[data-control*="lineEnd.pick."], [data-control^="menu.format.bordersLines.lineEnd."]',
          )
          .first()
          .waitFor({ timeout: 4000 })
          .catch(() => undefined);
        const ends = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control*="lineEnd.pick."], [data-control^="menu.format.bordersLines.lineEnd."]',
            ),
          ]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control')),
        );
        picked =
          ends.find((x) => /fillArrow/.test(x)) ?? ends.find((x) => /arrow/i.test(x)) ?? null;
        if (picked) {
          await t.clickControl(picked);
          await t.settled();
          const j = await t.pollUntil(
            async () => JSON.stringify(await blockOf(id)),
            (x) => END_ARROW.test(x),
            8000,
          );
          head = END_ARROW.test(j);
        } else await t.press('Escape', 2);
      } else await t.press('Escape');
      if (head) await undo();
      return {
        ok: missing.length === 0 && head,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; picked ${picked}; head ${head}`,
      };
    },
  );

  // ---- the return round's rows (docs/RETURN.md 2.3, section 5): the connectors between two
  // rectangles placed as setup, the arrow head and the Line start and Line end menu rows
  const A = { id: 'con-a', pos: { x: 200, y: 600, w: 240, h: 160 } };
  const B = { id: 'con-b', pos: { x: 900, y: 600, w: 240, h: 160 } };
  const C = { id: 'con-c', pos: { x: 1300, y: 380, w: 240, h: 160 } };
  const placedAB = await t
    .step(
      null,
      'setup: two rectangles for the connectors',
      'block.insert through the window API',
      async () => {
        const a = await t.placeBlock(S, {
          id: A.id,
          type: 'shape',
          shape: 'rectangle',
          fill: 'plate',
          stroke: 'ink',
          pos: A.pos,
        });
        const b = await t.placeBlock(S, {
          id: B.id,
          type: 'shape',
          shape: 'rectangle',
          fill: 'plate',
          stroke: 'ink',
          pos: B.pos,
        });
        return { ok: Boolean(a && b), observed: `placed ${[a, b].filter(Boolean).length} of 2` };
      },
    )
    .then((r) => r.ok === true);
  const posOf = async (blockId) => (await t.blockOf(S, blockId))?.pos ?? null;
  const rightSite = async (blockId) => {
    const p = await posOf(blockId);
    return { x: p.x + p.w, y: p.y + p.h / 2 };
  };
  const leftSite = async (blockId) => {
    const p = await posOf(blockId);
    return { x: p.x, y: p.y + p.h / 2 };
  };
  const connectOf = async (blockId) => (await blockOf(blockId))?.connect ?? null;
  /** Moves a block by a drag from inside after selecting it (A1 rule 2). */
  const moveBlock = async (blockId, dx, dy) => {
    await t.clearAll();
    await t.selectObject(blockId);
    return t.dragInside(S, blockId, dx, dy);
  };
  const connectorRow = async (rowId, kind, expectFollow) => {
    let made = null;
    await t.step(
      rowId,
      `Insert > Line > ${kind === 'elbowConnector' ? 'Elbow' : 'Curved'} connector dragged from A's right site to B's left site; B moved by 150 px`,
      'both ends connect; the connector follows the moved shape',
      async () => {
        if (!placedAB) return { ok: false, observed: 'the two rectangles were not placed' };
        await t.clearAll();
        const from = await rightSite(A.id);
        const to = await leftSite(B.id);
        const r = await t.insertByTool(S, ['insert.line', `insert.line.${kind}`], from, to, {
          text: null,
        });
        await t.press('Escape');
        await t.settled();
        made = r.obj;
        if (!made) return { ok: false, observed: `nothing inserted: ${r.error}` };
        const connect = await t
          .pollUntil(
            () => connectOf(made.id),
            (c) => c?.start?.block !== undefined && c?.end?.block !== undefined,
            8000,
          )
          .catch(() => connectOf(made.id));
        const before = await posOf(made.id);
        const moved = await moveBlock(B.id, 150, 0);
        const after = await t
          .pollUntil(
            () => posOf(made.id),
            (p) => p && !same(p, before),
            8000,
          )
          .catch(() => posOf(made.id));
        await t.settled();
        const connectAfter = await connectOf(made.id);
        const followed =
          Boolean(after) &&
          !same(after, before) &&
          t.near(after.x + after.w, (await posOf(B.id)).x, 6);
        return {
          ok:
            connect?.start?.block === A.id &&
            connect?.end?.block === B.id &&
            t.near((moved.after?.x ?? 0) - (moved.before?.x ?? 0), 150, 8) &&
            followed &&
            connectAfter?.end?.block === B.id,
          observed: `${made.type} ${made.id} ${t.posStr(made.pos)}; connect ${JSON.stringify(connect)}; B ${t.posStr(moved.before)} -> ${t.posStr(moved.after)}; connector ${t.posStr(before)} -> ${t.posStr(after)}; followed ${followed}`,
        };
      },
    );
    return made;
  };
  const elbow = await connectorRow('lines.connector.elbow', 'elbowConnector');
  await connectorRow('lines.connector.curved', 'curvedConnector');
  await t.step(
    'lines.connector.re-end',
    "a third rectangle C; select the elbow connector, drag its end handle from B's site to C's left site; move C",
    'the end connects to C and follows C',
    async () => {
      if (!elbow) return { ok: false, observed: 'no elbow connector to re-end' };
      const c = await t.placeBlock(S, {
        id: C.id,
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        pos: C.pos,
      });
      if (!c) return { ok: false, observed: 'the third rectangle was not placed' };
      await t.clearAll();
      /* a click on the path itself: the connector's box centre can be off its stroke */
      const onPath = await page.evaluate((blockId) => {
        const inner = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
        );
        const el = inner?.querySelector('path, polyline, line') ?? null;
        if (!el) return null;
        let pt;
        if (typeof el.getTotalLength === 'function' && typeof el.getPointAtLength === 'function') {
          pt = el.getPointAtLength(el.getTotalLength() / 2);
        } else {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
        const m = el.getScreenCTM();
        return m ? { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f } : null;
      }, elbow.id);
      let ctrls = null;
      if (onPath) {
        await t.clickAt(onPath.x, onPath.y);
        await t.sleep(200);
        ctrls = await t.handleControls();
      }
      /* the elbow's own end handle, never another block's: the curved connector of the row before
         runs A to B on the same y, so a click on "the elbow's path" selects whichever is drawn on
         top, and the first drive dragged the curved connector's end to C and read the elbow's
         connect unchanged (return/build/integrator.md) */
      const own = `handle.${elbow.id}.end`;
      /* the two connectors coincide, so a click reaches the one drawn on top whatever the point:
         Tab walks the stage's objects from the selected one (Editor.tsx, the Tab branch) until the
         elbow's own handles are up, the way a person reaches an object under another */
      let walked = 0;
      while (!ctrls?.includes(own) && walked < 12) {
        await t.press('Tab');
        await t.sleep(150);
        ctrls = await t.handleControls();
        walked += 1;
      }
      if (!ctrls?.includes(own)) ctrls = await t.selectObject(elbow.id);
      const endCtl = ctrls?.includes(own) ? own : null;
      if (!endCtl)
        return {
          ok: false,
          observed: `no end handle of the elbow connector (handles ${(ctrls ?? []).join(',')})`,
        };
      const h = await t.handleRect(endCtl);
      const target = await t.sheetPoint(C.pos.x, C.pos.y + C.pos.h / 2);
      await t.drag(t.center(h), target, { steps: 18 });
      await t.settled();
      const connect = await t
        .pollUntil(
          () => connectOf(elbow.id),
          (x) => x?.end?.block === C.id,
          8000,
        )
        .catch(() => connectOf(elbow.id));
      const before = await posOf(elbow.id);
      const moved = await moveBlock(C.id, 0, 100);
      const after = await t
        .pollUntil(
          () => posOf(elbow.id),
          (p) => p && !same(p, before),
          8000,
        )
        .catch(() => posOf(elbow.id));
      await t.settled();
      return {
        ok:
          connect?.end?.block === C.id &&
          connect?.start?.block === A.id &&
          Boolean(after) &&
          !same(after, before),
        observed: `connect after the drag ${JSON.stringify(connect)}; C moved ${t.posStr(moved.before)} -> ${t.posStr(moved.after)}; connector ${t.posStr(before)} -> ${t.posStr(after)}`,
      };
    },
  );
  await t.step(
    'lines.insert.arrow-head',
    'Insert > Line > Arrow by a drag; read the svg',
    'one polygon head with data-heads end',
    async () => {
      await t.clearAll();
      const r = await t.insertByTool(
        S,
        ['insert.line', 'insert.line.arrow'],
        { x: 200, y: 820 },
        { x: 700, y: 880 },
        { text: null },
      );
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing inserted: ${r.error}` };
      const facts = await page.evaluate((blockId) => {
        const inner = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
        );
        const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
        return svg
          ? {
              heads: svg.getAttribute('data-heads'),
              polygons: svg.querySelectorAll('polygon').length,
              lines: svg.querySelectorAll('line, path').length,
            }
          : null;
      }, r.obj.id);
      await t.selectObject(r.obj.id);
      await t.press('Delete');
      await t.settled();
      return {
        ok: facts !== null && facts.heads === 'end' && facts.polygons === 1,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; data-heads ${facts?.heads}; polygons ${facts?.polygons}; line parts ${facts?.lines}`,
      };
    },
  );
  await t.step(
    'lines.tail.line-start-end-menu',
    'select the line; Format > Borders & lines > Line start > Arrow, Cmd+Z; Line end > None, Cmd+Z',
    'the svg heads follow each pick and each Cmd+Z takes it back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const json0 = JSON.stringify(await blockOf(id));
      const facts0 = await lineFacts(id);
      await t.menuPath(
        'format',
        'format.bordersLines',
        'format.bordersLines.lineStart',
        'format.bordersLines.lineStart.fillArrow',
      );
      await t.settled();
      const j1 = await t
        .pollUntil(
          async () => JSON.stringify(await blockOf(id)),
          (j) => START_FIELD.test(j) && /[Aa]rrow/.test(j),
          8000,
        )
        .catch(async () => JSON.stringify(await blockOf(id)));
      const facts1 = await lineFacts(id);
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const j2 = JSON.stringify(await blockOf(id));
      await t.selectObject(id);
      await t.menuPath(
        'format',
        'format.bordersLines',
        'format.bordersLines.lineEnd',
        'format.bordersLines.lineEnd.fillArrow',
      );
      await t.settled();
      const j3 = await t
        .pollUntil(
          async () => JSON.stringify(await blockOf(id)),
          (j) => END_ARROW.test(j),
          8000,
        )
        .catch(async () => JSON.stringify(await blockOf(id)));
      await t.selectObject(id);
      await t.menuPath(
        'format',
        'format.bordersLines',
        'format.bordersLines.lineEnd',
        'format.bordersLines.lineEnd.none',
      );
      await t.settled();
      const j4 = await t
        .pollUntil(
          async () => JSON.stringify(await blockOf(id)),
          (j) => !END_ARROW.test(j),
          8000,
        )
        .catch(async () => JSON.stringify(await blockOf(id)));
      const facts4 = await lineFacts(id);
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const j5 = JSON.stringify(await blockOf(id));
      return {
        ok:
          START_FIELD.test(j1) &&
          /[Aa]rrow/.test(j1) &&
          j2 === json0 &&
          END_ARROW.test(j3) &&
          !END_ARROW.test(j4) &&
          j5 === json0,
        observed: `Line start > Arrow: start field ${START_FIELD.test(j1)} (drawn parts ${facts0?.paths} -> ${facts1?.paths}), Cmd+Z restored ${j2 === json0}; Line end > Arrow then None: arrow ${END_ARROW.test(j3)} -> ${END_ARROW.test(j4)} (drawn parts ${facts4?.paths}); two Cmd+Z restored ${j5 === json0}`,
      };
    },
  );
  t.deck.line = id;
  t.deck.arrow = arrow?.id ?? null;
  /* the switch the shapes area turned on for the parked rows goes off again, so the areas after
     this one run in the default view (b1 R26) */
  if (t.deck.advancedForShapes) {
    await t.step(
      null,
      'setup: Tools > Advanced tools off again after the shapes and lines rows',
      'the default view is back',
      async () => {
        await t.clearAll();
        await t.menuPath('tools', 'tools.advancedTools');
        const off = await t.pollUntil(
          async () => (await t.state()).settings?.advancedTools !== true,
          (x) => x,
          5000,
        );
        t.deck.advancedForShapes = false;
        return { ok: off, observed: `advanced tools off ${off}` };
      },
    );
  }
}

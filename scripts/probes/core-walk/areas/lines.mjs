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

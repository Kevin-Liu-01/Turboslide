// The polish round's object rows (docs/POLISH.md 2.4, 2.6 item 67, 5.1 `lines.*`, `shapes.*`,
// `charts.*`, `arrange.*`, `diagrams.*` and `wordart.*` with the driver `probe --core`; B6 the
// drivers, B3 the fixes with B1's hunks): a line's hit area is its stroke, the cloud callout draws
// closed, the chart data grid shows every series, a dragged connector detaches, a selected line
// draws its end handles and no ring, no browser text selection on a Shift click or a chart double
// click, a double click on a diagram member's text selects the word, a connector leaves and
// arrives perpendicular to its sites, the Word art bar closes and the word art's chip, weight and
// tool arming. The shapes, lines and charts are placed through the window API (the rows'
// `setup`); the callout is drawn through Insert > Shape; the diagram through Insert > Diagram.
// The reads are the frame (`frameFacts`), the DOM's boxes, the svg's own path and a 1x pixel read
// of the sheet, so the row reads what a screenshot shows.

export const NAME = 'polish-objects';
export const IDS = [
  'lines.hit.stroke-only',
  'shapes.geometry.cloud-callout-closed',
  'charts.grid.every-series-in-view',
  'lines.move.detaches',
  'lines.select.handles-no-ring',
  'arrange.select.no-browser-highlight',
  'diagrams.label.double-click-selects-word',
  'lines.connector.perpendicular-at-sites',
  'wordart.bar.closes',
  'wordart.polish.chip-weight-arming',
];

const LANE = 'B3';
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page } = t;
  const S = await t
    .setup(
      'a blank slide for the polish round objects',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(null, 'blank');
        t.deck.polishObjectSlide = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.polishObjectSlide);
  await t.clickCard(S);
  await t.clearAll();

  const posOf = async (id, slide = S) => (await t.blockOf(slide, id))?.pos ?? null;
  const blockOf = async (id, slide = S) => (await t.blockOf(slide, id))?.block ?? null;
  const rect = (id, x, y, w = 240, h = 160) => ({
    id,
    type: 'shape',
    shape: 'rectangle',
    fill: 'plate',
    stroke: 'ink',
    pos: { x, y, w, h },
  });
  /** A viewport point on a line's path at a fraction of its length, and the path's tangent there. */
  const pathPoint = (id, fraction, offset = 0) =>
    page.evaluate(
      ([blockId, f, off]) => {
        const inner = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
        );
        const el = inner?.querySelector('path, polyline, line') ?? null;
        if (!el || typeof el.getTotalLength !== 'function') return null;
        const total = el.getTotalLength();
        const at = el.getPointAtLength(total * f);
        const ahead = el.getPointAtLength(Math.min(total, total * f + 2));
        const m = el.getScreenCTM();
        if (!m) return null;
        const to = (p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
        const a = to(at);
        const b = to(ahead);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        /* a point `off` px to the side of the stroke, along its normal */
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        return { x: a.x + nx * off, y: a.y + ny * off, length: total };
      },
      [id, fraction, offset],
    );
  const ringBox = () =>
    t.boxOfSel('.ts-overlay .ts-select.is-selected:not(.is-extra):not(.is-cells)');
  const undoOnce = async () => {
    await t.clearAll();
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  // ---- 2.4 item 24: a line's hit area is its stroke
  await t.setup(
    'two rectangles A and B joined by a curved connector',
    'block.insert through the window API',
    async () => {
      const a = await t.placeBlock(S, rect('po-a', 160, 300));
      const b = await t.placeBlock(S, rect('po-b', 900, 300));
      const c = await t.placeBlock(S, {
        id: 'po-curve',
        type: 'shape',
        shape: 'curved',
        stroke: 'ink',
        width: 2,
        connect: { start: { block: 'po-a', site: 3 }, end: { block: 'po-b', site: 1 } },
        pos: { x: 400, y: 380, w: 500, h: 1 },
      });
      return {
        ok: Boolean(a && b && c),
        observed: [a, b, c].map((o) => o?.id ?? 'none').join(', '),
      };
    },
  );
  await t.step(
    'lines.hit.stroke-only',
    "a press at B's centre moved by 150 by 100; a click on B's corner; a click 3 px from the connector's stroke",
    "B moves and the connector's end follows; B is selected with eight handles; the connector is selected",
    async () => {
      await t.clearAll();
      const bBefore = await posOf('po-b');
      const cBefore = await posOf('po-curve');
      const moved = await t.dragInside(S, 'po-b', 150, 100);
      const bAfter = await posOf('po-b');
      const cAfter = await t
        .pollUntil(
          () => posOf('po-curve'),
          (p) => p && !same(p, cBefore),
          8000,
        )
        .catch(() => posOf('po-curve'));
      const bMoved =
        bBefore &&
        bAfter &&
        t.near(bAfter.x - bBefore.x, 150, 8) &&
        t.near(bAfter.y - bBefore.y, 100, 8);
      const followed =
        cAfter && !same(cAfter, cBefore) && t.near(cAfter.x + cAfter.w, bAfter?.x ?? 0, 6);
      /* a click on B's corner: the nw corner, 4 px inside */
      await t.clearAll();
      const bb = await t.boxOf('po-b');
      await t.clickAt(bb.free.x + 4, bb.free.y + 4);
      await t.sleep(250);
      const cornerCtrls = await t.handleControls();
      const cornerB =
        cornerCtrls.includes('handle.po-b.move') && (await t.resizeDirs('po-b')).length === 8;
      /* a click 3 px beside the connector's stroke, at its middle */
      await t.clearAll();
      const near = await pathPoint('po-curve', 0.5, 3);
      let strokeC = false;
      if (near) {
        await t.clickAt(near.x, near.y);
        await t.sleep(250);
        strokeC = (await t.handleControls()).includes('handle.po-curve.move');
      }
      await t.clearAll();
      const ok = Boolean(bMoved && followed && cornerB && strokeC);
      return {
        ok,
        observed: `B ${t.posStr(bBefore)} -> ${t.posStr(bAfter)} (moved ${Boolean(bMoved)}; during: editing ${moved.during?.editing}); connector ${t.posStr(cBefore)} -> ${t.posStr(cAfter)} (followed ${Boolean(followed)}); corner click selects B ${cornerB} (${cornerCtrls.filter((c) => c.endsWith('.move')).join(', ') || 'no move handle'}); a click 3 px from the stroke selects the connector ${strokeC}${ok ? '' : ` (docs/POLISH.md 2.4 item 24, ${LANE} with B1's hunks)`}`,
      };
    },
  );

  // ---- 2.4 item 27: a dragged connector detaches
  await t.step(
    'lines.move.detaches',
    'the connector moved by its body by 150 by 100; then A moved',
    "connect is undefined after the release and the connector's ends stay when A moves",
    async () => {
      await t.clearAll();
      const before = await posOf('po-curve');
      const from = await pathPoint('po-curve', 0.5, 0);
      if (!from) return { ok: false, observed: 'no path point on the connector' };
      await t.clickAt(from.x, from.y);
      await t.sleep(200);
      if (!(await t.handleControls()).includes('handle.po-curve.move'))
        return { ok: false, observed: 'the click on the stroke did not select the connector' };
      const k = await t.kOf();
      await t.drag(from, { x: from.x + 150 * k, y: from.y + 100 * k }, { steps: 14 });
      await t.settled();
      const connect = await t
        .pollUntil(
          async () => (await blockOf('po-curve'))?.connect ?? null,
          (c) => c === null || c === undefined,
          5000,
        )
        .catch(async () => (await blockOf('po-curve'))?.connect ?? null);
      const moved = await posOf('po-curve');
      await t.clearAll();
      const cBefore = await posOf('po-curve');
      await t.dragInside(S, 'po-a', -60, 0);
      await t.sleep(600);
      await t.settled();
      const cAfter = await posOf('po-curve');
      const stayed = same(cBefore, cAfter);
      await undoOnce();
      await undoOnce();
      const ok =
        (connect === null || connect === undefined) && moved && !same(moved, before) && stayed;
      return {
        ok,
        observed: `connector ${t.posStr(before)} -> ${t.posStr(moved)}; connect after the release ${JSON.stringify(connect ?? null)}; A moved by 60, the connector ${stayed ? 'stayed' : `moved to ${t.posStr(cAfter)}`}${ok ? '' : ` (docs/POLISH.md 2.4 item 27, ${LANE} with B1's Editor.tsx hunk)`}`,
      };
    },
  );

  // ---- 2.4 item 28: a selected line draws its two end handles and no box
  await t.step(
    'lines.select.handles-no-ring',
    'a line, an arrow and the curved connector each selected',
    'two end handles and no .ts-select ring; the chip sits by the start handle',
    async () => {
      const line = await t.placeBlock(S, {
        id: 'po-line',
        type: 'shape',
        shape: 'line',
        stroke: 'ink',
        width: 2,
        pos: { x: 160, y: 620, w: 400, h: 60 },
      });
      const arrow = await t.placeBlock(S, {
        id: 'po-arrow',
        type: 'shape',
        shape: 'arrow',
        stroke: 'ink',
        width: 2,
        pos: { x: 700, y: 620, w: 400, h: 60 },
      });
      const facts = [];
      let ok = Boolean(line && arrow);
      for (const id of ['po-line', 'po-arrow', 'po-curve']) {
        await t.clearAll();
        const at = await pathPoint(id, 0.5, 0);
        if (!at) {
          ok = false;
          facts.push(`${id}: no path`);
          continue;
        }
        await t.clickAt(at.x, at.y);
        await t.sleep(250);
        const ctrls = await t.handleControls();
        if (!ctrls.includes(`handle.${id}.move`)) await t.selectObject(id);
        const ctrlsNow = await t.handleControls();
        const ends = ctrlsNow.filter((c) => c === `handle.${id}.start` || c === `handle.${id}.end`);
        const resize = ctrlsNow.filter((c) => c.startsWith(`handle.${id}.resize.`));
        const ring = await ringBox();
        const chip = await t.boxOfSel('.ts-overlay .ts-select-chip');
        const start = await t.handleRect(`handle.${id}.start`);
        const gap =
          chip && start ? t.boxGap(chip, { x: start.x, y: start.y, w: start.w, h: start.h }) : null;
        const nearStart = gap !== null && Math.max(gap.dx, gap.dy) <= 24;
        const good = ends.length === 2 && ring === null && resize.length === 0 && nearStart;
        ok = ok && good;
        facts.push(
          `${id}: end handles ${ends.length}, resize handles ${resize.length}, ring ${ring ? `${r1(ring.w)}x${r1(ring.h)}` : 'none'}, chip ${chip ? `${r1(gap?.dx)}/${r1(gap?.dy)} px from the start handle` : 'none'}`,
        );
      }
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.4 item 28, B1's Overlay.tsx by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.4 item 33: a connector leaves and arrives perpendicular to its sites
  await t.step(
    'lines.connector.perpendicular-at-sites',
    "A above B; a curved connector from A's bottom site to B's top site; an elbow the same; A rotated 90 degrees",
    'the path leaves and arrives within 10 degrees of vertical; the elbow the same after the rotation',
    async () => {
      const slide = await t.setupSlide(null, 'blank');
      if (!slide) return { ok: false, observed: 'no slide' };
      await t.clickCard(slide);
      await t.clearAll();
      const a = await t.placeBlock(slide, rect('pp-a', 600, 120, 300, 140));
      const b = await t.placeBlock(slide, rect('pp-b', 600, 560, 300, 140));
      if (!a || !b) return { ok: false, observed: 'the rectangles were not placed' };
      const tangentAngles = (id) =>
        page.evaluate((blockId) => {
          const inner = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
          );
          const el = inner?.querySelector('path, polyline, line') ?? null;
          if (!el || typeof el.getTotalLength !== 'function') return null;
          const total = el.getTotalLength();
          const angle = (p, q) => Math.abs((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
          const leave = angle(el.getPointAtLength(0), el.getPointAtLength(Math.min(6, total)));
          const arrive = angle(
            el.getPointAtLength(Math.max(0, total - 6)),
            el.getPointAtLength(total),
          );
          /* degrees from vertical: 0 when the tangent points straight up or down */
          const fromVertical = (deg) => Math.abs(90 - (deg > 90 ? 180 - deg : deg));
          return {
            leave: Math.round(fromVertical(leave) * 10) / 10,
            arrive: Math.round(fromVertical(arrive) * 10) / 10,
          };
        }, id);
      const facts = [];
      let ok = true;
      for (const [id, shape] of [
        ['pp-curve', 'curved'],
        ['pp-elbow', 'elbow'],
      ]) {
        const made = await t.placeBlock(slide, {
          id,
          type: 'shape',
          shape,
          stroke: 'ink',
          width: 2,
          ...(shape === 'elbow' ? { orientation: 'vertical' } : {}),
          connect: { start: { block: 'pp-a', site: 2 }, end: { block: 'pp-b', site: 0 } },
          pos: { x: 750, y: 260, w: 1, h: 300 },
        });
        if (!made) {
          ok = false;
          facts.push(`${shape}: not placed`);
          continue;
        }
        await t.sleep(300);
        const angles = await tangentAngles(id);
        const good = angles !== null && angles.leave <= 10 && angles.arrive <= 10;
        ok = ok && good;
        facts.push(
          `${shape}: leaves ${angles?.leave ?? '?'} and arrives ${angles?.arrive ?? '?'} degrees from vertical`,
        );
      }
      /* A rotated 90 degrees: the elbow's last segment still arrives at B's top site vertically; a
         refused rotation write is the row's own reading, never an exception */
      let rotated = 'rotated';
      try {
        await t.setBlock(slide, 'pp-a', '/pos', { ...(await posOf('pp-a', slide)), rotate: 90 });
      } catch (error) {
        rotated = `the rotation was refused: ${error instanceof Error ? error.message.split('\n')[0].slice(0, 120) : String(error)}`;
        ok = false;
      }
      await t.sleep(400);
      const after = await tangentAngles('pp-elbow');
      const arriveOk = after !== null && after.arrive <= 10;
      ok = ok && arriveOk;
      facts.push(
        `elbow after A's rotation (${rotated}): arrives ${after?.arrive ?? '?'} degrees from vertical`,
      );
      await t.clickCard(S);
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.4 item 33, ${LANE})`}`,
      };
    },
  );

  // ---- 2.4 item 25: the cloud callout draws closed
  await t.step(
    'shapes.geometry.cloud-callout-closed',
    'Insert > Shape > Callouts > Cloud callout placed by a click and by a drag',
    'one closed path each; a pixel read along the outline finds no gap',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const reach = await t.reachRow('insert', 'insert.shape', 'insert.shape.callouts');
      if (!reach.present)
        return t.notBuilt('insert.shape.callouts', LANE, 'the Callouts row is not reachable');
      const facts = [];
      let ok = true;
      for (const [label, at, to] of [
        ['click', { x: 300, y: 120 }, null],
        ['drag', { x: 900, y: 100 }, { x: 1300, y: 300 }],
      ]) {
        const r = await t.insertByTool(
          S,
          ['insert.shape', 'insert.shape.callouts', 'insert.shape.callouts.pick.cloudCallout'],
          at,
          to,
          { text: null },
        );
        await t.press('Escape');
        await t.settled();
        if (!r.obj) {
          ok = false;
          facts.push(`${label}: nothing inserted (${r.error})`);
          continue;
        }
        const path = await page.evaluate((id) => {
          const inner = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          const paths = [...(inner?.querySelectorAll('path') ?? [])];
          const main = paths.reduce(
            (best, p) => (p.getTotalLength() > (best?.getTotalLength() ?? 0) ? p : best),
            null,
          );
          if (!main) return null;
          const d = main.getAttribute('d') ?? '';
          const subpaths = (d.match(/[Mm]/g) ?? []).length;
          const closed = /[Zz]\s*$/.test(d.trim());
          const total = main.getTotalLength();
          const a = main.getPointAtLength(0);
          const b = main.getPointAtLength(total);
          const m = main.getScreenCTM();
          const pts = [];
          for (let i = 0; i < 48; i += 1) {
            const p = main.getPointAtLength((total * i) / 48);
            pts.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
          }
          return {
            count: paths.length,
            subpaths,
            closed,
            endGap: Math.hypot(a.x - b.x, a.y - b.y),
            pts,
            stroke: getComputedStyle(main).stroke,
          };
        }, r.obj.id);
        if (!path) {
          ok = false;
          facts.push(`${label}: no path drawn`);
          continue;
        }
        /* the pixel read: every sampled point of the outline reads a stroke pixel within 2 px */
        await t.clearAll();
        const img = await t.shotPixels();
        const ground = t.pixelAtOf(img, 20, img.height - 20);
        const hits = path.pts.filter((p) => {
          for (let dx = -2; dx <= 2; dx += 1)
            for (let dy = -2; dy <= 2; dy += 1) {
              const px = t.pixelAtOf(img, p.x + dx, p.y + dy);
              if (px && ground && px.rgb.some((v, i) => Math.abs(v - ground.rgb[i]) > 40))
                return true;
            }
          return false;
        }).length;
        const closed =
          path.subpaths === 1 && path.closed && path.endGap <= 0.5 && hits >= path.pts.length - 2;
        ok = ok && closed;
        facts.push(
          `${label}: ${r.obj.id} ${t.posStr(r.obj.pos)}, ${path.count} path(s), ${path.subpaths} subpath(s), closed ${path.closed}, end gap ${r1(path.endGap)}, outline pixels hit ${hits} of ${path.pts.length}`,
        );
        await t.clearAll();
        await t.selectObject(r.obj.id);
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.4 item 25, ${LANE})`}`,
      };
    },
  );

  // ---- 2.4 item 26: the chart data grid shows every series
  const CH = 'po-chart';
  await t.step(
    'charts.grid.every-series-in-view',
    'a column chart with two series; its data grid opened; a third series added',
    'the grid\'s second header reads "Series 2" whole and its value cells are inside the panel\'s box; a third series shows a scrollbar',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const chart = await t.placeBlock(S, {
        id: CH,
        type: 'chart',
        kind: 'column',
        categories: ['North', 'South', 'West'],
        series: [
          { name: 'Series 1', values: [30, 45, 20] },
          { name: 'Series 2', values: [25, 35, 40] },
        ],
        pos: { x: 200, y: 100, w: 700, h: 420 },
      });
      if (!chart) return { ok: false, observed: 'the chart was not placed' };
      await t.selectObject(CH);
      if (!(await t.visible('panel.formatOptions'))) {
        await t.tailControl('toolbar.formatOptions');
        await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
      }
      const gridOn = await t
        .waitControl('formatOptions.chart.grid', 8000)
        .then(() => true)
        .catch(() => false);
      if (!gridOn)
        return t.notBuilt('formatOptions.chart.grid', LANE, 'no chart data grid in the panel');
      const read = () =>
        page.evaluate(() => {
          const panel = document.querySelector('[data-control="panel.formatOptions"]');
          const grid = document.querySelector('[data-control="formatOptions.chart.grid"]');
          if (!panel || !grid) return null;
          const pr = panel.getBoundingClientRect();
          const heads = [...grid.querySelectorAll('thead th, thead td')].map((th) => {
            const r = th.getBoundingClientRect();
            return {
              text: (th.textContent ?? '').trim(),
              x: r.x,
              right: r.right,
              clipped: th.scrollWidth > th.clientWidth + 1,
            };
          });
          const cells = [
            ...grid.querySelectorAll('[data-control^="formatOptions.chart.cell."]'),
          ].map((c) => {
            const r = c.getBoundingClientRect();
            return { control: c.getAttribute('data-control'), right: r.right, x: r.x };
          });
          const scroller = grid.closest('.pt-scroll, [style*="overflow"]') ?? grid;
          const scroll = [grid, scroller, grid.parentElement]
            .filter(Boolean)
            .some((el) => el.scrollWidth > el.clientWidth + 1);
          return {
            panel: { x: pr.x, right: pr.right, w: pr.width },
            heads,
            cells,
            scroll,
            gridScrollWidth: grid.scrollWidth,
            gridClientWidth: grid.clientWidth,
          };
        });
      const two = await read();
      const head2 = two?.heads.find((h) => /Series 2/.test(h.text)) ?? null;
      const inside = two
        ? two.cells.every((c) => c.right <= two.panel.right + 1 && c.x >= two.panel.x - 1)
        : false;
      const wholeHead =
        head2 !== null &&
        head2.text.trim() === 'Series 2' &&
        !head2.clipped &&
        head2.right <= (two?.panel.right ?? 0) + 1;
      let third = null;
      if (await t.visible('formatOptions.chart.addSeries')) {
        await t.clickControl('formatOptions.chart.addSeries');
        await t.settled();
        await t.sleep(400);
        third = await read();
      }
      const scrollbar = third
        ? third.scroll || !third.cells.every((c) => c.right <= third.panel.right + 1) === false
        : null;
      const ok = wholeHead && inside && (third === null ? false : third.scroll);
      await t.press('Meta+z').catch(() => undefined);
      await t.settled();
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      return {
        ok,
        observed: `panel ${two ? `${r1(two.panel.x)} to ${r1(two.panel.right)}` : 'none'}; heads ${two ? two.heads.map((h) => `"${h.text}"${h.clipped ? ' (clipped)' : ''} to ${r1(h.right)}`).join(', ') : 'none'}; value cells inside ${inside}; third series: ${third ? `${third.heads.length} heads, scrollbar ${third.scroll} (grid ${third.gridScrollWidth} in ${third.gridClientWidth})` : 'no Add series control'}${ok ? '' : ` (docs/POLISH.md 2.4 item 26, ${LANE})`}`,
      };
    },
  );

  // ---- 2.4 item 29: no browser text selection on a Shift click or a chart double click
  await t.step(
    'arrange.select.no-browser-highlight',
    'three shapes Shift clicked; a double click on the chart',
    'window.getSelection() is empty and no pixel of the svg picture reads the selection tint; the chart double click the same',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const ids = ['po-s1', 'po-s2', 'po-s3'];
      /* three shapes apart (walk 2's overlapping stack read one selected after three clicks) */
      for (const [i, id] of ids.entries())
        await t.placeBlock(S, rect(id, 300 + i * 260, 600, 160, 100));
      await t.clearAll();
      for (const [i, id] of ids.entries()) {
        const b = await t.boxOf(id);
        if (!b) continue;
        if (i === 0) await t.clickAt(b.free.x + 8, b.free.y + 8);
        else await t.shiftClickAt(b.free.x + 8, b.free.y + 8);
      }
      await t.sleep(300);
      const selText = await t.selectionText();
      const count = await page.evaluate(
        () => document.querySelectorAll('.ts-overlay [data-control$=".move"]').length,
      );
      /* the selection tint: any pixel of the shapes' svgs painted the browser's highlight (a blue with alpha over the plate) */
      const tintOf = async () => {
        const img = await t.shotPixels();
        let tinted = 0;
        for (const id of ids) {
          const b = await t.boxOf(id);
          if (!b) continue;
          const s = t.sampleBoxOf(img, b.inner, { inset: 6, step: 3 });
          const blueish = s.colors.filter((c) => {
            const rr = parseInt(c.hex.slice(1, 3), 16);
            const gg = parseInt(c.hex.slice(3, 5), 16);
            const bb = parseInt(c.hex.slice(5, 7), 16);
            return bb > rr + 40 && bb > gg + 20;
          });
          tinted += blueish.reduce((n, c) => n + c.count, 0);
        }
        return tinted;
      };
      const tinted = await tintOf();
      await t.clearAll();
      const cb = await t.boxOf(CH);
      let chartSel = null;
      let legendTint = null;
      if (cb) {
        await t.dblclickAt(cb.inner.x + cb.inner.w / 2, cb.inner.y + cb.inner.h / 2);
        await t.sleep(400);
        chartSel = await t.selectionText();
        const legend = await t.boxOfSel(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${CH}"] .legend`,
        );
        if (legend) {
          const img = await t.shotPixels();
          const s = t.sampleBoxOf(img, legend, { step: 2 });
          legendTint = s.colors
            .filter((c) => parseInt(c.hex.slice(5, 7), 16) > parseInt(c.hex.slice(1, 3), 16) + 40)
            .reduce((n, c) => n + c.count, 0);
        }
        await t.press('Escape', 2);
        if (await t.visible('panel.formatOptions.close'))
          await t.clickControl('panel.formatOptions.close');
      }
      await t.clearAll();
      const ok =
        selText === '' &&
        tinted === 0 &&
        (chartSel === null || chartSel === '') &&
        (legendTint === null || legendTint === 0);
      return {
        ok,
        observed: `after three Shift clicks: ${count} selected, getSelection "${selText}", tinted pixels ${tinted}; after the chart double click: getSelection "${chartSel ?? 'no chart'}", legend tinted pixels ${legendTint ?? 'unread'}${ok ? '' : ` (docs/POLISH.md 2.4 item 29, B1's Editor.tsx hunks by ${LANE}'s request)`}`,
      };
    },
  );

  // ---- 2.4 item 30: a double click on a diagram member's text selects the word
  await t.step(
    'diagrams.label.double-click-selects-word',
    'Insert > Diagram > Process; a double click on "Step 2" of the diagram, " plus" typed; a text box double clicked at a point, typed',
    'the label reads "Step  plus" (the typed text in the word\'s place, the space before it kept); the text box keeps the caret at the click point',
    async () => {
      const slide = await t.setupSlide(null, 'blank');
      if (!slide) return { ok: false, observed: 'no slide' };
      await t.clickCard(slide);
      await t.clearAll();
      const reach = await t.reachRow('insert', 'insert.diagram');
      if (!reach.present)
        return t.notBuilt('insert.diagram', LANE, 'Insert > Diagram is not reachable');
      await t.menuPath('insert', 'insert.diagram');
      await t.waitControl('panel.diagram', 8000);
      await t.clickControl('insert.diagram.type.process');
      await t.sleep(300);
      const before = await t.objectIds(slide);
      await t.clickControl('insert.diagram.insert');
      await t
        .pollUntil(
          () => t.objectIds(slide),
          (ids) => ids.length > before.length + 2,
          15_000,
        )
        .catch(() => undefined);
      await t.settled();
      if (await t.visible('panel.diagram.close')) await t.clickControl('panel.diagram.close');
      await t.press('Escape');
      const members = (await t.objectsOf(slide)).filter((o) => o.pos?.group !== undefined);
      const owner =
        members.find((o) => typeof o.block?.text === 'string' && /Step 2/.test(o.block.text)) ??
        null;
      if (!owner)
        return { ok: false, observed: `no member reads "Step 2" (${members.length} members)` };
      const run = (await t.runsOfBlock(owner.id))[0];
      const w = await t.wordRect(run, 1);
      if (!w) return { ok: false, observed: `no word rect for "2" in ${run}` };
      await t.clearAll();
      /* one click selects the group, the double click on the word "2" */
      await t.clickAt(w.x + w.w / 2, w.y + w.h / 2);
      await t.sleep(200);
      await t.dblclickAt(w.x + w.w / 2, w.y + w.h / 2);
      await t.sleep(300);
      const selected = await t.selectionText();
      await t.typeHuman(' plus');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const label = await t
        .pollUntil(
          async () => (await t.blockOf(slide, owner.id))?.block?.text ?? null,
          (x) => typeof x === 'string' && /plus/.test(x),
          6000,
        )
        .catch(async () => (await t.blockOf(slide, owner.id))?.block?.text ?? null);
      /* a text box keeps A1 rule 3's caret at the click point */
      const box = await t.placeBlock(slide, {
        id: 'po-caret',
        type: 'text',
        text: 'Keep the caret here',
        pos: { x: 200, y: 700, w: 700, h: 80 },
      });
      let caretOk = false;
      let caretText = null;
      if (box) {
        await t.clearAll();
        const brun = (await t.runsOfBlock('po-caret'))[0];
        const bw = await t.wordRect(brun, 2);
        await t.dblclickAt(bw.x + 2, bw.y + bw.h / 2);
        await t.sleep(300);
        const sel = await t.selectionText();
        await t.typeHuman('X');
        await t.sleep(200);
        await t.press('Escape');
        await t.settled();
        caretText = (await t.blockOf(slide, 'po-caret'))?.block?.text ?? null;
        caretOk =
          sel === 'caret'
            ? /Keep the X here/.test(caretText ?? '')
            : /X/.test(caretText ?? '') && /the/.test(caretText ?? '');
      }
      await t.clickCard(S);
      /* the typed " plus" lands in the selected word's place, so the stored label is "Step" +
         the space kept + " plus", two spaces, as Google keeps it; the stage collapses the pair to
         one and B1's hand read saw "Step plus" (the verifier's pass 2 finding 9: the walk's one
         space was the read's, not the product's) */
      const ok = selected.trim() === '2' && label === 'Step  plus' && caretOk;
      return {
        ok,
        observed: `double click selected "${selected}"; the label reads "${label}"; the text box after a double click on "caret" and "X" typed reads "${caretText}"${ok ? '' : ` (docs/POLISH.md 2.4 item 30, B1's Selection.tsx by ${LANE}'s request; question 5)`}`,
      };
    },
  );

  // ---- 2.6 item 67 and 2.4 item 34: the Word art bar and the word art's chip, weight and arming
  await t.step(
    'wordart.bar.closes',
    'Insert > Word art, Escape with the focus on the sheet; reopened, a pointer down on the sheet; reopened, File > Details',
    'the bar is gone each time',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const reach = await t.reachRow('insert', 'insert.wordArt');
      if (!reach.present)
        return t.notBuilt('insert.wordArt', LANE, 'Insert > Word art is not reachable');
      const open = async () => {
        await t.menuPath('insert', 'insert.wordArt');
        return t
          .waitControl('wordArt.bar', 6000)
          .then(() => true)
          .catch(() => false);
      };
      const gone = () => t.waitGone('[data-control="wordArt.bar"]', 3000);
      const facts = [];
      let ok = true;
      /* Escape with the focus on the sheet */
      if (await open()) {
        const sheet = await t.emptySheetPoint();
        await page.mouse.move(sheet.x, sheet.y);
        await page.evaluate(
          () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
        );
        await t.press('Escape');
        const g1 = await gone();
        ok = ok && g1;
        facts.push(`Escape from the sheet: closed ${g1}`);
      } else {
        ok = false;
        facts.push('the bar did not open');
      }
      if (await t.has('[data-control="wordArt.bar"]'))
        await t.clickControl('wordArt.cancel').catch(() => undefined);
      if (await open()) {
        const sheet = await t.emptySheetPoint();
        await t.clickAt(sheet.x, sheet.y);
        const g2 = await gone();
        ok = ok && g2;
        facts.push(`a pointer down on the sheet: closed ${g2}`);
      }
      if (await t.has('[data-control="wordArt.bar"]'))
        await t.clickControl('wordArt.cancel').catch(() => undefined);
      if (await open()) {
        await t.menuPath('file', 'file.details');
        await t.waitControl('dialog.details', 6000).catch(() => undefined);
        const g3 = await gone();
        ok = ok && g3;
        facts.push(`File > Details: closed ${g3}`);
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.details"]', 3000).catch(() => undefined);
      }
      if (await t.has('[data-control="wordArt.bar"]'))
        await t.clickControl('wordArt.cancel').catch(() => undefined);
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/POLISH.md 2.6 item 67, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'wordart.polish.chip-weight-arming',
    'Insert > Word art with "Big words" typed and Enter; the chip and the tail\'s B read; B pressed once; Insert > Line > Elbow connector armed',
    'the chip reads "Word art", the tail\'s B is unpressed and one press bolds the letters; arming the elbow tool clears the previous ring and chip',
    async () => {
      await t.clickCard(S);
      await t.clearAll();
      const reach = await t.reachRow('insert', 'insert.wordArt');
      if (!reach.present)
        return t.notBuilt('insert.wordArt', LANE, 'Insert > Word art is not reachable');
      const before = await t.objectIds(S);
      await t.menuPath('insert', 'insert.wordArt');
      await t.waitControl('wordArt.bar', 8000);
      await t.clickControl('wordArt.text');
      await t.typeHuman('Big words');
      await t.press('Enter');
      const obj = await t.newObjectAfter(S, before);
      await t.settled();
      if (!obj) return { ok: false, observed: 'no word art inserted' };
      await t.sleep(300);
      const chip = await t.chip();
      const pressed = (await t.attr('[data-control="toolbar.bold"]', 'aria-pressed')) === 'true';
      /* Bold is the run mark (docs/POLISH.md 2.3 item 12): one press wraps the letters in `b`
         elements at 700 while the paragraph's own weight stays 400 by design, so the letters'
         weight is the marks' when they cover the text, else the paragraph's (B1's fix round
         request to B6) */
      const weightOf = () =>
        page.evaluate((id) => {
          const el = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          const text = el?.matches('p, h1, h2, .text')
            ? el
            : (el?.querySelector('p, h1, h2, [data-run]') ?? el);
          if (!text) return null;
          const own = (text.textContent ?? '').replace(/\s+/g, ' ').trim();
          const marks = [...text.querySelectorAll('b, strong, [data-mark="b"]')];
          const covered = marks
            .map((m) => (m.textContent ?? '').replace(/\s+/g, ' ').trim())
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (marks.length > 0 && own.length > 0 && covered === own)
            return String(Math.min(...marks.map((m) => Number(getComputedStyle(m).fontWeight))));
          return getComputedStyle(text).fontWeight;
        }, obj.id);
      const weight0 = await weightOf();
      await t.tailControl('toolbar.bold');
      await t.settled();
      await t.sleep(400);
      const weight1 = await weightOf();
      const bolded = Number(weight1) > Number(weight0);
      /* arming the elbow tool clears the previous ring and chip */
      await t.clearAll();
      await t.selectObject(obj.id);
      const ringBefore = await ringBox();
      await t.openMenu('insert');
      await t.hoverRow('insert.line', '[data-control="menu.insert.line.elbowConnector"]');
      await t.clickRow('insert.line.elbowConnector');
      await t.sleep(400);
      const ringArmed = await ringBox();
      const chipArmed = await t.chip();
      await t.press('Escape', 2);
      await t.clearAll();
      const ok =
        chip === 'Word art' &&
        !pressed &&
        bolded &&
        ringBefore !== null &&
        ringArmed === null &&
        chipArmed === null;
      return {
        ok,
        observed: `chip "${chip}"; B pressed at insert ${pressed}; weight ${weight0} -> ${weight1} after one press (bolder ${bolded}); ring before arming ${ringBefore ? 'drawn' : 'none'}, after arming the elbow tool ring ${ringArmed ? 'still drawn' : 'gone'}, chip ${chipArmed ? `"${chipArmed}"` : 'gone'}${ok ? '' : ` (docs/POLISH.md 2.4 item 34, ${LANE} with B1's Editor.tsx hunks)`}`,
      };
    },
  );
}

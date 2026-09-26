// The live gestures (docs/OBJECTS.md section 2, 2.6 and 6.1, the `gestures.*` rows; the objects
// round, B4 drives, B1 builds): every gesture draws the object itself at every frame through the
// draft document. Each row is a frame comparison at the tenth step of a 12 step drag captured by
// the toolkit's `captureDrag` (the object's own box on the sheet against the ring's box within
// 1 px, the element drawn at that size), the drawn shape visible with its fill at the fifth step
// of a draw, the placement drawn within one frame of the press, the rotated ring turned with the
// object during and after, the connector re-routed at the tenth step of its shape's move, the
// cadence and the cost budget read from `describe().state.gesture` (the integrator's field by
// B1's request; a build without it reads not driven with the field named), the readout, and the
// one watch row of 4.2 item 2. The rows belong to the arrange feature (AREA_FEATURE), which is
// unparkable: a red one fails the ship. The frames of record before the build are under
// docs/gslides-parity/objects/audit/ (gestures-frames.md, local-frames.md).

export const NAME = 'gestures';
export const IDS = [
  'gestures.draw.shape-fill-at-step5',
  'gestures.draw.click-at-press',
  'gestures.draw.text-box-frame',
  'gestures.draw.grammar-slide-converts',
  'gestures.resize.shape-follows',
  'gestures.resize.text-reflows',
  'gestures.resize.picture-follows',
  'gestures.resize.table-follows',
  'gestures.seam.table-follows',
  'gestures.resize.chart-follows',
  'gestures.resize.diagram-follows',
  'gestures.resize.wordart-scales',
  'gestures.move.connector-follows-live',
  'gestures.rotate.ring-turns-live',
  'gestures.rotate.ring-after-release',
  'gestures.frame.one-render-per-frame',
  'gestures.frame.cost-budget',
  'gestures.readout.stays',
  'gestures.watch.chart-se-after-mark-click',
];

const LANE = 'B1';
/** The overlay's readouts (packages/chrome/src/menus/strings.ts CANVAS): the size, the angle, the width. */
const SIZE = /^\d+ × \d+/;
const ANGLE = /^-?\d+°$/;
const WIDTH = /^\d+ px$/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const boxStr = (b) => (b ? `${r1(b.x)},${r1(b.y)} ${r1(b.w)}x${r1(b.h)}` : 'none');
/** An rgb() or #rrggbb string as three channels, or null. */
const rgb = (s) => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s ?? '');
  if (m)
    return m[4] !== undefined && Number(m[4]) === 0 ? null : [1, 2, 3].map((i) => Number(m[i]));
  const h = /^#([0-9a-f]{6})$/i.exec((s ?? '').trim());
  return h ? [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) : null;
};
const painted = (s) => s !== null && s !== undefined && s !== 'none' && rgb(s) !== null;
const sameColour = (a, b) => {
  const x = rgb(a);
  const y = rgb(b);
  return x !== null && y !== null && x.every((v, i) => Math.abs(v - y[i]) <= 2);
};
/** The distance from a point to a box's boundary (0 on it, positive inside or outside). */
const edgeDistance = (p, b) => {
  const x0 = b.x;
  const x1 = b.x + b.w;
  const y0 = b.y;
  const y1 = b.y + b.h;
  const inside = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  if (inside) return Math.min(p.x - x0, x1 - p.x, p.y - y0, y1 - p.y);
  const dx = p.x < x0 ? x0 - p.x : p.x > x1 ? p.x - x1 : 0;
  const dy = p.y < y0 ? y0 - p.y : p.y > y1 ? p.y - y1 : 0;
  return Math.hypot(dx, dy);
};
/** The bounding box of a corner list. */
const boundsOf = (corners) => {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};

export async function run(t) {
  const { page } = t;
  const notBuilt = (field) => ({
    ok: null,
    observed: `not on this build: ${field} (docs/OBJECTS.md 2.4, ${LANE} by request to the integrator)`,
  });
  /** A fresh blank slide after the last one this area made. */
  let last = t.deck.wordArtSlide ?? t.deck.titleSlide;
  const slide = async (name, layout = 'blank') => {
    const id = await t.setupSlide(last, layout);
    if (id) last = id;
    t.deck[name] = id;
    return id;
  };
  /** The block the walk reads by id on a slide. */
  const posOn = async (S, id) => (await t.blockOf(S, id))?.pos ?? null;
  const blockOn = async (S, id) => (await t.blockOf(S, id))?.block ?? null;
  const revision = async () => (await t.state()).revision;
  const undoOnce = async () => {
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(200);
    }
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  /** Arms a shape tool through Insert > Shape (the named rows; the hexagon from the Shapes grid). */
  const armShape = async (kind) => {
    await t.clearAll();
    await t.surfaceClear();
    if (kind === 'hexagon') {
      await t.menuPath(
        'insert',
        'insert.shape',
        'insert.shape.gallery',
        'insert.shape.gallery.pick.hexagon',
      );
      return 'insert.shape.gallery.pick.hexagon';
    }
    await t.menuPath('insert', 'insert.shape', `insert.shape.shapes.${kind}`);
    return `insert.shape.shapes.${kind}`;
  };
  /** The id of the block a draw made, read from a frame's free list against the ids before it. */
  const fresh = (before) => (facts) => facts?.frees?.find((id) => !before.includes(id)) ?? null;
  /** The captures the readout row reads at the end. */
  const captures = { draw: null, rotate: null, seam: null };

  // ---------------------------------------------------------------------------------------------
  // the draw and the placement (2.3 items 1 and 2, 2.4)

  const G1 = await t
    .setup('a blank slide for the draw rows', 'slide.new through the window API', async () => {
      const id = await slide('gestureDrawSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureDrawSlide);
  await t.clickCard(G1);
  await t.clearAll();
  await t.reachSetup('Insert > Shape', 'insert', 'insert.shape', 'insert.shape.shapes.rectangle');
  const plate = await t.sheetVar('--plate');
  const ink = await t.sheetVar('--ink');

  await t.step(
    'gestures.draw.shape-fill-at-step5',
    'Rectangle, Rounded rectangle, Ellipse and the hexagon each drawn by a 12 step drag of 320 by 200; Cmd+Z after each',
    'at the fifth step the shape exists on the sheet at the drag box with the plate fill and the ink stroke and the readout reads its size; the release commits one block there and Cmd+Z removes it',
    async () => {
      const out = [];
      let ok = true;
      for (const kind of ['rectangle', 'rounded', 'ellipse', 'hexagon']) {
        await t.clearAll();
        const before = await t.objectIds(G1);
        const freesBefore = await t.frameFacts(null).then((f) => f?.frees ?? []);
        const route = await armShape(kind);
        const cap = await t.captureSheetDrag(
          { x: 300, y: 200 },
          { x: 320, y: 200 },
          { idOf: fresh(freesBefore), shots: `gestures-draw-${kind}` },
        );
        if (kind === 'rectangle') captures.draw = cap;
        const f5 = t.frameAt(cap, 'step5');
        const drawn5 = { x: 300, y: 200, w: r1((320 * 5) / 12), h: r1((200 * 5) / 12) };
        const frame = f5?.marquee ?? f5?.ring ?? null;
        const objectVsFrame = t.compareFrame(f5?.free, frame);
        /* the committed box is on the 8 px grid (Gestures.tsx drawnPosition), so the drawn box
           is read within the grid's 8 px and the frame around it within 1 px */
        const objectVsDrag = t.compareFrame(f5?.free, drawn5, { tolerance: 8 });
        const fill = f5?.shape?.el?.fill ?? null;
        const stroke = f5?.shape?.el?.stroke ?? null;
        const readout5 = f5?.readout ?? null;
        await t.settled();
        const after = await t.pollUntil(
          () => t.objectsOf(G1),
          (o) => o.length === before.length + 1,
          8000,
        );
        const made = after.filter((o) => !before.includes(o.id));
        const one = made.length === 1 ? made[0] : null;
        const atBox = one
          ? t.compareFrame(one.pos, { x: 300, y: 200, w: 320, h: 200 }, { tolerance: 8 })
          : { ok: false };
        await t.clearAll();
        await undoOnce();
        const gone = (await t.objectIds(G1)).length === before.length;
        const pass =
          f5?.free !== null &&
          f5?.free !== undefined &&
          objectVsFrame.ok &&
          objectVsDrag.ok &&
          painted(fill) &&
          painted(stroke) &&
          readout5 !== null &&
          SIZE.test(readout5) &&
          one !== null &&
          atBox.ok &&
          gone;
        ok = ok && pass;
        out.push(
          `${kind} (${route}): at step 5 ${f5?.free ? `the shape ${boxStr(f5.free)} (drag box ${boxStr(drawn5)}, off by ${objectVsDrag.dx}/${objectVsDrag.dy}/${objectVsDrag.dw}/${objectVsDrag.dh}), frame ${boxStr(frame)} (${objectVsFrame.ok ? 'equal' : `off by ${objectVsFrame.dx}/${objectVsFrame.dy}/${objectVsFrame.dw}/${objectVsFrame.dh}`}), fill ${fill}${plate ? ` (plate ${plate}${sameColour(fill, plate) ? ', the same' : ''})` : ''}, stroke ${stroke}${ink ? ` (ink ${ink}${sameColour(stroke, ink) ? ', the same' : ''})` : ''}` : `no shape element (frees ${(f5?.frees ?? []).length}, marquee ${boxStr(f5?.marquee)})`}, readout ${readout5 === null ? 'none' : `"${readout5}"`}; the release made ${made.length} block(s)${one ? ` at ${t.posStr(one.pos)}` : ''}; Cmd+Z removed it ${gone}`,
        );
      }
      return {
        ok,
        observed: `${out.join(' | ')}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'gestures.draw.click-at-press',
    'Rectangle armed; pointer down at 1000,620 and held 120 ms; release',
    'the shape is drawn at 240 by 160 from the press point within one animation frame; the block is committed within one frame of the release; the selection is the new shape',
    async () => {
      await t.clearAll();
      const before = await t.objectIds(G1);
      const freesBefore = (await t.frameFacts(null))?.frees ?? [];
      await armShape('rectangle');
      const p = await t.sheetPoint(1000, 620);
      await t.moveHuman({ x: p.x - 30, y: p.y - 20 }, p, 6);
      await t.sleep(80);
      const t0 = Date.now();
      await page.mouse.down();
      let drawnAt = null;
      let drawnBox = null;
      let id = null;
      const until = t0 + 120;
      for (;;) {
        const f = await t.frameFacts(null);
        const found = fresh(freesBefore)(f);
        if (found) {
          drawnAt = Date.now() - t0;
          id = found;
          drawnBox = f.blocks[found] ?? null;
          break;
        }
        if (Date.now() > until) break;
        await t.sleep(8);
      }
      const held = Date.now() - t0;
      if (held < 120) await t.sleep(120 - held);
      const t1 = Date.now();
      await page.mouse.up();
      let committedAt = null;
      let made = [];
      for (;;) {
        const objs = await t.objectsOf(G1);
        made = objs.filter((o) => !before.includes(o.id));
        if (made.length > 0) {
          committedAt = Date.now() - t1;
          break;
        }
        if (Date.now() - t1 > 2000) break;
        await t.sleep(8);
      }
      await t.sleep(300);
      const ctrls = await t.handleControls();
      const one = made.length === 1 ? made[0] : null;
      const selected = one !== null && ctrls.includes(`handle.${one.id}.move`);
      const atPress = t.compareFrame(
        drawnBox,
        { x: 1000, y: 620, w: 240, h: 160 },
        { tolerance: 8 },
      );
      const ok =
        drawnAt !== null &&
        drawnAt <= 40 &&
        atPress.ok &&
        one !== null &&
        committedAt !== null &&
        committedAt <= 100 &&
        selected;
      if (one) {
        await t.clearAll();
        await undoOnce();
      }
      return {
        ok,
        observed: `${drawnAt === null ? 'nothing drawn while the pointer was down for 120 ms' : `drawn ${drawnAt} ms after the press at ${boxStr(drawnBox)} (${id})`}; ${one ? `the block ${one.id} ${t.posStr(one.pos)} committed ${committedAt} ms after the release` : `${made.length} blocks after the release`}; selected ${selected}${ok ? '' : ` (docs/OBJECTS.md 2.4, question 2, ${LANE})`}`,
      };
    },
  );

  let textBox = null;
  await t.step(
    'gestures.draw.text-box-frame',
    'Insert > Text box; a 12 step drag of 400 by 140 from 700,500',
    'the frame follows with the size readout and no text is drawn until the release; the release opens the caret in the new box',
    async () => {
      await t.clearAll();
      const before = await t.objectIds(G1);
      const freesBefore = (await t.frameFacts(null))?.frees ?? [];
      await t.menuPath('insert', 'insert.textBox');
      const cap = await t.captureSheetDrag(
        { x: 700, y: 500 },
        { x: 400, y: 140 },
        { idOf: fresh(freesBefore) },
      );
      const steps = cap.frames.filter((f) => /^step([2-9]|1[0-2])$/.test(f.tag));
      const framed = steps.map((f) => {
        const box = f.facts?.marquee ?? f.facts?.ring ?? null;
        const n = Number(f.tag.slice(4));
        const want = { x: 700, y: 500, w: r1((400 * n) / 12), h: r1((140 * n) / 12) };
        return { tag: f.tag, box, ok: t.compareFrame(box, want, { tolerance: 8 }).ok };
      });
      const readouts = t.readoutsOf(cap, SIZE);
      const textDrawn = steps.some((f) => (f.facts?.text?.sample ?? '').trim().length > 0);
      const up = t.frameAt(cap, 'up+400');
      await t.settled();
      const made = (await t.objectsOf(G1)).filter((o) => !before.includes(o.id));
      const one = made.length === 1 ? made[0] : null;
      textBox = one?.id ?? null;
      const caret = up?.editing === true || (await t.editing());
      if (caret) {
        await t.press('Escape');
        await t.sleep(200);
      }
      const framedEvery = framed.length > 0 && framed.every((f) => f.ok);
      const ok =
        framedEvery &&
        readouts.every &&
        !textDrawn &&
        one !== null &&
        one.type === 'text' &&
        t.compareFrame(one.pos, { x: 700, y: 500, w: 400, h: 140 }, { tolerance: 8 }).ok &&
        caret;
      return {
        ok,
        observed: `the frame followed at ${framed.filter((f) => f.ok).length} of ${framed.length} steps (step 10 ${boxStr(framed.find((f) => f.tag === 'step10')?.box)}); readouts ${readouts.every ? 'the size at every step' : JSON.stringify(readouts.steps.slice(0, 4))}; text drawn during the drag ${textDrawn}; the release made ${made.length} block(s)${one ? ` ${one.type} ${t.posStr(one.pos)}` : ''}; caret ${caret}`,
      };
    },
  );

  const G2 = await t
    .setup(
      'a Title and body slide (not a canvas) for the conversion row',
      'slide.new through the window API',
      async () => {
        const id = await slide('gestureGrammarSlide', 'split');
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.gestureGrammarSlide);
  await t.clickCard(G2);
  await t.step(
    'gestures.draw.grammar-slide-converts',
    'on the grammar slide, Rectangle drawn by a 12 step drag of 320 by 200; Cmd+Z',
    'the shape is drawn over the provisional canvas at the fifth step; the release converts the slide once in one commit; Cmd+Z restores the grammar slide',
    async () => {
      await t.clearAll();
      const jsonBefore = await t.slideJson(G2);
      const canvasBefore = /"canvas"/.test(JSON.stringify(jsonBefore));
      const before = await t.allBlockIds(G2);
      const freesBefore = (await t.frameFacts(null))?.frees ?? [];
      const rev0 = await t.stableRevision();
      await armShape('rectangle');
      const cap = await t.captureSheetDrag(
        { x: 300, y: 200 },
        { x: 320, y: 200 },
        { idOf: fresh(freesBefore), shots: 'gestures-draw-grammar' },
      );
      const f5 = t.frameAt(cap, 'step5');
      const drawn5 = f5?.free
        ? t.compareFrame(
            f5.free,
            { x: 300, y: 200, w: r1((320 * 5) / 12), h: r1((200 * 5) / 12) },
            { tolerance: 8 },
          )
        : { ok: false };
      await t.settled();
      const rev1 = await t.pollUntil(revision, (r) => r > rev0, 8000).catch(revision);
      const after = await t.allBlockIds(G2);
      const made = after.filter((id) => !before.includes(id));
      const jsonAfter = await t.slideJson(G2);
      const converted = /"canvas"/.test(JSON.stringify(jsonAfter)) && !canvasBefore;
      await t.clearAll();
      await undoOnce();
      const jsonBack = await t.slideJson(G2);
      const idsBack = await t.allBlockIds(G2);
      const restored =
        same(jsonBack, jsonBefore) ||
        (same([...idsBack].sort(), [...before].sort()) &&
          /"canvas"/.test(JSON.stringify(jsonBack)) === canvasBefore);
      const ok =
        Boolean(f5?.free) && drawn5.ok && made.length === 1 && rev1 === rev0 + 1 && restored;
      return {
        ok,
        observed: `canvas before ${canvasBefore}; at step 5 ${f5?.free ? `the shape ${boxStr(f5.free)} (off the drag box by ${drawn5.dx}/${drawn5.dy}/${drawn5.dw}/${drawn5.dh})` : `no shape element (marquee ${boxStr(f5?.marquee)})`}; the release: ${made.length} new block(s), converted ${converted}, revision ${rev0} -> ${rev1}; Cmd+Z restored the slide ${restored}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the resizes (2.2, 2.6): the shapes, the text, the picture

  const G3 = await t
    .setup('a blank slide for the resize rows', 'slide.new through the window API', async () => {
      const id = await slide('gestureResizeSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureResizeSlide);
  await t.clickCard(G3);
  await t.clearAll();
  const SHAPES = [
    { id: 'g-rect', shape: 'rectangle', x: 80 },
    { id: 'g-round', shape: 'rounded', x: 400 },
    { id: 'g-ellipse', shape: 'ellipse', x: 720 },
    { id: 'g-star', shape: 'star5', x: 1040 },
  ];
  await t.setup(
    'four shapes on the resize slide',
    'block.insert through the window API',
    async () => {
      const placed = [];
      for (const s of SHAPES) {
        const obj = await t.placeBlock(G3, {
          id: s.id,
          type: 'shape',
          shape: s.shape,
          fill: 'plate',
          stroke: 'ink',
          pos: { x: s.x, y: 80, w: 240, h: 160 },
        });
        if (obj) placed.push(obj.id);
      }
      return { ok: placed.length === 4, observed: placed.join(', ') };
    },
  );
  /** A select by one click, Escape when a session opened, the handles read; null when the object is not selected. */
  const select = async (id) => {
    await t.clearAll();
    return t.selectObject(id);
  };
  await t.step(
    'gestures.resize.shape-follows',
    'each shape selected and resized from the se handle by 200 by 120 in 12 steps; Cmd+Z after each',
    "at the tenth step the object's box equals the ring's within 1 px, the svg's width and height are the box's, the star's path has changed; the readout reads the size",
    async () => {
      const out = [];
      let ok = true;
      for (const s of SHAPES) {
        if (!(await select(s.id))) {
          ok = false;
          out.push(`${s.shape}: not selected`);
          continue;
        }
        const cap = await t.captureHandleDrag(
          `handle.${s.id}.resize.se`,
          { x: 200, y: 120 },
          { id: s.id, shots: `gestures-resize-${s.shape}` },
        );
        if (!cap) {
          ok = false;
          out.push(`${s.shape}: no se handle`);
          continue;
        }
        const f0 = t.frameAt(cap, 'before');
        const f10 = t.frameAt(cap, 'step10');
        const c = t.compareFrame(f10?.free, f10?.ring);
        const attrOk =
          f10?.shape !== null &&
          t.near(Number(f10.shape.attrW), f10.free.w, 1) &&
          t.near(Number(f10.shape.attrH), f10.free.h, 1);
        const grew = f10?.free && f0?.free && f10.free.w > f0.free.w + 100;
        const pathChanged =
          s.shape !== 'star5' || (f10?.shape?.el?.d ?? '') !== (f0?.shape?.el?.d ?? '');
        const readouts = t.readoutsOf(cap, SIZE);
        const pass = c.ok && attrOk && Boolean(grew) && pathChanged && readouts.every;
        ok = ok && pass;
        out.push(
          `${s.shape}: step 10 ${t.describeFrame(f10)}, svg ${f10?.shape?.attrW}x${f10?.shape?.attrH}${s.shape === 'star5' ? `, path changed ${pathChanged}` : ''}`,
        );
        await undoOnce();
      }
      return { ok, observed: `${out.join(' | ')}${ok ? '' : ` (docs/OBJECTS.md 2.6, ${LANE})`}` };
    },
  );

  const TEXT = 'g-text';
  await t.setup('a text box of twelve words', 'block.insert through the window API', async () => {
    const obj = await t.placeBlock(G3, {
      id: TEXT,
      type: 'text',
      text: 'Twelve short words sit on one line until the box is narrowed enough',
      pos: { x: 80, y: 400, w: 640, h: 64 },
    });
    return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
  });
  await t.step(
    'gestures.resize.text-reflows',
    'the text box narrowed from the e handle by 200 in 12 steps, then grown back by 200',
    "at the tenth step the box equals the ring's within 1 px (the 10 px outset removed) and the paragraph draws more line boxes than at the start; grown back, fewer",
    async () => {
      if (!(await select(TEXT))) return { ok: false, observed: 'the text box was not selected' };
      const narrow = await t.captureHandleDrag(
        `handle.${TEXT}.resize.e`,
        { x: -200, y: 0 },
        { id: TEXT, shots: 'gestures-text-narrow' },
      );
      if (!narrow) return { ok: false, observed: 'no e handle on the text box' };
      const f0 = t.frameAt(narrow, 'before');
      const f10 = t.frameAt(narrow, 'step10');
      const c = t.compareFrame(f10?.free, f10?.ring, { outset: 10 });
      const lines0 = f0?.text?.lines ?? null;
      const lines10 = f10?.text?.lines ?? null;
      await t.settled();
      await select(TEXT);
      const grow = await t.captureHandleDrag(
        `handle.${TEXT}.resize.e`,
        { x: 200, y: 0 },
        { id: TEXT },
      );
      const g10 = grow ? t.frameAt(grow, 'step10') : null;
      const linesBack = g10?.text?.lines ?? null;
      const cBack = t.compareFrame(g10?.free, g10?.ring, { outset: 10 });
      await t.settled();
      const ok =
        c.ok &&
        lines0 !== null &&
        lines10 !== null &&
        lines10 > lines0 &&
        linesBack !== null &&
        linesBack < lines10 &&
        cBack.ok;
      return {
        ok,
        observed: `narrowed: step 10 ${t.describeFrame(f10, 10)}, lines ${lines0} -> ${lines10}; grown back: step 10 ${t.describeFrame(g10, 10)}, lines ${linesBack}`,
      };
    },
  );

  let PIC = null;
  await t.setup(
    'a picture with a trim',
    'asset.add, block.insert and block.set through the window API',
    async () => {
      const obj = await t.placePicture(
        G3,
        { x: 800, y: 400, w: 384, h: 256 },
        `g-pic-${Date.now().toString(36)}`,
      );
      if (!obj) return { ok: false, observed: 'no picture' };
      PIC = obj.id;
      await t.setBlock(G3, PIC, '/trim', { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
      const b = await blockOn(G3, PIC);
      return { ok: Boolean(b?.trim), observed: `${PIC} trim ${JSON.stringify(b?.trim)}` };
    },
  );
  await t.step(
    'gestures.resize.picture-follows',
    'the trimmed picture resized from the se handle by 240 by 160 in 12 steps; Cmd+Z',
    "at the tenth step the picture's frame equals the ring's box within 1 px and the image inside scales with the frame (its box the frame's over the kept fraction)",
    async () => {
      if (!(await select(PIC))) return { ok: false, observed: 'the picture was not selected' };
      const cap = await t.captureHandleDrag(
        `handle.${PIC}.resize.se`,
        { x: 240, y: 160 },
        { id: PIC, shots: 'gestures-picture' },
      );
      if (!cap) return { ok: false, observed: 'no se handle on the picture' };
      const f0 = t.frameAt(cap, 'before');
      const f10 = t.frameAt(cap, 'step10');
      const frame = f10?.picture?.frame ?? f10?.picture?.box ?? null;
      const c = t.compareFrame(frame, f10?.ring);
      const img = f10?.picture?.box ?? null;
      const kept = 0.8;
      const scaled =
        img !== null &&
        frame !== null &&
        t.near(img.w, frame.w / kept, 2) &&
        t.near(img.h, frame.h / kept, 2);
      const grew = f10?.free && f0?.free && f10.free.w > f0.free.w + 150;
      await undoOnce();
      const ok = c.ok && scaled && Boolean(grew);
      return {
        ok,
        observed: `step 10: frame ${boxStr(frame)} against the ring ${boxStr(f10?.ring)} (${c.ok ? 'equal' : `off by ${c.dx}/${c.dy}/${c.dw}/${c.dh}`}); img ${boxStr(img)} (the frame over ${kept}: ${scaled}); trim ${f10?.picture?.trim ?? 'none'}; the box ${boxStr(f0?.free)} -> ${boxStr(f10?.free)}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the table, its seam, the chart and the word art (2.2, 2.6, 4.2 item 7)

  const G4 = await t
    .setup(
      'a blank slide for the table, the chart and the word art',
      'slide.new through the window API',
      async () => {
        const id = await slide('gestureDocsSlide');
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.gestureDocsSlide);
  await t.clickCard(G4);
  await t.clearAll();
  const TABLE = 'g-table';
  const CHART = 'g-chart';
  const WORD = 'g-wordart';
  await t.setup(
    'a typed 3 by 3 table, a column chart and a word art',
    'block.insert through the window API',
    async () => {
      const table = await t.placeBlock(G4, {
        id: TABLE,
        type: 'table',
        columns: [{}, {}, {}],
        rows: [
          { cells: ['H0', 'H1', 'H2'], header: true },
          { cells: ['R1C0', 'R1C1', 'R1C2'] },
          { cells: ['R2C0', 'R2C1', 'R2C2'] },
        ],
        pos: { x: 80, y: 60, w: 960, h: 200 },
      });
      const chart = await t.placeBlock(G4, {
        id: CHART,
        type: 'chart',
        kind: 'column',
        categories: ['North', 'South', 'West'],
        series: [{ name: 'Bookings', values: [30, 45, 20] }],
        pos: { x: 80, y: 420, w: 640, h: 360 },
      });
      const word = await t.placeBlock(G4, {
        id: WORD,
        type: 'text',
        text: 'Big words',
        typography: { size: 88, weight: 500, align: 'center' },
        outline: { color: 'ink', width: 1.5 },
        pos: { x: 780, y: 420, w: 800, h: 120 },
      });
      return {
        ok: Boolean(table && chart && word),
        observed: [table, chart, word].map((o) => o?.id ?? 'none').join(', '),
      };
    },
  );
  /** Selects the table as an object: one click, Escape when a cell opened (FEATURES.md 2.1). */
  const selectTable = async (id) => {
    const ctrls = await select(id);
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(200);
    }
    return ctrls ?? (await t.handleControls());
  };
  await t.step(
    'gestures.resize.table-follows',
    'the table selected and resized from the se handle by 200 by 120 in 12 steps; Cmd+Z',
    "at the tenth step the table's box equals the ring's within 1 px and the header cells' widths are a third of it",
    async () => {
      const ctrls = await selectTable(TABLE);
      if (!ctrls.includes(`handle.${TABLE}.move`))
        return { ok: false, observed: `the table was not selected (handles ${ctrls.join(', ')})` };
      const cap = await t.captureHandleDrag(
        `handle.${TABLE}.resize.se`,
        { x: 200, y: 120 },
        { id: TABLE, shots: 'gestures-table' },
      );
      if (!cap) return { ok: false, observed: 'no se handle on the table' };
      const f0 = t.frameAt(cap, 'before');
      const f10 = t.frameAt(cap, 'step10');
      const c = t.compareFrame(f10?.free, f10?.ring);
      const header = f10?.cells?.rows?.[0] ?? [];
      const third = f10?.free ? f10.free.w / 3 : null;
      const thirds =
        header.length === 3 && header.every((cell) => cell && t.near(cell.w, third, 2));
      const grew = f10?.free && f0?.free && f10.free.w > f0.free.w + 150;
      await undoOnce();
      const ok = c.ok && thirds && Boolean(grew);
      return {
        ok,
        observed: `step 10 ${t.describeFrame(f10)}; header cells ${header.map((cell) => r1(cell?.w)).join(', ')} against a third ${r1(third)} (${thirds}); the box ${boxStr(f0?.free)} -> ${boxStr(f10?.free)}`,
      };
    },
  );

  await t.step(
    'gestures.seam.table-follows',
    'the first column seam dragged by 90 in 12 steps; Cmd+Z',
    "at the tenth step the first column's drawn width equals the readout within 1 px and the second column narrowed by the same",
    async () => {
      await selectTable(TABLE);
      const cap = await t.captureHandleDrag(
        `handle.${TABLE}.column.0`,
        { x: 90, y: 0 },
        { id: TABLE, shots: 'gestures-seam' },
      );
      if (!cap)
        return {
          ok: false,
          observed: `no column seam handle (handles ${(await t.handleControls()).join(', ')})`,
        };
      captures.seam = cap;
      const f0 = t.frameAt(cap, 'before');
      const f10 = t.frameAt(cap, 'step10');
      const c0 = f0?.cells?.rows?.[0] ?? [];
      const c10 = f10?.cells?.rows?.[0] ?? [];
      const readout = f10?.readout ?? null;
      const px = readout && WIDTH.test(readout) ? Number(readout.replace(/ px$/, '')) : null;
      const widthOk = px !== null && c10[0] && t.near(c10[0].w, px, 1);
      const moved = c10[0] && c0[0] ? c10[0].w - c0[0].w : null;
      const narrowed =
        moved !== null && c10[1] && c0[1] && t.near(c0[1].w - c10[1].w, moved, 2) && moved > 60;
      await undoOnce();
      const ok = Boolean(widthOk) && Boolean(narrowed);
      return {
        ok,
        observed: `step 10: column 0 ${r1(c0[0]?.w)} -> ${r1(c10[0]?.w)} against the readout ${readout === null ? 'none' : `"${readout}"`} (${widthOk}); column 1 ${r1(c0[1]?.w)} -> ${r1(c10[1]?.w)} (narrowed by the same ${narrowed})`,
      };
    },
  );

  await t.step(
    'gestures.resize.chart-follows',
    'the column chart selected and resized from the se handle by 260 by 160 in 12 steps; Cmd+Z',
    "at the tenth step the svg's box equals the ring's within 1 px and the first bar's width changed",
    async () => {
      if (!(await select(CHART))) return { ok: false, observed: 'the chart was not selected' };
      const cap = await t.captureHandleDrag(
        `handle.${CHART}.resize.se`,
        { x: 260, y: 160 },
        { id: CHART, shots: 'gestures-chart' },
      );
      if (!cap) return { ok: false, observed: 'no se handle on the chart' };
      const f0 = t.frameAt(cap, 'before');
      const f10 = t.frameAt(cap, 'step10');
      const c = t.compareFrame(f10?.shape?.box, f10?.ring);
      const bar0 = f0?.shape?.bars?.[0]?.width ?? null;
      const bar10 = f10?.shape?.bars?.[0]?.width ?? null;
      const barChanged = bar0 !== null && bar10 !== null && bar10 !== bar0;
      await undoOnce();
      const ok = c.ok && barChanged;
      return {
        ok,
        observed: `step 10: svg ${boxStr(f10?.shape?.box)} against the ring ${boxStr(f10?.ring)} (${c.ok ? 'equal' : `off by ${c.dx}/${c.dy}/${c.dw}/${c.dh}`}); the first bar ${bar0} -> ${bar10}; readout ${f10?.readout === null ? 'none' : `"${f10?.readout}"`}`,
      };
    },
  );

  await t.step(
    'gestures.resize.wordart-scales',
    'the word art selected and resized from the se handle by 260 by 120 in 12 steps; Cmd+Z',
    "at the tenth step the drawn font size equals the readout's letter size and the box equals the ring's within 1 px",
    async () => {
      if (!(await select(WORD))) return { ok: false, observed: 'the word art was not selected' };
      const cap = await t.captureHandleDrag(
        `handle.${WORD}.resize.se`,
        { x: 260, y: 120 },
        { id: WORD, shots: 'gestures-wordart' },
      );
      if (!cap) return { ok: false, observed: 'no se handle on the word art' };
      const f0 = t.frameAt(cap, 'before');
      const f10 = t.frameAt(cap, 'step10');
      /* the word art's ring is a text ring: the 10 px outset (text-ring.ts) */
      const c = t.compareFrame(f10?.free, f10?.ring, { outset: 10 });
      const readout = f10?.readout ?? null;
      const letter = /·\s*(\d+)/.exec(readout ?? '');
      const size = letter ? Number(letter[1]) : null;
      const drawn = f10?.text?.fontSize ?? null;
      const scaled = size !== null && drawn !== null && t.near(drawn, size, 1.5);
      const grew =
        drawn !== null && f0?.text?.fontSize !== null && drawn > (f0?.text?.fontSize ?? 0) + 20;
      await undoOnce();
      const ok = c.ok && scaled && Boolean(grew);
      return {
        ok,
        observed: `step 10 ${t.describeFrame(f10, 10)}; the readout's letter size ${size ?? 'none'}, drawn ${drawn} px (from ${f0?.text?.fontSize} px)${ok ? '' : ' (docs/OBJECTS.md 4.2 item 7; FEATURES.md 2.3 item 8)'}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the diagram's group (2.6, 4.2 items 3 and 7)

  const G5 = await t
    .setup('a blank slide for the diagram', 'slide.new through the window API', async () => {
      const id = await slide('gestureDiagramSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureDiagramSlide);
  await t.clickCard(G5);
  await t.clearAll();
  const members = async () => (await t.objectsOf(G5)).filter((o) => o.pos?.group !== undefined);
  const isBox = (o) =>
    o.type === 'shape' && !/line|elbow|curve|arrow|polyline|scribble/i.test(o.block.shape ?? '');
  const isLink = (o) => o.type === 'shape' && /line|elbow|curve|arrow/i.test(o.block.shape ?? '');
  await t.step(
    'gestures.resize.diagram-follows',
    'Insert > Diagram, Process, Insert; one click on a step; the se handle dragged by 160 by 90 in 12 steps; Cmd+Z',
    "at the tenth step every member's box lies inside the ring and the links' ends sit on their steps' sites",
    async () => {
      await t.menuPath('insert', 'insert.diagram');
      await t.waitControl('panel.diagram', 8000);
      await t.clickControl('insert.diagram.type.process');
      await t.sleep(300);
      await t.clickControl('insert.diagram.insert');
      const list = await t.pollUntil(members, (m) => m.length >= 5, 15_000).catch(members);
      await t.settled();
      if (await t.visible('panel.diagram.close')) await t.clickControl('panel.diagram.close');
      const boxes = list.filter(isBox);
      const links = list.filter(isLink);
      const step = boxes[0];
      if (!step) return { ok: false, observed: `no diagram step among ${list.length} members` };
      await t.clearAll();
      const { facts } = await t.clickSelect(step.id);
      const se = (await t.handleControls()).find((c) => /\.resize\.se$/.test(c)) ?? null;
      if (!se)
        return {
          ok: false,
          observed: `no se handle on the group (chip "${facts.chip}", handles ${facts.handles.join(', ')})`,
        };
      const cap = await t.captureHandleDrag(
        se,
        { x: 160, y: 90 },
        { id: step.id, lines: links.map((l) => l.id), shots: 'gestures-diagram' },
      );
      const f10 = t.frameAt(cap, 'step10');
      const ring = f10?.ring ?? null;
      const inside = ring
        ? list.map((o) => {
            const b = f10.blocks[o.id];
            const ok =
              b &&
              b.x >= ring.x - 2 &&
              b.y >= ring.y - 2 &&
              b.x + b.w <= ring.x + ring.w + 2 &&
              b.y + b.h <= ring.y + ring.h + 2;
            return { id: o.id, ok: Boolean(ok) };
          })
        : [];
      const boxBoxes = boxes.map((o) => f10?.blocks?.[o.id]).filter(Boolean);
      const ends = links.map((l) => {
        const line = f10?.lines?.[l.id] ?? null;
        if (!line) return { id: l.id, start: null, end: null };
        const d = (p) =>
          Math.min(...boxBoxes.map((b) => edgeDistance(p, b)), Number.POSITIVE_INFINITY);
        return { id: l.id, start: r1(d(line.start)), end: r1(d(line.end)) };
      });
      const onSites =
        ends.length > 0 && ends.every((e) => e.start !== null && e.start <= 4 && e.end <= 4);
      const allInside = inside.length === list.length && inside.every((x) => x.ok);
      await undoOnce();
      const ok = facts.chip === 'Group' && allInside && onSites;
      return {
        ok,
        observed: `${list.length} members (${boxes.length} steps, ${links.length} links), chip "${facts.chip}"; step 10: ring ${boxStr(ring)}, members inside ${inside.filter((x) => x.ok).length} of ${inside.length}; link ends on a step's edge: ${ends.map((e) => `${e.start ?? '?'}/${e.end ?? '?'}`).join(', ')} px${ok ? '' : ` (docs/OBJECTS.md 4.2 item 7, ${LANE})`}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the connector during a move (2.3 item 4, 2.4)

  const G6 = await t
    .setup('a blank slide for the connector', 'slide.new through the window API', async () => {
      const id = await slide('gestureConnectorSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureConnectorSlide);
  await t.clickCard(G6);
  await t.clearAll();
  const A = 'g-con-a';
  const B = 'g-con-b';
  const ELBOW = 'g-con-elbow';
  await t.setup(
    'two rectangles joined by an elbow connector',
    'block.insert through the window API',
    async () => {
      const rect = (id, x) => ({
        id,
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        pos: { x, y: 300, w: 240, h: 160 },
      });
      const a = await t.placeBlock(G6, rect(A, 160));
      const b = await t.placeBlock(G6, rect(B, 800));
      const e = await t.placeBlock(G6, {
        id: ELBOW,
        type: 'shape',
        shape: 'elbow',
        stroke: 'ink',
        width: 2,
        orientation: 'horizontal',
        connect: { start: { block: A, site: 3 }, end: { block: B, site: 1 } },
        pos: { x: 400, y: 380, w: 400, h: 1 },
      });
      return {
        ok: Boolean(a && b && e),
        observed: [a, b, e].map((o) => o?.id ?? 'none').join(', '),
      };
    },
  );
  await t.step(
    'gestures.move.connector-follows-live',
    'B selected by one click and moved from inside by 150 by 100 in 12 steps',
    "at the tenth step the connector's end sits on B's left site within 1 px; the release writes the connector once",
    async () => {
      await t.clearAll();
      const { facts } = await t.clickSelect(B);
      if (!facts.selected)
        return { ok: false, observed: `B not selected (${t.describeSelection(facts)})` };
      const rev0 = await t.stableRevision();
      const elbowBefore = await posOn(G6, ELBOW);
      const b = await t.boxOf(B);
      const from = t.center(b.free);
      const k = await t.kOf();
      const cap = await t.captureDrag(
        from,
        { x: from.x + 150 * k, y: from.y + 100 * k },
        { id: ELBOW, shots: 'gestures-connector' },
      );
      const f10 = t.frameAt(cap, 'step10');
      const bBox = f10?.blocks?.[B] ?? null;
      const site = bBox ? { x: bBox.x, y: bBox.y + bBox.h / 2 } : null;
      const end = f10?.line?.end ?? null;
      const gap = site && end ? r1(Math.hypot(end.x - site.x, end.y - site.y)) : null;
      await t.settled();
      const rev1 = await t.pollUntil(revision, (r) => r > rev0, 8000).catch(revision);
      const elbowAfter = await posOn(G6, ELBOW);
      const bAfter = await posOn(G6, B);
      const followed = elbowAfter && !same(elbowAfter, elbowBefore);
      const ok = gap !== null && gap <= 1 && rev1 === rev0 + 1 && Boolean(followed);
      return {
        ok,
        observed: `step 10: B ${boxStr(bBox)}, its left site ${site ? `${site.x},${site.y}` : 'none'}, the connector's end ${end ? `${end.x},${end.y}` : 'none'} (${gap === null ? 'unread' : `${gap} px apart`}); the release: revision ${rev0} -> ${rev1}, B ${t.posStr(bAfter)}, the connector ${t.posStr(elbowBefore)} -> ${t.posStr(elbowAfter)}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the rotated ring (2.3 item 3, 2.4)

  const G7 = await t
    .setup('a blank slide for the rotation', 'slide.new through the window API', async () => {
      const id = await slide('gestureRotateSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureRotateSlide);
  await t.clickCard(G7);
  await t.clearAll();
  const ROT = 'g-rot';
  await t.setup('a 680 by 320 rectangle', 'block.insert through the window API', async () => {
    const obj = await t.placeBlock(G7, {
      id: ROT,
      type: 'shape',
      shape: 'rectangle',
      fill: 'plate',
      stroke: 'ink',
      pos: { x: 460, y: 290, w: 680, h: 320 },
    });
    return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
  });
  /** The ring against the object's corners in a frame: the distance, the angle, the bounds. */
  const ringOnObject = (f) => {
    const objectCorners = f?.freeLayout?.corners ?? null;
    const ringCorners = f?.ringTurn?.corners ?? (f?.ring ? t.boxCorners(f.ring, 0) : null);
    const distance =
      objectCorners && ringCorners ? t.cornersDistance(objectCorners, ringCorners) : null;
    const ringBounds = ringCorners ? boundsOf(ringCorners) : null;
    return {
      distance,
      angle: f?.freeLayout?.angle ?? null,
      ringAngle: f?.ringTurn?.angle ?? 0,
      turned: f?.ringTurn !== null && f?.ringTurn !== undefined,
      ringSize: f?.ringTurn ? `${f.ringTurn.w}x${f.ringTurn.h}` : boxStr(f?.ring),
      ringBounds,
      readout: f?.readout ?? null,
    };
  };
  const describeRing = (r) =>
    `ring ${r.turned ? `turned ${r.ringAngle}° at ${r.ringSize}` : `upright ${r.ringSize}`}, bounds ${boxStr(r.ringBounds)}, corners ${r.distance === null ? 'unread' : `${r.distance} px`} from the object's (angle ${r.angle}°)`;
  const ringOk = (r) =>
    r.turned && r.distance !== null && r.distance <= 2 && Math.abs(r.ringAngle) > 5;
  await t.step(
    'gestures.rotate.ring-turns-live',
    'the rectangle selected; its rotation handle dragged along the arc to 45 degrees in 12 steps',
    "at the tenth step the ring is the 680 by 320 box turned by the readout's angle, its corners on the shape's corners within 2 px, never an upright box",
    async () => {
      if (!(await select(ROT))) return { ok: false, observed: 'the rectangle was not selected' };
      const h = await t.handleRect(`handle.${ROT}.rotate`);
      const b = await t.boxOf(ROT);
      if (!h || !b) return { ok: false, observed: 'no rotation handle' };
      const c = t.center(b.free);
      const p = t.center(h);
      const radius = Math.hypot(p.x - c.x, p.y - c.y);
      const a0 = Math.atan2(p.y - c.y, p.x - c.x);
      const a1 = a0 + Math.PI / 4;
      const q = { x: c.x + radius * Math.cos(a1), y: c.y + radius * Math.sin(a1) };
      const cap = await t.captureDrag(p, q, { id: ROT, shots: 'gestures-rotate' });
      captures.rotate = cap;
      const f10 = t.frameAt(cap, 'step10');
      const r = ringOnObject(f10);
      const readoutAngle =
        r.readout && ANGLE.test(r.readout) ? Number(r.readout.replace('°', '')) : null;
      const angleOk =
        readoutAngle !== null &&
        r.angle !== null &&
        Math.abs(((r.angle - readoutAngle + 540) % 360) - 180) <= 2;
      await t.settled();
      const ok = ringOk(r) && angleOk;
      return {
        ok,
        observed: `step 10: ${describeRing(r)}; readout ${r.readout === null ? 'none' : `"${r.readout}"`}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'gestures.rotate.ring-after-release',
    'read the ring after the release; Escape and one click; a reload and one click',
    'each time the ring is the 680 by 320 box turned with the object (a bounding box near 707 by 707), the handles on its corners',
    async () => {
      const after = ringOnObject(t.frameAt(captures.rotate, 'up+400'));
      await t.clearAll();
      await select(ROT);
      await t.sleep(200);
      const reselected = ringOnObject(await t.frameFacts(ROT));
      await t.reloadTo(page.url());
      await t.settled();
      await t.clickCard(G7);
      await select(ROT);
      await t.sleep(200);
      const reloaded = ringOnObject(await t.frameFacts(ROT));
      const pos = await posOn(G7, ROT);
      const expectBounds = (r) => {
        if (r.angle === null) return null;
        const rad = (r.angle * Math.PI) / 180;
        return {
          w: r1(680 * Math.abs(Math.cos(rad)) + 320 * Math.abs(Math.sin(rad))),
          h: r1(680 * Math.abs(Math.sin(rad)) + 320 * Math.abs(Math.cos(rad))),
        };
      };
      const boundsOk = (r) => {
        const e = expectBounds(r);
        return (
          e !== null &&
          r.ringBounds !== null &&
          t.near(r.ringBounds.w, e.w, 3) &&
          t.near(r.ringBounds.h, e.h, 3)
        );
      };
      const handles = await t.handleControls();
      const corners = ['nw', 'ne', 'se', 'sw'].every((d) =>
        handles.includes(`handle.${ROT}.resize.${d}`),
      );
      const readings = [after, reselected, reloaded];
      const ok =
        readings.every((r) => ringOk(r) && boundsOk(r)) &&
        corners &&
        typeof pos?.rotate === 'number';
      return {
        ok,
        observed: `stored rotate ${pos?.rotate}; after the release: ${describeRing(after)}; after Escape and a click: ${describeRing(reselected)}; after a reload: ${describeRing(reloaded)}; the corner handles ${corners}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the cadence and the budget (2.3 item 5, 2.4): describe().state.gesture

  const G8 = await t
    .setup('a blank slide for the frame rows', 'slide.new through the window API', async () => {
      const id = await slide('gestureFrameSlide');
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.gestureFrameSlide);
  await t.clickCard(G8);
  await t.clearAll();
  const FR = 'g-frame-rect';
  await t.setup(
    'a rectangle for the cadence row',
    'block.insert through the window API',
    async () => {
      const obj = await t.placeBlock(G8, {
        id: FR,
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        pos: { x: 200, y: 200, w: 320, h: 200 },
      });
      return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
    },
  );
  /** A rAF counter and a mutation observer on the sheet, started before a drag and read after it. */
  const meterStart = () =>
    page.evaluate((sel) => {
      const sheet = document.querySelector(sel);
      const m = { frames: 0, mutations: 0, run: true };
      const tick = () => {
        if (!m.run) return;
        m.frames += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const mo = new MutationObserver(() => {
        m.mutations += 1;
      });
      if (sheet)
        mo.observe(sheet, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      m.stop = () => {
        m.run = false;
        mo.disconnect();
      };
      window.__b4Meter = m;
      return true;
    }, t.SHEET);
  const meterStop = () =>
    page.evaluate(() => {
      const m = window.__b4Meter;
      if (!m) return null;
      m.stop();
      delete window.__b4Meter;
      return { frames: m.frames, mutations: m.mutations };
    });
  const gestureField = async () => {
    const g = await t.gestureState();
    return g && typeof g === 'object' ? g : null;
  };
  await t.step(
    'gestures.frame.one-render-per-frame',
    'the rectangle selected and moved from inside by 180 by 90 in 12 steps, a frame counter and a mutation observer on the sheet',
    'describe().state.gesture.frames is at most the animation frames of the drag and at least 6, skipped 0, and the sheet mutated once per frame',
    async () => {
      if ((await gestureField()) === null && (await t.state()).gesture === undefined) {
        /* the field is absent until the integrator lands B1's request; a build with it answers
           an object (null between gestures is the field present with no record yet) */
        const state = await t.state();
        if (!('gesture' in state)) return notBuilt('describe().state.gesture');
      }
      if (!(await select(FR))) return { ok: false, observed: 'the rectangle was not selected' };
      const b = await t.boxOf(FR);
      const from = t.center(b.free);
      const k = await t.kOf();
      await meterStart();
      await t.drag(from, { x: from.x + 180 * k, y: from.y + 90 * k }, { steps: 12 });
      const meter = await meterStop();
      await t.settled();
      const g = await gestureField();
      const frames = g?.frames ?? null;
      const ok =
        g !== null &&
        typeof frames === 'number' &&
        frames >= 6 &&
        meter !== null &&
        frames <= meter.frames &&
        (g.skipped ?? 0) === 0 &&
        meter.mutations <= frames + 3;
      await undoOnce();
      return {
        ok,
        observed: `gesture ${g ? JSON.stringify(g) : 'none'}; animation frames from the press to the release ${meter?.frames ?? 'unread'}; sheet mutation batches ${meter?.mutations ?? 'unread'}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );

  const extra = [];
  const COST_TABLE = 'g-cost-table';
  const COST_CHART = 'g-cost-chart';
  await t.step(
    'gestures.frame.cost-budget',
    'on a deck of 24 slides (23 slide.new as setup) with a 5 by 6 table, a column chart and a picture on the measured slide: the table moved and the chart resized in 12 steps',
    'describe().state.gesture.maxMs under 32 and degraded false for both; the readout moved at every step',
    async () => {
      const state = await t.state();
      if (!('gesture' in state) && (await gestureField()) === null)
        return notBuilt('describe().state.gesture');
      const order0 = await t.slideOrder();
      const want = 24 - order0.length;
      for (let i = 0; i < want; i += 1) {
        const id = await t.setupSlide(extra[extra.length - 1] ?? G8, 'blank');
        if (id) extra.push(id);
      }
      await t.clickCard(G8);
      const table = await t.placeBlock(G8, {
        id: COST_TABLE,
        type: 'table',
        columns: Array.from({ length: 6 }, () => ({})),
        rows: Array.from({ length: 5 }, (_, r) => ({
          cells: Array.from({ length: 6 }, (_, c) => (r === 0 ? `H${c}` : `R${r}C${c}`)),
          ...(r === 0 ? { header: true } : {}),
        })),
        pos: { x: 80, y: 60, w: 900, h: 260 },
      });
      const chart = await t.placeBlock(G8, {
        id: COST_CHART,
        type: 'chart',
        kind: 'column',
        categories: ['North', 'South', 'West', 'East'],
        series: [
          { name: 'Bookings', values: [30, 45, 20, 25] },
          { name: 'Renewals', values: [12, 18, 9, 14] },
        ],
        pos: { x: 80, y: 420, w: 640, h: 360 },
      });
      const pic = await t.placePicture(
        G8,
        { x: 1000, y: 60, w: 480, h: 320 },
        `g-cost-pic-${Date.now().toString(36)}`,
      );
      const slides = (await t.slideOrder()).length;
      if (!table || !chart || !pic)
        return {
          ok: false,
          observed: `setup: table ${Boolean(table)}, chart ${Boolean(chart)}, picture ${Boolean(pic)}, slides ${slides}`,
        };
      await t.clearAll();
      const tb = await t.boxOf(COST_TABLE);
      if (!tb) return { ok: false, observed: 'the table is not on the stage' };
      const from = t.center(tb.free);
      const k = await t.kOf();
      const moveCap = await t.captureDrag(
        from,
        { x: from.x + 120 * k, y: from.y + 60 * k },
        { id: COST_TABLE },
      );
      await t.settled();
      const moveG = await gestureField();
      const moveReadouts = moveCap.frames
        .filter((f) => /^step\d+$/.test(f.tag))
        .map((f) => f.facts?.readoutBox ?? null);
      const readoutMoved = (list) =>
        list.length > 0 && list.every((b, i) => b !== null && (i === 0 || !same(b, list[i - 1])));
      /* a move draws no size readout on some builds: the ring moving at every step is then the reading */
      const moveRings = moveCap.frames
        .filter((f) => /^step\d+$/.test(f.tag))
        .map((f) => f.facts?.ring ?? null);
      const moveFollowed =
        readoutMoved(moveReadouts) ||
        (moveReadouts.every((b) => b === null) && readoutMoved(moveRings));
      await undoOnce();
      if (!(await select(COST_CHART))) return { ok: false, observed: 'the chart was not selected' };
      const resizeCap = await t.captureHandleDrag(
        `handle.${COST_CHART}.resize.se`,
        { x: 200, y: 120 },
        { id: COST_CHART },
      );
      await t.settled();
      const resizeG = await gestureField();
      const resizeReadouts = (resizeCap?.frames ?? [])
        .filter((f) => /^step\d+$/.test(f.tag))
        .map((f) => f.facts?.readoutBox ?? null);
      await undoOnce();
      const within = (g) =>
        g !== null && typeof g.maxMs === 'number' && g.maxMs < 32 && g.degraded === false;
      const ok =
        slides >= 24 &&
        within(moveG) &&
        within(resizeG) &&
        moveFollowed &&
        readoutMoved(resizeReadouts);
      return {
        ok,
        observed: `${slides} slides; the table moved: gesture ${moveG ? JSON.stringify(moveG) : 'none'}, the readout moved at every step ${readoutMoved(moveReadouts)}${moveReadouts.every((b) => b === null) ? ` (no readout during the move; the ring moved at every step ${readoutMoved(moveRings)})` : ''}; the chart resized: gesture ${resizeG ? JSON.stringify(resizeG) : 'none'}, the readout moved at every step ${readoutMoved(resizeReadouts)}${ok ? '' : ` (docs/OBJECTS.md 2.4, ${LANE})`}`,
      };
    },
  );
  if (extra.length > 0)
    await t
      .setup(
        'the 23 slides of the cost row removed',
        'slide.remove through the window API',
        async () => {
          const order = await t.slideOrder();
          const kept = await t.trimTo(
            order.length - extra.length,
            order.filter((id) => !extra.includes(id)),
          );
          await t.clickCard(G8);
          return {
            ok: kept.length === order.length - extra.length,
            observed: `${order.length} -> ${kept.length} slides`,
          };
        },
      )
      .catch(() => undefined);

  await t.step(
    'gestures.readout.stays',
    'read the readouts of the captured draw, rotation and seam drags at every step and after each release',
    'the growing size during the draw, the angle during the rotation, the width during the seam drag; none 400 ms after the release',
    async () => {
      const draw = t.readoutsOf(captures.draw, SIZE);
      const rotate = t.readoutsOf(captures.rotate, ANGLE);
      const seam = t.readoutsOf(captures.seam, WIDTH);
      const missing = [
        captures.draw ? null : 'the draw',
        captures.rotate ? null : 'the rotation',
        captures.seam ? null : 'the seam drag',
      ].filter(Boolean);
      if (missing.length > 0)
        return {
          ok: null,
          observed: `no capture of ${missing.join(', ')} (its row did not run its drag)`,
        };
      const growing = draw.steps.every((s, i) => {
        if (i === 0) return true;
        const a = /^(\d+) × (\d+)/.exec(draw.steps[i - 1] ?? '');
        const b = /^(\d+) × (\d+)/.exec(s ?? '');
        return a && b && Number(b[1]) >= Number(a[1]) && Number(b[2]) >= Number(a[2]);
      });
      const gone = [draw, rotate, seam].every((r) => r.afterRelease === null);
      const ok = draw.every && growing && rotate.every && seam.every && gone;
      return {
        ok,
        observed: `draw ${draw.every ? `the size at every step (${draw.steps[0]} to ${draw.steps[draw.steps.length - 1]}, growing ${growing})` : JSON.stringify(draw.steps)}; rotation ${rotate.every ? `the angle at every step (${rotate.steps[0]} to ${rotate.steps[rotate.steps.length - 1]})` : JSON.stringify(rotate.steps)}; seam ${seam.every ? `the width at every step (${seam.steps[0]} to ${seam.steps[seam.steps.length - 1]})` : JSON.stringify(seam.steps)}; after the releases ${[draw, rotate, seam].map((r) => (r.afterRelease === null ? 'none' : `"${r.afterRelease}"`)).join(', ')}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the watch row (4.2 item 2)

  await t.clickCard(G1);
  const WATCH = 'g-watch-chart';
  await t.setup(
    'a column chart for the watch row',
    'block.insert through the window API',
    async () => {
      const obj = await t.placeBlock(G1, {
        id: WATCH,
        type: 'chart',
        kind: 'column',
        categories: ['North', 'South', 'West'],
        series: [{ name: 'Bookings', values: [30, 45, 20] }],
        pos: { x: 100, y: 100, w: 560, h: 320 },
      });
      return { ok: Boolean(obj), observed: obj?.id ?? 'none' };
    },
  );
  await t.step(
    'gestures.watch.chart-se-after-mark-click',
    'one click on the second bar of the chart, the se handle pressed within 300 ms and dragged by 100 by 60; three times, Cmd+Z after each',
    'the chart resizes each time and no marquee starts',
    async () => {
      const out = [];
      let ok = true;
      for (let i = 0; i < 3; i += 1) {
        await t.clearAll();
        const bar = await page.evaluate((id) => {
          const inner = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          const rects = inner ? [...inner.querySelectorAll('.series rect')] : [];
          const r = rects[1]?.getBoundingClientRect();
          return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
        }, WATCH);
        if (!bar) {
          ok = false;
          out.push(`try ${i + 1}: no second bar`);
          continue;
        }
        const pos0 = await posOn(G1, WATCH);
        await t.selectObject(WATCH);
        await t.clickAt(bar.x, bar.y);
        const t0 = Date.now();
        const h = await t.handleRect(`handle.${WATCH}.resize.se`);
        if (!h) {
          ok = false;
          out.push(
            `try ${i + 1}: no se handle after the click on the bar (handles ${(await t.handleControls()).join(', ')})`,
          );
          continue;
        }
        const k = await t.kOf();
        const p = t.center(h);
        let pressedAt = null;
        const mid = await t.drag(
          p,
          { x: p.x + 100 * k, y: p.y + 60 * k },
          {
            steps: 12,
            during: async () => ({
              marquee: await t.has('.ts-overlay .ts-marquee'),
              selection: await t.selectionText(),
              readout: await t.readout(),
            }),
          },
        );
        pressedAt = Date.now() - t0;
        await t.settled();
        const pos1 = await posOn(G1, WATCH);
        const resized =
          pos0 && pos1 && t.near(pos1.w - pos0.w, 100, 8) && t.near(pos1.h - pos0.h, 60, 8);
        const pass = resized && !mid.marquee && (mid.selection ?? '') === '';
        ok = ok && pass;
        out.push(
          `try ${i + 1}: the press about ${pressedAt} ms after the click; marquee during ${mid.marquee}, text selection "${mid.selection ?? ''}", readout "${mid.readout ?? 'none'}"; ${t.posStr(pos0)} -> ${t.posStr(pos1)} (resized ${resized})`,
        );
        if (resized) await undoOnce();
      }
      return {
        ok,
        observed: `${out.join(' | ')}${ok ? '' : ' (docs/OBJECTS.md 4.2 item 2: the fix round takes a second reading)'}`,
      };
    },
  );
  await t.clearAll();
}

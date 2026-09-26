// Shapes, the minimal set (docs/FOCUS.md 2.6, section 4, 6.4 `shapes.*` with the driver
// `probe --core`): Rectangle, Rounded rectangle and Ellipse as named Insert > Shape rows (the
// plate cell is the fallback on a build that still draws the gallery, recorded as the route),
// their drawing, the default look on both appearances, the battery of move, handles, ring, fill,
// border, text, duplicate, delete, undo, redo, Format options, the reload and the viewer, and the
// right click menu. The two export rows are core/export.spec.ts. The vector round (docs/VECTOR.md
// 2 and 6.1) adds the geometry interpreter's rows (every preset drawn from its definition: the
// sheet's path compared with `shapePath` imported from packages/schema/src/shapes.ts under Node's
// type stripping, the same code the page runs), the four glyph grids, the seven Insert > Shape
// rows with their icons, Change shape and Mask image; the three export rows of the geometry are
// core/export.spec.ts's.

export const NAME = 'shapes';
export const IDS = [
  'shapes.insert.rectangle-click',
  'shapes.insert.rounded-click',
  'shapes.insert.ellipse-click',
  'shapes.insert.rectangle-drag',
  'shapes.insert.ellipse-drag',
  'shapes.insert.named-rows',
  'shapes.default-look',
  'shapes.select',
  'shapes.move',
  'shapes.resize.eight-handles',
  'shapes.rotate',
  'shapes.fill.colour',
  'shapes.border.colour-weight-dash',
  'shapes.text.type-align-bold',
  'shapes.duplicate-delete-undo-redo',
  'shapes.format-options.size-position',
  'shapes.reload-and-viewer',
  'shapes.context.shape',
  'shapes.text.colour-toolbar',
  'shapes.text.enter-opens-label',
  'shapes.borders-lines.menu',
  /* the features round, ship one (docs/FEATURES.md 2.2 rank 3): the label centred by default */
  'shapes.label.centred-default',
  /* the vector round (docs/VECTOR.md 6.1): the interpreter, the grids, the icons, the two plates */
  'shapes.insert.grid-shapes',
  'shapes.geometry.shapes.hexagon-sheet',
  'shapes.geometry.shapes.star5-adjust',
  'shapes.geometry.resize-keeps-adjust',
  'shapes.geometry.shapes.pie-arc',
  'shapes.geometry.shapes.multipath-can',
  'shapes.geometry.shapes.flowchart-own-space',
  'shapes.insert.grid-arrows',
  'shapes.geometry.arrows.right-arrow',
  'shapes.geometry.arrows.curved-right',
  'shapes.insert.grid-callouts',
  'shapes.geometry.callouts.wedge-rect',
  'shapes.geometry.callouts.cloud',
  'shapes.insert.grid-equation',
  'shapes.geometry.equation.plus-divide',
  'shapes.geometry.pinned-three',
  'shapes.geometry.sites',
  'shapes.icons.named-rows',
  'shapes.change-shape.plate',
  'shapes.mask-image.plate',
];

/** The seven Insert > Shape rows of docs/VECTOR.md 2.6: the three named rows, then the four categories. */
const NAMED_ROWS = [
  'insert.shape.shapes.rectangle',
  'insert.shape.shapes.rounded',
  'insert.shape.shapes.ellipse',
];
const CATEGORY_ROWS = [
  'insert.shape.gallery',
  'insert.shape.arrows',
  'insert.shape.callouts',
  'insert.shape.equation',
];

/**
 * The vertices and the commands of an absolute SVG path string as `fmt` writes it (M, L, H, V,
 * A, C, Q, Z with absolute numbers on the half pixel grid): every end point of a straight command
 * is a vertex (a closing point equal to the subpath's start is not counted twice), the end points
 * of curves and arcs are `ends`, and `ops` lists the letters in order.
 */
export function parsePath(d) {
  const tokens = d.match(/[MLHVACQSTZmlhvacqstz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const verts = [];
  const ends = [];
  const ops = [];
  let x = 0;
  let y = 0;
  let start = null;
  let op = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const vertex = (px, py) => {
    if (start && Math.abs(px - start.x) < 0.01 && Math.abs(py - start.y) < 0.01 && verts.length > 1)
      return;
    verts.push({ x: px, y: py });
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/^[A-Za-z]$/.test(tk)) {
      op = tk;
      ops.push(tk);
      i += 1;
      if (op === 'Z' || op === 'z') {
        if (start) {
          x = start.x;
          y = start.y;
        }
        start = null;
        continue;
      }
    }
    switch (op) {
      case 'M':
        x = num();
        y = num();
        start = { x, y };
        verts.push({ x, y });
        op = 'L';
        break;
      case 'L':
        x = num();
        y = num();
        vertex(x, y);
        break;
      case 'H':
        x = num();
        vertex(x, y);
        break;
      case 'V':
        y = num();
        vertex(x, y);
        break;
      case 'A':
        num();
        num();
        num();
        num();
        num();
        x = num();
        y = num();
        ends.push({ x, y });
        break;
      case 'C':
        num();
        num();
        num();
        num();
        x = num();
        y = num();
        ends.push({ x, y });
        break;
      case 'Q':
        num();
        num();
        x = num();
        y = num();
        ends.push({ x, y });
        break;
      case 'S':
        num();
        num();
        x = num();
        y = num();
        ends.push({ x, y });
        break;
      case 'T':
        x = num();
        y = num();
        ends.push({ x, y });
        break;
      default:
        i += 1;
    }
  }
  return { verts, ends, ops, points: [...verts, ...ends] };
}

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PLATE = { rectangle: 'rect', rounded: 'roundRect', ellipse: 'ellipse' };

/** The relative luminance of an rgb() string, or null. */
function luminance(colour) {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(colour ?? '');
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  const lin = (c) => {
    const v = Number(c) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}

export async function run(t) {
  const { page, BASE } = t;
  const S = await t
    .setup('a slide for the shapes', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.arrangeSlide ?? t.deck.titleSlide, 'blank');
      t.deck.shapeSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.shapeSlide);
  await t.clickCard(S);
  await t.clearAll();
  /* under ruling (1) Insert > Shape and Insert > Line leave the default view for this ship (b3
     R14, on the tree since cycle 2; b1 R26): the shapes and lines rows stay in the matrix and are
     driven with Tools > Advanced tools on, the evidence for their return under FOCUS.md section 8;
     the switch is turned on here as a setup step when the Insert menu has no Shape row and turned
     off again at the end of the lines area (the shapes and lines features are parked either way) */
  await t.step(
    null,
    'setup: Insert > Shape in the menu, or the switch on for the parked shapes and lines rows',
    'the Shape row is reachable',
    async () => {
      await t.openMenu('insert');
      const drawn = await t.has('[data-control="menu.insert.shape"]');
      await t.closeMenus();
      if (drawn) return { ok: true, observed: 'Insert > Shape is in the default view' };
      await t.menuPath('tools', 'tools.advancedTools');
      const on = await t.pollUntil(
        async () => (await t.state()).settings?.advancedTools === true,
        (x) => x,
        5000,
      );
      t.deck.advancedForShapes = on;
      await t.openMenu('insert');
      const now = await t.has('[data-control="menu.insert.shape"]');
      await t.closeMenus();
      return {
        ok: now,
        observed: `Insert > Shape is parked (ruling (1)); Tools > Advanced tools turned on ${on}; the row drawn ${now}`,
      };
    },
  );

  /** The svg path facts of a shape on the stage. */
  const pathOf = (id) =>
    page.evaluate((blockId) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
      const path = svg?.querySelector('path, ellipse, rect, circle');
      if (!svg || !path) return null;
      const cs = getComputedStyle(path);
      const box = (inner.closest('.free') ?? inner).getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      /* the ground the shape sits on: the first painted background from the sheet upwards (the
         `.pt-slide` itself is transparent and the painted plate is an ancestor, b3.md 7.1) */
      let ground = null;
      for (let node = sheet; node && ground === null; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== 'transparent' && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(bg))
          ground = bg;
      }
      return {
        tag: path.tagName.toLowerCase(),
        d: path.getAttribute('d') ?? '',
        fill: cs.fill,
        stroke: cs.stroke,
        strokeWidth: cs.strokeWidth,
        dash: cs.strokeDasharray,
        svg: { w: s.width, h: s.height },
        box: { w: box.width, h: box.height },
        ground,
        shape:
          inner.getAttribute('data-shape') ??
          inner.closest('[data-shape]')?.getAttribute('data-shape') ??
          null,
      };
    }, id);
  const insertShape = async (kind, at, dragTo = null) => {
    /* the vector round (docs/VECTOR.md 2.6): the three named rows sit directly under Insert >
       Shape (the Shapes container left) and the plate is the Shapes gallery's tile; the two
       routes of the tree before the round hovered the container and read "neither route" on
       every insert of the area (the integrator's gates of 2026-09-25) */
    const named = await t.insertByTool(
      S,
      ['insert.shape', `insert.shape.shapes.${kind}`],
      at,
      dragTo,
      { text: null },
    );
    if (named.obj) return { ...named, route: 'the named row' };
    const plate = await t.insertByTool(
      S,
      ['insert.shape', 'insert.shape.gallery', `insert.shape.gallery.pick.${PLATE[kind]}`],
      at,
      dragTo,
      { text: null },
    );
    return {
      ...plate,
      route: plate.obj
        ? `the plate cell (no named row: ${named.error})`
        : `neither route: ${named.error}; ${plate.error}`,
    };
  };
  const drawn = (facts) => {
    if (!facts) return 'no svg';
    if (facts.tag === 'ellipse' || facts.tag === 'circle') return 'ellipse';
    if (facts.tag === 'rect') return facts.d ? 'rect' : 'rect';
    const d = facts.d;
    if (/[AaCcQqSs]/.test(d)) return /^M0,0\s*H/.test(d) ? 'box' : 'curved';
    return 'box';
  };

  let rect = null;
  let rounded = null;
  let ellipse = null;
  await t.step(
    'shapes.insert.rectangle-click',
    'Insert > Shape > Rectangle, one click on the sheet',
    'a 240 by 160 rectangle drawn as a rectangle',
    async () => {
      const r = await insertShape('rectangle', { x: 200, y: 200 });
      await t.press('Escape');
      await t.settled();
      rect = r.obj;
      const facts = rect ? await pathOf(rect.id) : null;
      return {
        ok:
          Boolean(rect) &&
          t.near(rect.pos.w, 240, 1) &&
          t.near(rect.pos.h, 160, 1) &&
          facts !== null &&
          drawn(facts) !== 'curved' &&
          drawn(facts) !== 'ellipse',
        observed: rect
          ? `${r.route}; ${rect.type} ${rect.id} ${t.posStr(rect.pos)}; data-shape ${facts?.shape}; path ${facts?.d.slice(0, 40)}`
          : `nothing inserted: ${r.route}`,
      };
    },
  );
  await t.step(
    'shapes.insert.rounded-click',
    'Insert > Shape > Rounded rectangle, one click',
    'the svg path has rounded corners',
    async () => {
      const r = await insertShape('rounded', { x: 600, y: 200 });
      await t.press('Escape');
      await t.settled();
      rounded = r.obj;
      const facts = rounded ? await pathOf(rounded.id) : null;
      const curved = facts
        ? /[AaCcQqSs]/.test(facts.d) || (facts.tag === 'rect' && Number(facts.d) > 0)
        : false;
      const rx = rounded
        ? await page.evaluate(
            (id) =>
              document
                .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] rect`)
                ?.getAttribute('rx') ?? null,
            rounded.id,
          )
        : null;
      return {
        ok: Boolean(rounded) && (curved || Number(rx) > 0),
        observed: rounded
          ? `${r.route}; ${rounded.id} ${t.posStr(rounded.pos)}; data-shape ${facts?.shape}; path ${facts?.d.slice(0, 60)}; rx ${rx}`
          : `nothing inserted: ${r.route}`,
      };
    },
  );
  await t.step(
    'shapes.insert.ellipse-click',
    'Insert > Shape > Ellipse, one click',
    'an ellipse',
    async () => {
      const r = await insertShape('ellipse', { x: 1000, y: 200 });
      await t.press('Escape');
      await t.settled();
      ellipse = r.obj;
      const facts = ellipse ? await pathOf(ellipse.id) : null;
      const isEllipse = facts
        ? drawn(facts) === 'ellipse' ||
          (facts.tag === 'path' && /[AaCc]/.test(facts.d) && !/^M0,0\s*H/.test(facts.d))
        : false;
      return {
        ok: Boolean(ellipse) && isEllipse,
        observed: ellipse
          ? `${r.route}; ${ellipse.id}; data-shape ${facts?.shape}; ${facts?.tag} ${facts?.d.slice(0, 60)}`
          : `nothing inserted: ${r.route}`,
      };
    },
  );
  await t.step(
    'shapes.insert.rectangle-drag',
    'Rectangle drawn by a drag',
    'the shape lands at the drawn box',
    async () => {
      const r = await insertShape('rectangle', { x: 200, y: 520 }, { x: 520, y: 700 });
      await t.press('Escape');
      await t.settled();
      const p = r.obj?.pos;
      const ok =
        Boolean(p) &&
        t.near(p.x, 200, 16) &&
        t.near(p.y, 520, 16) &&
        t.near(p.w, 320, 24) &&
        t.near(p.h, 180, 24);
      if (r.obj) {
        await t.selectObject(r.obj.id);
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok,
        observed: r.obj ? `${r.route}; ${t.posStr(p)}` : `nothing inserted: ${r.route}`,
      };
    },
  );
  await t.step(
    'shapes.insert.ellipse-drag',
    'Ellipse drawn by a drag',
    'the ellipse lands at the drawn box',
    async () => {
      const r = await insertShape('ellipse', { x: 700, y: 520 }, { x: 1000, y: 720 });
      await t.press('Escape');
      await t.settled();
      const p = r.obj?.pos;
      const ok =
        Boolean(p) &&
        t.near(p.x, 700, 16) &&
        t.near(p.y, 520, 16) &&
        t.near(p.w, 300, 24) &&
        t.near(p.h, 200, 24);
      if (r.obj) {
        await t.selectObject(r.obj.id);
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok,
        observed: r.obj ? `${r.route}; ${t.posStr(p)}` : `nothing inserted: ${r.route}`,
      };
    },
  );
  await t.step(
    'shapes.insert.named-rows',
    'open Insert > Shape and the toolbar Shape button',
    'Rectangle, Rounded rectangle and Ellipse as named rows above Shapes, Arrows, Callouts and Equation in both (docs/VECTOR.md 2.6)',
    async () => {
      await t.clearAll();
      await t.openMenu('insert');
      await t.hoverRow('insert.shape', '[data-control^="menu.insert.shape."]');
      /* the tree before the round nests the three under a Shapes container: hovered so its rows
         are read, and the read still fails on the four category rows below them */
      if (await t.has('[data-control="menu.insert.shape.shapes"]'))
        await t
          .hoverRow(
            'insert.shape.shapes',
            '[data-control^="menu.insert.shape.shapes."], [data-control^="insert.shape.shapes.pick"]',
          )
          .catch(() => undefined);
      const menuRows = (await t.menuRows('insert'))
        .map((r) => r.id)
        .filter((id) => id.startsWith('insert.shape.'));
      const plate = await t.has(
        '[data-control="insert.shape.shapes.plate"], [data-control^="insert.shape.shapes.pick."]',
      );
      await t.closeMenus();
      const want = [...NAMED_ROWS, ...CATEGORY_ROWS];
      const order = want.map((id) => menuRows.indexOf(id));
      const namedAbove =
        order.slice(0, 3).every((i) => i >= 0) &&
        order.slice(3).every((i) => i >= 0) &&
        Math.max(...order.slice(0, 3)) < Math.min(...order.slice(3));
      const menuOk = want.every((id) => menuRows.includes(id)) && !plate && namedAbove;
      let arrowRows = [];
      let arrowOk = false;
      /* the toolbar Shape button is one dropdown button (its chevron is part of it), so the
         rows are read after a click on the button itself; a split arrow is taken when the chrome
         draws one (the integrator's merge 1 run: the arrow control did not exist, rows none) */
      const shapeArrow = (await t.visible('toolbar.insertShape.arrow'))
        ? 'toolbar.insertShape.arrow'
        : (await t.visible('toolbar.insertShape'))
          ? 'toolbar.insertShape'
          : null;
      if (shapeArrow !== null) {
        await t.clickControl(shapeArrow);
        await t.sleep(500);
        arrowRows = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control*="insert.shape."]')]
            .filter(
              (el) => el.getClientRects().length > 0 && el.closest('#ts-menu-insert') === null,
            )
            .map((el) => el.getAttribute('data-control')),
        );
        arrowOk = want.every((id) => arrowRows.some((c) => c.endsWith(id)));
        await t.press('Escape', 2);
      }
      return {
        ok: menuOk && arrowOk,
        observed: `menu rows ${menuRows.join(', ') || 'none'} (the three above the four ${namedAbove}); plate drawn ${plate}; toolbar rows ${arrowRows.join(', ') || 'none'}`,
      };
    },
  );
  if (!rect) throw new (await import('../toolkit.mjs')).SetupFailed('a rectangle to drive');
  const id = rect.id;
  const pos = async () => (await t.blockOf(S, id))?.pos ?? null;
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  await t.step(
    'shapes.default-look',
    "read the fresh rectangle's fill and stroke on both appearances",
    'a fill or a stroke the seller can see',
    async () => {
      const visibleOn = async () => {
        const f = await pathOf(id);
        if (!f) return { ok: false, why: 'no svg' };
        const ground = luminance(f.ground);
        const fill = luminance(f.fill);
        const stroke = luminance(f.stroke);
        const width = parseFloat(f.strokeWidth) || 0;
        const fillSeen = fill !== null && ground !== null && Math.abs(fill - ground) > 0.12;
        const strokeSeen =
          stroke !== null && ground !== null && Math.abs(stroke - ground) > 0.2 && width >= 1;
        return {
          ok: fillSeen || strokeSeen,
          why: `fill ${f.fill}, stroke ${f.stroke} ${f.strokeWidth} on ${f.ground}: fill seen ${fillSeen}, stroke seen ${strokeSeen}`,
        };
      };
      const dark = await visibleOn();
      const s = await t.state();
      await t.invoke('deck.set', {
        baseRevision: s.revision,
        path: '/defaults/appearance',
        value: 'light',
      });
      await t.pollUntil(t.state, (x) => x.theme === 'light', 10_000);
      await t.sleep(400);
      const light = await visibleOn();
      const s2 = await t.state();
      await t.invoke('deck.set', {
        baseRevision: s2.revision,
        path: '/defaults/appearance',
        value: 'dark',
      });
      await t.pollUntil(t.state, (x) => x.theme === 'dark', 10_000);
      await t.settled();
      return { ok: dark.ok && light.ok, observed: `dark: ${dark.why} | light: ${light.why}` };
    },
  );
  await t.step(
    'shapes.select',
    'click the rectangle',
    'chip Shape, eight handles, the ring',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(id);
      const dirs = await t.resizeDirs(id);
      const c = await t.chip();
      return {
        ok:
          Boolean(ctrls) &&
          dirs.length === 8 &&
          /Shape|Rectangle/.test(c ?? '') &&
          (await t.has('.ts-overlay .ts-select')),
        observed: `chip "${c}"; handles ${dirs.join(',')}`,
      };
    },
  );
  await t.step(
    'shapes.move',
    'drag the shape by its frame by 120 by 80 px',
    'pos moves by 120, 80 within the snap',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const k = await t.kOf();
      const before = await pos();
      const from = await t.frameGrip(id);
      await t.drag(from, { x: from.x + 120 * k, y: from.y + 80 * k });
      const after = await t.pollUntil(
        pos,
        (p) => p && (p.x !== before.x || p.y !== before.y),
        10_000,
      );
      await t.settled();
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      await undo();
      return {
        ok: t.near(dx, 120, 12) && t.near(dy, 80, 12),
        observed: `moved ${t.fmt(dx)},${t.fmt(dy)}`,
      };
    },
  );
  await t.step(
    'shapes.resize.eight-handles',
    'drag each handle plain, with Shift and with Alt; Undo after each',
    'the box follows, the svg fills the box, Undo restores',
    async () => {
      const facts = [];
      let ok = true;
      const DELTA = { x: 60, y: 40 };
      for (const mod of ['plain', 'shift', 'alt']) {
        for (const dir of DIRS) {
          await t.clearAll();
          const ctrls = await t.selectObject(id);
          if (!ctrls) {
            facts.push(`${dir} ${mod}: not selected`);
            ok = false;
            continue;
          }
          const k = await t.kOf();
          const before = await pos();
          const h = await t.handleRect(`handle.${id}.resize.${dir}`);
          if (!h) {
            facts.push(`${dir} ${mod}: no handle`);
            ok = false;
            continue;
          }
          const d = {
            x: dir.includes('e') ? DELTA.x : dir.includes('w') ? -DELTA.x : 0,
            y: dir.includes('s') ? DELTA.y : dir.includes('n') ? -DELTA.y : 0,
          };
          const from = t.center(h);
          const mid = await t.drag(
            from,
            { x: from.x + d.x * k, y: from.y + d.y * k },
            {
              mods: mod === 'plain' ? [] : [mod],
              during: async () => ({ readout: await t.readout() }),
            },
          );
          const after = await t.pollUntil(pos, (p) => p && !same(p, before), 8000);
          await t.settled();
          const svg = await pathOf(id);
          const fills = svg && t.near(svg.svg.w, svg.box.w, 3) && t.near(svg.svg.h, svg.box.h, 3);
          let geometryOk;
          if (mod === 'shift') {
            const r0 = before.w / before.h;
            const r1 = after.w / after.h;
            geometryOk = Math.abs(r1 - r0) / r0 < 0.06 && !same(after, before);
          } else if (mod === 'alt') {
            const centred =
              t.near(after.x + after.w / 2, before.x + before.w / 2, 10) &&
              t.near(after.y + after.h / 2, before.y + before.h / 2, 10);
            geometryOk = centred && !same(after, before);
          } else {
            const expW = before.w + (dir.includes('e') ? d.x : dir.includes('w') ? -d.x : 0);
            const expH = before.h + (dir.includes('s') ? d.y : dir.includes('n') ? -d.y : 0);
            geometryOk = t.near(after.w, expW, 10) && t.near(after.h, expH, 10);
          }
          const readoutOk = /^\d+ × \d+$/.test(mid.readout ?? '') && (await t.readout()) === null;
          await undo();
          const restored = same(await pos(), before);
          const good = geometryOk && Boolean(fills) && readoutOk && restored;
          ok = ok && good;
          facts.push(
            `${dir} ${mod}: ${good ? 'ok' : 'FAIL'} ${t.posStr(before)} -> ${t.posStr(after)}, svg fills ${fills}, readout "${mid.readout}", undo ${restored}`,
          );
        }
      }
      return { ok, observed: facts.join(' | ') };
    },
  );
  await t.step(
    'shapes.rotate',
    'drag the ring to about 35 degrees, Undo',
    'pos.rotate near 35, then 0',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await pos();
      const b = await t.boxOf(id);
      const ring = await t.handleRect(`handle.${id}.rotate`);
      const c = t.center(b.free);
      const from = t.center(ring);
      const r = Math.hypot(from.x - c.x, from.y - c.y);
      const a = (35 * Math.PI) / 180;
      const mid = await t.drag(
        from,
        { x: c.x + r * Math.sin(a), y: c.y - r * Math.cos(a) },
        { steps: 18, during: async () => ({ readout: await t.readout() }) },
      );
      const after = await t.pollUntil(
        pos,
        (p) => p && (p.rotate ?? 0) !== (before.rotate ?? 0),
        10_000,
      );
      await t.sleep(400);
      await undo();
      const back = await pos();
      return {
        ok: t.near(after.rotate ?? 0, 35, 6) && /°/.test(mid.readout ?? '') && !(back.rotate ?? 0),
        observed: `rotate ${t.fmt(after.rotate)}; readout "${mid.readout}"; after undo ${back.rotate ?? 0}`,
      };
    },
  );
  const blockJson = () => t.blockJson(S, id);
  await t.step(
    'shapes.fill.colour',
    'the toolbar Fill color: a swatch, then a hex value; Undo',
    'the shape paints each; Undo takes it back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await pathOf(id);
      await t.tailControl('toolbar.fillColor');
      await t.waitControl('toolbar.fillColor.plate', 5000);
      await t.clickControl('toolbar.fillColor.blue');
      await t.settled();
      const swatch = await t.pollUntil(
        () => pathOf(id),
        (f) => f && f.fill !== before.fill,
        8000,
      );
      const jsonSwatch = await blockJson();
      await t.selectObject(id);
      await t.tailControl('toolbar.fillColor');
      await t.waitControl('toolbar.fillColor.hex', 5000);
      await t.clickControl('toolbar.fillColor.hex');
      await t.press('Meta+a');
      await t.typeHuman('#aa3366');
      await t.press('Enter');
      await t.sleep(400);
      await t.press('Escape');
      await t.settled();
      const hex = await t.pollUntil(
        () => pathOf(id),
        (f) => f && /rgb\(170, 51, 102\)/.test(f.fill),
        8000,
      );
      await t.clearAll();
      await undo();
      await undo();
      const back = await pathOf(id);
      return {
        ok:
          swatch.fill !== before.fill &&
          /blue/.test(jsonSwatch) &&
          /rgb\(170, 51, 102\)/.test(hex.fill) &&
          back.fill === before.fill,
        observed: `fill ${before.fill} -> ${swatch.fill} (stored blue ${/blue/.test(jsonSwatch)}) -> ${hex.fill}; after two undos ${back.fill}`,
      };
    },
  );
  await t.step(
    'shapes.border.colour-weight-dash',
    'the toolbar Border color, Border weight and Border dash, then Format > Borders & lines; Undo',
    'the stroke changes each time and Undo takes it back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await pathOf(id);
      const facts = [];
      await t.tailControl('toolbar.borderColor');
      await t.waitControl('toolbar.borderColor.plate', 5000);
      await t.clickControl('toolbar.borderColor.red');
      await t.settled();
      const colour = await t.pollUntil(
        () => pathOf(id),
        (f) => f && f.stroke !== before.stroke,
        8000,
      );
      facts.push(`colour ${before.stroke} -> ${colour.stroke}`);
      await t.selectObject(id);
      await t.tailControl('toolbar.borderWeight');
      /* the weight control is the tail's `list` kind: a Menu `#ts-menu-toolbar.borderWeight` with rows
         `toolbar.borderWeight.weight-<n>`, not an AnchoredPlate (b3 C2-R3) */
      await page
        .locator('[data-control^="toolbar.borderWeight.weight-"], #ts-menu-toolbar\\.borderWeight')
        .first()
        .waitFor({ timeout: 5000 });
      const weights = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control^="toolbar.borderWeight."], [data-control^="menu.toolbar.borderWeight."]',
          ),
        ]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => /weight-[\d.]+$/.test(c) || /\.\d+(\.\d+)?$/.test(c)),
      );
      const pick = weights.find((c) => /weight-2$|\.4$/.test(c)) ?? weights[weights.length - 1];
      if (pick) await t.clickControl(pick);
      await t.settled();
      const weight = await t.pollUntil(
        () => pathOf(id),
        (f) => f && f.strokeWidth !== colour.strokeWidth,
        8000,
      );
      facts.push(`weight ${colour.strokeWidth} -> ${weight.strokeWidth} (${pick})`);
      await t.selectObject(id);
      await t.tailControl('toolbar.borderDash');
      await t.sleep(400);
      const dashes = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control*="borderDash.pick."], [data-control^="dash.pick."]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const dashPick =
        dashes.find((c) => /dash(ed)?$/i.test(c) && !/longDash/.test(c)) ??
        dashes.find((c) => !/solid|none/i.test(c));
      if (dashPick) await t.clickControl(dashPick);
      await t.settled();
      const dash = await t.pollUntil(
        () => pathOf(id),
        (f) => f && f.dash !== weight.dash,
        8000,
      );
      facts.push(`dash ${weight.dash} -> ${dash.dash} (${dashPick})`);
      await t.selectObject(id);
      await t.openMenu('format');
      await t.hoverRow(
        'format.bordersLines',
        '[data-control="menu.format.bordersLines.borderColor"]',
      );
      await t.clickRow('format.bordersLines.borderColor');
      await t.sleep(500);
      const plate = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control$=".plate"]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      /* the index reads the array, not the promise (b1 cycle 3 R39, applied by the integrator at
         the cycle 3 merge): with `[0]` on the promise the swatch was never clicked and the row
         read the same stroke before and after on every origin, VERIFICATION C2-F11 */
      const swatch = (
        await page.evaluate(() =>
          [...document.querySelectorAll('[data-control$=".green"]')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control')),
        )
      )[0];
      if (swatch) await t.clickControl(swatch);
      await t.settled();
      const menuColour = await t.pollUntil(
        () => pathOf(id),
        (f) => f && f.stroke !== dash.stroke,
        8000,
      );
      facts.push(
        `Format > Borders & lines > Border color (plate ${plate.join(',') || 'none'}) ${dash.stroke} -> ${menuColour.stroke}`,
      );
      await t.clearAll();
      for (let i = 0; i < 4; i += 1) await undo();
      const back = await pathOf(id);
      facts.push(`after four undos stroke ${back.stroke} ${back.strokeWidth} dash ${back.dash}`);
      const ok =
        colour.stroke !== before.stroke &&
        weight.strokeWidth !== colour.strokeWidth &&
        dash.dash !== weight.dash &&
        menuColour.stroke !== dash.stroke &&
        back.stroke === before.stroke &&
        back.strokeWidth === before.strokeWidth &&
        back.dash === before.dash;
      return { ok, observed: facts.join('; ') };
    },
  );
  await t.step(
    'shapes.text.type-align-bold',
    'double click the shape (Enter as the fallback), type, align centre, Cmd+B',
    'the text sits inside the shape',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const b = await t.boxOf(id);
      const c = t.center(b.free);
      await t.dblclickAt(c.x, c.y);
      let on = await t.editing();
      let route = 'double click';
      if (!on) {
        await t.press('Escape');
        await t.selectObject(id);
        await t.press('Enter');
        await t.sleep(300);
        on = await t.editing();
        route = 'Enter';
      }
      if (!on)
        return {
          ok: false,
          observed: 'no text session opened on the shape by a double click or Enter',
        };
      await t.typeHuman('Inside');
      await t.sleep(300);
      await t.press('Meta+a');
      await t.press('Meta+Shift+e');
      await t.press('Meta+b');
      await t.sleep(400);
      await t.press('Escape');
      await t.settled();
      const runs = await t.runsOfBlock(id);
      const run = runs[0];
      const info = run ? await t.runInfo(run) : null;
      const inside =
        info && b
          ? info.rect.x >= b.free.x - 2 &&
            info.rect.x + info.rect.w <= b.free.x + b.free.w + 2 &&
            info.rect.y >= b.free.y - 2 &&
            info.rect.y + info.rect.h <= b.free.y + b.free.h + 2
          : false;
      const json = await blockJson();
      return {
        ok:
          Boolean(info) &&
          info.text.includes('Inside') &&
          inside &&
          /bold|"weight":\s*[67]00|<b>|<strong>/i.test(json + (await t.runHtml(run ?? ''))) &&
          /center/.test(json),
        observed: `${route}; run ${run ?? 'none'} "${info?.text}" inside the box ${inside}; stored ${json.slice(0, 160)}`,
      };
    },
  );
  await t.step(
    'shapes.duplicate-delete-undo-redo',
    'Cmd+D, Delete, Cmd+Z, Cmd+Shift+Z on the shape',
    'one more, one fewer, back, gone',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const n0 = (await t.objectsOf(S)).length;
      await t.press('Meta+d');
      const n1 = (
        await t.pollUntil(
          () => t.objectsOf(S),
          (o) => o.length === n0 + 1,
          8000,
        )
      ).length;
      await t.settled();
      await t.press('Delete');
      const n2 = (
        await t.pollUntil(
          () => t.objectsOf(S),
          (o) => o.length === n0,
          8000,
        )
      ).length;
      await t.settled();
      await t.press('Meta+z');
      const n3 = (
        await t.pollUntil(
          () => t.objectsOf(S),
          (o) => o.length === n0 + 1,
          8000,
        )
      ).length;
      await t.settled();
      await t.press('Meta+Shift+z');
      const n4 = (
        await t.pollUntil(
          () => t.objectsOf(S),
          (o) => o.length === n0,
          8000,
        )
      ).length;
      await t.settled();
      return {
        ok: n1 === n0 + 1 && n2 === n0 && n3 === n0 + 1 && n4 === n0,
        observed: `${n0} -> ${n1} -> ${n2} -> ${n3} -> ${n4}`,
      };
    },
  );
  await t.step(
    'shapes.format-options.size-position',
    'Format > Format options on the shape, type a width',
    'Size and Position show and the width applies',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.menuPath('format', 'format.formatOptions');
      await t.waitControl('panel.formatOptions', 6000);
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
          (el) => el.getAttribute('data-section'),
        ),
      );
      const before = await pos();
      const field = page
        .locator('[data-control="panel.formatOptions"] [data-section="size"] input')
        .first();
      let applied = null;
      if (await field.isVisible().catch(() => false)) {
        const r = await field.boundingBox();
        await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
        await t.press('Meta+a');
        await t.typeHuman('300');
        await t.press('Enter');
        await t.settled();
        applied = await t.pollUntil(pos, (p) => p && p.w !== before.w, 8000);
      }
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      else await t.press('Escape');
      if (applied && applied.w !== before.w) await undo();
      return {
        ok:
          sections.includes('size') &&
          sections.includes('position') &&
          applied !== null &&
          applied.w === 300,
        observed: `sections ${sections.join(', ')}; width ${before.w} -> ${applied?.w ?? 'unchanged'}`,
      };
    },
  );
  await t.step(
    'shapes.context.shape',
    'right click the shape, read the rows, Duplicate from it',
    'the rows and a copy',
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
        'format.textFitting',
        'format.formatOptions',
        'insert.comment',
      ];
      const missing = want.filter((r) => !rows.includes(r));
      const n0 = (await t.objectsOf(S)).length;
      if (rows.includes('edit.duplicate')) await t.clickContextRow('edit.duplicate');
      else await t.press('Escape');
      const n1 = (
        await t.pollUntil(
          () => t.objectsOf(S),
          (o) => o.length === n0 + 1,
          8000,
        )
      ).length;
      await t.settled();
      if (n1 === n0 + 1) {
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok: missing.length === 0 && n1 === n0 + 1,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; duplicated ${n1 === n0 + 1}`,
      };
    },
  );
  await t.step(
    'shapes.reload-and-viewer',
    'give the shape a fill, reload /edit and open /deck',
    'the shapes and their paint are the same',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.tailControl('toolbar.fillColor');
      await t.waitControl('toolbar.fillColor.plate', 5000);
      await t.clickControl('toolbar.fillColor.green');
      await t.settled();
      const before = await pathOf(id);
      const ids = (await t.objectsOf(S)).map((o) => o.id).sort();
      // a real load, not a same document hash change (toolkit reloadTo)
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.settled();
      const after = await t.pollUntil(
        () => pathOf(id),
        (f) => f !== null,
        10_000,
      );
      const idsAfter = (await t.objectsOf(S)).map((o) => o.id).sort();
      await page.goto(`${BASE}/deck/${t.deck.id}#s/${S}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
      /* the viewer's render carries block attributes only on some roots (dither-runtime.ts
         `data-block` "when the render carries block attributes"), so the shape is read by its
         block id first and, when the viewer draws none, as the one svg path of the current slide
         whose fill is the editor's; the observed column says which read answered */
      /* the viewer may open on another slide than the hash names (the gate walk of 22:16Z read
         "viewer undefined" with the block absent from the current sheet), so the shape is looked
         for on the current sheet and then one slide at a time with ArrowRight, six at most */
      const findInViewer = () =>
        page.evaluate(
          ([blockId, wantFill]) => {
            const byId = document.querySelector(`.pt-viewer [data-block="${blockId}"]`);
            const svgOf = (el) =>
              el?.tagName.toLowerCase() === 'svg' ? el : (el?.querySelector('svg') ?? null);
            const pathOfSvg = (svg) => svg?.querySelector('path, ellipse, rect') ?? null;
            let path = pathOfSvg(svgOf(byId));
            let how = 'by block id';
            if (!path) {
              const sheet =
                [...document.querySelectorAll('.pt-viewer .pt-slide')].find(
                  (el) => !el.classList.contains('is-leaving'),
                ) ?? document.querySelector('.pt-viewer .pt-slide');
              const paths = [...(sheet?.querySelectorAll('svg path, svg ellipse, svg rect') ?? [])];
              path = paths.find((p) => getComputedStyle(p).fill === wantFill) ?? null;
              how = path ? 'by fill among the slide paths' : `none of ${paths.length} paths`;
            }
            return path
              ? { fill: getComputedStyle(path).fill, d: path.getAttribute('d') ?? '', how }
              : { fill: undefined, d: undefined, how };
          },
          [id, before?.fill ?? ''],
        );
      let viewer = await t.pollUntil(findInViewer, (v) => v.fill !== undefined, 5000);
      for (let step = 0; step < 6 && viewer.fill === undefined; step += 1) {
        await t.press('ArrowRight');
        await t.sleep(500);
        viewer = await findInViewer();
        if (viewer.fill !== undefined) viewer.how = `${viewer.how} after ${step + 1} ArrowRight`;
      }
      await page.goto(`${BASE}/edit/${t.deck.id}#s/${S}`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.settled();
      return {
        ok:
          Boolean(before && after && viewer) &&
          after.fill === before.fill &&
          after.d === before.d &&
          viewer.fill === before.fill &&
          viewer.d === before.d &&
          same(ids, idsAfter),
        observed: `fill ${before?.fill} -> after reload ${after?.fill} -> viewer ${viewer?.fill}; path same ${after?.d === before?.d && viewer?.d === before?.d}; objects ${ids.join(',')} -> ${idsAfter.join(',')}`,
      };
    },
  );

  // ---- the return round's rows (docs/RETURN.md 2.2, section 5)
  /** The colour of the shape's label as drawn, and the stroke facts. */
  const labelColour = (blockId) =>
    page.evaluate((bid) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${bid}"]`);
      const box = el?.closest('.free') ?? el;
      const run = box?.querySelector('[data-run]');
      return run ? getComputedStyle(run).color : null;
    }, blockId);
  /** The stored block of a shape on the slide (the added rows' read). */
  const blockOf = async (id) => (await t.blockOf(S, id))?.block ?? null;
  await t.step(
    'shapes.text.colour-toolbar',
    'select the rectangle, toolbar Text color, a swatch; Cmd+Z',
    'block.color is written and the label draws in it; Cmd+Z takes it back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = JSON.stringify(await blockOf(id));
      const colourBefore = await labelColour(id);
      await t.tailControl('toolbar.textColor');
      await t.waitControl('toolbar.textColor.plate', 5000);
      const pick = (await t.has('[data-control="toolbar.textColor.red"]'))
        ? 'toolbar.textColor.red'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.textColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$/.test(c)) ?? null,
          );
      if (pick) await t.clickControl(pick);
      await t.settled();
      const written = await t
        .pollUntil(
          async () => (await blockOf(id))?.color ?? null,
          (c) => c !== null,
          8000,
        )
        .catch(async () => (await blockOf(id))?.color ?? null);
      const colourAfter = await labelColour(id);
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = JSON.stringify(await blockOf(id));
      return {
        ok: pick !== null && written !== null && colourAfter !== colourBefore && back === before,
        observed: `picked ${pick}; block.color ${written}; label ${colourBefore} -> ${colourAfter}; restored ${back === before}`,
      };
    },
  );
  await t.step(
    'shapes.text.enter-opens-label',
    'select the rounded rectangle, Enter, type Label, Escape',
    'block.text is stored and drawn (A1 rule 4)',
    async () => {
      const target = rounded?.id ?? ellipse?.id ?? id;
      await t.clearAll();
      await t.selectObject(target);
      await t.press('Enter');
      await t.sleep(300);
      const on = await t.editing();
      const caret = await t.caretFacts((await t.runsOfBlock(target))[0] ?? '').catch(() => null);
      await t.typeHuman('Label');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const stored = await t
        .pollUntil(
          async () => (await blockOf(target))?.text ?? null,
          (x) => typeof x === 'string' && x.includes('Label'),
          8000,
        )
        .catch(async () => (await blockOf(target))?.text ?? null);
      const run = (await t.runsOfBlock(target))[0];
      const drawn = run ? ((await t.runInfo(run))?.text ?? '') : '';
      return {
        ok: on && typeof stored === 'string' && stored.includes('Label') && drawn.includes('Label'),
        observed: `${target}: session on Enter ${on} (caret ${caret ? `offset ${caret.offset} of ${caret.length}` : 'unread'}); stored "${stored}"; drawn "${drawn}"`,
      };
    },
  );
  await t.step(
    'shapes.borders-lines.menu',
    'select the rectangle; Format > Borders & lines > Border color, a red swatch; Border dash > Dot; Cmd+Z each',
    'the stroke writes from the menu and each Cmd+Z takes it back',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await pathOf(id);
      const json0 = JSON.stringify(await blockOf(id));
      await t.menuPath('format', 'format.bordersLines', 'format.bordersLines.borderColor');
      await t.sleep(400);
      const swatch = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              '[data-control*="borderColor."], [data-control*="bordersLines.borderColor."]',
            ),
          ]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control'))
            .find((c) => /red$/i.test(c)) ?? null,
      );
      if (swatch) await t.clickControl(swatch);
      else await t.press('Escape');
      await t.settled();
      const coloured = await t
        .pollUntil(
          () => pathOf(id),
          (f) => f && f.stroke !== before.stroke,
          8000,
        )
        .catch(() => pathOf(id));
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const undone1 = await pathOf(id);
      await t.selectObject(id);
      await t.menuPath(
        'format',
        'format.bordersLines',
        'format.bordersLines.borderDash',
        'format.bordersLines.borderDash.dot',
      );
      await t.settled();
      const dotted = await t
        .pollUntil(
          () => pathOf(id),
          (f) => f && f.dash !== before.dash,
          8000,
        )
        .catch(() => pathOf(id));
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const json2 = JSON.stringify(await blockOf(id));
      return {
        ok:
          swatch !== null &&
          coloured.stroke !== before.stroke &&
          undone1.stroke === before.stroke &&
          dotted.dash !== before.dash &&
          json2 === json0,
        observed: `swatch ${swatch}: stroke ${before.stroke} -> ${coloured.stroke} -> Cmd+Z ${undone1.stroke}; Dot: dash ${before.dash} -> ${dotted.dash}; block restored ${json2 === json0}`,
      };
    },
  );
  t.deck.shape = id;
  t.deck.shapeIds = [rect?.id, rounded?.id, ellipse?.id].filter(Boolean);

  /* the features round, ship one (docs/FEATURES.md 2.2 rank 3): a shape's label is centred by
     default, the renderer's default the exporter reads; the row draws its own rounded rectangle
     by a drag so the label meets a block with no explicit alignment */
  await t.step(
    'shapes.label.centred-default',
    'Insert > Shape > Rounded rectangle by a drag; type Next step; a se resize; read the Align control',
    "the run is centred in both axes within 4 px of the shape's centre, still after the resize; the tail's Align reads centre",
    async () => {
      await t.clearAll();
      const r = await insertShape('rounded', { x: 200, y: 640 }, { x: 560, y: 840 });
      await t.press('Escape');
      await t.settled();
      const shape = r.obj;
      if (!shape) return { ok: false, observed: `nothing drawn: ${r.route}` };
      await t.clearAll();
      await t.selectObject(shape.id);
      const b = await t.boxOf(shape.id);
      await t.dblclickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await t.sleep(250);
      let on = await t.editing();
      if (!on) {
        await t.press('Escape');
        await t.selectObject(shape.id);
        await t.press('Enter');
        await t.sleep(300);
        on = await t.editing();
      }
      if (!on)
        return {
          ok: false,
          observed: `${r.route}; no text session on the shape by a double click or Enter`,
        };
      await t.typeHuman('Next step');
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      /** The run's box against the shape's box: the offsets of the two centres in px. */
      const centred = async () => {
        const box = await t.boxOf(shape.id);
        const run = (await t.runsOfBlock(shape.id))[0];
        const info = run ? await t.runInfo(run) : null;
        if (!box || !info) return null;
        const dx = info.rect.x + info.rect.w / 2 - (box.free.x + box.free.w / 2);
        const dy = info.rect.y + info.rect.h / 2 - (box.free.y + box.free.h / 2);
        return {
          dx: Math.round(dx * 10) / 10,
          dy: Math.round(dy * 10) / 10,
          text: info.text,
          run: info.rect,
        };
      };
      const first = await centred();
      const stored = (await t.blockOf(S, shape.id))?.block ?? null;
      await t.clearAll();
      await t.selectObject(shape.id);
      const se = await t.findHandle(shape.id, 'resize.se');
      let second = null;
      if (se) {
        const k = await t.kOf();
        const from = t.center(await t.handleRect(se));
        await t.drag(from, { x: from.x + 160 * k, y: from.y + 80 * k });
        await t.settled();
        second = await centred();
      }
      await t.clearAll();
      await t.selectObject(shape.id);
      const align = await page.evaluate(() => {
        const el = document.querySelector('[data-control="toolbar.align"]');
        if (!el) return null;
        const use = el.querySelector('use');
        return `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-value') ?? ''} ${el.getAttribute('data-align') ?? ''} ${el.getAttribute('title') ?? ''} ${use?.getAttribute('href') ?? use?.getAttribute('xlink:href') ?? ''} ${el.textContent ?? ''}`.trim();
      });
      const alignCentre = align !== null && /cent/i.test(align);
      const within = (c) => c !== null && Math.abs(c.dx) <= 4 && Math.abs(c.dy) <= 4;
      await t.press('Meta+z');
      await t.sleep(400);
      await t.settled();
      await t.clearAll();
      return {
        ok:
          within(first) &&
          within(second) &&
          alignCentre &&
          stored?.typography?.align === undefined &&
          stored?.valign === undefined,
        observed: `${r.route}; "${first?.text}" centre offset ${first ? `${first.dx},${first.dy}` : 'unread'} px; after the se resize ${second ? `${second.dx},${second.dy}` : se ? 'unread' : 'no se handle'} px; stored align ${stored?.typography?.align ?? 'none'}, valign ${stored?.valign ?? 'none'}; the Align control reads "${align ?? 'absent'}"${within(first) ? '' : ' (FEATURES.md 2.2 rank 3, B3)'}`,
      };
    },
  );
  // ---- the vector round (docs/VECTOR.md sections 2, 3 and 6.1): the geometry interpreter, the
  // four glyph grids, the seven Insert > Shape rows with their icons, Change shape and Mask image
  /** The schema's shapes module under Node's type stripping: the same code the page runs. */
  let schema = null;
  let schemaError = null;
  try {
    schema = await import('../../../../packages/schema/src/shapes.ts');
  } catch (error) {
    schemaError = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
  /** `shapePath` at a box with the defaults, or null with the import's error in the observed column. */
  const expectedPath = (kind, w, h, adjust = []) =>
    schema ? schema.shapePath(kind, w, h, adjust) : null;
  /** The svg paths of a shape block on the stage: every `<path>` with its attributes and computed paint. */
  const pathsOf = (blockId) =>
    page.evaluate((id) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
      );
      const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
      if (!inner || !svg) return null;
      const box = (inner.closest('.free') ?? inner).getBoundingClientRect();
      const paths = [...svg.querySelectorAll('path')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          d: el.getAttribute('d') ?? '',
          fillAttr: el.getAttribute('fill'),
          strokeAttr: el.getAttribute('stroke'),
          fill: cs.fill,
          stroke: cs.stroke,
          strokeWidth: parseFloat(cs.strokeWidth) || 0,
          opacity: parseFloat(cs.opacity),
          fillOpacity: parseFloat(cs.fillOpacity),
          /* the shade overlay of docs/VECTOR.md 2.3 (primitives.ts shadeOverlay) */
          shade: el.getAttribute('data-shade'),
        };
      });
      /* the attributes sit on the svg, which is the block root or a child of it (a shape with
         text wraps the svg and its label layer in one root, primitives.ts) */
      const attr = (name) =>
        inner.getAttribute(name) ??
        inner.querySelector(`[${name}]`)?.getAttribute(name) ??
        inner.closest(`[${name}]`)?.getAttribute(name) ??
        null;
      return {
        shape: attr('data-shape'),
        adjust: attr('data-adjust'),
        box: { w: box.width, h: box.height },
        paths,
      };
    }, blockId);
  const first = (facts) => facts?.paths?.[0] ?? null;
  /**
   * The geometry paths of a block's svg: the distinct `d` strings in order. A shade path's
   * overlay (docs/VECTOR.md 2.3: a paper or ink filled path over the same outline) repeats its
   * `d`, so the joined distinct strings are what `shapePath` answers.
   */
  const geometryPaths = (facts) => {
    const out = [];
    for (const p of facts?.paths ?? []) if (p.shade === null && !out.includes(p.d)) out.push(p.d);
    return out;
  };
  /**
   * The ratio of a star's inner radius to its outer radius along each inner vertex's direction:
   * ECMA star5 puts the inner vertices at `adj / 50000` of the outer ellipse (swd2 by shd2, the
   * box's half sides scaled by hf and vf), so the ratio reads 0.382 at the default 19098 and 0.6
   * at 30000. The path is parsed from the sheet; the answer is the mean over the inner vertices.
   */
  const starRatio = (facts, adjust, size) => {
    const d = first(facts)?.d ?? '';
    const { verts } = parsePath(d);
    /* the path is in sheet px at the box less the stroke (drawnSize); the viewport box is scaled */
    const { w, h } = size;
    const [, hf = 105146, vf = 110557] = adjust;
    const swd2 = ((w / 2) * hf) / 100000;
    const shd2 = ((h / 2) * vf) / 100000;
    const hc = w / 2;
    const svc = ((h / 2) * vf) / 100000;
    const rs = verts
      .map((v) => ({ v, r: Math.hypot(v.x - hc, v.y - svc) }))
      .sort((a, b) => a.r - b.r);
    const inner = rs.slice(0, Math.floor(rs.length / 2));
    const ratios = inner.map(({ v, r }) => {
      const theta = Math.atan2(v.x - hc, -(v.y - svc));
      const outer = Math.hypot(swd2 * Math.sin(theta), shd2 * Math.cos(theta));
      return r / outer;
    });
    const mean = ratios.reduce((a, b) => a + b, 0) / Math.max(1, ratios.length);
    return { ratio: mean, vertices: verts.length };
  };
  /** The drawn size of a shape's path space: the box less the stroke (primitives.ts insets by half of it). */
  const drawnSize = (pos, facts) => {
    const sw = first(facts)?.strokeWidth ?? 1;
    return { w: Math.max(0, pos.w - sw), h: Math.max(0, pos.h - sw), sw };
  };
  const nearPt = (p, x, y, tol = 1.5) => Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol;
  const inside = (p, w, h, tol = 1) =>
    p.x >= -tol && p.y >= -tol && p.x <= w + tol && p.y <= h + tol;
  /** The stored block of a shape and its adjust values (the defaults when the block carries none). */
  const adjustOf = async (blockId, kind) => {
    const stored = (await t.blockOf(S, blockId))?.block ?? null;
    const defaults = schema?.shapeAdjustDefaults(kind) ?? [];
    return { stored: stored?.adjust ?? null, effective: stored?.adjust ?? defaults, defaults };
  };
  /** Cmd+Z, then the object count polled to `n`. */
  const undoTo = async (n) => {
    await t.clearAll();
    await t.press('Meta+z');
    await t
      .pollUntil(
        () => t.objectsOf(S),
        (o) => o.length === n,
        8000,
      )
      .catch(() => undefined);
    await t.settled();
    return (await t.objectsOf(S)).length;
  };
  /** Inserts a preset from a category's grid (a click or a drag); never throws. */
  const insertFromGrid = (category, preset, at, dragTo = null) =>
    t.insertByTool(
      S,
      ['insert.shape', `insert.shape.${category}`, `insert.shape.${category}.pick.${preset}`],
      at,
      dragTo,
      { text: null },
    );
  /** The tiles of an open grid: control, preset and glyph path. */
  const tilesOf = (prefix) =>
    page.evaluate(
      (pre) =>
        [...document.querySelectorAll(`[data-control^="${pre}.pick."]`)]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            control: el.getAttribute('data-control'),
            preset:
              el.getAttribute('data-shape') ??
              el.getAttribute('data-control').replace(`${pre}.pick.`, ''),
            d: [...el.querySelectorAll('path')].map((pth) => pth.getAttribute('d') ?? '').join(' '),
            picked: el.classList.contains('is-picked'),
          })),
      prefix,
    );
  /** Opens Insert > Shape > <category> and reads its grid; the menu stays open. */
  const openGrid = async (category) => {
    await t.clearAll();
    await t.openMenu('insert');
    await t.hoverRow('insert.shape', '[data-control^="menu.insert.shape."]');
    const row = `insert.shape.${category}`;
    if (!(await t.has(`[data-control="menu.${row}"]`)))
      return { row, present: false, tiles: [], grid: false };
    await t
      .hoverRow(row, `[data-control^="${row}.pick."], [data-control="${row}.grid"]`)
      .catch(() => undefined);
    const tiles = await tilesOf(row);
    const grid = await t.has(`[data-control="${row}.grid"]`);
    return { row, present: true, tiles, grid };
  };
  const distinct = (tiles) => new Set(tiles.map((x) => x.d)).size;

  const reach = await t.step(
    null,
    'setup: Insert > Shape > Shapes in the menu, or the switch on while the galleries are parked',
    'the Shapes gallery row is reachable',
    async () => {
      const r = await t.reachRow('insert', 'insert.shape', 'insert.shape.gallery');
      return {
        ok: r.present,
        observed: r.switched
          ? `insert.shape.gallery is parked on this build (docs/VECTOR.md 2.6, B1); Tools > Advanced tools turned on; the row drawn ${r.present}${schemaError ? `; the schema import failed: ${schemaError}` : ''}`
          : `insert.shape.gallery is in the default view (${r.present})${schemaError ? `; the schema import failed: ${schemaError}` : ''}`,
      };
    },
  );
  const galleryReachable = reach.ok === true;
  const notReachable = (row) => ({
    ok: null,
    observed: `not on this build: ${row} is not reachable with the switch on (docs/VECTOR.md 2.6, B1 by request in model.ts)`,
  });

  let hexagonFromGrid = null;
  await t.step(
    'shapes.insert.grid-shapes',
    'Insert > Shape > Shapes: read the plate, Enter on the hexagon tile, one click on the sheet, Escape',
    '100 tiles, at least 95 distinct glyphs, the rectangle a box; Enter arms the draw tool and the click places 240 by 160; Escape closes',
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const g = await openGrid('gallery');
      if (!g.present) return notReachable('insert.shape.gallery');
      const rect = g.tiles.find((x) => x.preset === 'rect');
      const rectBox = rect ? /^M0,0\s*H[\d.]+\s*V[\d.]+\s*H0\s*Z$/.test(rect.d.trim()) : false;
      const n = distinct(g.tiles);
      /* the table's shapes category holds 99 presets, five of them flowchart presets that share a
         plain shape's outline at the defaults (rect, roundRect, ellipse, triangle, diamond), so 94
         glyphs are distinct; the counts are read from the schema so the row follows the table */
      const table = schema ? schema.SHAPE_PRESETS.filter((row) => row.category === 'shapes') : [];
      const wantTiles = table.length || 99;
      const wantDistinct = schema
        ? new Set(table.map((row) => schema.shapePath(row.id, 48, 36, []))).size
        : 94;
      /* Enter on the hexagon tile: the grid takes the keyboard when the row was opened by
         ArrowRight; the tile under the pointer is the active one (ShapePicker onMouseEnter) */
      const tile = `[data-control="insert.shape.gallery.pick.hexagon"]`;
      let route = 'none';
      const before = await t.objectIds(S);
      if (await t.has(tile)) {
        /* the plate opened by the hover holds no focus. The keyboard route: the menu's rows take
           the focus (Menu.tsx rows.current.get(focusId).focus()), so ArrowDown walks to the Shape
           row, ArrowRight opens its list, ArrowDown walks to the Shapes row and ArrowRight opens
           the plate by the keyboard, which focuses the grid (openViaKeyboard; ShapePicker
           autoFocus); the tile under the pointer is the active one and Enter picks it */
        await t.closeMenus().catch(() => undefined);
        await t.openMenu('insert');
        const focusedRow = () =>
          page.evaluate(() => document.activeElement?.getAttribute('data-control') ?? null);
        const walkTo = async (id) => {
          for (let i = 0; i < 40; i += 1) {
            if ((await focusedRow()) === `menu.${id}`) return true;
            await t.press('ArrowDown');
            await t.sleep(60);
          }
          return (await focusedRow()) === `menu.${id}`;
        };
        let byKeys = await walkTo('insert.shape');
        if (byKeys) {
          await t.press('ArrowRight');
          await page
            .locator('[data-control="menu.insert.shape.gallery"]')
            .first()
            .waitFor({ timeout: 4000 })
            .catch(() => undefined);
          byKeys = await walkTo('insert.shape.gallery');
        }
        if (byKeys) {
          await t.press('ArrowRight');
          await page
            .locator(tile)
            .first()
            .waitFor({ timeout: 4000 })
            .catch(() => undefined);
        }
        if (!(await t.has(tile))) {
          /* the keyboard route did not open the plate: the hover does, and the route is recorded */
          await t.hoverRow('insert.shape.gallery', tile).catch(() => undefined);
        }
        await t.sleep(200);
        const r = await t.rectOf(tile);
        if (r) await t.moveHuman({ x: r.x - 20, y: r.y + r.h / 2 }, t.center(r), 6);
        await t.sleep(200);
        const active = await page.evaluate(() => {
          const a = document.activeElement;
          return {
            grid: a?.getAttribute('data-control') ?? null,
            descendant: a?.getAttribute('aria-activedescendant') ?? null,
          };
        });
        if (
          active.grid === 'insert.shape.gallery.grid' &&
          active.descendant === 'ts-shape-hexagon'
        ) {
          await t.press('Enter');
          route = 'Enter on the focused grid (opened by ArrowRight)';
        } else {
          await t.clickControl('insert.shape.gallery.pick.hexagon');
          route = `a click on the tile (the keyboard route reached the row ${byKeys}; the focus sat on ${active.grid ?? 'no control'}, active ${active.descendant ?? 'none'})`;
        }
      }
      await t.sleep(300);
      const menuGone = !(await t.has('#ts-menu-insert'));
      const p = await t.sheetPoint(1000, 600);
      await t.clickAt(p.x, p.y);
      const obj = await t.newObjectAfter(S, before, 15_000);
      await t.press('Escape');
      await t.settled();
      hexagonFromGrid = obj;
      const placed = obj && t.near(obj.pos.w, 240, 1) && t.near(obj.pos.h, 160, 1);
      const facts = obj ? await pathsOf(obj.id) : null;
      return {
        ok:
          g.tiles.length === wantTiles &&
          n === wantDistinct &&
          rectBox &&
          Boolean(placed) &&
          facts?.shape === 'hexagon' &&
          menuGone &&
          route.startsWith('Enter'),
        observed: `${g.tiles.length} tiles (the table's ${wantTiles}), ${n} distinct glyph paths (the table's ${wantDistinct}), the rectangle's a box ${rectBox}; ${route}; the menu closed on the pick ${menuGone}; ${obj ? `${obj.type} ${obj.id} ${t.posStr(obj.pos)} data-shape ${facts?.shape}` : 'nothing placed within 15 s'}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.shapes.hexagon-sheet',
    'Insert > Shape > Shapes, the hexagon tile, one click at (200, 200); Cmd+Z',
    "a 240 by 160 block with data-shape hexagon whose path equals shapePath('hexagon') at the box less the stroke, six vertices; Cmd+Z removes it",
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('gallery', 'hexagon', { x: 200, y: 200 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing inserted: ${r.error}` };
      const facts = await pathsOf(r.obj.id);
      const d = first(facts)?.d ?? '';
      const size = drawnSize(r.obj.pos, facts);
      const want = expectedPath('hexagon', size.w, size.h);
      const parsed = parsePath(d);
      const n1 = await undoTo(n0);
      return {
        ok:
          t.near(r.obj.pos.w, 240, 1) &&
          t.near(r.obj.pos.h, 160, 1) &&
          facts?.shape === 'hexagon' &&
          want !== null &&
          d === want &&
          parsed.verts.length === 6 &&
          n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; data-shape ${facts?.shape}; ${parsed.verts.length} vertices; path ${d.slice(0, 80)}; equals shapePath at ${size.w} by ${size.h} ${want === null ? `(no schema: ${schemaError})` : d === want}; objects after Cmd+Z ${n1} (was ${n0})`,
      };
    },
  );

  /** Types a value into a Format options field and commits it with Enter. */
  const typeField = async (control, value) => {
    const sel = `[data-control="${control}"]`;
    /* the field's section opened when closed, the way the images area opens Adjustments */
    const section = page
      .locator(`[data-control="panel.formatOptions"] [data-section]:has(${sel})`)
      .first();
    if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
      await section.locator('.ts-panel-section-head').first().click();
    const field = page.locator(sel).first();
    const tag = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    const input = tag === 'input' ? field : field.locator('input').first();
    const target = (await input.count()) > 0 ? input : field;
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    /* the panel's fields are disabled while a write of the panel's is in flight (fields.tsx
       disabled={write.busy}), so the typing waits for the field to take keys */
    await t.settled();
    await t
      .pollUntil(
        () => target.isEnabled().catch(() => false),
        (x) => x === true,
        8000,
      )
      .catch(() => undefined);
    const r = await target.boundingBox();
    if (!r) throw new Error(`no field ${control}`);
    await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
    await t.press('Meta+a');
    await t.typeHuman(String(value));
    await t.press('Enter');
    await t.settled();
  };
  /** Format options open on the selected object with the section named drawn, through the menu. */
  const openPanelFor = async (blockId, section) => {
    await t.clearAll();
    await t.selectObject(blockId);
    const drawn = () => t.has(`[data-control="panel.formatOptions"] [data-section="${section}"]`);
    if (!(await drawn())) {
      await t.menuPath('format', 'format.formatOptions');
      await t.waitControl('panel.formatOptions', 6000).catch(() => undefined);
    }
    if (!(await drawn())) {
      /* the menu row toggles the panel: a second pass when the first closed one left open */
      await t.selectObject(blockId);
      await t.menuPath('format', 'format.formatOptions');
      await t.waitControl('panel.formatOptions', 6000).catch(() => undefined);
    }
    return drawn();
  };
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    else if (await t.visible('panel.formatOptions')) await t.press('Escape');
    await t.sleep(200);
  };
  let star = null;
  await t.step(
    'shapes.geometry.shapes.star5-adjust',
    'a 5 point star drawn by a drag to 300 by 300; Format options > Shape > Adjust typed 30; Cmd+Z',
    'adjust[0] reads 30000 and the inner radius is 30 percent of the outer within 1 px; Cmd+Z restores 19098',
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const r = await insertFromGrid('gallery', 'star5', { x: 560, y: 480 }, { x: 860, y: 780 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing drawn: ${r.error}` };
      star = r.obj;
      const before = await pathsOf(star.id);
      const ratioBefore = starRatio(before, [19098, 105146, 110557], drawnSize(star.pos, before));
      const panel = await openPanelFor(star.id, 'shape');
      const field = panel && (await t.visible('formatOptions.shape.adjust.0'));
      if (!field) {
        await closePanel();
        return {
          ok: false,
          observed: `no Adjust field formatOptions.shape.adjust.0 on the panel for ${star.id} (a Shape section drawn ${panel})`,
        };
      }
      await typeField('formatOptions.shape.adjust.0', 30);
      const written = await t
        .pollUntil(
          async () => (await adjustOf(star.id, 'star5')).stored,
          (a) => Array.isArray(a) && a[0] === 30000,
          8000,
        )
        .catch(async () => (await adjustOf(star.id, 'star5')).stored);
      const after = await t
        .pollUntil(
          () => pathsOf(star.id),
          (f) => f && first(f)?.d !== first(before)?.d,
          8000,
        )
        .catch(() => pathsOf(star.id));
      await closePanel();
      const size = drawnSize(star.pos, after);
      const want = expectedPath('star5', size.w, size.h, [30000, 105146, 110557]);
      const radii = starRatio(after, [30000, 105146, 110557], size);
      /* ECMA star5: the inner radius is adj over 50000 of the outer, 0.6 at 30000 (0.382 at the default) */
      const ratioOk =
        Math.abs(radii.ratio - 0.6) <= 0.01 && Math.abs(ratioBefore.ratio - 0.382) <= 0.01;
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = await adjustOf(star.id, 'star5');
      return {
        ok:
          t.near(star.pos.w, 300, 24) &&
          t.near(star.pos.h, 300, 24) &&
          Array.isArray(written) &&
          written[0] === 30000 &&
          ratioOk &&
          want !== null &&
          first(after)?.d === want &&
          back.effective[0] === 19098,
        observed: `${star.id} ${t.posStr(star.pos)}; adjust after the field ${JSON.stringify(written)}; ${radii.vertices} vertices, inner over outer ${t.fmt(radii.ratio * 100)} percent (${t.fmt(ratioBefore.ratio * 100)} at the default; ECMA star5 puts it at adj over 50000); the path equals shapePath at adjust 30000 ${want === null ? 'unread' : first(after)?.d === want}; after Cmd+Z adjust ${JSON.stringify(back.stored)} (effective ${back.effective[0]})`,
      };
    },
  );
  await t.step(
    'shapes.geometry.resize-keeps-adjust',
    'the star with Adjust 30 resized by its se handle to 600 by 600; Cmd+Z',
    'adjust still reads [30000, 105146, 110557] and the inner radius is 30 percent of the outer at the new size; Cmd+Z restores the box',
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      if (!star) return { ok: false, observed: 'no star to resize (the row before drew none)' };
      const panel = await openPanelFor(star.id, 'shape');
      if (!panel || !(await t.visible('formatOptions.shape.adjust.0'))) {
        await closePanel();
        return {
          ok: false,
          observed: `no Adjust field on the panel (a Shape section drawn ${panel})`,
        };
      }
      await typeField('formatOptions.shape.adjust.0', 30);
      await t
        .pollUntil(
          async () => (await adjustOf(star.id, 'star5')).stored,
          (a) => Array.isArray(a) && a[0] === 30000,
          8000,
        )
        .catch(() => undefined);
      await closePanel();
      await t.clearAll();
      await t.selectObject(star.id);
      const before = (await t.blockOf(S, star.id))?.pos ?? null;
      const se = await t.findHandle(star.id, 'resize.se');
      if (!se || !before) return { ok: false, observed: `no se handle (${se}) or no pos` };
      const k = await t.kOf();
      const from = t.center(await t.handleRect(se));
      await t.drag(from, { x: from.x + (600 - before.w) * k, y: from.y + (600 - before.h) * k });
      const after = await t
        .pollUntil(
          async () => (await t.blockOf(S, star.id))?.pos ?? null,
          (p) => p && p.w !== before.w,
          8000,
        )
        .catch(async () => (await t.blockOf(S, star.id))?.pos ?? null);
      await t.settled();
      const adjust = await adjustOf(star.id, 'star5');
      const grown = await pathsOf(star.id);
      const radii = starRatio(grown, [30000, 105146, 110557], drawnSize(after ?? before, grown));
      const ratioOk = Math.abs(radii.ratio - 0.6) <= 0.01;
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = (await t.blockOf(S, star.id))?.pos ?? null;
      /* the adjust write of this row is undone too, so the star reads its defaults after */
      await t.press('Meta+z');
      await t.sleep(400);
      await t.settled();
      return {
        ok:
          Boolean(after) &&
          t.near(after.w, 600, 12) &&
          t.near(after.h, 600, 12) &&
          same(adjust.stored, [30000, 105146, 110557]) &&
          ratioOk &&
          same(back, before),
        observed: `box ${t.posStr(before)} -> ${t.posStr(after)}; adjust ${JSON.stringify(adjust.stored)}; inner over outer ${t.fmt(radii.ratio * 100)} percent at the new size; after Cmd+Z ${t.posStr(back)} (restored ${same(back, before)})`,
      };
    },
  );
  await t.step(
    'shapes.geometry.shapes.pie-arc',
    'Pie by one click',
    'the path carries arcs, starts on the ellipse at 0 degrees, sweeps 270 and ends at the centre; the centre at the box centre within 1 px',
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('gallery', 'pie', { x: 1000, y: 460 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing inserted: ${r.error}` };
      const facts = await pathsOf(r.obj.id);
      const d = first(facts)?.d ?? '';
      const size = drawnSize(r.obj.pos, facts);
      const want = expectedPath('pie', size.w, size.h);
      const parsed = parsePath(d);
      const hc = size.w / 2;
      const vc = size.h / 2;
      const startOnRight = parsed.verts[0] ? nearPt(parsed.verts[0], size.w, vc) : false;
      const centreVertex = parsed.verts.some((v) => nearPt(v, hc, vc));
      /* a 270 degree sweep from 0 degrees ends at the top of the ellipse (hc, 0) */
      const endAtTop = parsed.ends.some((e) => nearPt(e, hc, 0));
      const n1 = await undoTo(n0);
      return {
        ok:
          parsed.ops.includes('A') &&
          startOnRight &&
          centreVertex &&
          endAtTop &&
          want !== null &&
          d === want &&
          n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; ops ${parsed.ops.join('')}; first vertex ${JSON.stringify(parsed.verts[0])} (on the right at mid height ${startOnRight}); an arc ends at the top ${endAtTop}; a vertex at the centre ${centreVertex}; equals shapePath ${want === null ? 'unread' : d === want}; path ${d.slice(0, 100)}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.shapes.multipath-can',
    'Can by one click',
    "three path elements, the lid's with stroke none where the definition says stroke false, the block's fill on the norm paths",
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('gallery', 'can', { x: 200, y: 460 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing inserted: ${r.error}` };
      const facts = await pathsOf(r.obj.id);
      const paths = facts?.paths ?? [];
      const noStroke = paths.filter((p) => p.strokeAttr === 'none' || p.stroke === 'none');
      const fills = [...new Set(paths.map((p) => p.fill))];
      const blockFill = paths.find((p) => p.fillAttr !== 'none' && p.fill !== 'none')?.fill ?? null;
      const normFilled = paths.filter((p) => p.fill === blockFill).length;
      const size = drawnSize(r.obj.pos, facts);
      const want = expectedPath('can', size.w, size.h);
      const geometry = geometryPaths(facts);
      const joined = geometry.join(' ');
      const n1 = await undoTo(n0);
      return {
        ok:
          geometry.length === 3 &&
          noStroke.length >= 1 &&
          normFilled >= 1 &&
          want !== null &&
          joined === want &&
          n1 === n0,
        observed: `${r.obj.id}; ${geometry.length} geometry paths in ${paths.length} path elements (the lighten overlay repeats the lid's); ${noStroke.length} with stroke none; fills ${fills.join(' | ')}; the joined geometry d equals shapePath ${want === null ? 'unread' : joined === want}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.shapes.flowchart-own-space',
    'Flowchart: document drawn by a drag to 300 by 100',
    'every point of the path inside the box within 1 px and the bottom edge a curve',
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid(
        'gallery',
        'flowChartDocument',
        { x: 200, y: 460 },
        { x: 500, y: 560 },
      );
      await t.press('Escape');
      await t.settled();
      if (!r.obj) return { ok: false, observed: `nothing drawn: ${r.error}` };
      const facts = await pathsOf(r.obj.id);
      const d = first(facts)?.d ?? '';
      const size = drawnSize(r.obj.pos, facts);
      const parsed = parsePath(d);
      const allInside = parsed.points.every((p) => inside(p, size.w, size.h, 1));
      const curve = parsed.ops.includes('C') || parsed.ops.includes('Q');
      const want = expectedPath('flowChartDocument', size.w, size.h);
      const n1 = await undoTo(n0);
      return {
        ok:
          t.near(r.obj.pos.w, 300, 24) &&
          t.near(r.obj.pos.h, 100, 24) &&
          allInside &&
          curve &&
          want !== null &&
          d === want &&
          n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; ${parsed.points.length} points, all inside the box ${allInside}; ops ${parsed.ops.join('')} (a curve ${curve}); equals shapePath ${want === null ? 'unread' : d === want}; path ${d.slice(0, 100)}`,
      };
    },
  );

  await t.step(
    'shapes.insert.grid-arrows',
    'Insert > Shape > Arrows: read the plate; pick Left right arrow and drag',
    '26 tiles with distinct glyphs; the drawn arrow has a tip at each end',
    async () => {
      const g = await openGrid('arrows');
      await t.closeMenus();
      if (!g.present) return notReachable('insert.shape.arrows');
      const n = distinct(g.tiles);
      const r = await insertFromGrid(
        'arrows',
        'leftRightArrow',
        { x: 560, y: 460 },
        { x: 900, y: 600 },
      );
      await t.press('Escape');
      await t.settled();
      if (!r.obj)
        return {
          ok: false,
          observed: `${g.tiles.length} tiles, ${n} distinct; nothing drawn: ${r.error}`,
        };
      const facts = await pathsOf(r.obj.id);
      const size = drawnSize(r.obj.pos, facts);
      const parsed = parsePath(first(facts)?.d ?? '');
      const leftTip = parsed.verts.some((v) => nearPt(v, 0, size.h / 2));
      const rightTip = parsed.verts.some((v) => nearPt(v, size.w, size.h / 2));
      await t.selectObject(r.obj.id);
      await t.press('Delete');
      await t.settled();
      return {
        ok: g.tiles.length === 26 && n === 26 && leftTip && rightTip,
        observed: `${g.tiles.length} tiles, ${n} distinct glyph paths; ${r.obj.id} ${t.posStr(r.obj.pos)} data-shape ${facts?.shape}: a tip at the left ${leftTip}, at the right ${rightTip} (${parsed.verts.length} vertices)`,
      };
    },
  );
  await t.step(
    'shapes.geometry.arrows.right-arrow',
    'Insert > Shape > Arrows, the Right arrow tile, one click',
    "seven vertices, the tip at the right edge at half height, the shaft's height adj1 of the box",
    async () => {
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('arrows', 'rightArrow', { x: 560, y: 460 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) {
        if (/Timeout|no element|not found|waiting for/i.test(r.error ?? ''))
          return notReachable('insert.shape.arrows');
        return { ok: false, observed: `nothing inserted: ${r.error}` };
      }
      const facts = await pathsOf(r.obj.id);
      const d = first(facts)?.d ?? '';
      const size = drawnSize(r.obj.pos, facts);
      const parsed = parsePath(d);
      const tip = parsed.verts.some((v) => nearPt(v, size.w, size.h / 2));
      const adj1 = (schema?.shapeAdjustDefaults('rightArrow') ?? [50000])[0];
      const shaft = (size.h * adj1) / 100000;
      const atLeft = parsed.verts
        .filter((v) => Math.abs(v.x) <= 1.5)
        .map((v) => v.y)
        .sort((a, b) => a - b);
      const shaftOk =
        atLeft.length >= 2 && Math.abs(atLeft[atLeft.length - 1] - atLeft[0] - shaft) <= 1.5;
      const want = expectedPath('rightArrow', size.w, size.h);
      const n1 = await undoTo(n0);
      return {
        ok: parsed.verts.length === 7 && tip && shaftOk && want !== null && d === want && n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; ${parsed.verts.length} vertices; tip at the right edge ${tip}; the shaft at the left edge ${atLeft.map((y) => t.fmt(y)).join(',')} (height ${t.fmt(shaft)} wanted, ${shaftOk}); equals shapePath ${want === null ? 'unread' : d === want}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.arrows.curved-right',
    'Curved right arrow by a drag to 240 by 240',
    'three paths with arcs in each; the shade path drawn as the ink overlay at the opacity of docs/VECTOR.md 2.3',
    async () => {
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid(
        'arrows',
        'curvedRightArrow',
        { x: 1000, y: 460 },
        { x: 1240, y: 700 },
      );
      await t.press('Escape');
      await t.settled();
      if (!r.obj) {
        if (/Timeout|no element|not found|waiting for/i.test(r.error ?? ''))
          return notReachable('insert.shape.arrows');
        return { ok: false, observed: `nothing drawn: ${r.error}` };
      }
      const facts = await pathsOf(r.obj.id);
      const paths = facts?.paths ?? [];
      const withArcs = paths.filter((p) => /A/.test(p.d)).length;
      /* the definition's shade path is darkenLess (an ink overlay at 0.15); the row text names
         darken at 0.3; either reading of 2.3 is accepted and the value is recorded */
      const overlay = paths.find((p) => {
        const op = Number.isFinite(p.fillOpacity) && p.fillOpacity < 1 ? p.fillOpacity : p.opacity;
        return op > 0 && op < 1;
      });
      const overlayOpacity = overlay
        ? Number.isFinite(overlay.fillOpacity) && overlay.fillOpacity < 1
          ? overlay.fillOpacity
          : overlay.opacity
        : null;
      const shadeOk =
        overlayOpacity !== null &&
        (Math.abs(overlayOpacity - 0.3) < 0.02 || Math.abs(overlayOpacity - 0.15) < 0.02);
      const n1 = await undoTo(n0);
      return {
        ok: paths.length >= 3 && withArcs >= 3 && shadeOk && n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; ${paths.length} paths, ${withArcs} with arcs; the shade overlay ${overlay ? `fill ${overlay.fill} at opacity ${overlayOpacity}` : 'not drawn'}`,
      };
    },
  );

  await t.step(
    'shapes.insert.grid-callouts',
    'Insert > Shape > Callouts: read the plate; pick Oval callout, one click',
    '4 tiles with distinct glyphs; the callout lands with its pointer',
    async () => {
      const g = await openGrid('callouts');
      await t.closeMenus();
      if (!g.present) return notReachable('insert.shape.callouts');
      const n = distinct(g.tiles);
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('callouts', 'wedgeEllipseCallout', { x: 1000, y: 460 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj)
        return {
          ok: false,
          observed: `${g.tiles.length} tiles, ${n} distinct; nothing placed: ${r.error}`,
        };
      const facts = await pathsOf(r.obj.id);
      const size = drawnSize(r.obj.pos, facts);
      const parsed = parsePath(first(facts)?.d ?? '');
      const pointer = parsed.points.some((p) => !inside(p, size.w, size.h, 1));
      const n1 = await undoTo(n0);
      return {
        ok: g.tiles.length === 4 && n === 4 && pointer && n1 === n0,
        observed: `${g.tiles.length} tiles, ${n} distinct glyph paths; ${r.obj.id} data-shape ${facts?.shape}: a point outside the box (the pointer) ${pointer}; ops ${parsed.ops.join('')}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.callouts.wedge-rect',
    'Insert > Shape > Callouts, Rectangular callout, one click',
    'the pointer tip at (-20833, 62500) of the box from its centre, the other vertices on the box',
    async () => {
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('callouts', 'wedgeRectCallout', { x: 1000, y: 420 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) {
        if (/Timeout|no element|not found|waiting for/i.test(r.error ?? ''))
          return notReachable('insert.shape.callouts');
        return { ok: false, observed: `nothing inserted: ${r.error}` };
      }
      const facts = await pathsOf(r.obj.id);
      const d = first(facts)?.d ?? '';
      const size = drawnSize(r.obj.pos, facts);
      const parsed = parsePath(d);
      const [adj1, adj2] = schema?.shapeAdjustDefaults('wedgeRectCallout') ?? [-20833, 62500];
      const tipX = size.w / 2 + (size.w * adj1) / 100000;
      const tipY = size.h / 2 + (size.h * adj2) / 100000;
      const outside = parsed.verts.filter((v) => !inside(v, size.w, size.h, 1));
      const tipOk = outside.length === 1 && nearPt(outside[0], tipX, tipY);
      const onBox = parsed.verts
        .filter((v) => inside(v, size.w, size.h, 1))
        .every(
          (v) =>
            Math.abs(v.x) <= 1 ||
            Math.abs(v.x - size.w) <= 1 ||
            Math.abs(v.y) <= 1 ||
            Math.abs(v.y - size.h) <= 1,
        );
      const want = expectedPath('wedgeRectCallout', size.w, size.h);
      const n1 = await undoTo(n0);
      return {
        ok: tipOk && onBox && want !== null && d === want && n1 === n0,
        observed: `${r.obj.id} ${t.posStr(r.obj.pos)}; ${parsed.verts.length} vertices, ${outside.length} outside the box: ${outside.map((v) => `${t.fmt(v.x)},${t.fmt(v.y)}`).join(' ')} (the tip wanted at ${t.fmt(tipX)},${t.fmt(tipY)}); the rest on the box ${onBox}; equals shapePath ${want === null ? 'unread' : d === want}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.callouts.cloud',
    'Cloud callout by one click',
    "five paths, the tail's small ellipses below and left of the cloud, cubic curves in the cloud's path",
    async () => {
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('callouts', 'cloudCallout', { x: 1000, y: 420 });
      await t.press('Escape');
      await t.settled();
      if (!r.obj) {
        if (/Timeout|no element|not found|waiting for/i.test(r.error ?? ''))
          return notReachable('insert.shape.callouts');
        return { ok: false, observed: `nothing inserted: ${r.error}` };
      }
      const facts = await pathsOf(r.obj.id);
      const paths = facts?.paths ?? [];
      const size = drawnSize(r.obj.pos, facts);
      const geometry = geometryPaths(facts);
      /* the cloud's own path (the first, in its 43200 space) is eleven arcs (the definition's
         arcTo commands; ECMA cloudCallout draws no cubic); the tail's ellipses are closed arc
         subpaths whose points sit below the middle and left of it */
      const cloudArcs = (geometry[0]?.match(/A/g) ?? []).length;
      const tail = geometry.slice(1, 4);
      const lowerLeft = tail.filter((d) => {
        const pts = parsePath(d).points;
        return pts.length > 0 && pts.every((q) => q.y > size.h * 0.5 && q.x < size.w * 0.6);
      });
      const want = expectedPath('cloudCallout', size.w, size.h);
      const joined = geometry.join(' ');
      const n1 = await undoTo(n0);
      return {
        ok:
          geometry.length === 5 &&
          cloudArcs >= 8 &&
          lowerLeft.length >= 2 &&
          want !== null &&
          joined === want &&
          n1 === n0,
        observed: `${r.obj.id}; ${geometry.length} geometry paths in ${paths.length} elements; the cloud's path carries ${cloudArcs} arcs; ${tail.length} tail paths, ${lowerLeft.length} below and left of the middle; the joined d equals shapePath ${want === null ? 'unread' : joined === want}`,
      };
    },
  );

  await t.step(
    'shapes.insert.grid-equation',
    'Insert > Shape > Equation: read the plate; pick Not equal, one click',
    '6 tiles with distinct glyphs; the shape lands',
    async () => {
      const g = await openGrid('equation');
      await t.closeMenus();
      if (!g.present) return notReachable('insert.shape.equation');
      const n = distinct(g.tiles);
      const n0 = (await t.objectsOf(S)).length;
      const r = await insertFromGrid('equation', 'mathNotEqual', { x: 1000, y: 420 });
      await t.press('Escape');
      await t.settled();
      const facts = r.obj ? await pathsOf(r.obj.id) : null;
      const n1 = r.obj ? await undoTo(n0) : n0;
      return {
        ok:
          g.tiles.length === 6 &&
          n === 6 &&
          Boolean(r.obj) &&
          facts?.shape === 'mathNotEqual' &&
          n1 === n0,
        observed: `${g.tiles.length} tiles, ${n} distinct glyph paths; ${r.obj ? `${r.obj.id} ${t.posStr(r.obj.pos)} data-shape ${facts?.shape}` : `nothing placed: ${r.error}`}`,
      };
    },
  );
  await t.step(
    'shapes.geometry.equation.plus-divide',
    'Insert > Shape > Equation, Plus then Divide by one click each',
    'the plus has twelve vertices and its arms are adj1 of the box; the divide carries a bar and two round dots',
    async () => {
      const n0 = (await t.objectsOf(S)).length;
      const plus = await insertFromGrid('equation', 'mathPlus', { x: 1000, y: 420 });
      await t.press('Escape');
      await t.settled();
      if (!plus.obj) {
        if (/Timeout|no element|not found|waiting for/i.test(plus.error ?? ''))
          return notReachable('insert.shape.equation');
        return { ok: false, observed: `no plus inserted: ${plus.error}` };
      }
      const pf = await pathsOf(plus.obj.id);
      const pd = first(pf)?.d ?? '';
      const ps = drawnSize(plus.obj.pos, pf);
      const pp = parsePath(pd);
      const xs = [...new Set(pp.verts.map((v) => Math.round(v.x * 2) / 2))].sort((a, b) => a - b);
      const adj1 = (schema?.shapeAdjustDefaults('mathPlus') ?? [23520])[0];
      const arm = (Math.min(ps.w, ps.h) * adj1) / 100000;
      /* the vertical arm's edges are the two middle x values of the four the plus draws */
      const armOk = xs.length === 4 && Math.abs(xs[2] - xs[1] - arm) <= 1.5;
      const plusWant = expectedPath('mathPlus', ps.w, ps.h);
      const n1 = await undoTo(n0);
      const divide = await insertFromGrid('equation', 'mathDivide', { x: 1000, y: 420 });
      await t.press('Escape');
      await t.settled();
      if (!divide.obj)
        return { ok: false, observed: `plus ok; no divide inserted: ${divide.error}` };
      const df = await pathsOf(divide.obj.id);
      const dd = first(df)?.d ?? '';
      const ds = drawnSize(divide.obj.pos, df);
      const dp = parsePath(dd);
      const arcs = (dd.match(/A/g) ?? []).length;
      const subpaths = dd.split(/(?=M)/).filter((x) => x.trim() !== '');
      const dots = subpaths.filter((sp) => /A/.test(sp));
      const bar = subpaths.find((sp) => !/A/.test(sp));
      const dotAbove = dots.some((sp) => parsePath(sp).points.every((q) => q.y < ds.h / 2));
      const dotBelow = dots.some((sp) => parsePath(sp).points.every((q) => q.y > ds.h / 2));
      const divideWant = expectedPath('mathDivide', ds.w, ds.h);
      const n2 = await undoTo(n0);
      return {
        ok:
          pp.verts.length === 12 &&
          armOk &&
          plusWant !== null &&
          pd === plusWant &&
          arcs >= 4 &&
          Boolean(bar) &&
          dotAbove &&
          dotBelow &&
          divideWant !== null &&
          dd === divideWant &&
          n1 === n0 &&
          n2 === n0,
        observed: `plus ${plus.obj.id}: ${pp.verts.length} vertices, x values ${xs.join(',')} (arm ${t.fmt(arm)} wanted, ${armOk}), equals shapePath ${plusWant === null ? 'unread' : pd === plusWant}; divide ${divide.obj.id}: ${subpaths.length} subpaths, ${arcs} arcs, a bar ${Boolean(bar)}, a dot above ${dotAbove} and below ${dotBelow}, equals shapePath ${divideWant === null ? 'unread' : dd === divideWant}; ops ${dp.ops.join('')}`,
      };
    },
  );

  await t.step(
    'shapes.geometry.pinned-three',
    "Insert > Shape > Shapes: the Rectangle, Rounded rectangle and Ellipse tiles by one click each; the rounded rectangle's Corner field at 50; Cmd+Z",
    "the paths are the box, four arcs of radius 26.5 and four arcs of half the box (ship one's strings at the drawn box); the Corner field at 50 gives a radius of half the short side",
    async () => {
      if (!galleryReachable) return notReachable('insert.shape.gallery');
      /* the named rows place the legacy kinds (rectangle, rounded, ellipse), drawn as rect and
         ellipse elements (shapes.insert.rounded-click: an svg rect with rx 8); the pinned paths
         are the presets' and are read on the tiles that place them */
      const facts = [];
      let ok = true;
      const placed = {};
      const n0 = (await t.objectsOf(S)).length;
      const at = {
        rect: { x: 200, y: 460 },
        roundRect: { x: 560, y: 460 },
        ellipse: { x: 1000, y: 460 },
      };
      for (const kind of ['rect', 'roundRect', 'ellipse']) {
        const r = await insertFromGrid('gallery', kind, at[kind]);
        await t.press('Escape');
        await t.settled();
        placed[kind] = r.obj;
        if (!r.obj) {
          ok = false;
          facts.push(`${kind} not placed: ${r.error}`);
        }
      }
      const read = async (obj, kind) => {
        if (!obj) return { d: '', size: null, want: null };
        const f = await pathsOf(obj.id);
        const size = drawnSize(obj.pos, f);
        return { d: first(f)?.d ?? '', size, want: expectedPath(kind, size.w, size.h) };
      };
      const rc = await read(placed.rect, 'rect');
      const rectOk =
        /^M0,0\s*H[\d.]+\s*V[\d.]+\s*H0\s*Z$/.test(rc.d.trim()) &&
        rc.want !== null &&
        rc.d === rc.want;
      ok = ok && rectOk;
      facts.push(`rectangle ${rc.d.slice(0, 40)} (a box ${rectOk})`);
      const ro = await read(placed.roundRect, 'roundRect');
      const radius = ro.size
        ? Math.round(((Math.min(ro.size.w, ro.size.h) * 16667) / 100000) * 2) / 2
        : null;
      const roundedOk =
        ro.d.startsWith(`M0,${radius} A${radius},${radius} 0 0 1 ${radius},0`) &&
        (ro.d.match(/A/g) ?? []).length === 4 &&
        ro.want !== null &&
        ro.d === ro.want;
      ok = ok && roundedOk;
      facts.push(`rounded ${ro.d.slice(0, 48)} (four arcs of ${radius} ${roundedOk})`);
      const el = await read(placed.ellipse, 'ellipse');
      const rx = el.size ? Math.round((el.size.w / 2) * 2) / 2 : null;
      const ry = el.size ? Math.round((el.size.h / 2) * 2) / 2 : null;
      /* 'ellipse' is a legacy id as well as the preset id (shapes.ts LEGACY_SHAPE_IDS), so the
         sheet draws the tile's block as an ellipse element of half the drawn box; the pinned path
         is the schema's, read from shapePath, and the element's radii are read from the sheet */
      const drawnEllipse = placed.ellipse
        ? await page.evaluate((id) => {
            const inner = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
            );
            const e =
              inner?.querySelector('ellipse') ??
              (inner?.tagName.toLowerCase() === 'ellipse' ? inner : null);
            return e
              ? { rx: Number(e.getAttribute('rx')), ry: Number(e.getAttribute('ry')) }
              : null;
          }, placed.ellipse.id)
        : null;
      const pathArcs =
        (el.want?.match(/A/g) ?? []).length === 4 && (el.want ?? '').includes(`A${rx},${ry}`);
      const ellipseOk =
        pathArcs &&
        ((el.d !== '' && el.d === el.want) ||
          (drawnEllipse !== null &&
            t.near(drawnEllipse.rx, rx ?? 0, 0.5) &&
            t.near(drawnEllipse.ry, ry ?? 0, 0.5)));
      ok = ok && ellipseOk;
      facts.push(
        `ellipse: shapePath ${(el.want ?? '').slice(0, 44)} (four arcs of ${rx} by ${ry} ${pathArcs}); the sheet draws ${el.d !== '' ? `the path (equal ${el.d === el.want})` : drawnEllipse ? `an ellipse element rx ${drawnEllipse.rx} ry ${drawnEllipse.ry}` : 'neither a path nor an ellipse'} (${ellipseOk})`,
      );
      /* the Corner field at 50: the radius reads half the short side of the drawn box */
      if (placed.roundRect) {
        const panel = await openPanelFor(placed.roundRect.id, 'shape');
        if (panel && (await t.visible('formatOptions.shape.adjust.0'))) {
          await typeField('formatOptions.shape.adjust.0', 50);
          const after = await t
            .pollUntil(
              () => pathsOf(placed.roundRect.id),
              (f) => f && first(f)?.d !== ro.d,
              8000,
            )
            .catch(() => pathsOf(placed.roundRect.id));
          await closePanel();
          const m = /^M0,([\d.]+) A([\d.]+),([\d.]+)/.exec(first(after)?.d ?? '');
          const got = m ? Number(m[2]) : null;
          const wantR = ro.size ? Math.min(ro.size.w, ro.size.h) / 2 : null;
          const cornerOk = got !== null && wantR !== null && Math.abs(got - wantR) <= 1;
          ok = ok && cornerOk;
          facts.push(
            `Corner 50: radius ${got} (${wantR} wanted at the drawn box, 80 at 240 by 160; ${cornerOk})`,
          );
          await t.clearAll();
          await t.press('Meta+z');
          await t.sleep(500);
          await t.settled();
        } else {
          await closePanel();
          ok = false;
          facts.push(`no Corner field on the panel (a Shape section drawn ${panel})`);
        }
      }
      /* the three tiles' shapes leave: one Cmd+Z per insert */
      for (let i = 0; i < 3; i += 1) await undoTo(n0);
      const n1 = (await t.objectsOf(S)).length;
      ok = ok && n1 === n0;
      facts.push(`objects after the undos ${n1} (was ${n0})`);
      return { ok, observed: facts.join('; ') };
    },
  );

  const HEX = { id: 'vector-hexagon', pos: { x: 900, y: 600, w: 240, h: 160 } };
  const placedHex = await t
    .step(
      null,
      'setup: a hexagon for the sites and Change shape rows',
      'block.insert through the window API',
      async () => {
        const h = await t.placeBlock(S, {
          id: HEX.id,
          type: 'shape',
          shape: 'hexagon',
          fill: 'plate',
          stroke: 'ink',
          pos: HEX.pos,
        });
        return { ok: Boolean(h), observed: h ? `${h.id} ${t.posStr(h.pos)}` : 'not placed' };
      },
    )
    .then((r) => r.ok === true);
  await t.step(
    'shapes.geometry.sites',
    "Insert > Line > Line dragged from the sheet to the hexagon's upper right edge; the same to the rectangle",
    'six site marks and connect.end.site below 6 on the hexagon; eight on the rectangle',
    async () => {
      if (!placedHex) return { ok: false, observed: 'the hexagon was not placed' };
      const drawLine = async (from, to) => {
        const before = await t.objectIds(S);
        await t.clearAll();
        await t.openMenu('insert');
        await t.hoverRow('insert.line', '[data-control="menu.insert.line.line"]');
        await t.clickRow('insert.line.line');
        await t.sleep(300);
        const p = await t.sheetPoint(from.x, from.y);
        const q = await t.sheetPoint(to.x, to.y);
        const mid = await t.drag(p, q, {
          steps: 18,
          during: async () => ({ sites: await t.count('.ts-overlay .ts-site') }),
        });
        const obj = await t.newObjectAfter(S, before, 15_000).catch(() => null);
        await t.press('Escape');
        await t.settled();
        const connect = obj ? ((await t.blockOf(S, obj.id))?.block?.connect ?? null) : null;
        return { obj, sites: mid?.sites ?? 0, connect };
      };
      /* the hexagon's upper right site (x2, y1 of its cxnLst: the top right vertex), read from
         the schema; the line's end is dropped on it so the snap has a site under the pointer */
      const hexSites = schema ? schema.sites('hexagon', HEX.pos.w, HEX.pos.h, []) : [];
      const upperRight =
        hexSites.length > 0
          ? hexSites.reduce((best, site) => (site.x - site.y > best.x - best.y ? site : best))
          : { x: HEX.pos.w - 40, y: 0 };
      const hexEdge = { x: HEX.pos.x + upperRight.x, y: HEX.pos.y + upperRight.y };
      const a = await drawLine({ x: 700, y: 420 }, hexEdge);
      const rectPos = rect ? (await t.blockOf(S, rect.id))?.pos : null;
      const b = rectPos
        ? await drawLine(
            { x: 560, y: 480 },
            { x: rectPos.x + rectPos.w, y: rectPos.y + rectPos.h / 2 },
          )
        : null;
      const hexOk =
        Boolean(a.obj) &&
        a.sites === 6 &&
        a.connect?.end?.block === HEX.id &&
        typeof a.connect?.end?.site === 'number' &&
        a.connect.end.site < 6;
      const rectOk = Boolean(b?.obj) && b.sites === 8 && b.connect?.end?.block === rect?.id;
      for (const made of [a.obj, b?.obj]) {
        if (!made) continue;
        const s = await t.state();
        await t
          .invoke('block.remove', { baseRevision: s.revision, slideId: S, blockId: made.id })
          .catch(() => undefined);
        await t.settled();
      }
      return {
        ok: hexOk && rectOk,
        observed: `hexagon (${hexSites.length} sites from the schema, the end dropped on ${t.fmt(upperRight.x)},${t.fmt(upperRight.y)}): ${a.obj ? `${a.obj.id}, ${a.sites} site marks during the drag, connect ${JSON.stringify(a.connect)}` : 'no line drawn'}; rectangle: ${b?.obj ? `${b.obj.id}, ${b.sites} site marks, connect ${JSON.stringify(b.connect)}` : 'no line drawn'}`,
      };
    },
  );

  /** The icon of a menu row: the svg under its .ts-menu-ic with its viewBox, size and joined path. */
  const rowIcons = (selector) =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const ic = el.querySelector('.ts-menu-ic');
            const svg = ic?.querySelector('svg') ?? null;
            return {
              id: el.getAttribute('data-control'),
              viewBox: svg?.getAttribute('viewBox') ?? null,
              width: svg?.getAttribute('width') ?? null,
              height: svg?.getAttribute('height') ?? null,
              d: svg
                ? [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '').join(' ')
                : '',
              other: ic ? [...ic.querySelectorAll('use, img')].length : 0,
            };
          }),
      selector,
    );
  const glyphOk = (icon) =>
    icon !== undefined && icon.viewBox === '0 0 20 20' && icon.d.trim() !== '' && icon.other === 0;
  await t.step(
    'shapes.icons.named-rows',
    'read the icons of the seven Insert > Shape rows in the menu and in the toolbar Shape dropdown',
    'each of the three named rows draws a 16 px glyph (svg viewBox 0 0 20 20 in .ts-menu-ic) with a non empty path, the three differ; the four category rows draw theirs',
    async () => {
      await t.clearAll();
      await t.openMenu('insert');
      await t.hoverRow('insert.shape', '[data-control^="menu.insert.shape."]');
      if (await t.has('[data-control="menu.insert.shape.shapes"]'))
        await t
          .hoverRow('insert.shape.shapes', '[data-control^="menu.insert.shape.shapes."]')
          .catch(() => undefined);
      const menu = await rowIcons('#ts-menu-insert [data-control^="menu.insert.shape."]');
      await t.closeMenus();
      const byId = (list, id) => list.find((x) => x.id === `menu.${id}`);
      const judge = (list) => {
        const named = NAMED_ROWS.map((id) => byId(list, id));
        const categories = CATEGORY_ROWS.map((id) => byId(list, id));
        const namedOk = named.every(glyphOk) && new Set(named.map((x) => x?.d)).size === 3;
        const categoriesOk = categories.every(glyphOk);
        return { namedOk, categoriesOk, named, categories };
      };
      const m = judge(menu);
      let dropdown = [];
      const button = (await t.visible('toolbar.insertShape'))
        ? 'toolbar.insertShape'
        : (await t.visible('toolbar.insertShape.arrow'))
          ? 'toolbar.insertShape.arrow'
          : null;
      if (button !== null) {
        await t.clickControl(button);
        await t.sleep(400);
        dropdown = await rowIcons('[id^="ts-menu-toolbar"] [data-control^="menu.insert.shape."]');
        await t.press('Escape', 2);
      }
      const dd = judge(dropdown);
      const describe = (list) =>
        [...NAMED_ROWS, ...CATEGORY_ROWS]
          .map((id) => {
            const x = byId(list, id);
            return `${id.replace('insert.shape.', '')} ${x ? (glyphOk(x) ? `glyph ${x.d.slice(0, 18)}…` : `no glyph (viewBox ${x.viewBox}, path ${x.d.length} chars, other ${x.other})`) : 'not drawn'}`;
          })
          .join(', ');
      return {
        ok: m.namedOk && m.categoriesOk && dd.namedOk && dd.categoriesOk,
        observed: `menu: ${describe(menu)}; toolbar dropdown (${button ?? 'no button'}): ${describe(dropdown)}`,
      };
    },
  );

  await t.step(
    'shapes.change-shape.plate',
    "select the hexagon; the toolbar's Change shape, pick Octagon; Cmd+Z; the right click menu's Change shape, pick Octagon; Cmd+Z",
    'the picker opens with the hexagon ringed; the pick writes kind octagon and the path has eight vertices; each Cmd+Z restores the hexagon',
    async () => {
      if (!placedHex) return { ok: false, observed: 'the hexagon was not placed' };
      const kindOf = async () => (await t.blockOf(S, HEX.id))?.block?.shape ?? null;
      const facts = [];
      let ok = true;
      await t.clearAll();
      await t.selectObject(HEX.id);
      /* the tail control is parked on the tree before the round: reached with the switch on */
      let tail = (await t.visible('toolbar.changeShape')) || (await t.visible('toolbar.more'));
      if (!(await t.visible('toolbar.changeShape')) && !(await t.advancedOn())) {
        const on = await t.setAdvanced(true);
        if (on) t.deck.advanced = true;
        await t.clearAll();
        await t.selectObject(HEX.id);
        tail = await t.visible('toolbar.changeShape');
      }
      if (!(await t.visible('toolbar.changeShape')) && !(await t.visible('toolbar.more')))
        return notReachable('toolbar.changeShape');
      await t.tailControl('toolbar.changeShape');
      await page
        .locator('[data-control^="toolbar.changeShape.pick."]')
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      const tiles = await tilesOf('toolbar.changeShape');
      const ringed = tiles.find((x) => x.picked)?.preset ?? null;
      facts.push(`toolbar plate: ${tiles.length} tiles, ringed ${ringed}`);
      ok = ok && tiles.length > 0 && ringed === 'hexagon';
      if (tiles.some((x) => x.preset === 'octagon'))
        await t.clickControl('toolbar.changeShape.pick.octagon');
      else await t.press('Escape');
      await t.settled();
      const kind1 = await t.pollUntil(kindOf, (k) => k === 'octagon', 8000).catch(kindOf);
      const paths1 = parsePath(first(await pathsOf(HEX.id))?.d ?? '');
      facts.push(
        `after the pick shape ${kind1}, ${paths1.verts.length} vertices, adjust ${JSON.stringify((await t.blockOf(S, HEX.id))?.block?.adjust ?? null)}`,
      );
      ok = ok && kind1 === 'octagon' && paths1.verts.length === 8;
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const kind2 = await kindOf();
      facts.push(`after Cmd+Z ${kind2}`);
      ok = ok && kind2 === 'hexagon';
      /* the right click menu's Change shape (a context only row) */
      await t.clearAll();
      await t.selectObject(HEX.id);
      const b = await t.boxOf(HEX.id);
      await t.rightClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      const rows = (await t.contextRows()).map((r) => r.id);
      if (rows.includes('format.changeShape')) {
        await t
          .hoverContextRow('format.changeShape', '[data-control^="format.changeShape.pick."]')
          .catch(() => undefined);
        const ctx = await tilesOf('format.changeShape');
        facts.push(
          `context plate: ${ctx.length} tiles, ringed ${ctx.find((x) => x.picked)?.preset ?? 'none'}`,
        );
        if (ctx.some((x) => x.preset === 'octagon'))
          await t.clickControl('format.changeShape.pick.octagon');
        else await t.press('Escape');
        await t.settled();
        const kind3 = await t.pollUntil(kindOf, (k) => k === 'octagon', 8000).catch(kindOf);
        facts.push(`after the context pick ${kind3}`);
        ok = ok && kind3 === 'octagon' && ctx.length > 0;
        await t.clearAll();
        await t.press('Meta+z');
        await t.sleep(500);
        await t.settled();
        const kind4 = await kindOf();
        facts.push(`after Cmd+Z ${kind4}`);
        ok = ok && kind4 === 'hexagon';
      } else {
        await t.press('Escape');
        facts.push(`no Change shape row in the right click menu (${rows.join(', ')})`);
        ok = false;
      }
      return { ok, observed: facts.join('; ') };
    },
  );

  const PIC = { pos: { x: 1300, y: 660, w: 240, h: 160 } };
  const picture = await t
    .step(
      null,
      'setup: a picture for the Mask image row',
      'asset.add and block.insert through the window API',
      async () => {
        const obj = await t.placePicture(S, PIC.pos, 'vector-mask-picture');
        return {
          ok: Boolean(obj),
          observed: obj ? `${obj.id} ${t.posStr(obj.pos)}` : 'not placed',
        };
      },
    )
    .then((r) => (r.ok === true ? 'vector-mask-picture' : null));
  await t.step(
    'shapes.mask-image.plate',
    "select the picture; Format > Image > Mask image, pick Ellipse; the Crop button's arrow; Reset image",
    'the picker opens; the pick writes mask ellipse, the frame carries data-mask ellipse and a clip-path with arcs; the arrow opens the same picker; Reset image clears it',
    async () => {
      if (!picture) return { ok: false, observed: 'the picture was not placed' };
      const maskOf = async () => (await t.blockOf(S, picture))?.block?.mask ?? null;
      const frameOf = () =>
        page.evaluate((id) => {
          const el = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          /* a shot carries the mask on its .shot-crop child (figures.ts), a picture on its root */
          const root = el?.querySelector('[data-mask]') ?? el?.closest('[data-mask]') ?? el;
          return {
            mask: root?.getAttribute('data-mask') ?? null,
            clip: root ? getComputedStyle(root).clipPath : null,
          };
        }, picture);
      const facts = [];
      let ok = true;
      await t.clearAll();
      await t.selectObject(picture);
      const r = await t.reachRow('format', 'format.image', 'format.image.maskImage');
      if (!r.present) return notReachable('format.image.maskImage');
      await t.clearAll();
      await t.selectObject(picture);
      await t.openMenu('format');
      await t.hoverRow('format.image', '[data-control="menu.format.image.maskImage"]');
      await t
        .hoverRow('format.image.maskImage', '[data-control^="format.image.maskImage.pick."]')
        .catch(() => undefined);
      const tiles = await tilesOf('format.image.maskImage');
      facts.push(`menu plate: ${tiles.length} tiles`);
      if (tiles.some((x) => x.preset === 'ellipse'))
        await t.clickControl('format.image.maskImage.pick.ellipse');
      else await t.press('Escape', 2);
      await t.settled();
      const mask = await t.pollUntil(maskOf, (m) => m === 'ellipse', 8000).catch(maskOf);
      const frame = await t.pollUntil(frameOf, (f) => f.mask === 'ellipse', 6000).catch(frameOf);
      facts.push(
        `mask ${mask}; data-mask ${frame.mask}; clip-path ${String(frame.clip).slice(0, 60)}`,
      );
      ok =
        ok &&
        tiles.length > 0 &&
        mask === 'ellipse' &&
        frame.mask === 'ellipse' &&
        /A/.test(String(frame.clip));
      /* the Crop button's arrow opens the same picker */
      await t.clearAll();
      await t.selectObject(picture);
      const arrow = (await t.visible('toolbar.cropImage.arrow')) ? 'toolbar.cropImage.arrow' : null;
      if (arrow) {
        await t.clickControl(arrow);
        await page
          .locator('[data-control$=".pick.ellipse"]')
          .first()
          .waitFor({ timeout: 5000 })
          .catch(() => undefined);
        const opened = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control$=".pick.ellipse"]')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control')),
        );
        facts.push(`the Crop arrow opened ${opened.join(', ') || 'no picker'}`);
        ok = ok && opened.length > 0;
        await t.press('Escape', 2);
      } else {
        facts.push('no Crop arrow toolbar.cropImage.arrow');
        ok = false;
      }
      await t.clearAll();
      await t.selectObject(picture);
      await t.menuPath('format', 'format.image', 'format.image.resetImage');
      const cleared = await t.pollUntil(maskOf, (m) => m === null, 8000).catch(maskOf);
      const frame2 = await t.pollUntil(frameOf, (f) => f.mask === null, 6000).catch(frameOf);
      facts.push(`after Reset image mask ${cleared}, data-mask ${frame2.mask}`);
      ok = ok && cleared === null && frame2.mask === null;
      return { ok, observed: facts.join('; ') };
    },
  );
  await t.advancedBack('the vector round rows of the shapes area');
}

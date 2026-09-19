// Shapes, the minimal set (docs/FOCUS.md 2.6, section 4, 6.4 `shapes.*` with the driver
// `probe --core`): Rectangle, Rounded rectangle and Ellipse as named Insert > Shape rows (the
// plate cell is the fallback on a build that still draws the gallery, recorded as the route),
// their drawing, the default look on both appearances, the battery of move, handles, ring, fill,
// border, text, duplicate, delete, undo, redo, Format options, the reload and the viewer, and the
// right click menu. The two export rows are core/export.spec.ts.

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
];

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
    const named = await t.insertByTool(
      S,
      ['insert.shape', 'insert.shape.shapes', `insert.shape.shapes.${kind}`],
      at,
      dragTo,
      { text: null },
    );
    if (named.obj) return { ...named, route: 'the named row' };
    const plate = await t.insertByTool(
      S,
      ['insert.shape', 'insert.shape.shapes', `insert.shape.shapes.pick.${PLATE[kind]}`],
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
    'open Insert > Shape > Shapes and the toolbar Shape arrow',
    'Rectangle, Rounded rectangle and Ellipse as named rows in both',
    async () => {
      await t.clearAll();
      await t.openMenu('insert');
      await t.hoverRow('insert.shape', '[data-control^="menu.insert.shape."]');
      await t
        .hoverRow(
          'insert.shape.shapes',
          '[data-control^="menu.insert.shape.shapes"], [data-control^="insert.shape.shapes.pick"]',
        )
        .catch(() => undefined);
      const menuRows = (await t.menuRows('insert'))
        .map((r) => r.id)
        .filter((id) => id.startsWith('insert.shape.shapes.'));
      const plate = await t.has(
        '[data-control="insert.shape.shapes.plate"], [data-control^="insert.shape.shapes.pick."]',
      );
      await t.closeMenus();
      const want = [
        'insert.shape.shapes.rectangle',
        'insert.shape.shapes.rounded',
        'insert.shape.shapes.ellipse',
      ];
      const menuOk = want.every((id) => menuRows.includes(id)) && !plate;
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
          [...document.querySelectorAll('[data-control*="insert.shape.shapes."]')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control')),
        );
        arrowOk = want.every((id) => arrowRows.some((c) => c.endsWith(id)));
        await t.press('Escape', 2);
      }
      return {
        ok: menuOk && arrowOk,
        observed: `menu rows ${menuRows.join(', ') || 'none'}; plate drawn ${plate}; arrow rows ${arrowRows.join(', ') || 'none'}`,
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
}

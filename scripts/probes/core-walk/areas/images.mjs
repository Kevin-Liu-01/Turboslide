// Pictures and the slide background, the probe's rows (docs/FOCUS.md 2.4, 6.4 `images.*` with
// the driver `probe --core`). The picture the battery drives is placed through the window API
// (asset.add then block.insert, the dialog's own writes) as a setup write, the convention
// audit-images section 1 records; the upload, drop and paste routes are core/images.spec.ts.

export const NAME = 'images';
export const IDS = [
  'images.insert.toolbar-sources',
  'images.select.chip-handles-tail',
  'images.delete.key',
  'images.move.drag-frame',
  'images.guides.edge-snap',
  'images.guides.centre-y',
  'images.guides.centre-x',
  'images.nudge.arrows',
  'images.resize.eight-handles',
  'images.resize.eight-handles-shift',
  'images.resize.edge-fill',
  'images.resize.alt-centre',
  'images.rotate.ring',
  'images.crop.double-click',
  'images.crop.east-edge',
  'images.crop.south-edge',
  'images.crop.enter',
  'images.crop.undo',
  'images.crop.redo',
  'images.crop.menu-escape',
  'images.crop.toolbar-escape-cancels',
  'images.options.panel',
  'images.options.transparency',
  'images.options.reset',
  'images.reset-image.menu',
  'images.background.colour',
  'images.background.toolbar',
  'images.background.reset',
  'images.present.picture-and-ground',
  'images.context.image',
  'images.options.menu-row',
  'images.background.hex-field',
  /* the product round (docs/PRODUCT.md 8.1) */
  'images.caption.add',
  'images.options.picture-sections-only',
  'images.transparency.slider',
  'images.border.drawn',
];

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page } = t;
  const P = await t
    .setup('a slide for the pictures', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.textSlide ?? t.deck.titleSlide, 'blank');
      t.deck.pictureSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.pictureSlide);
  await t.clickCard(P);
  await t.clearAll();

  await t.step(
    'images.insert.toolbar-sources',
    'click the toolbar Image button',
    'the menu lists Upload from computer',
    async () => {
      /* the button itself opens the file chooser since the product round (docs/PRODUCT.md section
         2 rank 17, b2 R4); the sources sit under its arrow */
      const arrow = await t.has('[data-control="toolbar.insertImage.arrow"]');
      await t.clickControl(arrow ? 'toolbar.insertImage.arrow' : 'toolbar.insertImage');
      await page
        .locator('[data-control="menu.insert.image.upload"]')
        .first()
        .waitFor({ timeout: 6000 })
        .catch(() => undefined);
      const upload = await t.has('[data-control="menu.insert.image.upload"]');
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.insert.image."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      await t.press('Escape', 2);
      return { ok: upload, observed: `${arrow ? 'the arrow; ' : ''}rows ${rows.join(', ')}` };
    },
  );

  const PIC = await t
    .setup(
      'a picture on the slide',
      'asset.add and block.insert through the window API',
      async () => {
        const obj = await t.placePicture(P, { x: 400, y: 250, w: 240, h: 160 });
        return {
          ok: Boolean(obj),
          observed: obj ? `${obj.type} ${obj.id} at ${t.posStr(obj.pos)}` : 'no picture',
        };
      },
    )
    .then(async () =>
      (await t.objectsOf(P)).find((o) => o.type === 'shot' || o.type === 'picture'),
    );
  const id = PIC.id;
  let k = await t.kOf();
  const pos = async () => (await t.blockOf(P, id))?.pos ?? null;
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  await t.step(
    'images.select.chip-handles-tail',
    'click the picture',
    'chip Image, eight handles, the ring and the picture tail',
    async () => {
      const ctrls = await t.selectObject(id);
      const dirs = await t.resizeDirs(id);
      const c = await t.chip();
      const tail = await t.visible('toolbar.cropImage');
      const ring = await t.has('.ts-overlay .ts-select');
      return {
        ok: Boolean(ctrls) && dirs.length === 8 && c === 'Image' && tail && ring,
        observed: `chip "${c}"; handles ${dirs.join(',')}; tail ${tail}; ring ${ring}`,
      };
    },
  );
  await t.step(
    'images.delete.key',
    'Delete, then Cmd+Z',
    'the picture leaves and comes back',
    async () => {
      await t.selectObject(id);
      await t.press('Delete');
      const gone = await t.pollUntil(
        () => t.blockOf(P, id),
        (b) => b === null,
        8000,
      );
      await t.settled();
      await undo();
      const back = await t.pollUntil(
        () => t.blockOf(P, id),
        (b) => b !== null,
        8000,
      );
      return {
        ok: gone === null && back !== null,
        observed: `gone ${gone === null}; back ${back !== null}`,
      };
    },
  );
  await t.step(
    'images.move.drag-frame',
    'drag the picture by its frame edge by 120 by 80 px',
    'pos moves by 120, 80 within the snap',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      k = await t.kOf();
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
  const OTHER = await t
    .setup(
      'a second object for the guides',
      'a text box placed through the window API',
      async () => {
        const obj = await t.placeBlock(P, {
          id: 'guide-box',
          type: 'text',
          text: 'Guide',
          pos: { x: 1000, y: 250, w: 240, h: 100 },
        });
        return { ok: Boolean(obj), observed: obj ? obj.id : 'none' };
      },
    )
    .then(() => 'guide-box');
  const guidesShown = () =>
    page.evaluate(
      () =>
        document.querySelectorAll('.ts-guide, .ts-guides line, [data-control^="guide."]').length,
    );
  await t.step(
    'images.guides.edge-snap',
    "drag the picture so its left edge nears the other object's left edge",
    'a guide shows and the edge snaps',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      k = await t.kOf();
      const before = await pos();
      const other = (await t.blockOf(P, OTHER)).pos;
      const from = await t.frameGrip(id);
      const dx = other.x + 4 - before.x;
      const dy = 200;
      let guides = 0;
      await t.drag(
        from,
        { x: from.x + dx * k, y: from.y + dy * k },
        {
          during: async () => {
            guides = await guidesShown();
          },
        },
      );
      const after = await t.pollUntil(pos, (p) => p && p.x !== before.x, 10_000);
      await t.settled();
      const snapped = after.x === other.x;
      await undo();
      return {
        ok: guides > 0 && snapped,
        observed: `guides during ${guides}; x ${after.x} vs the other's ${other.x}`,
      };
    },
  );
  await t.step(
    'images.guides.centre-y',
    "drag the picture near the slide's horizontal centre",
    'the centre snaps to 450',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      k = await t.kOf();
      const before = await pos();
      const from = await t.frameGrip(id);
      const wantY = 450 - before.h / 2 + 3;
      await t.drag(from, { x: from.x - 60 * k, y: from.y + (wantY - before.y) * k });
      const after = await t.pollUntil(pos, (p) => p && p.y !== before.y, 10_000);
      await t.settled();
      const centre = after.y + after.h / 2;
      await undo();
      return { ok: t.near(centre, 450, 0.5), observed: `centre y ${t.fmt(centre)}` };
    },
  );
  await t.step(
    'images.guides.centre-x',
    "drag the picture within 3 px of the slide's vertical centre",
    'the centre snaps to 800',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      k = await t.kOf();
      const before = await pos();
      const from = await t.frameGrip(id);
      const wantX = 800 - before.w / 2 + 3;
      await t.drag(from, { x: from.x + (wantX - before.x) * k, y: from.y + 30 * k });
      const after = await t.pollUntil(pos, (p) => p && p.x !== before.x, 10_000);
      await t.settled();
      const centre = after.x + after.w / 2;
      await undo();
      return { ok: t.near(centre, 800, 0.5), observed: `centre x ${t.fmt(centre)}` };
    },
  );
  await t.step(
    'images.nudge.arrows',
    'ArrowRight, Shift+ArrowRight, ArrowDown',
    '1 px, 10 px, 1 px',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const p0 = await pos();
      await t.press('ArrowRight');
      const p1 = await t.pollUntil(pos, (p) => p.x !== p0.x, 5000);
      await t.press('Shift+ArrowRight');
      const p2 = await t.pollUntil(pos, (p) => p.x !== p1.x, 5000);
      await t.press('ArrowDown');
      const p3 = await t.pollUntil(pos, (p) => p.y !== p2.y, 5000);
      await t.settled();
      for (let i = 0; i < 3; i += 1) await undo();
      return {
        ok: p1.x - p0.x === 1 && p2.x - p1.x === 10 && p3.y - p2.y === 1,
        observed: `dx ${p1.x - p0.x}, ${p2.x - p1.x}; dy ${p3.y - p2.y}`,
      };
    },
  );

  const expectedPos = (dir, mod, before, d) => {
    const p = { ...before };
    const east = dir.includes('e');
    const west = dir.includes('w');
    const south = dir.includes('s');
    const north = dir.includes('n');
    if (mod === 'alt') {
      if (east) p.w = before.w + 2 * d.x;
      if (west) p.w = before.w - 2 * d.x;
      if (south) p.h = before.h + 2 * d.y;
      if (north) p.h = before.h - 2 * d.y;
      p.x = before.x + before.w / 2 - p.w / 2;
      p.y = before.y + before.h / 2 - p.h / 2;
      return p;
    }
    if (east) p.w = before.w + d.x;
    if (west) {
      p.x = before.x + d.x;
      p.w = before.w - d.x;
    }
    if (south) p.h = before.h + d.y;
    if (north) {
      p.y = before.y + d.y;
      p.h = before.h - d.y;
    }
    return p;
  };
  const DELTA = { x: 60, y: 40 };
  const vec = (dir) => ({
    x: dir.includes('e') ? DELTA.x : dir.includes('w') ? -DELTA.x : 0,
    y: dir.includes('s') ? DELTA.y : dir.includes('n') ? -DELTA.y : 0,
  });
  /** One handle drag; returns the facts. A locked corner (a picture) keeps its ratio without Shift. */
  const resizeOnce = async (dir, mod) => {
    await t.clearAll();
    const ctrls = await t.selectObject(id);
    if (!ctrls) return { ok: false, why: 'the picture could not be selected' };
    k = await t.kOf();
    const before = await pos();
    const chipBefore = await t.chip();
    const h = await t.handleRect(`handle.${id}.resize.${dir}`);
    if (!h) return { ok: false, why: `no ${dir} handle` };
    const d = vec(dir);
    const from = t.center(h);
    const mid = await t.drag(
      from,
      { x: from.x + d.x * k, y: from.y + d.y * k },
      { mods: mod === 'plain' ? [] : [mod], during: async () => ({ readout: await t.readout() }) },
    );
    const after = await t.pollUntil(pos, (p) => p && !same(p, before), 10_000);
    await t.settled();
    const roAfter = await t.readout();
    const chipAfter = await t.chip();
    const stale = await t.staleWords();
    let geometryOk;
    let geometry;
    const tol = 10;
    const lockedCorner = dir.length === 2 && mod !== 'shift';
    if (mod === 'shift' || lockedCorner) {
      const r0 = before.w / before.h;
      const r1 = after.w / after.h;
      geometryOk = Math.abs(r1 - r0) / r0 < 0.06 && !same(after, before);
      geometry = `ratio ${r0.toFixed(3)} -> ${r1.toFixed(3)}`;
      if (mod === 'alt') {
        const cx = (p) => p.x + p.w / 2;
        const cy = (p) => p.y + p.h / 2;
        const centred = t.near(cx(after), cx(before), tol) && t.near(cy(after), cy(before), tol);
        geometryOk = geometryOk && centred;
        geometry += `, centre ${centred ? 'kept' : 'moved'}`;
      }
    } else {
      const exp = expectedPos(dir, mod, before, d);
      geometryOk =
        t.near(after.x, exp.x, tol) &&
        t.near(after.y, exp.y, tol) &&
        t.near(after.w, exp.w, tol) &&
        t.near(after.h, exp.h, tol);
      geometry = `expected ${t.posStr(exp)}`;
    }
    const readoutOk = /^\d+ × \d+$/.test(mid.readout ?? '') && roAfter === null;
    const ok = geometryOk && readoutOk && chipAfter === chipBefore && stale === null;
    await undo();
    const restored = same(await pos(), before);
    return {
      ok: ok && restored,
      why: `${dir} ${mod}: ${t.posStr(before)} -> ${t.posStr(after)} (${geometry}${geometryOk ? '' : ', off'}); readout during "${mid.readout}", after ${roAfter ?? 'none'}; chip "${chipBefore}" -> "${chipAfter}"; undo restored ${restored}${stale ? `; ${stale}` : ''}`,
    };
  };
  for (const [rowId, mod] of [
    ['images.resize.eight-handles', 'plain'],
    ['images.resize.eight-handles-shift', 'shift'],
  ]) {
    await t.step(
      rowId,
      `drag each of the eight handles ${mod === 'shift' ? 'with Shift' : 'plain'}`,
      'the box, the readout during and after, the chip and Undo',
      async () => {
        const facts = [];
        let ok = true;
        for (const dir of DIRS) {
          const r = await resizeOnce(dir, mod);
          ok = ok && r.ok;
          facts.push(`${r.ok ? 'ok' : 'FAIL'} ${r.why}`);
        }
        return { ok, observed: facts.join(' | ') };
      },
    );
  }
  await t.step(
    'images.resize.alt-centre',
    'a drag with Alt on the se handle',
    'the box grows from its centre',
    async () => {
      const r = await resizeOnce('se', 'alt');
      return { ok: r.ok, observed: r.why };
    },
  );
  await t.step(
    'images.resize.edge-fill',
    'after an n, e and s drag the picture fills its box',
    'the img fills the frame after each edge drag',
    async () => {
      const facts = [];
      let ok = true;
      for (const dir of ['n', 'e', 's']) {
        await t.clearAll();
        await t.selectObject(id);
        k = await t.kOf();
        const before = await pos();
        const h = await t.handleRect(`handle.${id}.resize.${dir}`);
        const d = vec(dir);
        const from = t.center(h);
        await t.drag(from, { x: from.x + d.x * k, y: from.y + d.y * k });
        await t.pollUntil(pos, (p) => p && !same(p, before), 10_000);
        await t.settled();
        await t.sleep(300);
        const fill = await page.evaluate((blockId) => {
          const inner = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
          );
          const box = inner?.closest('.free') ?? inner;
          const img = inner?.querySelector('img');
          if (!box || !img) return null;
          const b = box.getBoundingClientRect();
          const i = img.getBoundingClientRect();
          return {
            box: `${Math.round(b.width)}x${Math.round(b.height)}`,
            img: `${Math.round(i.width)}x${Math.round(i.height)}`,
            fills: Math.abs(i.width - b.width) <= 3 && Math.abs(i.height - b.height) <= 3,
          };
        }, id);
        ok = ok && Boolean(fill?.fills);
        facts.push(`${dir}: box ${fill?.box} img ${fill?.img} fills ${fill?.fills}`);
        await undo();
      }
      return { ok, observed: facts.join(' | ') };
    },
  );
  await t.step(
    'images.rotate.ring',
    'drag the ring about 35 degrees',
    'a degree readout during, none after; Undo restores',
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
      await t.sleep(500);
      const ro = await t.readout();
      await undo();
      const back = await pos();
      return {
        ok:
          t.near(after.rotate ?? 0, 35, 6) &&
          /°/.test(mid.readout ?? '') &&
          ro === null &&
          !(back.rotate ?? 0),
        observed: `rotate ${t.fmt(after.rotate)}; readout during "${mid.readout}", after ${ro ?? 'none'}; after undo ${back.rotate ?? 0}`,
      };
    },
  );

  // ---- crop
  const cropOn = () => t.has('.ts-stagewrap.ts-editor[data-crop]');
  await t.step(
    'images.crop.double-click',
    'double click the picture',
    'crop mode with the dimmed picture and eight crop handles',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const b = await t.boxOf(id);
      const c = t.center(b.free);
      await t.dblclickAt(c.x, c.y);
      const on = await t.pollUntil(cropOn, (x) => x, 5000);
      const ctrls = await t.handleControls();
      const cropHandles = ctrls.filter((x) => x.includes('.crop.')).length;
      const dimmed = await t.has('.ts-overlay .ts-crop-full');
      return {
        ok: on && cropHandles === 8 && dimmed,
        observed: `crop ${on}; crop handles ${cropHandles}; dimmed ${dimmed}`,
      };
    },
  );
  const cropDrag = async (dir, dx, dy) => {
    const h = await t.handleRect(`handle.${id}.crop.${dir}`);
    if (!h) throw new Error(`no crop handle ${dir}`);
    k = await t.kOf();
    const frame0 = await t.rectOf('.ts-overlay .ts-crop-frame');
    const full0 = await t.rectOf('.ts-overlay .ts-crop-full');
    const from = t.center(h);
    await t.drag(from, { x: from.x + dx * k, y: from.y + dy * k });
    await t.sleep(400);
    const frame1 = await t.rectOf('.ts-overlay .ts-crop-frame');
    const full1 = await t.rectOf('.ts-overlay .ts-crop-full');
    return { frame0, frame1, full0, full1 };
  };
  await t.step(
    'images.crop.east-edge',
    'drag the east crop edge inward',
    'the frame narrows and the full picture stays',
    async () => {
      const r = await cropDrag('e', -50, 0);
      return {
        ok: r.frame1.w < r.frame0.w - 20 && t.near(r.full1.w, r.full0.w, 2),
        observed: `frame ${t.fmt(r.frame0.w)} -> ${t.fmt(r.frame1.w)}; full ${t.fmt(r.full0.w)} -> ${t.fmt(r.full1.w)}`,
      };
    },
  );
  await t.step(
    'images.crop.south-edge',
    'drag the south crop edge inward',
    'the frame shortens',
    async () => {
      const r = await cropDrag('s', 0, -30);
      return {
        ok: r.frame1.h < r.frame0.h - 10 && t.near(r.full1.h, r.full0.h, 2),
        observed: `frame ${t.fmt(r.frame0.h)} -> ${t.fmt(r.frame1.h)}; full ${t.fmt(r.full0.h)} -> ${t.fmt(r.full1.h)}`,
      };
    },
  );
  let cropped = null;
  let uncropped = null;
  await t.step(
    'images.crop.enter',
    'Enter',
    'the trim is written and the box shrinks to the frame',
    async () => {
      uncropped = await pos();
      await t.press('Enter');
      const off = await t.pollUntil(cropOn, (x) => !x, 5000);
      const after = await t.pollUntil(pos, (p) => p && p.w < uncropped.w, 10_000);
      await t.settled();
      cropped = after;
      const json = await t.blockJson(P, id);
      return {
        ok: !off && after.w < uncropped.w && after.h < uncropped.h && /crop|trim/.test(json),
        observed: `crop mode ${off}; ${t.posStr(uncropped)} -> ${t.posStr(after)}; stored crop ${/crop|trim/.test(json)}`,
      };
    },
  );
  await t.step('images.crop.undo', 'Cmd+Z', 'the trim leaves and the box is restored', async () => {
    await t.clearAll();
    await undo();
    const p = await t.pollUntil(pos, (x) => x && same(x, uncropped), 8000);
    const json = await t.blockJson(P, id);
    return {
      ok: same(p, uncropped) && !/"crop"|"trim"/.test(json),
      observed: `${t.posStr(p)}; stored crop ${/"crop"|"trim"/.test(json)}`,
    };
  });
  await t.step('images.crop.redo', 'Cmd+Shift+Z', 'the crop comes back', async () => {
    await t.press('Meta+Shift+z');
    const p = await t.pollUntil(pos, (x) => x && same(x, cropped), 8000);
    await t.settled();
    return { ok: same(p, cropped), observed: `${t.posStr(p)}` };
  });
  await t.step(
    'images.crop.menu-escape',
    'Format > Image > Crop image, then Escape',
    'crop mode enters and leaves with no write',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      /* the revision is read once the previous row's redo has landed, so the row measures the
         Escape alone (the integrator's merge 1 run on 4367 read 119 while the redo settled at 120) */
      const rev = await t.stableRevision();
      await t.menuPath('format', 'format.image', 'format.image.cropImage');
      const on = await t.pollUntil(cropOn, (x) => x, 5000);
      await t.press('Escape');
      const off = await t.pollUntil(cropOn, (x) => !x, 5000);
      await t.sleep(400);
      const s = await t.settled();
      return {
        ok: on && !off && s.revision === rev,
        observed: `crop on ${on}; off after Escape ${!off}; revision ${rev} -> ${s.revision}`,
      };
    },
  );
  await t.step(
    'images.crop.toolbar-escape-cancels',
    'the toolbar Crop image button, an edge drag, Escape',
    'Escape cancels the drag and writes nothing',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const before = await pos();
      const rev = await t.stableRevision();
      await t.tailControl('toolbar.cropImage');
      const on = await t.pollUntil(cropOn, (x) => x, 5000);
      await cropDrag('e', -40, 0);
      await t.press('Escape');
      await t.pollUntil(cropOn, (x) => !x, 5000);
      await t.sleep(500);
      const s = await t.settled();
      const after = await pos();
      return {
        ok: on && same(after, before) && s.revision === rev,
        observed: `crop on ${on}; pos ${t.posStr(before)} -> ${t.posStr(after)}; revision ${rev} -> ${s.revision}`,
      };
    },
  );

  // ---- options and reset
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    else await t.press('Escape');
    await t.sleep(200);
  };
  await t.step(
    'images.options.panel',
    'the toolbar Image options button',
    'Format options opens with the Picture and Adjustments sections',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.tailControl('toolbar.imageOptions');
      await t.waitControl('panel.formatOptions', 6000);
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
          (el) => el.getAttribute('data-section'),
        ),
      );
      return {
        ok: sections.includes('picture') && sections.includes('adjustments'),
        observed: `sections ${sections.join(', ')}`,
      };
    },
  );
  await t.step(
    'images.options.transparency',
    'drag the Transparency slider',
    'the picture fades on the sheet',
    async () => {
      const section = page.locator(
        '[data-control="panel.formatOptions"] [data-section="adjustments"]',
      );
      if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
        await section.locator('.ts-panel-section-head').click();
      const slider = page
        .locator(
          '[data-control="formatOptions.adjustments.transparency.slider"], [data-control="formatOptions.adjustments.transparency"] input[type="range"]',
        )
        .first();
      await slider.waitFor({ timeout: 6000 });
      /* the panel's sliders are disabled while a write of the panel's is in flight
         (inspector/picture.tsx `disabled={write.busy}`): the drag starts once the previous row's
         write has settled and the input is enabled, and the observed column says whether it was
         (the integrator at the cycle 2 merge, for b4 and b1: the gate read "slider value 0 by no
         pointer route" with the drag a moment after the panel opened) */
      await t.settled();
      const enabled = await t
        .pollUntil(
          () => slider.isDisabled().then((d) => !d),
          (v) => v === true,
          4000,
        )
        .catch(() => false);
      /* the Adjustments section sits below the panel's fold, so the input's box is outside the
         viewport (the merge probe read y 1789 on a 900 px page and `elementFromPoint` null): a raw
         coordinate press lands nowhere while the keyboard route works because focus() scrolls the
         panel. The input is scrolled into view before its box is read (F-transparency's
         mechanism is the driver's, the integrator at the cycle 2 merge, for b4) */
      await slider.scrollIntoViewIfNeeded().catch(() => undefined);
      await t.sleep(200);
      const r = await slider.boundingBox();
      const inView = r !== null && r.y >= 0 && r.y + r.height <= page.viewportSize().height;
      const imgOpacity = () =>
        page.evaluate(
          (blockId) =>
            getComputedStyle(
              document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] img`,
              ),
            ).opacity,
          id,
        );
      const opacityBefore = await imgOpacity();
      // the thumb sits at the left end at zero; a person grabs it and pulls it right
      await t.drag(
        { x: r.x + 8, y: r.y + r.height / 2 },
        { x: r.x + r.width * 0.6, y: r.y + r.height / 2 },
        { steps: 16 },
      );
      let sliderValue = await slider.inputValue().catch(() => '?');
      let route = 'the drag';
      /* a second pointer route when the drag left the value at zero (VERIFICATION.md pass 2
         F-transparency: by hand the drag moved nothing while the keyboard did): a click on the
         track at 60 percent sets a range input's value in Chromium; the keyboard is read last and
         recorded, and passes the row on its own only if a pointer route failed, which the observed
         column then says */
      if (Number(sliderValue) === 0) {
        await t.clickAt(r.x + r.width * 0.6, r.y + r.height / 2);
        await t.sleep(300);
        sliderValue = await slider.inputValue().catch(() => '?');
        route = 'a click on the track';
      }
      let keyboard = null;
      if (Number(sliderValue) === 0) {
        await slider.focus().catch(() => undefined);
        await t.press('ArrowRight', 10);
        await t.sleep(300);
        keyboard = await slider.inputValue().catch(() => '?');
        route = 'no pointer route; the keyboard';
      }
      await t.settled();
      const opacity = await t.pollUntil(imgOpacity, (o) => Number(o) < 0.95, 8000);
      const json = await t.blockJson(P, id);
      const pointerMoved = Number(sliderValue) > 0;
      return {
        ok: pointerMoved && Number(opacity) < 0.95 && /transparency/.test(json),
        observed: `slider enabled before the drag ${enabled}, in view ${inView}; slider value ${sliderValue} by ${route}${keyboard === null ? '' : ` (ArrowRight x10 read ${keyboard})`}; opacity ${opacityBefore} -> ${opacity}; stored transparency ${/transparency/.test(json)}`,
      };
    },
  );
  await t.step('images.options.reset', 'Adjustments > Reset', 'the adjustments clear', async () => {
    const reset = page
      .locator(
        '[data-control="formatOptions.adjustments.reset"], [data-control="panel.formatOptions"] [data-section="adjustments"] button:has-text("Reset")',
      )
      .first();
    if (!(await reset.isVisible().catch(() => false))) {
      await closePanel();
      return { ok: false, observed: 'no Reset button in the Adjustments section' };
    }
    const r = await reset.boundingBox();
    await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
    await t.settled();
    const opacity = await t.pollUntil(
      () =>
        page.evaluate(
          (blockId) =>
            getComputedStyle(
              document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"] img`,
              ),
            ).opacity,
          id,
        ),
      (o) => Number(o) >= 0.99,
      8000,
    );
    const json = await t.blockJson(P, id);
    await closePanel();
    return {
      ok: Number(opacity) >= 0.99 && !/"transparency":\s*0\.\d/.test(json),
      observed: `opacity ${opacity}; stored transparency ${/transparency/.test(json)}`,
    };
  });
  await t.step(
    'images.reset-image.menu',
    'Format > Image > Reset image',
    'the trim leaves',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.menuPath('format', 'format.image', 'format.image.resetImage');
      await t.settled();
      const json = await t.pollUntil(
        () => t.blockJson(P, id),
        (j) => !/"crop"|"trim"/.test(j),
        8000,
      );
      const p = await pos();
      return {
        ok: !/"crop"|"trim"/.test(json),
        observed: `stored crop ${/"crop"|"trim"/.test(json)}; ${t.posStr(p)}`,
      };
    },
  );
  await t.step(
    'images.options.menu-row',
    'Format > Image > Image options',
    'Format options opens at the Picture section',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.menuPath('format', 'format.image', 'format.image.imageOptions');
      await t.waitControl('panel.formatOptions', 6000);
      const open = await t.has(
        '[data-control="panel.formatOptions"] [data-section="picture"]:not(.is-closed)',
      );
      await closePanel();
      return { ok: open, observed: `picture section open ${open}` };
    },
  );
  await t.step(
    'images.context.image',
    'right click the picture, read the rows, Crop image from it',
    'the rows and crop mode',
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
        'format.image.replaceImage',
        'format.image.cropImage',
        'format.image.resetImage',
        'format.image.imageOptions',
        'format.formatOptions',
        'insert.comment',
      ];
      const missing = want.filter((r) => !rows.includes(r));
      if (rows.includes('format.image.cropImage'))
        await t.clickContextRow('format.image.cropImage');
      else await t.press('Escape');
      const on = await t.pollUntil(cropOn, (x) => x, 5000);
      await t.press('Escape');
      await t.pollUntil(cropOn, (x) => !x, 5000);
      return {
        ok: missing.length === 0 && on,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; crop mode ${on}`,
      };
    },
  );

  // ---- the slide background
  const background = async () => (await t.slideJson(P)).background ?? null;
  const openBackground = async (route) => {
    await t.clearAll();
    if (route === 'toolbar') await t.tailControl('toolbar.background');
    else await t.menuPath('slide', 'slide.changeBackground');
    await t.waitControl('dialog.background', 6000);
  };
  await t.step(
    'images.background.colour',
    'Slide > Change background, a colour swatch, Done',
    'the slide paints the colour',
    async () => {
      await openBackground('menu');
      await t.clickControl('dialog.background.color.plate');
      await t.clickControl('dialog.background.done');
      await t.settled();
      const bg = await t.pollUntil(
        background,
        (b) => JSON.stringify(b ?? {}).includes('plate'),
        8000,
      );
      const painted = await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)'),
          ).backgroundColor,
      );
      return {
        ok: JSON.stringify(bg ?? {}).includes('plate'),
        observed: `background ${JSON.stringify(bg)}; sheet paints ${painted}`,
      };
    },
  );
  await t.step(
    'images.background.toolbar',
    'the toolbar Background button',
    'the same dialog opens',
    async () => {
      await openBackground('toolbar');
      const shown = await t.visible('dialog.background');
      await t.press('Escape');
      const gone = await t.waitGone('[data-control="dialog.background"]', 4000);
      return { ok: shown && gone, observed: `shown ${shown}; closed ${gone}` };
    },
  );
  await t.step(
    'images.background.hex-field',
    'Change background, type a hex colour in the field, Enter, Done',
    'the slide paints it and slide.background holds it',
    async () => {
      await openBackground('menu');
      await t.clickControl('dialog.background.color.hex');
      await t.press('Meta+a');
      await t.typeHuman('#336699');
      await t.press('Enter');
      await t.sleep(300);
      await t.press('Tab');
      await t.sleep(300);
      /* a slide colour is painted by the renderer's `.slide-bg` child of `.pt-slide`
         (packages/render/src/slide.ts), so the read takes that child first; without one the
         sheet's `.pt-slide` is transparent and the colour is the first painted ancestor's (the
         plate), as the shapes area's ground read found (b3.md 7.1), and the read walks up from
         the sheet to the first painted background (the integrator at merge 2, for b4: the gate
         read the plate while `#336699` was stored and drawn by the child) */
      const paintedGround = () =>
        page.evaluate(() => {
          const clear = (c) =>
            !c || c === 'transparent' || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(c);
          const slide = document.querySelector(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)',
          );
          const child = slide?.querySelector('.slide-bg');
          if (child) {
            const bg = getComputedStyle(child).backgroundColor;
            if (!clear(bg)) return bg;
          }
          let node = slide;
          for (; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (!clear(bg)) return bg;
          }
          return null;
        });
      const preview = await paintedGround();
      if (await t.visible('dialog.background.done')) await t.clickControl('dialog.background.done');
      await t.settled();
      const bg = await t.pollUntil(
        background,
        (b) => /336699/i.test(JSON.stringify(b ?? {})),
        8000,
      );
      const painted = await t.pollUntil(
        paintedGround,
        (c) => /rgb\(51, 102, 153\)/.test(c ?? ''),
        4000,
      );
      return {
        ok: /336699/i.test(JSON.stringify(bg ?? {})) && /rgb\(51, 102, 153\)/.test(painted ?? ''),
        observed: `background ${JSON.stringify(bg)}; preview while open ${preview}; sheet paints ${painted}`,
      };
    },
  );
  await t.step(
    'images.present.picture-and-ground',
    'Slideshow, then Escape',
    'the show shows the picture on the coloured ground and Escape returns',
    async () => {
      await t.clearAll();
      await t.clickCard(P);
      const groundOf = (rootSelector) =>
        page.evaluate((root) => {
          const viewer = document.querySelector(root);
          const sheet =
            [...(viewer?.querySelectorAll('.pt-slide') ?? [])].find(
              (el) => !el.classList.contains('is-leaving'),
            ) ?? viewer?.querySelector('.pt-slide');
          const painted = (el) => {
            const c = getComputedStyle(el).backgroundColor;
            return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : null;
          };
          if (!sheet) return null;
          let ground = painted(sheet);
          if (!ground)
            for (const el of sheet.querySelectorAll('*')) {
              if (el.closest('[data-block]')) continue;
              ground = painted(el);
              if (ground) break;
            }
          return ground;
        }, rootSelector);
      const editorGround = await groundOf('.ts-stagewrap.ts-editor');
      await t.clickControl('present.open');
      const on = await t.pollUntil(
        () => t.has('.pt-viewer.is-present'),
        (x) => x,
        10_000,
      );
      await t.sleep(800);
      /* the show's slide is the stage's sheet in present mode, `.ts-stagewrap.is-present
         .pt-slide:not(.is-leaving)`; the first `.pt-slide` under `.pt-viewer.is-present` is the
         filmstrip's live clone, which holds no picture and paints no ground (b1's R32,
         VERIFICATION.md C2-F5: the product draws both in the show's stage) */
      const SHOW = '.ts-stagewrap.is-present';
      await page
        .locator(`${SHOW} .pt-slide:not(.is-leaving)`)
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      const facts = await page.evaluate(
        ([blockId, root]) => {
          const sheet = document.querySelector(`${root} .pt-slide:not(.is-leaving)`);
          const img =
            sheet?.querySelector(`[data-block="${blockId}"] img`) ??
            /* a shot object draws `img.shot`; the covering picture kind `img.picture-img` (b3.md) */
            sheet?.querySelector('img.shot, img.picture-img');
          return { img: Boolean(img), sheet: Boolean(sheet) };
        },
        [id, SHOW],
      );
      const showGround = await groundOf(SHOW);
      await t.press('Escape');
      const off = await t.pollUntil(
        () => t.has('.pt-viewer.is-present'),
        (x) => !x,
        8000,
      );
      return {
        ok: on && facts.img && showGround !== null && showGround === editorGround && !off,
        observed: `show ${on} (the stage's present sheet ${facts.sheet}); picture ${facts.img}; ground in the editor ${editorGround}, in the show ${showGround}; back in the editor ${!off}`,
      };
    },
  );
  await t.step(
    'images.background.reset',
    'Change background > Reset to theme',
    'the colour clears',
    async () => {
      await openBackground('menu');
      await t.clickControl('dialog.background.color.none');
      await t.clickControl('dialog.background.done');
      await t.settled();
      const bg = await t.pollUntil(
        background,
        (b) => b === null || !/336699|plate/.test(JSON.stringify(b)),
        8000,
      );
      return {
        ok: bg === null || !/336699|plate/.test(JSON.stringify(bg)),
        observed: `background ${JSON.stringify(bg)}`,
      };
    },
  );
  t.deck.picture = id;
  await productRound(t);
}

/**
 * The product round's rows (docs/PRODUCT.md section 2 rank 10, section 5, 8.1): Add a caption from
 * the picture's menu, Format options scoped to a picture, the Transparency slider and the picture
 * border read from a 2x screenshot. B2 owns the picture routes and the panel.
 */
async function productRound(t) {
  const { page } = t;
  const P = t.deck.pictureSlide ?? t.deck.titleSlide;
  const id = t.deck.picture;
  if (!id)
    throw new (await import('../toolkit.mjs')).SetupFailed('the pictures area left no picture');
  await t.clickCard(P);
  await t.clearAll();
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    await t.sleep(200);
  };
  const block = async () => (await t.blockOf(P, id))?.block ?? null;

  await t.step(
    'images.caption.add',
    'right click the picture > Add a caption; type; Cmd+Z',
    "the caption field prompts; typing stores the shot's caption; Cmd+Z removes it",
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const b = await t.boxOf(id);
      const c = t.center(b.free);
      await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      if (!rows.includes('format.image.addCaption')) {
        await t.press('Escape');
        return t.notBuilt(
          'format.image.addCaption',
          'B2',
          `the picture's menu lists ${rows.join(', ')}`,
        );
      }
      await t.clickContextRow('format.image.addCaption');
      await t.sleep(500);
      const prompt = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              '.ts-stagewrap.ts-editor .pt-slide [data-prompt], .ts-stagewrap.ts-editor .pt-slide [data-placeholder], [data-control="formatOptions.picture.caption"]',
            ),
          ]
            /* the prompt span of an empty caption, or the placeholder the open caption field
               keeps while it is empty (the row opens the field at once) */
            .map(
              (el) =>
                (el.matches('input, textarea')
                  ? el.getAttribute('placeholder')
                  : (el.getAttribute('data-placeholder') ?? el.textContent?.trim())) ?? '',
            )
            .find((s) => /Add a caption/.test(s)) ?? null,
      );
      const field = page.locator('[data-control="formatOptions.picture.caption"]').first();
      if ((await field.count()) > 0) {
        await field.click();
        await t.typeHuman('Q3 pipeline');
        await t.press('Tab');
      } else {
        await t.typeHuman('Q3 pipeline');
        await t.press('Escape');
      }
      const stored = await t
        .pollUntil(block, (b0) => /Q3 pipeline/.test(b0?.caption ?? ''), 8000)
        .then(() => true)
        .catch(() => false);
      await t.settled();
      await t.clearAll();
      await t.press('Meta+z');
      const undone = await t
        .pollUntil(block, (b0) => !/Q3 pipeline/.test(b0?.caption ?? ''), 8000)
        .then(() => true)
        .catch(() => false);
      await t.settled();
      return {
        ok: prompt !== null && stored && undone,
        observed: `prompt "${prompt ?? 'none'}"; caption stored ${stored}; removed by Cmd+Z ${undone}; caption now ${JSON.stringify((await block())?.caption ?? null)}`,
      };
    },
  );
  await t.step(
    'images.options.picture-sections-only',
    'the toolbar Image options with the picture selected; read the sections',
    'Size & rotation, Position and Image options, and no text section',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.tailControl('toolbar.imageOptions');
      await t.waitControl('panel.formatOptions', 6000);
      await t.sleep(300);
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
          (el) => ({
            id: el.getAttribute('data-section'),
            head: el.querySelector('.ts-panel-section-head')?.textContent?.trim() ?? '',
          }),
        ),
      );
      await closePanel();
      const ids = sections.map((s) => s.id);
      const textSection = ids.filter((s) => s === 'text' || s === 'textFitting');
      const imageOptions = sections.find((s) => s.id === 'picture' || s.id === 'adjustments');
      return {
        ok:
          ids.includes('size') &&
          ids.includes('position') &&
          Boolean(imageOptions) &&
          textSection.length === 0 &&
          sections.some((s) => /Image options/.test(s.head)),
        observed: `sections ${sections.map((s) => `${s.id} "${s.head}"`).join(', ')}; text sections ${textSection.join(', ') || 'none'}`,
      };
    },
  );
  await t.step(
    'images.transparency.slider',
    'Adjustments > Transparency: drag the slider to 40',
    'a slider with the field beside it; the block reads adjust.transparency 0.4',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      await t.tailControl('toolbar.imageOptions');
      await t.waitControl('panel.formatOptions', 6000);
      const section = page.locator(
        '[data-control="panel.formatOptions"] [data-section="adjustments"]',
      );
      if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
        await section.locator('.ts-panel-section-head').click();
      const facts = await page.evaluate(() => {
        const control = document.querySelector(
          '[data-control="formatOptions.adjustments.transparency"]',
        );
        const row =
          control?.closest('.ts-fo-field, .ts-fo-row, label, div') ??
          control?.parentElement ??
          null;
        const range = control?.matches('input[type="range"]')
          ? control
          : (row?.querySelector('input[type="range"]') ??
            document.querySelector(
              '[data-control="formatOptions.adjustments.transparency.slider"]',
            ));
        const field =
          row?.querySelector('input[type="number"], input[type="text"], input[inputmode]') ?? null;
        return {
          range: Boolean(range),
          field: Boolean(field && field !== range),
          controlTag: control?.tagName.toLowerCase() ?? null,
          controlType: control?.getAttribute('type') ?? null,
        };
      });
      if (!facts.range) {
        await closePanel();
        return {
          ok: false,
          observed: `Transparency is not a slider: the control is ${facts.controlTag ?? 'absent'}${facts.controlType ? `[type=${facts.controlType}]` : ''} (audit-gaps 20)`,
        };
      }
      const slider = page
        .locator(
          '[data-control="formatOptions.adjustments.transparency.slider"], [data-control="formatOptions.adjustments.transparency"] input[type="range"], input[type="range"][data-control="formatOptions.adjustments.transparency"]',
        )
        .first();
      await slider.scrollIntoViewIfNeeded().catch(() => undefined);
      await t.settled();
      await t.sleep(200);
      const r = await slider.boundingBox();
      const min = Number((await slider.getAttribute('min')) ?? 0);
      const max = Number((await slider.getAttribute('max')) ?? 100);
      const want = min + (max - min) * 0.4;
      const from = { x: r.x + 8, y: r.y + r.height / 2 };
      const to = { x: r.x + 8 + (r.width - 16) * 0.4, y: r.y + r.height / 2 };
      await t.drag(from, to, { steps: 16 });
      await t.settled();
      const value = Number(await slider.inputValue().catch(() => NaN));
      const stored = await t
        .pollUntil(
          async () => (await block())?.adjust?.transparency ?? null,
          (v) => v !== null && Math.abs(v - 0.4) <= 0.06,
          8000,
        )
        .catch(async () => (await block())?.adjust?.transparency ?? null);
      if (await t.visible('formatOptions.adjustments.reset'))
        await t.clickControl('formatOptions.adjustments.reset');
      await t.settled();
      await closePanel();
      return {
        ok: facts.field && stored !== null && Math.abs(stored - 0.4) <= 0.06,
        observed: `slider ${facts.range}, field beside it ${facts.field}; dragged to ${t.fmt(value)} of ${max} (wanted ${t.fmt(want)}); adjust.transparency ${stored ?? 'none'}`,
      };
    },
  );
  await t.step(
    'images.border.drawn',
    'Border color > ink on the picture; read the frame at 2x',
    'frame.color is ink and a 1 px ring draws along the picture edge',
    async () => {
      await t.clearAll();
      await t.selectObject(id);
      const control = await t.tailControl('toolbar.borderColor').catch(() => null);
      if (!control) return { ok: false, observed: 'no Border color control on the picture tail' };
      await t.waitControl('toolbar.borderColor.plate', 6000).catch(() => undefined);
      const ink = page.locator('[data-control="toolbar.borderColor.ink"]').first();
      if ((await ink.count()) === 0) {
        await t.press('Escape');
        return { ok: false, observed: 'no ink swatch in the Border color plate' };
      }
      await ink.click();
      const stored = await t
        .pollUntil(
          async () => (await block())?.frame?.color ?? null,
          (v) => v === 'ink',
          8000,
        )
        .catch(async () => (await block())?.frame?.color ?? null);
      await t.settled();
      await t.press('Escape');
      await t.clearAll();
      const b = await t.boxOf(id);
      const free = b.free;
      const clip = {
        x: Math.max(0, free.x - 6),
        y: Math.max(0, free.y - 6),
        width: free.w + 12,
        height: free.h + 12,
      };
      const img = await t.shotPixels2x(clip);
      /* a row across the left edge at mid height, in device pixels: the shot's own scale is read
         from its width against the clip (a shot that came back at 1x read an empty row before,
         the y past the image's height, and the step said "ring none read" for a ring it never
         looked at) */
      const scale = img.width / clip.width;
      const y = Math.min(img.height - 1, Math.round((free.h / 2 + 6) * scale));
      const runs = t.runsAlongRow(img, y, 0, Math.min(img.width - 1, Math.round(20 * scale)));
      const paper = img.pixel(1, y);
      /* the ring: a thin run (1 to 6 device px) that reads at 3:1 or better against the paper
         beside the picture; the picture's own body is the long run after it (the earlier clause
         compared a hex string with an rgb triple and read NaN, so a drawn ring read as none) */
      const ring =
        runs.find(
          (r0) =>
            r0.thickness >= 1 &&
            r0.thickness <= 6 &&
            t.contrastOf(
              `rgb(${[1, 3, 5].map((i) => parseInt(r0.color.slice(i, i + 2), 16)).join(',')})`,
              `rgb(${paper.join(',')})`,
            ) >= 3,
        ) ?? null;
      /* the frame off again through the window API */
      const s = await t.settled();
      await t
        .invoke('block.set', { baseRevision: s.revision, slideId: P, blockId: id, path: '/frame' })
        .catch(() => undefined);
      await t.settled();
      return {
        ok: stored === 'ink' && ring !== null,
        observed: `frame.color ${stored ?? 'none'}; shot at ${scale.toFixed(1)}x (${img.width} by ${img.height} device px); across the left edge at y ${y}: ${runs.map((r0) => `${r0.color} x${r0.thickness}`).join(', ') || 'no run'}; ring ${ring ? `${ring.color} ${ring.thickness} device px` : 'none read'}`,
      };
    },
  );
  await t.clearAll();
}

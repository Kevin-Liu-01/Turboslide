// The shader library, the probe's rows (docs/FEATURES.md section 5, 7.1 `shaders.*` with the
// driver `probe --core`, and the View row `shaders.view.play-setting`): Insert > Shader's gallery
// with its thumbnails, search and category chips, the insert in the body's free rectangle with the
// chip Shader, the seller's words on every surface, the Shader section's Strength slider (live
// while dragging, one write on release, one Cmd+Z), the preset tiles, the ten slider sentences,
// the kit's six swatches feeding the shader, the one home of the recipe, Change background >
// Shader > Place answering in a sentence, one live mount per stage, and the P1 rows (Add to theme,
// the Frame scrubber, View > Play shaders, the gallery's hover mount). The spec rows (the frame's
// capture, aspect, reuse and one capturer, the hidden tab and the reduced motion context, the
// measurement row, the agent transports, the exports and the section at two viewports) are
// core/shaders.spec.ts, core/export.spec.ts and core/chrome.spec.ts.
//
// The controls are B1's (`dialogs/ShaderGallery.tsx`, the Shader row of `dialogs/Background.tsx`)
// and B5's (`inspector/shader.tsx`, the mount, the palette) with the menu row `insert.shader` in
// `model.ts` by request to the integrator (FEATURES.md section 6). A row whose control is not on
// the build reads not driven with the control's id and its lane (docs/PRODUCT.md 8.1); a control
// that exists is judged. Two readings need the mount at rest: the walk emulates
// `prefers-reduced-motion: reduce` on its one page for them (FEATURES.md 5.6: speed 0) and puts
// the media back, so a pixel comparison reads the slider or the preset and not the animation.

export const NAME = 'shaders';
export const IDS = [
  'shaders.insert.gallery-thumbnails',
  'shaders.insert.selected-free-rectangle',
  'shaders.insert.words',
  'shaders.panel.slider-live-undo',
  'shaders.panel.preset-tiles',
  'shaders.panel.control-sentences',
  'shaders.panel.kit-colours',
  'shaders.panel.one-home',
  'shaders.background.place-answers',
  'shaders.perf.one-context',
  'shaders.background.add-to-theme',
  'shaders.frame.scrubber-capture',
  'shaders.view.play-setting',
  'shaders.insert.gallery-hover-live',
];

const MENU_LANE = 'B1 (model.ts by request to the integrator)';
const GALLERY_LANE = 'B1 (dialogs/ShaderGallery.tsx)';
const PANEL_LANE = 'B5 (inspector/shader.tsx)';
const BACKGROUND_LANE = 'B1 (dialogs/Background.tsx)';
/** The Shader section's groups in the order of FEATURES.md 5.3. */
export const GROUPS = [
  'Shader',
  'Preset',
  'Colors',
  'Form',
  'Light and texture',
  'Orientation',
  'Motion',
  'Dither',
  'Advanced',
];
/** The eleven common controls and the ten sentences of FEATURES.md 5.3 (Center X and Y share one). */
export const SENTENCES = {
  strength: 'how strong the effect is',
  detail: 'how fine the pattern is',
  frequency: 'how many repeats fit across the box',
  amplitude: 'how far the pattern moves from rest',
  density: 'how much of the box the pattern fills',
  brightness: 'how light the whole shader is',
  grain: 'how much film grain is mixed in',
  rotation: 'the angle of the pattern',
  centerX: "where the pattern's middle sits",
  centerY: "where the pattern's middle sits",
  speed: 'how fast it plays in the show',
};
/** The kit's six roles (packages/schema/src/brand.ts KIT_COLORS), the swatches of 5.7. */
const KIT_ROLES = ['text', 'background', 'caption', 'hint', 'primary', 'accent'];
const STAGE = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
/** The Shader section's root: FormatOptions' section, or B5's own root carrying the section's id. */
const SECTION_ROOT = '[data-section="shader"], .ts-shader[data-control="formatOptions.shader"]';

export async function run(t) {
  const { page, BASE, context } = t;
  /* a Title slide for the insert rows (the row reads the slide's kind before and after) and a
     Title and body slide for the background rows */
  const S = await t
    .setup('a Title slide for the shader rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.logoSlide ?? t.deck.titleSlide, 'title');
      t.deck.shaderSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.shaderSlide);
  const B = await t
    .setup(
      'a Title and body slide for the background rows',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(S, 'split');
        t.deck.shaderGroundSlide = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.shaderGroundSlide);
  await t.clickCard(S);
  await t.clearAll();

  // ---------------------------------------------------------------------------------------------
  // the readers

  /** The material (shader) blocks of a slide. */
  const shaderBlocks = async (slide) =>
    (await t.objectsOf(slide)).filter((o) => o.type === 'material');
  /**
   * Places a material block through the window API (a setup write) and answers the new shader
   * object, never the first new positioned object: the first insert on a layout slide converts it
   * to a canvas in the same commit and the layout's mark, heading and lead gain a pos too (the
   * logos area's lesson, ship one), so `t.placeBlock` would answer the mark.
   */
  const placeShader = async (slide, block) => {
    const before = (await shaderBlocks(slide)).map((o) => o.id);
    const s = await t.state();
    await t.invoke('block.insert', {
      baseRevision: s.revision,
      slideId: slide,
      slot: 'main',
      block,
    });
    const obj = await t
      .pollUntil(
        () => shaderBlocks(slide),
        (list) => list.some((o) => !before.includes(o.id)),
        20_000,
      )
      .then((list) => list.find((o) => !before.includes(o.id)) ?? null)
      .catch(() => null);
    await t.settled();
    return obj;
  };
  /** An asset record of the deck by id from describe().state.assets, or null. */
  const assetOf = async (id) => {
    if (!id) return null;
    const state = await t.state().catch(() => null);
    const assets = state?.assets ?? {};
    return Array.isArray(assets) ? (assets.find((a) => a.id === id) ?? null) : (assets[id] ?? null);
  };
  /** The gallery's cards: the top level tiles with their material, title and thumbnail facts. */
  const cards = () =>
    page.evaluate(() => {
      const sel =
        '[data-control^="dialog.shader.tile."], [data-control^="dialog.shader.card."], [data-control^="dialog.shader.pick."]';
      const all = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
      const top = all.filter((e) => e.parentElement?.closest(sel) === null);
      return top.map((e) => {
        const img = e.querySelector('img');
        const r = e.getBoundingClientRect();
        return {
          id: e.getAttribute('data-control'),
          material: e.getAttribute('data-material') ?? e.getAttribute('data-id') ?? null,
          title: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 60),
          thumb: img ? img.complete && img.naturalWidth > 0 : false,
          canvas: e.querySelector('canvas') !== null,
          top: Math.round(r.top),
          left: Math.round(r.left),
        };
      });
    });
  /** The canvases of the open dialog. */
  const dialogCanvases = (control = 'dialog.shader') =>
    page.evaluate((c) => {
      const root =
        document.querySelector(`[data-control="${c}"]`)?.closest('[role="dialog"]') ??
        document.querySelector(`[data-control="${c}"]`);
      return root ? root.querySelectorAll('canvas').length : 0;
    }, control);
  /** Opens Insert > Shader; answers whether the gallery is drawn, or a not built reading. */
  const openGallery = async () => {
    await t.clearAll();
    const r = await t.reachRow('insert', 'insert.shader');
    if (!r.present)
      return {
        open: false,
        why: t.notBuilt(
          'insert.shader',
          MENU_LANE,
          `no Shader row in the Insert menu (FEATURES.md 5.4; the row insert.material ${
            (await t.menuRowPresent('insert', 'insert.material')) ? 'is' : 'is not'
          } drawn in its place)`,
        ),
      };
    await t.menuPath('insert', 'insert.shader');
    const shown = await t
      .pollUntil(
        async () =>
          (await t.visible('dialog.shader'))
            ? 'shader'
            : (await t.visible('dialog.insertMaterial'))
              ? 'material'
              : null,
        (x) => x !== null,
        8000,
      )
      .catch(() => null);
    if (shown !== 'shader') {
      if (shown === 'material') {
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.insertMaterial"]', 4000);
      }
      return {
        open: false,
        why: {
          ok: false,
          observed: `Insert > Shader ${r.switched ? '(with the switch on) ' : ''}opened ${
            shown === 'material'
              ? 'the Material list (dialog.insertMaterial), not the gallery'
              : 'no dialog.shader within 8 s'
          }`,
        },
      };
    }
    await t.waitControl('dialog.shader.search', 4000).catch(() => undefined);
    await t.sleep(300);
    return { open: true, switched: r.switched };
  };
  const closeGallery = async () => {
    if (await t.visible('dialog.shader')) {
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.shader"]', 4000);
    }
    await t.clearAll();
  };
  /** The card whose title or material names the entry. */
  const cardFor = (list, re) =>
    list.find((c) => re.test(c.title) || re.test(c.material ?? '')) ?? null;
  /** Clicks a card; answers the new shader block on the slide, or null. */
  const insertCard = async (slide, card) => {
    const before = await t.objectIds(slide);
    await t.clickControl(card.id);
    const obj = await t
      .pollUntil(
        () => shaderBlocks(slide),
        (list) => list.some((o) => !before.includes(o.id)),
        20_000,
      )
      .then((list) => list.find((o) => !before.includes(o.id)) ?? null)
      .catch(() => null);
    await t.waitGone('[data-control="dialog.shader"]', 8000);
    await t.settled();
    return obj;
  };
  /** The clip of a block's box on the stage, in viewport px. */
  const clipOf = async (id, inset = 2) => {
    const b = await t.boxOf(id);
    if (!b) return null;
    return {
      x: Math.round(b.free.x + inset),
      y: Math.round(b.free.y + inset),
      width: Math.max(2, Math.round(b.free.w - 2 * inset)),
      height: Math.max(2, Math.round(b.free.h - 2 * inset)),
    };
  };
  const luminance = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  /** The mean luminance and the mean colour of a decoded shot. */
  const meanOf = (img) => {
    let l = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = 0; y < img.height; y += 2)
      for (let x = 0; x < img.width; x += 2) {
        const p = img.pixel(x, y);
        l += luminance(p);
        r += p[0];
        g += p[1];
        b += p[2];
        n += 1;
      }
    return n ? { l: l / n, rgb: [r / n, g / n, b / n] } : { l: 0, rgb: [0, 0, 0] };
  };
  /** The fraction of pixels whose luminance differs by more than 40 between two shots of one clip. */
  const diffOf = (a, b) => {
    if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
    let d = 0;
    let n = 0;
    for (let y = 0; y < a.height; y += 2)
      for (let x = 0; x < a.width; x += 2) {
        if (Math.abs(luminance(a.pixel(x, y)) - luminance(b.pixel(x, y))) > 40) d += 1;
        n += 1;
      }
    return n ? d / n : 0;
  };
  /** Two shots of a block's box `ms` apart: their differing fraction (0 for a still canvas). */
  const motionOf = async (id, ms = 600) => {
    const clip = await clipOf(id);
    if (!clip) return null;
    const a = await t.shotPixels(clip);
    await t.sleep(ms);
    const b = await t.shotPixels(clip);
    return diffOf(a, b);
  };
  /** The canvas facts of the stage: one per recipe root, and the page's total. */
  const canvasFacts = () =>
    page.evaluate((stage) => {
      const roots = [...document.querySelectorAll(`${stage} [data-recipe]`)];
      return {
        roots: roots.map((r) => ({
          block:
            r.getAttribute('data-block') ??
            r.closest('[data-block]')?.getAttribute('data-block') ??
            null,
          canvas: r.querySelectorAll('canvas').length,
          img: r.querySelector('img') !== null,
          imgDecoded: (() => {
            const img = r.querySelector('img');
            return img ? img.complete && img.naturalWidth > 0 : false;
          })(),
        })),
        stage: document.querySelectorAll(`${stage} canvas`).length,
        page: document.querySelectorAll('canvas').length,
      };
    }, STAGE);
  /** Selects the shader block and opens Format options at the Shader section; answers the section facts. */
  const openShaderSection = async (id) => {
    await t.clearAll();
    await t.selectObject(id);
    if (!(await t.visible('panel.formatOptions'))) {
      await t.tailControl('toolbar.formatOptions').catch(() => undefined);
      await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
    }
    /* the section's root: FormatOptions' section (data-section) or B5's own root (.ts-shader with
       the section's id, inspector/shader.tsx); a collapsed section head is opened */
    const section = await t.has(SECTION_ROOT);
    if (!section) return { section: false };
    const expanded = await t.attr(
      '[data-section="shader"] > [data-control="formatOptions.shader"]',
      'aria-expanded',
    );
    if (expanded === 'false') {
      await page
        .locator('[data-section="shader"] > [data-control="formatOptions.shader"]')
        .first()
        .click();
      await t.sleep(300);
    }
    await page
      .locator(SECTION_ROOT)
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);
    const title = await page.evaluate(() => {
      const head = document.querySelector('[data-section="shader"] .ts-panel-section-head span');
      if (head) return head.textContent?.trim() ?? null;
      const root = document.querySelector('.ts-shader[data-control="formatOptions.shader"]');
      return root?.getAttribute('aria-label') ?? root?.getAttribute('data-title') ?? null;
    });
    return { section: true, title };
  };
  /**
   * A slider's facts: the range input under the control (or the control itself), its min, max,
   * step and value, its thumb's viewport point, and the number field beside it.
   */
  const sliderOf = (control) =>
    page.evaluate((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      if (!el) return null;
      /* B5's slider: the range is `<control>.slider` beside the number field `<control>` */
      const beside = document.querySelector(`input[type="range"][data-control="${c}.slider"]`);
      const range =
        beside ??
        (el instanceof HTMLInputElement && el.type === 'range'
          ? el
          : el.querySelector('input[type="range"]'));
      const number =
        el instanceof HTMLInputElement && el.type === 'number'
          ? el
          : (el.querySelector('input[type="number"]') ??
            el.parentElement?.querySelector('input[type="number"]') ??
            null);
      if (!range) return { control: c, range: false, number: number !== null };
      const r = range.getBoundingClientRect();
      const min = Number(range.min || 0);
      const max = Number(range.max || 100);
      const value = Number(range.value);
      const frac = max > min ? (value - min) / (max - min) : 0;
      const pad = 8;
      return {
        control: c,
        range: true,
        number: number !== null,
        numberValue: number ? number.value : null,
        min,
        max,
        step: Number(range.step || 1),
        value,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        thumb: { x: r.x + pad + frac * (r.width - 2 * pad), y: r.y + r.height / 2 },
        pad,
        disabled: range.disabled,
      };
    }, control);
  /** The value the range of a control reads now. */
  const sliderValue = async (control) => (await sliderOf(control))?.value ?? null;
  /** Emulates reduced motion so the mount rests (FEATURES.md 5.6), then re selects the block so the mount reads it. */
  const restMount = async (id) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await t.press('Escape');
    await t.sleep(200);
    await t.selectObject(id);
    await t.sleep(700);
    let motion = await motionOf(id, 500);
    if (motion !== null && motion > 0.01) {
      /* a mount that reads the media at mount time alone: leave the slide and come back */
      await t.clickCard(B);
      await t.sleep(300);
      await t.clickCard(S);
      await t.selectObject(id);
      await t.sleep(700);
      motion = await motionOf(id, 500);
    }
    return motion;
  };
  const wakeMount = async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  };
  /** The dialog for Change background: opened on the current slide; answers whether it is drawn. */
  const openBackground = async () => {
    await t.clearAll();
    const r = await t.reachRow('slide', 'slide.changeBackground');
    if (!r.present)
      return {
        open: false,
        why: { ok: false, observed: 'Slide > Change background is not reachable' },
      };
    await t.menuPath('slide', 'slide.changeBackground');
    const shown = await t
      .pollUntil(
        () => t.visible('dialog.background'),
        (x) => x,
        8000,
      )
      .catch(() => false);
    return { open: shown, switched: r.switched };
  };
  const closeBackground = async () => {
    if (await t.visible('dialog.background')) {
      const done = page.locator('[data-control="dialog.background.done"]').first();
      if ((await done.count()) > 0) await done.click().catch(() => undefined);
      else await t.press('Escape');
      await t.waitGone('[data-control="dialog.background"]', 4000);
    }
    await t.clearAll();
  };
  /** The ground of a slide: a covering picture object at the back, or a background shader record. */
  const groundOf = async (slide) => {
    const json = await t.slideJson(slide);
    const objs = await t.objectsOf(slide);
    const covering = objs.find(
      (o) => (o.type === 'picture' || o.type === 'material') && o.pos.w >= 1590 && o.pos.h >= 890,
    );
    return {
      covering: covering
        ? { id: covering.id, type: covering.type, asset: covering.block.asset ?? null }
        : null,
      shader: json?.background?.shader ?? null,
      color: json?.background?.color ?? null,
    };
  };

  // ---------------------------------------------------------------------------------------------
  // the rows

  await t.step(
    'shaders.insert.gallery-thumbnails',
    'Insert > Shader; read the title, the sentence and the cards; search "metal"; a category chip',
    'a grid titled Shader with the black and white sentence; every card decoded within 2 s; the search narrows to one row; a chip narrows; no canvas',
    async () => {
      const o = await openGallery();
      if (!o.open) return o.why;
      const opened = Date.now();
      const words = await page.evaluate(() => {
        const root =
          document.querySelector('[data-control="dialog.shader"]')?.closest('[role="dialog"]') ??
          document.querySelector('[data-control="dialog.shader"]');
        const heading = root?.querySelector('h1, h2, h3, [data-control="dialog.shader.title"]');
        return {
          title: heading?.textContent?.trim() ?? null,
          text: (root?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 600),
        };
      });
      const all = await t
        .pollUntil(cards, (list) => list.length > 0 && list.every((c) => c.thumb), 2000, 100)
        .catch(cards);
      const decodedMs = Date.now() - opened;
      const decoded = all.filter((c) => c.thumb).length;
      const canvases = await dialogCanvases();
      /* the cards a row holds, read from the tops */
      const tops = new Map();
      for (const c of all) tops.set(c.top, (tops.get(c.top) ?? 0) + 1);
      const perRow = Math.max(1, ...tops.values());
      let narrowed = [];
      let searchOn = await t.visible('dialog.shader.search');
      if (searchOn) {
        await t.clickControl('dialog.shader.search');
        await t.press('Meta+a');
        await t.typeHuman('metal');
        narrowed = await t
          .pollUntil(cards, (list) => list.length < all.length, 4000, 100)
          .catch(cards);
        await t.press('Meta+a');
        await t.press('Backspace');
        await t.sleep(400);
      }
      const chips = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="dialog.shader.category."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      let chipped = [];
      const chip =
        chips.find((c) => /\.metal$/i.test(c)) ?? chips.find((c) => !/\.all$/i.test(c)) ?? null;
      if (chip) {
        await t.clickControl(chip);
        chipped = await t
          .pollUntil(cards, (list) => list.length < all.length, 4000, 100)
          .catch(cards);
        /* the chips are radios (build/b1.md R5): the All chip puts the grid back */
        const allChip = chips.find((c) => /\.all$/i.test(c)) ?? null;
        if (allChip) await t.clickControl(allChip).catch(() => undefined);
        await t.sleep(200);
      }
      await closeGallery();
      const liquid = cardFor(narrowed, /liquid metal/i);
      return {
        ok:
          all.length > 0 &&
          /^Shader$/i.test(words.title ?? '') &&
          /black and white/i.test(words.text) &&
          /brand kit/i.test(words.text) &&
          decoded === all.length &&
          decodedMs <= 2000 &&
          canvases === 0 &&
          searchOn &&
          narrowed.length > 0 &&
          narrowed.length <= perRow &&
          liquid !== null &&
          chip !== null &&
          chipped.length > 0 &&
          chipped.length < all.length,
        observed: `title "${words.title ?? 'none'}"; sentence ${/black and white/i.test(words.text) && /brand kit/i.test(words.text) ? 'drawn' : 'missing'}; ${all.length} cards, ${decoded} with a decoded thumbnail ${decodedMs} ms after the open (${perRow} a row); ${canvases} canvas in the dialog; search ${searchOn ? `"metal" narrows to ${narrowed.length} (${narrowed.map((c) => c.title).join(', ') || 'none'})` : 'field absent'}; chips ${chips.length} (${chip ?? 'none'} narrows to ${chipped.length})${o.switched ? '; with the switch on' : ''}`,
      };
    },
  );

  await t.step(
    'shaders.insert.selected-free-rectangle',
    'Insert > Shader; click Liquid metal on the Title slide',
    'a material block in the body free of every text box, selected with the chip Shader and eight handles; the insert converts the layout slide to a canvas as every object insert does (the kind before and after is recorded, never judged)',
    async () => {
      await t.clickCard(S);
      const kindBefore = (await t.slideJson(S))?.kind ?? null;
      const o = await openGallery();
      if (!o.open) return o.why;
      const list = await cards();
      const card = cardFor(list, /liquid metal/i) ?? list[0] ?? null;
      if (!card) {
        await closeGallery();
        return { ok: false, observed: 'no card in the gallery' };
      }
      const obj = await insertCard(S, card);
      if (!obj)
        return {
          ok: false,
          observed: `a click on ${card.title} inserted no shader block within 20 s`,
        };
      t.deck.shaderBlock = obj.id;
      await t.sleep(300);
      const facts = await t.selectionFacts(obj.id);
      const objs = await t.objectsOf(S);
      const texts = objs.filter(
        (x) => x.id !== obj.id && ['heading', 'paragraph', 'text', 'box', 'mark'].includes(x.type),
      );
      const overlaps = (a, b) =>
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      const hit = texts.filter((x) => overlaps(obj.pos, x.pos)).map((x) => `${x.type} ${x.id}`);
      const onSheet =
        obj.pos.x >= 0 &&
        obj.pos.y >= 0 &&
        obj.pos.x + obj.pos.w <= 1600 &&
        obj.pos.y + obj.pos.h <= 900;
      /* the slide's kind is recorded, not judged: an object insert through insertBlockPlan on a
         fixed kind slide converts it to a canvas first (SPEC-2 1.6 `slide.toCanvas`), as a
         table's and a chart's do, and no objects row asserts the kind (the integrator's ship two
         finding 1; the fix round dropped the clause) */
      const kindAfter = (await t.slideJson(S))?.kind ?? null;
      return {
        ok:
          facts.selected &&
          facts.resize === 8 &&
          facts.chip === 'Shader' &&
          hit.length === 0 &&
          onSheet,
        observed: `${card.title} inserted ${obj.id} at ${t.posStr(obj.pos)} (${obj.block.materialId}, preset ${obj.block.preset ?? 'none'}); ${t.describeSelection(facts)}; overlaps ${hit.join(', ') || 'no text box'} of ${texts.length}; kind ${kindBefore} -> ${kindAfter} (recorded)`,
      };
    },
  );

  await t.step(
    'shaders.insert.words',
    'read the Insert row, the chip, the section title and the alt; the sheet, the viewer and the show for a paper: id or "not captured"',
    'every word reads Shader; no id and no "not captured" is drawn',
    async () => {
      const id = t.deck.shaderBlock;
      let block = id ? ((await t.blockOf(S, id))?.block ?? null) : null;
      if (!block) {
        /* the gallery is not on the build: the words are read on a block placed through the window API */
        const placed = await placeShader(S, {
          id: 'shader-words',
          type: 'material',
          materialId: 'paper:liquid-metal',
          preset: 'diamond',
          alt: 'The liquid metal shader',
          pos: { x: 560, y: 480, w: 480, h: 272, z: 1 },
        });
        block = placed?.block ?? null;
        if (placed) t.deck.shaderBlock = placed.id;
      }
      if (!block) return { ok: false, observed: 'no shader block on the slide' };
      const rowLabel = await (async () => {
        try {
          await t.openMenu('insert');
          const rows = await t.menuRows('insert');
          return (
            rows.find((r) => r.id === 'insert.shader')?.label ??
            rows.find((r) => r.id === 'insert.material')?.label ??
            null
          );
        } finally {
          await t.closeMenus().catch(() => undefined);
        }
      })();
      await t.selectObject(block.id);
      const chip = await t.chip();
      const section = await openShaderSection(block.id);
      const sheetText = await page.evaluate(
        (stage) => (document.querySelector(stage)?.textContent ?? '').replace(/\s+/g, ' '),
        STAGE,
      );
      const labels = await t.count(`${STAGE} .material-label`);
      /* the show */
      await t.clearAll();
      await t.clickControl('present.open');
      const showText = await t
        .pollUntil(
          () =>
            page.evaluate(
              () => document.querySelector('[data-control="present.show"]')?.textContent ?? null,
            ),
          (x) => x !== null,
          8000,
        )
        .catch(() => null);
      await t.press('Escape');
      await t.waitGone('[data-control="present.show"]', 8000);
      /* the viewer, in a second page closed after the read */
      let viewerText = null;
      const viewer = await t.newPage();
      try {
        /* the viewer route redirects a fresh page once (the first smoke read net::ERR_ABORTED on
           the hash address): the address is committed, then the sheet is waited for */
        await viewer
          .goto(`${BASE}/deck/${t.deck.id}`, { waitUntil: 'commit' })
          .catch(() => undefined);
        await viewer.waitForLoadState('domcontentloaded').catch(() => undefined);
        await viewer.waitForSelector('.pt-slide', { timeout: 20_000 }).catch(() => undefined);
        await viewer.evaluate((slide) => {
          location.hash = slide;
        }, S);
        await viewer.waitForTimeout(1500);
        viewerText = await viewer.evaluate(
          () => document.body.textContent?.replace(/\s+/g, ' ') ?? '',
        );
      } catch (error) {
        viewerText = `unread: ${String(error).split('\n')[0]}`;
      } finally {
        await viewer.close().catch(() => undefined);
      }
      const bad = /paper:|not captured/i;
      return {
        ok:
          /^Shader$/i.test(rowLabel ?? '') &&
          chip === 'Shader' &&
          section.section &&
          /^Shader$/i.test(section.title ?? '') &&
          /shader/i.test(block.alt ?? '') &&
          !/material/i.test(block.alt ?? '') &&
          !bad.test(sheetText) &&
          labels === 0 &&
          showText !== null &&
          !bad.test(showText) &&
          typeof viewerText === 'string' &&
          !viewerText.startsWith('unread') &&
          !bad.test(viewerText),
        observed: `Insert row "${rowLabel ?? 'none'}"; chip ${chip === null ? 'none' : `"${chip}"`}; section ${section.section ? `"${section.title}"` : 'absent'}; alt "${block.alt}"; sheet ${bad.test(sheetText) ? `draws "${sheetText.match(bad)?.[0]}"` : 'clean'} (${labels} label elements); show ${showText === null ? 'unread' : bad.test(showText) ? 'draws the label' : 'clean'}; viewer ${typeof viewerText === 'string' && viewerText.startsWith('unread') ? viewerText : bad.test(viewerText ?? '') ? 'draws the label' : 'clean'}`,
      };
    },
  );

  await t.step(
    'shaders.panel.slider-live-undo',
    'select the shader; drag Amplitude with the mount at rest (Strength maps to no uniform of liquid metal, build/integrator.md); release; Cmd+Z',
    'the canvas changes during the drag and nothing is written; release writes one block.set; Cmd+Z restores the value and the canvas',
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      const section = await openShaderSection(id);
      if (!section.section)
        return t.notBuilt(
          'formatOptions.shader',
          PANEL_LANE,
          'no Shader section in Format options (FEATURES.md 5.3)',
        );
      /* the thumb's point is read off the range after the control is scrolled into view (the
         control-sentences step's rule): on the panel at 900 px the Amplitude range sits below the
         fold and a drag over the unscrolled point moves over nothing (the verifier's pass 2 F3) */
      const scrollToAmplitude = () =>
        page
          .locator('[data-control="formatOptions.shader.amplitude"]')
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
      await scrollToAmplitude();
      const before = await sliderOf('formatOptions.shader.amplitude');
      if (!before || !before.range)
        return t.notBuilt(
          'formatOptions.shader.amplitude',
          PANEL_LANE,
          `no Amplitude range input in the Shader section (${before ? 'the control has no range' : 'the control is absent'})`,
        );
      try {
        const motion = await restMount(id);
        const s = await openShaderSection(id);
        await scrollToAmplitude();
        await t.sleep(150);
        const slider = (await sliderOf('formatOptions.shader.amplitude')) ?? before;
        const clip = await clipOf(id);
        const rest = await t.shotPixels(clip);
        const rev0 = (await t.state()).revision;
        const to = {
          x: Math.min(
            slider.rect.x + slider.rect.w - slider.pad,
            slider.thumb.x + 0.3 * (slider.rect.w - 2 * slider.pad),
          ),
          y: slider.thumb.y,
        };
        const during = await t.drag(slider.thumb, to, {
          steps: 12,
          during: async () => ({
            revision: (await t.state()).revision,
            value: await sliderValue('formatOptions.shader.amplitude'),
            diff: diffOf(rest, await t.shotPixels(clip)),
          }),
        });
        const rev1 = await t
          .pollUntil(
            async () => (await t.state()).revision,
            (r) => r > rev0,
            6000,
            100,
          )
          .catch(async () => (await t.state()).revision);
        await t.settled();
        const value1 = await sliderValue('formatOptions.shader.amplitude');
        const block1 = (await t.blockOf(S, id))?.block ?? null;
        /* Cmd+Z takes the release's write alone: with nothing written the undo would take the
           insert and leave the panel rows after this one with no block to read */
        const undone = rev1 > rev0;
        if (undone) await t.press('Meta+z');
        await t.settled();
        const value2 = await t
          .pollUntil(
            () => sliderValue('formatOptions.shader.amplitude'),
            (v) => v === slider.value,
            6000,
            100,
          )
          .catch(() => sliderValue('formatOptions.shader.amplitude'));
        await t.sleep(500);
        const after = diffOf(rest, await t.shotPixels(clip));
        return {
          ok:
            motion !== null &&
            motion <= 0.01 &&
            during.diff !== null &&
            during.diff > 0.005 &&
            during.revision === rev0 &&
            rev1 === rev0 + 1 &&
            value1 !== slider.value &&
            value2 === slider.value &&
            after !== null &&
            after <= 0.01,
          observed: `mount at rest ${motion === null ? 'unread' : `${(motion * 100).toFixed(2)} percent moving`}; during the drag the value read ${during.value} with ${during.diff === null ? 'no' : `${(during.diff * 100).toFixed(1)} percent of`} pixels changed and revision ${during.revision} (${rev0} before); release: revision ${rev1}, value ${slider.value} -> ${value1}${block1 ? ` (block controls ${JSON.stringify(block1.controls ?? null)})` : ''}; ${undone ? 'Cmd+Z' : 'no Cmd+Z (nothing was written)'}: value ${value2}, ${after === null ? 'canvas unread' : `${(after * 100).toFixed(2)} percent of pixels differ from rest`}${s.section ? '' : '; the section closed'}`,
        };
      } finally {
        await wakeMount();
      }
    },
  );

  await t.step(
    'shaders.panel.preset-tiles',
    "read the Preset row's tiles; click a tile that is not pressed",
    'every preset of the entry as a tile in sentence case; the click writes /preset and the canvas changes within 500 ms',
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      const section = await openShaderSection(id);
      if (!section.section)
        return t.notBuilt(
          'formatOptions.shader',
          PANEL_LANE,
          'no Shader section in Format options (FEATURES.md 5.3)',
        );
      const tiles = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="formatOptions.shader.preset."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => ({
            id: e.getAttribute('data-control'),
            label: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim(),
            pressed:
              e.getAttribute('aria-pressed') === 'true' ||
              e.getAttribute('aria-checked') === 'true' ||
              e.classList.contains('is-on'),
          })),
      );
      if (tiles.length === 0)
        return t.notBuilt(
          'formatOptions.shader.preset',
          PANEL_LANE,
          'no preset tiles in the Shader section (FEATURES.md 5.2)',
        );
      const block0 = (await t.blockOf(S, id))?.block ?? null;
      let entryPresets = null;
      try {
        const list = await t.invoke('material.list', { materialId: block0?.materialId }, 20_000);
        const entry = (Array.isArray(list) ? list : []).find((e) => e.id === block0?.materialId);
        entryPresets = entry ? entry.presets.map((p) => p.name) : null;
      } catch {
        entryPresets = null;
      }
      const sentence = (label) =>
        /^[A-Z][a-z0-9]/.test(label) && !/[a-z]-[a-z]/.test(label) && label !== label.toUpperCase();
      const badLabels = tiles.filter((x) => !sentence(x.label)).map((x) => x.label);
      /* the tile clicked is one whose look differs from the pressed one by more than the row's
         threshold: the entry's own Chrome first, then any tile that is not one of the two black
         and white kit presets (Paper on ink and Ink on paper share the pressed Diamond's geometry
         and move the canvas under the threshold, the verifier's pass 2 F4), then any unpressed */
      const bw = /^(paper on ink|ink on paper)$/i;
      const target =
        tiles.find((x) => !x.pressed && /^chrome$/i.test(x.label)) ??
        tiles.find((x) => !x.pressed && !bw.test(x.label)) ??
        tiles.find((x) => !x.pressed) ??
        null;
      let ms = null;
      let preset1 = null;
      let change = null;
      let rev = null;
      if (target) {
        const clip = await clipOf(id);
        const before = await t.shotPixels(clip);
        const rev0 = (await t.state()).revision;
        const t0 = Date.now();
        await t.clickControl(target.id);
        const read = async () => {
          const shot = await t.shotPixels(clip);
          return { diff: diffOf(before, shot), lum: Math.abs(meanOf(before).l - meanOf(shot).l) };
        };
        change = await t
          .pollUntil(read, (x) => x.lum > 20 || (x.diff !== null && x.diff > 0.3), 500, 60)
          .catch(read);
        ms = Date.now() - t0;
        rev = await t
          .pollUntil(
            async () => (await t.state()).revision,
            (r) => r > rev0,
            6000,
            100,
          )
          .catch(() => rev0);
        await t.settled();
        preset1 = (await t.blockOf(S, id))?.block?.preset ?? null;
      }
      return {
        ok:
          badLabels.length === 0 &&
          (entryPresets === null || tiles.length === entryPresets.length) &&
          target !== null &&
          preset1 !== null &&
          preset1 !== block0?.preset &&
          change !== null &&
          (change.lum > 20 || change.diff > 0.3) &&
          ms !== null &&
          ms <= 500,
        observed: `${tiles.length} tiles (${tiles.map((x) => `"${x.label}"${x.pressed ? ' pressed' : ''}`).join(', ')}) against ${entryPresets === null ? 'an unread preset list' : `${entryPresets.length} presets of ${block0?.materialId}`}; labels not in sentence case: ${badLabels.join(', ') || 'none'}; ${target ? `click on ${target.id}: preset ${block0?.preset ?? 'none'} -> ${preset1 ?? 'unchanged'} (revision ${rev}), canvas ${change ? `mean luminance moved ${change.lum.toFixed(1)}, ${change.diff === null ? 'diff unread' : `${(change.diff * 100).toFixed(0)} percent of pixels changed`}` : 'unread'} after ${ms} ms` : 'no unpressed tile to click'}`,
      };
    },
  );

  await t.step(
    'shaders.panel.control-sentences',
    'hover each slider of the Shader section and read its tooltip',
    'the ten sentences of FEATURES.md 5.3, one per control',
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      const section = await openShaderSection(id);
      if (!section.section)
        return t.notBuilt(
          'formatOptions.shader',
          PANEL_LANE,
          'no Shader section in Format options (FEATURES.md 5.3)',
        );
      const facts = [];
      let present = 0;
      let matched = 0;
      for (const [control, sentence] of Object.entries(SENTENCES)) {
        const id2 = `formatOptions.shader.${control}`;
        if (!(await t.visible(id2))) {
          facts.push(`${control}: absent`);
          continue;
        }
        present += 1;
        await page
          .locator(`[data-control="${id2}"]`)
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
        /* the sentence rides on the range (`<control>.slider`, inspector/shader.tsx); the number
           field beside it names the value */
        const target = (await t.visible(`${id2}.slider`)) ? `${id2}.slider` : id2;
        let tip = await t.hoverControl(target, 700);
        if (tip === null)
          tip = await page.evaluate((c) => {
            const el =
              document.querySelector(`[data-control="${c}.slider"]`) ??
              document.querySelector(`[data-control="${c}"]`);
            const owner = el?.closest('[data-tip]') ?? el?.querySelector('[data-tip]') ?? el;
            return (
              owner?.getAttribute('data-tip') ??
              owner?.getAttribute('aria-label') ??
              owner?.getAttribute('title') ??
              null
            );
          }, id2);
        const ok = tip !== null && tip.toLowerCase().includes(sentence.toLowerCase());
        if (ok) matched += 1;
        facts.push(
          `${control}: ${ok ? 'the sentence' : `"${(tip ?? 'no tooltip').slice(0, 80)}"`}`,
        );
      }
      await page.mouse.move(720, 500).catch(() => undefined);
      if (present === 0)
        return t.notBuilt(
          'formatOptions.shader.strength',
          PANEL_LANE,
          'none of the eleven controls is drawn (FEATURES.md 5.3)',
        );
      return {
        ok: present === Object.keys(SENTENCES).length && matched === present,
        observed: `${present} of ${Object.keys(SENTENCES).length} controls drawn, ${matched} with the sentence; ${facts.join('; ')}`,
      };
    },
  );

  await t.step(
    'shaders.panel.kit-colours',
    "read the Colors row's swatches; brand.set /colors/<appearance>/primary '#0b3d91'; read the shader and its frame",
    "six kit swatches; the shader's colours change and its frame is re captured within 5 s with a new frameKey",
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      const section = await openShaderSection(id);
      if (!section.section)
        return t.notBuilt(
          'formatOptions.shader',
          PANEL_LANE,
          'no Shader section in Format options (FEATURES.md 5.3)',
        );
      const swatches = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="formatOptions.shader.color."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) =>
            (e.getAttribute('data-control') ?? '').replace('formatOptions.shader.color.', ''),
          ),
      );
      if (swatches.length === 0)
        return t.notBuilt(
          'formatOptions.shader.color',
          PANEL_LANE,
          'no kit swatches in the Colors group (FEATURES.md 5.7)',
        );
      const roles = KIT_ROLES.filter((role) =>
        swatches.some((s) => s === role || s.startsWith(`${role}.`)),
      );
      const actions = await t.windowActions();
      if (!actions.has('brand.set'))
        return t.notBuilt(
          'brand.set',
          'B5a (the product round)',
          'the window transport carries no brand.set',
        );
      /* the appearance the sheet renders is the palette's (FEATURES.md 5.7: the mount's palette is
         shaderPaletteOfDeck, which reads deckAppearance(deck), the same value EditorRoot passes the
         editor root as data-theme), not the chrome's theme and not deck.info's default: a /new
         deck draws light under a dark chrome and its shader takes the light roles (the verifier's
         pass 1 F4; the runs of record wrote the dark role and the shader kept its colour) */
      const rendered = await page.evaluate(
        () => document.querySelector('.ts-stagewrap.ts-editor')?.getAttribute('data-theme') ?? null,
      );
      const fallback = (await t.appearance()).deck ?? 'dark';
      const appearance =
        rendered === 'light' || rendered === 'dark'
          ? rendered
          : fallback === 'light'
            ? 'light'
            : 'dark';
      const path = `/colors/${appearance}/primary`;
      /* the shader is put on the kit's Primary role first (a click on the Colors row's Primary
         swatch, the write a seller makes before the kit's colour matters to the block): a block
         left on a fixed preset by the preset step (Chrome, or a black and white kit preset) takes
         no kit colour, so a brand write would re key its frame and move no pixel (the verifier's
         pass 2 F.5 F5 and the run of record's 2.5); the click and its revision are recorded */
      let primaryClick = 'no Primary swatch';
      if (roles.includes('primary') && (await t.visible('formatOptions.shader.color.primary'))) {
        const revP = (await t.state()).revision;
        await page
          .locator('[data-control="formatOptions.shader.color.primary"]')
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
        await t.clickControl('formatOptions.shader.color.primary');
        const revQ = await t
          .pollUntil(
            async () => (await t.state()).revision,
            (r) => r > revP,
            6000,
            100,
          )
          .catch(async () => (await t.state()).revision);
        await t.settled();
        await t.sleep(600);
        primaryClick = `the Primary swatch clicked (revision ${revP} -> ${revQ})`;
      }
      const block0 = (await t.blockOf(S, id))?.block ?? null;
      const asset0 = await assetOf(block0?.asset);
      const key0 = asset0?.source?.frameKey ?? null;
      const clip = await clipOf(id);
      const before = meanOf(await t.shotPixels(clip));
      const s = await t.settled();
      const t0 = Date.now();
      let refusal = null;
      try {
        await t.invoke('brand.set', { path, value: '#0b3d91', baseRevision: s.revision }, 30_000);
      } catch (error) {
        refusal = String(error instanceof Error ? error.message : error).split('\n')[0];
      }
      await t.settled();
      const recaptured = await t
        .pollUntil(
          async () => {
            const b = (await t.blockOf(S, id))?.block ?? null;
            const a = await assetOf(b?.asset);
            return {
              asset: b?.asset ?? null,
              key: a?.source?.frameKey ?? null,
              backend: a?.source?.backend ?? null,
            };
          },
          (x) => x.key !== null && x.key !== key0,
          5000,
          200,
        )
        .catch(async () => {
          const b = (await t.blockOf(S, id))?.block ?? null;
          const a = await assetOf(b?.asset);
          return {
            asset: b?.asset ?? null,
            key: a?.source?.frameKey ?? null,
            backend: a?.source?.backend ?? null,
          };
        });
      const ms = Date.now() - t0;
      /* the colour is read once the new frame's picture is decoded on the sheet (the sheet draws
         the frame over the mount once the block has one; on a hosted instance a 3200 px picture
         comes through the assets route's redirect), up to 8 s after the re capture, so the read
         is of the re coloured shader and not of a picture still loading; the row's 5 s bound is
         the re capture's and the picture's time is recorded */
      const t1 = Date.now();
      const drawn =
        recaptured.asset && recaptured.asset !== (block0?.asset ?? null)
          ? await t
              .pollUntil(
                () =>
                  page.evaluate(
                    ([stage, blockId, asset]) => {
                      const img = document.querySelector(`${stage} [data-block="${blockId}"] img`);
                      return (
                        img !== null &&
                        (img.currentSrc || img.getAttribute('src') || '').includes(asset) &&
                        img.complete &&
                        img.naturalWidth > 0
                      );
                    },
                    [STAGE, id, recaptured.asset],
                  ),
                (x) => x === true,
                8000,
                250,
              )
              .catch(() => false)
          : false;
      const pictureMs = Date.now() - t1;
      await t.sleep(400);
      const after = meanOf(await t.shotPixels(clip));
      const dist = Math.hypot(...before.rgb.map((v, i) => v - after.rgb[i]));
      return {
        ok:
          roles.length === 6 &&
          refusal === null &&
          dist > 20 &&
          recaptured.key !== null &&
          recaptured.key !== key0 &&
          ms <= 5000,
        observed: `${primaryClick}; swatches ${swatches.join(', ')} (${roles.length} of the six roles); the sheet renders ${rendered ?? 'no data-theme'} (deck.info and the chrome read ${fallback}); brand.set ${path} ${refusal ? `refused: ${refusal}` : 'ok'}; frame ${block0?.asset ?? 'none'} (key ${key0 ? key0.slice(0, 12) : 'none'}) -> ${recaptured.asset ?? 'none'} (key ${recaptured.key ? recaptured.key.slice(0, 12) : 'none'}, backend ${recaptured.backend ?? 'none'}) ${ms} ms after the write; the new picture ${drawn ? `decoded ${pictureMs} ms later` : `not decoded ${pictureMs} ms later`}; the block's mean colour moved ${dist.toFixed(1)}`,
      };
    },
  );

  await t.step(
    'shaders.background.place-answers',
    'Slide > Change background on the body slide; Shader; a tile; Place; read the ground, the button and the dialog',
    'the ground changes within 5 s, or one sentence names the failure and no log text is shown; Place reads Placing with the seconds while it waits',
    async () => {
      await t.clickCard(B);
      let o = await openBackground();
      if (!o.open) return o.why;
      let shaderRow = await t.visible('dialog.background.shader');
      let materialRow = await t.visible('dialog.background.material.choose');
      let switched = false;
      if (!shaderRow && !materialRow) {
        /* the Shader row is a parked dialog control since the features round's ship two
           (ship-f0279e1.json, this row's own park through parked-controls.ts): a parked row is
           driven with the switch on (docs/FOCUS.md 3.1, the toolkit's reachRow rule), and the
           area's end turns the switch off again */
        await closeBackground();
        switched = await t.setAdvanced(true);
        if (switched) t.deck.advanced = true;
        await t.clickCard(B);
        o = await openBackground();
        if (!o.open) return o.why;
        shaderRow = await t.visible('dialog.background.shader');
        materialRow = await t.visible('dialog.background.material.choose');
      }
      if (!shaderRow && !materialRow) {
        await closeBackground();
        return t.notBuilt(
          'dialog.background.shader',
          BACKGROUND_LANE,
          `no Shader row and no Material row in the Background dialog (FEATURES.md 5.4)${switched ? ', with Tools > Advanced tools on' : ''}`,
        );
      }
      const path = shaderRow ? 'shader' : 'material';
      const ground0 = await groundOf(B);
      let chosen = null;
      if (shaderRow) {
        /* Choose opens the gallery's grid inside the dialog with the same dialog.shader.* ids
           (build/b1.md R5); a card picks the shader and Place places it */
        await t.clickControl('dialog.background.shader');
        const list = await t.pollUntil(cards, (x) => x.length > 0, 8000, 100).catch(cards);
        const card = cardFor(list, /liquid metal/i) ?? list[0] ?? null;
        if (card) {
          chosen = card.title;
          await t.clickControl(card.id);
          await t.sleep(300);
          if (await t.visible('dialog.shader'))
            await t.waitGone('[data-control="dialog.shader"]', 8000).catch(() => undefined);
        }
      } else {
        await t.clickControl('dialog.background.material.choose');
        const rows = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="dialog.background.material."]')]
            .filter((e) => e.getClientRects().length > 0 && e.matches('[role="option"], button'))
            .map((e) => ({
              id: e.getAttribute('data-control'),
              label: e.textContent?.trim() ?? '',
            }))
            .filter((r) => !/\.(choose|place|dither|current)$/.test(r.id)),
        );
        const row = rows.find((r) => /liquid metal/i.test(r.label)) ?? rows[0] ?? null;
        if (row) {
          chosen = row.label;
          await t.clickControl(row.id);
        }
      }
      await t.sleep(300);
      const placeId = shaderRow
        ? (await t.visible('dialog.background.shader.place'))
          ? 'dialog.background.shader.place'
          : null
        : (await t.visible('dialog.background.material.place'))
          ? 'dialog.background.material.place'
          : null;
      const t0 = Date.now();
      if (placeId) await t.clickControl(placeId);
      const button = () => (placeId ? t.textOf(placeId) : Promise.resolve(null));
      const alertText = () =>
        page.evaluate(() => {
          const root = document
            .querySelector('[data-control="dialog.background"]')
            ?.closest('[role="dialog"]');
          const alert = root?.querySelector(
            '[role="alert"], .ts-dialog-error, [data-control="dialog.background.error"]',
          );
          return alert ? (alert.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
        });
      let placingSeen = null;
      let secondsSeen = false;
      const read = async () => {
        const text = await button();
        if (text && /placing/i.test(text)) {
          placingSeen = text;
          if (/\d/.test(text)) secondsSeen = true;
        }
        return { ground: await groundOf(B), alert: await alertText(), button: text };
      };
      const outcome = await t
        .pollUntil(
          read,
          (x) =>
            (x.ground.covering !== null && x.ground.covering.id !== ground0.covering?.id) ||
            (x.ground.shader !== null &&
              JSON.stringify(x.ground.shader) !== JSON.stringify(ground0.shader)) ||
            x.alert !== null,
          65_000,
          150,
        )
        .catch(read);
      const ms = Date.now() - t0;
      const placed =
        (outcome.ground.covering !== null && outcome.ground.covering.id !== ground0.covering?.id) ||
        (outcome.ground.shader !== null &&
          JSON.stringify(outcome.ground.shader) !== JSON.stringify(ground0.shader));
      const sentence = outcome.alert;
      const logText = sentence
        ? /Browser logs|<launching>|--disable|\bat\s+\S+:\d+|Error:|browserContext/i.test(sentence)
        : false;
      const oneSentence = sentence
        ? sentence.length <= 200 && (sentence.match(/[.!?](\s|$)/g) ?? []).length <= 2 && !logText
        : false;
      await closeBackground();
      t.deck.shaderGround = placed ? outcome.ground : null;
      return {
        ok:
          chosen !== null &&
          ((placed && ms <= 5000) || (!placed && oneSentence)) &&
          (ms <= 1500 || placingSeen !== null),
        observed: `${path === 'material' ? 'the dialog still reads Material (FEATURES.md 5.4, B1); ' : ''}chose ${chosen ?? 'nothing'}; Place ${placeId ?? 'absent (the tile placed)'}; ${placed ? `the ground changed after ${ms} ms (${outcome.ground.covering ? `covering ${outcome.ground.covering.type} ${outcome.ground.covering.id}, asset ${outcome.ground.covering.asset ?? 'none'}` : `background shader ${JSON.stringify(outcome.ground.shader).slice(0, 80)}`})` : sentence ? `no ground after ${ms} ms; the dialog reads "${sentence.slice(0, 200)}"${logText ? ' (log text)' : ''}` : `no ground and no sentence after ${ms} ms`}; the button read ${placingSeen ? `"${placingSeen}"${secondsSeen ? ' with the seconds' : ' without a number'}` : 'never Placing'}`,
      };
    },
  );

  await t.step(
    'shaders.panel.one-home',
    "Tools > Advanced tools; Tools > Pictures and materials with the shader selected; the Background dialog's options link",
    'the panel has no Material section; the link opens Format options at the Shader section',
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      await t.clickCard(S);
      await t.selectObject(id);
      const r = await t.reachRow('tools', 'tools.advanced', 'tools.advanced.picturesMaterials');
      let sections = null;
      if (r.present) {
        await t.menuPath('tools', 'tools.advanced', 'tools.advanced.picturesMaterials');
        await t.waitControl('panel.picturesMaterials', 8000).catch(() => undefined);
        sections = await page.evaluate(() => {
          const root = document.querySelector('[data-control="panel.picturesMaterials"]');
          if (!root) return null;
          return [...root.querySelectorAll('h2, h3, h4, .ts-panel-section-head, [data-section]')]
            .map((e) => (e.getAttribute('data-section') ?? e.textContent ?? '').trim())
            .filter(Boolean);
        });
        if (await t.visible('panel.picturesMaterials.close'))
          await t.clickControl('panel.picturesMaterials.close');
        else await t.press('Escape');
        await t.sleep(200);
      }
      /* the Background dialog's link, on the slide whose ground the place row set */
      await t.clickCard(B);
      const o = await openBackground();
      let link = null;
      let opened = null;
      if (o.open) {
        link = (await t.visible('dialog.background.shader.options'))
          ? 'dialog.background.shader.options'
          : (await t.visible('dialog.background.materialOptions'))
            ? 'dialog.background.materialOptions'
            : null;
        if (link) {
          await t.clickControl(link);
          opened = await t
            .pollUntil(
              async () => ({
                panel: await t.visible('panel.formatOptions'),
                section: await page.evaluate(() => {
                  const s = document.querySelector('[data-section="shader"]');
                  return s
                    ? {
                        open: !s.classList.contains('is-closed'),
                        visible: s.getClientRects().length > 0,
                      }
                    : null;
                }),
                pictures: await t.visible('panel.picturesMaterials'),
                dialog: await t.visible('dialog.background'),
              }),
              (x) => (x.panel && x.section?.open) || x.pictures,
              8000,
            )
            .catch(() => null);
        }
        await closeBackground();
      }
      await t.clearAll();
      const noMaterial = sections !== null && !sections.some((s) => /^material$/i.test(s));
      return {
        ok:
          r.present &&
          noMaterial &&
          link !== null &&
          opened !== null &&
          opened.panel &&
          opened.section?.open === true &&
          !opened.pictures,
        observed: `Pictures and materials ${r.present ? `sections ${sections ? sections.join(', ') || 'none' : 'unread'}` : 'not reachable'}${r.switched ? ' (with the switch on)' : ''}; the Background dialog's link ${link ?? `absent (ground ${t.deck.shaderGround ? 'placed' : 'not placed by the place row'})`}${opened ? `: Format options ${opened.panel}, Shader section ${opened.section ? `${opened.section.open ? 'open' : 'closed'}` : 'absent'}, Pictures and materials ${opened.pictures}, dialog ${opened.dialog}` : ''}`,
      };
    },
  );

  await t.step(
    'shaders.perf.one-context',
    'a second shader block placed through the window API; select each in turn and count the canvases',
    'one canvas on the page; the selection swaps the mount within 500 ms; the first draws its frame',
    async () => {
      const first = t.deck.shaderBlock;
      if (!first) return { ok: false, observed: 'no shader block on the slide' };
      await t.clickCard(S);
      await t.clearAll();
      const box = (await t.blockOf(S, first))?.pos ?? { x: 560, y: 480, w: 480, h: 272 };
      const x = box.x + box.w + 40 <= 1600 - 320 ? box.x + box.w + 40 : Math.max(0, box.x - 360);
      const second = await placeShader(S, {
        id: 'shader-two',
        type: 'material',
        materialId: 'paper:gem-smoke',
        preset: 'fire',
        alt: 'The gem smoke shader',
        pos: { x, y: box.y, w: 320, h: 180, z: (box.z ?? 1) + 1 },
      });
      if (!second) return { ok: false, observed: 'the second shader block did not land' };
      await t.sleep(1200);
      const idle = await canvasFacts();
      await t.selectObject(first);
      await t.sleep(600);
      const onFirst = await canvasFacts();
      const t0 = Date.now();
      await t.selectObject(second.id);
      const swapped = await t
        .pollUntil(
          canvasFacts,
          (f) =>
            f.roots.some((r) => r.block === second.id && r.canvas > 0) &&
            f.roots.every((r) => r.block === second.id || r.canvas === 0),
          2000,
          50,
        )
        .catch(canvasFacts);
      const ms = Date.now() - t0;
      const firstRoot = swapped.roots.find((r) => r.block === first) ?? null;
      const secondRoot = swapped.roots.find((r) => r.block === second.id) ?? null;
      await t.clearAll();
      return {
        ok:
          onFirst.stage === 1 &&
          onFirst.page <= 1 &&
          swapped.stage === 1 &&
          secondRoot?.canvas === 1 &&
          firstRoot?.canvas === 0 &&
          firstRoot?.imgDecoded === true &&
          ms <= 500,
        observed: `with nothing selected ${idle.stage} canvas on the stage (${idle.page} on the page); first selected: ${onFirst.stage} on the stage, ${onFirst.page} on the page; second selected: ${swapped.stage} on the stage after ${ms} ms, the second's root ${secondRoot ? `${secondRoot.canvas} canvas` : 'absent'}, the first's root ${firstRoot ? `${firstRoot.canvas} canvas, frame img ${firstRoot.img ? (firstRoot.imgDecoded ? 'decoded' : 'not decoded') : 'none'}` : 'absent'}`,
      };
    },
  );

  // ---------------------------------------------------------------------------------------------
  // the P1 rows (FEATURES.md 5.2, 5.6; each lands only under the P1 condition of section 1)

  await t.step(
    'shaders.background.add-to-theme',
    'Change background > Shader; Add to theme; New slide with the Section header layout',
    "the kit's background shader is written; the new slide shows it as the ground with no selectable picture object",
    async () => {
      await t.clickCard(B);
      const o = await openBackground();
      if (!o.open) return o.why;
      if (!(await t.visible('dialog.background.shader'))) {
        await closeBackground();
        return t.notBuilt(
          'dialog.background.shader',
          BACKGROUND_LANE,
          'no Shader row in the Background dialog (FEATURES.md 5.4)',
        );
      }
      if (!(await t.visible('dialog.background.shader.addToTheme'))) {
        await closeBackground();
        return t.notBuilt(
          'dialog.background.shader.addToTheme',
          BACKGROUND_LANE,
          'no Add to theme row beside the Shader row (P1, FEATURES.md 5.2 item 1)',
        );
      }
      await t.clickControl('dialog.background.shader.addToTheme');
      await t.settled();
      const kit = await t.invoke('brand.get', {}).catch(() => null);
      const background = kit?.background?.shader ?? kit?.brand?.background?.shader ?? null;
      await closeBackground();
      const before = await t.slideOrder();
      const sectionRow = await t.reachRow('slide', 'slide.new');
      let made = null;
      if (sectionRow.present) {
        const s = await t.state();
        await t
          .invoke('slide.new', {
            baseRevision: s.revision,
            after: B,
            layout: 'section-description',
          })
          .catch(() => undefined);
        const order = await t
          .pollUntil(t.slideOrder, (o2) => o2.length === before.length + 1, 15_000)
          .catch(t.slideOrder);
        made = order.find((x) => !before.includes(x)) ?? null;
      }
      let ground = null;
      if (made) {
        await t.clickCard(made);
        await t.sleep(800);
        ground = await page.evaluate((stage) => {
          const sheet = document.querySelector(stage);
          const recipeRoots = sheet ? [...sheet.querySelectorAll('[data-recipe]')] : [];
          return {
            roots: recipeRoots.length,
            groundRoots: recipeRoots.filter((r) => r.closest('[data-block]') === null).length,
          };
        }, STAGE);
        const objs = await t.objectsOf(made);
        ground.covering = objs.filter((x) => x.type === 'picture' && x.pos.w >= 1590).length;
      }
      return {
        ok:
          background !== null &&
          made !== null &&
          ground !== null &&
          ground.groundRoots > 0 &&
          ground.covering === 0,
        observed: `brand.get background.shader ${background ? JSON.stringify(background).slice(0, 80) : 'none'}; new slide ${made ?? 'not made'}${ground ? `: ${ground.roots} recipe roots, ${ground.groundRoots} as the ground, ${ground.covering} covering picture objects` : ''}`,
      };
    },
  );

  await t.step(
    'shaders.frame.scrubber-capture',
    'drag the Frame scrubber; Capture this frame',
    'the live canvas moves with the scrubber; the capture writes /anchor and a new asset within 5 s',
    async () => {
      const id = t.deck.shaderBlock;
      if (!id) return { ok: false, observed: 'no shader block on the slide' };
      await t.clickCard(S);
      const section = await openShaderSection(id);
      if (!section.section)
        return t.notBuilt(
          'formatOptions.shader',
          PANEL_LANE,
          'no Shader section in Format options (FEATURES.md 5.3)',
        );
      const scrubber = await sliderOf('formatOptions.shader.frame.scrubber');
      if (!scrubber || !scrubber.range)
        return t.notBuilt(
          'formatOptions.shader.frame.scrubber',
          PANEL_LANE,
          'no Frame scrubber in the Shader section (P1, FEATURES.md 5.2 item 3)',
        );
      const block0 = (await t.blockOf(S, id))?.block ?? null;
      try {
        await restMount(id);
        await openShaderSection(id);
        const s2 = (await sliderOf('formatOptions.shader.frame.scrubber')) ?? scrubber;
        const clip = await clipOf(id);
        const before = await t.shotPixels(clip);
        const to = {
          x: Math.min(s2.rect.x + s2.rect.w - s2.pad, s2.thumb.x + 0.35 * (s2.rect.w - 2 * s2.pad)),
          y: s2.thumb.y,
        };
        const during = await t.drag(s2.thumb, to, {
          steps: 10,
          during: async () => diffOf(before, await t.shotPixels(clip)),
        });
        const capture = await t.visible('formatOptions.shader.frame.capture');
        let anchor1 = null;
        let asset1 = null;
        let ms = null;
        if (capture) {
          const t0 = Date.now();
          await t.clickControl('formatOptions.shader.frame.capture');
          const got = await t
            .pollUntil(
              async () => (await t.blockOf(S, id))?.block ?? null,
              (b) => b !== null && b.asset !== undefined && b.asset !== block0?.asset,
              5000,
              200,
            )
            .catch(async () => (await t.blockOf(S, id))?.block ?? null);
          ms = Date.now() - t0;
          anchor1 = got?.anchor ?? null;
          asset1 = got?.asset ?? null;
        }
        return {
          ok:
            during !== null &&
            during > 0.005 &&
            capture &&
            anchor1 !== null &&
            anchor1 !== (block0?.anchor ?? null) &&
            asset1 !== null &&
            asset1 !== (block0?.asset ?? null) &&
            ms !== null &&
            ms <= 5000,
          observed: `the drag changed ${during === null ? 'an unread fraction of' : `${(during * 100).toFixed(1)} percent of`} the canvas; Capture this frame ${capture ? `wrote anchor ${block0?.anchor ?? 'none'} -> ${anchor1 ?? 'unchanged'} and asset ${block0?.asset ?? 'none'} -> ${asset1 ?? 'unchanged'} after ${ms} ms` : 'absent'}`,
        };
      } finally {
        await wakeMount();
      }
    },
  );

  await t.step(
    'shaders.view.play-setting',
    'View > Play shaders; read the three rows; pick Off; reload; the show Options menu; the default back',
    'On, In the show only and Off with In the show only checked by default; the pick is stored and describe reads it; the Options menu mirrors it',
    async () => {
      const r = await t.reachRow('view', 'view.playShaders');
      if (!r.present)
        return t.notBuilt(
          'view.playShaders',
          MENU_LANE,
          'no Play shaders row in the View menu (P1, FEATURES.md 5.6)',
        );
      await t.clearAll();
      await t.openMenu('view');
      await t
        .hoverRow('view.playShaders', '[data-control^="menu.view.playShaders."]')
        .catch(() => undefined);
      await t.sleep(300);
      const rows = (await t.menuRows('view')).filter((x) => x.id.startsWith('view.playShaders.'));
      await t.closeMenus();
      const labels = rows.map((x) => x.label.replace(/\s+/g, ' ').trim());
      const checked = rows.filter((x) => x.checked === 'true').map((x) => x.label.trim());
      const setting = async () => (await t.state()).settings?.playShaders ?? null;
      const default1 = await setting();
      const offRow = rows.find((x) => /^off$/i.test(x.label.trim())) ?? null;
      let afterOff = null;
      let afterReload = null;
      if (offRow) {
        await t.menuPath('view', 'view.playShaders', offRow.id);
        afterOff = await t.pollUntil(setting, (v) => v !== default1, 5000).catch(setting);
        await t.reloadTo(page.url());
        await t.settled();
        afterReload = await setting();
      }
      /* the show's Options menu */
      await t.clearAll();
      await t.clickControl('present.open');
      await t.waitControl('present.show', 10_000).catch(() => undefined);
      await t.sleep(500);
      let optionRow = null;
      if (await t.visible('present.options')) {
        await page.mouse.move(720, 880).catch(() => undefined);
        await t.sleep(300);
        await t.clickControl('present.options');
        await t.sleep(400);
        optionRow = await page.evaluate(
          () =>
            /* Menu.tsx draws a row as data-control="menu.<id>" with data-menu-item="<id>" (build/b1.md
               R5), so the show's rows read by their menu item id */
            [
              ...document.querySelectorAll(
                '[data-menu-item^="present.options."], [data-control^="present.options."]',
              ),
            ]
              .filter(
                (e) => e.getClientRects().length > 0 && /play shaders/i.test(e.textContent ?? ''),
              )
              .map((e) => ({
                id: e.getAttribute('data-menu-item') ?? e.getAttribute('data-control'),
                text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
              }))[0] ?? null,
        );
        await t.press('Escape');
        await t.sleep(200);
      }
      await t.press('Escape');
      await t.waitGone('[data-control="present.show"]', 8000);
      /* the default back */
      const showRow = rows.find((x) => /in the show only/i.test(x.label)) ?? null;
      if (showRow) await t.menuPath('view', 'view.playShaders', showRow.id).catch(() => undefined);
      const restored = await setting();
      return {
        ok:
          labels.length === 3 &&
          /^on$/i.test(labels[0] ?? '') &&
          /^in the show only$/i.test(labels[1] ?? '') &&
          /^off$/i.test(labels[2] ?? '') &&
          checked.length === 1 &&
          /in the show only/i.test(checked[0] ?? '') &&
          default1 !== null &&
          afterOff !== null &&
          afterOff !== default1 &&
          afterReload === afterOff &&
          optionRow !== null &&
          restored === default1,
        observed: `rows ${labels.join(', ') || 'none'} (checked ${checked.join(', ') || 'none'}); describe().state.settings.playShaders ${JSON.stringify(default1)} -> Off ${JSON.stringify(afterOff)} -> after a reload ${JSON.stringify(afterReload)}; the show's Options menu ${optionRow ? `lists ${optionRow.id} "${optionRow.text}"` : 'lists no Play shaders row'}; the default back ${JSON.stringify(restored)}${r.switched ? '; with the switch on' : ''}`,
      };
    },
  );

  await t.step(
    'shaders.insert.gallery-hover-live',
    'Insert > Shader; hover a card 400 ms; move to another; leave',
    'one canvas mounts after the hover, never two at once, and leaving disposes it',
    async () => {
      const o = await openGallery();
      if (!o.open) return o.why;
      /* the P1 surface (build/b1.md R5): the mount's host dialog.shader.hover exists only while a
         card is hovered, so it is read after the first hover and a build without it reads not built */
      const list = await cards();
      if (list.length < 2) {
        await closeGallery();
        return { ok: false, observed: `${list.length} cards; two are needed` };
      }
      const centre = (c) => page.locator(`[data-control="${c.id}"]`).first().boundingBox();
      const a = await centre(list[0]);
      const b = await centre(list[1]);
      await t.moveHuman(
        { x: a.x - 40, y: a.y + a.height / 2 },
        { x: a.x + a.width / 2, y: a.y + a.height / 2 },
        6,
      );
      const mounted = await t
        .pollUntil(dialogCanvases, (n) => n >= 1, 1500, 50)
        .catch(dialogCanvases);
      await t.sleep(400);
      const held = await dialogCanvases();
      const host = await t.visible('dialog.shader.hover');
      if (mounted === 0 && held === 0 && !host) {
        await closeGallery();
        return t.notBuilt(
          'dialog.shader.hover',
          GALLERY_LANE,
          'no hover mount host and no canvas 1.5 s into the hover (P1, FEATURES.md 5.2 item 5)',
        );
      }
      let peak = held;
      await t.moveHuman(
        { x: a.x + a.width / 2, y: a.y + a.height / 2 },
        { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        10,
      );
      for (let i = 0; i < 12; i += 1) {
        peak = Math.max(peak, await dialogCanvases());
        await t.sleep(80);
      }
      const onSecond = await dialogCanvases();
      await page.mouse.move(40, 40);
      const left = await t
        .pollUntil(dialogCanvases, (n) => n === 0, 2000, 50)
        .catch(dialogCanvases);
      await closeGallery();
      return {
        ok: mounted === 1 && held === 1 && peak <= 1 && onSecond === 1 && left === 0,
        observed: `after the hover ${mounted} canvas, ${held} at 400 ms; while moving to the second card at most ${peak} at once, ${onSecond} on it; after leaving ${left}`,
      };
    },
  );

  await t.advancedBack('the shader rows');
}

// The logo picker over thesvg.org, the probe's rows (docs/FEATURES.md section 4, 7.1 `logos.*`
// with the driver `probe --core`, and the images row `logos.intake.url-sentence`): Insert > Logo
// in the default view and in the Image submenu with Search the menus, the search at human speed
// with the first tile preselected, the tiles drawn on paper and on ink, the Your brand group, the
// empty state with Upload, the licence words and the cloud switch, the one click insert as a
// stored asset at the logo size with the chip Logo, the mono tint on a dark deck, Use as this
// presentation's logo on every slide, Tailor's Find the customer's logo, Replace image > Logo, the
// P1 variant controls and the P1 kit button, and the URL intake's sentence. The spec rows (the
// recents across contexts, the route headers, the refresh, the fixture upstream, the cache, the
// agent transports and the 1280 chrome) are core/logos.spec.ts and core/chrome.spec.ts.
//
// The controls are B1's (`dialogs/Logo.tsx`, `dialogs/Tailor.tsx`'s button) over B6's model and
// routes, with the menu rows `insert.logo`, `insert.image.logo` and `format.image.replaceImage.logo`
// in `model.ts` by request to the integrator (FEATURES.md section 6). A row whose control is not on
// the build reads not driven with the control's id and its lane (docs/PRODUCT.md 8.1); the dialog
// is reached through the Insert menu alone, so while the menu row is absent every dialog row reads
// not built on `insert.logo`. The search reaches thesvg.org's index on the deployment (the cache
// of 4.2); a search that answers nothing is recorded with the foot's failure sentence.

export const NAME = 'logos';
export const IDS = [
  'logos.insert.row',
  'logos.picker.search',
  'logos.picker.paper-and-ink',
  'logos.picker.your-brand',
  'logos.picker.empty-state',
  'logos.picker.licence-words',
  'logos.insert.one-click-asset',
  'logos.insert.logo-size',
  'logos.insert.mono-tint',
  'logos.insert.every-slide',
  'logos.tailor.find-customer-logo',
  'logos.replace-image.row',
  'logos.picker.variants',
  'logos.kit.find-a-logo',
  'logos.intake.url-sentence',
];

const MENU_LANE = 'B1 (model.ts by request to the integrator)';
const DIALOG_LANE = 'B1';
const SERVER_LANE = 'B6';
/** The logo size rule of 4.4: a symbol at most this tall, a wordmark this wide, in sheet px. */
const SYMBOL_HEIGHT = 160;
const WORDMARK_WIDTH = 320;

export async function run(t) {
  const { page, BASE } = t;
  const L = await t
    .setup(
      'a Title and body slide for the logo rows',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(t.deck.fontSlide ?? t.deck.titleSlide, 'split');
        t.deck.logoSlide = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.logoSlide);
  await t.clickCard(L);
  await t.clearAll();
  /* the index is built on a fresh instance's first read (fixture mode builds its ten marks inline,
     network mode reads the store), so the route is warmed once here and logos.picker.search
     measures the search, not the build (the integrator, ship one) */
  await page.request
    .get(`${BASE}/api/logo/search?q=warm&limit=1`, { headers: t.headers, timeout: 30_000 })
    .catch(() => undefined);

  // ---------------------------------------------------------------------------------------------
  // the readers

  /** The deck's source document (the window transport's `source.read`), parsed; null when it is not answered. */
  const source = async () => {
    try {
      const text = await t.invoke('source.read', {});
      return typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      return null;
    }
  };
  /**
   * An asset record of the deck by id: describe().state.assets, the deck's asset table as the
   * document holds it (source.read answers the active slide's source, which carries no assets).
   */
  const assetOf = async (id) => {
    const state = await t.state().catch(() => null);
    const assets = state?.assets ?? (await source())?.deck?.assets ?? {};
    return Array.isArray(assets) ? (assets.find((a) => a.id === id) ?? null) : (assets[id] ?? null);
  };
  /** The picture objects of a slide. */
  const pictures = async (slide) =>
    (await t.objectsOf(slide)).filter((o) => o.type === 'shot' || o.type === 'picture');
  /** The tiles of the open dialog: their slugs (or pick ids), the preselected one and their groups. */
  const tiles = () =>
    page.evaluate(() => {
      const list = [...document.querySelectorAll('[data-control^="dialog.logo.tile."]')]
        .filter((e) => e.getClientRects().length > 0 && e.matches('button, [role="option"]'))
        .filter((e) => !/\.(paper|ink|pair|variants)$/.test(e.getAttribute('data-control') ?? ''));
      return list.map((e) => ({
        id: (e.getAttribute('data-control') ?? '').replace('dialog.logo.tile.', ''),
        slug: e.getAttribute('data-slug'),
        active: e.getAttribute('aria-selected') === 'true' || e.classList.contains('is-active'),
        group:
          e
            .closest('[data-control^="dialog.logo.group."]')
            ?.getAttribute('data-control')
            ?.replace('dialog.logo.group.', '') ?? null,
        title: (e.textContent ?? '').trim().slice(0, 40),
      }));
    });
  /** Opens Insert > Logo; answers whether the dialog is drawn, or a not built reading. */
  const openLogo = async () => {
    await t.clearAll();
    const r = await t.reachRow('insert', 'insert.logo');
    if (!r.present)
      return {
        open: false,
        why: t.notBuilt(
          'insert.logo',
          MENU_LANE,
          'no Logo row in the Insert menu (FEATURES.md 4.3)',
        ),
      };
    await t.menuPath('insert', 'insert.logo');
    const shown = await t
      .pollUntil(
        () => t.visible('dialog.logo'),
        (x) => x,
        8000,
      )
      .catch(() => false);
    if (!shown)
      return {
        open: false,
        why: {
          ok: false,
          observed: `Insert > Logo ${r.switched ? '(with the switch on) ' : ''}opened no dialog.logo within 8 s`,
        },
      };
    await t.waitControl('dialog.logo.search', 4000).catch(() => undefined);
    return { open: true, switched: r.switched };
  };
  /** Opens the dialog's More disclosure (a closed <details> draws nothing inside it), so the cloud switch can be read and clicked. */
  const openMore = async () => {
    const summary = page
      .locator('[data-control="dialog.logo"] details:not([open]) > summary')
      .first();
    if ((await summary.count()) > 0) {
      await summary.click().catch(() => undefined);
      await t.sleep(250);
    }
  };
  /** Toggles Include cloud service icons through its label (the input sits under the drawn box, build/b1.md R4). */
  const toggleCloud = async () => {
    const input = page.locator('[data-control="dialog.logo.includeCloud"]').first();
    const before = await input.isChecked().catch(() => null);
    const label = input.locator('xpath=ancestor::label[1]');
    if ((await label.count()) > 0) await label.click();
    else await t.clickControl('dialog.logo.includeCloud');
    await t.sleep(200);
    const after = await input.isChecked().catch(() => null);
    if (before !== null && after === before)
      await input.click({ force: true }).catch(() => undefined);
  };
  const closeLogo = async () => {
    if (await t.visible('dialog.logo')) {
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.logo"]', 4000);
    }
    await t.clearAll();
  };
  /**
   * Types a query at human speed and waits for the results; answers the tiles, the ms from the
   * last key to the first results draw and the searching state.
   */
  const search = async (query) => {
    await t.clickControl('dialog.logo.search');
    await t.press('Meta+a');
    await t.typeHuman(query);
    const lastKey = Date.now();
    const results = await t
      .pollUntil(
        async () => ({
          tiles: await tiles(),
          empty: await t.visible('dialog.logo.empty'),
          searching: await t.visible('dialog.logo.searching'),
        }),
        (x) => (x.tiles.some((tile) => tile.group === 'results') || x.empty) && !x.searching,
        12_000,
        50,
      )
      .catch(async () => ({
        tiles: await tiles(),
        empty: await t.visible('dialog.logo.empty'),
        searching: await t.visible('dialog.logo.searching'),
      }));
    return {
      ...results,
      ms: Date.now() - lastKey,
      foot: await t.textOf('dialog.logo.source'),
      error: await t.textOf('dialog.logo.error'),
    };
  };
  /**
   * The picture the insert placed: the new object of a picture type, never the first new
   * positioned object, because the editor's first insert on a Title and body slide converts it to
   * a canvas in the same commit and the layout's heading and body gain a pos too.
   */
  const newPictureAfter = async (slide, before, timeout = 20_000) =>
    t
      .pollUntil(
        () => pictures(slide),
        (list) => list.some((o) => !before.includes(o.id)),
        timeout,
      )
      .then((list) => list.find((o) => !before.includes(o.id)) ?? null)
      .catch(() => null);
  /** Inserts the tile with the slug by a click; answers the new picture object on the slide, or null. */
  const insertTile = async (slide, slug) => {
    const before = await t.objectIds(slide);
    await t.clickControl(`dialog.logo.tile.${slug}`);
    const obj = await newPictureAfter(slide, before);
    await t.waitGone('[data-control="dialog.logo"]', 8000);
    await t.settled();
    /* the twins are fresh files: the picture is read once its img has decoded (a shot before that
       reads the ground alone) */
    if (obj)
      await t
        .pollUntil(
          () =>
            page.evaluate((id) => {
              const el = document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
              );
              const img = el?.tagName.toLowerCase() === 'img' ? el : el?.querySelector('img');
              return img ? img.complete && img.naturalWidth > 0 : false;
            }, obj.id),
          (x) => x,
          8000,
        )
        .catch(() => undefined);
    return obj;
  };
  /** The body slot's free area of a Title and body slide, in sheet px: under the head, above the frame. */
  const bodySlot = async (slide) => {
    const objs = await t.objectsOf(slide);
    const head = objs
      .filter((o) => o.type === 'heading' || /heading|title/.test(o.id))
      .map((o) => o.pos.y + o.pos.h);
    const top = head.length > 0 ? Math.max(...head) + 40 : 129;
    return { x: 80, y: top, w: 1440, h: 771 - top };
  };
  /**
   * The area picture-place.ts `pictureInsertArea` centres a new picture in on a layout slide with
   * an empty body paragraph: the paragraph's column over the body's height (its own box when it is
   * 240 sheet px or taller), read from the stage before the insert converts the slide and takes the
   * paragraph away; the slot itself when no empty paragraph stands (the integrator, ship one).
   */
  const emptyParagraphColumn = async (slide, slot) => {
    const json = await t.slideJson(slide);
    const blank = (value) =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) &&
        value.every((run) => blank(typeof run === 'string' ? run : (run?.text ?? ''))));
    let found = null;
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === 'object') {
        if (
          found === null &&
          typeof node.id === 'string' &&
          (node.type === 'paragraph' || node.type === 'text') &&
          blank(node.text)
        )
          found = node.id;
        for (const v of Object.values(node)) walk(v);
      }
    };
    walk(json);
    if (found === null) return { ...slot, from: 'the slot' };
    const box = await t.boxOf(found).catch(() => null);
    const sheet = await t.sheetRect();
    if (!box || !sheet || !(sheet.w > 0)) return { ...slot, from: 'the slot' };
    const k = sheet.w / 1600;
    const x = Math.round((box.free.x - sheet.x) / k);
    const y = Math.round((box.free.y - sheet.y) / k);
    const w = Math.round(box.free.w / k);
    const h = Math.round(box.free.h / k);
    if (h >= 240) return { x, y, w, h, from: `the paragraph ${found}` };
    const top = Math.min(y, slot.y);
    const bottom = Math.max(y + h, slot.y + slot.h);
    return { x, y: top, w, h: bottom - top, from: `the column of ${found}` };
  };
  /** The lit fraction of a picture's box on the stage: the pixels differing from the ground by over 40 luminance steps. */
  const litFraction = async (blockId) => {
    const box = await t.boxOf(blockId);
    if (!box) return null;
    /* the shot takes a 6 px margin around the box and reads the ground from that ring (the
       sheet's colour where the mark is, whatever the appearance switched to since the sheet's
       token was read); the mark's pixels are the ones inside the box that differ from it */
    const margin = 6;
    const clip = {
      x: Math.round(box.free.x - margin),
      y: Math.round(box.free.y - margin),
      width: Math.max(1, Math.round(box.free.w + 2 * margin)),
      height: Math.max(1, Math.round(box.free.h + 2 * margin)),
    };
    const img = await t.shotPixels(clip);
    const at = (x, y) =>
      img.pixel
        ? img.pixel(x, y)
        : [
            img.data[(y * img.width + x) * 4],
            img.data[(y * img.width + x) * 4 + 1],
            img.data[(y * img.width + x) * 4 + 2],
          ];
    const ring = [];
    for (let x = 0; x < img.width; x += 1) {
      ring.push(at(x, 1), at(x, img.height - 2));
    }
    for (let y = 0; y < img.height; y += 1) {
      ring.push(at(1, y), at(img.width - 2, y));
    }
    const tally = new Map();
    for (const p of ring) {
      const hex = t.hexOf([p[0], p[1], p[2]]);
      tally.set(hex, (tally.get(hex) ?? 0) + 1);
    }
    const ground = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
    const gl = luminance(ground);
    let lit = 0;
    let total = 0;
    for (let y = margin; y < img.height - margin; y += 1)
      for (let x = margin; x < img.width - margin; x += 1) {
        const p = at(x, y);
        total += 1;
        if (Math.abs(luminance(t.hexOf([p[0], p[1], p[2]])) - gl) > 40) lit += 1;
      }
    return { lit: total ? lit / total : 0, total, ground };
  };
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  /** A screenshot of a tile half: whether it draws anything against its own ground. */
  const halfLit = async (control) => {
    const inResults = `[data-control="dialog.logo.group.results"] [data-control="${control}"]`;
    /* the results group scrolls: a tile below the fold is scrolled into view before its halves
       are shot, else the shot reads the dialog's foot */
    const el = page.locator(inResults).first();
    if ((await el.count()) > 0) await el.scrollIntoViewIfNeeded().catch(() => undefined);
    await t.sleep(250);
    const r = (await t.rectOf(inResults)) ?? (await t.rectOf(`[data-control="${control}"]`));
    if (!r || r.w < 12 || r.h < 12) return null;
    /* the ground is the half's own background (the preselected tile draws a 3 px outline in its
       text colour around each half, so a corner pixel reads the outline and not the ground); the
       shot leaves the outline out (the integrator, ship one) */
    const groundCss = await page.evaluate(
      ([sel, c]) =>
        getComputedStyle(
          document.querySelector(sel) ?? document.querySelector(`[data-control="${c}"]`),
        ).backgroundColor,
      [inResults, control],
    );
    const inset = 4;
    const img = await t.shotPixels({
      x: Math.round(r.x + inset),
      y: Math.round(r.y + inset),
      width: Math.round(r.w - 2 * inset),
      height: Math.round(r.h - 2 * inset),
    });
    const total = img.width * img.height;
    const at = (x, y) =>
      img.pixel
        ? img.pixel(x, y)
        : [
            img.data[(y * img.width + x) * 4],
            img.data[(y * img.width + x) * 4 + 1],
            img.data[(y * img.width + x) * 4 + 2],
          ];
    const corner = at(1, 1);
    const groundRgb = groundCss?.match(/\d+/g)?.slice(0, 3).map(Number) ?? null;
    const ground =
      groundRgb && groundRgb.length === 3
        ? t.hexOf(groundRgb)
        : t.hexOf([corner[0], corner[1], corner[2]]);
    const gl = luminance(ground);
    let lit = 0;
    let white = 0;
    for (let y = 0; y < img.height; y += 1)
      for (let x = 0; x < img.width; x += 1) {
        const p = at(x, y);
        const l = luminance(t.hexOf([p[0], p[1], p[2]]));
        if (Math.abs(l - gl) > 40) lit += 1;
        if (l > 245 && Math.abs(l - gl) > 40) white += 1;
      }
    return {
      lit: lit / total,
      white: white / total,
      ground,
    };
  };

  // ---------------------------------------------------------------------------------------------
  // the rows

  await t.step(
    'logos.insert.row',
    'Insert with the switch off; the Image submenu; Search the menus "logo"',
    'Logo is in the default view under Image and in the submenu; the finder lists Logo first',
    async () => {
      await t.clearAll();
      const advanced = await t.advancedOn();
      if (advanced) await t.setAdvanced(false);
      const inDefault = await t.menuRowPresent('insert', 'insert.logo');
      const inSubmenu = await t.menuRowPresent('insert', 'insert.image', 'insert.image.logo');
      if (!inDefault && !inSubmenu) {
        const parked = await t.setAdvanced(true);
        const withSwitch = parked ? await t.menuRowPresent('insert', 'insert.logo') : false;
        await t.setAdvanced(false);
        if (!withSwitch)
          return t.notBuilt(
            'insert.logo',
            MENU_LANE,
            'no Logo row in the Insert menu with the switch off or on (FEATURES.md 4.3)',
          );
        return {
          ok: false,
          observed:
            'Insert > Logo is drawn with Tools > Advanced tools on alone: the row is parked on this build',
        };
      }
      /* the order: Logo directly under the Image row */
      await t.openMenu('insert');
      const rows = (await t.menuRows('insert')).map((r) => r.id);
      await t.closeMenus();
      const imageAt = rows.indexOf('insert.image');
      const logoAt = rows.indexOf('insert.logo');
      const underImage = imageAt >= 0 && logoAt === imageAt + 1;
      await t.menuPath('help', 'help.searchMenus');
      await t.waitControl('palette.query', 8000);
      await t.typeHuman('logo');
      await t.sleep(600);
      const first = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="palette.menu:"]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control').replace('palette.menu:', ''))
          .slice(0, 3),
      );
      await t.press('Escape');
      await t.waitGone('[data-control="palette.query"]', 4000);
      return {
        ok: inDefault && inSubmenu && underImage && first[0] === 'insert.logo',
        observed: `Insert > Logo in the default view ${inDefault} (${underImage ? 'directly under Image' : `Image at ${imageAt}, Logo at ${logoAt}`}); Insert > Image > Logo ${inSubmenu}; the finder's first rows for "logo": ${first.join(', ') || 'none'}`,
      };
    },
  );

  await t.step(
    'logos.picker.search',
    'Insert > Logo; type figma at human speed; Enter',
    'the results draw within 300 ms of the pause; Figma is the first tile and preselected; Enter inserts it and the dialog closes',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const r = await search('figma');
      const results = r.tiles.filter((x) => x.group === 'results');
      const first = results[0] ?? null;
      const before = await t.objectIds(L);
      await t.press('Enter');
      const obj = await newPictureAfter(L, before);
      const closed = await t.waitGone('[data-control="dialog.logo"]', 8000);
      await t.settled();
      if (!obj) await closeLogo();
      t.deck.logoFigma = obj?.id ?? null;
      return {
        ok:
          results.length > 0 &&
          first?.slug === 'figma' &&
          first.active &&
          r.ms <= 300 &&
          obj !== null &&
          closed,
        observed: `${results.length} result tiles ${r.ms} ms after the last key (first ${first ? `${first.slug} active ${first.active}` : 'none'}${r.error ? `; error "${r.error}"` : ''}; foot "${r.foot ?? 'none'}"); Enter inserted ${obj ? `${obj.type} ${obj.id} ${t.posStr(obj.pos)}` : 'nothing'}; dialog closed ${closed}`,
      };
    },
  );

  await t.step(
    'logos.picker.paper-and-ink',
    "search vercel; read the tile's paper and ink halves; Slide > Change theme light; insert; read the mark",
    'the ink half draws the triangle and the paper half nothing white; the inserted mark reads on a light deck',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const r = await search('vercel');
      const tile = r.tiles.find((x) => x.slug === 'vercel');
      if (!tile) {
        await closeLogo();
        return {
          ok: false,
          observed: `no Vercel tile among ${r.tiles.length} tiles${r.error ? ` (error "${r.error}")` : ''}`,
        };
      }
      const ink = await halfLit('dialog.logo.tile.vercel.ink');
      const paper = await halfLit('dialog.logo.tile.vercel.paper');
      await closeLogo();
      const got = await t.pickAppearance('light');
      await t.closeThemes();
      await t.clickCard(L);
      const o2 = await openLogo();
      let fraction = null;
      let obj = null;
      let imgFacts = null;
      if (o2.open) {
        await search('vercel');
        obj = await insertTile(L, 'vercel');
        if (obj) {
          await t.clearAll();
          fraction = await litFraction(obj.id);
          imgFacts = await page.evaluate((id) => {
            const el = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
            );
            const img = el?.tagName.toLowerCase() === 'img' ? el : el?.querySelector('img');
            return img
              ? `img ${img.currentSrc || img.getAttribute('src')} complete ${img.complete} natural ${img.naturalWidth}x${img.naturalHeight}`
              : `no img in ${el?.tagName ?? 'no element'}`;
          }, obj.id);
        }
      }
      const back = await t.pickAppearance('dark');
      await t.closeThemes();
      await t.clickCard(L);
      return {
        ok:
          ink !== null &&
          ink.lit > 0.002 &&
          paper !== null &&
          paper.lit > 0.002 &&
          paper.white === 0 &&
          fraction !== null &&
          fraction.lit > 0.002,
        observed: `ink half ${ink ? `lit ${(ink.lit * 100).toFixed(2)} percent on ${ink.ground}` : 'unread'}; paper half ${paper ? `lit ${(paper.lit * 100).toFixed(2)} percent, white ${(paper.white * 100).toFixed(2)} percent on ${paper.ground}` : 'unread'}; on the light deck (${JSON.stringify(got)}) the inserted mark ${obj ? `${obj.id} lit ${fraction ? (fraction.lit * 100).toFixed(2) : 'unread'} percent (${imgFacts ?? 'img unread'})` : 'was not inserted'}; back to ${JSON.stringify(back)}`,
      };
    },
  );

  await t.step(
    'logos.picker.your-brand',
    'open the dialog; read the Your brand group; a role logo asset added through the window API; open again; click the brand tile',
    "the group lists the kit logo before any search and the deck's role logo assets; a click inserts at the logo size without a search",
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const first = await tiles();
      const brandBefore = first.filter((x) => x.group === 'brand');
      await closeLogo();
      /* a deck asset with the role logo (a setup write) */
      const s = await t.settled();
      const url = await t.pngDataUrl(120, 80);
      let added = null;
      try {
        added = await t.invoke('asset.add', {
          id: 'brand-mark-asset',
          url,
          role: 'logo',
          alt: 'Acme logo',
          baseRevision: s.revision,
        });
      } catch (error) {
        added = { error: String(error).split('\n')[0] };
      }
      await t.settled();
      const o2 = await openLogo();
      if (!o2.open) return o2.why;
      const second = await tiles();
      const brand = second.filter((x) => x.group === 'brand');
      const assetTile =
        brand.find((x) => x.id === `asset.${added?.id ?? 'brand-mark-asset'}`) ?? null;
      const groupShown = await t.visible('dialog.logo.group.brand');
      let obj = null;
      if (brand.length > 0) {
        const before = await t.objectIds(L);
        await t.clickControl(`dialog.logo.tile.${brand[0].id}`);
        obj = await t.newObjectAfter(L, before).catch(() => null);
        await t.waitGone('[data-control="dialog.logo"]', 8000);
        await t.settled();
      } else await closeLogo();
      const sized = obj ? obj.pos.h <= SYMBOL_HEIGHT + 1 || obj.pos.w <= WORDMARK_WIDTH + 1 : false;
      return {
        ok: groupShown && brand.length > 0 && assetTile !== null && obj !== null && sized,
        observed: `Your brand before the asset: ${brandBefore.map((x) => x.id).join(', ') || 'no tile'} (a tmp store has no deployment kit logo); asset.add role logo ${added?.error ? `refused: ${added.error}` : `ok (${added?.id})`}; after: ${brand.map((x) => x.id).join(', ') || 'no tile'} (group drawn ${groupShown}); the click inserted ${obj ? `${obj.type} ${obj.id} ${t.posStr(obj.pos)} (logo size ${sized})` : 'nothing'}`,
      };
    },
  );

  await t.step(
    'logos.picker.empty-state',
    'search zzqx; Upload; then General Translation',
    'the empty sentence with Upload, the chooser opens; the kit name adds the Your brand sentence',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const r = await search('zzqx');
      const empty = await t.textOf('dialog.logo.empty');
      const upload = await t.visible('dialog.logo.upload');
      let chooser = false;
      if (upload) {
        const waiting = page
          .waitForEvent('filechooser', { timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        await t.clickControl('dialog.logo.upload');
        chooser = await waiting;
      }
      const kitName = (await t.invoke('deck.info').catch(() => null))?.brand?.name ?? null;
      /* Upload hands the chooser to the shell and the dialog closes (dialogs/Logo.tsx); the kit
         name is searched in a reopened dialog */
      if (!(await t.visible('dialog.logo'))) {
        const again = await openLogo();
        if (!again.open) return again.why;
      }
      const r2 = await search('General Translation');
      const empty2 = await t.textOf('dialog.logo.empty');
      await closeLogo();
      const sentence =
        /No logo named zzqx on thesvg\.org/.test(empty ?? '') && /Upload a file/.test(empty ?? '');
      const kitHalf =
        kitName === null
          ? 'no kit name on this deployment (the half is recorded, not judged)'
          : `kit name "${kitName}": ${/under Your brand/.test(empty2 ?? '') ? 'the sentence is drawn' : 'no sentence'}`;
      return {
        ok:
          sentence &&
          upload &&
          chooser &&
          (kitName === null || /under Your brand/.test(empty2 ?? '')),
        observed: `"zzqx" (${r.ms} ms): "${empty ?? 'no empty state'}"; Upload ${upload}, chooser opened ${chooser}; "General Translation" (${r2.ms} ms): "${empty2 ?? 'no empty state'}"; ${kitHalf}`,
      };
    },
  );

  await t.step(
    'logos.picker.licence-words',
    "read the foot; search figma and read the licence row and its tooltip; the dialog's text; search aws; Include cloud service icons",
    'the foot names thesvg.org and the date; the Figma row reads its sentence with the link and the tooltip the recorded string; no identifier outside a tooltip; no AWS tile until the switch is on',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      let phase = 'the foot';
      const at = (name) => {
        phase = name;
      };
      try {
        const footAtOpen = await t.textOf('dialog.logo.source');
        at('search figma');
        const r = await search('figma');
        /* the foot carries the index's date once the results have brought the index facts; before a
           search it names the source alone (redrive 5 read "Logos from thesvg.org. Brand marks
           belong to their owners" at the open and the dated line after the search) */
        const foot = r.foot ?? footAtOpen;
        /* the results group's Figma, not the Recents group's (the rows before inserted Figma, so a
           Recents tile of the same slug lists first and is never the preselected one) */
        const figma = r.tiles.find((x) => x.slug === 'figma' && x.group === 'results');
        at('the preselected figma tile');
        /* the first result is preselected once the results land (Logo.tsx `active`); a click on the
           tile would insert it and close the dialog, so the driver waits for the mark instead of
           clicking (the integrator, ship one: two re-drives lost the dialog here and timed out
           on the next search) */
        const selected = await t
          .pollUntil(
            async () =>
              (await tiles()).find((x) => x.slug === 'figma' && x.group === 'results') ?? null,
            (x) => x !== null && x.active,
            4000,
          )
          .catch(() => figma ?? null);
        await t.sleep(300);
        at('the licence row');
        const licence = await t.textOf('dialog.logo.licence');
        const link = await page.evaluate(() => {
          const a = document.querySelector(
            '[data-control="dialog.logo.licence.link"], [data-control="dialog.logo.licence"] a[href]',
          );
          return a ? { href: a.getAttribute('href'), text: (a.textContent ?? '').trim() } : null;
        });
        at('the licence tooltip');
        const tip = await t.hoverControl('dialog.logo.licence');
        at('the identifiers');
        const identifiers = await page.evaluate(() => {
          const root =
            document.querySelector('[data-control="dialog.logo"]')?.closest('[role="dialog"]') ??
            document.querySelector('[data-control="dialog.logo"]');
          const text = root?.textContent ?? '';
          return (
            text.match(
              /\b(CC0(-1\.0)?|CC-BY(-[A-Z]+)?(-\d\.\d)?|MIT|Apache-2\.0|BSD(-\d-Clause)?|ISC|Unlicense|GPL|MPL)\b/g,
            ) ?? []
          ).slice(0, 6);
        });
        at('search aws');
        const aws = await search('aws');
        const awsBefore = aws.tiles.filter(
          (x) => /^aws/.test(x.slug ?? '') || /aws/i.test(x.title),
        ).length;
        let awsAfter = null;
        at('the More disclosure and the cloud switch');
        await openMore();
        if (await t.visible('dialog.logo.includeCloud')) {
          await toggleCloud();
          /* the switch re-runs the search; the tiles are read once an AWS tile is among the
             results or 8 s pass (a read at the switch's click saw the results from before the
             re-run: redrive 2 counted 0 after the switch) */
          const again = await t
            .pollUntil(
              tiles,
              (list) => list.some((x) => /^aws/.test(x.slug ?? '') || /aws/i.test(x.title)),
              8000,
            )
            .catch(tiles);
          awsAfter = again.filter((x) => /^aws/.test(x.slug ?? '') || /aws/i.test(x.title)).length;
          at('the cloud switch off again');
          await toggleCloud().catch(() => undefined);
        }
        at('close');
        await closeLogo();
        const footOk =
          /thesvg\.org/.test(foot ?? '') &&
          /\d{1,2} [A-Z][a-z]+ \d{4}|\d{4}-\d{2}-\d{2}/.test(foot ?? '');
        const rowOk =
          /Figma: Free to use/.test(licence ?? '') &&
          link !== null &&
          /guidelines|figma\.com/i.test(`${link?.text} ${link?.href}`);
        const tipOk = /Recorded on thesvg\.org as CC0/.test(tip ?? '');
        return {
          ok:
            footOk &&
            rowOk &&
            tipOk &&
            identifiers.length === 0 &&
            awsBefore === 0 &&
            awsAfter !== null &&
            awsAfter > 0,
          observed: `foot "${foot ?? 'none'}" (at the open "${footAtOpen ?? 'none'}"); Figma row "${licence ?? 'none'}" with link ${link ? `${link.text} -> ${link.href}` : 'none'}; tooltip "${tip ?? 'none'}"; identifiers drawn outside a tooltip ${identifiers.join(', ') || 'none'}; Figma tile preselected ${selected?.active === true}; AWS tiles before the switch ${awsBefore}, after ${awsAfter ?? 'no Include cloud service icons row'}`,
        };
      } catch (error) {
        throw new Error(`at ${phase}: ${String(error?.message ?? error).split('\n')[0]}`);
      }
    },
  );

  await t.step(
    'logos.insert.one-click-asset',
    'search figma; one click on the tile; read the asset record, the img and the source document',
    'an asset with role logo, source.kind logo, provider thesvg, PNG twins at scale 3 and a sourceFile; the img src is same origin; no thesvg.org address in the document',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      await search('figma');
      const obj = await insertTile(L, 'figma');
      if (!obj) {
        await closeLogo();
        return { ok: false, observed: 'the click inserted nothing within 20 s' };
      }
      t.deck.logoFigma = obj.id;
      const assetId = obj.block.asset ?? null;
      const asset = assetId ? await assetOf(assetId) : null;
      const img = await page.evaluate((id) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
        const image = el?.tagName.toLowerCase() === 'img' ? el : el?.querySelector('img');
        return image
          ? { src: image.getAttribute('src') ?? '', currentSrc: image.currentSrc }
          : null;
      }, obj.id);
      const sameOrigin =
        img !== null &&
        (img.src.startsWith('/') ||
          img.src.startsWith(BASE) ||
          new URL(img.currentSrc || img.src, BASE).origin === new URL(BASE).origin);
      const doc = await source();
      const docText = doc ? JSON.stringify(doc) : '';
      const twins = asset?.twins ?? null;
      const twinPng = twins
        ? Object.values(twins)
            .flat()
            .every((p) => typeof p !== 'string' || /\.png$/.test(p))
        : false;
      return {
        ok:
          asset !== null &&
          asset.role === 'logo' &&
          asset.source?.kind === 'logo' &&
          asset.source?.provider === 'thesvg' &&
          asset.scale === 3 &&
          twins !== null &&
          twinPng &&
          typeof asset.sourceFile === 'string' &&
          sameOrigin &&
          docText !== '' &&
          !/thesvg\.org|jsdelivr/.test(docText),
        observed: `${obj.type} ${obj.id} asset ${assetId ?? 'none'}: ${asset ? `role ${asset.role}, source ${asset.source?.kind}/${asset.source?.provider} ${asset.source?.slug ?? ''} ${asset.source?.variant ?? ''}, scale ${asset.scale}, twins ${JSON.stringify(twins).slice(0, 120)}, sourceFile ${asset.sourceFile ?? 'none'}` : 'no record in the source document'}; img src ${img?.src ?? 'none'} (same origin ${sameOrigin}); thesvg.org in the document ${/thesvg\.org/.test(docText)}`,
      };
    },
  );

  await t.step(
    'logos.insert.logo-size',
    'read the inserted Figma mark against the body slot, its chip and the text runs',
    "at most 160 sheet px tall, centred in the body slot's free area, selected with the chip Logo, over no text run",
    async () => {
      /* a fresh Title and body slide, so the body slot's free area is the slot itself: the rows
         before placed marks on the area's slide and the placement rule keeps a new mark out of
         their boxes (the integrator, ship one) */
      const fresh = await t.setupSlide(L, 'one-column').catch(() => null);
      if (!fresh) return { ok: false, observed: 'no fresh Title and body slide for the read' };
      await t.clickCard(fresh);
      await t.clearAll();
      /* the area the placement centres the mark in, read before the insert (the first reading took
         the slot's centre and read the mark 279 px left of it: the layout's empty paragraph is the
         column the mark goes into, picture-place.ts pictureInsertArea) */
      const slot = await bodySlot(fresh);
      const area = await emptyParagraphColumn(fresh, slot);
      const o = await openLogo();
      if (!o.open) return o.why;
      await search('figma');
      const inserted = await insertTile(fresh, 'figma');
      if (!inserted) {
        await closeLogo();
        return {
          ok: false,
          observed: 'the Figma mark was not inserted on the fresh slide within 20 s',
        };
      }
      const id = inserted.id;
      const obj = (await pictures(fresh)).find((o) => o.id === id) ?? null;
      if (!obj) return { ok: false, observed: `the mark ${id} is not on the slide` };
      await t.clearAll();
      const facts = await t.clickSelect(id);
      const cx = obj.pos.x + obj.pos.w / 2;
      const cy = obj.pos.y + obj.pos.h / 2;
      const centred =
        Math.abs(cx - (area.x + area.w / 2)) < 12 && Math.abs(cy - (area.y + area.h / 2)) < 60;
      const runs = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
          ),
        ]
          .filter((el) => (el.textContent ?? '').trim().length > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { run: el.getAttribute('data-run'), x: r.x, y: r.y, w: r.width, h: r.height };
          }),
      );
      const box = await t.boxOf(id);
      const overlaps = box
        ? runs
            .filter(
              (r) =>
                r.x < box.free.x + box.free.w &&
                r.x + r.w > box.free.x &&
                r.y < box.free.y + box.free.h &&
                r.y + r.h > box.free.y,
            )
            .map((r) => r.run)
        : [];
      await t.clearAll();
      await t.clickCard(L);
      return {
        ok:
          obj.pos.h <= SYMBOL_HEIGHT + 1 &&
          centred &&
          facts.facts.chip === 'Logo' &&
          facts.facts.selected &&
          overlaps.length === 0,
        observed: `${t.posStr(obj.pos)} (height under ${SYMBOL_HEIGHT} ${obj.pos.h <= SYMBOL_HEIGHT + 1}); body slot ${JSON.stringify(slot)}, placement area ${JSON.stringify(area)}, centred ${centred}; ${t.describeSelection(facts.facts)}; text runs under it ${overlaps.join(', ') || 'none'}`,
      };
    },
  );

  await t.step(
    'logos.insert.mono-tint',
    "on the dark deck insert the Stripe mark's mono (asked for through the window API); read its variant and the fills of its source file; then AWS through the dialog with the cloud switch on",
    "Stripe's mono has every fill the kit's text colour and the twin lit on ink; AWS carries its file unmodified",
    async () => {
      const appearance = await t.appearance();
      const o = await openLogo();
      if (!o.open) return o.why;
      /* Stripe has a mono and no light and dark pair, so the appearance rule reaches the tint;
         GitHub, the row's first example, carries its own light file, which the rule prefers to a
         tint (docs/FEATURES.md 4.3; build/b6.md section 5) */
      await closeLogo();
      /* the mono is asked for, the way the P1 Mono control (docs/FEATURES.md 4.11) and an agent
         ask: the ten mark fixture holds no mark whose default fails on ink and whose mono may be
         tinted without a pair of its own (Stripe's default reads on ink, so the appearance rule
         picks it), and the tint is the server's on any variant asked for */
      const s0 = await t.settled();
      const before = await t.objectIds(L);
      let insertError = null;
      await t
        .invoke('logo.insert', {
          slug: 'stripe',
          variant: 'mono',
          slideId: L,
          baseRevision: s0.revision,
        })
        .catch((error) => {
          insertError = String(error?.message ?? error).split('\n')[0];
        });
      const obj = insertError === null ? await newPictureAfter(L, before) : null;
      await t.settled();
      if (!obj) {
        return {
          ok: false,
          observed: `the Stripe mono was not inserted within 20 s${insertError ? ` (${insertError})` : ''}`,
        };
      }
      const asset = obj.block.asset ? await assetOf(obj.block.asset) : null;
      const textColour =
        (await t.sheetVar('--kit-text')) ??
        (await t.sheetVar('--ink')) ??
        (await t.sheetVar('--paper'));
      const fills = async (record) => {
        if (!record?.sourceFile) return null;
        const deckId = (await t.state()).deckId;
        const res = await page.request
          .get(`${BASE}/decks/${deckId}/${String(record.sourceFile).replace(/^\//, '')}`, {
            headers: t.headers,
            maxRedirects: 0,
          })
          .catch(() => null);
        if (!res || res.status() !== 200) return { status: res?.status() ?? 0, fills: [] };
        const svg = await res.text();
        const list = [...svg.matchAll(/fill=["']([^"']+)["']|fill:\s*([^;"']+)/g)]
          .map((m) => (m[1] ?? m[2]).trim().toLowerCase())
          .filter((f) => f !== 'none');
        return { status: 200, fills: [...new Set(list)] };
      };
      const gh = await fills(asset);
      await t.clearAll();
      const fraction = await litFraction(obj.id);
      const want = textColour ? textColour.trim().toLowerCase() : null;
      const tinted =
        gh !== null &&
        gh.fills.length > 0 &&
        want !== null &&
        gh.fills.every((f) => f === want || f === 'currentcolor');
      /* the AWS mark with the cloud switch on */
      const o2 = await openLogo();
      let aws = null;
      let awsFills = null;
      if (o2.open) {
        await openMore();
        if (await t.visible('dialog.logo.includeCloud')) await toggleCloud();
        const r = await search('aws');
        const tile =
          r.tiles.find((x) => x.slug === 'aws') ?? r.tiles.find((x) => /^aws/.test(x.slug ?? ''));
        if (tile) {
          aws = await insertTile(L, tile.slug);
          const awsAsset = aws?.block?.asset ? await assetOf(aws.block.asset) : null;
          awsFills = await fills(awsAsset);
          aws = aws ? { ...aws, asset: awsAsset } : null;
        } else await closeLogo();
      }
      const awsUnmodified = aws?.asset
        ? aws.asset.source?.variant !== 'mono' &&
          aws.asset.source?.sanitized === undefined &&
          (awsFills?.fills ?? []).some((f) => f !== want)
        : false;
      return {
        ok:
          appearance.deck === 'dark' &&
          asset?.source?.variant === 'mono' &&
          tinted &&
          fraction !== null &&
          fraction.lit > 0.002 &&
          awsUnmodified,
        observed: `deck appearance ${appearance.deck}; Stripe asset ${asset ? `variant ${asset.source?.variant}, licence ${asset.source?.license}` : 'no record'}; the source file's fills ${gh ? `${gh.status}: ${gh.fills.join(', ') || 'none'}` : 'unread'} against the kit's text colour ${want ?? 'unread'} (tinted ${tinted}); the twin lit ${fraction ? (fraction.lit * 100).toFixed(2) : 'unread'} percent; AWS ${aws ? `${aws.id} variant ${aws.asset?.source?.variant}, licence ${aws.asset?.source?.license}, sanitized ${JSON.stringify(aws.asset?.source?.sanitized ?? null)}, fills ${awsFills?.fills.join(', ') || 'none'} (unmodified ${awsUnmodified})` : 'no AWS tile with the cloud switch'}`,
      };
    },
  );

  await t.step(
    'logos.insert.every-slide',
    'read the foot check and its sentence; check it; insert Figma; read the title slide and a new slide; the snackbar; Cmd+Z; open the dialog again',
    'the check is off by default with its sentence, the mark draws in the title slot and a new footer, the snackbar names the mark with Undo, Cmd+Z removes it in one step and the check is off again',
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const readCheck = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-control="dialog.logo.everySlide"]');
          if (!el) return null;
          const input = el.matches('input') ? el : el.querySelector('input');
          const row = el.closest('label, .ts-logo-check, .ts-dialog-check, div') ?? el;
          return {
            checked:
              input instanceof HTMLInputElement
                ? input.checked
                : el.getAttribute('aria-checked') === 'true',
            label: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
            line:
              document
                .querySelector('[data-control="dialog.logo.everySlide.line"]')
                ?.textContent?.trim() ?? null,
          };
        });
      const check = await readCheck();
      if (check === null) {
        await closeLogo();
        return t.notBuilt(
          'dialog.logo.everySlide',
          DIALOG_LANE,
          "no Use as this presentation's logo check in the dialog's foot (FEATURES.md 4.4)",
        );
      }
      await t.clickControl('dialog.logo.everySlide');
      await t.sleep(200);
      const checked = (await readCheck())?.checked === true;
      /* the blank slide whose footer is read is made before the insert: a slide.new through the
         window API is a write of this seller's and Cmd+Z takes back the last one (the integrator,
         ship one; the run that made it after the insert undid the slide, not the logo) */
      await closeLogo();
      const fresh = await t.setupSlide(t.deck.titleSlide, 'blank').catch(() => null);
      await t.clickCard(L);
      await t.clearAll();
      const o1 = await openLogo();
      if (!o1.open) return o1.why;
      await t.clickControl('dialog.logo.everySlide');
      await t.sleep(200);
      const rev0 = (await t.state()).revision;
      await search('figma');
      const obj = await insertTile(L, 'figma');
      const snackbar = await t.snackbarWithin(5000).catch(() => null);
      const undoButton = await t.visible('snackbar.action');
      const drawnLogo = () =>
        page.evaluate(() => {
          const sheet = document.querySelector(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)',
          );
          const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
          const mark =
            sheet?.querySelector(
              'img.mark, .mark img, img[data-slot="mark"], [data-slot="mark"] img',
            ) ?? null;
          const footer =
            stage?.querySelector(
              '.wordmark img, [data-slot="footer-logo"] img, .ts-kit-footer img',
            ) ?? null;
          return { mark: mark !== null, footer: footer !== null };
        });
      await t.clickCard(t.deck.titleSlide);
      await t.sleep(400);
      const title = await drawnLogo();
      let footer = { mark: false, footer: false };
      if (fresh) {
        await t.clickCard(fresh);
        await t.sleep(400);
        footer = await drawnLogo();
      }
      const revAfter = (await t.state()).revision;
      await t.clearAll();
      if (obj) {
        await t.press('Meta+z');
        await t.sleep(600);
        await t.settled();
        /* the room acknowledges the undo about two seconds after the chord on the memory tier
           (build/b3.md R7); the kit is read once it has */
        await t.waitRevision(revAfter + 1, 15_000).catch(() => undefined);
      }
      const rev2 = (await t.state()).revision;
      await t.clickCard(t.deck.titleSlide);
      await t.sleep(400);
      const afterUndo = await drawnLogo();
      const kit = (await t.invoke('deck.info').catch(() => null))?.brand ?? null;
      const stillOnKit = kit?.mark?.kind === 'picture';
      await t.clickCard(L);
      const o2 = await openLogo();
      const again = o2.open ? await readCheck() : null;
      await closeLogo();
      return {
        ok:
          check.checked === false &&
          /Use as this presentation['\u2019]s logo on every slide/.test(check.label) &&
          /Replaces the brand kit['\u2019]s logo on the title slide and in every footer/.test(
            `${check.label} ${check.line}`,
          ) &&
          checked &&
          obj !== null &&
          title.mark &&
          footer.footer &&
          /The Figma logo is on every slide/.test(snackbar ?? '') &&
          undoButton &&
          !afterUndo.mark &&
          !stillOnKit &&
          again?.checked === false,
        observed: `check off by default ${check.checked === false}: "${check.label}" line "${check.line ?? 'none'}"; checked ${checked}; inserted ${obj ? obj.id : 'nothing'}; title slot draws the mark ${title.mark}; a new slide's footer draws it ${footer.footer}; snackbar "${snackbar ?? 'none'}" with Undo ${undoButton}; revision ${rev0} -> ${revAfter} -> Cmd+Z ${rev2}; after Cmd+Z the title mark ${afterUndo.mark}, the kit's mark ${kit?.mark?.kind ?? 'unread'}; the check in a fresh dialog ${again === null ? 'unread' : again.checked ? 'on' : 'off'}`,
      };
    },
  );

  await t.step(
    'logos.tailor.find-customer-logo',
    'a picture with alt Acme and a text naming Acme as setup; Tools > Tailor; From Acme, To Figma; Find the Figma logo; Apply; Cmd+Z',
    "the button shows the mark; Apply swaps the Acme picture and renames the text in one undo step; the kit's mark is unchanged",
    async () => {
      await t.clickCard(L);
      await t.clearAll();
      const s = await t.settled();
      const url = await t.pngDataUrl(120, 80);
      const asset = await t
        .invoke('asset.add', {
          id: 'acme-logo-asset',
          url,
          role: 'logo',
          alt: 'Acme logo',
          baseRevision: s.revision,
        })
        .catch(() => null);
      await t.settled();
      if (asset?.id) {
        const s2 = await t.settled();
        await t
          .invoke('block.insert', {
            baseRevision: s2.revision,
            slideId: L,
            slot: 'main',
            block: {
              id: 'acme-logo',
              type: 'shot',
              asset: asset.id,
              alt: 'Acme logo',
              pos: { x: 1200, y: 600, w: 240, h: 160 },
            },
          })
          .catch(() => undefined);
        await t.settled();
      }
      const s3 = await t.settled();
      await t
        .invoke('block.insert', {
          baseRevision: s3.revision,
          slideId: L,
          slot: 'main',
          block: {
            id: 'acme-text',
            type: 'text',
            text: 'Prepared for Acme',
            pos: { x: 80, y: 760, w: 600, h: 60 },
          },
        })
        .catch(() => undefined);
      await t.settled();
      const kitBefore = (await t.invoke('deck.info').catch(() => null))?.brand?.mark ?? null;
      const r = await t.reachRow('tools', 'tools.tailor');
      if (!r.present) {
        await t.advancedBack('Tools > Tailor');
        return t.notBuilt(
          'tools.tailor',
          'B6 (the product round)',
          'no Tailor for a customer row under Tools',
        );
      }
      await t.menuPath('tools', 'tools.tailor');
      await t.waitControl('dialog.tailor', 8000);
      await t.clickControl('dialog.tailor.from');
      await t.typeHuman('Acme');
      await t.clickControl('dialog.tailor.to');
      await t.typeHuman('Figma');
      const found = await t
        .pollUntil(
          () => t.visible('dialog.tailor.logo.find'),
          (x) => x,
          8000,
        )
        .catch(() => false);
      if (!found) {
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.tailor"]', 4000);
        await t.advancedBack('Tools > Tailor');
        return t.notBuilt(
          'dialog.tailor.logo.find',
          DIALOG_LANE,
          'the Tailor dialog draws no Find the Figma logo button once To names a brand (FEATURES.md 4.5)',
        );
      }
      const label = await t.textOf('dialog.tailor.logo.find');
      const revStore = (await t.state()).revision;
      await t.clickControl('dialog.tailor.logo.find');
      const stored = await t
        .pollUntil(
          async () =>
            (await t.textOf('dialog.tailor.logo.stored')) ??
            (await t.textOf('dialog.tailor.error')),
          (x) => x !== null && x.trim() !== '',
          30_000,
        )
        .catch(() => null);
      const storeError = await t.textOf('dialog.tailor.error');
      if (storeError !== null && t.notImplemented(new Error(storeError))) {
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.tailor"]', 4000);
        await t.advancedBack('Tools > Tailor');
        return t.notBuilt(
          'logo.insert',
          'B7 (agent-actions.ts registers the window transport)',
          `the Find the Figma logo button drew the mark and its store answered "${storeError}"`,
        );
      }
      const shown = await page.evaluate(() => {
        const found = document.querySelector('[data-control="dialog.tailor.logo.found"]');
        return Boolean(found?.querySelector('img, svg, canvas'));
      });
      /* the store is one write the room acknowledges about two seconds after the button's answer
         on the memory tier (build/b3.md R7): Apply's one revision is counted from after it */
      if (stored !== null && storeError === null)
        await t.waitRevision(revStore + 1, 15_000).catch(() => undefined);
      await t.settled();
      const rev0 = (await t.state()).revision;
      const apply = (await t.visible('dialog.tailor.apply')) ? 'dialog.tailor.apply' : null;
      if (apply) await t.clickControl(apply);
      await t.waitGone('[data-control="dialog.tailor"]', 20_000);
      await t.settled();
      const rev1 = (await t.state()).revision;
      const objs = await t.objectsOf(L);
      const pic = objs.find((o) => o.id === 'acme-logo') ?? null;
      const swapped = pic !== null && pic.block.asset !== asset?.id;
      const text = objs.find((o) => o.id === 'acme-text')?.block?.text ?? null;
      const kitAfter = (await t.invoke('deck.info').catch(() => null))?.brand?.mark ?? null;
      await t.clearAll();
      if (swapped || text === 'Prepared for Figma') {
        await t.press('Meta+z');
        await t.sleep(600);
        await t.settled();
      }
      const rev2 = (await t.state()).revision;
      const objs2 = await t.objectsOf(L);
      const restored =
        objs2.find((o) => o.id === 'acme-logo')?.block?.asset === asset?.id &&
        objs2.find((o) => o.id === 'acme-text')?.block?.text === 'Prepared for Acme';
      await t.advancedBack('Tools > Tailor');
      return {
        ok:
          /Figma/.test(label ?? '') &&
          shown &&
          stored !== null &&
          apply !== null &&
          swapped &&
          text === 'Prepared for Figma' &&
          rev1 === rev0 + 1 &&
          restored &&
          JSON.stringify(kitBefore) === JSON.stringify(kitAfter),
        observed: `button "${label ?? 'none'}" with the mark drawn ${shown}; stored "${stored ?? 'none'}"${storeError ? ` (error "${storeError}")` : ''}; Apply ${apply ?? 'absent'}: picture asset ${asset?.id ?? 'none'} -> ${pic?.block?.asset ?? 'no picture'} (swapped ${swapped}), text "${text}" (revision ${rev0} -> ${rev1}); Cmd+Z -> ${rev2}, restored ${restored}; the kit's mark ${JSON.stringify(kitBefore)} -> ${JSON.stringify(kitAfter)}`,
      };
    },
  );

  await t.step(
    'logos.replace-image.row',
    'a picture placed through the window API; right click it; Replace image > Logo; Figma',
    'the asset swaps and the box stays',
    async () => {
      await t.clickCard(L);
      await t.clearAll();
      let placeError = null;
      const placed = await t
        .placePicture(L, { x: 900, y: 200, w: 240, h: 160 }, 'replace-target')
        .catch((error) => {
          placeError = String(error?.message ?? error).split('\n')[0];
          return null;
        });
      const id = placed?.id ?? null;
      if (!id)
        return {
          ok: false,
          observed: `the picture could not be placed${placeError ? `: ${placeError}` : ''}`,
        };
      const before = (await t.objectsOf(L)).find((o) => o.id === id);
      await t.selectObject(id);
      const b = await t.boxOf(id);
      await t.rightClickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      const rows = await t.contextRows();
      const replace = rows.find((r) => r.id === 'format.image.replaceImage');
      if (!replace) {
        await t.press('Escape');
        return {
          ok: false,
          observed: `no Replace image row in the picture's menu (${rows.map((r) => r.id).join(', ')})`,
        };
      }
      await t.hoverContextRow('format.image.replaceImage').catch(() => undefined);
      await t.sleep(400);
      const sub = await t.contextRows();
      const logoRow = sub.find((r) => r.id === 'format.image.replaceImage.logo');
      if (!logoRow) {
        await t.press('Escape');
        await t.sleep(200);
        return t.notBuilt(
          'format.image.replaceImage.logo',
          'B6 (model.ts by request to the integrator)',
          `the Replace image submenu lists ${
            sub
              .filter((r) => r.id.startsWith('format.image.replaceImage.'))
              .map((r) => r.id.replace('format.image.replaceImage.', ''))
              .join(', ') || 'nothing'
          } and no Logo row (FEATURES.md 4.4)`,
        );
      }
      await t.clickContextRow('format.image.replaceImage.logo');
      const shown = await t
        .pollUntil(
          () => t.visible('dialog.logo'),
          (x) => x,
          8000,
        )
        .catch(() => false);
      if (!shown) return { ok: false, observed: 'Replace image > Logo opened no dialog' };
      await search('figma');
      const rev0 = (await t.state()).revision;
      await t.clickControl('dialog.logo.tile.figma');
      await t.waitGone('[data-control="dialog.logo"]', 20_000);
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await t.objectsOf(L)).find((o) => o.id === id) ?? null,
          (o) => o && o.block.asset !== before.block.asset,
          20_000,
        )
        .catch(async () => (await t.objectsOf(L)).find((o) => o.id === id) ?? null);
      const rev1 = (await t.state()).revision;
      await t.clearAll();
      return {
        ok:
          after !== null &&
          after.block.asset !== before.block.asset &&
          JSON.stringify(after.pos) === JSON.stringify(before.pos),
        observed: `asset ${before.block.asset} -> ${after?.block?.asset ?? 'unchanged'} (revision ${rev0} -> ${rev1}); box ${t.posStr(before.pos)} -> ${t.posStr(after?.pos)}`,
      };
    },
  );

  await t.step(
    'logos.picker.variants',
    'search stripe and read Wordmark; Vercel with Wordmark; Mono on a light deck',
    "Wordmark is disabled for Stripe with the tooltip; Vercel's wordmark inserts 320 sheet px wide; Mono inserts in the kit's text colour",
    async () => {
      const o = await openLogo();
      if (!o.open) return o.why;
      const kind = await t.visible('dialog.logo.kind.wordmark');
      const tone = await t.visible('dialog.logo.tone.mono');
      if (!kind && !tone) {
        await closeLogo();
        return t.notBuilt(
          'dialog.logo.kind.wordmark',
          DIALOG_LANE,
          'no Symbol, Wordmark, Color or Mono control in the dialog head (P1, FEATURES.md 4.11; the appearance rule chooses)',
        );
      }
      await search('stripe');
      const stripeDisabled = await page.evaluate(() => {
        const el = document.querySelector('[data-control="dialog.logo.kind.wordmark"]');
        return el
          ? el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
          : null;
      });
      const tip = await t.hoverControl('dialog.logo.kind.wordmark');
      await search('vercel');
      if (kind) await t.clickControl('dialog.logo.kind.wordmark');
      const obj = await insertTile(L, 'vercel');
      const o2 = await openLogo();
      let mono = null;
      if (o2.open) {
        await t.pickAppearance('light').catch(() => undefined);
        await t.closeThemes().catch(() => undefined);
        await t.clickCard(L);
        const o3 = (await t.visible('dialog.logo')) ? { open: true } : await openLogo();
        if (o3.open) {
          await search('github');
          if (tone) await t.clickControl('dialog.logo.tone.mono');
          mono = await insertTile(L, 'github');
        }
        await t.pickAppearance('dark').catch(() => undefined);
        await t.closeThemes().catch(() => undefined);
        await t.clickCard(L);
      }
      const monoAsset = mono?.block?.asset ? await assetOf(mono.block.asset) : null;
      return {
        ok:
          stripeDisabled === true &&
          /no wordmark on thesvg\.org/.test(tip ?? '') &&
          obj !== null &&
          t.near(obj.pos.w, WORDMARK_WIDTH, 2) &&
          monoAsset?.source?.variant === 'mono',
        observed: `Wordmark on Stripe disabled ${stripeDisabled} (tooltip "${tip ?? 'none'}"); Vercel with Wordmark ${obj ? t.posStr(obj.pos) : 'not inserted'}; Mono on the light deck ${monoAsset ? `variant ${monoAsset.source?.variant}` : 'no asset'}`,
      };
    },
  );

  await t.step(
    'logos.kit.find-a-logo',
    'Slide > Change theme; Brand kit > Logo > Find a logo; Figma',
    'the slot preview and every footer draw it within 5 s; brand.get reads mark.kind picture',
    async () => {
      await t.clickCard(L);
      await t.clearAll();
      await t.menuPath('slide', 'slide.changeTheme');
      const panel = await t
        .pollUntil(
          async () =>
            (await t.visible('panel.brand'))
              ? 'brand'
              : (await t.visible('panel.themes'))
                ? 'themes'
                : null,
          (x) => x !== null,
          8000,
        )
        .catch(() => null);
      if (panel !== 'brand') {
        await t.closeThemes().catch(() => undefined);
        return t.notBuilt(
          'panel.brand',
          'B5a (the product round)',
          `Slide > Change theme opened ${panel ?? 'no panel'}`,
        );
      }
      const find = await t.visible('panel.brand.logo.find');
      if (!find) {
        await t.closeThemes().catch(() => undefined);
        return t.notBuilt(
          'panel.brand.logo.find',
          SERVER_LANE,
          "no Find a logo beside Replace in the Brand kit panel's Logo section (P1, FEATURES.md 4.5)",
        );
      }
      await t.clickControl('panel.brand.logo.find');
      const shown = await t
        .pollUntil(
          () => t.visible('dialog.logo'),
          (x) => x,
          8000,
        )
        .catch(() => false);
      if (!shown) return { ok: false, observed: 'Find a logo opened no dialog' };
      await search('figma');
      const t0 = Date.now();
      await t.clickControl('dialog.logo.tile.figma');
      await t.waitGone('[data-control="dialog.logo"]', 20_000);
      const drawn = await t
        .pollUntil(
          () =>
            page.evaluate(() => {
              const preview = document.querySelector(
                '[data-control="panel.brand.logo.preview"] img',
              );
              const footer = document.querySelector(
                '.ts-stagewrap.ts-editor .ts-stage .wordmark img, .ts-stagewrap.ts-editor .ts-stage [data-slot="footer-logo"] img',
              );
              return { preview: preview !== null, footer: footer !== null };
            }),
          (x) => x.preview && x.footer,
          5000,
        )
        .catch(() => ({ preview: false, footer: false }));
      const ms = Date.now() - t0;
      await t.settled();
      const kit = await t.invoke('brand.get', {}).catch(() => null);
      const kind = kit?.mark?.kind ?? kit?.brand?.mark?.kind ?? null;
      await t.clearAll();
      if (drawn.preview || drawn.footer || kind === 'picture') {
        await t.press('Meta+z');
        await t.sleep(500);
        await t.settled();
      }
      await t.closeThemes().catch(() => undefined);
      return {
        ok: drawn.preview && drawn.footer && ms <= 5000 && kind === 'picture',
        observed: `preview drawn ${drawn.preview}, footer drawn ${drawn.footer} after ${ms} ms; brand.get mark.kind ${kind ?? 'unread'}`,
      };
    },
  );

  await t.step(
    'logos.intake.url-sentence',
    'asset.add { url: https://thesvg.org/... } on the window API; then the allowlisted Wikimedia PNG',
    'the refusal names the four sites and no CLI flag; the Wikimedia picture answers 200',
    async () => {
      await t.clickCard(L);
      const s = await t.settled();
      let refusal = null;
      try {
        await t.invoke(
          'asset.add',
          {
            id: 'thesvg-by-url',
            url: 'https://thesvg.org/icons/figma/default.svg',
            role: 'logo',
            alt: 'Figma logo',
            baseRevision: s.revision,
          },
          30_000,
        );
        refusal = 'accepted (no refusal)';
      } catch (error) {
        refusal = String(error instanceof Error ? error.message : error).split('\n')[0];
      }
      const sites = [
        'generaltranslation.com',
        'prototemplate.com',
        'glyphfield.com',
        'Wikimedia Commons',
      ].filter((site) => refusal.includes(site));
      const flag = /--allow|captureHosts|allowlist/.test(refusal);
      const s2 = await t.settled();
      let wikimedia = null;
      const t0 = Date.now();
      try {
        const answer = await t.invoke(
          'asset.add',
          {
            id: 'wikimedia-by-url',
            /* the file itself: the thumb path of this file answers 400 to every caller, with or
               without the server's User-Agent (measured with curl on 2026-09-22) */
            url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
            role: 'capture',
            alt: 'A Wikimedia PNG',
            baseRevision: s2.revision,
          },
          60_000,
        );
        wikimedia = { ok: Boolean(answer?.id), id: answer?.id ?? null, ms: Date.now() - t0 };
      } catch (error) {
        wikimedia = {
          ok: false,
          error: String(error instanceof Error ? error.message : error).split('\n')[0],
          ms: Date.now() - t0,
        };
      }
      await t.settled();
      return {
        ok: sites.length === 4 && !flag && wikimedia?.ok === true,
        observed: `thesvg.org by URL: "${refusal}" (sites named ${sites.length} of 4, a CLI flag ${flag}); the Wikimedia PNG: ${wikimedia?.ok ? `stored as ${wikimedia.id} in ${wikimedia.ms} ms` : `refused after ${wikimedia?.ms} ms: ${wikimedia?.error ?? 'unknown'}`}${sites.length === 4 ? '' : ' (FEATURES.md 4.7, B7, P1)'}`,
      };
    },
  );
  await t.advancedBack('the logo rows');
}

// The font catalog, the probe's rows (docs/PRODUCT.md 4.2, 8.1 `fonts.*` with the driver
// `probe --core`): the Font dropdown on the text tail with its search field, the brand and used
// groups and the catalog by category, a face applied to a run and undone, the search, the Format
// > Text > Font row, More fonts with a licence line per family, the face after a reload and in
// the show, and font.list on the window API and over HTTP. The network budget row and the two
// export rows are core/brand.spec.ts and core/export.spec.ts.
//
// The dropdown and its ids are B5a's (PRODUCT.md 7.1: `toolbar.font`, `toolbar.font.search`,
// `toolbar.font.group.<brand|used|sans|serif|display|mono>`, `toolbar.font.row.<id>`,
// `toolbar.font.more`, `dialog.moreFonts`, `dialog.moreFonts.row.<id>`,
// `dialog.moreFonts.licence.<id>`, `format.text.font`). Today the control is drawn disabled on
// purpose ("The GT theme sets Inter", toolbar-tails.ts 173 to 181), so the rows read not driven
// while it is (8.1: a control drawn disabled on purpose is not driven, never broken).

export const NAME = 'fonts';
export const IDS = [
  'fonts.dropdown.opens',
  'fonts.dropdown.apply-selection',
  'fonts.dropdown.search',
  'fonts.format-menu.row',
  'fonts.more-fonts.licence',
  'fonts.face.reload-and-show',
  'fonts.agent.font-list',
  /* the features round, ship one (docs/FEATURES.md 3.1, 3.2, 3.5): the v4.1 licence link, the
     fallback face in the stack, the display features gated on Inter, Geist and the six families,
     the P1 category search and the table taking a family; driven by `featuresRound` below */
  'fonts.links.licence-v4-1',
  'fonts.fallback.in-stack',
  'fonts.display-features.inter-only',
  'fonts.catalog.geist',
  'fonts.catalog.six-families',
  'fonts.picker.search-category',
  'fonts.table.takes-family',
];

/** The 26 families of SPEC-5-amendments A5 (`packages/schema/src/fonts.ts` on the branch). */
export const FONT_IDS = [
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'montserrat',
  'poppins',
  'source-sans-3',
  'source-serif-4',
  'merriweather',
  'playfair-display',
  'lora',
  'pt-serif',
  'libre-baskerville',
  'eb-garamond',
  'nunito',
  'raleway',
  'work-sans',
  'dm-sans',
  'space-grotesk',
  'oswald',
  'bebas-neue',
  'roboto-mono',
  'jetbrains-mono',
  'ibm-plex-sans',
  'ibm-plex-mono',
  'fira-code',
];
/** The eight families of the features round (docs/FEATURES.md 3.2), on top of the product round's 26. */
export const FEATURES_FONT_IDS = [
  'geist',
  'geist-mono',
  'instrument-sans',
  'manrope',
  'bricolage-grotesque',
  'schibsted-grotesk',
  'newsreader',
  'fraunces',
];
/** The catalog the rows count: 34 families since the features round. */
export const CATALOG_IDS = [...FONT_IDS, ...FEATURES_FONT_IDS];
const LANE = 'B5a';

export async function run(t) {
  const { page, BASE } = t;
  const F = await t
    .setup('a slide for the font rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.brandSlide ?? t.deck.titleSlide, 'blank');
      t.deck.fontSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.fontSlide);
  await t.clickCard(F);
  await t.clearAll();
  const BOX = await t
    .setup('a text box for the font rows', 'block.insert through the window API', async () => {
      const obj = await t.placeBlock(F, {
        id: 'font-box',
        type: 'text',
        text: 'Renewal terms for the quarter',
        pos: { x: 160, y: 200, w: 900, h: 140 },
      });
      return { ok: Boolean(obj), observed: obj ? obj.id : 'none' };
    })
    .then(() => 'font-box');

  /** The Font control's state on the tail with the box selected: absent, disabled or live. */
  const fontControl = async () => {
    await t.clearAll();
    await t.selectObject(BOX);
    let control = 'toolbar.font';
    if (!(await t.visible(control))) {
      /* the control may sit in More when the tail folded */
      if (await t.visible('toolbar.more')) {
        await t.clickControl('toolbar.more');
        await t.sleep(300);
        if (await t.visible('toolbar.more.toolbar.font')) control = 'toolbar.more.toolbar.font';
        else {
          await t.press('Escape');
          return { state: 'absent' };
        }
      } else return { state: 'absent' };
    }
    const facts = await page.evaluate((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return {
        disabled:
          el?.getAttribute('aria-disabled') === 'true' || el?.hasAttribute('disabled') || false,
        tag: el?.tagName.toLowerCase() ?? null,
        text: el?.textContent?.trim() ?? '',
        chevron: Boolean(el?.querySelector('svg, .ts-tb-chevron, [class*="arrow"]')),
      };
    }, control);
    return { state: facts.disabled ? 'disabled' : 'live', control, ...facts };
  };
  /** Opens the dropdown; answers the state when it cannot. */
  const openDropdown = async () => {
    const f = await fontControl();
    if (f.state !== 'live') return f;
    await t.clickControl(f.control);
    const shown = await t
      .pollUntil(
        () => t.visible('toolbar.font.search'),
        (x) => x,
        6000,
      )
      .catch(() => false);
    /* the list draws once the catalog rows are in (FontPicker.tsx `toolbar.font.list` with
       data-rows; `toolbar.font.loading` while they are not); the first smoke read the plate
       before its rows */
    if (shown)
      await page
        .locator('[data-control="toolbar.font.list"][data-rows]')
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
    /* a plate whose list reads the dispatcher's NotImplementedError has no catalog wired on this
       build (font.list); the rows read not built rather than failed */
    const loading = shown ? await t.textOf('toolbar.font.loading') : null;
    if (loading !== null && t.notImplemented(new Error(loading))) {
      await t.press('Escape');
      return { ...f, state: 'catalog', open: false, loading };
    }
    return { ...f, open: shown };
  };
  const notLive = (f) =>
    f.state === 'catalog'
      ? t.notBuilt('font.list', LANE, `the dropdown opened and its list reads "${f.loading}"`)
      : f.state === 'absent'
        ? t.notBuilt('toolbar.font', LANE, 'no Font control on the text tail')
        : f.state === 'disabled'
          ? t.notBuilt(
              'toolbar.font',
              LANE,
              `the control is drawn disabled on purpose (toolbar-tails.ts 173 to 181, "${f.text}"); a disabled control is not driven, never broken (PRODUCT.md 8.1)`,
            )
          : {
              ok: false,
              observed: `the Font control is live but its dropdown did not open (toolbar.font.search absent)`,
            };
  const familyOfBox = () =>
    page.evaluate((id) => {
      const el = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] [data-run], .ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
      );
      return el ? getComputedStyle(el).fontFamily : null;
    }, BOX);
  const storedFamily = async () => (await t.blockOf(F, BOX))?.block?.typography?.family ?? null;

  await t.step(
    'fonts.dropdown.opens',
    'select the text box, open the Font dropdown, read its groups and rows',
    'the search field, the kit faces under Brand, the used families, the catalog by category, each label in its face',
    async () => {
      const f = await openDropdown();
      if (f.state !== 'live' || !f.open) return notLive(f);
      const facts = await page.evaluate(() => {
        const groups = ['brand', 'used', 'sans', 'serif', 'display', 'mono'].filter((g) =>
          document.querySelector(`[data-control="toolbar.font.group.${g}"]`),
        );
        const rows = [...document.querySelectorAll('[data-control^="toolbar.font.row."]')].map(
          (el) => {
            const id = el.getAttribute('data-control').replace('toolbar.font.row.', '');
            const family = getComputedStyle(el).fontFamily.toLowerCase();
            const label = el.textContent?.trim() ?? '';
            const word = label.split(/\s+/)[0]?.toLowerCase() ?? '';
            return {
              id,
              label,
              inFace: family.includes(word) || family.includes(id.split('-')[0]),
            };
          },
        );
        return {
          groups,
          rows: rows.length,
          notInFace: rows.filter((r) => !r.inFace).map((r) => r.id),
          more: Boolean(document.querySelector('[data-control="toolbar.font.more"]')),
        };
      });
      await t.press('Escape');
      await t.clearAll();
      return {
        ok:
          facts.groups.includes('brand') &&
          facts.groups.includes('sans') &&
          facts.groups.includes('serif') &&
          facts.rows >= 26 &&
          facts.notInFace.length === 0 &&
          facts.more,
        observed: `groups ${facts.groups.join(', ')}; ${facts.rows} rows; labels not drawn in their face ${facts.notInFace.join(', ') || 'none'}; More fonts ${facts.more}`,
      };
    },
  );

  await t.step(
    'fonts.dropdown.apply-selection',
    'pick Roboto in the dropdown; Cmd+Z',
    "the run's typography.family is roboto and it draws in Roboto; Cmd+Z takes it back",
    async () => {
      const f = await openDropdown();
      if (f.state !== 'live' || !f.open) return notLive(f);
      const before = await familyOfBox();
      const storedBefore = await storedFamily();
      const revBefore = (await t.state()).revision;
      if (!(await t.visible('toolbar.font.row.roboto'))) {
        await t.press('Escape');
        return { ok: false, observed: 'no toolbar.font.row.roboto in the open dropdown' };
      }
      await t.clickControl('toolbar.font.row.roboto');
      const stored = await t
        .pollUntil(storedFamily, (x) => x === 'roboto', 8000)
        .catch(storedFamily);
      const drawn = await t
        .pollUntil(familyOfBox, (x) => /roboto/i.test(x ?? ''), 8000)
        .catch(familyOfBox);
      await t.settled();
      /* the family read comes from the optimistic document; the revision moves with the ack */
      const revAfter = await t
        .pollUntil(
          async () => (await t.state()).revision,
          (r) => r !== revBefore,
          8000,
        )
        .catch(async () => (await t.state()).revision);
      await t.clearAll();
      await t.press('Meta+z');
      const undone = await t
        .pollUntil(storedFamily, (x) => x === storedBefore, 8000)
        .catch(storedFamily);
      await t.settled();
      return {
        ok:
          stored === 'roboto' &&
          /roboto/i.test(drawn ?? '') &&
          revAfter === revBefore + 1 &&
          undone === storedBefore,
        observed: `family ${storedBefore ?? 'none'} -> ${stored}; drawn ${before} -> ${drawn}; revision ${revBefore} -> ${revAfter}; after Cmd+Z ${undone ?? 'none'}`,
      };
    },
  );

  await t.step(
    'fonts.dropdown.search',
    'type mer into the search field',
    'Merriweather alone is listed',
    async () => {
      const f = await openDropdown();
      if (f.state !== 'live' || !f.open) return notLive(f);
      await t.clickControl('toolbar.font.search');
      await t.typeHuman('mer');
      await t.sleep(400);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="toolbar.font.row."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control').replace('toolbar.font.row.', '')),
      );
      await t.press('Escape');
      await t.clearAll();
      return {
        ok: rows.length === 1 && rows[0] === 'merriweather',
        observed: `rows ${rows.join(', ') || 'none'}`,
      };
    },
  );

  await t.step(
    'fonts.format-menu.row',
    'Format > Text > Font with the box selected',
    'the same dropdown opens',
    async () => {
      await t.clearAll();
      await t.selectObject(BOX);
      const r = await t.reachRow('format', 'format.text', 'format.text.font');
      if (!r.present) {
        await t.advancedBack('Format > Text > Font');
        return t.notBuilt('format.text.font', LANE, 'no Font row under Format > Text');
      }
      await t.menuPath('format', 'format.text', 'format.text.font');
      const open = await t
        .pollUntil(
          () => t.visible('toolbar.font.search'),
          (x) => x,
          6000,
        )
        .catch(() => false);
      await t.press('Escape');
      await t.advancedBack('Format > Text > Font');
      return {
        ok: open,
        observed: `${r.switched ? 'with the switch on; ' : ''}dropdown open ${open}`,
      };
    },
  );

  await t.step(
    'fonts.more-fonts.licence',
    'More fonts at the foot of the dropdown',
    'the dialog lists every family of the catalog (34 with the features round) with a licence line and a link each',
    async () => {
      const f = await openDropdown();
      if (f.state !== 'live' || !f.open) return notLive(f);
      if (!(await t.visible('toolbar.font.more'))) {
        await t.press('Escape');
        return { ok: false, observed: 'no More fonts row at the foot of the dropdown' };
      }
      await t.clickControl('toolbar.font.more');
      await t.waitControl('dialog.moreFonts', 8000);
      const facts = await page.evaluate((ids) => {
        const rows = ids.filter((id) =>
          document.querySelector(`[data-control="dialog.moreFonts.row.${id}"]`),
        );
        const licences = ids.map((id) => {
          const el = document.querySelector(`[data-control="dialog.moreFonts.licence.${id}"]`);
          const text = el?.textContent ?? '';
          return {
            id,
            ok:
              /SIL Open Font License 1\.1|Apache License 2\.0/.test(text) &&
              Boolean(
                el?.querySelector('a[href]') || el?.closest('a[href]') || el?.matches('a[href]'),
              ),
          };
        });
        return {
          rows: rows.length,
          licencesOk: licences.filter((l) => l.ok).length,
          missing: licences.filter((l) => !l.ok).map((l) => l.id),
        };
      }, CATALOG_IDS);
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.moreFonts"]', 4000);
      await t.clearAll();
      return {
        ok: facts.rows === CATALOG_IDS.length && facts.licencesOk === CATALOG_IDS.length,
        observed: `${facts.rows} of ${CATALOG_IDS.length} rows; ${facts.licencesOk} licence lines with a link; missing ${facts.missing.join(', ') || 'none'}`,
      };
    },
  );

  await t.step(
    'fonts.face.reload-and-show',
    'apply Roboto, reload the editor, read the box, enter the show and read it there',
    'the face survives the reload and draws in the show',
    async () => {
      const f = await openDropdown();
      if (f.state !== 'live' || !f.open) return notLive(f);
      if (!(await t.visible('toolbar.font.row.roboto'))) {
        await t.press('Escape');
        return { ok: false, observed: 'no toolbar.font.row.roboto in the open dropdown' };
      }
      await t.clickControl('toolbar.font.row.roboto');
      await t.pollUntil(storedFamily, (x) => x === 'roboto', 8000).catch(() => undefined);
      await t.settled();
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#${F}`);
      await t.settled();
      await t.clickCard(F);
      const afterReload = await t
        .pollUntil(familyOfBox, (x) => /roboto/i.test(x ?? ''), 8000)
        .catch(familyOfBox);
      await t.clickControl('present.open');
      const inShow = await t
        .pollUntil(
          () => t.has('[data-control="present.show"]'),
          (x) => x,
          10_000,
        )
        .catch(() => false);
      await t.sleep(500);
      const inShowFamily = await page.evaluate((id) => {
        const el = document.querySelector(
          `.ts-stagewrap.is-present .pt-slide:not(.is-leaving) [data-block="${id}"]`,
        );
        return el ? getComputedStyle(el.querySelector('[data-run]') ?? el).fontFamily : null;
      }, BOX);
      await t.press('Escape');
      await t.waitGone('[data-control="present.show"]', 8000);
      /* the box back to the theme's face for the rows after */
      const s = await t.settled();
      await t
        .invoke('block.set', {
          baseRevision: s.revision,
          slideId: F,
          blockId: BOX,
          path: '/typography/family',
        })
        .catch(() => undefined);
      await t.settled();
      return {
        ok: /roboto/i.test(afterReload ?? '') && inShow && /roboto/i.test(inShowFamily ?? ''),
        observed: `after the reload ${afterReload}; show entered ${inShow}, family ${inShowFamily}`,
      };
    },
  );

  await t.step(
    'fonts.agent.font-list',
    'font.list on the window API, then over HTTP with the bearer',
    'every family of the catalog (34 with the features round) with a licence each way',
    async () => {
      const actions = await t.windowActions();
      if (!actions.has('font.list'))
        return t.notBuilt('font.list', LANE, 'the window API lists no font.list action');
      const rowsOf = (answer) => {
        const list = answer?.fonts ?? answer?.items ?? answer?.rows ?? answer;
        return Array.isArray(list) ? list : [];
      };
      const got = await t.invoke('font.list', {}).catch((e) => ({ error: String(e), raw: e }));
      if (got?.raw && t.notImplemented(got.raw))
        return t.notBuilt(
          'font.list',
          LANE,
          `the window transport answers ${String(got.error).split('\n')[0]}`,
        );
      const rows = rowsOf(got);
      const licences = rows.filter(
        (r) => typeof r.licence === 'string' || typeof r.license === 'string',
      ).length;
      const http = await t.httpAction('font.list', {});
      const httpRows = http.noBearer ? null : rowsOf(http.body);
      return {
        ok:
          rows.length === CATALOG_IDS.length &&
          licences === CATALOG_IDS.length &&
          httpRows !== null &&
          httpRows.length === CATALOG_IDS.length,
        observed: `window API: ${rows.length} rows, ${licences} with a licence${got?.error ? ` (${got.error})` : ''}; HTTP ${http.noBearer ? 'not driven: no bearer for this origin' : `${http.status}, ${httpRows?.length ?? 'no'} rows`}`,
      };
    },
  );
  await featuresRound(t, { F, BOX, openDropdown, notLive, familyOfBox, storedFamily });
}

/**
 * The features round, ship one (docs/FEATURES.md 3.1 items 2, 3 and 5, 3.2, 3.5; the rows
 * `fonts.links.licence-v4-1` to `fonts.table.takes-family`): the v4.1 licence link in More fonts,
 * 'Inter Fallback' second in the sheet's stack, the display features on Inter alone, Geist and
 * Geist Mono and the six families in the dropdown, the P1 search over the category and a table
 * taking a family. The dropdown is the product round's (B1 owns the picker's tree, B2 the files);
 * a dropdown that is not live reads the product round's not built sentence, and the deck's title
 * heading is the heading the display rows read.
 */
async function featuresRound(t, h) {
  const { page } = t;
  const { F, BOX } = h;
  const ROW = 'B2';
  await t.clickCard(F);
  await t.clearAll();
  /** The rows of the open dropdown grouped by their group container, with the visible ones. */
  const dropdownRows = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-control^="toolbar.font.row."]')];
      return rows.map((el) => ({
        id: el.getAttribute('data-control').replace('toolbar.font.row.', ''),
        visible: el.getClientRects().length > 0,
        group:
          el
            .closest('[data-control^="toolbar.font.group."]')
            ?.getAttribute('data-control')
            ?.replace('toolbar.font.group.', '') ?? null,
      }));
    });
  /** Picks a family in the open dropdown for the selected block; answers whether the row was there. */
  const pickRow = async (id) => {
    if (!(await t.visible(`toolbar.font.row.${id}`))) {
      await t.clickControl('toolbar.font.search').catch(() => undefined);
      await t.typeHuman(id.split('-')[0]);
      await t.sleep(400);
    }
    if (!(await t.visible(`toolbar.font.row.${id}`))) {
      await t.press('Escape');
      return false;
    }
    await t.clickControl(`toolbar.font.row.${id}`);
    await t.settled();
    return true;
  };
  const loadedFace = (family) =>
    page.evaluate(
      (name) =>
        [...document.fonts].some(
          (f) => f.family.replace(/["']/g, '') === name && f.status === 'loaded',
        ),
      family,
    );
  const featuresOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontFeatureSettings : null;
    }, selector);
  /** The title slide's heading run and its block. */
  const heading = async () => {
    await t.clickCard(t.deck.titleSlide);
    await t.clearAll();
    const run = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
          ),
        ]
          .map((el) => el.getAttribute('data-run') ?? '')
          .find((r) => /heading/.test(r)) ?? null,
    );
    const block = run ? await t.blockOfRun(run) : null;
    return {
      run,
      block,
      selector: run ? `.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]` : null,
    };
  };
  /** The dropdown opened on a block selected as an object; answers the dropdown facts. */
  const openOn = async (id) => {
    await t.clearAll();
    await t.selectObject(id);
    let control = 'toolbar.font';
    if (!(await t.visible(control))) {
      if (await t.visible('toolbar.more')) {
        await t.clickControl('toolbar.more');
        await t.sleep(300);
        control = 'toolbar.more.toolbar.font';
      }
    }
    if (!(await t.visible(control))) return { state: 'absent', control };
    const disabled = await page.evaluate((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      return el?.getAttribute('aria-disabled') === 'true' || el?.hasAttribute('disabled') || false;
    }, control);
    if (disabled) return { state: 'disabled', control, text: await t.textOf(control) };
    await t.clickControl(control);
    const shown = await t
      .pollUntil(
        () => t.visible('toolbar.font.search'),
        (x) => x,
        6000,
      )
      .catch(() => false);
    if (shown)
      await page
        .locator('[data-control="toolbar.font.list"][data-rows]')
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
    return { state: 'live', control, open: shown };
  };

  await t.step(
    'fonts.links.licence-v4-1',
    "More fonts; read the Inter licence link's href and every href of the dialog",
    'the href is https://github.com/rsms/inter/blob/v4.1/LICENSE.txt and no href names v4.001',
    async () => {
      const f = await h.openDropdown();
      if (f.state !== 'live' || !f.open) return h.notLive(f);
      if (!(await t.visible('toolbar.font.more'))) {
        await t.press('Escape');
        return { ok: false, observed: 'no More fonts row at the foot of the dropdown' };
      }
      await t.clickControl('toolbar.font.more');
      await t.waitControl('dialog.moreFonts', 8000);
      const facts = await page.evaluate(() => {
        const dialog =
          document.querySelector('[data-control="dialog.moreFonts"]')?.closest('[role="dialog"]') ??
          document.querySelector('[data-control="dialog.moreFonts"]');
        const inter = document.querySelector('[data-control="dialog.moreFonts.licence.inter"]');
        const link =
          inter?.querySelector('a[href]') ??
          inter?.closest('a[href]') ??
          (inter?.matches('a[href]') ? inter : null);
        const hrefs = [...(dialog?.querySelectorAll('a[href]') ?? [])].map(
          (a) => a.getAttribute('href') ?? '',
        );
        return {
          inter: link?.getAttribute('href') ?? null,
          hrefs,
          stale: hrefs.filter((x) => /v4\.001/.test(x)),
        };
      });
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.moreFonts"]', 4000);
      await t.clearAll();
      const want = 'https://github.com/rsms/inter/blob/v4.1/LICENSE.txt';
      return {
        ok: facts.inter === want && facts.stale.length === 0,
        observed: `the Inter licence href ${facts.inter ?? 'none'} (wanted ${want}); ${facts.hrefs.length} hrefs in the dialog, naming v4.001: ${facts.stale.join(', ') || 'none'}${facts.inter === want ? '' : ` (FEATURES.md 3.1 item 2, ${ROW}; the one line of font-picker-model.ts lands in B1's commit)`}`,
      };
    },
  );

  await t.step(
    'fonts.fallback.in-stack',
    "read the sheet root's computed font-family and document.fonts",
    "the stack lists 'Inter Fallback' second and document.fonts lists the face",
    async () => {
      const facts = await page.evaluate(() => {
        const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
        const root = sheet?.closest('.ts-sheet') ?? sheet;
        const family = root ? getComputedStyle(root).fontFamily : null;
        const stack = family
          ? family.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''))
          : [];
        const faces = [...document.fonts].map((f) => f.family.replace(/["']/g, ''));
        return {
          family,
          stack,
          fallbackFace: faces.includes('Inter Fallback'),
          faces: [...new Set(faces)].slice(0, 12),
        };
      });
      return {
        ok: facts.stack[1] === 'Inter Fallback' && facts.fallbackFace,
        observed: `computed font-family "${facts.family}" (second "${facts.stack[1] ?? 'none'}"); document.fonts lists Inter Fallback ${facts.fallbackFace} (faces ${facts.faces.join(', ')})${facts.stack[1] === 'Inter Fallback' ? '' : ` (FEATURES.md 3.1 item 3, ${ROW})`}`,
      };
    },
  );

  await t.step(
    'fonts.display-features.inter-only',
    'the title heading to Playfair Display through the window API, then back to Inter; the kit display face to Fraunces',
    'the heading computes font-feature-settings normal on Playfair Display, "cv11", "ss01" on Inter, and normal on every heading with the kit on Fraunces',
    async () => {
      /* the family is written through the window API (block.set /typography/family, a setup
         write): the row measures the renderer's gate on the face (FEATURES.md 3.1 item 5), not
         the picker, and the title heading's Font control is drawn disabled on purpose */
      const head = await heading();
      if (!head.block) {
        await t.clickCard(F);
        return { ok: false, observed: 'no heading run on the title slide' };
      }
      const setFamily = async (value) => {
        const s = await t.settled();
        try {
          await t.invoke('block.set', {
            baseRevision: s.revision,
            slideId: t.deck.titleSlide,
            blockId: head.block,
            path: '/typography/family',
            ...(value === undefined ? {} : { value }),
          });
          await t.settled();
          return true;
        } catch (error) {
          return String(error).split('\n')[0].slice(0, 120);
        }
      };
      try {
        const before = await featuresOf(head.selector);
        const wrote = await setFamily('playfair-display');
        const onPlayfair = await t
          .pollUntil(
            () => featuresOf(head.selector),
            (x) => x === 'normal',
            8000,
          )
          .catch(() => featuresOf(head.selector));
        const back = await setFamily(undefined);
        const onInter = await t
          .pollUntil(
            () => featuresOf(head.selector),
            (x) => /cv11/.test(x ?? '') && /ss01/.test(x ?? ''),
            8000,
          )
          .catch(() => featuresOf(head.selector));
        /* the kit half: brand.set /fonts/display fraunces (a setup write), read, and restored */
        const actions = await t.windowActions();
        let kit = 'brand.set is not on the window transport';
        let onFraunces = null;
        if (actions.has('brand.set')) {
          const s = await t.settled();
          try {
            await t.invoke('brand.set', {
              path: '/fonts/display',
              value: 'fraunces',
              baseRevision: s.revision,
            });
            await t.settled();
            onFraunces = await t
              .pollUntil(
                () => featuresOf(head.selector),
                (x) => x === 'normal',
                8000,
              )
              .catch(() => featuresOf(head.selector));
            kit = `brand.set /fonts/display fraunces wrote; the heading computes "${onFraunces}"`;
            const s2 = await t.settled();
            await t
              .invoke('brand.set', { path: '/fonts/display', baseRevision: s2.revision })
              .catch(() => undefined);
            await t.settled();
          } catch (error) {
            kit = `brand.set /fonts/display fraunces refused: ${String(error).split('\n')[0].slice(0, 120)}`;
          }
        }
        return {
          ok:
            wrote === true &&
            onPlayfair === 'normal' &&
            back === true &&
            /cv11/.test(onInter ?? '') &&
            /ss01/.test(onInter ?? '') &&
            onFraunces === 'normal',
          observed: `before "${before}"; Playfair Display ${wrote === true ? 'written' : `refused: ${wrote}`}: "${onPlayfair}"; back to Inter ${back === true ? 'written' : `refused: ${back}`}: "${onInter}"; the kit: ${kit}${onPlayfair === 'normal' ? '' : ` (FEATURES.md 3.1 item 5, ${ROW})`}`,
        };
      } finally {
        await t.clickCard(F);
        await t.clearAll();
      }
    },
  );

  await t.step(
    'fonts.catalog.geist',
    'open the dropdown; read the Geist rows; pick Geist on the text box',
    'Geist under Sans serif and Geist Mono under Monospace; the box computes Geist and one Geist face loads',
    async () => {
      await t.clickCard(F);
      const f = await h.openDropdown();
      if (f.state !== 'live' || !f.open) return h.notLive(f);
      const rows = await dropdownRows();
      const geist = rows.find((r) => r.id === 'geist');
      const mono = rows.find((r) => r.id === 'geist-mono');
      if (!geist && !mono) {
        await t.press('Escape');
        await t.clearAll();
        return t.notBuilt(
          'toolbar.font.row.geist',
          ROW,
          `the dropdown lists ${rows.length} rows and no Geist (FEATURES.md 3.2)`,
        );
      }
      const picked = await pickRow('geist');
      const stored = await t
        .pollUntil(h.storedFamily, (x) => x === 'geist', 8000)
        .catch(h.storedFamily);
      const drawn = await t
        .pollUntil(h.familyOfBox, (x) => /geist/i.test(x ?? ''), 8000)
        .catch(h.familyOfBox);
      const loaded = await t
        .pollUntil(
          () => loadedFace('Geist'),
          (x) => x,
          8000,
        )
        .catch(() => false);
      await t.clearAll();
      const s = await t.settled();
      await t
        .invoke('block.set', {
          baseRevision: s.revision,
          slideId: F,
          blockId: BOX,
          path: '/typography/family',
        })
        .catch(() => undefined);
      await t.settled();
      return {
        ok:
          geist?.group === 'sans' &&
          mono?.group === 'mono' &&
          picked &&
          stored === 'geist' &&
          /geist/i.test(drawn ?? '') &&
          loaded,
        observed: `Geist in group ${geist?.group ?? 'absent'}, Geist Mono in group ${mono?.group ?? 'absent'}; picked ${picked}: family ${stored}, drawn ${drawn}, a Geist face loaded ${loaded}; the PDF half is fonts.export.pdf-face's deck`,
      };
    },
  );

  await t.step(
    'fonts.catalog.six-families',
    'read the six rows and their groups; Fraunces on the title heading',
    "Instrument Sans, Manrope, Schibsted Grotesk and Bricolage Grotesque under Sans serif, Newsreader and Fraunces under Serif (Google's categories, the catalog's rule); the heading computes Fraunces and it loads",
    async () => {
      await t.clickCard(F);
      const f = await h.openDropdown();
      if (f.state !== 'live' || !f.open) return h.notLive(f);
      const rows = await dropdownRows();
      const want = {
        'instrument-sans': 'sans',
        manrope: 'sans',
        'schibsted-grotesk': 'sans',
        /* Google's METADATA.pb categories at the pinned commit, the catalog's rule since the product
           round (build/b2.md 1.6, R3): Bricolage Grotesque is sans and Fraunces serif, not the
           Display group docs/FEATURES.md 3.2 wrote them under */
        'bricolage-grotesque': 'sans',
        fraunces: 'serif',
        newsreader: 'serif',
      };
      const found = Object.entries(want).map(([id, group]) => {
        const row = rows.find((r) => r.id === id);
        return { id, group: row?.group ?? null, ok: row?.group === group };
      });
      await t.press('Escape');
      await t.clearAll();
      if (found.every((x) => x.group === null))
        return t.notBuilt(
          'toolbar.font.row.fraunces',
          ROW,
          `none of the six families is a row of the dropdown (${rows.length} rows; FEATURES.md 3.2)`,
        );
      const head = await heading();
      let drawn = null;
      let loaded = false;
      let picked = false;
      if (head.block) {
        const g = await openOn(head.block);
        if (g.open) picked = await pickRow('fraunces');
        drawn = await t
          .pollUntil(
            () =>
              page.evaluate((sel) => {
                const el = document.querySelector(sel);
                return el ? getComputedStyle(el).fontFamily : null;
              }, head.selector),
            (x) => /fraunces/i.test(x ?? ''),
            8000,
          )
          .catch(() => null);
        loaded = await t
          .pollUntil(
            () => loadedFace('Fraunces'),
            (x) => x,
            8000,
          )
          .catch(() => false);
        await t.clearAll();
        const s = await t.settled();
        await t
          .invoke('block.set', {
            baseRevision: s.revision,
            slideId: t.deck.titleSlide,
            blockId: head.block,
            path: '/typography/family',
          })
          .catch(() => undefined);
        await t.settled();
      }
      await t.clickCard(F);
      return {
        ok: found.every((x) => x.ok) && picked && /fraunces/i.test(drawn ?? '') && loaded,
        observed: `${found.map((x) => `${x.id} in ${x.group ?? 'no row'}`).join(', ')}; Fraunces on the heading: picked ${picked}, drawn ${drawn ?? 'unread'}, loaded ${loaded}`,
      };
    },
  );

  await t.step(
    'fonts.picker.search-category',
    'type mono in the search; then serif',
    'mono lists the monospace families; serif lists the serifs',
    async () => {
      await t.clickCard(F);
      const MONO = ['roboto-mono', 'jetbrains-mono', 'ibm-plex-mono', 'fira-code'];
      const SERIF = [
        'source-serif-4',
        'merriweather',
        'playfair-display',
        'lora',
        'pt-serif',
        'libre-baskerville',
        'eb-garamond',
      ];
      const search = async (query) => {
        const f = await h.openDropdown();
        if (f.state !== 'live' || !f.open) return null;
        await t.clickControl('toolbar.font.search');
        await t.typeHuman(query);
        await t.sleep(500);
        const rows = (await dropdownRows()).filter((r) => r.visible).map((r) => r.id);
        await t.press('Escape');
        await t.clearAll();
        return rows;
      };
      const mono = await search('mono');
      if (mono === null) return h.notLive(await h.openDropdown());
      const serif = await search('serif');
      const monoOk =
        MONO.every((id) => mono.includes(id)) && mono.every((id) => /mono|code/.test(id));
      const serifOk = SERIF.every((id) => (serif ?? []).includes(id));
      return {
        ok: monoOk && serifOk,
        observed: `"mono" lists ${mono.join(', ') || 'nothing'}; "serif" lists ${(serif ?? []).join(', ') || 'nothing'} (the seven serifs all listed ${serifOk})${serifOk ? '' : ' (FEATURES.md 3.5, B1, P1: the search over the category label)'}`,
      };
    },
  );

  await t.step(
    'fonts.table.takes-family',
    'a table placed through the window API; select it; pick Roboto; read the cells; the Editable text export',
    'typography.family is written on the table, every cell computes Roboto and the PowerPoint names it in the cells',
    async () => {
      await t.clickCard(F);
      await t.clearAll();
      const T = 'font-table';
      const placed = await t.placeBlock(F, {
        id: T,
        type: 'table',
        columns: [{}, {}],
        rows: [{ cells: ['North', 'South'], header: true }, { cells: ['12', '7'] }],
        pos: { x: 160, y: 460, w: 600, h: 160 },
      });
      if (!placed) return { ok: false, observed: 'the table could not be placed' };
      const f = await openOn(T);
      if (f.state !== 'live' || !f.open) {
        await t.clearAll();
        return f.state === 'disabled'
          ? t.notBuilt(
              'toolbar.font',
              'B1',
              `the Font control on a selected table is drawn disabled ("${f.text}"); takesFamily is P1 (FEATURES.md 3.5)`,
            )
          : h.notLive({ ...f, state: f.state });
      }
      const picked = await pickRow('roboto');
      const stored = await t
        .pollUntil(
          async () => (await t.blockOf(F, T))?.block?.typography?.family ?? null,
          (x) => x === 'roboto',
          8000,
        )
        .catch(async () => (await t.blockOf(F, T))?.block?.typography?.family ?? null);
      const cells = await page.evaluate(
        (id) =>
          [
            ...document.querySelectorAll(
              `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] [data-run]`,
            ),
          ].map((el) => getComputedStyle(el).fontFamily),
        T,
      );
      const everyCell = cells.length > 0 && cells.every((c) => /roboto/i.test(c));
      await t.clearAll();
      const pptx = await t.exportPptx({ mode: 'native' });
      let named = null;
      if (pptx.bytes) {
        let entries = t.zipEntries(pptx.bytes);
        const inner =
          [...entries.keys()].find((n) => /\(light, editable\)\.pptx$/.test(n)) ??
          [...entries.keys()].find((n) => /\.pptx$/.test(n));
        if (inner !== undefined) entries = t.zipEntries(entries.get(inner)(true));
        named = [...entries.keys()]
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .some((n) => {
            const xml = entries.get(n)();
            const table = xml.indexOf('<a:tbl>');
            return table >= 0 && /typeface="Roboto"/.test(xml.slice(table));
          });
      }
      return {
        ok: picked && stored === 'roboto' && everyCell && named === true,
        observed: `picked ${picked}: typography.family ${stored ?? 'absent'}; cells ${cells.map((c) => c.split(',')[0]).join(' | ') || 'none'} (all Roboto ${everyCell}); the Editable text export ${pptx.noBearer ? 'not driven: no bearer for this origin' : `${pptx.status}, a table cell naming Roboto ${named}`}`,
      };
    },
  );
}

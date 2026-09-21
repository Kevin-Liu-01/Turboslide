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
    'the dialog lists the 26 families with a licence line and a link each',
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
      }, FONT_IDS);
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.moreFonts"]', 4000);
      await t.clearAll();
      return {
        ok: facts.rows === 26 && facts.licencesOk === 26,
        observed: `${facts.rows} of 26 rows; ${facts.licencesOk} licence lines with a link; missing ${facts.missing.join(', ') || 'none'}`,
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
    '26 rows with a licence each way',
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
        ok: rows.length === 26 && licences === 26 && httpRows !== null && httpRows.length === 26,
        observed: `window API: ${rows.length} rows, ${licences} with a licence${got?.error ? ` (${got.error})` : ''}; HTTP ${http.noBearer ? 'not driven: no bearer for this origin' : `${http.status}, ${httpRows?.length ?? 'no'} rows`}`,
      };
    },
  );
}

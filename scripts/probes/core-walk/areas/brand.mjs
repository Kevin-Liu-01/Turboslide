// The brand kit, the probe's rows (docs/PRODUCT.md 4.1, 4.4, 8.1 `brand.*` with the driver
// `probe --core`): the Brand kit panel from Slide > Change theme, the toolbar Theme button and
// Slide > Edit theme, Use on every slide on a picture, Logo > Remove, the Primary colour typed
// with its live preview and one revision, the colour plate's kit row and its one container id,
// the version history row of a kit change, the six role tooltips, the Background dialog's Enter,
// the two font roles, the counter format, Reset to the deployment's kit, the layout tiles in the
// kit, and brand.set with brand.get on the window API and over HTTP. The file chooser, the second
// browser and the export rows are core/brand.spec.ts, core/share.spec.ts, core/present.spec.ts
// and core/export.spec.ts.
//
// The panel and its ids are B5a's this round (PRODUCT.md 7.1: `panel.brand`, `panel.brand.color.
// <role>.hex`, `panel.brand.font.display`, `panel.brand.reset` and the rest). A row whose control
// is not on the build reads not driven with the control's id (8.1: "a row of a control that does
// not exist is not driven"), never failed and never passed; a row whose control exists is judged.

export const NAME = 'brand';
export const IDS = [
  'brand.panel.opens',
  'brand.logo.use-on-every-slide',
  'brand.logo.remove',
  'brand.colors.primary-live',
  'brand.colors.palette-row',
  'brand.colors.control-ids-unique',
  'brand.colors.version-history-entry',
  'brand.colors.role-tooltips',
  'brand.background.enter-keeps-open',
  'brand.fonts.roles',
  'brand.counter.format',
  'brand.reset.default-kit',
  'brand.layout.tiles-in-kit',
  'brand.agent.set-get',
];

/** The six roles of the kit and the token each maps to (PRODUCT.md 4.1). */
const ROLES = [
  ['text', 'ink'],
  ['background', 'paper'],
  ['caption', 'ink-2'],
  ['hint', 'titanium'],
  ['primary', 'blue'],
  ['accent', 'accent'],
];
const PRIMARY = '#0b3d91';
const LANE = 'B5a';

/** Thrown inside a helper when a control's catalog or handler has not landed; the step reads not built. */
class NotBuiltError extends Error {
  constructor(control, why) {
    super(`not built: ${control}`);
    this.control = control;
    this.why = why;
  }
}

export async function run(t) {
  const { page } = t;
  /**
   * A swatch's tooltip under a person's pointer: away from the panel first (the manager re-arms
   * on a fresh enter), then six plain pointer steps from the left into the swatch's centre and
   * the plate read after the hover delay. The toolkit's stepped hover read the first swatch's
   * plate and none of the five after it in the runs of record, while every one of the six read
   * this way by hand (VERIFICATION.md product pass 2, finding 10).
   */
  const hoverSwatch = async (control) => {
    const el = page.locator(`[data-control="${control}"]`).first();
    /* the panel may stand scrolled by an earlier row: a swatch below the fold is hovered by no
       pointer move, so it comes into view first (the scroll itself hides any plate up, which is
       the manager's rule and what a person's scroll does) */
    await el.scrollIntoViewIfNeeded().catch(() => undefined);
    await t.sleep(150);
    const r = await el.boundingBox();
    if (!r) return null;
    await page.mouse.move(720, 500);
    await t.sleep(450);
    const y = r.y + r.height / 2;
    const x0 = r.x - 30;
    const x1 = r.x + r.width / 2;
    await page.mouse.move(x0, y);
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / 6, y);
      await t.sleep(30);
    }
    /* the plate's text once it is drawn: the tooltip layer's box is the reading (the manager's
       fade is a style, not the words), read again once when the delay ran long */
    const read = () =>
      page.evaluate(() => {
        const tip = document.querySelector('.pt-tip');
        if (!tip || tip.getClientRects().length === 0) return null;
        if (getComputedStyle(tip).display === 'none' || tip.hidden) return null;
        const text = tip.textContent?.trim() ?? '';
        return text === '' ? null : text;
      });
    await t.sleep(600);
    const first = await read();
    if (first !== null) return first;
    await t.sleep(400);
    const second = await read();
    if (second !== null) return second;
    /* what the layer held, for the step's observed line */
    const facts = await page.evaluate(() => {
      const tip = document.querySelector('.pt-tip');
      if (!tip) return 'no plate element';
      const cs = getComputedStyle(tip);
      return `plate rects ${tip.getClientRects().length}, hidden ${tip.hidden}, display ${cs.display}, opacity ${cs.opacity}, text "${(tip.textContent ?? '').trim().slice(0, 30)}"`;
    });
    return `none (${facts}; swatch at ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} by ${Math.round(r.height)} in a ${page.viewportSize()?.width ?? 0} by ${page.viewportSize()?.height ?? 0} viewport)`;
  };
  const T = t.deck.titleSlide;
  const B = await t
    .setup('a slide for the brand rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.viewSlide ?? t.deck.titleSlide, 'split');
      t.deck.brandSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.brandSlide);
  await t.clickCard(B);
  await t.clearAll();

  /**
   * The kit record the deck carries: brand.get on the window API where its handler has landed,
   * else deck.info's `brand` field (the schema's output declares it; the window transport's
   * deck.info did not carry it on the first smoke). Null when neither answers a record.
   */
  let brandGetAnswers = null;
  const record = async () => {
    if (brandGetAnswers !== false) {
      const got = await t.invoke('brand.get', {}).catch((e) => ({ __error: e }));
      if (got && got.__error === undefined) {
        brandGetAnswers = true;
        const kit = got.brand ?? got.kit ?? got;
        return kit && typeof kit === 'object' && Object.keys(kit).length > 0 ? kit : null;
      }
      if (t.notImplemented(got.__error)) brandGetAnswers = false;
    }
    return (await t.invoke('deck.info').catch(() => ({})))?.brand ?? null;
  };
  /** A token of the editor's sheet, as drawn. */
  const token = (name) => t.sheetVar(`--${name}`);
  /** The panel's route: Slide > Change theme. Answers which panel opened, or null. */
  const openPanel = async () => {
    if (await t.visible('panel.brand')) return 'panel.brand';
    const r = await t.reachRow('slide', 'slide.changeTheme');
    if (!r.present) return null;
    await t.menuPath('slide', 'slide.changeTheme');
    return t
      .pollUntil(
        async () =>
          (await t.visible('panel.brand'))
            ? 'panel.brand'
            : (await t.visible('panel.themes'))
              ? 'panel.themes'
              : null,
        (x) => x !== null,
        8000,
      )
      .catch(() => null);
  };
  const closePanel = async () => {
    for (const id of ['panel.brand.close', 'panel.themes.close'])
      if (await t.visible(id)) await t.clickControl(id);
    await t.sleep(200);
  };
  /**
   * Opens the Brand kit panel or answers the not built reading: the round's panel replaces the
   * Themes panel's body under Slide > Change theme (PRODUCT.md 4.1), so a build that still opens
   * `panel.themes` alone has not landed it.
   */
  const brandPanel = async () => {
    const which = await openPanel();
    if (which === 'panel.brand') return null;
    return t.notBuilt(
      'panel.brand',
      LANE,
      which === 'panel.themes'
        ? 'Slide > Change theme opened the Themes panel (panel.themes, the two appearance tiles)'
        : 'Slide > Change theme opened no panel',
    );
  };
  /** Types a hex into a panel field at human speed; `commit` presses Enter. */
  const typeHex = async (control, hex, commit) => {
    await t.clickControl(control);
    await t.press('Meta+a');
    await t.typeHuman(hex);
    if (commit) await t.press('Enter');
    await t.sleep(300);
  };
  const snackbarUndo = async () => {
    const said = await t.snackbarWithin(4000).catch(() => null);
    const undo = await t.visible('snackbar.action');
    const label = undo ? await t.textOf('snackbar.action') : null;
    return { said, undo: undo && /undo/i.test(label ?? '') };
  };

  await t.step(
    'brand.panel.opens',
    'Slide > Change theme, the toolbar Theme button and Slide > Edit theme',
    'the Brand kit panel opens each time with its nine sections and the frame rows carry their sentences',
    async () => {
      await t.clearAll();
      const missing = await brandPanel();
      if (missing) return missing;
      const readPanel = () =>
        page.evaluate(() => {
          const panel = document.querySelector('[data-control="panel.brand"]');
          const text = panel?.textContent ?? '';
          const heads = [...(panel?.querySelectorAll('h2, h3, h4, .ts-panel-section-head') ?? [])]
            .map((h) => h.textContent?.trim() ?? '')
            .filter(Boolean);
          return {
            text,
            heads,
            reset:
              panel?.querySelector('[data-control="panel.brand.reset"]')?.textContent?.trim() ??
              null,
          };
        });
      const first = await readPanel();
      const sections = [
        'Appearance',
        'Logo',
        'Colors',
        'Fonts',
        'Footer',
        'Slide numbers',
        'Frame',
        'Words that never translate',
      ];
      const missingSections = sections.filter((s) => !first.heads.some((h) => h.startsWith(s)));
      const frameSentences = [
        'Rails: the margins at the sides of every slide',
        'Rules: the thin lines that frame the slide',
        'Crosses: the small marks at the frame',
      ].filter((s) => !first.text.includes(s));
      const resetOk = /^Reset to .+/.test(first.reset ?? '');
      await closePanel();
      /* the toolbar Theme button */
      await t.clickControl('toolbar.theme');
      const fromToolbar = await t
        .pollUntil(
          () => t.visible('panel.brand'),
          (x) => x,
          6000,
        )
        .catch(() => false);
      await closePanel();
      /* Slide > Edit theme, the Later stub flipped to the panel (model.ts 2007) */
      const edit = await t.reachRow('slide', 'slide.editTheme');
      let fromEdit = false;
      if (edit.present) {
        await t.menuPath('slide', 'slide.editTheme');
        fromEdit = await t
          .pollUntil(
            () => t.visible('panel.brand'),
            (x) => x,
            6000,
          )
          .catch(() => false);
        await closePanel();
      }
      await t.advancedBack('Slide > Edit theme');
      return {
        ok:
          missingSections.length === 0 &&
          frameSentences.length === 0 &&
          resetOk &&
          fromToolbar &&
          fromEdit,
        observed: `sections missing ${missingSections.join(', ') || 'none'} (heads ${first.heads.slice(0, 12).join(' | ')}); frame sentences missing ${frameSentences.length}; reset "${first.reset ?? 'none'}"; from the toolbar ${fromToolbar}; from Slide > Edit theme ${edit.present ? fromEdit : 'no row'}`,
      };
    },
  );

  const PIC = await t
    .setup(
      'a picture for the logo rows',
      'asset.add and block.insert through the window API',
      async () => {
        const obj = await t.placePicture(B, { x: 1100, y: 500, w: 240, h: 160 }, 'brand-logo');
        return { ok: Boolean(obj), observed: obj ? `${obj.id}` : 'no picture' };
      },
    )
    .then(() => 'brand-logo');
  /** Whether the footer band of the current slide draws a picture logo, and what. */
  const footerLogo = () =>
    page.evaluate(() => {
      const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
      const mark = stage?.querySelector('.wordmark, [data-slot="footer-logo"], .ts-footer-logo');
      if (!mark || mark.getClientRects().length === 0) return { drawn: false, kind: 'none' };
      const img = mark.querySelector('img');
      if (img) return { drawn: true, kind: 'picture', src: img.getAttribute('src')?.slice(0, 60) };
      const svg = mark.querySelector('svg use');
      return { drawn: true, kind: svg ? 'default' : 'other' };
    });

  await t.step(
    'brand.logo.use-on-every-slide',
    'right click the picture > Use on every slide; read two slides; Cmd+Z',
    "every slide's footer draws the picture, the snackbar carries Undo, Cmd+Z removes it from every slide",
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      await t.selectObject(PIC);
      const b = await t.boxOf(PIC);
      const c = t.center(b.free);
      await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      if (!rows.includes('format.image.useOnEverySlide')) {
        await t.press('Escape');
        return t.notBuilt(
          'format.image.useOnEverySlide',
          LANE,
          `the picture's menu lists ${rows.join(', ')}`,
        );
      }
      const revBefore = (await t.state()).revision;
      await t.clickContextRow('format.image.useOnEverySlide');
      const { said, undo } = await snackbarUndo();
      const rec = await t
        .pollUntil(record, (r) => r?.footer?.logo === 'picture', 8000)
        .catch(record);
      await t.settled();
      const here = await footerLogo();
      await t.clickCard(T);
      const there = await footerLogo();
      await t.clickCard(B);
      await t.clearAll();
      await t.press('Meta+z');
      const back = await t
        .pollUntil(record, (r) => (r?.footer?.logo ?? 'default') !== 'picture', 8000)
        .catch(record);
      await t.settled();
      const revAfter = (await t.state()).revision;
      const gone = await footerLogo();
      return {
        ok:
          rec?.footer?.logo === 'picture' &&
          here.kind === 'picture' &&
          there.kind === 'picture' &&
          undo &&
          (back?.footer?.logo ?? 'default') !== 'picture' &&
          gone.kind !== 'picture',
        observed: `record footer.logo ${rec?.footer?.logo ?? 'none'} (revision ${revBefore} -> ${revAfter}); footer on this slide ${here.kind}, on the title slide ${there.kind}; snackbar "${said ?? 'none'}" with Undo ${undo}; after Cmd+Z footer.logo ${back?.footer?.logo ?? 'none'}, drawn ${gone.kind}`,
      };
    },
  );

  await t.step(
    'brand.logo.remove',
    'Logo > Remove in the panel; read the title slide and the show; Use the default logo after',
    'no logo on the title slide, no wordmark on any slide, none in the show',
    async () => {
      await t.clearAll();
      const missing = await brandPanel();
      if (missing) return missing;
      if (!(await t.visible('panel.brand.logo.remove'))) {
        await closePanel();
        return t.notBuilt('panel.brand.logo.remove', LANE);
      }
      await t.clickControl('panel.brand.logo.remove');
      const rec = await t.pollUntil(record, (r) => r?.mark?.kind === 'none', 8000).catch(record);
      await t.settled();
      await closePanel();
      await t.clickCard(T);
      const title = await page.evaluate(() => {
        const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
        const mark = sheet?.querySelector('.mark, [data-slot="mark"]');
        return { mark: Boolean(mark && mark.getClientRects().length > 0) };
      });
      const footer = await footerLogo();
      /* the show */
      await t.clickControl('present.open');
      const inShow = await t
        .pollUntil(
          () => t.has('[data-control="present.show"]'),
          (x) => x,
          10_000,
        )
        .catch(() => false);
      await t.sleep(600);
      const showLogo = await page.evaluate(() => {
        const stage = document.querySelector('.ts-stagewrap.is-present .ts-stage');
        const mark = stage?.querySelector('.wordmark');
        const slideMark = stage?.querySelector('.pt-slide:not(.is-leaving) .mark');
        const drawn = (el) =>
          Boolean(el && el.getClientRects().length > 0 && el.children.length > 0);
        return { footer: drawn(mark), mark: drawn(slideMark) };
      });
      await t.press('Escape');
      await t.waitGone('[data-control="present.show"]', 8000);
      /* the default logo back, so the rows after read the deployment's kit */
      await brandPanel();
      if (await t.visible('panel.brand.logo.default'))
        await t.clickControl('panel.brand.logo.default');
      await t.settled();
      await closePanel();
      await t.clickCard(B);
      return {
        ok:
          rec?.mark?.kind === 'none' &&
          !title.mark &&
          footer.kind === 'none' &&
          inShow &&
          !showLogo.footer &&
          !showLogo.mark,
        observed: `record mark.kind ${rec?.mark?.kind ?? 'none'} footer.logo ${rec?.footer?.logo ?? 'none'}; title slide mark drawn ${title.mark}; footer ${footer.kind}; show entered ${inShow}, footer logo ${showLogo.footer}, slide mark ${showLogo.mark}`,
      };
    },
  );

  await t.step(
    'brand.colors.primary-live',
    'Colors > Primary: type #0b3d91, read the sheet before Enter, Enter, read another slide, Cmd+Z',
    'the sheet previews while typing, Enter commits one revision, every slide follows, Cmd+Z reverts',
    async () => {
      await t.clearAll();
      const missing = await brandPanel();
      if (missing) return missing;
      const field = 'panel.brand.color.primary.hex';
      if (!(await t.visible(field))) {
        await closePanel();
        return t.notBuilt(field, LANE);
      }
      const before = await token('blue');
      const revBefore = (await t.settled()).revision;
      await typeHex(field, PRIMARY, false);
      const preview = await t
        .pollUntil(
          () => token('blue'),
          (v) => v !== null && v.toLowerCase().includes(PRIMARY),
          3000,
        )
        .catch(() => token('blue'));
      const revDuring = (await t.state()).revision;
      await t.press('Enter');
      const revAfter = await t.pollUntil(
        async () => (await t.state()).revision,
        (r) => r !== revBefore,
        8000,
      );
      await t.settled();
      const rec = await record();
      await closePanel();
      await t.clickCard(T);
      const other = await token('blue');
      await t.clickCard(B);
      await t.clearAll();
      await t.press('Meta+z');
      const reverted = await t
        .pollUntil(
          () => token('blue'),
          (v) => v === before,
          8000,
        )
        .catch(() => token('blue'));
      await t.settled();
      /* the record is a fact for the ledger: the row's checks are the preview, the one revision,
         the other slide and the undo (PRODUCT.md 8.1) */
      return {
        ok:
          (preview ?? '').toLowerCase().includes(PRIMARY) &&
          revDuring === revBefore &&
          revAfter === revBefore + 1 &&
          (other ?? '').toLowerCase().includes(PRIMARY) &&
          reverted === before,
        observed: `--blue ${before} -> ${preview} while typing (revision ${revBefore} -> ${revDuring}); after Enter revision ${revAfter}, record ${rec ? JSON.stringify(rec.colors ?? null) : 'not readable on this build'}; the title slide reads ${other}; after Cmd+Z ${reverted}`,
      };
    },
  );

  /** The heading block of the title slide, for the plate's write. */
  const headBlock = async () => {
    await t.clickCard(T);
    const runs = await t.runs();
    const head = runs.find((r) => /heading/.test(r)) ?? runs[0];
    return { run: head, block: (await t.blockOfRun(head)) ?? 'lead' };
  };
  await t.step(
    'brand.colors.palette-row',
    'select the heading, open Text color, read the plate, pick the kit primary',
    "the kit's six colours first with the role and hex in the tooltip, the tokens second, Custom third; the heading draws in the kit colour",
    async () => {
      await t.clearAll();
      const { block } = await headBlock();
      const selected = await t.selectObject(block);
      if (!selected) return { ok: false, observed: `the heading ${block} could not be selected` };
      /* the heading's text, selected: the Text color plate writes a colour mark on a range (the
         tail's rule, ToolbarTail.tsx; with the object alone selected a heading takes a tone), so
         the row selects the words a seller would paint before it opens the plate */
      await page
        .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-block="${block}"]`)
        .first()
        .dblclick();
      await t.sleep(200);
      await t.press('Meta+a');
      await t.sleep(200);
      await t.tailControl('toolbar.textColor');
      await t.waitControl('toolbar.textColor.plate', 6000).catch(() => undefined);
      const facts = await page.evaluate(() => {
        const menu =
          document.querySelector('[data-control="toolbar.textColor.menu"]') ??
          document.querySelector('[data-control="toolbar.textColor.plate"]');
        const swatches = [...(menu?.querySelectorAll('[data-control^="toolbar.textColor."]') ?? [])]
          .map((el) => el.getAttribute('data-control'))
          .filter((c) => c !== 'toolbar.textColor.plate' && c !== 'toolbar.textColor.menu');
        const kit = swatches.filter((c) => c.startsWith('toolbar.textColor.kit.'));
        const first = swatches.slice(0, kit.length);
        const custom = /Custom/.test(menu?.textContent ?? '');
        return {
          swatches,
          kit,
          kitFirst: kit.length === 6 && first.every((c) => c.startsWith('toolbar.textColor.kit.')),
          custom,
        };
      });
      if (facts.kit.length === 0) {
        await t.press('Escape');
        return {
          ok: false,
          observed: `the plate lists no kit swatch (toolbar.textColor.kit.<role>); swatches ${facts.swatches.slice(0, 8).join(', ')}${facts.swatches.length > 8 ? ', ...' : ''}; Custom ${facts.custom}`,
        };
      }
      const tip = await t.hoverControl('toolbar.textColor.kit.primary');
      const before = await page.evaluate(
        (id) =>
          getComputedStyle(
            document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`) ??
              document.body,
          ).color,
        block,
      );
      const revBefore = (await t.state()).revision;
      await t.clickControl('toolbar.textColor.kit.primary');
      await t
        .pollUntil(
          async () => (await t.state()).revision,
          (r) => r !== revBefore,
          8000,
        )
        .catch(() => undefined);
      await t.settled();
      const blockJson = await t.blockJson(T, block);
      /* the drawn colour: the heading's coloured run span when the write is a mark on the range
         (the span carries `color: var(--blue)`), else the block's own */
      const after = await page.evaluate((id) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
        if (!el) return getComputedStyle(document.body).color;
        const own = getComputedStyle(el).color;
        const span = [...el.querySelectorAll('span, [data-run] *')].find(
          (e) => getComputedStyle(e).color !== own,
        );
        return span ? getComputedStyle(span).color : own;
      }, block);
      /* the stored colour: a `color` field on the block, or a colour mark in its text (`{c:blue}`) */
      const stored = /"color"/.test(blockJson) || /\{c:[a-z0-9#-]+\}/i.test(blockJson);
      await t.clearAll();
      await t.press('Meta+z');
      await t.settled();
      return {
        ok:
          facts.kitFirst &&
          facts.custom &&
          /primary/i.test(tip ?? '') &&
          /#[0-9a-f]{6}/i.test(tip ?? '') &&
          stored &&
          after !== before,
        observed: `swatches ${facts.swatches.length} (kit ${facts.kit.length} first ${facts.kitFirst}; Custom ${facts.custom}); tooltip on the kit primary "${tip ?? 'none'}"; heading color ${before} -> ${after}; stored color ${stored}`,
      };
    },
  );

  await t.step(
    'brand.colors.control-ids-unique',
    'open Text color and count the plate id',
    'toolbar.textColor.plate matches one element and the container is toolbar.textColor.menu',
    async () => {
      await t.clearAll();
      const { block } = await headBlock();
      await t.selectObject(block);
      await t.tailControl('toolbar.textColor');
      await t.waitControl('toolbar.textColor.plate', 6000).catch(() => undefined);
      const plates = await t.count('[data-control="toolbar.textColor.plate"]');
      const menu = await t.count('[data-control="toolbar.textColor.menu"]');
      await t.press('Escape');
      await t.clearAll();
      /* the audit read two elements sharing the id (audit-brand 11); the fix is one container id
         and at most one swatch under the old one, so a plate that lists no plate token swatch
         still reads unique */
      return {
        ok: plates <= 1 && menu === 1,
        observed: `toolbar.textColor.plate matches ${plates} element(s); toolbar.textColor.menu ${menu}`,
      };
    },
  );

  await t.step(
    'brand.colors.version-history-entry',
    'change Primary in the panel; File > Version history; Restore the row before',
    'the history lists a row for the kit change and the restore takes the colour back',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const missing = await brandPanel();
      if (missing) return missing;
      const field = 'panel.brand.color.primary.hex';
      if (!(await t.visible(field))) {
        await closePanel();
        return t.notBuilt(field, LANE);
      }
      const before = await token('blue');
      const revBefore = (await t.settled()).revision;
      await typeHex(field, PRIMARY, true);
      await t
        .pollUntil(
          async () => (await t.state()).revision,
          (r) => r !== revBefore,
          8000,
        )
        .catch(() => undefined);
      await t.settled();
      await closePanel();
      await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
      await t.waitControl('panel.versionHistory', 8000);
      for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
        await w.click().catch(() => undefined);
      await t.sleep(400);
      const rows = await page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]'),
        ].map((el) => ({
          id: el.getAttribute('data-control'),
          text: el.textContent?.trim().slice(0, 80) ?? '',
        })),
      );
      const kitRow = rows.findIndex((r) => /Brand kit/i.test(r.text));
      const older = kitRow >= 0 ? rows[kitRow + 1] : null;
      let restored = null;
      if (older) {
        await t.clickControl(older.id);
        await t.sleep(400);
        const n = older.id.split('.')[1];
        const restore = page
          .locator(
            `[data-control="versionHistory.${n}.restore"], [data-control="version.restore.${n}"]`,
          )
          .first();
        if ((await restore.count()) > 0) {
          await restore.click();
          restored = await t
            .pollUntil(
              () => token('blue'),
              (v) => v === before,
              35_000,
            )
            .catch(() => token('blue'));
        }
      }
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      await t.settled();
      return {
        ok: kitRow >= 0 && older !== null && restored === before,
        observed: `rows ${rows
          .map((r) => `"${r.text}"`)
          .slice(0, 6)
          .join(
            ', ',
          )}; kit row at ${kitRow}; restored --blue ${restored ?? 'not restored'} (was ${before})`,
      };
    },
  );

  await t.step(
    'brand.colors.role-tooltips',
    'hover each of the six swatches in the panel',
    "each tooltip reads the role's name, its one line and the hex; none reads Titanium or Ink 2",
    async () => {
      await t.clearAll();
      const missing = await brandPanel();
      if (missing) return missing;
      const names = {
        text: 'Text',
        background: 'Background',
        caption: 'Captions',
        hint: 'Hints',
        primary: 'Primary',
        accent: 'Accent',
      };
      const facts = [];
      let ok = true;
      for (const [role] of ROLES) {
        const control = `panel.brand.color.${role}.swatch`;
        if (!(await t.visible(control))) {
          await closePanel();
          return t.notBuilt(control, LANE);
        }
        const tip = await hoverSwatch(control);
        const good =
          tip !== null &&
          !tip.startsWith('none (') &&
          tip.includes(names[role]) &&
          /#[0-9a-f]{6}/i.test(tip) &&
          !/Titanium|Ink 2/.test(tip);
        ok = ok && good;
        facts.push(`${role}: "${tip ?? 'none'}"`);
      }
      await closePanel();
      return { ok, observed: facts.join('; ') };
    },
  );

  await t.step(
    'brand.background.enter-keeps-open',
    'Slide > Change background, type #0b3d91, Enter, Done; then Add to theme',
    'Enter previews and keeps the dialog; Done applies to the slide; Add to theme writes the kit and every slide follows; the wordmark and counter read on the ground',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      let phase = 'open the dialog';
      /** Closes the Background dialog whatever button it answers to (Done, the X, Escape). */
      const closeBackground = async () => {
        for (let i = 0; i < 3 && (await t.visible('dialog.background.done')); i += 1) {
          if (i === 0) await t.clickControl('dialog.background.done');
          else if (await t.visible('dialog.background.close'))
            await t.clickControl('dialog.background.close');
          else await t.press('Escape');
          await t.sleep(400);
        }
        return !(await t.visible('dialog.background.done'));
      };
      const open = async () => {
        await closeBackground();
        await t.surfaceClear({ dialogs: true, session: true });
        await t.menuPath('slide', 'slide.changeBackground');
        await t.waitControl('dialog.background.done', 8000);
        await t.waitControl('dialog.background.color.hex', 8000);
      };
      try {
        await open();
        const sheetBg = () =>
          page.evaluate(
            () =>
              getComputedStyle(
                document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)'),
              ).backgroundColor,
          );
        const bgBefore = await sheetBg();
        await t.clickControl('dialog.background.color.hex');
        await t.press('Meta+a');
        await t.typeHuman(PRIMARY);
        await t.press('Enter');
        await t.sleep(500);
        const stillOpen = await t.visible('dialog.background.done');
        const previewed = await sheetBg();
        const revBefore = (await t.state()).revision;
        phase = 'Done';
        /* Done writes the colour to the slide; whether it closes the dialog is on record (the lane's
         debug read the dialog still drawn 800 ms after Done on the first build) */
        const doneClosed = stillOpen ? await closeBackground() : null;
        await t.settled();
        const applied = await t
          .pollUntil(
            async () => JSON.stringify((await t.slideJson(B)).background ?? null),
            (j) => j.includes(PRIMARY) || j.includes(PRIMARY.slice(1)),
            8000,
          )
          .catch(async () => JSON.stringify((await t.slideJson(B)).background ?? null));
        /* Add to theme: the kit's background */
        phase = 'Add to theme';
        await open();
        const addToTheme = await t.visible('dialog.background.addToTheme');
        let kit = null;
        let otherBg = null;
        let contrast = null;
        if (addToTheme) {
          await t.clickControl('dialog.background.color.hex');
          await t.press('Meta+a');
          await t.typeHuman(PRIMARY);
          await t.press('Enter');
          await t.clickControl('dialog.background.addToTheme');
          await t.settled();
          kit = await record();
          await closeBackground();
          await t.clickCard(T);
          otherBg = await sheetBg();
          /* the wordmark and the counter read on the body slide: the title slide draws no
             wordmark by design (Frame.tsx), and the kit's background is every slide's ground */
          await t.clickCard(B);
          const wordmark = await page.evaluate(() => {
            const w = document.querySelector('.ts-stagewrap.ts-editor .wordmark');
            const c = document.querySelector('.ts-stagewrap.ts-editor .counter');
            return {
              wordmark: w ? getComputedStyle(w).color : null,
              counter: c ? getComputedStyle(c).color : null,
            };
          });
          contrast = {
            wordmark: t.contrastOf(wordmark.wordmark, otherBg),
            counter: t.contrastOf(wordmark.counter, otherBg),
          };
          await t.clickCard(B);
        } else await closeBackground();
        /* the deck back to its ground: the kit's background reset and the slide's background cleared */
        phase = 'the deck back';
        if (kit?.colors) {
          await brandPanel();
          if (await t.visible('panel.brand.reset')) {
            await t.clickControl('panel.brand.reset');
            await t.settled();
          }
          await closePanel();
        }
        await open();
        if (await t.visible('dialog.background.reset'))
          await t.clickControl('dialog.background.reset');
        await closeBackground();
        await t.settled();
        const kitBg = (
          kit?.colors?.light?.background ??
          kit?.colors?.dark?.background ??
          ''
        ).toLowerCase();
        return {
          ok:
            stillOpen &&
            previewed !== bgBefore &&
            applied.toLowerCase().includes(PRIMARY.slice(1)) &&
            kitBg === PRIMARY &&
            otherBg !== null &&
            otherBg !== bgBefore &&
            (contrast?.wordmark ?? 0) >= 3 &&
            (contrast?.counter ?? 0) >= 3,
          observed: `dialog open after Enter ${stillOpen}; sheet ${bgBefore} -> ${previewed} on Enter (revision ${revBefore}); Done closed the dialog ${doneClosed}; slide background after Done ${applied}; Add to theme drawn ${addToTheme}, kit background ${kitBg || (kit === null ? 'not readable on this build' : 'none')}; the title slide's ground ${otherBg ?? 'not read'}; wordmark contrast ${contrast?.wordmark ?? 'not read'}, counter ${contrast?.counter ?? 'not read'}`,
        };
      } catch (error) {
        await closeBackground().catch(() => undefined);
        return {
          ok: false,
          observed: `${phase}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        };
      }
    },
  );

  await t.step(
    'brand.fonts.roles',
    'Fonts > Display: Playfair Display; Text: Source Sans 3; Cmd+Z each',
    'every heading redraws in the display face, the body in the text face, and each Cmd+Z takes one back',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const missing = await brandPanel();
      if (missing) return missing;
      if (!(await t.visible('panel.brand.font.display'))) {
        await closePanel();
        return t.notBuilt('panel.brand.font.display', LANE);
      }
      const familyOf = (which) =>
        page.evaluate((w) => {
          const runs = [
            ...document.querySelectorAll(
              '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
            ),
          ];
          /* the run's block names its type (`data-type` on the block, slide.ts): the split
             layout's runs read h/text and p1/text, so the id alone does not tell a heading */
          const typeOf = (r) =>
            r.closest('[data-block]')?.getAttribute('data-type') ??
            (/heading/.test(r.getAttribute('data-run') ?? '') ? 'heading' : 'text');
          const el = runs.find((r) =>
            w === 'heading' ? typeOf(r) === 'heading' : typeOf(r) !== 'heading',
          );
          return el ? getComputedStyle(el).fontFamily : null;
        }, which);
      const pick = async (control, id) => {
        await t.clickControl(control);
        /* the plate's list draws once the catalog rows are in (FontPicker.tsx `${control}.list`
           with data-rows; `${control}.loading` while they are not) */
        await page
          .locator(`[data-control="${control}.list"][data-rows]`)
          .first()
          .waitFor({ timeout: 10_000 })
          .catch(() => undefined);
        const loading = await t.textOf(`${control}.loading`);
        if (loading !== null && t.notImplemented(new Error(loading))) {
          await t.press('Escape');
          throw new NotBuiltError('font.list', `the dropdown's list reads "${loading}"`);
        }
        const row = page.locator(`[data-control="${control}.row.${id}"]`).first();
        await row.waitFor({ timeout: 6000 });
        await row.scrollIntoViewIfNeeded().catch(() => undefined);
        await row.click();
        await t.settled();
      };
      const head0 = await familyOf('heading');
      const body0 = await familyOf('body');
      try {
        await pick('panel.brand.font.display', 'playfair-display');
      } catch (error) {
        if (error instanceof NotBuiltError) {
          await closePanel();
          return t.notBuilt(error.control, LANE, error.why);
        }
        throw error;
      }
      const head1 = await t
        .pollUntil(
          () => familyOf('heading'),
          (f) => /Playfair/.test(f ?? ''),
          8000,
        )
        .catch(() => familyOf('heading'));
      await pick('panel.brand.font.text', 'source-sans-3');
      const body1 = await t
        .pollUntil(
          () => familyOf('body'),
          (f) => /Source Sans/.test(f ?? ''),
          8000,
        )
        .catch(() => familyOf('body'));
      const rec = await record();
      await closePanel();
      await t.clearAll();
      await t.press('Meta+z');
      const body2 = await t
        .pollUntil(
          () => familyOf('body'),
          (f) => f === body0,
          8000,
        )
        .catch(() => familyOf('body'));
      await t.press('Meta+z');
      const head2 = await t
        .pollUntil(
          () => familyOf('heading'),
          (f) => f === head0,
          8000,
        )
        .catch(() => familyOf('heading'));
      await t.settled();
      return {
        ok:
          /Playfair/.test(head1 ?? '') &&
          /Source Sans/.test(body1 ?? '') &&
          rec?.fonts?.display === 'playfair-display' &&
          rec?.fonts?.text === 'source-sans-3' &&
          body2 === body0 &&
          head2 === head0,
        observed: `heading ${head0} -> ${head1} -> ${head2}; body ${body0} -> ${body1} -> ${body2}; record fonts ${JSON.stringify(rec?.fonts ?? null)}`,
      };
    },
  );

  await t.step(
    'brand.counter.format',
    'Slide numbers > Format: Slide n, then n / N; Insert > Slide numbers writes the same fields',
    'the frame follows each format and the dialog writes the kit',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const missing = await brandPanel();
      if (missing) return missing;
      if (!(await t.visible('panel.brand.counter.format'))) {
        await closePanel();
        return t.notBuilt('panel.brand.counter.format', LANE);
      }
      const counter = () =>
        page.evaluate(
          () =>
            document.querySelector('.ts-stagewrap.ts-editor .counter')?.textContent?.trim() ?? '',
        );
      const setFormat = async (value) => {
        const sel = page.locator('[data-control="panel.brand.counter.format"]').first();
        const tag = await sel.evaluate((el) => el.tagName.toLowerCase());
        if (tag === 'select')
          await sel.selectOption({ label: value }).catch(() => sel.selectOption(value));
        else {
          await sel.click();
          await page
            .locator(`[data-control^="panel.brand.counter.format."]`, { hasText: value })
            .first()
            .click();
        }
        await t.settled();
      };
      if (await t.visible('panel.brand.counter.show')) {
        const on = await page.evaluate(() => {
          const el = document.querySelector('[data-control="panel.brand.counter.show"]');
          return el?.matches('input') ? el.checked : el?.getAttribute('aria-checked') === 'true';
        });
        if (!on) await t.clickControl('panel.brand.counter.show');
      }
      await setFormat('Slide n');
      const slideN = await t.pollUntil(counter, (c) => /^Slide \d+$/.test(c), 8000).catch(counter);
      await setFormat('n / N');
      const nOfN = await t.pollUntil(counter, (c) => /^\d+ \/ \d+$/.test(c), 8000).catch(counter);
      const rec1 = await record();
      await closePanel();
      /* Insert > Slide numbers writes the same fields */
      const r = await t.reachRow('insert', 'insert.slideNumbers');
      let dialogWrote = null;
      if (r.present) {
        await t.menuPath('insert', 'insert.slideNumbers');
        await t.waitControl('dialog.slideNumbers.apply', 8000);
        const revBefore = (await t.state()).revision;
        await t.clickControl('dialog.slideNumbers.apply');
        await t
          .pollUntil(
            async () => (await t.state()).revision,
            (x) => x !== revBefore,
            8000,
          )
          .catch(() => undefined);
        await t.settled();
        const rec2 = await record();
        dialogWrote = rec2?.counter !== undefined;
      }
      await t.advancedBack('Insert > Slide numbers');
      return {
        ok:
          /^Slide \d+$/.test(slideN) &&
          /^\d+ \/ \d+$/.test(nOfN) &&
          rec1?.counter?.format === 'n / N' &&
          dialogWrote === true,
        observed: `counter "Slide n" -> "${slideN}", "n / N" -> "${nOfN}"; record counter ${rec1 ? JSON.stringify(rec1.counter ?? null) : 'not readable on this build (no brand.get on the window API, no brand in deck.info)'}; Insert > Slide numbers ${r.present ? `wrote the kit ${dialogWrote}` : 'not reachable'}`,
      };
    },
  );

  await t.step(
    'brand.reset.default-kit',
    'read the foot button, press it, read the record and the snackbar',
    'the button reads Reset to <the default kit>, the record clears, the sheet reads the default kit, the snackbar carries Undo',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const missing = await brandPanel();
      if (missing) return missing;
      if (!(await t.visible('panel.brand.reset'))) {
        await closePanel();
        return t.notBuilt('panel.brand.reset', LANE);
      }
      /* something to reset: the primary colour */
      if (await t.visible('panel.brand.color.primary.hex'))
        await typeHex('panel.brand.color.primary.hex', PRIMARY, true);
      await t.settled();
      const label = await t.textOf('panel.brand.reset');
      const blueBefore = await token('blue');
      await t.clickControl('panel.brand.reset');
      const { said, undo } = await snackbarUndo();
      /* the sheet reads the default kit: the primary leaves the typed colour */
      const blueAfter = await t
        .pollUntil(
          () => token('blue'),
          (v) => v !== null && v !== blueBefore,
          8000,
        )
        .catch(() => token('blue'));
      await t.settled();
      const rec = await record();
      await closePanel();
      return {
        ok:
          /^Reset to .+/.test(label ?? '') &&
          (!rec || !rec.colors) &&
          blueAfter !== null &&
          blueAfter !== blueBefore &&
          undo,
        observed: `button "${label ?? 'none'}"; record after ${rec ? JSON.stringify(rec) : 'none or not readable'}; --blue ${blueBefore} -> ${blueAfter}; snackbar "${said ?? 'none'}" with Undo ${undo}`,
      };
    },
  );

  await t.step(
    'brand.layout.tiles-in-kit',
    'set the primary colour, open Apply layout, read the tiles',
    "the tiles render the kit's colours",
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const missing = await brandPanel();
      if (missing) return missing;
      if (!(await t.visible('panel.brand.color.primary.hex'))) {
        await closePanel();
        return t.notBuilt('panel.brand.color.primary.hex', LANE);
      }
      await typeHex('panel.brand.color.primary.hex', PRIMARY, true);
      await t.settled();
      await closePanel();
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      await t.sleep(600);
      const tiles = await page.evaluate((hex) => {
        const plate = document.querySelector('[data-control="layout.apply.plate"]');
        const tiles = [...(plate?.querySelectorAll('.ts-layout-tile') ?? [])];
        const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const want = rgb(hex);
        const near = (css) => {
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css ?? '');
          return m && [1, 2, 3].every((i) => Math.abs(Number(m[i]) - want[i - 1]) <= 6);
        };
        let carrying = 0;
        for (const tile of tiles) {
          const els = [tile, ...tile.querySelectorAll('*')];
          const hit = els.some((el) => {
            const cs = getComputedStyle(el);
            return (
              near(cs.color) ||
              near(cs.backgroundColor) ||
              near(cs.borderTopColor) ||
              cs.getPropertyValue('--blue').trim().toLowerCase() === hex
            );
          });
          if (hit) carrying += 1;
        }
        return { tiles: tiles.length, carrying };
      }, PRIMARY);
      await t.press('Escape');
      await t.waitGone('[data-control="layout.apply.plate"]');
      /* the kit back */
      await brandPanel();
      if (await t.visible('panel.brand.reset')) await t.clickControl('panel.brand.reset');
      await t.settled();
      await closePanel();
      return {
        ok: tiles.tiles > 0 && tiles.carrying > 0,
        observed: `${tiles.tiles} tiles, ${tiles.carrying} carrying the kit primary ${PRIMARY}`,
      };
    },
  );

  await t.step(
    'brand.agent.set-get',
    'brand.set /colors/light/primary and brand.get on the window API, then over HTTP',
    'the write lands, brand.get reads it, the sheet re renders within 5 s, and HTTP with the bearer does the same',
    async () => {
      await t.clearAll();
      await t.clickCard(B);
      const actions = await t.windowActions();
      if (!actions.has('brand.set') || !actions.has('brand.get'))
        return t.notBuilt(
          'brand.set',
          LANE,
          `the window API lists ${actions.has('brand.get') ? 'brand.get' : 'no brand action'}`,
        );
      const s = await t.settled();
      const path = `/colors/${s.theme === 'dark' ? 'dark' : 'light'}/primary`;
      const before = await token('blue');
      try {
        await t.invoke('brand.set', { path, value: PRIMARY, baseRevision: s.revision });
      } catch (error) {
        if (t.notImplemented(error))
          return t.notBuilt(
            'brand.set',
            LANE,
            `the window transport answers ${error.message.split('\n')[0]}`,
          );
        throw error;
      }
      const drawn = await t
        .pollUntil(
          () => token('blue'),
          (v) => (v ?? '').toLowerCase().includes(PRIMARY),
          5000,
        )
        .catch(() => token('blue'));
      const got = await t.invoke('brand.get', {}).catch((e) => ({ error: String(e) }));
      const read = JSON.stringify(got);
      await t.settled();
      /* over HTTP with the bearer, a second value */
      const s2 = await t.state();
      const http = await t.httpAction('brand.set', {
        path,
        value: '#1a5fb4',
        baseRevision: s2.revision,
      });
      let httpDrawn = null;
      let httpGet = null;
      if (!http.noBearer) {
        httpDrawn = await t
          .pollUntil(
            () => token('blue'),
            (v) => (v ?? '').toLowerCase().includes('#1a5fb4'),
            5000,
          )
          .catch(() => token('blue'));
        httpGet = await t.httpAction('brand.get', {});
      }
      /* the kit back through the window API */
      const s3 = await t.settled();
      await t.invoke('brand.reset', { baseRevision: s3.revision }).catch(() => undefined);
      await t.settled();
      const httpOk = http.noBearer
        ? null
        : http.status < 300 &&
          (httpDrawn ?? '').toLowerCase().includes('#1a5fb4') &&
          JSON.stringify(httpGet?.body ?? {}).includes('1a5fb4');
      return {
        ok:
          (drawn ?? '').toLowerCase().includes(PRIMARY) &&
          read.includes(PRIMARY) &&
          httpOk === true,
        observed: `window API: --blue ${before} -> ${drawn}; brand.get ${read.slice(0, 160)}; HTTP ${http.noBearer ? 'not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json)' : `${http.status}, --blue ${httpDrawn}, brand.get ${JSON.stringify(httpGet?.body ?? null).slice(0, 120)}`}`,
      };
    },
  );
}

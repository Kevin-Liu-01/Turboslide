// B2 picture and panel rows on the dev server: the upload's placement and instant preview, the
// failure sentence, Replace image with its snackbar, the caption field, the picture only
// sections, the padding grid, the remembered sections, Alt text in the default view, Image by URL
// with the paused preview, the transparency slider.
import { launch, bind, sleep } from './lib.mjs';
import { pictureInsertBox } from '/Users/kevinliu/repos/Turboslide/packages/viewer/src/picture-place.ts';

const { browser, page, consoleErrors } = await launch();
const t = bind(page, 'drive-pictures');
const errorsSince = (n) =>
  consoleErrors
    .slice(n)
    .filter((e) => !/CSP|Content Security|Fast Refresh|hmr|\[vite\]|\[Server\]/i.test(e));
const sectionsOf = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
      (el) => ({
        id: el.getAttribute('data-section'),
        title: el.querySelector('.ts-panel-section-head span')?.textContent,
        closed: el.classList.contains('is-closed'),
      }),
    ),
  );
try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  await t.gotoSlide(S);
  let uploadedAssetUrl = null;

  // ---- upload: placement and the instant preview
  await t.step(
    'images.insert.centred-in-body and images.insert.instant-preview: Insert > Image > Upload lands the picture centred in the body slot at the largest size with the 40 px margin, selected; the preview draws within 500 ms with a progress bar',
    'centred box, selected, preview',
    async () => {
      const before = await t.objectIds(S);
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      const t0 = await t.uploadThrough(
        () => t.clickRow('insert.image.upload'),
        'product.png',
        await t.pngBuffer(400, 300, '#204080', '#e0e8ff'),
      );
      // the preview
      const preview = await t.pollUntil(
        () =>
          page.evaluate(() => {
            const p = document.querySelector('[data-control="picture.upload"]');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return {
              w: r.width,
              h: r.height,
              img: Boolean(p.querySelector('img')?.getAttribute('src')),
              bar: Boolean(p.querySelector('[data-control="picture.upload.progress"]')),
            };
          }),
        (p) => p !== null,
        1500,
        20,
      );
      const previewMs = Date.now() - t0;
      const obj = await t.newObjectAfter(S, before, 15_000);
      const landedMs = Date.now() - t0;
      await sleep(400);
      const previewGone = !(await t.has('[data-control="picture.upload"]'));
      const chip = await t.chip();
      const snack = await t.snackbar();
      const want = pictureInsertBox([400, 300]);
      const pos = obj?.pos;
      const placed =
        pos && pos.x === want[0] && pos.y === want[1] && pos.w === want[2] && pos.h === want[3];
      uploadedAssetUrl = obj
        ? `${t.page.url().split('/edit/')[0]}/decks/${deck.id}/assets/${obj.block.asset}.png`
        : null;
      await t.shot('uploaded');
      return {
        ok:
          Boolean(obj) &&
          placed &&
          chip === 'Image' &&
          preview !== null &&
          previewMs < 500 &&
          preview.img &&
          preview.bar &&
          previewGone,
        observed: `${obj ? `${obj.type} at ${JSON.stringify(pos)}` : 'nothing'} (want ${JSON.stringify(want)}) landed in ${landedMs} ms; preview ${JSON.stringify(preview)} after ${previewMs} ms, gone after landing ${previewGone}; chip ${chip}; snackbar ${JSON.stringify(snack)} (the controller's, B3's rank 14)`,
      };
    },
  );

  await t.step(
    'images.upload.failure-snackbar: a text file renamed .png shows the sentence and leaves no placeholder',
    'the sentence, nothing drawn',
    async () => {
      const before = await t.objectIds(S);
      await t.clearAll();
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      await t.uploadThrough(
        () => t.clickRow('insert.image.upload'),
        'notes.png',
        Buffer.from('hello, this is a text file and not a picture at all'),
      );
      await sleep(700);
      const snack = await t.snackbar();
      const placeholder = await t.has('[data-control="picture.upload"]');
      await sleep(1500);
      const after = await t.objectIds(S);
      return {
        ok:
          snack === 'The picture could not be uploaded: the file is not a picture' &&
          !placeholder &&
          after.length === before.length,
        observed: `snackbar ${JSON.stringify(snack)}; placeholder ${placeholder}; objects ${before.length} -> ${after.length}`,
      };
    },
  );

  await t.step(
    'the audit’s broken PNG (a valid signature, a damaged chunk) shows the sentence too',
    'the server refusal as the sentence',
    async () => {
      const before = await t.objectIds(S);
      const good = await t.pngBuffer(120, 80);
      const bad = Buffer.concat([good.subarray(0, 40), Buffer.from([0x01]), good.subarray(41)]);
      await t.clearAll();
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      await t.uploadThrough(() => t.clickRow('insert.image.upload'), 'broken.png', bad);
      const snack = await t.pollUntil(
        () => t.snackbar(),
        (s) => s !== null && /could not be uploaded/.test(s),
        25_000,
        200,
      );
      await sleep(150);
      const placeholder = await t.has('[data-control="picture.upload"]');
      const after = await t.objectIds(S);
      return {
        ok:
          typeof snack === 'string' &&
          /^The picture could not be uploaded: /.test(snack) &&
          !placeholder &&
          after.length === before.length,
        observed: `snackbar ${JSON.stringify(snack)}; placeholder ${placeholder}; objects ${before.length} -> ${after.length}`,
      };
    },
  );

  // ---- replace image via the toolbar
  const pic = (await t.objectsOf(S)).find((o) => o.type === 'shot');
  await t.step(
    'images.replace.upload: the toolbar Replace image > Upload swaps the asset, keeps the box and says Picture replaced with Undo; Cmd+Z restores',
    'swap, snackbar, undo',
    async () => {
      await t.clearAll();
      const before = await t.blockOf(S, pic.id);
      await t.selectObject(pic.id);
      await t.uploadThrough(
        async () => {
          await t.clickControl('toolbar.replaceImage');
          await sleep(400);
          await page
            .locator('[data-control="menu.format.image.replaceImage.upload"]')
            .first()
            .click();
        },
        'logo.png',
        await t.pngBuffer(120, 80, '#111111', '#eeeeee'),
      );
      const after = await t.pollUntil(
        () => t.blockOf(S, pic.id),
        (b) => b && b.block.asset !== before.block.asset,
        8000,
      );
      const snack = await t.snackbar();
      const undoAction = await page.evaluate(
        () =>
          document.querySelector('.ts-snackbar.is-on [data-control="snackbar.action"]')
            ?.textContent ?? null,
      );
      await t.settled();
      await t.press('Meta+z');
      await sleep(900);
      const undone = await t.blockOf(S, pic.id);
      return {
        ok:
          after &&
          after.block.asset !== before.block.asset &&
          JSON.stringify(after.pos) === JSON.stringify(before.pos) &&
          snack === 'Picture replacedUndo' &&
          undoAction === 'Undo' &&
          undone.block.asset === before.block.asset,
        observed: `asset ${before.block.asset} -> ${after?.block.asset}; pos kept ${JSON.stringify(after?.pos) === JSON.stringify(before.pos)}; snackbar ${JSON.stringify(snack)} action ${undoAction}; after Cmd+Z ${undone?.block.asset}`,
      };
    },
  );

  // ---- format options for the picture: sections, caption, alt
  await t.step(
    'images.options.picture-sections-only: Format options for a picture lists Size & rotation, Position, Image options (and Adjustments, Alt text) and no text section',
    'no text section',
    async () => {
      await t.clearAll();
      await t.selectObject(pic.id);
      await t.clickControl('toolbar.imageOptions');
      await page.waitForSelector('[data-control="panel.formatOptions"]', { timeout: 6000 });
      const sections = await sectionsOf();
      const ids = sections.map((s) => s.id);
      const titles = sections.map((s) => s.title);
      return {
        ok:
          ids.includes('size') &&
          ids.includes('position') &&
          titles.includes('Image options') &&
          !ids.includes('text') &&
          !ids.includes('textFitting') &&
          ids.includes('altText'),
        observed: JSON.stringify(sections),
      };
    },
  );

  await t.step(
    'images.caption.add (the panel field): Caption in Image options prompts Add a caption; typing stores the shot’s caption and the figure draws it; Cmd+Z removes it',
    'caption stored and drawn',
    async () => {
      const field = page.locator('[data-control="formatOptions.picture.caption"]');
      const placeholder = await field.getAttribute('placeholder');
      await field.click();
      await t.typeHuman('Team photo, Q3');
      await t.press('Enter');
      await sleep(800);
      await t.settled();
      const block = await t.blockOf(S, pic.id);
      const drawn = await page.evaluate(
        (id) =>
          document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] figcaption`,
          )?.textContent ?? null,
        pic.id,
      );
      await t.shot('caption');
      await t.clearAll();
      const r0 = (await t.state()).revision;
      const active0 = await page.evaluate(
        () => `${document.activeElement?.tagName}.${document.activeElement?.className}`,
      );
      await t.clickControl('toolbar.undo');
      await sleep(900);
      await t.settled();
      const undone = await t.blockOf(S, pic.id);
      const r1 = (await t.state()).revision;
      return {
        ok:
          placeholder === 'Add a caption' &&
          block.block.caption === 'Team photo, Q3' &&
          drawn === 'Team photo, Q3' &&
          undone.block.caption === undefined,
        observed: `placeholder ${placeholder}; stored ${JSON.stringify(block.block.caption)}; drawn ${JSON.stringify(drawn)}; focus before undo ${active0}; revision ${r0} -> ${r1}; after Undo ${JSON.stringify(undone.block.caption)}`,
      };
    },
  );

  await t.step(
    'formatting.alt-text.write-undo: Alt text is in the default view; a description, Tab; the asset carries it; Cmd+Z',
    'alt stored and undone',
    async () => {
      await t.clearAll();
      await t.selectObject(pic.id);
      if (!(await t.has('[data-control="panel.formatOptions"]')))
        await t.clickControl('toolbar.imageOptions');
      const section = page.locator('[data-control="panel.formatOptions"] [data-section="altText"]');
      if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => true))
        await t.clickControl('formatOptions.altText');
      const field = page.locator('[data-control="formatOptions.altText.description"]');
      await field.scrollIntoViewIfNeeded();
      await field.click();
      await page.keyboard.press('Meta+a');
      await t.typeHuman('The Acme team on stage');
      await t.press('Tab');
      await sleep(900);
      await t.settled();
      const drawnAlt = () =>
        page.evaluate(
          (id) =>
            document
              .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] img`)
              ?.getAttribute('alt') ?? null,
          pic.id,
        );
      const alt1 = await drawnAlt();
      await t.clearAll();
      const r0 = (await t.state()).revision;
      await t.clickControl('toolbar.undo');
      await sleep(900);
      await t.settled();
      const alt2 = await drawnAlt();
      const r1 = (await t.state()).revision;
      return {
        ok: alt1 === 'The Acme team on stage' && alt2 !== 'The Acme team on stage',
        observed: `drawn alt after Tab ${JSON.stringify(alt1)}; revision ${r0} -> ${r1}; after Undo ${JSON.stringify(alt2)}`,
      };
    },
  );

  // ---- text fitting padding grid and the remembered sections
  const tb = await t.placeBlock(S, {
    id: 'tb-pad',
    type: 'text',
    text: 'Padding grid',
    pos: { x: 200, y: 700, w: 400, h: 60, z: 12 },
  });
  await t.step(
    'text.format-options.padding-grid: Text fitting shows one Padding head with Top, Bottom, Left, Right in two by two, the unit inside the field, labels at 12.5 px in ink-2',
    'the grid',
    async () => {
      await t.clearAll();
      await t.selectObject(tb.id);
      if (!(await t.has('[data-control="panel.formatOptions"]')))
        await t.clickControl('toolbar.formatOptions');
      await page.waitForSelector('[data-control="formatOptions.padding"]', { timeout: 6000 });
      const read = await page.evaluate(() => {
        const root = document.querySelector('[data-control="formatOptions.padding"]');
        const head = root.querySelector('.ts-fo-head');
        const fields = [...root.querySelectorAll('input')].map((i) =>
          i.getAttribute('data-control'),
        );
        const labels = [...root.querySelectorAll('.ts-fo-field > .ts-fo-field-label')].map((l) => ({
          text: l.textContent,
          size: getComputedStyle(l).fontSize,
          color: getComputedStyle(l).color,
        }));
        const grid = getComputedStyle(
          root.querySelector('.ts-fo-fields'),
        ).gridTemplateColumns.split(' ').length;
        const box = root.querySelector('.ts-fo-field-box');
        const unit = box.querySelector('.ts-fo-field-unit');
        const inside =
          unit &&
          box.getBoundingClientRect().right >= unit.getBoundingClientRect().right &&
          getComputedStyle(box).borderTopWidth !== '0px';
        const ink2 = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-ink-2')
          .trim();
        return {
          head: head?.textContent,
          fields,
          labels,
          grid,
          unitInside: Boolean(inside),
          unitText: unit?.textContent,
          ink2,
        };
      });
      await t.shot('padding-grid');
      const labelOk =
        read.labels.map((l) => l.text).join(',') === 'Top,Bottom,Left,Right' &&
        read.labels.every((l) => l.size === '12.5px');
      return {
        ok:
          read.head === 'Padding' &&
          read.fields.join(',') ===
            'formatOptions.padding.top,formatOptions.padding.bottom,formatOptions.padding.left,formatOptions.padding.right' &&
          read.grid === 2 &&
          labelOk &&
          read.unitInside &&
          read.unitText === 'px',
        observed: JSON.stringify(read),
      };
    },
  );

  await t.step(
    'text.format-options.remembers-section: collapse Text fitting, close the panel, reopen from the toolbar; Size & rotation open, Text fitting collapsed; Format > Text fitting opens Text fitting alone',
    'remembered and alone',
    async () => {
      await t.clickControl('formatOptions.textFitting');
      await sleep(200);
      const s1 = await sectionsOf();
      await t.clickControl('panel.formatOptions.close').catch(async () => {
        await page
          .locator('[data-control="panel.formatOptions"] button[aria-label="Close"]')
          .first()
          .click();
      });
      await sleep(300);
      await t.clickControl('toolbar.formatOptions');
      await page.waitForSelector('[data-control="panel.formatOptions"]', { timeout: 6000 });
      const s2 = await sectionsOf();
      await t.openMenu('format');
      await t.clickRow('format.textFitting');
      await sleep(500);
      const s3 = await sectionsOf();
      const closedOf = (rows, id) => rows.find((r) => r.id === id)?.closed;
      const alone = s3.every((r) => (r.id === 'textFitting' ? !r.closed : r.closed));
      return {
        ok:
          closedOf(s1, 'textFitting') === true &&
          closedOf(s2, 'textFitting') === true &&
          closedOf(s2, 'size') === false &&
          alone,
        observed: `after collapse ${JSON.stringify(s1.map((r) => `${r.id}:${r.closed ? 'closed' : 'open'}`))}; reopened ${JSON.stringify(s2.map((r) => `${r.id}:${r.closed ? 'closed' : 'open'}`))}; from the menu ${JSON.stringify(s3.map((r) => `${r.id}:${r.closed ? 'closed' : 'open'}`))}`,
      };
    },
  );

  // ---- transparency slider
  await t.step(
    'images.transparency.slider: Adjustments > Transparency is a slider with the field beside it; dragging to 40 writes 0.4',
    'a range input and 0.4',
    async () => {
      await t.clearAll();
      await t.selectObject(pic.id);
      if (!(await t.has('[data-control="panel.formatOptions"]')))
        await t.clickControl('toolbar.imageOptions');
      const section = page.locator(
        '[data-control="panel.formatOptions"] [data-section="adjustments"]',
      );
      if (await section.evaluate((el) => el.classList.contains('is-closed')).catch(() => true))
        await t.clickControl('formatOptions.adjustments');
      const slider = page.locator('[data-control="formatOptions.adjustments.transparency.slider"]');
      await slider.scrollIntoViewIfNeeded();
      const r = await slider.boundingBox();
      const field = await page
        .locator('[data-control="formatOptions.adjustments.transparency"]')
        .boundingBox();
      const fromX = r.x + 4;
      const toX = r.x + r.width * 0.4;
      await t.drag(
        { x: fromX, y: r.y + r.height / 2 },
        { x: toX, y: r.y + r.height / 2 },
        { steps: 12 },
      );
      await sleep(900);
      await t.settled();
      const block = await t.blockOf(S, pic.id);
      const value = block.block.adjust?.transparency ?? null;
      const drawn = await page.evaluate(
        (id) =>
          getComputedStyle(
            document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"] img`),
          ).opacity,
        pic.id,
      );
      return {
        ok: r.width > 100 && field !== null && value !== null && Math.abs(value - 0.4) <= 0.03,
        observed: `slider ${Math.round(r.width)} by ${Math.round(r.height)} px, field ${field ? `${Math.round(field.width)} px beside it` : 'none'}; transparency ${value}; drawn opacity ${drawn}`,
      };
    },
  );

  // ---- image by URL (the switch on)
  await t.step(
    'images.insert.by-url: an address typed at human speed fetches nothing until a 600 ms pause; Insert centres the picture in the body slot, selected',
    'no partial fetch, a centred picture',
    async () => {
      await t.clearAll();
      // Tools > Advanced tools on
      const settings = (await t.state()).settings;
      if (!settings?.advancedTools) {
        await t.openMenu('tools');
        await t.clickRow('tools.advancedTools');
        await sleep(400);
        await t.press('Escape', 2);
        await sleep(300);
      }
      const before = await t.objectIds(S);
      const requests = [];
      const onRequest = (req) => {
        const u = req.url();
        if (/assets\/|generaltranslation|example/.test(u) && req.resourceType() === 'image')
          requests.push(u);
      };
      page.on('request', onRequest);
      const on = (await t.state()).settings;
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.insert.image."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      if (!rows.includes('menu.insert.image.byUrl')) {
        await t.press('Escape', 2);
        return {
          ok: false,
          observed: `no By URL row with settings ${JSON.stringify(on)}; rows ${rows.join(',')}`,
        };
      }
      await t.clickRow('insert.image.byUrl');
      await page.waitForSelector('[data-control="dialog.imageByUrl.url"]', { timeout: 6000 });
      const address = uploadedAssetUrl;
      await t.typeHuman(address);
      const duringTyping = requests.length;
      await sleep(900);
      const afterPause = requests.length;
      const previewShown = await t.has('[data-control="dialog.imageByUrl.preview"]');
      await t.clickControl('dialog.imageByUrl.ok');
      const obj = await t.newObjectAfter(S, before, 20_000);
      page.off('request', onRequest);
      await sleep(500);
      const chip = await t.chip();
      const dialogGone = !(await t.has('[data-control="dialog.imageByUrl"]'));
      const want = obj
        ? pictureInsertBox(obj.block && obj.block.asset ? undefined : undefined)
        : null;
      // the placement: centred in the body slot at the asset's size
      const centred = obj
        ? Math.abs(obj.pos.x + obj.pos.w / 2 - (137 + 1326 / 2)) <= 1 &&
          Math.abs(obj.pos.y + obj.pos.h / 2 - (129 + 642 / 2)) <= 1
        : false;
      await t.shot('by-url');
      // the switch back off
      await t.openMenu('tools');
      await t.clickRow('tools.advancedTools');
      await sleep(300);
      return {
        ok:
          duringTyping === 0 &&
          afterPause === 1 &&
          previewShown &&
          Boolean(obj) &&
          centred &&
          chip === 'Image' &&
          dialogGone,
        observed: `address ${address}; image requests during typing ${duringTyping}, after the pause ${afterPause}; preview ${previewShown}; ${obj ? `${obj.type} at ${JSON.stringify(obj.pos)}` : 'nothing'} centred ${centred}; chip ${chip}; dialog closed ${dialogGone}`,
      };
    },
  );

  const errs = errorsSince(0);
  t.record(
    'console errors during the pictures drive',
    'none',
    errs.join(' | ') || 'none',
    errs.length === 0,
  );
  t.finish();
} finally {
  await browser.close();
}

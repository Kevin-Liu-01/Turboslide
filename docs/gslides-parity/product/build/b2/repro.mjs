// Reproduces the B2 defects on the dev server before any code: Replace image by upload, the
// text box grow, Shift+Home, the transparency control, the picture border.
import { launch, bind, sleep } from './lib.mjs';

const { browser, page, consoleErrors } = await launch();
const t = bind(page, 'repro');
try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  await t.gotoSlide(S);

  // ---- replace image by upload
  const pic = await t.placePicture(S, { x: 400, y: 250, w: 240, h: 160 });
  await t.step('replace image > upload swaps the asset', 'asset changes, pos kept', async () => {
    const before = await t.blockOf(S, pic.id);
    await t.selectObject(pic.id);
    const tail = await t.visible('toolbar.replaceImage');
    let route = 'toolbar';
    await t.uploadThrough(async () => {
      if (tail) {
        await t.clickControl('toolbar.replaceImage');
        await sleep(400);
        const row = page.locator('[data-control="menu.format.image.replaceImage.upload"]').first();
        const vis = await row.isVisible().catch(() => false);
        route += vis ? ' + upload row' : ' (no upload row visible)';
        if (vis) await row.click();
      } else {
        route = 'no toolbar.replaceImage';
      }
    });
    const t0 = Date.now();
    const after = await t.pollUntil(
      () => t.blockOf(S, pic.id),
      (b) => b && b.block.asset !== before.block.asset,
      8000,
    );
    const snack = await t.snackbar();
    return {
      ok:
        after &&
        after.block.asset !== before.block.asset &&
        JSON.stringify(after.pos) === JSON.stringify(before.pos),
      observed: `${route}; asset ${before.block.asset} -> ${after?.block.asset} in ${Date.now() - t0} ms; pos ${JSON.stringify(after?.pos)}; snackbar ${snack}; console ${consoleErrors.slice(-2).join(' | ')}`,
    };
  });

  // ---- transparency control and border
  await t.step('transparency is a slider; border draws', 'a range input; a ring', async () => {
    await t.clearAll();
    await t.selectObject(pic.id);
    await t.clickControl('toolbar.imageOptions').catch(() => undefined);
    await page.waitForSelector('[data-control="panel.formatOptions"]', { timeout: 6000 });
    const sections = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
        (el) => el.getAttribute('data-section'),
      ),
    );
    const slider = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-control="formatOptions.adjustments.transparency.slider"]',
      );
      const field = document.querySelector(
        '[data-control="formatOptions.adjustments.transparency"]',
      );
      const r = el?.getBoundingClientRect();
      const f = field?.getBoundingClientRect();
      return {
        slider: el
          ? { type: el.type, w: r.width, h: r.height, display: getComputedStyle(el).display }
          : null,
        field: f ? { w: f.width, h: f.height } : null,
      };
    });
    await t.shot('format-options-picture');
    return {
      ok: Boolean(slider.slider) && slider.slider.w > 40,
      observed: `sections ${sections.join(',')}; ${JSON.stringify(slider)}`,
    };
  });
  await t.step('border color writes and draws', 'a visible ring', async () => {
    await t.setBlock(S, pic.id, '/frame', { color: 'ink', weight: 2 });
    await sleep(500);
    const read = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      if (!el) return null;
      const img = el.querySelector('img');
      const crop = el.querySelector('.shot-crop');
      const cs = (n) =>
        n
          ? {
              border: getComputedStyle(n).border,
              outline: getComputedStyle(n).outline,
              cls: n.className,
            }
          : null;
      return { fig: cs(el), img: cs(img), crop: cs(crop), html: el.outerHTML.slice(0, 600) };
    }, pic.id);
    await t.shot('border');
    return {
      ok:
        Boolean(read?.img?.border && !/0px/.test(read.img.border)) ||
        Boolean(read?.crop?.border && !/0px/.test(read.crop.border)),
      observed: JSON.stringify(read),
    };
  });

  // ---- text box grow
  await t.step('a long paragraph grows the text box', 'pos.h follows the text', async () => {
    await t.clearAll();
    const box = await t.placeBlock(S, {
      id: 'tb-grow',
      type: 'text',
      text: '',
      autofit: 'grow',
      pos: { x: 900, y: 500, w: 340, h: 48, z: 5 },
    });
    const run = (await t.runsOfBlock(box.id))[0];
    const info = await t.runInfo(run);
    await t.dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    const editing = await t.editing();
    const para =
      'The renewal terms apply to every seat in the workspace from the first day of the next quarter, with the discount held for two years and the support tier unchanged for the whole period of the agreement.';
    await t.typeHuman(para);
    await sleep(600);
    const live = await page.evaluate((id) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`);
      const free = el?.closest('.free');
      const r = free?.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const bottom = Math.max(...rects.map((x) => x.bottom));
      return {
        free: r ? { w: r.width, h: r.height, bottom: r.bottom } : null,
        textBottom: bottom,
        overflow: r ? bottom - r.bottom : null,
        k:
          document.querySelector('.ts-stagewrap.ts-editor .pt-slide').getBoundingClientRect()
            .width / 1600,
      };
    }, box.id);
    await t.press('Escape');
    await sleep(800);
    await t.settled();
    const after = await t.blockOf(S, box.id);
    await t.shot('grow');
    return {
      ok: after.pos.h > 100 && live.overflow < 2,
      observed: `editing ${editing}; pos.h 48 -> ${after.pos.h}; autofit ${after.block.autofit}; live ${JSON.stringify(live)}; console ${consoleErrors.slice(-3).join(' | ')}`,
    };
  });

  // ---- shift home on the third line
  await t.step('Shift+Home selects the third line alone', 'one line', async () => {
    await t.clearAll();
    const box = await t.placeBlock(S, {
      id: 'tb-lines',
      type: 'text',
      text: '',
      autofit: 'grow',
      pos: { x: 200, y: 600, w: 600, h: 48, z: 6 },
    });
    const run = (await t.runsOfBlock(box.id))[0];
    const info = await t.runInfo(run);
    await t.dblclickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
    await t.typeHuman('Kevin Liu, founder');
    await t.press('Enter');
    await t.typeHuman('kevin@generaltranslation.com');
    await t.press('Enter');
    await t.typeHuman('generaltranslation.com');
    await sleep(400);
    await t.press('Shift+Home');
    const sel = await t.selectionText();
    const html = (await t.runInfo(run)).html;
    await t.press('Escape');
    await sleep(500);
    return {
      ok: sel.trim() === 'generaltranslation.com',
      observed: `selection "${sel}"; html ${html.slice(0, 300)}`,
    };
  });

  // ---- double click on a dotted address
  await t.step(
    'double click on generaltranslation.com selects the whole address',
    'the address',
    async () => {
      const run = (await t.runsOfBlock('tb-lines'))[0];
      const rect = await page.evaluate((r) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const i = node.nodeValue.indexOf('generaltranslation.com');
          if (i >= 0 && !node.nodeValue.includes('@')) {
            const range = document.createRange();
            range.setStart(node, i + 3);
            range.setEnd(node, i + 4);
            const b = range.getBoundingClientRect();
            return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          }
        }
        return null;
      }, run);
      await t.dblclickAt(rect.x, rect.y);
      await sleep(300);
      const sel = await t.selectionText();
      await t.press('Escape');
      return { ok: sel.trim() === 'generaltranslation.com', observed: `selection "${sel}"` };
    },
  );

  // ---- upload from computer: where it lands, how fast, the snackbar
  await t.step(
    'Insert > Image > Upload lands where and how fast',
    'centred in the body, no snackbar',
    async () => {
      await t.clearAll();
      const before = await t.objectIds(S);
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      const t0 = await t.uploadThrough(
        () => t.clickRow('insert.image.upload'),
        'product.png',
        await t.pngBuffer(400, 300),
      );
      const obj = await t.newObjectAfter(S, before, 15_000);
      const ms = Date.now() - t0;
      const snack = await t.snackbar();
      const chip = await t.chip();
      return {
        ok: Boolean(obj),
        observed: `${obj ? `${obj.type} at ${JSON.stringify(obj.pos)}` : 'nothing'} in ${ms} ms; snackbar ${snack}; chip ${chip}`,
      };
    },
  );
  t.finish();
} finally {
  await browser.close();
}

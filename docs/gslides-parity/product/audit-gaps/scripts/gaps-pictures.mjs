// The picture rows of the feature gaps audit: upload, by URL, drag and drop, paste from the
// clipboard, replace (toolbar and drop), crop, mask, transparency, border, alt text on a picture.
// One scratch deck from /new, trashed and deleted forever in the finally block.
//   node gaps-pictures.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASE,
  EVIDENCE,
  bind,
  cleanupDeck,
  launch,
  makeTable,
  newDeck,
  pngFixture,
  sleep,
} from './lib.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const PNG_A = path.join(here, 'picture-a.png');
const PNG_B = path.join(here, 'picture-b.png');
writeFileSync(PNG_A, pngFixture());
// picture B: the same PNG with its dark cells lighter, so the two assets differ by digest
const b = pngFixture();
writeFileSync(PNG_B, Buffer.concat([b.subarray(0, 40), Buffer.from([0x01]), b.subarray(41)]));

const table = makeTable('pictures');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
try {
  deck = await newDeck(t, 'Acme renewal: logos and screenshots');
  table.record(
    'a scratch deck from /new',
    'the address moves to /edit/<id>',
    `${deck.id}; ${page.url().replace(BASE, '')}`,
    /\/edit\//.test(page.url()),
  );
  const X = deck.titleSlide;
  await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);

  /** A file chooser answered with a path; the row's own timing. */
  const chooseFile = async (file, trigger) => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15_000 }),
      trigger(),
    ]);
    await chooser.setFiles(file);
  };
  const pictures = async () =>
    (await t.objectsOf(X)).filter(
      (o) => o.type === 'picture' || o.type === 'image' || o.block.asset || o.block.assetId,
    );

  // ---- 1. Insert > Image > Upload from computer
  let pic = null;
  await t.step(
    'Insert > Image > Upload from computer with a PNG',
    'a picture block lands on the slide within 20 s',
    async () => {
      const before = (await t.objectsOf(X)).map((o) => o.id);
      const t0 = Date.now();
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      await chooseFile(PNG_A, () => t.clickRow('insert.image.upload'));
      const obj = await t.newObjectAfter(X, before, 30_000);
      await t.settled();
      pic = obj;
      const snack = await t.snackbar();
      const shot = await t.shot('picture-uploaded');
      return {
        ok: Boolean(obj),
        observed: `${obj ? `${obj.type} ${obj.id} pos ${JSON.stringify(obj.pos)}` : 'no block'} in ${Date.now() - t0} ms; snackbar "${snack}"; ${shot}`,
      };
    },
  );

  // ---- 2. the picture tail with the switch off and on
  await t.step(
    'Select the picture: the chip and the toolbar tail (switch off), then with the switch on',
    'crop, replace and image options in the default view; the border controls and the mask arrow only with the switch on',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      const sel = await t.selectObject(pic.id);
      const tail = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="toolbar."]')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control'))
            .filter((c) =>
              /border|crop|replace|imageOptions|resetImage|dither|mask|formatOptions|more/.test(c),
            ),
        );
      const off = await tail();
      const shot = await t.shot('picture-tail-default');
      await t.setAdvanced(true);
      await t.selectObject(pic.id);
      const on = await tail();
      const shot2 = await t.shot('picture-tail-advanced');
      return {
        ok: Boolean(sel),
        observed: `chip "${await t.chip()}"; tail off ${off.join(',')}; tail on ${on.join(',')}; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 3. Replace image from the toolbar with a file
  await t.step(
    'Toolbar Replace image > Upload from computer with a second PNG',
    'the asset changes and the box keeps its frame',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      const before = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      await t.clickControl('toolbar.replaceImage');
      await sleep(500);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const uploadRow = rows.find((r) => /upload/i.test(r));
      if (!uploadRow) {
        await t.closeMenus();
        return { ok: false, observed: `no Upload row after the click; rows ${rows.join(',')}` };
      }
      await chooseFile(PNG_B, () => t.clickControl(uploadRow.replace(/^/, '')));
      const changed = await t.pollUntil(
        async () => (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block,
        (bl) =>
          JSON.stringify(bl?.asset ?? bl?.assetId ?? bl?.src) !==
          JSON.stringify(before?.asset ?? before?.assetId ?? before?.src),
        30_000,
      );
      await t.settled();
      const snack = await t.snackbar();
      const shot = await t.shot('picture-replaced');
      return {
        ok:
          JSON.stringify(changed?.asset ?? changed?.assetId ?? changed?.src) !==
          JSON.stringify(before?.asset ?? before?.assetId ?? before?.src),
        observed: `asset ${JSON.stringify(before?.asset ?? before?.assetId ?? before?.src)} -> ${JSON.stringify(changed?.asset ?? changed?.assetId ?? changed?.src)}; pos ${JSON.stringify(before?.pos)} -> ${JSON.stringify(changed?.pos)}; snackbar "${snack}"; ${shot}`,
      };
    },
  );

  // ---- 4. Crop
  await t.step(
    'Crop: double click the picture, drag the east edge 100 sheet px in, Enter',
    'crop mode opens, the frame narrows, the trim is written',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.press('Escape', 2);
      const b0 = await t.boxOf(pic.id);
      await t.dblclickAt(b0.inner.x + b0.inner.w / 2, b0.inner.y + b0.inner.h / 2);
      await sleep(500);
      const crop = await t.handleControls();
      const chip = await t.chip();
      const east = crop.find((c) => /crop\.e$/.test(c));
      if (!east) {
        await t.press('Escape');
        return {
          ok: false,
          observed: `no crop handles; handles ${crop.join(',')}; chip "${chip}"`,
        };
      }
      const r = await t.rectOf(`.ts-overlay [data-control="${east}"]`);
      const kk = (await t.sheetRect()).w / 1600;
      await t.drag(t.center(r), { x: r.x + r.w / 2 - 100 * kk, y: r.y + r.h / 2 });
      const shot = await t.shot('crop-dragged');
      await t.press('Enter');
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      return {
        ok: Boolean(block?.trim || block?.crop),
        observed: `chip "${chip}"; trim ${JSON.stringify(block?.trim ?? block?.crop ?? null)}; pos ${JSON.stringify(block?.pos)}; ${shot}`,
      };
    },
  );

  // ---- 5. Mask (parked)
  await t.step(
    'Mask image: the Crop image arrow with the switch on',
    'the arrow lists the mask shapes; a mask draws',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      const arrow = await t.rectOf('[data-control="toolbar.cropImage.arrow"]');
      if (!arrow) return { ok: false, observed: 'no Crop image arrow with the switch on' };
      await t.clickAt(arrow.x + arrow.w / 2, arrow.y + arrow.h / 2);
      await sleep(600);
      const rows = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control^="menu."], .ts-picker [data-control], .ts-popover [data-control]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map(
            (el) =>
              `${el.getAttribute('data-control')}${el.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''}`,
          )
          .slice(0, 30),
      );
      const shot = await t.shot('mask-menu');
      const first = rows.find(
        (r) => /mask/i.test(r) && !/disabled/.test(r) && !/maskImage$/.test(r.replace('menu.', '')),
      );
      let masked = null;
      if (first) {
        await t.clickControl(first.replace(/\(disabled\)$/, ''));
        await sleep(900);
        const sub = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control^="menu."], .ts-picker [data-control], .ts-popover [data-control]',
            ),
          ]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control'))
            .slice(0, 30),
        );
        const cell =
          sub.find((c) => /ellipse|circle|round/i.test(c)) ??
          sub.find((c) => /mask\.|shape/i.test(c) && !/maskImage$/.test(c));
        if (cell) {
          await t.clickControl(cell);
          await sleep(900);
        }
        await t.settled();
        masked = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block?.mask ?? null;
      }
      const shot2 = await t.shot('mask-after');
      await t.closeMenus();
      return {
        ok: masked !== null,
        observed: `rows ${rows.join(',')}; mask ${JSON.stringify(masked)}; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 6. Transparency and the Format options sections
  await t.step(
    'Image options: the Format options sections; drag Transparency to about 40 percent',
    'sections Size, Position, Picture, Adjustments; the picture draws at 0.6 opacity',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      await t.clickControl('toolbar.imageOptions');
      await sleep(700);
      const sections = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="panel.formatOptions"] .ts-panel-section-head',
          ),
        ].map((h) => h.textContent?.trim()),
      );
      const slider = await t.rectOf('[data-control="formatOptions.adjustments.transparency"]');
      if (!slider) {
        const head = page
          .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
            hasText: /adjust/i,
          })
          .first();
        if ((await head.count()) > 0) {
          await head.click();
          await sleep(400);
        }
      }
      const r = await t.rectOf('[data-control="formatOptions.adjustments.transparency"]');
      if (!r)
        return { ok: false, observed: `no Transparency slider; sections ${sections.join(', ')}` };
      const track = await page.evaluate(() => {
        const el = document.querySelector(
          '[data-control="formatOptions.adjustments.transparency"]',
        );
        const input = el.matches('input') ? el : el.querySelector('input');
        const rr = (input ?? el).getBoundingClientRect();
        return {
          x: rr.x,
          y: rr.y,
          w: rr.width,
          h: rr.height,
          min: input?.min,
          max: input?.max,
          value: input?.value,
        };
      });
      const from = {
        x: track.x + track.w * (Number(track.value ?? 0) / Number(track.max ?? 100) || 0.02),
        y: track.y + track.h / 2,
      };
      await t.drag(from, { x: track.x + track.w * 0.4, y: track.y + track.h / 2 });
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      const box = await t.boxOf(pic.id);
      const shot = await t.shot('transparency');
      return {
        ok: Boolean(block?.adjust?.transparency),
        observed: `sections ${sections.join(', ')}; adjust ${JSON.stringify(block?.adjust ?? null)}; img opacity ${box?.img?.opacity}; recolor control ${await t.has('[data-control="formatOptions.adjustments.recolor"]')}; ${shot}`,
      };
    },
  );

  // ---- 7. Border (switch on)
  await t.step(
    'Border color from the toolbar with the switch on',
    'a frame colour is written and drawn',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      const r = await t.rectOf('[data-control="toolbar.borderColor"]');
      if (!r) return { ok: false, observed: 'no Border color control with the switch on' };
      await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
      await sleep(600);
      const cells = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.ts-picker [data-control], .ts-popover [data-control], [role="menu"] [data-control]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control'))
          .slice(0, 30),
      );
      const shot = await t.shot('border-color-picker');
      const cell =
        cells.find((c) => /ink|black/i.test(c)) ?? cells.find((c) => !/none|close/i.test(c));
      if (cell) {
        await t.clickControl(cell);
        await sleep(700);
      }
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      const frame = await page.evaluate((id) => {
        const inner = document.querySelector(
          `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
        );
        const free = inner?.closest('.free') ?? inner;
        const cs = free ? getComputedStyle(free) : null;
        const img = inner?.querySelector('img') ?? inner;
        const ics = img ? getComputedStyle(img) : null;
        return {
          free: cs
            ? `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor} outline ${cs.outlineWidth}`
            : null,
          img: ics
            ? `${ics.borderWidth} ${ics.borderStyle} ${ics.borderColor} outline ${ics.outlineWidth} shadow ${ics.boxShadow}`
            : null,
        };
      }, pic.id);
      const shot2 = await t.shot('border-applied');
      await t.closeMenus();
      return {
        ok: Boolean(block?.frame ?? block?.border),
        observed: `cells ${cells.join(',')}; picked ${cell}; frame ${JSON.stringify(block?.frame ?? block?.border ?? null)}; drawn ${JSON.stringify(frame)}; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 8. Alt text on the picture
  await t.step(
    'Alt text on the picture (Format options)',
    'the description writes to the block',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      if (!(await t.visible('[data-control="panel.formatOptions"]'))) {
        await t.clickControl('toolbar.imageOptions');
        await sleep(600);
      }
      if (!(await t.visible('[data-control="formatOptions.altText.description"]'))) {
        const head = page
          .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
            hasText: /alt text/i,
          })
          .first();
        if ((await head.count()) > 0) {
          await head.click();
          await sleep(400);
        }
      }
      const field = await t.rectOf('[data-control="formatOptions.altText.description"]');
      const sections = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="panel.formatOptions"] .ts-panel-section-head',
          ),
        ].map((h) => h.textContent?.trim()),
      );
      if (!field)
        return { ok: false, observed: `no Alt text field; sections ${sections.join(', ')}` };
      await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
      await t.typeHuman('Acme logo, dark on white');
      await t.press('Tab');
      await t.settled();
      const block = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      const shot = await t.shot('picture-alt-text');
      return {
        ok: typeof block?.alt === 'string' && /Acme/.test(block.alt),
        observed: `alt "${block?.alt}"; sections ${sections.join(', ')}; ${shot}`,
      };
    },
  );
  await t.press('Escape', 2);

  // ---- 9. Drag and drop a file onto the empty sheet (a DataTransfer built in the page)
  const dropFile = async (file, sx, sy) => {
    const p = await t.sheetPoint(sx, sy);
    const bytes = pngFixture();
    const handle = await page.evaluateHandle(
      async ([b64, name]) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([arr], name, { type: 'image/png' }));
        return dt;
      },
      [bytes.toString('base64'), path.basename(file)],
    );
    const target = await page.evaluateHandle(
      ([x, y]) => document.elementFromPoint(x, y),
      [p.x, p.y],
    );
    await t.moveHuman({ x: p.x - 200, y: p.y - 100 }, p, 8);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      await page.evaluate(
        ([el, dt, ty, x, y]) => {
          const ev = new DragEvent(ty, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: dt,
          });
          el.dispatchEvent(ev);
        },
        [target, handle, type, p.x, p.y],
      );
      await sleep(120);
    }
    return p;
  };
  await t.step(
    'Drag a PNG from the desktop and drop it on the empty sheet',
    'a new picture lands at the drop point',
    async () => {
      const before = (await t.objectsOf(X)).map((o) => o.id);
      const p = await dropFile(PNG_A, 1200, 650);
      const obj = await t.newObjectAfter(X, before, 30_000);
      await t.settled();
      const shot = await t.shot('drop-on-sheet');
      return {
        ok: Boolean(obj),
        observed: `${obj ? `${obj.type} ${obj.id} pos ${JSON.stringify(obj.pos)}` : `no block; snackbar "${await t.snackbar()}"`}; dropped at viewport ${Math.round(p.x)},${Math.round(p.y)}; ${shot}`,
      };
    },
  );

  // ---- 10. Drop a file onto the existing picture (replace and keep the frame)
  await t.step(
    'Drop a PNG onto the existing picture',
    'the picture is replaced and keeps its box (design rule 13)',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.press('Escape', 2);
      const before = (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block;
      const count = (await t.objectsOf(X)).length;
      const box = await t.boxOf(pic.id);
      const sheet = await t.sheetRect();
      const kk = sheet.w / 1600;
      const sx = (box.inner.x + box.inner.w / 2 - sheet.x) / kk;
      const sy = (box.inner.y + box.inner.h / 2 - sheet.y) / kk;
      await dropFile(PNG_B, sx, sy);
      const after = await t.pollUntil(
        async () => (await t.objectsOf(X)).find((o) => o.id === pic.id)?.block,
        (bl) =>
          JSON.stringify(bl?.asset ?? bl?.assetId ?? bl?.src) !==
          JSON.stringify(before?.asset ?? before?.assetId ?? before?.src),
        25_000,
      );
      await t.settled();
      const countAfter = (await t.objectsOf(X)).length;
      const shot = await t.shot('drop-on-picture');
      const replaced =
        JSON.stringify(after?.asset ?? after?.assetId ?? after?.src) !==
        JSON.stringify(before?.asset ?? before?.assetId ?? before?.src);
      return {
        ok: replaced && countAfter === count,
        observed: `asset changed ${replaced}; objects ${count} -> ${countAfter}; pos ${JSON.stringify(before?.pos)} -> ${JSON.stringify(after?.pos)}; snackbar "${await t.snackbar()}"; ${shot}`,
      };
    },
  );

  // ---- 11. Paste a PNG from the clipboard
  await t.step(
    'Copy a PNG to the clipboard and press Cmd+V on the sheet',
    'a new picture lands',
    async () => {
      await t.press('Escape', 2);
      const before = (await t.objectsOf(X)).map((o) => o.id);
      const p = await t.sheetPoint(300, 700);
      await t.clickAt(p.x, p.y);
      const wrote = await page.evaluate(async (b64) => {
        try {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': new Blob([arr], { type: 'image/png' }) }),
          ]);
          return 'ok';
        } catch (e) {
          return String(e);
        }
      }, pngFixture().toString('base64'));
      await t.press('Meta+v');
      const obj = await t.newObjectAfter(X, before, 30_000);
      await t.settled();
      const shot = await t.shot('paste-picture');
      return {
        ok: Boolean(obj),
        observed: `clipboard.write ${wrote}; ${obj ? `${obj.type} ${obj.id} pos ${JSON.stringify(obj.pos)}` : `no block; snackbar "${await t.snackbar()}"`}; ${shot}`,
      };
    },
  );

  // ---- 12. Insert > Image > By URL (switch on), typed at human speed
  await t.step(
    'Insert > Image > By URL with a PNG on generaltranslation.com, typed at human speed',
    'a preview, then Insert lands the picture; the preview does not fetch every partial address',
    async () => {
      const before = (await t.objectsOf(X)).map((o) => o.id);
      const errBefore = consoleErrors.length;
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.byUrl"]');
      await t.clickRow('insert.image.byUrl');
      await page.locator('[data-control="dialog.imageByUrl.url"]').waitFor({ timeout: 8000 });
      await t.clickControl('dialog.imageByUrl.url');
      const url = 'https://generaltranslation.com/api/og-home';
      await t.typeHuman(url);
      await sleep(1500);
      const partialFetches = consoleErrors
        .slice(errBefore)
        .filter((e) => /ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(e)).length;
      const shot = await t.shot('image-by-url');
      const insert = page.locator('[role="dialog"] button:has-text("Insert")').first();
      const t0 = Date.now();
      if ((await insert.count()) > 0) await insert.click();
      const obj = await t.newObjectAfter(X, before, 40_000);
      const dialogOpen = await t.visible('[data-control="dialog.imageByUrl.url"]');
      const dialogText = dialogOpen
        ? await page.evaluate(() =>
            document
              .querySelector('[role="dialog"]')
              ?.textContent?.replace(/\s+/g, ' ')
              .slice(0, 300),
          )
        : null;
      const shot2 = await t.shot('image-by-url-after');
      await t.closeDialogs();
      await t.settled();
      return {
        ok: Boolean(obj),
        observed: `partial address console errors while typing ${partialFetches}; ${obj ? `${obj.type} ${obj.id} in ${Date.now() - t0} ms` : 'no block within 40 s'}; dialog still open ${dialogOpen} "${dialogText}"; ${shot}; ${shot2}`,
      };
    },
  );

  // ---- 13. Insert > Video with the switch on: the tooltip
  await t.step(
    'Insert > Video: the row and its sentence',
    'a Later stub with its clause; no dialog opens on a click',
    async () => {
      await t.openMenu('insert');
      const rows = await t.menuRows('insert');
      const video = rows.find((r) => r.id === 'insert.video');
      const tip = video ? await t.rowTooltip('insert.video') : null;
      if (video) await t.clickRow('insert.video');
      await sleep(500);
      const dialog = await page.evaluate(
        () =>
          [...document.querySelectorAll('[role="dialog"]')].filter(
            (el) => el.getClientRects().length > 0,
          ).length,
      );
      await t.closeMenus();
      return {
        ok: Boolean(video?.disabled),
        observed: `${JSON.stringify(video)}; tooltip "${tip}"; dialogs after the click ${dialog}`,
      };
    },
  );

  // ---- 14. the picture in the show and after a reload
  await t.step(
    'Reload the editor and count the pictures; open the show',
    'every picture survives the reload and draws in the show',
    async () => {
      const n = (await pictures()).length;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.settled();
      const after = (await pictures()).length;
      const imgs = await page.evaluate(
        () => document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide img').length,
      );
      await t.clickControl('title.slideshow');
      await page
        .waitForSelector('.ts-slideshow, [data-control="present.toolbar"]', { timeout: 15_000 })
        .catch(() => undefined);
      await sleep(1500);
      const showImgs = await page.evaluate(
        () =>
          document.querySelectorAll('.ts-slideshow img, [data-control="present.toolbar"] ~ * img')
            .length,
      );
      const shot = await t.shot('pictures-in-show');
      await t.press('Escape');
      await sleep(500);
      return {
        ok: after === n && n > 0,
        observed: `pictures ${n} -> ${after} after the reload; img elements on the sheet ${imgs}; in the show ${showImgs}; ${shot}`,
      };
    },
  );

  table.record(
    'console errors of the run',
    'recorded',
    `${consoleErrors.length}: ${consoleErrors.slice(0, 6).join(' || ')}`,
    true,
  );
} finally {
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(
    path.join(EVIDENCE, 'pictures-console.json'),
    JSON.stringify(consoleErrors, null, 2),
  );
  process.exitCode = out.failed > 0 ? 1 : 0;
}

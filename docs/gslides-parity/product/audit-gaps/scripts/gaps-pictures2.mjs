// The picture rows, second pass: the first pass (pictures.json) read the converted grammar mark
// instead of the uploaded shot, so every tail row is redone here on the shot: replace from the
// toolbar, crop, mask, transparency, border, alt text, a drop onto the picture, the reload and the
// show. One scratch deck from /new, trashed and deleted forever in the finally block.
//   node gaps-pictures2.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, EVIDENCE, bind, cleanupDeck, launch, makeTable, newDeck, pngFixture, sleep } from './lib.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const PNG_A = path.join(here, 'picture-a.png');
const PNG_B = path.join(here, 'picture-b.png');
writeFileSync(PNG_A, pngFixture());
const b = pngFixture();
writeFileSync(PNG_B, Buffer.concat([b.subarray(0, 40), Buffer.from([0x01]), b.subarray(41)]));

const table = makeTable('pictures2');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
const brief = (block) => {
  if (!block) return 'null';
  const { id, type, asset, pos, trim, crop, mask, adjust, frame, border, alt } = block;
  return JSON.stringify({ id, type, asset, pos, trim, crop, mask, adjust, frame, border, alt });
};
try {
  deck = await newDeck(t, 'Acme renewal: logos and screenshots');
  table.record('a scratch deck from /new', 'the address moves to /edit/<id>', `${deck.id}; ${page.url().replace(BASE, '')}`, /\/edit\//.test(page.url()));
  const X = deck.titleSlide;
  await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);
  const chooseFile = async (file, trigger) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15_000 }), trigger()]);
    await chooser.setFiles(file);
  };
  const shotOf = async (id) => (await t.objectsOf(X)).find((o) => o.id === id)?.block ?? null;

  let pic = null;
  await t.step('Insert > Image > Upload from computer with a PNG: the block that lands', 'a shot block with the asset, 480 by 300 at the content origin', async () => {
    const before = (await t.objectsOf(X)).map((o) => o.id);
    const t0 = Date.now();
    await t.openMenu('insert');
    await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
    await chooseFile(PNG_A, () => t.clickRow('insert.image.upload'));
    const obj = await t.newObjectAfter(X, before, 30_000, 'shot');
    await t.settled();
    pic = obj;
    const all = (await t.objectsOf(X)).map((o) => `${o.type}:${o.id}`);
    const shot = await t.shot('uploaded');
    return { ok: Boolean(obj), observed: `${obj ? brief(obj.block) : 'no shot'} in ${Date.now() - t0} ms; objects now ${all.join(',')}; snackbar "${await t.snackbar()}"; ${shot}` };
  });

  await t.step('Toolbar Replace image > Upload from computer with a second PNG', 'the asset changes and the box keeps its frame', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.selectObject(pic.id);
    const before = await shotOf(pic.id);
    await t.clickControl('toolbar.replaceImage');
    await sleep(600);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu."]')].filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-control')));
    const uploadRow = rows.find((r) => /upload/i.test(r));
    const shot0 = await t.shot('replace-menu');
    if (!uploadRow) { await t.closeMenus(); return { ok: false, observed: `no Upload row after the click; rows ${rows.join(',')}; ${shot0}` }; }
    const t0 = Date.now();
    await chooseFile(PNG_B, () => t.clickControl(uploadRow));
    const after = await t.pollUntil(() => shotOf(pic.id), (bl) => bl?.asset !== before?.asset, 30_000);
    await t.settled();
    const shot = await t.shot('replaced');
    return { ok: after?.asset !== before?.asset && JSON.stringify(after?.pos) === JSON.stringify(before?.pos), observed: `rows ${rows.join(',')}; asset ${before?.asset} -> ${after?.asset} in ${Date.now() - t0} ms; pos ${JSON.stringify(before?.pos)} -> ${JSON.stringify(after?.pos)}; snackbar "${await t.snackbar()}"; ${shot0}; ${shot}` };
  });

  await t.step('Crop: double click the picture, drag the east crop edge 100 sheet px in, Enter', 'crop mode, the frame narrows, the trim is written and the box shrinks', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.press('Escape', 2);
    const b0 = await t.boxOf(pic.id);
    await t.dblclickAt(b0.inner.x + b0.inner.w / 2, b0.inner.y + b0.inner.h / 2);
    await sleep(500);
    const handles = await t.handleControls();
    const chip = await t.chip();
    const east = handles.find((c) => /crop\.e$/.test(c));
    if (!east) { await t.press('Escape'); return { ok: false, observed: `no crop handles; ${handles.join(',')}; chip "${chip}"` }; }
    const r = await t.rectOf(`.ts-overlay [data-control="${east}"]`);
    const kk = (await t.sheetRect()).w / 1600;
    await t.drag(t.center(r), { x: r.x + r.w / 2 - 100 * kk, y: r.y + r.h / 2 });
    const shot = await t.shot('crop-dragged');
    await t.press('Enter');
    await t.settled();
    const block = await shotOf(pic.id);
    return { ok: Boolean(block?.trim || block?.crop), observed: `chip "${chip}"; ${brief(block)}; ${shot}` };
  });

  await t.step('Undo the crop from the toolbar', 'the trim leaves and the box returns', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.clickControl('toolbar.undo');
    await t.settled();
    const block = await shotOf(pic.id);
    return { ok: !block?.trim && !block?.crop, observed: brief(block) };
  });

  await t.step('Mask image with the switch on: the Crop image arrow, Ellipse', 'the picture takes an ellipse mask and draws inside it', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.setAdvanced(true);
    await t.selectObject(pic.id);
    const arrow = await t.rectOf('[data-control="toolbar.cropImage.arrow"]');
    if (!arrow) return { ok: false, observed: 'no Crop image arrow' };
    await t.clickAt(arrow.x + arrow.w / 2, arrow.y + arrow.h / 2);
    await sleep(600);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-control^="menu.format.image.maskImage"], [data-control^="format.image.maskImage"]')].filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-control')));
    const shot = await t.shot('mask-menu');
    const ellipse = rows.find((c) => /ellipse/.test(c));
    if (!ellipse) { await t.closeMenus(); return { ok: false, observed: `no ellipse cell; rows ${rows.slice(0, 12).join(',')}` }; }
    await t.clickControl(ellipse);
    await sleep(900);
    await t.settled();
    const block = await shotOf(pic.id);
    const drawn = await page.evaluate((id) => { const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`); if (!inner) return null; const img = inner.querySelector('img') ?? inner; const cs = getComputedStyle(img); const free = inner.closest('.free') ?? inner; const fc = getComputedStyle(free); return { clipPath: cs.clipPath, mask: cs.maskImage || cs.webkitMaskImage, freeClip: fc.clipPath, svgClip: inner.querySelector('clipPath, mask') !== null }; }, pic.id);
    const shot2 = await t.shot('mask-applied');
    await t.closeMenus();
    return { ok: Boolean(block?.mask), observed: `cells ${rows.length}; ${brief(block)}; drawn ${JSON.stringify(drawn)}; ${shot}; ${shot2}` };
  });

  await t.step('Image options: the sections; drag Transparency to about 40 percent', 'adjust.transparency about 0.4 and the picture at 0.6 opacity', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.selectObject(pic.id);
    await t.clickControl('toolbar.imageOptions');
    await sleep(700);
    const sections = await page.evaluate(() => [...document.querySelectorAll('[data-control="panel.formatOptions"] .ts-panel-section-head')].map((h) => h.textContent?.trim()));
    if (!(await t.visible('[data-control="formatOptions.adjustments.transparency"]'))) {
      const head = page.locator('[data-control="panel.formatOptions"] .ts-panel-section-head', { hasText: /adjust/i }).first();
      if ((await head.count()) > 0) { await head.click(); await sleep(400); }
    }
    const track = await page.evaluate(() => { const el = document.querySelector('[data-control="formatOptions.adjustments.transparency"]'); if (!el) return null; const input = el.matches('input') ? el : el.querySelector('input'); const rr = (input ?? el).getBoundingClientRect(); return { x: rr.x, y: rr.y, w: rr.width, h: rr.height, min: input?.min, max: input?.max, value: input?.value, tag: (input ?? el).tagName }; });
    if (!track) return { ok: false, observed: `no Transparency slider; sections ${sections.join(', ')}` };
    const from = { x: track.x + 4, y: track.y + track.h / 2 };
    await t.drag(from, { x: track.x + track.w * 0.4, y: track.y + track.h / 2 });
    await t.settled();
    const block = await shotOf(pic.id);
    const box = await t.boxOf(pic.id);
    const shot = await t.shot('transparency');
    return { ok: typeof block?.adjust?.transparency === 'number', observed: `sections ${sections.join(', ')}; track ${JSON.stringify(track)}; ${brief(block)}; img ${JSON.stringify(box?.img)}; recolor ${await t.has('[data-control="formatOptions.adjustments.recolor"]')}; ${shot}` };
  });

  await t.step('Border color from the toolbar with the switch on', 'a frame colour is written and drawn around the picture', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.selectObject(pic.id);
    const r = await t.rectOf('[data-control="toolbar.borderColor"]');
    if (!r) return { ok: false, observed: 'no Border color control' };
    await t.clickAt(r.x + r.w / 2, r.y + r.h / 2);
    await sleep(600);
    const cells = await page.evaluate(() => [...document.querySelectorAll('.ts-ctl-swatches button, [data-control^="toolbar.borderColor."]')].filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-control') ?? el.getAttribute('aria-label')));
    const shot = await t.shot('border-picker');
    const cell = cells.find((c) => /\.ink$|\bink\b/.test(c ?? '')) ?? cells.find((c) => c && !/none|hex|custom/i.test(c));
    if (cell) {
      const loc = cell.startsWith('toolbar.') ? page.locator(`[data-control="${cell}"]`) : page.locator(`.ts-ctl-swatches button[aria-label="${cell}"]`);
      const rr = await loc.first().boundingBox();
      if (rr) await t.clickAt(rr.x + rr.width / 2, rr.y + rr.height / 2);
      await sleep(700);
    }
    await t.settled();
    const block = await shotOf(pic.id);
    const drawn = await page.evaluate((id) => { const inner = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`); if (!inner) return null; const free = inner.closest('.free') ?? inner; const img = inner.querySelector('img') ?? inner; const a = getComputedStyle(free); const c = getComputedStyle(img); return { free: `${a.borderWidth} ${a.borderStyle} ${a.borderColor}; outline ${a.outlineWidth} ${a.outlineColor}; shadow ${a.boxShadow}`, img: `${c.borderWidth} ${c.borderStyle} ${c.borderColor}; outline ${c.outlineWidth}; shadow ${c.boxShadow}`, frameEl: inner.querySelector('.ts-frame, [data-frame], rect') !== null }; }, pic.id);
    const shot2 = await t.shot('border-applied');
    await t.closeMenus();
    return { ok: Boolean(block?.frame ?? block?.border), observed: `cells ${cells.join(',')}; picked ${cell}; ${brief(block)}; drawn ${JSON.stringify(drawn)}; ${shot}; ${shot2}` };
  });

  await t.step('Alt text on the picture (Format options > Alt text)', 'the description writes to the block', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    await t.selectObject(pic.id);
    if (!(await t.visible('[data-control="panel.formatOptions"]'))) { await t.clickControl('toolbar.imageOptions'); await sleep(600); }
    if (!(await t.visible('[data-control="formatOptions.altText.description"]'))) {
      const head = page.locator('[data-control="panel.formatOptions"] .ts-panel-section-head', { hasText: /alt text/i }).first();
      if ((await head.count()) > 0) { await head.click(); await sleep(400); }
    }
    const field = await t.rectOf('[data-control="formatOptions.altText.description"]');
    if (!field) return { ok: false, observed: 'no Alt text field' };
    const before = await page.evaluate(() => document.querySelector('[data-control="formatOptions.altText.description"]')?.value ?? null);
    await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
    await t.press('Meta+a');
    await t.typeHuman('Acme logo, dark on white');
    await t.press('Tab');
    await t.settled();
    const block = await shotOf(pic.id);
    const asset = await page.evaluate((id) => window.turboslide.studio.describe().state?.document?.deck?.assets?.[id] ?? null, block?.asset).catch(() => null);
    const shot = await t.shot('alt-text');
    return { ok: /Acme/.test(JSON.stringify(block) + JSON.stringify(asset)), observed: `field before "${before}"; ${brief(block)}; asset record alt "${asset?.alt}"; ${shot}` };
  });
  await t.press('Escape', 2);

  const dropFile = async (name, sx, sy) => {
    const p = await t.sheetPoint(sx, sy);
    const bytes = name === 'b' ? Buffer.concat([b.subarray(0, 40), Buffer.from([0x01]), b.subarray(41)]) : pngFixture();
    const handle = await page.evaluateHandle(async ([b64, fname]) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([arr], fname, { type: 'image/png' }));
      return dt;
    }, [bytes.toString('base64'), `dropped-${name}.png`]);
    const target = await page.evaluateHandle(([x, y]) => document.elementFromPoint(x, y), [p.x, p.y]);
    await t.moveHuman({ x: p.x - 200, y: p.y - 100 }, p, 8);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      await page.evaluate(([el, dt, ty, x, y]) => { el.dispatchEvent(new DragEvent(ty, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt })); }, [target, handle, type, p.x, p.y]);
      await sleep(120);
    }
    return p;
  };
  await t.step('Drop a PNG onto the existing picture', 'the picture is replaced and keeps its box; no new object', async () => {
    if (!pic) return { ok: false, observed: 'no picture' };
    const before = await shotOf(pic.id);
    const count = (await t.objectsOf(X)).length;
    const box = await t.boxOf(pic.id);
    const sheet = await t.sheetRect();
    const kk = sheet.w / 1600;
    await dropFile('a', (box.inner.x + box.inner.w / 2 - sheet.x) / kk, (box.inner.y + box.inner.h / 2 - sheet.y) / kk);
    const after = await t.pollUntil(() => shotOf(pic.id), (bl) => bl?.asset !== before?.asset, 25_000);
    await t.settled();
    const countAfter = (await t.objectsOf(X)).length;
    const shot = await t.shot('drop-on-picture');
    return { ok: after?.asset !== before?.asset && countAfter === count, observed: `asset ${before?.asset} -> ${after?.asset}; objects ${count} -> ${countAfter}; pos ${JSON.stringify(before?.pos)} -> ${JSON.stringify(after?.pos)}; ${shot}` };
  });

  await t.step('Reload; the pictures survive; the show draws them', 'the shot count holds after the reload and the show draws the picture', async () => {
    const n = (await t.objectsOf(X)).filter((o) => o.type === 'shot').length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await t.editorReady();
    await t.settled();
    const after = (await t.objectsOf(X)).filter((o) => o.type === 'shot').length;
    const show = await t.openShow();
    const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].filter((el) => el.getClientRects().length > 0 && el.closest('.ts-filmstrip, [data-control="filmstrip"]') === null).length);
    const shot = await t.shot('show-with-picture');
    await t.press('Escape');
    await sleep(500);
    return { ok: after === n && n > 0 && show, observed: `shots ${n} -> ${after}; show ${show}; visible img elements ${imgs}; ${shot}` };
  });

  table.record('console errors of the run', 'recorded', `${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(' || ')}`, true);
} finally {
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(path.join(EVIDENCE, 'pictures2-console.json'), JSON.stringify(consoleErrors, null, 2));
  process.exitCode = out.failed > 0 ? 1 : 0;
}

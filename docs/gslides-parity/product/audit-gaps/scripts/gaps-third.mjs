// The third pass of the feature gaps audit: the rows the first two passes could not read cleanly.
// The owner's editor at 375 by 812 and 1280 by 800 (the same session, so the editor and not the
// viewer), the Transparency slider scrolled into view, alt text on a picture and a text box read
// through the field and the block, the routes to a link on a block (toolbar and right click), the
// show without the network from the first slide, the show's Options > More rows, File > Open with
// a .pptx through the Open button, the note text in the viewer page, a comment resolved, Replace
// image through the right click menu. One scratch deck from /new, trashed and deleted forever in
// the finally block.
//   node gaps-third.mjs
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
  request,
  sleep,
} from './lib.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const PPTX = path.join(here, '01-text.pptx');
const PNG_A = path.join(here, 'picture-a.png');
const PNG_B = path.join(here, 'picture-b.png');
writeFileSync(PNG_A, pngFixture());
const b = pngFixture();
writeFileSync(PNG_B, Buffer.concat([b.subarray(0, 40), Buffer.from([0x01]), b.subarray(41)]));

const table = makeTable('third');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
const brief = (block) => {
  if (!block) return 'null';
  const { id, type, asset, pos, alt, link, adjust, autofit } = block;
  return JSON.stringify({ id, type, asset, pos, alt, link, adjust, autofit });
};
const blockOf = async (slideId, id) =>
  (await t.objectsOf(slideId)).find((o) => o.id === id)?.block ?? null;
const readToolbar = () =>
  page.evaluate(() => {
    const se = document.scrollingElement;
    const vis = (sel) => {
      const el = document.querySelector(sel);
      return el !== null && el.getClientRects().length > 0;
    };
    return {
      innerWidth,
      scrollWidth: se?.scrollWidth,
      horizontalOverflow: (se?.scrollWidth ?? 0) > innerWidth + 1,
      mode: document.querySelector('[data-edit-mode]')?.getAttribute('data-edit-mode') ?? null,
      menus: [...document.querySelectorAll('[data-control^="menubar."]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-control').replace('menubar.', '')),
      toolbar: [...document.querySelectorAll('[data-control^="toolbar."]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-control').replace('toolbar.', '')),
      filmstrip: vis('[data-control="filmstrip"]'),
      notes: vis('[data-control="notes.text"]'),
      slideshow: vis('[data-control="present.open"]'),
      share: vis('[data-control="title.share"]'),
      sheet: (() => {
        const el = document.querySelector('.ts-stagewrap .pt-slide');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      })(),
    };
  });
try {
  deck = await newDeck(t, 'Acme QBR: pipeline and renewal');
  table.record(
    'a scratch deck from /new',
    'the address moves to /edit/<id>',
    `${deck.id}; ${page.url().replace(BASE, '')}`,
    /\/edit\//.test(page.url()),
  );
  const X = deck.titleSlide;
  await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);
  const chooseFile = async (file, trigger) => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15_000 }),
      trigger(),
    ]);
    await chooser.setFiles(file);
  };

  // ---- 1. a note, a second slide, a picture and a text box for the rows below
  let pic = null;
  let boxId = null;
  await t.step(
    'Setup: a note, a second slide, a picture by upload, a text box',
    'the objects the rows below need',
    async () => {
      const field = await t.rectOf('[data-control="notes.text"]');
      await t.clickAt(field.x + field.w / 2, field.y + field.h / 2);
      await t.typeHuman('Open with the renewal date.');
      await t.press('Tab');
      await t.settled();
      await t.invoke('slide.new', {
        layout: 'split',
        after: X,
        baseRevision: (await t.state()).revision,
      });
      await t.settled();
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(500);
      const before = (await t.objectsOf(X)).map((o) => o.id);
      await t.openMenu('insert');
      await t.hoverRow('insert.image', '[data-control="menu.insert.image.upload"]');
      await chooseFile(PNG_A, () => t.clickRow('insert.image.upload'));
      pic = await t.newObjectAfter(X, before, 30_000, 'shot');
      await t.settled();
      await t.press('Escape', 2);
      const box = await t.insertByTool(
        X,
        ['insert.textBox'],
        { x: 1000, y: 620 },
        { text: 'Renewal terms follow the master agreement.' },
      );
      boxId = box?.id ?? null;
      await t.press('Escape', 2);
      await t.settled();
      return {
        ok: Boolean(pic) && Boolean(boxId),
        observed: `picture ${pic ? brief(pic.block) : null}; text box ${boxId}; slides ${(await t.slideIds()).join(',')}`,
      };
    },
  );

  // ---- 2. the owner's editor at 375 by 812 and 1280 by 800
  await t.step(
    'The owner editor at 375 by 812 (the same session)',
    'the toolbar folds, no horizontal overflow, the sheet fits the width',
    async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await sleep(1500);
      const facts = await readToolbar();
      const shot = await t.shot('owner-editor-375');
      const p = await t.sheetPoint(800, 450).catch(() => null);
      let tap = null;
      if (p) {
        await t.clickAt(p.x, p.y);
        await sleep(500);
        tap = {
          chip: await t.chip(),
          editing: await t.editing(),
          handles: (await t.handleControls()).length,
        };
        await t.press('Escape', 2);
      }
      return {
        ok: !facts.horizontalOverflow,
        observed: `${JSON.stringify(facts)}; a click on the sheet ${JSON.stringify(tap)}; ${shot}`,
      };
    },
  );
  await t.step(
    'The owner editor at 1280 by 800 with the title selected',
    'the text tail fits or folds into More',
    async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await sleep(1200);
      const info = await t.runInfo(deck.headRun);
      if (info) {
        await t.clickAt(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
        if (await t.editing()) await t.press('Escape');
      }
      await sleep(400);
      const facts = await readToolbar();
      const shot = await t.shot('owner-editor-1280-text-tail');
      await t.press('Escape', 2);
      await page.setViewportSize({ width: 1440, height: 900 });
      await sleep(1000);
      return {
        ok: !facts.horizontalOverflow,
        observed: `chip "${await t.chip()}"; ${JSON.stringify(facts)}; ${shot}`,
      };
    },
  );

  // ---- 3. transparency with the slider scrolled into view
  await t.step(
    'Image options > Adjustments > Transparency scrolled into view, dragged to about 40 percent',
    'adjust.transparency about 0.4; the picture at 0.6 opacity',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      if (!(await t.visible('[data-control="panel.formatOptions"]'))) {
        await t.clickControl('toolbar.imageOptions');
        await sleep(700);
      }
      const el = page.locator('[data-control="formatOptions.adjustments.transparency"]').first();
      if ((await el.count()) === 0) {
        const head = page
          .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
            hasText: /adjust/i,
          })
          .first();
        if ((await head.count()) > 0) {
          await head.scrollIntoViewIfNeeded();
          await head.click();
          await sleep(400);
        }
      }
      await el.scrollIntoViewIfNeeded();
      await sleep(300);
      const track = await el.evaluate((node) => {
        const input = node.matches('input') ? node : node.querySelector('input');
        const r = (input ?? node).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          value: input?.value,
          min: input?.min,
          max: input?.max,
          step: input?.step,
          type: input?.type,
        };
      });
      await t.drag(
        { x: track.x + 3, y: track.y + track.h / 2 },
        { x: track.x + track.w * 0.4, y: track.y + track.h / 2 },
      );
      await t.settled();
      const block = await blockOf(X, pic.id);
      const box = await t.boxOf(pic.id);
      const shot = await t.shot('transparency');
      return {
        ok: typeof block?.adjust?.transparency === 'number' && block.adjust.transparency > 0,
        observed: `track ${JSON.stringify(track)}; ${brief(block)}; img ${JSON.stringify(box?.img)}; ${shot}`,
      };
    },
  );

  // ---- 4. alt text on the picture and on the text box
  const altRow = async (label, id) => {
    await t.selectObject(id);
    if (!(await t.visible('[data-control="panel.formatOptions"]'))) {
      await t
        .clickControl('toolbar.formatOptions')
        .catch(() => t.clickControl('toolbar.imageOptions'));
      await sleep(700);
    }
    let field = page.locator('[data-control="formatOptions.altText.description"]').first();
    if ((await field.count()) === 0) {
      const head = page
        .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
          hasText: /alt text/i,
        })
        .first();
      if ((await head.count()) > 0) {
        await head.scrollIntoViewIfNeeded();
        await head.click();
        await sleep(400);
      }
      field = page.locator('[data-control="formatOptions.altText.description"]').first();
    }
    if ((await field.count()) === 0)
      return { ok: false, observed: `no Alt text field for ${label}` };
    await field.scrollIntoViewIfNeeded();
    const before = await field.inputValue().catch(() => null);
    await field.click();
    await t.press('Meta+a');
    await t.typeHuman(`${label} description`);
    const typed = await field.inputValue().catch(() => null);
    await t.press('Tab');
    await t.settled();
    await sleep(500);
    const block = await blockOf(X, id);
    const shown = await field.inputValue().catch(() => null);
    const shot = await t.shot(`alt-${label}`);
    const stored =
      /description/.test(JSON.stringify(block ?? {})) || /description/.test(shown ?? '');
    return {
      ok: stored,
      observed: `field before "${before}", typed "${typed}", after Tab "${shown}"; ${brief(block)}; ${shot}`,
    };
  };
  await t.step('Alt text on the picture', 'the description writes and reads back', async () =>
    pic ? altRow('picture', pic.id) : { ok: false, observed: 'no picture' },
  );
  await t.step('Alt text on the text box', 'the description writes and reads back', async () =>
    boxId ? altRow('textbox', boxId) : { ok: false, observed: 'no text box' },
  );
  await t.press('Escape', 2);

  // ---- 5. the routes to a link on a block
  await t.step(
    'Link on a selected block: the toolbar Insert link button, then the right click menu',
    'a Link dialog with "Slides in this presentation" is reachable from one of them',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      await t.selectObject(boxId);
      const btn = await t.rectOf('[data-control="toolbar.insertLink"]');
      let toolbar = null;
      if (btn) {
        await t.clickAt(btn.x + btn.w / 2, btn.y + btn.h / 2);
        await sleep(700);
        toolbar = {
          popover: await t.visible('[data-control="run.link.href"]'),
          dialog: await t.visible('[data-control="dialog.link.slide"]'),
          editing: await t.editing(),
        };
        await t.shot('link-toolbar-button');
        await t.press('Escape', 2);
      }
      await t.selectObject(boxId);
      const box = await t.boxOf(boxId);
      await t.rightClickAt(box.free.x + 6, box.free.y + box.free.h / 2);
      const rows = await t.contextRows();
      const shot = await t.shot('link-context-menu');
      const linkRow = rows.find((r) => /link/i.test(r.id));
      let context = null;
      if (linkRow) {
        await t.clickContextRow(linkRow.id);
        await sleep(700);
        context = {
          popover: await t.visible('[data-control="run.link.href"]'),
          dialog: await t.visible('[data-control="dialog.link.slide"]'),
        };
      }
      await t.press('Escape', 2);
      const reached = Boolean(toolbar?.dialog || context?.dialog);
      return {
        ok: reached,
        observed: `toolbar button ${btn ? JSON.stringify(toolbar) : 'absent'}; context rows ${rows.map((r) => r.id).join(',')}; link row ${linkRow?.id ?? 'none'} -> ${JSON.stringify(context)}; ${shot}`,
      };
    },
  );

  // ---- 6. Replace image through the right click menu
  await t.step(
    'Right click the picture > Replace image > Upload from computer',
    'the asset changes within 30 s',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.press('Escape', 2);
      const before = await blockOf(X, pic.id);
      const box = await t.boxOf(pic.id);
      await t.rightClickAt(box.inner.x + box.inner.w / 2, box.inner.y + box.inner.h / 2);
      const rows = await t.contextRows();
      const replace = rows.find((r) => /replaceImage$/.test(r.id));
      if (!replace) {
        await t.press('Escape');
        return {
          ok: false,
          observed: `no Replace image row; rows ${rows.map((r) => r.id).join(',')}`,
        };
      }
      const rr = await t.rectOf(`.ts-context-menu [data-control="menu.${replace.id}"]`);
      await t.moveHuman(
        { x: rr.x - 20, y: rr.y + rr.h / 2 },
        { x: rr.x + rr.w / 2, y: rr.y + rr.h / 2 },
        6,
      );
      await sleep(600);
      const sub = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menu.format.image.replaceImage."]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      const upload = sub.find((c) => /upload/.test(c));
      if (!upload) {
        await t.press('Escape', 2);
        return { ok: false, observed: `no Upload row in the submenu; ${sub.join(',')}` };
      }
      const t0 = Date.now();
      await chooseFile(PNG_B, () => t.clickControl(upload));
      const after = await t.pollUntil(
        () => blockOf(X, pic.id),
        (bl) => bl?.asset !== before?.asset,
        30_000,
      );
      await t.settled();
      const snack = await t.snackbar();
      const shot = await t.shot('replace-context');
      return {
        ok: after?.asset !== before?.asset,
        observed: `asset ${before?.asset} -> ${after?.asset} in ${Date.now() - t0} ms; snackbar "${snack}"; network/console errors ${consoleErrors.slice(-2).join(' | ')}; ${shot}`,
      };
    },
  );

  // ---- 7. File > Open > Upload with a .pptx, then Open
  await t.step(
    'File > Open > Upload: choose the .pptx, press Open',
    'the refusal sentence, or the file opens',
    async () => {
      await t.menuPath('file', 'file.open');
      await page.locator('[role="dialog"]').first().waitFor({ timeout: 8000 });
      const up = page
        .locator(
          '[role="dialog"] [role="tab"]:has-text("Upload"), [role="dialog"] button:has-text("Upload")',
        )
        .first();
      if ((await up.count()) > 0) await up.click();
      await sleep(500);
      const input = page.locator('[data-control="dialog.open.file"]');
      await input.setInputFiles(PPTX);
      await sleep(800);
      const openBtn = page.locator('[role="dialog"] button:has-text("Open")').last();
      const disabled = await openBtn.isDisabled().catch(() => null);
      if (!disabled) await openBtn.click();
      await sleep(2500);
      const text = await page.evaluate(
        () =>
          document.querySelector('[role="dialog"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
          null,
      );
      const snack = await t.snackbar();
      const shot = await t.shot('open-pptx-open-pressed');
      await t.closeDialogs();
      return {
        ok: /PowerPoint import is not available/.test(`${text} ${snack}`),
        observed: `Open button disabled ${disabled}; dialog "${text?.slice(0, 300)}"; snackbar "${snack}"; url ${page.url().replace(BASE, '')}; ${shot}`,
      };
    },
  );

  // ---- 8. the viewer page and the note
  await t.step(
    'The view link page: does the note text travel',
    'the /deck/<id> HTML carries no speaker note',
    async () => {
      const fresh = await request.newContext();
      const res = await fresh.get(`${BASE}/deck/${deck.id}`);
      const html = await res.text();
      const notesLeak = /Open with the renewal date/.test(html);
      const present = await fresh.get(`${BASE}/deck/${deck.id}?present=1`);
      const ptext = await present.text();
      await fresh.dispose();
      return {
        ok: !notesLeak,
        observed: `GET /deck ${res.status()} ${html.length} chars, note text present ${notesLeak}, "notes" keys ${(html.match(/"notes"/g) ?? []).length}; ?present=1 ${present.status()} note present ${/Open with the renewal date/.test(ptext)}`,
      };
    },
  );

  // ---- 9. a comment on the text box, resolved
  await t.step(
    'Comment on the text box, then Resolve from the card',
    'the marker leaves or the panel lists it resolved',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(400);
      await t.selectObject(boxId);
      await t.press('Meta+Alt+m');
      await sleep(900);
      const field = page.locator('[data-control$=".field"]').last();
      if (!((await field.count()) > 0 && (await field.isVisible())))
        return { ok: false, observed: 'no comment field' };
      await field.click();
      await t.typeHuman('Check the renewal date');
      await page.locator('[data-control$=".submit"]').last().click();
      const markers = await t.pollUntil(
        () => t.count('[data-control="comment.marker"]'),
        (n) => n > 0,
        20_000,
      );
      const marker = await t.rectOf('[data-control="comment.marker"]');
      if (marker) {
        await t.clickAt(marker.x + marker.w / 2, marker.y + marker.h / 2);
        await sleep(900);
      }
      const cardControls = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="comment.card"]')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control'))
          .slice(0, 12),
      );
      const resolve = page.locator('[data-control$=".resolve"]:visible').first();
      let after = null;
      let panel = null;
      if ((await resolve.count()) > 0) {
        await resolve.click();
        await sleep(2500);
        after = await t.count('[data-control="comment.marker"]');
        await t.clickControl('title.comments').catch(() => undefined);
        await sleep(800);
        panel = await page.evaluate(
          () =>
            document
              .querySelector('[data-control="panel.comments"]')
              ?.textContent?.replace(/\s+/g, ' ')
              .slice(0, 240) ?? null,
        );
      }
      const shot = await t.shot('comment-resolve');
      await t.closeDialogs();
      return {
        ok:
          markers > 0 &&
          after !== null &&
          (after < markers || /resolved|Re-open/i.test(panel ?? '')),
        observed: `markers ${markers}; card controls ${cardControls.join(',')}; resolve found ${(await resolve.count()) > 0}; markers after ${after}; panel "${panel}"; ${shot}`,
      };
    },
  );

  // ---- 10. the show offline from the first slide, and Options > More
  await t.step(
    'Slideshow from slide 1 with the network off: ArrowRight, ArrowLeft, 2 then Enter',
    'the show pages without the network',
    async () => {
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(500);
      await t.openShow();
      await context.setOffline(true);
      await sleep(600);
      const s0 = (await t.state()).slideId;
      await t.press('ArrowRight');
      await sleep(800);
      const s1 = (await t.state()).slideId;
      await t.press('ArrowLeft');
      await sleep(800);
      const s2 = (await t.state()).slideId;
      await t.press('2');
      await t.press('Enter');
      await sleep(900);
      const s3 = (await t.state()).slideId;
      const words = await page.evaluate(
        () =>
          document.body.textContent?.match(/Reconnecting|offline|Offline/g)?.slice(0, 3) ?? null,
      );
      const shot = await t.shot('show-offline-from-first');
      await context.setOffline(false);
      await sleep(1500);
      return {
        ok: s1 !== s0 && s2 === s0 && s3 !== s0,
        observed: `slides ${s0} -> ${s1} -> ${s2} -> ${s3}; words ${JSON.stringify(words)}; ${shot}`,
      };
    },
  );
  await t.step('Show > Options > More: the rows', 'the pen or Auto-play rows, if any', async () => {
    await page.mouse.move(60, 880);
    await sleep(500);
    await page.mouse.move(80, 870);
    await sleep(600);
    const opts = await t.rectOf('[data-control="present.options"]');
    if (!opts) return { ok: false, observed: 'no options button' };
    await t.clickAt(opts.x + opts.w / 2, opts.y + opts.h / 2);
    await sleep(600);
    const more = await t.rectOf('[data-control="menu.present.options.more"]');
    if (more) {
      await t.moveHuman(
        { x: more.x - 20, y: more.y + more.h / 2 },
        { x: more.x + more.w / 2, y: more.y + more.h / 2 },
        6,
      );
      await sleep(700);
      if (!(await t.has('[data-control^="menu.present.options.more."]')))
        await t.clickAt(more.x + more.w / 2, more.y + more.h / 2);
      await sleep(600);
    }
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="menu.present."]')]
        .filter((el) => el.getClientRects().length > 0)
        .map(
          (el) =>
            `${el.getAttribute('data-control').replace('menu.', '')}${el.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''}: ${el.textContent?.trim().slice(0, 40)}`,
        ),
    );
    const shot = await t.shot('show-options-more');
    await t.press('Escape', 2);
    await sleep(500);
    return { ok: rows.length > 0, observed: `${rows.join(' | ')}; ${shot}` };
  });

  table.record(
    'console errors of the run',
    'recorded',
    `${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(' || ')}`,
    true,
  );
} finally {
  await context.setOffline(false).catch(() => undefined);
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(path.join(EVIDENCE, 'third-console.json'), JSON.stringify(consoleErrors, null, 2));
  process.exitCode = out.failed > 0 ? 1 : 0;
}

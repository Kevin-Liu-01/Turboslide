// The fourth pass of the feature gaps audit: three reads the third pass could not finish. The
// Transparency field typed (it is a text field on this build), alt text on the picture read from
// the field after a reload, and the two routes to a link on a selected block (the toolbar button
// and the right click menu) with what each opens. One scratch deck from /new, trashed and deleted
// forever in the finally block.
//   node gaps-fourth.mjs
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
writeFileSync(PNG_A, pngFixture());
const table = makeTable('fourth');
const { browser, context, page, consoleErrors } = await launch();
const t = bind(page, table);
let deck = null;
const blockOf = async (slideId, id) =>
  (await t.objectsOf(slideId)).find((o) => o.id === id)?.block ?? null;
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
  let pic = null;
  let boxId = null;
  await t.step(
    'Setup: a picture by upload and a text box',
    'the objects the rows below need',
    async () => {
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
      await t.invoke('slide.new', {
        layout: 'split',
        after: X,
        baseRevision: (await t.state()).revision,
      });
      await t.settled();
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(500);
      return {
        ok: Boolean(pic) && Boolean(boxId),
        observed: `picture ${pic?.id}; text box ${boxId}; slides ${(await t.slideIds()).join(',')}`,
      };
    },
  );

  await t.step(
    'Image options > Adjustments > Transparency: the control, then 40 typed and Enter',
    'adjust.transparency 0.4 and the picture at 0.6 opacity',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      await t.clickControl('toolbar.imageOptions');
      await sleep(700);
      const el = page.locator('[data-control="formatOptions.adjustments.transparency"]').first();
      if ((await el.count()) === 0)
        return { ok: false, observed: 'no Transparency control in the panel' };
      await el.scrollIntoViewIfNeeded();
      const facts = await el.evaluate((node) => {
        const input = node.matches('input') ? node : node.querySelector('input');
        const r = (input ?? node).getBoundingClientRect();
        return {
          tag: (input ?? node).tagName,
          type: input?.type,
          inputmode: input?.getAttribute('inputmode'),
          value: input?.value,
          w: Math.round(r.width),
          h: Math.round(r.height),
          label:
            node.getAttribute('aria-label') ??
            node.closest('label')?.textContent?.trim()?.slice(0, 40),
          siblings: [...(node.parentElement?.querySelectorAll('input, [role="slider"]') ?? [])]
            .map((s) => `${s.tagName}:${s.type}`)
            .join(','),
        };
      });
      const shot0 = await t.shot('transparency-control');
      await el.click();
      await t.press('Meta+a');
      await t.typeHuman('40');
      await t.press('Enter');
      await t.settled();
      await sleep(500);
      const block = await blockOf(X, pic.id);
      const box = await t.boxOf(pic.id);
      const shot = await t.shot('transparency-40');
      return {
        ok: typeof block?.adjust?.transparency === 'number' && block.adjust.transparency > 0.3,
        observed: `control ${JSON.stringify(facts)}; adjust ${JSON.stringify(block?.adjust ?? null)}; img opacity ${box?.img?.opacity}; ${shot0}; ${shot}`,
      };
    },
  );

  await t.step(
    'Alt text on the picture: the field, a description typed, Tab, then a reload',
    'the description reads back after the reload',
    async () => {
      if (!pic) return { ok: false, observed: 'no picture' };
      await t.selectObject(pic.id);
      if (!(await t.visible('[data-control="panel.formatOptions"]'))) {
        await t.clickControl('toolbar.imageOptions');
        await sleep(700);
      }
      const heads = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="panel.formatOptions"] .ts-panel-section-head',
          ),
        ].map((h) => `${h.textContent?.trim()}:${h.getAttribute('aria-expanded')}`),
      );
      let field = page.locator('[data-control="formatOptions.altText.description"]').first();
      if ((await field.count()) === 0) {
        const head = page
          .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
            hasText: /alt text/i,
          })
          .first();
        await head.scrollIntoViewIfNeeded();
        await head.click();
        await sleep(500);
        field = page.locator('[data-control="formatOptions.altText.description"]').first();
      }
      if ((await field.count()) === 0)
        return { ok: false, observed: `no Alt text field; heads ${heads.join(', ')}` };
      await field.scrollIntoViewIfNeeded();
      const before = await field.inputValue();
      await field.click();
      await t.press('Meta+a');
      await t.typeHuman('Acme logo, dark on white');
      await t.press('Tab');
      await t.settled();
      await sleep(600);
      const after = await field.inputValue().catch(() => null);
      const block = await blockOf(X, pic.id);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.settled();
      await t.selectObject(pic.id);
      await t.clickControl('toolbar.imageOptions');
      await sleep(700);
      let f2 = page.locator('[data-control="formatOptions.altText.description"]').first();
      if ((await f2.count()) === 0) {
        const head = page
          .locator('[data-control="panel.formatOptions"] .ts-panel-section-head', {
            hasText: /alt text/i,
          })
          .first();
        if ((await head.count()) > 0) {
          await head.scrollIntoViewIfNeeded();
          await head.click();
          await sleep(500);
        }
        f2 = page.locator('[data-control="formatOptions.altText.description"]').first();
      }
      const afterReload = (await f2.count()) > 0 ? await f2.inputValue() : null;
      const shot = await t.shot('alt-after-reload');
      return {
        ok: /Acme logo/.test(afterReload ?? ''),
        observed: `heads ${heads.join(', ')}; field "${before}" -> "${after}" -> after reload "${afterReload}"; block alt ${JSON.stringify(block?.alt ?? null)}; ${shot}`,
      };
    },
  );
  await t.press('Escape', 2);

  await t.step(
    'Link on a selected block: the toolbar Insert link button, then the right click menu',
    'a Link dialog with "Slides in this presentation" from one of the routes',
    async () => {
      if (!boxId) return { ok: false, observed: 'no text box' };
      const card = await t.rectOf(`[data-control="filmstrip.slide.${X}"]`);
      if (card) await t.clickAt(card.x + card.w / 2, card.y + card.h / 2);
      await sleep(500);
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
          popText: await page.evaluate(
            () =>
              document
                .querySelector('.ts-link-pop')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim()
                ?.slice(0, 120) ?? null,
          ),
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
      let ctx = null;
      if (linkRow) {
        await t.clickContextRow(linkRow.id);
        await sleep(700);
        ctx = {
          popover: await t.visible('[data-control="run.link.href"]'),
          dialog: await t.visible('[data-control="dialog.link.slide"]'),
        };
      }
      await t.press('Escape', 2);
      const menu = await (async () => {
        await t.menuPath('insert', 'insert.link');
        await sleep(700);
        const r = {
          popover: await t.visible('[data-control="run.link.href"]'),
          dialog: await t.visible('[data-control="dialog.link.slide"]'),
        };
        await t.press('Escape', 2);
        return r;
      })();
      return {
        ok: Boolean(toolbar?.dialog || ctx?.dialog || menu.dialog),
        observed: `toolbar button ${btn ? JSON.stringify(toolbar) : 'absent'}; context rows ${rows.map((r) => r.id).join(',')}; link row ${linkRow?.id ?? 'none'} -> ${JSON.stringify(ctx)}; Insert > Link ${JSON.stringify(menu)}; ${shot}`,
      };
    },
  );

  table.record(
    'console errors of the run',
    'recorded',
    `${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(' || ')}`,
    true,
  );
} finally {
  if (deck?.id) await cleanupDeck(t, deck.id, context);
  await browser.close().catch(() => undefined);
  const out = table.finish({ deck: deck?.id ?? null, consoleErrors: consoleErrors.slice(0, 60) });
  writeFileSync(path.join(EVIDENCE, 'fourth-console.json'), JSON.stringify(consoleErrors, null, 2));
  process.exitCode = out.failed > 0 ? 1 : 0;
}

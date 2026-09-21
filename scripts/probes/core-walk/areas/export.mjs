// Download and print, the probe's rows (docs/FOCUS.md 2.8, 6.4 `export.*` with the driver
// `probe --core`): the File > Download submenu, the PDF and PowerPoint dialogs, the print page
// with its layout, its skipped slides checkbox, its Print button (window.print spied; the OS
// dialog is the manual checklist's) and Close preview, File > Print and Cmd+P. The files
// themselves are core/export.spec.ts.

export const NAME = 'export';
export const IDS = [
  'export.download-submenu',
  'export.pdf.dialog',
  'export.pdf.skipped-check',
  'export.pdf.close-paths',
  'export.pptx.dialog',
  'export.print.preview-page',
  'export.print.layout-with-notes',
  'export.print.include-skipped',
  'export.print.print-button',
  'export.print.close-preview',
  'export.print.file-menu-after-close',
  'export.print.menu-row',
  'export.print.cmd-p',
];

export async function run(t) {
  const { page, BASE } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();

  await t.step(
    'export.download-submenu',
    'File > Download',
    'the PowerPoint and PDF rows are listed',
    async () => {
      await t.openMenu('file');
      await t.hoverRow('file.download', '[data-control="menu.file.download.pdf"]');
      const rows = (await t.menuRows('file'))
        .filter((r) => r.id.startsWith('file.download.'))
        .map((r) => `${r.id}${r.disabled ? ' (disabled)' : ''}`);
      await t.closeMenus();
      const ids = rows.map((r) => r.split(' ')[0]);
      return {
        ok: ids.includes('file.download.pptx') && ids.includes('file.download.pdf'),
        observed: rows.join(', '),
      };
    },
  );
  /* the PDF row starts its download at once (docs/PRODUCT.md section 2 rank 8), so the dialog's way
     in is Download options with the PDF type picked; its control then reads dialog.download.pdf */
  const openPdf = async () => {
    await t.menuPath('file', 'file.download', 'file.download.options');
    await t.waitControl('dialog.download.type.pdf', 8000);
    await t.clickControl('dialog.download.type.pdf');
    await t.waitControl('dialog.download.pdf', 8000);
  };
  /* a checkbox reads its input; the PowerPoint dialog's two modes are `role="radio"` buttons
     carrying `aria-checked` (Download.tsx), which the null read of the verifier's run missed */
  const checked = (control) =>
    page.evaluate((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      if (!el) return null;
      const input = el.matches('input') ? el : el.querySelector('input');
      if (input) return input.checked;
      const aria =
        el.getAttribute('aria-checked') ??
        el.closest('[aria-checked]')?.getAttribute('aria-checked');
      return aria === null || aria === undefined ? null : aria === 'true';
    }, control);
  await t.step(
    'export.pdf.dialog',
    'File > Download > PDF Document',
    'the dialog with its sentence, the skipped slides checkbox off, Cancel and Download',
    async () => {
      await openPdf();
      const text = await t.textOf('dialog.download.pdf');
      const skipped = await checked('dialog.download.includeSkipped');
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="dialog.download.pdf"] button')]
          .map((b) => b.textContent?.trim())
          .filter(Boolean),
      );
      return {
        ok:
          /One slide per page/.test(text ?? '') &&
          skipped === false &&
          buttons.includes('Cancel') &&
          buttons.includes('Download'),
        observed: `sentence ${/One slide per page/.test(text ?? '')}; skipped ${skipped}; buttons ${buttons.join(', ')}`,
      };
    },
  );
  await t.step(
    'export.pdf.skipped-check',
    'Include skipped slides on, then off',
    'the checkbox toggles',
    async () => {
      const box = page.locator('[data-control="dialog.download.includeSkipped"]').first();
      const r = await box.boundingBox();
      await t.clickAt(r.x + Math.min(10, r.width / 2), r.y + r.height / 2);
      const on = await t.pollUntil(
        () => checked('dialog.download.includeSkipped'),
        (x) => x === true,
        3000,
      );
      await t.clickAt(r.x + Math.min(10, r.width / 2), r.y + r.height / 2);
      const off = await t.pollUntil(
        () => checked('dialog.download.includeSkipped'),
        (x) => x === false,
        3000,
      );
      return { ok: on === true && off === false, observed: `${on} then ${off}` };
    },
  );
  await t.step(
    'export.pdf.close-paths',
    'Escape, Cancel and the X',
    'each closes the dialog',
    async () => {
      await t.press('Escape');
      const a = await t.waitGone('[data-control="dialog.download.pdf"]', 4000);
      await openPdf();
      const cancel = page
        .locator('[data-control="dialog.download.pdf"] button', { hasText: /^Cancel$/ })
        .first();
      const r = await cancel.boundingBox();
      await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
      const b = await t.waitGone('[data-control="dialog.download.pdf"]', 4000);
      await openPdf();
      await t.clickControl('dialog.download.pdf.close');
      const c = await t.waitGone('[data-control="dialog.download.pdf"]', 4000);
      return { ok: a && b && c, observed: `Escape ${a}; Cancel ${b}; X ${c}` };
    },
  );
  await t.step(
    'export.pptx.dialog',
    'File > Download > Download options (the PowerPoint row starts its download at once, rank 8)',
    'Perfect selected, or Editable text when the deck holds a table or a chart (rank 8); both radios present',
    async () => {
      /* rank 8 (docs/PRODUCT.md section 2): Editable text is preselected when the deck holds a
         table or a chart, since Perfect writes both as pictures; Perfect otherwise. The walk's
         deck holds both by the time the export rows run */
      let holds = false;
      for (const id of await t.slideOrder()) {
        if (/"type":"(table|chart)"/.test(JSON.stringify(await t.slideJson(id)))) {
          holds = true;
          break;
        }
      }
      await t.menuPath('file', 'file.download', 'file.download.options');
      await t.waitControl('dialog.download.pptx', 8000);
      const flatten = await checked('dialog.download.mode.flatten');
      const native = await checked('dialog.download.mode.native');
      const labels = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control="dialog.download.pptx"] label, [data-control="dialog.download.pptx"] [role="radio"]',
          ),
        ]
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
          .slice(0, 8),
      );
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.download.pptx"]', 4000);
      return {
        ok:
          flatten === !holds &&
          native === holds &&
          labels.some((l) => /Perfect/.test(l)) &&
          labels.some((l) => /Editable text/.test(l)),
        observed: `deck holds a table or chart ${holds}; Perfect checked ${flatten}; Editable text checked ${native}; labels ${labels.join(' | ')}`,
      };
    },
  );

  // ---- the print page
  /* the notes layout row reads the talk track "renewal date" under a slide (b1 R27: the walk's
     deck carried no such note by the time the print page opened), so the note is typed on the
     title slide as a setup step through the notes pane */
  await t.step(
    null,
    'setup: a talk track for the print rows',
    'the title slide holds a note',
    async () => {
      await t.clickCard(t.deck.titleSlide);
      await t.clearAll();
      const held = JSON.stringify(await t.slideJson(t.deck.titleSlide)).includes('renewal date');
      if (held) return { ok: true, observed: 'the note is there already' };
      const notes = page.locator('[data-control="notes.text"]').first();
      if ((await notes.count()) === 0) return { ok: false, observed: 'no notes pane on the stage' };
      await notes.click();
      await t.typeHuman('Confirm the renewal date with the customer before the close.');
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      const now = await t.pollUntil(
        async () => JSON.stringify(await t.slideJson(t.deck.titleSlide)).includes('renewal date'),
        (x) => x,
        8000,
      );
      return { ok: now, observed: `note stored ${now}` };
    },
  );
  /* the Include skipped slides row needs a skipped slide in the deck (the verifier's walk had
     none marked, so the page count could not grow): one card that is not the title is skipped
     through Slide > Skip slide as a setup step when no card is skipped yet */
  /* the skip has to be a write the server holds, since the print page is a fresh load of the
     server's document: on the memory tier the walk's skip landed on a slide whose file the store
     did not carry (C2-R8's `blank-1`, the text area's slide) and the print page counted no
     skipped page (VERIFICATION.md C2-F21, "pages 9 -> 9; marked 0"). The candidates are the
     slide the decks area added first, then the other cards; a skip the server refused (the
     title row at "Couldn't save" or the reject card) is undone and the next card is tried, and
     the step waits for the store's copy of the slide to carry the skip */
  await t.step(
    null,
    'setup: a skipped slide for the print rows',
    'one card carries the skip and the server holds it',
    async () => {
      const cards = await t.cards();
      const held = async (id) =>
        Boolean((await t.slideJson(id).catch(() => null))?.skip) &&
        !/Couldn't save|retrying/.test((await t.saveWords()) ?? '');
      for (const c of cards.filter((x) => x.skipped)) {
        if (await held(c.id)) return { ok: true, observed: `already skipped and held: ${c.id}` };
      }
      let ordered = [
        ...cards.filter((c) => c.id === t.deck.secondSlide),
        ...cards.filter((c) => c.id !== t.deck.secondSlide && c.id !== t.deck.titleSlide),
      ].filter((c) => !c.skipped);
      /* a deck with no card beside the title (the return round's production run lost this row to
         a cascade on the deck a restore left with one card, VERIFICATION.md S.3): a slide is added
         through the window API first, the setup write PRODUCT.md 8.2 names, so the row is judged
         on its own interaction */
      if (ordered.length === 0) {
        const added = await t.setupSlide(t.deck.titleSlide, 'blank').catch(() => null);
        if (!added)
          return {
            ok: false,
            observed: 'no card to skip beside the title and slide.new added none',
          };
        t.deck.secondSlide = t.deck.secondSlide ?? added;
        ordered = (await t.cards()).filter((c) => c.id === added);
        if (ordered.length === 0)
          return {
            ok: false,
            observed: `slide.new added ${added} but the filmstrip shows no card for it`,
          };
      }
      const tried = [];
      for (const victim of ordered.slice(0, 3)) {
        await t.clickCard(victim.id);
        await t.clearAll();
        await t.menuPath('slide', 'slide.skipSlide');
        const marked = await t.pollUntil(
          async () => (await t.cards()).find((c) => c.id === victim.id)?.skipped,
          (x) => x === true,
          8000,
        );
        await t.settled();
        const stored = await t.pollUntil(
          () => held(victim.id),
          (x) => x,
          8000,
        );
        const words = await t.saveWords();
        tried.push(
          `${victim.id}: marked ${marked}, held by the server ${stored}, title row "${words}"`,
        );
        if (marked === true && stored) {
          t.deck.skippedSlide = victim.id;
          await t.clickCard(t.deck.titleSlide);
          return { ok: true, observed: tried.join('; ') };
        }
        /* undo the refused skip so the deck carries no half applied mark */
        await t.recoverSave({ observed: '' }).catch(() => undefined);
        if ((await t.cards()).find((c) => c.id === victim.id)?.skipped) {
          await t.clickCard(victim.id).catch(() => undefined);
          await t.menuPath('slide', 'slide.skipSlide').catch(() => undefined);
          await t.settled();
        }
      }
      await t.clickCard(t.deck.titleSlide).catch(() => undefined);
      return { ok: false, observed: tried.join('; ') };
    },
  );
  const onPrint = () => /\/print\//.test(page.url());
  const waitPrint = async () => {
    await page.waitForURL(/\/print\//, { timeout: 20_000 });
    await t.waitControl('print.page', 20_000);
    await t.sleep(600);
  };
  await t.step(
    'export.print.preview-page',
    'File > Print settings and preview',
    '/print/<id> with the pages and the layout dropdown',
    async () => {
      await t.menuPath('file', 'file.printPreview');
      await waitPrint();
      const count = Number(await t.attr('[data-control="print.pages"]', 'data-count'));
      const pages = await t.count(
        '[data-control="print.pages"] [data-control="print.page"], [data-control="print.pages"] .ts-print-sheet, [data-control="print.pages"] > *',
      );
      const layout = await t.visible('print.layout');
      const unskipped = (await t.cardsOnDeck?.()) ?? null;
      return {
        ok: onPrint() && count > 0 && layout,
        observed: `${t.url()}; data-count ${count}; page nodes ${pages}; layout dropdown ${layout}${unskipped === null ? '' : `; unskipped ${unskipped}`}`,
      };
    },
  );
  await t.step(
    'export.print.layout-with-notes',
    'pick 1 slide with notes',
    'the talk track shows under the slide',
    async () => {
      await page.locator('[data-control="print.layout"]').selectOption('notes');
      await t.sleep(600);
      const layout = await t.attr('[data-control="print.page"]', 'data-layout');
      const notes = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="print.notes."]')].map(
          (el) => el.textContent?.trim() ?? '',
        ),
      );
      const hasNote = notes.some((n) => /renewal date/.test(n));
      return {
        ok: layout === 'notes' && hasNote,
        observed: `layout ${layout}; notes blocks ${notes.length}; talk track shown ${hasNote}`,
      };
    },
  );
  await t.step(
    'export.print.include-skipped',
    'Include skipped slides',
    'the skipped page joins and is marked',
    async () => {
      const before = Number(await t.attr('[data-control="print.pages"]', 'data-count'));
      const box = page.locator('[data-control="print.skipped"]').first();
      const r = await box.boundingBox();
      await t.clickAt(r.x + Math.min(10, r.width / 2), r.y + r.height / 2);
      const after = await t.pollUntil(
        async () => Number(await t.attr('[data-control="print.pages"]', 'data-count')),
        (n) => n === before + 1,
        5000,
      );
      const marked = await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-control="print.pages"] .is-skipped, [data-control="print.pages"] [data-skipped], [data-control="print.pages"] [data-skip]',
          ).length,
      );
      return {
        ok: after === before + 1 && marked >= 1,
        observed: `pages ${before} -> ${after}; marked ${marked}`,
      };
    },
  );
  await t.step(
    'export.print.print-button',
    'click Print with window.print spied',
    "the browser's print is called once",
    async () => {
      await page.evaluate(() => {
        window.__printCalls = 0;
        window.print = () => {
          window.__printCalls += 1;
        };
      });
      await t.clickControl('print.print');
      await t.sleep(800);
      const calls = await page.evaluate(() => window.__printCalls);
      return {
        ok: calls === 1,
        observed: `window.print called ${calls} time(s); the OS dialog's Save as PDF is the manual checklist's`,
      };
    },
  );
  await t.step('export.print.close-preview', 'Close preview', 'back in the editor', async () => {
    await t.clickControl('print.close');
    await page.waitForURL(/\/edit\//, { timeout: 20_000 });
    await t.editorReady();
    await t.settled();
    return { ok: /\/edit\//.test(page.url()), observed: t.url() };
  });
  await t.step(
    'export.print.file-menu-after-close',
    'the first click on File after Close preview',
    'the menu opens',
    async () => {
      const bar = await t.rectOf('[data-control="menubar.file"]');
      await t.clickAt(bar.x + bar.w / 2, bar.y + bar.h / 2);
      await t.sleep(600);
      const open = await t.has('#ts-menu-file');
      await t.press('Escape', 2);
      return { ok: open, observed: `File menu open after one click ${open}` };
    },
  );
  await t.step('export.print.menu-row', 'File > Print', 'the print page', async () => {
    await t.menuPath('file', 'file.print');
    await waitPrint();
    const there = onPrint();
    await t.clickControl('print.close');
    await page.waitForURL(/\/edit\//, { timeout: 20_000 });
    await t.editorReady();
    await t.settled();
    return { ok: there, observed: there ? 'landed on /print' : t.url() };
  });
  await t.step('export.print.cmd-p', 'Cmd+P', 'the print page', async () => {
    await t.clearAll();
    const p = await t.emptySheetPoint();
    await t.clickAt(p.x, p.y);
    await t.press('Meta+p');
    await waitPrint();
    const there = onPrint();
    await t.clickControl('print.close');
    await page.waitForURL(/\/edit\//, { timeout: 20_000 });
    await t.editorReady();
    await t.settled();
    return { ok: there, observed: there ? 'landed on /print' : t.url() };
  });
  void BASE;
}

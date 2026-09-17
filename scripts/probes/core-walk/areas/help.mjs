// Help, the probe's rows (docs/FOCUS.md 2.8, 6.4 `help.*` with the driver `probe --core`):
// Help > Help with its how-tos and Done, the Documentation link answering 200, Keyboard
// shortcuts with its search and Escape, and Search the menus from the Help menu and the toolbar.

export const NAME = 'help';
export const IDS = [
  'help.help-dialog',
  'help.documentation-link',
  'help.keyboard-shortcuts',
  'help.search-the-menus',
];

export async function run(t) {
  const { page, BASE, headers } = t;
  await t.clearAll();

  await t.step(
    'help.help-dialog',
    'Help > Help, read the how-tos, Done',
    'the dialog lists the how-tos and Done closes it',
    async () => {
      await t.menuPath('help', 'help.help');
      await t.waitControl('dialog.help', 8000);
      const howTos = await t.count(
        '[data-control="dialog.help"] ol li, [data-control="dialog.help"] .ts-dialog-howto li',
      );
      await t.clickControl('dialog.help.done');
      const gone = await t.waitGone('[data-control="dialog.help"]', 4000);
      return { ok: howTos >= 5 && gone, observed: `how-tos ${howTos}; closed ${gone}` };
    },
  );
  await t.step(
    'help.documentation-link',
    'read the Documentation link in Help > Help and GET it',
    'the link answers 200',
    async () => {
      await t.menuPath('help', 'help.help');
      await t.waitControl('dialog.help', 8000);
      const href = await t.attr('[data-control="dialog.help.docs"]', 'href');
      await t.clickControl('dialog.help.done');
      if (!href) return { ok: false, observed: 'no Documentation link' };
      const url = /^https?:/.test(href) ? href : `${BASE}${href}`;
      /* the link is GitHub's: a 429 is GitHub rate limiting the runner, not the document
         (VERIFICATION.md pass 2: help.documentation-link failed on a 429 alone), so a 429 is
         retried twice after a pause and the same path is then read from raw.githubusercontent.com,
         which answers from another limit; the observed column names every answer */
      const own = /^https?:\/\/[^/]*turboslide|^https?:\/\/localhost/.test(url) ? headers : {};
      const answers = [];
      let status = 0;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await page.request.get(url, { headers: own, maxRedirects: 3 });
        status = res.status();
        answers.push(String(status));
        if (status !== 429) break;
        await t.sleep(15_000);
      }
      if (status === 429) {
        const raw = url.replace(
          /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\//,
          'https://raw.githubusercontent.com/$1/$2/$3/',
        );
        if (raw !== url) {
          const res = await page.request.get(raw, { maxRedirects: 3 });
          status = res.status();
          answers.push(`raw ${status}`);
        }
      }
      return { ok: status === 200, observed: `${href} -> ${answers.join(', ')}` };
    },
  );
  await t.step(
    'help.keyboard-shortcuts',
    'Help > Keyboard shortcuts, type in the search, Escape',
    'the dialog opens, filters, closes',
    async () => {
      await t.menuPath('help', 'help.keyboardShortcuts');
      await t.waitControl('dialog.keyboardShortcuts', 8000);
      const rowsBefore = await t.count('[data-control="dialog.keyboardShortcuts"] tr');
      await t.clickControl('dialog.keyboardShortcuts.search');
      await t.typeHuman('undo');
      await t.sleep(400);
      const rowsAfter = await t.count('[data-control="dialog.keyboardShortcuts"] tr');
      const text = await t.textOf('dialog.keyboardShortcuts');
      await t.press('Escape');
      const gone = await t.waitGone('[data-control="dialog.keyboardShortcuts"]', 4000);
      return {
        ok:
          rowsBefore > 10 &&
          rowsAfter < rowsBefore &&
          rowsAfter > 0 &&
          /Undo/.test(text ?? '') &&
          gone,
        observed: `rows ${rowsBefore} -> ${rowsAfter} on "undo"; closed ${gone}`,
      };
    },
  );
  await t.step(
    'help.search-the-menus',
    'Help > Search the menus, type a row name; then the toolbar Search',
    'the row is found by name both ways',
    async () => {
      await t.menuPath('help', 'help.searchMenus');
      await t.waitControl('palette.query', 8000);
      await t.typeHuman('Move to trash');
      await t.sleep(500);
      const fromMenu = await t.has('[data-control="palette.menu:file.moveToTrash"]');
      await t.press('Escape');
      await t.waitGone('[data-control="palette.query"]', 4000);
      await t.clickControl('toolbar.search');
      await t.waitControl('palette.query', 8000);
      await t.typeHuman('Keyboard shortcuts');
      await t.sleep(500);
      const fromToolbar = await t.has('[data-control="palette.menu:help.keyboardShortcuts"]');
      await t.press('Escape');
      await t.waitGone('[data-control="palette.query"]', 4000);
      return {
        ok: fromMenu && fromToolbar,
        observed: `Help > Search the menus found Move to trash ${fromMenu}; the toolbar Search found Keyboard shortcuts ${fromToolbar}`,
      };
    },
  );
}

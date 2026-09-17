// Share and Version history, the probe's rows (docs/FOCUS.md 2.7, 6.4 `share.*` and
// `versions.*` with the driver `probe --core`): File > Share > Share with others opens the
// dialog; Version history opens from the Last edit words, a version is picked, the current one
// named, and a restore undone. The links, the second browser and the restore on a shared deck
// are core/share.spec.ts.

export const NAME = 'share';
export const IDS = [
  'share.file-menu-share-with-others',
  'versions.open-from-last-edit',
  'versions.pick',
  'versions.name-current',
  'versions.undo-restore',
];

export async function run(t) {
  const { page } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();

  await t.step(
    'share.file-menu-share-with-others',
    'File > Share > Share with others',
    'the Share dialog opens',
    async () => {
      await t.menuPath('file', 'file.share', 'file.share.withOthers');
      await t.waitControl('dialog.share', 8000);
      const shown = await t.visible('dialog.share');
      await t.press('Escape');
      const gone = await t.waitGone('[data-control="dialog.share"]', 5000);
      return { ok: shown && gone, observed: `shown ${shown}; closed on Escape ${gone}` };
    },
  );

  await t.step(
    'versions.open-from-last-edit',
    'click the Last edit words in the title row',
    'Version history opens with the day window',
    async () => {
      await t.clearAll();
      const slot = page
        .locator(
          '[data-control="deck.lastEdit"], [data-control="deck.lastEdit.slot"] button, [data-control="deck.lastEdit.slot"]',
        )
        .first();
      const r = await slot.boundingBox();
      if (!r) return { ok: false, observed: 'no Last edit control in the title row' };
      await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
      await t.waitControl('panel.versionHistory', 8000);
      const windows = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="versionHistory.window."]')].map((el) =>
          el.getAttribute('data-control'),
        ),
      );
      const heading = await page.evaluate(
        () =>
          document
            .querySelector('[data-control="panel.versionHistory"]')
            ?.textContent?.includes('Today') ?? false,
      );
      return {
        ok: windows.length > 0 && heading,
        observed: `windows ${windows.join(', ')}; Today heading ${heading}`,
      };
    },
  );
  const versionRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-control')),
    );
  const expandWindows = async () => {
    const heads = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="versionHistory.window."]')].map((el) =>
        el.getAttribute('data-control'),
      ),
    );
    for (const h of heads) {
      if ((await versionRows()).length > 1) break;
      await t.clickControl(h).catch(() => undefined);
      await t.sleep(300);
    }
  };
  await t.step(
    'versions.pick',
    'pick a version in the panel',
    'the version is shown as picked',
    async () => {
      await expandWindows();
      const rows = await versionRows();
      if (rows.length === 0) return { ok: false, observed: 'no version rows in the panel' };
      const target = rows[Math.min(1, rows.length - 1)];
      await t.clickControl(target);
      await t.sleep(600);
      const picked = await page.evaluate((c) => {
        const el = document.querySelector(`[data-control="${c}"]`);
        const row = el?.closest('li, .ts-version, [data-version]') ?? el;
        return {
          pressed:
            el?.getAttribute('aria-pressed') ??
            el?.getAttribute('aria-current') ??
            el?.getAttribute('aria-selected'),
          cls: row?.className ?? '',
        };
      }, target);
      const on = picked.pressed === 'true' || /is-(picked|current|selected|on)/.test(picked.cls);
      t.deck.pickedVersion = target;
      return {
        ok: on,
        observed: `${rows.length} rows; picked ${target}: aria ${picked.pressed}, class "${picked.cls}"`,
      };
    },
  );
  await t.step(
    'versions.name-current',
    'Name current version, type a name, Save',
    'the name is saved and listed',
    async () => {
      await t.clickControl('versionHistory.nameCurrent');
      /* the panel's Name current version is an inline field, `versionHistory.nameCurrent.field`,
         saved with Enter (VersionsPanel.tsx; VERIFICATION.md pass 2 F-versions named the stale
         dialog locator); the File menu row's dialog is the fallback when the panel draws none */
      const field = page
        .locator(
          '[data-control="versionHistory.nameCurrent.field"], [data-control="dialog.nameVersion.name"]',
        )
        .first();
      await field.waitFor({ timeout: 6000 });
      const control = await field.getAttribute('data-control');
      await field.click();
      await t.typeHuman('Before the customer copy');
      if (control === 'dialog.nameVersion.name') await t.clickControl('dialog.nameVersion.save');
      else await t.press('Enter');
      await t.settled();
      const listed = await t.pollUntil(
        () =>
          page.evaluate(
            () =>
              document
                .querySelector('[data-control="panel.versionHistory"]')
                ?.textContent?.includes('Before the customer copy') ?? false,
          ),
        (x) => x,
        10_000,
      );
      const said = await t.snackbar();
      return { ok: listed, observed: `listed ${listed}; snackbar ${said ?? 'none'}` };
    },
  );
  await t.step(
    'versions.undo-restore',
    'Restore an earlier version, then Cmd+Z',
    'the current version comes back',
    async () => {
      const T = t.deck.titleSlide;
      const current = JSON.stringify(await t.slideJson(T));
      const order = await t.slideOrder();
      await expandWindows();
      const restores = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-control^="versionHistory."][data-control$=".restore"], [data-control^="version.restore."]',
          ),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      );
      let restoreCtl = restores[restores.length - 1] ?? null;
      if (!restoreCtl) {
        const rows = await versionRows();
        const earliest = rows[rows.length - 1];
        if (earliest) {
          await t.clickControl(earliest);
          await t.sleep(500);
          const again = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-control^="versionHistory."][data-control$=".restore"], [data-control^="version.restore."]',
              ),
            ]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => el.getAttribute('data-control')),
          );
          restoreCtl = again[0] ?? null;
        }
      }
      if (!restoreCtl) return { ok: false, observed: 'no Restore control in the panel' };
      await t.clickControl(restoreCtl);
      await t.sleep(800);
      const restored = await t.pollUntil(
        async () =>
          JSON.stringify(await t.slideJson(T)) !== current ||
          (await t.slideOrder()).length !== order.length,
        (x) => x,
        15_000,
      );
      await t.settled();
      const said = await t.snackbar();
      /* the panel's notice ("Restored the version of …" or the refusal's sentence) and the
         controller's error beside the snackbar, so a refused or hanging restore is named on a
         miss (b7 C2-R14: the snackbar alone carried no mechanism through two passes) */
      const notice = await page.evaluate(
        () => document.querySelector('.ts-versions-notice')?.textContent?.trim() ?? null,
      );
      const stateError = await page
        .evaluate(() => {
          const s = window.turboslide?.studio?.describe().state;
          return s && 'error' in s ? JSON.stringify(s.error) : null;
        })
        .catch(() => null);
      await t.clearAll();
      await t.press('Meta+z');
      const back = await t.pollUntil(
        async () =>
          JSON.stringify(await t.slideJson(T)) === current &&
          (await t.slideOrder()).length === order.length,
        (x) => x,
        15_000,
      );
      await t.settled();
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      else await t.press('Escape');
      return {
        ok: restored && back,
        observed: `restore changed the deck ${restored} (${restoreCtl}; snackbar ${said ?? 'none'}; panel notice ${notice ?? 'none'}; state.error ${stateError ?? 'none'}); Cmd+Z brought the current version back ${back}`,
      };
    },
  );
}

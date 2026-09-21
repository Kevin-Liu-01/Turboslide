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
  'versions.show-changes-toggle',
  'versions.show-changes-marks',
  /* the product round (docs/PRODUCT.md 8.1) */
  'versions.panel.author-you',
  'versions.field.square',
  'comments.panel.empty-gesture',
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
      /* the whole deck is the read (every slide's JSON in order, and the revision), not the title
         slide alone: in a walk of a few areas the title slide can stand as the first version
         saved it, so a restore of that version changed nothing the old read looked at while the
         panel said "Restored the version of ..." (return/build/integrator.md item 12); the
         revision moving proves the restore wrote, and the fingerprint says what it changed */
      const fingerprint = async () => {
        const ids = await t.slideOrder();
        const slides = [];
        for (const id of ids) slides.push(await t.slideJson(id));
        return JSON.stringify({ ids, slides });
      };
      const current = await fingerprint();
      const revisionBefore = (await t.state()).revision;
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
      /* the restore has landed when the revision moved (the restore's own write); what it changed
         is read from the fingerprint, which a restore of a version equal to the current deck
         leaves as it was */
      /* pollUntil answers the last value read, on the change or at the bound */
      const wrote =
        (await t.pollUntil(
          async () => (await t.state()).revision,
          (r) => r !== revisionBefore,
          15_000,
        )) !== revisionBefore;
      /* the restored document is read with a bound (PRODUCT.md 8.2, the second browser bound of
         35 s; ship.md section 10 item 2): the restore is a server first write whose resync lands
         after the revision on the blob tier, so the fingerprint is polled until it changes or
         the panel's notice names the restore, and the time it took is recorded; what the row
         asserts is unchanged */
      const resyncAt = Date.now();
      const noticeNow = () =>
        page.evaluate(
          () => document.querySelector('.ts-versions-notice')?.textContent?.trim() ?? null,
        );
      const afterRestore = await t
        .pollUntil(fingerprint, (f) => f !== current, 35_000, 500)
        .catch(fingerprint);
      const resyncMs = Date.now() - resyncAt;
      const changed = afterRestore !== current;
      const revisionAfter = (await t.state()).revision;
      await t.settled();
      const said = await t.snackbar();
      /* the panel's notice ("Restored the version of …" or the refusal's sentence) and the
         controller's error beside the snackbar, so a refused or hanging restore is named on a
         miss (b7 C2-R14: the snackbar alone carried no mechanism through two passes) */
      const notice = await noticeNow();
      const stateError = await page
        .evaluate(() => {
          const s = window.turboslide?.studio?.describe().state;
          return s && 'error' in s ? JSON.stringify(s.error) : null;
        })
        .catch(() => null);
      const restored = wrote && (changed || /restored/i.test(notice ?? ''));
      await t.clearAll();
      await t.press('Meta+z');
      /* the current version is back when the deck reads as before the restore and the undo wrote
         (its revision moved past the restore's) */
      const back = await t
        .pollUntil(
          async () =>
            (await t.state()).revision !== revisionAfter && (await fingerprint()) === current,
          (x) => x,
          15_000,
        )
        .catch(() => false);
      await t.settled();
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      else await t.press('Escape');
      return {
        ok: restored && back,
        observed: `restore wrote ${wrote} (revision ${revisionBefore} -> ${revisionAfter}) and changed the deck ${changed} (read after ${resyncMs} ms of a 35 s bound; ${restoreCtl}; snackbar ${said ?? 'none'}; panel notice ${notice ?? 'none'}; state.error ${stateError ?? 'none'}); Cmd+Z brought the current version back ${back}`,
      };
    },
  );

  // ---- the return round's rows (docs/RETURN.md 2.17, section 5): Show changes and its marks
  const openHistory = async () => {
    if (!(await t.visible('panel.versionHistory'))) {
      await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
      await t.waitControl('panel.versionHistory', 8000);
    }
  };
  /* the attribute sits on the panel's list (.ts-versions.is-history, VersionsPanel.tsx 406), an
     empty string while on and absent while off */
  const showChangesState = () => t.attr('.ts-versions.is-history', 'data-show-changes');
  await t.step(
    'versions.show-changes-toggle',
    'Version history > Show changes, twice',
    "the panel's data-show-changes flips both ways",
    async () => {
      await t.clearAll();
      await openHistory();
      let drawn = await t.visible('versionHistory.showChanges');
      let switched = false;
      if (!drawn) {
        switched = await t.setAdvanced(true);
        if (switched) t.deck.advanced = true;
        drawn = await t
          .pollUntil(
            () => t.visible('versionHistory.showChanges'),
            (x) => x,
            4000,
          )
          .catch(() => false);
      }
      if (!drawn)
        return {
          ok: false,
          observed: `no Show changes control in the panel (switch on ${switched})`,
        };
      const before = await showChangesState();
      await t.clickControl('versionHistory.showChanges');
      const on = await t
        .pollUntil(showChangesState, (x) => x !== before, 5000)
        .catch(showChangesState);
      await t.clickControl('versionHistory.showChanges');
      const off = await t
        .pollUntil(showChangesState, (x) => x === before, 5000)
        .catch(showChangesState);
      return {
        ok: before === null && on !== null && off === null,
        observed: `${switched ? 'with the switch on; ' : ''}data-show-changes ${before} -> ${on} -> ${off}`,
      };
    },
  );
  await t.step(
    'versions.show-changes-marks',
    'a heading edit and an added box after the named version; pick the older version with Show changes on; then off',
    'the changed heading and the added box carry change marks (at least two); none with it off',
    async () => {
      await t.clearAll();
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      const T = t.deck.titleSlide;
      await t.clickCard(T);
      const head = t.deck.head;
      if (head) {
        await t.openRun(head);
        await t.press('End');
        await t.typeHuman(' changed');
        await t.press('Escape');
        await t.settled();
      }
      const box = await t.placeBlock(T, {
        id: 'changed-box',
        type: 'text',
        text: 'Added after the version',
        pos: { x: 200, y: 700, w: 500, h: 100 },
      });
      await t.clearAll();
      await openHistory();
      if (!(await t.visible('versionHistory.showChanges'))) {
        await t.setAdvanced(true);
        t.deck.advanced = true;
      }
      if ((await showChangesState()) === null) await t.clickControl('versionHistory.showChanges');
      await t.pollUntil(showChangesState, (x) => x !== null, 5000).catch(() => undefined);
      await expandWindows();
      const picks = await versionRows();
      const named = await page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]'),
        ];
        return (
          rows
            .find((el) =>
              /Before the customer copy/.test(
                el.closest('li, .ts-version, [data-version]')?.textContent ?? el.textContent ?? '',
              ),
            )
            ?.getAttribute('data-control') ?? null
        );
      });
      const target = named ?? picks[1] ?? picks[picks.length - 1];
      if (!target) return { ok: false, observed: 'no version row to pick' };
      await t.clickControl(target);
      const marks = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.ts-change-group, [data-change], .ts-change')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-block') ?? e.className),
        );
      const on = await t.pollUntil(marks, (m) => m.length >= 2, 10_000).catch(marks);
      await t.clickControl('versionHistory.showChanges');
      const off = await t.pollUntil(marks, (m) => m.length === 0, 5000).catch(marks);
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      else await t.press('Escape');
      return {
        ok: Boolean(box) && on.length >= 2 && off.length === 0,
        observed: `picked ${target} (named row ${named}); marks with Show changes on ${on.length} (${on.join(', ')}); off ${off.length}`,
      };
    },
  );
  await t.advancedBack('the versions rows');
  await productRound(t);
}

/**
 * The product round's rows (docs/PRODUCT.md 3.2, 8.1): the version row's author You at 12 px in
 * ink-2 with Name this version in the panel head, the square version name field, and the Comments
 * panel's empty state with the gesture line. B1 owns the panels.
 */
async function productRound(t) {
  const { page } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();
  const openHistory = async () => {
    if (!(await t.visible('panel.versionHistory'))) {
      await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
      await t.waitControl('panel.versionHistory', 8000);
    }
    for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
      await w.click().catch(() => undefined);
    await t.sleep(300);
  };
  const closeHistory = async () => {
    if (await t.visible('panel.versionHistory.close'))
      await t.clickControl('panel.versionHistory.close');
    await t.sleep(200);
  };
  await t.step(
    'versions.panel.author-you',
    'File > Version history; read a row and the head',
    'a row names You at 12 px in ink-2; Name this version sits in the panel head',
    async () => {
      await openHistory();
      const facts = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.versionHistory"]');
        const probe = document.createElement('span');
        probe.style.color = 'var(--pt-ink-2)';
        document.body.appendChild(probe);
        const ink2 = getComputedStyle(probe).color;
        probe.remove();
        const rows = [
          ...(panel?.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]') ??
            []),
        ];
        /* the author word sits in the row's meta line beside the pick button, not inside it
           (VersionsPanel.tsx `.ts-version-author`): the row is read whole */
        const authors = rows
          .map(
            (row) =>
              [...(row.closest('.ts-version') ?? row).querySelectorAll('*')].find(
                (el) => el.children.length === 0 && el.textContent?.trim() === 'You',
              ) ?? null,
          )
          .filter(Boolean)
          .map((el) => {
            const cs = getComputedStyle(el);
            return { size: parseFloat(cs.fontSize), color: cs.color };
          });
        const name = panel?.querySelector('[data-control="versionHistory.nameCurrent"]');
        const list = panel?.querySelector(
          '.ts-versions-list, [data-control^="versionHistory.window."]',
        );
        const head = panel?.querySelector('.ts-panel-head, header');
        const nameRect = name?.getBoundingClientRect() ?? null;
        const listRect = list?.getBoundingClientRect() ?? null;
        return {
          rows: rows.length,
          authors,
          ink2,
          inHead:
            Boolean(name && head && head.contains(name)) ||
            Boolean(nameRect && listRect && nameRect.bottom <= listRect.top + 1),
        };
      });
      await closeHistory();
      const authorOk =
        facts.authors.length > 0 &&
        facts.authors.every((a) => Math.abs(a.size - 12) < 0.3 && a.color === facts.ink2);
      return {
        ok: facts.rows > 0 && authorOk && facts.inHead,
        observed: `${facts.rows} rows; You on ${facts.authors.length} (${facts.authors
          .slice(0, 2)
          .map((a) => `${a.size}px ${a.color}`)
          .join(', ')}; ink-2 ${facts.ink2}); Name this version in the head ${facts.inHead}`,
      };
    },
  );
  await t.step(
    'versions.field.square',
    'Name this version; read the field',
    'the field is square',
    async () => {
      await openHistory();
      await t.clickControl('versionHistory.nameCurrent');
      await t.waitControl('versionHistory.nameCurrent.field', 6000);
      const radius = await t.styleOf('[data-control="versionHistory.nameCurrent.field"]', [
        'border-radius',
      ]);
      await t.press('Escape');
      await closeHistory();
      return {
        ok: radius !== null && /^0px( 0px)*$/.test(radius['border-radius']),
        observed: `border-radius ${radius?.['border-radius'] ?? 'not read'}`,
      };
    },
  );
  await t.step(
    'comments.panel.empty-gesture',
    'open Comments on a deck with none',
    'the panel shows the sentence and the gesture line and no tabs, search or filter',
    async () => {
      await t.clearAll();
      const threads = (await t.state()).comments?.threads?.length ?? 0;
      if (threads > 0)
        return {
          ok: null,
          observed: `not driven: the deck carries ${threads} comment thread(s) at this point of the walk`,
        };
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.clickControl('title.comments');
      await t.waitControl('panel.comments', 6000);
      await t.sleep(400);
      const facts = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.comments"]');
        const text = panel?.textContent ?? '';
        return {
          sentence: /No comments yet/.test(text),
          gesture:
            /Select something on a slide, then Insert > Comment/.test(text) &&
            /Cmd\+Option\+M|⌘⌥M/.test(text),
          tabs: panel?.querySelectorAll('[data-control^="panel.comments.tab."]').length ?? 0,
          search: panel?.querySelectorAll('[data-control="panel.comments.search"]').length ?? 0,
          filter: panel?.querySelectorAll('[data-control="panel.comments.filter"]').length ?? 0,
          text: text.slice(0, 160),
        };
      });
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      return {
        ok:
          facts.sentence &&
          facts.gesture &&
          facts.tabs === 0 &&
          facts.search === 0 &&
          facts.filter === 0,
        observed: `sentence ${facts.sentence}; gesture line ${facts.gesture}; tabs ${facts.tabs}, search ${facts.search}, filter ${facts.filter}; text "${facts.text}"`,
      };
    },
  );
}

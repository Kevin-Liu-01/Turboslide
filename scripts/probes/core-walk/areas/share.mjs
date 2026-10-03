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
  /* the product round (docs/archive/rounds/PRODUCT.md 8.1) */
  'versions.panel.author-you',
  'versions.field.square',
  'comments.panel.empty-gesture',
  /* the people round (docs/archive/rounds/PEOPLE.md 3.1, 3.2, 3.19, 6.1): the window row's mark column and
     Restore in the row's More menu */
  'versions.window-mark-column',
  'versions.restore-in-more',
];

/**
 * A value's JSON with every object's keys in sorted order. After a restore the tab reads the
 * room's normalized copy of the deck, whose keys come in the schema's order, while the tab's own
 * edits kept the order they were written in ("typography":{"weight":700,"size":32} against
 * {"size":32,"weight":700}): one document, two strings, and Cmd+Z after a restore read "brought
 * the current version back false" on three slides that differed in key order alone
 * (docs/gslides-parity/realtime/build/r3.md "Realtime round, fix round 3", walk A's trace).
 */
export const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );

/** The deck as the restore rows compare it: the order and every slide's JSON, by id, keys sorted. */
const deckRead = async (t) => {
  const ids = await t.slideOrder();
  const slides = {};
  for (const id of ids) slides[id] = canonical(await t.slideJson(id));
  return { ids, slides };
};
const fingerprintOf = (read) => canonical(read);
/** The slides whose JSON differs between two reads, and the ids one has and the other lacks. */
export const slidesApart = (a, b) =>
  [...new Set([...a.ids, ...b.ids])].filter((id) => a.slides[id] !== b.slides[id]);

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
         revision moving proves the restore wrote, and the fingerprint says what it changed; the
         slides' keys are compared in sorted order (`canonical`) */
      const fingerprint = async () => fingerprintOf(await deckRead(t));
      const before = await deckRead(t);
      const current = fingerprintOf(before);
      const revisionBefore = (await t.state()).revision;
      await expandWindows();
      /* the row's Restore button is drawn on the row's hover and focus since the people round
         (docs/archive/rounds/PEOPLE.md 3.19), so the controls are read by their rows being drawn, not by the
         button's own box, and the row is hovered before the click, as a person does */
      const readRestores = () =>
        page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-control^="versionHistory."][data-control$=".restore"], [data-control^="version.restore."]',
            ),
          ]
            .filter((el) => (el.closest('li.ts-version') ?? el).getClientRects().length > 0)
            .map((el) => el.getAttribute('data-control')),
        );
      const restores = await readRestores();
      let restoreCtl = restores[restores.length - 1] ?? null;
      if (!restoreCtl) {
        const rows = await versionRows();
        const earliest = rows[rows.length - 1];
        if (earliest) {
          await t.clickControl(earliest);
          await t.sleep(500);
          const again = await readRestores();
          restoreCtl = again[0] ?? null;
        }
      }
      if (!restoreCtl) return { ok: false, observed: 'no Restore control in the panel' };
      const restoreRow = page
        .locator(`[data-control="${restoreCtl}"]`)
        .first()
        .locator('xpath=ancestor::li[contains(@class, "ts-version")][1]');
      if ((await restoreRow.count()) > 0) {
        await restoreRow.hover();
        await t.sleep(250);
      }
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
      /* on a miss, the slides that still differ from the read before the restore */
      const apart = back ? [] : slidesApart(before, await deckRead(t));
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      else await t.press('Escape');
      return {
        ok: restored && back,
        observed: `restore wrote ${wrote} (revision ${revisionBefore} -> ${revisionAfter}) and changed the deck ${changed} (read after ${resyncMs} ms of a 35 s bound; ${restoreCtl}; snackbar ${said ?? 'none'}; panel notice ${notice ?? 'none'}; state.error ${stateError ?? 'none'}); Cmd+Z brought the current version back ${back}${apart.length > 0 ? ` (slides apart: ${apart.join(', ')})` : ''}`,
      };
    },
  );

  // ---- the return round's rows (docs/archive/rounds/RETURN.md 2.17, section 5): Show changes and its marks
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
  await peopleRound(t);
}

/**
 * The product round's rows (docs/archive/rounds/PRODUCT.md 3.2, 8.1): the version row's author You at 12 px in
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
      /* the polish round (docs/archive/rounds/POLISH.md 2.7 item 96, B5): Name current version opens the Name
         version dialog; an older build drew the field inline in the panel */
      const field = page
        .locator(
          '[data-control="dialog.nameVersion.name"], [data-control="versionHistory.nameCurrent.field"]',
        )
        .first();
      await field.waitFor({ state: 'visible', timeout: 6000 });
      const fieldControl = await field.getAttribute('data-control');
      const radius = await t.styleOf(`[data-control="${fieldControl}"]`, ['border-radius']);
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

/**
 * The people round's rows (docs/archive/rounds/PEOPLE.md 3.1, 3.2, 3.19, 6.1): the window row's mark column in
 * Version history (the first mark 16 px from the panel's left edge, level with the standalone
 * rows and the day heading; the expanded window's rule at x 25 and its rows' marks at x 41; a one
 * author window's text in the standalone rows' text column; the "+N" count at 11 px) and Restore
 * this version first in a row's More menu, the row's Restore button drawn on hover and focus only
 * and the meta line unclipped at the panel's 320 px. One browser makes one author windows, so the
 * four author strip is not read and the "+N" size is read through a probe element of its class.
 * B2 owns the panel.
 */
async function peopleRound(t) {
  const { page } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();
  const openHistory = async () => {
    if (!(await t.visible('panel.versionHistory'))) {
      await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
      await t.waitControl('panel.versionHistory', 8000);
    }
    await t.sleep(300);
  };
  const closeHistory = async () => {
    if (await t.visible('panel.versionHistory.close'))
      await t.clickControl('panel.versionHistory.close');
    else await t.press('Escape');
    await t.sleep(200);
  };
  const visibleRows = (selector) =>
    page.evaluate(
      (s) =>
        [...document.querySelectorAll(s)]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control')),
      selector,
    );
  await t.step(
    'versions.window-mark-column',
    "Version history; read a window row's first mark, the standalone rows' marks and the day heading; expand the window and read its rule and its rows' marks; read the +N size",
    "the window row's first chip is 16 px from the panel's left edge, level with the standalone marks and the day heading; the expanded rule at x 25, its marks at x 41; a one author window's text in the standalone text column; +N at 11 px",
    async () => {
      await openHistory();
      /* the windows are read collapsed first: the row's own mark column */
      const facts = await page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0;
        const panel = document.querySelector('[data-control="panel.versionHistory"]');
        if (!panel) return null;
        const pr = panel.getBoundingClientRect();
        const left = (el) =>
          el ? Math.round((el.getBoundingClientRect().left - pr.left) * 10) / 10 : null;
        const windows = [...panel.querySelectorAll('.ts-version-window-row')].filter(visible);
        const standalone = [...panel.querySelectorAll('li.ts-version')].filter(
          (el) => visible(el) && el.closest('.ts-versions-list.is-window') === null,
        );
        const heading = panel.querySelector('.ts-versions-day-head');
        const bodyLeft = (row) => left(row.querySelector('.ts-version-body'));
        const marksOf = (row) => row.querySelectorAll('.ts-chip').length;
        const oneAuthor = windows.find((row) => marksOf(row) === 1) ?? null;
        const first = windows[0] ?? null;
        const probe = document.createElement('span');
        probe.className = 'ts-version-marks-more';
        probe.textContent = '+2';
        (first?.querySelector('.ts-version-marks') ?? panel).appendChild(probe);
        const moreSize = getComputedStyle(probe).fontSize;
        probe.remove();
        return {
          panelWidth: Math.round(pr.width),
          windows: windows.length,
          authorsOfFirst: first ? marksOf(first) : null,
          firstControl: first?.getAttribute('data-control') ?? null,
          chipLeft: first ? left(first.querySelector('.ts-chip')) : null,
          standaloneChipLeft: standalone[0] ? left(standalone[0].querySelector('.ts-chip')) : null,
          headingLeft: left(heading),
          oneAuthorBody: oneAuthor ? bodyLeft(oneAuthor) : null,
          standaloneBody: standalone[0] ? bodyLeft(standalone[0]) : null,
          moreSize,
        };
      });
      if (!facts) return { ok: false, observed: 'no Version history panel' };
      if (facts.windows === 0) {
        await closeHistory();
        return {
          ok: null,
          observed:
            'not driven: the panel lists no window row (two records within 15 minutes by one author, unnamed)',
        };
      }
      /* the expanded window: its rule and its rows' marks. The newest window opens expanded on its
         own since the polish round (VersionsPanel.tsx `windowRow`, `newest`), so the row expands
         the first window only when it is folded and folds it again only when it was (the ship
         step's third attempt: the merged tree read "no list" after a click that folded it) */
      const wasExpanded = await page.evaluate(
        (control) =>
          document.querySelector(`[data-control="${control}"]`)?.getAttribute('aria-expanded') ===
          'true',
        facts.firstControl,
      );
      if (!wasExpanded) await t.clickControl(facts.firstControl);
      await page
        .locator('.ts-versions-list.is-window')
        .first()
        .waitFor({ timeout: 4000 })
        .catch(() => undefined);
      const expanded = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.versionHistory"]');
        const pr = panel.getBoundingClientRect();
        const list = document.querySelector('.ts-versions-list.is-window');
        if (!list) return null;
        const lr = list.getBoundingClientRect();
        const cs = getComputedStyle(list);
        const rule =
          cs.borderLeftWidth !== '0px' ? Math.round((lr.left - pr.left) * 10) / 10 : null;
        const marks = [...list.querySelectorAll('.ts-version .ts-chip')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => Math.round((el.getBoundingClientRect().left - pr.left) * 10) / 10);
        return { rule, borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftColor}`, marks };
      });
      if (!wasExpanded) await t.clickControl(facts.firstControl).catch(() => undefined);
      await closeHistory();
      const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;
      /* 16 px from the panel's content edge, x 17 from its outer edge with the 1 px border
         (AUDIT.md defect 1): either reading of the same column */
      const column = facts.chipLeft !== null && facts.chipLeft >= 15.5 && facts.chipLeft <= 17.5;
      const level =
        near(facts.chipLeft, facts.standaloneChipLeft, 0.5) &&
        near(facts.chipLeft, facts.headingLeft, 0.5);
      const rule = expanded !== null && expanded.rule !== null && near(expanded.rule, 25, 1);
      const marks =
        expanded !== null &&
        expanded.marks.length > 0 &&
        expanded.marks.every((x) => near(x, 41, 1));
      const oneAuthorColumn =
        facts.oneAuthorBody === null ? null : near(facts.oneAuthorBody, facts.standaloneBody, 0.5);
      const more = facts.moreSize === '11px';
      return {
        ok: column && level && rule && marks && oneAuthorColumn !== false && more,
        observed: `panel ${facts.panelWidth} px; ${facts.windows} window rows (the first by ${facts.authorsOfFirst} author(s), ${wasExpanded ? 'open on its own' : 'folded, expanded by the row'}); first mark at x ${facts.chipLeft}, standalone marks at x ${facts.standaloneChipLeft}, day heading at x ${facts.headingLeft}; expanded rule at x ${expanded?.rule ?? 'none'} (${expanded?.borderLeft ?? 'no list'}), its marks at x ${expanded?.marks.join(', ') || 'none'}; one author window's text at x ${facts.oneAuthorBody ?? 'no such window'} against the standalone text at x ${facts.standaloneBody}; +N reads ${facts.moreSize} through a probe element`,
      };
    },
  );
  await t.step(
    'versions.restore-in-more',
    "Version history; a row's More menu; Restore this version; Cmd+Z; the row's Restore button at rest and on hover; every meta line's scrollWidth",
    "More lists Restore this version first and a click restores (the revision moves) and Cmd+Z returns; the Restore button is drawn on hover and focus only; no meta line is clipped at the panel's 320 px",
    async () => {
      const fingerprint = async () => fingerprintOf(await deckRead(t));
      const current = await fingerprint();
      const revisionBefore = (await t.state()).revision;
      await openHistory();
      for (const w of await visibleRows('[data-control^="versionHistory.window."]'))
        await t.clickControl(w).catch(() => undefined);
      await t.sleep(300);
      const picks = await visibleRows('[data-control^="versionHistory."][data-control$=".pick"]');
      const notCurrent = [];
      for (const pick of picks) {
        const n = pick.split('.')[1];
        const isCurrent = await page.evaluate(
          (v) =>
            document
              .querySelector(`li.ts-version[data-version="${v}"]`)
              ?.classList.contains('is-current') ?? false,
          n,
        );
        if (!isCurrent) notCurrent.push(n);
      }
      const n = notCurrent[notCurrent.length - 1];
      if (n === undefined) {
        await closeHistory();
        return { ok: false, observed: `no version row but the current one (${picks.length} rows)` };
      }
      const rowSel = `li.ts-version[data-version="${n}"]`;
      const restoreFacts = () =>
        page.evaluate((sel) => {
          const btn = document.querySelector(`${sel} .ts-version-restore`);
          if (!btn) return { present: false };
          const cs = getComputedStyle(btn);
          const drawn =
            btn.getClientRects().length > 0 &&
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            parseFloat(cs.opacity) > 0;
          return { present: true, drawn };
        }, rowSel);
      const clip = await page.evaluate(() => {
        const panel = document.querySelector('[data-control="panel.versionHistory"]');
        const rows = [...panel.querySelectorAll('.ts-version-meta')].filter(
          (el) => el.getClientRects().length > 0,
        );
        const clipped = rows.filter((el) => el.scrollWidth > el.clientWidth + 0.5);
        return {
          width: Math.round(panel.getBoundingClientRect().width),
          metas: rows.length,
          clipped: clipped.map((el) => el.textContent?.trim().slice(0, 60) ?? ''),
        };
      });
      await page.mouse.move(8, 8);
      await t.sleep(200);
      const atRest = await restoreFacts();
      await page.locator(rowSel).first().hover();
      await t.sleep(300);
      const onHover = await restoreFacts();
      await page.mouse.move(8, 8);
      await t.sleep(200);
      /* the More menu of the row */
      await t.clickControl(`versionHistory.${n}.more`);
      await t.sleep(300);
      const menuRows = await page.evaluate(() => {
        const menus = [...document.querySelectorAll('[role="menu"]')].filter(
          (el) => el.getClientRects().length > 0,
        );
        const menu = menus[menus.length - 1];
        if (!menu) return [];
        return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map(
          (el) => ({
            id: el.getAttribute('data-menu-item') ?? el.getAttribute('data-control') ?? '',
            text: el.textContent?.trim() ?? '',
            disabled: el.getAttribute('aria-disabled') === 'true',
          }),
        );
      });
      const first = menuRows[0] ?? null;
      const firstIsRestore =
        first !== null &&
        (first.id === 'version.restore' || /^Restore this version/.test(first.text)) &&
        !first.disabled;
      let restored = false;
      let back = false;
      let revisionAfter = revisionBefore;
      let words = null;
      if (firstIsRestore) {
        /* the row by its own id (build/b2.md item 6d: `menu.version.restore`, `data-menu-item`
           `version.restore`), never the first item of whichever menu the DOM holds */
        const row = page
          .locator(
            '[role="menu"] [data-menu-item="version.restore"], [data-control="menu.version.restore"]',
          )
          .filter({ visible: true })
          .first();
        if ((await row.count()) === 0)
          await page.locator('[role="menu"] [role="menuitem"]').first().click();
        else await row.click();
        const wrote =
          (await t.pollUntil(
            async () => (await t.state()).revision,
            (r) => r !== revisionBefore,
            15_000,
          )) !== revisionBefore;
        words = await t.textOf('deck.saveState');
        const after = await t
          .pollUntil(fingerprint, (f) => f !== current, 35_000, 500)
          .catch(fingerprint);
        const notice = await page.evaluate(
          () => document.querySelector('.ts-versions-notice')?.textContent?.trim() ?? null,
        );
        revisionAfter = (await t.state()).revision;
        restored = wrote && (after !== current || /restored/i.test(notice ?? ''));
        await t.settled();
        await t.clearAll();
        await t.press('Meta+z');
        back = await t
          .pollUntil(
            async () =>
              (await t.state()).revision !== revisionAfter && (await fingerprint()) === current,
            (x) => x,
            15_000,
          )
          .catch(() => false);
        await t.settled();
      } else await t.press('Escape');
      await closeHistory();
      return {
        ok:
          firstIsRestore &&
          restored &&
          back &&
          atRest.present &&
          atRest.drawn === false &&
          onHover.drawn === true &&
          clip.clipped.length === 0,
        observed: `More menu rows ${menuRows.map((r) => `${r.id || r.text}${r.disabled ? ' (disabled)' : ''}`).join(', ') || 'none'}; restore of row ${n} wrote ${restored} (revision ${revisionBefore} -> ${revisionAfter}; save words "${words ?? 'not read'}"); Cmd+Z brought the current version back ${back}; Restore button at rest ${atRest.present ? (atRest.drawn ? 'drawn' : 'hidden') : 'absent'}, on hover ${onHover.drawn ? 'drawn' : 'hidden'}; ${clip.metas} meta lines at ${clip.width} px, clipped ${clip.clipped.length}${clip.clipped.length > 0 ? ` ("${clip.clipped[0]}")` : ''}`,
      };
    },
  );
}

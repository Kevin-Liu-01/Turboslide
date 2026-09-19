// The View menu rows (docs/RETURN.md 2.16, section 5 `view.*` with the driver `probe --core`):
// Appearance, Show filmstrip, the three modes and the toolbar in Viewing, Full screen, the Hide
// the menus chevron, the Live pointers toggles, the Comments radios, Show all comments and the
// four display modes on a deck with two comments. The second browser's pointer is
// core/share.spec.ts. A row still parked on this build is reached with the switch on and the
// switch goes back at the end.

export const NAME = 'view';
export const IDS = [
  'view.appearance.rows',
  'view.show-filmstrip',
  'view.mode.rows',
  'view.mode.viewing-hides-toolbar',
  'view.full-screen',
  'view.hide-menus-chevron',
  'view.live-pointers.toggles',
  'view.comments.radios',
  'view.comments.show-all-panel',
  'view.comments.modes-markers',
];

export async function run(t) {
  const { page } = t;
  const T = t.deck.titleSlide;
  await t.clickCard(T);
  await t.clearAll();

  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const stored = (key) => page.evaluate((k) => localStorage.getItem(k), key);
  const editMode = () => t.attr('.pt-viewer:not(.ts-skeleton)', 'data-edit-mode');
  const visible = (sel) => t.has(sel);
  const setting = async (key) => (await t.state()).settings?.[key];
  /* compact mode is the shell's own state, drawn as `is-compact` on the root (EditorShell.tsx
     136); the window API's settings.compact does not follow it (the first run read false while
     the bars were hidden), so the rows read the class */
  const compactNow = () => t.has('.pt-viewer.is-compact');

  await t.step(
    'view.appearance.rows',
    'View > Appearance > Light, Dark, Match the presentation',
    'each sets data-theme and the choice is stored',
    async () => {
      const r = await t.reachRow('view', 'view.appearance', 'view.appearance.light');
      if (!r.present) return { ok: false, observed: 'View > Appearance is not reachable' };
      const deck = (await t.state()).theme;
      const facts = [];
      let ok = true;
      for (const [row, want] of [
        ['light', 'light'],
        ['dark', 'dark'],
        ['match', deck],
      ]) {
        await t.menuPath('view', 'view.appearance', `view.appearance.${row}`);
        const got = await t.pollUntil(theme, (x) => x === want, 5000).catch(theme);
        const kept = await stored('ts-chrome-appearance');
        ok =
          ok &&
          got === want &&
          (kept === row || (row === 'match' && (kept === null || kept === 'match')));
        facts.push(`${row}: data-theme ${got}, stored ${kept}`);
      }
      /* the walk's chrome is left following the presentation, the boot state */
      return {
        ok,
        observed: `${r.switched ? 'with the switch on; ' : ''}deck appearance ${deck}; ${facts.join('; ')}`,
      };
    },
  );

  await t.step(
    'view.show-filmstrip',
    'View > Show filmstrip, twice',
    'the filmstrip hides, then shows',
    async () => {
      const r = await t.reachRow('view', 'view.showFilmstrip');
      if (!r.present) return { ok: false, observed: 'View > Show filmstrip is not reachable' };
      const before = await visible('.pt-viewer.is-editor > .pt-sb');
      await t.menuPath('view', 'view.showFilmstrip');
      const hidden = await t
        .pollUntil(
          () => visible('.pt-viewer.is-editor > .pt-sb'),
          (x) => x === false,
          5000,
        )
        .catch(() => visible('.pt-viewer.is-editor > .pt-sb'));
      await t.menuPath('view', 'view.showFilmstrip');
      const back = await t
        .pollUntil(
          () => visible('.pt-viewer.is-editor > .pt-sb'),
          (x) => x === true,
          5000,
        )
        .catch(() => visible('.pt-viewer.is-editor > .pt-sb'));
      return {
        ok: before && hidden === false && back === true,
        observed: `filmstrip visible ${before} -> ${hidden} -> ${back}`,
      };
    },
  );

  await t.step(
    'view.mode.rows',
    'View > Mode > Viewing, Commenting, Editing',
    'data-edit-mode follows each and returns to editing',
    async () => {
      const r = await t.reachRow('view', 'view.mode', 'view.mode.viewing');
      if (!r.present) return { ok: false, observed: 'View > Mode is not reachable' };
      const facts = [];
      let ok = true;
      for (const mode of ['viewing', 'commenting', 'editing']) {
        await t.menuPath('view', 'view.mode', `view.mode.${mode}`);
        const got = await t.pollUntil(editMode, (x) => x === mode, 5000).catch(editMode);
        ok = ok && got === mode;
        facts.push(`${mode}: ${got}`);
      }
      return { ok, observed: facts.join('; ') };
    },
  );

  await t.step(
    'view.mode.viewing-hides-toolbar',
    'View > Mode > Viewing, then Editing',
    'the toolbar hides in Viewing and comes back in Editing',
    async () => {
      await t.menuPath('view', 'view.mode', 'view.mode.viewing');
      await t.pollUntil(editMode, (x) => x === 'viewing', 5000).catch(() => undefined);
      const hidden = await t
        .pollUntil(
          () => visible('.ts-toolbar'),
          (x) => x === false,
          3000,
        )
        .catch(() => visible('.ts-toolbar'));
      await t.menuPath('view', 'view.mode', 'view.mode.editing');
      await t.pollUntil(editMode, (x) => x === 'editing', 5000).catch(() => undefined);
      const back = await t
        .pollUntil(
          () => visible('.ts-toolbar'),
          (x) => x === true,
          3000,
        )
        .catch(() => visible('.ts-toolbar'));
      return {
        ok: hidden === false && back === true,
        observed: `toolbar visible in Viewing ${hidden}; in Editing ${back}`,
      };
    },
  );

  await t.step(
    'view.full-screen',
    'View > Full screen, then Escape',
    'the menu bar and the toolbar hide; Escape brings them back',
    async () => {
      const r = await t.reachRow('view', 'view.fullScreen');
      if (!r.present) return { ok: false, observed: 'View > Full screen is not reachable' };
      await t.menuPath('view', 'view.fullScreen');
      const compact = await t.pollUntil(compactNow, (x) => x === true, 5000).catch(compactNow);
      const menubar = await visible('.ts-menubar');
      const toolbar = await visible('.ts-toolbar');
      await t.press('Escape');
      const back = await t.pollUntil(compactNow, (x) => x !== true, 5000).catch(compactNow);
      const menubarBack = await visible('.ts-menubar');
      return {
        ok: compact === true && !menubar && !toolbar && back !== true && menubarBack,
        observed: `compact ${compact}; menu bar ${menubar}, toolbar ${toolbar}; after Escape compact ${back}, menu bar ${menubarBack}`,
      };
    },
  );

  await t.step(
    'view.hide-menus-chevron',
    "the toolbar's Hide the menus chevron, then the title row's Show the menus",
    'the menus hide as Full screen hides them and come back',
    async () => {
      let drawn = await t.visible('toolbar.hideMenus');
      let switched = false;
      if (!drawn) {
        switched = await t.setAdvanced(true);
        if (switched) t.deck.advanced = true;
        drawn = await t.visible('toolbar.hideMenus');
      }
      if (!drawn)
        return {
          ok: false,
          observed: `no Hide the menus chevron on the toolbar (switch on ${switched})`,
        };
      await t.clickControl('toolbar.hideMenus');
      const compact = await t.pollUntil(compactNow, (x) => x === true, 5000).catch(compactNow);
      const menubar = await visible('.ts-menubar');
      const show = await t.visible('toolbar.showMenus');
      if (show) await t.clickControl('toolbar.showMenus');
      else await t.press('Escape');
      const back = await t.pollUntil(compactNow, (x) => x !== true, 5000).catch(compactNow);
      const menubarBack = await visible('.ts-menubar');
      return {
        ok: compact === true && !menubar && show && back !== true && menubarBack,
        observed: `${switched ? 'with the switch on; ' : ''}compact ${compact}, menu bar ${menubar}; Show the menus drawn ${show}; after it compact ${back}, menu bar ${menubarBack}`,
      };
    },
  );

  await t.step(
    'view.live-pointers.toggles',
    'View > Live pointers > Show my pointer, twice; Show collaborator pointers, twice',
    'each flips and holds',
    async () => {
      const r = await t.reachRow('view', 'view.livePointers', 'view.livePointers.mine');
      if (!r.present) return { ok: false, observed: 'View > Live pointers is not reachable' };
      const facts = [];
      let ok = true;
      for (const [row, key] of [
        ['mine', 'pointerMine'],
        ['collaborators', 'pointerOthers'],
      ]) {
        const a = await setting(key);
        await t.menuPath('view', 'view.livePointers', `view.livePointers.${row}`);
        const b = await t
          .pollUntil(
            () => setting(key),
            (x) => x !== a,
            5000,
          )
          .catch(() => setting(key));
        await t.sleep(600);
        const held = await setting(key);
        await t.menuPath('view', 'view.livePointers', `view.livePointers.${row}`);
        const c = await t
          .pollUntil(
            () => setting(key),
            (x) => x === a,
            5000,
          )
          .catch(() => setting(key));
        ok = ok && b !== a && held === b && c === a;
        facts.push(`${row}: ${a} -> ${b} (held ${held}) -> ${c}`);
      }
      return { ok, observed: facts.join('; ') };
    },
  );

  const commentsRows = ['showAll', 'expand', 'minimize', 'hide'];
  const checks = async () => {
    await t.openMenu('view');
    await t.hoverRow('view.comments', '[data-control="menu.view.comments.showAll"]');
    const rows = (await t.menuRows('view')).filter((r) => r.id.startsWith('view.comments.'));
    await t.closeMenus();
    return Object.fromEntries(rows.map((r) => [r.id.replace('view.comments.', ''), r.checked]));
  };
  await t.step(
    'view.comments.radios',
    'View > Comments > each of the four rows',
    'each row checks alone',
    async () => {
      const r = await t.reachRow('view', 'view.comments', 'view.comments.showAll');
      if (!r.present) return { ok: false, observed: 'View > Comments is not reachable' };
      const facts = [];
      let ok = true;
      for (const row of ['expand', 'minimize', 'hide', 'showAll']) {
        await t.menuPath('view', 'view.comments', `view.comments.${row}`);
        await t.sleep(300);
        const c = await checks();
        const alone =
          c[row] === 'true' && commentsRows.filter((x) => x !== row).every((x) => c[x] !== 'true');
        ok = ok && alone;
        facts.push(`${row}: ${JSON.stringify(c)}`);
      }
      return { ok, observed: facts.join('; ') };
    },
  );

  await t.step(
    'view.comments.show-all-panel',
    'View > Comments > Show all comments, then Hide comments',
    'the Comments panel opens, then closes',
    async () => {
      await t.menuPath('view', 'view.comments', 'view.comments.hide');
      await t.sleep(300);
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.menuPath('view', 'view.comments', 'view.comments.showAll');
      const open = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => x,
          5000,
        )
        .catch(() => false);
      await t.menuPath('view', 'view.comments', 'view.comments.hide');
      const closed = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => !x,
          5000,
        )
        .catch(() => t.visible('panel.comments'));
      return {
        ok: open && closed === false,
        observed: `panel after Show all comments ${open}; after Hide comments ${closed}`,
      };
    },
  );

  await t.step(
    'view.comments.modes-markers',
    'two comments on two objects (setup writes), then Show all, Minimize, Hide, Expand',
    'Show all lists both with two markers; Minimize draws the two markers only; Hide draws none; Expand opens both cards',
    async () => {
      /* the two comments through the window API on two blocks of the formatting slide (or the
         title slide's heading and lead), a setup write, never a driven step */
      const slide = t.deck.formatSlide ?? T;
      await t.clickCard(slide);
      const objs = await t.objectsOf(slide);
      const targets = objs.slice(0, 2).map((o) => o.id);
      if (targets.length < 2) {
        const heads = await t.allBlockIds(slide);
        targets.push(...heads.filter((id) => !targets.includes(id)).slice(0, 2 - targets.length));
      }
      let added = 0;
      for (const [i, blockId] of targets.entries()) {
        const r = await t
          .invoke('comment.add', {
            anchor: { kind: 'block', slideId: slide, blockId },
            body: { text: `Check this ${i + 1}`, mentions: [] },
          })
          .catch((e) => ({ error: String(e) }));
        if (!r?.error) added += 1;
      }
      await t.sleep(800);
      const facts = [];
      const read = () =>
        page.evaluate(() => ({
          panel: document.querySelector('[data-control="panel.comments"]') !== null,
          listed: document.querySelectorAll(
            '[data-control="panel.comments"] [data-control^="panel.comments.thread."], [data-control="panel.comments"] [data-control^="comment.thread"], [data-control="panel.comments"] .ts-comment-thread, [data-control="panel.comments"] article',
          ).length,
          markers: [...document.querySelectorAll('[data-control="comment.marker"]')].filter(
            (e) => e.getClientRects().length > 0,
          ).length,
          cards: [
            ...document.querySelectorAll('[data-control="comment.card"], .ts-comment-card'),
          ].filter((e) => e.getClientRects().length > 0).length,
        }));
      const modes = {};
      for (const row of ['showAll', 'minimize', 'hide', 'expand']) {
        await t.menuPath('view', 'view.comments', `view.comments.${row}`);
        await t.sleep(700);
        modes[row] = await read();
        facts.push(`${row}: ${JSON.stringify(modes[row])}`);
      }
      await t.menuPath('view', 'view.comments', 'view.comments.showAll');
      await t.sleep(300);
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.clickCard(T);
      return {
        ok:
          added === 2 &&
          modes.showAll.panel &&
          modes.showAll.listed >= 2 &&
          modes.showAll.markers === 2 &&
          modes.minimize.markers === 2 &&
          modes.minimize.cards === 0 &&
          modes.hide.markers === 0 &&
          modes.expand.cards >= 2,
        observed: `comments added ${added} of 2 on ${targets.join(', ')}; ${facts.join('; ')}`,
      };
    },
  );
  await t.advancedBack('the View rows');
}

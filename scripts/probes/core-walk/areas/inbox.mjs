// The inbox (docs/RETURN.md 2.16, section 5 `inbox.*` with the driver `probe --core`): the bell
// and its panel as a toggle, and Notification settings kept across a reopen and a reload. The
// notification that arrives from a second browser is core/share.spec.ts. The plate is parked
// (`title.inbox`), so the rows are driven with Tools > Advanced tools on and the switch goes back.

export const NAME = 'inbox';
export const IDS = ['inbox.bell-panel-toggle', 'inbox.settings-persist'];

export async function run(t) {
  const { page, BASE } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();

  await t.step(
    'inbox.bell-panel-toggle',
    'click the bell; read the panel; click the bell again',
    'Notifications opens with Nothing new, Mark all read and a settings link; the second click closes it',
    async () => {
      let drawn = await t.visible('title.inbox');
      let switched = false;
      if (!drawn) {
        switched = await t.setAdvanced(true);
        if (switched) t.deck.advanced = true;
        drawn = await t
          .pollUntil(
            () => t.visible('title.inbox'),
            (x) => x,
            4000,
          )
          .catch(() => false);
      }
      if (!drawn)
        return { ok: false, observed: `no bell in the title row (switch on ${switched})` };
      await t.clickControl('title.inbox');
      const open = await t
        .pollUntil(
          () => t.visible('panel.inbox'),
          (x) => x,
          5000,
        )
        .catch(() => false);
      const words = await t.textOf('panel.inbox');
      const markAll = await t.visible('panel.inbox.markAllRead');
      const settings = await t.visible('panel.inbox.settings');
      const pressed = await t.attr('[data-control="title.inbox"]', 'aria-pressed');
      await t.clickControl('title.inbox');
      const closed = await t
        .pollUntil(
          () => t.visible('panel.inbox'),
          (x) => !x,
          4000,
        )
        .catch(() => t.visible('panel.inbox'));
      const pressedAfter = await t.attr('[data-control="title.inbox"]', 'aria-pressed');
      if (closed !== false && (await t.visible('panel.inbox.close')))
        await t.clickControl('panel.inbox.close');
      return {
        ok:
          open &&
          /Nothing new/.test(words ?? '') &&
          markAll &&
          settings &&
          pressed === 'true' &&
          closed === false,
        observed: `${switched ? 'with the switch on; ' : ''}panel open ${open} (aria-pressed ${pressed}); words "${(words ?? '').slice(0, 80)}"; Mark all read ${markAll}; settings link ${settings}; panel still open after the second click ${closed} (aria-pressed ${pressedAfter})`,
      };
    },
  );

  await t.step(
    'inbox.settings-persist',
    'Tools > Notification settings, None, Save; reopen; reload',
    'the reopened dialog and the reloaded page read None',
    async () => {
      const r = await t.reachRow('tools', 'tools.notificationSettings');
      if (!r.present)
        return { ok: false, observed: 'Tools > Notification settings is not reachable' };
      const level = () =>
        page.evaluate(() => {
          const boxes = [
            ...document.querySelectorAll('[data-control^="dialog.notificationSettings.level."]'),
          ];
          const checked = boxes.find((el) =>
            el.matches('input')
              ? el.checked
              : el.getAttribute('aria-checked') === 'true' || el.querySelector('input')?.checked,
          );
          return (
            checked
              ?.getAttribute('data-control')
              ?.replace('dialog.notificationSettings.level.', '') ?? null
          );
        });
      await t.menuPath('tools', 'tools.notificationSettings');
      await t.waitControl('dialog.notificationSettings', 8000);
      const before = await level();
      await t.clickControl('dialog.notificationSettings.level.none');
      await t.sleep(200);
      const picked = await level();
      await t.clickControl('dialog.notificationSettings.save');
      const closed = await t.waitGone('[data-control="dialog.notificationSettings"]', 6000);
      const error = await t.textOf('dialog.notificationSettings.error');
      await t.settled();
      await t.menuPath('tools', 'tools.notificationSettings');
      await t.waitControl('dialog.notificationSettings', 8000);
      const reopened = await level();
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.notificationSettings"]', 4000);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}`);
      await t.settled();
      if (!(await t.menuRowPresent('tools', 'tools.notificationSettings'))) {
        await t.setAdvanced(true);
        t.deck.advanced = true;
      }
      await t.menuPath('tools', 'tools.notificationSettings');
      await t.waitControl('dialog.notificationSettings', 8000);
      const afterReload = await level();
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.notificationSettings"]', 4000);
      return {
        ok: picked === 'none' && closed && reopened === 'none' && afterReload === 'none',
        observed: `${r.switched ? 'with the switch on; ' : ''}level ${before} -> picked ${picked}; Save closed ${closed}${error ? ` (error "${error}")` : ''}; reopened ${reopened}; after a reload ${afterReload}`,
      };
    },
  );
  await t.advancedBack('the inbox rows');
}

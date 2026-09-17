// The switch's probe row (docs/FOCUS.md section 3, 6.4 `surface.menus.open-close-escape` with
// the driver `probe --core`): every menu of the bar opens and closes with Escape with no console
// error. The switch's own rows are core/surface.spec.ts; `surface.cleanup` is the finally
// block's row (index.mjs `cleanup`).

export const NAME = 'surface';
export const IDS = ['surface.menus.open-close-escape'];

export async function run(t) {
  const { page } = t;
  await t.clearAll();
  await t.step(
    'surface.menus.open-close-escape',
    'open every menu of the bar and close it with Escape',
    'each shows rows, Escape removes it, no console error',
    async () => {
      const menus = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menubar."]')]
          .filter((el) => el.tagName.toLowerCase() === 'button' && el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control').replace('menubar.', '')),
      );
      const facts = [];
      let ok = menus.length >= 8;
      for (const id of menus) {
        const errorsBefore = t.consoleErrors.length;
        await t.openMenu(id);
        const rows = await page.locator(`#ts-menu-${id} [data-control^="menu."]`).count();
        await t.press('Escape');
        await t.sleep(300);
        const gone = !(await t.has(`#ts-menu-${id}`));
        const errs = t.consoleErrors.slice(errorsBefore);
        const good = rows > 0 && gone && errs.length === 0;
        ok = ok && good;
        facts.push(`${id}: ${rows} rows, closed ${gone}, errors ${errs.length}`);
      }
      return { ok, observed: `${menus.length} menus (${menus.join(', ')}); ${facts.join('; ')}` };
    },
  );
}

// B3a day 0 (docs/NEXT.md 4.1.3 item 19): the default view rows Google does not have, read from the
// menu model under Node with the default context, Tools > Advanced tools off. Prints JSON.
//   node docs/gslides-parity/round1/build/b3a/model-rows.mjs > out.json
const root = new URL('../../../../../packages/chrome/src/menus/', import.meta.url).href;
const M = await import(root + 'model.ts');
const T = await import(root + 'toolbar-tails.ts');
const ctx = M.DEFAULT_MENU_CONTEXT;
function walk(items, depth, path, out) {
  for (const item of M.visibleItems(items, { context: ctx })) {
    const here = [...path, item.label];
    out.push({ id: item.id, label: item.label, path: here.join(' > '), depth, turboslide: item.turboslide === true, container: item.items !== undefined && item.effect?.kind === 'submenu' && item.effect.dynamic === undefined, enabled: M.isEnabled(item, ctx), doc: item.doc ?? null });
    if (item.items !== undefined) walk(item.items, depth + 1, here, out);
  }
  return out;
}
const rows = [];
for (const menu of M.visibleMenus(ctx)) walk(menu.items, 0, [menu.label], rows);
const title = walk(M.TITLE_ROW_ITEMS, 0, ['Title row'], []);
const ours = rows.filter((r) => r.turboslide);
const disabledLeaves = rows.filter((r) => !r.container && !r.enabled);
const byMenu = {};
for (const r of disabledLeaves) byMenu[r.path.split(' > ')[0]] = (byMenu[r.path.split(' > ')[0]] ?? 0) + 1;
const top = {};
for (const menu of M.visibleMenus(ctx)) top[menu.label] = M.visibleItems(menu.items, { context: ctx, collapseSingles: true }).map((i) => i.label);
const contextMenus = {};
for (const target of Object.keys(M.CONTEXT_MENUS)) contextMenus[target] = M.contextMenuItems(target, ctx).map((x) => (x === M.DIVIDER ? '-' : x.label));
console.log(JSON.stringify({ readAt: new Date().toISOString(), menuRows: rows.length, topRows: Object.fromEntries(Object.entries(top).map(([k, v]) => [k, v.length])), top, googleLacks: ours.length, ours, titleRowOurs: title.filter((r) => r.turboslide), disabledLeaves: disabledLeaves.length, disabledByMenu: byMenu, contextMenus }, null, 1));

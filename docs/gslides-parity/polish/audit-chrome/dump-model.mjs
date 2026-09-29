import * as m from '/Users/kevinliu/repos/Turboslide-live/packages/chrome/src/menus/model.ts';
const out = [];
const walk = (items, depth, menuId) => {
  for (const it of items) {
    out.push({ menu: menuId, depth, id: it.id, label: it.label, status: it.status, advanced: it.advanced ?? false, shortcut: it.key ? it.key.mac : '', kind: it.kind ?? '', hasChildren: Boolean(it.items?.length), when: it.when ? (typeof it.when === 'string' ? it.when : JSON.stringify(it.when)) : '', enabled: it.enabled ? (typeof it.enabled === 'string' ? it.enabled : JSON.stringify(it.enabled)) : '', icon: it.icon ?? '' });
    if (it.items) walk(it.items, depth + 1, menuId);
  }
};
for (const menu of m.MENUS) { out.push({ menu: menu.id, depth: -1, id: menu.id, label: menu.label, status: menu.status ?? '', advanced: menu.advanced ?? false }); walk(menu.items, 0, menu.id); }
console.log(JSON.stringify({ menus: out, titleRow: m.TITLE_ROW_ITEMS.map(i => ({ id: i.id, label: i.label, status: i.status, advanced: i.advanced ?? false })), toolbarHead: m.TOOLBAR_HEAD.map(c => ({ id: c.id, kind: c.kind, label: c.label, advanced: c.advanced ?? false, item: c.item ?? '', when: c.when ? JSON.stringify(c.when) : '' })), toolbarTail: m.TOOLBAR_TAIL_DEFAULT.map(c => ({ id: c.id, kind: c.kind, label: c.label, advanced: c.advanced ?? false, item: c.item ?? '', when: c.when ? JSON.stringify(c.when) : '' })), contextMenus: Object.fromEntries(Object.entries(m.CONTEXT_MENUS).map(([k, v]) => [k, v.map(e => typeof e === 'string' ? e : `${e.id}${e.advanced ? ' [adv]' : ''}${e.when ? ' when=' + JSON.stringify(e.when) : ''}`)])), menuKeys: Object.keys(m.CONTEXT_MENUS) }, null, 1));

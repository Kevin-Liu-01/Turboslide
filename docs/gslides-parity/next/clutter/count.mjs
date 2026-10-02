const root = '/Users/kevinliu/repos/Turboslide-next/packages/chrome/src/menus/';
const M = await import(root + 'model.ts');
const T = await import(root + 'toolbar-tails.ts');
const S = await import(root + 'strings.ts');
const { MENUS, TITLE_ROW_ITEMS, DEFAULT_MENU_CONTEXT, visibleItems, visibleMenus, walkItems, isPresent, TOOLBAR_HEAD, CONTEXT_MENUS, contextMenuItems } = M;
const ctxOff = DEFAULT_MENU_CONTEXT;
const ctxOn = { ...ctxOff, settings: { ...ctxOff.settings, advancedTools: true } };
function walkVisible(items, ctx, depth = 0) {
  const out = [];
  for (const it of visibleItems(items, { context: ctx })) {
    out.push({ id: it.id, label: it.label, depth, sub: !!it.items, turboslide: !!it.turboslide, status: it.status, advanced: !!it.advanced, enabled: M.isEnabled(it, ctx) });
    if (it.items) out.push(...walkVisible(it.items, ctx, depth + 1));
  }
  return out;
}
const report = { menus: {}, totals: {} };
let tOff = 0, tOn = 0, tAll = 0, tAdv = 0, tLater = 0, tOmit = 0, tCtx = 0, tTop = 0, tTopOn = 0, tTs = 0, tDisabled = 0;
for (const menu of MENUS) {
  const all = walkItems(menu.items);
  const off = walkVisible(menu.items, ctxOff);
  const on = walkVisible(menu.items, ctxOn);
  const adv = all.filter((i) => i.advanced).length;
  const later = all.filter((i) => i.status === 'later').length;
  const omit = all.filter((i) => i.status === 'omit').length;
  const ctxOnly = all.filter((i) => i.contextOnly).length;
  const top = visibleItems(menu.items, { context: ctxOff }).length;
  const topOn = visibleItems(menu.items, { context: ctxOn }).length;
  const ts = off.filter((i) => i.turboslide).length;
  const dis = off.filter((i) => !i.enabled && !i.sub).length;
  report.menus[menu.id] = { label: menu.label, model: all.length, advanced: adv, later, omit, contextOnly: ctxOnly, defaultTop: top, defaultAll: off.length, advancedOnTop: topOn, advancedOnAll: on.length, turboslideInDefault: ts, disabledLeafInDefault: dis, visibleInDefault: visibleMenus(ctxOff).some((m) => m.id === menu.id) };
  tOff += off.length; tOn += on.length; tAll += all.length; tAdv += adv; tLater += later; tOmit += omit; tCtx += ctxOnly; tTop += top; tTopOn += topOn; tTs += ts; tDisabled += dis;
}
report.totals = { model: tAll, advanced: tAdv, later: tLater, omit: tOmit, contextOnly: tCtx, defaultTopRows: tTop, defaultAllRows: tOff, advancedOnTopRows: tTopOn, advancedOnAllRows: tOn, turboslideInDefault: tTs, disabledLeafInDefault: tDisabled, menusDefault: visibleMenus(ctxOff).map((m) => m.label), menusOn: visibleMenus(ctxOn).map((m) => m.label) };
const titleAll = walkItems(TITLE_ROW_ITEMS);
report.title = { model: titleAll.length, defaultTop: visibleItems(TITLE_ROW_ITEMS, { context: ctxOff }).map((i) => i.id), defaultAll: walkVisible(TITLE_ROW_ITEMS, ctxOff).map((i) => i.id), onTop: visibleItems(TITLE_ROW_ITEMS, { context: ctxOn }).map((i) => i.id) };
report.toolbarHead = TOOLBAR_HEAD.filter((c) => isPresent(c, ctxOff)).map((c) => c.control);
report.tails = {};
for (const [kind, ctrls] of Object.entries(T.TOOLBAR_TAILS)) {
  report.tails[kind] = { model: ctrls.length, default: ctrls.filter((c) => isPresent(c, ctxOff)).map((c) => c.control), advancedOn: ctrls.filter((c) => isPresent(c, ctxOn)).map((c) => c.control), parked: ctrls.filter((c) => c.advanced).map((c) => c.control), later: ctrls.filter((c) => c.status === 'later').map((c) => c.control), turboslide: ctrls.filter((c) => c.turboslide).map((c) => c.control) };
}
report.tailEnd = T.TOOLBAR_TAIL_END.filter((c) => isPresent(c, ctxOff)).map((c) => c.control);
report.contextMenus = {};
for (const target of Object.keys(CONTEXT_MENUS)) {
  report.contextMenus[target] = { default: contextMenuItems(target, ctxOff).filter((x) => x !== '-').length, on: contextMenuItems(target, ctxOn).filter((x) => x !== '-').length };
}
// all default view rows as id list per menu
report.defaultRows = {};
for (const menu of MENUS) report.defaultRows[menu.id] = walkVisible(menu.items, ctxOff).map((i) => `${'  '.repeat(i.depth)}${i.id} | ${i.label}${i.turboslide ? ' [ts]' : ''}${i.enabled || i.sub ? '' : ' [disabled]'}`);
// forbidden words in the default view labels and docs
const hits = [];
for (const menu of MENUS) for (const i of walkVisible(menu.items, ctxOff)) {
  const it = M.itemById(i.id);
  const words = S.forbiddenWordsIn(`${M.resolveLabel(it, ctxOff)} ${it.doc ?? ''}`);
  if (words.length) hits.push(`${i.id}: ${words.join(',')} :: ${it.label} :: ${it.doc ?? ''}`);
}
report.forbiddenHits = hits;
console.log(JSON.stringify(report, null, 1));

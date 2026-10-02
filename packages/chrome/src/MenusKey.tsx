import { useMemo, useRef, useState } from 'react';

import { useEditorShell } from './editor-shell-context';
import { Icon } from './icons';
import { Menu } from './Menu';
import { menusWithAccessKeys } from './MenuBar';
import { visibleMenus } from './menus/model';
import type { Menu as MenuData, MenuItem } from './menus/model';
import { tipProps } from './Tooltip';

/**
 * The phone editor's Menus key (docs/NEXT.md 4.1.3 item 18 and question 7's default; brand C
 * 141 and 198; brand-judge-2 187): under 720 px the menu bar row leaves (PhoneEditor.css) and
 * this one key at the head of the toolbar opens the menus the role can use, each a row whose
 * submenu holds that menu's rows, so every row of the bar stays one tap and one hover away. A row
 * runs through the shell as the bar's plate runs it. Drawn under 720 px alone.
 */

/** The id of the Menus key's menu; the key names it in `aria-controls` while it is mounted. */
export const MENUS_KEY_MENU_ID = 'ts-menu-menus';

/** The menus as the rows of one menu: each menu a row whose submenu is its own rows. */
export function menusAsRows(menus: ReadonlyArray<MenuData>): MenuItem[] {
  return menus.map((menu) => ({
    id: `menus.${menu.id}`,
    label: menu.label,
    status: 'now',
    items: menu.items,
  }));
}

export function MenusKey() {
  const shell = useEditorShell();
  const { menuContext, runItem } = shell;
  const key = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => menusAsRows(visibleMenus(menuContext, menusWithAccessKeys())),
    [menuContext],
  );
  return (
    <>
      <button
        ref={key}
        type="button"
        className="pt-ib ts-menus-key"
        data-control="toolbar.menus"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? MENUS_KEY_MENU_ID : undefined}
        onClick={() => setOpen((on) => !on)}
        {...tipProps({ name: 'Menus', doc: 'File, Edit, View, Insert and the other menus' })}
      >
        <Icon name="bars-3" />
        <span className="pt-lb">Menus</span>
      </button>
      {open && key.current ? (
        <Menu
          items={rows}
          context={menuContext}
          label="Menus"
          anchor={{ kind: 'element', element: key.current }}
          placement="below"
          returnFocusTo={key.current}
          onSelect={(item) => {
            setOpen(false);
            runItem(item, key.current);
          }}
          onClose={() => setOpen(false)}
          id={MENUS_KEY_MENU_ID}
        />
      ) : null}
    </>
  );
}

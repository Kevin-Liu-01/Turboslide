import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEditorShell } from './editor-shell-context';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import type { MenuCloseReason } from './Menu';
import { assignAccessKeys, tooltipKey } from './menus/keys';
import { MENUS } from './menus/model';
import type { Menu as MenuData, MenuId, MenuItem } from './menus/model';
import { tipProps } from './Tooltip';

import './MenuBar.css';

/**
 * The menu bar (gslides-parity SPEC 1.1, 2.11, 13.1; R01 "Menu bar placement and behaviour",
 * R08 B1 to B6): the ten menus in Google's order, left aligned, 13 px Inter, 12 px of padding per
 * title, 28 px tall, drawing no rule of its own. `role="menubar"` with one tab stop: the titles
 * are `menuitem`s with roving tabindex; Left and Right move between them, Down or Enter opens,
 * a click opens, and while one is open hovering another title switches menus (R08 B2) as do the
 * arrows from inside the open plate (`onNavigate`). Esc closes and returns focus to the title;
 * Tab closes and leaves. The access keys (Ctrl+Option plus the letter, Alt plus it on Windows)
 * open a menu from anywhere through `shell.setMenuOpen` (useEditorKeys.ts). Every row inside a
 * plate is drawn by Menu.tsx from the model with `assignAccessKeys` applied once per menu.
 */
export type MenuBarProps = {
  className?: string;
};

/** The menus with their rows' access keys assigned once. */
export function menusWithAccessKeys(): ReadonlyArray<MenuData> {
  return MENUS.map((menu) => ({ ...menu, items: assignAccessKeys(menu.items) }));
}

export function MenuBar({ className }: MenuBarProps) {
  const shell = useEditorShell();
  const { menuOpen, setMenuOpen, menuContext, platform, runItem } = shell;
  const menus = useMemo(() => menusWithAccessKeys(), []);
  const titles = useRef(new Map<MenuId, HTMLButtonElement>());
  const [focusId, setFocusId] = useState<MenuId>('file');
  /* the plate opened from the keyboard focuses its first row; from the pointer it does not */
  const viaKeyboard = useRef(false);

  const indexOf = useCallback((id: MenuId) => menus.findIndex((menu) => menu.id === id), [menus]);

  const open = useCallback(
    (id: MenuId, keyboard: boolean) => {
      viaKeyboard.current = keyboard;
      setFocusId(id);
      setMenuOpen(id);
    },
    [setMenuOpen],
  );

  const step = useCallback(
    (from: MenuId, delta: -1 | 1, keepOpen: boolean) => {
      const at = indexOf(from);
      const next = menus[(at + delta + menus.length) % menus.length];
      if (next === undefined) return;
      setFocusId(next.id);
      if (keepOpen) open(next.id, true);
      else titles.current.get(next.id)?.focus();
    },
    [indexOf, menus, open],
  );

  /* while a plate is open the title of the open menu is the one in the tab order */
  useEffect(() => {
    if (menuOpen !== null) setFocusId(menuOpen);
  }, [menuOpen]);

  const onTitleKey = (menu: MenuData) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        step(menu.id, 1, menuOpen !== null);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        step(menu.id, -1, menuOpen !== null);
        return;
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        open(menu.id, true);
        return;
      case 'Home':
        event.preventDefault();
        setFocusId(menus[0]?.id ?? 'file');
        titles.current.get(menus[0]?.id ?? 'file')?.focus();
        return;
      case 'End': {
        event.preventDefault();
        const last = menus[menus.length - 1]?.id ?? 'help';
        setFocusId(last);
        titles.current.get(last)?.focus();
        return;
      }
      case 'Escape':
        if (menuOpen !== null) {
          event.preventDefault();
          setMenuOpen(null);
        }
        return;
      default:
        break;
    }
  };

  const onClose = (reason: MenuCloseReason) => {
    setMenuOpen(null);
    if (reason === 'tab') {
      /* Tab closes everything and leaves the bar */
      titles.current.get(focusId)?.blur();
    }
  };

  const onSelect = (item: MenuItem, anchor: HTMLElement | null) => {
    runItem(item, anchor);
  };

  const openMenu = menuOpen === null ? undefined : menus.find((menu) => menu.id === menuOpen);
  const openTitle = menuOpen === null ? null : (titles.current.get(menuOpen) ?? null);

  return (
    <nav className={cn('ts-menubar', className)} aria-label="Menus" data-control="menubar">
      <div className="ts-menubar-titles" role="menubar" aria-label="Menus">
        {menus.map((menu) => {
          const isOpen = menuOpen === menu.id;
          const key = tooltipKey(menu.key, platform);
          const tip = tipProps({
            name: `${menu.label} menu`,
            ...(key === undefined ? {} : { key }),
          });
          const onKey = onTitleKey(menu);
          return (
            <button
              key={menu.id}
              ref={(el) => {
                if (el) titles.current.set(menu.id, el);
                else titles.current.delete(menu.id);
              }}
              type="button"
              role="menuitem"
              className={cn('ts-menubar-title', isOpen && 'is-open')}
              tabIndex={focusId === menu.id ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              data-control={`menubar.${menu.id}`}
              data-menu={menu.id}
              onClick={() => (isOpen ? setMenuOpen(null) : open(menu.id, false))}
              onPointerEnter={(event) => {
                if (event.pointerType === 'touch') return;
                if (menuOpen !== null && menuOpen !== menu.id) open(menu.id, false);
              }}
              {...tip}
              onKeyDown={(event) => {
                tip.onKeyDown(event);
                onKey(event);
              }}
            >
              <span className="ts-menubar-word">
                {menu.label.slice(0, 1)}
                <span className="ts-menubar-rest">{menu.label.slice(1)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {openMenu !== undefined && openTitle !== null ? (
        <Menu
          items={openMenu.items}
          context={menuContext}
          label={`${openMenu.label} menu`}
          anchor={{ kind: 'element', element: openTitle }}
          placement="below"
          returnFocusTo={openTitle}
          autoFocus={viaKeyboard.current}
          onSelect={(item) => onSelect(item, openTitle)}
          onClose={onClose}
          onNavigate={(direction) => step(openMenu.id, direction, true)}
          renderDynamic={shell.renderLayoutSubmenu}
          id={`ts-menu-${openMenu.id}`}
        />
      ) : null}
    </nav>
  );
}

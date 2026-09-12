import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import type { LayoutId } from '@turboslide/schema/layouts';
import { LAYOUT_RULE_LABEL, layoutGroups } from '@turboslide/schema/layouts';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import type { MenuCloseReason } from './Menu';
import type { ContextTarget, MenuContext, MenuItem } from './menus/model.ts';
import { contextMenuItems, DIVIDER } from './menus/model.ts';
import { tipProps } from './Tooltip';

import './ContextMenu.css';

/**
 * The right-click menus of the Google Slides parity round (gslides-parity SPEC 4.2, 4.3, 13.2):
 * one component over the menu primitive (`Menu.tsx`) and the menu model (`menus/model.ts`
 * CONTEXT_MENUS), so the filmstrip's card menu, the empty canvas, a text box, an image and a
 * table cell all draw the same rows the menu bar draws, in the model's order with Google's keys on
 * the right and the model's predicates enabling them. The menu opens at the pointer (or at the
 * centre of the selection from Shift F10), the first row takes focus, Esc and Tab return focus to
 * the element that was right-clicked, and a row's activation reaches the caller through
 * `onSelect` with the model's item; the caller runs its effect (an action, a dialog, a panel).
 * Apply layout is the model's one dynamic submenu: `renderLayouts` draws the layout grid when the
 * chrome has one, and the default here is the plain list of the 21 layouts with the current one
 * checked, Google's eleven first and the GT layouts after the rule (SPEC 5.2), each row a
 * `menuitemradio` the arrows walk. New in Turboslide (no Prototemplate source).
 */
export type ContextMenuProps = {
  target: ContextTarget;
  context: MenuContext;
  /** the pointer, in client pixels */
  anchor: { x: number; y: number };
  /** where focus returns on Esc and Tab (SPEC 4.2, 13.2) */
  returnFocusTo: HTMLElement | null;
  /** a row without a submenu was activated */
  onSelect: (item: MenuItem) => void;
  onClose: (reason: MenuCloseReason) => void;
  /** the accessible name of the menu */
  label?: string;
  /** the layout of the slide (or the selected slides) the Apply layout submenu checks */
  layout?: LayoutId;
  /** Apply layout picked a layout */
  onLayout?: (layout: LayoutId) => void;
  /** the chrome's layout grid for the Apply layout submenu; the plain list when absent */
  renderLayouts?: (pick: (layout: LayoutId) => void, current: LayoutId | undefined) => ReactNode;
  id?: string;
};

/**
 * The model's rows of a target as the items the Menu draws: the DIVIDER entries become
 * `dividerBefore` on the row that follows, so the primitive draws the rule (menus/model.ts keeps
 * the list flat for the audit, which reads the order of SPEC 4.2 from it).
 */
export function contextItems(target: ContextTarget, context: MenuContext): MenuItem[] {
  const out: MenuItem[] = [];
  let divider = false;
  for (const entry of contextMenuItems(target, context)) {
    if (entry === DIVIDER) {
      divider = out.length > 0;
      continue;
    }
    /* the menu bar's own dividers do not apply here: the context list places its own */
    const { dividerBefore: _bar, ...row } = entry;
    out.push(divider ? { ...row, dividerBefore: true } : row);
    divider = false;
  }
  return out;
}

/** The label the menu carries for a target, Google's noun for what was clicked. */
export function contextMenuLabel(target: ContextTarget): string {
  switch (target) {
    case 'filmstripCard':
      return 'Slide menu';
    case 'emptyCanvas':
      return 'Slide menu';
    case 'textBlock':
      return 'Object menu';
    case 'image':
      return 'Image menu';
    case 'tableCell':
      return 'Table menu';
    case 'textSelection':
      return 'Text menu';
  }
}

type LayoutListProps = {
  current: LayoutId | undefined;
  onPick: (layout: LayoutId) => void;
};

/**
 * The default Apply layout submenu: the 21 layouts as radio rows, Google's eleven, the "GT
 * layouts" rule, then the rest (gslides-parity SPEC 5.2), the current layout checked. The arrows
 * walk the rows, Enter picks; the parent Menu handles Esc and Left.
 */
export function LayoutList({ current, onPick }: LayoutListProps) {
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => layoutGroups(), []);
  const rows = [...groups.google, ...groups.gt];
  /* the first row takes focus once the parent row's own focus effect has run (Menu.tsx focuses
     the opened row after its children mount), so the arrows walk the list from the keyboard */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      root.current?.querySelector<HTMLElement>('[role="menuitemradio"][tabindex="0"]')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return (
    <div ref={root} className="ts-layout-list" onKeyDown={onKeyDown}>
      {rows.map((entry, index) => {
        const tip = tipProps({ name: entry.label, doc: entry.doc });
        return (
          <div key={entry.id} className="ts-menu-group">
            {index === groups.google.length ? (
              <div className="ts-layout-rule" role="separator" aria-label={LAYOUT_RULE_LABEL}>
                {LAYOUT_RULE_LABEL}
              </div>
            ) : null}
            <div
              role="menuitemradio"
              tabIndex={index === 0 ? 0 : -1}
              aria-checked={entry.id === current}
              className={cn('ts-menu-item', entry.id === current && 'is-checked')}
              data-menu-item={`slide.applyLayout.${entry.id}`}
              data-control={`menu.slide.applyLayout.${entry.id}`}
              data-layout={entry.id}
              onClick={(event) => {
                event.stopPropagation();
                onPick(entry.id);
              }}
              {...tip}
              onKeyDown={(event) => {
                tip.onKeyDown(event);
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onPick(entry.id);
                }
              }}
            >
              <span className="ts-menu-ic" aria-hidden="true">
                {entry.id === current ? (
                  <span className="ts-menu-check" />
                ) : (
                  <Icon name="columns" />
                )}
              </span>
              <span className="ts-menu-label">{entry.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({
  target,
  context,
  anchor,
  returnFocusTo,
  onSelect,
  onClose,
  label,
  layout,
  onLayout,
  renderLayouts,
  id,
}: ContextMenuProps) {
  const items = useMemo(() => contextItems(target, context), [target, context]);
  const pick = (picked: LayoutId) => {
    onLayout?.(picked);
    onClose('select');
  };
  return (
    <Menu
      id={id}
      items={items}
      context={context}
      label={label ?? contextMenuLabel(target)}
      anchor={{ kind: 'point', x: anchor.x, y: anchor.y }}
      placement="point"
      includeContextOnly
      returnFocusTo={returnFocusTo}
      onSelect={onSelect}
      onClose={onClose}
      className={`ts-context-menu is-${target}`}
      renderDynamic={(item) =>
        item.effect?.kind === 'submenu' && item.effect.dynamic === 'layouts' ? (
          renderLayouts ? (
            renderLayouts(pick, layout)
          ) : (
            <LayoutList current={layout} onPick={pick} />
          )
        ) : null
      }
    />
  );
}

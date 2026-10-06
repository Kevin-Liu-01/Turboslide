import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';
import { shortcutLabel, ariaKeyShortcuts, tooltipKey } from './menus/keys.ts';
import type { MenuContext, MenuItem } from './menus/model.ts';
import {
  DIVIDER,
  isChecked,
  isEnabled,
  resolveEffect,
  resolveLabel,
  tooltipDoc,
  visibleItems,
} from './menus/model.ts';
import { openRoster } from './presence/roster-hook';
import { noteMenuRowActivated } from './Dialog';
import { pointAnchor } from './place';
import type { PlaceAnchor } from './place';
import { hideTooltip, hideTooltipUntilInput, sentence, tipProps } from './Tooltip';
import { usePlate, useStart } from './usePlate';

import './Menu.css';

/**
 * The one menu primitive of the chrome (SPEC 13.1, 2.11): the menu bar's dropdowns, the
 * right-click menus and the toolbar's arrow menus all draw a `Menu` over items of the menu model
 * (`menus/model.ts`). It follows the WAI-ARIA menu pattern: `role="menu"` with `role="menuitem"`,
 * `menuitemcheckbox` and `menuitemradio` rows, roving tabindex with the focused row at 0, Up and
 * Down between enabled rows with wrapping, Home and End, type ahead on the label, the underlined
 * access key runs its row, Right or Enter opens a submenu with focus on its first row, a submenu
 * also opens on hover after 120 ms, Left closes a submenu and returns focus to its parent row,
 * Esc closes one level and returns focus to the parent row or the trigger, Tab closes everything
 * and lets focus move on from the trigger, a press outside closes everything. Left and Right at
 * the top level call `onNavigate`, which the menu bar uses to switch menus; hovering a row while
 * another submenu is open switches to it. Disabled rows (a Later stub or a predicate that says
 * no) stay in the tree with `aria-disabled` and are skipped by the arrows; every row carries the
 * Tooltip primitive with its name, its key and, on a stub, the sentence of the stub formula.
 * The plate is placed by `place()` to stay inside the viewport: below its anchor for the bar,
 * to the right of its parent row for a submenu (to the left when the viewport ends), at the
 * pointer for a context menu. New in Turboslide (no Prototemplate source).
 *
 * The product round (docs/archive/rounds/PRODUCT.md 3.1.1): the access key underline draws on Windows and Linux
 * while Alt is held and never on macOS, where the platform has no Alt mnemonics and the
 * underlines read as links (audit-interface 18); a row whose submenu or grid is open schedules no
 * tooltip and the one that was up leaves when the submenu opens, so the plate of Insert > Table
 * never covers the neighbouring rows (section 2 rank 28); the plate is as wide as its longest
 * label (Menu.css).
 */

export type MenuAnchor =
  { kind: 'element'; element: HTMLElement } | { kind: 'point'; x: number; y: number };

export type MenuPlacement = 'below' | 'right' | 'point';

/**
 * Why a menu closed: `escape` and `tab` return focus to the trigger; `select` and `outside` leave
 * focus where the pointer put it; `roster` hands focus to the Collaborators list that Shift+Tab
 * opened (SPEC-3 0.42, 4.5), so nothing pulls it back to the trigger.
 */
export type MenuCloseReason = 'escape' | 'select' | 'outside' | 'tab' | 'roster';

export type MenuProps = {
  items: ReadonlyArray<MenuItem>;
  context: MenuContext;
  /** the accessible name of the menu */
  label: string;
  anchor: MenuAnchor;
  /** below the anchor (the bar), at the point (a context menu); a submenu is always to the right */
  placement?: 'below' | 'point';
  /**
   * For `below`: the plate's left edge on the anchor's left (`start`, the bar's titles), or its
   * right edge on the anchor's right (`end`: the Slideshow split button's options menu hangs
   * under the control's right edge, docs/archive/rounds/RETURN.md 4.1, instead of clamping at the viewport).
   */
  align?: MenuAlign;
  /** a row without a submenu was activated; the menu closes after this */
  onSelect: (item: MenuItem) => void;
  /** the whole menu closed; the reason names what closed it */
  onClose: (reason: MenuCloseReason) => void;
  /** Left and Right at the top level: the menu bar switches menus */
  onNavigate?: (direction: -1 | 1) => void;
  /** where focus returns on Esc and Tab: the title or the element that was right-clicked */
  returnFocusTo?: HTMLElement | null;
  /** focus the first row on open; false for a pointer opened bar menu that wants no tooltip */
  autoFocus?: boolean;
  /** draw context-only rows too (the right-click menus pass their own lists) */
  includeContextOnly?: boolean;
  /**
   * The content of a dynamic submenu (Apply layout draws the layout grid, Insert > Table the
   * hover grid); null when the caller has no plate for the row, which then draws its children as
   * rows or runs as a command. `viaKeyboard` says the plate should take focus.
   */
  renderDynamic?: (item: MenuItem, options?: { viaKeyboard?: boolean }) => ReactNode;
  id?: string;
  className?: string;
};

/** How long a pointer rests on a submenu row before it opens (SPEC 2.11). */
export const SUBMENU_HOVER_MS = 120;
/** How long after a list opens an enter with no pointer movement is the browser's own (the list appeared under the pointer), not a person's. */
const RESTING_POINTER_MS = 300;

/** The gap under a bar title. */
const BELOW_GAP = 2;

/** How a plate below its anchor lines up with it: its left edge on the anchor's left, or its right edge on the anchor's right. */
export type MenuAlign = 'start' | 'end';

/**
 * Where the plate goes so it stays inside the viewport, through the one `place()` of the chrome
 * (place.ts; docs/DESIGN.md 2.4): below the anchor and left aligned for the bar (right aligned
 * with `align: 'end'`, so a plate under a control at the row's right edge meets that edge rather
 * than the viewport clamp, docs/archive/rounds/RETURN.md 4.1), moving above when the viewport
 * ends first; to the right of the parent row for a submenu, overlapping it by 4 px and flipping to
 * its left when the right edge is out, and under its row on a phone when neither side has room
 * (docs/NEXT.md 4.1.3 item 18); at the pointer for a context menu, flipping left and up when it
 * would overflow. Every result keeps 8 px inside both edges and follows its anchor while open.
 * The anchor `place()` reads is the element itself, or a zero size box at the pointer.
 */
function useMenuAnchor(anchor: MenuAnchor): PlaceAnchor {
  const element = anchor.kind === 'element' ? anchor.element : null;
  const x = anchor.kind === 'point' ? anchor.x : 0;
  const y = anchor.kind === 'point' ? anchor.y : 0;
  return useMemo(() => element ?? pointAnchor(x, y), [element, x, y]);
}

/**
 * The plate of a dynamic submenu, or null: the row's resolved effect names a dynamic and the
 * caller draws it. A caller without a plate for the row (the shape grids before the shape table
 * lands, a context menu) returns null and the row falls back to its children or its command.
 */
function dynamicNode(
  item: MenuItem,
  context: MenuContext,
  renderDynamic: MenuProps['renderDynamic'],
  viaKeyboard: boolean,
): ReactNode {
  const effect = resolveEffect(item, context);
  if (effect?.kind !== 'submenu' || effect.dynamic === undefined || renderDynamic === undefined)
    return null;
  return renderDynamic(item, { viaKeyboard }) ?? null;
}

/**
 * True for a row that opens a submenu: a dynamic plate the caller draws, or children to list. A
 * row whose resolved effect is not a submenu is a command even when it carries children (Change
 * background opens the Background dialog on a content slide and the Replace image submenu on a
 * picture layout, SPEC-2 4.1).
 */
function hasSubmenu(
  item: MenuItem,
  context: MenuContext,
  renderDynamic: MenuProps['renderDynamic'],
): boolean {
  const effect = resolveEffect(item, context);
  if (effect !== undefined && effect.kind !== 'submenu') return false;
  if (dynamicNode(item, context, renderDynamic, false) !== null) return true;
  return item.items !== undefined && visibleItems(item.items, { context }).length > 0;
}

/**
 * The label with its access key letter marked once, on the platforms that have Alt mnemonics;
 * Menu.css underlines the mark only while Alt is held. On macOS the label is plain text.
 */
function AccessLabel({
  label,
  accessKey,
  platform,
}: {
  label: string;
  accessKey: string | undefined;
  platform: MenuContext['platform'];
}) {
  if (accessKey === undefined || platform === 'mac') return <>{label}</>;
  const at = label.toLowerCase().indexOf(accessKey.toLowerCase());
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <u className="ts-menu-ak">{label.slice(at, at + 1)}</u>
      {label.slice(at + 1)}
    </>
  );
}

type ListProps = {
  items: ReadonlyArray<MenuItem>;
  context: MenuContext;
  label: string;
  anchor: MenuAnchor;
  placement: MenuPlacement;
  align?: MenuAlign;
  level: number;
  autoFocus: boolean;
  includeContextOnly: boolean;
  renderDynamic: MenuProps['renderDynamic'];
  onSelect: (item: MenuItem) => void;
  /** this level closes: Esc or Left in a submenu, or the root's reasons */
  onCloseLevel: (reason: MenuCloseReason) => void;
  onNavigate: MenuProps['onNavigate'];
  id: string;
  className?: string;
};

function MenuList({
  items,
  context,
  label,
  anchor,
  placement,
  align,
  level,
  autoFocus,
  includeContextOnly,
  renderDynamic,
  onSelect,
  onCloseLevel,
  onNavigate,
  id,
  className,
}: ListProps) {
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  /* the plate in the popover layer (docs/DESIGN.md 2.3): a submenu opens after its parent, so it
     sits over it with no `+ level`; placed and followed by place() (2.4) */
  const reference = useMenuAnchor(anchor);
  const gap = placement === 'below' ? BELOW_GAP : 0;
  usePlate(root, {
    layer: 'popover',
    anchor: reference,
    side: placement,
    ...(align === undefined ? {} : { align }),
    gap,
    fit: true,
  });
  /* the list stands at its anchor until the first placement, never hidden: a keyboard opened list
     focuses its first row and a pointer opened one focuses itself as it mounts, and a hidden
     element refuses the focus (VERIFICATION-3 finding 13) */
  const start = useStart(reference, placement, gap);
  const [focusId, setFocusId] = useState<string | null>(null);
  /* bumped to focus the row again when focusId does not change (a submenu closing back to its parent) */
  const [focusTick, setFocusTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  /* Alt held: the mnemonic underline shows on the platforms that have one (3.1.1) */
  const [altHeld, setAltHeld] = useState(false);
  /* a submenu opened from the keyboard focuses its first row; from the pointer it does not */
  const openViaKeyboard = useRef(false);
  const hoverTimer = useRef(0);
  const typed = useRef({ buffer: '', at: 0 });
  /* a list that opens under a resting pointer (a right click menu at the pointer) gets the
     browser's own enter for the row under it, with no movement of the pointer; that enter lights
     no row (docs/archive/rounds/POLISH.md 2.6 item 74; audit-chrome item 48). The roving focus follows the
     pointer once it has moved, or after the first moments of the list, when an enter is a real entry */
  const mountedAt = useRef(Date.now());
  const pointerMoved = useRef(false);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.movementX !== 0 || event.movementY !== 0) pointerMoved.current = true;
    };
    document.addEventListener('pointermove', onMove, true);
    return () => document.removeEventListener('pointermove', onMove, true);
  }, []);
  const pointerRests = (): boolean =>
    !pointerMoved.current && Date.now() - mountedAt.current < RESTING_POINTER_MS;

  /* a row a role cannot use is absent, never disabled (SPEC-3 13.4) */
  const visible = useMemo(
    () => visibleItems(items, { contextOnly: includeContextOnly, context, collapseSingles: true }),
    [items, includeContextOnly, context],
  );
  const enabled = useMemo(
    () => visible.filter((item) => isEnabled(item, context)),
    [visible, context],
  );

  /* the first enabled row takes focus on open when asked; a pointer opened submenu leaves focus
     on its parent row */
  useMountEffect(() => {
    /* a menu opening closes the plate of the control that opened it, and the row or control
       that lands under the resting pointer draws none until the pointer moves (item 61) */
    hideTooltipUntilInput();
    if (autoFocus) {
      const first = enabled[0];
      if (first !== undefined) setFocusId(first.id);
    }
  });

  /* a pointer opened root list takes focus itself so keys land here (Shift+Tab to the roster,
     Esc, the arrows); it stands at its anchor from its first render, so the browser takes the
     focus (VERIFICATION-3 finding 13: a list hidden until placed left focus on the menu title);
     a keyboard opened list has a row to focus instead */
  const tookFocus = useRef(false);
  useEffect(() => {
    if (level !== 0 || tookFocus.current) return;
    tookFocus.current = true;
    if (focusId === null) root.current?.focus();
  }, [level, focusId]);

  useEffect(() => {
    if (focusId === null) return;
    rows.current.get(focusId)?.focus();
  }, [focusId, focusTick]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  /* the root list watches Alt for the mnemonic underline; a nested list reads its parent's plate */
  useEffect(() => {
    if (level !== 0 || context.platform === 'mac') return undefined;
    const onKey = (event: KeyboardEvent) => setAltHeld(event.altKey);
    const onBlur = () => setAltHeld(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [level, context.platform]);

  const focusStep = useCallback(
    (step: number) => {
      if (enabled.length === 0) return;
      const index = enabled.findIndex((item) => item.id === focusId);
      const next =
        index < 0
          ? step > 0
            ? 0
            : enabled.length - 1
          : (index + step + enabled.length) % enabled.length;
      setFocusId(enabled[next]?.id ?? null);
    },
    [enabled, focusId],
  );

  const openSubmenu = useCallback((item: MenuItem, viaKeyboard: boolean) => {
    window.clearTimeout(hoverTimer.current);
    openViaKeyboard.current = viaKeyboard;
    /* the row's own plate leaves: its submenu or grid takes the space beside it (rank 28) */
    hideTooltip();
    setOpenId(item.id);
    setFocusId(item.id);
  }, []);

  const closeSubmenu = useCallback(
    (refocus: boolean) => {
      window.clearTimeout(hoverTimer.current);
      if (openId !== null && refocus) {
        setFocusId(openId);
        setFocusTick((tick) => tick + 1);
      }
      setOpenId(null);
    },
    [openId],
  );

  const activate = useCallback(
    (item: MenuItem, viaKeyboard: boolean) => {
      if (!isEnabled(item, context)) return;
      if (hasSubmenu(item, context, renderDynamic)) {
        if (openId === item.id && !viaKeyboard) closeSubmenu(true);
        else openSubmenu(item, viaKeyboard);
        return;
      }
      noteMenuRowActivated(item.id);
      onSelect(item);
    },
    [context, renderDynamic, openId, closeSubmenu, openSubmenu, onSelect],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    /* a nested list handles its own keys; the event must not reach this list too */
    event.stopPropagation();
    const focused = visible.find((item) => item.id === focusId);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusStep(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusStep(-1);
        return;
      case 'Home':
        event.preventDefault();
        setFocusId(enabled[0]?.id ?? null);
        return;
      case 'End':
        event.preventDefault();
        setFocusId(enabled.at(-1)?.id ?? null);
        return;
      case 'ArrowRight':
        event.preventDefault();
        if (
          focused !== undefined &&
          hasSubmenu(focused, context, renderDynamic) &&
          isEnabled(focused, context)
        ) {
          openSubmenu(focused, true);
          return;
        }
        onNavigate?.(1);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        if (level > 0) {
          onCloseLevel('escape');
          return;
        }
        onNavigate?.(-1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focused !== undefined) activate(focused, true);
        return;
      case 'Escape':
        event.preventDefault();
        onCloseLevel('escape');
        return;
      case 'Tab':
        /* Shift+Tab from any open menu is the Collaborators list (SPEC-3 0.42, 4.5; 01 G5): the
           whole menu closes without returning focus to its trigger and the roster opens when the
           title row holds the presence slot; the plate takes focus once it is placed
           (VERIFICATION-3 finding 13) */
        if (event.shiftKey && openRoster()) {
          event.preventDefault();
          onCloseLevel('roster');
          return;
        }
        onCloseLevel('tab');
        return;
      default:
        break;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const char = event.key.toLowerCase();
      const byKey = enabled.find((item) => item.accessKey === char);
      if (byKey !== undefined) {
        event.preventDefault();
        activate(byKey, true);
        return;
      }
      /* type ahead: the buffer holds while keys arrive within a second */
      const now = Date.now();
      typed.current = {
        buffer: now - typed.current.at < 1000 ? typed.current.buffer + char : char,
        at: now,
      };
      const start = enabled.findIndex((item) => item.id === focusId);
      const order = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)];
      const match = order.find((item) =>
        resolveLabel(item, context).toLowerCase().startsWith(typed.current.buffer),
      );
      if (match !== undefined) {
        event.preventDefault();
        setFocusId(match.id);
      }
    }
  };

  /* the pointer settled on a row: the roving focus and, after the hover delay, its submenu (or
     the open one's close) */
  const armRow = (item: MenuItem) => {
    window.clearTimeout(hoverTimer.current);
    if (isEnabled(item, context)) setFocusId(item.id);
    if (hasSubmenu(item, context, renderDynamic) && isEnabled(item, context)) {
      if (openId !== item.id) {
        hoverTimer.current = window.setTimeout(() => openSubmenu(item, false), SUBMENU_HOVER_MS);
      }
    } else if (openId !== null) {
      hoverTimer.current = window.setTimeout(() => closeSubmenu(false), SUBMENU_HOVER_MS);
    }
  };
  const onRowPointerEnter = (item: MenuItem) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    /* the entry a resting pointer made is left alone (item 74); the row arms on its first real
       movement instead (onMouseMove below), so a person who right clicks and moves straight
       into Apply layout still gets the submenu (the integrator's gate on the merged tree:
       slides.layout.context-apply waited for it) */
    if (pointerRests()) return;
    armRow(item);
  };

  const openItem = openId === null ? undefined : visible.find((item) => item.id === openId);
  const openRow = openId === null ? null : (rows.current.get(openId) ?? null);

  return (
    <div
      ref={root}
      id={id}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={cn('ts-menu', level > 0 && 'is-sub', altHeld && 'is-alt', className)}
      data-level={level}
      style={start}
      onKeyDown={onKeyDown}
    >
      {visible.map((item, index) => {
        const rowEnabled = isEnabled(item, context);
        const checked = isChecked(item, context);
        const submenu = hasSubmenu(item, context, renderDynamic);
        const text = resolveLabel(item, context);
        const key =
          item.key === undefined
            ? ''
            : shortcutLabel(
                item.key,
                context.platform,
                context.platform === 'mac' ? 'symbols' : 'words',
              );
        const role =
          checked === undefined
            ? 'menuitem'
            : (item.effect?.kind === 'toggle' && item.effect.value !== undefined) ||
                (item.checked !== undefined &&
                  'value' in item.checked &&
                  item.checked.value !== undefined)
              ? 'menuitemradio'
              : 'menuitemcheckbox';
        const doc = tooltipDoc(item, context);
        /* a row draws a plate only when it is enabled, leads nowhere else and has a sentence to
           say (docs/archive/rounds/POLISH.md 2.6 item 61; audit-chrome item 21: a disabled row's plate covered
           the rows under it, a submenu row's the submenu, a row without a doc repeated its name);
           `data-tip` stays on every row for the tooltip audit */
        const quiet = !rowEnabled || submenu || doc === undefined;
        const tip = tipProps({
          name: text,
          key: tooltipKey(item.key, context.platform),
          doc: doc === undefined ? undefined : sentence(doc),
        });
        const isOpen = openId === item.id;
        const rowIndex = index;
        return (
          <div key={item.id} className="ts-menu-group">
            {item.dividerBefore === true && rowIndex > 0 ? (
              <div className="ts-menu-divider" role="separator" />
            ) : null}
            <div
              ref={(el) => {
                if (el) rows.current.set(item.id, el);
                else rows.current.delete(item.id);
              }}
              role={role}
              tabIndex={focusId === item.id ? 0 : -1}
              aria-disabled={rowEnabled ? undefined : true}
              aria-checked={checked}
              aria-haspopup={submenu ? 'menu' : undefined}
              aria-expanded={submenu ? isOpen : undefined}
              aria-keyshortcuts={ariaKeyShortcuts(item.key, context.platform)}
              className={cn(
                'ts-menu-item',
                !rowEnabled && 'is-disabled',
                isOpen && 'is-open',
                checked === true && 'is-checked',
              )}
              data-menu-item={item.id}
              data-control={`menu.${item.id}`}
              data-status={item.status}
              onPointerEnter={onRowPointerEnter(item)}
              onClick={(event) => {
                event.stopPropagation();
                activate(item, false);
              }}
              {...(quiet ? { 'data-tip': tip['data-tip'] } : tip)}
              onMouseEnter={(event) => {
                /* a row whose submenu or grid is open shows no plate over it (rank 28) */
                if (isOpen || quiet) return;
                tip.onMouseEnter(event);
              }}
              onMouseMove={(event) => {
                /* the pointer's own movement over a row takes the roving focus (the entry the
                   resting rule above left alone lights on the first real move) */
                if (
                  (event.movementX !== 0 || event.movementY !== 0) &&
                  focusId !== item.id &&
                  isEnabled(item, context)
                ) {
                  pointerMoved.current = true;
                  armRow(item);
                }
                if (isOpen || quiet) return;
                tip.onMouseMove(event);
              }}
            >
              <span className="ts-menu-ic" aria-hidden="true">
                {checked === true ? (
                  /* the check as the sprite's check glyph (docs/archive/rounds/POLISH.md 2.6 item 57: a glyph on
                     every row, a checked row included) */
                  <span className="ts-menu-check">
                    <Icon name="check" />
                  </span>
                ) : item.icon ? (
                  <Icon name={item.icon} />
                ) : null}
              </span>
              <span className="ts-menu-label">
                <AccessLabel label={text} accessKey={item.accessKey} platform={context.platform} />
              </span>
              {submenu ? (
                <span className="ts-menu-sub" aria-hidden="true">
                  <Icon name="next" />
                </span>
              ) : key !== '' ? (
                <span className="ts-menu-key" aria-hidden="true">
                  {key}
                </span>
              ) : null}
            </div>
            {isOpen && openItem?.id === item.id && openRow !== null
              ? ((() => {
                  /* a dynamic plate the caller draws comes first; the row's children otherwise */
                  const plate = dynamicNode(
                    openItem,
                    context,
                    renderDynamic,
                    openViaKeyboard.current,
                  );
                  if (plate !== null)
                    return (
                      <DynamicPlate
                        label={text}
                        anchor={openRow}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' || event.key === 'ArrowLeft') {
                            event.preventDefault();
                            event.stopPropagation();
                            closeSubmenu(true);
                          }
                        }}
                      >
                        {plate}
                      </DynamicPlate>
                    );
                  return null;
                })() ??
                (openItem.items !== undefined && visibleItems(openItem.items).length > 0 ? (
                  <MenuList
                    items={openItem.items}
                    context={context}
                    label={text}
                    anchor={{ kind: 'element', element: openRow }}
                    placement="right"
                    level={level + 1}
                    autoFocus={openViaKeyboard.current}
                    includeContextOnly={includeContextOnly}
                    renderDynamic={renderDynamic}
                    onSelect={onSelect}
                    onCloseLevel={(reason) => {
                      if (reason === 'escape') closeSubmenu(true);
                      else onCloseLevel(reason);
                    }}
                    onNavigate={onNavigate}
                    id={`${id}-${item.id}`}
                  />
                ) : null))
              : null}
          </div>
        );
      })}
    </div>
  );
}

let menuCount = 0;

export function Menu({
  items,
  context,
  label,
  anchor,
  placement = 'below',
  align,
  onSelect,
  onClose,
  onNavigate,
  returnFocusTo,
  autoFocus = true,
  includeContextOnly = false,
  renderDynamic,
  id,
  className,
}: MenuProps) {
  const rootId = useMemo(() => id ?? `ts-menu-${++menuCount}`, [id]);
  const container = useRef<HTMLDivElement>(null);

  const close = useCallback(
    (reason: MenuCloseReason) => {
      if (reason === 'escape' || reason === 'tab') returnFocusTo?.focus();
      onClose(reason);
    },
    [onClose, returnFocusTo],
  );

  /* a press outside closes everything; Esc anywhere in the document closes when focus is elsewhere */
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (container.current?.contains(event.target)) return;
      if (returnFocusTo?.contains(event.target)) return;
      close('outside');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof Node && container.current?.contains(event.target)) return;
      event.preventDefault();
      close('escape');
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [close, returnFocusTo]);

  /* Every menu renders through a portal into `document.body`, and every list of it enters the
     browser's top layer in the popover layer (usePlate above; docs/DESIGN.md 2.3). Before the
     design round the lists were fixed boxes at z-index 30 inside whichever stacking context held
     them, and the stage (`.pt-stagewrap`, a context through its `view-transition-name`) painted
     the notes slot over a right click menu's lower rows (docs/FOCUS.md 6.4; VERIFICATION C2-F11:
     `lines.context.line`, Line end under "Click to add speaker notes"); the portal fixed that, and
     the top layer now orders every open surface by the scale: over the dialogs and the panes,
     under the toasts, the tooltip and the hover preview. Placement reads the anchor's viewport
     box, the outside press reads `container`, and the editor recognises a menu by its role and
     classes (`[role="menu"]`, `.ts-context-menu`, `.ts-menu-root`), so nothing depends on the
     menu sitting inside its trigger's subtree. */
  const node = (
    <div ref={container} className="ts-menu-root" data-control={`menu.${rootId}`}>
      <MenuList
        items={items}
        context={context}
        label={label}
        anchor={anchor}
        placement={placement}
        {...(align === undefined ? {} : { align })}
        level={0}
        autoFocus={autoFocus}
        includeContextOnly={includeContextOnly}
        renderDynamic={renderDynamic}
        onSelect={(item) => {
          onSelect(item);
          close('select');
        }}
        onCloseLevel={close}
        onNavigate={onNavigate}
        id={rootId}
        className={className}
      />
    </div>
  );
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

export { DIVIDER };

/**
 * The plate of a dynamic submenu (the Apply layout list or grid): to the right of its row in the
 * popover layer, kept inside the viewport by place() once its content is measured (measured
 * before the round: the 21 layout rows from a card low in the filmstrip ran past the bottom of a
 * 900 px window and the last rows could not be clicked; integrator, merge 2). It stands at its
 * row's right edge until the first placement and is never hidden, because the grid inside it may
 * take the focus on mount and a hidden plate refuses it.
 */
function DynamicPlate({
  label,
  anchor,
  onKeyDown,
  children,
}: {
  label: string;
  anchor: HTMLElement;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const plate = useRef<HTMLDivElement>(null);
  const start = useStart(anchor, 'right');
  usePlate(plate, { layer: 'popover', anchor, side: 'right', fit: true });
  return (
    <div
      ref={plate}
      role="menu"
      aria-label={label}
      className="ts-menu is-sub is-dynamic"
      style={start}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

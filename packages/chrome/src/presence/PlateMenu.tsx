import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { cn } from '../lib/cn';
import type { MenuCloseReason } from '../Menu';
import { usePlate, useStart } from '../usePlate';

/**
 * A small anchored menu whose rows the caller draws (gslides-parity SPEC-3 4.5, 7.5; research 11
 * 6.2, 8 P12): the roster and the own chip's menu hold a chip, a name, a trust word and a role
 * word per row, which the menu model's `Menu` does not draw, so they share this plate instead.
 * It follows the WAI-ARIA menu pattern the way `Menu` does: `role="menu"`, the rows the caller
 * marks `role="menuitem"`, roving focus with the arrows, Home and End, Enter or Space running a
 * row's click, Esc closing and returning focus to the anchor, Tab closing, a press outside
 * closing. The plate sits in the popover layer of the stacking scale and is placed under its
 * anchor by `place()`, kept inside the viewport and on its anchor while it is open (docs/DESIGN.md
 * 2.3, 2.4); it is a fixed box, so it moves nothing (05 rule 4). A fixed width and a ten row
 * `.pt-scroll` region keep its box the same for one or twenty rows.
 */
export type PlateMenuProps = {
  anchor: HTMLElement;
  label: string;
  onClose: (reason: MenuCloseReason) => void;
  /** where focus returns on Esc and Tab; the anchor when absent */
  returnFocusTo?: HTMLElement | null;
  width?: number;
  id?: string;
  className?: string;
  control?: string;
  /** a line above the rows, outside the roving order */
  header?: ReactNode;
  /** a line under the rows */
  footer?: ReactNode;
  children: ReactNode;
};

const ROWS = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

export function PlateMenu({
  anchor,
  label,
  onClose,
  returnFocusTo,
  width = 240,
  id,
  className,
  control,
  header,
  footer,
  children,
}: PlateMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  /* it stands under its anchor from its first render, so its first row takes the focus as it
     mounts (a plate hidden until placed refused it and left focus on the opener or the menu title
     Shift+Tab came from, VERIFICATION-3 finding 13) */
  const start = useStart(anchor);
  usePlate(root, { layer: 'popover', anchor, side: 'below', gap: 2 });

  const rows = (): HTMLElement[] =>
    root.current
      ? Array.from(root.current.querySelectorAll<HTMLElement>(ROWS)).filter(
          (row) => row.getAttribute('aria-disabled') !== 'true' || row.dataset.focusable === '',
        )
      : [];

  /* the first row takes the focus once, as the plate mounts */
  const focusedOnOpen = useRef(false);
  useEffect(() => {
    if (focusedOnOpen.current) return;
    focusedOnOpen.current = true;
    const el = root.current;
    if (!el) return;
    const first = Array.from(el.querySelectorAll<HTMLElement>(ROWS)).find(
      (row) => row.getAttribute('aria-disabled') !== 'true' || row.dataset.focusable === '',
    );
    (first ?? el).focus();
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose('outside');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const back = () => (returnFocusTo ?? anchor).focus();

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = rows();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (index: number) => {
      const row = list[(index + list.length) % list.length];
      row?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(at + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(at - 1);
        return;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        return;
      case 'End':
        event.preventDefault();
        focusAt(list.length - 1);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose('escape');
        back();
        return;
      case 'Tab':
        onClose('tab');
        back();
        return;
      case ' ':
      case 'Enter': {
        const row = document.activeElement;
        if (row instanceof HTMLElement && list.includes(row) && row.tagName !== 'BUTTON') {
          event.preventDefault();
          row.click();
        }
        return;
      }
      default:
        return;
    }
  };

  return (
    <div
      ref={root}
      id={id}
      className={cn('ts-plate-menu ts-chrome', className)}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-control={control}
      style={{ ...start, width }}
      onKeyDown={onKeyDown}
    >
      {header}
      <div className="ts-plate-menu-rows pt-scroll">{children}</div>
      {footer}
    </div>
  );
}

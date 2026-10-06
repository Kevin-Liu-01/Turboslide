// The one doorway of a floating plate to its layer and its place (docs/DESIGN.md 2.3 and 2.4):
// `useLayer` puts the plate in the browser's top layer at its layer of the scale, and `place()`
// hangs it from its anchor and keeps it there while it is open (a panel that scrolls, a window
// that resizes, a plate whose rows change). Every anchored plate of the editor calls this hook:
// the menus and their submenus, the context menus, the plate menus (account, roster, comment
// card), the pickers, the layout plate, the swatch plate, the insert menu, the chart grid menu
// and the sidebar row menu. A plate with a fixed place of its own (a dialog, a toast, the name
// prompt bar) calls `useLayer` alone.
//
// The plate keeps `visibility: hidden` until the hook returns its first placement; placement
// resolves in microtasks, before the browser paints, so no frame shows the plate at its old
// place. `place()` writes `position`, `left`, `top`, `data-place` and, with `fit`, `max-height`
// on the element itself, so a plate's React style must not set those four.
import { useLayoutEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';

import { useLayer } from './Layer';
import type { LayerName } from './Layer';
import { SUBMENU_OVERLAP, place, pointAnchor } from './place';
import type { PlaceAlign, PlaceAnchor, PlaceSide, Placed } from './place';

export type UsePlateOptions = {
  /** the layer of the scale the plate belongs to; `popover` for every anchored plate */
  layer: LayerName;
  /** the element the plate hangs from; null leaves the plate where its own sheet puts it */
  anchor: PlaceAnchor | null;
  /** false while the plate is closed; true when absent (the plate mounts open) */
  open?: boolean;
  /** under the anchor, beside a parent row, or at a pointer */
  side?: PlaceSide;
  /** for `below`: the anchor's left edge, its centre or its right edge */
  align?: PlaceAlign;
  /** the gap between the anchor and the plate in px */
  gap?: number;
  /**
   * writes the plate's max-height from the room on its side. place() shifts a plate on both axes
   * to keep it in the window, and floating-ui's size then reads the whole window's height, so a
   * fitted plate taller than the room under its anchor moves over the anchor: the menus take it
   * (as placeMenu did), and a plate that must stay under its anchor bounds its own height in its
   * sheet instead (the pickers through `--ts-plate-top`, the font plate at 420 px)
   */
  fit?: boolean;
  /** keeps the plate on its anchor while it is open; true when absent */
  follow?: boolean;
};

function samePlace(a: Placed | null, b: Placed): boolean {
  return (
    a !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.side === b.side &&
    a.maxHeight === b.maxHeight
  );
}

/**
 * Puts the plate in its layer and on its anchor while it is open. Returns the last placement, or
 * null until the first one, so a plate can stay hidden (and keep the focus away) until it is
 * placed.
 */
export function usePlate(
  ref: RefObject<HTMLElement | null>,
  options: UsePlateOptions,
): Placed | null {
  const { layer, anchor, open = true, side, align, gap, fit, follow } = options;
  useLayer(ref, { layer, open });
  const [placed, setPlaced] = useState<Placed | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || element === null || anchor === null) return undefined;
    return place(anchor, element, {
      ...(side === undefined ? {} : { side }),
      ...(align === undefined ? {} : { align }),
      ...(gap === undefined ? {} : { gap }),
      ...(fit === undefined ? {} : { fit }),
      ...(follow === undefined ? {} : { follow }),
      onPlace: (next) => setPlaced((last) => (samePlace(last, next) ? last : next)),
    });
  }, [ref, anchor, open, side, align, gap, fit, follow]);
  return open ? placed : null;
}

/**
 * A stable anchor for a pointer or an element: a context menu's pointer becomes one zero size
 * anchor per point, so the plate is not placed again on every render of its parent.
 */
export function usePointOrElement(
  element: Element | null,
  point: { x: number; y: number } | null,
): PlaceAnchor | null {
  const x = point?.x;
  const y = point?.y;
  return useMemo(() => {
    if (element !== null) return element;
    if (x === undefined || y === undefined) return null;
    return pointAnchor(x, y);
  }, [element, x, y]);
}

/**
 * Where a plate that takes the focus on mount stands before its first placement: under the
 * anchor's left edge, beside a parent row's right edge (overlapping it by 4 px), or at a pointer.
 * A plate whose row, field or first swatch is focused as it mounts (a menu, a picker, the apply
 * layout grid) cannot wait hidden for `usePlate`, because a hidden element refuses the focus; it
 * stands here for the microtasks before `place()` writes its place, which is before the browser
 * paints. Read once, so a later render never writes it over the placement.
 */
export function useStart(
  anchor: PlaceAnchor,
  side: PlaceSide = 'below',
  gap = 2,
): { left: number; top: number } {
  const [start] = useState(() => {
    const rect = anchor.getBoundingClientRect();
    if (side === 'right')
      return {
        left: Math.round(rect.right - SUBMENU_OVERLAP),
        top: Math.round(rect.top - SUBMENU_OVERLAP),
      };
    if (side === 'point') return { left: Math.round(rect.left), top: Math.round(rect.top) };
    return { left: Math.round(rect.left), top: Math.round(rect.bottom + gap) };
  });
  return start;
}

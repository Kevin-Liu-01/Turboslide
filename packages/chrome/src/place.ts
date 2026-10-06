// One placement for every floating plate of the editor and the pages (docs/DESIGN.md 2.4,
// decision C3), on `@floating-ui/dom` 1.8.0: `computePosition` with `strategy: 'fixed'`, `offset`,
// `flip`, `shift` 8 px from the viewport edge (the margin the three old functions used), `size`
// for a menu's maximum height, and `autoUpdate` while the plate is open, so a plate follows an
// anchor that scrolls with its panel and stays inside a window that resizes. It replaces
// `placeMenu` (Menu.tsx), the tooltip's `place` (Tooltip.tsx) and `anchoredAt`
// (pickers/ColorPlate.tsx), which computed once at open (research-type 4.1); their rules are its
// options: below the anchor and flipped above when the window ends first (a menu, a picker, the
// tooltip centred), to the right of a parent row and flipped to its left (a submenu, with the phone
// rule of `placeMenu`: under its row, indented, when neither side has room under 720 px), and at
// the pointer flipped left and up (a context menu). /home keeps its own placement script: its live
// core has no room for this module (DESIGN.md 2.4). CSS anchor positioning replaces it once the
// browser floor drops Safari 18 and older (DESIGN.md question 12).
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import type { Middleware, Placement, VirtualElement } from '@floating-ui/dom';

/** The distance a plate keeps from every viewport edge (Menu.tsx, Tooltip.tsx, ColorPlate.tsx). */
export const VIEWPORT_MARGIN = 8;
/** Under this width a submenu with no room on either side drops under its row (Menu.tsx 163 to 172). */
export const PHONE_WIDTH = 720;
/** A submenu overlaps its parent plate by this much on both axes (Menu.tsx SUBMENU_OVERLAP). */
export const SUBMENU_OVERLAP = 4;
/** A submenu under its row on a phone is indented by this much (Menu.tsx SUBMENU_INDENT). */
export const SUBMENU_INDENT = 16;
/** The shortest maximum height `fit` writes, so a plate in a short window still shows rows. */
export const MIN_FIT_HEIGHT = 56;

/** Where a plate goes: under the anchor, beside a parent row, or at a pointer. */
export type PlaceSide = 'below' | 'right' | 'point';
/** How a plate under its anchor lines up with it. */
export type PlaceAlign = 'start' | 'center' | 'end';
/** Where the plate ended up, written to the plate as `data-place`. */
export type PlacedSide = 'below' | 'above' | 'right' | 'left' | 'under-row';

export type PlaceOptions = {
  /** below the anchor (menus, pickers, the tooltip), beside a parent row (a submenu), at a pointer */
  side?: PlaceSide;
  /** for `below`: the anchor's left edge, its centre (the tooltip) or its right edge */
  align?: PlaceAlign;
  /** the gap between the anchor and the plate in px: 2 for a menu, 6 for the tooltip */
  gap?: number;
  /** the distance kept from the viewport's edges, 8 px when absent */
  margin?: number;
  /** writes the plate's max-height from the room on its side, never under 56 px */
  fit?: boolean;
  /** keeps the plate on its anchor while it scrolls or the window resizes; true when absent */
  follow?: boolean;
  /** called after each placement with where the plate went */
  onPlace?: (placed: Placed) => void;
};

/** A placement: the plate's fixed position, the side it took and the max-height `fit` wrote. */
export type Placed = {
  left: number;
  top: number;
  placement: Placement;
  side: PlacedSide;
  maxHeight: number | null;
};

/** The anchor of a plate: an element, or a point such as a context menu's pointer. */
export type PlaceAnchor = Element | VirtualElement;

/** A zero size anchor at a viewport point: the pointer of a right click. */
export function pointAnchor(x: number, y: number, contextElement?: Element): VirtualElement {
  return {
    getBoundingClientRect: () => ({
      x,
      y,
      left: x,
      top: y,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
    }),
    ...(contextElement === undefined ? {} : { contextElement }),
  };
}

/** The floating-ui placement a side and an alignment ask for first. */
export function placementOf(side: PlaceSide, align: PlaceAlign = 'start'): Placement {
  if (side === 'right') return 'right-start';
  if (side === 'point') return 'bottom-start';
  if (align === 'center') return 'bottom';
  return align === 'end' ? 'bottom-end' : 'bottom-start';
}

/** The placements tried in order when the first one overflows the window. */
export function fallbacksOf(side: PlaceSide, align: PlaceAlign = 'start'): Placement[] {
  if (side === 'right') return ['left-start'];
  if (side === 'point') return ['bottom-end', 'top-start', 'top-end'];
  if (align === 'center') return ['top'];
  return [align === 'end' ? 'top-end' : 'top-start'];
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The phone rule of `placeMenu` (Menu.tsx 163 to 172; docs/NEXT.md 4.1.3 item 18): on a window
 * under 720 px, a submenu with no room on the right of its row and none on the left drops under
 * its row, indented by 16 px, so the row that opened it stays in view. Null when the rule does
 * not apply.
 */
export function phoneSubmenu(
  reference: Box,
  floating: { width: number },
  viewportWidth: number,
  margin = VIEWPORT_MARGIN,
): { x: number; y: number } | null {
  if (viewportWidth >= PHONE_WIDTH) return null;
  const rightFits =
    reference.x + reference.width - SUBMENU_OVERLAP + floating.width <= viewportWidth - margin;
  const leftFits = reference.x - floating.width + SUBMENU_OVERLAP >= margin;
  if (rightFits || leftFits) return null;
  return { x: reference.x + SUBMENU_INDENT, y: reference.y + reference.height };
}

function phoneSubmenuMiddleware(margin: number): Middleware {
  return {
    name: 'phoneSubmenu',
    fn(state) {
      const width = typeof window === 'undefined' ? Infinity : window.innerWidth;
      const under = phoneSubmenu(state.rects.reference, state.rects.floating, width, margin);
      if (under === null) return {};
      return { x: under.x, y: under.y, data: { under: true } };
    },
  };
}

function sideOf(placement: Placement, under: boolean): PlacedSide {
  if (under) return 'under-row';
  if (placement.startsWith('top')) return 'above';
  if (placement.startsWith('right')) return 'right';
  if (placement.startsWith('left')) return 'left';
  return 'below';
}

function middlewareOf(options: PlaceOptions): Middleware[] {
  const side = options.side ?? 'below';
  const align = options.align ?? 'start';
  const margin = options.margin ?? VIEWPORT_MARGIN;
  const gap = options.gap ?? (side === 'below' ? 2 : 0);
  const list: Middleware[] = [
    side === 'right'
      ? offset({ mainAxis: -SUBMENU_OVERLAP, crossAxis: -SUBMENU_OVERLAP })
      : offset({ mainAxis: gap }),
    flip({ padding: margin, fallbackPlacements: fallbacksOf(side, align) }),
  ];
  if (side === 'right') list.push(phoneSubmenuMiddleware(margin));
  list.push(shift({ padding: margin, crossAxis: true }));
  if (options.fit === true)
    list.push(
      size({
        padding: margin,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(MIN_FIT_HEIGHT, Math.floor(availableHeight))}px`;
        },
      }),
    );
  return list;
}

/**
 * Places a plate once: computes its position, writes `position: fixed`, `left`, `top` and
 * `data-place` on it, and resolves with the placement.
 */
export async function placeOnce(
  anchor: PlaceAnchor,
  plate: HTMLElement,
  options: PlaceOptions = {},
): Promise<Placed> {
  const side = options.side ?? 'below';
  const result = await computePosition(anchor, plate, {
    strategy: 'fixed',
    placement: placementOf(side, options.align ?? 'start'),
    middleware: middlewareOf(options),
  });
  const placed: Placed = {
    left: Math.round(result.x),
    top: Math.round(result.y),
    placement: result.placement,
    side: sideOf(result.placement, result.middlewareData.phoneSubmenu?.under === true),
    maxHeight: options.fit === true ? parseFloat(plate.style.maxHeight) || null : null,
  };
  return placed;
}

function write(plate: HTMLElement, placed: Placed): void {
  plate.style.position = 'fixed';
  plate.style.left = `${placed.left}px`;
  plate.style.top = `${placed.top}px`;
  plate.dataset.place = placed.side;
}

/**
 * Places a plate on its anchor and keeps it there while it is open (`autoUpdate` on scroll,
 * resize, the anchor's and the plate's size, and layout shifts). Returns the function that stops
 * following; call it when the plate closes. A placement that resolves after the stop is dropped.
 */
export function place(
  anchor: PlaceAnchor,
  plate: HTMLElement,
  options: PlaceOptions = {},
): () => void {
  let stopped = false;
  let run = 0;
  const update = (): void => {
    run += 1;
    const mine = run;
    void placeOnce(anchor, plate, options).then((placed) => {
      if (stopped || mine !== run) return;
      write(plate, placed);
      options.onPlace?.(placed);
    });
  };
  if (options.follow === false) {
    update();
    return () => {
      stopped = true;
    };
  }
  const cleanup = autoUpdate(anchor, plate, update);
  return () => {
    stopped = true;
    cleanup();
  };
}

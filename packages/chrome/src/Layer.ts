// The Layer primitive of the design round (docs/DESIGN.md 2.3, decisions C1 and C2): every
// floating surface (a tooltip, a menu, a context menu, a plate menu, a picker, a dialog with its
// scrim, a toast, a snackbar, the name prompt bar, the hover preview) enters the browser's top
// layer through `popover="manual"` and takes its z-index from one scale, `LAYERS` of
// packages/theme/src/scale.ts. The top layer ignores stacking contexts and ancestor clipping, so a
// menu portalled to the body and a dialog inside `.pt-viewer` stop competing by z-index; it costs
// 0 B and leaves the element where it is in the DOM, so every inherited token and every
// `.pt-viewer` selector keeps applying.
//
// The top layer orders by opening, newest on top. This module keeps the scale's order among the
// surfaces that are open: when a surface opens at layer L, every open surface above L is hidden and
// shown again in ascending order in the same task, so no frame passes between and nothing flickers.
// Within one layer the newest is on top, so a submenu sits over its parent with no `+ level`.
// `manual` keeps each surface's own dismiss code in charge (Escape, outside clicks, nested menus);
// dialogs keep their scrim, their Tab trap and `aria-modal`, and never call `showModal()`, which
// would make a menu or a snackbar raised from the dialog inert (C2).
//
// Where `showPopover` is absent (a browser under the floor of DESIGN.md question 12, or jsdom), the
// element stays in its DOM place with the scale's z-index, which is the old behaviour with ordered
// numbers. The manager is plain DOM; `useLayer` at the end is the React doorway to it.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

import { LAYERS } from '@turboslide/theme/scale';
import type { LayerName } from '@turboslide/theme/scale';

export type { LayerName } from '@turboslide/theme/scale';

/** An open surface the manager holds: its element, its layer, and when it opened. */
export type LayerEntry = { element: HTMLElement; layer: LayerName; opened: number };

/** The open surfaces in paint order, bottom first. */
let open: LayerEntry[] = [];
/** The elements this module showed in the top layer and has not hidden since. */
let shown = new WeakSet<HTMLElement>();
let clock = 0;

/** True when the element can enter the top layer (the Popover API, Chrome 114, Safari 17, Firefox 125). */
export function topLayerSupported(element?: HTMLElement): boolean {
  const target =
    element ?? (typeof HTMLElement === 'undefined' ? undefined : HTMLElement.prototype);
  return (
    target !== undefined &&
    typeof (target as Partial<HTMLElement>).showPopover === 'function' &&
    typeof (target as Partial<HTMLElement>).hidePopover === 'function'
  );
}

function show(element: HTMLElement): void {
  if (!topLayerSupported(element) || !element.isConnected) return;
  if (element.getAttribute('popover') !== 'manual') element.setAttribute('popover', 'manual');
  try {
    element.showPopover();
    shown.add(element);
  } catch {
    /* an element the browser refuses (a modal dialog, a detached node) keeps its DOM place */
  }
}

function hide(element: HTMLElement): void {
  if (!shown.has(element)) return;
  shown.delete(element);
  try {
    element.hidePopover();
  } catch {
    /* already hidden by the browser, for one when the element left the document */
  }
}

/** Ascending by layer, then by opening: the paint order the scale asks for. */
function byScale(a: LayerEntry, b: LayerEntry): number {
  return LAYERS[a.layer] - LAYERS[b.layer] || a.opened - b.opened;
}

/** Puts focus back on the element that held it before a reorder, when the reorder moved it. */
function keepFocus(focused: Element | null): void {
  if (focused instanceof HTMLElement && focused.isConnected && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
}

/**
 * Shows every open surface again in the scale's order. A full screen element enters the top layer
 * above every surface already in it: the show asks for full screen on the document's root as it
 * opens (`requestPresentFullscreen`), and the root then covered the show's own layer, its toolbar
 * and an open menu (read in Chromium: `elementFromPoint` over the toolbar answered the stage until
 * the toolbar was shown again). Run on every `fullscreenchange`, so the open surfaces sit above
 * the full screen element in their order, and again in their order when it leaves.
 */
function raiseOpen(): void {
  open = open.filter((entry) => entry.element.isConnected);
  if (open.length === 0) return;
  const focused = document.activeElement;
  for (const each of [...open].reverse()) hide(each.element);
  for (const each of open) show(each.element);
  keepFocus(focused);
}

let watchingFullscreen = false;

function watchFullscreen(): void {
  if (watchingFullscreen || typeof document === 'undefined') return;
  watchingFullscreen = true;
  document.addEventListener('fullscreenchange', raiseOpen);
}

/**
 * Opens a surface at a layer: writes `data-layer` and the scale's z-index, puts it in the top
 * layer above every open surface of its layer and below every open surface of a higher one, and
 * keeps focus where it was. Opening an open surface again moves it to the top of its layer.
 */
export function openLayer(element: HTMLElement, layer: LayerName): void {
  element.dataset.layer = layer;
  element.style.zIndex = String(LAYERS[layer]);
  open = open.filter((entry) => entry.element !== element && entry.element.isConnected);
  clock += 1;
  const entry: LayerEntry = { element, layer, opened: clock };
  const above = open.filter((each) => LAYERS[each.layer] > LAYERS[layer]).sort(byScale);
  const below = open.filter((each) => LAYERS[each.layer] <= LAYERS[layer]);
  open = [...below, entry, ...above];
  if (!topLayerSupported(element) || !element.isConnected) return;
  watchFullscreen();
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  for (const each of [...above].reverse()) hide(each.element);
  hide(element);
  show(element);
  for (const each of above) show(each.element);
  /* hiding a surface that held focus may move focus; the reorder must not */
  keepFocus(focused);
}

/**
 * Closes a surface: takes it out of the top layer and back to its DOM place (the `popover`
 * attribute leaves, so a surface its component keeps mounted is not hidden by the attribute's
 * user agent rule). `data-layer` and the z-index stay, so a surface that fades out keeps its order.
 */
export function closeLayer(element: HTMLElement): void {
  open = open.filter((entry) => entry.element !== element && entry.element.isConnected);
  hide(element);
  if (element.getAttribute('popover') === 'manual') element.removeAttribute('popover');
}

/** The open surfaces in paint order, bottom first (for tests and the layers rows' drivers). */
export function openLayers(): readonly LayerEntry[] {
  open = open.filter((entry) => entry.element.isConnected);
  return [...open];
}

/** Forgets every open surface without touching the DOM: for tests alone. */
export function resetLayersForTests(): void {
  open = [];
  shown = new WeakSet<HTMLElement>();
  clock = 0;
}

export type UseLayerOptions = {
  /** the layer of the scale the surface belongs to */
  layer: LayerName;
  /** false while the surface is closed; true when absent (the surface mounts open) */
  open?: boolean;
};

/**
 * The hook every floating surface uses: while `open` is true and the ref holds an element, the
 * element is in the top layer at its layer; on close or unmount it leaves. Runs in a layout effect,
 * so the surface never paints a frame outside its layer.
 */
export function useLayer(ref: RefObject<HTMLElement | null>, options: UseLayerOptions): void {
  const { layer, open: isOpen = true } = options;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!isOpen || element === null) return undefined;
    openLayer(element, layer);
    return () => closeLayer(element);
  }, [ref, layer, isOpen]);
}

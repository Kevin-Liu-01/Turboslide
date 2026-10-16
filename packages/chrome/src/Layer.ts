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
//
// Exit motion (the Glyphfield port, PLAN.md wave 2 item 7, from Glyphfield's useExitGhost.ts): a
// surface that asks for it (`exit` on useLayer: a menu, the search card, a dialog) closes at once,
// so focus, the accessibility tree, tests and automation see the closed state, and leaves an inert
// copy of its last frame in its place in the top layer while the copy's `[data-exiting]` animation
// plays (the surface's own sheet; opacity and transform at --pt-dur-leave). The copy has no ids,
// roles or control ids, sits under every surface opened since, and is removed on its animationend
// or after EXIT_COPY_MS. Reduced motion, a browser without Web Animations and a surface that is
// still in the document (reopened, or kept mounted while closed) leave no copy.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

import { LAYERS } from '@turboslide/theme/scale';
import type { LayerName } from '@turboslide/theme/scale';
import { EXIT_COPY_ATTRIBUTE, motionReduced } from '@turboslide/viewer/reduce-motion';

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
 * Puts a surface in the top layer at its place in the scale's order: above every open surface
 * that sorts before it and below every one that sorts after it, hiding those and showing them
 * again in the same task, and keeps focus where it was.
 */
function enter(element: HTMLElement, layer: LayerName, opened: number): LayerEntry {
  element.dataset.layer = layer;
  element.style.zIndex = String(LAYERS[layer]);
  const entry: LayerEntry = { element, layer, opened };
  open = [
    ...open.filter((each) => each.element !== element && each.element.isConnected),
    entry,
  ].sort(byScale);
  if (!topLayerSupported(element) || !element.isConnected) return entry;
  watchFullscreen();
  const above = open.filter((each) => byScale(each, entry) > 0);
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  for (const each of [...above].reverse()) hide(each.element);
  hide(element);
  show(element);
  for (const each of above) show(each.element);
  /* hiding a surface that held focus may move focus; the reorder must not */
  keepFocus(focused);
  return entry;
}

/**
 * Opens a surface at a layer: writes `data-layer` and the scale's z-index, puts it in the top
 * layer above every open surface of its layer and below every open surface of a higher one, and
 * keeps focus where it was. Opening an open surface again moves it to the top of its layer.
 * Returns the surface's entry, whose opening clock an exit copy takes (`leaveExitCopy`).
 */
export function openLayer(element: HTMLElement, layer: LayerName): LayerEntry {
  clock += 1;
  return enter(element, layer, clock);
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

/** The open surfaces in paint order, bottom first, without exit copies (for tests and the layers rows' drivers). */
export function openLayers(): readonly LayerEntry[] {
  open = open.filter((entry) => entry.element.isConnected);
  return open.filter((entry) => !entry.element.hasAttribute(EXIT_COPY_ATTRIBUTE));
}

/** How long an exit copy may stay when its animationend never comes: --pt-dur-leave (140 ms) and six frames. */
export const EXIT_COPY_MS = 240;

/**
 * What an exit copy drops from itself and every element inside it, so nothing finds it as the
 * surface: the ids and roles (focus, the accessibility tree, getByRole), the control, menu row and
 * preview ids every walk and spec row clicks by, the tab stops, and the names and links of the
 * accessible tree. No sheet keys a menu's, a dialog's or the search card's look on any of them.
 */
const COPY_DROPS = [
  'id',
  'role',
  'data-control',
  'data-menu-item',
  'data-preview',
  'tabindex',
  'autofocus',
  'popover',
  'aria-modal',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-activedescendant',
] as const;
const COPY_DROPS_SELECTOR = COPY_DROPS.map((name) => `[${name}]`).join(', ');

/** The last scroll offsets inside an open surface that asked for an exit, by element. */
type ScrollMarks = Map<Element, { top: number; left: number }>;

/**
 * Leaves an inert copy of a closed surface in its place while the copy's exit animation plays,
 * and returns it; returns null and leaves nothing when the surface is still in the document,
 * motion is reduced, the browser has no top layer or no Web Animations, or the copy's sheet gives
 * it no animation. The copy goes into the surface's parent, or the body when the parent left with
 * it (a menu's `.ts-menu-root`), and into the top layer at the closed surface's place in the
 * scale's order, so every surface opened since stays above it. `scrolled` puts the copy's lists
 * at the offsets the surface showed, since a clone starts at the top.
 */
function leaveExitCopy(
  element: HTMLElement,
  closed: LayerEntry,
  parent: Element | null,
  scrolled: ScrollMarks = new Map(),
): HTMLElement | null {
  if (
    element.isConnected ||
    !topLayerSupported(element) ||
    typeof element.getAnimations !== 'function' ||
    motionReduced()
  )
    return null;
  const copy = element.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll(COPY_DROPS_SELECTOR)])
    for (const name of COPY_DROPS) node.removeAttribute(name);
  copy.setAttribute(EXIT_COPY_ATTRIBUTE, '');
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  (parent?.isConnected === true ? parent : document.body).append(copy);
  /* read in the same task as the append, before any paint: no exit rule, no copy */
  if (copy.getAnimations().length === 0) {
    copy.remove();
    return null;
  }
  enter(copy, closed.layer, closed.opened);
  const remove = () => {
    if (!copy.isConnected) return;
    closeLayer(copy);
    copy.remove();
  };
  if (scrolled.size > 0) {
    const from = [element, ...element.querySelectorAll('*')];
    const to = [copy, ...copy.querySelectorAll('*')];
    from.forEach((node, index) => {
      const mark = scrolled.get(node);
      const target = to[index];
      if (mark === undefined || target === undefined) return;
      target.scrollTop = mark.top;
      target.scrollLeft = mark.left;
    });
  }
  copy.addEventListener('animationend', (event) => {
    if (event.target === copy) remove();
  });
  window.setTimeout(remove, EXIT_COPY_MS);
  return copy;
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
  /**
   * leaves an exit copy when the surface leaves the document as it closes (`leaveExitCopy`); the
   * surface's sheet draws the copy's `[data-exiting]` animation. False when absent.
   */
  exit?: boolean;
};

/**
 * The hook every floating surface uses: while `open` is true and the ref holds an element, the
 * element is in the top layer at its layer; on close or unmount it leaves. Runs in a layout effect,
 * so the surface never paints a frame outside its layer. With `exit`, the copy is made in a
 * microtask after the commit, when React has removed the element and before the browser paints.
 */
export function useLayer(ref: RefObject<HTMLElement | null>, options: UseLayerOptions): void {
  const { layer, open: isOpen = true, exit = false } = options;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!isOpen || element === null) return undefined;
    const parent = element.parentElement;
    const entry = openLayer(element, layer);
    if (!exit) return () => closeLayer(element);
    /* scroll offsets are read as they change, since an element React already removed reads 0 */
    const scrolled: ScrollMarks = new Map();
    const onScroll = (event: Event) => {
      if (event.target instanceof Element)
        scrolled.set(event.target, { top: event.target.scrollTop, left: event.target.scrollLeft });
    };
    element.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll, { capture: true });
      closeLayer(element);
      queueMicrotask(() => void leaveExitCopy(element, entry, parent, scrolled));
    };
  }, [ref, layer, isOpen, exit]);
}
